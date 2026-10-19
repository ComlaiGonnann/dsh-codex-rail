# dsh-codex-sidebar

<p align="center">
  <img src="https://img.shields.io/badge/DSH-Plugin-blue?style=flat-square" alt="DSH Plugin" />
  <img src="https://img.shields.io/badge/Version-1.1.0-green?style=flat-square" alt="Version 1.1.0" />
  <img src="https://img.shields.io/badge/License-MIT-purple?style=flat-square" alt="License MIT" />
  <img src="https://img.shields.io/badge/Vibe%20Coding-%E2%9C%A8-orange?style=flat-square" alt="Vibe Coding" />
</p>

将 **DeepSeek Harness (DSH)** 界面重构为极具现代质感的 **Codex 式双列活动栏**与**全窗一体化**工作区主题插件。

> [!NOTE]
> **作者声明：此为作者自用且为 vibecoding 产物。**  
> 本插件遵循“能跑即是胜利、视觉体验优先”的设计哲学，旨在复刻沉浸式 Codex 顶栏与侧边栏工作流。更新节奏与功能演变以作者日常使用体验为主要驱动，欢迎交流与 PR！

---

## ✨ 核心特性

- 🎨 **全窗顶栏一体化质感**  
  无缝打通原生标题栏与 48px 活动栏（Activity Bar），彻底消除断层与多余留白，与原生明亮/暗黑主题深度贴合。

- 🗂️ **Codex 级双列工作流**  
  - **48px 图标活动栏**：将插件、终端、浏览器、工作区切换等功能归拢于左侧纵向 Rail，布局井然有序；
  - **弹性会话面板**：侧边列表支持平滑收展，留出最大化的主对话与编码视野。

- 👤 **快捷账号中心与头像入口**  
  在活动栏底部常驻 28px 精美圆形头像与个人中心入口，点击即可直接呼出或定位到账号与模型配置。

- ⚡ **会话前进 / 后退历史导航**  
  内置导航控制按键，并原生支持 `Alt + ←`（后退）和 `Alt + →`（前进）全局快捷键，顺畅穿梭于多轮历史会话。

- 🪄 **工作区 10px 悬浮圆角卡片**  
  主对话与代码编辑区域采用卡片化容器包裹，搭配轻量内衬阴影与圆角设计，层次分明，极具科技美感。

- 🚀 **丝滑动画与高帧率过渡**  
  深度优化 CSS Transform 与浏览器重绘机制，彻底解决原生在侧边栏折叠与展开时的掉帧卡顿。

---

## ⌨️ 快捷键速查

| 快捷键 | 功能说明 |
| :--- | :--- |
| <kbd>Alt</kbd> + <kbd>←</kbd> | 后退至上一个会话历史 |
| <kbd>Alt</kbd> + <kbd>→</kbd> | 前进至下一个会话历史 |
| 点击活动栏底部头像 | 快速唤出 / 跳转个人账号中心 |

---

## 📦 安装与使用

### 方式一：DSH 插件市场安装（推荐）

1. 启动 DeepSeek Harness (DSH)；
2. 进入 **插件市场 (Market)**；
3. 搜索 `dsh-codex-sidebar` 并点击 **安装**；
4. 安装完成后重启或刷新 DSH 即可生效。

### 方式二：命令行安装

进入你的 DSH 用户 Profile 目录（如 `~/.dsh/profiles/desktop` 或指定 workspace）：

```bash
npm install dsh-codex-sidebar
```

并在 `cordis.yml` 或插件配置中确认启用：

```yaml
# cordis.yml
dsh-codex-sidebar: {}
```

### 方式三：开发者本地软链接调试

如果你希望基于本项目进行个性化定制：

```bash
# 克隆仓库
git clone https://github.com/ComlaiGonnann/dsh-codex-sidebar.git

# 在 DSH 的 packages 目录下建立软链接 (Windows 示例)
mklink /J "%USERPROFILE%\.dsh\packages\dsh-codex-sidebar" "你的本地仓库路径\dsh-codex-sidebar"
```

---

## ⚙️ 兼容性说明

- **兼容 DSH 版本**：`>= 0.1.1-rc.1`（完美兼容 0.2.x Desktop / Web）
- **适用平台**：Windows / macOS / Linux

---

## 📄 开源许可

本项目基于 [MIT License](./LICENSE) 开源发布。
