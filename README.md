# WeChat Fidelity Clipper

> **v0.4.0 双输出模式（可安装测试版）**。高保真 HTML 侧重颜色、字体与布局；纯净 Markdown 专为思源 / Obsidian 等可编辑笔记设计。模拟测试已通过，但真实公众号站点全量验收尚未完成，**不保证 100% 像素或信息无损**。

## v0.4.0 新增功能

| 模式 | 核心输出 | 说明 |
| --- | --- | --- |
| **高保真 HTML** | `article-fidelity.html` | 保留布局、颜色、合并表格和原始图片；支持单文件内嵌图片或 ZIP 离线引用 |
| **纯净 Markdown** | `article.md` | 清除微信网页容器和属性，保留语义 Markdown；复杂表格用带合并注记的 GFM 表格表达 |

**新增「复制为思源兼容 Markdown」**：无需将整段微信 HTML 粘贴到笔记；复制纯净 GFM 文本，去掉 YAML frontmatter，远程图片为原链接，图片本地化则使用 ZIP。双栏同时展示高保真 HTML 与纯净 Markdown，便于复核。

**ZIP 同时包含** `article.md`、`article-rich.md`（兼容旧版）、`article-fidelity.html`、`source/article.html`、`assets/` 和校验报告。仍然支持 `.md` 图片外链、内嵌图片、ZIP 和 PDF 打印。

**安装：** 从 [仓库 downloads](./downloads/) 下载 v0.4.0 ZIP，解压后打开 Chrome `chrome://extensions/` → 开启开发者模式 → 加载已解压扩展程序。见 [安装指南](./INSTALL.md)、[版本说明](./RELEASE_NOTES.md) 和 [测试报告](./TEST_REPORT.md)。

---


**微信公众号文章 → Markdown / PDF 的 Chrome、Edge 剪藏插件。** 支持一键导出外链 Markdown、Data URI 内嵌图片 Markdown、包含离线图片的 ZIP，以及浏览器打印 PDF；提供可选公式 OCR、复杂 HTML 排版回退、双栏预览和多格式复制。

> **版本：v0.4.0（可安装测试版）**。模拟公众号页面测试已执行，真实公众号站点的全量兼容性与“100% 无损”没有得到验证。不可将合成 DOM 测试视为真实线上文章端到端测试。

## 快速开始

1. 从 [Releases](./downloads/) 下载 `wechat-fidelity-clipper-v0.4.0.zip` 并解压，或直接克隆本仓库。
2. Chrome 打开 `chrome://extensions/`（Edge 使用 `edge://extensions/`）。
3. 启用开发者模式，选择“加载已解压的扩展程序”，选择含 `manifest.json` 的 `wechat-fidelity-clipper` 文件夹。
4. 在插件侧边栏粘贴公众号文章 URL，选择 ZIP / Markdown / PDF 等格式并导出。

**无需 npm 或构建。** 本地 OCR 模型需要另外安装 Python 依赖；浏览器 PDF 使用系统打印预览保存。

## 功能概览

| 主要功能 | 内容 |
| --- | --- |
| 一键导出 | 离线资源 ZIP、远程图片 Markdown、Data URI 内嵌 Markdown、可打印 PDF |
| 图片保留 | 原始链接、本地下载、可见区域截图回退 |
| 科研内容 | 原始公式语义提取、可选 pix2tex / Mathpix OCR、复杂表格 HTML 回退 |
| 内容复核 | 双栏预览、OCR 校对、图片/文本完整性记录 |
| 便捷复制 | 纯文本、Markdown 原文、远程图片 Markdown、内嵌图片 Markdown、HTML 富文本 |
| 离线存档 | 资源清单、原始 DOM 文本、HTML 快照、质量报告 |

详细功能、配置方法和已知限制见下方说明，以及 [安装与验收指南](INSTALL.md)、[测试报告](TEST_REPORT.md)、[发布说明](RELEASE_NOTES.md)。

---

## 完整使用说明

