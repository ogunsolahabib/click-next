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

// ---- ASP.NET WebForms `__doPostBack` bypass ----
// Some sites' Content-Security-Policy blocks `javascript:` URL navigation
// when it's triggered by a script-generated click (confirmed on
// member.getdefensive.com: a genuine user click on
// `<a href="javascript:__doPostBack('id','arg')">` works, `el.click()` from
// content.js does not — Chrome logs a CSP script-src violation for the
// javascript: navigation specifically). Calling `__doPostBack` directly as a
// function, instead of asking the browser to navigate to a `javascript:`
// URL, sidesteps that: it's a plain function call in the page's own script
// context, not a URL-scheme navigation, so it isn't subject to the same CSP
// gate — and `chrome.scripting.executeScript`-injected code is exempt from
// the page's CSP regardless. Requires the "scripting" permission and
// host_permissions covering the same site(s) as content_scripts.matches in
// manifest.json (keep those two lists in sync by hand — no build step here
// to derive one from the other).
//
// Runs in the page's MAIN world so `window.__doPostBack` and any inline
// `onclick="..."` handler resolve to the page's real globals, not the
// content script's isolated ones. Injected as a standalone function (not a
// closure) since chrome.scripting.executeScript serializes it separately.
function runWebFormsPostback(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return { ok: false, reason: "element-not-found" };

  // Replicate what a real click does before the browser follows the href:
  // call the compiled onclick handler and respect its gate. Many WebForms
  // pages use this to validate state (e.g. "is the timer actually done?")
  // before allowing the postback — skipping it would bypass that check.
  if (typeof el.onclick === "function") {
    let proceed;
    try {
      proceed = el.onclick.call(el, {
        type: "click",
        target: el,
        currentTarget: el,
        preventDefault() {},
        stopPropagation() {},
      });
    } catch (err) {
      return { ok: false, reason: "onclick threw: " + (err && err.message) };
    }
    if (proceed === false) {
      return { ok: false, reason: "onclick-gate-returned-false" };
    }
  }

  const href = el.getAttribute("href") || "";
  const match = href.match(
    /^javascript:__doPostBack\(\s*'([^']*)'\s*,\s*'([^']*)'\s*\)\s*;?\s*$/
  );
  if (!match) return { ok: false, reason: "href-not-dopostback" };
  if (typeof window.__doPostBack !== "function") {
    return { ok: false, reason: "__doPostBack-undefined" };
  }

  window.__doPostBack(match[1], match[2]);
  return { ok: true };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "AUTONEXT_POSTBACK") return;
  if (!sender.tab || typeof sender.tab.id !== "number") {
    sendResponse({ ok: false, reason: "no-sender-tab" });
    return;
  }

  chrome.scripting.executeScript(
    {
      target: { tabId: sender.tab.id },
      world: "MAIN",
      func: runWebFormsPostback,
      args: [message.elementId],
    },
    (results) => {
      if (chrome.runtime.lastError) {
        console.log(
          "[AutoNext] Postback injection failed:",
          chrome.runtime.lastError.message
        );
        sendResponse({ ok: false, reason: chrome.runtime.lastError.message });
        return;
      }
      const result = results && results[0] && results[0].result;
      console.log("[AutoNext] Postback result:", result);
      sendResponse(result || { ok: false, reason: "no-result" });
    }
  );

  return true; // keep the message channel open for the async sendResponse above
});

// ---- Background tab notifications via chrome.alarms ----
// Chrome throttles setInterval/setTimeout (and the site's own JS-driven
// countdown, and our MutationObserver debounce) once a tab is hidden, to
// save power — confirmed: the extension only clicks promptly while the tab
// is focused, and does nothing until you switch back to it. Trying to click
// through that from the background turned out unreliable to depend on, so
// instead: chrome.alarms wakes the service worker on a schedule that isn't
// tied to any tab's visibility, and from there we just check (read-only,
// no click) whether each matching tab's Next button looks ready — if so, a
// notification lets you jump straight to it with one click. Once that tab
// is actually focused, content.js's existing setInterval/MutationObserver
// path (unthrottled while visible) does the real clicking itself, same as
// it always has. Requires "alarms" and "notifications" permissions.
//
// Deliberately stateless across restarts for the polling itself: rather
// than tracking which tabs registered in an in-memory Set (which MV3
// service-worker restarts — every ~30s idle — would make stale well before
// this 1-minute alarm fires again), each tick freshly queries for tabs
// whose URL matches the same patterns content.js is injected into. Reading
// content_scripts[].matches straight from the manifest keeps this in sync
// with that list automatically, with no third copy of the pattern to
// maintain by hand. `notifiedTabs` (in-memory, keyed by tabId) exists only
// to avoid re-popping the same notification every single minute while a
// tab sits unattended and ready — worst case after a SW restart is one
// duplicate notification, not a functional break.
//
// Tradeoff: chrome.alarms can't fire faster than about once a minute, far
// coarser than the ~1s poll content.js uses while foregrounded — so a
// background tab's notification may appear up to ~60s after the timer
// actually hits 00:00:00. Foreground tabs are unaffected.
const POLL_ALARM_NAME = "autonext-background-poll";
const CONTENT_SCRIPT_URL_PATTERNS = (
  chrome.runtime.getManifest().content_scripts || []
).flatMap((cs) => cs.matches || []);
const NOTIFICATION_ID_PREFIX = "autonext-tab-";

