(function startPrettyCopy() {
  "use strict";

  const DEFAULT_SETTINGS = {
    defaultMode: "smart",
    showButtons: true
  };

  const MODE_LABELS = {
    smart: "智能格式",
    plain: "纯文本",
    markdown: "Markdown"
  };

  let settings = { ...DEFAULT_SETTINGS };
  let scanQueued = false;
  const pendingAnswers = new Set();

  function getStorage() {
    return chrome?.storage?.sync;
  }

  async function loadSettings() {
    try {
      const saved = await getStorage().get(DEFAULT_SETTINGS);
      settings = { ...DEFAULT_SETTINGS, ...saved };
    } catch (_error) {
      settings = { ...DEFAULT_SETTINGS };
    }
    applyVisibility();
  }

  function findAnswers() {
    return Array.from(document.querySelectorAll('[data-message-author-role="assistant"]'));
  }

  function findAnswerBody(answer) {
    const body = answer.querySelector(".markdown") ||
      answer.querySelector('[class*="markdown"]');

    // ChatGPT creates an empty assistant node before the answer starts streaming.
    // Wait for real content so an unusable button is not shown under the user message.
    if (!body || !body.textContent?.trim()) return null;
    return body;
  }

  function applyVisibility() {
    document.documentElement.classList.toggle("pc-buttons-hidden", !settings.showButtons);
  }

  function queueAnswer(answer) {
    if (!answer) return;
    pendingAnswers.add(answer);
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(() => {
      scanQueued = false;
      const answers = Array.from(pendingAnswers);
      pendingAnswers.clear();
      answers.forEach(addCopyControls);
    });
  }

  function scanDocument() {
    findAnswers().forEach(queueAnswer);
  }

  function addCopyControls(answer) {
    if (answer.dataset.prettyCopyReady === "true") return;
    const body = findAnswerBody(answer);
    if (!body || body.querySelector(":scope > .pc-copy-ui")) return;

    answer.dataset.prettyCopyReady = "true";
    const controls = buildControls(body);
    body.insertAdjacentElement("afterend", controls);
  }

  function buildControls(answerBody) {
    const wrapper = document.createElement("div");
    wrapper.className = "pc-copy-ui";
    wrapper.dataset.prettyCopyUi = "true";

    const mainButton = document.createElement("button");
    mainButton.type = "button";
    mainButton.className = "pc-copy-main";
    mainButton.innerHTML = `${copyIcon()}<span>漂亮复制</span>`;
    mainButton.setAttribute("aria-label", "按默认模式复制这条回答");
    mainButton.addEventListener("click", async () => {
      await copyAnswer(answerBody, settings.defaultMode, mainButton);
    });

    const menuButton = document.createElement("button");
    menuButton.type = "button";
    menuButton.className = "pc-copy-menu-button";
    menuButton.innerHTML = chevronIcon();
    menuButton.setAttribute("aria-label", "选择复制格式");
    menuButton.setAttribute("aria-haspopup", "menu");
    menuButton.setAttribute("aria-expanded", "false");

    const menu = document.createElement("div");
    menu.className = "pc-copy-menu";
    menu.setAttribute("role", "menu");
    menu.hidden = true;

    Object.entries(MODE_LABELS).forEach(([mode, label]) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "pc-copy-menu-item";
      item.setAttribute("role", "menuitem");
      item.dataset.mode = mode;
      item.innerHTML = `<span>${label}</span><small>${modeDescription(mode)}</small>`;
      item.addEventListener("click", async () => {
        closeMenu(menu, menuButton);
        await copyAnswer(answerBody, mode, mainButton);
      });
      menu.append(item);
    });

    menuButton.addEventListener("click", (event) => {
      event.stopPropagation();
      const shouldOpen = menu.hidden;
      closeAllMenus();
      menu.hidden = !shouldOpen;
      menuButton.setAttribute("aria-expanded", String(shouldOpen));
      if (shouldOpen) {
        wrapper.classList.add("is-menu-open");
        positionMenu(wrapper, menu);
        menu.querySelector("button")?.focus();
      }
    });

    menu.addEventListener("keydown", (event) => handleMenuKeys(event, menu, menuButton));
    wrapper.append(mainButton, menuButton, menu);
    return wrapper;
  }

  function closeMenu(menu, button) {
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
    menu.parentElement?.classList.remove("is-menu-open");
  }

  function closeAllMenus() {
    document.querySelectorAll(".pc-copy-menu:not([hidden])").forEach((menu) => {
      menu.hidden = true;
      const wrapper = menu.parentElement;
      wrapper?.classList.remove("is-menu-open");
      wrapper?.querySelector(".pc-copy-menu-button")?.setAttribute("aria-expanded", "false");
    });
  }

  function positionMenu(wrapper, menu) {
    menu.classList.remove("opens-up", "opens-down");
    menu.style.removeProperty("--pc-menu-max-height");

    const triggerRect = wrapper.getBoundingClientRect();
    const menuHeight = menu.scrollHeight;
    const spaceAbove = Math.max(0, triggerRect.top - 12);
    const spaceBelow = Math.max(0, window.innerHeight - triggerRect.bottom - 12);
    const canOpenAbove = spaceAbove >= Math.min(menuHeight, 168);
    const opensUp = canOpenAbove || spaceAbove > spaceBelow;
    const availableSpace = opensUp ? spaceAbove : spaceBelow;

    menu.classList.add(opensUp ? "opens-up" : "opens-down");
    menu.style.setProperty("--pc-menu-max-height", `${Math.max(112, availableSpace)}px`);
  }

  function handleMenuKeys(event, menu, trigger) {
    const items = Array.from(menu.querySelectorAll("button"));
    const index = items.indexOf(document.activeElement);
    if (event.key === "Escape") {
      closeMenu(menu, trigger);
      trigger.focus();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    }
  }

  async function copyAnswer(answerBody, mode, feedbackButton) {
    feedbackButton.disabled = true;
    feedbackButton.classList.remove("is-success", "is-error");
    feedbackButton.innerHTML = `${spinnerIcon()}<span>处理中</span>`;

    try {
      const plain = PrettyCopyFormatter.toPlainText(answerBody);
      if (mode === "markdown") {
        await writePlainText(PrettyCopyFormatter.toMarkdown(answerBody));
      } else if (mode === "plain") {
        await writePlainText(plain);
      } else {
        const html = PrettyCopyFormatter.toRichHtml(answerBody);
        await writeRichText(html, plain);
      }
      showButtonResult(feedbackButton, true, `已复制 · ${MODE_LABELS[mode]}`);
    } catch (error) {
      console.warn("PrettyCopy: copy failed", error);
      showButtonResult(feedbackButton, false, "复制失败");
    }
  }

  async function writePlainText(text) {
    if (!text) throw new Error("No text to copy");
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch (_error) {
        // Some Chromium builds expose the API to content scripts but reject it.
      }
    }
    fallbackCopy(text, null);
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
        // Fall back to the synchronous copy event while the user gesture is active.
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
    const succeeded = document.execCommand("copy");
    if (!succeeded) throw new Error("Browser rejected clipboard write");
  }

  function showButtonResult(button, success, label) {
    button.disabled = false;
    button.classList.toggle("is-success", success);
    button.classList.toggle("is-error", !success);
    button.title = success ? label : "请允许剪贴板权限后重试";
    button.innerHTML = `${success ? checkIcon() : alertIcon()}<span>${label}</span>`;
    window.setTimeout(() => {
      button.classList.remove("is-success", "is-error");
      button.removeAttribute("title");
      button.innerHTML = `${copyIcon()}<span>漂亮复制</span>`;
    }, 1800);
  }

  function modeDescription(mode) {
    return {
      smart: "Word、Notion、飞书",
      plain: "微信、邮件、记事本",
      markdown: "文档与代码编辑器"
    }[mode];
  }

  function copyIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg>';
  }

  function chevronIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"></path></svg>';
  }

  function checkIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"></path></svg>';
  }

  function alertIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v6M12 17h.01"></path></svg>';
  }

  function spinnerIcon() {
    return '<svg class="pc-spinner" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"></circle></svg>';
  }

  document.addEventListener("click", closeAllMenus);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAllMenus();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") return;
    if (changes.defaultMode) settings.defaultMode = changes.defaultMode.newValue;
    if (changes.showButtons) settings.showButtons = changes.showButtons.newValue;
    applyVisibility();
  });

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      const target = mutation.target.nodeType === Node.ELEMENT_NODE ? mutation.target : mutation.target.parentElement;
      queueAnswer(target?.closest?.('[data-message-author-role="assistant"]'));

      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        if (node.matches?.('[data-message-author-role="assistant"]')) queueAnswer(node);
        node.querySelectorAll?.('[data-message-author-role="assistant"]').forEach(queueAnswer);
      });
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  loadSettings().then(scanDocument);
})();
