// The GitHub Pages site: built from site/ and checked in Chromium at phone and desktop width.
// The converter is exercised with a real .side file through the file input.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(import.meta.dirname, '..');
const SITE = path.join(ROOT, '_site');
const TYPES = { html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png', xml: 'application/xml', txt: 'text/plain' };
let server, base, browser;

before(async () => {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/build-site.mjs')]);
  server = http.createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    try {
      const body = await readFile(path.join(SITE, p));
      res.writeHead(200, { 'content-type': TYPES[p.split('.').pop()] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: 'chromium' });
});
after(async () => { await browser?.close(); server?.close(); });

for (const [label, viewport] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 860 }]]) {
  test(`pages load without errors or broken links (${label})`, async () => {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    await mkdir(path.join(ROOT, 'test-results'), { recursive: true });
    for (const p of ['index.html', 'convert.html', 'privacy.html']) {
      await page.goto(`${base}/${p}`);
      await page.waitForLoadState('networkidle');
      // nothing wider than the screen
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 0, `${p} overflows by ${overflow}px at ${label} width`);
      // local links resolve
      const links = await page.$$eval('a[href]', (as) => as.map((a) => a.href).filter((h) => h.startsWith(location.origin)));
      for (const l of new Set(links)) assert.equal((await fetch(l)).status, 200, l);
      await page.screenshot({ path: path.join(ROOT, `test-results/site-${p.replace('.html', '')}-${label}.png`), fullPage: p === 'index.html' });
    }
    assert.deepEqual(errors, []);
    await page.close();
  });
}

test('converter turns a .side file into each framework', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${base}/convert.html`);
  await page.setInputFiles('#file', path.join(ROOT, 'tests/fixtures/shop.side'));
  await page.waitForFunction(() => document.getElementById('code').textContent.length > 100);
  assert.match(await page.textContent('#stats'), /shop\.side: 1 test, 24 steps/);
  assert.match(await page.textContent('#code'), /await page\.goto\('http:\/\/127\.0\.0\.1:0\/app\.html'\);/);
  assert.equal(await page.textContent('#fname'), 'shop-checks.spec.ts');
  await page.selectOption('#lang', 'python');
  assert.match(await page.textContent('#code'), /def test_sign_up\(driver\):/);
  await page.selectOption('#lang', 'java');
  assert.match(await page.textContent('#code'), /public class ShopChecksTest/);
  // a file that is not a .side project explains itself
  await page.setInputFiles('#file', { name: 'x.side', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  assert.match(await page.textContent('#err'), /No "tests" list found/);
  await page.click('#sample');
  assert.match(await page.textContent('#code'), /Sample shop/);
  await page.close();
});
