// Builds the GitHub Pages site into _site/: the pages in site/ with the shared header and footer, the
// export library from extension/lib (the converter uses the same code as the extension), the icon and
// the editor screenshot.
import { readFile, writeFile, mkdir, rm, cp, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, '_site');
await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, 'lib'), { recursive: true });
const head = await readFile(path.join(root, 'site/_head.html'), 'utf8');
const foot = await readFile(path.join(root, 'site/_foot.html'), 'utf8');
for (const f of await readdir(path.join(root, 'site'))) {
  if (f.startsWith('_')) continue;
  const src = path.join(root, 'site', f);
  if (f.endsWith('.html')) {
    const page = (await readFile(src, 'utf8')).replace('<!--#head-->', head.replace(`href="./${f}"`, `href="./${f}" aria-current="page"`)).replace('<!--#foot-->', foot);
    await writeFile(path.join(out, f), page);
  } else await cp(src, path.join(out, f), { recursive: true });
}
for (const f of ['side.js', 'commands.js', 'export.js']) await cp(path.join(root, 'extension/lib', f), path.join(out, 'lib', f));
await cp(path.join(root, 'extension/icons/icon-128.png'), path.join(out, 'icon-128.png'));
const shot = path.join(root, 'store/screenshot-1280x800.png');
if (existsSync(shot)) await cp(shot, path.join(out, 'editor.png'));
const urls = ['', 'convert.html', 'privacy.html'].map((p) => `<url><loc>https://janwan2003.github.io/side-recorder/${p}</loc></url>`).join('');
await writeFile(path.join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>\n`);
await writeFile(path.join(out, 'robots.txt'), 'User-agent: *\nAllow: /\nSitemap: https://janwan2003.github.io/side-recorder/sitemap.xml\n');
await writeFile(path.join(out, '.nojekyll'), '');
console.log('site built in _site/');
