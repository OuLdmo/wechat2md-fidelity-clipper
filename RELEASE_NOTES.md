# WeChat Fidelity Clipper v0.3.0

首个可安装测试的公开发行候选版（**非无损验证正式版**）。

## 主要功能

- 从公众号文章链接或当前标签页一键提取正文。
- 导出本地图片 ZIP、外链图片 Markdown、Data URI 内嵌 Markdown 或 PDF 打印页面。
- 支持公式语义提取、可选 pix2tex / Mathpix 识别与人工修订。
- 支持 SVG、普通表格、复杂 HTML 表格与图文布局备份。
- 提供原文与 Markdown 双栏预览，以及纯文本、Markdown、HTML 富文本复制。
- 离线 ZIP 包含 `article.md`、资源文件夹、HTML 快照、资源清单和质量报告。

## 测试与限制

- 已进行了本地静态检查与基于**模拟公众号 DOM**的回归测试。
- 当前环境未能访问 `mp.weixin.qq.com`，真实文章端到端测试待完成。
- 公式 OCR 实际精度、浏览器实际安装权限、复杂交互排版仍需实测。
- PDF 需通过 Chrome/Edge 打印界面操作，不是直接静默下载。
- 无法保证所有公众号内容 100% 无损转换。请检查 `quality-report.json`。

**安全注意：** 不要在 Issue、日志或截图中发布 Mathpix 密钥及其他凭据。
