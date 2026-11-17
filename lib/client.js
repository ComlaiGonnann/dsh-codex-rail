(function () {
  function factory(require) {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    // 全局唯一 ID，避免热重载或重复挂载产生残留节点
    const STYLE_ID = "dsh-codex-sidebar-style";
    const RAIL_ID = "dsh-codex-sidebar-rail";
    const TOOLS_BOX_ID = "dsh-codex-sidebar-tools";
    const TITLE_NAV_ID = "dsh-codex-titlebar-nav";
    const BACK_BTN_ID = "dsh-codex-btn-back";
    const FWD_BTN_ID = "dsh-codex-btn-forward";
    const TITLE_TOGGLE_ID = "dsh-codex-btn-title-toggle";
    const RAIL_TOGGLE_ID = "dsh-codex-btn-rail-toggle";
    const RAIL_NEW_BTN_ID = "dsh-codex-btn-rail-new";
    const HOME_BTN_ID = "dsh-codex-btn-home";
    const SETTINGS_SLOT_ID = "dsh-codex-settings-slot";
    const TOOLTIP_ID = "dsh-codex-floating-tooltip";

    let pluginCtx = null;
    let historyInited = false;
    let cleanupHistory = null;

    // 自动探测 DSH CSS Module 前缀（版本升级后前缀哈希变化仍能自动兼容）
    let SB = "wtg9ga";
    let AF = "mP3x-q";
    let injectedSB = null;
    let injectedAF = null;

    function detectPrefixes() {
      let changed = false;
      try {
        const r = document.querySelector('[class*="_regionArea"]');
        const m = r && /(?:^|\s)([A-Za-z0-9-]+)_regionArea(?:\s|$)/.exec(r.className);
        if (m && m[1] !== SB) {
          SB = m[1];
          changed = true;
        }
        const c = document.querySelector('[class*="_sidebarCol"]');
        const n = c && /(?:^|\s)([A-Za-z0-9_-]+?)_sidebarCol(?:\s|$)/.exec(c.className);
        if (n && n[1] !== AF) {
          AF = n[1];
          changed = true;
        }
      } catch (e) {}
      return changed;
    }

    function getSidebarRoot() {
      return document.querySelector('.' + SB + '_root') ||
             document.querySelector('._2H3hWW_root') ||
             document.querySelector('.' + AF + '_sidebarCol > div') ||
             document.querySelector('.mP3x-q_sidebarCol > div') ||
             document.querySelector('.BynINW_sidebarCol > div');
    }

    // 还原原生 settingsArea 至工作区底部，避免卸载/重载破坏 React 节点树
    function restoreNativeSettingsArea() {
      try {
        const settingsSlot = document.getElementById(SETTINGS_SLOT_ID);
        const originSettingsArea = settingsSlot?.querySelector(
          '.' + SB + '_settingsArea, ._2H3hWW_settingsArea, .wtg9ga_settingsArea, [data-slot="sidebar.settings"]'
        );
        if (originSettingsArea) {
          const settingsBtn = originSettingsArea.querySelector('button');
          if (settingsBtn) {
            settingsBtn.classList.remove("dsh-codex-action-btn");
            settingsBtn.removeAttribute("data-tooltip");
          }
          const root = getSidebarRoot();
          const footArea = root?.querySelector('.' + SB + '_footArea, ._2H3hWW_footArea, .wtg9ga_footArea');
          if (footArea) {
            footArea.appendChild(originSettingsArea);
          } else if (root) {
            root.appendChild(originSettingsArea);
          }
        }
      } catch (e) {}
    }

    function wipeAllZombies() {
      try {
        if (window.__DSH_CODEX_CLEANUP__) {
          window.__DSH_CODEX_CLEANUP__();
        }
      } catch (e) {}
      try {
        if (typeof cleanupHistory === "function") {
          cleanupHistory();
        }
      } catch (e) {}
      cleanupHistory = null;
      historyInited = false;
      restoreNativeSettingsArea();
      try {
        document.getElementById(TITLE_NAV_ID)?.remove();
        document.getElementById(RAIL_ID)?.remove();
        document.getElementById(TOOLTIP_ID)?.remove();
        document.getElementById(STYLE_ID)?.remove();
        document.querySelectorAll('[id^="dsh-codex-"]:not(#' + SETTINGS_SLOT_ID + ')').forEach(el => el.remove());
        document.querySelectorAll(".dsh-codex-hide-source").forEach(el => el.classList.remove("dsh-codex-hide-source"));
      } catch (e) {}
    }

    try {
      wipeAllZombies();
    } catch (e) {}

    // 统一采用与 DSH 原生图标一致的单色细线 SVG（1.6~1.75px 描边，继承 currentColor）
    const SVG = {
      back: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>`,
      forward: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>`,
      toggle: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2.5"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>`,
      home: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5"></path><path d="M5 9.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V9.5"></path><path d="M9.5 20.5v-5.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v5.5"></path></svg>`,
      newChat: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z"></path></svg>`,
      memory: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"></path><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"></path><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"></path></svg>`,
      ext: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877l-1.568-1.568A2.402 2.402 0 0 1 1.998 12c0-.617.236-1.234.706-1.704L4.23 8.77c.24-.24.581-.353.917-.303.515.077.877.528 1.073 1.01a2.5 2.5 0 1 0 3.259-3.259c-.482-.196-.933-.558-1.01-1.073-.05-.336.062-.676.303-.917l1.525-1.525A2.402 2.402 0 0 1 12 2c.617 0 1.234.236 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.968a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02Z"></path></svg>`,
      trending: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline><polyline points="16 7 22 7 22 13"></polyline></svg>`,
      agy: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`,
      plugin: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="14" width="7" height="7" rx="1.5"></rect><rect x="3" y="14" width="7" height="7" rx="1.5"></rect></svg>`,
      tasks: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2.5"></rect><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line></svg>`,
      skills: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>`,
      more: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="12" cy="12" r="1.5"></circle><circle cx="19" cy="12" r="1.5"></circle><circle cx="5" cy="12" r="1.5"></circle></svg>`,
      recommendation: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"></path></svg>`,
      stats: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"></path><path d="M18 17V9"></path><path d="M13 17V5"></path><path d="M8 17v-3"></path></svg>`,
      worktree: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"></line><circle cx="18" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><path d="M18 9a9 9 0 0 1-9 9"></path></svg>`,
      subagent: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2.5"></rect><rect x="9" y="9" width="6" height="6" rx="1"></rect><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"></path></svg>`,
      share: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>`,
      patch: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="9" y1="13" x2="15" y2="13"></line><line x1="12" y1="10" x2="12" y2="16"></line></svg>`,
      upload: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>`,
      custom: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`
    };

    const BTN_STYLE_INLINE = [
      "display:inline-flex",
      "align-items:center",
      "justify-content:center",
      "width:36px",
      "height:36px",
      "min-width:36px",
      "min-height:36px",
      "border:none",
      "background:transparent",
      "cursor:pointer",
      "padding:0",
      "margin:0",
      "box-sizing:border-box",
      "position:relative",
      "-webkit-app-region:no-drag",
      "outline:none",
      "user-select:none"
    ].join(";");

    function injectCSS() {
      detectPrefixes();
      let style = document.getElementById(STYLE_ID);
      if (!style) {
        style = document.createElement("style");
        style.id = STYLE_ID;
        document.head.appendChild(style);
      }

      // 全量使用 DSH 原生 design tokens，不覆盖 AppFrame 网格、工作区宽度与拖动手柄，保留 100% 原生手感和左右自由拉伸
      style.textContent = (`
        :root {
          --codex-bar-w: 48px;
        }

        /* 1. 给主应用容器左侧让出 48px 活动栏空间；不覆盖背景色优先级以便壁纸引擎透明接管 */
        #root:not(:has([data-sidebar-drawer])) {
          padding-left: var(--codex-bar-w) !important;
          box-sizing: border-box !important;
          background: var(--dsw-specific-sidebar-fill);
        }

        /* 窄屏抽屉模式下自动收起左栏让位，保留原生抽屉体验 */
        #root:has([data-sidebar-drawer]) #${RAIL_ID} {
          display: none !important;
        }

        /* Windows 标题栏左侧 0~48px 顶部补全窗口拖拽区域 */
        html[data-windows-titlebar]:not([data-fullscreen]) #root::before {
          content: "";
          position: fixed;
          top: 0;
          left: 0;
          width: var(--codex-bar-w);
          height: var(--dsh-windows-titlebar-height, 40px);
          -webkit-app-region: drag;
          pointer-events: none;
          z-index: 1;
        }

        /* 2. Windows 标题栏导航控件 (← → ◫) 与原生菜单对齐 (按钮 28x28，菜单固定起点 104px) */
        html[data-windows-titlebar]:not([data-fullscreen]),
        html[data-windows-titlebar]:not([data-fullscreen]):has([data-sidebar-collapsed]) {
          --dsh-windows-menu-start: 104px !important;
        }

        #${TITLE_NAV_ID} {
          position: fixed;
          top: calc((var(--dsh-windows-titlebar-height, 40px) - 28px) / 2);
          left: 10px;
          height: 28px;
          display: none;
          align-items: center;
          gap: 2px;
          z-index: 1100;
          -webkit-app-region: no-drag;
          pointer-events: auto;
          user-select: none;
        }

        html[data-windows-titlebar]:not([data-fullscreen]) #${TITLE_NAV_ID} {
          display: inline-flex;
        }

        .dsh-codex-title-btn {
          width: 28px;
          height: 28px;
          border-radius: var(--dsw-radius-sm, 6px);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          color: var(--dsw-alias-label-secondary);
          cursor: pointer;
          padding: 0;
          margin: 0;
          position: relative;
          -webkit-app-region: no-drag;
          outline: none;
          flex: none;
          transition: background 0.12s ease, color 0.12s ease, opacity 0.12s ease;
        }

        .dsh-codex-title-btn:hover:not(:disabled):not(.disabled) {
          background: var(--dsw-alias-interactive-bg-hover);
          color: var(--dsw-alias-label-primary);
        }

        .dsh-codex-title-btn:active:not(:disabled):not(.disabled) {
          transform: scale(0.94);
        }

        .dsh-codex-title-btn:disabled,
        .dsh-codex-title-btn.disabled {
          opacity: 0.32;
          cursor: default;
          pointer-events: none;
        }

        /* 在标准 Windows 标题栏下，原生 toggle 和折叠态 newSession 由标题栏/活动栏接管，移出可视区但保持可触发 */
        html[data-windows-titlebar]:not([data-fullscreen]) .wtg9ga_toggle,
        html[data-windows-titlebar]:not([data-fullscreen]) ._2H3hWW_toggle {
          position: fixed !important;
          left: -9999px !important;
          top: -9999px !important;
          width: 1px !important;
          height: 1px !important;
          opacity: 0 !important;
          overflow: hidden !important;
        }

        html[data-windows-titlebar]:not([data-fullscreen]) .wtg9ga_collapsed .wtg9ga_newSession,
        html[data-windows-titlebar]:not([data-fullscreen]) ._2H3hWW_collapsed ._2H3hWW_newSession {
          position: fixed !important;
          left: -9999px !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }

        /* 3. 左侧独立 48px 原生感活动栏 (Activity Bar) */
        #${RAIL_ID} {
          position: fixed;
          left: 0;
          top: var(--dsh-frame-chrome-top, 0px);
          bottom: 0;
          width: var(--codex-bar-w);
          background: transparent;
          border-right: 0.5px solid var(--dsw-alias-border-l3);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          align-items: center;
          padding: 6px 0;
          box-sizing: border-box;
          z-index: 25;
          -webkit-app-region: no-drag;
          user-select: none;
          transition: border-color 0.2s ease;
        }

        /* 侧边栏折叠到 0px 时，隐藏活动栏右分割线，让右侧对话区的 16px 原生圆角直接紧贴活动栏 */
        html:has(.mP3x-q_frame[data-sidebar-collapsed]) #${RAIL_ID},
        html:has(.BynINW_frame[data-sidebar-collapsed]) #${RAIL_ID},
        html:has(.wtg9ga_collapsed) #${RAIL_ID},
        body[data-we-sidebar-fullclear] #${RAIL_ID} {
          border-right-color: transparent !important;
        }

        /* 适配 Wallpaper Engine 左侧栏液态玻璃 */
        body[data-we-left-sidebar]:not([data-we-sidebar-fullclear]) #${RAIL_ID} {
          backdrop-filter: blur(var(--we-left-sidebar-blur, var(--we-sidebar-blur, var(--we-blur, 16px))))
                           saturate(var(--we-sidebar-saturate, var(--we-saturate, 1.8)));
          -webkit-backdrop-filter: blur(var(--we-left-sidebar-blur, var(--we-sidebar-blur, var(--we-blur, 16px))))
                                   saturate(var(--we-sidebar-saturate, var(--we-saturate, 1.8)));
        }

        /* 壁纸模式下配合清透底板 */
        body[data-we-wallpaper] #root,
        body:has(#dsh-wallpaper-engine-layer) #root,
        body:has(.we-layer) #root {
          background: transparent !important;
        }

        #dsh-codex-top-group {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 100%;
          gap: 4px;
        }

        #${TOOLS_BOX_ID} {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 100%;
          gap: 4px;
          max-height: calc(100vh - 200px);
          overflow-y: auto;
          overflow-x: hidden;
          scrollbar-width: none;
        }
        #${TOOLS_BOX_ID}::-webkit-scrollbar {
          display: none;
        }

        #dsh-codex-bot-group {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-end;
          width: 100%;
          gap: 4px;
          box-sizing: border-box;
        }

        .dsh-codex-rail-sep {
          width: 20px;
          height: 0.5px;
          background: var(--dsw-alias-border-l3);
          margin: 4px 0;
          flex: none;
        }

        /* 全屏或非 Windows 标题栏环境下，在活动栏顶部显示收展按钮以便鼠标随时控制 */
        #${RAIL_TOGGLE_ID} {
          display: none !important;
        }
        html[data-fullscreen] #${RAIL_TOGGLE_ID},
        html:not([data-windows-titlebar]) #${RAIL_TOGGLE_ID} {
          display: inline-flex !important;
        }

        /* 仅当工作区收起后，在活动栏显示新建会话入口；展开时直接用工作区原生按钮，避免重复 */
        #${RAIL_NEW_BTN_ID} {
          display: none !important;
        }
        html:has(.mP3x-q_frame[data-sidebar-collapsed]) #${RAIL_NEW_BTN_ID},
        html:has(.BynINW_frame[data-sidebar-collapsed]) #${RAIL_NEW_BTN_ID},
        html:has(.wtg9ga_collapsed) #${RAIL_NEW_BTN_ID} {
          display: inline-flex !important;
        }

        /* 4. 活动栏按钮：完全遵循 DSH SidebarRoot.module.css 原生 36x36px + var(--dsw-radius-md) 规范 */
        .dsh-codex-action-btn {
          position: relative;
          width: 36px;
          height: 36px;
          min-width: 36px;
          min-height: 36px;
          border-radius: var(--dsw-radius-md, 10px) !important;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          color: var(--dsw-alias-label-secondary);
          cursor: pointer;
          padding: 0;
          margin: 0;
          transition: background 0.14s ease, color 0.14s ease, transform 0.1s ease;
          outline: none;
          flex: none;
        }

        .dsh-codex-action-btn:hover {
          background: var(--dsw-alias-interactive-bg-hover) !important;
          color: var(--dsw-alias-label-primary) !important;
        }

        .dsh-codex-action-btn:active {
          transform: scale(0.95);
        }

        .dsh-codex-action-btn.active {
          background: var(--dsw-specific-sidebar-nav-item-active, var(--dsw-alias-interactive-bg-active, var(--dsw-alias-interactive-bg-hover))) !important;
          color: var(--dsw-alias-label-primary) !important;
        }

        .dsh-codex-action-btn:focus-visible {
          outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
          outline-offset: -2px;
        }

        .dsh-codex-action-btn svg {
          flex: none;
          width: 18px;
          height: 18px;
        }

        /* 提示点与数字徽标（重置 corner-shape: round 避免 DSH 超椭圆变形） */
        .dsh-codex-dot {
          position: absolute;
          top: 6px;
          right: 6px;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          corner-shape: round;
          background: var(--dsw-alias-state-business-primary, #0066fe);
          border: 1.5px solid var(--dsw-specific-sidebar-fill, transparent);
          pointer-events: none;
          box-sizing: border-box;
        }

        .dsh-codex-badge {
          position: absolute;
          top: 2px;
          right: 2px;
          min-width: 14px;
          height: 14px;
          padding: 0 3.5px;
          border-radius: 999px;
          corner-shape: round;
          background: var(--dsw-alias-state-business-primary, #0066fe);
          color: var(--dsw-alias-label-primary-inverted, #ffffff);
          font-family: var(--dsw-font-family);
          font-size: 9px;
          font-weight: 600;
          line-height: 14px;
          text-align: center;
          box-sizing: border-box;
          pointer-events: none;
        }

        /* 悬浮气泡：统一由浮动节点承载，绝不会被活动栏滚动裁剪或左边界溢出 */
        #${TOOLTIP_ID} {
          position: fixed;
          background: var(--dsw-alias-tooltip-bg, var(--dsw-alias-bg-layer-3, rgba(24, 24, 28, 0.92)));
          color: var(--dsw-alias-tooltip-label, var(--dsw-alias-label-primary, #ffffff));
          border: 0.5px solid var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.12));
          box-shadow: var(--dsw-shadow-lv2, 0 4px 12px rgba(0, 0, 0, 0.18));
          font-family: var(--dsw-font-family);
          font-size: 12px;
          font-weight: 500;
          line-height: 16px;
          white-space: nowrap;
          padding: 4px 8px;
          border-radius: var(--dsw-radius-sm, 6px);
          pointer-events: none;
          opacity: 0;
          visibility: hidden;
          transition: opacity 0.1s ease;
          z-index: 2000;
        }

        #${TOOLTIP_ID}.visible {
          opacity: 1;
          visibility: visible;
        }

        /* 5. 底部账号/设置插槽：完全融入活动栏原生 36x36px 按钮规格，去除突兀边框阴影 */
        #${SETTINGS_SLOT_ID} {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          flex: none;
          margin: 0;
          padding: 0;
        }

        #${SETTINGS_SLOT_ID} .wtg9ga_settingsArea,
        #${SETTINGS_SLOT_ID} ._2H3hWW_settingsArea,
        #${SETTINGS_SLOT_ID} [class*="triggerRow"],
        #${SETTINGS_SLOT_ID} [data-slot="settings.launcher"],
        #${SETTINGS_SLOT_ID} [data-slot="sidebar.settings"],
        #${SETTINGS_SLOT_ID} [data-slot*="settings"],
        #${SETTINGS_SLOT_ID} .ET65mq_root,
        #${SETTINGS_SLOT_ID} .ET65mq_anchor {
          position: static !important;
          width: 36px !important;
          height: 36px !important;
          min-width: 36px !important;
          min-height: 36px !important;
          max-width: 36px !important;
          max-height: 36px !important;
          margin: 0 !important;
          padding: 0 !important;
          gap: 0 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          box-sizing: border-box !important;
          background: transparent !important;
          border: none !important;
          overflow: visible !important;
        }

        #${SETTINGS_SLOT_ID} [class*="indicator" i] {
          display: none !important;
        }

        #${SETTINGS_SLOT_ID} button {
          width: 36px !important;
          height: 36px !important;
          min-width: 36px !important;
          min-height: 36px !important;
          max-width: 36px !important;
          max-height: 36px !important;
          border-radius: var(--dsw-radius-md, 10px) !important;
          padding: 0 !important;
          margin: 0 !important;
          border: none !important;
          background: transparent !important;
          box-shadow: none !important;
          color: var(--dsw-alias-label-secondary) !important;
          cursor: pointer !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          font-size: 0 !important;
          gap: 0 !important;
          position: relative !important;
          transition: background 0.14s ease, color 0.14s ease !important;
        }

        #${SETTINGS_SLOT_ID} button:hover {
          background: var(--dsw-alias-interactive-bg-hover) !important;
          color: var(--dsw-alias-label-primary) !important;
        }

        #${SETTINGS_SLOT_ID} button [class*="label" i],
        #${SETTINGS_SLOT_ID} button span:not(:has(svg, img)):not([class*="avatar" i]) {
          display: none !important;
        }

        #${SETTINGS_SLOT_ID} button [class*="avatar" i] {
          width: 24px !important;
          height: 24px !important;
          min-width: 24px !important;
          min-height: 24px !important;
          border-radius: 50% !important;
          corner-shape: round !important;
          overflow: hidden !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          flex: none !important;
          pointer-events: none !important;
        }

        #${SETTINGS_SLOT_ID} button img {
          width: 24px !important;
          height: 24px !important;
          border-radius: 50% !important;
          corner-shape: round !important;
          object-fit: cover !important;
          display: block !important;
          pointer-events: none !important;
        }

        #${SETTINGS_SLOT_ID} button svg {
          width: 18px !important;
          height: 18px !important;
          display: block !important;
          color: inherit !important;
          pointer-events: none !important;
          flex: none !important;
        }

        /* 6. 仅隐藏已被迁移到左侧活动栏的原生插件面板列表；不破坏工作区内部其余所有原生 UI 和拖拽拉伸 */
        .wtg9ga_root .wtg9ga_panelList,
        ._2H3hWW_root ._2H3hWW_panelList,
        html[data-windows-titlebar] .wtg9ga_collapsed .wtg9ga_panelList,
        html[data-windows-titlebar] ._2H3hWW_collapsed ._2H3hWW_panelList {
          display: flex !important;
          position: fixed !important;
          left: 0 !important;
          top: 0 !important;
          width: 0 !important;
          height: 0 !important;
          overflow: visible !important;
          opacity: 0 !important;
          pointer-events: none !important;
          margin: 0 !important;
          padding: 0 !important;
          z-index: -1 !important;
        }

        .dsh-codex-hide-source:not([aria-haspopup="menu"]) {
          position: fixed !important;
          left: -9999px !important;
          top: -9999px !important;
          width: 1px !important;
          height: 1px !important;
          overflow: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
          margin: 0 !important;
          padding: 0 !important;
        }

        .dsh-codex-hide-source[aria-haspopup="menu"] {
          position: fixed !important;
          width: 36px !important;
          height: 36px !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
      `).split("wtg9ga_").join(SB + "_").split("mP3x-q_").join(AF + "_");
      injectedSB = SB;
      injectedAF = AF;
    }

    function toggleWorkspacePanel() {
      let layout = null;
      try {
        layout = pluginCtx?.layout ||
                 (typeof pluginCtx?.get === 'function' ? pluginCtx.get('layout') : null) ||
                 pluginCtx?.root?.layout ||
                 (typeof pluginCtx?.root?.get === 'function' ? pluginCtx.root.get('layout') : null);
      } catch (e) {}

      if (layout && typeof layout.toggleSidebar === 'function') {
        try {
          layout.toggleSidebar();
          return;
        } catch (e) {}
      }

      const nativeToggle = document.querySelector(
        'button.' + SB + '_toggle, button._2H3hWW_toggle, [data-sidebar-toggle], button[aria-label*="侧边栏"]'
      );
      if (nativeToggle && nativeToggle.id !== TITLE_TOGGLE_ID && nativeToggle.id !== RAIL_TOGGLE_ID) {
        try {
          nativeToggle.click();
          return;
        } catch (err) {}
      }
    }

    window.__DSH_CODEX_TOGGLE__ = toggleWorkspacePanel;

    function triggerNewSession() {
      try {
        const uiWs = pluginCtx?.get?.("uiWorkspace", false);
        if (uiWs && typeof uiWs.startSession === "function") {
          uiWs.startSession();
          return;
        }
      } catch (e) {}

      const newBtn = document.querySelector(
        'button.' + SB + '_newSession, button._2H3hWW_newSession, [data-slot="sidebar.session.action"] button, [aria-label*="新会话"], [aria-label*="新建会话"], [aria-label*="New session"]'
      );
      if (newBtn) {
        try {
          newBtn.click();
        } catch (e) {}
      }
    }

    // --- 路由与会话历史堆栈管理 (标题栏后退 / 前进) ---
    const navHistory = {
      stack: [],
      index: -1,
      isNavigating: false,
      currentSessionId: null,

      getOpenModalCloseBtn() {
        return document.querySelector(
          '.dsh-memory-modal-overlay [class*="close"], ' +
          '.dsh-ext-modal-overlay [class*="close"], ' +
          '.dsh-trending-modal-panel [class*="close"], ' +
          '[role="dialog"] button[aria-label*="关闭"], ' +
          '[role="dialog"] button[aria-label*="Close"], ' +
          '[role="dialog"] .close-button'
        );
      },

      hasOpenModal() {
        return Boolean(this.getOpenModalCloseBtn());
      },

      getCurrentSessionId() {
        try {
          const uiWs = pluginCtx?.get?.("uiWorkspace", false);
          const sid = uiWs?.selection?.getSnapshot?.()?.sessionId || uiWs?.mainReference?.sessionId;
          if (sid) return sid;
        } catch (e) {}

        try {
          const activeRow = document.querySelector(
            '[data-row-key^="session:"][aria-selected="true"], ' +
            '[role="treeitem"][aria-selected="true"][data-row-key^="session:"]'
          );
          if (activeRow) {
            const sid = activeRow.getAttribute("data-row-key")?.replace(/^session:/, '');
            if (sid) return sid;
          }
        } catch (e) {}

        try {
          const raw = window.localStorage?.getItem?.("dsh.sessions.current");
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed?.sessionId) return parsed.sessionId;
          }
        } catch (e) {}

        return null;
      },

      onSessionChanged(sessionId) {
        if (!sessionId) return;
        if (this.isNavigating) {
          this.currentSessionId = sessionId;
          this.updateUI();
          return;
        }
        if (this.currentSessionId === sessionId) return;

        if (this.stack.length === 0) {
          this.stack = [sessionId];
          this.index = 0;
          this.currentSessionId = sessionId;
          this.updateUI();
          return;
        }

        if (this.index >= 0 && this.stack[this.index] === sessionId) {
          this.currentSessionId = sessionId;
          this.updateUI();
          return;
        }

        this.stack = this.stack.slice(0, this.index + 1);
        this.stack.push(sessionId);
        this.index = this.stack.length - 1;
        this.currentSessionId = sessionId;
        this.updateUI();
      },

      canGoBack() {
        if (this.hasOpenModal()) return true;
        return this.index > 0;
      },

      canGoForward() {
        return this.index >= 0 && this.index < this.stack.length - 1;
      },

      back() {
        const modalClose = this.getOpenModalCloseBtn();
        if (modalClose) {
          try {
            modalClose.click();
            this.updateUI();
            return;
          } catch (e) {}
        }

        if (!this.canGoBack()) return;
        this.isNavigating = true;
        this.index--;
        const targetSid = this.stack[this.index];
        this.currentSessionId = targetSid;
        this.activateSession(targetSid);

        try { window.history.back(); } catch (e) {}

        setTimeout(() => {
          this.isNavigating = false;
          this.updateUI();
        }, 220);
        this.updateUI();
      },

      forward() {
        if (!this.canGoForward()) return;
        this.isNavigating = true;
        this.index++;
        const targetSid = this.stack[this.index];
        this.currentSessionId = targetSid;
        this.activateSession(targetSid);

        try { window.history.forward(); } catch (e) {}

        setTimeout(() => {
          this.isNavigating = false;
          this.updateUI();
        }, 220);
        this.updateUI();
      },

      activateSession(sessionId) {
        if (!sessionId) return false;
        try {
          const layout = pluginCtx?.get?.("layout", false) || pluginCtx?.layout;
          if (layout && typeof layout.selectPanel === "function") {
            layout.selectPanel(null);
          }
        } catch (e) {}

        try {
          const uiWs = pluginCtx?.get?.("uiWorkspace", false);
          if (uiWs && typeof uiWs.openSession === "function") {
            uiWs.openSession(sessionId);
            return true;
          }
        } catch (e) {}

        try {
          const row = document.querySelector(`[data-row-key="session:${sessionId}"]`);
          if (row) {
            row.scrollIntoView({ block: "nearest" });
            row.click();
            return true;
          }
        } catch (e) {}

        return false;
      },

      updateUI() {
        const backBtn = document.getElementById(BACK_BTN_ID);
        const fwdBtn = document.getElementById(FWD_BTN_ID);
        const hasBack = this.canGoBack();
        const hasFwd = this.canGoForward();

        if (backBtn) {
          backBtn.disabled = !hasBack;
          backBtn.classList.toggle("disabled", !hasBack);
        }
        if (fwdBtn) {
          fwdBtn.disabled = !hasFwd;
          fwdBtn.classList.toggle("disabled", !hasFwd);
        }
      }
    };

    function ensureFloatingTooltip() {
      let tip = document.getElementById(TOOLTIP_ID);
      if (!tip) {
        tip = document.createElement("div");
        tip.id = TOOLTIP_ID;
        document.body.appendChild(tip);
      }
      return tip;
    }

    function bindTooltipContainer(container, placement) {
      if (!container || container.__dshTipBound) return;
      container.__dshTipBound = true;

      const show = (e) => {
        const btn = e.target?.closest?.("[data-tooltip]");
        if (!btn || btn.disabled || btn.classList.contains("disabled")) return;
        const text = btn.getAttribute("data-tooltip");
        if (!text) return;

        const tip = ensureFloatingTooltip();
        tip.textContent = text;
        const rect = btn.getBoundingClientRect();
        tip.classList.add("visible");

        if (placement === "bottom") {
          const tipW = tip.offsetWidth || 64;
          const rawLeft = rect.left + rect.width / 2 - tipW / 2;
          tip.style.left = `${Math.max(8, Math.min(window.innerWidth - tipW - 8, rawLeft))}px`;
          tip.style.top = `${rect.bottom + 6}px`;
        } else {
          const tipH = tip.offsetHeight || 24;
          tip.style.left = `${rect.right + 8}px`;
          tip.style.top = `${Math.max(6, Math.round(rect.top + (rect.height - tipH) / 2))}px`;
        }
      };

      const hide = () => {
        const tip = document.getElementById(TOOLTIP_ID);
        if (tip) tip.classList.remove("visible");
      };

      container.addEventListener("pointerover", show, true);
      container.addEventListener("pointerout", (e) => {
        const fromBtn = e.target?.closest?.("[data-tooltip]");
        const toBtn = e.relatedTarget?.closest?.("[data-tooltip]");
        if (fromBtn && fromBtn !== toBtn) hide();
      }, true);
      container.addEventListener("pointerdown", hide, true);
    }

    function ensureTitleNav() {
      let nav = document.getElementById(TITLE_NAV_ID);
      if (!nav) {
        nav = document.createElement("div");
        nav.id = TITLE_NAV_ID;
        nav.setAttribute("data-window-drag-exclude", "");

        const backBtn = document.createElement("button");
        backBtn.id = BACK_BTN_ID;
        backBtn.type = "button";
        backBtn.className = "dsh-codex-title-btn disabled";
        backBtn.disabled = true;
        backBtn.setAttribute("data-tooltip", "后退 (Alt + ←)");
        backBtn.innerHTML = SVG.back;
        backBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          navHistory.back();
        });
        nav.appendChild(backBtn);

        const fwdBtn = document.createElement("button");
        fwdBtn.id = FWD_BTN_ID;
        fwdBtn.type = "button";
        fwdBtn.className = "dsh-codex-title-btn disabled";
        fwdBtn.disabled = true;
        fwdBtn.setAttribute("data-tooltip", "前进 (Alt + →)");
        fwdBtn.innerHTML = SVG.forward;
        fwdBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          navHistory.forward();
        });
        nav.appendChild(fwdBtn);

        const toggleBtn = document.createElement("button");
        toggleBtn.id = TITLE_TOGGLE_ID;
        toggleBtn.type = "button";
        toggleBtn.className = "dsh-codex-title-btn";
        toggleBtn.setAttribute("data-tooltip", "展开/收起侧边栏 (Ctrl + B)");
        toggleBtn.innerHTML = SVG.toggle;
        toggleBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleWorkspacePanel();
        });
        nav.appendChild(toggleBtn);

        document.body.appendChild(nav);
        bindTooltipContainer(nav, "bottom");
      } else {
        bindTooltipContainer(nav, "bottom");
      }

      navHistory.updateUI();
      return nav;
    }

    function initHistoryTracking() {
      if (historyInited) return;
      historyInited = true;

      const cur = navHistory.getCurrentSessionId();
      if (cur) navHistory.onSessionChanged(cur);

      let unsubWs = null;
      try {
        const tryBindUiWs = () => {
          const uiWs = pluginCtx?.get?.("uiWorkspace", false);
          if (uiWs?.selection && typeof uiWs.selection.subscribe === "function") {
            unsubWs = uiWs.selection.subscribe((snap) => {
              if (snap?.sessionId) navHistory.onSessionChanged(snap.sessionId);
            });
            return true;
          }
          return false;
        };

        if (!tryBindUiWs()) {
          const timer = setInterval(() => {
            if (tryBindUiWs()) clearInterval(timer);
          }, 300);
          setTimeout(() => clearInterval(timer), 8000);
        }
      } catch (e) {}

      const handleClick = (e) => {
        try {
          const row = e.target?.closest?.('[data-row-key^="session:"]');
          if (row) {
            const sid = row.getAttribute("data-row-key")?.replace(/^session:/, '');
            if (sid) navHistory.onSessionChanged(sid);
            return;
          }

          const newBtn = e.target?.closest?.(
            '._2H3hWW_newSession, .' + SB + '_newSession, [data-slot="sidebar.session.action"] button, [aria-label*="新会话"], [aria-label*="新建会话"], [aria-label*="New session"]'
          );
          if (newBtn) {
            setTimeout(() => {
              const newSid = navHistory.getCurrentSessionId();
              if (newSid) navHistory.onSessionChanged(newSid);
            }, 300);
          }
        } catch (err) {}
      };
      document.addEventListener("click", handleClick, true);

      const handleKeydown = (e) => {
        if (e.altKey && e.key === "ArrowLeft") {
          e.preventDefault();
          navHistory.back();
        } else if (e.altKey && e.key === "ArrowRight") {
          e.preventDefault();
          navHistory.forward();
        }
      };
      window.addEventListener("keydown", handleKeydown);

      cleanupHistory = () => {
        historyInited = false;
        if (unsubWs) {
          try { unsubWs(); } catch (e) {}
        }
        document.removeEventListener("click", handleClick, true);
        window.removeEventListener("keydown", handleKeydown);
      };
    }

    function ensureRail() {
      const mountParent = document.getElementById("root") || document.body;
      let rail = document.getElementById(RAIL_ID);
      if (!rail) {
        rail = document.createElement("div");
        rail.id = RAIL_ID;
        rail.setAttribute("data-window-drag-exclude", "");

        const topGroup = document.createElement("div");
        topGroup.id = "dsh-codex-top-group";

        // 全屏或非 Windows 顶栏模式时的折叠兜底按键
        const railToggleBtn = document.createElement("button");
        railToggleBtn.id = RAIL_TOGGLE_ID;
        railToggleBtn.type = "button";
        railToggleBtn.className = "dsh-codex-action-btn";
        railToggleBtn.style.cssText = BTN_STYLE_INLINE;
        railToggleBtn.setAttribute("data-tooltip", "展开/收起侧边栏 (Ctrl + B)");
        railToggleBtn.innerHTML = SVG.toggle;
        railToggleBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleWorkspacePanel();
        });
        topGroup.appendChild(railToggleBtn);

        // 主页/工作区按钮
        const homeBtn = document.createElement("button");
        homeBtn.id = HOME_BTN_ID;
        homeBtn.type = "button";
        homeBtn.className = "dsh-codex-action-btn active";
        homeBtn.style.cssText = BTN_STYLE_INLINE;
        homeBtn.setAttribute("data-tooltip", "主页与工作区");
        homeBtn.innerHTML = SVG.home;

        homeBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();

          try {
            const layout = pluginCtx?.get?.("layout", false) || pluginCtx?.layout;
            if (layout && typeof layout.selectPanel === "function") {
              layout.selectPanel(null);
            }
          } catch (err) {}

          const modalClose = navHistory.getOpenModalCloseBtn();
          if (modalClose) {
            try { modalClose.click(); } catch (err) {}
          }

          const rootEl = getSidebarRoot();
          const isCollapsed = Boolean(
            document.querySelector('.' + AF + '_frame[data-sidebar-collapsed], .mP3x-q_frame[data-sidebar-collapsed], .BynINW_frame[data-sidebar-collapsed]') ||
            rootEl?.classList.contains(SB + '_collapsed') ||
            rootEl?.classList.contains('_2H3hWW_collapsed')
          );

          if (isCollapsed) {
            toggleWorkspacePanel();
          } else {
            const region = rootEl?.querySelector('.' + SB + '_regionArea, ._2H3hWW_regionArea');
            if (region) region.scrollTo({ top: 0, behavior: "smooth" });
          }
        });
        topGroup.appendChild(homeBtn);

        // 折叠态时显示的新建会话按钮（展开时隐藏，避免与工作区内置按钮重复）
        const railNewBtn = document.createElement("button");
        railNewBtn.id = RAIL_NEW_BTN_ID;
        railNewBtn.type = "button";
        railNewBtn.className = "dsh-codex-action-btn";
        railNewBtn.style.cssText = BTN_STYLE_INLINE;
        railNewBtn.setAttribute("data-tooltip", "新会话 (Ctrl + Shift + O)");
        railNewBtn.innerHTML = SVG.newChat;
        railNewBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          triggerNewSession();
        });
        topGroup.appendChild(railNewBtn);

        const sep1 = document.createElement("div");
        sep1.className = "dsh-codex-rail-sep";
        topGroup.appendChild(sep1);

        const toolsBox = document.createElement("div");
        toolsBox.id = TOOLS_BOX_ID;
        topGroup.appendChild(toolsBox);

        rail.appendChild(topGroup);

        const botGroup = document.createElement("div");
        botGroup.id = "dsh-codex-bot-group";

        const sep2 = document.createElement("div");
        sep2.className = "dsh-codex-rail-sep";
        botGroup.appendChild(sep2);

        const settingsSlot = document.createElement("div");
        settingsSlot.id = SETTINGS_SLOT_ID;
        botGroup.appendChild(settingsSlot);

        rail.appendChild(botGroup);
      }

      if (rail.parentElement !== mountParent) {
        mountParent.insertBefore(rail, mountParent.firstChild);
      }
      bindTooltipContainer(rail, "right");
      return rail;
    }

    function resolveIcon(el, label) {
      // 优先使用源节点自身携带的 SVG（保持 DSH 与插件原始设计语言）
      const svg = el.querySelector?.('svg');
      if (svg) return svg.outerHTML;

      const img = el.querySelector?.('img');
      if (img && img.src) {
        return `<img src="${img.src}" style="width:18px;height:18px;border-radius:4px;object-fit:cover;" />`;
      }

      // 若插件未提供 SVG（例如仅写了 Emoji），降级使用风格统一的单色细线 SVG
      if (label.includes("Memory") || el.matches?.('[data-dsh-memory-sidebar-entry], .dsh-memory-sidebar-entry')) return SVG.memory;
      if (label.includes("扩展") || el.matches?.('[data-dsh-extension-sidebar-entry], .dsh-ext-sidebar-entry')) return SVG.ext;
      if (label.includes("Trending") || el.matches?.('[data-dsh-trending-sidebar-entry], .dsh-trending-sidebar-entry')) return SVG.trending;
      if (label.includes("AGY") || label.includes("自动化") || el.matches?.('[data-dsh-agy-automation-entry], .dsh-agy-auto-sidebar-entry')) return SVG.agy;
      if (label.includes("看板") || el.matches?.('[data-dsh-taskboard-entry]')) return SVG.tasks;
      if (label.includes("技能") || el.matches?.('[data-dsh-skill-explorer-entry]')) return SVG.skills;
      if (label.includes("推荐") || label.includes("Recommend") || el.matches?.('[data-dsh-personalized-recommendations], [data-dsh-recommendation-entry], [data-slot*="recommend"]')) return SVG.recommendation;
      if (label.includes("更多") || label.includes("More") || el.matches?.('[aria-haspopup="menu"], [data-dsh-sidebar-more], [data-dsh-more-menu], [data-slot*="more"], [class*="moreAnchor"] button')) return SVG.more;
      if (label.includes("自定义") || label.includes("Custom") || el.matches?.('[data-dsh-entry-customization], [data-slot*="entry-customization"]')) return SVG.custom;
      if (label.includes("插件") || label.includes("市场") || label.includes("Market") || el.matches?.('[data-dsh-market-entry], [data-slot*="market"]')) return SVG.plugin;
      if (label.includes("统计") || label.includes("Inspector") || label.includes("Stats") || label.includes("开发者")) return SVG.stats;
      if (label.includes("工作树") || label.includes("Worktree") || label.includes("变更") || label.includes("PR") || label.includes("Forge") || label.includes("forge")) return SVG.worktree;
      if (label.includes("subagent") || label.includes("oar") || label.includes("OAR") || label.includes("子代理")) return SVG.subagent;
      if (label.includes("共享") || label.includes("分享") || label.includes("LiveShare") || label.includes("Share")) return SVG.share;
      if (label.includes("补丁") || label.includes("检视") || label.includes("交付") || label.includes("Patch") || label.includes("Deliver")) return SVG.patch;
      if (label.includes("导入") || label.includes("Import") || label.includes("upload")) return SVG.upload;

      const firstChar = label.trim().slice(0, 1) || "P";
      return `<span style="font-size:13px;line-height:1;font-weight:600;">${firstChar}</span>`;
    }

    function parseDetails(el) {
      let label = "";
      let badge = "";

      const badgeNode = el.querySelector?.('[class*="badge"], [class*="Badge"], .dsh-memory-sidebar-badge, .dsh-ext-sidebar-badge, .dsh-trending-sidebar-badge, .dsh-agy-auto-sidebar-badge');
      if (badgeNode && badgeNode.textContent) {
        badge = badgeNode.textContent.trim();
      }

      const labelNode = el.querySelector?.('[class*="label"], [class*="Label"], [class*="title"], [class*="Title"], .dsh-memory-sidebar-label, .dsh-ext-sidebar-label, .dsh-trending-sidebar-label, .dsh-agy-auto-sidebar-label');
      if (labelNode && labelNode.textContent) {
        label = labelNode.textContent.trim();
      } else {
        const fullText = el.textContent ? el.textContent.trim() : "";
        label = badge ? fullText.replace(badge, "").trim() : fullText;
      }

      if (!label) {
        label = el.getAttribute?.("aria-label") || el.getAttribute?.("title") || "面板";
      }

      return { label, badge };
    }

    function formatBadgeHtml(badge) {
      if (!badge) return "";
      if (badge === "·" || badge.includes("运行中")) {
        return '<span class="dsh-codex-dot"></span>';
      }
      // 仅对数字/短计数展示右上角数字徽标，非状态文本（如“就绪”）只在 tooltip 里展示，避免遮挡图标
      if (/^\d+\+?$/.test(badge) && badge.length <= 3) {
        return `<span class="dsh-codex-badge">${badge}</span>`;
      }
      return "";
    }

    let isSyncing = false;

    function syncAll() {
      if (isSyncing) return;
      if (detectPrefixes() || injectedSB !== SB || injectedAF !== AF) {
        injectCSS();
      }
      const root = getSidebarRoot();
      if (!root) return;

      isSyncing = true;
      try {
        ensureTitleNav();
        ensureRail();
        const toolsBox = document.getElementById(TOOLS_BOX_ID);
        if (!toolsBox) return;

        // 1. 同步主页按钮高亮状态（仅在侧边栏未折叠且未停留在其他面板时高亮主页）
        const isCollapsed = Boolean(
          document.querySelector('.' + AF + '_frame[data-sidebar-collapsed], .mP3x-q_frame[data-sidebar-collapsed], .BynINW_frame[data-sidebar-collapsed]') ||
          root.classList.contains(SB + '_collapsed') ||
          root.classList.contains('_2H3hWW_collapsed')
        );

        let activePanelId = null;
        try {
          const layout = pluginCtx?.get?.("layout", false) || pluginCtx?.layout;
          activePanelId = layout?.panelInfo?.getSnapshot?.()?.activePanelId ?? null;
        } catch (e) {}

        const homeBtn = document.getElementById(HOME_BTN_ID);
        if (homeBtn) {
          homeBtn.classList.toggle("active", !isCollapsed && activePanelId === null);
        }

        // 2. 将原生 settingsArea 放入活动栏底部插槽，保证账户中心弹窗锚定在左下角原位
        const settingsSlot = document.getElementById(SETTINGS_SLOT_ID);
        const alreadyMountedSettings = settingsSlot?.querySelector(
          '.' + SB + '_settingsArea, ._2H3hWW_settingsArea, [data-slot="sidebar.settings"]'
        );
        const originSettingsArea = alreadyMountedSettings ||
                                   root.querySelector('.' + SB + '_footArea .' + SB + '_settingsArea, ._2H3hWW_footArea ._2H3hWW_settingsArea') ||
                                   document.querySelector('.' + SB + '_footArea .' + SB + '_settingsArea, ._2H3hWW_footArea ._2H3hWW_settingsArea') ||
                                   root.querySelector('[data-slot="sidebar.settings"]');
        if (originSettingsArea && settingsSlot && !settingsSlot.contains(originSettingsArea)) {
          settingsSlot.innerHTML = "";
          settingsSlot.appendChild(originSettingsArea);
        }

        // 保留 DSH 原生 <Tooltip> 提示，不再额外覆写 data-tooltip 避免双气泡重叠

        // 3. 收集官方与第三方侧边栏面板/插件入口（严格排除取消固定按钮、设置与工作区树）
        const selectors = [
          '[data-dsh-memory-sidebar-entry]',
          '.dsh-memory-sidebar-entry',
          '[data-dsh-extension-sidebar-entry]',
          '.dsh-ext-sidebar-entry',
          '[data-dsh-trending-sidebar-entry]',
          '.dsh-trending-sidebar-entry',
          '[data-dsh-agy-automation-entry]',
          '.dsh-agy-auto-sidebar-entry',
          '[data-dsh-taskboard-entry]',
          '[data-dsh-skill-explorer-entry]',
          '[data-dsh-personalized-recommendations]',
          '[data-dsh-recommendation-entry]',
          '[data-dsh-entry-customization]',
          '[data-dsh-sidebar-more]',
          '[data-dsh-more-menu]',
          '[class*="moreAnchor"] button',
          '[data-dsh-ssh-entry]',
          '[data-dsh-plugin]',
          'nav.' + SB + '_panelList .' + SB + '_panelRow',
          'nav.' + SB + '_panelList > button',
          'nav._2H3hWW_panelList > button',
          '.' + SB + '_panelRow',
          '._2H3hWW_panelRow'
        ];

        const sourceElements = new Set();

        Array.from(root.children).forEach(el => {
          if (!el) return;
          if (el.matches?.(
            '.' + SB + '_logoRow, .' + SB + '_brand, .' + SB + '_newSession, .' + SB + '_newSessionRow, .' + SB + '_scrollRegion, .' + SB + '_regionArea, .' + SB + '_panelList, .' + SB + '_footArea, .' + SB + '_settingsArea, [data-slot*="settings"]'
          )) return;
          if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute?.('role') === 'button' || el.hasAttribute?.('data-dsh-plugin')) {
            sourceElements.add(el);
          }
        });

        for (const sel of selectors) {
          try {
            document.querySelectorAll(sel).forEach(el => {
              if (el &&
                  !el.classList?.contains(SB + '_panelUnpin') &&
                  !el.closest?.('.dsh-memory-modal-overlay') &&
                  !el.closest?.('.dsh-ext-modal-overlay') &&
                  !el.closest?.('.dsh-trending-modal-panel') &&
                  !el.closest?.('[class*="_regionArea"]') &&
                  !el.closest?.('[class*="_footArea"]') &&
                  !el.closest?.('[class*="_settingsArea"]') &&
                  !el.closest?.('[data-slot*="settings"]') &&
                  !el.closest?.(`#${RAIL_ID}`)) {
                sourceElements.add(el);
              }
            });
          } catch (e) {}
        }

        const validKeys = new Set();

        sourceElements.forEach((sourceEl) => {
          try {
            const { label, badge } = parseDetails(sourceEl);
            const rawKey = sourceEl.id ||
                           sourceEl.getAttribute?.("data-panel-id") ||
                           sourceEl.getAttribute?.("data-dsh-plugin") ||
                           sourceEl.getAttribute?.("data-slot") ||
                           `item-${label}`;
            let key = rawKey;
            let suffix = 1;
            while (validKeys.has(key)) {
              key = `${rawKey}-${suffix++}`;
            }
            validKeys.add(key);

            let btn = toolsBox.querySelector(`[data-key="${CSS.escape ? CSS.escape(key) : key}"]`);
            if (!btn) {
              btn = document.createElement("button");
              btn.type = "button";
              btn.className = "dsh-codex-action-btn";
              btn.style.cssText = BTN_STYLE_INLINE;
              btn.setAttribute("data-key", key);

              btn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                try {
                  if (sourceEl.getAttribute?.("aria-haspopup") === "menu" || sourceEl.closest?.('[class*="moreAnchor"]')) {
                    const rect = btn.getBoundingClientRect();
                    sourceEl.style.setProperty("position", "fixed", "important");
                    sourceEl.style.setProperty("left", `${rect.right + 6}px`, "important");
                    sourceEl.style.setProperty("top", `${rect.top}px`, "important");
                    sourceEl.style.setProperty("width", `${rect.width}px`, "important");
                    sourceEl.style.setProperty("height", `${rect.height}px`, "important");
                  }
                  sourceEl.click();
                } catch (err) {
                  console.warn("[dsh-codex] click target error:", err);
                }
              });

              toolsBox.appendChild(btn);
            }

            btn.setAttribute("data-tooltip", badge && badge !== "·" ? `${label} (${badge})` : label);

            const parent = sourceEl.parentElement;
            const isActive = sourceEl.classList?.contains("active") ||
                             sourceEl.matches?.('[class*="_panelActive"], [aria-selected="true"], [aria-current="page"]') ||
                             Boolean(parent && Array.from(parent.classList || []).some(c => c.includes("_panelEntryActive")));
            btn.classList.toggle("active", Boolean(isActive));

            const iconHtml = resolveIcon(sourceEl, label);
            const badgeHtml = formatBadgeHtml(badge);
            const nextHtml = `${iconHtml}${badgeHtml}`;
            if (btn.__dshHtml !== nextHtml) {
              btn.innerHTML = nextHtml;
              btn.__dshHtml = nextHtml;
            }

            sourceEl.classList.add("dsh-codex-hide-source");
          } catch (itemErr) {
            console.warn("[dsh-codex] sync item error:", itemErr);
          }
        });

        Array.from(toolsBox.children).forEach(child => {
          const key = child.getAttribute("data-key");
          if (key && !validKeys.has(key)) {
            child.remove();
          }
        });
      } catch (err) {
        console.warn("[dsh-codex] sync error:", err);
      } finally {
        isSyncing = false;
      }
    }

    function apply(ctx) {
      try {
        pluginCtx = ctx;

        wipeAllZombies();
        injectCSS();
        initHistoryTracking();

        let scheduled = null;
        let idleHandle = null;
        const runIdle = (fn) => {
          if (typeof window !== "undefined" && window.requestIdleCallback) {
            idleHandle = window.requestIdleCallback(fn, { timeout: 250 });
            return idleHandle;
          }
          return setTimeout(fn, 0);
        };
        const cancelPendingSync = () => {
          if (scheduled) {
            clearTimeout(scheduled);
            scheduled = null;
          }
          if (idleHandle && typeof window !== "undefined" && window.cancelIdleCallback) {
            window.cancelIdleCallback(idleHandle);
            idleHandle = null;
          }
        };
        const scheduleSync = () => {
          if (scheduled) return;
          scheduled = setTimeout(() => {
            runIdle(() => {
              scheduled = null;
              idleHandle = null;
              try { syncAll(); } catch (err) {
                console.warn("[dsh-codex] syncAll error:", err);
              }
              try {
                const curSid = navHistory.getCurrentSessionId();
                if (curSid && curSid !== navHistory.currentSessionId) {
                  navHistory.onSessionChanged(curSid);
                }
              } catch (e) {}
            });
          }, 80);
        };

        scheduleSync();

        const observer = new MutationObserver((mutations) => {
          let shouldUpdate = false;
          for (const m of mutations) {
            if (m.target?.id === RAIL_ID || m.target?.closest?.(`#${RAIL_ID}`) ||
                m.target?.id === TITLE_NAV_ID || m.target?.closest?.(`#${TITLE_NAV_ID}`) ||
                m.target?.id === TOOLTIP_ID) continue;
            // 忽略主对话区与右侧预览栏高频 DOM 变动，显著降低流式输出期间的 CPU 占用
            if (m.target?.closest?.('[data-slot="main.conversation"], [data-slot="rightbar"], [data-sidebar-right-panel], textarea, input')) continue;

            shouldUpdate = true;
            break;
          }
          if (shouldUpdate) scheduleSync();
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["class", "data-sidebar-collapsed", "aria-selected", "data-we-wallpaper", "data-we-left-sidebar", "data-we-sidebar-fullclear"]
        });

        window.__DSH_CODEX_CLEANUP__ = () => {
          try {
            cancelPendingSync();
            observer.disconnect();
            if (typeof cleanupHistory === "function") {
              try { cleanupHistory(); } catch (e) {}
              cleanupHistory = null;
            }
            historyInited = false;
            restoreNativeSettingsArea();
            document.getElementById(TITLE_NAV_ID)?.remove();
            document.getElementById(TOOLTIP_ID)?.remove();
            document.getElementById(STYLE_ID)?.remove();
            document.getElementById(RAIL_ID)?.remove();
            document.querySelectorAll(".dsh-codex-hide-source").forEach(el => el.classList.remove("dsh-codex-hide-source"));
          } catch (e) {}
        };

        return window.__DSH_CODEX_CLEANUP__;
      } catch (fatal) {
        console.error("[dsh-codex] Plugin apply fatal error caught safely:", fatal);
        return () => {};
      }
    }

    const inject = ["layout"];

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }

  if (typeof window !== "undefined" && window.__ModuleLoader__ && typeof window.__ModuleLoader__.load === "function") {
    window.__ModuleLoader__.load({
      id: "dsh-codex-rail",
      factory: factory
    });

    try {
      window.__ModuleLoader__.load({
        id: "dsh-codex-sidebar",
        factory: factory
      });
    } catch (e) {}
  }
})();
