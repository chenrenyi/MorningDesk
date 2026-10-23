$ErrorActionPreference = "Stop"
$dll = if ($env:LHM_DLL) { $env:LHM_DLL } else { Join-Path $PSScriptRoot "..\tools\LibreHardwareMonitor\LibreHardwareMonitorLib.dll" }

if (-not (Test-Path -LiteralPath $dll)) {
  exit 0
}

Add-Type -Path $dll
$computer = New-Object LibreHardwareMonitor.Hardware.Computer
$computer.IsCpuEnabled = $true
$computer.Open()

function Get-HardwareSensors {
  param($Hardware)

  $Hardware.Update()
  $Hardware.Sensors
  foreach ($child in $Hardware.SubHardware) {
    Get-HardwareSensors $child
  }
}

try {
  $temperatures = $computer.Hardware |
    ForEach-Object { Get-HardwareSensors $_ } |
    Where-Object {
      $_.SensorType -eq [LibreHardwareMonitor.Hardware.SensorType]::Temperature -and
      $_.Value -ne $null
    }

  $package = $temperatures | Where-Object { $_.Name -eq "CPU Package" } | Select-Object -First 1
  if ($package) {
    [math]::Round([double]$package.Value, 0)
    exit 0
  }

  $maximum = $temperatures | Measure-Object -Property Value -Maximum
  if ($maximum.Count) {
    [math]::Round([double]$maximum.Maximum, 0)
  }
} finally {
  $computer.Close()
}
