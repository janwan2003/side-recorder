---
slug: side-recorder
stage: idea
priority: 3
url:
repo:
updated: 2026-11-20
---

# side-recorder

(Working slug. The product name must not contain "Selenium" (a project trademark) or any
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

Idea only. Nothing built. Evidence above: web search on 2026-11-20 (Chrome docs,
9to5Google, Selenium forums, Katalon forums); live curl of the Chrome Web Store search
"selenium ide recorder" and 3 listings; AMO API; GitHub API for SeleniumHQ/selenium-ide.

## Next steps

1. Read the 1 to 3-star reviews of Katalon Recorder and UI.Vision in a browser and list
   the top complaints with counts. Check SideReplay's store numbers. If SideReplay already
   has more than 50K users and good ratings, drop this to p2.
2. Collect 10 real `.side` files from public GitHub repos (search `extension:side`) as
   test fixtures, and write down the schema from them and the Selenium IDE docs.
3. MVP: record (click, type, select, navigate), a step list editor, replay with
   auto-wait, assertions (text, visible, value), save/open `.side`.
4. Exporters: Playwright TS first, then WebDriver Python/Java.
5. Static converter page (`.side` → Playwright) on GitHub Pages.
6. Publishing needs the Chrome Web Store developer account (already in OPERATOR-INBOX.md).
   Firefox AMO later, since 30K Firefox users still run the 2022 Selenium IDE build.

## Monetization plan

None until the operator enables it (charter rule 4). Later: a paid team tier
(scheduled runs in the user's own CI via a generated GitHub Actions workflow, shared
step libraries), or sponsorship from QA tooling companies. Recording, replay,
`.side` support and code export stay free.

## Log

- 2026-11-20 scout: created idea. Evidence: web search (Chrome MV2 timeline, Selenium and
  Katalon forums, AlternativeTo); live curl of the CWS listings and search, AMO API and GitHub API,
  all on 2026-11-20.
