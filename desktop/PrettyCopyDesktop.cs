using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

[assembly: System.Reflection.AssemblyTitle("PrettyCopy Desktop")]
[assembly: System.Reflection.AssemblyDescription("Windows clipboard formatting companion for AI text")]
[assembly: System.Reflection.AssemblyProduct("PrettyCopy Desktop")]
[assembly: System.Reflection.AssemblyVersion("0.1.2.0")]
[assembly: System.Reflection.AssemblyFileVersion("0.1.2.0")]

namespace PrettyCopyDesktop
{
    internal enum CopyMode
    {
        Smart,
        Plain,
        Markdown
    }

    internal static class Program
    {
        private const string MutexName = "Local\\PrettyCopyDesktop-5A14B8C1-8E76-4F95-9E96-E597780AFC65";

        [DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();

        [STAThread]
        private static void Main(string[] args)
        {
            if (args.Any(delegate(string arg) { return string.Equals(arg, "--self-test", StringComparison.OrdinalIgnoreCase); }))
            {
                Environment.ExitCode = SelfTests.Run();
                return;
            }

            int previewIndex = Array.FindIndex(args, delegate(string arg)
            {
                return string.Equals(arg, "--render-preview", StringComparison.OrdinalIgnoreCase);
            });
            if (previewIndex >= 0 && previewIndex + 1 < args.Length)
            {
                RenderPreview(args[previewIndex + 1]);
                return;
            }

            bool ownsMutex;
            using (Mutex mutex = new Mutex(true, MutexName, out ownsMutex))
            {
                if (!ownsMutex)
                {
                    MessageBox.Show("PrettyCopy Desktop 已经在运行，请查看系统托盘。", "PrettyCopy Desktop",
                        MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                SetProcessDPIAware();
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new MainForm());
            }
        }

        private static void RenderPreview(string outputPath)
        {
            SetProcessDPIAware();
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            string directory = Path.GetDirectoryName(Path.GetFullPath(outputPath));
            if (!Directory.Exists(directory)) Directory.CreateDirectory(directory);

            using (MainForm form = new MainForm(false))
            {
                // WinForms does not create/layout child handles reliably until the
                // form is shown. Keep the QA render off-screen so DrawToBitmap sees
                // the same fully laid-out control tree as the real application.
                form.StartPosition = FormStartPosition.Manual;
                form.Location = new Point(-32000, -32000);
                form.ShowInTaskbar = false;
                form.Show();
                Application.DoEvents();
                form.PerformLayout();
                form.Refresh();
                using (Bitmap bitmap = new Bitmap(form.Width, form.Height))
                {
                    form.DrawToBitmap(bitmap, new Rectangle(Point.Empty, form.Size));
                    bitmap.Save(outputPath, ImageFormat.Png);
                }
                form.Close();
            }
        }
    }

    internal sealed class MainForm : Form
    {
        private const int HotkeySmart = 101;
        private const int HotkeyPlain = 102;
        private const int HotkeyMarkdown = 103;
        private const int WmHotkey = 0x0312;
        private const uint ModAlt = 0x0001;
        private const uint ModControl = 0x0002;
        private const uint ModNoRepeat = 0x4000;

        [DllImport("user32.dll")]
        private static extern bool RegisterHotKey(IntPtr windowHandle, int id, uint modifiers, uint virtualKey);

        [DllImport("user32.dll")]
        private static extern bool UnregisterHotKey(IntPtr windowHandle, int id);

        private readonly NotifyIcon trayIcon;
        private readonly ToolStripStatusLabel statusLabel;
        private readonly ToolStripStatusLabel statusDetail;
        private readonly bool enableTray;
        private bool allowExit;

        public MainForm() : this(true)
        {
        }

        internal MainForm(bool enableTray)
        {
            this.enableTray = enableTray;
            Text = "PrettyCopy Desktop";
            AutoScaleDimensions = new SizeF(96F, 96F);
            AutoScaleMode = AutoScaleMode.Dpi;
            ClientSize = new Size(640, 390);
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = true;
            Icon = SystemIcons.Application;
            BackColor = SystemColors.Control;
            ForeColor = SystemColors.ControlText;
            // Use pixel-sized Segoe UI fonts because this portable .NET Framework
            // build opts into system DPI awareness without an app manifest.
            // This keeps programmatic layouts aligned with native control bounds.
            Font = new Font("Segoe UI", 16F, FontStyle.Regular, GraphicsUnit.Pixel);
            AccessibleName = "PrettyCopy Desktop 主窗口";

            TableLayoutPanel root = new TableLayoutPanel();
            root.Dock = DockStyle.Fill;
            root.Padding = new Padding(16, 14, 16, 12);
            root.ColumnCount = 1;
            root.RowCount = 4;
            root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
            root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            root.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
            root.RowStyles.Add(new RowStyle(SizeType.Absolute, 44F));

            Label title = new Label();
            title.Text = "PrettyCopy Desktop";
            title.AutoSize = true;
            title.Font = new Font("Segoe UI", 28F, FontStyle.Bold, GraphicsUnit.Pixel);
            title.Margin = new Padding(0, 0, 0, 4);
            title.AccessibleName = title.Text;
            root.Controls.Add(title, 0, 0);

            Label instruction = new Label();
            instruction.Text = "在 ChatGPT Desktop 中复制文字，然后选择需要的粘贴格式。";
            instruction.AutoSize = true;
            instruction.Margin = new Padding(0, 0, 0, 10);
            instruction.AccessibleName = instruction.Text;
            root.Controls.Add(instruction, 0, 1);

            GroupBox formatGroup = new GroupBox();
            formatGroup.Text = "选择复制格式";
            formatGroup.Dock = DockStyle.Fill;
            formatGroup.Padding = new Padding(10, 12, 10, 10);
            formatGroup.AccessibleName = formatGroup.Text;

            TableLayoutPanel formats = new TableLayoutPanel();
            formats.Dock = DockStyle.Fill;
            formats.ColumnCount = 3;
            formats.RowCount = 3;
            formats.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 28F));
            formats.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 17F));
            formats.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 55F));
            formats.RowStyles.Add(new RowStyle(SizeType.Percent, 33.33F));
            formats.RowStyles.Add(new RowStyle(SizeType.Percent, 33.33F));
            formats.RowStyles.Add(new RowStyle(SizeType.Percent, 33.34F));
            AddNativeFormatRow(formats, 0, "智能富文本", "Ctrl+Alt+1", "Word、Notion、飞书；保留排版", CopyMode.Smart);
            AddNativeFormatRow(formats, 1, "纯文本", "Ctrl+Alt+2", "微信、邮件、记事本；移除标记", CopyMode.Plain);
            AddNativeFormatRow(formats, 2, "Markdown", "Ctrl+Alt+3", "Obsidian、GitHub、编辑器；保留源码", CopyMode.Markdown);
            formatGroup.Controls.Add(formats);
            root.Controls.Add(formatGroup, 0, 2);

            FlowLayoutPanel actions = new FlowLayoutPanel();
            actions.Dock = DockStyle.Fill;
            actions.FlowDirection = FlowDirection.RightToLeft;
            actions.WrapContents = false;
            actions.Padding = new Padding(0, 8, 0, 0);

            Button exitButton = new Button();
            exitButton.Text = "退出程序";
            exitButton.AutoSize = true;
            exitButton.MinimumSize = new Size(96, 30);
            exitButton.UseVisualStyleBackColor = true;
            exitButton.TabIndex = 1;
            exitButton.AccessibleName = "退出 PrettyCopy Desktop";
            exitButton.Click += delegate { allowExit = true; Close(); };

            Button minimizeButton = new Button();
            minimizeButton.Text = "最小化到托盘";
            minimizeButton.AutoSize = true;
            minimizeButton.MinimumSize = new Size(112, 30);
            minimizeButton.UseVisualStyleBackColor = true;
            minimizeButton.TabIndex = 0;
            minimizeButton.AccessibleName = "最小化 PrettyCopy Desktop 到系统托盘";
            minimizeButton.Click += delegate { HideToTray(); };
            actions.Controls.Add(exitButton);
            actions.Controls.Add(minimizeButton);
            root.Controls.Add(actions, 0, 3);

            StatusStrip statusStrip = new StatusStrip();
            statusStrip.SizingGrip = false;
            statusStrip.ShowItemToolTips = true;
            statusLabel = new ToolStripStatusLabel("就绪");
            statusLabel.Font = new Font(Font, FontStyle.Bold);
            statusLabel.BorderSides = ToolStripStatusLabelBorderSides.Right;
            statusLabel.BorderStyle = Border3DStyle.Etched;
            statusLabel.Margin = new Padding(0, 2, 6, 2);
            statusLabel.AccessibleName = "当前状态";
            statusDetail = new ToolStripStatusLabel("内容只在本机剪贴板中处理");
            statusDetail.Spring = true;
            statusDetail.TextAlign = ContentAlignment.MiddleLeft;
            statusDetail.AccessibleName = "状态详情";
            statusStrip.Items.Add(statusLabel);
            statusStrip.Items.Add(statusDetail);

            Controls.Add(root);
            Controls.Add(statusStrip);

            trayIcon = new NotifyIcon();
            trayIcon.Text = "PrettyCopy Desktop";
            trayIcon.Icon = SystemIcons.Application;
            trayIcon.Visible = enableTray;
            trayIcon.ContextMenuStrip = BuildTrayMenu();
            trayIcon.DoubleClick += delegate { ShowWindow(); };

            FormClosing += OnFormClosing;
            Resize += delegate
            {
                if (WindowState == FormWindowState.Minimized) HideToTray();
            };

        }

        protected override void OnShown(EventArgs eventArgs)
        {
            base.OnShown(eventArgs);
            if (!enableTray) return;
            List<string> failures = new List<string>();
            if (!RegisterHotKey(Handle, HotkeySmart, ModControl | ModAlt | ModNoRepeat, (uint)Keys.D1)) failures.Add("Ctrl+Alt+1");
            if (!RegisterHotKey(Handle, HotkeyPlain, ModControl | ModAlt | ModNoRepeat, (uint)Keys.D2)) failures.Add("Ctrl+Alt+2");
            if (!RegisterHotKey(Handle, HotkeyMarkdown, ModControl | ModAlt | ModNoRepeat, (uint)Keys.D3)) failures.Add("Ctrl+Alt+3");

            if (failures.Count > 0)
            {
                SetStatus(false, "部分快捷键不可用", "被其他程序占用：" + string.Join("、", failures.ToArray()));
            }
        }

        protected override void WndProc(ref Message message)
        {
            if (message.Msg == WmHotkey)
            {
                int id = message.WParam.ToInt32();
                if (id == HotkeySmart) ConvertClipboard(CopyMode.Smart);
                if (id == HotkeyPlain) ConvertClipboard(CopyMode.Plain);
                if (id == HotkeyMarkdown) ConvertClipboard(CopyMode.Markdown);
            }
            base.WndProc(ref message);
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                UnregisterHotKey(Handle, HotkeySmart);
                UnregisterHotKey(Handle, HotkeyPlain);
                UnregisterHotKey(Handle, HotkeyMarkdown);
                trayIcon.Visible = false;
                trayIcon.Dispose();
            }
            base.Dispose(disposing);
        }

        private void AddNativeFormatRow(TableLayoutPanel layout, int row, string title, string shortcut,
            string description, CopyMode mode)
        {
            Button button = new Button();
            button.Text = title;
            button.Dock = DockStyle.Fill;
            button.Margin = new Padding(4, 3, 8, 3);
            button.UseVisualStyleBackColor = true;
            button.AccessibleName = title;
            button.AccessibleDescription = description + "。快捷键 " + shortcut;
            button.Click += delegate { ConvertClipboard(mode); };

            Label shortcutLabel = new Label();
            shortcutLabel.Text = shortcut;
            shortcutLabel.Dock = DockStyle.Fill;
            shortcutLabel.TextAlign = ContentAlignment.MiddleLeft;
            shortcutLabel.Margin = new Padding(4, 0, 4, 0);

            Label descriptionLabel = new Label();
            descriptionLabel.Text = description;
            descriptionLabel.Dock = DockStyle.Fill;
            descriptionLabel.TextAlign = ContentAlignment.MiddleLeft;
            descriptionLabel.AutoEllipsis = true;
            descriptionLabel.Margin = new Padding(4, 0, 4, 0);

            layout.Controls.Add(button, 0, row);
            layout.Controls.Add(shortcutLabel, 1, row);
            layout.Controls.Add(descriptionLabel, 2, row);
        }

        private ContextMenuStrip BuildTrayMenu()
        {
            ContextMenuStrip menu = new ContextMenuStrip();
            menu.Items.Add("智能富文本   Ctrl+Alt+1", null, delegate { ConvertClipboard(CopyMode.Smart); });
            menu.Items.Add("纯文本       Ctrl+Alt+2", null, delegate { ConvertClipboard(CopyMode.Plain); });
            menu.Items.Add("Markdown     Ctrl+Alt+3", null, delegate { ConvertClipboard(CopyMode.Markdown); });
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("打开窗口", null, delegate { ShowWindow(); });
            menu.Items.Add("退出", null, delegate
            {
                allowExit = true;
                Close();
            });
            return menu;
        }

        private void ConvertClipboard(CopyMode mode)
        {
            try
            {
                string source = ClipboardService.ReadText();
                if (string.IsNullOrWhiteSpace(source))
                {
                    SetStatus(false, "没有可转换的文字", "先按 Ctrl+C 复制一段 AI 回答");
                    ShowTrayMessage("没有可转换的文字", "请先复制一段文本。", ToolTipIcon.Warning);
                    return;
                }

                if (mode == CopyMode.Smart)
                {
                    string plain = MarkdownConverter.ToPlainText(source);
                    string fragment = MarkdownConverter.ToHtml(source);
                    ClipboardService.WriteRichText(fragment, plain);
                    Success("已转换为智能富文本", "粘贴到 Word、Notion 或飞书即可");
                }
                else if (mode == CopyMode.Plain)
                {
                    ClipboardService.WriteText(MarkdownConverter.ToPlainText(source));
                    Success("已转换为纯文本", "Markdown 标记已清理");
                }
                else
                {
                    ClipboardService.WriteText(source);
                    Success("已保留 Markdown", "可粘贴到 Obsidian、GitHub 或编辑器");
                }
            }
            catch (Exception exception)
            {
                SetStatus(false, "转换失败", FriendlyError(exception));
                ShowTrayMessage("转换失败", FriendlyError(exception), ToolTipIcon.Error);
            }
        }

        private void Success(string title, string detail)
        {
            SetStatus(true, title, detail + " · " + DateTime.Now.ToString("HH:mm:ss"));
            ShowTrayMessage(title, detail, ToolTipIcon.Info);
        }

        private void SetStatus(bool success, string title, string detail)
        {
            statusLabel.Text = title;
            statusDetail.Text = detail;
            statusLabel.ForeColor = SystemColors.ControlText;
            statusLabel.AccessibleName = title + "。" + detail;
        }

        private void ShowTrayMessage(string title, string message, ToolTipIcon icon)
        {
            trayIcon.BalloonTipTitle = title;
            trayIcon.BalloonTipText = message;
            trayIcon.BalloonTipIcon = icon;
            trayIcon.ShowBalloonTip(1600);
        }

        private static string FriendlyError(Exception exception)
        {
            if (exception is ExternalException)
            {
                return "剪贴板正被其他程序占用，请再试一次";
            }
            return exception.Message;
        }

        private void HideToTray()
        {
            Hide();
            ShowInTaskbar = false;
            WindowState = FormWindowState.Normal;
            ShowTrayMessage("PrettyCopy 在后台运行", "复制后可直接使用 Ctrl+Alt+1、2、3。", ToolTipIcon.Info);
        }

        private void ShowWindow()
        {
            ShowInTaskbar = true;
            Show();
            WindowState = FormWindowState.Normal;
            Activate();
        }

        private void OnFormClosing(object sender, FormClosingEventArgs eventArgs)
        {
            if (!allowExit && eventArgs.CloseReason == CloseReason.UserClosing)
            {
                eventArgs.Cancel = true;
                HideToTray();
            }
        }

    }

    internal static class ClipboardService
    {
        public static string ReadText()
        {
            return Retry(delegate { return Clipboard.GetText(TextDataFormat.UnicodeText); });
        }

        public static void WriteText(string text)
        {
            Retry(delegate
            {
                Clipboard.SetText(text, TextDataFormat.UnicodeText);
                return true;
            });
        }

        public static void WriteRichText(string htmlFragment, string plainText)
        {
            Retry(delegate
            {
                DataObject data = CreateRichDataObject(htmlFragment, plainText);
                Clipboard.SetDataObject(data, true, 5, 80);
                return true;
            });
        }

        internal static DataObject CreateRichDataObject(string htmlFragment, string plainText)
        {
            DataObject data = new DataObject();
            // CF_HTML is defined as UTF-8 bytes. Passing a .NET string here makes
            // WinForms encode it with the machine's ANSI code page on some systems,
            // which produces mojibake when the receiving app correctly expects UTF-8.
            data.SetData(DataFormats.Html, false, new MemoryStream(CfHtml.BuildUtf8(htmlFragment), false));
            data.SetData(DataFormats.UnicodeText, plainText);
            data.SetData(DataFormats.Text, plainText);
            return data;
        }

        private static T Retry<T>(Func<T> action)
        {
            ExternalException lastError = null;
            for (int attempt = 0; attempt < 5; attempt++)
            {
                try
                {
                    return action();
                }
                catch (ExternalException exception)
                {
                    lastError = exception;
                    Thread.Sleep(45 + attempt * 35);
                }
            }
            throw lastError ?? new ExternalException("无法访问剪贴板");
        }
    }

    internal static class CfHtml
    {
        private const string HeaderTemplate =
            "Version:0.9\r\n" +
            "StartHTML:{0:0000000000}\r\n" +
            "EndHTML:{1:0000000000}\r\n" +
            "StartFragment:{2:0000000000}\r\n" +
            "EndFragment:{3:0000000000}\r\n";

        public static string Build(string fragment)
        {
            string prefix = "<html><body><!--StartFragment-->";
            string suffix = "<!--EndFragment--></body></html>";
            string provisionalHeader = string.Format(HeaderTemplate, 0, 0, 0, 0);
            int startHtml = Encoding.UTF8.GetByteCount(provisionalHeader);
            int startFragment = startHtml + Encoding.UTF8.GetByteCount(prefix);
            int endFragment = startFragment + Encoding.UTF8.GetByteCount(fragment);
            int endHtml = endFragment + Encoding.UTF8.GetByteCount(suffix);
            string header = string.Format(HeaderTemplate, startHtml, endHtml, startFragment, endFragment);
            return header + prefix + fragment + suffix;
        }

        public static byte[] BuildUtf8(string fragment)
        {
            // Clipboard formats are conventionally NUL-terminated; offsets above
            // intentionally describe only the CF_HTML payload, not this terminator.
            return Encoding.UTF8.GetBytes(Build(fragment) + "\0");
        }
    }

    internal static class MarkdownConverter
    {
        private static readonly Regex TableSeparator = new Regex(
            @"^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$", RegexOptions.Compiled);
        private static readonly Regex OrderedList = new Regex(@"^\s*(\d+)\.\s+(.+)$", RegexOptions.Compiled);
        private static readonly Regex BulletList = new Regex(@"^\s*[-+*]\s+(.+)$", RegexOptions.Compiled);

        public static string ToPlainText(string markdown)
        {
            string[] lines = Normalize(markdown).Split('\n');
            StringBuilder output = new StringBuilder();
            bool inCode = false;
            bool previousBlank = false;

            for (int index = 0; index < lines.Length; index++)
            {
                string line = lines[index];
                if (Regex.IsMatch(line, @"^\s*```"))
                {
                    inCode = !inCode;
                    continue;
                }

                if (inCode)
                {
                    output.AppendLine(line);
                    previousBlank = false;
                    continue;
                }

                if (TableSeparator.IsMatch(line)) continue;
                if (IsTableRow(line)) line = string.Join("\t", SplitTableRow(line).ToArray());
                line = Regex.Replace(line, @"^\s*#{1,6}\s+", "");
                line = Regex.Replace(line, @"^\s*>\s?", "");
                line = Regex.Replace(line, @"^\s*[-+]\s+", "• ");
                line = Regex.Replace(line, @"^\s*\*\s+", "• ");
                if (Regex.IsMatch(line, @"^\s*([-*_])\1{2,}\s*$")) line = "";
                line = StripInline(line);

                bool blank = string.IsNullOrWhiteSpace(line);
                if (blank && previousBlank) continue;
                output.AppendLine(line.TrimEnd());
                previousBlank = blank;
            }

            return output.ToString().Trim();
        }

        public static string ToHtml(string markdown)
        {
            string[] lines = Normalize(markdown).Split('\n');
            StringBuilder body = new StringBuilder();
            List<string> paragraph = new List<string>();
            bool inCode = false;
            string codeLanguage = "";
            StringBuilder code = new StringBuilder();
            string openList = null;

            for (int index = 0; index < lines.Length; index++)
            {
                string line = lines[index];
                Match fence = Regex.Match(line, @"^\s*```\s*([\w+-]*)");
                if (fence.Success)
                {
                    if (!inCode)
                    {
                        FlushParagraph(body, paragraph);
                        CloseList(body, ref openList);
                        inCode = true;
                        codeLanguage = fence.Groups[1].Value;
                        code.Length = 0;
                    }
                    else
                    {
                        body.Append("<pre style=\"margin:12px 0;padding:14px 16px;border-radius:8px;background:#171923;color:#f7fafc;font-family:Consolas,Menlo,monospace;font-size:13px;line-height:1.55;white-space:pre-wrap;\"><code");
                        if (codeLanguage.Length > 0) body.Append(" data-language=\"").Append(WebUtility.HtmlEncode(codeLanguage)).Append("\"");
                        body.Append(">").Append(WebUtility.HtmlEncode(code.ToString().TrimEnd('\r', '\n'))).Append("</code></pre>");
                        inCode = false;
                    }
                    continue;
                }

                if (inCode)
                {
                    code.AppendLine(line);
                    continue;
                }

                if (index + 1 < lines.Length && IsTableRow(line) && TableSeparator.IsMatch(lines[index + 1]))
                {
                    FlushParagraph(body, paragraph);
                    CloseList(body, ref openList);
                    List<List<string>> rows = new List<List<string>>();
                    rows.Add(SplitTableRow(line));
                    index += 2;
                    while (index < lines.Length && IsTableRow(lines[index]))
                    {
                        rows.Add(SplitTableRow(lines[index]));
                        index++;
                    }
                    index--;
                    AppendTable(body, rows);
                    continue;
                }

                if (string.IsNullOrWhiteSpace(line))
                {
                    FlushParagraph(body, paragraph);
                    CloseList(body, ref openList);
                    continue;
                }

                Match heading = Regex.Match(line, @"^\s*(#{1,6})\s+(.+)$");
                if (heading.Success)
                {
                    FlushParagraph(body, paragraph);
                    CloseList(body, ref openList);
                    int level = heading.Groups[1].Value.Length;
                    int size = level == 1 ? 24 : level == 2 ? 20 : level == 3 ? 17 : 16;
                    body.Append("<h").Append(level).Append(" style=\"font-size:").Append(size)
                        .Append("px;line-height:1.35;margin:20px 0 9px;font-weight:700;\">")
                        .Append(InlineHtml(heading.Groups[2].Value)).Append("</h").Append(level).Append(">");
                    continue;
                }

                Match ordered = OrderedList.Match(line);
                Match bullet = BulletList.Match(line);
                if (ordered.Success || bullet.Success)
                {
                    FlushParagraph(body, paragraph);
                    string listType = ordered.Success ? "ol" : "ul";
                    if (openList != listType)
                    {
                        CloseList(body, ref openList);
                        body.Append("<").Append(listType).Append(" style=\"margin:0 0 12px;padding-left:24px;\">");
                        openList = listType;
                    }
                    string item = ordered.Success ? ordered.Groups[2].Value : bullet.Groups[1].Value;
                    body.Append("<li style=\"margin:4px 0;\">").Append(InlineHtml(item)).Append("</li>");
                    continue;
                }

                if (Regex.IsMatch(line, @"^\s*>\s?"))
                {
                    FlushParagraph(body, paragraph);
                    CloseList(body, ref openList);
                    body.Append("<blockquote style=\"margin:12px 0;padding:8px 14px;border-left:3px solid #0d9488;color:#4b5563;background:#f0fdfa;\">")
                        .Append(InlineHtml(Regex.Replace(line, @"^\s*>\s?", ""))).Append("</blockquote>");
                    continue;
                }

                if (Regex.IsMatch(line, @"^\s*([-*_])\1{2,}\s*$"))
                {
                    FlushParagraph(body, paragraph);
                    CloseList(body, ref openList);
                    body.Append("<hr style=\"margin:20px 0;border:0;border-top:1px solid #d7dce2;\">");
                    continue;
                }

                CloseList(body, ref openList);
                paragraph.Add(line.Trim());
            }

            if (inCode)
            {
                body.Append("<pre style=\"margin:12px 0;padding:14px 16px;border-radius:8px;background:#171923;color:#f7fafc;font-family:Consolas,Menlo,monospace;font-size:13px;line-height:1.55;white-space:pre-wrap;\"><code>")
                    .Append(WebUtility.HtmlEncode(code.ToString().TrimEnd('\r', '\n'))).Append("</code></pre>");
            }
            FlushParagraph(body, paragraph);
            CloseList(body, ref openList);

            return "<div style=\"font-family:Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.65;color:#1f2937;\">" + body + "</div>";
        }

        private static void FlushParagraph(StringBuilder body, List<string> paragraph)
        {
            if (paragraph.Count == 0) return;
            body.Append("<p style=\"margin:0 0 12px;\">").Append(InlineHtml(string.Join(" ", paragraph.ToArray()))).Append("</p>");
            paragraph.Clear();
        }

        private static void CloseList(StringBuilder body, ref string openList)
        {
            if (openList == null) return;
            body.Append("</").Append(openList).Append(">");
            openList = null;
        }

        private static void AppendTable(StringBuilder body, List<List<string>> rows)
        {
            body.Append("<table style=\"width:100%;margin:12px 0;border-collapse:collapse;font-size:14px;\">");
            for (int rowIndex = 0; rowIndex < rows.Count; rowIndex++)
            {
                body.Append("<tr>");
                string tag = rowIndex == 0 ? "th" : "td";
                string style = rowIndex == 0
                    ? "padding:8px 10px;border:1px solid #d7dce2;background:#f0fdfa;text-align:left;font-weight:700;"
                    : "padding:8px 10px;border:1px solid #d7dce2;vertical-align:top;";
                foreach (string cell in rows[rowIndex])
                {
                    body.Append("<").Append(tag).Append(" style=\"").Append(style).Append("\">")
                        .Append(InlineHtml(cell.Trim())).Append("</").Append(tag).Append(">");
                }
                body.Append("</tr>");
            }
            body.Append("</table>");
        }

        private static bool IsTableRow(string line)
        {
            string trimmed = line.Trim();
            return trimmed.Contains("|") && (trimmed.StartsWith("|") || trimmed.EndsWith("|"));
        }

        private static List<string> SplitTableRow(string line)
        {
            string trimmed = line.Trim().Trim('|');
            return trimmed.Split('|').Select(delegate(string cell) { return cell.Trim(); }).ToList();
        }

        private static string StripInline(string text)
        {
            string value = UnescapeMarkdown(text);
            value = Regex.Replace(value, @"!\[([^\]]*)\]\([^)]+\)", "$1");
            value = Regex.Replace(value, @"\[([^\]]+)\]\([^)]+\)", "$1");
            value = Regex.Replace(value, @"\*\*([^*\n]+)\*\*", "$1");
            value = Regex.Replace(value, @"__([^_\n]+)__", "$1");
            value = Regex.Replace(value, @"~~([^~\n]+)~~", "$1");
            value = Regex.Replace(value, @"`([^`\n]+)`", "$1");
            value = Regex.Replace(value, @"(?<!\*)\*([^*\n]+)\*(?!\*)", "$1");
            value = Regex.Replace(value, @"<[^>]+>", "");
            return value;
        }

        private static string InlineHtml(string text)
        {
            string value = WebUtility.HtmlEncode(UnescapeMarkdown(text));
            value = Regex.Replace(value, @"!\[([^\]]*)\]\((?:&lt;)?[^)]+?(?:&gt;)?\)",
                "<span>$1</span>", RegexOptions.IgnoreCase);
            value = Regex.Replace(value,
                @"\[([^\]]+)\]\((?:&lt;)?((?:(?:https?|mailto):|/|[A-Za-z]:)[^)]+?)(?:&gt;)?\)",
                "<a href=\"$2\" style=\"color:#0563c1;text-decoration:underline;\">$1</a>", RegexOptions.IgnoreCase);
            value = Regex.Replace(value, @"`([^`\n]+)`",
                "<code style=\"padding:2px 5px;border-radius:4px;background:#f1f3f5;color:#9c2f5f;font-family:Consolas,Menlo,monospace;font-size:0.92em;\">$1</code>");
            value = Regex.Replace(value, @"\*\*([^*\n]+)\*\*", "<strong>$1</strong>");
            value = Regex.Replace(value, @"__([^_\n]+)__", "<strong>$1</strong>");
            value = Regex.Replace(value, @"~~([^~\n]+)~~", "<del>$1</del>");
            value = Regex.Replace(value, @"(?<!\*)\*([^*\n]+)\*(?!\*)", "<em>$1</em>");
            return value;
        }

        private static string UnescapeMarkdown(string text)
        {
            return Regex.Replace(text ?? string.Empty, @"\\([\\`*_{}\[\]()#+\-.!<>])", "$1");
        }

        private static string Normalize(string text)
        {
            return (text ?? string.Empty).Replace("\r\n", "\n").Replace("\r", "\n");
        }
    }

    internal static class SelfTests
    {
        public static int Run()
        {
            try
            {
                string sample = "# 标题\n\n这是 **重点**。\n\n- 第一项\n- 第二项\n\n| 名称 | 值 |\n| --- | --- |\n| A | 1 |\n\n```python\nresult = 2 ** 3\n```";
                string plain = MarkdownConverter.ToPlainText(sample);
                string html = MarkdownConverter.ToHtml(sample);
                string cfHtml = CfHtml.Build(html);
                byte[] cfHtmlBytes = CfHtml.BuildUtf8(html);

                Assert(plain.Contains("标题"), "纯文本缺少标题");
                Assert(!plain.Contains("**重点**"), "纯文本未清理粗体标记");
                Assert(plain.Contains("result = 2 ** 3"), "代码运算符被错误清理");
                Assert(html.Contains("<strong>重点</strong>"), "富文本未生成粗体");
                Assert(html.Contains("<table"), "富文本未生成表格");
                Assert(html.Contains("<pre"), "富文本未生成代码块");
                string localLink = MarkdownConverter.ToHtml("[下载]\\(\\</E:/测试.zip>\\)");
                Assert(localLink.Contains("href=\"/E:/测试.zip\""), "富文本未识别转义的本地链接");
                Assert(cfHtml.Contains("StartFragment:"), "CF_HTML 缺少片段偏移");
                Assert(cfHtmlBytes[cfHtmlBytes.Length - 1] == 0, "CF_HTML 缺少 NUL 终止符");
                int startFragment = ReadOffset(cfHtml, "StartFragment");
                int endFragment = ReadOffset(cfHtml, "EndFragment");
                Assert(Encoding.UTF8.GetString(cfHtmlBytes, startFragment, endFragment - startFragment) == html,
                    "CF_HTML UTF-8 片段偏移不正确");
                DataObject richData = ClipboardService.CreateRichDataObject(html, plain);
                Assert(richData.GetData(DataFormats.Html, false) is MemoryStream,
                    "富文本剪贴板格式不是 UTF-8 字节流");
                return 0;
            }
            catch
            {
                return 1;
            }
        }

        private static void Assert(bool condition, string message)
        {
            if (!condition) throw new InvalidOperationException(message);
        }

        private static int ReadOffset(string cfHtml, string name)
        {
            Match match = Regex.Match(cfHtml, "^" + name + @":(\d{10})\r?$", RegexOptions.Multiline);
            if (!match.Success) throw new InvalidOperationException("缺少 " + name + " 偏移");
            return int.Parse(match.Groups[1].Value);
        }
    }
}
