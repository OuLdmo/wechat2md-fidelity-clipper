# WeChat Fidelity Clipper v0.3.0 测试记录

测试环境：Linux 容器、Chromium（Playwright）、Node.js、Python、Pillow。测试使用合成公众号页面；真实链接仅用于格式及页面来源模拟。

| 测试 | 结果 | 验证范围 |
| --- | --- | --- |
| `tests/test_static.py` | PASS | MV3 元数据、入口文件、Node.js 语法检查 |
| `tests/test_conversion.py` | PASS | 提取、MD、ZIP、图片回退、HTML 安全处理 |
| `tests/test_v02.py` | PASS | 原图截图、公式 OCR Mock、Mathpix Mock、MathML、SVG 和表格 |
| `tests/test_companion.py` | PASS | 本地 OCR 接口 Mock 与来源限制 |
| `tests/test_v03.py` | PASS | 四种导出内容、图片内嵌、纯文本、打印 HTML 和 PDF 渲染 |
| `tests/test_v03_ui.py` | PASS | Chrome API Mock 下侧栏一键导出、预览切换、复制、重新导出 |
| Chromium 测试 HTML → PDF | PASS | A4 文件、PNG/SVG 显示、表格、可复制文本；输出测试用 PDF |
| 微信公众号真实外网访问 | BLOCKED | DNS 无法解析 `mp.weixin.qq.com`，**没有通过真实性验证** |
| Chrome/Edge 实机扩展 UI | NOT RUN | 需要非托管浏览器环境和真实扩展安装 |
| 真实 pix2tex/Mathpix 准确率 | NOT RUN | 只测了 Mock 接口，没有推断实际 OCR 精度 |

实际测试生成 `tests/reports/v03-print-fixture.pdf` 与 `tests/reports/v03-panel-fixture.png`。其中截图使用 UI Mock，未加载扩展样式 CSS，不等同于安装后的最终视觉效果。

**版本判断**：v0.3.0 是安装与功能验证候选版。完整资源保存、HTML 快照及结构差异检测会降低信息损失，但不能证明对全部公众号网页真正 100% 无损，因此不标记为正式无损版。
