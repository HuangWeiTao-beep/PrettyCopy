import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
runInThisContext(await readFile(join(root, "src/source-formatter.js"), "utf8"), {
  filename: "src/source-formatter.js"
});

const formatter = globalThis.PrettyCopySourceFormatter;
const sample = [
  "# 格式测试",
  "",
  "这是 **重点**，还有 [安全链接](https://example.com)。",
  "",
  "- 第一项",
  "- [x] 已完成",
  "",
  "| 名称 | 数值 |",
  "| --- | --- |",
  "| 项目 | 2 |",
  "",
  "```js",
  "const result = 2 ** 3;",
  "```"
].join("\n");

const plain = formatter.toPlainText(sample);
assert.match(plain, /^格式测试/m, "标题标记应被清理");
assert.ok(plain.includes("这是 重点，还有 安全链接。"), "行内 Markdown 应被清理");
assert.ok(plain.includes("• 第一项"), "无序列表应转换为可读项目符号");
assert.ok(plain.includes("☑ 已完成"), "任务列表应保留完成状态");
assert.ok(plain.includes("名称\t数值\n项目\t2"), "表格应转换为制表符分隔文本");
assert.ok(plain.includes("const result = 2 ** 3;"), "代码内容不能误删运算符");

const html = formatter.toRichHtml(sample);
assert.match(html, /<h1[^>]*>格式测试<\/h1>/, "智能格式应生成标题");
assert.match(html, /<strong>重点<\/strong>/, "智能格式应生成加粗文本");
assert.match(html, /href="https:\/\/example\.com"/, "安全链接应保留");
assert.match(html, /<table/, "智能格式应生成表格");
assert.match(html, /<pre[^>]*><code data-language="js">/, "代码块语言应保留");
assert.ok(!html.includes("<script>"), "原始 HTML 必须被转义");

const hostile = formatter.toRichHtml('<img src=x onerror=alert(1)> [危险](javascript:alert(1))');
assert.ok(!hostile.includes("<img"), "不能把输入中的 HTML 当成可执行标签");
assert.ok(!hostile.includes('href="javascript:'), "不能生成不安全协议链接");

const exactMarkdown = "\n# 保留前后空白\n";
assert.equal(formatter.convert(exactMarkdown, "markdown").text, exactMarkdown, "Markdown 模式应原样保留源码");
assert.equal(formatter.convert(sample, "plain").html, "", "纯文本模式不应携带富文本");

console.log("文本转换回归检查通过：标题、行内格式、列表、任务项、表格、代码、安全转义和 Markdown 保真均正常。");
