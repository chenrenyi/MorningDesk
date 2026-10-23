param(
  [int]$Port = 43761,
  [string]$TaskName = "MorningDesk Backend",
  [string]$InstallRoot = "",
  [switch]$SkipStart,
  [switch]$SkipTask,
  [switch]$SkipShortcuts,
  [switch]$NoElevate
)

$ErrorActionPreference = "Stop"
$sourceDir = $PSScriptRoot
if (-not $InstallRoot) { $InstallRoot = Join-Path $env:LOCALAPPDATA "MorningDesk" }
$backendDir = Join-Path $InstallRoot "backend"
$logDir = Join-Path $InstallRoot "logs"
$hostName = "MorningDeskBackendHost.exe"
$backendName = "MorningDeskBackend.exe"

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principalCheck = New-Object Security.Principal.WindowsPrincipal($identity)
$isAdmin = $principalCheck.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin -and -not $NoElevate) {
  Write-Host "正在请求管理员权限（读取 CPU 温度需要，仅此一次）..." -ForegroundColor Yellow
  $arguments = @(
    "-NoProfile", "-ExecutionPolicy", "Bypass",
    "-File", "`"$PSCommandPath`"",
    "-Port", $Port,
    "-TaskName", "`"$TaskName`"",
    "-InstallRoot", "`"$InstallRoot`""
  )
  if ($SkipStart) { $arguments += "-SkipStart" }
  if ($SkipTask) { $arguments += "-SkipTask" }
  if ($SkipShortcuts) { $arguments += "-SkipShortcuts" }
  try {
    $elevated = Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList $arguments -Wait -PassThru
  } catch {
    throw "没有取得管理员权限，安装已取消。请右键 Install.cmd，选择「以管理员身份运行」。"
  }
  exit $elevated.ExitCode
}

foreach ($name in @($backendName, $hostName)) {
  if (-not (Test-Path -LiteralPath (Join-Path $sourceDir $name))) {
    throw "安装文件不完整：缺少 $name。请重新解压整个 zip。"
  }
}

Write-Host "停止旧的后台进程和任务..." -ForegroundColor Cyan
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
}
Get-Process -Name "MorningDeskBackendHost", "MorningDeskBackend" -ErrorAction SilentlyContinue |
  Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 1000

Write-Host "安装到 $InstallRoot ..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $backendDir, $logDir | Out-Null
Copy-Item -LiteralPath (Join-Path $sourceDir $backendName) -Destination $backendDir -Force
Copy-Item -LiteralPath (Join-Path $sourceDir $hostName) -Destination $backendDir -Force
foreach ($extra in @("README.txt", "uninstall.ps1")) {
  $extraPath = Join-Path $sourceDir $extra
  if (Test-Path -LiteralPath $extraPath) {
    Copy-Item -LiteralPath $extraPath -Destination $InstallRoot -Force
  }
}

$restartVbs = @"
Set shell = CreateObject("WScript.Shell")
shell.Run "schtasks /run /tn ""$TaskName""", 0, False
"@
Set-Content -LiteralPath (Join-Path $InstallRoot "restart.vbs") -Value $restartVbs -Encoding ASCII

$uninstallVbs = @"
Set shell = CreateObject("WScript.Shell")
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""$InstallRoot\uninstall.ps1""", 0, False
"@
Set-Content -LiteralPath (Join-Path $InstallRoot "uninstall.vbs") -Value $uninstallVbs -Encoding ASCII

if (-not $SkipTask) {
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
}

if (-not $SkipShortcuts) {
  Write-Host "创建开始菜单快捷方式..." -ForegroundColor Cyan
  $startMenu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\MorningDesk"
  New-Item -ItemType Directory -Force -Path $startMenu | Out-Null
  $wsh = New-Object -ComObject WScript.Shell

  $restart = $wsh.CreateShortcut((Join-Path $startMenu "重启后台.lnk"))
  $restart.TargetPath = Join-Path $env:WINDIR "System32\wscript.exe"
  $restart.Arguments = "`"$(Join-Path $InstallRoot 'restart.vbs')`""
  $restart.Description = "重启 MorningDesk 后台服务"
  $restart.Save()

  $logs = $wsh.CreateShortcut((Join-Path $startMenu "打开日志.lnk"))
  $logs.TargetPath = Join-Path $env:WINDIR "System32\notepad.exe"
  $logs.Arguments = "`"$(Join-Path $logDir 'backend.log')`""
  $logs.Description = "查看 MorningDesk 后台日志"
  $logs.Save()

  $uninstall = $wsh.CreateShortcut((Join-Path $startMenu "卸载 MorningDesk.lnk"))
  $uninstall.TargetPath = Join-Path $env:WINDIR "System32\wscript.exe"
  $uninstall.Arguments = "`"$(Join-Path $InstallRoot 'uninstall.vbs')`""
  $uninstall.Description = "卸载 MorningDesk 后台服务"
  $uninstall.Save()

  @"
[InternetShortcut]
URL=http://127.0.0.1:$Port/api/health
"@ | Set-Content -LiteralPath (Join-Path $startMenu "接口状态.url") -Encoding ASCII
}

if (-not $SkipStart -and -not $SkipTask) {
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
    Write-Warning "25 秒内没有等到接口就绪，请打开日志：$logDir\backend.log"
  }
}

$process = Get-Process -Name "MorningDeskBackendHost" -ErrorAction SilentlyContinue | Select-Object -First 1
Write-Host ""
Write-Host "安装完成" -ForegroundColor Green
Write-Host "  安装位置 : $InstallRoot"
Write-Host "  后台进程 : $(if ($process) { "pid $($process.Id)，窗口句柄 $($process.MainWindowHandle)" } else { '未运行' })"
Write-Host "  接口     : http://127.0.0.1:$Port/api/health"
Write-Host "  日志     : $logDir\backend.log"
Write-Host "  卸载     : 开始菜单 MorningDesk → 卸载"
