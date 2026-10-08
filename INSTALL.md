# WeChat Fidelity Clipper v0.4.0 安装与验收

## 安装（Chrome / Edge 116+）

1. 下载 `wechat-fidelity-clipper-v0.4.0.zip` 并解压。
2. 在 Chrome 打开 `chrome://extensions/`（Edge 为 `edge://extensions/`）。
3. 打开开发者模式 → 加载已解压的扩展程序 → 选择包含 `manifest.json` 的目录。
4. 打开可正常访问的公众号文章，点击扩展图标，粘贴 `https://mp.weixin.qq.com/s/...` 链接。
5. 在「内容输出模式」中选择 **高保真 HTML** 或 **纯净 Markdown**。选择对应一键导出格式并转换。
6. 完成转换后可在双栏查看保留版式的 HTML 与纯净 Markdown 的差异；点击「复制为思源兼容 Markdown」后直接粘贴到思源。

## 输出

- `article-fidelity.html`：高保真 HTML 归档，ZIP 中的本地图片使用 `assets/` 相对路径。
- `article.md`：纯净 Markdown，适合思源、Obsidian、Typora。
- `article-rich.md`：保留复杂 HTML 的旧版兼容内容（不适合思源纯净粘贴）。
- `source/article.html`：归档快照；`source/original-dom.html.txt`：非执行型原始 DOM 证据。
- `assets/`、`manifest.json`、`quality-report.json`：图片资源、资源清单和质量记录。

单文件 HTML 会将已下载图片用 data: URI 嵌入；资源不可下载时仍保留原链接并记录失败。图片外链 Markdown 要求联网；内嵌图片 Markdown 可能不被部分编辑器支持，建议用 ZIP 将图片本地化。

## 验收建议

在 Windows 本地 Chrome/Edge 选取至少 20 篇可合法访问文章，覆盖 KaTeX、MathML、图片公式、flex/grid、背景图、合并单元格、SVG、Canvas、GIF、长文、引用等。逐篇检查质量报告中的图片与文本覆盖、Markdown 中的公式/表格语义，以及两栏视觉差异。**模拟测试通过并不能证明真实文章完全无损。**

若需要 OCR，可选安装本地 `companion/` 中的 pix2tex 服务或配置 Mathpix API。云端 OCR 会上传所选公式图片，谨慎处理敏感内容。
