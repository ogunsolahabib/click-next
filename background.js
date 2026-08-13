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
