# PrettyCopy

PrettyCopy 将剪贴板中的 Markdown 或普通文本整理为富文本、纯文本或原始 Markdown，适用于 AI 对话、编辑器、网页和其他文字来源。

项目包含两个版本：

- 浏览器扩展：为 ChatGPT 网页版增加复制按钮。
- Windows 桌面版：处理从任意 Windows 应用复制的 Markdown 或普通文本，通过快捷键转换剪贴板格式。

转换完全在本机完成，不上传剪贴板或对话内容。

![PrettyCopy Desktop](docs/images/prettycopy-desktop.png)

## 三种格式

| 模式 | 浏览器扩展 | Windows 桌面版 | 适合粘贴到 |
| --- | --- | --- | --- |
| 智能富文本 | 从 ChatGPT 页面生成富文本 | 将 Markdown 或普通文本写为 HTML 富文本 | Word、Notion、飞书、Outlook |
| 纯文本 | 提取回答中的可见文字 | 清理 Markdown 标记和多余空行 | 微信、邮件、记事本 |
| Markdown | 从已渲染的回答还原 Markdown | 原样保留剪贴板文本，不从 HTML/RTF 重建 | Obsidian、GitHub、编辑器 |

## Windows 桌面版

桌面版是通用的 Windows 剪贴板工具，不依赖 ChatGPT。它可以处理 ChatGPT Desktop、Claude、浏览器、编辑器或其他应用复制出的 Markdown 和普通文本。

从 [Releases](../../releases/latest) 下载 `PrettyCopyDesktop` 压缩包，解压后直接运行。程序常驻系统托盘，不需要管理员权限，也不会设置开机启动。

1. 在任意应用中按 `Ctrl+C`，复制 Markdown 或普通文本。
2. 按 `Ctrl+Alt+1`、`Ctrl+Alt+2` 或 `Ctrl+Alt+3` 转换格式。
3. 在目标应用中按 `Ctrl+V`。

窗口关闭后会缩到托盘。需要完全退出时，右键托盘图标并选择“退出”。

桌面版不会注入或修改任何应用，只在点击按钮或按下快捷键时读取并改写 Windows 剪贴板。

## 浏览器扩展

从 [Releases](../../releases/latest) 下载 `prettycopy` 扩展包并解压：

1. 打开 Chrome 的 `chrome://extensions`，或 Edge 的 `edge://extensions`。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择解压后的目录。
4. 刷新 ChatGPT 页面。

扩展只请求 `clipboardWrite` 和 `storage` 权限，页面访问范围限于 `chatgpt.com` 和旧版 `chat.openai.com`。

## 本地构建

浏览器扩展的检查需要 Node.js：

```powershell
npm run check
```

Windows 桌面版使用系统自带的 .NET Framework C# 编译器：

```powershell
.\desktop\build.ps1
.\desktop\dist\PrettyCopyDesktop.exe --self-test
```

## 项目结构

```text
src/                    浏览器扩展的转换与页面适配
popup/                  扩展设置界面
scripts/                检查和回归测试
desktop/                Windows 桌面版源码与构建脚本
manifest.json           Chrome/Edge Manifest V3 声明
```

## 已知限制

- ChatGPT 调整网页结构后，浏览器扩展的页面适配可能需要更新。
- 复杂公式、交互图表、附件和图片目前只做文本级处理。
- Windows 桌面版将输入视为 Markdown 或普通文本，不会保留从 Word 等应用复制出的原有富文本样式，也不会把任意 HTML 或 RTF 反向转换成 Markdown。
- 部分只接受 RTF、不接受 HTML 剪贴板格式的旧应用，可能退回纯文本。

## 许可证

[MIT](LICENSE)
