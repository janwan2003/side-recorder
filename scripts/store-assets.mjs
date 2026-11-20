// Makes store/screenshot-1280x800.png: the real editor after a real replay of tests/fixtures/shop.side
// against the local test pages, with shop.example.com mapped to the local server so the URL reads well.
import http from 'node:http';
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { PAGES } from '../tests/pages.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const server = http.createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  if (PAGES[p]) { res.writeHead(200, { 'content-type': 'text/html' }); res.end(PAGES[p]); } else { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const tmp = await mkdtemp(path.join(tmpdir(), 'tapeline-assets-'));
const ext = path.join(tmp, 'ext');
await cp(path.join(ROOT, 'extension'), ext, { recursive: true });
const m = JSON.parse(await readFile(path.join(ext, 'manifest.json'), 'utf8'));
m.host_permissions = ['http://shop.example.com/*'];
await writeFile(path.join(ext, 'manifest.json'), JSON.stringify(m));
const ctx = await chromium.launchPersistentContext(path.join(tmp, 'p'), {
  channel: 'chromium', headless: true, viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, `--host-resolver-rules=MAP shop.example.com 127.0.0.1:${port}`],
});
const sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent('serviceworker'));
const id = new URL(sw.url()).host;
const editor = await ctx.newPage();
await editor.goto(`chrome-extension://${id}/editor.html`);
await editor.waitForFunction(() => window.tapeline?.state.project);
const text = (await readFile(path.join(ROOT, 'tests/fixtures/shop.side'), 'utf8')).replaceAll('http://127.0.0.1:0', 'http://shop.example.com');
await editor.evaluate((t) => window.tapeline.openText(t, 'shop.side'), text);
// Show the fallback warning too: rename one locator so the recorded alternative is used.
await editor.evaluate(() => { const c = window.tapeline.test().commands[1]; c.target = 'css=#signup-email'; });
await editor.click('#play');
await editor.waitForFunction(() => !window.tapeline.state.playing, null, { timeout: 60000 });
await editor.click('#steps tr:nth-child(2)');
await editor.evaluate(() => { document.getElementById('tableWrap').scrollTop = 0; });
await editor.waitForTimeout(2600); // let the "Opened" toast fade
await editor.screenshot({ path: path.join(ROOT, 'store/screenshot-1280x800.png') });
await ctx.close();
server.close();
await rm(tmp, { recursive: true, force: true });
console.log('store/screenshot-1280x800.png');
