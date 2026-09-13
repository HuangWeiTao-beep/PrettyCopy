(function attachPrettyCopySourceFormatter(globalObject) {
  "use strict";

  const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/;
  const ORDERED_LIST = /^\s*\d+\.\s+(.+)$/;
  const BULLET_LIST = /^\s*[-+*]\s+(.+)$/;

  function normalize(text) {
    return String(text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function unescapeMarkdown(text) {
    return String(text ?? "").replace(/\\([\\`*_{}\[\]()#+\-.!<>])/g, "$1");
  }

  function stripInline(text) {
    let value = unescapeMarkdown(text);
    value = value.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");
    value = value.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    value = value.replace(/\*\*([^*\n]+)\*\*/g, "$1");
    value = value.replace(/__([^_\n]+)__/g, "$1");
    value = value.replace(/~~([^~\n]+)~~/g, "$1");
    value = value.replace(/`([^`\n]+)`/g, "$1");
    value = value.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1");
    value = value.replace(/(?<!_)_([^_\n]+)_(?!_)/g, "$1");
    value = value.replace(/<[^>]+>/g, "");
    return value;
  }

  function isTableRow(line) {
    const trimmed = line.trim();
    return trimmed.includes("|") && (trimmed.startsWith("|") || trimmed.endsWith("|"));
  }

  function splitTableRow(line) {
    return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
  }

  function toPlainText(source) {
    const lines = normalize(source).split("\n");
    const output = [];
    let inCode = false;
    let previousBlank = false;

    lines.forEach((originalLine) => {
      let line = originalLine;
      if (/^\s*(```+|~~~+)/.test(line)) {
        inCode = !inCode;
        return;
      }

      if (!inCode) {
        if (TABLE_SEPARATOR.test(line)) return;
        if (isTableRow(line)) line = splitTableRow(line).join("\t");
        line = line.replace(/^\s*#{1,6}\s+/, "");
        line = line.replace(/^\s*>\s?/, "");
        line = line.replace(/^\s*[-+*]\s+\[x\]\s+/i, "☑ ");
        line = line.replace(/^\s*[-+*]\s+\[ \]\s+/, "☐ ");
        line = line.replace(/^\s*[-+*]\s+/, "• ");
        if (/^\s*([-*_])\1{2,}\s*$/.test(line)) line = "";
        line = stripInline(line);
      }

      const blank = !line.trim();
      if (blank && previousBlank) return;
      output.push(line.trimEnd());
      previousBlank = blank;
    });

    return output.join("\n").trim();
  }

  function safeLink(url) {
    const value = unescapeMarkdown(url).trim().replace(/^<|>$/g, "");
    return /^(https?:|mailto:|\/|[A-Za-z]:[\\/])/i.test(value) ? value : "";
  }

  function inlineHtml(text) {
    const tokens = [];
    const stash = (html) => {
      const marker = `\uE000${tokens.length}\uE001`;
      tokens.push(html);
      return marker;
    };

    let value = unescapeMarkdown(text);
    value = value.replace(/`([^`\n]+)`/g, (_match, code) => stash(
      `<code style="padding:2px 5px;border-radius:4px;background:#f1f3f5;color:#9c2f5f;font-family:Consolas,Menlo,monospace;font-size:.92em;">${escapeHtml(code)}</code>`
    ));
    value = value.replace(/!\[([^\]]*)\]\((?:<)?([^)]+?)(?:>)?\)/g, (_match, alt) => stash(`<span>${escapeHtml(alt)}</span>`));
    value = value.replace(/\[([^\]]+)\]\((?:<)?([^)]+?)(?:>)?\)/g, (_match, label, url) => {
      const href = safeLink(url);
      if (!href) return stash(escapeHtml(label));
      return stash(`<a href="${escapeHtml(href)}" style="color:#4f42c2;text-decoration:underline;">${escapeHtml(label)}</a>`);
    });

    value = escapeHtml(value);
    value = value.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    value = value.replace(/__([^_\n]+)__/g, "<strong>$1</strong>");
    value = value.replace(/~~([^~\n]+)~~/g, "<del>$1</del>");
    value = value.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>");
    value = value.replace(/(?<!_)_([^_\n]+)_(?!_)/g, "<em>$1</em>");
    value = value.replace(/\uE000(\d+)\uE001/g, (_match, index) => tokens[Number(index)] || "");
    return value;
  }

  function flushParagraph(body, paragraph) {
    if (!paragraph.length) return;
    let html = "";
    paragraph.forEach((line, index) => {
      const hardBreak = /\s{2}$/.test(line);
      html += inlineHtml(line.trim());
      if (index < paragraph.length - 1) html += hardBreak ? "<br>" : " ";
    });
    body.push(`<p style="margin:0 0 12px;">${html}</p>`);
    paragraph.length = 0;
  }

  function appendTable(body, rows) {
    const table = ['<table style="width:100%;margin:12px 0;border-collapse:collapse;font-size:14px;">'];
    rows.forEach((row, rowIndex) => {
      const tag = rowIndex === 0 ? "th" : "td";
      const style = rowIndex === 0
        ? "padding:8px 10px;border:1px solid #d7dce2;background:#f4f2ff;text-align:left;font-weight:700;"
        : "padding:8px 10px;border:1px solid #d7dce2;vertical-align:top;";
      table.push("<tr>");
      row.forEach((cell) => table.push(`<${tag} style="${style}">${inlineHtml(cell)}</${tag}>`));
      table.push("</tr>");
    });
    table.push("</table>");
    body.push(table.join(""));
  }

  function toRichHtml(source) {
    const lines = normalize(source).split("\n");
    const body = [];
    const paragraph = [];
    let openList = "";
    let inCode = false;
    let codeLanguage = "";
    let code = [];

    const closeList = () => {
      if (!openList) return;
      body.push(`</${openList}>`);
      openList = "";
    };

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const fence = line.match(/^\s*(```+|~~~+)\s*([\w+-]*)/);

      if (fence) {
        if (!inCode) {
          flushParagraph(body, paragraph);
          closeList();
          inCode = true;
          codeLanguage = fence[2] || "";
          code = [];
        } else {
          const language = codeLanguage ? ` data-language="${escapeHtml(codeLanguage)}"` : "";
          body.push(`<pre style="margin:12px 0;padding:14px 16px;overflow:auto;border-radius:8px;background:#171923;color:#f7fafc;font-family:Consolas,Menlo,monospace;font-size:13px;line-height:1.55;white-space:pre-wrap;"><code${language}>${escapeHtml(code.join("\n").replace(/\n+$/, ""))}</code></pre>`);
          inCode = false;
        }
        continue;
      }

      if (inCode) {
        code.push(line);
        continue;
      }

      if (index + 1 < lines.length && isTableRow(line) && TABLE_SEPARATOR.test(lines[index + 1])) {
        flushParagraph(body, paragraph);
        closeList();
        const rows = [splitTableRow(line)];
        index += 2;
        while (index < lines.length && isTableRow(lines[index])) {
          rows.push(splitTableRow(lines[index]));
          index += 1;
        }
        index -= 1;
        appendTable(body, rows);
        continue;
      }

      if (!line.trim()) {
        flushParagraph(body, paragraph);
        closeList();
        continue;
      }

      const heading = line.match(/^\s*(#{1,6})\s+(.+)$/);
      if (heading) {
        flushParagraph(body, paragraph);
        closeList();
        const level = heading[1].length;
        const size = level === 1 ? 24 : level === 2 ? 20 : level === 3 ? 17 : 16;
        body.push(`<h${level} style="font-size:${size}px;line-height:1.35;margin:20px 0 9px;font-weight:700;">${inlineHtml(heading[2])}</h${level}>`);
        continue;
      }

      const ordered = line.match(ORDERED_LIST);
      const bullet = line.match(BULLET_LIST);
      if (ordered || bullet) {
        flushParagraph(body, paragraph);
        const listType = ordered ? "ol" : "ul";
        if (openList !== listType) {
          closeList();
          body.push(`<${listType} style="margin:0 0 12px;padding-left:24px;">`);
          openList = listType;
        }
        let item = ordered ? ordered[1] : bullet[1];
        item = item.replace(/^\[x\]\s+/i, "☑ ").replace(/^\[ \]\s+/, "☐ ");
        body.push(`<li style="margin:4px 0;">${inlineHtml(item)}</li>`);
        continue;
      }

      if (/^\s*>\s?/.test(line)) {
        flushParagraph(body, paragraph);
        closeList();
        body.push(`<blockquote style="margin:12px 0;padding:8px 14px;border-left:3px solid #6355d8;color:#4b5563;background:#f6f4ff;">${inlineHtml(line.replace(/^\s*>\s?/, ""))}</blockquote>`);
        continue;
      }

      if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
        flushParagraph(body, paragraph);
        closeList();
        body.push('<hr style="margin:20px 0;border:0;border-top:1px solid #d7dce2;">');
        continue;
      }

      closeList();
      paragraph.push(line);
    }

    if (inCode) {
      body.push(`<pre style="margin:12px 0;padding:14px 16px;overflow:auto;border-radius:8px;background:#171923;color:#f7fafc;font-family:Consolas,Menlo,monospace;font-size:13px;line-height:1.55;white-space:pre-wrap;"><code>${escapeHtml(code.join("\n").replace(/\n+$/, ""))}</code></pre>`);
    }
    flushParagraph(body, paragraph);
    closeList();

    return `<div style="font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.65;color:#1f2937;">${body.join("")}</div>`;
  }

  function convert(source, mode) {
    if (mode === "markdown") return { text: String(source ?? ""), html: "" };
    const plain = toPlainText(source);
    if (mode === "plain") return { text: plain, html: "" };
    return { text: plain, html: toRichHtml(source) };
  }

  globalObject.PrettyCopySourceFormatter = {
    convert,
    toPlainText,
    toRichHtml,
    __test: { escapeHtml, inlineHtml, isTableRow, normalize, safeLink, splitTableRow, stripInline }
  };
})(globalThis);
