# -*- coding: utf-8 -*-
"""
导航站编辑器 - 图形化启动器 v5（白色高级主题 + 蓝紫渐变头部 + 渐变按钮 + 自定义标签栏）
双击运行即可启动本地服务器并打开浏览器编辑器

健壮性设计：
1. 单实例检测 - 已有实例在运行时直接打开浏览器，不报错
2. 端口冲突自动处理 - 端口被占用时自动清理卡死的残留进程
3. 备用端口 - 主端口不可用时自动尝试备用端口
4. 强制退出 - 关闭窗口时确保进程立即终止，不留残留
5. 配置持久化 - 用户设置保存到 launcher.json
"""

import os
import sys
import io
import json
import base64
import threading
import webbrowser
import time
import http.server
import socketserver
import functools
import socket
import traceback
import re
import urllib.parse

# 部署临时 zip 的「显示文件名」映射：临时磁盘名 -> 用户期望的下载文件名（不含扩展名）
# 进程级共享；每个请求的临时名唯一，并发安全。
_DEPLOY_NAMES = {}

def _sanitize_deploy_name(name):
    """清洗导出显示文件名（不含扩展名）：去除系统非法字符、限长，空则返 ''"""
    if not name:
        return ''
    s = str(name).strip()
    s = ''.join(ch if ch not in '\\/:*?"<>|' and ord(ch) >= 32 else '_' for ch in s)
    s = s.strip('. ')
    return s[:120] if s else ''


_ABS_BASE_TAG_RE = re.compile(r'<base\s+href=["\']https?://[^"\']*["\'][^>]*>', re.IGNORECASE)
_BASE_TAG_RE = re.compile(r'<base\b[^>]*>', re.IGNORECASE)
# 页面里写死的根绝对资源引用（如 href="/assets/...", src="/assets/...", url(/assets/...)），
# 部署到 GitHub Pages 子路径时同样会失效，打包时统一转成相对引用。
_ROOT_ABS_ASSET_RE = re.compile(
    r'((?:href|src)\s*=\s*["\'])/(assets/)',
    re.IGNORECASE
)
_ROOT_ABS_ASSET_URL_RE = re.compile(
    r'(url\(\s*["\']?)/(assets/)',
    re.IGNORECASE
)


def _portable_base_html(content, depth):
    """把部署 HTML 里写死的本地 base（如 http://127.0.0.1:9620/）替换为按文件层级可移植的相对 base，
    使打包/发布后的文件在 GitHub Pages 等任意站点（含子路径）下资源都能正确解析。
    depth=0（站点根目录，如 index.html / commit.html）时直接移除 base，让 ./assets/ 等相对引用
    按页面所在目录解析；子目录页面（footer/about.html、404/xxx.html）则补 ../ 层级。
    同时把 /assets/ 这类根绝对引用改写成相对引用，避免子路径部署失效。"""
    if not content or not isinstance(content, str):
        return content
    if depth <= 0:
        content = _ABS_BASE_TAG_RE.sub('', content)
    else:
        rel = '../' * depth
        content = _ABS_BASE_TAG_RE.sub(lambda m: '<base href="' + rel + '">', content)
        if not _BASE_TAG_RE.search(content):
            content = re.sub(r'(?i)(<head[^>]*>)', r'\1\n    <base href="' + rel + '">', content, count=1)
    # 子目录页面已有相对 base（指向站点根目录），/assets/ 统一改写成 ./assets/ 即可
    # （相对引用会基于 base 解析到站点根目录；绝对 /assets/ 会无视 base 导致子路径部署失效）。
    content = _ROOT_ABS_ASSET_RE.sub(lambda m: m.group(1) + './' + m.group(2), content)
    content = _ROOT_ABS_ASSET_URL_RE.sub(lambda m: m.group(1) + './' + m.group(2), content)
    # 历史残留链接修正：关于导航统一指向 footer/about.html，网站提交统一指向 footer/commit.html
    # （兼容旧版本生成的 index.html 里 href="./footer/" 或 href="commit.html" 这类写法）
    content = re.sub(r'(?i)(href=["\'])(?:\./)?footer/(["\'])', r'\1footer/about.html\2', content)
    content = re.sub(r'(?i)(href=["\'])(?:\./)?commit\.html(["\'"])', r'\1footer/commit.html\2', content)
    # 旧版本生成的 index.html 把“网站提交”菜单改成了回到顶部占位（仅该菜单带 target="_blank"），
    # 打包时按该特征还原为真实链接 footer/commit.html
    content = re.sub(
        r'(?i)href="javascript:void\(0\)" onclick="window\.scrollTo\(0,0\);return false" target="_blank" rel="noopener"',
        'href="footer/commit.html" target="_blank" rel="noopener"',
        content
    )
    # 旧版本生成的页面里残留的 custom-search.js 死引用（项目里并不存在该文件），打包时移除
    content = re.sub(
        r'(?i)<script[^>]*src=["\'](?:\./)?assets/js/custom-search\.js["\'][^>]*>\s*</script>',
        '',
        content
    )
    return content


# 部署/打包时排除的开发、编辑器与本地私有目录/文件（两个收集流程共用，避免重复定义）
DEPLOY_EXCLUDE_PREFIX = {
    '.git', '.workbuddy', '.playwright-cli', '__pycache__', 'admin', 'lib',
    'NavEditor.exe', 'NavEditor_pending.exe', 'NavEditor.spec', 'launcher.py', 'launcher.json',
    'app.js', 'app_icon.ico', 'editor.html', 'make_icon.py', 'nul',
    'styles.css', 'template.js', 'dev_launch.bat', 'deploy.zip',
    'build', 'dist',
    'template',  # 模板仅用于编辑器内可视化编辑，不参与部署/导出（导出用 footer/about.html）
    # 以下均为本地工作数据/私有数据，绝不能进入部署包：
    'password',  # 账号凭证（Github/cloudflare 等 token），仅本地同步用
    'backups',   # 编辑自动备份
    'web',       # 各站点/版本的工作副本与部署目录（部署内容按当前版本 deploy 组单独收集）
    'footer',    # 编辑器根 footer 工作文件夹（部署用 web/<site>/<version>/deploy1/footer）
}
DEPLOY_EXCLUDE_FILE = {'.gitignore', 'README.md', 'Readme-en.md', 'deploy.zip', '.about_template', 'launcher_startup.log'}
DEPLOY_EXCLUDE_SUBPATH = {
    'assets/fontawesome-5.15.4/js/',
    'assets/fontawesome-5.15.4/less/',
    'assets/fontawesome-5.15.4/scss/',
    'assets/fontawesome-5.15.4/metadata/',
    'assets/fontawesome-5.15.4/sprites/',
    'assets/fontawesome-5.15.4/svgs/',
}
DEPLOY_EXCLUDE_SUBFILE = {
    'assets/fontawesome-5.15.4/attribution.js',
    'assets/fontawesome-5.15.4/LICENSE.txt',
}
import subprocess
import math
import tkinter as tk
from tkinter import ttk, messagebox
from tkinter import font as tkfont

# ---- 关键修复：--noconsole 模式下 sys.stdout/stderr 为 None，
# ---- http.server 会往 stderr 写日志导致崩溃，必须重定向
if sys.stdout is None:
    sys.stdout = io.StringIO()
if sys.stderr is None:
    sys.stderr = io.StringIO()

# ---- 启动诊断日志（exe 为 --noconsole，异常会被静默吞掉，落到这里便于排查）----
_STARTUP_LOG = os.path.join(
    os.path.dirname(os.path.abspath(sys.argv[0])) if getattr(sys, 'frozen', False)
    else os.path.dirname(os.path.abspath(__file__)),
    'launcher_startup.log'
)

def _startup_log(msg):
    """追加一行启动诊断日志（不抛异常，避免影响主流程）"""
    try:
        ts = time.strftime('%m-%d %H:%M:%S')
        with open(_STARTUP_LOG, 'a', encoding='utf-8') as _f:
            _f.write('[%s] %s\n' % (ts, msg))
    except Exception:
        pass

def _global_excepthook(etype, exc, tb):
    """全局未捕获异常：写入启动日志，并尝试弹窗提示"""
    try:
        _startup_log('UNCAUGHT EXCEPTION:\n' + ''.join(traceback.format_exception(etype, exc, tb)))
    except Exception:
        pass
    try:
        root = tk._default_root
        if root is not None:
            messagebox.showerror('程序异常', '%s: %s\n\n详细记录见 launcher_startup.log' % (etype.__name__, exc))
    except Exception:
        pass

sys.excepthook = _global_excepthook

# 默认端口 + 备用端口列表（主端口被占用时自动尝试）
DEFAULT_PORT_CANDIDATES = [9527, 9528, 9529, 9530, 9531]
ACTUAL_PORT = None  # 实际使用的端口（启动后赋值）

# Windows 下 subprocess 需要 CREATE_NO_WINDOW 避免 --noconsole 模式弹黑窗
CREATE_NO_WINDOW = 0x08000000 if sys.platform == 'win32' else 0

# ============================================================
# 服务器 / 本地部署（账号类型 server）辅助函数
# ============================================================

class DeployError(Exception):
    """部署失败（含详细原因）"""


def _dl(logs, level, text):
    """向部署日志追加一行：level ∈ info / ok / warn / error"""
    if isinstance(logs, list):
        logs.append({'level': level, 'text': text})


def _deploy_validate_rel(rel):
    """校验部署相对路径，返回规范化（无前导斜杠）路径"""
    rel = (rel or '').replace('\\', '/').strip('/')
    parts = [p for p in rel.split('/') if p]
    if not parts or '..' in parts or rel.startswith('//'):
        raise DeployError('非法文件路径: %s' % (rel or '<空>'))
    return '/'.join(parts)


def _run_win_script(script, logs, label):
    """在本地 Windows 上执行 PowerShell 脚本，输出详细日志；非零退出码抛错"""
    _dl(logs, 'info', '【%s】开始执行……' % label)
    try:
        proc = subprocess.run(
            ['powershell', '-NoProfile', '-NonInteractive', '-Command', script],
            capture_output=True, text=True, timeout=600,
            encoding='utf-8', errors='replace', creationflags=CREATE_NO_WINDOW
        )
    except subprocess.TimeoutExpired:
        raise DeployError('%s 执行超时（超过 600 秒）' % label)
    except Exception as e:
        raise DeployError('%s 无法启动：%s' % (label, e))
    out = (proc.stdout or '').strip()
    err = (proc.stderr or '').strip()
    if out:
        for line in out.splitlines():
            _dl(logs, 'info', '[%s] %s' % (label, line))
    if err:
        for line in err.splitlines():
            _dl(logs, 'error', '[%s] %s' % (label, line))
    if proc.returncode != 0:
        raise DeployError('%s 执行失败（退出码 %d）：%s' % (label, proc.returncode, (err or out or '无任何输出')))
    _dl(logs, 'ok', '【%s】执行成功' % label)


def _deploy_local(project_dir, payload, logs):
    """本地部署：把文件写入目标目录，按需执行 PowerShell 部署前后脚本"""
    acc = payload.get('account') or {}
    target = (acc.get('localPath') or '').strip()
    if not target:
        raise DeployError('未设置本地部署目录：请在账号设置中填写「本地站点根目录」。')
    target = os.path.abspath(target)
    root = os.path.abspath(project_dir)
    if target == root:
        raise DeployError('部署目录不能是 NavEditor 程序目录本身，请选择其它文件夹（如 nginx 的 html 目录）。')
    for forbidden in ('web', 'password', 'template', 'backups', 'build', 'dist', 'lib', 'admin', 'footer', 'assets'):
        fp = os.path.join(root, forbidden)
        if target == fp or target.startswith(fp + os.sep):
            raise DeployError('部署目录不能位于程序内部目录（%s/）中，请选择独立的站点根目录。' % forbidden)
    if not os.path.isdir(target):
        try:
            os.makedirs(target, exist_ok=True)
            _dl(logs, 'warn', '目标目录不存在，已自动创建：%s' % target)
        except Exception as e:
            raise DeployError('无法创建本地部署目录 %s：%s' % (target, e))
    _dl(logs, 'info', '本地部署目录：%s' % target)

    pre = (acc.get('localPreScript') or '').strip()
    if pre:
        _run_win_script(pre, logs, '部署前脚本')

    files = payload.get('files') or []
    written = 0
    for f in files:
        if not isinstance(f, dict):
            continue
        rel = _deploy_validate_rel(f.get('path'))
        abs_path = os.path.join(target, *rel.split('/'))
        d = os.path.dirname(abs_path)
        if d and not os.path.isdir(d):
            try:
                os.makedirs(d, exist_ok=True)
            except Exception as e:
                raise DeployError('无法创建目录 %s：%s' % (d, e))
        content = f.get('content') or ''
        try:
            if f.get('binary'):
                raw = base64.b64decode(content)
                with open(abs_path, 'wb') as fp:
                    fp.write(raw)
            else:
                with open(abs_path, 'w', encoding='utf-8') as fp:
                    fp.write(content)
        except Exception as e:
            raise DeployError('写入文件失败 %s：%s' % (rel, e))
        written += 1
        _dl(logs, 'ok', '已写入：%s' % rel)
    _dl(logs, 'info', '共写入 %d 个文件' % written)

    for rel in (payload.get('deleteFiles') or []):
        rel2 = _deploy_validate_rel(rel)
        abs_path = os.path.join(target, *rel2.split('/'))
        try:
            if os.path.isfile(abs_path):
                os.remove(abs_path)
                _dl(logs, 'warn', '已删除旧文件：%s' % rel2)
            elif os.path.isdir(abs_path):
                import shutil
                shutil.rmtree(abs_path)
                _dl(logs, 'warn', '已删除旧目录：%s' % rel2)
        except Exception as e:
            _dl(logs, 'warn', '删除旧文件失败 %s：%s' % (rel2, e))

    post = (acc.get('localPostScript') or '').strip()
    if post:
        _run_win_script(post, logs, '部署后脚本')
    return True


def _remote_mkdirs(sftp, path):
    """递归创建远端目录（/a/b/c）"""
    parts = [p for p in path.replace('\\', '/').split('/') if p]
    cur = '/' if path.replace('\\', '/').startswith('/') else ''
    for p in parts:
        cur = (cur.rstrip('/') + '/' + p) if cur else p
        try:
            sftp.stat(cur)
        except IOError:
            try:
                sftp.mkdir(cur)
            except IOError:
                try:
                    sftp.stat(cur)
                except IOError as e:
                    raise DeployError('无法在服务器创建目录 %s：%s' % (cur, e))


def _load_ssh_key(private_key, key_path):
    """解析私钥（支持 RSA / Ed25519 / ECDSA），返回 paramiko key 对象"""
    import paramiko
    if key_path and key_path.strip():
        kp = os.path.abspath(key_path.strip())
        if not os.path.isfile(kp):
            raise DeployError('私钥文件不存在：%s' % kp)
        for cls in (paramiko.RSAKey, paramiko.Ed25519Key, paramiko.ECDSAKey):
            try:
                return cls.from_private_key_file(kp)
            except Exception:
                continue
        raise DeployError('无法解析私钥文件 %s（支持 RSA / Ed25519 / ECDSA）' % kp)
    if private_key and private_key.strip():
        buf = io.StringIO(private_key)
        for cls in (paramiko.RSAKey, paramiko.Ed25519Key, paramiko.ECDSAKey):
            try:
                buf.seek(0)
                return cls.from_private_key(buf)
            except Exception:
                continue
        raise DeployError('无法解析粘贴的私钥内容（支持 RSA / Ed25519 / ECDSA）')
    raise DeployError('已选择密钥认证，但未填写私钥内容或私钥文件路径。')


def _deploy_nginx(payload, logs, test_only=False):
    """服务器部署（nginx）：SSH 连接 → SFTP 上传 → 执行远程命令；输出详细日志"""
    acc = payload.get('account') or {}
    host = (acc.get('host') or '').strip()
    if not host:
        raise DeployError('未填写服务器主机地址（IP 或域名）。')
    try:
        port = int(acc.get('port') or 22)
    except (TypeError, ValueError):
        raise DeployError('SSH 端口无效：%r' % (acc.get('port'),))
    username = (acc.get('username') or '').strip()
    if not username:
        raise DeployError('未填写服务器登录用户名（如 root / ubuntu）。')
    password = acc.get('password') or ''
    auth_method = acc.get('authMethod') or 'password'
    private_key = acc.get('privateKey') or ''
    key_path = acc.get('privateKeyPath') or ''
    remote_path = (acc.get('remotePath') or '').strip().replace('\\', '/').rstrip('/')
    if not remote_path:
        remote_path = '/var/www/html'  # nginx 常用默认站点根目录；留空时使用

    try:
        import paramiko
    except ImportError:
        raise DeployError('当前程序未内置 SSH 库（paramiko），无法连接服务器。请使用最新版 NavEditor.exe，或改用「本地部署」。')

    _dl(logs, 'info', '正在连接服务器 %s:%s（用户 %s）……' % (host, port, username))
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        kwargs = {
            'hostname': host, 'port': port, 'username': username,
            'timeout': 15, 'banner_timeout': 15, 'auth_timeout': 15,
            'look_for_keys': False, 'allow_agent': False,
        }
        if auth_method == 'key':
            kwargs['pkey'] = _load_ssh_key(private_key, key_path)
        else:
            if not password:
                raise DeployError('未填写服务器登录密码（或请改用密钥认证）。')
            kwargs['password'] = password
        client.connect(**kwargs)
    except DeployError:
        raise
    except paramiko.AuthenticationException:
        raise DeployError('SSH 登录认证失败：用户名或密码/私钥不正确（host=%s port=%s user=%s）。请核对账号设置中的登录凭据。' % (host, port, username))
    except paramiko.SSHException as e:
        raise DeployError('SSH 握手失败：%s（服务器可能禁用了密码登录，请改用密钥认证；或服务器未开放 SSH 端口）' % e)
    except socket.timeout:
        raise DeployError('连接服务器超时：%s:%s。请检查主机地址、端口、安全组/防火墙是否放行。' % (host, port))
    except socket.error as e:
        raise DeployError('无法连接服务器 %s:%s：%s（请检查主机地址、端口与网络连通性）' % (host, port, e))
    except Exception as e:
        raise DeployError('SSH 连接异常：%s' % e)
    _dl(logs, 'ok', 'SSH 连接成功：%s@%s:%s' % (username, host, port))

    try:
        sftp = client.open_sftp()
        try:
            if remote_path:
                _remote_mkdirs(sftp, remote_path)
            if test_only:
                _dl(logs, 'ok', '服务器连通性检查通过，远程目录：%s' % (remote_path or '<未设置>'))
                return True
            files = payload.get('files') or []
            written = 0
            for f in files:
                if not isinstance(f, dict):
                    continue
                rel = _deploy_validate_rel(f.get('path'))
                rp = remote_path + '/' + rel
                _remote_mkdirs(sftp, '/'.join(rp.split('/')[:-1]) or remote_path)
                content = f.get('content') or ''
                raw = base64.b64decode(content) if f.get('binary') else content.encode('utf-8')
                with sftp.open(rp, 'wb') as fp:
                    fp.write(raw)
                written += 1
                _dl(logs, 'ok', '已上传：%s' % rel)
            _dl(logs, 'info', '共上传 %d 个文件到 %s' % (written, remote_path))
            for rel in (payload.get('deleteFiles') or []):
                rel2 = _deploy_validate_rel(rel)
                rp = remote_path + '/' + rel2
                try:
                    sftp.remove(rp)
                    _dl(logs, 'warn', '已删除远端旧文件：%s' % rel2)
                except IOError:
                    _dl(logs, 'warn', '远端旧文件不存在，跳过删除：%s' % rel2)
        finally:
            try:
                sftp.close()
            except Exception:
                pass

        command = (payload.get('command') or acc.get('remoteCommand') or '').strip()
        if command and not test_only:
            _dl(logs, 'info', '在服务器执行命令：%s' % command)
            try:
                stdin, stdout, stderr = client.exec_command(command, timeout=600)
                out = (stdout.read() or b'').decode('utf-8', 'replace').strip()
                err = (stderr.read() or b'').decode('utf-8', 'replace').strip()
                code = stdout.channel.recv_exit_status()
            except Exception as e:
                raise DeployError('远程命令执行异常：%s' % e)
            if out:
                for line in out.splitlines():
                    _dl(logs, 'info', '[服务器] ' + line)
            if err:
                for line in err.splitlines():
                    _dl(logs, 'error', '[服务器] ' + line)
            if code != 0:
                raise DeployError('远程命令执行失败（退出码 %d）：%s' % (code, (err or out or '无任何输出')))
            _dl(logs, 'ok', '远程命令执行成功（退出码 0）')
        return True
    finally:
        try:
            client.close()
        except Exception:
            pass

# ============================================================
# 配色方案 — 深色高级主题（深蓝灰底 + 蓝紫渐变强调）
# ============================================================
COLORS = {
    'bg':          '#f1f5f9',  # 主背景：冷浅灰
    'bg_elevated': '#ffffff',  # 抬升层：白色卡片 / 面板
    'bg_surface':  '#ffffff',  # 表面层
    'bg_inset':    '#f8fafc',  # 内嵌区（极浅灰，输入框底）
    'border':      '#e2e8f0',  # 边框色（浅）
    'border_soft': '#f1f5f9',  # 柔和分割线
    'text':        '#1e293b',  # 主文字（深墨）
    'text_dim':    '#64748b',  # 次要文字
    'text_mute':   '#94a3b8',  # 弱化文字
    'accent':      '#6366f1',  # 主强调：靛蓝紫
    'accent_soft': '#818cf8',  # 强调亮态
    'success':     '#10b981',  # 成功绿（翡翠）
    'danger':      '#ef4444',  # 危险红
    'warning':     '#f59e0b',  # 警告琥珀
    'purple':      '#a855f7',  # 紫色
    'header_from': '#4f46e5',  # 头部渐变起：靛蓝
    'header_to':   '#7c3aed',  # 头部渐变终：紫
    'header_text': '#ffffff',  # 头部文字
    'disabled':    '#cbd5e1',  # 禁用态灰（浅）
    'chip':        '#e2e8f0',  # 药丸按钮底（浅灰）
    'chip_text':   '#475569',  # 药丸按钮文字（深灰）
    'accent_tint': '#eef2ff',  # 强调浅底（标签选中胶囊/高亮）
}

