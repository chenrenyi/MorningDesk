# AGENTS.md

> 给 AI 编码助手的说明。人类读者请先看 [README.md](README.md)。

## 这个项目是什么

Wallpaper Engine 的「网页」壁纸，加一个本机 Node 后端。

- 前端在 `public/`：没有构建步骤，WE 用 `file://` 直接加载 `index.html`。
- 后端在 `server/`：被打包成单文件 `MorningDeskBackend.exe`（Node SEA，内含 Node 运行时与前端静态文件），只监听 `127.0.0.1:43761`。
- 宿主在 `desktop/BackendHost.cs`：GUI 子系统、无窗口，负责拉起后端、崩溃重启、单实例。
- 发布安装器在 `packaging/`，产物在 `release/`。

## 动手前按顺序读

1. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) —— 数据流、API 契约、每个文件的职责
2. [docs/BUILD.md](docs/BUILD.md) —— 构建命令与产物路径
3. [docs/CUSTOMIZE.md](docs/CUSTOMIZE.md) —— 常见改造点（背景、布局、端口、指标）

## 硬约束（不要破坏）

- 后端必须监听 `127.0.0.1`，默认端口 `43761`；前端把它写死为回环地址，因为 WE 用 `file://` 加载页面，属于跨源请求。
- 前端不能引入 CDN、外部字体或打包工具；`public/` 必须能作为静态文件直接双击打开。
- 改完前端必须运行 `npm run build:web`，否则 Wallpaper Engine 工程里还是旧文件。
- 改完后端必须 `npm run build:service`，并把 `dist/service` 覆盖到 `%LOCALAPPDATA%\MorningDesk\backend`，或重新运行 `npm run install:service`。
- 不要提交 `node_modules/`、`dist/`、`.cache/`、日志；`release/` 需要提交。
- **不要在未经用户同意时运行安装脚本**：它会写 `%LOCALAPPDATA%`、注册计划任务并弹出 UAC。
- 页面在 WE 里可能拿不到 Web Storage，`localStorage` 相关代码必须容错。
- 端口、API 路径、`project.json` 里的 `"type": "web"` 不要随意改，否则创意工坊版本会失联。

## 常用命令

```powershell
npm install
npm run build:backend     # -> dist/build/payload/MorningDeskBackend.exe
npm run build:service     # -> dist/service（后端 + 守护器）
npm run build:web         # -> %WALLPAPER_ENGINE%\projects\myprojects\morningdesk_web
npm run install:service   # 本机安装 / 覆盖升级（一次 UAC）
powershell -File scripts/package-release.ps1 -Version 1.0.0   # 生成 release/*.zip
```

`build:web` 默认写入墙纸引擎的 `projects\myprojects\morningdesk_web`；可用环境变量覆盖：

- `WE_DIR`：Wallpaper Engine 安装目录
- `WE_PROJECT_DIR`：直接指定工程输出目录

## 验收清单

- `node --check` 所有改过的 JS 文件通过。
- `http://127.0.0.1:43761/api/health` 返回 `{"ok":true}`。
- `/api/metrics` 有 CPU / GPU / 内存 / 网络数据；`/api/weather` 有温度和地名。
- 直接用浏览器打开 `public/lifestyle.html`（`file://`）也能显示数字，说明跨源逻辑没坏。
- 壁纸在 WE 中应用后，CPU/GPU 等数字会动，不是一个静态截图。

## 代码风格

- 2 空格缩进，双引号，语句结尾带分号。
- `server/` 与 `scripts/` 用 CommonJS；前端用原生 ES2020，不引入框架。
- 中文文案直接写在 HTML / JS / README 里，不额外做 i18n。
- 除非必要，不新增依赖；新增依赖必须更新 `package-lock.json`。

## 常见改动入口

| 想改什么 | 改哪里 |
|---|---|
| 背景图 | 替换 `public/assets/morning-desk-bg.png` |
| 物件位置 / 透视 | `public/lifestyle.js` 顶部的 `defaults`，或页面里的「校准」按钮 |
| 字体、字号、颜色 | `public/lifestyle.css` |
| 屏幕布局、元素 | `public/lifestyle.html` |
| 采集哪些指标 | `server/collector.js` |
| 天气 / 定位 | `server/index.js` 的 `fetchIpLocation` / `fetchWeather` |
| 端口 | `public/config.js` 的 `companionPort` + 计划任务参数 |
| 安装行为 | `packaging/install.ps1` |
