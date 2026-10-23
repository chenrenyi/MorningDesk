const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const cpuTemperatureScript = process.env.CPU_TEMPERATURE_SCRIPT || path.resolve(__dirname, "read-cpu-temperature.ps1");
let previousCpu = snapshotCpu();
let previousNetwork = null;
let cachedDisks = [];
let cachedGpu = null;
let cachedCpuTemperature = null;
let lastSlowPoll = 0;
let previousNetworkStats = null;

function snapshotCpu() {
  return os.cpus().map((cpu) => ({ ...cpu.times }));
}

function cpuUsage() {
  const current = snapshotCpu();
  let idle = 0;
  let total = 0;

  current.forEach((times, index) => {
    const before = previousCpu[index] || times;
    const idleDelta = times.idle - before.idle;
    const totalDelta = Object.keys(times).reduce((sum, key) => sum + times[key] - before[key], 0);
    idle += idleDelta;
    total += totalDelta;
  });

  previousCpu = current;
  return total > 0 ? clamp(round((1 - idle / total) * 100, 1)) : 0;
}

function execPowerShell(script) {
  return execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], {
    timeout: 4500,
    windowsHide: true,
    maxBuffer: 1024 * 1024
  });
}

async function readDisks() {
  try {
    const { stdout } = await execPowerShell(
      "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-CimInstance Win32_LogicalDisk -Filter \"DriveType=3\" | Select-Object DeviceID,VolumeName,Size,FreeSpace | ConvertTo-Json -Compress"
    );
    const rows = normalizeJsonArray(stdout);
    return rows.map((disk) => ({
      name: disk.VolumeName || `Local Disk ${disk.DeviceID}`,
      mount: disk.DeviceID,
      size: Number(disk.Size || 0),
      free: Number(disk.FreeSpace || 0),
      usedPercent: disk.Size ? round((1 - disk.FreeSpace / disk.Size) * 100, 1) : 0
    }));
  } catch {
    return cachedDisks;
  }
}

async function readGpu() {
  try {
    const { stdout } = await execFileAsync(
      "nvidia-smi",
      ["--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu", "--format=csv,noheader,nounits"],
      { timeout: 3000, windowsHide: true }
    );
    const [name, usage, memoryUsed, memoryTotal, temperature] = stdout.trim().split(",").map((item) => item.trim());
    return {
      available: true,
      name,
      usage: Number(usage),
      memoryUsed: Number(memoryUsed) * 1024 * 1024,
      memoryTotal: Number(memoryTotal) * 1024 * 1024,
      temperature: Number(temperature)
    };
  } catch {
    return { available: false };
  }
}

async function readCpuTemperature() {
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", cpuTemperatureScript],
      { timeout: 4500, windowsHide: true, maxBuffer: 1024 * 1024 }
    );
    const value = Number(stdout.trim());
    if (Number.isFinite(value) && value > 0 && value < 130) return value;
  } catch {
    // Fall back to Windows ACPI data when LibreHardwareMonitor is unavailable.
  }

  try {
    const { stdout } = await execPowerShell(
      "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $temps = Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction Stop | ForEach-Object { ($_.CurrentTemperature / 10) - 273.15 }; if ($temps) { [math]::Round(($temps | Measure-Object -Maximum).Maximum, 0) }"
    );
    const value = Number(stdout.trim());
    return Number.isFinite(value) && value > 0 && value < 130 ? value : null;
  } catch {
    return null;
  }
}

async function readNetwork() {
  const interfaces = os.networkInterfaces();
  const active = Object.entries(interfaces)
    .flatMap(([name, entries]) => (entries || []).map((entry) => ({ name, ...entry })))
    .find((entry) => entry.family === "IPv4" && !entry.internal);
  let downloadBps = 0;
  let uploadBps = 0;

  try {
    const { stdout } = await execPowerShell(
      "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-NetAdapterStatistics | Select-Object Name,ReceivedBytes,SentBytes | ConvertTo-Json -Compress"
    );
    const totals = normalizeJsonArray(stdout).reduce(
      (sum, adapter) => ({
        received: sum.received + Number(adapter.ReceivedBytes || 0),
        sent: sum.sent + Number(adapter.SentBytes || 0)
      }),
      { received: 0, sent: 0 }
    );
    const measuredAt = Date.now();
    if (previousNetworkStats) {
      const seconds = Math.max((measuredAt - previousNetworkStats.measuredAt) / 1000, 0.1);
      downloadBps = Math.max(0, (totals.received - previousNetworkStats.received) / seconds);
      uploadBps = Math.max(0, (totals.sent - previousNetworkStats.sent) / seconds);
    }
    previousNetworkStats = { ...totals, measuredAt };
  } catch {
    // Keep the connection metadata available when adapter counters cannot be read.
  }

  return {
    name: active?.name || "Offline",
    address: active?.address || "--",
    online: Boolean(active),
    downloadBps,
    uploadBps
  };
}

function normalizeJsonArray(value) {
  const parsed = JSON.parse(value.trim() || "[]");
  return Array.isArray(parsed) ? parsed : [parsed];
}

function round(value, precision = 0) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function clamp(value) {
  return Math.max(0, Math.min(100, value));
}

function averageCpuSpeed() {
  const cpus = os.cpus();
  return cpus.length ? Math.round(cpus.reduce((sum, cpu) => sum + cpu.speed, 0) / cpus.length) : 0;
}

async function collectMetrics() {
  const now = Date.now();
  if (now - lastSlowPoll > 30000 || !lastSlowPoll) {
    [cachedDisks, cachedGpu, cachedCpuTemperature] = await Promise.all([readDisks(), readGpu(), readCpuTemperature()]);
    lastSlowPoll = now;
  }

  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const cpus = os.cpus();
  const network = await readNetwork();
  previousNetwork = network;

  return {
    timestamp: new Date().toISOString(),
    system: {
      hostname: os.hostname(),
      platform: `${os.type()} ${os.release()}`,
      uptime: os.uptime()
    },
    cpu: {
      name: cpus[0]?.model?.trim() || "Unknown CPU",
      usage: cpuUsage(),
      temperature: cachedCpuTemperature,
      speedMhz: averageCpuSpeed(),
      cores: cpus.length
    },
    memory: {
      total: totalMemory,
      free: freeMemory,
      used: totalMemory - freeMemory,
      usage: round(((totalMemory - freeMemory) / totalMemory) * 100, 1)
    },
    gpu: cachedGpu || { available: false },
    disks: cachedDisks,
    network: previousNetwork || network
  };
}

module.exports = { collectMetrics };
