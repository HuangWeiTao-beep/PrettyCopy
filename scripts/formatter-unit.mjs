import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
runInThisContext(await readFile(join(root, "src/formatter.js"), "utf8"), {
  filename: "src/formatter.js"
});

const {
  markdownCodeSpan,
  normalizeWhitespace,
  residualBoldSegments,
  stripResidualMarkdown
} = globalThis.PrettyCopyFormatter.__test;

assert.deepEqual(residualBoldSegments("前文 **重点** 后文"), [
  { text: "前文 ", bold: false },
  { text: "重点", bold: true },
  { text: " 后文", bold: false }
]);
assert.equal(stripResidualMarkdown("保留文字，去掉 **星号** 和 __下划线__。"), "保留文字，去掉 星号 和 下划线。");
assert.equal(stripResidualMarkdown("价格是 2 ** 3，未配对标记不乱改"), "价格是 2 ** 3，未配对标记不乱改");
assert.equal(markdownCodeSpan("value"), "`value`");
assert.equal(markdownCodeSpan("a``b"), "```a``b```");
assert.equal(markdownCodeSpan("`edge`"), "`` `edge` ``");
assert.equal(normalizeWhitespace("第一行  \n第二行"), "第一行  \n第二行", "Markdown 硬换行必须保留两个空格");

globalThis.Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 };

function textNode(text) {
  return {
    nodeType: Node.TEXT_NODE,
    textContent: text,
    parentElement: null,
    cloneNode() {
      return textNode(this.textContent);
    },
    remove() {
      if (!this.parentElement) return;
      const index = this.parentElement.childNodes.indexOf(this);
      if (index >= 0) this.parentElement.childNodes.splice(index, 1);
      this.parentElement = null;
    }
  };
}

function element(tagName, ...childNodes) {
  return elementWithAttributes(tagName, {}, ...childNodes);
}

function elementWithAttributes(tagName, attributes, ...childNodes) {
  const attributeMap = { ...attributes };
  const classNames = String(attributeMap.class || "").split(/\s+/).filter(Boolean);
  const node = {
    nodeType: Node.ELEMENT_NODE,
    tagName: tagName.toUpperCase(),
    childNodes,
    parentElement: null,
    checked: Object.hasOwn(attributeMap, "checked"),
    classList: {
      contains: (name) => classNames.includes(name),
      *[Symbol.iterator]() {
        yield* classNames;
      }
    },
    matches(selector) {
      return selector.split(",").some((part) => matchesSimpleSelector(this, part.trim()));
    },
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    },
    querySelectorAll(selector) {
      const parts = selector.split(",").map((part) => part.trim());
      if (parts.every((part) => part.startsWith(":scope > "))) {
        const directSelectors = parts.map((part) => part.slice(9));
        return this.children.filter((child) => directSelectors.some((part) => matchesSimpleSelector(child, part)));
      }

      const descendants = [];
      const visit = (parent) => {
        parent.children.forEach((child) => {
          descendants.push(child);
          visit(child);
        });
      };
      visit(this);
      return descendants.filter((candidate) => candidate.matches(selector));
    },
    getAttribute(name) {
      return Object.hasOwn(attributeMap, name) ? String(attributeMap[name]) : null;
    },
    hasAttribute(name) {
      return Object.hasOwn(attributeMap, name);
    },
    closest(selector) {
      let current = this;
      while (current) {
        if (current.matches(selector)) return current;
        current = current.parentElement;
      }
      return null;
    },
    cloneNode(deep = false) {
      const children = deep ? this.childNodes.map((child) => child.cloneNode(true)) : [];
      return elementWithAttributes(this.tagName, attributeMap, ...children);
    },
    remove() {
      if (!this.parentElement) return;
      const index = this.parentElement.childNodes.indexOf(this);
      if (index >= 0) this.parentElement.childNodes.splice(index, 1);
      this.parentElement = null;
    }
  };
  Object.defineProperty(node, "children", {
    get: () => node.childNodes.filter((child) => child.nodeType === Node.ELEMENT_NODE)
  });
  Object.defineProperty(node, "textContent", {
    get: () => node.childNodes.map((child) => child.textContent || "").join("")
  });
  childNodes.forEach((child) => {
    child.parentElement = node;
  });
  return node;
}

function matchesSimpleSelector(node, selector) {
  if (selector === "*") return true;
  const descendantTail = selector.split(/\s+/).at(-1);
  const classMatch = descendantTail.match(/^\.([\w-]+)$/);
  if (classMatch) return node.classList.contains(classMatch[1]);

  const attributeMatch = descendantTail.match(/^(\w+)?\[([\w-]+)(?:="([^"]*)")?\]$/);
  if (attributeMatch) {
    const [, tag, name, value] = attributeMatch;
    return (!tag || node.tagName === tag.toUpperCase()) &&
      node.hasAttribute(name) &&
      (value === undefined || node.getAttribute(name) === value);
  }
  return node.tagName === descendantTail.toUpperCase();
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

const representativeAnswer = element(
  "div",
  element("h2", textNode("格式测试")),
  element("p", textNode("第一行"), element("br"), textNode("第二行")),
  element(
    "ul",
    element("li", textNode("普通项"), element("ol", element("li", textNode("嵌套项")))),
    element("li", elementWithAttributes("input", { type: "checkbox", checked: "" }), textNode("已完成"))
  ),
  element(
    "table",
    element("tr", element("th", textNode("名称")), element("th", textNode("数值"))),
    element("tr", element("td", textNode("项目")), element("td", textNode("2")))
  ),
  element("p", textNode("边界代码："), element("code", textNode("a``b")))
);

const markdown = globalThis.PrettyCopyFormatter.toMarkdown(representativeAnswer);
assert.match(markdown, /## 格式测试/);
assert.ok(markdown.includes("第一行  \n第二行"), "段落内的硬换行必须保留");
assert.ok(markdown.includes("- 普通项\n  1. 嵌套项"), "嵌套列表必须保留层级");
assert.ok(markdown.includes("- [x] 已完成"), "任务列表必须保留勾选状态");
assert.ok(markdown.includes("| 名称 | 数值 |\n| --- | --- |\n| 项目 | 2 |"), "表格必须生成有效表头分隔行");
assert.ok(markdown.includes("```a``b```"), "行内代码围栏必须长于内容中的反引号");

console.log("格式清理回归检查通过：段落、硬换行、列表、任务项、表格和代码边界均正常。");
