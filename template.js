// 由 app.js 提取：Vue 模板（与 App.template 等价）
const TEMPLATE = `
    <div>
        <!-- 顶部工具栏 -->
        <div class="toolbar">
            <!-- Logo + 标题（固定宽度 = sidebar 宽度，使后续按钮左边缘对齐 content 卡片区左边缘） -->
            <div class="toolbar-brand">
                <!-- 站点标题（点击展开"侧边栏顶部"设置面板） -->
                <button v-if="hasData" class="toolbar-site-logo-btn" @click="openSidebarTop" title="主控制台">
                    <span class="console-title-fixed">主控制台</span>
                </button>
                <span v-if="hasData" class="nv-bar">
                    <span class="nv-site" @click="openProfilesManager" :title="'当前站点：' + currentProfileName">{{ currentProfileName }}</span>
                    <template v-if="currentVersionNote">
                        <span class="nv-sep" @click="openVersions" title="切换版本">/</span>
                        <span class="nv-version" @click="openVersions" :title="'当前版本：' + currentVersionNote">
                            {{ currentVersionNote }}
                            <span v-if="versions.length > 0" class="nv-badge">{{ versions.length }}</span>
                        </span>
                    </template>
                </span>
            </div>
            <button class="mc-btn mc-save" v-if="hasData" @click="requestSave('save')" title="保存到当前编辑的历史版本">
                <i class="fas fa-save"></i> 保存
            </button>
            <button class="mc-btn mc-export" v-if="hasData" @click="requestSave('saveAs')" title="另存为一个新版本">
                <i class="fas fa-copy"></i> 另存为
            </button>
            <div class="toolbar-dropdown">
                <button class="mc-btn mc-export" :ref="exportBtnEl" @click.stop="toggleExportMenu($event)" :class="{ active: exportMenuOpen }" title="下载">
                    <i class="fas fa-download"></i> 下载 <i class="fas fa-caret-down" style="font-size:10px;margin-left:2px"></i>
                </button>
                <Teleport to="body">
                    <div class="toolbar-dropdown-menu" v-if="exportMenuOpen" :style="exportMenuStyle" @click.stop>
                        <button class="dropdown-item" @click="exportDeploymentZip(); closeExportMenu()" title="对应账号「全量发布」所需的完整部署文件">
                            <i class="fas fa-file-archive"></i> <span>下载部署文件</span>
                        </button>
                        <button class="dropdown-item" @click="exportModifiedFilesZip(); closeExportMenu()" title="请勿保存，否则下载失败">
                            <i class="fas fa-sync"></i> <span>下载修改文件</span>
                        </button>
                    </div>
                </Teleport>
            </div>
            <div class="toolbar-spacer"></div>
            <button class="mc-btn mc-wallpaper" v-if="hasData" @click="openBgConfig">
                <i class="fas fa-image"></i> 壁纸
            </button>
            <button class="mc-btn mc-seo" v-if="hasData" @click="openSeoConfig" title="SEO 营销配置（标题、描述、分享卡片、站点验证、结构化数据、robots / sitemap）">
                <i class="fas fa-chart-line"></i> 营销
            </button>
            <button class="mc-btn mc-adslot" v-if="hasData" @click="openAdSlotsConfig">
                <i class="fas fa-rectangle-ad"></i> 广告位
            </button>
            <button class="mc-btn mc-search" v-if="hasData" @click="openSearchConfig" style="min-width:150px">
                <i class="fas fa-search"></i> 搜索栏
            </button>
            <button class="mc-btn mc-daily" v-if="hasData" @click="openDailyTextConfig">
                <i class="fas fa-quote-right"></i> 每日文字
            </button>
            <div class="btn-group" v-if="hasData">
                <button class="mc-btn mc-visitor" @click="openVisitorView()" title="访客视角（预览当前修改后的导航站）">
                    <i class="fas fa-eye"></i> 访客视角
                </button>
                <button class="mc-btn mc-account" @click="openSettings()" :class="{ 'account-ok': activeAccountId && connectivityStatus[activeAccountId] && connectivityStatus[activeAccountId].state === 'ok', 'account-checking': activeAccountId && connectivityStatus[activeAccountId] && connectivityStatus[activeAccountId].state === 'checking', 'account-error': activeAccountId && connectivityStatus[activeAccountId] && connectivityStatus[activeAccountId].state === 'error' }" :title="cfAccounts.length === 0 ? '未配置账号，点击添加' : ((cfAccounts.find(a => a.id === activeAccountId)?.type === 'github') ? 'GitHub 账号（点击管理）' : (cfAccounts.find(a => a.id === activeAccountId)?.type === 'server') ? '服务器部署账号（点击管理）' : 'Cloudflare 账号（点击管理）')">
                    <template v-if="cfAccounts.length === 0">
                        <i class="fas fa-user-plus"></i> 配置账号
                    </template>
                    <template v-else>
                        <i v-if="(cfAccounts.find(a => a.id === activeAccountId)?.type === 'server') && (cfAccounts.find(a => a.id === activeAccountId)?.deployType !== 'local')" class="nginx-logo" style="font-size:13px"></i>
                        <i v-else-if="(cfAccounts.find(a => a.id === activeAccountId)?.type === 'server')" class="fab fa-windows"></i>
                        <i v-else-if="(cfAccounts.find(a => a.id === activeAccountId)?.type === 'vercel')" class="vercel-logo"></i>
                        <i v-else-if="(cfAccounts.find(a => a.id === activeAccountId)?.type === 'netlify')" class="netlify-logo"></i>
                        <i v-else :class="(cfAccounts.find(a => a.id === activeAccountId)?.type === 'github') ? 'fab fa-github' : 'fas fa-cloud-upload-alt'"></i>
                        <span style="margin-left:4px">{{ (cfAccounts.find(a => a.id === activeAccountId)?.type === 'github') ? 'GitHub' : (cfAccounts.find(a => a.id === activeAccountId)?.type === 'vercel') ? 'Vercel' : (cfAccounts.find(a => a.id === activeAccountId)?.type === 'netlify') ? 'Netlify' : (cfAccounts.find(a => a.id === activeAccountId)?.type === 'server') ? ((cfAccounts.find(a => a.id === activeAccountId)?.deployType === 'local') ? '本地' : '服务器') : 'Cloudflare' }}</span>
                    </template>
                </button>
                <div class="toolbar-dropdown">
                    <button class="mc-btn mc-publish" :ref="publishBtnEl" :class="{ active: publishMenuOpen }" title="发布 / 上传到 Cloudflare 或 GitHub Pages" style="position:relative;padding-right:30px">
                        <span @click.stop="onPublishMainClick" style="display:inline-flex;align-items:center;gap:4px;cursor:pointer"><i class="fas fa-cloud-upload-alt"></i> {{ publishMainLabel }}</span>
                        <span @click.stop="togglePublishMenu($event)" style="position:absolute;right:0;top:0;bottom:0;width:30px;display:flex;align-items:center;justify-content:center;border-left:1px solid rgba(255,255,255,0.55);cursor:pointer"><i class="fas fa-caret-down" style="font-size:10px"></i></span>
                    </button>
                    <Teleport to="body">
                        <div class="toolbar-dropdown-menu" v-if="publishMenuOpen" :style="publishMenuStyle" @click.stop>
                            <button class="dropdown-item" v-if="data.deploySettings.defaultTop !== 'quick'" @click="quickPublish()">
                                <i class="fas fa-bolt"></i> <span>快速发布</span>
                            </button>
                            <button class="dropdown-item" v-if="data.deploySettings.defaultTop !== 'incremental'" @click="syncToCloudflare(false); closePublishMenu()">
                                <i class="fas fa-sync"></i> <span>增量发布</span>
                            </button>
                            <button class="dropdown-item" v-if="data.deploySettings.defaultTop !== 'full'" @click="syncToCloudflare(true); closePublishMenu()">
                                <i class="fas fa-cloud-upload-alt"></i> <span>全量发布</span>
                            </button>
                            <div class="dropdown-divider"></div>
                            <button class="dropdown-item" @click="openPublishSettings(); closePublishMenu()">
                                <i class="fas fa-cog"></i> <span>发布设置</span>
                            </button>
                        </div>
                    </Teleport>
                </div>
            </div>
        </div>

        <!-- ==================== 主内容区：左侧分类树 + 右侧网站卡片 ==================== -->
        <div class="app-layout">
            <!-- 左侧分类树 -->
            <div class="sidebar-tree" @pointerdown.capture="kbActive=false">
                <div style="padding:6px 12px;font-size:12px;color:#8a94a6;text-align:center;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;">{{ treeStats.catCount }}个分类 {{ treeStats.subCount }}个子分类 {{ treeStats.siteCount }}个网站</div>
                <div class="tree-search" style="display:flex;align-items:center;gap:6px;">
                    <input v-model="treeSearchQuery" type="text" placeholder="搜索分类 / 网站..." style="flex:1;">
                    <button class="style-btn" @click="addCategory" title="添加分类"><i class="fas fa-plus"></i></button>
                </div>
                <div class="tree-list">
                    <div v-for="cat in filteredCategories" :key="cat.id" class="tree-item"
                         :data-cat-id="cat.id"
                         :class="{ expanded: isCatExpanded(cat.id) }">
                        <div class="tree-item-row" :data-cat-id="cat.id"
                             :class="{ active: selectedCategoryId===cat.id, 'kb-focus': kbActive && kbFocusKey==='cat:'+cat.id, 'tree-dragging': draggingTreeKey==='cat:'+cat.id }"
                             @click="onMainClick(cat.id)">
                            <span class="tree-drag-handle" title="按住拖动排序" @mousedown.stop="onTreeHandleDown($event, cat.id)"><i class="fas fa-grip-vertical"></i></span>
                            <button v-if="cat.children && cat.children.length >= 1" class="tree-item-toggle" :class="{ open: isCatExpanded(cat.id) }" @click.stop="onCatToggleClick(cat.id)" title="展开/收起">
                                <i class="fas fa-chevron-right"></i>
                            </button>
                            <span v-else class="tree-item-toggle-spacer"></span>
                            <div class="tree-item-main">
                                <template v-if="isImageIcon(cat.icon)"><img :src="cat.icon" class="tree-item-icon-img"></template>
                                <i v-else class="tree-item-icon" :class="cat.icon || 'fas fa-folder'"></i>
                                <span class="tree-item-name">{{ cat.name }}</span>
                            </div>
                            <span class="tree-item-count">{{ (cat.children||[]).reduce((s,sub)=>s+(sub.sites?sub.sites.length:0),0) }}</span>
                            <div class="tree-item-actions">
                                <button class="style-btn" :class="{ 'kb-focus-btn': kbActive && kbFocusKey==='cat:'+cat.id && kbBtn===0 }" @click.stop="editCategory(cat)" title="编辑分类"><i class="fas fa-edit"></i></button>
                                <button class="style-btn" :class="{ 'kb-focus-btn': kbActive && kbFocusKey==='cat:'+cat.id && kbBtn===1 }" @click.stop="deleteCategory(cat.id)" title="删除分类"><i class="fas fa-trash"></i></button>
                            </div>
                        </div>
                        <div class="tree-children" v-if="cat.children && cat.children.length">
                        <div v-for="sub in cat.children" :key="sub.id"
                             class="tree-item-row tree-sub-row" :data-cat-id="cat.id" :data-sub-id="sub.id"
                             :class="{ active: selectedSubId===sub.id,
                                       'kb-focus': kbActive && kbFocusKey==='sub:'+cat.id+':'+sub.id,
                                       'tree-dragging': draggingTreeKey==='sub:'+cat.id+':'+sub.id }"
                             @click.stop="selectCategory(cat.id, sub.id)">
                                <span class="tree-drag-handle" title="按住拖动排序" @mousedown.stop="onSubHandleDown($event, cat.id, sub.id)"><i class="fas fa-grip-vertical"></i></span>
                                <span class="tree-item-toggle-spacer"></span>
                                <div class="tree-item-main">
                                    <span class="tree-item-name">{{ sub.name }}</span>
                                </div>
                                <span class="tree-item-count">{{ (sub.sites?sub.sites.length:0) }}</span>
                                <div class="tree-item-actions">
                                    <button class="style-btn" :class="{ 'kb-focus-btn': kbActive && kbFocusKey==='sub:'+cat.id+':'+sub.id && kbBtn===0 }" @click.stop="editSubCategory(cat.id, sub)" title="编辑子分类"><i class="fas fa-edit"></i></button>
                                    <button class="style-btn" :class="{ 'kb-focus-btn': kbActive && kbFocusKey==='sub:'+cat.id+':'+sub.id && kbBtn===1, 'is-disabled': cat.children.length <= 1 }" :disabled="cat.children.length <= 1" @click.stop="deleteSubCategory(cat.id, sub.id)" :title="cat.children.length <= 1 ? '至少保留一个子分类，请直接删除该分类' : '删除子分类'"><i class="fas fa-trash"></i></button>
                                </div>
                            </div>
                            <button class="tree-add-btn-inline" @click="addSubCategory(cat.id)" title="添加子分类"><i class="fas fa-plus"></i></button>
                        </div>
                    </div>
                </div>
                <!-- 左侧栏页脚菜单（可拖拽排序） -->
                <div class="tree-footer-actions">
                    <div v-for="btn in footerMenuButtons" :key="btn.key"
                         class="footer-drag-wrap"
                         :class="{ dragging: footerDraggingKey === btn.key }">
                        <div class="footer-drag-btn" @click="onFooterBtnClick(btn.key)" :title="btn.title"
                             :data-footer-key="btn.key" @mousedown.stop="onFooterMousedown(btn.key, $event)">
                            <div class="footer-btn-content">
                                <i :class="btn.icon" :style="btn.iconColor ? { color: btn.iconColor } : null"></i>
                                <span>{{ btn.text }}</span>
                            </div>
                        </div>
                        <div class="footer-actions">
                            <button class="footer-edit-btn" @click.stop="openEditFooterMenu(btn.key)" title="编辑"><i class="fas fa-edit"></i></button>
                            <button class="footer-del-btn" @click.stop="removeFooterItem(btn.key)" title="删除"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                    <button class="footer-settings-btn" @click="openAddFooterMenu()" title="添加页脚菜单（新页面）">
                        <i class="fas fa-plus"></i> 添加
                    </button>
                    <button class="footer-settings-btn" @click="openHeaderConfig()" title="站点设置（图标 / 备案 / 标题）">
                        <i class="fas fa-cog"></i> 站点设置
                    </button>
                </div>
            </div>

            <!-- 右侧网站卡片区 -->
            <div class="content-area">
                <div class="content-header">
                    <div>
                        <div class="content-breadcrumb" v-if="currentCategory">
                            分类 / {{ currentCategory.name }}<span v-if="currentSub"> / {{ currentSub.name }}</span>
                        </div>
                        <h2>
                            <i class="fas fa-folder"></i>
                            {{ currentSub ? currentSub.name : (currentCategory ? currentCategory.name : '全部网站') }}
                        </h2>
                    </div>
                    <button v-if="currentSub" class="btn btn-primary" @click="addSite"><i class="fas fa-plus"></i> 添加网站</button>
                </div>

                <div v-if="currentSub" class="card-grid">
                    <div v-for="(site, index) in currentSub.sites" :key="site.id || ('site-' + index)" class="nav-card" :data-card-index="index"
                         :class="{ 'dragging': draggingCardIndex === index,
                                   'drag-over': dropPreview && dropPreview.type==='card' && dropPreview.targetIndex===index }"
                         @pointerdown="onCardPointerDown($event, index)" @click="editSite(site, index)">
                        <div class="nav-card-img-wrap" @click.stop="editSite(site, index)">
                            <img v-if="site.logo && !isSvgText(site.logo) && !site.logoLoadError" class="nav-card-img" :src="site.logo" :alt="site.name" @error="site.logoLoadError = true">
                            <div v-else-if="site.logo && isSvgText(site.logo)" class="nav-card-img-svg" v-html="site.logo"></div>
                            <div v-else class="nav-card-img-placeholder"><i :class="site.fallbackIcon || 'fas fa-link'" style="font-size:18px;color:#8a94a6"></i></div>
                            <div class="nav-card-img-overlay"><i class="fas fa-pencil-alt"></i></div>
                        </div>
                        <div class="nav-card-info">
                            <div class="nav-card-name">{{ site.name }}</div>
                            <div class="nav-card-desc" v-if="site.description">{{ site.description }}</div>
                            <div class="nav-card-url" v-if="site.url">{{ site.url }}</div>
                        </div>
                        <div class="nav-card-actions">
                            <button class="style-btn" @click.stop="editSite(site, index)" title="编辑网站"><i class="fas fa-edit"></i></button>
                            <button class="style-btn" @click.stop="deleteSite(index)" title="删除网站"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                    <div class="add-card" @click="addSite">
                        <i class="fas fa-plus"></i>
                        <span>添加网站</span>
                    </div>
                </div>

                <div v-else class="empty-state">
                    <i class="fas fa-folder-open"></i>
                    <p>{{ currentCategory ? '请选择左侧子分类查看网站' : '请选择左侧分类，或先添加分类' }}</p>
                </div>
            </div>
        </div>

            <!-- 下载设置弹窗（控制下载下拉中 3 个选项可见性） -->
            <Teleport to="body">
                <div v-if="exportSettingsOpen" class="modal-overlay" @keyup.esc="closeExportSettings">
                    <div class="modal" style="max-width:420px">
                        <div class="modal-header">
                            <h3>下载设置</h3>
                            <button class="btn-icon" @click="closeExportSettings"><i class="fas fa-times"></i></button>
                        </div>
                        <div class="modal-body" style="max-height:68vh;overflow:auto">
                            <p style="font-size:12px;color:var(--text-muted);margin-bottom:12px">勾选下载下拉菜单中需要显示的选项，点「设置」可指定包含的具体文件 / 数据：</p>
                            <!-- JSON(配置) -->
                            <div style="border:1px solid var(--border);border-radius:6px;margin-bottom:8px;font-size:13px;overflow:hidden">
                                <div style="display:flex;align-items:center;gap:10px;padding:8px 10px">
                                    <label style="display:flex;align-items:center;gap:10px;flex:1;cursor:pointer;min-width:0">
                                        <input type="checkbox" v-model="data.exportSettings.showJson">
                                        <span><i class="fas fa-download" style="width:16px;text-align:center;margin-right:6px"></i>JSON(配置)</span>
                                    </label>
                                    <button class="btn btn-sm btn-outline" @click="toggleExportFilePanel('json')">设置</button>
                                </div>
                                <div v-if="exportFilePanel === 'json'" style="padding:0 10px 10px 30px;display:flex;flex-direction:column;gap:6px">
                                    <label v-for="opt in [{k:'site',t:'站点设置'},{k:'categories',t:'分类与网站'},{k:'searchConfig',t:'搜索栏设置'},{k:'wallpapers',t:'壁纸与背景'},{k:'about',t:'关于页'},{k:'commit',t:'提交页'},{k:'friendLinks',t:'友情链接'},{k:'footer',t:'页脚'}]" :key="opt.k" style="display:flex;align-items:center;gap:8px;cursor:pointer">
                                        <input type="checkbox" v-model="data.exportSettings.fileSettings.json[opt.k]">
                                        <span>{{ opt.t }}</span>
                                    </label>
                                </div>
                            </div>
                            <!-- HTML(改动文件) -->
                            <div style="border:1px solid var(--border);border-radius:6px;margin-bottom:8px;font-size:13px;overflow:hidden">
                                <div style="display:flex;align-items:center;gap:10px;padding:8px 10px">
                                    <label style="display:flex;align-items:center;gap:10px;flex:1;cursor:pointer;min-width:0">
                                        <input type="checkbox" v-model="data.exportSettings.showHtml">
                                        <span><i class="fas fa-file-download" style="width:16px;text-align:center;margin-right:6px"></i>HTML(改动文件)</span>
                                    </label>
                                    <button class="btn btn-sm btn-outline" @click="toggleExportFilePanel('html')">设置</button>
                                </div>
                                <div v-if="exportFilePanel === 'html'" style="padding:0 10px 10px 30px;display:flex;flex-direction:column;gap:6px">
                                    <label v-for="opt in [{k:'index',t:'index.html'},{k:'about',t:'template/页脚/关于导航/index.html'},{k:'commit',t:'commit.html'},{k:'customCss',t:'assets/css/custom-style.css'},{k:'notFound',t:'404.html'}]" :key="opt.k" style="display:flex;align-items:center;gap:8px;cursor:pointer">
                                        <input type="checkbox" v-model="data.exportSettings.fileSettings.html[opt.k]">
                                        <span>{{ opt.t }}</span>
                                    </label>
                                </div>
                            </div>
                            <!-- 下载部署文件 -->
                            <div style="border:1px solid var(--border);border-radius:6px;font-size:13px;overflow:hidden">
                                <div style="display:flex;align-items:center;gap:10px;padding:8px 10px">
                                    <label style="display:flex;align-items:center;gap:10px;flex:1;cursor:pointer;min-width:0">
                                        <input type="checkbox" v-model="data.exportSettings.showDeploy">
                                        <span><i class="fas fa-file-archive" style="width:16px;text-align:center;margin-right:6px"></i>下载部署文件</span>
                                    </label>
                                    <button class="btn btn-sm btn-outline" @click="toggleExportFilePanel('deploy')">设置</button>
                                </div>
                                <div v-if="exportFilePanel === 'deploy'" style="padding:0 10px 10px 30px;display:flex;flex-direction:column;gap:6px">
                                    <label v-for="opt in [{k:'index',t:'index.html'},{k:'about',t:'template/页脚/关于导航/index.html'},{k:'commit',t:'commit.html'},{k:'customCss',t:'assets/css/custom-style.css'},{k:'notFound',t:'404.html'},{k:'assets',t:'静态资源（字体/CSS/JS/图片等）'}]" :key="opt.k" style="display:flex;align-items:center;gap:8px;cursor:pointer">
                                        <input type="checkbox" v-model="data.exportSettings.fileSettings.deploy[opt.k]">
                                        <span>{{ opt.t }}</span>
                                    </label>
                                </div>
                            </div>
                            <!-- 额外文件 / 文件夹：仅对「下载部署文件」生效 -->
                            <div style="border:1px solid var(--border);border-radius:6px;font-size:13px;overflow:hidden;margin-top:8px">
                                <div style="padding:8px 10px">
                                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
                                        <span style="font-weight:600">额外文件 / 文件夹</span>
                                        <button class="btn btn-sm btn-outline" @click="data.exportSettings.includePaths.push('')">+ 添加</button>
                                    </div>
                                    <p style="font-size:11px;color:var(--text-muted);margin:0 0 6px;line-height:1.5">相对于项目根目录，如 <code>footer/test.html</code>、<code>my-pages/</code>；仅对「下载部署文件」生效，优先级高于排除规则。</p>
                                    <div v-if="!data.exportSettings.includePaths || data.exportSettings.includePaths.length === 0" style="font-size:12px;color:var(--text-muted)">未添加</div>
                                    <div v-for="(p, i) in (data.exportSettings.includePaths || [])" :key="i" style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
                                        <input class="form-input" v-model="data.exportSettings.includePaths[i]" placeholder="footer/test.html" style="flex:1;font-size:12px;font-family:monospace">
                                        <button class="btn btn-sm btn-icon" @click="data.exportSettings.includePaths.splice(i,1)" title="删除"><i class="fas fa-times"></i></button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer" style="justify-content:space-between">
                            <button class="btn btn-outline" @click="resetExportSettings">恢复默认</button>
                            <button class="btn" @click="closeExportSettings">关闭</button>
                        </div>
                    </div>
                </div>
            </Teleport>

            <!-- 发布设置弹窗 -->
            <div v-if="modal.publishSettings" class="modal-overlay" @keyup.esc="closePublishSettings">
                <div class="modal" style="max-width:460px">
                    <div class="modal-header">
                        <h3>发布设置</h3>
                        <button class="btn-icon" @click="closePublishSettings"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="modal-body" style="max-height:68vh;overflow:auto">
                        <p style="font-size:12px;color:var(--text-muted);margin-bottom:12px">分别设置「快速/增量/全量发布」包含的文件；并指定默认置顶按钮（点主按钮即执行该项）。</p>
                        <!-- 增量发布文件 -->
                        <div style="border:1px solid var(--border);border-radius:6px;margin-bottom:8px;font-size:13px;overflow:hidden">
                            <div style="padding:8px 10px;font-weight:600"><i class="fas fa-sync" style="margin-right:6px"></i>增量发布文件（只上传以下文件中发生变更者）</div>
                            <div style="padding:0 10px 10px 10px;display:flex;flex-direction:column;gap:6px">
                                <label v-for="opt in [{k:'index',t:'index.html'},{k:'about',t:'template/页脚/关于导航/index.html'},{k:'commit',t:'commit.html'},{k:'customCss',t:'assets/css/custom-style.css'},{k:'notFound',t:'404.html'},{k:'assets',t:'静态资源（字体/CSS/JS/图片等）'}]" :key="'inc-'+opt.k" style="display:flex;align-items:center;gap:8px;cursor:pointer">
                                    <input type="checkbox" v-model="data.deploySettings.incrementalFiles[opt.k]">
                                    <span>{{ opt.t }}</span>
                                </label>
                            </div>
                        </div>
                        <!-- 全量发布文件 -->
                        <div style="border:1px solid var(--border);border-radius:6px;margin-bottom:8px;font-size:13px;overflow:hidden">
                            <div style="padding:8px 10px;font-weight:600"><i class="fas fa-cloud-upload-alt" style="margin-right:6px"></i>全量发布文件（每次上传以下文件全部）</div>
                            <div style="padding:0 10px 10px 10px;display:flex;flex-direction:column;gap:6px">
                                <label v-for="opt in [{k:'index',t:'index.html'},{k:'about',t:'template/页脚/关于导航/index.html'},{k:'commit',t:'commit.html'},{k:'customCss',t:'assets/css/custom-style.css'},{k:'notFound',t:'404.html'},{k:'assets',t:'静态资源（字体/CSS/JS/图片等）'}]" :key="'full-'+opt.k" style="display:flex;align-items:center;gap:8px;cursor:pointer">
                                    <input type="checkbox" v-model="data.deploySettings.fullFiles[opt.k]">
                                    <span>{{ opt.t }}</span>
                                </label>
                            </div>
                        </div>
                        <!-- 额外强制包含路径 -->
                        <div style="border:1px solid var(--border);border-radius:6px;font-size:13px;overflow:hidden;margin-bottom:8px">
                            <div style="padding:8px 10px">
                                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
                                    <span style="font-weight:600">额外文件 / 文件夹（增量与全量共用）</span>
                                    <button class="btn btn-sm btn-outline" @click="data.deploySettings.includePaths.push('')">+ 添加</button>
                                </div>
                                <p style="font-size:11px;color:var(--text-muted);margin:0 0 6px;line-height:1.5">相对于项目根目录，如 <code>footer/test.html</code>、<code>my-pages/</code>；优先级高于排除规则。</p>
                                <div v-if="!data.deploySettings.includePaths || data.deploySettings.includePaths.length === 0" style="font-size:12px;color:var(--text-muted)">未添加</div>
                                <div v-for="(p, i) in (data.deploySettings.includePaths || [])" :key="i" style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
                                    <input class="form-input" v-model="data.deploySettings.includePaths[i]" placeholder="footer/test.html" style="flex:1;font-size:12px;font-family:monospace">
                                    <button class="btn btn-sm btn-icon" @click="data.deploySettings.includePaths.splice(i,1)" title="删除"><i class="fas fa-times"></i></button>
                                </div>
                            </div>
                        </div>
                        <!-- 默认置顶按钮 -->
                        <div style="border:1px solid var(--border);border-radius:6px;font-size:13px;overflow:hidden">
                            <div style="padding:8px 10px">
                                <div style="font-weight:600;margin-bottom:8px">默认置顶按钮（点主按钮即执行）</div>
                                <div style="display:flex;gap:14px;flex-wrap:wrap">
                                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="radio" value="quick" v-model="data.deploySettings.defaultTop"> 快速发布</label>
                                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="radio" value="incremental" v-model="data.deploySettings.defaultTop"> 增量发布</label>
                                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="radio" value="full" v-model="data.deploySettings.defaultTop"> 全量发布</label>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer" style="justify-content:space-between">
                        <button class="btn btn-outline" @click="resetPublishSettings">恢复默认</button>
                        <button class="btn btn-primary" @click="closePublishSettings">完成</button>
                    </div>
                </div>
            </div>

            <!-- GitHub 建树超时/过大：分片发布方案 -->
            <div v-if="modal.treeTooLarge" class="modal-overlay" @click.self="modal.treeTooLarge = false">
                <div class="modal" style="max-width:520px">
                    <div class="modal-header">
                        <h3><i class="fas fa-exclamation-triangle" style="color:var(--warning)"></i> 发布文件树过大</h3>
                        <button class="btn-icon" @click="modal.treeTooLarge = false"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="modal-body">
                        <p style="font-size:13px;margin:0 0 8px">GitHub 一次性创建全部文件时超时（文件较多或仓库内容过大），这是 GitHub 接口的请求体大小限制。</p>
                        <p style="font-size:12px;color:var(--text-muted);margin:0;line-height:1.7">
                            已为你准备好解决方案：<b>分片发布</b>会把文件分批构建仓库树（每批约 120 个），避开接口超时，不需要你手动处理。
                        </p>
                    </div>
                    <div class="modal-footer" style="justify-content:flex-end">
                        <button class="btn" @click="modal.treeTooLarge = false">取消</button>
                        <button class="btn btn-primary" @click="confirmShardPublish"><i class="fas fa-layer-group"></i> 分片发布</button>
                    </div>
                </div>
            </div>

            <!-- 发布前未保存询问弹窗 -->
            <div v-if="modal.publishSavePrompt" class="modal-overlay" style="z-index:10000" @keyup.esc="cancelPublishSave">
                <div class="modal" style="max-width:420px">
                    <div class="modal-header">
                        <h3 style="display:flex;align-items:center;gap:8px;color:#e65100">
                            <i class="fas fa-exclamation-triangle"></i>
                            <span>未保存的修改</span>
                        </h3>
                        <button class="btn-icon" @click="cancelPublishSave"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="modal-body" style="text-align:center;padding:24px">
                        <p style="font-size:14px;color:var(--text);margin-bottom:8px">有未保存的修改，发布前需要先保存</p>
                        <p style="font-size:12px;color:var(--text-muted)">保存后将继续进行发布确认</p>
                    </div>
                    <div class="modal-footer" style="justify-content:space-between">
                        <button class="btn" @click="cancelPublishSave">取消</button>
                        <button class="btn btn-primary" @click="confirmPublishSave" style="margin-left:8px">
                            <i class="fas fa-save"></i> 保存并继续
                        </button>
                    </div>
                </div>
            </div>

            <!-- 发布确认弹窗（增量/全量） -->
            <div v-if="modal.publishConfirm" class="modal-overlay" @keyup.esc="cancelPublish">
                <div class="modal" style="max-width:440px">
                    <div class="modal-header">
                        <h3><i class="fas fa-cloud-upload-alt" style="color:var(--danger)"></i> {{ publishConfirmText.title }}</h3>
                        <button class="btn-icon" @click="cancelPublish"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="modal-body">
                        <p style="font-size:14px;font-weight:600;margin:0 0 10px">{{ publishConfirmText.line1 }}</p>
                        <p style="font-size:13px;color:var(--danger);margin:0">{{ publishConfirmText.line2 }}</p>
                    </div>
                    <div class="modal-footer">
                        <button class="btn" @click="cancelPublish">取消</button>
                        <button class="btn btn-danger" @click="confirmPublish">确认发布</button>
                    </div>
                </div>
            </div>

            <!-- 站点设置（SEO）弹窗 -->
            <div v-if="modal.site" class="modal-overlay">
                <div class="modal" style="max-width:520px">
                    <div class="modal-header">
                        <h3>站点设置</h3>
                        <button class="btn-icon" @click="modal.site = false"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label class="form-label">关键词（SEO）</label>
                            <textarea class="form-textarea" v-model="editForm.siteConfig.keywords" placeholder="用逗号分隔，如：导航,书签,工具" rows="3"></textarea>
                        </div>
                        <div class="form-group">
                            <label class="form-label">描述（SEO）</label>
                            <textarea class="form-textarea" v-model="editForm.siteConfig.description" placeholder="一句话描述这个导航站" rows="3"></textarea>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn" @click="modal.site = false">取消</button>
                        <button class="btn btn-primary" @click="saveSiteConfig">保存</button>
                    </div>
                </div>
            </div>

        <!-- 侧边栏顶部设置 弹窗 -->
        <div v-if="modal.sidebarTop" class="modal-overlay">
            <div class="modal" style="max-width:480px">
                <div class="modal-header">
                    <h3><i class="fas fa-image"></i> 侧边栏顶部设置</h3>
                    <button class="btn-icon" @click="modal.sidebarTop = false"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body" style="max-height:75vh;overflow-y:auto">

                    <!-- === 1. 浏览器标签 === -->
                    <div class="form-section">
                        <div class="form-section-title"><i class="fas fa-globe"></i> 浏览器标签</div>
                        <div class="form-row" style="align-items:flex-start;gap:0">
                            <div class="form-group" style="flex:none;margin-bottom:0">
                                <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
                                    <div class="logo-card-preview" style="width:80px;height:80px;border-radius:50%" @click="openBrowserTagFaviconEditor" title="点击打开图标编辑器">
                                        <img v-if="editForm.sidebarTop.favicon && (isHttpUrl(editForm.sidebarTop.favicon) || isDataUrl(editForm.sidebarTop.favicon))"
                                             :src="editForm.sidebarTop.favicon" alt="favicon">
                                        <img v-else-if="editForm.sidebarTop.favicon"
                                             :src="editForm.sidebarTop.favicon" alt="favicon" @error="$event.target.style.display='none'">
                                        <i v-else class="fas fa-image placeholder"></i>
                                    </div>
                                    <span style="font-size:13px;color:var(--text-muted);font-weight:bold">标签图片</span>
                                </div>
                            </div>
                            <div class="form-group" style="flex:1">
                                <div style="display:flex;flex-direction:column;gap:4px;margin-left:8px">
                                    <span style="font-size:14px;white-space:nowrap;font-weight:bold">标签文字</span>
                                    <input class="form-input" v-model="editForm.sidebarTop.siteTitle" placeholder="如：在线工具网" style="max-width:280px">
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- === 2. 图片（展开 Logo）+ 收起 Logo（图标） 并排一行 === -->
                    <div class="form-section" style="padding:10px 12px;margin-bottom:8px">
                        <div class="logo-setting-row">
                            <div class="logo-setting-col">
                                <div class="form-section-title" style="margin-bottom:8px;padding-bottom:6px"><i class="fas fa-image"></i> 展开 Logo</div>
                                <div class="form-group">
                                    <label class="form-label" style="margin-bottom:6px">展开 Logo</label>
                                    <div class="logo-card-preview" @click="openExpandedLogoEditor" title="点击修改">
                                        <img v-if="editForm.sidebarTop.logoLight && (isHttpUrl(editForm.sidebarTop.logoLight) || isDataUrl(editForm.sidebarTop.logoLight))"
                                             :src="editForm.sidebarTop.logoLight" alt="Logo">
                                        <img v-else-if="editForm.sidebarTop.logoLight"
                                             :src="editForm.sidebarTop.logoLight" alt="Logo" @error="$event.target.style.display='none'">
                                        <i v-else class="fas fa-image placeholder"></i>
                                    </div>
                                </div>
                            </div>
                            <div class="logo-setting-col collapsed">
                                <div class="form-section-title" style="margin-bottom:8px;padding-bottom:6px"><i class="fas fa-th-large"></i> 收起 Logo（图标）</div>
                                <div class="form-group">
                                    <label class="form-label" style="margin-bottom:6px">收起 Logo</label>
                                    <div class="logo-card-preview" @click="openCollapsedLogoEditor" title="点击修改">
                                        <img v-if="editForm.sidebarTop.logoCollapsedLight && (isHttpUrl(editForm.sidebarTop.logoCollapsedLight) || isDataUrl(editForm.sidebarTop.logoCollapsedLight))"
                                             :src="editForm.sidebarTop.logoCollapsedLight" alt="图标">
                                        <img v-else-if="editForm.sidebarTop.logoCollapsedLight"
                                             :src="editForm.sidebarTop.logoCollapsedLight" alt="图标" @error="$event.target.style.display='none'">
                                        <i v-else class="fas fa-image placeholder"></i>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <p style="margin:8px 0 0;color:#999;font-size:12px">侧边栏收起后只显示图标，建议上传无文字的小图标；留空则自动回退使用"展开 Logo"。</p>
                    </div>

                    <!-- === 2. 文字设置 === -->
                    <div class="form-section" style="padding:10px 12px;margin-bottom:8px">
                        <div class="form-section-title" style="margin-bottom:8px;padding-bottom:6px"><i class="fas fa-font"></i> 文字设置</div>
                        <div class="form-group" style="margin-bottom:12px">
                            <label class="form-label" style="margin-bottom:6px">标题文字</label>
                            <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
                                <input class="form-input" v-model="editForm.sidebarTop.sidebarTitle" placeholder="输入标题文字" style="flex:1;min-width:120px">
                                <div class="title-style-toolbar" style="padding:6px 8px;border:1px solid #e5e7eb;border-radius:6px;background:#f8f9fa;flex-shrink:0">
                            <button class="style-btn" :class="{ active: editForm.sidebarTop.sidebarTitleStyle.bold }" @click="editForm.sidebarTop.sidebarTitleStyle.bold = !editForm.sidebarTop.sidebarTitleStyle.bold" title="加粗">
                                <i class="fas fa-bold"></i>
                            </button>
                            <button class="style-btn" :class="{ active: editForm.sidebarTop.sidebarTitleStyle.italic }" @click="editForm.sidebarTop.sidebarTitleStyle.italic = !editForm.sidebarTop.sidebarTitleStyle.italic" title="斜体">
                                <i class="fas fa-italic"></i>
                            </button>
                            <div class="style-divider"></div>
                            <select class="style-select" v-model="editForm.sidebarTop.sidebarTitleStyle.fontSize">
                                <option value="">字号</option>
                                <option value="12px">12px</option>
                                <option value="14px">14px</option>
                                <option value="16px">16px</option>
                                <option value="18px">18px</option>
                                <option value="20px">20px</option>
                                <option value="24px">24px</option>
                                <option value="28px">28px</option>
                                <option value="32px">32px</option>
                            </select>
                            <div class="style-divider"></div>
                            <input type="color" class="style-color" v-model="editForm.sidebarTop.sidebarTitleStyle.color" title="颜色">
                            <div class="style-divider"></div>
                            <select class="style-select" v-model="editForm.sidebarTop.sidebarTitleStyle.fontFamily">
                                <option value="">字体</option>
                                <option value="Noto Sans SC">思源黑体</option>
                                <option value="PingFang SC">苹方</option>
                                <option value="Microsoft YaHei">微软雅黑</option>
                            </select>
                            </div>
                        </div>
                        </div>
                        <div style="margin-top:10px;padding:8px 12px;border:1px dashed #e5e7eb;border-radius:6px;background:#fff">
                            <span style="color:#999;font-size:12px">预览：</span>
                            <span :style="{
                                fontWeight: editForm.sidebarTop.sidebarTitleStyle.bold ? 'bold' : 'normal',
                                fontStyle: editForm.sidebarTop.sidebarTitleStyle.italic ? 'italic' : 'normal',
                                fontSize: editForm.sidebarTop.sidebarTitleStyle.fontSize || 'inherit',
                                color: editForm.sidebarTop.sidebarTitleStyle.color || 'inherit',
                                fontFamily: editForm.sidebarTop.sidebarTitleStyle.fontFamily ? editForm.sidebarTop.sidebarTitleStyle.fontFamily + ', sans-serif' : 'inherit'
                            }">{{ editForm.sidebarTop.sidebarTitle || '网址导航' }}</span>
                        </div>
                    </div>

                    <!-- === 3. 访客页面左侧背景 === -->
                    <div class="form-section" style="padding:10px 12px;margin-bottom:8px">
                        <div class="form-section-title" style="margin-bottom:8px;padding-bottom:6px"><i class="fas fa-fill-drip"></i> 访客页面左侧背景</div>
                        <div class="form-group" style="margin-bottom:10px">
                            <label class="form-label" style="margin-bottom:6px">背景类型</label>
                            <select class="form-input" v-model="editForm.sidebarTop.sidebarBackground.type">
                                <option value="color">纯色</option>
                                <option value="image">图片</option>
                                <option value="none">无背景（透明）</option>
                            </select>
                        </div>
                        <div v-if="editForm.sidebarTop.sidebarBackground.type === 'color'" class="form-group" style="margin-bottom:10px">
                            <label class="form-label" style="margin-bottom:6px">背景颜色</label>
                            <div style="display:flex;align-items:center;gap:8px">
                                <input type="color" v-model="editForm.sidebarTop.sidebarBackground.color" style="width:40px;height:36px;border:none;cursor:pointer;padding:0;border-radius:4px">
                                <input class="form-input" v-model="editForm.sidebarTop.sidebarBackground.color" style="width:130px;font-family:monospace" placeholder="#ffffff">
                            </div>
                        </div>
                        <div v-if="editForm.sidebarTop.sidebarBackground.type === 'image'">
                            <div class="logo-setting-row">
                                <div class="logo-setting-col">
                                    <div class="form-section-title" style="margin-bottom:8px;padding-bottom:6px"><i class="fas fa-image"></i> 展开背景</div>
                                    <div class="form-group">
                                        <label class="form-label" style="margin-bottom:6px">预览略缩图（点击进入编辑器）</label>
                                        <div class="logo-card-preview" @click.stop="openSidebarBgCropper()" title="点击修改">
                                            <img v-if="editForm.sidebarTop.sidebarBackground.url && (isHttpUrl(editForm.sidebarTop.sidebarBackground.url) || isDataUrl(editForm.sidebarTop.sidebarBackground.url))"
                                                 :src="editForm.sidebarTop.sidebarBackground.url" alt="背景" draggable="false">
                                            <img v-else-if="editForm.sidebarTop.sidebarBackground.url"
                                                 :src="editForm.sidebarTop.sidebarBackground.url" alt="背景" draggable="false" @error="$event.target.style.display='none'">
                                            <i v-else class="fas fa-image placeholder"></i>
                                        </div>
                                    </div>
                                </div>
                                <div class="logo-setting-col">
                                    <div class="form-section-title" style="margin-bottom:8px;padding-bottom:6px"><i class="fas fa-image"></i> 收起背景</div>
                                    <div class="form-group">
                                        <label class="form-label" style="margin-bottom:6px">预览略缩图（点击进入编辑器）</label>
                                        <div class="logo-card-preview" @click.stop="openSidebarBgCollapsedCropper()" title="点击修改">
                                            <img v-if="editForm.sidebarTop.sidebarBackgroundCollapsed.url && (isHttpUrl(editForm.sidebarTop.sidebarBackgroundCollapsed.url) || isDataUrl(editForm.sidebarTop.sidebarBackgroundCollapsed.url))"
                                                 :src="editForm.sidebarTop.sidebarBackgroundCollapsed.url" alt="收起背景" draggable="false">
                                            <img v-else-if="editForm.sidebarTop.sidebarBackgroundCollapsed.url"
                                                 :src="editForm.sidebarTop.sidebarBackgroundCollapsed.url" alt="收起背景" draggable="false" @error="$event.target.style.display='none'">
                                            <i v-else class="fas fa-image placeholder"></i>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <p style="margin:8px 0 0;color:#999;font-size:12px">设置将应用到访客页面左侧边栏背景。默认白色 #ffffff，选「无背景」则透出页面底色。</p>
                    </div>

                    <!-- === 4. 颜色设置（下拉菜单背景） === -->
                    <div class="form-section" style="padding:10px 12px;margin-bottom:8px">
                        <div class="form-section-title" style="margin-bottom:8px;padding-bottom:6px"><i class="fas fa-palette"></i> 颜色设置</div>
                        <div style="display:flex;align-items:center;gap:4px;margin-bottom:4px">
                            <label style="width:120px;text-align:left;font-size:14px;color:var(--text-color);white-space:nowrap;flex-shrink:0">未折叠下拉菜单</label>
                            <div :style="{ width:'36px', height:'32px', border:'1px solid #ccc', borderRadius:'4px', cursor:'pointer', flexShrink:0, background: editForm.sidebarTop.sidebarPopupBackgroundExpanded || '#ffffff' }" @click="openColorPicker({ value: editForm.sidebarTop.sidebarPopupBackgroundExpanded, onConfirm: (val) => { editForm.sidebarTop.sidebarPopupBackgroundExpanded = val; } })" title="点击选择颜色与透明度"></div>
                            <input class="form-input" v-model="editForm.sidebarTop.sidebarPopupBackgroundExpanded" style="width:100px;font-family:monospace" placeholder="#151618">
                        </div>
                        <div style="display:flex;align-items:center;gap:4px">
                            <label style="width:120px;text-align:left;font-size:14px;color:var(--text-color);white-space:nowrap;flex-shrink:0">折叠下拉菜单</label>
                            <div :style="{ width:'36px', height:'32px', border:'1px solid #ccc', borderRadius:'4px', cursor:'pointer', flexShrink:0, background: editForm.sidebarTop.sidebarPopupBackgroundCollapsed || '#ffffff' }" @click="openColorPicker({ value: editForm.sidebarTop.sidebarPopupBackgroundCollapsed, onConfirm: (val) => { editForm.sidebarTop.sidebarPopupBackgroundCollapsed = val; } })" title="点击选择颜色与透明度"></div>
                            <input class="form-input" v-model="editForm.sidebarTop.sidebarPopupBackgroundCollapsed" style="width:100px;font-family:monospace" placeholder="#151618">
                        </div>
                        <div style="display:flex;align-items:center;gap:4px">
                            <label style="width:120px;text-align:left;font-size:14px;color:var(--text-color);white-space:nowrap;flex-shrink:0">文字颜色</label>
                            <div :style="{ width:'36px', height:'32px', border:'1px solid #ccc', borderRadius:'4px', cursor:'pointer', flexShrink:0, background: editForm.sidebarTop.sidebarTextColor || '#ffffff' }" @click="openColorPicker({ value: editForm.sidebarTop.sidebarTextColor, onConfirm: (val) => { editForm.sidebarTop.sidebarTextColor = val; } })" title="点击选择颜色与透明度"></div>
                            <input class="form-input" v-model="editForm.sidebarTop.sidebarTextColor" style="width:100px;font-family:monospace" placeholder="#b2b8be">
                        </div>
                    </div>

                </div>
                    <div class="modal-footer" style="justify-content:flex-end">
                        <button class="btn" @click="modal.sidebarTop = false">取消</button>
                        <button class="btn btn-primary" @click="saveSidebarTop" :disabled="modal.imageCropper || modal.iconEditor">保存</button>
                    </div>
            </div>
        </div>

        <!-- 站点设置 弹窗 -->
        <div v-if="modal.headerConfig" class="modal-overlay">
            <div class="modal" style="width:880px;max-width:94vw">
                <div class="modal-header">
                    <h3><i class="fas fa-cog"></i> 站点设置</h3>
                    <button class="btn-icon" @click="modal.headerConfig = false"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body" style="max-height:75vh;overflow-y:auto">

                    <!-- === 1. 404 页面设置 === -->
                    <div class="form-section">
                        <div class="form-section-title">
                            <i class="fas fa-exclamation-triangle"></i> 404 页面设置
                            <span class="form-section-tag">访问不存在的页面时显示</span>
                        </div>
                        <div class="form-group">
                            <label class="form-label">选择 404 模板（可多选，来源于 <code>template/404/</code>）</label>
                            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px">
                                <label v-for="tpl in error404Templates" :key="tpl" style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:6px 10px;border:1px solid var(--border,#ddd);border-radius:8px;font-size:13px">
                                    <input type="checkbox" :checked="isError404Selected(tpl)" @change="toggleError404Template(tpl)">
                                    <span>{{ tpl }}</span>
                                </label>
                                <span v-if="error404LoadError" style="color:#dc2626;font-size:12px"><i class="fas fa-exclamation-circle"></i> {{ error404LoadError }}</span>
                                <span v-else-if="!error404Templates || !error404Templates.length" style="color:var(--text-muted);font-size:12px">template/404/ 下暂无模板</span>
                            </div>
                        </div>
                        <div class="form-group" style="margin-top:10px">
                            <label class="form-label">路由规则（URL 模式 → 指定 404 模板，未命中则用默认）</label>
                            <div v-for="(rule, i) in editForm.headerConfig.error404.rules" :key="i" style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
                                <input class="form-input" v-model="rule.pattern" placeholder="例如 /test/* （* 为任意字符，可多个，命中 baidu.com/test/任意内容）" style="flex:1;min-width:0;font-family:monospace">
                                <select class="form-input" v-model="rule.template" style="width:170px">
                                    <option v-for="tpl in editForm.headerConfig.error404.templates" :key="tpl" :value="tpl">{{ tpl }}</option>
                                </select>
                                <button class="btn-icon" @click="removeError404Rule(i)" title="删除规则"><i class="fas fa-trash" style="color:var(--danger)"></i></button>
                            </div>
                            <button class="btn-sm" @click="addError404Rule()" style="margin-top:4px"><i class="fas fa-plus"></i> 添加规则</button>
                        </div>
                        <div class="form-group" style="margin-top:10px">
                            <label class="form-label">默认 404 模板（未命中任何规则时使用）</label>
                            <select class="form-input" v-model="editForm.headerConfig.error404.default" style="width:220px">
                                <option v-for="tpl in editForm.headerConfig.error404.templates" :key="tpl" :value="tpl">{{ tpl }}</option>
                            </select>
                        </div>
                    </div>

                    <!-- === 3. 滚动高亮效果 === -->
                    <div class="form-section">
                        <div class="form-section-title">
                            <i class="fas fa-highlighter"></i> 滚动高亮效果
                            <span class="form-section-tag">访客视角点击分类时</span>
                        </div>
                        <div class="form-group">
                            <label class="form-label" style="display:flex;align-items:center;gap:8px">
                                <input type="checkbox" v-model="editForm.headerConfig.scrollHighlight.enabled"> 启用高亮
                                <span class="text-muted" style="font-weight:normal;font-size:12px">（点击侧边栏分类时，目标标题闪烁提示位置）</span>
                            </label>
                        </div>
                        <div v-if="editForm.headerConfig.scrollHighlight.enabled">
                            <div class="form-row">
                                    <div style="display:flex;align-items:center;gap:8px">
                                        <label class="form-label" style="margin:0">高亮颜色</label>
                                        <input type="color" v-model="editForm.headerConfig.scrollHighlight.color"
                                               style="width:36px;height:36px;border:none;cursor:pointer;padding:0;border-radius:4px">
                                        <input class="form-input" v-model="editForm.headerConfig.scrollHighlight.color"
                                               style="width:100px;font-family:monospace" placeholder="#ff6b6b">
                                    </div>
                            </div>
                            <div class="form-row">
                                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                                    <span style="font-size:12px">闪烁次数</span>
                                    <input class="form-input" type="number" v-model.number="editForm.headerConfig.scrollHighlight.blinkCount"
                                           placeholder="3" min="1" max="10" step="1" style="width:60px">
                                    <span style="font-size:12px">单次闪烁</span>
                                    <input class="form-input" type="number" v-model.number="editForm.headerConfig.scrollHighlight.blinkDuration"
                                           placeholder="300" min="100" max="2000" step="50" style="width:80px">
                                    <span style="font-size:12px">ms</span>
                                    <span style="font-size:12px">闪烁间隔</span>
                                    <input class="form-input" type="number" v-model.number="editForm.headerConfig.scrollHighlight.blinkInterval"
                                           placeholder="150" min="0" max="2000" step="50" style="width:80px">
                                    <span style="font-size:12px">ms</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- === 4. 底部备案/版权信息 === -->
                    <div class="form-section">
                        <div class="form-section-title">
                            <i class="fas fa-shield-alt"></i> 底部备案 / 版权信息
                            <span class="form-section-tag">访客页面页脚</span>
                        </div>
                        <div class="form-group">
                            <label class="form-label">说明文字（首行，可包含邮箱）</label>
                            <textarea class="form-textarea" rows="2" v-model="editForm.headerConfig.footer.note"
                                      placeholder="本站内容来自于网络，不对网站内容负责"></textarea>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">版权前缀</label>
                                <input class="form-input" v-model="editForm.headerConfig.footer.copyright"
                                       placeholder="@2025 By">
                            </div>
                            <div class="form-group">
                                <label class="form-label">版权名称（链接显示文字）</label>
                                <input class="form-input" v-model="editForm.headerConfig.footer.copyrightName"
                                       placeholder="NavEditor">
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">版权链接 URL</label>
                            <input class="form-input" v-model="editForm.headerConfig.footer.copyrightUrl"
                                   placeholder="https://github.com/yiming2016/NavEditor">
                        </div>
                        <div class="form-group">
                            <label class="form-label">备案域名<span style="color:var(--text-muted);font-size:12px;margin-left:6px">（不显示在访客页面，仅用于备案查询链接自动填入）</span></label>
                            <input class="form-input" v-model="editForm.headerConfig.footer.domain"
                                   placeholder="example.com（主域名，不带 http:// 和 www）">
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">ICP备案</label>
                                <input class="form-input" v-model="editForm.headerConfig.footer.beian"
                                       placeholder="粤ICP备xxxxxxxx号">
                            </div>
                            <div class="form-group">
                                <label class="form-label">ICP链接</label>
                                <input class="form-input" v-model="editForm.headerConfig.footer.beianUrl"
                                       placeholder="https://beian.miit.gov.cn/#/Integrated/recordQuery">
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">公安备案</label>
                                <input class="form-input" v-model="editForm.headerConfig.footer.gongan"
                                       placeholder="粤公网安备xxxxxxxx号">
                            </div>
                            <div class="form-group">
                                <label class="form-label">公安链接</label>
                                <input class="form-input" v-model="editForm.headerConfig.footer.gonganUrl"
                                       placeholder="https://beian.mps.gov.cn/#/query/webSearch">
                            </div>
                        </div>
                        <div class="footer-config-preview">
                            <div class="footer-config-preview-hint">实际效果预览：</div>
                            <div class="footer-config-preview-content">
                                {{ editForm.headerConfig.footer.note }}<br v-if="editForm.headerConfig.footer.copyrightName || editForm.headerConfig.footer.beian || editForm.headerConfig.footer.gongan"/>
                                <template v-if="editForm.headerConfig.footer.copyrightName">
                                    <template v-if="editForm.headerConfig.footer.copyright">{{ editForm.headerConfig.footer.copyright }} </template>
                                    <a v-if="editForm.headerConfig.footer.copyrightUrl"
                                       :href="editForm.headerConfig.footer.copyrightUrl" target="_blank" rel="noopener">{{ editForm.headerConfig.footer.copyrightName }}</a>
                                    <span v-else>{{ editForm.headerConfig.footer.copyrightName }}</span>
                                </template>
                                <template v-if="editForm.headerConfig.footer.copyrightName && (editForm.headerConfig.footer.beian || editForm.headerConfig.footer.gongan)"> | </template>
                                <a v-if="editForm.headerConfig.footer.beianUrl && editForm.headerConfig.footer.beian"
                                   :href="editForm.headerConfig.footer.beianUrl" target="_blank" rel="noopener">{{ editForm.headerConfig.footer.beian }}</a>
                                <span v-else-if="editForm.headerConfig.footer.beian">{{ editForm.headerConfig.footer.beian }}</span>
                                <template v-if="editForm.headerConfig.footer.beian && editForm.headerConfig.footer.gongan"> | </template>
                                <a v-if="editForm.headerConfig.footer.gonganUrl && editForm.headerConfig.footer.gongan"
                                   :href="editForm.headerConfig.footer.gonganUrl" target="_blank" rel="noopener"><img src="assets/images/gongan.png" alt="公安备案" style="display:inline-block;vertical-align:middle;width:12px;height:auto;margin-right:3px"/>{{ editForm.headerConfig.footer.gongan }}</a>
                                <span v-else-if="editForm.headerConfig.footer.gongan"><img src="assets/images/gongan.png" alt="公安备案" style="display:inline-block;vertical-align:middle;width:12px;height:auto;margin-right:3px"/>{{ editForm.headerConfig.footer.gongan }}</span>
                            </div>
                        </div>
                    </div>

                </div>
                <div class="modal-footer">
                    <button class="btn" @click="modal.headerConfig = false">取消</button>
                    <button class="btn btn-primary" @click="saveHeaderConfig">保存</button>
                </div>
            </div>
        </div>

        <!-- 分类编辑弹窗 -->
        <div v-if="modal.category" class="modal-overlay">
            <div class="modal">
                <div class="modal-header">
                    <h3>{{ editForm.category.id ? '编辑分类' : '添加分类' }}</h3>
                    <button class="btn-icon" @click="modal.category = false"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <div class="cat-edit-row">
                            <div class="cat-icon-preview" @click="openIconPicker('category')" title="点击预览框更换图标">
                                <template v-if="isImageIcon(editForm.category.icon)"><img :src="editForm.category.icon" class="cat-edit-icon-img"></template>
                                <i v-else :class="editForm.category.icon"></i>
                            </div>
                            <div class="cat-name-field">
                                <label class="form-label">分类名称 <span class="required">*</span></label>
                                <input class="form-input" v-model="editForm.category.name" placeholder="如：常用工具" v-focus @keydown.enter.prevent="saveCategory">
                            </div>
                        </div>
                    </div>
                    <div class="form-group" style="display:flex;align-items:center;gap:10px">
                        <label class="form-label" style="margin:0;white-space:nowrap">图标颜色</label>
                        <input type="color" v-model="editForm.category.iconColor" style="width:42px;height:30px;border:none;background:none;cursor:pointer;padding:0">
                        <button type="button" class="btn btn-sm" @click="editForm.category.iconColor='#b2b8be'">恢复默认</button>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn" @click="modal.category = false">取消</button>
                    <button class="btn btn-primary" @click="saveCategory">保存</button>
                </div>
            </div>
        </div>

        <!-- 子分类弹窗 -->
        <div v-if="modal.subCategory" class="modal-overlay">
            <div class="modal">
                <div class="modal-header">
                    <h3>{{ editForm.subCategory.id ? '编辑子分类' : '添加子分类' }}</h3>
                    <button class="btn-icon" @click="modal.subCategory = false"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label class="form-label">子分类名称 <span class="required">*</span></label>
                        <input class="form-input" v-model="editForm.subCategory.name" placeholder="如：生物信息" v-focus @keydown.enter.prevent="saveSubCategory">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn" @click="modal.subCategory = false">取消</button>
                    <button class="btn btn-primary" @click="saveSubCategory">保存</button>
                </div>
            </div>
        </div>

        <!-- 网站编辑弹窗 -->
        <div v-if="modal.siteEdit" class="modal-overlay">
            <div class="modal site-edit-modal">
                <div class="modal-header">
                    <h3>{{ editForm.site.index >= 0 ? '编辑网站' : '添加网站' }}</h3>
                    <button class="btn-icon" @click="modal.siteEdit = false"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <div class="site-edit-layout">
                        <!-- 左侧：图标设置 -->
                        <div class="site-edit-logo">
                            <div class="site-edit-logo-card"
                                 :class="{ 'has-logo': editForm.site.logo || editForm.site.bgType !== 'image' || editForm.site.bgColor }"
                                 @click="openIconSettings()"
                                 :title="'点击设置图标'">
                                <!-- image 类型：显示图片 -->
                                <template v-if="editForm.site.bgType === 'image' && editForm.site.logo">
                                    <img v-if="isDataUrl(editForm.site.logo) || isHttpUrl(editForm.site.logo) || editForm.site.logo.startsWith('./') || editForm.site.logo.startsWith('/')"
                                         :src="(isDataUrl(editForm.site.logo) || isHttpUrl(editForm.site.logo)) ? editForm.site.logo : '../' + editForm.site.logo"
                                         @error="$event.target.style.display='none'">
                                    <div v-else-if="isSvgText(editForm.site.logo)"
                                         v-html="editForm.site.logo"
                                         class="site-edit-logo-svg"></div>
                                    <div v-else class="site-edit-logo-fallback">
                                        <img :src="'../' + editForm.site.logo" @error="$event.target.style.display='none'">
                                    </div>
                                </template>
                                <!-- color 类型：纯色背景 -->
                                <div v-else-if="editForm.site.bgType === 'color' && editForm.site.bgColor"
                                     class="site-edit-logo-color-bg"
                                     :style="{ background: editForm.site.bgColor }">
                                    <span class="site-edit-logo-color-letter">{{ (editForm.site.name || '?').charAt(0).toUpperCase() }}</span>
                                </div>
                                <!-- text 类型：文字图标 -->
                                <div v-else-if="editForm.site.bgType === 'text' && editForm.site.bgText"
                                     class="site-edit-logo-text-icon"
                                     :style="editForm.site.bgColor ? { background: editForm.site.bgColor } : {}">
                                    <span>{{ editForm.site.bgText }}</span>
                                </div>
                                <!-- svg 类型：内联 / 图片 -->
                                <template v-else-if="editForm.site.bgType === 'svg' && editForm.site.logo">
                                    <div v-if="isSvgText(editForm.site.logo)" v-html="editForm.site.logo" class="site-edit-logo-svg"></div>
                                    <img v-else :src="editForm.site.logo" @error="$event.target.style.display='none'">
                                </template>
                                <!-- url 类型：图片 -->
                                <template v-else-if="editForm.site.bgType === 'url' && editForm.site.logo">
                                    <img :src="editForm.site.logo" @error="$event.target.style.display='none'">
                                </template>
                                <!-- 无图标：首字母占位 -->
                                <div v-else class="site-edit-logo-placeholder">
                                    {{ (editForm.site.name || '?').charAt(0).toUpperCase() }}
                                </div>
                                <!-- 悬浮蒙层 + 样式图标 -->
                                <div class="site-edit-logo-overlay">
                                    <i class="fas fa-paint-brush"></i>
                                    <span>设置</span>
                                </div>
                            </div>
                            <button class="btn btn-sm site-edit-fetch-btn"
                                    :disabled="!(editForm.site.url||'').trim()"
                                    @click="autoFillSiteFavicon(editForm.site, editForm.site.url)">
                                <i class="fas fa-globe"></i> 在线获取
                            </button>
                        </div>

                        <!-- 右侧：表单 -->
                        <div class="site-edit-form">
                            <div class="form-group">
                                <label class="form-label">名称 <span class="required">*</span></label>
                                <input class="form-input" v-model="editForm.site.name" placeholder="如：QQ 邮箱">
                            </div>
                            <div class="form-group">
                                <label class="form-label">链接 <span class="required">*</span></label>
                                <input class="form-input" v-model="editForm.site.url" placeholder="http://mail.qq.com/">
                            </div>
                            <div class="form-group">
                                <label class="form-label">描述</label>
                                <textarea class="form-textarea" v-model="editForm.site.description" placeholder="简要介绍这个网站" rows="4"></textarea>
                            </div>

                            <!-- === 闪烁模块（位于右侧表单列内，向左加宽到左侧空白处，弹窗总宽不变） === -->
                            <div class="form-section" style="margin-top:16px;padding-top:14px;border-top:1px solid #e8eaed;margin-left:-148px;padding-right:0">
                                <div class="form-group" style="margin-bottom:0">
                                    <div class="form-label" style="display:flex;align-items:center;gap:8px;cursor:pointer" @click="editForm.site.blink.enabled = !editForm.site.blink.enabled">
                                        <span class="toggle-switch" :class="{ 'active': editForm.site.blink.enabled }" style="position:relative;display:inline-block;width:40px;height:22px;flex-shrink:0;cursor:pointer">
                                            <span class="toggle-slider" style="position:absolute;inset:0;background:#ccc;border-radius:22px;transition:.2s"></span>
                                            <span class="toggle-knob" style="position:absolute;top:3px;left:3px;width:16px;height:16px;background:#fff;border-radius:50%;transition:.2s;box-shadow:0 1px 3px rgba(0,0,0,.3)" :style="{ transform: editForm.site.blink.enabled ? 'translateX(18px)' : 'translateX(0)', background: editForm.site.blink.enabled ? '#597ef7' : '#fff' }"></span>
                                        </span>
                                        <span style="font-weight:600;font-size:14px">闪烁模块</span>
                                        <span class="text-muted" style="font-weight:normal;font-size:12px">（访客视角该网站卡片自动闪烁提示）</span>
                                    </div>
                                </div>

                                <div v-if="editForm.site.blink.enabled" style="padding-left:0">
                                    <!-- 闪烁强度预设 -->
                                    <div class="form-row" style="margin-bottom:12px">
                                        <label class="form-label" style="font-size:13px;font-weight:500;margin-bottom:6px">闪烁强度</label>
                                        <div style="display:flex;gap:8px;flex-wrap:wrap">
                                            <!-- 疯狂闪烁：快速、高频、醒目 -->
                                            <button type="button" class="btn btn-sm"
                                                    :style="{ background: editForm.site.blink.intensity==='crazy' ? '#f0f3ff' : '#f8f9fa', borderColor: editForm.site.blink.intensity==='crazy' ? '#597ef7' : '#ddd', color: editForm.site.blink.intensity==='crazy' ? '#597ef7' : '#555', fontSize:'12px', padding:'5px 10px' }"
                                                    @click.prevent="applyBlinkPreset('crazy')"
                                                    style="border-radius:6px;cursor:pointer;border:1px solid #ddd;background:#f8f9fa;color:#555;font-size:12px;padding:5px 10px">🔥 疯狂闪烁</button>
                                            <!-- 柔和闪烁：慢速、低频、温和 -->
                                            <button type="button" class="btn btn-sm"
                                                    :style="{ background: editForm.site.blink.intensity==='soft' ? '#f0f3ff' : '#f8f9fa', borderColor: editForm.site.blink.intensity==='soft' ? '#597ef7' : '#ddd', color: editForm.site.blink.intensity==='soft' ? '#597ef7' : '#555', fontSize:'12px', padding:'5px 10px' }"
                                                    @click.prevent="applyBlinkPreset('soft')"
                                                    style="border-radius:6px;cursor:pointer;border:1px solid #ddd;background:#f8f9fa;color:#555;font-size:12px;padding:5px 10px">✨ 柔和闪烁</button>
                                            <!-- 普通闪烁：中等参数 -->
                                            <button type="button" class="btn btn-sm"
                                                    :style="{ background: editForm.site.blink.intensity==='normal' || (!editForm.site.blink.intensity && !editForm.site.blink._custom) ? '#f0f3ff' : '#f8f9fa', borderColor: (editForm.site.blink.intensity==='normal' || (!editForm.site.blink.intensity && !editForm.site.blink._custom)) ? '#597ef7' : '#ddd', color: (editForm.site.blink.intensity==='normal' || (!editForm.site.blink.intensity && !editForm.site.blink._custom)) ? '#597ef7' : '#555', fontSize:'12px', padding:'5px 10px' }"
                                                    @click.prevent="applyBlinkPreset('normal')"
                                                    style="border-radius:6px;cursor:pointer;border:1px solid #ddd;background:#f8f9fa;color:#555;font-size:12px;padding:5px 10px">💡 普通闪烁</button>
                                            <!-- 自定义：用户自己调参 -->
                                            <button type="button" class="btn btn-sm"
                                                    :style="{ background: editForm.site.blink._custom ? '#f0f3ff' : '#f8f9fa', borderColor: editForm.site.blink._custom ? '#597ef7' : '#ddd', color: editForm.site.blink._custom ? '#597ef7' : '#555', fontSize:'12px', padding:'5px 10px' }"
                                                    @click.prevent="editForm.site.blink._custom=true;editForm.site.blink.intensity=''"
                                                    style="border-radius:6px;cursor:pointer;border:1px solid #ddd;background:#f8f9fa;color:#555;font-size:12px;padding:5px 10px">⚙️ 自定义</button>
                                        </div>
                                    </div>

                                    <!-- 模式行 -->
                                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">
                                        <span style="font-size:13px;font-weight:500">模式</span>
                                        <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:12px;padding:4px 10px;border:1px solid;border-radius:5px;white-space:nowrap"
                                               :style="{ borderColor: editForm.site.blink.mode==='count'?'#597ef7':'#e0e0e0',background:editForm.site.blink.mode==='count'?'#f0f3ff':'transparent',color:editForm.site.blink.mode==='count'?'#597ef7':'#666' }"
                                               @click.prevent="editForm.site.blink.mode='count'">
                                            <input type="radio" :value="'count'" v-model="editForm.site.blink.mode" style="display:none"> 闪烁N次
                                        </label>
                                        <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:12px;padding:4px 10px;border:1px solid;border-radius:5px;white-space:nowrap"
                                               :style="{ borderColor: editForm.site.blink.mode==='continuous'?'#597ef7':'#e0e0e0',background:editForm.site.blink.mode==='continuous'?'#f0f3ff':'transparent',color:editForm.site.blink.mode==='continuous'?'#597ef7':'#666' }"
                                               @click.prevent="editForm.site.blink.mode='continuous'">
                                            <input type="radio" :value="'continuous'" v-model="editForm.site.blink.mode" style="display:none"> 持续闪烁
                                        </label>
                                    </div>
                                    <!-- 高级参数（始终显示，预设点击后自动填充） -->
                                    <div class="form-row" style="margin-bottom:10px">
                                        <div class="form-group" v-if="editForm.site.blink.mode === 'count'">
                                            <label class="form-label" style="font-size:12px">次数</label>
                                            <input class="form-input" type="number" v-model.number="editForm.site.blink.count"
                                                   placeholder="3" min="1" max="30" step="1" style="font-size:13px">
                                        </div>
                                        <div class="form-group">
                                            <label class="form-label" style="font-size:12px">亮起时长 (ms)</label>
                                            <input class="form-input" type="number" v-model.number="editForm.site.blink.duration"
                                                   placeholder="300" min="50" max="3000" step="50" style="font-size:13px">
                                        </div>
                                        <div class="form-group">
                                            <label class="form-label" style="font-size:12px">暗间隔 (ms)</label>
                                            <input class="form-input" type="number" v-model.number="editForm.site.blink.interval"
                                                   placeholder="150" min="0" max="2000" step="25" style="font-size:13px">
                                        </div>
                                        <div class="form-group">
                                            <label class="form-label" style="font-size:12px">闪烁颜色</label>
                                            <div style="display:flex;align-items:center;gap:6px">
                                                <input type="color" v-model="editForm.site.blink.color"
                                                       style="width:30px;height:30px;border:none;cursor:pointer;padding:0;border-radius:4px">
                                                <input class="form-input" v-model="editForm.site.blink.color"
                                                       style="width:80px;font-family:monospace;font-size:12px" placeholder="#ff6b6b">
                                            </div>
                                        </div>
                                    </div>

                                    <!-- 使用模版：选择 + 管理 -->
                                    <div style="margin-top:10px;padding-top:10px;border-top:1px dashed #e0e0e0">
                                        <label class="form-label" style="font-size:12px;font-weight:500;margin-bottom:6px">📋 闪烁模版</label>
                                        <div style="display:flex;align-items:center;gap:8px">
                                            <select class="form-input" v-model="editForm.site.blink.templateName"
                                                    @change="applyBlinkTemplate(editForm.site.blink.templateName)"
                                                    style="flex:1;font-size:13px">
                                                <option value="">-- 选择闪烁模版 --</option>
                                                <option v-for="(tpl,idx) in data.blinkTemplates" :key="idx" :value="tpl.name">{{ tpl.name }}
                                                    ({{ tpl.settings.count }}次/{{ tpl.settings.duration }}ms)</option>
                                            </select>
                                        </div>
                                        <!-- 已选模版的预览 -->
                                        <div v-if="editForm.site.blink.templateName" class="blink-template-preview"
                                             style="background:#f8f9fa;border-radius:8px;padding:10px 12px;font-size:12px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
                                            <span style="color:#888">已选:</span>
                                            <strong>{{ editForm.site.blink.templateName }}</strong>
                                            <span class="text-muted">| {{ editForm.site.blink.count }}次 · {{ editForm.site.blink.duration }}ms亮 · {{ editForm.site.blink.interval }}ms间</span>
                                            <span style="width:16px;height:16px;border-radius:4px;display:inline-block;vertical-align:middle" :style="{ background: editForm.site.blink.color }"></span>
                                        </div>
                                        <!-- 保存当前为模版 -->
                                        <div style="border-top:1px dashed #ddd;padding-top:10px">
                                            <label class="form-label" style="font-size:12px;margin-bottom:4px">保存为闪烁模版</label>
                                            <div style="display:flex;align-items:center;gap:6px">
                                                <input class="form-input" v-model="editForm.site.blink.templateName" placeholder="输入模版名称..."
                                                       style="flex:1;font-size:12px" @keyup.enter="saveBlinkTemplate()">
                                                <button class="btn btn-primary btn-sm" @click="saveBlinkTemplate()" style="white-space:nowrap;font-size:12px">
                                                    <i class="fas fa-save"></i> 保存
                                                </button>
                                            </div>
                                        </div>
                                        <!-- 现有模版列表 + 删除 -->
                                        <div v-if="data.blinkTemplates.length > 0">
                                            <label class="form-label" style="font-size:12px;margin-bottom:4px">管理现有模版</label>
                                            <div style="display:flex;flex-direction:column;gap:4px">
                                                <div v-for="(tpl,idx) in data.blinkTemplates" :key="idx"
                                                     style="display:flex;align-items:center;justify-content:space-between;padding:5px 8px;background:#fafafa;border-radius:6px;font-size:12px">
                                                    <span style="display:flex;align-items:center;gap:6px">
                                                        <strong>{{ tpl.name }}</strong>
                                                        <span class="text-muted">{{ tpl.settings.count }}次 / {{ tpl.settings.duration }}ms / {{ tpl.settings.interval }}ms</span>
                                                        <span style="width:12px;height:12px;border-radius:3px;display:inline-block" :style="{ background: tpl.settings.color }"></span>
                                                    </span>
                                                    <button class="btn-icon btn-sm text-danger" @click="deleteBlinkTemplate(idx)"
                                                            title="删除此模版" style="font-size:11px"><i class="fas fa-trash-alt"></i></button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>


                        </div>
                    </div>

                
                </div>
                <div class="modal-footer">
                    <button class="btn" @click="modal.siteEdit = false">取消</button>
                    <button class="btn btn-primary" @click="saveSite">保存</button>
                </div>
            </div>
        </div>

        <!-- 图标选择器弹窗 -->
        <div v-if="modal.iconPicker" class="modal-overlay" style="z-index:1100">
            <div class="modal modal-lg">
                <div class="modal-header">
                    <h3>选择图标</h3>
                    <button class="btn-icon" @click="modal.iconPicker = false"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <div class="icon-grid">
                        <div v-for="icon in faIcons" :key="icon"
                             class="icon-grid-item"
                             :class="{ selected: editForm.iconPicker.current === icon }"
                             @click="selectIcon(icon)">
                            <i :class="icon"></i>
                        </div>
                    </div>
                    <div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border);display:flex;justify-content:center;gap:12px">
                        <button class="btn" @click="modal.iconPicker = false">
                            <i class="fas fa-times"></i> 取消
                        </button>
                        <button class="btn btn-primary" @click="openCategoryIconCropper(editForm.iconPicker.current)">
                            <i class="fas fa-upload"></i> 自定义图标
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- 友情链接专属设置页（区别于其他页脚项的通用编辑弹窗） -->
        <div v-if="modal.friendLinks" class="modal-overlay">
            <div class="modal" style="border-top:4px solid #3b82f6;max-width:580px">
                <div class="modal-header" style="background:#f0f6ff;border-bottom:1px solid #d6e4ff">
                    <div>
                        <h3 style="margin:0">友情链接设置</h3>
                        <span style="font-size:12px;color:#3b82f6">页脚菜单专属设置</span>
                    </div>
                    <button class="btn-icon" @click="modal.friendLinks = false"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <!-- 第一块：页脚按钮外观 -->
                    <div style="margin-bottom:18px">
                        <div style="color:#2563eb;font-weight:600;border-left:3px solid #3b82f6;padding-left:8px;margin:0 0 10px">页脚按钮外观</div>
                        <div class="footer-menu-edit-row">
                            <div class="footer-menu-icon-col" style="display:flex;flex-direction:column;align-items:center;gap:8px">
                                <div class="footer-menu-icon-preview" @click="openIconPickerForFriendLink()" title="点击预览框更换图标">
                                    <i :class="friendLinkSettings.icon || 'fas fa-link'" class="footer-menu-icon-img"></i>
                                </div>
                                <input type="color" v-model="friendLinkSettings.iconColor" style="width:42px;height:30px;border:none;background:none;cursor:pointer;padding:0">
                                <button type="button" class="btn btn-sm" @click="friendLinkSettings.iconColor='#b2b8be'">默认颜色</button>
                            </div>
                            <div class="footer-menu-name-field" style="display:flex;flex-direction:column;gap:10px;flex:1">
                                <div style="display:flex;align-items:center;gap:10px">
                                    <label class="form-label" style="margin:0;white-space:nowrap">按钮名称</label>
                                    <input class="form-input" v-model="friendLinkSettings.text" placeholder="如：友情链接" @keyup.enter="saveFriendLinks" style="flex:1">
                                </div>
                            </div>
                        </div>
                    </div>
                    <!-- 第二块：友情链接列表 -->
                    <div>
                        <div style="color:#2563eb;font-weight:600;border-left:3px solid #3b82f6;padding-left:8px;margin:0 0 10px">友情链接列表 <span style="color:#94a3b8;font-weight:400;font-size:12px">（拖动 <i class="fas fa-grip-vertical"></i> 可排序）</span></div>
                        <div>
                            <div v-for="(link, i) in editForm.friendLinks" :key="link.id || ('fl-' + i)"
                                 draggable="true"
                                 @dragstart="onFlDragStart(i)"
                                 @dragover.prevent="onFlDragOver(i)"
                                 @drop="onFlDrop(i)"
                                 @dragend="onFlDragEnd"
                                 :style="(flDragOverIndex === i) ? 'display:flex;align-items:center;gap:8px;padding:6px 8px;background:#eff6ff;border:1px solid #3b82f6;border-radius:6px;margin-bottom:6px' : 'display:flex;align-items:center;gap:8px;padding:6px 8px;background:#fff;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:6px'">
                                <span style="cursor:grab;color:#94a3b8" title="拖动排序"><i class="fas fa-grip-vertical"></i></span>
                                <input class="form-input" v-model="link.name" placeholder="名称" style="flex:1">
                                <input class="form-input" v-model="link.url" placeholder="网址 URL" style="flex:2">
                                <button class="btn btn-danger btn-sm" @click="removeFriendLink(i)"><i class="fas fa-trash"></i></button>
                            </div>
                            <div v-if="!editForm.friendLinks.length" style="color:#94a3b8;font-size:13px;padding:8px 0">还没有友情链接，点下面按钮添加</div>
                        </div>
                        <button class="btn btn-sm" @click="addFriendLink"><i class="fas fa-plus"></i> 添加链接</button>
                    </div>
                </div>
                <div class="modal-footer" style="display:flex;align-items:center;justify-content:space-between">
                    <span style="color:#94a3b8;font-size:12px">保存后同步更新页脚显示</span>
                    <div style="display:flex;gap:8px">
                        <button class="btn" @click="modal.friendLinks = false">取消</button>
                        <button class="btn btn-primary" @click="saveFriendLinks">保存</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- 添加页脚自定义菜单 -->
        <div v-if="modal.addFooterMenu" class="modal-overlay">
            <div class="modal">
                <div class="modal-header">
                    <h3>添加页脚菜单</h3>
                    <button class="btn-icon" @click="modal.addFooterMenu = false"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <div class="footer-menu-edit-row">
                        <div class="footer-menu-icon-col" style="display:flex;flex-direction:column;align-items:center;gap:8px">
                            <div class="footer-menu-icon-preview" @click="openIconPickerForFooterMenu('add')" title="点击预览框更换图标">
                                <i :class="footerMenuForm.icon || 'fas fa-link'" class="footer-menu-icon-img"></i>
                            </div>
                            <input type="color" v-model="footerMenuForm.iconColor" style="width:42px;height:30px;border:none;background:none;cursor:pointer;padding:0">
                            <button type="button" class="btn btn-sm" @click="footerMenuForm.iconColor='#b2b8be'">默认颜色</button>
                        </div>
                        <div class="footer-menu-name-field" style="display:flex;flex-direction:column;gap:10px;flex:1">
                            <!-- 第1行：菜单名称 + 新窗口打开 -->
                            <div style="display:flex;align-items:center;gap:10px">
                                <label class="form-label" style="margin:0;white-space:nowrap">菜单名称</label>
                                <input class="form-input" v-model="footerMenuForm.text" placeholder="如：联系我们" @keyup.enter="saveFooterMenu" style="flex:1">
                                <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;white-space:nowrap">
                                    <input type="checkbox" v-model="footerMenuForm.target" true-value="_blank" false-value=""> 新窗口打开
                                </label>
                            </div>
                            <!-- 第2行：模板 -->
                            <div style="display:flex;align-items:center;gap:10px">
                                <label class="form-label" style="margin:0;white-space:nowrap">模板</label>
                                <select class="form-input" v-model="footerMenuForm.template" style="flex:1">
                                    <option v-for="tpl in footerAvailableTemplates" :key="tpl" :value="tpl">{{ tpl }}</option>
                                </select>
                                <button type="button" class="btn btn-sm" @click="pickTemplateFile">选择文件</button>
                            </div>
                            <!-- 第3行：链接地址 -->
                            <div style="display:flex;align-items:center;gap:10px">
                                <label class="form-label" style="margin:0;white-space:nowrap">链接地址</label>
                                <input class="form-input" v-model="footerMenuForm.url" placeholder="如：footer/test.html（站点根目录下的相对路径）" @keyup.enter="saveFooterMenu" style="flex:1">
                                <button type="button" class="btn btn-sm" @click="pickFooterFile">选择文件</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer" style="display:flex;align-items:center;justify-content:flex-end;gap:8px">
                    <button class="btn" @click="modal.addFooterMenu = false">取消</button>
                    <button class="btn btn-primary" @click="saveFooterMenu">添加</button>
                </div>
            </div>
        </div>

        <!-- 编辑页脚菜单弹窗 -->
        <div v-if="modal.editFooterMenu" class="modal-overlay">
            <div class="modal">
                <div class="modal-header">
                    <h3>编辑页脚菜单</h3>
                    <button class="btn-icon" @click="modal.editFooterMenu = false"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <div class="footer-menu-edit-row">
                        <div class="footer-menu-icon-col" style="display:flex;flex-direction:column;align-items:center;gap:8px">
                            <div class="footer-menu-icon-preview" @click="openIconPickerForFooterMenu('edit')" title="点击预览框更换图标">
                                <i :class="footerEditForm.icon || 'fas fa-link'" class="footer-menu-icon-img"></i>
                            </div>
                            <input type="color" v-model="footerEditForm.iconColor" style="width:42px;height:30px;border:none;background:none;cursor:pointer;padding:0">
                            <button type="button" class="btn btn-sm" @click="footerEditForm.iconColor='#b2b8be'">默认颜色</button>
                        </div>
                        <div class="footer-menu-name-field" style="display:flex;flex-direction:column;gap:10px;flex:1">
                            <!-- 第1行：菜单名称 + 新窗口打开 -->
                            <div style="display:flex;align-items:center;gap:10px">
                                <label class="form-label" style="margin:0;white-space:nowrap">菜单名称</label>
                                <input class="form-input" v-model="footerEditForm.text" placeholder="如：关于导航" @keyup.enter="saveEditFooterMenu" style="flex:1">
                                <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;white-space:nowrap">
                                    <input type="checkbox" v-model="footerEditForm.target" true-value="_blank" false-value=""> 新窗口打开
                                </label>
                            </div>
                            <!-- 第2行：模板 -->
                            <div style="display:flex;align-items:center;gap:10px">
                                <label class="form-label" style="margin:0;white-space:nowrap">模板</label>
                                <select class="form-input" v-model="footerEditForm.template" style="flex:1">
                                    <option v-for="tpl in footerAvailableTemplates" :key="tpl" :value="tpl">{{ tpl }}</option>
                                </select>
                                <button type="button" class="btn btn-sm" @click="pickTemplateFile">选择文件</button>
                            </div>
                            <!-- 第3行：链接地址 -->
                            <div style="display:flex;align-items:center;gap:10px">
                                <label class="form-label" style="margin:0;white-space:nowrap">链接地址</label>
                                <input class="form-input" v-model="footerEditForm.url" placeholder="如：footer/test.html（站点根目录下的相对路径）" @keyup.enter="saveEditFooterMenu" style="flex:1">
                                <button type="button" class="btn btn-sm" @click="pickFooterFile">选择文件</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer" style="display:flex;align-items:center;justify-content:flex-end;gap:8px">
                    <button class="btn" @click="modal.editFooterMenu = false">取消</button>
                    <button class="btn btn-primary" @click="saveEditFooterMenu">保存</button>
                </div>
            </div>
        </div>

        <!-- 版本历史弹窗 -->
        <div v-if="modal.versions" class="modal-overlay">
            <div class="modal modal-version-history">
                <div class="modal-header">
                    <h3 style="font-size:22px">版本历史</h3>
                    <button class="btn btn-primary" @click="createVersionFromTemplate" title="使用默认模板新建版本" style="padding:8px 16px;font-size:14px;margin-left:10px">
                        <i class="fas fa-plus"></i> 新建
                    </button>
                    <div style="display:flex;align-items:center;gap:8px;margin-left:auto;margin-right:12px">
                        <button class="btn btn-sm btn-sky" @click="importVersionFile" title="导入 .naveditor 分享包或 JSON（可勾选板块）">
                            <i class="fas fa-file-import"></i> 导入
                        </button>
                        <button class="btn btn-sm btn-excel" @click="importExcelVersion" title="从 Excel（.xlsx/.csv）批量导入网址清单，按行顺序生成新版本" style="margin-left:6px">
                            <i class="fas fa-file-excel"></i> .excel导入
                        </button>
                        <button class="btn btn-sm btn-excel" @click="importBookmarksGenerator" title="把浏览器导出的书签（HTML）转换为系统可识别的 Excel 文件" style="margin-left:6px">
                            <i class="fas fa-bookmark"></i> .excel生成器
                        </button>
                        <button class="btn btn-sm btn-slate" @click="openTemplateSettings" title="管理默认模板">
                            <i class="fas fa-cog"></i> 设置
                        </button>
                    </div>
                    <button class="btn-icon" @click="modal.versions = false"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <div class="version-list" v-if="versions.length > 0">
                        <div v-for="v in versions" :key="v.id" class="version-item" :data-version-id="v.id"
                             :class="{ starred: v.starred, current: v.id === currentEditingVersionId, dragging: draggingVersionId === v.id }"
                             @click="selectCurrentVersion(v)" style="cursor:pointer" title="点击切换到该版本进行编辑">
                            <i class="fas fa-grip-vertical version-drag-handle" title="拖动排序"
                               @mousedown.prevent.stop="startVersionDrag($event, v)"></i>
                            <button class="version-star" @click.stop="toggleStarVersion(v)" :title="v.starred ? '取消收藏' : '收藏此版本'">
                                <i :class="v.starred ? 'fas fa-star' : 'far fa-star'"></i>
                            </button>
                            <div class="version-item-info">
                                <div v-if="renamingVersion !== v.id" style="display:flex;align-items:center;gap:4px;font-size:16px;font-weight:500">
                                    <span>{{ v.note }}</span>
                                    <i class="fas fa-pen" style="font-size:13px;color:var(--text-muted);cursor:pointer;opacity:0.55" @click.stop="startRenameVersion(v)" title="重命名"></i>
                                </div>
                                <div v-else style="display:flex;gap:6px;align-items:center">
                                    <input class="form-input version-rename-input" v-model="renameNote" style="flex:1;min-width:0;padding:6px 10px;font-size:13px" @keyup.enter="confirmRenameVersion(v)" @keyup.esc="cancelRenameVersion">
                                    <button class="btn-icon" @click.stop="confirmRenameVersion(v)" title="确定" style="padding:6px;flex-shrink:0"><i class="fas fa-check" style="color:var(--success);font-size:22px"></i></button>
                                    <button class="btn-icon" @click.stop="cancelRenameVersion" title="取消" style="padding:6px;flex-shrink:0"><i class="fas fa-times" style="color:var(--danger);font-size:22px"></i></button>
                                </div>
                                <div style="font-size:11px;color:var(--text-muted);margin-top:2px;display:flex;align-items:center;gap:8px">
                                    <span>{{ Utils.formatTime(v.timestamp) }}</span>
                                    <span v-if="v.starred" style="color:#f59e0b;margin-left:0"><i class="fas fa-star"></i></span>
                                </div>
                            </div>
                            <div style="display:flex;gap:12px;flex-shrink:0;align-items:flex-start">
                                <!-- 左侧一列：所在位置 / 访客视角（同尺寸、不同配色） -->
                                <div style="display:flex;flex-direction:column;gap:6px">
                                    <button class="btn btn-sm btn-slate" @click.stop="openVersionLocation(v)" title="打开版本所在文件夹" style="padding:6px 12px;font-size:13px;white-space:nowrap;display:flex;align-items:center;justify-content:center;width:84px">
                                        <i class="fas fa-folder-open"></i> 所在位置
                                    </button>
                                    <button class="btn btn-sm btn-sky" @click.stop="previewVersion(v)" title="访客视角预览此版本" style="padding:6px 12px;font-size:13px;white-space:nowrap;display:flex;align-items:center;justify-content:center;width:84px">
                                        <i class="fas fa-external-link-alt"></i> 访客视角
                                    </button>
                                </div>
                                <!-- 右侧两行三列：分享/增量发布/新页面编辑 上排；.excel导出/同步信息/删除 下排 -->
                                <div style="display:flex;flex-direction:column;gap:6px">
                                    <div style="display:flex;gap:6px">
                                        <button class="btn btn-sm btn-blue" @click.stop="shareVersion(v)" title="导出为 .naveditor 分享包（可勾选板块）" style="padding:6px 12px;font-size:13px;white-space:nowrap;display:flex;align-items:center;justify-content:center;width:110px">
                                            <i class="fas fa-share-alt"></i> 分享
                                        </button>
                                        <button class="btn btn-sm btn-success" @click.stop="publishVersion(v)" :title="versionSyncState(v) === 'synced' ? '该版本最后一次修改已发布到 ' + (activeAccountName || '当前账号') + '（绿色=已同步）' : (versionSyncState(v) === 'pending' ? '该版本存在未发布的修改，点击增量发布' : '增量发布到 ' + (activeAccountName || '未选择账号'))" style="padding:6px 12px;font-size:13px;white-space:nowrap;display:flex;align-items:center;justify-content:center;width:110px">
                                            <i class="fas fa-cloud-upload-alt"></i> 增量发布
                                        </button>
                                        <button class="btn btn-sm btn-violet" @click.stop="editVersionInEditor(v)" title="加载此版本并在新页面编辑" style="padding:6px 12px;font-size:13px;white-space:nowrap;display:flex;align-items:center;justify-content:center;width:110px">
                                            <i class="fas fa-edit"></i> 新页面编辑
                                        </button>
                                    </div>
                                    <div style="display:flex;gap:6px">
                                        <button class="btn btn-sm btn-excel" @click.stop="exportVersionExcel(v)" title="导出为 Excel 网址清单（.xlsx）" style="padding:6px 12px;font-size:13px;white-space:nowrap;display:flex;align-items:center;justify-content:center;width:110px">
                                            <i class="fas fa-file-excel"></i> .excel导出
                                        </button>
                                        <button class="btn btn-sm btn-orange" @click.stop="openVersionSyncInfo(v)" title="查看该版本发布过哪些账号、最后同步时间与未发布修改" style="padding:6px 12px;font-size:13px;white-space:nowrap;display:flex;align-items:center;justify-content:center;width:110px">
                                            <i class="fas fa-sync-alt"></i> 同步信息
                                        </button>
                                        <button class="btn btn-sm btn-danger" @click.stop="deleteVersion(v)" title="删除" style="padding:6px 12px;font-size:13px;white-space:nowrap;display:flex;align-items:center;justify-content:center;width:110px">
                                            <i class="fas fa-trash"></i> 删除
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div v-else class="empty-state">
                        <i class="fas fa-history"></i>
                        <p>暂无版本记录</p>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn" @click="modal.versions = false">关闭</button>
                </div>
            </div>
        </div>

        <!-- 分享 / 导入 板块选择弹窗 -->
        <div v-if="modal.shareModules" class="modal-overlay">
            <div class="modal" style="width:600px;max-width:92vw">
                <div class="modal-header">
                    <h3><i class="fas fa-share-alt" style="color:var(--primary)"></i> {{ shareDraft.mode === 'share' ? '导出分享包' : '导入' }}</h3>
                    <button class="btn-icon" @click="modal.shareModules = false"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <div v-if="shareDraft.mode === 'import'" style="font-size:12px;color:var(--text-muted);margin-bottom:10px">
                        将导入为新的历史版本，未勾选的板块保留当前站点内容。
                    </div>
                    <div v-else style="font-size:12px;color:var(--text-muted);margin-bottom:10px">
                        将导出为 .naveditor 分享包（不含账号凭证、发布基线等敏感信息）。
                    </div>
                    <div class="form-label">选择要{{ shareDraft.mode === 'share' ? '分享' : '导入' }}的板块：</div>
                    <div style="display:flex;flex-direction:column;gap:8px;margin-top:6px">
                        <label v-for="m in shareModulesList" :key="m.key" style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;padding:8px 10px;border:1px solid var(--border,#ddd);border-radius:8px">
                            <input type="checkbox" v-model="shareDraft.modules[m.key]" style="margin-top:2px">
                            <span>
                                <span style="font-weight:600">{{ m.label }}</span>
                                <span style="font-size:12px;color:var(--text-muted);margin-left:6px">{{ m.desc }}</span>
                            </span>
                        </label>
                    </div>
                    <label v-if="shareDraft.mode === 'share'" style="display:flex;align-items:center;gap:8px;margin-top:12px;cursor:pointer">
                        <input type="checkbox" v-model="shareDraft.includeDeploy">
                        <span style="font-size:13px">包含部署文件快照（自定义页面/素材，导入时原样还原）</span>
                    </label>
                </div>
                <div class="modal-footer">
                    <button class="btn" @click="modal.shareModules = false">取消</button>
                    <button class="btn btn-primary" @click="shareDraft.mode === 'share' ? confirmShare() : confirmImport()">
                        {{ shareDraft.mode === 'share' ? '生成分享包' : '确认导入' }}
                    </button>
                </div>
            </div>
        </div>

        <!-- 书签映射器：左=原书签多级树，右=两级映射结果 -->
        <!-- 点击空白处关闭右键菜单（菜单自身点击不冒泡，菜单项各自处理后关闭） -->
        <div v-if="bookmarkMapper.open" class="modal-overlay" @click="closeBookmarkCtx" @contextmenu.prevent>
            <div class="modal" style="max-width:980px;width:980px">
                <div class="modal-header">
                    <h3><i class="fas fa-bookmark" style="color:var(--primary)"></i> 书签映射器</h3>
                    <div style="margin-left:auto;margin-right:12px;font-size:12px;color:var(--text-muted)">右键左侧文件夹，拆分到右侧（未拆分的不会显示）</div>
                    <button class="btn-icon" @click="closeBookmarkMapper"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body" style="display:flex;gap:12px;padding:14px;max-height:66vh">
                    <!-- 左：原书签多级树 -->
                    <div style="flex:1;border:1px solid var(--border);border-radius:8px;overflow:auto;padding:8px;max-height:60vh;min-width:0">
                        <div style="font-weight:600;font-size:13px;margin-bottom:8px"><i class="fas fa-sitemap" style="color:var(--text-muted);margin-right:4px"></i>原书签（多级）
                            <span style="font-size:11px;color:var(--text-muted);font-weight:400;margin-left:6px">{{ bookmarkLeftStats.folders }} 个书签 {{ bookmarkLeftStats.sites }} 个网站</span>
                        </div>
                        <div v-for="item in visibleBookmarkFlat" :key="item.key"
                             class="bookmark-tree-item"
                             :style="'padding-left:' + (item.depth * 18 + 4) + 'px'"
                             @click.stop="clickBookmarkNode(item)"
                             @contextmenu.prevent="openBookmarkCtx($event, item)"
                             :title="item.folder ? '右键拆分到右侧' : item.url">
                            <i :class="item.folder ? (item.expanded ? 'fas fa-folder-open' : 'fas fa-folder') : 'fas fa-link'"
                               style="width:16px;font-size:12px;color:var(--text-muted);flex-shrink:0"></i>
                            <span style="font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ item.name }}</span>
                            <span v-if="isBookmarkPrimaryReady(item)" title="适合一级分类：下有多个子文件夹且无网站、子文件夹内无更深文件夹" style="margin-left:6px;font-size:10px;color:#16a34a;border:1px solid rgba(22,163,74,.45);border-radius:4px;padding:0 4px;flex-shrink:0;line-height:1.5">一级</span>
                            <span v-if="isBookmarkSecondaryReady(item)" title="可二级分类（只有网站，无子文件夹）" style="margin-left:6px;font-size:10px;color:#0ea5e9;border:1px solid rgba(14,165,233,.45);border-radius:4px;padding:0 4px;flex-shrink:0;line-height:1.5">二级</span>
                            <button v-if="isBookmarkSplitable(item)" class="btn-icon" @click.stop="bookmarkSplitLevels(item.key)" title="逐级拆分（多级书签，从最深两层开始）" style="margin-left:auto;padding:2px 6px;flex-shrink:0">
                                <i class="fas fa-layer-group" style="font-size:11px;color:#8b5cf6"></i>
                            </button>
                        </div>
                    </div>
                    <!-- 右：两级映射结果 -->
                    <div style="flex:1;border:1px solid var(--border);border-radius:8px;overflow:auto;padding:8px;max-height:60vh;min-width:0">
                        <div style="font-weight:600;font-size:13px;margin-bottom:8px"><i class="fas fa-th-large" style="color:var(--text-muted);margin-right:4px"></i>映射结果（两级）
                            <span style="font-size:11px;color:var(--text-muted);font-weight:400;margin-left:6px">{{ bookmarkRightStats.cats }} 个主分类 {{ bookmarkRightStats.subs }} 个子分类 {{ bookmarkRightStats.sites }} 个网站</span>
                        </div>
                        <div v-if="bookmarkMapper.right.length === 0" style="font-size:12px;color:var(--text-muted);padding:24px 0;text-align:center">左侧右键拆分后显示在这里</div>
                        <div v-for="(cat, ci) in bookmarkMapper.right" :key="'c'+ci" class="bookmark-right-cat">
                            <div style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;padding:4px 6px;border-radius:6px;background:rgba(120,120,140,0.08);cursor:pointer;user-select:none"
                                 @click="toggleRightCat(cat)" title="点击展开/收起子分类">
                                <i :class="cat.expanded ? 'fas fa-folder-open' : 'fas fa-folder'" style="color:var(--primary);width:16px;font-size:12px;flex-shrink:0"></i>
                                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ cat.name }}</span>
                                <span style="font-size:11px;color:var(--text-muted);flex-shrink:0">{{ cat.subs.length }} 子分类</span>
                                <i class="fas fa-chevron-down" style="margin-left:auto;font-size:10px;color:var(--text-muted);flex-shrink:0;transition:transform .15s" :style="cat.expanded ? '' : 'transform:rotate(-90deg)'"></i>
                                <button class="btn-icon" @click.stop="removeBookmarkRight(ci)" title="移除" style="padding:2px 6px;flex-shrink:0">
                                    <i class="fas fa-times" style="font-size:11px;color:var(--danger)"></i>
                                </button>
                            </div>
                            <template v-if="cat.expanded" v-for="(sub, si) in cat.subs" :key="'s'+ci+'-'+si">
                                <div style="padding-left:18px;font-size:12px;margin:2px 0;display:flex;align-items:center;gap:4px;cursor:pointer;user-select:none;border-radius:5px;padding-top:3px;padding-bottom:3px"
                                     @click="toggleRightSub(sub)" title="点击展开/收起网站">
                                    <i :class="sub.expanded ? 'fas fa-folder-open' : 'fas fa-folder'" style="color:var(--text-muted);width:14px;font-size:11px;flex-shrink:0"></i>
                                    <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ sub.name }}</span>
                                    <span style="color:var(--text-muted);font-size:11px;flex-shrink:0">（{{ sub.sites.length }} 个网站）</span>
                                    <i class="fas fa-chevron-down" style="margin-left:auto;font-size:9px;color:var(--text-muted);flex-shrink:0;transition:transform .15s" :style="sub.expanded ? '' : 'transform:rotate(-90deg)'"></i>
                                    <button class="btn-icon" @click.stop="removeBookmarkSub(cat, si)" title="删除该子分类" style="padding:1px 5px;flex-shrink:0">
                                        <i class="fas fa-times" style="font-size:10px;color:var(--danger)"></i>
                                    </button>
                                </div>
                                <div v-if="sub.expanded" v-for="(site, xi) in sub.sites" :key="'x'+ci+'-'+si+'-'+xi"
                                     style="padding-left:38px;font-size:12px;margin:1px 0;display:flex;align-items:center;gap:4px;color:var(--text-muted)" :title="site.url">
                                    <i class="fas fa-link" style="width:12px;font-size:10px;flex-shrink:0"></i>
                                    <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ site.name }}</span>
                                    <button class="btn-icon" @click.stop="removeBookmarkSite(sub, xi)" title="删除该网站" style="margin-left:auto;padding:1px 5px;flex-shrink:0">
                                        <i class="fas fa-times" style="font-size:10px;color:var(--danger)"></i>
                                    </button>
                                </div>
                            </template>
                        </div>
                    </div>
                </div>
                <div class="modal-footer" style="justify-content:space-between">
                    <span style="font-size:12px;color:var(--text-muted)">未右键拆分的书签不会出现在右侧 · Ctrl+Z 撤销 / Ctrl+Y 重做</span>
                    <div style="display:flex;gap:8px">
                        <button class="btn" @click="closeBookmarkMapper">取消</button>
                        <button class="btn btn-primary" @click="generateBookmarkMapperExcel"><i class="fas fa-file-excel"></i> 生成 Excel</button>
                    </div>
                </div>
            </div>
            <!-- 右键菜单 -->
            <div v-if="bookmarkMapper.ctx.visible" class="bookmark-ctx-menu" :style="{ left: bookmarkMapper.ctx.x + 'px', top: bookmarkMapper.ctx.y + 'px' }" @click.stop>
                <button v-if="bookmarkCtxShowPrimary" class="bookmark-ctx-item" @click="bookmarkToPrimary"><i class="fas fa-folder" style="color:#3b82f6"></i> 一级分类</button>
                <button v-if="bookmarkCtxShowSecondary" class="bookmark-ctx-item" @click="bookmarkToSecondary"><i class="fas fa-folder-open" style="color:#0ea5e9"></i> 二级分类</button>
                <button v-if="bookmarkCtxShowSplit" class="bookmark-ctx-item" @click="bookmarkSplitLevels()"><i class="fas fa-layer-group" style="color:#8b5cf6"></i> 逐级拆分</button>
            </div>
            <!-- 一级书签下有网站：并入选择弹窗 -->
            <div v-if="bookmarkMapper.choice.visible" class="modal-overlay" @click.self="bookmarkMapper.choice.visible = false">
                <div class="modal" style="max-width:460px">
                    <div class="modal-header">
                        <h3><i class="fas fa-exclamation-circle" style="color:var(--warning)"></i> {{ bookmarkMapper.choice.sites.length > 0 ? '一级书签下有网站' : '一级书签下有更深文件夹' }}</h3>
                        <button class="btn-icon" @click="bookmarkMapper.choice.visible = false"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="modal-body">
                        <template v-if="bookmarkMapper.choice.sites.length > 0">
                            <p style="font-size:13px;margin:0 0 6px">「{{ bookmarkMapper.choice.catName }}」下还有 {{ bookmarkMapper.choice.sites.length }} 个网站：</p>
                            <p style="font-size:12px;color:var(--text-muted);margin:0 0 12px">{{ bookmarkMapper.choice.sites.join('、') }}</p>
                        </template>
                        <div v-if="bookmarkMapper.choice.deepSubs.length > 0" style="border:1px solid rgba(245,158,11,.45);background:rgba(245,158,11,.06);border-radius:6px;padding:10px 12px;font-size:12px;color:#b45309;margin-bottom:12px">
                            <i class="fas fa-exclamation-triangle" style="margin-right:4px"></i>
                            以下更深层级文件夹会被丢弃：<b>{{ bookmarkMapper.choice.deepSubs.join('、') }}</b>。如需保留，请先取消本次操作，在左侧对它们使用「逐级拆分」。
                        </div>
                        <div v-if="bookmarkMapper.choice.sites.length > 0" style="border:1px solid var(--border);border-radius:6px;padding:12px;font-size:13px">
                            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin-bottom:8px">
                                <input type="radio" value="discard" v-model="bmChoiceMode"><span>舍弃这些网站</span>
                            </label>
                            <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                                <input type="radio" value="merge" v-model="bmChoiceMode"><span>并入到二级书签</span>
                            </label>
                            <div v-if="bmChoiceMode === 'merge'" style="margin-top:8px;display:flex;flex-direction:column;gap:6px;padding-left:4px">
                                <label v-for="s in bookmarkMapper.choice.subs" :key="s" style="display:flex;align-items:center;gap:6px;cursor:pointer">
                                    <input type="radio" :value="s" v-model="bookmarkMapper.choice.selectedSub"><span>{{ s }}</span>
                                </label>
                                <div v-if="bookmarkMapper.choice.subs.length === 0" style="font-size:12px;color:var(--text-muted)">没有二级书签可并入，将自动放入同名子分类</div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer" style="justify-content:flex-end">
                        <button class="btn" @click="bookmarkMapper.choice.visible = false">取消</button>
                        <button class="btn btn-primary" @click="bmChoiceMode === 'merge' ? bookmarkChoiceMerge() : bookmarkChoiceDiscard()">确定</button>
                    </div>
                </div>
            </div>
            <!-- 逐级拆分确认弹窗 -->
            <div v-if="bookmarkMapper.splitConfirm.visible" class="modal-overlay" @click.self="bookmarkMapper.splitConfirm.visible = false">
                <div class="modal" style="max-width:460px">
                    <div class="modal-header">
                        <h3><i class="fas fa-layer-group" style="color:#8b5cf6"></i> 逐级拆分确认</h3>
                        <button class="btn-icon" @click="bookmarkMapper.splitConfirm.visible = false"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="modal-body">
                        <p style="font-size:13px;margin:0 0 8px">将把 <b>{{ bookmarkMapper.splitConfirm.mainName }}</b> 作为主分类，其下 <b>{{ bookmarkMapper.splitConfirm.subsCount }}</b> 个子分类（共 {{ bookmarkMapper.splitConfirm.siteCount }} 个网站）。</p>
                        <template v-if="bookmarkMapper.splitConfirm.sites.length > 0">
                            <p style="font-size:13px;margin:8px 0 4px">主分类下还有 {{ bookmarkMapper.splitConfirm.sites.length }} 个网站：</p>
                            <p style="font-size:12px;color:var(--text-muted);margin:0 0 8px">{{ bookmarkMapper.splitConfirm.sites.map(s => s.name).join('、') }}</p>
                            <div style="border:1px solid var(--border);border-radius:6px;padding:10px 12px;font-size:13px">
                                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin-bottom:8px">
                                    <input type="radio" value="discard" v-model="bmChoiceMode"><span>舍弃这些网站</span>
                                </label>
                                <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                                    <input type="radio" value="merge" v-model="bmChoiceMode"><span>并入到子分类</span>
                                </label>
                                <div v-if="bmChoiceMode === 'merge'" style="margin-top:8px;display:flex;flex-direction:column;gap:6px;padding-left:4px">
                                    <label v-for="s in bookmarkMapper.splitConfirm.subs" :key="s" style="display:flex;align-items:center;gap:6px;cursor:pointer">
                                        <input type="radio" :value="s" v-model="bookmarkMapper.splitConfirm.selectedSub"><span>{{ s }}</span>
                                    </label>
                                </div>
                            </div>
                        </template>
                        <template v-if="bookmarkMapper.splitConfirm.deepInfo.length > 0">
                            <p style="font-size:13px;margin:10px 0 4px">子分类下还有更深层级文件夹（一级菜单）：</p>
                            <p style="font-size:12px;color:var(--text-muted);margin:0 0 8px">
                                <template v-for="(d, di) in bookmarkMapper.splitConfirm.deepInfo" :key="di">{{ d.subName }} 下有 {{ d.folderKeys.length }} 个<template v-if="di < bookmarkMapper.splitConfirm.deepInfo.length - 1">；</template></template>
                            </p>
                            <div style="border:1px solid rgba(139,92,246,.45);background:rgba(139,92,246,.05);border-radius:6px;padding:10px 12px;font-size:13px">
                                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin-bottom:8px">
                                    <input type="radio" value="discard" v-model="bmDeepMode"><span>丢弃更深层级内容</span>
                                </label>
                                <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                                    <input type="radio" value="merge" v-model="bmDeepMode"><span>并入对应子分类（深层的网站合并进来）</span>
                                </label>
                                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin-top:8px">
                                    <input type="radio" value="primary" v-model="bmDeepMode"><span>独立成为一个一级分类</span>
                                </label>
                                <div style="font-size:11px;color:var(--text-muted);margin-top:6px;line-height:1.5">独立将把“可一级分类”的子分类（有子文件夹且子文件夹内无更深嵌套）整体提升为独立主分类，其子文件夹保留为子分类；可多级分类与只有网站的内容在选择独立时仍会丢弃。</div>
                            </div>
                        </template>
                        <p style="font-size:12px;color:var(--text-muted);margin:10px 0 0;line-height:1.6">拆分后该文件夹从左侧隐藏，可在右侧展开查看；已拆过的层级不会重复拆分。</p>
                    </div>
                    <div class="modal-footer" style="justify-content:flex-end">
                        <button class="btn" @click="bookmarkMapper.splitConfirm.visible = false">取消</button>
                        <button class="btn btn-primary" @click="bookmarkSplitApply"><i class="fas fa-layer-group"></i> 确认拆分</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- 版本同步信息弹窗 -->
        <div v-if="modal.versionSync" class="modal-overlay">
            <div class="modal" style="max-width:560px">
                <div class="modal-header">
                    <h3><i class="fas fa-sync-alt" style="color:var(--primary)"></i> 同步信息</h3>
                    <button class="btn-icon" @click="modal.versionSync = false"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <div v-if="syncVersion" style="font-size:12px;color:var(--text-muted);margin-bottom:12px">
                        版本：{{ syncVersion.note || syncVersion.id }}
                        <span style="margin-left:8px">保存于 {{ Utils.formatTime(syncVersion.timestamp) }}</span>
                    </div>
                    <div v-if="syncVersion && syncVersion.syncInfo && Object.keys(syncVersion.syncInfo).length > 0" class="version-sync-list">
                        <div v-for="si in Object.values(syncVersion.syncInfo)" :key="si.accountId" class="version-sync-item">
                            <span class="version-sync-logo">
                                <i v-if="si.type === 'github'" class="fab fa-github"></i>
                                <i v-else-if="si.type === 'vercel'" class="vercel-logo"></i>
                                <i v-else-if="si.type === 'netlify'" class="netlify-logo"></i>
                                <i v-else-if="si.type === 'server' && si.deployType !== 'local'" class="nginx-logo"></i>
                                <i v-else-if="si.type === 'server'" class="fab fa-windows" style="color:#0078d4"></i>
                                <i v-else class="fas fa-cloud-upload-alt"></i>
                            </span>
                            <div class="version-sync-info">
                                <div class="version-sync-name">
                                    {{ syncAccountDisplayName(si) }}
                                    <span class="account-badge" :style="si.type === 'github' ? 'background:#24292f;color:#fff' : (si.type === 'vercel' ? 'background:#000;color:#fff' : (si.type === 'netlify' ? 'background:#00ad9f;color:#fff' : (si.type === 'server' ? 'background:#009639;color:#fff' : 'background:#f48120;color:#fff')))">{{ si.type === 'server' ? (si.deployType === 'local' ? '本地' : 'nginx') : si.type }}</span>
                                </div>
                                <div class="version-sync-meta">
                                    最后同步：{{ si.lastSyncAt ? Utils.formatTime(si.lastSyncAt) : '—' }}
                                    <template v-if="syncVersion.deployBaselines && syncVersion.deployBaselines[si.accountId]">
                                        · 版本基线文件 {{ Object.keys(syncVersion.deployBaselines[si.accountId].files || {}).length }} 个
                                    </template>
                                </div>
                            </div>
                            <span class="version-sync-status" :class="syncAccountState(si) === 'synced' ? 'ok' : 'pending'">
                                <i :class="syncAccountState(si) === 'synced' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle'"></i>
                                {{ syncAccountState(si) === 'synced' ? '已同步' : '有未发布的修改' }}
                            </span>
                        </div>
                    </div>
                    <div v-else style="text-align:center;padding:28px 0;color:var(--text-muted)">
                        <i class="fas fa-cloud-upload-alt" style="font-size:32px;margin-bottom:10px;display:block;opacity:.45"></i>
                        <p>该版本尚未同步发布到任何账号</p>
                        <p style="font-size:12px;margin-top:4px">发布过该版本的账号才会显示在这里。</p>
                    </div>
                    <div v-if="versionUploadRecords && versionUploadRecords.length" style="margin-top:14px;border-top:1px solid var(--border);padding-top:10px">
                        <div style="font-size:12px;font-weight:600;margin-bottom:8px"><i class="fas fa-bolt" style="margin-right:6px;color:var(--primary)"></i>快速发布履历</div>
                        <div v-for="(r, i) in versionUploadRecords.slice().reverse()" :key="i" style="font-size:12px;color:var(--text-muted);display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-bottom:1px dashed var(--border)">
                            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                                {{ Utils.formatTime(r.at) }} · {{ r.account ? (r.account.name || r.account.id) : '未知账号' }}{{ (r.account && r.account.target) ? '（' + r.account.target + '）' : '' }}
                            </span>
                            <span style="flex-shrink:0">{{ r.files || 0 }} 个文件 · {{ r.ok ? '成功' : '失败' }}</span>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary" @click="modal.versionSync = false">完成</button>
                </div>
            </div>
        </div>

        <!-- 默认模板设置弹窗 -->
        <div v-if="modal.templateSettings" class="modal-overlay" @click.self="modal.templateSettings = false">
            <div class="modal" style="max-width:560px">
                <div class="modal-header">
                    <h3><i class="fas fa-layer-group" style="color:var(--primary)"></i> 默认模板设置</h3>
                    <button class="btn-icon" @click="modal.templateSettings = false"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <div style="margin-bottom:14px;font-size:12px;color:var(--text-muted);background:var(--primary-light);padding:10px 12px;border-radius:6px">
                        <i class="fas fa-info-circle"></i> 点击模板即可设为「默认模板」；新建的版本会优先使用该模板的数据。
                    </div>
                    <div style="display:flex;gap:8px;margin-bottom:14px">
                        <button class="btn btn-sm" @click="chooseOtherTemplate">
                            <i class="fas fa-folder-open"></i> 选择其他
                        </button>
                        <button class="btn btn-sm" @click="setCurrentAsTemplate" title="把当前编辑内容保存为默认模板">
                            <i class="fas fa-save"></i> 保存当前为模板
                        </button>
                    </div>
                    <div v-if="defaultTemplates.length > 0" class="template-list">
                        <div v-for="t in defaultTemplates" :key="t.name" class="template-item" :class="{ active: currentDefaultTemplate === t.name }" @click="selectDefaultTemplate(t.name)">
                            <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0">
                                <i class="fas fa-layer-group" style="color:var(--primary);font-size:18px"></i>
                                <div style="min-width:0">
                                    <div style="font-weight:500;font-size:14px">{{ t.note || t.name }}</div>
                                    <div style="font-size:11px;color:var(--text-muted)">{{ t.name }} · {{ Utils.formatTime(t.timestamp) }}</div>
                                </div>
                            </div>
                            <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
                                <span v-if="currentDefaultTemplate === t.name" class="badge badge-primary" style="font-size:11px">默认</span>
                                <button class="btn-icon" @click.stop="deleteDefaultTemplate(t.name)" title="删除此模板"><i class="fas fa-trash" style="color:var(--danger)"></i></button>
                            </div>
                        </div>
                    </div>
                    <div v-else class="empty-state" style="padding:30px 0">
                        <i class="fas fa-layer-group" style="font-size:36px;color:var(--text-muted);opacity:.4"></i>
                        <p>暂无默认模板</p>
                        <p style="font-size:12px;color:var(--text-muted)">点击上方「选择其他」导入，或「保存当前为模板」。</p>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn" @click="modal.templateSettings = false">关闭</button>
                </div>
            </div>
        </div>

        <!-- 另存为部署文件 弹窗 -->
        <div v-if="showSaveAsModal" class="modal-overlay" @click.self="showSaveAsModal = false" @keyup.esc="showSaveAsModal = false">
            <div class="modal" style="max-width:480px">
                <div class="modal-header">
                    <h3><i class="fas fa-file-download" style="color:var(--primary)"></i> 下载部署文件</h3>
                    <button class="btn-icon" @click="showSaveAsModal = false"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <p style="font-size:13px;color:var(--text-muted);margin-bottom:10px">
                        <i class="fas fa-info-circle"></i> 下载部署到 Cloudflare / GitHub 的那些文件，供本地保存。
                    </p>
                    <p style="font-size:13px;color:var(--text-muted);margin-bottom:10px">
                        <i class="fas fa-folder"></i> <strong>合并下载</strong>：选择文件夹，按原目录结构一次性写入所有文件。
                    </p>
                    <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">
                        <i class="fas fa-download"></i> <strong>逐个下载</strong>：依次保存到浏览器默认下载目录（兼容性最好）。
                    </p>
                    <div class="setting-warning">
                        <i class="fas fa-lightbulb"></i> 不会上传任何数据，仅下载到本地电脑。包含：index.html、about.html、commit.html、custom-style.css、404.html。
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn" @click="showSaveAsModal = false">取消</button>
                    <button class="btn btn-primary" @click="confirmSaveAsFolder">
                        <i class="fas fa-folder-download"></i> 合并下载
                    </button>
                    <button class="btn" @click="confirmSaveAs">
                        <i class="fas fa-download"></i> 逐个下载
                    </button>
                </div>
            </div>
        </div>

        <!-- 多 Profile（多站点）管理弹窗 -->
        <div v-if="modal.profiles" class="modal-overlay">
            <div class="modal modal-lg">
                <div class="modal-header">
                    <h3><i class="fas fa-layer-group" style="color:var(--primary)"></i> 站点管理（多导航站）</h3>
                    <div style="display:flex;align-items:center;gap:8px;margin-left:auto;margin-right:12px">
                        <button class="btn btn-sm btn-primary" @click="exportAllSitesPackage" title="导出全部站点（含版本历史），不含账号凭证与发布基线">
                            <i class="fas fa-file-export"></i> 导出全部站点
                        </button>
                        <button class="btn btn-sm" @click="importAllSitesPackage" title="从 .naveditor 备份包恢复站点">
                            <i class="fas fa-file-import"></i> 导入恢复包
                        </button>
                    </div>
                    <button class="btn-icon" @click="modal.profiles = false"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <div style="margin-bottom:14px;font-size:12px;color:var(--text-muted);background:var(--primary-light);padding:10px 12px;border-radius:6px">
                        <i class="fas fa-info-circle"></i> 可同时管理多个独立导航站。点击「切换」立即加载该站点的全部数据。
                        每个站点都有独立的版本历史、账号配置和数据副本。
                    </div>
                    <div style="display:flex;gap:8px;margin-bottom:14px;align-items:center">
                        <input class="form-input" id="newProfileName" placeholder="新站点名称（如：备用站、个人站）" style="flex:1" @keyup.enter="createProfileFromInput">
                        <button class="btn btn-primary" @click="createProfileFromInput">
                            <i class="fas fa-plus"></i> 新建站点
                        </button>
                    </div>
                    <div class="profile-list" v-if="profiles.length > 0">
                        <div v-for="p in profiles" :key="p.id" class="profile-card"
                             :data-profile-id="p.id"
                             :class="{ active: p.id === currentProfileId, dragging: draggingProfileId === p.id }">
                            <i class="fas fa-grip-vertical profile-drag-handle" title="拖动排序"
                               @mousedown.prevent.stop="startProfileDrag($event, p)"></i>
                            <div class="profile-info" @click="switchProfile(p.id)">
                                <div class="profile-name">
                                    <i class="fas fa-globe"></i>
                                    <template v-if="renamingProfileId !== p.id">
                                        {{ p.name }}
                                        <i class="fas fa-pen" style="margin-left:4px;font-size:11px;color:var(--text-muted);cursor:pointer;opacity:0.55" @click.stop="startRenameProfile(p)" title="重命名"></i>
                                    </template>
                                    <template v-else>
                                        <input class="form-input profile-rename-input" v-model="renameProfileName" style="width:160px;padding:2px 6px;font-size:12px" @keyup.enter="confirmRenameProfile(p)" @keyup.esc="cancelRenameProfile" @click.stop>
                                        <button class="btn-icon" @click.stop="confirmRenameProfile(p)" title="确定" style="padding:2px"><i class="fas fa-check" style="color:var(--success)"></i></button>
                                        <button class="btn-icon" @click.stop="cancelRenameProfile" title="取消" style="padding:2px"><i class="fas fa-times" style="color:var(--danger)"></i></button>
                                    </template>
                                    <span v-if="p.id === currentProfileId" class="profile-badge">当前</span>
                                </div>
                                <div class="profile-meta">
                                    <span><i class="fas fa-folder"></i> {{ (p.data && p.data.categories) ? p.data.categories.length : 0 }} 分类</span>
                                    <span><i class="fas fa-link"></i> {{ Utils.formatTime(p.updatedAt || p.createdAt) }}</span>
                                </div>
                            </div>
                            <div class="profile-actions" @click.stop>
                                <button class="btn-icon" @click="duplicateProfile(p)" title="复制">
                                    <i class="fas fa-copy"></i>
                                </button>
                                <button class="btn-icon" @click="exportProfile(p)" title="下载">
                                    <i class="fas fa-download"></i>
                                </button>
                                <button class="btn-icon" @click="switchProfile(p.id)" title="切换到该站点">
                                    <i class="fas fa-arrow-right" style="color:var(--primary)"></i>
                                </button>
                                <button class="btn-icon danger" @click="deleteProfile(p.id)" title="删除">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                    <div v-else style="text-align:center;padding:30px 0;color:var(--text-muted)">
                        <i class="fas fa-layer-group" style="font-size:36px;margin-bottom:12px;display:block"></i>
                        <p>暂无其他站点</p>
                        <p style="font-size:12px;margin-top:4px">在输入框填写名称后点击"新建站点"即可创建一份独立的数据副本</p>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary" @click="modal.profiles = false">完成</button>
                </div>
            </div>
        </div>

        <!-- Cloudflare 账号管理弹窗 -->
        <div v-if="modal.settings" class="modal-overlay">
            <div class="modal modal-lg modal-account-manager">
                <div class="modal-header">
                    <h3>账号管理</h3>
                    <div class="account-filter-bar">
                        <button class="account-filter-btn" :class="{ active: accountFilter === 'all' }" @click="accountFilter = 'all'">全部</button>
                        <button class="account-filter-btn" :class="{ active: accountFilter === 'github' }" @click="accountFilter = 'github'">GitHub</button>
                        <button class="account-filter-btn" :class="{ active: accountFilter === 'cloudflare' }" @click="accountFilter = 'cloudflare'">Cloudflare</button>
                        <button class="account-filter-btn" :class="{ active: accountFilter === 'vercel' }" @click="accountFilter = 'vercel'">Vercel</button>
                        <button class="account-filter-btn" :class="{ active: accountFilter === 'netlify' }" @click="accountFilter = 'netlify'">Netlify</button>
                        <button class="account-filter-btn" :class="{ active: accountFilter === 'server' }" @click="accountFilter = 'server'"><i class="fas fa-server"></i> 服务器</button>
                    </div>
                    <button class="btn-icon" @click="modal.settings = false"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body settings-panel">
                    <div v-if="filteredAccounts.length === 0" style="text-align:center;padding:30px 0;color:var(--text-muted)">
                        <i class="fas fa-cloud" style="font-size:36px;margin-bottom:12px;display:block"></i>
                        <p>{{ cfAccounts.length === 0 ? '还没有添加账号' : '该类型下暂无账号' }}</p>
                        <p style="font-size:12px;margin-top:4px">添加 GitHub / Cloudflare / Vercel / Netlify / 服务器 账号后，可一键发布</p>
                    </div>
                    <div v-else class="account-list">
                        <div v-for="acc in filteredAccounts" :key="acc.id" class="account-card"
                             :class="{ active: activeAccountId === acc.id, dragging: draggingAccountId === acc.id, 'drag-over': dragOverAccountId === acc.id }"
                             draggable="true"
                             @dragstart="onAccountDragStart(acc)"
                             @dragover.prevent="onAccountDragOver(acc)"
                             @drop.prevent="onAccountDrop(acc)"
                             @dragend="onAccountDragEnd"
                             @click="selectAccount(acc.id)">
                            <div class="drag-handle" title="拖动排序" @click.stop><i class="fas fa-grip-vertical"></i></div>
                            <div class="account-info">
                                <div class="account-info-row">
                                    <i v-if="acc.type === 'server' && acc.deployType !== 'local'" class="nginx-logo" title="nginx 服务器部署"></i>
                                    <i v-else-if="acc.type === 'server'" class="fab fa-windows" style="color:#0078d4" title="本地 Windows 部署"></i>
                                    <i v-else-if="acc.type === 'vercel'" class="vercel-logo" title="Vercel"></i>
                                    <i v-else-if="acc.type === 'netlify'" class="netlify-logo" title="Netlify"></i>
                                    <i v-else :class="acc.type === 'github' ? 'fab fa-github' : 'fas fa-cloud-upload-alt'"></i>
                                    <span class="account-name">{{ acc.name }}</span>
                                    <span class="account-detail">
                                        <template v-if="acc.type === 'github'">项目：{{ acc.repo || '未设置' }} · 所有者：{{ acc.owner || '未设置' }}</template>
                                        <template v-else-if="acc.type === 'server' && acc.deployType === 'local'">本地目录：{{ acc.localPath || '未设置' }}</template>
                                        <template v-else-if="acc.type === 'server'">远程目录：{{ acc.remotePath || '/var/www/html' }} · SSH：{{ acc.host || '—' }}:{{ acc.port || 22 }}</template>
                                        <template v-else-if="acc.type === 'vercel'">项目：{{ acc.projectName || '未设置' }} · {{ acc.teamId ? '团队：' + acc.teamId : '个人账号' }}</template>
                                        <template v-else-if="acc.type === 'netlify'">站点：{{ acc.siteName || acc.siteId || '新建' }}</template>
                                        <template v-else>项目：{{ acc.projectName || '未设置' }} · 账户：{{ acc.accountId }}</template>
                                    </span>
                                    <span v-if="activeAccountId === acc.id" class="account-badge">当前</span>
                                    <span v-if="acc.type === 'server'" class="account-badge" style="background:#009639;color:#fff">{{ acc.deployType === 'local' ? '本地' : 'nginx' }}</span>
                                    <span v-else-if="acc.type === 'cloudflare'" class="account-badge" style="background:#f48120;color:#fff">CF</span>
                                    <!-- 连通性状态徽章 -->
                                    <span v-if="connectivityStatus[acc.id] && connectivityStatus[acc.id].state === 'checking'" class="conn-badge conn-checking">
                                        <i class="fas fa-spinner fa-spin"></i> 检查中
                                    </span>
                                    <span v-else-if="connectivityStatus[acc.id] && connectivityStatus[acc.id].state === 'ok'" class="conn-badge conn-ok" :title="connectivityStatus[acc.id].info ? (connectivityStatus[acc.id].info.accountName || connectivityStatus[acc.id].info.url || '正常') : ''">
                                        <i class="fas fa-check-circle"></i> 通
                                    </span>
                                    <span v-else-if="connectivityStatus[acc.id] && connectivityStatus[acc.id].state === 'error'" class="conn-badge conn-error" :title="connectivityStatus[acc.id].message">
                                        <i class="fas fa-exclamation-circle"></i> 异常
                                    </span>
                                </div>
                                <!-- 连通性详情 -->
                                <div v-if="connectivityStatus[acc.id] && connectivityStatus[acc.id].info" class="conn-detail">
                                    <span v-if="connectivityStatus[acc.id].info.accountName"><i class="fas fa-user"></i> {{ connectivityStatus[acc.id].info.accountName }}</span>
                                    <span v-if="connectivityStatus[acc.id].info.url"><i class="fas fa-link"></i> {{ connectivityStatus[acc.id].info.url }}</span>
                                </div>
                                <div v-if="connectivityStatus[acc.id] && connectivityStatus[acc.id].state === 'error'" class="conn-detail conn-detail-error">
                                    <i class="fas fa-exclamation-triangle"></i> {{ connectivityStatus[acc.id].message }}
                                </div>
                                <div v-if="connectivityStatus[acc.id] && connectivityStatus[acc.id].state === 'error' && connectivityStatus[acc.id].info && connectivityStatus[acc.id].info.hint" class="conn-hint">
                                    {{ connectivityStatus[acc.id].info.hint }}
                                </div>
                            </div>
                            <div class="account-actions" @click.stop>
                                <button class="btn btn-sm" @click="openAccountProject(acc)" :disabled="acc.type === 'github' ? !(acc.owner && acc.repo) : (acc.type === 'server' ? (acc.deployType === 'local' || !acc.siteUrl) : (acc.type === 'vercel' ? !acc.projectName : (acc.type === 'netlify' ? false : !acc.projectName)))" :title="(acc.type === 'github' ? (acc.owner && acc.repo ? '访问 GitHub 仓库' : '缺少项目 / 所有者') : acc.type === 'server' ? (acc.deployType === 'local' ? '本地部署无访问地址' : (acc.siteUrl ? '打开站点访问地址' : '未填写访问地址')) : acc.type === 'vercel' ? (acc.projectName ? '访问 Vercel 项目站点' : '缺少项目名') : acc.type === 'netlify' ? '访问 Netlify 站点' : (acc.projectName ? '访问 Cloudflare Pages 项目站点' : '缺少项目名'))">
                                    <i class="fas fa-external-link-alt"></i> 访问项目
                                </button>
                                <button class="btn btn-sm" @click="checkOne(acc)" :disabled="connectivityStatus[acc.id] && connectivityStatus[acc.id].state === 'checking'" title="检查此账号连通性">
                                    <i class="fas fa-plug"></i>
                                    {{ (connectivityStatus[acc.id] && connectivityStatus[acc.id].state === 'checking') ? '检查中' : '检查' }}
                                </button>
                                <button class="btn-icon" @click="editAccount(acc)" title="编辑">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn-icon danger" @click="deleteAccount(acc.id)" title="删除">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                    <div style="margin-top:16px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
                        <button class="btn btn-primary" @click="addAccount">
                            <i class="fas fa-plus"></i> 添加账号
                        </button>
                        <button v-if="cfAccounts.length > 0" class="btn" @click="checkAll" :disabled="Object.values(connectivityStatus).some(s => s && s.state === 'checking')" title="一键检查所有配置">
                            <i class="fas fa-bolt"></i>
                            {{ Object.values(connectivityStatus).some(s => s && s.state === 'checking') ? '检查中...' : '一键检查所有' }}
                        </button>
                    </div>
                    <div class="setting-warning" style="margin-top:16px">
                        <i class="fas fa-shield-alt"></i> 所有 Token 保存在账号存储文件夹下，不会外传到其它服务器。
                    </div>
                    <div v-if="!passwordDirEditing" style="margin-top:10px;display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;color:var(--text-muted)">
                        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" :title="passwordDirInfo.dir">
                            <i class="fas fa-folder"></i> 账号存储文件夹：{{ passwordDirInfo.dir || '未设置' }}
                        </span>
                        <button class="btn btn-sm" @click="startEditPasswordDir" title="设置账号凭证的存储位置（Token 文件将保存到该目录）">
                            <i class="fas fa-exchange-alt"></i> 设置
                        </button>
                    </div>
                    <div v-else style="margin-top:10px;display:flex;align-items:center;gap:8px">
                        <input class="form-input" v-model="passwordDirInput" placeholder="例如 D:\NavEditorData\password"
                               style="flex:1;min-width:0;font-family:monospace" @keyup.enter="savePasswordDirInput">
                        <button class="btn btn-sm" @click="browsePasswordDir" title="打开系统文件夹选择框（若弹窗不便可手动输入）">
                            <i class="fas fa-folder-open"></i> 浏览
                        </button>
                        <button class="btn btn-sm btn-primary" @click="savePasswordDirInput">
                            <i class="fas fa-check"></i> 保存
                        </button>
                        <button class="btn btn-sm" @click="cancelEditPasswordDir">取消</button>
                    </div>
                    <div v-if="!dataDirEditing" style="margin-top:10px;display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;color:var(--text-muted)">
                        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" :title="dataDirInfo.dir">
                            <i class="fas fa-database"></i> 数据目录：{{ dataDirInfo.dir || '未设置' }}
                        </span>
                        <button class="btn btn-sm" @click="startEditDataDir" title="设置站点数据的存储位置（web/、password/ 将保存在该目录）">
                            <i class="fas fa-exchange-alt"></i> 设置
                        </button>
                    </div>
                    <div v-else style="margin-top:10px;display:flex;align-items:center;gap:8px">
                        <input class="form-input" v-model="dataDirInput" placeholder="例如 D:\NavEditorData"
                               style="flex:1;min-width:0;font-family:monospace" @keyup.enter="saveDataDirInput">
                        <button class="btn btn-sm" @click="browseDataDir" title="打开系统文件夹选择框（若弹窗不便可手动输入）">
                            <i class="fas fa-folder-open"></i> 浏览
                        </button>
                        <button class="btn btn-sm btn-primary" @click="saveDataDirInput">
                            <i class="fas fa-check"></i> 保存
                        </button>
                        <button class="btn btn-sm" @click="cancelEditDataDir">取消</button>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary" @click="modal.settings = false">完成</button>
                </div>
            </div>
        </div>

        <!-- 账号编辑弹窗 -->
        <div v-if="modal.accountEdit" class="modal-overlay">
            <div class="modal" style="max-width:480px">
                <div class="modal-header">
                    <h3>{{ editForm.account.id ? '编辑账号' : '添加账号' }}</h3>
                    <button class="btn-icon" @click="modal.accountEdit = false"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body settings-panel">
                    <div class="form-group">
                        <label class="form-label">平台类型</label>
                        <div style="display:flex;gap:8px;align-items:center">
                            <span v-if="editForm.account.type === 'server' && editForm.account.deployType !== 'local'" class="nginx-logo" style="font-size:16px"></span>
                            <span v-else-if="editForm.account.type === 'vercel'" class="vercel-logo" style="width:18px;height:18px"></span>
                            <span v-else-if="editForm.account.type === 'netlify'" class="netlify-logo" style="width:18px;height:18px"></span>
                            <span v-else :class="editForm.account.type === 'server' ? 'fab fa-windows' : (editForm.account.type === 'github' ? 'fab fa-github' : 'fas fa-cloud')" style="font-size:20px;color:var(--text-secondary)"></span>
                            <select class="form-input" v-model="editForm.account.type">
                                <option value="cloudflare">Cloudflare Pages</option>
                                <option value="github">GitHub Pages</option>
                                <option value="vercel">Vercel Dashboard</option>
                                <option value="netlify">Netlify</option>
                                <option value="server">服务器（本地 / nginx）</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">名称（用于区分不同站点）</label>
                        <input class="form-input" v-model="editForm.account.name" placeholder="如：我的导航站、工具导航">
                    </div>
                    <template v-if="editForm.account.type === 'github'">
                        <div class="form-group">
                            <label class="form-label">仓库所有者 (Owner)</label>
                            <input class="form-input" v-model="editForm.account.owner" placeholder="如：yourname">
                            <div class="setting-hint">GitHub 用户名或组织名</div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">仓库名 (Repo)</label>
                            <input class="form-input" v-model="editForm.account.repo" placeholder="如：web-nav">
                            <div class="setting-hint">GitHub 仓库名称，需已启用 GitHub Pages</div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">分支</label>
                            <input class="form-input" v-model="editForm.account.branch" placeholder="main">
                            <div class="setting-hint">默认 main，也可以是 master 或 gh-pages</div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Personal Access Token</label>
                            <input class="form-input" type="password" v-model="editForm.account.token" placeholder="ghp_xxxxxxxxxxxx">
                            <div class="setting-hint">需要 repo 权限，在 GitHub Settings > Developer settings > Personal access tokens 中创建</div>
                        </div>
                    </template>
                    <template v-else-if="editForm.account.type === 'cloudflare'">
                        <div class="form-group">
                            <label class="form-label">Account ID</label>
                            <input class="form-input" v-model="editForm.account.accountId" placeholder="Cloudflare 账户 ID">
                            <div class="setting-hint">在 Cloudflare Dashboard 右侧栏可见</div>
                            <div class="setting-hint">校验使用账户级 API（GET /accounts/{账户ID}/tokens/verify），需该 Token 对此账户具备至少一项权限（如 Cloudflare Pages: Read）。</div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Pages 项目名</label>
                            <input class="form-input" v-model="editForm.account.projectName" placeholder="如：web-nav">
                            <div class="setting-hint">Cloudflare Pages 中创建的 Direct Upload 项目名称</div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">API Token</label>
                            <input class="form-input" type="text" v-model="editForm.account.apiToken" placeholder="Cloudflare API Token">
                            <div class="setting-hint">请粘贴 Cloudflare 首页「您的 API 令牌」（以 cfat_ 开头值），不要填 R2 部分的「访问密钥 ID」或「秘密访问密钥」。</div>
                        </div>
                    </template>
                    <template v-else-if="editForm.account.type === 'vercel'">
                        <div class="form-group">
                            <label class="form-label">Access Token</label>
                            <input class="form-input" type="password" v-model="editForm.account.token" placeholder="Vercel Personal Access Token">
                            <div class="setting-hint">在 Vercel Dashboard › Settings › Tokens 创建，具备项目部署权限即可。</div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">项目名 (Project Name)</label>
                            <input class="form-input" v-model="editForm.account.projectName" placeholder="如：web-nav">
                            <div class="setting-hint">Vercel 项目名称（小写、连字符）。留空则首次部署自动以默认名创建项目；建议填写以便后续增量部署与访问。</div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Team ID（可选）</label>
                            <input class="form-input" v-model="editForm.account.teamId" placeholder="如：team_xxxxxxxx">
                            <div class="setting-hint">若部署到团队名下项目，填写 Team ID；个人账号留空。</div>
                        </div>
                    </template>
                    <template v-else-if="editForm.account.type === 'netlify'">
                        <div class="form-group">
                            <label class="form-label">Personal Access Token</label>
                            <input class="form-input" type="password" v-model="editForm.account.token" placeholder="Netlify Personal Access Token">
                            <div class="setting-hint">在 Netlify Dashboard › User settings › Applications › New access token 创建。</div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Site ID（可选）</label>
                            <input class="form-input" v-model="editForm.account.siteId" placeholder="如：8f3c2a1b-xxxx">
                            <div class="setting-hint">Netlify 站点 ID（Site settings › General 可见）。留空则首次部署自动创建新站点，名称由下方「站点名」决定。</div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">站点名 (Site Name)</label>
                            <input class="form-input" v-model="editForm.account.siteName" placeholder="如：web-nav">
                            <div class="setting-hint">仅含字母 / 数字 / 连字符。留空且未填 Site ID 时，Netlify 自动生成随机站点名。</div>
                        </div>
                    </template>
                    <template v-else-if="editForm.account.type === 'server'">
                        <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px;padding:8px 12px;background:var(--bg-soft);border-radius:8px">
                            <span style="color:var(--danger);font-weight:700">*</span> 为必填项；其余字段有默认值或可留空。
                        </div>
                        <div class="form-group">
                            <label class="form-label">部署方式</label>
                            <div style="display:flex;gap:12px;flex-wrap:wrap">
                                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:8px 14px;border:1px solid var(--border);border-radius:8px" :style="editForm.account.deployType === 'local' ? 'border-color:var(--primary);background:var(--primary-light)' : ''">
                                    <input type="radio" value="local" v-model="editForm.account.deployType"> <i class="fab fa-windows" style="color:#0078d4"></i> 本地部署（Windows）
                                </label>
                                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:8px 14px;border:1px solid var(--border);border-radius:8px" :style="editForm.account.deployType === 'nginx' ? 'border-color:var(--primary);background:var(--primary-light)' : ''">
                                    <input type="radio" value="nginx" v-model="editForm.account.deployType"> <i class="nginx-logo" style="font-size:14px"></i> 服务器部署（nginx）
                                </label>
                            </div>
                            <div class="setting-hint">本地部署把文件写入本机站点根目录（如 nginx 的 html 目录）；服务器部署通过 SSH 连接远程服务器并上传文件。</div>
                        </div>
                        <template v-if="editForm.account.deployType === 'local'">
                            <div class="form-group">
                                <label class="form-label"><span style="color:var(--danger)">*</span> 本地站点根目录</label>
                                <input class="form-input" v-model="editForm.account.localPath" placeholder="如：C:\nginx\html 或 D:\web\nav">
                                <div class="setting-hint">部署时文件将写入此目录（自动创建缺失子目录），不能是 NavEditor 程序目录。</div>
                            </div>
                            <div class="form-group">
                                <label class="form-label">部署前脚本（PowerShell，可选）</label>
                                <textarea class="form-input" rows="2" v-model="editForm.account.localPreScript" placeholder="写入文件前执行，如：备份当前站点&#10;Copy-Item C:\nginx\html -Destination C:\backups\html_$(Get-Date -Format yyyyMMddHHmmss) -Recurse"></textarea>
                            </div>
                            <div class="form-group">
                                <label class="form-label">部署后脚本（PowerShell，可选）</label>
                                <textarea class="form-input" rows="2" v-model="editForm.account.localPostScript" placeholder="写入文件后执行，如：重载 nginx&#10;&amp; 'C:\nginx\nginx.exe' -s reload"></textarea>
                                <div class="setting-hint">脚本输出会显示在部署控制台；非零退出码会以错误形式报告。</div>
                            </div>
                        </template>
                        <template v-else>
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                                <div class="form-group" style="margin:0">
                                    <label class="form-label"><span style="color:var(--danger)">*</span> 服务器主机地址</label>
                                    <input class="form-input" v-model="editForm.account.host" placeholder="如：192.168.1.100 或 nav.example.com">
                                </div>
                                <div class="form-group" style="margin:0">
                                    <label class="form-label">SSH 端口</label>
                                    <input class="form-input" type="number" min="1" max="65535" v-model.number="editForm.account.port" placeholder="22">
                                    <div class="setting-hint">默认 22，无需修改可留空。</div>
                                </div>
                            </div>
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                                <div class="form-group" style="margin:0">
                                    <label class="form-label"><span style="color:var(--danger)">*</span> 登录用户名</label>
                                    <input class="form-input" v-model="editForm.account.username" placeholder="如：root / ubuntu">
                                </div>
                                <div class="form-group" style="margin:0">
                                    <label class="form-label">认证方式</label>
                                    <select class="form-input" v-model="editForm.account.authMethod">
                                        <option value="password">密码登录</option>
                                        <option value="key">密钥登录（推荐）</option>
                                    </select>
                                    <div class="setting-hint">默认密码登录。</div>
                                </div>
                            </div>
                            <template v-if="editForm.account.authMethod === 'password'">
                                <div class="form-group">
                                    <label class="form-label"><span style="color:var(--danger)">*</span> 登录密码</label>
                                    <input class="form-input" type="password" v-model="editForm.account.password" placeholder="服务器 SSH 登录密码">
                                    <div class="setting-hint">仅保存在本机账号存储文件夹中，部署时通过本机后端直连服务器，不会上传到第三方。</div>
                                </div>
                            </template>
                            <template v-else>
                                <div class="form-group">
                                    <label class="form-label"><span style="color:var(--danger)">*</span> 私钥文件路径（本机）</label>
                                    <input class="form-input" v-model="editForm.account.privateKeyPath" placeholder="如：C:\Users\you\.ssh\id_rsa">
                                </div>
                                <div class="form-group">
                                    <label class="form-label"><span style="color:var(--danger)">*</span> 或粘贴私钥内容</label>
                                    <textarea class="form-input" rows="3" v-model="editForm.account.privateKey" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..."></textarea>
                                    <div class="setting-hint">二选一填写即可（路径或内容）。</div>
                                </div>
                            </template>
                            <div class="form-group">
                                <label class="form-label">远程部署目录</label>
                                <input class="form-input" v-model="editForm.account.remotePath" placeholder="留空默认 /var/www/html">
                                <div class="setting-hint">文件将上传到该目录（自动创建）。留空使用默认 /var/www/html；请与 nginx root 配置保持一致。</div>
                            </div>
                            <div class="form-group">
                                <label class="form-label">部署后远程命令（可选）</label>
                                <input class="form-input" v-model="editForm.account.remoteCommand" placeholder="如：bash /var/www/nav/deploy.sh 或 systemctl reload nginx">
                                <div class="setting-hint">文件上传完成后在服务器执行；stdout/stderr 与退出码会完整显示在部署控制台。</div>
                            </div>
                        </template>
                        <div class="form-group">
                            <label class="form-label">站点访问地址（可选）</label>
                            <input class="form-input" v-model="editForm.account.siteUrl" placeholder="如：https://nav.example.com">
                            <div class="setting-hint">用于「访问项目」与部署成功后的跳转链接。</div>
                        </div>
                    </template>
                </div>
                <div class="modal-footer">
                    <button class="btn" @click="modal.accountEdit = false">取消</button>
                    <button class="btn btn-primary" @click="saveAccount">保存</button>
                </div>
            </div>
        </div>

        <!-- 同步进度弹窗 -->
        <div v-if="modal.sync" class="modal-overlay" @click.self="syncResult && syncResult.success ? (modal.sync = false) : null">
            <div class="modal" :class="{ 'sync-modal-error': hasSyncError }">
                <div class="modal-header" :class="{ 'has-error': hasSyncError }">
                    <h3>
                        <i v-if="hasSyncError" class="fas fa-exclamation-triangle" style="color:#dc2626;margin-right:6px"></i>
                        {{ (cfAccounts.find(a => a.id === activeAccountId)?.type === 'github') ? '发布到 GitHub' : (cfAccounts.find(a => a.id === activeAccountId)?.type === 'vercel') ? '发布到 Vercel' : (cfAccounts.find(a => a.id === activeAccountId)?.type === 'netlify') ? '发布到 Netlify' : (cfAccounts.find(a => a.id === activeAccountId)?.type === 'server') ? ((cfAccounts.find(a => a.id === activeAccountId)?.deployType === 'local') ? '部署到本地 (Windows)' : '部署到服务器 (nginx)') : '发布到 Cloudflare' }}
                    </h3>
                    <!-- 任何状态下都显示关闭按钮（包括发布失败时） -->
                    <button class="btn-icon" @click="modal.sync = false" title="关闭">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <!-- 账号选择 -->
                    <div v-if="!syncResult && cfAccounts.length > 1" style="margin-bottom:16px">
                        <label class="form-label" style="margin-bottom:6px">部署到</label>
                        <select class="form-input" v-model="activeAccountId" @change="selectAccount(activeAccountId)">
                            <option v-for="acc in cfAccounts" :key="acc.id" :value="acc.id">{{ acc.name }} ({{ acc.type === 'github' ? acc.repo : (acc.type === 'netlify' ? (acc.siteName || acc.siteId || 'Netlify') : acc.projectName) }})</option>
                        </select>
                    </div>
                    <div class="sync-progress">
                        <div v-for="(step, i) in syncSteps" :key="i" class="sync-step" :class="step.status">
                            <div class="sync-step-icon">
                                <i v-if="step.status === 'done'" class="fas fa-check"></i>
                                <i v-else-if="step.status === 'active'" class="fas fa-spinner fa-spin"></i>
                                <i v-else-if="step.status === 'error'" class="fas fa-exclamation"></i>
                                <span v-else>{{ i + 1 }}</span>
                            </div>
                            <div class="sync-step-text">
                                <div class="sync-step-name">{{ step.name }}</div>
                                <div class="sync-step-detail">{{ step.detail }}</div>
                            </div>
                        </div>
                    </div>
                    <!-- 上传进度明细（可折叠）：当前文件 / 进度 / 剩余时间 -->
                    <div class="sync-detail" v-if="syncDetail.show">
                        <div class="sync-detail-bar">
                            <span class="sync-detail-count">已上传 {{ syncDetail.uploaded }} / {{ syncDetail.total }}</span>
                            <span class="sync-detail-current" v-if="syncDetail.current">当前：{{ syncDetail.current }}</span>
                            <span class="sync-detail-eta" v-if="syncRemaining">剩余约 {{ syncRemaining }}</span>
                            <button class="btn-link" type="button" @click="syncDetail.expanded = !syncDetail.expanded">{{ syncDetail.expanded ? '收起' : '展开明细' }}</button>
                        </div>
                        <div class="sync-detail-list" v-if="syncDetail.expanded">
                            <div v-for="(it, i) in syncDetail.items" :key="i" class="sync-detail-item" :class="it.status">
                                <span class="sync-detail-dot"></span>
                                <span class="sync-detail-path">{{ it.path }}</span>
                            </div>
                        </div>
                    </div>
                    <!-- 服务器 / 本地部署控制台日志 -->
                    <div class="sync-console" v-if="syncLogs.length > 0">
                        <div class="sync-console-header">
                            <span><i class="fas fa-terminal"></i> 部署控制台</span>
                            <button class="btn-link" type="button" @click="copySyncLogs" title="复制全部日志">
                                <i class="fas fa-copy"></i> 复制日志
                            </button>
                        </div>
                        <div class="sync-console-body" ref="syncConsoleBodyEl">
                            <div v-for="(l, i) in syncLogs" :key="i" class="sync-console-line" :class="'level-' + (l.level || 'info')">
                                <span class="sync-console-ts">{{ l.ts ? Utils.formatTime(l.ts.getTime()) : '' }}</span>
                                <span class="sync-console-text">{{ l.text }}</span>
                            </div>
                        </div>
                    </div>
                    <div v-if="hasSyncError" class="sync-error-box">
                        <i class="fas fa-times-circle"></i>
                        <div>
                            <div class="sync-error-title">发布失败</div>
                            <div class="sync-error-detail">{{ syncErrorMessage }}</div>
                        </div>
                    </div>
                    <div v-else-if="syncResult && syncResult.success" style="margin-top:16px;padding:12px;background:var(--success);color:#fff;border-radius:8px;text-align:center">
                        <i class="fas fa-check-circle"></i>
                        部署成功！
                        <div v-if="syncResult.url" style="margin-top:8px">
                            <a :href="'https://' + syncResult.url" target="_blank" style="color:#fff;text-decoration:underline">
                                https://{{ syncResult.url }}
                            </a>
                        </div>
                    </div>
                </div>
                <div class="modal-footer" v-if="syncResult && syncResult.success">
                    <button class="btn btn-primary" @click="modal.sync = false">完成</button>
                </div>
            </div>
        </div>

        <!-- 搜索栏设置弹窗 -->
        <div v-if="modal.searchConfig" class="modal-overlay">
            <div class="modal" style="max-width:1080px;width:90vw">
                <div class="modal-header">
                    <h3><i class="fas fa-search"></i> 搜索栏设置</h3>
                    <button class="btn-icon" @click="modal.searchConfig = false"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body" style="max-height:85vh;overflow-y:auto">
                    <div v-if="!data.searchConfig || !data.searchConfig.tabs" style="text-align:center;padding:40px;color:var(--text-muted)">
                        暂无搜索数据
                    </div>
                    <div v-else>
                        <div style="margin-bottom:12px;font-size:12px;color:var(--text-muted)">
                            <i class="fas fa-info-circle"></i> 配置导航站顶部的搜索栏。支持多个标签（如常用、搜索、工具），每个标签下可放多个搜索引擎。
                        </div>
                        <!-- 搜索框宽度设置 -->
                        <div class="form-group" style="display:flex;align-items:center;gap:10px;margin-bottom:14px;padding:8px 12px;background:var(--bg-soft);border-radius:8px;flex-wrap:wrap">
                            <span style="font-size:12px;font-weight:600"><i class="fas fa-arrows-alt-h"></i> 搜索框宽度</span>
                            <label style="display:flex;align-items:center;gap:4px;font-size:11px">
                                <input class="form-input" type="number" min="200" max="1200" step="10" v-model.number="data.searchConfig.searchBoxWidth" style="width:68px;display:inline-block"> px
                            </label>
                            <span style="font-size:10px;color:var(--text-muted)">控制访客页面搜索输入框的最大宽度</span>
                        </div>
                        <!-- 搜索颜色设置 -->
                        <div class="form-group" style="margin-bottom:14px;padding:10px 12px;background:var(--bg-soft);border-radius:8px">
                            <div style="font-size:12px;font-weight:600;margin-bottom:6px"><i class="fas fa-palette"></i> 搜索颜色</div>
                            <div style="display:flex;gap:12px">
                                <!-- 主页面 -->
                                <div style="flex:1;min-width:0">
                                    <div style="font-size:11px;font-weight:600;margin-bottom:4px;color:var(--text-muted)">主页面</div>
                                    <div style="display:flex;align-items:center;margin-bottom:4px">
                                        <span style="width:80px;font-size:11px;text-align:left;flex-shrink:0">分类文字</span>
                                        <button type="button" class="cp-field-swatch" @click="openSearchColorPicker('searchTabTextColor')" title="点击调整颜色与透明度"><span :style="{ background: data.searchConfig.searchTabTextColor }"></span></button>
                                        <input class="form-input" v-model="data.searchConfig.searchTabTextColor" style="width:92px;margin-left:4px;font-size:11px">
                                    </div>
                                    <div style="display:flex;align-items:center;margin-bottom:4px">
                                        <span style="width:80px;font-size:11px;text-align:left;flex-shrink:0">搜索框文字</span>
                                        <button type="button" class="cp-field-swatch" @click="openSearchColorPicker('searchPlaceholderColor')" title="点击调整颜色与透明度"><span :style="{ background: data.searchConfig.searchPlaceholderColor }"></span></button>
                                        <input class="form-input" v-model="data.searchConfig.searchPlaceholderColor" style="width:92px;margin-left:4px;font-size:11px">
                                    </div>
                                    <div style="display:flex;align-items:center;margin-bottom:4px">
                                        <span style="width:80px;font-size:11px;text-align:left;flex-shrink:0">子分类文字</span>
                                        <button type="button" class="cp-field-swatch" @click="openSearchColorPicker('searchEngineTextColor')" title="点击调整颜色与透明度"><span :style="{ background: data.searchConfig.searchEngineTextColor }"></span></button>
                                        <input class="form-input" v-model="data.searchConfig.searchEngineTextColor" style="width:92px;margin-left:4px;font-size:11px">
                                    </div>
                                    <div style="display:flex;align-items:center">
                                        <span style="width:80px;font-size:11px;text-align:left;flex-shrink:0">搜索框颜色</span>
                                        <button type="button" class="cp-field-swatch" @click="openSearchColorPicker('searchBoxBackgroundColor')" title="点击调整颜色与透明度"><span :style="{ background: data.searchConfig.searchBoxBackgroundColor }"></span></button>
                                        <input class="form-input" v-model="data.searchConfig.searchBoxBackgroundColor" style="width:92px;margin-left:4px;font-size:11px">
                                    </div>
                                </div>
                                <!-- 右上角弹窗 -->
                                <div style="flex:1;min-width:0">
                                    <div style="font-size:11px;font-weight:600;margin-bottom:4px;color:var(--text-muted)">右上角弹窗</div>
                                    <div style="display:flex;align-items:center;margin-bottom:4px">
                                        <span style="width:80px;font-size:11px;text-align:left;flex-shrink:0">分类文字</span>
                                        <button type="button" class="cp-field-swatch" @click="openSearchColorPicker('modalSearchTabTextColor')" title="点击调整颜色与透明度"><span :style="{ background: data.searchConfig.modalSearchTabTextColor }"></span></button>
                                        <input class="form-input" v-model="data.searchConfig.modalSearchTabTextColor" style="width:92px;margin-left:4px;font-size:11px">
                                    </div>
                                    <div style="display:flex;align-items:center;margin-bottom:4px">
                                        <span style="width:80px;font-size:11px;text-align:left;flex-shrink:0">搜索框文字</span>
                                        <button type="button" class="cp-field-swatch" @click="openSearchColorPicker('modalSearchPlaceholderColor')" title="点击调整颜色与透明度"><span :style="{ background: data.searchConfig.modalSearchPlaceholderColor }"></span></button>
                                        <input class="form-input" v-model="data.searchConfig.modalSearchPlaceholderColor" style="width:92px;margin-left:4px;font-size:11px">
                                    </div>
                                    <div style="display:flex;align-items:center;margin-bottom:4px">
                                        <span style="width:80px;font-size:11px;text-align:left;flex-shrink:0">子分类文字</span>
                                        <button type="button" class="cp-field-swatch" @click="openSearchColorPicker('modalSearchEngineTextColor')" title="点击调整颜色与透明度"><span :style="{ background: data.searchConfig.modalSearchEngineTextColor }"></span></button>
                                        <input class="form-input" v-model="data.searchConfig.modalSearchEngineTextColor" style="width:92px;margin-left:4px;font-size:11px">
                                    </div>
                                    <div style="display:flex;align-items:center;margin-bottom:4px">
                                        <span style="width:80px;font-size:11px;text-align:left;flex-shrink:0">搜索框颜色</span>
                                        <button type="button" class="cp-field-swatch" @click="openSearchColorPicker('modalSearchBoxBackgroundColor')" title="点击调整颜色与透明度"><span :style="{ background: data.searchConfig.modalSearchBoxBackgroundColor }"></span></button>
                                        <input class="form-input" v-model="data.searchConfig.modalSearchBoxBackgroundColor" style="width:92px;margin-left:4px;font-size:11px">
                                    </div>
                                    <div style="display:flex;align-items:center">
                                        <span style="width:80px;font-size:11px;text-align:left;flex-shrink:0">背板颜色</span>
                                        <button type="button" class="cp-field-swatch" @click="openSearchColorPicker('modalSearchBackdropColor')" title="点击调整颜色与透明度"><span :style="{ background: data.searchConfig.modalSearchBackdropColor }"></span></button>
                                        <input class="form-input" v-model="data.searchConfig.modalSearchBackdropColor" style="width:92px;margin-left:4px;font-size:11px">
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div v-for="(tab, ti) in data.searchConfig.tabs" :key="ti" class="search-tab-block">
                            <div class="search-tab-header">
                                <input class="form-input" v-model="tab.name" placeholder="标签名（如：常用）" style="width:140px">
                                <!-- 图标按钮：显示已选图标，紧贴标签名输入框；点击打开图标选择器 -->
                                <button class="btn btn-sm search-tab-icon-btn" @click="openIconPickerForSearchTab(ti)" :title="tab.icon ? '点击更换图标' : '点击选择图标'">
                                    <i :class="tab.icon || 'fas fa-icons'"></i>
                                </button>
                                <span class="search-tab-meta">{{ tab.engines.length }} 个引擎</span>
                                <button class="btn btn-sm" @click="addSearchEngine(ti)"><i class="fas fa-plus"></i> 引擎</button>
                                <button class="btn-icon danger" @click="removeSearchTab(ti)" title="删除该标签"><i class="fas fa-trash"></i></button>
                            </div>
                            <div class="search-engine-list">
                                <div v-for="(eng, ei) in tab.engines" :key="ei" class="search-engine-row">
                                    <input class="form-input" v-model="eng.name" placeholder="名称" style="width:80px">
                                    <input class="form-input" v-model="eng.url" placeholder="https://..." style="flex:1;min-width:200px">
                                    <input class="form-input" v-model="eng.placeholder" placeholder="占位文本" style="width:160px">
                                    <div class="logo-input-group" style="width:160px">
                                        <div class="logo-thumb" v-if="eng.logo"
                                             :class="{ 'is-svg': eng.logo.trim().startsWith('<svg') || eng.logo.trim().startsWith('<?xml') }"
                                             @click="openSearchEngineIconEditor(ti, ei)">
                                            <img v-if="!eng.logo.trim().startsWith('<svg') && !eng.logo.trim().startsWith('<?xml')" :src="eng.logo" @error="$event.target.style.display='none'">
                                            <span v-else v-html="eng.logo"></span>
                                        </div>
                                        <button v-else class="logo-upload-btn" @click="openSearchEngineIconEditor(ti, ei)" title="设置 Logo">
                                            <i class="fas fa-image"></i>
                                        </button>
                                        <button class="logo-edit-btn" @click="openSearchEngineIconEditor(ti, ei)" title="编辑 Logo">
                                            <i class="fas fa-pen"></i>
                                        </button>
                                    </div>
                                    <button class="btn-icon danger" @click="removeSearchEngine(ti, ei)"><i class="fas fa-times"></i></button>
                                </div>
                            </div>
                        </div>
                        <button class="btn btn-sm" style="margin-top:12px;width:100%;border:1px dashed var(--primary);color:var(--primary)" @click="addSearchTab">
                            <i class="fas fa-plus"></i> 添加搜索标签
                        </button>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn" @click="modal.searchConfig = false">完成</button>
                </div>
            </div>
        </div>

        <!-- 关于导航（页面编辑）弹窗 -->
        <div v-if="modal.about" class="modal-overlay">
            <div class="modal" style="max-width:920px">
                <div class="modal-header">
                    <h3><i class="fas fa-info-circle"></i> 关于导航 - 页面编辑</h3>
                    <button class="btn-icon" @click="modal.about = false"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <div style="margin-bottom:12px;font-size:12px;color:var(--text-muted)">
                        <i class="fas fa-info-circle"></i> 编辑内容显示在导航站"关于导航"独立子页面。可设置头图标题/副标题、个人简介、技术栈、工作理念、联系方式，并配置左右两侧广告位（支持谷歌广告）。
                    </div>

                    <!-- 基础信息 -->
                    <div class="form-group">
                        <label class="form-label">页面标题 <span class="text-muted" style="font-weight:normal">（头图大标题）</span></label>
                        <input class="form-input" v-model="editForm.about.title" placeholder="如：关于作者、关于我们">
                    </div>
                    <div class="form-group">
                        <label class="form-label">副标题 <span class="text-muted" style="font-weight:normal">（标题下方一行小字）</span></label>
                        <input class="form-input" v-model="editForm.about.subtitle" placeholder="如：热爱技术，专注于软件开发与创新">
                    </div>

                    <!-- 个人简介 -->
                    <div class="form-group">
                        <label class="form-label">个人简介</label>
                        <div style="display:flex;gap:16px;margin-bottom:6px">
                            <label style="font-size:13px;cursor:pointer"><input type="radio" value="text" v-model="editForm.about.introMode" style="margin-right:4px">纯文本</label>
                            <label style="font-size:13px;cursor:pointer"><input type="radio" value="html" v-model="editForm.about.introMode" style="margin-right:4px">富文本 (HTML)</label>
                        </div>
                        <textarea v-if="editForm.about.introMode !== 'html'" class="form-textarea" v-model="editForm.about.intro" rows="8"
                                  placeholder="支持用空行分段，首段会以高亮框突出显示。"></textarea>
                        <template v-else>
                            <textarea class="form-textarea" v-model="editForm.about.introHtml" rows="8"
                                      placeholder="可直接编写 HTML，如 <h3>小标题</h3>&#10;<p>段落</p>"></textarea>
                            <div class="setting-hint">富文本优先于纯文本展示。</div>
                        </template>
                    </div>

                    <!-- 技术栈 -->
                    <div style="border-top:1px dashed #e3e3e3;margin:14px 0 6px;padding-top:10px">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                            <div style="font-weight:600;font-size:14px;color:var(--primary)"><i class="fas fa-code"></i> 技术栈</div>
                            <button class="btn btn-sm" @click="aboutSkillAdd"><i class="fas fa-plus"></i> 添加</button>
                        </div>
                        <div v-if="editForm.about.skills.length === 0" class="text-muted" style="font-size:12px;padding:6px 0">暂无，点击"添加"新增技能。</div>
                        <div v-for="(sk, idx) in editForm.about.skills" :key="'sk'+idx"
                             style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
                            <input class="form-input" style="flex:0 0 140px" v-model="sk.icon" placeholder="图标类，如 fab fa-java">
                            <input class="form-input" style="flex:1" v-model="sk.name" placeholder="技能名称，如 Java / Spring Boot">
                            <button class="btn-icon" @click="aboutSkillRemove(idx)" title="删除"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>

                    <!-- 工作理念 -->
                    <div class="form-group">
                        <label class="form-label">工作理念</label>
                        <div style="display:flex;gap:16px;margin-bottom:6px">
                            <label style="font-size:13px;cursor:pointer"><input type="radio" value="text" v-model="editForm.about.philosophyMode" style="margin-right:4px">纯文本</label>
                            <label style="font-size:13px;cursor:pointer"><input type="radio" value="html" v-model="editForm.about.philosophyMode" style="margin-right:4px">富文本 (HTML)</label>
                        </div>
                        <textarea v-if="editForm.about.philosophyMode !== 'html'" class="form-textarea" v-model="editForm.about.philosophy" rows="6"
                                  placeholder="支持用空行分段。"></textarea>
                        <template v-else>
                            <textarea class="form-textarea" v-model="editForm.about.philosophyHtml" rows="6"
                                      placeholder="可直接编写 HTML。"></textarea>
                        </template>
                    </div>

                    <!-- 联系方式 -->
                    <div style="border-top:1px dashed #e3e3e3;margin:14px 0 6px;padding-top:10px">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                            <div style="font-weight:600;font-size:14px;color:var(--primary)"><i class="fas fa-address-book"></i> 联系方式</div>
                            <button class="btn btn-sm" @click="aboutContactAdd"><i class="fas fa-plus"></i> 添加</button>
                        </div>
                        <div v-if="editForm.about.contacts.length === 0" class="text-muted" style="font-size:12px;padding:6px 0">暂无，点击"添加"新增联系方式。</div>
                        <div v-for="(ct, idx) in editForm.about.contacts" :key="'ct'+idx"
                             style="border:1px solid #eee;border-radius:8px;padding:10px;margin-bottom:10px;background:#fafafa">
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                                <span class="ad-edit-idx">联系方式 {{ idx + 1 }}</span>
                                <button class="btn-icon" @click="aboutContactRemove(idx)" title="删除"><i class="fas fa-trash"></i></button>
                            </div>
                            <div style="display:flex;gap:8px;flex-wrap:wrap">
                                <div class="form-group" style="flex:1;min-width:130px"><label class="form-label">图标</label><input class="form-input" v-model="ct.icon" placeholder="如 fab fa-github"></div>
                                <div class="form-group" style="flex:1;min-width:130px"><label class="form-label">标签</label><input class="form-input" v-model="ct.label" placeholder="如 GitHub:"></div>
                            </div>
                            <div class="form-group"><label class="form-label">显示内容</label><input class="form-input" v-model="ct.value" placeholder="如 https://github.com/xxx"></div>
                            <div class="form-group"><label class="form-label">跳转链接</label><input class="form-input" v-model="ct.link" placeholder="点击跳转地址（留空则按显示内容）"></div>
                        </div>
                    </div>

                    <!-- 广告位：左 -->
                    <div style="border-top:1px dashed #e3e3e3;margin:14px 0 6px;padding-top:10px">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                            <div style="font-weight:600;font-size:14px;color:var(--primary)"><i class="fas fa-arrow-left"></i> 左侧广告位</div>
                            <button class="btn btn-sm" @click="aboutAdAdd('left')"><i class="fas fa-plus"></i> 添加</button>
                        </div>
                        <div v-if="editForm.about.leftAds.length === 0" class="text-muted" style="font-size:12px;padding:6px 0">暂无，点击"添加"新增左侧广告。</div>
                        <div v-for="(ad, idx) in editForm.about.leftAds" :key="'l'+idx"
                             style="border:1px solid #eee;border-radius:8px;padding:10px;margin-bottom:10px;background:#fafafa">
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                                <span class="ad-edit-idx">广告 {{ idx + 1 }}</span>
                                <button class="btn-icon" @click="aboutAdRemove('left', idx)" title="删除"><i class="fas fa-trash"></i></button>
                            </div>
                            <div style="display:flex;gap:8px;flex-wrap:wrap">
                                <div class="form-group" style="flex:1;min-width:130px">
                                    <label class="form-label">类型</label>
                                    <select class="form-input" v-model="ad.type">
                                        <option value="image">图片</option>
                                        <option value="video">视频</option>
                                        <option value="text">文字</option>
                                        <option value="google">谷歌广告</option>
                                    </select>
                                </div>
                                <div class="form-group" style="flex:1;min-width:130px">
                                    <label class="form-label">效果</label>
                                    <select class="form-input" v-model="ad.effect">
                                        <option value="">无</option>
                                        <option value="flash">闪烁</option>
                                        <option value="glow">发光</option>
                                    </select>
                                </div>
                            </div>
                            <div class="form-group" v-if="ad.type === 'text'">
                                <label class="form-label">文字内容</label>
                                <input class="form-input" v-model="ad.value" placeholder="广告文字内容">
                            </div>
                            <div class="form-group" v-else>
                                <label class="form-label">{{ ad.type === 'video' ? '视频 URL' : '图片 URL / 上传' }}</label>
                                <div style="display:flex;gap:6px">
                                    <input class="form-input" v-model="ad.value" placeholder="http(s):// 地址，或点右侧上传本地图片">
                                    <label class="btn btn-sm" style="white-space:nowrap">
                                        <i class="fas fa-upload"></i> 本地上传
                                        <input type="file" accept="image/*" style="display:none" @change="aboutAdUpload('left', idx, $event)">
                                    </label>
                                </div>
                            </div>
                            <div class="form-group" v-if="ad.type === 'google'">
                                <label class="form-label">发布商 ID（ca-pub-xxx）</label>
                                <input class="form-input" v-model="ad.adClient" placeholder="如：ca-pub-1234567890123456">
                            </div>
                            <div class="form-group" v-if="ad.type === 'google'">
                                <label class="form-label">广告位 ID（数字）</label>
                                <input class="form-input" v-model="ad.adSlot" placeholder="如：1234567890">
                            </div>
                            <div class="form-group" v-if="ad.type === 'google'">
                                <label class="form-label">或粘贴完整 AdSense 代码</label>
                                <textarea class="form-textarea" v-model="ad.adCode" rows="3" placeholder="<script>...<ins>...<script>"></textarea>
                            </div>
                            <div class="form-group">
                                <label class="form-label">跳转链接</label>
                                <input class="form-input" v-model="ad.link" placeholder="点击广告跳转的网址（留空则不跳转）">
                            </div>
                            <div style="display:flex;gap:8px;flex-wrap:wrap">
                                <div class="form-group" style="flex:1;min-width:90px"><label class="form-label">宽(px)</label><input class="form-input" type="number" v-model.number="ad.width"></div>
                                <div class="form-group" style="flex:1;min-width:90px"><label class="form-label">高(px)</label><input class="form-input" type="number" v-model.number="ad.height"></div>
                                <div class="form-group" style="flex:1;min-width:90px"><label class="form-label">圆角(px)</label><input class="form-input" type="number" v-model.number="ad.radius"></div>
                                <div class="form-group" style="flex:1;min-width:90px" v-if="ad.type === 'text'"><label class="form-label">文字色</label><input class="form-input" type="color" v-model="ad.color" style="height:34px;padding:2px"></div>
                            </div>
                            <div class="form-group" v-if="ad.type === 'text'">
                                <label class="form-label">背景色</label>
                                <input class="form-input" type="color" v-model="ad.bg" style="height:34px;padding:2px">
                            </div>
                        </div>
                    </div>

                    <!-- 广告位：右 -->
                    <div style="border-top:1px dashed #e3e3e3;margin:14px 0 6px;padding-top:10px">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                            <div style="font-weight:600;font-size:14px;color:var(--primary)">右侧广告位 <i class="fas fa-arrow-right"></i></div>
                            <button class="btn btn-sm" @click="aboutAdAdd('right')"><i class="fas fa-plus"></i> 添加</button>
                        </div>
                        <div v-if="editForm.about.rightAds.length === 0" class="text-muted" style="font-size:12px;padding:6px 0">暂无，点击"添加"新增右侧广告。</div>
                        <div v-for="(ad, idx) in editForm.about.rightAds" :key="'r'+idx"
                             style="border:1px solid #eee;border-radius:8px;padding:10px;margin-bottom:10px;background:#fafafa">
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                                <span class="ad-edit-idx">广告 {{ idx + 1 }}</span>
                                <button class="btn-icon" @click="aboutAdRemove('right', idx)" title="删除"><i class="fas fa-trash"></i></button>
                            </div>
                            <div style="display:flex;gap:8px;flex-wrap:wrap">
                                <div class="form-group" style="flex:1;min-width:130px">
                                    <label class="form-label">类型</label>
                                    <select class="form-input" v-model="ad.type">
                                        <option value="image">图片</option>
                                        <option value="video">视频</option>
                                        <option value="text">文字</option>
                                        <option value="google">谷歌广告</option>
                                    </select>
                                </div>
                                <div class="form-group" style="flex:1;min-width:130px">
                                    <label class="form-label">效果</label>
                                    <select class="form-input" v-model="ad.effect">
                                        <option value="">无</option>
                                        <option value="flash">闪烁</option>
                                        <option value="glow">发光</option>
                                    </select>
                                </div>
                            </div>
                            <div class="form-group" v-if="ad.type === 'text'">
                                <label class="form-label">文字内容</label>
                                <input class="form-input" v-model="ad.value" placeholder="广告文字内容">
                            </div>
                            <div class="form-group" v-else>
                                <label class="form-label">{{ ad.type === 'video' ? '视频 URL' : '图片 URL / 上传' }}</label>
                                <div style="display:flex;gap:6px">
                                    <input class="form-input" v-model="ad.value" placeholder="http(s):// 地址，或点右侧上传本地图片">
                                    <label class="btn btn-sm" style="white-space:nowrap">
                                        <i class="fas fa-upload"></i> 本地上传
                                        <input type="file" accept="image/*" style="display:none" @change="aboutAdUpload('right', idx, $event)">
                                    </label>
                                </div>
                            </div>
                            <div class="form-group" v-if="ad.type === 'google'">
                                <label class="form-label">发布商 ID（ca-pub-xxx）</label>
                                <input class="form-input" v-model="ad.adClient" placeholder="如：ca-pub-1234567890123456">
                            </div>
                            <div class="form-group" v-if="ad.type === 'google'">
                                <label class="form-label">广告位 ID（数字）</label>
                                <input class="form-input" v-model="ad.adSlot" placeholder="如：1234567890">
                            </div>
                            <div class="form-group" v-if="ad.type === 'google'">
                                <label class="form-label">或粘贴完整 AdSense 代码</label>
                                <textarea class="form-textarea" v-model="ad.adCode" rows="3" placeholder="<script>...<ins>...<script>"></textarea>
                            </div>
                            <div class="form-group">
                                <label class="form-label">跳转链接</label>
                                <input class="form-input" v-model="ad.link" placeholder="点击广告跳转的网址（留空则不跳转）">
                            </div>
                            <div style="display:flex;gap:8px;flex-wrap:wrap">
                                <div class="form-group" style="flex:1;min-width:90px"><label class="form-label">宽(px)</label><input class="form-input" type="number" v-model.number="ad.width"></div>
                                <div class="form-group" style="flex:1;min-width:90px"><label class="form-label">高(px)</label><input class="form-input" type="number" v-model.number="ad.height"></div>
                                <div class="form-group" style="flex:1;min-width:90px"><label class="form-label">圆角(px)</label><input class="form-input" type="number" v-model.number="ad.radius"></div>
                                <div class="form-group" style="flex:1;min-width:90px" v-if="ad.type === 'text'"><label class="form-label">文字色</label><input class="form-input" type="color" v-model="ad.color" style="height:34px;padding:2px"></div>
                            </div>
                            <div class="form-group" v-if="ad.type === 'text'">
                                <label class="form-label">背景色</label>
                                <input class="form-input" type="color" v-model="ad.bg" style="height:34px;padding:2px">
                            </div>
                        </div>
                    </div>

                    <!-- 预览 -->
                    <div class="form-group">
                        <label class="form-label">预览</label>
                        <div class="about-preview">
                            <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;padding:20px;text-align:center;border-radius:8px">
                                <h3 style="margin:0 0 6px;font-size:22px">{{ editForm.about.title || '关于作者' }}</h3>
                                <p v-if="editForm.about.subtitle" style="font-size:13px;margin:0;opacity:.9">{{ editForm.about.subtitle }}</p>
                            </div>
                            <h4 style="margin:12px 0 6px;font-size:15px;font-weight:600;color:#444"><i class="fas fa-id-card" style="margin-right:4px;color:var(--primary)"></i>个人简介</h4>
                            <div v-if="editForm.about.introMode === 'html' && editForm.about.introHtml" v-html="editForm.about.introHtml"></div>
                            <div v-for="(p, i) in aboutPreviewParagraphs" :key="i" v-else><p style="font-size:13px;color:#555;margin:0 0 6px">{{ p }}</p></div>
                            <h4 style="margin:12px 0 6px;font-size:15px;font-weight:600;color:#444"><i class="fas fa-code" style="margin-right:4px;color:var(--primary)"></i>技术栈</h4>
                            <div style="display:flex;flex-wrap:wrap;gap:6px">
                                <span v-for="(sk, i) in editForm.about.skills" :key="'ps'+i" style="background:#f0f0f0;border-radius:4px;padding:3px 8px;font-size:12px">{{ sk.name || '技能' }}</span>
                            </div>
                            <h4 style="margin:12px 0 6px;font-size:15px;font-weight:600;color:#444"><i class="fas fa-heart" style="margin-right:4px;color:var(--primary)"></i>工作理念</h4>
                            <div v-if="editForm.about.philosophyMode === 'html' && editForm.about.philosophyHtml" v-html="editForm.about.philosophyHtml"></div>
                            <p v-else style="font-size:13px;color:#555;margin:0 0 6px;white-space:pre-wrap">{{ editForm.about.philosophy }}</p>
                            <h4 style="margin:12px 0 6px;font-size:15px;font-weight:600;color:#444"><i class="fas fa-address-book" style="margin-right:4px;color:var(--primary)"></i>联系方式</h4>
                            <div v-for="(ct, i) in editForm.about.contacts" :key="'pc'+i" style="font-size:13px;color:#555;margin:0 0 4px">{{ ct.label }} {{ ct.value }}</div>
                            <div v-if="editForm.about.leftAds.length || editForm.about.rightAds.length" style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap">
                                <div v-for="(ad, i) in editForm.about.leftAds" :key="'pl'+i" v-html="aboutAdPreview(ad)"></div>
                                <div v-for="(ad, i) in editForm.about.rightAds" :key="'pr'+i" v-html="aboutAdPreview(ad)"></div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn" @click="openAboutInTab"><i class="fas fa-cog"></i> 设置</button>
                    <button class="btn" @click="modal.about = false">取消</button>
                    <button class="btn btn-primary" @click="saveAbout">保存</button>
                </div>
            </div>
        </div>

        <!-- 站点提交页面编辑弹窗 -->
        <div v-if="modal.commit" class="modal-overlay">
            <div class="modal" style="max-width:640px">
                <div class="modal-header">
                    <h3><i class="fas fa-paper-plane"></i> 站点提交页面</h3>
                    <button class="btn-icon" @click="modal.commit = false"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <div style="margin-bottom:12px;font-size:12px;color:var(--text-muted)">
                        <i class="fas fa-info-circle"></i> 此处编辑的内容会显示在导航站「站点提交」页面。须知每行一条，分类用逗号分隔。
                    </div>
                    <div class="form-group">
                        <label class="form-label">页面标题</label>
                        <input class="form-input" v-model="editForm.commit.title" placeholder="如：网址提交">
                    </div>
                    <div class="form-group">
                        <label class="form-label">副标题</label>
                        <input class="form-input" v-model="editForm.commit.subtitle" placeholder="如：提交您的优质网站...">
                    </div>
                    <div class="form-group">
                        <label class="form-label">提交须知（每行一条）</label>
                        <textarea class="form-textarea" v-model="editForm.commit.guidelines" rows="6"
                                  placeholder="例如：&#10;请确保网站内容合法、健康...&#10;网站应正常访问..."></textarea>
                        <div class="setting-hint">每行一条须知，显示为列表项。</div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">成功提示消息</label>
                        <input class="form-input" v-model="editForm.commit.successMessage" placeholder="如：提交成功！我们会尽快审核...">
                    </div>
                    <div class="form-group">
                        <label class="form-label">分类选项（逗号分隔）</label>
                        <input class="form-input" v-model="editForm.commit.categories" placeholder="常用工具,科研办公,开发设计,效率办公,社交媒体">
                        <div class="setting-hint">用逗号分隔，显示为下拉选项。</div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn" @click="modal.commit = false">取消</button>
                    <button class="btn btn-primary" @click="saveCommit">保存</button>
                </div>
            </div>
        </div>

        <!-- 菜单键设置弹窗（侧边栏底部菜单项：网站提交/友情链接/关于导航 等） -->
        <div v-if="modal.menuKeys" class="modal-overlay">
            <div class="modal" style="max-width:780px">
                <div class="modal-header">
                    <h3><i class="fas fa-bars"></i> 菜单键设置</h3>
                    <button class="btn-icon" @click="modal.menuKeys = false"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body" style="max-height:70vh;overflow-y:auto">
                    <div style="margin-bottom:14px;font-size:12px;color:var(--text-muted);line-height:1.6">
                        <i class="fas fa-info-circle"></i> 这里是访客页面左侧栏底部的菜单项（如：网站提交、友情链接、关于导航）。
                        你可以添加、编辑、删除、排序这些菜单项。每个菜单项包含：图标、文字、链接地址、打开方式。
                    </div>
                    <div v-if="!data.menuKeys || data.menuKeys.length === 0"
                         style="text-align:center;padding:30px;color:var(--text-muted);background:var(--bg);border-radius:var(--radius-sm)">
                        <i class="fas fa-inbox" style="font-size:32px;margin-bottom:8px;display:block"></i>
                        暂无菜单项，点击下方"添加菜单项"创建第一个
                    </div>
                    <div v-else>
                        <div v-for="(m, idx) in data.menuKeys" :key="m.id"
                             style="background:var(--bg);border-radius:var(--radius-sm);padding:12px;margin-bottom:8px;border:1px solid var(--border)">
                            <div style="display:flex;align-items:center;gap:4px">
                                <!-- 图标预览 + 修改 -->
                                <div style="width:42px;height:42px;display:flex;align-items:center;justify-content:center;background:var(--surface);border-radius:8px;flex-shrink:0;border:1px solid var(--border)">
                                    <i :class="m.icon" style="font-size:18px;color:var(--primary)"></i>
                                </div>
                                <!-- 文字 + URL -->
                                <div style="flex:1;min-width:0">
                                    <div style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ m.text }}</div>
                                    <div style="font-size:11px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px">
                                        <i :class="m.target === '_blank' ? 'fas fa-external-link-alt' : 'fas fa-link'" style="margin-right:4px"></i>
                                        {{ m.url || '(无链接)' }}
                                    </div>
                                </div>
                                <!-- 操作按钮 -->
                                <div style="display:flex;gap:4px;flex-shrink:0">
                                    <button class="btn-icon" @click="moveMenuKey(idx, -1)" :disabled="idx === 0" title="上移">
                                        <i class="fas fa-arrow-up"></i>
                                    </button>
                                    <button class="btn-icon" @click="moveMenuKey(idx, 1)" :disabled="idx === data.menuKeys.length - 1" title="下移">
                                        <i class="fas fa-arrow-down"></i>
                                    </button>
                                    <button class="btn-icon" @click="editMenuKey(m)" title="编辑">
                                        <i class="fas fa-pen"></i>
                                    </button>
                                    <button class="btn-icon danger" @click="deleteMenuKey(m.id)" title="删除">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <button class="btn btn-sm" style="margin-top:12px;width:100%;border:1.5px dashed var(--primary);color:var(--primary);padding:10px" @click="addMenuKey">
                        <i class="fas fa-plus"></i> 添加菜单项
                    </button>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary" @click="modal.menuKeys = false">完成</button>
                </div>
            </div>
        </div>

        <!-- 菜单项编辑弹窗 -->
        <div v-if="modal.menuKeyEdit" class="modal-overlay">
            <div class="modal" style="max-width:520px">
                <div class="modal-header">
                    <h3><i class="fas fa-edit"></i> {{ editForm.menuKey.id ? '编辑菜单项' : '添加菜单项' }}</h3>
                    <button class="btn-icon" @click="modal.menuKeyEdit = false"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label class="form-label">显示文字 <span class="required">*</span></label>
                        <input class="form-input" v-model="editForm.menuKey.text" placeholder="如：网站提交、友情链接、关于导航">
                    </div>
                    <div class="form-group">
                        <label class="form-label">链接地址</label>
                        <input class="form-input" v-model="editForm.menuKey.url" placeholder="如：commit.html、https://example.com、#friendlink">
                        <div class="setting-hint">支持站内锚点（#开头）、站内相对路径、站外完整 URL</div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">打开方式</label>
                        <select class="form-input" v-model="editForm.menuKey.target">
                            <option value="">当前页面打开（站内锚点推荐）</option>
                            <option value="_blank">新标签页打开（外部链接推荐）</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">图标</label>
                        <div class="icon-picker-cat">
                            <div class="cat-icon-card" @click="openIconPicker('menuKey')" title="点击更换图标">
                                <i :class="editForm.menuKey.icon" class="cat-icon-card-img"></i>
                                <div class="cat-icon-card-overlay">
                                    <i class="fas fa-camera"></i>
                                </div>
                            </div>
                            <div class="cat-icon-info">
                                <div class="cat-icon-name" :title="editForm.menuKey.icon">{{ editForm.menuKey.icon || 'fas fa-link' }}</div>
                                <button class="btn btn-sm btn-primary" @click="openIconPicker('menuKey')">
                                    <i class="fas fa-icons"></i> 选择图标
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="form-group" style="display:flex;align-items:center;gap:10px">
                        <label class="form-label" style="margin:0;white-space:nowrap">图标颜色</label>
                        <input type="color" v-model="editForm.menuKey.iconColor" style="width:42px;height:30px;border:none;background:none;cursor:pointer;padding:0">
                        <button type="button" class="btn btn-sm" @click="editForm.menuKey.iconColor='#b2b8be'">恢复默认</button>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn" @click="modal.menuKeyEdit = false">取消</button>
                    <button class="btn btn-primary" @click="saveMenuKey">保存</button>
                </div>
            </div>
        </div>

        <!-- 新图标编辑器弹窗（两模式：图片/文字） -->
        <div v-if="modal.iconEditor" class="modal-overlay" @click.self="closeIconEditor" @keydown.enter.stop>
            <div class="modal icon-editor-modal" style="max-width:880px" @click.stop>
                <div class="modal-header">
                    <h3 style="display:flex;align-items:center;gap:8px">
                        <i class="fas fa-paint-brush"></i>
                        <span>{{ editForm.iconEditor.title || '图标设置' }}</span>
                    </h3>
                    <button class="btn-icon" @click="closeIconEditor"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <!-- 模式切换标签 -->
                    <div class="icon-editor-tabs">
                        <button type="button" class="icon-editor-tab"
                                :class="{ active: editForm.iconEditor.tab === 'image' }"
                                @click="editForm.iconEditor.tab = 'image'">
                            <i class="fas fa-image"></i> 图片
                        </button>
                        <button type="button" class="icon-editor-tab"
                                :class="{ active: editForm.iconEditor.tab === 'text' }"
                                v-if="(editForm.iconEditor.target || '').indexOf('searchEngine:') !== 0"
                                @click="editForm.iconEditor.tab = 'text'">
                            <i class="fas fa-font"></i> 文字
                        </button>
                        <button type="button" class="icon-editor-tab"
                                :class="{ active: editForm.iconEditor.tab === 'svg' }"
                                @click="editForm.iconEditor.tab = 'svg'">
                            <i class="fas fa-code"></i> SVG 代码
                        </button>
                        <button type="button" class="icon-editor-tab"
                                :class="{ active: editForm.iconEditor.tab === 'url' }"
                                @click="editForm.iconEditor.tab = 'url'">
                            <i class="fas fa-link"></i> URL 地址
                        </button>
                    </div>

                    <!-- ===== image 模式 ===== -->
                    <div v-if="editForm.iconEditor.tab === 'image'" class="icon-editor-workspace">
                    <!-- 预览图 + 下方按钮 竖列容器 -->
                    <div class="icon-editor-preview-col">
                    <!-- 图片预览 + 裁剪 -->
                    <div :class="{ 'icon-editor-preview': true, 'icon-editor-dragging': editForm.iconEditor.dragging }"
                             style="position:relative;width:350px;height:350px;margin:0 auto;overflow:hidden;border-radius:8px;background:repeating-conic-gradient(#e8e8e8 0% 25%,#fff 0% 50%) 0 0 / 16px 16px;border:1px solid var(--border);cursor:grab;user-select:none"
                             @pointerdown="onIePointerDown"
                             @pointermove="onIePointerMove"
                             @pointerup="onIePointerUp"
                             @pointerleave="onIePointerUp"
                             @wheel.prevent="onIeWheel">
                            <!-- 背景色层 -->
                            <div v-if="editForm.iconEditor.bgColor && editForm.iconEditor.bgColor !== 'transparent'"
                                 style="position:absolute;inset:0;z-index:1"
                                 :style="{ background: editForm.iconEditor.bgColor }"></div>
                            <!-- 图片层 -->
                            <div v-if="editForm.iconEditor.sourceImage" style="position:absolute;z-index:2"
                                 :style="{
                                     transform: 'translate(' + editForm.iconEditor.imgTranslateX + 'px, ' + editForm.iconEditor.imgTranslateY + 'px) scale(' + (editForm.iconEditor.imgScale || 1) + ')',
                                     transformOrigin: 'center center',
                                     width: (editForm.iconEditor._dispW || 350) + 'px',
                                     height: (editForm.iconEditor._dispH || 350) + 'px'
                                 }">
                                <img :src="editForm.iconEditor.sourceImage"
                                     :style="{
                                         width: (editForm.iconEditor._dispW || 350) + 'px',
                                         height: (editForm.iconEditor._dispH || 350) + 'px',
                                         transform: 'rotate(' + editForm.iconEditor.rotation + 'deg)',
                                         objectFit: 'cover',
                                         opacity: (editForm.iconEditor.iconOpacity != null ? editForm.iconEditor.iconOpacity : 100) / 100
                                     }"
                                     draggable="false"
                                     @error="$event.target.style.display='none'">
                            </div>
                            <!-- 裁剪框 + 暗色遮罩 -->
                            <!-- 外部暗色遮罩：z-index 3, pointer-events none 让事件穿透到图片层 -->
                            <div style="position:absolute;inset:0;z-index:3;pointer-events:none"
                                 v-if="editForm.iconEditor.cropInit">
                                <!-- 用四个半透明区块拼出暗色遮罩（裁剪框区域透明） -->
                                <div :style="{ position:'absolute', top:0, left:0, right:0, height: editForm.iconEditor.cropY + 'px', background:'rgba(0,0,0,.5)' }"></div>
                                <div :style="{ position:'absolute', top: editForm.iconEditor.cropY + 'px', left:0, width: editForm.iconEditor.cropX + 'px', height: editForm.iconEditor.cropH + 'px', background:'rgba(0,0,0,.5)' }"></div>
                                <div :style="{ position:'absolute', top: editForm.iconEditor.cropY + 'px', left: (editForm.iconEditor.cropX + editForm.iconEditor.cropW) + 'px', right:0, height: editForm.iconEditor.cropH + 'px', background:'rgba(0,0,0,.5)' }"></div>
                                <div :style="{ position:'absolute', bottom:0, left:0, right:0, top: (editForm.iconEditor.cropY + editForm.iconEditor.cropH) + 'px', background:'rgba(0,0,0,.5)' }"></div>
                            </div>
                            <!-- 裁剪框（白边框 + 拖拽手柄），z-index 4，可交互 -->
                            <div v-if="editForm.iconEditor.cropInit"
                                 style="position:absolute;z-index:4;border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,.3);cursor:move;touch-action:none"
                                 :style="{
                                     left: editForm.iconEditor.cropX + 'px',
                                     top: editForm.iconEditor.cropY + 'px',
                                     width: editForm.iconEditor.cropW + 'px',
                                     height: editForm.iconEditor.cropH + 'px',
                                     borderRadius: editForm.iconEditor.shape === 'circle' ? '50%' : (editForm.iconEditor.shape === 'round' ? Math.round(editForm.iconEditor.cropW * 0.16) + 'px' : '0')
                                 }"
                                 @pointerdown="onCropBoxPointerDown($event)">
                                <!-- 四个角手柄 -->
                                <div style="position:absolute;top:-5px;left:-5px;width:10px;height:10px;background:#fff;border:1px solid rgba(0,0,0,.3);border-radius:2px;cursor:nwse-resize;z-index:5"
                                     @pointerdown.stop="onCropHandlePointerDown($event,'nw')"></div>
                                <div style="position:absolute;top:-5px;right:-5px;width:10px;height:10px;background:#fff;border:1px solid rgba(0,0,0,.3);border-radius:2px;cursor:nesw-resize;z-index:5"
                                     @pointerdown.stop="onCropHandlePointerDown($event,'ne')"></div>
                                <div style="position:absolute;bottom:-5px;left:-5px;width:10px;height:10px;background:#fff;border:1px solid rgba(0,0,0,.3);border-radius:2px;cursor:nesw-resize;z-index:5"
                                     @pointerdown.stop="onCropHandlePointerDown($event,'sw')"></div>
                                <div style="position:absolute;bottom:-5px;right:-5px;width:10px;height:10px;background:#fff;border:1px solid rgba(0,0,0,.3);border-radius:2px;cursor:nwse-resize;z-index:5"
                                     @pointerdown.stop="onCropHandlePointerDown($event,'se')"></div>
                            </div>
                            <!-- 无图片时中央「+」点击选择图片 -->
                            <label v-if="!editForm.iconEditor.sourceImage"
                                 style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:180px;height:180px;display:flex;align-items:center;justify-content:center;z-index:5;cursor:pointer;border-radius:8px"
                                 @pointerdown.stop>
                                <input type="file" accept="image/*" style="display:none" @change="onIconEditorFileChange">
                                <span v-if="editForm.iconEditor.fetching" style="color:var(--text-secondary);font-size:13px;text-align:center">正在自动获取网站图标…</span>
                                <i v-else class="fas fa-plus" style="font-size:120px;color:var(--text-secondary);opacity:.45;pointer-events:none"></i>
                            </label>
                        </div>
                        <!-- 预览图下方操作按钮 -->
                        <div class="icon-editor-preview-actions">
                            <label class="btn btn-sm ie-upload-btn">
                                <i class="fas fa-cloud-upload-alt"></i> 选择图片
                                <input type="file" accept="image/*" style="display:none" @change="onIconEditorFileChange">
                            </label>
                            <button type="button" class="btn btn-sm btn-danger" :disabled="!editForm.iconEditor.sourceImage" @click="deleteIconEditorImage">
                                <i class="fas fa-trash-alt"></i> 删除图片
                            </button>
                        </div>
                        <!-- 在线获取 / 选择图标 -->
                        <div class="icon-editor-fetch-actions" style="display:flex;gap:10px;margin-top:10px;justify-content:center">
                            <button type="button" class="btn btn-sm" :disabled="editForm.iconEditor.fetchingIcons" @click="fetchIconsForEditor(editForm.iconEditor)">
                                <i class="fas fa-globe"></i>
                                <span v-if="editForm.iconEditor.fetchingIcons">获取中…</span>
                                <span v-else>在线获取</span>
                            </button>
                            <button type="button" class="btn btn-sm btn-primary" :disabled="editForm.iconEditor.selectedFetchedIndex < 0 || !editForm.iconEditor.fetchedIcons.length" @click="selectFetchedIcon(editForm.iconEditor)">
                                <i class="fas fa-check-circle"></i> 选择图标
                            </button>
                        </div>
                        <!-- 候选图标网格（仅内存，不保存） -->
                        <div v-if="editForm.iconEditor.fetchedIcons && editForm.iconEditor.fetchedIcons.length" class="icon-editor-fetch-grid" style="margin-top:12px;padding:10px;background:#f8f9fa;border-radius:8px;display:flex;flex-wrap:wrap;gap:10px;justify-content:center;max-width:350px">
                            <div v-for="(icon, idx) in editForm.iconEditor.fetchedIcons" :key="idx"
                                 style="display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;padding:6px;border-radius:6px;transition:background .2s"
                                 :style="{ background: editForm.iconEditor.selectedFetchedIndex === idx ? '#e6f7ff' : 'transparent', outline: editForm.iconEditor.selectedFetchedIndex === idx ? '2px solid #597ef7' : '2px solid transparent' }"
                                 @click="editForm.iconEditor.selectedFetchedIndex = idx">
                                <img :src="icon.data" style="width:48px;height:48px;object-fit:contain;border-radius:4px;background:#fff;border:1px solid var(--border)" @error="$event.target.style.display='none'">
                                <span style="font-size:11px;color:var(--text-secondary);white-space:nowrap;max-width:70px;overflow:hidden;text-overflow:ellipsis">{{ icon.name }}</span>
                            </div>
                        </div>
                    </div>
                        <!-- 控制栏 -->
                        <div class="icon-editor-controls">
                            <div class="ie-control-row">
                                <span class="ie-label">形状</span>
                                <button class="btn btn-sm" :class="{ 'btn-primary': editForm.iconEditor.shape === 'square' }" @click="editForm.iconEditor.shape = 'square'">方形</button>
                                <button class="btn btn-sm" :class="{ 'btn-primary': editForm.iconEditor.shape === 'round' }" @click="editForm.iconEditor.shape = 'round'">圆角</button>
                                <button class="btn btn-sm" :class="{ 'btn-primary': editForm.iconEditor.shape === 'circle' }" @click="editForm.iconEditor.shape = 'circle'">圆形</button>
                            </div>
                            <div class="ie-control-row">
                                <span class="ie-label">缩放：</span>
                                <button class="btn btn-xs ie-step-btn" @click="editForm.iconEditor.imgScale = Math.max(0.1, (editForm.iconEditor.imgScale||1) - 0.1)" :disabled="(editForm.iconEditor.imgScale||1)<=0.1">−</button>
                                <input type="number" class="form-input ie-num-input" :value="Math.round((editForm.iconEditor.imgScale||1)*100)" min="10" max="500" step="1" @change="const v = Math.max(10, Math.min(500, Number($event.target.value) || 100)); editForm.iconEditor.imgScale = v/100;">
                                <span class="ie-unit">%</span>
                                <button class="btn btn-xs ie-step-btn" @click="editForm.iconEditor.imgScale = Math.min(5, (editForm.iconEditor.imgScale||1) + 0.1)">+</button>
                                <button class="btn btn-xs" v-if="editForm.iconEditor.imgScale!==1" @click="editForm.iconEditor.imgScale = 1; editForm.iconEditor.imgTranslateX = (editForm.iconEditor._initX !== undefined ? editForm.iconEditor._initX : 0); editForm.iconEditor.imgTranslateY = (editForm.iconEditor._initY !== undefined ? editForm.iconEditor._initY : 0)">重置</button>
                            </div>
                            <div class="ie-control-row">
                                <span class="ie-label">旋转：</span>
                                <input type="number" class="form-input ie-num-input" :value="editForm.iconEditor.rotation > 180 ? editForm.iconEditor.rotation - 360 : editForm.iconEditor.rotation" min="-180" max="180" step="1" @change="let r = (Number($event.target.value) || 0) % 360; if (r < 0) r += 360; editForm.iconEditor.rotation = r;">
                                <span class="ie-unit">°</span>
                                <input type="range" min="-180" max="180" class="ie-range-slider" :value="editForm.iconEditor.rotation > 180 ? editForm.iconEditor.rotation - 360 : editForm.iconEditor.rotation" @input="let r = Number($event.target.value); if (r < 0) r += 360; editForm.iconEditor.rotation = r;" @wheel.prevent="onRotationWheel">
                                <button class="btn btn-sm" @click="editForm.iconEditor.rotation = (editForm.iconEditor.rotation + 90) % 360"><i class="fas fa-redo-alt"></i> 顺时针</button>
                            </div>
                            <div class="ie-control-row">
                                <span class="ie-label">不透明度：</span>
                                <input type="number" class="form-input ie-num-input" :value="editForm.iconEditor.iconOpacity != null ? editForm.iconEditor.iconOpacity : 100" min="0" max="100" step="1" @change="let o = clampVal(Number($event.target.value) || 0, 0, 100); editForm.iconEditor.iconOpacity = o;">
                                <span class="ie-unit">%</span>
                                <input type="range" min="0" max="100" class="ie-range-slider" :value="editForm.iconEditor.iconOpacity != null ? editForm.iconEditor.iconOpacity : 100" @input="editForm.iconEditor.iconOpacity = Number($event.target.value)" @wheel.prevent="onIconOpacityWheel">
                            </div>
                            <div class="ie-control-row ie-colors-row">
                                <span class="ie-label">背景：</span>
                                <button class="color-swatch" :class="{ active: editForm.iconEditor.bgColor === 'transparent' }" @click="editForm.iconEditor.bgColor = 'transparent'" title="透明" style="background:repeating-linear-gradient(45deg,#ccc 0,#ccc 2px,#fff 2px,#fff 4px)"></button>
                                <button class="color-swatch" :class="{ active: editForm.iconEditor.bgColor === '#ff4d4f' }" @click="editForm.iconEditor.bgColor = '#ff4d4f'" title="红色" style="background:#ff4d4f"></button>
                                <button class="color-swatch" :class="{ active: editForm.iconEditor.bgColor === '#fa8c16' }" @click="editForm.iconEditor.bgColor = '#fa8c16'" title="橙色" style="background:#fa8c16"></button>
                                <button class="color-swatch" :class="{ active: editForm.iconEditor.bgColor === '#fadb14' }" @click="editForm.iconEditor.bgColor = '#fadb14'" title="黄色" style="background:#fadb14"></button>
                                <button class="color-swatch" :class="{ active: editForm.iconEditor.bgColor === '#a0d911' }" @click="editForm.iconEditor.bgColor = '#a0d911'" title="浅绿色" style="background:#a0d911"></button>
                                <button class="color-swatch" :class="{ active: editForm.iconEditor.bgColor === '#36cfc9' }" @click="editForm.iconEditor.bgColor = '#36cfc9'" title="青色" style="background:#36cfc9"></button>
                                <button class="color-swatch" :class="{ active: editForm.iconEditor.bgColor === '#597ef7' }" @click="editForm.iconEditor.bgColor = '#597ef7'" title="蓝色" style="background:#597ef7"></button>
                                <button class="color-swatch" :class="{ active: editForm.iconEditor.bgColor === '#b37feb' }" @click="editForm.iconEditor.bgColor = '#b37feb'" title="紫色" style="background:#b37feb"></button>
                                <button class="color-swatch ie-custom-color-btn" :class="{ active: isCustomIconBg('image') }" title="自定义颜色（含不透明度）" @click="openIconBgColorPicker" style="background:conic-gradient(red,yellow,lime,aqua,blue,magenta,red);border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.15);cursor:pointer"></button>
                            </div>
                            <div class="ie-control-row">
                                <span class="ie-label">格式：</span>
                                <select class="form-input ie-output-input" style="width:92px;height:28px;padding:0 4px"
                                        :value="editForm.iconEditor.outputFormat || 'auto'"
                                        @change="editForm.iconEditor.outputFormat = $event.target.value">
                                    <option value="auto">自动</option>
                                    <option value="avif">AVIF</option>
                                    <option value="webp">WebP</option>
                                    <option value="png">PNG</option>
                                    <option value="jpeg">JPEG</option>
                                </select>
                                <span class="ie-unit">质量</span>
                                <input type="number" class="form-input ie-output-input" style="width:56px"
                                       :value="editForm.iconEditor.outputQuality != null ? editForm.iconEditor.outputQuality : 85"
                                       min="1" max="100" step="1"
                                       @change="editForm.iconEditor.outputQuality = Math.max(1, Math.min(100, Number($event.target.value) || 85))">
                                <span class="ie-unit">%</span>
                            </div>
                            <div class="ie-control-row ie-output-row">
                                <span class="ie-label">输出：</span>
                                <input type="number" v-model.number="editForm.iconEditor.outputSize" min="16" max="512" class="form-input ie-output-input"> px
                                <span class="ie-hint">拖拽图片移动 · 拖拽裁剪框选区域 · 滚轮缩放</span>
                            </div>
                        </div>
                    </div>

                    <!-- ===== text 模式 ===== -->
                    <div v-if="editForm.iconEditor.tab === 'text'">
                        <div style="text-align:center;margin-bottom:12px">
                            <label style="display:block;margin-bottom:6px;font-size:12px;color:var(--text-secondary)">文字内容：</label>
                            <input class="form-input" v-model="editForm.iconEditor.textValue" maxlength="4"
                                   style="width:160px;text-align:center;font-size:18px" placeholder="输入文字">
                        </div>
                        <div style="text-align:center;margin-bottom:12px">
                            <label style="display:block;margin-bottom:6px;font-size:12px;color:var(--text-secondary)">背景色（可选）：</label>
                            <div style="display:flex;gap:4px;justify-content:center;flex-wrap:wrap">
                                <button class="btn btn-sm color-swatch" :class="{ active: editForm.iconEditor.bgColor === 'transparent' }" @click="editForm.iconEditor.bgColor = 'transparent'" title="无背景" style="width:24px;height:24px;padding:0;border-radius:50%;background:repeating-linear-gradient(45deg,#ccc 0,#ccc 2px,#fff 2px,#fff 4px)"></button>
                                <button class="btn btn-sm color-swatch" :class="{ active: editForm.iconEditor.bgColor === '#597ef7' }" @click="editForm.iconEditor.bgColor = '#597ef7'" title="蓝色" style="width:24px;height:24px;padding:0;border-radius:50%;background:#597ef7"></button>
                                <button class="btn btn-sm color-swatch" :class="{ active: editForm.iconEditor.bgColor === '#ff4d4f' }" @click="editForm.iconEditor.bgColor = '#ff4d4f'" title="红色" style="width:24px;height:24px;padding:0;border-radius:50%;background:#ff4d4f"></button>
                                <button class="btn btn-sm color-swatch" :class="{ active: editForm.iconEditor.bgColor === '#36cfc9' }" @click="editForm.iconEditor.bgColor = '#36cfc9'" title="青色" style="width:24px;height:24px;padding:0;border-radius:50%;background:#36cfc9"></button>
                                <button class="btn btn-sm color-swatch" :class="{ active: editForm.iconEditor.bgColor === '#b37feb' }" @click="editForm.iconEditor.bgColor = '#b37feb'" title="紫色" style="width:24px;height:24px;padding:0;border-radius:50%;background:#b37feb"></button>
                                <button class="btn btn-sm color-swatch" :class="{ active: editForm.iconEditor.bgColor === '#2c3e50' }" @click="editForm.iconEditor.bgColor = '#2c3e50'" title="深色" style="width:24px;height:24px;padding:0;border-radius:50%;background:#2c3e50"></button>
                                <button class="btn btn-sm color-swatch" :class="{ active: isCustomIconBg('text') }" title="自定义颜色（含不透明度）" @click="openIconBgColorPicker" style="width:24px;height:24px;padding:0;border-radius:50%;background:conic-gradient(red,yellow,lime,aqua,blue,magenta,red);cursor:pointer"></button>
                            </div>
                        </div>
                        <!-- 预览 -->
                        <div style="display:flex;justify-content:center;margin-top:14px">
                            <div style="width:80px;height:80px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:bold;color:#fff;overflow:hidden"
                                 :style="editForm.iconEditor.bgColor && editForm.iconEditor.bgColor !== 'transparent' ? { background: editForm.iconEditor.bgColor } : { background: '#597ef7' }">
                                {{ editForm.iconEditor.textValue || 'T' }}
                            </div>
                        </div>
                    </div>

                    <!-- ===== svg 模式 ===== -->
                    <div v-if="editForm.iconEditor.tab === 'svg'">
                        <div style="text-align:center;margin-bottom:12px">
                            <label style="display:block;margin-bottom:6px;font-size:12px;color:var(--text-secondary)">SVG 代码：</label>
                            <textarea v-model="editForm.iconEditor.svgText" rows="6"
                                      style="width:100%;max-width:520px;font-family:monospace;font-size:13px;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);resize:vertical"
                                      placeholder="<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>...</svg>"></textarea>
                        </div>
                        <div style="text-align:center;margin-bottom:6px;font-size:12px;color:var(--text-secondary)">实时预览：</div>
                        <div style="display:flex;justify-content:center;margin-bottom:8px">
                            <div style="width:80px;height:80px;border-radius:8px;border:1px solid var(--border);background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:6px"
                                 v-html="isSvgText(editForm.iconEditor.svgText) ? editForm.iconEditor.svgText : ''"></div>
                        </div>
                        <div style="text-align:center;font-size:12px;color:#fa8c16;margin-top:10px">建议 viewBox 为正方形，推荐 64×64</div>
                    </div>

                    <!-- ===== url 模式 ===== -->
                    <div v-if="editForm.iconEditor.tab === 'url'">
                        <div style="text-align:center;margin-bottom:12px">
                            <label style="display:block;margin-bottom:6px;font-size:12px;color:var(--text-secondary)">URL 地址：</label>
                            <input class="form-input" v-model="editForm.iconEditor.urlValue"
                                   style="width:100%;max-width:520px" placeholder="https://example.com/icon.png">
                        </div>
                        <div style="text-align:center;margin-bottom:6px;font-size:12px;color:var(--text-secondary)">实时预览：</div>
                        <div style="display:flex;justify-content:center;margin-bottom:8px">
                            <div style="width:80px;height:80px;border-radius:8px;border:1px solid var(--border);background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:6px">
                                <img v-if="isHttpUrl(editForm.iconEditor.urlValue) || isDataUrl(editForm.iconEditor.urlValue)" :src="editForm.iconEditor.urlValue" style="max-width:100%;max-height:100%" @error="$event.target.style.display='none'">
                            </div>
                        </div>
                        <div style="text-align:center;font-size:12px;color:#fa8c16;margin-top:10px">推荐 64×64 PNG/ICO，支持绝对 URL、相对路径、data: base64 内联</div>
                    </div>
                </div>
                <div class="modal-footer" style="justify-content:flex-end;">
                    <button class="btn btn-primary" @click="applyIconEditor()">应用</button>
                </div>
            </div>
        </div>

        <!-- 自定义取色器弹窗 -->
        <div v-if="colorPicker.open" class="modal-overlay color-picker-overlay" style="z-index:1200" @click.self="confirmColorPicker">
            <div class="modal color-picker-modal" tabindex="-1" @click.stop>
                <div class="modal-header">
                    <h3 style="display:flex;align-items:center;gap:8px"><i class="fas fa-palette"></i> 自定义颜色</h3>
                    <button class="btn-icon" @click="confirmColorPicker"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body color-picker-body">
                    <!-- 饱和度/明度 渐变区 -->
                    <canvas ref="svCanvas" class="cp-sv" width="240" height="150"
                            @pointerdown.stop="onSVPointerDown($event)"
                            @pointermove.stop="onSVPointerMove($event)"
                            @pointerup.stop="onSVPointerUp"
                            @pointerleave.stop="onSVPointerUp"></canvas>
                    <!-- 色相条 -->
                    <canvas ref="hueCanvas" class="cp-hue" width="240" height="14"
                            @pointerdown.stop="onHuePointerDown($event)"
                            @pointermove.stop="onHuePointerMove($event)"
                            @pointerup.stop="onHuePointerUp"
                            @pointerleave.stop="onHuePointerUp"></canvas>
                    <!-- 透明度条 -->
                    <canvas ref="alphaCanvas" class="cp-alpha" width="240" height="14"
                            @pointerdown.stop="onAlphaPointerDown($event)"
                            @pointermove.stop="onAlphaPointerMove($event)"
                            @pointerup.stop="onAlphaPointerUp"
                            @pointerleave.stop="onAlphaPointerUp"></canvas>
                    <div class="cp-alpha-row">
                        <span style="font-size:11px;color:var(--text-muted);flex-shrink:0">不透明度</span>
                        <input type="number" min="0" max="100" :value="colorPicker.a" @input="(e)=>{ const t=clampVal(Number(e.target.value)||0,0,100); colorPicker.a=t; recomposeColor(); drawAlpha(); }" style="width:54px">
                        <span style="font-size:11px;color:var(--text-muted);flex-shrink:0">%</span>
                    </div>
                    <!-- RGB 输入 -->
                    <div class="cp-rgb-row">
                        <label>R</label><input type="number" min="0" max="255" v-model.number="colorPicker.r" @input="syncHsvFromRgb">
                        <label>G</label><input type="number" min="0" max="255" v-model.number="colorPicker.g" @input="syncHsvFromRgb">
                        <label>B</label><input type="number" min="0" max="255" v-model.number="colorPicker.b" @input="syncHsvFromRgb">
                    </div>
                    <!-- 当前色预览 + 十六进制 + 吸管 -->
                    <div class="cp-preview-row">
                        <span class="cp-current" :style="{ background: colorPicker.color }"></span>
                        <input type="text" class="cp-hex" :value="colorPicker.color" @change="(e)=>{ const v=e.target.value.trim(); const p=parseToRgba(v); if(p){ colorPicker.r=p.r; colorPicker.g=p.g; colorPicker.b=p.b; colorPicker.a=p.a; syncHsvFromRgb(); } }">
                        <button class="btn btn-sm" v-if="colorPicker.hasEyedropper" @click="useEyeDropper" title="屏幕取色"><i class="fas fa-eye-dropper"></i></button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Logo 裁剪器弹窗 -->
        <div v-if="modal.imageCropper" class="modal-overlay" :class="{ 'icp-ad-modal': editForm.imageCropper.target === 'adSlot' }" @click.self="closeLogoCropper" @keydown.enter.stop
             :style="{zIndex: editForm.imageCropper.target === 'adSlot' ? 10001 : 1100}"
             @pointermove="editForm.imageCropper.isCircleMode ? onCirclePointerMove($event) : onCropPointerMove($event)"
             @pointerup="editForm.imageCropper.isCircleMode ? onCirclePointerUp($event) : onCropPointerUp($event)"
             @pointerleave="editForm.imageCropper.isCircleMode ? onCirclePointerUp($event) : onCropPointerUp($event)">
            <div class="modal" :class="{ 'icp-sidebar-bg-modal': editForm.imageCropper.target === 'sidebarBackground' || editForm.imageCropper.target === 'sidebarBackgroundCollapsed' }" :style="editForm.imageCropper.siteStyleMode ? { width:'96vw', maxWidth: (editForm.imageCropper.target === 'sidebarBackground' || editForm.imageCropper.target === 'sidebarBackgroundCollapsed') ? '900px' : '1120px', maxHeight:'96vh', overflow:'auto' } : (editForm.imageCropper.target === 'headerLogo' ? { width:'680px', maxWidth:'92vw' } : { maxWidth: editForm.imageCropper.target === 'adSlot' ? '820px' : '560px' })" @click.stop>
                <div class="modal-header">
                    <h3 style="display:flex;align-items:center;gap:8px">
                        <i class="fas fa-crop-alt"></i>
                        <span v-if="editForm.imageCropper.target === 'wallpaper'">壁纸裁剪</span>
                        <span v-else-if="editForm.imageCropper.target === 'sidebarBackground'">左侧背景裁剪</span>
                        <span v-else-if="editForm.imageCropper.target === 'sidebarBackgroundCollapsed'">收起背景裁剪</span>
                        <span v-else>图标设置</span>
                    </h3>
                    <button class="btn-icon" @click="closeLogoCropper"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body" :style="editForm.imageCropper.siteStyleMode ? { maxWidth:'none', padding:'0', overflow:'visible', flex:'1 1 auto', minHeight:'0' } : {}">
                    <!-- 图标裁剪模式（圆形/方形）—— 左右分栏布局 -->
                    <div v-if="editForm.imageCropper.siteStyleMode" class="icon-cropper-layout">
                        <!-- 侧边栏背景：使用图标设置标准布局 -->
                        <template v-if="editForm.imageCropper.target === 'sidebarBackground' || editForm.imageCropper.target === 'sidebarBackgroundCollapsed'">
                            <div class="icon-editor-workspace" style="padding:20px">
                                <!-- 左侧预览列 -->
                                <div class="icon-editor-preview-col">
                                    <div class="icon-editor-preview"
                                         style="position:relative;width:350px;height:350px;margin:0 auto;overflow:hidden;border-radius:8px;background:repeating-conic-gradient(#e8e8e8 0% 25%,#fff 0% 50%) 0 0 / 16px 16px;border:1px solid var(--border);cursor:grab;user-select:none"
                                         @wheel.prevent="onCircleWheel"
                                         @pointerdown="onCirclePointerDown"
                                         @pointermove.stop="onViewportPointerMove"
                                         @pointerup.stop="onViewportPointerUp"
                                         @pointerleave.stop="onViewportPointerUp">
                                        <!-- 背景色层 -->
                                        <div v-if="editForm.imageCropper.hLogoBg && editForm.imageCropper.hLogoBg !== 'transparent'"
                                             style="position:absolute;inset:0;z-index:1"
                                             :style="{ background: editForm.imageCropper.hLogoBg }"></div>
                                        <!-- 图片层 -->
                                        <div v-if="editForm.imageCropper.sourceImage" style="position:absolute;z-index:2"
                                             :style="{
                                                 transform: 'translate(' + editForm.imageCropper.imgTranslateX + 'px, ' + editForm.imageCropper.imgTranslateY + 'px) scale(' + (editForm.imageCropper.imgScale || 1) + ')',
                                                 transformOrigin: '0 0',
                                                 width: (editForm.imageCropper._dispW || 350) + 'px',
                                                 height: (editForm.imageCropper._dispH || 350) + 'px'
                                             }">
                                            <img :src="editForm.imageCropper.sourceImage"
                                                 :style="{
                                                     width: '100%',
                                                     height: '100%',
                                                     transform: 'rotate(' + editForm.imageCropper.rotation + 'deg)',
                                                     objectFit: 'cover',
                                                     opacity: (editForm.imageCropper.iconOpacity != null ? editForm.imageCropper.iconOpacity : 100) / 100
                                                 }"
                                                 draggable="false"
                                                 @error="$event.target.style.display='none'">
                                        </div>
                                        <!-- 无图片时中央上传 -->
                                        <label v-if="!editForm.imageCropper.sourceImage"
                                               style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:180px;height:180px;display:flex;align-items:center;justify-content:center;z-index:5;cursor:pointer;border-radius:8px"
                                               @pointerdown.stop>
                                            <input type="file" accept="image/*" style="display:none" @change="onCropperFileChange">
                                            <i class="fas fa-plus" style="font-size:120px;color:var(--text-secondary);opacity:.45;pointer-events:none"></i>
                                        </label>
                                        <!-- 裁剪框暗色遮罩 -->
                                        <div v-if="editForm.imageCropper.sourceImage" style="position:absolute;inset:0;z-index:3;pointer-events:none">
                                            <div :style="{ position:'absolute', top:0, left:0, right:0, height:(editForm.imageCropper.vpCrop.y||0)+'px', background:'rgba(0,0,0,.5)' }"></div>
                                            <div :style="{ position:'absolute', top:(editForm.imageCropper.vpCrop.y||0)+'px', left:0, width:(editForm.imageCropper.vpCrop.x||0)+'px', height:(editForm.imageCropper.vpCrop.h||280)+'px', background:'rgba(0,0,0,.5)' }"></div>
                                            <div :style="{ position:'absolute', top:(editForm.imageCropper.vpCrop.y||0)+'px', left:((editForm.imageCropper.vpCrop.x||0)+(editForm.imageCropper.vpCrop.w||280))+'px', right:0, height:(editForm.imageCropper.vpCrop.h||280)+'px', background:'rgba(0,0,0,.5)' }"></div>
                                            <div :style="{ position:'absolute', bottom:0, left:0, right:0, top:((editForm.imageCropper.vpCrop.y||0)+(editForm.imageCropper.vpCrop.h||280))+'px', background:'rgba(0,0,0,.5)' }"></div>
                                        </div>
                                        <!-- 裁剪框 -->
                                        <div v-if="editForm.imageCropper.sourceImage"
                                             style="position:absolute;z-index:4;border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,.3);cursor:move;touch-action:none"
                                             :style="{
                                                 left: (editForm.imageCropper.vpCrop.x||0) + 'px',
                                                 top: (editForm.imageCropper.vpCrop.y||0) + 'px',
                                                 width: (editForm.imageCropper.vpCrop.w||editForm.imageCropper.viewportSize||350) + 'px',
                                                 height: (editForm.imageCropper.vpCrop.h||editForm.imageCropper.viewportSize||350) + 'px',
                                                 borderRadius: editForm.imageCropper.shape === 'circle' ? '50%' : (editForm.imageCropper.shape === 'round' ? Math.round(Math.min(editForm.imageCropper.vpCrop.w||350, editForm.imageCropper.vpCrop.h||350) * 0.16) + 'px' : '0')
                                             }"
                                             @pointerdown.stop="onVpCropPointerDown($event,'move')">
                                            <!-- 四角手柄 -->
                                            <div style="position:absolute;top:-5px;left:-5px;width:10px;height:10px;background:#fff;border:1px solid rgba(0,0,0,.3);border-radius:2px;cursor:nwse-resize;z-index:5" @pointerdown.stop="onVpCropPointerDown($event,'nw')"></div>
                                            <div style="position:absolute;top:-5px;right:-5px;width:10px;height:10px;background:#fff;border:1px solid rgba(0,0,0,.3);border-radius:2px;cursor:nesw-resize;z-index:5" @pointerdown.stop="onVpCropPointerDown($event,'ne')"></div>
                                            <div style="position:absolute;bottom:-5px;left:-5px;width:10px;height:10px;background:#fff;border:1px solid rgba(0,0,0,.3);border-radius:2px;cursor:nesw-resize;z-index:5" @pointerdown.stop="onVpCropPointerDown($event,'sw')"></div>
                                            <div style="position:absolute;bottom:-5px;right:-5px;width:10px;height:10px;background:#fff;border:1px solid rgba(0,0,0,.3);border-radius:2px;cursor:nwse-resize;z-index:5" @pointerdown.stop="onVpCropPointerDown($event,'se')"></div>
                                            <!-- 边缘中点手柄 -->
                                            <div style="position:absolute;top:-4px;left:50%;width:8px;height:8px;background:#fff;border:1px solid rgba(0,0,0,.25);border-radius:2px;cursor:n-resize;z-index:5;transform:translateX(-50%)" @pointerdown.stop="onVpCropPointerDown($event,'n')"></div>
                                            <div style="position:absolute;bottom:-4px;left:50%;width:8px;height:8px;background:#fff;border:1px solid rgba(0,0,0,.25);border-radius:2px;cursor:s-resize;z-index:5;transform:translateX(-50%)" @pointerdown.stop="onVpCropPointerDown($event,'s')"></div>
                                            <div style="position:absolute;left:-4px;top:50%;width:8px;height:8px;background:#fff;border:1px solid rgba(0,0,0,.25);border-radius:2px;cursor:w-resize;z-index:5;transform:translateY(-50%)" @pointerdown.stop="onVpCropPointerDown($event,'w')"></div>
                                            <div style="position:absolute;right:-4px;top:50%;width:8px;height:8px;background:#fff;border:1px solid rgba(0,0,0,.25);border-radius:2px;cursor:e-resize;z-index:5;transform:translateY(-50%)" @pointerdown.stop="onVpCropPointerDown($event,'e')"></div>
                                        </div>
                                    </div>
                                    <!-- 预览图下方操作按钮 -->
                                    <div class="icon-editor-preview-actions">
                                        <label class="btn btn-sm ie-upload-btn">
                                            <i class="fas fa-cloud-upload-alt"></i> 选择图片
                                            <input type="file" accept="image/*" style="display:none" @change="onCropperFileChange">
                                        </label>
                                        <button type="button" class="btn btn-sm btn-danger" :disabled="!editForm.imageCropper.sourceImage" @click="removeSidebarBgImage">
                                            <i class="fas fa-trash-alt"></i> 删除图片
                                        </button>
                                    </div>
                                </div>
                                <!-- 右侧控制栏 -->
                                <div class="icon-editor-controls">
                                    <div class="ie-control-row">
                                        <span class="ie-label">形状</span>
                                        <button class="btn btn-sm" :class="{ 'btn-primary': editForm.imageCropper.shape === 'square' }" @click="editForm.imageCropper.shape = 'square'">方形</button>
                                        <button class="btn btn-sm" :class="{ 'btn-primary': editForm.imageCropper.shape === 'round' }" @click="editForm.imageCropper.shape = 'round'">圆角</button>
                                        <button class="btn btn-sm" :class="{ 'btn-primary': editForm.imageCropper.shape === 'circle' }" @click="editForm.imageCropper.shape = 'circle'">圆形</button>
                                    </div>
                                    <div class="ie-control-row">
                                        <span class="ie-label">缩放：</span>
                                        <button class="btn btn-xs ie-step-btn" @click="editForm.imageCropper.imgScale = Math.max(0.1, (editForm.imageCropper.imgScale||1) - 0.05); updateCropPreview()" :disabled="(editForm.imageCropper.imgScale||1)<=0.1">−</button>
                                        <input type="number" class="form-input ie-num-input" :value="Math.round((editForm.imageCropper.imgScale||1)*100)" min="10" max="500" step="1" @change="const v = Math.max(10, Math.min(500, Number($event.target.value) || 100)); editForm.imageCropper.imgScale = v/100; updateCropPreview()">
                                        <span class="ie-unit">%</span>
                                        <button class="btn btn-xs ie-step-btn" @click="editForm.imageCropper.imgScale = Math.min(5, (editForm.imageCropper.imgScale||1) + 0.05); updateCropPreview()">+</button>
                                        <button class="btn btn-xs" v-if="editForm.imageCropper.imgScale!==1" @click="circleZoomReset">重置</button>
                                    </div>
                                    <div class="ie-control-row">
                                        <span class="ie-label">旋转：</span>
                                        <input type="number" class="form-input ie-num-input" :value="editForm.imageCropper.rotation > 180 ? editForm.imageCropper.rotation - 360 : editForm.imageCropper.rotation" min="-180" max="180" step="1" @change="let r = (Number($event.target.value) || 0) % 360; if (r < 0) r += 360; editForm.imageCropper.rotation = r; updateCropPreview()">
                                        <span class="ie-unit">°</span>
                                        <input type="range" min="-180" max="180" class="ie-range-slider" :value="editForm.imageCropper.rotation > 180 ? editForm.imageCropper.rotation - 360 : editForm.imageCropper.rotation" @input="let r = Number($event.target.value); if (r < 0) r += 360; editForm.imageCropper.rotation = r; updateCropPreview()" @wheel.prevent="onImageCropperRotationWheel">
                                        <button class="btn btn-sm" @click="editForm.imageCropper.rotation = (editForm.imageCropper.rotation + 90) % 360; updateCropPreview()"><i class="fas fa-redo-alt"></i> 顺时针</button>
                                    </div>
                                    <div class="ie-control-row">
                                        <span class="ie-label">不透明度：</span>
                                        <input type="number" class="form-input ie-num-input" :value="editForm.imageCropper.iconOpacity != null ? editForm.imageCropper.iconOpacity : 100" min="0" max="100" step="1" @change="let o = Math.max(0, Math.min(100, Number($event.target.value) || 0)); editForm.imageCropper.iconOpacity = o; updateCropPreview()">
                                        <span class="ie-unit">%</span>
                                        <input type="range" min="0" max="100" class="ie-range-slider" :value="editForm.imageCropper.iconOpacity != null ? editForm.imageCropper.iconOpacity : 100" @input="editForm.imageCropper.iconOpacity = Number($event.target.value); updateCropPreview()" @wheel.prevent="onImageCropperOpacityWheel">
                                    </div>
                                    <div class="ie-control-row ie-colors-row">
                                        <span class="ie-label">背景：</span>
                                        <button class="color-swatch" :class="{ active: editForm.imageCropper.hLogoBg === 'transparent' }" @click="editForm.imageCropper.hLogoBg = 'transparent'" title="透明" style="background:repeating-linear-gradient(45deg,#ccc 0,#ccc 2px,#fff 2px,#fff 4px)"></button>
                                        <button class="color-swatch" :class="{ active: editForm.imageCropper.hLogoBg === '#ff4d4f' }" @click="editForm.imageCropper.hLogoBg = '#ff4d4f'" title="红色" style="background:#ff4d4f"></button>
                                        <button class="color-swatch" :class="{ active: editForm.imageCropper.hLogoBg === '#fa8c16' }" @click="editForm.imageCropper.hLogoBg = '#fa8c16'" title="橙色" style="background:#fa8c16"></button>
                                        <button class="color-swatch" :class="{ active: editForm.imageCropper.hLogoBg === '#fadb14' }" @click="editForm.imageCropper.hLogoBg = '#fadb14'" title="黄色" style="background:#fadb14"></button>
                                        <button class="color-swatch" :class="{ active: editForm.imageCropper.hLogoBg === '#a0d911' }" @click="editForm.imageCropper.hLogoBg = '#a0d911'" title="浅绿色" style="background:#a0d911"></button>
                                        <button class="color-swatch" :class="{ active: editForm.imageCropper.hLogoBg === '#36cfc9' }" @click="editForm.imageCropper.hLogoBg = '#36cfc9'" title="青色" style="background:#36cfc9"></button>
                                        <button class="color-swatch" :class="{ active: editForm.imageCropper.hLogoBg === '#597ef7' }" @click="editForm.imageCropper.hLogoBg = '#597ef7'" title="蓝色" style="background:#597ef7"></button>
                                        <button class="color-swatch" :class="{ active: editForm.imageCropper.hLogoBg === '#b37feb' }" @click="editForm.imageCropper.hLogoBg = '#b37feb'" title="紫色" style="background:#b37feb"></button>
                                        <button class="color-swatch ie-custom-color-btn" :class="{ active: editForm.imageCropper.hLogoBg && editForm.imageCropper.hLogoBg.startsWith('#') }" title="自定义颜色（含不透明度）" @click="openColorPicker({ value: editForm.imageCropper.hLogoBg, onChange: (val) => { editForm.imageCropper.hLogoBg = val; updateCropPreview(); }, onConfirm: (val) => { editForm.imageCropper.hLogoBg = val; editForm.imageCropper.hLogoCustomBg = val; updateCropPreview(); } })" style="background:conic-gradient(red,yellow,lime,aqua,blue,magenta,red);border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.15);cursor:pointer"></button>
                                    </div>
                                    <div class="ie-control-row">
                                        <span class="ie-label">格式：</span>
                                        <select class="form-input ie-output-input" style="width:92px;height:28px;padding:0 4px"
                                                :value="editForm.imageCropper.outputFormat || 'auto'"
                                                @change="editForm.imageCropper.outputFormat = $event.target.value">
                                            <option value="auto">自动</option>
                                            <option value="avif">AVIF</option>
                                            <option value="webp">WebP</option>
                                            <option value="png">PNG</option>
                                            <option value="jpeg">JPEG</option>
                                        </select>
                                        <span class="ie-unit">质量</span>
                                        <input type="number" class="form-input ie-output-input" style="width:56px"
                                               :value="editForm.imageCropper.outputQuality != null ? editForm.imageCropper.outputQuality : 85"
                                               min="1" max="100" step="1"
                                               @change="editForm.imageCropper.outputQuality = Math.max(1, Math.min(100, Number($event.target.value) || 85))">
                                        <span class="ie-unit">%</span>
                                    </div>
                                    <div class="ie-control-row ie-output-row">
                                        <span class="ie-label">输出：</span>
                                        <input type="number" v-model.number="editForm.imageCropper.outputSizeW"
                                               :min="editForm.imageCropper.target === 'sidebarBackgroundCollapsed' ? 40 : 120"
                                               :max="editForm.imageCropper.target === 'sidebarBackgroundCollapsed' ? 120 : 400"
                                               class="form-input ie-output-input" @change="onSidebarBgWidthInput"> px
                                        <span style="color:var(--text-muted)">×</span>
                                        <input type="number" v-model.number="editForm.imageCropper.outputSizeH" min="16" max="800" disabled
                                               class="form-input ie-output-input" style="background:#f5f5f5;cursor:not-allowed"> px
                                        <span class="ie-hint">拖拽图片移动 · 拖拽裁剪框选区域 · 滚轮缩放</span>
                                    </div>
                                </div>
                            </div>
                        </template>
                        <!-- 其他 siteStyleMode：沿用原左右分栏布局 -->
                        <template v-else>
                            <div class="icon-cropper-left">
                            <!-- 视口 + 删除按钮横向包裹层：保持下方提示文字/按钮仍在纵列下方 -->
                            <div class="icp-viewport-wrap">
                                <!-- 广告位专用：裁剪框外左侧纵向删除图片按钮 -->
                                <div v-if="editForm.imageCropper.target === 'adSlot' && editForm.imageCropper.sourceImage"
                                     class="icp-delete-btn-outside"
                                     title="删除此张图片"
                                     @click.stop="removeAdSlotImage()">
                                    <span>删除</span>
                                    <span>图片</span>
                                    <i class="fas fa-trash-alt"></i>
                                </div>
                                <!-- 左侧背景（展开/收起）：裁剪框外左侧纵向删除图片按钮 -->
                                <div v-else-if="(editForm.imageCropper.target === 'sidebarBackground' || editForm.imageCropper.target === 'sidebarBackgroundCollapsed') && editForm.imageCropper.sourceImage"
                                     class="icp-delete-btn-outside"
                                     title="删除此张背景图片"
                                     @click.stop="removeSidebarBgImage()">
                                    <span>删</span>
                                    <span>除</span>
                                    <span>图</span>
                                    <span>片</span>
                                    <i class="fas fa-trash-alt"></i>
                                </div>
                                <!-- 固定正方形视口（支持抓手拖动图片 + 裁剪框选区） -->
                                <div class="circle-cropper-viewport"
                                 :class="{ 'circle-cropper-viewport-round': editForm.imageCropper.shape === 'circle', 'circle-cropper-viewport-square': editForm.imageCropper.shape === 'square', 'icp-viewport-dragging': editForm.imageCropper.circleDragState && editForm.imageCropper.circleDragState.active }"
                                 :style="{ width: editForm.imageCropper.viewportSize + 'px', height: editForm.imageCropper.viewportSize + 'px', background: editForm.imageCropper.target === 'adSlot' ? (currentAdSlotBackgroundCss || '') : '' }"
                                 @wheel.prevent="onCircleWheel"
                                 @pointerdown="onCirclePointerDown"
                                 @pointermove.stop="onViewportPointerMove"
                                 @pointerup.stop="onViewportPointerUp"
                                 @pointerleave.stop="onViewportPointerUp">
                                <!-- 左侧背景：预览背景层（仅 sidebarBackground，z-index 0 在最底） -->
                                <div v-if="editForm.imageCropper.target === 'sidebarBackground' || editForm.imageCropper.target === 'sidebarBackgroundCollapsed'" class="circle-cropper-bg" :style="getHLogoBgStyle()"></div>
                                <!-- 图片素材层 -->
                                <div v-if="editForm.imageCropper.sourceImage" class="circle-cropper-image-wrap"
                                     :style="{
                                         transform: 'translate(' + editForm.imageCropper.imgTranslateX + 'px, ' + editForm.imageCropper.imgTranslateY + 'px) scale(' + (editForm.imageCropper.imgScale || 1) + ')',
                                         transformOrigin: '0 0',
                                         width: (editForm.imageCropper._dispW || 280) + 'px',
                                         height: (editForm.imageCropper._dispH || 280) + 'px'
                                     }">
                                    <img :src="editForm.imageCropper.sourceImage"
                                         :style="{
                                             width: (editForm.imageCropper._dispW || 280) + 'px',
                                             height: (editForm.imageCropper._dispH || 280) + 'px',
                                             transform: 'rotate(' + editForm.imageCropper.rotation + 'deg)',
                                             objectFit: 'cover'
                                         }"
                                         draggable="false"
                                         @error="$event.target.style.display='none'">
                                </div>
                                <div v-else-if="editForm.imageCropper.target === 'site' && editForm.site.logo" class="circle-cropper-image-wrap"
                                     :style="{
                                         transform: 'translate(' + editForm.imageCropper.imgTranslateX + 'px, ' + editForm.imageCropper.imgTranslateY + 'px) scale(' + (editForm.imageCropper.imgScale || 1) + ')',
                                         transformOrigin: '0 0',
                                         width: (editForm.imageCropper._dispW || 280) + 'px',
                                         height: (editForm.imageCropper._dispH || 280) + 'px'
                                     }">
                                    <img :src="(isDataUrl(editForm.site.logo) || isHttpUrl(editForm.site.logo)) ? editForm.site.logo : '../' + editForm.site.logo"
                                         :style="{
                                             width: '100%',
                                             height: '100%',
                                             transform: 'rotate(' + editForm.imageCropper.rotation + 'deg)',
                                             objectFit: 'cover'
                                         }"
                                         draggable="false"
                                         @error="$event.target.style.display='none'">
                                </div>
                                <i v-else class="fas fa-image" style="font-size:48px;color:#bbb;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:1"></i>
                                <!-- 无图片时的上传覆盖层（pointerdown.stop 拦截父级 setPointerCapture） -->
                                <div v-if="!editForm.imageCropper.sourceImage && editForm.imageCropper.target === 'adSlot'"
                                     style="position:absolute;inset:0;z-index:10;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:inherit"
                                     title="点击选择图片"
                                     @pointerdown.stop @click.stop.prevent="triggerCropperUpload()">
                                    <div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:20px;border:2px dashed rgba(89,126,247,.5);border-radius:12px;background:rgba(255,255,255,.7);transition:background .2s"
                                         @mouseenter="$event.currentTarget.style.background='rgba(89,126,247,.08)'"
                                         @mouseleave="$event.currentTarget.style.background='rgba(255,255,255,.7)'">
                                        <i class="fas fa-cloud-upload-alt" style="font-size:36px;color:#597ef7"></i>
                                        <span style="font-size:13px;color:#597ef7;font-weight:500">点击选择图片</span>
                                        <span style="font-size:11px;color:#999">支持 PNG / JPG / WebP / GIF</span>
                                    </div>
                                </div>
                                <!-- 无图片时非广告位也显示上传提示（不再回退站点 logo，避免背景/壁纸误显站点图标） -->
                                <div v-else-if="!editForm.imageCropper.sourceImage && editForm.imageCropper.target !== 'adSlot'"
                                     style="position:absolute;inset:0;z-index:10;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:inherit"
                                     title="点击选择图片"
                                     @pointerdown.stop @click.stop.prevent="triggerCropperUpload()">
                                    <div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:20px;border:2px dashed rgba(89,126,247,.5);border-radius:12px;background:rgba(255,255,255,.7)">
                                        <i class="fas fa-cloud-upload-alt" style="font-size:36px;color:#597ef7"></i>
                                        <span style="font-size:13px;color:#597ef7;font-weight:500">点击选择图片</span>
                                    </div>
                                </div>
                                <!-- 中心十字参考线 -->
                                <div class="circle-cropper-crosshair-h"></div>
                                <div class="circle-cropper-crosshair-v"></div>
                                <!-- 抓手拖拽提示层（方形模式 + 有图片 + 未拖拽时显示；z-index 2 在图片(1)之上、暗遮罩(3)之下） -->
                                <div v-if="editForm.imageCropper.shape === 'square' && editForm.imageCropper.sourceImage && !(editForm.imageCropper.circleDragState && editForm.imageCropper.circleDragState.active)"
                                     class="icp-drag-hint">
                                    <i class="fas fa-hand-paper"></i>
                                    <span>拖动画布</span>
                                </div>
                                <!-- ========== 方形/圆角模式：可拖拽裁剪框（adSlot 使用）========== -->
                                <template v-if="(editForm.imageCropper.shape === 'square' || editForm.imageCropper.shape === 'round') && editForm.imageCropper.sourceImage">
                                    <!-- 暗色遮罩：四块拼出，裁剪框区域透明 -->
                                <div v-if="editForm.imageCropper.target === 'adSlot' || editForm.imageCropper.target === 'wallpaper' || editForm.imageCropper.target === 'sidebarBackground' || editForm.imageCropper.target === 'sidebarBackgroundCollapsed'"
                                     style="position:absolute;inset:0;z-index:3;pointer-events:none">
                                        <div :style="{position:'absolute',top:0,left:0,right:0,height:(editForm.imageCropper.vpCrop.y||0)+'px',background:'rgba(0,0,0,.5)'}"></div>
                                        <div :style="{position:'absolute',top:(editForm.imageCropper.vpCrop.y||0)+'px',left:0,width:(editForm.imageCropper.vpCrop.x||0)+'px',height:(editForm.imageCropper.vpCrop.h||280)+'px',background:'rgba(0,0,0,.5)'}"></div>
                                        <div :style="{position:'absolute',top:(editForm.imageCropper.vpCrop.y||0)+'px',left:((editForm.imageCropper.vpCrop.x||0)+(editForm.imageCropper.vpCrop.w||280))+'px',right:0,height:(editForm.imageCropper.vpCrop.h||280)+'px',background:'rgba(0,0,0,.5)'}"></div>
                                        <div :style="{position:'absolute',bottom:0,left:0,right:0,top:((editForm.imageCropper.vpCrop.y||0)+(editForm.imageCropper.vpCrop.h||280))+'px',background:'rgba(0,0,0,.5)'}"></div>
                                    </div>
                                    <!-- 可拖拽裁剪框：白边 + 四角/边缘手柄 -->
                                    <div v-if="editForm.imageCropper.target === 'adSlot' || editForm.imageCropper.target === 'wallpaper' || editForm.imageCropper.target === 'sidebarBackground' || editForm.imageCropper.target === 'sidebarBackgroundCollapsed'"
                                         style="position:absolute;z-index:4;border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,.3);cursor:move;touch-action:none"
                                         :style="{
                                             left: (editForm.imageCropper.vpCrop.x||0) + 'px',
                                             top: (editForm.imageCropper.vpCrop.y||0) + 'px',
                                             width: (editForm.imageCropper.vpCrop.w||editForm.imageCropper.viewportSize||280) + 'px',
                                             height: (editForm.imageCropper.vpCrop.h||editForm.imageCropper.viewportSize||280) + 'px',
                                             borderRadius: editForm.imageCropper.shape === 'round' ? Math.round(Math.min(editForm.imageCropper.vpCrop.w||280, editForm.imageCropper.vpCrop.h||280) * 0.16) + 'px' : '0'
                                         }"
                                         @pointerdown.stop="onVpCropPointerDown($event,'move')">
                                        <!-- 四角手柄 -->
                                        <div style="position:absolute;top:-5px;left:-5px;width:10px;height:10px;background:#fff;border:1px solid rgba(0,0,0,.3);border-radius:2px;cursor:nwse-resize;z-index:5"
                                             @pointerdown.stop="onVpCropPointerDown($event,'nw')"></div>
                                        <div style="position:absolute;top:-5px;right:-5px;width:10px;height:10px;background:#fff;border:1px solid rgba(0,0,0,.3);border-radius:2px;cursor:nesw-resize;z-index:5"
                                             @pointerdown.stop="onVpCropPointerDown($event,'ne')"></div>
                                        <div style="position:absolute;bottom:-5px;left:-5px;width:10px;height:10px;background:#fff;border:1px solid rgba(0,0,0,.3);border-radius:2px;cursor:nesw-resize;z-index:5"
                                             @pointerdown.stop="onVpCropPointerDown($event,'sw')"></div>
                                        <div style="position:absolute;bottom:-5px;right:-5px;width:10px;height:10px;background:#fff;border:1px solid rgba(0,0,0,.3);border-radius:2px;cursor:nwse-resize;z-index:5"
                                             @pointerdown.stop="onVpCropPointerDown($event,'se')"></div>
                                        <!-- 边缘中点手柄 -->
                                        <div style="position:absolute;top:-4px;left:50%;width:8px;height:8px;background:#fff;border:1px solid rgba(0,0,0,.25);border-radius:2px;cursor:n-resize;z-index:5;transform:translateX(-50%)"
                                             @pointerdown.stop="onVpCropPointerDown($event,'n')"></div>
                                        <div style="position:absolute;bottom:-4px;left:50%;width:8px;height:8px;background:#fff;border:1px solid rgba(0,0,0,.25);border-radius:2px;cursor:s-resize;z-index:5;transform:translateX(-50%)"
                                             @pointerdown.stop="onVpCropPointerDown($event,'s')"></div>
                                        <div style="position:absolute;left:-4px;top:50%;width:8px;height:8px;background:#fff;border:1px solid rgba(0,0,0,.25);border-radius:2px;cursor:w-resize;z-index:5;transform:translateY(-50%)"
                                             @pointerdown.stop="onVpCropPointerDown($event,'w')"></div>
                                        <div style="position:absolute;right:-4px;top:50%;width:8px;height:8px;background:#fff;border:1px solid rgba(0,0,0,.25);border-radius:2px;cursor:e-resize;z-index:5;transform:translateY(-50%)"
                                             @pointerdown.stop="onVpCropPointerDown($event,'e')"></div>
                                    </div>
                                    <!-- 非 adSlot 方形/圆角模式：固定全视口框（站点Logo编辑） -->
                                    <div v-else class="circle-cropper-square-frame"
                                         :style="{ borderRadius: editForm.imageCropper.shape === 'round' ? Math.round((editForm.imageCropper.viewportSize || 280) * 0.16) + 'px' : '4px' }">
                                        <span class="ccf-corner ccf-tl"></span>
                                        <span class="ccf-corner ccf-tr"></span>
                                        <span class="ccf-corner ccf-bl"></span>
                                        <span class="ccf-corner ccf-br"></span>
                                    </div>
                                </template>
                                <div v-else-if="editForm.imageCropper.shape === 'square' || editForm.imageCropper.shape === 'round'" class="circle-cropper-square-frame"
                                     :style="{ borderRadius: editForm.imageCropper.shape === 'round' ? Math.round((editForm.imageCropper.viewportSize || 280) * 0.16) + 'px' : '4px' }">
                                    <span class="ccf-corner ccf-tl"></span>
                                    <span class="ccf-corner ccf-tr"></span>
                                    <span class="ccf-corner ccf-bl"></span>
                                    <span class="ccf-corner ccf-br"></span>
                                </div>
                                <!-- 遮罩：圆形/方形半透明遮罩 -->
                                <div v-if="editForm.imageCropper.shape === 'circle'" class="circle-cropper-overlay"></div>
                                <!-- 遮罩：圆角矩形（非 adSlot，全视口裁剪框按比例圆角） -->
                                <div v-if="editForm.imageCropper.shape === 'round' && editForm.imageCropper.target !== 'adSlot'"
                                     class="circle-cropper-round-overlay"
                                     :style="{ borderRadius: Math.round((editForm.imageCropper.viewportSize || 280) * 0.16) + 'px' }"></div>
                                <!-- 加载中提示 -->
                                <div v-if="!editForm.imageCropper.sourceImage && editForm.imageCropper.urlValue" class="circle-cropper-loading">加载中...</div>
                            </div>
                            </div>
                            <!-- 提示文字 -->
                            <div style="font-size:11px;color:var(--text-muted);margin-top:6px;text-align:center;line-height:1.6">
                                <span v-if="editForm.imageCropper.shape === 'square' && editForm.imageCropper.target === 'adSlot'">
                                    <i class="fas fa-hand-paper" style="margin-right:2px;opacity:.6"></i>拖动空白区移动图片
                                    &nbsp;·&nbsp;
                                    <i class="fas fa-arrows-alt" style="margin-right:2px;opacity:.6"></i>拖拽白框选区域
                                    &nbsp;·&nbsp;
                                    <i class="fas fa-expand-arrows-alt" style="margin-right:2px;opacity:.6"></i>拉手柄调大小
                                </span>
                                <span v-else><i class="fas fa-hand-paper" style="margin-right:2px;opacity:.6"></i>拖拽图片移动位置&nbsp;·&nbsp;<i class="fas fa-arrows-alt" style="margin-right:2px;opacity:.6"></i>拖动白框移动选区&nbsp;·&nbsp;滚轮缩放</span>
                            </div>
                            <!-- 适应 + 形状：广告位专用，放到左侧更换图片下方 -->
                            <div class="icp-section icp-section-row" v-if="editForm.imageCropper.target === 'adSlot' && editForm.imageCropper.adSide != null && editForm.imageCropper.adIdx != null"
                                 style="width:100%;margin-top:8px">
                                <div class="icp-half">
                                    <label class="icp-label">适应</label>
                                    <div class="icp-size-presets">
                                        <button class="icp-chip" :class="{ active: adSlotFit === 'contain' }" @click="setAdSlotFit('contain')">完整</button>
                                        <button class="icp-chip" :class="{ active: adSlotFit === 'cover' }" @click="setAdSlotFit('cover')">填充</button>
                                    </div>
                                </div>
                                <div class="icp-half">
                                    <label class="icp-label">形状</label>
                                    <div class="icp-size-presets">
                                        <button class="icp-chip" :class="{ active: editForm.imageCropper.shape === 'square' }"
                                                @click="setCropperShape('square')">方形</button>
                                        <button class="icp-chip" :class="{ active: editForm.imageCropper.shape === 'round' }"
                                                @click="setCropperShape('round')">圆角</button>
                                    </div>
                                </div>
                            </div>

                            <!-- 图片闪烁：广告位专用，放到适应/形状下方 -->
                            <div class="icp-section" v-if="editForm.imageCropper.target === 'adSlot' && editForm.imageCropper.adSide != null && editForm.imageCropper.adIdx != null"
                                 style="width:100%;margin-top:8px">
                                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;user-select:none;margin:0 0 8px 0">
                                    <input type="checkbox" v-model="currentAdSlotBlink.enabled" style="margin:0"> ✨图片闪烁
                                </label>
                                <div v-if="currentAdSlotBlink && currentAdSlotBlink.enabled" style="display:flex;flex-direction:column;gap:8px">
                                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                                        <span style="font-size:11px;color:var(--text-muted)">预设</span>
                                        <button type="button" class="btn btn-sm" @click="applyCurrentAdBlinkPreset('crazy')" :style="{background:currentAdSlotBlink.preset==='crazy'?'#fff0f0':'#f8f9fa',borderColor:currentAdSlotBlink.preset==='crazy'?'#e53e3e':'#ddd',color:currentAdSlotBlink.preset==='crazy'?'#e53e3e':'#555',fontSize:'11px',padding:'3px 8px',borderRadius:'4px',cursor:'pointer',border:'1px solid'}">🔥</button>
                                        <button type="button" class="btn btn-sm" @click="applyCurrentAdBlinkPreset('soft')" :style="{background:currentAdSlotBlink.preset==='soft'?'#f0f9ff':'#f8f9fa',borderColor:currentAdSlotBlink.preset==='soft'?'#3182ce':'#ddd',color:currentAdSlotBlink.preset==='soft'?'#3182ce':'#555',fontSize:'11px',padding:'3px 8px',borderRadius:'4px',cursor:'pointer',border:'1px solid'}">✨</button>
                                        <button type="button" class="btn btn-sm" @click="applyCurrentAdBlinkPreset('normal')" :style="{background:currentAdSlotBlink.preset==='normal'?'#f0fff4':'#f8f9fa',borderColor:currentAdSlotBlink.preset==='normal'?'#38a169':'#ddd',color:currentAdSlotBlink.preset==='normal'?'#38a169':'#555',fontSize:'11px',padding:'3px 8px',borderRadius:'4px',cursor:'pointer',border:'1px solid'}">💡</button>
                                        <span style="font-size:11px;color:var(--text-muted);margin-left:4px">模式</span>
                                        <button class="icp-chip" :class="{ active: currentAdSlotBlink.mode === 'count' }" @click="currentAdSlotBlink.mode = 'count'" style="font-size:11px">N次</button>
                                        <button class="icp-chip" :class="{ active: currentAdSlotBlink.mode === 'continuous' }" @click="currentAdSlotBlink.mode = 'continuous'" style="font-size:11px">持续</button>
                                    </div>
                                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                                        <span v-if="currentAdSlotBlink.mode !== 'continuous'" style="font-size:11px;color:var(--text-muted)">次数</span>
                                        <input v-if="currentAdSlotBlink.mode !== 'continuous'" class="form-input" type="number" min="1" v-model.number="currentAdSlotBlink.count" style="width:50px;padding:4px;font-size:12px">
                                        <span style="font-size:11px;color:var(--text-muted)">亮起</span>
                                        <input class="form-input" type="number" min="50" v-model.number="currentAdSlotBlink.duration" style="width:60px;padding:4px;font-size:12px"><span style="font-size:11px;color:var(--text-muted)">ms</span>
                                        <span style="font-size:11px;color:var(--text-muted)">间隔</span>
                                        <input class="form-input" type="number" min="0" v-model.number="currentAdSlotBlink.interval" style="width:60px;padding:4px;font-size:12px"><span style="font-size:11px;color:var(--text-muted)">ms</span>
                                    </div>
                                </div>
                            </div>

                            <!-- 跳转链接：广告位专用，放到图片闪烁下方 -->
                            <div class="icp-section" v-if="editForm.imageCropper.target === 'adSlot' && editForm.imageCropper.adSide != null && editForm.imageCropper.adIdx != null"
                                 style="width:100%;margin-top:8px">
                                <label class="icp-label">跳转链接</label>
                                <input class="form-input" v-model="currentAdSlot.url" placeholder="点击图片跳转的链接（可选）" style="width:100%;font-size:12px;padding:6px 8px">
                            </div>

                            <!-- 左侧背景专用：输出尺寸 / 缩放 / 旋转 / 背景 / 操作按钮 -->
                            <div v-if="editForm.imageCropper.target === 'sidebarBackground' || editForm.imageCropper.target === 'sidebarBackgroundCollapsed'" class="sidebar-bg-controls">
                                <!-- 输出尺寸（宽 × 高）--保留 -->
                                <div class="icp-section">
                                    <label class="icp-label">输出尺寸（宽 × 高）</label>
                                    <div class="icp-hint" style="color:var(--text-muted);font-size:11px;margin-bottom:6px">
                                        可选范围：{{ editForm.imageCropper.target === 'sidebarBackgroundCollapsed' ? '40 ~ 120' : '120 ~ 400' }} px
                                    </div>
                                    <div class="icp-custom-size" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                                        <input type="number" v-model.number="editForm.imageCropper.outputSizeW"
                                               :min="editForm.imageCropper.target === 'sidebarBackgroundCollapsed' ? 40 : 120"
                                               :max="editForm.imageCropper.target === 'sidebarBackgroundCollapsed' ? 120 : 400"
                                               :class="['form-input', { 'input-error': (editForm.imageCropper.outputSizeW || 0) < (editForm.imageCropper.target === 'sidebarBackgroundCollapsed' ? 40 : 120) || (editForm.imageCropper.outputSizeW || 0) > (editForm.imageCropper.target === 'sidebarBackgroundCollapsed' ? 120 : 400) }]"
                                               style="width:72px;text-align:center" @wheel.prevent @change="onSidebarBgWidthInput()"> px
                                        <span style="color:var(--text-muted)">×</span>
                                        <input type="number" v-model.number="editForm.imageCropper.outputSizeH" min="16" max="800" disabled
                                               class="form-input" style="width:72px;text-align:center;background:#f5f5f5;cursor:not-allowed"> px
                                        <button type="button" class="btn btn-sm" @click="restoreDefaultSidebarBgSize" style="font-size:12px;padding:4px 8px">恢复默认</button>
                                    </div>
                                </div>
                                <!-- 缩放（图3样式：- / 输入 / + / 重置） -->
                                <div class="icp-section">
                                    <label class="icp-label">缩放</label>
                                    <div class="sb-zoom-bar">
                                        <button type="button" class="sb-step-btn" @click="editForm.imageCropper.imgScale = Math.max(0.1, (editForm.imageCropper.imgScale||1) - 0.05); updateCropPreview()" :disabled="(editForm.imageCropper.imgScale||1)<=0.1" title="缩小 5%">−</button>
                                        <input type="number" class="sb-num-input" :value="Math.round((editForm.imageCropper.imgScale||1)*100)" min="10" max="500" step="1"
                                               @change="const v = Math.max(10, Math.min(500, Number($event.target.value) || 100)); editForm.imageCropper.imgScale = v/100; updateCropPreview()">
                                        <span class="sb-unit">%</span>
                                        <button type="button" class="sb-step-btn" @click="editForm.imageCropper.imgScale = Math.min(5, (editForm.imageCropper.imgScale||1) + 0.05); updateCropPreview()" title="放大 5%">+</button>
                                        <button type="button" class="sb-step-btn sb-icon-btn" @click="circleZoomReset" title="重置缩放"><i class="fas fa-expand"></i></button>
                                    </div>
                                </div>
                                <!-- 旋转（图3样式：输入 / 滑块 / 重置） -->
                                <div class="icp-section">
                                    <label class="icp-label">旋转</label>
                                    <div class="sb-rotate-bar">
                                        <input type="number" class="sb-num-input" :value="editForm.imageCropper.rotation"
                                               style="width:56px"
                                               @change="let r = (Number($event.target.value) || 0) % 360; if (r > 180) r -= 360; if (r < -180) r += 360; editForm.imageCropper.rotation = r; updateCropPreview()">
                                        <input type="range" min="-180" max="180" v-model.number="editForm.imageCropper.rotation"
                                               class="icp-range-slider" style="flex:1;min-width:80px" @input="updateCropPreview()">
                                        <button type="button" class="sb-step-btn sb-icon-btn" @click="editForm.imageCropper.rotation = 0" title="重置旋转"><i class="fas fa-redo"></i></button>
                                    </div>
                                </div>
                                <!-- 背景（默认常驻显示） -->
                                <div class="icp-section">
                                    <label class="icp-label">背景</label>
                                    <div class="hlogo-bg-row" style="margin-top:8px">
                                        <button class="hlogo-bg-swatch" type="button" :class="{active: editForm.imageCropper.hLogoBg==='transparent'}" @click="editForm.imageCropper.hLogoBg='transparent'" title="透明" style="background:repeating-conic-gradient(#e5e5e5 0% 25%, #fff 0% 50%) 0 0 / 14px 14px"></button>
                                        <button class="hlogo-bg-swatch" type="button" :class="{active: editForm.imageCropper.hLogoBg==='#ff5252'}" @click="editForm.imageCropper.hLogoBg='#ff5252'" style="background:#ff5252"></button>
                                        <button class="hlogo-bg-swatch" type="button" :class="{active: editForm.imageCropper.hLogoBg==='#ffab40'}" @click="editForm.imageCropper.hLogoBg='#ffab40'" style="background:#ffab40"></button>
                                        <button class="hlogo-bg-swatch" type="button" :class="{active: editForm.imageCropper.hLogoBg==='#ffd740'}" @click="editForm.imageCropper.hLogoBg='#ffd740'" style="background:#ffd740"></button>
                                        <button class="hlogo-bg-swatch" type="button" :class="{active: editForm.imageCropper.hLogoBg==='#69f0ae'}" @click="editForm.imageCropper.hLogoBg='#69f0ae'" style="background:#69f0ae"></button>
                                        <button class="hlogo-bg-swatch" type="button" :class="{active: editForm.imageCropper.hLogoBg==='#40c4ff'}" @click="editForm.imageCropper.hLogoBg='#40c4ff'" style="background:#40c4ff"></button>
                                        <button class="hlogo-bg-swatch" type="button" :class="{active: editForm.imageCropper.hLogoBg==='#448aff'}" @click="editForm.imageCropper.hLogoBg='#448aff'" style="background:#448aff"></button>
                                        <button class="hlogo-bg-swatch" type="button" :class="{active: editForm.imageCropper.hLogoBg==='#7c4dff'}" @click="editForm.imageCropper.hLogoBg='#7c4dff'" style="background:#7c4dff"></button>
                                        <button class="hlogo-bg-swatch hlogo-bg-custom" type="button" title="自定义颜色"
                                                :class="{active: editForm.imageCropper.hLogoBg && editForm.imageCropper.hLogoBg.startsWith('#')}"
                                                :style="{ background: editForm.imageCropper.hLogoCustomBg || '#4f46e5' }"
                                                @click="openColorPicker()"></button>
                                    </div>
                                </div>
                                <!-- 操作按钮：更换图片 / 删除图片 -->
                                <div class="icp-section sb-img-actions">
                                    <button type="button" class="btn sb-change-img-btn" @click="triggerCropperUpload()">
                                        <i class="far fa-image"></i> 更换图片
                                    </button>
                                    <button type="button" class="btn sb-delete-img-btn" @click="removeSidebarBgImage()">
                                        <i class="far fa-trash-alt"></i> 删除图片
                                    </button>
                                </div>
                                <!-- 取消 / 应用 -->
                                <div class="icp-section sidebar-bg-actions" v-if="editForm.imageCropper.target === 'sidebarBackground' || editForm.imageCropper.target === 'sidebarBackgroundCollapsed'">
                                    <button class="btn" @click="closeLogoCropper">取消</button>
                                    <button class="btn btn-primary"
                                            :disabled="editForm.imageCropper.mode === 'upload' && !editForm.imageCropper.sourceImage"
                                            @click="applyLogoCrop">
                                        <i class="fas fa-check"></i> 应用
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- ===== 右侧：控制面板 ===== -->
                        <div class="icon-cropper-panel">
                            <!-- 实时预览缩略图 -->
                            <div class="icp-section icp-preview-section">
                                <label class="icp-label">输出预览</label>
                                <div class="icp-preview-box"
                                     :class="{ 'icp-preview-circle': editForm.imageCropper.shape === 'circle' && editForm.imageCropper.target !== 'adSlot', 'icp-preview-round': editForm.imageCropper.shape === 'round' }"
                                     :style="{
                                         width: icpPreviewDims.w + 'px',
                                         height: icpPreviewDims.h + 'px',
                                         borderRadius: editForm.imageCropper.shape === 'round' ? Math.round(Math.min(icpPreviewDims.w, icpPreviewDims.h) * 0.16) + 'px' : '',
                                         background: editForm.imageCropper.target === 'adSlot' ? (currentAdSlotBackgroundCss || '') : ''
                                     }">
                                    <canvas v-if="editForm.imageCropper.sourceImage || (editForm.imageCropper.target === 'site' && editForm.site.logo) || editForm.imageCropper.target === 'sidebarBackground' || editForm.imageCropper.target === 'sidebarBackgroundCollapsed'"
                                            class="icp-preview-canvas"
                                            :class="adSlotOutputBlinkClass"
                                            :ref="'cropPreviewCanvas'"
                                            :width="['adSlot','wallpaper','sidebarBackground','sidebarBackgroundCollapsed'].includes(editForm.imageCropper.target) ? (editForm.imageCropper.outputSizeW || 190) : (editForm.imageCropper.outputSize || 64)"
                                            :height="['adSlot','wallpaper','sidebarBackground','sidebarBackgroundCollapsed'].includes(editForm.imageCropper.target) ? (editForm.imageCropper.outputSizeH || 49) : (editForm.imageCropper.outputSize || 64)"
                                            style="width:100%;height:100%;object-fit:contain;display:block"></canvas>
                                    <i v-else class="fas fa-image" style="color:#ccc;font-size:20px;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)"></i>
                                </div>
                                <div class="icp-preview-info" v-if="['adSlot','wallpaper','sidebarBackground','sidebarBackgroundCollapsed'].includes(editForm.imageCropper.target)">{{ editForm.imageCropper.outputSizeW || 190 }}×{{ editForm.imageCropper.outputSizeH || 49 }} px</div>
                                <div class="icp-preview-info" v-else>{{ editForm.imageCropper.outputSize || 64 }}×{{ editForm.imageCropper.outputSize || 64 }} px</div>
                            </div>

                            <!-- 形状选择：方形 / 圆角（非广告位；站点Logo样式编辑强制圆形 / 壁纸固定方形时隐藏） -->
                            <div class="icp-section" v-if="editForm.imageCropper.target !== 'adSlot' && !(editForm.imageCropper.target === 'site' && editForm.imageCropper.siteStyleMode) && editForm.imageCropper.target !== 'wallpaper' && editForm.imageCropper.target !== 'sidebarBackground' && editForm.imageCropper.target !== 'sidebarBackgroundCollapsed'">
                                <label class="icp-label">形状</label>
                                <div class="icp-size-presets">
                                    <button class="icp-chip" :class="{ active: editForm.imageCropper.shape === 'square' }"
                                            @click="setCropperShape('square')">方形</button>
                                    <button class="icp-chip" :class="{ active: editForm.imageCropper.shape === 'round' }"
                                            @click="setCropperShape('round')">圆角</button>
                                </div>
                            </div>

                            <!-- 尺寸预设 + 自定义尺寸（非广告位/壁纸：正方形/圆形画布） -->
                            <div class="icp-section" v-if="!(editForm.imageCropper.shape === 'square' && (editForm.imageCropper.target === 'adSlot' || editForm.imageCropper.target === 'wallpaper')) && editForm.imageCropper.target !== 'sidebarBackground' && editForm.imageCropper.target !== 'sidebarBackgroundCollapsed'">
                                <label class="icp-label">输出尺寸</label>
                                <div class="icp-size-presets">
                                    <button v-for="s in editForm.imageCropper.sizePresets" :key="s"
                                            class="icp-chip" :class="{ active: editForm.imageCropper.outputSize === s }"
                                            @click="editForm.imageCropper.outputSize = s; updateCropPreview()">{{ s }}</button>
                                </div>
                                <div class="icp-custom-size">
                                    <input type="number" v-model.number="editForm.imageCropper.outputSize" min="16" max="512"
                                           class="form-input" style="width:70px;text-align:center" @change="updateCropPreview()"> px
                                    <span style="font-size:11px;color:var(--text-muted)">（{{ editForm.imageCropper.shape === 'circle' ? '直径' : '正方形' }}画布）</span>
                                </div>
                            </div>

                            <!-- 广告位 / 壁纸：宽 × 高 -->
                            <div class="icp-section" v-if="editForm.imageCropper.shape === 'square' && (editForm.imageCropper.target === 'adSlot' || editForm.imageCropper.target === 'wallpaper')">
                                <label class="icp-label">输出尺寸（宽 × 高）</label>
                                <div class="icp-custom-size" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                                    <input type="number" v-model.number="editForm.imageCropper.outputSizeW" min="16" max="512"
                                           class="form-input" style="width:72px;text-align:center" @input="editForm.imageCropper.target === 'adSlot' ? onAdOutputSizeChange() : setWallpaperPosRatio(editForm.imageCropper.wpPosRatio)"> px
                                    <span style="color:var(--text-muted)">×</span>
                                    <input type="number" v-model.number="editForm.imageCropper.outputSizeH" min="16" max="400"
                                           class="form-input" style="width:72px;text-align:center" @input="editForm.imageCropper.target === 'adSlot' ? onAdOutputSizeChange() : setWallpaperPosRatio(editForm.imageCropper.wpPosRatio)"> px
                                </div>
                                <div style="font-size:11px;color:var(--text-muted);margin-top:5px" v-if="editForm.imageCropper.target === 'adSlot'">单格显示 {{ data.adSlots.width || 380 }}×{{ data.adSlots.height || 49 }} px，建议保持一致</div>
                                <div style="font-size:11px;color:var(--text-muted);margin-top:5px" v-else>按位置比例输出（顶部 16:5 / 底部 16:7 / 页脚 16:3），建议保持默认或选下方比例</div>
                            </div>

                            <!-- 宽高比锁定（广告位 / 壁纸 方形模式） -->
                            <div class="icp-section" v-if="editForm.imageCropper.shape === 'square' && (editForm.imageCropper.target === 'adSlot' || editForm.imageCropper.target === 'wallpaper')">
                                <label class="icp-label">宽高比</label>
                                <div class="icp-ratio-row" v-if="editForm.imageCropper.target === 'wallpaper'">
                                    <button class="icp-chip" :class="{ active: editForm.imageCropper.wpPosRatio === 'top' }" @click="setWallpaperPosRatio('top')">顶部 16:5</button>
                                    <button class="icp-chip" :class="{ active: editForm.imageCropper.wpPosRatio === 'bottom' }" @click="setWallpaperPosRatio('bottom')">底部 16:7</button>
                                    <button class="icp-chip" :class="{ active: editForm.imageCropper.wpPosRatio === 'footer' }" @click="setWallpaperPosRatio('footer')">页脚 16:3</button>
                                    <button class="icp-chip" :class="{ active: !editForm.imageCropper.lockRatio }" @click="toggleRatioLock()" title="自由比例">自由</button>
                                    <label class="icp-lock-toggle" :class="{ on: editForm.imageCropper.lockRatio }" @click="toggleRatioLock()">
                                        <i class="fas" :class="editForm.imageCropper.lockRatio ? 'fa-lock' : 'fa-lock-open'"></i>
                                    </label>
                                </div>
                                <div class="icp-ratio-row" v-else>
                                    <button v-for="rp in editForm.imageCropper.ratioPresets" :key="rp.value"
                                            class="icp-chip" :class="{ active: editForm.imageCropper.aspectRatio === rp.value }"
                                            @click="setAspectRatio(rp.value)">{{ rp.label }}</button>
                                    <button class="icp-chip" :class="{ active: editForm.imageCropper.aspectRatio === 'output' }"
                                            @click="setAspectRatio('output')"
                                            title="与输出尺寸宽高比一致">输出{{ editForm.imageCropper.outputSizeW && editForm.imageCropper.outputSizeH ? '(' + editForm.imageCropper.outputSizeW + ':' + editForm.imageCropper.outputSizeH + ')' : '' }}</button>
                                    <button class="icp-chip" :class="{ active: !editForm.imageCropper.lockRatio }"
                                            @click="toggleRatioLock()" title="自由比例">自由</button>
                                    <label class="icp-lock-toggle" :class="{ on: editForm.imageCropper.lockRatio }" @click="toggleRatioLock()">
                                        <i class="fas" :class="editForm.imageCropper.lockRatio ? 'fa-lock' : 'fa-lock-open'"></i>
                                    </label>
                                </div>
                            </div>

                            <!-- 缩放控制（圆形模式 / 无图片；左侧背景已在左侧专用区显示，此处排除） -->
                            <div class="icp-section" v-if="(editForm.imageCropper.shape === 'circle' || !editForm.imageCropper.sourceImage) && editForm.imageCropper.target !== 'sidebarBackground' && editForm.imageCropper.target !== 'sidebarBackgroundCollapsed'">
                                <label class="icp-label">缩放</label>
                                <div class="icp-zoom-row">
                                    <button class="btn btn-xs icp-btn" @click="circleZoomOut" :disabled="(editForm.imageCropper.imgScale||1)<=0.1">−</button>
                                    <span class="icp-zoom-value">{{ Math.round((editForm.imageCropper.imgScale||1)*100) }}%</span>
                                    <button class="btn btn-xs icp-btn" @click="circleZoomIn">+</button>
                                    <button class="btn btn-xs icp-btn" v-if="editForm.imageCropper.imgScale!==1" @click="circleZoomReset" style="margin-left:4px">重置</button>
                                </div>
                            </div>

                            <!-- 旋转 -->
                            <div class="icp-section" v-if="editForm.imageCropper.target !== 'sidebarBackground' && editForm.imageCropper.target !== 'sidebarBackgroundCollapsed'">
                                <label class="icp-label">旋转</label>
                                <div class="icp-rotate-row">
                                    <button class="btn btn-sm icp-btn" @click="editForm.imageCropper.rotation = (editForm.imageCropper.rotation - 90 + 360) % 360" title="逆时针 90°"><i class="fas fa-undo-alt"></i></button>
                                    <input type="range" min="-180" max="180" v-model.number="editForm.imageCropper.rotation"
                                           class="icp-range-slider" style="flex:1" @input="updateCropPreview()">
                                    <span class="icp-angle-text">{{ editForm.imageCropper.rotation }}°</span>
                                    <button class="btn btn-sm icp-btn" @click="editForm.imageCropper.rotation = (editForm.imageCropper.rotation + 90) % 360" title="顺时针 90°"><i class="fas fa-redo-alt"></i></button>
                                    <button class="btn btn-xs icp-btn" v-if="editForm.imageCropper.rotation !== 0" @click="editForm.imageCropper.rotation = 0" style="padding:2px 6px;font-size:11px">重置</button>
                                </div>
                            </div>

                            <!-- 不透明度（仅广告位）：仿照浏览器标签图标编辑器 -->
                            <div class="icp-section" v-if="editForm.imageCropper.target === 'adSlot'">
                                <label class="icp-label">不透明度</label>
                                <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
                                    <input type="number" class="form-input" min="0" max="100" step="1"
                                           :value="editForm.imageCropper.iconOpacity != null ? editForm.imageCropper.iconOpacity : 100"
                                           style="width:64px;text-align:center;padding:4px"
                                           @change="let o = Math.max(0, Math.min(100, Number($event.target.value) || 0)); editForm.imageCropper.iconOpacity = o; updateCropPreview()">
                                    <span style="font-size:11px;color:var(--text-muted)">%</span>
                                    <input type="range" min="0" max="100" step="1"
                                           :value="editForm.imageCropper.iconOpacity != null ? editForm.imageCropper.iconOpacity : 100"
                                           style="flex:1;height:16px;cursor:pointer;accent-color:#597ef7"
                                           @input="editForm.imageCropper.iconOpacity = Number($event.target.value); updateCropPreview()"
                                           @wheel.prevent="onImageCropperOpacityWheel">
                                </div>
                            </div>

                            <!-- 背景（仅广告位） -->
                            <div class="icp-section" v-if="editForm.imageCropper.target === 'adSlot'">
                                <label class="icp-label">背景</label>
                                <div class="adslot-bg-picker">
                                    <div class="adslot-bg-presets">
                                        <button class="adslot-bg-chip" type="button" :class="{active: currentAdSlotBackground === 'transparent'}" @click="setAdSlotBackground('transparent')" title="透明" style="background:repeating-conic-gradient(#e5e5e5 0% 25%, #fff 0% 50%) 0 0 / 16px 16px"></button>
                                        <button class="adslot-bg-chip" type="button" v-for="c in ['#ff5252','#ffab40','#ffd740','#69f0ae','#40c4ff','#448aff','#7c4dff']" :key="c" :class="{active: currentAdSlotBackground === c}" @click="setAdSlotBackground(c)" :style="{background:c}" :title="c"></button>
                                        <div class="adslot-bg-custom-wrap">
                                        <button class="adslot-bg-chip adslot-bg-chip--custom" type="button" :class="{active: currentAdSlotBackground && currentAdSlotBackground[0] === '#' && !['#ff5252','#ffab40','#ffd740','#69f0ae','#40c4ff','#448aff','#7c4dff'].includes(currentAdSlotBackground)}" @click.stop="openCustomColorModal" title="自定义颜色" style="background:conic-gradient(from 0deg, #ff5252, #ffab40, #ffd740, #69f0ae, #40c4ff, #448aff, #7c4dff, #ff5252)"></button>
                                        <!-- 自定义颜色浮层（在按钮位置弹出，非全屏弹窗） -->
                                        <div v-if="adSlotBgPopover" class="adslot-bg-popover" @click.stop>
                                            <canvas ref="adSlotBgSvCanvas" class="adslot-bg-sv" width="300" height="160"
                                                @pointerdown.stop="onAdSlotBgSVPointerDown($event)"
                                                @pointermove.stop="onAdSlotBgSVPointerMove($event)"
                                                @pointerup.stop="onAdSlotBgSVPointerUp"
                                                @pointerleave.stop="onAdSlotBgSVPointerUp"></canvas>
                                            <div class="adslot-bg-hue-row">
                                                <button class="btn btn-sm adslot-bg-eyedropper" v-if="adSlotBgPicker.hasEyedropper" @click="useAdSlotBgEyeDropper" title="屏幕取色"><i class="fas fa-eye-dropper"></i></button>
                                                <span class="adslot-bg-current" :style="{ background: adSlotBgPicker.color }"></span>
                                                <canvas ref="adSlotBgHueCanvas" class="adslot-bg-hue" width="220" height="16"
                                                    @pointerdown.stop="onAdSlotBgHuePointerDown($event)"
                                                    @pointermove.stop="onAdSlotBgHuePointerMove($event)"
                                                    @pointerup.stop="onAdSlotBgHuePointerUp"
                                                    @pointerleave.stop="onAdSlotBgHuePointerUp"></canvas>
                                            </div>
                                            <div class="adslot-bg-inputs">
                                                <template v-if="adSlotBgPicker.mode === 'rgb'">
                                                    <div class="adslot-bg-input"><input type="number" min="0" max="255" v-model.number="adSlotBgPicker.r" @input="syncAdSlotBgHsvFromRgb"><label>R</label></div>
                                                    <div class="adslot-bg-input"><input type="number" min="0" max="255" v-model.number="adSlotBgPicker.g" @input="syncAdSlotBgHsvFromRgb"><label>G</label></div>
                                                    <div class="adslot-bg-input"><input type="number" min="0" max="255" v-model.number="adSlotBgPicker.b" @input="syncAdSlotBgHsvFromRgb"><label>B</label></div>
                                                </template>
                                                <template v-else-if="adSlotBgPicker.mode === 'hsl'">
                                                    <div class="adslot-bg-input"><input type="number" min="0" max="360" v-model.number="adSlotBgPicker.hslH" @input="syncAdSlotBgFromHsl"><label>H</label></div>
                                                    <div class="adslot-bg-input"><input type="number" min="0" max="100" v-model.number="adSlotBgPicker.hslS" @input="syncAdSlotBgFromHsl"><label>S</label></div>
                                                    <div class="adslot-bg-input"><input type="number" min="0" max="100" v-model.number="adSlotBgPicker.hslL" @input="syncAdSlotBgFromHsl"><label>L</label></div>
                                                </template>
                                                <template v-else-if="adSlotBgPicker.mode === 'hex'">
                                                    <div class="adslot-bg-input adslot-bg-input--hex"><input type="text" v-model="adSlotBgPicker.hex" @input="syncAdSlotBgFromHex"><label>HEX</label></div>
                                                </template>
                                            </div>
                                            <div class="adslot-bg-mode-tabs">
                                                <button type="button" :class="{active: adSlotBgPicker.mode === 'rgb'}" @click.stop="adSlotBgPicker.mode = 'rgb'">RGB</button>
                                                <button type="button" :class="{active: adSlotBgPicker.mode === 'hsl'}" @click.stop="adSlotBgPicker.mode = 'hsl'">HSL</button>
                                                <button type="button" :class="{active: adSlotBgPicker.mode === 'hex'}" @click.stop="adSlotBgPicker.mode = 'hex'">HEX</button>
                                            </div>
                                        </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>

                    <!-- 普通模式：上传/URL/SVG 标签 -->
                    <template v-else>
                    <!-- 模式切换 -->
                    <div class="cropper-tabs">
                        <button class="cropper-tab" :class="{ active: editForm.imageCropper.mode === 'upload' }" @click="switchCropperMode('upload')">
                            <i class="fas fa-upload"></i> 上传图片
                        </button>
                        <button class="cropper-tab" :class="{ active: editForm.imageCropper.mode === 'svg' }" @click="switchCropperMode('svg')">
                            <i class="fas fa-code"></i> SVG 代码
                        </button>
                        <button class="cropper-tab" :class="{ active: editForm.imageCropper.mode === 'url' }" @click="switchCropperMode('url')">
                            <i class="fas fa-link"></i> URL 地址
                        </button>
                    </div>

                    <!-- upload 模式：选择文件 + 裁剪 -->
                    <div v-if="editForm.imageCropper.mode === 'upload'">
                        <!-- 分类图标：复用站点图标编辑器（大预览 / 8角裁剪框 / 缩放 / 旋转 / 背景 / 形状 / 输出尺寸） -->
                        <template v-if="editForm.imageCropper.target === 'categoryIcon'">
                            <div v-if="editForm.iconEditor.tab === 'image'">
                                <div :class="{ 'icon-editor-preview': true, 'icon-editor-dragging': editForm.iconEditor.dragging }"
                                     style="position:relative;width:350px;height:350px;margin:0 auto;overflow:hidden;border-radius:8px;background:repeating-conic-gradient(#e8e8e8 0% 25%,#fff 0% 50%) 0 0 / 16px 16px;border:1px solid var(--border);cursor:grab;user-select:none"
                                     @pointerdown="onIePointerDown" @pointermove="onIePointerMove" @pointerup="onIePointerUp" @pointerleave="onIePointerUp" @wheel.prevent="onIeWheel">
                                    <div v-if="editForm.iconEditor.bgColor && editForm.iconEditor.bgColor !== 'transparent'" style="position:absolute;inset:0;z-index:1" :style="{ background: editForm.iconEditor.bgColor }"></div>
                                    <div v-if="editForm.iconEditor.sourceImage" style="position:absolute;z-index:2" :style="{ transform: 'translate(' + editForm.iconEditor.imgTranslateX + 'px, ' + editForm.iconEditor.imgTranslateY + 'px) scale(' + (editForm.iconEditor.imgScale || 1) + ')', transformOrigin: 'center center', width: (editForm.iconEditor._dispW || 350) + 'px', height: (editForm.iconEditor._dispH || 350) + 'px' }">
                                        <img :src="editForm.iconEditor.sourceImage" :style="{ width: (editForm.iconEditor._dispW || 350) + 'px', height: (editForm.iconEditor._dispH || 350) + 'px', transform: 'rotate(' + editForm.iconEditor.rotation + 'deg)', objectFit: 'cover' }" draggable="false" @error="$event.target.style.display='none'">
                                    </div>
                                    <div style="position:absolute;inset:0;z-index:3;pointer-events:none" v-if="editForm.iconEditor.cropInit">
                                        <div :style="{ position:'absolute', top:0, left:0, right:0, height: editForm.iconEditor.cropY + 'px', background:'rgba(0,0,0,.5)' }"></div>
                                        <div :style="{ position:'absolute', top: editForm.iconEditor.cropY + 'px', left:0, width: editForm.iconEditor.cropX + 'px', height: editForm.iconEditor.cropH + 'px', background:'rgba(0,0,0,.5)' }"></div>
                                        <div :style="{ position:'absolute', top: editForm.iconEditor.cropY + 'px', left: (editForm.iconEditor.cropX + editForm.iconEditor.cropW) + 'px', right:0, height: editForm.iconEditor.cropH + 'px', background:'rgba(0,0,0,.5)' }"></div>
                                        <div :style="{ position:'absolute', bottom:0, left:0, right:0, top: (editForm.iconEditor.cropY + editForm.iconEditor.cropH) + 'px', background:'rgba(0,0,0,.5)' }"></div>
                                    </div>
                                    <div v-if="editForm.iconEditor.cropInit" style="position:absolute;z-index:4;border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,.3);cursor:move;touch-action:none" :style="{ left: editForm.iconEditor.cropX + 'px', top: editForm.iconEditor.cropY + 'px', width: editForm.iconEditor.cropW + 'px', height: editForm.iconEditor.cropH + 'px', borderRadius: editForm.iconEditor.shape === 'circle' ? '50%' : (editForm.iconEditor.shape === 'round' ? Math.round(editForm.iconEditor.cropW * 0.16) + 'px' : '0') }" @pointerdown="onCropBoxPointerDown($event)">
                                        <div style="position:absolute;top:-5px;left:-5px;width:10px;height:10px;background:#fff;border:1px solid rgba(0,0,0,.3);border-radius:2px;cursor:nwse-resize;z-index:5" @pointerdown.stop="onCropHandlePointerDown($event,'nw')"></div>
                                        <div style="position:absolute;top:-5px;right:-5px;width:10px;height:10px;background:#fff;border:1px solid rgba(0,0,0,.3);border-radius:2px;cursor:nesw-resize;z-index:5" @pointerdown.stop="onCropHandlePointerDown($event,'ne')"></div>
                                        <div style="position:absolute;bottom:-5px;left:-5px;width:10px;height:10px;background:#fff;border:1px solid rgba(0,0,0,.3);border-radius:2px;cursor:nesw-resize;z-index:5" @pointerdown.stop="onCropHandlePointerDown($event,'sw')"></div>
                                        <div style="position:absolute;bottom:-5px;right:-5px;width:10px;height:10px;background:#fff;border:1px solid rgba(0,0,0,.3);border-radius:2px;cursor:nwse-resize;z-index:5" @pointerdown.stop="onCropHandlePointerDown($event,'se')"></div>
                                    </div>
                                    <label v-if="!editForm.iconEditor.sourceImage" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:180px;height:180px;display:flex;align-items:center;justify-content:center;z-index:5;cursor:pointer;border-radius:8px" @pointerdown.stop>
                                        <input type="file" accept="image/*" style="display:none" @change="onIconEditorFileChange">
                                        <i v-if="!editForm.iconEditor.fetching" class="fas fa-plus" style="font-size:120px;color:var(--text-secondary);opacity:.45;pointer-events:none"></i>
                                    </label>
                                </div>
                                <div style="margin-top:10px;display:flex;gap:8px;align-items:center;justify-content:center">
                                    <label class="btn btn-sm" style="cursor:pointer;display:inline-flex;align-items:center;gap:4px">
                                        <i class="fas fa-cloud-upload-alt"></i> 选择图片
                                        <input type="file" accept="image/*" style="display:none" @change="onIconEditorFileChange">
                                    </label>
                                    <span style="font-size:12px;color:var(--text-secondary);margin-left:4px">形状</span>
                                    <button class="btn btn-sm" :class="{ 'btn-primary': editForm.iconEditor.shape === 'square' }" @click="editForm.iconEditor.shape = 'square'">方形</button>
                                    <button class="btn btn-sm" :class="{ 'btn-primary': editForm.iconEditor.shape === 'round' }" @click="editForm.iconEditor.shape = 'round'">圆角</button>
                                    <button class="btn btn-sm" :class="{ 'btn-primary': editForm.iconEditor.shape === 'circle' }" @click="editForm.iconEditor.shape = 'circle'">圆形</button>
                                </div>
                                <div style="margin-top:10px">
                                    <div class="ie-control-row">
                                        <span class="ie-label">缩放：</span>
                                        <button class="btn btn-xs ie-step-btn" @click="editForm.iconEditor.imgScale = Math.max(0.1, (editForm.iconEditor.imgScale||1) - 0.1)" :disabled="(editForm.iconEditor.imgScale||1)<=0.1">−</button>
                                        <input type="number" class="form-input ie-num-input" :value="Math.round((editForm.iconEditor.imgScale||1)*100)" min="10" max="500" step="1" @change="const v = Math.max(10, Math.min(500, Number($event.target.value) || 100)); editForm.iconEditor.imgScale = v/100;">
                                        <span class="ie-unit">%</span>
                                        <button class="btn btn-xs ie-step-btn" @click="editForm.iconEditor.imgScale = Math.min(5, (editForm.iconEditor.imgScale||1) + 0.1)">+</button>
                                        <button class="btn btn-xs" v-if="editForm.iconEditor.imgScale!==1" @click="editForm.iconEditor.imgScale = 1; editForm.iconEditor.imgTranslateX = (editForm.iconEditor._initX !== undefined ? editForm.iconEditor._initX : 0); editForm.iconEditor.imgTranslateY = (editForm.iconEditor._initY !== undefined ? editForm.iconEditor._initY : 0)">重置</button>
                                    </div>
                                    <div class="ie-control-row">
                                        <span class="ie-label">旋转：</span>
                                        <input type="number" class="form-input ie-num-input" :value="editForm.iconEditor.rotation > 180 ? editForm.iconEditor.rotation - 360 : editForm.iconEditor.rotation" min="-180" max="180" step="1" @change="let r = (Number($event.target.value) || 0) % 360; if (r < 0) r += 360; editForm.iconEditor.rotation = r;">
                                        <span class="ie-unit">°</span>
                                        <input type="range" min="-180" max="180" class="ie-range-slider" :value="editForm.iconEditor.rotation > 180 ? editForm.iconEditor.rotation - 360 : editForm.iconEditor.rotation" @input="let r = Number($event.target.value); if (r < 0) r += 360; editForm.iconEditor.rotation = r;">
                                        <button class="btn btn-sm" @click="editForm.iconEditor.rotation = (editForm.iconEditor.rotation + 90) % 360"><i class="fas fa-redo-alt"></i> 顺时针</button>
                                    </div>
                                    <div style="display:flex;align-items:center;justify-content:center;gap:4px;flex-wrap:wrap;margin-bottom:8px">
                                        <span style="font-weight:500;font-size:12px;color:var(--text-secondary)">背景：</span>
                                        <button class="btn btn-sm color-swatch" :class="{ active: editForm.iconEditor.bgColor === 'transparent' }" @click="editForm.iconEditor.bgColor = 'transparent'" title="透明" style="width:20px;height:20px;padding:0;border-radius:50%;background:repeating-linear-gradient(45deg,#ccc 0,#ccc 2px,#fff 2px,#fff 4px)"></button>
                                        <button class="btn btn-sm color-swatch" :class="{ active: editForm.iconEditor.bgColor === '#ff4d4f' }" @click="editForm.iconEditor.bgColor = '#ff4d4f'" title="红色" style="width:20px;height:20px;padding:0;border-radius:50%;background:#ff4d4f"></button>
                                        <button class="btn btn-sm color-swatch" :class="{ active: editForm.iconEditor.bgColor === '#fa8c16' }" @click="editForm.iconEditor.bgColor = '#fa8c16'" title="橙色" style="width:20px;height:20px;padding:0;border-radius:50%;background:#fa8c16"></button>
                                        <button class="btn btn-sm color-swatch" :class="{ active: editForm.iconEditor.bgColor === '#fadb14' }" @click="editForm.iconEditor.bgColor = '#fadb14'" title="黄色" style="width:20px;height:20px;padding:0;border-radius:50%;background:#fadb14"></button>
                                        <button class="btn btn-sm color-swatch" :class="{ active: editForm.iconEditor.bgColor === '#a0d911' }" @click="editForm.iconEditor.bgColor = '#a0d911'" title="浅绿色" style="width:20px;height:20px;padding:0;border-radius:50%;background:#a0d911"></button>
                                        <button class="btn btn-sm color-swatch" :class="{ active: editForm.iconEditor.bgColor === '#36cfc9' }" @click="editForm.iconEditor.bgColor = '#36cfc9'" title="青色" style="width:20px;height:20px;padding:0;border-radius:50%;background:#36cfc9"></button>
                                        <button class="btn btn-sm color-swatch" :class="{ active: editForm.iconEditor.bgColor === '#597ef7' }" @click="editForm.iconEditor.bgColor = '#597ef7'" title="蓝色" style="width:20px;height:20px;padding:0;border-radius:50%;background:#597ef7"></button>
                                        <button class="btn btn-sm color-swatch" :class="{ active: editForm.iconEditor.bgColor === '#b37feb' }" @click="editForm.iconEditor.bgColor = '#b37feb'" title="紫色" style="width:20px;height:20px;padding:0;border-radius:50%;background:#b37feb"></button>
                                        <input type="color" v-model="editForm.iconEditor.customBgColor" @input="editForm.iconEditor.bgColor = editForm.iconEditor.customBgColor" @change="editForm.iconEditor.bgColor = editForm.iconEditor.customBgColor" title="自定义" style="width:20px;height:20px;padding:0;border:none;border-radius:50%;cursor:pointer;background:conic-gradient(red,yellow,lime,aqua,blue,magenta,red)">
                                    </div>
                                    <div style="display:flex;align-items:center;justify-content:center;gap:6px">
                                        <span style="font-size:12px;color:var(--text-secondary)">输出：</span>
                                        <input type="number" v-model.number="editForm.iconEditor.outputSize" min="16" max="512" class="form-input" style="width:70px;display:inline-block"> px
                                        <span style="font-size:11px;color:var(--text-muted)">拖拽图片移动 · 拖拽裁剪框选区域 · 滚轮缩放</span>
                                    </div>
                                </div>
                            </div>
                        </template>
                        <template v-else>
                        <input ref="cropperFile" type="file" accept="image/*" style="display:none" @change="onCropperFileChange">
                        <div v-if="!editForm.imageCropper.sourceImage" style="text-align:center;padding:24px;border:2px dashed var(--border);border-radius:8px">
                            <i class="fas fa-cloud-upload-alt" style="font-size:32px;color:var(--text-muted);margin-bottom:8px"></i>
                            <p style="color:var(--text-muted);margin-bottom:12px">选择本地图片（PNG / JPG / WebP / GIF）</p>
                            <button class="btn btn-primary" @click="$refs.cropperFile.click()">
                                <i class="fas fa-folder-open"></i> 选择文件
                            </button>
                        </div>
                        <div v-else>
                            <div v-if="editForm.imageCropper.target === 'headerLogo'" class="cropper-stage hlogo-stage">
                                <div class="circle-cropper-viewport circle-cropper-viewport-square"
                                     :class="{ 'icp-viewport-dragging': editForm.imageCropper.circleDragState && editForm.imageCropper.circleDragState.active }"
                                     :style="{ width: (editForm.imageCropper.viewportSize || 320) + 'px', height: (editForm.imageCropper.viewportSize || 320) + 'px' }"
                                     @wheel.prevent="onCircleWheel"
                                     @pointerdown="onCirclePointerDown"
                                     @pointermove.stop="onViewportPointerMove"
                                     @pointerup.stop="onViewportPointerUp"
                                     @pointerleave.stop="onViewportPointerUp">
                                    <div class="circle-cropper-bg" :style="getHLogoBgStyle()"></div>
                                    <div v-if="editForm.imageCropper.sourceImage" class="circle-cropper-image-wrap"
                                         :style="{ transform: 'translate(' + (editForm.imageCropper.imgTranslateX||0) + 'px,' + (editForm.imageCropper.imgTranslateY||0) + 'px) scale(' + (editForm.imageCropper.imgScale||1) + ')', transformOrigin: '0 0', width: (editForm.imageCropper._dispW || (editForm.imageCropper.viewportSize||640)) + 'px', height: (editForm.imageCropper._dispH || (editForm.imageCropper.viewportSize||640)) + 'px' }">
                                        <div class="circle-cropper-image-rot" :style="{ transform: 'rotate(' + (editForm.imageCropper.hLogoRotation||0) + 'deg)' }">
                                            <img :src="editForm.imageCropper.sourceImage"
                                                 :style="{ width:'100%', height:'100%', objectFit:'cover' }"
                                                 draggable="false"
                                                 @error="$event.target.style.display='none'">
                                        </div>
                                    </div>
                                    <i v-else class="fas fa-image" style="font-size:48px;color:#bbb;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:1"></i>
                                    <div class="circle-cropper-square-frame hlogo-crop-frame"
                                         :style="{ left: (editForm.imageCropper.hLogoBox ? editForm.imageCropper.hLogoBox.x : (editForm.imageCropper.hLogoMargin||50)) + 'px', top: (editForm.imageCropper.hLogoBox ? editForm.imageCropper.hLogoBox.y : (editForm.imageCropper.hLogoMargin||50)) + 'px', width: (editForm.imageCropper.hLogoBox ? editForm.imageCropper.hLogoBox.w : (editForm.imageCropper.viewportSize - 2*(editForm.imageCropper.hLogoMargin||50))) + 'px', height: (editForm.imageCropper.hLogoBox ? editForm.imageCropper.hLogoBox.h : (editForm.imageCropper.viewportSize - 2*(editForm.imageCropper.hLogoMargin||50))) + 'px', borderRadius: editForm.imageCropper.shape === 'round' ? Math.round(Math.min((editForm.imageCropper.hLogoBox ? editForm.imageCropper.hLogoBox.w : (editForm.imageCropper.viewportSize - 2*(editForm.imageCropper.hLogoMargin||50))), (editForm.imageCropper.hLogoBox ? editForm.imageCropper.hLogoBox.h : (editForm.imageCropper.viewportSize - 2*(editForm.imageCropper.hLogoMargin||50)))) * 0.16) + 'px' : '0' }"
                                         @pointerdown.stop.prevent="onHeaderLogoBoxDown($event)">
                                        <span class="ccf-corner ccf-tl" @pointerdown.stop.prevent="onHeaderLogoHandleDown($event, 'tl')"></span>
                                        <span class="ccf-corner ccf-tr" @pointerdown.stop.prevent="onHeaderLogoHandleDown($event, 'tr')"></span>
                                        <span class="ccf-corner ccf-bl" @pointerdown.stop.prevent="onHeaderLogoHandleDown($event, 'bl')"></span>
                                        <span class="ccf-corner ccf-br" @pointerdown.stop.prevent="onHeaderLogoHandleDown($event, 'br')"></span>
                                    </div>
                                </div>
                                <div class="hlogo-controls">
                                    <button class="btn btn-sm" @click="$refs.cropperFile.click()"
                                            style="width:100%;margin-bottom:4px;display:flex;align-items:center;justify-content:center;gap:5px">
                                        <i class="fas fa-redo"></i> 更换图片
                                    </button>
                                    <div class="hlogo-ctrl-row hlogo-zoom-one-line">
                                        <span class="hlogo-ctrl-label">缩放</span>
                                        <button class="hlogo-ctrl-btn" type="button" @click="zoomHeaderLogoBtn(-1)" title="缩小 5%"><i class="fas fa-minus"></i></button>
                                        <input type="number" class="hlogo-ctrl-input" :value="Math.round((editForm.imageCropper.imgScale||1)*100)" min="10" max="500" step="1"
                                               @change="onHLogoZoomInput($event)" title="可手动输入缩放比例（%）">
                                        <span class="hlogo-ctrl-pct">%</span>
                                        <button class="hlogo-ctrl-btn" type="button" @click="zoomHeaderLogoBtn(1)" title="放大 5%"><i class="fas fa-plus"></i></button>
                                    </div>
                                    <div class="hlogo-ctrl-row">
                                        <span class="hlogo-ctrl-label">旋转</span>
                                        <button class="hlogo-ctrl-btn" type="button" @click="rotateHeaderLogo(-1)" title="逆时针"><i class="fas fa-undo"></i></button>
                                        <span class="hlogo-ctrl-val">{{ (editForm.imageCropper.hLogoRotation||0) }}°</span>
                                        <button class="hlogo-ctrl-btn" type="button" @click="rotateHeaderLogo(1)" title="顺时针"><i class="fas fa-redo"></i></button>
                                    </div>
                                    <div class="hlogo-ctrl-row hlogo-bg-row">
                                        <span class="hlogo-ctrl-label">背景</span>
                                        <button class="hlogo-bg-swatch" type="button" :class="{active: editForm.imageCropper.hLogoBg==='transparent'}" @click="editForm.imageCropper.hLogoBg='transparent'" title="透明" style="background:repeating-conic-gradient(#e5e5e5 0% 25%, #fff 0% 50%) 0 0 / 14px 14px"></button>
                                        <button class="hlogo-bg-swatch" type="button" :class="{active: editForm.imageCropper.hLogoBg==='#ff5252'}" @click="editForm.imageCropper.hLogoBg='#ff5252'" style="background:#ff5252"></button>
                                        <button class="hlogo-bg-swatch" type="button" :class="{active: editForm.imageCropper.hLogoBg==='#ffab40'}" @click="editForm.imageCropper.hLogoBg='#ffab40'" style="background:#ffab40"></button>
                                        <button class="hlogo-bg-swatch" type="button" :class="{active: editForm.imageCropper.hLogoBg==='#ffd740'}" @click="editForm.imageCropper.hLogoBg='#ffd740'" style="background:#ffd740"></button>
                                        <button class="hlogo-bg-swatch" type="button" :class="{active: editForm.imageCropper.hLogoBg==='#69f0ae'}" @click="editForm.imageCropper.hLogoBg='#69f0ae'" style="background:#69f0ae"></button>
                                        <button class="hlogo-bg-swatch" type="button" :class="{active: editForm.imageCropper.hLogoBg==='#40c4ff'}" @click="editForm.imageCropper.hLogoBg='#40c4ff'" style="background:#40c4ff"></button>
                                        <button class="hlogo-bg-swatch" type="button" :class="{active: editForm.imageCropper.hLogoBg==='#448aff'}" @click="editForm.imageCropper.hLogoBg='#448aff'" style="background:#448aff"></button>
                                        <button class="hlogo-bg-swatch" type="button" :class="{active: editForm.imageCropper.hLogoBg==='#7c4dff'}" @click="editForm.imageCropper.hLogoBg='#7c4dff'" style="background:#7c4dff"></button>
                                        <button class="hlogo-bg-swatch hlogo-bg-custom" type="button" title="自定义颜色"
                                                :class="{active: editForm.imageCropper.hLogoBg && editForm.imageCropper.hLogoBg.startsWith('#')}"
                                                :style="{ background: editForm.imageCropper.hLogoCustomBg || '#4f46e5' }"
                                                @click="openColorPicker()"></button>
                                    </div>
                                </div>
                            </div>
                            <div v-else class="cropper-stage">
                                <div style="position:relative;display:inline-block">
                                <div class="cropper-canvas" style="overflow:auto"
                                     :style="{ width: (editForm.imageCropper._dispW || 320) + 'px', height: (editForm.imageCropper._dispH || 320) + 'px' }"
                                     @wheel.prevent="onCropWheel"
                                     @pointerdown="onCropCanvasPointerDown"
                                     @pointermove="onCropCanvasPointerMove"
                                     @pointerup="onCropCanvasPointerUp"
                                     @pointerleave="onCropCanvasPointerUp">
                                    <div :style="{ transform: 'scale(' + (editForm.imageCropper.zoom || 1) + ')', transformOrigin: 'top left', width: (editForm.imageCropper._dispW || 320) + 'px', height: (editForm.imageCropper._dispH || 320) + 'px' }">
                                    <img :src="editForm.imageCropper.sourceImage" class="cropper-image"
                                         :style="{ width: (editForm.imageCropper._dispW || 320) + 'px', height: (editForm.imageCropper._dispH || 320) + 'px' }">
                                    <div class="cropper-mask"></div>
                                    <div class="cropper-box"
                                         :style="{ left: editForm.imageCropper.crop.x + 'px', top: editForm.imageCropper.crop.y + 'px', width: editForm.imageCropper.crop.w + 'px', height: editForm.imageCropper.crop.h + 'px', borderRadius: editForm.imageCropper.shape === 'round' ? Math.round(Math.min(editForm.imageCropper.crop.w || 0, editForm.imageCropper.crop.h || 0) * 0.16) + 'px' : '0' }"
                                         @pointermove="onCropPointerMove" @pointerup="onCropPointerUp" @pointerleave="onCropPointerUp">
                                        <div class="cropper-handle nw" @pointerdown="onCropPointerDown($event, 'nw')"></div>
                                        <div class="cropper-handle se" @pointerdown="onCropPointerDown($event, 'se')"></div>
                                        <div class="cropper-move" @pointerdown="onCropPointerDown($event, 'move')"></div>
                                    </div>
                                    </div>
                                </div>
                                </div>
                            </div>
                            <div class="cropper-output-options">
                                <label class="form-label" style="margin-top:12px">输出尺寸</label>
                                <div class="cropper-output-row">
                                    <label class="radio-inline">
                                        <input type="radio" value="square" v-model="editForm.imageCropper.output">
                                        正方形
                                    </label>
                                    <label class="radio-inline">
                                        <input type="radio" value="original" v-model="editForm.imageCropper.output">
                                        按原图比例
                                    </label>
                                    <label class="radio-inline">
                                        {{ editForm.imageCropper.output === 'square' ? '边长' : '最大边长' }}
                                        <input type="number" v-model.number="editForm.imageCropper.outputSize" min="16" max="1024" class="form-input" style="width:80px;display:inline-block;margin-left:4px"> px
                                    </label>
                                    <label class="radio-inline">
                                        格式
                                        <select v-model="editForm.imageCropper.outputFormat" class="form-input" style="width:90px;display:inline-block;margin-left:4px">
                                            <option value="png">PNG</option>
                                            <option value="jpeg">JPEG</option>
                                        </select>
                                    </label>
                                </div>
                            </div>
                            <!-- 形状选择：方形 / 圆角（站点Logo样式编辑强制圆形时隐藏） -->
                            <div v-if="!(editForm.imageCropper.target === 'site' && editForm.imageCropper.siteStyleMode)" style="margin-top:12px">
                                <label class="form-label">形状</label>
                                <div class="cropper-output-row">
                                    <label class="radio-inline">
                                        <input type="radio" value="square" v-model="editForm.imageCropper.shape"> 方形
                                    </label>
                                    <label class="radio-inline">
                                        <input type="radio" value="round" v-model="editForm.imageCropper.shape"> 圆角
                                    </label>
                                </div>
                            </div>
                            <div v-if="editForm.imageCropper.target !== 'headerLogo'" style="margin-top:10px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
                                <button class="btn btn-sm" @click="$refs.cropperFile.click()">
                                    <i class="fas fa-redo"></i> 更换图片
                                </button>
                            </div>
                        </div>
                        </template>
                    </div>

                    <!-- url 模式 -->
                    <div v-else-if="editForm.imageCropper.mode === 'url'">
                        <div class="form-group">
                            <label class="form-label">Logo URL / 相对路径</label>
                            <input class="form-input" v-model="editForm.imageCropper.urlValue"
                                   placeholder="https://example.com/logo.png  或  ./assets/logo.png">
                            <div class="setting-hint">支持绝对 URL、相对路径、data: base64 内联</div>
                        </div>
                        <div v-if="editForm.imageCropper.urlValue" class="cropper-preview-mini">
                            <img :src="editForm.imageCropper.urlValue" @error="$event.target.style.display='none'">
                        </div>
                    </div>

                    <!-- svg 模式 -->
                    <div v-else>
                        <div class="form-group">
                            <label class="form-label">SVG 代码</label>
                            <textarea class="form-textarea" v-model="editForm.imageCropper.svgText" rows="8"
                                      placeholder='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="10" fill="#4f46e5"/></svg>'></textarea>
                            <div class="setting-hint">SVG 会直接以 inline 方式内联到搜索栏 Logo 位置</div>
                        </div>
                        <div v-if="editForm.imageCropper.svgText" class="cropper-preview-mini" v-html="editForm.imageCropper.svgText"></div>
                    </div>
                    </template>
                        </template>
                    </div>
                <div class="modal-footer">
                    <button class="btn" @click="closeLogoCropper">取消</button>
                    <button class="btn btn-primary"
                            v-if="!(editForm.imageCropper.target === 'categoryIcon' && editForm.imageCropper.mode === 'upload')"
                            :disabled="editForm.imageCropper.mode === 'upload' && !editForm.imageCropper.sourceImage"
                            @click="applyLogoCrop">
                        <i class="fas fa-check"></i> 应用
                    </button>
                    <button class="btn btn-primary"
                            v-if="editForm.imageCropper.target === 'categoryIcon' && editForm.imageCropper.mode === 'upload'"
                            @click="applyIconEditor">
                        <i class="fas fa-check"></i> 应用
                    </button>
                </div>
                </div>
            </div>

        <!-- 背景图配置弹窗 -->
        <div v-if="modal.bgConfig" class="modal-overlay">
            <div class="modal" style="width:1360px;max-width:92vw">
                <div class="modal-header">
                    <h3><i class="fas fa-image"></i> 背景图配置</h3>
                    <button class="btn btn-sm" style="margin-left:auto;margin-right:20px" @click="openWallpaperLibrary()"><i class="fas fa-th-large"></i> 壁纸库</button>
                    <button class="btn-icon" @click="modal.bgConfig = false"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <!-- 顶部背景 -->
                    <div class="bg-section">
                        <h4 class="bg-section-title"><i class="fas fa-arrow-up"></i> 顶部壁纸（搜索栏区域）</h4>
                        <div class="form-group">
                            <label class="form-label">背景类型</label>
                            <select class="form-input" v-model="data.background.mode" @change="applyFirstBgPreset('top')">
                                    <option v-for="g in groupsForPos('top')" :key="g.key" :value="g.key">{{ g.label }}</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">快速选择（预设壁纸）</label>
                            <div class="bg-presets">
                                <button class="bg-preset-btn bg-preset-none"
                                        :class="{ active: !data.background || data.background.type === 'none' || !data.background.url }"
                                        @click="clearBgPreset('top')">
                                    <div class="bg-preset-thumb bg-preset-thumb-none"><i class="fas fa-ban"></i></div>
                                    <span class="bg-preset-name">无背景</span>
                                </button>
                                <button v-for="(p, i) in allWallpapers.filter(x=>x.group===data.background.mode && wpPos(x)==='top')"
                                        :key="'top-'+i"
                                        class="bg-preset-btn"
                                        :class="{ active: data.background && data.background.url === p.url }"
                                        @click="applyBgPreset('top', p)">
                                    <div class="bg-preset-thumb" :style="{ backgroundImage: 'url(' + resolvePreviewUrl(p.url) + ')' }"></div>
                                    <span class="bg-preset-name">{{ p.name }}</span>
                                </button>
                            </div>
                        </div>
                        <div v-if="data.background && data.background.type !== 'none' && data.background.url" class="bg-preview">
                            <div class="bg-preview-label"><i class="fas fa-eye"></i> 实际效果预览（搜索栏区域 · 16:5）</div>
                            <div class="bg-preview-frame bg-preview-top" :style="{ backgroundImage: 'url(' + resolvePreviewUrl(data.background.url) + ')' }"></div>
                        </div>
                    </div>

                    <hr class="bg-divider">

                    <!-- 底部背景 -->
                    <div class="bg-section">
                        <h4 class="bg-section-title"><i class="fas fa-arrow-down"></i> 中部壁纸（卡片区域）</h4>
                        <div class="form-group">
                            <label class="form-label">背景类型</label>
                            <select class="form-input" v-model="data.bottomBackground.mode" @change="applyFirstBgPreset('bottom')">
                                    <option v-for="g in groupsForPos('bottom')" :key="g.key" :value="g.key">{{ g.label }}</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">快速选择（预设壁纸）</label>
                            <div class="bg-presets">
                                <button class="bg-preset-btn bg-preset-none"
                                        :class="{ active: !data.bottomBackground || data.bottomBackground.type === 'none' || !data.bottomBackground.url }"
                                        @click="clearBgPreset('bottom')">
                                    <div class="bg-preset-thumb bg-preset-thumb-none"><i class="fas fa-ban"></i></div>
                                    <span class="bg-preset-name">无背景</span>
                                </button>
                                <button v-for="(p, i) in allWallpapers.filter(x=>x.group===data.bottomBackground.mode && wpPos(x)==='bottom')"
                                        :key="'bottom-'+i"
                                        class="bg-preset-btn"
                                        :class="{ active: data.bottomBackground && data.bottomBackground.url === p.url }"
                                        @click="applyBgPreset('bottom', p)">
                                    <div class="bg-preset-thumb" :style="{ backgroundImage: 'url(' + resolvePreviewUrl(p.url) + ')' }"></div>
                                    <span class="bg-preset-name">{{ p.name }}</span>
                                </button>
                            </div>
                        </div>
                        <div v-if="data.bottomBackground && data.bottomBackground.type !== 'none' && data.bottomBackground.url" class="bg-preview">
                            <div class="bg-preview-label"><i class="fas fa-eye"></i> 实际效果预览（卡片区域 · 16:7）</div>
                            <div class="bg-preview-frame bg-preview-bottom" :style="{ backgroundImage: 'url(' + resolvePreviewUrl(data.bottomBackground.url) + ')' }"></div>
                        </div>
                    </div>

                    <hr class="bg-divider">

                    <!-- 页脚背景（最底部版权信息条） -->
                    <div class="bg-section">
                        <h4 class="bg-section-title"><i class="fas fa-arrow-down"></i> 底部壁纸（版权信息条）</h4>
                        <div class="form-group">
                            <label class="form-label">背景类型</label>
                            <select class="form-input" v-model="data.footerBackground.mode" @change="applyFirstBgPreset('footer')">
                                    <option v-for="g in groupsForPos('footer')" :key="g.key" :value="g.key">{{ g.label }}</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">快速选择（预设壁纸）</label>
                            <div class="bg-presets">
                                <button class="bg-preset-btn bg-preset-none"
                                        :class="{ active: !data.footerBackground || data.footerBackground.type === 'none' || !data.footerBackground.url }"
                                        @click="clearBgPreset('footer')">
                                    <div class="bg-preset-thumb bg-preset-thumb-none"><i class="fas fa-ban"></i></div>
                                    <span class="bg-preset-name">无背景</span>
                                </button>
                                <button v-for="(p, i) in allWallpapers.filter(x=>x.group===data.footerBackground.mode && wpPos(x)==='footer')"
                                        :key="'footer-'+i"
                                        class="bg-preset-btn"
                                        :class="{ active: data.footerBackground && data.footerBackground.url === p.url }"
                                        @click="applyBgPreset('footer', p)">
                                    <div class="bg-preset-thumb" :style="{ backgroundImage: 'url(' + resolvePreviewUrl(p.url) + ')' }"></div>
                                    <span class="bg-preset-name">{{ p.name }}</span>
                                </button>
                            </div>
                        </div>
                        <div v-if="data.footerBackground && data.footerBackground.type !== 'none' && data.footerBackground.url" class="bg-preview">
                            <div class="bg-preview-label"><i class="fas fa-eye"></i> 实际效果预览（版权信息条 · 16:3）</div>
                            <div class="bg-preview-frame bg-preview-footer" :style="{ backgroundImage: 'url(' + resolvePreviewUrl(data.footerBackground.url) + ')' }"></div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer" style="justify-content:space-between;flex-wrap:wrap;gap:12px">
                    <div class="bg-modal-hint">
                        <i class="fas fa-info-circle"></i> 提示：设置已自动保存。想让「index.html / 发布站」也生效，请点击「打包下载」或「发布」重新生成。
                    </div>
                    <div style="display:flex;gap:10px;margin-left:auto">
                        <button class="btn" @click="modal.bgConfig = false">完成</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- 壁纸库管理弹窗 -->
        <div v-if="modal.wallpaperLibrary" class="modal-overlay">
            <div class="modal" style="width:1360px;max-width:92vw">
                <div class="modal-header">
                    <h3><i class="fas fa-th-large"></i> 壁纸库</h3>
                    <button class="btn-icon" @click="modal.wallpaperLibrary = false"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <!-- 一级位置标签：先选「顶部/底部/页脚背景」，再在下面选分类 -->
                    <div class="wp-lib-pos-tabs">
                        <span class="wp-pos-label">适配位置</span>
                        <button class="wp-pos-btn" :class="{ active: wpLib.pos === 'top', 'pos-drop-over': wpLib.groupDragFrom && wpLib.groupDropPos === 'top' }" @click="setWpPos('top')" @dragover.prevent="wpLib.groupDropPos = 'top'" @dragleave="wpLib.groupDropPos = null" @drop.prevent="onGroupDropOnPos('top')">顶部壁纸</button>
                        <button class="wp-pos-btn" :class="{ active: wpLib.pos === 'bottom', 'pos-drop-over': wpLib.groupDragFrom && wpLib.groupDropPos === 'bottom' }" @click="setWpPos('bottom')" @dragover.prevent="wpLib.groupDropPos = 'bottom'" @dragleave="wpLib.groupDropPos = null" @drop.prevent="onGroupDropOnPos('bottom')">中部壁纸</button>
                        <button class="wp-pos-btn" :class="{ active: wpLib.pos === 'footer', 'pos-drop-over': wpLib.groupDragFrom && wpLib.groupDropPos === 'footer' }" @click="setWpPos('footer')" @dragover.prevent="wpLib.groupDropPos = 'footer'" @dragleave="wpLib.groupDropPos = null" @drop.prevent="onGroupDropOnPos('footer')">底部壁纸</button>
                        <span class="wp-pos-hint" v-if="wpLib.groupDragFrom"><i class="fas fa-arrow-right"></i> 把分类拖到此处即可加到该位置</span>
                    </div>
                    <!-- 分组切换：先选分组，再只显示该分组壁纸 -->
                    <div class="wp-lib-groups">
                        <button v-for="g in groupsForPos(wpLib.pos)" :key="g.key"
                                class="bg-type-btn" :class="{ active: wpLib.mode === g.key, 'wp-group-dragging': wpLib.groupDragFrom === g.key, 'wp-group-drag-over': wpLib.groupDragOver === g.key && wpLib.groupDragFrom !== g.key }"
                                draggable="true"
                                @click="wpLib.mode = g.key"
                                @dragstart="onGroupDragStart(g.key)"
                                @dragover.prevent="onGroupDragOver(g.key)"
                                @drop.prevent="onGroupDrop(g.key)"
                                @dragend="onGroupDragEnd()">
                            {{ g.label }}
                        </button>
                        <span class="wp-group-add">
                            <input class="form-input wp-group-input" v-model="wpLib.newGroupName" placeholder="新分类名" @keyup.enter="addWallpaperGroup()">
                            <span class="wp-group-add-actions">
                                <button class="btn btn-sm" @click="addWallpaperGroup()">＋ 新增分类</button>
                                <button class="btn btn-sm btn-danger" @click="deleteCurrentWallpaperGroup()">删除此分类</button>
                                <button class="btn btn-sm btn-outline" @click="openWallpaperFolder()"><i class="fas fa-folder-open"></i> 打开所在文件夹</button>
                            </span>
                        </span>
                    </div>

                    <!-- 新增壁纸（分组跟随顶部切换，无需再选） -->
                    <div class="bg-section">
                        <h4 class="bg-section-title"><i class="fas fa-plus"></i> 新增壁纸<span class="wp-lib-add-hint">（将加入：{{ (bgPresetGroups.find(x=>x.key===wpLib.mode)||{}).label }}）</span></h4>
                        <div class="form-group wp-lib-source-row">
                            <label class="form-label">图片来源</label>
                            <div class="cropper-output-row">
                                <label class="radio-inline"><input type="radio" value="upload" v-model="wpLib.source"> 上传本地图片</label>
                                <span class="wp-tip" tabindex="0">
                                    <i class="fas fa-info-circle wp-tip-trigger"></i>
                                    <span class="wp-tip-pop">选择本地图片文件，会直接转成内嵌数据保存（无需外部链接）。建议使用常见图片格式（PNG / JPG / WEBP 等），体积不宜过大。</span>
                                </span>
                                <label class="radio-inline"><input type="radio" value="url" v-model="wpLib.source"> 图片 URL</label>
                                <span class="wp-tip" tabindex="0">
                                    <i class="fas fa-info-circle wp-tip-trigger"></i>
                                    <span class="wp-tip-pop">填写图片地址（http(s) 链接或相对路径，如 ./assets/...）。请确保地址可访问，否则预览可能为空。</span>
                                </span>
                                <template v-if="wpLib.source !== 'url'">
                                    <input ref="wpLibFile" class="wp-lib-file-input" type="file" accept="image/*" id="wpLibFileInput" @change="onWallpaperFileChange">
                                    <label for="wpLibFileInput" class="wp-lib-file-trigger">
                                        <span class="btn btn-sm"><i class="fas fa-folder-open"></i> 选择文件</span>
                                    </label>
                                    <span class="wp-lib-file-name">{{ wpLib.fileName || '未选择任何文件' }}</span>
                                </template>
                                <input v-else class="form-input wp-lib-url-input" v-model="wpLib.url" placeholder="https://... 或 ./assets/...">
                            </div>
                        </div>
                        <div class="form-group wp-lib-name-row">
                            <label class="form-label">名称</label>
                            <input class="form-input" v-model="wpLib.name" placeholder="如：我的壁纸">
                            <button class="btn btn-primary" :disabled="wpLib.source === 'url' ? !wpLib.url : !wpLib.fileName" @click="addCustomWallpaper()">添加壁纸</button>
                        </div>
                    </div>

                    <hr class="bg-divider">

                    <!-- 壁纸列表（仅当前分组） -->
                    <div class="bg-section">
                        <h4 class="bg-section-title"><i class="fas fa-list"></i> {{ (bgPresetGroups.find(x=>x.key===wpLib.mode)||{}).label }}（{{ allWallpapers.filter(x=>x.group===wpLib.mode && wpPos(x)===wpLib.pos).length }}）</h4>
                        <div class="wp-lib-list" v-if="allWallpapers.filter(x=>x.group===wpLib.mode && wpPos(x)===wpLib.pos).length">
                            <div class="wp-lib-item" v-for="(w, i) in allWallpapers.filter(x=>x.group===wpLib.mode && wpPos(x)===wpLib.pos)" :key="w.id || w.url"
                                 draggable="true"
                                 :class="{ 'wp-dragging': wpLib.dragFrom === (w.id || w.url), 'wp-drag-over': wpLib.dragOver === (w.id || w.url) && wpLib.dragFrom !== (w.id || w.url) }"
                                 @dragstart="onWallpaperDragStart(w.id || w.url)"
                                 @dragover.prevent="onWallpaperDragOver(w.id || w.url)"
                                 @drop.prevent="onWallpaperDrop(w.id || w.url)"
                                 @dragend="onWallpaperDragEnd()">
                                <div class="wp-lib-thumb" :style="{ backgroundImage: 'url(' + resolvePreviewUrl(w.url) + ')' }"></div>
                                <div class="wp-lib-meta">
                                    <div class="wp-lib-name">{{ w.name }}</div>
                                    <div class="wp-lib-group">{{ w.id ? '自定义' : '内置' }}</div>
                                </div>
                                <div class="wp-lib-actions">
                                    <button v-if="w.id" class="btn-icon wp-lib-del" title="删除" @click="deleteCustomWallpaper(w.id)"><i class="fas fa-trash"></i></button>
                                </div>
                            </div>
                        </div>
                        <div v-else class="wp-lib-empty">该分组下暂无壁纸</div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn" @click="modal.wallpaperLibrary = false">完成</button>
                </div>
            </div>
        </div>

        <!-- 每日文字配置弹窗 -->
        <div v-if="modal.dailyText" class="modal-overlay">
            <div class="modal" style="max-width:540px">
                <div class="modal-header">
                    <h3><i class="fas fa-quote-right"></i> 每日文字</h3>
                    <button class="btn-icon" @click="modal.dailyText = false"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <div class="form-group" style="margin-bottom:10px">
                        <label class="form-label" style="display:flex;align-items:center;gap:6px;font-weight:600">
                            <span>每日文字</span>
                            <span style="font-weight:normal;font-size:12px;color:var(--text-muted)">访客页面右上角显示的每日语录</span>
                        </label>
                        <div style="display:flex;align-items:center;gap:8px;margin-top:6px;cursor:pointer"
                             @click="data.dailyText.enabled = !data.dailyText.enabled">
                            <span style="position:relative;display:inline-block;width:36px;height:20px;flex-shrink:0">
                                <span style="position:absolute;inset:0;background:#ccc;border-radius:20px;transition:.2s"
                                      :style="{background:data.dailyText.enabled?'#597ef7':'#ccc'}"></span>
                                <span style="position:absolute;top:2px;left:2px;width:16px;height:16px;background:#fff;border-radius:50%;transition:.2s;box-shadow:0 1px 3px rgba(0,0,0,.2)"
                                      :style="{transform:data.dailyText.enabled?'translateX(16px)':'translateX(0)'}"></span>
                            </span>
                            <span style="font-size:13px" :style="{color:data.dailyText.enabled?'#333':'#999'}">{{ data.dailyText.enabled ? '已开启' : '已关闭' }}</span>
                            <button type="button" class="cp-field-swatch" title="文字颜色"
                                    @click.stop="openColorPicker({ value: data.dailyText.textColor, onConfirm: (val) => { data.dailyText.textColor = val; } })"><span :style="{ background: data.dailyText.textColor || '#333333' }"></span></button>
                        </div>
                    </div>

                    <div v-if="data.dailyText.enabled">
                        <label class="form-label" style="font-size:13px;font-weight:500;margin-bottom:8px">语录来源</label>
                        <div style="display:flex;flex-direction:column;gap:6px">
                            <!-- 一言（通用） -->
                            <label style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid;border-radius:8px;cursor:pointer;transition:.15s"
                                   :style="{borderColor:data.dailyText.source==='hitokoto'?'#597ef7':'#e5e7eb',background:data.dailyText.source==='hitokoto'?'#f0f3ff':'#fafafa'}"
                                   @click.prevent="data.dailyText.source='hitokoto'">
                                <input type="radio" value="hitokoto" v-model="data.dailyText.source" style="display:none">
                                <span style="width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;font-size:14px;font-weight:bold;flex-shrink:0">一言</span>
                                <div style="flex:1;min-width:0">
                                    <div style="font-size:13px;font-weight:500">一言 (hitokoto.cn)</div>
                                    <div style="font-size:11px;color:#888">从一言 API 获取随机一句话，涵盖各类语录、诗词</div>
                                </div>
                                <i v-if="data.dailyText.source==='hitokoto'" class="fas fa-check-circle" style="color:#597ef7"></i>
                            </label>

                            <!-- 今日诗词 -->
                            <label style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid;border-radius:8px;cursor:pointer;transition:.15s"
                                   :style="{borderColor:data.dailyText.source==='jinrishici'?'#597ef7':'#e5e7eb',background:data.dailyText.source==='jinrishici'?'#f0f3ff':'#fafafa'}"
                                   @click.prevent="data.dailyText.source='jinrishici'">
                                <input type="radio" value="jinrishici" v-model="data.dailyText.source" style="display:none">
                                <span style="width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#f093fb,#f5576c);color:#fff;font-size:14px;font-weight:bold;flex-shrink:0">诗</span>
                                <div style="flex:1;min-width:0">
                                    <div style="font-size:13px;font-weight:500">今日诗词 (jinrishici.com)</div>
                                    <div style="font-size:11px;color:#888">每天自动推送一首古诗词，含作者和出处</div>
                                </div>
                                <i v-if="data.dailyText.source==='jinrishici'" class="fas fa-check-circle" style="color:#597ef7"></i>
                            </label>

                            <!-- 爱词霸每日一句 -->
                            <label style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid;border-radius:8px;cursor:pointer;transition:.15s"
                                   :style="{borderColor:data.dailyText.source==='iciba'?'#597ef7':'#e5e7eb',background:data.dailyText.source==='iciba'?'#f0f3ff':'#fafafa'}"
                                   @click.prevent="data.dailyText.source='iciba'">
                                <input type="radio" value="iciba" v-model="data.dailyText.source" style="display:none">
                                <span style="width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#4facfe,#00f2fe);color:#fff;font-size:12px;font-weight:bold;flex-shrink:0">ICIBA</span>
                                <div style="flex:1;min-width:0">
                                    <div style="font-size:13px;font-weight:500">爱词霸每日一句</div>
                                    <div style="font-size:11px;color:#888">每日英文励志句子 + 中文翻译</div>
                                </div>
                                <i v-if="data.dailyText.source==='iciba'" class="fas fa-check-circle" style="color:#597ef7"></i>
                            </label>

                            <!-- xygeng 一言 -->
                            <label style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid;border-radius:8px;cursor:pointer;transition:.15s"
                                   :style="{borderColor:data.dailyText.source==='xygeng'?'#597ef7':'#e5e7eb',background:data.dailyText.source==='xygeng'?'#f0f3ff':'#fafafa'}"
                                   @click.prevent="data.dailyText.source='xygeng'">
                                <input type="radio" value="xygeng" v-model="data.dailyText.source" style="display:none">
                                <span style="width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#a18cd1,#fbc2eb);color:#fff;font-size:12px;font-weight:bold;flex-shrink:0">XYG</span>
                                <div style="flex:1;min-width:0">
                                    <div style="font-size:13px;font-weight:500">xygeng 一言</div>
                                    <div style="font-size:11px;color:#888">精选文学、影视、小说类经典语录</div>
                                </div>
                                <i v-if="data.dailyText.source==='xygeng'" class="fas fa-check-circle" style="color:#597ef7"></i>
                            </label>

                            <!-- 一言·动漫 -->
                            <label style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid;border-radius:8px;cursor:pointer;transition:.15s"
                                   :style="{borderColor:data.dailyText.source==='hitokoto_anime'?'#597ef7':'#e5e7eb',background:data.dailyText.source==='hitokoto_anime'?'#f0f3ff':'#fafafa'}"
                                   @click.prevent="data.dailyText.source='hitokoto_anime'">
                                <input type="radio" value="hitokoto_anime" v-model="data.dailyText.source" style="display:none">
                                <span style="width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#f6d365,#fda085);color:#fff;font-size:14px;flex-shrink:0">&#x2606;</span>
                                <div style="flex:1;min-width:0">
                                    <div style="font-size:13px;font-weight:500">一言·动漫 (ACG)</div>
                                    <div style="font-size:11px;color:#888">来自动漫、漫画的精选台词和名言</div>
                                </div>
                                <i v-if="data.dailyText.source==='hitokoto_anime'" class="fas fa-check-circle" style="color:#597ef7"></i>
                            </label>

                            <!-- 一言·诗词 -->
                            <label style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid;border-radius:8px;cursor:pointer;transition:.15s"
                                   :style="{borderColor:data.dailyText.source==='hitokoto_poetry'?'#597ef7':'#e5e7eb',background:data.dailyText.source==='hitokoto_poetry'?'#f0f3ff':'#fafafa'}"
                                   @click.prevent="data.dailyText.source='hitokoto_poetry'">
                                <input type="radio" value="hitokoto_poetry" v-model="data.dailyText.source" style="display:none">
                                <span style="width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#89f7fe,#66a6ff);color:#fff;font-size:14px;flex-shrink:0">&#x266B;</span>
                                <div style="flex:1;min-width:0">
                                    <div style="font-size:13px;font-weight:500">一言·诗词</div>
                                    <div style="font-size:11px;color:#888">古诗词、歌词等文艺类语句，点击可跳转来源</div>
                                </div>
                                <i v-if="data.dailyText.source==='hitokoto_poetry'" class="fas fa-check-circle" style="color:#597ef7"></i>
                            </label>

                            <!-- 历史上的今天 -->
                            <label style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid;border-radius:8px;cursor:pointer;transition:.15s"
                                   :style="{borderColor:data.dailyText.source==='history_today'?'#597ef7':'#e5e7eb',background:data.dailyText.source==='history_today'?'#f0f3ff':'#fafafa'}"
                                   @click.prevent="data.dailyText.source='history_today'">
                                <input type="radio" value="history_today" v-model="data.dailyText.source" style="display:none">
                                <span style="width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#f83600,#fe8c00);color:#fff;font-size:14px;flex-shrink:0">&#x1F4C5;</span>
                                <div style="flex:1;min-width:0">
                                    <div style="font-size:13px;font-weight:500">历史上的今天</div>
                                    <div style="font-size:11px;color:#888">百度百科 · 每日推送当年今日的重大事件</div>
                                </div>
                                <i v-if="data.dailyText.source==='history_today'" class="fas fa-check-circle" style="color:#597ef7"></i>
                            </label>

                            <!-- 自定义文字 -->
                            <label style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid;border-radius:8px;cursor:pointer;transition:.15s"
                                   :style="{borderColor:data.dailyText.source==='custom'?'#597ef7':'#e5e7eb',background:data.dailyText.source==='custom'?'#f0f3ff':'#fafafa'}"
                                   @click.prevent="data.dailyText.source='custom'">
                                <input type="radio" value="custom" v-model="data.dailyText.source" style="display:none">
                                <span style="width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#fa709a,#fee140);color:#fff;font-size:14px;flex-shrink:0">&#x270E;</span>
                                <div style="flex:1;min-width:0">
                                    <div style="font-size:13px;font-weight:500">自定义文字</div>
                                    <div style="font-size:11px;color:#888">自己写固定显示的文字内容</div>
                                </div>
                                <i v-if="data.dailyText.source==='custom'" class="fas fa-check-circle" style="color:#597ef7"></i>
                            </label>
                        </div>

                        <!-- 自定义文字输入框 -->
                        <div v-if="data.dailyText.source === 'custom'" style="margin-top:10px">
                            <textarea class="form-textarea" v-model="data.dailyText.customText"
                                      placeholder="输入要显示的文字，例如：疏影横斜水清浅，暗香浮动月黄昏。"
                                      rows="2" style="font-size:13px"></textarea>
                            <div style="margin-top:4px;font-size:11px;color:#999">留空则隐藏该区域；支持纯文本，不支持 HTML</div>
                        </div>

                        <!-- 预览 -->
                        <div style="margin-top:10px;padding:8px 12px;background:#f8f9fa;border-radius:8px;border:1px dashed #ddd">
                            <div style="font-size:11px;color:#888;margin-bottom:4px"><i class="fas fa-eye"></i> 预览效果：</div>
                            <div id="daily_text_preview" style="font-size:13px;color:#555;line-height:1.5">
                                <template v-if="data.dailyText.source === 'custom' && data.dailyText.customText">
                                    {{ data.dailyText.customText }}
                                </template>
                                <template v-else-if="data.dailyText.source === 'custom' && !data.dailyText.customText">
                                    <span style="color:#bbb;font-style:italic">(未填写自定义文字，将不显示)</span>
                                </template>
                                <template v-else>
                                    <span style="color:#aaa">将根据所选来源动态加载...</span>
                                </template>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn" @click="modal.dailyText = false">完成</button>
                </div>
            </div>
        </div>

        <!-- SEO 营销配置弹窗 -->
        <div v-if="modal.seo" class="modal-overlay">
            <div class="modal modal-seo">
                <div class="modal-header">
                    <h3><i class="fas fa-chart-line" style="color:var(--primary)"></i> SEO 营销配置</h3>
                    <div style="display:flex;align-items:center;gap:8px;margin-left:auto;margin-right:12px;font-size:13px">
                        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:600">
                            <input type="checkbox" v-model="data.seo.enabled"> 启用 SEO
                        </label>
                    </div>
                    <button class="btn-icon" @click="modal.seo = false"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <div style="font-size:12px;color:var(--text-muted);margin-bottom:14px;padding:10px 12px;background:var(--bg-soft);border-radius:8px">
                        <i class="fas fa-info-circle"></i> 配置将注入导出的 index.html / about.html / commit.html 的 &lt;head&gt;，并在部署时自动生成 robots.txt、sitemap.xml 与站点验证文件。
                    </div>

                    <!-- ===== 1. 站点地址 & 基础 SEO ===== -->
                    <div class="seo-section">
                        <div class="seo-section-title"><i class="fas fa-globe"></i> 站点地址 &amp; 基础 SEO</div>
                        <div class="form-group">
                            <label class="form-label">部署后站点地址 <span style="font-weight:400;color:var(--text-muted)">（用于 canonical / sitemap / 分享链接）</span></label>
                            <input class="form-input" v-model="data.seo.baseUrl" placeholder="如：https://nav.example.com">
                            <div class="setting-hint">必须以 http(s):// 开头、不带结尾斜杠。留空则不会生成 sitemap.xml。</div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">页面标题</label>
                            <input class="form-input" v-model="data.seo.title" placeholder="留空则使用站点标题">
                            <div class="setting-hint">覆盖默认 &lt;title&gt; 与分享标题；建议 10-30 个字符，包含核心关键词。</div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">页面描述（Description）</label>
                            <textarea class="form-input" rows="2" v-model="data.seo.description" placeholder="用 1-2 句话概括网站内容，建议 50-160 个字符"></textarea>
                            <div class="setting-hint">显示在搜索引擎结果摘要与分享卡片中。</div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">关键词（Keywords）</label>
                            <input class="form-input" v-model="data.seo.keywords" placeholder="如：网址导航,在线工具,资源导航">
                            <div class="setting-hint">用英文逗号分隔多个关键词。</div>
                        </div>
                        <div style="display:flex;gap:12px;flex-wrap:wrap">
                            <div class="form-group" style="flex:1;min-width:220px">
                                <label class="form-label">作者</label>
                                <input class="form-input" v-model="data.seo.author" placeholder="站点作者/站长名称">
                            </div>
                            <div class="form-group" style="flex:1;min-width:220px">
                                <label class="form-label">搜索引擎抓取（Robots）</label>
                                <select class="form-input" v-model="data.seo.robots">
                                    <option value="index,follow">允许收录与跟踪链接（index, follow）</option>
                                    <option value="noindex,follow">禁止收录，允许跟踪链接（noindex, follow）</option>
                                    <option value="index,nofollow">允许收录，不跟踪链接（index, nofollow）</option>
                                    <option value="noindex,nofollow">完全禁止收录（noindex, nofollow）</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <!-- ===== 2. Open Graph 分享卡片 ===== -->
                    <div class="seo-section">
                        <div class="seo-section-title" style="display:flex;align-items:center;gap:8px">
                            <i class="fab fa-facebook-square"></i> Open Graph 分享卡片
                            <label style="margin-left:auto;display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;font-weight:400">
                                <input type="checkbox" v-model="data.seo.ogEnabled"> 启用
                            </label>
                        </div>
                        <div class="form-group">
                            <label class="form-label">分享标题（og:title）</label>
                            <input class="form-input" v-model="data.seo.ogTitle" placeholder="留空则使用页面标题">
                        </div>
                        <div class="form-group">
                            <label class="form-label">分享描述（og:description）</label>
                            <textarea class="form-input" rows="2" v-model="data.seo.ogDescription" placeholder="留空则使用页面描述"></textarea>
                        </div>
                        <div class="form-group">
                            <label class="form-label">分享图片（og:image，建议 1200×630）</label>
                            <div style="display:flex;gap:8px;align-items:center">
                                <input class="form-input" v-model="data.seo.ogImage" placeholder="如：assets/seo/og.png 或 https://...">
                                <button class="btn btn-sm" @click="pickSeoOgImage">选择图片</button>
                            </div>
                            <div v-if="data.seo.ogImage" style="margin-top:8px;border:1px solid var(--border);border-radius:8px;overflow:hidden;max-width:280px;background:#fff">
                                <img :src="resolveSeoImage(data.seo.ogImage)" alt="og-image" style="display:block;width:100%;max-height:150px;object-fit:contain">
                            </div>
                        </div>
                        <div style="display:flex;gap:12px;flex-wrap:wrap">
                            <div class="form-group" style="flex:1;min-width:200px">
                                <label class="form-label">页面类型（og:type）</label>
                                <select class="form-input" v-model="data.seo.ogType">
                                    <option value="website">website（网站首页）</option>
                                    <option value="article">article（文章）</option>
                                    <option value="profile">profile（个人主页）</option>
                                </select>
                            </div>
                            <div class="form-group" style="flex:1;min-width:200px">
                                <label class="form-label">站点名称（og:site_name）</label>
                                <input class="form-input" v-model="data.seo.ogSiteName" placeholder="如：XX 网址导航">
                            </div>
                            <div class="form-group" style="flex:1;min-width:200px">
                                <label class="form-label">语言（og:locale）</label>
                                <select class="form-input" v-model="data.seo.ogLocale">
                                    <option value="zh_CN">中文（简体）zh_CN</option>
                                    <option value="zh_TW">中文（繁体）zh_TW</option>
                                    <option value="en_US">English (US) en_US</option>
                                    <option value="ja_JP">日本語 ja_JP</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <!-- ===== 3. Twitter Card ===== -->
                    <div class="seo-section">
                        <div class="seo-section-title" style="display:flex;align-items:center;gap:8px">
                            <i class="fab fa-twitter"></i> Twitter Card
                            <label style="margin-left:auto;display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;font-weight:400">
                                <input type="checkbox" v-model="data.seo.twitterEnabled"> 启用
                            </label>
                        </div>
                        <div style="display:flex;gap:12px;flex-wrap:wrap">
                            <div class="form-group" style="flex:1;min-width:200px">
                                <label class="form-label">卡片类型</label>
                                <select class="form-input" v-model="data.seo.twitterCard">
                                    <option value="summary">summary（小图摘要）</option>
                                    <option value="summary_large_image">summary_large_image（大图摘要）</option>
                                </select>
                            </div>
                            <div class="form-group" style="flex:1;min-width:200px">
                                <label class="form-label">分享标题</label>
                                <input class="form-input" v-model="data.seo.twitterTitle" placeholder="留空则使用页面标题">
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">分享描述</label>
                            <textarea class="form-input" rows="2" v-model="data.seo.twitterDescription" placeholder="留空则使用页面描述"></textarea>
                        </div>
                        <div class="form-group">
                            <label class="form-label">分享图片（twitter:image）</label>
                            <input class="form-input" v-model="data.seo.twitterImage" placeholder="留空则使用 og:image">
                        </div>
                    </div>

                    <!-- ===== 4. 站点验证 ===== -->
                    <div class="seo-section">
                        <div class="seo-section-title"><i class="fas fa-shield-alt"></i> 站点验证（Search Console / 站长平台）</div>
                        <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px">填写验证码后，会自动生成对应的 meta 标签与验证文件（google*.html / baidu_verify_*.html 等），部署后即可通过平台验证。</div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                            <div class="form-group" style="margin:0">
                                <label class="form-label">Google（google-site-verification）</label>
                                <input class="form-input" v-model="data.seo.verification.google" placeholder="如：AbCdEf123456">
                            </div>
                            <div class="form-group" style="margin:0">
                                <label class="form-label">Bing（msvalidate.01）</label>
                                <input class="form-input" v-model="data.seo.verification.bing" placeholder="如：1234567890ABCDEF">
                            </div>
                            <div class="form-group" style="margin:0">
                                <label class="form-label">百度（baidu-site-verification）</label>
                                <input class="form-input" v-model="data.seo.verification.baidu" placeholder="如：code-abcdef">
                            </div>
                            <div class="form-group" style="margin:0">
                                <label class="form-label">Yandex（yandex-verification）</label>
                                <input class="form-input" v-model="data.seo.verification.yandex" placeholder="如：1234567890abcdef">
                            </div>
                            <div class="form-group" style="margin:0">
                                <label class="form-label">搜狗（sogou_site_verification）</label>
                                <input class="form-input" v-model="data.seo.verification.sogou" placeholder="如：abcdefgh">
                            </div>
                            <div class="form-group" style="margin:0">
                                <label class="form-label">神马（shenma-site-verification）</label>
                                <input class="form-input" v-model="data.seo.verification.shenma" placeholder="如：abcdefgh">
                            </div>
                            <div class="form-group" style="margin:0">
                                <label class="form-label">360（360-site-verification）</label>
                                <input class="form-input" v-model="data.seo.verification.qihoo" placeholder="如：abcdefgh">
                            </div>
                        </div>
                    </div>

                    <!-- ===== 5. 结构化数据 JSON-LD ===== -->
                    <div class="seo-section">
                        <div class="seo-section-title" style="display:flex;align-items:center;gap:8px">
                            <i class="fas fa-code-branch"></i> 结构化数据（JSON-LD）
                            <label style="margin-left:auto;display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;font-weight:400">
                                <input type="checkbox" v-model="data.seo.structuredDataEnabled"> 启用
                            </label>
                        </div>
                        <div style="display:flex;gap:12px;flex-wrap:wrap">
                            <div class="form-group" style="flex:1;min-width:200px">
                                <label class="form-label">主体类型</label>
                                <select class="form-input" v-model="data.seo.sdType">
                                    <option value="WebSite">WebSite（网站）</option>
                                    <option value="Organization">Organization（组织/公司）</option>
                                    <option value="Person">Person（个人）</option>
                                </select>
                            </div>
                            <div class="form-group" style="flex:1;min-width:200px">
                                <label class="form-label">主体名称</label>
                                <input class="form-input" v-model="data.seo.sdName" placeholder="留空则使用站点标题">
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">主体 URL</label>
                            <input class="form-input" v-model="data.seo.sdUrl" placeholder="留空则使用站点地址">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Logo（路径或完整地址）</label>
                            <input class="form-input" v-model="data.seo.sdLogo" placeholder="如：assets/seo/logo.png">
                        </div>
                        <div class="form-group">
                            <label class="form-label">描述</label>
                            <textarea class="form-input" rows="2" v-model="data.seo.sdDescription" placeholder="结构化数据中的主体描述"></textarea>
                        </div>
                        <div class="form-group">
                            <label class="form-label">同站链接（sameAs，每行一个）</label>
                            <textarea class="form-input" rows="2" v-model="data.seo.sdSameAs" placeholder="https://weibo.com/xxx&#10;https://github.com/xxx"></textarea>
                        </div>
                    </div>

                    <!-- ===== 6. 高级 ===== -->
                    <div class="seo-section">
                        <div class="seo-section-title"><i class="fas fa-cog"></i> 高级</div>
                        <div class="form-group">
                            <label class="form-label">Canonical URL（权威地址）</label>
                            <input class="form-input" v-model="data.seo.canonicalUrl" placeholder="留空则使用站点地址">
                            <div class="setting-hint">用于避免重复内容，通常与站点地址一致。</div>
                        </div>
                        <div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:12px">
                            <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
                                <input type="checkbox" v-model="data.seo.generateRobots"> 部署时生成 robots.txt
                            </label>
                            <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
                                <input type="checkbox" v-model="data.seo.generateSitemap"> 部署时生成 sitemap.xml
                            </label>
                        </div>
                        <div v-if="data.seo.generateRobots" class="form-group">
                            <label class="form-label">robots.txt 规则</label>
                            <div v-for="(r, i) in data.seo.robotsRules" :key="i" style="display:flex;gap:8px;align-items:center;margin-bottom:8px;padding:8px;background:var(--bg-soft);border-radius:8px">
                                <input class="form-input" v-model="r.userAgent" placeholder="User-agent（如 *）" style="flex:1;min-width:110px">
                                <input class="form-input" v-model="r.disallow" placeholder="Disallow（如 /admin/）" style="flex:1;min-width:120px">
                                <input class="form-input" v-model="r.allow" placeholder="Allow（如 /）" style="flex:1;min-width:100px">
                                <button class="btn-icon" @click="removeSeoRobotsRule(i)" title="删除该规则"><i class="fas fa-trash" style="color:var(--danger)"></i></button>
                            </div>
                            <button class="btn btn-sm" @click="addSeoRobotsRule"><i class="fas fa-plus"></i> 添加规则</button>
                        </div>
                        <div class="form-group">
                            <label class="form-label">自定义 &lt;head&gt; 代码</label>
                            <textarea class="form-input" rows="3" v-model="data.seo.customHead" placeholder="如：&lt;meta name=&quot;baidu-site-verification&quot; content=&quot;xxx&quot; /&gt;&#10;&lt;script&gt;...&lt;/script&gt;"></textarea>
                            <div class="setting-hint">原样插入所有页面的 &lt;/head&gt; 前；请确保代码合法。</div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn" @click="modal.seo = false">取消</button>
                    <button class="btn btn-primary" @click="saveSeoConfig"><i class="fas fa-save"></i> 保存</button>
                </div>
            </div>
        </div>

        <!-- 广告位配置弹窗 -->
        <div v-if="modal.adSlots" class="modal-overlay">
            <div class="modal" style="max-width:760px">
                <div class="modal-header">
                    <h3><i class="fas fa-rectangle-ad"></i> 🔥 广告位配置</h3>
                    <button class="btn-icon" @click="modal.adSlots = false"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <!-- 总开关 -->
                    <div class="form-group" style="display:flex;align-items:center;gap:8px">
                        <label class="form-label" style="margin:0;font-weight:600">启用广告位</label>
                        <div style="position:relative;display:inline-block;width:42px;height:22px;cursor:pointer" @click="data.adSlots.enabled = !data.adSlots.enabled">
                            <span style="position:absolute;inset:0;background:#ccc;border-radius:22px;transition:.2s" :style="{background:data.adSlots.enabled?'#597ef7':'#ccc'}"></span>
                            <span style="position:absolute;top:2px;left:2px;width:18px;height:18px;background:#fff;border-radius:50%;transition:.2s;box-shadow:0 1px 3px rgba(0,0,0,.2)" :style="{transform:data.adSlots.enabled?'translateX(20px)':'translateX(0)'}"></span>
                        </div>
                        <span style="font-size:12px;color:var(--text-muted)">关闭后访客页面不显示两侧广告</span>
                    </div>

                    <!-- 统一尺寸开关 -->
                    <div class="form-group" style="display:flex;align-items:center;gap:8px;margin-top:10px">
                        <label class="form-label" style="margin:0;font-weight:600">统一尺寸</label>
                        <div style="position:relative;display:inline-block;width:42px;height:22px;cursor:pointer" @click="data.adSlots.unifiedSize = !data.adSlots.unifiedSize">
                            <span style="position:absolute;inset:0;background:#ccc;border-radius:22px;transition:.2s" :style="{background:data.adSlots.unifiedSize?'#597ef7':'#ccc'}"></span>
                            <span style="position:absolute;top:2px;left:2px;width:18px;height:18px;background:#fff;border-radius:50%;transition:.2s;box-shadow:0 1px 3px rgba(0,0,0,.2)" :style="{transform:data.adSlots.unifiedSize?'translateX(20px)':'translateX(0)'}"></span>
                        </div>
                        <span style="font-size:12px;color:var(--text-muted)">开启后所有广告位使用同一尺寸；关闭后每个广告位可单独设置</span>
                    </div>

                    <!-- 统一尺寸：全局尺寸输入（仅开启时显示） -->
                    <div v-if="data.adSlots.unifiedSize" class="form-group" style="display:flex;align-items:center;gap:10px;margin-top:8px;padding:10px 12px;background:var(--bg-soft);border-radius:8px;flex-wrap:wrap">
                        <span style="font-size:13px;font-weight:600"><i class="fas fa-vector-square"></i> 全局尺寸</span>
                        <label style="display:flex;align-items:center;gap:6px;font-size:12px">宽
                            <input class="form-input" :class="{'input-error': data.adSlots.width > (data.adSlots._limits?.maxWidth || 180)}" type="number" min="40" max="180" step="1" v-model.number="data.adSlots.width" style="width:72px;display:inline-block"> px
                        </label>
                        <label style="display:flex;align-items:center;gap:6px;font-size:12px">高
                            <input class="form-input" type="number" min="30" max="400" step="1" v-model.number="data.adSlots.height" style="width:72px;display:inline-block"> px
                        </label>
                        <span @click="if(data.adSlots._limits==null)data.adSlots._limits={maxWidth:180,suggestHeight:56}; data.adSlots._showLimits=!data.adSlots._showLimits"
                              style="font-size:11px;color:var(--text-muted);cursor:pointer;user-select:none"
                              title="点击调整阈值">
                            单个广告位尺寸，左右 8 格通用；宽≤{{ data.adSlots._limits?.maxWidth || 180 }}，高建议&lt;{{ data.adSlots._limits?.suggestHeight || 56 }}
                            <i class="fas" :class="data.adSlots._showLimits ? 'fa-chevron-up' : 'fa-chevron-down'" style="margin-left:2px;font-size:9px;opacity:.6"></i>
                        </span>
                        <!-- 阈值调节器（折叠面板） -->
                        <div v-if="data.adSlots._showLimits && data.adSlots._limits" style="display:flex;align-items:center;gap:6px;padding-top:6px;border-top:1px solid var(--border);width:100%;margin-top:2px">
                            <span style="font-size:11px;color:var(--text-muted)"><i class="fas fa-sliders-h" style="margin-right:2px"></i>阈值</span>
                            <label style="font-size:11px">宽上限<input class="form-input" type="number" min="40" max="600" step="1" v-model.number="data.adSlots._limits.maxWidth" style="width:52px;padding:2px 4px;display:inline-block;margin-left:2px"></label>
                            <label style="font-size:11px">高建议<input class="form-input" type="number" min="20" max="400" step="1" v-model.number="data.adSlots._limits.suggestHeight" style="width:52px;padding:2px 4px;display:inline-block;margin-left:2px"></label>
                            <span style="font-size:10px;color:var(--text-muted)">（改后输入框红蓝判定实时跟随）</span>
                        </div>
                    </div>

                    <div style="display:flex;gap:16px;margin-top:8px;flex-wrap:wrap">
                        <!-- 左侧 -->
                        <div style="flex:1;min-width:300px">
                            <div style="font-weight:600;font-size:13px;margin-bottom:8px;color:var(--primary)"><i class="fas fa-arrow-left"></i> 左侧广告位（4 个）</div>
                            <div class="ad-edit-grid">
                                <template v-for="(slot, idx) in data.adSlots.left" :key="slot.id">
                                    <div class="ad-edit-slot" :class="{active: slot.type !== 'none'}">
                                        <div class="ad-edit-slot-head">
                                            <span class="ad-edit-idx">广告位 {{ idx + 1 }}</span>
                                            <div class="ad-slot-toggle" :class="{ on: slot.type === 'image' }" @click="slot.type = slot.type === 'image' ? 'none' : 'image'" title="开关广告位">
                                                <span class="ad-slot-toggle__track"></span>
                                                <span class="ad-slot-toggle__thumb"></span>
                                            </div>
                                        </div>

                                        <!-- 独立尺寸（仅非统一模式显示） -->
                                        <div v-if="!data.adSlots.unifiedSize" style="display:flex;align-items:center;gap:4px;margin-top:6px;flex-wrap:wrap">
                                            <span style="font-size:11px;color:var(--text-muted)">尺寸</span>
                                            <label style="font-size:11px">宽<input class="form-input" :class="{'input-error': slot.width > (data.adSlots._limits?.maxWidth || 180)}" type="number" min="40" max="180" step="1" v-model.number="slot.width" style="width:52px;padding:2px 4px;display:inline-block;margin:0 2px"></label>
                                            <label style="font-size:11px">高<input class="form-input" type="number" min="30" max="400" step="1" v-model.number="slot.height" style="width:52px;padding:2px 4px;display:inline-block;margin-left:2px"></label>
                                            <span style="font-size:10px;color:var(--text-muted)">px (宽≤{{ data.adSlots._limits?.maxWidth || 180 }}, 高建议&lt;{{ data.adSlots._limits?.suggestHeight || 56 }})</span>
                                        </div>

                                        <!-- 预览区：开启/关闭都显示预览，保持卡片高度一致；关闭时仍可查看已上传图片 -->
                                        <div style="margin-top:6px">
                                            <div v-if="slot.type === 'image'" @click="openAdImageCropper('left', idx)"
                                                 style="border-radius:6px;overflow:hidden;height:60px;background:#e2e8f0;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .15s"
                                                 @mouseenter="$event.currentTarget.style.background='#cbd5e1'"
                                                 @mouseleave="$event.currentTarget.style.background='#e2e8f0'">
                                                <img v-if="slot.image" :src="slot.image" class="ad-img" :class="slot.blink ? ('ad-blink-left-' + idx) : ''" :style="{ width:'100%', height:'100%', objectFit:(slot.fit||'contain'), pointerEvents:'none' }">
                                                <i v-else class="fas fa-image" style="color:#94a3b8;font-size:18px"></i>
                                            </div>
                                            <div v-else
                                                 style="position:relative;border-radius:6px;overflow:hidden;height:60px;background:#e2e8f0;display:flex;align-items:center;justify-content:center;cursor:not-allowed;opacity:.85">
                                                <img v-if="slot.image" :src="slot.image" :style="{ width:'100%', height:'100%', objectFit:(slot.fit||'contain'), pointerEvents:'none', opacity:.6 }">
                                                <i v-else class="fas fa-image" style="color:#94a3b8;font-size:18px"></i>
                                                <div v-if="slot.image" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.25)">
                                                    <span style="font-size:11px;color:#64748b;background:rgba(255,255,255,.75);padding:2px 8px;border-radius:10px">已关闭</span>
                                                </div>
                                            </div>
                                        </div>


                                    </div>
                                </template>
                            </div>
                        </div>

                        <!-- 右侧 -->
                        <div style="flex:1;min-width:300px">
                            <div style="font-weight:600;font-size:13px;margin-bottom:8px;color:var(--primary)">右侧广告位（4 个）<i class="fas fa-arrow-right"></i></div>
                            <div class="ad-edit-grid">
                                <template v-for="(slot, idx) in data.adSlots.right" :key="slot.id">
                                    <div class="ad-edit-slot" :class="{active: slot.type !== 'none'}">
                                        <div class="ad-edit-slot-head">
                                            <span class="ad-edit-idx">广告位 {{ idx + 1 }}</span>
                                            <div class="ad-slot-toggle" :class="{ on: slot.type === 'image' }" @click="slot.type = slot.type === 'image' ? 'none' : 'image'" title="开关广告位">
                                                <span class="ad-slot-toggle__track"></span>
                                                <span class="ad-slot-toggle__thumb"></span>
                                            </div>
                                        </div>

                                        <!-- 独立尺寸（仅非统一模式显示） -->
                                        <div v-if="!data.adSlots.unifiedSize" style="display:flex;align-items:center;gap:4px;margin-top:6px;flex-wrap:wrap">
                                            <span style="font-size:11px;color:var(--text-muted)">尺寸</span>
                                            <label style="font-size:11px">宽<input class="form-input" :class="{'input-error': slot.width > (data.adSlots._limits?.maxWidth || 180)}" type="number" min="40" max="180" step="1" v-model.number="slot.width" style="width:52px;padding:2px 4px;display:inline-block;margin:0 2px"></label>
                                            <label style="font-size:11px">高<input class="form-input" type="number" min="30" max="400" step="1" v-model.number="slot.height" style="width:52px;padding:2px 4px;display:inline-block;margin-left:2px"></label>
                                            <span style="font-size:10px;color:var(--text-muted)">px (宽≤{{ data.adSlots._limits?.maxWidth || 180 }}, 高建议&lt;{{ data.adSlots._limits?.suggestHeight || 56 }})</span>
                                        </div>

                                        <!-- 预览区：开启/关闭都显示预览，保持卡片高度一致；关闭时仍可查看已上传图片 -->
                                        <div style="margin-top:6px">
                                            <div v-if="slot.type === 'image'" @click="openAdImageCropper('right', idx)"
                                                 style="border-radius:6px;overflow:hidden;height:60px;background:#e2e8f0;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .15s"
                                                 @mouseenter="$event.currentTarget.style.background='#cbd5e1'"
                                                 @mouseleave="$event.currentTarget.style.background='#e2e8f0'">
                                                <img v-if="slot.image" :src="slot.image" class="ad-img" :class="slot.blink ? ('ad-blink-right-' + idx) : ''" :style="{ width:'100%', height:'100%', objectFit:(slot.fit||'contain'), pointerEvents:'none' }">
                                                <i v-else class="fas fa-image" style="color:#94a3b8;font-size:18px"></i>
                                            </div>
                                            <div v-else
                                                 style="position:relative;border-radius:6px;overflow:hidden;height:60px;background:#e2e8f0;display:flex;align-items:center;justify-content:center;cursor:not-allowed;opacity:.85">
                                                <img v-if="slot.image" :src="slot.image" :style="{ width:'100%', height:'100%', objectFit:(slot.fit||'contain'), pointerEvents:'none', opacity:.6 }">
                                                <i v-else class="fas fa-image" style="color:#94a3b8;font-size:18px"></i>
                                                <div v-if="slot.image" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.25)">
                                                    <span style="font-size:11px;color:#64748b;background:rgba(255,255,255,.75);padding:2px 8px;border-radius:10px">已关闭</span>
                                                </div>
                                            </div>
                                        </div>


                                    </div>
                                </template>
                            </div>
                        </div>
                    </div>


                    <div v-if="!data.adSlots.enabled" style="margin-top:12px;padding:16px;text-align:center;color:var(--text-muted);font-size:13px">
                        开启上方开关后，可分别配置左/右两侧各 4 个广告位（共 8 个），支持图片/GIF，并可对图片叠加透明度闪烁效果。
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn" @click="modal.adSlots = false">完成</button>
                </div>
            </div>
        </div>

        <!-- 未保存提醒弹窗 -->
        <div v-if="modal.unsavedAlert" class="modal-overlay" style="z-index:10000">
            <div class="modal" style="max-width:420px">
                <div class="modal-header">
                    <h3 style="display:flex;align-items:center;gap:8px;color:#e65100">
                        <i class="fas fa-exclamation-triangle"></i>
                        <span>未保存的修改</span>
                    </h3>
                </div>
                <div class="modal-body" style="text-align:center;padding:24px">
                    <p style="font-size:14px;color:var(--text);margin-bottom:8px">您还没有保存，刷新会导致数据丢失</p>
                    <p style="font-size:12px;color:var(--text-muted)">建议先保存再刷新</p>
                </div>
                <div class="modal-footer" style="justify-content:space-between">
                    <button class="btn" @click="unsavedDirectRefresh" style="flex:1;margin-right:8px">
                        <i class="fas fa-sync-alt"></i> 直接刷新
                    </button>
                    <button class="btn btn-primary" @click="unsavedSaveAndRefresh" style="flex:1;margin-left:8px">
                        <i class="fas fa-save"></i> 保存并刷新
                    </button>
                </div>
            </div>
        </div>

        <!-- 无历史版本时保存确认弹窗 -->
        <div v-if="modal.noVersionConfirm" class="modal-overlay" style="z-index:10000">
            <div class="modal" style="max-width:420px">
                <div class="modal-header">
                    <h3 style="display:flex;align-items:center;gap:8px;color:#4f6df5">
                        <i class="fas fa-history"></i>
                        <span>新建历史版本</span>
                    </h3>
                </div>
                <div class="modal-body" style="text-align:center;padding:24px">
                    <p style="font-size:14px;color:var(--text);margin-bottom:8px">当前站点下没有历史版本，是否新建历史版本？</p>
                    <p style="font-size:12px;color:var(--text-muted)">保存后将创建第一个版本快照</p>
                </div>
                <div class="modal-footer" style="justify-content:space-between">
                    <button class="btn" @click="modal.noVersionConfirm = false" style="flex:1;margin-right:8px">
                        <i class="fas fa-times"></i> 取消
                    </button>
                    <button class="btn btn-primary" @click="confirmNoVersionCreate" style="flex:1;margin-left:8px">
                        <i class="fas fa-plus"></i> 新建并保存
                    </button>
                </div>
            </div>
        </div>

        <!-- 通用删除确认弹窗（替代浏览器 confirm） -->
        <div v-if="modal.confirm" class="modal-overlay">
            <div class="modal" style="max-width:440px">
                <div class="modal-header">
                    <h3>
                        <i :class="confirmDialog.icon" :style="'color:' + (confirmDialog.danger ? 'var(--danger)' : 'var(--warning)') + ';margin-right:6px'"></i>
                        {{ confirmDialog.title }}
                    </h3>
                    <button class="btn-icon" @click="closeConfirmDialog"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <p style="font-size:14px;line-height:1.6;margin:0 0 10px;color:var(--text)">{{ confirmDialog.message }}</p>
                    <div v-if="confirmDialog.note" class="confirm-dialog-note">
                        <i class="fas fa-info-circle"></i>
                        <span>{{ confirmDialog.note }}</span>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn" @click="closeConfirmDialog">取消</button>
                    <button class="btn btn-danger" @click="runConfirmAction">{{ confirmDialog.confirmText }}</button>
                </div>
            </div>
        </div>

        <!-- Toast 通知 -->
        <div class="toast-container">
            <div v-for="toast in toasts.filter(t => !t.center)" :key="toast.id" class="toast" :class="toast.type">
                <i :class="'fas ' + toast.icon"></i>
                <span>{{ toast.msg }}</span>
            </div>
        </div>
        <!-- 居中 Toast（屏幕中间靠下，用于红色重要提示） -->
        <div class="toast-container-center">
            <div v-for="toast in toasts.filter(t => t.center)" :key="toast.id" class="toast toast-center-item" :class="toast.type">
                <i :class="'fas ' + toast.icon"></i>
                <span>{{ toast.msg }}</span>
            </div>
        </div>
    </div>
    `;
