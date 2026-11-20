---
slug: side-recorder
stage: launched
priority: 3
url: https://janwan2003.github.io/side-recorder/
repo: https://github.com/janwan2003/side-recorder
updated: 2026-11-20
---

# side-recorder (product name: Tapeline)

(Working slug; the product is **Tapeline**, name checked on 2026-11-20: no CWS, AMO or web collisions found. The product name must not contain "Selenium" (a project trademark) or any
competitor name. Saying that it is "compatible with `.side` files" is fine.)

## Thesis

**Who:** Manual testers moving into automation, QA teams with suites of saved Selenium
IDE tests, students following the many tutorials and courses that teach the Selenium
IDE workflow, and support or ops staff who record repeatable browser checks. Most of
them do not write code.

**What:** An open-source Manifest V3 browser extension that records clicks and typing
into a readable step list, replays it with waits and assertions, and **opens and saves
`.side` project files** (the open JSON format of Selenium IDE 3.x/4.x). It exports
steps to Playwright, Selenium WebDriver (Java/Python/JS) and Cypress code. It needs no
account, makes no network calls, and stores projects as local files.

**Why now:** Selenium IDE, the standard record-and-playback tool with 800K Chrome users,
was a Manifest V2 extension. It stopped updating in 2022, was greyed out in the Chrome
Web Store from 2024, and is gone now that Chrome removed all MV2 extensions on
2026-08-31. The official project moved to a desktop Electron app that is still in beta
(v4.1.0-beta.3, 2026-11-06) and is not in any browser store. The main in-store
replacement, Katalon Recorder, requires a Katalon account login that staff say exists
"for marketing purposes", and is on "limited maintenance". So everyone with `.side`
files and a Chrome browser has no maintained, account-free tool in the store.

## Market evidence

