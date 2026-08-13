// ---- Defaults must mirror the CONFIG fallback values in content.js ----
const CONFIG = {
  allowedHostnames: ["your-lms-domain.com"],
  timerLabelText: "TIME REMAINING",
  nextButtonText: "Next Lesson",
  pollIntervalMs: 1000,
  siteProfiles: [],
};
// -------------------------------------------------------------------

const form = document.getElementById("options-form");
const statusEl = document.getElementById("status");
const profilesList = document.getElementById("profiles-list");
const addProfileBtn = document.getElementById("add-profile");
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

// ---- Site profiles (T2.3) ----
// Each row in #profiles-list is a .profile-row with its own hostname/
// timerLabelText/nextButtonText inputs, built dynamically since the number
// of profiles is user-controlled.

function makeProfileRow(profile) {
  const row = document.createElement("div");
  row.className = "profile-row";

  const hostnameLabel = document.createElement("label");
  hostnameLabel.textContent = "Hostname";
  const hostnameInput = document.createElement("input");
  hostnameInput.type = "text";
  hostnameInput.className = "profile-hostname";
  hostnameInput.placeholder = "e.g. some-lms.com";
  hostnameInput.value = (profile && profile.hostname) || "";

  const timerLabel = document.createElement("label");
  timerLabel.textContent = "Timer label text";
  const timerInput = document.createElement("input");
  timerInput.type = "text";
  timerInput.className = "profile-timerLabelText";
  timerInput.placeholder = CONFIG.timerLabelText;
  timerInput.value = (profile && profile.timerLabelText) || "";

  const buttonLabel = document.createElement("label");
  buttonLabel.textContent = "Next button text";
  const buttonInput = document.createElement("input");
  buttonInput.type = "text";
  buttonInput.className = "profile-nextButtonText";
  buttonInput.placeholder = CONFIG.nextButtonText;
  buttonInput.value = (profile && profile.nextButtonText) || "";

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "remove-profile";
  removeBtn.textContent = "Remove profile";
  removeBtn.addEventListener("click", () => row.remove());

  row.append(
    hostnameLabel,
    hostnameInput,
    timerLabel,
    timerInput,
    buttonLabel,
    buttonInput,
    removeBtn
  );
  return row;
}

function renderProfiles(siteProfiles) {
  profilesList.innerHTML = "";
  (siteProfiles || []).forEach((profile) => {
    profilesList.appendChild(makeProfileRow(profile));
  });
}

function collectProfiles() {
  return Array.from(profilesList.querySelectorAll(".profile-row"))
    .map((row) => ({
      hostname: row.querySelector(".profile-hostname").value.trim(),
      timerLabelText: row
        .querySelector(".profile-timerLabelText")
        .value.trim(),
      nextButtonText: row
        .querySelector(".profile-nextButtonText")
        .value.trim(),
    }))
    // Drop rows without a hostname — they can never match a page.
    .filter((profile) => profile.hostname.length > 0)
    .map((profile) => ({
      hostname: profile.hostname,
      timerLabelText: profile.timerLabelText || CONFIG.timerLabelText,
      nextButtonText: profile.nextButtonText || CONFIG.nextButtonText,
    }));
}

function loadOptions() {
  chrome.storage.sync.get(CONFIG, (stored) => {
    fields.allowedHostnames.value = hostnamesToText(stored.allowedHostnames);
    fields.timerLabelText.value = stored.timerLabelText;
    fields.nextButtonText.value = stored.nextButtonText;
    fields.pollIntervalMs.value = stored.pollIntervalMs;
    renderProfiles(stored.siteProfiles);
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
    siteProfiles: collectProfiles(),
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
addProfileBtn.addEventListener("click", () => {
  profilesList.appendChild(makeProfileRow(null));
});
