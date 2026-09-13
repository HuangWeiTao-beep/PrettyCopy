# PrettyCopy

PrettyCopy 是一个轻量的浏览器扩展，用来把 Markdown 或普通文本转换为干净的富文本、纯文本或原始 Markdown。

点击浏览器工具栏图标即可打开独立转换面板。它不依赖 ChatGPT，也不会向网页注入按钮，因此可以处理来自 AI 对话、编辑器、邮件和其他任意来源的文本。

## 功能

- 上方输入原文本，下方实时预览转换结果。
- 支持智能格式、纯文本和 Markdown 三种模式。
- 一键复制，或使用 `Ctrl + Enter` 快速复制。
- 智能格式同时写入 HTML 富文本和纯文本，适配不同粘贴目标。
- 不申请网站访问权限，正文只在当前弹出面板中处理。

## 三种格式

| 模式 | 转换效果 | 适合粘贴到 |
| --- | --- | --- |
| 智能格式 | 保留标题、强调、列表、表格和代码块等排版 | Word、Notion、飞书、Outlook |
| 纯文本 | 清理 Markdown 标记和多余空行 | 微信、邮件、记事本 |
| Markdown | 原样保留输入源码 | Obsidian、GitHub、代码编辑器 |

## 安装

从 [Releases](../../releases/latest) 下载 `prettycopy-extension` 压缩包并解压：

1. 打开 Chrome 的 `chrome://extensions`，或 Edge 的 `edge://extensions`。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择解压后的目录。
4. 将 PrettyCopy 固定到浏览器工具栏。

## 使用

1. 点击浏览器工具栏中的 PrettyCopy 图标。
2. 在上方粘贴 Markdown 或普通文本。
3. 选择智能格式、纯文本或 Markdown。
4. 点击“复制结果”，再粘贴到目标应用。

扩展只请求以下权限：

- `clipboardWrite`：将转换结果写入剪贴板。
- `storage`：记住上次选择的转换模式。

扩展不会读取剪贴板，不申请任何网站访问权限，也不会保存或上传粘贴的正文。

## 本地开发

使用 Node.js 运行检查和回归测试：

```powershell
npm run check
```

然后在浏览器扩展管理页面中加载项目根目录即可调试。

## 项目结构

```text
popup/                  扩展转换面板
src/                    文本转换器
scripts/                检查和回归测试
manifest.json           Chrome/Edge Manifest V3 声明
desktop/                已停止维护的 Windows 历史版本
```

## Windows 桌面历史版本

仓库保留了早期 Windows 桌面版的源码，方便查阅和自行构建，但该版本已停止维护，也不会包含在后续浏览器扩展发布包中。

## 已知限制

- 复杂公式、交互图表、附件和图片目前只做文本级处理。
- 智能格式覆盖常见 Markdown 结构，不等同于完整的 CommonMark 渲染器。
- 某些只接受 RTF 的旧应用可能退回纯文本。

## 许可证

[MIT](LICENSE)
