# 架构说明

## 一张图

```
┌───────────────────────────── Wallpaper Engine ─────────────────────────────┐
│  webwallpaper64 (CEF / Chromium)                                          │
│  file:///.../morningdesk_web/index.html                                   │
│    ├─ lifestyle.css / lifestyle.js / assets/*.png                         │
│    └─ fetch / EventSource ───────────────┐                                │
└──────────────────────────────────────────┼────────────────────────────────┘
                                           │  http://127.0.0.1:43761
┌──────────────────────────────────────────▼────────────────────────────────┐
│  MorningDeskBackend.exe (Node SEA, 只监听回环)                             │
│    ├─ /api/metrics   当前硬件快照                                         │
│    ├─ /api/weather   IP 定位 + Open-Meteo                                 │
│    ├─ /api/stream    SSE，每 2 秒推送 metrics                             │
│    ├─ /api/health    自检                                                 │
│    └─ 静态文件       public/（内嵌，启动时解压到 %TEMP%）                  │
│                                                                           │
│  collector.js  ── os.cpus / os.totalmem / Get-CimInstance / nvidia-smi    │
│                └─ read-cpu-temperature.ps1 → LibreHardwareMonitorLib.dll  │
└──────────────────────────────────────────▲────────────────────────────────┘
                                           │ 计划任务（登录时，最高权限）
┌──────────────────────────────────────────┴────────────────────────────────┐
│  MorningDeskBackendHost.exe (GUI 子系统，无窗口)                           │
│    ├─ 单实例 Mutex                                                        │
│    ├─ 端口已占用 → 接管已有后端                                           │
│    └─ CreateNoWindow + 重定向日志 + 崩溃退避重启                           │
└───────────────────────────────────────────────────────────────────────────┘
```

## 运行时序

1. 用户登录 → 计划任务 `MorningDesk Backend` 以最高权限启动 `MorningDeskBackendHost.exe`。
2. 宿主检查 `Local\MorningDesk.BackendHost` 互斥量；已有宿主则退出。
3. 宿主探测 `127.0.0.1:43761`：
   - 已有 `MorningDeskBackend` 进程 → 接管并监督它（升级/异常退出后的场景）；
   - 其他进程占用 → 记录日志后退出，避免乱杀。
4. 宿主用 `CreateNoWindow` + 重定向 stdout/stderr 启动后端，环境变量：
   - `MORNING_DESK_SKIP_ELEVATION=1`：阻止后端自己再弹 UAC；
   - `HOST=127.0.0.1`、`PORT=43761`。
5. 后端（Node SEA）启动：
   - 先探测 `/api/health`，已有实例则退出；
   - 把内嵌的 `public/`、`read-cpu-temperature.ps1`、`LibreHardwareMonitorLib.dll` 解压到 `%TEMP%\MorningDeskDashboard-v1`；
   - `require("./index")` 启动 HTTP 服务。
6. Wallpaper Engine 加载网页壁纸，页面每 2 秒通过 SSE 收指标，每 15 分钟拉一次天气。
7. 用户注销 / 关机 → 进程随会话结束；下次登录重复。

## 前端

| 文件 | 作用 |
|---|---|
| `public/lifestyle.html` | 清晨书桌版页面结构（时钟、台历、三张便签、天气屏、校准面板） |
| `public/lifestyle.css` | 场景、透视、便签、天气屏样式；背景图 `assets/morning-desk-bg.png` |
| `public/lifestyle.js` | 时钟/农历、SSE、天气、透视校准（`matrix3d` + 最小二乘解） |
| `public/index.html` / `app.js` / `styles.css` | 旧的技术仪表盘版，保留但不作为当前产品 |
| `public/config.js` | 标题、颜色、端口 `companionPort` 等 |

关键点：

- 页面可能以 `file://` 打开，所以 API 地址固定为 `http://127.0.0.1:<port>`，而不是同源。
- 校准结果存 `localStorage`；WE 环境可能禁用 Web Storage，读写都要包 try/catch。
- 透视：把每个物件的 4 个控制点从百分比坐标映射到屏幕，解 8 元一次方程得到 `matrix3d`。

## 后端

### HTTP 接口

`GET /api/health`

```json
{"ok": true, "clients": 0}
```

`GET /api/metrics`（首次采集前返回 `{"status":"warming-up"}`）

```json
{
  "timestamp": "2026-10-23T11:00:00.000Z",
  "system": { "hostname": "PC", "platform": "Windows_NT 10.0.26100", "uptime": 12345.6 },
  "cpu": { "name": "Intel...", "usage": 13.4, "temperature": 28, "speedMhz": 3494, "cores": 20 },
  "memory": { "total": 34359738368, "free": 20000000000, "used": 14359738368, "usage": 41.8 },
  "gpu": { "available": true, "name": "NVIDIA...", "usage": 11, "memoryUsed": 0, "memoryTotal": 0, "temperature": 49 },
  "disks": [{ "name": "System", "mount": "C:", "size": 1000000000000, "free": 500000000000, "usedPercent": 50 }],
  "network": { "name": "Ethernet", "address": "192.168.1.2", "online": true, "downloadBps": 87000, "uploadBps": 9000 }
}
```

