MorningDesk（清晨书桌）后台
========================================

这是什么
  给 Wallpaper Engine 网页壁纸「MorningDesk 清晨书桌」提供数据的本机程序：
  CPU / GPU / 内存 / 磁盘 / 网络 / 天气。
  只监听 127.0.0.1:43761，不上传任何数据。

怎么安装
  1. 解压整个 zip 到任意目录
  2. 双击 Install.cmd，在 UAC 提示里点「是」（只需一次）
  3. 看到 Done 即可，之后开机自动启动，不会出现任何窗口

安装完成后
  开始菜单 → MorningDesk：
    重启后台      重新启动后台服务
    接口状态      用浏览器打开 http://127.0.0.1:43761/api/health
    打开日志      查看运行日志
    卸载 MorningDesk

安装位置
  %LOCALAPPDATA%\MorningDesk
    backend\MorningDeskBackend.exe       数据服务
    backend\MorningDeskBackendHost.exe   静默守护器（无窗口）
    logs\backend.log                     运行日志
    uninstall.ps1                        卸载脚本

要求
  Windows 10 / 11 64 位
  不需要安装 Node.js
  读取 CPU 温度需要管理员权限（安装器会请求一次）

常见问题
  壁纸数字全是 --    → 开始菜单「重启后台」，再点「接口状态」
  CPU 温度 N/A       → 传感器不支持或权限不足，其它指标不受影响
  地名不对           → 按公网 IP 定位，关闭代理/VPN 后重启后台
  端口被占用         → 默认 43761，确认没有其它程序占用

卸载
  开始菜单 → MorningDesk → 卸载
  或运行本机的 uninstall.ps1（会请求一次管理员权限）

许可证
  本程序包含 Node.js（MIT）与 LibreHardwareMonitor（MPL-2.0），
  许可证全文见 licenses\ 目录。

更多说明见 GitHub 仓库的 README 与 docs/ 目录。
