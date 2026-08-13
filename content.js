// ---- Edit these to fit your site ----
const CONFIG = {
  // Only run on pages whose hostname includes one of these strings.
  // Leave empty ([]) to run on any site.
  allowedHostnames: ["your-lms-domain.com"],
  timerLabelText: "TIME REMAINING",
  nextButtonText: "Next Lesson",
  pollIntervalMs: 1000,
  clickDelayMs: 500,
};
// --------------------------------------

const TIMER_RE = new RegExp(
  CONFIG.timerLabelText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
    "\\s*:?\\s*(\\d{2}:\\d{2}:\\d{2})",
  "i"
);

let hasClicked = false;

function hostnameAllowed() {
  if (!CONFIG.allowedHostnames.length) return true;
  return CONFIG.allowedHostnames.some((h) => location.hostname.includes(h));
}

function clickNext() {
  const candidates = Array.from(
    document.querySelectorAll('button, a, [role="button"]')
  );
  const btn = candidates.find(
    (el) =>
      el.textContent &&
      el.textContent.trim().toLowerCase().includes(CONFIG.nextButtonText.toLowerCase()) &&
      !el.disabled
  );
  if (btn) {
    btn.click();
    console.log("[AutoNext] Clicked Next Lesson");
  } else {
    console.log("[AutoNext] Next Lesson button not found");
  }
}

function tick() {
  const match = document.body.innerText.match(TIMER_RE);
  if (!match) return;

  const value = match[1];
  if (value === "00:00:00") {
    if (!hasClicked) {
      hasClicked = true;
      setTimeout(clickNext, CONFIG.clickDelayMs);
    }
  } else {
    // Timer is running again (new lesson loaded) — reset the guard.
    hasClicked = false;
  }
}

if (hostnameAllowed()) {
  setInterval(tick, CONFIG.pollIntervalMs);
}
