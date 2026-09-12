(function attachPrettyCopyFormatter(globalObject) {
  "use strict";

  const BLOCK_TAGS = new Set([
    "ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "DIV", "DL", "FIELDSET",
    "FIGCAPTION", "FIGURE", "FOOTER", "FORM", "H1", "H2", "H3", "H4",
    "H5", "H6", "HEADER", "HR", "LI", "MAIN", "NAV", "OL", "P", "PRE",
    "SECTION", "TABLE", "UL"
  ]);

  const REMOVED_SELECTORS = [
    "button",
    "script",
    "style",
    "iframe",
    "object",
    "embed",
    "link",
    "meta",
    "video",
    "audio",
    "source",
    "form",
    "textarea",
    "input",
    "select",
    ".pc-copy-ui",
    "[data-pretty-copy-ui]"
  ].join(",");

  function normalizeWhitespace(text) {
    return text
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function residualBoldSegments(text) {
    const segments = [];
    const pattern = /\*\*([^*\n]+)\*\*|__([^_\n]+)__/g;
    let cursor = 0;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      if (match.index > cursor) segments.push({ text: text.slice(cursor, match.index), bold: false });
      segments.push({ text: match[1] || match[2], bold: true });
      cursor = pattern.lastIndex;
    }
    if (cursor < text.length) segments.push({ text: text.slice(cursor), bold: false });
    return segments;
  }

  function stripResidualMarkdown(text) {
    return residualBoldSegments(text).map((segment) => segment.text).join("");
  }

  function stripResidualMarkdownInNode(node, insideCode = false) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!insideCode) node.textContent = stripResidualMarkdown(node.textContent || "");
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const isCode = insideCode || node.tagName === "PRE" || node.tagName === "CODE";
    Array.from(node.childNodes).forEach((child) => stripResidualMarkdownInNode(child, isCode));
  }

  function childText(node, serializer, context) {
    return Array.from(node.childNodes)
      .map((child) => serializer(child, context))
      .join("");
  }

  function getMathSource(element) {
    const annotation = element.querySelector?.('annotation[encoding="application/x-tex"]');
    if (annotation?.textContent) {
      return annotation.textContent.trim();
    }

    const assistive = element.querySelector?.(".katex-mathml math, math");
    const alt = assistive?.getAttribute?.("alttext");
    return alt?.trim() || "";
  }

  function elementText(element) {
    return normalizeWhitespace(element.textContent || "");
  }

  function serializePlainNode(node, context = {}) {
    if (node.nodeType === Node.TEXT_NODE) {
      return context.preserveWhitespace
        ? node.textContent || ""
        : (node.textContent || "").replace(/\s+/g, " ");
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const element = node;
    const tag = element.tagName;

    if (element.matches(REMOVED_SELECTORS)) return "";
    if (element.classList.contains("katex")) {
      return getMathSource(element) || elementText(element);
    }
    if (tag === "BR") return "\n";
    if (tag === "HR") return "\n────────\n";
    if (tag === "PRE") return `\n${element.textContent || ""}\n`;
    if (tag === "TABLE") return serializePlainTable(element);
    if (tag === "UL" || tag === "OL") return serializePlainList(element, 0);
    if (tag === "LI") return childText(element, serializePlainNode, context);

    const content = childText(element, serializePlainNode, context);
    if (/^H[1-6]$/.test(tag)) return `\n${content}\n`;
    if (tag === "BLOCKQUOTE") return `\n${content}\n`;
    return BLOCK_TAGS.has(tag) ? `${content}\n` : content;
  }

  function serializePlainList(list, depth) {
    const ordered = list.tagName === "OL";
    let index = Number.parseInt(list.getAttribute("start") || "1", 10);

    return Array.from(list.children)
      .filter((child) => child.tagName === "LI")
      .map((item) => {
        const nestedLists = Array.from(item.children).filter((child) =>
          child.tagName === "UL" || child.tagName === "OL"
        );
        const clone = item.cloneNode(true);
        clone.querySelectorAll(":scope > ul, :scope > ol").forEach((nested) => nested.remove());
        const marker = ordered ? `${index++}. ` : "• ";
        const line = `${"  ".repeat(depth)}${marker}${normalizeWhitespace(serializePlainNode(clone))}`;
        const nested = nestedLists.map((child) => serializePlainList(child, depth + 1)).join("");
        return `${line}\n${nested}`;
      })
      .join("");
  }

  function serializePlainTable(table) {
    const rows = Array.from(table.querySelectorAll("tr"));
    return `\n${rows.map((row) =>
      Array.from(row.querySelectorAll(":scope > th, :scope > td"))
        .map((cell) => normalizeWhitespace(serializePlainNode(cell)))
        .join("\t")
    ).join("\n")}\n`;
  }

  function escapeMarkdown(text) {
    return text.replace(/([\\`*_[\]<>])/g, "\\$1");
  }

  function serializeMarkdownNode(node, context = {}) {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.textContent || "";
      return context.preserveWhitespace ? value : value.replace(/\s+/g, " ");
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const element = node;
    const tag = element.tagName;

    if (element.matches(REMOVED_SELECTORS)) return "";

    if (element.classList.contains("katex")) {
      const source = getMathSource(element) || elementText(element);
      const display = element.closest(".katex-display") || element.parentElement?.classList.contains("katex-display");
      return display ? `\n\n$$\n${source}\n$$\n\n` : `$${source}$`;
    }

    if (/^H[1-6]$/.test(tag)) {
      const level = Number(tag.slice(1));
      return `\n\n${"#".repeat(level)} ${normalizeWhitespace(childText(element, serializeMarkdownNode, context))}\n\n`;
    }

    if (tag === "P") return `\n\n${childText(element, serializeMarkdownNode, context).trim()}\n\n`;
    if (tag === "BR") return "  \n";
    if (tag === "HR") return "\n\n---\n\n";
    if (tag === "STRONG" || tag === "B") return `**${childText(element, serializeMarkdownNode, context)}**`;
    if (tag === "EM" || tag === "I") return `*${childText(element, serializeMarkdownNode, context)}*`;
    if (tag === "DEL" || tag === "S") return `~~${childText(element, serializeMarkdownNode, context)}~~`;
    if (tag === "CODE" && element.parentElement?.tagName !== "PRE") {
      const code = element.textContent || "";
      const fence = code.includes("`") ? "``" : "`";
      return `${fence}${code}${fence}`;
    }
    if (tag === "PRE") return serializeMarkdownCodeBlock(element);
    if (tag === "BLOCKQUOTE") {
      const content = normalizeWhitespace(childText(element, serializeMarkdownNode, context));
      return `\n\n${content.split("\n").map((line) => `> ${line}`).join("\n")}\n\n`;
    }
    if (tag === "UL" || tag === "OL") return `\n${serializeMarkdownList(element, 0)}\n`;
    if (tag === "LI") return childText(element, serializeMarkdownNode, context);
    if (tag === "TABLE") return serializeMarkdownTable(element);
    if (tag === "A") {
      const label = normalizeWhitespace(childText(element, serializeMarkdownNode, context));
      const href = element.getAttribute("href") || "";
      return href ? `[${label || href}](${href})` : label;
    }
    if (tag === "IMG") {
      const alt = element.getAttribute("alt") || "图片";
      const src = element.getAttribute("src") || "";
      return src ? `![${escapeMarkdown(alt)}](${src})` : escapeMarkdown(alt);
    }

    const content = childText(element, serializeMarkdownNode, context);
    return BLOCK_TAGS.has(tag) && tag !== "DIV" ? `\n${content}\n` : content;
  }

  function serializeMarkdownCodeBlock(pre) {
    const codeElement = pre.querySelector("code");
    const code = (codeElement?.textContent || pre.textContent || "").replace(/\n$/, "");
    const languageClass = Array.from(codeElement?.classList || []).find((name) => name.startsWith("language-"));
    const language = languageClass ? languageClass.slice("language-".length) : "";
    const longestFence = Math.max(3, ...Array.from(code.matchAll(/`+/g), (match) => match[0].length + 1));
    const fence = "`".repeat(longestFence);
    return `\n\n${fence}${language}\n${code}\n${fence}\n\n`;
  }

  function serializeMarkdownList(list, depth) {
    const ordered = list.tagName === "OL";
    let index = Number.parseInt(list.getAttribute("start") || "1", 10);

    return Array.from(list.children)
      .filter((child) => child.tagName === "LI")
      .map((item) => {
        const nestedLists = Array.from(item.children).filter((child) =>
          child.tagName === "UL" || child.tagName === "OL"
        );
        const clone = item.cloneNode(true);
        clone.querySelectorAll(":scope > ul, :scope > ol").forEach((nested) => nested.remove());
        const marker = ordered ? `${index++}. ` : "- ";
        const content = normalizeWhitespace(childText(clone, serializeMarkdownNode, {}));
        const nested = nestedLists.map((child) => serializeMarkdownList(child, depth + 1)).join("");
        return `${"  ".repeat(depth)}${marker}${content}\n${nested}`;
      })
      .join("");
  }

  function serializeMarkdownTable(table) {
    const rows = Array.from(table.querySelectorAll("tr")).map((row) =>
      Array.from(row.querySelectorAll(":scope > th, :scope > td")).map((cell) =>
        normalizeWhitespace(serializeMarkdownNode(cell)).replace(/\|/g, "\\|").replace(/\n/g, " ")
      )
    );

    if (!rows.length) return "";
    const width = Math.max(...rows.map((row) => row.length));
    const paddedRows = rows.map((row) => [...row, ...Array(Math.max(0, width - row.length)).fill("")]);
    const separator = Array(width).fill("---");
    return `\n\n| ${paddedRows[0].join(" | ")} |\n| ${separator.join(" | ")} |\n${paddedRows
      .slice(1)
      .map((row) => `| ${row.join(" | ")} |`)
      .join("\n")}\n\n`;
  }

  function prepareClone(root) {
    const clone = cleanClone(root);
    promoteResidualMarkdown(clone);

    clone.querySelectorAll(".katex").forEach((math) => {
      const source = getMathSource(math);
      if (!source) return;
      const replacement = document.createElement("span");
      replacement.textContent = source;
      replacement.style.cssText = "font-family: Cambria Math, serif; font-style: italic;";
      math.replaceWith(replacement);
    });

    clone.querySelectorAll("*").forEach((element) => {
      const tag = element.tagName;
      const href = tag === "A" ? element.getAttribute("href") : null;
      const src = tag === "IMG" ? element.getAttribute("src") : null;
      const alt = tag === "IMG" ? element.getAttribute("alt") : null;
      const colspan = element.getAttribute("colspan");
      const rowspan = element.getAttribute("rowspan");

      Array.from(element.attributes).forEach((attribute) => element.removeAttribute(attribute.name));
      if (href && /^(https?:|mailto:)/i.test(href)) element.setAttribute("href", href);
      if (src && /^(https?:|data:image\/)/i.test(src)) element.setAttribute("src", src);
      if (alt) element.setAttribute("alt", alt);
      if (colspan) element.setAttribute("colspan", colspan);
      if (rowspan) element.setAttribute("rowspan", rowspan);

      applyInlineStyle(element);
    });

    return clone;
  }

  function promoteResidualMarkdown(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const candidates = [];
    let node;

    while ((node = walker.nextNode())) {
      if (!node.textContent?.includes("**") && !node.textContent?.includes("__")) continue;
      if (node.parentElement?.closest("pre, code")) continue;
      candidates.push(node);
    }

    candidates.forEach((textNode) => {
      const segments = residualBoldSegments(textNode.textContent || "");
      if (!segments.some((segment) => segment.bold)) return;

      const fragment = document.createDocumentFragment();
      segments.forEach((segment) => {
        if (!segment.text) return;
        if (segment.bold) {
          const strong = document.createElement("strong");
          strong.textContent = segment.text;
          fragment.append(strong);
        } else {
          fragment.append(document.createTextNode(segment.text));
        }
      });
      textNode.replaceWith(fragment);
    });
  }

  function cleanClone(root) {
    const clone = root.cloneNode(true);
    clone.querySelectorAll(REMOVED_SELECTORS).forEach((node) => node.remove());
    return clone;
  }

  function applyInlineStyle(element) {
    const styles = {
      H1: "font-size: 24px; line-height: 1.3; margin: 24px 0 12px; font-weight: 700;",
      H2: "font-size: 20px; line-height: 1.35; margin: 22px 0 10px; font-weight: 700;",
      H3: "font-size: 17px; line-height: 1.4; margin: 18px 0 8px; font-weight: 700;",
      H4: "font-size: 16px; line-height: 1.4; margin: 16px 0 8px; font-weight: 700;",
      P: "margin: 0 0 12px;",
      UL: "margin: 0 0 12px; padding-left: 24px;",
      OL: "margin: 0 0 12px; padding-left: 24px;",
      LI: "margin: 4px 0;",
      BLOCKQUOTE: "margin: 12px 0; padding: 8px 14px; border-left: 3px solid #8b5cf6; color: #4b5563; background: #f7f5ff;",
      PRE: "margin: 12px 0; padding: 14px 16px; overflow: auto; border-radius: 8px; background: #171923; color: #f7fafc; font-family: Consolas, Menlo, monospace; font-size: 13px; line-height: 1.55; white-space: pre-wrap;",
      CODE: "padding: 2px 5px; border-radius: 4px; background: #f1f3f5; color: #9c2f5f; font-family: Consolas, Menlo, monospace; font-size: 0.92em;",
      TABLE: "width: 100%; margin: 12px 0; border-collapse: collapse; font-size: 14px;",
      TH: "padding: 8px 10px; border: 1px solid #d7dce2; background: #f4f5f7; text-align: left; font-weight: 700;",
      TD: "padding: 8px 10px; border: 1px solid #d7dce2; vertical-align: top;",
      A: "color: #5b43d6; text-decoration: underline;",
      HR: "margin: 20px 0; border: 0; border-top: 1px solid #d7dce2;",
      IMG: "max-width: 100%; height: auto;"
    };

    if (styles[element.tagName]) element.setAttribute("style", styles[element.tagName]);
    if (element.tagName === "CODE" && element.parentElement?.tagName === "PRE") {
      element.removeAttribute("style");
    }
  }

  function toPlainText(root) {
    const clone = cleanClone(root);
    stripResidualMarkdownInNode(clone);
    return normalizeWhitespace(serializePlainNode(clone));
  }

  function toMarkdown(root) {
    return normalizeWhitespace(serializeMarkdownNode(cleanClone(root)));
  }

  function toRichHtml(root) {
    const clone = prepareClone(root);
    return `<div style="font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 15px; line-height: 1.65; color: #1f2937;">${clone.innerHTML}</div>`;
  }

  globalObject.PrettyCopyFormatter = {
    toPlainText,
    toMarkdown,
    toRichHtml,
    __test: {
      residualBoldSegments,
      stripResidualMarkdown,
      stripResidualMarkdownInNode
    }
  };
})(globalThis);
