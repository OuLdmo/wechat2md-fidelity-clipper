# WeChat Fidelity Clipper v0.4.0

## 双输出模式 / Dual output profiles

- **高保真 HTML**：保留文章 DOM、颜色、字体样式、复杂 flex/grid 布局及本地图片等；ZIP 内 `article-fidelity.html` 使用相对资源路径，单文件 HTML 导出可嵌入可访问图片。不可保证微信原生脚本、动态动画、所有字体、外链图片或跨域资源的像素级还原。
- **纯净 Markdown**：ZIP 内 `article.md` 不输出微信特定容器、style/class/data-* 等网页排版属性。尽量保留标题、公式、链接、列表、图片与 GFM 表格。复杂表格展开并注明行/列合并，原始合并结构保留在 HTML 中。
- 增加「复制为思源兼容 Markdown」，去除 YAML frontmatter，采用纯净 Markdown 与网页图片链接，方便直接粘贴进思源、Obsidian 等编辑器。
- 独立 HTML 单文件下载 + 原有图片外链 `.md`、图片内嵌 `.md`、离线 ZIP 和 PDF 打印导出继续保留。
- 高保真 HTML 增强从网页计算样式中提取文字颜色、背景色、字体等规则（有边界限制），并尽量保留 KaTeX 已渲染内容。
- 回归测试增加双输出结构断言、HTML 图片显示、思源复制、界面切换和复杂表格语义检查。

## 重要限制

这是**可发布的测试版本**，并非能够证明“100% 信息零损失”的正式版本：纯 Markdown 的表达能力低于 HTML/CSS；动态元素、字体、Canvas、复杂公式及被访问控制阻挡的资源可能降级。ZIP 提供原始 DOM 文本备份、HTML、资产清单与异常报告。

本环境 `mp.weixin.qq.com` DNS 无法解析。对真实格式公众号 URL 的测试使用**模拟 DOM**；没有声称已打开真实文章或完成实站端到端验证。Chrome/Edge 扩展安装、思源笔记实际粘贴、数学 OCR 模型真实精度仍需要用户侧验收。
