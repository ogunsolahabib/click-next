// ---- Edit these to fit your site ----
// These are the fallback defaults used if the options page (chrome.storage.sync)
// has no saved values yet. Once a value is saved via options.html, the stored
// value wins — edit CONFIG here only to change the out-of-the-box defaults.
const CONFIG = {
  // Only run on pages whose hostname includes one of these strings.
  // Leave empty ([]) to run on any site.
  allowedHostnames: ["your-lms-domain.com"],
  timerLabelText: "TIME REMAINING",
  nextButtonText: "Next Lesson",
  pollIntervalMs: 1000,
  // Not configurable via the options page (T2.1) — edit here if needed.
  clickDelayMs: 500,
  // Per-site overrides (T2.3), edited via options.html. Each entry is
  // { hostname, timerLabelText, nextButtonText }. The first profile whose
  // `hostname` is a substring of location.hostname wins; timerLabelText/
  // nextButtonText above (and allowedHostnames) remain the fallback default
  // profile for hosts that don't match any entry here.
  siteProfiles: [],
};
// --------------------------------------

let hasClicked = false;

// Live on/off flag, toggled from popup.html (T2.2). Defaults to true so
// behavior is unaffected for users who never open the popup. Kept in memory
// and updated via chrome.storage.onChanged so an already-open tab reacts
// within one poll interval without needing a page reload.
let enabled = true;

function hostnameAllowed(activeConfig) {
  if (!activeConfig.allowedHostnames.length) return true;
  return activeConfig.allowedHostnames.some((h) =>
    location.hostname.includes(h)
  );
}

function clickNext(activeConfig) {
  const candidates = Array.from(
    document.querySelectorAll('button, a, [role="button"]')
  );
  const btn = candidates.find(
    (el) =>
      el.textContent &&
      el.textContent
        .trim()
        .toLowerCase()
        .includes(activeConfig.nextButtonText.toLowerCase()) &&
      !el.disabled
  );
  if (btn) {
    btn.click();
    console.log("[AutoNext] Clicked Next Lesson");
  } else {
    console.log("[AutoNext] Next Lesson button not found");
  }
}

function tick(activeConfig, timerRe) {
  if (!enabled) return;

  const match = document.body.innerText.match(timerRe);
  if (!match) return;

  const value = match[1];
  if (value === "00:00:00") {
    if (!hasClicked) {
      hasClicked = true;
      setTimeout(() => clickNext(activeConfig), activeConfig.clickDelayMs);
    }
  } else {
    // Timer is running again (new lesson loaded) — reset the guard.
    hasClicked = false;
  }
}

function init(activeConfig) {
  if (!hostnameAllowed(activeConfig)) return;

  const timerRe = new RegExp(
    activeConfig.timerLabelText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
      "\\s*:?\\s*(\\d{2}:\\d{2}:\\d{2})",
    "i"
  );

  console.log("[AutoNext] Active config", activeConfig);
  setInterval(() => tick(activeConfig, timerRe), activeConfig.pollIntervalMs);
}

// Load user-configurable fields from chrome.storage.sync (set via
// options.html), falling back to the hardcoded CONFIG defaults above when
// nothing has been saved yet.
if (chrome.storage && chrome.storage.sync) {
  chrome.storage.sync.get(
    {
      allowedHostnames: CONFIG.allowedHostnames,
      timerLabelText: CONFIG.timerLabelText,
      nextButtonText: CONFIG.nextButtonText,
      pollIntervalMs: CONFIG.pollIntervalMs,
      enabled: true,
    },
    (stored) => {
      enabled = stored.enabled;
      init({ ...CONFIG, ...stored });
    }
  );

  // Keep the in-memory `enabled` flag in sync with popup.html toggles so
  // tick() reflects the change on its very next poll, without a page reload.
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "sync" && changes.enabled) {
      enabled = changes.enabled.newValue;
      console.log("[AutoNext] Enabled changed via popup:", enabled);
    }
  });
} else {
  console.log("[AutoNext] chrome.storage unavailable, using hardcoded CONFIG");
  init(CONFIG);
}
