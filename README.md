# Tapeline

Record and replay browser tests in Chrome. Tapeline opens and saves `.side` projects (the open JSON
test format of Selenium IDE 3.x/4.x) and exports tests to Playwright, Selenium WebDriver (Python,
Java, JavaScript) and Cypress code. It is a Manifest V3 extension with no account and no network calls.

Site and converter: https://janwan2003.github.io/side-recorder/

Tapeline is an independent project, not affiliated with the Selenium project.

## Features

- **Record**: clicks, typing, drop-downs, checkboxes and Enter become steps. Right-click an element
  while recording to add *Assert text*, *Assert element present*, *Assert value*, *Wait for visible*,
  *Store text* or *Assert title*.
- **Locators**: prefers `data-testid` (and `data-test`, `data-cy`, `data-qa`), stable ids, names,
  link text and `aria-label`, then a short CSS path and XPath. Every recorded step keeps the
  alternatives, and replay falls back to them when the first one stops matching, marking the step
  with a warning.
- **Replay**: waits for elements (15 s), retries assertions for up to 3 s, handles `alert`, `confirm`
  and `prompt`, and runs control flow (`if`/`elseIf`/`else`, `while`, `times`, `forEach`,
  `do`/`repeatIf`), variables (`store*`, `${name}`), `executeScript` and `run`.
- **Files**: opens and saves `.side`, keeping fields it does not use, so a round trip loses nothing.
- **Export**: Playwright Test (TypeScript), Python + pytest, Java + JUnit 5, selenium-webdriver +
  Mocha, Cypress. Steps with no equivalent become TODO comments.

Not supported in replay yet: `selectFrame` into iframes, `selectWindow`/`close`, recording inside
iframes, file uploads. These steps are kept in the file and in exported code.

## Install (until the store listings are live)

1. Download `tapeline-<version>-chrome.zip` from the latest release and unzip it.
2. Open `chrome://extensions`, turn on *Developer mode*, click *Load unpacked*, choose the folder.
3. Click the Tapeline toolbar button to open the editor.

## Develop

No build step: `extension/` is the extension. Tests use `playwright-core` with Chromium.

```
npm install
npm test                       # unit tests + end-to-end tests in Chromium + site tests
node scripts/pack-extension.mjs  # packages/tapeline-<version>-chrome.zip
node scripts/build-site.mjs      # _site/ for GitHub Pages
```

`tests/lib.test.mjs` also exports and syntax-checks every `.side` file found in
`/tmp/side-fixtures-dl` if that folder exists (a local corpus from public repositories, not committed).

## Privacy

No data collection. See https://janwan2003.github.io/side-recorder/privacy.html.

MIT licence.
