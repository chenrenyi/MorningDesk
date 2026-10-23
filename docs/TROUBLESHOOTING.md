# 排错

## 先做这三件事

```powershell
# 1. 后台活着吗
Invoke-WebRequest http://127.0.0.1:43761/api/health -UseBasicParsing

# 2. 计划任务在吗
Get-ScheduledTask -TaskName "MorningDesk Backend"

# 3. 日志最后几行
Get-Content "$env:LOCALAPPDATA\MorningDesk\logs\backend.log" -Tail 30
```

正常情况：接口返回 `{"ok":true,"clients":N}`，任务状态 `Running`。

---

## 壁纸数字全是 `--`

后台没在跑，或者页面连不上。

1. 开始菜单 → `MorningDesk → 重启后台`；
2. 再点 `MorningDesk → 接口状态`，浏览器能打开 `{"ok":true}` 就说明后端正常；
3. 回到 Wallpaper Engine，右键壁纸 → 重新应用 / 重启预览；
4. 仍不行，看 `backend.log` 里有没有 `EADDRINUSE`、`Failed to start backend`。

## 天气一直「IP 定位中」或「天气暂不可用」

- 刚开机时网络可能还没就绪，后台会在 60 秒后自动重试，前端每 10 秒重试。
- 打开 <https://api.open-meteo.com/v1/forecast?latitude=30.29&longitude=120.16&current=temperature_2m> 看能不能访问。
- 公司网络 / 代理可能拦截 HTTPS；关掉代理后重启后台。
- 定位服务 `ipwho.is` 偶尔超时，等下一轮（6 小时缓存，重启后台可立即重试）。

## 地名不是自己所在的城市

后台按**公网 IP** 定位，以下情况会跑偏：

- 开着代理 / VPN / 游戏加速器；
- 运营商把出口放在别的城市。

关掉代理，开始菜单 → 重启后台，等 10 秒再看 `/api/weather`。

## CPU 温度显示 `N/A`

- 后台没有以管理员权限运行：检查计划任务「使用最高权限运行」是否被改过。
- 主板传感器不被 LibreHardwareMonitor 支持：尝试更新 `tools/LibreHardwareMonitor/LibreHardwareMonitorLib.dll`。
- 虚拟机 / 部分笔记本：只能拿到 ACPI 温度，甚至完全没有。

GPU 温度、内存、网速、天气不受影响。

## 安装时点了「否」

重新双击 `Install.cmd`，或右键 →「以管理员身份运行」。没有管理员权限时，安装会直接退出，不会留下半成品。

## 安装完成但开机没有自动启动

1. 任务计划程序 → 搜索 `MorningDesk Backend`；
2. 看「触发器」是否为「登录时」、「常规」是否勾选「使用最高权限运行」；
3. 右键 →「运行」，看是否能起来；
4. 某些「优化/安全」软件会禁用登录任务，需要放行。

## 端口 43761 被占用

```powershell
Get-NetTCPConnection -LocalPort 43761 -State Listen | Select-Object OwningProcess
Get-Process -Id <PID>
```

- 如果是旧的 `MorningDeskBackend`：结束它，重启任务即可（守护器会接管或重启）。
- 如果是别的程序：换端口，见 [CUSTOMIZE.md](CUSTOMIZE.md#换端口)。

## 壁纸黑屏 / 空白

- 在 WE 编辑器里「文件 → 重启预览」。
- 确认 `project.json` 里 `"file": "index.html"`，且 `index.html` 存在。
- 检查 WE 的性能设置：前台有最大化窗口时可能暂停壁纸，切回桌面会恢复。
- 多显示器时每个屏幕会各起一个实例，属正常。

## exe 被杀毒软件删除 / 提示未知发布者

发布包没有代码签名，SmartScreen 会提示「未知发布者」，点「更多信息 → 仍要运行」。若被杀软隔离，把 `%LOCALAPPDATA%\MorningDesk\backend` 加入白名单，或自行用证书签名（见 [BUILD.md](BUILD.md)）。

## 安装脚本中文乱码

`install.ps1` 必须以 UTF-8 BOM 保存（仓库里已经是）。如果你手动改过并用记事本另存为 ANSI，中文会乱码甚至语法错误，重新用 UTF-8 BOM 保存即可。

## 升级后还是旧数据

安装器会先停任务和进程再覆盖文件；如果覆盖失败，通常是旧进程没退干净：

```powershell
Get-Process MorningDeskBackendHost, MorningDeskBackend | Stop-Process -Force
```

然后再运行一次 `Install.cmd`。

## 日志在哪

```
%LOCALAPPDATA%\MorningDesk\logs\backend.log
%LOCALAPPDATA%\MorningDesk\logs\backend.log.1
```

日志超过 5 MB 自动轮转。开始菜单 `MorningDesk → 打开日志` 可以直接打开。
