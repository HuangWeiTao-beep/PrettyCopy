(function initializePopup() {
  "use strict";

  const DEFAULT_SETTINGS = {
    defaultMode: "smart",
    showButtons: true
  };

  const modeInputs = Array.from(document.querySelectorAll('input[name="defaultMode"]'));
  const showButtonsInput = document.querySelector("#show-buttons");
  const saveStatus = document.querySelector("#save-status");
  let statusTimer;

  async function load() {
    const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    const selected = modeInputs.find((input) => input.value === settings.defaultMode) || modeInputs[0];
    selected.checked = true;
    showButtonsInput.checked = settings.showButtons;
  }

  function showSaved() {
    clearTimeout(statusTimer);
    saveStatus.classList.add("is-visible");
    statusTimer = setTimeout(() => saveStatus.classList.remove("is-visible"), 1300);
  }

  modeInputs.forEach((input) => {
    input.addEventListener("change", async () => {
      if (!input.checked) return;
      await chrome.storage.sync.set({ defaultMode: input.value });
      showSaved();
    });
  });

  showButtonsInput.addEventListener("change", async () => {
    await chrome.storage.sync.set({ showButtons: showButtonsInput.checked });
    showSaved();
  });

  load().catch((error) => {
    console.warn("PrettyCopy: failed to load settings", error);
    saveStatus.textContent = "设置读取失败";
    saveStatus.classList.add("is-visible");
  });
})();
