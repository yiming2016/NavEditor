/**
 * 网站提交 - 模板编辑器 v2（板块管理）
 */
(function () {
    'use strict';
    var $ = function (s, ctx) { return (ctx || document).querySelector(s); };
    var $all = function (s, ctx) { return Array.from((ctx || document).querySelectorAll(s)); };
    var nid = function () { return 's' + Math.random().toString(36).slice(2, 10); };

    // ─── URL 参数 ───
    var query = {};
    (location.search || '').replace(/^[?&]+/, '').split('&').forEach(function (pair) {
        var eq = pair.indexOf('=');
        if (eq < 0) return;
        try { query[decodeURIComponent(pair.slice(0, eq))] = decodeURIComponent(pair.slice(eq + 1)); } catch (_) { }
    });
    var isEdit = query.edit === '1';
    var fromKey = query.from || '';
    var rawDefault = query.path || '';
    var navLabel = query.label || '';
    var suggestPath = (rawDefault && !/^\s*_/.test(rawDefault)) ? rawDefault : 'footer/commit.html';
    var defaultPath = suggestPath;
    var baseName = (defaultPath || 'commit').split('/').pop().replace(/\.html?$/i, '');
    var SKEY = 'nav_editor_work_commit_' + (baseName || 'commit').replace(/[^a-zA-Z0-9]+/g, '_');
    var displayFileName = (defaultPath || 'commit.html').split('/').pop();

    // ─── 共享模板库 ───
    var TPL_KEY = 'nav_template_library';
    var _tplLib = null;
    function loadTpl() { if (!_tplLib) { try { var r = localStorage.getItem(TPL_KEY); _tplLib = r ? JSON.parse(r) : {}; } catch (_) { _tplLib = {}; } } return _tplLib; }
    function saveTpl() { try { localStorage.setItem(TPL_KEY, JSON.stringify(_tplLib)); } catch (_) {} }
    function tplVersions(type) { var l = loadTpl(); return (l[type] && l[type].versions) || []; }
    function tplActive(type) { var l = loadTpl(); if (!l[type] || !l[type].active) return null; var vs = l[type].versions; for (var i = 0; i < vs.length; i++) if (vs[i].id === l[type].active) return vs[i]; return null; }
    function tplActiveId(type) { var l = loadTpl(); return (l[type] && l[type].active) || null; }
    function tplFindVer(sec) { var vs = tplVersions(sec.type); for (var i = 0; i < vs.length; i++) if (vs[i].srcId === sec.id) return vs[i]; return null; }
    var TYPE_LABELS = { success: '成功提示', guidelines: '须知列表', text: '文本段落', categories: '分类选项', form: '表单区域' };
    function tplSave(sec) {
        var l = loadTpl(); if (!l[sec.type]) l[sec.type] = { active: null, versions: [] };
        for (var i = 0; i < l[sec.type].versions.length; i++) if (l[sec.type].versions[i].srcId === sec.id) return;
        var vid = 'tv' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        var v = { id: vid, name: sec.title, icon: sec.icon, title: sec.title, content: JSON.parse(JSON.stringify(sec.content)), srcId: sec.id };
        l[sec.type].versions.push(v);
        if (!l[sec.type].active) l[sec.type].active = vid;
        _tplLib = l; saveTpl();
    }
    function tplSetActive(type, vid) { var l = loadTpl(); if (l[type]) { l[type].active = vid; _tplLib = l; saveTpl(); } }
    function tplDel(type, vid) {
        var l = loadTpl(); if (!l[type]) return;
        l[type].versions = l[type].versions.filter(function (v) { return v.id !== vid; });
        if (l[type].active === vid) l[type].active = l[type].versions.length > 0 ? l[type].versions[0].id : null;
        _tplLib = l; saveTpl();
    }
    function tplRename(type, vid, n) { var l = loadTpl(); if (!l[type]) return; for (var i = 0; i < l[type].versions.length; i++) if (l[type].versions[i].id === vid) { l[type].versions[i].name = n; break; } _tplLib = l; saveTpl(); }
    // ─── 模版库（组合方案）───
    var CM_KEY = 'nav_combo_library';
    function loadCombo() { try { var r = localStorage.getItem(CM_KEY); return r ? JSON.parse(r) : { categories: [] }; } catch (_) { return { categories: [] }; } }
    function comboCats() {
        var d = loadCombo();
        var cats = (d.categories || []).map(function (c) { return { id: c.id, name: c.name }; });
        if (cats.length === 0) {
            var presets = ['标准提交表单', '技能展示区', '富文本段落', '联系我们', '数据看板', '操作向导'];
            cats = presets.map(function (n, i) { return { id: '_preset_' + i, name: n }; });
        }
        return cats;
    }
    function comboItems(catId) { var d = loadCombo(); var f = null; (d.categories || []).forEach(function (c) { if (c.id === catId) f = c; }); return f ? (f.items || []) : []; }
    function comboFindItem(catId, itemId) { var its = comboItems(catId); for (var ji = 0; ji < its.length; ji++) if (its[ji].id === itemId) return its[ji]; return null; }

    // ─── 内置图标 ───
    var COMMON_ICONS = ['fas fa-paper-plane', 'fas fa-check-circle', 'fas fa-info-circle', 'fas fa-home', 'fas fa-envelope', 'fas fa-globe', 'fas fa-star', 'fas fa-heart', 'fas fa-bell', 'fas fa-cog', 'fas fa-user', 'fas fa-link', 'fas fa-search', 'fas fa-edit', 'fas fa-trash', 'fas fa-plus', 'fas fa-minus', 'fas fa-sync', 'fas fa-cloud', 'fas fa-lock', 'fas fa-unlock', 'fas fa-tag', 'fas fa-tags', 'fas fa-bookmark', 'fas fa-folder', 'fas fa-file', 'fas fa-image', 'fas fa-align-left', 'fas fa-list', 'fas fa-th-list', 'fab fa-github', 'fab fa-weixin', 'fab fa-qq', 'fab fa-alipay'];

    // ─── 数据模型 ───
    var root = {};
    var currentSeedVersion = 0;
    var hasUnsaved = false;
    var commit = {
        title: '网址提交',
        subtitle: '提交您的优质网站，我们将在审核后收录到网址导航中',
        headerIcon: 'fas fa-paper-plane',
        headerBg: 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)',
        buttonText: '提交网站',
        buttonIcon: 'fas fa-paper-plane',
        backHomeText: '返回首页',
        favicon: '',
        backend: { type: '', url: '', publicKey: '', serviceId: '', templateId: '' },
        leftAds: [],
        topAds: [],
        rightAds: [],
        sections: [
            { id: nid(), type: 'text', icon: 'fas fa-address-book', title: '联系方式', content: { richHtml: '<p>如有任何问题，欢迎通过以下方式联系我们：</p><p>📧 邮箱：contact@example.com</p><p>💬 QQ / 微信：123456789</p>' } },
            { id: nid(), type: 'form', icon: 'fas fa-edit', title: '表单区域', content: { labels: { siteName: '网站名称', siteUrl: '网站地址', category: '网站分类', description: '网站描述', keywords: '关键词', email: '联系邮箱', contact: '联系方式' }, placeholders: { siteName: '请输入网站名称', siteUrl: 'https://example.com', description: '简要描述网站的主要功能和特点', keywords: '用逗号分隔，如：工具,在线,免费', email: '用于接收审核结果通知', contact: 'QQ、微信或其他联系方式（选填）' } } }
        ]
    };

    // ─── DOM 引用 ───
    var commitHeader, commitContainer, sectionsEl, submitBtnEl;

    // ─── 工具 ───
    function escapeHtml(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function shadeColor(color, percent) { var num = parseInt(color.replace('#', ''), 16); var amt = Math.round(2.55 * percent); var R = Math.max(0, Math.min(255, (num >> 16) + amt)); var G = Math.max(0, Math.min(255, (num >> 8 & 0x00FF) + amt)); var B = Math.max(0, Math.min(255, (num & 0x0000FF) + amt)); return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1); }

    // ===== 站点/版本信息栏（类主编辑器顶部栏）=====
    function svToast(msg) { if (typeof showToast === 'function') showToast(msg); else console.log('[NavEditor]', msg); }
    var siteVersionInfo = null;
    function apiGet(url) {
        return fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status + ' ' + r.statusText); return r.json(); });
    }
    function parsePathInfo(path) {
        if (!path) return null;
        var p = String(path).replace(/\\/g, '/');
        var parts = p.split('/').filter(Boolean);
        if (parts[0] !== 'web' || parts.length < 4) return null;
        var fileName = parts[parts.length - 1];
        var deployIdx = parts.indexOf('deploy1');
        var versionId = deployIdx > 2 ? parts.slice(2, deployIdx).join('/') : parts[2];
        return { siteId: parts[1], versionId: versionId, fileName: fileName, raw: path };
    }
    function buildNewPath(info, siteId, versionId) {
        var parts = String(info.raw).replace(/\\/g, '/').split('/').filter(Boolean);
        var deployIdx = parts.indexOf('deploy1');
        if (deployIdx < 0) return null;
        parts[1] = siteId;
        parts.splice(2, deployIdx - 2, versionId);
        return parts.join('/');
    }
    function formatVersionNote(v) {
        var n = (v && (v.note || v.name)) || (v && v.id) || '';
        return n.length > 20 ? n.slice(0, 18) + '…' : n;
    }
    function navWithConfirm(newPath) {
        if (hasUnsaved && !confirm('当前页面有未保存的改动，切换前请先保存。\n确定要放弃改动并切换吗？')) return;
        // 用户已确认切换：清除未保存拦截，避免浏览器原生 beforeunload 二次弹窗打断跳转，
        // 否则第二个弹窗点“取消”会静默中止切换，导致后续保存仍指向旧版本。
        window.onbeforeunload = null;
        hasUnsaved = false;
        var params = new URLSearchParams(location.search);
        params.set('path', newPath);
        params.set('_cb', Date.now());
        location.href = location.pathname + '?' + params.toString();
    }
    function closeSvDropdown() {
        var d = document.getElementById('cmtSvDropdown');
        if (d) { d.parentNode.removeChild(d); }
        document.removeEventListener('click', closeSvDropdown);
    }
    function positionSvDropdown(dd, anchor) {
        var r = anchor.getBoundingClientRect();
        dd.style.top = (r.bottom + 6) + 'px';
        dd.style.left = r.left + 'px';
    }
    function openSiteDropdown(info) {
        closeSvDropdown();
        apiGet('/api/storage/sites').then(function (res) {
            var sites = res.sites || [];
            var dd = document.createElement('div');
            dd.id = 'cmtSvDropdown';
            dd.className = 'cmt-sv-dropdown';
            dd.innerHTML = sites.map(function (s) {
                return '<div class="cmt-sv-item' + (s.id === info.siteId ? ' on' : '') + '" data-site="' + escapeHtml(s.id) + '">'
                    + '<i class="fas fa-globe" style="margin-right:6px;opacity:.6"></i>' + escapeHtml(s.name || s.id) + '</div>';
            }).join('') || '<div class="cmt-sv-item" style="color:#999">无站点</div>';
            document.body.appendChild(dd);
            positionSvDropdown(dd, document.getElementById('cmtSvSite'));
            $all('.cmt-sv-item[data-site]', dd).forEach(function (item) {
                item.onclick = function (e) {
                    e.stopPropagation();
                    var siteId = item.getAttribute('data-site');
                    if (siteId === info.siteId) { closeSvDropdown(); return; }
                    apiGet('/api/storage/versions?site=' + encodeURIComponent(siteId)).then(function (r) {
                        var vs = (r.versions || []).slice().sort(function (a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });
                        var vid = vs[0] ? vs[0].id : info.versionId;
                        var newPath = buildNewPath(info, siteId, vid);
                        if (newPath) navWithConfirm(newPath);
                        else svToast('无法构造目标路径');
                        closeSvDropdown();
                    }).catch(function () { svToast('加载目标站点版本失败'); });
                };
            });
            setTimeout(function () { document.addEventListener('click', closeSvDropdown, { once: true }); }, 0);
        }).catch(function () { svToast('加载站点列表失败'); });
    }
    function openVersionDropdown(info, versions) {
        closeSvDropdown();
        var dd = document.createElement('div');
        dd.id = 'cmtSvDropdown';
        dd.className = 'cmt-sv-dropdown';
        dd.innerHTML = versions.map(function (v) {
            return '<div class="cmt-sv-item' + (v.id === info.versionId ? ' on' : '') + '" data-version="' + escapeHtml(v.id) + '">'
                + escapeHtml(formatVersionNote(v)) + '</div>';
        }).join('') || '<div class="cmt-sv-item" style="color:#999">无版本</div>';
        document.body.appendChild(dd);
        positionSvDropdown(dd, document.getElementById('cmtSvVersion'));
        $all('.cmt-sv-item[data-version]', dd).forEach(function (item) {
            item.onclick = function (e) {
                e.stopPropagation();
                var vid = item.getAttribute('data-version');
                if (vid === info.versionId) { closeSvDropdown(); return; }
                var newPath = buildNewPath(info, info.siteId, vid);
                if (newPath) navWithConfirm(newPath);
                else svToast('无法构造目标路径');
                closeSvDropdown();
            };
        });
        setTimeout(function () { document.addEventListener('click', closeSvDropdown, { once: true }); }, 0);
    }
    function renderSiteVersionBar() {
        var info = parsePathInfo(defaultPath);
        var wrap = document.getElementById('cmtSiteVersionBar');
        siteVersionInfo = null;
        if (!wrap) return;
        if (!info) { wrap.style.display = 'none'; return; }
        wrap.style.display = 'inline-flex';
        wrap.innerHTML = '<span class="cmt-sv-site" id="cmtSvSite">加载中…</span>'
            + '<span class="cmt-sv-sep">/</span>'
            + '<span class="cmt-sv-version" id="cmtSvVersion">…</span>';
        siteVersionInfo = { siteId: info.siteId, versionId: info.versionId, fileName: info.fileName, rawPath: info.raw };

        apiGet('/api/storage/site-setting?site=' + encodeURIComponent(info.siteId))
            .then(function (res) {
                var siteName = (res.setting && res.setting.name) || info.siteId;
                if (siteVersionInfo && siteVersionInfo.siteId === info.siteId) siteVersionInfo.siteName = siteName;
                var el = document.getElementById('cmtSvSite');
                if (el) { el.textContent = siteName; el.title = '当前站点：' + siteName + '（点击切换站点）'; el.onclick = function () { openSiteDropdown(info); }; }
            })
            .catch(function () {
                if (siteVersionInfo && siteVersionInfo.siteId === info.siteId) siteVersionInfo.siteName = info.siteId;
                var el = document.getElementById('cmtSvSite');
                if (el) { el.textContent = info.siteId; el.title = info.siteId; el.onclick = function () { openSiteDropdown(info); }; }
            });

        apiGet('/api/storage/versions?site=' + encodeURIComponent(info.siteId))
            .then(function (res) {
                var versions = (res.versions || []).slice().sort(function (a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });
                var current = versions.find(function (v) { return v.id === info.versionId; }) || versions[0];
                var versionName = formatVersionNote(current || { id: info.versionId });
                if (siteVersionInfo && siteVersionInfo.siteId === info.siteId && siteVersionInfo.versionId === info.versionId) {
                    siteVersionInfo.versionName = versionName;
                    siteVersionInfo.versionsCount = versions.length;
                }
                var el = document.getElementById('cmtSvVersion');
                if (el) {
                    el.innerHTML = escapeHtml(versionName)
                        + (versions.length > 0 ? '<span class="cmt-sv-badge">' + versions.length + '</span>' : '');
                    el.title = '当前版本' + (versions.length ? '，点击切换历史版本' : '');
                    el.onclick = function () { openVersionDropdown(info, versions); };
                }
            })
            .catch(function () {
                if (siteVersionInfo && siteVersionInfo.siteId === info.siteId && siteVersionInfo.versionId === info.versionId) {
                    siteVersionInfo.versionName = info.versionId;
                    siteVersionInfo.versionsCount = 0;
                }
                var el = document.getElementById('cmtSvVersion');
                if (el) { el.textContent = info.versionId; el.title = info.versionId; }
            });
    }

    // ─── 从 seed 加载 ───
    function loadSeed() {
        var seedEl = document.getElementById('commitSeed');
        if (!seedEl) return;
        try {
            var seed = JSON.parse(seedEl.textContent || seedEl.innerText || '{}');
            root = seed || {};
            currentSeedVersion = (seed && seed._seedVersion) || 0;
            if (seed.commit) {
                if (seed.commit.sections && seed.commit.sections.length) commit = seed.commit;
                else {
                    // 兼容旧格式：无 sections 时用默认
                    commit.title = seed.commit.title || commit.title;
                    commit.subtitle = seed.commit.subtitle || commit.subtitle;
                    commit.headerIcon = seed.commit.headerIcon || commit.headerIcon;
                    commit.headerBg = seed.commit.headerBg || commit.headerBg;
                    commit.buttonText = seed.commit.buttonText || commit.buttonText;
                    commit.buttonIcon = seed.commit.buttonIcon || commit.buttonIcon;
                    commit.backHomeText = seed.commit.backHomeText || commit.backHomeText;
                    commit.favicon = seed.commit.favicon || commit.favicon || '';
                }
            }
        } catch (_) { }
    }

    function loadRemoteData(cb) {
        fetch('/' + defaultPath.replace(/\\/g, '/') + '?t=' + Date.now())
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
            .then(function (html) {
                var m = html.match(/<script\s+id="commitSeed"[^>]*>([\s\S]*?)<\/script>/i);
                if (m) {
                    try {
                        var seed = JSON.parse(m[1]);
                        currentSeedVersion = seed._seedVersion || 0;
                        if (seed.commit && seed.commit.sections && seed.commit.sections.length) commit = seed.commit;
                    } catch (_) { }
                }
                loadLocal();
                if (cb) cb();
            })
            .catch(function () { loadLocal(); if (cb) cb(); });
    }

    function loadLocal() {
        try {
            var raw = localStorage.getItem(SKEY);
            if (raw) {
                var saved = JSON.parse(raw);
                if (saved && saved._seedVersion === currentSeedVersion && saved.commit && saved.commit.sections) {
                    commit = saved.commit;
                } else if (saved && saved._seedVersion !== currentSeedVersion) {
                    // 旧草稿版本不一致（多为普通窗口残留），清除以免覆盖新默认内容
                    localStorage.removeItem(SKEY);
                }
            }
        } catch (_) { }
    }
    function saveLocal() { try { localStorage.setItem(SKEY, JSON.stringify({ commit: commit, _seedVersion: currentSeedVersion })); } catch (_) { } }

    // ─── 板块查找 ───
    function findSec(id) { for (var i = 0; i < commit.sections.length; i++) if (commit.sections[i].id === id) return commit.sections[i]; return null; }

    // ─── 板块 HTML 生成 ───
    function sectionHtml(sec, editing) {
        var head = '<h3 class="commit-sec-title" style="font-size:16px;color:#333;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #eee;display:flex;align-items:center">'
            + '<i class="' + sec.icon + '"' + (editing ? ' data-ic="' + sec.id + '" style="cursor:pointer" title="点击换图标"' : '') + '></i> '
            + '<span' + (editing ? ' data-tt="' + sec.id + '" contenteditable="true" class="cmt-sec-title-edit"' : '') + ' style="margin-left:8px">' + sec.title + '</span>'
            + '</h3>';

        var body = '';
        var useModules = Array.isArray(sec.modules);
        if (!useModules) {
        if (sec.type === 'success') {
            body = '<div class="commit-success-msg"' + (editing ? ' data-body="' + sec.id + '"' : '') + ' style="background:#d4edda;color:#155724;padding:12px;border-radius:4px;margin-bottom:16px">'
                + '<i class="' + (sec.content.icon || 'fas fa-check-circle') + '"' + (editing ? ' data-ic2="' + sec.id + '" style="margin-right:6px;cursor:pointer" title="点击换图标"' : '') + '></i> '
                + '<span' + (editing ? ' data-msg="' + sec.id + '" contenteditable="true" class="cmt-sec-title-edit"' : '') + '>' + (sec.content.message || '') + '</span>'
                + '</div>';
        } else if (sec.type === 'guidelines') {
            body = '<div class="commit-guidelines"' + (editing ? ' data-body="' + sec.id + '"' : '') + ' style="background:#f8f9fa;padding:16px;border-radius:4px;margin-bottom:16px">'
                + '<ul style="margin:0;padding-left:18px" data-glist="' + sec.id + '">'
                + (sec.content.items || []).map(function (it, i) { return '<li data-gi="' + i + '" style="color:#666;font-size:14px;margin-bottom:4px"' + (editing ? ' contenteditable="true" class="cmt-sec-title-edit"' : '') + '>' + escapeHtml(it) + (editing ? '<span class="cmt-item-del" data-gdel="' + i + '" style="color:#e74c3c;cursor:pointer;margin-left:6px;font-size:12px" title="删除">✕</span>' : '') + '</li>'; }).join('')
                + '</ul>'
                + (editing ? '<span class="cmt-item-add" data-gadd="' + sec.id + '" style="color:#27ae60;cursor:pointer;font-size:12px;display:inline-block;margin-top:6px"><i class="fas fa-plus"></i> 添加条目</span>' : '')
                + '</div>';
        } else if (sec.type === 'text') {
            body = '<div class="commit-text"' + (editing ? ' data-body="' + sec.id + '" contenteditable="true" class="cmt-sec-title-edit"' : '') + ' style="font-size:14px;color:#555;line-height:1.8;margin-bottom:16px;min-height:40px;padding:8px;border-radius:4px">'
                + (sec.content.richHtml || '<p>在这里输入文字内容…</p>')
                + '</div>';
        } else if (sec.type === 'categories') {
            body = '<div class="commit-categories"' + (editing ? ' data-body="' + sec.id + '"' : '') + ' style="margin-bottom:16px">'
                + '<select class="form-control" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:4px;font-size:14px"><option value="">请选择分类</option>'
                + (sec.content.items || []).map(function (c) { return '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>'; }).join('')
                + '</select>'
                + (editing ? '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px" data-ctags="' + sec.id + '">'
                    + (sec.content.items || []).map(function (c, ci) { return '<span style="background:#e8f5e9;color:#2e7d32;padding:3px 8px;border-radius:4px;font-size:12px;display:inline-flex;align-items:center;gap:4px">' + escapeHtml(c) + '<span data-cdel="' + ci + '" style="color:#e74c3c;cursor:pointer;margin:0;font-size:12px" title="删除">✕</span></span>'; }).join('')
                    + '</div>'
                    + '<span class="cmt-item-add" data-cadd="' + sec.id + '" style="color:#27ae60;cursor:pointer;font-size:12px;display:inline-block;margin-top:6px"><i class="fas fa-plus"></i> 添加分类</span>' : '')
                + '</div>';
        } else if (sec.type === 'form') {
            var fields = [
                { key: 'siteName', type: 'text', required: true },
                { key: 'siteUrl', type: 'url', required: true },
                { key: 'category_hidden', type: 'text', required: false },
                { key: 'description', type: 'textarea', required: true },
                { key: 'keywords', type: 'text', required: false },
                { key: 'email', type: 'email', required: true },
                { key: 'contact', type: 'text', required: false }
            ];
            body = '<div class="commit-form"' + (editing ? ' data-body="' + sec.id + '"' : '') + ' style="margin-bottom:16px">' +
                fields.filter(function (f) { return f.key !== 'category_hidden'; }).map(function (f) {
                    var label = (sec.content.labels || {})[f.key] || '';
                    var ph = (sec.content.placeholders || {})[f.key] || '';
                    var req = f.required ? ' <span style="color:#ff4444">*</span>' : '';
                    if (f.key === 'description') {
                        return '<div style="margin-bottom:16px"><label style="display:block;margin-bottom:6px;color:#333;font-weight:500">' + (editing ? '<span' + ' data-fl="' + sec.id + '_' + f.key + '" contenteditable="true" class="cmt-sec-title-edit"' : '') + '>' + escapeHtml(label) + '</span>' + req + '</label>'
                            + '<textarea class="form-control" readonly style="width:100%;padding:10px;border:1px solid #ddd;border-radius:4px;font-size:14px;resize:vertical;min-height:80px;box-sizing:border-box" placeholder="' + escapeHtml(ph) + '"></textarea></div>';
                    }
                    return '<div style="margin-bottom:16px"><label style="display:block;margin-bottom:6px;color:#333;font-weight:500">' + (editing ? '<span' + ' data-fl="' + sec.id + '_' + f.key + '" contenteditable="true" class="cmt-sec-title-edit"' : '') + '>' + escapeHtml(label) + '</span>' + req + '</label>'
                        + '<input type="' + f.type + '" class="form-control" readonly style="width:100%;padding:10px;border:1px solid #ddd;border-radius:4px;font-size:14px;box-sizing:border-box" placeholder="' + escapeHtml(ph) + '"></div>';
                }).join('') + '</div>';
        }
        }
        if (useModules) {
            body += renderModuleBlocks(sec.modules, sec.id, sec._pvCols);
            if (editing && (!sec.modules || !sec.modules.length)) {
                body += '<div class="ab-empty-mods" data-sec="' + sec.id + '" style="padding:16px;text-align:center;color:#999;font-size:13px;background:#f9fafb;border:1px dashed #ddd;border-radius:6px;margin-top:8px">暂无模块，点击「模块库」添加模块</div>';
            }
        }
        return '<div class="commit-section" data-sec="' + sec.id + '" style="margin-bottom:20px">' + head + body + '</div>';
    }

    function renderModuleBlocks(mods, secId, pvCols) {
        if (!mods || !mods.length) return '';
        var cols = pvCols || [];
        return '<div class="ab-mod-blocks" data-mod-sec="' + secId + '">'
            + mods.map(function (m, i) { 
                var span = cols[i] || 4;
                return '<div class="ab-mp-block ab-mp-span' + span + '">' + modulePreviewBody(m) + '</div>';
            }).join('')
            + '</div>';
    }
    function modulePreviewBody(m) {
        var name=typeof m==='string'?m:(m&&m.name)||'',cfg=m&&m.config?m.config:{};
        var lb=cfg.label||'',ph=cfg.placeholder||'';
        if(name==='单行输入框'||name==='输入框'){var it=cfg.inputType||'text',dph=ph||(it==='email'?'name@example.com':it==='url'?'https://example.com':it==='tel'?'13800000000':it==='number'?'0':it==='password'?'••••••••':'请输入...');return(lb?'<div class="ab-mp-label">'+lb+'</div>':'')+'<input class="ab-mp-input" type="'+it+'" placeholder="'+dph+'" readonly>';}
        if(name==='多行输入框'||name==='可拉伸输入框'){return(lb?'<div class="ab-mp-label">'+lb+'</div>':'')+'<textarea class="ab-mp-textarea" rows="'+(cfg.rows||3)+'" readonly>'+ph+'</textarea>';}
        if(name==='选择器'||name==='下拉选择'){var opt=cfg.options&&cfg.options.length?cfg.options:['选项 A','选项 B'];return(lb?'<div class="ab-mp-label">'+lb+'</div>':'')+'<select class="ab-mp-select"><option>请选择...</option>'+opt.map(function(o){return'<option>'+o+'</option>'}).join('')+'</select>';}
        if(name==='日期时间'||name==='日期选择') return(lb?'<div class="ab-mp-label">'+lb+'</div>':'')+'<input class="ab-mp-input" type="date" value="2026-07-30" readonly>';
        if(name==='开关切换'||name==='开关') return'<div class="ab-mp-toggle"></div>';
        if(name==='范围滑块'||name==='滑块') return'<div class="ab-mp-slider"><div class="ab-mp-slider-bar"></div></div>';
        if(name==='搜索框') return(lb?'<div class="ab-mp-label">'+lb+'</div>':'')+'<input class="ab-mp-input ab-mp-search" placeholder="'+(ph||'搜索...')+'" readonly>';
        if(name==='标签组'||name==='技能卡片'){var tags=cfg.tags?cfg.tags.split(',').map(function(t){return t.trim()}):['标签'];return'<div class="ab-mp-skills">'+tags.map(function(t){return'<span class="ab-mp-skill-tag" style="background:#27ae60">'+t+'</span>'}).join('')+'</div>';}
        if(name==='进度条'){var pct=cfg.percent||65;return'<div class="ab-mp-progress"><div class="ab-mp-progress-bar" style="width:'+pct+'%"></div></div>';}
        if(name==='数字徽章') return'<span class="ab-mp-badge">'+(cfg.text||'NEW')+'</span>';
        if(name==='引用卡片'||name==='引用块') return'<div class="ab-mp-quote">'+(cfg.quote||'引用文字')+'</div>';
        if(name==='联系方式卡'||name==='联系方式卡片') return'<div class="ab-mp-contact">📧 contact@example.com</div>';
        if(name==='提示信息') return'<div class="ab-mp-alert ab-mp-alert-ok">✅ '+(cfg.msg||'提示')+'</div>';
        if(name==='分割线') return'<div class="ab-mp-divider"><span>分割线</span></div>';
        if(name==='选项卡切换'||name==='选项卡') return'<div class="ab-mp-tabs"><span class="ab-mp-tab active">选项一</span><span class="ab-mp-tab">选项二</span></div>';
        if(name==='步骤进度条'||name==='步骤条') return'<div class="ab-mp-steps"><span class="ab-mp-step-num">1</span><span class="ab-mp-step-line"></span><span class="ab-mp-step-num">2</span></div>';
        if(name==='图标标题组'||name==='图标框') return'<div class="ab-mp-icon">⭐</div><span style="font-size:13px">'+(cfg.text||'标题')+'</span>';
        if(name==='头像名片'||name==='头像') return'<div class="ab-mp-avatar">U</div><span>'+(cfg.name||'用户名')+'</span>';
        if(name==='统计数据') return'<div style="text-align:center"><div style="font-size:18px;font-weight:700;color:#27ae60">'+(cfg.num||'0')+'</div></div>';
        if(name==='富文本段落') return'<div style="padding:8px;color:#555;font-size:13px">正文内容</div>';
        if(name==='代码块') return'<div class="ab-mp-code">function hello(){}</div>';
        if(name==='数据表格') return'<table class="ab-mp-table"><tr><th>列A</th><th>列B</th></tr><tr><td>1</td><td>2</td></tr></table>';
        if(name==='折叠面板') return'<div style="border:1px solid #ddd;border-radius:4px;overflow:hidden"><div style="padding:6px 10px;background:#fafafa;font-weight:600;font-size:12px">'+(cfg.label||'面板标题')+'</div></div>';
        if(name==='空状态') return'<div style="text-align:center;padding:16px;color:#ccc">📭 暂无数据</div>';
        if(name==='分栏布局') return'<div style="display:flex;gap:4px"><div style="flex:1;padding:10px;background:#e8f5e9;text-align:center;border-radius:3px">栏</div><div style="flex:1;padding:10px;background:#e8f5e9;text-align:center;border-radius:3px">栏</div></div>';
        if(name==='分页导航'||name==='分页') return'<div class="ab-mp-pages"><span class="ab-mp-page">‹</span><span class="ab-mp-page ab-mp-page-cur">1</span><span class="ab-mp-page">2</span><span class="ab-mp-page">›</span></div>';
        if(name==='倒计时') return'<div style="display:flex;gap:3px;font-family:monospace"><span style="padding:2px 5px;background:#333;color:#fff;border-radius:2px;font-size:12px">12</span>:<span style="padding:2px 5px;background:#333;color:#fff;border-radius:2px;font-size:12px">30</span></div>';
        return '<span class="ab-mp-unknown">' + name + '</span>';
    }

    // ─── 渲染所有板块 ───
    function renderSections() {
        if (!sectionsEl) return;
        sectionsEl.innerHTML = commit.sections.map(function (s) { return sectionHtml(s, isEdit); }).join('');
        if (isEdit) bindSectionEvents();
    }

    // ─── 绑定板块事件 ───
    function bindSectionEvents() {
        // 图标切换
        $all('[data-ic]').forEach(function (el) {
            el.onclick = function (e) { e.stopPropagation(); showIconPicker(el.parentElement, function (ic) { var sec = findSec(el.getAttribute('data-ic')); if (sec) { sec.icon = ic; el.className = ic; } }); };
        });
        // 图标切换2 (success 内部)
        $all('[data-ic2]').forEach(function (el) {
            el.onclick = function (e) { e.stopPropagation(); showIconPicker(el.parentElement, function (ic) { var sec = findSec(el.getAttribute('data-ic2')); if (sec) { sec.content.icon = ic; el.className = ic; } }); };
        });
        // 标题编辑
        $all('[data-tt]').forEach(function (el) {
            el.onblur = function () { var sec = findSec(el.getAttribute('data-tt')); if (sec) sec.title = el.innerText.trim(); };
        });
        // success message
        $all('[data-msg]').forEach(function (el) {
            el.onblur = function () { var sec = findSec(el.getAttribute('data-msg')); if (sec) sec.content.message = el.innerText.trim(); };
        });
        // 须知条目删除
        $all('[data-gdel]').forEach(function (el) {
            el.onclick = function (e) { e.stopPropagation(); var secId = el.closest('[data-glist]').getAttribute('data-glist'); var sec = findSec(secId); var idx = parseInt(el.getAttribute('data-gdel')); if (sec && idx >= 0) { sec.content.items.splice(idx, 1); renderSections(); } };
        });
        // 须知条目文字变更
        $all('[data-gi]').forEach(function (el) {
            el.onblur = function () { var secId = el.closest('[data-glist]').getAttribute('data-glist'); var sec = findSec(secId); var idx = parseInt(el.getAttribute('data-gi')); if (sec && idx >= 0) sec.content.items[idx] = el.innerText.replace(/✕$/, '').trim(); };
        });
        // 须知添加
        $all('[data-gadd]').forEach(function (el) {
            el.onclick = function () { var sec = findSec(el.getAttribute('data-gadd')); if (sec) { sec.content.items.push('新须知条目'); renderSections(); } };
        });
        // 分类删除
        $all('[data-cdel]').forEach(function (el) {
            el.onclick = function (e) { e.stopPropagation(); var secId = el.closest('[data-ctags]').getAttribute('data-ctags'); var sec = findSec(secId); var idx = parseInt(el.getAttribute('data-cdel')); if (sec && idx >= 0) { sec.content.items.splice(idx, 1); renderSections(); } };
        });
        // 分类添加
        $all('[data-cadd]').forEach(function (el) {
            el.onclick = function () { var sec = findSec(el.getAttribute('data-cadd')); if (sec) { var n = prompt('输入新分类名称：'); if (n && n.trim()) { sec.content.items.push(n.trim()); renderSections(); } } };
        });
        // 表单标签
        $all('[data-fl]').forEach(function (el) {
            el.onblur = function () { var parts = el.getAttribute('data-fl').split('_'); var sec = findSec(parts[0]); var key = parts.slice(1).join('_'); if (sec) { if (!sec.content.labels) sec.content.labels = {}; sec.content.labels[key] = el.innerText.trim(); } };
        });
        // 文本段落
        $all('[data-body]').forEach(function (el) {
            var sec = findSec(el.getAttribute('data-body'));
            if (sec && sec.type === 'text') {
                el.onblur = function () { sec.content.richHtml = el.innerHTML; };
            }
        });
        // 拖拽手柄 (双击 title 区域)
        $all('.commit-sec-title').forEach(function (el) {
            el.style.cursor = 'pointer';
            el.title = '板块：双击标题可快速切换图标';
        });
    }

    // ─── 图标选择器 ───
    function showIconPicker(anchor, onPick) {
        var existing = document.querySelector('.cmt-ic-popup');
        if (existing) existing.remove();
        var popup = document.createElement('div');
        popup.className = 'cmt-ic-popup';
        popup.style.cssText = 'position:absolute;top:100%;left:0;background:#fff;border:1px solid #ddd;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.2);z-index:100;padding:8px;display:grid;grid-template-columns:repeat(6,1fr);gap:6px;max-height:200px;overflow-y:auto;min-width:200px';
        COMMON_ICONS.forEach(function (ic) {
            var i = document.createElement('i');
            i.className = ic;
            i.title = ic;
            i.style.cssText = 'cursor:pointer;padding:6px;text-align:center;border-radius:4px;font-size:16px;color:#555';
            i.onmouseenter = function () { i.style.background = '#f0f0f0'; i.style.color = '#667eea'; };
            i.onmouseleave = function () { i.style.background = ''; i.style.color = '#555'; };
            i.onclick = function () { onPick(ic); popup.remove(); };
            popup.appendChild(i);
        });
        anchor.style.position = 'relative';
        anchor.appendChild(popup);
        setTimeout(function () {
            document.addEventListener('click', function closeIp(e) { if (!popup.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) { popup.remove(); document.removeEventListener('click', closeIp); } }, { once: true });
        }, 50);
    }

    // ===== 广告渲染与广告位容器 =====
    function normLink(u) { if (!u) return u; if (/^(https?:|mailto:|tel:|#|\/)/.test(u)) return u; return '//' + u; }
    function adTypeLabel(type) {
        var map = { google:'Google AdSense', baidu:'百度联盟', alimama:'阿里妈妈', tencent:'腾讯广告', sogou:'搜狗联盟', qihoo:'360联盟', amazon:'Amazon', custom:'自定义图片', html:'自定义HTML' };
        return map[type] || type || '自定义图片';
    }
    function adTypeHint(type) {
        var hints = {
            google: '去 Google AdSense 后台 → 广告 → 按广告单元 → 复制广告代码 → 粘贴到下方代码框。',
            baidu: '去百度联盟后台 → 代码位管理 → 创建/获取代码 → 粘贴到下方代码框。',
            alimama: '去阿里妈妈后台 → 推广管理 → 导购/广告推广 → 获取推广代码或链接。',
            tencent: '去腾讯广告后台(e.qq.com) → 我的广告 → 获取代码 → 粘贴到下方代码框。',
            sogou: '去搜狗联盟后台 → 广告代码 → 获取 → 粘贴到下方代码框。',
            qihoo: '去360联盟后台 → 代码位 → 复制代码 → 粘贴到下方代码框。',
            amazon: '去 Amazon Associates → 产品链接 → 获取横幅/原生广告代码 → 粘贴到下方代码框。',
            custom: '合作商需提供：图片文件(PNG/JPG/SVG/GIF)、建议尺寸(300x250或160x600或728x90)、跳转链接(https://开头)、可选文字说明。点击下方按钮上传图片。',
            html: '直接粘贴任意 HTML 代码，适用于特殊脚本或 iframe 嵌入。'
        };
        return hints[type] || hints.custom;
    }
    function renderAd(ad) {
        if (!ad || !ad.enabled) return '';
        if (ad.type && ad.type !== 'custom' && ad.type !== 'html') {
            if (ad.code) return '<div class="ad-banner" style="overflow:hidden">' + ad.code + '</div>';
            var n = adTypeLabel(ad.type);
            return '<div class="ad-banner" style="padding:16px;text-align:center;color:#888;font-size:12px">' + n + ' 广告位<br><small>请在广告管理中填入代码</small></div>';
        }
        if (ad.type === 'html') return ad.code ? '<div class="ad-banner" style="overflow:hidden">' + ad.code + '</div>' : '<div class="ad-banner" style="padding:16px;text-align:center;color:#888;font-size:12px">自定义HTML<br><small>请在广告管理中填入代码</small></div>';
        if (!ad.image && !ad.value) return '';
        var src = ad.image || ad.value || '';
        var img = '<img src="' + escAttr(src) + '" alt="' + escAttr(ad.alt || '') + '" style="width:100%;display:block">';
        if (ad.width) img = '<img src="' + escAttr(src) + '" alt="' + escAttr(ad.alt || '') + '" width="' + ad.width + '" height="' + (ad.height || 'auto') + '" style="display:block;max-width:100%">';
        var inner = ad.link ? '<a href="' + escAttr(normLink(ad.link)) + '" target="_blank" rel="nofollow" style="display:block">' + img + '</a>' : img;
        return '<div class="ad-banner">' + inner + (ad.alt ? '<div style="padding:4px 8px;font-size:11px;color:#999;text-align:center">' + escAttr(ad.alt) + '</div>' : '') + '</div>';
    }
    function renderAds(side) {
        var el = document.getElementById(side === 'left' ? 'commitLeftAds' : (side === 'right' ? 'commitRightAds' : 'commitTopAds'));
        if (!el) return;
        var list = side === 'left' ? commit.leftAds : (side === 'right' ? commit.rightAds : commit.topAds);
        el.innerHTML = list.map(function(a, i) { return renderAd(a); }).join('');
        el.style.display = list.filter(function(a) { return a.enabled; }).length === 0 ? 'none' : '';
    }
    function ensureAdContainers() {
        if (!isEdit) return;
        ['commitLeftAds','commitRightAds','commitTopAds'].forEach(function(id) {
            if (document.getElementById(id)) return;
            var div = document.createElement('div');
            div.id = id;
            if (id === 'commitTopAds') { div.className = 'ad-top-bar'; document.body.insertBefore(div, document.body.firstChild); }
            else { div.className = 'ad-sidebar ' + (id === 'commitLeftAds' ? 'left' : 'right'); document.body.appendChild(div); }
        });
    }
    function renderAllAds() { renderAds('top'); renderAds('left'); renderAds('right'); }

    // ===== 广告管理弹窗 =====
    var __adEditing = { top: -1, left: -1, right: -1 };
    function openAdManager() {
        commit.leftAds = commit.leftAds || [];
        commit.rightAds = commit.rightAds || [];
        commit.topAds = commit.topAds || [];
        __adEditing = { top: -1, left: -1, right: -1 };
        var ov = document.createElement('div');
        ov.className = 'ab-modal-ov';
        ov.innerHTML = '<div class="ab-modal" style="width:1380px;max-width:99%;height:98vh;max-height:98vh;display:flex;flex-direction:column">'
            + '<div class="ab-modal-h">广告管理<a class="ab-modal-x" data-close>&times;</a></div>'
            + '<div class="ab-modal-b" style="padding:8px 12px;display:flex;gap:12px;overflow-y:auto;flex:1">'
            + '<div class="ad-zone-card" style="flex:1;display:flex;flex-direction:column;min-height:0"><div class="ad-zone-hd" style="justify-content:center">左侧广告位</div><div class="ad-zone-bd" id="adZoneLeft" style="flex:1;min-height:0"></div><div class="ad-zone-add-bar"><span class="ad-zone-add" data-ad-add="left">+ 新增</span></div></div>'
            + '<div class="ad-zone-card" style="flex:1;display:flex;flex-direction:column;min-height:0"><div class="ad-zone-hd" style="justify-content:center">顶部广告位</div><div class="ad-zone-bd" id="adZoneTop" style="flex:1;min-height:0"></div><div class="ad-zone-add-bar"><span class="ad-zone-add" data-ad-add="top">+ 新增</span></div></div>'
            + '<div class="ad-zone-card" style="flex:1;display:flex;flex-direction:column;min-height:0"><div class="ad-zone-hd" style="justify-content:center">右侧广告位</div><div class="ad-zone-bd" id="adZoneRight" style="flex:1;min-height:0"></div><div class="ad-zone-add-bar"><span class="ad-zone-add" data-ad-add="right">+ 新增</span></div></div>'
            + '</div></div>';
        document.body.appendChild(ov);
        ov.querySelector('[data-close]').onclick = function () { document.body.removeChild(ov); renderAllAds(); document.removeEventListener('keydown', onEscAd); };
        function onEscAd(e) { if (e.key === 'Escape') { document.body.removeChild(ov); renderAllAds(); document.removeEventListener('keydown', onEscAd); } }
        document.addEventListener('keydown', onEscAd);
        ['top','left','right'].forEach(function(pos) { renderAdZone(pos); });
        ov.querySelectorAll('[data-ad-add]').forEach(function(btn) {
            btn.addEventListener('click', function(e) { e.stopPropagation(); addNewAd(btn.getAttribute('data-ad-add')); });
        });
    }
    function adsByPosition(pos) { return pos === 'top' ? commit.topAds : (pos === 'right' ? commit.rightAds : commit.leftAds); }
    function adFormHtml(pos, ad, isNew) {
        var typeOptions = '<option value="google">Google AdSense</option><option value="baidu">百度联盟</option><option value="alimama">阿里妈妈</option><option value="tencent">腾讯广告</option><option value="sogou">搜狗联盟</option><option value="qihoo">360联盟</option><option value="amazon">Amazon</option><option value="custom">自定义图片</option><option value="html">自定义HTML</option>';
        var t = ad.type || 'custom';
        typeOptions = typeOptions.replace('value="' + t + '"', 'value="' + t + '" selected');
        var needCode = ['google','baidu','alimama','tencent','sogou','qihoo','amazon','html'].indexOf(t) >= 0;
        var needImg = t === 'custom';
        var hint = adTypeHint(t).substring(0, 120);
        return '<div class="ad-inline-form" data-ad-pos="' + pos + '">'
            + '<div class="ad-inline-hd">' + (isNew ? '新增广告' : '编辑广告') + '<span class="ad-inline-close" data-ad-cancel="' + pos + '">&times;</span></div>'
            + '<div class="ad-inline-bd">'
            + '<div class="ad-col2"><div class="ad-field-row"><label>名称</label><input class="ad-f-name" value="' + escAttr(ad.name || '') + '" placeholder="如：Google横幅"></div>'
            + '<div class="ad-field-row"><label>类型</label><select class="ad-f-type">' + typeOptions + '</select></div></div>'
            + '<div class="ad-type-hint">' + hint + '</div>'
            + (needCode ? '<div class="ad-field-row" style="align-items:flex-start"><label>代码</label><textarea class="ad-f-code" style="height:60px;resize:vertical" placeholder="粘贴广告代码...">' + escAttr(ad.code || '') + '</textarea></div>' : '')
            + (needImg ? '<div class="ad-field-row"><label>图片</label><input class="ad-f-image" value="' + escAttr(ad.image || '') + '" placeholder="' + (ad.imgMode === 'url' ? '粘贴图片网址 https://...' : '路径如 assets/ads/ad1.png') + '"><select class="ad-f-imgmode" style="width:70px;flex:none;font-size:12px;padding:4px"><option value="file"' + (ad.imgMode === 'url' ? '' : ' selected') + '>本地图片</option><option value="url"' + (ad.imgMode === 'url' ? ' selected' : '') + '>网络链接</option></select><button type="button" class="ad-f-upimg" style="padding:5px 8px;border:1px solid #667eea;border-radius:6px;background:#667eea;color:#fff;cursor:pointer;font-size:12px;white-space:nowrap;' + (ad.imgMode === 'url' ? 'display:none' : '') + '">上传</button></div>' : '')
            + (needImg ? '<div class="ad-field-row"><label>尺寸</label><input class="ad-f-w" value="' + (ad.width || '') + '" placeholder="宽" style="width:55px;flex:none"><span style="font-size:12px;padding:0 2px">&times;</span><input class="ad-f-h" value="' + (ad.height || '') + '" placeholder="高" style="width:55px;flex:none"><label style="margin-left:-2px">说明</label><input class="ad-f-alt" value="' + escAttr(ad.alt || '') + '" placeholder="加载失败时显示的文字" style="flex:0 1 200px"></div>' : '')
            + '</div>'
            + '<div class="ad-inline-btns" style="justify-content:flex-end"><button class="primary" data-ad-save="' + pos + '">保存</button>' + (isNew ? '' : '<button class="danger" data-ad-del="' + pos + '">删除</button>') + '</div>'
            + '</div>';
    }
    function renderAdZone(pos) {
        var zoneId = pos === 'top' ? 'adZoneTop' : (pos === 'left' ? 'adZoneLeft' : 'adZoneRight');
        var zoneEl = document.getElementById(zoneId);
        if (!zoneEl) return;
        var ads = adsByPosition(pos);
        var editingIdx = __adEditing[pos] !== undefined ? __adEditing[pos] : -1;
        var html = '';
        ads.forEach(function(ad, i) {
            var active = editingIdx === i;
            html += '<div class="ad-zone-item' + (active ? ' active' : '') + '" data-ad-pos="' + pos + '" data-ad-i="' + i + '" draggable="true">'
                + '<span class="ad-zone-name"><b style="color:#333;font-size:15px">' + (i + 1) + '.</b> ' + escAttr(ad.name || '') + ' <span class="ad-zone-type">' + adTypeLabel(ad.type || 'custom') + '</span>' + (ad.type === 'custom' ? ' <span class="ad-zone-src">' + (ad.imgMode === 'url' ? '网络图片' : '本地图片') + '</span>' : '') + '</span>'
                + '<span class="ad-tag" style="background:' + (ad.enabled !== false ? '#2ecc71' : '#e74c3c') + ';color:#fff;padding:3px 10px;border-radius:3px;font-size:12px;cursor:pointer;user-select:none">' + (ad.enabled !== false ? '开' : '关') + '</span>'
                + '<span class="ad-zone-move" data-move="up">&uarr;</span>'
                + '<span class="ad-zone-move" data-move="down">&darr;</span>'
                + '</div>';
            if (editingIdx === i) html += adFormHtml(pos, ads[editingIdx], false);
        });
        if (editingIdx === -2) html += adFormHtml(pos, { name: '', type: 'custom', enabled: true, image: '', imgMode: 'file', alt: '', width: 0, height: 0, code: '' }, true);
        zoneEl.innerHTML = html;
        zoneEl.querySelectorAll('.ad-tag').forEach(function(tag, i) {
            tag.addEventListener('click', function(e) { e.stopPropagation(); var ad = ads[i]; if (ad) { ad.enabled = ad.enabled === false ? true : false; renderAdZone(pos); renderAllAds(); } });
        });
        zoneEl.querySelectorAll('.ad-zone-item').forEach(function(item) {
            item.addEventListener('click', function(e) {
                if (e.target.classList.contains('ad-zone-move')) { moveAd(pos, parseInt(item.dataset.adI), e.target.getAttribute('data-move')); return; }
                if (e.target.classList.contains('ad-tag')) return;
                var idx = parseInt(item.dataset.adI);
                __adEditing[pos] = __adEditing[pos] === idx ? -1 : idx;
                renderAdZone(pos);
            });
        });
        var dragIdx = -1;
        zoneEl.querySelectorAll('.ad-zone-item').forEach(function(item) {
            item.addEventListener('mousedown', function() { item.classList.add('pressed'); });
            item.addEventListener('mouseup', function() { item.classList.remove('pressed'); });
            item.addEventListener('mouseleave', function() { item.classList.remove('pressed'); });
            item.addEventListener('dragstart', function(e) { dragIdx = parseInt(item.dataset.adI); item.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
            item.addEventListener('dragend', function() { item.classList.remove('dragging'); });
            item.addEventListener('dragover', function(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; item.classList.add('drag-over'); });
            item.addEventListener('dragleave', function() { item.classList.remove('drag-over'); });
            item.addEventListener('drop', function(e) {
                e.preventDefault(); item.classList.remove('drag-over');
                var dropIdx = parseInt(item.dataset.adI);
                if (dragIdx >= 0 && dropIdx >= 0 && dragIdx !== dropIdx) {
                    var ads = adsByPosition(pos);
                    var moved = ads.splice(dragIdx, 1)[0];
                    var insertAt = dragIdx < dropIdx ? dropIdx - 1 : dropIdx;
                    ads.splice(insertAt, 0, moved);
                    if (__adEditing[pos] >= 0) __adEditing[pos] = insertAt;
                    renderAdZone(pos); renderAllAds();
                }
                dragIdx = -1;
            });
        });
        zoneEl.querySelectorAll('[data-ad-cancel]').forEach(function(btn) { btn.addEventListener('click', function(e) { e.stopPropagation(); __adEditing[pos] = -1; renderAdZone(pos); }); });
        zoneEl.querySelectorAll('[data-ad-save]').forEach(function(btn) { btn.addEventListener('click', function(e) { e.stopPropagation(); saveAdForm(pos); }); });
        zoneEl.querySelectorAll('[data-ad-del]').forEach(function(btn) { btn.addEventListener('click', function(e) { e.stopPropagation(); deleteAdForm(pos); }); });
        var typeSel = zoneEl.querySelector('.ad-f-type');
        if (typeSel) {
            typeSel.addEventListener('change', function() {
                var ad = editingIdx >= 0 ? ads[editingIdx] : (editingIdx === -2 ? ads[ads.length] : null);
                if (!ad) { ad = { name: '', type: 'custom', enabled: true, image: '', link: '', alt: '', width: 0, height: 0, code: '' }; ads.push(ad); }
                var nameEl = zoneEl.querySelector('.ad-f-name'); if (nameEl) ad.name = nameEl.value;
                ad.type = typeSel.value;
                var codeEl = zoneEl.querySelector('.ad-f-code'); if (codeEl) ad.code = codeEl.value;
                var imgEl = zoneEl.querySelector('.ad-f-image'); if (imgEl) ad.image = imgEl.value;
                ad.imgMode = ad.imgMode || 'file';
                var wEl = zoneEl.querySelector('.ad-f-w'); ad.width = parseInt((wEl ? wEl.value : '') || '0') || 0;
                var hEl = zoneEl.querySelector('.ad-f-h'); ad.height = parseInt((hEl ? hEl.value : '') || '0') || 0;
                var altEl = zoneEl.querySelector('.ad-f-alt'); if (altEl) ad.alt = altEl.value;
                renderAdZone(pos);
            });
        }
        zoneEl.querySelectorAll('.ad-f-upimg').forEach(function(btn) {
            btn.addEventListener('click', function(e) { e.stopPropagation();
                var inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
                inp.onchange = function() { var f = inp.files && inp.files[0]; if (!f) return; var imgEl = zoneEl.querySelector('.ad-f-image'); if (imgEl) imgEl.value = 'assets/ads/' + f.name; toast('图片已选，路径: assets/ads/' + f.name); };
                inp.click();
            });
        });
        zoneEl.querySelectorAll('.ad-f-imgmode').forEach(function(sel) {
            sel.addEventListener('change', function(e) { e.stopPropagation();
                var mode = sel.value;
                var ads = adsByPosition(pos);
                var editingIdx = __adEditing[pos];
                var ad = editingIdx >= 0 ? ads[editingIdx] : (editingIdx === -2 ? { name: '', type: 'custom', enabled: true, image: '', alt: '', width: 0, height: 0, code: '', imgMode: 'file' } : null);
                if (!ad) return; ad.imgMode = mode;
                var upBtn = zoneEl.querySelector('.ad-f-upimg'); var imgInp = zoneEl.querySelector('.ad-f-image');
                if (upBtn) upBtn.style.display = mode === 'url' ? 'none' : '';
                if (imgInp) imgInp.placeholder = mode === 'url' ? '粘贴图片网址 https://...' : '路径如 assets/ads/ad1.png';
            });
        });
    }
    function saveAdForm(pos) {
        var zoneId = pos === 'top' ? 'adZoneTop' : (pos === 'left' ? 'adZoneLeft' : 'adZoneRight');
        var zoneEl = document.getElementById(zoneId); if (!zoneEl) return;
        var ads = adsByPosition(pos); var editingIdx = __adEditing[pos]; var isNew = editingIdx === -2;
        var nameEl = zoneEl.querySelector('.ad-f-name'); var typeEl = zoneEl.querySelector('.ad-f-type');
        var codeEl = zoneEl.querySelector('.ad-f-code'); var imgEl = zoneEl.querySelector('.ad-f-image');
        var wEl = zoneEl.querySelector('.ad-f-w'); var hEl = zoneEl.querySelector('.ad-f-h'); var altEl = zoneEl.querySelector('.ad-f-alt');
        var ad = isNew ? { name: '', type: 'custom', enabled: true, image: '', imgMode: 'file', alt: '', width: 0, height: 0, code: '' } : ads[editingIdx];
        ad.name = (nameEl ? nameEl.value : '').trim(); if (!ad.name) { toast('请填写名称'); return; }
        ad.type = typeEl ? typeEl.value : 'custom'; ad.code = codeEl ? codeEl.value : ''; ad.image = imgEl ? imgEl.value : '';
        ad.imgMode = ad.imgMode || 'file'; ad.width = parseInt((wEl ? wEl.value : '') || '0') || 0;
        ad.height = parseInt((hEl ? hEl.value : '') || '0') || 0; ad.alt = altEl ? altEl.value : '';
        if (isNew) ads.push(ad); __adEditing[pos] = -1; renderAdZone(pos); renderAllAds(); toast('已保存', true);
    }
    function deleteAdForm(pos) {
        showConfirm('确定删除这个广告位吗？', function () {
        var ads = adsByPosition(pos); ads.splice(__adEditing[pos], 1); __adEditing[pos] = -1;
        renderAdZone(pos); renderAllAds(); toast('已删除', true);
        });
    }
    function addNewAd(pos) { __adEditing[pos] = -2; renderAdZone(pos); }
    function moveAd(pos, index, direction) {
        var ads = adsByPosition(pos);
        if (direction === 'up' && index > 0) { var t = ads[index]; ads[index] = ads[index - 1]; ads[index - 1] = t; if (__adEditing[pos] >= 0) __adEditing[pos]--; }
        if (direction === 'down' && index < ads.length - 1) { var t = ads[index]; ads[index] = ads[index + 1]; ads[index + 1] = t; if (__adEditing[pos] >= 0) __adEditing[pos]++; }
        renderAdZone(pos); renderAllAds();
    }


    function escAttr(s) { return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    // 把编辑器返回的 favicon 值统一转成可写入 <link href> 的形式：
    // - 上传模式：data:image/png;base64,…（直接用）
    // - URL 模式：绝对/相对地址（直接用）
    // - SVG 模式：原始 <svg> 文本（需转成 data:image/svg+xml,… 才能被浏览器识别为图标）
    function faviconHref(val) {
        if (!val) return '';
        val = String(val).trim();
        if (/^\s*<svg/i.test(val)) return 'data:image/svg+xml,' + encodeURIComponent(val);
        return val;
    }

    // ─── 板块管理弹窗 ───
    function plainTitle(t, maxLen) { var s = (t || '').replace(/<[^>]*>/g, '').trim(); if (maxLen && s.length > maxLen) s = s.substring(0, maxLen - 1) + '\u2026'; return s; }
    function afterSortChange() { renderSections(); renderSortList(); }

    function renderSortList() {
        var list = document.getElementById('cmtSortList');
        if (!list) return;
        list.innerHTML = '<div style="background:#fff3cd;font-weight:600;font-size:14px;color:#333;padding:8px 0;border-bottom:2px solid #e0e0e0;display:flex;flex-direction:row;align-items:center;gap:10px;white-space:nowrap">'
            + '<span style="flex:0 0 44px;margin-left:-4px"></span>'
            + '<span style="flex:0 0 1px"></span>'
            + '<span style="flex:0 0 180px;padding-left:24px">标题</span>'
            + '<span style="flex:0 0 130px">模板类型</span>'
            + '<span style="flex:0 0 120px">模板</span>'
            + '<span style="flex:1">操作</span>'
            + '</div>'
            + commit.sections.map(function (sec, i) {
            var full = plainTitle(sec.title);
            return '<div class="ab-sort-row" data-sec="' + sec.id + '">'
                + '<span class="ab-drag-handle" title="长按拖动排序" style="margin-left:-4px">&#8776;</span>'
                + '<span class="ab-sort-divider"></span>'
                + '<span style="display:flex;align-items:center;gap:6px;flex:0 0 180px;min-width:0">'
                + '<span class="ab-sort-ic-wrap"><i class="' + sec.icon + '"></i><span class="ab-sort-ic-hint">换</span></span>'
                + '<span class="ab-sort-title" data-saved="' + escAttr(full) + '" title="' + escAttr(full) + '" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0">' + escAttr(plainTitle(sec.title, 12)) + '</span>'
                + '</span>'
                + '<span style="display:flex;align-items:center;gap:4px;flex:0 0 130px;min-width:0">'
                + '<span class="ab-sort-type-lbl" data-type-idx="' + i + '" title="点击选择模板类型">' + (function(){ var cs=comboCats(); for(var ci=0;ci<cs.length;ci++)if(cs[ci].id===(sec._comboCat||''))return cs[ci].name; return TYPE_LABELS[sec.type]||sec.type; })() + '</span>'
                + '<select class="ab-sort-type-sel" data-type-idx="' + i + '" style="display:none;font-size:12px;padding:3px 6px;border:1px solid #667eea;border-radius:4px"><option value="">选择模板类型</option>' + comboCats().map(function(c){return '<option value="'+c.id+'">'+escAttr(c.name)+'</option>';}).join('') + '</select>'
                + '</span>'
                + '<span style="flex:0 0 120px;min-width:0">'
                + '<select class="ab-sort-ver-sel" data-ver-idx="' + i + '" data-combo-cat="' + (sec._comboCat||'') + '" style="font-size:11px;padding:2px 4px;border:1px solid #ddd;border-radius:3px;color:#666;max-width:110px">' + (function(){var cits=comboItems(sec._comboCat||'');return cits.map(function(v){return '<option value="'+v.id+'"'+(v.id===(sec._comboVer||'')?' selected':'')+'>'+escAttr(v.name)+'</option>';}).join('');})() + '</select>'
                + '</span>'
                + '<span class="ab-sort-act" style="flex:1;min-width:0">'
                + '<button class="ab-sort-defbtn" data-def="' + i + '" style="padding:3px 8px;border:1px solid ' + (tplFindVer(sec) ? '#6ee7b7' : '#ddd') + ';background:' + (tplFindVer(sec) ? '#d4edda' : '#fff') + ';color:' + (tplFindVer(sec) ? '#155724' : '#666') + ';border-radius:4px;cursor:pointer;font-size:11px">' + (tplFindVer(sec) ? '已保存' : '保存') + '</button>'
                + '<button data-del2 style="font-size:18px;padding:2px 6px;border:none;background:none;color:#e74c3c;cursor:pointer" title="删除"><i class="fas fa-trash" style="display:inline-block;transform:scaleX(1.25)"></i></button>'
                + '</span></div>';
        }).join('');
        $all('.ab-sort-row', list).forEach(function (row, i) {
            var id = row.getAttribute('data-sec');
            if (!id) return;
            var idx = -1;
            for (var k = 0; k < commit.sections.length; k++) if (commit.sections[k].id === id) { idx = k; break; }
            var sec = commit.sections[idx];
            var icWrap = row.querySelector('.ab-sort-ic-wrap');
            if (icWrap) icWrap.onclick = function () { showIconPicker(icWrap, function (nic) { sec.icon = nic; afterSortChange(); }); };
            var ttEl = row.querySelector('.ab-sort-title');
            if (ttEl) ttEl.addEventListener('click', function () {
                if (ttEl.classList.contains('editing')) return;
                ttEl.textContent = ttEl.getAttribute('data-saved') || '';
                ttEl.classList.add('editing'); ttEl.setAttribute('contenteditable', 'true'); ttEl.focus();
                var range = document.createRange(); range.selectNodeContents(ttEl);
                var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
                var btns = document.createElement('span'); btns.className = 'ab-tt-btns'; btns.innerHTML = '<a class="ab-tt-ok" title="确认"><i class="fas fa-check"></i></a><a class="ab-tt-cancel" title="取消"><i class="fas fa-times"></i></a>';
                ttEl.appendChild(btns);
                btns.querySelector('.ab-tt-ok').onclick = function (ev) { ev.stopPropagation(); var nt = ttEl.innerText.trim(); sec.title = nt || ttEl.getAttribute('data-saved'); ttEl.setAttribute('data-saved', sec.title); exitEdit(ttEl); renderSections(); };
                btns.querySelector('.ab-tt-cancel').onclick = function (ev) { ev.stopPropagation(); exitEdit(ttEl); };
                function exitEdit(el) { el.removeAttribute('contenteditable'); el.classList.remove('editing'); var b = el.querySelector('.ab-tt-btns'); if (b) b.remove(); var f = el.getAttribute('data-saved') || sec.title || ''; el.textContent = plainTitle(f, 12); el.setAttribute('data-saved', plainTitle(f)); }
            });
            var del = row.querySelector('[data-del2]'); if (del) del.onclick = function () { showConfirm('确定要删除「' + plainTitle(sec.title) + '」板块吗？', function () { commit.sections.splice(idx, 1); afterSortChange(); }); };
            var typeLbl = row.querySelector('.ab-sort-type-lbl');
            var typeSel = row.querySelector('.ab-sort-type-sel');
            if (typeLbl && typeSel) {
                typeLbl.addEventListener('click', function (e) { e.stopPropagation(); typeLbl.style.display = 'none'; typeSel.style.display = ''; typeSel.focus(); });
                typeSel.addEventListener('change', function () {
                    var catId = typeSel.value;
                    if (!catId) { renderSortList(); return; }
                    sec._comboCat = catId;
                    var verSelEl = row.querySelector('.ab-sort-ver-sel');
                    if (verSelEl) {
                        verSelEl.setAttribute('data-combo-cat', catId);
                        var items = comboItems(catId);
                        verSelEl.innerHTML = items.map(function(v){return '<option value="'+v.id+'">'+escAttr(v.name)+'</option>';}).join('');
                    }
                    typeSel.value = catId;
                });
                typeSel.addEventListener('blur', function () {
                    setTimeout(function () { var cs=comboCats(); var cn=''; for(var ci=0;ci<cs.length;ci++)if(cs[ci].id===(sec._comboCat||'')){cn=cs[ci].name;break;} typeLbl.textContent = cn || (TYPE_LABELS[sec.type]||sec.type); typeLbl.style.display = ''; typeSel.style.display = 'none'; }, 150);
                });
            }
            var verSel = row.querySelector('.ab-sort-ver-sel');
            if (verSel) verSel.addEventListener('change', function () {
                var vid = verSel.value;
                if (!vid) { sec._comboVer = ''; return; }
                sec._comboVer = vid;
                var catId = verSel.getAttribute('data-combo-cat') || sec._comboCat || '';
                var vt = comboFindItem(catId, vid);
                if (!vt) return;
                if (vt.type) sec.type = vt.type;
                sec.icon = vt.icon || sec.icon;
                sec.title = vt.title;
                // 选择模板后统一进入模块模式，清空旧内容，避免残留的旧编辑器
                sec.content = { richHtml: '', items: [] };
                sec.modules = vt.modules ? JSON.parse(JSON.stringify(vt.modules)) : [];
                sec._pvCols = vt._pvCols ? JSON.parse(JSON.stringify(vt._pvCols)) : [];
                afterSortChange();
            });
            var defBtn = row.querySelector('.ab-sort-defbtn');
            if (defBtn) defBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                showConfirm('确定将该板块保存到模板库吗？', function () {
                    tplSave(sec);
                    renderSortList();
                }, '确认保存');
            });
            (function (r, iIdx) {
                var pressTimer = null, dragging = false, startY = 0;
                var handle = r.querySelector('.ab-drag-handle');
                if (handle) handle.addEventListener('mousedown', function (e) {
                    startY = e.clientY; dragging = false;
                    pressTimer = setTimeout(function () { dragging = true; r.classList.add('ab-dragging'); document.body.classList.add('ab-dragging-active'); }, 50);
                });
                function onMove(e) {
                    if (pressTimer && Math.abs(e.clientY - startY) > 5) { clearTimeout(pressTimer); pressTimer = null; }
                    if (!dragging) return; e.preventDefault();
                    var rows = $all('.ab-sort-row', list); var inserted = false; var myRect = r.getBoundingClientRect();
                    if (e.clientY < myRect.top) {
                        for (var ri = 0; ri < rows.length; ri++) { if (rows[ri] === r) continue; var rect = rows[ri].getBoundingClientRect(); if (e.clientY >= rect.top && e.clientY < rect.bottom) { if (list.children[ri] !== r) { list.insertBefore(r, rows[ri]); inserted = true; } break; } }
                    } else if (e.clientY > myRect.bottom) {
                        for (var rj = 0; rj < rows.length; rj++) { if (rows[rj] === r) continue; var rect2 = rows[rj].getBoundingClientRect(); if (e.clientY >= rect2.top && e.clientY < rect2.bottom) { var nextSib = rows[rj].nextSibling; if (nextSib !== r) { list.insertBefore(r, nextSib); inserted = true; } else if (list.lastChild !== r) { list.appendChild(r); inserted = true; } break; } }
                        if (!inserted && list.lastChild !== r) { list.appendChild(r); inserted = true; }
                    }
                    if (inserted) { var newOrder = []; $all('.ab-sort-row', list).forEach(function (nr) { var nid2 = nr.getAttribute('data-sec'); for (var si = 0; si < commit.sections.length; si++) { if (commit.sections[si].id === nid2) { newOrder.push(commit.sections[si]); break; } } }); commit.sections = newOrder; }
                }
                function onUp(e) {
                    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
                    if (!dragging) return; dragging = false;
                    document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp);
                    r.classList.remove('ab-dragging'); document.body.classList.remove('ab-dragging-active'); afterSortChange();
                }
                document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
            })(row, idx);
        });
    }


    function openSortModal() {
        var ov = document.createElement('div'); ov.className = 'ab-modal-ov';
        ov.innerHTML = '<div class="ab-modal" style="width:640px;max-width:92vw">'
            + '<div class="ab-modal-h"><span>板块管理</span>'
            + '<button id="cmtModBtn" style="margin-left:16px;padding:5px 14px;border:1px solid #667eea;background:#667eea;color:#fff;border-radius:4px;cursor:pointer;font-size:13px">模块库</button>'
            + '<button id="cmtTplBtn" style="margin-left:8px;padding:5px 14px;border:1px solid #27ae60;background:#27ae60;color:#fff;border-radius:4px;cursor:pointer;font-size:13px">模版库</button>'
            + '<a class="ab-modal-x" data-close>&times;</a></div>'
            + '<div class="ab-modal-b" id="cmtSortList"></div>'
            + '<div class="ab-add-sec" id="cmtAddSec" style="padding:10px;text-align:center;font-size:14px;color:#667eea;cursor:pointer;border-top:1px solid #eee">+ 添加板块</div>'
            + '</div></div>';
        document.body.appendChild(ov); renderSortList();
        document.getElementById('cmtTplBtn').onclick = function () { window.open('/template/模版库/index.html', '_blank'); };
        document.getElementById('cmtModBtn').onclick = function () { window.open('/template/模块库/index.html', '_blank'); };
        document.getElementById('cmtAddSec').onclick = function () {
            var cats = comboCats();
            if (cats.length === 0) { commit.sections.push({ id: nid(), type: 'form', icon: 'fas fa-star', title: '新建板块', content: { richHtml: '', items: [] } }); afterSortChange(); return; }
            var dlg = document.createElement('div'); dlg.className = 'ab-modal-ov';
            dlg.style.zIndex = '100002';
            var html = '<div class="ab-modal" style="width:520px;max-height:80vh;overflow-y:auto">'
                + '<div class="ab-modal-h"><span>从模版库选择</span><a class="ab-modal-x" data-close>&times;</a></div>'
                + '<div class="ab-modal-b" style="padding:12px">';
            cats.forEach(function (cat) {
                var items = comboItems(cat.id);
                html += '<div style="margin-bottom:12px;border:1px solid #e0e0e0;border-radius:6px;overflow:hidden">'
                    + '<div style="background:#f5f6f8;padding:8px 14px;font-weight:600;font-size:13px;color:#333">' + escAttr(cat.name) + '</div>'
                    + '<div style="padding:6px;display:grid;grid-template-columns:1fr 1fr;gap:4px">'
                    + (items.length === 0 ? '<div style="grid-column:1/-1;padding:8px 14px;color:#ccc;font-size:12px">暂无模板</div>' : items.map(function (it) {
                        return '<div style="padding:8px 10px;cursor:pointer;display:flex;align-items:center;gap:8px;border-radius:4px;transition:background .15s" class="tpl-pick-item" data-cat-id="' + cat.id + '" data-item-id="' + it.id + '"><i class="' + escAttr(it.icon || 'fas fa-star') + '" style="color:#667eea;font-size:14px;flex-shrink:0"></i><span style="font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escAttr(it.name) + '</span></div>';
                    }).join(''))
                    + '</div></div>';
            });
            html += '</div></div>';
            dlg.innerHTML = html;
            document.body.appendChild(dlg);
            dlg.querySelectorAll('.tpl-pick-item').forEach(function (el) {
                el.addEventListener('mouseenter', function () { el.style.background = '#f0f2ff'; });
                el.addEventListener('mouseleave', function () { el.style.background = ''; });
                el.addEventListener('click', function () {
                    var catId = el.getAttribute('data-cat-id');
                    var itemId = el.getAttribute('data-item-id');
                    var vt = comboFindItem(catId, itemId);
                    if (!vt) return;
                    commit.sections.push({ id: nid(), type: vt.type || 'form', icon: vt.icon || 'fas fa-star', title: vt.title || vt.name, content: JSON.parse(JSON.stringify(vt.content || { richHtml: '', items: [] })), modules: JSON.parse(JSON.stringify(vt.modules || [])), _pvCols: (vt._pvCols || []).slice(), _comboCat: catId, _comboVer: itemId });
                    document.body.removeChild(dlg);
                    afterSortChange();
                });
            });
            dlg.querySelector('[data-close]').onclick = function () { document.body.removeChild(dlg); };
            dlg.addEventListener('click', function (e) { if (e.target === dlg) document.body.removeChild(dlg); });
            function onEscPick(e) { if (e.key === 'Escape') { document.body.removeChild(dlg); document.removeEventListener('keydown', onEscPick); } }
            document.addEventListener('keydown', onEscPick);
        };
        ov.addEventListener('click', function (e) { if (e.target.hasAttribute('data-close')) { document.body.removeChild(ov); } });
        function onEscSort(e) { if (e.key === 'Escape' && !__cfmOpen) { document.body.removeChild(ov); document.removeEventListener('keydown', onEscSort); } }
        document.addEventListener('keydown', onEscSort);
    }

    function injectStyles() {
        if (document.getElementById('cmtEditStylesV2')) return;
        var s = document.createElement('style');
        s.id = 'cmtEditStylesV2';
        s.textContent = [
            '.cmt-edit-bar{position:fixed;top:0;left:0;right:0;z-index:100000;background:#1e1e2e;color:#eee;padding:6px 16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,.3)}',
            '.cmt-edit-bar button,.cmt-edit-bar .cmt-btn{display:inline-flex;align-items:center;gap:5px;height:32px;padding:0 12px;border:none;border-radius:6px;cursor:pointer;font-size:13px;transition:all .15s}',
            '.cmt-btn-save{background:#27ae60;color:#fff}',
            '.cmt-btn-export{background:#2980b9;color:#fff}',
            '.cmt-btn-set-tpl{background:#8e44ad;color:#fff}',
            '.cmt-btn-sort{background:#f39c12;color:#fff}',
            '.cmt-btn-bg-wrap{position:relative;display:inline-flex}',
            '.cmt-btn-bg{display:inline-flex;align-items:center;gap:5px;height:32px;padding:0 12px;border:none;border-radius:6px;cursor:pointer;font-size:13px;background:#3a3a4d;color:#ccc;min-width:70px}',
            '.cmt-btn-bg-wrap input{position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer}',
            '.cmt-btn-favicon{display:inline-flex;align-items:center;gap:5px;height:32px;padding:0 12px;border:none;border-radius:6px;cursor:pointer;font-size:13px;background:#3a3a4d;color:#ccc}',
            '.cmt-btn-favicon img{display:inline-block;width:14px;height:14px;border-radius:3px;margin-left:4px;object-fit:contain;background:#fff}',
            '.cmt-sep{width:1px;height:20px;background:#3a3a4d;margin:0 4px}',
            '.cmt-label{font-size:20px;font-weight:700;color:#fff;white-space:nowrap}',
            '.cmt-filename{color:#667eea;cursor:pointer;font-size:12px;white-space:nowrap;border-bottom:1px dashed #667eea;padding-bottom:1px}',
            '.cmt-right{flex:1;display:flex;justify-content:flex-end;align-items:center}',
            '.cmt-site-version-bar{display:inline-flex;align-items:center;gap:2px;margin-left:6px;font-size:12px;color:#888;white-space:nowrap}',
            '.cmt-sv-site,.cmt-sv-version{position:relative;cursor:pointer;color:#fff;padding:2px 6px;border-radius:4px;font-weight:500;transition:background .15s}',
            '.cmt-sv-site{font-size:16px;font-weight:600}',
            '.cmt-sv-version{font-size:13px;font-weight:500;font-style:italic}',
            '.cmt-sv-site:hover,.cmt-sv-version:hover{background:rgba(138,164,255,.15)}',
            '.cmt-sv-sep{color:#fff;padding:0 4px;font-size:16px;font-weight:700}',
            '.cmt-sv-badge{position:absolute;top:-6px;right:-6px;background:#4f6bff;color:#fff;border-radius:8px;padding:0 5px;font-size:10px;line-height:15px;min-width:15px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.2)}',
            '.cmt-sv-dropdown{position:fixed;z-index:100001;background:#fff;color:#333;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.2);max-height:320px;overflow:auto;min-width:160px;padding:4px 0}',
            '.cmt-sv-item{padding:8px 14px;cursor:pointer;font-size:13px;white-space:nowrap;display:flex;align-items:center}',
            '.cmt-sv-item:hover{background:#f0f2ff}',
            '.cmt-sv-item.on{background:#667eea;color:#fff}',
            '.cmt-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:100003;display:flex;align-items:center;justify-content:center}',
            '.cmt-sec-title-edit{cursor:text;border-radius:3px;padding:2px 4px;margin:-2px -4px;transition:background .15s}',
            '.cmt-sec-title-edit:hover{background:rgba(102,126,234,.1);outline:1px dashed #667eea}',
            '.cmt-item-add:hover{text-decoration:underline}',
            '.cmt-item-del:hover{opacity:1}',
            'body{padding-top:50px}',
            '.toast-bar{position:fixed;top:52px;left:50%;transform:translateX(-50%);z-index:100002;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,.2);transition:opacity .25s;opacity:0;pointer-events:none;display:flex;align-items:center;gap:8px}',
            '.toast-bar.show{opacity:1}',
            '.toast-bar.toast-warn{background:#fef3e2;color:#b45309;border:1px solid #fcd34d}',
            '.toast-bar.toast-ok{background:#d1fae5;color:#065f46;border:1px solid #6ee7b7}',
            // 弹窗骨架（同关于导航）
            '.ab-modal-ov{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:100001;display:flex;align-items:center;justify-content:center}',
            '.ab-modal{background:#fff;color:#333;width:480px;max-width:92vw;max-height:86vh;overflow:auto;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.3)}',
            '.ab-modal-h{display:flex;align-items:center;font-weight:600;padding:14px 16px;border-bottom:1px solid #eee;font-size:16px;color:#333}',
            '.ab-modal-h .ab-modal-x{margin-left:auto;cursor:pointer;font-size:24px;color:#999;line-height:1}',
            '.ab-modal-h .ab-modal-x:hover{color:#333}',
            '.ab-modal-b{padding:6px 16px}',
            '.ab-modal-b .primary{background:#667eea;color:#fff;border:0;border-radius:6px;padding:6px 14px;cursor:pointer;font-size:13px}',
            // 广告管理样式（同关于导航）
            '.ad-zone-card{border:1px solid #e0e0e0;border-radius:8px;overflow:hidden}',
            '.ad-zone-hd{display:flex;align-items:center;justify-content:space-between;padding:4px 10px;background:#f8f8f8;font-size:13px;font-weight:600;color:#555;border-bottom:1px solid #e0e0e0}',
            '.ad-zone-add-bar{display:flex;padding:3px 8px;border-top:1px solid #f0f0f0;background:#fafafa}',
            '.ad-zone-add-bar .ad-zone-add{flex:1;text-align:center;padding:6px 12px;font-size:16px;font-weight:700;border-radius:4px;border:3px solid #667eea;color:#667eea;cursor:pointer}',
            '.ad-zone-add-bar .ad-zone-add:hover{background:#667eea;color:#fff}',
            '.ad-zone-add{font-weight:400;color:#667eea;cursor:pointer;font-size:12px}',
            '.ad-zone-add:hover{text-decoration:underline}',
            '.ad-zone-bd{overflow-y:auto}',
            '.ad-zone-item{display:flex;align-items:center;gap:4px;padding:4px 10px;cursor:pointer;border-bottom:1px solid #f5f5f5;font-size:14px}',
            '.ad-zone-item:hover{background:#f5f7fa}',
            '.ad-zone-item.active{background:#667eea;color:#fff}',
            '.ad-zone-item.active .ad-tag{color:#fff}',
            '.ad-zone-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
            '.ad-zone-item.active .ad-zone-type{color:rgba(255,255,255,.9)}',
            '.ad-zone-item.active .ad-zone-src{color:rgba(255,255,255,.6)}',
            '.ad-zone-move{cursor:pointer;color:#bbb;padding:4px 10px;font-size:16px;border-radius:3px}',
            '.ad-zone-item.active .ad-zone-move{color:#fff}',
            '.ad-zone-move:hover{color:#667eea;background:rgba(102,126,234,.1)}',
            '.ad-zone-item.active .ad-zone-move:hover{color:#fff}',
            '.ad-inline-form{margin:8px 0;border:1px solid #667eea;border-radius:8px;overflow:hidden}',
            '.ad-inline-hd{display:flex;align-items:center;justify-content:space-between;padding:6px 12px;background:#667eea;color:#fff;font-size:13px;font-weight:600}',
            '.ad-inline-close{cursor:pointer;font-size:16px;line-height:1}',
            '.ad-inline-bd{padding:8px 12px;display:flex;flex-direction:column;gap:6px}',
            '.ad-inline-btns{display:flex;gap:8px;padding:6px 12px;border-top:1px solid #e0e0e0}',
            '.ad-inline-btns button{padding:5px 14px;border-radius:6px;border:0;cursor:pointer;font-size:13px}',
            '.ad-inline-btns button.primary{background:#667eea;color:#fff}',
            '.ad-inline-btns button.danger{background:#e74c3c;color:#fff}',
            '.ad-inline-btns button.ghost{background:#eee;color:#333}',
            '.ad-col2{display:flex;gap:12px}',
            '.ad-col2 .ad-field-row{flex:1}',
            '.ad-inline-bd .ad-type-hint{max-height:60px;font-size:11px;padding:4px 8px}',
            '.ad-type-hint{background:#f0f4ff;padding:8px 12px;border-radius:6px;font-size:12px;color:#555;line-height:1.6;max-height:140px;overflow-y:auto}',
            '.ad-field-row{display:flex;align-items:center;gap:8px}',
            '.ad-field-row label{width:45px;flex-shrink:0;font-size:13px;text-align:right}',
            '.ad-field-row input,.ad-field-row select,.ad-field-row textarea{flex:1;padding:6px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px}',
            '.ad-banner{background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,.1)}',
            '.ad-banner img,.ad-banner video{width:100%;display:block}',
            '.ad-banner iframe{border:0;display:block;width:100%}',
            '.ad-banner-text{padding:12px;text-align:center;font-weight:600;font-size:14px}',
            '.ad-zone-type{font-size:13px;color:#667eea;flex-shrink:0}',
            '.ad-zone-src{font-size:12px;color:#999;flex-shrink:0}',
            '.ad-sidebar{position:fixed;top:80px;width:180px;display:flex;flex-direction:column;gap:10px;z-index:10}',
            '.ad-sidebar.left{left:10px}', '.ad-sidebar.right{right:10px}',
            '.ad-top-bar{position:fixed;top:48px;left:50%;transform:translateX(-50%);z-index:99;max-width:900px;width:calc(100% - 40px);text-align:center}',
            '.ad-zone-item.dragging{opacity:.4}', '.ad-zone-item.drag-over{border-top:3px solid #667eea}',
            '.ad-zone-item.pressed{background:#e8ecf4;transform:scale(.98);transition:transform .1s}',
            // 板块管理样式（同关于导航）
            '.ab-sort-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #f2f2f2}',
            '.ab-sort-row{cursor:default}',
            '.ab-sort-ic-wrap{position:relative;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:5px;cursor:pointer;transition:background .15s}',
            '.ab-sort-ic-wrap:hover{background:#e8ebff}',
            '.ab-sort-ic-wrap>i{color:#667eea;font-size:18px}',
            '.ab-sort-ic-hint{display:none;position:absolute;top:-7px;right:-7px;background:#667eea;color:#fff;font-size:10px;width:16px;height:16px;border-radius:50%;align-items:center;justify-content:center;font-weight:700}',
            '.ab-sort-ic-wrap:hover .ab-sort-ic-hint{display:flex}',
            '.ab-sort-title{flex:1;font-size:14px;cursor:pointer}',
            '.ab-sort-title:hover{color:#667eea}',
            '.ab-sort-title.editing{display:inline-flex;align-items:center;gap:6px}',
            '.ab-tt-btns{display:inline-flex;gap:2px;margin-left:4px;flex-shrink:0}',
            '.ab-tt-ok,.ab-tt-cancel{cursor:pointer;font-size:18px;line-height:1;text-decoration:none;padding:0 4px;display:inline-flex;align-items:center}',
            '.ab-tt-ok,.ab-tt-ok i{color:#27ae60}',
            '.ab-tt-cancel,.ab-tt-cancel i{color:#e74c3c}',
            '.ab-tt-ok:hover,.ab-tt-cancel:hover{opacity:.7}',
            '.ab-drag-handle{display:inline-flex;align-items:center;justify-content:center;width:44px;padding:6px 8px;cursor:grab;color:#bbb;font-size:16px;user-select:none;touch-action:none;margin:-1px 0}',
            '.ab-drag-handle:hover{color:#667eea;background:#f0f2ff;border-radius:4px}',
            '.ab-drag-handle:active{ cursor:grabbing}',
            '.ab-sort-divider{width:1px;align-self:stretch;background:#ddd;margin:0}',
            '.ab-sort-row.ab-dragging{opacity:.6;border:2px solid #667eea;border-radius:8px;box-shadow:0 4px 16px rgba(102,126,234,.35);z-index:2;position:relative;cursor:grabbing}',
            '.ab-dragging-active{user-select:none}',
            '.ab-sort-act{display:flex;gap:10px}',
            '.ab-sort-act button{background:#f0f2f7;border:0;border-radius:5px;padding:5px 10px;cursor:pointer;font-size:13px;color:#444}',
            '.ab-sort-act button:disabled{opacity:.4;cursor:not-allowed}',
            '.ab-sort-defbtn:hover{opacity:.85}',
            '.ab-sort-type-lbl{display:inline-block;padding:3px 10px;border-radius:4px;font-size:12px;color:#667eea;background:#f0f4ff;cursor:pointer;user-select:none}',
            '.ab-sort-type-lbl:hover{background:#e0e8ff}',
            '.ab-sort-type-sel{padding:3px 8px;border:1px solid #667eea;border-radius:4px;font-size:12px;color:#333;background:#fff}',
            '.ab-add-sec{margin:12px 16px;padding:10px;text-align:center;color:#667eea;border:1px dashed #667eea;border-radius:8px;cursor:pointer;font-size:14px}',
            '.ab-add-sec:hover{background:#f0f4ff}',
            '.ab-add-form-wrap{padding:8px 16px}',
            '.ab-add-form{display:flex;flex-direction:column;gap:8px}',
            '.ab-in{padding:6px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;width:100%;box-sizing:border-box}',
            '.ab-ic-pick{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid #ddd;border-radius:6px;cursor:pointer;font-size:13px;color:#555}',
            '.ab-ic-pick:hover{border-color:#667eea;color:#667eea}',
            '.ab-modal-f{padding:12px 16px;border-top:1px solid #eee;text-align:right}',
            '.ab-modal-f .primary{background:#667eea;color:#fff;border:0;border-radius:6px;padding:8px 18px;cursor:pointer}',
            '.ab-mod-blocks{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0;padding:10px;background:#fafbfc;border-radius:8px;border:1px dashed #ddd}',
            '.ab-mp-block{padding:8px;background:#fff;border-radius:6px;border:1px solid #eee}',
            '.ab-mp-span1{grid-column:span 1}.ab-mp-span2{grid-column:span 2}.ab-mp-span3{grid-column:span 3}.ab-mp-span4{grid-column:span 4}',
            '.ab-mp-label{font-size:11px;color:#999;margin-bottom:4px}',
            '.ab-mp-input{width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;color:#999;background:#fafafa;box-sizing:border-box}',
            '.ab-mp-textarea{width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;color:#999;background:#fafafa;resize:none;box-sizing:border-box}',
            '.ab-mp-select{width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;color:#999;background:#fafafa;box-sizing:border-box}',
            '.ab-mp-toggle{width:36px;height:20px;border-radius:10px;background:#27ae60;position:relative}',
            '.ab-mp-toggle::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;background:#fff;border-radius:50%}',
            '.ab-mp-slider{width:100px;height:6px;border-radius:3px;background:#e0e0e0;position:relative}',
            '.ab-mp-slider-bar{position:absolute;top:-5px;left:60%;width:16px;height:16px;background:#27ae60;border-radius:50%}',
            '.ab-mp-search{padding-left:28px}',
            '.ab-mp-skills{display:flex;gap:4px}',
            '.ab-mp-skill-tag{padding:3px 8px;border-radius:4px;font-size:11px;color:#fff}',
            '.ab-mp-progress{width:100%;height:8px;background:#e8e8e8;border-radius:4px;overflow:hidden}',
            '.ab-mp-progress-bar{height:100%;border-radius:4px}',
            '.ab-mp-badge{padding:2px 8px;border-radius:10px;font-size:11px;color:#fff;background:#e74c3c}',
            '.ab-mp-quote{border-left:3px solid #27ae60;padding:6px 10px;background:#e8f5e9;font-size:12px;color:#666;border-radius:0 4px 4px 0}',
            '.ab-mp-contact{font-size:12px;color:#666;line-height:1.6}',
            '.ab-mp-alert{padding:6px 10px;border-radius:4px;font-size:11px}',
            '.ab-mp-alert-ok{background:#d4edda;color:#155724}',
            '.ab-mp-divider{display:flex;align-items:center;gap:8px;margin:8px 0}',
            '.ab-mp-divider::before,.ab-mp-divider::after{content:"";flex:1;height:1px;background:#e0e0e0}',
            '.ab-mp-divider span{font-size:11px;color:#ccc}',
            '.ab-mp-tabs{display:flex}',
            '.ab-mp-tab{padding:4px 10px;font-size:11px;border:1px solid #ddd;background:#fafafa;color:#999}',
            '.ab-mp-tab.active{background:#27ae60;color:#fff;border-color:#27ae60}',
            '.ab-mp-steps{display:flex;align-items:center}',
            '.ab-mp-step-num{width:20px;height:20px;border-radius:50%;background:#27ae60;color:#fff;font-size:10px;display:flex;align-items:center;justify-content:center}',
            '.ab-mp-step-line{width:20px;height:2px;background:#e0e0e0;margin:0 2px}',
            '.ab-mp-icon{width:32px;height:32px;border-radius:6px;background:linear-gradient(135deg,#27ae60,#2ecc71);display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px}',
            '.ab-mp-avatar{width:36px;height:36px;border-radius:50%;background:#f093fb;display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px;font-weight:bold}',
            '.ab-mp-unknown{padding:4px 10px;background:#f0f0f0;color:#999;border-radius:4px;font-size:11px}',
        ].join('\n');
        document.head.appendChild(s);
    }

    // ─── Toast ───
    var toastTimer, toastEl;
    function toast(msg, ok) {
        if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast-bar'; document.body.appendChild(toastEl); }
        clearTimeout(toastTimer);
        toastEl.className = 'toast-bar show ' + (ok ? 'toast-ok' : 'toast-warn');
        toastEl.innerHTML = (ok ? '<i class="fas fa-check-circle"></i> ' : '<i class="fas fa-exclamation-triangle"></i> ') + msg;
        toastTimer = setTimeout(function () { toastEl.className = 'toast-bar'; }, 2200);
    }

    var __cfmOpen = false;
    function showConfirm(msg, cb, btnLabel) {
        btnLabel = btnLabel || '确定';
        var uid = 'cfm_' + Date.now().toString(36);
        var ov = document.createElement('div'); ov.className = 'ab-modal-ov';
        ov.innerHTML = '<div class="ab-modal" style="width:400px;text-align:center">'
            + '<div class="ab-modal-h">提示<a class="ab-modal-x" data-close>&times;</a></div>'
            + '<div class="ab-modal-b"><p style="font-size:14px;color:#333;margin:0;padding:12px 0">' + msg + '</p></div>'
            + '<div class="ab-modal-f"><button id="' + uid + '_cancel" style="margin-right:8px;padding:8px 20px;border:1px solid #ddd;background:#fff;border-radius:6px;cursor:pointer;color:#666;font-size:13px">取消</button><button id="' + uid + '_ok" class="primary" style="background:#e74c3c">' + btnLabel + '</button></div></div>';
        document.body.appendChild(ov);
        __cfmOpen = true;
        var closing = false;
        function close() { if (closing) return; closing = true; __cfmOpen = false; document.body.removeChild(ov); }
        ov.querySelector('[data-close]').onclick = close;
        document.getElementById(uid + '_cancel').onclick = close;
        document.getElementById(uid + '_ok').onclick = function () {
            close(); try { cb(); } catch (e) { alert('替换失败：' + (e.message || e)); }
        };
        document.addEventListener('keydown', function onEsc(e) {
            if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
        });
    }

    // ─── 模板库面板 ───
    // ─── 工具栏 ───
    function buildToolbar() {
        if (document.getElementById('cmtToolbar')) return;
        var bar = document.createElement('div');
        bar.className = 'cmt-edit-bar';
        bar.id = 'cmtToolbar';
        bar.innerHTML =
            '<span class="cmt-label" id="cmtTitleBtn" title="点击设置浏览器标签" style="cursor:pointer">' + escapeHtml(navLabel || '网站提交') + '</span>' +
            '<span id="cmtSiteVersionBar" class="cmt-site-version-bar" style="display:none"></span>' +
            '<span class="cmt-filename" id="cmtFileName" title="点击修改文件名（.html 不可改）" style="margin-left:8px">' + escapeHtml(displayFileName) + '</span>' +
            '<span class="cmt-sep"></span>' +
            '<button class="cmt-btn-save" id="cmtSave"><i class="fas fa-save"></i> 保存</button>' +
            '<button class="cmt-btn-export" id="cmtOpen"><i class="fas fa-folder-open"></i> 打开</button>' +
            '<button class="cmt-btn-export" id="cmtExport"><i class="fas fa-download"></i> 下载</button>' +
            '<button class="cmt-btn-set-tpl" id="cmtSetTpl"><i class="fas fa-star"></i> 设为模板</button>' +
            '<div class="cmt-right">' +
            '<button class="cmt-btn-sort" id="cmtBackendBtn" style="margin-right:8px"><i class="fas fa-server"></i> 后端服务</button>' +
            '' +
            '<span class="cmt-btn-bg-wrap"><span class="cmt-btn-bg" id="cmtBgBtn"><i class="fas fa-fill-drip"></i> 头部背景<span style="display:inline-block;width:14px;height:14px;border-radius:3px;margin-left:4px;vertical-align:middle;background:#4CAF50" id="cmtBgPrev"></span></span><input type="color" id="cmtBgInput" value="#4CAF50"></span>' +
            '<span style="width:8px;display:inline-block"></span>' +
            '<button class="cmt-btn-sort" id="cmtAdBtn"><i class="fas fa-ad"></i> 广告管理</button>' +
            '<button class="cmt-btn-sort" id="cmtSort" style="margin-left:8px"><i class="fas fa-th-list"></i> 板块管理</button>' +
            '</div>';
        document.body.insertBefore(bar, document.body.firstChild);
        // 事件
        document.getElementById('cmtSave').onclick = save;
        document.getElementById('cmtExport').onclick = downloadHtml;
        document.getElementById('cmtOpen').onclick = openHtmlFile;
        document.getElementById('cmtSetTpl').onclick = setAsTemplate;
        document.getElementById('cmtSort').onclick = openSortModal;
        document.getElementById('cmtAdBtn').onclick = openAdManager;
        document.getElementById('cmtBackendBtn').onclick = openBackendConfig;
        document.getElementById('cmtFileName').onclick = editFileName;
        renderSiteVersionBar();
        // 浏览器标签设置：点击左上角标题文字打开弹窗
        var titleBtn = document.getElementById('cmtTitleBtn');
        if (titleBtn) titleBtn.onclick = openBrowserTabModal;
        updateFaviconPreview();
        document.getElementById('cmtBgBtn').onclick = function () { document.getElementById('cmtBgInput').click(); };
        document.getElementById('cmtBgInput').oninput = function () {
            document.getElementById('cmtBgPrev').style.background = this.value;
            commit.headerBg = 'linear-gradient(135deg, ' + this.value + ' 0%, ' + shadeColor(this.value, -20) + ' 100%)';
            applyHeaderBg();
        };
    }

    function applyHeaderBg() { if (commitHeader) commitHeader.style.background = commit.headerBg; }
    function updateFaviconPreview() {
        var prev = document.getElementById('cmtFaviconPreview');
        if (!prev) return;
        if (commit && commit.favicon) { prev.src = commit.favicon; prev.style.display = 'inline-block'; }
        else { prev.style.display = 'none'; prev.src = ''; }
    }

    // ===== 浏览器标签设置弹窗（点击左上角标题打开，图2 样式）=====
    function openBrowserTabModal() {
        var overlay = document.getElementById('btModalOverlay');
        if (overlay) overlay.parentNode.removeChild(overlay);
        overlay = document.createElement('div');
        overlay.id = 'btModalOverlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';
        overlay.innerHTML =
            '<div style="background:#fff;border-radius:12px;width:440px;max-width:92vw;box-shadow:0 10px 40px rgba(0,0,0,.25);overflow:hidden">'
            + '<div style="padding:16px 20px;font-size:16px;font-weight:600;color:#333;border-bottom:1px solid #eee;display:flex;align-items:center;justify-content:space-between">'
            +   '<div style="display:flex;align-items:center;gap:8px"><i class="fas fa-globe" style="color:#667eea"></i> 浏览器标签设置</div>'
            +   '<button id="btCloseX" style="background:none;border:none;font-size:22px;color:#999;cursor:pointer;line-height:1;padding:0 4px" title="关闭">&times;</button>'
            + '</div>'
            + '<div style="padding:20px;display:flex;gap:20px;align-items:flex-start">'
            +   '<div style="flex:0 0 auto;text-align:center">'
            +     '<div id="btImgPreview" title="点击编辑标签图片" style="width:96px;height:96px;border-radius:50%;border:2px dashed #ccc;overflow:hidden;display:flex;align-items:center;justify-content:center;cursor:pointer;background:#f7f7f9;margin:0 auto"></div>'
            +     '<div style="font-size:12px;color:#999;margin-top:8px">点击图片编辑</div>'
            +   '</div>'
            +   '<div style="flex:1;min-width:0">'
            +     '<label style="display:block;font-size:13px;color:#666;margin-bottom:6px">标签文字</label>'
            +     '<input id="btTextInput" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid #ddd;border-radius:6px;font-size:14px;outline:none" placeholder="浏览器标签显示的文字">'
            +     '<div style="font-size:12px;color:#999;margin-top:8px;line-height:1.5">设置后，浏览器标签页将显示此文字与图标。</div>'
            +   '</div>'
            + '</div>'
            + '<div style="padding:14px 20px;border-top:1px solid #eee;display:flex;justify-content:flex-end;gap:10px">'
            +   '<button id="btSave" style="padding:8px 18px;border:none;background:#667eea;color:#fff;border-radius:6px;cursor:pointer;font-size:14px">保存</button>'
            + '</div>'
            + '</div>';
        document.body.appendChild(overlay);

        var pendingFav = commit.favicon;
        var pendingMeta = commit.faviconMeta;
        var input = overlay.querySelector('#btTextInput');
        input.value = commit.tabTitle || '';

        function renderPreview() {
            var pv = overlay.querySelector('#btImgPreview');
            pv.innerHTML = '';
            if (pendingFav) {
                var img = document.createElement('img');
                img.src = pendingFav;
                img.style.cssText = 'width:100%;height:100%;object-fit:cover';
                pv.appendChild(img);
            } else {
                var ic = document.createElement('i');
                ic.className = 'fas fa-image';
                ic.style.cssText = 'font-size:30px;color:#bbb';
                pv.appendChild(ic);
            }
        }
        renderPreview();

        function showTagToast(msg, ok) {
            var old = document.getElementById('btModalToast');
            if (old && old.parentNode) old.parentNode.removeChild(old);
            var t = document.createElement('div');
            t.id = 'btModalToast';
            t.textContent = msg;
            t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%) translateY(-6px);z-index:100000;padding:10px 24px;border-radius:22px;font-size:14px;font-weight:600;color:#fff;box-shadow:0 6px 20px rgba(0,0,0,.2);pointer-events:none;opacity:0;transition:opacity .25s, transform .25s';
            t.style.background = ok ? '#22c55e' : '#ef4444';
            document.body.appendChild(t);
            requestAnimationFrame(function () {
                t.style.opacity = '1';
                t.style.transform = 'translateX(-50%) translateY(0)';
            });
            setTimeout(function () {
                t.style.opacity = '0';
                t.style.transform = 'translateX(-50%) translateY(-6px)';
                setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 300);
            }, ok ? 1200 : 2000);
        }
        function closeModal() {
            if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
            document.removeEventListener('keydown', onEsc);
        }
        function onEsc(e) { if (e.key === 'Escape') { showTagToast('取消修改', false); closeModal(); } }
        document.addEventListener('keydown', onEsc);

        // 点击遮罩不关闭弹窗，只有右上角 × 和 ESC 可关闭（关闭即放弃修改）
        overlay.querySelector('#btCloseX').onclick = function () { showTagToast('取消修改', false); closeModal(); };
        overlay.querySelector('#btImgPreview').onclick = function () {
            if (typeof openFaviconEditor !== 'function') { showToast('图标编辑器未加载，请刷新页面重试'); return; }
            openFaviconEditor({
                title: '浏览器标签图标',
                value: pendingFav,
                meta: pendingMeta,
                onApply: function (val, meta) { pendingFav = val; pendingMeta = meta; renderPreview(); }
            });
        };
        overlay.querySelector('#btSave').onclick = function () {
            commit.tabTitle = (input.value || '').trim();
            commit.favicon = pendingFav;
            commit.faviconMeta = pendingMeta;
            applyPageMeta();
            hasUnsaved = true;
            showTagToast('保存成功', true);
            closeModal();
        };
    }
    function applyPageMeta() {
        var fav = commit.favicon || ((root && root.site) ? root.site.favicon : '');
        if (fav) {
            var favHref = faviconHref(fav);
            var links = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]');
            if (links.length) { for (var i = 0; i < links.length; i++) links[i].setAttribute('href', favHref); }
            else { var lk = document.createElement('link'); lk.rel = 'icon'; lk.setAttribute('href', favHref); document.head.appendChild(lk); }
        }
        if (commit.tabTitle && commit.tabTitle.trim()) {
            document.title = commit.tabTitle;
        } else if (commit.title) {
            document.title = commit.title + ' - 网站提交';
        }
    }

    // ─── 头部编辑 ───
    function setupHeaderEditing() {
        var tEl = document.querySelector('[data-commit-field="title"]');
        if (tEl) {
            tEl.contentEditable = true;
            tEl.style.cursor = 'text';
            tEl.onblur = function () { commit.title = tEl.innerText.replace(/^\s*<[^>]*>\s*/i, '').trim() || commit.title; };
        }
        var sEl = document.querySelector('[data-commit-field="subtitle"]');
        if (sEl) {
            sEl.contentEditable = true;
            sEl.style.cursor = 'text';
            sEl.onblur = function () { commit.subtitle = sEl.innerText.trim(); };
        }
        var hIcon = document.querySelector('[data-header-icon]');
        if (hIcon) {
            hIcon.style.cursor = 'pointer';
            hIcon.title = '点击换图标';
            hIcon.onclick = function (e) { e.stopPropagation(); showIconPicker(hIcon.parentElement, function (ic) { commit.headerIcon = ic; hIcon.className = ic; }); };
        }
    }

    function setupButtonEditing() {
        var btn = document.getElementById('commitSubmitBtn');
        if (btn) {
            btn.contentEditable = true;
            btn.style.cursor = 'text';
            btn.onblur = function () { commit.buttonText = btn.innerText.replace(/^\s*<[^>]*>\s*/i, '').trim() || commit.buttonText; };
            var bi = btn.querySelector('i');
            if (bi) {
                bi.style.cursor = 'pointer';
                bi.title = '点击换图标';
                bi.onclick = function (e) { e.stopPropagation(); showIconPicker(btn, function (ic) { commit.buttonIcon = ic; bi.className = ic; }); };
            }
        }
        var bh = document.querySelector('[data-commit-field="backHomeText"]');
        if (bh) { bh.contentEditable = true; bh.style.cursor = 'text'; bh.onblur = function () { commit.backHomeText = bh.innerText.trim() || commit.backHomeText; }; }
    }

    // ─── 导出 ───
    function generateExportHtml() {
        return '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n'
            + '    <meta charset="UTF-8" />\n<meta http-equiv="X-UA-Compatible" content="IE=edge, chrome=1" />\n'
            + '    <meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no" />\n'
            + '    <title>' + escapeHtml(commit.title) + ' - 在线工具网</title>\n'
            + (function () { var f = faviconHref(commit.favicon || (root && root.site && root.site.favicon)); return f ? '    <link rel="icon" href="' + escAttr(f) + '">\n' : ''; })()
            + '    <meta name="keywords" content="网址提交,网站收录,在线工具网" />\n'
            + '    <meta name="description" content="提交您的优质网站" />\n'
            + '    <link rel="stylesheet" href="./assets/css/block-library.min-5.6.2.css" type="text/css" media="all" />\n'
            + '    <link rel="stylesheet" href="./assets/css/iconfont-3.03029.1.css" type="text/css" media="all" />\n'
            + '    <link rel="stylesheet" href="./assets/css/bootstrap.min-4.3.1.css" type="text/css" media="all" />\n'
            + '    <link rel="stylesheet" href="./assets/css/style-3.03029.1.css" type="text/css" media="all" />\n'
            + '    <link rel="stylesheet" href="./assets/css/custom-style.css" type="text/css" media="all" />\n'
            + '    <link rel="stylesheet" href="./assets/fontawesome-5.15.4/css/all.min.css" type="text/css" />\n'
            + '    <style>\n'
            + '        .submit-container{max-width:800px;margin:50px auto;padding:30px;background:#fff;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.1)}\n'
            + '        .submit-header{text-align:center;margin-bottom:30px;padding:30px 25px;border-radius:8px;color:white;background:' + commit.headerBg + '}\n'
            + '        .submit-header h1{font-size:28px;margin:0 0 10px 0;font-weight:600}\n'
            + '        .submit-header p{font-size:15px;margin:0;opacity:.9}\n'
            + '        .form-group{margin-bottom:20px}\n.form-group label{display:block;margin-bottom:8px;color:#333;font-weight:500}\n'
            + '        .form-control{width:100%;padding:10px 15px;border:1px solid #ddd;border-radius:4px;font-size:14px;box-sizing:border-box}\n'
            + '        .form-control:focus{outline:none;border-color:#4CAF50}\n'
            + '        textarea.form-control{resize:vertical;min-height:100px}\n'
            + '        .submit-btn{width:100%;padding:12px;background:#4CAF50;color:white;border:none;border-radius:4px;font-size:16px;cursor:pointer}\n'
            + '        .submit-btn:hover{background:#45a049}\n'
            + '        .back-home{text-align:center;margin-top:20px}\n.back-home a{color:#4CAF50;text-decoration:none}\n'
            + '        body{background:#f5f7fa;padding:20px 0}\n'
            + '        @media(max-width:768px){.submit-container{margin:20px;padding:20px}}\n'
            + '    </style>\n</head>\n<body>\n'
            + '    <div class="submit-container">\n'
            + '        <div class="submit-header"><h1><i class="' + escapeHtml(commit.headerIcon) + '"></i> ' + escapeHtml(commit.title) + '</h1><p>' + escapeHtml(commit.subtitle) + '</p></div>\n'
            + commit.sections.map(exportSectionHtml).join('\n')
            + (commit.topAds || []).concat(commit.leftAds || []).concat(commit.rightAds || []).map(function (a) {
                if (!a.enabled) return '';
                if (a.type === 'html') return '        <div style="margin-bottom:16px;overflow:hidden">' + (a.code || '') + '</div>';
                if (!a.image) return '';
                var img = '<img src="' + escAttr(a.image) + '" alt="' + escAttr(a.alt || '') + '" style="max-width:100%;display:block">';
                if (a.link) img = '<a href="' + escAttr(a.link) + '" target="_blank" rel="nofollow">' + img + '</a>';
                return '        <div style="margin-bottom:16px;text-align:center">' + img + '</div>';
            }).join('\n')
            + '        <button class="submit-btn"><i class="' + escapeHtml(commit.buttonIcon) + '"></i> ' + escapeHtml(commit.buttonText) + '</button>\n'
            + '        <div class="back-home"><a href="javascript:void(0)" onclick="window.scrollTo(0,0);return false"><i class="fas fa-home"></i> ' + escapeHtml(commit.backHomeText) + '</a></div>\n'
            + '    </div>\n'
            + '    <script src="./assets/js/jquery.min-3.2.1.js"><\/script>\n'
            + submitJs()
            + '</body>\n</html>';
    }

    function submitJs() {
        var b = commit.backend || {};
        var okMsg = b.redirectUrl
            ? 'window.location.href="' + escAttr(b.redirectUrl) + '"'
            : 'alert("提交成功！");$("#submitBtn").prop("disabled",!1).html("<i class=\'' + escapeHtml(commit.buttonIcon) + '\'></i> ' + escapeHtml(commit.buttonText) + '")';
        if (b.type === 'cloudflare' && b.url) {
            var method = (b.method || 'POST').toUpperCase();
            return '    <script>$(function(){$("#submitForm").on("submit",function(e){e.preventDefault();var d={siteName:$("#siteName").val(),siteUrl:$("#siteUrl").val(),category:$("#category").val(),description:$("#description").val(),keywords:$("#keywords").val(),email:$("#email").val(),contact:$("#contact").val()};if(!d.siteName||!d.siteUrl||!d.category||!d.description||!d.email)return alert("请正确填写所有必填项");$("#submitBtn").prop("disabled",!0).html("<i class=\'fas fa-spinner fa-spin\'></i> 提交中...");fetch("' + escAttr(b.url) + '",{method:"' + method + '",headers:{"Content-Type":"application/json"},body:JSON.stringify(d)}).then(function(r){if(!r.ok)throw Error(r.status);' + okMsg + '}).catch(function(){alert("提交失败，请稍后重试");$("#submitBtn").prop("disabled",!1)})})});<\/script>\n';
        }
        if (b.type === 'emailjs' && b.publicKey && b.serviceId && b.templateId) {
            return '    <script src="https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js"><\/script>\n    <script>emailjs.init("' + escAttr(b.publicKey) + '");$(function(){$("#submitForm").on("submit",function(e){e.preventDefault();var d={site_name:$("#siteName").val(),site_url:$("#siteUrl").val(),category:$("#category").val(),description:$("#description").val(),keywords:$("#keywords").val(),email:$("#email").val(),contact:$("#contact").val()};if(!d.site_name||!d.site_url||!d.category||!d.description||!d.email)return alert("请正确填写所有必填项");$("#submitBtn").prop("disabled",!0).html("<i class=\'fas fa-spinner fa-spin\'></i> 提交中...");emailjs.send("' + escAttr(b.serviceId) + '","' + escAttr(b.templateId) + '",d).then(function(){' + okMsg + '}).catch(function(){alert("提交失败，请稍后重试");$("#submitBtn").prop("disabled",!1)})})});<\/script>\n';
        }
        if (b.type === 'formspree' && b.url) {
            return '    <script>$(function(){$("#submitForm").on("submit",function(e){$("#submitBtn").prop("disabled",!0).html("<i class=\'fas fa-spinner fa-spin\'></i> 提交中...");setTimeout(function(){$("#submitBtn").prop("disabled",!1).html("<i class=\'' + escapeHtml(commit.buttonIcon) + '\'></i> ' + escapeHtml(commit.buttonText) + '")},5000)})});<\/script>\n';
        }
        return '    <script>$(function(){$("#submitForm").on("submit",function(e){e.preventDefault();$("#submitBtn").prop("disabled",!0).html("<i class=\'fas fa-spinner fa-spin\'></i> 提交中...");setTimeout(function(){alert("提交成功！");$("#submitBtn").prop("disabled",!1).html("<i class=\'' + escapeHtml(commit.buttonIcon) + '\'></i> ' + escapeHtml(commit.buttonText) + '")},1500)})});<\/script>\n';
    }

    function exportSectionHtml(sec) {
        if (sec.type === 'success') return '        <div style="background:#d4edda;color:#155724;padding:12px;border-radius:4px;margin-bottom:16px"><i class="' + escapeHtml(sec.content.icon) + '"></i> ' + escapeHtml(sec.content.message || '') + '</div>';
        if (sec.type === 'guidelines') return '        <div style="background:#f8f9fa;padding:16px;border-radius:4px;margin-bottom:16px"><h3 style="font-size:16px;color:#333;margin-bottom:8px"><i class="' + escapeHtml(sec.icon) + '"></i> ' + escapeHtml(sec.title) + '</h3><ul style="margin:0;padding-left:18px">' + (sec.content.items || []).map(function (it) { return '<li style="color:#666;font-size:14px;margin-bottom:4px">' + escapeHtml(it) + '</li>'; }).join('') + '</ul></div>';
        if (sec.type === 'text') return '        <div style="font-size:14px;color:#555;line-height:1.8;margin-bottom:16px">' + (sec.content.richHtml || '') + '</div>';
        if (sec.type === 'categories') return '        <div style="margin-bottom:16px"><div class="form-group"><label>网站分类 <span style="color:#ff4444">*</span></label><select class="form-control"><option value="">请选择分类</option>' + (sec.content.items || []).map(function (c) { return '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>'; }).join('') + '</select></div></div>';
        if (sec.type === 'form') {
            var b = commit.backend || {};
            var formTag = (b.type === 'formspree' && b.url)
                ? '        <form id="submitForm" action="' + escAttr(b.url) + '" method="POST">\n'
                : '        <form id="submitForm" onsubmit="return false">\n';
            return formTag + ['siteName','siteUrl','description','keywords','email','contact'].map(function (k) {
            var l = (sec.content.labels || {})[k] || '';
            var p = (sec.content.placeholders || {})[k] || '';
            var r = (k === 'keywords' || k === 'contact') ? '' : ' <span style="color:#ff4444">*</span>';
            if (k === 'description') return '            <div class="form-group"><label>' + escapeHtml(l) + r + '</label><textarea class="form-control" placeholder="' + escapeHtml(p) + '" required></textarea></div>';
            return '            <div class="form-group"><label>' + escapeHtml(l) + r + '</label><input class="form-control" placeholder="' + escapeHtml(p) + '" required></div>';
        }).join('\n') + '\n        </form>';
        }
        return '';
    }

    // ─── 保存 ───
    function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    function save() {
        // 先存到 localStorage
        saveLocal();
        try {
            if (window.opener && !window.opener.closed) window.opener.postMessage({ type: 'nav-commit-saved', data: { about: commit } }, '*');
        } catch (_) { }

        // 弹窗确认保存路径
        var suggestPath = defaultPath || 'footer/commit.html';
        var pathInfo = parsePathInfo(suggestPath);
        var defaultFileName = suggestPath.split('/').pop() || 'commit.html';
        var defaultBaseName = defaultFileName.replace(/\.html?$/i, '');
        var folderName = pathInfo
            ? (suggestPath.replace(/\\/g, '/').replace(/^web\/[^/]+\/[^/]+\/deploy1\/?/, '').replace(/\/[^/]*$/, '') || '根目录')
            : (suggestPath.indexOf('/') >= 0 ? suggestPath.substring(0, suggestPath.lastIndexOf('/')) : '根目录');
        var canShowSmart = pathInfo && siteVersionInfo && siteVersionInfo.siteId === pathInfo.siteId && siteVersionInfo.versionId === pathInfo.versionId;

        var ov = document.createElement('div');
        ov.className = 'cmt-modal-overlay';
        if (canShowSmart) {
            ov.innerHTML = '<div style="background:#fff;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.2);width:560px;max-width:90%">'
                + '<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid #eee;font-size:15px;font-weight:600;color:#333">保存到文件<span style="cursor:pointer;font-size:24px;color:#999" id="cmtSaveX">&times;</span></div>'
                + '<div style="padding:18px">'
                + '<p style="margin:0;font-size:14px;color:#333;line-height:1.8">'
                + '是否将此版本保存到站点 <strong style="color:#667eea;font-size:15px">' + escapeHtml(siteVersionInfo.siteName || pathInfo.siteId) + '</strong> '
                + '下的 <strong style="color:#667eea">' + escapeHtml(siteVersionInfo.versionName || pathInfo.versionId) + '</strong> 版本下的 '
                + '<strong style="color:#333">' + escapeHtml(folderName) + '</strong> 文件夹，命名为 '
                + '<input id="cmtSaveFileName" value="' + escapeHtml(defaultBaseName) + '" style="width:150px;padding:6px 8px;border:1px solid #ddd;border-radius:4px;font-size:14px;vertical-align:middle;text-align:center">'
                + '<span style="font-size:14px;color:#666">.html</span>'
                + '</p>'
                + '</div>'
                + '<div style="padding:12px 18px;display:flex;justify-content:flex-end;gap:8px;border-top:1px solid #eee">'
                + '<button id="cmtSaveConfirm" style="padding:8px 20px;background:#27ae60;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px">保存</button>'
                + '</div></div>';
        } else {
            ov.innerHTML = '<div style="background:#fff;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.2);width:520px;max-width:90%">'
                + '<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid #eee;font-size:15px;font-weight:600;color:#333">保存到文件<span style="cursor:pointer;font-size:24px;color:#999" id="cmtSaveX">&times;</span></div>'
                + '<div style="padding:16px 18px">'
                + '<p style="margin:0 0 10px 0;font-size:13px;color:#666">请输入保存路径（相对于站点根目录）：</p>'
                + '<div style="display:flex;gap:8px;align-items:center">'
                + '<input id="cmtSavePath" value="' + esc(suggestPath) + '" style="flex:1;padding:8px 10px;border:1px solid #ddd;border-radius:6px;font-size:14px;box-sizing:border-box">'
                + '</div>'
                + '<p style="margin:8px 0 0 0;font-size:12px;color:#999">例如：footer/commit.html</p>'
                + '</div>'
                + '<div style="padding:12px 18px;display:flex;justify-content:flex-end;gap:8px;border-top:1px solid #eee">'
                + '<button id="cmtSaveConfirm" style="padding:8px 20px;background:#27ae60;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px">保存</button>'
                + '</div></div>';
        }
        document.body.appendChild(ov);

        function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); document.removeEventListener('keydown', onEsc); }
        function onEsc(e) { if (e.key === 'Escape') { close(); } }
        document.addEventListener('keydown', onEsc);
        document.getElementById('cmtSaveX').onclick = close;
        document.getElementById('cmtSaveConfirm').onclick = function () {
            if (canShowSmart) {
                var fileName = document.getElementById('cmtSaveFileName').value.trim();
                if (!fileName) { svToast('文件名不能为空'); return; }
                if (/[\\/]/.test(fileName)) { svToast('文件名不能包含路径分隔符'); return; }
                if (!/\.html?$/i.test(fileName)) fileName += '.html';
                var dir = suggestPath.substring(0, suggestPath.lastIndexOf('/') + 1);
                var path = dir + fileName;
                close();
                doSaveToPath(path);
            } else {
                var path = document.getElementById('cmtSavePath').value.trim();
                if (!path) { svToast('路径不能为空'); return; }
                close();
                doSaveToPath(path);
            }
        };
    }

    function doSaveToPath(path) {
        var html = generateExportHtml();
        if (!html) { toast('生成 HTML 失败'); return; }
        var cleanPath = path.trim().replace(/\\/g, '/');
        if (!/\.html?$/i.test(cleanPath)) cleanPath += '.html';
        if (cleanPath.indexOf('/') < 0) cleanPath = 'footer/' + cleanPath;
        defaultPath = cleanPath;
        displayFileName = cleanPath.split('/').pop();
        baseName = displayFileName.replace(/\.html?$/i, '');
        SKEY = 'nav_editor_work_commit_' + baseName.replace(/[^a-zA-Z0-9]+/g, '_');
        document.getElementById('cmtFileName').textContent = displayFileName;
        toast('正在保存…');
        fetch('/api/save-about', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ about: commit, html: html, path: cleanPath, label: navLabel, isCommit: true })
        }).then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
            .then(function (res) {
                if (res && res.ok) {
                    saveLocal();
                    toast('已保存到 ' + cleanPath, true);
                    if (window.opener) {
                        try { window.opener.postMessage({ type: 'nav-commit-saved', data: { about: commit }, path: cleanPath, from: fromKey }, '*'); } catch (_) { }
                    }
                } else { throw new Error('后端返回失败'); }
            })
            .catch(function (e) { toast('保存失败：' + e.message); });
    }

    // ─── 导出下载 ───
    function downloadHtml() {
        var html = generateExportHtml();
        var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = displayFileName || 'commit.html';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        toast('已导出 ' + a.download, true);
    }

    function openHtmlFile() {
        var inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = '.html,.htm';
        inp.onchange = function () {
            var file = inp.files && inp.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function () {
                var html = reader.result;
                var m = html.match(/<script\s+id="commitSeed"[^>]*>([\s\S]*?)<\/script>/i);
                if (!m) { toast('此文件不是本模板创建的页面，无法导入'); return; }
                try {
                    var seed = JSON.parse(m[1]);
                    if (!seed.commit || !seed.commit.sections) { toast('文件数据格式不正确，无法导入'); return; }
                    commit = seed.commit;
                    renderSections();
                    renderAllAds();
                    setupHeaderEditing();
                    setupButtonEditing();
                    applyHeaderBg();
                    saveLocal();
                    // 更新文件名
                    displayFileName = file.name;
                    var fnEl = document.getElementById('cmtFileName');
                    if (fnEl) fnEl.textContent = displayFileName;
                    toast('已打开 ' + file.name, true);
                } catch (e) { toast('文件格式错误，无法解析'); }
            };
            reader.readAsText(file);
        };
        inp.click();
    }

    // ─── 后端服务配置 ───
    function openBackendConfig() {
        commit.backend = commit.backend || { type: '', url: '', redirectUrl: '', subject: '', publicKey: '', serviceId: '', templateId: '' };
        var b = commit.backend;
        var ov = document.createElement('div');
        ov.className = 'ab-modal-ov';
        var types = [
            { value: '', label: '不启用（模拟提交）', emoji: '🚫', iconHtml: '🚫' },
            { value: 'formspree', label: 'Formspree / FormSubmit', emoji: '📨', iconHtml: '📨' },
            { value: 'cloudflare', label: 'Cloudflare Worker', emoji: '☁️', iconHtml: '<i class="fas fa-cloud" style="color:#f38020"></i>' },
            { value: 'emailjs', label: 'EmailJS', emoji: '✉️', iconHtml: '✉️' }
        ];
        var typeOpts = types.map(function (t) {
            return '<option value="' + t.value + '" data-icon="' + escAttr(t.iconHtml) + '"' + (b.type === t.value ? ' selected' : '') + '>' + t.label + '</option>';
        }).join('');
        var curType = types.find(function (t) { return t.value === b.type; }) || types[0];
        var iconsHtml = types.slice(1).map(function (t) {
            return '<span style="font-size:20px;display:inline-block;width:28px;text-align:center" title="' + t.label + '">' + t.iconHtml + '</span>';
        }).join('');
        var reqStar = '<span style="color:#e74c3c">*</span>';
        ov.innerHTML = '<div class="ab-modal" style="width:560px">'
            + '<div class="ab-modal-h">后端服务配置<span style="margin-left:12px;font-size:12px;color:#999;font-weight:400">支持：' + iconsHtml + '</span><a class="ab-modal-x" data-close>&times;</a></div>'
            + '<div class="ab-modal-b">'
            + '<div style="margin-bottom:12px"><label style="display:block;font-size:13px;color:#666;margin-bottom:4px">服务类型</label><div style="display:flex;align-items:center;gap:8px"><span id="cmtBeEmoji" style="font-size:24px;width:32px;text-align:center">' + curType.iconHtml + '</span><select id="cmtBeType" class="ab-in" style="flex:1">' + typeOpts + '</select></div></div>'
            // 通用：接收地址
            + '<div id="cmtBeUrlRow" style="display:' + ((b.type === 'formspree' || b.type === 'cloudflare') ? '' : 'none') + ';margin-bottom:12px"><label style="display:block;font-size:13px;color:#666;margin-bottom:4px">接收地址 URL ' + reqStar + '</label><input id="cmtBeUrl" class="ab-in" value="' + escAttr(b.url || '') + '" placeholder="https://..."></div>'
            // 通用：成功后跳转
            + '<div id="cmtBeRedirect" style="display:' + ((b.type === 'formspree' || b.type === 'cloudflare') ? '' : 'none') + ';margin-bottom:12px"><label style="display:block;font-size:13px;color:#666;margin-bottom:4px">提交成功跳转页</label><input id="cmtBeRedirUrl" class="ab-in" value="' + escAttr(b.redirectUrl || '') + '" placeholder="留空则不跳转，如：/thanks.html"></div>'
            // Formspree 专用
            + '<div id="cmtBeSubject" style="display:' + (b.type === 'formspree' ? '' : 'none') + ';margin-bottom:12px"><label style="display:block;font-size:13px;color:#666;margin-bottom:4px">邮件主题</label><input id="cmtBeSubj" class="ab-in" value="' + escAttr(b.subject || '') + '" placeholder="新网站提交 - Formspree"></div>'
            // Cloudflare 专用
            + '<div id="cmtBeMethod" style="display:' + (b.type === 'cloudflare' ? '' : 'none') + ';margin-bottom:12px"><label style="display:block;font-size:13px;color:#666;margin-bottom:4px">请求方式</label><select id="cmtBeHttpMethod" class="ab-in"><option value="POST"' + (b.method !== 'PUT' ? ' selected' : '') + '>POST（表单数据）</option><option value="PUT"' + (b.method === 'PUT' ? ' selected' : '') + '>PUT（JSON 数据）</option></select></div>'
            // EmailJS
            + '<div id="cmtBeEmailJS" style="display:' + (b.type === 'emailjs' ? '' : 'none') + '">'
            + '<div style="margin-bottom:10px"><label style="display:block;font-size:13px;color:#666;margin-bottom:4px">Public Key（User ID） ' + reqStar + '</label><input id="cmtBePK" class="ab-in" value="' + escAttr(b.publicKey || '') + '" placeholder="user_xxx"></div>'
            + '<div style="margin-bottom:10px"><label style="display:block;font-size:13px;color:#666;margin-bottom:4px">Service ID ' + reqStar + '</label><input id="cmtBeSID" class="ab-in" value="' + escAttr(b.serviceId || '') + '" placeholder="service_xxx"></div>'
            + '<div style="margin-bottom:10px"><label style="display:block;font-size:13px;color:#666;margin-bottom:4px">Template ID ' + reqStar + '</label><input id="cmtBeTID" class="ab-in" value="' + escAttr(b.templateId || '') + '" placeholder="template_xxx"></div>'
            + '<div style="margin-bottom:10px;padding:8px 10px;background:#fef9e7;border-radius:6px;font-size:12px;color:#7d6608;line-height:1.6">'
            + '⚡ <b>字段映射</b>：表单字段会自动映射到 EmailJS 模板变量 — 网站名称→<code>site_name</code>、网站地址→<code>site_url</code>、分类→<code>category</code>、描述→<code>description</code>、关键词→<code>keywords</code>、邮箱→<code>email</code>、联系方式→<code>contact</code></div>'
            + '</div>'
            + '<p id="cmtBeHint" style="font-size:12px;color:#666;margin-top:10px;line-height:1.8;background:#f8f9fa;padding:10px 12px;border-radius:6px;border-left:3px solid #667eea"></p>'
            + '</div>'
            + '<div class="ab-modal-f"><button id="cmtBeSave" class="primary">保存</button></div></div>';
        document.body.appendChild(ov);
        ov.querySelector('[data-close]').onclick = function () { document.body.removeChild(ov); };
        document.getElementById('cmtBeSave').onclick = function () {
            b.type = document.getElementById('cmtBeType').value;
            b.url = document.getElementById('cmtBeUrl').value.trim();
            b.redirectUrl = document.getElementById('cmtBeRedirUrl').value.trim();
            b.subject = document.getElementById('cmtBeSubj').value.trim();
            b.method = (document.getElementById('cmtBeHttpMethod') || {}).value || 'POST';
            b.publicKey = document.getElementById('cmtBePK').value.trim();
            b.serviceId = document.getElementById('cmtBeSID').value.trim();
            b.templateId = document.getElementById('cmtBeTID').value.trim();
            document.body.removeChild(ov);
            updateBackendBtnLabel();
            toast('后端服务配置已保存', true);
        };
        function updateRows() {
            var t = document.getElementById('cmtBeType').value;
            var sel = document.getElementById('cmtBeType');
            var opt = sel.options[sel.selectedIndex];
            var icon = opt.getAttribute('data-icon') || '';
            document.getElementById('cmtBeEmoji').innerHTML = icon;
            document.getElementById('cmtBeUrlRow').style.display = (t === 'formspree' || t === 'cloudflare') ? '' : 'none';
            document.getElementById('cmtBeRedirect').style.display = (t === 'formspree' || t === 'cloudflare') ? '' : 'none';
            document.getElementById('cmtBeSubject').style.display = t === 'formspree' ? '' : 'none';
            document.getElementById('cmtBeMethod').style.display = t === 'cloudflare' ? '' : 'none';
            document.getElementById('cmtBeEmailJS').style.display = t === 'emailjs' ? '' : 'none';
            var hints = {
                '': '<b>当前模式：模拟提交</b><br>提交按钮将显示加载动画并弹窗提示"提交成功"，<b>数据不会发送到任何地方</b>。适合演示或尚未配置后端的阶段使用。',
                formspree: '<b>📨 Formspree / FormSubmit 配置指南</b><br>'
                    + '1. 打开 <a href="https://formspree.io" target="_blank" style="color:#2980b9">formspree.io</a> 或 <a href="https://formsubmit.co" target="_blank" style="color:#2980b9">formsubmit.co</a> 注册账号<br>'
                    + '2. 创建新的表单项目，获得一个接收 URL（如 <code>https://formspree.io/f/xxxxx</code>）<br>'
                    + '3. 将 URL 填入上方的「接收地址」输入框<br>'
                    + '4. （可选）设置提交成功后的跳转页面和通知邮件主题<br>'
                    + '5. 导出页面后，访客提交的表单数据将自动转发到你的注册邮箱<br>'
                    + '<span style="color:#e74c3c">⚠ 免费版每月限 50 条提交</span>',
                cloudflare: '<b>☁️ Cloudflare Worker 配置指南</b><br>'
                    + '1. 登录 <a href="https://workers.cloudflare.com" target="_blank" style="color:#2980b9">Cloudflare Workers</a>，创建一个新的 Worker<br>'
                    + '2. 在 Worker 中编写处理 POST 请求的代码（接收 JSON 数据，可存入 KV 或转发邮件）<br>'
                    + '3. 部署后获得 Worker URL（如 <code>https://submit.yourdomain.workers.dev</code>）<br>'
                    + '4. 将 URL 填入上方的「接收地址」输入框<br>'
                    + '5. 导出页面后，表单数据将以 JSON 格式 POST 到 Worker<br>'
                    + '<span style="color:#27ae60">✓ Cloudflare 免费版每天 10 万次请求，非常充裕</span>',
                emailjs: '<b>✉️ EmailJS 配置指南</b><br>'
                    + '1. 打开 <a href="https://emailjs.com" target="_blank" style="color:#2980b9">emailjs.com</a> 注册账号<br>'
                    + '2. 添加 Email Service（选择你的邮箱服务商，如 Gmail、QQ邮箱等）<br>'
                    + '3. 创建 Email Template，在模板中使用 <code>{{site_name}}</code>、<code>{{site_url}}</code> 等变量<br>'
                    + '4. 将 Public Key、Service ID、Template ID 填入上方<br>'
                    + '5. 导出页面后，表单提交时将调用 EmailJS SDK 发送邮件到你的邮箱<br>'
                    + '<span style="color:#e74c3c">⚠ 免费版每月限 200 封邮件</span>'
            };
            document.getElementById('cmtBeHint').innerHTML = hints[t] || '';
        }
        document.getElementById('cmtBeType').onchange = updateRows;
        updateRows();
        function onEsc(e) { if (e.key === 'Escape') { document.body.removeChild(ov); document.removeEventListener('keydown', onEsc); } }
        document.addEventListener('keydown', onEsc);
    }
    function updateBackendBtnLabel() {
        var btn = document.getElementById('cmtBackendBtn');
        if (!btn) return;
        var b = commit.backend || {};
        if (b.type === 'formspree') btn.innerHTML = '<i class="fas fa-server"></i> 后端服务 <span style="color:#2ecc71;font-size:10px">●</span>';
        else if (b.type === 'cloudflare') btn.innerHTML = '<i class="fas fa-server"></i> 后端服务 <span style="color:#f38020;font-size:10px">●</span>';
        else if (b.type === 'emailjs') btn.innerHTML = '<i class="fas fa-server"></i> 后端服务 <span style="color:#e74c3c;font-size:10px">●</span>';
        else btn.innerHTML = '<i class="fas fa-server"></i> 后端服务';
    }

    // ─── 设为模板 ───
    function setAsTemplate() {
        var ov = document.createElement('div');
        ov.className = 'cmt-modal-overlay';
        ov.innerHTML = '<div style="background:#fff;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.2);max-width:420px;width:90%">'
            + '<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid #eee;font-size:15px;font-weight:600;color:#333">设为模板<span style="cursor:pointer;font-size:20px;color:#999" id="cmtTplX">&times;</span></div>'
            + '<div style="padding:16px 18px;font-size:14px;color:#555;line-height:1.7">确定要把当前内容设为"网站提交"模板的默认内容吗？</div>'
            + '<div style="padding:12px 18px;display:flex;justify-content:flex-end;gap:8px"><button id="cmtTplNo" style="padding:7px 16px;border:1px solid #ddd;background:#fff;border-radius:6px;cursor:pointer;font-size:13px;color:#666">取消</button><button id="cmtTplYes" style="padding:7px 16px;background:#667eea;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px">确定</button></div>'
            + '</div>';
        document.body.appendChild(ov);
        function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
        document.getElementById('cmtTplX').onclick = close;
        document.getElementById('cmtTplNo').onclick = close;
        document.getElementById('cmtTplYes').onclick = function () { close(); doSetTemplate(); };
    }

    function doSetTemplate() {
        var tplPath = 'template/页脚/网站提交/index.html';
        var seedJson = JSON.stringify({ commit: commit }).replace(/<\//g, '<\\/');
        var seedTag = '<script id="commitSeed" type="application/json">' + seedJson + '</' + 'script>';
        toast('正在设为模板…');
        fetch('/' + tplPath.replace(/\\/g, '/') + '?t=' + Date.now())
            .then(function (r) { if (!r.ok) throw new Error('读取模板失败'); return r.text(); })
            .then(function (text) {
                // 全局移除所有旧 commitSeed，防止重复
                var nt = text.replace(/<script id="commitSeed" type="application\/json">[\s\S]*?<\/script>/gi, '');
                // 优先插入到 edit.js 之前
                var editMarker = /<script\s+src="\.\/edit\.js[^"]*"><\/script>/i;
                if (editMarker.test(nt)) {
                    nt = nt.replace(editMarker, seedTag + '\n    <script src="./edit.js?v=' + Date.now() + '"></script>');
                } else {
                    nt = nt.replace(/<\/body>/i, seedTag + '\n</body>');
                }
                return fetch('/api/save-template', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files: [{ path: tplPath, content: nt }] }) });
            })
            .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
            .then(function (res) {
                if (res && res.ok) {
                    // 同步写入 localStorage（与 save 同一 SKEY），避免刷新后读 localStorage 覆盖 commitSeed 更新
                    try { localStorage.setItem(SKEY, JSON.stringify({ commit: commit })); } catch (_) {}
                    toast('已设为模板', true);
                } else {
                    throw new Error((res && res.error) || '后端返回失败');
                }
            })
            .catch(function (e) { toast('设为模板失败：' + e.message); });
    }

    // ─── 文件名编辑 ───
    function editFileName() {
        var el = document.getElementById('cmtFileName');
        var cur = displayFileName;
        var base = cur.replace(/\.html?$/i, '');
        var ext = cur.slice(base.length);
        var input = document.createElement('input');
        input.type = 'text';
        input.value = base;
        input.style.cssText = 'width:100px;font-size:12px;padding:2px 6px;border:1px solid #667eea;border-radius:3px;background:#2a2a3a;color:#eee';
        el.innerHTML = '';
        el.appendChild(input);
        el.appendChild(document.createTextNode(ext));
        input.focus(); input.select();
        var done = function () {
            var newBase = input.value.replace(/[<>:"/\\|?*]/g, '').trim() || base;
            var dir = (defaultPath || 'footer/commit.html').split('/').slice(0, -1).join('/');
            defaultPath = dir + '/' + newBase + ext;
            displayFileName = defaultPath.split('/').pop();
            el.innerHTML = '';
            el.textContent = displayFileName;
            saveLocal();
        };
        input.onblur = done;
        input.onkeydown = function (e) { if (e.key === 'Enter') done(); };
    }

    // ─── 主初始化 ───
    function init() {
        loadSeed();
        if (commit.favicon === undefined || commit.favicon === null) commit.favicon = '';
        injectStyles();
        buildToolbar();
        updateBackendBtnLabel();
        // 真实编辑才标记未保存（板块标题、表单、广告等输入），
        // 这样切换版本时会先提示未保存，且确认后不会再被浏览器二次弹窗打断。
        document.addEventListener('input', function () { hasUnsaved = true; }, true);
        commitHeader = document.getElementById('commitHeader');
        commitContainer = document.getElementById('commitContainer');
        sectionsEl = document.getElementById('commitSections');
        submitBtnEl = document.getElementById('commitSubmitBtn');

        // 监听父窗口返回的 favicon 设置（window.postMessage，兼容旧方式）
        if (isEdit) {
            ensureAdContainers();
            loadRemoteData(function () {
                renderSections();
                renderAllAds();
                setupHeaderEditing();
                setupButtonEditing();
                applyHeaderBg();
                applyPageMeta();
            });
        } else {
            renderSections();
            renderAllAds();
            applyHeaderBg();
            applyPageMeta();
        }

        // 初始化颜色输入框
        var m = commit.headerBg.match(/#([0-9a-fA-F]{3,6})/);
        if (m && document.getElementById('cmtBgInput')) document.getElementById('cmtBgInput').value = '#' + m[1];
        if (document.getElementById('cmtBgPrev')) document.getElementById('cmtBgPrev').style.background = '#' + (m ? m[1] : '4CAF50');
    }

    init();
})();
