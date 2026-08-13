// ---- Defaults must mirror the CONFIG fallback values in content.js ----
const CONFIG = {
  allowedHostnames: ["your-lms-domain.com"],
  timerLabelText: "TIME REMAINING",
  nextButtonText: "Next Lesson",
  pollIntervalMs: 1000,
};
// -------------------------------------------------------------------

const form = document.getElementById("options-form");
const statusEl = document.getElementById("status");
const fields = {
  allowedHostnames: document.getElementById("allowedHostnames"),
  timerLabelText: document.getElementById("timerLabelText"),
  nextButtonText: document.getElementById("nextButtonText"),
  pollIntervalMs: document.getElementById("pollIntervalMs"),
};

function hostnamesToText(hostnames) {
  return (hostnames || []).join("\n");
}

function textToHostnames(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function loadOptions() {
  chrome.storage.sync.get(CONFIG, (stored) => {
    fields.allowedHostnames.value = hostnamesToText(stored.allowedHostnames);
    fields.timerLabelText.value = stored.timerLabelText;
    fields.nextButtonText.value = stored.nextButtonText;
    fields.pollIntervalMs.value = stored.pollIntervalMs;
    console.log("[AutoNext] Options loaded", stored);
  });
}

function saveOptions(event) {
  event.preventDefault();

  const pollIntervalMs = parseInt(fields.pollIntervalMs.value, 10);
  const toSave = {
    allowedHostnames: textToHostnames(fields.allowedHostnames.value),
    timerLabelText: fields.timerLabelText.value.trim() || CONFIG.timerLabelText,
    nextButtonText: fields.nextButtonText.value.trim() || CONFIG.nextButtonText,
    pollIntervalMs:
      Number.isFinite(pollIntervalMs) && pollIntervalMs > 0
        ? pollIntervalMs
        : CONFIG.pollIntervalMs,
  };

  chrome.storage.sync.set(toSave, () => {
    console.log("[AutoNext] Options saved", toSave);
    statusEl.textContent = "Saved.";
    setTimeout(() => {
      statusEl.textContent = "";
    }, 2000);
  });
}

document.addEventListener("DOMContentLoaded", loadOptions);
form.addEventListener("submit", saveOptions);
