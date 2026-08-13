// ---- Keyboard shortcut to toggle (T4.3) ----
// MV3 service worker. Content scripts can't listen for chrome.commands
// directly, so this background script owns that listener; it flips the same
// `enabled` key in chrome.storage.sync that popup.js (T2.2) already reads
// and writes. content.js's existing chrome.storage.onChanged listener picks
// up the change on its own, so no messaging to content scripts is needed.
const DEFAULT_ENABLED = true;

chrome.commands.onCommand.addListener((command) => {
  if (command !== "toggle-enabled") return;

  chrome.storage.sync.get({ enabled: DEFAULT_ENABLED }, (stored) => {
    const enabled = !stored.enabled;
    chrome.storage.sync.set({ enabled }, () => {
      console.log("[AutoNext] Toggled enabled via keyboard shortcut =", enabled);
    });
  });
});