// tabId -> true, only for tabs currently showing (or having just shown) a
// "ready" notification — cleared once that tab is no longer ready (moved on
// to the next lesson, guard reset) so it can notify again next time.
const notifiedTabs = new Set();

// Guard with alarms.get instead of an unconditional create(): alarms persist
// on their own across service-worker restarts (Chrome tracks them outside
// the SW's lifetime), but this top-level code re-runs on every restart —
// calling create() unconditionally here would re-arm the alarm for "1
// minute from now" on every wake, and per chrome.alarms' docs, creating an
// alarm with a name that already exists cancels and replaces it. If
// anything else woke the SW before the minute was up, the countdown would
// keep getting reset and the alarm might never actually fire.
chrome.alarms.get(POLL_ALARM_NAME, (existing) => {
  if (existing) return;
  chrome.alarms.create(POLL_ALARM_NAME, { periodInMinutes: 1 });
});

function notifyTabReady(tabId) {
  chrome.notifications.create(
    NOTIFICATION_ID_PREFIX + tabId,
    {
      type: "basic",
      iconUrl: chrome.runtime.getURL("notification-icon.png"),
      title: "Auto Next Lesson",
      message: "The timer's done — click to jump back to that tab.",
      buttons: [{ title: "Go to lesson" }],
      requireInteraction: true,
    },
    () => void chrome.runtime.lastError
  );
}

function switchToTab(tabId) {
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) return;
    chrome.windows.update(tab.windowId, { focused: true }, () => {
      void chrome.runtime.lastError;
      chrome.tabs.update(tabId, { active: true }, () => {
        void chrome.runtime.lastError;
      });
    });
  });
}

function handleNotificationActivated(notificationId) {
  if (!notificationId.startsWith(NOTIFICATION_ID_PREFIX)) return;
  const tabId = Number(notificationId.slice(NOTIFICATION_ID_PREFIX.length));
  if (!Number.isFinite(tabId)) return;
  switchToTab(tabId);
  notifiedTabs.delete(tabId);
  chrome.notifications.clear(notificationId);
}

chrome.notifications.onButtonClicked.addListener((notificationId) =>
  handleNotificationActivated(notificationId)
);
chrome.notifications.onClicked.addListener((notificationId) =>
  handleNotificationActivated(notificationId)
);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== POLL_ALARM_NAME) return;
  if (!CONTENT_SCRIPT_URL_PATTERNS.length) return;

  chrome.tabs.query({ url: CONTENT_SCRIPT_URL_PATTERNS }, (tabs) => {
    if (chrome.runtime.lastError) return;

    for (const tab of tabs) {
      if (typeof tab.id !== "number") continue;
      const tabId = tab.id;

      chrome.scripting.executeScript(
        {
          target: { tabId },
          func: () =>
            // __autoNextIsReadyToClick only exists once content.js's init()
            // has actually run for this page (i.e. its own, options-page-
            // driven hostnameAllowed() check passed) — a tab matched here
            // purely by manifest URL pattern but not yet initialized (or
            // that failed its own stricter check) just reports not-ready.
            typeof window.__autoNextIsReadyToClick === "function" &&
            window.__autoNextIsReadyToClick(),
        },
        (results) => {
          if (chrome.runtime.lastError) return;
          const ready = Boolean(results && results[0] && results[0].result);

          if (ready && !notifiedTabs.has(tabId)) {
            notifiedTabs.add(tabId);
            notifyTabReady(tabId);
          } else if (!ready && notifiedTabs.has(tabId)) {
            notifiedTabs.delete(tabId);
            chrome.notifications.clear(NOTIFICATION_ID_PREFIX + tabId);
          }
        }
      );
    }
  });
});