# ============================================================
# 主题方案 — light（浅色精致）/ dark（深色专业）
# COLORS 为可变全局字典；切换主题时 COLORS.clear()+update() 即可，
# 所有引用 COLORS[...] 的控件在重建 UI 后自动套用新配色。
# ============================================================
THEMES = {
    'light': {
        'bg': '#f1f5f9', 'bg_elevated': '#ffffff', 'bg_surface': '#ffffff',
        'bg_inset': '#f8fafc', 'border': '#e2e8f0', 'border_soft': '#f1f5f9',
        'text': '#1e293b', 'text_dim': '#64748b', 'text_mute': '#94a3b8',
        'accent': '#6366f1', 'accent_soft': '#818cf8', 'success': '#10b981',
        'danger': '#ef4444', 'warning': '#f59e0b', 'purple': '#a855f7',
        'header_from': '#4f46e5', 'header_to': '#7c3aed', 'header_text': '#ffffff',
        'disabled': '#cbd5e1', 'chip': '#e2e8f0', 'chip_text': '#475569',
        'accent_tint': '#eef2ff',
    },
    'dark': {
        'bg': '#0f172a', 'bg_elevated': '#1e293b', 'bg_surface': '#1e293b',
        'bg_inset': '#0b1220', 'border': '#334155', 'border_soft': '#1e293b',
        'text': '#e2e8f0', 'text_dim': '#94a3b8', 'text_mute': '#64748b',
        'accent': '#818cf8', 'accent_soft': '#a5b4fc', 'success': '#10b981',
        'danger': '#f87171', 'warning': '#fbbf24', 'purple': '#c084fc',
        'header_from': '#4338ca', 'header_to': '#6d28d9', 'header_text': '#ffffff',
        'disabled': '#475569', 'chip': '#334155', 'chip_text': '#cbd5e1',
        'accent_tint': '#312e81',
    },
}

def set_theme(name):
    """切换主题：更新可变全局 COLORS（浅/深共用同一组键）。"""
    pal = THEMES.get(name, THEMES['light'])
    COLORS.clear()
    COLORS.update(pal)

# 配置文件路径
CONFIG_PATH = os.path.join(
    os.path.dirname(os.path.abspath(sys.argv[0])) if getattr(sys, 'frozen', False)
    else os.path.dirname(os.path.abspath(__file__)),
    'launcher.json'
)

DEFAULT_CONFIG = {
    'custom_port': 0,           # 0 = 自动选择（9527/9528/...）
    'startup_delay_ms': 800,    # 启动延迟（毫秒），让窗口先渲染
    'auto_open_browser': True,  # 启动后自动打开浏览器
    'auto_open_editor': True,   # 启动后自动打开编辑器（而非导航站）
    'bind_address': '127.0.0.1',
    'theme': 'light',              # 界面主题：light / dark
    'minimize_to_tray': False,     # 关闭窗口时最小化到托盘（轻量实现）
    'default_page': 'editor',      # 启动/打开时默认页：editor / preview / about
    'show_server_log': True,       # 控制台显示服务器访问日志
    'log_to_file': False,
}


def load_config():
    """从 launcher.json 加载配置，不存在则用默认值"""
    try:
        if os.path.isfile(CONFIG_PATH):
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                cfg = json.load(f)
            # 补全缺失字段
            for k, v in DEFAULT_CONFIG.items():
                if k not in cfg:
                    cfg[k] = v
            return cfg
    except Exception:
        pass
    return dict(DEFAULT_CONFIG)


def save_config(cfg):
    """保存配置到 launcher.json"""
    try:
        with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
            json.dump(cfg, f, indent=2, ensure_ascii=False)
        return True
    except Exception:
        return False


def get_project_dir():
    """获取项目根目录（index.html 所在目录）"""
    if getattr(sys, 'frozen', False):
        # PyInstaller 单文件运行时 sys.executable 指向临时解压目录 _MEIxxxxxx，
        # 必须使用 sys.argv[0] 才能定位到用户双击的原始 exe 所在目录。
        base = os.path.dirname(os.path.abspath(sys.argv[0]))
    else:
        base = os.path.dirname(os.path.abspath(__file__))
    return base


def is_port_responding(port, bind='127.0.0.1'):
    """检测端口是否有 HTTP 服务正常响应（用 http.client 避免 urllib 代理/环境差异导致的超时）"""
    try:
        import http.client
        conn = http.client.HTTPConnection(bind, port, timeout=0.3)
        conn.request('GET', '/editor.html')
        resp = conn.getresponse()
        conn.close()
        return 100 <= resp.status < 500
    except Exception:
        return False


