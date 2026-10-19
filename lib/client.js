window.__ModuleLoader__.load({
  id: "dsh-codex-rail",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    // 永久固定全局唯一 ID，杜绝频繁换 ID 导致旧节点漂移
    const STYLE_ID = "dsh-codex-sidebar-style";
    const RAIL_ID = "dsh-codex-sidebar-rail";
    const TOOLS_BOX_ID = "dsh-codex-sidebar-tools";
    const TITLE_NAV_ID = "dsh-codex-titlebar-nav";
    const BACK_BTN_ID = "dsh-codex-btn-back";
    const FWD_BTN_ID = "dsh-codex-btn-forward";
    const TITLE_TOGGLE_ID = "dsh-codex-btn-title-toggle";
    const TOGGLE_BTN_ID = "dsh-codex-btn-toggle";
    const HOME_BTN_ID = "dsh-codex-btn-home";
    const SETTINGS_SLOT_ID = "dsh-codex-settings-slot";
    const ACTION_CIRCLE_ID = "dsh-codex-btn-action-circle";

    let pluginCtx = null;
    let historyInited = false;
    let cleanupHistory = null;

    // 安全还原原生设置与账户区域，杜绝销毁原生 React 节点
    function restoreNativeSettingsArea() {
      try {
        const settingsSlot = document.getElementById(SETTINGS_SLOT_ID);
        const originSettingsArea = settingsSlot?.querySelector('._2H3hWW_settingsArea, [class*="_settingsArea"], [data-slot="sidebar.settings"]');
        if (originSettingsArea) {
          const settingsBtn = originSettingsArea.querySelector('button');
          if (settingsBtn) {
            settingsBtn.classList.remove("dsh-codex-action-btn");
            settingsBtn.removeAttribute("data-tooltip");
            settingsBtn.querySelector('.dsh-codex-gear-icon')?.remove();
            settingsBtn.querySelector('.dsh-codex-avatar-face')?.remove();
          }
          const root = getSidebarRoot();
          const footArea = root?.querySelector('._2H3hWW_footArea, [class*="_footArea"]');
          if (footArea) {
            footArea.appendChild(originSettingsArea);
          } else if (root) {
            root.appendChild(originSettingsArea);
          }
        }
      } catch (e) {}
    }

    // 彻底清除历史残留外挂节点与样式，安全保全原生 React 节点
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
        document.getElementById(STYLE_ID)?.remove();
        document.querySelectorAll('[id^="dsh-codex-"]:not(#' + SETTINGS_SLOT_ID + ')').forEach(el => el.remove());
        document.querySelectorAll(".dsh-codex-hide-source").forEach(el => el.classList.remove("dsh-codex-hide-source"));
      } catch (e) {}
    }

    try {
      wipeAllZombies();
    } catch (e) {}

    // 矢量图标定义 (100% 对齐 Codex 官方设计规范)
    const SVG = {
      // 上一步 (后退)
      back: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>`,
      // 下一步 (前进)
      forward: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>`,
      // 面板展开/收起图标 [ ◫ ]
      toggle: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>`,
      // Codex 官方主页房子图标 (实心微圆角)
      home: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 3.2L2.5 11.2a1 1 0 0 0 .64 1.8H5v7a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-5h2v5a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-7h1.86a1 1 0 0 0 .64-1.8L12 3.2z"/></svg>`,
      // Codex 官方设置齿轮图标
      gear: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
      // Codex 蓝色圆形快捷下载/更新操作图标
      download: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#ffffff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`,
      // 新会话小铅笔图标
      edit: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`,
      // 插件与工具
      plugin: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path></svg>`,
      tasks: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line></svg>`,
      skills: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>`
    };

    const EMOJI = {
      memory: "\u{1F9E0}",    // 🧠
      ext: "\u{1F9E9}",       // 🧩
      trending: "\u{1F525}",  // 🔥
      agy: "\u26A1"           // ⚡
    };

    // 行内保底样式，杜绝任何情况下回退为原生黑色方框按钮
    const BTN_STYLE_INLINE = [
      "display:inline-flex",
      "align-items:center",
      "justify-content:center",
      "width:36px",
      "height:36px",
      "min-width:36px",
      "min-height:36px",
      "max-width:36px",
      "max-height:36px",
      "border:none",
      "background:transparent",
      "border-radius:8px",
      "cursor:pointer",
      "padding:0",
      "margin:0",
      "box-sizing:border-box",
      "position:relative",
      "-webkit-app-region:no-drag",
      "outline:none",
      "user-select:none",
      "color:inherit"
    ].join(";");

    function injectCSS() {
      let style = document.getElementById(STYLE_ID);
      if (!style) {
        style = document.createElement("style");
        style.id = STYLE_ID;
        document.head.appendChild(style);
      }

      style.textContent = `
        /* ===== 严格对齐 Codex 原生双列布局规范 CSS ===== */
        :root {
          --codex-bar-w: 48px;
          --codex-panel-w: 250px;
          --codex-total-w: 298px;
          --codex-rail-bg: #f3f3f5;
          --codex-rail-border: rgba(0, 0, 0, 0.08);
          --codex-panel-bg: #ffffff;
          --codex-btn-color: #4b5563;
          --codex-btn-hover: rgba(0, 0, 0, 0.06);
          --codex-btn-active: #dfdfe2;
          --codex-text-active: #111827;
          --codex-blue: #0066fe;

          /* 全局重写 DSH 原生外框与标题栏底色，确保全窗顶栏与活动栏 100% 融合一体 */
          --dsw-specific-sidebar-fill: var(--codex-rail-bg) !important;
          --dsh-windows-content-radius: 10px !important;
        }

        [data-ds-dark-theme], [data-theme="dark"], .dark {
          --codex-rail-bg: #18181b;
          --codex-rail-border: rgba(255, 255, 255, 0.08);
          --codex-panel-bg: #1f1f23;
          --codex-btn-color: rgba(255, 255, 255, 0.65);
          --codex-btn-hover: rgba(255, 255, 255, 0.08);
          --codex-btn-active: rgba(255, 255, 255, 0.14);
          --codex-text-active: #ffffff;
          --codex-blue: #2563eb;

          --dsw-specific-sidebar-fill: var(--codex-rail-bg) !important;
          --dsh-windows-content-radius: 10px !important;
        }

        /* 标题栏底色与活动栏彻底融合：全窗顶层、侧边栏列、顶栏拖拽条统一为纯正 Codex 浅灰/暗灰底色 */
        [data-windows-titlebar] .BynINW_frame,
        [data-windows-titlebar] .BynINW_frame:before,
        .BynINW_frame,
        .BynINW_sidebarCol,
        [data-windows-titlebar] .BynINW_sidebarCol {
          background: var(--codex-rail-bg) !important;
          border-right: none !important;
          border-bottom: none !important;
          box-shadow: none !important;
        }

        /* 1. 标题栏导航控件与菜单起点：固定起点为 106px，彻底对齐 Codex (← → [◫] 文件 编辑 ...) */
        :root,
        html,
        body,
        html[data-windows-titlebar],
        html[data-windows-titlebar]:has([data-sidebar-collapsed]) {
          --dsh-windows-menu-start: 106px !important;
        }

        #${TITLE_NAV_ID} {
          position: fixed !important;
          top: calc((var(--dsh-windows-titlebar-height, 40px) - 26px) / 2) !important;
          left: 8px !important;
          height: 26px !important;
          display: inline-flex !important;
          align-items: center !important;
          gap: 3px !important;
          z-index: 99999 !important;
          -webkit-app-region: no-drag !important;
          pointer-events: auto !important;
          user-select: none !important;
        }

        .dsh-codex-title-btn {
          width: 26px !important;
          height: 26px !important;
          min-width: 26px !important;
          min-height: 26px !important;
          max-width: 26px !important;
          max-height: 26px !important;
          border-radius: 6px !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          background: transparent !important;
          border: none !important;
          color: var(--codex-btn-color) !important;
          cursor: pointer !important;
          padding: 0 !important;
          margin: 0 !important;
          transition: background 0.12s ease, color 0.12s ease, opacity 0.12s ease !important;
          outline: none !important;
          position: relative !important;
          -webkit-app-region: no-drag !important;
          flex: none !important;
        }

        .dsh-codex-title-btn:hover:not(:disabled):not(.disabled) {
          background: var(--codex-btn-hover) !important;
          color: var(--codex-text-active) !important;
        }

        .dsh-codex-title-btn:active:not(:disabled):not(.disabled) {
          transform: scale(0.92) !important;
        }

        .dsh-codex-title-btn:disabled,
        .dsh-codex-title-btn.disabled {
          opacity: 0.3 !important;
          cursor: default !important;
          pointer-events: none !important;
        }

        .dsh-codex-title-btn::after {
          content: attr(data-tooltip);
          position: absolute !important;
          top: calc(100% + 5px) !important;
          left: 50% !important;
          transform: translateX(-50%) !important;
          background: rgba(15, 23, 42, 0.94) !important;
          color: #ffffff !important;
          font-size: 11.5px !important;
          font-weight: 500 !important;
          white-space: nowrap !important;
          padding: 3px 6px !important;
          border-radius: 4px !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25) !important;
          pointer-events: none !important;
          opacity: 0 !important;
          visibility: hidden !important;
          transition: opacity 0.12s ease !important;
          z-index: 999999 !important;
        }

        .dsh-codex-title-btn:hover:not(:disabled):not(.disabled)::after {
          opacity: 1 !important;
          visibility: visible !important;
        }

        .dsh-codex-title-btn:not([data-tooltip])::after,
        .dsh-codex-title-btn[data-tooltip=""]::after {
          display: none !important;
        }

        #${TITLE_TOGGLE_ID} {
          margin-left: 2px !important;
        }

        /* 移出标题栏原本悬浮的原生 toggle 与收起态 newSession，但保留 pointer-events 供内部脚本调用 */
        [data-windows-titlebar] ._2H3hWW_toggle,
        ._2H3hWW_root ._2H3hWW_toggle,
        ._2H3hWW_toggle {
          opacity: 0 !important;
          width: 0 !important;
          height: 0 !important;
          min-width: 0 !important;
          min-height: 0 !important;
          position: fixed !important;
          left: -9999px !important;
          top: -9999px !important;
          overflow: hidden !important;
          margin: 0 !important;
          padding: 0 !important;
          border: none !important;
          pointer-events: auto !important;
        }

        [data-windows-titlebar] ._2H3hWW_collapsed ._2H3hWW_newSession {
          display: none !important;
          opacity: 0 !important;
          pointer-events: none !important;
          left: -9999px !important;
        }

        /* 2. AppFrame 外层网格轨道平滑过渡 */
        .BynINW_frame {
          transition: grid-template-columns 0.2s cubic-bezier(0.2, 0, 0, 1) !important;
          will-change: grid-template-columns;
        }

        /* 展开状态：第一列为 298px (48px 活动栏 + 250px 工作区) */
        .BynINW_frame:not([data-sidebar-collapsed]) {
          grid-template-columns: var(--codex-total-w) minmax(400px, 1fr) auto !important;
        }

        /* 收起侧边栏状态：第一列固定保留 48px！绝对不收 Codex 活动栏！ */
        .BynINW_frame[data-sidebar-collapsed],
        .BynINW_frame:has(._2H3hWW_collapsed) {
          grid-template-columns: var(--codex-bar-w) minmax(400px, 1fr) auto !important;
        }

        /* 主对话区域：展开时与工作区平滑接壤，消除突兀倒角；收起时形成左上角 10px 优雅圆角 */
        .BynINW_frame:not([data-sidebar-collapsed]) .BynINW_centerCol,
        .BynINW_frame:not(:has(._2H3hWW_collapsed)) .BynINW_centerCol {
          border-radius: 0 !important;
          border-top: 1px solid var(--codex-rail-border) !important;
          border-left: none !important;
          background: var(--codex-panel-bg) !important;
          box-sizing: border-box !important;
        }

        .BynINW_frame[data-sidebar-collapsed] .BynINW_centerCol,
        .BynINW_frame:has(._2H3hWW_collapsed) .BynINW_centerCol {
          border-top-left-radius: 10px !important;
          border-top: 1px solid var(--codex-rail-border) !important;
          border-left: 1px solid var(--codex-rail-border) !important;
          background: var(--codex-panel-bg) !important;
          box-sizing: border-box !important;
        }

        /* 3. 侧边栏根容器平滑过渡 */
        ._2H3hWW_root {
          transition: width 0.2s cubic-bezier(0.2, 0, 0, 1), min-width 0.2s cubic-bezier(0.2, 0, 0, 1), max-width 0.2s cubic-bezier(0.2, 0, 0, 1) !important;
          will-change: width;
          overflow: hidden !important;
        }

        /* 展开状态：底色统一为 rail 浅灰/暗灰，与标题栏无缝贯通一体 */
        ._2H3hWW_root:not(._2H3hWW_collapsed) {
          position: relative !important;
          width: var(--codex-total-w) !important;
          min-width: var(--codex-total-w) !important;
          max-width: var(--codex-total-w) !important;
          box-sizing: border-box !important;
          padding-left: var(--codex-bar-w) !important;
          margin: 0 !important;
          height: 100% !important;
          overflow: hidden !important;
          background: var(--codex-rail-bg) !important;
        }

        /* 工作区专属白底卡片容器：从 48px 活动栏右侧起跑，上边缘优雅圆角，外围被统一浅灰外壳环绕 */
        ._2H3hWW_root:not(._2H3hWW_collapsed)::after {
          content: "" !important;
          position: absolute !important;
          left: var(--codex-bar-w) !important;
          top: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          background: var(--codex-panel-bg) !important;
          border-top-left-radius: 10px !important;
          border-top: 1px solid var(--codex-rail-border) !important;
          border-left: 1px solid var(--codex-rail-border) !important;
          border-right: 1px solid var(--codex-rail-border) !important;
          box-sizing: border-box !important;
          pointer-events: none !important;
          z-index: 0 !important;
        }

        /* 确保工作区内所有功能部件浮于卡片之上，背景透出优雅圆角 */
        ._2H3hWW_root:not(._2H3hWW_collapsed) ._2H3hWW_logoRow,
        ._2H3hWW_root:not(._2H3hWW_collapsed) ._2H3hWW_brand,
        ._2H3hWW_root:not(._2H3hWW_collapsed) ._2H3hWW_newSession,
        ._2H3hWW_root:not(._2H3hWW_collapsed) ._2H3hWW_regionArea,
        ._2H3hWW_root:not(._2H3hWW_collapsed) ._2H3hWW_footArea {
          position: relative !important;
          z-index: 1 !important;
        }

        /* 收起状态：根容器固定为 48px 宽 */
        ._2H3hWW_root._2H3hWW_collapsed,
        .BynINW_frame[data-sidebar-collapsed] ._2H3hWW_root {
          position: relative !important;
          width: var(--codex-bar-w) !important;
          min-width: var(--codex-bar-w) !important;
          max-width: var(--codex-bar-w) !important;
          padding: 0 !important;
          margin: 0 !important;
          height: 100% !important;
          overflow: hidden !important;
          display: flex !important;
          background: var(--codex-rail-bg) !important;
        }

        /* 工作区右侧面板平滑过渡，锁死 250px 宽度杜绝文字换行与抖动 */
        ._2H3hWW_root ._2H3hWW_logoRow,
        ._2H3hWW_root ._2H3hWW_brand,
        ._2H3hWW_root ._2H3hWW_newSession,
        ._2H3hWW_root ._2H3hWW_regionArea {
          min-width: 250px !important;
          width: 250px !important;
          transition: opacity 0.15s ease !important;
          opacity: 1 !important;
        }

        /* 收起状态下：平滑淡出工作区专属部件并禁用交互 */
        ._2H3hWW_root._2H3hWW_collapsed ._2H3hWW_logoRow,
        ._2H3hWW_root._2H3hWW_collapsed ._2H3hWW_brand,
        ._2H3hWW_root._2H3hWW_collapsed ._2H3hWW_newSession,
        ._2H3hWW_root._2H3hWW_collapsed ._2H3hWW_regionArea,
        .BynINW_frame[data-sidebar-collapsed] ._2H3hWW_logoRow,
        .BynINW_frame[data-sidebar-collapsed] ._2H3hWW_brand,
        .BynINW_frame[data-sidebar-collapsed] ._2H3hWW_newSession,
        .BynINW_frame[data-sidebar-collapsed] ._2H3hWW_regionArea {
          opacity: 0 !important;
          pointer-events: none !important;
        }

        /* 4. 左侧独立 48px Codex 活动栏 (Activity Bar) - 紧凑贴顶消除违和空隙！ */
        #${RAIL_ID} {
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
          bottom: 0 !important;
          width: var(--codex-bar-w) !important;
          height: 100% !important;
          background: var(--codex-rail-bg) !important;
          border-right: 1px solid var(--codex-rail-border) !important;
          display: flex !important;
          flex-direction: column !important;
          justify-content: space-between !important;
          align-items: center !important;
          padding: 4px 0 10px 0 !important;
          box-sizing: border-box !important;
          z-index: 9999 !important;
          -webkit-app-region: no-drag !important;
          user-select: none !important;
        }

        #dsh-codex-top-group {
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          width: 100% !important;
          gap: 4px !important;
        }

        #${TOOLS_BOX_ID} {
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          width: 100% !important;
          gap: 4px !important;
          max-height: calc(100vh - 220px) !important;
          overflow-y: auto !important;
          overflow-x: hidden !important;
        }
        #${TOOLS_BOX_ID}::-webkit-scrollbar {
          display: none !important;
        }

        /* 底部群组：严格 48px 宽，居中对齐，杜绝任何位移 */
        #dsh-codex-bot-group {
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          justify-content: flex-end !important;
          width: 100% !important;
          gap: 6px !important;
          box-sizing: border-box !important;
        }

        .dsh-codex-rail-sep {
          width: 24px !important;
          height: 1px !important;
          background: var(--codex-rail-border) !important;
          margin: 4px 0 !important;
          flex: none !important;
        }

        /* 5. 活动栏按钮统一规格 (36x36px，8px 圆角) */
        .dsh-codex-action-btn {
          position: relative !important;
          width: 36px !important;
          height: 36px !important;
          min-width: 36px !important;
          min-height: 36px !important;
          border-radius: 8px !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          background: transparent !important;
          border: none !important;
          color: var(--codex-btn-color) !important;
          cursor: pointer !important;
          padding: 0 !important;
          margin: 0 !important;
          transition: background 0.12s ease, color 0.12s ease !important;
          outline: none !important;
          flex: none !important;
        }

        .dsh-codex-action-btn:hover {
          background: var(--codex-btn-hover) !important;
          color: var(--codex-text-active) !important;
        }

        .dsh-codex-action-btn:active {
          transform: scale(0.96) !important;
        }

        .dsh-codex-action-btn.active {
          background: var(--codex-btn-active) !important;
          color: var(--codex-text-active) !important;
        }

        .dsh-codex-action-btn svg {
          flex: none !important;
        }

        /* Codex 专属小蓝点指示器 (6px 直径，纯正 Codex 风格) */
        .dsh-codex-dot {
          position: absolute !important;
          top: 6px !important;
          right: 6px !important;
          width: 6px !important;
          height: 6px !important;
          border-radius: 50% !important;
          background: var(--codex-blue) !important;
          border: 1.5px solid var(--codex-rail-bg) !important;
          pointer-events: none !important;
          box-sizing: border-box !important;
        }

        /* 数字徽标 (如有大数值通知) */
        .dsh-codex-badge {
          position: absolute !important;
          top: 2px !important;
          right: 2px !important;
          min-width: 14px !important;
          height: 14px !important;
          padding: 0 3px !important;
          border-radius: 7px !important;
          background: var(--codex-blue) !important;
          color: #ffffff !important;
          font-size: 9px !important;
          font-weight: 700 !important;
          line-height: 14px !important;
          text-align: center !important;
          border: 1.5px solid var(--codex-rail-bg) !important;
          box-sizing: border-box !important;
          pointer-events: none !important;
        }

        /* 悬浮气泡提示 (Tooltip) 始终在按钮右侧旁边弹出 */
        .dsh-codex-action-btn::after {
          content: attr(data-tooltip);
          position: absolute !important;
          left: calc(100% + 9px) !important;
          top: 50% !important;
          transform: translateY(-50%) !important;
          background: rgba(15, 23, 42, 0.94) !important;
          color: #ffffff !important;
          font-size: 12px !important;
          font-weight: 500 !important;
          white-space: nowrap !important;
          padding: 4px 8px !important;
          border-radius: 6px !important;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25) !important;
          pointer-events: none !important;
          opacity: 0 !important;
          visibility: hidden !important;
          transition: opacity 0.12s ease !important;
          z-index: 999999 !important;
        }
        .dsh-codex-action-btn:hover::after,
        .dsh-codex-blue-circle-btn:hover::after {
          opacity: 1 !important;
          visibility: visible !important;
        }

        .dsh-codex-action-btn:not([data-tooltip])::after,
        .dsh-codex-action-btn[data-tooltip=""]::after {
          display: none !important;
        }

        /* 6. 核心细节：将账户中心与设置完美化身为 Codex 底部圆形头像按钮 */
        #${SETTINGS_SLOT_ID} {
          width: 36px !important;
          height: 36px !important;
          min-width: 36px !important;
          min-height: 36px !important;
          max-width: 36px !important;
          max-height: 36px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          position: relative !important;
          box-sizing: border-box !important;
          flex: none !important;
          margin: 0 !important;
          padding: 0 !important;
        }

        /* 强制重置 settingsArea 及其所有包裹层为固定 36x36 居中容器 */
        #${SETTINGS_SLOT_ID} ._2H3hWW_settingsArea,
        #${SETTINGS_SLOT_ID} [class*="_settingsArea"],
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
          animation: none !important;
          transition: none !important;
          transform: none !important;
          pointer-events: auto !important;
          -webkit-app-region: no-drag !important;
          flex: none !important;
          overflow: visible !important;
          background: transparent !important;
          border: none !important;
        }

        /* 仅精准隐藏次级状态连接点与更新提示，绝不误伤 slot 和按钮结构 */
        #${SETTINGS_SLOT_ID} [class*="indicator"],
        #${SETTINGS_SLOT_ID} [class*="Indicator"],
        #${SETTINGS_SLOT_ID} .yiN2GW_indicator {
          display: none !important;
          width: 0 !important;
          height: 0 !important;
          overflow: hidden !important;
        }

        /* 底部账号/设置按钮：严格 36x36px，居中，圆形悬浮效果 */
        #${SETTINGS_SLOT_ID} button,
        ._2H3hWW_root ._2H3hWW_settingsArea button,
        ._2H3hWW_root [class*="_settingsArea"] button {
          width: 36px !important;
          height: 36px !important;
          min-width: 36px !important;
          min-height: 36px !important;
          max-width: 36px !important;
          max-height: 36px !important;
          border-radius: 50% !important;
          padding: 0 !important;
          margin: 0 !important;
          border: none !important;
          background: transparent !important;
          cursor: pointer !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          box-sizing: border-box !important;
          outline: none !important;
          transition: transform 0.15s ease, background 0.15s ease !important;
          position: relative !important;
          font-size: 0 !important;
          gap: 0 !important;
          overflow: visible !important;
          flex: none !important;
        }

        #${SETTINGS_SLOT_ID} button:hover,
        ._2H3hWW_root ._2H3hWW_settingsArea button:hover {
          transform: scale(1.06) !important;
          background: var(--codex-btn-hover) !important;
        }

        #${SETTINGS_SLOT_ID} button:active,
        ._2H3hWW_root ._2H3hWW_settingsArea button:active {
          transform: scale(0.95) !important;
        }

        /* 隐藏账号中心按钮内的文字 label (如用户名) */
        #${SETTINGS_SLOT_ID} button [class*="label"],
        #${SETTINGS_SLOT_ID} button [class*="Label"] {
          display: none !important;
        }

        /* 账号真实头像容器 span：28x28px 圆形，居中，柔和阴影 */
        #${SETTINGS_SLOT_ID} button [class*="avatar"],
        #${SETTINGS_SLOT_ID} button [class*="Avatar"],
        ._2H3hWW_root ._2H3hWW_settingsArea button [class*="avatar"],
        ._2H3hWW_root ._2H3hWW_settingsArea button [class*="Avatar"] {
          width: 28px !important;
          height: 28px !important;
          min-width: 28px !important;
          min-height: 28px !important;
          max-width: 28px !important;
          max-height: 28px !important;
          border-radius: 50% !important;
          overflow: hidden !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2) !important;
          background: var(--codex-rail-border) !important;
          flex: none !important;
          pointer-events: none !important;
        }

        /* 账号真实头像图片 img：100% 充满圆形容器，保持比例 */
        #${SETTINGS_SLOT_ID} button img,
        #${SETTINGS_SLOT_ID} button [class*="avatar"] img,
        ._2H3hWW_root ._2H3hWW_settingsArea button img {
          width: 100% !important;
          height: 100% !important;
          min-width: 100% !important;
          min-height: 100% !important;
          max-width: 100% !important;
          max-height: 100% !important;
          border-radius: 50% !important;
          object-fit: cover !important;
          display: block !important;
          pointer-events: none !important;
        }

        /* 若暂未加载头像图片或未登录（显示 SVG 图标时），居中 18x18px */
        #${SETTINGS_SLOT_ID} button svg,
        ._2H3hWW_root ._2H3hWW_settingsArea button svg {
          width: 18px !important;
          height: 18px !important;
          display: block !important;
          color: var(--codex-btn-color) !important;
          pointer-events: none !important;
          flex: none !important;
        }

        /* 7. 工作区面板细节精修：Logo 栏、新会话按键、列表完全对标 Codex */
        ._2H3hWW_root ._2H3hWW_logoRow {
          height: 44px !important;
          min-height: 44px !important;
          padding: 0 12px 0 14px !important;
          margin: 0 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          flex: none !important;
          border-bottom: 1px solid var(--codex-rail-border) !important;
          background: transparent !important;
          border-top-left-radius: 10px !important;
        }

        ._2H3hWW_root ._2H3hWW_brandName {
          font-size: 15px !important;
          font-weight: 600 !important;
          color: var(--codex-text-active) !important;
          letter-spacing: -0.01em !important;
        }

        /* 新会话按钮：精炼、扁平、轻薄，去除厚重卡片感 */
        ._2H3hWW_root ._2H3hWW_newSession {
          width: calc(100% - 16px) !important;
          margin: 8px 8px 6px 8px !important;
          height: 34px !important;
          min-height: 34px !important;
          border: 1px solid rgba(0, 0, 0, 0.05) !important;
          background: rgba(0, 0, 0, 0.02) !important;
          border-radius: 6px !important;
          color: var(--codex-text-active) !important;
          font-size: 13.5px !important;
          font-weight: 500 !important;
          padding: 0 10px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: flex-start !important;
          gap: 6px !important;
          box-shadow: none !important;
          transition: background 0.12s ease !important;
        }

        [data-ds-dark-theme] ._2H3hWW_root ._2H3hWW_newSession {
          border-color: rgba(255, 255, 255, 0.08) !important;
          background: rgba(255, 255, 255, 0.03) !important;
        }

        ._2H3hWW_root ._2H3hWW_newSession:hover {
          background: var(--codex-btn-hover) !important;
        }

        /* 列表区域微调 */
        ._2H3hWW_root ._2H3hWW_regionArea {
          margin: 0 !important;
          padding: 4px 8px 12px 8px !important;
          width: 100% !important;
          flex: 1 1 0% !important;
          overflow-y: auto !important;
          overflow-x: hidden !important;
        }

        ._2H3hWW_root ._2H3hWW_regionArea::-webkit-scrollbar {
          width: 4px !important;
        }
        ._2H3hWW_root ._2H3hWW_regionArea::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.12) !important;
          border-radius: 2px !important;
        }

        /* 会话列表行细节优化：对标 Codex 原生圆角与平滑交互质感 */
        [data-row-key^="session:"],
        ._2H3hWW_root [role="treeitem"] {
          border-radius: 6px !important;
          transition: background 0.12s ease, color 0.12s ease !important;
        }

        /* 隐藏冗余原生底部面板与已迁移的插件源节点 */
        ._2H3hWW_root ._2H3hWW_panelList,
        ._2H3hWW_root [class*="_panelList"],
        ._2H3hWW_root ._2H3hWW_footerActions,
        ._2H3hWW_root [class*="_footerActions"],
        .dsh-codex-hide-source {
          display: none !important;
        }
      `;
    }

    function getSidebarRoot() {
      return document.querySelector('._2H3hWW_root, [class*="_root"]');
    }

    // 展开或收起右侧工作区面板的核心交互驱动
    function toggleWorkspacePanel() {
      // 1. 首选：通过 Cordis 服务直接切换 (最干净、底层原生支持)
      let layout = null;
      try {
        layout = pluginCtx?.layout ||
                 (typeof pluginCtx?.get === 'function' ? pluginCtx.get('layout') : null) ||
                 pluginCtx?.root?.layout ||
                 (typeof pluginCtx?.root?.get === 'function' ? pluginCtx.root.get('layout') : null);
      } catch (e) {
        console.warn("[dsh-codex] layout resolve failed:", e);
      }

      if (layout && typeof layout.toggleSidebar === 'function') {
        try {
          layout.toggleSidebar();
          return;
        } catch (e) {
          console.warn("[dsh-codex] layout.toggleSidebar failed:", e);
        }
      }

      // 2. 次选：通过原生 React Fiber 闭包中的 onClick 方法直接调用
      const nativeToggle = document.querySelector('button._2H3hWW_toggle, button[class*="_toggle"]:not(#dsh-codex-btn-toggle), button[aria-label*="收起"]:not(#dsh-codex-btn-toggle), button[aria-label*="展开"]:not(#dsh-codex-btn-toggle), button[aria-label*="打开"]:not(#dsh-codex-btn-toggle)');
      if (nativeToggle && nativeToggle.id !== TOGGLE_BTN_ID) {
        try {
          const propKey = Object.keys(nativeToggle).find(k => k.startsWith('__reactProps$') || k.startsWith('__reactEventHandlers$'));
          if (propKey && typeof nativeToggle[propKey]?.onClick === 'function') {
            nativeToggle[propKey].onClick({
              preventDefault() {},
              stopPropagation() {},
              bubbles: true,
              target: nativeToggle,
              currentTarget: nativeToggle
            });
            return;
          }
        } catch (err) {
          console.warn("[dsh-codex] react props click failed:", err);
        }

        // 3. 原生 click 与 dispatchEvent 兜底
        try {
          nativeToggle.click();
          return;
        } catch (err) {}

        try {
          nativeToggle.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          return;
        } catch (err) {}
      }
    }

    window.__DSH_CODEX_TOGGLE__ = toggleWorkspacePanel;

    // --- 路由与会话历史堆栈管理 (Codex 上一步与下一步导航 100% 深度支持) ---
    const navHistory = {
      stack: [],
      index: -1,
      isNavigating: false,
      currentSessionId: null,

      // 检测是否有弹窗处于打开状态 (如有，后退键可优先关闭弹窗返回)
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

      // 获取当前活跃的 session ID
      getCurrentSessionId() {
        // 1. 从 uiWorkspace 服务获取
        try {
          const uiWs = pluginCtx?.get?.("uiWorkspace", false);
          const sid = uiWs?.selection?.getSnapshot?.()?.sessionId || uiWs?.mainReference?.sessionId;
          if (sid) return sid;
        } catch (e) {}

        // 2. 从 DOM 树选择器获取 (已选中态 aria-selected="true" 或 selected class)
        try {
          const activeRow = document.querySelector(
            '[data-row-key^="session:"][aria-selected="true"], ' +
            '[role="treeitem"][aria-selected="true"][data-row-key^="session:"], ' +
            '[class*="sessionRow"][class*="selected"][data-row-key^="session:"], ' +
            '[class*="_sessionRow"][class*="_selected"][data-row-key^="session:"]'
          );
          if (activeRow) {
            const key = activeRow.getAttribute("data-row-key");
            const sid = key?.replace(/^session:/, '');
            if (sid) return sid;
          }
        } catch (e) {}

        // 3. 从 localStorage 兜底
        try {
          const raw = window.localStorage?.getItem?.("dsh.sessions.current");
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed?.sessionId) return parsed.sessionId;
          }
        } catch (e) {}

        return null;
      },

      // 当监测到当前会话切换时入栈
      onSessionChanged(sessionId) {
        if (!sessionId) return;
        if (this.isNavigating) {
          this.currentSessionId = sessionId;
          this.updateUI();
          return;
        }

        if (this.currentSessionId === sessionId) {
          return;
        }

        // 堆栈尚为空，初始化初始会话
        if (this.stack.length === 0) {
          this.stack = [sessionId];
          this.index = 0;
          this.currentSessionId = sessionId;
          this.updateUI();
          return;
        }

        // 如果与当前栈顶会话相同，忽略
        if (this.index >= 0 && this.stack[this.index] === sessionId) {
          this.currentSessionId = sessionId;
          this.updateUI();
          return;
        }

        // 新会话入栈：截断当前指针之后的历史，压入新会话
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

      // 后退 (上一步)
      back() {
        // 如果有弹窗打开，优先关闭弹窗返回主界面
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

        try {
          window.history.back();
        } catch (e) {}

        setTimeout(() => {
          this.isNavigating = false;
          this.updateUI();
        }, 220);
        this.updateUI();
      },

      // 前进 (下一步)
      forward() {
        if (!this.canGoForward()) return;

        this.isNavigating = true;
        this.index++;
        const targetSid = this.stack[this.index];
        this.currentSessionId = targetSid;

        this.activateSession(targetSid);

        try {
          window.history.forward();
        } catch (e) {}

        setTimeout(() => {
          this.isNavigating = false;
          this.updateUI();
        }, 220);
        this.updateUI();
      },

      // 激活并跳转至指定的 sessionId
      activateSession(sessionId) {
        if (!sessionId) return false;

        // 1. 如果有 panel (如设置/扩展页面) 打开，退出 panel 回到会话主视图
        try {
          const layout = pluginCtx?.get?.("layout", false) || pluginCtx?.layout;
          if (layout && typeof layout.selectPanel === "function") {
            layout.selectPanel(null);
          }
        } catch (e) {}

        // 2. 途径 A: 调用 uiWorkspace 服务层 openSession
        try {
          const uiWs = pluginCtx?.get?.("uiWorkspace", false);
          if (uiWs && typeof uiWs.openSession === "function") {
            uiWs.openSession(sessionId);
            return true;
          }
        } catch (e) {
          console.warn("[dsh-codex] uiWs.openSession fallback:", e);
        }

        // 3. 途径 B: 查找 DOM 对应会话节点并模拟真实点击
        try {
          const row = document.querySelector(`[data-row-key="session:${sessionId}"]`);
          if (row) {
            row.scrollIntoView({ block: "nearest" });
            row.click();
            row.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
            return true;
          }
        } catch (e) {}

        // 4. 途径 C: 遍历所有 session row 匹配 ID
        try {
          const allRows = document.querySelectorAll('[data-row-key^="session:"]');
          for (const r of allRows) {
            const key = r.getAttribute("data-row-key");
            if (key && key.includes(sessionId)) {
              r.scrollIntoView({ block: "nearest" });
              r.click();
              r.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
              return true;
            }
          }
        } catch (e) {}

        return false;
      },

      // 同步导航按钮禁用/启用状态与外观
      updateUI() {
        const backBtn = document.getElementById(BACK_BTN_ID);
        const fwdBtn = document.getElementById(FWD_BTN_ID);
        const hasBack = this.canGoBack();
        const hasFwd = this.canGoForward();

        if (backBtn) {
          backBtn.disabled = !hasBack;
          backBtn.classList.toggle("disabled", !hasBack);
          backBtn.style.opacity = hasBack ? "1" : "0.3";
          backBtn.style.pointerEvents = hasBack ? "auto" : "none";
          backBtn.style.cursor = hasBack ? "pointer" : "default";
        }
        if (fwdBtn) {
          fwdBtn.disabled = !hasFwd;
          fwdBtn.classList.toggle("disabled", !hasFwd);
          fwdBtn.style.opacity = hasFwd ? "1" : "0.3";
          fwdBtn.style.pointerEvents = hasFwd ? "auto" : "none";
          fwdBtn.style.cursor = hasFwd ? "pointer" : "default";
        }
      }
    };

    function ensureTitleNav() {
      let nav = document.getElementById(TITLE_NAV_ID);
      if (!nav) {
        nav = document.createElement("div");
        nav.id = TITLE_NAV_ID;

        // 1. 上一步 (后退)
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

        // 2. 下一步 (前进)
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

        // 3. 专属侧边栏切换主键 [ ◫ ] (在标题栏前部，1:1 对标 Codex)
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
      }

      navHistory.updateUI();
      return nav;
    }

    function initHistoryTracking() {
      if (historyInited) return;
      historyInited = true;

      // 1. 初次尝试获取当前 session
      const cur = navHistory.getCurrentSessionId();
      if (cur) {
        navHistory.onSessionChanged(cur);
      }

      // 2. 尝试与 uiWorkspace.selection.subscribe 动态绑定
      let unsubWs = null;
      try {
        const tryBindUiWs = () => {
          const uiWs = pluginCtx?.get?.("uiWorkspace", false);
          if (uiWs?.selection && typeof uiWs.selection.subscribe === "function") {
            unsubWs = uiWs.selection.subscribe((snap) => {
              if (snap?.sessionId) {
                navHistory.onSessionChanged(snap.sessionId);
              }
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

      // 3. 监听全局点击事件：捕获用户点击会话行、新建会话按钮等
      const handleClick = (e) => {
        try {
          // 点击了具体会话项
          const row = e.target?.closest?.('[data-row-key^="session:"]');
          if (row) {
            const sid = row.getAttribute("data-row-key")?.replace(/^session:/, '');
            if (sid) {
              navHistory.onSessionChanged(sid);
            }
            return;
          }

          // 点击了新建会话按钮
          const newBtn = e.target?.closest?.(
            '._2H3hWW_newSession, [class*="_newSession"], [aria-label*="新会话"], [aria-label*="新建会话"], [aria-label*="New session"]'
          );
          if (newBtn) {
            setTimeout(() => {
              const newSid = navHistory.getCurrentSessionId();
              if (newSid) navHistory.onSessionChanged(newSid);
            }, 300);
            return;
          }
        } catch (err) {}
      };
      document.addEventListener("click", handleClick, true);

      // 4. 监听键盘快捷键：Alt + ← (后退)，Alt + → (前进)
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

    function ensureRail(root) {
      let rail = document.getElementById(RAIL_ID);
      if (!rail) {
        rail = document.createElement("div");
        rail.id = RAIL_ID;

        // --- 顶部群组 ---
        const topGroup = document.createElement("div");
        topGroup.id = "dsh-codex-top-group";

        // 1. Codex 官方主页/工作区入口 [ 🏠 ] (附带专属蓝点指示器，顶端第 1 位！)
        const homeBtn = document.createElement("button");
        homeBtn.id = HOME_BTN_ID;
        homeBtn.type = "button";
        homeBtn.className = "dsh-codex-action-btn active";
        homeBtn.style.cssText = BTN_STYLE_INLINE;
        homeBtn.setAttribute("data-tooltip", "主页与工作区");
        homeBtn.innerHTML = `${SVG.home}<span class="dsh-codex-dot"></span>`;

        const handleHomeClick = (e) => {
          if (e) {
            e.preventDefault();
            e.stopPropagation();
          }

          // 1. 若打开了扩展面板或设置等非会话主视图，一键退回对话主视图
          try {
            const layout = pluginCtx?.get?.("layout", false) || pluginCtx?.layout;
            if (layout && typeof layout.selectPanel === "function") {
              layout.selectPanel(null);
            }
          } catch (err) {}

          // 2. 若打开了弹窗，一键关闭弹窗
          const modalClose = navHistory.getOpenModalCloseBtn();
          if (modalClose) {
            try { modalClose.click(); } catch (err) {}
          }

          const rootEl = getSidebarRoot();
          const isCollapsed = Boolean(
            document.querySelector('.BynINW_frame[data-sidebar-collapsed]') ||
            rootEl?.classList.contains('_2H3hWW_collapsed')
          );

          if (isCollapsed) {
            toggleWorkspacePanel();
          } else {
            const region = rootEl?.querySelector('._2H3hWW_regionArea, [class*="_regionArea"]');
            if (region) region.scrollTo({ top: 0, behavior: "smooth" });
          }
        };

        homeBtn.addEventListener("click", handleHomeClick);
        homeBtn.onclick = handleHomeClick;
        topGroup.appendChild(homeBtn);

        // 分割线
        const sep1 = document.createElement("div");
        sep1.className = "dsh-codex-rail-sep";
        topGroup.appendChild(sep1);

        // 2. 工具与插件容器
        const toolsBox = document.createElement("div");
        toolsBox.id = TOOLS_BOX_ID;
        topGroup.appendChild(toolsBox);

        rail.appendChild(topGroup);

        // --- 底部群组 ---
        const botGroup = document.createElement("div");
        botGroup.id = "dsh-codex-bot-group";

        const sep2 = document.createElement("div");
        sep2.className = "dsh-codex-rail-sep";
        botGroup.appendChild(sep2);

        // 设置与账户宿主：直接将 DSH 原生包含账户中心的 launcher 化身为活动栏底部圆形头像
        const settingsSlot = document.createElement("div");
        settingsSlot.id = SETTINGS_SLOT_ID;
        botGroup.appendChild(settingsSlot);

        rail.appendChild(botGroup);
      }

      if (rail.parentElement !== root) {
        root.insertBefore(rail, root.firstChild);
      }
      return rail;
    }

    function resolveIcon(el, label) {
      if (label.includes("Memory") || el.matches?.('[data-dsh-memory-sidebar-entry], .dsh-memory-sidebar-entry')) {
        return `<span style="font-size:16px;line-height:1;">${EMOJI.memory}</span>`;
      }
      if (label.includes("扩展") || el.matches?.('[data-dsh-extension-sidebar-entry], .dsh-ext-sidebar-entry')) {
        return `<span style="font-size:16px;line-height:1;">${EMOJI.ext}</span>`;
      }
      if (label.includes("Trending") || el.matches?.('[data-dsh-trending-sidebar-entry], .dsh-trending-sidebar-entry')) {
        return `<span style="font-size:16px;line-height:1;">${EMOJI.trending}</span>`;
      }
      if (label.includes("AGY") || label.includes("自动化") || el.matches?.('[data-dsh-agy-automation-entry], .dsh-agy-auto-sidebar-entry')) {
        return `<span style="font-size:16px;line-height:1;">${EMOJI.agy}</span>`;
      }
      if (label.includes("看板") || el.matches?.('[data-dsh-taskboard-entry]')) {
        return SVG.tasks;
      }
      if (label.includes("技能") || el.matches?.('[data-dsh-skill-explorer-entry]')) {
        return SVG.skills;
      }
      if (label.includes("插件")) {
        return SVG.plugin;
      }

      const svg = el.querySelector?.('svg');
      if (svg) return svg.outerHTML;

      const img = el.querySelector?.('img');
      if (img && img.src) {
        return `<img src="${img.src}" style="width:18px;height:18px;border-radius:4px;object-fit:cover;" />`;
      }

      const firstChar = label.trim().slice(0, 1) || EMOJI.ext;
      return `<span style="font-size:15px;line-height:1;font-weight:600;">${firstChar}</span>`;
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

    let isSyncing = false;

    function syncAll() {
      if (isSyncing) return;
      const root = getSidebarRoot();
      if (!root) return;

      isSyncing = true;
      try {
        ensureTitleNav();
        ensureRail(root);
        const toolsBox = document.getElementById(TOOLS_BOX_ID);
        if (!toolsBox) return;

        // 1. 同步主页按钮高亮状态（折叠时取消 active，展开时保持 active）
        const isCollapsed = Boolean(
          document.querySelector('.BynINW_frame[data-sidebar-collapsed]') ||
          root.classList.contains('_2H3hWW_collapsed')
        );
        const homeBtn = document.getElementById(HOME_BTN_ID);
        if (homeBtn) {
          homeBtn.classList.toggle("active", !isCollapsed);
        }

        // 2. 将原生的 settingsArea 放入 settingsSlot，直接化身为 Codex 专属圆形头像与设置按钮
        const originSettingsArea = root?.querySelector('._2H3hWW_footArea ._2H3hWW_settingsArea, ._2H3hWW_footArea [class*="_settingsArea"], ._2H3hWW_footArea [data-slot="sidebar.settings"]') ||
                                   document.querySelector('._2H3hWW_footArea ._2H3hWW_settingsArea, ._2H3hWW_footArea [class*="_settingsArea"], ._2H3hWW_footArea [data-slot="sidebar.settings"]') ||
                                   root?.querySelector('._2H3hWW_settingsArea, [class*="_settingsArea"], [data-slot="sidebar.settings"]') ||
                                   document.querySelector('._2H3hWW_settingsArea, [class*="_settingsArea"], [data-slot="sidebar.settings"]');
        const settingsSlot = document.getElementById(SETTINGS_SLOT_ID);
        if (originSettingsArea && settingsSlot && originSettingsArea.parentElement !== settingsSlot) {
          settingsSlot.innerHTML = "";
          settingsSlot.appendChild(originSettingsArea);
        }

        if (originSettingsArea) {
          const settingsBtn = originSettingsArea.querySelector('button');
          if (settingsBtn) {
            settingsBtn.classList.add("dsh-codex-action-btn");
            settingsBtn.setAttribute("data-tooltip", "账号中心与设置");
            if (settingsBtn.hasAttribute("title")) settingsBtn.removeAttribute("title");
            settingsBtn.querySelector('.dsh-codex-gear-icon')?.remove();
            settingsBtn.querySelector('.dsh-codex-avatar-face')?.remove();
          }
        }

        // 3. 收集所有非工作区的窗口/插件入口（严格排除任何设置与账户相关组件）
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
          '[data-dsh-ssh-entry]',
          '[data-dsh-plugin]',
          'nav._2H3hWW_panelList > button',
          'nav[class*="_panelList"] > button',
          '._2H3hWW_panelRow',
          '[class*="_panelRow"]'
        ];

        const sourceElements = new Set();

        // 自动发现任何其他插件插入在 logo 与 regionArea 之间的自定义按钮
        Array.from(root.children).forEach(el => {
          if (!el || el.id === RAIL_ID) return;
          if (el.matches?.('[class*="_logoRow"], [class*="_newSession"], [class*="_regionArea"], [class*="_footArea"], [class*="_settingsArea"], [data-slot*="settings"]')) return;
          if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute?.('role') === 'button' || el.hasAttribute?.('data-dsh-plugin')) {
            sourceElements.add(el);
          }
        });

        // 匹配已知插件选择器
        for (const sel of selectors) {
          try {
            document.querySelectorAll(sel).forEach(el => {
              if (el &&
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

        sourceElements.forEach((sourceEl, idx) => {
          try {
            const { label, badge } = parseDetails(sourceEl);
            const key = sourceEl.id || sourceEl.getAttribute?.("data-dsh-plugin") || `item-${label}-${idx}`;
            validKeys.add(key);

            let btn = toolsBox.querySelector(`[data-key="${key}"]`);
            if (!btn) {
              btn = document.createElement("button");
              btn.type = "button";
              btn.className = "dsh-codex-action-btn";
              btn.style.cssText = BTN_STYLE_INLINE;
              btn.setAttribute("data-key", key);

              btn.addEventListener("click", () => {
                try {
                  sourceEl.click();
                } catch (e) {
                  console.warn("[dsh-codex] click target error:", e);
                }
              });

              toolsBox.appendChild(btn);
            }

            // 更新提示文本 (显示在右侧)
            btn.setAttribute("data-tooltip", badge && badge !== '·' ? `${label} (${badge})` : label);

            // 更新选中状态
            const isActive = sourceEl.classList?.contains("active") ||
                             sourceEl.matches?.('[class*="_panelActive"], [aria-selected="true"], [aria-current="page"]');
            btn.classList.toggle("active", Boolean(isActive));

            // 更新内容与徽标 (若有小红点或未读，呈现 Codex 小蓝点或数字徽标)
            const iconHtml = resolveIcon(sourceEl, label);
            const badgeHtml = badge && badge !== '·' ? `<span class="dsh-codex-badge">${badge}</span>` : (badge === '·' ? '<span class="dsh-codex-dot"></span>' : '');
            btn.innerHTML = `${iconHtml}${badgeHtml}`;

            // 在工作区右侧面板中彻底隐藏源元素
            sourceEl.classList.add("dsh-codex-hide-source");
          } catch (itemErr) {
            console.warn("[dsh-codex] sync item error:", itemErr);
          }
        });

        // 清理已被移除的插件按钮
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

        // 每次加载/挂载前，先强制通配清场，确保同一周期绝对单例！
        wipeAllZombies();
        injectCSS();
        initHistoryTracking();

        let scheduled = null;
        const scheduleSync = () => {
          if (scheduled) return;
          scheduled = requestAnimationFrame(() => {
            scheduled = null;
            try {
              syncAll();
            } catch (err) {
              console.warn("[dsh-codex] syncAll error:", err);
            }
          });
        };

        scheduleSync();

        const observer = new MutationObserver((mutations) => {
          let shouldUpdate = false;
          for (const m of mutations) {
            if (m.target?.id === RAIL_ID || m.target?.closest?.(`#${RAIL_ID}`) ||
                m.target?.id === TITLE_NAV_ID || m.target?.closest?.(`#${TITLE_NAV_ID}`)) continue;
            // 忽略聊天流式输出、Markdown 渲染和输入框的频繁 DOM 变动，极大节省渲染与 CPU 开销
            if (m.target?.closest?.('[class*="chat"], [class*="conversation"], [class*="message"], [class*="markdown"], [class*="code"], textarea, input')) continue;
            shouldUpdate = true;
            break;
          }
          if (shouldUpdate) {
            scheduleSync();
            try {
              const curSid = navHistory.getCurrentSessionId();
              if (curSid && curSid !== navHistory.currentSessionId) {
                navHistory.onSessionChanged(curSid);
              }
            } catch (e) {}
          }
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["class", "data-sidebar-collapsed", "aria-selected"]
        });

        window.__DSH_CODEX_CLEANUP__ = () => {
          try {
            observer.disconnect();
            if (typeof cleanupHistory === "function") {
              try { cleanupHistory(); } catch (e) {}
              cleanupHistory = null;
            }
            historyInited = false;
            restoreNativeSettingsArea();
            document.getElementById(TITLE_NAV_ID)?.remove();
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
});
