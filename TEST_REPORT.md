# WeChat Fidelity Clipper v0.4.0 — 测试报告

运行环境：Linux 容器、Chromium/Playwright、Python、Node.js。**真实公众号 URL 无法联网访问**：域名 `mp.weixin.qq.com` 在容器中 DNS 解析失败，Web 访问也返回错误。

| 测试命令 | 结果 | 覆盖 |
| --- | --- | --- |
| `python tests/test_static.py` | PASS | Manifest V3 v0.4.0、入口与 JS 语法 |
| `python tests/test_conversion.py` | PASS | DOM、公式、图片、表格、失败回退、HTML 清理、ZIP |
| `python tests/test_v02.py` | PASS | 截图、OCR Mock、MathML、SVG、复杂布局 |
| `python tests/test_companion.py` | PASS | 本地 OCR API 模拟、非法来源拒绝 |
| `python tests/test_v03.py` | PASS | Markdown 图片外链/内嵌、PDF 打印、富文本、离线 ZIP |
| `python tests/test_v03_ui.py` | PASS | UI Mock：一键导出、思源复制、双模式选择、HTML 导出 |
| `python tests/test_v04.py` | PASS | **纯净 Markdown 无复杂网页 HTML**；高保真 HTML 保留颜色/flex、本地图片；思源复制；模拟 URL |
| 真实公众号 `https://mp.weixin.qq.com/s/knx5TvCehRpOACtYuG23QQ` | **BLOCKED** | DNS 无法解析；**未读取真实文章内容** |
| Windows/Edge 安装扩展、真正思源粘贴 | NOT RUN | 需用户本机确认 |
| 真实 pix2tex / Mathpix OCR 精度 | NOT RUN | 只验证接口和模拟返回 |
| “100% 信息无损”认证 | **NOT CLAIMED** | 标准 Markdown 不具备全部 HTML/CSS 与动态媒体表达力 |

### 策略与已知限制

`article.md` 目标是**语义结构保留**，并不追求原页面颜色布局；`article-fidelity.html` 目标是**视觉/结构保留**，不保证跨域字体、外链媒体、JS 动画或复杂 CSS 100% 与原站一致。OCR 结果未经人工验证时作为候选，保留原公式图。

真正的发布验收应在可访问微信的浏览器上进行多篇真实页面的资源哈希、内容覆盖、视觉截图及剪贴板粘贴验证。测试使用真实形态 URL + 合成微信页面 DOM 的隔离输入，**不冒充实站通过**。
