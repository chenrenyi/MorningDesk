const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");
const buildDir = path.join(distDir, "build");
const embeddedDir = path.join(buildDir, "embedded");
const payloadDir = path.join(buildDir, "payload");
const releaseDir = path.join(distDir, "releases");
const assetManifest = [];
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const args = process.argv.slice(2);
const backendOnly = args.includes("--backend-only");
const version = args.find((argument) => !argument.startsWith("--")) || packageJson.version;

function copyAsset(sourcePath, assetName) {
  const targetPath = path.join(embeddedDir, assetName);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
  assetManifest.push(assetName.replaceAll("\\", "/"));
}

function copyTree(sourceDir, assetDir) {
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const assetName = path.join(assetDir, entry.name);
    if (entry.isDirectory()) copyTree(sourcePath, assetName);
    else copyAsset(sourcePath, assetName);
  }
}

function run(command, args) {
  execFileSync(command, args, { cwd: root, stdio: "inherit" });
}

function output(command, args) {
  return execFileSync(command, args, { cwd: root, encoding: "utf8" }).trim();
}

fs.rmSync(buildDir, { recursive: true, force: true });
fs.mkdirSync(embeddedDir, { recursive: true });
fs.mkdirSync(payloadDir, { recursive: true });
fs.mkdirSync(releaseDir, { recursive: true });
copyTree(path.join(root, "public"), "public");
copyAsset(path.join(root, "server", "read-cpu-temperature.ps1"), path.join("server", "read-cpu-temperature.ps1"));
copyAsset(
  path.join(root, "tools", "LibreHardwareMonitor", "LibreHardwareMonitorLib.dll"),
  path.join("tools", "LibreHardwareMonitor", "LibreHardwareMonitorLib.dll")
);
fs.writeFileSync(path.join(embeddedDir, "asset-manifest.json"), JSON.stringify(assetManifest));

const nodeExe = process.execPath;
const esbuildCli = path.join(root, "node_modules", "esbuild", "bin", "esbuild");
const postjectCli = path.join(root, "node_modules", "postject", "dist", "cli.js");
const bundlePath = path.join(buildDir, "standalone.cjs");
const blobPath = path.join(buildDir, "sea-prep.blob");
const backendPath = path.join(payloadDir, "MorningDeskBackend.exe");
const hostPath = path.join(payloadDir, "MorningDeskHost.exe");
const payloadZipPath = path.join(buildDir, "MorningDeskPayload.zip");
const exePath = path.join(releaseDir, `MorningDeskDashboard-${version}.exe`);
const seaConfigPath = path.join(buildDir, "sea-config.json");
const assemblyInfoPath = path.join(buildDir, "AssemblyInfo.cs");
const assets = Object.fromEntries(
  ["asset-manifest.json", ...assetManifest].map((assetName) => [
    assetName,
    path.join(embeddedDir, assetName)
  ])
);

run(nodeExe, [esbuildCli, "server/standalone-entry.js", "--bundle", "--platform=node", "--format=cjs", `--outfile=${bundlePath}`]);
fs.writeFileSync(
  seaConfigPath,
  JSON.stringify({ main: bundlePath, output: blobPath, disableExperimentalSEAWarning: true, assets }, null, 2)
);
run(nodeExe, ["--experimental-sea-config", seaConfigPath]);
fs.copyFileSync(nodeExe, backendPath);
run(nodeExe, [
  postjectCli,
  backendPath,
  "NODE_SEA_BLOB",
  blobPath,
  "--sentinel-fuse",
  "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"
]);

function buildDashboard() {
  const powershell = "powershell.exe";
  const sdkRoot = output(powershell, [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    path.join(root, "scripts", "ensure-webview2-sdk.ps1"),
    "-TargetDir",
    path.join(root, ".cache")
  ]).split(/\r?\n/).pop();
  const coreDll = path.join(sdkRoot, "lib", "net462", "Microsoft.Web.WebView2.Core.dll");
  const winFormsDll = path.join(sdkRoot, "lib", "net462", "Microsoft.Web.WebView2.WinForms.dll");
  const loaderDll = path.join(sdkRoot, "runtimes", "win-x64", "native", "WebView2Loader.dll");
  const csc = path.join(process.env.WINDIR, "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");

  run(csc, [
    "/nologo",
    "/target:winexe",
    `/out:${hostPath}`,
    "/reference:System.dll",
    "/reference:System.Drawing.dll",
    "/reference:System.Windows.Forms.dll",
    `/reference:${coreDll}`,
    `/reference:${winFormsDll}`,
    path.join(root, "desktop", "DashboardHost.cs")
  ]);
  fs.copyFileSync(coreDll, path.join(payloadDir, path.basename(coreDll)));
  fs.copyFileSync(winFormsDll, path.join(payloadDir, path.basename(winFormsDll)));
  fs.copyFileSync(loaderDll, path.join(payloadDir, path.basename(loaderDll)));

  if (fs.existsSync(payloadZipPath)) fs.rmSync(payloadZipPath);
  run(powershell, [
    "-NoProfile",
    "-Command",
    `Compress-Archive -Path '${payloadDir}\\*' -DestinationPath '${payloadZipPath}' -Force`
  ]);
  const assemblyVersion = `${version}.0`.split(".").slice(0, 4).join(".");
  fs.writeFileSync(
    assemblyInfoPath,
    `using System.Reflection;\n[assembly: AssemblyVersion("${assemblyVersion}")]\n[assembly: AssemblyFileVersion("${assemblyVersion}")]\n`
  );
  run(csc, [
    "/nologo",
    "/target:winexe",
    `/out:${exePath}`,
    `/win32manifest:${path.join(root, "desktop", "app.manifest")}`,
    "/reference:System.dll",
    "/reference:System.IO.Compression.dll",
    "/reference:System.IO.Compression.FileSystem.dll",
    `/resource:${payloadZipPath},MorningDeskPayload`,
    path.join(root, "desktop", "Bootstrap.cs"),
    assemblyInfoPath
  ]);
  console.log(`Built ${exePath}`);
}

if (backendOnly) {
  console.log(`Built ${backendPath}`);
} else {
  buildDashboard();
}
