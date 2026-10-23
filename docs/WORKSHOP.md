# 创意工坊上传说明

## 为什么只传前端

Steam 创意工坊对「应用程序」类壁纸审核很严：

- 带 exe 的「应用程序」壁纸基本无法通过审核；
- 网页壁纸只包含 HTML/CSS/JS/图片，可以通过。

所以发布结构是：

- **创意工坊**：网页壁纸（前台视觉）
- **GitHub**：`MorningDeskBackend-<version>.zip`（后台数据）

两边通过固定端口 `http://127.0.0.1:43761` 通信，互不打包。

## 工程结构

`npm run build:web` 生成：

```
morningdesk_web/
├─ project.json      { "type": "web", "file": "index.html", "preview": "preview.jpg" }
├─ index.html        lifestyle.html 的副本
├─ lifestyle.css / lifestyle.js / config.js
├─ assets/morning-desk-bg.png
└─ preview.jpg       512×288 缩略图
```

`project.json` 关键字段：

```json
{
  "type": "web",
  "file": "index.html",
  "title": "MorningDesk 清晨书桌",
  "preview": "preview.jpg",
  "description": "清晨书桌场景 + 实时硬件与天气",
  "general": { "properties": { "schemecolor": { "type": "color", "value": "0.784 0.612 0.396" } } }
}
```

## 上传步骤

1. 打开 Wallpaper Engine →「创建新的壁纸」→ 选择 **网页**；
2. 在编辑器里「文件 → 打开」，选中 `morningdesk_web/project.json`；
3. 检查预览：时钟走字、CPU/GPU 有数字、天气有温度；
4. 填标题 `MorningDesk 清晨书桌`、描述（写清楚「需要安装 GitHub 上的后台」）；
5. 选好预览图（`preview.jpg` 或自己截一张桌面效果图）；
6. 「发布」→ 创意工坊，类型选「网页 / Web」。

## 描述里怎么写

建议包含：

```
本壁纸需要配合本机后台程序使用（Steam 创意工坊不能上传 exe）：
1. 打开 GitHub：<仓库地址>
2. 在 Releases 下载 MorningDeskBackend-x.y.z.zip
3. 解压后双击 Install.cmd，允许一次管理员权限
4. 回到 Wallpaper Engine 应用本壁纸

后台只监听 127.0.0.1:43761，不上传任何数据。
```

> Steam 有时会过滤外部链接；如果 GitHub 链接被吞，可以把「项目名 + GitHub」写在描述里，或在讨论区置顶。

## 更新壁纸

1. 改源码；
2. `npm run build:web`；
3. 在 WE 编辑器里重新打开工程，确认效果；
4. 「发布更新」。

订阅者会自动收到新版本。**后台不会随创意工坊更新**，需要单独发 GitHub Release，并在描述里写最低后台版本。

## 不要上传的内容

- `MorningDeskBackend.exe` / `MorningDeskBackendHost.exe`
- `release/` 里的 zip
- `node_modules/`、`dist/`、日志、`.git`
- 任何个人路径、截图里的隐私信息

## 本地预览（不发布）

不想发布也可以直接用：

```powershell
npm run build:web
```

然后在 WE 编辑器里打开 `projects\myprojects\morningdesk_web\project.json`，「文件 → 应用壁纸」。本机后台照常工作。