`GET /api/weather`

```json
{
  "location": "杭州",
  "geo": { "source": "ipwho.is", "ip": "1.2.3.4", "city": "杭州", "region": "浙江省", "country": "中国", "latitude": 30.29, "longitude": 120.16, "timezone": "Asia/Shanghai", "isp": "..." },
  "temperature": 26.2,
  "apparentTemperature": 26.0,
  "weatherCode": 1,
  "updatedAt": "2026-10-23T11:00"
}
```

`GET /api/stream`：`text/event-stream`，每 2 秒一条 `data: <metrics JSON>`。

所有响应都带 `Access-Control-Allow-Origin: *`，因为页面来自 `file://`（Origin 为 `null`）。

### 采集策略

- **CPU 使用率**：两次 `os.cpus()` 的 idle/total 差值。
- **内存**：`os.totalmem()` / `os.freemem()`。
- **磁盘 / GPU / CPU 温度**：每 30 秒一次慢采集，结果缓存。
  - 磁盘：`Get-CimInstance Win32_LogicalDisk`；
  - GPU：`nvidia-smi --query-gpu=...`，没有则 `available:false`；
  - CPU 温度：先跑 `read-cpu-temperature.ps1`（P/Invoke LibreHardwareMonitorLib），失败再退回 ACPI `MSAcpi_ThermalZoneTemperature`，都失败则为 `null`。
- **网络**：每 2 秒读 `Get-NetAdapterStatistics` 累计字节，算差值得到 B/s。
- 所有 PowerShell / nvidia-smi 调用都带 `windowsHide`，不产生可见窗口。

### 天气与定位

1. `https://ipwho.is/?lang=zh-CN` 拿公网 IP 的经纬度与城市，缓存 6 小时。
2. 用经纬度请求 `https://api.open-meteo.com/v1/forecast`，取当前温度、体感、天气代码。
3. 天气每 15 分钟刷新；失败后 60 秒重试（开机后网络还没就绪时很有用）。
4. 定位失败回退到内置的「杭州余杭」。
5. 显示名只取城市（去掉「市/省」后缀），例如 `杭州`、`新加坡`。

## 静默启动与守护

- **为什么不直接跑 exe**：`MorningDeskBackend.exe` 是 console 子系统，直接启动会有黑框，而且 SEA 入口会尝试自提权弹 UAC。
- **宿主**：C# `winexe`，没有控制台；`ProcessStartInfo.CreateNoWindow = true` 并且重定向 stdout/stderr，console 子系统也不会创建窗口。
- **单实例**：`Local\` 互斥量（不需要全局权限）。
- **自愈**：后端退出后按 2s → 4s → … → 60s 退避重启；稳定运行超过 60 秒后退避归零。
- **升级**：安装器先停任务和进程，再覆盖 `%LOCALAPPDATA%\MorningDesk\backend`。
- **日志**：宿主把后端的 stdout/stderr 与自身事件写到 `%LOCALAPPDATA%\MorningDesk\logs\backend.log`，超过 5 MB 轮转为 `.1`。

## 文件职责

```
server/index.js            HTTP 路由、天气、SSE、静态文件
server/collector.js        硬件采集
server/standalone-entry.js SEA 入口：自检、解压、提权开关
server/read-cpu-temperature.ps1  LibreHardwareMonitor P/Invoke

desktop/BackendHost.cs     静默守护器（当前使用）
desktop/WallpaperHost.cs   旧的应用程序壁纸窗口宿主（已弃用）
desktop/DashboardHost.cs   旧的仪表盘窗口宿主（已弃用）
desktop/Bootstrap.cs       旧的单文件解包启动器（已弃用）

scripts/build-companion.js 后端 SEA + 旧桌面版构建
scripts/build-service.ps1  后端 + 守护器打包
scripts/build-web-wallpaper.js  public/ → WE 网页工程
scripts/install-morningdesk.ps1 开发机安装
scripts/package-release.ps1 生成 release zip
packaging/                 面向用户的独立安装器
```

## 设计取舍

- **前后端分离**：创意工坊不能带 exe，只能拆开；端口固定，安装器无需配置。
- **单文件后端**：用户不需要 Node，升级只换一个 exe。
- **回环 + 无鉴权**：只服务本机壁纸，攻击面小；不监听局域网。
- **前端零依赖**：WE 的 CEF 版本随 Steam 更新，避免框架和 CDN 带来的不确定性。
