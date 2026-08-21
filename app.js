/**
 * 导航站编辑器 - 主应用 [v2026-07-07-v71 稳定性修复 + UI 美化]
 * 包含：HTML解析器、HTML生成器、编辑器逻辑、版本管理、Cloudflare Pages / GitHub Pages 同步
 */

// ==================== 自修复：检测到磁盘上 editor.html 引用了更新的 app.js/template.js 版本则自动硬刷新 ====================
// 作用：避免浏览器复用旧 tab / 旧 app.js/template.js（访客视角会调用已加载的旧 wrapTemplate，导致底部壁纸等高失效）。
// 每次打开编辑器都会用 no-store 拉一次 editor.html，提取其中的 app.js?v= / template.js?v= 版本，与当前运行版本比对，不一致即刷新。
(function () {
  // 运行时从当前加载的脚本标签提取 ?v 版本作为"当前运行版本"，
  // 不再硬编码常量，避免升 editor.html 的 ?v= 时漏改本值导致无限刷新循环。
  function getVer(name) {
    var curSrc = '';
    try {
      var sel = 'script[src*="' + name + '.js"]',
          s = document.querySelector(sel);
      if (s) curSrc = s.src;
    } catch (e) {}
    var cm = curSrc.match(/[?&]v=(\d+)/);
    return cm ? cm[1] : null;
  }
  var currentAppVer = getVer('app');
  var currentTplVer = getVer('template');
  window.__NAV_APP_VER = currentAppVer;
  window.__NAV_TPL_VER = currentTplVer;
  try {
    var fire = function () {
      setTimeout(function () {
        fetch('editor.html', { cache: 'no-store' })
          .then(function (r) { return r.text(); })
          .then(function (html) {
            var appM = html.match(/app\.js\?v=(\d+)/),
                tplM = html.match(/template\.js\?v=(\d+)/);
            var newAppVer = appM ? appM[1] : null,
                newTplVer = tplM ? tplM[1] : null;
            var needReload = false;
            if (currentAppVer !== null && newAppVer !== null && String(newAppVer) !== String(currentAppVer)) {
              console.warn('[NavEditor] 检测到新版本 app.js v' + newAppVer + '，自动刷新以加载最新代码');
              needReload = true;
            }
            if (currentTplVer !== null && newTplVer !== null && String(newTplVer) !== String(currentTplVer)) {
              console.warn('[NavEditor] 检测到新版本 template.js v' + newTplVer + '，自动刷新以加载最新代码');
              needReload = true;
            }
            if (needReload) window.location.reload();
          })
          .catch(function () {});
      }, 800);
    };
    if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', fire);
    else fire();
  } catch (e) {}
})();

// ==================== 工具函数 ====================
const Utils = {
    uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    },

    /**
     * 检测当前浏览器是否支持用 canvas 编码指定图片格式
     * @param {string} fmt - avif | webp | jpeg | png
     */
    supportsImageFormat(fmt) {
        try {
            const c = document.createElement('canvas');
            c.width = 1;
            c.height = 1;
            const d = c.toDataURL('image/' + fmt);
            return d.indexOf('data:image/' + fmt) === 0;
        } catch (e) {
            return false;
        }
    },

    /**
     * 把期望格式解析为实际可用的输出格式（自动回退）
     * auto: avif -> webp -> png；jpeg 不支持时回退 png
     */
    resolveImageFormat(fmt) {
        const want = String(fmt || 'auto').toLowerCase();
        const order = (want === 'jpeg') ? ['jpeg', 'png'] :
                      (want === 'webp') ? ['webp', 'png'] :
                      (want === 'avif') ? ['avif', 'webp', 'png'] :
                      (want === 'png')  ? ['png'] : ['avif', 'webp', 'png'];
        for (const f of order) {
            if (this.supportsImageFormat(f)) return f;
        }
        return 'png';
    },

    resolveImageMime(fmt) {
        return 'image/' + this.resolveImageFormat(fmt);
    },

    imageQuality(q) {
        const n = Number(q);
        if (!isFinite(n) || n <= 0) return 0.85;
        return Math.min(100, Math.max(1, n)) / 100;
    },

    /**
     * 通过本地后端（Pillow）同步转换图片格式；失败返回 null。
     * 仅用于浏览器无法编码的格式（如 Chrome 的 AVIF），后端在本机所以同步请求很快。
     */
    imageToDataUrlSync(dataUrl, fmt, quality) {
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/image-convert', false);
            xhr.setRequestHeader('Content-Type', 'application/json; charset=utf-8');
            xhr.send(JSON.stringify({
                dataUrl: dataUrl,
                format: String(fmt || 'avif').toLowerCase(),
                quality: Math.round(Utils.imageQuality(quality) * 100)
            }));
            if (xhr.status === 200) {
                const d = JSON.parse(xhr.responseText);
                if (d && d.ok && d.dataUrl) return d.dataUrl;
            }
        } catch (e) {}
        return null;
    },

    /**
     * 按目标格式输出图片 dataURL：
     * - 小图（<4096px²）auto 用 PNG，大图 auto 用 AVIF
     * - 浏览器能编码的格式直接用 canvas；不能编码的（AVIF）交给本地后端转换
     */
    finalImageDataUrl(canvas, fmt, quality) {
        const want = String(fmt || 'auto').toLowerCase();
        const autoTarget = (canvas.width * canvas.height) >= 16384 ? 'avif' : 'png';
        const target = want === 'auto' ? autoTarget : want;
        const mime = 'image/' + Utils.resolveImageFormat(target);
        let out = canvas.toDataURL(mime, mime === 'image/png' ? undefined : Utils.imageQuality(quality));
        if (target === 'avif' && out.indexOf('data:image/avif') !== 0) {
            const conv = Utils.imageToDataUrlSync(out, 'avif', quality);
            if (conv) return conv;
        } else if (target === 'webp' && out.indexOf('data:image/webp') !== 0) {
            const conv = Utils.imageToDataUrlSync(out, 'webp', quality);
            if (conv) return conv;
        } else if (target === 'jpeg' && out.indexOf('data:image/jpeg') !== 0) {
            const conv = Utils.imageToDataUrlSync(out, 'jpeg', quality);
            if (conv) return conv;
        }
        return out;
    },

    /**
     * 通用图片压缩函数：将 base64 data URL 压缩到指定最大尺寸
     * @param {string} dataUrl - 图片的 base64 data URL
     * @param {number} maxSize - 最大宽或高（px），默认 200
     * @param {number} quality - JPEG 质量 0-1，默认 0.85
     * @param {function} callback - 接收压缩后的 data URL
     */
    compressImageDataUrl(dataUrl, maxSize = 200, quality = 0.85, callback) {
        const img = new Image();
        img.onload = () => {
            // 如果尺寸已经小于 maxSize 且文件很小，不做压缩
            if (img.width <= maxSize && img.height <= maxSize) {
                // 估算 base64 大小（data:...;base64, 之后的部分）
                const commaIdx = dataUrl.indexOf('base64,');
                const rawLen = commaIdx > 0 ? dataUrl.length - commaIdx - 7 : dataUrl.length;
                if (rawLen < 50 * 1024) { callback(dataUrl); return; }
            }
            // 计算缩放后的尺寸（保持宽高比）
            let w = img.width, h = img.height;
            if (w > maxSize || h > maxSize) {
                const ratio = Math.min(maxSize / w, maxSize / h);
                w = Math.round(w * ratio);
                h = Math.round(h * ratio);
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, w, h);
            // 检测原图格式：AVIF/WebP 保持原格式压缩（更小），PNG/透明用 PNG，其余用 JPEG
            const srcMime = (dataUrl.match(/^data:image\/([a-z0-9.+-]+);/) || [])[1] || '';
            const hasAlpha = srcMime === 'png' || srcMime === 'webp' || srcMime === 'avif' || srcMime === 'gif';
            let compressed;
            if (srcMime === 'avif' || srcMime === 'webp') {
                compressed = Utils.finalImageDataUrl(canvas, srcMime, quality * 100);
            } else {
                const mime = hasAlpha ? 'image/png' : 'image/jpeg';
                compressed = canvas.toDataURL(mime, mime === 'image/png' ? undefined : quality);
            }
            callback(compressed);
        };
        img.onerror = () => callback(dataUrl); // 加载失败时返回原数据
        img.src = dataUrl;
    },
    md5Like(str) {
        // 简单哈希用于生成分类ID（保持与原站格式类似）
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const ch = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + ch;
            hash |= 0;
        }
        return Math.abs(hash).toString(16).padStart(8, '0') + Math.abs(hash ^ 0xdeadbeef).toString(16).padStart(8, '0');
    },
    formatTime(ts) {
        const d = new Date(ts);
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    },
    debounce(fn, ms) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), ms);
        };
    },
    download(filename, content, type = 'text/plain') {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        // 必须挂到 DOM 才能稳定触发下载（部分浏览器对游离 <a> 的 click 无效）
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // 延迟回收，避免与浏览器读取 blob 的时机竞争导致下载为空/损坏
        // （Firefox / 部分 Chrome 场景下，立即 revoke 会让下载失败）
        setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) {} }, 4000);
    },
    getExt(path) {
        const m = path.match(/\.([^./\\]+)$/);
        return m ? m[1].toLowerCase() : '';
    },
    getMime(path) {
        const ext = Utils.getExt(path);
        const map = {
            'html': 'text/html', 'css': 'text/css', 'js': 'application/javascript',
            'json': 'application/json', 'png': 'image/png', 'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg', 'gif': 'image/gif', 'svg': 'image/svg+xml',
            'webp': 'image/webp', 'ico': 'image/x-icon', 'woff': 'font/woff',
            'woff2': 'font/woff2', 'ttf': 'font/ttf', 'eot': 'application/vnd.ms-fontobject',
            'txt': 'text/plain', 'xml': 'text/xml', 'map': 'application/json',
        };
        return map[ext] || 'application/octet-stream';
    },
    encodeLogoPath(name) {
        // 将中文文件名编码为 URL 格式（与原站一致）
        return encodeURI(name);
    }
};

// ==================== HTML 解析器 ====================
const Parser = {
    /**
     * 从 index.html 解析出结构化数据
     */
    parse(htmlString) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, 'text/html');

        const site = this.parseSite(doc);
        const categories = this.parseSidebar(doc, parser, htmlString);
        const friendLinks = this.parseFriendLinks(doc);
        const searchConfig = this.parseSearchConfig(doc);
        const background = this.parseBackground(doc);
        const about = this.parseAbout(doc);
        const footer = this.parseFooter(doc);
        const menuKeys = this.parseMenuKeys(doc);

        return { site, categories, friendLinks, searchConfig, background, about, footer, menuKeys };
    },

    parseSite(doc) {
        const titleEl = doc.querySelector('title');
        const descEl = doc.querySelector('meta[name="description"]');
        const kwEl = doc.querySelector('meta[name="keywords"]');
        const favEl = doc.querySelector('link[rel="shortcut icon"]');
        const logoLight = doc.querySelector('.logo-expanded .logo-light');
        const logoDark = doc.querySelector('.logo-expanded .logo-dark');
        const logoCollapsedLight = doc.querySelector('.logo-collapsed .logo-light');
        const logoCollapsedDark = doc.querySelector('.logo-collapsed .logo-dark');

        // 归一化资源路径：parseSite 永远解析「根目录 index.html」，
        // 其相对 ./assets/... 即站点根 /assets/...。
        // 归一化为根绝对路径，避免在 /admin/ 管理页上下文被解析成 /admin/assets/... 而 404。
        const normAsset = (v) => {
            if (!v) return v;
            if (/^(https?:)?\/\//i.test(v) || v.startsWith('data:') || v.startsWith('/')) return v;
            return '/' + v.replace(/^\.?\//, '');
        };

        // 关于导航快捷入口：从 .flex-bottom 中识别名为"关于导航"或链接含 about 的项
        // 解析时去除 icon 上的修饰类（icon-fw/icon-lg/mr-2/fa-fw）以避免 Generator 二次拼接
        const stripSuffixes = (cls) => (cls || '').replace(/\s*(icon-fw|icon-lg|icon-sm|mr-2|ml-2|fa-fw)\s*/g, ' ').trim();
        const aboutCandidates = doc.querySelectorAll('.flex-bottom > ul > li.sidebar-item a');
        let aboutLink = { enabled: true, icon: 'fa fa-info-circle', text: '关于导航', url: 'footer', target: '_blank' };
        aboutCandidates.forEach(a => {
            const spanEl = a.querySelector('span');
            const txt = spanEl ? spanEl.textContent.trim() : '';
            const href = a.getAttribute('href') || '';
            if (txt === '关于导航' || /footer/i.test(href)) {
                const iconEl = a.querySelector('i');
                aboutLink = {
                    enabled: true,
                    icon: iconEl ? stripSuffixes(iconEl.className) : 'fa fa-info-circle',
                    text: txt || '关于导航',
                    url: href || 'footer',
                    target: a.getAttribute('target') || '_blank'
                };
            }
        });

        return {
            title: titleEl?.textContent?.trim() || '网址导航',
            description: descEl?.getAttribute('content') || '',
            keywords: kwEl?.getAttribute('content') || '',
            favicon: normAsset(favEl?.getAttribute('href')) || '',
            logoLight: normAsset(logoLight?.getAttribute('src')) || '',
            logoDark: normAsset(logoDark?.getAttribute('src')) || '',
            logoCollapsedLight: normAsset(logoCollapsedLight?.getAttribute('src')) || '',
            logoCollapsedDark: normAsset(logoCollapsedDark?.getAttribute('src')) || '',
            // 侧边栏标题：取生成页首个 .logo-text（展开态标题）；缺省回退 title
            sidebarTitle: (doc.querySelector('.logo-text')?.textContent || '').trim() || '',
            scrollHighlight: { enabled: false },
            aboutLink
        };
    },

    parseSidebar(doc) {
        const categories = [];
        const sidebarItems = doc.querySelectorAll('.sidebar-menu-inner > ul > li.sidebar-item');

        sidebarItems.forEach(li => {
            const link = li.querySelector(':scope > a');
            if (!link) return;

            const href = link.getAttribute('href') || '';
            const id = href.replace('#', '');
            const iconEl = link.querySelector('i');
            const icon = iconEl ? iconEl.className.trim() : 'fas fa-folder';
            const name = link.querySelector('span')?.textContent?.trim() || '未命名';

            // 检查是否有子菜单
            const subUl = li.querySelector(':scope > ul');
            let children = [];

            if (subUl) {
                // 有子分类
                const subItems = subUl.querySelectorAll(':scope > li');
                subItems.forEach(subLi => {
                    const subLink = subLi.querySelector('a');
                    if (!subLink) return;
                    const subHref = subLink.getAttribute('href') || '';
                    const subId = subHref.replace('#', '');
                    const subName = subLink.querySelector('span')?.textContent?.trim() || '未命名';

                    // 从内容区找对应的卡片
                    const sites = this.findSites(doc, subId);
                    children.push({
                        id: subId || Utils.uid(),
                        name: subName,
                        sites
                    });
                });
            } else {
                // 无子分类，直接找内容区卡片
                const sites = this.findSites(doc, id);
                children.push({
                    id: id || Utils.uid(),
                    name: name,
                    sites
                });
            }

            categories.push({ id: id || Utils.uid(), name, icon, children });
        });

        return categories;
    },

    /**
     * 在内容区根据分类ID查找所有网站卡片
     */
    findSites(doc, categoryId) {
        const sites = [];
        // 找到对应的 h4 标题
        const h4 = doc.querySelector(`h4 i[id="${categoryId}"]`);
        if (!h4) return sites;

        // h4 在 .d-flex 容器内，下一个兄弟是 .row
        const headerDiv = h4.closest('.d-flex');
        if (!headerDiv) return sites;

        const rowDiv = headerDiv.nextElementSibling;
        if (!rowDiv || !rowDiv.classList.contains('row')) return sites;

        const cards = rowDiv.querySelectorAll('.url-card');
        cards.forEach(card => {
            const link = card.querySelector('a.card');
            const img = card.querySelector('img');
            const nameEl = card.querySelector('.url-info strong');
            const descEl = card.querySelector('.url-info p');

            sites.push({
                name: nameEl?.textContent?.trim() || '',
                url: link?.getAttribute('href') || '',
                description: descEl?.textContent?.trim() || '',
                logo: img ? decodeURIComponent(img.getAttribute('data-src') || img.getAttribute('src') || '') : ''
            });
        });

        return sites;
    },

    parseFriendLinks(doc) {
        const links = [];
        const container = doc.querySelector('.friendlink .card-body');
        if (!container) return links;
        container.querySelectorAll('a').forEach(a => {
            links.push({
                name: a.textContent.trim(),
                url: a.getAttribute('href') || '',
                title: a.getAttribute('title') || ''
            });
        });
        return links;
    },

    /**
     * 解析侧边栏底部菜单项（网站提交 / 友情链接 / 关于导航 等）
     * 数据源：.flex-bottom > ul > li.sidebar-item
     */
    parseMenuKeys(doc) {
        const items = [];
        const list = doc.querySelector('.flex-bottom > ul');
        if (!list) return items;
        const stripSuffixes = (cls) => cls.replace(/\s*(icon-fw|icon-lg|icon-sm|mr-2|ml-2|fa-fw)\s*/g, ' ').trim();
        list.querySelectorAll(':scope > li.sidebar-item').forEach(li => {
            const a = li.querySelector(':scope > a');
            if (!a) return;
            const text = a.querySelector('span')?.textContent?.trim() || a.textContent.trim();
            // 关于导航已独立为 site.aboutLink，不再计入 menuKeys
            if (text === '关于导航' || /footer/i.test(a.getAttribute('href') || '')) return;
            const iconEl = a.querySelector('i');
            const icon = iconEl ? stripSuffixes(iconEl.className) : 'fas fa-link';
            const url = a.getAttribute('href') || '';
            const target = a.getAttribute('target') || '';
            items.push({
                id: Utils.md5Like(text + url),
                icon,
                text,
                url,
                target
            });
        });
        return items;
    },

    /**
     * 解析搜索区配置
     * 返回 { tabs: [{name, engines: [{name, url, placeholder, logo}]}], defaultEngine }
     */
    parseSearchConfig(doc) {
        const tabs = [];
        // 提取顶部 tab 标签（常用/搜索/工具/社区/生活/求职）
        const tabLabels = doc.querySelectorAll('#search-list-menu .s-type-list label');
        const tabNames = Array.from(tabLabels).map(l => l.textContent.trim());

        // 提取每个 group 中的搜索引擎
        const groups = doc.querySelectorAll('#search-list .search-group');
        groups.forEach((group, idx) => {
            const groupClass = Array.from(group.classList).find(c => c.startsWith('group-'));
            const engines = [];
            group.querySelectorAll('li').forEach(li => {
                const input = li.querySelector('input[type="radio"]');
                const label = li.querySelector('label');
                if (!input) return;
                engines.push({
                    name: label?.textContent?.trim() || '',
                    url: input.getAttribute('value') || '',
                    placeholder: input.getAttribute('data-placeholder') || '输入关键字搜索',
                    logo: input.getAttribute('data-logo') || ''
                });
            });
            const tabName = tabNames[idx] || `标签${idx + 1}`;
            tabs.push({ name: tabName, engines });
        });

        // 默认引擎：取第一个 tab 的第一个引擎
        const defaultEngine = tabs[0]?.engines[0]?.url || 'https://www.baidu.com/s?wd=';

        return { tabs, defaultEngine };
    },

    /**
     * 解析背景图：先看 #search-bg 的 style，再尝试读取 .header-big 的 background-image
     */
    parseBackground(doc) {
        const searchBg = doc.querySelector('#search-bg');
        let url = '';
        let type = 'none';
        if (searchBg) {
            const style = searchBg.getAttribute('style') || '';
            const m = style.match(/background-image:\s*url\(['"]?([^'")]+)['"]?\)/);
            if (m) {
                url = m[1];
                type = 'image';
            }
        }
        return {
            type, // 'none' | 'image' | 'bing' | 'unsplash'
            url,
            // 预置选项
            presets: [
                { name: '必应每日壁纸', type: 'bing', url: 'https://api.dujin.org/bing/1366.php' },
                { name: '必应1080P', type: 'bing', url: 'https://api.dujin.org/bing/1920.php' },
                { name: 'Unsplash随机', type: 'unsplash', url: 'https://source.unsplash.com/1920x1080/?nature' },
                { name: 'Unsplash科技', type: 'unsplash', url: 'https://source.unsplash.com/1920x1080/?technology' },
                { name: '纯色（深色）', type: 'none', url: '' }
            ]
        };
    },

    /**
     * 解析关于导航页面（独立子页），无匹配时返回默认
     */
    parseAbout(doc) {
        const titleEl = doc.querySelector('#aboutTitle') || doc.querySelector('.about-hero h1');
        const secEl = doc.querySelector('#aboutSectionTitle');
        return {
            title: (titleEl ? titleEl.textContent.trim() : '') || '关于导航',
            sectionTitle: (secEl ? secEl.textContent.trim() : '') || '详细介绍',
            content: '这是一个个人收藏的导航网站，收录了我常用的工具、资源和网站。\n\n本站由 WorkBuddy 编辑器管理，所有内容可在浏览器中可视化编辑。'
        };
    },

    /**
     * 解析底部备案/版权信息（.footer-text）
     * 原 HTML 格式示例：
     *   "本站内容来自于网络，不对网站内容负责 <br/>@2025 By <a href="...">NavEditor</a> | <a href="...">粤ICP备xxxx号</a> | <a href="..."><img src="assets/images/gongan.png"/>粤公网安备xxxx号</a>"
     */
    parseFooter(doc) {
        const def = {
            domain: '',
            note: '',
            copyright: '',
            copyrightName: '',
            copyrightUrl: '',
            beian: '',
            beianUrl: '',
            gongan: '',
            gonganUrl: ''
        };
        const ft = doc.querySelector('.footer-text');
        if (!ft) return def;

        // 提取行（br 分隔）：第一行 note，第二行版权，第三行 ICP/公安备案（兼容旧的两行格式）
        const html = ft.innerHTML;
        const parts = html.split(/<br\s*\/?>/i);
        const result = { ...def };
        const linkRe = /<a\s+([^>]*?href=["']([^"']+)["'][^>]*>)([\s\S]*?)<\/a>/gi;
        const parseLinks = (seg) => {
            linkRe.lastIndex = 0;
            const out = [];
            let m;
            while ((m = linkRe.exec(seg || '')) !== null) {
                out.push({ full: m[0], href: m[2], inner: m[3] });
            }
            return out;
        };

        if (parts[0]) {
            // 第一行：纯文本（可能包含邮箱）
            const noteText = parts[0].replace(/<[^>]+>/g, '').trim();
            if (noteText) result.note = noteText;
        }
        let copyLinks = [];
        let beianLinks = [];
        const line1Links = parseLinks(parts[1]);
        if (parts[2]) {
            // 版权单独一行，ICP/公安在下一行（兼容上一版三行格式）
            copyLinks = line1Links;
            beianLinks = parseLinks(parts[2]);
        } else {
            // 版权 + ICP/公安 在同一行
            copyLinks = line1Links.slice(0, 1);
            beianLinks = line1Links.slice(1);
        }
        if (copyLinks.length >= 1) {
            result.copyrightUrl = copyLinks[0].href;
            result.copyrightName = copyLinks[0].inner.replace(/<[^>]+>/g, '').trim();
            const beforeCopy = parts[1].split(copyLinks[0].full)[0].trim();
            if (beforeCopy) result.copyright = beforeCopy;
        }
        for (const ln of beianLinks) {
            const text = ln.inner.replace(/<[^>]+>/g, '').trim();
            if (!text) continue;
            if (/<img/i.test(ln.inner)) {
                result.gonganUrl = ln.href;
                result.gongan = text;
            } else {
                result.beianUrl = ln.href;
                result.beian = text;
            }
        }
        return result;
    }
};

// ==================== HTML 生成器 ====================
const Generator = {
    /**
     * 从数据生成完整的 index.html
     */
    generate(data) {
        const { site, categories, friendLinks, searchConfig, background, menuKeys, footer } = data;
        // 把 menuKeys / footer 挂到 site 上，方便模板访问
        const siteWithMenu = { ...site, menuKeys: menuKeys || [], footerMenuOrder: data.footerMenuOrder || ['mk-submit', 'mk-friend', 'about-link'], footerMenuItems: data.footerMenuItems || [], footerFixedMeta: data.footerFixedMeta || {}, footer: footer || this.defaultFooter() };
        // 重置闪烁动画收集器（每次生成必须从0开始）
        this._blinkIdx = 0;
        this._blinkKeyframes = [];
        this._blinkStyles = {};
        const sidebarHtml = this.generateSidebar(categories);
        const contentHtml = this.generateContent(categories);
        const friendLinkHtml = this.generateFriendLinks(friendLinks);
        const searchHtml = this.generateSearch(searchConfig);
        const bgStyle = this.generateBgStyle(background);
        const bottomBgStyle = this.generateBgStyle(data.bottomBackground);
        const footerBgStyle = this.generateBgStyle(data.footerBackground);
        const bgLight = this.isLightBackground(background);

        // 收集网站卡片闪烁 CSS
        let blinkCss = '';
        if (this._blinkKeyframes && this._blinkKeyframes.length > 0) {
            const kfStr = this._blinkKeyframes.join('');
            // 为每个有闪烁的卡片构建 animation 规则
            let ruleParts = [];
            // 用 data 属性方式：在 contentHtml 中用正则替换注入 style
            // 闪烁动画作用于卡片内部 .card 元素（白色背景区域）
            const animRules = Object.entries(this._blinkStyles).map(([name,val]) => `.site-card-blink[data-blink-anim="${name}"]>.url-body>.card{animation:${name} ${val};border-radius:8px;transition:none}`).join('');
            blinkCss = `<style>/* site-card blink */${kfStr}${animRules}</style>`;
        }

        return this.injectSeo(this.wrapTemplate(siteWithMenu, sidebarHtml, contentHtml, friendLinkHtml, searchHtml, bgStyle, bottomBgStyle, blinkCss, data.dailyText, data.adSlots, searchConfig, footerBgStyle, bgLight, (data.about && data.about.template) || '页脚/关于导航'), data);
    },

    /**
     * 生成关于导航子页 about.html
     * 复用同款模板（侧边栏、样式、背景），主区域换为关于页面文字
     * 支持：title / subtitle / contentHtml（已渲染好的富文本）/ leftAds / rightAds / inlineAds
     */
    generateAbout(data) {
        const { site, categories, searchConfig, background, about, menuKeys, footer } = data;
        if (!about) return '';
        const siteWithMenu = { ...site, menuKeys: menuKeys || [], footerMenuOrder: data.footerMenuOrder || ['mk-submit', 'mk-friend', 'about-link'], footerMenuItems: data.footerMenuItems || [], footerFixedMeta: data.footerFixedMeta || {}, footer: footer || this.defaultFooter() };
        const sidebarHtml = this.generateSidebar(categories);
        const searchHtml = this.generateSearch(searchConfig);
        const bgStyle = this.generateBgStyle(background);
        const bottomBgStyle = this.generateBgStyle(data.bottomBackground);
        const footerBgStyle = this.generateBgStyle(data.footerBackground);
        const bgLight = this.isLightBackground(background);

        const a = about;
        // 段落渲染：优先 Html，否则纯文本按空行分段；highlightFirst 把首段包进高亮框
        const renderParas = (text, html, highlightFirst) => {
            if (html) return html;
            const paras = (text || '').split(/\n\s*\n/).filter(s => s.trim());
            if (!paras.length) return text ? '<p>' + this.escape(text) + '</p>' : '';
            return paras.map((p, idx) => {
                const esc = this.escape(p.trim());
                return (highlightFirst && idx === 0)
                    ? '<div class="about-highlight"><p>' + esc + '</p></div>'
                    : '<p>' + esc + '</p>';
            }).join('\n');
        };
        const introHtml = renderParas(a.intro, a.introHtml, true);
        const philosophyHtml = renderParas(a.philosophy, a.philosophyHtml, false);

        const skillsHtml = (a.skills || []).map((s, i) =>
            '<div class="about-skill" data-skill-idx="' + i + '">' +
                '<i class="' + this.escape(s.icon || 'fas fa-star') + '"></i>' +
                '<div class="skill-name">' + this.escape(s.name || '') + '</div>' +
            '</div>'
        ).join('\n');

        const contactsHtml = (a.contacts || []).map((c, i) =>
            '<li data-contact-idx="' + i + '">' +
                '<i class="' + this.escape(c.icon || 'fas fa-link') + '"></i>' +
                '<strong>' + this.escape(c.label || '') + '</strong>' +
                '<a href="' + this.escape(c.link || '#') + '" target="_blank" rel="noopener">' + this.escape(c.value || c.link || '') + '</a>' +
            '</li>'
        ).join('\n');

        // 渲染广告
        const renderAd = (ad) => this.generateAdHtml(ad);
        const leftAdsHtml = (a.leftAds || []).map(renderAd).join('\n');
        const rightAdsHtml = (a.rightAds || []).map(renderAd).join('\n');

        // 编辑模式种子数据：供 template/关于导航/edit.js 在 ?edit=1 时读取（优先用 localStorage，缺失时回退此种子）
        const aboutSeed = JSON.stringify({
            about: {
                title: a.title || '关于作者',
                subtitle: a.subtitle || '',
                headerIcon: a.headerIcon || 'fas fa-user-circle',
                headerBg: a.headerBg || '',
                intro: a.intro || '',
                introHtml: a.introHtml || '',
                introMode: a.introHtml ? 'html' : 'text',
                skills: a.skills || [],
                philosophy: a.philosophy || '',
                philosophyHtml: a.philosophyHtml || '',
                philosophyMode: a.philosophyHtml ? 'html' : 'text',
                contacts: a.contacts || [],
        sections: (a.sections && a.sections.length) ? a.sections : undefined,
                leftAds: a.leftAds || [],
                rightAds: a.rightAds || []
            },
            site: { aboutLink: (site && site.aboutLink) || {} }
        }).replace(/<\//g, '<\\/');

        const contentHtml = `
            <style>
                .about-wrap{max-width:1200px;margin:0 auto;padding:24px 16px;display:grid;grid-template-columns:220px minmax(0,1fr) 220px;gap:16px;align-items:start}
                .about-col-side{display:flex;flex-direction:column;gap:12px;position:sticky;top:16px}
                .about-container{background:#fff;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.1);overflow:hidden}
                .about-header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;padding:40px 30px;text-align:center}
                .about-header h1{font-size:32px;margin:0 0 10px;font-weight:600}
                .about-header p{font-size:16px;margin:0;opacity:0.9}
                .about-content{padding:40px 30px}
                .about-section{margin-bottom:35px}
                .about-section:last-child{margin-bottom:0}
                .about-section-title{font-size:22px;color:#333;margin:0 0 15px;padding-bottom:10px;border-bottom:2px solid #f0f0f0;display:flex;align-items:center}
                .about-section-title i{margin-right:10px;color:#667eea}
                .about-section-content{font-size:15px;line-height:1.8;color:#555}
                .about-section-content p{margin:0 0 15px}
                .about-section-content p:last-child{margin-bottom:0}
                .about-highlight{background:linear-gradient(135deg,#667eea15 0%,#764ba215 100%);border-left:4px solid #667eea;padding:20px;border-radius:6px;margin:0 0 15px}
                .about-highlight p{margin:0;color:#555;line-height:1.8}
                .about-skills{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:15px;margin-top:5px}
                .about-skill{background:#f8f9fa;padding:15px;border-radius:6px;text-align:center;transition:transform .3s,box-shadow .3s}
                .about-skill:hover{transform:translateY(-3px);box-shadow:0 4px 12px rgba(0,0,0,.1)}
                .about-skill i{font-size:28px;color:#667eea;margin-bottom:8px}
                .about-skill .skill-name{font-weight:600;color:#333;font-size:14px}
                .about-contact-list{list-style:none;padding:0;margin:0}
                .about-contact-list li{padding:12px 15px;margin-bottom:10px;background:#f8f9fa;border-radius:6px;display:flex;align-items:center}
                .about-contact-list li i{margin-right:12px;color:#667eea;width:20px;text-align:center}
                .about-contact-list li strong{color:#333;margin-right:8px;min-width:70px}
                .about-contact-list li a{color:#667eea;text-decoration:none;word-break:break-all}
                .about-contact-list li a:hover{text-decoration:underline}
                .about-back-home{text-align:center;padding:30px;background:#f8f9fa}
                .about-back-home a{display:inline-block;padding:10px 30px;background:#667eea;color:#fff;text-decoration:none;border-radius:25px;transition:background .3s,transform .3s}
                .about-back-home a:hover{background:#5568d3;transform:translateY(-2px)}
                .ad-banner{width:100%;text-align:center;border-radius:8px;overflow:hidden;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.04);margin-bottom:12px}
                .ad-banner img,.ad-banner video{width:100%;height:auto;display:block}
                .ad-banner-text{padding:20px 16px;font-size:15px;line-height:1.6;font-weight:500;text-align:center}
                @keyframes ad-flash-anim{0%,100%{opacity:1;filter:brightness(1)}50%{opacity:.6;filter:brightness(1.3)}}
                .ad-flash{animation:ad-flash-anim 1.2s ease-in-out infinite}
                @keyframes ad-glow-anim{0%,100%{box-shadow:0 0 8px rgba(102,126,234,.4)}50%{box-shadow:0 0 24px rgba(102,126,234,.8)}}
                .ad-glow{animation:ad-glow-anim 1.5s ease-in-out infinite}
                .section{margin-bottom:35px}
                .section:last-child{margin-bottom:0}
                .section-title{font-size:22px;color:#333;margin:0 0 15px;padding-bottom:10px;border-bottom:2px solid #f0f0f0;display:flex;align-items:center}
                .section-title i{margin-right:10px;color:#667eea}
                .section-content{font-size:15px;line-height:1.8;color:#555}
                .section-content p{margin:0 0 15px}
                .section-content p:last-child{margin-bottom:0}
                .skills-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:15px;margin-top:20px}
                .skill-item{background:#f8f9fa;padding:15px;border-radius:6px;text-align:center}
                .skill-item i{font-size:28px;color:#667eea;margin-bottom:8px}
                .skill-item .skill-name{font-weight:600;color:#333;font-size:14px}
                .contact-list{list-style:none;padding:0;margin:20px 0 0 0}
                .contact-list li{padding:12px 15px;margin-bottom:10px;background:#f8f9fa;border-radius:6px;display:flex;align-items:center}
                .contact-list li i{margin-right:12px;color:#667eea;width:20px;text-align:center}
                .contact-list li strong{color:#333;margin-right:8px;min-width:80px}
                .contact-list li a{color:#667eea;text-decoration:none;word-break:break-all}
                .highlight-box{background:linear-gradient(135deg,#667eea15 0%,#764ba215 100%);border-left:4px solid #667eea;padding:20px;border-radius:6px;margin:20px 0}
                .highlight-box p{margin:0;color:#555;line-height:1.8}
                @media (max-width:1100px){.about-wrap{grid-template-columns:1fr!important}.about-col-side{display:none!important}}
                .ab-mod-blocks{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0;padding:10px;background:#fafbfc;border-radius:8px;border:1px dashed #ddd}
                .ab-mp-block{padding:8px;background:#fff;border-radius:6px;border:1px solid #eee}
                .ab-mp-span1{grid-column:span 1}.ab-mp-span2{grid-column:span 2}.ab-mp-span3{grid-column:span 3}.ab-mp-span4{grid-column:span 4}
                .ab-mp-label{font-size:11px;color:#999;margin-bottom:4px}
                .ab-mp-input{width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;color:#999;background:#fafafa;box-sizing:border-box}
                .ab-mp-textarea{width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;color:#999;background:#fafafa;resize:none;box-sizing:border-box}
                .ab-mp-select{width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;color:#999;background:#fafafa;box-sizing:border-box}
                .ab-mp-toggle{width:36px;height:20px;border-radius:10px;background:#27ae60;position:relative}
                .ab-mp-toggle::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;background:#fff;border-radius:50%}
                .ab-mp-slider{width:100px;height:6px;border-radius:3px;background:#e0e0e0;position:relative}
                .ab-mp-slider-bar{position:absolute;top:-5px;left:60%;width:16px;height:16px;background:#27ae60;border-radius:50%}
                .ab-mp-search{padding-left:28px}
                .ab-mp-skills{display:flex;gap:4px}
                .ab-mp-skill-tag{padding:3px 8px;border-radius:4px;font-size:11px;color:#fff}
                .ab-mp-progress{width:100%;height:8px;background:#e8e8e8;border-radius:4px;overflow:hidden}
                .ab-mp-progress-bar{height:100%;border-radius:4px}
                .ab-mp-badge{padding:2px 8px;border-radius:10px;font-size:11px;color:#fff;background:#e74c3c}
                .ab-mp-quote{border-left:3px solid #27ae60;padding:6px 10px;background:#e8f5e9;font-size:12px;color:#666;border-radius:0 4px 4px 0}
                .ab-mp-contact{font-size:12px;color:#666;line-height:1.6}
                .ab-mp-alert{padding:6px 10px;border-radius:4px;font-size:11px}
                .ab-mp-alert-ok{background:#d4edda;color:#155724}
                .ab-mp-divider{display:flex;align-items:center;gap:8px;margin:8px 0}
                .ab-mp-divider::before,.ab-mp-divider::after{content:"";flex:1;height:1px;background:#e0e0e0}
                .ab-mp-divider span{font-size:11px;color:#ccc}
                .ab-mp-tabs{display:flex}
                .ab-mp-tab{padding:4px 10px;font-size:11px;border:1px solid #ddd;background:#fafafa;color:#999}
                .ab-mp-tab.active{background:#27ae60;color:#fff;border-color:#27ae60}
                .ab-mp-steps{display:flex;align-items:center}
                .ab-mp-step-num{width:20px;height:20px;border-radius:50%;background:#27ae60;color:#fff;font-size:10px;display:flex;align-items:center;justify-content:center}
                .ab-mp-step-line{width:20px;height:2px;background:#e0e0e0;margin:0 2px}
                .ab-mp-icon{width:32px;height:32px;border-radius:6px;background:linear-gradient(135deg,#27ae60,#2ecc71);display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px}
                .ab-mp-avatar{width:36px;height:36px;border-radius:50%;background:#f093fb;display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px;font-weight:bold}
                .ab-mp-unknown{padding:4px 10px;background:#f0f0f0;color:#999;border-radius:4px;font-size:11px}
            </style>
            <div class="about-wrap" id="aboutPageRoot">
                <aside class="about-col-side"><div class="ad-column" id="aboutLeftAds" data-side="left">${leftAdsHtml}</div></aside>
                <main>
                    <div class="about-container">
                        <div class="about-header">
                            <h1 data-about-field="title">${this.escape(a.title || '关于作者')}</h1>
                            <p data-about-field="subtitle">${this.escape(a.subtitle || '')}</p>
                        </div>
                        <div class="about-content">
                            <div id="aboutSections"></div>

                        </div>
                        <div class="about-back-home">
                            <a href="./"><i class="fas fa-home"></i> 返回首页</a>
                        </div>
                    </div>
                </main>
                <aside class="about-col-side"><div class="ad-column" id="aboutRightAds" data-side="right">${rightAdsHtml}</div></aside>
            </div>
            <script id="aboutSeed" type="application/json">${aboutSeed}</script>
            <script src="./edit.js"></script>`;

        return this.wrapTemplate(siteWithMenu, sidebarHtml, contentHtml, '', searchHtml, bgStyle, bottomBgStyle, '', null, data.adSlots, searchConfig, footerBgStyle, bgLight, (data.about && data.about.template) || '页脚/关于导航');
    },

    /**
     * 生成关于导航子页（部署/导出用：自包含静态 HTML）
     * 与 generateAbout（模板源形态，含 seed + edit.js）不同，本方法直接把
     * about.sections 渲染为静态 HTML，不依赖 edit.js，可作为 footer/about.html 部署。
     * 生成独立页面，不再套用站点 wrapTemplate，避免在访客视角下被嵌入站点框架。
     */
    generateAboutDeployed(data) {
        const { site, about } = data;
        if (!about) return '';
        const a = about;
        const staticSections = this.renderAboutSectionsStatic(a);
        const renderAd = (ad) => this.generateAdHtml(ad);
        const leftAdsHtml = (a.leftAds || []).map(renderAd).join('\n');
        const rightAdsHtml = (a.rightAds || []).map(renderAd).join('\n');
        const pageTitle = this.escape((a.title || '关于作者') + (site && site.title ? ' - ' + site.title : ''));
        const favicon = this.escapeAttr((a && a.favicon) || '');
        const contentHtml = `
            <style>
                body{margin:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans","Liberation Sans",sans-serif}
                .about-wrap{max-width:1200px;margin:0 auto;padding:24px 16px;display:grid;grid-template-columns:220px minmax(0,1fr) 220px;gap:16px;align-items:start}
                .about-col-side{display:flex;flex-direction:column;gap:12px;position:sticky;top:16px}
                .about-container{background:#fff;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.1);overflow:hidden}
                .about-header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;padding:40px 30px;text-align:center}
                .about-header h1{font-size:32px;margin:0 0 10px;font-weight:600}
                .about-header p{font-size:16px;margin:0;opacity:0.9}
                .about-content{padding:40px 30px}
                .about-section{margin-bottom:35px}
                .about-section:last-child{margin-bottom:0}
                .about-section-title{font-size:22px;color:#333;margin:0 0 15px;padding-bottom:10px;border-bottom:2px solid #f0f0f0;display:flex;align-items:center}
                .about-section-title i{margin-right:10px;color:#667eea}
                .about-section-content{font-size:15px;line-height:1.8;color:#555}
                .about-section-content p{margin:0 0 15px}
                .about-section-content p:last-child{margin-bottom:0}
                .about-highlight{background:linear-gradient(135deg,#667eea15 0%,#764ba215 100%);border-left:4px solid #667eea;padding:20px;border-radius:6px;margin:0 0 15px}
                .about-highlight p{margin:0;color:#555;line-height:1.8}
                .about-skills{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:15px;margin-top:5px}
                .about-skill{background:#f8f9fa;padding:15px;border-radius:6px;text-align:center;transition:transform .3s,box-shadow .3s}
                .about-skill:hover{transform:translateY(-3px);box-shadow:0 4px 12px rgba(0,0,0,.1)}
                .about-skill i{font-size:28px;color:#667eea;margin-bottom:8px}
                .about-skill .skill-name{font-weight:600;color:#333;font-size:14px}
                .about-contact-list{list-style:none;padding:0;margin:0}
                .about-contact-list li{padding:12px 15px;margin-bottom:10px;background:#f8f9fa;border-radius:6px;display:flex;align-items:center}
                .about-contact-list li i{margin-right:12px;color:#667eea;width:20px;text-align:center}
                .about-contact-list li strong{color:#333;margin-right:8px;min-width:70px}
                .about-contact-list li a{color:#667eea;text-decoration:none;word-break:break-all}
                .about-contact-list li a:hover{text-decoration:underline}
                .about-back-home{text-align:center;padding:30px;background:#f8f9fa}
                .about-back-home a{display:inline-block;padding:10px 30px;background:#667eea;color:#fff;text-decoration:none;border-radius:25px;transition:background .3s,transform .3s}
                .about-back-home a:hover{background:#5568d3;transform:translateY(-2px)}
                .ad-banner{width:100%;text-align:center;border-radius:8px;overflow:hidden;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.04);margin-bottom:12px}
                .ad-banner img,.ad-banner video{width:100%;height:auto;display:block}
                .ad-banner-text{padding:20px 16px;font-size:15px;line-height:1.6;font-weight:500;text-align:center}
                @keyframes ad-flash-anim{0%,100%{opacity:1;filter:brightness(1)}50%{opacity:.6;filter:brightness(1.3)}}
                .ad-flash{animation:ad-flash-anim 1.2s ease-in-out infinite}
                @keyframes ad-glow-anim{0%,100%{box-shadow:0 0 8px rgba(102,126,234,.4)}50%{box-shadow:0 0 24px rgba(102,126,234,.8)}}
                .ad-glow{animation:ad-glow-anim 1.5s ease-in-out infinite}
                .section{margin-bottom:35px}
                .section:last-child{margin-bottom:0}
                .section-title{font-size:22px;color:#333;margin:0 0 15px;padding-bottom:10px;border-bottom:2px solid #f0f0f0;display:flex;align-items:center}
                .section-title i{margin-right:10px;color:#667eea}
                .section-content{font-size:15px;line-height:1.8;color:#555}
                .section-content p{margin:0 0 15px}
                .section-content p:last-child{margin-bottom:0}
                .skills-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:15px;margin-top:20px}
                .skill-item{background:#f8f9fa;padding:15px;border-radius:6px;text-align:center}
                .skill-item i{font-size:28px;color:#667eea;margin-bottom:8px}
                .skill-item .skill-name{font-weight:600;color:#333;font-size:14px}
                .contact-list{list-style:none;padding:0;margin:20px 0 0 0}
                .contact-list li{padding:12px 15px;margin-bottom:10px;background:#f8f9fa;border-radius:6px;display:flex;align-items:center}
                .contact-list li i{margin-right:12px;color:#667eea;width:20px;text-align:center}
                .contact-list li strong{color:#333;margin-right:8px;min-width:80px}
                .contact-list li a{color:#667eea;text-decoration:none;word-break:break-all}
                .highlight-box{background:linear-gradient(135deg,#667eea15 0%,#764ba215 100%);border-left:4px solid #667eea;padding:20px;border-radius:6px;margin:20px 0}
                .highlight-box p{margin:0;color:#555;line-height:1.8}
                @media (max-width:1100px){.about-wrap{grid-template-columns:1fr!important}.about-col-side{display:none!important}}
                .ab-mod-blocks{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0;padding:10px;background:#fafbfc;border-radius:8px;border:1px dashed #ddd}
                .ab-mp-block{padding:8px;background:#fff;border-radius:6px;border:1px solid #eee}
                .ab-mp-span1{grid-column:span 1}.ab-mp-span2{grid-column:span 2}.ab-mp-span3{grid-column:span 3}.ab-mp-span4{grid-column:span 4}
                .ab-mp-label{font-size:11px;color:#999;margin-bottom:4px}
                .ab-mp-input{width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;color:#999;background:#fafafa;box-sizing:border-box}
                .ab-mp-textarea{width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;color:#999;background:#fafafa;resize:none;box-sizing:border-box}
                .ab-mp-select{width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;color:#999;background:#fafafa;box-sizing:border-box}
                .ab-mp-toggle{width:36px;height:20px;border-radius:10px;background:#27ae60;position:relative}
                .ab-mp-toggle::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;background:#fff;border-radius:50%}
                .ab-mp-slider{width:100px;height:6px;border-radius:3px;background:#e0e0e0;position:relative}
                .ab-mp-slider-bar{position:absolute;top:-5px;left:60%;width:16px;height:16px;background:#27ae60;border-radius:50%}
                .ab-mp-search{padding-left:28px}
                .ab-mp-skills{display:flex;gap:4px}
                .ab-mp-skill-tag{padding:3px 8px;border-radius:4px;font-size:11px;color:#fff}
                .ab-mp-progress{width:100%;height:8px;background:#e8e8e8;border-radius:4px;overflow:hidden}
                .ab-mp-progress-bar{height:100%;border-radius:4px}
                .ab-mp-badge{padding:2px 8px;border-radius:10px;font-size:11px;color:#fff;background:#e74c3c}
                .ab-mp-quote{border-left:3px solid #27ae60;padding:6px 10px;background:#e8f5e9;font-size:12px;color:#666;border-radius:0 4px 4px 0}
                .ab-mp-contact{font-size:12px;color:#666;line-height:1.6}
                .ab-mp-alert{padding:6px 10px;border-radius:4px;font-size:11px}
                .ab-mp-alert-ok{background:#d4edda;color:#155724}
                .ab-mp-divider{display:flex;align-items:center;gap:8px;margin:8px 0}
                .ab-mp-divider::before,.ab-mp-divider::after{content:"";flex:1;height:1px;background:#e0e0e0}
                .ab-mp-divider span{font-size:11px;color:#ccc}
                .ab-mp-tabs{display:flex}
                .ab-mp-tab{padding:4px 10px;font-size:11px;border:1px solid #ddd;background:#fafafa;color:#999}
                .ab-mp-tab.active{background:#27ae60;color:#fff;border-color:#27ae60}
                .ab-mp-steps{display:flex;align-items:center}
                .ab-mp-step-num{width:20px;height:20px;border-radius:50%;background:#27ae60;color:#fff;font-size:10px;display:flex;align-items:center;justify-content:center}
                .ab-mp-step-line{width:20px;height:2px;background:#e0e0e0;margin:0 2px}
                .ab-mp-icon{width:32px;height:32px;border-radius:6px;background:linear-gradient(135deg,#27ae60,#2ecc71);display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px}
                .ab-mp-avatar{width:36px;height:36px;border-radius:50%;background:#f093fb;display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px;font-weight:bold}
                .ab-mp-unknown{padding:4px 10px;background:#f0f0f0;color:#999;border-radius:4px;font-size:11px}
            </style>
            <div class="about-wrap" id="aboutPageRoot">
                <aside class="about-col-side"><div class="ad-column" id="aboutLeftAds" data-side="left">${leftAdsHtml}</div></aside>
                <main>
                    <div class="about-container">
                        <div class="about-header">
                            <h1 data-about-field="title">${this.escape(a.title || '关于作者')}</h1>
                            <p data-about-field="subtitle">${this.escape(a.subtitle || '')}</p>
                        </div>
                        <div class="about-content">
                            <div id="aboutSections">${staticSections}</div>
                        </div>
                        <div class="about-back-home">
                            <a href="../"><i class="fas fa-home"></i> 返回首页</a>
                        </div>
                    </div>
                </main>
                <aside class="about-col-side"><div class="ad-column" id="aboutRightAds" data-side="right">${rightAdsHtml}</div></aside>
            </div>`;

        const aboutHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge, chrome=1" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <meta name="theme-color" content="#f9f9f9" />
    <title>${pageTitle}</title>
    <link rel="shortcut icon" href="${favicon}" />
    <link rel="stylesheet" href="/assets/fontawesome-5.15.4/css/all.min.css" type="text/css" />
</head>
<body>
    ${contentHtml}
</body>
</html>`;
        return this.injectSeo(aboutHtml, data);
    },

    /**
     * 把 about.sections 渲染为静态 HTML（与 edit.js 访客模式 sectionHtml 一致）
     */
    modulePreviewBody(m) {
        const name = typeof m === 'string' ? m : (m && m.name) || '';
        const cfg = (m && m.config) ? m.config : {};
        const lb = cfg.label || '';
        const ph = cfg.placeholder || '';
        const esc = (str) => this.escape(str == null ? '' : str);
        const escAttr = (str) => this.escapeAttr(str == null ? '' : str);
        if (name === '单行输入框' || name === '输入框') {
            const it = cfg.inputType || 'text';
            const dph = ph || (it === 'email' ? 'name@example.com' : it === 'url' ? 'https://example.com' : it === 'tel' ? '13800000000' : it === 'number' ? '0' : it === 'password' ? '••••••••' : '请输入...');
            return (lb ? '<div class="ab-mp-label">' + esc(lb) + '</div>' : '') + '<input class="ab-mp-input" type="' + escAttr(it) + '" placeholder="' + escAttr(dph) + '" readonly>';
        }
        if (name === '多行输入框' || name === '可拉伸输入框') { return (lb ? '<div class="ab-mp-label">' + esc(lb) + '</div>' : '') + '<textarea class="ab-mp-textarea" rows="' + (cfg.rows || 3) + '" readonly>' + esc(ph) + '</textarea>'; }
        if (name === '选择器' || name === '下拉选择') { const opt = cfg.options && cfg.options.length ? cfg.options : ['选项 A', '选项 B']; return (lb ? '<div class="ab-mp-label">' + esc(lb) + '</div>' : '') + '<select class="ab-mp-select"><option>请选择...</option>' + opt.map(function(o) { return '<option>' + esc(o) + '</option>'; }).join('') + '</select>'; }
        if (name === '日期时间' || name === '日期选择') return (lb ? '<div class="ab-mp-label">' + esc(lb) + '</div>' : '') + '<input class="ab-mp-input" type="date" value="2026-07-30" readonly>';
        if (name === '开关切换' || name === '开关') return '<div class="ab-mp-toggle" style="background:#3b82f6"></div>';
        if (name === '范围滑块' || name === '滑块') return '<div class="ab-mp-slider"><div class="ab-mp-slider-bar" style="background:#3b82f6"></div></div>';
        if (name === '搜索框') return (lb ? '<div class="ab-mp-label">' + esc(lb) + '</div>' : '') + '<input class="ab-mp-input ab-mp-search" placeholder="' + escAttr(ph || '搜索...') + '" readonly>';
        if (name === '标签组' || name === '技能卡片') { const tags = cfg.tags ? cfg.tags.split(',').map(function(t) { return t.trim(); }) : ['标签']; return '<div class="ab-mp-skills">' + tags.map(function(t) { return '<span class="ab-mp-skill-tag" style="background:#3b82f6">' + esc(t) + '</span>'; }).join('') + '</div>'; }
        if (name === '进度条') { const pct = cfg.percent || 65; return '<div class="ab-mp-progress"><div class="ab-mp-progress-bar" style="width:' + pct + '%;background:#3b82f6"></div></div>'; }
        if (name === '数字徽章') return '<span style="padding:2px 8px;background:#3b82f6;color:#fff;border-radius:10px;font-size:11px">' + esc(cfg.text || 'NEW') + '</span>';
        if (name === '引用卡片' || name === '引用块') return '<div class="ab-mp-quote">' + esc(cfg.quote || '引用文字') + '</div>';
        if (name === '联系方式卡' || name === '联系方式卡片') return '<div style="padding:12px;background:#eff6ff;border-radius:6px;font-size:13px">📧 contact@example.com</div>';
        if (name === '提示信息') return '<div style="padding:8px 12px;border-radius:4px;font-size:13px;background:#dbeafe;color:#1e40af">' + esc(cfg.msg || '提示') + '</div>';
        if (name === '分割线') return '<div class="ab-mp-divider"><span>分割线</span></div>';
        if (name === '选项卡切换' || name === '选项卡') return '<div class="ab-mp-tabs"><span class="ab-mp-tab active">选项一</span><span class="ab-mp-tab">选项二</span></div>';
        if (name === '步骤进度条' || name === '步骤条') return '<div class="ab-mp-steps"><span class="ab-mp-step-num">1</span><span class="ab-mp-step-line"></span><span class="ab-mp-step-num">2</span></div>';
        if (name === '图标标题组' || name === '图标框') return '<div class="ab-mp-icon" style="background:linear-gradient(135deg,#3b82f6,#2563eb)">⭐</div><span style="font-size:13px">' + esc(cfg.text || '标题') + '</span>';
        if (name === '头像名片' || name === '头像') return '<div class="ab-mp-avatar" style="background:#3b82f6">U</div><span>' + esc(cfg.name || '用户名') + '</span>';
        if (name === '统计数据') return '<div style="text-align:center"><div style="font-size:18px;font-weight:700;color:#3b82f6">' + esc(cfg.num || '0') + '</div></div>';
        if (name === '富文本段落') return '<div style="padding:8px;color:#555;font-size:13px">正文内容</div>';
        if (name === '代码块') return '<div class="ab-mp-code">function hello(){}</div>';
        if (name === '数据表格') return '<table class="ab-mp-table"><tr><th>列A</th><th>列B</th></tr><tr><td>1</td><td>2</td></tr></table>';
        if (name === '折叠面板') return '<div style="border:1px solid #ddd;border-radius:4px;overflow:hidden"><div style="padding:6px 10px;background:#fafafa;font-weight:600;font-size:12px">' + esc(cfg.label || '面板标题') + '</div></div>';
        if (name === '空状态') return '<div style="text-align:center;padding:16px;color:#ccc">📭 暂无数据</div>';
        if (name === '分栏布局') return '<div style="display:flex;gap:4px"><div style="flex:1;padding:10px;background:#eff6ff;text-align:center;border-radius:3px">栏</div><div style="flex:1;padding:10px;background:#eff6ff;text-align:center;border-radius:3px">栏</div></div>';
        if (name === '分页导航' || name === '分页') return '<div class="ab-mp-pages"><span class="ab-mp-page">‹</span><span class="ab-mp-page ab-mp-page-cur">1</span><span class="ab-mp-page">2</span><span class="ab-mp-page">›</span></div>';
        if (name === '倒计时') return '<div style="display:flex;gap:3px;font-family:monospace"><span style="padding:2px 5px;background:#333;color:#fff;border-radius:2px;font-size:12px">12</span>:<span style="padding:2px 5px;background:#333;color:#fff;border-radius:2px;font-size:12px">30</span></div>';
        return '<span class="ab-mp-unknown">' + esc(name) + '</span>';
    },
    renderModuleBlocks(mods, secId, pvCols) {
        if (!mods || !mods.length) return '';
        const cols = pvCols || [];
        return '<div class="ab-mod-blocks" data-mod-sec="' + this.escapeAttr(secId || '') + '">'
            + mods.map((m, i) => {
                const span = cols[i] || 4;
                return '<div class="ab-mp-block ab-mp-span' + span + '">' + this.modulePreviewBody(m) + '</div>';
            }).join('')
            + '</div>';
    },

    /**
     * 把 about.sections 渲染为静态 HTML（与 edit.js 访客模式 sectionHtml 一致）
     */
    renderAboutSectionsStatic(a) {
        const esc = (s) => this.escape(s == null ? '' : s);
        const escAttr = (s) => this.escapeAttr(s == null ? '' : s);
        const normLink = (u) => { if (!u) return u; if (/^(https?:|mailto:|tel:|#|\/)/.test(u)) return u; return '//' + u; };
        const secs = a.sections || [];
        if (!secs.length) return '';
        return secs.map((sec) => {
            const title = sec.title || '';
            const icon = sec.icon || 'fas fa-circle';
            let body = '';
            if (sec.type === 'skills') {
                const items = (sec.content && sec.content.items) || [];
                body = '<div class="skills-grid">' + items.map((it) =>
                    '<div class="skill-item"><i class="' + escAttr(it.icon || 'fas fa-star') + '"></i><div class="skill-name">' + esc(it.name || '') + '</div></div>'
                ).join('') + '</div>';
            } else if (sec.type === 'contacts') {
                const items = (sec.content && sec.content.items) || [];
                body = '<ul class="contact-list">' + items.map((it) =>
                    '<li><i class="' + escAttr(it.icon || 'fas fa-link') + '"></i><strong>' + esc(it.label || '') + '</strong><a href="' + escAttr(normLink(it.link || '#')) + '" target="_blank" rel="noopener">' + esc(it.value || it.link || '') + '</a></li>'
                ).join('') + '</ul>';
            }
            if (sec.modules && sec.modules.length) {
                body += this.renderModuleBlocks(sec.modules, sec.id, sec._pvCols);
            }
            if (sec.content && sec.content.richHtml) {
                body += '<div class="section-rich-content">' + sec.content.richHtml + '</div>';
            }
            return '<div class="section" data-sec="' + escAttr(sec.id || '') + '">'
                + '<h2 class="section-title"><i class="' + escAttr(icon) + '"></i> <span class="sec-title">' + title + '</span></h2>'
                + body + '</div>';
        }).join('');
    },

    /**
     * 生成站点提交页面 commit.html
     */
    generateCommit(data) {
        const commit = data.commit || {};
        const title = this.escape(commit.title || '网址提交');
        const subtitle = this.escape(commit.subtitle || '提交您的优质网站，我们将在审核后收录到网址导航中');
        const successMessage = this.escape(commit.successMessage || '提交成功！我们会尽快审核您的网站。');
        const guidelines = (commit.guidelines || [
            '请确保网站内容合法、健康，符合相关法律法规',
            '网站应正常访问，不含恶意代码或病毒',
            '提供真实有效的网站信息，便于我们审核',
            '我们会在3-5个工作日内完成审核，审核结果将通过邮件通知'
        ]).map(g => `<li>${this.escape(g)}</li>`).join('');
        const categories = (commit.categories || ['常用工具','科研办公','开发设计','效率办公','社交媒体','资源下载','生活服务','学习教育','其他'])
            .map(c => `<option value="${this.escapeAttr(c)}">${this.escape(c)}</option>`).join('');

        const commitHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge, chrome=1" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <meta name="theme-color" content="#f9f9f9" />
    <title>${title} - 在线工具网</title>
    <link rel="shortcut icon" href="${this.escapeAttr(commit.favicon || '')}" />
    <meta name="keywords" content="网址提交,网站收录,在线工具网" />
    <meta name="description" content="提交您的优质网站，加入在线工具网址导航" />
    <link rel="stylesheet" href="./assets/css/block-library.min-5.6.2.css" type="text/css" media="all" />
    <link rel="stylesheet" href="./assets/css/iconfont-3.03029.1.css" type="text/css" media="all" />
    <link rel="stylesheet" href="./assets/css/bootstrap.min-4.3.1.css" type="text/css" media="all" />
    <link rel="stylesheet" href="./assets/css/style-3.03029.1.css" type="text/css" media="all" />
    <link rel="stylesheet" href="./assets/css/custom-style.css" type="text/css" media="all" />
    <link rel="stylesheet" href="./assets/fontawesome-5.15.4/css/all.min.css" type="text/css" />
    <style>
        .submit-container { max-width: 800px; margin: 50px auto; padding: 30px; background: #fff; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .submit-header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #f0f0f0; }
        .submit-header h1 { font-size: 28px; color: #333; margin-bottom: 10px; }
        .submit-header p { color: #666; font-size: 14px; }
        .form-group { margin-bottom: 20px; }
        .form-group label { display: block; margin-bottom: 8px; color: #333; font-weight: 500; }
        .form-group label .required { color: #ff4444; margin-left: 3px; }
        .form-control { width: 100%; padding: 10px 15px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; transition: border-color 0.3s; }
        .form-control:focus { outline: none; border-color: #4CAF50; }
        .form-control.error { border-color: #ff4444; }
        textarea.form-control { resize: vertical; min-height: 100px; }
        .error-message { color: #ff4444; font-size: 12px; margin-top: 5px; display: none; }
        .submit-btn { width: 100%; padding: 12px; background: #4CAF50; color: white; border: none; border-radius: 4px; font-size: 16px; cursor: pointer; transition: background 0.3s; }
        .submit-btn:hover { background: #45a049; }
        .submit-btn:disabled { background: #ccc; cursor: not-allowed; }
        .back-home { text-align: center; margin-top: 20px; }
        .back-home a { color: #4CAF50; text-decoration: none; }
        .back-home a:hover { text-decoration: underline; }
        .success-message { background: #d4edda; color: #155724; padding: 15px; border-radius: 4px; margin-bottom: 20px; display: none; }
        .guidelines { background: #f8f9fa; padding: 20px; border-radius: 4px; margin-bottom: 30px; }
        .guidelines h3 { font-size: 16px; color: #333; margin-bottom: 10px; }
        .guidelines ul { margin: 0; padding-left: 20px; }
        .guidelines li { color: #666; font-size: 14px; margin-bottom: 5px; }
        .char-count { text-align: right; font-size: 12px; color: #999; margin-top: 5px; }
    </style>
</head>
<body>
    <div class="submit-container">
        <div class="submit-header">
            <h1><i class="fas fa-paper-plane"></i> ${title}</h1>
            <p>${subtitle}</p>
        </div>
        <div class="success-message" id="successMessage">
            <i class="fas fa-check-circle"></i> ${successMessage}
        </div>
        <div class="guidelines">
            <h3><i class="fas fa-info-circle"></i> 提交须知</h3>
            <ul>${guidelines}</ul>
        </div>
        <form id="submitForm">
            <div class="form-group">
                <label for="siteName">网站名称<span class="required">*</span></label>
                <input type="text" id="siteName" name="siteName" class="form-control" placeholder="请输入网站名称" maxlength="50" required>
                <div class="error-message" id="siteNameError">请输入网站名称</div>
            </div>
            <div class="form-group">
                <label for="siteUrl">网站地址<span class="required">*</span></label>
                <input type="url" id="siteUrl" name="siteUrl" class="form-control" placeholder="https://example.com" required>
                <div class="error-message" id="siteUrlError">请输入正确的网址格式</div>
            </div>
            <div class="form-group">
                <label for="category">网站分类<span class="required">*</span></label>
                <select id="category" name="category" class="form-control" required>
                    <option value="">请选择分类</option>${categories}
                </select>
                <div class="error-message" id="categoryError">请选择网站分类</div>
            </div>
            <div class="form-group">
                <label for="description">网站描述<span class="required">*</span></label>
                <textarea id="description" name="description" class="form-control" placeholder="简要描述网站的主要功能和特点" maxlength="200" required></textarea>
                <div class="char-count"><span id="descCount">0</span>/200</div>
                <div class="error-message" id="descriptionError">请输入网站描述</div>
            </div>
            <div class="form-group">
                <label for="keywords">关键词</label>
                <input type="text" id="keywords" name="keywords" class="form-control" placeholder="用逗号分隔，如：工具,在线,免费" maxlength="100">
            </div>
            <div class="form-group">
                <label for="email">联系邮箱<span class="required">*</span></label>
                <input type="email" id="email" name="email" class="form-control" placeholder="用于接收审核结果通知" required>
                <div class="error-message" id="emailError">请输入正确的邮箱地址</div>
            </div>
            <div class="form-group">
                <label for="contact">联系方式</label>
                <input type="text" id="contact" name="contact" class="form-control" placeholder="QQ、微信或其他联系方式（选填）" maxlength="50">
            </div>
            <button type="submit" class="submit-btn" id="submitBtn">
                <i class="fas fa-paper-plane"></i> 提交网站
            </button>
        </form>
        <div class="back-home">
            <a href="./"><i class="fas fa-home"></i> 返回首页</a>
        </div>
    </div>
    <script src="./assets/js/jquery.min-3.2.1.js"></script>
    <script>
        $(document).ready(function() {
            $('#description').on('input', function() { $('#descCount').text($(this).val().length); });
            function validateForm() { let isValid = true; $('.form-control').removeClass('error'); $('.error-message').hide(); if(!$('#siteName').val().trim()){$('#siteName').addClass('error');$('#siteNameError').show();isValid=false;} var urlP=/^https?:\/\/.+\..+/i; if(!urlP.test($('#siteUrl').val().trim())){$('#siteUrl').addClass('error');$('#siteUrlError').show();isValid=false;} if(!$('#category').val()){$('#category').addClass('error');$('#categoryError').show();isValid=false;} if(!$('#description').val().trim()){$('#description').addClass('error');$('#descriptionError').show();isValid=false;} var emailP=/^[^\s@]+@[^\s@]+\.[^\s@]+$/; if(!emailP.test($('#email').val().trim())){$('#email').addClass('error');$('#emailError').show();isValid=false;} return isValid; }
            $('#submitForm').on('submit', function(e) { e.preventDefault(); if(!validateForm()) return; $('#submitBtn').prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> 提交中...'); });
            $('.form-control').on('input change', function() { $(this).removeClass('error'); $(this).siblings('.error-message').hide(); });
        });
    </script>
</body>
</html>`;
        return this.injectSeo(commitHtml, data);
    },

    /**
     * 渲染单个广告 HTML
     */
    // 规范化外部链接：补齐协议，避免 "baidu.com" 被当成相对路径拼到当前域名后
    normalizeLink(url) {
        const u = (url || '').trim();
        if (!u) return u;
        // 已带协议 / 协议无关(//) / 锚点(#) / 相对路径(/ ./ ../ ?) / 特殊scheme → 原样返回
        if (/^(https?:\/\/|mailto:|tel:|javascript:|\/\/|#|\/|\.\/|\.\.\/|\?)/i.test(u)) return u;
        // 其余视为裸域名或外链，补 https://
        return 'https://' + u;
    },

    generateAdHtml(ad) {
        if (!ad) return '';
        // 谷歌广告（AdSense）：优先用粘贴的完整代码，否则用发布商+广告位；不依赖 value 字段
        if (ad.type === 'google') {
            const animClass = ad.effect === 'flash' ? ' ad-flash' : (ad.effect === 'glow' ? ' ad-glow' : '');
            const styleParts = [];
            if (ad.width) styleParts.push('width:' + ad.width);
            if (ad.height) styleParts.push('min-height:' + ad.height);
            if (ad.radius != null && ad.radius !== '') styleParts.push('border-radius:' + ad.radius + 'px');
            const styleAttr = styleParts.length ? ' style="' + styleParts.join(';') + '"' : '';
            const raw = (ad.adCode || '').trim();
            if (raw) return '<div class="ad-banner' + animClass + '"' + styleAttr + '>' + raw + '</div>';
            const client = (ad.adClient || '').trim();
            const slot = (ad.adSlot || '').trim();
            if (!client || !slot) return '';
            const gstyle = (ad.width ? 'width:' + ad.width + ';' : '') + (ad.height ? 'min-height:' + ad.height + ';' : '');
            return '<div class="ad-banner' + animClass + '"' + styleAttr + '>'
                + '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"></' + 'script>'
                + '<ins class="adsbygoogle" style="display:block;' + gstyle + '" data-ad-client="' + this.escapeAttr(client) + '" data-ad-slot="' + this.escapeAttr(slot) + '" data-ad-format="auto" data-full-width-responsive="true"></ins>'
                + '<script>(adsbygoogle = window.adsbygoogle || []).push({});</' + 'script>'
                + '</div>';
        }
        if (!ad.value) return '';
        const animClass = ad.effect === 'flash' ? ' ad-flash' : (ad.effect === 'glow' ? ' ad-glow' : '');
        const styleParts = [];
        if (ad.width) styleParts.push('width:' + ad.width);
        if (ad.height) styleParts.push('min-height:' + ad.height);
        if (ad.radius != null && ad.radius !== '') styleParts.push('border-radius:' + ad.radius + 'px');
        const styleAttr = styleParts.length ? ' style="' + styleParts.join(';') + '"' : '';
        const linkOpen = ad.link ? '<a href="' + this.escapeAttr(this.normalizeLink(ad.link)) + '" target="_blank" rel="noopener">' : '<span>';
        const linkClose = ad.link ? '</a>' : '</span>';

        let inner = '';
        if (ad.type === 'image') {
            if ((ad.value || '').trim().startsWith('<svg') || (ad.value || '').trim().startsWith('<?xml')) {
                inner = linkOpen + ad.value + linkClose;
            } else {
                inner = linkOpen + '<img src="' + this.escapeAttr(ad.value) + '" alt="">' + linkClose;
            }
        } else if (ad.type === 'video') {
            const autoplay = ad.autoplay !== false ? ' autoplay muted playsinline' : '';
            const loop = ad.loop !== false ? ' loop' : '';
            inner = (ad.link ? '<a href="' + this.escapeAttr(this.normalizeLink(ad.link)) + '" target="_blank" rel="noopener" style="display:block">' : '') +
                    '<video src="' + this.escapeAttr(ad.value) + '"' + autoplay + loop + ' style="width:100%;display:block"></video>' +
                    (ad.link ? '</a>' : '');
        } else if (ad.type === 'text') {
            const bg = ad.bg || '#667eea';
            const color = ad.color || '#fff';
            const radStyle = (ad.radius != null && ad.radius !== '') ? 'border-radius:' + ad.radius + 'px' : '';
            const textHtml = (ad.link ? '<a href="' + this.escapeAttr(this.normalizeLink(ad.link)) + '" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">' + this.escape(ad.value || '') + '</a>' : this.escape(ad.value || ''));
            inner = '<div class="ad-banner-text" style="background:' + bg + ';color:' + color + ';' + radStyle + '">' + textHtml + '</div>';
        }
        return '<div class="ad-banner' + animClass + '"' + styleAttr + '>' + inner + '</div>';
    },

    /**
     * 生成搜索区HTML
     */
    /**
     * 生成搜索栏 HTML（主页面中间区域使用，含完整样式注入）
     */
    generateSearch(searchConfig) {
        if (!searchConfig || !searchConfig.tabs || searchConfig.tabs.length === 0) {
            // 兜底默认
            return this.getDefaultSearchHtml();
        }

        const tabs = searchConfig.tabs;
        const groupLetters = ['a','b','c','d','e','f','g','h','i','j','k','l'];

        // 顶部 tab 标签
        const tabEngines = (tab) => (tab && Array.isArray(tab.engines)) ? tab.engines
            : (tab && tab.url) ? [{ name: tab.name, url: tab.url, placeholder: tab.placeholder, logo: tab.logo }]
            : [];
        const tabLabels = tabs.map((tab, i) => {
            const groupId = `group-${groupLetters[i] || i}`;
            const firstEngine = tabEngines(tab)[0];
            const inputId = firstEngine ? `type-${this.sanitizeId(firstEngine.name)}-${i}-0` : `type-tab-${i}`;
            return `                        <label for="${inputId}"  data-id="${groupId}">${tab.icon ? '<i class="' + this.escapeAttr(tab.icon) + '"></i> ' : ''}<span>${this.escape(tab.name)}</span></label>`;
        }).join('\n');

        // 每个 group
        const groups = tabs.map((tab, i) => {
            const groupId = `group-${groupLetters[i] || i}`;
            const engines = tabEngines(tab).map((engine, j) => {
                const isFirst = i === 0 && j === 0;
                const inputId = `type-${this.sanitizeId(engine.name)}-${i}-${j}`;
                const checked = isFirst ? ' checked="checked"' : '';
                const logoAttr = engine.logo ? ` data-logo="${this.escapeAttr(engine.logo)}"` : '';
                return `                        <li><input hidden="" type="radio" name="type"${checked}
                                id="${inputId}"
                                value="${this.escapeAttr(engine.url)}"
                                data-placeholder="${this.escapeAttr(engine.placeholder || '输入关键字搜索')}"${logoAttr}>
                            <label for="${inputId}"><span class="text-muted">${this.escape(engine.name)}</span></label>
                        </li>`;
            }).join('\n');
            return `                <div class="search-group ${groupId}">
                    <ul class="search-type">
${engines}
                    </ul>
                </div>`;
        }).join('\n');

        // 默认引擎（取第一个 tab 第一个）；兼容旧格式（tab 无 engines 数组）
        const defaultEngine = tabEngines(tabs[0] || {})[0];
        const defaultUrl = defaultEngine?.url || 'https://www.baidu.com/s?wd=';
        const defaultPlaceholder = defaultEngine?.placeholder || '输入关键字搜索';
        const defaultLogo = defaultEngine?.logo || '';

        // form action：去掉查询串只保留基础地址
        const formAction = defaultUrl.split('?')[0];

        // 搜索框宽度样式注入
        const sbw = Number(searchConfig.searchBoxWidth) || 0;
        const stc = searchConfig.searchTabTextColor || '#ffffff';
        const spc = searchConfig.searchPlaceholderColor || '#ffffff';
        const sec = searchConfig.searchEngineTextColor || '#ffffff';
        const sbc = searchConfig.searchBoxBackgroundColor || 'rgba(255,255,255,0.12)';
        const widthStyle = (sbw >= 200) ? `<style>
.super-search-fm{max-width:${sbw}px;margin:0 auto;width:100%}
.search-key{width:100%!important}
#search-list-menu{max-width:${sbw}px;margin:0 auto;width:100%}
#search-list-menu .s-type{position:relative!important;left:auto!important;top:auto!important;width:100%!important;text-align:left!important}
#search-list-menu .s-type-list.big{display:inline-table!important;position:relative!important;text-align:left!important;width:auto!important}
#search-list-menu .s-type-list label i{position:relative;top:13px;display:inline-block}
#search{position:relative;z-index:2000}
.header-big .s-type-list label,.header-big .s-type-list label span,.header-big .s-type-list label i{color:${stc}!important}
.header-big #search-text{background:${sbc}!important;color:${spc}!important}
.header-big #search-text::placeholder{color:${spc}!important;opacity:1!important}
.header-big .search-type label,.header-big .search-type label span.text-muted{color:${sec}!important}
</style>` : `<style>
.header-big .s-type-list label,.header-big .s-type-list label span,.header-big .s-type-list label i{color:${stc}!important}
.header-big #search-text{background:${sbc}!important;color:${spc}!important}
.header-big #search-text::placeholder{color:${spc}!important;opacity:1!important}
.header-big .search-type label,.header-big .search-type label span.text-muted{color:${sec}!important}
</style>`;

        return `${widthStyle}<div id="search-list-menu" class="hide-type-list">
                <div class="s-type text-center">
                    <div class="s-type-list big">
                        <div class="anchor" style="position: absolute; left: 50%; opacity: 0;"></div>
${tabLabels}
                    </div>
                </div>
            </div>

            <form action="${this.escapeAttr(formAction)}" method="get" target="_blank" class="super-search-fm">
                <span class="search-engine-logo" id="search-engine-logo"${defaultLogo ? ` style="background-image:url('${this.escapeAttr(defaultLogo)}')"` : ''}></span>
                <input type="text" id="search-text" class="form-control smart-tips search-key"
                    zhannei="" placeholder="${this.escapeAttr(defaultPlaceholder)}" style="outline:0" autocomplete="off">
                <button class="submit" type="submit" style="background:transparent;border:none;margin-left:8px;padding:4px;color:rgba(255,255,255,0.5);cursor:pointer;font-size:18px;vertical-align:middle;flex:0 0 auto"><i class="iconfont icon-search"></i></button>
            </form>
            <script>
            (function(){
                function updateLogo(){
                    var checked = document.querySelector('input[name="type"]:checked');
                    if(!checked) return;
                    var logo = checked.getAttribute('data-logo');
                    var el = document.getElementById('search-engine-logo');
                    if(!el) return;
                    if(logo){ el.style.backgroundImage = 'url(' + JSON.stringify(logo) + ')'; el.style.display='inline-block'; }
                    else { el.style.backgroundImage='none'; el.style.display='none'; }
                }
                document.querySelectorAll('input[name="type"]').forEach(function(inp){
                    inp.addEventListener('change', updateLogo);
                });
                updateLogo();
            })();
            </script>

            <div id="search-list" class="hide-type-list">
${groups}
            </div>`;
    },

    getDefaultSearchHtml() {
        return `<div id="search-list-menu" class="hide-type-list">
                <div class="s-type text-center">
                    <div class="s-type-list big">
                        <div class="anchor" style="position: absolute; left: 50%; opacity: 0;"></div>
                        <label for="type-baidu"   data-id="group-a"><span>常用</span></label>
                        <label for="type-baidu1"  data-id="group-b"><span>搜索</span></label>
                    </div>
                </div>
            </div>
            <form action="https://www.baidu.com?s=" method="get" target="_blank" class="super-search-fm">
                <input type="text" id="search-text" class="form-control smart-tips search-key"
                    zhannei="" placeholder="输入关键字搜索" style="outline:0" autocomplete="off">
                <button class="submit" type="submit" style="background:transparent;border:none;margin-left:8px;padding:4px;color:rgba(255,255,255,0.5);cursor:pointer;font-size:18px;vertical-align:middle;flex:0 0 auto"><i class="iconfont icon-search"></i></button>
            </form>`;
    },

    /**
     * 生成弹窗搜索栏 HTML（右上角 search-modal 专用）
     * 特点：横排标签（无图标）、透明背景、紧凑布局
     */
    generateModalSearch(searchConfig) {
        if (!searchConfig || !searchConfig.tabs || searchConfig.tabs.length === 0) {
            return this.getModalDefaultHtml();
        }

        const tabs = searchConfig.tabs;

        // 兼容旧格式：每个 tab 直接带 url（无 engines 数组）时，归一化为 [{name,url,...}]
        const tabEngines = (tab) => (tab && Array.isArray(tab.engines)) ? tab.engines
            : (tab && tab.url) ? [{ name: tab.name, url: tab.url, placeholder: tab.placeholder, logo: tab.logo }]
            : [];

        // 横排 tab 标签（无图标，纯文字，横排 flex 布局；点击切换分组）
        const tabLabels = tabs.map((tab, i) => {
            const active = i === 0 ? ' active' : '';
            return `<label class="modal-search-tab${active}" data-tab="${i}">${this.escape(tab.name)}</label>`;
        }).join('\n');

        // 引擎列表：按 tab 分组，默认只显示第一个 tab 的引擎，切换 tab 时显示对应分组
        const groups = tabs.map((tab, ti) => {
            const engines = tabEngines(tab).map((engine, ei) => {
                const isFirst = ti === 0 && ei === 0;
                const inputId = `m_type-${this.sanitizeId(engine.name)}-${ti}-${ei}`;
                const checked = isFirst ? ' checked="checked"' : '';
                return `<li><input hidden="" type="radio" name="type2"${checked}
                    id="${inputId}"
                    value="${this.escapeAttr(engine.url)}"
                    data-placeholder="${this.escapeAttr(engine.placeholder || '输入关键字搜索')}">
                <label for="${inputId}"><span>${this.escape(engine.name)}</span></label></li>`;
            }).join('\n');
            const display = ti === 0 ? '' : ' style="display:none"';
            return `<ul class="modal-search-group" data-group="${ti}"${display}>\n${engines}\n</ul>`;
        }).join('\n');

        // 默认引擎（兼容旧格式）
        const defaultEngine = tabEngines(tabs[0] || {})[0];
        const defaultUrl = defaultEngine?.url || 'https://www.baidu.com/s?wd=';
        const defaultPlaceholder = defaultEngine?.placeholder || '输入关键字搜索';
        const formAction = defaultUrl.split('?')[0];

        const mstc = searchConfig.modalSearchTabTextColor || '#cccccc';
        const mspc = searchConfig.modalSearchPlaceholderColor || 'rgba(255,255,255,0.45)';
        const msec = searchConfig.modalSearchEngineTextColor || 'rgba(255,255,255,0.65)';
        const msbc = searchConfig.modalSearchBoxBackgroundColor || 'rgba(255,255,255,0.12)';
        const msbd = searchConfig.modalSearchBackdropColor || 'rgba(22,30,40,0.92)';
        return `<style>
.modal-search-tabs{display:flex;flex-wrap:wrap;gap:6px 16px;justify-content:center;margin-bottom:10px}
.modal-search-tab{cursor:pointer;font-size:13px;color:#ccc;padding:2px 8px;border-radius:4px;transition:all .2s;border-bottom:2px solid transparent}
.modal-search-tab:hover,.modal-search-tab.active{color:#fff;border-bottom-color:#4a9eff}
#search-modal .super-search-fm{background:transparent!important;border:none;box-shadow:none;padding:0;text-align:center;display:flex!important;flex-wrap:nowrap!important;align-items:center!important;justify-content:center!important;gap:8px!important}
#search-modal #search button{position:static!important;width:auto!important;height:auto!important;margin:0 0 0 8px!important;background:transparent!important;border:none!important;color:rgba(255,255,255,0.5)!important;cursor:pointer;font-size:18px;padding:4px;flex:0 0 auto;line-height:normal!important}
#search-modal .search-key{background:rgba(255,255,255,0.12)!important;border:1px solid rgba(255,255,255,0.25)!important;color:#fff!important;border-radius:24px!important;padding:10px 20px!important;font-size:15px!important;display:inline-block!important;width:auto!important;min-width:160px}
#search-modal .search-key::placeholder{color:rgba(255,255,255,0.45)!important}
#search-modal .submit{background:transparent!important;border:none;color:rgba(255,255,255,0.7)!important;font-size:18px!important;padding:4px 10px!important;margin-left:8px!important}
#search-modal .submit:hover{color:#fff!important}
#search-modal .modal-content{background:rgba(22,30,40,0.92)!important;border:none!important;border-radius:12px!important;box-shadow:0 10px 40px rgba(0,0,0,0.45)!important}
#search-modal .modal-body{background:transparent!important;padding:16px 24px}
#search-modal .modal-dialog{position:fixed!important;top:auto!important;right:0!important;left:auto!important;margin:0!important;width:340px!important;max-width:90vw!important;transform:none!important}
.modal-search-group{display:flex;flex-wrap:wrap;gap:6px 18px;justify-content:center;margin:10px 0 0;padding:8px 0;list-style:none}
.modal-search-group label span{font-size:13px;color:rgba(255,255,255,0.65);cursor:pointer;padding:2px 6px;border-radius:3px;transition:all .15s}
.modal-search-group label:hover span,.modal-search-group input:checked + label span{color:#fff;background:rgba(74,158,255,0.25)}
#search-modal .super-search-fm .submit{background:transparent!important;border:none!important;color:rgba(255,255,255,0.5)!important;cursor:pointer;font-size:18px;margin-left:8px;padding:4px;vertical-align:middle}
body.modal-open{overflow:auto!important;padding-right:0!important}
.modal-search-tab{color:${mstc}!important}
#search-modal .search-key::placeholder{color:${mspc}!important}
.modal-search-group label span{color:${msec}!important}
#search-modal .search-key{background:${msbc}!important;color:${msec}!important}
#search-modal .modal-content{background:${msbd}!important}
</style>
<div class="modal-search-tabs">
${tabLabels}
</div>
<form action="${this.escapeAttr(formAction)}" method="get" target="_blank" class="super-search-fm">
    <input type="text" id="m_search-text" class="form-control smart-tips search-key"
        zhannei="" placeholder="${this.escapeAttr(defaultPlaceholder)}" autocomplete="off">
    <button class="submit" type="submit" style="background:transparent;border:none;margin-left:8px;padding:4px;color:rgba(255,255,255,0.5);cursor:pointer;font-size:18px;vertical-align:middle;flex:0 0 auto"><i class="iconfont icon-search"></i></button>
</form>
${groups}
<script>
(function(){
    // 锚定弹窗到 🔍 按钮正下方 + 默认展开第一组（用轮询确保在 Bootstrap 之后执行）
    var _opened = false;  // 防止重复执行
    function positionAndShow(){
        var dialog = document.querySelector('#search-modal .modal-dialog');
        if(!dialog) return;
        var trigger = document.querySelector('[data-target="#search-modal"]') || window.__svSearchTrigger || null;
        if(!trigger || !trigger.getBoundingClientRect) return;
        var r = trigger.getBoundingClientRect();
        dialog.style.setProperty('top', (r.bottom + 8) + 'px', 'important');
        dialog.style.setProperty('left', 'auto', 'important');
        dialog.style.setProperty('right', '0', 'important');
        dialog.style.setProperty('transform', 'none', 'important');
        dialog.style.setProperty('margin', '0', 'important');
        showGroup(0);
        _opened = true;
    }
    // 轮询：每 80ms 检查弹窗是否可见，一旦可见就执行一次并停掉定时器
    var smEl = document.getElementById('search-modal');
    var _pollTimer = setInterval(function(){
        if(smEl && (smEl.classList.contains('show') || getComputedStyle(smEl).display !== 'none')){
            if(!_opened) positionAndShow();
        } else {
            _opened = false;  // 弹窗关闭后重置，下次打开再执行
        }
    }, 80);
    // 安全兜底：10秒后停掉轮询，防止泄漏
    setTimeout(function(){ clearInterval(_pollTimer); }, 10000);
    var tabs = document.querySelectorAll('.modal-search-tab');
    var groupEls = document.querySelectorAll('.modal-search-group');
    function syncActive(){
        var checked = document.querySelector('#search-modal input[name="type2"]:checked');
        if(!checked) return;
        var ph = checked.getAttribute('data-placeholder') || '';
        document.getElementById('m_search-text').placeholder = ph;
        document.getElementById('m_search-text').closest('form').action = checked.value.split('?')[0];
    }
    function showGroup(idx){
        groupEls.forEach(function(g){
            g.style.display = (g.getAttribute('data-group') == idx) ? 'flex' : 'none';
        });
        tabs.forEach(function(t){
            t.classList.toggle('active', t.getAttribute('data-tab') == idx);
        });
        var target = Array.prototype.find.call(groupEls, function(g){ return g.getAttribute('data-group') == idx; });
        if(target){
            var first = target.querySelector('input[name="type2"]');
            if(first && !first.checked){ first.checked = true; }
        }
        syncActive();
    }
    tabs.forEach(function(t){
        t.addEventListener('click', function(){ showGroup(t.getAttribute('data-tab')); });
    });
    groupEls.forEach(function(g){
        g.querySelectorAll('input[name="type2"]').forEach(function(el){
            el.addEventListener('change', syncActive);
        });
    });
    showGroup(0);

    // 点击弹窗区域外关闭（无暗色遮罩，手动实现；全局标志避免重复绑定）
    if (!window.__svOutsideCloseBound) {
        window.__svOutsideCloseBound = true;
        document.addEventListener('click', function(e){
            var m = document.getElementById('search-modal');
            if (!m || !m.classList.contains('show')) return;
            var content = m.querySelector('.modal-content');
            // 仅在弹窗内容（.modal-content）内部点击才不关闭；
            // data-backdrop=false 时 .modal 容器透明覆盖全屏，点其空白区或页面其它区域都应关闭
            if (content && content.contains(e.target)) return;
            var trig = document.querySelector('[data-target="#search-modal"]');
            if (trig && trig.contains(e.target)) return;
            if (window.jQuery) window.jQuery('#search-modal').modal('hide');
            else if (window.$) window.$('#search-modal').modal('hide');
            else { m.classList.remove('show'); m.style.display = 'none'; }
        });
    }

    // ESC 关闭（document 级监听，不依赖焦点是否在弹窗内；全局标志避免重复绑定）
    if (!window.__svEscBound) {
        window.__svEscBound = true;
        document.addEventListener('keydown', function(e){
            var m = document.getElementById('search-modal');
            if (!m || !m.classList.contains('show')) return;
            if (e.key === 'Escape' || e.keyCode === 27) {
                if (window.jQuery) window.jQuery('#search-modal').modal('hide');
                else if (window.$) window.$('#search-modal').modal('hide');
                else { m.classList.remove('show'); m.style.display = 'none'; }
            }
        });
    }
})();
</script>`; },

    getModalDefaultHtml() {
        return `<style>
#search-modal .modal-content{background:rgba(22,30,40,0.92)!important;border:none!important;border-radius:12px!important;box-shadow:0 10px 40px rgba(0,0,0,0.45)!important}
#search-modal .modal-body{background:transparent!important;padding:16px 24px}
#search-modal .modal-dialog{position:fixed!important;top:auto!important;right:0!important;left:auto!important;margin:0!important;width:340px!important;max-width:90vw!important;transform:none!important}
#search-modal .super-search-fm{background:transparent!important;border:none;box-shadow:none;padding:0;text-align:center;display:flex!important;flex-wrap:nowrap!important;align-items:center!important;justify-content:center!important;gap:8px!important}
#search-modal #search button{position:static!important;width:auto!important;height:auto!important;margin:0 0 0 8px!important;background:transparent!important;border:none!important;color:rgba(255,255,255,0.5)!important;cursor:pointer;font-size:18px;padding:4px;flex:0 0 auto;line-height:normal!important}
#search-modal .search-key{background:rgba(255,255,255,0.12)!important;border:1px solid rgba(255,255,255,0.25)!important;color:#fff!important;border-radius:24px!important;padding:10px 20px!important;font-size:15px!important;display:inline-block!important;width:auto!important;min-width:160px}
#search-modal .submit{background:transparent!important;border:none;color:rgba(255,255,255,0.7)!important;font-size:18px!important;padding:4px 10px!important;margin-left:8px!important}
.modal-search-tabs{display:flex;flex-wrap:wrap;gap:6px 16px;justify-content:center;margin-bottom:10px}
.modal-search-tab{cursor:pointer;font-size:13px;color:#ccc;padding:2px 8px;border-radius:4px;border-bottom:2px solid transparent}
#search-modal .super-search-fm .submit{background:transparent!important;border:none!important;color:rgba(255,255,255,0.5)!important;cursor:pointer;font-size:18px;margin-left:8px;padding:4px;vertical-align:middle}
body.modal-open{overflow:auto!important;padding-right:0!important}
</style>
<div class="modal-search-tabs">
<label for="m_type-baidu" class="modal-search-tab">常用</label>
<label for="m_type-baidu1" class="modal-search-tab">搜索</label>
</div>
<form action="https://www.baidu.com?s=" method="get" target="_blank" class="super-search-fm">
<input type="text" id="m_search-text" class="form-control smart-tips search-key"
    zhannei="" placeholder="输入关键字搜索" autocomplete="off">
<button class="submit" type="submit" style="background:transparent;border:none;margin-left:8px;padding:4px;color:rgba(255,255,255,0.5);cursor:pointer;font-size:18px;vertical-align:middle;flex:0 0 auto"><i class="iconfont icon-search"></i></button>
</form>
<ul id="m_search-list" style="list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:6px 18px;justify-content:center">
<li><input checked="" hidden="" type="radio" name="type2" id="m_type-baidu" value="https://www.baidu.com/s?wd=" data-placeholder="百度一下，你就知道"><label for="m_type-baidu"><span>百度</span></label></li>
<li><input hidden="" type="radio" name="type2" id="m_type-bing" value="https://cn.bing.com/search?q=" data-placeholder="微软必应搜索"><label for="m_type-bing"><span>必应</span></label></li>
</ul>
<script>
(function(){
    function positionDialog(){
        var dialog = document.querySelector('#search-modal .modal-dialog');
        if(!dialog) return;
        var trigger = document.querySelector('[data-target="#search-modal"]') || window.__svSearchTrigger || null;
        if(!trigger || !trigger.getBoundingClientRect) return;
        var r = trigger.getBoundingClientRect();
        dialog.style.setProperty('top', (r.bottom + 12) + 'px', 'important');
    }
    var smEl = document.getElementById('search-modal');
    if(smEl){ smEl.addEventListener('shown.bs.modal', positionDialog); }

    // 点击弹窗区域外关闭（与主路径共用全局标志，只绑定一次）
    if (!window.__svOutsideCloseBound) {
        window.__svOutsideCloseBound = true;
        document.addEventListener('click', function(e){
            var m = document.getElementById('search-modal');
            if (!m || !m.classList.contains('show')) return;
            var content = m.querySelector('.modal-content');
            // 仅在弹窗内容（.modal-content）内部点击才不关闭；
            // data-backdrop=false 时 .modal 容器透明覆盖全屏，点其空白区或页面其它区域都应关闭
            if (content && content.contains(e.target)) return;
            var trig = document.querySelector('[data-target="#search-modal"]');
            if (trig && trig.contains(e.target)) return;
            if (window.jQuery) window.jQuery('#search-modal').modal('hide');
            else if (window.$) window.$('#search-modal').modal('hide');
            else { m.classList.remove('show'); m.style.display = 'none'; }
        });
    }

    // ESC 关闭（document 级监听，不依赖焦点是否在弹窗内；全局标志避免重复绑定）
    if (!window.__svEscBound) {
        window.__svEscBound = true;
        document.addEventListener('keydown', function(e){
            var m = document.getElementById('search-modal');
            if (!m || !m.classList.contains('show')) return;
            if (e.key === 'Escape' || e.keyCode === 27) {
                if (window.jQuery) window.jQuery('#search-modal').modal('hide');
                else if (window.$) window.$('#search-modal').modal('hide');
                else { m.classList.remove('show'); m.style.display = 'none'; }
            }
        });
    }
})();
</script>`; },

    /**
     * 生成背景图样式
     * 背景图：直接以 background-image: url() 形式写入 style
     */
    generateBgStyle(background) {
        if (!background) return '';
        if (background.type === 'none' || !background.url) return '';
        // 静态图片直接写 URL；如果是 bing/unsplash 这类动态壁纸 API，则每次刷新换图
        return `background-image: url('${this.escapeAttr(background.url)}'); background-size: cover; background-position: center; background-repeat: no-repeat;`;
    },

    // 判断背景是否为「浅色壁纸」（浅底需把 hero 搜索区文字/图标改为深墨色保证可读）
    isLightBackground(background) {
        if (!background || !background.url) return false;
        try {
            const list = (this.allWallpapers && this.allWallpapers.value) ? this.allWallpapers.value : (this.allWallpapers || []);
            const w = list.find(x => x.url === background.url);
            if (!w || !w.group) return false;
            const groups = (this.bgPresetGroups && this.bgPresetGroups.value) ? this.bgPresetGroups.value : (this.bgPresetGroups || []);
            const g = groups.find(x => x.key === w.group);
            return !!(g && g.light);
        } catch (e) { return false; }
    },

    /**
     * 将引擎名转为安全 id
     */
    sanitizeId(name) {
        return (name || 'e').toString().toLowerCase().replace(/[^a-z0-9]/g, '');
    },

    generateSidebar(categories) {
        let html = '';
        categories.forEach(cat => {
            const children = (cat && Array.isArray(cat.children)) ? cat.children : [];
            const hasSubs = children.length > 1 || (children.length === 1 && children[0].name !== cat.name);
            const ic = cat.iconColor || '#b2b8be';
            const icStyle = ` style="color:${this.escapeAttr(ic)}!important"`;
            const isImgIcon = (v) => { const s = (v || '').trim(); return s.startsWith('<svg') || /^https?:|data:|ftp:|\/|\.\/|\.\.\//i.test(s) || /\.svg(\?|#|$)/i.test(s); };
            const catIconHtml = isImgIcon(cat.icon)
                ? `<img src="${this.escapeAttr(cat.icon)}" class="cat-icon-img" style="width:1.25em;height:1.25em;object-fit:contain;vertical-align:middle;margin-right:.5rem;border-radius:4px">`
                : `<i class="${this.escapeAttr(cat.icon)} fa-lg icon-fw icon-lg mr-2"${icStyle}></i>`;

            if (hasSubs) {
                // 有子分类
                let subHtml = '';
                children.forEach(sub => {
                    subHtml += `\n\n                                            <li><a href="#${sub.id}" class="smooth"><span>${this.escape(sub.name)}</span></a></li>`;
                });
                html += `
                                    <li class="sidebar-item">
                                        <a href="#${cat.id}" class="smooth change-href" data-change="#${cat.id}">
                                            ${catIconHtml}
                                            <span>${this.escape(cat.name)}</span>
                                            <i class="iconfont icon-arrow-r-m sidebar-more text-sm"></i>
                                        </a>
                                        <ul>${subHtml}

                                        </ul>
                                    </li>`;
            } else {
                // 无子分类（单分组）
                const subId = children[0]?.id || cat.id;
                html += `
                                    <li class="sidebar-item">
                                        <a href="#${subId}" class="smooth">
                                            ${catIconHtml}
                                            <span>${this.escape(cat.name)}</span>
                                        </a>
                                    </li>`;
            }
        });
        return html;
    },

    generateContent(categories) {
        let html = '';
        categories.forEach(cat => {
            const children = (cat && Array.isArray(cat.children)) ? cat.children : [];
            // continueView: 该分类的标题与上方分类紧贴（不加大间距）
            const isContinue = !!cat.continueView;
            const headerClass = isContinue ? 'text-gray text-lg mb-2' : 'text-gray text-lg mb-4';

            children.forEach((sub, subIdx) => {
                // 如果有多个子分类，每个子分类单独一个区块；只有一个子分类时也显示
                const showHeader = children.length > 1 || subIdx === 0;
                if (!showHeader) return;

                const headerId = sub.id;
                // 标题一律使用子分类名：单子分类时右侧也显示子分类名（而非主分类名）
                const headerName = sub.name || cat.name;
                const headerIcon = '<i class="site-tag iconfont icon-tag icon-lg mr-1"></i>';
                // 第一个子分类的锚点额外标记 data-cat-id，使侧边栏主分类链接（#cat.id）也能定位到这里
                const catIdAttr = subIdx === 0 ? ` data-cat-id="${this.escapeAttr(cat.id)}"` : '';

                html += `
            <div class="d-flex flex-fill">
                <h4 class="${headerClass}">
                    <i class="site-tag iconfont icon-tag icon-lg mr-1" id="${headerId}"${catIdAttr}></i>
                    ${this.escape(headerName)}
                </h4>
            </div>
            <div class="row">`;

                const sites = (sub && Array.isArray(sub.sites)) ? sub.sites : [];
                sites.forEach(site => {
                    html += this.generateCard(site);
                });

                html += `
            </div>
            <br />`;
            });
        });
        return html;
    },

    generateCard(site) {
        const bgType = site.bgType || 'image';
        const bgColor = site.bgColor || '';
        const bgText = site.bgText || '';

        let logoHtml = '';
        if (bgType === 'image') {
            const logoPath = site.logo || 'assets/images/logos/default.webp';
            const encodedLogo = Utils.encodeLogoPath(logoPath);
            const safeLogo = encodedLogo.replace(/'/g, "\\'");
            const fbIcon = (site.fallbackIcon || 'fas fa-link').replace(/"/g, '&quot;');
            const onerror = "this.style.display='none';var n=this.nextElementSibling;if(n){n.style.display='inline-flex';}";
            logoHtml = `<span style="display:inline-flex;align-items:center;justify-content:center;width:100%;height:100%">
                                <img loading="lazy" src="${safeLogo}" onerror="${onerror}"
                                     alt="${this.escapeAttr(site.name)}" style="width:100%;height:100%;object-fit:contain">
                                <i class="${fbIcon}" style="display:none;font-size:20px;color:#8a94a6" aria-hidden="true"></i>
                            </span>`;
        } else if (bgType === 'color') {
            const letter = this.escape((site.name || '?').charAt(0).toUpperCase());
            const color = this.escapeAttr(bgColor || '#4A90D9');
            logoHtml = `<div class="url-img-bgcolor" style="width:100%;height:100%;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:bold;color:#fff;flex-shrink:0">${letter}</div>`;
        } else if (bgType === 'text') {
            const text = this.escape(bgText || (site.name || '?').charAt(0).toUpperCase());
            const color = this.escapeAttr(bgColor || '#597ef7');
            logoHtml = `<div class="url-img-bgcolor" style="width:100%;height:100%;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:bold;color:#fff;flex-shrink:0">${text}</div>`;
        } else if (bgType === 'svg') {
            const logo = site.logo || '';
            if (logo.trim().startsWith('<svg') || logo.trim().startsWith('<?xml')) {
                logoHtml = logo; // 内联 SVG（原始文本）
            } else {
                const safeLogo = this.escapeAttr(logo);
                logoHtml = `<img loading="lazy" src="${safeLogo}" onerror="this.style.display='none'" alt="${this.escapeAttr(site.name)}">`;
            }
        } else if (bgType === 'url') {
            const safeLogo = this.escapeAttr(site.logo || '');
            logoHtml = `<img loading="lazy" src="${safeLogo}" onerror="this.style.display='none'" alt="${this.escapeAttr(site.name)}">`;
        }

        // 网站卡片闪烁效果（背景色填充整个白色卡片区域）
        let blinkAttr = '', blinkClass = '';
        if (site.blink && site.blink.enabled) {
            const b = site.blink;
            const count = parseInt(b.count) || 3;
            const dur = parseInt(b.duration) || 300;
            const interval = parseInt(b.interval) || 150;
            const color = (b.color || '#ff6b6b').replace(/#/g, '');
            const mode = b.mode || 'count';
            const cycle = dur + interval;
            const onPct = Math.max(1, Math.min(99, Math.round(dur / cycle * 100)));
            const iters = mode === 'continuous' ? 'infinite' : count;
            const animName = '_scBlink_' + (this._blinkIdx || 0);
            this._blinkIdx = (this._blinkIdx || 0) + 1;
            blinkClass = 'site-card-blink';
            blinkAttr = ` data-blink-anim="${animName}" data-blink-cycle="${cycle}"`;
            // 收集闪烁 keyframes：背景色填充动画，作用于 .site-card-blink 内的 .card 元素
            if (!this._blinkKeyframes) this._blinkKeyframes = [];
            this._blinkKeyframes.push(`@keyframes ${animName}{0%{background-color:transparent}${onPct}%{background-color:#${color}30}100%{background-color:transparent}}`);
            this._blinkStyles = this._blinkStyles || {};
            this._blinkStyles[animName] = `${cycle}ms ease-in-out ${iters}`;
        }

        return `
                <div class="url-card col-6  col-sm-6 col-md-4 col-xl-5a col-xxl-6a${blinkClass ? ' '+blinkClass : ''}"${blinkAttr}>
                    <div class="url-body default">
                        <a href="${this.escapeAttr(this.normalizeLink(site.url))}" target="_blank" data-id="" data-url="${this.escapeAttr(this.normalizeLink(site.url))}"
                            class="card no-c mb-4" data-toggle="tooltip" data-placement="bottom" data-original-title="${this.escapeAttr(site.description)}">
                            <div class="card-body">
                                <div class="url-content d-flex align-items-center">
                                    <div class="url-img mr-2 d-flex align-items-center justify-content-center">
                                            ${logoHtml}
                                    </div>
                                    <div class="url-info flex-fill">
                                        <div class="text-sm overflowClip_1">
                                            <strong>${this.escape(site.name)}</strong>
                                        </div>
                                        <p class="overflowClip_1 m-0 text-muted text-xs">${this.escape(site.description)}</p>
                                    </div>
                                </div>
                            </div>
                        </a>
                        <a href="${this.escapeAttr(this.normalizeLink(site.url))}" class="togo text-center text-muted is-views" data-id="689"
                            data-toggle="tooltip" data-placement="right" title="直达" rel="nofollow">
                            <i class="iconfont icon-goto"></i>
                        </a>
                    </div>
                </div>`;
    },

    generateFriendLinks(links) {
        if (!links || links.length === 0) return '';
        let html = `
    <h4 class="text-gray text-lg mb-4">
        <i class="iconfont icon-book-mark-line icon-lg mr-2" id="friendlink"></i>友情链接
    </h4>
    <div class="friendlink text-xs card">
        <div class="card-body">`;
        links.forEach(link => {
            html += `\n\t    <a href="${this.escapeAttr(this.normalizeLink(link.url))}" title="${this.escapeAttr(link.title || link.name)}" target="_blank">${this.escape(link.name)}</a>`;
        });
        html += `
        </div>
    </div>`;
        return html;
    },

    /**
     * 默认 footer（与原 WebStack 站点一致）
     */
    defaultFooter() {
        return {
            domain: '',
            note: '本站内容来自于网络，不对网站内容负责',
            copyright: '@2025 By',
            copyrightName: 'NavEditor',
            copyrightUrl: 'https://github.com/yiming2016/NavEditor',
            beian: '粤ICP备xxxx号',
            beianUrl: 'https://beian.miit.gov.cn/#/Integrated/recordQuery',
            gongan: '粤公网安备xxxx号',
            gonganUrl: 'https://beian.mps.gov.cn/#/query/webSearch'
        };
    },

    /**
     * 把 footer 数据渲染为 footer-text HTML
     * 字段为空时自动隐藏该段
     */
    renderFooterHtml(footer) {
        const f = footer || this.defaultFooter();
        const parts = [];
        if (f.note && f.note.trim()) {
            parts.push(this.escape(f.note));
        }
        const linkParts = [];
        if (f.copyrightName && f.copyrightName.trim()) {
            const txt = (f.copyright ? this.escape(f.copyright) + ' ' : '') +
                (f.copyrightUrl && f.copyrightUrl.trim()
                    ? `<a href="${this.escapeAttr(this.normalizeLink(f.copyrightUrl))}" target="_blank" rel="noopener">${this.escape(f.copyrightName)}</a>`
                    : this.escape(f.copyrightName));
            linkParts.push(txt);
        }
        if (f.beian && f.beian.trim()) {
            const url = this._beianQueryUrl(f.beianUrl, 'domain', f.domain);
            linkParts.push(url
                ? `<a href="${this.escapeAttr(this.normalizeLink(url))}" target="_blank" rel="noopener">${this.escape(f.beian)}</a>`
                : this.escape(f.beian));
        }
        if (f.gongan && f.gongan.trim()) {
            const digits = String(f.gongan).replace(/\D/g, '');
            const url = this._beianQueryUrl(f.gonganUrl, 'code', digits);
            const inner = `<img class="beian-gongan-logo" src="${this.GONGAN_LOGO}" alt="公安备案" style="display:inline-block;vertical-align:middle;width:12px;height:auto;margin-right:3px"/>${this.escape(f.gongan)}`;
            linkParts.push(url
                ? `<a href="${this.escapeAttr(this.normalizeLink(url))}" target="_blank" rel="noopener">${inner}</a>`
                : inner);
        }
        if (linkParts.length) parts.push(linkParts.join(' | '));
        return parts.join('<br/>');
    },

    // 公安联网备案官方图标（本地化，随 assets 一并部署）
    GONGAN_LOGO: 'assets/images/gongan.png',

    // 在备案查询链接上追加查询参数（自动替换同名参数），用于直达当前网站备案查询
    _beianQueryUrl(base, name, value) {
        const u = (base || '').trim();
        const v = (value == null ? '' : String(value)).trim();
        if (!u || !v) return u;
        const clean = u.replace(new RegExp('[?&]' + name + '=[^&]*', 'i'), '');
        const sep = clean.indexOf('?') >= 0 ? '&' : '?';
        return clean + sep + name + '=' + encodeURIComponent(v);
    },

    // === 广告位：构建单侧轨道 HTML（hero 区域内 2×2 网格布局）===
    // side: 'left' | 'right'
    // 4 个 slot 按 2行×2列 排列：
    //   slot0(左上)  slot1(右上)
    //   slot2(左下)  slot3(右下)
    buildAdRail(side, adSlots) {
        const slots = (adSlots && adSlots[side]) || [];
        if (!slots.length) return '';
        const hasAnyContent = slots.some(s =>
            (s.type === 'image' && s.image && String(s.image).trim())
        );
        if (!hasAnyContent) return '';
        const adW = (adSlots.width && Number(adSlots.width) > 0) ? Number(adSlots.width) : 380;
        const adH = (adSlots.height && Number(adSlots.height) > 0) ? Number(adSlots.height) : 49;
        let html = `<aside class="ad-rail ad-rail-${side}"><div class="ad-grid">\n`;
        // 固定 2×2 位置
        const positions = [
            { col: '1/2', row: '1/2' },  // 左上
            { col: '2/3', row: '1/2' },  // 右上
            { col: '1/2', row: '2/3' },  // 左下
            { col: '2/3', row: '2/3' }   // 右下
        ];
        slots.forEach((s, i) => {
            if (i >= 4) return;
            const hasImg = s.type === 'image' && s.image && String(s.image).trim();
            if (!hasImg) return;
            // 图片闪烁（方案A：透明度变化）：闪烁动画直接作用在 <img> 上
            const hasBlink = hasImg && s.blink && s.blink.enabled;
            const blinkClass = hasBlink ? ` ad-blink-${side}-${i}` : '';
            // 广告图 src：SVG 文本需转成 data URI 才能在 <img> 中渲染；其余原样
            const _isSvg = s.image && /^\s*<svg/i.test(s.image);
            const _imgSrc = _isSvg ? 'data:image/svg+xml,' + encodeURIComponent(s.image) : s.image;
            const _fit = (s.fit === 'cover') ? 'cover' : 'contain';
            const inner = `<img src="${this.escapeAttr(_imgSrc)}" alt="广告" class="ad-img${blinkClass}" loading="lazy" style="object-fit:${_fit}">`;
            const pos = positions[i];
            let styleAttr = `grid-column:${pos.col};grid-row:${pos.row};`;
            // 每个广告格都写入明确的宽高，避免全局尺寸与裁剪输出尺寸不一致导致图片被拉伸
            const effW = (!adSlots.unifiedSize && (s.width || s.height)) ? (Number(s.width) || adW) : adW;
            const effH = (!adSlots.unifiedSize && (s.width || s.height)) ? (Number(s.height) || adH) : adH;
            styleAttr += `width:${effW}px;height:${effH}px;justify-self:start;align-self:start;`;
            if (s.url) styleAttr += 'cursor:pointer;';
            html += `\n    <div class="ad-slot" style="${styleAttr}"${(s.url)?` onclick="window.open('${this.escapeAttr(this.normalizeLink(s.url))}','_blank')"`:''}>${inner}</div>`;
        });
        html += `\n</div></aside>`;
        return html;
    },

    // === 广告位：构建 CSS（含闪烁 keyframes）—— hero 区域内 2×2 网格布局 ===
    buildAdCss(adSlots) {
        if (!adSlots) return '';
        const adW = (adSlots.width && Number(adSlots.width) > 0) ? Number(adSlots.width) : 380;
        const adH = (adSlots.height && Number(adSlots.height) > 0) ? Number(adSlots.height) : 49;
        let css = `
    /* ad-rail: 2x2 网格，放在 hero 区域两侧，横向长方形卡片（尺寸可自定义）
       adSlots.width/height 现在直接表示单个格子的尺寸，轨道总宽 = 格宽 × 2 */
    .ad-rail{position:absolute;top:32px;width:${adW * 2}px;display:flex;padding:26px 0 0 0;}
    .ad-rail-left{left:0;}
    .ad-rail-right{right:0;}
    .ad-grid{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:auto auto;gap:0;width:100%;}
    .ad-slot{position:relative;overflow:hidden;border-radius:8px;background:transparent;width:100%;height:${adH}px;box-shadow:0 1px 4px rgba(0,0,0,.1);border:1px solid rgba(0,0,0,.06);}
    .ad-img{width:100%;height:100%;object-fit:contain;display:block;}`;
        // 闪烁 keyframes（方案A：插入的图片本身按透明度闪烁，亮起时不透明、间隔时降到设定透明度）
        // 采用无限循环：避免编辑器实时预览在响应式重算时动画被反复从 0 帧重启而「看起来不动」，
        // 同时广告位本就适合持续闪烁以吸引注意；interval 控制变暗保持时长，duration 控制亮起时长。
        const addBlink = (side, i, b) => {
            const dur = Number(b.duration) || 300;
            const interval = Number(b.interval) || 150;
            const cycle = dur + interval;
            const onPct = Math.max(1, Math.min(99, Math.round(dur / cycle * 100)));
            const dim = (b.opacity != null) ? Number(b.opacity) : 0.5;
            css += `\n    @keyframes _adBlink_${side}_${i}{0%{opacity:1;filter:brightness(1.25)}${onPct}%{opacity:1;filter:brightness(1.25)}${onPct}%{opacity:${dim};filter:brightness(.7)}100%{opacity:${dim};filter:brightness(.7)}}`;
            css += `\n    .ad-img.ad-blink-${side}-${i}{animation:_adBlink_${side}_${i} ${cycle}ms ease-in-out infinite;}`;
        };
        ['left', 'right'].forEach(side => {
            (adSlots[side] || []).forEach((s, i) => {
                if (s.type === 'image' && s.blink && s.blink.enabled && s.image) addBlink(side, i, s.blink);
            });
        });
        css += '\n';
        return `<style>/* ad-rail */${css}</style>`;
    },

    wrapTemplate(site, sidebarHtml, contentHtml, friendLinkHtml, searchHtml, bgStyle, bottomBgStyle = '', blinkCss = '', dailyText = null, adSlots = null, searchConfig = null, footerBgStyle = '', bgLight = false, aboutTemplate = '页脚/关于导航') {
        // 收起时的 Logo：优先使用独立的"收起 Logo"，未设置则回退到展开 Logo
        const logoCollapsedLight = site.logoCollapsedLight || site.logoLight;
        const sidebarTitle = site.sidebarTitle || site.title || '网址导航';
        // 侧边栏标题样式
        const sidebarTitleStyle = site.sidebarTitleStyle || {};
        const tsParts = [];
        if (sidebarTitleStyle.bold) tsParts.push('font-weight:bold');
        if (sidebarTitleStyle.italic) tsParts.push('font-style:italic');
        if (sidebarTitleStyle.fontFamily) tsParts.push(`font-family:${this.escapeAttr(sidebarTitleStyle.fontFamily)},sans-serif`);
        if (sidebarTitleStyle.fontSize) tsParts.push(`font-size:${this.escapeAttr(sidebarTitleStyle.fontSize)}`);
        if (sidebarTitleStyle.color) tsParts.push(`color:${this.escapeAttr(sidebarTitleStyle.color)}`);
        const titleStyle = tsParts.length ? ` style="${tsParts.join(';')};"` : '';
        // 广告位：仅在启用且有实际内容时渲染（放在顶部 hero 区域两侧）
        const adEnabled = !!(adSlots && adSlots.enabled);
        const adLeftHtml = adEnabled ? this.buildAdRail('left', adSlots) : '';
        const adRightHtml = adEnabled ? this.buildAdRail('right', adSlots) : '';
        const adCss = (adEnabled && (adLeftHtml || adRightHtml)) ? this.buildAdCss(adSlots) : '';
        const hasAnyRail = !!adLeftHtml || !!adRightHtml;
        // hero 区域广告位包裹标记（用于模板中条件渲染）
        const adHeroLeft = adLeftHtml;
        const adHeroRight = adRightHtml;
        // 访客页面左侧边栏背景（覆盖外联 CSS 的默认 #2c2e2f）
        const sidebarBgStyle = (() => {
            const sb = site.sidebarBackground;
            if (!sb || sb.type === 'none' || (sb.type === 'image' && !sb.url)) {
                if (sb && sb.type === 'none') return 'background:transparent;';
                return ''; // 未设置：沿用外联默认 #2c2e2f
            }
            if (sb.type === 'color') return `background:${sb.color || '#ffffff'};`;
            const fit = sb.fit === 'contain' ? 'contain' : 'cover';
            return `background-image:url('${this.escapeAttr(sb.url)}');background-size:${fit};background-position:center;background-repeat:no-repeat;background-color:#ffffff;`;
        })();
        // 收起侧边时背景（仅图片；未设置则沿用展开背景）
        const sidebarBgCollapsedStyle = (() => {
            const sb = site.sidebarBackgroundCollapsed;
            if (!sb || !sb.url) return '';
            return `background-image:url('${this.escapeAttr(sb.url)}');background-size:cover;background-position:center;background-repeat:no-repeat;background-color:#ffffff;`;
        })();
        // 同时输出展开/收起两套规则；访客页侧边栏加上 .mini-sidebar 类时自动切换为收起背景
        // 注意：背景不能写进 #sidebar 的内联 style，否则内联样式优先级会盖住 #sidebar.mini-sidebar 的规则，
        // 导致收起侧边时收起背景不生效。统一放到 <style> 块、作用于 .sidebar-nav-inner 后代元素。
        // 侧边栏宽度跟随用户设置的输出尺寸宽度，实现背景宽度与侧边栏宽度一致。
        const expandW = site.sidebarBackground && site.sidebarBackground.width ? parseInt(site.sidebarBackground.width, 10) || 170 : 170;
        const collapsedW = site.sidebarBackgroundCollapsed && site.sidebarBackgroundCollapsed.width ? parseInt(site.sidebarBackgroundCollapsed.width, 10) || 60 : 60;
        const sidebarWidthCss = `<style>
            #sidebar{width:${expandW}px!important}
            #sidebar .sidebar-nav-inner{max-width:${expandW}px!important}
            .main-content{margin-left:${expandW}px!important}
            .page-header{left:${expandW}px!important}
            #sidebar.mini-sidebar{width:${collapsedW}px!important}
            #sidebar.mini-sidebar .sidebar-nav-inner{max-width:${collapsedW}px!important}
            .mini-sidebar .sidebar-menu{width:${collapsedW}px!important}
            .mini-sidebar ul:first-child>li.sidebar-item>a span{display:none!important}
            .sidebar-nav.show .top-menu{display:inherit!important}
            .sidebar-nav.mini-sidebar+.main-content{margin-left:${collapsedW}px!important}
            .sidebar-nav.mini-sidebar+.main-content .page-header{left:${collapsedW}px!important}
        </style>`;
        const sidebarBgInnerCss = (sidebarBgStyle || sidebarBgCollapsedStyle)
            ? `<style>#sidebar .sidebar-nav-inner{${sidebarBgStyle}}${sidebarBgCollapsedStyle ? '#sidebar.mini-sidebar .sidebar-nav-inner{' + sidebarBgCollapsedStyle + '}' : '#sidebar.mini-sidebar .sidebar-nav-inner{' + sidebarBgStyle + '}'}</style>`
            : '';
        const sidebarBgCss = `${sidebarBgInnerCss}${sidebarWidthCss}`;
        // 下拉菜单背景（纯色）：区分未折叠态与折叠态
        const popupBgExpanded = site.sidebarPopupBackgroundExpanded || site.sidebarPopupBackground || '#151618';
        const popupBgCollapsed = site.sidebarPopupBackgroundCollapsed || site.sidebarPopupBackground || '#151618';
        const popupBgCss = `<style>
            .sidebar-item>ul{background:${popupBgExpanded}!important}
            .sidebar-item>ul>li{background:${popupBgExpanded}!important}
            .sidebar-popup.second div{background:${popupBgCollapsed}!important}
            .sidebar-popup.second::before{border-color:transparent ${popupBgCollapsed} transparent!important}
            .sidebar-popup.second.sidebar-menu-inner ul li{background:${popupBgCollapsed}!important}
        </style>`;
        // 访客页面侧栏文字颜色（覆盖外联 CSS 的默认 #b2b8be）
        const textColor = site.sidebarTextColor || '#b2b8be';
        const sidebarTextCss = `<style>
            .sidebar-nav .flex-bottom a,.sidebar-menu-inner a{color:${textColor}!important}
            .sidebar-item>a>span{color:${textColor}!important}
            .sidebar-item>a>i{color:#b2b8be!important}
        </style>`;
        return `<!DOCTYPE html>
<html lang="zh-CN">

<head>
    <meta name="generator" content="Hugo 0.121.0">

    <meta charset="UTF-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge, chrome=1" />
    <meta name="viewport"
        content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <meta name="theme-color" content="#f9f9f9" />
    <title>${this.escape(site.title)}</title>
    <link rel="shortcut icon" href="${this.escapeAttr(site.favicon || '')}" />
    <meta name="keywords" content="${this.escapeAttr(site.keywords)}" />
    <meta name="description" content="${this.escapeAttr(site.description)}" />

    <link rel="stylesheet" id="block-library-css"
        href="./assets/css/block-library.min-5.6.2.css" type="text/css" media="all" />
    <link rel="stylesheet" id="iconfont-css" href="./assets/css/iconfont-3.03029.1.css"
        type="text/css" media="all" />
    <link rel="stylesheet" id="bootstrap-css" href="./assets/css/bootstrap.min-4.3.1.css"
        type="text/css" media="all" />
    <link rel="stylesheet" id="fancybox-css" href="./assets/css/fancybox.min-3.5.7.css"
        type="text/css" media="all" />
    <link rel="stylesheet" id="iowen-css" href="./assets/css/style-3.03029.1.css"
        type="text/css" media="all" />
    <link rel="stylesheet" id="custom-css" href="./assets/css/custom-style.css"
        type="text/css" media="all" />
    <link rel="stylesheet" id="fortawesome-css" href="./assets/fontawesome-5.15.4/css/all.min.css" type="text/css" />
    <script type="text/javascript" src="./assets/js/jquery.min-3.2.1.js" id="jquery-js"></script>
    <script type="text/javascript" src="./assets/js/content-search.js"  id="content-search-js"></script>


${blinkCss}
${sidebarBgCss}
${popupBgCss}
${sidebarTextCss}
${adCss}
    <style>
        /* 页脚背景层：stickFooter() 会清空 <footer> 的 style，把背景放到内部层避免被清除 */
        /* 页脚缩矮：减小 padding 让 footer 自然变矮（约原等高 227px 的 50%），备案信息不被裁 */
        /* 用 footer.main-footer 确保特异性高于外联 style.css 的 footer.main-footer{padding:20px} */
        footer.main-footer { position: relative; padding: 6px 30px; }
        .footer-bg-layer { position: absolute; inset: 0; z-index: 0; pointer-events: none; background-size: cover; background-position: center; }
        /* footer-inner 需 z-index:1 在 bg-layer 上方；#footer-tools 保留外联的 position:fixed，只加 z-index */
        .main-footer .footer-inner { position: relative; z-index: 1; }
        #footer-tools { z-index: 1; }
    </style>
</head>



<body>

<div class="page-container">

	<div id="sidebar" class="sticky sidebar-nav fade animate-nav">

            <div class="modal-dialog h-100 sidebar-nav-inner">
                <div class="sidebar-logo border-bottom border-color">

                    <div class="logo overflow-hidden">
                        <a href="javascript:void(0)" onclick="window.scrollTo(0,0);return false" class="logo-expanded">
                            <img src="${this.escapeAttr(site.logoLight)}" height="40" class="logo-light"${site.logoLight ? '' : ' style="display:none"'}
                                alt="${this.escapeAttr(sidebarTitle)}">
                            <span class="logo-text"${titleStyle}>${this.escape(sidebarTitle)}</span>
                        </a>
                        <a href="javascript:void(0)" onclick="window.scrollTo(0,0);return false" class="logo-collapsed">
                            <img src="${this.escapeAttr(logoCollapsedLight)}" height="40" class="logo-light"${logoCollapsedLight ? '' : ' style="display:none"'}
                                alt="${this.escapeAttr(sidebarTitle)}">
                        </a>
                    </div>

                </div>
                <div class="sidebar-menu flex-fill">
                    <div class="sidebar-scroll">
                        <div class="sidebar-menu-inner">
                            <ul>
${sidebarHtml}


                            </ul>
                        </div>
                    </div>
                </div>
                <div class="border-top py-2 border-color">
                    <div class="flex-bottom">
                        <ul>
${(function() {
    // 按 footerMenuOrder 顺序合并 menuKeys + 关于导航（关于导航作为 about-link 参与排序）
    const order = site.footerMenuOrder || ['mk-submit', 'mk-friend', 'about-link'];
    const about = site.aboutLink;
    const menuMap = {};
    (site.menuKeys || []).forEach(m => { if (m && m.id) menuMap[m.id] = m; });
    const rendered = new Set();
    const items = [];
    const fm = (site.footerFixedMeta && typeof site.footerFixedMeta === 'object') ? site.footerFixedMeta : {};
    order.forEach(key => {
        if (key === 'about-link') {
            // 与编辑器页脚一致：始终渲染“关于导航”（图标/名称来自 footerFixedMeta，缺失时按默认兜底），
            // 保证编辑器页脚拖拽排序后，访客页左下角同步变化。
            const m = fm['about-link'] || { icon: 'fa fa-info-circle', text: '关于导航', iconColor: '#b2b8be' };
            const aboutUrlRaw = (site.aboutLink && site.aboutLink.url && site.aboutLink.url.trim()) ? site.aboutLink.url.trim() : '';
            let aboutUrl;
            if (!aboutUrlRaw) {
                aboutUrl = 'footer/about.html';
            } else if (/^(https?:|mailto:|tel:|#|\/)/.test(aboutUrlRaw)) {
                aboutUrl = aboutUrlRaw;
            } else if (aboutUrlRaw === 'footer' || aboutUrlRaw === './footer' || aboutUrlRaw === 'footer/' || aboutUrlRaw === './footer/') {
                aboutUrl = 'footer/about.html';
            } else {
                aboutUrl = aboutUrlRaw;
            }
            items.push({
                id: 'about-link',
                icon: m.icon || 'fa fa-info-circle',
                text: m.text || '关于导航',
                iconColor: m.iconColor || '#b2b8be',
                url: aboutUrl,
                target: '_blank'
            });
            rendered.add('about-link');
        } else if (key === 'mk-submit' || key === 'mk-friend') {
            // 固定菜单：即使导入的 menuKeys id 为随机字符串（menuMap 查不到），也用固定文案渲染，
            // 避免导入 index.html 后访客页丢菜单/错序，保证编辑器拖拽排序后左下角同步变化。
            const fixed = (key === 'mk-submit')
                ? { id: 'mk-submit', icon: 'fas fa-file-upload', text: '网站提交', url: 'commit.html', target: '_blank' }
                : { id: 'mk-friend', icon: 'fab fa-staylinked', text: '友情链接', url: '#friendlink', target: '' };
            const fixedMeta = fm[key] || {};
            const fromMap = menuMap[key];
            const item = Object.assign({}, fixed, fromMap || {}, { id: key, iconColor: (fromMap && fromMap.iconColor) || fixedMeta.iconColor || '#b2b8be' });
            if (key === 'mk-submit') {
                // 网站提交页统一指向 footer/commit.html（根目录 commit.html 是历史残留，已废弃）
                let u = (fixedMeta.url && fixedMeta.url.trim()) || 'footer/commit.html';
                if (u === 'commit.html' || u === './commit.html') u = 'footer/commit.html';
                item.url = u;
            }
            items.push(item);
            rendered.add(key);
        } else if (menuMap[key]) {
            const m = menuMap[key];
            items.push({ id: m.id, icon: m.icon || 'fas fa-link', text: m.text, iconColor: m.iconColor || '#b2b8be', url: m.url, target: m.target || '_blank' });
            rendered.add(key);
        } else {
            // 页脚自定义菜单项（用户通过"+"按钮添加，参与拖拽排序，同步访客页左下角）
            const custom = (site.footerMenuItems || []).find(it => it.id === key);
            if (custom) {
                items.push({ id: custom.id, icon: custom.icon || 'fas fa-link', text: custom.text, iconColor: custom.iconColor || '#b2b8be', url: custom.url, target: custom.target || '_blank' });
                rendered.add(key);
            }
        }
    });
    // 注：页脚左下角只渲染 footerMenuOrder 指定的 3 个固定菜单（网站提交/友情链接/关于导航），
    // 不再兜底追加其余 menuKeys——访客页脚须与编辑器页脚（仅 3 个拖拽按钮）完全一致。
    return items.map((m, idx) => {
        const targetAttr = m.target ? ` target="${this.escapeAttr(m.target)}" rel="noopener"` : '';
        const smoothClass = (m.url || '').startsWith('#') ? ' class="smooth"' : '';
        const iconColorStyle = m.iconColor ? ` style="color:${this.escapeAttr(m.iconColor)}!important"` : '';
        return `                            <li id="menu-item-${idx + 1}"
                            class="menu-item menu-item-type-custom menu-item-object-custom menu-item-${idx + 1} sidebar-item">
                            <a href="${this.escapeAttr(m.url)}"${smoothClass}${targetAttr}>
                                <i class="${this.escapeAttr(m.icon)} icon-fw icon-lg mr-2"${iconColorStyle}></i>
                                <span>${this.escape(m.text)}</span></a>
                        </li>`;
    }).join('\n');
}).call(this)}
                        </ul>
                    </div>
                </div>
            </div>
        </div>


<div class="main-content flex-fill">
    <div class="big-header-banner">
        <div id="header" class="page-header sticky">
            <div class="navbar navbar-expand-md">
                <div class="container-fluid p-0">

                    <a href="javascript:void(0)" onclick="window.scrollTo(0,0);return false" class="navbar-brand d-md-none" title="${this.escapeAttr(sidebarTitle)}">
                        <img src="${this.escapeAttr(logoCollapsedLight)}" class="logo-light"${logoCollapsedLight ? '' : ' style="display:none"'}
                            alt="${this.escapeAttr(sidebarTitle)}">
                        <span class="logo-text"${titleStyle}>${this.escape(sidebarTitle)}</span>
                    </a>

                    <div class="collapse navbar-collapse order-2 order-md-1">
                        <div class="header-mini-btn">
                            <label>
                                <input id="mini-button" type="checkbox">
                                <svg viewbox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                                    <path class="line--1" d="M0 40h62c18 0 18-20-17 5L31 55"></path>
                                    <path class="line--2" d="M0 50h80"></path>
                                    <path class="line--3" d="M0 60h62c18 0 18 20-17-5L31 45"></path>
                                </svg>
                            </label>

                        </div>

                        <ul class="navbar-nav site-menu" style="margin-right: 16px;">

			<li >
				<a href="./">
                                    <i class="fa fa-home fa-lg mr-2"></i>
                                    <span>首页</span>
                                </a>
				<ul class="sub-menu">

				</ul>
			    </li>

			<li >
				<a href="footer/about.html">
                                    <i class="fa fa-book fa-lg mr-2"></i>
                                    <span>关于</span>
                                </a>
				<ul class="sub-menu">

				</ul>
			    </li>

			</ul>


                        <div class="rounded-circle weather">
                            <div id="he-plugin-simple" style="display: contents;"></div>
                            <script>WIDGET = {
                                    CONFIG: {
                                        "modules": "01234",
                                        "background": 5,
                                        "tmpColor": "E4C600",
                                        "tmpSize": 14,
                                        "cityColor": "E4C600",
                                        "citySize": 14,
                                        "aqiColor": "#E4C600",
                                        "aqiSize": 14,
                                        "weatherIconSize": 24,
                                        "alertIconSize": 18,
                                        "padding": "10px 10px 10px 10px",
                                        "shadow": "1",
                                        "language": "auto",
                                        "borderRadius": 5,
                                        "fixed": "false",
                                        "vertical": "middle",
                                        "horizontal": "left",
                                        "key": "085791e805a24491b43b06cf58ab31e7"
                                    }
                                }
                            </script>
                            <script src="https://widget.qweather.net/simple/static/js/he-simple-common.js?v=2.0" async></script>
                        </div>

                    </div>

                    <ul class="nav navbar-menu text-xs order-1 order-md-2">


                        <li class="nav-item mr-3 mr-lg-0 d-none d-lg-block">
${(function(){
    const dt = dailyText || { enabled: true, source: 'hitokoto', customText: '', textColor: '#333333' };
    const dtColor = (dt.textColor && String(dt.textColor).trim()) ? String(dt.textColor).trim() : '#333333';
    if (!dt.enabled) return '<div style="display:none"></div>';
    const esc = (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    let script = '', fallbackText = '';
    switch(dt.source) {
        case 'jinrishici':
            script = '<script>fetch("https://v2.jinrishici.com/one.json").then(function(r){return r.json()}).then(function(d){var el=document.getElementById("daily_text_el");if(el){el.innerText=d.data&&d.data.content?d.data.content:"";el.title=(d.data&&d.data.origin)?(d.data.origin.title||""):"";}}).catch(function(){});<'+'/script>';
            fallbackText = '菡萏香销翠叶残，西风愁起绿波间。';
            break;
        case 'iciba':
            script = '<script>fetch("https://open.iciba.com/dsapi/").then(function(r){return r.json()}).then(function(d){var el=document.getElementById("daily_text_el");if(el){el.innerText=((d.note||"")+" "+(d.translation||"")).trim();}}).catch(function(){});<'+'/script>';
            fallbackText = '每日一句，点亮生活。';
            break;
        case 'xygeng':
            script = '<script>fetch("https://api.xygeng.cn/one").then(function(r){return r.json()}).then(function(d){var el=document.getElementById("daily_text_el");if(el&&d.code===200&&d.data){el.innerText=d.data.content||"";}}).catch(function(){});<'+'/script>';
            fallbackText = '人与人之间情断义绝，并不需要什么具体理由。';
            break;
        case 'hitokoto_anime':
            script = '<script>fetch("https://v1.hitokoto.cn/?c=a").then(function(r){return r.json()}).then(function(d){var el=document.getElementById("daily_text_el");if(el){el.href="https://hitokoto.cn/?uuid="+d.uuid;el.innerText=d.hitokoto;}}).catch(console.error);<'+'/script>';
            fallbackText = '我喜欢你，比世界上任何人都喜欢你。';
            break;
        case 'hitokoto_poetry':
            script = '<script>fetch("https://v1.hitokoto.cn/?c=i").then(function(r){return r.json()}).then(function(d){var el=document.getElementById("daily_text_el");if(el){el.href="https://hitokoto.cn/?uuid="+d.uuid;el.innerText=d.hitokoto;}}).catch(console.error);<'+'/script>';
            fallbackText = '花团锦簇的日子用来铭记逝者，那我宁愿被人遗忘。';
            break;
        case 'history_today':
            script = '<script>(function(){try{var d=new Date();var mm=("0"+(d.getMonth()+1)).slice(-2);var dd=("0"+d.getDate()).slice(-2);var key=mm+dd;fetch("https://baike.baidu.com/cms/home/eventsOnHistory/"+mm+".json").then(function(r){return r.json();}).then(function(data){var el=document.getElementById("daily_text_el");if(!el)return;var arr=(data&&data[mm]&&data[mm][key])||[];if(!arr.length)return;var it=arr[Math.floor(Math.random()*arr.length)];var t=(it.title||"").replace(/<[^>]*>/g,"");el.innerText=(it.year?it.year+"年 ":"")+t;}).catch(function(){});}catch(e){}})();<'+'/script>';
            fallbackText = '历史上的今天，重温岁月长河中的闪光时刻。';
            break;
        case 'custom':
            const customEsc = esc(dt.customText);
            if (!customEsc.trim()) return '<div style="display:none"></div>';
            return '<div id="hitokoto"><span id="daily_text_el">' + customEsc + '</span></div>';
        default: // hitokoto
            script = '<script>fetch("https://v1.hitokoto.cn").then(function(r){return r.json()}).then(function(d){var el=document.getElementById("daily_text_el");if(el){el.href="https://hitokoto.cn/?uuid="+d.uuid;el.innerText=d.hitokoto;}}).catch(console.error)<'+'/script>';
            fallbackText = '疏影横斜水清浅，暗香浮动月黄昏。';
            break;
    }
    // hitokoto variants use <a>, others use <span>
    const isLink = ['hitokoto','hitokoto_anime','hitokoto_poetry'].indexOf(dt.source) >= 0;
    const tagOpen = isLink ? `<a href="#" target="_blank" id="daily_text_el" style="color:${dtColor}">` : `<span id="daily_text_el" style="color:${dtColor}">`;
    const tagClose = isLink ? '</a>' : '</span>';
    return script + '<div id="hitokoto">' + tagOpen + esc(fallbackText) + tagClose + '</div>';
})()}


                        <li class="nav-search ml-3 ml-md-4">
                            <a href="javascript:" data-toggle="modal" data-target="#search-modal"><i
                                    class="iconfont icon-search icon-2x"></i></a>
                        </li>
                        <li class="nav-item d-md-none mobile-menu ml-3 ml-md-4">
                            <a href="javascript:" id="sidebar-switch" data-toggle="modal"
                                data-target="#sidebar"><i class="iconfont icon-classification icon-2x"></i></a>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
        <div class="placeholder" style="height:74px"></div>
    </div>


<div class="header-big  post-top css-color${bgLight ? ' bg-light' : ''}" id="search-bg" style="${bgStyle}${hasAnyRail ? ';position:relative;display:flex;align-items:flex-start;justify-content:center;gap:16px;padding:32px 0 0 0' : ''}">
    ${adHeroLeft}
    <div class="s-search"${hasAnyRail ? ' style="flex:1;min-width:0"' : ''}>
        <div id="search" class="s-search mx-auto">
${searchHtml}
            <div class="card search-smart-tips search-hot-text">
                <ul id="word" style="display: none"></ul>
            </div>
        </div>
    </div>
    ${adHeroRight}
</div>


<div id="content" class="content-site customize-site" style="${bottomBgStyle}${hasAnyRail ? ';padding-top:52px' : ''};min-height:100vh;background-attachment:fixed;">

${contentHtml}
${friendLinkHtml}
</div>


        <footer class="main-footer footer-type-1 text-xs">
            <div class="footer-bg-layer" style="${footerBgStyle}"></div>
            <div id="footer-tools" class="d-flex flex-column">
                <a href="javascript:" id="go-to-up" class="btn rounded-circle go-up m-1" rel="go-top">
                    <i class="iconfont icon-to-up"></i>
                </a>
            </div>

            <div class="footer-inner">
                <div class="footer-text">${this.renderFooterHtml(site.footer)}</div>
            </div>
        </footer>

    </div>

</div>

<div class="modal fade search-modal" id="search-modal" data-backdrop="false" data-keyboard="true">
    <div class="modal-dialog modal-lg">
        <div class="modal-content">
            <div class="modal-body">
                <div id="search" class="s-search mx-auto my-4">
${searchConfig ? this.generateModalSearch(searchConfig) : this.getModalDefaultHtml()}
                </div>


            </div>
        </div>
    </div>
</div>


<script type='text/javascript' src='./assets/js/jquery.ui.touch-punch.min-0.2.2.js' id='jqueryui-touch-js'></script>
<script type='text/javascript' src='./assets/js/clipboard.min-5.6.2.js' id='clipboard-js'></script>
<script type='text/javascript' src='./assets/js/tooltip-extend.js' id='iplaycode-nav-js'></script>
<script type='text/javascript' id='popper-js-extra'>


var theme = {"ajaxurl":"","addico":"https:\/\/nav.baidu.cn\/wp-content\/themes\/onenav\/images\/add.png","order":"asc","formpostion":"top","defaultclass":"io-grey-mode","isCustomize":"1","icourl":"","icopng":".png","urlformat":"1","customizemax":"10","newWindow":"0","lazyload":"1","minNav":"1","loading":"1","hotWords":"baidu","classColumns":" col-sm-6 col-md-4 col-xl-5a col-xxl-6a ","apikey":"TWpBeU1UVTNOekk1TWpVMEIvZ1M2bFVIQllUMmxsV1dZelkxQTVPVzB3UW04eldGQmxhM3BNWW14bVNtWk4="};

</script>
<script type='text/javascript' src='./assets/js/popper.min.js' id='popper-js'></script>
<script type='text/javascript' src='./assets/js/bootstrap.min-4.3.1.js' id='bootstrap-js'></script>
<script type='text/javascript' src='./assets/js/theia-sticky-sidebar-1.5.0.js' id='sidebar-js'></script>
<script type='text/javascript' src='./assets/js/lazyload.min-12.4.0.js' id='lazyload-js'></script>
<script type='text/javascript' src='./assets/js/fancybox.min-3.5.7.js' id='lightbox-js-js'></script>

<script type='text/javascript' src='./assets/js/app-anim.js' id='appanim-js'></script>

<script type="text/javascript">
    $(document).ready(function(){
        var siteWelcome = $('#loading');
        siteWelcome.addClass('close');
        setTimeout(function() {
            siteWelcome.remove();
        }, 600);
    });
</script>
<script>
    $(document).ready(function(){
        setTimeout(function () {
            if ($('a.smooth[href="' + window.location.hash + '"]')[0]) {
                $('a.smooth[href="' + window.location.hash + '"]').click();
            }else if (window.location.hash != '') {
                $("html, body").animate({
                    scrollTop: $(window.location.hash).offset().top - 90
                }, {
                    duration: 500,
                    easing: "swing"
                });
            }
        }, 300);
        $(document).on('click','a.smooth',function(ev) {
            if($('#sidebar').hasClass('show') && !$(this).hasClass('change-href')){
                $('#sidebar').modal('toggle');
            }
            if($(this).attr("href").substr(0, 1) == "#"){
                $("html, body").animate({
                    scrollTop: $($(this).attr("href")).offset().top - 90
                }, {
                    duration: 500,
                    easing: "swing"
                });
            }
            if($(this).hasClass('go-search-btn')){
                $('#search-text').focus();
            }
            if(!$(this).hasClass('change-href')){
                var menu =  $("a"+$(this).attr("href"));
                menu.click();
                toTarget(menu.parent().parent(),true,true);
            }
        });
        $(document).on('click','a.tab-noajax',function(ev) {
            var url = $(this).data('link');
            if(url)
                $(this).parents('.d-flex.flex-fill.flex-tab').children('.btn-move.tab-move').show().attr('href', url);
            else
                $(this).parents('.d-flex.flex-fill.flex-tab').children('.btn-move.tab-move').hide();
        });

    });
</script>


</body>
</html>
`;
    },

    /**
     * 生成 SEO <head> 注入块：基础 meta + Open Graph + Twitter Card + 站点验证 + JSON-LD + canonical + 自定义 head。
     * 仅在 seo.enabled 时输出；所有值均转义。
     */
    seoHead(data) {
        const seo = (data && data.seo && typeof data.seo === 'object') ? data.seo : {};
        if (!seo.enabled) return '';
        const site = (data && data.site && typeof data.site === 'object') ? data.site : {};
        const esc = (v) => this.escapeAttr(v);
        const lines = [];
        const baseUrl = String(seo.baseUrl || '').replace(/\/+$/, '');
        const title = String(seo.title || site.title || '网址导航');
        const description = String(seo.description || site.description || '');
        const keywords = String(seo.keywords || site.keywords || '');
        const author = String(seo.author || '');
        const robots = String(seo.robots || 'index,follow');
        const canonical = String(seo.canonicalUrl || (baseUrl ? baseUrl + '/' : ''));
        const absUrl = (u) => {
            u = String(u || '').trim();
            if (!u) return '';
            if (/^(https?:|data:)/i.test(u)) return u;
            if (baseUrl) return baseUrl + '/' + u.replace(/^\/+/, '');
            return u;
        };
        // 站点图标多为 base64 dataURL，不适合作为分享图；仅当它是普通路径/URL 时才用作回退
        const favIcon = (site.favicon && !String(site.favicon).startsWith('data:')) ? site.favicon : '';
        const ogImage = absUrl(seo.ogImage || favIcon || '');
        const ogTitle = String(seo.ogTitle || title);
        const ogDesc = String(seo.ogDescription || description);
        const twTitle = String(seo.twitterTitle || title);
        const twDesc = String(seo.twitterDescription || description);
        const twImage = absUrl(seo.twitterImage || seo.ogImage || favIcon || '');

        lines.push('<meta name="robots" content="' + esc(robots) + '" />');
        if (author) lines.push('<meta name="author" content="' + esc(author) + '" />');
        if (canonical) lines.push('<link rel="canonical" href="' + esc(canonical) + '" />');

        // Open Graph
        if (seo.ogEnabled !== false) {
            lines.push('<meta property="og:type" content="' + esc(seo.ogType || 'website') + '" />');
            lines.push('<meta property="og:title" content="' + esc(ogTitle) + '" />');
            if (ogDesc) lines.push('<meta property="og:description" content="' + esc(ogDesc) + '" />');
            if (ogImage) lines.push('<meta property="og:image" content="' + esc(ogImage) + '" />');
            if (canonical) lines.push('<meta property="og:url" content="' + esc(canonical) + '" />');
            if (seo.ogSiteName) lines.push('<meta property="og:site_name" content="' + esc(seo.ogSiteName) + '" />');
            if (seo.ogLocale) lines.push('<meta property="og:locale" content="' + esc(seo.ogLocale) + '" />');
        }

        // Twitter Card
        if (seo.twitterEnabled !== false) {
            lines.push('<meta name="twitter:card" content="' + esc(seo.twitterCard || 'summary_large_image') + '" />');
            lines.push('<meta name="twitter:title" content="' + esc(twTitle) + '" />');
            if (twDesc) lines.push('<meta name="twitter:description" content="' + esc(twDesc) + '" />');
            if (twImage) lines.push('<meta name="twitter:image" content="' + esc(twImage) + '" />');
        }

        // 站点验证
        const v = (seo.verification && typeof seo.verification === 'object') ? seo.verification : {};
        if (v.google) lines.push('<meta name="google-site-verification" content="' + esc(v.google) + '" />');
        if (v.bing) lines.push('<meta name="msvalidate.01" content="' + esc(v.bing) + '" />');
        if (v.baidu) lines.push('<meta name="baidu-site-verification" content="' + esc(v.baidu) + '" />');
        if (v.yandex) lines.push('<meta name="yandex-verification" content="' + esc(v.yandex) + '" />');
        if (v.sogou) lines.push('<meta name="sogou_site_verification" content="' + esc(v.sogou) + '" />');
        if (v.shenma) lines.push('<meta name="shenma-site-verification" content="' + esc(v.shenma) + '" />');
        if (v.qihoo) lines.push('<meta name="360-site-verification" content="' + esc(v.qihoo) + '" />');

        // 结构化数据 JSON-LD
        if (seo.structuredDataEnabled !== false) {
            const sdUrl = String(seo.sdUrl || canonical || baseUrl);
            const sd = {
                '@context': 'https://schema.org',
                '@type': seo.sdType || 'WebSite',
                name: seo.sdName || title,
            };
            if (sdUrl) sd.url = sdUrl;
            if (seo.sdDescription) sd.description = seo.sdDescription;
            const sdLogoVal = seo.sdLogo
                || ((site.logoLight && !String(site.logoLight).startsWith('data:')) ? site.logoLight : '')
                || favIcon;
            if (sdLogoVal) sd.logo = absUrl(sdLogoVal);
            if (seo.sdSameAs) sd.sameAs = String(seo.sdSameAs).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
            if (sd['@type'] === 'WebSite') {
                sd.potentialAction = {
                    '@type': 'SearchAction',
                    target: (sdUrl ? sdUrl.replace(/\/+$/, '') + '/' : '') + '?q={search_term_string}',
                    'query-input': 'required name=search_term_string'
                };
            }
            lines.push('<script type="application/ld+json">' + JSON.stringify(sd) + '</script>');
        }

        // 自定义 head
        if (seo.customHead && seo.customHead.trim()) {
            lines.push(seo.customHead.trim());
        }
        return '\n    <!-- SEO -->\n    ' + lines.join('\n    ') + '\n';
    },

    /**
     * 把 SEO head 注入到页面 </head> 前
     */
    injectSeo(html, data) {
        if (!html) return html;
        const head = this.seoHead(data);
        if (!head) return html;
        if (html.indexOf('</head>') >= 0) {
            return html.replace('</head>', head + '</head>');
        }
        return html;
    },

    escape(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    },

    escapeAttr(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
};

// 按分类名自动匹配 FontAwesome 图标（未命中时回退文件夹图标）
const matchCategoryIcon = (name) => {
    const n = String(name || '');
    const lower = n.toLowerCase();
    const has = (...ks) => ks.some(k => lower.indexOf(k) >= 0);
    if (has('法律', '商标', '专利', '标准', '法规')) return 'fas fa-balance-scale';
    if (has('经济', '财经', '金融', '行情')) return 'fas fa-chart-line';
    if (has('招投', '招标', '投标', '采购')) return 'fas fa-gavel';
    if (has('政府', '政务', '行政')) return 'fas fa-landmark';
    if (has('深圳')) return 'fas fa-city';
    if (has('税务', '社保', '公积金')) return 'fas fa-file-invoice-dollar';
    if (has('外包', '劳务', '人力')) return 'fas fa-handshake';
    if (has('营销', '推广', '广告', '运营')) return 'fas fa-bullhorn';
    if (has('工业', '工厂', '制造')) return 'fas fa-industry';
    if (has('金属', '钢铁')) return 'fas fa-cubes';
    if (has('大宗', '商品', '现货')) return 'fas fa-boxes';
    if (has('承兑', '汇票', '票据')) return 'fas fa-file-invoice';
    if (has('跨境', '外贸', '出口', '进口')) return 'fas fa-globe-asia';
    if (has('匿名', '隐私')) return 'fas fa-user-secret';
    if (has('融钱', '融资', '贷款', '借款', '资金')) return 'fas fa-money-bill-wave';
    if (has('算力', '云计算', '数据中心')) return 'fas fa-server';
    if (has('地图', '位置')) return 'fas fa-map-marked-alt';
    if (has('飞机', '航空', '航班', '机票')) return 'fas fa-plane';
    if (has('学校', '教育', '学习', '课程', '培训')) return 'fas fa-graduation-cap';
    if (has('签证', '护照')) return 'fas fa-passport';
    if (has('攻略', '游记')) return 'fas fa-map-signs';
    if (has('esim', 'sim', '号卡', '手机卡')) return 'fas fa-sim-card';
    if (has('无线电', '射频', '电台', '对讲')) return 'fas fa-broadcast-tower';
    if (has('软件', '开发', '编程', '代码', '前端', '程序')) return 'fas fa-code';
    if (has('病毒', '查杀', '杀毒')) return 'fas fa-shield-virus';
    if (has('网站', '建站', '域名', '网页')) return 'fas fa-globe';
    if (has('查询', '测试', '验证', '检测')) return 'fas fa-search';
    if (has('存档', '归档', '备份')) return 'fas fa-archive';
    if (has('设计', '绘画', '图像', '图片')) return 'fas fa-palette';
    if (has('控制台', '终端', '命令')) return 'fas fa-terminal';
    if (has('环境', '部署', '运维')) return 'fas fa-cogs';
    if (has('教程', '文档', '手册')) return 'fas fa-book-open';
    if (has('图形化', '可视化')) return 'fas fa-th-large';
    if (has('交易', '买卖', '商城')) return 'fas fa-exchange-alt';
    if (has('seo', '排名', '优化')) return 'fas fa-search-plus';
    if (has('邮箱', '邮件', 'mail')) return 'fas fa-envelope';
    if (has('docker', '容器')) return 'fab fa-docker';
    if (has('内网', '穿透', '隧道')) return 'fas fa-network-wired';
    if (has('下载', '资源站')) return 'fas fa-download';
    if (has('3d', '打印', '模型')) return 'fas fa-print';
    if (has('视频', '影视', '电影', '动画')) return 'fas fa-video';
    if (has('电子书', '小说', '读书')) return 'fas fa-book';
    if (has('资源', '素材')) return 'fas fa-database';
    if (has('个性', '美化', '壁纸')) return 'fas fa-paint-brush';
    if (has('论坛', '社区', '贴吧')) return 'fas fa-comments';
    if (has('博客', '随笔')) return 'fas fa-blog';
    if (has('音乐', '音频', '唱歌')) return 'fas fa-music';
    if (has('系统', '操作系统', 'windows')) return 'fas fa-desktop';
    if (has('工具', '工具箱')) return 'fas fa-tools';
    if (has('语音', 'tts', '朗读', '配音')) return 'fas fa-volume-up';
    if (has('pdf')) return 'fas fa-file-pdf';
    if (has('ai', '智能', '机器人', '模型')) return 'fas fa-robot';
    if (has('摄影', '相机', '拍照')) return 'fas fa-camera';
    if (has('网安', '安全', '黑客', '渗透')) return 'fas fa-shield-alt';
    if (has('电报', 'telegram')) return 'fab fa-telegram';
    if (has('开源', 'github', 'git')) return 'fas fa-code-branch';
    if (has('生化', '基因', 'dna', '医疗', '健康')) return 'fas fa-dna';
    if (has('香港', '城市')) return 'fas fa-university';
    return 'fas fa-folder';
};

// 按网站名称自动匹配贴切图标（logo 加载失败/没有图标时使用）
const matchSiteIcon = (name) => {
    const n = String(name || '');
    const lower = n.toLowerCase();
    const has = (...ks) => ks.some(k => lower.indexOf(k) >= 0);
    if (has('github', 'git', 'gitee', 'coding')) return 'fab fa-github';
    if (has('百度', 'baidu', '谷歌', 'google', 'bing', '必应', '搜索', '查')) return 'fas fa-search';
    if (has('youtube', 'youtu', 'b站', 'bilibili', '视频', '影视', '电影', '抖音', '快手', '优酷', '腾讯视频', '爱奇艺')) return 'fas fa-play-circle';
    if (has('音乐', '网易云', 'qq音乐', '酷狗', 'spotify', 'soundcloud', '音频', '电台')) return 'fas fa-music';
    if (has('邮箱', 'mail', 'gmail', 'outlook', '邮')) return 'fas fa-envelope';
    if (has('地图', '地图', '高德', '百度地图', 'google maps', '位置')) return 'fas fa-map-marked-alt';
    if (has('翻译', 'translate', '词典', '字典')) return 'fas fa-language';
    if (has('chatgpt', 'gpt', 'ai', '人工智能', '文心', '通义', '星火', '机器人', 'copilot', 'claude', 'midjourney', 'sd ', 'stable')) return 'fas fa-robot';
    if (has('知乎', '贴吧', '论坛', 'bbs', 'reddit', '社区', 'discord', 'qq群', '电报', 'telegram')) return 'fas fa-comments';
    if (has('博客', 'blog', 'wordpress', '简书')) return 'fas fa-blog';
    if (has('下载', 'download', '网盘', '迅雷', '软件', '应用')) return 'fas fa-download';
    if (has('淘宝', '天猫', '京东', '拼多多', '亚马逊', 'amazon', '购物', '商城', '买', '1688')) return 'fas fa-shopping-cart';
    if (has('银行', '招商', '工商', '建设', '农业', '中国银行', 'icbc', 'cmb', 'ccb', '金融')) return 'fas fa-university';
    if (has('股票', '行情', '基金', '证券', '炒股', '同花顺', '东方财富')) return 'fas fa-chart-line';
    if (has('政府', '政务', '.gov', '税务', '社保', '海关', '工商')) return 'fas fa-landmark';
    if (has('学校', '大学', '学院', 'edu', '学习', '课程', '考试', '教育')) return 'fas fa-graduation-cap';
    if (has('招聘', '求职', '前程无忧', '智联', 'boss', '猎聘', '工作')) return 'fas fa-briefcase';
    if (has('新闻', '资讯', '日报', '新浪', '网易', '凤凰', '头条', '36kr', '虎嗅')) return 'fas fa-newspaper';
    if (has('机票', '航空', '航班', '飞机', '航旅', '携程', '飞猪')) return 'fas fa-plane';
    if (has('酒店', '民宿', 'booking', 'agoda', '爱彼迎')) return 'fas fa-hotel';
    if (has('医院', '医疗', '健康', '医生', '挂号', '药')) return 'fas fa-hospital';
    if (has('设计', 'ps ', 'photoshop', 'figma', 'sketch', 'ui', 'ux', '配色')) return 'fas fa-palette';
    if (has('编程', '代码', '开发', '文档', 'api', '开发者', 'python', 'java', 'javascript', 'node', 'docker', 'linux')) return 'fas fa-code';
    if (has('安全', '黑客', '漏洞', '渗透', '病毒', '杀毒')) return 'fas fa-shield-alt';
    if (has('网盘', '云盘', 'onedrive', 'google drive', 'dropbox', '坚果云')) return 'fas fa-cloud';
    if (has('pdf', '文档', 'office', 'wps', 'word', 'excel', 'ppt')) return 'fas fa-file-alt';
    if (has('游戏', 'steam', 'epic', 'playstation', 'xbox', 'switch')) return 'fas fa-gamepad';
    if (has('微信', 'wechat', 'qq', '社交')) return 'fab fa-weixin';
    if (has('twitter', '推特', 'x.com', '微博', 'weibo')) return 'fab fa-twitter';
    if (has('facebook', '脸书')) return 'fab fa-facebook';
    if (has('instagram', 'ins ')) return 'fab fa-instagram';
    if (has('linkedin', '领英')) return 'fab fa-linkedin';
    if (has('知乎')) return 'fab fa-zhihu';
    if (has('维基', 'wikipedia', '百科')) return 'fas fa-book';
    if (has('天气', '气候')) return 'fas fa-cloud-sun';
    if (has('翻译')) return 'fas fa-language';
    if (has('图片', '照片', '壁纸', '素材', 'icon', '图标')) return 'fas fa-images';
    if (has('工具', '工具箱', '转换', '压缩', '生成')) return 'fas fa-tools';
    if (has('翻译')) return 'fas fa-language';
    return 'fas fa-link';
};

// ==================== 存储管理（文件夹式） ====================
// 版本/模板快照瘦身：剔除纯运行时状态（发布基线、当前版本、排序等，
// 这些只保存在站点 setting，不进入历史版本/模板快照）
function stripVersionRuntime(d) {
    const c = JSON.parse(JSON.stringify(d || {}));
    delete c.deployBaseline;
    delete c.deploySettings;
    delete c.currentVersionId;
    delete c.versionOrder;
    return c;
}

const Storage = {
    CURRENT_PROFILE_KEY: 'nav_editor_current_profile',

    API_BASE: '/api/storage/',

    async _api(method, action, payload = null) {
        const url = this.API_BASE + action;
        const opts = { method };
        if (payload && method === 'POST') {
            opts.headers = { 'Content-Type': 'application/json;charset=utf-8' };
            opts.body = JSON.stringify(payload);
        }
        const res = await fetch(url, opts);
        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch (_) { json = { ok: false, error: text }; }
        if (!res.ok || !json.ok) {
            // 调试日志：输出完整请求信息，便于排查 404
            console.error('[NavEditor API]', method, url, 'status=', res.status, 'response=', text.slice(0, 300));
            throw new Error(json.error || ('请求失败: ' + res.status));
        }
        return json;
    },

    // ---------- 当前站点 ----------
    getCurrentProfileId() {
        return localStorage.getItem(this.CURRENT_PROFILE_KEY) || '';
    },
    setCurrentProfileId(id) {
        localStorage.setItem(this.CURRENT_PROFILE_KEY, id || '');
    },

    // ---------- 站点管理 ----------
    async getProfiles() {
        const res = await this._api('GET', 'sites');
        return res.sites || [];
    },

    async getProfile(id) {
        if (!id) return null;
        const res = await this._api('GET', 'site-setting?site=' + encodeURIComponent(id));
        return res.setting || null;
    },

    async createProfile(name, data) {
        const res = await this._api('POST', 'site', { action: 'create', name, data });
        return res.id;
    },

    async saveProfile(profile) {
        await this._api('POST', 'site-setting', { site: profile.id, setting: profile });
    },

    async reorderProfiles(ids) {
        await this._api('POST', 'site', { action: 'reorder', ids });
    },

    async renameProfile(id, newName) {
        const res = await this._api('POST', 'site', { action: 'rename', id, newName });
        return res.id;
    },

    async deleteProfile(id) {
        await this._api('POST', 'site', { action: 'delete', id });
    },

    // ---------- 版本历史 ----------
    async saveVersion(data, note = '') {
        const siteId = this.getCurrentProfileId();
        if (!siteId) throw new Error('未选择站点');
        if (typeof note !== 'string') note = '';
        const finalNote = note || Utils.formatTime(Date.now());
        const res = await this._api('POST', 'version', { action: 'create', site: siteId, name: finalNote });
        const versionId = res.id;
        const setting = {
            id: versionId,
            name: finalNote,
            note: finalNote,
            timestamp: Date.now(),
            starred: false,
            data: stripVersionRuntime(data)
        };
        await this._api('POST', 'version-setting', { site: siteId, version: versionId, setting });
        return { ...setting };
    },

    async getVersions(profileId) {
        const siteId = profileId || this.getCurrentProfileId();
        if (!siteId) return [];
        const res = await this._api('GET', 'versions?site=' + encodeURIComponent(siteId));
        return res.versions || [];
    },

    async getVersion(id) {
        const siteId = this.getCurrentProfileId();
        if (!siteId || !id) return null;
        const res = await this._api('GET', 'version-setting?site=' + encodeURIComponent(siteId) + '&version=' + encodeURIComponent(id));
        return res.setting || null;
    },

    async getVersionForSite(siteId, id) {
        if (!siteId || !id) return null;
        try {
            const res = await this._api('GET', 'version-setting?site=' + encodeURIComponent(siteId) + '&version=' + encodeURIComponent(id));
            return res.setting || null;
        } catch (_e) {
            return null;
        }
    },

    async createVersionForSite(siteId, data, note = '', extra = {}) {
        const finalNote = note || Utils.formatTime(Date.now());
        const res = await this._api('POST', 'version', { action: 'create', site: siteId, name: finalNote });
        const versionId = res.id;
        const setting = {
            id: versionId,
            name: finalNote,
            note: finalNote,
            timestamp: (extra && extra.timestamp) || Date.now(),
            starred: !!(extra && extra.starred),
            data: stripVersionRuntime(data)
        };
        await this._api('POST', 'version-setting', { site: siteId, version: versionId, setting });
        return versionId;
    },

    async deleteVersion(id) {
        const siteId = this.getCurrentProfileId();
        if (!siteId || !id) return;
        await this._api('POST', 'version', { action: 'delete', site: siteId, id });
    },

    async updateVersionStarred(id, starred) {
        const siteId = this.getCurrentProfileId();
        if (!siteId || !id) return;
        const res = await this._api('GET', 'version-setting?site=' + encodeURIComponent(siteId) + '&version=' + encodeURIComponent(id));
        const setting = res.setting || {};
        setting.starred = starred;
        await this._api('POST', 'version-setting', { site: siteId, version: id, setting });
    },

    async updateVersionNote(id, note) {
        const siteId = this.getCurrentProfileId();
        if (!siteId || !id) return id;
        const res = await this._api('GET', 'version-setting?site=' + encodeURIComponent(siteId) + '&version=' + encodeURIComponent(id));
        const setting = res.setting || {};
        setting.note = note;
        setting.name = note;
        const postRes = await this._api('POST', 'version-setting', { site: siteId, version: id, setting });
        return postRes.id || id;
    },

    async updateVersionData(id, data) {
        const siteId = this.getCurrentProfileId();
        if (!siteId || !id) return;
        const res = await this._api('GET', 'version-setting?site=' + encodeURIComponent(siteId) + '&version=' + encodeURIComponent(id));
        const setting = res.setting || {};
        setting.data = stripVersionRuntime(data);
        await this._api('POST', 'version-setting', { site: siteId, version: id, setting });
    },

    // 局部更新版本设置（如 syncInfo），GET 后合并再写回，避免覆盖其它字段
    async patchVersionSetting(id, patch) {
        const siteId = this.getCurrentProfileId();
        if (!siteId || !id) return;
        const res = await this._api('GET', 'version-setting?site=' + encodeURIComponent(siteId) + '&version=' + encodeURIComponent(id));
        const setting = res.setting || {};
        if (patch && typeof patch === 'object') {
            Object.assign(setting, JSON.parse(JSON.stringify(patch)));
        }
        const postRes = await this._api('POST', 'version-setting', { site: siteId, version: id, setting });
        return postRes.id || id;
    },

    // ---------- 部署文件 ----------
    async writeVersionDeploy(siteId, versionId, group, files) {
        await this._api('POST', 'version-deploy', { site: siteId, version: versionId, group, files });
    },

    // ---------- 快速发布履历（web/<site>/<version>/upload/log.json）----------
    async writeVersionUploadRecord(siteId, versionId, record) {
        await this._api('POST', 'version-upload-record', { site: siteId, version: versionId, record });
    },
    async getVersionUploadRecords(siteId, versionId) {
        const res = await this._api('GET', 'version-upload-records?site=' + encodeURIComponent(siteId) + '&version=' + encodeURIComponent(versionId));
        return res.records || [];
    },

    // ---------- 默认模板 ----------
    async getDefaultTemplates(siteId) {
        const id = siteId || this.getCurrentProfileId();
        if (!id) return { templates: [], current: '' };
        const res = await this._api('GET', 'default-templates?site=' + encodeURIComponent(id));
        return { templates: res.templates || [], current: res.current || '' };
    },

    async setDefaultTemplate(siteId, templateName) {
        const id = siteId || this.getCurrentProfileId();
        if (!id) throw new Error('未选择站点');
        await this._api('POST', 'default-template', { action: 'set', site: id, templateName });
    },

    async clearDefaultTemplate(siteId) {
        const id = siteId || this.getCurrentProfileId();
        if (!id) throw new Error('未选择站点');
        await this._api('POST', 'default-template', { action: 'clear', site: id });
    },

    async deleteDefaultTemplate(siteId, templateName) {
        const id = siteId || this.getCurrentProfileId();
        if (!id) throw new Error('未选择站点');
        await this._api('POST', 'default-template', { action: 'delete', site: id, templateName });
    },

    async copyToDefaultTemplates(siteId, templateName, files) {
        const id = siteId || this.getCurrentProfileId();
        if (!id) throw new Error('未选择站点');
        await this._api('POST', 'copy-to-default-templates', { site: id, templateName, files });
    },

    async saveDefaultTemplate(siteId, templateName, files, setting) {
        const id = siteId || this.getCurrentProfileId();
        if (!id) throw new Error('未选择站点');
        await this._api('POST', 'save-default-template', { site: id, templateName, files, setting });
    },

    async openVersionFolder(siteId, versionId) {
        const id = siteId || this.getCurrentProfileId();
        if (!id || !versionId) throw new Error('参数错误');
        await this._api('POST', 'open-version-folder', { site: id, version: versionId });
    },

    async readDefaultTemplateSetting(siteId, templateName) {
        const id = siteId || this.getCurrentProfileId();
        if (!id || !templateName) return null;
        const res = await this._api('GET', 'default-template-setting?site=' + encodeURIComponent(id) + '&templateName=' + encodeURIComponent(templateName));
        return res.setting || null;
    }
};

// ==================== 本地代理封装（规避浏览器直连 CORS / 网络层拦截） ====================
/**
 * 通过本地后端 /api/proxy 转发外部 API 请求。
 * host: 'api.cloudflare.com' | 'api.github.com'
 * 返回一个类 fetch Response 对象：{ ok, status, json(), text() }
 * 注意：上游返回的 JSON 体由代理透传，因此调用点仍可照常使用 res.ok / res.status / res.json()。
 */
async function proxyFetch(host, path, options) {
    options = options || {};
    const proxyRes = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            host: host,
            path: path,
            method: options.method || 'GET',
            headers: options.headers || {},
            body: (options.body !== undefined ? options.body : null)
        })
    });
    if (proxyRes.status >= 500) {
        const ed = await proxyRes.json().catch(() => ({}));
        throw new Error('代理服务器错误: ' + (ed.error || ('HTTP ' + proxyRes.status)));
    }
    const proxyData = await proxyRes.json().catch(() => ({}));
    const status = (typeof proxyData.status === 'number' && proxyData.status > 0) ? proxyData.status : proxyRes.status;
    const rawBody = (proxyData.body != null) ? proxyData.body : '';
    let parsed = rawBody;
    if (typeof rawBody === 'string') {
        try { parsed = JSON.parse(rawBody); } catch (e) { parsed = rawBody; }
    }
    return {
        ok: status >= 200 && status < 400,
        status: status,
        json: async () => parsed,
        text: async () => (typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody))
    };
}

// 带超时的 Promise 包裹：超时返回 fallback（不取消底层请求，但避免界面永久卡死）
function withTimeout(promise, ms, fallback) {
    return new Promise((resolve) => {
        let done = false;
        const timer = setTimeout(() => {
            if (!done) { done = true; resolve(fallback); }
        }, ms);
        Promise.resolve(promise).then(
            v => { if (!done) { done = true; clearTimeout(timer); resolve(v); } },
            e => { if (!done) { done = true; clearTimeout(timer); resolve(fallback); } }
        );
    });
}

// 并发执行池：对 items 以 concurrency 为并发度执行 worker(item, index)，返回结果数组（保序）
async function mapWithConcurrency(items, concurrency, worker) {
    const results = new Array(items.length);
    let idx = 0;
    async function runner() {
        while (idx < items.length) {
            const cur = idx++;
            results[cur] = await worker(items[cur], cur);
        }
    }
    const n = Math.max(1, Math.min(concurrency, items.length));
    const pool = [];
    for (let i = 0; i < n; i++) pool.push(runner());
    await Promise.all(pool);
    return results;
}

// ==================== Cloudflare Pages 同步 ====================
// 凭证清洗：去除不可见/非法字符（Cloudflare 对零宽空格会判 401 code 1000，普通 .trim() 去不掉）
function sanitizeToken(t) {
    return typeof t === 'string' ? t.replace(/[^\x21-\x7E]/g, '') : (t || '');
}
function sanitizeAccountId(t) {
    return typeof t === 'string' ? t.replace(/[^A-Za-z0-9]/g, '') : (t || '');
}
function tokenHasIllegalChars(t) {
    return typeof t === 'string' && /[^\x21-\x7E]/.test(t);
}
// 识别凭证类型，防止误用 R2 S3 密钥
function detectCredentialType(t) {
    if (!t) return { valid: false, hint: '请填写 API Token' };
    if (/^[0-9a-f]{32,}$/i.test(t)) {
        return { valid: false, hint: '这看起来是 R2 的「秘密访问密钥」(纯十六进制)，不是 Cloudflare Pages 用的 API Token。请复制 Cloudflare 首页「您的 API 令牌」(以 cfat_ 开头) 那串。' };
    }
    if (!/^cfat_/i.test(t) && !/^cf_/i.test(t) && !/^vnd\./i.test(t)) {
        return { valid: false, hint: 'Cloudflare API Token 通常以 cfat_ 开头，请确认复制的是「您的 API 令牌」那一行，而不是 R2 的「访问密钥 ID / 秘密访问密钥」。' };
    }
    return { valid: true, hint: '' };
}

// Token 账户级校验失败时的原因提示（GET /accounts/{id}/tokens/verify，官方示例端点）
function buildCloudflareTokenHint(status) {
    if (status === 401) return 'HTTP 401：Token 无效或格式不对。请确认填写的是「API Token」（以 cfat_ 开头），而不是 R2 的 Global API Key / Secret Access Key；也有可能 Token 已过期/被撤销，请在 Cloudflare 控制台重新生成。';
    if (status === 403) return 'HTTP 403：Token 无有效权限或已被吊销。请重新生成 API Token。';
    if (status === 404) return 'HTTP 404：Account ID 错误，或该 Token 不属于此账户（或在该账户下没有任何权限）。请确认：① Account ID 是从 Cloudflare 控制台复制的账户 ID（不是 Zone ID）；② 该 Token 是在这个账户下创建的、且具备至少一项权限（如 Cloudflare Pages: Read）。';
    return '请确认 API Token 完整无空格、未过期且未被撤销，且 Account ID 填写无误。';
}
// Pages 项目/账户验证失败时的原因提示（GET /accounts/{id}/pages/projects，仅需 Pages:Read）
function buildCloudflarePagesHint(status, hasName) {
    if (status === 404) return 'HTTP 404：项目名不存在、或 Account ID 错误、或 Token 不属于该账户。请检查项目名拼写与大小写，确认该 Token 具备 Cloudflare Pages: Read 权限。';
    if (status === 403) return 'HTTP 403：Token 对 Pages 无权限，请确认具备 Cloudflare Pages: Read。';
    return '请确认 Pages 项目名正确、Token 具备 Cloudflare Pages: Read 权限。';
}

// 文件哈希：SHA-256 → base64url（与 wrangler/cloudflare 一致），供 check-missing / manifest 使用
async function computeFileHash(content, binary) {
    const bytes = binary
        ? Uint8Array.from(atob(content), c => c.charCodeAt(0))
        : new TextEncoder().encode(content);
    const buf = await crypto.subtle.digest('SHA-256', bytes);
    let bin = '';
    const arr = new Uint8Array(buf);
    for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// UTF-8 安全 base64 编码（Vercel 部署内联文件用；普通 btoa 不能处理中文/emoji）
function utf8ToBase64(str) {
    return btoa(unescape(encodeURIComponent(str)));
}

// 简单延时（轮询 Vercel 部署状态时用）
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// 发布基线键：按 账号+仓库/项目 区分，避免不同发布目标共用同一份基线
function getAccountKey(account) {
    if (account.type === 'github') return 'github:' + (account.owner || '') + '/' + (account.repo || '');
    if (account.type === 'vercel') return 'vercel:' + (account.teamId || '') + '/' + (account.projectName || '');
    if (account.type === 'netlify') return 'netlify:' + (account.siteId || '') + '/' + (account.siteName || '');
    if (account.type === 'server') return 'server:' + (account.deployType || '') + ':' + (account.deployType === 'local' ? (account.localPath || '') : ((account.host || '') + ':' + (account.remotePath || '')));
    return 'cf:' + (account.accountId || '') + '/' + (account.projectName || '');
}

const CloudflareSync = {
    /**
     * 验证 Cloudflare 账号连通性（账户级 API）
     * 返回 { ok, accountValid, accountName, projectValid, projectName, url, message, hint }
     */
    async checkConnectivity(account) {
        let accountId = sanitizeAccountId(account.accountId || '');
        let projectName = (account.projectName || '').replace(/[^\x21-\x7E]/g, '').trim();
        let apiToken = sanitizeToken(account.apiToken || '');
        const _rawToken = account.apiToken || '';
        const result = {
            ok: false,
            accountValid: false,
            accountName: '',
            projectValid: false,
            projectName: projectName || '',
            url: '',
            message: '',
            hint: ''
        };
        if (!accountId || !apiToken) {
            result.message = '缺少 Account ID 或 API Token';
            return result;
        }
        if (tokenHasIllegalChars(_rawToken)) result.hint = '检测到 API Token 中含不可见/非法字符，已自动清理，请重新点「检查」。';
        try {
            // 1. 账户级校验（GET /accounts/{account_id}/tokens/verify，官方示例端点）
            const acctVerify = await proxyFetch('api.cloudflare.com', `/client/v4/accounts/${accountId}/tokens/verify`, {
                headers: { 'Authorization': `Bearer ${apiToken}` }
            });
            const acctData = await acctVerify.json();
            let acctOk = acctData.success;
            let acctMsg = acctData.errors?.[0]?.message;
            let acctCode = acctData.errors?.[0]?.code;
            if (!acctOk) {
                // 2. 全局兜底（GET /user/tokens/verify，不需要任何资源权限）
                const userVerify = await proxyFetch('api.cloudflare.com', '/client/v4/user/tokens/verify', {
                    headers: { 'Authorization': `Bearer ${apiToken}` }
                });
                const userData = await userVerify.json();
                if (userData.success) {
                    acctOk = true;
                } else {
                    result.message = 'Token 验证失败：账户级 ' + (acctMsg || ('HTTP ' + acctVerify.status)) + (acctCode ? (' (code ' + acctCode + ')') : '')
                        + '；全局 ' + (userData.errors?.[0]?.message || ('HTTP ' + userVerify.status)) + (userData.errors?.[0]?.code ? (' (code ' + userData.errors?.[0]?.code + ')') : '');
                    result.hint = buildCloudflareTokenHint(userVerify.status);
                    return result;
                }
            }
            result.tokenValid = true;
            result.accountValid = true;
        } catch (e) {
            result.message = '网络错误：' + e.message;
            return result;
        }
        try {
            // 3. Pages 项目校验（GET /accounts/{id}/pages/projects/{name}）
            const pagesRes = await proxyFetch('api.cloudflare.com', `/client/v4/accounts/${accountId}/pages/projects/${encodeURIComponent(projectName)}`, {
                headers: { 'Authorization': `Bearer ${apiToken}` }
            });
            const pagesData = await pagesRes.json();
            if (pagesData.success) {
                result.projectValid = true;
                result.url = (pagesData.result && pagesData.result.subdomain) ? `https://${pagesData.result.subdomain}.pages.dev` : '';
                result.ok = true;
                result.message = '验证通过';
                return result;
            } else {
                const errCode = pagesData.errors?.[0]?.code;
                const errMsg = pagesData.errors?.[0]?.message;
                result.message = 'Pages 验证失败：' + (errMsg || ('HTTP ' + pagesRes.status)) + (errCode ? (' (code ' + errCode + ')') : '');
                // 诊断：列出该 Token 可见的 Pages 项目，帮助定位「项目名错误」还是「Token 资源范围未覆盖」
                let diag = '';
                try {
                    const listRes = await proxyFetch('api.cloudflare.com', `/client/v4/accounts/${accountId}/pages/projects`, {
                        headers: { 'Authorization': `Bearer ${apiToken}` }
                    });
                    const listData = await listRes.json();
                    if (listData.success) {
                        const names = (listData.result || []).map(p => p.name);
                        if (names.length === 0) {
                            diag = ' 该 Token 可见的 Pages 项目共 0 个：（无）。这说明 Token 的 Pages 资源范围未覆盖任何项目，请去 Cloudflare 控制台将该 Token 的 Pages 权限资源范围设为 "All pages"。';
                        } else if (names.indexOf(projectName) >= 0) {
                            diag = ` 项目「${projectName}」在可见列表中，但查询失败，可能是 Token 对该项目的资源范围未覆盖。可见项目：${names.join(', ')}`;
                        } else {
                            diag = ` 该 Token 可见的 Pages 项目共 ${names.length} 个：${names.join(', ')}。你填的项目名「${projectName}」不在其中，请核对大小写或从列表复制正确名称。`;
                        }
                    }
                } catch (_) { /* 诊断失败不影响主错误返回 */ }
                result.hint = buildCloudflarePagesHint(pagesRes.status, !!projectName) + diag;
                return result;
            }
        } catch (e) {
            result.message = 'Pages 校验网络错误：' + e.message;
            return result;
        }
    },

    async getUploadToken(accountId, projectName, apiToken) {
        accountId = sanitizeAccountId(accountId);
        apiToken = sanitizeToken(apiToken);
        const path = `/client/v4/accounts/${accountId}/pages/projects/${encodeURIComponent(projectName)}/upload-token`;
        const res = await proxyFetch('api.cloudflare.com', path, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiToken}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(`获取上传凭证失败: ${data.errors?.[0]?.message || '未知错误'}`);
        return data.result.jwt;
    },

    async checkMissingAssets(accountId, jwt, hashes) {
        accountId = sanitizeAccountId(accountId);
        const path = `/client/v4/accounts/${accountId}/pages/assets/check-missing`;
        const res = await proxyFetch('api.cloudflare.com', path, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ hashes })
        });
        const data = await res.json();
        if (!data.success) throw new Error(`检查缺失文件失败: ${data.errors?.[0]?.message || '未知错误'}`);
        return data.result || [];
    },

    async uploadAssets(accountId, jwt, files) {
        accountId = sanitizeAccountId(accountId);
        const path = `/client/v4/accounts/${accountId}/pages/assets/upload`;
        const body = files.map(f => ({
            key: f.path,
            value: f.content,
            metadata: { contentType: f.contentType || (f.binary ? 'application/octet-stream' : 'text/html') },
            base64: !!f.binary
        }));
        const res = await proxyFetch('api.cloudflare.com', path, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!data.success) throw new Error(`上传文件失败: ${data.errors?.[0]?.message || '未知错误'}`);
        return data.result;
    },

    async createDeployment(accountId, apiToken, projectName, manifest) {
        accountId = sanitizeAccountId(accountId);
        apiToken = sanitizeToken(apiToken);
        const path = `/client/v4/accounts/${accountId}/pages/projects/${encodeURIComponent(projectName)}/deployments`;
        // 按 wrangler 官方实现：multipart/form-data，manifest 为 JSON 字符串表单字段
        const boundary = '----NavEditorCF' + Date.now().toString(16);
        let body = '';
        body += `--${boundary}\r\n`;
        body += 'Content-Disposition: form-data; name="manifest"\r\n\r\n';
        body += JSON.stringify(manifest) + '\r\n';
        body += `--${boundary}--\r\n`;
        const res = await proxyFetch('api.cloudflare.com', path, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`
            },
            body: body
        });
        const data = await res.json();
        if (!data.success) throw new Error(`创建部署失败: ${data.errors?.[0]?.message || '未知错误'}`);
        return data.result;
    },

    async deployHtml(html, account) {
        return await this.deployFiles([{ path: 'index.html', content: html }], account);
    },

    async deployFiles(files, account, onProgress, opts = {}) {
        const accountId = sanitizeAccountId(account.accountId || '');
        const projectName = (account.projectName || '').replace(/[^\x21-\x7E]/g, '').trim();
        const apiToken = sanitizeToken(account.apiToken || '');
        if (!accountId || !projectName || !apiToken) throw new Error('缺少 Account ID / 项目名 / API Token');

        const onlyFiles = opts.onlyFiles || files;
        const onDetail = opts.onDetail;
        const steps = ['获取上传凭证', '计算文件哈希', '检查缺失文件', '上传文件', '创建部署'];
        const safeProgress = (i, name) => { if (onProgress) onProgress(i, { name, detail: name + '...', done: false }); };

        safeProgress(0, steps[0]);
        const jwt = await this.getUploadToken(accountId, projectName, apiToken);

        // 增量快速跳过：无变更文件且无“已移除的旧文件”时直接判定成功（manifest 未变，远端已是该状态）；
        // 存在移除时仍需创建新部署，让新 manifest 不再包含这些旧文件
        if (onlyFiles.length === 0 && (!opts.deleteFiles || opts.deleteFiles.length === 0)) {
            if (onProgress) onProgress(4, { name: steps[4], detail: '无变更，跳过部署', done: true });
            return { url: `https://${projectName}.pages.dev`, skipped: true };
        }

        safeProgress(1, steps[1]);
        const items = [];
        const hashByPath = {};
        for (const f of files) {
            const hash = f.hash || await computeFileHash(f.content, f.binary);
            items.push({ path: f.path, hash, content: f.content, contentType: f.contentType, binary: !!f.binary });
            hashByPath[f.path] = hash;
        }

        safeProgress(2, steps[2]);
        const allHashes = items.map(i => i.hash);
        const missing = await this.checkMissingAssets(accountId, jwt, allHashes);
        const missingSet = new Set(missing);
        // 仅上传「本次要发布的子集」中、且远端缺失的文件
        const toUpload = onlyFiles.filter(f => missingSet.has(hashByPath[f.path]));

        safeProgress(3, steps[3]);
        if (onDetail) {
            onDetail({ type: 'init', total: toUpload.length, totalBytes: toUpload.reduce((s, f) => s + (f.bytes || 0), 0), items: toUpload.map(f => ({ path: f.path, status: 'pending' })) });
        }
        for (let i = 0; i < toUpload.length; i++) {
            const f = toUpload[i];
            if (onDetail) onDetail({ type: 'item-start', index: i, path: f.path });
            await this.uploadAssets(accountId, jwt, [{ path: f.path, content: f.content, contentType: f.contentType, binary: !!f.binary }]);
            if (onDetail) onDetail({ type: 'item-done', index: i, bytes: f.bytes || 0 });
            if (onProgress) onProgress(3, { name: steps[3], detail: `上传 ${f.path} (${i + 1}/${toUpload.length})...`, done: false });
        }

        safeProgress(4, steps[4]);
        const manifestEntries = {};
        for (const i of items) manifestEntries['/' + i.path] = i.hash;
        const result = await this.createDeployment(accountId, apiToken, projectName, manifestEntries);
        if (onProgress) onProgress(4, { name: steps[4], detail: '完成', done: true });
        return { url: (result && result.url) ? result.url : `https://${projectName}.pages.dev` };
    }
};

// ==================== Vercel Dashboard 同步 ====================
// 部署方式：通过 Vercel REST API（/v13/deployments）内联上传文件，部署出现在 Vercel Dashboard。
// 与 Cloudflare Pages 一致走后端 /api/proxy 转发（已放开 api.vercel.com）。
const VercelSync = {
    /**
     * 验证 Vercel 账号连通性（/v2/user 校验 Token；可选校验项目是否存在）
     * 返回 { ok, tokenValid, userValid, projectValid, projectName, url, accountName, message, hint }
     */
    async checkConnectivity(account) {
        const token = sanitizeToken(account.token || '');
        const result = { ok: false, tokenValid: false, userValid: false, projectValid: false, projectName: account.projectName || '', url: '', accountName: '', message: '', hint: '' };
        if (!token) {
            result.message = '缺少 Access Token';
            return result;
        }
        try {
            const userRes = await proxyFetch('api.vercel.com', '/v2/user', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const userData = await userRes.json();
            if (!userRes.ok || !userData.user) {
                result.message = 'Token 验证失败：' + ((userData.error && userData.error.message) ? userData.error.message : ('HTTP ' + userRes.status));
                return result;
            }
            result.tokenValid = true;
            result.userValid = true;
            result.ok = true;
            result.message = '验证通过';
            result.accountName = userData.user.username || userData.user.email || '';
            // 可选：校验项目是否存在（不存在也不影响 Token 校验通过，部署时 Vercel 会自动创建项目）
            const teamId = account.teamId ? account.teamId.trim() : '';
            const teamQs = teamId ? `?teamId=${encodeURIComponent(teamId)}` : '';
            if (account.projectName) {
                try {
                    const pRes = await proxyFetch('api.vercel.com', `/v9/projects/${encodeURIComponent(account.projectName)}${teamQs}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (pRes.ok) {
                        const pData = await pRes.json();
                        result.projectValid = true;
                        const prodUrl = (pData && pData.link && pData.link.production) ? pData.link.production.url : (pData.name ? `${pData.name}.vercel.app` : '');
                        result.url = prodUrl ? `https://${prodUrl}` : '';
                    }
                } catch (_) { /* 项目校验失败不影响 token 校验通过 */ }
            }
        } catch (e) {
            result.message = '网络错误：' + e.message;
        }
        return result;
    },

    async deployFiles(files, account, onProgress, opts = {}) {
        const token = sanitizeToken(account.token || '');
        const projectName = (account.projectName || '').replace(/[^\x21-\x7E]/g, '').trim();
        const teamId = account.teamId ? account.teamId.trim() : '';
        if (!token) throw new Error('缺少 Access Token');
        const onlyFiles = opts.onlyFiles || files;
        const onDetail = opts.onDetail;
        const steps = ['校验 Token', '准备文件', '创建部署', '等待就绪'];
        const safeProgress = (i, name) => { if (onProgress) onProgress(i, { name, detail: name + '...', done: false }); };

        // 增量快速跳过：无变更文件时直接判定成功
        if (onlyFiles.length === 0) {
            if (onProgress) onProgress(3, { name: steps[3], detail: '无变更，跳过部署', done: true });
            return { url: projectName ? `https://${projectName}.vercel.app` : 'https://vercel.com/dashboard', skipped: true };
        }

        safeProgress(0, steps[0]);
        const userRes = await proxyFetch('api.vercel.com', '/v2/user', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!userRes.ok) {
            const d = await userRes.json().catch(() => ({}));
            throw new Error('Token 验证失败：' + ((d.error && d.error.message) ? d.error.message : ('HTTP ' + userRes.status)));
        }

        safeProgress(1, steps[1]);
        const filePayload = [];
        for (let i = 0; i < onlyFiles.length; i++) {
            const f = onlyFiles[i];
            if (onDetail) onDetail({ type: 'item-start', index: i, path: f.path });
            // 二进制文件：content 已是 base64；文本文件：UTF-8 → base64
            const dataB64 = f.binary ? f.content : utf8ToBase64(f.content);
            filePayload.push({ file: f.path, data: dataB64, encoding: 'base64' });
            if (onDetail) onDetail({ type: 'item-done', index: i, bytes: f.bytes || 0 });
            if (onProgress) onProgress(1, { name: steps[1], detail: `编码 ${f.path} (${i + 1}/${onlyFiles.length})...`, done: false });
        }

        safeProgress(2, steps[2]);
        const teamQs = teamId ? `?teamId=${encodeURIComponent(teamId)}` : '';
        // 部署名即项目名；未填则回退到一个合法的项目名（Vercel 会自动创建该项目）
        const deployName = projectName || ('naveditor-' + Date.now().toString(36));
        const body = {
            name: deployName,
            files: filePayload,
            projectSettings: { framework: null },
            target: 'production'
        };
        const depRes = await proxyFetch('api.vercel.com', `/v13/deployments${teamQs}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const depData = await depRes.json().catch(() => ({}));
        if (!depRes.ok) {
            const msg = (depData.error && depData.error.message) ? depData.error.message : ('HTTP ' + depRes.status);
            throw new Error('创建部署失败：' + msg);
        }

        safeProgress(3, steps[3]);
        const depId = depData.id;
        const depUrl = depData.url ? `https://${depData.url}` : (projectName ? `https://${projectName}.vercel.app` : 'https://vercel.com/dashboard');
        // 轮询部署状态直到 READY（最多约 60 秒）
        let ready = depData.readyState === 'READY';
        let attempts = 0;
        while (!ready && attempts < 30) {
            await sleep(2000);
            const stRes = await proxyFetch('api.vercel.com', `/v13/deployments/${depId}${teamQs}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const stData = await stRes.json().catch(() => ({}));
            if (stData.readyState === 'READY') ready = true;
            else if (stData.readyState === 'ERROR') throw new Error('部署失败：' + (stData.errorMessage || 'Vercel 返回 ERROR'));
            attempts++;
        }
        if (onProgress) onProgress(3, { name: steps[3], detail: '完成', done: true });
        return { url: depUrl, skipped: false };
    }
};

// ==================== Netlify 同步 ====================
// 部署方式：通过 Netlify REST API 内联上传文件（POST /api/v1/sites/{id}/deploys），部署出现在 Netlify Dashboard。
// 与 Vercel 一致走后端 /api/proxy 转发（已放开 api.netlify.com）。
const NetlifySync = {
    /**
     * 验证 Netlify 账号连通性（GET /api/v1/sites 校验 Token；可选校验 Site ID 是否存在）
     * 返回 { ok, tokenValid, userValid, projectValid, projectName, url, accountName, message, hint }
     */
    async checkConnectivity(account) {
        const token = sanitizeToken(account.token || '');
        const result = { ok: false, tokenValid: false, userValid: false, projectValid: false, projectName: account.siteName || account.siteId || '', url: '', accountName: '', message: '', hint: '' };
        if (!token) {
            result.message = '缺少 Personal Access Token';
            return result;
        }
        try {
            const sitesRes = await proxyFetch('api.netlify.com', '/api/v1/sites', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const sitesData = await sitesRes.json().catch(() => null);
            if (!sitesRes.ok || !Array.isArray(sitesData)) {
                result.message = 'Token 验证失败：' + ((sitesData && sitesData.message) ? sitesData.message : ('HTTP ' + sitesRes.status));
                return result;
            }
            result.tokenValid = true;
            result.userValid = true;
            result.ok = true;
            result.message = '验证通过（共 ' + sitesData.length + ' 个站点）';
            // 可选：校验 Site ID 是否存在（不存在也不影响 Token 校验通过，部署时会创建新站点）
            const siteId = account.siteId ? account.siteId.trim() : '';
            if (siteId) {
                const found = sitesData.find(s => s.id === siteId);
                if (found) {
                    result.projectValid = true;
                    result.url = found.ssl_url || found.url || '';
                } else {
                    result.hint = '指定的 Site ID 不存在，将创建新站点';
                }
            }
        } catch (e) {
            result.message = '网络错误：' + e.message;
        }
        return result;
    },

    async deployFiles(files, account, onProgress, opts = {}) {
        const token = sanitizeToken(account.token || '');
        const siteId = (account.siteId || '').trim();
        const siteName = (account.siteName || '').replace(/[^\w-]/g, '-').trim();
        if (!token) throw new Error('缺少 Personal Access Token');
        // 内联（immutable）部署：必须上传全量文件，否则会丢失站点其它文件
        const onlyFiles = opts.onlyFiles && opts.onlyFiles.length ? opts.onlyFiles : files;
        const onDetail = opts.onDetail;
        const steps = ['校验 Token', '准备文件', '创建部署', '等待就绪'];
        const safeProgress = (i, name) => { if (onProgress) onProgress(i, { name, detail: name + '...', done: false }); };

        if (onlyFiles.length === 0) {
            if (onProgress) onProgress(3, { name: steps[3], detail: '无文件，跳过部署', done: true });
            return { url: siteName ? `https://${siteName}.netlify.app` : 'https://app.netlify.com', skipped: true };
        }

        safeProgress(0, steps[0]);
        // 解析/创建站点（站点是部署目标容器）
        let targetSiteId = siteId;
        let siteUrl = '';
        if (!targetSiteId) {
            const createRes = await proxyFetch('api.netlify.com', '/api/v1/sites', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(siteName ? { name: siteName } : {})
            });
            const createData = await createRes.json().catch(() => ({}));
            if (!createRes.ok || !createData.id) {
                throw new Error('创建站点失败：' + ((createData && createData.message) ? createData.message : ('HTTP ' + createRes.status)));
            }
            targetSiteId = createData.id;
            siteUrl = createData.ssl_url || createData.url || '';
        }

        safeProgress(1, steps[1]);
        const fileMap = {};
        for (let i = 0; i < onlyFiles.length; i++) {
            const f = onlyFiles[i];
            if (onDetail) onDetail({ type: 'item-start', index: i, path: f.path });
            // 二进制文件：content 已是 base64；文本文件：UTF-8 → base64
            const dataB64 = f.binary ? f.content : utf8ToBase64(f.content);
            fileMap[f.path] = dataB64;
            if (onDetail) onDetail({ type: 'item-done', index: i, bytes: f.bytes || 0 });
            if (onProgress) onProgress(1, { name: steps[1], detail: `编码 ${f.path} (${i + 1}/${onlyFiles.length})...`, done: false });
        }

        safeProgress(2, steps[2]);
        const depRes = await proxyFetch('api.netlify.com', `/api/v1/sites/${targetSiteId}/deploys`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ files: fileMap })
        });
        const depData = await depRes.json().catch(() => ({}));
        if (!depRes.ok || !depData.id) {
            const msg = (depData && depData.message) ? depData.message : ('HTTP ' + depRes.status);
            throw new Error('创建部署失败：' + msg);
        }

        safeProgress(3, steps[3]);
        const depId = depData.id;
        let depUrl = siteUrl || (depData.ssl_url || depData.deploy_ssl_url || (siteName ? `https://${siteName}.netlify.app` : 'https://app.netlify.com'));
        // 轮询部署状态直到 ready（最多约 60 秒）
        let ready = depData.state === 'ready';
        let attempts = 0;
        while (!ready && attempts < 30) {
            await sleep(2000);
            const stRes = await proxyFetch('api.netlify.com', `/api/v1/sites/${targetSiteId}/deploys/${depId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const stData = await stRes.json().catch(() => ({}));
            if (stData.state === 'ready') { ready = true; if (stData.ssl_url) depUrl = stData.ssl_url; }
            else if (stData.state === 'error') throw new Error('部署失败：' + (stData.error_message || 'Netlify 返回 error'));
            attempts++;
        }
        if (onProgress) onProgress(3, { name: steps[3], detail: '完成', done: true });
        return { url: depUrl, skipped: false };
    }
};

// ==================== 连通性检查：错误原因提示辅助 ====================
function buildGitHubRepoHint(status) {
    if (status === 401) return 'HTTP 401：Token 无效或格式错误。请确认填写的是 GitHub Personal Access Token（以 ghp_ / github_pat_ 开头），且未过期、未被撤销。';
    if (status === 403) return 'HTTP 403：可能是 Token 权限不足或触发速率限制。请确认 Token 具备 repo 权限；若刚创建请稍候重试（GitHub 偶有缓存延迟）。';
    if (status === 404) return 'HTTP 404：仓库不存在或当前 Token 无权访问。请确认：① 仓库所有者(Owner)与仓库名(Repo)拼写、大小写正确；② 仓库为公开仓库或 Token 具备该私有仓库的 repo 权限；③ 仓库确实存在。';
    return '请确认仓库所有者、仓库名拼写正确，且 Token 具备 repo 权限。';
}


// ==================== GitHub Pages 同步 ====================
const GitHubSync = {
    /**
     * 验证 GitHub 账号连通性
     * 返回 { ok, repoValid, pagesValid, url, message }
     */
    async checkConnectivity(account) {
        const { owner, repo, token } = account;
        const result = { ok: false, repoValid: false, pagesValid: false, url: '', message: '', hint: '' };
        if (!owner || !repo || !token) {
            result.message = '缺少仓库所有者、仓库名或 Token';
            return result;
        }
        try {
            const repoRes = await proxyFetch('api.github.com', `/repos/${owner}/${repo}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28'
                }
            });
            const repoData = await repoRes.json();
            if (!repoRes.ok) {
                result.message = '仓库验证失败：' + (repoData.message || 'HTTP ' + repoRes.status);
                result.hint = buildGitHubRepoHint(repoRes.status);
                return result;
            }
            result.repoValid = true;
            const pagesRes = await proxyFetch('api.github.com', `/repos/${owner}/${repo}/pages`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28'
                }
            });
            if (pagesRes.ok) {
                const pagesData = await pagesRes.json();
                result.pagesValid = true;
                result.url = pagesData.html_url || `https://${owner}.github.io/${repo}/`;
            } else {
                result.message = '仓库存在，但 GitHub Pages 未开启（需要在仓库 Settings > Pages 中启用）';
                return result;
            }
        } catch (e) {
            result.message = '网络错误：' + e.message;
            return result;
        }
        result.ok = true;
        result.message = '所有检查通过';
        return result;
    },

    async getFileSha(owner, repo, path, branch, token) {
        // 逐段编码，保留路径分隔符 '/'，避免整串 encodeURIComponent 把 '/' 变 %2F
        const encPath = path.split('/').map(encodeURIComponent).join('/');
        try {
            const res = await withTimeout(
                proxyFetch('api.github.com', `/repos/${owner}/${repo}/contents/${encPath}?ref=${encodeURIComponent(branch)}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/vnd.github+json',
                        'X-GitHub-Api-Version': '2022-11-28'
                    }
                }),
                15000,
                null
            );
            if (res && res.ok) {
                const data = await res.json();
                return data.sha;
            }
            return null;
        } catch (e) { return null; }
    },

    async uploadFile(owner, repo, path, branch, token, content, message, sha, binary) {
        const body = {
            message: message || `Update ${path}`,
            content: binary ? content : btoa(Array.from(new TextEncoder().encode(content), b => String.fromCharCode(b)).join('')),
            branch: branch
        };
        const encPath = path.split('/').map(encodeURIComponent).join('/');
        const doPut = async (curSha) => {
            const b = Object.assign({}, body);
            if (curSha) b.sha = curSha;
            const res = await proxyFetch('api.github.com', `/repos/${owner}/${repo}/contents/${encPath}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28'
                },
                body: JSON.stringify(b)
            });
            const data = await res.json();
            if (!res.ok) {
                const err = new Error(`上传 ${path} 失败: ${data.message || 'HTTP ' + res.status}`);
                err.status = res.status;
                err.githubMessage = data.message || '';
                throw err;
            }
            return data;
        };
        try {
            return await doPut(sha);
        } catch (e) {
            // GitHub Contents API 并发/陈旧 sha 冲突（"is at ... but expected ..."）：
            // 重新读取当前 sha 后重试，最多 3 次
            if (e.status === 422 && /is at .* but expected/i.test(e.githubMessage)) {
                for (let attempt = 0; attempt < 3; attempt++) {
                    const curSha = await this.getFileSha(owner, repo, path, branch, token);
                    if (!curSha) break;
                    try {
                        return await doPut(curSha);
                    } catch (e2) {
                        if (!(e2.status === 422 && /is at .* but expected/i.test(e2.githubMessage))) throw e2;
                    }
                }
            }
            throw e;
        }
    },

    async deployFiles(files, account, onProgress, opts = {}) {
        const { owner, repo, branch, token } = account;
        const onlyFiles = opts.onlyFiles || files;
        const forceFull = !!opts.forceFull;
        const onDetail = opts.onDetail;
        const steps = [
            { name: '检查仓库', detail: '正在验证 GitHub 仓库...' },
            { name: '获取文件状态', detail: '检查现有文件...' },
            { name: '上传文件', detail: onlyFiles.length ? `上传 ${onlyFiles.length} 个文件...` : '无变更文件，跳过上传' },
            { name: '完成', detail: '等待 GitHub Pages 自动部署...' }
        ];
        onProgress(0, steps[0]);
        const conn = await this.checkConnectivity(account);
        if (!conn.ok) throw new Error(conn.message);
        onProgress(0, { ...steps[0], done: true });

        onProgress(1, steps[1]);
        // ===== 改为「单次提交」方式（Git Data API）=====
        // 一次性创建所有 blob → 构建新 tree（含新增/更新/删除）→ 创建 commit → 更新分支引用。
        // 避免 Contents API 逐文件提交时的 "is at ... but expected ..." 并发 sha 冲突。
        const deleteFiles = opts.deleteFiles || [];
        const AUTH_HEADERS = {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
        };
        const jsonHeaders = Object.assign({ 'Content-Type': 'application/json' }, AUTH_HEADERS);
        const getRefSha = async () => {
            const res = await withTimeout(proxyFetch('api.github.com', `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, { headers: AUTH_HEADERS }), 15000, null);
            if (res && res.ok) { const d = await res.json(); return d.object && d.object.sha; }
            return null;
        };
        const getCommitTreeSha = async (commitSha) => {
            const res = await withTimeout(proxyFetch('api.github.com', `/repos/${owner}/${repo}/git/commits/${commitSha}`, { headers: AUTH_HEADERS }), 15000, null);
            if (res && res.ok) { const d = await res.json(); return d.tree && d.tree.sha; }
            return null;
        };
        const getTreeEntries = async (treeSha) => {
            const res = await withTimeout(proxyFetch('api.github.com', `/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`, { headers: AUTH_HEADERS }), 30000, null);
            if (res && res.ok) { const d = await res.json(); return d.tree || []; }
            return [];
        };
        const postJson = async (path, body) => {
            const res = await proxyFetch('api.github.com', path, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(body) });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((d && d.message) || ('HTTP ' + res.status));
            return d;
        };
        const createBlob = async (base64Content) => {
            const d = await postJson(`/repos/${owner}/${repo}/git/blobs`, { content: base64Content, encoding: 'base64' });
            return d.sha;
        };
        const createTree = async (entries) => {
            const d = await postJson(`/repos/${owner}/${repo}/git/trees`, { tree: entries });
            return d.sha;
        };
        // 分片构建树：GitHub 一次性创建过大 tree 会超时（官方建议“building the tree incrementally”）。
        // 把条目分批，用 base_tree 把上一批结果作为下一批的基础，最终得到完整 tree。
        const buildTreeSharded = async (entries, batchSize = 120) => {
            let treeSha = null;
            for (let i = 0; i < entries.length; i += batchSize) {
                const batch = entries.slice(i, i + batchSize);
                const body = { tree: batch };
                if (treeSha) body.base_tree = treeSha;
                const d = await postJson(`/repos/${owner}/${repo}/git/trees`, body);
                treeSha = d.sha;
            }
            return treeSha;
        };
        const createCommit = async (message, treeSha, parentSha) => {
            const d = await postJson(`/repos/${owner}/${repo}/git/commits`, {
                message, tree: treeSha, parents: parentSha ? [parentSha] : []
            });
            return d.sha;
        };
        const updateRef = async (commitSha) => {
            const refPath = `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`;
            const res = await proxyFetch('api.github.com', refPath, {
                method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ sha: commitSha, force: false })
            });
            if (res.ok) return;
            const d = await res.json().catch(() => ({}));
            // 分支不存在时尝试创建
            if (res.status === 422 || res.status === 404) {
                const cRes = await proxyFetch('api.github.com', `/repos/${owner}/${repo}/git/refs`, {
                    method: 'POST', headers: jsonHeaders, body: JSON.stringify({ ref: 'refs/heads/' + branch, sha: commitSha })
                });
                if (cRes.ok) return;
                const cd = await cRes.json().catch(() => ({}));
                throw new Error('更新分支失败: ' + ((cd && cd.message) || 'HTTP ' + cRes.status));
            }
            throw new Error('更新分支失败: ' + ((d && d.message) || 'HTTP ' + res.status));
        };
        const encContent = (f) => f.binary ? f.content : btoa(Array.from(new TextEncoder().encode(f.content), b => String.fromCharCode(b)).join(''));

        if (onDetail) {
            onDetail({ type: 'init', total: onlyFiles.length, totalBytes: onlyFiles.reduce((s, f) => s + (f.bytes || 0), 0), items: onlyFiles.map(f => ({ path: f.path, status: 'pending' })) });
        }

        const pathSet = new Set(onlyFiles.map(f => f.path));
        const delSet = new Set(deleteFiles);
        let committed = onlyFiles.length === 0 && deleteFiles.length === 0;
        let lastErr = null;
        if (!committed) {
            for (let attempt = 0; attempt < 3 && !committed; attempt++) {
            // 每次重试重新读取分支 head（避免分支被并发移动导致的陈旧提交）
            const headSha = await getRefSha();
            let baseEntries = [];
            if (headSha) {
                const tsha = await getCommitTreeSha(headSha);
                if (tsha) baseEntries = await getTreeEntries(tsha);
            }
            onProgress(1, { ...steps[1], done: true, detail: baseEntries.length ? `读取现有文件 ${baseEntries.length} 个` : '空分支/新仓库' });

            onProgress(2, steps[2]);
            // 1) 创建文件 blob（并发 4 + 失败自动重试，避免触发 GitHub 二级限流/瞬断）
            const blobShas = [];
            let blobCount = 0;
            await mapWithConcurrency(onlyFiles, 4, async (f, i) => {
                if (onDetail) onDetail({ type: 'item-start', index: i, path: f.path });
                try {
                    let sha = null;
                    for (let attempt = 0; attempt < 3; attempt++) {
                        try {
                            sha = await createBlob(encContent(f));
                            break;
                        } catch (e2) {
                            if (attempt < 2) {
                                await new Promise(r => setTimeout(r, 1200 * (attempt + 1)));
                                continue;
                            }
                            throw e2;
                        }
                    }
                    blobShas[i] = sha;
                    blobCount++;
                    onProgress(2, { ...steps[2], detail: `创建文件对象 ${blobCount}/${onlyFiles.length}...` });
                    if (onDetail) onDetail({ type: 'item-done', index: i, bytes: f.bytes || 0 });
                } catch (e) {
                    if (onDetail) onDetail({ type: 'item-error', index: i });
                    throw e;
                }
            });

            // 2) 构建新 tree
            const entries = [];
            if (!forceFull) {
                // 增量发布：保留未被替换/删除的现有文件 + 新增/更新条目
                for (const e of baseEntries) {
                    if (!e || e.type === 'tree') continue;
                    if (pathSet.has(e.path) || delSet.has(e.path)) continue;
                    entries.push({ path: e.path, mode: e.mode || '100644', type: e.type || 'blob', sha: e.sha });
                }
            } else {
                // 全量发布：仓库只保留当前部署文件，其余旧文件全部移除
                onProgress(2, { ...steps[2], detail: `全量替换：仅保留 ${onlyFiles.length} 个部署文件` });
            }
            for (let i = 0; i < onlyFiles.length; i++) {
                entries.push({ path: onlyFiles[i].path, mode: '100644', type: 'blob', sha: blobShas[i] });
            }
            let newTreeSha;
            try {
                // 文件较多（>300）时自动分片构建，避免 GitHub 一次性建树超时
                newTreeSha = (opts.shardTree || entries.length > 300)
                    ? await buildTreeSharded(entries)
                    : await createTree(entries);
            } catch (e) {
                const msg = String((e && e.message) || '');
                if (/timed out|too large|timeout|large to process|502|504/i.test(msg)) {
                    const err = new Error('GitHub 一次性创建文件树超时/过大（文件较多）。已提供“分片发布”方案，可自动分批构建解决。');
                    err.code = 'TREE_TOO_LARGE';
                    throw err;
                }
                throw e;
            }
            // 3) 创建 commit 并更新分支引用（一次性原子提交）
            const newCommitSha = await createCommit(`Deploy via NavEditor (${onlyFiles.length} 个文件)`, newTreeSha, headSha);
            try {
                await updateRef(newCommitSha);
                committed = true;
            } catch (e) {
                lastErr = e;
                // 分支被并发移动 → 重新读取 head 重试
                console.warn('GitHub 分支更新失败，重试中:', e.message);
            }
            }
        }
        if (!committed) throw lastErr || new Error('GitHub 提交失败');
        onProgress(2, { ...steps[2], done: true });

        onProgress(3, steps[3]);
        let url = '';
        try {
            const pagesRes = await proxyFetch('api.github.com', `/repos/${owner}/${repo}/pages`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28'
                }
            });
            if (pagesRes.ok) {
                const pagesData = await pagesRes.json();
                url = pagesData.html_url || `https://${owner}.github.io/${repo}/`;
            } else {
                url = `https://${owner}.github.io/${repo}/`;
            }
        } catch (e) {
            // 网络抖动：文件已全部上传成功，仅读取 Pages 信息失败，降级返回默认 URL
            console.warn('读取 Pages 信息失败（文件已上传，视为发布成功）', e);
            url = `https://${owner}.github.io/${repo}/`;
        }
        onProgress(3, { ...steps[3], done: true });
        return { url: url.replace(/^https?:\/\//, '') };
    }
};

// ==================== 服务器 / 本地部署同步（账号类型 server）====================
// 本地部署：后端把文件写入本地站点根目录，并按需执行 PowerShell 部署前后脚本；
// 服务器部署（nginx）：后端通过 SSH（paramiko）连接，SFTP 上传文件并执行远程命令。
// 两者都返回详细的逐文件日志与错误信息，由同步弹窗的控制台区域展示。
const ServerSync = {
    async checkConnectivity(account) {
        const res = await fetch('/api/server-check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ account })
        });
        const j = await res.json().catch(() => ({}));
        return {
            ok: !!(j && j.ok),
            message: (j && j.message) || (j && j.error) || '请求失败',
            error: (j && j.error) || '',
            logs: (j && j.logs) || []
        };
    },

    async deploy(files, account, onProgress, onLog, opts = {}) {
        const steps = [
            '连接目标',
            '写入文件',
            '清理旧文件',
            '执行脚本',
            '完成'
        ];
        const safeProgress = (i, name, detail, done) => {
            if (onProgress) onProgress(i, { name, detail, done: !!done });
        };
        const log = (level, text) => {
            if (onLog) onLog({ level, text });
        };
        const isLocal = account.deployType === 'local';
        const targetLabel = isLocal
            ? ('本地目录 ' + (account.localPath || ''))
            : ('服务器 ' + ((account.host || '') + ':' + (account.port || 22)) + ' → ' + (account.remotePath || '/var/www/html'));

        safeProgress(0, steps[0], '准备部署到' + targetLabel, false);
        log('info', (isLocal ? '本地部署' : '服务器部署(nginx)') + ' 目标：' + targetLabel);

        const payload = {
            account,
            deployType: isLocal ? 'local' : 'nginx',
            files,
            deleteFiles: opts.deleteFiles || []
        };
        if (!isLocal && account.remoteCommand) payload.command = account.remoteCommand;

        const res = await fetch('/api/server-deploy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const j = await res.json().catch(() => ({}));
        if (j.logs && Array.isArray(j.logs)) {
            for (const line of j.logs) {
                if (line && line.text) log(line.level || 'info', line.text);
            }
        }
        if (!j.ok) {
            throw new Error((j.error || '部署失败') + (j.logs && j.logs.length ? '（详见下方控制台日志）' : ''));
        }
        safeProgress(1, steps[1], '文件写入完成', true);
        safeProgress(2, steps[2], '旧文件清理完成', true);
        safeProgress(3, steps[3], '脚本执行完成', true);
        safeProgress(4, steps[4], '部署成功', true);
        return { url: (j.url || '').replace(/^https?:\/\//, ''), success: true };
    }
};

// ==================== 常用 FontAwesome 图标列表 ====================
const FA_ICONS = [
    'fas fa-star', 'far fa-star', 'fas fa-flask', 'fas fa-film', 'far fa-folder-open',
    'fas fa-tools', 'fas fa-pencil-alt', 'fas fa-code', 'fas fa-laptop-code', 'fas fa-palette',
    'fas fa-cube', 'fas fa-book', 'fas fa-graduation-cap', 'fas fa-chart-line', 'fas fa-shopping-cart',
    'fas fa-newspaper', 'fas fa-gamepad', 'fas fa-music', 'fas fa-camera', 'fas fa-image',
    'fas fa-video', 'fas fa-podcast', 'fas fa-rss', 'fas fa-wifi', 'fas fa-cloud',
    'fas fa-database', 'fas fa-server', 'fas fa-terminal', 'fas fa-keyboard', 'fas fa-desktop',
    'fas fa-mobile-alt', 'fas fa-tablet-alt', 'fas fa-headphones', 'fas fa-microphone', 'fas fa-print',
    'fas fa-envelope', 'fas fa-map-marker-alt', 'fas fa-globe', 'fas fa-language', 'fas fa-search',
    'fas fa-cog', 'fas fa-cogs', 'fas fa-wrench', 'fas fa-hammer', 'fas fa-shield-alt',
    'fas fa-lock', 'fas fa-key', 'fas fa-unlock', 'fas fa-plug', 'fas fa-bolt',
    'fas fa-rocket', 'fas fa-paper-plane', 'fas fa-anchor', 'fas fa-ship', 'fas fa-plane',
    'fas fa-car', 'fas fa-bus', 'fas fa-train', 'fas fa-bicycle', 'fas fa-walking',
    'fas fa-home', 'fas fa-building', 'fas fa-hospital', 'fas fa-school', 'fas fa-university',
    'fas fa-store', 'fas fa-coffee', 'fas fa-utensils', 'fas fa-pizza-slice', 'fas fa-beer',
    'fas fa-heart', 'fas fa-heartbeat', 'fas fa-brain', 'fas fa-tooth', 'fas fa-stethoscope',
    'fas fa-ambulance', 'fas fa-pills', 'fas fa-syringe', 'fas fa-thermometer', 'fas fa-band-aid',
    'fas fa-fire', 'fas fa-leaf', 'fas fa-tree', 'fas fa-seedling', 'fas fa-recycle',
    'fas fa-sun', 'fas fa-moon', 'fas fa-star-of-life', 'fas fa-balance-scale', 'fas fa-gavel',
    'fas fa-landmark', 'fas fa-flag', 'fas fa-trophy', 'fas fa-medal', 'fas fa-award',
    'fas fa-crown', 'fas fa-gem', 'fas fa-ring', 'fas fa-magnet', 'fas fa-atom',
    'fas fa-brain', 'fas fa-calculator', 'fas fa-flask', 'fas fa-vial', 'fas fa-microscope',
    'fas fa-telescope', 'fas fa-satellite', 'fas fa-robot', 'fas fa-chess', 'fas fa-dice',
    'fab fa-github', 'fab fa-gitlab', 'fab fa-docker', 'fab fa-aws', 'fab fa-google',
    'fab fa-apple', 'fab fa-microsoft', 'fab fa-linux', 'fab fa-python', 'fab fa-js',
    'fab fa-html5', 'fab fa-css3-alt', 'fab fa-react', 'fab fa-vuejs', 'fab fa-node-js',
    'fab fa-npm', 'fab fa-yarn', 'fab fa-figma', 'fab fa-sketch', 'fab fa-dribbble',
    'fab fa-behance', 'fab fa-codepen', 'fab fa-stack-overflow', 'fab fa-medium', 'fab fa-wordpress',
];

// ==================== Vue 应用 ====================
const { createApp, ref, reactive, computed, onMounted, onUnmounted, watch, nextTick } = Vue;

const App = {
    setup() {
        // === 状态 ===
        const data = reactive({
            site: {
                title: '', description: '', keywords: '', favicon: '',
                logoLight: '', logoDark: '',
                logoCollapsedLight: '', logoCollapsedDark: '',
                sidebarTitleStyle: { bold: false, italic: false, fontFamily: '', fontSize: '', color: '' },
                sidebarPopupBackgroundExpanded: '#151618',  // 未折叠态下拉菜单背景
                sidebarPopupBackgroundCollapsed: '#151618', // 折叠态悬浮菜单背景
                sidebarTextColor: '#b2b8be',                // 访客页面侧栏普通文字颜色
                // 关于导航快捷入口（独立于菜单键设置）—— 顶部 Logo 旁的快捷按钮
                aboutLink: { enabled: true, icon: 'fa fa-info-circle', text: '关于导航', url: 'about', target: '_blank' },
                // 点击侧边栏分类时目标标题的高亮（闪烁）效果
                scrollHighlight: { enabled: true, color: '#ff6b6b', duration: 1200, blinkCount: 3, blinkDuration: 300, blinkInterval: 150 }
            },
            // 网站卡片闪烁模版库（跨网站复用）
            blinkTemplates: [
                { name: '柔和提醒', settings: { count: 3, duration: 400, interval: 200, color: '#ff6b6b' } },
                { name: '醒目强调', settings: { count: 5, duration: 250, interval: 100, color: '#ffd93d' } },
                { name: '紧急闪烁', settings: { count: 8, duration: 150, interval: 80, color: '#ff4757' } }
            ],
            categories: [],
            friendLinks: [],
            deployBaseline: {}, // 发布基线：{ [accountKey]: { [path]: hash } }，增量发布用
            searchConfig: { tabs: [], defaultEngine: 'https://www.baidu.com/s?wd=', searchBoxWidth: 600,
                searchTabTextColor: '#ffffff', searchPlaceholderColor: '#ffffff', searchEngineTextColor: '#ffffff', searchBoxBackgroundColor: 'rgba(255,255,255,0.12)',
                modalSearchTabTextColor: '#cccccc', modalSearchPlaceholderColor: 'rgba(255,255,255,0.45)', modalSearchEngineTextColor: 'rgba(255,255,255,0.65)', modalSearchBoxBackgroundColor: 'rgba(255,255,255,0.12)', modalSearchBackdropColor: 'rgba(22,30,40,0.92)' },
            // 顶部背景（搜索栏区域）：默认深蓝星空壁纸
            background: { type: 'image', url: 'assets/images/wallpapers/壁纸（渐变）/深蓝星空.svg' },
            // 底部背景（卡片区）：默认青绿山水壁纸
            bottomBackground: { type: 'image', url: 'assets/images/wallpapers/壁纸（渐变）/青绿山水.svg' },
            // 页脚背景（最底部版权信息条）：默认无背景，保持原有外观
            footerBackground: { type: 'none', url: '' },
            // 用户自定义壁纸（壁纸库管理，持久化）
            customWallpapers: [],
            // 壁纸自定义排序（存唯一标识：内置用 url、自定义用 id），空数组=按默认顺序
            wallpaperOrder: [],
            // 壁纸分组（分类）自定义顺序/新增，持久化；空数组=回退内置 6 组
            wallpaperGroups: [],
            // 每日文字（访客页面右上角语录）
            dailyText: { enabled: true, source: 'hitokoto', customText: '', textColor: '#333333' },
            // 访客页面两侧广告位（每侧4宫格，可拼接，支持图片/GIF 与背景闪烁模块）
            adSlots: {
                enabled: true,
                unifiedSize: true,            // true=所有广告位共用全局尺寸；false=每个广告位可独立设置
                width: 380,
                height: 49,
                _limits: { maxWidth: 180, suggestHeight: 56 },   // 尺寸阈值（宽上限/高建议，可在 UI 中调整）
                _showLimits: false,                                // 阈值调节面板展开状态
                left: [
                    { id: 'ad_l_0', type: 'none', image: '', url: '', width: 380, height: 49, blink: { enabled: false, mode: 'count', count: 3, duration: 300, interval: 150, color: '#ff6b6b', templateName: '', opacity: 0.5 }, span: 'none', fit: 'contain', background: 'transparent' },
                    { id: 'ad_l_1', type: 'none', image: '', url: '', width: 380, height: 49, blink: { enabled: false, mode: 'count', count: 3, duration: 300, interval: 150, color: '#ff6b6b', templateName: '', opacity: 0.5 }, span: 'none', fit: 'contain', background: 'transparent' },
                    { id: 'ad_l_2', type: 'none', image: '', url: '', width: 380, height: 49, blink: { enabled: false, mode: 'count', count: 3, duration: 300, interval: 150, color: '#ff6b6b', templateName: '', opacity: 0.5 }, span: 'none', fit: 'contain', background: 'transparent' },
                    { id: 'ad_l_3', type: 'none', image: '', url: '', width: 380, height: 49, blink: { enabled: false, mode: 'count', count: 3, duration: 300, interval: 150, color: '#ff6b6b', templateName: '', opacity: 0.5 }, span: 'none', fit: 'contain', background: 'transparent' }
                ],
                right: [
                    { id: 'ad_r_0', type: 'none', image: '', url: '', width: 380, height: 49, blink: { enabled: false, mode: 'count', count: 3, duration: 300, interval: 150, color: '#ff6b6b', templateName: '', opacity: 0.5 }, span: 'none', fit: 'contain', background: 'transparent' },
                    { id: 'ad_r_1', type: 'none', image: '', url: '', width: 380, height: 49, blink: { enabled: false, mode: 'count', count: 3, duration: 300, interval: 150, color: '#ff6b6b', templateName: '', opacity: 0.5 }, span: 'none', fit: 'contain', background: 'transparent' },
                    { id: 'ad_r_2', type: 'none', image: '', url: '', width: 380, height: 49, blink: { enabled: false, mode: 'count', count: 3, duration: 300, interval: 150, color: '#ff6b6b', templateName: '', opacity: 0.5 }, span: 'none', fit: 'contain', background: 'transparent' },
                    { id: 'ad_r_3', type: 'none', image: '', url: '', width: 380, height: 49, blink: { enabled: false, mode: 'count', count: 3, duration: 300, interval: 150, color: '#ff6b6b', templateName: '', opacity: 0.5 }, span: 'none', fit: 'contain', background: 'transparent' }
                ]
            },
            about: {
                title: '关于作者',
                subtitle: '热爱技术，专注于软件开发与创新',
                intro: '大家好，我叫Tom，来自于北京，专业是计算机技术。在过去的5年中，我一直在某大型互联网公司担任软件工程师，专注于Java/Python/Javascript的开发和研究。\n\n在大学期间，我就开始对编程产生浓厚的兴趣，通过自学和实践，我掌握了各种编程语言和开发工具。在工作的期间，我主要负责开发和维护公司的后端系统，涉及到的主要技术栈是Java和Spring Boot。在这个过程中，我积累了丰富的经验，能够熟练地使用Java进行后端开发，并且能够快速地解决开发过程中遇到的各种问题。\n\n除了Java和Spring Boot，我还熟悉Python、C++等其他编程语言，并且能够使用JavaScript进行前端开发。此外，我还熟悉数据库的操作，能够熟练使用MySQL、Oracle等数据库管理系统。',
                introHtml: '',
                introMode: 'text',
                skills: [
                    { icon: 'fab fa-java', name: 'Java / Spring Boot' },
                    { icon: 'fab fa-python', name: 'Python' },
                    { icon: 'fab fa-js', name: 'JavaScript' },
                    { icon: 'fas fa-database', name: 'MySQL / Oracle' }
                ],
                philosophy: '在工作中，我注重团队协作，能够与团队成员保持良好的沟通和合作。同时，我还注重代码的可读性和可维护性，能够编写高质量的代码。我对于新技术的学习充满热情，并且能够将所学技术应用到实际工作中。\n\n除了工作和学习，我还积极参加各种技术社区和活动，通过与他人的交流和学习，不断提升自己的技术水平和解决问题的能力。',
                philosophyHtml: '',
                philosophyMode: 'text',
                contacts: [],
                leftAds: [],
                rightAds: [],
                template: '页脚/关于导航'
            },
            // 站点提交页面配置
            commit: {
                title: '网址提交',
                subtitle: '提交您的优质网站，我们将在审核后收录到网址导航中',
                guidelines: [
                    '请确保网站内容合法、健康，符合相关法律法规',
                    '网站应正常访问，不含恶意代码或病毒',
                    '提供真实有效的网站信息，便于我们审核',
                    '我们会在3-5个工作日内完成审核，审核结果将通过邮件通知'
                ],
                successMessage: '提交成功！我们会尽快审核您的网站。',
                categories: ['常用工具','科研办公','开发设计','效率办公','社交媒体','资源下载','生活服务','学习教育','其他']
            },
            // 底部备案/版权信息
            footer: {
                domain: '',
                note: '本站内容来自于网络，不对网站内容负责',
                copyright: '@2025 By',
                copyrightName: 'NavEditor',
                copyrightUrl: 'https://github.com/yiming2016/NavEditor',
                beian: '粤ICP备xxxx号',
                beianUrl: 'https://beian.miit.gov.cn/#/Integrated/recordQuery',
                gongan: '粤公网安备xxxx号',
                gonganUrl: 'https://beian.mps.gov.cn/#/query/webSearch'
            },
            menuKeys: [
                { id: 'mk-submit', icon: 'fas fa-file-upload', text: '网站提交', url: 'commit.html', target: '_blank' },
                { id: 'mk-friend', icon: 'fab fa-staylinked', text: '友情链接', url: '#friendlink', target: '' }
                // 注意：「关于导航」已独立为顶部快捷按钮 site.aboutLink，不再出现在 menuKeys
            ],
            // 页脚菜单顺序（前三个可在编辑器中拖拽排序，同步访客页左下角）：mk-submit / mk-friend / about-link
            footerMenuOrder: ['mk-submit', 'mk-friend', 'about-link'],
            // 页脚自定义菜单项（用户通过"+"按钮添加，参与拖拽排序，同步访客页左下角）：{ id, text, icon, url, target }
            footerMenuItems: [],
            // 固定页脚菜单的图标/名称（由页脚直接编辑管理，替代站点设置中的"关于导航快捷入口"）：
            footerFixedMeta: {
                'about-link': { icon: 'fa fa-info-circle', text: '关于导航' },
                'mk-submit': { icon: 'fas fa-paper-plane', text: '网站提交' },
                'mk-friend': { icon: 'fas fa-link', text: '友情链接' }
            },
            // 导出下拉选项可见性 + 各导出项包含的文件/数据模块
            exportSettings: {
                showJson: true,   // JSON(配置)
                showHtml: true,   // HTML(改动文件)
                showDeploy: true, // 导出部署文件
                // 各导出项具体包含内容（默认全选）
                fileSettings: {
                    // JSON(配置)：导出哪些顶层数据模块
                    json: { site: true, categories: true, searchConfig: true, wallpapers: true, about: true, commit: true, friendLinks: true, footer: true },
                    // HTML(改动文件)：导出哪些文件
                    html: { index: true, about: true, commit: true, customCss: true, notFound: true },
                    // 导出部署文件：在 html 基础上额外含「静态资源」
                    deploy: { index: true, about: true, commit: true, customCss: true, notFound: true, assets: true }
                },
                // 额外文件/文件夹（相对于项目根目录，仅对「导出部署文件」生效）：强制包含，优先级高于排除规则
                includePaths: []
            },
            deploySettings: {
                // 增量发布包含的文件（只上传这些文件中发生变更者）
                incrementalFiles: { index: true, about: true, commit: true, customCss: true, notFound: true, assets: true },
                // 全量发布包含的文件（每次上传这些文件全部）
                fullFiles: { index: true, about: true, commit: true, customCss: true, notFound: true, assets: true },
                // 额外强制包含路径（增量/全量共用），相对于项目根目录
                includePaths: [],
                // 默认置顶按钮：'incremental'（增量发布）| 'full'（全量发布）| 'settings'（发布设置）
                defaultTop: 'incremental'
            },
            // SEO / 营销配置（图形化「营销」面板；注入导出页面的 <head> 并生成 robots.txt / sitemap.xml）
            seo: {
                enabled: true,
                baseUrl: '',                // 部署后的站点访问地址（用于 canonical / sitemap / OG 默认 URL）
                // 基础 SEO
                title: '',                  // 留空则使用站点标题 site.title
                description: '',
                keywords: '',
                author: '',
                robots: 'index,follow',
                // Open Graph 分享卡片
                ogEnabled: true,
                ogTitle: '',
                ogDescription: '',
                ogImage: '',
                ogType: 'website',
                ogSiteName: '',
                ogLocale: 'zh_CN',
                // Twitter Card
                twitterEnabled: true,
                twitterCard: 'summary_large_image',
                twitterTitle: '',
                twitterDescription: '',
                twitterImage: '',
                // 站点验证
                verification: {
                    google: '', bing: '', baidu: '', yandex: '', sogou: '', shenma: '', qihoo: ''
                },
                // 结构化数据 JSON-LD
                structuredDataEnabled: true,
                sdType: 'WebSite',          // WebSite | Organization | Person
                sdName: '',
                sdUrl: '',
                sdLogo: '',
                sdDescription: '',
                sdSameAs: '',               // 每行一个同站链接
                // 高级
                canonicalUrl: '',
                generateRobots: true,
                robotsRules: [
                    { userAgent: '*', allow: '/', disallow: '' }
                ],
                generateSitemap: true,
                customHead: ''
            },
        });

        // 迁移 / 兜底：固定页脚菜单图标名称（footerFixedMeta），兼容老数据 site.aboutLink / 顶层 aboutLink
        const ensureFooterMeta = () => {
            const defaults = {
                'about-link': { icon: 'fa fa-info-circle', text: '关于导航', iconColor: '#b2b8be' },
                'mk-submit': { icon: 'fas fa-paper-plane', text: '网站提交', iconColor: '#b2b8be' },
                'mk-friend': { icon: 'fas fa-link', text: '友情链接', iconColor: '#b2b8be' }
            };
            const fm = (data.footerFixedMeta && typeof data.footerFixedMeta === 'object') ? { ...data.footerFixedMeta } : {};
            const legacy = (data.site && data.site.aboutLink) || data.aboutLink;
            if (legacy && legacy.icon) {
                fm['about-link'] = { iconColor: '#b2b8be', icon: legacy.icon || defaults['about-link'].icon, text: legacy.text || defaults['about-link'].text };
            }
            for (const k in defaults) {
                if (!fm[k] || !fm[k].text) fm[k] = { iconColor: '#b2b8be', ...defaults[k], ...(fm[k] || {}) };
            }
            // 防污染：关于导航固定项 / 全局 about 模板不应被网站提交模板覆盖
            if (data.about && (data.about.template === '页脚/网站提交' || data.about.template === '网站提交')) {
                data.about.template = '页脚/关于导航';
            }
            if (fm['about-link'] && (fm['about-link'].template === '页脚/网站提交' || fm['about-link'].template === '网站提交')) {
                fm['about-link'].template = '页脚/关于导航';
            }
            // 关于导航固定项模板始终与全局 about 模板保持一致（默认“页脚/关于导航”）
            if (data.about && data.about.template && fm['about-link']) {
                fm['about-link'].template = data.about.template;
            }
            data.footerFixedMeta = fm;
            // 修正需落盘，否则刷新后又从 setting 读回被污染的旧值（#6）
            if (typeof persistData === 'function') {
                try { persistData({ silent: true, mark: false }); } catch (_) {}
            }
        };
        // 老数据迁移：为分类 / 页脚自定义菜单 / 顶部菜单项补 iconColor 字段（缺省空=默认灰）
        const migrateIconColors = () => {
            if (Array.isArray(data.categories)) data.categories.forEach(c => { if (c && (!c.iconColor || c.iconColor === '')) c.iconColor = '#b2b8be'; });
            if (Array.isArray(data.footerMenuItems)) data.footerMenuItems.forEach(it => { if (it && (!it.iconColor || it.iconColor === '')) it.iconColor = '#b2b8be'; });
            if (Array.isArray(data.menuKeys)) data.menuKeys.forEach(m => { if (m && (!m.iconColor || m.iconColor === '')) m.iconColor = '#b2b8be'; });
            if (data.footerFixedMeta && typeof data.footerFixedMeta === 'object') {
                for (const k in data.footerFixedMeta) {
                    const fm = data.footerFixedMeta[k];
                    if (fm && (!fm.iconColor || fm.iconColor === '')) fm.iconColor = '#b2b8be';
                }
            }
        };

        const selectedCategoryId = ref(null);
        const selectedSubId = ref(null);
        // 左侧树键盘导航状态
        const kbActive = ref(false);   // 是否处于键盘导航模式（鼠标点击后置 false）
        const kbIndex = ref(-1);       // 当前在扁平列表中的索引
        const kbBtn = ref(-1);         // -1=未选中按钮, 0=编辑, 1=删除
        const kbFocusKey = ref('');    // 当前聚焦项 key：cat:<id> 或 sub:<catId>:<subId>
        const treeSearchQuery = ref('');
        const loaded = ref(false);
        const hasData = ref(false);

        // 顶部工具栏「导出」下拉菜单开关
        const exportMenuOpen = ref(false);
        const exportBtnEl = ref(null);
        const exportMenuStyle = ref({ position: 'fixed', top: '0px', left: '0px', minWidth: '150px' });
        const updateExportMenuPosition = (btnEl) => {
            const btn = btnEl || exportBtnEl.value;
            if (!btn) return;
            const r = btn.getBoundingClientRect();
            exportMenuStyle.value = {
                position: 'fixed',
                top: (r.bottom + 4) + 'px',
                left: r.left + 'px',
                minWidth: Math.max(150, r.width) + 'px'
            };
        };
        const toggleExportMenu = (e) => {
            exportMenuOpen.value = !exportMenuOpen.value;
            if (exportMenuOpen.value) {
                const btn = (e && e.currentTarget) ? e.currentTarget.closest('button') : exportBtnEl.value;
                updateExportMenuPosition(btn);
            }
        };
        const closeExportMenu = () => { exportMenuOpen.value = false; };

        // 「导出设置」弹窗（控制导出下拉中 3 个选项可见性）
        const exportSettingsOpen = ref(false);
        const openExportSettings = () => {
            exportMenuOpen.value = false;
            exportSettingsOpen.value = true;
        };
        const closeExportSettings = () => { exportSettingsOpen.value = false; };

        // 顶部工具栏「发布」下拉菜单开关（增量发布 / 全量发布 / 发布设置）
        const publishMenuOpen = ref(false);
        const publishBtnEl = ref(null);
        const publishMenuStyle = ref({ position: 'fixed', top: '0px', left: '0px', minWidth: '150px' });
        const updatePublishMenuPosition = (btnEl) => {
            const btn = btnEl || publishBtnEl.value;
            if (!btn) return;
            const r = btn.getBoundingClientRect();
            publishMenuStyle.value = {
                position: 'fixed',
                top: (r.bottom + 4) + 'px',
                left: r.left + 'px',
                minWidth: Math.max(150, r.width) + 'px'
            };
        };
        const togglePublishMenu = (e) => {
            publishMenuOpen.value = !publishMenuOpen.value;
            if (publishMenuOpen.value) {
                const btn = (e && e.currentTarget) ? e.currentTarget.closest('button') : publishBtnEl.value;
                updatePublishMenuPosition(btn);
            }
        };
        const closePublishMenu = () => { publishMenuOpen.value = false; };

        // 「发布设置」弹窗
        const openPublishSettings = () => {
            publishMenuOpen.value = false;
            modal.publishSettings = true;
        };
        const closePublishSettings = () => { modal.publishSettings = false; };
        const resetPublishSettings = () => {
            data.deploySettings.incrementalFiles = { index: true, about: true, commit: true, customCss: true, notFound: true, assets: true };
            data.deploySettings.fullFiles = { index: true, about: true, commit: true, customCss: true, notFound: true, assets: true };
            data.deploySettings.includePaths = [];
            data.deploySettings.defaultTop = 'quick';
        };

        // 主按钮显示的文字与默认动作（由 deploySettings.defaultTop 决定）
        const publishMainLabel = computed(() => {
            const t = (data.deploySettings && data.deploySettings.defaultTop) || 'quick';
            if (t === 'full') return '全量发布';
            if (t === 'quick') return '快速发布';
            if (t === 'settings') return '发布设置';
            return '增量发布';
        });
        const onPublishMainClick = () => {
            const t = (data.deploySettings && data.deploySettings.defaultTop) || 'quick';
            publishMenuOpen.value = false;
            if (t === 'settings') { openPublishSettings(); return; }
            if (t === 'quick') { quickPublish(); return; }
            syncToCloudflare(t === 'full');
        };

        // === 发布确认（增量/全量）+ 未保存先保存 ===
        const publishConfirmApproved = ref(false);
        const publishPending = ref(null);   // { forceFull, sourceData, sourceLabel, sourceVersionId }
        const publishSaveDone = ref(false);
        // GitHub 建树超时/过大时的“分片发布”方案
        const githubShardTree = ref(false);       // 本次发布强制分片构建树
        const treeTooLargeContext = ref(null);    // 失败时的发布上下文，供一键重试
        const publishConfirmText = computed(() => {
            const acc = cfAccounts.value.find(a => a.id === activeAccountId.value);
            const isFull = !!(publishPending.value && publishPending.value.forceFull);
            if (!acc) {
                return {
                    title: isFull ? '全量发布确认' : '增量发布确认',
                    line1: isFull ? '执行全量发布？' : '执行增量发布？',
                    line2: isFull ? '这会清理目标位置所有内容' : '只上传有变更的文件（增量发布）'
                };
            }
            let target = '';
            if (acc.type === 'github') target = '用户 ' + (acc.owner || '?') + ' 下的仓库 ' + (acc.repo || '?');
            else if (acc.type === 'cloudflare') target = '账户 ' + (acc.accountId || '?') + ' 的项目 ' + (acc.projectName || '?');
            else if (acc.type === 'vercel') target = (acc.teamId ? '团队 ' + acc.teamId + ' 的' : '') + '项目 ' + (acc.projectName || '?');
            else if (acc.type === 'netlify') target = '站点 ' + (acc.siteName || acc.siteId || '?');
            else if (acc.type === 'server' && acc.deployType === 'local') target = '本地目录 ' + (acc.localPath || '?');
            else if (acc.type === 'server') target = '服务器 ' + (acc.host || '?') + ':' + (acc.remotePath || '?');
            else target = acc.name || '目标位置';
            const platform = acc.type === 'github' ? 'Github' : acc.type === 'cloudflare' ? 'Cloudflare' : acc.type === 'vercel' ? 'Vercel' : acc.type === 'netlify' ? 'Netlify' : acc.type === 'server' ? '服务器' : '';
            let cleanTarget = '内容';
            if (acc.type === 'github') cleanTarget = '仓库';
            else if (acc.type === 'cloudflare' || acc.type === 'vercel') cleanTarget = '项目';
            else if (acc.type === 'netlify') cleanTarget = '站点';
            else if (acc.type === 'server' && acc.deployType === 'local') cleanTarget = '目录';
            else if (acc.type === 'server') cleanTarget = '远程目录';
            return {
                title: isFull ? '全量发布确认' : '增量发布确认',
                line1: `发布到${platform}${target}？`,
                line2: isFull ? `这会清理原${cleanTarget}所有内容` : '只上传有变更的文件（增量发布）'
            };
        });
        const confirmPublishSave = async () => {
            modal.publishSavePrompt = false;
            try {
                await persistData({ mark: false, silent: true });
                dirty.value = false;
            } catch (e) {
                showToast('保存失败：' + (e.message || e), 'error');
                return;
            }
            publishSaveDone.value = true;
            modal.publishConfirm = true; // 第二个弹窗：发布确认
        };
        const cancelPublishSave = () => {
            modal.publishSavePrompt = false;
            publishPending.value = null;
            publishSaveDone.value = false;
        };
        const confirmPublish = () => {
            modal.publishConfirm = false;
            const st = publishPending.value;
            if (!st) return;
            publishConfirmApproved.value = true;
            Promise.resolve(syncToCloudflare(st.forceFull, st.sourceData, st.sourceLabel, st.sourceVersionId))
                .finally(() => {
                    publishConfirmApproved.value = false;
                    publishSaveDone.value = false;
                    publishPending.value = null;
                });
        };
        const cancelPublish = () => {
            modal.publishConfirm = false;
            publishPending.value = null;
            publishSaveDone.value = false;
        };

        // 导出设置：哪个导出项的「文件选择」子面板处于展开（'json'|'html'|'deploy'|null）
        const exportFilePanel = ref(null);
        const toggleExportFilePanel = (key) => {
            exportFilePanel.value = (exportFilePanel.value === key) ? null : key;
        };
        // 恢复默认：导出项可见性 + 各导出项文件/模块全部重置为默认（全选）
        const resetExportSettings = () => {
            data.exportSettings.showJson = true;
            data.exportSettings.showHtml = true;
            data.exportSettings.showDeploy = true;
            data.exportSettings.fileSettings.json = { site: true, categories: true, searchConfig: true, wallpapers: true, about: true, commit: true, friendLinks: true, footer: true };
            data.exportSettings.fileSettings.html = { index: true, about: true, commit: true, customCss: true, notFound: true };
            data.exportSettings.fileSettings.deploy = { index: true, about: true, commit: true, customCss: true, notFound: true, assets: true };
            showToast('已恢复默认下载设置', 'success');
        };

        // 未保存状态标记（用于刷新提醒）
        const dirty = ref(false);
        // 初始加载锁：加载/赋值时临时挂起 autosave 与 dirty 监听，避免“加载即变脏”的误报
        const loading = ref(true);

        const editingSidebarTitle = ref(false);
        const tempSidebarTitle = ref('');

        // 弹窗状态
        const modal = reactive({
            site: false,
            category: false,
            subCategory: false,
            siteEdit: false,
            settings: false,
            versions: false,
            profiles: false,
            sync: false,
            shareModules: false,
            iconPicker: false,
            friendLinks: false,
            accountEdit: false,
            searchConfig: false,
            bgConfig: false,
            about: false,
            commit: false,
            iconEditor: false,      // 新图标编辑器（image/color/text 三模式）
            imageCropper: false,
            menuKeys: false,
            menuKeyEdit: false,
            headerConfig: false,  // 顶部 Logo + 标题 + 关于导航 + 备案
            sidebarTop: false,    // 侧边栏顶部设置（Logo + 标题）
            unsavedAlert: false,    // 未保存提醒弹窗
            noVersionConfirm: false, // 无历史版本时保存确认弹窗
            dailyText: false,       // 每日文字配置弹窗
            adSlots: false,         // 两侧广告位配置弹窗
            wallpaperLibrary: false, // 壁纸库管理弹窗
            addFooterMenu: false,    // 添加页脚自定义菜单弹窗
            editFooterMenu: false,   // 编辑页脚菜单（固定项/自定义项）弹窗
            publishSettings: false,  // 发布设置弹窗
            publishConfirm: false,   // 全量发布确认弹窗
            publishSavePrompt: false, // 发布前未保存询问
            treeTooLarge: false,     // GitHub 建树超时/过大：提供分片发布方案
            templateSettings: false, // 默认模板设置弹窗
            seo: false,              // SEO 营销配置弹窗
            versionSync: false,      // 版本同步信息弹窗
            confirm: false           // 通用删除确认弹窗
        });

        // 通用确认弹窗（替代浏览器 confirm；支持二次确认、额外提示说明）
        const confirmDialog = reactive({
            title: '确认删除',
            message: '',
            note: '',
            confirmText: '删除',
            danger: true,
            icon: 'fas fa-exclamation-triangle',
            onConfirm: null
        });
        const askConfirm = (opts = {}) => {
            confirmDialog.title = opts.title || '确认删除';
            confirmDialog.message = opts.message || '';
            confirmDialog.note = opts.note || '';
            confirmDialog.confirmText = opts.confirmText || '删除';
            confirmDialog.danger = opts.danger !== false;
            confirmDialog.icon = opts.icon || (opts.danger === false ? 'fas fa-question-circle' : 'fas fa-exclamation-triangle');
            confirmDialog.onConfirm = (typeof opts.onConfirm === 'function') ? opts.onConfirm : null;
            modal.confirm = true;
        };
        const closeConfirmDialog = () => {
            modal.confirm = false;
            confirmDialog.onConfirm = null;
        };
        // 确认按钮：先关闭弹窗再执行动作（收藏版本二次确认时由回调再打开新弹窗）
        const runConfirmAction = () => {
            const fn = confirmDialog.onConfirm;
            modal.confirm = false;
            confirmDialog.onConfirm = null;
            if (typeof fn === 'function') fn();
        };

        // 编辑表单
        const editForm = reactive({
            category: { id: null, name: '', icon: 'fas fa-folder', iconColor: '#b2b8be', continueView: false },
            subCategory: { id: null, parentId: null, name: '' },
            site: { index: -1, subId: null, name: '', url: '', description: '', logo: '', bgType: 'image', bgColor: '', bgText: '',
                // 网站卡片闪烁模块
                blink: { enabled: false, mode: 'count', count: 3, duration: 300, interval: 150, color: '#ff6b6b', templateName: '', intensity: 'normal' }
            },
            siteConfig: {
                title: '', description: '', keywords: '', favicon: '', logoLight: '', logoDark: '',
                aboutLink: { enabled: true, icon: 'fa fa-info-circle', text: '关于导航', url: 'about', target: '_blank' }
            },
            headerConfig: {
                title: '',
                aboutLink: { enabled: true, icon: 'fa fa-info-circle', text: '关于导航', url: 'about', target: '_blank' },
                footer: { note: '', copyright: '', copyrightName: '', copyrightUrl: '', beian: '', beianUrl: '', gongan: '', gonganUrl: '', domain: '' }
            },
sidebarTop: {
                logoLight: '', sidebarTitle: '',
                logoCollapsedLight: '',
                sidebarTitleStyle: { bold: false, italic: false, fontFamily: '', fontSize: '', color: '' },
                sidebarBackground: { type: 'color', color: '#ffffff', url: '', fit: 'cover', width: 170 },
                sidebarBackgroundCollapsed: { url: '', src: '', edit: null, width: 60 },
                sidebarPopupBackgroundExpanded: '#151618',
                sidebarPopupBackgroundCollapsed: '#151618',
                sidebarTextColor: '#b2b8be'
            },
            account: { id: null, type: 'cloudflare', name: '', accountId: '', projectName: '', apiToken: '', owner: '', repo: '', branch: 'main', token: '' },
            iconPicker: { target: null, current: '' },
            friendLinks: [],
            about: { title: '', content: '' },
            commit: { title: '', subtitle: '', guidelines: '', successMessage: '', categories: '' },
            menuKey: { id: null, icon: 'fas fa-link', text: '', url: '', target: '', iconColor: '#b2b8be' },
            // 图片裁剪器上下文：targetPath 用于写入（点对点回填到某字段）
            imageCropper: {
                open: false,
                tabIdx: -1,
                engIdx: -1,
                headerLogoMode: '', // 'light' | 'dark'
                sourceImage: '',     // base64 dataURL
                fileName: '',
                fileType: '',
                // 裁剪框
                crop: { x: 0, y: 0, w: 0, h: 0 },
                imgSize: { w: 0, h: 0 },
                // 输出（按用途）
                output: 'square',    // square | original
                outputSize: 64,      // square 边长
                outputFormat: 'auto', // auto | avif | webp | png | jpeg
                outputQuality: 85,   // avif/webp/jpeg 输出质量 1-100
                // SVG 直接文本
                svgText: '',
                // url 模式
                urlValue: '',
                // 模式
                mode: 'upload',      // upload | url | svg
                siteStyleMode: false, // 是否为已有图标样式编辑模式
                formTarget: 'headerConfig', // 'headerConfig' | 'sidebarTop'
                // 旋转和背景
                rotation: 0,         // 旋转角度（度）
                bgColor: 'transparent', // 背景色
                customBgColor: '#4f46e5', // 自定义HEX
                zoom: 1,              // 裁剪预览缩放倍数
                // 圆形/方形头像裁剪模式
                isCircleMode: false,      // 启用图标裁剪
                shape: 'circle',          // 'circle' | 'square' 裁剪形状
                imgTranslateX: 0,         // 图片平移 X (px)
                imgTranslateY: 0,         // 图片平移 Y (px)
                imgScale: 1,              // 图片缩放倍数
                iconOpacity: 100,         // 图片不透明度（%）
                bgOpacity: 100,           // 背景不透明度（%）
                viewportSize: 280,        // 固定视口尺寸 (px)
                circleDragState: { active: false, startX: 0, startY: 0, startTx: 0, startTy: 0 },
                // 视口模式下的可拖拽裁剪框（方形模式/adSlot 使用）
                vpCrop: { x: 50, y: 50, w: 180, h: 180 },
                vpCropDrag: { active: false, mode: '', startX: 0, startY: 0, startCrop: null },
                // 宽高比锁定（adSlot / 方形裁剪使用）
                aspectRatio: '1:1',    // '1:1' | '4:3' | '16:9' | '9:16' | 'free'
                lockRatio: true,        // 是否锁定宽高比
                ratioPresets: [
                    { label: '1:1', value: '1:1', w: 1, h: 1 },
                    { label: '4:3', value: '4:3', w: 4, h: 3 },
                    { label: '16:9', value: '16:9', w: 16, h: 9 },
                    { label: '9:16', value: '9:16', w: 9, h: 16 }
                ],
                sizePresets: [32, 48, 64, 96, 128]
            },
            // 新图标编辑器（三模式：image / color / text）
            iconEditor: {
                target: 'site',       // 'site'（站点图标编辑器）| 'categoryIcon'（分类图标复用）
                tab: 'image',         // 'image' | 'text'
                // image 模式
                sourceImage: '',
                fileName: '',
                fileType: '',
                rotation: 0,
                bgColor: 'transparent',
                customBgColor: '#4f46e5',
                zoom: 1,
                imgTranslateX: 0,
                imgTranslateY: 0,
                imgScale: 1,
                viewportSize: 350,
                outputSize: 64,
                dragging: false,
                circleDragState: { active: false, startX: 0, startY: 0, startTx: 0, startTy: 0 },
                _dispW: 0,
                _dispH: 0,
                _imgEl: null,
                // 裁剪框（视口坐标系）
                cropX: 0,
                cropY: 0,
                cropW: 140,
                cropH: 140,
                cropInit: false,
                // color / text 模式
                colorValue: '#4A90D9',
                textValue: '',
                textFontSize: 20,
                // svg / url 模式
                svgText: '',
                urlValue: '',
                // 弹窗标题
                title: '图标设置',
                // 在线获取的候选图标（仅内存，不保存）
                fetchedIcons: [],
                selectedFetchedIndex: -1,
                fetchingIcons: false
            }
        });

        // 自定义取色器（用于裁剪器预览背景自定义颜色）
        const colorPicker = reactive({
            open: false,
            color: '#4f46e5',
            h: 243, s: 70, v: 90,
            r: 79, g: 70, b: 229,
            a: 100, // 透明度 0~100
            draggingSV: false,
            draggingHue: false,
            draggingAlpha: false,
            onConfirm: null,
            hasEyedropper: false
        });
        const svCanvas = ref(null);
        const hueCanvas = ref(null);
        const alphaCanvas = ref(null);

        // 广告位裁剪弹窗内嵌背景取色器（替换旧版彩色圆点预设）
        const adSlotBgPicker = reactive({
            r: 255, g: 255, b: 255,
            h: 0, s: 0, v: 100,
            color: '#ffffff',
            hex: '#FFFFFF',
            mode: 'rgb',
            hslH: 0, hslS: 0, hslL: 100,
            draggingSV: false,
            draggingHue: false,
            hasEyedropper: false
        });
        const adSlotBgSvCanvas = ref(null);
        const adSlotBgHueCanvas = ref(null);
        const customColorBackup = ref('');
        const adSlotBgPopover = ref(false);
        const closeAdSlotBgPopoverOnOutside = (e) => {
            let el = e.target;
            while (el) {
                if (el.classList && el.classList.contains('adslot-bg-custom-wrap')) return;
                el = el.parentElement;
            }
            adSlotBgPopover.value = false;
        };
        const closeAdSlotBgPopoverOnEsc = (e) => { if (e.key === 'Escape') adSlotBgPopover.value = false; };
        watch(adSlotBgPopover, (open) => {
            if (open) {
                document.addEventListener('mousedown', closeAdSlotBgPopoverOnOutside);
                document.addEventListener('keydown', closeAdSlotBgPopoverOnEsc);
            } else {
                document.removeEventListener('mousedown', closeAdSlotBgPopoverOnOutside);
                document.removeEventListener('keydown', closeAdSlotBgPopoverOnEsc);
            }
        });

        // 部署账号（GitHub Pages / Cloudflare / Vercel / Netlify）
        const cfAccounts = ref([]);
        const activeAccountId = ref('');
        const accountFilter = ref('all'); // 'all' | 'github' | 'cloudflare' | 'vercel' | 'netlify' | 'server'
        const filteredAccounts = computed(() => {
            if (accountFilter.value === 'all') return cfAccounts.value;
            return cfAccounts.value.filter(a => a.type === accountFilter.value);
        });
        // 账号列表拖拽排序状态
        const draggingAccountId = ref(null);
        const dragOverAccountId = ref(null);
        const onAccountDragStart = (acc) => { draggingAccountId.value = acc.id; };
        const onAccountDragOver = (acc) => {
            if (!draggingAccountId.value || draggingAccountId.value === acc.id) return;
            dragOverAccountId.value = acc.id;
        };
        const onAccountDrop = async (targetAcc) => {
            const fromId = draggingAccountId.value;
            if (!fromId || fromId === targetAcc.id) { draggingAccountId.value = null; dragOverAccountId.value = null; return; }
            const fromIdx = cfAccounts.value.findIndex(a => a.id === fromId);
            const toIdx = cfAccounts.value.findIndex(a => a.id === targetAcc.id);
            if (fromIdx < 0 || toIdx < 0) { draggingAccountId.value = null; dragOverAccountId.value = null; return; }
            const [moved] = cfAccounts.value.splice(fromIdx, 1);
            cfAccounts.value.splice(toIdx, 0, moved);
            draggingAccountId.value = null;
            dragOverAccountId.value = null;
            await saveAccountsToServer();
        };
        const onAccountDragEnd = () => { draggingAccountId.value = null; dragOverAccountId.value = null; };

        // Toast
        const toasts = ref([]);
        const showToast = (msg, type = 'info', duration = 3000, center = false) => {
            const icons = { info: 'fa-info-circle', success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle' };
            const toast = { id: Utils.uid(), msg, type, icon: icons[type] || icons.info, center: !!center };
            toasts.value.push(toast);
            setTimeout(() => {
                toasts.value = toasts.value.filter(t => t.id !== toast.id);
            }, duration);
        };

        // 同步进度
        const syncSteps = ref([]);
        const syncResult = ref(null);
        // 服务器/本地部署控制台日志（逐行，含 level：info / ok / warn / error）
        const syncLogs = ref([]);
        const syncConsoleBodyEl = ref(null);
        const copySyncLogs = async () => {
            const text = syncLogs.value.map(l => '[' + (l.ts ? Utils.formatTime(l.ts.getTime()) : '') + '] ' + (l.text || '')).join('\n');
            try {
                await navigator.clipboard.writeText(text);
                showToast('部署日志已复制', 'success', 2000);
            } catch (e) {
                showToast('复制失败：' + (e.message || e), 'error', 3000);
            }
        };
        // 控制台自动滚动到底部
        watch(() => syncLogs.value.length, () => {
            requestAnimationFrame(() => {
                const el = syncConsoleBodyEl.value;
                if (el) el.scrollTop = el.scrollHeight;
            });
        });
        // 上传进度明细（可折叠）：当前文件 / 进度 / 剩余时间
        const syncDetail = reactive({
            show: false, expanded: false,
            total: 0, uploaded: 0, current: '',
            totalBytes: 0, uploadedBytes: 0, startTime: 0,
            items: []
        });
        const syncRemaining = computed(() => {
            if (!syncDetail.show || syncDetail.total === 0 || syncDetail.uploaded >= syncDetail.total) return '';
            const elapsed = Date.now() - syncDetail.startTime;
            if (elapsed < 800 || syncDetail.uploadedBytes === 0) return '计算中…';
            const rate = syncDetail.uploadedBytes / elapsed; // bytes/ms
            const remain = (syncDetail.totalBytes - syncDetail.uploadedBytes) / rate; // ms
            if (!isFinite(remain) || remain < 0) return '';
            const s = Math.ceil(remain / 1000);
            if (s < 60) return s + ' 秒';
            const m = Math.floor(s / 60), r = s % 60;
            return m + ' 分 ' + r + ' 秒';
        });
        // 关闭弹窗时重置明细
        watch(() => modal.sync, (v) => { if (!v) { syncDetail.show = false; syncDetail.expanded = false; } });

        // 保存版本相关（另存为弹窗）
        const showSaveAsModal = ref(false);
        const saveAsNote = ref('');

        // 弹窗层级表：越靠后优先级越高（视为越上层）。基础弹窗（siteEdit/sidebarTop/headerConfig 等）
        // 在前，覆盖其上的子弹窗（iconPicker/iconEditor/imageCropper 等）在后，ESC 仅关闭最上层。
        const MODAL_PRIORITY = [
            'site', 'category', 'subCategory', 'siteEdit', 'settings', 'versions', 'profiles', 'sync',
            'friendLinks', 'accountEdit', 'searchConfig', 'bgConfig', 'about', 'commit', 'menuKeys',
            'menuKeyEdit', 'headerConfig', 'sidebarTop', 'dailyText', 'adSlots', 'wallpaperLibrary',
            'addFooterMenu', 'editFooterMenu', 'iconPicker', 'iconEditor', 'imageCropper', 'unsavedAlert',
            // 后加的弹窗排在最后（最上层）：确认弹窗、版本同步信息、SEO 营销配置
            'confirm', 'versionSync', 'seo', 'templateSettings', 'shareModules', 'noVersionConfirm'
        ];

        // ESC / Enter 键处理弹窗
        const onKeyDown = (e) => {
            // 左侧树方向键导航（输入框/弹窗内不触发）
            const isFormField = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                if (isFormField(e.target)) return;
                if (isAnyModalOpen()) return;
                e.preventDefault();
                kbActive.value = true;
                ensureKbIndex();
                if (e.key === 'ArrowDown') moveKb(1);
                else if (e.key === 'ArrowUp') moveKb(-1);
                else if (e.key === 'ArrowRight') moveBtn(1);
                else if (e.key === 'ArrowLeft') moveBtn(-1);
                return;
            }
            if (e.key === 'Enter') {
                // 焦点在按钮上时交给按钮自身处理（取消/保存/应用不会被重复触发）
                if (e.target && e.target.closest && e.target.closest('button')) return;
                // 多行文本区/下拉框：Enter 应换行或选择，不触发保存
                const tag = e.target && e.target.tagName;
                if (tag === 'TEXTAREA' || tag === 'SELECT') return;
                // 站点图标编辑器（编辑单个站点的图标）
                if (modal.iconEditor) {
                    e.preventDefault();
                    e.stopPropagation();
                    applyIconEditor();
                    return;
                }
                // 自定义图标（分类图标上传模式）
                const ctx = editForm.imageCropper;
                if (modal.imageCropper && ctx && ctx.target === 'categoryIcon' && ctx.mode === 'upload') {
                    e.preventDefault();
                    e.stopPropagation();
                    applyIconEditor();
                    return;
                }
                // 侧边栏背景 / Header Logo 系列裁剪器：Enter 应用
                if (modal.imageCropper && ctx && (ctx.target === 'sidebarBackground' || ctx.target === 'sidebarBackgroundCollapsed' || ctx.target === 'headerLogo')) {
                    e.preventDefault();
                    e.stopPropagation();
                    applyLogoCrop();
                    return;
                }
                // 编辑网站（仅此弹窗，Enter 直接保存；描述 textarea 已放行换行）
                if (modal.siteEdit) {
                    e.preventDefault();
                    e.stopPropagation();
                    saveSite();
                    return;
                }
                // 左侧树：Enter 展开/折叠分类 或 触发编辑/删除按钮（无弹窗时）
                if (!isAnyModalOpen()) {
                    e.preventDefault();
                    kbActive.value = true;
                    ensureKbIndex();
                    activateKb();
                    return;
                }
                return;
            }
            if (e.key === 'Delete') {
                // 侧边树：删除当前聚焦的主分类/子分类（需点击确认）
                if (isFormField(e.target)) return;
                if (isAnyModalOpen()) return;
                e.preventDefault();
                let target = null;
                const list = treeNavList.value;
                if (kbActive.value && kbIndex.value >= 0 && kbIndex.value < list.length) {
                    target = list[kbIndex.value];
                } else if (selectedCategoryId.value) {
                    const cat = data.categories.find(c => c.id === selectedCategoryId.value);
                    if (cat) {
                        if (selectedSubId.value) {
                            const sub = cat.children.find(s => s.id === selectedSubId.value);
                            if (sub) target = { type: 'sub', cat, sub };
                        }
                        if (!target) target = { type: 'cat', cat };
                    }
                }
                if (!target) return;
                if (target.type === 'cat') deleteCategory(target.cat.id);
                else deleteSubCategory(target.cat.id, target.sub.id);
                return;
            }
            if (e.key !== 'Escape') return;
            // 优先级：favicon 编辑器 > showSaveAsModal > 自定义取色器 > exportSettingsOpen > 最上层 modal（逐层退出）
            if (window.__nfe2Current) { e.preventDefault(); return; }
            // 通用确认弹窗始终最内层：ESC 先关确认弹窗，再按一次才关底层弹窗（一级一级退出）
            if (modal.confirm) { closeConfirmDialog(); e.preventDefault(); return; }
            if (showSaveAsModal.value) { showSaveAsModal.value = false; return; }
            if (colorPicker.open) { colorPicker.open = false; e.preventDefault(); return; }
            if (exportSettingsOpen.value) { closeExportSettings(); e.preventDefault(); return; }
            if (modal.publishSettings) { closePublishSettings(); e.preventDefault(); return; }
            // 仅关闭当前最上层的一个 modal，剩余下层弹窗保留（如：裁剪器关闭后回到侧边栏顶部设置）
            let topKey = null, topIdx = -1;
            for (const k of MODAL_PRIORITY) {
                if (modal[k] === true) {
                    const idx = MODAL_PRIORITY.indexOf(k);
                    if (idx > topIdx) { topIdx = idx; topKey = k; }
                }
            }
            if (topKey) {
                if (topKey === 'imageCropper') closeLogoCropper();   // 走统一清理，复位 editForm.imageCropper.*
                else modal[topKey] = false;
                e.preventDefault();
            }
        };
        // 导出/发布菜单：点击外部关闭 & 窗口大小变化重新定位（命名引用以便卸载时移除）
        const _docClickHandler = (e) => {
            if (exportMenuOpen.value && !e.target.closest('.toolbar-dropdown') && !e.target.closest('.toolbar-dropdown-menu')) {
                exportMenuOpen.value = false;
            }
            if (publishMenuOpen.value && !e.target.closest('.toolbar-dropdown') && !e.target.closest('.toolbar-dropdown-menu')) {
                publishMenuOpen.value = false;
            }
        };
        const _winResizeHandler = () => {
            if (exportMenuOpen.value) updateExportMenuPosition();
            if (publishMenuOpen.value) updatePublishMenuPosition();
        };
        onMounted(() => {
            document.addEventListener('keydown', onKeyDown);
            document.addEventListener('keydown', bmKeydown);
            document.addEventListener('click', _docClickHandler);
            window.addEventListener('resize', _winResizeHandler);
        });

        // === 计算属性 ===
        const filteredCategories = computed(() => {
            if (!treeSearchQuery.value) return data.categories;
            const q = treeSearchQuery.value.toLowerCase();
            return data.categories.filter(cat =>
                cat.name.toLowerCase().includes(q) ||
                cat.children.some(sub => sub.name.toLowerCase().includes(q) || sub.sites.some(s => s.name.toLowerCase().includes(q)))
            );
        });

        const currentSub = computed(() => {
            if (!selectedCategoryId.value || !selectedSubId.value) return null;
            const cat = data.categories.find(c => c.id === selectedCategoryId.value);
            if (!cat) return null;
            return cat.children.find(s => s.id === selectedSubId.value) || null;
        });

        const currentCategory = computed(() => {
            return data.categories.find(c => c.id === selectedCategoryId.value) || null;
        });

        const totalSites = computed(() => {
            return data.categories.reduce((sum, cat) =>
                sum + cat.children.reduce((s, sub) => s + sub.sites.length, 0), 0);
        });
        // 左侧分类树统计：分类数 / 子分类数 / 网站总数
        const treeStats = computed(() => {
            const catCount = (Array.isArray(data.categories) ? data.categories : []).length;
            const subCount = (Array.isArray(data.categories) ? data.categories : []).reduce((s, cat) =>
                s + (Array.isArray(cat.children) ? cat.children.length : 0), 0);
            const siteCount = data.categories.reduce((sum, cat) =>
                sum + (Array.isArray(cat.children) ? cat.children : []).reduce((s2, sub) => s2 + (Array.isArray(sub.sites) ? sub.sites.length : 0), 0), 0);
            return { catCount, subCount, siteCount };
        });

        // 广告位「实时预览」：直接复用访客/导出页的同一套渲染算法（buildAdCss + buildAdRail），
        // 保证「配置弹窗所见 == 访客页所得」，彻底消除编辑器预览与输出不一致的问题。
        const adPreviewHtml = computed(() => {
            try {
                const a = data.adSlots;
                if (!a || !a.enabled) return '';
                const css = Generator.buildAdCss(a) || '';
                const left = Generator.buildAdRail('left', a) || '';
                const right = Generator.buildAdRail('right', a) || '';
                if (!left && !right) {
                    return '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:13px">尚未配置任何广告内容（在上方为广告位选择「图片/GIF」并套用图片）</div>';
                }
                return css + left + right;
            } catch (e) {
                return '';
            }
        });

        // 广告位预览：持久 keyframes（只更新 <style> 文本，不重建 <img>），
        // 避免 v-html 整体重建导致动画每次从 0 帧重启而「看起来不动」。
        // 预览改用 Vue 模板元素（v-for，带 :key）渲染，<img> 在重算时仅 patch、不重建，动画持续运行。
        const adBlinkStyle = computed(() => {
            try {
                const a = data.adSlots;
                if (!a) return '';
                let css = '';
                ['left', 'right'].forEach(side => {
                    (a[side] || []).forEach((s, i) => {
                        if (s.type === 'image' && s.blink) {
                            const dur = Number(s.blink.duration) || 300;
                            const iv = Number(s.blink.interval) || 150;
                            const cyc = dur + iv;
                            const onPct = Math.max(1, Math.min(99, Math.round(dur / cyc * 100)));
                            const dim = (s.blink.opacity != null) ? Number(s.blink.opacity) : 0.5;
                            css += `@keyframes _adBlink_${side}_${i}{0%{opacity:1;filter:brightness(1.25)}${onPct}%{opacity:1;filter:brightness(1.25)}${onPct}%{opacity:${dim};filter:brightness(.7)}100%{opacity:${dim};filter:brightness(.7)}}`;
                            css += `.ad-blink-${side}-${i}{animation:_adBlink_${side}_${i} ${cyc}ms ease-in-out infinite;}`;
                        }
                    });
                });
                return css;
            } catch (e) { return ''; }
        });
        const adRailWidth = computed(() => {
            const a = data.adSlots;
            const w = (a && a.width && Number(a.width) > 0) ? Number(a.width) : 380;
            return w * 2;
        });
        const adSlotStyle = (slot, side, idx) => {
            const a = data.adSlots;
            const adW = (a && a.width && Number(a.width) > 0) ? Number(a.width) : 380;
            const adH = (a && a.height && Number(a.height) > 0) ? Number(a.height) : 49;
            const pos = [
                { col: '1/2', row: '1/2' },
                { col: '2/3', row: '1/2' },
                { col: '1/2', row: '2/3' },
                { col: '2/3', row: '2/3' }
            ][idx] || { col: '1/2', row: '1/2' };
            const effW = (!a || !a.unifiedSize) && (slot.width || slot.height) ? (Number(slot.width) || adW) : adW;
            const effH = (!a || !a.unifiedSize) && (slot.width || slot.height) ? (Number(slot.height) || adH) : adH;
            return `grid-column:${pos.col};grid-row:${pos.row};width:${effW}px;height:${effH}px;justify-self:start;align-self:start;` + (slot.url ? 'cursor:pointer;' : '');
        };
        const adImgSrc = (slot) => {
            const img = slot.image || '';
            if (/^\s*<svg/i.test(img)) return 'data:image/svg+xml,' + encodeURIComponent(img);
            return img;
        };

        // 持久注入 keyframes 到 <head>（Vue 的 v-html 在 <style> 元素上不会渲染出 <style>，故改用此方式）。
        // 该 <style> 常驻、只同步文本，不重建预览 <img>，闪烁动画持续运行。
        const syncAdBlinkStyle = () => {
            const css = adBlinkStyle.value || '';
            let el = document.getElementById('adBlinkKeyframes');
            if (!el) { el = document.createElement('style'); el.id = 'adBlinkKeyframes'; document.head.appendChild(el); }
            // 仅在内容变化时写入，避免重设相同样式导致部分浏览器重启正在运行的闪烁动画
            if (el.textContent !== css) el.textContent = css;
        };
        onMounted(syncAdBlinkStyle);
        watch(adBlinkStyle, syncAdBlinkStyle);

        // 关于导航预览：按空行分段（避免在模板中使用正则字面量）
        const aboutPreviewParagraphs = computed(() => {
            const content = editForm.about.intro || '';
            return content.split(/\n\s*\n/).filter(s => s.trim());
        });

        // 发布弹窗：失败状态/错误信息
        const hasSyncError = computed(() => syncResult.value && syncResult.value.success === false);
        const syncErrorMessage = computed(() => (syncResult.value && syncResult.value.message) || '未知错误');

        // === 初始化 ===
        onMounted(async () => {
            loading.value = true;
            try {
                // 0. 健康检查：确认后端已启用新版文件夹存储 API
                try {
                    const probe = await fetch('/api/storage/sites');
                    const probeText = await probe.text();
                    if (!probe.ok || probeText.trim().startsWith('<')) {
                        // 旧版启动器返回 HTML 404，提示用户重启
                        alert('检测到后端尚未加载新版存储接口。请彻底关闭 NavEditor 启动器并重新打开，然后刷新页面。');
                        loaded.value = true;
                        return;
                    }
                } catch (e) {
                    console.warn('[NavEditor] 后端健康检查失败', e);
                }

                // 1. 列出磁盘上的所有站点
                let sites = [];
                try { sites = await Storage.getProfiles(); } catch (e) { sites = []; }

                // 2. 没有站点时创建默认站点
                let currentId = Storage.getCurrentProfileId();
                if (sites.length === 0) {
                    currentId = await Storage.createProfile('默认站点', {});
                    sites = await Storage.getProfiles();
                }

                // 3. 当前站点 ID 无效时回退到第一个站点
                if (!currentId || !sites.find(s => s.id === currentId)) {
                    currentId = sites[0] && sites[0].id;
                    Storage.setCurrentProfileId(currentId || '');
                }
                currentProfileId.value = currentId || '';

                // 4. 加载当前站点的 setting（即编辑数据）
                let saved = null;
                if (currentId) {
                    const profile = await Storage.getProfile(currentId);
                    currentSiteMeta.value = profile ? { id: profile.id, name: profile.name, createdAt: profile.createdAt } : null;
                    saved = profile && profile.data;
                }

                if (saved && typeof saved === 'object') {
                    // 容错：补齐关键字段，避免个别字段缺失导致整页崩溃
                    if (!Array.isArray(saved.categories)) saved.categories = [];
                    if (!saved.site || typeof saved.site !== 'object') saved.site = {};
                    Object.assign(data, saved);
                    ensureFooterMeta();
                    // 确保 data.about 存在（关于页模板下拉框绑定 data.about.template 需要）
                    if (!data.about || typeof data.about !== 'object') data.about = {};
                    migrateIconColors();
                    syncWallpaperGroups();
                    migrateWallpaperData();
                    migrateAdSlots();
                    // 迁移：广告牌高度旧默认值 → 49
                    if (data.adSlots && (Number(data.adSlots.height) === 108 || Number(data.adSlots.height) === 65 || Number(data.adSlots.height) === 59 || Number(data.adSlots.height) === 53)) data.adSlots.height = 49;
                    if (!data.site.sidebarTitleStyle) data.site.sidebarTitleStyle = { bold: false, italic: false, fontFamily: '', fontSize: '', color: '' };
                    if (!data.site.sidebarTitle) data.site.sidebarTitle = data.site.title || '';
                    if (!data.site.scrollHighlight || typeof data.site.scrollHighlight !== 'object') data.site.scrollHighlight = { enabled: false };
                if (!data.site.sidebarTitle) data.site.sidebarTitle = data.site.title || '';
                if (!data.site.scrollHighlight || typeof data.site.scrollHighlight !== 'object') data.site.scrollHighlight = { enabled: false };
                    if (!data.dailyText || typeof data.dailyText !== 'object') data.dailyText = { enabled: true, source: 'hitokoto', customText: '', textColor: '#333333' };
                    if (!data.dailyText.textColor) data.dailyText.textColor = '#333333';
                    if (!data.exportSettings || typeof data.exportSettings !== 'object') data.exportSettings = { showJson: true, showHtml: true, showDeploy: true, fileSettings: {}, includePaths: [] };
                    if (!Array.isArray(data.exportSettings.includePaths)) data.exportSettings.includePaths = [];
                    if (typeof data.exportSettings.showJson !== 'boolean') data.exportSettings.showJson = true;
                    if (typeof data.exportSettings.showHtml !== 'boolean') data.exportSettings.showHtml = true;
                    if (typeof data.exportSettings.showDeploy !== 'boolean') data.exportSettings.showDeploy = true;
                    const fsDefault = { json: { site: true, categories: true, searchConfig: true, wallpapers: true, about: true, commit: true, friendLinks: true, footer: true }, html: { index: true, about: true, commit: true, customCss: true, notFound: true }, deploy: { index: true, about: true, commit: true, customCss: true, notFound: true, assets: true } };
                    if (!data.exportSettings.fileSettings || typeof data.exportSettings.fileSettings !== 'object') data.exportSettings.fileSettings = JSON.parse(JSON.stringify(fsDefault));
                    for (const k of ['json', 'html', 'deploy']) {
                        if (!data.exportSettings.fileSettings[k] || typeof data.exportSettings.fileSettings[k] !== 'object') data.exportSettings.fileSettings[k] = JSON.parse(JSON.stringify(fsDefault[k]));
                        for (const fk of Object.keys(fsDefault[k])) {
                            if (typeof data.exportSettings.fileSettings[k][fk] !== 'boolean') data.exportSettings.fileSettings[k][fk] = true;
                        }
                    }
                    // 迁移：发布设置（增量/全量文件范围、额外路径、默认置顶按钮）
                    if (!data.deploySettings || typeof data.deploySettings !== 'object') data.deploySettings = {};
                    const dsDefault = { index: true, about: true, commit: true, customCss: true, notFound: true, assets: true };
                    if (!data.deploySettings.incrementalFiles || typeof data.deploySettings.incrementalFiles !== 'object') data.deploySettings.incrementalFiles = JSON.parse(JSON.stringify(dsDefault));
                    if (!data.deploySettings.fullFiles || typeof data.deploySettings.fullFiles !== 'object') data.deploySettings.fullFiles = JSON.parse(JSON.stringify(dsDefault));
                    for (const fk of Object.keys(dsDefault)) {
                        if (typeof data.deploySettings.incrementalFiles[fk] !== 'boolean') data.deploySettings.incrementalFiles[fk] = true;
                        if (typeof data.deploySettings.fullFiles[fk] !== 'boolean') data.deploySettings.fullFiles[fk] = true;
                    }
                    if (!Array.isArray(data.deploySettings.includePaths)) data.deploySettings.includePaths = [];
                    if (data.deploySettings.defaultTop !== 'quick' && data.deploySettings.defaultTop !== 'incremental' && data.deploySettings.defaultTop !== 'full') data.deploySettings.defaultTop = 'quick';
                    // 恢复“当前编辑版本”：从持久化的 data.currentVersionId 读取，刷新页面后仍能保持选中与正确的页脚保存路径
                    if (data && data.currentVersionId) currentEditingVersionId.value = data.currentVersionId;
                    hasData.value = true;
                    if (data.site && data.site.title) document.title = data.site.title + ' - 导航站编辑器';
                    { const _f = document.getElementById('consoleFavicon'); if (_f) _f.href = (data.site && data.site.favicon) || ''; }
                    try {
                        if (data.categories.length > 0) selectCategory(data.categories[0].id);
                    } catch (e) { console.warn('selectCategory 失败', e); }
                }
            } catch (e) {
                console.error('加载站点数据失败', e);
                showToast('站点数据加载失败，已重置为空白站点', 'warning');
                // 即使加载失败，也要把界面标志打开，否则上方工具栏按钮会全部隐藏
                if (!data.about || typeof data.about !== 'object') data.about = {};
                if (!data.site.sidebarTitle) data.site.sidebarTitle = data.site.title || '';
                if (!data.site.scrollHighlight || typeof data.site.scrollHighlight !== 'object') data.site.scrollHighlight = { enabled: false };
                if (!data.dailyText || typeof data.dailyText !== 'object') data.dailyText = { enabled: true, source: 'hitokoto', customText: '', textColor: '#333333' };
                if (!data.exportSettings || typeof data.exportSettings !== 'object') data.exportSettings = { showJson: true, showHtml: true, showDeploy: true, fileSettings: {}, includePaths: [] };
                if (!data.deploySettings || typeof data.deploySettings !== 'object') data.deploySettings = {};
                hasData.value = true;
            } finally {
                loaded.value = true;
            }

            // 检查是否有从版本历史"编辑"按钮传来的版本 ID
            const editVersionJson = localStorage.getItem('nav_editor_version_edit');
            if (editVersionJson) {
                loading.value = true;
                try {
                    const editInfo = JSON.parse(editVersionJson);
                    localStorage.removeItem('nav_editor_version_edit');
                    if (editInfo && editInfo.versionId) {
                        const version = await Storage.getVersion(editInfo.versionId);
                        if (version && version.data) {
                            const vd = version.data;
                            if (!Array.isArray(vd.categories)) vd.categories = [];
                            if (!vd.site || typeof vd.site !== 'object') vd.site = {};
                            Object.assign(data, JSON.parse(JSON.stringify(vd)));
                            ensureFooterMeta();
                            migrateIconColors();
                            syncWallpaperGroups();
                    migrateWallpaperData();
                    migrateAdSlots();
                            if (data.adSlots && (Number(data.adSlots.height) === 108 || Number(data.adSlots.height) === 65 || Number(data.adSlots.height) === 59 || Number(data.adSlots.height) === 53)) data.adSlots.height = 49;
                            if (!data.site.sidebarTitleStyle) data.site.sidebarTitleStyle = { bold: false, italic: false, fontFamily: '', fontSize: '', color: '' };
                    if (!data.site.sidebarTitle) data.site.sidebarTitle = data.site.title || '';
                    if (!data.site.scrollHighlight || typeof data.site.scrollHighlight !== 'object') data.site.scrollHighlight = { enabled: false };
                if (!data.site.sidebarTitle) data.site.sidebarTitle = data.site.title || '';
                if (!data.site.scrollHighlight || typeof data.site.scrollHighlight !== 'object') data.site.scrollHighlight = { enabled: false };
                            hasData.value = true;
                            currentEditingVersionId.value = editInfo.versionId || null;
                            data.currentVersionId = editInfo.versionId || null;
                            if (data.site && data.site.title) document.title = data.site.title + ' - 导航站编辑器';
                            { const _f = document.getElementById('consoleFavicon'); if (_f) _f.href = (data.site && data.site.favicon) || ''; }
                            await persistData({ mark: false });
                            try { if (data.categories.length > 0) selectCategory(data.categories[0].id); } catch (e) {}
                            showToast(`已加载版本「${editInfo.note || '未命名'}」到编辑器`, 'success');
                        }
                    }
                } catch (e) {
                    localStorage.removeItem('nav_editor_version_edit');
                    console.error('加载版本失败', e);
                } finally {
                    loading.value = false;
                    dirty.value = false;
                }
            }

            // 预加载版本列表，供顶部栏显示「当前版本名称」（无需先打开历史弹窗）
            try { await refreshVersions(); } catch (e) { /* 忽略，历史弹窗可重试 */ }
            // 自动选中当前/最新版本：保证页脚等保存落到版本部署目录，而非兜底根 footer/
            try { await restoreCurrentVersion(); } catch (e) { /* 忽略，用户可手动选择版本 */ }

            // 加载部署账号（从磁盘 password/ 文件夹按类型读取，替代旧的 localStorage 存储）
            await loadAccountsFromServer();

            // 初始加载完成：清除脏标记，解除加载锁（此后用户的真实编辑才会触发 autosave / dirty）
            dirty.value = false;
            loading.value = false;

            // 新结构已生效：清理浏览器中旧版的站点/版本/工作副本数据
            try {
                localStorage.removeItem('nav_editor_work');
                localStorage.removeItem('nav_editor_profiles');
                const req = indexedDB.deleteDatabase('nav_editor_db');
                req.onsuccess = () => {};
                req.onerror = () => {};
            } catch (_) {}

            // 加载可用关于页模板（不再自动生成 footer/index.html，由编辑器保存时用户自主选择保存位置）
            loadAvailableTemplates();
            // 暴露给关于页编辑器（独立标签页），保存后回调重新生成部署页（保留兼容）
            window.__navEditorRegenAbout = saveDeployedAbout;

            // 注册刷新/关闭拦截
            window.addEventListener('beforeunload', beforeUnloadHandler);
            window.addEventListener('keydown', keydownHandler);
        });

        // 组件卸载时移除全局监听，避免重复注册 / 内存泄漏
        onUnmounted(() => {
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('keydown', bmKeydown);
            document.removeEventListener('click', _docClickHandler);
            window.removeEventListener('resize', _winResizeHandler);
            window.removeEventListener('beforeunload', beforeUnloadHandler);
            window.removeEventListener('keydown', keydownHandler);
        });

        // === 自动保存 ===
        const autoSave = Utils.debounce(async () => {
            if (loading.value) return; // 初始加载期间不触发保存（避免“加载即写回”）
            await persistData({ mark: false });
        }, 500);
        watch(data, autoSave, { deep: true });

        // === 未保存标记 + 刷新拦截 ===
        // 只要 data 发生深层变化就标记为 dirty（加载期间挂起，避免误报）
        watch(data, () => { if (loading.value) return; dirty.value = true; }, { deep: true });

        // 加载完成后（没有从 localStorage 恢复旧数据）→ 不脏
        // 初始时 data 是默认空数据，用户未做任何修改
        // 每次显式保存操作完成后清除 dirty
        const markClean = () => { dirty.value = false; };

        // 持久化助手：取代散落各处的 Storage.saveWork(JSON.parse(JSON.stringify(data))) 重复写法
        // mark:   是否清除 dirty 标记（默认 true）
        // silent: true=吞掉异常（等价于原 try/catch 包裹），false=向上抛出（等价于原裸调用）
        // clone:  true=深拷贝后保存（默认），false=直接保存响应式 data（如 openAboutInTab 场景）
        const persistData = async (opts = {}) => {
            const mark = opts.mark !== false;
            const silent = opts.silent === true;
            const clone = opts.clone !== false;
            try {
                let siteId = Storage.getCurrentProfileId();
                // 没有站点时自动创建一个默认站点，避免界面显示后编辑无法保存
                if (!siteId) {
                    try {
                        siteId = await Storage.createProfile('默认站点', JSON.parse(JSON.stringify(data)));
                        Storage.setCurrentProfileId(siteId);
                        currentProfileId.value = siteId;
                        currentSiteMeta.value = { id: siteId, name: '默认站点', createdAt: Date.now() };
                        await loadProfiles();
                    } catch (createErr) {
                        console.error('[persistData] 自动创建默认站点失败:', createErr);
                        if (!silent) throw createErr;
                        return;
                    }
                }
                // 序列化时剥离下划线前缀的瞬时态字段（如 adSlots._limits/_showLimits），
                // 避免 UI 状态被写入保存的 JSON
                const stripTransient = (obj) => JSON.parse(JSON.stringify(obj, (k, v) => k.startsWith('_') ? undefined : v));
                const toSave = clone ? stripTransient(data) : data;
                const profile = {
                    id: siteId,
                    name: (currentSiteMeta.value && currentSiteMeta.value.name) || currentProfileName.value,
                    createdAt: (currentSiteMeta.value && currentSiteMeta.value.createdAt) || Date.now(),
                    data: JSON.parse(JSON.stringify(toSave)),
                    updatedAt: Date.now()
                };
                await Storage.saveProfile(profile);
                if (mark) markClean();
            } catch (e) {
                if (silent) {
                    console.warn('[persistData] 保存失败（已静默）:', e);
                    return;
                }
                throw e;
            }
        };

        // 页面关闭/刷新前：有未保存数据时弹出浏览器确认
        const beforeUnloadHandler = (e) => {
            if (!dirty.value) return;
            e.preventDefault();
            e.returnValue = '';
        };
        // 在 onMounted 中注册（确保 loaded 已就绪）

        // 应用 F5 / Ctrl+R 拦截
        const keydownHandler = (e) => {
            if (!dirty.value) return;
            // 硬刷新（Ctrl+F5 / Ctrl+Shift+R）浏览器不允许拦截，交给 beforeunload 处理，
            // 避免“弹窗后页面仍被刷新”造成用户困惑
            const isHardReload = (e.ctrlKey && e.shiftKey && (e.key === 'F5' || e.code === 'KeyR'))
                || (e.ctrlKey && e.key === 'F5');
            if (isHardReload) return;
            if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && (e.code === 'KeyR' || e.key === 'r' || e.key === 'R'))) {
                e.preventDefault();
                modal.unsavedAlert = true;
            }
        };
        // 在 onMounted 中注册

        // 未保存提醒弹窗操作
        const unsavedSaveAndRefresh = async () => {
            // 保存版本
            await saveVersion();
            // 强制保存当前数据到站点 setting
            await persistData({ mark: false });
            dirty.value = false;
            modal.unsavedAlert = false;
            location.reload();
        };
        const unsavedDirectRefresh = () => {
            dirty.value = false;
            modal.unsavedAlert = false;
            location.reload();
        };
        const unsavedCancel = () => {
            modal.unsavedAlert = false;
        };

        // === 导入 ===
        const importFromHtml = async (event) => {
            const file = event.target.files[0];
            if (!file) return;
            const text = await file.text();
            try {
                const parsed = Parser.parse(text);
                Object.assign(data, parsed);
                if (!data.site.sidebarTitleStyle) data.site.sidebarTitleStyle = { bold: false, italic: false, fontFamily: '', fontSize: '', color: '' };
                if (!data.site.sidebarTitle) data.site.sidebarTitle = data.site.title || '';
                if (!data.site.scrollHighlight || typeof data.site.scrollHighlight !== 'object') data.site.scrollHighlight = { enabled: false };
                hasData.value = true;
                persistData({ mark: false })
                showToast(`导入成功！${data.categories.length} 个分类，${totalSites.value} 个网站`, 'success');
                if (data.categories.length > 0) {
                    selectCategory(data.categories[0].id, data.categories[0].children[0]?.id);
                }
            } catch (e) {
                console.error(e);
                showToast(`导入失败: ${e.message}`, 'error');
            }
            event.target.value = '';
        };

        // 尝试自动从 ../index.html 导入
        const tryAutoImport = async () => {
            try {
                const res = await fetch('index.html');
                if (res.ok) {
                    const text = await res.text();
                    const parsed = Parser.parse(text);
                    Object.assign(data, parsed);
                    if (!data.site.sidebarTitleStyle) data.site.sidebarTitleStyle = { bold: false, italic: false, fontFamily: '', fontSize: '', color: '' };
                    if (!data.site.sidebarTitle) data.site.sidebarTitle = data.site.title || '';
                    if (!data.site.scrollHighlight || typeof data.site.scrollHighlight !== 'object') data.site.scrollHighlight = { enabled: false };
                if (!data.site.sidebarTitle) data.site.sidebarTitle = data.site.title || '';
                if (!data.site.scrollHighlight || typeof data.site.scrollHighlight !== 'object') data.site.scrollHighlight = { enabled: false };
                    hasData.value = true;
                    persistData({ mark: false })
                    showToast(`已从 index.html 自动导入`, 'success');
                    if (data.categories.length > 0) {
                        selectCategory(data.categories[0].id, data.categories[0].children[0]?.id);
                    }
                    return true;
                }
            } catch (e) {
                // 忽略，可能是本地文件协议
            }
            return false;
        };

        // === 导出 ===
        const exportData = () => {
            const json = JSON.stringify(data, null, 2);
            Utils.download('data.json', json, 'application/json');
            showToast('数据已下载', 'success');
        };

        const importData = async (event) => {
            const file = event.target.files[0];
            if (!file) return;
            const text = await file.text();
            try {
                const parsed = JSON.parse(text);
                Object.assign(data, parsed);
                if (!data.site.sidebarTitleStyle) data.site.sidebarTitleStyle = { bold: false, italic: false, fontFamily: '', fontSize: '', color: '' };
                if (!data.site.sidebarTitle) data.site.sidebarTitle = data.site.title || '';
                if (!data.site.scrollHighlight || typeof data.site.scrollHighlight !== 'object') data.site.scrollHighlight = { enabled: false };
                hasData.value = true;
                persistData({ mark: false })
                showToast('数据导入成功', 'success');
            } catch (e) {
                showToast(`导入失败: ${e.message}`, 'error');
            }
            event.target.value = '';
        };

        const generateAndDownload = async () => {
            try {
                const html = Generator.generate(data);
                Utils.download('index.html', html, 'text/html');
                // 同步生成 about.html（自包含静态页）
                const aboutHtml = Generator.generateAboutDeployed(data);
                if (aboutHtml) {
                    Utils.download('about.html', aboutHtml, 'text/html');
                }
                // 同步生成 commit.html（仅使用可视化编辑器保存的文件，未保存时不自动生成）
                const commitExport = await getCommitExport(data);
                if (commitExport.html) {
                    Utils.download(commitExport.path || 'commit.html', commitExport.html, 'text/html');
                }
                showToast('index.html + about.html + commit.html 已生成', 'success');
            } catch (e) {
                console.error('生成 HTML 失败', e);
                showToast('生成 HTML 失败：' + (e.message || e), 'danger');
            }
        };

        // === 分类操作 ===
        // 独立维护"展开"状态（与选中状态解耦，支持多个主分类同时展开）
        const expandedCatIds = ref(new Set());

        const isCatExpanded = (catId) => expandedCatIds.value.has(catId);

        const toggleCatExpand = (catId) => {
            const s = new Set(expandedCatIds.value);
            if (s.has(catId)) s.delete(catId);
            else s.add(catId);
            expandedCatIds.value = s;
        };

        // 切换选中分类（不再强制改 expanded — 展开/收起由用户独立控制）
        const selectCategory = (catId, subId) => {
            selectedCategoryId.value = catId;
            const cat = data.categories.find(c => c.id === catId);
            if (cat) {
                // 容错：个别分类可能缺 children 字段，避免 cat.children[0] 抛错
                const firstSub = (cat.children && cat.children[0] && cat.children[0].id) || null;
                selectedSubId.value = subId || firstSub;
            }
        };

        // 点击 chevron 箭头：展开/收起 + 同时选中该分类（之前只展开不选中，造成"点了箭头却没选中"的困惑）
        const onCatToggleClick = (catId) => {
            selectCategory(catId);
            toggleCatExpand(catId);
        };

        // 点击主分类图标/名字：选中 + 切换展开（与点击 chevron 行为一致）
        const onMainClick = (catId, subId) => {
            selectCategory(catId, subId);
            // 只要有子分类即可点击主行展开/收起（含仅 1 个子分类的情况，与 ENTER 行为一致）
            const cat = data.categories.find(c => c.id === catId);
            if (cat && cat.children.length >= 1) {
                toggleCatExpand(catId);
            }
        };

        const addCategory = () => {
            editForm.category = { id: null, name: '', icon: 'fas fa-folder', iconColor: '#b2b8be', continueView: false };
            modal.category = true;
        };

        // ===== 左侧树键盘导航 =====
        // 扁平可选列表：主分类 + 其展开后的子分类
        const treeNavList = computed(() => {
            const list = [];
            const cats = filteredCategories.value || [];
            for (const cat of cats) {
                list.push({ type: 'cat', cat });
                if (isCatExpanded(cat.id) && cat.children && cat.children.length) {
                    for (const sub of cat.children) list.push({ type: 'sub', cat, sub });
                }
            }
            return list;
        });

        const isAnyModalOpen = () => {
            for (const k in modal) { if (modal[k] === true) return true; }
            if (exportSettingsOpen.value || showSaveAsModal.value || colorPicker.open) return true;
            return false;
        };

        const kbSetFocus = (item) => {
            kbFocusKey.value = item.type === 'cat' ? 'cat:' + item.cat.id : 'sub:' + item.cat.id + ':' + item.sub.id;
            // 滚动到可见
            nextTick(() => {
                try {
                    let el = null;
                    if (item.type === 'cat') {
                        const node = document.querySelector('.tree-item[data-cat-id="' + item.cat.id + '"]');
                        el = node ? node.querySelector('.tree-item-row') : null;
                    } else {
                        el = document.querySelector('.tree-item-row.tree-sub-row[data-cat-id="' + item.cat.id + '"][data-sub-id="' + item.sub.id + '"]');
                    }
                    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
                } catch (e) { /* ignore */ }
            });
        };

        const ensureKbIndex = () => {
            const list = treeNavList.value;
            if (!list.length) { kbIndex.value = -1; return; }
            if (kbIndex.value < 0 || kbIndex.value >= list.length) {
                // 优先对齐到当前选中的子分类，否则对齐到主分类
                let catIdx = -1, subIdx = -1;
                for (let i = 0; i < list.length; i++) {
                    const it = list[i];
                    if (it.type === 'cat' && it.cat.id === selectedCategoryId.value && catIdx < 0) catIdx = i;
                    if (it.type === 'sub' && it.cat.id === selectedCategoryId.value && it.sub.id === selectedSubId.value) subIdx = i;
                }
                kbIndex.value = subIdx >= 0 ? subIdx : (catIdx >= 0 ? catIdx : 0);
            }
            const it = list[kbIndex.value];
            if (it) kbFocusKey.value = it.type === 'cat' ? 'cat:' + it.cat.id : 'sub:' + it.cat.id + ':' + it.sub.id;
        };

        const moveKb = (delta) => {
            const list = treeNavList.value;
            if (!list.length) return;
            let idx = Math.min(list.length - 1, Math.max(0, kbIndex.value + delta));
            kbIndex.value = idx;
            kbBtn.value = -1;
            const it = list[idx];
            if (it.type === 'cat') {
                selectedCategoryId.value = it.cat.id;
                const firstSub = (it.cat.children && it.cat.children[0]) ? it.cat.children[0].id : null;
                selectedSubId.value = firstSub;
            } else {
                selectedCategoryId.value = it.cat.id;
                selectedSubId.value = it.sub.id;
            }
            kbSetFocus(it);
        };

        const moveBtn = (delta) => {
            if (kbBtn.value === -1) {
                kbBtn.value = 0; // 右键进入「编辑」
            } else {
                kbBtn.value = Math.min(1, Math.max(-1, kbBtn.value + delta));
            }
        };

        const activateKb = () => {
            const list = treeNavList.value;
            if (kbIndex.value < 0 || kbIndex.value >= list.length) return;
            const it = list[kbIndex.value];
            if (!it) return;
            if (kbBtn.value === 0) {
                if (it.type === 'cat') editCategory(it.cat);
                else editSubCategory(it.cat.id, it.sub);
            } else if (kbBtn.value === 1) {
                if (it.type === 'cat') deleteCategory(it.cat.id);
                else deleteSubCategory(it.cat.id, it.sub.id);
                kbIndex.value = Math.min(kbIndex.value, treeNavList.value.length - 1);
            } else {
                if (it.type === 'cat') toggleCatExpand(it.cat.id);
            }
            kbBtn.value = -1;
        };

        const editCategory = (cat) => {
            editForm.category = { ...cat, iconColor: cat.iconColor || '#b2b8be' };
            modal.category = true;
        };

        const saveCategory = () => {
            if (!editForm.category.name.trim()) {
                showToast('请输入分类名称', 'warning');
                return;
            }
            if (editForm.category.id) {
                // 编辑
                const cat = data.categories.find(c => c.id === editForm.category.id);
                if (cat) {
                    cat.name = editForm.category.name;
                    cat.icon = editForm.category.icon;
                    cat.iconColor = (editForm.category.iconColor || '').trim() || '#b2b8be';
                    cat.continueView = !!editForm.category.continueView;
                }
                showToast('分类已更新', 'success');
            } else {
                const newCat = {
                    id: Utils.md5Like(editForm.category.name + Date.now()),
                    name: editForm.category.name,
                    icon: editForm.category.icon,
                    iconColor: (editForm.category.iconColor || '').trim() || '#b2b8be',
                    continueView: !!editForm.category.continueView,
                    children: [{
                        id: Utils.md5Like(editForm.category.name + '_sub' + Date.now()),
                        name: '新建分类',
                        sites: []
                    }]
                };
                data.categories.push(newCat);
                selectCategory(newCat.id, newCat.children[0].id);
                showToast('分类已添加', 'success');
            }
            persistData({ mark: true, silent: true })
            modal.category = false;
        };

        const deleteCategory = (catId) => {
            const cat = data.categories.find(c => c.id === catId);
            if (!cat) return;
            const count = cat.children.reduce((s, sub) => s + sub.sites.length, 0);
            if (!confirm(`确定删除分类「${cat.name}」吗？包含 ${count} 个网站将一并删除。`)) return;
            const idx = data.categories.findIndex(c => c.id === catId);
            data.categories.splice(idx, 1);
            if (selectedCategoryId.value === catId) {
                selectedCategoryId.value = data.categories[0]?.id || null;
                selectedSubId.value = data.categories[0]?.children[0]?.id || null;
            }
            showToast('分类已删除', 'success');
            persistData({ mark: true, silent: true })
        };

        const editSubCategory = (catId, sub) => {
            editForm.subCategory = { id: sub.id, parentId: catId, name: sub.name };
            modal.subCategory = true;
        };

        // 子分类操作
        const addSubCategory = (parentId) => {
            editForm.subCategory = { id: null, parentId, name: '' };
            modal.subCategory = true;
        };

        const saveSubCategory = () => {
            if (!editForm.subCategory.name.trim()) {
                showToast('请输入子分类名称', 'warning');
                return;
            }
            const cat = data.categories.find(c => c.id === editForm.subCategory.parentId);
            if (!cat) return;
            if (editForm.subCategory.id) {
                const sub = cat.children.find(s => s.id === editForm.subCategory.id);
                if (sub) sub.name = editForm.subCategory.name;
            } else {
                cat.children.push({
                    id: Utils.md5Like(editForm.subCategory.name + '_sub' + Date.now()),
                    name: editForm.subCategory.name,
                    sites: []
                });
            }
            showToast('子分类已保存', 'success');
            persistData({ mark: true, silent: true })
            modal.subCategory = false;
        };

        const deleteSubCategory = (catId, subId) => {
            const cat = data.categories.find(c => c.id === catId);
            if (!cat || cat.children.length <= 1) {
                showToast('至少保留一个子分类', 'warning');
                return;
            }
            const sub = cat.children.find(s => s.id === subId);
            if (!sub) return;
            if (!confirm(`确定删除子分类「${sub.name}」吗？${sub.sites.length} 个网站将删除。`)) return;
            const idx = cat.children.findIndex(s => s.id === subId);
            cat.children.splice(idx, 1);
            if (selectedSubId.value === subId) {
                selectedSubId.value = cat.children[0]?.id || null;
            }
            showToast('子分类已删除', 'success');
            persistData({ mark: true, silent: true })
        };

        // === 网站卡片操作 ===
        const addSite = () => {
            if (!selectedSubId.value) return;
            editForm.site = { index: -1, subId: selectedSubId.value, name: '', url: '', description: '', logo: '', bgType: 'image', bgColor: '', bgText: '',
                blink: { enabled: false, mode: 'count', count: 3, duration: 300, interval: 150, color: '#ff6b6b', templateName: '', intensity: 'normal' }
            };
            modal.siteEdit = true;
        };

        const editSite = (site, index) => {
            editForm.site = { ...site, index, subId: selectedSubId.value };
            // 兼容旧数据：无 bgType 时默认 image
            if (!editForm.site.bgType) editForm.site.bgType = 'image';
            if (editForm.site.bgColor === undefined) editForm.site.bgColor = '';
            if (editForm.site.bgText === undefined) editForm.site.bgText = '';
            // 兼容旧数据：网站卡片闪烁模块
            if (!editForm.site.blink) {
                editForm.site.blink = { enabled: false, mode: 'count', count: 3, duration: 300, interval: 150, color: '#ff6b6b', templateName: '', intensity: 'normal' };
            } else {
                editForm.site.blink = { enabled: !!editForm.site.blink.enabled, mode: editForm.site.blink.mode || 'count',
                    count: editForm.site.blink.count || 3, duration: editForm.site.blink.duration || 300,
                    interval: editForm.site.blink.interval || 150, color: editForm.site.blink.color || '#ff6b6b',
                    templateName: editForm.site.blink.templateName || '', intensity: editForm.site.blink.intensity || 'normal' };
            }
            modal.siteEdit = true;
        };

        const saveSite = () => {
            if (!editForm.site.name.trim()) {
                showToast('请输入网站名称', 'warning');
                return;
            }
            if (!editForm.site.url.trim()) {
                showToast('请输入网站 URL', 'warning');
                return;
            }
            const sub = data.categories
                .flatMap(c => c.children)
                .find(s => s.id === editForm.site.subId);
            if (!sub) return;

            const siteData = {
                name: editForm.site.name,
                url: editForm.site.url,
                description: editForm.site.description,
                logo: editForm.site.logo,
                bgType: editForm.site.bgType || 'image',
                bgColor: editForm.site.bgColor || '',
                bgText: editForm.site.bgText || '',
                blink: { ...editForm.site.blink },
                // 单个网站图标：保存未截取原图 + 裁剪参数，供下次打开还原（成品图仍在 logo）
                iconSrc: editForm.site.iconSrc || '',
                iconEdit: editForm.site.iconEdit ? { ...editForm.site.iconEdit } : null
            };

            if (editForm.site.index >= 0) {
                sub.sites[editForm.site.index] = siteData;
                showToast('网站已更新', 'success');
            } else {
                sub.sites.push(siteData);
                showToast('网站已添加', 'success');
            }
            // 显式持久化到 localStorage（autoSave 有 500ms 延迟，刷新可能丢失）
            persistData({ mark: true, silent: true })
            modal.siteEdit = false;
        };

        const deleteSite = (index) => {
            if (!currentSub.value) return;
            if (!confirm(`确定删除「${currentSub.value.sites[index].name}」吗？`)) return;
            currentSub.value.sites.splice(index, 1);
            showToast('网站已删除', 'success');
            persistData({ mark: true, silent: true })
        };

        // === 网站卡片闪烁模版管理 ===
        const saveBlinkTemplate = () => {
            const b = editForm.site.blink;
            const name = (b.templateName || '').trim();
            if (!name) { showToast('请输入模版名称', 'warning'); return; }
            // 检查重名
            const idx = data.blinkTemplates.findIndex(t => t.name === name);
            const tpl = { name, settings: { count: b.count || 3, duration: b.duration || 300, interval: b.interval || 150, color: b.color || '#ff6b6b' } };
            if (idx >= 0) {
                data.blinkTemplates[idx] = tpl;
                showToast('模版已更新: ' + name, 'success');
            } else {
                data.blinkTemplates.push(tpl);
                showToast('模版已保存: ' + name, 'success');
            }
            persistData({ mark: true, silent: true })
        };

        const applyBlinkTemplate = (templateName) => {
            const tpl = data.blinkTemplates.find(t => t.name === templateName);
            if (!tpl) return;
            const s = tpl.settings;
            editForm.site.blink.count = s.count;
            editForm.site.blink.duration = s.duration;
            editForm.site.blink.interval = s.interval;
            editForm.site.blink.color = s.color;
            editForm.site.blink.templateName = templateName;
            showToast('已应用模版: ' + templateName, 'success');
        };

        const deleteBlinkTemplate = (index) => {
            const name = data.blinkTemplates[index].name;
            if (!confirm(`确定删除闪烁模版「${name}」吗？`)) return;
            data.blinkTemplates.splice(index, 1);
            showToast('模版已删除', 'success');
            persistData({ mark: true, silent: true })
        };

        // 闪烁强度预设
        const blinkPresets = {
            crazy:  { mode:'continuous', count:0,   duration:120, interval:80,  color:'#e53e3e', intensity:'crazy' },  // 疯狂：快速红闪
            soft:   { mode:'count',      count:3,   duration:500, interval:400, color:'#3182ce', intensity:'soft' },    // 柔和：慢速蓝闪
            normal: { mode:'count',      count:4,   duration:300, interval:150, color:'#ff6b6b', intensity:'normal' }   // 普通
        };
        const applyBlinkPreset = (presetKey) => {
            const p = blinkPresets[presetKey];
            if (!p) return;
            Object.assign(editForm.site.blink, p);
            editForm.site.blink._custom = false;
        };

        // Logo 上传预览（自动压缩到合理大小）
        const onLogoUpload = (event) => {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = e => {
                const dataUrl = e.target.result;
                // 如果图片较大，用 canvas 压缩后再保存
                if (file.size > 100 * 1024) {
                    Utils.compressImageDataUrl(dataUrl, 200, 0.85, compressed => {
                        editForm.site.logo = compressed;
                    });
                } else {
                    editForm.site.logo = dataUrl;
                }
            };
            reader.readAsDataURL(file);
            event.target.value = '';
        };

        // === 站点配置（基础信息） ===
        const openSiteConfig = () => {
            editForm.siteConfig = {
                keywords: data.site.keywords || '',
                description: data.site.description || ''
            };
            modal.site = true;
        };

        const saveSiteConfig = () => {
            data.site.keywords = editForm.siteConfig.keywords || '';
            data.site.description = editForm.siteConfig.description || '';
            showToast('SEO 信息已保存', 'success');
            persistData({ mark: true, silent: true })
            modal.site = false;
        };

        // === 站点设置（浏览器标签 + 关于导航 + 备案） ===
        const openHeaderConfig = () => {
            editForm.headerConfig = {
                footer: { note: '', copyright: '', copyrightName: '', copyrightUrl: '', beian: '', beianUrl: '', gongan: '', gonganUrl: '', domain: '', ...(data.footer || data.site.footer || {}) },
                scrollHighlight: { ...(data.site.scrollHighlight || { enabled: true, color: '#ff6b6b', duration: 1200, blinkCount: 3, blinkDuration: 300, blinkInterval: 150 }) },
                error404: {
                    enabled: true,
                    templates: (data.site.error404 && data.site.error404.templates ? data.site.error404.templates.slice() : []),
                    default: (data.site.error404 && data.site.error404.default) || '',
                    rules: (data.site.error404 && data.site.error404.rules ? JSON.parse(JSON.stringify(data.site.error404.rules)) : [])
                }
            };
            loadError404Templates();
            modal.headerConfig = true;
        };

        const saveHeaderConfig = () => {
            data.site.error404 = {
                enabled: true,
                templates: (editForm.headerConfig.error404.templates || []).slice(),
                default: editForm.headerConfig.error404.default || '',
                rules: (editForm.headerConfig.error404.rules || []).map(r => ({ pattern: (r.pattern || '').trim(), template: r.template || '' }))
            };
            data.site.footer = { ...editForm.headerConfig.footer };
            data.footer = { ...editForm.headerConfig.footer };
            data.site.scrollHighlight = { ...editForm.headerConfig.scrollHighlight };
            showToast('站点设置已保存', 'success');
            persistData({ mark: true, silent: true })
            modal.headerConfig = false;
        };

        // === 侧边栏顶部设置（Logo + 标题） ===
        // 访客页面左侧背景（侧边栏背景）：弹窗内用的上传来源 + 文件选择 + 预览样式
        const sidebarBgSource = ref('upload');
        const onSidebarBgFileChange = (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                if (editForm.sidebarTop.sidebarBackground) {
                    editForm.sidebarTop.sidebarBackground.url = reader.result;
                    editForm.sidebarTop.sidebarBackground.type = 'image';
                }
            };
            reader.readAsDataURL(file);
            e.target.value = '';
        };
        const previewSidebarBgStyle = computed(() => {
            const sb = editForm.sidebarTop.sidebarBackground;
            if (!sb || sb.type === 'none' || (sb.type === 'image' && !sb.url)) {
                if (sb && sb.type === 'none') return { background: 'transparent' };
                return { background: '#ffffff' };
            }
            if (sb.type === 'color') return { background: sb.color || '#ffffff' };
            const fit = sb.fit === 'contain' ? 'contain' : 'cover';
            return {
                backgroundImage: `url('${sb.url}')`,
                backgroundSize: fit,
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                backgroundColor: '#ffffff'
            };
        });
        const previewSidebarBgCollapsedStyle = computed(() => {
            const sb = editForm.sidebarTop.sidebarBackgroundCollapsed;
            if (!sb || !sb.url) return { background: '#ffffff' };
            return {
                backgroundImage: `url('${sb.url}')`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                backgroundColor: '#ffffff'
            };
        });

        // 输出预览框的显示尺寸（仅用于右侧预览框的等比缩放，不影响实际输出像素）
        // 左侧背景/收起背景：高度锁定 600，宽度按 1:1 真实比例显示（不再用 2.2 倍放大 + 420 上限，
        // 避免调大宽度时预览高度反而变短）；广告位/壁纸沿用原 2.2 放大逻辑。
        const icpPreviewDims = computed(() => {
            const ctx = editForm.imageCropper;
            const t = ctx.target;
            const W = ctx.outputSizeW || (t === 'sidebarBackground' ? 170 : (t === 'sidebarBackgroundCollapsed' ? 60 : 190));
            const H = ctx.outputSizeH || (t === 'sidebarBackground' || t === 'sidebarBackgroundCollapsed' ? 600 : 49);
            let w, h;
            if (t === 'sidebarBackground' || t === 'sidebarBackgroundCollapsed') {
                w = Math.min(W, 420);
                h = Math.round(H * Math.min(W, 420) / W);
            } else if (t === 'adSlot' || t === 'wallpaper') {
                w = Math.min(Math.round(W * 2.2), 420);
                h = Math.round(w * H / W);
            } else {
                w = Math.min(ctx.outputSize || 64, 120);
                h = w;
            }
            return { w, h };
        });

        // 打开「访客页面左侧背景」图片裁剪器（复用壁纸的视口裁剪交互）
        const openSidebarBgCropper = () => {
            const ctx = editForm.imageCropper;
            const cur = editForm.sidebarTop.sidebarBackground || {};
            // 防御性：确保不会有图标设置 / 网站编辑弹窗与之叠加
            modal.iconEditor = false;
            modal.siteEdit = false;
            ctx.open = true;
            ctx.target = 'sidebarBackground';
            ctx.tabIdx = -1;
            ctx.engIdx = -1;
            ctx.siteStyleMode = true;
            ctx.isCircleMode = true;       // 复用视口拖拽交互
            ctx.shape = 'square';          // 背景固定方形裁剪框
            ctx.sourceImage = '';
            ctx.fileName = '';
            ctx.fileType = '';
            ctx.crop = { x: 0, y: 0, w: 0, h: 0 };
            ctx.imgSize = { w: 0, h: 0 };
            ctx._imgEl = null;
            ctx.output = 'square';
            ctx.outputSizeW = cur.width || 170; // 与访客页展开侧边栏实际宽度一致，cover 竖向铺满
            ctx.outputSizeH = 600;
            ctx.aspectRatio = 'output';    // 默认与输出尺寸比例一致（竖向）
            ctx.lockRatio = true;
            ctx.outputFormat = 'auto';
            ctx.svgText = '';
            ctx.urlValue = '';
            ctx.rotation = 0;
            ctx.imgTranslateX = 0;
            ctx.imgTranslateY = 0;
            ctx.imgScale = 1;
            ctx.iconOpacity = (cur.edit && typeof cur.edit.iconOpacity === 'number') ? cur.edit.iconOpacity : 100;
            ctx.viewportSize = 350;
            ctx.hLogoBg = (cur.edit && cur.edit.bg) ? cur.edit.bg : 'transparent';   // 优先恢复上次保存的背景色，否则默认透明棋盘格
            ctx.hLogoCustomBg = (ctx.hLogoBg && ctx.hLogoBg.startsWith('#')) ? ctx.hLogoBg : '#4f46e5';
            ctx.circleDragState = { active: false, startX: 0, startY: 0, startTx: 0, startTy: 0 };
            ctx.vpCrop = { x: 60, y: 20, w: ctx.outputSizeW, h: 280 };
            ctx.vpCropDrag = { active: false, mode: '', startX: 0, startY: 0, startCrop: null };
            const v = cur.url || '';
            if (!v) { modal.imageCropper = true; updateCropPreview(); return; }
            ctx.urlValue = v;
            // 二次编辑时优先用保存的原始图，避免把裁剪结果当原图越裁越糊
            ctx.sourceImage = resolvePreviewUrl(cur.src || v);
            const img = new Image();
            const _fit = () => {
                ctx._imgEl = img;
                ctx.imgSize = { w: img.naturalWidth, h: img.naturalHeight };
                const vp = ctx.viewportSize;
                const ratio = Math.min(vp / img.naturalWidth, vp / img.naturalHeight, 1);
                ctx._dispW = Math.round(img.naturalWidth * ratio);
                ctx._dispH = Math.round(img.naturalHeight * ratio);
                // 若保存过编辑参数，恢复到裁剪器状态（高度始终锁死 600）
                const ed = cur.edit;
                if (ed) {
                    if (ed.vpCrop) ctx.vpCrop = { ...ed.vpCrop };
                    if (ed.outputSizeW) ctx.outputSizeW = ed.outputSizeW;
                    ctx.outputSizeH = 600;
                    if (typeof ed.rotation === 'number') ctx.rotation = ed.rotation;
                    if (typeof ed.imgTranslateX === 'number') ctx.imgTranslateX = ed.imgTranslateX;
                    if (typeof ed.imgTranslateY === 'number') ctx.imgTranslateY = ed.imgTranslateY;
                    if (typeof ed.imgScale === 'number' && ed.imgScale > 0) ctx.imgScale = ed.imgScale;
                    if (typeof ed.iconOpacity === 'number') ctx.iconOpacity = ed.iconOpacity;
                } else {
                    ctx.imgScale = 1;
                    ctx.imgTranslateX = Math.round((vp - ctx._dispW) / 2);
                    ctx.imgTranslateY = Math.round((vp - ctx._dispH) / 2);
                }
                initVpCropBox(ctx);
                updateCropPreview();
            };
            img.onload = _fit;
            img.onerror = () => {
                ctx._dispW = 240; ctx._dispH = 240;
                ctx.imgTranslateX = Math.round((ctx.viewportSize - 240) / 2);
                ctx.imgTranslateY = Math.round((ctx.viewportSize - 240) / 2);
            };
            img.src = ctx.sourceImage;
            if (img.complete && img.naturalWidth > 0) _fit();
            modal.imageCropper = true;
            deferredInitVpCrop();
        };

        // 移除左侧背景图片，回到无图状态
        const clearSidebarBgImage = () => {
            if (!editForm.sidebarTop.sidebarBackground) return;
            editForm.sidebarTop.sidebarBackground.url = '';
            editForm.sidebarTop.sidebarBackground.src = '';
            editForm.sidebarTop.sidebarBackground.edit = null;
        };

        // 打开「收起侧边时背景」图片裁剪器（复用壁纸的视口裁剪交互）
        const openSidebarBgCollapsedCropper = () => {
            const ctx = editForm.imageCropper;
            const cur = editForm.sidebarTop.sidebarBackgroundCollapsed || {};
            // 防御性：确保不会有图标设置 / 网站编辑弹窗与之叠加
            modal.iconEditor = false;
            modal.siteEdit = false;
            ctx.open = true;
            ctx.target = 'sidebarBackgroundCollapsed';
            ctx.tabIdx = -1;
            ctx.engIdx = -1;
            ctx.siteStyleMode = true;
            ctx.isCircleMode = true;       // 复用视口拖拽交互
            ctx.shape = 'square';          // 背景固定方形裁剪框
            ctx.sourceImage = '';
            ctx.fileName = '';
            ctx.fileType = '';
            ctx.crop = { x: 0, y: 0, w: 0, h: 0 };
            ctx.imgSize = { w: 0, h: 0 };
            ctx._imgEl = null;
            ctx.output = 'square';
            ctx.outputSizeW = cur.width || 60;  // 与访客页收起侧边栏实际宽度一致，cover 竖向铺满
            ctx.outputSizeH = 600;
            ctx.aspectRatio = 'output';    // 默认与输出尺寸比例一致（竖向）
            ctx.lockRatio = true;
            ctx.outputFormat = 'auto';
            ctx.svgText = '';
            ctx.urlValue = '';
            ctx.rotation = 0;
            ctx.imgTranslateX = 0;
            ctx.imgTranslateY = 0;
            ctx.imgScale = 1;
            ctx.iconOpacity = (cur.edit && typeof cur.edit.iconOpacity === 'number') ? cur.edit.iconOpacity : 100;
            ctx.viewportSize = 350;
            ctx.hLogoBg = (cur.edit && cur.edit.bg) ? cur.edit.bg : 'transparent';   // 优先恢复上次保存的背景色，否则默认透明棋盘格
            ctx.hLogoCustomBg = (ctx.hLogoBg && ctx.hLogoBg.startsWith('#')) ? ctx.hLogoBg : '#4f46e5';
            ctx.circleDragState = { active: false, startX: 0, startY: 0, startTx: 0, startTy: 0 };
            ctx.vpCrop = { x: 60, y: 20, w: ctx.outputSizeW, h: 280 };
            ctx.vpCropDrag = { active: false, mode: '', startX: 0, startY: 0, startCrop: null };
            const v = cur.url || '';
            if (!v) { modal.imageCropper = true; updateCropPreview(); return; }
            ctx.urlValue = v;
            // 二次编辑时优先用保存的原始图，避免把裁剪结果当原图越裁越糊
            ctx.sourceImage = resolvePreviewUrl(cur.src || v);
            const img = new Image();
            const _fit = () => {
                ctx._imgEl = img;
                ctx.imgSize = { w: img.naturalWidth, h: img.naturalHeight };
                const vp = ctx.viewportSize;
                const ratio = Math.min(vp / img.naturalWidth, vp / img.naturalHeight, 1);
                ctx._dispW = Math.round(img.naturalWidth * ratio);
                ctx._dispH = Math.round(img.naturalHeight * ratio);
                // 若保存过编辑参数，恢复到裁剪器状态（高度始终锁死 600）
                const ed = cur.edit;
                if (ed) {
                    if (ed.vpCrop) ctx.vpCrop = { ...ed.vpCrop };
                    if (ed.outputSizeW) ctx.outputSizeW = ed.outputSizeW;
                    ctx.outputSizeH = 600;
                    if (typeof ed.rotation === 'number') ctx.rotation = ed.rotation;
                    if (typeof ed.imgTranslateX === 'number') ctx.imgTranslateX = ed.imgTranslateX;
                    if (typeof ed.imgTranslateY === 'number') ctx.imgTranslateY = ed.imgTranslateY;
                    if (typeof ed.imgScale === 'number' && ed.imgScale > 0) ctx.imgScale = ed.imgScale;
                    if (typeof ed.iconOpacity === 'number') ctx.iconOpacity = ed.iconOpacity;
                } else {
                    ctx.imgScale = 1;
                    ctx.imgTranslateX = Math.round((vp - ctx._dispW) / 2);
                    ctx.imgTranslateY = Math.round((vp - ctx._dispH) / 2);
                }
                initVpCropBox(ctx);
                updateCropPreview();
            };
            img.onload = _fit;
            img.onerror = () => {
                ctx._dispW = 240; ctx._dispH = 240;
                ctx.imgTranslateX = Math.round((ctx.viewportSize - 240) / 2);
                ctx.imgTranslateY = Math.round((ctx.viewportSize - 240) / 2);
            };
            img.src = ctx.sourceImage;
            if (img.complete && img.naturalWidth > 0) _fit();
            modal.imageCropper = true;
            deferredInitVpCrop();
        };

        // 移除收起侧边背景图片，回到无图状态
        const clearSidebarBgCollapsedImage = () => {
            if (!editForm.sidebarTop.sidebarBackgroundCollapsed) return;
            editForm.sidebarTop.sidebarBackgroundCollapsed.url = '';
            editForm.sidebarTop.sidebarBackgroundCollapsed.src = '';
            editForm.sidebarTop.sidebarBackgroundCollapsed.edit = null;
        };

        // 左侧背景宽度变化时只更新输出尺寸，不联动裁剪框（裁剪框保持当前大小/位置）
        const onSidebarBgWidthInput = () => {
            const ctx = editForm.imageCropper;
            const isCollapsed = ctx.target === 'sidebarBackgroundCollapsed';
            const minW = isCollapsed ? 40 : 120;
            const maxW = isCollapsed ? 120 : 400;
            let w = parseInt(ctx.outputSizeW, 10) || (isCollapsed ? 60 : 170);
            if (w < minW) w = minW;
            if (w > maxW) w = maxW;
            ctx.outputSizeW = w;
            updateCropPreview();
        };

        // 恢复左侧背景裁剪器的默认输出尺寸（按展开/收起分别校准）
        const restoreDefaultSidebarBgSize = () => {
            const ctx = editForm.imageCropper;
            if (ctx.target === 'sidebarBackgroundCollapsed') {
                ctx.outputSizeW = 60;
            } else {
                ctx.outputSizeW = 170;
            }
            ctx.outputSizeH = 600;
            ctx.vpCrop.w = ctx.outputSizeW;
            initVpCropBox(ctx);
            updateCropPreview();
        };

        const openSidebarTop = () => {
            editForm.sidebarTop = {
                logoLight: data.site.logoLight,
                logoCollapsedLight: data.site.logoCollapsedLight || '',
                logoLightSrc: data.site.logoLightSrc || '',
                logoCollapsedLightSrc: data.site.logoCollapsedLightSrc || '',
                logoLightEdit: data.site.logoLightEdit || null,
                logoCollapsedLightEdit: data.site.logoCollapsedLightEdit || null,
                // 浏览器标签（从站点设置移入）
                siteTitle: data.site.title || '',
                favicon: data.site.favicon || '',
                faviconSrc: data.site.faviconSrc || '',
                faviconEdit: data.site.faviconEdit || null,
                sidebarTitle: data.site.sidebarTitle || data.site.title,
                sidebarTitleStyle: { ...(data.site.sidebarTitleStyle || { bold: false, italic: false, fontFamily: '', fontSize: '', color: '' }) },
                sidebarBackground: data.site.sidebarBackground
                    ? { width: 170, ...data.site.sidebarBackground }
                    : { type: 'color', color: '#ffffff', url: '', fit: 'cover', width: 170 },
                sidebarBackgroundCollapsed: data.site.sidebarBackgroundCollapsed
                    ? { width: 60, ...data.site.sidebarBackgroundCollapsed }
                    : { url: '', src: '', edit: null, width: 60 },
                sidebarPopupBackgroundExpanded: data.site.sidebarPopupBackgroundExpanded || data.site.sidebarPopupBackground || '#151618',
                sidebarPopupBackgroundCollapsed: data.site.sidebarPopupBackgroundCollapsed || data.site.sidebarPopupBackground || '#151618',
                sidebarTextColor: data.site.sidebarTextColor || '#b2b8be'
            };
            sidebarBgSource.value = 'upload';
            // 避免与网站编辑弹窗 / 图标设置弹窗叠加（被盖住但仍响应点击会导致误触发）
            modal.siteEdit = false;
            modal.iconEditor = false;
            modal.sidebarTop = true;
        };

        // ===== 侧边栏顶部：三个图标点击后打开标准「图标设置」编辑器（modal.iconEditor），各自状态隔离 =====
        const SIDEBAR_ICON_TARGETS = {
            favicon:            { srcKey: 'favicon',            srcRawKey: 'faviconSrc',            editKey: 'faviconEdit',            outputSize: 64,  title: '浏览器标签' },
            logoLight:          { srcKey: 'logoLight',          srcRawKey: 'logoLightSrc',          editKey: 'logoLightEdit',          outputSize: 200, title: '展开 Logo' },
            logoCollapsedLight: { srcKey: 'logoCollapsedLight', srcRawKey: 'logoCollapsedLightSrc', editKey: 'logoCollapsedLightEdit', outputSize: 200, title: '收起 Logo' }
        };
        const openSidebarIconEditor = (key) => {
            const cfg = SIDEBAR_ICON_TARGETS[key];
            if (!cfg) return;
            const st = editForm.sidebarTop;
            const ie = editForm.iconEditor;
            // 弹窗标题与入口文字保持一致
            ie.title = (cfg.title || '图标') + '设置';
            // 复用图标设置编辑器的初始化（数据源改为侧边栏图标，而非站点 site）
            ie.tab = 'image';
            ie.sourceImage = '';
            ie.fileName = '';
            ie.fileType = '';
            ie.rotation = 0;
            ie.bgColor = 'transparent';
            ie.customBgColor = '#4f46e5';
            ie.zoom = 1;
            ie.imgTranslateX = 0;
            ie.imgTranslateY = 0;
            ie.imgScale = 1;
            ie._initX = 0;
            ie._initY = 0;
            ie.dragging = false;
            ie.viewportSize = 350;
            ie.outputSize = cfg.outputSize;
            ie._dispW = 350;
            ie._dispH = 350;
            ie._imgEl = null;
            ie.cropX = Math.round((ie.viewportSize - 200) / 2);
            ie.cropY = Math.round((ie.viewportSize - 200) / 2);
            ie.cropW = 200;
            ie.cropH = 200;
            ie.cropInit = true;
            ie.fetching = false;
            ie.shape = 'square';
            ie.iconOpacity = 100;
            ie.colorValue = '#4A90D9';
            ie.textValue = '';
            ie.textFontSize = 20;
            ie.svgText = '';
            ie.urlValue = '';
            ie.target = 'sidebar:' + key;
            // 载入已有图标（优先用未截取原图，否则用成品图）
            const rawUrl = st[cfg.srcRawKey] || st[cfg.srcKey] || '';
            const meta = st[cfg.editKey] || null;
            // 探测已有值类型：image / svg / url
            // 规则：默认进入图片 tab；只有明确是 SVG 文本/SVG data URL，或外部/相对 URL 时才进对应 tab。
            // 位图 data URL（如 data:image/png;base64,...）属于图片编辑器产物，仍走 image tab。
            const _isSvgText = rawUrl && (rawUrl.trim().startsWith('<svg') || rawUrl.trim().startsWith('<?xml'));
            const _isSvgData = rawUrl && rawUrl.trim().startsWith('data:image/svg+xml');
            const _isExternalUrl = rawUrl && /^(https?:|ftp:|\/|\.\/|\.\.\/)/i.test(rawUrl.trim());
            if (_isSvgText) {
                ie.tab = 'svg';
                ie.svgText = rawUrl;
                ie.sourceImage = '';
            } else if (_isSvgData) {
                ie.tab = 'svg';
                ie.svgText = decodeURIComponent(rawUrl.replace(/^data:image\/svg\+xml,/, ''));
                ie.sourceImage = '';
            } else if (_isExternalUrl) {
                ie.tab = 'url';
                ie.urlValue = rawUrl;
                ie.sourceImage = '';
            } else if (rawUrl) {
                // 剩余情况（含位图 data URL、未知字符串）默认按图片处理
                ie.tab = 'image';
                ie.sourceImage = rawUrl;
                if (meta) ie._restoreEdit = meta;
                const img = new Image();
                img.onload = () => {
                    alignCropToImage(ie, img);
                    if (ie._restoreEdit) {
                        const r = ie._restoreEdit;
                        ie.imgScale = r.imgScale; ie.imgTranslateX = r.imgTranslateX; ie.imgTranslateY = r.imgTranslateY;
                        ie.cropX = r.cropX; ie.cropY = r.cropY; ie.cropW = r.cropW; ie.cropH = r.cropH;
                        ie.rotation = r.rotation || 0; ie.bgColor = r.bgColor || 'transparent';
                        ie.shape = r.shape || 'square'; ie.outputSize = r.outputSize || cfg.outputSize;
                        ie.iconOpacity = r.iconOpacity != null ? r.iconOpacity : 100;
                        if (r.outputFormat) ie.outputFormat = r.outputFormat;
                        if (r.outputQuality != null) ie.outputQuality = r.outputQuality;
                        if (r.bgOpacity != null) ie.bgOpacity = r.bgOpacity;
                        ie.cropInit = true; ie._restoreEdit = null;
                    }
                };
                img.onerror = () => {};
                img.src = rawUrl;
            } else {
                ie.tab = 'image';
                ie.sourceImage = '';
            }
                    // 在线获取候选图标重置（仅内存，关闭/应用即清空）
            ie.fetchedIcons = [];
            ie.selectedFetchedIndex = -1;
            ie.fetchingIcons = false;
            modal.iconEditor = true;
        };

        const openBrowserTagFaviconEditor = () => openSidebarIconEditor('favicon');
        const openExpandedLogoEditor = () => openSidebarIconEditor('logoLight');
        const openCollapsedLogoEditor = () => openSidebarIconEditor('logoCollapsedLight');

        // 搜索栏引擎 Logo 编辑器：复用浏览器标签同一套「图标设置」编辑器（裁剪/排版/形状/缩放/旋转/不透明度/背景/输出），
        // 仅数据源改为搜索引擎，标题为「搜索栏图标设置」
        const openSearchEngineIconEditor = (ti, ei) => {
            const tab = (data.searchConfig && data.searchConfig.tabs) ? data.searchConfig.tabs[ti] : null;
            const eng = (tab && tab.engines) ? tab.engines[ei] : null;
            if (!eng) return;
            const ie = editForm.iconEditor;
            ie.title = '搜索栏图标设置';
            ie.tab = 'image';
            ie.sourceImage = '';
            ie.fileName = '';
            ie.fileType = '';
            ie.rotation = 0;
            ie.bgColor = 'transparent';
            ie.customBgColor = '#4f46e5';
            ie.zoom = 1;
            ie.imgTranslateX = 0;
            ie.imgTranslateY = 0;
            ie.imgScale = 1;
            ie._initX = 0;
            ie._initY = 0;
            ie.dragging = false;
            ie.viewportSize = 350;
            ie.outputSize = 64;
            ie._dispW = 350;
            ie._dispH = 350;
            ie._imgEl = null;
            ie.cropX = Math.round((ie.viewportSize - 200) / 2);
            ie.cropY = Math.round((ie.viewportSize - 200) / 2);
            ie.cropW = 200;
            ie.cropH = 200;
            ie.cropInit = true;
            ie.fetching = false;
            ie.shape = (eng && eng.logoShape) || 'square';
            ie.iconOpacity = 100;
            ie.colorValue = '#4A90D9';
            ie.textValue = '';
            ie.textFontSize = 20;
            ie.svgText = '';
            ie.urlValue = '';
            ie.target = 'searchEngine:' + ti + ':' + ei;
            // 载入已有图标（与浏览器标签编辑器相同类型探测）
            const rawUrl = (eng && (eng.logoSrc || eng.logo)) || '';
            const meta = (eng && eng.logoEdit) || null;
            const _isSvgText = rawUrl && (rawUrl.trim().startsWith('<svg') || rawUrl.trim().startsWith('<?xml'));
            const _isSvgData = rawUrl && rawUrl.trim().startsWith('data:image/svg+xml');
            const _isExternalUrl = rawUrl && /^(https?:|ftp:|\/|\.\/|\.\.\/)/i.test(rawUrl.trim());
            if (_isSvgText) {
                ie.tab = 'svg';
                ie.svgText = rawUrl;
                ie.sourceImage = '';
            } else if (_isSvgData) {
                ie.tab = 'svg';
                ie.svgText = decodeURIComponent(rawUrl.replace(/^data:image\/svg\+xml,/, ''));
                ie.sourceImage = '';
            } else if (_isExternalUrl) {
                ie.tab = 'url';
                ie.urlValue = rawUrl;
                ie.sourceImage = '';
            } else if (rawUrl) {
                ie.tab = 'image';
                ie.sourceImage = rawUrl;
                if (meta) ie._restoreEdit = meta;
                const img = new Image();
                img.onload = () => {
                    alignCropToImage(ie, img);
                    if (ie._restoreEdit) {
                        const r = ie._restoreEdit;
                        ie.imgScale = r.imgScale; ie.imgTranslateX = r.imgTranslateX; ie.imgTranslateY = r.imgTranslateY;
                        ie.cropX = r.cropX; ie.cropY = r.cropY; ie.cropW = r.cropW; ie.cropH = r.cropH;
                        ie.rotation = r.rotation || 0; ie.bgColor = r.bgColor || 'transparent';
                        ie.shape = r.shape || 'square'; ie.outputSize = r.outputSize || 64;
                        ie.iconOpacity = r.iconOpacity != null ? r.iconOpacity : 100;
                        if (r.outputFormat) ie.outputFormat = r.outputFormat;
                        if (r.outputQuality != null) ie.outputQuality = r.outputQuality;
                        if (r.bgOpacity != null) ie.bgOpacity = r.bgOpacity;
                        ie.cropInit = true; ie._restoreEdit = null;
                    }
                };
                img.onerror = () => {};
                img.src = rawUrl;
            } else {
                ie.tab = 'image';
                ie.sourceImage = '';
            }
            ie.fetchedIcons = [];
            ie.selectedFetchedIndex = -1;
            ie.fetchingIcons = false;
            modal.iconEditor = true;
        };

        const saveSidebarTop = () => {
            // 自动压缩过大的 logo 图片
            const compressAndSave = (logoVal, cb) => {
                if (typeof logoVal === 'string' && logoVal.startsWith('data:') && logoVal.length > 100 * 1024) {
                    Utils.compressImageDataUrl(logoVal, 200, 0.85, cb);
                } else {
                    cb(logoVal);
                }
            };
            // favicon 过大则自动压缩
            const compressFavicon = (faviconVal, cb) => {
                if (typeof faviconVal === 'string' && faviconVal.startsWith('data:image/') && !faviconVal.startsWith('data:image/svg+xml') && faviconVal.length > 50 * 1024) {
                    Utils.compressImageDataUrl(faviconVal, 64, 0.85, cb);
                } else {
                    cb(faviconVal);
                }
            };
            compressFavicon(editForm.sidebarTop.favicon, compressedFavicon => {
                compressAndSave(editForm.sidebarTop.logoLight, compressedLight => {
                    compressAndSave(editForm.sidebarTop.logoCollapsedLight, compressedCollapsedLight => {
                    data.site.logoLight = compressedLight;
                    data.site.logoCollapsedLight = compressedCollapsedLight;
                    data.site.logoLightSrc = editForm.sidebarTop.logoLightSrc || '';
                    data.site.logoCollapsedLightSrc = editForm.sidebarTop.logoCollapsedLightSrc || '';
                    data.site.logoLightEdit = editForm.sidebarTop.logoLightEdit || null;
                    data.site.logoCollapsedLightEdit = editForm.sidebarTop.logoCollapsedLightEdit || null;
                    data.site.sidebarTitle = editForm.sidebarTop.sidebarTitle;
                    data.site.sidebarTitleStyle = { ...editForm.sidebarTop.sidebarTitleStyle };
                    data.site.sidebarBackground = { width: 170, ...editForm.sidebarTop.sidebarBackground };
                    data.site.sidebarBackgroundCollapsed = { width: 60, ...editForm.sidebarTop.sidebarBackgroundCollapsed };
                    data.site.sidebarPopupBackgroundExpanded = editForm.sidebarTop.sidebarPopupBackgroundExpanded || '#151618';
                    data.site.sidebarPopupBackgroundCollapsed = editForm.sidebarTop.sidebarPopupBackgroundCollapsed || '#151618';
                    data.site.sidebarTextColor = editForm.sidebarTop.sidebarTextColor || '#b2b8be';
                    // 浏览器标签（从站点设置移入）
                    data.site.title = editForm.sidebarTop.siteTitle || '';
                    data.site.favicon = compressedFavicon || '';
                    data.site.faviconSrc = editForm.sidebarTop.faviconSrc || '';
                    data.site.faviconEdit = editForm.sidebarTop.faviconEdit || null;
                    document.title = (data.site.title || '导航站编辑器') + ' - 导航站编辑器';
                    { const _f = document.getElementById('consoleFavicon'); if (_f) _f.href = data.site.favicon || ''; }
                    // 旧字段废弃，避免重复生效
                    delete data.site.sidebarPopupBackground;
                    showToast('侧边栏顶部设置已保存', 'success');
                    persistData({ mark: true, silent: true })
                    modal.sidebarTop = false;
                });
            });
        });
        };
        if (typeof window !== 'undefined') {
            const _sidebarTopEnterHandler = (e) => {
                if (e.key === 'Enter' && modal.sidebarTop && !colorPicker.open && !modal.iconEditor && !modal.imageCropper) { e.preventDefault(); saveSidebarTop(); }
            };
            window.addEventListener('keydown', _sidebarTopEnterHandler);
        }

        // 内联编辑侧边栏标题
        const startEditSidebarTitle = () => {
            tempSidebarTitle.value = data.site.sidebarTitle || data.site.title || '';
            editingSidebarTitle.value = true;
            nextTick(() => {
                const el = document.getElementById('inline-sidebar-title');
                if (el) el.focus();
            });
        };
        const confirmSidebarTitle = () => {
            data.site.sidebarTitle = tempSidebarTitle.value.trim();
            editingSidebarTitle.value = false;
            showToast('侧边栏标题已更新', 'success');
            persistData({ mark: true, silent: true })
        };
        const cancelSidebarTitle = () => {
            editingSidebarTitle.value = false;
        };

        // 搜索标签图标选择器
        const openIconPickerForSearchTab = (tabIdx) => {
            editForm.iconPicker.target = 'searchTab';
            editForm.iconPicker.current = data.searchConfig.tabs[tabIdx].icon || '';
            editForm.iconPicker._searchTabIdx = tabIdx;
            modal.iconPicker = true;
        };

        // === 菜单键（侧边栏底部菜单项） ===
        const openMenuKeys = () => {
            modal.menuKeys = true;
        };

        const addMenuKey = () => {
            editForm.menuKey = { id: null, icon: 'fas fa-link', text: '', url: '', target: '', iconColor: '#b2b8be' };
            modal.menuKeyEdit = true;
        };

        const editMenuKey = (item) => {
            editForm.menuKey = { ...item, iconColor: item.iconColor || '#b2b8be' };
            modal.menuKeyEdit = true;
        };

        const saveMenuKey = () => {
            if (!editForm.menuKey.text.trim()) {
                showToast('请输入菜单文字', 'warning');
                return;
            }
            if (!data.menuKeys) data.menuKeys = [];
            if (editForm.menuKey.id) {
                const idx = data.menuKeys.findIndex(m => m.id === editForm.menuKey.id);
                if (idx >= 0) {
                    data.menuKeys[idx] = { ...editForm.menuKey, iconColor: (editForm.menuKey.iconColor || '').trim() || '#b2b8be' };
                    showToast('菜单项已更新', 'success');
                }
            } else {
                const newItem = {
                    ...editForm.menuKey,
                    iconColor: (editForm.menuKey.iconColor || '').trim() || '#b2b8be',
                    id: 'mk-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)
                };
                data.menuKeys.push(newItem);
                showToast('菜单项已添加', 'success');
            }
            modal.menuKeyEdit = false;
            persistData({ mark: true, silent: true })
        };

        const deleteMenuKey = (id) => {
            const idx = data.menuKeys.findIndex(m => m.id === id);
            if (idx < 0) return;
            if (!confirm(`确定删除菜单项「${data.menuKeys[idx].text}」吗？`)) return;
            data.menuKeys.splice(idx, 1);
            showToast('菜单项已删除', 'success');
            persistData({ mark: true, silent: true })
        };

        const moveMenuKey = (idx, dir) => {
            const ni = idx + dir;
            if (ni < 0 || ni >= data.menuKeys.length) return;
            const item = data.menuKeys.splice(idx, 1)[0];
            data.menuKeys.splice(ni, 0, item);
            persistData({ mark: true, silent: true })
        };

        // === 友情链接（专属设置页：页脚按钮外观 + 链接列表）===
        const friendLinkSettings = reactive({ icon: 'fas fa-link', text: '友情链接', iconColor: '#b2b8be' });
        const openFriendLinks = () => {
            editForm.friendLinks = JSON.parse(JSON.stringify(data.friendLinks || []));
            const fm = (data.footerFixedMeta && data.footerFixedMeta['mk-friend']) || {};
            friendLinkSettings.icon = (fm.icon || '').trim() || 'fas fa-link';
            friendLinkSettings.text = fm.text || '友情链接';
            friendLinkSettings.iconColor = fm.iconColor || '#b2b8be';
            modal.friendLinks = true;
        };

        const saveFriendLinks = () => {
            const text = (friendLinkSettings.text || '').trim();
            if (!text) { showToast('请填写菜单名称', 'warning'); return; }
            data.friendLinks = JSON.parse(JSON.stringify(editForm.friendLinks || []));
            const fm = (data.footerFixedMeta && typeof data.footerFixedMeta === 'object') ? { ...data.footerFixedMeta } : {};
            fm['mk-friend'] = { icon: (friendLinkSettings.icon || '').trim() || 'fas fa-link', text, iconColor: (friendLinkSettings.iconColor || '').trim() || '#b2b8be' };
            data.footerFixedMeta = fm;
            persistData({ mark: true, silent: true });
            modal.friendLinks = false;
            showToast('友情链接已保存', 'success');
            refreshVisitor();
        };

        const addFriendLink = () => {
            editForm.friendLinks.push({ name: '', url: '', title: '' });
        };

        const removeFriendLink = (index) => {
            editForm.friendLinks.splice(index, 1);
        };

        // 友情链接列表拖拽排序
        const flDragIndex = ref(null);
        const flDragOverIndex = ref(null);
        const onFlDragStart = (i) => { flDragIndex.value = i; };
        const onFlDragOver = (i) => { flDragOverIndex.value = i; };
        const onFlDrop = (i) => {
            const from = flDragIndex.value;
            if (from === null || from === i) { flDragIndex.value = null; flDragOverIndex.value = null; return; }
            const arr = editForm.friendLinks;
            const item = arr.splice(from, 1)[0];
            arr.splice(i, 0, item);
            flDragIndex.value = null; flDragOverIndex.value = null;
        };
        const onFlDragEnd = () => { flDragIndex.value = null; flDragOverIndex.value = null; };

        // 专属页图标选择（写回 friendLinkSettings.icon，区别于通用页脚弹窗）
        const openIconPickerForFriendLink = () => {
            editForm.iconPicker.target = 'friendLink';
            editForm.iconPicker.mode = 'edit';
            editForm.iconPicker.current = friendLinkSettings.icon || '';
            modal.iconPicker = true;
        };

        // 图标编辑器：测量图片后对齐裁剪框
        const alignCropToImage = (ie, img) => {
            const imgW = img.naturalWidth;
            const imgH = img.naturalHeight;
            // 图片缩放到刚好填入 200×200 裁剪框
            const fitScale = calcDefaultScale(imgW, imgH, 200);
            const dispW = Math.round(imgW * fitScale);
            const dispH = Math.round(imgH * fitScale);
            ie._dispW = dispW;
            ie._dispH = dispH;
            ie._imgEl = img;
            ie.imgScale = 1;
            // translate 让图片中心对齐裁剪框中心 (视口中心)
            // 公式：translate = 中心 - 图片半宽/半高
            ie.imgTranslateX = Math.round(ie.viewportSize / 2 - dispW / 2);
            ie.imgTranslateY = Math.round(ie.viewportSize / 2 - dispH / 2);
            // 保存初始位置，供"重置"按钮使用
            ie._initX = ie.imgTranslateX;
            ie._initY = ie.imgTranslateY;
            // 裁剪框固定 200×200，居中
            const CROP_SIZE = 200;
            ie.cropX = Math.round((ie.viewportSize - CROP_SIZE) / 2);
            ie.cropY = Math.round((ie.viewportSize - CROP_SIZE) / 2);
            ie.cropW = CROP_SIZE;
            ie.cropH = CROP_SIZE;
            ie.cropInit = true;
        };

        // 图标编辑器：计算最佳默认缩放（适配视口，但不过度放大小图）
        const calcDefaultScale = (imgW, imgH, viewportSize = 280) => {
            // 先计算适配视口的缩放
            const fitViewport = Math.min(viewportSize / imgW, viewportSize / imgH);
            // 小图标不过度放大：最大不超过 2.5x
            const maxScale = 2.5;
            return Math.min(fitViewport, maxScale);
        };

        // 图标编辑器：从站点链接自动获取 favicon/logo
        const extractDomain = (u) => {
            try {
                let s = (u || '').trim();
                if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
                return new URL(s).hostname;
            } catch (e) { return ''; }
        };
        // 尝试以跨域方式加载并转 dataURL 内嵌（要求对方返回 CORS 头）
        const loadImageDataUrl = (src) => new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                try {
                    const c = document.createElement('canvas');
                    c.width = img.naturalWidth || 1;
                    c.height = img.naturalHeight || 1;
                    c.getContext('2d').drawImage(img, 0, 0);
                    resolve(c.toDataURL('image/png'));
                } catch (e) { reject(e); }
            };
            img.onerror = reject;
            img.src = src;
        });
        // 仅探测图片是否可加载（不跨域，用于兜底直接用远程 URL）
        const probeImageOk = (src) => new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(true);
            img.onerror = reject;
            img.src = src;
        });
        // 方案 C：Google Favicon API 为主，失败再试 DuckDuckGo，再失败试目标站 /favicon.ico
        const fetchSiteFavicon = (rawUrl) => {
            const domain = extractDomain(rawUrl);
            if (!domain) return Promise.resolve(null);
            const candidates = [
                'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domain) + '&sz=128',
                'https://icons.duckduckgo.com/ip3/' + encodeURIComponent(domain) + '.ico',
                'https://' + domain + '/favicon.ico'
            ];
            const tryOne = (i) => {
                if (i >= candidates.length) return Promise.resolve(null);
                const src = candidates[i];
                return loadImageDataUrl(src)
                    .then(d => d)
                    .catch(() => probeImageOk(src).then(() => src).catch(() => tryOne(i + 1)));
            };
            return tryOne(0);
        };
        // 并发抓取多个 favicon 候选，返回成功加载的 { name, src, data } 数组（data 为 dataURL 或远程 URL）
        const fetchSiteFaviconCandidates = (rawUrl) => {
            const domain = extractDomain(rawUrl);
            if (!domain) return Promise.resolve([]);
            const list = [
                { name: 'Google 128px', src: 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domain) + '&sz=128' },
                { name: 'Google 64px',  src: 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domain) + '&sz=64' },
                { name: 'DuckDuckGo',   src: 'https://icons.duckduckgo.com/ip3/' + encodeURIComponent(domain) + '.ico' },
                { name: '站点 favicon',  src: 'https://' + domain + '/favicon.ico' }
            ];
            return Promise.all(list.map((item) => {
                return loadImageDataUrl(item.src)
                    .then((data) => ({ ...item, data }))
                    .catch(() => probeImageOk(item.src).then(() => ({ ...item, data: item.src })).catch(() => null));
            })).then((results) => results.filter(Boolean));
        };
        const autoFillFavicon = (ie, rawUrl) => {
            ie.fetching = true;
            fetchSiteFavicon(rawUrl)
                .then((data) => {
                    if (!data || !modal.iconEditor) { ie.fetching = false; return; }
                    ie.sourceImage = data;
                    ie.tab = 'image';
                    const img = new Image();
                    img.onload = () => { alignCropToImage(ie, img); ie.fetching = false; };
                    img.onerror = () => { ie.fetching = false; };
                    img.src = data;
                })
                .catch(() => { ie.fetching = false; });
        };
        // 在 siteEdit 弹窗内根据链接自动填充站点图标（首次设置时）
        const autoFillSiteFavicon = (site, rawUrl) => {
            fetchSiteFavicon(rawUrl)
                .then((data) => {
                    if (!data || !modal.siteEdit) return;
                    site.bgType = 'image';
                    site.logo = data;
                    site.iconSrc = data;
                    site.iconEdit = null;
                    persistData({ silent: true });
                })
                .catch(() => {});
        };
        // 图标编辑器：在线获取多个候选图标
        const fetchIconsForEditor = (ie) => {
            let rawUrl = '';
            if ((ie.target || '').indexOf('searchEngine:') === 0) {
                // 搜索引擎场景：用该引擎自身的 URL 抓取图标
                const parts = String(ie.target).split(':');
                const tab = (data.searchConfig && data.searchConfig.tabs) ? data.searchConfig.tabs[parseInt(parts[1], 10)] : null;
                const eng = (tab && tab.engines) ? tab.engines[parseInt(parts[2], 10)] : null;
                rawUrl = (eng && eng.url || '').trim();
            } else {
                const site = editForm.site;
                rawUrl = (site && site.url || '').trim();
            }
            if (!rawUrl) {
                alert('请先填写链接（搜索引擎的 URL 或站点链接）');
                return;
            }
            ie.fetchingIcons = true;
            ie.fetchedIcons = [];
            ie.selectedFetchedIndex = -1;
            fetchSiteFaviconCandidates(rawUrl)
                .then((list) => {
                    ie.fetchingIcons = false;
                    if (!list.length) {
                        alert('未找到该网站的图标，请检查链接或手动上传');
                        return;
                    }
                    ie.fetchedIcons = list;
                })
                .catch(() => {
                    ie.fetchingIcons = false;
                    alert('获取图标失败，请检查网络或手动上传');
                });
        };
        // 图标编辑器：从候选中确认选择一个图标，其余候选直接丢弃不保存
        const selectFetchedIcon = (ie) => {
            const idx = ie.selectedFetchedIndex;
            if (idx == null || idx < 0 || idx >= (ie.fetchedIcons || []).length) return;
            const item = ie.fetchedIcons[idx];
            if (!item || !item.data) return;
            ie.sourceImage = item.data;
            ie.tab = 'image';
            ie.fetchedIcons = [];
            ie.selectedFetchedIndex = -1;
            const img = new Image();
            img.onload = () => { alignCropToImage(ie, img); };
            img.onerror = () => {};
            img.src = item.data;
        };

        // === 新图标编辑器（三模式） ===
        const openIconSettings = () => {
            const ie = editForm.iconEditor;
            const site = editForm.site;
            // 弹窗标题
            ie.title = '站点图标设置';
            // 根据当前 bgType 初始化对应 tab
            ie.tab = site.bgType || 'image';
            ie.sourceImage = '';
            ie.fileName = '';
            ie.fileType = '';
            ie.rotation = 0;
            ie.bgColor = site.bgType === 'image' ? 'transparent' : site.bgColor || 'transparent';
            ie.customBgColor = '#4f46e5';
            ie.zoom = 1;
            ie.imgTranslateX = 0;
            ie.imgTranslateY = 0;
            ie.imgScale = 1;
            ie._initX = 0;
            ie._initY = 0;
            ie.dragging = false;
            ie.viewportSize = 350;
            ie.outputSize = 64;
            ie._dispW = 350;
            ie._dispH = 350;
            ie._imgEl = null;
            // 裁剪框固定 200×200，居中
            ie.cropX = Math.round((ie.viewportSize - 200) / 2);
            ie.cropY = Math.round((ie.viewportSize - 200) / 2);
            ie.cropW = 200;
            ie.cropH = 200;
            ie.cropInit = true;
            ie.fetching = false;
            ie.shape = 'square';
            ie.iconOpacity = 100;
            ie.colorValue = site.bgType === 'color' && site.bgColor ? site.bgColor : '#4A90D9';
            ie.textValue = site.bgType === 'text' && site.bgText ? site.bgText : (site.name || '').charAt(0).toUpperCase();
            ie.textFontSize = 20;
            // svg / url 模式：据现有站点图标值恢复
            ie.svgText = (site.bgType === 'svg' && site.logo) ? site.logo : '';
            ie.urlValue = (site.bgType === 'url' && site.logo) ? site.logo : '';
            // 在线获取候选图标重置（仅内存，关闭/应用即清空）
            ie.fetchedIcons = [];
            ie.selectedFetchedIndex = -1;
            ie.fetchingIcons = false;
            // 如果是 image 类型，加载图片（优先用备份的未截取原图，否则用成品图）
            if (site.bgType === 'image' && (site.iconSrc || site.logo)) {
                const hasBackup = !!(site.iconSrc && site.iconEdit);
                const rawUrl = hasBackup ? site.iconSrc : (site.logo || '');
                ie.sourceImage = rawUrl;
                if (hasBackup) {
                    ie._restoreEdit = site.iconEdit;
                }
                const img = new Image();
                img.onload = () => {
                    alignCropToImage(ie, img); // 先得到正确的 _dispW/_dispH/_imgEl
                    if (ie._restoreEdit) {
                        const r = ie._restoreEdit;
                        ie.imgScale = r.imgScale;
                        ie.imgTranslateX = r.imgTranslateX;
                        ie.imgTranslateY = r.imgTranslateY;
                        ie.cropX = r.cropX;
                        ie.cropY = r.cropY;
                        ie.cropW = r.cropW;
                        ie.cropH = r.cropH;
                        ie.rotation = r.rotation || 0;
                        ie.bgColor = r.bgColor || 'transparent';
                        ie.shape = r.shape || 'square';
                        ie.outputSize = r.outputSize || 64;
                        ie.iconOpacity = r.iconOpacity != null ? r.iconOpacity : 100;
                        if (r.outputFormat) ie.outputFormat = r.outputFormat;
                        if (r.outputQuality != null) ie.outputQuality = r.outputQuality;
                        if (r.bgOpacity != null) ie.bgOpacity = r.bgOpacity;
                        ie.cropInit = true;
                        ie._restoreEdit = null;
                    }
                };
                img.onerror = () => { /* 忽略加载失败 */ };
                img.src = rawUrl;
            }
            modal.iconEditor = true;
            // 首次设置且尚未有图标：根据链接自动获取 favicon 并加载进编辑器
            const hasIcon = site.bgType === 'image' && (site.iconSrc || site.logo);
            const rawUrl = (site.url || '').trim();
            if (!hasIcon && rawUrl) {
                autoFillFavicon(ie, rawUrl);
            }
        };

        const closeIconEditor = () => {
            modal.iconEditor = false;
        };

        // 图标编辑器：判断当前背景色是否为预设色板之外的自定义颜色
        const ICON_EDITOR_PRESET_BG = {
            image: ['transparent', '#ff4d4f', '#fa8c16', '#fadb14', '#a0d911', '#36cfc9', '#597ef7', '#b37feb'],
            text: ['transparent', '#597ef7', '#ff4d4f', '#36cfc9', '#b37feb', '#2c3e50']
        };
        const isCustomIconBg = (mode) => {
            const c = editForm.iconEditor.bgColor;
            return c && c !== 'transparent' && !ICON_EDITOR_PRESET_BG[mode].includes(c);
        };

        // 图标编辑器：打开全局取色器设置背景色（含不透明度）
        const openIconBgColorPicker = () => {
            const cur = (editForm.iconEditor.bgColor && editForm.iconEditor.bgColor !== 'transparent') ? editForm.iconEditor.bgColor : '#4f46e5';
            openColorPicker({
                value: cur,
                onChange: (val) => { editForm.iconEditor.bgColor = val; },
                onConfirm: (val) => { editForm.iconEditor.bgColor = val; }
            });
        };

        // 图标编辑器：不透明度滑条滚轮调整（±5%）
        const onIconOpacityWheel = (e) => {
            const ie = editForm.iconEditor;
            const cur = clampVal(ie.iconOpacity != null ? ie.iconOpacity : 100, 0, 100);
            ie.iconOpacity = clampVal(cur + (e.deltaY < 0 ? 5 : -5), 0, 100);
        };
        // 图标编辑器：旋转滑条滚轮调整（±5°）
        const onRotationWheel = (e) => {
            const ie = editForm.iconEditor;
            let r = (ie.rotation || 0) + (e.deltaY < 0 ? 5 : -5);
            r = ((r % 360) + 360) % 360;
            ie.rotation = r;
        };

        // 站点编辑弹窗：链接输入停止后自动获取 favicon 并填充图标
        let siteUrlFetchTimer = null;
        watch(() => (editForm.site && editForm.site.url) || '', (newVal) => {
            if (!modal.siteEdit) return;
            const rawUrl = (newVal || '').trim();
            if (!rawUrl) return;
            const site = editForm.site;
            const hasIcon = site.bgType === 'image' && (site.iconSrc || site.logo);
            if (hasIcon) return;
            if (siteUrlFetchTimer) clearTimeout(siteUrlFetchTimer);
            siteUrlFetchTimer = setTimeout(() => {
                if (!modal.siteEdit) return;
                const curUrl = (editForm.site.url || '').trim();
                if (curUrl !== rawUrl) return;
                autoFillSiteFavicon(site, curUrl);
            }, 500);
        });

        // 图标编辑器：上传图片
        const onIconEditorFileChange = (event) => {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = e => {
                const ie = editForm.iconEditor;
                ie.sourceImage = String(e.target.result || '');
                ie.fileName = file.name;
                ie.fileType = file.type || 'image/png';
                ie._restoreEdit = null; // 换图后不再还原旧的裁剪参数
                // 设默认显示让图片立即出现，裁剪框等测量完成后对齐
                ie._dispW = 350;
                ie._dispH = 350;
                ie.imgTranslateX = 0;
                ie.imgTranslateY = 0;
                ie.imgScale = 1;
                // 异步测量图片实际尺寸后对齐
                const img = new Image();
                img.onload = () => alignCropToImage(ie, img);
                img.src = ie.sourceImage;
            };
            reader.readAsDataURL(file);
            event.target.value = '';
        };

        // 图标编辑器：删除当前图片
        const deleteIconEditorImage = () => {
            const ie = editForm.iconEditor;
            ie.sourceImage = '';
            ie.fileName = '';
            ie.fileType = '';
            ie._dispW = 350;
            ie._dispH = 350;
            ie.imgTranslateX = 0;
            ie.imgTranslateY = 0;
            ie.imgScale = 1;
            ie.rotation = 0;
            ie.iconOpacity = 100;
            ie._restoreEdit = null;
            ie.cropInit = false;
        };

        // 图标编辑器：拖拽平移（图片模式）
        const ieDragState = { active: false, startX: 0, startY: 0, startTx: 0, startTy: 0, viewportEl: null };
        const onIePointerDown = (e) => {
            const ie = editForm.iconEditor;
            ieDragState.active = true;
            ieDragState.startX = e.clientX;
            ieDragState.startY = e.clientY;
            ieDragState.startTx = ie.imgTranslateX;
            ieDragState.startTy = ie.imgTranslateY;
            ieDragState.viewportEl = e.currentTarget;
            ie.dragging = true;
            // 捕获指针，确保拖拽时持续收到事件（参考单个网页图标）
            if (ieDragState.viewportEl) {
                try { ieDragState.viewportEl.setPointerCapture(e.pointerId); } catch(_) {}
            }
            e.preventDefault();
        };
        const onIePointerMove = (e) => {
            // 优先处理裁剪框拖拽
            if (cropDrag.active) {
                cropDragMove(e);
                return;
            }
            if (cropResize.active) {
                cropResizeMove(e);
                return;
            }
            if (!ieDragState.active) return;
            const ie = editForm.iconEditor;
            const s = ie.imgScale || 1;
            const dx = e.clientX - ieDragState.startX;
            const dy = e.clientY - ieDragState.startY;
            let tx = ieDragState.startTx + dx;
            let ty = ieDragState.startTy + dy;
            // 边界约束：防止图片被完全拖出视口（参考单个网页图标）
            const vp = ie.viewportSize || 280;
            const dispW = ie._dispW || vp;
            const dispH = ie._dispH || vp;
            const spanW = dispW * s;
            const spanH = dispH * s;
            const m = 24; // 至少保留 24px 可见
            // 对 center-origin：先把 translate 转成渲染左上角，clamp 后再转回
            const topLeftX = tx + (1 - s) * dispW / 2;
            const topLeftY = ty + (1 - s) * dispH / 2;
            const clampAxis = (span, tl) => {
                if (span >= vp) return Math.max(vp - span, Math.min(0, tl));
                return Math.max(m - span, Math.min(vp - m, tl));
            };
            ie.imgTranslateX = Math.round(clampAxis(spanW, topLeftX) - (1 - s) * dispW / 2);
            ie.imgTranslateY = Math.round(clampAxis(spanH, topLeftY) - (1 - s) * dispH / 2);
        };
        const onIePointerUp = (e) => {
            ieDragState.active = false;
            cropDrag.active = false;
            cropResize.active = false;
            const ie = editForm.iconEditor;
            ie.dragging = false;
            if (ieDragState.viewportEl && e && e.pointerId) {
                try { ieDragState.viewportEl.releasePointerCapture(e.pointerId); } catch(_) {}
            }
            ieDragState.viewportEl = null;
        };

        // === 裁剪框拖拽 ===
        const cropDrag = { active: false, startX: 0, startY: 0, startCx: 0, startCy: 0 };
        const onCropBoxPointerDown = (e) => {
            const ie = editForm.iconEditor;
            cropDrag.active = true;
            cropDrag.startX = e.clientX;
            cropDrag.startY = e.clientY;
            cropDrag.startCx = ie.cropX;
            cropDrag.startCy = ie.cropY;
            e.preventDefault();
            e.stopPropagation();
        };
        const cropDragMove = (e) => {
            const ie = editForm.iconEditor;
            let nx = cropDrag.startCx + (e.clientX - cropDrag.startX);
            let ny = cropDrag.startCy + (e.clientY - cropDrag.startY);
            // 限制在视口内
            nx = Math.max(0, Math.min(ie.viewportSize - ie.cropW, nx));
            ny = Math.max(0, Math.min(ie.viewportSize - ie.cropH, ny));
            ie.cropX = Math.round(nx);
            ie.cropY = Math.round(ny);
        };

        // === 裁剪框缩放（固定正方形） ===
        const cropResize = { active: false, startX: 0, startY: 0, startCx: 0, startCy: 0, startSide: 0, corner: '' };
        const MIN_CROP = 16;
        const onCropHandlePointerDown = (e, corner) => {
            const ie = editForm.iconEditor;
            cropResize.active = true;
            cropResize.startX = e.clientX;
            cropResize.startY = e.clientY;
            cropResize.startCx = ie.cropX;
            cropResize.startCy = ie.cropY;
            cropResize.startSide = ie.cropW;  // w === h
            cropResize.corner = corner;
            e.preventDefault();
        };
        const cropResizeMove = (e) => {
            const ie = editForm.iconEditor;
            const dx = e.clientX - cropResize.startX;
            const dy = e.clientY - cropResize.startY;
            const dist = Math.max(Math.abs(dx), Math.abs(dy));
            // 根据拖拽方向判定放大/缩小：
            // 往远离锚点方向拖拽 → 放大；往靠近锚点方向 → 缩小
            let sign;
            const corner = cropResize.corner;
            if (corner === 'se') sign = (dx > 0 || dy > 0) ? 1 : -1;
            else if (corner === 'sw') sign = (dx < 0 || dy > 0) ? 1 : -1;
            else if (corner === 'ne') sign = (dx > 0 || dy < 0) ? 1 : -1;
            else /* nw */ sign = (dx < 0 || dy < 0) ? 1 : -1;

            const delta = dist * sign;
            let nx = cropResize.startCx, ny = cropResize.startCy;
            let side = Math.max(MIN_CROP, cropResize.startSide + delta);

            // 根据角调整位置偏移
            if (corner === 'sw' || corner === 'w') {
                nx = cropResize.startCx + (cropResize.startSide - side);
            } else if (corner === 'ne' || corner === 'n') {
                ny = cropResize.startCy + (cropResize.startSide - side);
            } else if (corner === 'nw') {
                nx = cropResize.startCx + (cropResize.startSide - side);
                ny = cropResize.startCy + (cropResize.startSide - side);
            }
            // 限制不超出视口
            if (nx < 0) { nx = 0; }
            if (ny < 0) { ny = 0; }
            if (nx + side > (editForm.iconEditor.viewportSize || 350)) { side = (editForm.iconEditor.viewportSize || 350) - nx; }
            if (ny + side > (editForm.iconEditor.viewportSize || 350)) { side = (editForm.iconEditor.viewportSize || 350) - ny; }
            side = Math.max(MIN_CROP, side);
            ie.cropX = Math.round(nx);
            ie.cropY = Math.round(ny);
            ie.cropW = Math.round(side);
            ie.cropH = Math.round(side);
        };

        // 滚轮缩放：以图片中心为原点，保持 translate 不变，图片中心在屏幕上固定不动
        const onIeWheel = (e) => {
            const ie = editForm.iconEditor;
            const delta = e.deltaY > 0 ? -0.05 : 0.05;
            const oldScale = ie.imgScale || 1;
            const newScale = Math.max(0.1, Math.min(5, oldScale + delta));
            if (newScale !== oldScale) {
                // transform-origin: center center，translate 不变时图片中心位置不变
                ie.imgScale = newScale;
            }
        };

        // 通用：把图标编辑状态渲染为 canvas dataURL（图标设置弹窗与侧边栏三个图标共用，唯一渲染公式）
        const renderIconToCanvas = (ie) => {
            const canvas = document.createElement('canvas');
            const ctx2d = canvas.getContext('2d');
            const size = ie.outputSize || 64;
            canvas.width = size;
            canvas.height = size;
            const iconAlpha = clampVal((ie.iconOpacity != null ? ie.iconOpacity : 100), 0, 100) / 100;
            const outMime = Utils.resolveImageMime(ie.outputFormat || 'auto');
            const bgColor = ie.bgColor || 'transparent';
            const bgAlpha = clampVal((ie.bgOpacity != null ? ie.bgOpacity : 100), 0, 100) / 100;
            if (bgColor !== 'transparent' || outMime === 'image/jpeg') {
                ctx2d.fillStyle = bgColor !== 'transparent' ? bgColor : '#ffffff';
                ctx2d.globalAlpha = bgColor !== 'transparent' ? bgAlpha : 1;
                ctx2d.fillRect(0, 0, size, size);
                ctx2d.globalAlpha = 1;
            }
            const img = ie._imgEl;
            if (!img) return null;
            const imgW = img.naturalWidth;
            const imgH = img.naturalHeight;
            const dispW = ie._dispW || imgW;
            const dispH = ie._dispH || imgH;
            ctx2d.globalAlpha = iconAlpha;
            // 统一用 temp canvas 渲染图片，保证输出与视觉完全一致
            // 旧的非旋转分支会强制居中，导致图片偏移时输出和裁剪窗不符
            const s = ie.imgScale || 1;
            const tx = ie.imgTranslateX !== undefined ? ie.imgTranslateX : 0;
            const ty = ie.imgTranslateY !== undefined ? ie.imgTranslateY : 0;
            const rot = (ie.rotation || 0) * Math.PI / 180;
            const vp = ie.viewportSize || 350;
            const tcanvas = document.createElement('canvas');
            tcanvas.width = vp;
            tcanvas.height = vp;
            const tctx = tcanvas.getContext('2d');
            tctx.save();
            tctx.translate(tx + dispW / 2, ty + dispH / 2);
            tctx.scale(s, s);
            tctx.rotate(rot);
            tctx.translate(-dispW / 2, -dispH / 2);
            tctx.drawImage(img, 0, 0, dispW, dispH);
            tctx.restore();
            ctx2d.drawImage(tcanvas, ie.cropX, ie.cropY, ie.cropW, ie.cropH, 0, 0, size, size);
            ctx2d.globalAlpha = 1;
            if (ie.shape === 'round') {
                const r = Math.max(0, Math.round(size * 0.16));
                const rc = document.createElement('canvas');
                rc.width = size; rc.height = size;
                const rctx = rc.getContext('2d');
                rctx.fillStyle = '#fff';
                rctx.beginPath();
                rctx.moveTo(r, 0);
                rctx.arcTo(size, 0, size, size, r);
                rctx.arcTo(size, size, 0, size, r);
                rctx.arcTo(0, size, 0, 0, r);
                rctx.arcTo(0, 0, size, 0, r);
                rctx.closePath();
                rctx.fill();
                ctx2d.globalCompositeOperation = 'destination-in';
                ctx2d.drawImage(rc, 0, 0);
                ctx2d.globalCompositeOperation = 'source-over';
            } else if (ie.shape === 'circle') {
                const rc = document.createElement('canvas');
                rc.width = size; rc.height = size;
                const rctx = rc.getContext('2d');
                rctx.fillStyle = '#fff';
                rctx.beginPath();
                rctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
                rctx.closePath();
                rctx.fill();
                ctx2d.globalCompositeOperation = 'destination-in';
                ctx2d.drawImage(rc, 0, 0);
                ctx2d.globalCompositeOperation = 'source-over';
            }
            return Utils.finalImageDataUrl(canvas, ie.outputFormat, ie.outputQuality);
        };

        // 图标编辑器：保存
        const applyIconEditor = () => {
            const ie = editForm.iconEditor;
            const site = editForm.site;
            const isCatIcon = (ie.target || 'site') === 'categoryIcon';
            const prevSite = { logo: site.logo, iconSrc: site.iconSrc, iconEdit: site.iconEdit, bgType: site.bgType, bgColor: site.bgColor, bgText: site.bgText };
            if (ie.tab === 'image') {
                site.bgType = 'image';
                if (ie.sourceImage && ie._imgEl) {
                    try {
                        const dataURL = renderIconToCanvas(ie);
                        site.logo = dataURL;
                        site.bgColor = (ie.bgColor && ie.bgColor !== 'transparent') ? ie.bgColor : '';
                        site.logoShape = ie.shape || 'square';
                    } catch (err) {
                        // 远程图片跨域无法导出：直接保存原图地址/数据
                        site.logo = ie.sourceImage;
                        site.bgColor = '';
                    }
                } else if (ie.sourceImage) {
                    site.logo = ie.sourceImage;
                    site.bgColor = '';
                } else {
                    site.logo = '';
                    site.bgColor = '';
                }
            } else if (ie.tab === 'text') {
                site.bgType = 'text';
                site.bgText = ie.textValue || (site.name || '?').charAt(0).toUpperCase();
                site.bgColor = ie.bgColor && ie.bgColor !== 'transparent' ? ie.bgColor : '';
                site.logo = '';
            } else if (ie.tab === 'svg') {
                site.bgType = 'svg';
                site.bgColor = '';
                site.logo = ie.svgText || '';   // 原始 SVG 文本，渲染层内联
            } else if (ie.tab === 'url') {
                site.bgType = 'url';
                site.bgColor = '';
                site.logo = ie.urlValue || '';
            }
            // 额外保存“未截取的原图 + 裁剪参数”，用于下次打开时还原（不影响上面的成品图导出）
            if (ie.tab === 'image' && ie.sourceImage) {
                site.iconSrc = ie.sourceImage;
                site.iconEdit = {
                    imgScale: ie.imgScale,
                    imgTranslateX: ie.imgTranslateX,
                    imgTranslateY: ie.imgTranslateY,
                    cropX: ie.cropX,
                    cropY: ie.cropY,
                    cropW: ie.cropW,
                    cropH: ie.cropH,
                    rotation: ie.rotation || 0,
                    bgColor: ie.bgColor || 'transparent',
                    outputSize: ie.outputSize || 64,
                    outputFormat: ie.outputFormat || 'auto',
                    outputQuality: ie.outputQuality != null ? ie.outputQuality : 85,
                    bgOpacity: ie.bgOpacity != null ? ie.bgOpacity : 100,
                    shape: ie.shape || 'square',
                    iconOpacity: ie.iconOpacity != null ? ie.iconOpacity : 100
                };
            } else {
                site.iconSrc = '';
                site.iconEdit = null;
            }
            // 侧边栏图标：写回对应 sidebarTop 字段，并还原 site（避免污染正在编辑的站点）
            if ((ie.target || 'site').indexOf('sidebar:') === 0) {
                const sbKey = (ie.target).slice('sidebar:'.length);
                const cfg = SIDEBAR_ICON_TARGETS[sbKey];
                const st = editForm.sidebarTop;
                if (cfg) {
                    if (ie.tab === 'image') {
                        st[cfg.srcKey] = site.logo;
                        st[cfg.srcRawKey] = ie.sourceImage || '';
                        st[cfg.editKey] = (ie.sourceImage) ? {
                            imgScale: ie.imgScale, imgTranslateX: ie.imgTranslateX, imgTranslateY: ie.imgTranslateY,
                            cropX: ie.cropX, cropY: ie.cropY, cropW: ie.cropW, cropH: ie.cropH,
                            rotation: ie.rotation || 0, bgColor: ie.bgColor || 'transparent',
                            outputSize: ie.outputSize || 64, outputFormat: ie.outputFormat || 'auto',
                            outputQuality: ie.outputQuality != null ? ie.outputQuality : 85, shape: ie.shape || 'square',
                            bgOpacity: ie.bgOpacity != null ? ie.bgOpacity : 100,
                            iconOpacity: ie.iconOpacity != null ? ie.iconOpacity : 100
                        } : null;
                    } else if (ie.tab === 'text') {
                        st[cfg.srcKey] = '';
                        st[cfg.srcRawKey] = '';
                        st[cfg.editKey] = null;
                    } else if (ie.tab === 'svg' || ie.tab === 'url') {
                        // 侧边栏图标存为可直接引用的值：svg 转 data URL（可被 <img> / <link> 引用），url 原样
                        const _svgToDataUrl = (s) => 'data:image/svg+xml,' + encodeURIComponent(s || '');
                        st[cfg.srcKey] = ie.tab === 'svg' ? _svgToDataUrl(ie.svgText || '') : (ie.urlValue || '');
                        st[cfg.srcRawKey] = ie.tab === 'svg' ? (ie.svgText || '') : (ie.urlValue || '');
                        st[cfg.editKey] = null;
                    }
                }
                if (cfg) {
                    data.site[cfg.srcKey] = st[cfg.srcKey];
                    data.site[cfg.srcRawKey] = st[cfg.srcRawKey];
                    data.site[cfg.editKey] = st[cfg.editKey] ? { ...st[cfg.editKey] } : null;
                }
                Object.assign(site, prevSite);
                closeIconEditor();
                return;
            }
            // 搜索引擎 Logo：写回 searchConfig.tabs[ti].engines[ei].logo（并保存原图/裁剪参数便于再次编辑）
            if ((ie.target || '').indexOf('searchEngine:') === 0) {
                const parts = String(ie.target).split(':');
                const ti = parseInt(parts[1], 10);
                const ei = parseInt(parts[2], 10);
                const tab = (data.searchConfig && data.searchConfig.tabs) ? data.searchConfig.tabs[ti] : null;
                const eng = (tab && tab.engines) ? tab.engines[ei] : null;
                if (eng) {
                    if (ie.tab === 'image') {
                        let val = '';
                        if (ie.sourceImage && ie._imgEl) {
                            try { val = renderIconToCanvas(ie); } catch (e) { val = ie.sourceImage; }
                        } else if (ie.sourceImage) { val = ie.sourceImage; }
                        eng.logo = val;
                        eng.logoSrc = ie.sourceImage || '';
                        eng.logoEdit = ie.sourceImage ? {
                            imgScale: ie.imgScale, imgTranslateX: ie.imgTranslateX, imgTranslateY: ie.imgTranslateY,
                            cropX: ie.cropX, cropY: ie.cropY, cropW: ie.cropW, cropH: ie.cropH,
                            rotation: ie.rotation || 0, bgColor: ie.bgColor || 'transparent',
                            outputSize: ie.outputSize || 64, shape: ie.shape || 'square',
                            iconOpacity: ie.iconOpacity != null ? ie.iconOpacity : 100
                        } : null;
                        eng.logoShape = ie.shape || 'square';
                    } else if (ie.tab === 'svg') {
                        eng.logo = ie.svgText || '';
                        eng.logoSrc = ie.svgText || '';
                        eng.logoEdit = null;
                    } else if (ie.tab === 'url') {
                        eng.logo = ie.urlValue || '';
                        eng.logoSrc = ie.urlValue || '';
                        eng.logoEdit = null;
                    }
                }
                Object.assign(site, prevSite);
                closeIconEditor();
                return;
            }
            if (isCatIcon) {
                if (ie.tab === 'image' || ie.tab === 'svg' || ie.tab === 'url') {
                    editForm.category.icon = site.logo;
                }
                editForm.category.iconShape = ie.shape || 'square';
                Object.assign(site, prevSite); // 还原站点图标字段，避免污染正在编辑的站点
                closeIconEditor();
                modal.imageCropper = false; // 关闭分类图标设置弹窗，回到分类编辑
                return;
            }
            closeIconEditor();
        };

        // 为分类图标打开裁剪器/自定义图标设置
        const openCategoryIconCropper = (currentValue) => {
            const ctx = editForm.imageCropper;
            ctx.open = true;
            ctx.target = 'categoryIcon';
            ctx.headerLogoMode = 'icon';
            ctx.shape = editForm.category.iconShape || 'square';
            ctx.tabIdx = -1;
            ctx.engIdx = -1;
            ctx.sourceImage = '';
            ctx.fileName = '';
            ctx.fileType = '';
            ctx.crop = { x: 0, y: 0, w: 0, h: 0 };
            ctx.imgSize = { w: 0, h: 0 };
            ctx.output = 'square';
            ctx.outputSize = 64;
            ctx.outputFormat = 'auto';
            ctx.svgText = '';
            ctx.urlValue = '';
            ctx.rotation = 0;
            ctx.bgColor = 'transparent';
            ctx.zoom = 1;
            // 默认落到「上传图片」标签页（用户要求点击自定义图标后默认上传图片）
            ctx.mode = 'upload';
            ctx.urlValue = '';
            ctx.svgText = '';
            // 初始化图标编辑器状态：分类图标复用站点图标编辑器的图片裁剪体验（大预览 / 8角裁剪框 / 缩放 / 旋转 / 背景 / 形状 / 输出尺寸）
            const ie = editForm.iconEditor;
            const isImgUrl = currentValue && /^(https?:|data:|ftp:|\/|\.\/|\.\.\/)/i.test(currentValue.trim());
            ie.target = 'categoryIcon';
            ie.tab = 'image';
            ie.sourceImage = isImgUrl ? currentValue : '';
            ie.fileName = '';
            ie.fileType = '';
            ie.rotation = 0;
            ie.bgColor = 'transparent';
            ie.iconOpacity = 100;
            ie.customBgColor = '#4f46e5';
            ie.zoom = 1;
            ie.imgTranslateX = 0;
            ie.imgTranslateY = 0;
            ie.imgScale = 1;
            ie._initX = 0;
            ie._initY = 0;
            ie.dragging = false;
            ie.viewportSize = 350;
            ie.outputSize = 64;
            ie._dispW = 350;
            ie._dispH = 350;
            ie._imgEl = null;
            ie.cropX = Math.round((ie.viewportSize - 200) / 2);
            ie.cropY = Math.round((ie.viewportSize - 200) / 2);
            ie.cropW = 200;
            ie.cropH = 200;
            ie.cropInit = true;
            ie.fetching = false;
            ie.shape = editForm.category.iconShape || 'square';
            if (isImgUrl) {
                const img = new Image();
                img.onload = () => { alignCropToImage(ie, img); };
                img.onerror = () => {};
                img.src = currentValue;
            }
            if (currentValue && (currentValue.trim().startsWith('<svg') || currentValue.trim().startsWith('<?xml'))) {
                // 已有 SVG 图标：保持 svg 模式便于直接编辑保存
                ctx.mode = 'svg';
                ctx.svgText = currentValue;
            } else if (currentValue && /^(https?:|data:|ftp:|\/|\.\/|\.\.\/)/i.test(currentValue.trim())) {
                // 已有图片地址（http/data/相对路径）：保持 url 模式便于直接编辑保存
                ctx.mode = 'url';
                ctx.urlValue = currentValue;
            }
            modal.imageCropper = true;
        };

        // 判断图标值是否为图片（dataURL / http / 相对路径 / svg），用于渲染层选择 <img> 还是 <i>
        const isImageIcon = (v) => {
            const s = (v || '').trim();
            return s.startsWith('<svg') || /^https?:|data:|ftp:|\/|\.\/|\.\.\//i.test(s) || /\.svg(\?|#|$)/i.test(s);
        };

        // === 图标选择器 ===
        const openIconPicker = (target) => {
            let current = '';
            if (target === 'category') current = editForm.category.icon;
            else if (target === 'menuKey') current = editForm.menuKey.icon;
            editForm.iconPicker = { target, current };
            modal.iconPicker = true;
        };

        const selectIcon = (icon) => {
            if (editForm.iconPicker.target === 'category') {
                editForm.category.icon = icon;
            } else if (editForm.iconPicker.target === 'menuKey') {
                editForm.menuKey.icon = icon;
            } else if (editForm.iconPicker.target === 'searchTab') {
                const idx = editForm.iconPicker._searchTabIdx;
                if (idx >= 0 && data.searchConfig.tabs[idx]) {
                    data.searchConfig.tabs[idx].icon = icon;
                }
            } else if (editForm.iconPicker.target === 'footerMenu') {
                if (editForm.iconPicker.mode === 'add') footerMenuForm.icon = icon;
                else footerEditForm.icon = icon;
            } else if (editForm.iconPicker.target === 'friendLink') {
                friendLinkSettings.icon = icon;
            }
            modal.iconPicker = false;
        };

        // === 版本管理 ===
        const saveVersion = async (note = '') => {
            try {
                // 确保 note 不是 DOM 事件对象（防止 @click="saveVersion" 误传 PointerEvent）
                if (typeof note !== 'string') note = '';
                // 同步到 profile
                await saveCurrentToProfile();
                const finalNote = note || Utils.formatTime(Date.now());
                const saved = await Storage.saveVersion(JSON.parse(JSON.stringify(data)), finalNote);
                // 生成并保存部署文件组 deploy1
                try {
                    const deployFiles = await prepareVersionDeployFiles();
                    await Storage.writeVersionDeploy(Storage.getCurrentProfileId(), saved.id, 'deploy1', deployFiles);
                } catch (deployErr) {
                    console.warn('生成部署文件失败:', deployErr);
                }
                // 刷新版本列表，使顶部栏「当前版本名称」同步更新；新版本插入自定义顺序最前
                if (!Array.isArray(data.versionOrder)) data.versionOrder = [];
                data.versionOrder = [saved.id].concat(data.versionOrder.filter(id => id !== saved.id));
                try { await refreshVersions(); } catch (_) {}
                currentEditingVersionId.value = saved.id || null;
                data.currentVersionId = saved.id || null;
                try { await persistData({ mark: false }); } catch (_) {}
                markClean();
                showToast(note ? `已保存：${note}` : '版本已保存', 'success');
                // 打开版本历史并自动进入最新版本重命名，便于给刚保存的版本命名
                modal.versions = true;
                nextTick(() => { startRenameVersion(saved); });
            } catch (e) {
                showToast(`保存版本失败: ${e.message}`, 'error');
            }
        };

        // 直接保存到当前正在编辑的历史版本（不新建版本）
        const saveToCurrentVersion = async () => {
            try {
                if (!currentEditingVersionId.value) {
                    // 没有正在编辑的版本时回退为新建版本
                    await saveVersion();
                    return;
                }
                await saveCurrentToProfile();
                await Storage.updateVersionData(currentEditingVersionId.value, JSON.parse(JSON.stringify(data)));
                // 同步重新生成部署文件，避免版本部署快照落后于编辑数据（如 404 规则/模板）
                try {
                    const deployFiles = await prepareVersionDeployFiles();
                    await Storage.writeVersionDeploy(Storage.getCurrentProfileId(), currentEditingVersionId.value, 'deploy1', deployFiles);
                } catch (deployErr) {
                    console.warn('生成部署文件失败:', deployErr);
                }
                // 刷新版本列表
                try { await refreshVersions(); } catch (_) {}
                markClean();
                showToast('已保存到当前版本', 'success');
            } catch (e) {
                showToast(`保存到当前版本失败: ${e.message}`, 'error');
            }
        };

        // 保存入口：无历史版本时先弹确认，再执行新建版本
        const pendingSaveAction = ref(null);
        const requestSave = (action) => {
            if (versions.value && versions.value.length > 0) {
                if (action === 'save') saveToCurrentVersion();
                else if (action === 'saveAs') saveVersion();
                return;
            }
            pendingSaveAction.value = action;
            modal.noVersionConfirm = true;
        };
        const confirmNoVersionCreate = async () => {
            const action = pendingSaveAction.value;
            modal.noVersionConfirm = false;
            pendingSaveAction.value = null;
            if (action === 'save') await saveToCurrentVersion();
            else if (action === 'saveAs') await saveVersion();
        };

        // === 访客视角（全新方式）===
        // === 访客视角 ===
        // 生成 HTML → 用 Blob URL 打开。
        // <base> 标签让 assets 正常加载，但 #hash 链接会被 base 解析到服务器。
        // 解决：生成时把所有 #hash 链接改成 JavaScript 平滑滚动。
        // 生成访客视角/导出 HTML 的 <head> 注入：base 标签 + 高亮样式 + _sv 平滑滚动/高亮脚本
        const buildVisitorHead = (baseHref, sh) => {
            // 闪烁参数（带默认值 + 兼容旧版仅含 duration 的数据）
            const legacyDur = parseInt(sh.duration) || 0;
            const enabled = sh.enabled !== false;
            const color = (sh.color || '#ff6b6b').replace(/#/g, '');
            const blinkCount = sh.blinkCount != null ? (parseInt(sh.blinkCount) || 3) : 3;
            const blinkDuration = sh.blinkDuration != null ? (parseInt(sh.blinkDuration) || 300)
                : (legacyDur ? Math.max(100, Math.round(legacyDur / 3)) : 300);
            const blinkInterval = sh.blinkInterval != null ? (parseInt(sh.blinkInterval) || 150) : 150;
            // 单个闪烁周期 = 亮起时长 + 间隔；onPct 为高亮「亮着」的占比
            const cycle = blinkDuration + blinkInterval;
            const onPct = Math.max(1, Math.min(99, Math.round(blinkDuration / cycle * 100)));
            const styleTxt = '._sh-hl{animation:_shAnim ' + cycle + 'ms ease-in-out ' + blinkCount + ';border-radius:4px;padding:2px 6px;margin:-2px -6px}@keyframes _shAnim{0%{background-color:#' + color + '}' + onPct + '%{background-color:#' + color + '}100%{background-color:transparent}}';
            const scriptTxt = '<' + 'script>var _SH_CFG={e:' + enabled + ',bc:' + blinkCount + ',bd:' + blinkDuration + ',bi:' + blinkInterval + '};'
                + 'function _sv(h){'
                + 'var e=document.getElementById(h);'
                + 'if(!e)e=document.querySelector("[data-cat-id="+h+"]");'
                + 'if(e){'
                + 'var hd=document.querySelector(".page-header"),o=hd?hd.offsetHeight+12:60;'
                + 'var p=e.closest("h4")||e;'
                + 'var ty=e.getBoundingClientRect().top+window.pageYOffset-o;'
                + 'window.scrollTo({top:ty,behavior:"smooth"});'
                + 'if(_SH_CFG.e&&p){'
                + 'var _cycle=_SH_CFG.bd+_SH_CFG.bi;'
                + 'var _fire=function(){p.classList.remove("_sh-hl");void p.offsetWidth;p.classList.add("_sh-hl");setTimeout(function(){p.classList.remove("_sh-hl")},_cycle*_SH_CFG.bc+250);};'
                + 'if(Math.abs(ty-window.pageYOffset)<5){_fire();}else{'
                + 'var _st,_done=false;'
                + 'var _fin=function(){if(_done)return;_done=true;window.removeEventListener("scroll",_onS);_fire();};'
                + 'var _onS=function(){clearTimeout(_st);_st=setTimeout(_fin,140);};'
                + 'window.addEventListener("scroll",_onS);'
                + 'setTimeout(_fin,1400);'
                + '}'
                + '}'
                + '}'
                + '}<' + '/script>';
            return '<head>\n    <base href="' + baseHref + '">\n    <style>' + styleTxt + '</style>\n    ' + scriptTxt;
        };

        // 生成访客视角完整 HTML（含 base 标签、commit.html blob 等处理），返回 { url, svCommitUrl }
        // 将生成的访客页 HTML 写入子窗口（about:blank 同源，document.write 可靠；不依赖 blob/location.replace）
        const writeVisitorDoc = (win, html) => {
            try {
                win.document.open();
                win.document.write(html);
                win.document.close();
                win.__navEditorVisitorReady = true;
            } catch (e) { /* ignore */ }
        };

        const buildVisitorPage = (rawData, commitHtmlOverride) => {
            const cleanData = JSON.parse(JSON.stringify(rawData));
            const curOrder = (Array.isArray(cleanData.footerMenuOrder) && cleanData.footerMenuOrder.length)
                ? cleanData.footerMenuOrder.slice()
                : ['mk-submit', 'mk-friend', 'about-link'];
            cleanData.footerMenuOrder = curOrder;
            if (cleanData.site && cleanData.site.favicon) {
                const fav = cleanData.site.favicon;
                if (typeof fav === 'string' && (
                    (fav.startsWith('data:') && fav.length > 50 * 1024) ||
                    fav.includes('image_blob_ref') || fav.includes('"blob_id"')
                )) {
                    cleanData.site.favicon = '';
                }
            }
            let html = Generator.generate(cleanData);
            const baseHref = window.location.origin + '/';
            const sh = cleanData.site.scrollHighlight || {};
            // 注入跨窗口同步脚本：about:blank 子窗口与编辑器同源，监听 storage 信标后
            // 直接从 window.opener.__navEditorVisitorHtml 重写文档（不依赖 blob URL / location.replace）。
            const visitorSyncScript = '<' + 'script>(function(){try{window.addEventListener("storage",function(e){if(e.key==="__navEditorVisitorRefresh"){var w=window.opener;if(w&&w.__navEditorVisitorHtml){document.open();document.write(w.__navEditorVisitorHtml);document.close();}}});window.__navEditorVisitorReady=true;}catch(e){}})();<' + '/script>';
            html = html.replace(/<head>/i, buildVisitorHead(baseHref, sh) + visitorSyncScript);
            html = html.replace(/href="(#[\w-]+)"/g, 'href="javascript:void(0)" onclick="_sv(\'$1\'.slice(1))"');
            html = html.replace(/\bchange-href\b/g, '');
            html = html.replace(/href=""/g, 'href="javascript:void(0)" onclick="window.scrollTo(0,0);return false"');
            html = html.replace(/href="\.\/"/g, 'href="javascript:void(0)" onclick="window.scrollTo(0,0);return false"');
            // 网站提交页：优先使用可视化编辑器保存的文件（由调用方 fetch 后注入）；
            // 未保存时不再回退旧版 generateCommit（旧模板带“在线工具网”品牌，属历史残留），显示占位提示
            let svCommitHtml;
            if (commitHtmlOverride && commitHtmlOverride.trim()) {
                svCommitHtml = commitHtmlOverride;
            } else {
                svCommitHtml = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>网站提交</title></head><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:Microsoft YaHei,sans-serif;background:#f5f7fa;color:#888"><div style="text-align:center"><p style="font-size:18px;margin:0 0 8px">网站提交页面尚未配置</p><p style="font-size:13px;margin:0">请在编辑器中打开「网站提交」模板编辑器并保存后查看</p></div></body></html>';
            }
            svCommitHtml = svCommitHtml.replace(/<head>/i, '<head>\n    <base href="' + baseHref + '">');
            const svCommitUrl = URL.createObjectURL(new Blob([svCommitHtml], { type: 'text/html;charset=utf-8' }));
            window.__svCommitUrl = svCommitUrl;
            // 页脚“网站提交”链接统一指向新模板 blob（链接文本恒为 commit.html，与部署文件名一致）
            html = html.replace(/href="((?:\.\/)?(?:footer\/)?)commit\.html"/g,
                'href="javascript:void(0)" onclick="var __u=window.opener&&window.opener.__svCommitUrl;window.open(__u||\'commit.html\',\'_blank\');return false;"');
            // 关于导航页：生成自包含 about.html blob，并把页脚关于导航链接指向它
            let svAboutUrl = '';
            if (cleanData.about) {
                const svAboutHtml = Generator.generateAboutDeployed(cleanData).replace(/<head>/i, '<head>\n    <base href="' + baseHref + '">');
                if (svAboutHtml) {
                    svAboutUrl = URL.createObjectURL(new Blob([svAboutHtml], { type: 'text/html;charset=utf-8' }));
                    window.__svAboutUrl = svAboutUrl;
                }
            }
            html = html.replace(/href="(footer\/about\.html|\/footer\/about\.html)"/g,
                'href="javascript:void(0)" onclick="var __a=window.opener&&window.opener.__svAboutUrl;window.open(__a||\'' + (getFooterDeployBase() + '/about.html') + '\',\'_blank\');return false;"');
            // 注入 404 路由演示脚本（访客视角下通过 hash 触发规则匹配，提示命中模板）
            try {
                const _rules = (cleanData.site && cleanData.site.error404 && cleanData.site.error404.rules) || [];
                const _v404 = '(function(){try{'
                    + 'window.__nav404Rules=' + JSON.stringify(_rules) + ';'
                    + 'function load404(t){document.body.innerHTML=\'<div style="padding:40px;font-family:sans-serif"><h1>404 演示</h1><p>命中规则，将使用模板：\'+t+\'</p><p>真实页面内容在部署后（deploy1/404/\'+t+\'）生效。</p></div>\';}'
                    + 'function tr(){var h=location.hash.replace(/^#/,"");if(!h)return;var rs=window.__nav404Rules||[];for(var i=0;i<rs.length;i++){var p=rs[i].pattern;if(!p)continue;var ps=p.split("*");var rx=new RegExp("^"+ps.map(function(s){return s.replace(/[.*+?^${}()|[\\]\\/]/g,"\\$&");}).join("([^/]*)")+"$");if(rx.test(h)){load404(rs[i].template);return;}}}'
                    + 'window.addEventListener("hashchange",tr);tr();'
                    + '}catch(e){}})();';
                html = html.replace('</body>', '<' + 'script>' + _v404 + '</' + 'script></body>');
            } catch (e) {}

            return { html, svCommitUrl, svAboutUrl };
        };

        const openVisitorView = async () => {
            try {
                // 优先 fetch 当前版本部署目录下 footer/commit.html（编辑器保存的文件）作为网站提交页内容
                let commitHtmlOverride = null;
                const _commitPath = getFooterDeployBase() + '/commit.html';
                try {
                    const _res = await fetch(_commitPath + '?t=' + Date.now());
                    if (_res.ok) commitHtmlOverride = await _res.text();
                } catch (_e) { commitHtmlOverride = null; }
                const { html, svCommitUrl, svAboutUrl } = buildVisitorPage(data, commitHtmlOverride);
                window.__svCommitUrl = svCommitUrl;
                window.__svAboutUrl = svAboutUrl || '';
                window.__navEditorVisitorHtml = html;
                // 信标：已打开的访客窗口（about:blank，同源）会收到 storage 事件并重写文档
                try { window.localStorage.setItem('__navEditorVisitorRefresh', String(Date.now())); } catch (e) {}
                let win = window.__navEditorVisitorWin;
                if (win && !win.closed && win.__navEditorVisitorReady) {
                    writeVisitorDoc(win, html);
                } else {
                    win = window.open('about:blank', '_blank');
                    window.__navEditorVisitorWin = win;
                    if (win) {
                        try {
                            writeVisitorDoc(win, html);
                        } catch (e) {
                            try { win.onload = () => writeVisitorDoc(win, html); } catch (e2) {}
                            setTimeout(() => { try { if (win && !win.closed) writeVisitorDoc(win, html); } catch (e3) {} }, 400);
                        }
                    }
                }
                if (!win) showToast('浏览器拦截了新窗口，请允许弹窗后重试', 'warning');
            } catch (e) {
                console.error('访客视角打开失败', e);
                showToast('访客视角打开失败：' + (e.message || e), 'danger');
            }
        };

        // === 404 页面模板管理 ===
        const error404Templates = ref([]);
        const error404LoadError = ref('');
        const loadError404Templates = async () => {
            error404LoadError.value = '';
            try {
                const res = await fetch('/api/list-404-templates');
                if (res.ok) {
                    const j = await res.json();
                    error404Templates.value = (j.templates && j.templates.length) ? j.templates : [];
                } else {
                    error404LoadError.value = '后端接口未就绪（状态 ' + res.status + '），请重启 NavEditor 后重试。';
                    console.warn('加载 404 模板列表失败', res.status);
                }
            } catch (e) {
                error404LoadError.value = '无法连接后端接口，请重启 NavEditor 后重试。';
                console.warn('加载 404 模板列表失败', e);
            }
        };
        const isError404Selected = (name) => {
            const arr = (editForm.headerConfig.error404 && editForm.headerConfig.error404.templates) || [];
            return arr.includes(name);
        };
        const toggleError404Template = (name) => {
            if (!editForm.headerConfig.error404) editForm.headerConfig.error404 = { enabled: true, templates: [], default: '', rules: [] };
            const arr = editForm.headerConfig.error404.templates;
            const idx = arr.indexOf(name);
            if (idx >= 0) {
                arr.splice(idx, 1);
                if (editForm.headerConfig.error404.default === name) editForm.headerConfig.error404.default = arr.length ? arr[0] : '';
            } else {
                arr.push(name);
                if (!editForm.headerConfig.error404.default) editForm.headerConfig.error404.default = name;
            }
        };
        const addError404Rule = () => {
            if (!editForm.headerConfig.error404) editForm.headerConfig.error404 = { enabled: true, templates: [], default: '', rules: [] };
            const tpls = editForm.headerConfig.error404.templates;
            const def = editForm.headerConfig.error404.default || (tpls.length ? tpls[0] : '');
            editForm.headerConfig.error404.rules.push({ pattern: '', template: def });
        };
        const removeError404Rule = (i) => {
            if (!editForm.headerConfig.error404) return;
            editForm.headerConfig.error404.rules.splice(i, 1);
        };

        // === 另存为（全新方式）===
        // 不用 Blob 包装、不用 base 标签、不动 href，直接生成 HTML 下载。
        // 下载的文件用服务器地址的绝对路径引用 assets，在服务器开着时能正常显示。
        // #hash 锚点纯浏览器行为，在下载的本地文件中不会跳转到服务器。
        const openSaveAsDialog = () => {
            showSaveAsModal.value = true;
        };

        // 生成 404 入口页：根据 404/rules.json 按当前 path 匹配加载对应模板
        const buildNotFoundEntry = (cfg) => {
            const rulesJson = JSON.stringify(cfg.rules || []);
            const def = cfg.default || '';
            return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>404</title></head>
<body>
<script>
(function(){
  var path = location.pathname;
  var rules = ${rulesJson};
  var def = ${JSON.stringify(def)};
  function matchRule(pat){
    if(!pat) return false;
    var parts = pat.split('*');
    var rx = new RegExp('^' + parts.map(function(s){ return s.replace(/[.*+?^\${}()|[\]\\/]/g, '\\$&'); }).join('([^/]*)') + '$');
    return rx.test(path);
  }
  var hit = null;
  for (var i = 0; i < rules.length; i++) {
    if (matchRule(rules[i].pattern)) { hit = rules[i].template; break; }
  }
  var tpl = hit || def;
  if (tpl) {
    fetch('404/' + tpl).then(function(r){ return r.text(); }).then(function(html){
      document.open(); document.write(html); document.close();
    });
  }
})();
<\/script>
</body></html>`;
        };

        // 根据 SEO 配置生成 robots.txt / sitemap.xml / 站点验证文件（部署时一并发布）
        const buildSeoFiles = (sourceData) => {
            const seo = (sourceData && sourceData.seo && typeof sourceData.seo === 'object')
                ? sourceData.seo
                : ((data.seo && typeof data.seo === 'object') ? data.seo : {});
            if (!seo.enabled) return [];
            const files = [];
            const baseUrl = String(seo.baseUrl || '').replace(/\/+$/, '');
            const v = (seo.verification && typeof seo.verification === 'object') ? seo.verification : {};

            // robots.txt
            if (seo.generateRobots !== false) {
                const rules = (Array.isArray(seo.robotsRules) && seo.robotsRules.length)
                    ? seo.robotsRules
                    : [{ userAgent: '*', allow: '/', disallow: '' }];
                const lines = [];
                for (const r of rules) {
                    if (!r || !r.userAgent) continue;
                    lines.push('User-agent: ' + String(r.userAgent));
                    if (r.disallow && String(r.disallow).trim()) lines.push('Disallow: ' + String(r.disallow).trim());
                    if (r.allow && String(r.allow).trim()) lines.push('Allow: ' + String(r.allow).trim());
                    lines.push('');
                }
                if (baseUrl) lines.push('Sitemap: ' + baseUrl + '/sitemap.xml');
                files.push({ path: 'robots.txt', content: lines.join('\n') || 'User-agent: *\nAllow: /\n' });
            }

            // sitemap.xml（需要部署地址）
            if (seo.generateSitemap !== false && baseUrl) {
                const locs = [baseUrl + '/', baseUrl + '/footer/about.html', baseUrl + '/footer/commit.html'];
                const escXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                const xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
                    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                    + locs.map(l => '  <url><loc>' + escXml(l) + '</loc></url>').join('\n')
                    + '\n</urlset>\n';
                files.push({ path: 'sitemap.xml', content: xml });
            }

            // 站点验证文件（经典文件验证方式；meta 方式已由 seoHead 注入）
            if (v.google) files.push({ path: 'google' + String(v.google).trim() + '.html', content: '<html><head><meta name="google-site-verification" content="' + String(v.google).trim() + '" /></head><body></body></html>' });
            if (v.baidu) files.push({ path: 'baidu_verify_' + String(v.baidu).trim() + '.html', content: '<html><head><meta name="baidu-site-verification" content="' + String(v.baidu).trim() + '" /></head><body></body></html>' });
            if (v.sogou) files.push({ path: 'sogou_site_verification_' + String(v.sogou).trim() + '.html', content: '<html><head><meta name="sogou_site_verification" content="' + String(v.sogou).trim() + '" /></head><body></body></html>' });
            return files;
        };

        // 根据当前 404 配置生成 404 模板、路由规则与入口文件（模板内容从 template/404/ 读取）
        const buildNotFoundFiles = async () => {
            const out = [];
            const e404 = (data.site && data.site.error404) || null;
            const tpls = (e404 && e404.templates) || [];
            const rules = (e404 && e404.rules) || [];
            const def = (e404 && e404.default) || '';
            for (const name of tpls) {
                try {
                    const res = await fetch('/api/404-template-content?name=' + encodeURIComponent(name));
                    if (res.ok) {
                        const j = await res.json();
                        if (j.ok && j.content) {
                            out.push({ name: '404/' + name, content: j.content, type: 'text/html;charset=utf-8' });
                        }
                    }
                } catch (_e) { console.warn('读取 404 模板失败', name); }
            }
            if (tpls.length) {
                const cleanRules = rules.filter(r => r.pattern && r.template);
                const rulesObj = { rules: cleanRules, default: def };
                out.push({ name: '404/rules.json', content: JSON.stringify(rulesObj, null, 2), type: 'application/json;charset=utf-8' });
                out.push({ name: '404.html', content: buildNotFoundEntry(rulesObj), type: 'text/html;charset=utf-8' });
            }
            return out;
        };

        // 准备部署文件：生成 HTML 并获取静态资源；filter 决定包含哪些文件
        const prepareDeploymentFiles = async (filter, sourceData) => {
            const { indexHtml, aboutHtml, commitHtml, commitPath } = await prepareDeploymentHtml(sourceData);
            const f = filter || { index: true, about: true, commit: true, customCss: true, notFound: true };

            const files = [];
            if (f.index && indexHtml) files.push({ name: 'index.html', content: indexHtml, type: 'text/html;charset=utf-8' });
            if (f.about && aboutHtml) files.push({ name: 'footer/about.html', content: aboutHtml, type: 'text/html;charset=utf-8' });
            if (f.commit && commitHtml) files.push({ name: commitPath || 'commit.html', content: commitHtml, type: 'text/html;charset=utf-8' });

            // 获取 custom-style.css 和 404.html（从本地服务器读取）
            if (f.customCss) {
                try {
                    const cssRes = await fetch('./assets/css/custom-style.css');
                    if (cssRes.ok) {
                        const cssContent = await cssRes.text();
                        if (cssContent.trim()) files.push({ name: 'assets/css/custom-style.css', content: cssContent, type: 'text/css;charset=utf-8' });
                    }
                } catch (e) {
                    console.warn('读取 custom-style.css 失败，跳过', e);
                }
            }
            if (f.notFound) {
                try {
                    const nfFiles = await buildNotFoundFiles();
                    for (const nf of nfFiles) files.push(nf);
                } catch (e) {
                    console.warn('生成 404 失败，跳过', e);
                }
            }

            // SEO 附加文件（robots / sitemap / 站点验证）
            const seoFiles = buildSeoFiles(sourceData);
            for (const sf of seoFiles) {
                files.push({ name: sf.path, content: sf.content, type: 'text/plain;charset=utf-8' });
            }

            // Cloudflare 专用排除文件：始终随部署包发布，避免站点仓库 .git 超过 25MiB 限制
            if (!files.some(f => f.name === '.assetsignore')) {
                files.push({ name: '.assetsignore', content: '# Cloudflare Workers static assets ignore (same format as .gitignore)\n.git/\n.wrangler/\nnode_modules/\nbuild/\ndist/\n', type: 'text/plain;charset=utf-8' });
            }

            return files;
        };

        // 准备版本部署文件：生成 HTML + 收集 data 中实际引用的 assets/ 资源
        const prepareVersionDeployFiles = async (sourceData) => {
            // 允许传入指定数据源（如默认模板数据），否则使用当前 data
            const htmlFiles = await prepareDeploymentFiles({ index: true, about: true, commit: true, customCss: true, notFound: true }, sourceData);
            // 部署 HTML 必须可移植：去掉写死的本地服务 base（如 http://127.0.0.1:9527/），
            // 子目录页面改用相对层级 base，并把 /assets/ 绝对引用改为 ./assets/，否则发布后无法独立运行。
            const portableHtml = (name, html) => {
                const depth = String(name).split('/').length - 1;
                if (depth <= 0) {
                    html = html.replace(/<base\s+href=["']https?:\/\/[^"']*["'][^>]*>/gi, '');
                } else {
                    const rel = '../'.repeat(depth);
                    html = html.replace(/<base\s+href=["']https?:\/\/[^"']*["'][^>]*>/gi, '<base href="' + rel + '">');
                    if (!/<base\b/i.test(html)) html = html.replace(/<head[^>]*>/i, m => m + '\n    <base href="' + rel + '">');
                }
                html = html.replace(/(href|src)=["']\/(assets\/)/gi, '$1="./$2"');
                html = html.replace(/url\(\s*["']?\/(assets\/)/gi, 'url(./$2');
                return html;
            };
            const files = htmlFiles.map(f => ({
                path: f.name,
                content: /\.html?$/i.test(f.name) ? portableHtml(f.name, f.content) : f.content
            }));

            // 从指定数据源中找出所有引用的 assets/ 路径
            const dataStr = JSON.stringify(sourceData || data);
            const matches = dataStr.match(/"(?:\.\/)?assets\/[^"]+"/g) || [];
            const assetPaths = [...new Set(matches.map(m => m.replace(/"/g, '').replace(/^\.\//, '')))];

            const abToBase64 = (buffer) => {
                const bytes = new Uint8Array(buffer);
                let binary = '';
                for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
                return btoa(binary);
            };

            for (const path of assetPaths) {
                try {
                    const res = await fetch('./' + path);
                    if (!res.ok) continue;
                    const blob = await res.blob();
                    const buffer = await blob.arrayBuffer();
                    const ext = path.split('.').pop().toLowerCase();
                    const textExts = { css: 1, html: 1, htm: 1, js: 1, json: 1, svg: 1, txt: 1 };
                    const isBinary = !textExts[ext];
                    const content = isBinary ? abToBase64(buffer) : new TextDecoder().decode(buffer);
                    files.push({ path, content, binary: isBinary });
                } catch (e) { console.warn('收集版本资源失败:', path, e); }
            }

            return files;
        };

        // 获取网站提交页导出内容：优先使用当前版本部署目录下 footer/commit.html（编辑器保存的文件）；
        // 不再回退旧版 generateCommit（旧模板带“在线工具网”品牌，属历史残留）
        const getCommitExport = async (srcData) => {
            const url = getFooterDeployBase() + '/commit.html';
            try {
                const res = await fetch(url + '?t=' + Date.now());
                if (res.ok) {
                    const html = await res.text();
                    // 网站提交页统一存到 footer/commit.html（根目录 commit.html 是历史残留，不再使用）
                    return { html, path: 'footer/commit.html' };
                }
            } catch (_e) { /* 忽略：未保存时不再自动生成 */ }
            return { html: '', path: 'footer/commit.html' };
        };

        // 仅生成部署所需的 HTML 内容（供后端打包 .zip 使用）
        const prepareDeploymentHtml = async (sourceData) => {
            // 1. 深拷贝 + 压缩大图
            const cleanData = JSON.parse(JSON.stringify(sourceData || data));
            const tasks = [];
            const addTask = (obj, key, maxBytes, maxSize) => {
                const v = obj[key];
                if (typeof v !== 'string' || !v) return;
                if (v.includes('image_blob_ref') || v.includes('"blob_id"')) { obj[key] = ''; return; }
                if (v.startsWith('data:') && v.length > maxBytes) {
                    tasks.push(new Promise(r => Utils.compressImageDataUrl(v, maxSize, 0.85, c => { obj[key] = c; r(); })));
                }
            };
            if (cleanData.site) {
                addTask(cleanData.site, 'favicon', 3 * 1024, 64);
                addTask(cleanData.site, 'logoLight', 50 * 1024, 200);
                addTask(cleanData.site, 'logoDark', 50 * 1024, 200);
            }
            if (cleanData.categories) {
                cleanData.categories.forEach(c => c.children && c.children.forEach(s => s.sites && s.sites.forEach(site => addTask(site, 'logo', 10 * 1024, 64))));
            }
            if (tasks.length > 0) {
                showToast(`正在压缩 ${tasks.length} 个大图...`, 'info', 10000);
                await Promise.all(tasks);
            }

            // 2. 生成 HTML + 注入 base 标签 + 改造 hash 链接
            const baseHref = window.location.origin + '/';
            const prep = (html) => {
                // 注入 base 标签（让 CSS/JS 在服务器开着时正常工作）
                var sh = cleanData.site.scrollHighlight || {};
                html = html.replace(/<head>/i, buildVisitorHead(baseHref, sh));
                // #hash 链接 → 调用 _sv()（含 data-cat-id 回退：主分类 cat.id 在内容区无直接锚点，回退到首子分类）
                html = html.replace(/href="(#[\w-]+)"/g, 'href="javascript:void(0)" onclick="_sv(\'$1\'.slice(1))"');
                // 防止 app-anim.js 改回 href
                html = html.replace(/\bchange-href\b/g, '');
                // 首页 ./ 与空链接在本地预览（localhost base）下会落到服务器根目录，
                // 这里转为回到顶部避免误跳；部署打包时再按相对 base 解析真实路径。
                html = html.replace(/href=""/g, 'href="javascript:void(0)" onclick="window.scrollTo(0,0);return false"');
                html = html.replace(/href="\.\/"/g, 'href="javascript:void(0)" onclick="window.scrollTo(0,0);return false"');
                html = html.replace(/href="(?:\.\/)?footer"/g, 'href="javascript:void(0)" onclick="window.scrollTo(0,0);return false"');
                // 网站提交菜单在部署页里必须指向真实文件 footer/commit.html（根目录 commit.html 已废弃，
                // 访客视角里才用 blob/占位，见 buildVisitorPage）
                html = html.replace(/href="(?:\.\/)?commit\.html"/g, 'href="footer/commit.html"');
                return html;
            };

            const indexHtml = prep(Generator.generate(cleanData));
            const aboutHtml = cleanData.about ? prep(Generator.generateAboutDeployed(cleanData)) : '';
            const commitExport = await getCommitExport(cleanData);
            const commitHtml = commitExport.html ? prep(commitExport.html) : '';

            return { indexHtml, aboutHtml, commitHtml, commitPath: commitExport.path };
        };

        // 合并下载：弹出文件夹选择器，按原目录结构写入
        const confirmSaveAsFolder = async () => {
            showSaveAsModal.value = false;
            try {
                if (!window.showDirectoryPicker) {
                    showToast('当前浏览器不支持文件夹直写，已切换到逐个下载', 'warning');
                    return confirmSaveAs();
                }
                showToast('正在生成文件...', 'info', 5000);
                const files = await prepareDeploymentFiles(data.exportSettings.fileSettings.html || {});
                showToast('请选择要保存的文件夹', 'info', 10000);
                const dirHandle = await window.showDirectoryPicker();
                let written = 0;
                const encoder = new TextEncoder();
                const BOM = new Uint8Array([0xEF, 0xBB, 0xBF]);
                for (const file of files) {
                    const pathParts = file.name.split('/');
                    const fileName = pathParts.pop();
                    let currentDir = dirHandle;
                    for (const part of pathParts) {
                        currentDir = await currentDir.getDirectoryHandle(part, { create: true });
                    }
                    const fileHandle = await currentDir.getFileHandle(fileName, { create: true });
                    const writable = await fileHandle.createWritable();
                    const bytes = encoder.encode(file.content);
                    const wb = new Uint8Array(BOM.length + bytes.length);
                    wb.set(BOM); wb.set(bytes, BOM.length);
                    await writable.write(wb);
                    await writable.close();
                    written++;
                }
                showToast(`已写入 ${written} 个文件`, 'success');
            } catch (e) {
                if (e.name === 'AbortError') {
                    // 用户取消选择器，静默处理
                } else {
                    console.error('文件夹导出失败', e);
                    showToast(`文件夹下载失败: ${e.message}`, 'error');
                }
            }
        };

        // 逐个下载：依次触发浏览器下载
        const confirmSaveAs = async () => {
            showSaveAsModal.value = false;
            try {
                showToast('正在生成文件...', 'info', 5000);
                const files = await prepareDeploymentFiles(data.exportSettings.fileSettings.html || {});
                const encoder = new TextEncoder();
                const BOM = new Uint8Array([0xEF, 0xBB, 0xBF]);
                const dl = (name, content, type) => {
                    const bytes = encoder.encode(content);
                    const wb = new Uint8Array(BOM.length + bytes.length);
                    wb.set(BOM); wb.set(bytes, BOM.length);
                    const blob = new Blob([wb], { type: type || 'text/html;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = name;
                    document.body.appendChild(a); a.click();
                    document.body.removeChild(a);
                    setTimeout(() => URL.revokeObjectURL(url), 5000);
                };
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    dl(file.name, file.content, file.type);
                    if (i < files.length - 1) await new Promise(r => setTimeout(r, 300));
                }
                showToast('文件已下载', 'success');
            } catch (e) {
                console.error('导出失败', e);
                showToast(`下载失败: ${e.message}`, 'error');
            }
        };

        // 打包下载部署文件为 .zip（供部署到 GitHub Pages 的全部文件）
        const exportDeploymentZip = async () => {
            const sanitizeFileName = (name) => {
                if (!name) return '';
                let s = String(name).trim();
                s = s.replace(/[\\/:*?"<>|]/g, '_').replace(/^\.+/, '').replace(/\.+$/, '');
                return s ? (s.length > 120 ? s.slice(0, 120) : s) : '';
            };
            // 导出文件名与当前站点「版本历史」中最新一条版本名称一致（无版本则回退 deploy）
            const getExportName = async () => {
                let exportName = 'deploy';
                try {
                    const versions = await Storage.getVersions();
                    if (versions && versions.length) {
                        const vn = sanitizeFileName(versions[0].note);
                        if (vn) exportName = vn;
                    }
                } catch (e) { /* 取版本名失败则回退默认 deploy */ }
                return exportName;
            };
            const triggerDownload = (url, exportName, size) => {
                const a = document.createElement('a');
                a.href = url;
                a.download = exportName + '.zip';
                document.body.appendChild(a); a.click();
                document.body.removeChild(a);
                showToast(`部署文件 .zip 已生成（${(size / 1024 / 1024).toFixed(2)} MB）`, 'success');
            };

            // 1) 主路径：按「全量发布」同一套文件集（deploySettings.fullFiles）重新生成当前部署包，
            //    即账号「全量发布」所需的完整文件。
            try {
                showToast('正在重新生成部署文件...', 'info', 10000);
                const exportName = await getExportName();
                const { indexHtml, aboutHtml, commitHtml } = await prepareDeploymentHtml();
                const df = (data.deploySettings && data.deploySettings.fullFiles) || { index: true, about: true, commit: true, customCss: true, notFound: true, assets: true };
                const idx = df.index ? indexHtml : '';
                const abt = df.about ? aboutHtml : '';
                const cmt = df.commit ? commitHtml : '';
                const fileFilter = {
                    customCss: df.customCss !== false,
                    notFound: df.notFound !== false,
                    assets: df.assets !== false
                };
                const includePaths = (data.deploySettings && Array.isArray(data.deploySettings.includePaths)) ? data.deploySettings.includePaths : [];

                showToast('正在请求后端打包 .zip...', 'info', 10000);
                // 大文件走 "后端保存到本地再 GET 下载" 分支，避免 headless/某些浏览器 fetch 大 blob 失败
                const extraFiles = buildSeoFiles();
                try {
                    const nfFiles = await buildNotFoundFiles();
                    for (const nf of nfFiles) extraFiles.push({ path: nf.name, content: nf.content });
                } catch (_e) { console.warn('生成 404 失败，跳过', _e); }
                const response = await fetch('/api/deployment-zip', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ indexHtml: idx, aboutHtml: abt, commitHtml: cmt, fileFilter, includePaths, extraFiles, download: true, fileName: exportName })
                });
                if (!response.ok) {
                    const err = await response.json().catch(() => ({ error: '后端打包失败' }));
                    throw new Error(err.error || '后端打包失败');
                }
                const result = await response.json();
                if (!result.ok || !result.url) {
                    throw new Error(result.error || '后端未返回下载地址');
                }
                triggerDownload(result.url, exportName, result.size || 0);
                return;
            } catch (e) {
                console.warn('按当前状态重新生成部署包失败，回退按「历史版本部署文件夹」打包:', e);
            }

            // 2) 回退：按「正在编辑的历史版本」的部署文件夹原样打包
            //    web/<site>/<version>/deploy1/ 内的文件即该版本保存时的部署产物
            try {
                const exportName = await getExportName();
                const siteId = Storage.getCurrentProfileId();
                let vid = currentEditingVersionId.value || data.currentVersionId || '';
                if (!vid) {
                    try {
                        const versions = await Storage.getVersions();
                        if (versions && versions.length) {
                            const sorted = [...versions].sort((a, b) => b.timestamp - a.timestamp);
                            vid = sorted[0].id;
                        }
                    } catch (e) { /* 取最新版本失败则继续 */ }
                }
                if (!vid) throw new Error('未找到可打包的版本');

                showToast('正在请求后端打包 .zip...', 'info', 10000);
                const response = await fetch('/api/deployment-zip', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ site: siteId, version: vid, group: 'deploy1', download: true, fileName: exportName })
                });
                if (!response.ok) {
                    const err = await response.json().catch(() => ({ error: '后端打包失败' }));
                    throw new Error(err.error || '后端打包失败');
                }
                const result = await response.json();
                if (!result.ok || !result.url) {
                    throw new Error(result.error || '后端未返回下载地址');
                }
                if (result.source !== 'version') {
                    throw new Error('后端未按版本文件夹打包');
                }
                triggerDownload(result.url, exportName, result.size || 0);
            } catch (e) {
                console.error('按版本文件夹打包 .zip 失败', e);
                showToast('后端打包失败，尝试浏览器内打包（可能缺少静态资源）', 'warning');
                // 回退：用浏览器内 JSZip 打包基础文件
                try {
                    if (typeof window.JSZip !== 'function') {
                        throw new Error('JSZip 库未加载');
                    }
                    const exportName = await getExportName();
                    const files = await prepareDeploymentFiles({ index: true, about: true, commit: true, customCss: true, notFound: true });
                    const zip = new window.JSZip();
                    for (const file of files) {
                        zip.file(file.name, file.content);
                    }
                    const blob2 = await zip.generateAsync({ type: 'blob' });
                    const url2 = URL.createObjectURL(blob2);
                    const a2 = document.createElement('a');
                    a2.href = url2; a2.download = exportName + '.zip';
                    document.body.appendChild(a2); a2.click();
                    document.body.removeChild(a2);
                    setTimeout(() => URL.revokeObjectURL(url2), 5000);
                    showToast('部署文件 .zip 已下载（浏览器内回退打包）', 'success');
                } catch (e2) {
                    console.error('浏览器内打包 .zip 失败', e2);
                    showToast(`打包 .zip 失败: ${e2.message}`, 'error');
                }
            }
        };

        // 下载修改文件：与「增量发布」同一套文件收集与对比口径，把自上次保存版本以来
        // 有变更/新增的文件打包成 zip（另附一份修改清单，含已删除文件列表）
        const exportModifiedFilesZip = async () => {
            try {
                const files = await collectDeployFiles(undefined, 'incrementalFiles');

                // 基线：当前编辑版本（上次「保存」时）的部署文件集
                let baseline = {};
                let baselineLabel = '无版本基线';
                const vid = currentEditingVersionId.value || data.currentVersionId || '';
                if (vid) {
                    try {
                        const vs = await Storage.getVersion(vid);
                        if (vs && vs.data && typeof vs.data === 'object') {
                            const vdata = JSON.parse(JSON.stringify(vs.data));
                            const baseFiles = await collectDeployFiles(vdata, 'incrementalFiles');
                            baseline = {};
                            baseFiles.forEach(f => { baseline[f.path] = f.hash; });
                            baselineLabel = '上次保存版本「' + (vs.note || vid) + '」';
                        }
                    } catch (e) {
                        console.warn('读取基线版本失败，按首次全量处理:', e);
                        baseline = {};
                        baselineLabel = '基线版本读取失败：' + (e && e.message ? e.message : String(e));
                    }
                }

                const current = {};
                files.forEach(f => { current[f.path] = f.hash; });
                const modified = files.filter(f => baseline[f.path] !== f.hash);
                const deleted = Object.keys(baseline).filter(p => !(p in current));
                if (modified.length === 0 && deleted.length === 0) {
                    showToast('未发现本次修改文件', 'error', 4000, true);
                    return;
                }

                if (typeof window.JSZip !== 'function') {
                    throw new Error('JSZip 库未加载');
                }
                const zip = new window.JSZip();
                for (const f of modified) {
                    if (f.binary) {
                        const raw = atob(f.content);
                        const bytes = new Uint8Array(raw.length);
                        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
                        zip.file(f.path, bytes);
                    } else {
                        zip.file(f.path, f.content);
                    }
                }
                // 修改清单：记录变更/新增与已删除文件（删除无法写入 zip，仅清单提示）
                const lines = [];
                lines.push('修改文件清单（基线：' + baselineLabel + '）');
                lines.push('生成时间：' + Utils.formatTime(Date.now()));
                lines.push('');
                lines.push('【变更 / 新增文件 ' + modified.length + ' 个】');
                modified.forEach(f => lines.push('  + ' + f.path));
                if (deleted.length) {
                    lines.push('');
                    lines.push('【已删除文件 ' + deleted.length + ' 个（请手动从站点删除）】');
                    deleted.forEach(p => lines.push('  - ' + p));
                }
                zip.file('_修改清单.txt', lines.join('\n'));

                const blob = await zip.generateAsync({ type: 'blob' });
                const ts = Utils.formatTime(Date.now()).replace(/[: ]/g, '-');
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = '修改文件_' + ts + '.zip';
                document.body.appendChild(a); a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 5000);
                const delMsg = deleted.length ? `；另有 ${deleted.length} 个文件已删除（见清单）` : '';
                showToast(`已下载 ${modified.length} 个修改文件${delMsg}`, 'success', 4000);
            } catch (e) {
                console.error('下载修改文件失败', e);
                showToast('下载修改文件失败：' + (e.message || e), 'error', 5000);
            }
        };

        // 导出当前快照为 JSON（保存到本地磁盘）；支持按导出设置挑选数据模块
        const exportCurrentSnapshot = () => {
            const f = (data.exportSettings && data.exportSettings.fileSettings && data.exportSettings.fileSettings.json) || {};
            const out = {};
            if (f.site) out.site = data.site;
            if (f.categories) out.categories = data.categories;
            if (f.searchConfig) out.searchConfig = data.searchConfig;
            if (f.wallpapers) {
                out.customWallpapers = data.customWallpapers;
                out.wallpaperOrder = data.wallpaperOrder;
                out.wallpaperGroups = data.wallpaperGroups;
                out.background = data.background;
                out.bottomBackground = data.bottomBackground;
                out.footerBackground = data.footerBackground;
            }
            if (f.about) out.about = data.about;
            if (f.commit) out.commit = data.commit;
            if (f.friendLinks) out.friendLinks = data.friendLinks;
            if (f.footer) {
                out.footerMenuOrder = data.footerMenuOrder;
                out.footerMenuItems = data.footerMenuItems;
                out.footerFixedMeta = data.footerFixedMeta;
                out.footer = data.footer;
            }
            const json = JSON.stringify(out, null, 2);
            const ts = Utils.formatTime(Date.now()).replace(/[: ]/g, '-');
            Utils.download(`snapshot_${ts}.json`, json, 'application/json');
            showToast('已下载当前快照', 'success');
        };

        // 当前页设为模板：把当前编辑器数据生成首页/关于页/提交页 HTML，
        // 并连同数据快照一起保存到当前站点的【默认模板】文件夹下。
        const setCurrentAsTemplate = async () => {
            try {
                showToast('正在生成当前页面...', 'info', 8000);
                const { indexHtml, commitHtml } = await prepareDeploymentHtml();
                const tpl = (data.about && data.about.template) || '页脚/关于导航';
                const aboutHtml = data.about ? Generator.generateAbout(data) : '';
                const files = [{ path: 'index.html', content: indexHtml }];
                if (aboutHtml) files.push({ path: 'about.html', content: aboutHtml });
                if (commitHtml) files.push({ path: 'commit.html', content: commitHtml });
                const templateName = 'template_' + Utils.formatTime(Date.now()).replace(/[: ]/g, '_');
                const setting = {
                    name: templateName,
                    note: '来自当前页：' + (data.site.title || '未命名'),
                    timestamp: Date.now(),
                    data: stripVersionRuntime(data)
                };
                await Storage.saveDefaultTemplate(null, templateName, files, setting);
                showToast('已将当前页保存为默认模板：' + templateName, 'success', 5000);
                closeExportMenu();
                // 如果在模板设置弹窗内，刷新列表
                if (modal.templateSettings) {
                    await loadDefaultTemplates();
                }
            } catch (e) {
                console.error('保存为模板失败', e);
                showToast('保存为模板失败：' + (e.message || e), 'error');
            }
        };

        const versions = ref([]);
        // 当前编辑器所基于的版本 ID（从版本加载/回滚/保存后设置，切换站点时清空）
        const currentEditingVersionId = ref(null);
        // 默认模板相关状态
        const defaultTemplates = ref([]);
        const currentDefaultTemplate = ref('');
        // 顶部栏显示：当前站点名称 + 最新版本名称（取 timestamp 最大的版本 note）
        const currentVersionNote = computed(() => {
            if (!versions.value || versions.value.length === 0) return '';
            const sorted = [...versions.value].sort((a, b) => b.timestamp - a.timestamp);
            return (sorted[0].note || '').trim();
        });
        const openVersions = async () => {
            try {
                await refreshVersions();
                modal.versions = true;
            } catch (e) {
                showToast(`加载版本失败: ${e.message}`, 'error');
            }
        };

        const rollbackVersion = async (version) => {
            if (!confirm(`确定回滚到 ${Utils.formatTime(version.timestamp)} 的版本吗？当前数据将被覆盖。`)) return;
            Object.assign(data, JSON.parse(JSON.stringify(version.data)));
            currentEditingVersionId.value = version.id;
            data.currentVersionId = version.id || null;
            await persistData({ mark: false });
            showToast('已回滚到历史版本', 'success');
            modal.versions = false;
            if (data.categories.length > 0) {
                selectCategory(data.categories[0].id, data.categories[0].children[0]?.id);
            }
        };

        // 点击版本卡片切换到该版本进行编辑：加载版本数据、不关闭弹窗；有未保存更改时先询问
        const selectCurrentVersion = async (version) => {
            if (!version || !version.id) return;
            if (version.id === currentEditingVersionId.value) return;
            if (dirty.value) {
                if (!confirm('当前版本未保存，是否切换其他版本？')) return;
            }
            try {
                loading.value = true;
                Object.assign(data, JSON.parse(JSON.stringify(version.data)));
                currentEditingVersionId.value = version.id;
                data.currentVersionId = version.id || null;
                await persistData({ silent: true });
                if (data.categories && data.categories.length > 0) {
                    selectCategory(data.categories[0].id, data.categories[0].children[0]?.id);
                }
                showToast('已切换到版本「' + (version.note || version.id) + '」', 'success');
            } catch (e) {
                showToast('切换版本失败: ' + (e.message || e), 'error');
            } finally {
                loading.value = false;
            }
        };

        const deleteVersion = async (version) => {
            const id = (version && typeof version === 'object') ? version.id : version;
            if (!id) return;
            const v = (version && typeof version === 'object') ? version : (versions.value.find(x => x.id === id) || {});
            const note = v.note || id;
            const doDelete = async () => {
                await Storage.deleteVersion(id);
                if (Array.isArray(data.versionOrder)) data.versionOrder = data.versionOrder.filter(x => x !== id);
                await refreshVersions();
                // 删除的是当前选中的版本时，自动重新选中（最新版本），避免指向已删除版本
                if (currentEditingVersionId.value === id || data.currentVersionId === id) {
                    await restoreCurrentVersion();
                }
                showToast('版本已删除', 'success');
            };
            askConfirm({
                title: '删除历史版本',
                message: `确定要删除历史版本「${note}」吗？`,
                note: (v.starred ? '该版本已收藏。' : '') + '删除后该版本下的部署文件将一并移除，无法再对该版本执行「增量发布」或打包下载，且不可恢复。',
                onConfirm: () => {
                    if (v.starred) {
                        // 收藏的历史版本进行二次确认
                        askConfirm({
                            title: '再次确认删除',
                            message: `「${note}」已收藏，确定仍要删除吗？`,
                            note: '收藏的版本删除后同样不可恢复。',
                            confirmText: '仍要删除',
                            onConfirm: doDelete
                        });
                    } else {
                        doDelete();
                    }
                }
            });
        };

        // ===== 分享 / 导入（板块选择 + .naveditor 包）=====
        // 板块清单：分享/导入/恢复共用；私有字段（凭证、基线、验证码等）结构上不在白名单内
        const SHARE_MODULES = [
            { key: 'site', label: '站点设置', desc: '标题/描述/关键词/图标/侧栏/404 等' },
            { key: 'categories', label: '分类与网站', desc: '导航分类与网址卡片' },
            { key: 'friendLinks', label: '友情链接', desc: '首页与页脚友链' },
            { key: 'searchConfig', label: '搜索配置', desc: '搜索引擎与搜索框' },
            { key: 'wallpapers', label: '背景与壁纸', desc: '背景图与自定义壁纸' },
            { key: 'about', label: '关于页', desc: '关于导航页面内容' },
            { key: 'commit', label: '网站提交页', desc: '提交页内容与表单' },
            { key: 'footer', label: '页脚/菜单/备案', desc: '页脚备案、版权、菜单' },
            { key: 'seo', label: 'SEO', desc: '关键词等（不含站点验证码）' },
            { key: 'dailyText', label: '每日一言', desc: '页脚每日一言' }
        ];
        const PROJECT_FIELDS = {
            site: ['site'],
            categories: ['categories'],
            friendLinks: ['friendLinks'],
            searchConfig: ['searchConfig'],
            wallpapers: ['background', 'bottomBackground', 'footerBackground', 'customWallpapers', 'wallpaperOrder', 'wallpaperGroups'],
            about: ['about'],
            commit: ['commit'],
            footer: ['footer', 'menuKeys', 'footerMenuOrder', 'footerMenuItems', 'footerFixedMeta'],
            seo: ['seo'],
            dailyText: ['dailyText']
        };
        const projectData = (src, modules) => {
            const out = {};
            for (const m of modules) {
                for (const f of (PROJECT_FIELDS[m] || [])) {
                    if (src && src[f] !== undefined) out[f] = JSON.parse(JSON.stringify(src[f]));
                }
            }
            // 双保险：私有字段即使误入也剥离（结构上本就不会被复制）
            ['deployBaseline', 'deploySettings', 'currentVersionId', 'versionOrder'].forEach(k => delete out[k]);
            if (out.seo && out.seo.verification) delete out.seo.verification;
            return out;
        };

        const shareDraft = ref({ mode: 'share', name: '', modules: {}, includeDeploy: true, version: null, importedData: null, deployFiles: [] });
        const defaultShareModules = () => Object.fromEntries(SHARE_MODULES.map(m => [m.key, true]));

        const exportVersion = (version) => {
            const json = JSON.stringify(version.data, null, 2);
            Utils.download(`version_${version.id}.json`, json, 'application/json');
        };

        // 历史版本「分享」：弹出板块选择，生成 .naveditor 分享包
        const shareVersion = (version) => {
            shareDraft.value = {
                mode: 'share',
                name: (version && (version.note || version.name)) || '分享',
                modules: defaultShareModules(),
                includeDeploy: true,
                version: version || null,
                importedData: null,
                deployFiles: []
            };
            modal.shareModules = true;
        };

        const confirmShare = async () => {
            const d = shareDraft.value;
            const sel = SHARE_MODULES.filter(m => d.modules[m.key]).map(m => m.key);
            if (sel.length === 0) { showToast('请至少选择一个板块', 'warning'); return; }
            if (typeof window.JSZip !== 'function') { showToast('JSZip 库未加载', 'error'); return; }
            try {
                showToast('正在生成分享包...', 'info', 5000);
                const dataObj = projectData(d.version.data, sel);
                const manifest = { format: 'naveditor-package', version: 1, kind: 'version', modules: sel, name: d.name, note: d.name, createdAt: Date.now() };
                const zip = new window.JSZip();
                zip.file('manifest.json', JSON.stringify(manifest, null, 2));
                zip.file('data.json', JSON.stringify(dataObj, null, 2));
                if (d.includeDeploy) {
                    // 读取当前版本部署文件快照（自定义页面/素材）
                    try {
                        const siteId = Storage.getCurrentProfileId();
                        const vid = d.version && d.version.id;
                        if (siteId && vid) {
                            const res = await fetch('/api/storage/version-deploy-read?site=' + encodeURIComponent(siteId) + '&version=' + encodeURIComponent(vid) + '&group=deploy1');
                            if (res.ok) {
                                const j = await res.json();
                                if (j.ok && Array.isArray(j.files)) {
                                    for (const f of j.files) {
                                        zip.file('deploy/' + f.path, f.content, { binary: !!f.binary });
                                    }
                                }
                            }
                        }
                    } catch (_e) { console.warn('读取部署快照失败，分享包仅含数据', _e); }
                }
                const blob = await zip.generateAsync({ type: 'blob' });
                Utils.download((d.name || '分享') + '.naveditor', blob, 'application/zip');
                modal.shareModules = false;
                showToast('分享包已生成', 'success');
            } catch (e) {
                showToast('生成分享包失败：' + (e.message || e), 'error');
            }
        };

        // 导入（兼容 .naveditor 分享包 / 旧 JSON）：解析后弹出板块选择
        const importVersionFile = () => {
            const inp = document.createElement('input');
            inp.type = 'file';
            inp.accept = '.json,.naveditor,application/json,application/zip';
            inp.onchange = async () => {
                const file = inp.files && inp.files[0];
                if (!file) return;
                try {
                    const isNaveditor = /\.naveditor$/i.test(file.name);
                    let dataObj = null;
                    let deployFiles = [];
                    let note = '导入 ' + Utils.formatTime(Date.now());
                    if (isNaveditor) {
                        if (typeof window.JSZip !== 'function') throw new Error('JSZip 库未加载');
                        const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
                        const manifestFile = zip.file('manifest.json');
                        const dataFile = zip.file('data.json');
                        if (!manifestFile || !dataFile) throw new Error('分享包缺少 manifest.json / data.json');
                        const manifest = JSON.parse(await manifestFile.async('string'));
                        const imported = JSON.parse(await dataFile.async('string'));
                        if (!imported || typeof imported !== 'object' || (!imported.site && !imported.categories)) {
                            throw new Error('分享包数据无法识别');
                        }
                        dataObj = imported;
                        note = (manifest && (manifest.name || manifest.note)) || note;
                        const deployDir = zip.folder('deploy');
                        if (deployDir) {
                            const names = Object.keys(deployDir.files).filter(n => !deployDir.files[n].dir);
                            for (const n of names) {
                                const f = deployDir.files[n];
                                const rel = n.replace(/^deploy\//, '');
                                const content = await f.async('base64');
                                const isBinary = !/\.(html?|css|js|json|svg|txt|xml)$/i.test(rel);
                                deployFiles.push({ path: rel, content, binary: isBinary });
                            }
                        }
                    } else {
                        const text = await file.text();
                        const obj = JSON.parse(text);
                        let dd = obj;
                        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
                            if (obj.data && typeof obj.data === 'object' && (obj.data.site || obj.data.categories)) {
                                dd = obj.data;
                            } else if (obj.site || obj.categories) {
                                dd = obj;
                            }
                        }
                        if (!dd || typeof dd !== 'object' || Array.isArray(dd) || (!dd.site && !dd.categories)) {
                            throw new Error('无法识别的版本数据格式（需要包含 site / categories 字段）');
                        }
                        dataObj = JSON.parse(JSON.stringify(dd));
                        note = (obj && (obj.note || obj.name)) ? String(obj.note || obj.name) : note;
                    }
                    if (!Array.isArray(dataObj.categories)) dataObj.categories = [];
                    if (!dataObj.site || typeof dataObj.site !== 'object') dataObj.site = {};
                    shareDraft.value = {
                        mode: 'import',
                        name: note,
                        modules: defaultShareModules(),
                        includeDeploy: true,
                        version: null,
                        importedData: dataObj,
                        deployFiles
                    };
                    modal.shareModules = true;
                } catch (e) {
                    showToast('导入失败：' + (e.message || e), 'error');
                }
            };
            inp.click();
        };

        // === Excel 批量网址导入（.xlsx / .csv）===
        // 表头识别（中文/英文列名均可，不依赖列顺序），Excel 行顺序即页面卡片横向顺序
        const EXCEL_HEADER_MAP = {
            '分类': 'category', '类别': 'category', '分类名称': 'category', 'category': 'category',
            '子分类': 'subcategory', '子类别': 'subcategory', '子分类名称': 'subcategory', 'subcategory': 'subcategory',
            '名称': 'name', '网站名称': 'name', '站点名称': 'name', '标题': 'name', 'name': 'name',
            '网址': 'url', '链接': 'url', '地址': 'url', '网站地址': 'url', '网站链接': 'url', 'url': 'url',
            '描述': 'description', '简介': 'description', '说明': 'description', 'description': 'description',
            '图标': 'icon', 'logo': 'icon', 'icon': 'icon'
        };
        const importExcelVersion = () => {
            const inp = document.createElement('input');
            inp.type = 'file';
            inp.accept = '.xlsx,.csv';
            inp.onchange = async () => {
                const file = inp.files && inp.files[0];
                if (!file) return;
                try {
                    if (!window.XLSX) throw new Error('Excel 解析库未加载（lib/xlsx.full.min.js）');
                    showToast('正在解析 Excel...', 'info', 8000);
                    // CSV 用字符串解析保证 UTF-8 中文不乱码；xlsx 用字节数组解析
                    const wb = /\.csv$/i.test(file.name)
                        ? window.XLSX.read(await file.text(), { type: 'string' })
                        : window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
                    const ws = wb.Sheets[wb.SheetNames[0]];
                    if (!ws) throw new Error('Excel 中没有工作表');
                    const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
                    // 扫描前 15 行定位表头：需要同时含“名称”和“网址”列（表头前可放说明文字）
                    let headerIdx = -1, colMap = null;
                    for (let i = 0; i < Math.min(rows.length, 15); i++) {
                        const row = rows[i] || [];
                        const map = {};
                        for (let c = 0; c < row.length; c++) {
                            const h = String(row[c] || '').trim().toLowerCase();
                            if (EXCEL_HEADER_MAP[h]) map[EXCEL_HEADER_MAP[h]] = c;
                        }
                        if (map.name !== undefined && map.url !== undefined) {
                            headerIdx = i;
                            colMap = map;
                            break;
                        }
                    }
                    if (headerIdx < 0) throw new Error('未找到表头行（需要包含“名称”和“网址”列）');
                    // 逐行构建分类树：保持 Excel 行顺序 = 页面卡片横向顺序
                    const categories = [];
                    const catIndex = {};
                    const subIndex = {};
                    const seenUrls = new Set();
                    let skipped = 0, added = 0;
                    for (let i = headerIdx + 1; i < rows.length; i++) {
                        const row = rows[i] || [];
                        const get = (key) => {
                            const c = colMap[key];
                            if (c === undefined) return '';
                            const v = row[c];
                            return (v === null || v === undefined) ? '' : String(v).trim();
                        };
                        const name = get('name');
                        let url = get('url');
                        if (!name && !url) continue; // 空行
                        if (!url) { skipped++; continue; }
                        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
                        if (seenUrls.has(url)) { skipped++; continue; }
                        seenUrls.add(url);
                        const catName = get('category') || '未分类';
                        const subName = get('subcategory') || catName; // 无子分类时自动建同名子分类
                        if (!catIndex[catName]) {
                            const cat = {
                                id: Utils.md5Like(catName + Date.now() + Math.random()),
                                name: catName,
                                icon: matchCategoryIcon(catName),
                                iconColor: '#b2b8be',
                                continueView: false,
                                children: []
                            };
                            categories.push(cat);
                            catIndex[catName] = cat;
                        }
                        const cat = catIndex[catName];
                        const subKey = catName + '|' + subName;
                        if (!subIndex[subKey]) {
                            const sub = {
                                id: Utils.md5Like(subName + '_sub' + Date.now() + Math.random()),
                                name: subName,
                                sites: []
                            };
                            cat.children.push(sub);
                            subIndex[subKey] = sub;
                        }
                        const sub = subIndex[subKey];
                        sub.sites.push({
                            name: name || url.replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
                            url,
                            description: get('description'),
                            logo: '',
                            bgType: 'image',
                            bgColor: '',
                            bgText: '',
                            blink: { enabled: false, mode: 'count', count: 3, duration: 300, interval: 150, color: '#ff6b6b', templateName: '', intensity: 'normal' }
                        });
                        added++;
                    }
                    if (added === 0) throw new Error('没有可导入的网址（请检查表头与数据行）');
                    const total = categories.reduce((s, c) => s + c.children.reduce((x, y) => x + y.sites.length, 0), 0);
                    askConfirm({
                        title: 'Excel 导入确认',
                        message: `识别到 ${categories.length} 个分类、${total} 条网址`,
                        note: `将按 Excel 行顺序生成新的历史版本（行序即页面横向顺序）${skipped ? `；跳过 ${skipped} 条（无网址或重复）` : ''}。不会覆盖当前编辑内容。`,
                        confirmText: '导入',
                        danger: false,
                        icon: 'fas fa-file-excel',
                        onConfirm: async () => {
                            try {
                                showToast('正在生成版本...', 'info', 6000);
                                const base = JSON.parse(JSON.stringify(data));
                                const imported = { ...base, categories };
                                const versionName = 'Excel导入 ' + (file.name || '').replace(/\.(xlsx|csv)$/i, '');
                                const saved = await Storage.saveVersion(imported, versionName);
                                const deployFiles = await prepareVersionDeployFiles(imported);
                                await Storage.writeVersionDeploy(Storage.getCurrentProfileId(), saved.id, 'deploy1', deployFiles);
                                if (!Array.isArray(data.versionOrder)) data.versionOrder = [];
                                data.versionOrder = [saved.id].concat(data.versionOrder.filter(id => id !== saved.id));
                                await refreshVersions();
                                showToast(`Excel 导入完成：${total} 条网址`, 'success');
                            } catch (e) {
                                showToast('Excel 导入失败：' + (e.message || e), 'error');
                            }
                        }
                    });
                } catch (e) {
                    showToast('Excel 导入失败：' + (e.message || e), 'error');
                }
            };
            inp.click();
        };

        // === Excel 网址清单导出（.xlsx）：版本内卡片顺序原样写入行顺序 ===
        const exportVersionExcel = (version) => {
            try {
                if (!window.XLSX) throw new Error('Excel 解析库未加载（lib/xlsx.full.min.js）');
                const rows = [['分类', '子分类', '名称', '网址', '描述']];
                const cats = (version && version.data && Array.isArray(version.data.categories)) ? version.data.categories : [];
                for (const cat of cats) {
                    for (const sub of (cat.children || [])) {
                        for (const site of (sub.sites || [])) {
                            rows.push([
                                cat.name || '',
                                sub.name || '',
                                (site && site.name) || '',
                                (site && site.url) || '',
                                (site && site.description) || ''
                            ]);
                        }
                    }
                }
                if (rows.length === 1) throw new Error('该版本没有可导出的网址');
                const ws = window.XLSX.utils.aoa_to_sheet(rows);
                const wb = window.XLSX.utils.book_new();
                window.XLSX.utils.book_append_sheet(wb, ws, '网址清单');
                const out = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                const name = (version && (version.note || version.name || version.id)) || '版本';
                Utils.download(name + '.xlsx', blob, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                showToast('已导出 Excel 网址清单', 'success');
            } catch (e) {
                showToast('Excel 导出失败：' + (e.message || e), 'error');
            }
        };

        // === 书签 Excel 生成器（浏览器导出的 HTML 书签 → 系统可识别的 .xlsx）===
        // 解析 Netscape 书签格式（DL/DT/H3/A 嵌套）
        const parseBookmarkTree = (dl) => {
            const items = [];
            const dts = dl ? Array.from(dl.children).filter(el => el.tagName === 'DT') : [];
            for (const dt of dts) {
                const h3 = Array.from(dt.children).find(el => el.tagName === 'H3');
                const a = Array.from(dt.children).find(el => el.tagName === 'A');
                if (h3) {
                    const folder = { type: 'folder', name: h3.textContent.trim() || '未命名文件夹', children: [] };
                    const nested = Array.from(dt.children).find(el => el.tagName === 'DL');
                    if (nested) folder.children = parseBookmarkTree(nested);
                    items.push(folder);
                } else if (a && a.getAttribute('href')) {
                    const href = (a.getAttribute('href') || '').trim();
                    if (/^(https?|ftp):/i.test(href)) {
                        items.push({ type: 'bookmark', name: a.textContent.trim() || href, url: href });
                    }
                }
            }
            return items;
        };
        const countBookmarks = (nodes) => {
            let folders = 0, bookmarks = 0;
            for (const n of nodes) {
                if (n.type === 'bookmark') bookmarks++;
                else {
                    folders++;
                    const s = countBookmarks(n.children);
                    folders += s.folders;
                    bookmarks += s.bookmarks;
                }
            }
            return { folders, bookmarks };
        };
        // 浏览器导出时常见的顶层容器文件夹（书签栏等），解析后自动展开，不占用层级
        const BOOKMARK_CONTAINER_NAMES = [
            '书签栏', '其他书签', '移动设备书签', '书签菜单', '收藏夹栏', '收藏夹',
            'Bookmarks bar', 'Other bookmarks', 'Mobile bookmarks', 'Bookmarks menu'
        ];
        // 按映射选项生成 Excel 行（保持书签原有顺序）
        const bookmarkToRows = (nodes, depth, mainLevel, urlAs, deeper, catName, rows) => {
            for (const n of nodes) {
                if (n.type === 'bookmark') {
                    if (catName) {
                        if (urlAs === 'subcategory') {
                            rows.push([catName, n.name, n.name, n.url, '']);
                        } else {
                            rows.push([catName, '', n.name, n.url, '']);
                        }
                    }
                    continue;
                }
                if (depth === mainLevel) {
                    // 当前文件夹作为主分类
                    bookmarkToRows(n.children, depth + 1, mainLevel, urlAs, deeper, n.name, rows);
                } else if (depth < mainLevel) {
                    // 层级不够：继续下钻，不建立分类
                    bookmarkToRows(n.children, depth + 1, mainLevel, urlAs, deeper, catName, rows);
                } else if (deeper === 'merge') {
                    // 更深层级文件夹：并入上级主分类
                    bookmarkToRows(n.children, depth + 1, mainLevel, urlAs, deeper, catName, rows);
                }
                // deeper === 'ignore' 时更深层级文件夹直接跳过
            }
        };

        // === 书签映射器：左侧原书签多级树 → 右键拆分 → 右侧两级（主分类/子分类）===
        const bookmarkMapper = reactive({
            open: false,
            flat: [],          // 左侧展平树：{ key, name, type, depth, url, parentKey, expanded, folder }
            map: {},           // key -> 原始节点
            right: [],         // 右侧映射结果：{ name, subs: [{ name, sites: [{ name, url }] }] }
            ctx: { visible: false, x: 0, y: 0, key: null },
            splitDone: {},     // key -> 逐级拆分已拆组数
            moved: new Set(),  // 已移动到右侧的文件夹 key（左侧不再显示）
            seq: 0,
            choice: { visible: false, catName: '', subs: [], sites: [], deepSubs: [], selectedSub: '' },
            splitConfirm: { visible: false, key: '', mainKey: '', subKey: '', mainName: '', subName: '', subsCount: 0, siteCount: 0, sites: [], subs: [], selectedSub: '', deepInfo: [], primaryableSubs: [] }
        });
        const bmChoiceMode = ref('discard');
        const bmDeepMode = ref('discard');
        const flattenBookmarkNodes = (nodes, depth, parentKey) => {
            for (const n of nodes) {
                const key = 'bm_' + (++bookmarkMapper.seq);
                bookmarkMapper.map[key] = n;
                bookmarkMapper.flat.push({
                    key, name: n.name, type: n.type, depth, url: n.url || '',
                    parentKey, expanded: depth < 1, folder: n.type === 'folder'
                });
                if (n.type === 'folder') flattenBookmarkNodes(n.children, depth + 1, key);
            }
        };
        const openBookmarkMapper = (tree) => {
            bookmarkMapper.open = true;
            bookmarkMapper.flat = [];
            bookmarkMapper.map = {};
            bookmarkMapper.right = [];
            bookmarkMapper.ctx.visible = false;
            bookmarkMapper.splitDone = {};
            bookmarkMapper.moved = new Set();
            bookmarkMapper.seq = 0;
            bookmarkMapper.choice.visible = false;
            bmChoiceMode.value = 'discard';
            bmUndoStack.value = [];
            bmRedoStack.value = [];
            flattenBookmarkNodes(tree, 0, null);
        };
        const closeBookmarkMapper = () => { bookmarkMapper.open = false; };
        const toggleBookmarkNode = (item) => { item.expanded = !item.expanded; };
        // 单击：先关闭右键菜单；文件夹单击切换展开/收起（展开的单击即收起）
        const clickBookmarkNode = (item) => {
            closeBookmarkCtx();
            if (item && item.folder) toggleBookmarkNode(item);
        };
        // 按展开状态过滤：只有父级全部展开的节点才显示（单击收起时子节点隐藏）
        const visibleBookmarkFlat = computed(() => {
            const out = [];
            const expandedKeys = new Set();
            for (const item of bookmarkMapper.flat) {
                if (bookmarkMapper.moved.has(item.key)) continue; // 已移动到右侧的不再显示
                if (item.depth === 0 || expandedKeys.has(item.parentKey)) {
                    out.push(item);
                    if (item.folder && item.expanded) expandedKeys.add(item.key);
                }
            }
            return out;
        });
        // 左侧统计：书签文件夹数 / 网站（网址）数
        const bookmarkLeftStats = computed(() => {
            let folders = 0, sites = 0;
            for (const item of bookmarkMapper.flat) {
                if (item.folder) folders++; else sites++;
            }
            return { folders, sites };
        });
        // 右侧统计：主分类数 / 子分类数 / 网站数
        const bookmarkRightStats = computed(() => {
            let cats = bookmarkMapper.right.length, subs = 0, sites = 0;
            for (const cat of bookmarkMapper.right) {
                subs += cat.subs.length;
                for (const sub of cat.subs) sites += sub.sites.length;
            }
            return { cats, subs, sites };
        });
        // 反查原始节点对应的 key（逐级拆分等场景）
        const findKeyByNode = (node) => {
            for (const k in bookmarkMapper.map) {
                if (bookmarkMapper.map[k] === node) return k;
            }
            return null;
        };
        const markMoved = (key) => { if (key) bookmarkMapper.moved.add(key); };
        const openBookmarkCtx = (e, item) => {
            e.preventDefault();
            e.stopPropagation();
            if (!item.folder) return;
            bookmarkMapper.ctx = { visible: true, x: e.clientX, y: e.clientY, key: item.key };
        };
        const closeBookmarkCtx = () => { bookmarkMapper.ctx.visible = false; };
        // 子树最大文件夹层级数（自身算第 1 级）
        const maxFolderDepth = (node) => {
            if (!node || node.type !== 'folder') return 0;
            let d = 1;
            for (const c of (node.children || [])) {
                if (c.type === 'folder') d = Math.max(d, 1 + maxFolderDepth(c));
            }
            return d;
        };
        // 右键菜单是否显示「逐级拆分」：该文件夹下还有至少 2 层（即 3 级及以上，可拆出最深的两级）
        const bookmarkCtxShowSplit = computed(() => {
            const key = bookmarkMapper.ctx.key;
            if (!key) return false;
            const node = bookmarkMapper.map[key];
            return !!(node && node.type === 'folder' && maxFolderDepth(node) >= 3);
        });
        // 右键菜单是否显示「一级分类」：必须有子文件夹（只有网站的文件夹只能做二级分类）
        const bookmarkCtxShowPrimary = computed(() => {
            const key = bookmarkMapper.ctx.key;
            if (!key) return false;
            const node = bookmarkMapper.map[key];
            return !!(node && node.type === 'folder' && (node.children || []).some(c => c.type === 'folder'));
        });
        // 右键菜单是否显示「二级分类」：有子文件夹（可一级/可多级）都不允许做二级分类，只有网站的文件夹才允许
        const bookmarkCtxShowSecondary = computed(() => {
            const key = bookmarkMapper.ctx.key;
            if (!key) return false;
            const node = bookmarkMapper.map[key];
            return !!(node && node.type === 'folder' && !(node.children || []).some(c => c.type === 'folder'));
        });
        // 文件夹是否可逐级拆分（子树 3 级及以上，含子文件夹），用于左侧行内图标显示
        const isBookmarkSplitable = (item) => {
            if (!item || !item.folder) return false;
            const node = bookmarkMapper.map[item.key];
            return !!(node && maxFolderDepth(node) >= 3);
        };
        // 是否适合一级分类：该文件夹下有多个子文件夹（无直接网站），且子文件夹内没有更深文件夹
        const isBookmarkPrimaryReady = (item) => {
            if (!item || !item.folder) return false;
            const node = bookmarkMapper.map[item.key];
            if (!node || !Array.isArray(node.children)) return false;
            const kids = node.children;
            if (kids.length < 2) return false;                 // 需要“数个”子文件夹
            if (kids.some(c => c.type !== 'folder')) return false; // A 中有网站 -> 不适合
            for (const b of kids) {
                if ((b.children || []).some(c => c.type === 'folder')) return false; // B 中有更深文件夹
            }
            return true;
        };
        // 是否可二级分类（只有网站，无子文件夹）：左侧显示「二级」标注
        const isBookmarkSecondaryReady = (item) => {
            if (!item || !item.folder) return false;
            const node = bookmarkMapper.map[item.key];
            return !!(node && !(node.children || []).some(c => c.type === 'folder'));
        };
        // 收集子分类（二级文件夹）及其直接网站
        const collectSubs = (node) => {
            const subs = [];
            for (const c of (node.children || [])) {
                if (c.type === 'folder') {
                    const sites = [];
                    for (const s of (c.children || [])) {
                        if (s.type === 'bookmark') sites.push({ name: s.name, url: s.url });
                    }
                    subs.push({ name: c.name, sites, expanded: true });
                }
            }
            return subs;
        };
        // 把节点作为主分类加入右侧；siteTarget 为并入的子分类名（null=舍弃直接网站）
        const addPrimaryFromNode = (node, siteTarget, sourceKey) => {
            const cat = { name: node.name, subs: collectSubs(node), sourceKey: sourceKey || null, expanded: true };
            const directSites = (node.children || []).filter(c => c.type === 'bookmark');
            if (directSites.length > 0 && siteTarget) {
                let t = cat.subs.find(s => s.name === siteTarget);
                if (!t) {
                    // 目标子分类不存在（如无二级书签可并入）时自动建同名子分类
                    t = { name: siteTarget, sites: [] };
                    cat.subs.push(t);
                }
                directSites.forEach(s => t.sites.push({ name: s.name, url: s.url }));
            }
            bookmarkMapper.right.push(cat);
        };
        // 右键菜单：一级分类（该文件夹作为主分类；有直接网站时弹并入选择）
        const bookmarkToPrimary = () => {
            const key = bookmarkMapper.ctx.key;
            const node = bookmarkMapper.map[key];
            bookmarkMapper.ctx.visible = false;
            if (!node || node.type !== 'folder') return;
            // 只有网站的文件夹只能作为二级分类（子分类），不能成为一级分类
            if (!(node.children || []).some(c => c.type === 'folder')) {
                showToast('该文件夹只有网站，只能作为二级分类（子分类），请使用右键菜单「二级分类」', 'warning');
                return;
            }
            const directSites = (node.children || []).filter(c => c.type === 'bookmark');
            // 子文件夹内还有更深文件夹（会被静默丢弃），需要一并提示
            const deepSubs = (node.children || []).filter(c => c.type === 'folder' && (c.children || []).some(x => x.type === 'folder'));
            if (directSites.length > 0 || deepSubs.length > 0) {
                bmChoiceMode.value = 'discard';
                bookmarkMapper.choice = {
                    visible: true,
                    catName: node.name,
                    subs: collectSubs(node).map(s => s.name),
                    sites: directSites.map(s => s.name),
                    deepSubs: deepSubs.map(s => s.name),
                    selectedSub: ''
                };
            } else {
                bmPushUndo(); // 修改前快照（moved / right 均未变）
                markMoved(key);
                addPrimaryFromNode(node, null, key);
            }
        };
        // 并入选择弹窗：舍弃 / 并入到指定子分类
        const bookmarkChoiceDiscard = () => {
            const key = bookmarkMapper.ctx.key;
            bmPushUndo();
            markMoved(key);
            addPrimaryFromNode(bookmarkMapper.map[key], null, key);
            bookmarkMapper.choice.visible = false;
        };
        const bookmarkChoiceMerge = () => {
            let target = bookmarkMapper.choice.selectedSub;
            if (!target) {
                if (bookmarkMapper.choice.subs.length === 0) {
                    // 没有二级书签可并入：自动建与主分类同名的子分类
                    target = bookmarkMapper.choice.catName;
                } else {
                    showToast('请选择要并入的二级书签', 'warning');
                    return;
                }
            }
            if (!target) {
                showToast('请选择要并入的二级书签', 'warning');
                return;
            }
            const key = bookmarkMapper.ctx.key;
            bmPushUndo();
            markMoved(key);
            addPrimaryFromNode(bookmarkMapper.map[key], target, key);
            bookmarkMapper.choice.visible = false;
        };
        // 右键菜单：二级分类（该文件夹作为子分类；无主分类时自动建“未分类”）
        const bookmarkToSecondary = () => {
            const key = bookmarkMapper.ctx.key;
            const node = bookmarkMapper.map[key];
            bookmarkMapper.ctx.visible = false;
            if (!node || node.type !== 'folder') return;
            // 有子文件夹（可一级/可多级分类）都不允许作为二级分类，只有网站的文件夹才允许
            if ((node.children || []).some(c => c.type === 'folder')) {
                showToast('该文件夹包含子文件夹，不能作为二级分类，请使用「一级分类」或「逐级拆分」', 'warning');
                return;
            }
            if (bookmarkMapper.moved.has(key)) {
                showToast('该书签已拆分完毕', 'info');
                return;
            }
            bmPushUndo();
            markMoved(key);
            const parentKey = bookmarkMapper.flat.find(f => f.key === key)?.parentKey || null;
            let cat = null;
            if (parentKey) {
                const pNode = bookmarkMapper.map[parentKey];
                if (pNode) cat = bookmarkMapper.right.find(c => c.name === pNode.name);
            }
            if (!cat) cat = bookmarkMapper.right.find(c => c.name === '未分类');
            if (!cat) {
                cat = { name: '未分类', subs: [], expanded: true };
                bookmarkMapper.right.push(cat);
            }
            // 子分类记录来源 key，右侧删除时才能恢复左侧显示
            cat.subs.push({ name: node.name, expanded: true, sourceKey: key, sites: (node.children || []).filter(c => c.type === 'bookmark').map(s => ({ name: s.name, url: s.url })) });
        };
        // 逐级拆分：先计算将拆分的两层并弹出确认窗，确认后才执行
        const bookmarkSplitLevels = (key) => {
            // 右键菜单 @click 会把事件对象误传进来，只有字符串 key 才直接使用
            if (typeof key !== 'string') key = bookmarkMapper.ctx.key;
            const node = bookmarkMapper.map[key];
            bookmarkMapper.ctx.visible = false;
            if (!node || node.type !== 'folder') return;
            if (bookmarkMapper.moved.has(key)) {
                showToast('该书签已拆分完毕', 'info');
                return;
            }
            // 已移动到右侧的文件夹不参与后续拆分，避免重复拆同一组
            const isMovedNode = (n) => {
                for (const k in bookmarkMapper.map) {
                    if (bookmarkMapper.map[k] === n && bookmarkMapper.moved.has(k)) return true;
                }
                return false;
            };
            const path = [node];
            let cur = node;
            while (cur.type === 'folder') {
                const next = (cur.children || []).find(c => c.type === 'folder' && !isMovedNode(c));
                if (!next) break;
                path.push(next);
                cur = next;
            }
            // 每次直接拆「当前最深的两层」：已移动的层级会让 path 自动缩短，
            // 无需计数（4 级：先拆 3、4 级，再拆 1、2 级）
            const D = path.length;
            if (D < 2) {
                showToast('该书签已拆分完毕', 'info');
                return;
            }
            const mainNode = path[D - 2];
            const subNode = path[D - 1];
            // 主分类下所有未拆走的直接子文件夹都作为子分类（不能只取路径上的第一个）
            const subNodes = (mainNode.children || []).filter(c => c.type === 'folder' && !isMovedNode(c));
            let siteCount = 0;
            for (const s of subNodes) {
                siteCount += (s.children || []).filter(c => c.type === 'bookmark').length;
            }
            const directSites = (mainNode.children || []).filter(c => c.type === 'bookmark').map(s => ({ name: s.name, url: s.url }));
            // 子分类内部嵌套的更深文件夹（一级菜单）：逐级拆分到这一层时会被丢弃，需询问
            const deepInfo = [];
            for (const s of subNodes) {
                const deepFolders = (s.children || []).filter(c => c.type === 'folder');
                if (deepFolders.length) {
                    deepInfo.push({
                        subName: s.name,
                        subKey: findKeyByNode(s),
                        folderKeys: deepFolders.map(f => findKeyByNode(f))
                    });
                }
            }
            // 可独立成一级分类的子分类：有子文件夹，且子文件夹内没有更深嵌套（整体提升为主分类，不丢内容）
            const primaryableSubs = subNodes.filter(s => {
                const subs = (s.children || []).filter(x => x.type === 'folder');
                return subs.length > 0 && subs.every(x => !(x.children || []).some(y => y.type === 'folder'));
            }).map(s => ({ subName: s.name, subKey: findKeyByNode(s) }));
            bmChoiceMode.value = 'discard';
            bmDeepMode.value = 'discard';
            // 弹出确认窗：预览将拆分的两层，确认后才执行
            bookmarkMapper.splitConfirm = {
                visible: true,
                key,
                mainKey: findKeyByNode(mainNode),
                subKey: findKeyByNode(subNode),
                mainName: mainNode.name,
                subName: subNode.name,
                subsCount: subNodes.length,
                siteCount,
                sites: directSites,
                subs: subNodes.map(s => s.name),
                selectedSub: '',
                deepInfo,
                primaryableSubs
            };
        };
        // 确认逐级拆分：把主分类/子分类加入右侧并隐藏左侧
        const bookmarkSplitApply = () => {
            const sc = bookmarkMapper.splitConfirm;
            if (!sc || !sc.visible) return;
            // 主分类下有直接网站且选择并入时，必须指定目标子分类
            if (bmChoiceMode.value === 'merge' && sc.sites.length > 0 && !sc.selectedSub) {
                showToast('请选择要并入的子分类', 'warning');
                return;
            }
            sc.visible = false;
            const mainNode = bookmarkMapper.map[sc.mainKey];
            if (!mainNode) return;
            bmPushUndo();
            markMoved(sc.mainKey);
            const cat = { name: mainNode.name, subs: [], sourceKey: sc.mainKey, expanded: true };
            // 主分类的所有直接子文件夹（未拆走的）都作为子分类，各自收集直接网站
            for (const child of (mainNode.children || [])) {
                if (child.type !== 'folder') continue;
                const childKey = findKeyByNode(child);
                if (childKey && bookmarkMapper.moved.has(childKey)) continue;
                const sites = (child.children || []).filter(c => c.type === 'bookmark').map(s => ({ name: s.name, url: s.url }));
                cat.subs.push({ name: child.name, expanded: true, sites });
            }
            // 主分类下的直接网站：舍弃或并入指定子分类
            if (sc.sites.length > 0 && bmChoiceMode.value === 'merge') {
                let sub = cat.subs.find(s => s.name === sc.selectedSub);
                if (!sub) {
                    sub = { name: sc.selectedSub, expanded: true, sites: [] };
                    cat.subs.push(sub);
                }
                sc.sites.forEach(s => sub.sites.push({ name: s.name, url: s.url }));
            }
            // 子分类内的更深层级（一级菜单）：丢弃或并入对应子分类
            if (sc.deepInfo.length > 0) {
                if (bmDeepMode.value === 'merge') {
                    const collectDeepSites = (nodes, out) => {
                        for (const n of nodes) {
                            if (n.type === 'bookmark') out.push({ name: n.name, url: n.url });
                            else if (n.type === 'folder') collectDeepSites(n.children || [], out);
                        }
                    };
                    for (const d of sc.deepInfo) {
                        const sub = cat.subs.find(s => s.name === d.subName);
                        if (!sub) continue;
                        for (const fk of d.folderKeys) {
                            const fNode = bookmarkMapper.map[fk];
                            if (fNode) collectDeepSites(fNode.children || [], sub.sites);
                        }
                    }
                } else if (bmDeepMode.value === 'primary') {
                    // 独立成为一个一级分类：把可一级分类的子分类整体提升为主分类（保留其子文件夹，不留空壳）
                    for (const pb of (sc.primaryableSubs || [])) {
                        const bNode = bookmarkMapper.map[pb.subKey];
                        if (!bNode || bNode.type !== 'folder') continue;
                        // 从当前主分类的子分类中移除，避免出现空壳
                        const idx = cat.subs.findIndex(s => s.name === pb.subName);
                        if (idx >= 0) cat.subs.splice(idx, 1);
                        const bCat = { name: bNode.name, subs: [], sourceKey: pb.subKey, expanded: true };
                        for (const fc of (bNode.children || [])) {
                            if (fc.type !== 'folder') continue;
                            const sites = (fc.children || []).filter(x => x.type === 'bookmark').map(s => ({ name: s.name, url: s.url }));
                            bCat.subs.push({ name: fc.name, expanded: true, sites });
                        }
                        // 直接网站并入同名子分类，避免丢失
                        const bDirect = (bNode.children || []).filter(x => x.type === 'bookmark');
                        if (bDirect.length) {
                            let sub = bCat.subs.find(s => s.name === bNode.name);
                            if (!sub) {
                                sub = { name: bNode.name, expanded: true, sites: [] };
                                bCat.subs.push(sub);
                            }
                            bDirect.forEach(s => sub.sites.push({ name: s.name, url: s.url }));
                        }
                        bookmarkMapper.right.push(bCat);
                    }
                }
            }
            bookmarkMapper.right.push(cat);
        };
        // 从「已移动」集合恢复左侧显示，并展开祖先链让其在原位置立即可见
        const restoreBookmarkLeft = (key) => {
            if (!key) return;
            bookmarkMapper.moved.delete(key);
            const byKey = {};
            bookmarkMapper.flat.forEach(f => { byKey[f.key] = f; });
            let cur = byKey[key];
            if (cur) {
                const chain = [];
                let p = cur.parentKey;
                while (p && byKey[p]) {
                    chain.push(byKey[p]);
                    p = byKey[p].parentKey;
                }
                chain.forEach(f => { if (f.folder) f.expanded = true; });
            }
        };
        // 右侧移除一个主分类（连带其子分类恢复左侧显示）
        const removeBookmarkRight = (ci) => {
            bmPushUndo();
            const cat = bookmarkMapper.right[ci];
            if (cat) {
                if (cat.sourceKey) restoreBookmarkLeft(cat.sourceKey);
                (cat.subs || []).forEach(s => { if (s.sourceKey) restoreBookmarkLeft(s.sourceKey); });
            }
            bookmarkMapper.right.splice(ci, 1);
        };
        // 右侧移除一个子分类（恢复左侧显示）
        const removeBookmarkSub = (cat, si) => {
            bmPushUndo();
            const sub = cat.subs[si];
            if (sub && sub.sourceKey) restoreBookmarkLeft(sub.sourceKey);
            cat.subs.splice(si, 1);
        };
        // 右侧主分类点击展开/收起子分类
        const toggleRightCat = (cat) => { cat.expanded = !cat.expanded; };
        // 右侧子分类点击展开/收起网站列表
        const toggleRightSub = (sub) => { sub.expanded = !sub.expanded; };
        // 右侧网站行删除
        const removeBookmarkSite = (sub, xi) => {
            bmPushUndo();
            sub.sites.splice(xi, 1);
        };
        // === 撤销 / 重做（Ctrl+Z / Ctrl+Y）===
        const bmUndoStack = ref([]);
        const bmRedoStack = ref([]);
        const bmSnapshot = () => ({
            right: JSON.parse(JSON.stringify(bookmarkMapper.right)),
            moved: Array.from(bookmarkMapper.moved),
            splitDone: { ...bookmarkMapper.splitDone }
        });
        const bmRestore = (s) => {
            bookmarkMapper.right = s.right;
            bookmarkMapper.moved = new Set(s.moved);
            bookmarkMapper.splitDone = s.splitDone || {};
        };
        const bmPushUndo = () => {
            bmUndoStack.value.push(bmSnapshot());
            if (bmUndoStack.value.length > 100) bmUndoStack.value.shift();
            bmRedoStack.value = [];
        };
        const bmUndo = () => {
            if (!bookmarkMapper.open) return;
            if (!bmUndoStack.value.length) { showToast('没有可撤销的操作', 'info'); return; }
            bmRedoStack.value.push(bmSnapshot());
            bmRestore(bmUndoStack.value.pop());
        };
        const bmRedo = () => {
            if (!bookmarkMapper.open) return;
            if (!bmRedoStack.value.length) { showToast('没有可重做的操作', 'info'); return; }
            bmUndoStack.value.push(bmSnapshot());
            bmRestore(bmRedoStack.value.pop());
        };
        const bmKeydown = (e) => {
            if (!bookmarkMapper.open) return;
            // 输入框内不拦截（保留原生撤销）
            const t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
            const ctrl = e.ctrlKey || e.metaKey;
            if (ctrl && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
                e.preventDefault();
                bmUndo();
            } else if (ctrl && (e.key === 'y' || e.key === 'Y')) {
                e.preventDefault();
                bmRedo();
            } else if (ctrl && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
                e.preventDefault();
                bmRedo();
            }
        };
        // 生成 Excel：右侧两级结构 → 分类/子分类/名称/网址
        const generateBookmarkMapperExcel = () => {
            try {
                if (!window.XLSX) throw new Error('Excel 解析库未加载（lib/xlsx.full.min.js）');
                const rows = [['分类', '子分类', '名称', '网址', '描述']];
                for (const cat of bookmarkMapper.right) {
                    for (const sub of cat.subs) {
                        for (const site of sub.sites) {
                            rows.push([cat.name, sub.name, site.name, site.url, '']);
                        }
                        if (!sub.sites.length) rows.push([cat.name, sub.name, '', '', '']);
                    }
                    if (!cat.subs.length) rows.push([cat.name, '', '', '', '']);
                }
                if (rows.length === 1) throw new Error('右侧还没有可导出的内容，请先在左侧右键拆分书签');
                const ws = window.XLSX.utils.aoa_to_sheet(rows);
                const wb = window.XLSX.utils.book_new();
                window.XLSX.utils.book_append_sheet(wb, ws, '网址清单');
                const out = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                Utils.download('书签映射_' + Date.now() + '.xlsx', blob, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                showToast('书签 Excel 已生成，可用「.excel导入」导入为版本', 'success');
            } catch (e) {
                showToast('生成失败：' + (e.message || e), 'error');
            }
        };
        const importBookmarksGenerator = () => {
            const inp = document.createElement('input');
            inp.type = 'file';
            inp.accept = '.html,.htm';
            inp.onchange = async () => {
                const file = inp.files && inp.files[0];
                if (!file) return;
                try {
                    showToast('正在解析书签...', 'info', 6000);
                    const text = await file.text();
                    const doc = new DOMParser().parseFromString(text, 'text/html');
                    const rootDl = doc.querySelector('dl');
                    if (!rootDl) throw new Error('无法识别书签文件（需要浏览器导出的 HTML 书签）');
                    let tree = parseBookmarkTree(rootDl);
                    // 顶层只有一个常见容器文件夹（如“书签栏”）时，展开它作为顶层
                    if (tree.length === 1 && tree[0].type === 'folder' && BOOKMARK_CONTAINER_NAMES.indexOf(tree[0].name) >= 0) {
                        tree = tree[0].children;
                    }
                    const stats = countBookmarks(tree);
                    if (stats.bookmarks === 0) throw new Error('书签文件中没有找到网址');
                    openBookmarkMapper(tree);
                } catch (e) {
                    showToast('书签解析失败：' + (e.message || e), 'error');
                }
            };
            inp.click();
        };

        const confirmImport = async () => {
            const d = shareDraft.value;
            const sel = SHARE_MODULES.filter(m => d.modules[m.key]).map(m => m.key);
            if (sel.length === 0) { showToast('请至少选择一个板块', 'warning'); return; }
            try {
                showToast('正在导入版本...', 'info', 5000);
                // 以当前编辑数据为底，仅覆盖选中的板块
                const base = JSON.parse(JSON.stringify(data));
                for (const m of sel) {
                    for (const f of (PROJECT_FIELDS[m] || [])) {
                        if (d.importedData[f] !== undefined) base[f] = JSON.parse(JSON.stringify(d.importedData[f]));
                    }
                }
                if (!Array.isArray(base.categories)) base.categories = [];
                if (!base.site || typeof base.site !== 'object') base.site = {};
                const saved = await Storage.saveVersion(base, d.name);
                if (d.deployFiles && d.deployFiles.length) {
                    try {
                        await Storage.writeVersionDeploy(Storage.getCurrentProfileId(), saved.id, 'deploy1', d.deployFiles);
                    } catch (deployErr) { console.warn('写入导入部署文件失败', deployErr); }
                } else {
                    try {
                        const deployFiles = await prepareVersionDeployFiles(base);
                        await Storage.writeVersionDeploy(Storage.getCurrentProfileId(), saved.id, 'deploy1', deployFiles);
                    } catch (deployErr) { console.warn('导入版本生成部署文件失败:', deployErr); }
                }
                if (!Array.isArray(data.versionOrder)) data.versionOrder = [];
                data.versionOrder = [saved.id].concat(data.versionOrder.filter(id => id !== saved.id));
                await refreshVersions();
                modal.shareModules = false;
                showToast('已导入版本：' + d.name, 'success');
            } catch (e) {
                showToast('导入失败：' + (e.message || e), 'error');
            }
        };

        // 按用户自定义顺序（data.versionOrder）排列版本；无自定义顺序时保持后端默认（时间倒序）
        const orderVersions = (list) => {
            if (!Array.isArray(list)) return [];
            const order = (Array.isArray(data.versionOrder) && data.versionOrder.length) ? data.versionOrder : null;
            if (!order) return list;
            const byId = {};
            list.forEach(v => { byId[v.id] = v; });
            const out = [];
            order.forEach(id => { if (byId[id]) { out.push(byId[id]); delete byId[id]; } });
            Object.keys(byId).forEach(id => out.push(byId[id]));
            return out;
        };
        const refreshVersions = async () => {
            const list = await Storage.getVersions();
            versions.value = orderVersions(list);
            // 更新版本数据哈希缓存（供同步状态判断，避免渲染时反复序列化）
            list.forEach(v => {
                try { versionDataHashCache[v.id] = hashData(v.data); } catch (_) { versionDataHashCache[v.id] = ''; }
            });
        };

        // 恢复“当前编辑版本”选中：优先持久化的 currentVersionId（须存在于版本列表，
        // 防止指向已删除/损坏的版本）；否则自动选最新版本；没有版本时置空。
        const restoreCurrentVersion = async () => {
            let vid = data.currentVersionId || currentEditingVersionId.value;
            if (vid && versions.value.some(v => v.id === vid)) {
                currentEditingVersionId.value = vid;
                return;
            }
            if (versions.value && versions.value.length) {
                const sorted = [...versions.value].sort((a, b) => b.timestamp - a.timestamp);
                currentEditingVersionId.value = sorted[0].id;
                data.currentVersionId = sorted[0].id;
                try { await persistData({ silent: true, mark: false }); } catch (_) {}
            } else {
                currentEditingVersionId.value = null;
                data.currentVersionId = null;
            }
        };

        const openVersionLocation = async (version) => {
            try {
                await Storage.openVersionFolder(null, version.id);
                showToast('已打开版本所在文件夹', 'success');
            } catch (e) {
                showToast('打开文件夹失败：' + (e.message || e), 'error');
            }
        };

        // === 默认模板管理 ===
        const loadDefaultTemplates = async () => {
            try {
                const res = await Storage.getDefaultTemplates();
                defaultTemplates.value = res.templates || [];
                currentDefaultTemplate.value = res.current || '';
            } catch (e) {
                showToast('加载默认模板失败：' + (e.message || e), 'error');
            }
        };

        const openTemplateSettings = async () => {
            await loadDefaultTemplates();
            modal.templateSettings = true;
        };

        const selectDefaultTemplate = async (templateName) => {
            try {
                await Storage.setDefaultTemplate(null, templateName);
                currentDefaultTemplate.value = templateName;
                showToast('已设置默认模板：' + templateName, 'success');
            } catch (e) {
                showToast('设置默认模板失败：' + (e.message || e), 'error');
            }
        };

        const deleteDefaultTemplate = async (templateName) => {
            if (!confirm('确定删除模板「' + templateName + '」？')) return;
            try {
                await Storage.deleteDefaultTemplate(null, templateName);
                if (currentDefaultTemplate.value === templateName) {
                    currentDefaultTemplate.value = '';
                }
                await loadDefaultTemplates();
                showToast('已删除模板', 'success');
            } catch (e) {
                showToast('删除模板失败：' + (e.message || e), 'error');
            }
        };

        // 递归读取 FileSystemDirectoryHandle，供「选择其他」使用
        const readDirectoryHandle = async (dirHandle, path = '') => {
            const files = [];
            for await (const [name, handle] of dirHandle.entries()) {
                const entryPath = path ? path + '/' + name : name;
                if (handle.kind === 'directory') {
                    const subFiles = await readDirectoryHandle(handle, entryPath);
                    files.push(...subFiles);
                } else if (handle.kind === 'file') {
                    const file = await handle.getFile();
                    const ext = (name.split('.').pop() || '').toLowerCase();
                    const textExts = { html: 1, htm: 1, css: 1, js: 1, json: 1, svg: 1, txt: 1, md: 1 };
                    const isBinary = !textExts[ext];
                    if (isBinary) {
                        const buffer = await file.arrayBuffer();
                        const bytes = new Uint8Array(buffer);
                        let binary = '';
                        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
                        files.push({ path: entryPath, content: btoa(binary), binary: true });
                    } else {
                        const text = await file.text();
                        files.push({ path: entryPath, content: text });
                    }
                }
            }
            return files;
        };

        const chooseOtherTemplate = async () => {
            try {
                if (!window.showDirectoryPicker) {
                    showToast('当前浏览器不支持文件夹选择，请使用最新版 Chrome/Edge', 'warning');
                    return;
                }
                showToast('请选择要导入为模板的文件夹', 'info', 8000);
                const dirHandle = await window.showDirectoryPicker();
                const folderName = dirHandle.name;
                const files = await readDirectoryHandle(dirHandle);
                if (files.length === 0) {
                    showToast('所选文件夹为空', 'warning');
                    return;
                }
                // 如果选中的文件夹内已有 setting 文件，则用它作为模板名/备注
                const settingFile = files.find(f => f.path === 'setting');
                let templateName = folderName.replace(/[\\/:*?"<>|]/g, '_').replace(/\./g, '_');
                let setting = null;
                if (settingFile) {
                    try {
                        setting = JSON.parse(settingFile.content);
                        if (setting.name) templateName = setting.name;
                    } catch (_) {}
                }
                await Storage.copyToDefaultTemplates(null, templateName, files);
                await loadDefaultTemplates();
                showToast('已导入模板：' + templateName, 'success');
            } catch (e) {
                if (e.name === 'AbortError') {
                    // 用户取消选择器，静默处理
                } else {
                    showToast('导入模板失败：' + (e.message || e), 'error');
                }
            }
        };

        const createVersionFromTemplate = async () => {
            try {
                if (!currentDefaultTemplate.value) {
                    // 没有默认模板时，直接保存当前编辑内容为新版本
                    await saveVersion();
                    return;
                }
                const setting = await Storage.readDefaultTemplateSetting(null, currentDefaultTemplate.value);
                if (!setting || !setting.data) {
                    showToast('默认模板没有可用数据，改用当前内容保存', 'warning');
                    await saveVersion();
                    return;
                }
                const note = '来自模板：' + (setting.note || currentDefaultTemplate.value);
                const templateData = JSON.parse(JSON.stringify(setting.data));
                const saved = await Storage.saveVersion(templateData, note);
                try {
                    const deployFiles = await prepareVersionDeployFiles(templateData);
                    await Storage.writeVersionDeploy(Storage.getCurrentProfileId(), saved.id, 'deploy1', deployFiles);
                } catch (deployErr) {
                    console.warn('生成部署文件失败:', deployErr);
                }
                if (!Array.isArray(data.versionOrder)) data.versionOrder = [];
                data.versionOrder = [saved.id].concat(data.versionOrder.filter(id => id !== saved.id));
                await refreshVersions();
                markClean();
                showToast('已使用默认模板新建版本：' + note, 'success');
            } catch (e) {
                showToast('新建版本失败：' + (e.message || e), 'error');
            }
        };

        // === 版本访客视角：直接用历史版本的数据生成 HTML 并打开 ===
        const previewVersion = (version) => {
            try {
                const html = Generator.generate(version.data);
                const baseHref = window.location.origin + '/';
                const vsh = (version.data.site && version.data.site.scrollHighlight) || {};
                let htmlWithBase = html.replace(/<head>/i, buildVisitorHead(baseHref, vsh));
                // #hash 链接 → 调用 _sv()（与 openVisitorView 一致）
                htmlWithBase = htmlWithBase.replace(/href="(#[\w-]+)"/g, 'href="javascript:void(0)" onclick="_sv(\'$1\'.slice(1))"');
                htmlWithBase = htmlWithBase.replace(/\bchange-href\b/g, '');
                // 同 openVisitorView：Logo 空链接改为点击回到页面顶部
                htmlWithBase = htmlWithBase.replace(/href=""/g, 'href="javascript:void(0)" onclick="window.scrollTo(0,0);return false"');
                // 首页/关于等按钮在 Blob URL 预览时 href="./" 同样无效，一并替换为回到顶部
                htmlWithBase = htmlWithBase.replace(/href="\.\/"/g, 'href="javascript:void(0)" onclick="window.scrollTo(0,0);return false"');
                const blob = new Blob([htmlWithBase], { type: 'text/html;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const win = window.open(url, '_blank');
                if (!win) showToast('浏览器拦截了新窗口，请允许弹窗后重试', 'warning');
                setTimeout(() => URL.revokeObjectURL(url), 60000);
                showToast('已打开版本预览（仅当前会话，不会覆盖现有数据）', 'success', 2500);
            } catch (e) {
                showToast('预览失败：' + e.message, 'danger');
            }
        };

        // === 多 Profile（多站点）管理 ===
        const profiles = ref([]);
        const currentProfileId = ref(Storage.getCurrentProfileId());
        const currentSiteMeta = ref(null);
        const currentProfileName = computed(() => {
            if (currentSiteMeta.value && currentSiteMeta.value.name) return currentSiteMeta.value.name;
            const p = profiles.value.find(p => p.id === currentProfileId.value);
            return p ? p.name : '默认站点';
        });

        const loadProfiles = async () => {
            profiles.value = await Storage.getProfiles();
        };

        const openProfilesManager = async () => {
            await loadProfiles();
            modal.profiles = true;
        };

        const createProfile = async (name) => {
            try {
                const siteId = await Storage.createProfile(name || '新站点', JSON.parse(JSON.stringify(data)));
                await loadProfiles();
                const p = profiles.value.find(x => x.id === siteId);
                showToast('已新建站点：' + (p ? p.name : siteId), 'success');
                return p || { id: siteId, name: name || '新站点' };
            } catch (e) {
                showToast('新建站点失败: ' + e.message, 'error');
                return null;
            }
        };

        const createProfileFromInput = async () => {
            const el = document.getElementById('newProfileName');
            if (!el) return;
            const v = el.value.trim();
            if (!v) { showToast('请输入站点名称', 'warning'); return; }
            await createProfile(v);
            el.value = '';
        };

        const switchProfile = async (id) => {
            const p = await Storage.getProfile(id);
            if (!p) { showToast('站点不存在', 'danger'); return; }
            // 保存当前 data 到当前 profile
            await saveCurrentToProfile();
            // 切换
            currentProfileId.value = id;
            Storage.setCurrentProfileId(id);
            currentSiteMeta.value = { id: p.id, name: p.name, createdAt: p.createdAt };
            currentEditingVersionId.value = null;
            // 加载目标 profile
            Object.assign(data, JSON.parse(JSON.stringify(p.data)));
            await persistData({ mark: false });
            if (data.categories.length > 0) {
                selectCategory(data.categories[0].id, data.categories[0].children[0]?.id);
            }
            showToast('已切换到：' + p.name, 'success');
            modal.profiles = false;
            // 重新加载版本列表（应用该站点自定义顺序）
            await refreshVersions();
            // 恢复当前编辑版本选中（持久化的 currentVersionId，否则自动选最新版本）
            await restoreCurrentVersion();
        };

        const saveCurrentToProfile = async () => {
            const id = currentProfileId.value;
            const p = await Storage.getProfile(id);
            const profile = p || { id: id, name: currentProfileName.value, createdAt: Date.now() };
            profile.data = JSON.parse(JSON.stringify(data));
            await Storage.saveProfile(profile);
            if (p) currentSiteMeta.value = { id: p.id, name: p.name, createdAt: p.createdAt };
            await loadProfiles();
        };

        // 删除最后一个站点后新建的默认站点：重置为干净空白（无分类、无标签内容）
        const resetDataToEmpty = () => {
            data.categories = [];
            data.friendLinks = [];
            if (data.site) {
                data.site.title = '';
                data.site.description = '';
                data.site.keywords = '';
                data.site.favicon = '';
                data.site.logoLight = '';
                data.site.logoDark = '';
                data.site.logoCollapsedLight = '';
                data.site.logoCollapsedDark = '';
            }
        };

        const deleteProfile = async (id) => {
            const p = profiles.value.find(x => x.id === id);
            if (!p) return;
            const doDelete = async () => {
                await Storage.deleteProfile(id);
                await loadProfiles();
                if (id === currentProfileId.value) {
                    // 切到其他站点；如果没有则新建默认站点
                    const remaining = profiles.value.filter(x => x.id !== id);
                    let nextId = remaining.length > 0 ? remaining[0].id : '';
                    if (!nextId) {
                        nextId = await Storage.createProfile('默认站点', {});
                        await loadProfiles();
                        // 清空编辑器内存中的残留内容，并保存为空白默认站点
                        resetDataToEmpty();
                        await persistData({ mark: false, silent: true });
                    }
                    currentProfileId.value = nextId;
                    Storage.setCurrentProfileId(nextId);
                    currentEditingVersionId.value = null;
                    const nextProfile = await Storage.getProfile(nextId);
                    currentSiteMeta.value = nextProfile ? { id: nextProfile.id, name: nextProfile.name, createdAt: nextProfile.createdAt } : null;
                    Object.assign(data, JSON.parse(JSON.stringify((nextProfile && nextProfile.data) || {})));
                    // 切换站点后刷新版本列表并恢复当前版本选中
                    await refreshVersions();
                    await restoreCurrentVersion();
                }
                showToast('站点已删除', 'success');
            };
            askConfirm({
                title: '删除站点',
                message: `确定要删除站点「${p.name}」吗？`,
                note: '该站点的所有版本、部署文件与同步记录将一并删除，且不可恢复。',
                onConfirm: doDelete
            });
        };

        const duplicateProfile = async (p) => {
            const name = p.name + ' - 副本';
            try {
                const siteId = await Storage.createProfile(name, JSON.parse(JSON.stringify(p.data)));
                await loadProfiles();
                const np = profiles.value.find(x => x.id === siteId);
                showToast('已复制：' + (np ? np.name : name), 'success');
            } catch (e) {
                showToast('复制站点失败: ' + e.message, 'error');
            }
        };

        const renameProfile = async (p) => {
            const name = prompt('输入新名称', p.name);
            if (!name || name === p.name) return;
            try {
                const oldId = p.id;
                const newId = await Storage.renameProfile(oldId, name.trim());
                p.id = newId;
                p.name = name.trim();
                if (oldId === currentProfileId.value) {
                    currentProfileId.value = newId;
                    Storage.setCurrentProfileId(newId);
                    if (currentSiteMeta.value) {
                        currentSiteMeta.value.id = newId;
                        currentSiteMeta.value.name = name.trim();
                    }
                }
                await loadProfiles();
                showToast('已重命名', 'success');
            } catch (e) {
                showToast('重命名失败: ' + e.message, 'error');
            }
        };

        // 内联重命名站点
        const renamingProfileId = ref(null);
        const renameProfileName = ref('');
        const startRenameProfile = (p) => {
            renamingProfileId.value = p.id;
            renameProfileName.value = p.name;
            nextTick(() => {
                const el = document.querySelector('.profile-rename-input');
                if (el) { el.focus(); el.select(); }
            });
        };
        const confirmRenameProfile = async (p) => {
            const name = (renameProfileName.value || '').trim();
            if (!name) { showToast('名称不能为空', 'warning'); return; }
            try {
                const oldId = p.id;
                const newId = await Storage.renameProfile(oldId, name);
                p.id = newId;
                p.name = name;
                if (oldId === currentProfileId.value) {
                    currentProfileId.value = newId;
                    Storage.setCurrentProfileId(newId);
                    if (currentSiteMeta.value) {
                        currentSiteMeta.value.id = newId;
                        currentSiteMeta.value.name = name;
                    }
                }
                await loadProfiles();
                renamingProfileId.value = null;
                showToast('已重命名', 'success');
            } catch (e) {
                showToast('重命名失败: ' + e.message, 'error');
            }
        };
        const cancelRenameProfile = () => {
            renamingProfileId.value = null;
        };

        const exportProfile = (p) => {
            const json = JSON.stringify(p, null, 2);
            Utils.download(`profile_${p.name}_${p.id}.json`, json, 'application/json');
        };

        // === 站点管理「恢复」：导出 / 导入全部站点与版本 ===
        const allModulesKey = () => SHARE_MODULES.map(m => m.key);

        const exportAllSitesPackage = async () => {
            try {
                showToast('正在导出全部站点...', 'info', 5000);
                const sites = await Storage.getProfiles();
                const payload = { sites: [] };
                for (const s of sites) {
                    const setting = await Storage.getProfile(s.id);
                    if (!setting) continue;
                    const versions = await Storage.getVersions(s.id);
                    const vlist = [];
                    for (const v of (versions || [])) {
                        const vs = await Storage.getVersionForSite(s.id, v.id);
                        if (vs && vs.data) {
                            vlist.push({
                                id: vs.id,
                                name: vs.name,
                                note: vs.note,
                                timestamp: vs.timestamp,
                                starred: !!vs.starred,
                                data: projectData(vs.data, allModulesKey())
                            });
                        }
                    }
                    payload.sites.push({
                        id: setting.id,
                        name: setting.name,
                        createdAt: setting.createdAt,
                        updatedAt: setting.updatedAt,
                        data: projectData(setting.data, allModulesKey()),
                        versions: vlist
                    });
                }
                if (!payload.sites.length) { showToast('没有可导出的站点', 'warning'); return; }
                if (typeof window.JSZip !== 'function') { showToast('JSZip 库未加载', 'error'); return; }
                const manifest = {
                    format: 'naveditor-package', version: 1, kind: 'sites-backup',
                    modules: allModulesKey(), name: '全部站点备份', note: '全部站点备份', createdAt: Date.now()
                };
                const zip = new window.JSZip();
                zip.file('manifest.json', JSON.stringify(manifest, null, 2));
                zip.file('data.json', JSON.stringify(payload, null, 2));
                const blob = await zip.generateAsync({ type: 'blob' });
                Utils.download('NavEditor全部站点备份.naveditor', blob, 'application/zip');
                showToast('已导出全部站点备份（不含账号凭证与发布基线）', 'success');
            } catch (e) {
                showToast('导出失败：' + (e.message || e), 'error');
            }
        };

        const importAllSitesPackage = () => {
            const inp = document.createElement('input');
            inp.type = 'file';
            inp.accept = '.naveditor,application/zip';
            inp.onchange = async () => {
                const file = inp.files && inp.files[0];
                if (!file) return;
                try {
                    if (typeof window.JSZip !== 'function') throw new Error('JSZip 库未加载');
                    const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
                    const mf = zip.file('manifest.json');
                    const df = zip.file('data.json');
                    if (!mf || !df) throw new Error('恢复包缺少 manifest.json / data.json');
                    await mf.async('string');
                    const payload = JSON.parse(await df.async('string'));
                    if (!payload || !Array.isArray(payload.sites)) throw new Error('恢复包格式不正确');
                    showToast('正在恢复站点...', 'info', 8000);
                    let created = 0;
                    for (const s of payload.sites) {
                        const baseData = (s.data && typeof s.data === 'object') ? JSON.parse(JSON.stringify(s.data)) : {};
                        if (!baseData.site || typeof baseData.site !== 'object') baseData.site = {};
                        if (!Array.isArray(baseData.categories)) baseData.categories = [];
                        const existing = await Storage.getProfiles();
                        let name = (s.name || '恢复站点').trim();
                        let n = 0;
                        while (existing.some(p => p.name === name)) {
                            n++;
                            name = (s.name || '恢复站点') + (n > 1 ? ' (' + n + ')' : ' 恢复');
                        }
                        const id = await Storage.createProfile(name, baseData);
                        await Storage.saveProfile({ id, name, createdAt: s.createdAt || Date.now(), data: baseData, updatedAt: Date.now() });
                        for (const v of (s.versions || [])) {
                            if (!v || !v.data) continue;
                            await Storage.createVersionForSite(id, v.data, v.note || v.name || '恢复版本', { timestamp: v.timestamp, starred: v.starred });
                        }
                        created++;
                    }
                    await loadProfiles();
                    showToast('已恢复 ' + created + ' 个站点（含版本历史）', 'success');
                } catch (e) {
                    showToast('恢复失败：' + (e.message || e), 'error');
                }
            };
            inp.click();
        };

        // === 部署账号管理 ===
        const openSettings = () => {
            modal.settings = true;
            loadPasswordDirInfo();
            loadDataDirInfo();
        };

        // === 账号凭证存储目录（外置，首次添加账号时选择）===
        const passwordDirInfo = ref({ dir: '', configured: false, defaultDir: '' });
        const passwordDirInput = ref('');
        const passwordDirEditing = ref(false);
        const loadPasswordDirInfo = async () => {
            try {
                const res = await fetch('/api/password-dir');
                if (res.ok) {
                    const j = await res.json();
                    if (j.ok) passwordDirInfo.value = j;
                }
            } catch (_e) {}
        };
        const startEditPasswordDir = () => {
            passwordDirInput.value = passwordDirInfo.value.dir || passwordDirInfo.value.defaultDir || '';
            passwordDirEditing.value = true;
        };
        const cancelEditPasswordDir = () => { passwordDirEditing.value = false; };
        const savePasswordDirInput = async () => {
            const dir = (passwordDirInput.value || '').trim();
            if (!dir) { showToast('请输入账号存储文件夹路径', 'warning'); return; }
            try {
                const post = await fetch('/api/password-dir', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ dir })
                });
                const pj = await post.json();
                if (pj.ok) {
                    passwordDirInfo.value = { dir: pj.dir, configured: true, defaultDir: passwordDirInfo.value.defaultDir };
                    passwordDirEditing.value = false;
                    showToast('账号存储文件夹已保存', 'success');
                    await loadAccountsFromServer();
                } else {
                    showToast('保存失败：' + (pj.error || '未知错误'), 'error');
                }
            } catch (e) {
                showToast('保存失败：' + (e.message || e), 'error');
            }
        };
        const browsePasswordDir = async () => {
            try {
                const res = await fetch('/api/choose-password-dir');
                if (!res.ok) { showToast('后端未就绪：请关闭并重新启动 NavEditor', 'warning'); return; }
                const j = await res.json();
                if (j.ok && j.dir) passwordDirInput.value = j.dir;
                else showToast(j && j.error ? ('未选择：' + j.error) : '已取消', 'warning');
            } catch (e) {
                showToast('浏览失败：' + (e.message || e), 'error');
            }
        };
        const ensurePasswordDir = async () => {
            await loadPasswordDirInfo();
            if (passwordDirInfo.value.configured) return true;
            // 未配置：打开账号管理并展开存储目录编辑，让用户确认路径（可手动输入或浏览）
            startEditPasswordDir();
            modal.settings = true;
            showToast('请先设置账号存储文件夹（可手动输入或点“浏览”）', 'warning');
            return false;
        };

        // === 数据目录（web/、password/ 所在根目录，外置后站点数据与软件更新隔离）===
        const dataDirInfo = ref({ dir: '', configured: false, defaultDir: '' });
        const dataDirInput = ref('');
        const dataDirEditing = ref(false);
        const loadDataDirInfo = async () => {
            try {
                const res = await fetch('/api/data-dir');
                if (res.ok) {
                    const j = await res.json();
                    if (j.ok) dataDirInfo.value = j;
                }
            } catch (_e) {}
        };
        const startEditDataDir = () => {
            dataDirInput.value = dataDirInfo.value.dir || dataDirInfo.value.defaultDir || '';
            dataDirEditing.value = true;
        };
        const cancelEditDataDir = () => { dataDirEditing.value = false; };
        const saveDataDirInput = async () => {
            const dir = (dataDirInput.value || '').trim();
            if (!dir) { showToast('请输入数据目录路径', 'warning'); return; }
            try {
                const post = await fetch('/api/data-dir', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ dir })
                });
                const pj = await post.json();
                if (pj.ok) {
                    dataDirInfo.value = { dir: pj.dir, configured: true, defaultDir: dataDirInfo.value.defaultDir };
                    dataDirEditing.value = false;
                    showToast('数据目录已保存，旧数据已迁移', 'success');
                    await Promise.all([loadProfiles(), loadAccountsFromServer()]);
                } else {
                    showToast('保存失败：' + (pj.error || '未知错误'), 'error');
                }
            } catch (e) {
                showToast('保存失败：' + (e.message || e), 'error');
            }
        };
        const browseDataDir = async () => {
            try {
                const res = await fetch('/api/choose-data-dir');
                if (!res.ok) { showToast('后端未就绪：请关闭并重新启动 NavEditor', 'warning'); return; }
                const j = await res.json();
                if (j.ok && j.dir) dataDirInput.value = j.dir;
                else showToast(j && j.error ? ('未选择：' + j.error) : '已取消', 'warning');
            } catch (e) {
                showToast('浏览失败：' + (e.message || e), 'error');
            }
        };

        // === 账号磁盘存储（替代浏览器 localStorage，保存到站点根目录 password/ 文件夹，按类型分文件）===
        // GET /api/accounts -> { github:[], cloudflare:[], active:id }
        // POST /api/accounts -> { github:[], cloudflare:[], active:id } 分别写入 password/Github.json、password/cloudflare.json、password/active.json
        const loadAccountsFromServer = async () => {
            try {
                const res = await fetch('/api/accounts');
                if (!res.ok) return;
                const j = await res.json();
                if (!j.ok) return;
                const list = [
                    ...(Array.isArray(j.github) ? j.github : []).map(a => ({ ...a, type: 'github' })),
                    ...(Array.isArray(j.cloudflare) ? j.cloudflare : []).map(a => ({ ...a, type: 'cloudflare' })),
                    ...(Array.isArray(j.vercel) ? j.vercel : []).map(a => ({ ...a, type: 'vercel' })),
                    ...(Array.isArray(j.netlify) ? j.netlify : []).map(a => ({ ...a, type: 'netlify' })),
                    ...(Array.isArray(j.server) ? j.server : []).map(a => ({ ...a, type: 'server' }))
                ];
                cfAccounts.value = list;
                activeAccountId.value = j.active || (list[0] && list[0].id) || '';
            } catch (e) { /* 离线/旧服务器时忽略，使用空账号列表 */ }
        };
        const saveAccountsToServer = async () => {
            const github = cfAccounts.value.filter(a => a.type === 'github');
            const cloudflare = cfAccounts.value.filter(a => a.type === 'cloudflare');
            const vercel = cfAccounts.value.filter(a => a.type === 'vercel');
            const netlify = cfAccounts.value.filter(a => a.type === 'netlify');
            const server = cfAccounts.value.filter(a => a.type === 'server');
            try {
                await fetch('/api/accounts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ github, cloudflare, vercel, netlify, server, active: activeAccountId.value })
                });
            } catch (e) { /* 保存失败静默，前端状态已更新 */ }
        };

        // === 账号连通性检查 ===
        // connectivityStatus[id] = { state: 'idle'|'checking'|'ok'|'error', info: {...}, message: '' }
        const connectivityStatus = reactive({});

        // 当前选中的发布目标账号名称（用于"确认当前发布目标"提示）
        const activeAccountName = computed(() => {
            const a = cfAccounts.value.find(x => x.id === activeAccountId.value);
            return a ? a.name : '';
        });

        const openAccountProject = (acc) => {
            let url = '';
            if (acc.type === 'github') {
                if (!(acc.owner && acc.repo)) { showToast('该账号缺少 Owner / Repo，无法打开仓库', 'danger', 2500); return; }
                url = `https://github.com/${encodeURIComponent(acc.owner)}/${encodeURIComponent(acc.repo)}`;
            } else if (acc.type === 'server') {
                if (acc.deployType === 'local') {
                    showToast('本地部署没有访问地址，如需可在账号设置中填写「访问地址」', 'info', 3000);
                    return;
                }
                if (!acc.siteUrl) { showToast('该账号未填写访问地址', 'warning', 2500); return; }
                url = /^https?:\/\//i.test(acc.siteUrl) ? acc.siteUrl : ('https://' + acc.siteUrl);
            } else if (acc.type === 'vercel') {
                if (!acc.projectName) { showToast('该账号缺少项目名，无法打开项目站点', 'danger', 2500); return; }
                url = `https://${encodeURIComponent(acc.projectName)}.vercel.app`;
            } else if (acc.type === 'netlify') {
                url = acc.siteName ? `https://${encodeURIComponent(acc.siteName)}.netlify.app` : 'https://app.netlify.com';
            } else {
                if (!acc.projectName) { showToast('该账号缺少项目名，无法打开项目站点', 'danger', 2500); return; }
                url = `https://${encodeURIComponent(acc.projectName)}.pages.dev`;
            }
            window.open(url, '_blank');
        };

        const checkOne = async (acc) => {
            connectivityStatus[acc.id] = { state: 'checking', info: null, message: '检查中...' };
            try {
                const info = acc.type === 'github' ? await GitHubSync.checkConnectivity(acc)
                    : acc.type === 'vercel' ? await VercelSync.checkConnectivity(acc)
                    : acc.type === 'netlify' ? await NetlifySync.checkConnectivity(acc)
                    : acc.type === 'server' ? await ServerSync.checkConnectivity(acc)
                    : await CloudflareSync.checkConnectivity(acc);
                connectivityStatus[acc.id] = {
                    state: info.ok ? 'ok' : 'error',
                    info: info,
                    message: info.message
                };
                if (info.ok) showToast(`${acc.name} 连通性通过 ✓`, 'success', 2000);
                else showToast(`${acc.name} 检查失败：${info.message}`, 'danger', 4000);
            } catch (e) {
                connectivityStatus[acc.id] = { state: 'error', info: null, message: e.message || '请求失败' };
                showToast(`${acc.name} 检查出错：${e.message}`, 'danger', 4000);
            }
        };

        const checkAll = async () => {
            if (cfAccounts.value.length === 0) {
                showToast('没有账号可检查', 'warning');
                return;
            }
            // 重置状态
            cfAccounts.value.forEach(a => { connectivityStatus[a.id] = { state: 'checking', info: null, message: '检查中...' }; });
            // 并发检查（受限于浏览器并发度可串行）
            let okCount = 0, failCount = 0;
            for (const a of cfAccounts.value) {
                try {
                    const info = a.type === 'github' ? await GitHubSync.checkConnectivity(a)
                        : a.type === 'vercel' ? await VercelSync.checkConnectivity(a)
                        : a.type === 'netlify' ? await NetlifySync.checkConnectivity(a)
                        : a.type === 'server' ? await ServerSync.checkConnectivity(a)
                        : await CloudflareSync.checkConnectivity(a);
                    connectivityStatus[a.id] = {
                        state: info.ok ? 'ok' : 'error',
                        info: info,
                        message: info.message
                    };
                    if (info.ok) okCount++; else failCount++;
                } catch (e) {
                    connectivityStatus[a.id] = { state: 'error', info: null, message: e.message || '请求失败' };
                    failCount++;
                }
            }
            showToast(`批量检查完成：✓ ${okCount} 通过，✗ ${failCount} 失败`, okCount > 0 && failCount === 0 ? 'success' : (okCount === 0 ? 'danger' : 'warning'), 3500);
        };

        // === 搜索配置 ===
        const openSearchConfig = () => {
            if (!data.searchConfig) data.searchConfig = { tabs: [], defaultEngine: 'https://www.baidu.com/s?wd=' };
            // 兼容旧格式：早期数据把每个 tab 直接当成搜索引擎（带 url/placeholder），
            // 新格式要求 tab.engines 为数组。这里归一化，避免编辑器与生成器读不到 engines。
            if (data.searchConfig.tabs && Array.isArray(data.searchConfig.tabs)) {
                data.searchConfig.tabs = data.searchConfig.tabs.map(t => {
                    if (t && !Array.isArray(t.engines)) {
                        return { name: t.name || '新标签', icon: t.icon || '', engines: [{ name: t.name || '新引擎', url: t.url || 'https://', placeholder: t.placeholder || '输入关键字搜索', logo: t.logo || '' }] };
                    }
                    return t;
                });
            }
            if (data.searchConfig.searchBoxWidth == null) data.searchConfig.searchBoxWidth = 600;
            if (!data.searchConfig.searchTabTextColor) data.searchConfig.searchTabTextColor = '#ffffff';
            if (!data.searchConfig.searchPlaceholderColor) data.searchConfig.searchPlaceholderColor = '#ffffff';
            if (!data.searchConfig.searchEngineTextColor) data.searchConfig.searchEngineTextColor = '#ffffff';
            if (!data.searchConfig.searchBoxBackgroundColor) data.searchConfig.searchBoxBackgroundColor = 'rgba(255,255,255,0.12)';
            if (!data.searchConfig.modalSearchTabTextColor) data.searchConfig.modalSearchTabTextColor = '#cccccc';
            if (!data.searchConfig.modalSearchPlaceholderColor) data.searchConfig.modalSearchPlaceholderColor = 'rgba(255,255,255,0.45)';
            if (!data.searchConfig.modalSearchEngineTextColor) data.searchConfig.modalSearchEngineTextColor = 'rgba(255,255,255,0.65)';
            if (!data.searchConfig.modalSearchBoxBackgroundColor) data.searchConfig.modalSearchBoxBackgroundColor = 'rgba(255,255,255,0.12)';
            if (!data.searchConfig.modalSearchBackdropColor) data.searchConfig.modalSearchBackdropColor = 'rgba(22,30,40,0.92)';
            modal.searchConfig = true;
        };
        const addSearchTab = () => {
            if (!data.searchConfig) data.searchConfig = { tabs: [], defaultEngine: 'https://www.baidu.com/s?wd=' };
            data.searchConfig.tabs.push({ name: '新标签', icon: '', engines: [{ name: '百度', url: 'https://www.baidu.com/s?wd=', placeholder: '百度一下', logo: '' }] });
            persistData({ mark: true, silent: true })
        };
        const removeSearchTab = (i) => {
            data.searchConfig.tabs.splice(i, 1);
            persistData({ mark: true, silent: true })
        };
        const addSearchEngine = (tabIdx) => {
            data.searchConfig.tabs[tabIdx].engines.push({ name: '新引擎', url: 'https://', placeholder: '输入关键字', logo: '' });
            persistData({ mark: true, silent: true })
        };
        const removeSearchEngine = (tabIdx, engIdx) => {
            data.searchConfig.tabs[tabIdx].engines.splice(engIdx, 1);
            persistData({ mark: true, silent: true })
        };

        // === 背景图配置 ===
        // 内置本地壁纸预设（不依赖网络、永久生效、cover 自适应尺寸）
        const RAW_BUILTIN_WALLPAPERS = [
            // 画布（纯色纸感，简单）
            { name: '纯白画布', type: 'image', url: 'assets/images/wallpapers/画布/纯白画布.svg', group: 'canvas' },
            { name: '象牙纸', type: 'image', url: 'assets/images/wallpapers/画布/象牙纸.svg', group: 'canvas' },
            { name: '燕麦画布', type: 'image', url: 'assets/images/wallpapers/画布/燕麦画布.svg', group: 'canvas' },
            { name: '暖灰画布', type: 'image', url: 'assets/images/wallpapers/画布/暖灰画布.svg', group: 'canvas' },
            { name: '浅灰纸', type: 'image', url: 'assets/images/wallpapers/画布/浅灰纸.svg', group: 'canvas' },
            { name: '墨灰画布', type: 'image', url: 'assets/images/wallpapers/画布/墨灰画布.svg', group: 'canvas' },
            { name: '牛皮纸', type: 'image', url: 'assets/images/wallpapers/画布/牛皮纸.svg', group: 'canvas' },
            { name: '淡蓝纸', type: 'image', url: 'assets/images/wallpapers/画布/淡蓝纸.svg', group: 'canvas' },
            { name: '淡粉纸', type: 'image', url: 'assets/images/wallpapers/画布/淡粉纸.svg', group: 'canvas' },
            { name: '淡绿纸', type: 'image', url: 'assets/images/wallpapers/画布/淡绿纸.svg', group: 'canvas' },
            { name: '淡黄纸', type: 'image', url: 'assets/images/wallpapers/画布/淡黄纸.svg', group: 'canvas' },
            { name: '墨黑画布', type: 'image', url: 'assets/images/wallpapers/画布/墨黑画布.svg', group: 'canvas' },
            // 壁纸（渐变风格）
            { name: '深蓝星空', type: 'image', url: 'assets/images/wallpapers/壁纸（渐变）/深蓝星空.svg', group: 'wallpaper' },
            { name: '青绿山水', type: 'image', url: 'assets/images/wallpapers/壁纸（渐变）/青绿山水.svg', group: 'wallpaper' },
            { name: '暖橙黄昏', type: 'image', url: 'assets/images/wallpapers/壁纸（渐变）/暖橙黄昏.svg', group: 'wallpaper' },
            { name: '紫粉梦幻', type: 'image', url: 'assets/images/wallpapers/壁纸（渐变）/紫粉梦幻.svg', group: 'wallpaper' },
            { name: '墨绿森林', type: 'image', url: 'assets/images/wallpapers/壁纸（渐变）/墨绿森林.svg', group: 'wallpaper' },
            { name: '灰蓝简约', type: 'image', url: 'assets/images/wallpapers/壁纸（渐变）/灰蓝简约.svg', group: 'wallpaper' }
        ,
{ name: '雾霾蓝', type: 'image', url: 'assets/images/wallpapers/画布/雾霾蓝.svg', group: 'canvas' },
            { name: '藕荷紫', type: 'image', url: 'assets/images/wallpapers/画布/藕荷紫.svg', group: 'canvas' },
            { name: '抹茶绿', type: 'image', url: 'assets/images/wallpapers/画布/抹茶绿.svg', group: 'canvas' },
            { name: '珊瑚橘', type: 'image', url: 'assets/images/wallpapers/画布/珊瑚橘.svg', group: 'canvas' },
            { name: '玫瑰金', type: 'image', url: 'assets/images/wallpapers/画布/玫瑰金.svg', group: 'canvas' },
            { name: '炭灰', type: 'image', url: 'assets/images/wallpapers/画布/炭灰.svg', group: 'canvas' },
            { name: '雾霾绿', type: 'image', url: 'assets/images/wallpapers/画布/雾霾绿.svg', group: 'canvas' },
            { name: '浅卡其', type: 'image', url: 'assets/images/wallpapers/画布/浅卡其.svg', group: 'canvas' },
            { name: '极光绿', type: 'image', url: 'assets/images/wallpapers/壁纸（渐变）/极光绿（壁纸）.svg', group: 'wallpaper' },
            { name: '蜜桃粉', type: 'image', url: 'assets/images/wallpapers/壁纸（渐变）/蜜桃粉.svg', group: 'wallpaper' },
            { name: '暮山紫', type: 'image', url: 'assets/images/wallpapers/壁纸（渐变）/暮山紫.svg', group: 'wallpaper' },
            { name: '深海蓝', type: 'image', url: 'assets/images/wallpapers/壁纸（渐变）/深海蓝（壁纸）.svg', group: 'wallpaper' },
            { name: '日出金', type: 'image', url: 'assets/images/wallpapers/壁纸（渐变）/日出金.svg', group: 'wallpaper' },
            { name: '薄荷青', type: 'image', url: 'assets/images/wallpapers/壁纸（渐变）/薄荷青.svg', group: 'wallpaper' },
            { name: '葡萄紫', type: 'image', url: 'assets/images/wallpapers/壁纸（渐变）/葡萄紫.svg', group: 'wallpaper' },
            { name: '赤陶橙', type: 'image', url: 'assets/images/wallpapers/壁纸（渐变）/赤陶橙.svg', group: 'wallpaper' },
            { name: '湖光蓝', type: 'image', url: 'assets/images/wallpapers/壁纸（渐变）/湖光蓝.svg', group: 'wallpaper' },
            { name: '樱粉', type: 'image', url: 'assets/images/wallpapers/壁纸（渐变）/樱粉.svg', group: 'wallpaper' },
            { name: '松石绿', type: 'image', url: 'assets/images/wallpapers/壁纸（渐变）/松石绿.svg', group: 'wallpaper' },
            { name: '暮光橙', type: 'image', url: 'assets/images/wallpapers/壁纸（渐变）/暮光橙.svg', group: 'wallpaper' },
            { name: '靛蓝', type: 'image', url: 'assets/images/wallpapers/壁纸（渐变）/靛蓝.svg', group: 'wallpaper' },
            { name: '薄暮灰粉', type: 'image', url: 'assets/images/wallpapers/壁纸（渐变）/薄暮灰粉.svg', group: 'wallpaper' },
            { name: '日落橙粉', type: "image", url: 'assets/images/wallpapers/壁纸（渐变）/日落橙粉.png', group: 'wallpaper' },
            { name: '导航蓝紫渐变', type: "image", url: 'assets/images/wallpapers/壁纸（渐变）/导航蓝紫渐变.webp', group: 'wallpaper' },
            { name: '导航青绿渐变', type: "image", url: 'assets/images/wallpapers/壁纸（渐变）/导航青绿渐变.png', group: 'wallpaper' },
            { name: '点阵灰', type: 'image', url: 'assets/images/wallpapers/图案纹理/点阵灰.svg', group: 'pattern' },
            { name: '圆点蓝', type: 'image', url: 'assets/images/wallpapers/图案纹理/圆点蓝.svg', group: 'pattern' },
            { name: '网格米', type: 'image', url: 'assets/images/wallpapers/图案纹理/网格米.svg', group: 'pattern' },
            { name: '细格绿', type: 'image', url: 'assets/images/wallpapers/图案纹理/细格绿.svg', group: 'pattern' },
            { name: '横纹紫', type: 'image', url: 'assets/images/wallpapers/图案纹理/横纹紫.svg', group: 'pattern' },
            { name: '竖纹橘', type: 'image', url: 'assets/images/wallpapers/图案纹理/竖纹橘.svg', group: 'pattern' },
            { name: '斜纹蓝', type: 'image', url: 'assets/images/wallpapers/图案纹理/斜纹蓝.svg', group: 'pattern' },
            { name: '波纹青', type: 'image', url: 'assets/images/wallpapers/图案纹理/波纹青.svg', group: 'pattern' },
            { name: '锯齿粉', type: 'image', url: 'assets/images/wallpapers/图案纹理/锯齿粉.svg', group: 'pattern' },
            { name: '十字灰', type: 'image', url: 'assets/images/wallpapers/图案纹理/十字灰.svg', group: 'pattern' },
            { name: '加号绿', type: 'image', url: 'assets/images/wallpapers/图案纹理/加号绿.svg', group: 'pattern' },
            { name: '圆环蓝', type: 'image', url: 'assets/images/wallpapers/图案纹理/圆环蓝.svg', group: 'pattern' },
            { name: '菱格紫', type: 'image', url: 'assets/images/wallpapers/图案纹理/菱格紫.svg', group: 'pattern' },
            { name: '蜂巢灰', type: 'image', url: 'assets/images/wallpapers/图案纹理/蜂巢灰.svg', group: 'pattern' },
            { name: '山形橘', type: 'image', url: 'assets/images/wallpapers/图案纹理/山形橘.svg', group: 'pattern' },
            { name: '三角青', type: 'image', url: 'assets/images/wallpapers/图案纹理/三角青.svg', group: 'pattern' },
            { name: '棋盘米', type: 'image', url: 'assets/images/wallpapers/图案纹理/棋盘米.svg', group: 'pattern' },
            { name: '扇贝蓝', type: 'image', url: 'assets/images/wallpapers/图案纹理/扇贝蓝.svg', group: 'pattern' },
            { name: '砖纹灰', type: 'image', url: 'assets/images/wallpapers/图案纹理/砖纹灰.svg', group: 'pattern' },
            { name: '同心紫', type: 'image', url: 'assets/images/wallpapers/图案纹理/同心紫.svg', group: 'pattern' },
            { name: '导航点阵科技', type: "image", url: 'assets/images/wallpapers/图案纹理/导航点阵科技.png', group: 'pattern' },
            { name: '导航网格几何', type: "image", url: 'assets/images/wallpapers/图案纹理/导航网格几何.png', group: 'pattern' },
            { name: '晨雾紫', type: 'image', url: 'assets/images/wallpapers/自然风景/晨雾紫.svg', group: 'nature' },
            { name: '麦田金', type: 'image', url: 'assets/images/wallpapers/自然风景/麦田金.svg', group: 'nature' },
            { name: '湖面青', type: 'image', url: 'assets/images/wallpapers/自然风景/湖面青.svg', group: 'nature' },
            { name: '山林绿', type: 'image', url: 'assets/images/wallpapers/自然风景/山林绿.svg', group: 'nature' },
            { name: '暮色橙', type: 'image', url: 'assets/images/wallpapers/自然风景/暮色橙.svg', group: 'nature' },
            { name: '雪原白', type: 'image', url: 'assets/images/wallpapers/自然风景/雪原白.svg', group: 'nature' },
            { name: '极光绿', type: 'image', url: 'assets/images/wallpapers/自然风景/极光绿（自然风景）.svg', group: 'nature' },
            { name: '晚霞红', type: 'image', url: 'assets/images/wallpapers/自然风景/晚霞红.svg', group: 'nature' },
            { name: '海湾蓝', type: 'image', url: 'assets/images/wallpapers/自然风景/海湾蓝.svg', group: 'nature' },
            { name: '秋林金', type: 'image', url: 'assets/images/wallpapers/自然风景/秋林金.svg', group: 'nature' },
            { name: '春野绿', type: 'image', url: 'assets/images/wallpapers/自然风景/春野绿.svg', group: 'nature' },
            { name: '竹海青', type: 'image', url: 'assets/images/wallpapers/自然风景/竹海青.svg', group: 'nature' },
            { name: '珊瑚海', type: 'image', url: 'assets/images/wallpapers/自然风景/珊瑚海.svg', group: 'nature' },
            { name: '紫霞谷', type: 'image', url: 'assets/images/wallpapers/自然风景/紫霞谷.svg', group: 'nature' },
            { name: '沙漠金', type: 'image', url: 'assets/images/wallpapers/自然风景/沙漠金.svg', group: 'nature' },
            { name: '薄荷原', type: 'image', url: 'assets/images/wallpapers/自然风景/薄荷原.svg', group: 'nature' },
            { name: '靛峰蓝', type: 'image', url: 'assets/images/wallpapers/自然风景/靛峰蓝.svg', group: 'nature' },
            { name: '胭脂谷', type: 'image', url: 'assets/images/wallpapers/自然风景/胭脂谷.svg', group: 'nature' },
            { name: '松涛绿', type: 'image', url: 'assets/images/wallpapers/自然风景/松涛绿.svg', group: 'nature' },
            { name: '银河夜', type: 'image', url: 'assets/images/wallpapers/自然风景/银河夜.svg', group: 'nature' },
            { name: '高级灰', type: 'image', url: 'assets/images/wallpapers/商务简约/高级灰.svg', group: 'business' },
            { name: '藏青', type: 'image', url: 'assets/images/wallpapers/商务简约/藏青.svg', group: 'business' },
            { name: '米白', type: 'image', url: 'assets/images/wallpapers/商务简约/米白.svg', group: 'business' },
            { name: '石板', type: 'image', url: 'assets/images/wallpapers/商务简约/石板.svg', group: 'business' },
            { name: '钢蓝', type: 'image', url: 'assets/images/wallpapers/商务简约/钢蓝.svg', group: 'business' },
            { name: '炭黑', type: 'image', url: 'assets/images/wallpapers/商务简约/炭黑.svg', group: 'business' },
            { name: '雾蓝', type: 'image', url: 'assets/images/wallpapers/商务简约/雾蓝.svg', group: 'business' },
            { name: '黛绿', type: 'image', url: 'assets/images/wallpapers/商务简约/黛绿.svg', group: 'business' },
            { name: '陶土', type: 'image', url: 'assets/images/wallpapers/商务简约/陶土.svg', group: 'business' },
            { name: '钴蓝', type: 'image', url: 'assets/images/wallpapers/商务简约/钴蓝.svg', group: 'business' },
            { name: '珍珠', type: 'image', url: 'assets/images/wallpapers/商务简约/珍珠.svg', group: 'business' },
            { name: '玄武', type: 'image', url: 'assets/images/wallpapers/商务简约/玄武.svg', group: 'business' },
            { name: '沙金', type: 'image', url: 'assets/images/wallpapers/商务简约/沙金.svg', group: 'business' },
            { name: '墨玉', type: 'image', url: 'assets/images/wallpapers/商务简约/墨玉.svg', group: 'business' },
            { name: '青灰', type: 'image', url: 'assets/images/wallpapers/商务简约/青灰.svg', group: 'business' },
            { name: '酒红', type: 'image', url: 'assets/images/wallpapers/商务简约/酒红.svg', group: 'business' },
            { name: '橄榄', type: 'image', url: 'assets/images/wallpapers/商务简约/橄榄.svg', group: 'business' },
            { name: '冰川', type: 'image', url: 'assets/images/wallpapers/商务简约/冰川.svg', group: 'business' },
            { name: '烟灰', type: 'image', url: 'assets/images/wallpapers/商务简约/烟灰.svg', group: 'business' },
            { name: '靛青', type: 'image', url: 'assets/images/wallpapers/商务简约/靛青.svg', group: 'business' },
            { name: '莫兰迪灰', type: "image", url: 'assets/images/wallpapers/商务简约/莫兰迪灰.png', group: 'business' },
            { name: '雾霾蓝', type: "image", url: 'assets/images/wallpapers/商务简约/雾霾蓝.png', group: 'business' },
            { name: '冰蓝白', type: "image", url: 'assets/images/wallpapers/商务简约/冰蓝白.png', group: 'business' },
            { name: '导航晨雾浅灰', type: "image", url: 'assets/images/wallpapers/商务简约/导航晨雾浅灰.png', group: 'business' },
            { name: '导航深蓝商务', type: "image", url: 'assets/images/wallpapers/商务简约/导航深蓝商务.png', group: 'business' },
            { name: '暗夜蓝', type: 'image', url: 'assets/images/wallpapers/暗色系/暗夜蓝.svg', group: 'dark' },
            { name: '深空黑', type: 'image', url: 'assets/images/wallpapers/暗色系/深空黑.svg', group: 'dark' },
            { name: '墨绿暗', type: 'image', url: 'assets/images/wallpapers/暗色系/墨绿暗.svg', group: 'dark' },
            { name: '酒红暗', type: 'image', url: 'assets/images/wallpapers/暗色系/酒红暗.svg', group: 'dark' },
            { name: '石墨灰', type: 'image', url: 'assets/images/wallpapers/暗色系/石墨灰.svg', group: 'dark' },
            { name: '暗紫', type: 'image', url: 'assets/images/wallpapers/暗色系/暗紫.svg', group: 'dark' },
            { name: '曜石', type: 'image', url: 'assets/images/wallpapers/暗色系/曜石.svg', group: 'dark' },
            { name: '深海蓝', type: 'image', url: 'assets/images/wallpapers/暗色系/深海蓝（暗色系）.svg', group: 'dark' },
            { name: '林夜绿', type: 'image', url: 'assets/images/wallpapers/暗色系/林夜绿.svg', group: 'dark' },
            { name: '李暗紫', type: 'image', url: 'assets/images/wallpapers/暗色系/李暗紫.svg', group: 'dark' },
            { name: '炭蓝', type: 'image', url: 'assets/images/wallpapers/暗色系/炭蓝.svg', group: 'dark' },
            { name: '血夜红', type: 'image', url: 'assets/images/wallpapers/暗色系/血夜红.svg', group: 'dark' },
            { name: '墨蓝黑', type: 'image', url: 'assets/images/wallpapers/暗色系/墨蓝黑.svg', group: 'dark' },
            { name: '紫夜', type: 'image', url: 'assets/images/wallpapers/暗色系/紫夜.svg', group: 'dark' },
            { name: '黑青', type: 'image', url: 'assets/images/wallpapers/暗色系/黑青.svg', group: 'dark' },
            { name: '暗玫', type: 'image', url: 'assets/images/wallpapers/暗色系/暗玫.svg', group: 'dark' },
            { name: '煤黑', type: 'image', url: 'assets/images/wallpapers/暗色系/煤黑.svg', group: 'dark' },
            { name: '松夜', type: 'image', url: 'assets/images/wallpapers/暗色系/松夜.svg', group: 'dark' },
            { name: '靛夜', type: 'image', url: 'assets/images/wallpapers/暗色系/靛夜.svg', group: 'dark' },
            { name: '灰夜', type: 'image', url: 'assets/images/wallpapers/暗色系/灰夜.svg', group: 'dark' },
            { name: '炭黑玫瑰金', type: "image", url: 'assets/images/wallpapers/暗色系/炭黑玫瑰金.png', group: 'dark' },
            { name: '赛博极光', type: "image", url: 'assets/images/wallpapers/暗色系/赛博极光.png', group: 'dark' },
            { name: '导航深空科技', type: "image", url: 'assets/images/wallpapers/暗色系/导航深空科技.png', group: 'dark' },
            { name: '导航暗夜紫电', type: "image", url: 'assets/images/wallpapers/暗色系/导航暗夜紫电.png', group: 'dark' },
            // 自然科学（化学/物理/生物交叉融合）
            { name: '量子纠缠', type: 'image', url: 'assets/images/wallpapers/自然科学/量子纠缠.svg', group: 'science' },
            { name: '生命起源', type: 'image', url: 'assets/images/wallpapers/自然科学/生命起源.svg', group: 'science' },
            { name: '化学反应', type: 'image', url: 'assets/images/wallpapers/自然科学/化学反应.svg', group: 'science' },
            { name: '经典力学', type: 'image', url: 'assets/images/wallpapers/自然科学/经典力学.svg', group: 'science' },
            { name: '电磁世界', type: 'image', url: 'assets/images/wallpapers/自然科学/电磁世界.svg', group: 'science' },
            { name: '量子前沿', type: 'image', url: 'assets/images/wallpapers/自然科学/量子前沿.svg', group: 'science' },
            { name: '生物王国', type: 'image', url: 'assets/images/wallpapers/自然科学/生物王国.svg', group: 'science' },
            { name: '地球密码', type: 'image', url: 'assets/images/wallpapers/自然科学/地球密码.svg', group: 'science' },
            { name: '宇宙尺度', type: 'image', url: 'assets/images/wallpapers/自然科学/宇宙尺度.svg', group: 'science' },
            { name: '材料革命', type: 'image', url: 'assets/images/wallpapers/自然科学/材料革命.svg', group: 'science' },
            { name: '能量转换', type: 'image', url: 'assets/images/wallpapers/自然科学/能量转换.svg', group: 'science' },
            { name: '信息载体', type: 'image', url: 'assets/images/wallpapers/自然科学/信息载体.svg', group: 'science' },
            { name: '物质结构', type: 'image', url: 'assets/images/wallpapers/自然科学/物质结构.svg', group: 'science' },
            { name: '波动世界', type: 'image', url: 'assets/images/wallpapers/自然科学/波动世界.svg', group: 'science' },
            { name: '极限条件', type: 'image', url: 'assets/images/wallpapers/自然科学/极限条件.svg', group: 'science' },
            { name: '天文仪器', type: 'image', url: 'assets/images/wallpapers/自然科学/天文仪器.svg', group: 'science' },
            { name: '生理系统', type: 'image', url: 'assets/images/wallpapers/自然科学/生理系统.svg', group: 'science' },
            { name: '进化脉络', type: 'image', url: 'assets/images/wallpapers/自然科学/进化脉络.svg', group: 'science' },
            { name: '粒子物理', type: 'image', url: 'assets/images/wallpapers/自然科学/粒子物理.svg', group: 'science' },
            { name: '未来科学', type: 'image', url: 'assets/images/wallpapers/自然科学/未来科学.svg', group: 'science' },
            // 金融（人物/建筑/历史事件/技术）
            { name: '美元群像', type: 'image', url: 'assets/images/wallpapers/金融/美元群像.svg', group: 'finance' },
            { name: '华尔街地标', type: 'image', url: 'assets/images/wallpapers/金融/华尔街地标.svg', group: 'finance' },
            { name: '全球金融中心', type: 'image', url: 'assets/images/wallpapers/金融/全球金融中心.svg', group: 'finance' },
            { name: 'K线风云', type: 'image', url: 'assets/images/wallpapers/金融/K线风云.svg', group: 'finance' },
            { name: '危机记忆', type: 'image', url: 'assets/images/wallpapers/金融/危机记忆.svg', group: 'finance' },
            { name: '货币演进', type: 'image', url: 'assets/images/wallpapers/金融/货币演进.svg', group: 'finance' },
            { name: '金融建筑群', type: 'image', url: 'assets/images/wallpapers/金融/金融建筑群.svg', group: 'finance' },
            { name: '黄金时代', type: 'image', url: 'assets/images/wallpapers/金融/黄金时代.svg', group: 'finance' },
            { name: '股市编年', type: 'image', url: 'assets/images/wallpapers/金融/股市编年.svg', group: 'finance' },
            { name: '金融巨擘', type: 'image', url: 'assets/images/wallpapers/金融/金融巨擘.svg', group: 'finance' },
            { name: '贸易之路', type: 'image', url: 'assets/images/wallpapers/金融/贸易之路.svg', group: 'finance' },
            { name: '央行体系', type: 'image', url: 'assets/images/wallpapers/金融/央行体系.svg', group: 'finance' },
            { name: '能源金融', type: 'image', url: 'assets/images/wallpapers/金融/能源金融.svg', group: 'finance' },
            { name: '债券帝国', type: 'image', url: 'assets/images/wallpapers/金融/债券帝国.svg', group: 'finance' },
            { name: '衍生迷宫', type: 'image', url: 'assets/images/wallpapers/金融/衍生迷宫.svg', group: 'finance' },
            { name: '金融科技', type: 'image', url: 'assets/images/wallpapers/金融/金融科技.svg', group: 'finance' },
            { name: '并购风云', type: 'image', url: 'assets/images/wallpapers/金融/并购风云.svg', group: 'finance' },
            { name: '保险精算', type: 'image', url: 'assets/images/wallpapers/金融/保险精算.svg', group: 'finance' },
            { name: '商品帝国', type: 'image', url: 'assets/images/wallpapers/金融/商品帝国.svg', group: 'finance' },
            { name: '数字货币', type: 'image', url: 'assets/images/wallpapers/金融/数字货币.svg', group: 'finance' },
            // 城市建筑（现代天际线/街景/建筑）
            { name: '暮色天际', type: 'image', url: 'assets/images/wallpapers/城市建筑/暮色天际.png', group: 'city' },
            { name: '玻璃幕墙', type: 'image', url: 'assets/images/wallpapers/城市建筑/玻璃幕墙.png', group: 'city' },
            { name: '雨夜霓虹街', type: 'image', url: 'assets/images/wallpapers/城市建筑/雨夜霓虹街.png', group: 'city' },
            { name: '晨光运河', type: 'image', url: 'assets/images/wallpapers/城市建筑/晨光运河.png', group: 'city' },
            // 赛博朋克（霓虹/未来/黑客）
            { name: '雨夜霓虹巷', type: 'image', url: 'assets/images/wallpapers/赛博朋克/雨夜霓虹巷.png', group: 'cyberpunk' },
            { name: '黑客终端', type: 'image', url: 'assets/images/wallpapers/赛博朋克/黑客终端.png', group: 'cyberpunk' },
            { name: '屋顶摩托', type: 'image', url: 'assets/images/wallpapers/赛博朋克/屋顶摩托.png', group: 'cyberpunk' },
            { name: '全息广告', type: 'image', url: 'assets/images/wallpapers/赛博朋克/全息广告.png', group: 'cyberpunk' },
            // 极简线条（干净/线条/几何）
            { name: '金线几何', type: 'image', url: 'assets/images/wallpapers/极简线条/金线几何.png', group: 'minimal' },
            { name: '灰白曲线', type: 'image', url: 'assets/images/wallpapers/极简线条/灰白曲线.png', group: 'minimal' },
            { name: '悬浮球体', type: 'image', url: 'assets/images/wallpapers/极简线条/悬浮球体.webp', group: 'minimal' },
            { name: '一线山影', type: 'image', url: 'assets/images/wallpapers/极简线条/一线山影.png', group: 'minimal' },
            // 星空宇宙（银河/星云/宇航员）
            { name: '银河山湖', type: 'image', url: 'assets/images/wallpapers/星空宇宙/银河山湖.png', group: 'starry' },
            { name: '彩色星云', type: 'image', url: 'assets/images/wallpapers/星空宇宙/彩色星云.png', group: 'starry' },
            { name: '极光宇航员', type: 'image', url: 'assets/images/wallpapers/星空宇宙/极光宇航员.png', group: 'starry' },
            { name: '地出月面', type: 'image', url: 'assets/images/wallpapers/星空宇宙/地出月面.png', group: 'starry' },
            // 水彩插画（柔和/手绘/梦幻）
            { name: '樱花水彩', type: 'image', url: 'assets/images/wallpapers/水彩插画/樱花水彩.png', group: 'watercolor' },
            { name: '海日落', type: 'image', url: 'assets/images/wallpapers/水彩插画/海日落.png', group: 'watercolor' },
            { name: '雾山森林', type: 'image', url: 'assets/images/wallpapers/水彩插画/雾山森林.png', group: 'watercolor' },
            { name: '热气球', type: 'image', url: 'assets/images/wallpapers/水彩插画/热气球.png', group: 'watercolor' }
];
        // 内置分组定义（label 与 wallpapers/ 下物理文件夹名一致）
        const WP_BUILTIN_GROUP_DEFS = [
            { key: 'canvas', label: '画布', pos: ['bottom', 'footer'] },
            { key: 'wallpaper', label: '壁纸（渐变）', pos: ['top', 'bottom', 'footer'] },
            { key: 'pattern', label: '图案纹理', pos: ['top', 'bottom'] },
            { key: 'nature', label: '自然风景', pos: ['top', 'bottom'] },
            { key: 'business', label: '商务简约', pos: ['bottom', 'footer'] },
            { key: 'dark', label: '暗色系', pos: ['bottom', 'footer'] },
            { key: 'science', label: '自然科学', pos: ['top'] },
            { key: 'finance', label: '金融', pos: ['top', 'bottom'] },
            { key: 'city', label: '城市建筑', pos: ['top', 'bottom'] },
            { key: 'cyberpunk', label: '赛博朋克', pos: ['top', 'bottom'] },
            { key: 'minimal', label: '极简线条', pos: ['bottom', 'footer'] },
            { key: 'starry', label: '星空宇宙', pos: ['top', 'bottom'] },
            { key: 'watercolor', label: '水彩插画', pos: ['top', 'bottom'] },
        ];
        const BG_BUILTIN_KEYS = WP_BUILTIN_GROUP_DEFS.map(g => g.key);
        const WP_GROUP_POS_MAP = {};
        WP_BUILTIN_GROUP_DEFS.forEach(g => { WP_GROUP_POS_MAP[g.key] = g.pos; });
        // 分组（分类）：响应式、可持久化（data.wallpaperGroups）。初始用内置分组，
        // 加载后若有用户自定义顺序则还原。模板自动解包 ref。
        const bgPresetGroups = ref(WP_BUILTIN_GROUP_DEFS.map(g => ({ ...g })));
        // 读取某分类「当前」所处的位置（响应式：随用户把分类拖到位置标签重新指派而变）
        const liveGroupPos = (key) => {
            const g = bgPresetGroups.value.find(x => x.key === key);
            if (!g) return ['top'];
            const ps = Array.isArray(g.pos) ? g.pos : (g.pos ? [g.pos] : ['top']);
            return ps.length ? ps : ['top'];
        };
        // 按「适配位置」展开内置壁纸：每张壁纸按其所属分类的当前 pos 在每个位置各生成一份记录，
        // 位置各自独立（顶部删某张不影响页脚的同款）。每张内置壁纸带唯一 id 与 pos。
        // 用 ref 包裹，分类位置被重新指派后可重建，驱动壁纸库/背景配置联动刷新。
        const builtinWallpapers = ref([]);
        const rebuildBuiltinWallpapers = () => {
            const idxMap = {};
            const list = [];
            RAW_BUILTIN_WALLPAPERS.forEach(w => {
                const positions = liveGroupPos(w.group);
                positions.forEach(pos => {
                    const k = w.group + '_' + pos;
                    const idx = (idxMap[k] = (idxMap[k] || 0) + 1) - 1;
                    list.push({ id: 'b_' + w.group + '_' + pos + '_' + idx, name: w.name, type: 'image', url: w.url, group: w.group, pos });
                });
            });
            builtinWallpapers.value = list;
        };
        rebuildBuiltinWallpapers();
        const syncWallpaperGroups = () => {
            const saved = Array.isArray(data.wallpaperGroups) ? data.wallpaperGroups : [];
            if (!saved.length) return; // 没有持久化顺序时保持代码里的最新内置分组
            // 以当前代码中的内置分组为权威定义，避免旧持久化数据丢失新分组/新属性
            const builtMap = {};
            bgPresetGroups.value.forEach(g => { if (isBuiltinGroup(g.key)) builtMap[g.key] = { ...g }; });
            const ordered = [];
            const usedBuiltin = new Set();
            saved.forEach(sg => {
                if (isBuiltinGroup(sg.key)) {
                    if (builtMap[sg.key] && !usedBuiltin.has(sg.key)) {
                        // 保留内置分类被用户「拖到位置标签」重新指派过的 pos（否则刷新即丢失）
                        const savedPos = Array.isArray(sg.pos) ? sg.pos : (sg.pos ? [sg.pos] : null);
                        ordered.push({ ...builtMap[sg.key], pos: savedPos || builtMap[sg.key].pos });
                        usedBuiltin.add(sg.key);
                    }
                } else {
                    // 自定义分类：补全 pos（旧数据缺省时默认 ['top']），保持位置维度一致
                    const pos = Array.isArray(sg.pos) ? sg.pos : (sg.pos ? [sg.pos] : ['top']);
                    ordered.push({ ...sg, pos });
                }
            });
            // 把新增的内置分组补到末尾（如化学/物理/生物）
            bgPresetGroups.value.forEach(g => {
                if (isBuiltinGroup(g.key) && !usedBuiltin.has(g.key)) {
                    ordered.push({ ...g });
                }
            });
            bgPresetGroups.value = ordered;
            // 持久化最新完整顺序，方便下次同步
            data.wallpaperGroups = ordered.map(g => ({ ...g }));
            // 分类位置（含内置）可能已被持久化数据改变，重建内置壁纸展开以匹配
            rebuildBuiltinWallpapers();
        };
        // 旧数据 → 新中文文件名迁移表（2026-07-14 壁纸文件全面中文化）
        const WALLPAPER_URL_MIGRATION = {"assets/images/wallpapers/DNA双螺旋.svg":"assets/images/wallpapers/生物/DNA双螺旋.svg","assets/images/wallpapers/三角青.svg":"assets/images/wallpapers/图案纹理/三角青.svg","assets/images/wallpapers/催化.svg":"assets/images/wallpapers/化学/催化.svg","assets/images/wallpapers/元素.svg":"assets/images/wallpapers/化学/元素.svg","assets/images/wallpapers/光合作用.svg":"assets/images/wallpapers/生物/光合作用.svg","assets/images/wallpapers/光栅.svg":"assets/images/wallpapers/物理/光栅.svg","assets/images/wallpapers/光谱.svg":"assets/images/wallpapers/化学/光谱.svg","assets/images/wallpapers/光速.svg":"assets/images/wallpapers/物理/光速.svg","assets/images/wallpapers/共生.svg":"assets/images/wallpapers/生物/共生.svg","assets/images/wallpapers/冰川.svg":"assets/images/wallpapers/商务简约/冰川.svg","assets/images/wallpapers/分子簇.svg":"assets/images/wallpapers/化学/分子簇.svg","assets/images/wallpapers/加号绿.svg":"assets/images/wallpapers/图案纹理/加号绿.svg","assets/images/wallpapers/化学公式.svg":"assets/images/wallpapers/化学/化学公式.svg","assets/images/wallpapers/十字灰.svg":"assets/images/wallpapers/图案纹理/十字灰.svg","assets/images/wallpapers/单摆.svg":"assets/images/wallpapers/物理/单摆.svg","assets/images/wallpapers/原子核.svg":"assets/images/wallpapers/物理/原子核.svg","assets/images/wallpapers/原子轨道.svg":"assets/images/wallpapers/化学/原子轨道.svg","assets/images/wallpapers/反应链.svg":"assets/images/wallpapers/化学/反应链.svg","assets/images/wallpapers/叶绿体.svg":"assets/images/wallpapers/生物/叶绿体.svg","assets/images/wallpapers/叶脉.svg":"assets/images/wallpapers/生物/叶脉.svg","assets/images/wallpapers/同心紫.svg":"assets/images/wallpapers/图案纹理/同心紫.svg","assets/images/wallpapers/圆点蓝.svg":"assets/images/wallpapers/图案纹理/圆点蓝.svg","assets/images/wallpapers/圆环蓝.svg":"assets/images/wallpapers/图案纹理/圆环蓝.svg","assets/images/wallpapers/墨灰画布.svg":"assets/images/wallpapers/画布/墨灰画布.svg","assets/images/wallpapers/墨玉.svg":"assets/images/wallpapers/商务简约/墨玉.svg","assets/images/wallpapers/墨绿暗.svg":"assets/images/wallpapers/暗色系/墨绿暗.svg","assets/images/wallpapers/墨绿森林.svg":"assets/images/wallpapers/壁纸（渐变）/墨绿森林.svg","assets/images/wallpapers/墨蓝黑.svg":"assets/images/wallpapers/暗色系/墨蓝黑.svg","assets/images/wallpapers/墨黑画布.svg":"assets/images/wallpapers/画布/墨黑画布.svg","assets/images/wallpapers/声波.svg":"assets/images/wallpapers/物理/声波.svg","assets/images/wallpapers/实验室.svg":"assets/images/wallpapers/化学/实验室.svg","assets/images/wallpapers/山形橘.svg":"assets/images/wallpapers/图案纹理/山形橘.svg","assets/images/wallpapers/山林绿.svg":"assets/images/wallpapers/自然风景/山林绿.svg","assets/images/wallpapers/引力波.svg":"assets/images/wallpapers/物理/引力波.svg","assets/images/wallpapers/弦.svg":"assets/images/wallpapers/物理/弦.svg","assets/images/wallpapers/弹簧.svg":"assets/images/wallpapers/物理/弹簧.svg","assets/images/wallpapers/微生物.svg":"assets/images/wallpapers/生物/微生物.svg","assets/images/wallpapers/扇贝蓝.svg":"assets/images/wallpapers/图案纹理/扇贝蓝.svg","assets/images/wallpapers/抹茶绿.svg":"assets/images/wallpapers/画布/抹茶绿.svg","assets/images/wallpapers/斜纹蓝.svg":"assets/images/wallpapers/图案纹理/斜纹蓝.svg","assets/images/wallpapers/无机.svg":"assets/images/wallpapers/化学/无机.svg","assets/images/wallpapers/日出金.svg":"assets/images/wallpapers/壁纸（渐变）/日出金.svg","assets/images/wallpapers/春野绿.svg":"assets/images/wallpapers/自然风景/春野绿.svg","assets/images/wallpapers/晚霞红.svg":"assets/images/wallpapers/自然风景/晚霞红.svg","assets/images/wallpapers/晨雾紫.svg":"assets/images/wallpapers/自然风景/晨雾紫.svg","assets/images/wallpapers/晶体.svg":"assets/images/wallpapers/化学/晶体.svg","assets/images/wallpapers/暖橙黄昏.svg":"assets/images/wallpapers/壁纸（渐变）/暖橙黄昏.svg","assets/images/wallpapers/暖灰画布.svg":"assets/images/wallpapers/画布/暖灰画布.svg","assets/images/wallpapers/暗夜蓝.svg":"assets/images/wallpapers/暗色系/暗夜蓝.svg","assets/images/wallpapers/暗玫.svg":"assets/images/wallpapers/暗色系/暗玫.svg","assets/images/wallpapers/暗紫.svg":"assets/images/wallpapers/暗色系/暗紫.svg","assets/images/wallpapers/暮光橙.svg":"assets/images/wallpapers/壁纸（渐变）/暮光橙.svg","assets/images/wallpapers/暮山紫.svg":"assets/images/wallpapers/壁纸（渐变）/暮山紫.svg","assets/images/wallpapers/暮色橙.svg":"assets/images/wallpapers/自然风景/暮色橙.svg","assets/images/wallpapers/曜石.svg":"assets/images/wallpapers/暗色系/曜石.svg","assets/images/wallpapers/有机.svg":"assets/images/wallpapers/化学/有机.svg","assets/images/wallpapers/李暗紫.svg":"assets/images/wallpapers/暗色系/李暗紫.svg","assets/images/wallpapers/松夜.svg":"assets/images/wallpapers/暗色系/松夜.svg","assets/images/wallpapers/松涛绿.svg":"assets/images/wallpapers/自然风景/松涛绿.svg","assets/images/wallpapers/松石绿.svg":"assets/images/wallpapers/壁纸（渐变）/松石绿.svg","assets/images/wallpapers/极光绿（壁纸）.svg":"assets/images/wallpapers/壁纸（渐变）/极光绿（壁纸）.svg","assets/images/wallpapers/极光绿（自然风景）.svg":"assets/images/wallpapers/自然风景/极光绿（自然风景）.svg","assets/images/wallpapers/林夜绿.svg":"assets/images/wallpapers/暗色系/林夜绿.svg","assets/images/wallpapers/染色体.svg":"assets/images/wallpapers/生物/染色体.svg","assets/images/wallpapers/棋盘米.svg":"assets/images/wallpapers/图案纹理/棋盘米.svg","assets/images/wallpapers/棱镜分光.svg":"assets/images/wallpapers/物理/棱镜分光.svg","assets/images/wallpapers/横纹紫.svg":"assets/images/wallpapers/图案纹理/横纹紫.svg","assets/images/wallpapers/樱粉.svg":"assets/images/wallpapers/壁纸（渐变）/樱粉.svg","assets/images/wallpapers/橄榄.svg":"assets/images/wallpapers/商务简约/橄榄.svg","assets/images/wallpapers/正弦波.svg":"assets/images/wallpapers/物理/正弦波.svg","assets/images/wallpapers/气相.svg":"assets/images/wallpapers/化学/气相.svg","assets/images/wallpapers/沉淀.svg":"assets/images/wallpapers/化学/沉淀.svg","assets/images/wallpapers/沙漠金.svg":"assets/images/wallpapers/自然风景/沙漠金.svg","assets/images/wallpapers/沙金.svg":"assets/images/wallpapers/商务简约/沙金.svg","assets/images/wallpapers/波纹青.svg":"assets/images/wallpapers/图案纹理/波纹青.svg","assets/images/wallpapers/流体.svg":"assets/images/wallpapers/物理/流体.svg","assets/images/wallpapers/浅卡其.svg":"assets/images/wallpapers/画布/浅卡其.svg","assets/images/wallpapers/浅灰纸.svg":"assets/images/wallpapers/画布/浅灰纸.svg","assets/images/wallpapers/海湾蓝.svg":"assets/images/wallpapers/自然风景/海湾蓝.svg","assets/images/wallpapers/淡粉纸.svg":"assets/images/wallpapers/画布/淡粉纸.svg","assets/images/wallpapers/淡绿纸.svg":"assets/images/wallpapers/画布/淡绿纸.svg","assets/images/wallpapers/淡蓝纸.svg":"assets/images/wallpapers/画布/淡蓝纸.svg","assets/images/wallpapers/淡黄纸.svg":"assets/images/wallpapers/画布/淡黄纸.svg","assets/images/wallpapers/深海蓝（壁纸）.svg":"assets/images/wallpapers/壁纸（渐变）/深海蓝（壁纸）.svg","assets/images/wallpapers/深海蓝（暗色系）.svg":"assets/images/wallpapers/暗色系/深海蓝（暗色系）.svg","assets/images/wallpapers/深空黑.svg":"assets/images/wallpapers/暗色系/深空黑.svg","assets/images/wallpapers/深蓝星空.svg":"assets/images/wallpapers/壁纸（渐变）/深蓝星空.svg","assets/images/wallpapers/湖光蓝.svg":"assets/images/wallpapers/壁纸（渐变）/湖光蓝.svg","assets/images/wallpapers/湖面青.svg":"assets/images/wallpapers/自然风景/湖面青.svg","assets/images/wallpapers/溶液.svg":"assets/images/wallpapers/化学/溶液.svg","assets/images/wallpapers/滴定.svg":"assets/images/wallpapers/化学/滴定.svg","assets/images/wallpapers/灰夜.svg":"assets/images/wallpapers/暗色系/灰夜.svg","assets/images/wallpapers/灰蓝简约.svg":"assets/images/wallpapers/壁纸（渐变）/灰蓝简约.svg","assets/images/wallpapers/炭灰.svg":"assets/images/wallpapers/画布/炭灰.svg","assets/images/wallpapers/炭蓝.svg":"assets/images/wallpapers/暗色系/炭蓝.svg","assets/images/wallpapers/炭黑.svg":"assets/images/wallpapers/商务简约/炭黑.svg","assets/images/wallpapers/点阵灰.svg":"assets/images/wallpapers/图案纹理/点阵灰.svg","assets/images/wallpapers/烟灰.svg":"assets/images/wallpapers/商务简约/烟灰.svg","assets/images/wallpapers/烧瓶.svg":"assets/images/wallpapers/化学/烧瓶.svg","assets/images/wallpapers/热力学.svg":"assets/images/wallpapers/物理/热力学.svg","assets/images/wallpapers/煤黑.svg":"assets/images/wallpapers/暗色系/煤黑.svg","assets/images/wallpapers/燕麦画布.svg":"assets/images/wallpapers/画布/燕麦画布.svg","assets/images/wallpapers/牛皮纸.svg":"assets/images/wallpapers/画布/牛皮纸.svg","assets/images/wallpapers/玄武.svg":"assets/images/wallpapers/商务简约/玄武.svg","assets/images/wallpapers/玫瑰金.svg":"assets/images/wallpapers/画布/玫瑰金.svg","assets/images/wallpapers/珊瑚橘.svg":"assets/images/wallpapers/画布/珊瑚橘.svg","assets/images/wallpapers/珊瑚海.svg":"assets/images/wallpapers/自然风景/珊瑚海.svg","assets/images/wallpapers/珍珠.svg":"assets/images/wallpapers/商务简约/珍珠.svg","assets/images/wallpapers/球棍模型.svg":"assets/images/wallpapers/化学/球棍模型.svg","assets/images/wallpapers/生态网.svg":"assets/images/wallpapers/生物/生态网.svg","assets/images/wallpapers/电场.svg":"assets/images/wallpapers/物理/电场.svg","assets/images/wallpapers/电解.svg":"assets/images/wallpapers/化学/电解.svg","assets/images/wallpapers/电路.svg":"assets/images/wallpapers/物理/电路.svg","assets/images/wallpapers/病毒.svg":"assets/images/wallpapers/生物/病毒.svg","assets/images/wallpapers/相对论.svg":"assets/images/wallpapers/物理/相对论.svg","assets/images/wallpapers/石墨灰.svg":"assets/images/wallpapers/暗色系/石墨灰.svg","assets/images/wallpapers/石板.svg":"assets/images/wallpapers/商务简约/石板.svg","assets/images/wallpapers/砖纹灰.svg":"assets/images/wallpapers/图案纹理/砖纹灰.svg","assets/images/wallpapers/磁场线.svg":"assets/images/wallpapers/物理/磁场线.svg","assets/images/wallpapers/神经元.svg":"assets/images/wallpapers/生物/神经元.svg","assets/images/wallpapers/秋林金.svg":"assets/images/wallpapers/自然风景/秋林金.svg","assets/images/wallpapers/种子.svg":"assets/images/wallpapers/生物/种子.svg","assets/images/wallpapers/竖纹橘.svg":"assets/images/wallpapers/图案纹理/竖纹橘.svg","assets/images/wallpapers/竹海青.svg":"assets/images/wallpapers/自然风景/竹海青.svg","assets/images/wallpapers/米白.svg":"assets/images/wallpapers/商务简约/米白.svg","assets/images/wallpapers/粒子网.svg":"assets/images/wallpapers/物理/粒子网.svg","assets/images/wallpapers/紫夜.svg":"assets/images/wallpapers/暗色系/紫夜.svg","assets/images/wallpapers/紫粉梦幻.svg":"assets/images/wallpapers/壁纸（渐变）/紫粉梦幻.svg","assets/images/wallpapers/紫霞谷.svg":"assets/images/wallpapers/自然风景/紫霞谷.svg","assets/images/wallpapers/纯白画布.svg":"assets/images/wallpapers/画布/纯白画布.svg","assets/images/wallpapers/细格绿.svg":"assets/images/wallpapers/图案纹理/细格绿.svg","assets/images/wallpapers/细胞.svg":"assets/images/wallpapers/生物/细胞.svg","assets/images/wallpapers/网格米.svg":"assets/images/wallpapers/图案纹理/网格米.svg","assets/images/wallpapers/聚合.svg":"assets/images/wallpapers/化学/聚合.svg","assets/images/wallpapers/胭脂谷.svg":"assets/images/wallpapers/自然风景/胭脂谷.svg","assets/images/wallpapers/花粉.svg":"assets/images/wallpapers/生物/花粉.svg","assets/images/wallpapers/菌群.svg":"assets/images/wallpapers/生物/菌群.svg","assets/images/wallpapers/菱格紫.svg":"assets/images/wallpapers/图案纹理/菱格紫.svg","assets/images/wallpapers/葡萄紫.svg":"assets/images/wallpapers/壁纸（渐变）/葡萄紫.svg","assets/images/wallpapers/薄暮灰粉.svg":"assets/images/wallpapers/壁纸（渐变）/薄暮灰粉.svg","assets/images/wallpapers/薄荷原.svg":"assets/images/wallpapers/自然风景/薄荷原.svg","assets/images/wallpapers/薄荷青.svg":"assets/images/wallpapers/壁纸（渐变）/薄荷青.svg","assets/images/wallpapers/藏青.svg":"assets/images/wallpapers/商务简约/藏青.svg","assets/images/wallpapers/藕荷紫.svg":"assets/images/wallpapers/画布/藕荷紫.svg","assets/images/wallpapers/蘑菇.svg":"assets/images/wallpapers/生物/蘑菇.svg","assets/images/wallpapers/蜂巢灰.svg":"assets/images/wallpapers/图案纹理/蜂巢灰.svg","assets/images/wallpapers/蜜桃粉.svg":"assets/images/wallpapers/壁纸（渐变）/蜜桃粉.svg","assets/images/wallpapers/血夜红.svg":"assets/images/wallpapers/暗色系/血夜红.svg","assets/images/wallpapers/血液.svg":"assets/images/wallpapers/生物/血液.svg","assets/images/wallpapers/血管.svg":"assets/images/wallpapers/生物/血管.svg","assets/images/wallpapers/试管.svg":"assets/images/wallpapers/化学/试管.svg","assets/images/wallpapers/象牙纸.svg":"assets/images/wallpapers/画布/象牙纸.svg","assets/images/wallpapers/赤陶橙.svg":"assets/images/wallpapers/壁纸（渐变）/赤陶橙.svg","assets/images/wallpapers/进化树.svg":"assets/images/wallpapers/生物/进化树.svg","assets/images/wallpapers/透镜.svg":"assets/images/wallpapers/物理/透镜.svg","assets/images/wallpapers/酒红.svg":"assets/images/wallpapers/商务简约/酒红.svg","assets/images/wallpapers/酒红暗.svg":"assets/images/wallpapers/暗色系/酒红暗.svg","assets/images/wallpapers/酶.svg":"assets/images/wallpapers/生物/酶.svg","assets/images/wallpapers/量子场.svg":"assets/images/wallpapers/物理/量子场.svg","assets/images/wallpapers/钢蓝.svg":"assets/images/wallpapers/商务简约/钢蓝.svg","assets/images/wallpapers/钴蓝.svg":"assets/images/wallpapers/商务简约/钴蓝.svg","assets/images/wallpapers/银河夜.svg":"assets/images/wallpapers/自然风景/银河夜.svg","assets/images/wallpapers/锯齿粉.svg":"assets/images/wallpapers/图案纹理/锯齿粉.svg","assets/images/wallpapers/陀螺.svg":"assets/images/wallpapers/物理/陀螺.svg","assets/images/wallpapers/陶土.svg":"assets/images/wallpapers/商务简约/陶土.svg","assets/images/wallpapers/雪原白.svg":"assets/images/wallpapers/自然风景/雪原白.svg","assets/images/wallpapers/雾蓝.svg":"assets/images/wallpapers/商务简约/雾蓝.svg","assets/images/wallpapers/雾霾绿.svg":"assets/images/wallpapers/画布/雾霾绿.svg","assets/images/wallpapers/雾霾蓝.svg":"assets/images/wallpapers/画布/雾霾蓝.svg","assets/images/wallpapers/青灰.svg":"assets/images/wallpapers/商务简约/青灰.svg","assets/images/wallpapers/青绿山水.svg":"assets/images/wallpapers/壁纸（渐变）/青绿山水.svg","assets/images/wallpapers/靛夜.svg":"assets/images/wallpapers/暗色系/靛夜.svg","assets/images/wallpapers/靛峰蓝.svg":"assets/images/wallpapers/自然风景/靛峰蓝.svg","assets/images/wallpapers/靛蓝.svg":"assets/images/wallpapers/壁纸（渐变）/靛蓝.svg","assets/images/wallpapers/靛青.svg":"assets/images/wallpapers/商务简约/靛青.svg","assets/images/wallpapers/骨骼.svg":"assets/images/wallpapers/生物/骨骼.svg","assets/images/wallpapers/高级灰.svg":"assets/images/wallpapers/商务简约/高级灰.svg","assets/images/wallpapers/麦田金.svg":"assets/images/wallpapers/自然风景/麦田金.svg","assets/images/wallpapers/黑青.svg":"assets/images/wallpapers/暗色系/黑青.svg","assets/images/wallpapers/黛绿.svg":"assets/images/wallpapers/商务简约/黛绿.svg"}
        const migrateUrl = (url) => url && WALLPAPER_URL_MIGRATION[url] ? WALLPAPER_URL_MIGRATION[url] : url;
        // 旧数据迁移：壁纸文件全面中文化后，旧 URL 自动转换
        const migrateWallpaperData = () => {
            // 1) 自定义壁纸缺 pos 时按所属分组推断
            if (data.customWallpapers && data.customWallpapers.length) {
                data.customWallpapers.forEach(w => {
                    if (!w.pos) w.pos = liveGroupPos(w.group)[0];
                    if (w.url) w.url = migrateUrl(w.url);
                });
            }
            // 2) 背景配置中的旧 URL 迁移到新中文路径
            if (data.background && data.background.url) data.background.url = migrateUrl(data.background.url);
            if (data.bottomBackground && data.bottomBackground.url) data.bottomBackground.url = migrateUrl(data.bottomBackground.url);
            if (data.footerBackground && data.footerBackground.url) data.footerBackground.url = migrateUrl(data.footerBackground.url);
        };
        // 旧数据迁移：移除「闪烁背景」类型（type==='blink'），统一改为关闭，闪烁效果今后只作用于插入的图片
        const migrateAdSlots = () => {
            if (!data.adSlots) return;
            ['left', 'right'].forEach(side => {
                (data.adSlots[side] || []).forEach(s => {
                    if (s && s.type === 'blink') s.type = 'none';
                });
            });
        };
        const isBuiltinGroup = (key) => BG_BUILTIN_KEYS.includes(key);
        // 全部壁纸 = 内置 + 用户自定义（壁纸库），供预设选择与壁纸库列表使用
        // 按 wallpaperOrder 排序；order 为空或某 key 不在 order 中时落到末尾，保持默认顺序
        const allWallpapers = computed(() => {
            const list = builtinWallpapers.value.concat(data.customWallpapers || []);
            const order = data.wallpaperOrder || [];
            if (!order.length) return list;
            const rank = (w) => {
                const k = w.id || w.url;
                const i = order.indexOf(k);
                return i < 0 ? Number.MAX_SAFE_INTEGER : i;
            };
            return list.slice().sort((a, b) => rank(a) - rank(b));
        });
        const openBgConfig = () => {
            if (!data.background) {
                data.background = { type: 'image', url: 'assets/images/wallpapers/壁纸（渐变）/深蓝星空.svg' };
            }
            if (!data.bottomBackground) {
                data.bottomBackground = { type: 'image', url: 'assets/images/wallpapers/壁纸（渐变）/青绿山水.svg' };
            }
            if (!data.footerBackground) {
                data.footerBackground = { type: 'none', url: '' };
            }
            // mode 仅控制弹窗内显示哪个预设分组（canvas / wallpaper），不写入导出；
            // 按已选 URL 推断以恢复上次选择，未选时默认 canvas（画布分组）
            const inferMode = (f) => {
                const hit = allWallpapers.value.find(p => p.url === f.url);
                return hit ? hit.group : 'canvas';
            };
            data.background.mode = inferMode(data.background);
            data.bottomBackground.mode = inferMode(data.bottomBackground);
            data.footerBackground.mode = inferMode(data.footerBackground);
            // 打开弹窗时确保各位置都有背景：
            // 避免"选了分组没点壁纸 / 什么都没动直接完成"导致底部壁纸设置无效。
            // 关键修复：不再保留「无背景」粘性开关——每次打开都重新评估，
            // 使页脚背景永不静默为空；「无背景」按钮仅在当次弹窗会话内生效
            // （关闭后再打开会被自动预选覆盖，用户若想保留透明需再次点击）。
            ['top', 'bottom', 'footer'].forEach(pos => {
                const field = pos === 'bottom' ? data.bottomBackground : (pos === 'footer' ? data.footerBackground : data.background);
                field._userCleared = false;   // 重置：避免上一会话点过「无背景」永久阻止自动预选
                if (field.type && field.type !== 'none' && field.url) return;     // 已有背景，不覆盖
                const allowed = groupsForPos(pos).map(g => g.key);
                if (!allowed.includes(field.mode)) field.mode = allowed[0] || 'canvas';
                const candidates = allWallpapers.value.filter(x => x.group === field.mode && wpPos(x) === pos);
                if (candidates.length > 0) applyBgPreset(pos, candidates[0]);
            });
            modal.bgConfig = true;
        };
        // target: 'top' = 顶部搜索栏背景；'bottom' = 中部卡片区；'footer' = 底部版权条背景
        const applyBgPreset = (target, preset) => {
            const field = target === 'bottom' ? data.bottomBackground : (target === 'footer' ? data.footerBackground : data.background);
            field.type = preset.type || 'image';
            field.url = preset.url;
            delete field._userCleared;   // 用户主动选了壁纸，取消「无背景」标记
            persistData({ mark: true, silent: true })
        };
        // 将某位置背景设为「无背景（透明）」，并标记为用户主动清空（打开弹窗时不再自动预选）
        const clearBgPreset = (target) => {
            const field = target === 'bottom' ? data.bottomBackground : (target === 'footer' ? data.footerBackground : data.background);
            field.type = 'none';
            field.url = '';
            field._userCleared = true;
            persistData({ mark: true, silent: true })
        };
        // 当背景类型分组切换且当前未设置壁纸时，自动选择该分组下该位置的第一张壁纸，
        // 避免用户只选分组不点具体壁纸导致"设置后无效"。
        const applyFirstBgPreset = (pos) => {
            const field = pos === 'bottom' ? data.bottomBackground : (pos === 'footer' ? data.footerBackground : data.background);
            if (field.type && field.type !== 'none' && field.url) return; // 已有设置，不覆盖
            const mode = field.mode;
            if (!mode) return;
            const candidates = allWallpapers.value.filter(x => x.group === mode && wpPos(x) === pos);
            if (candidates.length > 0) applyBgPreset(pos, candidates[0]);
        };

        // ===== 壁纸库：管理内置+自定义壁纸，支持增加/删除 =====
        const wpLib = reactive({ name: '', mode: 'wallpaper', pos: 'top', url: '', fileName: '', source: 'upload', dragFrom: null, dragOver: null, newGroupName: '', groupDragFrom: null, groupDragOver: null, groupDropPos: null });
        const openWallpaperLibrary = () => {
            if (!data.customWallpapers) data.customWallpapers = [];
            if (!wpLib.pos) wpLib.pos = 'top';
            // 当前分类需属于当前位置，否则重置为该位置首个分类
            if (!groupsForPos(wpLib.pos).some(g => g.key === wpLib.mode)) {
                const first = groupsForPos(wpLib.pos)[0];
                wpLib.mode = first ? first.key : 'canvas';
            }
            wpLib.name = ''; wpLib.url = ''; wpLib.source = 'upload';
            modal.wallpaperLibrary = true;
        };
        // 按位置过滤分组（兼容 pos 数组或单值）；壁纸库与背景配置三块共用
        const groupsForPos = (pos) => {
            return bgPresetGroups.value.filter(g => {
                const ps = Array.isArray(g.pos) ? g.pos : (g.pos ? [g.pos] : ['top']);
                return ps.includes(pos);
            });
        };
        // 壁纸的有效位置（兼容旧数据无 pos 时按所属分组当前 pos 推断）
        const wpPos = (w) => {
            if (w && w.pos) return w.pos;
            const arr = liveGroupPos(w && w.group) || ['top'];
            return arr[0];
        };
        // 切换壁纸库一级位置标签：同步把当前分类重置为该位置下的首个分类
        const setWpPos = (pos) => {
            wpLib.pos = pos;
            const allowed = groupsForPos(pos).map(g => g.key);
            if (!allowed.includes(wpLib.mode)) wpLib.mode = allowed[0] || 'canvas';
        };
        const onWallpaperFileChange = (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            wpLib.fileName = file.name;
            const reader = new FileReader();
            reader.onload = () => { wpLib.url = reader.result; };
            reader.readAsDataURL(file);
        };
        const addCustomWallpaper = () => {
            const url = (wpLib.url || '').trim();
            const name = (wpLib.name || '').trim() || '自定义壁纸';
            if (!url) return;
            if (wpLib.source === 'url') {
                // URL 跨域图片无法 canvas 裁剪，直接落库（访客页用 cover 自适应）
                pushCustomWallpaper(url, name);
                showToast('已添加壁纸', 'success');
            } else {
                // 上传图片：弹裁剪器，按当前位置比例裁剪后再落库
                openWallpaperCropper(url, 'upload');
            }
        };
        // 真正写入自定义壁纸并清空上传区（group/pos 可覆盖，默认取当前壁纸库位置）
        const pushCustomWallpaper = (url, name, group, pos) => {
            if (!data.customWallpapers) data.customWallpapers = [];
            data.customWallpapers.push({ id: 'wp_' + Date.now(), name: name || '自定义壁纸', group: group || wpLib.mode, pos: pos || wpLib.pos, type: 'image', url });
            persistData({ mark: true, silent: true });
            wpLib.name = ''; wpLib.url = ''; wpLib.fileName = '';
        };
        // 壁纸按位置的目标输出尺寸（宽×高）
        const WP_POS_SIZES = { top: [1600, 500], bottom: [1600, 700], footer: [1600, 300] };
        // 打开壁纸裁剪器：复用视口裁剪模式（与广告位一致），默认按当前位置比例
        const openWallpaperCropper = (src, mode) => {
            const ctx = editForm.imageCropper;
            ctx.open = true;
            ctx.target = 'wallpaper';
            ctx.tabIdx = -1;
            ctx.engIdx = -1;
            ctx.siteStyleMode = true;
            ctx.isCircleMode = true;       // 复用视口拖拽交互
            ctx.shape = 'square';          // 壁纸固定方形
            ctx.sourceImage = '';
            ctx.fileName = '';
            ctx.fileType = '';
            ctx.crop = { x: 0, y: 0, w: 0, h: 0 };
            ctx.imgSize = { w: 0, h: 0 };
            ctx._imgEl = null;
            ctx.output = 'square';
            const _sel = WP_POS_SIZES[wpLib.pos] || WP_POS_SIZES.top;
            ctx.outputSizeW = _sel[0];
            ctx.outputSizeH = _sel[1];
            ctx.aspectRatio = 'output';    // 默认与输出尺寸比例一致（顶部/底部/页脚）
            ctx.lockRatio = true;
            ctx.outputFormat = 'auto';
            ctx.svgText = '';
            ctx.urlValue = '';
            ctx.rotation = 0;
            ctx.imgTranslateX = 0;
            ctx.imgTranslateY = 0;
            ctx.imgScale = 1;
            ctx.viewportSize = 320;
            ctx.circleDragState = { active: false, startX: 0, startY: 0, startTx: 0, startTy: 0 };
            ctx.vpCrop = { x: 23, y: 32, w: 274, h: 71 };
            ctx.vpCropDrag = { active: false, mode: '', startX: 0, startY: 0, startCrop: null };
            ctx.wpPending = { name: (wpLib.name || '').trim() || '自定义壁纸', group: wpLib.mode, pos: wpLib.pos };
            ctx.wpPosRatio = wpLib.pos;
            const v = src || '';
            if (!v) { modal.imageCropper = true; return; }
            ctx.urlValue = v;
            ctx.sourceImage = '';
            const img = new Image();
            const _fit = () => {
                ctx.sourceImage = v;
                ctx._imgEl = img;
                ctx.imgSize = { w: img.naturalWidth, h: img.naturalHeight };
                const vp = ctx.viewportSize;
                const ratio = Math.min(vp / img.naturalWidth, vp / img.naturalHeight, 1);
                ctx._dispW = Math.round(img.naturalWidth * ratio);
                ctx._dispH = Math.round(img.naturalHeight * ratio);
                ctx.imgScale = 1;
                ctx.imgTranslateX = Math.round((vp - ctx._dispW) / 2);
                ctx.imgTranslateY = Math.round((vp - ctx._dispH) / 2);
                initVpCropBox(ctx);
                updateCropPreview();
            };
            img.onload = _fit;
            img.onerror = () => {
                ctx._dispW = 240; ctx._dispH = 240;
                ctx.imgTranslateX = Math.round((ctx.viewportSize - 240) / 2);
                ctx.imgTranslateY = Math.round((ctx.viewportSize - 240) / 2);
            };
            img.src = v;
            if (img.complete && img.naturalWidth > 0) _fit();
            modal.imageCropper = true;
            deferredInitVpCrop();
        };
        // 切换壁纸裁剪比例（顶部/底部/页脚）：同步输出尺寸并重置裁剪框比例
        const setWallpaperPosRatio = (pos) => {
            const ctx = editForm.imageCropper;
            const _s = WP_POS_SIZES[pos] || WP_POS_SIZES.top;
            ctx.outputSizeW = _s[0];
            ctx.outputSizeH = _s[1];
            ctx.aspectRatio = 'output';
            ctx.lockRatio = true;
            ctx.wpPosRatio = pos;
            if (ctx.wpPending) ctx.wpPending.pos = pos;   // 切换到某位置比例时，壁纸也归入该位置
            if (ctx._imgEl) initVpCropBox(ctx);
            updateCropPreview();
        };
        const deleteCustomWallpaper = (id) => {
            if (!data.customWallpapers) return;
            const idx = data.customWallpapers.findIndex(w => w.id === id);
            if (idx < 0) return;
            const removed = data.customWallpapers[idx];
            data.customWallpapers.splice(idx, 1);
            // 同步从排序序列移除该 key
            if (data.wallpaperOrder && data.wallpaperOrder.length) {
                data.wallpaperOrder = data.wallpaperOrder.filter(k => k !== id);
            }
            // 若某区域正在使用被删壁纸，重置为画布（无背景图），避免引用失效
            ['background', 'bottomBackground', 'footerBackground'].forEach(k => {
                const f = data[k];
                if (f && f.url === removed.url) { f.type = 'none'; f.url = ''; f.mode = 'canvas'; }
            });
            persistData({ mark: true, silent: true });
        };
        // 壁纸拖拽排序：把 fromKey 插入到 toKey 的位置（仅在「同分组」内部生效，
        // 避免切换分组后不同分组互相穿插错位）。key = 内置 url / 自定义 id。
        const reorderWallpaper = (fromKey, toKey) => {
            if (!fromKey || !toKey || fromKey === toKey) return;
            const list = allWallpapers.value;
            if (list.length < 2) return;
            const keys = list.map(w => w.id || w.url);
            // 确保 order 覆盖当前全部 key（旧数据或未排序时补齐）
            const cur = (data.wallpaperOrder && data.wallpaperOrder.length)
                ? data.wallpaperOrder.filter(k => keys.includes(k))
                : [];
            keys.forEach(k => { if (!cur.includes(k)) cur.push(k); });
            const groupOf = (k) => (list.find(w => (w.id || w.url) === k) || {}).group;
            const fromGroup = groupOf(fromKey);
            // 仅允许同分组内拖拽
            if (fromGroup !== groupOf(toKey)) return;
            // 取本分组 key 子序列，删除 from、插入到 to 的位置
            const groupKeys = cur.filter(k => groupOf(k) === fromGroup);
            const fi = groupKeys.indexOf(fromKey);
            const ti = groupKeys.indexOf(toKey);
            if (fi < 0 || ti < 0) return;
            // 直接交换两个位置（与落点行互换，其余不动）
            const tmp = groupKeys[fi];
            groupKeys[fi] = groupKeys[ti];
            groupKeys[ti] = tmp;
            // 用「非本分组 key 保持原位 + 本分组按新顺序回填」重建整体 order
            let gp = 0;
            const rebuilt = cur.map(k => groupOf(k) === fromGroup ? groupKeys[gp++] : k);
            data.wallpaperOrder = rebuilt;
            persistData({ mark: true, silent: true });
        };
        // 拖拽事件处理
        const onWallpaperDragStart = (key) => { wpLib.dragFrom = key; };
        const onWallpaperDragOver = (key) => { wpLib.dragOver = key; };
        const onWallpaperDrop = (key) => {
            reorderWallpaper(wpLib.dragFrom, key);
            wpLib.dragFrom = null; wpLib.dragOver = null;
        };
        const onWallpaperDragEnd = () => { wpLib.dragFrom = null; wpLib.dragOver = null; };

        // ===== 页脚菜单拖拽排序（前三个：网站提交 / 友情链接 / 关于导航）=====
        // 顺序存于 data.footerMenuOrder，编辑器中拖拽后同步访客页左下角（由 Generator 按此顺序渲染）
        const footerDraggingKey = ref(null);
        // 关于页模板（多模板切换）：availableTemplates 为 template/ 下可用模板名列表
        const availableTemplates = ref([]);
        // 页脚菜单模板选择器仅显示「页脚」文件夹下的模板
        const footerAvailableTemplates = computed(() => {
            return (availableTemplates.value || []).filter(t => String(t).startsWith('页脚/'));
        });
        const loadAvailableTemplates = async () => {
            try {
                // 确保 data.about 存在且含 template 字段（下拉框绑定时需要）
                if (!data.about || typeof data.about !== 'object') data.about = {};
                // 迁移：旧数据将模板名存为裸名（关于导航/网站提交），移入「页脚」后统一加前缀
                if (data.about && (data.about.template === '关于导航' || data.about.template === '网站提交')) {
                    data.about.template = '页脚/' + data.about.template;
                }
                if (!data.about.template) data.about.template = '页脚/关于导航';
                const res = await fetch('/api/templates');
                if (res.ok) {
                    const j = await res.json();
                    const list = Array.isArray(j.templates) ? j.templates : [];
                    availableTemplates.value = list;
                    // 校正：若当前选中的模板不在列表中（如被删），优先回退「页脚/关于导航」，其次列表首个
                    const cur = (data.about && data.about.template) || '页脚/关于导航';
                    if (list.length && list.indexOf(cur) < 0) {
                        const fallback = list.includes('页脚/关于导航') ? '页脚/关于导航' : (list[0] || '页脚/关于导航');
                        data.about.template = fallback;
                    }
                }
            } catch (e) { /* 离线/旧服务器时忽略，使用默认 */ }
        };
        // 页脚文件保存目录：有“正在编辑的历史版本”时，保存到该版本部署目录 web/<siteId>/<versionId>/deploy1/footer；
        // 否则回退根 footer/（仅作无版本兜底，正常编辑流程必有版本）。
        const getFooterDeployBase = () => {
            const siteId = Storage.getCurrentProfileId();
            let vid = currentEditingVersionId.value;
            // 优先用持久化的“当前编辑版本”，避免切换站点/版本后 ref 尚未同步时，
            // 页脚保存静默落到最新版本而非用户正在编辑的版本。
            if (!vid && data.currentVersionId) vid = data.currentVersionId;
            // 兜底：若当前未显式选中版本，回退该站点最新版本，避免页脚写入根 footer/（旧路径，已非预期）
            if (!vid && versions.value && versions.value.length) {
                const sorted = [...versions.value].sort((a, b) => b.timestamp - a.timestamp);
                vid = sorted[0].id;
            }
            if (siteId && vid) {
                return 'web/' + siteId + '/' + vid + '/deploy1/footer';
            }
            return 'footer';
        };
        // 把“版本部署目录内的绝对-相对路径”（web/<site>/<version>/deploy1/footer/about.html）
        // 转回“部署目录内的相对路径”（footer/about.html），供页脚链接 / 导出使用。
        const toDeployRelative = (p) => {
            if (!p) return p;
            const m = String(p).match(/^web\/[^/]+\/[^/]+\/deploy\d+\/(.+)$/);
            return m ? m[1] : p;
        };
        // 把页脚菜单里编辑的“部署内相对链接”（如 footer/test.html、about/me.html）映射为
        // 版本部署目录下的完整保存路径（web/<site>/<version>/deploy1/...），供副编辑器打开/保存；
        // 外链/绝对路径原样返回，由调用方判断是否可用作保存路径。
        const toDeployFilePath = (rel) => {
            if (!rel) return '';
            let p = String(rel).trim().replace(/\\/g, '/').replace(/^\.\//, '');
            if (/^(https?:|mailto:|tel:|#|\/)/.test(p)) return p;
            // 旧数据可能只存了裸文件名（如 commit.html），统一按页脚目录处理
            if (p.indexOf('/') < 0) p = 'footer/' + p;
            const deployRoot = getFooterDeployBase().replace(/\/footer$/, '');
            return deployRoot + '/' + p;
        };

        // 生成自包含部署用 footer/about.html 并落盘（供页脚链接 / 桌面端按钮 / 导出直接复用）
        const saveDeployedAbout = async () => {
            try {
                if (!data.about || !data.about.sections) return;
                const html = Generator.generateAboutDeployed(data);
                if (!html) return;
                // 注入 base 标签（置于 <head> 内），确保 footer/ 子目录下资源（./assets/、./footer/）正确解析
                const baseHref = window.location.origin + '/';
                const finalHtml = html.replace(/<head>/i, '<head>\n    <base href="' + baseHref + '">');
                await fetch('/api/save-about', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ html: finalHtml, path: getFooterDeployBase() + '/about.html' })
                }).catch(() => {});
            } catch (e) { /* 忽略：编辑器内自动落盘失败不影响编辑 */ }
        };
        const onAboutTemplateChange = () => {
            if (!data.about.template) data.about.template = '页脚/关于导航';
            persistData({ mark: true, silent: true });
            // 同步通知桌面端打开按钮（写入选中模板，供 launcher.py open_about 读取）
            try {
                fetch('/api/about-template', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ template: data.about.template })
                }).catch(() => {});
            } catch (e) {}
            // 模板切换后，重新生成部署用 footer/index.html（内容一致，仅保持同步）
            saveDeployedAbout();
        };
        const footerMenuButtons = computed(() => {
            const order = (Array.isArray(data.footerMenuOrder) && data.footerMenuOrder.length)
                ? data.footerMenuOrder
                : ['mk-submit', 'mk-friend', 'about-link'];
            const fm = (data.footerFixedMeta && typeof data.footerFixedMeta === 'object') ? data.footerFixedMeta : {};
            const defaults = {
                'about-link': { icon: 'fa fa-info-circle', text: '关于导航' },
                'mk-submit': { icon: 'fas fa-paper-plane', text: '网站提交' },
                'mk-friend': { icon: 'fas fa-link', text: '友情链接' }
            };
            const fixedMeta = (k) => fm[k] || defaults[k] || { icon: 'fas fa-link', text: k };
            const fixedMap = {
                'mk-submit': { key: 'mk-submit', title: '编辑网站提交页面', action: 'openCommit' },
                'mk-friend': { key: 'mk-friend', title: '友情链接管理', action: 'openFriendLinks' },
                'about-link': { key: 'about-link', title: '编辑关于导航页面', action: 'openAbout' }
            };
            const customItems = Array.isArray(data.footerMenuItems) ? data.footerMenuItems : [];
            return order.map(k => {
                if (fixedMap[k]) {
                    const m = fixedMeta(k);
                    return { key: k, icon: m.icon, text: m.text, iconColor: m.iconColor || '#b2b8be', title: (m.text || '菜单') + '（点击打开）', action: fixedMap[k].action, custom: false };
                }
                const custom = customItems.find(it => it.id === k);
                if (custom) return { key: custom.id, icon: custom.icon || 'fas fa-link', text: custom.text, iconColor: custom.iconColor || '#b2b8be', title: (custom.text || '自定义菜单') + '（点击打开链接）', action: 'openCustom', custom: true };
                return null;
            }).filter(Boolean);
        });
        const onFooterBtnClick = (key) => {
            const fixedMeta = (data.footerFixedMeta && typeof data.footerFixedMeta === 'object') ? data.footerFixedMeta : {};
            if (key === 'mk-submit') {
                const meta = fixedMeta['mk-submit'] || {};
                if (meta.template) {
                    // 尊重编辑后的“链接位置”：相对链接映射到版本部署目录，外链/缺省回退 commit.html
                    const dp0 = toDeployFilePath(meta.url || '');
                    const dp = (dp0 && dp0.indexOf('web/') === 0) ? dp0 : (getFooterDeployBase() + '/commit.html');
                    openAboutInTab(key, dp, meta.text || '网站提交', meta.template);
                } else {
                    openCommit();
                }
            } else if (key === 'mk-friend') {
                const meta = fixedMeta['mk-friend'] || {};
                if (meta.template) {
                    const dp0 = toDeployFilePath(meta.url || '');
                    const dp = (dp0 && dp0.indexOf('web/') === 0) ? dp0 : (getFooterDeployBase() + '/friend.html');
                    openAboutInTab(key, dp, meta.text || '友情链接', meta.template);
                } else {
                    openFriendLinks();
                }
            } else if (key === 'about-link') {
                // 关于导航：编辑后的相对链接位置优先（映射到版本部署目录）；
                // 外链/锚点/缺省时指向“当前版本部署目录”下的 footer/about.html
                const aboutUrlRaw = (data.site && data.site.aboutLink && data.site.aboutLink.url && data.site.aboutLink.url.trim()) ? data.site.aboutLink.url.trim() : '';
                const dp0 = toDeployFilePath(aboutUrlRaw);
                const aboutUrl = (dp0 && dp0.indexOf('web/') === 0) ? dp0 : (getFooterDeployBase() + '/about.html');
                const aboutLabel = (data.site && data.site.aboutLink && data.site.aboutLink.text) ? data.site.aboutLink.text.trim() : '关于导航';
                // 若固定项上单独保存了模板，优先使用；否则回退全局 about 模板
                const meta = fixedMeta['about-link'] || {};
                const tpl = meta.template || ((data.about && data.about.template) ? data.about.template : '页脚/关于导航');
                openAboutInTab('about-link', aboutUrl, aboutLabel, tpl);
            }
            else {
                const custom = (Array.isArray(data.footerMenuItems) ? data.footerMenuItems : []).find(it => it.id === key);
                if (custom && custom.template) {
                    // 关联了模板：打开对应模板编辑器（与“关于导航”入口一致），尊重编辑后的链接位置
                    const dp0 = toDeployFilePath(custom.url || '');
                    const dp = (dp0 && dp0.indexOf('web/') === 0) ? dp0 : (getFooterDeployBase() + '/' + (custom.id || 'custom') + '.html');
                    const btnLabel = (custom.text && custom.text.trim()) ? custom.text.trim() : '';
                    openAboutInTab(key, dp, btnLabel, custom.template);
                } else if (custom && custom.url) {
                    window.open(custom.url, custom.target || '_blank');
                }
            }
        };
        // ─── 页脚即时拖拽（与分类树同一套方案：mousedown + 实时重排）───
        let _fd = null; // { key, dragging }
        const _onFooterDragMove = (event) => {
            const d = _fd; if (!d) return;
            if (!d.dragging) {
                d.dragging = true; footerDraggingKey.value = d.key;
                document.body.style.userSelect = 'none';
                document.body.style.cursor = 'grabbing';
            }
            event.preventDefault();
            const wraps = document.querySelectorAll('.footer-drag-wrap');
            const arr = data.footerMenuOrder;
            const n = arr.length; if (n <= 1) return;
            const curIdx = arr.indexOf(d.key); if (curIdx < 0) return;
            let targetIdx = -1, after = true;
            for (let i = 0; i < wraps.length; i++) {
                const w = wraps[i];
                const key = w.querySelector('.footer-drag-btn')?.getAttribute('data-footer-key') || '';
                if (key === d.key) continue;
                const rect = w.getBoundingClientRect();
                if (event.clientY < rect.top + rect.height * 0.5) {
                    targetIdx = i; after = false; break;
                }
                targetIdx = i; after = true;
            }
            if (targetIdx < 0) return;
            let ins = targetIdx;
            if (ins > curIdx) ins -= 1;
            if (after) ins += 1;
            if (ins < 0) ins = 0; if (ins > n - 1) ins = n - 1;
            if (ins === curIdx) return;
            const dragged = arr.splice(curIdx, 1)[0];
            if (ins > arr.length) ins = arr.length;
            arr.splice(ins, 0, dragged);
            persistData({ mark: true, silent: true });
        };

        const _onFooterDragUp = () => {
            const d = _fd;
            if (d?.dragging) { persistData({ mark: true, silent: true }); _suppressNextClick(); }
            _fd = null; footerDraggingKey.value = null;
            document.removeEventListener('mousemove', _onFooterDragMove);
            document.removeEventListener('mouseup', _onFooterDragUp);
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        };

        const onFooterMousedown = (key, event) => {
            if (event.button !== 0) return;
            _fd = { key, dragging: false };
            document.addEventListener('mousemove', _onFooterDragMove);
            document.addEventListener('mouseup', _onFooterDragUp);
        };
        // 重新生成访客页并刷新已打开的访客窗口（about:blank 同源，直接重写文档 + storage 信标双保险）
        const refreshVisitor = () => {
            try {
                const { html, svCommitUrl } = buildVisitorPage(data);
                window.__svCommitUrl = svCommitUrl;
                window.__navEditorVisitorHtml = html;
                try { window.localStorage.setItem('__navEditorVisitorRefresh', String(Date.now())); } catch (e2) {}
                const win = window.__navEditorVisitorWin;
                if (win && !win.closed) {
                    try { writeVisitorDoc(win, html); } catch (e3) {}
                }
            } catch (e) { /* ignore */ }
        };
        // ===== 页脚自定义菜单：添加 / 删除（可参与拖拽排序，同步访客页左下角）=====
        const footerMenuForm = reactive({ text: '', icon: '', iconColor: '#b2b8be', url: '', target: '_blank', template: '' });
        const pickFooterFile = () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.html';
            input.style.display = 'none';
            input.addEventListener('change', async (event) => {
                const file = event.target && event.target.files && event.target.files[0];
                if (!file) { input.remove(); return; }
                const formData = new FormData();
                formData.append('file', file);
                try {
                    const resp = await fetch('/api/upload-footer-html', { method: 'POST', body: formData });
                    if (!resp.ok) { showToast('上传失败', 'error'); input.remove(); return; }
                    const result = await resp.json();
                    if (result.ok && result.relative) {
                        if (modal.addFooterMenu) footerMenuForm.url = result.relative;
                        else if (modal.editFooterMenu) footerEditForm.url = result.relative;
                        showToast('已上传：' + result.relative, 'success');
                    } else {
                        showToast('上传失败：' + (result.error || '未知错误'), 'error');
                    }
                } catch (e) {
                    showToast('上传文件失败', 'error');
                }
                input.remove();
            });
            document.body.appendChild(input);
            input.click();
        };
        const pickTemplateFile = () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.webkitdirectory = true;
            input.directory = true;
            input.addEventListener('change', (event) => {
                const files = event.target && event.target.files;
                if (!files || files.length === 0) { input.remove(); return; }
                const relativePath = files[0].webkitRelativePath || '';
                const folderName = relativePath.split('/')[0];
                const list = availableTemplates.value || [];
                if (folderName && list.includes(folderName)) {
                    if (modal.editFooterMenu) {
                        footerEditForm.template = folderName;
                    } else if (modal.addFooterMenu) {
                        footerMenuForm.template = folderName;
                    } else {
                        data.about.template = folderName;
                        onAboutTemplateChange();
                    }
                    showToast('已选择模板：' + folderName, 'success');
                } else if (folderName) {
                    showToast('模板 "' + folderName + '" 不在可用列表中', 'warning');
                } else {
                    showToast('无法识别模板名称', 'warning');
                }
                input.remove();
            });
            document.body.appendChild(input);
            input.click();
        };
        const openAddFooterMenu = () => {
            footerMenuForm.text = ''; footerMenuForm.icon = ''; footerMenuForm.iconColor = '#b2b8be'; footerMenuForm.url = ''; footerMenuForm.target = '_blank'; footerMenuForm.template = '';
            modal.addFooterMenu = true;
        };
        const saveFooterMenu = () => {
            const text = (footerMenuForm.text || '').trim();
            const url = (footerMenuForm.url || '').trim();
            if (!text) { showToast('请填写菜单名称', 'warning'); return; }
            if (!url) { showToast('请填写链接地址', 'warning'); return; }
            const id = 'fm_' + Date.now();
            const items = (Array.isArray(data.footerMenuItems) ? data.footerMenuItems : []).slice();
            items.push({ id, text, icon: (footerMenuForm.icon || '').trim() || 'fas fa-link', iconColor: (footerMenuForm.iconColor || '').trim() || '#b2b8be', url, target: footerMenuForm.target || '_blank', template: (footerMenuForm.template || '').trim() });
            data.footerMenuItems = items;
            const order = (Array.isArray(data.footerMenuOrder) && data.footerMenuOrder.length)
                ? data.footerMenuOrder.slice()
                : ['mk-submit', 'mk-friend', 'about-link'];
            order.push(id);
            data.footerMenuOrder = order;
            persistData({ mark: true, silent: true });
            modal.addFooterMenu = false;
            showToast('已添加页脚菜单', 'success');
            refreshVisitor();
        };
        const removeFooterItem = (id) => {
            if (!id) return;
            const item = (Array.isArray(data.footerMenuItems) ? data.footerMenuItems : []).find(it => it.id === id);
            let label = (item && item.text) ? item.text : '';
            if (!label) {
                const fm = (data.footerFixedMeta && data.footerFixedMeta[id]) || {};
                label = fm.text || '';
            }
            if (!label) label = '该菜单';
            askConfirm({
                title: '删除页脚菜单',
                message: `确定要删除页脚菜单「${label}」吗？`,
                note: '删除后访客页面左下角将不再显示该菜单，此操作不可恢复。',
                onConfirm: () => {
                    data.footerMenuItems = (Array.isArray(data.footerMenuItems) ? data.footerMenuItems : []).filter(it => it.id !== id);
                    data.footerMenuOrder = (Array.isArray(data.footerMenuOrder) ? data.footerMenuOrder : []).filter(k => k !== id);
                    persistData({ mark: true, silent: true });
                    showToast('已删除页脚菜单', 'success');
                    refreshVisitor();
                }
            });
        };
        // ===== 页脚菜单编辑（固定项改图标+名称；自定义项改图标+名称+链接）=====
        const footerEditForm = reactive({ mode: 'fixed', key: '', text: '', icon: '', iconColor: '#b2b8be', url: '', target: '_blank', template: '' });
        const openEditFooterMenu = (key) => {
            if (!key) return;
            if (key === 'mk-friend') { openFriendLinks(); return; }
            const defaults = {
                'about-link': { icon: 'fa fa-info-circle', text: '关于导航' },
                'mk-submit': { icon: 'fas fa-paper-plane', text: '网站提交' },
                'mk-friend': { icon: 'fas fa-link', text: '友情链接' }
            };
            const fixedKeys = { 'about-link': 1, 'mk-submit': 1, 'mk-friend': 1 };
            if (fixedKeys[key]) {
                const fm = (data.footerFixedMeta && data.footerFixedMeta[key]) || defaults[key] || { icon: 'fas fa-link', text: key };
                footerEditForm.mode = 'fixed';
                footerEditForm.key = key;
                footerEditForm.text = fm.text || '';
                footerEditForm.icon = fm.icon || '';
                footerEditForm.iconColor = fm.iconColor || '#b2b8be';
                footerEditForm.url = ((key === 'about-link' && data.site && data.site.aboutLink && data.site.aboutLink.url) ? data.site.aboutLink.url : (fm && fm.url ? fm.url : ''));
                footerEditForm.target = '_blank';
                // 固定项也支持绑定模板；about-link 默认使用全局 about.template
                footerEditForm.template = (fm && fm.template) ? fm.template : (key === 'about-link' ? ((data.about && data.about.template) || '') : '');
            } else {
                const custom = (Array.isArray(data.footerMenuItems) ? data.footerMenuItems : []).find(it => it.id === key);
                if (!custom) return;
                footerEditForm.mode = 'custom';
                footerEditForm.key = key;
                footerEditForm.text = custom.text || '';
                footerEditForm.icon = custom.icon || '';
                footerEditForm.iconColor = custom.iconColor || '#b2b8be';
                footerEditForm.url = custom.url || '';
                footerEditForm.target = custom.target || '_blank';
                footerEditForm.template = custom.template || '';
            }
            modal.editFooterMenu = true;
        };
        const saveEditFooterMenu = () => {
            const text = (footerEditForm.text || '').trim();
            if (!text) { showToast('请填写菜单名称', 'warning'); return; }
            if (footerEditForm.mode === 'fixed') {
                const k = footerEditForm.key;
                const fm = (data.footerFixedMeta && typeof data.footerFixedMeta === 'object') ? { ...data.footerFixedMeta } : {};
                const templateVal = (footerEditForm.template || '').trim();
                fm[k] = { icon: (footerEditForm.icon || '').trim(), text, iconColor: (footerEditForm.iconColor || '').trim() || '#b2b8be', url: (footerEditForm.url || '').trim(), template: templateVal };
                data.footerFixedMeta = fm;
                // 同步 site.aboutLink，确保 ensureFooterMeta() 不会用旧默认值覆盖
                if (k === 'about-link') {
                    if (!data.site) data.site = {};
                    if (!data.site.aboutLink) data.site.aboutLink = {};
                    data.site.aboutLink.text = text;
                    if (footerEditForm.icon) data.site.aboutLink.icon = (footerEditForm.icon || '').trim();
                    if (footerEditForm.url) data.site.aboutLink.url = (footerEditForm.url || '').trim();
                    // about-link 的模板即全局关于页模板（关于导航不应关联“网站提交”模板，防止污染 #6）
                    if (templateVal && templateVal !== '页脚/网站提交' && templateVal !== '网站提交') {
                        if (!data.about || typeof data.about !== 'object') data.about = {};
                        data.about.template = templateVal;
                    } else if (templateVal === '页脚/网站提交' || templateVal === '网站提交') {
                        if (!data.about || typeof data.about !== 'object') data.about = {};
                        data.about.template = '页脚/关于导航';
                        if (fm['about-link']) fm['about-link'].template = '页脚/关于导航';
                    }
                }
                persistData({ mark: true, silent: true });
            } else {
                if (!footerEditForm.url || !footerEditForm.url.trim()) { showToast('请填写链接地址', 'warning'); return; }
                const items = (Array.isArray(data.footerMenuItems) ? data.footerMenuItems : []).map(it =>
                    it.id === footerEditForm.key ? { ...it, text, icon: (footerEditForm.icon || '').trim() || 'fas fa-link', iconColor: (footerEditForm.iconColor || '').trim() || '#b2b8be', url: footerEditForm.url.trim(), target: footerEditForm.target || '_blank', template: (footerEditForm.template || '').trim() } : it
                );
                data.footerMenuItems = items;
                persistData({ mark: true, silent: true });
            }
            modal.editFooterMenu = false;
            showToast('菜单已保存', 'success');
            refreshVisitor();
        };
        const openIconPickerForFooterMenu = (mode) => {
            editForm.iconPicker.target = 'footerMenu';
            editForm.iconPicker.mode = (mode === 'add') ? 'add' : 'edit';
            editForm.iconPicker.current = (mode === 'add' ? footerMenuForm.icon : footerEditForm.icon) || '';
            modal.iconPicker = true;
        };
        const swapFooterOrder = (fromKey, toKey) => {
            if (!fromKey || !toKey || fromKey === toKey) return;
            const arr = (Array.isArray(data.footerMenuOrder) && data.footerMenuOrder.length)
                ? data.footerMenuOrder.slice()
                : ['mk-submit', 'mk-friend', 'about-link'];
            const fi = arr.indexOf(fromKey);
            const ti = arr.indexOf(toKey);
            if (fi < 0 || ti < 0) return;
            const tmp = arr[fi]; arr[fi] = arr[ti]; arr[ti] = tmp;
            data.footerMenuOrder = arr;
            persistData({ mark: true, silent: true });
            showToast('菜单顺序已保存', 'success');
            refreshVisitor();
        };

        // ===== 壁纸分组（分类）管理：拖拽排序 / 新增 / 删除 =====
        // 整组位置互换（swap 语义，与壁纸项一致），并持久化到 data.wallpaperGroups
        const reorderGroup = (fromKey, toKey) => {
            if (!fromKey || !toKey || fromKey === toKey) return;
            const arr = bgPresetGroups.value.slice();
            const fi = arr.findIndex(g => g.key === fromKey);
            const ti = arr.findIndex(g => g.key === toKey);
            if (fi < 0 || ti < 0) return;
            const tmp = arr[fi]; arr[fi] = arr[ti]; arr[ti] = tmp;
            bgPresetGroups.value = arr;
            data.wallpaperGroups = arr.map(g => ({ ...g }));
            persistData({ mark: true, silent: true });
        };
        // 手动新增分类：生成唯一 key，push 到分组末尾，自动切到该分类；位置跟随当前一级位置
        const addWallpaperGroup = () => {
            const name = (wpLib.newGroupName || '').trim();
            if (!name) return;
            const key = 'g_' + Date.now();
            bgPresetGroups.value = bgPresetGroups.value.concat([{ key, label: name, pos: [wpLib.pos] }]);
            data.wallpaperGroups = bgPresetGroups.value.map(g => ({ ...g }));
            wpLib.mode = key;
            wpLib.newGroupName = '';
            persistData({ mark: true, silent: true });
        };
        // 删除自定义分类（内置 6 组不可删），连带移除该组下的自定义壁纸
        const deleteWallpaperGroup = (key) => {
            if (isBuiltinGroup(key)) return;
            bgPresetGroups.value = bgPresetGroups.value.filter(g => g.key !== key);
            data.wallpaperGroups = bgPresetGroups.value.map(g => ({ ...g }));
            if (data.customWallpapers && data.customWallpapers.length) {
                data.customWallpapers = data.customWallpapers.filter(w => w.group !== key);
            }
            if (wpLib.mode === key) { const f = groupsForPos(wpLib.pos)[0]; wpLib.mode = f ? f.key : 'canvas'; }
            persistData({ mark: true, silent: true });
        };
        // 删除「当前选中」的分类：内置不可删（给出提示），自定义需二次确认
        const deleteCurrentWallpaperGroup = () => {
            const key = wpLib.mode;
            if (!key) return;
            const g = bgPresetGroups.value.find(x => x.key === key);
            const label = g ? g.label : key;
            if (isBuiltinGroup(key)) { alert(`「${label}」是内置分类，不能删除。`); return; }
            if (!confirm(`确定删除分类「${label}」吗？该分类下的自定义壁纸也会被删除。`)) return;
            deleteWallpaperGroup(key);
        };
        const openWallpaperFolder = async () => {
            try {
                // 根据当前选中的分类定位对应子文件夹
                const mode = wpLib.mode || '';
                const grp = bgPresetGroups.value.find(g => g.key === mode);
                const sub = (grp && isBuiltinGroup(mode)) ? `/${grp.label}` : '';
                const targetPath = `assets/images/wallpapers${sub}`;
                const resp = await fetch('/api/open-folder', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: targetPath })
                });
                if (!resp.ok) {
                    const hint = resp.status === 404 ? '（后端 launcher 版本过旧，请重启 NavEditor）' : `（HTTP ${resp.status}）`;
                    showToast('无法打开文件夹' + hint, 'error');
                    return;
                }
                // 后端已在 200 时启动资源管理器。响应理论上为 JSON，但做容错解析：
                // 任何非 JSON 杂余字符都不应阻断“已打开”的反馈，避免误报失败。
                let result = null;
                try {
                    result = await resp.json();
                } catch (e) {
                    // HTTP 200 即表示后端已成功唤起资源管理器，忽略响应解析异常
                    showToast('已打开壁纸文件夹', 'success');
                    return;
                }
                if (result && result.ok) {
                    showToast('已打开壁纸文件夹', 'success');
                } else {
                    showToast('无法打开文件夹：' + ((result && result.error) || '未知错误'), 'error');
                }
            } catch (e) {
                showToast('打开文件夹失败：' + (e.message || '网络异常'), 'error');
            }
        };
        // 弹出系统文件对话框，选择 footer/ 目录下的 .html 文件，回填页脚菜单链接地址
        const pickAboutHtml = async () => {
            try {
                const resp = await fetch('/api/pick-about-html', { method: 'POST' });
                if (!resp.ok) {
                    const hint = resp.status === 404 ? '（后端 launcher 版本过旧，请重启 NavEditor）' : `（HTTP ${resp.status}）`;
                    showToast('无法打开文件选择框' + hint, 'error');
                    return;
                }
                const result = await resp.json();
                if (result.ok && result.relative) {
                    if (typeof footerMenuForm === 'object' && footerMenuForm) footerMenuForm.url = result.relative;
                    showToast('已选择：' + result.relative, 'success');
                } else if (result.error && result.error !== '未选择文件') {
                    showToast('选择失败：' + (result.error || '未知错误'), 'error');
                }
            } catch (e) {
                showToast('打开文件选择框失败：' + (e.message || '网络异常'), 'error');
            }
        };
        // 分组拖拽事件
        const onGroupDragStart = (key) => { wpLib.groupDragFrom = key; };
        const onGroupDragOver = (key) => { wpLib.groupDragOver = key; };
        const onGroupDrop = (key) => {
            reorderGroup(wpLib.groupDragFrom, key);
            wpLib.groupDragFrom = null; wpLib.groupDragOver = null; wpLib.groupDropPos = null;
        };
        // 把被拖拽的二级分类「额外指派」到某一级位置标签（保留原位置）：
        // 分类 pos 追加目标、内置壁纸按新 pos 重新展开（目标位置自动多出一份）、
        // 自定义壁纸同组追加目标位置、持久化，并切到目标位置选中该分类给出即时反馈。
        const onGroupDropOnPos = (targetPos) => {
            const key = wpLib.groupDragFrom;
            wpLib.groupDragFrom = null; wpLib.groupDragOver = null; wpLib.groupDropPos = null;
            if (!key || !targetPos) return;
            const g = bgPresetGroups.value.find(x => x.key === key);
            if (!g) return;
            const oldPos = Array.isArray(g.pos) ? g.pos : (g.pos ? [g.pos] : []);
            if (oldPos.includes(targetPos)) return; // 已在目标位置，无需操作
            const newPos = oldPos.concat(targetPos);
            bgPresetGroups.value = bgPresetGroups.value.map(x => x.key === key ? { ...x, pos: newPos } : x);
            // 内置壁纸按新 pos 重新展开（目标位置自动多出一份）
            rebuildBuiltinWallpapers();
            // 自定义壁纸：同组追加目标位置
            if (data.customWallpapers && data.customWallpapers.length) {
                data.customWallpapers = data.customWallpapers.map(w => {
                    if (w.group !== key) return w;
                    const wp = Array.isArray(w.pos) ? w.pos : (w.pos ? [w.pos] : []);
                    return wp.includes(targetPos) ? w : { ...w, pos: wp.concat(targetPos) };
                });
            }
            // 持久化
            data.wallpaperGroups = bgPresetGroups.value.map(g => ({ ...g }));
            persistData({ mark: true, silent: true });
            // 即时反馈：切到目标位置并选中该分类
            wpLib.pos = targetPos;
            wpLib.mode = key;
        };
        const onGroupDragEnd = () => { wpLib.groupDragFrom = null; wpLib.groupDragOver = null; wpLib.groupDropPos = null; };

        // 编辑器已位于站点根目录，相对路径无需回退
        const resolvePreviewUrl = (url) => {
            if (!url) return '';
            if (/^(https?:)?\/\//i.test(url) || url.startsWith('data:') || url.startsWith('/')) return url;
            return './' + url.replace(/^\.?\//, '');
        };

        // === 每日文字配置 ===
        const openDailyTextConfig = () => {
            modal.dailyText = true;
        };

        // === 广告位配置 ===
        const openAdSlotsConfig = () => {
            if (!data.adSlots) data.adSlots = { enabled: false, unifiedSize: true, left: [], right: [] };
            // 统一尺寸开关：旧数据缺省时默认开启（保持与历史行为一致）
            if (data.adSlots.unifiedSize == null) data.adSlots.unifiedSize = true;
            if (data.adSlots.width == null) data.adSlots.width = 380;
            if (data.adSlots.height == null) data.adSlots.height = 49;
            // 确保 left/right 各有 4 个 slot（用户保存的数据可能因历史版本缺失或为空数组，导致 v-for 无内容）
            const defaultSlot = (id) => ({ id, type: 'none', image: '', sourceImage: '', url: '', width: data.adSlots.width || 380, height: data.adSlots.height || 49, blink: { enabled: false, mode: 'count', count: 3, duration: 300, interval: 150, color: '#ff6b6b', templateName: '', opacity: 0.5 }, span: 'none', fit: 'contain', background: 'transparent' });
            ['left', 'right'].forEach(side => {
                if (!Array.isArray(data.adSlots[side]) || data.adSlots[side].length === 0) {
                    data.adSlots[side] = [0,1,2,3].map(i => defaultSlot(side === 'left' ? 'ad_l_' + i : 'ad_r_' + i));
                }
                // 向后兼容：为没有独立尺寸字段的旧 slot 兜底，填为全局尺寸
                data.adSlots[side].forEach(slot => {
                    if (slot.width == null) slot.width = data.adSlots.width;
                    if (slot.height == null) slot.height = data.adSlots.height;
                    // 向后兼容：旧广告位数据可能缺 blink 对象，兜底避免面板/预设操作读取 undefined 报错
                    if (!slot.blink) slot.blink = { enabled: false, mode: 'count', count: 3, duration: 300, interval: 150, color: '#ff6b6b', templateName: '', opacity: 0.5 };
                });
            });
            modal.adSlots = true;
        };
        // 根据格位索引返回允许的拼接方式
        const adAllowedSpans = (idx) => {
            // 0:(左上) 1:(右上) 2:(左下) 3:(右下)
            const map = {
                0: [['none', '无'], ['h', '横向(合并右)'], ['v', '纵向(合并下)'], ['all', '四合一']],
                1: [['none', '无'], ['v', '纵向(合并下)'], ['all', '四合一']],
                2: [['none', '无'], ['h', '横向(合并右)'], ['all', '四合一']],
                3: [['none', '无'], ['all', '四合一']]
            };
            return map[idx] || [['none', '无']];
        };

        // === SEO 营销配置 ===
        const seoDefaults = () => ({
            enabled: true,
            baseUrl: '',
            title: '', description: '', keywords: '', author: '', robots: 'index,follow',
            ogEnabled: true, ogTitle: '', ogDescription: '', ogImage: '', ogType: 'website', ogSiteName: '', ogLocale: 'zh_CN',
            twitterEnabled: true, twitterCard: 'summary_large_image', twitterTitle: '', twitterDescription: '', twitterImage: '',
            verification: { google: '', bing: '', baidu: '', yandex: '', sogou: '', shenma: '', qihoo: '' },
            structuredDataEnabled: true, sdType: 'WebSite', sdName: '', sdUrl: '', sdLogo: '', sdDescription: '', sdSameAs: '',
            canonicalUrl: '',
            generateRobots: true,
            robotsRules: [{ userAgent: '*', allow: '/', disallow: '' }],
            generateSitemap: true,
            customHead: ''
        });
        const ensureSeoDefaults = () => {
            if (!data.seo || typeof data.seo !== 'object') data.seo = {};
            const d = seoDefaults();
            for (const k in d) {
                if (data.seo[k] === undefined) data.seo[k] = d[k];
            }
            if (!data.seo.verification || typeof data.seo.verification !== 'object') data.seo.verification = {};
            for (const vk in d.verification) {
                if (data.seo.verification[vk] === undefined) data.seo.verification[vk] = '';
            }
            if (!Array.isArray(data.seo.robotsRules) || data.seo.robotsRules.length === 0) {
                data.seo.robotsRules = [{ userAgent: '*', allow: '/', disallow: '' }];
            }
        };
        const openSeoConfig = () => {
            ensureSeoDefaults();
            modal.seo = true;
        };
        const saveSeoConfig = () => {
            ensureSeoDefaults();
            persistData({ mark: true, silent: true });
            modal.seo = false;
            showToast('SEO 配置已保存', 'success');
            refreshVisitor();
        };
        const resolveSeoImage = (u) => {
            if (!u) return '';
            if (/^https?:\/\//i.test(u) || u.startsWith('data:')) return u;
            return './' + String(u).replace(/^\.?\//, '');
        };
        const pickSeoOgImage = () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml';
            input.onchange = () => {
                const file = input.files && input.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = async () => {
                    try {
                        const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace('jpg', 'jpeg');
                        const name = 'og-' + Date.now() + '.' + ext;
                        const resp = await fetch('/api/upload-seo-image', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name, dataUrl: reader.result })
                        });
                        const j = await resp.json().catch(() => ({}));
                        if (!resp.ok || !j.ok) throw new Error(j.error || '上传失败');
                        ensureSeoDefaults();
                        data.seo.ogImage = j.path;
                        showToast('分享图片已上传', 'success');
                    } catch (e) {
                        showToast('上传图片失败：' + (e.message || e), 'error');
                    }
                };
                reader.readAsDataURL(file);
            };
            input.click();
        };
        const addSeoRobotsRule = () => {
            ensureSeoDefaults();
            data.seo.robotsRules.push({ userAgent: '*', allow: '/', disallow: '' });
        };
        const removeSeoRobotsRule = (i) => {
            ensureSeoDefaults();
            data.seo.robotsRules.splice(i, 1);
            if (data.seo.robotsRules.length === 0) data.seo.robotsRules.push({ userAgent: '*', allow: '/', disallow: '' });
        };
        // 广告位闪烁强度预设
        const adBlinkPresets = {
            crazy: { count: 0, duration: 120, interval: 80, color: '#ff4757', mode: 'continuous' },
            soft: { count: 3, duration: 500, interval: 400, color: '#4facfe', mode: 'count' },
            normal: { count: 4, duration: 300, interval: 150, color: '#ff6b6b', mode: 'count' },
            custom: null
        };
        const applyAdBlinkPreset = (side, idx, presetKey) => {
            const slot = data.adSlots[side][idx];
            if (!slot) return;
            slot.blink.preset = presetKey;   // 记录当前选中的预设，用于高亮
            if (presetKey === 'custom') { slot.blink.mode = 'custom'; return; }
            const p = adBlinkPresets[presetKey];
            if (!p) return;
            slot.blink.mode = p.mode;
            slot.blink.count = p.count;
            slot.blink.duration = p.duration;
            slot.blink.interval = p.interval;
            slot.blink.color = p.color;
            if (!data.adSlots.enabled) data.adSlots.enabled = true;  // 应用预设即自动启用广告位
        };
        // 广告位：应用闪烁模版（与卡片共享 data.blinkTemplates）
        const applyAdBlinkTemplate = (side, idx, templateName) => {
            const slot = data.adSlots[side] && data.adSlots[side][idx];
            if (!slot) return;
            const tpl = (data.blinkTemplates || []).find(t => t.name === templateName);
            if (!tpl) return;
            const s = tpl.settings || {};
            slot.blink.templateName = templateName;
            slot.blink.preset = 'template';
            slot.blink.mode = (s.mode === 'continuous' || s.mode === 'count') ? s.mode : (s.count > 0 ? 'count' : 'continuous');
            slot.blink.count = s.count || 3;
            slot.blink.duration = s.duration || 300;
            slot.blink.interval = (s.interval != null ? s.interval : 150);
            slot.blink.color = s.color || '#ff6b6b';
            if (!data.adSlots.enabled) data.adSlots.enabled = true;  // 应用模版即自动启用广告位
            showToast('已应用模版: ' + templateName, 'success');
        };
        // 广告位：保存当前闪烁配置为模版
        const saveAdBlinkTemplate = (side, idx) => {
            const slot = data.adSlots[side] && data.adSlots[side][idx];
            if (!slot) return;
            const b = slot.blink;
            const name = (b.templateName || '').trim();
            if (!name) { showToast('请输入模版名称', 'warning'); return; }
            const idx0 = (data.blinkTemplates || []).findIndex(t => t.name === name);
            const tpl = {
                name,
                settings: {
                    count: b.count || 3,
                    duration: b.duration || 300,
                    interval: (b.interval != null ? b.interval : 150),
                    color: b.color || '#ff6b6b',
                    mode: b.mode || 'count'
                }
            };
            if (!data.blinkTemplates) data.blinkTemplates = [];
            if (idx0 >= 0) {
                data.blinkTemplates[idx0] = tpl;
                showToast('模版已更新: ' + name, 'success');
            } else {
                data.blinkTemplates.push(tpl);
                showToast('模版已保存: ' + name, 'success');
            }
            persistData({ mark: true, silent: true });
        };
        // 打开广告位图片裁剪器（复用高质量视口裁剪器，与"编辑网站"一致）
        const openAdImageCropper = (side, idx) => {
            const slot = data.adSlots[side][idx];
            if (!slot) return;
            const ctx = editForm.imageCropper;
            ctx.open = true;
            ctx.target = 'adSlot';     // 目标类型：写入广告位图片
            ctx.adSide = side;          // 'left' | 'right'
            ctx.adIdx = idx;            // 0..3
            ctx.tabIdx = -1;
            ctx.engIdx = -1;
            // 使用视口裁剪模式（与编辑网站背景图/Logo 裁剪器完全一致）
            ctx.siteStyleMode = true;
            ctx.isCircleMode = true;
            ctx.shape = slot.shape || 'square';       // 广告位图片为长方形（输出时约束比例）
            ctx.sourceImage = '';
            ctx.fileName = '';
            ctx.fileType = '';
            ctx.crop = { x: 0, y: 0, w: 0, h: 0 };
            ctx.imgSize = { w: 0, h: 0 };
            ctx._imgEl = null;
            ctx.output = 'square';
            // 输出尺寸 = 单个广告格的真实显示尺寸
            // 统一尺寸模式下读全局 adSlots.width/height；非统一模式读当前 slot 的独立尺寸
            const _unified = data.adSlots.unifiedSize !== false;
            const _effSlot = (!_unified && slot) ? slot : null;
            // 兜底链：独立尺寸 → 全局尺寸 → 硬编码默认（与 buildAdRail/buildAdCss 保持一致，避免裁剪器与渲染尺寸错位）
            const _gW = Number(data.adSlots.width) || 380;
            const _gH = Number(data.adSlots.height) || 49;
            const _adW = Number(_effSlot ? _effSlot.width : data.adSlots.width) || _gW;
            const _adH = Number(_effSlot ? _effSlot.height : data.adSlots.height) || _gH;
            ctx.outputSizeW = _adW;                     // 单格宽
            ctx.outputSizeH = _adH;                      // 单格高
            ctx.aspectRatio = 'output';               // 默认与输出尺寸比例一致
            ctx.lockRatio = true;                      // 默认锁定比例
            ctx.outputFormat = 'auto';
            ctx.svgText = '';
            ctx.urlValue = '';
            ctx.rotation = 0;
            // 视口状态初始化
            ctx.imgTranslateX = 0;
            ctx.imgTranslateY = 0;
            ctx.imgScale = 1;
            ctx.viewportSize = 280;
            ctx.circleDragState = { active: false, startX: 0, startY: 0, startTx: 0, startTy: 0 };
            ctx.vpCrop = { x: 20, y: 28, w: 240, h: 62 };   // 默认裁剪框，比例随单格尺寸（约 3.88:1），加载图片后由 initVpCropBox 校正
            ctx.vpCropDrag = { active: false, mode: '', startX: 0, startY: 0, startCrop: null };
            const v = slot.sourceImage || slot.image || '';
            // 重开已有图片时按内容判断默认模式：SVG 文本保持 'svg'（原样保存）；
            // 栅格 dataURL / 远程 URL 设为 'upload' 加载进视口供重新裁剪，避免二次编辑被 url 分支忽略裁剪框
            const _isSvgText = typeof v === 'string' && v.trim().charAt(0) === '<';
            ctx.mode = _isSvgText ? 'svg' : 'upload';
            if (!v) {
                modal.imageCropper = true;
                return;
            }
            // 加载已有图片到视口模式（居中、等比缩放适配视口）
            const rawUrl = v;
            const fixedUrl = isDataUrl(rawUrl) || isHttpUrl(rawUrl) ? rawUrl : rawUrl;
            ctx.urlValue = fixedUrl;
            ctx.sourceImage = '';
            const img = new Image();
            img.onload = () => {
                ctx.sourceImage = fixedUrl;
                ctx._imgEl = img;
                ctx.imgSize = { w: img.naturalWidth, h: img.naturalHeight };
                const vp = ctx.viewportSize;
                const ratio = Math.min(vp / img.naturalWidth, vp / img.naturalHeight, 1);
                ctx._dispW = Math.round(img.naturalWidth * ratio);
                ctx._dispH = Math.round(img.naturalHeight * ratio);
                ctx.imgScale = 1;
                ctx.imgTranslateX = Math.round((vp - ctx._dispW) / 2);
                ctx.imgTranslateY = Math.round((vp - ctx._dispH) / 2);
                // 初始化视口裁剪框：包裹图片内容，四周留 8% 空间
                initVpCropBox(ctx);
                updateCropPreview(); // 打开即绘制输出预览，避免需手动点击才显示
            };
            img.onerror = () => {
                ctx._dispW = 240;
                ctx._dispH = 240;
                ctx.imgTranslateX = Math.round((ctx.viewportSize - 240) / 2);
                ctx.imgTranslateY = Math.round((ctx.viewportSize - 240) / 2);
            };
            img.src = fixedUrl;
            if (img.complete && img.naturalWidth > 0) {
                ctx.sourceImage = fixedUrl;
                ctx._imgEl = img;
                ctx.imgSize = { w: img.naturalWidth, h: img.naturalHeight };
                const vp = ctx.viewportSize;
                const ratio = Math.min(vp / img.naturalWidth, vp / img.naturalHeight, 1);
                ctx._dispW = Math.round(img.naturalWidth * ratio);
                ctx._dispH = Math.round(img.naturalHeight * ratio);
                ctx.imgScale = 1;
                ctx.imgTranslateX = Math.round((vp - ctx._dispW) / 2);
                ctx.imgTranslateY = Math.round((vp - ctx._dispH) / 2);
                initVpCropBox(ctx);
                updateCropPreview();
            }
            modal.imageCropper = true;
            // 初始化广告位背景取色器（若当前为广告位）
            if (ctx.target === 'adSlot') initAdSlotBgPicker();
            // 延迟保险：确保弹窗渲染 + 图片加载后裁剪框正确对齐
            deferredInitVpCrop();
        };

        // === 关于导航（页面文字编辑） ===
        const openAbout = () => {
            if (!data.about) data.about = { title: '关于作者', subtitle: '', headerIcon: 'fas fa-user-circle', headerBg: '', intro: '', introHtml: '', introMode: 'text', skills: [], philosophy: '', philosophyHtml: '', philosophyMode: 'text', contacts: [], leftAds: [], rightAds: [] };
            const a = data.about;
            // 兼容旧数据：旧 content 字段迁移到 intro
            if (!a.intro && a.content) a.intro = a.content;
            if (!Array.isArray(a.skills)) a.skills = [];
            if (!Array.isArray(a.contacts)) a.contacts = [];
            editForm.about = {
                title: a.title || '关于作者',
                subtitle: a.subtitle || '',
                intro: a.intro || '',
                introHtml: a.introHtml || '',
                introMode: a.introHtml ? 'html' : 'text',
                skills: JSON.parse(JSON.stringify(a.skills || [])),
                philosophy: a.philosophy || '',
                philosophyHtml: a.philosophyHtml || '',
                philosophyMode: a.philosophyHtml ? 'html' : 'text',
                contacts: JSON.parse(JSON.stringify(a.contacts || [])),
                leftAds: Array.isArray(a.leftAds) ? JSON.parse(JSON.stringify(a.leftAds)) : [],
                rightAds: Array.isArray(a.rightAds) ? JSON.parse(JSON.stringify(a.rightAds)) : []
            };
            modal.about = true;
        };
        const saveAbout = () => {
            if (!data.about) data.about = {};
            const f = editForm.about;
            data.about.title = f.title;
            data.about.subtitle = f.subtitle;
            data.about.intro = f.intro;
            data.about.introHtml = (f.introMode === 'html') ? (f.introHtml || '') : '';
            data.about.introMode = f.introMode || 'text';
            data.about.skills = JSON.parse(JSON.stringify(f.skills || []));
            data.about.philosophy = f.philosophy;
            data.about.philosophyHtml = (f.philosophyMode === 'html') ? (f.philosophyHtml || '') : '';
            data.about.philosophyMode = f.philosophyMode || 'text';
            data.about.contacts = JSON.parse(JSON.stringify(f.contacts || []));
            data.about.leftAds = Array.isArray(f.leftAds) ? JSON.parse(JSON.stringify(f.leftAds)) : [];
            data.about.rightAds = Array.isArray(f.rightAds) ? JSON.parse(JSON.stringify(f.rightAds)) : [];
            persistData({ mark: true, silent: true })
            modal.about = false;
            showToast('已保存关于导航', 'success');
            saveDeployedAbout();
        };
        // === 关于页广告位操作 ===
        const aboutAdAdd = (side) => {
            const arr = editForm.about[side === 'left' ? 'leftAds' : 'rightAds'];
            arr.push({ type: 'image', value: '', link: '', effect: '', width: 200, height: 280, radius: 8, bg: '#667eea', color: '#ffffff', autoplay: true, loop: true });
        };
        const aboutAdRemove = (side, idx) => {
            const arr = editForm.about[side === 'left' ? 'leftAds' : 'rightAds'];
            if (idx >= 0 && idx < arr.length) arr.splice(idx, 1);
        };
        const aboutAdUpload = (side, idx, e) => {
            const file = e && e.target && e.target.files && e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                const arr = editForm.about[side === 'left' ? 'leftAds' : 'rightAds'];
                if (arr[idx]) { arr[idx].value = reader.result; arr[idx].type = 'image'; }
            };
            reader.readAsDataURL(file);
            if (e.target) e.target.value = '';
        };
        const aboutAdPreview = (ad) => {
            try { return Generator.generateAdHtml(ad); } catch (err) { return ''; }
        };

        // === 关于页技术栈 / 联系方式 列表操作 ===
        const aboutSkillAdd = () => {
            if (!Array.isArray(editForm.about.skills)) editForm.about.skills = [];
            editForm.about.skills.push({ icon: 'fas fa-star', name: '' });
        };
        const aboutSkillRemove = (idx) => {
            if (editForm.about.skills && idx >= 0 && idx < editForm.about.skills.length) editForm.about.skills.splice(idx, 1);
        };
        const aboutContactAdd = () => {
            if (!Array.isArray(editForm.about.contacts)) editForm.about.contacts = [];
            editForm.about.contacts.push({ icon: 'fas fa-link', label: '', value: '', link: '' });
        };
        const aboutContactRemove = (idx) => {
            if (editForm.about.contacts && idx >= 0 && idx < editForm.about.contacts.length) editForm.about.contacts.splice(idx, 1);
        };

        // === 站点提交页面编辑 ===
        const openCommit = () => {
            if (!data.commit) data.commit = {
                title: '网址提交', subtitle: '', guidelines: [], successMessage: '', categories: []
            };
            const c = data.commit;
            editForm.commit = {
                title: c.title || '网址提交',
                subtitle: c.subtitle || '',
                guidelines: (c.guidelines || []).join('\n'),
                successMessage: c.successMessage || '',
                categories: (c.categories || []).join(',')
            };
            modal.commit = true;
        };
        const saveCommit = () => {
            if (!data.commit) data.commit = {};
            const f = editForm.commit;
            data.commit.title = f.title || '网址提交';
            data.commit.subtitle = f.subtitle || '';
            data.commit.guidelines = (f.guidelines || '').split('\n').map(s => s.trim()).filter(Boolean);
            data.commit.successMessage = f.successMessage || '';
            data.commit.categories = (f.categories || '').split(',').map(s => s.trim()).filter(Boolean);
            persistData({ mark: true, silent: true })
            modal.commit = false;
            showToast('已保存站点提交页面', 'success');
        };

        // 打开关于导航页面（在独立页面可视化编辑）
        // URL: http://localhost:{port}/template/页脚/关于导航/?edit=1&from=about-link&path=footer/index.html
        const openAboutInTab = (fromKey, defaultPath, label, template) => {
            // 先保存当前编辑数据到 localStorage，确保 about 页面加载时能拿到最新值
            persistData({ silent: true, clone: false, mark: false })
            const tpl = template || (data.about && data.about.template) || '页脚/关于导航';
            let url = window.location.origin + '/template/' + encodeURIComponent(tpl) + '/?edit=1';
            if (fromKey) url += '&from=' + encodeURIComponent(fromKey);
            if (defaultPath) url += '&path=' + encodeURIComponent(defaultPath);
            if (label) url += '&label=' + encodeURIComponent(label);
            // 缓存破坏：子页 index.html 以稳定 URL 打开，浏览器会缓存；追加时间戳强制每次重新拉取，
            // 否则浏览器命中旧 index.html（其内部 edit.js?v= 仍是旧值），导致前端修改不生效
            url += '&_cb=' + Date.now();
            const win = window.open(url, '_blank');
            if (!win) {
                showToast('浏览器拦截了新窗口，请允许弹窗后重试', 'warning');
            }
        };

        // 关于页编辑标签（?edit=1）保存后，把 about 合并回编辑器内存，保持同步
        if (typeof window !== 'undefined' && !window.__aboutSavedBound) {
            window.__aboutSavedBound = true;
            const _aboutMsgHandler = async (e) => {
                try {
                    if (e && e.data && e.data.type === 'nav-about-saved') {
                        const profile = await Storage.getProfile(Storage.getCurrentProfileId());
                        if (profile && profile.data && profile.data.about) {
                            data.about = Object.assign({}, data.about, profile.data.about);
                            showToast('已从关于页编辑同步最新内容', 'success', 2500);
                            // 不再自动生成 footer/index.html，由编辑器保存时用户自主选择保存位置
                        }
                    }
                    // 编辑器保存到指定路径后，通知主窗口更新对应菜单的链接地址
                    if (e && e.data && e.data.type === 'nav-about-saved-to') {
                        const savedPath = e.data.path || '';
                        const fromKey = e.data.from || '';
                        if (savedPath && fromKey === 'about-link') {
                            if (!data.site) data.site = {};
                            if (!data.site.aboutLink) data.site.aboutLink = {};
                            // 保存路径可能是版本部署目录内的绝对-相对路径，页脚链接只用部署内相对路径
                            data.site.aboutLink.url = toDeployRelative(savedPath);
                            await persistData({ mark: true, silent: true });
                            showToast('关于导航链接已更新为 ' + data.site.aboutLink.url, 'success', 2500);
                        }
                    }
                    // 网站提交模板编辑器保存后，把保存路径写回页脚固定菜单链接，并同步提交页内容
                    if (e && e.data && e.data.type === 'nav-commit-saved') {
                        try {
                            const savedPath = e.data.path || '';
                            if (savedPath) {
                                const fm = (data.footerFixedMeta && typeof data.footerFixedMeta === 'object') ? { ...data.footerFixedMeta } : {};
                                // 保存路径可能是版本部署目录内的绝对-相对路径，页脚链接只用部署内相对路径
                                fm['mk-submit'] = Object.assign({}, fm['mk-submit'] || {}, { url: toDeployRelative(savedPath) });
                                data.footerFixedMeta = fm;
                                if (e.data.data && e.data.data.about) {
                                    data.commit = e.data.data.about;
                                }
                                await persistData({ mark: true, silent: true });
                                showToast('网站提交链接已更新为 ' + toDeployRelative(savedPath), 'success', 2500);
                            }
                        } catch (err) { /* ignore */ }
                    }
                } catch (err) { /* ignore */ }
            };
            window.addEventListener('message', _aboutMsgHandler);
            window.__aboutMsgHandler = _aboutMsgHandler;
        }

        // ============== 图片 Logo 裁剪器 ==============
        // 打开裁剪器，绑定到某个 tab/engine 的 logo 字段
        const openLogoCropper = (tabIdx, engIdx, currentValue) => {
            const ctx = editForm.imageCropper;
            ctx.open = true;
            ctx.target = 'engine';   // 'engine' | 'site'
            {
                const _eng = data.searchConfig.tabs[tabIdx] && data.searchConfig.tabs[tabIdx].engines[engIdx];
                ctx.shape = (_eng && _eng.logoShape) || 'square';
            }
            ctx.tabIdx = tabIdx;
            ctx.engIdx = engIdx;
            ctx.sourceImage = '';
            ctx.fileName = '';
            ctx.fileType = '';
            ctx.crop = { x: 0, y: 0, w: 0, h: 0 };
            ctx.imgSize = { w: 0, h: 0 };
            ctx.output = 'square';
            ctx.outputSize = 64;
            ctx.outputFormat = 'auto';
            ctx.svgText = '';
            ctx.urlValue = '';
            ctx.rotation = 0;
            ctx.bgColor = 'transparent';
            ctx.zoom = 1;
            // 智能识别当前值属于哪种模式
            // 已有值时默认落到 url 模式直接保存（避免 upload 模式但视口未载入图片，
            // 点「应用」弹“请先选择图片”而无法保存的陷阱）；用户想重裁可在「上传」标签页重新选文件
            ctx.mode = currentValue ? 'url' : 'upload';
            if (currentValue && (currentValue.trim().startsWith('<svg') || currentValue.trim().startsWith('<?xml'))) {
                ctx.mode = 'svg';
                ctx.svgText = currentValue;
            } else if (currentValue) {
                ctx.urlValue = currentValue;
            }
            modal.imageCropper = true;
        };

        // 为"站点配置"弹窗的 Logo 打开裁剪器，mode='light'|'dark'
        // 侧边栏顶部 Logo 裁剪框四周留白（与视口外框的间距），导出取此内缩框内区域（所见即所得）
        const HLOGO_MARGIN = 105;

        // headerLogo 原图 + 编辑参数 存取助手（"保存原图方便日后调整"）
        // 把 mode + formTarget 映射到 editForm 上的基字段名
        const headerLogoBase = (mode, formTarget) => {
            if (formTarget === 'sidebarTop') {
                if (mode === 'collapsedLight') return 'logoCollapsedLight';
                return 'logoLight';
            }
            if (mode === 'favicon') return 'favicon';
            if (mode === 'dark') return 'logoDark';
            return 'logoLight';
        };
        const readHeaderLogoOriginal = (formTarget, base) => {
            const store = (formTarget === 'sidebarTop') ? editForm.sidebarTop : editForm.headerConfig;
            return { src: store[base + 'Src'] || '', edit: store[base + 'Edit'] || null };
        };
        const writeHeaderLogoOriginal = (formTarget, base, src, edit) => {
            const store = (formTarget === 'sidebarTop') ? editForm.sidebarTop : editForm.headerConfig;
            store[base + 'Src'] = src;
            store[base + 'Edit'] = edit;
        };

        const openHeaderLogoCropper = (mode, currentValue, formTarget = 'headerConfig') => {
            const ctx = editForm.imageCropper;
            ctx.open = true;
            ctx.target = 'headerLogo';   // 新的目标类型
            ctx.formTarget = formTarget; // 决定回写到 headerConfig 还是 sidebarTop
            ctx.headerLogoMode = mode;  // 'light' 或 'dark'
            ctx.tabIdx = -1;
            ctx.engIdx = -1;
            ctx.sourceImage = '';
            ctx.fileName = '';
            ctx.fileType = '';
            ctx.crop = { x: 0, y: 0, w: 0, h: 0 };
            ctx.imgSize = { w: 0, h: 0 };
            ctx.output = 'original';    // Logo 保持原图比例更合适
            ctx.outputSize = 200;
            ctx.outputFormat = 'auto';
            ctx.svgText = '';
            ctx.urlValue = '';
            ctx.rotation = 0;
            ctx.bgColor = 'transparent';
            ctx.zoom = 1;
            // headerLogo 复用图标裁剪器的视口模型（固定取景框 + 拖图 + 中心缩放）
            ctx.imgScale = 1;
            ctx.imgTranslateX = 0;
            ctx.imgTranslateY = 0;
            ctx.viewportSize = 320;
            ctx.hLogoMargin = HLOGO_MARGIN;
            ctx.hLogoBox = { x: HLOGO_MARGIN, y: HLOGO_MARGIN, w: 320 - 2 * HLOGO_MARGIN, h: 320 - 2 * HLOGO_MARGIN };
            ctx.hLogoBg = 'transparent';
            ctx.hLogoCustomBg = (ctx.hLogoBg && ctx.hLogoBg.startsWith('#')) ? ctx.hLogoBg : '#4f46e5';
            ctx.hLogoRotation = 0;
            ctx._restoreEdit = null;
            ctx.circleDragState = { active: false, startX: 0, startY: 0, startTx: 0, startTy: 0 };
            // 默认落在「上传图片」标签页（用户要求点击图标后默认上传图片）
            ctx.mode = 'upload';
            // 读取已保存的「未截取原图 + 编辑参数」，优先用它恢复（所见即所得、避免二次裁剪损耗）
            const _base = headerLogoBase(mode, formTarget);
            const _orig = readHeaderLogoOriginal(formTarget, _base);
            // primary：优先用存储的原图，否则退回当前成品图（老数据兼容）
            const _primary = _orig.src || currentValue || '';
            if (_primary && (_primary.trim().startsWith('<svg') || _primary.trim().startsWith('<?xml'))) {
                ctx.mode = 'svg';
                ctx.svgText = _primary;
            } else if (_primary) {
                // 已有图片（dataURL / 远程 URL / 相对路径）时加载进裁剪器供编辑；
                // 同时保留原地址到 urlValue（dataURL 过长不写入 URL 框），方便切换标签查看/改地址
                ctx.sourceImage = resolvePreviewUrl(_primary);
                if (!_primary.startsWith('data:')) {
                    ctx.urlValue = _primary;
                }
                // 若有保存的编辑参数，待图片加载后还原（缩放/平移/裁剪框/背景/旋转/输出）
                if (_orig.edit && typeof _orig.edit === 'object') {
                    ctx._restoreEdit = _orig.edit;
                }
                // 异步初始化 imgSize / _dispW / _dispH / imgScale / 平移 / hLogoBox（所见即所得居中）
                initCropBox();
            }
            ctx.shape = (_orig && _orig.edit && _orig.edit.shape) || 'square';
            modal.imageCropper = true;
        };

        // 为"编辑网站"弹窗打开 Logo 裁剪器，target='site' 表示结果写到 editForm.site.logo
        const openSiteLogoCropper = (currentValue) => {
            const ctx = editForm.imageCropper;
            ctx.open = true;
            ctx.target = 'site';
            ctx.tabIdx = -1;
            ctx.shape = editForm.site.logoShape || 'square';
            ctx.engIdx = -1;
            ctx.sourceImage = '';
            ctx.fileName = '';
            ctx.fileType = '';
            ctx.crop = { x: 0, y: 0, w: 0, h: 0 };
            ctx.imgSize = { w: 0, h: 0 };
            ctx.output = 'square';
            ctx.outputSize = 64;
            ctx.outputFormat = 'auto';
            ctx.svgText = '';
            ctx.urlValue = '';
            ctx.rotation = 0;
            ctx.bgColor = 'transparent';
            ctx.zoom = 1;
            // 已有值时默认 url 模式直接保存，避免 upload 模式未载入图片导致无法保存
            ctx.mode = currentValue ? 'url' : 'upload';
            if (currentValue && (currentValue.trim().startsWith('<svg') || currentValue.trim().startsWith('<?xml'))) {
                ctx.mode = 'svg';
                ctx.svgText = currentValue;
            } else if (currentValue) {
                ctx.urlValue = currentValue;
            }
            modal.imageCropper = true;
        };

        // 为已有图标打开样式编辑：进入圆形头像裁剪模式
        // 支持：固定正方形视口 + 素材层拖拽缩放 + 中心十字参考线
        const openSiteLogoCropperStyle = (currentValue) => {
            const ctx = editForm.imageCropper;
            ctx.open = true;
            ctx.target = 'site';
            ctx.siteStyleMode = true;
            ctx.isCircleMode = true;
            ctx.shape = 'circle';
            ctx.tabIdx = -1;
            ctx.engIdx = -1;
            ctx.sourceImage = '';
            ctx.fileName = '';
            ctx.fileType = '';
            ctx.crop = { x: 0, y: 0, w: 0, h: 0 };
            ctx.imgSize = { w: 0, h: 0 };
            ctx._imgEl = null;
            ctx.output = 'square';
            ctx.outputSize = 128;
            ctx.outputFormat = 'auto';
            ctx.svgText = '';
            ctx.urlValue = '';
            ctx.rotation = 0;
            ctx.bgColor = 'transparent';
            ctx.zoom = 1;
            ctx.imgTranslateX = 0;
            ctx.imgTranslateY = 0;
            ctx.imgScale = 1;
            ctx.viewportSize = 280;
            ctx.circleDragState = { active: false, startX: 0, startY: 0, startTx: 0, startTy: 0 };
            ctx.mode = currentValue ? 'url' : 'upload';
            if (!currentValue) { modal.imageCropper = true; return; }
            // 加载原图并初始化圆形裁剪
            const rawUrl = currentValue;
            const fixedUrl = isDataUrl(rawUrl) || isHttpUrl(rawUrl) ? rawUrl : rawUrl;
            ctx.urlValue = fixedUrl;
            ctx.sourceImage = '';
            const img = new Image();
            img.onload = () => {
                ctx.sourceImage = fixedUrl;
                ctx._imgEl = img;
                ctx.imgSize = { w: img.naturalWidth, h: img.naturalHeight };
                ctx.viewportSize = 280;
                const vp = ctx.viewportSize;
                // 居中显示：图片按 viewport 等比例缩放后居中
                const ratio = Math.min(vp / img.naturalWidth, vp / img.naturalHeight, 1);
                ctx._dispW = Math.round(img.naturalWidth * ratio);
                ctx._dispH = Math.round(img.naturalHeight * ratio);
                ctx.imgScale = 1;
                ctx.imgTranslateX = Math.round((vp - ctx._dispW) / 2);
                ctx.imgTranslateY = Math.round((vp - ctx._dispH) / 2);
            };
            img.onerror = () => {
                ctx._dispW = 240;
                ctx._dispH = 240;
                ctx.imgTranslateX = Math.round((ctx.viewportSize - 240) / 2);
                ctx.imgTranslateY = Math.round((ctx.viewportSize - 240) / 2);
            };
            img.src = fixedUrl;
            if (img.complete && img.naturalWidth > 0) {
                ctx.sourceImage = fixedUrl;
                ctx._imgEl = img;
                ctx.imgSize = { w: img.naturalWidth, h: img.naturalHeight };
                const vp = ctx.viewportSize;
                const ratio = Math.min(vp / img.naturalWidth, vp / img.naturalHeight, 1);
                ctx._dispW = Math.round(img.naturalWidth * ratio);
                ctx._dispH = Math.round(img.naturalHeight * ratio);
                ctx.imgScale = 1;
                ctx.imgTranslateX = Math.round((vp - ctx._dispW) / 2);
                ctx.imgTranslateY = Math.round((vp - ctx._dispH) / 2);
            }
            modal.imageCropper = true;
        };

        // 关闭裁剪器
        const closeLogoCropper = () => {
            // 先铺一层透明遮罩，防止关闭瞬间的 click/tap 穿透到下层弹窗（如侧边栏顶部设置的“保存”按钮）
            let shield = null;
            if (typeof document !== 'undefined' && modal.imageCropper) {
                shield = document.createElement('div');
                shield.style.cssText = 'position:fixed;inset:0;z-index:99999;background:transparent;cursor:default;';
                document.body.appendChild(shield);
            }
            modal.imageCropper = false;
            editForm.imageCropper.open = false;
            editForm.imageCropper.siteStyleMode = false;
            editForm.imageCropper.isCircleMode = false;
            editForm.imageCropper.shape = 'circle';
            if (shield) {
                setTimeout(() => { try { shield.remove(); } catch (e) {} }, 120);
            }
        };

        // 删除当前广告位图片（仅广告位裁剪器可用）
        const removeAdSlotImage = () => {
            const ctx = editForm.imageCropper;
            if (ctx.target !== 'adSlot' || !ctx.adSide || ctx.adIdx == null) return;
            if (!window.confirm('确定要删除这张广告位图片吗？此操作不可撤销。')) return;
            const slot = data.adSlots[ctx.adSide][ctx.adIdx];
            if (slot) {
                slot.image = '';
                slot.sourceImage = '';
                persistData({ mark: true, silent: true });
            }
            closeLogoCropper();
        };

        // 删除左侧背景图片（展开/收起），仅在对应裁剪器内可用
        const removeSidebarBgImage = () => {
            const ctx = editForm.imageCropper;
            if (ctx.target !== 'sidebarBackground' && ctx.target !== 'sidebarBackgroundCollapsed') return;
            if (!window.confirm('确定要删除这张背景图片吗？此操作不可撤销。')) return;
            const isCollapsed = ctx.target === 'sidebarBackgroundCollapsed';
            const key = isCollapsed ? 'sidebarBackgroundCollapsed' : 'sidebarBackground';
            const formBg = editForm.sidebarTop[key];
            const dataBg = data.site[key];
            if (formBg) { formBg.url = ''; formBg.src = ''; formBg.edit = null; }
            if (dataBg) { dataBg.url = ''; dataBg.src = ''; dataBg.edit = null; }
            persistData({ mark: true, silent: true });
            closeLogoCropper();
        };

        // 共享：把选中的文件读入裁剪器（onCropperFileChange 与 triggerCropperUpload 复用同一份逻辑，避免两套代码走偏）
        const applyCropperFile = (file) => {
            if (!file) return;
            const ctx = editForm.imageCropper;
            ctx._restoreEdit = null; // 重新选择新图：丢弃旧编辑参数，新图从默认状态开始
            // SVG 走文本模式
            if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    ctx.svgText = String(e.target.result || '');
                    ctx.mode = 'svg';
                };
                reader.readAsText(file);
                return;
            }
            const reader = new FileReader();
            reader.onload = (e) => {
                const rawDataUrl = String(e.target.result || '');
                ctx.sourceImage = rawDataUrl;
                ctx.fileName = file.name;
                ctx.fileType = file.type || 'image/png';
                ctx.mode = 'upload';
                // 广告位上传时保留原始原图，便于后续重新编辑裁剪
                if (ctx.target === 'adSlot' && ctx.adSide != null && ctx.adIdx != null) {
                    const slot = data.adSlots[ctx.adSide][ctx.adIdx];
                    if (slot) slot.sourceImage = rawDataUrl;
                }
                // 视口模式：根据「新图」尺寸重新初始化视口 + 裁剪框（关键：不可沿用旧图坐标，
                // 否则 vpCrop 会落在新图之外截出空白 → 保存的广告图不显示）
                if (ctx.siteStyleMode) {
                    nextTick(() => {
                        const img = new Image();
                        img.onload = () => {
                            ctx._imgEl = img;
                            ctx.imgSize = { w: img.naturalWidth, h: img.naturalHeight };
                            const vp = ctx.viewportSize || 280;
                            const ratio = Math.min(vp / img.naturalWidth, vp / img.naturalHeight, 1);
                            ctx._dispW = Math.round(img.naturalWidth * ratio);
                            ctx._dispH = Math.round(img.naturalHeight * ratio);
                            ctx.imgScale = 1;
                            ctx.imgTranslateX = Math.round((vp - ctx._dispW) / 2);
                            ctx.imgTranslateY = Math.round((vp - ctx._dispH) / 2);
                            initVpCropBox(ctx);
                            updateCropPreview();
                        };
                        img.src = ctx.sourceImage;
                    });
                } else {
                    nextTick(() => initCropBox());
                }
            };
            reader.readAsDataURL(file);
        };

        // 文件选择 -> 读取为 dataURL（<input> change 事件入口）
        const onCropperFileChange = (event) => {
            const file = event.target.files && event.target.files[0];
            applyCropperFile(file);
            // 清空 input value，允许重复选择同一文件
            event.target.value = '';
        };

        // 视口模式下的程序化上传（绕过父级 pointer capture 干扰）—— 复用 applyCropperFile
        const triggerCropperUpload = () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.style.display = 'none';
            input.addEventListener('change', (e) => {
                const file = e.target.files && e.target.files[0];
                applyCropperFile(file);
            });
            document.body.appendChild(input);
            input.click();
            // 清理临时 input
            setTimeout(() => { if (input.parentNode) input.parentNode.removeChild(input); }, 3000);
        };

        // 图片加载完成后初始化裁剪框（正方形居中默认）
        const initCropBox = () => {
            const ctx = editForm.imageCropper;
            if (!ctx.sourceImage) return;
            const img = new Image();
            img.onload = () => {
                ctx.imgSize = { w: img.naturalWidth, h: img.naturalHeight };
                if (ctx.target === 'headerLogo') {
                    // 侧边栏顶部 Logo：图片按比例适配内缩裁剪框（cropBox）内并居中
                    const vp = ctx.viewportSize || 640;
                    const cropBox = vp - 2 * (ctx.hLogoMargin || HLOGO_MARGIN);
                    const ratio = Math.min(cropBox / img.naturalWidth, cropBox / img.naturalHeight, 1);
                    ctx._dispW = Math.round(img.naturalWidth * ratio);
                    ctx._dispH = Math.round(img.naturalHeight * ratio);
                    ctx.imgScale = 1;
                    ctx.imgTranslateX = Math.round((vp - ctx._dispW) / 2);
                    ctx.imgTranslateY = Math.round((vp - ctx._dispH) / 2);
                    ctx._imgEl = img;
                    ctx.hLogoBox = { x: ctx.hLogoMargin || HLOGO_MARGIN, y: ctx.hLogoMargin || HLOGO_MARGIN, w: cropBox, h: cropBox };
                    // 还原上次编辑参数（"保存原图方便日后调整"）：从原图 + 参数精确恢复上次状态
                    const _re = ctx._restoreEdit;
                    if (_re && typeof _re === 'object') {
                        ctx.imgScale = (_re.imgScale != null) ? _re.imgScale : 1;
                        ctx.imgTranslateX = (_re.imgTranslateX != null) ? _re.imgTranslateX : ctx.imgTranslateX;
                        ctx.imgTranslateY = (_re.imgTranslateY != null) ? _re.imgTranslateY : ctx.imgTranslateY;
                        if (_re.box) ctx.hLogoBox = { x: _re.box.x, y: _re.box.y, w: _re.box.w, h: _re.box.h };
                        ctx.hLogoBg = (_re.bg != null) ? _re.bg : 'transparent';
                        ctx.hLogoRotation = (_re.rotation != null) ? _re.rotation : 0;
                        if (_re.outputSize != null) ctx.outputSize = _re.outputSize;
                        if (_re.outputFormat) ctx.outputFormat = _re.outputFormat;
                        if (_re.outputQuality != null) ctx.outputQuality = _re.outputQuality;
                        if (_re.bgOpacity != null) ctx.bgOpacity = _re.bgOpacity;
                        ctx._restoreEdit = null;
                    }
                } else {
                    // 其余场景（单个网站图标等）：保持原可移动裁剪框逻辑
                    const previewMax = 320;
                    const ratio = Math.min(previewMax / img.naturalWidth, previewMax / img.naturalHeight, 1);
                    const dispW = img.naturalWidth * ratio;
                    const dispH = img.naturalHeight * ratio;
                    // 默认正方形裁剪框，缩到图片短边的 60%
                    const side = Math.min(dispW, dispH) * 0.6;
                    ctx.crop = {
                        x: Math.round((dispW - side) / 2),
                        y: Math.round((dispH - side) / 2),
                        w: Math.round(side),
                        h: Math.round(side)
                    };
                    ctx._imgEl = img;
                    ctx._dispW = dispW;
                    ctx._dispH = dispH;
                    ctx.imgTranslateX = 0;
                    ctx.imgTranslateY = 0;
                }
            };
            img.src = ctx.sourceImage;
        };

        // 视口模式：初始化可拖拽裁剪框（包裹图片内容，四周留空间）
        const initVpCropBox = (ctx) => {
            const vp = ctx.viewportSize || 280;
            const dispW = ctx._dispW || vp;
            const dispH = ctx._dispH || vp;
            const tx = ctx.imgTranslateX || 0;
            const ty = ctx.imgTranslateY || 0;
            // 裁剪框 = 图片显示区域 + 四周留空间，约束为输出比例
            const margin = Math.max(Math.round(vp * 0.10), 12);
            let cropX = Math.max(0, tx - margin);
            let cropY = Math.max(0, ty - margin);
            let cropW = Math.min(vp - cropX, dispW + margin * 2);
            let cropH = Math.min(vp - cropY, dispH + margin * 2);
            // 约束为广告格比例（即 outputSizeW : outputSizeH）
            const _oW = Number(ctx.outputSizeW) || 380;
            const _oH = Number(ctx.outputSizeH) || 49;
            const targetRatio = _oW / _oH;
            if (cropH > 0) {
                const targetW = Math.round(cropH * targetRatio);
                if (targetW <= vp - cropX) {
                    cropW = targetW;
                } else {
                    cropW = Math.min(cropW, vp - cropX);
                    cropH = Math.round(cropW / targetRatio);
                }
            }
            // ★ 比例约束后，让裁剪框在图片显示区域内居中
            const imgCenterX = tx + Math.round(dispW / 2);
            const imgCenterY = ty + Math.round(dispH / 2);
            cropX = Math.max(0, Math.min(vp - cropW, imgCenterX - Math.round(cropW / 2)));
            cropY = Math.max(0, Math.min(vp - cropH, imgCenterY - Math.round(cropH / 2)));
            // 确保不超出视口
            cropW = Math.min(cropW, vp - cropX);
            cropH = Math.min(cropH, vp - cropY);
            // 最小尺寸
            if (cropW < 60) cropW = 60;
            if (cropH < 25) cropH = 25;
            // 逐属性赋值确保 Vue 响应式更新
            ctx.vpCrop.x = Math.round(cropX);
            ctx.vpCrop.y = Math.round(cropY);
            ctx.vpCrop.w = Math.round(cropW);
            ctx.vpCrop.h = Math.round(cropH);
        };

        // 延迟保险：确保裁剪框在 DOM 渲染后正确对齐图片
        const deferredInitVpCrop = () => {
            const ctx = editForm.imageCropper;
            if (!ctx.sourceImage) return;
            nextTick(() => {
                setTimeout(() => {
                    if (ctx._dispW > 0 && ctx._dispH > 0) {
                        initVpCropBox(ctx);
                        updateCropPreview();
                    }
                }, 80);
            });
        };

        // 视口裁剪框拖拽/缩放事件处理
        const onVpCropPointerDown = (e, mode) => {
            e.preventDefault();
            e.stopPropagation();
            const ctx = editForm.imageCropper;
            const vpEl = e.currentTarget.closest && e.currentTarget.closest('.circle-cropper-viewport');
            ctx.vpCropDrag.active = true;
            ctx.vpCropDrag.mode = mode; // 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e'
            ctx.vpCropDrag.startX = e.clientX;
            ctx.vpCropDrag.startY = e.clientY;
            ctx.vpCropDrag.startCrop = { ...ctx.vpCrop };
            // 统一在视口层捕获指针，保证拖拽期间事件稳定送达（避免指针移出框后丢事件）
            if (vpEl) { try { vpEl.setPointerCapture(e.pointerId); } catch (_) {} }
        };
        const onVpCropPointerMove = (e) => {
            const ctx = editForm.imageCropper;
            if (!ctx.vpCropDrag.active) return;
            const vp = ctx.viewportSize || 280;
            const dx = e.clientX - ctx.vpCropDrag.startX;
            const dy = e.clientY - ctx.vpCropDrag.startY;
            const s = ctx.vpCropDrag.startCrop;
            const minSz = 30;
            let { x, y, w, h } = s;
            if (ctx.vpCropDrag.mode === 'move') {
                x = Math.max(0, Math.min(vp - w, s.x + dx));
                y = Math.max(0, Math.min(vp - h, s.y + dy));
            } else if (ctx.vpCropDrag.mode === 'se') {
                w = Math.max(minSz, Math.min(vp - s.x, s.w + dx));
                h = Math.max(minSz, Math.min(vp - s.y, s.h + dy));
            } else if (ctx.vpCropDrag.mode === 'sw') {
                const nw = Math.max(minSz, s.w - dx);
                x = s.x + s.w - nw;
                if (x < 0) { w = s.w + x; x = 0; } else { w = nw; }
                h = Math.max(minSz, Math.min(vp - s.y, s.h + dy));
            } else if (ctx.vpCropDrag.mode === 'ne') {
                w = Math.max(minSz, Math.min(vp - s.x, s.w + dx));
                const nh = Math.max(minSz, s.h - dy);
                y = s.y + s.h - nh;
                if (y < 0) { h += y; y = 0; }
                h = Math.max(minSz, nh);
            } else if (ctx.vpCropDrag.mode === 'nw') {
                const nw = Math.max(minSz, s.w - dx);
                const nh = Math.max(minSz, s.h - dy);
                x = s.x + s.w - nw;
                y = s.y + s.h - nh;
                if (x < 0) { nw += x; x = 0; }
                if (y < 0) { nh += y; y = 0; }
                w = Math.max(minSz, nw);
                h = Math.max(minSz, nh);
            } else if (ctx.vpCropDrag.mode === 'n') {
                const nh = Math.max(minSz, s.h - dy);
                y = s.y + s.h - nh;
                if (y < 0) { h += y; y = 0; }
                h = nh;
            } else if (ctx.vpCropDrag.mode === 's') {
                h = Math.max(minSz, Math.min(vp - s.y, s.h + dy));
            } else if (ctx.vpCropDrag.mode === 'w') {
                const nw = Math.max(minSz, s.w - dx);
                x = s.x + s.w - nw;
                if (x < 0) { w += x; x = 0; }
                w = nw;
            } else if (ctx.vpCropDrag.mode === 'e') {
                w = Math.max(minSz, Math.min(vp - s.x, s.w + dx));
            }
            ctx.vpCrop = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
            // 宽高比锁定：角拖与边拖都严格保持比例（兼容 'output' 动态比例）
            if (ctx.lockRatio && ctx.aspectRatio !== 'free' && ctx.vpCropDrag.mode !== 'move') {
                let targetRatio;
                if (ctx.aspectRatio === 'output') {
                    targetRatio = (ctx.outputSizeW || 190) / Math.max(1, ctx.outputSizeH || 49);
                } else {
                    const rp = ctx.ratioPresets.find(r => r.value === ctx.aspectRatio);
                    if (rp) targetRatio = rp.w / rp.h;
                }
                if (targetRatio > 0) {
                    const c = ctx.vpCrop;
                    const m = ctx.vpCropDrag.mode;
                    // 锚点：被拖动边固定，对边随之移动
                    const fixedLeft   = (m === 'se' || m === 'ne' || m === 'e');
                    const fixedTop    = (m === 'se' || m === 'sw' || m === 's');
                    const fixedRight  = (m === 'sw' || m === 'nw' || m === 'w');
                    const fixedBottom = (m === 'ne' || m === 'nw' || m === 'n');
                    const anchorX = fixedLeft ? s.x : (s.x + s.w);
                    const anchorY = fixedTop ? s.y : (s.y + s.h);
                    // 锚点可用空间
                    const maxWByX = vp - anchorX;
                    const maxHByY = vp - anchorY;
                    // 以宽为基准（水平跟手），再由宽推算高；高不足最小值时反推宽
                    let newW = Math.max(minSz, c.w);
                    let newH = Math.round(newW / targetRatio);
                    if (newH < minSz) { newH = minSz; newW = Math.max(minSz, Math.round(newH * targetRatio)); }
                    // 受锚点可用空间约束（取更紧的维度为基准，循环收敛）
                    let guard = 0;
                    while (guard++ < 4) {
                        if (newW > maxWByX) { newW = Math.max(minSz, maxWByX); newH = Math.round(newW / targetRatio); }
                        if (newH > maxHByY) { newH = Math.max(minSz, maxHByY); newW = Math.round(newH * targetRatio); }
                        if (newW <= maxWByX && newH <= maxHByY) break;
                    }
                    // 定位：保持被拖动边不动
                    c.x = fixedLeft ? s.x : anchorX - newW;
                    c.y = fixedTop ? s.y : anchorY - newH;
                    // 最终兜底：若仍越界（拖到视口边界），整体平移回视口内（不改尺寸、保持比例）
                    if (c.x < 0) c.x = 0;
                    if (c.y < 0) c.y = 0;
                    if (c.x + newW > vp) c.x = Math.max(0, vp - newW);
                    if (c.y + newH > vp) c.y = Math.max(0, vp - newH);
                    c.w = newW;
                    c.h = newH;
                }
            }
        };
        const onVpCropPointerUp = () => {
            const ctx = editForm.imageCropper;
            ctx.vpCropDrag.active = false;
            ctx.vpCropDrag.mode = '';
            updateCropPreview();
        };
        // 侧边栏顶部 Logo：裁剪框主体拖拽 = 移动裁剪框位置（图片不动）
        const hLogoBoxDrag = { active: false, startX: 0, startY: 0, startX_box: 0, startY_box: 0 };
        // 四角手柄拖拽 = 缩放裁剪框（保持正方形，图片不动）
        const hLogoHandleDrag = { active: false, startX: 0, startY: 0, corner: 'se', startBox: { x: 0, y: 0, w: 0, h: 0 } };
        const onHeaderLogoHandleDown = (e, corner) => {
            e.preventDefault();
            e.stopPropagation();
            const ctx = editForm.imageCropper;
            hLogoHandleDrag.active = true;
            hLogoHandleDrag.corner = corner;
            hLogoHandleDrag.startX = e.clientX;
            hLogoHandleDrag.startY = e.clientY;
            hLogoHandleDrag.startBox = { ...(ctx.hLogoBox || { x: 50, y: 50, w: 220, h: 220 }) };
            try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
        };
        // 裁剪框主体拖拽 = 移动裁剪框位置（图片不动）
        const onHeaderLogoBoxDown = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const ctx = editForm.imageCropper;
            hLogoBoxDrag.active = true;
            hLogoBoxDrag.startX = e.clientX;
            hLogoBoxDrag.startY = e.clientY;
            hLogoBoxDrag.startX_box = ctx.hLogoBox ? ctx.hLogoBox.x : 50;
            hLogoBoxDrag.startY_box = ctx.hLogoBox ? ctx.hLogoBox.y : 50;
            const vpEl = e.currentTarget.closest && e.currentTarget.closest('.circle-cropper-viewport');
            if (vpEl) { try { vpEl.setPointerCapture(e.pointerId); } catch (_) {} }
        };

        // 视口统一指针分发：所有 move/up 事件都收敛到视口层，
        // 根据当前激活的拖拽状态分别派发给图片拖拽或裁剪框拖拽，避免指针捕获冲突
        const onViewportPointerMove = (e) => {
            const ctx = editForm.imageCropper;
            // 四角手柄拖拽：缩放裁剪框（保持正方形，以对角为锚点，图片不动）
            if (hLogoHandleDrag.active) {
                const vp = ctx.viewportSize || 320;
                const minSz = 30;
                const s = hLogoHandleDrag.startBox;
                const dx = e.clientX - hLogoHandleDrag.startX;
                const dy = e.clientY - hLogoHandleDrag.startY;
                const c = hLogoHandleDrag.corner; // 'tl' | 'tr' | 'bl' | 'br'
                // 锚点 = 与拖拽角相对的固定角（保持正方形，图片不动）
                let ax, ay, nx, ny;
                let ns = s.w + (dx + dy) / 2;
                if (c === 'br') { ax = s.x; ay = s.y; ns = Math.min(ns, vp - ax, vp - ay); nx = ax; ny = ay; }
                else if (c === 'tl') { ax = s.x + s.w; ay = s.y + s.h; ns = Math.min(ns, ax, ay); nx = ax - ns; ny = ay - ns; }
                else if (c === 'tr') { ax = s.x; ay = s.y + s.h; ns = Math.min(ns, ay, vp - ax); nx = ax; ny = ay - ns; }
                else { ax = s.x + s.w; ay = s.y; ns = Math.min(ns, ax, vp - ay); nx = ax - ns; ny = ay; } // bl
                ns = Math.max(minSz, ns);
                if (c === 'br') { nx = ax; ny = ay; }
                else if (c === 'tl') { nx = ax - ns; ny = ay - ns; }
                else if (c === 'tr') { nx = ax; ny = ay - ns; }
                else { nx = ax - ns; ny = ay; } // bl
                ctx.hLogoBox = { x: Math.round(nx), y: Math.round(ny), w: Math.round(ns), h: Math.round(ns) };
                updateCropPreview();
                return;
            }
            // 裁剪框主体拖拽：移动框位置（图片不动）
            if (hLogoBoxDrag.active) {
                const vp = ctx.viewportSize || 320;
                const box = ctx.hLogoBox || { x: 50, y: 50, w: 220, h: 220 };
                const dx = e.clientX - hLogoBoxDrag.startX;
                const dy = e.clientY - hLogoBoxDrag.startY;
                const nx = Math.max(0, Math.min(vp - box.w, hLogoBoxDrag.startX_box + dx));
                const ny = Math.max(0, Math.min(vp - box.h, hLogoBoxDrag.startY_box + dy));
                ctx.hLogoBox = { x: Math.round(nx), y: Math.round(ny), w: box.w, h: box.h };
                updateCropPreview();
                return;
            }
            if (ctx.circleDragState && ctx.circleDragState.active) onCirclePointerMove(e);
            if (ctx.vpCropDrag && ctx.vpCropDrag.active) onVpCropPointerMove(e);
        };
        const onViewportPointerUp = () => {
            const ctx = editForm.imageCropper;
            if (hLogoHandleDrag.active) hLogoHandleDrag.active = false;
            if (hLogoBoxDrag.active) hLogoBoxDrag.active = false;
            if (ctx.circleDragState && ctx.circleDragState.active) onCirclePointerUp();
            if (ctx.vpCropDrag && ctx.vpCropDrag.active) onVpCropPointerUp();
        };

        // 宽高比预设选择
        const setAspectRatio = (ratio) => {
            const ctx = editForm.imageCropper;
            ctx.aspectRatio = ratio;
            ctx.lockRatio = true;
            if (!ctx.vpCrop || !ctx.sourceImage) return;
            const vp = ctx.viewportSize || 280;
            let targetRatio;
            if (ratio === 'output') {
                targetRatio = (ctx.outputSizeW || 190) / Math.max(1, ctx.outputSizeH || 49);
            } else {
                const rp = ctx.ratioPresets.find(r => r.value === ratio);
                if (!rp) return;
                targetRatio = rp.w / rp.h;
            }
            const center = { x: ctx.vpCrop.x + ctx.vpCrop.w / 2, y: ctx.vpCrop.y + ctx.vpCrop.h / 2 };
            const maxSize = Math.min(vp - ctx.vpCrop.x, vp - ctx.vpCrop.y, ctx.vpCrop.w, ctx.vpCrop.h) * 0.9;
            let newW, newH;
            if (targetRatio >= 1) {
                newW = Math.max(30, maxSize);
                newH = newW / targetRatio;
                if (center.y + newH / 2 > vp) { newH = vp - center.y * 2; newW = newH * targetRatio; }
            } else {
                newH = Math.max(30, maxSize);
                newW = newH * targetRatio;
                if (center.x + newW / 2 > vp) { newW = vp - center.x * 2; newH = newW / targetRatio; }
            }
            ctx.vpCrop = {
                x: Math.round(center.x - newW / 2),
                y: Math.round(center.y - newH / 2),
                w: Math.round(newW),
                h: Math.round(newH)
            };
        };

        // 切换宽高比锁定
        const toggleRatioLock = () => {
            const ctx = editForm.imageCropper;
            ctx.lockRatio = !ctx.lockRatio;
            if (!ctx.lockRatio) {
                ctx.aspectRatio = 'free';   // 自由模式时清掉比例，避免与预设按钮同时高亮
            } else if (ctx.aspectRatio === 'free') {
                ctx.aspectRatio = 'output';  // 重新上锁时若仍是 free，则默认锁定到输出比例，保证锁图标与实际行为一致
            }
        };

        // 更新右侧预览 Canvas
        const updateCropPreview = () => {
            // 延迟到 nextTick 确保 DOM 已更新
            setTimeout(() => {
                const canvas = document.querySelector('.icp-preview-canvas');
                if (!canvas) {
                    // 弹窗可能尚未渲染，延迟重试（最多 5 次，避免无限循环）
                    if (!updateCropPreview._retries) updateCropPreview._retries = 0;
                    if (updateCropPreview._retries < 5 && modal.imageCropper) {
                        updateCropPreview._retries++;
                        setTimeout(() => updateCropPreview(), 150);
                    } else {
                        updateCropPreview._retries = 0;
                    }
                    return;
                }
                updateCropPreview._retries = 0;
                const ctx = editForm.imageCropper;

                // ===== 广告位 / 左侧背景：按裁剪框 vpCrop 区域绘制到 outputSizeW×outputSizeH =====
                if (ctx.target === 'adSlot' || ctx.target === 'sidebarBackground' || ctx.target === 'sidebarBackgroundCollapsed') {
                    const vp = ctx.viewportSize || 280;
                    const s = ctx.imgScale || 1;
                    const dx = ctx.imgTranslateX || 0;
                    const dy = ctx.imgTranslateY || 0;
                    const dispW = ctx._dispW || vp;
                    const dispH = ctx._dispH || vp;
                    const outW = Number(ctx.outputSizeW) || 190;
                    const outH = Number(ctx.outputSizeH) || 49;
                    canvas.width = outW;
                    canvas.height = outH;
                    const c = canvas.getContext('2d');
                    c.clearRect(0, 0, outW, outH);

                    // 侧边栏背景：先填充背景色（裁剪器内"背景"按钮组的字段即 ctx.hLogoBg），再绘制图片
                    if (ctx.target === 'sidebarBackground' || ctx.target === 'sidebarBackgroundCollapsed') {
                        const bg = ctx.hLogoBg || 'transparent';
                        if (bg !== 'transparent') {
                            c.fillStyle = bg;
                            c.fillRect(0, 0, outW, outH);
                        }
                    }

                    // 绘制函数：裁剪框按实际重叠区域映射到画布
                    const doDraw = (imgEl) => {
                        const nw = imgEl.naturalWidth, nh = imgEl.naturalHeight;
                        if (!nw || !nh) return;
                        const cr = ctx.vpCrop ? { x: ctx.vpCrop.x, y: ctx.vpCrop.y, w: ctx.vpCrop.w, h: ctx.vpCrop.h } : { x: 0, y: 0, w: vp, h: vp };
                        const sxAll = (cr.x - dx) / s * nw / dispW;
                        const syAll = (cr.y - dy) / s * nh / dispH;
                        const swAll = cr.w / s * nw / dispW;
                        const shAll = cr.h / s * nh / dispH;
                        // 截取与图片重叠的部分
                        const sx = Math.round(Math.max(0, sxAll));
                        const sy = Math.round(Math.max(0, syAll));
                        const sw = Math.round(Math.min(nw - sx, swAll - Math.max(0, -sxAll)));
                        const sh = Math.round(Math.min(nh - sy, shAll - Math.max(0, -syAll)));
                        if (sw <= 0 || sh <= 0) return;
                        // 画布目标位置按重叠部分比例映射
                        const destX = Math.round(Math.max(0, -sxAll) / swAll * outW);
                        const destY = Math.round(Math.max(0, -syAll) / shAll * outH);
                        const destW = Math.round(sw / swAll * outW);
                        const destH = Math.round(sh / shAll * outH);
                        c.save();
                        c.globalAlpha = (ctx.iconOpacity != null ? ctx.iconOpacity : 100) / 100;
                        c.drawImage(imgEl, sx, sy, sw, sh, destX, destY, destW, destH);
                        c.restore();
                    };

                    // 优先使用已加载好的 _imgEl（同步绘制，无竞态）
                    if (ctx._imgEl && ctx._imgEl.naturalWidth > 0) {
                        doDraw(ctx._imgEl);
                        return;
                    }
                    // Fallback：_imgEl 不可用时新建 Image 异步加载
                    if (!ctx.sourceImage && !editForm.site.logo) return;
                    const imgSrc = ctx.sourceImage || (isDataUrl(editForm.site.logo) ? editForm.site.logo : editForm.site.logo);
                    const img = new Image();
                    img.onload = () => { doDraw(img); };
                    img.src = imgSrc;
                    return;
                }

                // ===== 侧边栏顶部 Logo：绘制裁剪框区域（所见即所得，含背景填充 + 旋转） =====
                if (ctx.target === 'headerLogo') {
                    const outSize = ctx.outputSize || 200;
                    canvas.width = outSize;
                    canvas.height = outSize;
                    const c = canvas.getContext('2d');
                    c.clearRect(0, 0, outSize, outSize);
                    const draw = (img) => {
                        const vp = ctx.viewportSize || 320;
                        const s = ctx.imgScale || 1;
                        const tx = ctx.imgTranslateX || 0;
                        const ty = ctx.imgTranslateY || 0;
                        const dispW = ctx._dispW || vp;
                        const dispH = ctx._dispH || vp;
                        const bx = ctx.hLogoBox ? ctx.hLogoBox.x : (ctx.hLogoMargin || HLOGO_MARGIN);
                        const by = ctx.hLogoBox ? ctx.hLogoBox.y : (ctx.hLogoMargin || HLOGO_MARGIN);
                        const bw = ctx.hLogoBox ? ctx.hLogoBox.w : (vp - 2 * (ctx.hLogoMargin || HLOGO_MARGIN));
                        const deg = (ctx.hLogoRotation || 0) * Math.PI / 180;
                        const k = outSize / bw;
                        // 1) 背景填充：裁剪框内未被图片覆盖的部分填充选中背景（透明则保留透明，所见即所得）
                        const bg = ctx.hLogoBg || 'transparent';
                        if (bg !== 'transparent') {
                            c.fillStyle = bg;
                            c.fillRect(0, 0, outSize, outSize);
                        }
                        // 2) 复刻预览变换，截取裁剪框区域
                        c.save();
                        c.scale(k, k);
                        c.translate(-bx, -by);
                        c.translate(tx, ty);
                        c.scale(s, s);
                        c.translate(dispW / 2, dispH / 2);
                        c.rotate(deg);
                        c.translate(-dispW / 2, -dispH / 2);
                        c.imageSmoothingEnabled = true;
                        c.imageSmoothingQuality = 'high';
                        c.drawImage(img, 0, 0, dispW, dispH);
                        c.restore();
                    };
                    if (ctx._imgEl && ctx._imgEl.naturalWidth > 0) {
                        draw(ctx._imgEl);
                        return;
                    }
                    const imgSrc = ctx.sourceImage || editForm.headerConfig.logoLight || editForm.headerConfig.logoDark;
                    if (!imgSrc) return;
                    const img = new Image();
                    img.onload = () => draw(img);
                    img.src = imgSrc;
                    return;
                }

                // ===== 头像/圆形模式：原正方形预览逻辑 =====
                const outSize = ctx.outputSize || 64;
                canvas.width = outSize;
                canvas.height = outSize;
                const c = canvas.getContext('2d');
                c.clearRect(0, 0, outSize, outSize);

                if (!ctx.sourceImage && !editForm.site.logo) return;

                const imgSrc = ctx.sourceImage || (isDataUrl(editForm.site.logo) ? editForm.site.logo : editForm.site.logo);
                const img = new Image();
                img.onload = () => {
                    c.save();
                    // 圆形裁切
                    if (ctx.shape === 'circle') {
                        c.beginPath();
                        c.arc(outSize/2, outSize/2, outSize/2, 0, Math.PI*2);
                        c.clip();
                    }
                    // 旋转
                    if (ctx.rotation !== 0) {
                        c.translate(outSize/2, outSize/2);
                        c.rotate(ctx.rotation * Math.PI/180);
                        c.translate(-outSize/2, -outSize/2);
                    }
                    // 绘制图片（覆盖填充）
                    c.drawImage(img, 0, 0, outSize, outSize);
                    c.restore();
                };
                img.src = imgSrc;
            }, 30);
        };

        // 切换裁剪形状（square / round），刷新预览框圆角指示
        const setCropperShape = (shape) => {
            if (shape !== 'round' && shape !== 'square') return;
            editForm.imageCropper.shape = shape;
            if (typeof updateCropPreview === 'function') updateCropPreview();
        };

        // 广告位裁剪弹窗：当前广告位填充方式（object-fit）计算属性与设置方法
        const adSlotFit = computed(() => {
            const ctx = editForm.imageCropper;
            if (ctx.adSide == null || ctx.adIdx == null) return 'contain';
            const slot = data.adSlots[ctx.adSide] && data.adSlots[ctx.adSide][ctx.adIdx];
            return (slot && slot.fit === 'cover') ? 'cover' : 'contain';
        });
        const setAdSlotFit = (v) => {
            const ctx = editForm.imageCropper;
            if (ctx.adSide == null || ctx.adIdx == null) return;
            const slot = data.adSlots[ctx.adSide] && data.adSlots[ctx.adSide][ctx.adIdx];
            if (slot) slot.fit = (v === 'cover') ? 'cover' : 'contain';
        };
        // 广告位裁剪弹窗：当前正在编辑的广告位及其闪烁配置
        const currentAdSlot = computed(() => {
            const ctx = editForm.imageCropper;
            if (ctx.adSide == null || ctx.adIdx == null) return null;
            return data.adSlots[ctx.adSide] && data.adSlots[ctx.adSide][ctx.adIdx];
        });
        const currentAdSlotBlink = computed(() => {
            const slot = currentAdSlot.value;
            return slot ? slot.blink : null;
        });
        // 广告位输出预览闪烁类：开启"图片闪烁"时让右侧"输出预览"画布实时闪烁（AVIF 等格式同样生效）
        const adSlotOutputBlinkClass = computed(() => {
            const ctx = editForm.imageCropper;
            if (!ctx || ctx.target !== 'adSlot' || ctx.adSide == null || ctx.adIdx == null) return '';
            const slot = data.adSlots[ctx.adSide] && data.adSlots[ctx.adSide][ctx.adIdx];
            if (!slot || !slot.blink) return '';
            return 'ad-blink-' + ctx.adSide + '-' + ctx.adIdx;
        });
        const applyCurrentAdBlinkPreset = (presetKey) => {
            const ctx = editForm.imageCropper;
            if (ctx.adSide == null || ctx.adIdx == null) return;
            applyAdBlinkPreset(ctx.adSide, ctx.adIdx, presetKey);
        };
        // 广告位：背景色选项（透明 + 自定义颜色 + 彩虹渐变）
        const adSlotBackgrounds = [
            { key: 'transparent', css: null },
            { key: 'gradient', css: 'linear-gradient(135deg, #ff4d4f, #ff7a45, #ffec3d, #73d13d, #36cfc9, #40a9ff, #9254de)' }
        ];
        const currentAdSlotBackground = computed(() => {
            const slot = currentAdSlot.value;
            return (slot && slot.background) ? slot.background : 'transparent';
        });
        const currentAdSlotBackgroundCss = computed(() => {
            const key = currentAdSlotBackground.value;
            if (key === 'transparent') return null;
            if (key === 'gradient') return adSlotBackgrounds.find(b => b.key === 'gradient').css;
            // 自定义颜色：直接作为 css 颜色值使用
            return key || null;
        });
        const setAdSlotBackground = (v) => {
            const slot = currentAdSlot.value;
            if (!slot) return;
            if (v === 'transparent' || v === 'gradient') {
                slot.background = v;
            } else if (v === 'custom') {
                slot.background = adSlotBgPicker.color;
            } else if (typeof v === 'string' && v.startsWith('#')) {
                slot.background = v;
                try {
                    const rgb = hexToRgb(v);
                    adSlotBgPicker.r = rgb[0]; adSlotBgPicker.g = rgb[1]; adSlotBgPicker.b = rgb[2];
                    syncAdSlotBgHsvFromRgb();
                } catch (e) {}
            }
        };

        // 广告位：修改输出宽/高后，重新校正裁剪框比例并刷新预览
        const onAdOutputSizeChange = () => {
            const ctx = editForm.imageCropper;
            // 反向同步到广告位尺寸：让"输出尺寸"成为唯一裁剪入口，驱动访客端 CSS 与裁剪画布一致
            if (data.adSlots) {
                const _unified = data.adSlots.unifiedSize !== false;
                if (!_unified && ctx.adSide != null && ctx.adIdx != null) {
                    // 非统一模式：写回当前广告位 slot 的独立尺寸
                    const _slot = data.adSlots[ctx.adSide] && data.adSlots[ctx.adSide][ctx.adIdx];
                    if (_slot) {
                        _slot.width = ctx.outputSizeW;
                        _slot.height = ctx.outputSizeH;
                    }
                } else {
                    // 统一模式：写回全局尺寸，所有广告位共用
                    data.adSlots.width = ctx.outputSizeW;
                    data.adSlots.height = ctx.outputSizeH;
                }
            }
            initVpCropBox(ctx);
            updateCropPreview();
        };

        // 拖动 / 缩放裁剪框（pointer 事件统一处理）
        const cropDragState = { active: false, mode: 'move', startX: 0, startY: 0, startCrop: null };
        const onCropPointerDown = (e, mode) => {
            e.preventDefault();
            cropDragState.active = true;
            cropDragState.mode = mode;
            cropDragState.startX = e.clientX;
            cropDragState.startY = e.clientY;
            cropDragState.startCrop = { ...editForm.imageCropper.crop };
            try { e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); } catch (_) {}
        };
        const onCropPointerMove = (e) => {
            if (!cropDragState.active) return;
            const ctx = editForm.imageCropper;
            const zoom = ctx.zoom || 1;
            // headerLogo 裁剪框在固定层（不随图片缩放），屏幕坐标=画布坐标，无需除以 zoom
            const boxZoom = (ctx.target === 'headerLogo') ? 1 : zoom;
            const dispW = ctx._dispW || 320;
            const dispH = ctx._dispH || 320;
            // 鼠标增量需要除以 zoom，保持坐标系统独立于缩放倍数
            const dx = (e.clientX - cropDragState.startX) / boxZoom;
            const dy = (e.clientY - cropDragState.startY) / boxZoom;
            const start = cropDragState.startCrop;
            const minSide = 20;
            let { x, y, w, h } = start;
            if (cropDragState.mode === 'move') {
                x = Math.max(0, Math.min(dispW - w, start.x + dx));
                y = Math.max(0, Math.min(dispH - h, start.y + dy));
            } else if (cropDragState.mode === 'se') {
                w = Math.max(minSide, Math.min(dispW - start.x, start.w + dx));
                h = Math.max(minSide, Math.min(dispH - start.y, start.h + dy));
                // 保持正方形：以变化量绝对值大的一边为准
                const delta = Math.max(Math.abs(dx), Math.abs(dy));
                w = Math.max(minSide, Math.min(dispW - start.x, start.w + (dx >= 0 ? delta : -delta)));
                h = Math.max(minSide, Math.min(dispH - start.y, start.h + (dy >= 0 ? delta : -delta)));
                const side = Math.min(w, h);
                w = h = side;
            } else if (cropDragState.mode === 'nw') {
                const delta = Math.max(Math.abs(dx), Math.abs(dy));
                const newSide = Math.max(minSide, Math.min(start.w - (dx >= 0 ? -delta : delta), start.h - (dy >= 0 ? -delta : delta)));
                x = start.x + (start.w - newSide);
                y = start.y + (start.h - newSide);
                w = h = newSide;
                if (x < 0) { w += x; x = 0; }
                if (y < 0) { h += y; y = 0; }
            }
            ctx.crop = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
            if (ctx.target === 'headerLogo') clampCropPan(ctx);
        };
        const onCropPointerUp = () => {
            cropDragState.active = false;
        };
        // 侧边栏顶部 Logo：夹紧图片平移，使图片始终完整覆盖固定裁剪框（WYSIWYG）
        const clampCropPan = (ctx) => {
            if (ctx.target !== 'headerLogo') return;
            const zoom = ctx.zoom || 1;
            const dispW = ctx._dispW || 1, dispH = ctx._dispH || 1;
            const Cx = dispW / 2, Cy = dispH / 2;
            const c = ctx.crop || { x: 0, y: 0, w: 0, h: 0 };
            const baseX = (1 - zoom) * Cx;
            const baseY = (1 - zoom) * Cy;
            const minTx = c.x + c.w - baseX - dispW * zoom;
            const maxTx = c.x - baseX;
            const minTy = c.y + c.h - baseY - dispH * zoom;
            const maxTy = c.y - baseY;
            ctx.imgTranslateX = Math.round(Math.max(minTx, Math.min(maxTx, ctx.imgTranslateX || 0)));
            ctx.imgTranslateY = Math.round(Math.max(minTy, Math.min(maxTy, ctx.imgTranslateY || 0)));
        };

        // ============ 圆形/方形图标裁剪器（拖拽图片平移） ============
        const onCirclePointerDown = (e) => {
            const ctx = editForm.imageCropper;
            const ds = ctx.circleDragState;
            ds.active = true;
            ds.startX = e.clientX;
            ds.startY = e.clientY;
            ds.startTx = ctx.imgTranslateX;
            ds.startTy = ctx.imgTranslateY;
            // 在视口上设置指针捕获，确保拖拽时持续收到事件
            const vp = e.currentTarget;
            if (vp) { try { vp.setPointerCapture(e.pointerId); } catch(_) {} }
        };
        const onCirclePointerMove = (e) => {
            const ds = editForm.imageCropper.circleDragState;
            if (!ds.active) return;
            const ctx = editForm.imageCropper;
            const vp = ctx.viewportSize;
            const s = ctx.imgScale || 1;
            const dispW = ctx._dispW || vp;
            const dispH = ctx._dispH || vp;
            const dx = e.clientX - ds.startX;
            const dy = e.clientY - ds.startY;
            // 除以缩放倍率，确保图片跟随鼠标精确移动（transform: translate + scale）
            let tx = ds.startTx + dx / s;
            let ty = ds.startTy + dy / s;
            // 边界约束：图片比视口大时夹紧在视口内（覆盖式平移）；
            // 图片比视口小时允许在视口内大范围平移并略微越出边缘，但始终保留至少 m px 可见
            const iw = dispW * s, ih = dispH * s;
            const m = 24; // 至少保留可见的像素，防止图片被完全拖出视口
            const clampAxis = (span, start) => {
                if (span > vp) return Math.max(vp - span, Math.min(0, start));
                const lo = m - span;   // 最多移到只留 m px 在被裁区域内（贴左/上边缘）
                const hi = vp - m;     // 最多移到只留 m px（贴右/下边缘）
                return Math.max(lo, Math.min(hi, start));
            };
            ctx.imgTranslateX = Math.round(clampAxis(iw, tx));
            ctx.imgTranslateY = Math.round(clampAxis(ih, ty));
            // 实时刷新右侧预览
            if (typeof updateCropPreview === 'function') updateCropPreview();
        };
        const onCirclePointerUp = () => {
            editForm.imageCropper.circleDragState.active = false;
            if (typeof updateCropPreview === 'function') updateCropPreview();
        };
        // 圆形/方形裁剪器缩放（基于视口中心点）
        const circleZoomIn = () => {
            const ctx = editForm.imageCropper;
            const oldScale = ctx.imgScale || 1;
            const newScale = Math.min(20, oldScale + 0.05);
            zoomCircleImage(ctx, oldScale, newScale);
            updateCropPreview();
        };
        const circleZoomOut = () => {
            const ctx = editForm.imageCropper;
            const oldScale = ctx.imgScale || 1;
            const newScale = Math.max(0.1, oldScale - 0.05);
            zoomCircleImage(ctx, oldScale, newScale);
            updateCropPreview();
        };
        const circleZoomReset = () => {
            const ctx = editForm.imageCropper;
            const vp = ctx.viewportSize;
            const dispW = ctx._dispW || vp;
            const dispH = ctx._dispH || vp;
            ctx.imgScale = 1;
            // 重置时回到 100% 并居中（与图片加载时的初始居中一致）
            ctx.imgTranslateX = Math.round((vp - dispW) / 2);
            ctx.imgTranslateY = Math.round((vp - dispH) / 2);
            updateCropPreview();
        };
        const zoomCircleImage = (ctx, oldScale, newScale) => {
            const vp = ctx.viewportSize;
            const dispW = ctx._dispW || vp;
            const dispH = ctx._dispH || vp;
            // 壁纸(vpCrop 视口模式，transform-origin:0 0)：缩放以图片中心为原点。
            // 该模式渲染原点在左上角，需手动补偿平移，使图片中心在缩放前后屏幕位置固定不动；
            // 圆形/方形图标模式(transform-origin 为 center)天然绕中心，无需补偿。
            if (ctx.target === 'wallpaper' || ctx.target === 'sidebarBackground' || ctx.target === 'sidebarBackgroundCollapsed' || ctx.target === 'adSlot') {
                ctx.imgTranslateX = Math.round((ctx.imgTranslateX || 0) - dispW * (newScale - oldScale) / 2);
                ctx.imgTranslateY = Math.round((ctx.imgTranslateY || 0) - dispH * (newScale - oldScale) / 2);
            }
            ctx.imgScale = newScale;
            const maxW = dispW * newScale;
            const maxH = dispH * newScale;
            // 边界约束：与 onCirclePointerMove 保持一致，
            // 图片大于视口时夹紧覆盖；等于/小于视口时允许在视口内平移并保留 m px 可见
            const m = 24;
            if (maxW > vp) {
                ctx.imgTranslateX = Math.max(vp - maxW, Math.min(0, ctx.imgTranslateX));
            } else {
                ctx.imgTranslateX = Math.max(m - maxW, Math.min(vp - m, ctx.imgTranslateX));
            }
            if (maxH > vp) {
                ctx.imgTranslateY = Math.max(vp - maxH, Math.min(0, ctx.imgTranslateY));
            } else {
                ctx.imgTranslateY = Math.max(m - maxH, Math.min(vp - m, ctx.imgTranslateY));
            }
        };
        // 侧边栏顶部 Logo：严格以图片中心为原点缩放（保持图片中心屏幕位置固定）
        const zoomHeaderLogoImage = (ctx, oldScale, newScale) => {
            const vp = ctx.viewportSize || 640;
            const dw = ctx._dispW || vp;
            const dh = ctx._dispH || vp;
            // 以图片显示中心为锚点：缩放后图片中心屏幕位置保持不变
            ctx.imgTranslateX = Math.round((ctx.imgTranslateX || 0) - dw * (newScale - oldScale) / 2);
            ctx.imgTranslateY = Math.round((ctx.imgTranslateY || 0) - dh * (newScale - oldScale) / 2);
            ctx.imgScale = newScale;
            // 边界约束：图片比视口大时夹紧覆盖视口；图片小则允许大范围平移但始终保留至少 m px 可见
            const iw = dw * newScale, ih = dh * newScale;
            const m = 24;
            const clampAxis = (span, start) => {
                if (span >= vp) return Math.max(vp - span, Math.min(0, start));
                const lo = m - span, hi = vp - m;
                return Math.max(lo, Math.min(hi, start));
            };
            ctx.imgTranslateX = Math.round(clampAxis(iw, ctx.imgTranslateX));
            ctx.imgTranslateY = Math.round(clampAxis(ih, ctx.imgTranslateY));
        };
        const onCircleWheel = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const ctx = editForm.imageCropper;
            const oldScale = ctx.imgScale || 1;
            // 滚轮单次缩放固定 5%
            const delta = e.deltaY > 0 ? -0.05 : 0.05;
            const newScale = Math.max(0.1, oldScale + delta);
            if (ctx.target === 'headerLogo') zoomHeaderLogoImage(ctx, oldScale, newScale);
            else zoomCircleImage(ctx, oldScale, newScale);
            updateCropPreview();
        };

        // 左侧背景裁剪（siteStyleMode）：旋转滑条滚轮调整（±5°）
        const onImageCropperRotationWheel = (e) => {
            e.preventDefault();
            const ctx = editForm.imageCropper;
            let r = (ctx.rotation || 0) + (e.deltaY < 0 ? 5 : -5);
            r = ((r % 360) + 360) % 360;
            ctx.rotation = r;
            updateCropPreview();
        };
        // 左侧背景裁剪（siteStyleMode）：不透明度滑条滚轮调整（±5%）
        const onImageCropperOpacityWheel = (e) => {
            e.preventDefault();
            const ctx = editForm.imageCropper;
            const cur = clampVal(ctx.iconOpacity != null ? ctx.iconOpacity : 100, 0, 100);
            ctx.iconOpacity = clampVal(cur + (e.deltaY < 0 ? 5 : -5), 0, 100);
            updateCropPreview();
        };

        // 图标设置编辑器（浏览器标签/Logo/站点图标）背景不透明度滚轮
        const onIconEditorBgOpacityWheel = (e) => {
            e.preventDefault();
            const ie = editForm.iconEditor;
            const cur = clampVal(ie.bgOpacity != null ? ie.bgOpacity : 100, 0, 100);
            ie.bgOpacity = clampVal(cur + (e.deltaY < 0 ? 5 : -5), 0, 100);
        };

        // 裁剪器（广告位/侧边栏背景等）背景不透明度滚轮
        const onImageCropperBgOpacityWheel = (e) => {
            e.preventDefault();
            const ctx = editForm.imageCropper;
            const cur = clampVal(ctx.bgOpacity != null ? ctx.bgOpacity : 100, 0, 100);
            ctx.bgOpacity = clampVal(cur + (e.deltaY < 0 ? 5 : -5), 0, 100);
            updateCropPreview();
        };

        // 侧边栏顶部 Logo：点击按钮缩放（以图片中心为原点，与滚轮等价）
        const zoomHeaderLogoBtn = (dir) => {
            const ctx = editForm.imageCropper;
            const oldScale = ctx.imgScale || 1;
            // 点击按钮单次缩放固定 5%
            const step = 0.05;
            const newScale = Math.max(0.1, Math.min(20, oldScale + (dir > 0 ? step : -step)));
            zoomHeaderLogoImage(ctx, oldScale, newScale);
            updateCropPreview();
        };

        // 侧边栏顶部 Logo：手动输入缩放比例（百分比，夹 10%~500%）后回写 imgScale
        const onHLogoZoomInput = (e) => {
            const ctx = editForm.imageCropper;
            let pct = Number(e.target.value);
            if (!isFinite(pct)) pct = 100;
            pct = Math.max(10, Math.min(500, pct));
            const oldScale = ctx.imgScale || 1;
            const newScale = pct / 100;
            if (ctx.target === 'headerLogo') zoomHeaderLogoImage(ctx, oldScale, newScale);
            else zoomCircleImage(ctx, oldScale, newScale);
            updateCropPreview();
        };
        // 侧边栏顶部 Logo：旋转（±90° 步进）
        const rotateHeaderLogo = (dir) => {
            const ctx = editForm.imageCropper;
            let r = (ctx.hLogoRotation || 0) + (dir * 90);
            r = ((r % 360) + 360) % 360;
            ctx.hLogoRotation = r;
            updateCropPreview();
        };
        // 侧边栏顶部 Logo：背景层样式（棋盘格 / 纯色 / 彩虹）
        const getHLogoBgStyle = () => {
            const bg = editForm.imageCropper.hLogoBg || 'transparent';
            if (bg === 'transparent') {
                return { background: 'repeating-conic-gradient(#e5e5e5 0% 25%, #fff 0% 50%) 0 0 / 16px 16px' };
            }
            // 自定义颜色（hex 字符串）直接作为纯色背景
            return { background: bg };
        };

        // ===== 自定义取色器逻辑 =====
        const clampVal = (v, a, b) => Math.min(b, Math.max(a, v));
        const hsvToRgb = (h, s, v) => {
            s /= 100; v /= 100;
            const c = v * s;
            const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
            const m = v - c;
            let r = 0, g = 0, b = 0;
            if (h < 60) { r = c; g = x; }
            else if (h < 120) { r = x; g = c; }
            else if (h < 180) { g = c; b = x; }
            else if (h < 240) { g = x; b = c; }
            else if (h < 300) { r = x; b = c; }
            else { r = c; b = x; }
            return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
        };
        const rgbToHsv = (r, g, b) => {
            r /= 255; g /= 255; b /= 255;
            const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
            let h = 0;
            if (d !== 0) {
                if (max === r) h = ((g - b) / d) % 6;
                else if (max === g) h = (b - r) / d + 2;
                else h = (r - g) / d + 4;
                h *= 60; if (h < 0) h += 360;
            }
            const s = max === 0 ? 0 : d / max;
            return [Math.round(h), Math.round(s * 100), Math.round(max * 100)];
        };
        const rgbToHex = (r, g, b) => {
            const t = (v) => clampVal(Math.round(v), 0, 255).toString(16).padStart(2, '0');
            return '#' + t(r) + t(g) + t(b);
        };
        const hexToRgb = (hex) => {
            hex = String(hex).trim();
            if (hex[0] === '#') hex = hex.slice(1);
            if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
            const n = parseInt(hex, 16);
            return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        };
        const rgbToHsl = (r, g, b) => {
            r /= 255; g /= 255; b /= 255;
            const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
            let h = 0, s = 0, l = (max + min) / 2;
            if (d !== 0) {
                s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
                else if (max === g) h = ((b - r) / d + 2) / 6;
                else h = ((r - g) / d + 4) / 6;
            }
            return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
        };
        const hslToRgb = (h, s, l) => {
            h /= 360; s /= 100; l /= 100;
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1; if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };
            let r, g, b;
            if (s === 0) { r = g = b = l; }
            else {
                const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
                const p = 2 * l - q;
                r = hue2rgb(p, q, h + 1 / 3);
                g = hue2rgb(p, q, h);
                b = hue2rgb(p, q, h - 1 / 3);
            }
            return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
        };
        // 解析任意颜色字符串为 {r,g,b,a(0~100)}；不支持的（如 rainbow）返回 null
        const parseToRgba = (str) => {
            if (!str) return null;
            str = String(str).trim();
            if (str === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
            let m;
            if ((m = str.match(/^#([0-9a-fA-F]{3,4})$/))) {
                let h = m[1];
                if (h.length === 3) h = h.split('').map(c => c + c).join('');
                const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
                const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
                return { r, g, b, a: Math.round(a * 100) };
            }
            if ((m = str.match(/^#([0-9a-fA-F]{6,8})$/))) {
                const h = m[1];
                const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
                const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
                return { r, g, b, a: Math.round(a * 100) };
            }
            if ((m = str.match(/^rgba?\(([^)]+)\)$/i))) {
                const parts = m[1].split(',').map(p => parseFloat(p.trim()));
                if (parts.length >= 3) {
                    const r = clampVal(Math.round(parts[0]), 0, 255);
                    const g = clampVal(Math.round(parts[1]), 0, 255);
                    const b = clampVal(Math.round(parts[2]), 0, 255);
                    const a = parts.length >= 4 ? (isNaN(parts[3]) ? 1 : parts[3]) : 1;
                    return { r, g, b, a: Math.round(a * 100) };
                }
            }
            return null;
        };
        // 根据当前 r/g/b/a 生成存储字符串：100% 用 hex，否则 rgba
        const composeColor = () => {
            const { r, g, b, a } = colorPicker;
            if (a >= 100) return rgbToHex(r, g, b);
            const af = Math.round((a / 100) * 100) / 100;
            return `rgba(${r},${g},${b},${af})`;
        };
        const recomposeColor = () => {
            colorPicker.color = composeColor();
            if (colorPicker.onChange) { try { colorPicker.onChange(colorPicker.color); } catch (_) {} }
        };
        const drawSV = () => {
            const cv = svCanvas.value; if (!cv) return;
            const ctx = cv.getContext('2d');
            const w = cv.width, hgt = cv.height;
            ctx.clearRect(0, 0, w, hgt);
            ctx.fillStyle = `hsl(${colorPicker.h},100%,50%)`;
            ctx.fillRect(0, 0, w, hgt);
            const g1 = ctx.createLinearGradient(0, 0, w, 0);
            g1.addColorStop(0, '#fff');
            g1.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = g1; ctx.fillRect(0, 0, w, hgt);
            const g2 = ctx.createLinearGradient(0, 0, 0, hgt);
            g2.addColorStop(0, 'rgba(0,0,0,0)');
            g2.addColorStop(1, '#000');
            ctx.fillStyle = g2; ctx.fillRect(0, 0, w, hgt);
            // 颜色位置圆环指示器（始终显示）
            const mx = (colorPicker.s / 100) * w;
            const my = (1 - colorPicker.v / 100) * hgt;
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 5;
            ctx.beginPath();
            ctx.arc(mx, my, 7, 0, Math.PI * 2);
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#fff';
            ctx.stroke();
            ctx.restore();
            ctx.beginPath();
            ctx.arc(mx, my, 7, 0, Math.PI * 2);
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgba(0,0,0,0.35)';
            ctx.stroke();
        };
        const drawHue = () => {
            const cv = hueCanvas.value; if (!cv) return;
            const ctx = cv.getContext('2d');
            const w = cv.width, hgt = cv.height;
            ctx.clearRect(0, 0, w, hgt);
            const g = ctx.createLinearGradient(0, 0, w, 0);
            g.addColorStop(0, '#f00'); g.addColorStop(1 / 6, '#ff0'); g.addColorStop(2 / 6, '#0f0');
            g.addColorStop(3 / 6, '#0ff'); g.addColorStop(4 / 6, '#00f'); g.addColorStop(5 / 6, '#f0f'); g.addColorStop(1, '#f00');
            ctx.fillStyle = g; ctx.fillRect(0, 0, w, hgt);
            // 色相滑块标记（始终显示）
            const mx = (colorPicker.h / 360) * w;
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 4;
            ctx.beginPath();
            ctx.moveTo(mx, 2);
            ctx.lineTo(mx, hgt - 2);
            ctx.lineWidth = 4;
            ctx.lineCap = 'round';
            ctx.strokeStyle = '#fff';
            ctx.stroke();
            ctx.restore();
        };
        const drawAlpha = () => {
            const cv = alphaCanvas.value; if (!cv) return;
            const ctx = cv.getContext('2d');
            const w = cv.width, hgt = cv.height;
            ctx.clearRect(0, 0, w, hgt);
            const { r, g, b } = colorPicker;
            const g1 = ctx.createLinearGradient(0, 0, w, 0);
            g1.addColorStop(0, `rgba(${r},${g},${b},0)`);
            g1.addColorStop(1, `rgba(${r},${g},${b},1)`);
            ctx.fillStyle = g1; ctx.fillRect(0, 0, w, hgt);
            const mx = (colorPicker.a / 100) * w;
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 4;
            ctx.beginPath();
            ctx.moveTo(mx, 2);
            ctx.lineTo(mx, hgt - 2);
            ctx.lineWidth = 4;
            ctx.lineCap = 'round';
            ctx.strokeStyle = '#fff';
            ctx.stroke();
            ctx.restore();
        };
        const updateAlphaFromEvent = (e) => {
            const cv = alphaCanvas.value; if (!cv) return;
            const rect = cv.getBoundingClientRect();
            const x = clampVal((e.clientX - rect.left) / rect.width, 0, 1);
            colorPicker.a = Math.round(x * 100);
            recomposeColor();
            drawAlpha();
        };
        const onAlphaPointerDown = (e) => { colorPicker.draggingAlpha = true; try { alphaCanvas.value && alphaCanvas.value.setPointerCapture(e.pointerId); } catch (_) {} updateAlphaFromEvent(e); };
        const onAlphaPointerMove = (e) => { if (colorPicker.draggingAlpha) updateAlphaFromEvent(e); };
        const onAlphaPointerUp = (e) => { colorPicker.draggingAlpha = false; try { alphaCanvas.value && alphaCanvas.value.releasePointerCapture(e.pointerId); } catch (_) {} };
        const syncColorFromHsv = () => {
            const [r, g, b] = hsvToRgb(colorPicker.h, colorPicker.s, colorPicker.v);
            colorPicker.r = r; colorPicker.g = g; colorPicker.b = b;
            recomposeColor();
        };
        const syncHsvFromRgb = () => {
            const [h, s, v] = rgbToHsv(
                clampVal(colorPicker.r, 0, 255),
                clampVal(colorPicker.g, 0, 255),
                clampVal(colorPicker.b, 0, 255)
            );
            colorPicker.h = h; colorPicker.s = s; colorPicker.v = v;
            recomposeColor();
            drawSV();
            drawHue();
            drawAlpha();
        };
        const updateSVFromEvent = (e) => {
            const cv = svCanvas.value; if (!cv) return;
            const rect = cv.getBoundingClientRect();
            const x = clampVal((e.clientX - rect.left) / rect.width, 0, 1);
            const y = clampVal((e.clientY - rect.top) / rect.height, 0, 1);
            colorPicker.s = Math.round(x * 100);
            colorPicker.v = Math.round((1 - y) * 100);
            syncColorFromHsv();
            drawSV();
        };
        const updateHueFromEvent = (e) => {
            const cv = hueCanvas.value; if (!cv) return;
            const rect = cv.getBoundingClientRect();
            const x = clampVal((e.clientX - rect.left) / rect.width, 0, 1);
            colorPicker.h = Math.round(x * 360);
            syncColorFromHsv();
            drawSV();
            drawHue();
        };
        const openColorPicker = (opts) => {
            const cur = (opts && opts.value != null) ? String(opts.value) : editForm.imageCropper.hLogoBg;
            let rgb = [79, 70, 229];
            let alpha = 100;
            const parsed = parseToRgba(cur);
            if (parsed && cur !== 'transparent' && cur !== 'rainbow') {
                rgb = [parsed.r, parsed.g, parsed.b];
                alpha = parsed.a;
            } else if (cur && cur !== 'transparent' && cur !== 'rainbow') {
                try { rgb = hexToRgb(cur[0] === '#' ? cur : '#' + cur); } catch (e) {}
                alpha = 100;
            }
            colorPicker.r = rgb[0]; colorPicker.g = rgb[1]; colorPicker.b = rgb[2];
            colorPicker.a = alpha;
            const [h, s, v] = rgbToHsv(rgb[0], rgb[1], rgb[2]);
            colorPicker.h = h; colorPicker.s = s; colorPicker.v = v;
            recomposeColor();
            colorPicker.open = true;
            colorPicker.hasEyedropper = (typeof window !== 'undefined' && 'EyeDropper' in window);
            colorPicker.onConfirm = (opts && opts.onConfirm)
                ? opts.onConfirm
                : ((val) => { editForm.imageCropper.hLogoBg = val; editForm.imageCropper.hLogoCustomBg = val; });
            colorPicker.onChange = (opts && opts.onChange) ? opts.onChange : null;
            nextTick(() => { drawSV(); drawHue(); drawAlpha(); const m = document.querySelector('.color-picker-modal'); if (m && m.focus) m.focus(); });
        };
        // 为搜索颜色模块字段打开取色器（写入 data.searchConfig[key]）
        const openSearchColorPicker = (key) => {
            openColorPicker({ value: data.searchConfig[key], onConfirm: (val) => { data.searchConfig[key] = val; } });
        };
        const closeColorPicker = () => { colorPicker.open = false; };
        const confirmColorPicker = () => {
            const cb = colorPicker.onConfirm;
            if (cb) cb(colorPicker.color);
            colorPicker.open = false;
        };
        if (typeof window !== 'undefined') {
            const _colorPickerEnterHandler = (e) => {
                if (e.key === 'Enter' && colorPicker.open) { e.preventDefault(); confirmColorPicker(); }
            };
            window.addEventListener('keydown', _colorPickerEnterHandler);
        }

        // ---- 广告位裁剪弹窗内嵌背景取色器专用函数 ----
        const composeAdSlotBgColor = () => {
            const hex = rgbToHex(adSlotBgPicker.r, adSlotBgPicker.g, adSlotBgPicker.b);
            adSlotBgPicker.hex = hex.toUpperCase();
            return hex;
        };
        const drawAdSlotBgSV = () => {
            const cv = adSlotBgSvCanvas.value; if (!cv) return;
            const ctx = cv.getContext('2d');
            const w = cv.width, hgt = cv.height;
            ctx.clearRect(0, 0, w, hgt);
            ctx.fillStyle = `hsl(${adSlotBgPicker.h},100%,50%)`;
            ctx.fillRect(0, 0, w, hgt);
            const g1 = ctx.createLinearGradient(0, 0, w, 0);
            g1.addColorStop(0, '#fff'); g1.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = g1; ctx.fillRect(0, 0, w, hgt);
            const g2 = ctx.createLinearGradient(0, 0, 0, hgt);
            g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(1, '#000');
            ctx.fillStyle = g2; ctx.fillRect(0, 0, w, hgt);
            const mx = (adSlotBgPicker.s / 100) * w;
            const my = (1 - adSlotBgPicker.v / 100) * hgt;
            ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 5;
            ctx.beginPath(); ctx.arc(mx, my, 6, 0, Math.PI * 2); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.restore();
            ctx.beginPath(); ctx.arc(mx, my, 6, 0, Math.PI * 2); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.stroke();
        };
        const drawAdSlotBgHue = () => {
            const cv = adSlotBgHueCanvas.value; if (!cv) return;
            const ctx = cv.getContext('2d');
            const w = cv.width, hgt = cv.height;
            ctx.clearRect(0, 0, w, hgt);
            const g = ctx.createLinearGradient(0, 0, w, 0);
            g.addColorStop(0, '#f00'); g.addColorStop(1 / 6, '#ff0'); g.addColorStop(2 / 6, '#0f0');
            g.addColorStop(3 / 6, '#0ff'); g.addColorStop(4 / 6, '#00f'); g.addColorStop(5 / 6, '#f0f'); g.addColorStop(1, '#f00');
            ctx.fillStyle = g; ctx.fillRect(0, 0, w, hgt);
            const mx = (adSlotBgPicker.h / 360) * w;
            const cy = hgt / 2;
            const rad = hgt / 2 + 2;
            // 外圈白边 + 阴影
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 1;
            ctx.beginPath(); ctx.arc(mx, cy, rad, 0, Math.PI * 2);
            ctx.fillStyle = '#fff'; ctx.fill();
            ctx.restore();
            // 内部填充当前色相颜色
            ctx.beginPath(); ctx.arc(mx, cy, rad - 2.5, 0, Math.PI * 2);
            ctx.fillStyle = `hsl(${adSlotBgPicker.h}, 100%, 50%)`;
            ctx.fill();
            // 描边
            ctx.beginPath(); ctx.arc(mx, cy, rad, 0, Math.PI * 2);
            ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.stroke();
        };
        const syncAdSlotBgColorFromHsv = () => {
            const [r, g, b] = hsvToRgb(adSlotBgPicker.h, adSlotBgPicker.s, adSlotBgPicker.v);
            adSlotBgPicker.r = r; adSlotBgPicker.g = g; adSlotBgPicker.b = b;
            adSlotBgPicker.color = composeAdSlotBgColor();
            const [hh, ss, ll] = rgbToHsl(r, g, b);
            adSlotBgPicker.hslH = hh; adSlotBgPicker.hslS = ss; adSlotBgPicker.hslL = ll;
            applyAdSlotBgColor();
        };
        const syncAdSlotBgHsvFromRgb = () => {
            const [h, s, v] = rgbToHsv(
                clampVal(adSlotBgPicker.r, 0, 255),
                clampVal(adSlotBgPicker.g, 0, 255),
                clampVal(adSlotBgPicker.b, 0, 255)
            );
            adSlotBgPicker.h = h; adSlotBgPicker.s = s; adSlotBgPicker.v = v;
            adSlotBgPicker.color = composeAdSlotBgColor();
            const [hh, ss, ll] = rgbToHsl(adSlotBgPicker.r, adSlotBgPicker.g, adSlotBgPicker.b);
            adSlotBgPicker.hslH = hh; adSlotBgPicker.hslS = ss; adSlotBgPicker.hslL = ll;
            applyAdSlotBgColor();
            drawAdSlotBgSV(); drawAdSlotBgHue();
        };
        const syncAdSlotBgFromHsl = () => {
            const [r, g, b] = hslToRgb(adSlotBgPicker.hslH, adSlotBgPicker.hslS, adSlotBgPicker.hslL);
            adSlotBgPicker.r = r; adSlotBgPicker.g = g; adSlotBgPicker.b = b;
            const [h, s, v] = rgbToHsv(r, g, b);
            adSlotBgPicker.h = h; adSlotBgPicker.s = s; adSlotBgPicker.v = v;
            adSlotBgPicker.color = composeAdSlotBgColor();
            applyAdSlotBgColor();
            drawAdSlotBgSV(); drawAdSlotBgHue();
        };
        const syncAdSlotBgFromHex = () => {
            let hex = String(adSlotBgPicker.hex).trim();
            if (hex[0] !== '#') hex = '#' + hex;
            try {
                const [r, g, b] = hexToRgb(hex);
                adSlotBgPicker.r = r; adSlotBgPicker.g = g; adSlotBgPicker.b = b;
                const [h, s, v] = rgbToHsv(r, g, b);
                adSlotBgPicker.h = h; adSlotBgPicker.s = s; adSlotBgPicker.v = v;
                const [hh, ss, ll] = rgbToHsl(r, g, b);
                adSlotBgPicker.hslH = hh; adSlotBgPicker.hslS = ss; adSlotBgPicker.hslL = ll;
                adSlotBgPicker.color = composeAdSlotBgColor();
                applyAdSlotBgColor();
                drawAdSlotBgSV(); drawAdSlotBgHue();
            } catch (e) {}
        };
        const updateAdSlotBgSVFromEvent = (e) => {
            const cv = adSlotBgSvCanvas.value; if (!cv) return;
            const rect = cv.getBoundingClientRect();
            const x = clampVal((e.clientX - rect.left) / rect.width, 0, 1);
            const y = clampVal((e.clientY - rect.top) / rect.height, 0, 1);
            adSlotBgPicker.s = Math.round(x * 100);
            adSlotBgPicker.v = Math.round((1 - y) * 100);
            syncAdSlotBgColorFromHsv();
            drawAdSlotBgSV();
        };
        const updateAdSlotBgHueFromEvent = (e) => {
            const cv = adSlotBgHueCanvas.value; if (!cv) return;
            const rect = cv.getBoundingClientRect();
            const x = clampVal((e.clientX - rect.left) / rect.width, 0, 1);
            adSlotBgPicker.h = Math.round(x * 360);
            syncAdSlotBgColorFromHsv();
            drawAdSlotBgSV();
        };
        const onAdSlotBgSVPointerDown = (e) => {
            adSlotBgPicker.draggingSV = true;
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
            updateAdSlotBgSVFromEvent(e);
        };
        const onAdSlotBgSVPointerMove = (e) => { if (adSlotBgPicker.draggingSV) updateAdSlotBgSVFromEvent(e); };
        const onAdSlotBgSVPointerUp = () => { adSlotBgPicker.draggingSV = false; };
        const onAdSlotBgHuePointerDown = (e) => {
            adSlotBgPicker.draggingHue = true;
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
            updateAdSlotBgHueFromEvent(e);
        };
        const onAdSlotBgHuePointerMove = (e) => { if (adSlotBgPicker.draggingHue) updateAdSlotBgHueFromEvent(e); };
        const onAdSlotBgHuePointerUp = () => { adSlotBgPicker.draggingHue = false; };
        const applyAdSlotBgColor = () => {
            const slot = currentAdSlot.value;
            if (slot && slot.background !== 'transparent' && slot.background !== 'gradient') {
                slot.background = adSlotBgPicker.color;
            }
        };
        const initAdSlotBgPicker = () => {
            const slot = currentAdSlot.value;
            let cur = (slot && slot.background) ? slot.background : 'transparent';
            if (cur === 'transparent' || cur === 'gradient') cur = '#ffffff';
            const parsed = parseToRgba(cur);
            if (parsed) {
                adSlotBgPicker.r = parsed.r; adSlotBgPicker.g = parsed.g; adSlotBgPicker.b = parsed.b;
            } else {
                try { const rgb = hexToRgb(cur[0] === '#' ? cur : '#' + cur); adSlotBgPicker.r = rgb[0]; adSlotBgPicker.g = rgb[1]; adSlotBgPicker.b = rgb[2]; } catch (e) { adSlotBgPicker.r = 255; adSlotBgPicker.g = 255; adSlotBgPicker.b = 255; }
            }
            const [h, s, v] = rgbToHsv(adSlotBgPicker.r, adSlotBgPicker.g, adSlotBgPicker.b);
            adSlotBgPicker.h = h; adSlotBgPicker.s = s; adSlotBgPicker.v = v;
            const [hh, ss, ll] = rgbToHsl(adSlotBgPicker.r, adSlotBgPicker.g, adSlotBgPicker.b);
            adSlotBgPicker.hslH = hh; adSlotBgPicker.hslS = ss; adSlotBgPicker.hslL = ll;
            adSlotBgPicker.color = composeAdSlotBgColor();
            adSlotBgPicker.mode = 'rgb';
            adSlotBgPicker.hasEyedropper = (typeof window !== 'undefined' && 'EyeDropper' in window);
            nextTick(() => { drawAdSlotBgSV(); drawAdSlotBgHue(); });
        };
        const useAdSlotBgEyeDropper = async () => {
            try {
                const ed = new window.EyeDropper();
                const res = await ed.open();
                const rgb = hexToRgb(res.sRGBHex);
                adSlotBgPicker.r = rgb[0]; adSlotBgPicker.g = rgb[1]; adSlotBgPicker.b = rgb[2];
                syncAdSlotBgHsvFromRgb();
            } catch (e) {}
        };
        const openCustomColorModal = () => {
            if (adSlotBgPopover.value) { adSlotBgPopover.value = false; return; }
            const slot = currentAdSlot.value;
            customColorBackup.value = (slot && slot.background) ? slot.background : 'transparent';
            adSlotBgPopover.value = true;
            nextTick(() => { initAdSlotBgPicker(); });
        };

        const onSVPointerDown = (e) => { colorPicker.draggingSV = true; try { svCanvas.value && svCanvas.value.setPointerCapture(e.pointerId); } catch (_) {} updateSVFromEvent(e); };
        const onSVPointerMove = (e) => { if (colorPicker.draggingSV) updateSVFromEvent(e); };
        const onSVPointerUp = (e) => { colorPicker.draggingSV = false; try { svCanvas.value && svCanvas.value.releasePointerCapture(e.pointerId); } catch (_) {} };
        const onHuePointerDown = (e) => { colorPicker.draggingHue = true; try { hueCanvas.value && hueCanvas.value.setPointerCapture(e.pointerId); } catch (_) {} updateHueFromEvent(e); };
        const onHuePointerMove = (e) => { if (colorPicker.draggingHue) updateHueFromEvent(e); };
        const onHuePointerUp = (e) => { colorPicker.draggingHue = false; try { hueCanvas.value && hueCanvas.value.releasePointerCapture(e.pointerId); } catch (_) {} };
        const useEyeDropper = async () => {
            try {
                const ed = new window.EyeDropper();
                const res = await ed.open();
                const rgb = hexToRgb(res.sRGBHex);
                colorPicker.r = rgb[0]; colorPicker.g = rgb[1]; colorPicker.b = rgb[2];
                syncHsvFromRgb();
            } catch (e) {}
        };

        // 按所选输出格式生成 dataURL（PNG 忽略质量，其余按 quality 1-100）
        const outputDataURL = (cvs, fmt, quality) => {
            return Utils.finalImageDataUrl(cvs, fmt, quality);
        };

        // 样式编辑模式：保存圆形/方形裁剪结果
        // 导出内容：正方形画布，仅保留框内可见内容
        const applyStyleSave = () => {
            const ctx = editForm.imageCropper;
            const logoUrl = editForm.site.logo;
            if (!logoUrl) { showToast('没有图标', 'warning'); return; }
            const rotation = ctx.rotation || 0;
            const bgColor = ctx.bgColor || 'transparent';
            const outSize = Number(ctx.outputSize) || 128;
            const isCircle = ctx.shape === 'circle';
            const imgEl = ctx._imgEl;
            const doSave = (dataUrl) => {
                editForm.site.logo = dataUrl;
                if (editForm.site.subId && editForm.site.index >= 0) {
                    const sub = data.categories.flatMap(c => c.children).find(s => s.id === editForm.site.subId);
                    if (sub && sub.sites[editForm.site.index]) {
                        sub.sites[editForm.site.index].logo = dataUrl;
                        persistData({ mark: true, silent: true })
                    }
                }
                showToast('样式已应用 ✓', 'success');
                modal.imageCropper = false;
                ctx.siteStyleMode = false;
                ctx.isCircleMode = false;
            };
            if (!imgEl) {
                // 没有图片对象时 fallback 到原逻辑
                if (!rotation && bgColor === 'transparent') { doSave(logoUrl); return; }
                try {
                    const img = new Image();
                    img.onload = () => {
                        try {
                            const C = outSize;
                            const cvs = document.createElement('canvas'); cvs.width = C; cvs.height = C;
                            const c = cvs.getContext('2d');
                            if (isCircle) {
                                // 圆形裁剪
                                c.beginPath(); c.arc(C/2, C/2, C/2, 0, Math.PI * 2); c.closePath(); c.clip();
                            }
                            if (rotation) {
                                c.save(); c.translate(C/2, C/2); c.rotate(rotation * Math.PI / 180);
                                c.drawImage(img, -C/2, -C/2, C, C); c.restore();
                            } else { c.drawImage(img, 0, 0, C, C); }
                            doSave(outputDataURL(cvs, ctx.outputFormat, ctx.outputQuality));
                        } catch(e) { showToast('Canvas错误: ' + e.message, 'error'); }
                    };
                    img.onerror = () => { showToast('加载原图失败，请重试或重新选择图标', 'warning'); };
                    const src = logoUrl.startsWith('data:') ? logoUrl : (logoUrl.match(/^https?:\/\//i) ? logoUrl : logoUrl.replace(/^\.\//, ''));
                    img.src = src;
                } catch(e) { showToast('加载失败: ' + e.message, 'error'); }
                return;
            }
            // 裁剪输出：计算视口内可见区域
            try {
                const vp = ctx.viewportSize;
                const s = ctx.imgScale || 1;
                const dx = ctx.imgTranslateX || 0;
                const dy = ctx.imgTranslateY || 0;
                const dispW = ctx._dispW || vp;
                const dispH = ctx._dispH || vp;
                const nw = imgEl.naturalWidth;
                const nh = imgEl.naturalHeight;
                // 显示尺寸到原始尺寸的比例
                const scaleX = nw / dispW;
                const scaleY = nh / dispH;
                // 视口在显示坐标系中的位置（左上角）
                const viewLeft = -dx / s;
                const viewTop = -dy / s;
                // 映射到原始图片像素坐标
                const sx = Math.max(0, Math.round(viewLeft * scaleX));
                const sy = Math.max(0, Math.round(viewTop * scaleY));
                const sw = Math.min(nw - sx, Math.round((vp / s) * scaleX));
                const sh = Math.min(nh - sy, Math.round((vp / s) * scaleY));
                const canvas = document.createElement('canvas');
                canvas.width = outSize;
                canvas.height = outSize;
                const c = canvas.getContext('2d');
                c.imageSmoothingEnabled = true;
                c.imageSmoothingQuality = 'high';
                // 圆形裁剪路径（方形模式不需要）
                if (isCircle) {
                    c.save();
                    c.beginPath();
                    c.arc(outSize / 2, outSize / 2, outSize / 2, 0, Math.PI * 2);
                    c.closePath();
                    c.clip();
                }
                // 旋转 + 绘制
                if (rotation !== 0) {
                    c.save();
                    c.translate(outSize / 2, outSize / 2);
                    c.rotate(rotation * Math.PI / 180);
                    c.drawImage(imgEl, sx, sy, sw, sh, -outSize / 2, -outSize / 2, outSize, outSize);
                    c.restore();
                } else {
                    c.drawImage(imgEl, sx, sy, sw, sh, 0, 0, outSize, outSize);
                }
                if (isCircle) { c.restore(); }
                const dataURL = outputDataURL(canvas, ctx.outputFormat, ctx.outputQuality);
                doSave(dataURL);
            } catch(e) {
                showToast('Canvas错误: ' + e.message, 'error');
            }
        };

        // 将裁剪结果回写到对应 engine.logo
        // 圆角裁切：在 canvas 上做 destination-in 圆角矩形（方形/矩形通用，半径=短边×factor）
        const applyRoundClip = (canvas, factor) => {
            factor = (factor == null) ? 0.16 : factor;
            const w = canvas.width, h = canvas.height;
            const r = Math.max(0, Math.round(Math.min(w, h) * factor));
            if (r <= 0) return;
            const t = document.createElement('canvas');
            t.width = w; t.height = h;
            const tc = t.getContext('2d');
            tc.beginPath();
            tc.moveTo(r, 0);
            tc.arcTo(w, 0, w, h, r);
            tc.arcTo(w, h, 0, h, r);
            tc.arcTo(0, h, 0, 0, r);
            tc.arcTo(0, 0, w, 0, r);
            tc.closePath();
            tc.fill();
            const cctx = canvas.getContext('2d');
            cctx.globalCompositeOperation = 'destination-in';
            cctx.drawImage(t, 0, 0);
            cctx.globalCompositeOperation = 'source-over';
        };

        // 圆形裁切：在 canvas 上做 destination-in 圆形
        const applyCircleClip = (canvas) => {
            const w = canvas.width, h = canvas.height;
            const t = document.createElement('canvas');
            t.width = w; t.height = h;
            const tc = t.getContext('2d');
            tc.beginPath();
            tc.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
            tc.closePath();
            tc.fill();
            const cctx = canvas.getContext('2d');
            cctx.globalCompositeOperation = 'destination-in';
            cctx.drawImage(t, 0, 0);
            cctx.globalCompositeOperation = 'source-over';
        };

        // 视口裁剪模式（adSlot / wallpaper）公共导出：把 vpCrop 选区按比例绘制到 outputSizeW×outputSizeH，等比 letterbox 防变形
        const cropVpToDataURL = (ctx) => {
            const imgEl = ctx._imgEl;
            if (!imgEl) return null;
            const vp = ctx.viewportSize;
            const s = ctx.imgScale || 1;
            const dx = ctx.imgTranslateX || 0;
            const dy = ctx.imgTranslateY || 0;
            const dispW = ctx._dispW || vp;
            const dispH = ctx._dispH || vp;
            const nw = imgEl.naturalWidth;
            const nh = imgEl.naturalHeight;
            const scaleX = nw / dispW;
            const scaleY = nh / dispH;
            const cropX = (ctx.vpCrop && ctx.vpCrop.w > 0) ? ctx.vpCrop.x : 0;
            const cropY = (ctx.vpCrop && ctx.vpCrop.w > 0) ? ctx.vpCrop.y : 0;
            const cropW = (ctx.vpCrop && ctx.vpCrop.w > 0) ? ctx.vpCrop.w : vp;
            const cropH = (ctx.vpCrop && ctx.vpCrop.w > 0) ? ctx.vpCrop.h : vp;
            const viewLeft = (cropX - dx) / s;
            const viewTop = (cropY - dy) / s;
            const sx = Math.max(0, Math.round(viewLeft * scaleX));
            const sy = Math.max(0, Math.round(viewTop * scaleY));
            const sw = Math.min(nw - sx, Math.max(1, Math.round((cropW / s) * scaleX)));
            const sh = Math.min(nh - sy, Math.max(1, Math.round((cropH / s) * scaleY)));
            const outW = Number(ctx.outputSizeW) || 380;
            const outH = Number(ctx.outputSizeH) || 49;
            const canvas = document.createElement('canvas');
            canvas.width = outW;
            canvas.height = outH;
            const cctx = canvas.getContext('2d');
            cctx.imageSmoothingEnabled = true;
            cctx.imageSmoothingQuality = 'high';
            const mime = Utils.resolveImageMime(ctx.outputFormat || 'auto');
            if (mime === 'image/jpeg') { cctx.fillStyle = '#ffffff'; cctx.fillRect(0, 0, outW, outH); }
            // 背景不透明度（%）作用于背景色/渐变填充
            const bgAlpha = clampVal((ctx.bgOpacity != null ? ctx.bgOpacity : 100), 0, 100) / 100;
            // 广告位背景色：透明(默认) / 纯色 / 渐变
            const adBg = ctx.background;
            if (adBg && adBg !== 'transparent') {
                cctx.globalAlpha = bgAlpha;
                if (adBg === 'gradient') {
                    const grd = cctx.createLinearGradient(0, 0, outW, outH);
                    grd.addColorStop(0, '#ff4d4f');
                    grd.addColorStop(0.17, '#ff7a45');
                    grd.addColorStop(0.33, '#ffec3d');
                    grd.addColorStop(0.5, '#73d13d');
                    grd.addColorStop(0.67, '#36cfc9');
                    grd.addColorStop(0.83, '#40a9ff');
                    grd.addColorStop(1, '#9254de');
                    cctx.fillStyle = grd;
                    cctx.fillRect(0, 0, outW, outH);
                } else {
                    // 自定义颜色：直接作为 css 颜色值填充
                    cctx.fillStyle = adBg;
                    cctx.fillRect(0, 0, outW, outH);
                }
                cctx.globalAlpha = 1;
            }
            // 侧边栏背景：先填充背景色（裁剪器内"背景"按钮组的字段即 ctx.hLogoBg），再绘制图片
            if (ctx.target === 'sidebarBackground' || ctx.target === 'sidebarBackgroundCollapsed') {
                const bg = ctx.hLogoBg || 'transparent';
                if (bg !== 'transparent') {
                    cctx.globalAlpha = bgAlpha;
                    cctx.fillStyle = bg;
                    cctx.fillRect(0, 0, outW, outH);
                    cctx.globalAlpha = 1;
                }
            }
            // 应用图片不透明度（仅影响图片绘制）
            cctx.globalAlpha = (ctx.iconOpacity != null ? ctx.iconOpacity : 100) / 100;
            const srcRatio = sw / sh;
            const dstRatio = outW / outH;
            let dw, dh, ox, oy;
            if (srcRatio > dstRatio) { dw = outW; dh = Math.round(outW / srcRatio); ox = 0; oy = Math.round((outH - dh) / 2); }
            else { dh = outH; dw = Math.round(outH * srcRatio); ox = Math.round((outW - dw) / 2); oy = 0; }
            const rotation = ctx.rotation || 0;
            if (rotation !== 0) {
                cctx.save();
                cctx.translate(outW / 2, outH / 2);
                cctx.rotate(rotation * Math.PI / 180);
                cctx.drawImage(imgEl, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
                cctx.restore();
            } else {
                cctx.drawImage(imgEl, sx, sy, sw, sh, ox, oy, dw, dh);
            }
            // 裁切前恢复不透明度，避免 destination-in 被 alpha 冲淡
            cctx.globalAlpha = 1;
            if (ctx.shape === 'round') applyRoundClip(canvas);
            if (ctx.shape === 'circle') applyCircleClip(canvas);
            return Utils.finalImageDataUrl(canvas, ctx.outputFormat, ctx.outputQuality);
        };

        const applyLogoCrop = () => {
            const ctx = editForm.imageCropper;

            // 样式编辑模式：独立、简洁的处理
            if (ctx.siteStyleMode && ctx.target === 'site') {
                applyStyleSave();
                return;
            }
            // 广告位图片写入（视口裁剪模式）
            if (ctx.siteStyleMode && ctx.target === 'adSlot') {
                // 仅同步输出尺寸回广告位，注意：不能调用 onAdOutputSizeChange()，
                // 因为它内部会 initVpCropBox 重置裁剪框，从而丢弃用户框选的区域
                if (data.adSlots) {
                    const _unified = data.adSlots.unifiedSize !== false;
                    if (!_unified && ctx.adSide != null && ctx.adIdx != null) {
                        const _slot = data.adSlots[ctx.adSide] && data.adSlots[ctx.adSide][ctx.adIdx];
                        if (_slot) { _slot.width = ctx.outputSizeW; _slot.height = ctx.outputSizeH; }
                    } else {
                        data.adSlots.width = ctx.outputSizeW;
                        data.adSlots.height = ctx.outputSizeH;
                    }
                }
                const slot = data.adSlots[ctx.adSide] && data.adSlots[ctx.adSide][ctx.adIdx];
                if (!slot) { closeLogoCropper(); return; }
                if (ctx.mode === 'svg') {
                    const txt = (ctx.svgText || '').trim();
                    if (!txt) { showToast('SVG 内容不能为空', 'warning'); return; }
                    slot.image = txt;
                    slot.type = 'image';
                    persistData({ mark: true, silent: true })
                    showToast('已使用 SVG 图片', 'success');
                    closeLogoCropper();
                    return;
                }
                if (ctx.mode === 'url') {
                    const v = (ctx.urlValue || '').trim();
                    if (!v) { showToast('图片 URL 不能为空', 'warning'); return; }
                    slot.image = v;
                    slot.type = 'image';
                    persistData({ mark: true, silent: true })
                    showToast('已使用图片 URL', 'success');
                    closeLogoCropper();
                    return;
                }
                // upload 模式：使用视口裁剪框坐标（vpCrop）生成广告图（复用公共导出）
                const imgEl = ctx._imgEl;
                if (!imgEl) { showToast('请先选择图片', 'warning'); return; }
                try {
                    ctx.background = slot.background || 'transparent';
                    const dataURL = cropVpToDataURL(ctx);
                    // 保留原始原图（首次上传时已写入 sourceImage，老数据没有时兜底保存当前源图）
                    if (!slot.sourceImage && ctx.sourceImage) slot.sourceImage = ctx.sourceImage;
                    if (!dataURL) { showToast('生成失败', 'error'); return; }
                    slot.image = dataURL;
                    slot.type = 'image';
                    slot.shape = ctx.shape || 'square';
                    persistData({ mark: true, silent: true })
                    showToast(`已生成 ${ctx.outputSizeW || 380}×${ctx.outputSizeH || 49} 广告图`, 'success');
                    closeLogoCropper();
                    return;
                } catch(e) {
                    showToast('Canvas错误: ' + e.message, 'error');
                    return;
                }
            }

            // 壁纸写入（视口裁剪模式，复用广告位高质量导出）
            if (ctx.siteStyleMode && ctx.target === 'wallpaper') {
                const _pending = ctx.wpPending || { name: '自定义壁纸', group: wpLib.mode, pos: wpLib.pos };
                if (ctx.mode === 'url') {
                    const v = (ctx.urlValue || '').trim();
                    if (!v) { showToast('图片 URL 不能为空', 'warning'); return; }
                    pushCustomWallpaper(v, _pending.name, _pending.group, _pending.pos);
                    showToast('已添加壁纸', 'success');
                    closeLogoCropper();
                    return;
                }
                const imgEl = ctx._imgEl;
                if (!imgEl) { showToast('请先选择图片', 'warning'); return; }
                try {
                    const dataURL = cropVpToDataURL(ctx);
                    if (!dataURL) { showToast('生成失败', 'error'); return; }
                    pushCustomWallpaper(dataURL, _pending.name, _pending.group, _pending.pos);
                    showToast(`已生成 ${ctx.outputSizeW || 1600}×${ctx.outputSizeH || 500} 壁纸`, 'success');
                    closeLogoCropper();
                    return;
                } catch(e) {
                    showToast('Canvas错误: ' + e.message, 'error');
                    return;
                }
            }

            // 访客页面左侧背景：复用视口裁剪（与壁纸同路径，写出 dataURL 并记录原图+编辑参数）
            if (ctx.target === 'sidebarBackground') {
                const sb = editForm.sidebarTop.sidebarBackground;
                if (ctx.mode === 'svg') {
                    const txt = (ctx.svgText || '').trim();
                    if (!txt) { showToast('SVG 内容不能为空', 'warning'); return; }
                    sb.url = txt;
                    showToast('已使用 SVG 图片', 'success');
                    closeLogoCropper();
                    return;
                }
                if (ctx.mode === 'url') {
                    const v = (ctx.urlValue || '').trim();
                    if (!v) { showToast('图片 URL 不能为空', 'warning'); return; }
                    sb.url = v;
                    sb.src = v;
                    sb.edit = null;
                    showToast('已使用图片 URL', 'success');
                    closeLogoCropper();
                    return;
                }
                const imgEl = ctx._imgEl;
                if (!imgEl) { showToast('请先选择图片', 'warning'); return; }
                try {
                    const dataURL = cropVpToDataURL(ctx);
                    if (!dataURL) { showToast('生成失败', 'error'); return; }
                    sb.url = dataURL;
                    sb.src = ctx.sourceImage;
                    sb.width = ctx.outputSizeW;
                    sb.edit = {
                        vpCrop: { ...ctx.vpCrop },
                        outputSizeW: ctx.outputSizeW,
                        outputSizeH: ctx.outputSizeH,
                        rotation: ctx.rotation || 0,
                        imgTranslateX: ctx.imgTranslateX,
                        imgTranslateY: ctx.imgTranslateY,
                        imgScale: ctx.imgScale,
                        iconOpacity: ctx.iconOpacity != null ? ctx.iconOpacity : 100,
                        bg: ctx.hLogoBg
                    };
                    showToast(`已生成 ${ctx.outputSizeW || 200}×${ctx.outputSizeH || 600} 左侧背景`, 'success');
                    closeLogoCropper();
                    return;
                } catch(e) {
                    showToast('Canvas错误: ' + e.message, 'error');
                    return;
                }
            }

            // 收起侧边时背景：复用视口裁剪（与左侧背景同路径，写出 dataURL 并记录原图+编辑参数）
            if (ctx.target === 'sidebarBackgroundCollapsed') {
                const sb = editForm.sidebarTop.sidebarBackgroundCollapsed;
                if (ctx.mode === 'svg') {
                    const txt = (ctx.svgText || '').trim();
                    if (!txt) { showToast('SVG 内容不能为空', 'warning'); return; }
                    sb.url = txt;
                    showToast('已使用 SVG 图片', 'success');
                    closeLogoCropper();
                    return;
                }
                if (ctx.mode === 'url') {
                    const v = (ctx.urlValue || '').trim();
                    if (!v) { showToast('图片 URL 不能为空', 'warning'); return; }
                    sb.url = v;
                    sb.src = v;
                    sb.edit = null;
                    showToast('已使用图片 URL', 'success');
                    closeLogoCropper();
                    return;
                }
                const imgEl = ctx._imgEl;
                if (!imgEl) { showToast('请先选择图片', 'warning'); return; }
                try {
                    const dataURL = cropVpToDataURL(ctx);
                    if (!dataURL) { showToast('生成失败', 'error'); return; }
                    sb.url = dataURL;
                    sb.src = ctx.sourceImage;
                    sb.width = ctx.outputSizeW;
                    sb.edit = {
                        vpCrop: { ...ctx.vpCrop },
                        outputSizeW: ctx.outputSizeW,
                        outputSizeH: ctx.outputSizeH,
                        rotation: ctx.rotation || 0,
                        imgTranslateX: ctx.imgTranslateX,
                        imgTranslateY: ctx.imgTranslateY,
                        imgScale: ctx.imgScale,
                        iconOpacity: ctx.iconOpacity != null ? ctx.iconOpacity : 100,
                        bg: ctx.hLogoBg
                    };
                    showToast(`已生成 ${ctx.outputSizeW || 200}×${ctx.outputSizeH || 600} 收起背景`, 'success');
                    closeLogoCropper();
                    return;
                } catch(e) {
                    showToast('Canvas错误: ' + e.message, 'error');
                    return;
                }
            }

            if (ctx.target === 'headerLogo') {
                const label = ctx.headerLogoMode === 'favicon' ? 'favicon' : 'Logo';
                const writeBack = (val, extra) => {
                    let base = 'logoLight';
                    if (ctx.formTarget === 'sidebarTop') {
                        if (ctx.headerLogoMode === 'collapsedLight') { editForm.sidebarTop.logoCollapsedLight = val; base = 'logoCollapsedLight'; }
                        else { editForm.sidebarTop.logoLight = val; base = 'logoLight'; }
                    } else {
                        // headerConfig / favicon
                        if (ctx.headerLogoMode === 'favicon') { editForm.headerConfig.favicon = val; base = 'favicon'; }
                        else if (ctx.headerLogoMode === 'dark') { editForm.headerConfig.logoDark = val; base = 'logoDark'; }
                        else { editForm.headerConfig.logoLight = val; base = 'logoLight'; }
                    }
                    // 一并写入「未截取原图 + 编辑参数」（替换旧图时直接覆盖，旧原图随之清除）
                    if (extra) {
                        const store = (ctx.formTarget === 'sidebarTop') ? editForm.sidebarTop : editForm.headerConfig;
                        if ('src' in extra) store[base + 'Src'] = extra.src;
                        if ('edit' in extra) store[base + 'Edit'] = extra.edit;
                    }
                };
                if (ctx.mode === 'svg') {
                    const txt = (ctx.svgText || '').trim();
                    if (!txt) { showToast('SVG 内容不能为空', 'warning'); return; }
                    writeBack(txt, { src: txt, edit: null });
                    showToast('已使用 SVG ' + label, 'success');
                    closeLogoCropper();
                    return;
                }
                if (ctx.mode === 'url') {
                    const v = (ctx.urlValue || '').trim();
                    if (!v) { showToast(label + ' URL 不能为空', 'warning'); return; }
                    writeBack(v, { src: v, edit: null });
                    showToast('已使用 ' + label + ' URL', 'success');
                    closeLogoCropper();
                    return;
                }
                // upload 模式：所见即所得导出（固定视口即裁剪框，含背景填充 + 旋转）
                const img = ctx._imgEl;
                if (!img) { showToast('请先选择图片', 'warning'); return; }
                const vp = ctx.viewportSize || 320;
                const s = ctx.imgScale || 1;
                const tx = ctx.imgTranslateX || 0;
                const ty = ctx.imgTranslateY || 0;
                const dispW = ctx._dispW || vp;
                const dispH = ctx._dispH || vp;
                const box = ctx.hLogoBox || { x: (ctx.hLogoMargin || HLOGO_MARGIN), y: (ctx.hLogoMargin || HLOGO_MARGIN), w: vp - 2 * (ctx.hLogoMargin || HLOGO_MARGIN), h: vp - 2 * (ctx.hLogoMargin || HLOGO_MARGIN) };
                const outSize = Number(ctx.outputSize) || 200;
                const canvas = document.createElement('canvas');
                canvas.width = outSize;
                canvas.height = outSize;
                const cctx = canvas.getContext('2d');
                cctx.imageSmoothingEnabled = true;
                cctx.imageSmoothingQuality = 'high';
                // 1) 背景填充：裁剪框内未被图片覆盖的部分填充选中背景（透明则保留透明）
                const bg = ctx.hLogoBg || 'transparent';
                if (bg !== 'transparent') {
                    cctx.fillStyle = bg;
                    cctx.fillRect(0, 0, outSize, outSize);
                }
                // 2) 复刻预览变换，截取裁剪框区域（含以图片中心为原点的旋转）
                const k = outSize / box.w;
                const deg = (ctx.hLogoRotation || 0) * Math.PI / 180;
                cctx.save();
                cctx.scale(k, k);
                cctx.translate(-box.x, -box.y);
                cctx.translate(tx, ty);
                cctx.scale(s, s);
                cctx.translate(dispW / 2, dispH / 2);
                cctx.rotate(deg);
                cctx.translate(-dispW / 2, -dispH / 2);
                cctx.drawImage(img, 0, 0, dispW, dispH);
                cctx.restore();
                const mime = Utils.resolveImageMime(ctx.outputFormat || 'auto');
                // 原图（未截取）+ 编辑参数快照一并写入，方便日后重新调整
                const _src = ctx.sourceImage;
                const _edit = {
                    imgScale: s,
                    imgTranslateX: tx,
                    imgTranslateY: ty,
                    box: { x: box.x, y: box.y, w: box.w, h: box.h },
                    bg: ctx.hLogoBg,
                    rotation: ctx.hLogoRotation,
                    outputSize: outSize,
                    outputFormat: ctx.outputFormat,
                    outputQuality: ctx.outputQuality,
                    bgOpacity: ctx.bgOpacity != null ? ctx.bgOpacity : 100,
                    shape: ctx.shape || 'square'
                };
                if (ctx.shape === 'round') applyRoundClip(canvas);
                writeBack(Utils.finalImageDataUrl(canvas, ctx.outputFormat, ctx.outputQuality), { src: _src, edit: _edit });
                showToast(`已生成 ${outSize}×${outSize} ` + label, 'success');
                closeLogoCropper();
                return;
            }

            // 解析写入目标：搜索引擎 或 网站卡片 或 站点 Logo
            let targetObj = null;
            if (ctx.target === 'site') {
                // 普通网站编辑（非样式模式）：设 targetObj 后由下方通用逻辑处理
                targetObj = editForm.site;
            } else if (ctx.target === 'categoryIcon') {
                // 分类图标：支持 SVG / URL / Upload
                if (ctx.mode === 'svg') {
                    const txt = (ctx.svgText || '').trim();
                    if (!txt) { showToast('SVG 内容不能为空', 'warning'); return; }
                    editForm.category.iconShape = ctx.shape || 'square';
                    editForm.category.icon = txt;
                    showToast('已使用 SVG 图标', 'success');
                    closeLogoCropper();
                    return;
                }
                if (ctx.mode === 'url') {
                    const v = (ctx.urlValue || '').trim();
                    if (!v) { showToast('图标 URL 不能为空', 'warning'); return; }
                    editForm.category.iconShape = ctx.shape || 'square';
                    editForm.category.icon = v;
                    showToast('已使用图标 URL', 'success');
                    closeLogoCropper();
                    return;
                }
                // upload 模式
                const img = ctx._imgEl;
                if (!img) { showToast('请先选择图片', 'warning'); return; }
                const dispW = ctx._dispW || 1;
                const dispH = ctx._dispH || 1;
                const scaleX = img.naturalWidth / dispW;
                const scaleY = img.naturalHeight / dispH;
                const sx = Math.max(0, Math.round(ctx.crop.x * scaleX));
                const sy = Math.max(0, Math.round(ctx.crop.y * scaleY));
                const sw = Math.max(1, Math.round(ctx.crop.w * scaleX));
                const sh = Math.max(1, Math.round(ctx.crop.h * scaleY));
                const outW = ctx.output === 'square' ? Number(ctx.outputSize) || 64 : sw;
                const outH = ctx.output === 'square' ? Number(ctx.outputSize) || 64 : Math.round(sh * (outW / sw));
                const canvas = document.createElement('canvas');
                canvas.width = outW;
                canvas.height = outH;
                const cctx = canvas.getContext('2d');
                cctx.imageSmoothingEnabled = true;
                cctx.imageSmoothingQuality = 'high';
                // 应用旋转和背景
                const rotation = ctx.rotation || 0;
                if (rotation !== 0) {
                    cctx.save();
                    cctx.translate(outW / 2, outH / 2);
                    cctx.rotate(rotation * Math.PI / 180);
                    cctx.drawImage(img, sx, sy, sw, sh, -outW / 2, -outH / 2, outW, outH);
                    cctx.restore();
                } else {
                    cctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
                }
                const mime = Utils.resolveImageMime(ctx.outputFormat || 'auto');
                if (ctx.shape === 'round') applyRoundClip(canvas);
                const dataURL = Utils.finalImageDataUrl(canvas, ctx.outputFormat, ctx.outputQuality);
                editForm.category.iconShape = ctx.shape || 'square';
                editForm.category.icon = dataURL;
                showToast(`已生成 ${outW}×${outH} 图标`, 'success');
                closeLogoCropper();
                return;
            } else {
                if (ctx.tabIdx < 0 || ctx.engIdx < 0) { closeLogoCropper(); return; }
                targetObj = data.searchConfig.tabs[ctx.tabIdx]?.engines[ctx.engIdx];
            }
            if (!targetObj) { closeLogoCropper(); return; }

            if (ctx.mode === 'svg') {
                const txt = (ctx.svgText || '').trim();
                if (!txt) { showToast('SVG 内容不能为空', 'warning'); return; }
                targetObj.logo = txt;
                showToast('已使用 SVG Logo', 'success');
                closeLogoCropper();
                return;
            }
            if (ctx.mode === 'url') {
                const v = (ctx.urlValue || '').trim();
                if (!v) { showToast('Logo URL 不能为空', 'warning'); return; }
                targetObj.logo = v;
                showToast('已使用 Logo URL', 'success');
                closeLogoCropper();
                return;
            }

            // upload 模式：导出裁剪结果为 dataURL
            const img = ctx._imgEl;
            if (!img) { showToast('请先选择图片', 'warning'); return; }
            const dispW = ctx._dispW || 1;
            const dispH = ctx._dispH || 1;
            const scaleX = img.naturalWidth / dispW;
            const scaleY = img.naturalHeight / dispH;
            const sx = Math.max(0, Math.round(ctx.crop.x * scaleX));
            const sy = Math.max(0, Math.round(ctx.crop.y * scaleY));
            const sw = Math.max(1, Math.round(ctx.crop.w * scaleX));
            const sh = Math.max(1, Math.round(ctx.crop.h * scaleY));
            const outW = ctx.output === 'square' ? Number(ctx.outputSize) || 64 : sw;
            const outH = ctx.output === 'square' ? Number(ctx.outputSize) || 64 : Math.round(sh * (outW / sw));
            const canvas = document.createElement('canvas');
            canvas.width = outW;
            canvas.height = outH;
            const cctx = canvas.getContext('2d');
            cctx.imageSmoothingEnabled = true;
            cctx.imageSmoothingQuality = 'high';
            // 应用旋转和背景
            const rotation2 = ctx.rotation || 0;
            if (rotation2 !== 0) {
                cctx.save();
                cctx.translate(outW / 2, outH / 2);
                cctx.rotate(rotation2 * Math.PI / 180);
                cctx.drawImage(img, sx, sy, sw, sh, -outW / 2, -outH / 2, outW, outH);
                cctx.restore();
            } else {
                cctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
            }
            const mime = Utils.resolveImageMime(ctx.outputFormat || 'auto');
            if (ctx.shape === 'round') applyRoundClip(canvas);
            const dataURL = Utils.finalImageDataUrl(canvas, ctx.outputFormat, ctx.outputQuality);
            targetObj.logoShape = ctx.shape || 'square';
            targetObj.logo = dataURL;
            // 直接持久化（autoSave 有 500ms 延迟，刷新可能丢失）
            persistData({ mark: true, silent: true })
            showToast(`已生成 ${outW}×${outH} Logo`, 'success');
            closeLogoCropper();
        };

        // 切换裁剪器模式
        const switchCropperMode = (mode) => {
            const ctx = editForm.imageCropper;
            ctx.mode = mode;
            // 切到 upload 时若已有图片，重新初始化
            if (mode === 'upload' && ctx.sourceImage) {
                if (ctx.siteStyleMode) {
                    nextTick(() => {
                        const img = new Image();
                        img.onload = () => {
                            ctx._imgEl = img;
                            ctx.imgSize = { w: img.naturalWidth, h: img.naturalHeight };
                            const vp = ctx.viewportSize || 280;
                            const ratio = Math.min(vp / img.naturalWidth, vp / img.naturalHeight, 1);
                            ctx._dispW = Math.round(img.naturalWidth * ratio);
                            ctx._dispH = Math.round(img.naturalHeight * ratio);
                            ctx.imgScale = 1;
                            ctx.imgTranslateX = Math.round((vp - ctx._dispW) / 2);
                            ctx.imgTranslateY = Math.round((vp - ctx._dispH) / 2);
                            initVpCropBox(ctx);
                            updateCropPreview();
                        };
                        img.src = ctx.sourceImage;
                    });
                } else {
                    nextTick(() => initCropBox());
                }
            }
        };

        // 裁剪预览缩放
        const cropZoomIn = () => {
            const ctx = editForm.imageCropper;
            ctx.zoom = Math.min(4, (ctx.zoom || 1) + 0.25);
            if (ctx.target === 'headerLogo') clampCropPan(ctx);
        };
        const cropZoomOut = () => {
            const ctx = editForm.imageCropper;
            ctx.zoom = Math.max(0.25, (ctx.zoom || 1) - 0.25);
            if (ctx.target === 'headerLogo') clampCropPan(ctx);
        };
        const cropZoomReset = () => {
            const ctx = editForm.imageCropper;
            ctx.zoom = 1;
            ctx.imgTranslateX = 0;
            ctx.imgTranslateY = 0;
            if (ctx.target === 'headerLogo') clampCropPan(ctx);
        };
        const onCropWheel = (e) => {
            const ctx = editForm.imageCropper;
            e.preventDefault();
            e.stopPropagation();
            // 滚轮单次缩放固定 5%
            const delta = e.deltaY > 0 ? -0.05 : 0.05;
            const newZoom = Math.max(0.1, Math.min(4, (ctx.zoom || 1) + delta));
            if (newZoom !== (ctx.zoom || 1)) {
                ctx.zoom = newZoom;
                // 侧边栏顶部 Logo：WYSIWYG，缩放后重新夹紧平移，保证图片仍完整覆盖裁剪框
                if (ctx.target === 'headerLogo') clampCropPan(ctx);
                updateCropPreview();
            }
        };

        // 侧边栏顶部 Logo 场景：在裁剪框外空白区域拖拽，平移画布（滚轮缩放已改为以图片中心为原点）
        // 仅 headerLogo 生效；点击落在裁剪框上时交给裁剪框自身拖拽，不拦截
        const cropCanvasDrag = { active: false, startX: 0, startY: 0, startTx: 0, startTy: 0 };
        const onCropCanvasPointerDown = (e) => {
            const ctx = editForm.imageCropper;
            if (ctx.target !== 'headerLogo') return;            // 单个网站图标场景保持原样
            if (e.target.closest && e.target.closest('.cropper-box')) return;
            cropCanvasDrag.active = true;
            cropCanvasDrag.startX = e.clientX;
            cropCanvasDrag.startY = e.clientY;
            cropCanvasDrag.startTx = ctx.imgTranslateX || 0;
            cropCanvasDrag.startTy = ctx.imgTranslateY || 0;
            ctx._canvasDragging = true;
            const el = e.currentTarget;
            if (el) { try { el.setPointerCapture(e.pointerId); } catch (_) {} }
            e.preventDefault();
        };
        const onCropCanvasPointerMove = (e) => {
            if (!cropCanvasDrag.active) return;
            const ctx = editForm.imageCropper;
            const zoom = ctx.zoom || 1;
            const dx = (e.clientX - cropCanvasDrag.startX) / zoom;
            const dy = (e.clientY - cropCanvasDrag.startY) / zoom;
            ctx.imgTranslateX = cropCanvasDrag.startTx + dx;
            ctx.imgTranslateY = cropCanvasDrag.startTy + dy;
            clampCropPan(ctx);
        };
        const onCropCanvasPointerUp = (e) => {
            if (!cropCanvasDrag.active) return;
            cropCanvasDrag.active = false;
            editForm.imageCropper._canvasDragging = false;
            const el = e.currentTarget;
            if (el && e && e.pointerId) { try { el.releasePointerCapture(e.pointerId); } catch (_) {} }
        };

        // === 版本收藏 ===
        const toggleStarVersion = async (version) => {
            try {
                version.starred = !version.starred;
                await Storage.updateVersionStarred(version.id, version.starred);
            } catch (e) {
                showToast(`操作失败: ${e.message}`, 'error');
                version.starred = !version.starred;
            }
        };

        // === 版本重命名 ===
        const renamingVersion = ref(null);
        const renameNote = ref('');
        const startRenameVersion = (version) => {
            renamingVersion.value = version.id;
            renameNote.value = version.note;
            nextTick(() => {
                const el = document.querySelector('.version-rename-input');
                if (el) { el.focus(); el.select(); }
            });
        };
        const confirmRenameVersion = async (version) => {
            const note = (renameNote.value || '').trim();
            if (!note) { showToast('备注不能为空', 'warning'); return; }
            try {
                const oldId = version.id;
                const newId = await Storage.updateVersionNote(oldId, note);
                version.id = newId;
                version.note = note;
                version.name = note;
                if (currentEditingVersionId.value === oldId) {
                    currentEditingVersionId.value = newId;
                }
                renamingVersion.value = null;
                showToast('已重命名', 'success');
            } catch (e) {
                showToast(`重命名失败: ${e.message}`, 'error');
            }
        };
        const cancelRenameVersion = () => {
            renamingVersion.value = null;
        };

        // === 加载版本到编辑器进行修改（在新标签页中打开） ===
        const editVersionInEditor = (version) => {
            if (!confirm(`在新标签页中编辑「${version.note}」版本？`)) return;
            try {
                // 只存版本 ID，新窗口从 IndexedDB 读取完整数据（避免 localStorage 容量限制）
                localStorage.setItem('nav_editor_version_edit', JSON.stringify({
                    versionId: version.id,
                    note: version.note,
                    timestamp: Date.now()
                }));
                // 获取当前编辑器 URL（去掉 hash 和多余参数）
                const editorUrl = window.location.href.split('#')[0].split('?')[0];
                window.open(editorUrl, '_blank');
                showToast('已在新标签页打开版本编辑器', 'success');
                modal.versions = false;
            } catch (e) {
                showToast(`打开版本编辑失败: ${e.message}`, 'error');
            }
        };

        const addAccount = async () => {
            // 首次添加账号：确保凭证存储目录已配置
            if (!(await ensurePasswordDir())) return;
            // 已选中分类时，自动沿用当前分类对应的平台类型（如「服务器」→ server）
            const presetType = (accountFilter.value && accountFilter.value !== 'all') ? accountFilter.value : 'cloudflare';
            editForm.account = { id: null, type: presetType, name: '', accountId: '', projectName: '', apiToken: '', owner: '', repo: '', branch: 'main', token: '', deployType: 'nginx', localPath: '', localPreScript: '', localPostScript: '', host: '', port: 22, username: '', authMethod: 'password', password: '', privateKey: '', privateKeyPath: '', remotePath: '', remoteCommand: '', siteUrl: '' };
            modal.accountEdit = true;
        };

        const editAccount = (acc) => {
            editForm.account = { ...acc };
            modal.accountEdit = true;
        };

        const saveAccount = async () => {
            const f = editForm.account;
            // 清洗凭证字段：去除复制带入的不可见/非法字符（零宽空格、换行、首尾引号等）
            if (typeof f.accountId === 'string') f.accountId = sanitizeAccountId(f.accountId);
            if (typeof f.apiToken === 'string') f.apiToken = sanitizeToken(f.apiToken);
            if (typeof f.projectName === 'string') f.projectName = f.projectName.replace(/[^\x21-\x7E]/g, '').trim();
            ['name', 'owner', 'repo', 'branch', 'token'].forEach(k => {
                if (typeof f[k] === 'string') f[k] = f[k].trim();
            });
            if (!f.name) {
                showToast('请填写名称', 'warning');
                return;
            }
            if (f.type === 'github') {
                if (!f.owner || !f.repo || !f.token) {
                    showToast('请填写完整的 GitHub 信息（仓库所有者、仓库名、Token）', 'warning');
                    return;
                }
            } else if (f.type === 'vercel') {
                if (typeof f.token === 'string') f.token = sanitizeToken(f.token);
                if (!f.token) {
                    showToast('请填写 Vercel Access Token', 'warning');
                    return;
                }
            } else if (f.type === 'netlify') {
                if (typeof f.token === 'string') f.token = sanitizeToken(f.token);
                if (!f.token) {
                    showToast('请填写 Netlify Personal Access Token', 'warning');
                    return;
                }
            } else if (f.type === 'server') {
                if (f.deployType === 'local') {
                    if (!f.localPath || !f.localPath.trim()) {
                        showToast('请填写本地站点根目录（本地部署目标文件夹）', 'warning');
                        return;
                    }
                } else {
                    if (!f.host || !f.host.trim()) {
                        showToast('请填写服务器主机地址（IP 或域名）', 'warning');
                        return;
                    }
                    if (!f.username || !f.username.trim()) {
                        showToast('请填写服务器登录用户名', 'warning');
                        return;
                    }
                    if (f.authMethod === 'key') {
                        if (!(f.privateKey && f.privateKey.trim()) && !(f.privateKeyPath && f.privateKeyPath.trim())) {
                            showToast('请填写私钥内容或私钥文件路径', 'warning');
                            return;
                        }
                    } else if (!f.password) {
                        showToast('请填写服务器登录密码（或改用密钥认证）', 'warning');
                        return;
                    }
                }
            } else {
                if (!f.accountId || !f.projectName || !f.apiToken) {
                    showToast('请填写完整的 Cloudflare 信息', 'warning');
                    return;
                }
                const tokenType = detectCredentialType(f.apiToken);
                if (!tokenType.valid) {
                    showToast(tokenType.hint, 'error');
                    return;
                }
            }
            if (f.id) {
                // 编辑已有
                const idx = cfAccounts.value.findIndex(a => a.id === f.id);
                if (idx >= 0) cfAccounts.value[idx] = { ...f };
            } else {
                // 新增
                f.id = Utils.uid();
                cfAccounts.value.push({ ...f });
                if (!activeAccountId.value) activeAccountId.value = f.id;
            }
            await saveAccountsToServer();
            modal.accountEdit = false;
            showToast('账号已保存', 'success');
        };

        const deleteAccount = async (id) => {
            const acc = cfAccounts.value.find(a => a.id === id);
            if (!acc) return;
            const doDelete = async () => {
                cfAccounts.value = cfAccounts.value.filter(a => a.id !== id);
                if (activeAccountId.value === id) {
                    activeAccountId.value = cfAccounts.value[0]?.id || '';
                }
                await saveAccountsToServer();
                showToast('账号已删除', 'success');
            };
            askConfirm({
                title: '删除账号',
                message: `确定要删除账号「${acc.name || '未命名'}」吗？`,
                note: '删除后，历史版本中记录的该账号同步信息仍会保留，但该账号将无法再对历史版本执行「增量发布」——无法对比该账号上次发布的内容，历史版本下的文件将无法增量发布。',
                onConfirm: doDelete
            });
        };

        const selectAccount = async (id) => {
            activeAccountId.value = id;
            await saveAccountsToServer();
        };

        // === 版本同步关联（syncInfo）===
        // 版本 setting 中的 syncInfo: { [accountId]: { accountId, accountName, type, deployType, lastSyncAt, dataHash } }
        // - 以账号稳定 id 为键：账号改名不丢关联；账号删除后历史记录仍保留
        // - 每个账号每个版本只保留一条最新记录（重复发布原地更新），避免 setting 膨胀
        // - 不存文件哈希，文件级增量仍由账号级 deployBaseline 负责（发布时对比、更新）
        const hashString = (str) => {
            let h = 5381;
            for (let i = 0; i < str.length; i++) {
                h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
            }
            return h.toString(36);
        };
        const hashData = (d) => hashString(JSON.stringify(d || {}));
        // 版本数据哈希缓存：随 refreshVersions 更新，避免每次渲染重复序列化大数据
        const versionDataHashCache = {};

        // 发布成功后记录「版本 ↔ 账号」关联（本地幂等更新，不产生重复条目）
        const recordVersionSync = async (versionId, account, dataHash, files) => {
            if (!versionId || !account || !account.id) return;
            try {
                const vs = await Storage.getVersion(versionId);
                if (!vs) return;
                const syncInfo = (vs.syncInfo && typeof vs.syncInfo === 'object') ? vs.syncInfo : {};
                syncInfo[account.id] = {
                    accountId: account.id,
                    accountName: account.name || '',
                    type: account.type || '',
                    deployType: account.deployType || '',
                    lastSyncAt: Date.now(),
                    dataHash: dataHash || ''
                };
                // 版本级发布基线：该版本发布到该账号的文件哈希快照（记忆/审计用，不进分享包）
                const deployBaselines = (vs.deployBaselines && typeof vs.deployBaselines === 'object') ? vs.deployBaselines : {};
                deployBaselines[account.id] = {
                    accountId: account.id,
                    accountName: account.name || '',
                    lastPublishAt: Date.now(),
                    dataHash: dataHash || '',
                    files: (files && typeof files === 'object') ? files : {}
                };
                await Storage.patchVersionSetting(versionId, { syncInfo, deployBaselines });
            } catch (e) {
                console.warn('记录版本同步信息失败:', e);
            }
        };

        // 版本在某账号下的同步状态：'synced'（最后一次修改已发布）| 'pending'（有未发布修改）| 'none'（从未发布）
        const versionSyncState = (version) => {
            if (!version || !version.syncInfo || !activeAccountId.value) return 'none';
            const si = version.syncInfo[activeAccountId.value];
            if (!si || !si.dataHash) return 'none';
            const curHash = versionDataHashCache[version.id] || hashData(version.data);
            return si.dataHash === curHash ? 'synced' : 'pending';
        };

        // 「同步信息」弹窗：展示该版本发布过的账号、各账号最后同步时间与未发布修改状态
        const syncVersion = ref(null);
        const versionUploadRecords = ref([]);
        const openVersionSyncInfo = async (version) => {
            syncVersion.value = version || null;
            versionUploadRecords.value = [];
            modal.versionSync = true;
            if (version && version.id) {
                try {
                    versionUploadRecords.value = await Storage.getVersionUploadRecords(Storage.getCurrentProfileId(), version.id);
                } catch (_e) {
                    versionUploadRecords.value = [];
                }
            }
        };
        // 弹窗内账号显示：优先取当前账号名称（改名后展示新名），否则用记录时的名称
        const syncAccountDisplayName = (si) => {
            if (!si) return '';
            const cur = cfAccounts.value.find(a => a.id === si.accountId);
            return (cur && cur.name) ? cur.name : (si.accountName || si.accountId || '');
        };
        const syncAccountState = (si) => {
            const ver = syncVersion.value;
            if (!si || !ver) return 'none';
            if (!si.dataHash) return 'none';
            return si.dataHash === (versionDataHashCache[ver.id] || hashData(ver.data)) ? 'synced' : 'pending';
        };

        // 统一收集部署文件（发布 / 下载部署文件 / 下载修改文件共用同一套逻辑与口径）
        // scopeKey: 'fullFiles'（全量）| 'incrementalFiles'（增量）；sourceData 为空时使用当前编辑状态
        // opts.skipHash：快速发布用（不比对哈希，跳过计算哈希以提速）
        const collectDeployFiles = async (sourceData, scopeKey, opts = {}) => {
            const ds = (data.deploySettings && typeof data.deploySettings === 'object') ? data.deploySettings : {};
            const df = (ds[scopeKey] && typeof ds[scopeKey] === 'object')
                ? ds[scopeKey]
                : { index: true, about: true, commit: true, customCss: true, notFound: true, assets: true };
            const { indexHtml, aboutHtml, commitHtml } = await prepareDeploymentHtml(sourceData);
            const payload = {
                indexHtml: df.index ? indexHtml : '',
                aboutHtml: df.about ? aboutHtml : '',
                commitHtml: df.commit ? commitHtml : '',
                fileFilter: {
                    customCss: df.customCss !== false,
                    notFound: df.notFound !== false,
                    assets: df.assets !== false
                },
                includePaths: Array.isArray(ds.includePaths) ? ds.includePaths : [],
                extraFiles: buildSeoFiles(sourceData)
            };
            showToast('正在收集部署文件...', 'info', 10000);
            const filesResp = await fetch('/api/deployment-files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!filesResp.ok) {
                const err = await filesResp.json().catch(() => ({ error: '获取部署文件列表失败' }));
                throw new Error(err.error || '获取部署文件列表失败');
            }
            const filesData = await filesResp.json();
            if (!filesData.ok) throw new Error(filesData.error || '获取部署文件列表失败');
            const enc = new TextEncoder();
            for (const f of filesData.files) {
                f.binary = !!f.binary;
                f.mtime = Number(f.mtime) || 0;
                // 生成文件（mtime=0，如 index/about/commit.html）在快速发布中总是上传
                f.always = f.mtime === 0;
                if (!opts.skipHash) {
                    f.hash = await computeFileHash(f.content, f.binary);
                }
                f.bytes = f.binary ? Math.max(1, Math.floor(f.content.length * 3 / 4)) : enc.encode(f.content).length;
            }
            return filesData.files;
        };

        const syncToCloudflare = async (forceFull = false, sourceData = null, sourceLabel = '', sourceVersionId = '', quick = false, quickState = null) => {
            if (cfAccounts.value.length === 0) {
                showToast('请先添加账号', 'warning');
                modal.settings = true;
                return;
            }
            if (!activeAccountId.value) {
                showToast('请选择要部署到的账号', 'warning');
                return;
            }
            // 发布前流程（仅工具栏的增量/全量发布，即 sourceData 为空时）：
            // 未保存先询问保存，然后弹出发布确认
            if (!publishConfirmApproved.value && !sourceData) {
                if (quick) {
                    // 快速发布：不弹确认；未保存时静默保存后直接继续
                    if (dirty.value && !publishSaveDone.value) {
                        try {
                            await persistData({ mark: false, silent: true });
                            dirty.value = false;
                        } catch (e) {
                            showToast('保存失败：' + (e.message || e), 'error');
                            return;
                        }
                    }
                } else {
                    publishPending.value = { forceFull, sourceData: null, sourceLabel: '', sourceVersionId: '' };
                    if (dirty.value && !publishSaveDone.value) {
                        modal.publishSavePrompt = true;
                        return;
                    }
                    modal.publishConfirm = true;
                    return;
                }
            }

            const account = cfAccounts.value.find(a => a.id === activeAccountId.value);
            if (!account) {
                showToast('未找到选中的账号', 'error');
                return;
            }

            // 统一生成部署 HTML 并收集文件（与「打包导出 / 下载修改文件」同一套逻辑）
            // sourceData 非空时（发布历史版本快照）以该快照数据为发布源，否则用当前编辑状态
            // 快速发布：quickState 已由 quickPublish 预收集并计算好修改文件，直接复用
            let files;
            syncDetail.show = false;
            if (quick && quickState && Array.isArray(quickState.files)) {
                files = quickState.files;
            } else {
                const scopeKey = (forceFull || quick) ? 'fullFiles' : 'incrementalFiles';
                files = await collectDeployFiles(sourceData || undefined, scopeKey);
            }

            // 增量比对：与上次发布基线比较，只上传变更/新增文件
            // 快速发布：基于本地记录（上次快速发布的文件修改时间）只传修改/新增文件，不比对哈希
            const key = getAccountKey(account);
            const baseline = (data.deployBaseline && data.deployBaseline[key]) || {};
            let toUpload, modeLabel, toDelete = [];
            if (quick) {
                toUpload = (quickState && Array.isArray(quickState.toUpload)) ? quickState.toUpload : files;
                // Vercel/Netlify 为快照部署，实际会全量上传（提示/履历按真实数量）
                if (account.type === 'vercel' || account.type === 'netlify') toUpload = files;
                modeLabel = `快速发布（直传 ${toUpload.length} 个修改文件，不比对哈希）`;
            } else if (forceFull || Object.keys(baseline).length === 0) {
                toUpload = files;
                modeLabel = Object.keys(baseline).length === 0 ? '首次发布（自动全量并建基线）' : '全量发布';
            } else {
                toUpload = files.filter(f => baseline[f.path] !== f.hash);
                modeLabel = `增量发布（仅 ${toUpload.length} 个变更文件）`;
            }
            if (!quick) {
                // 计算“此前发布过、本次已从部署集移除”的文件（历史残留：根 commit.html、password/ 等）。
                // GitHub 需显式删除远端文件；Cloudflare/Vercel/Netlify 为快照部署，新部署自动不含这些文件。
                const prevPaths = Object.keys(baseline);
                const currentPaths = new Set(files.map(f => f.path));
                toDelete = prevPaths.filter(p => !currentPaths.has(p));
                if (toDelete.length) {
                    modeLabel += `（另清理 ${toDelete.length} 个旧文件）`;
                }
            }

            const isGitHub = account.type === 'github';
            const isVercel = account.type === 'vercel';
            const isNetlify = account.type === 'netlify';
            const isServer = account.type === 'server';
            const fileCount = files.length;
            // 初始化进度（根据平台显示不同步骤）
            if (isGitHub) {
                syncSteps.value = [
                    { name: '检查仓库', detail: `账号: ${account.name}...`, status: 'pending' },
                    { name: '获取文件状态', detail: '检查现有文件...', status: 'pending' },
                    { name: '上传文件', detail: toUpload.length ? `上传 ${toUpload.length} 个变更文件...` : '无变更，跳过上传', status: 'pending' },
                    { name: '完成', detail: '等待 GitHub Pages 自动部署...', status: 'pending' }
                ];
            } else if (isVercel) {
                syncSteps.value = [
                    { name: '校验 Token', detail: `账号: ${account.name}...`, status: 'pending' },
                    { name: '准备文件', detail: `编码 ${fileCount} 个文件...`, status: 'pending' },
                    { name: '创建部署', detail: '提交到 Vercel...', status: 'pending' },
                    { name: '等待就绪', detail: '等待 Vercel 部署完成...', status: 'pending' }
                ];
            } else if (isNetlify) {
                syncSteps.value = [
                    { name: '校验 Token', detail: `账号: ${account.name}...`, status: 'pending' },
                    { name: '准备文件', detail: `编码 ${fileCount} 个文件...`, status: 'pending' },
                    { name: '创建部署', detail: '提交到 Netlify...', status: 'pending' },
                    { name: '等待就绪', detail: '等待 Netlify 部署完成...', status: 'pending' }
                ];
            } else if (isServer) {
                const isLocal = account.deployType === 'local';
                syncSteps.value = [
                    { name: '连接目标', detail: isLocal ? `本地目录: ${account.localPath || ''}` : `SSH ${account.host || ''}:${account.port || 22}`, status: 'pending' },
                    { name: '写入文件', detail: toUpload.length ? `写入 ${toUpload.length} 个文件...` : '无变更，跳过写入', status: 'pending' },
                    { name: '清理旧文件', detail: toDelete.length ? `清理 ${toDelete.length} 个旧文件...` : '无旧文件需清理', status: 'pending' },
                    { name: '执行脚本', detail: (account.localPreScript || account.localPostScript || account.remoteCommand) ? '执行部署脚本...' : '未配置脚本，跳过', status: 'pending' },
                    { name: '完成', detail: '部署完成', status: 'pending' }
                ];
            } else {
                syncSteps.value = [
                    { name: '获取上传凭证', detail: `账号: ${account.name}...`, status: 'pending' },
                    { name: '计算文件哈希', detail: `计算 ${fileCount} 个文件哈希...`, status: 'pending' },
                    { name: '检查缺失文件', detail: '对比已上传文件...', status: 'pending' },
                    { name: '上传文件', detail: toUpload.length ? `上传 ${toUpload.length} 个变更文件...` : '无变更，跳过上传', status: 'pending' },
                    { name: '创建部署', detail: '提交部署清单...', status: 'pending' }
                ];
            }
            syncResult.value = null;
            syncLogs.value = [];
            modal.sync = true;
            showToast(modeLabel, 'info', 4000);
            // 若本次发布来自历史版本快照，明确提示发布来源，确认当前发布目标
            if (sourceLabel) showToast('发布来源：' + sourceLabel, 'info', 4000);

            try {
                const onProgress = (stepIdx, stepData) => {
                    syncSteps.value[stepIdx] = { ...stepData, status: stepData.done ? 'done' : 'active' };
                };
                const onDetail = (ev) => {
                    if (ev.type === 'init') {
                        syncDetail.show = true;
                        syncDetail.expanded = false;
                        syncDetail.total = ev.total;
                        syncDetail.totalBytes = ev.totalBytes || 0;
                        syncDetail.uploaded = 0;
                        syncDetail.uploadedBytes = 0;
                        syncDetail.startTime = Date.now();
                        syncDetail.current = '';
                        syncDetail.items = ev.items || [];
                    } else if (ev.type === 'item-start') {
                        syncDetail.current = ev.path;
                        if (syncDetail.items[ev.index]) syncDetail.items[ev.index].status = 'uploading';
                    } else if (ev.type === 'item-done') {
                        if (syncDetail.items[ev.index]) syncDetail.items[ev.index].status = 'done';
                        syncDetail.uploaded = Math.min(syncDetail.total, syncDetail.uploaded + 1);
                        syncDetail.uploadedBytes += (ev.bytes || 0);
                        syncDetail.current = '';
                    } else if (ev.type === 'item-error') {
                        if (syncDetail.items[ev.index]) syncDetail.items[ev.index].status = 'error';
                    }
                };
                const onLog = (line) => {
                    syncLogs.value.push({ ts: new Date(), level: line.level || 'info', text: line.text || '' });
                };

                const result = isGitHub
                    ? await GitHubSync.deployFiles(files, account, onProgress, { onlyFiles: toUpload, deleteFiles: toDelete, onDetail, forceFull, shardTree: githubShardTree.value })
                    : isVercel
                    ? await VercelSync.deployFiles(files, account, onProgress, { onDetail })
                    : isNetlify
                    ? await NetlifySync.deployFiles(files, account, onProgress, { onDetail })
                    : isServer
                    ? await ServerSync.deploy(toUpload, account, onProgress, onLog, { deleteFiles: toDelete })
                    : await CloudflareSync.deployFiles(files, account, onProgress, { onlyFiles: toUpload, deleteFiles: toDelete, onDetail });

                // 写回全量基线（无论增量还是全量，远端最终状态 = 全量 files）
                // 快速发布不更新基线：下次仍会按当前基线比对，保持“不记忆、直传”语义
                let newBaseline = {};
                if (!quick) {
                    if (!data.deployBaseline) data.deployBaseline = {};
                    newBaseline = {};
                    for (const f of files) newBaseline[f.path] = f.hash;
                    data.deployBaseline[key] = newBaseline;
                    persistData({ mark: false, silent: true });
                }

                // 记录「版本 ↔ 账号」同步关联：发布源为版本快照时记到该版本，否则记到当前编辑版本
                const syncVerId = sourceVersionId || currentEditingVersionId.value || '';
                if (syncVerId) {
                    await recordVersionSync(syncVerId, account, hashData(sourceData || data), newBaseline);
                    try { await refreshVersions(); } catch (_) {}
                }
                // 快速发布：在对应历史版本的 upload/ 下写一条本地履历（记录调用账号等信息）
                if (quick && syncVerId) {
                    try {
                        let target = '';
                        if (account.type === 'github') target = (account.owner || '') + '/' + (account.repo || '');
                        else if (account.type === 'server') target = account.deployType === 'local' ? (account.localPath || '') : ((account.host || '') + ':' + (account.remotePath || ''));
                        else target = account.projectName || account.siteName || '';
                        const totalBytes = files.reduce((s, f) => s + (f.bytes || 0), 0);
                        // 记录本次上传后的完整文件状态（path -> mtime/size），供下次快速发布只传修改
                        const fileState = {};
                        for (const f of files) {
                            fileState[f.path] = { mtime: f.mtime || 0, size: f.bytes || 0, always: !!f.always };
                        }
                        await Storage.writeVersionUploadRecord(Storage.getCurrentProfileId(), syncVerId, {
                            at: Date.now(),
                            mode: 'quick',
                            ok: true,
                            files: files.length,
                            uploaded: toUpload.length,
                            bytes: totalBytes,
                            account: { id: account.id, name: account.name, type: account.type, target },
                            fileState
                        });
                    } catch (_e) { console.warn('写入快速发布履历失败', _e); }
                }

                syncResult.value = result;
                const okMsg = (result && result.skipped) ? `${modeLabel}：无变更，已是最新` : `已部署到 ${account.name}`;
                showToast(okMsg, 'success');
            } catch (e) {
                console.error(e);
                const errorStep = syncSteps.value.findIndex(s => s.status === 'active');
                if (errorStep >= 0) {
                    syncSteps.value[errorStep].status = 'error';
                    syncSteps.value[errorStep].detail = e.message;
                }
                // GitHub 建树超时/过大：提供“分片发布”一键方案，不卡死在这里
                if (e && e.code === 'TREE_TOO_LARGE') {
                    treeTooLargeContext.value = { forceFull, sourceData, sourceLabel, sourceVersionId, quick, quickState };
                    modal.treeTooLarge = true;
                }
                // 用 syncResult 标记失败状态（模板里通过 success: false 区分）
                const errMsg = (e && e.message) ? e.message : String(e);
                let toastMsg = `发布失败: ${errMsg}`;
                if (/bad credentials/i.test(errMsg)) {
                    toastMsg += '（GitHub Token 无效或已过期，请在“账号管理”中重新生成并确认无多余空格）';
                }
                syncResult.value = { success: false, message: toastMsg };
                showToast(toastMsg, 'error', 5000);
            }
        };

        // === 快速发布：不比对哈希，直传全部部署文件（最快路径）===
        // 本地记录上次快速发布传输的文件状态（修改时间），本次只传修改/新增的文件，不比对哈希
        const quickPublish = async () => {
            publishMenuOpen.value = false;
            if (cfAccounts.value.length === 0) {
                showToast('请先添加账号', 'warning');
                modal.settings = true;
                return;
            }
            if (!activeAccountId.value) {
                showToast('请选择要部署到的账号', 'warning');
                return;
            }
            const account = cfAccounts.value.find(a => a.id === activeAccountId.value);
            if (!account) {
                showToast('未找到选中的账号', 'error');
                return;
            }
            // 未保存先静默保存，保证要发布的内容已落盘（不弹窗，保持快速）
            if (dirty.value) {
                try {
                    await persistData({ mark: false, silent: true });
                    dirty.value = false;
                } catch (e) {
                    showToast('保存失败：' + (e.message || e), 'error');
                    return;
                }
            }
            try {
                showToast('正在检查发布状态...', 'info', 5000);
                // 快速发布不比对哈希：跳过哈希计算以提速
                const files = await collectDeployFiles(undefined, 'fullFiles', { skipHash: true });
                // 读取该版本下最近一次该账号的快速发布履历（本地记忆：上次传输了哪些文件）
                const syncVerId = currentEditingVersionId.value || data.currentVersionId || '';
                let prevState = {};
                if (syncVerId) {
                    try {
                        const records = await Storage.getVersionUploadRecords(Storage.getCurrentProfileId(), syncVerId);
                        for (let i = records.length - 1; i >= 0; i--) {
                            const r = records[i];
                            if (r && r.mode === 'quick' && r.ok && r.account && r.account.id === account.id
                                && r.fileState && typeof r.fileState === 'object') {
                                prevState = r.fileState;
                                break;
                            }
                        }
                    } catch (_e) { prevState = {}; }
                }
                const hasPrev = Object.keys(prevState).length > 0;
                // 不比对哈希：生成文件（always）总是上传；磁盘文件按修改时间/大小判断是否修改
                const toUpload = files.filter(f => {
                    if (f.always) return true;
                    const prev = prevState[f.path];
                    if (!prev) return true;
                    return prev.mtime !== (f.mtime || 0) || prev.size !== (f.bytes || 0);
                });
                // Vercel/Netlify 为快照部署，必须全量上传（平台机制）
                const isSnapshotPlatform = account.type === 'vercel' || account.type === 'netlify';
                let message, note;
                if (!hasPrev) {
                    // 首次快速发布：该版本从未对该账号快速发布过，无法对比修改
                    message = `首次快速发布：将直传全部 ${files.length} 个文件`;
                    note = '尚未快速发布过该版本，无法对比修改。确认后将直接上传全部文件（不比对哈希）。';
                } else if (isSnapshotPlatform) {
                    message = toUpload.length === 0 ? '未检测到修改：文件与上次快速发布一致' : `检测到 ${toUpload.length} 个修改/新增文件`;
                    note = 'Vercel/Netlify 为快照部署，确认后将上传全部文件。';
                } else if (toUpload.length === 0) {
                    message = '未检测到修改：文件与上次快速发布一致';
                    note = `确认后仍会重新上传全部 ${files.length} 个文件（快速发布不比对哈希）。`;
                } else {
                    message = `检测到 ${toUpload.length} 个修改/新增文件，本次只上传这些`;
                    note = `共 ${files.length} 个文件；未修改的 ${files.length - toUpload.length} 个将跳过（按文件修改时间判断，不比对哈希）。`;
                }
                askConfirm({
                    title: '快速发布确认',
                    message,
                    note,
                    confirmText: '快速发布',
                    danger: false,
                    icon: 'fas fa-bolt',
                    onConfirm: () => {
                        // 无修改且用户确认“仍要重新上传”时，改为全量上传，避免传 0 个文件
                        const finalUpload = toUpload.length === 0 ? files : toUpload;
                        syncToCloudflare(false, null, '', '', true, { files, toUpload: finalUpload });
                    }
                });
            } catch (e) {
                showToast('检查发布状态失败：' + (e.message || e), 'error');
            }
        };

        // === GitHub 建树超时/过大：一键“分片发布”（分批构建 tree，绕过 GitHub 请求体超时）===
        const confirmShardPublish = async () => {
            const ctx = treeTooLargeContext.value;
            modal.treeTooLarge = false;
            treeTooLargeContext.value = null;
            if (!ctx) return;
            githubShardTree.value = true;
            try {
                await syncToCloudflare(ctx.forceFull, ctx.sourceData, ctx.sourceLabel, ctx.sourceVersionId, ctx.quick, ctx.quickState);
            } catch (e2) {
                showToast('分片发布仍失败：' + (e2.message || e2), 'error', 6000);
            } finally {
                githubShardTree.value = false;
            }
        };

        // === 发布指定的历史版本快照（以该快照数据为发布源）===
        const publishVersion = async (v) => {
            if (!v || !v.id) return;
            if (cfAccounts.value.length === 0) {
                showToast('请先添加账号', 'warning');
                modal.settings = true;
                return;
            }
            if (!activeAccountId.value) {
                showToast('请选择要部署到的账号', 'warning');
                return;
            }
            const label = v.note || '未命名版本';
            showToast(`正在准备版本「${label}」...`, 'info', 6000);
            try {
                const setting = await Storage.getVersion(v.id);
                if (!setting || !setting.data) {
                    showToast('无法读取该版本数据', 'error');
                    return;
                }
                const vd = setting.data;
                if (!Array.isArray(vd.categories)) vd.categories = [];
                if (!vd.site || typeof vd.site !== 'object') vd.site = {};
                // 关闭历史弹窗，避免遮挡发布进度
                modal.versions = false;
                // sourceData 传入快照数据；sourceLabel 用于"确认当前发布目标"提示
                await syncToCloudflare(false, vd, label, v.id);
            } catch (e) {
                console.error(e);
                showToast(`发布版本失败: ${e.message}`, 'error');
            }
        };

        // === 拖拽排序 ===
        const dragData = ref(null);
        // 预瞄准信息：{ type: 'category'|'sub', targetId, position: 'before'|'after' }
        // 用于在 UI 上画一条蓝色横线，提示用户"拖到这里会插到目标前/后"
        const dropPreview = ref(null);

        // ============ 拖拽排序 ============
        // 卡片拖拽：NavEditor.exe 内嵌浏览器（CEF/WebView2）会拦截原生 HTML5 Drag&Drop，
        // 故卡片用 Pointer Events 实现。左侧分类/子分类树的拖拽移植自"板块管理"的丝滑方案
        //（mousedown + 50ms 长按 + 实时重排数据），不受原生拖拽限制影响。
        const _dragStart = ref(null); // { x, y, payload, active }
        const _lastDropTargetId = ref(null); // 上一次实时交换的目标 ID，避免重复排序

        const _rowAtPoint = (clientX, clientY) => {
            const el = document.elementFromPoint(clientX, clientY);
            return el ? el.closest('[data-cat-id],[data-card-index]') : null;
        };

        const _posAtPoint = (clientY, el) => {
            const rect = el.getBoundingClientRect();
            return (clientY - rect.top) < rect.height / 2 ? 'before' : 'after';
        };

        const _cleanupDrag = () => {
            dragData.value = null;
            dropPreview.value = null;
            draggingCardIndex.value = null;
            _dragStart.value = null;
            _lastDropTargetId.value = null;
            window.removeEventListener('pointermove', _onPointerMove);
            window.removeEventListener('pointerup', _onPointerUp);
            window.removeEventListener('pointercancel', _cleanupDrag);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        const _onPointerMove = (event) => {
            const s = _dragStart.value;
            if (!s) return;
            if (!s.active) {
                const dx = event.clientX - s.x, dy = event.clientY - s.y;
                if (Math.hypot(dx, dy) < 1) return; // 移动阈值：几乎一碰即拖，灵敏度最高
                s.active = true;
                dragData.value = s.payload;
                if (s.payload.type === 'card') draggingCardIndex.value = s.payload.index;
                document.body.style.cursor = 'grabbing';
                document.body.style.userSelect = 'none';
            }
            // ── 卡片：保持原有预览线模式不变 ──
            const d = dragData.value;
            const row = _rowAtPoint(event.clientX, event.clientY);
            if (!row) { dropPreview.value = null; return; }
            const catId = row.getAttribute('data-cat-id');
            const subId = row.getAttribute('data-sub-id');
            if (d.type === 'category') {
                if (catId && !subId && catId !== d.catId) {
                    dropPreview.value = { type: 'category', targetId: catId, position: _posAtPoint(event.clientY, row) };
                } else { dropPreview.value = null; }
            } else if (d.type === 'sub') {
                if (catId === d.catId && subId && subId !== d.subId) {
                    dropPreview.value = { type: 'sub', catId, targetId: subId, position: _posAtPoint(event.clientY, row) };
                } else { dropPreview.value = null; }
            } else { // card
                const idxAttr = row.getAttribute('data-card-index');
                if (idxAttr !== null) {
                    const targetIndex = parseInt(idxAttr, 10);
                    if (targetIndex !== d.index) {
                        dropPreview.value = { type: 'card', targetIndex, position: _posAtPoint(event.clientY, row) };
                    } else { dropPreview.value = null; }
                } else { dropPreview.value = null; }
            }
        };

        const _onPointerUp = () => {
            const s = _dragStart.value;
            if (!s || !s.active) { _cleanupDrag(); return; } // 仅点击，未拖动
            const d = dragData.value;
            const preview = dropPreview.value;
            // 卡片：保持原有预览线模式的最终交换逻辑
            if (d && preview && d.type === 'card') {
                const sub = currentSub.value;
                const dragIndex = d.index, dropIndex = preview.targetIndex;
                if (sub && dragIndex >= 0 && dropIndex >= 0
                    && dragIndex < sub.sites.length && dropIndex < sub.sites.length
                    && dragIndex !== dropIndex) {
                    const temp = sub.sites[dragIndex];
                    sub.sites[dragIndex] = sub.sites[dropIndex];
                    sub.sites[dropIndex] = temp;
                }
            }
            _cleanupDrag();
        };

        // start：不在 pointerdown 时 preventDefault，否则会抑制后续 click 事件导致点选失效；
        // 改为在 _onPointerMove 超过移动阈值后才禁用文本选择。
        const _startPointerDrag = (event, payload) => {
            if (event.button !== undefined && event.button !== 0) return;
            _dragStart.value = { x: event.clientX, y: event.clientY, payload, active: false };
            window.addEventListener('pointermove', _onPointerMove);
            window.addEventListener('pointerup', _onPointerUp);
            window.addEventListener('pointercancel', _cleanupDrag);
        };

        // ─── 左侧分类树拖拽（移植"板块管理"丝滑方案：mousedown + 50ms长按 + 实时重排数据）───
        // 分类在 .tree-list 顶层排序；子分类只在所属父分类的 .tree-children 内排序（天然锁死，拖不出去）
        const draggingTreeKey = ref(null); // 当前被拖项的 key：'cat:ID' 或 'sub:CATID:SUBID'
        let _td = null; // 拖拽运行时状态：{ type, catId, subId, key, dragging, startY }

        const _treeRowKey = (el) => {
            const catId = el.getAttribute('data-cat-id');
            const subId = el.getAttribute('data-sub-id');
            return subId ? ('sub:' + catId + ':' + subId) : ('cat:' + catId);
        };

        const _treeLevelRows = (d) => {
            if (d.type === 'category') {
                return Array.prototype.slice.call(document.querySelectorAll('.tree-item-row:not(.tree-sub-row)'));
            }
            return Array.prototype.slice.call(document.querySelectorAll('.tree-sub-row[data-cat-id="' + d.catId + '"]'));
        };

        // 把 dragged 在数组 arr 中移动到 targetId 之前/之后
        const _treeReorder = (d, targetCatId, targetSubId, after) => {
            let arr;
            if (d.type === 'category') {
                arr = data.categories;
            } else {
                const cat = data.categories.find(function (c) { return c.id === d.catId; });
                if (!cat) return;
                arr = cat.children;
            }
            const draggedId = d.type === 'category' ? d.catId : d.subId;
            const di = arr.findIndex(function (x) { return x.id === draggedId; });
            if (di < 0) return;
            const ti = arr.findIndex(function (x) {
                return d.type === 'category' ? (x.id === targetCatId) : (x.id === targetSubId);
            });
            if (ti < 0 || ti === di) return;
            const dragged = arr.splice(di, 1)[0];
            const newTi = arr.findIndex(function (x) {
                return d.type === 'category' ? (x.id === targetCatId) : (x.id === targetSubId);
            });
            const insertAt = after ? newTi + 1 : newTi;
            arr.splice(insertAt, 0, dragged);
        };

        const _onTreeDragMove = (event) => {
            const d = _td;
            if (!d) return;
            if (!d.dragging) {
                // 主分类与子分类均最灵敏：去掉任何触发距离，鼠标一移动即抓住
                // 零阈值：鼠标一移动即抓住
                d.dragging = true;
                draggingTreeKey.value = d.key;
                document.body.style.userSelect = 'none';
                document.body.style.cursor = 'grabbing';
            }
            event.preventDefault();
            const rows = _treeLevelRows(d);
            let ref = null; // { catId, subId, after }
            for (let i = 0; i < rows.length; i++) {
                const r = rows[i];
                if (_treeRowKey(r) === d.key) continue;
                const rect = r.getBoundingClientRect();
                if (event.clientY < rect.top + rect.height * 0.5) {
                    ref = { catId: r.getAttribute('data-cat-id'), subId: r.getAttribute('data-sub-id'), after: false };
                    break;
                }
                if (event.clientY < rect.bottom) {
                    ref = { catId: r.getAttribute('data-cat-id'), subId: r.getAttribute('data-sub-id'), after: true };
                }
            }
            if (ref) _treeReorder(d, ref.catId, ref.subId, ref.after);
        };

        // 拖拽真正发生（有位移）后屏蔽松手瞬间浏览器补发的那次 click，避免被误当成"点开编辑/切换选中"
        const _suppressNextClick = () => {
            let removed = false;
            const h = (e) => {
                if (removed) return;
                e.stopPropagation();
                e.preventDefault();
                removed = true;
                document.removeEventListener('click', h, true);
            };
            document.addEventListener('click', h, true);
            setTimeout(() => {
                if (!removed) { removed = true; document.removeEventListener('click', h, true); }
            }, 350);
        };

        const _onTreeDragUp = () => {
            const d = _td;
            if (d && d.dragging) {
                persistData({ mark: true, silent: true }); _suppressNextClick();
                if (d.type === 'sub') { selectedCategoryId.value = d.catId; selectedSubId.value = d.subId; }
                else if (d.type === 'category') { selectedCategoryId.value = d.catId; selectedSubId.value = null; }
            }
            _td = null;
            draggingTreeKey.value = null;
            document.removeEventListener('mousemove', _onTreeDragMove);
            document.removeEventListener('mouseup', _onTreeDragUp);
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        };

        const _startTreeDrag = (type, catId, subId, event) => {
            if (event.button !== undefined && event.button !== 0) return;
            selectedCategoryId.value = null; selectedSubId.value = null;
            const key = type === 'category' ? ('cat:' + catId) : ('sub:' + catId + ':' + subId);
            // 仅记录起点；真正"抓住"推迟到鼠标移动超过阈值，避免误把单击当作拖动
            _td = { type: type, catId: catId, subId: subId, key: key, dragging: false, startY: event.clientY };
            document.addEventListener('mousemove', _onTreeDragMove);
            document.addEventListener('mouseup', _onTreeDragUp);
        };

        const onTreeHandleDown = (event, catId) => { _startTreeDrag('category', catId, null, event); };
        const onSubHandleDown = (event, catId, subId) => { _startTreeDrag('sub', catId, subId, event); };

        // ─── 版本历史拖动排序（mousedown 手柄 + 实时重排，参考左侧分类树方案）───
        const draggingVersionId = ref(null);
        let _vd = null; // { id, dragging, startY }
        const _versionRows = () => Array.prototype.slice.call(document.querySelectorAll('.version-item[data-version-id]'));
        const _versionReorder = (d, targetId, after) => {
            const arr = versions.value;
            const di = arr.findIndex(v => v.id === d.id);
            if (di < 0) return;
            const ti = arr.findIndex(v => v.id === targetId);
            if (ti < 0 || ti === di) return;
            const dragged = arr.splice(di, 1)[0];
            const newTi = arr.findIndex(v => v.id === targetId);
            arr.splice(after ? newTi + 1 : newTi, 0, dragged);
        };
        const _onVersionDragMove = (event) => {
            const d = _vd;
            if (!d) return;
            if (!d.dragging) {
                d.dragging = true;
                draggingVersionId.value = d.id;
                document.body.style.userSelect = 'none';
                document.body.style.cursor = 'grabbing';
            }
            event.preventDefault();
            const rows = _versionRows();
            let ref = null;
            for (let i = 0; i < rows.length; i++) {
                const r = rows[i];
                if (r.getAttribute('data-version-id') === d.id) continue;
                const rect = r.getBoundingClientRect();
                if (event.clientY < rect.top + rect.height * 0.5) {
                    ref = { id: r.getAttribute('data-version-id'), after: false };
                    break;
                }
                if (event.clientY < rect.bottom) {
                    ref = { id: r.getAttribute('data-version-id'), after: true };
                }
            }
            if (ref) _versionReorder(d, ref.id, ref.after);
        };
        const _onVersionDragUp = () => {
            const d = _vd;
            if (d && d.dragging) {
                _suppressNextClick();
                data.versionOrder = versions.value.map(v => v.id);
                persistData({ mark: true, silent: true });
                showToast('版本顺序已保存', 'success');
            }
            _vd = null;
            draggingVersionId.value = null;
            document.removeEventListener('mousemove', _onVersionDragMove);
            document.removeEventListener('mouseup', _onVersionDragUp);
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        };
        const startVersionDrag = (event, version) => {
            if (event.button !== undefined && event.button !== 0) return;
            _vd = { id: version.id, dragging: false, startY: event.clientY };
            document.addEventListener('mousemove', _onVersionDragMove);
            document.addEventListener('mouseup', _onVersionDragUp);
        };

        // ─── 站点管理拖动排序（手柄拖动实时重排 + 后端持久化）───
        const draggingProfileId = ref(null);
        let _pd = null; // { id, dragging, startY }
        const _profileRows = () => Array.prototype.slice.call(document.querySelectorAll('.profile-card[data-profile-id]'));
        const _profileReorder = (d, targetId, after) => {
            const arr = profiles.value;
            const di = arr.findIndex(p => p.id === d.id);
            if (di < 0) return;
            const ti = arr.findIndex(p => p.id === targetId);
            if (ti < 0 || ti === di) return;
            const dragged = arr.splice(di, 1)[0];
            const newTi = arr.findIndex(p => p.id === targetId);
            arr.splice(after ? newTi + 1 : newTi, 0, dragged);
        };
        const _onProfileDragMove = (event) => {
            const d = _pd;
            if (!d) return;
            if (!d.dragging) {
                d.dragging = true;
                draggingProfileId.value = d.id;
                document.body.style.userSelect = 'none';
                document.body.style.cursor = 'grabbing';
            }
            event.preventDefault();
            const rows = _profileRows();
            let ref = null;
            for (let i = 0; i < rows.length; i++) {
                const r = rows[i];
                if (r.getAttribute('data-profile-id') === d.id) continue;
                const rect = r.getBoundingClientRect();
                if (event.clientY < rect.top + rect.height * 0.5) {
                    ref = { id: r.getAttribute('data-profile-id'), after: false };
                    break;
                }
                if (event.clientY < rect.bottom) {
                    ref = { id: r.getAttribute('data-profile-id'), after: true };
                }
            }
            if (ref) _profileReorder(d, ref.id, ref.after);
        };
        const _onProfileDragUp = async () => {
            const d = _pd;
            if (d && d.dragging) {
                _suppressNextClick();
                try {
                    await Storage.reorderProfiles(profiles.value.map(p => p.id));
                    await loadProfiles();
                    showToast('站点顺序已保存', 'success');
                } catch (e) {
                    showToast('保存站点顺序失败: ' + (e.message || e), 'error');
                }
            }
            _pd = null;
            draggingProfileId.value = null;
            document.removeEventListener('mousemove', _onProfileDragMove);
            document.removeEventListener('mouseup', _onProfileDragUp);
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        };
        const startProfileDrag = (event, profile) => {
            if (event.button !== undefined && event.button !== 0) return;
            _pd = { id: profile.id, dragging: false, startY: event.clientY };
            document.addEventListener('mousemove', _onProfileDragMove);
            document.addEventListener('mouseup', _onProfileDragUp);
        };

        // ─── 卡片即时拖拽（与分类树同一套丝滑方案：mousedown + 即时实时重排）───
        let _cd = null; // 卡片拖拽运行时状态：{ index, dragging, startY, startX }
        let _cardLastHit = -1; // 防重复：本次拖动中已命中并处理过的卡 index
        const draggingCardIndex = ref(null);

        const _onCardDragMove = (event) => {
            const d = _cd;
            if (!d) return;
            if (!d.dragging) {
                // 灵敏度拉满：无阈值，鼠标一移动即抓住
                d.dragging = true;
                draggingCardIndex.value = d.index;
                document.body.style.userSelect = 'none';
                document.body.style.cursor = 'grabbing';
            }
            event.preventDefault();
            const cards = Array.prototype.slice.call(document.querySelectorAll('.nav-card[data-card-index]'));
            if (!cards.length) return;
            const sub = currentSub.value;
            if (!sub || !sub.sites) return;
            const arr = sub.sites;
            const n = arr.length;
            if (n <= 1) return;
            // 鼠标还在被拖卡自身矩形内 → 不挪，避免仅左右微动就误跳
            const selfEl = document.querySelector(`.nav-card[data-card-index="${d.index}"]`);
            let selfCx = 0, selfCy = 0;
            if (selfEl) {
                const sr = selfEl.getBoundingClientRect();
                selfCx = sr.left + sr.width / 2;
                selfCy = sr.top + sr.height / 2;
                if (event.clientX >= sr.left && event.clientX <= sr.right &&
                    event.clientY >= sr.top && event.clientY <= sr.bottom) {
                    _cardLastHit = -1; return;
                }
            }
            // 落点判断：只在鼠标进入其他卡片时才挪动，同一张卡不重复触发。
            // 用相对于被拖卡当前位置的方向决定前/后（折返也能及时响应）。
            const moveX = event.clientX - selfCx;
            const moveY = event.clientY - selfCy;
            const verticalDominant = Math.abs(moveY) >= Math.abs(moveX);
            const before = verticalDominant ? (moveY < 0) : (moveX < 0);
            // 收集网格包围盒（用于超界检测）+ 命中检测
            let gridL = Infinity, gridR = -Infinity, gridT = Infinity, gridB = -Infinity;
            for (const r of cards) {
                const rc = r.getBoundingClientRect();
                if (rc.left < gridL) gridL = rc.left;
                if (rc.right > gridR) gridR = rc.right;
                if (rc.top < gridT) gridT = rc.top;
                if (rc.bottom > gridB) gridB = rc.bottom;
                const ri = +r.getAttribute('data-card-index');
                if (ri === d.index || ri === _cardLastHit) continue;
                if (event.clientX >= rc.left && event.clientX <= rc.right &&
                    event.clientY >= rc.top && event.clientY <= rc.bottom) {
                    _cardLastHit = ri;
                    let bi = ri;
                    if (bi > d.index) bi -= 1;
                    let ins = before ? bi : bi + 1;
                    if (ins < 0) ins = 0;
                    if (ins > n - 1) ins = n - 1;
                    if (ins === d.index) return;
                    const dragged = arr.splice(d.index, 1)[0];
                    if (ins > arr.length) ins = arr.length;
                    arr.splice(ins, 0, dragged);
                    d.index = ins;
                    draggingCardIndex.value = ins;
                    return;
                }
            }
            // 超出网格区域 → 松手，停在当前位置
            if (event.clientX < gridL || event.clientX > gridR ||
                event.clientY < gridT || event.clientY > gridB) {
                _onCardDragUp(); return;
            }
            _cardLastHit = -1; // 缝隙/空白 → 离开卡复位
        };

        const _onCardDragUp = () => {
            const d = _cd;
            if (d && d.dragging) { persistData({ mark: true, silent: true }); _suppressNextClick(); }
            _cd = null; _cardLastHit = -1;
            draggingCardIndex.value = null;
            document.removeEventListener('pointermove', _onCardDragMove);
            document.removeEventListener('pointerup', _onCardDragUp);
            document.removeEventListener('pointercancel', _onCardDragUp);
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        };

        const _startCardDrag = (index, event) => {
            if (event.button !== undefined && event.button !== 0) return;
            _cd = { index: index, dragging: false, startY: event.clientY, startX: event.clientX }; _cardLastHit = -1;
            document.addEventListener('pointermove', _onCardDragMove);
            document.addEventListener('pointerup', _onCardDragUp);
            document.addEventListener('pointercancel', _onCardDragUp);
        };

        const onCardPointerDown = (event, index) => {
            event.stopPropagation();
            _startCardDrag(index, event);
        };

        const onLogoUploadForSite = (event) => {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = e => {
                editForm.site.logo = e.target.result;
            };
            reader.readAsDataURL(file);
            event.target.value = '';
        };

        // 辅助：判断字符串是否是 http(s) URL（用于模板中判断 logo 类型）
        // 注意：Vue 模板里不能直接写正则字面量，所以这里包成函数
        const isHttpUrl = (s) => typeof s === 'string' && /^https?:\/\//i.test(s);
        const isSvgText = (s) => typeof s === 'string' && (s.trim().startsWith('<svg') || s.trim().startsWith('<?xml'));
        const isDataUrl = (s) => typeof s === 'string' && s.startsWith('data:');

        return {
            data, loaded, hasData, selectedCategoryId, selectedSubId, treeSearchQuery,
            kbActive, kbBtn, kbFocusKey,
            expandedCatIds, isCatExpanded, toggleCatExpand,
            modal, editForm, toasts, faIcons: FA_ICONS,
            filteredCategories, currentCategory, currentSub, totalSites, treeStats, aboutPreviewParagraphs, adPreviewHtml,
            adBlinkStyle, adRailWidth, adSlotStyle, adImgSrc,
            versions, syncSteps, syncResult, hasSyncError, syncErrorMessage, syncDetail, syncRemaining, syncLogs, syncConsoleBodyEl, copySyncLogs, cfAccounts, activeAccountId,
            accountFilter, filteredAccounts, draggingAccountId, dragOverAccountId,
            editingSidebarTitle, tempSidebarTitle,
            showToast, importFromHtml, tryAutoImport, exportData, importData,
            generateAndDownload, selectCategory, onMainClick, onCatToggleClick, addCategory, editCategory,
            saveCategory, deleteCategory, addSubCategory, saveSubCategory, editSubCategory,
            deleteSubCategory, addSite, editSite, saveSite, deleteSite,
            saveBlinkTemplate, applyBlinkTemplate, deleteBlinkTemplate, applyBlinkPreset,
            onLogoUpload, openSiteConfig, saveSiteConfig, openSidebarTop, saveSidebarTop, openSidebarIconEditor, sidebarBgSource, onSidebarBgFileChange, previewSidebarBgStyle, previewSidebarBgCollapsedStyle,             openSidebarBgCropper, clearSidebarBgImage, openSidebarBgCollapsedCropper, clearSidebarBgCollapsedImage, restoreDefaultSidebarBgSize, onSidebarBgWidthInput, openHeaderConfig, saveHeaderConfig, openIconPickerForSearchTab,
            icpPreviewDims,
            startEditSidebarTitle, confirmSidebarTitle, cancelSidebarTitle,
            openFriendLinks,
            openMenuKeys, addMenuKey, editMenuKey, saveMenuKey, deleteMenuKey, moveMenuKey,
            saveFriendLinks, addFriendLink, removeFriendLink,
            openIconPicker, selectIcon, saveVersion, saveToCurrentVersion, requestSave, confirmNoVersionCreate, pendingSaveAction, openVersions, currentVersionNote, currentEditingVersionId, selectCurrentVersion, error404Templates, error404LoadError, isError404Selected, toggleError404Template, addError404Rule, removeError404Rule, loadError404Templates,
            showSaveAsModal, saveAsNote, openSaveAsDialog, confirmSaveAs, confirmSaveAsFolder, exportDeploymentZip, exportModifiedFilesZip, exportCurrentSnapshot, setCurrentAsTemplate,
            exportMenuOpen, toggleExportMenu, closeExportMenu, exportBtnEl, exportMenuStyle,
            exportSettingsOpen, openExportSettings, closeExportSettings,
            exportFilePanel, toggleExportFilePanel, resetExportSettings,
            publishMenuOpen, togglePublishMenu, closePublishMenu, publishBtnEl, publishMenuStyle,
            publishMainLabel, onPublishMainClick, openPublishSettings, closePublishSettings, resetPublishSettings,
            quickPublish,
            publishConfirmText, confirmPublish, cancelPublish, confirmPublishSave, cancelPublishSave,
            confirmShardPublish,
            rollbackVersion, deleteVersion, exportVersion, importVersionFile, previewVersion, openVersionLocation,
            importExcelVersion, exportVersionExcel,
            importBookmarksGenerator, openBookmarkMapper, closeBookmarkMapper, bookmarkMapper, bmChoiceMode, bmDeepMode,
            toggleBookmarkNode, clickBookmarkNode, visibleBookmarkFlat, openBookmarkCtx, closeBookmarkCtx, bookmarkCtxShowSplit,
            bookmarkCtxShowPrimary, bookmarkCtxShowSecondary, isBookmarkSplitable, isBookmarkPrimaryReady, isBookmarkSecondaryReady,
            bookmarkLeftStats, bookmarkRightStats,
            bookmarkToPrimary, bookmarkToSecondary, bookmarkSplitLevels, bookmarkSplitApply,
            bookmarkChoiceDiscard, bookmarkChoiceMerge, removeBookmarkRight, removeBookmarkSub, toggleRightCat, toggleRightSub, removeBookmarkSite, generateBookmarkMapperExcel,
            versionUploadRecords,
            shareModulesList: SHARE_MODULES, shareDraft, shareVersion, confirmShare, confirmImport,
            exportAllSitesPackage, importAllSitesPackage,
            startVersionDrag, draggingVersionId,
            versionSyncState, openVersionSyncInfo, syncVersion, syncAccountDisplayName, syncAccountState,
            askConfirm, closeConfirmDialog, runConfirmAction, confirmDialog,
            defaultTemplates, currentDefaultTemplate, openTemplateSettings, loadDefaultTemplates,
            selectDefaultTemplate, deleteDefaultTemplate, chooseOtherTemplate, createVersionFromTemplate,
            openVisitorView, openSettings, passwordDirInfo, passwordDirInput, passwordDirEditing,
            startEditPasswordDir, cancelEditPasswordDir, savePasswordDirInput, browsePasswordDir,
            dataDirInfo, dataDirInput, dataDirEditing,
            startEditDataDir, cancelEditDataDir, saveDataDirInput, browseDataDir,
            openSearchConfig, addSearchTab, removeSearchTab, addSearchEngine, removeSearchEngine,
            openBgConfig, applyBgPreset, applyFirstBgPreset, clearBgPreset, allWallpapers, bgPresetGroups, resolvePreviewUrl, migrateUrl, openDailyTextConfig,
            openWallpaperLibrary, onWallpaperFileChange, addCustomWallpaper, deleteCustomWallpaper,
            reorderWallpaper, onWallpaperDragStart, onWallpaperDragOver, onWallpaperDrop, onWallpaperDragEnd, wpLib,
            footerMenuButtons, onFooterBtnClick, footerDraggingKey, onFooterMousedown,
            openAddFooterMenu, saveFooterMenu, removeFooterItem, footerMenuForm,
            openEditFooterMenu, saveEditFooterMenu, openIconPickerForFooterMenu, footerEditForm,
            friendLinkSettings, openIconPickerForFriendLink, onFlDragStart, onFlDragOver, onFlDrop, onFlDragEnd, flDragOverIndex,
            pickFooterFile,
            pickTemplateFile,
            addWallpaperGroup, deleteWallpaperGroup, deleteCurrentWallpaperGroup, openWallpaperFolder, pickAboutHtml, reorderGroup,
            onGroupDragStart, onGroupDragOver, onGroupDrop, onGroupDragEnd, onGroupDropOnPos, isBuiltinGroup,
            groupsForPos, wpPos, setWpPos, setWallpaperPosRatio, openWallpaperCropper,
            openAdSlotsConfig, applyAdBlinkPreset, applyAdBlinkTemplate, saveAdBlinkTemplate, adAllowedSpans, openAdImageCropper,
            openSeoConfig, saveSeoConfig, pickSeoOgImage, resolveSeoImage, addSeoRobotsRule, removeSeoRobotsRule,
            openAbout, saveAbout, openAboutInTab, openCommit, saveCommit,
            availableTemplates, footerAvailableTemplates, onAboutTemplateChange,
            aboutAdAdd, aboutAdRemove, aboutAdUpload, aboutAdPreview,
            aboutSkillAdd, aboutSkillRemove, aboutContactAdd, aboutContactRemove,
            openLogoCropper, openSiteLogoCropper, openSiteLogoCropperStyle, openHeaderLogoCropper, openBrowserTagFaviconEditor, openExpandedLogoEditor, openCollapsedLogoEditor, openCategoryIconCropper, closeLogoCropper, removeAdSlotImage, removeSidebarBgImage, onCropperFileChange, triggerCropperUpload,
            openSearchEngineIconEditor,
            initVpCropBox, onVpCropPointerDown, onVpCropPointerMove, onVpCropPointerUp, deferredInitVpCrop,
            setAspectRatio, toggleRatioLock, updateCropPreview, onAdOutputSizeChange, setCropperShape,
        adSlotFit, setAdSlotFit, currentAdSlot, currentAdSlotBlink, adSlotOutputBlinkClass, applyCurrentAdBlinkPreset,
            adSlotBackgrounds, currentAdSlotBackground, currentAdSlotBackgroundCss, setAdSlotBackground,
            adSlotBgPicker, adSlotBgSvCanvas, adSlotBgHueCanvas, adSlotBgPopover,
            drawAdSlotBgSV, drawAdSlotBgHue, syncAdSlotBgHsvFromRgb, syncAdSlotBgFromHsl, syncAdSlotBgFromHex,
            onAdSlotBgSVPointerDown, onAdSlotBgSVPointerMove, onAdSlotBgSVPointerUp,
            onAdSlotBgHuePointerDown, onAdSlotBgHuePointerMove, onAdSlotBgHuePointerUp,
            useAdSlotBgEyeDropper,
            openCustomColorModal,
            openIconSettings, closeIconEditor, onIconEditorFileChange, deleteIconEditorImage, autoFillSiteFavicon, fetchIconsForEditor, selectFetchedIcon,
            onIePointerDown, onIePointerMove, onIePointerUp, onIeWheel, applyIconEditor, openIconBgColorPicker, isCustomIconBg, onIconOpacityWheel, onRotationWheel,
            isImageIcon,
            onCropBoxPointerDown, onCropHandlePointerDown,
            onCropPointerDown, onCropPointerMove, onCropPointerUp,
            applyLogoCrop, applyStyleSave, switchCropperMode,
            cropZoomIn, cropZoomOut, cropZoomReset, onCropWheel,
            onCropCanvasPointerDown, onCropCanvasPointerMove, onCropCanvasPointerUp,
            onCirclePointerDown, onCirclePointerMove, onCirclePointerUp,
            onViewportPointerMove, onViewportPointerUp, onHeaderLogoHandleDown,
            zoomHeaderLogoBtn, onHLogoZoomInput, rotateHeaderLogo, getHLogoBgStyle, onHeaderLogoBoxDown,
            colorPicker, svCanvas, hueCanvas, alphaCanvas, openColorPicker, closeColorPicker, confirmColorPicker, openSearchColorPicker,
            onSVPointerDown, onSVPointerMove, onSVPointerUp, onHuePointerDown, onHuePointerMove, onHuePointerUp,
            onAlphaPointerDown, onAlphaPointerMove, onAlphaPointerUp, drawAlpha, recomposeColor, clampVal, parseToRgba,
            useEyeDropper,
            hexToRgb,
        circleZoomIn, circleZoomOut, circleZoomReset, onCircleWheel, onImageCropperRotationWheel, onImageCropperOpacityWheel,
        onIconEditorBgOpacityWheel, onImageCropperBgOpacityWheel,
            unsavedSaveAndRefresh, unsavedDirectRefresh, unsavedCancel, dirty,
            addAccount, editAccount, saveAccount, deleteAccount, selectAccount,
            checkOne, checkAll, connectivityStatus, openAccountProject,
            onAccountDragStart, onAccountDragOver, onAccountDrop, onAccountDragEnd,
            toggleStarVersion, startRenameVersion, confirmRenameVersion, cancelRenameVersion, renamingVersion, renameNote, editVersionInEditor,
            profiles, currentProfileId, currentProfileName, openProfilesManager,
            createProfile, createProfileFromInput, switchProfile, deleteProfile, duplicateProfile, renameProfile, exportProfile,
            startProfileDrag, draggingProfileId,
            startRenameProfile, confirmRenameProfile, cancelRenameProfile, renamingProfileId, renameProfileName,
            syncToCloudflare, publishVersion, activeAccountName, onCardPointerDown, onTreeHandleDown, onSubHandleDown, draggingTreeKey, dropPreview, draggingCardIndex,
            onLogoUploadForSite,
            isHttpUrl, isSvgText, isDataUrl,
            Utils
        };
    },

    template: TEMPLATE,
};

const __navApp = createApp(App);
__navApp.directive('focus', {
    mounted(el) { el.focus(); }
});
__navApp.mount('#app');