def is_port_listening(port, bind='127.0.0.1'):
    """检测端口是否有进程在监听（不论是否响应）。超时 0.15s，避免关闭端口时长时间阻塞。"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.15)
        return s.connect_ex((bind, port)) == 0


def kill_port_holder(port, bind='127.0.0.1'):
    """杀掉占用指定端口的进程（仅 Windows）"""
    if sys.platform != 'win32':
        return False
    try:
        result = subprocess.run(
            ["netstat", "-ano"],
            capture_output=True, text=True, timeout=5,
            creationflags=CREATE_NO_WINDOW
        )
        killed_any = False
        current_pid = os.getpid()
        # Windows 上 netstat 的 0.0.0.0:PORT 会匹配 127.0.0.1:PORT
        for line in result.stdout.splitlines():
            line = line.strip()
            if f":{port}" in line and "LISTENING" in line.upper():
                parts = line.split()
                pid_str = parts[-1]
                if pid_str.isdigit():
                    pid = int(pid_str)
                    if pid != current_pid:
                        subprocess.run(
                            ["taskkill", "/F", "/PID", str(pid)],
                            capture_output=True, timeout=5,
                            creationflags=CREATE_NO_WINDOW
                        )
                        killed_any = True
        if killed_any:
            time.sleep(0.3)
        return killed_any
    except Exception:
        return False


# ============================================================
# 文件式站点/版本历史存储管理
# ============================================================
class SiteStorage:
    """将多站点（profile）与版本历史持久化到磁盘文件夹。

    目录结构：
      web/
        <site_id>/                  一个站点
          setting                   站点设置（含当前编辑数据）
          <version_id>/             一个版本历史
            setting                 版本设置（含编辑数据快照）
            deploy1/                部署文件组1
              index.html
              footer/
              assets/
              404.html
            deploy2/                预留扩展
            ...
    """

    SETTING_FILE = 'setting'

    def __init__(self, directory):
        self.directory = os.path.abspath(directory)
        self.web_dir = os.path.abspath(os.path.join(self.directory, 'web'))
        os.makedirs(self.web_dir, exist_ok=True)

    def _web_path(self, *parts):
        """返回 web 目录下安全子路径，禁止路径穿越。"""
        target = os.path.abspath(os.path.join(self.web_dir, *parts))
        if target != self.web_dir and not target.startswith(self.web_dir + os.sep):
            raise ValueError('路径越界: %s' % os.path.join(*parts))
        return target

    @staticmethod
    def _sanitize_id(text):
        """把任意文本转成可作文件夹名的安全 ID。"""
        if not text:
            return ''
        s = str(text).strip()
        # 保留中文、英文、数字、下划线、连字符；其余替换为下划线
        s = ''.join(ch if ('\u4e00' <= ch <= '\u9fff') or ch.isalnum() or ch in '_-' else '_' for ch in s)
        s = s.strip('_.')
        # 去掉连续下划线
        while '__' in s:
            s = s.replace('__', '_')
        return s[:80]

    def _unique_id(self, base_id, existing):
        """在 existing 集合中生成不重复的 ID。"""
        if base_id not in existing:
            return base_id
        for i in range(2, 10000):
            candidate = '%s_%d' % (base_id, i)
            if candidate not in existing:
                return candidate
        # 最终回退到时间戳
        return '%s_%d' % (base_id, int(time.time() * 1000))

    @staticmethod
    def _safe_rename_dir(src, dst):
        """Windows 友好的目录重命名。

        直接用 os.rename 重命名目录时，若源目录被其他进程持有句柄
        （如资源管理器打开了该目录、杀软实时扫描、或本进程 HTTP 服务正在读取），
        Windows 会报 [WinError 5] 拒绝访问。这里先重试几次（应对短暂锁），
        失败再改为「复制到新名 + 删除旧目录」，确保重命名最终成功。
        """
        import shutil
        src = os.path.abspath(src)
        dst = os.path.abspath(dst)
        if src == dst:
            return
        if os.path.exists(dst):
            raise FileExistsError('目标文件夹已存在: ' + dst)
        last_err = None
        # 策略1：原地重命名，带重试（应对杀软/索引服务等短暂锁）
        for _ in range(6):
            try:
                os.rename(src, dst)
                return
            except OSError as e:
                last_err = e
                time.sleep(0.3)
        # 策略2：复制后删除（应对目录被资源管理器等持有句柄、无法原地重命名）
        try:
            shutil.copytree(src, dst)
        except Exception as e:
            # 清理可能残留的不完整目标目录，避免脏数据
            try:
                if os.path.exists(dst):
                    shutil.rmtree(dst)
            except Exception:
                pass
            raise e
        # 新目录已就绪，尝试清理旧目录；失败不致命（新目录已经可用）
        for _ in range(6):
            try:
                shutil.rmtree(src)
                break
            except OSError:
                time.sleep(0.3)

    @staticmethod
    def _read_json(path):
        if not os.path.isfile(path):
            return None
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return None

    @staticmethod
    def _write_json(path, data):
        d = os.path.dirname(path)
        if d and not os.path.exists(d):
            os.makedirs(d, exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    # ---------- 站点 ----------
    def list_sites(self):
        sites = []
        if not os.path.isdir(self.web_dir):
            return sites
        for name in sorted(os.listdir(self.web_dir)):
            path = os.path.join(self.web_dir, name)
            if not os.path.isdir(path):
                continue
            setting = self._read_json(os.path.join(path, self.SETTING_FILE)) or {}
            sites.append({
                'id': name,
                'name': setting.get('name') or name,
                'createdAt': setting.get('createdAt') or 0,
                'updatedAt': setting.get('updatedAt') or 0,
            })
        # 按更新时间倒序
        sites.sort(key=lambda x: x['updatedAt'], reverse=True)
        # 应用自定义站点排序（web/site_order.json），未在排序表中的站点追加到末尾
        try:
            order = self._read_json(os.path.join(self.web_dir, 'site_order.json')) or []
            if isinstance(order, list) and order:
                by_id = {s['id']: s for s in sites}
                ordered = [by_id[i] for i in order if i in by_id]
                seen = {s['id'] for s in ordered}
                ordered += [s for s in sites if s['id'] not in seen]
                return ordered
        except Exception:
            pass
        return sites

    def save_site_order(self, ids):
        """保存站点自定义排序（写 web/site_order.json，按 id 列表顺序）。"""
        if not os.path.isdir(self.web_dir):
            os.makedirs(self.web_dir, exist_ok=True)
        self._write_json(os.path.join(self.web_dir, 'site_order.json'),
                         [str(i) for i in (ids or [])])
        return True

    def _update_site_order(self, old_id, new_id=None):
        """站点重命名/删除后同步自定义排序：new_id 为 None 表示移除 old_id。"""
        order_path = os.path.join(self.web_dir, 'site_order.json')
        try:
            order = self._read_json(order_path) or []
        except Exception:
            order = []
        if not isinstance(order, list):
            order = []
        if new_id is None:
            order = [str(i) for i in order if str(i) != str(old_id)]
        else:
            order = [str(new_id) if str(i) == str(old_id) else str(i) for i in order]
        self._write_json(order_path, order)

    def create_site(self, name, data=None):
        base = self._sanitize_id(name) or 'site'
        existing = {s['id'] for s in self.list_sites()}
        site_id = self._unique_id(base, existing)
        site_path = self._web_path(site_id)
        os.makedirs(site_path, exist_ok=True)
        # 同时创建默认模板文件夹
        self.ensure_default_template_dir(site_id)
        now = int(time.time() * 1000)
        setting = {
            'id': site_id,
            'name': name or site_id,
            'createdAt': now,
            'updatedAt': now,
            'data': data if isinstance(data, dict) else {},
        }
        self._write_json(os.path.join(site_path, self.SETTING_FILE), setting)
        return site_id

    def rename_site(self, site_id, new_name):
        site_path = self._web_path(site_id)
        if not os.path.isdir(site_path):
            raise FileNotFoundError('站点不存在')
        setting = self._read_json(os.path.join(site_path, self.SETTING_FILE)) or {}
        setting['name'] = new_name
        setting['updatedAt'] = int(time.time() * 1000)
        # 同步重命名磁盘上的站点文件夹（站点 id 即文件夹名）
        base = self._sanitize_id(new_name) or 'site'
        existing = {s['id'] for s in self.list_sites() if s['id'] != site_id}
        new_id = self._unique_id(base, existing)
        new_path = self._web_path(new_id)
        if new_id != site_id:
            if os.path.exists(new_path):
                raise FileExistsError('目标站点文件夹已存在: ' + new_id)
            self._safe_rename_dir(site_path, new_path)
            setting['id'] = new_id
            self._write_json(os.path.join(new_path, self.SETTING_FILE), setting)
            self._update_site_order(site_id, new_id)
        else:
            self._write_json(os.path.join(site_path, self.SETTING_FILE), setting)
        return new_id

    def delete_site(self, site_id):
        site_path = self._web_path(site_id)
        if not os.path.isdir(site_path):
            return False
        import shutil
        shutil.rmtree(site_path)
        self._update_site_order(site_id)
        return True

    def read_site_setting(self, site_id):
        site_path = self._web_path(site_id)
        if not os.path.isdir(site_path):
            return None
        return self._read_json(os.path.join(site_path, self.SETTING_FILE))

    def write_site_setting(self, site_id, setting):
        site_path = self._web_path(site_id)
        if not os.path.isdir(site_path):
            raise FileNotFoundError('站点不存在')
        setting['id'] = site_id
        setting['updatedAt'] = int(time.time() * 1000)
        self._write_json(os.path.join(site_path, self.SETTING_FILE), setting)

    # ---------- 版本 ----------
    def list_versions(self, site_id):
        site_path = self._web_path(site_id)
        if not os.path.isdir(site_path):
            return []
        versions = []
        for name in sorted(os.listdir(site_path)):
            path = os.path.join(site_path, name)
            if not os.path.isdir(path) or name == self.SETTING_FILE:
                continue
            setting = self._read_json(os.path.join(path, self.SETTING_FILE)) or {}
            deploy_groups = []
            for child in sorted(os.listdir(path)):
                child_path = os.path.join(path, child)
                if os.path.isdir(child_path) and child.startswith('deploy'):
                    deploy_groups.append(child)
            versions.append({
                'id': name,
                'name': setting.get('name') or name,
                'note': setting.get('note') or setting.get('name') or name,
                'timestamp': setting.get('timestamp') or 0,
                'starred': bool(setting.get('starred')),
                'deployGroups': deploy_groups,
                'data': setting.get('data') or {},
                # 版本与账号的同步关联：{ accountId: { accountId, accountName, type, lastSyncAt, dataHash } }
                # 只记录发布过该版本的账号（账号按稳定 id 关联，重命名不丢历史）
                'syncInfo': setting.get('syncInfo') or {},
            })
        # 收藏优先，然后时间倒序
        versions.sort(key=lambda x: (not x['starred'], -x['timestamp']))
        return versions

    def create_version(self, site_id, name=None):
        site_path = self._web_path(site_id)
        if not os.path.isdir(site_path):
            raise FileNotFoundError('站点不存在')
        existing = {v['id'] for v in self.list_versions(site_id)}
        base = self._sanitize_id(name) or 'history'
        # 文件夹名仅使用可修改的版本名称（不带保存日期），重名时由 _unique_id 追加序号
        base_id = base
        version_id = self._unique_id(base_id, existing)
        version_path = self._web_path(site_id, version_id)
        os.makedirs(version_path, exist_ok=True)
        now = int(time.time() * 1000)
        setting = {
            'id': version_id,
            'name': name or version_id,
            'note': name or version_id,
            'timestamp': now,
            'starred': False,
            'data': {},
        }
        self._write_json(os.path.join(version_path, self.SETTING_FILE), setting)
        return version_id

    def rename_version(self, site_id, version_id, new_name):
        version_path = self._web_path(site_id, version_id)
        if not os.path.isdir(version_path):
            raise FileNotFoundError('版本不存在')
        setting = self._read_json(os.path.join(version_path, self.SETTING_FILE)) or {}
        setting['name'] = new_name
        setting['note'] = new_name
        self._write_json(os.path.join(version_path, self.SETTING_FILE), setting)
        return version_id

    def delete_version(self, site_id, version_id):
        version_path = self._web_path(site_id, version_id)
        if not os.path.isdir(version_path):
            return False
        import shutil
        shutil.rmtree(version_path)
        return True

    def read_version_setting(self, site_id, version_id):
        version_path = self._web_path(site_id, version_id)
        if not os.path.isdir(version_path):
            return None
        return self._read_json(os.path.join(version_path, self.SETTING_FILE))

    def write_version_setting(self, site_id, version_id, setting):
        site_path = self._web_path(site_id)
        version_path = self._web_path(site_id, version_id)
        if not os.path.isdir(version_path):
            raise FileNotFoundError('版本不存在')
        # 如果 name/note 变化，同步重命名版本文件夹
        new_name = setting.get('name') or setting.get('note') or ''
        new_id = self._sanitize_id(new_name) or version_id
        if new_id != version_id:
            existing = {name for name in os.listdir(site_path)
                        if os.path.isdir(os.path.join(site_path, name)) and name != self.SETTING_FILE}
            existing.discard(version_id)
            new_id = self._unique_id(new_id, existing)
        if new_id != version_id:
            new_version_path = self._web_path(site_id, new_id)
            if os.path.exists(new_version_path):
                raise FileExistsError('目标版本文件夹已存在')
            self._safe_rename_dir(version_path, new_version_path)
            version_path = new_version_path
        setting['id'] = new_id
        self._write_json(os.path.join(version_path, self.SETTING_FILE), setting)
        return new_id

    # ---------- 部署文件 ----------
    def write_deploy_files(self, site_id, version_id, group, files):
        """写入某个版本下的一组部署文件。

        files: [{'path': 'index.html', 'content': '...', 'binary': False}, ...]
        """
        if not group or not group.startswith('deploy'):
            raise ValueError('部署组名称必须以 deploy 开头')
        deploy_path = self._web_path(site_id, version_id, group)
        os.makedirs(deploy_path, exist_ok=True)
        # 清空旧内容（保留目录本身）
        for item in os.listdir(deploy_path):
            item_path = os.path.join(deploy_path, item)
            try:
                if os.path.isfile(item_path):
                    os.remove(item_path)
                elif os.path.isdir(item_path):
                    import shutil
                    shutil.rmtree(item_path)
            except Exception:
                pass
        for item in (files or []):
            if not isinstance(item, dict):
                continue
            rel = (item.get('path') or item.get('name') or '').replace('\\', '/').strip('/')
            if not rel or '..' in rel or rel.startswith('/'):
                continue
            abs_path = os.path.abspath(os.path.join(deploy_path, rel))
            if abs_path != deploy_path and not abs_path.startswith(deploy_path + os.sep):
                continue
            d = os.path.dirname(abs_path)
            if d and not os.path.exists(d):
                os.makedirs(d, exist_ok=True)
            content = item.get('content') or ''
            if item.get('binary'):
                # base64 编码的二进制内容
                data = base64.b64decode(content) if content else b''
                with open(abs_path, 'wb') as f:
                    f.write(data)
            else:
                with open(abs_path, 'w', encoding='utf-8') as f:
                    f.write(content)
        return deploy_path

    def list_version_deploy_files(self, site_id, version_id, group='deploy1'):
        """列出某个版本部署组文件夹（web/<site>/<version>/<group>）内的全部文件。

        返回 [(rel_path, content, is_binary), ...]，rel_path 相对于部署组根目录；
        若部署组文件夹不存在返回 None。HTML 文件会做 GitHub Pages 可移植化处理
        （把写死的本地 base 替换为按层级计算的相对 base），其余文件原样读取。
        版本部署文件夹只保存了增量资源（壁纸/自定义 css 等），页面引用的模板基础库
        （assets/css、assets/js、字体、图标等）在项目根 assets/ 下，因此打包时会把
        项目根 assets/ 中版本文件夹缺失的文件一并补齐，保证压缩包自包含、可直接部署。
        """
        deploy_path = self._web_path(site_id, version_id, group)
        if not os.path.isdir(deploy_path):
            return None
        files = []
        seen = set()

        def _collect(src_root, zip_rel_base, sanitize_html):
            for root, dirs, file_list in os.walk(src_root):
                dirs[:] = [d for d in dirs if not d.startswith('.')]
                for fn in sorted(file_list):
                    if fn.lower() in ('nul', 'con', 'prn', 'aux', 'com1', 'com2', 'lpt1'):
                        continue
                    full = os.path.join(root, fn)
                    rel = os.path.relpath(full, src_root).replace('\\', '/')
                    if zip_rel_base:
                        rel = zip_rel_base + rel
                    if rel in seen:
                        continue
                    # 根目录的历史残留 commit.html 不进入部署包（正确位置是 footer/commit.html）
                    if sanitize_html and rel == 'commit.html':
                        continue
                    # 与旧收集流程一致：排除 fontawesome 源码目录等非部署资源
                    if any(rel.startswith(sub) for sub in DEPLOY_EXCLUDE_SUBPATH):
                        continue
                    if rel in DEPLOY_EXCLUDE_SUBFILE:
                        continue
                    try:
                        with open(full, 'rb') as f:
                            raw = f.read()
                    except Exception:
                        continue
                    try:
                        content = raw.decode('utf-8')
                        is_binary = False
                        if sanitize_html and fn.lower().endswith(('.html', '.htm')):
                            content = _portable_base_html(content, rel.count('/'))
                    except UnicodeDecodeError:
                        content = base64.b64encode(raw).decode('ascii')
                        is_binary = True
                    files.append((rel, content, is_binary))
                    seen.add(rel)

        # 1) 版本部署文件夹自身文件优先（HTML 做可移植化处理）
        _collect(deploy_path, '', True)
        # 2) 补齐项目根 assets/ 中缺失的静态资源（版本文件夹已有同名文件时以版本文件夹为准）
        assets_root = os.path.join(self.directory, 'assets')
        if os.path.isdir(assets_root):
            _collect(assets_root, 'assets/', False)
        return files

    def build_version_deploy_zip(self, site_id, version_id, group='deploy1'):
        """把某个版本部署组文件夹打成 zip 字节（供下载部署到 GitHub Pages 等）。
        文件夹不存在时返回 None。"""
        files = self.list_version_deploy_files(site_id, version_id, group)
        if files is None:
            return None
        import zipfile
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            for rel_path, content, is_binary in files:
                if is_binary:
                    zf.writestr(rel_path, base64.b64decode(content))
                else:
                    zf.writestr(rel_path, content)
        zip_buffer.seek(0)
        return zip_buffer.read()

    def list_deploy_groups(self, site_id, version_id):
        version_path = self._web_path(site_id, version_id)
        if not os.path.isdir(version_path):
            return []
        groups = []
        for name in sorted(os.listdir(version_path)):
            path = os.path.join(version_path, name)
            if os.path.isdir(path) and name.startswith('deploy'):
                groups.append(name)
        return groups

    # ---------- 默认模板 ----------
    DEFAULT_TEMPLATE_DIR = '默认模板'

    def _default_template_path(self, site_id, template_name=None):
        parts = [site_id, self.DEFAULT_TEMPLATE_DIR]
        if template_name:
            parts.append(template_name)
        return self._web_path(*parts)

    def ensure_default_template_dir(self, site_id):
        path = self._default_template_path(site_id)
        os.makedirs(path, exist_ok=True)
        return path

    def list_default_templates(self, site_id):
        path = self._default_template_path(site_id)
        if not os.path.isdir(path):
            return []
        templates = []
        for name in sorted(os.listdir(path)):
            sub = os.path.join(path, name)
            if not os.path.isdir(sub):
                continue
            setting = self._read_json(os.path.join(sub, self.SETTING_FILE)) or {}
            ts = setting.get('timestamp') or 0
            if not ts:
                try:
                    ts = int(os.path.getmtime(sub) * 1000)
                except Exception:
                    ts = 0
            templates.append({
                'name': name,
                'note': setting.get('note') or name,
                'timestamp': ts,
            })
        return templates

    def read_default_template_setting(self, site_id, template_name):
        path = self._default_template_path(site_id, template_name)
        if not os.path.isdir(path):
            return None
        return self._read_json(os.path.join(path, self.SETTING_FILE))

    def write_default_template_setting(self, site_id, template_name, setting):
        path = self._default_template_path(site_id, template_name)
        if not os.path.isdir(path):
            raise FileNotFoundError('模板不存在')
        self._write_json(os.path.join(path, self.SETTING_FILE), setting)

    def copy_to_default_templates(self, site_id, template_name, files):
        """把一组文件写入站点默认模板文件夹（会先清空旧内容）。

        files: [{'path': 'index.html', 'content': '...', 'binary': False}, ...]
        """
        path = self._default_template_path(site_id, template_name)
        if os.path.isdir(path):
            for item in os.listdir(path):
                item_path = os.path.join(path, item)
                try:
                    if os.path.isfile(item_path):
                        os.remove(item_path)
                    elif os.path.isdir(item_path):
                        import shutil
                        shutil.rmtree(item_path)
                except Exception:
                    pass
        else:
            os.makedirs(path, exist_ok=True)
        for item in (files or []):
            if not isinstance(item, dict):
                continue
            rel = (item.get('path') or item.get('name') or '').replace('\\', '/').strip('/')
            if not rel or '..' in rel or rel.startswith('/'):
                continue
            abs_path = os.path.abspath(os.path.join(path, rel))
            if abs_path != os.path.abspath(path) and not abs_path.startswith(os.path.abspath(path) + os.sep):
                continue
            d = os.path.dirname(abs_path)
            if d and not os.path.exists(d):
                os.makedirs(d, exist_ok=True)
            content = item.get('content') or ''
            if item.get('binary'):
                data = base64.b64decode(content) if content else b''
                with open(abs_path, 'wb') as f:
                    f.write(data)
            else:
                with open(abs_path, 'w', encoding='utf-8') as f:
                    f.write(content)
        return path

    def delete_default_template(self, site_id, template_name):
        path = self._default_template_path(site_id, template_name)
        if not os.path.isdir(path):
            return False
        import shutil
        shutil.rmtree(path)
        return True

    def set_default_template(self, site_id, template_name):
        setting = self.read_site_setting(site_id)
        if setting is None:
            raise FileNotFoundError('站点不存在')
        setting['defaultTemplate'] = template_name or ''
        self.write_site_setting(site_id, setting)

    def get_default_template(self, site_id):
        setting = self.read_site_setting(site_id)
        if setting is None:
            return ''
        return setting.get('defaultTemplate', '')

    def get_version_path(self, site_id, version_id):
        return self._web_path(site_id, version_id)

    def open_folder(self, path):
        """用系统文件管理器打开指定文件夹。"""
        if not os.path.isdir(path):
            raise FileNotFoundError('文件夹不存在')
        if os.name == 'nt':
            open_folder_in_front(path)
        else:
            import platform
            system = platform.system()
            if system == 'Darwin':
                subprocess.Popen(['open', path])
            else:
                subprocess.Popen(['xdg-open', path])
        return True


def open_folder_in_front(path):
    """打开文件夹并强制将其窗口置到最前（不被浏览器等遮挡）。

    launcher 的 http 服务属于后台进程，explorer 打开的窗口会落在前台窗口（如浏览器）之后。
    Explorer 是单实例，命令行打开文件夹往往是在已有窗口里加“新标签页”而非新建窗口，所以仅
    “找新窗口”并不可靠。本函数：
      1) ShellExecuteExW 打开文件夹；
      2) 先轮询找“新开”的窗口（HWND 不在打开前快照里）；
      3) 找不到则说明是复用已有窗口/新标签页，改取 z 序最顶的资源管理器窗口；
      4) 用 AttachThreadInput 挂到当前前台线程以绕过 Windows 前台锁定，再
         SetWindowPos(TopMost)->(NotTopMost) 强行提 z 序，最后 SetForegroundWindow 抢焦点。
    失败回退 os.startfile / explorer。返回 True 表示已尝试打开。
    """
    import time
    try:
        import ctypes
        from ctypes import wintypes
        user32 = ctypes.windll.user32
        shell32 = ctypes.windll.shell32
        kernel32 = ctypes.windll.kernel32

        # ---- 设置必要的 API 原型 ----
        WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_int, wintypes.HWND, wintypes.LPARAM)
        EnumWindows = user32.EnumWindows
        EnumWindows.argtypes = [WNDENUMPROC, wintypes.LPARAM]
        EnumWindows.restype = wintypes.BOOL
        user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
        user32.GetWindowThreadProcessId.restype = wintypes.DWORD
        user32.AttachThreadInput.argtypes = [wintypes.DWORD, wintypes.DWORD, wintypes.BOOL]
        user32.AttachThreadInput.restype = wintypes.BOOL
        kernel32.GetCurrentThreadId.restype = wintypes.DWORD
        user32.GetForegroundWindow.restype = wintypes.HWND
        user32.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
        user32.ShowWindow.restype = wintypes.BOOL
        user32.SetForegroundWindow.argtypes = [wintypes.HWND]
        user32.SetForegroundWindow.restype = wintypes.BOOL
        user32.SetWindowPos.argtypes = [wintypes.HWND, wintypes.HWND, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, wintypes.UINT]
        user32.SetWindowPos.restype = wintypes.BOOL

        HWND_TOPMOST = -1
        HWND_NOTOPMOST = -2
        HWND_TOP = 0
        SW_RESTORE = 9
        SWP_NOMOVE = 0x0002
        SWP_NOSIZE = 0x0001
        EXPLORER_CLASSES = ("CabinetWClass", "ExploreWClass")

        def _is_explorer(hwnd):
            buf = ctypes.create_unicode_buffer(256)
            user32.GetClassNameW(hwnd, buf, 256)
            return buf.value in EXPLORER_CLASSES

        def _bring_to_front(hwnd):
            try:
                user32.ShowWindow(hwnd, SW_RESTORE)
            except Exception:
                pass
            # 挂到当前前台线程，绕过 Windows 前台窗口锁定
            fg = user32.GetForegroundWindow()
            attached = False
            if fg:
                pid = wintypes.DWORD(0)
                fg_thread = user32.GetWindowThreadProcessId(fg, ctypes.byref(pid))
                my_thread = kernel32.GetCurrentThreadId()
                if fg_thread and fg_thread != my_thread:
                    try:
                        if user32.AttachThreadInput(my_thread, fg_thread, 1):
                            attached = True
                    except Exception:
                        pass
            try:
                user32.SetForegroundWindow(hwnd)
            finally:
                if attached:
                    try:
                        user32.AttachThreadInput(my_thread, fg_thread, 0)
                    except Exception:
                        pass
            # TopMost 再取消：强制提到 z 序最顶（不受前台锁定限制）
            try:
                user32.SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE)
                user32.SetWindowPos(hwnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE)
            except Exception:
                pass

        # 1) 记录打开前已存在的资源管理器窗口
        existing = set()
        def _cb_existing(hwnd, _):
            if _is_explorer(hwnd):
                existing.add(hwnd)
            return 1
        EnumWindows(WNDENUMPROC(_cb_existing), 0)

        # 2) 打开文件夹
        SEE_MASK_BRINGTOFRONT = 0x00020000
        SW_SHOWNORMAL = 1
        class SHELLEXECUTEINFO(ctypes.Structure):
            _fields_ = [
                ("cbSize", wintypes.DWORD),
                ("fMask", wintypes.ULONG),
                ("hwnd", wintypes.HWND),
                ("lpVerb", wintypes.LPCWSTR),
                ("lpFile", wintypes.LPCWSTR),
                ("lpParameters", wintypes.LPCWSTR),
                ("lpDirectory", wintypes.LPCWSTR),
                ("nShow", ctypes.c_int),
                ("hInstApp", wintypes.HANDLE),
                ("lpIDList", ctypes.c_void_p),
                ("lpClass", wintypes.LPCWSTR),
                ("hKey", ctypes.c_void_p),
                ("dwHotKey", wintypes.DWORD),
                ("hIconOrMonitor", ctypes.c_void_p),
                ("hProcess", wintypes.HANDLE),
            ]
        sei = SHELLEXECUTEINFO()
        sei.cbSize = ctypes.sizeof(sei)
        sei.fMask = SEE_MASK_BRINGTOFRONT
        sei.lpVerb = "open"
        sei.lpFile = path
        sei.nShow = SW_SHOWNORMAL
        launched = bool(shell32.ShellExecuteExW(ctypes.byref(sei)))

        # 3) 轮询找“新开”窗口（最多约 1.5s）
        target = None
        for _ in range(15):
            found = [None]
            def _cb_new(hwnd, _):
                if hwnd not in existing and _is_explorer(hwnd):
                    found[0] = hwnd
                    return 0  # 命中即停止
                return 1
            EnumWindows(WNDENUMPROC(_cb_new), 0)
            if found[0]:
                target = found[0]
                break
            time.sleep(0.1)

        # 4) 找不到新窗口（单实例复用/新标签页）：取 z 序最顶的资源管理器窗口
        if target is None:
            top = [None]
            def _cb_top(hwnd, _):
                if _is_explorer(hwnd):
                    top[0] = hwnd
                    return 0  # 第一个即为 z 序最顶
                return 1
            EnumWindows(WNDENUMPROC(_cb_top), 0)
            target = top[0]
            # 兜底：若当前前台窗口正是 explorer，则用它
            if target is None:
                fg = user32.GetForegroundWindow()
                if fg and _is_explorer(fg):
                    target = fg

        if target:
            _bring_to_front(target)

        if launched:
            return True
    except Exception:
        pass
    # 回退方案（顺序：os.startfile -> explorer）
    try:
        os.startfile(path)
        return True
    except Exception:
        pass
    try:
        subprocess.Popen(['explorer', path], shell=True)
        return True
    except Exception:
        return False


class SilentHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """静默 HTTP 处理器 - 不写日志 + 强制禁止缓存（CEF 内嵌浏览器需要）"""

    # 禁止缓存的文件扩展名（CEF 内嵌浏览器会强缓存 JS/CSS/HTML，忽略查询字符串版本号）
    CACHE_BUST_EXTS = {'.js', '.css', '.mjs', '.html', '.htm', '.json', '.svg'}

    def send_header(self, keyword, value):
        """覆写：对所有前端文本类响应强制加上 charset=utf-8，并为脚本/样式/HTML 等
        前端资源加 no-cache。CEF/浏览器会无视 ?v= 版本号强缓存 .js/.css，
        必须通过响应头强制禁止缓存，否则前端改动不生效。"""
        if keyword.lower() == 'content-type' and 'charset' not in value.lower():
            _v = value.lower()
            if 'text/' in _v or 'javascript' in _v or 'json' in _v:
                value = value.rstrip() + '; charset=utf-8'
        # 依据请求路径扩展名，对所有前端资源（含 .js/.css，浏览器会无视 ?v= 强缓存）强制禁止缓存
        if keyword.lower() == 'content-type':
            _path = (self.path or '').split('?')[0]
            _ext = os.path.splitext(_path)[1].lower()
            if _ext in self.CACHE_BUST_EXTS:
                super().send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
                super().send_header('Pragma', 'no-cache')
                super().send_header('Expires', '0')
        super().send_header(keyword, value)

    def _collect_deploy_files(self, payload):
        """收集部署文件列表，返回 [(rel_path, content, is_binary), ...]
        生成的 HTML（index/footer/commit）来自 payload，其余静态资源从磁盘读取。
        与打包导出共用同一份排除规则，确保「发布」与「打包导出」文件一致。"""
        project_dir = self.directory

        index_html = payload.get('indexHtml', '')
        about_html = payload.get('aboutHtml', '')
        commit_html = payload.get('commitHtml', '')

        # 前端传入的文件过滤器：哪些静态资源包含（默认全包含）
        file_filter = payload.get('fileFilter', {}) or {}
        ff_custom_css = file_filter.get('customCss', True)
        ff_not_found = file_filter.get('notFound', True)
        ff_assets = file_filter.get('assets', True)

        # 被生成 HTML 覆盖的文件，不再从磁盘读取
        overridden = set()
        if index_html:
            overridden.add('index.html')
        if about_html:
            overridden.add('footer/about.html')
        if commit_html:
            overridden.add('footer/commit.html')

        files = []
        # 1. 生成的 HTML 优先写入
        if index_html:
            files.append(('index.html', _portable_base_html(index_html, 0), False))
        if about_html:
            files.append(('footer/about.html', _portable_base_html(about_html, 1), False))
        if commit_html:
            files.append(('footer/commit.html', _portable_base_html(commit_html, 1), False))

        # 2. 遍历项目目录，收集静态资源（仅当前目录内、未修改即原样打包）
        for root, dirs, file_list in os.walk(project_dir):
            # 跳过编辑器/开发目录
            dirs[:] = [d for d in dirs if d not in DEPLOY_EXCLUDE_PREFIX]
            for file in file_list:
                if file.lower() in ('nul', 'con', 'prn', 'aux', 'com1', 'com2', 'lpt1'):
                    continue
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, project_dir).replace('\\', '/')
                if rel_path.lower().endswith(('.sketch', '.bak', '.tmp', '.old')):
                    continue
                if rel_path in overridden or rel_path in DEPLOY_EXCLUDE_FILE:
                    continue
                # 排除任何部署临时压缩包（deploy.zip / deploy_<时间戳>.zip 等）
                if rel_path.startswith('deploy') and rel_path.endswith('.zip'):
                    continue
                skip = False
                for prefix in DEPLOY_EXCLUDE_PREFIX:
                    if rel_path == prefix or rel_path.startswith(prefix + '/'):
                        skip = True
                        break
                if not skip:
                    for sub in DEPLOY_EXCLUDE_SUBPATH:
                        if rel_path.startswith(sub):
                            skip = True
                            break
                if not skip and rel_path in DEPLOY_EXCLUDE_SUBFILE:
                    skip = True
                # 按前端文件过滤器决定特定文件 / 静态资源是否包含
                if not skip:
                    if rel_path == 'assets/css/custom-style.css':
                        skip = not ff_custom_css
                    elif rel_path == '404.html':
                        skip = not ff_not_found
                    else:
                        # 其余静态资源（字体 / css / js / 图片等）受 assets 总开关控制
                        skip = not ff_assets
                if skip:
                    continue
                try:
                    with open(full_path, 'rb') as f:
                        raw = f.read()
                except Exception:
                    continue
                # 文本文件用 utf-8 字符串，二进制文件用 base64
                try:
                    content = raw.decode('utf-8')
                    is_binary = False
                except UnicodeDecodeError:
                    content = base64.b64encode(raw).decode('ascii')
                    is_binary = True
                files.append((rel_path, content, is_binary))

        # 3. 额外文件/文件夹（includePaths）：强制包含，优先级高于排除规则
        #    支持文件或文件夹（文件夹递归），但仍禁止跳出项目根目录
        include_paths = payload.get('includePaths', []) or []
        if include_paths:
            forced = []
            for inc in include_paths:
                inc = (inc or '').strip().lstrip('/')
                if not inc:
                    continue
                abs_inc = os.path.abspath(os.path.join(project_dir, inc))
                # 安全：禁止跳出项目根目录
                if abs_inc != project_dir and not abs_inc.startswith(project_dir + os.sep):
                    continue
                if os.path.isfile(abs_inc):
                    rel = os.path.relpath(abs_inc, project_dir).replace('\\', '/')
                    if rel.startswith('deploy') and rel.endswith('.zip'):
                        continue
                    try:
                        with open(abs_inc, 'rb') as f:
                            raw = f.read()
                    except Exception:
                        continue
                    try:
                        content = raw.decode('utf-8')
                        is_binary = False
                    except UnicodeDecodeError:
                        content = base64.b64encode(raw).decode('ascii')
                        is_binary = True
                    forced.append((rel, content, is_binary))
                elif os.path.isdir(abs_inc):
                    for root, dirs, file_list in os.walk(abs_inc):
                        for fn in file_list:
                            if fn.lower() in ('nul', 'con', 'prn', 'aux', 'com1', 'com2', 'lpt1'):
                                continue
                            full = os.path.join(root, fn)
                            rel = os.path.relpath(full, project_dir).replace('\\', '/')
                            if rel.lower().endswith(('.sketch', '.bak', '.tmp', '.old')):
                                continue
                            if rel.startswith('deploy') and rel.endswith('.zip'):
                                continue
                            try:
                                with open(full, 'rb') as f:
                                    raw = f.read()
                            except Exception:
                                continue
                            try:
                                content = raw.decode('utf-8')
                                is_binary = False
                            except UnicodeDecodeError:
                                content = base64.b64encode(raw).decode('ascii')
                                is_binary = True
                            forced.append((rel, content, is_binary))
            # 覆盖同名文件（includePaths 优先级最高）
            existing = {p: i for i, (p, _, _) in enumerate(files)}
            for rel, content, is_binary in forced:
                if rel in existing:
                    files[existing[rel]] = (rel, content, is_binary)
                else:
                    files.append((rel, content, is_binary))

        # 4. 额外生成文件（extraFiles，如 SEO 的 robots.txt / sitemap.xml / 站点验证文件）：
        #    优先级最高，覆盖同名文件。格式 [{'path','content','binary'}]
        extra_files = payload.get('extraFiles', []) or []
        if extra_files:
            existing = {p: i for i, (p, _, _) in enumerate(files)}
            for item in extra_files:
                if not isinstance(item, dict):
                    continue
                rel = (item.get('path') or '').replace('\\', '/').strip('/')
                if not rel or '..' in rel.split('/') or rel.startswith('/'):
                    continue
                content = item.get('content') or ''
                is_binary = bool(item.get('binary'))
                if rel in existing:
                    files[existing[rel]] = (rel, content, is_binary)
                else:
                    files.append((rel, content, is_binary))

        return files

    def _build_zip(self, payload):
        """根据前端传入的 HTML 构建 deploy.zip 字节并返回"""
        import zipfile
        files = self._collect_deploy_files(payload)
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            for rel_path, content, is_binary in files:
                if is_binary:
                    zf.writestr(rel_path, base64.b64decode(content))
                else:
                    zf.writestr(rel_path, content)
        zip_buffer.seek(0)
        return zip_buffer.read()

    def _send_zip(self, payload):
        """直接返回 zip 二进制（小文件走此分支，大文件走 download 分支）"""
        zip_bytes = self._build_zip(payload)
        self.send_response(200)
        self.send_header('Content-Type', 'application/zip')
        self.send_header('Content-Disposition', 'attachment; filename="deploy.zip"')
        self.send_header('Content-Length', len(zip_bytes))
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        self.end_headers()
        self.wfile.write(zip_bytes)

    def _send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', len(body))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def _send_error(self, message, status=500):
        self._send_json({'ok': False, 'error': message}, status)

    # ===== 账号磁盘存储：password/ 下按类型分文件（Github.json / cloudflare.json / active.json）=====
    def _accounts_file(self, atype):
        """atype 仅允许 'Github' / 'cloudflare' / 'vercel' / 'netlify' / 'server' / 'active'，避免路径穿越。"""
        if atype not in ('Github', 'cloudflare', 'vercel', 'netlify', 'server', 'active'):
            raise ValueError('非法的账号类型: %s' % atype)
        return os.path.join(self.directory, 'password', '%s.json' % atype)

    def _read_accounts_file(self, atype):
        p = self._accounts_file(atype)
        if not os.path.isfile(p):
            return []
        try:
            with open(p, 'r', encoding='utf-8') as f:
                data = json.load(f)
            return data if isinstance(data, list) else []
        except Exception:
            return []

    def _write_accounts_file(self, atype, accounts):
        p = self._accounts_file(atype)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, 'w', encoding='utf-8') as f:
            json.dump(accounts if isinstance(accounts, list) else [], f, ensure_ascii=False, indent=2)

    def _handle_accounts_get(self):
        try:
            github = self._read_accounts_file('Github')
            cloudflare = self._read_accounts_file('cloudflare')
            vercel = self._read_accounts_file('vercel')
            netlify = self._read_accounts_file('netlify')
            server = self._read_accounts_file('server')
            active = ''
            ap = self._accounts_file('active')
            if os.path.isfile(ap):
                try:
                    with open(ap, 'r', encoding='utf-8') as f:
                        active = json.load(f).get('active', '')
                except Exception:
                    active = ''
            self._send_json({'ok': True, 'github': github, 'cloudflare': cloudflare, 'vercel': vercel, 'netlify': netlify, 'server': server, 'active': active})
        except Exception as e:
            self._send_error(str(e))

    def _handle_accounts_post(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length) if content_length > 0 else b'{}'
            payload = json.loads(body.decode('utf-8'))
            github = payload.get('github')
            cloudflare = payload.get('cloudflare')
            vercel = payload.get('vercel')
            netlify = payload.get('netlify')
            server = payload.get('server')
            active = payload.get('active')
            if isinstance(github, list):
                self._write_accounts_file('Github', github)
            if isinstance(cloudflare, list):
                self._write_accounts_file('cloudflare', cloudflare)
            if isinstance(vercel, list):
                self._write_accounts_file('vercel', vercel)
            if isinstance(netlify, list):
                self._write_accounts_file('netlify', netlify)
            if isinstance(server, list):
                self._write_accounts_file('server', server)
            if active is not None:
                ap = self._accounts_file('active')
                os.makedirs(os.path.dirname(ap), exist_ok=True)
                with open(ap, 'w', encoding='utf-8') as f:
                    json.dump({'active': active}, f, ensure_ascii=False)
            self._send_json({'ok': True})
        except Exception as e:
            self._send_error(str(e))

    def do_GET(self):
        # 调试日志：打印所有 GET 请求，便于排查 404
        print('[NavEditor GET ]', self.path)
        # ===== 账号磁盘存储 API（password/ 下按类型分文件）=====
        if self.path.split('?')[0] == '/api/accounts':
            self._handle_accounts_get()
            return
        # ===== 文件式站点/版本存储 API =====
        storage = SiteStorage(self.directory)
        if self.path.split('?')[0] == '/api/storage/sites':
            try:
                self._send_json({'ok': True, 'sites': storage.list_sites()})
            except Exception as e:
                self._send_error(str(e))
            return
        if self.path.split('?')[0] == '/api/storage/site-setting':
            try:
                qs = self.path.split('?', 1)[1] if '?' in self.path else ''
                params = {}
                for part in qs.split('&'):
                    if '=' in part:
                        k, v = part.split('=', 1)
                        params[k] = urllib.parse.unquote(v)
                site = params.get('site', '')
                setting = storage.read_site_setting(site)
                if setting is None:
                    self._send_error('站点不存在', 404)
                    return
                self._send_json({'ok': True, 'setting': setting})
            except Exception as e:
                self._send_error(str(e))
            return
        if self.path.split('?')[0] == '/api/storage/versions':
            try:
                qs = self.path.split('?', 1)[1] if '?' in self.path else ''
                params = {}
                for part in qs.split('&'):
                    if '=' in part:
                        k, v = part.split('=', 1)
                        params[k] = urllib.parse.unquote(v)
                site = params.get('site', '')
                self._send_json({'ok': True, 'versions': storage.list_versions(site)})
            except Exception as e:
                self._send_error(str(e))
            return
        if self.path.split('?')[0] == '/api/storage/version-setting':
            try:
                qs = self.path.split('?', 1)[1] if '?' in self.path else ''
                params = {}
                for part in qs.split('&'):
                    if '=' in part:
                        k, v = part.split('=', 1)
                        params[k] = urllib.parse.unquote(v)
                site = params.get('site', '')
                version = params.get('version', '')
                setting = storage.read_version_setting(site, version)
                if setting is None:
                    self._send_error('版本不存在', 404)
                    return
                self._send_json({'ok': True, 'setting': setting})
            except Exception as e:
                self._send_error(str(e))
            return
        if self.path.split('?')[0] == '/api/storage/default-templates':
            try:
                qs = self.path.split('?', 1)[1] if '?' in self.path else ''
                params = {}
                for part in qs.split('&'):
                    if '=' in part:
                        k, v = part.split('=', 1)
                        params[k] = urllib.parse.unquote(v)
                site = params.get('site', '')
                self._send_json({
                    'ok': True,
                    'templates': storage.list_default_templates(site),
                    'current': storage.get_default_template(site)
                })
            except Exception as e:
                self._send_error(str(e))
            return
        if self.path.split('?')[0] == '/api/storage/default-template-setting':
            try:
                qs = self.path.split('?', 1)[1] if '?' in self.path else ''
                params = {}
                for part in qs.split('&'):
                    if '=' in part:
                        k, v = part.split('=', 1)
                        params[k] = urllib.parse.unquote(v)
                site = params.get('site', '')
                template_name = params.get('templateName', '')
                setting = storage.read_default_template_setting(site, template_name)
                if setting is None:
                    self._send_error('模板不存在', 404)
                    return
                self._send_json({'ok': True, 'setting': setting})
            except Exception as e:
                self._send_error(str(e))
            return

        # 模板发现：列出 template/ 下含 index.html 的子目录名；并附带当前选中模板（供桌面端打开按钮）
        if self.path.split('?')[0] == '/api/templates':
            try:
                import json as _json
                tpl_dir = os.path.join(self.directory, 'template')
                names = []
                if os.path.isdir(tpl_dir):
                    for root, dirs, files in os.walk(tpl_dir):
                        if 'index.html' in files:
                            rel = os.path.relpath(root, tpl_dir)
                            if rel == '.':
                                continue
                            names.append(rel.replace(os.sep, '/'))
                    names = sorted(names)
                sel = ''
                sel_file = os.path.join(self.directory, '.about_template')
                if os.path.isfile(sel_file):
                    try:
                        with open(sel_file, 'r', encoding='utf-8') as _f:
                            sel = _f.read().strip()
                    except Exception:
                        sel = ''
                # 迁移：旧数据将模板名存为裸名（关于导航/网站提交），移入「页脚」后加前缀
                if sel and sel not in names:
                    cand = '页脚/' + sel
                    if cand in names:
                        sel = cand
                        try:
                            with open(sel_file, 'w', encoding='utf-8') as _f:
                                _f.write(sel)
                        except Exception:
                            pass
                if not sel and names:
                    sel = names[0]
                body = _json.dumps({'templates': names, 'current': sel}).encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Content-Length', len(body))
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(body)
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'text/plain; charset=utf-8')
                self.end_headers()
                self.wfile.write(str(e).encode('utf-8'))
            return
        # 404 模板发现：列出 template/404/ 下所有 .html 文件
        if self.path.split('?')[0] == '/api/list-404-templates':
            try:
                tpl_dir = os.path.join(self.directory, 'template', '404')
                names = []
                if os.path.isdir(tpl_dir):
                    for fn in os.listdir(tpl_dir):
                        if fn.lower().endswith('.html'):
                            names.append(fn)
                    names = sorted(names)
                self._send_json({'ok': True, 'templates': names})
            except Exception as e:
                self._send_error(str(e))
            return
        # 读取单个 404 模板内容（供前端部署复制使用），防目录穿越
        if self.path.split('?')[0] == '/api/404-template-content':
            try:
                qs = self.path.split('?', 1)[1] if '?' in self.path else ''
                params = {}
                for part in qs.split('&'):
                    if '=' in part:
                        k, v = part.split('=', 1)
                        params[k] = urllib.parse.unquote(v)
                name = params.get('name', '')
                if not name or name != os.path.basename(name) or not name.lower().endswith('.html'):
                    self._send_json({'ok': False, 'error': '非法文件名'}, 400)
                    return
                tpl_path = os.path.join(self.directory, 'template', '404', name)
                if not os.path.isfile(tpl_path):
                    self._send_json({'ok': False, 'error': '模板不存在'}, 404)
                    return
                with io.open(tpl_path, 'r', encoding='utf-8') as _f:
                    content = _f.read()
                self._send_json({'ok': True, 'content': content})
            except Exception as e:
                self._send_error(str(e))
            return

        # 部署临时 zip 下载完成后立即删除，避免残留文件被下一次打包收集进 zip
        if self.path.startswith('/deploy_') and self.path.endswith('.zip'):
            rel = self.path[1:].split('?')[0]
            zip_path = os.path.join(self.directory, rel)
            if os.path.isfile(zip_path):
                # 取导出时传入的显示文件名（与版本历史名称一致），默认 deploy
                disp_name = _DEPLOY_NAMES.pop(rel, 'deploy')
                # Content-Disposition 仅用 ASCII 安全名（避免 header 编码错误），
                # 前端 <a download> 会携带原始（含中文）名，主流浏览器优先采用。
                safe_ascii = ''.join(c if (32 <= ord(c) < 127) else '_' for c in disp_name) or 'deploy'
                try:
                    with open(zip_path, 'rb') as f:
                        data = f.read()
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/zip')
                    self.send_header('Content-Disposition', 'attachment; filename="%s.zip"' % safe_ascii)
                    self.send_header('Content-Length', len(data))
                    self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
                    self.send_header('Pragma', 'no-cache')
                    self.send_header('Expires', '0')
                    self.end_headers()
                    self.wfile.write(data)
                finally:
                    try:
                        os.remove(zip_path)
                    except Exception:
                        pass
                return
        # commit.html 已移入 footer/，兼容旧链接
        if self.path == '/commit.html' or self.path.startswith('/commit.html?'):
            self.send_response(301)
            self.send_header('Location', '/footer/commit.html' + (('?' + self.path.split('?', 1)[1]) if '?' in self.path else ''))
            self.end_headers()
            return
        # 404 自定义处理：请求的文件不存在时，按 404/rules.json 匹配返回对应模板
        rel_path = urllib.parse.unquote(self.path.split('?')[0].lstrip('/'))
        fs_path = os.path.normpath(os.path.join(self.directory, rel_path))
        base_dir = os.path.abspath(self.directory)
        if not os.path.isfile(fs_path) or not (fs_path == base_dir or fs_path.startswith(base_dir + os.sep)):
            if self._try_serve_not_found(rel_path):
                return
        super().do_GET()

    def _match_404_rule(self, cfg, path):
        """根据 rules 匹配当前 path，返回命中的 template 名；未命中返回 default。"""
        import re
        rules = (cfg.get('rules') or []) if isinstance(cfg, dict) else []
        for ru in rules:
            pat = (ru.get('pattern') or '') if isinstance(ru, dict) else ''
            if not pat:
                continue
            parts = pat.split('*')
            rx = '^' + '([^/]*)'.join(re.escape(p) for p in parts) + '$'
            try:
                if re.match(rx, path):
                    return ru.get('template') or ''
            except Exception:
                continue
        return (cfg.get('default') or '') if isinstance(cfg, dict) else ''

    def _send_file_content(self, path, ctype, status=404):
        with io.open(path, 'rb') as f:
            raw = f.read()
        self.send_response(status)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', len(raw))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(raw)

    def _try_serve_not_found(self, rel_path):
        """文件不存在时尝试按 404 规则返回对应模板；返回 True 表示已处理。"""
        import re
        # 1) 项目根 404/rules.json
        root_404 = os.path.join(self.directory, '404')
        rf = os.path.join(root_404, 'rules.json')
        if os.path.isfile(rf):
            try:
                with io.open(rf, 'r', encoding='utf-8') as f:
                    cfg = json.load(f)
                tpl = self._match_404_rule(cfg, rel_path)
                if tpl:
                    tp = os.path.join(root_404, tpl)
                    if os.path.isfile(tp):
                        self._send_file_content(tp, 'text/html; charset=utf-8', status=404)
                        return True
            except Exception:
                pass
        # 2) 项目根 404.html
        root_html = os.path.join(self.directory, '404.html')
        if os.path.isfile(root_html):
            self._send_file_content(root_html, 'text/html; charset=utf-8', status=404)
            return True
        # 3) 当前站点当前版本的 deploy1/404/（开发预览也生效）
        try:
            storage = SiteStorage(self.directory)
            sites = storage.list_sites()
            if sites:
                site = sites[0].get('id') if isinstance(sites[0], dict) else sites[0]
                setting = storage.read_site_setting(site) or {}
                data = setting.get('data', {}) if isinstance(setting, dict) else {}
                vid = (data.get('currentVersionId') if isinstance(data, dict) else '') or ''
                versions = storage.list_versions(site) or []
                if not vid and versions:
                    vid = versions[-1].get('id', '') if isinstance(versions[-1], dict) else versions[-1]
                if vid:
                    d404 = os.path.join(self.directory, 'web', site, vid, 'deploy1', '404')
                    rf2 = os.path.join(d404, 'rules.json')
                    if os.path.isfile(rf2):
                        with io.open(rf2, 'r', encoding='utf-8') as f:
                            cfg = json.load(f)
                        tpl = self._match_404_rule(cfg, rel_path)
                        if tpl:
                            tp = os.path.join(d404, tpl)
                            if os.path.isfile(tp):
                                self._send_file_content(tp, 'text/html; charset=utf-8', status=404)
                                return True
        except Exception:
            pass
        return False

    def do_POST(self):
        """处理 POST 请求：部署文件列表 / 打包 zip / 保存当前页为模板 / 记录选中模板"""
        # 调试日志：打印所有 POST 请求，便于排查 404
        print('[NavEditor POST]', self.path)
        # ===== 账号磁盘存储 API（password/ 下按类型分文件）=====
        if self.path.split('?')[0] == '/api/accounts':
            self._handle_accounts_post()
            return
        # ===== 服务器 / 本地部署 API（账号类型 server）=====
        if self.path.split('?')[0] == '/api/server-check':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length) if content_length > 0 else b'{}'
                payload = json.loads(body.decode('utf-8'))
                acc = payload.get('account') or {}
                logs = []
                deploy_type = (acc.get('deployType') or '').strip()
                if deploy_type == 'local':
                    target = (acc.get('localPath') or '').strip()
                    if not target:
                        raise DeployError('未填写「本地站点根目录」。')
                    target_abs = os.path.abspath(target)
                    if not os.path.isdir(target_abs):
                        raise DeployError('本地部署目录不存在：%s（可先在部署时自动创建，或手动创建）' % target_abs)
                    if not os.access(target_abs, os.W_OK):
                        raise DeployError('本地部署目录不可写：%s' % target_abs)
                    _dl(logs, 'ok', '本地部署目录存在且可写：%s' % target_abs)
                    self._send_json({'ok': True, 'message': '本地目录可写', 'logs': logs})
                elif deploy_type in ('nginx', 'server'):
                    _deploy_nginx(payload, logs, test_only=True)
                    self._send_json({'ok': True, 'message': '服务器 SSH 连接与远程目录检查通过', 'logs': logs})
                else:
                    raise DeployError('未知部署方式：%s（应为 local 或 nginx）' % deploy_type)
            except DeployError as e:
                logs.append({'level': 'error', 'text': str(e)})
                self._send_json({'ok': False, 'error': str(e), 'logs': logs})
            except Exception as e:
                self._send_error(str(e))
            return
        if self.path.split('?')[0] == '/api/server-deploy':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length) if content_length > 0 else b'{}'
                payload = json.loads(body.decode('utf-8'))
                logs = []
                acc = payload.get('account') or {}
                deploy_type = (payload.get('deployType') or acc.get('deployType') or '').strip()
                try:
                    if deploy_type == 'local':
                        _deploy_local(self.directory, payload, logs)
                    elif deploy_type in ('nginx', 'server'):
                        _deploy_nginx(payload, logs)
                    else:
                        raise DeployError('未知部署方式：%s（应为 local 或 nginx）' % deploy_type)
                except DeployError as e:
                    logs.append({'level': 'error', 'text': str(e)})
                    self._send_json({'ok': False, 'error': str(e), 'logs': logs})
                    return
                site_url = (acc.get('siteUrl') or '').strip()
                self._send_json({'ok': True, 'url': site_url, 'logs': logs})
            except Exception as e:
                self._send_error(str(e))
            return
        if self.path.split('?')[0] == '/api/upload-seo-image':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length) if content_length > 0 else b'{}'
                payload = json.loads(body.decode('utf-8'))
                name = os.path.basename((payload.get('name') or 'og-image.png').strip() or 'og-image.png')
                if not re.match(r'^[\w.\-]{1,80}\.(png|jpe?g|gif|webp|svg|ico)$', name, re.IGNORECASE):
                    raise ValueError('非法图片文件名: %s' % name)
                data_url = payload.get('dataUrl') or ''
                if data_url.startswith('data:'):
                    data_url = data_url.split(',', 1)[-1] if ',' in data_url else ''
                if not data_url:
                    raise ValueError('未收到图片数据')
                raw = base64.b64decode(data_url)
                if len(raw) > 5 * 1024 * 1024:
                    raise ValueError('图片不能超过 5MB')
                seo_dir = os.path.join(self.directory, 'assets', 'seo')
                os.makedirs(seo_dir, exist_ok=True)
                with open(os.path.join(seo_dir, name), 'wb') as fp:
                    fp.write(raw)
                self._send_json({'ok': True, 'path': 'assets/seo/' + name})
            except Exception as e:
                self._send_error(str(e))
            return
        # ===== 文件式站点/版本存储 API =====
        if self.path.startswith('/api/storage/'):
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length) if content_length > 0 else b'{}'
                payload = json.loads(body.decode('utf-8'))
            except Exception as e:
                self._send_error('请求体解析失败: %s' % str(e), 400)
                return
            storage = SiteStorage(self.directory)
            action = self.path[len('/api/storage/'):]
            try:
                if action == 'site':
                    op = payload.get('action')
                    if op == 'create':
                        site_id = storage.create_site(payload.get('name'), payload.get('data'))
                        self._send_json({'ok': True, 'id': site_id})
                    elif op == 'rename':
                        new_id = storage.rename_site(payload.get('id'), payload.get('newName'))
                        self._send_json({'ok': True, 'id': new_id})
                    elif op == 'delete':
                        storage.delete_site(payload.get('id'))
                        self._send_json({'ok': True})
                    elif op == 'reorder':
                        storage.save_site_order(payload.get('ids'))
                        self._send_json({'ok': True})
                    else:
                        self._send_error('未知操作: %s' % op, 400)
                    return
                if action == 'site-setting':
                    storage.write_site_setting(payload.get('site'), payload.get('setting'))
                    self._send_json({'ok': True})
                    return
                if action == 'version':
                    op = payload.get('action')
                    if op == 'create':
                        version_id = storage.create_version(payload.get('site'), payload.get('name'))
                        self._send_json({'ok': True, 'id': version_id})
                    elif op == 'rename':
                        storage.rename_version(payload.get('site'), payload.get('id'), payload.get('newName'))
                        self._send_json({'ok': True})
                    elif op == 'delete':
                        storage.delete_version(payload.get('site'), payload.get('id'))
                        self._send_json({'ok': True})
                    else:
                        self._send_error('未知操作: %s' % op, 400)
                    return
                if action == 'version-setting':
                    new_id = storage.write_version_setting(payload.get('site'), payload.get('version'), payload.get('setting'))
                    self._send_json({'ok': True, 'id': new_id})
                    return
                if action == 'version-deploy':
                    path = storage.write_deploy_files(
                        payload.get('site'),
                        payload.get('version'),
                        payload.get('group') or 'deploy1',
                        payload.get('files')
                    )
                    self._send_json({'ok': True, 'path': path})
                    return
                if action == 'default-template':
                    op = payload.get('action')
                    site = payload.get('site', '')
                    if op == 'set':
                        storage.set_default_template(site, payload.get('templateName'))
                        self._send_json({'ok': True})
                    elif op == 'clear':
                        storage.set_default_template(site, '')
                        self._send_json({'ok': True})
                    elif op == 'delete':
                        storage.delete_default_template(site, payload.get('templateName'))
                        # 如果删除的是当前默认模板，一并清空
                        if storage.get_default_template(site) == payload.get('templateName'):
                            storage.set_default_template(site, '')
                        self._send_json({'ok': True})
                    else:
                        self._send_error('未知操作: %s' % op, 400)
                    return
                if action == 'copy-to-default-templates':
                    path = storage.copy_to_default_templates(
                        payload.get('site'),
                        payload.get('templateName'),
                        payload.get('files')
                    )
                    self._send_json({'ok': True, 'path': path})
                    return
                if action == 'open-version-folder':
                    site = payload.get('site', '')
                    version = payload.get('version', '')
                    version_path = storage.get_version_path(site, version)
                    storage.open_folder(version_path)
                    self._send_json({'ok': True, 'path': version_path})
                    return
                if action == 'save-default-template':
                    site = payload.get('site', '')
                    template_name = payload.get('templateName') or 'template'
                    files = payload.get('files') if isinstance(payload.get('files'), list) else []
                    # 确保默认模板文件夹存在
                    storage.ensure_default_template_dir(site)
                    path = storage.copy_to_default_templates(site, template_name, files)
                    # 如果有 setting 则写入
                    if payload.get('setting'):
                        storage.write_default_template_setting(site, template_name, payload.get('setting'))
                    self._send_json({'ok': True, 'path': path})
                    return
                self._send_error('未知存储接口: %s' % action, 404)
            except FileNotFoundError as e:
                self._send_error(str(e), 404)
            except ValueError as e:
                self._send_error(str(e), 400)
            except Exception as e:
                import traceback
                self._send_json({'ok': False, 'error': str(e), 'trace': traceback.format_exc()}, 500)
            return

        if self.path == '/api/about-template':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length) if content_length > 0 else b'{}'
                payload = json.loads(body.decode('utf-8'))
                name = (payload.get('template') or '').strip()
                if name:
                    with open(os.path.join(self.directory, '.about_template'), 'w', encoding='utf-8') as _f:
                        _f.write(name)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"ok":true}')
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'text/plain; charset=utf-8')
                self.end_headers()
                self.wfile.write(str(e).encode('utf-8'))
            return
        if self.path == '/api/save-html-to-path':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length) if content_length > 0 else b'{}'
                payload = json.loads(body.decode('utf-8'))
                html = payload.get('html', '') or ''
                rel = payload.get('path', '').strip().replace('\\', '/')
                if not rel:
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json; charset=utf-8')
                    self.end_headers()
                    self.wfile.write(json.dumps({'ok': False, 'error': '路径不能为空'}).encode('utf-8'))
                    return
                # 安全校验：禁止路径穿越
                if '..' in rel or rel.startswith('/'):
                    self.send_response(403)
                    self.send_header('Content-Type', 'application/json; charset=utf-8')
                    self.end_headers()
                    self.wfile.write(json.dumps({'ok': False, 'error': '非法路径'}).encode('utf-8'))
                    return
                root_abs = os.path.abspath(self.directory)
                abs_path = os.path.abspath(os.path.join(root_abs, rel))
                if abs_path != root_abs and not abs_path.startswith(root_abs + os.sep):
                    self.send_response(403)
                    self.send_header('Content-Type', 'application/json; charset=utf-8')
                    self.end_headers()
                    self.wfile.write(json.dumps({'ok': False, 'error': '非法路径'}).encode('utf-8'))
                    return
                # 写入前备份原文件（仅当已存在）
                if os.path.exists(abs_path):
                    try:
                        ts = time.strftime('%Y%m%d%H%M%S')
                        backup_dir = os.path.join(root_abs, 'backups', 'save_' + ts)
                        os.makedirs(backup_dir, exist_ok=True)
                        with open(abs_path, 'rb') as _r:
                            with open(os.path.join(backup_dir, os.path.basename(abs_path)), 'wb') as _w:
                                _w.write(_r.read())
                    except Exception:
                        pass
                d = os.path.dirname(abs_path)
                if d and not os.path.exists(d):
                    os.makedirs(d, exist_ok=True)
                with open(abs_path, 'w', encoding='utf-8') as _f:
                    _f.write(html)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'ok': True, 'path': rel}).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'text/plain; charset=utf-8')
                self.end_headers()
                self.wfile.write(str(e).encode('utf-8'))
            return
        if self.path == '/api/save-about':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length) if content_length > 0 else b'{}'
                payload = json.loads(body.decode('utf-8'))
                html = payload.get('html', '') or ''
                root_abs = os.path.abspath(self.directory)
                rel = payload.get('path') or 'footer/index.html'
                # 安全校验：目标路径必须在 web 根目录内
                abs_path = os.path.abspath(os.path.join(root_abs, rel))
                if not abs_path.startswith(root_abs + os.sep) and abs_path != root_abs:
                    self.send_response(403)
                    self.send_header('Content-Type', 'application/json; charset=utf-8')
                    self.end_headers()
                    self.wfile.write(json.dumps({'ok': False, 'error': '非法路径'}).encode('utf-8'))
                    return
                # 写入前备份原文件（仅当已存在）
                if os.path.exists(abs_path):
                    try:
                        ts = time.strftime('%Y%m%d%H%M%S')
                        backup_dir = os.path.join(root_abs, 'backups', 'footer_' + ts)
                        os.makedirs(backup_dir, exist_ok=True)
                        fname = os.path.basename(abs_path) or 'index.html'
                        with open(abs_path, 'rb') as _r:
                            with open(os.path.join(backup_dir, fname), 'wb') as _w:
                                _w.write(_r.read())
                    except Exception:
                        pass
                d = os.path.dirname(abs_path)
                if d and not os.path.exists(d):
                    os.makedirs(d, exist_ok=True)
                with open(abs_path, 'w', encoding='utf-8') as _f:
                    _f.write(html)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"ok":true}')
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'text/plain; charset=utf-8')
                self.end_headers()
                self.wfile.write(str(e).encode('utf-8'))
            return
        if self.path == '/api/save-template':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length) if content_length > 0 else b'{}'
                payload = json.loads(body.decode('utf-8'))
                files = payload.get('files') if isinstance(payload.get('files'), list) else []
                # 仅允许覆盖这些初始模板文件，杜绝路径穿越
                # 同时允许任意 template/<名称>/index.html（多模板切换时由前端动态传入）
                import re as _re
                ALLOWED = {'index.html', 'footer/index.html', 'template/页脚/关于导航/index.html', 'template/页脚/网站提交/index.html', 'commit.html', '404.html'}
                _tpl_re = _re.compile(r'^template/[^/]+(?:/[^/]+)*/index\.html$')
                root_abs = os.path.abspath(self.directory)
                ts = time.strftime('%Y%m%d%H%M%S')
                backup_dir = os.path.join(root_abs, 'backups', 'template_' + ts)
                written = []
                for item in files:
                    if not isinstance(item, dict):
                        continue
                    rel = (item.get('path') or '').replace('\\', '/').strip('/')
                    if rel not in ALLOWED and not _tpl_re.match(rel):
                        continue
                    abs_path = os.path.abspath(os.path.join(root_abs, rel))
                    # 安全校验：目标必须在 web 根目录内
                    if abs_path != root_abs and not abs_path.startswith(root_abs + os.sep):
                        continue
                    # 写入前备份原文件（仅当已存在）
                    if os.path.exists(abs_path):
                        try:
                            os.makedirs(backup_dir, exist_ok=True)
                            bak_name = rel.replace('/', '_')
                            with open(abs_path, 'rb') as _r:
                                with open(os.path.join(backup_dir, bak_name), 'wb') as _w:
                                    _w.write(_r.read())
                        except Exception:
                            pass
                    d = os.path.dirname(abs_path)
                    if d and not os.path.exists(d):
                        os.makedirs(d, exist_ok=True)
                    with open(abs_path, 'w', encoding='utf-8') as _f:
                        _f.write(item.get('content') or '')
                    written.append(rel)
                # 没有写入任何文件时视为失败，避免前端静默误判为成功
                if not written:
                    msg = json.dumps({
                        'ok': False,
                        'error': '没有匹配到允许写入的模板文件，请确认模板路径是否正确',
                        'received': [item.get('path') for item in files if isinstance(item, dict)],
                        'backup': os.path.relpath(backup_dir, root_abs) if os.path.exists(backup_dir) else None
                    }, ensure_ascii=False)
                else:
                    msg = json.dumps({
                        'ok': True,
                        'written': written,
                        'backup': os.path.relpath(backup_dir, root_abs)
                    }, ensure_ascii=False)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(msg.encode('utf-8'))
            except Exception as e:
                import traceback
                err = json.dumps({'ok': False, 'error': str(e), 'trace': traceback.format_exc()}, ensure_ascii=False)
                self.send_response(500)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(err.encode('utf-8'))
            return
        if self.path == '/api/deployment-files':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length) if content_length > 0 else b'{}'
                payload = json.loads(body.decode('utf-8'))
                files = self._collect_deploy_files(payload)
                out = [{'path': p, 'content': c, 'binary': b} for p, c, b in files]
                msg = json.dumps({'ok': True, 'files': out}, ensure_ascii=False)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(msg.encode('utf-8'))
            except Exception as e:
                import traceback
                err = traceback.format_exc()
                msg = json.dumps({'error': str(e), 'trace': err}, ensure_ascii=False)
                self.send_response(500)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(msg.encode('utf-8'))
            return
        if self.path == '/api/deployment-zip':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length) if content_length > 0 else b'{}'
                payload = json.loads(body.decode('utf-8'))

                # 大文件走 "保存到本地再 GET 下载" 分支，避免 headless Chrome 处理大 blob 返回 204
                if payload.get('download'):
                    import random
                    # 导出前先清理目录里所有历史 deploy 临时压缩包（含旧 bug 残留的 deploy.zip），
                    # 避免任何残留文件留在磁盘、或被下一次打包收集进去
                    for _f in os.listdir(self.directory):
                        if _f.startswith('deploy') and _f.endswith('.zip'):
                            try:
                                os.remove(os.path.join(self.directory, _f))
                            except Exception:
                                pass
                    # 优先按「历史版本部署文件夹」原样打包（web/<site>/<version>/<group>），
                    # 前端传入 site + version 时走此分支；否则沿用旧逻辑（前端生成 HTML + 收集资源）。
                    if payload.get('site') and payload.get('version'):
                        storage = SiteStorage(self.directory)
                        group = payload.get('group') or 'deploy1'
                        zip_bytes = storage.build_version_deploy_zip(payload['site'], payload['version'], group)
                        if zip_bytes is None:
                            raise ValueError('版本部署文件夹不存在: %s/%s/%s' % (payload['site'], payload['version'], group))
                    else:
                        zip_bytes = self._build_zip(payload)
                    # 用唯一临时文件名，避免与上一次导出的 deploy.zip 同名而被重新打包进去
                    stamp = int(time.time() * 1000)
                    rnd = random.randint(1000, 9999)
                    zip_name = f'deploy_{stamp}_{rnd}.zip'
                    zip_path = os.path.join(self.directory, zip_name)
                    with open(zip_path, 'wb') as f:
                        f.write(zip_bytes)
                    # 显示文件名：与版本历史名称一致（前端传入，已清洗）；缺省 deploy
                    disp_name = _sanitize_deploy_name(payload.get('fileName')) or 'deploy'
                    _DEPLOY_NAMES[zip_name] = disp_name
                    msg = json.dumps({
                        'ok': True,
                        'url': '/' + zip_name,
                        'size': len(zip_bytes),
                        'fileName': disp_name,
                        'source': 'version' if (payload.get('site') and payload.get('version')) else 'generate'
                    }, ensure_ascii=False)
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json; charset=utf-8')
                    self.send_header('Cache-Control', 'no-store')
                    self.end_headers()
                    self.wfile.write(msg.encode('utf-8'))
                    return

                self._send_zip(payload)
            except Exception as e:
                import traceback
                err = traceback.format_exc()
                msg = json.dumps({'error': str(e), 'trace': err}, ensure_ascii=False)
                self.send_response(500)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(msg.encode('utf-8'))
        elif self.path == '/api/open-folder':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length) if content_length > 0 else b'{}'
                payload = json.loads(body.decode('utf-8'))
                rel = payload.get('path', '').replace('\\', '/').strip('/')
                # 白名单：wallpapers 父目录 + 8 个分类子文件夹
                ALLOWED = (
                    'assets/images/wallpapers',
                    'assets/images/wallpapers/画布', 'assets/images/wallpapers/壁纸（渐变）',
                    'assets/images/wallpapers/图案纹理', 'assets/images/wallpapers/自然风景',
                    'assets/images/wallpapers/商务简约', 'assets/images/wallpapers/暗色系',
                    'assets/images/wallpapers/自然科学', 'assets/images/wallpapers/金融',
                )
                if rel not in ALLOWED:
                    msg = json.dumps({'ok': False, 'error': '不允许打开此路径'}, ensure_ascii=False)
                    self.send_response(403)
                    self.send_header('Content-Type', 'application/json; charset=utf-8')
                    self.send_header('Cache-Control', 'no-store')
                    self.end_headers()
                    self.wfile.write(msg.encode('utf-8'))
                    return
                abs_path = os.path.abspath(os.path.join(self.directory, rel))
                if not os.path.exists(abs_path):
                    msg = json.dumps({'ok': False, 'error': f'路径不存在: {rel}'}, ensure_ascii=False)
                    self.send_response(404)
                    self.send_header('Content-Type', 'application/json; charset=utf-8')
                    self.send_header('Cache-Control', 'no-store')
                    self.end_headers()
                    self.wfile.write(msg.encode('utf-8'))
                    return
                if os.name == 'nt':
                    open_folder_in_front(abs_path)
                else:
                    import platform
                    sys_name = platform.system()
                    if sys_name == 'Darwin':
                        subprocess.Popen(['open', abs_path])
                    else:
                        subprocess.Popen(['xdg-open', abs_path])
                msg = json.dumps({'ok': True, 'path': abs_path}, ensure_ascii=False)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(msg.encode('utf-8'))
            except Exception as e:
                import traceback
                msg = json.dumps({'ok': False, 'error': str(e), 'trace': traceback.format_exc()}, ensure_ascii=False)
                self.send_response(500)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(msg.encode('utf-8'))
        elif self.path == '/api/list-footer-html':
            # 返回 footer/ 目录下所有 .html 文件的相对路径列表，供前端下拉框选择
            try:
                about_dir = os.path.abspath(os.path.join(self.directory, 'footer'))
                os.makedirs(about_dir, exist_ok=True)
                files = []
                for f in sorted(os.listdir(about_dir)):
                    if f.lower().endswith('.html') and os.path.isfile(os.path.join(about_dir, f)):
                        files.append('footer/' + f)
                result = json.dumps({'ok': True, 'files': files}, ensure_ascii=False)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(result.encode('utf-8'))
            except Exception as e:
                result = json.dumps({'ok': False, 'error': str(e)}, ensure_ascii=False)
                self.send_response(500)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(result.encode('utf-8'))
        if self.path == '/api/resolve-path':
            # 浏览器原生 file input 选完文件后，前端拿到绝对路径，
            # 调此接口把绝对路径转换为相对于站点根的相对路径（如 footer/about.html）
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length) if content_length > 0 else b'{}'
                payload = json.loads(body.decode('utf-8'))
                abs_path = payload.get('absPath', '').strip()
                if not abs_path:
                    msg = json.dumps({'ok': False, 'error': '路径不能为空'}, ensure_ascii=False)
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json; charset=utf-8')
                    self.end_headers()
                    self.wfile.write(msg.encode('utf-8'))
                    return
                root_abs = os.path.abspath(self.directory)
                file_abs = os.path.abspath(abs_path)
                if not os.path.isfile(file_abs):
                    msg = json.dumps({'ok': False, 'error': '文件不存在'}, ensure_ascii=False)
                    self.send_response(404)
                    self.send_header('Content-Type', 'application/json; charset=utf-8')
                    self.end_headers()
                    self.wfile.write(msg.encode('utf-8'))
                    return
                rel = os.path.relpath(file_abs, root_abs).replace(os.sep, '/')
                msg = json.dumps({'ok': True, 'relative': rel, 'absolute': file_abs}, ensure_ascii=False)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(msg.encode('utf-8'))
            except Exception as e:
                msg = json.dumps({'ok': False, 'error': str(e)}, ensure_ascii=False)
                self.send_response(500)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(msg.encode('utf-8'))
            return
        elif self.path == '/api/pick-about-html':
            # 弹出系统文件选择对话框，限定 footer/ 目录下选择 .html 文件，
            # 返回相对站点根的路径（如 footer/xxx.html），供页脚菜单链接地址回填。
            try:
                about_dir = os.path.abspath(os.path.join(self.directory, 'footer'))
                os.makedirs(about_dir, exist_ok=True)
                import platform
                sys_name = platform.system()
                selected = None
                if sys_name == 'Windows':
                    # 使用 .NET WinForms 打开文件对话框（稳定可用，带 .html 过滤）
                    ps = (
                        "Add-Type -AssemblyName System.Windows.Forms; "
                        "$d = New-Object System.Windows.Forms.OpenFileDialog; "
                        "$d.InitialDirectory = '" + about_dir.replace("'", "''") + "'; "
                        "$d.Filter = 'HTML 文件 (*.html)|*.html|所有文件 (*.*)|*.*'; "
                        "$d.Title = '选择 footer 下的 HTML 文件'; "
                        "$d.CheckFileExists = $true; "
                        "$d.StartPosition = 'CenterScreen'; "
                        "$job = Start-Job -ScriptBlock { "
                        "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class W{[DllImport(\"user32.dll\")]public static extern IntPtr FindWindow(string c,string w);[DllImport(\"user32.dll\")]public static extern bool SetWindowPos(IntPtr h,IntPtr i,int x,int y,int cx,int cy,uint f);[DllImport(\"user32.dll\")]public static extern bool SetForegroundWindow(IntPtr h);public static readonly IntPtr TOPMOST=new IntPtr(-1);}'; "
                        "for($i=0;$i-lt 120;$i++){$h=[W]::FindWindow($null,'选择 footer 下的 HTML 文件');if($h -ne [IntPtr]::Zero){[W]::SetWindowPos($h,[W]::TOPMOST,0,0,0,0,3);[W]::SetForegroundWindow($h);break}Start-Sleep -Milliseconds 50} "
                        "}; "
                        "$r = $d.ShowDialog(); "
                        "Stop-Job $job -ErrorAction SilentlyContinue; "
                        "Remove-Job $job -ErrorAction SilentlyContinue; "
                        "if ($r -eq 'OK') { $d.FileName }; "
                    )
                    proc = subprocess.run(
                        ['powershell', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', ps],
                        capture_output=True, text=True, timeout=300,
                        creationflags=0x08000000  # CREATE_NO_WINDOW
                    )
                    out = (proc.stdout or '').strip()
                    if out:
                        selected = out
                else:
                    # 非 Windows：退化为直接打开 footer 文件夹
                    if sys_name == 'Darwin':
                        subprocess.Popen(['open', about_dir])
                    else:
                        subprocess.Popen(['xdg-open', about_dir])
                if not selected:
                    msg = json.dumps({'ok': False, 'error': '未选择文件'}, ensure_ascii=False)
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json; charset=utf-8')
                    self.send_header('Cache-Control', 'no-store')
                    self.end_headers()
                    self.wfile.write(msg.encode('utf-8'))
                    return
                sel_abs = os.path.abspath(selected)
                # 越界校验：必须是 footer/ 目录内的 .html 文件
                if not sel_abs.startswith(about_dir + os.sep) or not sel_abs.lower().endswith('.html'):
                    msg = json.dumps({'ok': False, 'error': '只能选择 footer 目录下的 .html 文件'}, ensure_ascii=False)
                    self.send_response(403)
                    self.send_header('Content-Type', 'application/json; charset=utf-8')
                    self.send_header('Cache-Control', 'no-store')
                    self.end_headers()
                    self.wfile.write(msg.encode('utf-8'))
                    return
                rel = 'footer/' + os.path.relpath(sel_abs, about_dir).replace(os.sep, '/')
                msg = json.dumps({'ok': True, 'relative': rel, 'absolute': sel_abs}, ensure_ascii=False)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(msg.encode('utf-8'))
            except Exception as e:
                import traceback
                msg = json.dumps({'ok': False, 'error': str(e), 'trace': traceback.format_exc()}, ensure_ascii=False)
                self.send_response(500)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(msg.encode('utf-8'))
        elif self.path == '/api/proxy':
            # 本地反向代理：由后端（Python，走系统网络栈/代理/证书）转发外部 API 请求，
            # 规避浏览器直连 api.cloudflare.com / api.github.com 时的 CORS / 网络层拦截。
            try:
                import urllib.request
                import urllib.error
                content_length = int(self.headers.get('Content-Length', 0))
                raw = self.rfile.read(content_length) if content_length > 0 else b'{}'
                try:
                    payload = json.loads(raw.decode('utf-8'))
                except Exception:
                    payload = {}
                host = (payload.get('host') or '').strip()
                path = (payload.get('path') or '').strip()
                method = (payload.get('method') or 'GET').upper()
                headers = payload.get('headers') or {}
                fwd_body = payload.get('body', None)

                # SSRF 防护：仅允许这两个 API 主机
                ALLOWED_HOSTS = {'api.cloudflare.com', 'api.github.com', 'api.vercel.com', 'api.netlify.com'}
                if host not in ALLOWED_HOSTS:
                    msg = json.dumps({'status': 0, 'error': '不允许的代理主机: ' + host}, ensure_ascii=False)
                    self.send_response(403)
                    self.send_header('Content-Type', 'application/json; charset=utf-8')
                    self.send_header('Cache-Control', 'no-store')
                    self.end_headers()
                    self.wfile.write(msg.encode('utf-8'))
                    return

                if not path.startswith('/'):
                    path = '/' + path
                url = 'https://' + host + path

                # 构造转发请求头（去掉逐跳头与浏览器特有头）
                fwd_headers = {}
                for k, v in headers.items():
                    lk = k.lower()
                    if lk in ('host', 'content-length', 'connection', 'accept-encoding', 'origin', 'referer'):
                        continue
                    fwd_headers[k] = v

                data = None
                if fwd_body is not None and method != 'GET':
                    if isinstance(fwd_body, (dict, list)):
                        data = json.dumps(fwd_body, ensure_ascii=False).encode('utf-8')
                        fwd_headers.setdefault('Content-Type', 'application/json')
                    elif isinstance(fwd_body, str):
                        data = fwd_body.encode('utf-8')
                    else:
                        data = fwd_body

                req = urllib.request.Request(url, data=data, method=method)
                for k, v in fwd_headers.items():
                    req.add_header(k, v)

                try:
                    with urllib.request.urlopen(req, timeout=60) as resp:
                        status = resp.status
                        resp_body = resp.read()
                        resp_ct = resp.headers.get('Content-Type', '')
                except urllib.error.HTTPError as e:
                    status = e.code
                    resp_body = e.read()
                    resp_ct = e.headers.get('Content-Type', '')
                except Exception as e:
                    err_msg = json.dumps({'status': 0, 'error': '代理请求失败: ' + str(e)}, ensure_ascii=False)
                    self.send_response(502)
                    self.send_header('Content-Type', 'application/json; charset=utf-8')
                    self.send_header('Cache-Control', 'no-store')
                    self.end_headers()
                    self.wfile.write(err_msg.encode('utf-8'))
                    return

                try:
                    body_text = resp_body.decode('utf-8')
                except Exception:
                    body_text = resp_body.decode('latin-1', 'replace')

                out = json.dumps({'status': status, 'contentType': resp_ct, 'body': body_text}, ensure_ascii=False)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(out.encode('utf-8'))
            except Exception as e:
                import traceback
                err = json.dumps({'status': 0, 'error': str(e), 'trace': traceback.format_exc()}, ensure_ascii=False)
                self.send_response(500)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(err.encode('utf-8'))
        elif self.path == '/api/upload-footer-html':
            try:
                about_dir = os.path.abspath(os.path.join(self.directory, 'footer'))
                os.makedirs(about_dir, exist_ok=True)
                ctype = self.headers.get('Content-Type', '')
                if 'multipart/form-data' not in ctype:
                    msg = json.dumps({'ok': False, 'error': '需要 multipart/form-data'}, ensure_ascii=False)
                    self.send_response(400); self.send_header('Content-Type', 'application/json; charset=utf-8'); self.end_headers()
                    self.wfile.write(msg.encode('utf-8'))
                    return
                clen = int(self.headers.get('Content-Length', '0'))
                body = self.rfile.read(clen)
                # Python 3.13: cgi 已移除，改用 email 模块解析 multipart
                import email.parser, email.policy
                body_with_header = ('Content-Type: ' + ctype + '\r\n\r\n').encode() + body
                parser = email.parser.BytesFeedParser(policy=email.policy.HTTP)
                parser.feed(body_with_header)
                msg = parser.close()
                filename = None
                filedata = None
                if msg.is_multipart():
                    for part in msg.walk():
                        if part.get_content_maintype() == 'multipart':
                            continue
                        fn = part.get_filename()
                        if fn:
                            filename = os.path.basename(fn.replace('\\', '/'))
                            filedata = part.get_payload(decode=True)
                            if filedata is None:
                                filedata = b''
                            break
                if not filename or filedata is None:
                    msg_out = json.dumps({'ok': False, 'error': '未收到文件'}, ensure_ascii=False)
                    self.send_response(400); self.send_header('Content-Type', 'application/json; charset=utf-8'); self.end_headers()
                    self.wfile.write(msg_out.encode('utf-8'))
                    return
                fname, fext = os.path.splitext(filename)
                if fext.lower() != '.html':
                    filename = fname + '.html'
                dest = os.path.join(about_dir, filename)
                with open(dest, 'wb') as f:
                    f.write(filedata)
                rel_path = 'footer/' + filename
                msg_out = json.dumps({'ok': True, 'relative': rel_path}, ensure_ascii=False)
                self.send_response(200); self.send_header('Content-Type', 'application/json; charset=utf-8'); self.send_header('Cache-Control', 'no-store'); self.end_headers()
                self.wfile.write(msg_out.encode('utf-8'))
            except Exception as e:
                msg_out = json.dumps({'ok': False, 'error': '上传失败：' + str(e)}, ensure_ascii=False)
                self.send_response(500); self.send_header('Content-Type', 'application/json; charset=utf-8'); self.end_headers()
                self.wfile.write(msg_out.encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

    def end_headers(self):
        # 对需要频繁修改的文件类型，添加 Cache-Control: no-store 响应头
        path = self.path.split('?')[0]
        ext = ''
        if '.' in path:
            _, ext = path.rsplit('.', 1)
            ext = '.' + ext
        if ext in self.CACHE_BUST_EXTS or not ext or self.path.endswith('/'):
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
        super().end_headers()

    # 类级日志回调：由 LauncherApp 注入；为 None 时不输出
    log_sink = None

    def log_message(self, format, *args):
        sink = SilentHTTPRequestHandler.log_sink
        if sink:
            try:
                sink(self.address_string() + ' - ' + (format % args))
            except Exception:
                pass

    def log_request(self, code='-', size='-'):
        sink = SilentHTTPRequestHandler.log_sink
        if sink:
            try:
                sink('%s %s -> %s' % (self.command, self.path.split('?')[0], code))
            except Exception:
                pass

    def log_error(self, format, *args):
        sink = SilentHTTPRequestHandler.log_sink
        if sink:
            try:
                sink('ERROR ' + (format % args))
            except Exception:
                pass


class StoppableHTTPServer(http.server.ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True


def _hex_to_rgb(h):
    h = h.lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def _rgb_to_hex(rgb):
    return '#%02x%02x%02x' % tuple(max(0, min(255, int(v))) for v in rgb)


def _shade(hex_color, amount):
    """amount>0 提亮，<0 加深"""
    r, g, b = _hex_to_rgb(hex_color)
    return _rgb_to_hex((r + amount, g + amount, b + amount))


def _interpolate(h1, h2, t):
    """在两种颜色之间线性插值，t∈[0,1]"""
    r1, g1, b1 = _hex_to_rgb(h1)
    r2, g2, b2 = _hex_to_rgb(h2)
    r = int(r1 + (r2 - r1) * t)
    g = int(g1 + (g2 - g1) * t)
    b = int(b1 + (b2 - b1) * t)
    return _rgb_to_hex((r, g, b))
class RoundedButton(tk.Canvas):
    """纯 Canvas 实现的渐变圆角按钮 — 自适应宽度、hover 提亮、可禁用

    渐变由主色自动派生（底部略深），形成有质感的立体按钮。
    """

    def __init__(self, master, text='', color='#6366f1', text_color='white',
                 command=None, big=False, radius=12, width=None, font_size=None, **kw):
        self._text = text
        self._text_color = text_color
        self._command = command
        self._big = big
        self._font_size = font_size
        self._radius = radius
        self._enabled = True
        self._hover = False
        self._pulse = 0
        h = 38 if big else 32
        # 调用方可能显式传 height=None（如 _make_btn 未指定高度时），
        # 此时应回退到默认高度，否则 Canvas 会用内置默认高度 264 被拉成竖条
        if not kw.get('height'):
            kw['height'] = h
        if width is not None:
            kw['width'] = width
        elif 'width' not in kw:
            # Canvas 默认请求 388px 宽，会让 pack(fill=X, expand=True) 的按钮撑爆容器；
            # 未显式指定宽度时请求最小宽度，由布局系统按容器宽度自适应分配
            kw['width'] = 1
        super().__init__(master, bg=master.cget('bg'),
                         highlightthickness=0, bd=0, **kw)
        self._set_color(color)
        self.bind('<Configure>', self._redraw)
        self.bind('<Enter>', self._on_enter)
        self.bind('<Leave>', self._on_leave)
        self.bind('<Button-1>', self._on_click)
        self.bind('<ButtonRelease-1>', self._on_release)

    # ---- 颜色管理 ----
    def _set_color(self, color):
        self._color = color
        self._grad_from = color
        self._grad_to = _shade(color, -24)  # 底部略深，形成渐变
        self._hover_from = _shade(color, 18)
        self._hover_to = _shade(color, -6)

    def set_color(self, color):
        self._set_color(color)
        self._redraw()

    def set_enabled(self, enabled):
        self._enabled = enabled
        self._redraw()

    # ---- 绘制 ----
    def _redraw(self, e=None):
        w = self.winfo_width()
        h = self.winfo_height()
        if w < 2 or h < 2:
            return
        self.delete('all')
        if not self._enabled:
            cfrom = cto = COLORS['disabled']
        elif self._hover:
            cfrom, cto = self._hover_from, self._hover_to
        else:
            cfrom, cto = self._grad_from, self._grad_to
        self._gradient_round_rect(0, 0, w, h, self._radius, cfrom, cto)
        # 顶部 1px 高光，增加精致质感
        hl = _shade(cfrom, 36)
        self.create_line(self._radius, 1.5, w - self._radius, 1.5,
                         fill=hl, width=1)
        tc = self._text_color if self._enabled else COLORS['text_mute']
        fs = self._font_size or (13 if self._big else 11)
        self.create_text(w / 2, h / 2, text=self._text, fill=tc,
                         font=("Microsoft YaHei UI", fs,
                               "bold" if self._big else "normal"),
                         anchor='center')

    def _gradient_round_rect(self, x1, y1, x2, y2, r, cf, ct):
        w = x2 - x1
        h = y2 - y1
        if h <= 0 or w <= 0:
            return
        r = min(r, h // 2, w // 2)
        for i in range(h):
            yc = i
            if yc < r:
                d = r - int(round(math.sqrt(max(0, r * r - (r - yc) ** 2))))
            elif yc > h - r - 1:
                dy = yc - (h - r - 1)
                d = r - int(round(math.sqrt(max(0, r * r - (r - dy) ** 2))))
            else:
                d = 0
            xx1 = x1 + d
            xx2 = x2 - d
            if xx2 <= xx1:
                continue
            t = i / (h - 1) if h > 1 else 0
            col = _interpolate(cf, ct, t)
            self.create_rectangle(xx1, y1 + i, xx2, y1 + i + 1,
                                  fill=col, outline=col)

    # ---- 交互 ----
    def _on_enter(self, e):
        self._hover = True
        self._redraw()

    def _on_leave(self, e):
        self._hover = False
        self._redraw()

    def _on_click(self, e):
        if not self._enabled:
            return
        self._flash()

    def _on_release(self, e):
        if not self._enabled:
            return
        if self._command:
            self._command()

    def _flash(self):
        # 按下瞬间轻微变暗反馈
        old_from, old_to = self._hover_from, self._hover_to
        self._hover_from = _shade(self._color, -10)
        self._hover_to = _shade(self._color, -28)
        self._redraw()
        self.after(90, lambda: setattr(self, '_hover_from', old_from)
                   or setattr(self, '_hover_to', old_to) or self._redraw())

    def set_text(self, text):
        self._text = text
        self._redraw()

    def configure(self, **kw):
        # 兼容 .config(state=..., bg=..., fg=..., text=...) 调用
        if 'bg' in kw and kw['bg'] not in (None, ''):
            self.set_color(kw['bg'])
        if 'state' in kw:
            self.set_enabled(kw['state'] != tk.DISABLED)
        if 'fg' in kw and kw['fg']:
            self._text_color = kw['fg']
            self._redraw()
        if 'text' in kw:
            self._text = kw['text']
            self._redraw()

    # tkinter 的 .config() 会走 C 层，不会自动映射到 Python 的 configure()，必须显式定义别名
    config = configure


class LauncherApp:
    def __init__(self):
        self._enable_dpi_awareness()
        self._set_windows_app_id()
        self.root = tk.Tk()
        self.root.title("导航站编辑器")
        self.root.geometry("860x640")
        self.root.minsize(760, 560)
        self.root.configure(bg=COLORS['bg'])
        self._taskbar_icon_handles = []

        # 窗口图标（打包后从 _MEIPASS 取，开发时从脚本同目录取）
        self._ico_path = None
        try:
            if getattr(sys, 'frozen', False):
                _base = sys._MEIPASS
            else:
                _base = os.path.dirname(os.path.abspath(__file__))
            self._ico_path = os.path.join(_base, 'app_icon.ico')
            _startup_log('icon init: _base=%s _ico_path=%s exists=%s' % (_base, self._ico_path, os.path.exists(self._ico_path)))
            if os.path.exists(self._ico_path):
                try:
                    self.root.iconbitmap(default=self._ico_path)
                except Exception:
                    self.root.iconbitmap(self._ico_path)
                _startup_log('icon init: iconbitmap OK')
            else:
                _startup_log('icon init: iconbitmap SKIPPED (file not found)')
        except Exception as e:
            _startup_log('icon init: iconbitmap ERROR %s' % e)

        # 立即设置任务栏图标（窗口显示前设置类图标，任务栏按钮创建时就会继承）
        self._fix_taskbar_icon()

        # 居中窗口
        self.root.update_idletasks()
        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        w, h = 860, 640
        x = (sw - w) // 2
        y = (sh - h) // 2
        self.root.geometry(f"{w}x{h}+{x}+{y}")

        self.httpd = None
        self.server_thread = None
        self.project_dir = get_project_dir()
        self.config = load_config()
        self._register_fa_font()
        _startup_log('__init__ start; frozen=%s theme=%s' % (getattr(sys, 'frozen', False), self.config.get('theme')))
        # 应用已保存的主题（浅 / 深）
        set_theme(self.config.get('theme', 'light'))
        self._server_running = False
        self._in_tray = False
        self._tray_window = None

        # ttk 样式
        self._init_ttk_styles()

        # 服务器日志回调：HTTP 访问日志写入控制台日志面板
        SilentHTTPRequestHandler.log_sink = self._append_log

        self.setup_ui()
        self.root.after(250, self._fix_taskbar_icon)
        self.root.after(1200, self._fix_taskbar_icon)
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

        # 自动启动（按用户配置的延迟，最低 300ms 减少等待感）
        try:
            delay = int(self.config.get('startup_delay_ms', 300))
        except (TypeError, ValueError):
            delay = 300
        self.root.after(max(100, delay), self.auto_start)
        _startup_log('__init__ done; auto_start scheduled in %dms' % max(100, delay))

    def _register_fa_font(self):
        """私有注册 FontAwesome 品牌字体，供头部 GitHub 标志使用（不污染系统字体库）。"""
        self._fa_font_loaded = False
        if sys.platform != 'win32':
            return
        try:
            import ctypes
            ttf = os.path.join(self.project_dir, 'assets', 'fontawesome-5.15.4', 'webfonts', 'fa-brands-400.ttf')
            if os.path.exists(ttf):
                FR_PRIVATE = 0x10
                ctypes.windll.gdi32.AddFontResourceExW(ttf, FR_PRIVATE, 0)
                self._fa_font_loaded = True
        except Exception:
            pass

    def _enable_dpi_awareness(self):
        """启用 Windows DPI 感知，保证高分屏（125%/150% 缩放）下文字与控件清晰锐利。"""
        if sys.platform != 'win32':
            return
        try:
            import ctypes
            try:
                ctypes.windll.shcore.SetProcessDpiAwareness(1)
            except Exception:
                ctypes.windll.user32.SetProcessDPIAware()
        except Exception:
            pass

    def _set_windows_app_id(self):
        if sys.platform != 'win32':
            return
        try:
            import ctypes
            appid = "NavEditor.App.FixedIcon.20260805"
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(appid)
            _startup_log('icon init: AppUserModelID set before Tk to %s' % appid)
        except Exception as e:
            _startup_log('icon init: AppUserModelID ERROR %s' % e)

    def _fix_taskbar_icon(self):
        """Apply the app ico to the Tk window class and taskbar button."""
        if sys.platform != 'win32' or not self._ico_path or not os.path.exists(self._ico_path):
            return
        try:
            import ctypes
            from ctypes import wintypes

            user32 = ctypes.windll.user32
            user32.GetSystemMetrics.argtypes = [ctypes.c_int]
            user32.GetSystemMetrics.restype = ctypes.c_int
            user32.LoadImageW.argtypes = [
                wintypes.HINSTANCE,
                wintypes.LPCWSTR,
                wintypes.UINT,
                ctypes.c_int,
                ctypes.c_int,
                wintypes.UINT,
            ]
            user32.LoadImageW.restype = wintypes.HANDLE
            user32.SendMessageW.argtypes = [
                wintypes.HWND,
                wintypes.UINT,
                ctypes.c_size_t,
                ctypes.c_ssize_t,
            ]
            user32.SendMessageW.restype = ctypes.c_ssize_t

            self.root.update_idletasks()
            hwnd = int(self.root.winfo_id())
            if not hwnd:
                return

            IMAGE_ICON = 1
            LR_LOADFROMFILE = 0x00000010
            WM_SETICON = 0x0080
            ICON_SMALL = 0
            ICON_BIG = 1
            ICON_SMALL2 = 2
            GCLP_HICON = -14
            GCLP_HICONSM = -34
            SM_CXICON = 11
            SM_CYICON = 12
            SM_CXSMICON = 49
            SM_CYSMICON = 50

            big_w = user32.GetSystemMetrics(SM_CXICON) or 32
            big_h = user32.GetSystemMetrics(SM_CYICON) or 32
            small_w = user32.GetSystemMetrics(SM_CXSMICON) or 16
            small_h = user32.GetSystemMetrics(SM_CYSMICON) or 16

            hicon_big = user32.LoadImageW(None, self._ico_path, IMAGE_ICON, big_w, big_h, LR_LOADFROMFILE)
            hicon_small = user32.LoadImageW(None, self._ico_path, IMAGE_ICON, small_w, small_h, LR_LOADFROMFILE)
            if not hicon_big and not hicon_small:
                return

            if not hicon_big:
                hicon_big = hicon_small
            if not hicon_small:
                hicon_small = hicon_big

            try:
                set_class_long = user32.SetClassLongPtrW
                set_class_long.argtypes = [wintypes.HWND, ctypes.c_int, ctypes.c_ssize_t]
                set_class_long.restype = ctypes.c_ssize_t
            except AttributeError:
                set_class_long = user32.SetClassLongW
                set_class_long.argtypes = [wintypes.HWND, ctypes.c_int, ctypes.c_long]
                set_class_long.restype = ctypes.c_long

            set_class_long(hwnd, GCLP_HICON, hicon_big)
            set_class_long(hwnd, GCLP_HICONSM, hicon_small)
            user32.SendMessageW(hwnd, WM_SETICON, ICON_BIG, hicon_big)
            user32.SendMessageW(hwnd, WM_SETICON, ICON_SMALL, hicon_small)
            user32.SendMessageW(hwnd, WM_SETICON, ICON_SMALL2, hicon_small)
            self._taskbar_icon_handles = [h for h in (hicon_big, hicon_small) if h]
            _startup_log('_fix_taskbar_icon: done big=%s small=%s' % (hicon_big, hicon_small))
        except Exception as e:
            _startup_log('_fix_taskbar_icon: EXCEPTION %s' % e)

    def _init_ttk_styles(self):
        """初始化 ttk 样式（Combobox、Spinbox、Checkbutton 等）— 浅色风格"""
        style = ttk.Style()
        try:
            style.theme_use('clam')
        except Exception:
            pass

        # Combobox — 浅色输入框
        style.configure('TCombobox',
                        fieldbackground=COLORS['bg_inset'],
                        background=COLORS['bg_inset'],
                        foreground=COLORS['text'],
                        arrowcolor=COLORS['text_dim'],
                        bordercolor=COLORS['border'],
                        borderwidth=1,
                        relief='solid',
                        arrowsize=16,
                        padding=(8, 5),
                        font=("Microsoft YaHei UI", 10))
        style.map('TCombobox',
                  bordercolor=[('focus', COLORS['accent'])],
                  fieldbackground=[('readonly', COLORS['bg_inset'])],
                  background=[('readonly', COLORS['bg_inset'])],
                  arrowcolor=[('active', COLORS['accent'])],
                  selectbackground=[('readonly', COLORS['accent'])],
                  selectforeground=[('readonly', '#fff')])
        # 下拉列表（弹层）样式：统一字体与间距，避免默认小字/拥挤
        try:
            style.configure('TCombobox.Listbox',
                            font=("Microsoft YaHei UI", 10),
                            background=COLORS['bg_elevated'],
                            foreground=COLORS['text'],
                            selectbackground=COLORS['accent'],
                            selectforeground='#ffffff',
                            borderwidth=1,
                            relief='solid')
        except Exception:
            pass

        # Spinbox — 浅色输入框
        style.configure('TSpinbox',
                        fieldbackground=COLORS['bg_inset'],
                        background=COLORS['bg_inset'],
                        foreground=COLORS['text'],
                        arrowcolor=COLORS['text_dim'],
                        bordercolor=COLORS['border'],
                        borderwidth=1,
                        relief='solid',
                        arrowsize=16,
                        padding=(8, 5),
                        font=("Consolas", 10))
        style.map('TSpinbox',
                  bordercolor=[('focus', COLORS['accent'])],
                  background=[('readonly', COLORS['bg_inset'])],
                  arrowcolor=[('active', COLORS['accent'])])

        # Checkbutton — 基础样式（保留备用）
        style.configure('TCheckbutton',
                        background=COLORS['bg'],
                        foreground=COLORS['text'],
                        focuscolor=COLORS['bg_inset'],
                        font=("Microsoft YaHei UI", 10))
        style.map('TCheckbutton',
                  background=[('active', COLORS['bg'])],
                  foreground=[('active', COLORS['text'])])

    def _make_custom_cb(self, parent, text, var):
        """自定义复选框：勾选显示绿色 ✅，未勾选留空"""
        base = parent.cget('bg')
        frame = tk.Frame(parent, bg=base, cursor='hand2')
        icon_label = tk.Label(frame, text='', font=('Segoe UI Emoji', 14),
                              bg=base, width=2, anchor='center')
        icon_label.pack(side=tk.LEFT)
        txt_label = tk.Label(frame, text=text, font=("Microsoft YaHei UI", 10),
                              bg=base, fg=COLORS['text'])
        txt_label.pack(side=tk.LEFT, padx=(6, 0))

        def update_icon():
            icon_label.config(text='✅' if var.get() else '')
            icon_label.config(fg='#27ae60' if var.get() else COLORS['text_mute'])

        def toggle():
            var.set(not var.get())
            update_icon()

        update_icon()
        icon_label.bind('<Button-1>', lambda e: toggle())
        txt_label.bind('<Button-1>', lambda e: toggle())
        frame.bind('<Button-1>', lambda e: toggle())
        return frame

    def _make_btn(self, parent, text, icon, color, command, big=False, text_color='white', width=None, height=None, font_size=None):
        """统一风格的渐变按钮"""
        label = f"{icon}  {text}" if icon else text
        btn = RoundedButton(
            parent, text=label, color=color, text_color=text_color,
            command=command, big=big, radius=14, width=width, height=height, font_size=font_size
        )
        return btn

    def _darken(self, hex_color, amount=20):
        """颜色加深（兼容保留）"""
        return _shade(hex_color, -amount)

    def _lighten(self, hex_color, amount=20):
        """颜色提亮（兼容保留）"""
        return _shade(hex_color, amount)

    def setup_ui(self):
        # ====== 主体：左侧导航栏 + 内容区 ======
        body = tk.Frame(self.root, bg=COLORS['bg'])
        body.pack(fill=tk.BOTH, expand=True)

        sidebar = tk.Frame(body, bg=COLORS['bg_elevated'], width=192)
        sidebar.pack(side=tk.LEFT, fill=tk.Y)
        sidebar.pack_propagate(False)
        self.sidebar = sidebar

        # 侧栏顶部品牌区
        brand = tk.Frame(sidebar, bg=COLORS['bg_elevated'])
        brand.pack(fill=tk.X, pady=(18, 8))
        tk.Label(brand, text="管理控制台", font=("Microsoft YaHei UI", 13, "bold"),
                 bg=COLORS['bg_elevated'], fg=COLORS['text']).pack(anchor=tk.W, padx=20)
        tk.Label(brand, text="NAV EDITOR", font=("Consolas", 8, "bold"),
                 bg=COLORS['bg_elevated'], fg=COLORS['text_mute']).pack(anchor=tk.W, padx=20, pady=(2, 0))
        tk.Frame(sidebar, bg=COLORS['border_soft'], height=1).pack(fill=tk.X, padx=14, pady=(10, 8))

        self.tab_meta = {
            'console': {'label': '控制台', 'icon': '▦'},
            'settings': {'label': '设置', 'icon': '⚙'},
            'about': {'label': '关于', 'icon': 'ⓘ'},
        }
        self.tab_buttons = {}
        self.scroll_canvases = {}
        for tid in ['console', 'settings', 'about']:
            btn = self._make_tab_button(sidebar, tid)
            btn.pack(fill=tk.X, padx=10, pady=3)

        # 侧栏底部：服务器状态指示
        side_footer = tk.Frame(sidebar, bg=COLORS['bg_elevated'])
        side_footer.pack(side=tk.BOTTOM, fill=tk.X, pady=14)
        self.side_status_dot = tk.Label(side_footer, text='●', font=("Arial", 10),
                                        bg=COLORS['bg_elevated'], fg=COLORS['text_mute'])
        self.side_status_dot.pack(side=tk.LEFT, padx=(20, 6))
        self.side_status_lbl = tk.Label(side_footer, text="服务器：未运行",
                                        font=("Microsoft YaHei UI", 9),
                                        bg=COLORS['bg_elevated'], fg=COLORS['text_dim'])
        self.side_status_lbl.pack(side=tk.LEFT)

        # 内容容器
        self.content_container = tk.Frame(body, bg=COLORS['bg'])
        self.content_container.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        self.tabs = {}
        for tid in ['console', 'settings', 'about']:
            f = tk.Frame(self.content_container, bg=COLORS['bg'])
            self.tabs[tid] = f

        # ====== 底部状态栏 ======
        footer = tk.Frame(self.root, bg=COLORS['bg_elevated'], height=30)
        footer.pack(fill=tk.X, side=tk.BOTTOM)
        footer.pack_propagate(False)
        self.footer = footer
        sep = tk.Frame(footer, bg=COLORS['border'], height=1)
        sep.place(relx=0, rely=0, relwidth=1)
        self.footer_var = tk.StringVar(
            value=f"项目: {os.path.basename(self.project_dir)}   |   端口: 自动"
        )
        tk.Label(
            footer, textvariable=self.footer_var,
            font=("Consolas", 9),
            bg=COLORS['bg_elevated'], fg=COLORS['text_mute']
        ).pack(side=tk.LEFT, padx=14)
        # 右侧：v5.0 最右，其左侧依次为 @yiming2016 与 GitHub 图标（点击打开仓库）
        def _open_github(_e=None):
            webbrowser.open("https://github.com/yiming2016/NavEditor")
        gh_icon_text = "\uf09b" if getattr(self, '_fa_font_loaded', False) else "GH"
        gh_icon_font = ("Font Awesome 5 Brands", 11) if getattr(self, '_fa_font_loaded', False) else ("Microsoft YaHei UI", 8, "bold")
        tk.Label(
            footer, text="v5.0",
            font=("Consolas", 9),
            bg=COLORS['bg_elevated'], fg=COLORS['text_mute']
        ).pack(side=tk.RIGHT, padx=(4, 14))
        gh_credit = tk.Label(footer, text="@yiming2016", font=("Microsoft YaHei UI", 9),
                             bg=COLORS['bg_elevated'], fg=COLORS['text_mute'], cursor='hand2')
        gh_credit.pack(side=tk.RIGHT, padx=(0, 10))
        gh_credit.bind("<Button-1>", _open_github)
        gh_icon = tk.Label(footer, text=gh_icon_text, font=gh_icon_font,
                           bg=COLORS['bg_elevated'], fg=COLORS['text_mute'], cursor='hand2')
        gh_icon.pack(side=tk.RIGHT, padx=(0, 6))
        gh_icon.bind("<Button-1>", _open_github)
        # 悬浮高亮：版权信息（图标 + @yiming2016）整体提亮
        def _gh_hover_on(_e):
            gh_credit.config(fg=COLORS['accent'], bg=COLORS['accent_tint'])
            gh_icon.config(fg=COLORS['accent'], bg=COLORS['accent_tint'])
        def _gh_hover_off(_e):
            gh_credit.config(fg=COLORS['text_mute'], bg=COLORS['bg_elevated'])
            gh_icon.config(fg=COLORS['text_mute'], bg=COLORS['bg_elevated'])
        gh_credit.bind("<Enter>", _gh_hover_on)
        gh_credit.bind("<Leave>", _gh_hover_off)
        gh_icon.bind("<Enter>", _gh_hover_on)
        gh_icon.bind("<Leave>", _gh_hover_off)

        # 构建三个标签页内容
        self._build_control_tab()
        self._build_settings_tab()
        self._build_about_tab()
        # 全局滚轮：三个标签页共用同一滚动处理（滚动当前可见页）
        self.root.bind_all("<MouseWheel>", self._on_global_wheel)
        self.root.bind_all("<Button-4>", lambda e: self._on_global_wheel_linux(-1))
        self.root.bind_all("<Button-5>", lambda e: self._on_global_wheel_linux(1))
        self.show_tab('console')

    # ---- 主题热切换：销毁并重建全部 UI（服务器线程不受影响） ----
    def rebuild_ui(self):
        """切换主题等需要刷新配色时，重建整个界面。

        服务器在独立线程运行，重建 UI 不会中断服务。
        """
        # 移除全局滚轮绑定，避免重建后重复叠加
        for b in ("<MouseWheel>", "<Button-4>", "<Button-5>"):
            try:
                self.root.unbind_all(b)
            except Exception:
                pass
        # 销毁顶层 UI 框架
        for w in (getattr(self, 'sidebar', None),
                  getattr(self, 'content_container', None),
                  getattr(self, 'footer', None)):
            try:
                if w:
                    w.destroy()
            except Exception:
                pass
        # 重新应用主题色到 ttk 控件并重建
        set_theme(self.config.get('theme', 'light'))
        self._init_ttk_styles()
        current = getattr(self, '_current_tab', 'console')
        self.setup_ui()
        # 重建后同步服务器运行状态
        if self.httpd:
            self._reflect_running()
        # 恢复到重建前的标签页
        self.show_tab(current)

    def _reflect_running(self):
        """重建 UI 后，依据仍在运行的服务器刷新状态展示"""
        port = ACTUAL_PORT
        if not port:
            return
        bind = str(self.config.get('bind_address', '127.0.0.1'))
        host = self._display_host(bind)
        self._server_running = True
        self._set_status("服务器运行中", COLORS['success'])
        try:
            if getattr(self, 'local_url_var', None):
                self.local_url_var.set(f"http://{host}:{port}/editor.html")
        except Exception:
            pass
        try:
            if getattr(self, 'lan_url_var', None):
                self.lan_url_var.set(f"http://{self._lan_ip()}:{port}/editor.html")
        except Exception:
            pass
        self.footer_var.set(
            f"项目: {os.path.basename(self.project_dir)}   |   "
            f"端口: {port}"
        )
        self._enable_start_btn(False)

    # ---- 侧栏导航项 ----
    def _make_tab_button(self, parent, tid):
        meta = self.tab_meta[tid]
        f = tk.Frame(parent, bg=COLORS['bg_elevated'], cursor='hand2', height=42)
        f.pack_propagate(False)
        icon_lbl = tk.Label(f, text=meta['icon'], font=("Segoe UI Emoji", 13),
                            bg=COLORS['bg_elevated'], fg=COLORS['text_dim'],
                            width=3, anchor='center')
        icon_lbl.pack(side=tk.LEFT, padx=(16, 4))
        text_lbl = tk.Label(f, text=meta['label'], font=("Microsoft YaHei UI", 11, "bold"),
                            bg=COLORS['bg_elevated'], fg=COLORS['text_dim'], anchor='w')
        text_lbl.pack(side=tk.LEFT, fill=tk.X, expand=True)
        ind = tk.Frame(f, bg=COLORS['bg_elevated'], width=3)
        ind.pack(side=tk.LEFT, fill=tk.Y)

        state = {'active': False, 'hover': False}
        def _paint():
            if state['active']:
                bg, fg = COLORS['accent_tint'], COLORS['accent']
            elif state['hover']:
                bg, fg = COLORS['bg_inset'], COLORS['text']
            else:
                bg, fg = COLORS['bg_elevated'], COLORS['text_dim']
            f.config(bg=bg)
            icon_lbl.config(bg=bg, fg=fg)
            text_lbl.config(bg=bg, fg=fg)
            ind.config(bg=COLORS['accent'] if state['active'] else bg)
        def _set_active(active):
            state['active'] = active
            _paint()
        def _on_enter(_e):
            state['hover'] = True
            _paint()
        def _on_leave(_e):
            state['hover'] = False
            _paint()
        def _on_click(_e):
            self.show_tab(tid)
        f._set_active = _set_active
        for wgt in (f, icon_lbl, text_lbl):
            wgt.bind('<Button-1>', _on_click)
            wgt.bind('<Enter>', _on_enter)
            wgt.bind('<Leave>', _on_leave)
        self.tab_buttons[tid] = f
        return f

    def show_tab(self, tid):
        self._current_tab = tid
        self._current_scroll_canvas = self.scroll_canvases.get(tid)
        for k, f in self.tabs.items():
            if k == tid:
                f.pack(fill=tk.BOTH, expand=True)
            else:
                f.pack_forget()
        for k, btn in self.tab_buttons.items():
            btn._set_active(k == tid)

    def _build_control_tab(self):
        """控制台标签页 — 商业级卡片布局（可滚动）"""
        tab = self.tabs['console']

        # 可滚动容器
        canvas = tk.Canvas(tab, bg=COLORS['bg'], highlightthickness=0, bd=0)
        scrollbar = tk.Scrollbar(tab, orient=tk.VERTICAL, command=canvas.yview,
                                 bg=COLORS['bg_elevated'], troughcolor=COLORS['bg'], borderwidth=0, width=10)
        inner = tk.Frame(canvas, bg=COLORS['bg'])
        inner.bind("<Configure>", lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
        inner_window = canvas.create_window((0, 0), window=inner, anchor="nw")
        # 让内容帧始终等于画布可视宽度，避免卡片/按钮横向溢出窗口
        def _fit_inner_width(e):
            canvas.itemconfigure(inner_window, width=e.width)
        canvas.bind("<Configure>", _fit_inner_width)
        canvas.configure(yscrollcommand=scrollbar.set)
        canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.scroll_canvases['console'] = canvas

        # 状态横幅卡片已移除（头部徽章与侧栏仍显示服务器状态，避免与下方访问地址卡重复）
        self.status_var = tk.StringVar(value="正在启动...")

        # ====== 访问地址卡片 ======
        addr_card = self._card(inner)

        self._card_title(addr_card, "访问地址")

        self.local_url_var = tk.StringVar(value="（服务器启动后显示）")
        self.lan_url_var = tk.StringVar(value="（服务器启动后显示）")

        self._make_addr_row(addr_card, "本机地址", self.local_url_var).pack(fill=tk.X, padx=20, pady=(2, 4))
        self._make_addr_row(addr_card, "局域网", self.lan_url_var).pack(fill=tk.X, padx=20, pady=(0, 14))

        # ====== 操作卡片（单行四按钮：更高、更短） ======
        action_card = self._card(inner)
        self._card_title(action_card, "服务器操作")

        btn_grid = tk.Frame(action_card, bg=COLORS['bg_elevated'])
        btn_grid.pack(fill=tk.X, padx=20, pady=(2, 16))

        actions = [
            ("启动", "▶", COLORS['success'], self.start_server, 'start_btn'),
            ("停止", "■", COLORS['danger'], self.stop_server, 'stop_btn'),
            ("编辑器", "🌐", COLORS['accent'], self.open_browser, 'browser_btn'),
            ("预览", "👁", COLORS['purple'], self.open_preview, 'preview_btn'),
        ]
        # 按钮宽度按实际渲染文字宽度自适应（含图标），避免高分屏 DPI 缩放下文字被裁切
        try:
            btn_font = tkfont.Font(family="Microsoft YaHei UI", size=11, weight="bold")
        except Exception:
            btn_font = None
        for i, (text, icon, color, cmd, attr) in enumerate(actions):
            label = f"{icon}  {text}"
            req_w = 104
            if btn_font is not None:
                try:
                    req_w = max(req_w, btn_font.measure(label) + 30)
                except Exception:
                    pass
            btn = self._make_btn(btn_grid, text, icon, color, cmd, big=True, width=req_w, height=44, font_size=11)
            btn.pack(side=tk.LEFT, padx=(0, 8) if i < len(actions) - 1 else 0)
            setattr(self, attr, btn)
        # 初始状态：服务器未启动，仅「启动」可用
        self._enable_start_btn(True)

        # ====== 项目文件卡片（双列网格，整格可点击 + 悬浮高亮） ======
        files_card = self._card(inner)
        self._card_title(files_card, "项目文件")
        files = [
            ("项目根目录", "."),
            ("关于导航模板", "template/页脚/关于导航"),
            ("页脚目录", "footer"),
            ("页脚模板库", "template"),
            ("静态资源", "assets"),
            ("编辑器入口", "editor.html"),
            ("提交 / 部署页", "commit.html"),
            ("配置文件", "launcher.json"),
        ]
        fgrid = tk.Frame(files_card, bg=COLORS['bg_elevated'])
        fgrid.pack(fill=tk.X, padx=16, pady=(4, 16))
        for i in range(0, len(files), 2):
            grid_row = tk.Frame(fgrid, bg=COLORS['bg_elevated'])
            grid_row.pack(fill=tk.X, pady=2)
            for j in range(2):
                idx = i + j
                if idx < len(files):
                    self._build_file_cell(grid_row, files[idx][0], files[idx][1])
                else:
                    tk.Frame(grid_row, bg=COLORS['bg_elevated']).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 8))

        # ====== 服务器日志卡片 ======
        log_card = self._card(inner, pady=(0, 24))
        self._card_title(log_card, "服务器日志")
        self.log_text = tk.Text(log_card, height=7, bg=COLORS['bg_inset'],
                                fg=COLORS['text_dim'], font=("Consolas", 9),
                                relief='flat', state=tk.DISABLED, wrap=tk.WORD,
                                padx=10, pady=8)
        self.log_text.pack(fill=tk.X, padx=12, pady=(2, 14))
        if not self.config.get('show_server_log', True):
            self.log_text.configure(state=tk.NORMAL)
            self.log_text.insert(tk.END, "（服务器日志已关闭，可在「设置」中开启）")
            self.log_text.configure(state=tk.DISABLED)
        else:
            self._append_log_safe("控制台就绪，服务器启动后将显示访问日志。")

    def _card(self, parent, pady=(0, 16)):
        """统一卡片容器：抬升底色 + 细边框"""
        card = tk.Frame(parent, bg=COLORS['bg_elevated'], bd=0,
                        highlightthickness=1, highlightbackground=COLORS['border'])
        card.pack(fill=tk.X, padx=28, pady=pady)
        return card

    def _card_title(self, card, text):
        row = tk.Frame(card, bg=COLORS['bg_elevated'])
        row.pack(fill=tk.X, padx=20, pady=(14, 8))
        tk.Label(row, text=text, font=("Microsoft YaHei UI", 12, "bold"),
                 bg=COLORS['bg_elevated'], fg=COLORS['text']).pack(side=tk.LEFT)
        tk.Frame(card, bg=COLORS['border_soft'], height=1).pack(fill=tk.X, padx=20)

    def _make_addr_row(self, parent, label, var):
        """本机地址 / 局域网 访问地址一行：点击标签直接访问，点击地址复制并绿色提示"""
        row = tk.Frame(parent, bg=COLORS['bg_elevated'])

        lbl = tk.Label(row, text=f"{label}：", font=("Microsoft YaHei UI", 10),
                       bg=COLORS['bg_elevated'], fg=COLORS['accent'], anchor='w',
                       cursor='hand2')
        lbl.pack(side=tk.LEFT)
        # 点击「本机地址 / 局域网地址」→ 直接用默认浏览器打开
        def on_label_click(_e, v=var):
            url = str(v.get())
            if url.startswith('http'):
                webbrowser.open(url)
            else:
                self._toast("服务器未启动，暂无地址", bg=COLORS['warning'])
        lbl.bind("<Button-1>", on_label_click)
        lbl.bind("<Enter>", lambda e: lbl.config(fg=COLORS['accent_soft']))
        lbl.bind("<Leave>", lambda e: lbl.config(fg=COLORS['accent']))

        addr = tk.Label(row, textvariable=var, font=("Consolas", 10),
                        bg=COLORS['bg_elevated'], fg=COLORS['accent_soft'],
                        cursor='hand2', anchor='w')
        addr.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(2, 8))
        # 点击地址 → 复制到剪贴板 + 绿色「复制成功」提示
        def on_addr_click(e, v=var, a=addr):
            self._copy_text(v.get())
            self._toast("复制成功", bg=COLORS['success'])
            orig_fg = a.cget('fg')
            a.config(fg=COLORS['success'])
            self.root.after(800, lambda: a.config(fg=orig_fg))
        addr.bind("<Button-1>", on_addr_click)
        return row

    def _copy_text(self, text):
        """复制文本到剪贴板"""
        try:
            self.root.clipboard_clear()
            self.root.clipboard_append(text)
        except Exception:
            pass

    def _on_global_wheel(self, event):
        """全局滚轮：滚动当前可见标签页的滚动区（Windows）"""
        c = getattr(self, '_current_scroll_canvas', None)
        if c:
            try:
                c.yview_scroll(int(-1 * (event.delta / 120)), "units")
            except Exception:
                pass

    def _on_global_wheel_linux(self, direction):
        """全局滚轮（Linux Button-4/5）"""
        c = getattr(self, '_current_scroll_canvas', None)
        if c:
            try:
                c.yview_scroll(direction, "units")
            except Exception:
                pass

    def _toast(self, msg, bg=None):
        """底部轻提示：显示约 1.4 秒后自动消失；bg 可指定背景色（如绿色=复制成功）"""
        try:
            old = getattr(self, '_toast_label', None)
            if old:
                try:
                    old.destroy()
                except Exception:
                    pass
                self._toast_label = None
            lbl = tk.Label(self.root, text=msg, bg=bg or COLORS['text'], fg='#ffffff',
                           font=("Microsoft YaHei UI", 10),
                           padx=18, pady=8)
            lbl.place(relx=0.5, rely=0.93, anchor='s')
            lbl.lift()
            self._toast_label = lbl
            def _hide():
                try:
                    if getattr(self, '_toast_label', None) is lbl:
                        lbl.destroy()
                        self._toast_label = None
                except Exception:
                    pass
            self.root.after(1400, _hide)
        except Exception:
            pass

    def _append_log(self, line):
        """HTTP 日志回调（由 SilentHTTPRequestHandler.log_sink 调用）"""
        if not self.config.get('show_server_log', True):
            return
        try:
            self.root.after(0, self._append_log_safe, line)
        except Exception:
            pass

    def _append_log_safe(self, line):
        """线程安全地写入日志面板"""
        try:
            if not getattr(self, 'log_text', None):
                return
            self.log_text.configure(state=tk.NORMAL)
            self.log_text.insert(tk.END, line + "\n")
            self.log_text.configure(state=tk.DISABLED)
            self.log_text.see(tk.END)
        except Exception:
            pass

    def _lan_ip(self):
        """获取局域网 IP（用于局域网访问地址）"""
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(('8.8.8.8', 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            return '127.0.0.1'

    def _build_settings_tab(self):
        """设置标签页 — 分组卡片布局"""
        tab = self.tabs['settings']

        # 滚动容器
        canvas = tk.Canvas(tab, bg=COLORS['bg'], highlightthickness=0, bd=0)
        scrollbar = tk.Scrollbar(tab, orient=tk.VERTICAL, command=canvas.yview,
                                 bg=COLORS['bg_elevated'], troughcolor=COLORS['bg'],
                                 borderwidth=0, width=10)
        inner = tk.Frame(canvas, bg=COLORS['bg'])

        inner.bind(
            "<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )
        inner_window = canvas.create_window((0, 0), window=inner, anchor="nw")
        # 让内容帧始终等于画布可视宽度，避免设置项横向溢出窗口
        def _fit_inner_width(e):
            canvas.itemconfigure(inner_window, width=e.width)
        canvas.bind("<Configure>", _fit_inner_width)
        canvas.configure(yscrollcommand=scrollbar.set)
        canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.scroll_canvases['settings'] = canvas

        # === 服务器设置卡片 ===
        server_card = self._card(inner, pady=(24, 16))
        self._card_title(server_card, "服务器设置")

        # 自定义端口
        port_frame = self._add_setting_row(server_card, "HTTP 端口")
        port_tip = tk.Label(
            port_frame,
            text="0 = 自动选择（9527/9528/.../9531）",
            font=("Microsoft YaHei", 8),
            bg=COLORS['bg_elevated'], fg=COLORS['text_mute']
        )
        port_tip.pack(anchor=tk.W, pady=(2, 0))

        port_input_frame = tk.Frame(port_frame, bg=COLORS['bg_elevated'])
        port_input_frame.pack(fill=tk.X, pady=(8, 0))
        self.port_var = tk.IntVar(value=int(self.config.get('custom_port', 0)))
        self.port_spinbox = ttk.Spinbox(
            port_input_frame, from_=0, to=65535,
            textvariable=self.port_var, width=10,
            font=("Consolas", 10)
        )
        self.port_spinbox.pack(side=tk.LEFT, padx=(0, 12))
        for p in DEFAULT_PORT_CANDIDATES:
            btn = RoundedButton(
                port_input_frame, text=str(p),
                color=COLORS['chip'], text_color=COLORS['chip_text'],
                command=lambda p=p: self.port_var.set(p),
                big=False, radius=10, width=52, height=30
            )
            btn.pack(side=tk.LEFT, padx=(0, 8))

        # 绑定地址
        bind_frame = self._add_setting_row(server_card, "绑定地址")
        self.bind_var = tk.StringVar(value=str(self.config.get('bind_address', '127.0.0.1')))
        bind_combo = ttk.Combobox(
            bind_frame, textvariable=self.bind_var,
            values=['127.0.0.1', '0.0.0.0'],
            state='readonly', width=20
        )
        bind_combo.pack(anchor=tk.W, pady=(8, 0))
        tk.Label(
            bind_frame,
            text="127.0.0.1 = 仅本机访问；0.0.0.0 = 允许局域网/公网（请确保防火墙放行）",
            font=("Microsoft YaHei", 8),
            bg=COLORS['bg_elevated'], fg=COLORS['text_mute'],
            wraplength=520, justify=tk.LEFT
        ).pack(anchor=tk.W, pady=(4, 0))

        # === 界面与行为卡片 ===
        ui_card = self._card(inner, pady=(0, 16))
        self._card_title(ui_card, "界面与行为")

        # 主题
        theme_frame = self._add_setting_row(ui_card, "界面主题")
        self.theme_var = tk.StringVar(value=str(self.config.get('theme', 'light')))
        theme_combo = ttk.Combobox(
            theme_frame, textvariable=self.theme_var,
            values=['light', 'dark'], state='readonly', width=20
        )
        theme_combo.pack(anchor=tk.W, pady=(8, 0))
        tk.Label(theme_frame, text="light = 浅色精致；dark = 深色专业（保存后即时切换）",
                 font=("Microsoft YaHei", 8), bg=COLORS['bg_elevated'], fg=COLORS['text_mute']).pack(anchor=tk.W, pady=(4, 0))

        # 默认打开页
        page_frame = self._add_setting_row(ui_card, "默认打开页")
        self.default_page_var = tk.StringVar(value=str(self.config.get('default_page', 'editor')))
        page_combo = ttk.Combobox(
            page_frame, textvariable=self.default_page_var,
            values=['editor', 'preview', 'about'], state='readonly', width=20
        )
        page_combo.pack(anchor=tk.W, pady=(8, 0))
        tk.Label(page_frame, text="editor = 编辑器；preview = 导航站首页；about = 关于页",
                 font=("Microsoft YaHei", 8), bg=COLORS['bg_elevated'], fg=COLORS['text_mute']).pack(anchor=tk.W, pady=(4, 0))

        # 复选框：最小化到托盘 / 显示服务器日志
        self.minimize_to_tray_var = tk.BooleanVar(value=bool(self.config.get('minimize_to_tray', False)))
        cb_tray = self._make_custom_cb(ui_card, "关闭窗口时最小化到托盘（后台运行）", self.minimize_to_tray_var)
        cb_tray.pack(anchor=tk.W, padx=24, pady=(12, 0))

        self.show_server_log_var = tk.BooleanVar(value=bool(self.config.get('show_server_log', True)))
        cb_log = self._make_custom_cb(ui_card, "在控制台显示服务器访问日志", self.show_server_log_var)
        cb_log.pack(anchor=tk.W, padx=24, pady=(8, 16))

        # === 自动保存与恢复默认 ===
        # 所有设置项变更后自动持久化，无需手动保存
        for v in (self.port_var, self.bind_var, self.theme_var,
                  self.default_page_var, self.minimize_to_tray_var, self.show_server_log_var):
            v.trace_add('write', lambda *args, _self=self: _self._auto_save_settings())

        reset_btn_frame = tk.Frame(inner, bg=COLORS['bg'])
        reset_btn_frame.pack(anchor='e', padx=28, pady=(4, 24))
        reset_btn = self._make_btn(reset_btn_frame, "恢复默认", "↺", COLORS['chip'], self.reset_settings, big=False, text_color=COLORS['chip_text'], width=140)
        reset_btn.pack(side=tk.RIGHT)

    def _build_about_tab(self):
        """关于标签页 — 品牌卡片风格（可滚动）"""
        tab = self.tabs['about']

        canvas = tk.Canvas(tab, bg=COLORS['bg'], highlightthickness=0, bd=0)
        scrollbar = tk.Scrollbar(tab, orient=tk.VERTICAL, command=canvas.yview,
                                 bg=COLORS['bg_elevated'], troughcolor=COLORS['bg'],
                                 borderwidth=0, width=10)
        inner = tk.Frame(canvas, bg=COLORS['bg'])
        inner.bind("<Configure>", lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
        inner_window = canvas.create_window((0, 0), window=inner, anchor="nw")
        def _fit_inner_width(e):
            canvas.itemconfigure(inner_window, width=e.width)
        canvas.bind("<Configure>", _fit_inner_width)
        canvas.configure(yscrollcommand=scrollbar.set)
        canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.scroll_canvases['about'] = canvas

        pad = tk.Frame(inner, bg=COLORS['bg'], height=20)
        pad.pack(fill=tk.X)

        # 品牌卡片
        title_card = self._card(inner, pady=(0, 16))
        tc_inner = tk.Frame(title_card, bg=COLORS['bg_elevated'])
        tc_inner.pack(fill=tk.X, padx=24, pady=22)
        tk.Label(
            tc_inner, text="🧭  导航站编辑器",
            font=("Microsoft YaHei UI", 20, "bold"),
            bg=COLORS['bg_elevated'], fg=COLORS['text']
        ).pack(anchor=tk.W)
        tk.Label(
            tc_inner, text="WebStack 导航站图形化管理工具",
            font=("Microsoft YaHei UI", 11),
            bg=COLORS['bg_elevated'], fg=COLORS['text_dim']
        ).pack(anchor=tk.W, pady=(6, 0))
        tk.Label(
            tc_inner, text="版本 v5.0  ·  本地优先  ·  一键部署",
            font=("Microsoft YaHei UI", 9),
            bg=COLORS['bg_elevated'], fg=COLORS['text_mute']
        ).pack(anchor=tk.W, pady=(8, 0))

        # 信息卡片
        info_card = self._card(inner)
        self._card_title(info_card, "运行信息")
        info_inner = tk.Frame(info_card, bg=COLORS['bg_elevated'])
        info_inner.pack(fill=tk.X, padx=20, pady=(4, 18))

        info_lines = [
            ("项目目录", self.project_dir),
            ("后端服务", "Python http.server (ThreadingHTTPServer)"),
            ("前端框架", "Vue 3 + 原生 HTML 模板（CDN，无构建）"),
            ("数据存储", "浏览器 localStorage / IndexedDB + 本地 JSON 与文件系统"),
            ("部署目标", "GitHub Pages / Cloudflare Pages / Vercel / Netlify"),
            ("AI 生成", "图像生成（壁纸 / 图标）、智能代码辅助"),
            ("图标服务", "Favicon 自动抓取与本地缓存"),
        ]
        for k, v in info_lines:
            row = tk.Frame(info_inner, bg=COLORS['bg_elevated'])
            row.pack(fill=tk.X, pady=4)
            tk.Label(
                row, text=f"{k}:",
                font=("Microsoft YaHei UI", 10, "bold"),
                bg=COLORS['bg_elevated'], fg=COLORS['accent_soft'],
                width=14, anchor=tk.W
            ).pack(side=tk.LEFT)
            tk.Label(
                row, text=v,
                font=("Consolas" if k == "项目目录" else "Microsoft YaHei UI", 9),
                bg=COLORS['bg_elevated'], fg=COLORS['text'],
                wraplength=520, justify=tk.LEFT
            ).pack(side=tk.LEFT, fill=tk.X, expand=True)
        tk.Frame(inner, bg=COLORS['bg'], height=24).pack(fill=tk.X)

    def _add_section_title(self, parent, text):
        tk.Frame(parent, bg=COLORS['border'], height=1).pack(fill=tk.X, padx=24, pady=(16, 0))
        tk.Label(
            parent, text=text,
            font=("Microsoft YaHei UI", 11, "bold"),
            bg=COLORS['bg'], fg=COLORS['accent_soft']
        ).pack(anchor=tk.W, padx=24, pady=(10, 8))

    def _add_setting_row(self, parent, label):
        frame = tk.Frame(parent, bg=COLORS['bg_elevated'])
        frame.pack(fill=tk.X, padx=20, pady=(10, 0))
        tk.Label(
            frame, text=label,
            font=("Microsoft YaHei UI", 10, "bold"),
            bg=COLORS['bg_elevated'], fg=COLORS['text']
        ).pack(anchor=tk.W)
        return frame

    # ---- 事件 ----

    def auto_start(self):
        _startup_log('auto_start triggered; httpd_already=%s' % bool(self.httpd))
        try:
            if not self.httpd:
                self.start_server()
            _startup_log('auto_start finished; status="%s"' % self.status_var.get())
        except Exception as e:
            _startup_log('auto_start EXCEPTION:\n' + ''.join(traceback.format_exception(type(e), e, e.__traceback__)))
            try:
                self._set_status('启动出错', COLORS.get('danger', '#e74c3c'))
            except Exception:
                pass
            try:
                messagebox.showerror('启动失败', '自动启动服务器时出错：\n%s' % e)
            except Exception:
                pass

    def _auto_save_settings(self):
        """设置变更后自动保存到 launcher.json（无二次确认）"""
        try:
            new_port = int(self.port_var.get())
            new_bind = str(self.bind_var.get())
            new_theme = str(self.theme_var.get())
            new_page = str(self.default_page_var.get())
            new_minimize = bool(self.minimize_to_tray_var.get())
            new_log = bool(self.show_server_log_var.get())

            changed_theme = self.config.get('theme') != new_theme
            changed_port = self.config.get('custom_port') != new_port
            changed_bind = self.config.get('bind_address') != new_bind

            if (not changed_theme and not changed_port and not changed_bind and
                self.config.get('default_page') == new_page and
                self.config.get('minimize_to_tray') == new_minimize and
                self.config.get('show_server_log') == new_log):
                return

            self.config['custom_port'] = new_port
            self.config['bind_address'] = new_bind
            self.config['theme'] = new_theme
            self.config['default_page'] = new_page
            self.config['minimize_to_tray'] = new_minimize
            self.config['show_server_log'] = new_log
            # 启动行为项已从 UI 移除，保留原有配置值以兼容旧版
            if not save_config(self.config):
                return

            if changed_theme:
                set_theme(self.config['theme'])
                self.rebuild_ui()
            elif changed_port or changed_bind:
                self._set_status("端口 / 绑定地址已保存，重启后生效", COLORS['warning'])
            else:
                self._set_status("设置已自动保存", COLORS['success'])
        except Exception as e:
            _startup_log('_auto_save_settings ERROR: %s' % e)

    def save_settings(self):
        """保留手动保存入口，实际调用自动保存逻辑（兼容旧调用）"""
        self._auto_save_settings()

    def reset_settings(self):
        if messagebox.askyesno("恢复默认", "确定要恢复所有设置为默认值吗？"):
            self.config = dict(DEFAULT_CONFIG)
            save_config(self.config)
            set_theme(self.config['theme'])
            self.rebuild_ui()
            messagebox.showinfo("已恢复", "已恢复全部默认设置并即时应用。")

    # ---- 服务器控制 ----

    def start_server(self):
        global ACTUAL_PORT

        if self.httpd:
            return

        self._set_status("正在启动...", COLORS['warning'])

        # 读取用户配置
        try:
            custom_port = int(self.config.get('custom_port', 0))
        except (TypeError, ValueError):
            custom_port = 0
        bind = str(self.config.get('bind_address', '127.0.0.1'))
        _startup_log('start_server: begin; bind=%s project_dir=%s' % (bind, self.project_dir))
        # 确定端口候选列表
        if custom_port and 1 <= custom_port <= 65535:
            port_candidates = [custom_port] + [p for p in DEFAULT_PORT_CANDIDATES if p != custom_port]
        else:
            port_candidates = list(DEFAULT_PORT_CANDIDATES)

        # === 步骤 1: 单实例检测 ===
        # 本地探测统一用 127.0.0.1，避免 bind=0.0.0.0 时探测失败
        probe_bind = bind if bind == '127.0.0.1' else '127.0.0.1'
        if is_port_responding(port_candidates[0], probe_bind):
            _startup_log('start_server: existing instance detected on port %s' % port_candidates[0])
            self._set_status("检测到已有实例，正在打开浏览器...", COLORS['success'])
            self.root.update()
            url = self._editor_url(port_candidates[0], bind)
            webbrowser.open(url + "?reload=" + str(int(time.time())))
            time.sleep(2)
            self.on_close()
            return

        # === 步骤 2: 清理端口冲突 ===
        for p in port_candidates[:3]:
            if is_port_listening(p, bind) and not is_port_responding(p, bind):
                self._set_status(f"检测到端口 {p} 冲突，正在清理...", COLORS['warning'])
                self.root.update()
                kill_port_holder(p, bind)

        # === 步骤 3: 尝试启动服务器 ===
        handler = functools.partial(
            SilentHTTPRequestHandler,
            directory=self.project_dir
        )

        started = False
        last_error = None
        used_port = None
        _startup_log('start_server: step3 trying candidates %s' % port_candidates)

        for port in port_candidates:
            if is_port_listening(port, bind) and not is_port_responding(port, bind):
                kill_port_holder(port, bind)

            try:
                _startup_log('start_server: bind attempt on port %s' % port)
                self.httpd = StoppableHTTPServer((bind, port), handler)
                self.server_thread = threading.Thread(
                    target=self.httpd.serve_forever, daemon=True
                )
                self.server_thread.start()

                # 验证策略：先确认 TCP 端口已监听，再尝试 HTTP 响应；
                # HTTP 仅作辅助验证，超时不再判失败，只要 TCP 通就认为服务器已启动。
                test_url = f"http://127.0.0.1:{port}/editor.html"

                # 1) TCP 连通性探测（3 次快速重试，减少启动等待）
                tcp_ok = False
                for tcp_attempt in range(3):
                    try:
                        _startup_log('start_server: TCP probe 127.0.0.1:%s attempt %s' % (port, tcp_attempt + 1))
                        conn = socket.create_connection(('127.0.0.1', port), timeout=1)
                        conn.close()
                        tcp_ok = True
                        _startup_log('start_server: TCP ok on port %s' % port)
                        break
                    except Exception as tcp_err:
                        _startup_log('start_server: TCP probe failed on port %s attempt %s: %s' % (port, tcp_attempt + 1, tcp_err))
                        if tcp_attempt < 2:
                            time.sleep(0.15)

                if not tcp_ok:
                    raise OSError(f"端口 {port} TCP 连接失败，服务器未进入监听状态")

                # 2) HTTP 响应探测（辅助，用 http.client 避免 urllib 代理差异，超时 0.5s 仅尝试 1 次）
                http_ok = False
                try:
                    _startup_log('start_server: HTTP probe %s' % test_url)
                    import http.client
                    hc = http.client.HTTPConnection('127.0.0.1', port, timeout=0.5)
                    hc.request('GET', '/editor.html')
                    hc.getresponse()
                    hc.close()
                    http_ok = True
                    _startup_log('start_server: HTTP ok on port %s' % port)
                except Exception as http_err:
                    _startup_log('start_server: HTTP probe failed on port %s: %s' % (port, http_err))

                used_port = port
                started = True
                if not http_ok:
                    _startup_log('start_server: STARTED on port %s (TCP ok, HTTP verify skipped)' % port)
                else:
                    _startup_log('start_server: STARTED on port %s (TCP+HTTP ok)' % port)
                break
            except OSError as e:
                last_error = e
                _startup_log('start_server: OSError on port %s: %s' % (port, e))
                self._cleanup_server()
                continue
            except Exception as e:
                last_error = e
                _startup_log('start_server: Exception on port %s: %s' % (port, e))
                self._cleanup_server()
                continue

        # === 步骤 4: 处理启动结果 ===
        if not started:
            _startup_log('start_server: FAILED all ports; last_error=%s' % last_error)
            self._set_status("启动失败", COLORS['danger'])
            self._enable_start_btn(True)
            err_detail = str(last_error) if last_error else "未知错误"
            if "time" in err_detail.lower() or "timed out" in err_detail.lower():
                hint = (
                    "服务器已绑定端口，但验证请求超时。\n"
                    "常见原因：Windows 防火墙 / 杀毒软件拦截了本地回环访问，"
                    "或系统首次运行需要更长时间建立连接。\n"
                    "可尝试关闭安全软件后重试，或在设置中切换绑定地址。"
                )
            else:
                hint = "所有端口均被占用或无法绑定，请关闭占用程序后重试。"
            messagebox.showerror(
                "启动失败",
                f"无法启动服务器：\n{err_detail}\n\n"
                f"尝试的端口：{', '.join(map(str, port_candidates[:5]))}\n\n"
                f"{hint}"
            )
            return

        # 启动成功
        ACTUAL_PORT = used_port
        _startup_log('start_server: success; ACTUAL_PORT=%s' % used_port)
        self._server_running = True
        self._set_status("服务器运行中", COLORS['success'])
        host = self._display_host(bind)
        try:
            self.local_url_var.set(f"http://{host}:{used_port}/editor.html")
            self.lan_url_var.set(f"http://{self._lan_ip()}:{used_port}/editor.html")
        except Exception:
            pass
        self.footer_var.set(
            f"项目: {os.path.basename(self.project_dir)}   |   "
            f"端口: {used_port}"
        )
        self._enable_start_btn(False)

        # 自动打开浏览器（按「默认打开页」设置）
        if self.config.get('auto_open_browser', True):
            webbrowser.open(self._default_url(used_port, bind))

    def _display_host(self, bind):
        """显示用 host（0.0.0.0 替换为 localhost）"""
        return 'localhost' if bind == '0.0.0.0' else bind

    def _editor_url(self, port, bind):
        """编辑器 URL：附带唯一 launch 时间戳，确保每次启动都打开全新标签页，
        强制浏览器加载最新 app.js/template.js/styles.css（避免复用旧 tab 导致旧代码/旧 wrapTemplate）。"""
        import time
        return f"http://{self._display_host(bind)}:{port}/editor.html?launch={int(time.time() * 1000)}"

    def _default_url(self, port, bind):
        """「默认打开页」对应的 URL：editor / preview / about"""
        page = str(self.config.get('default_page', 'editor'))
        if page == 'preview':
            return f"http://{self._display_host(bind)}:{port}/"
        if page == 'about':
            return f"http://{self._display_host(bind)}:{port}/footer/"
        return self._editor_url(port, bind)

    def _set_status(self, text, color):
        color = color or COLORS.get('text', '#000000')
        try:
            self.status_var.set(text)
            self.status_lbl.config(fg=color)
            self.status_dot.config(fg=color)
            self.status_bar.config(bg=color)
        except Exception:
            pass
        # 侧栏状态指示
        try:
            if getattr(self, 'side_status_dot', None) and getattr(self, 'side_status_lbl', None):
                if self._server_running:
                    self.side_status_dot.config(fg=COLORS['success'])
                    self.side_status_lbl.config(text='服务器：运行中', fg=COLORS['success'])
                else:
                    self.side_status_dot.config(fg=COLORS['text_mute'])
                    self.side_status_lbl.config(text='服务器：未运行', fg=COLORS['text_dim'])
        except Exception:
            pass
        try:
            self.root.update()
        except Exception:
            pass

    def _enable_start_btn(self, enable_start):
        if enable_start:
            self.start_btn.config(state=tk.NORMAL, bg=COLORS['success'])
            self.start_btn.config(text="▶  启动")
            self.stop_btn.config(state=tk.DISABLED, bg=COLORS['disabled'])
            self.browser_btn.config(state=tk.DISABLED, bg=COLORS['disabled'])
            self.preview_btn.config(state=tk.DISABLED, bg=COLORS['disabled'])
        else:
            self.start_btn.config(state=tk.DISABLED, bg=COLORS['disabled'])
            self.stop_btn.config(state=tk.NORMAL, bg=COLORS['danger'])
            self.browser_btn.config(state=tk.NORMAL, bg=COLORS['accent'])
            self.preview_btn.config(state=tk.NORMAL, bg=COLORS['purple'])

    def _cleanup_server(self):
        try:
            if self.httpd:
                self.httpd.shutdown()
                self.httpd.server_close()
        except Exception:
            pass
        self.httpd = None
        self.server_thread = None
        self._server_running = False

    def stop_server(self):
        self._cleanup_server()
        self._set_status("服务器已停止", COLORS['text_mute'])
        try:
            self.local_url_var.set("（服务器启动后显示）")
            self.lan_url_var.set("（服务器启动后显示）")
        except Exception:
            pass
        self.footer_var.set(
            f"项目: {os.path.basename(self.project_dir)}   |   端口: 已停止"
        )
        self._enable_start_btn(True)

    def open_browser(self):
        port = ACTUAL_PORT or (int(self.config.get('custom_port', 0)) or DEFAULT_PORT_CANDIDATES[0])
        bind = str(self.config.get('bind_address', '127.0.0.1'))
        webbrowser.open(self._default_url(port, bind))

    def open_preview(self):
        port = ACTUAL_PORT or (int(self.config.get('custom_port', 0)) or DEFAULT_PORT_CANDIDATES[0])
        bind = str(self.config.get('bind_address', '127.0.0.1'))
        webbrowser.open(f"http://{self._display_host(bind)}:{port}/")

    def open_folder(self, rel_path):
        """打开指定路径：文件直接打开，文件夹在资源管理器中打开（不存在则创建）"""
        abs_path = os.path.abspath(os.path.join(self.project_dir, rel_path))
        try:
            if os.path.isfile(abs_path):
                os.startfile(abs_path)
                return
            if not os.path.isdir(abs_path):
                os.makedirs(abs_path, exist_ok=True)
            if os.name == 'nt':
                open_folder_in_front(abs_path)
            else:
                os.startfile(abs_path)
        except Exception:
            try:
                subprocess.Popen(['explorer', abs_path], shell=True)
            except Exception:
                pass

    def _build_file_cell(self, parent, label, rel_path):
        """项目文件网格单元格：紧凑单行，整格可点击打开，悬浮高亮"""
        base = COLORS['bg_elevated']
        cell = tk.Frame(parent, bg=base, cursor='hand2')
        cell.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 8))
        icon = tk.Label(cell, text="📁", font=("Segoe UI Emoji", 9),
                        bg=base, fg=COLORS['text_mute'])
        icon.pack(side=tk.LEFT, padx=(4, 5))
        lbl = tk.Label(cell, text=label, font=("Microsoft YaHei UI", 10),
                       bg=base, fg=COLORS['text_dim'], anchor='w')
        lbl.pack(side=tk.LEFT)
        path = tk.Label(cell, text=rel_path, font=("Consolas", 9),
                        bg=base, fg=COLORS['accent_soft'], anchor='w')
        path.pack(side=tk.LEFT, padx=(6, 0), fill=tk.X, expand=True)

        def _open(_e=None, p=rel_path):
            self.open_folder(p)
        def _hov_on(_e):
            for w in (cell, icon, lbl, path):
                try:
                    w.config(bg=COLORS['bg_inset'])
                except Exception:
                    pass
        def _hov_off(_e):
            for w in (cell, icon, lbl, path):
                try:
                    w.config(bg=base)
                except Exception:
                    pass
        for w in (cell, icon, lbl, path):
            w.bind("<Button-1>", _open)
            w.bind("<Enter>", _hov_on)
            w.bind("<Leave>", _hov_off)
        return cell

    def open_about(self):
        port = ACTUAL_PORT or (int(self.config.get('custom_port', 0)) or DEFAULT_PORT_CANDIDATES[0])
        bind = str(self.config.get('bind_address', '127.0.0.1'))
        # 打开「关于」页（页脚里的关于导航模板）
        webbrowser.open(f"http://{self._display_host(bind)}:{port}/footer/")

    def _silent_save_settings(self):
        """静默保存设置到 launcher.json（不弹提示框，用于关闭时自动保存）"""
        self.config['custom_port'] = int(self.port_var.get())
        self.config['bind_address'] = str(self.bind_var.get())
        self.config['theme'] = str(self.theme_var.get())
        self.config['default_page'] = str(self.default_page_var.get())
        self.config['minimize_to_tray'] = bool(self.minimize_to_tray_var.get())
        self.config['show_server_log'] = bool(self.show_server_log_var.get())
        # 启动行为项已从 UI 移除，保留原有配置值以兼容旧版
        save_config(self.config)

    def on_close(self):
        """关闭窗口：若启用「最小化到托盘」则后台运行，否则保存并退出"""
        try:
            self._silent_save_settings()
        except Exception:
            pass
        if self.config.get('minimize_to_tray') and not getattr(self, '_in_tray', False):
            self._minimize_to_tray()
            return
        self._quit_app()

    def _quit_app(self):
        """真正退出程序"""
        self._cleanup_server()
        try:
            self.root.destroy()
        except Exception:
            pass
        os._exit(0)

    def _minimize_to_tray(self):
        """轻量「托盘」：隐藏主窗口，弹出恢复小窗（避免引入额外依赖）"""
        self._in_tray = True
        self.root.withdraw()
        tray = tk.Toplevel(self.root)
        tray.title("导航站编辑器 - 已最小化")
        tray.geometry("320x150")
        tray.resizable(False, False)
        tray.configure(bg=COLORS['bg'])
        try:
            if getattr(sys, 'frozen', False):
                _base = sys._MEIPASS
            else:
                _base = os.path.dirname(os.path.abspath(__file__))
            _ico = os.path.join(_base, 'app_icon.ico')
            if os.path.exists(_ico):
                tray.iconbitmap(_ico)
        except Exception:
            pass
        tk.Label(tray, text="导航站编辑器正在后台运行",
                 font=("Microsoft YaHei UI", 12, "bold"),
                 bg=COLORS['bg'], fg=COLORS['text']).pack(pady=(16, 4))
        tk.Label(tray, text="服务器仍在运行，可随时恢复窗口",
                 font=("Microsoft YaHei UI", 9),
                 bg=COLORS['bg'], fg=COLORS['text_dim']).pack()
        restore = self._make_btn(tray, "恢复窗口", "⬆", COLORS['accent'],
                                 self._restore_from_tray, big=True, width=150)
        restore.pack(pady=10)
        quit_btn = self._make_btn(tray, "退出程序", "✕", COLORS['danger'],
                                  self._quit_from_tray, big=False, width=150)
        quit_btn.pack()
        tray.protocol("WM_DELETE_WINDOW", self._restore_from_tray)
        self._tray_window = tray

    def _restore_from_tray(self):
        try:
            if getattr(self, '_tray_window', None):
                self._tray_window.destroy()
        except Exception:
            pass
        self._tray_window = None
        self._in_tray = False
        self.root.deiconify()
        self.root.lift()
        self.root.focus_force()

    def _quit_from_tray(self):
        try:
            if getattr(self, '_tray_window', None):
                self._tray_window.destroy()
        except Exception:
            pass
        self._tray_window = None
        self._in_tray = False
        self._quit_app()

    def run(self):
        _startup_log('mainloop starting')
        self.root.mainloop()
        _startup_log('mainloop exited')


if __name__ == "__main__":
    app = LauncherApp()
    app.run()
