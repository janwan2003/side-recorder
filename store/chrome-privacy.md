# Chrome Web Store dashboard fields for Tapeline

Item id: `mkkmhonocgfmbjfgcjbpolkfaibpfgbo` (draft, package 0.1.0 uploaded 2026-11-20 with `scripts/cws-upload.py`).
Open https://chrome.google.com/webstore/devconsole, pick the item, and fill these. Then a builder runs
`python3 scripts/cws-upload.py --publish`.

## Store listing

- **Title** (from manifest): Tapeline: test recorder for .side files
- **Summary** (from manifest): Record and replay browser tests. Opens and saves .side projects, exports Playwright, WebDriver and Cypress code. No account.
- **Category**: Developer Tools
- **Language**: English
- **Description**:

```
Tapeline records your clicks and typing as test steps, replays them, and opens and saves .side test projects (the open JSON format used by Selenium IDE 3 and 4). It is free, open source and needs no account.

RECORD
• Clicks, typing, drop-downs, checkboxes and Enter become readable steps.
• Right-click any element while recording to add Assert text, Assert element present, Assert value, Wait for visible, Store text or Assert title.

LOCATORS THAT SURVIVE
• Prefers data-testid, stable ids, names, link text and aria-label over brittle paths.
• Keeps several locators per step and falls back to them when the first one breaks, with a warning so you can fix it.

REPLAY
• Waits for elements and retries assertions briefly, so a slow page does not fail a test.
• Control flow (if, while, times, forEach, do/repeatIf), variables, executeScript, run another test, alert/confirm/prompt checks.
• Run one test, all tests, or from a selected step.

OPEN AND SAVE .side FILES
• Open the projects your team already has. Fields Tapeline does not use are kept, so saving gives back the same file.

EXPORT CODE (free)
• Playwright Test (TypeScript), Selenium WebDriver for Python, Java and JavaScript, and Cypress.

PRIVATE
• No account, no analytics, no network requests. Your projects stay on your computer.

Tapeline is an independent project and is not affiliated with the Selenium project. Source: https://github.com/janwan2003/side-recorder
```

- **Icon**: `extension/icons/icon-128.png`
- **Screenshot** (1280x800): `store/screenshot-1280x800.png`
- **Homepage URL**: https://janwan2003.github.io/side-recorder/
- **Support URL**: https://github.com/janwan2003/side-recorder/issues

## Privacy practices tab

- **Single purpose**: Record, edit and replay browser tests, and open, save and export them as .side files or test code.
- **Permission justifications**:
  - `storage`: Keeps the user's current test project between sessions, in local extension storage.
  - `unlimitedStorage`: Test projects with many tests and recorded locators can exceed the default local storage quota.
  - `scripting`: Injects the recorder and the player into the page under test so the extension can record the user's actions and replay them.
  - `tabs`: Opens the page under test, follows it as it navigates, and resizes its window for setWindowSize steps.
  - `contextMenus`: Adds "Assert text" and similar right-click items while recording.
  - Host permission (`<all_urls>`, optional, requested when the user first presses Record or Run): The user chooses which website to test; the extension must record and replay on that site, which can be any URL.
- **Remote code**: No, I am not using remote code. (All extension code is in the package. User-written steps such as executeScript in the user's own test file run in the page under test only when the user runs that test.)
- **Data usage**: tick nothing. The extension collects no user data. Certify the three disclosures (not sold, not used for unrelated purposes, not used for creditworthiness).
- **Privacy policy URL**: https://janwan2003.github.io/side-recorder/privacy.html

## Distribution

- Public, all regions, free.
