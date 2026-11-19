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
    const OVERLAY_ROOT_ID = "dsh-codex-overlay-root";
    const TOOLTIP_ID = "dsh-codex-floating-tooltip";
    const PEEK_ATTR = "data-codex-sidebar-peek";
    const ANCHORED_ATTR = "data-dsh-codex-anchored";
    const MAX_HISTORY_SIZE = 50;

    let pluginCtx = null;
    let historyInited = false;
    let cleanupHistory = null;
    let cleanupTooltip = null;
    let cleanupPanelInfo = null;
    let cleanupPeek = null;
    let cleanupToolsFade = null;

    function isDarwinPlatform() {
      try {
        return document.documentElement?.getAttribute?.("data-platform") === "darwin";
      } catch (e) {
        return false;
      }
    }

    function isDrawerActive() {
      try {
        return Boolean(document.querySelector('[data-sidebar-drawer]'));
      } catch (e) {
        return false;
      }
    }

    function getAppFrame() {
      try {
        return document.querySelector('.' + AF + '_frame, .mP3x-q_frame, .BynINW_frame');
      } catch (e) {
        return null;
      }
    }

    function getShortcutText(action) {
      const mac = isDarwinPlatform();
      if (action === "back") return mac ? "⌥ ←" : "Alt + ←";
      if (action === "forward") return mac ? "⌥ →" : "Alt + →";
      if (action === "toggle") return mac ? "⌘ B" : "Ctrl + B";
      if (action === "new") return mac ? "⌘ ⇧ O" : "Ctrl + Shift + O";
      return "";
    }

    function isSidebarCollapsed(rootEl) {
      try {
        const root = rootEl || getSidebarRoot();
        return Boolean(
          document.querySelector('.' + AF + '_frame[data-sidebar-collapsed], .mP3x-q_frame[data-sidebar-collapsed], .BynINW_frame[data-sidebar-collapsed]') ||
          root?.classList?.contains(SB + '_collapsed') ||
          root?.classList?.contains('_2H3hWW_collapsed')
        );
      } catch (e) {
        return false;
      }
    }

    function getLayoutService() {
      try {
        return pluginCtx?.layout ||
               (typeof pluginCtx?.get === "function" ? pluginCtx.get("layout", false) : null) ||
               pluginCtx?.root?.layout ||
               (typeof pluginCtx?.root?.get === "function" ? pluginCtx.root.get("layout", false) : null) ||
               null;
      } catch (e) {
        return null;
      }
    }

    function getActivePanelId() {
      try {
        const layout = getLayoutService();
        return layout?.panelInfo?.getSnapshot?.()?.activePanelId ?? null;
      } catch (e) {
        return null;
      }
    }

    // 自动探测 DSH CSS Module 前缀（版本升级后前缀哈希变化仍能自动兼容）
    let SB = "wtg9ga";
    let AF = "mP3x-q";
    let injectedSB = null;
    let injectedAF = null;

    function detectPrefixes() {
      let changed = false;
      try {
        const r = document.querySelector('[class*="_regionArea"]');
        const rCls = typeof r?.className === "string" ? r.className : (r?.getAttribute?.("class") || "");
        const m = r && /(?:^|\s)([A-Za-z0-9_-]+?)_regionArea(?:\s|$)/.exec(rCls);
        if (m && m[1] !== SB) {
          SB = m[1];
          changed = true;
        }
        const c = document.querySelector('[class*="_sidebarCol"]');
        const cCls = typeof c?.className === "string" ? c.className : (c?.getAttribute?.("class") || "");
        const n = c && /(?:^|\s)([A-Za-z0-9_-]+?)_sidebarCol(?:\s|$)/.exec(cCls);
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

    // 清理被活动栏临时固定定位的菜单锚点/触发器内联样式（用于抽屉模式切换与热重载清理）
    function resetAnchoredMenus() {
      try {
        document.querySelectorAll(`[${ANCHORED_ATTR}]`).forEach((el) => {
          el.removeAttribute(ANCHORED_ATTR);
          el.style.removeProperty("position");
          el.style.removeProperty("left");
          el.style.removeProperty("top");
          el.style.removeProperty("width");
          el.style.removeProperty("height");
          el.style.removeProperty("margin");
          el.style.removeProperty("padding");
        });
      } catch (e) {}
    }

    // 还原被活动栏接管隐藏的原生面板入口（窄屏抽屉模式与卸载时必须完整归还）
    function restoreHiddenSources() {
      try {
        document.querySelectorAll(".dsh-codex-hide-source").forEach((el) => {
          el.classList.remove("dsh-codex-hide-source");
        });
      } catch (e) {}
      resetAnchoredMenus();
    }

    // 还原原生 settingsArea 至工作区底部，避免卸载/重载或进入抽屉模式破坏 React 节点树
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

    function clearPeekAttributes() {
      try {
        document.querySelectorAll(`[${PEEK_ATTR}]`).forEach((el) => {
          el.removeAttribute(PEEK_ATTR);
          el.style.removeProperty("--codex-peek-rail");
          el.style.removeProperty("--codex-peek-width");
        });
      } catch (e) {}
    }

    function wipeAllZombies() {
      try {
        if (typeof window.__DSH_CODEX_CLEANUP__ === "function") {
          window.__DSH_CODEX_CLEANUP__();
        }
      } catch (e) {}
      for (const fn of [cleanupPeek, cleanupPanelInfo, cleanupToolsFade, cleanupTooltip, cleanupHistory]) {
        try {
          if (typeof fn === "function") fn();
        } catch (e) {}
      }
      cleanupPeek = null;
      cleanupPanelInfo = null;
      cleanupToolsFade = null;
      cleanupTooltip = null;
      cleanupHistory = null;
      historyInited = false;
      clearPeekAttributes();
      restoreNativeSettingsArea();
      restoreHiddenSources();
      try {
        document.getElementById(TITLE_NAV_ID)?.remove();
        document.getElementById(RAIL_ID)?.remove();
        document.getElementById(TOOLTIP_ID)?.remove();
        document.getElementById(OVERLAY_ROOT_ID)?.remove();
        document.getElementById(STYLE_ID)?.remove();
        document.querySelectorAll('[id^="dsh-codex-"]:not(#' + SETTINGS_SLOT_ID + ')').forEach(el => el.remove());
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

        /* macOS 桌面端保持透明以透出原生窗口毛玻璃（vibrancy），由活动栏自身叠加原生侧栏柔光底色 */
        html[data-platform="darwin"] #root:not(:has([data-sidebar-drawer])) {
          background: transparent;
        }

        /* 兼容 dsh-claude-style：让最左 48px 活动栏与侧边栏使用一致的 --dsh-claude-sidebar-canvas 调色板/不透明度，避免与对话区底色割裂 */
        html body[data-dsh-claude-style]:not([data-we-wallpaper]):not([data-dsh-claude-background-opacity]):not(:has(#dsh-wallpaper-engine-layer)):not(:has(.we-layer)) #root:not(:has([data-sidebar-drawer])) {
          background-color: var(--dsh-claude-sidebar-canvas, var(--dsw-specific-sidebar-fill)) !important;
        }
        html body[data-dsh-claude-style]:not([data-we-wallpaper])[data-dsh-claude-background-opacity]:not(:has(#dsh-wallpaper-engine-layer)):not(:has(.we-layer)) #root:not(:has([data-sidebar-drawer])) {
          background-color: color-mix(in srgb, var(--dsh-claude-sidebar-canvas, var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-base))) calc(var(--dsh-claude-background-opacity) * 100%), transparent) !important;
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
          transition: background 0.12s ease, color 0.12s ease, opacity 0.12s ease, transform 0.1s ease;
        }

        .dsh-codex-title-btn:hover:not(:disabled):not(.disabled) {
          background: var(--dsw-alias-interactive-bg-hover);
          color: var(--dsw-alias-label-primary);
        }

        .dsh-codex-title-btn:active:not(:disabled):not(.disabled) {
          transform: scale(0.94);
        }

        .dsh-codex-title-btn:focus-visible {
          outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
          outline-offset: -2px;
        }

        .dsh-codex-title-btn:disabled,
        .dsh-codex-title-btn.disabled {
          opacity: 0.32;
          cursor: default;
          pointer-events: none;
        }

        /* 在 Windows 标题栏环境（含全屏）与 macOS 非抽屉环境下，由标题栏/活动栏接管原生 toggle、折叠态 newSession 与 leadingSeat，避免双按钮重叠 */
        html[data-windows-titlebar] #root:not(:has([data-sidebar-drawer])) .wtg9ga_toggle,
        html[data-windows-titlebar] #root:not(:has([data-sidebar-drawer])) ._2H3hWW_toggle,
        html[data-platform="darwin"] #root:not(:has([data-sidebar-drawer])) .wtg9ga_topStrip > .wtg9ga_toggle,
        html[data-platform="darwin"] #root:not(:has([data-sidebar-drawer])) ._2H3hWW_topStrip > ._2H3hWW_toggle,
        html[data-platform="darwin"] #root:not(:has([data-sidebar-drawer])) .mP3x-q_leadingSeat,
        html[data-platform="darwin"] #root:not(:has([data-sidebar-drawer])) .BynINW_leadingSeat {
          position: fixed !important;
          left: -9999px !important;
          top: -9999px !important;
          width: 1px !important;
          height: 1px !important;
          opacity: 0 !important;
          overflow: hidden !important;
        }

        html[data-windows-titlebar] #root:not(:has([data-sidebar-drawer])) .wtg9ga_collapsed .wtg9ga_newSession,
        html[data-windows-titlebar] #root:not(:has([data-sidebar-drawer])) ._2H3hWW_collapsed ._2H3hWW_newSession {
          position: fixed !important;
          left: -9999px !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }

        /* macOS 折叠态下：活动栏已提供收展与新建入口，紧缩顶部避让宽度，仅避开超出 48px 活动栏的交通灯尾部 */
        html[data-platform="darwin"]:not([data-fullscreen]) #root:not(:has([data-sidebar-drawer])) .mP3x-q_frame[data-sidebar-collapsed],
        html[data-platform="darwin"]:not([data-fullscreen]) #root:not(:has([data-sidebar-drawer])) .BynINW_frame[data-sidebar-collapsed] {
          --dsh-frame-leading-clearance: 40px !important;
        }
        html[data-platform="darwin"][data-fullscreen] #root:not(:has([data-sidebar-drawer])) .mP3x-q_frame[data-sidebar-collapsed],
        html[data-platform="darwin"][data-fullscreen] #root:not(:has([data-sidebar-drawer])) .BynINW_frame[data-sidebar-collapsed] {
          --dsh-frame-leading-clearance: 0px !important;
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
          z-index: 65;
          -webkit-app-region: no-drag;
          user-select: none;
          transition: border-color 0.2s ease;
        }

        /* macOS 窗口态避让左上角红黄绿交通灯；全屏态恢复紧凑顶部间距，并叠加与原生 sidebarCol 一致的半透明柔光 */
        html[data-platform="darwin"]:not([data-fullscreen]) #${RAIL_ID} {
          top: 0;
          padding-top: var(--dsh-frame-top-clearance, 48px);
        }
        html[data-platform="darwin"][data-fullscreen] #${RAIL_ID} {
          top: 0;
          padding-top: 6px;
        }
        html[data-platform="darwin"] body:not([data-we-wallpaper]):not([data-dsh-claude-style]) #${RAIL_ID} {
          background:
            linear-gradient(
              to bottom,
              var(--dsw-specific-sidebar-wash-top, transparent),
              var(--dsw-specific-sidebar-wash-top-clear, transparent) 35%,
              var(--dsw-specific-sidebar-wash-bottom-clear, transparent) 68%,
              var(--dsw-specific-sidebar-wash-bottom, transparent)
            ),
            var(--dsw-specific-sidebar-tint, transparent);
        }
        @media (prefers-reduced-transparency: reduce) {
          html[data-platform="darwin"] body:not([data-we-wallpaper]):not([data-dsh-claude-style]) #${RAIL_ID} {
            background: color-mix(in srgb, var(--dsw-specific-sidebar-fill) 90%, transparent);
          }
        }

        /* 侧边栏折叠到 0px 时，隐藏活动栏右分割线，让右侧对话区的 16px 原生圆角直接紧贴活动栏 */
        html:has(.mP3x-q_frame[data-sidebar-collapsed]) #${RAIL_ID},
        html:has(.BynINW_frame[data-sidebar-collapsed]) #${RAIL_ID},
        html:has(.wtg9ga_collapsed) #${RAIL_ID},
        body[data-we-sidebar-fullclear] #${RAIL_ID} {
          border-right-color: transparent !important;
        }

        /* 兼容 dsh-claude-style：其将内容区圆角设为 0px，并采用极细 border-l1 分割线与 --dsh-claude-divider */
        body[data-dsh-claude-style]:not([data-we-sidebar-fullclear]) #${RAIL_ID},
        html:has([data-sidebar-collapsed]) body[data-dsh-claude-style]:not([data-we-sidebar-fullclear]) #${RAIL_ID} {
          border-right-color: var(--dsw-alias-border-l1, var(--dsh-claude-divider, var(--dsw-alias-border-l3))) !important;
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
          flex: 1 1 auto;
          min-height: 0;
          gap: 4px;
        }

        #${TOOLS_BOX_ID} {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 100%;
          flex: 1 1 auto;
          min-height: 0;
          max-height: 100%;
          gap: 4px;
          padding: 4px 0;
          box-sizing: border-box;
          overflow-y: auto;
          overflow-x: hidden;
          scrollbar-width: none;
        }
        #${TOOLS_BOX_ID}::-webkit-scrollbar {
          display: none;
        }

        /* 按需边缘渐隐：仅在存在对应方向滚动溢出时柔和渐隐，无溢出时保持首尾按钮 100% 锐利 */
        #${TOOLS_BOX_ID}[data-fade-top]:not([data-fade-bottom]) {
          -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 12px, #000 100%);
          mask-image: linear-gradient(to bottom, transparent 0, #000 12px, #000 100%);
        }
        #${TOOLS_BOX_ID}[data-fade-bottom]:not([data-fade-top]) {
          -webkit-mask-image: linear-gradient(to bottom, #000 0, #000 calc(100% - 12px), transparent 100%);
          mask-image: linear-gradient(to bottom, #000 0, #000 calc(100% - 12px), transparent 100%);
        }
        #${TOOLS_BOX_ID}[data-fade-top][data-fade-bottom] {
          -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 12px, #000 calc(100% - 12px), transparent 100%);
          mask-image: linear-gradient(to bottom, transparent 0, #000 12px, #000 calc(100% - 12px), transparent 100%);
        }

        #dsh-codex-bot-group {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-end;
          width: 100%;
          flex: none;
          gap: 4px;
          box-sizing: border-box;
        }

        .dsh-codex-rail-sep {
          width: 20px;
          height: 0.5px;
          background: var(--dsh-claude-divider, var(--dsw-alias-border-l3));
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

        .dsh-codex-action-btn:hover,
        .dsh-codex-action-btn[aria-expanded="true"] {
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

        body[data-dsh-claude-style] .dsh-codex-action-btn.active,
        body[data-dsh-claude-style] .dsh-codex-action-btn:hover,
        body[data-dsh-claude-style] .dsh-codex-action-btn[aria-expanded="true"] {
          background: var(--dsh-claude-hover-bg, var(--dsw-alias-interactive-bg-hover)) !important;
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
          background: var(--dsw-alias-brand-primary, var(--dsw-alias-state-business-primary, #0066fe));
          border: 1.5px solid var(--dsh-claude-sidebar-canvas, var(--dsw-specific-sidebar-fill, transparent));
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
          background: var(--dsw-alias-brand-primary, var(--dsw-alias-state-business-primary, #0066fe));
          color: var(--dsw-alias-label-primary-foreground, var(--dsw-alias-label-primary-inverted, #ffffff));
          font-family: var(--dsw-font-family);
          font-size: 9px;
          font-weight: 600;
          line-height: 14px;
          text-align: center;
          box-sizing: border-box;
          pointer-events: none;
        }

        /* 悬浮气泡：统一由浮动节点承载，绝不会被活动栏滚动裁剪或左边界溢出；层级对齐 dsh-claude-layer-tooltip */
        #${TOOLTIP_ID} {
          position: fixed;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: var(--dsh-claude-card, var(--dsw-alias-tooltip-bg, var(--dsw-alias-bg-layer-3, rgba(24, 24, 28, 0.92))));
          color: var(--dsw-alias-tooltip-label, var(--dsw-alias-label-primary, #ffffff));
          border: 0.5px solid var(--dsw-alias-border-l1, var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.12)));
          box-shadow: var(--dsw-alias-shadow-lv2, var(--dsw-shadow-lv2, 0 4px 12px rgba(0, 0, 0, 0.18)));
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
          transform: translateX(-3px);
          transition: opacity 0.11s ease, transform 0.11s ease;
          z-index: var(--dsh-claude-layer-tooltip, 100000);
        }

        #${TOOLTIP_ID}[data-placement="bottom"] {
          transform: translateY(-2px);
        }

        body[data-dsh-claude-style] #${TOOLTIP_ID} {
          border-radius: 8px;
          padding: 5px 10px;
          border-width: 1px;
        }

        #${TOOLTIP_ID}.visible {
          opacity: 1;
          visibility: visible;
          transform: translate(0, 0);
        }

        .dsh-codex-tip-kbd {
          font-size: 10.5px;
          font-weight: 500;
          line-height: 14px;
          padding: 0 4px;
          border-radius: 4px;
          opacity: 0.72;
          background: color-mix(in srgb, currentColor 11%, transparent);
          letter-spacing: 0.01em;
        }

        /* 激活态左侧细胶囊指示条：居中按钮左侧 1px 安全内边距（left: -5px），任何 DPI/页面缩放下绝不被 overflow-x 裁剪 */
        #${RAIL_ID} .dsh-codex-action-btn.active::before {
          content: "";
          position: absolute;
          left: -5px;
          top: 50%;
          width: 3px;
          height: 16px;
          margin-top: -8px;
          border-radius: 999px;
          corner-shape: round;
          background: var(--dsw-alias-label-primary);
          opacity: 0.88;
          pointer-events: none;
        }

        /* 4.5 折叠态悬停工作区浮层预览（Hover Peek，类 Codex / Claude Desktop 体验，不触发布局重排） */
        .mP3x-q_frame[${PEEK_ATTR}],
        .BynINW_frame[${PEEK_ATTR}] {
          transition: none !important;
        }

        .mP3x-q_frame[${PEEK_ATTR}] > .mP3x-q_sidebarCol,
        .BynINW_frame[${PEEK_ATTR}] > .BynINW_sidebarCol {
          position: absolute !important;
          grid-row: 1 !important;
          grid-column: 1 / -1 !important;
          top: var(--dsh-frame-chrome-top, 0px) !important;
          bottom: 0 !important;
          left: 0 !important;
          z-index: var(--dsh-claude-layer-peek, 60) !important;
          width: max-content !important;
          border-right: 0.5px solid var(--dsw-alias-border-l2, var(--dsw-alias-border-l3)) !important;
          border-top-right-radius: var(--dsw-radius-lg, 14px);
          border-bottom-right-radius: var(--dsw-radius-lg, 14px);
          box-shadow: var(--dsw-alias-shadow-lv2, var(--dsw-shadow-lv2, 0 12px 32px rgba(0, 0, 0, 0.22))) !important;
          animation: dsh-codex-peek-in 180ms cubic-bezier(0.2, 0.9, 0.25, 1) !important;
        }

        html[data-windows-titlebar]:not([data-fullscreen]) .mP3x-q_frame[${PEEK_ATTR}] > .mP3x-q_sidebarCol,
        html[data-windows-titlebar]:not([data-fullscreen]) .BynINW_frame[${PEEK_ATTR}] > .BynINW_sidebarCol {
          top: var(--dsh-windows-titlebar-height, 40px) !important;
        }

        body[data-dsh-claude-style] .mP3x-q_frame[${PEEK_ATTR}] > .mP3x-q_sidebarCol,
        body[data-dsh-claude-style] .BynINW_frame[${PEEK_ATTR}] > .BynINW_sidebarCol {
          border-top-right-radius: 0;
          border-bottom-right-radius: 0;
          border-right-color: var(--dsw-alias-border-l1, var(--dsh-claude-divider, var(--dsw-alias-border-l3))) !important;
        }

        /* 壁纸模式或 macOS 半透模式下，悬停浮层使用高可读性磨砂玻璃底板，避免与下方对话文字重影 */
        body[data-we-wallpaper] .mP3x-q_frame[${PEEK_ATTR}] > .mP3x-q_sidebarCol,
        body[data-we-wallpaper] .BynINW_frame[${PEEK_ATTR}] > .BynINW_sidebarCol,
        html[data-platform="darwin"] .mP3x-q_frame[${PEEK_ATTR}] > .mP3x-q_sidebarCol,
        html[data-platform="darwin"] .BynINW_frame[${PEEK_ATTR}] > .BynINW_sidebarCol {
          background: color-mix(in srgb, var(--dsh-claude-sidebar-canvas, var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-layer-2))) 84%, transparent) !important;
          backdrop-filter: blur(20px) saturate(1.6) !important;
          -webkit-backdrop-filter: blur(20px) saturate(1.6) !important;
        }

        .mP3x-q_frame[${PEEK_ATTR}="closing"] > .mP3x-q_sidebarCol,
        .BynINW_frame[${PEEK_ATTR}="closing"] > .BynINW_sidebarCol {
          animation: dsh-codex-peek-out 160ms cubic-bezier(0.4, 0, 1, 1) forwards !important;
          pointer-events: none !important;
        }

        .mP3x-q_frame[${PEEK_ATTR}] > .mP3x-q_centerCol,
        .BynINW_frame[${PEEK_ATTR}] > .BynINW_centerCol {
          grid-column: 1 / span 2 !important;
          margin-left: var(--codex-peek-rail, 0px) !important;
        }

        .mP3x-q_frame[${PEEK_ATTR}] > [data-side="sidebar"],
        .BynINW_frame[${PEEK_ATTR}] > [data-side="sidebar"] {
          display: none !important;
        }

        @keyframes dsh-codex-peek-in {
          from {
            opacity: 0.65;
            transform: translateX(calc(-1 * var(--codex-peek-width, 264px)));
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes dsh-codex-peek-out {
          from {
            opacity: 1;
            transform: translateX(0);
          }
          to {
            opacity: 0.4;
            transform: translateX(calc(-1 * var(--codex-peek-width, 264px)));
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .dsh-codex-action-btn,
          .dsh-codex-title-btn,
          #${TOOLTIP_ID},
          #${RAIL_ID} {
            transition: none !important;
          }
          .dsh-codex-action-btn:active,
          .dsh-codex-title-btn:active,
          #${TOOLTIP_ID} {
            transform: none !important;
          }
          .mP3x-q_frame[${PEEK_ATTR}] > .mP3x-q_sidebarCol,
          .BynINW_frame[${PEEK_ATTR}] > .BynINW_sidebarCol {
            animation: none !important;
          }
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
        #${SETTINGS_SLOT_ID} .ET65mq_anchor,
        #${SETTINGS_SLOT_ID} [class*="_root"],
        #${SETTINGS_SLOT_ID} [class*="_anchor"] {
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

        /* 账号通知卡片避开 36px 窄插槽挤压，向外侧展开 */
        #${SETTINGS_SLOT_ID} [class*="_notifications"] {
          left: 44px !important;
          right: auto !important;
          width: 240px !important;
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
          font-size: 12px !important;
          line-height: 1 !important;
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

        /* 兼容 dsh-claude-style 底部折叠/账户接管 (footer-takeover) */
        body[data-dsh-claude-style] #${SETTINGS_SLOT_ID} button:hover {
          background: var(--dsh-claude-hover-bg, var(--dsw-alias-interactive-bg-hover)) !important;
        }

        body[data-dsh-claude-style][data-dsh-claude-footer-takeover] #${SETTINGS_SLOT_ID}:has([data-dsh-claude-account-host-row]) button:not([data-dsh-claude-account-host-row]):not([aria-disabled]) {
          display: none !important;
        }

        body[data-dsh-claude-style] #${SETTINGS_SLOT_ID} [data-dsh-claude-account-host-row]::after {
          display: none !important;
        }

        /* dsh-claude-style 注入到账户按钮内的更新胶囊/副本：收敛为右上角强调小圆点，避免撑破 36px 按钮 */
        body[data-dsh-claude-style] #${SETTINGS_SLOT_ID} .dsh-claude-footer-seat-copy {
          position: absolute !important;
          top: 4px !important;
          right: 4px !important;
          left: auto !important;
          bottom: auto !important;
          width: auto !important;
          height: auto !important;
          margin: 0 !important;
          padding: 0 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          pointer-events: auto !important;
          z-index: 2 !important;
        }

        body[data-dsh-claude-style] #${SETTINGS_SLOT_ID} .dsh-claude-footer-seat-copy > * {
          width: 7px !important;
          min-width: 7px !important;
          height: 7px !important;
          min-height: 7px !important;
          padding: 0 !important;
          margin: 0 !important;
          font-size: 0 !important;
          line-height: 0 !important;
          border-radius: 999px !important;
          corner-shape: round !important;
          border: 1.5px solid var(--dsh-claude-sidebar-canvas, var(--dsw-specific-sidebar-fill, transparent)) !important;
          background: var(--dsw-alias-button-primary-fill, var(--dsw-alias-state-business-primary, #0066fe)) !important;
        }

        body[data-dsh-claude-style] #${SETTINGS_SLOT_ID} .dsh-claude-footer-seat-copy svg,
        body[data-dsh-claude-style] #${SETTINGS_SLOT_ID} .dsh-claude-footer-seat-copy img {
          display: none !important;
        }

        /* 避免迁移至 36px 活动栏后账户菜单宽度受按钮 36px 影响缩窄 */
        body[data-dsh-claude-style] [data-dsh-claude-account-menu] {
          min-width: 220px;
        }

        /* 当原生 settingsArea 迁至左侧活动栏且工作区底部已无其余可见组件时，去掉 dsh-claude-style 空 footer 分割线与留白（抽屉模式下自动失效） */
        body[data-dsh-claude-style][data-dsh-claude-footer-takeover] #root:not(:has([data-sidebar-drawer])) .wtg9ga_footArea:not(:has(.dsh-claude-account-btn, [data-dsh-claude-footer-block], [data-dsh-claude-holds~=footer-block], [data-dsh-claude-footer-overlay], [data-dsh-claude-account-host-row], [data-dsh-claude-footer-entry]:not([data-dsh-claude-footer-hidden]))),
        body[data-dsh-claude-style][data-dsh-claude-footer-takeover] #root:not(:has([data-sidebar-drawer])) ._2H3hWW_footArea:not(:has(.dsh-claude-account-btn, [data-dsh-claude-footer-block], [data-dsh-claude-holds~=footer-block], [data-dsh-claude-footer-overlay], [data-dsh-claude-account-host-row], [data-dsh-claude-footer-entry]:not([data-dsh-claude-footer-hidden]))),
        body[data-dsh-claude-style]:not([data-dsh-claude-footer-takeover]) #root:not(:has([data-sidebar-drawer])) .wtg9ga_footArea:not(:has([class*="_settingsArea"], [class*="_footerActions"] [data-slot] > *, [class*="_footerActions"] > :not([data-slot]))),
        body[data-dsh-claude-style]:not([data-dsh-claude-footer-takeover]) #root:not(:has([data-sidebar-drawer])) ._2H3hWW_footArea:not(:has([class*="_settingsArea"], [class*="_footerActions"] [data-slot] > *, [class*="_footerActions"] > :not([data-slot]))) {
          padding: 0 !important;
          margin: 0 !important;
          border-top: none !important;
        }

        /* 6. 仅在非抽屉模式下隐藏已迁移至活动栏的原生面板列表；窄屏抽屉模式完整保留原生面板与设置入口 */
        #root:not(:has([data-sidebar-drawer])) .wtg9ga_root .wtg9ga_panelList,
        #root:not(:has([data-sidebar-drawer])) ._2H3hWW_root ._2H3hWW_panelList,
        html[data-windows-titlebar] #root:not(:has([data-sidebar-drawer])) .wtg9ga_collapsed .wtg9ga_panelList,
        html[data-windows-titlebar] #root:not(:has([data-sidebar-drawer])) ._2H3hWW_collapsed ._2H3hWW_panelList {
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

        #root:not(:has([data-sidebar-drawer])) .dsh-codex-hide-source:not([aria-haspopup="menu"]) {
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

        #root:not(:has([data-sidebar-drawer])) .dsh-codex-hide-source[aria-haspopup="menu"] {
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

    function toggleWorkspacePanelRaw() {
      const layout = getLayoutService();
      if (layout && typeof layout.toggleSidebar === "function") {
        try {
          layout.toggleSidebar();
          return true;
        } catch (e) {}
      }

      const nativeToggle = document.querySelector(
        'button.' + SB + '_toggle, button._2H3hWW_toggle, [data-sidebar-toggle], button[aria-label*="侧边栏"]'
      );
      if (nativeToggle && nativeToggle.id !== TITLE_TOGGLE_ID && nativeToggle.id !== RAIL_TOGGLE_ID) {
        try {
          nativeToggle.click();
          return true;
        } catch (err) {}
      }
      return false;
    }

    let peekCtrl = null;

    function toggleWorkspacePanel() {
      // 若当前正处于折叠态悬停预览（Hover Peek），点击收展按钮直接固定展开，不重复切换
      if (peekCtrl && peekCtrl.pinIfActive()) {
        return;
      }
      if (peekCtrl) peekCtrl.cancelWaiting();
      toggleWorkspacePanelRaw();
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
        'button.' + SB + '_newSession, button._2H3hWW_newSession, button[class*="_newSession"], [data-slot="sidebar.session.action"] button:not([class*="_trigger"]), [aria-label*="新会话"], [aria-label*="新建会话"], [aria-label*="New session"]'
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
      _navTimer: null,

      clearNavTimer() {
        if (this._navTimer) {
          clearTimeout(this._navTimer);
          this._navTimer = null;
        }
      },

      reset() {
        this.clearNavTimer();
        this.isNavigating = false;
      },

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
            const sid = activeRow.getAttribute("data-row-key")?.replace(/^session:/, "");
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
        if (this.stack.length > MAX_HISTORY_SIZE) {
          const overflow = this.stack.length - MAX_HISTORY_SIZE;
          this.stack = this.stack.slice(overflow);
        }
        this.index = this.stack.length - 1;
        this.currentSessionId = sessionId;
        this.updateUI();
      },

      canGoBack() {
        if (this.hasOpenModal()) return true;
        if (getActivePanelId() !== null) return true;
        return this.index > 0;
      },

      canGoForward() {
        return this.index >= 0 && this.index < this.stack.length - 1;
      },

      _armNavGuard() {
        this.clearNavTimer();
        this.isNavigating = true;
        this._navTimer = setTimeout(() => {
          this._navTimer = null;
          this.isNavigating = false;
          this.updateUI();
        }, 220);
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

        // 若停留在全局面板（如插件/技能/看板），后退优先返回当前对话，不破坏会话堆栈
        if (getActivePanelId() !== null) {
          try {
            const layout = getLayoutService();
            if (layout && typeof layout.selectPanel === "function") {
              layout.selectPanel(null);
              this.updateUI();
              return;
            }
          } catch (e) {}
        }

        if (this.index <= 0) return;
        this._armNavGuard();
        this.index--;
        const targetSid = this.stack[this.index];
        this.currentSessionId = targetSid;
        // 仅通过会话 API 切换，不调用 window.history.back()，避免 SPA 路由被额外回退导致跳错页面
        this.activateSession(targetSid);
        this.updateUI();
      },

      forward() {
        if (!this.canGoForward()) return;
        this._armNavGuard();
        this.index++;
        const targetSid = this.stack[this.index];
        this.currentSessionId = targetSid;
        this.activateSession(targetSid);
        this.updateUI();
      },

      activateSession(sessionId) {
        if (!sessionId) return false;
        try {
          const layout = getLayoutService();
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

    function getPageZoomFactor() {
      try {
        const attr = document.body?.getAttribute?.("data-dsh-claude-page-zoom");
        if (attr) {
          const parsed = Number.parseFloat(attr);
          if (Number.isFinite(parsed) && parsed > 0) return parsed;
        }
        const raw = document.body?.style?.getPropertyValue?.("--dsh-claude-page-zoom-factor");
        if (raw) {
          const parsed = Number.parseFloat(raw);
          if (Number.isFinite(parsed) && parsed > 0) return parsed;
        }
      } catch (e) {}
      return 1;
    }

    function getZoomRect(el) {
      const r = el.getBoundingClientRect();
      const z = getPageZoomFactor();
      if (z === 1) return r;
      return {
        left: r.left / z,
        right: r.right / z,
        top: r.top / z,
        bottom: r.bottom / z,
        width: r.width / z,
        height: r.height / z
      };
    }

    function ensureOverlayRoot() {
      let host = document.getElementById(OVERLAY_ROOT_ID);
      if (!host) {
        host = document.createElement("div");
        host.id = OVERLAY_ROOT_ID;
        host.style.cssText = "position:static;width:0;height:0;margin:0;padding:0;overflow:visible;pointer-events:none;";
        document.body.appendChild(host);
      }
      return host;
    }

    function ensureFloatingTooltip() {
      const host = ensureOverlayRoot();
      let tip = document.getElementById(TOOLTIP_ID);
      if (!tip) {
        tip = document.createElement("div");
        tip.id = TOOLTIP_ID;
        tip.setAttribute("role", "tooltip");
        host.appendChild(tip);
      } else if (tip.parentElement !== host) {
        host.appendChild(tip);
      }
      return tip;
    }

    // 统一浮动 Tooltip 控制器：共享预热状态、滚动/失焦/Esc 自动收起、卸载彻底清理定时器与全局监听
    const tooltipCtrl = {
      showTimer: null,
      warmUntil: 0,
      globalBound: false,
      boundContainers: new Set(),

      clearShow() {
        if (this.showTimer) {
          clearTimeout(this.showTimer);
          this.showTimer = null;
        }
      },

      hide(preserveWarm = true) {
        this.clearShow();
        const tip = document.getElementById(TOOLTIP_ID);
        if (tip && tip.classList.contains("visible")) {
          tip.classList.remove("visible");
          if (preserveWarm) {
            this.warmUntil = Date.now() + 300;
          }
        }
      },

      show(btn, placement) {
        if (!btn || !btn.isConnected || btn.disabled || btn.classList.contains("disabled")) return;
        const text = btn.getAttribute("data-tooltip");
        if (!text) return;
        const shortcut = btn.getAttribute("data-tooltip-shortcut") || "";

        const tip = ensureFloatingTooltip();
        tip.setAttribute("data-placement", placement === "bottom" ? "bottom" : "right");
        const cacheKey = `${text}\u0000${shortcut}`;
        if (tip.__dshCacheKey !== cacheKey) {
          tip.textContent = "";
          const labelSpan = document.createElement("span");
          labelSpan.textContent = text;
          tip.appendChild(labelSpan);
          if (shortcut) {
            const kbd = document.createElement("span");
            kbd.className = "dsh-codex-tip-kbd";
            kbd.textContent = shortcut;
            tip.appendChild(kbd);
          }
          tip.__dshCacheKey = cacheKey;
        }

        const z = getPageZoomFactor();
        const rect = getZoomRect(btn);
        const viewW = (window.innerWidth || 1280) / z;
        const viewH = (window.innerHeight || 800) / z;
        tip.classList.add("visible");

        if (placement === "bottom") {
          const tipW = tip.offsetWidth || 64;
          const tipH = tip.offsetHeight || 24;
          const rawLeft = rect.left + rect.width / 2 - tipW / 2;
          tip.style.left = `${Math.max(8, Math.min(viewW - tipW - 8, rawLeft))}px`;
          tip.style.top = `${Math.min(viewH - tipH - 6, rect.bottom + 6)}px`;
        } else {
          const tipH = tip.offsetHeight || 24;
          tip.style.left = `${rect.right + 8}px`;
          const rawTop = Math.round(rect.top + (rect.height - tipH) / 2);
          tip.style.top = `${Math.max(6, Math.min(viewH - tipH - 6, rawTop))}px`;
        }
      },

      scheduleShow(btn, placement) {
        if (!btn || btn.disabled || btn.classList.contains("disabled")) return;
        this.clearShow();
        if (Date.now() < this.warmUntil || document.getElementById(TOOLTIP_ID)?.classList.contains("visible")) {
          this.show(btn, placement);
          return;
        }
        this.showTimer = setTimeout(() => {
          this.showTimer = null;
          let stillActive = false;
          try {
            stillActive = Boolean(btn.isConnected && btn.matches(":hover, :focus-visible"));
          } catch (e) {
            stillActive = Boolean(btn.isConnected && document.activeElement === btn);
          }
          if (stillActive) this.show(btn, placement);
        }, 450);
      },

      ensureGlobalListeners() {
        if (this.globalBound) return;
        this.globalBound = true;

        const onWindowBlur = () => this.hide(false);
        const onWindowResize = () => this.hide(false);
        const onVisibilityChange = () => {
          if (document.hidden) this.hide(false);
        };
        const onKeydown = (e) => {
          if (e.key === "Escape") this.hide(false);
        };

        window.addEventListener("blur", onWindowBlur);
        window.addEventListener("resize", onWindowResize);
        document.addEventListener("visibilitychange", onVisibilityChange);
        window.addEventListener("keydown", onKeydown, true);

        cleanupTooltip = () => {
          this.hide(false);
          this.warmUntil = 0;
          this.globalBound = false;
          window.removeEventListener("blur", onWindowBlur);
          window.removeEventListener("resize", onWindowResize);
          document.removeEventListener("visibilitychange", onVisibilityChange);
          window.removeEventListener("keydown", onKeydown, true);
          this.boundContainers.forEach((rec) => {
            try {
              rec.el.removeEventListener("pointerover", rec.onOver, true);
              rec.el.removeEventListener("pointerout", rec.onOut, true);
              rec.el.removeEventListener("focusin", rec.onFocusIn, true);
              rec.el.removeEventListener("focusout", rec.onFocusOut, true);
              rec.el.removeEventListener("pointerdown", rec.onPointerDown, true);
              rec.el.__dshTipBound = false;
            } catch (e) {}
          });
          this.boundContainers.clear();
        };
      },

      bindContainer(container, placement) {
        if (!container || container.__dshTipBound) return;
        this.ensureGlobalListeners();
        container.__dshTipBound = true;

        const onOver = (e) => {
          if (e.pointerType === "touch") return;
          const btn = e.target?.closest?.("[data-tooltip]");
          if (btn) this.scheduleShow(btn, placement);
        };
        const onOut = (e) => {
          const fromBtn = e.target?.closest?.("[data-tooltip]");
          const toBtn = e.relatedTarget?.closest?.("[data-tooltip]");
          if (fromBtn && fromBtn !== toBtn) this.hide(true);
        };
        const onFocusIn = (e) => {
          const btn = e.target?.closest?.("[data-tooltip]");
          if (!btn) return;
          let focusVisible = true;
          try {
            focusVisible = btn.matches(":focus-visible");
          } catch (err) {}
          if (focusVisible) this.scheduleShow(btn, placement);
        };
        const onFocusOut = () => this.hide(true);
        const onPointerDown = () => this.hide(false);

        container.addEventListener("pointerover", onOver, true);
        container.addEventListener("pointerout", onOut, true);
        container.addEventListener("focusin", onFocusIn, true);
        container.addEventListener("focusout", onFocusOut, true);
        container.addEventListener("pointerdown", onPointerDown, true);

        this.boundContainers.add({ el: container, onOver, onOut, onFocusIn, onFocusOut, onPointerDown });
      }
    };

    function bindTooltipContainer(container, placement) {
      tooltipCtrl.bindContainer(container, placement);
    }

    // --- 按需边缘渐隐：仅在工具列表存在对应方向溢出时启用渐变遮罩 ---
    function updateToolsScrollFade(toolsBoxEl) {
      const toolsBox = toolsBoxEl || document.getElementById(TOOLS_BOX_ID);
      if (!toolsBox) return;
      const hasOverflow = (toolsBox.scrollHeight - toolsBox.clientHeight) > 2;
      const fadeTop = hasOverflow && toolsBox.scrollTop > 1;
      const fadeBottom = hasOverflow && (toolsBox.scrollTop + toolsBox.clientHeight < toolsBox.scrollHeight - 1);
      if (fadeTop) toolsBox.setAttribute("data-fade-top", "1");
      else toolsBox.removeAttribute("data-fade-top");
      if (fadeBottom) toolsBox.setAttribute("data-fade-bottom", "1");
      else toolsBox.removeAttribute("data-fade-bottom");
    }

    function bindToolsScrollFade(toolsBox) {
      if (!toolsBox || toolsBox.__dshFadeBound) return;
      toolsBox.__dshFadeBound = true;

      const onScroll = () => {
        tooltipCtrl.hide(false);
        updateToolsScrollFade(toolsBox);
      };
      const onResize = () => updateToolsScrollFade(toolsBox);

      toolsBox.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onResize, { passive: true });

      let ro = null;
      if (typeof ResizeObserver === "function") {
        try {
          ro = new ResizeObserver(() => updateToolsScrollFade(toolsBox));
          ro.observe(toolsBox);
        } catch (e) {}
      }

      const prevCleanup = cleanupToolsFade;
      cleanupToolsFade = () => {
        if (typeof prevCleanup === "function") {
          try { prevCleanup(); } catch (e) {}
        }
        try {
          toolsBox.removeEventListener("scroll", onScroll);
          toolsBox.__dshFadeBound = false;
        } catch (e) {}
        window.removeEventListener("resize", onResize);
        if (ro) {
          try { ro.disconnect(); } catch (e) {}
          ro = null;
        }
      };

      updateToolsScrollFade(toolsBox);
    }

    // --- 折叠态悬停工作区浮层预览（Hover Peek，与 dsh-claude-style 协同防冲突） ---
    function createHoverPeekController() {
      const PEEK_ENTER_MS = 220;
      const PEEK_LEAVE_MS = 320;
      const PEEK_EXIT_MS = 160;
      const PEEK_MIN_WIDTH_WITH_RIGHTBAR = 980;

      let state = "idle"; // "idle" | "waiting" | "open" | "closing"
      let frameEl = null;
      let activeTrigger = null;
      let sawExpanded = false;
      let frameAttrObs = null;
      let pointer = null;
      let enterTimer = null;
      let leaveTimer = null;
      let exitTimer = null;

      const clearTimers = () => {
        if (enterTimer) { clearTimeout(enterTimer); enterTimer = null; }
        if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
        if (exitTimer) { clearTimeout(exitTimer); exitTimer = null; }
      };

      const isReducedMotion = () => {
        try {
          return Boolean(
            window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ||
            document.body?.getAttribute?.("data-dsh-claude-motion") === "reduced"
          );
        } catch (e) {
          return false;
        }
      };

      const getSidebarCol = (frame) => (
        frame?.querySelector?.(':scope > .' + AF + '_sidebarCol, :scope > .mP3x-q_sidebarCol, :scope > .BynINW_sidebarCol') ||
        frame?.querySelector?.('.' + AF + '_sidebarCol, .mP3x-q_sidebarCol, .BynINW_sidebarCol') ||
        null
      );

      const getCenterCol = (frame) => (
        frame?.querySelector?.(':scope > .' + AF + '_centerCol, :scope > .mP3x-q_centerCol, :scope > .BynINW_centerCol') ||
        frame?.querySelector?.('.' + AF + '_centerCol, .mP3x-q_centerCol, .BynINW_centerCol') ||
        null
      );

      const getTriggerEl = (node) => {
        if (!node || typeof node.closest !== "function") return null;
        return node.closest(`#${TITLE_TOGGLE_ID}, #${RAIL_TOGGLE_ID}, #${HOME_BTN_ID}`);
      };

      const isPointInRect = (rect, pt, pad = 0) => (
        pt && rect &&
        pt.x >= rect.left - pad && pt.x <= rect.right + pad &&
        pt.y >= rect.top - pad && pt.y <= rect.bottom + pad
      );

      const canPeek = (frame) => {
        if (!frame || !frame.isConnected) return false;
        if (!frame.hasAttribute("data-sidebar-collapsed")) return false;
        if (frame.hasAttribute("data-sidebar-drawer")) return false;
        // 若 dsh-claude-style 已触发自身 peek，主动避让避免双触发冲突
        if (frame.hasAttribute("data-dsh-claude-sidebar-peek")) return false;
        if (navHistory.hasOpenModal()) return false;
        if (document.querySelector('[role="menu"]')) return false;
        const rightbarCollapsed = frame.hasAttribute("data-rightbar-collapsed");
        if (!rightbarCollapsed) {
          const w = frame.getBoundingClientRect?.().width || window.innerWidth || 0;
          if (w > 0 && w < PEEK_MIN_WIDTH_WITH_RIGHTBAR) return false;
        }
        return true;
      };

      const syncPeekWidth = () => {
        if (!frameEl) return;
        const root = getSidebarRoot();
        const w = root?.style?.width || (root?.getBoundingClientRect?.().width ? `${Math.round(root.getBoundingClientRect().width)}px` : "");
        if (w) frameEl.style.setProperty("--codex-peek-width", w);
      };

      const resetState = () => {
        clearTimers();
        if (frameAttrObs) {
          try { frameAttrObs.disconnect(); } catch (e) {}
          frameAttrObs = null;
        }
        if (frameEl) {
          frameEl.removeAttribute(PEEK_ATTR);
          frameEl.style.removeProperty("--codex-peek-rail");
          frameEl.style.removeProperty("--codex-peek-width");
        }
        frameEl = null;
        activeTrigger = null;
        sawExpanded = false;
        state = "idle";
      };

      const isPointerInSafeZone = () => {
        if (!pointer) return false;
        const col = getSidebarCol(frameEl);
        const colRect = col?.getBoundingClientRect?.() || null;
        if (colRect && isPointInRect(colRect, pointer, 4)) return true;

        const trig = activeTrigger?.isConnected ? activeTrigger : document.getElementById(TITLE_TOGGLE_ID) || document.getElementById(RAIL_TOGGLE_ID);
        const trigRect = trig?.getBoundingClientRect?.() || null;
        if (trigRect && isPointInRect(trigRect, pointer, 6)) return true;

        // 允许鼠标从顶栏 ◫ 或活动栏主页按钮平滑斜向移入浮层侧栏
        if (trigRect && colRect) {
          const bridgeRect = {
            left: Math.min(trigRect.left, colRect.left),
            right: Math.max(trigRect.right, colRect.left + 80),
            top: Math.min(trigRect.top, colRect.top),
            bottom: Math.max(trigRect.bottom, Math.min(colRect.bottom, trigRect.bottom + 48))
          };
          if (isPointInRect(bridgeRect, pointer, 4)) return true;
        }
        return false;
      };

      const isSidebarHeldBusy = (buttonsDown) => {
        if (buttonsDown) return true;
        if (document.querySelector('[role="menu"], [role="dialog"]:not([class*="_root"])')) return true;
        const col = getSidebarCol(frameEl);
        const activeEl = document.activeElement;
        if (col && activeEl && col.contains(activeEl)) {
          if (activeEl.matches?.('input, textarea, [contenteditable]:not([contenteditable="false"])')) return true;
        }
        return false;
      };

      const closePeek = () => {
        if (state !== "open" || !frameEl) return;
        if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
        state = "closing";
        frameEl.setAttribute(PEEK_ATTR, "closing");
        const delay = isReducedMotion() ? 0 : PEEK_EXIT_MS;
        exitTimer = setTimeout(() => {
          exitTimer = null;
          if (state !== "closing" || !frameEl) return;
          if (frameEl.hasAttribute("data-sidebar-collapsed")) {
            resetState();
          } else {
            toggleWorkspacePanelRaw();
            // 兜底：若宿主未同步更新属性，稍后复位状态避免残留
            exitTimer = setTimeout(() => {
              exitTimer = null;
              if (state === "closing") resetState();
            }, 260);
          }
        }, delay);
      };

      const evaluateLeave = (buttonsDown) => {
        if (state !== "open") return;
        if (isPointerInSafeZone() || isSidebarHeldBusy(buttonsDown)) {
          if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
          return;
        }
        if (!leaveTimer) {
          leaveTimer = setTimeout(() => {
            leaveTimer = null;
            if (state === "open" && !isPointerInSafeZone() && !isSidebarHeldBusy(false)) {
              closePeek();
            }
          }, PEEK_LEAVE_MS);
        }
      };

      const openPeek = () => {
        enterTimer = null;
        const frame = getAppFrame();
        if (state !== "waiting" || !canPeek(frame)) {
          state = "idle";
          activeTrigger = null;
          return;
        }
        const centerCol = getCenterCol(frame);
        const railOffset = centerCol ? (centerCol.offsetLeft || 0) : 0;

        frameEl = frame;
        sawExpanded = false;
        state = "open";
        tooltipCtrl.hide(false);

        frameEl.style.setProperty("--codex-peek-rail", `${railOffset}px`);
        frameEl.setAttribute(PEEK_ATTR, "open");

        if (typeof MutationObserver === "function") {
          frameAttrObs = new MutationObserver(() => {
            if (!frameEl) return;
            if (frameEl.hasAttribute("data-sidebar-drawer")) {
              resetState();
              return;
            }
            if (!frameEl.hasAttribute("data-sidebar-collapsed")) {
              sawExpanded = true;
              syncPeekWidth();
            } else if (sawExpanded) {
              resetState();
            }
          });
          frameAttrObs.observe(frameEl, { attributes: true, attributeFilter: ["data-sidebar-collapsed", "data-sidebar-drawer"] });
        }

        if (!toggleWorkspacePanelRaw()) {
          resetState();
        }
      };

      const onPointerOver = (e) => {
        if (e.pointerType === "touch") return;
        if (state !== "idle") return;
        const trig = getTriggerEl(e.target);
        if (!trig) return;
        const frame = getAppFrame();
        if (!canPeek(frame)) return;
        activeTrigger = trig;
        state = "waiting";
        enterTimer = setTimeout(openPeek, PEEK_ENTER_MS);
      };

      const onPointerOut = (e) => {
        if (e.relatedTarget === null) {
          pointer = null;
          evaluateLeave(false);
        }
        if (state !== "waiting") return;
        const nextTrig = getTriggerEl(e.relatedTarget);
        if (!nextTrig || nextTrig !== activeTrigger) {
          clearTimers();
          activeTrigger = null;
          state = "idle";
        }
      };

      const onPointerMove = (e) => {
        pointer = { x: e.clientX, y: e.clientY };
        if (state === "open") {
          evaluateLeave(e.buttons !== 0);
        }
      };

      const onDocumentClick = (e) => {
        if (state !== "open" || !frameEl) return;
        const col = getSidebarCol(frameEl);
        if (col && col.contains(e.target)) {
          const picked = e.target?.closest?.(
            '[data-row-key^="session:"], .' + SB + '_newSession, ._2H3hWW_newSession, [class*="_newSession"]'
          );
          if (!picked) return;
          // 点击会话行的右键/更多菜单按钮时不关闭预览
          if (e.target?.closest?.('[aria-haspopup="menu"], [data-dsh-claude-part~="row-actions"]')) return;
          closePeek();
          return;
        }
        // 点击触发按钮本身交给其 click 处理器执行 pinIfActive()；点击主对话区或工具面板入口则立即收起预览
        if (getTriggerEl(e.target)) return;
        if (e.target?.closest?.('[role="menu"], [role="dialog"]')) return;
        closePeek();
      };

      const onKeydown = (e) => {
        if (e.key === "Escape" && state === "open") {
          closePeek();
        }
      };

      const onBlur = () => {
        if (state === "waiting") {
          clearTimers();
          activeTrigger = null;
          state = "idle";
        } else if (state === "open") {
          closePeek();
        }
      };

      document.addEventListener("pointerover", onPointerOver, true);
      document.addEventListener("pointerout", onPointerOut, true);
      document.addEventListener("pointermove", onPointerMove, { capture: true, passive: true });
      document.addEventListener("click", onDocumentClick);
      window.addEventListener("keydown", onKeydown, true);
      window.addEventListener("blur", onBlur);

      const api = {
        getState: () => state,
        cancelWaiting() {
          if (state === "waiting") {
            clearTimers();
            activeTrigger = null;
            state = "idle";
          }
        },
        // 点击切换/主页按钮时，将当前浮层预览直接固定为正常展开侧栏
        pinIfActive() {
          if ((state === "open" || state === "closing") && frameEl && !frameEl.hasAttribute("data-sidebar-collapsed")) {
            resetState();
            return true;
          }
          if (state === "waiting") {
            this.cancelWaiting();
          }
          return false;
        },
        abortAndCollapse() {
          const shouldCollapse = (state === "open" || state === "closing") && frameEl && !frameEl.hasAttribute("data-sidebar-collapsed");
          resetState();
          if (shouldCollapse) {
            toggleWorkspacePanelRaw();
          }
        },
        dispose() {
          document.removeEventListener("pointerover", onPointerOver, true);
          document.removeEventListener("pointerout", onPointerOut, true);
          document.removeEventListener("pointermove", onPointerMove, true);
          document.removeEventListener("click", onDocumentClick);
          window.removeEventListener("keydown", onKeydown, true);
          window.removeEventListener("blur", onBlur);
          this.abortAndCollapse();
        }
      };

      cleanupPeek = () => api.dispose();
      return api;
    }

    function syncToggleButtons(collapsed) {
      const label = collapsed ? "打开侧边栏" : "收起侧边栏";
      const shortcut = getShortcutText("toggle");
      const expandedVal = collapsed ? "false" : "true";
      for (const id of [TITLE_TOGGLE_ID, RAIL_TOGGLE_ID]) {
        const btn = document.getElementById(id);
        if (!btn) continue;
        if (btn.getAttribute("data-tooltip") !== label) btn.setAttribute("data-tooltip", label);
        if (btn.getAttribute("data-tooltip-shortcut") !== shortcut) btn.setAttribute("data-tooltip-shortcut", shortcut);
        if (btn.getAttribute("aria-label") !== label) btn.setAttribute("aria-label", label);
        if (btn.getAttribute("aria-expanded") !== expandedVal) btn.setAttribute("aria-expanded", expandedVal);
      }

      const backBtn = document.getElementById(BACK_BTN_ID);
      if (backBtn) {
        const s = getShortcutText("back");
        if (backBtn.getAttribute("data-tooltip-shortcut") !== s) backBtn.setAttribute("data-tooltip-shortcut", s);
      }
      const fwdBtn = document.getElementById(FWD_BTN_ID);
      if (fwdBtn) {
        const s = getShortcutText("forward");
        if (fwdBtn.getAttribute("data-tooltip-shortcut") !== s) fwdBtn.setAttribute("data-tooltip-shortcut", s);
      }
      const railNewBtn = document.getElementById(RAIL_NEW_BTN_ID);
      if (railNewBtn) {
        const s = getShortcutText("new");
        if (railNewBtn.getAttribute("data-tooltip-shortcut") !== s) railNewBtn.setAttribute("data-tooltip-shortcut", s);
      }
    }

    function ensureTitleNav() {
      let nav = document.getElementById(TITLE_NAV_ID);
      if (!nav) {
        nav = document.createElement("div");
        nav.id = TITLE_NAV_ID;
        nav.setAttribute("role", "toolbar");
        nav.setAttribute("aria-label", "窗口导航");
        nav.setAttribute("data-window-drag-exclude", "");

        const backBtn = document.createElement("button");
        backBtn.id = BACK_BTN_ID;
        backBtn.type = "button";
        backBtn.className = "dsh-codex-title-btn disabled";
        backBtn.disabled = true;
        backBtn.setAttribute("aria-label", "后退");
        backBtn.setAttribute("data-tooltip", "后退");
        backBtn.setAttribute("data-tooltip-shortcut", getShortcutText("back"));
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
        fwdBtn.setAttribute("aria-label", "前进");
        fwdBtn.setAttribute("data-tooltip", "前进");
        fwdBtn.setAttribute("data-tooltip-shortcut", getShortcutText("forward"));
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
        toggleBtn.setAttribute("aria-label", "收起侧边栏");
        toggleBtn.setAttribute("data-tooltip", "收起侧边栏");
        toggleBtn.setAttribute("data-tooltip-shortcut", getShortcutText("toggle"));
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
      let wsPollTimer = null;
      let wsPollStopTimer = null;
      let newSessionTimer = null;

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
          wsPollTimer = setInterval(() => {
            if (tryBindUiWs()) {
              clearInterval(wsPollTimer);
              wsPollTimer = null;
              if (wsPollStopTimer) {
                clearTimeout(wsPollStopTimer);
                wsPollStopTimer = null;
              }
            }
          }, 300);
          wsPollStopTimer = setTimeout(() => {
            wsPollStopTimer = null;
            if (wsPollTimer) {
              clearInterval(wsPollTimer);
              wsPollTimer = null;
            }
          }, 8000);
        }
      } catch (e) {}

      const handleClick = (e) => {
        try {
          const row = e.target?.closest?.('[data-row-key^="session:"]');
          if (row) {
            const sid = row.getAttribute("data-row-key")?.replace(/^session:/, "");
            if (sid) navHistory.onSessionChanged(sid);
            return;
          }

          const newBtn = e.target?.closest?.(
            '._2H3hWW_newSession, .' + SB + '_newSession, [class*="_newSession"], [data-slot="sidebar.session.action"] button:not([class*="_trigger"]), [aria-label*="新会话"], [aria-label*="新建会话"], [aria-label*="New session"]'
          );
          if (newBtn) {
            if (newSessionTimer) clearTimeout(newSessionTimer);
            newSessionTimer = setTimeout(() => {
              newSessionTimer = null;
              const newSid = navHistory.getCurrentSessionId();
              if (newSid) navHistory.onSessionChanged(newSid);
            }, 300);
          }
        } catch (err) {}
      };
      document.addEventListener("click", handleClick, true);

      const handleKeydown = (e) => {
        if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.isComposing || e.repeat) return;
        // 输入框/编辑器内保留系统原生 Alt+方向键行为，避免抢占光标操作
        const t = e.target;
        if (t?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return;
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          navHistory.back();
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          navHistory.forward();
        }
      };
      window.addEventListener("keydown", handleKeydown);

      cleanupHistory = () => {
        historyInited = false;
        if (wsPollTimer) { clearInterval(wsPollTimer); wsPollTimer = null; }
        if (wsPollStopTimer) { clearTimeout(wsPollStopTimer); wsPollStopTimer = null; }
        if (newSessionTimer) { clearTimeout(newSessionTimer); newSessionTimer = null; }
        navHistory.reset();
        if (unsubWs) {
          try { unsubWs(); } catch (e) {}
          unsubWs = null;
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
        rail.setAttribute("role", "navigation");
        rail.setAttribute("aria-label", "活动栏");
        rail.setAttribute("data-window-drag-exclude", "");

        // 支持键盘上下方向键在活动栏可见按钮间快速移动焦点（类 Codex / VS Code 活动栏）
        rail.addEventListener("keydown", (e) => {
          if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
          if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
          const current = e.target?.closest?.("button");
          if (!current || !rail.contains(current)) return;
          const buttons = Array.from(rail.querySelectorAll("button")).filter((b) => {
            if (b.disabled) return false;
            try {
              const cs = window.getComputedStyle?.(b);
              if (cs && cs.display === "none") return false;
            } catch (err) {}
            return true;
          });
          const idx = buttons.indexOf(current);
          if (idx < 0 || buttons.length < 2) return;
          e.preventDefault();
          let nextIdx = idx;
          if (e.key === "ArrowDown") nextIdx = (idx + 1) % buttons.length;
          else if (e.key === "ArrowUp") nextIdx = (idx - 1 + buttons.length) % buttons.length;
          else if (e.key === "Home") nextIdx = 0;
          else if (e.key === "End") nextIdx = buttons.length - 1;
          buttons[nextIdx]?.focus?.();
        });

        const topGroup = document.createElement("div");
        topGroup.id = "dsh-codex-top-group";

        // 全屏或非 Windows 顶栏模式时的折叠兜底按键
        const railToggleBtn = document.createElement("button");
        railToggleBtn.id = RAIL_TOGGLE_ID;
        railToggleBtn.type = "button";
        railToggleBtn.className = "dsh-codex-action-btn";
        railToggleBtn.style.cssText = BTN_STYLE_INLINE;
        railToggleBtn.setAttribute("aria-label", "收起侧边栏");
        railToggleBtn.setAttribute("data-tooltip", "收起侧边栏");
        railToggleBtn.setAttribute("data-tooltip-shortcut", getShortcutText("toggle"));
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
        homeBtn.setAttribute("aria-label", "主页与工作区");
        homeBtn.setAttribute("data-tooltip", "主页与工作区");
        homeBtn.innerHTML = SVG.home;

        homeBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();

          try {
            const layout = getLayoutService();
            if (layout && typeof layout.selectPanel === "function") {
              layout.selectPanel(null);
            }
          } catch (err) {}

          const modalClose = navHistory.getOpenModalCloseBtn();
          if (modalClose) {
            try { modalClose.click(); } catch (err) {}
          }

          if (peekCtrl && peekCtrl.pinIfActive()) {
            return;
          }
          if (peekCtrl) peekCtrl.cancelWaiting();

          const rootEl = getSidebarRoot();
          if (isSidebarCollapsed(rootEl)) {
            toggleWorkspacePanelRaw();
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
        railNewBtn.setAttribute("aria-label", "新会话");
        railNewBtn.setAttribute("data-tooltip", "新会话");
        railNewBtn.setAttribute("data-tooltip-shortcut", getShortcutText("new"));
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
      const toolsBox = document.getElementById(TOOLS_BOX_ID);
      if (toolsBox) bindToolsScrollFade(toolsBox);
      return rail;
    }

    function resolveIcon(el, label) {
      // 优先使用源节点自身携带的 SVG（保持 DSH 与插件原始设计语言）
      const svg = el.querySelector?.("svg");
      if (svg) return svg.outerHTML;

      const img = el.querySelector?.("img");
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

    // 读取元素的纯文本，严格跳过 <svg> 内的 <title>/<desc> 与角标节点，防止折叠态文本抖动
    function getCleanText(el, skipNode) {
      if (!el) return "";
      const parts = [];
      const walk = (node) => {
        if (!node || node === skipNode) return;
        if (node.nodeType === 3) {
          const t = (node.nodeValue || "").trim();
          if (t) parts.push(t);
          return;
        }
        if (node.nodeType === 1) {
          const tag = (node.tagName || "").toLowerCase();
          if (tag === "svg" || tag === "style" || tag === "script") return;
          if (node.childNodes && node.childNodes.length) {
            for (const child of node.childNodes) walk(child);
          }
        }
      };
      walk(el);
      return parts.join(" ").trim();
    }

    function parseDetails(el) {
      let label = "";
      let badge = "";

      const badgeNode = el.querySelector?.('[class*="badge"], [class*="Badge"], .dsh-memory-sidebar-badge, .dsh-ext-sidebar-badge, .dsh-trending-sidebar-badge, .dsh-agy-auto-sidebar-badge');
      if (badgeNode && badgeNode.textContent) {
        badge = badgeNode.textContent.trim();
      }

      const ariaLabel = (el.getAttribute?.("aria-label") || "").trim();
      const isNativePanelRow = Boolean(
        el.matches?.('.' + SB + '_panelRow, ._2H3hWW_panelRow, [class*="_panelRow"]') ||
        el.closest?.('[class*="moreAnchor"]')
      );

      // 原生 PanelRow / PanelMoreMenu 在折叠态会卸载 .panelTitle 但始终保留稳定的 aria-label
      if (isNativePanelRow && ariaLabel) {
        label = ariaLabel;
      } else {
        const labelCandidates = el.querySelectorAll?.('[class*="label"], [class*="Label"], [class*="title"], [class*="Title"], .dsh-memory-sidebar-label, .dsh-ext-sidebar-label, .dsh-trending-sidebar-label, .dsh-agy-auto-sidebar-label') || [];
        for (const node of labelCandidates) {
          const tag = (node.tagName || "").toLowerCase();
          if (tag === "title" || node.closest?.("svg")) continue;
          const txt = getCleanText(node, badgeNode);
          if (txt) {
            label = txt;
            break;
          }
        }
        if (!label) {
          const fullText = getCleanText(el, badgeNode);
          label = badge && fullText ? fullText.replace(badge, "").trim() : fullText;
        }
        if (!label) {
          label = ariaLabel || (el.getAttribute?.("title") || "").trim() || "面板";
        }
      }

      return { label, badge, ariaLabel };
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

    // 点击“更多”等菜单触发器前，同步将外层 .moreAnchor（承载 CSS anchor-name）与按钮自身固定到当前活动栏按钮坐标
    function positionMenuAnchor(target, btn) {
      const rect = getZoomRect(btn);
      const anchor = target.closest?.('[class*="_moreAnchor"], [class*="moreAnchor"]');
      const nodes = anchor && anchor !== target ? [anchor, target] : [target];
      for (const node of nodes) {
        node.setAttribute(ANCHORED_ATTR, "1");
        node.style.setProperty("position", "fixed", "important");
        node.style.setProperty("left", `${rect.left}px`, "important");
        node.style.setProperty("top", `${rect.top}px`, "important");
        node.style.setProperty("width", `${rect.width}px`, "important");
        node.style.setProperty("height", `${rect.height}px`, "important");
        node.style.setProperty("margin", "0", "important");
        node.style.setProperty("padding", "0", "important");
      }
    }

    function isSourceEntryActive(sourceEl) {
      if (!sourceEl) return false;
      const parent = sourceEl.parentElement;
      return Boolean(
        sourceEl.classList?.contains("active") ||
        sourceEl.matches?.('[class*="_panelActive"], [aria-selected="true"], [aria-current="page"]') ||
        (parent && Array.from(parent.classList || []).some((c) => c.includes("_panelEntryActive")))
      );
    }

    // 瞬时同步主页按钮与已挂载面板按钮的高亮态（由 layout.panelInfo.subscribe 零延迟驱动）
    function syncPanelHighlight(activePanelIdOverride) {
      const root = getSidebarRoot();
      const collapsed = isSidebarCollapsed(root);
      const activePanelId = activePanelIdOverride !== undefined ? activePanelIdOverride : getActivePanelId();

      syncToggleButtons(collapsed);

      const homeBtn = document.getElementById(HOME_BTN_ID);
      if (homeBtn) {
        const homeActive = !collapsed && activePanelId === null;
        homeBtn.classList.toggle("active", homeActive);
        if (homeActive) homeBtn.setAttribute("aria-current", "page");
        else homeBtn.removeAttribute("aria-current");
      }

      const toolsBox = document.getElementById(TOOLS_BOX_ID);
      if (toolsBox) {
        Array.from(toolsBox.children).forEach((btn) => {
          const target = btn.__dshSourceEl;
          if (!target || !target.isConnected) return;
          const panelId = target.getAttribute?.("data-panel-id");
          let isActive;
          if (panelId && activePanelId !== undefined) {
            isActive = activePanelId === panelId;
          } else {
            isActive = activePanelId === null ? false : isSourceEntryActive(target);
          }
          // 第三方非 main-panel 入口仍以其 DOM active 状态为准
          if (activePanelId === null && !target.matches?.('.' + SB + '_panelRow, ._2H3hWW_panelRow, [class*="_panelRow"]')) {
            isActive = isSourceEntryActive(target);
          }
          btn.classList.toggle("active", Boolean(isActive));
          if (isActive) btn.setAttribute("aria-current", "page");
          else btn.removeAttribute("aria-current");
        });
      }

      navHistory.updateUI();
    }

    function initPanelInfoSync() {
      let unsubPanel = null;
      let pollTimer = null;
      let pollStopTimer = null;
      let rafHandle = null;
      let rafFallbackTimer = null;

      const schedulePostCommitHighlight = (nextId) => {
        if (rafHandle && typeof cancelAnimationFrame === "function") {
          cancelAnimationFrame(rafHandle);
          rafHandle = null;
        }
        if (rafFallbackTimer) {
          clearTimeout(rafFallbackTimer);
          rafFallbackTimer = null;
        }
        if (typeof requestAnimationFrame === "function") {
          rafHandle = requestAnimationFrame(() => {
            rafHandle = null;
            syncPanelHighlight(nextId);
          });
        } else {
          rafFallbackTimer = setTimeout(() => {
            rafFallbackTimer = null;
            syncPanelHighlight(nextId);
          }, 16);
        }
      };

      const trySubscribe = () => {
        const layout = getLayoutService();
        if (layout?.panelInfo && typeof layout.panelInfo.subscribe === "function") {
          unsubPanel = layout.panelInfo.subscribe((snap) => {
            const nextId = snap ? (snap.activePanelId ?? null) : getActivePanelId();
            syncPanelHighlight(nextId);
            // 等 React 提交完 PanelRow 的 aria-current/class 后在微任务与下一帧精确校对一次
            if (typeof queueMicrotask === "function") {
              queueMicrotask(() => syncPanelHighlight(nextId));
            }
            schedulePostCommitHighlight(nextId);
          });
          return true;
        }
        return false;
      };

      try {
        if (!trySubscribe()) {
          pollTimer = setInterval(() => {
            if (trySubscribe()) {
              clearInterval(pollTimer);
              pollTimer = null;
              if (pollStopTimer) {
                clearTimeout(pollStopTimer);
                pollStopTimer = null;
              }
            }
          }, 300);
          pollStopTimer = setTimeout(() => {
            pollStopTimer = null;
            if (pollTimer) {
              clearInterval(pollTimer);
              pollTimer = null;
            }
          }, 8000);
        }
      } catch (e) {}

      cleanupPanelInfo = () => {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        if (pollStopTimer) { clearTimeout(pollStopTimer); pollStopTimer = null; }
        if (rafHandle && typeof cancelAnimationFrame === "function") {
          cancelAnimationFrame(rafHandle);
          rafHandle = null;
        }
        if (rafFallbackTimer) { clearTimeout(rafFallbackTimer); rafFallbackTimer = null; }
        if (unsubPanel) {
          try { unsubPanel(); } catch (e) {}
          unsubPanel = null;
        }
      };
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

        // 窄屏抽屉模式下：还原原生设置区与面板入口，中止悬停预览，确保原生抽屉内功能 100% 完整
        if (isDrawerActive()) {
          if (peekCtrl) peekCtrl.abortAndCollapse();
          tooltipCtrl.hide(false);
          restoreNativeSettingsArea();
          restoreHiddenSources();
          syncToggleButtons(isSidebarCollapsed(root));
          navHistory.updateUI();
          return;
        }

        ensureRail();
        const toolsBox = document.getElementById(TOOLS_BOX_ID);
        if (!toolsBox) return;

        // 1. 同步主页与收展按钮状态（仅在侧边栏未折叠且未停留在其他面板时高亮主页）
        const collapsed = isSidebarCollapsed(root);
        const activePanelId = getActivePanelId();
        syncToggleButtons(collapsed);

        const homeBtn = document.getElementById(HOME_BTN_ID);
        if (homeBtn) {
          const homeActive = !collapsed && activePanelId === null;
          homeBtn.classList.toggle("active", homeActive);
          if (homeActive) homeBtn.setAttribute("aria-current", "page");
          else homeBtn.removeAttribute("aria-current");
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
        const claudeUiExclude =
          '[class*="dsh-claude-"], #dsh-claude-account-popover, ' +
          '[data-dsh-claude-account-menu], [data-dsh-claude-more-menu], [data-dsh-claude-hero-menu], ' +
          '[data-dsh-claude-footer-block], [data-dsh-claude-footer-entry], [data-dsh-claude-footer-seat], ' +
          '[data-dsh-claude-part~="search-button"], [data-dsh-claude-part~="brand-button"], [data-dsh-claude-part~="sidebar-toggle"]';

        Array.from(root.children).forEach((el) => {
          if (!el) return;
          if (el.matches?.(
            '.' + SB + '_topStrip, .' + SB + '_logoRow, .' + SB + '_brand, .' + SB + '_newSession, .' + SB + '_newSessionRow, .' + SB + '_scrollRegion, .' + SB + '_regionArea, .' + SB + '_panelList, .' + SB + '_footArea, .' + SB + '_settingsArea, [data-slot*="settings"], ' + claudeUiExclude
          )) return;
          if (el.tagName === "BUTTON" || el.tagName === "A" || el.getAttribute?.("role") === "button" || el.hasAttribute?.("data-dsh-plugin")) {
            sourceElements.add(el);
          }
        });

        for (const sel of selectors) {
          try {
            document.querySelectorAll(sel).forEach((el) => {
              if (el &&
                  !el.classList?.contains(SB + "_panelUnpin") &&
                  !el.closest?.(".dsh-memory-modal-overlay") &&
                  !el.closest?.(".dsh-ext-modal-overlay") &&
                  !el.closest?.(".dsh-trending-modal-panel") &&
                  !el.closest?.('[class*="_regionArea"]') &&
                  !el.closest?.('[class*="_footArea"]') &&
                  !el.closest?.('[class*="_settingsArea"]') &&
                  !el.closest?.('[data-slot*="settings"]') &&
                  !el.closest?.(claudeUiExclude) &&
                  !el.closest?.(`#${RAIL_ID}`)) {
                sourceElements.add(el);
              }
            });
          } catch (e) {}
        }

        // 严格传递排序：原生固定面板按真实 panelList DOM 顺序 -> 第三方插件入口 -> “更多”菜单始终居尾
        const panelListEl = root.querySelector('nav.' + SB + '_panelList, nav._2H3hWW_panelList');
        const nativeOrder = new Map();
        if (panelListEl) {
          panelListEl.querySelectorAll('button, a, [role="button"]').forEach((node, idx) => {
            nativeOrder.set(node, idx);
          });
        }
        const orderedSources = Array.from(sourceElements)
          .map((el, insertIdx) => {
            const isMore = Boolean(
              el.getAttribute?.("aria-haspopup") === "menu" &&
              el.closest?.('[class*="moreAnchor"]')
            );
            const inNative = nativeOrder.has(el);
            const group = isMore ? 2 : (inNative ? 0 : 1);
            const rank = inNative ? nativeOrder.get(el) : insertIdx;
            return { el, group, rank };
          })
          .sort((a, b) => (a.group - b.group) || (a.rank - b.rank))
          .map((item) => item.el);

        const validKeys = new Set();
        const orderedBtns = [];

        orderedSources.forEach((sourceEl) => {
          try {
            const { label, badge, ariaLabel } = parseDetails(sourceEl);
            const isMoreTrigger = Boolean(
              sourceEl.getAttribute?.("aria-haspopup") === "menu" &&
              sourceEl.closest?.('[class*="moreAnchor"]')
            );
            const rawKey = sourceEl.id ||
                           sourceEl.getAttribute?.("data-panel-id") ||
                           sourceEl.getAttribute?.("data-dsh-plugin") ||
                           sourceEl.getAttribute?.("data-slot") ||
                           (isMoreTrigger ? "dsh-panel-more" : "") ||
                           `item-${ariaLabel || label}`;
            let key = rawKey;
            let suffix = 1;
            while (validKeys.has(key)) {
              key = `${rawKey}-${suffix++}`;
            }
            validKeys.add(key);

            let btn = null;
            for (const child of toolsBox.children) {
              if (child.getAttribute?.("data-key") === key) {
                btn = child;
                break;
              }
            }
            if (!btn) {
              btn = document.createElement("button");
              btn.type = "button";
              btn.className = "dsh-codex-action-btn";
              btn.style.cssText = BTN_STYLE_INLINE;
              btn.setAttribute("data-key", key);

              // 记录按下瞬间菜单是否已打开，防止 Primitives.Menu 的 document pointerdown 关闭后 click 再次误打开
              btn.addEventListener("pointerdown", () => {
                const target = btn.__dshSourceEl;
                btn.__dshMenuWasOpen = Boolean(
                  target &&
                  target.isConnected &&
                  target.getAttribute?.("aria-haspopup") === "menu" &&
                  target.getAttribute?.("aria-expanded") === "true"
                );
              });

              btn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                try {
                  let target = btn.__dshSourceEl;
                  const wasOpenOnDown = Boolean(btn.__dshMenuWasOpen);
                  btn.__dshMenuWasOpen = false;

                  // 若源节点在防抖窗口内已被 React 重建，同步刷新一次重新获取最新引用
                  if (!target || !target.isConnected) {
                    syncAll();
                    target = btn.__dshSourceEl;
                  }
                  if (!target || !target.isConnected) return;

                  if (wasOpenOnDown && target.getAttribute?.("aria-expanded") !== "true") {
                    return;
                  }

                  if (target.getAttribute?.("aria-haspopup") === "menu" || target.closest?.('[class*="moreAnchor"]')) {
                    positionMenuAnchor(target, btn);
                  }
                  target.click();
                } catch (err) {
                  console.warn("[dsh-codex] click target error:", err);
                }
              });

              toolsBox.appendChild(btn);
            }

            // 每次同步始终刷新最新 sourceEl 引用，彻底消除 React 重渲染导致的过时闭包问题
            btn.__dshSourceEl = sourceEl;
            orderedBtns.push(btn);

            const nextTooltip = badge && badge !== "·" ? `${label} (${badge})` : label;
            if (btn.getAttribute("data-tooltip") !== nextTooltip) {
              btn.setAttribute("data-tooltip", nextTooltip);
            }
            if (btn.getAttribute("aria-label") !== nextTooltip) {
              btn.setAttribute("aria-label", nextTooltip);
            }

            const hasPopup = sourceEl.getAttribute?.("aria-haspopup");
            if (hasPopup) {
              if (btn.getAttribute("aria-haspopup") !== hasPopup) btn.setAttribute("aria-haspopup", hasPopup);
              const expanded = sourceEl.getAttribute?.("aria-expanded");
              if (expanded !== null && expanded !== undefined) {
                if (btn.getAttribute("aria-expanded") !== expanded) btn.setAttribute("aria-expanded", expanded);
              }
            } else {
              btn.removeAttribute("aria-haspopup");
              btn.removeAttribute("aria-expanded");
            }

            const isActive = isSourceEntryActive(sourceEl);
            btn.classList.toggle("active", isActive);
            if (isActive) btn.setAttribute("aria-current", "page");
            else btn.removeAttribute("aria-current");

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

        Array.from(toolsBox.children).forEach((child) => {
          const key = child.getAttribute("data-key");
          if (key && !validKeys.has(key)) {
            child.remove();
          }
        });

        // 仅在顺序不一致时调整子节点顺序，避免无谓的 DOM 重排与焦点丢失
        for (let i = 0; i < orderedBtns.length; i++) {
          const expected = orderedBtns[i];
          const current = toolsBox.children[i];
          if (current !== expected) {
            toolsBox.insertBefore(expected, current || null);
          }
        }

        updateToolsScrollFade(toolsBox);
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
        initPanelInfoSync();
        peekCtrl = createHoverPeekController();

        let scheduled = null;
        let idleHandle = null;
        let idleFallbackTimer = null;
        const runIdle = (fn) => {
          if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
            idleHandle = window.requestIdleCallback(fn, { timeout: 250 });
            return idleHandle;
          }
          idleFallbackTimer = setTimeout(fn, 0);
          return idleFallbackTimer;
        };
        const cancelPendingSync = () => {
          if (scheduled) {
            clearTimeout(scheduled);
            scheduled = null;
          }
          if (idleFallbackTimer) {
            clearTimeout(idleFallbackTimer);
            idleFallbackTimer = null;
          }
          if (idleHandle && typeof window !== "undefined" && typeof window.cancelIdleCallback === "function") {
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
              idleFallbackTimer = null;
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

        const isTransientNode = (node) => (
          node.nodeType !== 1 ||
          node.id === TOOLTIP_ID ||
          node.id === OVERLAY_ROOT_ID ||
          Boolean(node.matches?.(
            '.dsh-claude-caret-layer, .dsh-claude-pointer-hint, .dsh-claude-send-flight, ' +
            '.dsh-claude-turn-nav, .dsh-claude-popover-card, #dsh-claude-account-popover, ' +
            '[data-dsh-claude-caret], [data-dsh-claude-caret-layer], [role="tooltip"]'
          ))
        );

        const observer = new MutationObserver((mutations) => {
          let shouldUpdate = false;
          for (const m of mutations) {
            if (m.target?.id === RAIL_ID || m.target?.closest?.(`#${RAIL_ID}`) ||
                m.target?.id === TITLE_NAV_ID || m.target?.closest?.(`#${TITLE_NAV_ID}`) ||
                m.target?.id === TOOLTIP_ID || m.target?.id === OVERLAY_ROOT_ID || m.target?.closest?.(`#${OVERLAY_ROOT_ID}`)) continue;
            // 忽略主对话区、右侧预览栏及 dsh-claude-style 高频浮层/光标/输入区 DOM 变动，降低 CPU 占用
            if (m.target?.closest?.(
              '[data-slot="main.conversation"], [data-slot="rightbar"], [data-sidebar-right-panel], ' +
              '[data-slot="conversation.input.dock"], [data-slot="conversation.composer.bar"], ' +
              '[data-dsh-claude-caret-layer], .dsh-claude-pointer-hint, .dsh-claude-turn-nav, ' +
              '#dsh-claude-account-popover, [data-dsh-claude-account-menu], [data-dsh-claude-hero-menu], ' +
              '.dsh-claude-search-dialog, [role="tooltip"], textarea, input'
            )) continue;

            if (m.type === "attributes" && m.attributeName === "aria-expanded") {
              if (!m.target?.closest?.('[class*="_panelList"], [class*="moreAnchor"]')) continue;
            }

            if (m.type === "childList") {
              const allTransient =
                Array.from(m.addedNodes).every(isTransientNode) &&
                Array.from(m.removedNodes).every(isTransientNode);
              if (allTransient) continue;
            }

            shouldUpdate = true;
            break;
          }
          if (shouldUpdate) scheduleSync();
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: [
            "class",
            "data-sidebar-collapsed",
            "data-sidebar-drawer",
            "aria-selected",
            "aria-current",
            "aria-expanded",
            "data-we-wallpaper",
            "data-we-left-sidebar",
            "data-we-sidebar-fullclear",
            "data-dsh-claude-footer-takeover",
            "data-dsh-claude-page-zoom",
            "data-dsh-claude-sidebar-peek"
          ]
        });

        // 监听 html 根节点平台与全屏状态变化（仅单节点非子树，零性能损耗）
        const htmlObserver = new MutationObserver(() => {
          syncToggleButtons(isSidebarCollapsed());
          updateToolsScrollFade();
        });
        if (document.documentElement) {
          htmlObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["data-fullscreen", "data-windows-titlebar", "data-platform"]
          });
        }

        let cleaned = false;
        window.__DSH_CODEX_CLEANUP__ = () => {
          if (cleaned) return;
          cleaned = true;
          try {
            cancelPendingSync();
            observer.disconnect();
            htmlObserver.disconnect();
            if (typeof cleanupPeek === "function") {
              try { cleanupPeek(); } catch (e) {}
              cleanupPeek = null;
            }
            peekCtrl = null;
            if (typeof cleanupPanelInfo === "function") {
              try { cleanupPanelInfo(); } catch (e) {}
              cleanupPanelInfo = null;
            }
            if (typeof cleanupToolsFade === "function") {
              try { cleanupToolsFade(); } catch (e) {}
              cleanupToolsFade = null;
            }
            if (typeof cleanupTooltip === "function") {
              try { cleanupTooltip(); } catch (e) {}
              cleanupTooltip = null;
            }
            if (typeof cleanupHistory === "function") {
              try { cleanupHistory(); } catch (e) {}
              cleanupHistory = null;
            }
            historyInited = false;
            clearPeekAttributes();
            restoreNativeSettingsArea();
            restoreHiddenSources();
            document.getElementById(TITLE_NAV_ID)?.remove();
            document.getElementById(TOOLTIP_ID)?.remove();
            document.getElementById(OVERLAY_ROOT_ID)?.remove();
            document.getElementById(STYLE_ID)?.remove();
            document.getElementById(RAIL_ID)?.remove();
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
