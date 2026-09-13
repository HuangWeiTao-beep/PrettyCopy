(function initializePopup() {
  "use strict";

  const DEFAULT_SETTINGS = { defaultMode: "smart" };
  const MODE_LABELS = { smart: "智能格式", plain: "纯文本", markdown: "Markdown" };

  const sourceInput = document.querySelector("#source-text");
  const sourceCount = document.querySelector("#source-count");
  const clearButton = document.querySelector("#clear-button");
  const copyButton = document.querySelector("#copy-button");
  const outputFrame = document.querySelector("#output-frame");
  const richOutput = document.querySelector("#rich-output");
  const textOutput = document.querySelector("#text-output");
  const outputStatus = document.querySelector("#output-status");
  const modeInputs = Array.from(document.querySelectorAll('input[name="defaultMode"]'));

  let currentMode = DEFAULT_SETTINGS.defaultMode;
  let currentResult = null;
  let renderTimer;
  let feedbackTimer;

  async function load() {
    try {
      const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
      currentMode = MODE_LABELS[settings.defaultMode] ? settings.defaultMode : DEFAULT_SETTINGS.defaultMode;
    } catch (_error) {
      currentMode = DEFAULT_SETTINGS.defaultMode;
    }

    const selected = modeInputs.find((input) => input.value === currentMode) || modeInputs[0];
    selected.checked = true;
    render();
    sourceInput.focus();
  }

  function queueRender() {
    window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(render, 70);
  }

  function render() {
    const source = sourceInput.value;
    const hasContent = source.trim().length > 0;

    sourceCount.textContent = `${source.length} 字符`;
    clearButton.disabled = !hasContent;
    copyButton.disabled = !hasContent;
    outputFrame.classList.toggle("is-empty", !hasContent);

    if (!hasContent) {
      currentResult = null;
      richOutput.hidden = true;
      textOutput.hidden = true;
      richOutput.replaceChildren();
      textOutput.textContent = "";
      outputStatus.textContent = "等待输入";
      resetCopyButton();
      return;
    }

    currentResult = PrettyCopySourceFormatter.convert(source, currentMode);
    const isRich = currentMode === "smart";
    richOutput.hidden = !isRich;
    textOutput.hidden = isRich;

    if (isRich) richOutput.innerHTML = currentResult.html;
    else textOutput.textContent = currentResult.text;

    outputStatus.textContent = `${MODE_LABELS[currentMode]} · ${currentResult.text.length} 字符`;
    resetCopyButton();
  }

  async function copyResult() {
    if (!currentResult || copyButton.disabled) return;
    window.clearTimeout(feedbackTimer);
    copyButton.disabled = true;

    try {
      if (currentMode === "smart") await writeRichText(currentResult.html, currentResult.text);
      else await writePlainText(currentResult.text);
      showCopyFeedback(true, "已复制");
    } catch (error) {
      console.warn("PrettyCopy: copy failed", error);
      showCopyFeedback(false, "复制失败");
    }
  }

  async function writePlainText(text) {
    if (!text) throw new Error("No text to copy");
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch (_error) {
        // Fall through for Chromium builds that reject clipboard writes here.
      }
    }
    fallbackCopy(text);
  }

  async function writeRichText(html, plain) {
    if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
      try {
        const item = new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" })
        });
        await navigator.clipboard.write([item]);
        return;
      } catch (_error) {
        // Keep the synchronous copy-event fallback available.
      }
    }
    fallbackCopy(plain, html);
  }

  function fallbackCopy(plain, html) {
    const onCopy = (event) => {
      event.preventDefault();
      event.clipboardData.setData("text/plain", plain);
      if (html) event.clipboardData.setData("text/html", html);
    };
    document.addEventListener("copy", onCopy, { once: true });
    if (!document.execCommand("copy")) {
      document.removeEventListener("copy", onCopy);
      throw new Error("Browser rejected clipboard write");
    }
  }

  function showCopyFeedback(success, label) {
    copyButton.classList.toggle("is-success", success);
    copyButton.classList.toggle("is-error", !success);
    copyButton.innerHTML = success ? checkButtonMarkup(label) : alertButtonMarkup(label);
    outputStatus.textContent = success ? `${MODE_LABELS[currentMode]} · 已复制到剪贴板` : "复制失败，请重试";
    feedbackTimer = window.setTimeout(() => {
      resetCopyButton();
      copyButton.disabled = !currentResult;
      if (currentResult) outputStatus.textContent = `${MODE_LABELS[currentMode]} · ${currentResult.text.length} 字符`;
    }, 1600);
  }

  function resetCopyButton() {
    window.clearTimeout(feedbackTimer);
    copyButton.classList.remove("is-success", "is-error");
    copyButton.innerHTML = copyButtonMarkup();
    copyButton.disabled = !currentResult;
  }

  function copyButtonMarkup() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg><span>复制结果</span>';
  }

  function checkButtonMarkup(label) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"></path></svg><span>${label}</span>`;
  }

  function alertButtonMarkup(label) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v6M12 17h.01"></path></svg><span>${label}</span>`;
  }

  sourceInput.addEventListener("input", queueRender);
  clearButton.addEventListener("click", () => {
    sourceInput.value = "";
    render();
    sourceInput.focus();
  });
  copyButton.addEventListener("click", copyResult);

  modeInputs.forEach((input) => {
    input.addEventListener("change", async () => {
      if (!input.checked) return;
      currentMode = input.value;
      render();
      try {
        await chrome.storage.sync.set({ defaultMode: currentMode });
      } catch (_error) {
        // Conversion still works if preference syncing is unavailable.
      }
    });
  });

  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      copyResult();
    }
  });

  load();
})();
