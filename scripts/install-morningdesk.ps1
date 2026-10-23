param(
  [int]$Port = 43761,
  [string]$TaskName = "MorningDesk Backend",
  [switch]$SkipStart
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceDir = Join-Path $projectRoot "dist\service"
$installRoot = Join-Path $env:LOCALAPPDATA "MorningDesk"
$backendDir = Join-Path $installRoot "backend"
$logDir = Join-Path $installRoot "logs"
$hostName = "MorningDeskBackendHost.exe"
$backendName = "MorningDeskBackend.exe"

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principalCheck = New-Object Security.Principal.WindowsPrincipal($identity)
$isAdmin = $principalCheck.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
  Write-Host "注册开机自启动需要管理员权限，正在请求 UAC（只需要这一次）..." -ForegroundColor Yellow
  $arguments = @(
    "-NoProfile", "-ExecutionPolicy", "Bypass",
    "-File", "`"$PSCommandPath`"",
    "-Port", $Port,
    "-TaskName", "`"$TaskName`""
  )
  if ($SkipStart) { $arguments += "-SkipStart" }
  try {
    $elevated = Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList $arguments -Wait -PassThru
  } catch {
    throw "没有取得管理员权限，安装已取消。也可以右键 scripts\install-morningdesk.cmd，选择「以管理员身份运行」。"
  }
  exit $elevated.ExitCode
}

if (-not (Test-Path -LiteralPath (Join-Path $sourceDir $backendName))) {
  throw "没有找到 $sourceDir\$backendName，请先运行 npm run build:service"
}

Write-Host "停止旧的后台进程和任务..." -ForegroundColor Cyan
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
}
Get-Process -Name "MorningDeskBackendHost", "MorningDeskBackend" -ErrorAction SilentlyContinue |
  Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 1000

Write-Host "安装到 $installRoot ..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $backendDir, $logDir | Out-Null
Copy-Item -Path (Join-Path $sourceDir "*") -Destination $backendDir -Force

$readme = @"
MorningDesk（清晨书桌）后台服务
========================================

作用
  Wallpaper Engine 网页壁纸 / 浏览器全屏页面所需的本机数据接口：
  CPU、GPU、内存、磁盘、网络、运行时长、天气。
  只监听 127.0.0.1:$Port，不对外网开放。

接口
  http://127.0.0.1:$Port/api/health     健康检查
  http://127.0.0.1:$Port/api/metrics    当前硬件指标
  http://127.0.0.1:$Port/api/weather    当前天气
  http://127.0.0.1:$Port/api/stream     SSE 实时推送

目录
  $backendDir\MorningDeskBackend.exe       数据服务（Node 单文件，无需安装 Node）
  $backendDir\MorningDeskBackendHost.exe   静默守护器：无窗口，崩了自动拉起
  $logDir\backend.log                     运行日志（超过 5MB 自动轮转）

自启动
  计划任务名称：$TaskName
  触发方式：当前用户登录时；以最高权限运行（CPU 温度需要）
  任务计划程序里搜索 "Morning" 即可找到，刻意没有隐藏。

常用操作
  重启：双击开始菜单 "MorningDesk → 重启后台"
  查看：开始菜单 "MorningDesk → 接口状态 / 打开日志"
  停止：任务计划程序 → 结束 "$TaskName"
        或任务管理器结束 MorningDeskBackendHost.exe
  卸载：开始菜单 "MorningDesk → 卸载"，或运行
        powershell -ExecutionPolicy Bypass -File "$installRoot\uninstall.ps1"

说明
  安装完成后开机/登录时不会再出现任何窗口或提示。
  如果 CPU 温度显示 N/A，通常是传感器驱动尚未加载或权限不足；GPU、内存、网速、天气不受影响。
"@
Set-Content -LiteralPath (Join-Path $installRoot "README.txt") -Value $readme -Encoding UTF8

