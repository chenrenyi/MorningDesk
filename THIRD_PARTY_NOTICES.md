# 第三方组件与数据来源

本项目自身代码使用 [MIT](LICENSE)。发布的后台程序 `MorningDeskBackend.exe` 与仓库中还包含以下第三方内容。

## Node.js

- 用途：`MorningDeskBackend.exe` 由 Node.js 单文件可执行程序（SEA）打包，内含 Node 运行时。
- 许可：MIT 及若干第三方许可。
- 许可证全文：[`third_party/node/LICENSE`](third_party/node/LICENSE)
- 上游：<https://github.com/nodejs/node>

## LibreHardwareMonitor

- 用途：读取 CPU 温度（`LibreHardwareMonitorLib.dll`，版本 0.9.6）。
- 许可：Mozilla Public License 2.0（MPL-2.0）。
- 许可证全文：[`third_party/LibreHardwareMonitor/LICENSE`](third_party/LibreHardwareMonitor/LICENSE)
- 上游：<https://github.com/LibreHardwareMonitor/LibreHardwareMonitor>
- 说明：该 DLL 以二进制形式随本项目分发；如需修改其源码，请遵循 MPL-2.0 的源代码公开要求。

## 天气与定位数据

- 天气数据：Open-Meteo（<https://open-meteo.com>），数据以 CC BY 4.0 许可提供。
- IP 定位：ipwho.is（<https://ipwho.is>）免费接口。
- 这些服务仅由本机后台按需请求，本项目不缓存、不再分发其原始数据。

## 其他

- Wallpaper Engine 是 Valve Corporation 的产品，本项目与其无隶属关系。
- 字体使用 Windows 系统自带字体（Segoe UI、Microsoft YaHei、Consolas 等），未打包字体文件。
