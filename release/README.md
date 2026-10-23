# 发布产物

## 当前版本

| 文件 | 大小 | SHA256 |
|---|---|---|
| `MorningDeskBackend-1.0.0.zip` | 54.0 MB | `1598cf4c55dc08a91a14d59b060d7c0f61bc423dd857517126891d9cd9495ef1` |

校验：

```powershell
Get-FileHash .\MorningDeskBackend-1.0.0.zip -Algorithm SHA256
```

## 里面有什么

```
MorningDeskBackend-1.0.0/
├─ Install.cmd                 双击安装
├─ install.ps1                 安装逻辑（会请求一次 UAC）
├─ uninstall.ps1               卸载
├─ README.txt                  给使用者的说明
├─ MorningDeskBackend.exe      后台数据服务（Node SEA）
├─ MorningDeskBackendHost.exe  静默守护器
├─ LICENSE.txt                 MIT
└─ licenses/                   第三方许可证（Node.js、LibreHardwareMonitor）
```

安装后文件会复制到 `%LOCALAPPDATA%\MorningDesk`，并注册登录自启任务 `MorningDesk Backend`。zip 本身解压后即可删除。

## 怎么发布到 GitHub

### 方式 A：GitHub Releases（推荐）

1. 仓库页面 → **Releases** → **Draft a new release**
2. Tag 填 `v1.0.0`，标题 `MorningDesk Backend 1.0.0`
3. 上传 `MorningDeskBackend-1.0.0.zip`
4. 说明里写上 SHA256 和安装步骤
5. 发布

优点：仓库不会因为历史版本越来越大；单文件上限 2 GB。

### 方式 B：直接提交到 `release/`

当前 zip 54 MB，低于 GitHub 单文件 100 MB 的限制，可以直接提交。缺点是每次 clone 都要拉这 54 MB，后续每个版本还会继续累加。

## 发新版本

1. 修改 `package.json` 的 `version`
2. 运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-release.ps1 -Version 1.1.0
```

3. 新的 zip 和 `SHA256SUMS.txt` 会出现在本目录
4. 同步更新 README 里的版本号和创意工坊描述中的最低后台版本

## 与创意工坊的关系

- 创意工坊只发布前端（网页壁纸），**永远不要**把这里的 exe/zip 传上去。
- 后台的更新独立于壁纸：壁纸更新不会带上 exe，后台更新也不需要重新上传壁纸。
- 两边只通过 `http://127.0.0.1:43761` 通信，接口保持向后兼容即可。
