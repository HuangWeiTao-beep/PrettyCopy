# PrettyCopy Desktop

> 此版本已停止维护，仅保留源码供参考和自行构建。当前项目只继续开发浏览器扩展。

适用于 ChatGPT Desktop 和其他 Windows 桌面应用的便携剪贴板转换工具。

当前版本使用 Windows 原生控件、系统配色和标准状态栏，可跟随系统 DPI 与高对比度设置。

## 使用方式

1. 运行压缩包中的 `PrettyCopyDesktop` 程序。
2. 在 ChatGPT Desktop 中正常按 `Ctrl+C` 复制回答。
3. 按需要转换：
   - `Ctrl+Alt+1`：智能富文本
   - `Ctrl+Alt+2`：纯文本
   - `Ctrl+Alt+3`：保留 Markdown
4. 在目标应用中按 `Ctrl+V` 粘贴。

窗口可以最小化到系统托盘。关闭窗口默认也是最小化；如需完全退出，在托盘图标菜单中选择“退出”。

## 说明

- 单文件便携程序，不需要安装。
- 不写入注册表，不设置开机启动。
- 不联网，不上传剪贴板内容。
- 只在用户点击按钮或按下快捷键时读取并改写剪贴板。
- 0.1.2 起，富文本剪贴板固定使用 UTF-8，避免中文在部分应用中变成乱码。

## 重新编译

右键 `build.ps1` 并使用 PowerShell 运行。构建结果位于 `desktop/dist/PrettyCopyDesktop.exe`。