$restartVbs = @"
Set shell = CreateObject("WScript.Shell")
shell.Run "schtasks /run /tn ""$TaskName""", 0, False
"@
Set-Content -LiteralPath (Join-Path $installRoot "restart.vbs") -Value $restartVbs -Encoding ASCII

$uninstallVbs = @"
Set shell = CreateObject("WScript.Shell")
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""$installRoot\uninstall.ps1""", 0, False
"@
Set-Content -LiteralPath (Join-Path $installRoot "uninstall.vbs") -Value $uninstallVbs -Encoding ASCII

Copy-Item -LiteralPath (Join-Path $PSScriptRoot "uninstall-morningdesk.ps1") `
  -Destination (Join-Path $installRoot "uninstall.ps1") -Force

Write-Host "注册计划任务 $TaskName ..." -ForegroundColor Cyan
$userName = $identity.Name
$action = New-ScheduledTaskAction -Execute (Join-Path $backendDir $hostName) -WorkingDirectory $backendDir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userName
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew `
  -StartWhenAvailable `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $userName -LogonType Interactive -RunLevel Highest
$description = "MorningDesk（清晨书桌）后台数据服务：给 Wallpaper Engine 网页壁纸提供天气与硬件接口"
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal `
  -Settings $settings -Description $description -Force | Out-Null

Write-Host "创建开始菜单快捷方式..." -ForegroundColor Cyan
$startMenu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\MorningDesk"
New-Item -ItemType Directory -Force -Path $startMenu | Out-Null
$wsh = New-Object -ComObject WScript.Shell

$restart = $wsh.CreateShortcut((Join-Path $startMenu "重启后台.lnk"))
$restart.TargetPath = Join-Path $env:WINDIR "System32\wscript.exe"
$restart.Arguments = "`"$(Join-Path $installRoot 'restart.vbs')`""
$restart.Description = "重启 MorningDesk 后台服务"
$restart.Save()

$logs = $wsh.CreateShortcut((Join-Path $startMenu "打开日志.lnk"))
$logs.TargetPath = Join-Path $env:WINDIR "System32\notepad.exe"
$logs.Arguments = "`"$(Join-Path $logDir 'backend.log')`""
$logs.Description = "查看 MorningDesk 后台日志"
$logs.Save()

$uninstall = $wsh.CreateShortcut((Join-Path $startMenu "卸载 MorningDesk.lnk"))
$uninstall.TargetPath = Join-Path $env:WINDIR "System32\wscript.exe"
$uninstall.Arguments = "`"$(Join-Path $installRoot 'uninstall.vbs')`""
$uninstall.Description = "卸载 MorningDesk 后台服务"
$uninstall.Save()

@"
[InternetShortcut]
URL=http://127.0.0.1:$Port/api/health
"@ | Set-Content -LiteralPath (Join-Path $startMenu "接口状态.url") -Encoding ASCII

if (-not $SkipStart) {
  Write-Host "启动后台并等待接口就绪..." -ForegroundColor Cyan
  Start-ScheduledTask -TaskName $TaskName
  $deadline = (Get-Date).AddSeconds(25)
  $healthy = $false
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 2
      if ($response.StatusCode -eq 200) { $healthy = $true; break }
    } catch { }
    Start-Sleep -Milliseconds 500
  }
  if (-not $healthy) {
    Write-Warning "25 秒内没有等到接口就绪，请查看日志：$logDir\backend.log"
  }
}

$task = Get-ScheduledTask -TaskName $TaskName
$process = Get-Process -Name "MorningDeskBackendHost" -ErrorAction SilentlyContinue | Select-Object -First 1
Write-Host ""
Write-Host "安装完成" -ForegroundColor Green
Write-Host "  计划任务 : $TaskName  [$($task.State)]"
Write-Host "  后台进程 : $(if ($process) { "pid $($process.Id)，窗口句柄 $($process.MainWindowHandle)" } else { '未运行' })"
Write-Host "  接口     : http://127.0.0.1:$Port/api/health"
Write-Host "  日志     : $logDir\backend.log"
Write-Host "  卸载     : $installRoot\uninstall.ps1"
