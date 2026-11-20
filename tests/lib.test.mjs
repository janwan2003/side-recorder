// Unit tests for the .side reader/writer, the runner's control flow and the code exporters.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseSide, serializeSide, resolveUrl, SideFormatError, newProject } from '../extension/lib/side.js';
import { runTest, analyzeBlocks, interpolate } from '../extension/lib/runner.js';
import { exportProject, exportTest, LANGUAGES } from '../extension/lib/export.js';
import { splitKeys, parseLocator } from '../extension/lib/commands.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const fixture = await readFile(path.join(ROOT, 'tests/fixtures/shop.side'), 'utf8');

test('parse and save keep every field, including unknown ones', () => {
  const p = parseSide(fixture);
  assert.equal(p.tests.length, 1);
  assert.equal(p.tests[0].commands.length, 24);
  assert.deepEqual(p['x-custom-field'], { kept: true });
  const again = parseSide(serializeSide(p));
  assert.deepEqual(again, p);
  assert.equal(JSON.parse(serializeSide(p)).tests[0].commands[3].comment, 'pick the paid plan');
});

test('parse explains bad files', () => {
  assert.throws(() => parseSide('not json'), SideFormatError);
  assert.throws(() => parseSide('{"name":"x"}'), /No "tests" list/);
  assert.throws(() => parseSide('[]'), /JSON object/);
  // BOM and missing ids/suites are tolerated
  const p = parseSide('﻿{"tests":[{"name":"a","commands":[{"command":"open","target":"/"}]}]}');
  assert.equal(p.suites.length, 1);
  assert.equal(p.suites[0].tests[0], p.tests[0].id);
  assert.equal(p.tests[0].commands[0].value, '');
});

test('open targets resolve against the base URL', () => {
  assert.equal(resolveUrl('/login', 'https://a.test/app'), 'https://a.test/login');
  assert.equal(resolveUrl('https://b.test/x', 'https://a.test'), 'https://b.test/x');
  assert.equal(resolveUrl('page.html', 'https://a.test/app/'), 'https://a.test/app/page.html');
  assert.equal(resolveUrl('', 'https://a.test/app'), 'https://a.test/app');
});

test('locators and keys parse like .side files expect', () => {
  assert.deepEqual(parseLocator('id=x'), { type: 'id', value: 'x' });
  assert.deepEqual(parseLocator('//div[@a="b=c"]'), { type: 'xpath', value: '//div[@a="b=c"]' });
  assert.deepEqual(parseLocator('css=a[href="x=y"]'), { type: 'css', value: 'a[href="x=y"]' });
  assert.equal(parseLocator('link=Home').type, 'linkText');
  assert.deepEqual(splitKeys('ab${KEY_ENTER}c'), [{ text: 'ab' }, { key: 'Enter', name: 'ENTER' }, { text: 'c' }]);
  assert.equal(interpolate('${a}-${KEY_TAB}-${missing}', { a: 1 }), '1-${KEY_TAB}-${missing}');
});

// A fake page: element commands always pass; scripts are evaluated in node.
function fakeIO(overrides = {}) {
  const steps = [];
  const logs = [];
  return {
    steps, logs,
    open: async () => {},
    element: async (m) => (m.command === 'storeText' ? { ok: true, value: 'Pro' } : { ok: true }),
    script: async (code, args) => { try { return { value: new Function(code).apply(null, args) }; } catch (e) { return { error: e.message }; } },
    setWindowSize: async () => {},
    dialog: async () => ({ ok: true }),
    selectFrame: async () => ({ ok: true }),
    log: (l, t) => logs.push([l, t]),
    step: (id, i, s, n) => steps.push([i, s, n]),
    stopped: () => false,
    sleep: async () => {},
    ...overrides,
  };
}

test('runner: if/else, forEach, executeScript, store and assert', async () => {
  const p = parseSide(fixture);
  const io = fakeIO();
  const r = await runTest(p, p.tests[0], io);
  assert.equal(r.passed, true, JSON.stringify(io.logs));
  assert.equal(r.vars.sum, 6);
  assert.ok(io.logs.some(([l, t]) => l === 'echo' && t === 'paid plan: Pro'));
  // the else branch (step 12) never ran
  assert.ok(!io.steps.some(([i, s]) => i === 11 && s === 'running'));
  // disabled step is skipped
  assert.ok(io.steps.some(([i, s]) => i === 23 && s === 'skipped'));
});

const T = (cmds) => ({ id: 't', name: 't', commands: cmds.map(([command, target = '', value = '']) => ({ command, target, value, targets: [] })) });

