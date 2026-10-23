const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "public");
const title = "MorningDesk 清晨书桌";

function findWallpaperEngine() {
  if (process.env.WE_DIR) return process.env.WE_DIR;
  const guesses = [
    "C:\\MyData\\game\\steam\\steamapps\\common\\wallpaper_engine",
    "C:\\Program Files (x86)\\Steam\\steamapps\\common\\wallpaper_engine",
    "C:\\Program Files\\Steam\\steamapps\\common\\wallpaper_engine",
    "D:\\Steam\\steamapps\\common\\wallpaper_engine",
    "E:\\Steam\\steamapps\\common\\wallpaper_engine"
  ];
  return guesses.find((candidate) => fs.existsSync(path.join(candidate, "wallpaper64.exe"))) || null;
}

function copyTree(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else fs.copyFileSync(from, to);
  }
}

const engineRoot = findWallpaperEngine();
const target =
  process.env.WE_PROJECT_DIR ||
  (engineRoot
    ? path.join(engineRoot, "projects", "myprojects", "morningdesk_web")
    : path.join(root, "dist", "web-wallpaper"));

console.log(`Source : ${publicDir}`);
console.log(`Target : ${target}`);

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
copyTree(publicDir, target);

// Wallpaper Engine expects the entry file to be a local HTML document. Keeping
// a copy named index.html avoids depending on "file" pointing somewhere else.
fs.copyFileSync(path.join(publicDir, "lifestyle.html"), path.join(target, "index.html"));

let preview = null;
const background = path.join(publicDir, "assets", "morning-desk-bg.png");
if (fs.existsSync(background)) {
  const previewPath = path.join(target, "preview.jpg");
  const script = [
    "Add-Type -AssemblyName System.Drawing",
    "$src = [System.Drawing.Image]::FromFile($env:MD_SRC)",
    "$bmp = New-Object System.Drawing.Bitmap 512, 288",
    "$graphics = [System.Drawing.Graphics]::FromImage($bmp)",
    "$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic",
    "$graphics.DrawImage($src, 0, 0, 512, 288)",
    "$bmp.Save($env:MD_OUT, [System.Drawing.Imaging.ImageFormat]::Jpeg)",
    "$graphics.Dispose(); $bmp.Dispose(); $src.Dispose()"
  ].join("; ");
  try {
    execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
      env: { ...process.env, MD_SRC: background, MD_OUT: previewPath },
      stdio: "inherit"
    });
    preview = "preview.jpg";
  } catch {
    console.warn("Preview generation failed; the project will use the default thumbnail.");
  }
}

const project = {
  description: "MorningDesk 清晨书桌：天气与硬件数据由本机 MorningDesk Backend（127.0.0.1:43761）提供",
  file: "index.html",
  general: {
    properties: {
      schemecolor: {
        order: 0,
        text: "ui_browse_properties_scheme_color",
        type: "color",
        value: "0.784 0.612 0.396"
      }
    }
  },
  title,
  type: "web"
};
if (preview) project.preview = preview;

fs.writeFileSync(path.join(target, "project.json"), JSON.stringify(project, null, 2) + "\n");
fs.writeFileSync(
  path.join(target, "README.txt"),
  [
    "MorningDesk（清晨书桌）网页壁纸工程",
    "",
    "这个目录由 `npm run build:web` 从源码 public/ 生成，不要直接修改。",
    "要改页面请改源码，然后重新运行 npm run build:web。",
    "",
    "数据来源：本机 MorningDesk Backend",
    "  http://127.0.0.1:43761/api/health",
    "",
    "在 Wallpaper Engine 编辑器中打开本目录的 project.json 即可预览/应用。"
  ].join("\r\n"),
  "utf8"
);

const files = fs.readdirSync(target);
console.log(`Built web wallpaper project with ${files.length} top-level entries.`);
if (!engineRoot) {
  console.log("Wallpaper Engine was not detected; project was written to dist/web-wallpaper.");
}
