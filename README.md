# Auto Next Lesson

A small Chrome extension that watches for a countdown timer on a course/LMS
page (e.g. text like `TIME REMAINING: 00:01:32`) and automatically clicks the
"Next Lesson" style button for you once the countdown hits `00:00:00` — so you
don't have to babysit the tab.

It's a plain content script: no account, no server, nothing leaves your
browser. It only runs on the site(s) you tell it to.

## Installing it

There's no Chrome Web Store listing yet, so it has to be loaded as an
unpacked extension:

1. Download or clone this folder onto your computer.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select this folder (the one containing
   `manifest.json`).
5. "Auto Next Lesson" should now appear in your extensions list and in the
   toolbar's extensions (puzzle-piece) menu.

To pick up any future code changes, come back to `chrome://extensions` and
click the reload icon on the extension's card.

## Turning it on/off

Click the extension's icon in the toolbar (pin it via the puzzle-piece menu
if you don't see it) to open the popup. It has a single **Enabled** toggle:

- **On** (default): the extension watches for the timer and clicks the next
  button when it hits `00:00:00`.
- **Off**: it stops immediately on any open tab, within one poll cycle — no
  need to reload the page.

This setting is stored in your Chrome profile and applies everywhere, not
per-tab.

You can also flip the same toggle with a keyboard shortcut, without opening
the popup — the default is **Ctrl+Shift+Y** (**Command+Shift+Y** on Mac). If
that combination conflicts with something else on your system, you can
change it at `chrome://extensions/shortcuts`.

## Setting it up for your site

Out of the box the extension doesn't match any real course site — you need
to tell it your site's hostname and (if needed) the exact wording it uses.
Open the options page one of two ways:

- Right-click the extension's toolbar icon → **Options**, or
- Go to `chrome://extensions`, find "Auto Next Lesson", click **Details**,
  then **Extension options**.

Changes you save here take effect the next time you load/refresh the target
page — you don't need to reload the unpacked extension.

### Fields on the options page

- **Allowed hostnames** — one hostname (or partial hostname) per line, e.g.
  `learn.example.com`. The extension only runs on pages whose hostname
  contains one of these. Leave this empty to run on every site (not
  recommended — you probably only want it on your course platform).
- **Default timer label text** — the text that appears right before the
  `HH:MM:SS` countdown, e.g. `TIME REMAINING`. You can list several
  comma-separated alternates if a site sometimes uses different wording,
  e.g. `TIME REMAINING, TIME LEFT` — each one is tried in turn.
- **Default next button text** — the visible text (or a substring of it) on
  the button to click, e.g. `Next Lesson`. Also accepts comma-separated
  alternates, e.g. `Next Lesson, Continue`.
- **Default button aria-label (optional)** — if the button's accessible
  label (its `aria-label` attribute) is a more reliable signal than its
  visible text, list it here (comma-separated alternates allowed). Leave
  blank to skip this check.
- **Default button data-testid (optional)** — same idea, but matching the
  button's `data-testid` attribute (exact match or substring). Leave blank
  to skip.
- **Poll interval (ms)** — how often (in milliseconds) the page is scanned
  as a fallback safety net, in addition to reacting immediately to page
  changes. Applies globally, not per site. The default is `1000` (once a
  second); you generally don't need to change this.
- **Site profiles** — if you use the extension on more than one LMS and
  they use different wording, add a profile per hostname here. Each profile
  has its own hostname plus its own timer label / button text / aria-label /
  data-testid fields (all support the same comma-separated-alternates
  syntax as the defaults above). The first profile whose hostname matches
  the current page wins; the poll interval and allowed-hostnames list stay
  global settings shared by every profile. Any field left blank on a
  profile falls back to the default value above it.

## Quick walkthrough: pointing this at your course site

1. Open your course page and note two things: the exact hostname (e.g.
   `courses.example.com`) and the exact wording used for the countdown label
   and the "next" button (open devtools and inspect the elements if you're
   not sure).
2. Open the extension's **Options** page (see above).
3. Under **Allowed hostnames**, add the hostname on its own line.
4. Under **Default timer label text**, enter the label text that precedes
   the countdown (e.g. `TIME REMAINING`).
5. Under **Default next button text**, enter the button's text (e.g.
   `Next Lesson`). If the site uses different wording on different pages,
   add the alternates comma-separated.
6. Click **Save**.
7. Reload the course page, open devtools (`F12` or right-click → Inspect →
   Console), and confirm you see `[AutoNext] Active config ...` logged. Wait
   for the timer to reach `00:00:00` (or navigate to a lesson that's already
   near the end) and confirm `[AutoNext] Clicked Next Lesson` appears and the
   button actually gets clicked.

If your course only has one lesson wording and you'll never use another
site, you can skip **Site profiles** entirely and just fill in the default
fields above.

## Troubleshooting

- **Nothing happens / no logs at all.** Open devtools console on the page
  and filter for `[AutoNext]`. If you see nothing, double check the page's
  hostname is actually covered by your **Allowed hostnames** (or a matching
  site profile) — the extension exits silently on pages that don't match.
- **It says the config loaded but never clicks.** Check that the timer label
  text you configured actually appears in the page immediately before the
  `HH:MM:SS` countdown, and that the button text/aria-label/data-testid you
  configured actually matches the real button. Timer label text, button
  text, and aria-label are all case-insensitive substring matches — the
  configured value just needs to appear somewhere in the real text/label, it
  doesn't need to match exactly. **data-testid is different:** matching is
  case-sensitive, and matches only on an exact value or substring of the
  real `data-testid` attribute (see the Fields section above) — double
  check capitalization if that's the field you're relying on.
- **You see "Next Lesson button not found, retrying (attempt N/5)..." in the
  console.** This is normal if the button renders a moment after the timer
  reaches zero (e.g. an animation or async page update) — the extension
  retries several times with increasing delays before giving up. If it logs
  "gave up after 5 attempts", the button text/aria-label/data-testid you
  configured probably doesn't match what's actually on the page.
- **You see "button matched but is disabled/hidden, retrying..." or "...gave
  up".** The extension deliberately won't click a button that's disabled,
  marked `aria-disabled="true"`, or not visible/rendered — it's waiting for
  the site itself to enable/show it. If it never becomes clickable, that's a
  site-side issue, not something the extension can fix by retrying longer.
- **It worked once but not on the next lesson.** The "already clicked" guard
  only resets once the timer is observed counting down again. If the next
  lesson's timer doesn't match your configured label text, the guard won't
  reset and it'll look like the extension stopped working — check the
  `[AutoNext]` logs on the new lesson page.
- **Toggling the popup off doesn't seem to do anything visible** — that's
  expected, it just stops future clicks; it won't undo anything already
  clicked.
