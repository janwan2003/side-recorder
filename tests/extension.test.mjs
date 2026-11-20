// End-to-end test of the unpacked extension in real Chromium (playwright-core).
// It records a sign-up flow by really clicking and typing in a local test site, replays it, checks a
// fallback locator rescues a broken step, opens a .side file with control flow, scripts and dialogs,
// and exports code.
// Host access is granted up front in a temporary copy of the manifest (the store build asks at runtime,
// and a permission prompt cannot be clicked by an automated test).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, cp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { PAGES } from './pages.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
let server, base, context, sw, extId, app, editor, tmp;
const consoleErrors = [];


before(async () => {
  server = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    if (PAGES[p]) { res.writeHead(200, { 'content-type': 'text/html' }); res.end(PAGES[p]); } else { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;

  tmp = await mkdtemp(path.join(tmpdir(), 'tapeline-e2e-'));
  const ext = path.join(tmp, 'ext');
  await cp(path.join(ROOT, 'extension'), ext, { recursive: true });
  const manifest = JSON.parse(await readFile(path.join(ext, 'manifest.json'), 'utf8'));
  manifest.host_permissions = ['http://127.0.0.1/*'];
  await writeFile(path.join(ext, 'manifest.json'), JSON.stringify(manifest));
  context = await chromium.launchPersistentContext(path.join(tmp, 'profile'), {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1200, height: 800 },
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  sw = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
  extId = new URL(sw.url()).host;
  app = await context.newPage();
  await app.goto(`${base}/app.html`);
  const tabId = await sw.evaluate(async (u) => (await chrome.tabs.query({ url: u + '/*' }))[0].id, base);
  editor = await context.newPage();
  editor.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  editor.on('pageerror', (e) => consoleErrors.push(e.message));
  await editor.goto(`chrome-extension://${extId}/editor.html?tab=${tabId}`);
  await editor.waitForFunction(() => window.tapeline?.state.project);
});

after(async () => {
  await context?.close();
  server?.close();
  await rm(tmp, { recursive: true, force: true });
});

const steps = () => editor.evaluate(() => window.tapeline.test().commands.map((c) => [c.command, c.target, c.value]));

test('base URL defaults to the tab Tapeline was opened from', async () => {
  assert.equal(await editor.inputValue('#baseUrl'), base);
  assert.ok(await editor.isVisible('#emptyState'));
});

test('records clicks, typing, a selection and a right-click assertion', async () => {
  await editor.click('#record');
  await editor.waitForFunction(() => window.tapeline.state.recording);
  await app.bringToFront();
  await app.click('#email');
  await app.keyboard.type('ada@example.com');
  await app.click('input[name=password]');
  await app.keyboard.type('s3cret');
  await app.focus('#plan');
  await app.keyboard.press('ArrowDown'); // Free -> Pro, a real (trusted) change like a person makes
  await app.click('label[for=terms]');
  await app.click('button[type=submit]');
  await app.waitForURL(/welcome/);
  await app.waitForSelector('h1:has-text("Welcome")');
  // Right-click, then the menu item (the background forwards the menu click exactly like this).
  await app.click('h1', { button: 'right' });
  await sw.evaluate(async (u) => {
    const [tab] = await chrome.tabs.query({ url: u + '/*' });
    await chrome.tabs.sendMessage(tab.id, { type: 'tapeline:assert', kind: 'assertText' }, { frameId: 0 });
  }, base);
  await editor.waitForFunction(() => window.tapeline.test().commands.some((c) => c.command === 'assertText'));
  await editor.bringToFront();
  await editor.click('#record'); // stop
  const s = await steps();
  console.log(JSON.stringify(s));
  assert.deepEqual(s[0], ['open', '/app.html', '']);
  assert.equal(s[1][0], 'setWindowSize');
  assert.deepEqual(s.find((c) => c[0] === 'type' && c[2] === 'ada@example.com'), ['type', 'css=[data-testid="email"]', 'ada@example.com']);
  assert.deepEqual(s.find((c) => c[0] === 'type' && c[2] === 's3cret'), ['type', 'name=password', 's3cret']);
  assert.deepEqual(s.find((c) => c[0] === 'select'), ['select', 'id=plan', 'label=Pro']);
  assert.ok(s.some((c) => c[0] === 'click' && c[1] === 'id=terms'), 'label click recorded on the checkbox');
  assert.ok(s.some((c) => c[0] === 'click' && /Sign up|submit|button/.test(c[1])), 'submit click');
  assert.deepEqual(s.at(-1), ['assertText', 'css=h1', 'Welcome, ada@example.com']);
  // every recorded element step carries alternative locators for fallback
  const t = await editor.evaluate(() => window.tapeline.test().commands.filter((c) => c.command === 'click').map((c) => c.targets.length));
  assert.ok(t.every((n) => n >= 2), JSON.stringify(t));
});

test('replays the recording and every step passes', async () => {
  await app.goto('about:blank');
  await editor.click('#play');
  await editor.waitForFunction(() => !window.tapeline.state.playing, null, { timeout: 60000 });
  const summary = await editor.textContent('#summary');
  const log = await editor.$$eval('#log li', (l) => l.map((x) => x.textContent));
  assert.match(summary, /1 passed/, log.join('\n'));
  assert.match(app.url(), /welcome\.html\?email=ada%40example\.com&password=s3cret&plan=Pro&terms=on/);
  assert.equal(await editor.locator('#steps tr.failed').count(), 0);
});

test('a broken locator is rescued by a recorded alternative and flagged', async () => {
  await editor.evaluate(() => {
    const c = window.tapeline.test().commands.find((x) => x.command === 'select');
    c.targets = [['id=plan', 'id'], ['name=plan', 'name']];
    c.target = 'id=plan-renamed';
  });
  await editor.click('#play');
  await editor.waitForFunction(() => !window.tapeline.state.playing, null, { timeout: 60000 });
  assert.match(await editor.textContent('#summary'), /1 passed/);
  const warn = await editor.locator('#steps tr.warning .note').first().textContent();
  assert.match(warn, /fallback locator id=plan/);
});

test('opens a .side file and runs control flow, scripts, dialogs and links', async () => {
  const text = (await readFile(path.join(ROOT, 'tests/fixtures/shop.side'), 'utf8')).replaceAll('http://127.0.0.1:0', base);
  editor.once('dialog', (d) => d.accept()); // "replace the current project?"
  await editor.evaluate((t) => window.tapeline.openText(t, 'shop.side'), text);
  assert.equal(await editor.inputValue('#projectName'), 'Shop checks');
  assert.equal(await editor.locator('#steps tr').count(), 24);
  await editor.click('#play');
  await editor.waitForFunction(() => !window.tapeline.state.playing, null, { timeout: 60000 });
  const log = await editor.$$eval('#log li', (l) => l.map((x) => x.textContent));
  assert.match(await editor.textContent('#summary'), /1 passed/, log.join('\n'));
  assert.ok(log.some((l) => l.endsWith('paid plan: Pro')), log.join('\n'));
  assert.equal(await app.title(), 'Settings');
});

test('a failing assertion stops the test and says why', async () => {
  await editor.evaluate(() => { window.tapeline.test().commands[6].value = 'Welcome, nobody'; });
  await editor.click('#play');
  await editor.waitForFunction(() => !window.tapeline.state.playing, null, { timeout: 60000 });
  assert.match(await editor.textContent('#summary'), /1 of 1 failed/);
  const note = await editor.locator('#steps tr.failed .note').textContent();
  assert.match(note, /Text is "Welcome, ada@example.com", expected "Welcome, nobody"/);
  await editor.evaluate(() => { window.tapeline.test().commands[6].value = 'Welcome, ada@example.com'; });
});

test('editing a step through the form, and export to Playwright', async () => {
  await editor.click('#steps tr:nth-child(3)');
  await editor.fill('#fValue', 'grace@example.com');
  assert.equal((await steps())[2][2], 'grace@example.com');
  await editor.click('#exportCode');
  await editor.selectOption('#exportLang', 'playwright');
  const code = await editor.textContent('#exportOut');
  assert.match(code, /import \{ test, expect \} from '@playwright\/test';/);
  assert.match(code, /fill\('grace@example\.com'\)/);
  await editor.selectOption('#exportLang', 'python');
  assert.match(await editor.textContent('#exportOut'), /def test_sign_up\(driver\):/);
  await editor.keyboard.press('Escape');
});

test('saves the project as a .side file that opens again', async () => {
  const [dl] = await Promise.all([editor.waitForEvent('download'), editor.click('#saveProject')]);
  assert.equal(dl.suggestedFilename(), 'Shop checks.side');
  const saved = JSON.parse(await readFile(await dl.path(), 'utf8'));
  assert.equal(saved.tests[0].commands.length, 24);
  assert.deepEqual(saved['x-custom-field'], { kept: true });
});

test('screenshots of the editor at desktop width', async () => {
  const out = path.join(ROOT, 'test-results');
  await mkdir(out, { recursive: true });
  await editor.setViewportSize({ width: 1280, height: 800 });
  await editor.click('#steps tr:nth-child(7)');
  await editor.screenshot({ path: path.join(out, 'editor-desktop.png') });
  await editor.setViewportSize({ width: 760, height: 900 });
  await editor.screenshot({ path: path.join(out, 'editor-narrow.png') });
  assert.deepEqual(consoleErrors, []);
});
