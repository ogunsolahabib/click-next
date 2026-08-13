// ---- Popup on/off toggle (T2.2) ----
// Mirrors the "enabled" default used by content.js — extension is on by
// default so users who never open the popup see unchanged behavior.
const DEFAULT_ENABLED = true;

const toggle = document.getElementById("enabled-toggle");
const statusEl = document.getElementById("status");

function loadEnabled() {
  chrome.storage.sync.get({ enabled: DEFAULT_ENABLED }, (stored) => {
    toggle.checked = stored.enabled;
    console.log("[AutoNext] Popup loaded, enabled =", stored.enabled);
  });
}

function saveEnabled(event) {
  const enabled = event.target.checked;
  chrome.storage.sync.set({ enabled }, () => {
    console.log("[AutoNext] Toggled enabled =", enabled);
    statusEl.textContent = enabled ? "On" : "Off";
    setTimeout(() => {
      statusEl.textContent = "";
    }, 1500);
  });
}

document.addEventListener("DOMContentLoaded", loadEnabled);
toggle.addEventListener("change", saveEnabled);