Chrome / Edge 的 Manifest V3 浏览器扩展，用户粘贴微信公众号文章 URL 或选取当前文章页，一键生成 Markdown、离线资源 ZIP 或 PDF 打印页面。支持 OCR（可选）、复杂 HTML 回退、双栏预览，以及复制纯文本、Markdown 和 HTML 富文本。

> **发布状态：功能候选版，不是已证明“完全无信息损失”的正式版。** Markdown 无法准确表达所有网页 CSS、互动媒体、动效、特殊字体和合并表格。插件通过原文 DOM 文本快照、HTML 回退、离线图片和质量报告尽量避免静默损失，但不能保证网页逐像素无损或 OCR 公式绝对正确。

## 安装（无需构建）

1. 解压 `wechat-fidelity-clipper-v0.4.0.zip`。
2. Chrome 地址栏进入 `chrome://extensions/`；Edge 进入 `edge://extensions/`。
3. 开启「开发者模式」，点击「加载已解压的扩展程序」，选择包含 `manifest.json` 的文件夹。
4. 在浏览器中打开**能够正常访问**的 `https://mp.weixin.qq.com/s/...`，点击插件图标打开侧边栏；也可以直接粘贴链接。
5. 选择导出格式，点击「一键转换并导出」。等待出现导出或打印预览。完成后可继续在侧栏切换其他导出格式，无须重新抓取文章。

## 四种导出模式

| 格式 | 结果 | 图片存储/渲染 | 注意 |
| --- | --- | --- | --- |
| 离线 ZIP（默认） | `文章标题.zip`，含 `article.md`、`assets/`、HTML、原 DOM、报告 | 默认下载源图并使用相对路径 | 首选长期归档与 Obsidian、Typora；ZIP 解压后不要单独移动 `.md` |
| 外链 Markdown | `文章标题.md` | 采用原图 URL；没有公网 URL 的 SVG/Canvas 可使用 Data URI | 外链可能过期/被反盗链限制，**不保证离线可用** |
| 内嵌 Markdown | `文章标题-内嵌图片.md` | 图片写成 `data:image/*;base64` | 会变大；部分笔记软件不支持 Data URI；内嵌资源上限 65MB，超限提示而不静默删图 |
| PDF | 打开本地打印页面，点「打印 / 保存为 PDF」→ 另存为 PDF | 从 HTML 快照恢复布局并内嵌已下载图片 | Chrome/Edge 桌面版需经过打印对话框；不是无需交互的 PDF 文件直下 |

使用一键模式时会先执行本地资源归档以支持后续切换导出格式。联网状态允许时，资源缓存可避免重复下载；超大文章可能消耗较多内存。**图片外链模式不代表每张图片都一定能在第三方应用中打开。**

## 预览区一键复制

文章成功转换后，双栏预览区提供：

- **复制纯文本**：提取文章中可读文本、链接地址和图像说明，便于粘贴聊天、文档。
- **复制 Markdown 原格式**：复制与 ZIP 中 `article.md` 对应的源码；其中 `assets/...` 相对路径必须和图片文件夹一起复制。
- **复制可粘贴 Markdown（图片外链）**：将本地图路径替换为公众号原图 URL；SVG 等无远端地址的图形以 Data URI 内嵌。
- **复制 Markdown（图片内嵌）**：便于直接粘贴单文件 Markdown；需确认笔记软件对 Data URI 图片的支持。
- **复制富文本**：将安全 HTML 和纯文本同时写入剪贴板；目标软件自行决定如何渲染。

复制操作需要浏览器的剪贴板授权与用户手势；权限被拒绝时会显示错误。

## 图片与特殊排版

ZIP 可以选：原始图片本地下载、保留原始链接，或当前屏幕区域截图。截图使用浏览器 `captureVisibleTab`，仅处理可见区域；长图有裁切风险，插件记录并尝试原图 URL 作为回退。对 flex/grid 图文布局保留 HTML 与有限的计算后样式；截图模式另保存最多 20 个视觉备份。SVG 保存 XML 资源并清理活跃脚本。普通表格转换 GFM，带合并单元格的表格保留 HTML。

## 公式 OCR

优先保留网页已有的 LaTeX、MathML、KaTeX 数学语义；对标识为公式的图片，可以选择：

