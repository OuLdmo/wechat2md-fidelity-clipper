# 发布到 GitHub（Windows PowerShell）

当前文件为已整理的 v0.3.0 完整工程，可上传全部源码、测试文件、插件图标和使用文档。

## 1. 安装并登录 GitHub CLI

```powershell
winget install --id GitHub.cli -e
gh auth login
```

根据命令行提示用浏览器授权 GitHub；**不要把访问令牌发送给其他人或粘贴到聊天中**。同时确保安装 Git：

```powershell
winget install --id Git.Git -e
git config --global user.name "Your GitHub Name"
git config --global user.email "your-public-or-noreply-email@example.com"
```

安装 GitHub CLI / Git 后，建议重新打开 PowerShell。

## 2. 一键创建仓库、上传全部工程、创建 Release

在该项目根目录（含 `manifest.json`）运行：

```powershell
.\publish-github.ps1 -Public
```

这会创建公开仓库 `wechat-fidelity-clipper`、推送 `main`、设置项目简介、创建 `v0.3.0` Release 并上传插件 ZIP。首次执行需经过 GitHub 的交互登录授权。

不想公开项目，改为：

```powershell
.\publish-github.ps1
```

默认创建**私有**仓库。若 PowerShell 阻止执行脚本，可在当前会话使用：

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\publish-github.ps1 -Public
```

## 3. 校验发布成功

```powershell
gh repo view --web
gh release view v0.3.0 --web
```

项目介绍建议：

> WeChat public articles to Markdown & PDF: external/embedded/local images, offline ZIP, formula OCR, HTML layout fallback, preview and copy.

推荐 Topics：`wechat`, `markdown`, `chrome-extension`, `web-clipper`, `pdf`, `ocr`, `edge-extension`。

**重要：** 脚本会拒绝覆盖已存在的同名仓库，以防意外覆盖你的旧项目。如需使用其他名称：`-RepoName 'my-wechat-clipper'`。
