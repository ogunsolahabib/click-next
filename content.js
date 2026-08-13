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
  // Debounce window (ms) for the MutationObserver callback (T3.1). DOM
  // mutations can fire in rapid bursts (e.g. SPA route transitions), so
  // tick() is coalesced to run at most once per this many ms instead of
  // once per mutation record.
  observerDebounceMs: 150,
  // Retry knobs for clickNext() (T3.2). If the timer hits 00:00:00 but the
  // Next Lesson button hasn't rendered yet, clickNext() retries this many
  // times before giving up, with the delay between attempts doubling each
  // time starting from buttonRetryBackoffMs (e.g. 500ms, 1000ms, 2000ms, ...).
  buttonRetryAttempts: 5,
  buttonRetryBackoffMs: 500,
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

// Returns the first site profile whose `hostname` substring matches the
// current page, or null if none match (falls back to activeConfig's
// timerLabelText/nextButtonText).
function findMatchingProfile(siteProfiles) {
  if (!Array.isArray(siteProfiles)) return null;
  return (
    siteProfiles.find(
      (p) => p && p.hostname && location.hostname.includes(p.hostname)
    ) || null
  );
}

// A site counts as allowed if either the global allowedHostnames list
// matches, or any configured per-site profile's hostname matches. If
// neither allowedHostnames nor siteProfiles are configured at all, allow
// every site (preserves T1.3's allowlist-empty-means-allow-all behavior).
function hostnameAllowed(activeConfig, siteProfiles) {
  const hasAllowedHostnames =
    Array.isArray(activeConfig.allowedHostnames) &&
    activeConfig.allowedHostnames.length > 0;
  const hasSiteProfiles = Array.isArray(siteProfiles) && siteProfiles.length > 0;

  if (!hasAllowedHostnames && !hasSiteProfiles) return true;

  const matchesAllowedHostnames =
    hasAllowedHostnames &&
    activeConfig.allowedHostnames.some((h) => location.hostname.includes(h));
  const matchesSiteProfile =
    hasSiteProfiles &&
    siteProfiles.some(
      (p) => p && p.hostname && location.hostname.includes(p.hostname)
    );

  return matchesAllowedHostnames || matchesSiteProfile;
}

// Looks for the Next Lesson button and clicks it. If it's not found yet
// (e.g. it renders a beat after the timer hits 00:00:00), retries with
// backoff up to activeConfig.buttonRetryAttempts times instead of giving up
// after a single miss (T3.2). `attempt` counts retries already performed,
// starting at 0 for the first (non-retry) call.
function clickNext(activeConfig, attempt = 0) {
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
    return;
  }

  const maxAttempts = activeConfig.buttonRetryAttempts;
  if (attempt < maxAttempts) {
    const nextAttempt = attempt + 1;
    const backoffMs = activeConfig.buttonRetryBackoffMs * 2 ** attempt;
    console.log(
      `[AutoNext] Next Lesson button not found, retrying (attempt ${nextAttempt}/${maxAttempts})...`
    );
    setTimeout(
      () => clickNext(activeConfig, nextAttempt),
      backoffMs
    );
  } else {
    console.log(
      `[AutoNext] Next Lesson button not found, gave up after ${maxAttempts} attempts`
    );
  }
}

function tick(activeConfig, timerRe) {
  if (!enabled) return;

  const match = document.body.innerText.match(timerRe);
  if (!match) return;

  const value = match[1];
  if (value === "00:00:00") {
    // hasClicked stays true for the whole clickNext() retry chain (T3.2),
    // so a concurrent tick() from the other trigger (interval vs.
    // MutationObserver, T3.1) can't start a second, independent retry
    // chain while one is already in flight. It only resets below once the
    // timer is observed counting again on the next lesson.
    if (!hasClicked) {
      hasClicked = true;
      setTimeout(() => clickNext(activeConfig), activeConfig.clickDelayMs);
    }
  } else {
    // Timer is running again (new lesson loaded) — reset the guard.
    hasClicked = false;
  }
}

function init(activeConfig, siteProfiles) {
  if (!hostnameAllowed(activeConfig, siteProfiles)) return;

  // Resolve per-site overrides (T2.3): a matching profile's
  // timerLabelText/nextButtonText win over the global defaults;
  // pollIntervalMs and allowedHostnames stay global.
  const matchedProfile = findMatchingProfile(siteProfiles);
  const effectiveConfig = matchedProfile
    ? {
        ...activeConfig,
        timerLabelText:
          matchedProfile.timerLabelText || activeConfig.timerLabelText,
        nextButtonText:
          matchedProfile.nextButtonText || activeConfig.nextButtonText,
      }
    : activeConfig;

  const timerRe = new RegExp(
    effectiveConfig.timerLabelText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
      "\\s*:?\\s*(\\d{2}:\\d{2}:\\d{2})",
    "i"
  );

  console.log(
    "[AutoNext] Active config",
    effectiveConfig,
    matchedProfile ? "(matched site profile)" : "(default profile)"
  );

  // setInterval stays as a safety-net fallback (T3.1 "augment", not
  // replace) in case the timer text updates without triggering a DOM
  // mutation event (e.g. a requestAnimationFrame-driven redraw).
  setInterval(
    () => tick(effectiveConfig, timerRe),
    effectiveConfig.pollIntervalMs
  );

  // MutationObserver (T3.1): catches SPA navigations and dynamically
  // injected timers/buttons immediately, instead of waiting up to
  // pollIntervalMs for the next scheduled tick(). Debounced so a burst of
  // mutation records (e.g. a whole SPA route swap) triggers one coalesced
  // tick() rather than one per record.
  let observerDebounceHandle = null;
  const debouncedTick = () => {
    if (observerDebounceHandle) clearTimeout(observerDebounceHandle);
    observerDebounceHandle = setTimeout(() => {
      observerDebounceHandle = null;
      tick(effectiveConfig, timerRe);
    }, effectiveConfig.observerDebounceMs);
  };

  const observer = new MutationObserver(debouncedTick);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  console.log("[AutoNext] MutationObserver attached to document.body");
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
      siteProfiles: CONFIG.siteProfiles,
      enabled: true,
    },
    (stored) => {
      enabled = stored.enabled;
      init({ ...CONFIG, ...stored }, stored.siteProfiles);
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
  init(CONFIG, CONFIG.siteProfiles);
}
