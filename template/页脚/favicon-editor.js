(function (global) {
    'use strict';

    var NS = 'nfe2-' + Date.now().toString(36) + '-';
    var STYLE_ID = NS + 'style';
    var FILE_VERSION = '1785715516';
    var VIEWPORT = 350; // 取景框逻辑尺寸（px）
    var CROP_MARGIN = 50; // 裁剪框四周留白（px），使裁剪框与取景框四边都有更大的间距
    var OUT_SIZE = 512; // 输出分辨率上限
    var SUGGEST_SIZE = 64; // 浏览器标签图标的建议输出尺寸（favicon 标准）

    function byId(id) { return document.getElementById(id); }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function escAttr(s) { return esc(s).replace(/\s+/g, ' '); }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    // —— 内联图标（避免依赖 FontAwesome，确保子页窗口独立可用）——
    function icon(path) {
        return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>';
    }
    var ICON = {
        close: icon('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
        plus: icon('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
        minus: icon('<line x1="5" y1="12" x2="19" y2="12"/>'),
        rotate: icon('<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1 2.13-9.36L23 10"/>'),
        fit: icon('<path d="M3 9V5a2 2 0 0 1 2-2h4M21 9V5a2 2 0 0 0-2-2h-4M3 15v4a2 2 0 0 0 2 2h4M21 15v4a2 2 0 0 1-2 2h-4"/>'),
        image: icon('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>'),
        trash: icon('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>')
    };

    function injectStyle() {
        if (byId(STYLE_ID)) return;
        var css = [
            '.nfe2-overlay{position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans SC",sans-serif}',
            '.nfe2-modal{position:relative;background:#fff;border-radius:12px;box-shadow:0 24px 70px rgba(0,0,0,.3);width:880px;max-width:96vw;max-height:94vh;display:flex;flex-direction:column;overflow:visible}',
            '.nfe2-header{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #eef0f4}',
            '.nfe2-title{margin:0;font-size:16px;font-weight:600;color:#1f2937;display:flex;align-items:center;gap:8px}',
            '.nfe2-close{background:transparent;border:none;color:#9ca3af;font-size:18px;cursor:pointer;padding:4px 8px;border-radius:6px;display:inline-flex;align-items:center}',
            '.nfe2-close:hover{background:#f3f4f6;color:#374151}',
            '.nfe2-body{padding:16px 18px;overflow:auto}',
            '.nfe2-tabs{display:flex;gap:6px;margin-bottom:14px}',
            '.nfe2-tab{flex:1;padding:9px 0;background:#fff;border:1px solid #e5e7eb;border-radius:8px;color:#6b7280;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;transition:.15s}',
            '.nfe2-tab:hover{border-color:#c7d2fe}',
            '.nfe2-tab.active{background:#4f46e5;border-color:#4f46e5;color:#fff}',
            '.nfe2-panel{display:none}',
            '.nfe2-panel.active{display:block}',
            '.nfe2-upload{display:flex;gap:22px}',
            '.nfe2-vpcol{flex:0 0 350px;display:flex;flex-direction:column;gap:10px}',
            '.nfe2-viewport-wrap{position:relative;width:350px;height:350px;border-radius:10px;overflow:hidden;background:#f1f5f9;border:1px solid #e2e8f0;user-select:none;touch-action:none;margin:0 auto}',
            '.nfe2-viewport-wrap.checker{background:repeating-conic-gradient(#e5e7eb 0% 25%,#fff 0% 50%) 0 0 / 16px 16px}',
            '.nfe2-viewport{display:block;width:350px;height:350px;cursor:grab;position:relative;z-index:2}',
            '.nfe2-viewport.dragging{cursor:grabbing}',
            '.nfe2-crop-frame{position:absolute;inset:0;z-index:3;pointer-events:none;width:350px;height:350px}',
            '.nfe2-crop-frame line,.nfe2-crop-frame rect,.nfe2-crop-frame circle{stroke:#4f46e5;stroke-width:2;fill:none;vector-effect:non-scaling-stroke}',
            '.nfe2-crop-frame .mask{fill:rgba(0,0,0,.4);stroke:none}',
            '.nfe2-crop-frame .grid{stroke:rgba(255,255,255,.35);stroke-width:1;stroke-dasharray:4 4}',
            '.nfe2-crop-frame .crop-border{pointer-events:all;cursor:move}',
            '.nfe2-crop-frame .nfe2-handle{fill:#fff;stroke:#4f46e5;stroke-width:1.5;vector-effect:non-scaling-stroke;pointer-events:auto}',
            '.nfe2-handle[data-h="nw"],.nfe2-handle[data-h="se"]{cursor:nwse-resize}',
            '.nfe2-handle[data-h="ne"],.nfe2-handle[data-h="sw"]{cursor:nesw-resize}',
            '.nfe2-handle[data-h="n"],.nfe2-handle[data-h="s"]{cursor:ns-resize}',
            '.nfe2-handle[data-h="e"],.nfe2-handle[data-h="w"]{cursor:ew-resize}',
            '.nfe2-rot-row{display:flex;align-items:center;gap:8px;margin-bottom:10px}',
            '.nfe2-rot-row .nfe2-rotinput{width:60px}',
            '.nfe2-rotslider{flex:1;-webkit-appearance:none;appearance:none;height:6px;border-radius:3px;background:#e5e7eb;outline:none;cursor:pointer}',
            '.nfe2-rotslider::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:#4f46e5;cursor:pointer}',
            '.nfe2-rotslider::-moz-range-thumb{width:16px;height:16px;border:none;border-radius:50%;background:#4f46e5;cursor:pointer}',
            '.nfe2-dropzone{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#94a3b8;font-size:13px;text-align:center;padding:16px;cursor:pointer;background:#f8fafc;z-index:4}',
            '.nfe2-dropzone.drag{background:#eef2ff;border-color:#a5b4fc}',
            '.nfe2-dropzone i{color:#cbd5e1;display:flex}',
            '.nfe2-vp-tools{display:flex;align-items:center;gap:6px;justify-content:center}',
            '.nfe2-change-img{width:100%;margin-top:10px;padding:8px 12px;border:1px solid #e5e7eb;background:#fff;border-radius:8px;color:#475569;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:.15s}',
            '.nfe2-change-img:hover{background:#f3f4f6;border-color:#cbd5e1}',
            '.nfe2-delete-img{width:100%;margin-top:8px;padding:8px 12px;border:1px solid #fee2e2;background:#fff;border-radius:8px;color:#ef4444;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:.15s}',
            '.nfe2-delete-img:hover{background:#fef2f2;border-color:#fecaca}',
            '.nfe2-toolbtn{width:32px;height:32px;border:1px solid #e5e7eb;background:#fff;border-radius:8px;color:#475569;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:.15s}',
            '.nfe2-toolbtn:hover{background:#f3f4f6;border-color:#cbd5e1}',
            '.nfe2-zoominput{width:58px;padding:5px 6px;border:1px solid #e5e7eb;border-radius:7px;font-size:12px;color:#374151;text-align:center;-moz-appearance:textfield}',
            '.nfe2-zoominput::-webkit-outer-spin-button,.nfe2-zoominput::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}',
            '.nfe2-zoominput:focus{outline:none;border-color:#4f46e5;box-shadow:0 0 0 3px rgba(79,70,229,.12)}',
            '.nfe2-rotinput{width:50px;padding:5px 6px;border:1px solid #e5e7eb;border-radius:7px;font-size:12px;color:#374151;text-align:center;-moz-appearance:textfield}',
            '.nfe2-rotinput::-webkit-outer-spin-button,.nfe2-rotinput::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}',
            '.nfe2-rotinput:focus{outline:none;border-color:#4f46e5;box-shadow:0 0 0 3px rgba(79,70,229,.12)}',
            '.nfe2-side{flex:1;min-width:0;display:flex;flex-direction:column;gap:16px}',
            '.nfe2-field-label{font-size:13px;font-weight:600;color:#374151;margin-bottom:8px;display:flex;align-items:center;gap:6px}',
            '.nfe2-shapes{display:flex;gap:8px}',
            '.nfe2-shapebtn{flex:1;padding:8px 0;border:1px solid #e5e7eb;background:#fff;border-radius:8px;color:#475569;font-size:12px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:5px;transition:.15s}',
            '.nfe2-shapebtn:hover{border-color:#c7d2fe}',
            '.nfe2-shapebtn.active{background:#eef2ff;border-color:#4f46e5;color:#4f46e5}',
            '.nfe2-shapebtn i{display:flex}',
            '.nfe2-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
            '.nfe2-color{width:34px;height:30px;padding:0;border:1px solid #e5e7eb;border-radius:6px;background:none;cursor:pointer}',
            '.nfe2-color:hover{border-color:#4f46e5}',
            '.nfe2-swatches{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:4px}',
            '.nfe2-swatch{width:24px;height:24px;border-radius:50%;border:2px solid #e5e7eb;background-clip:padding-box;cursor:pointer;padding:0;transition:.15s;position:relative;overflow:hidden;display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;line-height:0}',
            '.nfe2-swatch:hover{border-color:#c7d2fe}',
            '.nfe2-swatch.active{border-color:#3b82f6;box-shadow:0 0 0 2px rgba(59,130,246,.25)}',
            '.nfe2-swatch.swatch-transparent{background:repeating-conic-gradient(#e5e7eb 0% 25%,#fff 0% 50%) 0 0 / 10px 10px}',
            '.nfe2-swatch.swatch-custom{background:linear-gradient(135deg,#ef4444,#f97316,#facc15,#22c55e,#38bdf8,#3b82f6,#a855f7);position:relative;border:none;box-shadow:inset 0 0 0 2px #e5e7eb}',
            '.nfe2-swatch.swatch-custom:hover{box-shadow:inset 0 0 0 2px #c7d2fe}',
            '.nfe2-swatch.swatch-custom.active{box-shadow:inset 0 0 0 2px #3b82f6,0 0 0 2px rgba(59,130,246,.25)}',
            '.nfe2-swatch.swatch-custom::after{content:"";position:absolute;inset:0;border-radius:50%;background:var(--custom-bg,transparent)}',
            '.nfe2-preview-box{display:flex;align-items:center;gap:14px}',
            '.nfe2-preview-frame{width:84px;height:84px;border-radius:10px;background:repeating-conic-gradient(#e5e7eb 0% 25%,#fff 0% 50%) 0 0 / 16px 16px;border:1px solid #e5e7eb;overflow:hidden;display:flex;align-items:center;justify-content:center}',
            '.nfe2-preview-canvas{width:84px;height:84px;display:block}',
            '.nfe2-preview-frame img{max-width:100%;max-height:100%;object-fit:contain}',
            '.nfe2-preview-frame svg{width:100%;height:100%}',
            '.nfe2-textarea{width:100%;min-height:150px;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;color:#374151;box-sizing:border-box;font-family:ui-monospace,Menlo,Consolas,monospace;resize:vertical}',
            '.nfe2-textarea:focus,.nfe2-input:focus{outline:none;border-color:#4f46e5;box-shadow:0 0 0 3px rgba(79,70,229,.12)}',
            '.nfe2-input{width:100%;padding:9px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;color:#374151;box-sizing:border-box}',
            '.nfe2-hint{font-size:12px;color:#9ca3af;margin-top:6px}',
            '.nfe2-preview-wrap{margin-top:12px;text-align:center}',
            '.nfe2-hidden{display:none !important}',
            '.nfe2-op-section{margin-top:10px}',
            '.nfe2-op-section .nfe2-field-label{margin-bottom:6px;font-size:12px}',
            '.nfe2-op-slider{flex:1;height:6px;border-radius:3px;background:#e5e7eb;-webkit-appearance:none;appearance:none;cursor:pointer}',
            '.nfe2-op-slider::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:#4f46e5;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.2)}',
            '.nfe2-op-slider::-moz-slider-thumb{width:16px;height:16px;border-radius:50%;background:#4f46e5;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.2)}',
            '.nfe2-op-input{width:50px;padding:5px 6px;border:1px solid #e5e7eb;border-radius:7px;font-size:12px;color:#374151;text-align:center;-moz-appearance:textfield}',
            '.nfe2-op-input::-webkit-outer-spin-button,.nfe2-op-input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}',
            '.nfe2-op-input:focus{outline:none;border-color:#4f46e5;box-shadow:0 0 0 3px rgba(79,70,229,.12)}',
            '.nfe2-color-picker{position:absolute;z-index:20;top:0;left:0;width:280px;padding:14px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.2);display:none}',
            '.nfe2-color-picker.open{display:block}',
            '.nfe2-cp-title{font-size:14px;font-weight:600;color:#374151;margin-bottom:12px}',
            '.nfe2-cp-row{display:flex;align-items:center;gap:8px;margin-bottom:12px}',
            '.nfe2-cp-sv-wrap{position:relative;width:100%;height:120px;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;margin-bottom:10px;cursor:crosshair}',
            '.nfe2-cp-sv{display:block;width:100%;height:100%}',
            '.nfe2-cp-sv-cursor{position:absolute;width:12px;height:12px;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,.3);transform:translate(-50%,-50%);pointer-events:none;display:none}',
            '.nfe2-cp-hue{flex:1;width:100%;min-width:0;height:14px;border-radius:7px;-webkit-appearance:none;appearance:none;background:transparent;cursor:pointer}',
            '.nfe2-cp-hue::-webkit-slider-runnable-track{height:14px;border-radius:7px;background:linear-gradient(to right,#f00 0%,#ff0 17%,#0f0 33%,#0ff 50%,#00f 67%,#f0f 83%,#f00 100%)}',
            '.nfe2-cp-hue::-moz-range-track{height:14px;border-radius:7px;background:linear-gradient(to right,#f00 0%,#ff0 17%,#0f0 33%,#0ff 50%,#00f 67%,#f0f 83%,#f00 100%)}',
            '.nfe2-cp-hue::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:#fff;border:2px solid #4f46e5;box-shadow:0 1px 3px rgba(0,0,0,.2)}',
            '.nfe2-cp-hue::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:#fff;border:2px solid #4f46e5;box-shadow:0 1px 3px rgba(0,0,0,.2)}',
            '.nfe2-cp-rgb-row{align-items:stretch}',
            '.nfe2-cp-channel{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px}',
            '.nfe2-cp-channel-label{font-size:11px;color:#6b7280}',
            '.nfe2-cp-label{font-size:12px;color:#475569;flex-shrink:0}',
            '.nfe2-cp-slider{flex:1;height:6px;border-radius:3px;background:#e5e7eb;-webkit-appearance:none;appearance:none;cursor:pointer}',
            '.nfe2-cp-slider::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:#4f46e5;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.2)}',
            '.nfe2-cp-input{width:46px;padding:5px 6px;border:1px solid #e5e7eb;border-radius:7px;font-size:12px;color:#374151;text-align:center;-moz-appearance:textfield}',
            '.nfe2-cp-input::-webkit-outer-spin-button,.nfe2-cp-input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}',
            '.nfe2-preview-actions{display:flex;flex-direction:column;gap:8px;margin-top:10px}',
            '.nfe2-preview-actions .nfe2-change-img,.nfe2-preview-actions .nfe2-delete-img{margin-top:0}',
            '.nfe2-cp-unit{font-size:12px;color:#9ca3af}',
            '.nfe2-footer{display:flex;justify-content:flex-end;align-items:center;padding:12px 18px;border-top:1px solid #eef0f4;gap:10px}',
            '.nfe2-apply-btn{padding:8px 20px;border:none;border-radius:8px;background:#4f46e5;color:#fff;font-size:13px;font-weight:500;cursor:pointer;transition:.15s}',
            '.nfe2-apply-btn:hover{background:#4338ca}',
            '.nfe2-toast{position:absolute;top:14px;left:50%;transform:translateX(-50%);padding:8px 20px;border-radius:20px;color:#fff;font-size:13px;font-weight:500;z-index:60;box-shadow:0 6px 18px rgba(0,0,0,.2);animation:nfe2-toast-in .18s ease;pointer-events:none;white-space:nowrap}',
            '.nfe2-toast-ok{background:#16a34a}',
            '.nfe2-toast-err{background:#dc2626}',
            '@keyframes nfe2-toast-in{from{opacity:0;transform:translateX(-50%) translateY(-8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}'
        ].join('\n');
        var s = document.createElement('style');
        s.id = STYLE_ID;
        s.textContent = css;
        document.head.appendChild(s);
    }

    function roundRectPath(ctx, x, y, w, h, r) {
        r = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    // 颜色工具：hex/rgb/rgba 互转
    function hexToRgb(hex) {
        var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (m) return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
        m = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(hex);
        if (m) return { r: parseInt(m[1]+m[1], 16), g: parseInt(m[2]+m[2], 16), b: parseInt(m[3]+m[3], 16) };
        return null;
    }
    function rgbToHex(r, g, b) {
        return '#' + ((1 << 24) + (clamp(Math.round(r), 0, 255) << 16) + (clamp(Math.round(g), 0, 255) << 8) + clamp(Math.round(b), 0, 255)).toString(16).slice(1);
    }
    function parseColor(v) {
        if (!v) return null;
        var hex = hexToRgb(v);
        if (hex) return { r: hex.r, g: hex.g, b: hex.b, a: 1 };
        var m = /rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?:,\s*(\d+(?:\.\d+)?)\s*)?\)/i.exec(v);
        if (m) return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] != null ? Number(m[4]) : 1 };
        return null;
    }
    function colorToString(c) {
        if (!c) return '';
        if (c.a >= 0.999) return rgbToHex(c.r, c.g, c.b);
        return 'rgba(' + Math.round(c.r) + ',' + Math.round(c.g) + ',' + Math.round(c.b) + ',' + Math.round(c.a * 100) / 100 + ')';
    }
    function rgbToHsv(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, h = 0, s = 0, v = max;
        if (d) {
            s = max === 0 ? 0 : d / max;
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return { h: h * 360, s: s, v: v };
    }
    function hsvToRgb(h, s, v) {
        h /= 360;
        var i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s), r, g, b;
        switch (i % 6) {
            case 0: r = v; g = t; b = p; break;
            case 1: r = q; g = v; b = p; break;
            case 2: r = p; g = v; b = t; break;
            case 3: r = p; g = q; b = v; break;
            case 4: r = t; g = p; b = v; break;
            case 5: r = v; g = p; b = q; break;
        }
        return { r: r * 255, g: g * 255, b: b * 255 };
    }

    function openFaviconEditor(opts) {
        opts = opts || {};
        var current = opts.value || '';
        var initMode = 'upload';
        if (/^\s*<svg/i.test(current)) initMode = 'svg';
        else if (current && !/^data:/i.test(current)) initMode = 'url';
        var hasInitImage = (initMode === 'upload' && /^data:image\//i.test(current));
        var meta = opts.meta || {};

        var state = {
            mode: initMode,
            viewport: VIEWPORT,
            outputSize: opts.outputSize || SUGGEST_SIZE,
            img: null, imgW: 0, imgH: 0,
            zoom: meta.zoom != null ? meta.zoom : 1,
            baseFit: 1,
            s: 1,
            tx: meta.tx != null ? meta.tx : 0,
            ty: meta.ty != null ? meta.ty : 0,
            rot: meta.rot != null ? meta.rot : 0,
            shape: meta.shape || 'square',
            bg: meta.bg != null ? meta.bg : '',
            opacity: meta.opacity != null ? meta.opacity : 1,
            crop: meta.crop || { x: CROP_MARGIN, y: CROP_MARGIN, w: VIEWPORT - 2 * CROP_MARGIN, h: VIEWPORT - 2 * CROP_MARGIN },
            originalImage: meta.originalImage || '',
            svgText: (initMode === 'svg') ? current : '',
            urlValue: (initMode === 'url') ? current : ''
        };

        injectStyle();

        // 单例：避免叠加多个弹窗
        if (global.__nfe2Current && global.__nfe2Current.parentNode) {
            global.__nfe2Current.parentNode.removeChild(global.__nfe2Current);
        }

        var overlay = document.createElement('div');
        overlay.className = 'nfe2-overlay';
        overlay.innerHTML = [
            '<div class="nfe2-modal">',
            '  <div class="nfe2-header">',
            '    <h3 class="nfe2-title">' + ICON.image + ' ' + esc(opts.title || '浏览器标签图标') + '</h3>',
            '    <button class="nfe2-close" id="' + NS + 'close">' + ICON.close + '</button>',
            '  </div>',
            '  <div class="nfe2-body">',
            '    <div class="nfe2-tabs">',
            '      <button class="nfe2-tab" data-mode="upload">' + ICON.image + ' 上传图片</button>',
            '      <button class="nfe2-tab" data-mode="svg">&lt;/&gt; SVG 代码</button>',
            '      <button class="nfe2-tab" data-mode="url">🔗 URL 地址</button>',
            '    </div>',
            // —— 上传图片面板 ——
            '    <div class="nfe2-panel" data-panel="upload">',
            '      <canvas class="nfe2-preview-canvas" id="' + NS + 'out" width="512" height="512" style="display:none"></canvas>',
            '      <div class="nfe2-upload">',
            '        <div class="nfe2-vpcol">',
            '          <div class="nfe2-viewport-wrap" id="' + NS + 'vpwrap">',
            '            <canvas class="nfe2-viewport" id="' + NS + 'vp" width="' + VIEWPORT + '" height="' + VIEWPORT + '"></canvas>',
            '            <svg class="nfe2-crop-frame" id="' + NS + 'cropframe" viewBox="0 0 ' + VIEWPORT + ' ' + VIEWPORT + '" preserveAspectRatio="none">',
            '              <defs><mask id="' + NS + 'mask"><rect width="' + VIEWPORT + '" height="' + VIEWPORT + '" fill="#fff"/><rect id="' + NS + 'maskHole" x="' + CROP_MARGIN + '" y="' + CROP_MARGIN + '" width="' + (VIEWPORT - 2 * CROP_MARGIN) + '" height="' + (VIEWPORT - 2 * CROP_MARGIN) + '" rx="0" fill="#000"/></mask></defs>',
            '              <rect class="mask" width="' + VIEWPORT + '" height="' + VIEWPORT + '" mask="url(#' + NS + 'mask)"/>',
            '              <rect class="crop-border" id="' + NS + 'cropBorder" x="' + CROP_MARGIN + '" y="' + CROP_MARGIN + '" width="' + (VIEWPORT - 2 * CROP_MARGIN) + '" height="' + (VIEWPORT - 2 * CROP_MARGIN) + '" rx="0"/>',
            '              <line class="grid" id="' + NS + 'gV1" x1="0" y1="0" x2="0" y2="0"/>',
            '              <line class="grid" id="' + NS + 'gV2" x1="0" y1="0" x2="0" y2="0"/>',
            '              <line class="grid" id="' + NS + 'gH1" x1="0" y1="0" x2="0" y2="0"/>',
            '              <line class="grid" id="' + NS + 'gH2" x1="0" y1="0" x2="0" y2="0"/>',
            '              <rect class="nfe2-handle" data-h="nw" id="' + NS + 'h-nw" x="0" y="0" width="12" height="12"/>',
            '              <rect class="nfe2-handle" data-h="ne" id="' + NS + 'h-ne" x="0" y="0" width="12" height="12"/>',
            '              <rect class="nfe2-handle" data-h="se" id="' + NS + 'h-se" x="0" y="0" width="12" height="12"/>',
            '              <rect class="nfe2-handle" data-h="sw" id="' + NS + 'h-sw" x="0" y="0" width="12" height="12"/>',
            '              <rect class="nfe2-handle" data-h="n" id="' + NS + 'h-n" x="0" y="0" width="12" height="12"/>',
            '              <rect class="nfe2-handle" data-h="s" id="' + NS + 'h-s" x="0" y="0" width="12" height="12"/>',
            '              <rect class="nfe2-handle" data-h="e" id="' + NS + 'h-e" x="0" y="0" width="12" height="12"/>',
            '              <rect class="nfe2-handle" data-h="w" id="' + NS + 'h-w" x="0" y="0" width="12" height="12"/>',
            '            </svg>',
            '            <div class="nfe2-dropzone" id="' + NS + 'drop"><i>' + ICON.image + '</i><span>点击选择，或将图片拖拽到此处</span></div>',
            '          </div>',
            '          <div class="nfe2-preview-actions">',
            '            <button type="button" class="nfe2-change-img" id="' + NS + 'changeImg">' + ICON.image + ' 选择图片</button>',
            '            <button type="button" class="nfe2-delete-img" id="' + NS + 'deleteImg">' + ICON.trash + ' 删除图片</button>',
            '          </div>',
            '        </div>',
            '        <div class="nfe2-side">',
            '          <div>',
            '            <div class="nfe2-field-label">形状</div>',
            '            <div class="nfe2-shapes">',
            '              <button class="nfe2-shapebtn" data-shape="square"><i>' + icon('<rect x="3" y="3" width="18" height="18" rx="1"/>') + '</i>方形</button>',
            '              <button class="nfe2-shapebtn" data-shape="rounded"><i>' + icon('<rect x="3" y="3" width="18" height="18" rx="5"/>') + '</i>圆角</button>',
            '              <button class="nfe2-shapebtn" data-shape="circle"><i>' + icon('<circle cx="12" cy="12" r="9"/>') + '</i>圆形</button>',
            '            </div>',
            '          </div>',
            '          <div>',
            '            <div class="nfe2-field-label">缩放</div>',
            '            <div class="nfe2-vp-tools">',
            '              <button class="nfe2-toolbtn" id="' + NS + 'zoomout" title="缩小">' + ICON.minus + '</button>',
            '              <input type="number" class="nfe2-zoominput" id="' + NS + 'zoominput" value="100" min="20" max="800" title="缩放百分比，可直接输入">',
            '              <button class="nfe2-toolbtn" id="' + NS + 'zoomin" title="放大">' + ICON.plus + '</button>',
            '              <button class="nfe2-toolbtn" id="' + NS + 'fit" title="重置位置/缩放/旋转">' + ICON.fit + '</button>',
            '            </div>',
            '          </div>',
            '          <div>',
            '            <div class="nfe2-field-label">旋转</div>',
            '            <div class="nfe2-rot-row">',
            '              <input type="number" class="nfe2-rotinput" id="' + NS + 'rotinput" value="0" min="-180" max="180" step="1" title="旋转角度 -180~180°">',
            '              <input type="range" class="nfe2-rotslider" id="' + NS + 'rotslider" min="-180" max="180" step="1" value="0" title="拖动旋转">',
            '              <button class="nfe2-toolbtn" id="' + NS + 'rotL" title="顺时针90°">' + ICON.rotate + '</button>',
            '            </div>',
            '          </div>',
            '          <div>',
            '            <div class="nfe2-field-label">不透明度</div>',
            '            <div class="nfe2-opacity-row" style="display:flex;align-items:center;gap:10px">',
            '              <input type="range" class="nfe2-op-slider" id="' + NS + 'opslider" min="0" max="100" step="1" value="100" style="flex:1" title="拖动调整不透明度，悬停滚轮微调">',
            '              <input type="number" class="nfe2-op-input" id="' + NS + 'opinput" min="0" max="100" step="1" value="100" style="width:56px;text-align:center" title="不透明度（%）">',
            '              <span style="font-size:12px;color:var(--text-muted)">%</span>',
            '            </div>',
            '          </div>',
            '          <div>',
            '            <div class="nfe2-field-label">背景</div>',
            '            <div class="nfe2-swatches" id="' + NS + 'swatches">',
            '              <button type="button" class="nfe2-swatch swatch-transparent" data-bg="" title="透明背景"></button>',
            '              <button type="button" class="nfe2-swatch" data-bg="#ef4444" style="background:#ef4444" title="红色"></button>',
            '              <button type="button" class="nfe2-swatch" data-bg="#f97316" style="background:#f97316" title="橙色"></button>',
            '              <button type="button" class="nfe2-swatch" data-bg="#facc15" style="background:#facc15" title="黄色"></button>',
            '              <button type="button" class="nfe2-swatch" data-bg="#22c55e" style="background:#22c55e" title="绿色"></button>',
            '              <button type="button" class="nfe2-swatch" data-bg="#38bdf8" style="background:#38bdf8" title="浅蓝"></button>',
            '              <button type="button" class="nfe2-swatch" data-bg="#3b82f6" style="background:#3b82f6" title="蓝色"></button>',
            '              <button type="button" class="nfe2-swatch" data-bg="#a855f7" style="background:#a855f7" title="紫色"></button>',
            '              <button type="button" class="nfe2-swatch swatch-custom" id="' + NS + 'customBg" title="自定义颜色"></button>',
            '            </div>',
            '          </div>',
            '          <div>',
            '            <div class="nfe2-field-label">输出尺寸</div>',
            '            <div class="nfe2-row">',
            '              <input type="number" class="nfe2-zoominput" id="' + NS + 'outSize" min="16" max="512" value="' + state.outputSize + '" style="width:72px">',
            '              <span style="font-size:13px;color:#475569">px</span>',
            '              <span class="nfe2-hint">推荐 64</span>',
            '            </div>',
            '          </div>',
            '        </div>',
            '      </div>',
            '    </div>',
            // —— SVG 面板 ——
            '    <div class="nfe2-panel" data-panel="svg">',
            '      <textarea class="nfe2-textarea" id="' + NS + 'svg" placeholder="<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 32 32\' width=\'32\' height=\'32\'><circle cx=\'16\' cy=\'16\' r=\'14\' fill=\'#4f46e5\'/></svg>">' + esc(state.svgText) + '</textarea>',
            '      <div class="nfe2-hint">SVG 会直接以内联方式写入页面 favicon，建议 viewBox 为正方形，推荐 64×64</div>',
            '      <div class="nfe2-preview-wrap ' + (state.svgText ? '' : 'nfe2-hidden') + '" id="' + NS + 'svgPrevWrap"><div class="nfe2-preview-frame" id="' + NS + 'svgPrev"></div></div>',
            '    </div>',
            // —— URL 面板 ——
            '    ' +
            '<div class="nfe2-panel" data-panel="url">',
            '      <input type="text" class="nfe2-input" id="' + NS + 'url" value="' + escAttr(state.urlValue) + '" placeholder="https://example.com/favicon.png  或  /assets/icon.png">',
            '      <div class="nfe2-hint">推荐 64×64 PNG/ICO，支持绝对 URL、相对路径、data: base64 内联</div>',
            '      <div class="nfe2-preview-wrap ' + (state.urlValue ? '' : 'nfe2-hidden') + '" id="' + NS + 'urlPrevWrap"><div class="nfe2-preview-frame"><img id="' + NS + 'urlPrev" src="' + escAttr(state.urlValue) + '" alt=""></div></div>',
            '    </div>',
            '  </div>',
            '  <div class="nfe2-footer">',
            '    <button type="button" class="nfe2-apply-btn" id="' + NS + 'applyBtn">应用</button>',
            '  </div>',
            '  <div class="nfe2-color-picker" id="' + NS + 'colorPicker">',
            '    <div class="nfe2-cp-title">自定义颜色</div>',
            '    <div class="nfe2-cp-sv-wrap" id="' + NS + 'cpSvWrap">',
            '      <canvas class="nfe2-cp-sv" id="' + NS + 'cpSv" width="252" height="120"></canvas>',
            '      <div class="nfe2-cp-sv-cursor" id="' + NS + 'cpSvCursor"></div>',
            '    </div>',
            '    <div class="nfe2-cp-row">',
            '      <input type="range" class="nfe2-cp-hue" id="' + NS + 'cpHue" min="0" max="360" step="1" value="0">',
            '    </div>',
            '    <div class="nfe2-cp-row nfe2-cp-rgb-row">',
            '      <div class="nfe2-cp-channel"><input type="number" class="nfe2-cp-input" id="' + NS + 'cpR" min="0" max="255" step="1" value="255"><span class="nfe2-cp-channel-label">R</span></div>',
            '      <div class="nfe2-cp-channel"><input type="number" class="nfe2-cp-input" id="' + NS + 'cpG" min="0" max="255" step="1" value="255"><span class="nfe2-cp-channel-label">G</span></div>',
            '      <div class="nfe2-cp-channel"><input type="number" class="nfe2-cp-input" id="' + NS + 'cpB" min="0" max="255" step="1" value="255"><span class="nfe2-cp-channel-label">B</span></div>',
            '    </div>',
            '    <div class="nfe2-cp-row">',
            '      <span class="nfe2-cp-label">不透明度</span>',
            '      <input type="range" class="nfe2-cp-slider" id="' + NS + 'cpAlphaSlider" min="0" max="100" step="1" value="100">',
            '      <input type="number" class="nfe2-cp-input" id="' + NS + 'cpAlphaInput" min="0" max="100" step="1" value="100">',
            '      <span class="nfe2-cp-unit">%</span>',
            '    </div>',
            '  </div>',
            '</div>'
        ].join('\n');
        document.body.appendChild(overlay);
        global.__nfe2Current = overlay;

        function $(k) { return byId(NS + k); }
        var els = {
            overlay: overlay,
            fileInput: null,
            vp: $('vp'), vpwrap: $('vpwrap'), drop: $('drop'),
            cropframe: $('cropframe'), maskHole: $('maskHole'), cropBorder: $('cropBorder'),
            gV1: $('gV1'), gV2: $('gV2'), gH1: $('gH1'), gH2: $('gH2'),
            h_nw: $('h-nw'), h_ne: $('h-ne'), h_se: $('h-se'), h_sw: $('h-sw'),
            h_n: $('h-n'), h_s: $('h-s'), h_e: $('h-e'), h_w: $('h-w'),
            zoomIn: $('zoomin'), zoomOut: $('zoomout'), rotL: $('rotL'), fit: $('fit'), zoomInput: $('zoominput'), rotInput: $('rotinput'), rotSlider: $('rotslider'), changeImg: $('changeImg'), deleteImg: $('deleteImg'),
            opSlider: $('opslider'), opInput: $('opinput'), outSize: $('outSize'),
            swatches: $('swatches'), customBg: $('customBg'),
            colorPicker: $('colorPicker'), cpSv: $('cpSv'), cpSvCursor: $('cpSvCursor'), cpHue: $('cpHue'), cpR: $('cpR'), cpG: $('cpG'), cpB: $('cpB'), cpAlphaSlider: $('cpAlphaSlider'), cpAlphaInput: $('cpAlphaInput'),
            out: $('out'),
            svg: $('svg'), svgPrevWrap: $('svgPrevWrap'), svgPrev: $('svgPrev'),
            url: $('url'), urlPrevWrap: $('urlPrevWrap'), urlPrev: $('urlPrev'),
            close: $('close'), applyBtn: $('applyBtn'),
            tabs: Array.prototype.slice.call(overlay.querySelectorAll('.nfe2-tab')),
            panels: Array.prototype.slice.call(overlay.querySelectorAll('.nfe2-panel')),
            shapeBtns: Array.prototype.slice.call(overlay.querySelectorAll('.nfe2-shapebtn'))
        };
        var vpCtx = els.vp.getContext('2d');
        var outCtx = els.out.getContext('2d');
        var dpr = Math.max(1, Math.min(3, global.devicePixelRatio || 1));
        els.vp.width = VIEWPORT * dpr; els.vp.height = VIEWPORT * dpr;
        els.vp.style.width = VIEWPORT + 'px'; els.vp.style.height = VIEWPORT + 'px';

        // 隐藏的文件选择（默认不显示按钮，用 dropzone 触发）
        var fileInput = document.createElement('input');
        fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.className = 'nfe2-hidden';
        overlay.appendChild(fileInput);
        els.fileInput = fileInput;

        // —— 裁剪框可视化（可拖动、可缩放；裁剪框外半透明暗化，框内即最终图标）——
        function updateCropFrame() {
            var c = state.crop, x = c.x, y = c.y, w = c.w, h = c.h;
            var hole = els.maskHole, border = els.cropBorder;
            hole.setAttribute('x', x + ''); hole.setAttribute('y', y + '');
            hole.setAttribute('width', w + ''); hole.setAttribute('height', h + '');
            border.setAttribute('x', x + ''); border.setAttribute('y', y + '');
            border.setAttribute('width', w + ''); border.setAttribute('height', h + '');
            var rx = '0', ry = '0';
            if (state.shape === 'circle') { rx = (w / 2) + ''; ry = (h / 2) + ''; }
            else if (state.shape === 'rounded') { var rr = Math.min(w, h) * 0.16; rx = rr + ''; ry = rr + ''; }
            hole.setAttribute('rx', rx); hole.setAttribute('ry', ry);
            border.setAttribute('rx', rx); border.setAttribute('ry', ry);
            // 九宫格辅助线（裁剪框内部三等分）
            var tw = w / 3, th = h / 3;
            function setLine(el, x1, y1, x2, y2) {
                el.setAttribute('x1', x1 + ''); el.setAttribute('y1', y1 + '');
                el.setAttribute('x2', x2 + ''); el.setAttribute('y2', y2 + '');
            }
            setLine(els.gV1, x + tw, y, x + tw, y + h);
            setLine(els.gV2, x + 2 * tw, y, x + 2 * tw, y + h);
            setLine(els.gH1, x, y + th, x + w, y + th);
            setLine(els.gH2, x, y + 2 * th, x + w, y + 2 * th);
            // 八个缩放手柄
            var H = 12, hs = H / 2;
            var pts = {
                nw: [x, y], n: [x + w / 2, y], ne: [x + w, y],
                e: [x + w, y + h / 2], se: [x + w, y + h], s: [x + w / 2, y + h],
                sw: [x, y + h], w: [x, y + h / 2]
            };
            for (var k in pts) {
                var el = els['h_' + k];
                if (el) { el.setAttribute('x', (pts[k][0] - hs) + ''); el.setAttribute('y', (pts[k][1] - hs) + ''); el.setAttribute('width', H + ''); el.setAttribute('height', H + ''); }
            }
        }

        // —— 渲染 ——
        function drawImageInViewport(ctx) {
            var V = state.viewport;
            ctx.save();
            ctx.globalAlpha = state.opacity != null ? state.opacity : 1;
            ctx.translate(state.tx + V / 2, state.ty + V / 2);
            ctx.rotate(state.rot * Math.PI / 180);
            ctx.scale(state.s, state.s);
            ctx.translate(-state.imgW / 2, -state.imgH / 2);
            try { ctx.drawImage(state.img, 0, 0); } catch (e) {}
            ctx.restore();
        }
        // 把裁剪框区域按形状裁切（方/圆角/圆，圆形用椭圆以匹配边框）
        function shapeClipCrop(ctx, x, y, w, h) {
            ctx.beginPath();
            if (state.shape === 'circle') ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
            else if (state.shape === 'rounded') roundRectPath(ctx, x, y, w, h, Math.min(w, h) * 0.16);
            else ctx.rect(x, y, w, h);
            ctx.clip();
        }
        // 通用绘制：extract=true 将裁剪框区域映射到最终画布，并按形状裁切（"实际效果"）；
        // extract=false 在取景框内绘制整张图片，裁剪框外由 SVG 遮罩半透明暗化但仍可见图片。
        function paint(ctx, o) {
            var V = state.viewport, px = o.pxScale, extract = o.extract, sz = o.size;
            ctx.setTransform(px, 0, 0, px, 0, 0);
            ctx.clearRect(0, 0, extract ? sz : V, extract ? sz : V);
            if (!state.img && !state.bg) return;
            if (extract) {
                var c = state.crop;
                ctx.save();
                ctx.scale(sz / c.w, sz / c.h);
                ctx.translate(-c.x, -c.y);
                if (state.bg) { ctx.fillStyle = state.bg; ctx.fillRect(c.x, c.y, c.w, c.h); }
                if (state.img) {
                    shapeClipCrop(ctx, c.x, c.y, c.w, c.h);
                    drawImageInViewport(ctx);
                }
                ctx.restore();
            } else {
                if (state.bg) { ctx.fillStyle = state.bg; ctx.fillRect(0, 0, V, V); }
                if (state.img) drawImageInViewport(ctx);
            }
        }
        function renderViewport() { paint(vpCtx, { extract: false, pxScale: dpr }); }
        function renderOutput() {
            var sz = state.outputSize || OUT_SIZE;
            if (els.out.width !== sz) { els.out.width = sz; els.out.height = sz; }
            paint(outCtx, { extract: true, size: sz, pxScale: 1 });
        }
        function renderAll() {
            if (state.img) { renderViewport(); renderOutput(); }
            if (document.activeElement !== els.zoomInput) els.zoomInput.value = Math.round(state.zoom * 100);
            if (document.activeElement !== els.rotInput) els.rotInput.value = displayRot(state.rot);
            if (document.activeElement !== els.rotSlider) els.rotSlider.value = displayRot(state.rot);
            var opPct = Math.round(((state.opacity != null ? state.opacity : 1) * 100));
            if (document.activeElement !== els.opInput) els.opInput.value = opPct;
            if (document.activeElement !== els.opSlider) els.opSlider.value = opPct;
        }

        function setMode(m) {
            state.mode = m;
            els.tabs.forEach(function (t) { t.classList.toggle('active', t.dataset.mode === m); });
            els.panels.forEach(function (p) { p.classList.toggle('active', p.dataset.panel === m); });
        }
        els.tabs.forEach(function (t) { t.addEventListener('click', function () { setMode(t.dataset.mode); }); });

        // —— 图片加载 ——
        function loadImage(src, keepTransforms, fitMode) {
            var img = new Image();
            img.onload = function () {
                state.img = img; state.imgW = img.naturalWidth || img.width; state.imgH = img.naturalHeight || img.height;
                state.baseFit = VIEWPORT / Math.max(state.imgW, state.imgH);
                if (!keepTransforms) {
                    state.zoom = 1; state.s = state.baseFit; state.tx = 0; state.ty = 0; state.rot = 0;
                    // 新图片：默认自动适配，把整张图完整放入裁剪框（不裁切）
                    if (fitMode === 'crop') {
                        var cropInner = VIEWPORT - 2 * CROP_MARGIN;
                        state.zoom = (cropInner / Math.max(state.imgW, state.imgH)) / state.baseFit;
                        state.s = state.baseFit * state.zoom;
                    }
                } else {
                    state.s = state.baseFit * state.zoom;
                }
                els.drop.classList.add('nfe2-hidden');
                updateCropFrame();
                renderAll();
            };
            img.onerror = function () { if (typeof opts.onError === 'function') opts.onError(new Error('图片加载失败')); };
            img.src = src;
        }

        // 取景框交互：拖拽平移
        var dragging = false, sx = 0, sy = 0, tx0 = 0, ty0 = 0;
        els.vp.addEventListener('pointerdown', function (e) {
            if (!state.img) return;
            dragging = true; sx = e.clientX; sy = e.clientY; tx0 = state.tx; ty0 = state.ty;
            els.vp.classList.add('dragging');
            try { els.vp.setPointerCapture(e.pointerId); } catch (er) {}
        });
        els.vp.addEventListener('pointermove', function (e) {
            if (!dragging) return;
            state.tx = tx0 + (e.clientX - sx);
            state.ty = ty0 + (e.clientY - sy);
            renderAll();
        });
        function endDrag() { dragging = false; els.vp.classList.remove('dragging'); }
        els.vp.addEventListener('pointerup', endDrag);
        els.vp.addEventListener('pointercancel', endDrag);
        // 滚轮缩放绑在取景框容器上：光标在裁剪框内（被边框拦截）也能缩放图片
        els.vpwrap.addEventListener('wheel', function (e) {
            if (!state.img) return;
            e.preventDefault();
            var step = e.deltaY < 0 ? 5 : -5;
            state.zoom = clamp((Math.round(state.zoom * 100) + step) / 100, 0.2, 8);
            state.s = state.baseFit * state.zoom;
            renderAll();
        }, { passive: false });

        // 裁剪框交互：框内拖动移动，八向手柄缩放
        function clientToLogical(e) {
            var rect = els.vp.getBoundingClientRect();
            var sx = VIEWPORT / rect.width, sy = VIEWPORT / rect.height;
            return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
        }
        var HANDLE_HS = 7, MIN_CROP = 30, cropDrag = null;
        function hitHandle(p) {
            var c = state.crop;
            var pts = {
                nw: [c.x, c.y], n: [c.x + c.w / 2, c.y], ne: [c.x + c.w, c.y],
                e: [c.x + c.w, c.y + c.h / 2], se: [c.x + c.w, c.y + c.h],
                s: [c.x + c.w / 2, c.y + c.h], sw: [c.x, c.y + c.h], w: [c.x, c.y + c.h / 2]
            };
            var order = ['nw', 'ne', 'se', 'sw', 'n', 'e', 's', 'w'];
            for (var i = 0; i < order.length; i++) {
                var m = order[i], pp = pts[m];
                if (Math.abs(p.x - pp[0]) <= HANDLE_HS && Math.abs(p.y - pp[1]) <= HANDLE_HS) return m;
            }
            return null;
        }
        function onCropDown(e) {
            if (!state.img) return;
            var p = clientToLogical(e);
            var c = state.crop, h = hitHandle(p);
            if (h) {
                cropDrag = { mode: h, sx: p.x, sy: p.y, c: { x: c.x, y: c.y, w: c.w, h: c.h } };
            } else if (p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h)
                cropDrag = { mode: 'move', sx: p.x, sy: p.y, c: { x: c.x, y: c.y, w: c.w, h: c.h } };
            else return;
            e.preventDefault(); e.stopPropagation();
            document.addEventListener('mousemove', onCropMove);
            document.addEventListener('mouseup', onCropUp);
        }
        function onCropMove(e) {
            if (!cropDrag) return;
            var p = clientToLogical(e);
            var dx = p.x - cropDrag.sx, dy = p.y - cropDrag.sy;
            var c = cropDrag.c, m = cropDrag.mode;
            var x = c.x, y = c.y, w = c.w, h = c.h;
            if (m === 'move') { x = c.x + dx; y = c.y + dy; }
            else {
                if (m.indexOf('w') >= 0) { x = c.x + dx; w = c.w - dx; }
                if (m.indexOf('e') >= 0) { w = c.w + dx; }
                if (m.indexOf('n') >= 0) { y = c.y + dy; h = c.h - dy; }
                if (m.indexOf('s') >= 0) { h = c.h + dy; }
            }
            if (w < 0) { x += w; w = -w; }
            if (h < 0) { y += h; h = -h; }
            if (w < MIN_CROP) w = MIN_CROP;
            if (h < MIN_CROP) h = MIN_CROP;
            if (x < 0) { w += x; x = 0; }
            if (y < 0) { h += y; y = 0; }
            if (x + w > VIEWPORT) { w = VIEWPORT - x; }
            if (y + h > VIEWPORT) { h = VIEWPORT - y; }
            if (state.shape === 'circle') { var s2 = Math.min(w, h); w = s2; h = s2; }
            state.crop = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
            updateCropFrame();
            renderOutput();
        }
        function onCropUp() {
            cropDrag = null;
            document.removeEventListener('mousemove', onCropMove);
            document.removeEventListener('mouseup', onCropUp);
        }
        els.cropframe.addEventListener('mousedown', onCropDown);

        // 缩放工具按钮 + 手动输入
        function setZoomFromPercent(pct) {
            var val = parseFloat(pct);
            if (isNaN(val)) return;
            state.zoom = clamp(val / 100, 0.2, 8);
            state.s = state.baseFit * state.zoom;
            renderAll();
        }
        els.zoomIn.addEventListener('click', function () { if (!state.img) return; state.zoom = clamp((Math.round(state.zoom * 100) + 5) / 100, 0.2, 8); state.s = state.baseFit * state.zoom; renderAll(); });
        els.zoomOut.addEventListener('click', function () { if (!state.img) return; state.zoom = clamp((Math.round(state.zoom * 100) - 5) / 100, 0.2, 8); state.s = state.baseFit * state.zoom; renderAll(); });
        els.zoomInput.addEventListener('input', function () { setZoomFromPercent(els.zoomInput.value); });
        els.zoomInput.addEventListener('blur', function () { renderAll(); });
        els.zoomInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { setZoomFromPercent(els.zoomInput.value); els.zoomInput.blur(); } });
        function normRot(deg) { return ((Math.round(deg) % 360) + 360) % 360; }
        function displayRot(deg) {
            deg = ((Math.round(deg) % 360) + 360) % 360;
            if (deg > 180) deg -= 360;
            return deg;
        }
        function setRot(deg) {
            state.rot = normRot(deg);
            renderAll();
        }
        function inputToRot(v) {
            // 用户输入/滑块范围 -180~180，负数等价于 360+v
            v = parseFloat(v);
            if (isNaN(v)) return null;
            if (v < -180) v = -180;
            if (v > 180) v = 180;
            return v < 0 ? 360 + v : v;
        }
        els.rotInput.addEventListener('input', function () {
            var r = inputToRot(els.rotInput.value);
            if (r !== null) setRot(r);
        });
        els.rotInput.addEventListener('blur', function () { els.rotInput.value = displayRot(state.rot); });
        els.rotInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { var r = inputToRot(els.rotInput.value); if (r !== null) setRot(r); els.rotInput.blur(); } });
        els.rotSlider.addEventListener('input', function () {
            var r = inputToRot(els.rotSlider.value);
            if (r !== null) setRot(r);
        });
        els.rotSlider.addEventListener('wheel', function (e) {
            if (!state.img) return;
            e.preventDefault();
            var cur = displayRot(state.rot);
            var delta = e.deltaY > 0 ? -5 : 5;
            var next = cur + delta;
            if (next < -180) next = -180;
            if (next > 180) next = 180;
            setRot(inputToRot(next));
        }, { passive: false });
        els.rotL.addEventListener('click', function () { if (!state.img) return; setRot(state.rot + 90); });
        els.fit.addEventListener('click', function () { if (!state.img) return; state.zoom = 1; state.s = state.baseFit; state.tx = 0; state.ty = 0; state.rot = 0; renderAll(); });

        // 形状
        function setShape(sh) {
            state.shape = sh;
            els.shapeBtns.forEach(function (b) { b.classList.toggle('active', b.dataset.shape === sh); });
            updateCropFrame();
            if (state.img) renderAll();
        }
        els.shapeBtns.forEach(function (b) { b.addEventListener('click', function () { setShape(b.dataset.shape); }); });

        // 背景：色块矩阵（透明 + 7 预设色 + 自定义）。自定义颜色支持 RGBA 不透明度。
        function isPreset(v) {
            return Array.prototype.some.call(els.swatches.querySelectorAll('[data-bg]'), function (s) { return s.dataset.bg === v; });
        }
        function syncBgUI() {
            var sws = els.swatches.querySelectorAll('.nfe2-swatch');
            Array.prototype.forEach.call(sws, function (sw) {
                var v = sw.dataset ? sw.dataset.bg : undefined;
                sw.classList.toggle('active', (v !== undefined) && (v === state.bg));
            });
            var custom = els.swatches.querySelector('.swatch-custom');
            var customActive = !!state.bg && !isPreset(state.bg);
            if (custom) {
                custom.classList.toggle('active', customActive);
                if (customActive) custom.style.setProperty('--custom-bg', state.bg);
                else custom.style.removeProperty('--custom-bg');
            }
        }
        function applyBg() {
            els.vpwrap.classList.toggle('checker', !state.bg);
            syncBgUI();
            if (state.img) renderAll();
        }
        function setBg(v) {
            state.bg = v || '';
            applyBg();
        }
        Array.prototype.forEach.call(els.swatches.querySelectorAll('[data-bg]'), function (sw) {
            sw.addEventListener('click', function () { setBg(sw.dataset.bg); });
        });

        // 自定义颜色弹窗（含 HSV 色板 + 色相条 + RGB + 不透明度）
        var cpTemp = { h: 0, s: 0, v: 1, a: 100 };
        function drawSvCanvas(hue) {
            var canvas = els.cpSv, ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
            var pure = hsvToRgb(hue, 1, 1);
            var grH = ctx.createLinearGradient(0, 0, w, 0);
            grH.addColorStop(0, '#fff');
            grH.addColorStop(1, 'rgb(' + Math.round(pure.r) + ',' + Math.round(pure.g) + ',' + Math.round(pure.b) + ')');
            ctx.fillStyle = grH; ctx.fillRect(0, 0, w, h);
            var grV = ctx.createLinearGradient(0, 0, 0, h);
            grV.addColorStop(0, 'rgba(0,0,0,0)');
            grV.addColorStop(1, 'rgba(0,0,0,1)');
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = grV; ctx.fillRect(0, 0, w, h);
            ctx.globalCompositeOperation = 'source-over';
        }
        function updateCpCursor() {
            var rect = els.cpSv.getBoundingClientRect();
            var x = cpTemp.s * rect.width;
            var y = (1 - cpTemp.v) * rect.height;
            els.cpSvCursor.style.display = 'block';
            els.cpSvCursor.style.left = x + 'px';
            els.cpSvCursor.style.top = y + 'px';
        }
        function updateCpRGBInputs() {
            var rgb = hsvToRgb(cpTemp.h, cpTemp.s, cpTemp.v);
            els.cpR.value = Math.round(rgb.r);
            els.cpG.value = Math.round(rgb.g);
            els.cpB.value = Math.round(rgb.b);
        }
        function syncCpFromRGB() {
            var r = clamp(parseInt(els.cpR.value, 10) || 0, 0, 255);
            var g = clamp(parseInt(els.cpG.value, 10) || 0, 0, 255);
            var b = clamp(parseInt(els.cpB.value, 10) || 0, 0, 255);
            var hsv = rgbToHsv(r, g, b);
            cpTemp.h = hsv.h; cpTemp.s = hsv.s; cpTemp.v = hsv.v;
            els.cpHue.value = Math.round(cpTemp.h);
            drawSvCanvas(cpTemp.h);
            updateCpCursor();
            applyCpToBg();
        }
        function updateCpAlpha(pct) {
            var v = parseFloat(pct);
            if (isNaN(v)) return;
            cpTemp.a = clamp(Math.round(v), 0, 100);
            els.cpAlphaSlider.value = cpTemp.a;
            els.cpAlphaInput.value = cpTemp.a;
            applyCpToBg();
        }
        function applyCpToBg() {
            var rgb = hsvToRgb(cpTemp.h, cpTemp.s, cpTemp.v);
            var c = { r: rgb.r, g: rgb.g, b: rgb.b, a: cpTemp.a / 100 };
            state.bg = colorToString(c);
            applyBg();
        }
        function setCpSvFromEvent(e) {
            var rect = els.cpSv.getBoundingClientRect();
            var clientX = e.touches && e.touches.length ? e.touches[0].clientX : e.clientX;
            var clientY = e.touches && e.touches.length ? e.touches[0].clientY : e.clientY;
            cpTemp.s = clamp((clientX - rect.left) / rect.width, 0, 1);
            cpTemp.v = clamp(1 - (clientY - rect.top) / rect.height, 0, 1);
            updateCpCursor();
            updateCpRGBInputs();
            applyCpToBg();
        }
        function openColorPickerPanel() {
            var parsed = parseColor(state.bg) || { r: 255, g: 255, b: 255, a: 1 };
            var hsv = rgbToHsv(parsed.r, parsed.g, parsed.b);
            cpTemp.h = hsv.h; cpTemp.s = hsv.s; cpTemp.v = hsv.v; cpTemp.a = Math.round(parsed.a * 100);
            els.colorPicker.classList.add('open');
            positionColorPicker();
            els.cpHue.value = Math.round(cpTemp.h);
            drawSvCanvas(cpTemp.h);
            updateCpCursor();
            updateCpRGBInputs();
            els.cpAlphaSlider.value = cpTemp.a;
            els.cpAlphaInput.value = cpTemp.a;
            // 强制重排，确保 range thumb 在弹窗可见后正确就位
            els.cpHue.offsetHeight;
            els.cpHue.value = Math.round(cpTemp.h);
        }
        function positionColorPicker() {
            var modal = overlay.querySelector('.nfe2-modal');
            if (!modal || !els.customBg) return;
            var btnRect = els.customBg.getBoundingClientRect();
            var modalRect = modal.getBoundingClientRect();
            var pickerRect = els.colorPicker.getBoundingClientRect();
            var top = btnRect.top - modalRect.top - pickerRect.height - 6;
            var left = btnRect.right - modalRect.left + 6;
            els.colorPicker.style.top = top + 'px';
            els.colorPicker.style.left = left + 'px';
        }
        function closeColorPickerPanel() {
            els.colorPicker.classList.remove('open');
        }
        var cpDragging = false;
        function onCpSvDown(e) { cpDragging = true; setCpSvFromEvent(e); }
        function onCpSvMove(e) { if (cpDragging) { e.preventDefault(); setCpSvFromEvent(e); } }
        function onCpSvUp() { cpDragging = false; }
        els.customBg.addEventListener('click', openColorPickerPanel);
        els.cpSv.addEventListener('mousedown', onCpSvDown);
        els.cpSv.addEventListener('mousemove', onCpSvMove);
        els.cpSv.addEventListener('touchstart', onCpSvDown, { passive: false });
        els.cpSv.addEventListener('touchmove', onCpSvMove, { passive: false });
        global.addEventListener('mouseup', onCpSvUp);
        global.addEventListener('touchend', onCpSvUp);
        function onHueChange() {
            var val = Number(els.cpHue.value);
            // 强制重设 value 触发 WebKit thumb 重绘，避免点击轨道后 thumb 不跟随
            els.cpHue.value = val;
            cpTemp.h = val;
            drawSvCanvas(cpTemp.h);
            updateCpRGBInputs();
            applyCpToBg();
        }
        els.cpHue.addEventListener('input', onHueChange);
        els.cpHue.addEventListener('change', onHueChange);
        els.cpR.addEventListener('input', syncCpFromRGB);
        els.cpG.addEventListener('input', syncCpFromRGB);
        els.cpB.addEventListener('input', syncCpFromRGB);
        els.cpAlphaSlider.addEventListener('input', function () { updateCpAlpha(els.cpAlphaSlider.value); });
        els.cpAlphaInput.addEventListener('input', function () { updateCpAlpha(els.cpAlphaInput.value); });
        els.cpAlphaInput.addEventListener('blur', function () { updateCpAlpha(els.cpAlphaInput.value); });
        els.cpAlphaInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { updateCpAlpha(els.cpAlphaInput.value); els.cpAlphaInput.blur(); } });
        // 点击自定义颜色面板外部关闭（实时生效，无需确认）
        function onDocClickForCp(e) {
            if (!els.colorPicker.classList.contains('open')) return;
            if (els.colorPicker.contains(e.target)) return;
            if (e.target === els.customBg || els.customBg.contains(e.target)) return;
            closeColorPickerPanel();
        }
        document.addEventListener('mousedown', onDocClickForCp);
        applyBg(); // 初始化棋盘格背景 + 高亮透明色块

        // 不透明度
        function setOpacityFromPct(pct) {
            var v = parseFloat(pct);
            if (isNaN(v)) return;
            state.opacity = clamp(v / 100, 0, 1);
            renderAll();
        }
        els.opSlider.addEventListener('input', function () { setOpacityFromPct(els.opSlider.value); });
        els.opSlider.addEventListener('wheel', function (e) {
            e.preventDefault();
            var cur = Math.round((state.opacity != null ? state.opacity : 1) * 100);
            var delta = e.deltaY > 0 ? -5 : 5;
            var next = clamp(cur + delta, 0, 100);
            setOpacityFromPct(next);
        }, { passive: false });
        els.opInput.addEventListener('input', function () { setOpacityFromPct(els.opInput.value); });
        els.opInput.addEventListener('blur', function () { renderAll(); });
        els.opInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { setOpacityFromPct(els.opInput.value); els.opInput.blur(); } });
        // 输出尺寸（可调，推荐 64）
        function setOutSize(v) {
            var n = parseInt(v, 10);
            if (isNaN(n)) return;
            state.outputSize = clamp(n, 16, 512);
            renderOutput();
        }
        els.outSize.addEventListener('input', function () { setOutSize(els.outSize.value); });
        els.outSize.addEventListener('blur', function () { renderOutput(); });
        els.outSize.addEventListener('keydown', function (e) { if (e.key === 'Enter') { setOutSize(els.outSize.value); els.outSize.blur(); } });

        // 选择/拖拽图片（始终保存原始图片 data URL，便于再次编辑时恢复状态）
        function readFileAsDataURL(file, cb) {
            var reader = new FileReader();
            reader.onload = function (ev) { cb(ev.target.result); };
            reader.onerror = function () { if (typeof opts.onError === 'function') opts.onError(new Error('图片读取失败')); };
            reader.readAsDataURL(file);
        }
        function pickFile() { fileInput.click(); }
        function deleteImage() {
            state.img = null;
            state.originalImage = '';
            state.imgW = 0; state.imgH = 0;
            state.zoom = 1; state.s = state.baseFit; state.tx = 0; state.ty = 0; state.rot = 0; state.opacity = 1;
            state.crop = { x: CROP_MARGIN, y: CROP_MARGIN, w: VIEWPORT - 2 * CROP_MARGIN, h: VIEWPORT - 2 * CROP_MARGIN };
            els.drop.classList.remove('nfe2-hidden');
            vpCtx.clearRect(0, 0, els.vp.width, els.vp.height);
            outCtx.clearRect(0, 0, els.out.width, els.out.height);
            updateCropFrame();
            renderAll();
        }
        els.drop.addEventListener('click', pickFile);
        els.changeImg.addEventListener('click', pickFile);
        els.deleteImg.addEventListener('click', deleteImage);
        fileInput.addEventListener('change', function () {
            if (fileInput.files && fileInput.files[0]) {
                readFileAsDataURL(fileInput.files[0], function (dataURL) {
                    state.originalImage = dataURL;
                    loadImage(state.originalImage, false, 'crop');
                });
            }
            fileInput.value = '';
        });
        ['dragover', 'dragenter'].forEach(function (ev) {
            els.vpwrap.addEventListener(ev, function (e) { e.preventDefault(); els.drop.classList.add('drag'); });
        });
        ['dragleave', 'drop'].forEach(function (ev) {
            els.vpwrap.addEventListener(ev, function (e) { e.preventDefault(); els.drop.classList.remove('drag'); });
        });
        els.vpwrap.addEventListener('drop', function (e) {
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
                readFileAsDataURL(e.dataTransfer.files[0], function (dataURL) {
                    state.originalImage = dataURL;
                    loadImage(state.originalImage, false, 'crop');
                });
            }
        });

        // SVG / URL
        function refreshSvg() {
            var v = els.svg.value.trim(); state.svgText = v;
            if (v) { els.svgPrev.innerHTML = v; els.svgPrevWrap.classList.remove('nfe2-hidden'); }
            else els.svgPrevWrap.classList.add('nfe2-hidden');
        }
        els.svg.addEventListener('input', refreshSvg);
        function refreshUrl() {
            var v = els.url.value.trim(); state.urlValue = v;
            if (v) { els.urlPrev.src = v; els.urlPrevWrap.classList.remove('nfe2-hidden'); }
            else els.urlPrevWrap.classList.add('nfe2-hidden');
        }
        els.url.addEventListener('input', refreshUrl);

        // 关闭 / 应用
        function close() {
            document.removeEventListener('mousedown', onDocClickForCp);
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            global.__nfe2Current = null;
        }
        function showApplyToast(ok, msg) {
            var t = document.createElement('div');
            t.className = 'nfe2-toast ' + (ok ? 'nfe2-toast-ok' : 'nfe2-toast-err');
            t.textContent = msg || (ok ? '应用成功' : '应用失败');
            overlay.appendChild(t);
            setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, ok ? 1200 : 2400);
        }
        function doApply() {
            var result = '';
            var outMeta = null;
            if (state.mode === 'upload') {
                if (state.img) { try { result = els.out.toDataURL('image/png'); } catch (e) { result = ''; } }
                outMeta = {
                    originalImage: state.originalImage || '',
                    crop: state.crop,
                    shape: state.shape,
                    bg: state.bg,
                    zoom: state.zoom,
                    tx: state.tx,
                    ty: state.ty,
                    rot: state.rot,
                    opacity: state.opacity,
                    outputSize: state.outputSize
                };
            } else if (state.mode === 'svg') {
                result = els.svg.value.trim();
            } else if (state.mode === 'url') {
                result = els.url.value.trim();
            }
            var ok = true;
            try {
                if (typeof opts.onApply === 'function') { opts.onApply(result, outMeta); }
            } catch (e) {
                ok = false;
            }
            showApplyToast(ok);
            if (ok) { setTimeout(close, 600); }
        }
        // 关闭与保存逻辑：× / ESC = 直接关闭不保存；应用按钮 / Enter = 保存并退出；空白处点击不处理。
        els.close.addEventListener('click', close);
        els.applyBtn.addEventListener('click', doApply);
        overlay.addEventListener('click', function (e) { /* 点击遮罩不退出、不保存 */ });
        // 用捕获阶段监听键盘事件，并 stopImmediatePropagation，避免 ESC/Enter 冒泡到外层的副页弹窗
        document.addEventListener('keydown', function keydown(e) {
            if (e.key === 'Escape') {
                e.stopImmediatePropagation();
                // 一级一级退出：颜色面板先关，再关编辑器
                if (els.colorPicker.classList.contains('open')) {
                    closeColorPickerPanel();
                    return;
                }
                close(); document.removeEventListener('keydown', keydown, true);
            } else if (e.key === 'Enter') {
                // Enter 保存并退出；但在 textarea（SVG 代码）内按 Enter 应继续换行，不触发保存
                var tag = (document.activeElement && document.activeElement.tagName || '').toLowerCase();
                if (tag !== 'textarea') {
                    e.stopImmediatePropagation();
                    e.preventDefault();
                    doApply();
                }
            }
        }, true);

        // —— 初始化 ——
        els.rotInput.value = displayRot(state.rot);
        els.rotSlider.value = displayRot(state.rot);
        els.opInput.value = Math.round(((state.opacity != null ? state.opacity : 1) * 100));
        els.opSlider.value = els.opInput.value;
        setMode(state.mode);
        setShape(state.shape);
        applyBg();
        updateCropFrame();
        if (hasInitImage && state.originalImage) {
            // 有上次保存的原始图和编辑状态，恢复编辑
            loadImage(state.originalImage, true);
        } else if (hasInitImage) {
            // 无 meta，仅有一张结果图：仍可加载作为编辑底图（但无法还原原始图）
            state.originalImage = current;
            loadImage(current);
        } else if (state.mode !== 'upload') { if (state.mode === 'svg') refreshSvg(); else refreshUrl(); }
    }

    global.openFaviconEditor = openFaviconEditor;
    global.__faviconEditorLoaded = true;
    global.__faviconEditorFile = 'favicon-editor.js?v=' + FILE_VERSION;
    try { console.log('[NavEditor] favicon-editor.js 已加载（独立图标编辑器 v' + FILE_VERSION + '），openFaviconEditor 就绪'); } catch (e) {}
})(window);
