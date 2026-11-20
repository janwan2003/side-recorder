// Builds packages/tapeline-<version>-chrome.zip (Chrome Web Store, Edge) from extension/ as is.
// The Firefox build is not made yet: it is untested in Firefox (see VENTURE.md, Next steps).
import { readFile, mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const src = path.join(root, 'extension');
const { version } = JSON.parse(await readFile(path.join(src, 'manifest.json'), 'utf8'));
await mkdir(path.join(root, 'packages'), { recursive: true });
const out = path.join(root, 'packages', `tapeline-${version}-chrome.zip`);
await rm(out, { force: true });
execFileSync('zip', ['-r', '-X', '-D', '-q', out, '.', '-x', 'icons/icon.svg'], { cwd: src });
console.log(out);
