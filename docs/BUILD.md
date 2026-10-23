# 构建与发布

## 环境

- Windows 10 / 11 x64
- Node.js 18+（开发时使用 24.x）
- .NET Framework 4.x 自带的 `csc.exe`：`%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe`
- 可选：7-Zip（`scripts/package-release.ps1` 优先用它压缩，没有则退回 `Compress-Archive`）
- 可选：Wallpaper Engine（仅用于本地预览网页壁纸）

```powershell
npm install
```

## 构建后端

```powershell
npm run build:backend
```

产物：`dist/build/payload/MorningDeskBackend.exe`（约 120 MB，内含 Node 运行时与 `public/`）。

原理：esbuild 把 `server/standalone-entry.js` 打成单文件 → `node --experimental-sea-config` 生成 blob → `postject` 注入到 `node.exe` 副本。

## 构建「后端 + 静默守护器」

```powershell
npm run build:service
```

产物：`dist/service/`

```
MorningDeskBackend.exe
MorningDeskBackendHost.exe
```

`build-service.ps1` 会用 `csc` 编译 `desktop/BackendHost.cs`（`/target:winexe`），然后把两个文件放进 `dist/service`。

## 构建 Wallpaper Engine 网页工程

```powershell
npm run build:web
```

默认输出到：

```
<Steam>\steamapps\common\wallpaper_engine\projects\myprojects\morningdesk_web
```

可用环境变量覆盖：

```powershell
$env:WE_PROJECT_DIR = "D:\somewhere\morningdesk_web"; npm run build:web
$env:WE_DIR = "D:\Steam\steamapps\common\wallpaper_engine"; npm run build:web
```

脚本会：

1. 清空目标目录，把 `public/` 全量复制过去；
2. 把 `lifestyle.html` 复制为 `index.html`；
3. 生成 `project.json`（`"type": "web"`）；
4. 用背景图生成 512×288 的 `preview.jpg`。

## 本机安装（开发用）

```powershell
npm run install:service
```

会请求一次 UAC，然后：

- 复制 `dist/service` 到 `%LOCALAPPDATA%\MorningDesk\backend`；
- 注册计划任务 `MorningDesk Backend`（登录触发、最高权限）；
- 创建开始菜单快捷方式；
- 启动并等待 `/api/health`。

## 打发布包

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-release.ps1 -Version 1.0.0
```

流程：

1. 构建后端与守护器；
2. 组装 `dist/package/MorningDeskBackend-1.0.0/`（两个 exe + 安装器 + README）；
3. 压缩为 `release/MorningDeskBackend-1.0.0.zip`；
4. 生成 `release/SHA256SUMS.txt`。

发布时把 zip 上传到 GitHub Releases（推荐），或直接提交到 `release/` 目录（当前 zip 约 54 MB，低于 GitHub 单文件 100 MB 限制）。

## 版本号

- 单一版本源：`package.json` 的 `version`。
- 守护器 `MorningDeskBackendHost.exe` 的文件版本由 `build-service.ps1` 写入。
- 后端 `MorningDeskBackend.exe` 是 `node.exe` 的副本 + 注入 blob，文件属性里显示的是 Node 的版本；**功能版本以 zip 文件名和 `package.json` 为准**。
- 每次发版改 `package.json`，重新打包，`release/` 里会多一个 zip；旧 zip 可以保留。

## 代码签名（可选）

未签名的 exe 首次运行可能触发 SmartScreen「未知发布者」。要避免：

1. 购买代码签名证书（OV/EV）；
2. 用 `signtool sign /fd SHA256 /f cert.pfx /p <pwd> MorningDeskBackend.exe MorningDeskBackendHost.exe` 签名；
3. 对 zip 内的 exe 签名后再压缩。

没有证书也可以发布，只是用户需要多点一次「仍要运行」。

## 验证发布包

```powershell
# 解压后（不要直接运行安装脚本，先确认文件齐全）
Get-ChildItem MorningDeskBackend-1.0.0
Get-FileHash MorningDeskBackend-1.0.0.zip -Algorithm SHA256   # 与 SHA256SUMS.txt 对比
```

安装后：

```powershell
Invoke-WebRequest http://127.0.0.1:43761/api/health -UseBasicParsing
```