- 不启用（默认，保存原图）
- 本地 pix2tex OCR：运行 `companion/local_formula_ocr.py`（需自行安装 `companion/requirements-ocr.txt`），监听 `127.0.0.1:8765`
- Mathpix API：需要用户自有 app_id/app_key，图片会上传到第三方，可能收费；凭据不会写入 ZIP

无法确定的 LaTeX 仅作为候选保存，用户可在侧栏人工确认并重新导出。**OCR 候选不代表数学意义被验证**。

### 本地 OCR（Windows PowerShell）

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r companion\requirements-ocr.txt
.\.venv\Scripts\python.exe companion\local_formula_ocr.py
```

无模型的接口联调：

```powershell
.\.venv\Scripts\python.exe companion\local_formula_ocr.py --mock-latex "E=mc^2"
```

## ZIP 文件结构

```text
文章标题.zip
├── article.md
├── assets/
│   ├── images/
│   ├── figures/
│   ├── layouts/       (选择截图模式时)
│   └── equations/     (OCR 结果时)
├── source/
│   ├── article.html
│   └── original-dom.html.txt
├── manifest.json
├── quality-report.json
└── README.txt
```

`quality-report.json` 提供检查项、缺失和回退情况。`manifest.json` 包含图片来源、实际归档文件、状态、字节长度和 SHA-256。原始 DOM 作为不可执行的文本存储；`source/article.html` 为消毒后的语义快照，不是原始网站的完整离线镜像。

## 测试

依赖：Python、Playwright（Chromium）、Pillow，Node.js。运行：

```bash
python tests/test_static.py
python tests/test_conversion.py
python tests/test_v02.py
python tests/test_companion.py
python tests/test_v03.py
python tests/test_v03_ui.py
```

v0.3 包括真实格式 URL + 模拟复杂 DOM 转换、ZIP 结构、图片链接/内嵌 Markdown、复制、PDF 打印 HTML、Chrome API Mock 下的侧栏交互和实际 Chromium 渲染 PDF。浏览器中的 PDF 测试文件见 `tests/reports/v03-print-fixture.pdf`（仅为人工合成文章，不是微信真实内容）。打印文件以 `pdftotext` 和图片渲染复核。

**真实微信访问仍未通过验证**：当前测试环境无法解析 `mp.weixin.qq.com`。可使用以下文章 URL 在本机复测：

`https://mp.weixin.qq.com/s/knx5TvCehRpOACtYuG23QQ`

网络允许时运行：

```bash
python tests/live_wechat_check.py "https://mp.weixin.qq.com/s/knx5TvCehRpOACtYuG23QQ"
```

该脚本检查真实页面是否打开、正文是否存在；再使用实际安装的 Chrome/Edge 执行四种导出，并在本地与页面逐项复核。测试站点若验证、下架或受限，请更换自己有权访问的真实文章。

## 已知限制

- 与标准 Markdown 表达能力不同的复杂 CSS 需要保留 HTML，不能保证所有阅读器渲染一致。
- 图片链接或请求可能因访问权限、地域、CDN 防盗链而失败；报告会标记，不绕过限制。
- Data URI 图片并非所有笔记软件兼容；更推荐解压 ZIP 导入知识库。
- PDF 打印版保留可选择的文本，但跨页分页、外部字体和动态组件仍可能有差异。
- 真实 Mathpix/pix2tex OCR 模型识别精度、不同微信公众号排版未做大规模实测。
- Chromium 测试中 PDF 使用 `page.pdf()` 来检查可打印 HTML，**不代表真实 Chrome 打印 UI 已完成端到端验证**。
- 单资源最大 75 MB，离线资源总量最大 250 MB；本文内嵌总量最大 65 MB。

## 第三方依赖与隐私

扩展运行时使用随包的 JSZip（见 `vendor/JSZIP-LICENSE.md`），不需要 npm、远程脚本或自有云端服务。可选 Mathpix 会向用户授权的第三方传输公式图片；其费用和隐私条款由服务商负责。仅处理用户自己能够正常访问并依法保存的文章。