The incumbent's size and removal:
- Selenium IDE Chrome listing [`mooikfkahbdckldjjndioackbalphokd`](https://chromewebstore.google.com/detail/selenium-ide/mooikfkahbdckldjjndioackbalphokd)
  showed **800,000 users, 3.4 (284)** in a search-indexed snapshot (undated). Checked live
  on 2026-11-20 with curl, it returns a blank page (removed).
- Chrome removed all remaining MV2 extensions from the store on 2026-08-31:
  [Chrome for Developers timeline](https://developer.chrome.com/docs/extensions/develop/migrate/mv2-deprecation-timeline),
  [9to5Google](https://9to5google.com/2026/07/08/google-chrome-will-remove-older-manifest-v2-extensions-in-august/),
  [AlternativeTo news](https://alternativeto.net/news/2026/9/google-has-removed-manifest-v2-extensions-from-chrome-web-store-including-ublock-origin/).
- Users who cannot install it: [selenium-users: "Unable to install Selenium IDE in Chrome"](https://groups.google.com/g/selenium-users/c/ts9dslIhLck),
  [selenium-users: "Selenium IDE Chrome Extension"](https://groups.google.com/g/selenium-users/c/zMWsUzmUUyw),
  [LogicMonitor community: "Selenium IDE extension not available on Chrome"](https://community.logicmonitor.com/discussions/product-discussions/selenium-ide-extension-not-available-on-chrome/18142),
  [SAP KB 3630314](https://userapps.support.sap.com/sap/support/knowledge/en/3630314).
- Firefox add-on still listed: [AMO selenium-ide](https://addons.mozilla.org/firefox/addon/selenium-ide/)
  has 30,204 daily users, 4.28 (418), last updated 2022-02-10 (AMO API, live 2026-11-20).
- Official direction: [SeleniumHQ/selenium-ide](https://github.com/SeleniumHQ/selenium-ide)
  releases v4.1.0-beta.1 to beta.3 (2026-11-03 to 11-06), with commits updating Electron
  (GitHub API, live 2026-11-20). It is a desktop download, not a store extension.

Competitors in the Chrome Web Store (live curl, 2026-11-20):
| Extension | Users | Rating (n) | Updated | Weakness |
|---|---|---|---|---|
| [UI.Vision](https://chromewebstore.google.com/detail/gcbalfbdmfieckjlnblleoemohcganoc) | 200,000 | 3.9 (239) | 2026-11-17 | RPA (robotic process automation) suite, broader and heavier than a test recorder |
| [Katalon Recorder](https://chromewebstore.google.com/detail/ljdobmomdgdljniojadhoplhkpialdid) | 100,000 | 3.5 (270) | 2026-09-07 | account login required; "limited maintenance" |
| Qualys Browser Recorder, Rapi Recorder, SauceLabs Low Code Recorder | under 1,000 each | | 2023 to 2026 | niche or vendor-tied |
| [SideReplay](https://alternativeto.net/software/sidereplay/about/) | not checked | | | replays `.side`, MV3; size unknown |

Sanity check 2026-11-20 (builder, via a research subagent; live curl of CWS search pages and listings, AMO API):
| Extension | Users | Rating (n) | Updated | Notes |
|---|---|---|---|---|
| [SideReplay](https://chromewebstore.google.com/detail/giiegloccjlfbooafilbmbbjfidfehek) | 94 | none | 2026-11-11 | Opens/replays `.side` and Katalon tests, MV3. Freemium, closed source: Playwright export and data-driven runs need Pro at $9/month (AlternativeTo, read via WebFetch). Added 2026-10-08. |
| [FlowMacro](https://chromewebstore.google.com/detail/agehjimobcongfgkagfjhmlibkkmjppc) | 72 | none | 2026-11-07 | "standalone Selenium IDE", exports `.side` |
| [TestCase Studio](https://chromewebstore.google.com/detail/loopjjegnlccnhgfehekecpanpmielcj) | 80,000 | 4.6 (208) | 2026-11-20 | Selenium-locator helper; does not open `.side` |
| PulseQA Studio | 10 | none | 2026-11-14 | no `.side` |
So the direct rival is 6 weeks old with 94 users and paywalls export; our free, open-source export is
the gap. AMO: Selenium IDE 31,124 daily users (2022 build), Katalon Recorder 1,034 (2021), UI.Vision 6,886.
Low-star review themes, sample of 57 reviews with text (AMO ratings API for Katalon, Selenium IDE,
UI.Vision; first CWS review page for Katalon and UI.Vision), hand-coded, one review can hit several:
slows/breaks the browser 12, recording/playback fails 10, missing or clumsy save/import/export 10,
account wall or upsell (Katalon) 6, old tests break on import 5, window/layout problems 4.

`.side` format survey: 30 public `.side` files from GitHub code search (downloaded to `/tmp` only; their
licences are unknown, so they are not committed): 823 commands; top: click 254, open 86, type 67,
mouseOver 57, setWindowSize 54, mouseOut 43, executeScript 36, runScript 25, assertElementPresent 21,
verifyText 20, assertText 19. Control flow (if/while/forEach/end) appears in 4 of 30 files, selectFrame 4.

Katalon Recorder login complaints and status:
[Katalon forum: authentication loop](https://forum.katalon.com/t/katalon-recorder-chrome-extension-stuck-in-authentication-loop/187788),
[sign-in failure](https://forum.katalon.com/t/hello-i-cant-sign-in-katalon-recorder-today-no-error-prompt-how-can-i-fix-this-thanks/109399),
[AMO 1-star review over required account](https://addons.mozilla.org/en-US/firefox/addon/katalon-automation-record/reviews/1088495/),
[Katalon Recorder FAQ](https://docs.katalon.com/katalon-platform/plugins-and-add-ons/katalon-recorder-extension/help-and-resources/katalon-recorder-faq-and-troubleshooting-instructions).
The "limited maintenance" and "marketing purposes" quotes come from Katalon forum
threads as summarised by web search on 2026-11-20. Re-read the threads before quoting
them publicly.

Free alternatives that are not store extensions (the real competition for developers):
Chrome DevTools Recorder (built in, exports Puppeteer and, through extensions, other
formats) and Playwright `codegen`. Both suit people who write code. Our target is the
person who wants a store-installed recorder that opens their existing `.side` files.

## Our edge

- **Opens existing `.side` projects.** Thousands of teams have suites in this format, and
  neither DevTools Recorder nor Playwright codegen reads it. We implement it from the
  published format, not by copying Selenium IDE code (charter rule 1).
- **In the store, no account, no network:** installs in one click, unlike the Electron app.
  Unlike Katalon it has no login, and all files stay local.
- **Code export to current frameworks:** Playwright (Selenium IDE never had it),
  WebDriver Java/Python/JS and Cypress, so a recorded test can go into a real suite.
- **Better locators:** prefer `data-testid`, ARIA role/name and text over brittle
  XPath, and offer fallback locators at replay. "Element not found" is the main complaint
  across this category (to be confirmed by reading reviews).
- **Search channel:** docs pages for "selenium ide alternative chrome", "open .side file",
  "convert selenium ide to playwright". The `.side` to Playwright converter can also run
  as a standalone static web page with no install.

## Status

**Tapeline 0.1.0 is built, published on GitHub and the site, and uploaded as a Chrome Web Store draft.**

- Extension (`extension/`, plain JS, no build step, MV3): editor window (tests list, step table,
  step editor with command help and recorded alternative locators, Pick and Find in page, log,
  run test / run all / run from step / stop / speed), recorder (clicks, typing, select, checkbox,
  Enter, right-click assertions; locators prefer data-testid, stable id, name, linkText, aria-label,
  then CSS path and XPath), player (auto-wait 15 s, assertions retry up to 3 s, fallback locators with
  a warning, dialogs, mouse events, keys), runner (if/elseIf/else, while, times, forEach, do/repeatIf,
  store*, `${var}`, executeScript in the page's main world, run), `.side` open/save keeping unknown
  fields, export to Playwright TS, Python+pytest, Java+JUnit 5, selenium-webdriver JS, Cypress.
  Host access is optional `<all_urls>`, asked on first Record/Run.
- Not supported yet (kept in file and export): replay of selectFrame into iframes, selectWindow/close,
  recording inside iframes, file uploads. No Firefox build yet.
- Site: https://janwan2003.github.io/side-recorder/ (landing, `.side` → code converter that runs in
  the browser using the same export library, privacy page). Search Console: verified, added, sitemap
  submitted on 2026-11-20 (`scripts/gsc.py`, API answers 200/204/204).
- Release: https://github.com/janwan2003/side-recorder/releases/tag/v0.1.0 (`tapeline-0.1.0-chrome.zip`).
- Chrome Web Store: draft item `mkkmhonocgfmbjfgcjbpolkfaibpfgbo`, upload SUCCESS 2026-11-20
  (`scripts/cws-upload.py`). Publishing needs the operator to fill the dashboard; every field's text is
  in `store/chrome-privacy.md`.

How it was verified (2026-11-20):
- `npm test`: 23 of 23 pass locally. `tests/lib.test.mjs` (11): `.side` round trip, error messages,
  URL resolution, runner control flow with a fake page, and exports of 31 projects (our fixture plus the
  30-file real corpus in /tmp) syntax-checked with `python3 -m py_compile` and `node --check` (Java is
  not compiled: no javac here). `tests/extension.test.mjs` (9): the unpacked extension in Chromium
  (playwright-core 1.65.1) really records a sign-up flow on a local site (typing, keyboard select,
  label click, submit, right-click assertText), replays it, rescues a broken locator by fallback,
  opens `tests/fixtures/shop.side` and runs if/else, forEach, executeScript, assertAlert and a link,
  shows a failing assertion's reason, edits a step, exports, saves a `.side`, takes screenshots, and
  asserts no console errors. `tests/site.test.mjs` (3): all pages at 390 and 1280 px width, no
  overflow, no broken local links, no console errors, converter via file input.
- GitHub Actions CI on `main` (run 44798742418 and earlier 44798499465): success, including the
  end-to-end extension tests. Pages deploy run 44798742415: success; live URLs return 200.
- Live converter on the published site, checked in Chromium at phone width: converts
  `shop.side` (1 test, 24 steps), 0 console errors.
- Real site: `scripts/real-site-check.mjs` replays a 21-step project on
  https://the-internet.herokuapp.com (login/logout, dropdown, checkbox, JS confirm, dynamic loading):
  "1 passed (7.5 s)".
- Screenshots looked at: `store/screenshot-1280x800.png` (a real replay with a fallback warning),
  editor at 1280 and 760 px, site home at phone width, converter at desktop width.

## Metrics

- 2026-11-20: not in any store yet, so no users. GitHub repo created today. Search Console just added
  (no data yet).

## Next steps

1. **Firefox build and AMO listing** (AMO keys work, `check-keys.py` 2026-11-20; 31K daily users still
   on the 2022 Selenium IDE add-on). Needs a Firefox manifest variant (`background.scripts`, gecko id,
   no `minimum_chrome_version`; check `scripting` `world: 'MAIN'` and `optional_host_permissions` need
   Firefox 128+), an end-to-end test in real Firefox (firefox and geckodriver are installed; see how
   `ventures/save-image-format/tests/firefox.test.mjs` drives it), then submit listed with an
   `amo-submit.py` like Saveform's.
2. After the operator fills the CWS dashboard: `python3 scripts/cws-upload.py --publish`.
3. Replay inside iframes (`selectFrame index=0` / locator; plan: inject the player in all frames,
   find the frameId by a postMessage token handshake from the parent frame) and recording in iframes.
4. Quality: undo/redo in the editor, copy/paste steps, drag to reorder, suites view, a settings panel
   for the default timeout.
5. SEO pages on the site: "open .side file", "Selenium IDE alternative for Chrome", ".side to
   Playwright"; submit to directories that accept open-source testing tools (one listing each, no spam).

## Monetization plan

None until the operator enables it (charter rule 4). Later: a paid team tier
(scheduled runs in the user's own CI via a generated GitHub Actions workflow, shared
step libraries), or sponsorship from QA tooling companies. Recording, replay,
`.side` support and code export stay free.

## Log

- 2026-11-20 scout: created idea. Evidence: web search (Chrome MV2 timeline, Selenium and
  Katalon forums, AlternativeTo); live curl of the CWS listings and search, AMO API and GitHub API,
  all on 2026-11-20.
- 2026-11-20 builder: sanity-checked evidence (SideReplay exists: 94 users, paid export), surveyed 30
  real `.side` files, built Tapeline 0.1.0 (MV3 recorder/player/editor, 5 exporters), site with
  converter, CI, release, CWS draft `mkkmhonocgfmbjfgcjbpolkfaibpfgbo`, Search Console. Evidence:
  `npm test` 23/23, GitHub CI success (run 44798742418), live site 200s, real-site replay 21/21 steps.

