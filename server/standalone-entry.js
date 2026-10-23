const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawnSync } = require("node:child_process");
const sea = require("node:sea");

const port = process.env.PORT || "43761";

function ensureElevated() {
  if (process.env.MORNING_DESK_SKIP_ELEVATION === "1") return;
  const command = [
    "$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())",
    "if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {",
    "  Start-Process -FilePath $env:MORNING_DESK_EXE -Verb RunAs",
    "  exit 1",
    "}"
  ].join("; ");
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command], {
    env: { ...process.env, MORNING_DESK_EXE: process.execPath },
    windowsHide: true
  });
  if (result.status === 1) process.exit(0);
}

function isDashboardRunning() {
  return new Promise((resolve) => {
    const request = http.get(`http://127.0.0.1:${port}/api/health`, { timeout: 1000 }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
  });
}

function extractAsset(assetName, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, Buffer.from(sea.getAsset(assetName)));
}

function prepareEmbeddedFiles() {
  const root = path.join(os.tmpdir(), "MorningDeskDashboard-v1");
  const publicDir = path.join(root, "public");
  const sensorScript = path.join(root, "server", "read-cpu-temperature.ps1");
  const lhmDll = path.join(root, "tools", "LibreHardwareMonitor", "LibreHardwareMonitorLib.dll");
  const assets = JSON.parse(Buffer.from(sea.getAsset("asset-manifest.json")).toString("utf8"));

  for (const asset of assets) extractAsset(asset, path.join(root, asset));
  process.env.PUBLIC_DIR = publicDir;
  process.env.CPU_TEMPERATURE_SCRIPT = sensorScript;
  process.env.LHM_DLL = lhmDll;
}

async function main() {
  if (await isDashboardRunning()) {
    return;
  }

  if (sea.isSea()) {
    ensureElevated();
    prepareEmbeddedFiles();
  }

  process.env.HOST ||= "127.0.0.1";
  process.env.PORT ||= port;
  require("./index");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