test('runner: while, times, do/repeatIf and elseIf', async () => {
  const p = newProject();
  const t = T([
    ['executeScript', 'return 0', 'i'],
    ['while', '${i} < 3'], ['executeScript', 'return ${i} + 1', 'i'], ['end'],
    ['store', '', 'log'],
    ['times', '2'], ['executeScript', "return ${log} + 'x'", 'log'], ['end'],
    ['do'], ['executeScript', "return ${log} + 'y'", 'log'], ['repeatIf', '${log}.length < 5'],
    ['if', '${i} == 1'], ['store', 'one', 'r'], ['elseIf', '${i} == 3'], ['store', 'three', 'r'], ['else'], ['store', 'other', 'r'], ['end'],
    ['assert', 'i', '3'], ['assert', 'log', 'xxyyy'], ['assert', 'r', 'three'],
  ]);
  const r = await runTest(p, t, fakeIO());
  assert.equal(r.passed, true, r.error);
});

test('runner: verify continues, assert stops, run calls another test', async () => {
  const p = newProject();
  const helper = { id: 'h', name: 'login', commands: [{ command: 'store', target: 'yes', value: 'loggedIn', targets: [] }] };
  p.tests.push(helper);
  const t = T([['run', 'login'], ['verify', 'loggedIn', 'no'], ['assert', 'loggedIn', 'yes'], ['assert', 'loggedIn', 'nope'], ['echo', 'unreached']]);
  const io = fakeIO();
  const r = await runTest(p, t, io);
  assert.equal(r.passed, false);
  assert.equal(r.failedAt, 3);
  assert.ok(io.steps.some(([i, s]) => i === 1 && s === 'failed'));
  assert.ok(io.steps.some(([i, s]) => i === 2 && s === 'passed'));
  assert.ok(!io.logs.some(([l, t]) => t === 'unreached'));
});

test('runner reports broken blocks before running', async () => {
  assert.throws(() => analyzeBlocks(T([['if', 'true'], ['echo', 'x']]).commands), /never closed/);
  assert.throws(() => analyzeBlocks(T([['end']]).commands), /no matching/);
  assert.throws(() => analyzeBlocks(T([['else']]).commands), /not inside an if/);
  const r = await runTest(newProject(), T([['while', 'true']]), fakeIO());
  assert.equal(r.passed, false);
});

test('runner stops runaway loops', async () => {
  const r = await runTest(newProject(), T([['while', 'true'], ['echo', 'x'], ['end']]), fakeIO());
  assert.equal(r.passed, false);
  assert.match(r.error, /more than 1000/);
});

test('every exporter covers every command of the fixture or marks it TODO', () => {
  const p = parseSide(fixture);
  for (const lang of Object.keys(LANGUAGES)) {
    const code = exportTest(p, p.tests[0], lang);
    assert.ok(code.length > 200, lang);
    assert.ok(!/undefined|\[object Object\]/.test(code), `${lang} output contains undefined:\n${code}`);
  }
  const pw = exportTest(p, p.tests[0], 'playwright');
  assert.match(pw, /await page\.goto\('http:\/\/127\.0\.0\.1:0\/app\.html'\);/);
  assert.match(pw, /page\.locator\('\[data-testid="email"\]'\)\.first\(\)\.fill\('ada@example\.com'\)/);
  assert.match(pw, /selectOption\(\{ label: 'Pro' \}\)/);
  assert.match(pw, /getByRole\('link', \{ name: 'Settings', exact: true \}\)/);
  assert.match(pw, /\/\/ pick the paid plan/);
  assert.match(pw, /\/\/ \(disabled\) click \| id=gone/);
  assert.match(pw, /console\.log\(`paid plan: \$\{vars\['plan'\]\}`\);/);
});

test('exported Python compiles, exported JavaScript parses', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'tapeline-export-'));
  try {
    const p = parseSide(fixture);
    const corpus = [p];
    // Also run the export over the real-world .side corpus when it is present (see README, not committed).
    const real = '/tmp/side-fixtures-dl';
    if (existsSync(real)) {
      for (const f of (await readdir(real)).filter((f) => f.endsWith('.side'))) {
        try { corpus.push(parseSide(await readFile(path.join(real, f), 'utf8'))); } catch { /* not a .side project */ }
      }
    }
    let n = 0;
    for (const proj of corpus) {
      const py = path.join(dir, `t${n}.py`);
      await writeFile(py, exportProject(proj, 'python'));
      execFileSync('python3', ['-m', 'py_compile', py]);
      for (const [lang, ext] of [['webdriverjs', 'cjs'], ['cypress', 'cjs'], ['playwright', 'mjs']]) {
        let code = exportProject(proj, lang);
        if (lang === 'playwright') code = code.replaceAll(': Record<string, any>', '');
        const f = path.join(dir, `t${n}-${lang}.${ext}`);
        await writeFile(f, code);
        execFileSync(process.execPath, ['--check', f]);
      }
      n++;
    }
    console.log(`exported and syntax-checked ${n} projects`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
