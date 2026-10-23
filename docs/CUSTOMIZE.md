# 改造指南

## 换背景

替换 `public/assets/morning-desk-bg.png` 即可。建议：

- 16:9，至少 1920×1080，4K 更好；
- 书桌物件的位置决定四个信息块落在哪，可以用页面里的「校准」重新对齐；
- 文件大会直接增加壁纸加载时间和仓库体积（当前 18 MB）。

换完运行 `npm run build:web`，再在 Wallpaper Engine 里重启预览。

## 调整物件位置（透视校准）

页面右上角有一个低调的「校准」按钮：

1. 选择要调整的物件（闹钟 / 台历 / CPU 便签 / GPU 便签 / 内存便签 / 天气屏）；
2. 把四个控制点拖到壁纸中对应物件的四角；
3. 「保存」写入 `localStorage`（键名 `morning-desk-warp-config-v1`）；
4. 「重置当前」/「全部重置」恢复默认。

默认坐标在 `public/lifestyle.js` 的 `defaults` 里，单位是场景百分比：

```js
const defaults = {
  clock: { size: [432, 176], points: [[12.45, 57.62], [34.67, 56.24], [34.90, 74.99], [12.78, 76.96]] },
  ...
};
```

`size` 是物件的设计像素尺寸，`points` 是左上 / 右上 / 右下 / 左下。

> WE 的 `file://` 环境可能禁用 `localStorage`，此时校准只对当前会话有效。要永久生效，请把调好的坐标写回 `defaults`。

## 缩放天气屏

右下角天气 / 网速屏有一个 `--network-scale`（默认 1.28），校准时可以拖动滑杆，存在 `morning-desk-screen-scale-v1`。

## 改字体、颜色、布局

- 字体：`public/lifestyle.css` 顶部 `body` 与各物件的 `font-family`（全部使用系统字体）。
- 台历、便签的尺寸和位置：`.calendar-*`、`.note-*`、`.weather-*` 等选择器。
- 页面结构：`public/lifestyle.html`，每个物件是一个 `<section class="warp" data-warp="clock">`。

## 换端口

端口涉及三个地方，必须一起改：

1. `public/config.js` → `companionPort: 43761`
2. `desktop/BackendHost.cs` → `private const int Port = 43761;`（改完必须重新编译守护器）
3. 安装时传参：`install.ps1 -Port 45678`（计划任务与前端都用这个值）

另外：

- `server/index.js` 读取环境变量 `PORT`，默认 43761；
- `server/standalone-entry.js` 里的 `port` 常量也要同步（自检用）；
- 改完运行 `npm run build:service` 覆盖安装，再 `npm run build:web`。

## 增加一个指标

以「显存占用」为例：

1. `server/collector.js`：在 `readGpu()` 里已经取了 `memoryUsed` / `memoryTotal`，直接在 `collectMetrics()` 的返回对象里加字段即可。
2. `public/lifestyle.html`：在对应便签里加一个 `<span id="life-vram">`。
3. `public/lifestyle.js`：在 `renderMetrics(data)` 里写入。

新增慢采集（比如硬盘温度）时，放进 `collectMetrics()` 的 30 秒缓存分支，避免每 2 秒调用 PowerShell。

## 改刷新频率

- 硬件：`server/index.js` 末尾的 `setInterval(broadcast, 2000)`。
- 天气：`setInterval(refreshWeather, 15 * 60 * 1000)`，失败重试在 `scheduleWeatherRetry()`（默认 60 秒）。
- 前端天气兜底：`public/lifestyle.js` 的 `scheduleWeatherRetry()`（默认 10 秒）。

## 改天气源 / 地名

- 定位：`server/index.js` 的 `fetchIpLocation()`，当前用 `ipwho.is`，缓存 6 小时。
- 天气：`fetchWeather()`，当前用 Open-Meteo，字段 `temperature_2m` / `apparent_temperature` / `weather_code`。
- 显示名：`shortLocation()` 只取城市名；想固定显示（例如「杭州余杭」），可以把 `latestIpLocation.location` 改成常量，或在前端用 `config.js` 覆盖。
- 天气代码到图标的映射：`public/lifestyle.js` 的 `weatherDescription()`。

## 中文 / 英文

页面文案直接写在 HTML 和 JS 里，没有 i18n 层。要出英文版，复制一份 `lifestyle.html` / `lifestyle.js` 替换文案即可；`project.json` 的 `title` 也可以单独改。

## 发布前的清理

- 隐藏「校准」按钮：`public/lifestyle.html` 里 `#calibrate-toggle` 加 `hidden`，或直接删掉 `#calibration-panel`。
- 确认 `public/config.js` 的端口与安装器一致。
- `npm run build:web` 后，检查 WE 工程里的 `index.html`、`project.json`、`preview.jpg` 都是新的。
- 不要把 `%LOCALAPPDATA%\MorningDesk`、日志、`dist/` 打进创意工坊工程。
