// ---- Defaults must mirror the CONFIG fallback values in content.js ----
const CONFIG = {
  allowedHostnames: ["your-lms-domain.com"],
  timerLabelText: "TIME REMAINING",
  nextButtonText: "Next Lesson",
  ariaLabel: [],
  dataTestId: [],
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
  ariaLabel: document.getElementById("ariaLabel"),
  dataTestId: document.getElementById("dataTestId"),
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

// ---- Multi-pattern fields (T3.3) ----
// timerLabelText/nextButtonText/ariaLabel/dataTestId are stored as arrays
// (content.js's toList() also accepts a plain string for backward
// compatibility with data saved by pre-T3.3 versions of this page, but this
// page always writes the array form going forward). The options UI keeps
// these as single comma-separated text inputs, matching the existing
// newline-separated hostname-textarea convention from T2.1.

function listToText(list) {
  return (Array.isArray(list) ? list : list ? [list] : []).join(", ");
}

function textToList(text) {
  return text
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
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
  timerInput.value = listToText(profile && profile.timerLabelText);

  const buttonLabel = document.createElement("label");
  buttonLabel.textContent = "Next button text";
  const buttonInput = document.createElement("input");
  buttonInput.type = "text";
  buttonInput.className = "profile-nextButtonText";
  buttonInput.placeholder = CONFIG.nextButtonText;
  buttonInput.value = listToText(profile && profile.nextButtonText);

  const ariaLabelLabel = document.createElement("label");
  ariaLabelLabel.textContent = "Button aria-label (optional)";
  const ariaLabelInput = document.createElement("input");
  ariaLabelInput.type = "text";
  ariaLabelInput.className = "profile-ariaLabel";
  ariaLabelInput.placeholder = "e.g. Next lesson";
  ariaLabelInput.value = listToText(profile && profile.ariaLabel);

  const dataTestIdLabel = document.createElement("label");
  dataTestIdLabel.textContent = "Button data-testid (optional)";
  const dataTestIdInput = document.createElement("input");
  dataTestIdInput.type = "text";
  dataTestIdInput.className = "profile-dataTestId";
  dataTestIdInput.placeholder = "e.g. next-lesson-button";
  dataTestIdInput.value = listToText(profile && profile.dataTestId);

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
    ariaLabelLabel,
    ariaLabelInput,
    dataTestIdLabel,
    dataTestIdInput,
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
      timerLabelText: textToList(
        row.querySelector(".profile-timerLabelText").value
      ),
      nextButtonText: textToList(
        row.querySelector(".profile-nextButtonText").value
      ),
      ariaLabel: textToList(row.querySelector(".profile-ariaLabel").value),
      dataTestId: textToList(row.querySelector(".profile-dataTestId").value),
    }))
    // Drop rows without a hostname — they can never match a page.
    .filter((profile) => profile.hostname.length > 0)
    .map((profile) => ({
      hostname: profile.hostname,
      timerLabelText:
        profile.timerLabelText.length > 0
          ? profile.timerLabelText
          : [CONFIG.timerLabelText],
      nextButtonText:
        profile.nextButtonText.length > 0
          ? profile.nextButtonText
          : [CONFIG.nextButtonText],
      // Left empty (rather than falling back to a hardcoded default) so
      // content.js's pickOverride() treats "not set on this profile" as "no
      // override, use the global default" — unlike timer/button text above,
      // there's no reasonable non-empty default for these.
      ariaLabel: profile.ariaLabel,
      dataTestId: profile.dataTestId,
    }));
}

function loadOptions() {
  chrome.storage.sync.get(CONFIG, (stored) => {
    fields.allowedHostnames.value = hostnamesToText(stored.allowedHostnames);
    fields.timerLabelText.value = listToText(stored.timerLabelText);
    fields.nextButtonText.value = listToText(stored.nextButtonText);
    fields.ariaLabel.value = listToText(stored.ariaLabel);
    fields.dataTestId.value = listToText(stored.dataTestId);
    fields.pollIntervalMs.value = stored.pollIntervalMs;
    renderProfiles(stored.siteProfiles);
    console.log("[AutoNext] Options loaded", stored);
  });
}

function saveOptions(event) {
  event.preventDefault();

  const pollIntervalMs = parseInt(fields.pollIntervalMs.value, 10);
  const timerLabelTextList = textToList(fields.timerLabelText.value);
  const nextButtonTextList = textToList(fields.nextButtonText.value);
  const toSave = {
    allowedHostnames: textToHostnames(fields.allowedHostnames.value),
    timerLabelText:
      timerLabelTextList.length > 0
        ? timerLabelTextList
        : [CONFIG.timerLabelText],
    nextButtonText:
      nextButtonTextList.length > 0
        ? nextButtonTextList
        : [CONFIG.nextButtonText],
    ariaLabel: textToList(fields.ariaLabel.value),
    dataTestId: textToList(fields.dataTestId.value),
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
