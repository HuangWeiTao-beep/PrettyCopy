import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
runInThisContext(await readFile(join(root, "src/formatter.js"), "utf8"), {
  filename: "src/formatter.js"
});

const { residualBoldSegments, stripResidualMarkdown } = globalThis.PrettyCopyFormatter.__test;

assert.deepEqual(residualBoldSegments("前文 **重点** 后文"), [
  { text: "前文 ", bold: false },
  { text: "重点", bold: true },
  { text: " 后文", bold: false }
]);
assert.equal(stripResidualMarkdown("保留文字，去掉 **星号** 和 __下划线__。"), "保留文字，去掉 星号 和 下划线。");
assert.equal(stripResidualMarkdown("价格是 2 ** 3，未配对标记不乱改"), "价格是 2 ** 3，未配对标记不乱改");

globalThis.Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 };

function textNode(text) {
  return { nodeType: Node.TEXT_NODE, textContent: text };
}

function element(tagName, ...childNodes) {
  const node = {
    nodeType: Node.ELEMENT_NODE,
    tagName: tagName.toUpperCase(),
    childNodes,
    children: childNodes.filter((child) => child.nodeType === Node.ELEMENT_NODE),
    classList: { contains: () => false },
    matches: () => false,
    querySelector: () => null,
    querySelectorAll: () => [],
    getAttribute: () => null,
    cloneNode: () => node
  };
  Object.defineProperty(node, "textContent", {
    get: () => childNodes.map((child) => child.textContent || "").join("")
  });
  return node;
}

const twoParagraphs = element(
  "div",
  element("p", textNode("第一段")),
  element("p", textNode("第二段含 **重点**")),
  element("pre", textNode("result = 2 ** 3 ** 2"))
);
assert.equal(
  globalThis.PrettyCopyFormatter.toPlainText(twoParagraphs),
  "第一段\n第二段含 重点\n\nresult = 2 ** 3 ** 2",
  "普通段落应紧凑，代码块中的运算符必须保持原样"
);

console.log("格式清理回归检查通过：段落紧凑，残留粗体标记可清理，未配对星号保持不变。");
