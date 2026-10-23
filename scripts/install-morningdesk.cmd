@echo off
rem MorningDesk (清晨书桌) 后台安装入口。
rem 会请求一次管理员权限来注册登录自启任务，之后开机全程静默。
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-morningdesk.ps1"
if errorlevel 1 pause
