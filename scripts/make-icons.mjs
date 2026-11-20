// Renders extension/icons/icon.svg to the PNG sizes the stores need, using the browser's own renderer.
import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const svg = await readFile(path.join(root, 'extension/icons/icon.svg'), 'utf8');
const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage();
for (const size of [16, 32, 48, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${size}" height="${size}">`);
  await page.screenshot({ path: path.join(root, `extension/icons/icon-${size}.png`), omitBackground: true });
}
await browser.close();
console.log('icons written');
