// One-off check against a real public practice site (not part of npm test: it needs the internet).
// Opens a .side project in the real extension and replays it on https://the-internet.herokuapp.com.
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(import.meta.dirname, '..');
const tmp = await mkdtemp(path.join(tmpdir(), 'tapeline-real-'));
const ext = path.join(tmp, 'ext');
await cp(path.join(ROOT, 'extension'), ext, { recursive: true });
const m = JSON.parse(await readFile(path.join(ext, 'manifest.json'), 'utf8'));
m.host_permissions = ['https://the-internet.herokuapp.com/*'];
await writeFile(path.join(ext, 'manifest.json'), JSON.stringify(m));
const ctx = await chromium.launchPersistentContext(path.join(tmp, 'p'), { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`] });
const sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent('serviceworker'));
const editor = await ctx.newPage();
await editor.goto(`chrome-extension://${new URL(sw.url()).host}/editor.html`);
await editor.waitForFunction(() => window.tapeline?.state.project);
const C = (command, target = '', value = '') => ({ command, target, value, targets: [] });
const project = { name: 'the-internet', url: 'https://the-internet.herokuapp.com', tests: [{ id: 'a', name: 'Login, dropdown, checkboxes, alerts', commands: [
  C('open', '/login'), C('type', 'id=username', 'tomsmith'), C('type', 'id=password', 'SuperSecretPassword!'),
  C('click', 'css=button[type=submit]'), C('assertText', 'id=flash', 'glob:You logged into a secure area!*'),
  C('click', 'linkText=Logout'), C('waitForElementVisible', 'id=username', '10000'),
  C('open', '/dropdown'), C('select', 'id=dropdown', 'label=Option 2'), C('assertSelectedValue', 'id=dropdown', '2'),
  C('open', '/checkboxes'), C('click', 'xpath=//form[@id="checkboxes"]/input[1]'), C('assertChecked', 'xpath=//form[@id="checkboxes"]/input[1]'),
  C('open', '/javascript_alerts'), C('click', 'xpath=//button[.="Click for JS Confirm"]'), C('assertConfirmation', 'I am a JS Confirm'), C('assertText', 'id=result', 'You clicked: Ok'),
  C('open', '/dynamic_loading/1'), C('click', 'css=#start button'), C('waitForElementVisible', 'css=#finish h4', '15000'), C('assertText', 'css=#finish h4', 'Hello World!'),
] }], suites: [] };
await editor.evaluate((t) => window.tapeline.openText(t, 'the-internet.side'), JSON.stringify(project));
await editor.click('#play');
await editor.waitForFunction(() => !window.tapeline.state.playing, null, { timeout: 120000 });
console.log(await editor.textContent('#summary'));
console.log((await editor.$$eval('#log li', (l) => l.map((x) => x.textContent))).join('\n'));
await ctx.close();
await rm(tmp, { recursive: true, force: true });
