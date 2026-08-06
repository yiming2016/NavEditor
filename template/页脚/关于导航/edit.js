(function () {
    'use strict';
    var editMode = location.search.indexOf('edit=1') !== -1;

    var SKEY = 'nav_editor_work';
    // ─── 共享模板库 ───
    var TPL_KEY = 'nav_template_library';
    var _tplLib = null;
    function loadTpl() { if (!_tplLib) { try { var r = localStorage.getItem(TPL_KEY); _tplLib = r ? JSON.parse(r) : {}; } catch (_) { _tplLib = {}; } } return _tplLib; }
    function saveTpl() { try { localStorage.setItem(TPL_KEY, JSON.stringify(_tplLib)); } catch (_) {} }
    function tplVersions(type) { var l = loadTpl(); return (l[type] && l[type].versions) || []; }
    function tplActive(type) { var l = loadTpl(); if (!l[type] || !l[type].active) return null; var vs = l[type].versions; for (var i = 0; i < vs.length; i++) if (vs[i].id === l[type].active) return vs[i]; return null; }
    function tplFindVer(sec) { var vs = tplVersions(sec.type); for (var i = 0; i < vs.length; i++) if (vs[i].srcId === sec.id) return vs[i]; return null; }
    var ALL_LABELS = { success: '成功提示', guidelines: '须知列表', text: '文本段落', categories: '分类选项', form: '表单区域', skills: '技能卡片', contacts: '联系方式' };
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
            // 兜底：把预设方案名作为可选分类
            var presets = ['标准提交表单', '技能展示区', '富文本段落', '联系我们', '数据看板', '操作向导'];
            cats = presets.map(function (n, i) { return { id: '_preset_' + i, name: n }; });
        }
        return cats;
    }
    function comboItems(catId) { var d = loadCombo(); var f = null; (d.categories || []).forEach(function (c) { if (c.id === catId) f = c; }); return f ? (f.items || []) : []; }
    function comboFindItem(catId, itemId) { var its = comboItems(catId); for (var ji = 0; ji < its.length; ji++) if (its[ji].id === itemId) return its[ji]; return null; }
    var root, about, toastEl, sectionsEl, __adEditing, hasUnsaved = false;
    var uid = 0;
    function nid() { return 's' + Date.now().toString(36) + (uid++); }

    function loadData() {
        try { var raw = localStorage.getItem(SKEY); if (raw) { var p = JSON.parse(raw); if (p && p.about) return p; } } catch (e) {}
        var seed = document.getElementById('aboutSeed');
        if (seed) { try { return JSON.parse(seed.textContent.split('<\/').join('</')); } catch (e) {} }
        return null;
    }

    function $(sel, el) { return (el || document).querySelector(sel); }
    function $all(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function escAttr(s) { return esc(s); }
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
    function normLink(u) { if (!u) return u; if (/^(https?:|mailto:|tel:|#|\/)/.test(u)) return u; return '//' + u; }
    function textToHtml(t) { return (t || '').split(/\n{2,}/).map(function (p) { return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>'; }).join(''); }

    // ===== 站点/版本信息栏（类主编辑器顶部栏）=====
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
        var d = document.getElementById('abSvDropdown');
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
            dd.id = 'abSvDropdown';
            dd.className = 'ab-sv-dropdown';
            dd.innerHTML = sites.map(function (s) {
                return '<div class="ab-sv-item' + (s.id === info.siteId ? ' on' : '') + '" data-site="' + escAttr(s.id) + '">'
                    + '<i class="fas fa-globe" style="margin-right:6px;opacity:.6"></i>' + esc(s.name || s.id) + '</div>';
            }).join('') || '<div class="ab-sv-item" style="color:#999">无站点</div>';
            document.body.appendChild(dd);
            positionSvDropdown(dd, document.getElementById('abSvSite'));
            $all('.ab-sv-item[data-site]', dd).forEach(function (item) {
                item.onclick = function (e) {
                    e.stopPropagation();
                    var siteId = item.getAttribute('data-site');
                    if (siteId === info.siteId) { closeSvDropdown(); return; }
                    apiGet('/api/storage/versions?site=' + encodeURIComponent(siteId)).then(function (r) {
                        var vs = (r.versions || []).slice().sort(function (a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });
                        var vid = vs[0] ? vs[0].id : info.versionId;
                        var newPath = buildNewPath(info, siteId, vid);
                        if (newPath) navWithConfirm(newPath);
                        else toast('无法构造目标路径');
                        closeSvDropdown();
                    }).catch(function () { toast('加载目标站点版本失败'); });
                };
            });
            setTimeout(function () { document.addEventListener('click', closeSvDropdown, { once: true }); }, 0);
        }).catch(function () { toast('加载站点列表失败'); });
    }
    function openVersionDropdown(info, versions) {
        closeSvDropdown();
        var dd = document.createElement('div');
        dd.id = 'abSvDropdown';
        dd.className = 'ab-sv-dropdown';
        dd.innerHTML = versions.map(function (v) {
            return '<div class="ab-sv-item' + (v.id === info.versionId ? ' on' : '') + '" data-version="' + escAttr(v.id) + '">'
                + esc(formatVersionNote(v)) + '</div>';
        }).join('') || '<div class="ab-sv-item" style="color:#999">无版本</div>';
        document.body.appendChild(dd);
        positionSvDropdown(dd, document.getElementById('abSvVersion'));
        $all('.ab-sv-item[data-version]', dd).forEach(function (item) {
            item.onclick = function (e) {
                e.stopPropagation();
                var vid = item.getAttribute('data-version');
                if (vid === info.versionId) { closeSvDropdown(); return; }
                var newPath = buildNewPath(info, info.siteId, vid);
                if (newPath) navWithConfirm(newPath);
                else toast('无法构造目标路径');
                closeSvDropdown();
            };
        });
        setTimeout(function () { document.addEventListener('click', closeSvDropdown, { once: true }); }, 0);
    }
    function renderSiteVersionBar() {
        var info = parsePathInfo(defaultPath);
        var wrap = document.getElementById('abSiteVersionBar');
        siteVersionInfo = null;
        if (!wrap) return;
        if (!info) { wrap.style.display = 'none'; return; }
        wrap.style.display = 'inline-flex';
        wrap.innerHTML = '<span class="ab-sv-site" id="abSvSite">加载中…</span>'
            + '<span class="ab-sv-sep">/</span>'
            + '<span class="ab-sv-version" id="abSvVersion">…</span>';
        siteVersionInfo = { siteId: info.siteId, versionId: info.versionId, fileName: info.fileName, rawPath: info.raw };

        apiGet('/api/storage/site-setting?site=' + encodeURIComponent(info.siteId))
            .then(function (res) {
                var siteName = (res.setting && res.setting.name) || info.siteId;
                if (siteVersionInfo && siteVersionInfo.siteId === info.siteId) siteVersionInfo.siteName = siteName;
                var el = document.getElementById('abSvSite');
                if (el) { el.textContent = siteName; el.title = '当前站点：' + siteName + '（点击切换站点）'; el.onclick = function () { openSiteDropdown(info); }; }
            })
            .catch(function () {
                if (siteVersionInfo && siteVersionInfo.siteId === info.siteId) siteVersionInfo.siteName = info.siteId;
                var el = document.getElementById('abSvSite');
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
                var el = document.getElementById('abSvVersion');
                if (el) {
                    el.innerHTML = esc(versionName)
                        + (versions.length > 0 ? '<span class="ab-sv-badge">' + versions.length + '</span>' : '');
                    el.title = '当前版本' + (versions.length ? '，点击切换历史版本' : '');
                    el.onclick = function () { openVersionDropdown(info, versions); };
                }
            })
            .catch(function () {
                if (siteVersionInfo && siteVersionInfo.siteId === info.siteId && siteVersionInfo.versionId === info.versionId) {
                    siteVersionInfo.versionName = info.versionId;
                    siteVersionInfo.versionsCount = 0;
                }
                var el = document.getElementById('abSvVersion');
                if (el) { el.textContent = info.versionId; el.title = info.versionId; }
            });
    }
    function findSec(id) { for (var i = 0; i < about.sections.length; i++) if (about.sections[i].id === id) return about.sections[i]; return null; }

    // ===== 图标库 =====
    var ICONS = [
        'fas fa-user', 'fas fa-id-card', 'fas fa-user-circle', 'fas fa-user-tie', 'fas fa-users',
        'fas fa-code', 'fas fa-laptop-code', 'fas fa-terminal', 'fas fa-microchip', 'fas fa-database',
        'fas fa-heart', 'fas fa-heartbeat', 'fas fa-star', 'fas fa-award', 'fas fa-trophy', 'fas fa-medal',
        'fas fa-envelope', 'fas fa-envelope-open-text', 'fas fa-at', 'fas fa-paper-plane', 'fas fa-globe',
        'fas fa-link', 'fas fa-share-alt', 'fas fa-comments', 'fas fa-comment-dots', 'fas fa-thumbs-up',
        'fas fa-book', 'fas fa-book-open', 'fas fa-lightbulb', 'fas fa-pencil-alt', 'fas fa-edit',
        'fas fa-briefcase', 'fas fa-building', 'fas fa-graduation-cap', 'fas fa-school', 'fas fa-certificate',
        'fas fa-cog', 'fas fa-tools', 'fas fa-wrench', 'fas fa-rocket', 'fas fa-cloud',
        'fas fa-paint-brush', 'fas fa-palette', 'fas fa-camera', 'fas fa-image', 'fas fa-mobile-alt',
        'fas fa-shield-alt', 'fas fa-lock', 'fas fa-home', 'fas fa-info-circle', 'fas fa-smile',
        'fas fa-coffee', 'fas fa-chart-line', 'fas fa-chart-bar', 'fas fa-folder', 'fas fa-folder-open',
        'fab fa-github', 'fab fa-java', 'fab fa-python', 'fab fa-js', 'fab fa-html5', 'fab fa-css3-alt',
        'fab fa-linux', 'fab fa-apple', 'fab fa-windows', 'fab fa-android', 'fab fa-weixin', 'fab fa-qq',
        'fab fa-weibo', 'fab fa-twitter', 'fab fa-facebook', 'fab fa-youtube', 'fab fa-linkedin'
    ];

    // ===== 图标选择器（键盘 + ESC 关闭，点空白不关） =====
    function openIconPicker(current, cb) {
        var ov = document.createElement('div');
        ov.className = 'ab-modal-ov';
        ov.innerHTML = '<div class="ab-picker">'
            + '<div class="ab-modal-h">选择图标<a class="ab-modal-x" data-close>&times;</a></div>'
            + '<div class="ab-picker-grid">' + ICONS.map(function (ic) {
                return '<span class="ab-ic' + (ic === current ? ' on' : '') + '" data-ic="' + ic + '"><i class="' + ic + '"></i></span>';
            }).join('') + '</div></div>';
        document.body.appendChild(ov);
        var items = $all('.ab-ic', ov);
        var cols = 8;
        var idx = ICONS.indexOf(current);
        if (idx < 0) idx = 0;
        function highlight(n) { items[idx].classList.remove('on'); idx = n; items[idx].classList.add('on'); items[idx].scrollIntoView({ block: 'nearest' }); }
        ov.addEventListener('click', function (e) {
            if (e.target.hasAttribute('data-close')) { document.body.removeChild(ov); document.removeEventListener('keydown', onKey); }
            var icEl = e.target.closest('.ab-ic');
            if (icEl) { cb(icEl.getAttribute('data-ic')); document.body.removeChild(ov); document.removeEventListener('keydown', onKey); }
        });
        function onKey(e) {
            var total = ICONS.length;
            var row = Math.floor(idx / cols), col = idx % cols;
            var next = idx;
            if (e.key === 'ArrowUp') next = idx - cols;
            else if (e.key === 'ArrowDown') next = idx + cols;
            else if (e.key === 'ArrowLeft') next = idx - 1;
            else if (e.key === 'ArrowRight') next = idx + 1;
            else if (e.key === 'Enter') { e.preventDefault(); cb(ICONS[idx]); document.body.removeChild(ov); document.removeEventListener('keydown', onKey); return; }
            else if (e.key === 'Escape') { document.body.removeChild(ov); document.removeEventListener('keydown', onKey); return; }
            else return;
            e.preventDefault();
            if (next >= 0 && next < total) highlight(next);
        }
        document.addEventListener('keydown', onKey);
    }

    // ===== 广告渲染 =====
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
        // 代码型广告（Google/百度/腾讯等）
        if (ad.type && ad.type !== 'custom' && ad.type !== 'html') {
            if (ad.code) return '<div class="ad-banner" style="overflow:hidden">' + ad.code + '</div>';
            var n = adTypeLabel(ad.type);
            return '<div class="ad-banner" style="padding:16px;text-align:center;color:#888;font-size:12px">' + n + ' 广告位<br><small>请在广告管理中填入代码</small></div>';
        }
        // 自定义HTML
        if (ad.type === 'html') return ad.code ? '<div class="ad-banner" style="overflow:hidden">' + ad.code + '</div>' : '<div class="ad-banner" style="padding:16px;text-align:center;color:#888;font-size:12px">自定义HTML<br><small>请在广告管理中填入代码</small></div>';
        // 自定义图片
        if (!ad.image && !ad.value) return '';
        var src = ad.image || ad.value || '';
        var img = '<img src="' + escAttr(src) + '" alt="' + escAttr(ad.alt || '') + '" style="width:100%;display:block">';
        if (ad.width) img = '<img src="' + escAttr(src) + '" alt="' + escAttr(ad.alt || '') + '" width="' + ad.width + '" height="' + (ad.height || 'auto') + '" style="display:block;max-width:100%">';
        var inner = ad.link ? '<a href="' + escAttr(normLink(ad.link)) + '" target="_blank" rel="nofollow" style="display:block">' + img + '</a>' : img;
        return '<div class="ad-banner">' + inner + (ad.alt ? '<div style="padding:4px 8px;font-size:11px;color:#999;text-align:center">' + esc(ad.alt) + '</div>' : '') + '</div>';
    }
    function renderAds(side) {
        var el = document.getElementById(side === 'left' ? 'aboutLeftAds' : (side === 'right' ? 'aboutRightAds' : 'aboutTopAds'));
        if (!el) return;
        var list = side === 'left' ? about.leftAds : (side === 'right' ? about.rightAds : about.topAds);
        el.innerHTML = list.map(function(a, i) { return renderAd(a); }).join('');
        el.style.display = list.filter(function(a) { return a.enabled; }).length === 0 ? 'none' : '';
    }
    function ensureAdContainers() {
        if (!editMode) return;
        ['aboutLeftAds','aboutRightAds','aboutTopAds'].forEach(function(id) {
            if (document.getElementById(id)) return;
            var div = document.createElement('div');
            div.id = id;
            if (id === 'aboutTopAds') { div.className = 'ad-top-bar'; document.body.insertBefore(div, document.body.firstChild); }
            else { div.className = 'ad-sidebar ' + (id === 'aboutLeftAds' ? 'left' : 'right'); document.body.appendChild(div); }
        });
    }
    function renderAllAds() { renderAds('top'); renderAds('left'); renderAds('right'); }

    // ===== 广告管理弹窗 =====
    function openAdManager() {
        about.leftAds = about.leftAds || [];
        about.rightAds = about.rightAds || [];
        about.topAds = about.topAds || [];
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
    function adsByPosition(pos) { return pos === 'top' ? about.topAds : (pos === 'right' ? about.rightAds : about.leftAds); }
    function adFormHtml(pos, ad, isNew) {
        var typeOptions = '<option value="google">Google AdSense</option><option value="baidu">百度联盟</option><option value="alimama">阿里妈妈</option><option value="tencent">腾讯广告</option><option value="sogou">搜狗联盟</option><option value="qihoo">360联盟</option><option value="amazon">Amazon</option><option value="custom">自定义图片</option><option value="html">自定义HTML</option>';
        var t = ad.type || 'custom';
        typeOptions = typeOptions.replace('value="' + t + '"', 'value="' + t + '" selected');
        var needCode = ['google','baidu','alimama','tencent','sogou','qihoo','amazon','html'].indexOf(t) >= 0;
        var needImg = t === 'custom';
        var hint = adTypeHint(t).replace(/。/g, '。').substring(0, 120);
        return '<div class="ad-inline-form" data-ad-pos="' + pos + '">'
            + '<div class="ad-inline-hd">' + (isNew ? '新增广告' : '编辑广告') + '<span class="ad-inline-close" data-ad-cancel="' + pos + '">&times;</span></div>'
            + '<div class="ad-inline-bd">'
            + '<div class="ad-col2"><div class="ad-field-row"><label>名称</label><input class="ad-f-name" value="' + escAttr(ad.name || '') + '" placeholder="如：Google横幅"></div>'
            + '<div class="ad-field-row"><label>类型</label><select class="ad-f-type">' + typeOptions + '</select></div></div>'
            + '<div class="ad-type-hint">' + hint + '</div>'
            + (needCode ? '<div class="ad-field-row" style="align-items:flex-start"><label>代码</label><textarea class="ad-f-code" style="height:60px;resize:vertical" placeholder="粘贴广告代码...">' + esc(ad.code || '') + '</textarea></div>' : '')
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
                + '<span class="ad-zone-name"><b style="color:#333;font-size:15px">' + (i + 1) + '.</b> ' + esc(ad.name || '') + ' <span class="ad-zone-type">' + adTypeLabel(ad.type || 'custom') + '</span>' + (ad.type === 'custom' ? ' <span class="ad-zone-src">' + (ad.imgMode === 'url' ? '网络图片' : '本地图片') + '</span>' : '') + '</span>'
                + '<span class="ad-tag" style="background:' + (ad.enabled !== false ? '#2ecc71' : '#e74c3c') + ';color:#fff;padding:3px 10px;border-radius:3px;font-size:12px;cursor:pointer;user-select:none">' + (ad.enabled !== false ? '开' : '关') + '</span>'
                + '<span class="ad-zone-move" data-move="up">&uarr;</span>'
                + '<span class="ad-zone-move" data-move="down">&darr;</span>'
                + '</div>';
            if (editingIdx === i) html += adFormHtml(pos, ads[editingIdx], false);
        });
        if (editingIdx === -2) html += adFormHtml(pos, { name: '', type: 'custom', enabled: true, image: '', imgMode: 'file', alt: '', width: 0, height: 0, code: '' }, true);
        zoneEl.innerHTML = html;
        // tag toggle
        zoneEl.querySelectorAll('.ad-tag').forEach(function(tag, i) {
            tag.addEventListener('click', function(e) {
                e.stopPropagation();
                var ad = ads[i];
                if (ad) { ad.enabled = ad.enabled === false ? true : false; renderAdZone(pos); renderAllAds(); }
            });
        });
        // item click → edit
        zoneEl.querySelectorAll('.ad-zone-item').forEach(function(item) {
            item.addEventListener('click', function(e) {
                if (e.target.classList.contains('ad-zone-move')) { moveAd(pos, parseInt(item.dataset.adI), e.target.getAttribute('data-move')); return; }
                if (e.target.classList.contains('ad-tag')) return;
                var idx = parseInt(item.dataset.adI);
                __adEditing[pos] = __adEditing[pos] === idx ? -1 : idx;
                renderAdZone(pos);
            });
        });
        // drag to reorder
        var dragIdx = -1;
        zoneEl.querySelectorAll('.ad-zone-item').forEach(function(item) {
            item.addEventListener('mousedown', function() { item.classList.add('pressed'); });
            item.addEventListener('mouseup', function() { item.classList.remove('pressed'); });
            item.addEventListener('mouseleave', function() { item.classList.remove('pressed'); });
            item.addEventListener('dragstart', function(e) {
                dragIdx = parseInt(item.dataset.adI);
                item.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });
            item.addEventListener('dragend', function() { item.classList.remove('dragging'); });
            item.addEventListener('dragover', function(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; item.classList.add('drag-over'); });
            item.addEventListener('dragleave', function() { item.classList.remove('drag-over'); });
            item.addEventListener('drop', function(e) {
                e.preventDefault();
                item.classList.remove('drag-over');
                var dropIdx = parseInt(item.dataset.adI);
                if (dragIdx >= 0 && dropIdx >= 0 && dragIdx !== dropIdx) {
                    var ads = adsByPosition(pos);
                    var moved = ads.splice(dragIdx, 1)[0];
                    // 向下拖时，原项移除后目标索引前移了一位，需-1对齐蓝线
                    var insertAt = dragIdx < dropIdx ? dropIdx - 1 : dropIdx;
                    ads.splice(insertAt, 0, moved);
                    if (__adEditing[pos] >= 0) __adEditing[pos] = insertAt;
                    renderAdZone(pos);
                    renderAllAds();
                }
                dragIdx = -1;
            });
        });
        // cancel
        zoneEl.querySelectorAll('[data-ad-cancel]').forEach(function(btn) {
            btn.addEventListener('click', function(e) { e.stopPropagation(); __adEditing[pos] = -1; renderAdZone(pos); });
        });
        // save
        zoneEl.querySelectorAll('[data-ad-save]').forEach(function(btn) {
            btn.addEventListener('click', function(e) { e.stopPropagation(); saveAdForm(pos); });
        });
        // delete
        zoneEl.querySelectorAll('[data-ad-del]').forEach(function(btn) {
            btn.addEventListener('click', function(e) { e.stopPropagation(); deleteAdForm(pos); });
        });
        // type change: re-render form
        var typeSel = zoneEl.querySelector('.ad-f-type');
        if (typeSel) {
            typeSel.addEventListener('change', function() {
                var ad = editingIdx >= 0 ? ads[editingIdx] : (editingIdx === -2 ? ads[ads.length] : null);
                if (!ad) { ad = { name: '', type: 'custom', enabled: true, image: '', link: '', alt: '', width: 0, height: 0, code: '' }; ads.push(ad); }
                // read all form values before re-render
                var nameEl = zoneEl.querySelector('.ad-f-name');
                var codeEl = zoneEl.querySelector('.ad-f-code');
                var imgEl = zoneEl.querySelector('.ad-f-image');
                var wEl = zoneEl.querySelector('.ad-f-w');
                var hEl = zoneEl.querySelector('.ad-f-h');
                var altEl = zoneEl.querySelector('.ad-f-alt');
                ad.name = nameEl ? nameEl.value : '';
                ad.type = typeSel.value;
                ad.code = codeEl ? codeEl.value : '';
                ad.image = imgEl ? imgEl.value : '';
                ad.imgMode = ad.imgMode || 'file';
                ad.width = parseInt((wEl ? wEl.value : '') || '0') || 0;
                ad.height = parseInt((hEl ? hEl.value : '') || '0') || 0;
                ad.alt = altEl ? altEl.value : '';
                renderAdZone(pos);
            });
        }
        // upload image
        zoneEl.querySelectorAll('.ad-f-upimg').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var inp = document.createElement('input');
                inp.type = 'file';
                inp.accept = 'image/*';
                inp.onchange = function() {
                    var f = inp.files && inp.files[0];
                    if (!f) return;
                    var imgEl = zoneEl.querySelector('.ad-f-image');
                    if (imgEl) imgEl.value = 'assets/ads/' + f.name;
                    toast('图片已选，路径: assets/ads/' + f.name);
                };
                inp.click();
            });
        });
        // image mode toggle: local vs URL (inline DOM update, no re-render)
        zoneEl.querySelectorAll('.ad-f-imgmode').forEach(function(sel) {
            sel.addEventListener('change', function(e) {
                e.stopPropagation();
                var mode = sel.value;
                var ads = adsByPosition(pos);
                var editingIdx = __adEditing[pos];
                var ad = editingIdx >= 0 ? ads[editingIdx] : (editingIdx === -2 ? { name: '', type: 'custom', enabled: true, image: '', alt: '', width: 0, height: 0, code: '', imgMode: 'file' } : null);
                if (!ad) return;
                ad.imgMode = mode;
                // toggle upload button and placeholder inline (no full re-render)
                var upBtn = zoneEl.querySelector('.ad-f-upimg');
                var imgInp = zoneEl.querySelector('.ad-f-image');
                if (upBtn) upBtn.style.display = mode === 'url' ? 'none' : '';
                if (imgInp) imgInp.placeholder = mode === 'url' ? '粘贴图片网址 https://...' : '路径如 assets/ads/ad1.png';
            });
        });
    }
    function refreshAdList() {
        ['top','left','right'].forEach(function(pos) { renderAdZone(pos); });
    }
    function saveAdForm(pos) {
        var zoneId = pos === 'top' ? 'adZoneTop' : (pos === 'left' ? 'adZoneLeft' : 'adZoneRight');
        var zoneEl = document.getElementById(zoneId);
        if (!zoneEl) return;
        var ads = adsByPosition(pos);
        var editingIdx = __adEditing[pos];
        var isNew = editingIdx === -2;
        // read form
        var nameEl = zoneEl.querySelector('.ad-f-name');
        var typeEl = zoneEl.querySelector('.ad-f-type');
        var codeEl = zoneEl.querySelector('.ad-f-code');
        var imgEl = zoneEl.querySelector('.ad-f-image');
        var wEl = zoneEl.querySelector('.ad-f-w');
        var hEl = zoneEl.querySelector('.ad-f-h');
        var altEl = zoneEl.querySelector('.ad-f-alt');
        var ad = isNew ? { name: '', type: 'custom', enabled: true, image: '', imgMode: 'file', alt: '', width: 0, height: 0, code: '' } : ads[editingIdx];
        ad.name = (nameEl ? nameEl.value : '').trim();
        if (!ad.name) { toast('请填写名称'); return; }
        ad.type = typeEl ? typeEl.value : 'custom';
        ad.code = codeEl ? codeEl.value : '';
        ad.image = imgEl ? imgEl.value : '';
        ad.imgMode = ad.imgMode || 'file';
        ad.width = parseInt((wEl ? wEl.value : '') || '0') || 0;
        ad.height = parseInt((hEl ? hEl.value : '') || '0') || 0;
        ad.alt = altEl ? altEl.value : '';
        if (isNew) ads.push(ad);
        __adEditing[pos] = -1;
        renderAdZone(pos);
        renderAllAds();
        toastOk('已保存');
    }
    function deleteAdForm(pos) {
        showConfirm('确定删除这个广告位吗？', function () {
        var ads = adsByPosition(pos);
        ads.splice(__adEditing[pos], 1);
        __adEditing[pos] = -1;
        renderAdZone(pos);
        renderAllAds();
        toastOk('已删除');
        });
    }
    function addNewAd(pos) {
        __adEditing[pos] = -2;
        renderAdZone(pos);
    }
    function moveAd(pos, index, direction) {
        var ads = adsByPosition(pos);
        if (direction === 'up' && index > 0) { var t = ads[index]; ads[index] = ads[index - 1]; ads[index - 1] = t; if (__adEditing[pos] >= 0) __adEditing[pos]--; }
        if (direction === 'down' && index < ads.length - 1) { var t = ads[index]; ads[index] = ads[index + 1]; ads[index + 1] = t; if (__adEditing[pos] >= 0) __adEditing[pos]++; }
        renderAdZone(pos);
        renderAllAds();
    }

    // ===== 板块渲染 =====
    function skillItemHtml(secId, i, it) {
        return '<div class="skill-item" data-i="' + i + '">'
            + '<i class="' + (it.icon || 'fas fa-star') + '"></i>'
            + '<div class="skill-name"' + (editMode ? ' contenteditable="true"' : '') + '>' + esc(it.name || '') + '</div>'
            + (editMode ? '<span class="ab-del" data-del="skills" data-sec="' + secId + '" data-i="' + i + '">&times;</span>' : '')
            + '</div>';
    }
    function contactItemHtml(secId, i, it) {
        return '<li data-i="' + i + '">'
            + '<i class="' + (it.icon || 'fas fa-link') + '"></i>'
            + '<strong' + (editMode ? ' contenteditable="true"' : '') + ' data-c="label">' + esc(it.label || '') + '</strong>'
            + '<a href="' + escAttr(normLink(it.link || '#')) + '" target="_blank" rel="noopener"' + (editMode ? ' contenteditable="true"' : '') + ' data-c="value">' + esc(it.value || it.link || '') + '</a>'
            + (editMode ? '<span class="ab-del" data-del="contacts" data-sec="' + secId + '" data-i="' + i + '">&times;</span>' : '')
            + '</li>';
    }

    function sectionHtml(sec) {
        var head = '<h2 class="section-title">'
            + '<i class="' + sec.icon + '"' + (editMode ? ' data-ic="' + sec.id + '"' : '') + '></i> '
            + '<span class="sec-title"' + (editMode ? ' data-tt="' + sec.id + '" contenteditable="true"' : '') + '>' + sec.title + '</span>'
            + '</h2>';
        var body = '';
        var useModules = Array.isArray(sec.modules);
        if (!useModules) {

        if (sec.type === 'skills') {
            body = '<div class="skills-grid"' + (editMode ? ' data-body="' + sec.id + '"' : '')
                + '>' + sec.content.items.map(function (it, i) { return skillItemHtml(sec.id, i, it); }).join('')
                + '</div>';
        } else if (sec.type === 'contacts') {
            body = '<ul class="contact-list"' + (editMode ? ' data-body="' + sec.id + '"' : '') + '>'
                + sec.content.items.map(function (it, i) { return contactItemHtml(sec.id, i, it); }).join('')
                + '</ul>';
        }

        // 每个板块下面统一加富文本编辑器（编辑模式）或渲染内容（访客模式）
        if (editMode) {
            body += '<div class="ab-md-editor-wrap" data-md-sec="' + sec.id + '"></div>';
        } else {
            // 访客模式：如果有编辑器内容就渲染出来
            if (sec.content.richHtml) {
                body += '<div class="section-rich-content">' + sec.content.richHtml + '</div>';
            }
        }
        }
        if (useModules) {
            body += renderModuleBlocks(sec.modules, sec.id, sec._pvCols);
            if (editMode && (!sec.modules || !sec.modules.length)) {
                body += '<div class="ab-empty-mods" data-sec="' + sec.id + '" style="padding:16px;text-align:center;color:#999;font-size:13px;background:#f9fafb;border:1px dashed #ddd;border-radius:6px;margin-top:8px">暂无模块，点击「模块库」添加模块</div>';
            }
        }

        return '<div class="section" data-sec="' + sec.id + '">' + head + body + '</div>';
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
        if(name==='开关切换'||name==='开关') return'<div class="ab-mp-toggle" style="background:#3b82f6"></div>';
        if(name==='范围滑块'||name==='滑块') return'<div class="ab-mp-slider"><div class="ab-mp-slider-bar" style="background:#3b82f6"></div></div>';
        if(name==='搜索框') return(lb?'<div class="ab-mp-label">'+lb+'</div>':'')+'<input class="ab-mp-input ab-mp-search" placeholder="'+(ph||'搜索...')+'" readonly>';
        if(name==='标签组'||name==='技能卡片'){var tags=cfg.tags?cfg.tags.split(',').map(function(t){return t.trim()}):['标签'];return'<div class="ab-mp-skills">'+tags.map(function(t){return'<span class="ab-mp-skill-tag" style="background:#3b82f6">'+t+'</span>'}).join('')+'</div>';}
        if(name==='进度条'){var pct=cfg.percent||65;return'<div class="ab-mp-progress"><div class="ab-mp-progress-bar" style="width:'+pct+'%;background:#3b82f6"></div></div>';}
        if(name==='数字徽章') return'<span style="padding:2px 8px;background:#3b82f6;color:#fff;border-radius:10px;font-size:11px">'+(cfg.text||'NEW')+'</span>';
        if(name==='引用卡片'||name==='引用块') return'<div class="ab-mp-quote">'+(cfg.quote||'引用文字')+'</div>';
        if(name==='联系方式卡'||name==='联系方式卡片') return'<div style="padding:12px;background:#eff6ff;border-radius:6px;font-size:13px">📧 contact@example.com</div>';
        if(name==='提示信息') return'<div style="padding:8px 12px;border-radius:4px;font-size:13px;background:#dbeafe;color:#1e40af">'+(cfg.msg||'提示')+'</div>';
        if(name==='分割线') return'<div class="ab-mp-divider"><span>分割线</span></div>';
        if(name==='选项卡切换'||name==='选项卡') return'<div class="ab-mp-tabs"><span class="ab-mp-tab active">选项一</span><span class="ab-mp-tab">选项二</span></div>';
        if(name==='步骤进度条'||name==='步骤条') return'<div class="ab-mp-steps"><span class="ab-mp-step-num">1</span><span class="ab-mp-step-line"></span><span class="ab-mp-step-num">2</span></div>';
        if(name==='图标标题组'||name==='图标框') return'<div class="ab-mp-icon" style="background:linear-gradient(135deg,#3b82f6,#2563eb)">⭐</div><span style="font-size:13px">'+(cfg.text||'标题')+'</span>';
        if(name==='头像名片'||name==='头像') return'<div class="ab-mp-avatar" style="background:#3b82f6">U</div><span>'+(cfg.name||'用户名')+'</span>';
        if(name==='统计数据') return'<div style="text-align:center"><div style="font-size:18px;font-weight:700;color:#3b82f6">'+(cfg.num||'0')+'</div></div>';
        if(name==='富文本段落') return'<div style="padding:8px;color:#555;font-size:13px">正文内容</div>';
        if(name==='代码块') return'<div class="ab-mp-code">function hello(){}</div>';
        if(name==='数据表格') return'<table class="ab-mp-table"><tr><th>列A</th><th>列B</th></tr><tr><td>1</td><td>2</td></tr></table>';
        if(name==='折叠面板') return'<div style="border:1px solid #ddd;border-radius:4px;overflow:hidden"><div style="padding:6px 10px;background:#fafafa;font-weight:600;font-size:12px">'+(cfg.label||'面板标题')+'</div></div>';
        if(name==='空状态') return'<div style="text-align:center;padding:16px;color:#ccc">📭 暂无数据</div>';
        if(name==='分栏布局') return'<div style="display:flex;gap:4px"><div style="flex:1;padding:10px;background:#eff6ff;text-align:center;border-radius:3px">栏</div><div style="flex:1;padding:10px;background:#eff6ff;text-align:center;border-radius:3px">栏</div></div>';
        if(name==='分页导航'||name==='分页') return'<div class="ab-mp-pages"><span class="ab-mp-page">‹</span><span class="ab-mp-page ab-mp-page-cur">1</span><span class="ab-mp-page">2</span><span class="ab-mp-page">›</span></div>';
        if(name==='倒计时') return'<div style="display:flex;gap:3px;font-family:monospace"><span style="padding:2px 5px;background:#333;color:#fff;border-radius:2px;font-size:12px">12</span>:<span style="padding:2px 5px;background:#333;color:#fff;border-radius:2px;font-size:12px">30</span></div>';
        return '<span class="ab-mp-unknown">' + name + '</span>';
    }

    function renderSections() { sectionsEl.innerHTML = about.sections.map(sectionHtml).join(''); initEditors(); }
    function refreshSection(secId) {
        var sec = findSec(secId); if (!sec) return;
        var el = sectionsEl.querySelector('.section[data-sec="' + secId + '"]');
        if (el) { el.outerHTML = sectionHtml(sec); initEditors(); }
    }

    // ===== 所见即所得富文本编辑器（每个板块一个） =====
    function createEditor(container, secId) {
        container.innerHTML = ''
            + '<div class="ab-md-tb">'
            + '<button data-cmd="bold" title="加粗 (Ctrl+B)"><b>B</b></button>'
            + '<button data-cmd="italic" title="斜体 (Ctrl+I)"><i>I</i></button>'
            + '<button data-cmd="strikeThrough" title="删除线"><s>S</s></button>'
            + '<span class="ab-sep"></span>'
            + '<button data-cmd="formatBlock" data-val="h3" title="标题">H</button>'
            + '<button data-cmd="insertUnorderedList" title="无序列表">&#9776;</button>'
            + '<button data-cmd="insertOrderedList" title="有序列表">&#35;</button>'
            + '<button data-cmd="formatBlock" data-val="blockquote" title="引用">&#8220;</button>'
            + '<span class="ab-sep"></span>'
            + '<button data-cmd="createLink" title="链接">&#128279;</button>'
            + '<button data-cmd="insertImage" title="图片">&#128247;</button>'
            + '<button data-cmd="formatBlock" data-val="pre" title="代码">&lt;/&gt;</button>'
            + '<button data-cmd="insertHorizontalRule" title="分割线">&mdash;</button>'
            + '<span class="ab-sep"></span>'
            + '<button data-cmd="undo" title="撤销 (Ctrl+Z)">&#8630;</button>'
            + '<button data-cmd="redo" title="重做 (Ctrl+Y)">&#8631;</button>'
            + '<button data-cmd="removeFormat" title="清除格式">&#128465;</button>'
            + '</div>'
            + '<div class="ab-editor-body" contenteditable="true" data-editor="' + secId + '" placeholder="输入内容..."></div>';

        var editor = $('.ab-editor-body', container);

        // 恢复已有内容
        var sec = findSec(secId);
        if (sec && sec.content.richHtml) {
            editor.innerHTML = sec.content.richHtml;
        }

        // 工具栏按钮
        $all('.ab-md-tb button', container).forEach(function (btn) {
            btn.onclick = function (e) {
                e.preventDefault();
                editor.focus();
                var cmd = btn.getAttribute('data-cmd');
                var val = btn.getAttribute('data-val') || null;

                if (cmd === 'createLink') {
                    var url = prompt('请输入链接地址：', 'https://');
                    if (url) document.execCommand(cmd, false, url);
                } else if (cmd === 'insertImage') {
                    var src = prompt('请输入图片地址：', '');
                    if (src) document.execCommand(cmd, false, src);
                } else {
                    document.execCommand(cmd, false, val);
                }
            };
        });

        // 输入时实时保存到数据模型（防丢失）
        editor.addEventListener('input', function () {
            var s = findSec(secId);
            if (s) s.content.richHtml = editor.innerHTML;
        });
    }

    function initEditors() {
        if (!editMode) return;
        $all('.ab-md-editor-wrap').forEach(function (wrap) {
            var sid = wrap.getAttribute('data-md-sec');
            if (sid && wrap.children.length === 0) createEditor(wrap, sid);
        });
    }

    // ===== 事件绑定 =====
    function bindSections() {
        sectionsEl.addEventListener('click', function (e) {
            var ic = e.target.closest('[data-ic]');
            if (ic) { var sec = findSec(ic.getAttribute('data-ic')); if (sec) openIconPicker(sec.icon, function (nic) { sec.icon = nic; ic.className = nic; }); return; }
            var del = e.target.closest('[data-del]');
            if (del) { var sid2 = del.getAttribute('data-sec'); var i2 = +del.getAttribute('data-i'); var sec2 = findSec(sid2); sec2.content.items.splice(i2, 1); refreshSection(sec2); return; }
        });
        sectionsEl.addEventListener('input', function (e) {
            var secEl = e.target.closest('.section'); if (!secEl) return;
            var sec = findSec(secEl.getAttribute('data-sec')); if (!sec) return;
            if (e.target.classList.contains('sec-title')) { sec.title = e.target.innerHTML; return; }
            if (e.target.classList.contains('skill-name')) { var i3 = +e.target.parentNode.getAttribute('data-i'); sec.content.items[i3].name = e.target.innerText; return; }
            if (e.target.hasAttribute('data-c')) { var i4 = +e.target.parentNode.getAttribute('data-i'); var f = e.target.getAttribute('data-c'); sec.content.items[i4][f] = e.target.innerText; if (f === 'value') sec.content.items[i4].link = normLink(e.target.innerText); return; }
        });
    }

    // ===== 标题格式工具栏（跟随选区浮动） =====
    var titleToolbar = null;
    var activeTitleEl = null;

    function showTitleToolbarAtSelection(el) {
        var sel = window.getSelection();
        if (!sel.rangeCount || sel.isCollapsed) { hideTitleToolbar(); return; }
        var range = sel.getRangeAt(0);
        // 确保选区在标题内
        if (!el.contains(range.commonAncestorContainer) && !el.contains(range.startContainer)) { hideTitleToolbar(); return; }

        if (!titleToolbar) {
            activeTitleEl = el;
            titleToolbar = document.createElement('div');
            titleToolbar.className = 'ab-title-tb';
            titleToolbar.innerHTML = ''
                + '<button data-cmd="bold" title="Bold (Ctrl+B)"><b>B</b></button>'
                + '<button data-cmd="italic" title="Italic (Ctrl+I)"><i>I</i></button>'
                + '<button data-cmd="underline" title="Underline (Ctrl+U)"><u>U</u></button>'
                + '<span class="ab-sep"></span>'
                + '<button data-cmd="createLink" title="Link">&#128279;</button>';
            document.body.appendChild(titleToolbar);

            $all('button', titleToolbar).forEach(function (btn) {
                btn.onclick = function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    el.focus();
                    var cmd = btn.getAttribute('data-cmd');
                    if (cmd === 'createLink') {
                        var url = prompt('Enter URL:', 'https://');
                        if (url) document.execCommand(cmd, false, url);
                    } else {
                        document.execCommand(cmd, false, null);
                    }
                    el.focus();
                    // 重新定位到选区
                    setTimeout(function () { repositionToolbar(); }, 10);
                };
            });
        }

        repositionToolbar();
    }

    function repositionToolbar() {
        if (!titleToolbar || !activeTitleEl) return;
        var sel = window.getSelection();
        if (!sel.rangeCount) { hideTitleToolbar(); return; }
        var range = sel.getRangeAt(0).cloneRange();
        var rect = range.getBoundingClientRect();

        // 如果选区跨行，取最后一个矩形的上方
        if (rect.width === 0 || rect.height === 0) {
            // 选区可能被折叠了
            hideTitleToolbar(); return;
        }

        var tbRect = titleToolbar.getBoundingClientRect();
        // 工具栏水平居中于选区上方
        var left = rect.left + (rect.width / 2) - (tbRect.width / 2);
        // 不超出屏幕左右边界
        left = Math.max(4, Math.min(left, window.innerWidth - tbRect.width - 4));
        titleToolbar.style.left = left + 'px';
        titleToolbar.style.top = (rect.top - tbRect.height - 4) + 'px';
    }

    function hideTitleToolbar() {
        if (titleToolbar) { titleToolbar.remove(); titleToolbar = null; }
        activeTitleEl = null;
    }

    function initTitleToolbar() {
        // 监听选区变化：有选中文字时显示工具栏并跟随
        document.addEventListener('selectionchange', function () {
            var sel = window.getSelection();
            if (!sel.rangeCount) { hideTitleToolbar(); return; }
            var focusedEl = document.activeElement;
            if (!focusedEl || !focusedEl.classList.contains('sec-title')) { hideTitleToolbar(); return; }
            if (sel.isCollapsed) { hideTitleToolbar(); return; }
            showTitleToolbarAtSelection(focusedEl);
        });

        // 鼠标松开时也更新位置（拖拽选择时）
        sectionsEl.addEventListener('mouseup', function () {
            setTimeout(function () {
                var el = document.activeElement;
                if (el && el.classList.contains('sec-title')) {
                    showTitleToolbarAtSelection(el);
                }
            }, 10);
        });

        // 键盘操作后更新位置
        sectionsEl.addEventListener('keyup', function () {
            setTimeout(repositionToolbar, 10);
        });
    }

    function renderHeader() {
        var headerEl = document.getElementById('aboutHeader') || document.querySelector('.about-header');
        var t = $('[data-about-field="title"]');
        if (t) {
            var iconCls = about.headerIcon || 'fas fa-user-circle';
            t.innerHTML = '<i class="' + iconCls + '" data-header-icon contenteditable="false"></i> ' + esc(about.title || '关于作者');
            if (editMode) {
                t.setAttribute('contenteditable', 'true');
                var ic = t.querySelector('[data-header-icon]');
                if (ic) {
                    ic.style.cursor = 'pointer';
                    ic.title = '点击更换图标';
                    ic.onclick = function (e) {
                        e.preventDefault(); e.stopPropagation();
                        openIconPicker(about.headerIcon || 'fas fa-user-circle', function (nic) {
                            about.headerIcon = nic; ic.className = nic;
                        });
                    };
                }
            }
        }
        var s = $('[data-about-field="subtitle"]');
        if (s) { s.innerText = about.subtitle || ''; if (editMode) s.setAttribute('contenteditable', 'true'); }
        if (headerEl) {
            if (about.headerBg) headerEl.style.background = about.headerBg;
            else headerEl.style.background = '';
        }
    }

    // 颜色加深/变浅，用于由单色生成渐变
    function shadeColor(hex, percent) {
        hex = (hex || '#667eea').replace('#', '');
        if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
        var num = parseInt(hex, 16);
        var r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
        r = Math.max(0, Math.min(255, Math.round(r * (1 + percent))));
        g = Math.max(0, Math.min(255, Math.round(g * (1 + percent))));
        b = Math.max(0, Math.min(255, Math.round(b * (1 + percent))));
        return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }
    function primaryFromBg(bg) {
        if (!bg) return '#667eea';
        var m = bg.match(/#[0-9a-fA-F]{3,6}/);
        return m ? m[0] : '#667eea';
    }

    // 站点设置里的 Favicon / 标签标题 同步到关于页浏览器标签
    function applyPageMeta() {
        var site = (root && root.site) || {};
        var fav = about.favicon || site.favicon;
        if (fav) {
            var favHref = faviconHref(fav);
            var links = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]');
            if (links.length) {
                for (var i = 0; i < links.length; i++) links[i].setAttribute('href', favHref);
            } else {
                var lk = document.createElement('link');
                lk.rel = 'icon'; lk.setAttribute('href', favHref);
                document.head.appendChild(lk);
            }
        }
        if (about.tabTitle && about.tabTitle.trim()) {
            document.title = about.tabTitle;
        } else {
            var siteTitle = site.title || '';
            if (siteTitle) document.title = '关于我们 - ' + siteTitle;
        }
    }

    // 标题显示用：去掉 HTML 标签 + 可选截断
    function plainTitle(html, max) {
        var tmp = document.createElement('div');
        tmp.innerHTML = html || '';
        var text = (tmp.textContent || '').replace(/\s+/g, ' ').trim();
        if (max && text.length > max) text = text.slice(0, max) + '…';
        return text;
    }

    // ===== 板块管理弹窗 =====
    function afterSortChange() { renderSections(); renderSortList(); }

    function renderSortList() {
        var list = $('#abSortList'); if (!list) return;
        list.innerHTML = '<div style="background:#fff3cd;font-weight:600;font-size:14px;color:#333;padding:8px 0;border-bottom:2px solid #e0e0e0;display:flex;flex-direction:row;align-items:center;gap:10px;white-space:nowrap">'
            + '<span style="flex:0 0 44px;margin-left:-4px"></span>'
            + '<span style="flex:0 0 1px"></span>'
            + '<span style="flex:0 0 180px;padding-left:24px">标题</span>'
            + '<span style="flex:0 0 130px">模板类型</span>'
            + '<span style="flex:0 0 120px">模板</span>'
            + '<span style="flex:1">操作</span>'
            + '</div>'
            + about.sections.map(function (sec, i) {
            var full = plainTitle(sec.title);
            return '<div class="ab-sort-row" data-sec="' + sec.id + '">'
                + '<span class="ab-drag-handle" title="长按拖动排序" style="margin-left:-4px">&#8776;</span>'
                + '<span class="ab-sort-divider"></span>'
                + '<span style="display:flex;align-items:center;gap:6px;flex:0 0 180px;min-width:0">'
                + '<span class="ab-sort-ic-wrap"><i class="' + sec.icon + '"></i><span class="ab-sort-ic-hint">换</span></span>'
                + '<span class="ab-sort-title" data-saved="' + esc(full) + '" title="' + esc(full) + '" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0">' + esc(plainTitle(sec.title, 12)) + '</span>'
                + '</span>'
                + '<span style="display:flex;align-items:center;gap:4px;flex:0 0 130px;min-width:0">'
                + '<span class="ab-sort-type-lbl" data-type-idx="' + i + '" title="点击选择模板类型">' + (function(){ var cs=comboCats(); for(var ci=0;ci<cs.length;ci++)if(cs[ci].id===(sec._comboCat||''))return cs[ci].name; return ALL_LABELS[sec.type]||sec.type; })() + '</span>'
                + '<select class="ab-sort-type-sel" data-type-idx="' + i + '" style="display:none;font-size:12px;padding:3px 6px;border:1px solid #667eea;border-radius:4px"><option value="">选择模板类型</option>' + comboCats().map(function(c){return '<option value="'+c.id+'">'+esc(c.name)+'</option>';}).join('') + '</select>'
                + '</span>'
                + '<span style="flex:0 0 120px;min-width:0">'
                + '<select class="ab-sort-ver-sel" data-ver-idx="' + i + '" data-combo-cat="' + (sec._comboCat||'') + '" style="font-size:11px;padding:2px 4px;border:1px solid #ddd;border-radius:3px;color:#666;max-width:110px">' + (function(){var cits=comboItems(sec._comboCat||'');return cits.map(function(v){return '<option value="'+v.id+'"'+(v.id===(sec._comboVer||'')?' selected':'')+'>'+esc(v.name)+'</option>';}).join('');})() + '</select>'
                + '</span>'
                + '<span class="ab-sort-act" style="flex:1;min-width:0">'
                + '<button class="ab-save-tpl-btn" data-save="' + i + '" style="padding:3px 8px;margin-right:0;border:1px solid ' + (tplFindVer(sec) ? '#6ee7b7' : '#ddd') + ';background:' + (tplFindVer(sec) ? '#d4edda' : '#fff') + ';color:' + (tplFindVer(sec) ? '#155724' : '#666') + ';border-radius:4px;cursor:pointer;font-size:11px">' + (tplFindVer(sec) ? '已保存' : '保存') + '</button>'
                + '<button data-del2 style="font-size:18px;padding:2px 6px;border:none;background:none;color:#e74c3c;cursor:pointer" title="删除"><i class="fas fa-trash" style="display:inline-block;transform:scaleX(1.25)"></i></button>'
                + '</span></div>';
        }).join('');
        $all('.ab-sort-row', list).forEach(function (row) {
            var id = row.getAttribute('data-sec');
            if (!id) return;
            var idx = -1;
            for (var k = 0; k < about.sections.length; k++) if (about.sections[k].id === id) { idx = k; break; }
            var sec = about.sections[idx];
            var icWrap = row.querySelector('.ab-sort-ic-wrap');
            if (icWrap) icWrap.onclick = function () { openIconPicker(sec.icon, function (nic) { sec.icon = nic; afterSortChange(); }); };
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
            var del = $('[data-del2]', row); if (del) del.onclick = function () { showConfirm('确定要删除「' + plainTitle(sec.title) + '」板块吗？', function () { about.sections.splice(idx, 1); afterSortChange(); }); };
            var sv = row.querySelector('.ab-save-tpl-btn');
            if (sv) sv.addEventListener('click', function (ev) { ev.stopPropagation(); showConfirm('确定将该板块保存到模板库吗？', function () { tplSave(sec); renderSortList(); }, '确认保存'); });
            var verSel2 = row.querySelector('.ab-sort-ver-sel');
            if (verSel2) verSel2.addEventListener('change', function () {
                var vid = verSel2.value;
                if (!vid) { sec._comboVer = ''; return; }
                sec._comboVer = vid;
                var catId = verSel2.getAttribute('data-combo-cat') || sec._comboCat || '';
                var vt = comboFindItem(catId, vid);
                if (!vt) return;
                if (vt.type) sec.type = vt.type;
                sec.icon = vt.icon || sec.icon;
                sec.title = vt.title;
                // 选择模板后统一进入模块模式，清空旧富文本内容，避免残留的旧编辑器
                sec.content = { richHtml: '', items: [] };
                sec.modules = vt.modules ? JSON.parse(JSON.stringify(vt.modules)) : [];
                sec._pvCols = vt._pvCols ? JSON.parse(JSON.stringify(vt._pvCols)) : [];
                afterSortChange();
            });
            var typeLbl = row.querySelector('.ab-sort-type-lbl');
            var typeSel = row.querySelector('.ab-sort-type-sel');
            if (typeLbl && typeSel) {
                typeLbl.addEventListener('click', function (e) { e.stopPropagation(); typeLbl.style.display = 'none'; typeSel.style.display = ''; typeSel.focus(); });
                typeSel.addEventListener('change', function () {
                    var catId = typeSel.value;
                    if (!catId) { renderSortList(); return; }
                    sec._comboCat = catId;
                    var verSel = row.querySelector('.ab-sort-ver-sel');
                    if (verSel) {
                        verSel.setAttribute('data-combo-cat', catId);
                        var items = comboItems(catId);
                        verSel.innerHTML = items.map(function(v){return '<option value="'+v.id+'">'+esc(v.name)+'</option>';}).join('');
                    }
                    typeSel.value = catId;
                });
                typeSel.addEventListener('blur', function () {
                    setTimeout(function () { var cs=comboCats(); var cn=''; for(var ci=0;ci<cs.length;ci++)if(cs[ci].id===(sec._comboCat||'')){cn=cs[ci].name;break;} typeLbl.textContent = cn || (ALL_LABELS[sec.type]||sec.type); typeLbl.style.display = ''; typeSel.style.display = 'none'; }, 150);
                });
            }
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
                    if (inserted) { var newOrder = []; $all('.ab-sort-row', list).forEach(function (nr) { var nid2 = nr.getAttribute('data-sec'); for (var si = 0; si < about.sections.length; si++) { if (about.sections[si].id === nid2) { newOrder.push(about.sections[si]); break; } } }); about.sections = newOrder; }
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
            + '<button id="abModBtn" style="margin-left:20px;padding:5px 14px;border:1px solid #667eea;background:#667eea;color:#fff;border-radius:4px;cursor:pointer;font-size:13px">模块库</button>'
            + '<button id="abTplBtn" style="margin-left:8px;padding:5px 14px;border:1px solid #27ae60;background:#27ae60;color:#fff;border-radius:4px;cursor:pointer;font-size:13px">模版库</button>'
            + '<a class="ab-modal-x" data-close>&times;</a></div>'
            + '<div class="ab-modal-b" id="abSortList"></div>'
            + '<div class="ab-add-sec" id="abAddSec" style="padding:10px;text-align:center;font-size:14px;color:#667eea;cursor:pointer;border-top:1px solid #eee">+ 添加板块</div>'
            + '</div></div>';
        document.body.appendChild(ov); renderSortList();
        document.getElementById('abTplBtn').onclick = function () { window.open('/template/模版库/index.html', '_blank'); };
        document.getElementById('abModBtn').onclick = function () { window.open('/template/模块库/index.html', '_blank'); };
        $('#abAddSec', ov).onclick = function () {
            var cats = comboCats();
            if (cats.length === 0) { about.sections.push({ id: nid(), type: 'text', icon: 'fas fa-star', title: '新建板块', content: { richHtml: '', items: [] } }); afterSortChange(); return; }
            var dlg = document.createElement('div'); dlg.className = 'ab-modal-ov';
            dlg.style.zIndex = '100002';
            var html = '<div class="ab-modal" style="width:520px;max-height:80vh;overflow-y:auto">'
                + '<div class="ab-modal-h"><span>从模版库选择</span><a class="ab-modal-x" data-close>&times;</a></div>'
                + '<div class="ab-modal-b" style="padding:12px">';
            cats.forEach(function (cat) {
                var items = comboItems(cat.id);
                html += '<div style="margin-bottom:12px;border:1px solid #e0e0e0;border-radius:6px;overflow:hidden">'
                    + '<div style="background:#f5f6f8;padding:8px 14px;font-weight:600;font-size:13px;color:#333">' + esc(cat.name) + '</div>'
                    + '<div style="padding:6px;display:grid;grid-template-columns:1fr 1fr;gap:4px">'
                    + (items.length === 0 ? '<div style="grid-column:1/-1;padding:8px 14px;color:#ccc;font-size:12px">暂无模板</div>' : items.map(function (it) {
                        return '<div style="padding:8px 10px;cursor:pointer;display:flex;align-items:center;gap:8px;border-radius:4px;transition:background .15s" class="tpl-pick-item" data-cat-id="' + cat.id + '" data-item-id="' + it.id + '"><i class="' + esc(it.icon || 'fas fa-star') + '" style="color:#667eea;font-size:14px;flex-shrink:0"></i><span style="font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(it.name) + '</span></div>';
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
                    about.sections.push({ id: nid(), type: vt.type || 'text', icon: vt.icon || 'fas fa-star', title: vt.title || vt.name, content: JSON.parse(JSON.stringify(vt.content || { richHtml: '', items: [] })), modules: JSON.parse(JSON.stringify(vt.modules || [])), _pvCols: (vt._pvCols || []).slice(), _comboCat: catId, _comboVer: itemId });
                    document.body.removeChild(dlg);
                    afterSortChange();
                });
            });
            dlg.querySelector('[data-close]').onclick = function () { document.body.removeChild(dlg); };
            dlg.addEventListener('click', function (e) { if (e.target === dlg) document.body.removeChild(dlg); });
            function onEscPick(e) { if (e.key === 'Escape') { document.body.removeChild(dlg); document.removeEventListener('keydown', onEscPick); } }
            document.addEventListener('keydown', onEscPick);
        };
        ov.addEventListener('click', function (e) { if (e.target.hasAttribute('data-close')) { document.body.removeChild(ov); document.removeEventListener('keydown', onEscSort); } });
        function onEscSort(e) { if (e.key === 'Escape' && !__cfmOpen) { document.body.removeChild(ov); document.removeEventListener('keydown', onEscSort); } }
        document.addEventListener('keydown', onEscSort);
    }

    function toast(msg) { if (!toastEl) return; toastEl.textContent = '\u26A0 ' + msg; toastEl.classList.add('show'); toastEl.style.color = '#e74c3c'; setTimeout(function () { toastEl.classList.remove('show'); }, 3000); }
    function toastOk(msg) { if (!toastEl) return; toastEl.textContent = msg; toastEl.classList.add('show'); toastEl.style.color = '#2ecc71'; setTimeout(function () { toastEl.classList.remove('show'); }, 3000); }

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

    // ===== 样式注入 =====
    function injectStyle() {
        var style = document.createElement('style');
        style.textContent = ''
            // top bar (同网站提交风格)
            + '.about-edit-bar{position:fixed;top:0;left:0;right:0;z-index:99999;background:#1e1e2e;color:#eee;display:flex;gap:10px;align-items:center;padding:6px 16px;box-shadow:0 2px 8px rgba(0,0,0,.3);font-size:13px}'
            + '.about-edit-bar .ttl{font-size:20px;font-weight:700;color:#fff;white-space:nowrap}'
            + '.about-edit-bar button,.about-edit-bar .ab-btn{display:inline-flex;align-items:center;gap:5px;height:32px;padding:0 12px;border:none;border-radius:6px;cursor:pointer;font-size:13px;transition:all .15s}'
            + '.about-edit-bar .ab-save{background:#27ae60;color:#fff}'
            + '.about-edit-bar .ab-export{background:#2980b9;color:#fff}'
            + '.about-edit-bar .ab-set-tpl{background:#8e44ad;color:#fff}'
            + '.about-edit-bar .ab-sort{background:#f39c12;color:#fff}'
            + '.about-edit-bar .ab-bg-btn{display:inline-flex;align-items:center;gap:5px;height:32px;padding:0 12px;border:none;border-radius:6px;cursor:pointer;font-size:13px;background:#3a3a4d;color:#ccc;min-width:70px}'
            + '.about-edit-bar .ab-bg-wrap{position:relative;display:inline-flex}'
            + '.about-edit-bar .ab-bg-wrap input{position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer}'
            + '.about-edit-bar .ab-bg-swatch{display:inline-block;width:14px;height:14px;border-radius:3px;margin-left:4px;vertical-align:middle;background:transparent}'
            + '.about-edit-bar .ab-favicon-btn{display:inline-flex;align-items:center;gap:5px;height:32px;padding:0 12px;border:none;border-radius:6px;cursor:pointer;font-size:13px;background:#3a3a4d;color:#ccc}'
            + '.about-edit-bar .ab-favicon-btn img{display:inline-block;width:14px;height:14px;border-radius:3px;margin-left:4px;object-fit:contain;background:#fff}'
            + '.about-edit-bar .ab-sep{width:1px;height:20px;background:#3a3a4d;margin:0 4px}'
            + '.about-edit-bar .ab-filename{color:#667eea;cursor:pointer;font-size:12px;white-space:nowrap;border-bottom:1px dashed #667eea;padding-bottom:1px;margin-left:8px}'
            + '.about-edit-bar .ab-right{flex:1;display:flex;justify-content:flex-end;align-items:center;gap:8px}'
            + '.ab-site-version-bar{display:inline-flex;align-items:center;gap:2px;margin-left:6px;font-size:12px;color:#888;white-space:nowrap}'
            + '.ab-sv-site,.ab-sv-version{position:relative;cursor:pointer;color:#fff;padding:2px 6px;border-radius:4px;font-weight:500;transition:background .15s}'
            + '.ab-sv-site{font-size:16px;font-weight:600}'
            + '.ab-sv-version{font-size:13px;font-weight:500;font-style:italic}'
            + '.ab-sv-site:hover,.ab-sv-version:hover{background:rgba(138,164,255,.15)}'
            + '.ab-sv-sep{color:#fff;padding:0 4px;font-size:16px;font-weight:700}'
            + '.ab-sv-badge{position:absolute;top:-6px;right:-6px;background:#4f6bff;color:#fff;border-radius:8px;padding:0 5px;font-size:10px;line-height:15px;min-width:15px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.2)}'
            + '.ab-sv-dropdown{position:fixed;z-index:100000;background:#fff;color:#333;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.2);max-height:320px;overflow:auto;min-width:160px;padding:4px 0}'
            + '.ab-sv-item{padding:8px 14px;cursor:pointer;font-size:13px;white-space:nowrap;display:flex;align-items:center}'
            + '.ab-sv-item:hover{background:#f0f2ff}'
            + '.ab-sv-item.on{background:#667eea;color:#fff}'
            + 'body{padding-top:50px}'
            // ad bars
            + '.ad-sidebar{position:fixed;top:80px;width:180px;display:flex;flex-direction:column;gap:10px;z-index:10}'
            + '.ad-sidebar.left{left:10px}'
            + '.ad-sidebar.right{right:10px}'
            + '.ad-banner{background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,.1)}'
            + '.ad-banner img,.ad-banner video{width:100%;display:block}'
            + '.ad-banner iframe{border:0;display:block;width:100%}'
            + '.ad-banner-text{padding:12px;text-align:center;font-weight:600;font-size:14px}'
            + '.ad-top-bar{position:fixed;top:48px;left:50%;transform:translateX(-50%);z-index:99;max-width:900px;width:calc(100% - 40px);text-align:center}'
            // ad manager modal
            + '.ad-mgr-left{width:240px;flex-shrink:0;overflow-y:auto;max-height:420px;border:1px solid #e0e0e0;border-radius:6px}'
            + '.ad-mgr-right{flex:1;display:flex;flex-direction:column;gap:12px;min-width:260px}'
            + '.ad-list-item{display:flex;align-items:center;gap:6px;padding:8px 12px;cursor:pointer;border-bottom:1px solid #f0f0f0;font-size:13px}'
            + '.ad-list-item:hover{background:#f5f7fa}'
            + '.ad-list-item.active{background:#667eea;color:#fff}'
            + '.ad-list-item.active .ad-tag.enabled{background:#fff;color:#667eea}'
            + '.ad-list-item.active .ad-tag.disabled{background:#fff;color:#e74c3c}'
            + '.ad-tag{display:inline-block;padding:2px 8px;border-radius:3px;font-size:11px;flex-shrink:0;cursor:pointer;user-select:none}'
            + '.ad-tag.enabled{background:#2ecc71;color:#fff}'
            + '.ad-tag.disabled{background:#e74c3c;color:#fff}'
            + '.ad-mgr-select{width:100%;padding:6px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;background:#fff}'
            + '.ad-type-hint{background:#f0f4ff;padding:8px 12px;border-radius:6px;font-size:12px;color:#555;line-height:1.6;max-height:140px;overflow-y:auto}'
            + '.ad-field-row{display:flex;align-items:center;gap:8px}'
            + '.ad-field-row label{width:45px;flex-shrink:0;font-size:13px;text-align:right}'
            + '.ad-field-row input,.ad-field-row select,.ad-field-row textarea{flex:1;padding:6px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px}'
            + '.ad-mgr-btns{display:flex;gap:8px;margin-top:8px}'
            + '.ad-mgr-btns button{padding:6px 16px;border-radius:6px;border:0;cursor:pointer;font-size:13px}'
            + '.ad-mgr-btns button.primary{background:#667eea;color:#fff}'
            + '.ad-mgr-btns button.danger{background:#e74c3c;color:#fff}'
            + '.ad-mgr-btns button.ghost{background:#eee;color:#333}'
            + '.ad-zone-add-bar{display:flex;padding:3px 8px;border-top:1px solid #f0f0f0;background:#fafafa}'
            + '.ad-zone-add-bar .ad-zone-add{flex:1;text-align:center;padding:6px 12px;font-size:16px;font-weight:700;border-radius:4px;border:3px solid #667eea;color:#667eea;cursor:pointer}'
            + '.ad-zone-add-bar .ad-zone-add:hover{background:#667eea;color:#fff}'
            // ad zone cards
            + '.ad-zone-card{border:1px solid #e0e0e0;border-radius:8px;overflow:hidden}'
            + '.ad-zone-hd{display:flex;align-items:center;justify-content:space-between;padding:4px 10px;background:#f8f8f8;font-size:13px;font-weight:600;color:#555;border-bottom:1px solid #e0e0e0}'
            + '.ad-zone-add{font-weight:400;color:#667eea;cursor:pointer;font-size:12px}'
            + '.ad-zone-add:hover{text-decoration:underline}'
            + '.ad-zone-bd{overflow-y:auto}'
            + '.ad-zone-item{display:flex;align-items:center;gap:4px;padding:4px 10px;cursor:pointer;border-bottom:1px solid #f5f5f5;font-size:14px}'
            + '.ad-zone-item:hover{background:#f5f7fa}'
            + '.ad-zone-item.dragging{opacity:.4}'
            + '.ad-zone-item.drag-over{border-top:3px solid #667eea}'
            + '.ad-zone-item.pressed{background:#e8ecf4;transform:scale(.98);transition:transform .1s}'
            + '.ad-zone-item.active{background:#667eea;color:#fff}'
            + '.ad-zone-item.active .ad-tag{color:#fff}'
            + '.ad-zone-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
            + '.ad-zone-type{font-size:13px;color:#667eea;flex-shrink:0}'
            + '.ad-zone-item.active .ad-zone-type{color:rgba(255,255,255,.9)}'
            + '.ad-zone-src{font-size:12px;color:#999;flex-shrink:0}'
            + '.ad-zone-item.active .ad-zone-src{color:rgba(255,255,255,.6)}'
            + '.ad-zone-move{cursor:pointer;color:#bbb;padding:4px 10px;font-size:16px;border-radius:3px}'
            + '.ad-zone-item.active .ad-zone-move{color:#fff}'
            + '.ad-zone-move:hover{color:#667eea;background:rgba(102,126,234,.1)}'
            + '.ad-zone-item.active .ad-zone-move:hover{color:#fff}'
            // inline edit form
            + '.ad-inline-form{margin:8px 0;border:1px solid #667eea;border-radius:8px;overflow:hidden}'
            + '.ad-inline-hd{display:flex;align-items:center;justify-content:space-between;padding:6px 12px;background:#667eea;color:#fff;font-size:13px;font-weight:600}'
            + '.ad-inline-close{cursor:pointer;font-size:16px;line-height:1}'
            + '.ad-inline-bd{padding:8px 12px;display:flex;flex-direction:column;gap:6px}'
            + '.ad-inline-btns{display:flex;gap:8px;padding:6px 12px;border-top:1px solid #e0e0e0}'
            + '.ad-col2{display:flex;gap:12px}'
            + '.ad-col2 .ad-field-row{flex:1}'
            + '.ad-inline-bd .ad-type-hint{max-height:60px;font-size:11px;padding:4px 8px}'
            + '.ad-inline-btns button{padding:5px 14px;border-radius:6px;border:0;cursor:pointer;font-size:13px}'
            + '.ad-inline-btns button.primary{background:#667eea;color:#fff}'
            + '.ad-inline-btns button.danger{background:#e74c3c;color:#fff}'
            + '.ad-inline-btns button.ghost{background:#eee;color:#333}'
            // delete buttons
            + '.ab-del{position:absolute;top:2px;right:6px;color:#e74c3c;cursor:pointer;font-size:18px;line-height:1;display:none}'
            + '.skill-item,.contact-list li{position:relative}'
            + '.skill-item:hover .ab-del,.contact-list li:hover .ab-del{display:block}'
            // toast
            + '.about-toast{position:fixed;bottom:240px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.8);color:#fff;padding:20px 40px;border-radius:10px;z-index:100002;font-size:26px;font-weight:700;color:#e74c3c;opacity:0;transition:opacity .25s}'
            + '.about-toast.show{opacity:1}'
            // modal
            + '.ab-modal-ov{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:100001;display:flex;align-items:center;justify-content:center}'
            + '.ab-modal{background:#fff;color:#333;width:480px;max-width:92vw;max-height:86vh;overflow:auto;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.3)}'
            + '.ab-modal-h{display:flex;align-items:center;font-weight:600;padding:14px 16px;border-bottom:1px solid #eee;font-size:16px}'
            + '.ab-modal-h .ab-modal-x{margin-left:auto;cursor:pointer;font-size:24px;color:#999;line-height:1}'
            + '.ab-modal-b{padding:6px 16px}'
            // sort modal internals
            + '.ab-sort-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #f2f2f2}'
            + '.ab-sort-ic-wrap>i{color:#667eea;font-size:18px}'
            + '.ab-sort-title{flex:1;font-size:14px;cursor:pointer}'
            + '.ab-sort-title:hover{color:#667eea}'
            + '.ab-sort-title.editing{display:inline-flex;align-items:center;gap:6px}'
            + '.ab-tt-btns{display:inline-flex;gap:2px;margin-left:4px;flex-shrink:0}'
            + '.ab-tt-ok,.ab-tt-cancel{cursor:pointer;font-size:18px;line-height:1;text-decoration:none;padding:0 4px;display:inline-flex;align-items:center}'
            + '.ab-tt-ok,.ab-tt-ok i{color:#27ae60}'
            + '.ab-tt-cancel,.ab-tt-cancel i{color:#e74c3c}'
            + '.ab-tt-ok:hover,.ab-tt-cancel:hover{opacity:.7}'
            + '.ab-sort-ic-wrap{position:relative;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:5px;cursor:pointer;transition:background .15s}'
            + '.ab-sort-ic-wrap:hover{background:#e8ebff}'
            + '.ab-sort-ic-hint{display:none;position:absolute;top:-7px;right:-7px;background:#667eea;color:#fff;font-size:10px;width:16px;height:16px;border-radius:50%;align-items:center;justify-content:center;font-weight:700}'
            + '.ab-sort-ic-wrap:hover .ab-sort-ic-hint{display:flex}'
            + '.ab-sort-row{cursor:default}'
            + '.ab-drag-handle{display:inline-flex;align-items:center;justify-content:center;width:44px;padding:6px 8px;cursor:grab;color:#bbb;font-size:16px;user-select:none;touch-action:none;margin:-1px 0}'
            + '.ab-drag-handle:hover{color:#667eea;background:#f0f2ff;border-radius:4px}'
            + '.ab-drag-handle:active{cursor:grabbing}'
            + '.ab-sort-divider{width:1px;align-self:stretch;background:#ddd;margin:0}'
            + '.ab-sort-row.ab-dragging{opacity:.6;border:2px solid #667eea;border-radius:8px;box-shadow:0 4px 16px rgba(102,126,234,.35);z-index:2;position:relative;cursor:grabbing}'
            + '.ab-dragging-active{user-select:none}'
            + '.ab-sort-act{display:flex;gap:10px}'
            + '.ab-sort-act button{background:#f0f2f7;border:0;border-radius:5px;padding:5px 10px;cursor:pointer;font-size:13px;color:#444}'
            + '.ab-sort-act button:disabled{opacity:.4;cursor:not-allowed}'
            + '.ab-add-sec{margin:12px 16px;padding:10px;text-align:center;color:#667eea;border:1px dashed #667eea;border-radius:8px;cursor:pointer;font-size:14px}'
            + '.ab-add-form-wrap{margin:12px 16px}'
            + '.ab-add-form{display:flex;flex-direction:column;gap:8px;padding:12px;background:#f7f8fc;border-radius:8px}'
            + '.ab-in{width:100%;padding:8px 10px;border:1px solid #ddd;border-radius:6px;font-size:14px;box-sizing:border-box}'
            + '.ab-ic-pick{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid #ddd;border-radius:6px;cursor:pointer;font-size:14px;align-self:flex-start}'
            + '.ab-add-form .primary{background:#667eea;color:#fff;border:0;border-radius:6px;padding:8px 16px;cursor:pointer}'
            + '.ab-add-form button:not(.primary){background:#eee;border:0;border-radius:6px;padding:8px 16px;cursor:pointer}'
            + '.ab-modal-f{padding:12px 16px;border-top:1px solid #eee;text-align:right}'
            + '.ab-modal-f .primary{background:#667eea;color:#fff;border:0;border-radius:6px;padding:8px 18px;cursor:pointer}'
            // icon picker
            + '.ab-picker{background:#fff;color:#333;width:540px;max-width:94vw;max-height:86vh;overflow:auto;border-radius:10px}'
            + '.ab-picker-grid{display:grid;grid-template-columns:repeat(8,1fr);gap:6px;padding:16px}'
            + '.ab-ic{display:flex;align-items:center;justify-content:center;height:42px;border-radius:8px;cursor:pointer;font-size:20px;color:#555;background:#f6f7fb}'
            + '.ab-ic:hover,.ab-ic.on{background:#667eea;color:#fff}'
            // editable area hints
            + '[data-about-field="title"],[data-about-field="subtitle"]{outline:1px dashed #667eea;outline-offset:2px;border-radius:4px}'
            + '.sec-title{outline:1px dashed #667eea;outline-offset:2px;border-radius:4px;padding:0 4px}'

            // ========== WYSIWYG Rich Text Editor Styles ==========
            + '.ab-md-editor-wrap{margin-top:14px;border:1px solid #d0d5dd;border-radius:8px;overflow:hidden;background:#fff}'
            + '.ab-md-tb{display:flex;flex-wrap:wrap;gap:2px;padding:6px 8px;background:#fafbfc;border-bottom:1px solid #e8eaed;align-items:center}'
            + '.ab-md-tb button{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:1px solid transparent;border-radius:5px;background:none;cursor:pointer;font-size:14px;color:#444;transition:all .12s}'
            + '.ab-md-tb button:hover{background:#e8ebff;color:#667eea;border-color:#c5cae9}'
            + '.ab-md-tb button:active{background:#d0d5f0}'
            + '.ab-md-tb button[data-cmd="bold"] b{font-weight:700}'
            + '.ab-md-tb button[data-cmd="italic"] i{font-style:italic}'
            + '.ab-md-tb button[data-cmd="strikeThrough"] s{text-decoration:line-through}'
            + '.ab-sep{width:1px;height:22px;background:#e0e0e0;margin:0 4px}'
            + '.ab-editor-body{min-height:80px;padding:14px 16px;font-size:14px;line-height:1.8;color:#333;outline:none;word-break:break-word}'
            + '.ab-editor-body:empty:before{content:attr(placeholder);color:#bbb}'
            + '.ab-editor-body:focus{background:#fefefe}'
            // editor content styles
            + '.ab-editor-body h1,.ab-editor-body h2,.ab-editor-body h3{margin:10px 0 6px;font-weight:600;color:#222}'
            + '.ab-editor-body h3{font-size:18px}'
            + '.ab-editor-body p{margin:4px 0}'
            + '.ab-editor-body ul,.ab-editor-body ol{padding-left:20px;margin:6px 0}'
            + '.ab-editor-body li{margin:2px 0}'
            + '.ab-editor-body blockquote{border-left:3px solid #667eea;padding:8px 14px;margin:8px 0;background:#f7f8fc;color:#555;border-radius:0 6px 6px 0}'
            + '.ab-editor-body pre{background:#282c34;color:#abb2bf;padding:12px 14px;border-radius:6px;overflow-x:auto;margin:8px 0;font-size:13px}'
            + '.ab-editor-body code{background:#f0f2f5;padding:2px 5px;border-radius:3px;font-family:"SF Mono",Menlo,Consolas,monospace;font-size:90%;color:#d63384}'
            + '.ab-editor-body pre code{background:none;padding:0;color:inherit;font-size:13px}'
            + '.ab-editor-body a{color:#667eea;text-decoration:none}'
            + '.ab-editor-body a:hover{text-decoration:underline}'
            + '.ab-editor-body img{max-width:100%;border-radius:6px;margin:6px 0}'
            + '.ab-editor-body hr{border:none;border-top:1px solid #eee;margin:12px 0}'
            + '.ab-editor-body table{border-collapse:collapse;width:100%;margin:8px 0}'
            + '.ab-editor-body td,.ab-editor-body th{border:1px solid #ddd;padding:6px 10px;text-align:left}'

            // visitor mode: rendered rich content
            + '.section-rich-content{margin-top:14px;padding:14px 18px;background:#f8f9fc;border-radius:8px;font-size:14px;line-height:1.8;color:#444}'
            + '.section-rich-content h1,.section-rich-content h2,.section-rich-content h3{margin:12px 0 6px;color:#333}'
            + '.section-rich-content p{margin:6px 0}'
            + '.section-rich-content ul,.section-rich-content ol{padding-left:20px;margin:6px 0}'
            + '.section-rich-content li{margin:3px 0}'
            + '.section-rich-content blockquote{border-left:3px solid #667eea;padding:8px 14px;margin:8px 0;background:#f0f2ff;color:#555}'
            + '.section-rich-content pre{background:#2d2d3a;color:#e0e0e0;padding:12px;border-radius:6px;overflow-x:auto;margin:8px 0;font-size:13px}'
            + '.section-rich-content code{background:#eee;padding:2px 5px;border-radius:3px;font-size:13px}'
            + '.section-rich-content pre code{background:none;padding:0}'
            + '.section-rich-content a{color:#667eea;text-decoration:none}'
            + '.section-rich-content a:hover{text-decoration:underline}'
            + '.section-rich-content hr{border:none;border-top:1px solid #ddd;margin:10px 0}'
            + '.section-rich-content img{max-width:100%;border-radius:6px;margin:8px 0}'
            + '.section-rich-content table{border-collapse:collapse;width:100%;margin:8px 0}'
            + '.section-rich-content td,.section-rich-content th{border:1px solid #ddd;padding:6px 10px;text-align:left}'
            + '.ab-title-tb{position:fixed;z-index:9999;display:inline-flex;align-items:center;gap:1px;background:#fff;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,.15);padding:4px 6px}'
            + '.ab-title-tb button{border:none;background:none;cursor:pointer;font-size:13px;color:#555;padding:3px 7px;border-radius:4px;line-height:1.2}'
            + '.ab-title-tb button:hover{background:#667eea;color:#fff}'
            + '.ab-title-tb .ab-sep{width:1px;height:16px;background:#ddd;margin:0 2px}'
            + '.sec-title{outline:none;border-radius:3px;transition:box-shadow .15s;display:inline}'
            + '.sec-title:focus{box-shadow:0 0 0 2px rgba(102,126,234,.3);display:inline-block;width:100%}';
        document.head.appendChild(style);
    }

    // ===== 导出：生成自包含 HTML 并下载 =====
    function exportHtml() {
        var headerEl = document.getElementById('aboutHeader');
        var title = '';
        var subtitle = '';
        if (headerEl) {
            var h1 = headerEl.querySelector('h1');
            var p = headerEl.querySelector('p');
            if (h1) title = h1.innerText || h1.textContent || about.title || '关于导航';
            if (p) subtitle = p.innerText || p.textContent || about.subtitle || '';
        } else {
            title = about.title || '关于导航';
            subtitle = about.subtitle || '';
        }
        var bg = about.headerBg || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';

        // 用访客模式渲染板块（editMode=false，不包含编辑器 UI）
        var savedEditMode = editMode;
        editMode = false;
        var sectionsHtml = about.sections.map(sectionHtml).join('');
        editMode = savedEditMode;

        var html = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n'
            + '<meta charset="UTF-8">\n'
            + '<meta name="viewport" content="width=device-width,initial-scale=1.0">\n'
            + '<title>' + esc(title) + '</title>\n'
            + (function () { var f = faviconHref(about.favicon || (root && root.site && root.site.favicon)); return f ? '<link rel="icon" href="' + escAttr(f) + '">\n' : ''; })()
            + '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">\n'
            + '<style>\n'
            + 'body{background:#f5f7fa;padding:20px 0;margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}\n'
            + '.about-container{max-width:900px;margin:50px auto;background:#fff;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.1);overflow:hidden}\n'
            + '.about-header{background:' + bg + ';color:#fff;padding:40px 30px;text-align:center}\n'
            + '.about-header h1{font-size:32px;margin:0 0 10px;font-weight:600}\n'
            + '.about-header p{font-size:16px;margin:0;opacity:.9}\n'
            + '.about-content{padding:40px 30px}\n'
            + '.section{margin-bottom:35px}\n'
            + '.section:last-child{margin-bottom:0}\n'
            + '.section-title{font-size:22px;color:#333;margin-bottom:15px;padding-bottom:10px;border-bottom:2px solid #f0f0f0;display:flex;align-items:center}\n'
            + '.section-title i{margin-right:10px;color:#667eea}\n'
            + '.skills-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:15px;margin-top:20px}\n'
            + '.skill-item{background:#f8f9fa;padding:15px;border-radius:6px;text-align:center;transition:transform .3s,box-shadow .3s}\n'
            + '.skill-item:hover{transform:translateY(-3px);box-shadow:0 4px 12px rgba(0,0,0,.1)}\n'
            + '.skill-item i{font-size:28px;color:#667eea;margin-bottom:8px}\n'
            + '.skill-item .skill-name{font-weight:600;color:#333;font-size:14px}\n'
            + '.contact-list{list-style:none;padding:0;margin:20px 0 0}\n'
            + '.contact-list li{padding:12px 15px;margin-bottom:10px;background:#f8f9fa;border-radius:6px;display:flex;align-items:center}\n'
            + '.contact-list li:hover{background:#e9ecef}\n'
            + '.contact-list li i{margin-right:12px;color:#667eea;width:20px;text-align:center}\n'
            + '.contact-list li strong{color:#333;margin-right:8px;min-width:80px}\n'
            + '.contact-list li a{color:#667eea;text-decoration:none;word-break:break-all}\n'
            + '.contact-list li a:hover{text-decoration:underline}\n'
            + '.section-rich-content{font-size:15px;line-height:1.8;color:#555}\n'
            + '.section-rich-content p{margin-bottom:15px}\n'
            + '.section-rich-content p:last-child{margin-bottom:0}\n'
            + '@media(max-width:768px){.about-container{margin:20px}.about-header{padding:30px 20px}.about-header h1{font-size:26px}.about-content{padding:30px 20px}.skills-grid{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}}\n'
            + '</style>\n</head>\n<body>\n'
            + '<div class="about-container">\n'
            + '<div class="about-header">\n'
            + '<h1><i class="fas fa-user-circle"></i> ' + esc(title) + '</h1>\n'
            + (subtitle ? '<p>' + esc(subtitle) + '</p>\n' : '')
            + '</div>\n'
            + '<div class="about-content">\n'
            + sectionsHtml
            + '</div>\n</div>\n</body>\n</html>';

        return html;
    }

    // ===== 导出：仅下载当前 HTML 为 about.html（不触发保存弹窗）=====
    function downloadHtml() {
        var html = exportHtml();
        if (!html) { toast('生成 HTML 失败'); return; }
        var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'about.html';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        toastOk('已导出 HTML 文件');
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
                var m = html.match(/<script\s+id="aboutSeed"[^>]*>([\s\S]*?)<\/script>/i);
                if (!m) { toast('此文件不是本模板创建的页面，无法导入'); return; }
                try {
                    var seed = JSON.parse(m[1]);
                    if (!seed.about || !seed.about.sections) { toast('文件数据格式不正确，无法导入'); return; }
                    about = seed.about;
                    renderSections();
                    renderAllAds();
                    applyHeaderBg();
                    saveLocal();
                    // 更新页面显示的文件名
                    fileName = file.name;
                    var fnEl = document.getElementById('abFileName');
                    if (fnEl) fnEl.textContent = fileName;
                    toastOk('已打开 ' + file.name);
                } catch (e) { toast('文件格式错误，无法解析'); }
            };
            reader.readAsText(file);
        };
        inp.click();
    }

    function currentTemplatePath() {
        // 由当前页面 URL 推导所属模板的 index.html，兼容三种入口形式：
        //   /template/页脚/关于导航/           (尾部斜杠)
        //   /template/页脚/关于导航            (无斜杠无文件)
        //   /template/页脚/关于导航/index.html (完整文件名)
        // 之前的正则 /\/template\/(.+?)\/?$/ 在带 index.html 时会捕获到 ".../index.html"，
        // 再拼接 "/index.html" 出现双重文件名，导致写入目标路径不存在、后端静默跳过写入。
        var m = location.pathname.match(/\/template\/(.+?)(?:\/index\.html)?\/?$/i);
        if (!m) return 'template/页脚/关于导航/index.html';
        var dir = m[1].replace(/\/index\.html$/i, '');
        return 'template/' + decodeURIComponent(dir) + '/index.html';
    }

    function applySetAsTemplate() {
        // 收集当前编辑器内容（不弹保存框），仅更新模板默认数据块，保留编辑器入口
        collectAboutData();
        var tplPath = currentTemplatePath();
        var seedJson = JSON.stringify({ about: about, site: (root && root.site) || {} }).replace(/<\//g, '<\\/');
        var seedTag = '<script id="aboutSeed" type="application/json">' + seedJson + '</' + 'script>';
        toast('正在设为模板…');
        fetch('/' + tplPath.replace(/\\/g, '/') + '?t=' + Date.now())
            .then(function (r) { if (!r.ok) throw new Error('读取模板失败'); return r.text(); })
            .then(function (text) {
                // 先全局移除所有旧的 aboutSeed，防止重复
                var newText = text.replace(/<script id="aboutSeed" type="application\/json">[\s\S]*?<\/script>/gi, '');
                // 优先插入到 edit.js 之前，确保编辑器启动时能读到
                var editMarker = /<script\s+src="\.\/edit\.js[^"]*"><\/script>/i;
                if (editMarker.test(newText)) {
                    newText = newText.replace(editMarker, seedTag + '\n    <script src="./edit.js?v=' + Date.now() + '"></script>');
                } else {
                    // 兜底：插入到 </body> 前
                    newText = newText.replace(/<\/body>/i, seedTag + '\n</body>');
                }
                return fetch('/api/save-template', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ files: [ { path: tplPath, content: newText } ] })
                });
            })
            .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
            .then(function (res) {
                if (res && res.ok) {
                    // 同步写入 localStorage（与 save 同一 SKEY），否则刷新编辑器后
                    // loadData 优先读 localStorage，会把刚才“设为模板”的 aboutSeed 更新覆盖掉，
                    // 表现为“刷新后没生效”。写入后刷新即可看到新模板内容。
                    try {
                        var obj = { about: about, site: (root && root.site) || {} };
                        localStorage.setItem(SKEY, JSON.stringify(obj));
                    } catch (_) {}
                    toastOk('已设为模板');
                } else {
                    throw new Error((res && res.error) || '后端返回失败');
                }
            })
            .catch(function (e) { toast('设为模板失败：' + e.message); });
    }

    function setAsTemplate() {
        // 二次确认：点“设为模板”先弹确认框，点“确定”才真正执行
        var ov = document.createElement('div');
        ov.className = 'ab-modal-ov';
        ov.innerHTML = '<div class="ab-modal" style="width:420px">'
            + '<div class="ab-modal-h">设为模板<a class="ab-modal-x" data-close>&times;</a></div>'
            + '<div class="ab-modal-b" style="padding:16px;font-size:14px;color:#555;line-height:1.7">确定要把当前页面的内容设为该模板的默认内容吗？<br>此操作会覆盖模板的初始默认，之后新建页面将以当前内容起步。</div>'
            + '<div class="ab-modal-f">'
            + '<button id="abSetTplCancel" style="margin-right:8px;padding:8px 16px;border:1px solid #ddd;background:#fff;border-radius:6px;cursor:pointer">取消</button>'
            + '<button id="abSetTplConfirm" class="primary">确定</button>'
            + '</div></div>';
        document.body.appendChild(ov);
        function closeModal() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
        ov.querySelector('[data-close]').onclick = closeModal;
        document.getElementById('abSetTplCancel').onclick = closeModal;
        document.getElementById('abSetTplConfirm').onclick = function () { closeModal(); applySetAsTemplate(); };
    }

    function editFileName(el) {
        var cur = (defaultPath || 'about.html').split('/').pop();
        var base = cur.replace(/\.html?$/i, '');
        var ext = (base.length < cur.length) ? cur.slice(base.length) : '.html';
        var input = document.createElement('input');
        input.type = 'text';
        input.value = base;
        input.className = 'ab-filename-input';
        input.style.width = Math.max(70, base.length * 9 + 8) + 'px';
        el.innerHTML = '';
        el.appendChild(input);
        var extSpan = document.createElement('span');
        extSpan.className = 'ab-filename-ext';
        extSpan.textContent = ext;
        el.appendChild(extSpan);
        input.focus();
        input.select();
        var commit = function () {
            var v = input.value.trim().replace(/[\\/:*?"<>|]/g, '');
            if (!v) v = base;
            var newName = v + ext;
            var dir = (defaultPath || '').replace(/[^/]*$/, '');
            defaultPath = dir + newName;
            window.__aboutDefaultPath = defaultPath;
            el.textContent = '文件名：' + newName;
        };
        input.onkeydown = function (e) {
            if (e.key === 'Enter') { input.blur(); }
            else if (e.key === 'Escape') { el.textContent = '文件名：' + cur; }
        };
        input.onblur = commit;
    }

    function buildUI() {
        var al = (root && root.site && root.site.aboutLink) || (root && root.aboutLink) || {};
        var navName = (navLabel && navLabel.trim()) ? navLabel.trim()
            : (al.text && String(al.text).trim() ? al.text.trim() : '关于导航');
        var fileName = (defaultPath || 'about.html').split('/').pop();
        var bar = document.createElement('div'); bar.className = 'about-edit-bar';
        bar.innerHTML = '<span class="ttl" id="abTitleBtn" title="点击设置浏览器标签" style="cursor:pointer">' + esc(navName) + '</span>'
            + '<span id="abSiteVersionBar" class="ab-site-version-bar" style="display:none"></span>'
            + '<span id="abFileName" class="ab-filename" title="点击修改文件名">' + esc(fileName) + '</span>'
            + '<span class="ab-sep"></span>'
            + '<button id="abSave" class="ab-save"><i class="fas fa-save"></i> 保存</button>'
            + '<button id="abOpen" class="ab-export"><i class="fas fa-folder-open"></i> 打开</button>'
            + '<button id="abExport" class="ab-export"><i class="fas fa-download"></i> 下载</button>'
            + '<button id="abSetTpl" class="ab-set-tpl"><i class="fas fa-star"></i> 设为模板</button>'
            + '<div class="ab-right">'
            + ''
            + '<span class="ab-bg-wrap"><span id="abBgBtn" class="ab-bg-btn"><i class="fas fa-fill-drip"></i> 头部背景<span id="abBgSwatch" class="ab-bg-swatch"></span></span><input type="color" id="abBg" value="' + primaryFromBg(about.headerBg) + '"></span>'
            + '<button id="abAds" class="ab-sort"><i class="fas fa-ad"></i> 广告管理</button>'
            + '<button id="abSort" class="ab-sort"><i class="fas fa-th-list"></i> 板块管理</button>'
            + '</div>';
        document.body.appendChild(bar);
        var fnEl = document.getElementById('abFileName');
        if (fnEl) fnEl.onclick = function () { editFileName(fnEl); };
        toastEl = document.createElement('div'); toastEl.className = 'about-toast'; document.body.appendChild(toastEl);
        document.getElementById('abSave').onclick = save;
        document.getElementById('abSort').onclick = openSortModal;
        document.getElementById('abAds').onclick = function() {
            try { openAdManager(); } catch(e) { toast('打开广告管理失败：' + e.message); }
        };
        document.getElementById('abExport').onclick = downloadHtml;
        document.getElementById('abOpen').onclick = openHtmlFile;
        document.getElementById('abSetTpl').onclick = setAsTemplate;
        renderSiteVersionBar();
        // 浏览器标签设置：点击左上角标题文字打开弹窗
        var titleBtn = document.getElementById('abTitleBtn');
        if (titleBtn) titleBtn.onclick = openBrowserTabModal;
        updateFaviconPreview();
        // 背景颜色按钮：点击 span 代理触发隐藏的 input
        var bgBtn = document.getElementById('abBgBtn');
        var bgInput = document.getElementById('abBg');
        var bgSwatch = document.getElementById('abBgSwatch');
        if (bgBtn) bgBtn.onclick = function () { if (bgInput) bgInput.click(); };
        if (bgSwatch && bgInput) bgSwatch.style.background = bgInput.value;
        if (bgInput) bgInput.oninput = function () {
            var c = bgInput.value;
            if (bgSwatch) bgSwatch.style.background = c;
            about.headerBg = 'linear-gradient(135deg,' + c + ' 0%,' + shadeColor(c, -0.18) + ' 100%)';
            var he = document.getElementById('aboutHeader') || document.querySelector('.about-header');
            if (he) he.style.background = about.headerBg;
        };
    }

    function updateFaviconPreview() {
        var prev = document.getElementById('abFaviconPreview');
        if (!prev) return;
        if (about && about.favicon) { prev.src = about.favicon; prev.style.display = 'inline-block'; }
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

        var pendingFav = about.favicon;
        var pendingMeta = about.faviconMeta;
        var input = overlay.querySelector('#btTextInput');
        input.value = about.tabTitle || '';

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
            if (typeof openFaviconEditor !== 'function') { toast('图标编辑器未加载，请刷新页面重试'); return; }
            openFaviconEditor({
                title: '浏览器标签图标',
                value: pendingFav,
                meta: pendingMeta,
                onApply: function (val, meta) { pendingFav = val; pendingMeta = meta; renderPreview(); }
            });
        };
        overlay.querySelector('#btSave').onclick = function () {
            about.tabTitle = (input.value || '').trim();
            about.favicon = pendingFav;
            about.faviconMeta = pendingMeta;
            applyPageMeta();
            hasUnsaved = true;
            showTagToast('保存成功', true);
            closeModal();
        };
    }

    function makeEditableHeader() {
        $all('[data-about-field]').forEach(function (el) {
            var f = el.getAttribute('data-about-field');
            if (f === 'title' || f === 'subtitle') el.setAttribute('contenteditable', 'true');
        });
    }

    function syncFlat() {
        var introSet = false, philSet = false;
        about.sections.forEach(function (sec) {
            if (sec.type === 'text') {
                if (!introSet) { about.intro = ''; about.introHtml = sec.content.richHtml || ''; about.introMode = 'html'; introSet = true; }
                else if (!philSet) { about.philosophy = ''; about.philosophyHtml = sec.content.richHtml || ''; about.philosophyMode = 'html'; philSet = true; }
            } else if (sec.type === 'skills') { about.skills = sec.content.items.map(function (it) { return { icon: it.icon, name: it.name }; }); }
            else if (sec.type === 'contacts') { about.contacts = sec.content.items.map(function (it) { return { icon: it.icon, label: it.label, value: it.value, link: it.link }; }); }
        });
    }

    // 读取 URL 参数（从哪个页脚菜单点进来的、默认保存路径）
    function getQueryParam(name) {
        var m = location.search.match(new RegExp('[?&]' + name + '=([^&]+)'));
        return m ? decodeURIComponent(m[1]) : '';
    }
    var fromKey = getQueryParam('from');
    var defaultPath = getQueryParam('path');
    var navLabel = getQueryParam('label');
    // 每个页脚按钮按各自文件隔离临时记录，避免两个按钮共用同一份内容而互相串
    SKEY = 'nav_editor_work_' + ((defaultPath || 'about').replace(/[^a-zA-Z0-9]+/g, '_'));
    // 暴露到全局供验证/调试
    window.__aboutFromKey = fromKey;
    window.__aboutDefaultPath = defaultPath;

    function collectAboutData() {
        // 收集标题/副标题
        var tEl = $('[data-about-field="title"]'); var sEl = $('[data-about-field="subtitle"]');
        if (tEl) about.title = tEl.innerText.trim();
        if (sEl) about.subtitle = sEl.innerText.trim();

        // 收集所有板块数据
        about.sections.forEach(function (sec) {
            var t = sectionsEl.querySelector('[data-tt="' + sec.id + '"]');
            if (t) sec.title = t.innerHTML.trim();
            var editor = sectionsEl.querySelector('[data-editor="' + sec.id + '"]');
            if (editor) sec.content.richHtml = editor.innerHTML;
            if (sec.type === 'skills') {
                var grid = sectionsEl.querySelector('[data-body="' + sec.id + '"]');
                if (grid) {
                    sec.content.items = $all('.skill-item', grid).map(function (item) {
                        return { icon: item.querySelector('i').className, name: item.querySelector('.skill-name').innerText.trim() };
                    });
                }
            }
            if (sec.type === 'contacts') {
                var clist = sectionsEl.querySelector('[data-body="' + sec.id + '"]');
                if (clist) {
                    sec.content.items = $all('li', clist).map(function (item) {
                        return {
                            icon: item.querySelector('i').className,
                            label: item.querySelector('[data-c="label"]').innerText.trim(),
                            value: item.querySelector('[data-c="value"]').innerText.trim(),
                            link: normLink(item.querySelector('[data-c="value"]').innerText.trim())
                        };
                    });
                }
            }
        });
        syncFlat();
    }

    function save() {
        collectAboutData();

        // 先存到 localStorage（数据同步）
        try {
            var raw = localStorage.getItem(SKEY); var obj = raw ? JSON.parse(raw) : {};
            obj.about = about; obj.site = obj.site || {};
            localStorage.setItem(SKEY, JSON.stringify(obj));
            if (window.opener && !window.opener.closed) window.opener.postMessage({ type: 'nav-about-saved' }, '*');
        } catch (e) { toast('Save failed: ' + e.message); return; }

        // 弹窗询问保存路径：使用各页脚按钮（fromKey）各自传入的默认路径（如“测试按钮”→ footer/test.html）
        var rawDefault = (defaultPath || '').trim();
        // 只有当 defaultPath 是脏名（含模板名“关于导航”或以下划线开头）时才回退到 footer/about.html，
        // 否则直接使用传入的路径，使同一套模板可对应不同输出文件
        var suggestPath = (/关于导航/.test(rawDefault) || /^\s*_/.test(rawDefault))
            ? 'footer/about.html'
            : (rawDefault || 'footer/about.html');
        var pathInfo = parsePathInfo(suggestPath);
        var defaultFileName = suggestPath.split('/').pop() || 'about.html';
        var defaultBaseName = defaultFileName.replace(/\.html?$/i, '');
        var folderName = pathInfo
            ? (suggestPath.replace(/\\/g, '/').replace(/^web\/[^/]+\/[^/]+\/deploy1\/?/, '').replace(/\/[^/]*$/, '') || '根目录')
            : (suggestPath.indexOf('/') >= 0 ? suggestPath.substring(0, suggestPath.lastIndexOf('/')) : '根目录');
        var canShowSmart = pathInfo && siteVersionInfo && siteVersionInfo.siteId === pathInfo.siteId && siteVersionInfo.versionId === pathInfo.versionId;

        var ov = document.createElement('div');
        ov.className = 'ab-modal-ov';
        if (canShowSmart) {
            ov.innerHTML = '<div class="ab-modal" style="width:560px">'
                + '<div class="ab-modal-h">保存到文件<a class="ab-modal-x" data-close>&times;</a></div>'
                + '<div class="ab-modal-b" style="padding:18px">'
                + '<p style="margin:0;font-size:14px;color:#333;line-height:1.8">'
                + '是否将此版本保存到站点 <strong style="color:#667eea;font-size:15px">' + esc(siteVersionInfo.siteName || pathInfo.siteId) + '</strong> '
                + '下的 <strong style="color:#667eea">' + esc(siteVersionInfo.versionName || pathInfo.versionId) + '</strong> 版本下的 '
                + '<strong style="color:#333">' + esc(folderName) + '</strong> 文件夹，命名为 '
                + '<input id="abSaveFileName" value="' + esc(defaultBaseName) + '" style="width:150px;padding:6px 8px;border:1px solid #ddd;border-radius:4px;font-size:14px;vertical-align:middle;text-align:center">'
                + '<span style="font-size:14px;color:#666">.html</span>'
                + '</p>'
                + '</div>'
                + '<div class="ab-modal-f">'
                + '<button id="abSaveConfirm" class="primary">保存</button>'
                + '</div></div>';
        } else {
            ov.innerHTML = '<div class="ab-modal" style="width:520px">'
                + '<div class="ab-modal-h">保存到文件<a class="ab-modal-x" data-close>&times;</a></div>'
                + '<div class="ab-modal-b" style="padding:16px">'
                + '<p style="margin:0 0 10px 0;font-size:13px;color:#666">请输入保存路径（相对于站点根目录）：</p>'
                + '<div style="display:flex;gap:8px;align-items:center">'
                + '<input id="abSavePath" value="' + esc(suggestPath) + '" style="flex:1;padding:8px 10px;border:1px solid #ddd;border-radius:6px;font-size:14px;box-sizing:border-box">'
                + '</div>'
                + '<p style="margin:8px 0 0 0;font-size:12px;color:#999">例如：footer/index.html 或 about/me.html</p>'
                + '</div>'
                + '<div class="ab-modal-f">'
                + '<button id="abSaveConfirm" class="primary">保存</button>'
                + '</div></div>';
        }
        document.body.appendChild(ov);

        function closeModal() { if (ov.parentNode) ov.parentNode.removeChild(ov); document.removeEventListener('keydown', onEsc); }
        function onEsc(e) { if (e.key === 'Escape') { closeModal(); } }
        document.addEventListener('keydown', onEsc);
        ov.querySelector('[data-close]').onclick = closeModal;
        document.getElementById('abSaveConfirm').onclick = function () {
            if (canShowSmart) {
                var fileName = document.getElementById('abSaveFileName').value.trim();
                if (!fileName) { toast('文件名不能为空'); return; }
                if (/[\\/]/.test(fileName)) { toast('文件名不能包含路径分隔符'); return; }
                if (!/\.html?$/i.test(fileName)) fileName += '.html';
                var dir = suggestPath.substring(0, suggestPath.lastIndexOf('/') + 1);
                var path = dir + fileName;
                closeModal();
                doSaveToPath(path);
            } else {
                var path = document.getElementById('abSavePath').value.trim();
                if (!path) { toast('路径不能为空'); return; }
                closeModal();
                doSaveToPath(path);
            }
        };
    }

    function doSaveToPath(path) {
        var html = exportHtml();
        if (!html) { toast('生成 HTML 失败'); return; }
        // 规范化路径：确保以 footer/ 开头，且文件名干净
        var cleanPath = path.trim().replace(/\\/g, '/');
        if (!/\.html?$/i.test(cleanPath)) cleanPath += '.html';
        if (cleanPath.indexOf('/') < 0) cleanPath = 'footer/' + cleanPath;
        // 去掉模板名污染的文件名
        cleanPath = cleanPath.replace(/[^\/]*关于导航[^\/]*\.html$/i, 'about.html');
        fetch('/api/save-about', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ html: html, path: cleanPath })
        }).then(function (r) {
            if (!r.ok) return r.text().then(function (t) { throw new Error('服务端错误 ' + r.status + (t ? ': ' + t : '')); });
            return r.json();
        }).then(function (res) {
            if (res && res.ok) {
                hasUnsaved = false;
                window.onbeforeunload = null;
                toastOk('已保存到 ' + cleanPath);
                if (window.opener) {
                    try { window.opener.postMessage({ type: 'nav-about-saved-to', path: cleanPath, from: fromKey || 'about-link' }, '*'); } catch (_) { }
                }
            } else {
                throw new Error(res && res.error ? res.error : '保存未成功');
            }
        }).catch(function (e) {
            // 后端不可用时降级为浏览器下载
            toast('后端保存失败，已转为下载：' + e.message);
            var downloadName = cleanPath.split('/').pop() || 'about.html';
            var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = downloadName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
            hasUnsaved = false;
            window.onbeforeunload = null;
        });
    }

    function buildFullHtml() {
        // 复用 exportHtml 的静态渲染逻辑，生成自包含 HTML
        var savedEditMode = editMode;
        editMode = false;
        var bodyHtml = sectionHtml();
        editMode = savedEditMode;
        var title = about.title || '关于作者';
        var headerIcon = about.headerIcon || 'fas fa-user-circle';
        var headerBg = about.headerBg || 'linear-gradient(135deg,#667eea 0%,#764ba2 100%)';
        var css = '/* about page styles */'
            + 'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;margin:0;background:#f8f9fa;color:#333}'
            + '.about-container{max-width:800px;margin:0 auto;padding:20px}'
            + '.about-header{text-align:center;padding:60px 20px;border-radius:12px;margin-bottom:30px;color:#fff}'
            + '.about-header i{font-size:48px;margin-bottom:12px;display:block}'
            + '.about-header h1{margin:0 0 8px;font-size:28px}'
            + '.about-header p{margin:0;font-size:16px;opacity:.9}'
            + '.about-section{background:#fff;border-radius:12px;padding:24px;margin-bottom:20px;box-shadow:0 2px 8px rgba(0,0,0,.06)}'
            + '.about-section h2{margin:0 0 16px;font-size:20px;color:#333;display:flex;align-items:center;gap:8px}'
            + '.about-section h2 i{color:#667eea}'
            + '.skill-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:12px}'
            + '.skill-item{text-align:center;padding:12px;background:#f8f9fa;border-radius:8px}'
            + '.skill-item i{font-size:24px;color:#667eea;margin-bottom:6px;display:block}'
            + '.skill-name{font-size:13px;color:#555}'
            + '.contact-list{list-style:none;padding:0;margin:0}'
            + '.contact-list li{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f0f0f0}'
            + '.contact-list li:last-child{border-bottom:0}'
            + '.contact-list i{width:20px;color:#667eea}'
            + '.contact-list a{color:#667eea;text-decoration:none}'
            + '.contact-list a:hover{text-decoration:underline}'
            + '@media(max-width:600px){.about-header{padding:40px 16px}.about-header h1{font-size:22px}}';
        return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">'
            + '<meta name="viewport" content="width=device-width,initial-scale=1.0">'
            + '<title>' + esc(title) + '</title>'
            + '<script id="aboutSeed" type="application/json">' + JSON.stringify(about).replace(/<\//g, '<\\/') + '</' + 'script>'
            + '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">'
            + '<style>' + css + '</style></head><body>'
            + '<div class="about-container">'
            + '<div class="about-header" style="background:' + escAttr(headerBg) + '">'
            + '<i class="' + escAttr(headerIcon) + '"></i>'
            + '<h1>' + esc(title) + '</h1>'
            + '<p>' + esc(about.subtitle || '') + '</p></div>'
            + bodyHtml
            + '</div></body></html>';
    }

    function buildSectionsFromFlat(a) {
        var arr = [];
        arr.push({ id: nid(), type: 'text', icon: 'fas fa-id-card', title: 'About Me', content: { richHtml: a.introHtml || textToHtml(a.intro), items: [] } });
        arr.push({ id: nid(), type: 'skills', icon: 'fas fa-code', title: 'Skills', content: { items: (a.skills || []).map(function (s) { return { icon: s.icon || 'fas fa-star', name: s.name || '' }; }), richHtml: '' } });
        arr.push({ id: nid(), type: 'text', icon: 'fas fa-heart', title: 'Philosophy', content: { richHtml: a.philosophyHtml || textToHtml(a.philosophy), items: [] } });
        arr.push({ id: nid(), type: 'contacts', icon: 'fas fa-address-book', title: 'Contact', content: { items: (a.contacts || []).map(function (c) { return { icon: c.icon || 'fas fa-link', label: c.label || '', value: c.value || '', link: c.link || '' }; }), richHtml: '' } });
        return arr;
    }

    function loadInitialData() {
        // 优先从本按钮对应的文件读取，确保打开看到的是各自文件的内容（一套模板对应不同文件）
        if (defaultPath) {
            return fetch('/' + defaultPath.replace(/\\/g, '/'))
                .then(function (r) { if (!r.ok) throw new Error('file not found'); return r.text(); })
                .then(function (text) {
                    var m = text.match(/<script id="aboutSeed" type="application\/json">([\s\S]*?)<\/script>/);
                    if (m) {
                        try {
                            var data = JSON.parse(m[1].split('<\\/').join('</'));
                            if (data && data.about) return data;
                        } catch (e) {}
                    }
                    throw new Error('no seed in file');
                })
                .catch(function () { return loadData(); });
        }
        return Promise.resolve(loadData());
    }

    function init() {
        loadInitialData().then(function (loaded) {
            root = loaded || {};
            about = (loaded && loaded.about) ? loaded.about : {
                title: 'About Author', subtitle: '', intro: '', introHtml: '', introMode: 'text',
                skills: [], philosophy: '', philosophyHtml: '', philosophyMode: 'text',
                contacts: [], leftAds: [], rightAds: [], topAds: [], favicon: ''
            };
            // 只在 sections 字段不存在时做旧数据迁移；空数组是用户主动删空的合法状态，必须保留
            if (!Array.isArray(about.sections)) about.sections = buildSectionsFromFlat(about);
            if (!about.headerIcon) about.headerIcon = 'fas fa-user-circle';
            if (about.headerBg === undefined || about.headerBg === null) about.headerBg = '';
            if (about.favicon === undefined || about.favicon === null) about.favicon = '';
            // 兼容旧数据：把旧的 mdText/html 迁移到 richHtml
            about.sections.forEach(function (sec) {
                if (!sec.content.richHtml) {
                    if (sec.content.mdText) sec.content.richHtml = mdToHtml(sec.content.mdText);
                    else if (sec.content.html) sec.content.richHtml = sec.content.html;
                    else sec.content.richHtml = '';
                }
            });
            about.leftAds = (about.leftAds || []).map(function (a) { return Object.assign({}, a); });
            about.rightAds = (about.rightAds || []).map(function (a) { return Object.assign({}, a); });
            about.topAds = (about.topAds || []).map(function (a) { return Object.assign({}, a); });
            sectionsEl = document.getElementById('aboutSections');
            applyPageMeta();
            renderHeader(); renderSections(); ensureAdContainers(); renderAllAds();
            if (editMode) {
                injectStyle(); bindSections(); initTitleToolbar(); makeEditableHeader(); buildUI();
                window.onbeforeunload = function() { if (hasUnsaved) return ''; };
                // 仅真实编辑才标记未保存：避免“打开即脏”，导致切换版本时先弹自定义确认、
                // 再弹浏览器离开确认，第二个弹窗一旦取消切换就被静默中止。
                document.addEventListener('input', function () { hasUnsaved = true; }, true);
            }
        });
    }

    // 兼容旧数据的简易 md→html（仅迁移用）
    function mdToHtml(md) {
        if (!md) return '';
        var h = md.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        h = h.replace(/```[\s\S]*?```/g, function(m){return '<pre>'+m.replace(/`/g,'')+'</pre>';});
        h = h.replace(/`([^`\n]+)`/g,'<code>$1</code>');
        h = h.replace(/^### (.+)$/gm,'<h3>$1</h3>');
        h = h.replace(/^## (.+)$/gm,'<h2>$1</h2>');
        h = h.replace(/^# (.+)$/gm,'<h1>$1</h1>');
        h = h.replace(/\*\*\*(.+?)\*\*\*/g,'<strong><em>$1</em></strong>');
        h = h.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
        h = h.replace(/\*(.+?)\*/g,'<em>$1</em>');
        h = h.replace(/~~(.+?)~~/g,'<del>$1</del>');
        h = h.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,'<img src="$2" alt="$1">');
        h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2">$1</a>');
        h = h.replace(/^---$/gm,'<hr>');
        h = h.replace(/\n\n+/g,'</p><p>').replace(/\n/g,'<br>');
        return '<p>' + h + '</p>';
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
