const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");
const buildDir = path.join(distDir, "wallpaper-build");
const payloadDir = path.join(buildDir, "payload");
const releaseDir = path.join(distDir, "wallpaper-releases");
const version = process.argv[2] || JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
const powershell = "powershell.exe";
const csc = path.join(process.env.WINDIR, "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");

function run(command, args) {
  execFileSync(command, args, { cwd: root, stdio: "inherit" });
}

function output(command, args) {
  return execFileSync(command, args, { cwd: root, encoding: "utf8" }).trim();
}

function copy(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

fs.rmSync(buildDir, { recursive: true, force: true });
fs.mkdirSync(payloadDir, { recursive: true });
fs.mkdirSync(releaseDir, { recursive: true });

run(process.execPath, [path.join(root, "scripts", "build-companion.js"), version]);
copy(path.join(distDir, "build", "payload", "MorningDeskBackend.exe"), path.join(payloadDir, "MorningDeskBackend.exe"));

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
copy(coreDll, path.join(payloadDir, path.basename(coreDll)));
copy(path.join(sdkRoot, "runtimes", "win-x64", "native", "WebView2Loader.dll"), path.join(payloadDir, "WebView2Loader.dll"));

const payloadZip = path.join(buildDir, "MorningDeskWallpaperPayload.zip");
run(powershell, ["-NoProfile", "-Command", `Compress-Archive -Path '${payloadDir}\\*' -DestinationPath '${payloadZip}' -Force`]);

const assemblyInfo = path.join(buildDir, "AssemblyInfo.cs");
const assemblyVersion = `${version}.0`.split(".").slice(0, 4).join(".");
fs.writeFileSync(
  assemblyInfo,
  `using System.Reflection;\n[assembly: AssemblyVersion("${assemblyVersion}")]\n[assembly: AssemblyFileVersion("${assemblyVersion}")]\n`
);
const exePath = path.join(releaseDir, `MorningDeskWallpaper-${version}.exe`);
run(csc, [
  "/nologo",
  "/target:winexe",
  `/out:${exePath}`,
  "/reference:System.dll",
  "/reference:System.Drawing.dll",
  "/reference:System.Windows.Forms.dll",
  "/reference:System.IO.Compression.dll",
  "/reference:System.IO.Compression.FileSystem.dll",
  `/reference:${coreDll}`,
  `/resource:${payloadZip},MorningDeskWallpaperPayload`,
  path.join(root, "desktop", "WallpaperHost.cs"),
  assemblyInfo
]);
console.log(`Built Wallpaper Engine application wallpaper: ${exePath}`);
