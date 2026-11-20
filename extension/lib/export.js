// Exports a test to code for other frameworks. Pure functions: the extension, the converter web page and
// the unit tests all use this file.
//
//   exportTest(project, test, 'playwright' | 'python' | 'java' | 'webdriverjs' | 'cypress') -> string
//   exportProject(project, lang) -> one file with every test
//
// Every command either becomes code or a clearly marked TODO comment, so nothing is dropped silently.

import { parseLocator, splitKeys, isDisabled } from './commands.js';
import { resolveUrl } from './side.js';

export const LANGUAGES = {
  playwright: { label: 'Playwright Test (TypeScript)', ext: 'spec.ts' },
  python: { label: 'Python (Selenium WebDriver + pytest)', ext: 'py' },
  java: { label: 'Java (Selenium WebDriver + JUnit 5)', ext: 'java' },
  webdriverjs: { label: 'JavaScript (selenium-webdriver + Mocha)', ext: 'spec.js' },
  cypress: { label: 'Cypress (JavaScript)', ext: 'cy.js' },
};

// ---------- string helpers ----------

const jsQ = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r') + "'";
const javaQ = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"';
const pyQ = (s) => {
  const t = String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  return t.includes('"') && !t.includes("'") ? `'${t}'` : `"${t.replace(/"/g, '\\"')}"`;
};

const VAR_RE = /\$\{([A-Za-z_$][\w$]*)\}/g;
const hasVars = (s) => /\$\{(?!KEY_)[A-Za-z_$][\w$]*\}/.test(s);

// A string that may contain ${var}: returns an expression in the target language.
function strExpr(lang, s) {
  s = String(s ?? '');
  if (!hasVars(s)) return lang === 'python' ? pyQ(s) : lang === 'java' ? javaQ(s) : jsQ(s);
  const parts = [];
  let last = 0;
  for (const m of s.matchAll(VAR_RE)) {
    if (m[1].startsWith('KEY_')) continue;
    if (m.index > last) parts.push({ lit: s.slice(last, m.index) });
    parts.push({ v: m[1] });
    last = m.index + m[0].length;
  }
  if (last < s.length) parts.push({ lit: s.slice(last) });
  if (lang === 'python') {
    // Always double-quoted outside and single-quoted inside the braces: a backslash inside {} is a
    // syntax error before Python 3.12.
    const lit = (t) => t.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\{/g, '{{').replace(/\}/g, '}}');
    return 'f"' + parts.map((p) => (p.lit != null ? lit(p.lit) : `{vars['${p.v}']}`)).join('') + '"';
  }
  if (lang === 'java') return parts.map((p) => (p.lit != null ? javaQ(p.lit) : `vars.get(${javaQ(p.v)}).toString()`)).join(' + ');
  return '`' + parts.map((p) => (p.lit != null ? p.lit.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') : '${vars[' + jsQ(p.v) + ']}')).join('') + '`';
}

// JavaScript source with ${var} replaced by the variable value as a JS literal (used for conditions and scripts
// that run in the browser).
function scriptWithVars(lang, script) {
  if (!hasVars(script)) return { code: script, args: [] };
  const args = [];
  const code = script.replace(VAR_RE, (all, name) => {
    if (name.startsWith('KEY_')) return all;
    let i = args.indexOf(name);
    if (i < 0) { args.push(name); i = args.length - 1; }
    return `arguments[${i}]`;
  });
  return { code, args };
}

function cssAttr(name, value) {
  return `[${name}="${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
}

// Locator -> {css} | {xpath} | {link, partial}
function loc(target) {
  const l = parseLocator(target);
  switch (l.type) {
    case 'id': return { css: cssAttr('id', l.value), id: l.value };
    case 'name': return { css: cssAttr('name', l.value), name: l.value };
    case 'css': return { css: l.value };
    case 'xpath': return { xpath: l.value };
    case 'linkText': return { link: l.value };
    case 'partialLinkText': return { link: l.value, partial: true };
    default: return { css: l.value };
  }
}

function parseSize(s) {
  const m = /^\s*(\d+)\s*[x×,]\s*(\d+)\s*$/i.exec(s || '');
  return m ? [Number(m[1]), Number(m[2])] : null;
}

function selectOption(value) {
  const m = /^(label|value|index|id)=(.*)$/s.exec(value || '');
  return m ? { by: m[1], v: m[2] } : { by: 'label', v: value || '' };
}

// ---------- dialects ----------
// Each dialect turns one command into lines of code (without indentation). ctx.indent tracks blocks.

const pw = {
  loc(t) {
    const l = loc(t);
    if (l.link) return `page.getByRole('link', { name: ${jsQ(l.link)}${l.partial ? '' : ', exact: true'} })`;
    if (l.xpath) return `page.locator(${jsQ('xpath=' + l.xpath)})`;
    return `page.locator(${jsQ(l.css)})`;
  },
  s: (v) => strExpr('js', v),
  cmd(c, ctx) {
    const L = () => this.loc(interp(c.target));
    const s = (v) => this.s(v);
    switch (c.command) {
      case 'open': return [`await page.goto(${s(resolveUrl(c.target, ctx.baseUrl))});`];
      case 'click': case 'clickAt': return [`await ${L()}.first().click();`];
      case 'doubleClick': case 'doubleClickAt': return [`await ${L()}.first().dblclick();`];
      case 'type': return [`await ${L()}.first().fill(${s(c.value)});`];
      case 'editContent': return [`await ${L()}.first().evaluate((el, t) => { el.textContent = t; }, ${s(c.value)});`];
      case 'sendKeys': return splitKeys(c.value).map((p) => p.key ? `await ${L()}.first().press(${jsQ(p.key)});` : `await ${L()}.first().pressSequentially(${s(p.text)});`);
      case 'select': case 'addSelection': {
        const o = selectOption(c.value);
        const arg = o.by === 'index' ? `{ index: ${Number(o.v) || 0} }` : o.by === 'value' ? `{ value: ${s(o.v)} }` : `{ label: ${s(o.v)} }`;
        return [`await ${L()}.first().selectOption(${arg});`];
      }
      case 'check': return [`await ${L()}.first().check();`];
      case 'uncheck': return [`await ${L()}.first().uncheck();`];
      case 'submit': return [`await ${L()}.first().evaluate((f) => f.requestSubmit());`];
      case 'mouseOver': case 'mouseMoveAt': return [`await ${L()}.first().hover();`];
      case 'mouseOut': return [`await page.mouse.move(0, 0);`];
      case 'mouseDown': case 'mouseDownAt': return [`await ${L()}.first().hover();`, `await page.mouse.down();`];
      case 'mouseUp': case 'mouseUpAt': return [`await ${L()}.first().hover();`, `await page.mouse.up();`];
      case 'pause': return [`await page.waitForTimeout(${Number(c.target || c.value) || 0});`];
      case 'setWindowSize': { const z = parseSize(c.target); return z ? [`await page.setViewportSize({ width: ${z[0]}, height: ${z[1]} });`] : null; }
      case 'store': return [`vars[${jsQ(c.value)}] = ${s(c.target)};`];
      case 'storeText': return [`vars[${jsQ(c.value)}] = await ${L()}.first().innerText();`];
      case 'storeValue': return [`vars[${jsQ(c.value)}] = await ${L()}.first().inputValue();`];
      case 'storeTitle': return [`vars[${jsQ(c.value || c.target)}] = await page.title();`];
      case 'storeAttribute': { const i = c.target.lastIndexOf('@'); return [`vars[${jsQ(c.value)}] = await ${this.loc(c.target.slice(0, i))}.first().getAttribute(${jsQ(c.target.slice(i + 1))});`]; }
      case 'storeXpathCount': return [`vars[${jsQ(c.value)}] = await page.locator(${jsQ('xpath=' + c.target)}).count();`];
      case 'storeElementCount': return [`vars[${jsQ(c.value)}] = await ${L()}.count();`];
      case 'echo': return [`console.log(${s(c.target)});`];
      case 'executeScript': case 'runScript': case 'executeAsyncScript': {
        const { code, args } = scriptWithVars('js', c.target);
        const call = `await page.evaluate((args) => { return (function () { ${code} }).apply(null, args); }, [${args.map((a) => `vars[${jsQ(a)}]`).join(', ')}])`;
        return [c.value && c.command !== 'runScript' ? `vars[${jsQ(c.value)}] = ${call};` : `${call};`];
      }
      case 'assert': case 'verify': return [`expect(String(vars[${jsQ(c.target)}])).toBe(${s(c.value)});`];
      case 'assertText': case 'verifyText': return [`await expect(${L()}.first()).toHaveText(${s(c.value)});`];
      case 'assertNotText': case 'verifyNotText': return [`await expect(${L()}.first()).not.toHaveText(${s(c.value)});`];
      case 'waitForText': return [`await expect(${L()}.first()).toHaveText(${s(c.value)});`];
      case 'assertTitle': case 'verifyTitle': return [`await expect(page).toHaveTitle(${s(c.target)});`];
      case 'assertValue': case 'verifyValue': return [`await expect(${L()}.first()).toHaveValue(${s(c.value)});`];
      case 'assertElementPresent': case 'verifyElementPresent': case 'waitForElementPresent': return [`await expect(${L()}.first()).toBeAttached();`];
      case 'assertElementNotPresent': case 'verifyElementNotPresent': case 'waitForElementNotPresent': return [`await expect(${L()}).toHaveCount(0);`];
      case 'waitForElementVisible': return [`await expect(${L()}.first()).toBeVisible();`];
      case 'waitForElementNotVisible': return [`await expect(${L()}.first()).toBeHidden();`];
      case 'assertChecked': case 'verifyChecked': return [`await expect(${L()}.first()).toBeChecked();`];
      case 'assertNotChecked': case 'verifyNotChecked': return [`await expect(${L()}.first()).not.toBeChecked();`];
      case 'assertEditable': case 'verifyEditable': case 'waitForElementEditable': return [`await expect(${L()}.first()).toBeEditable();`];
      case 'assertNotEditable': case 'verifyNotEditable': case 'waitForElementNotEditable': return [`await expect(${L()}.first()).not.toBeEditable();`];
      case 'assertSelectedValue': case 'verifySelectedValue': return [`await expect(${L()}.first()).toHaveValue(${s(c.value)});`];
      case 'assertNotSelectedValue': case 'verifyNotSelectedValue': return [`await expect(${L()}.first()).not.toHaveValue(${s(c.value)});`];
      case 'assertSelectedLabel': case 'verifySelectedLabel': return [`await expect(${L()}.first().locator('option:checked')).toHaveText(${s(c.value)});`];
      case 'if': return [`if (${this.cond(c.target)}) {`, IN];
      case 'elseIf': return [OUT, `} else if (${this.cond(c.target)}) {`, IN];
      case 'else': return [OUT, `} else {`, IN];
      case 'while': return [`while (${this.cond(c.target)}) {`, IN];
      case 'times': return [`for (let i${ctx.depth} = 0; i${ctx.depth} < ${Number(c.target) || 0}; i${ctx.depth}++) {`, IN];
      case 'forEach': return [`for (const item of vars[${jsQ(c.target)}]) {`, IN, `vars[${jsQ(c.value)}] = item;`];
      case 'do': return [`do {`, IN];
      case 'repeatIf': return [OUT, `} while (${this.cond(c.target)});`];
      case 'end': return [OUT, `}`];
      default: return null;
    }
  },
  cond(expr) {
    const { code, args } = scriptWithVars('js', expr);
    return `await page.evaluate((args) => (function () { return (${code}); }).apply(null, args), [${args.map((a) => `vars[${jsQ(a)}]`).join(', ')}])`;
  },
  comment: (t) => `// ${t}`,
  file(project, tests) {
    const out = [`// Exported from the .side project "${project.name}".`, `import { test, expect } from '@playwright/test';`, ''];
    for (const t of tests) {
      out.push(`test(${jsQ(t.name)}, async ({ page }) => {`, `  const vars: Record<string, any> = {};`);
      out.push(...t.lines.map((l) => '  ' + l), '});', '');
    }
    return out.join('\n');
  },
};

const IN = { indent: 1 };
const OPENERS = new Set(['if', 'while', 'times', 'forEach', 'do']);
const OUT = { indent: -1 };
const interp = (s) => s; // locators keep ${var} inside the string expression

function wdLoc(lang, t) {
  const l = loc(t);
  const by = lang === 'python' ? 'By.' : 'By.';
  if (lang === 'python') {
    if (l.id && !hasVars(l.id)) return `By.ID, ${pyQ(l.id)}`;
    if (l.name && !hasVars(l.name)) return `By.NAME, ${pyQ(l.name)}`;
    if (l.link) return `${l.partial ? 'By.PARTIAL_LINK_TEXT' : 'By.LINK_TEXT'}, ${strExpr('python', l.link)}`;
    if (l.xpath) return `By.XPATH, ${strExpr('python', l.xpath)}`;
    return `By.CSS_SELECTOR, ${strExpr('python', l.css)}`;
  }
  const q = (v) => strExpr(lang === 'java' ? 'java' : 'js', v);
  if (l.id && !hasVars(l.id)) return `${by}id(${q(l.id)})`;
  if (l.name && !hasVars(l.name)) return `${by}name(${q(l.name)})`;
  if (l.link) return `${by}${l.partial ? 'partialLinkText' : 'linkText'}(${q(l.link)})`;
  if (l.xpath) return `${by}xpath(${q(l.xpath)})`;
  return `${by}${lang === 'java' ? 'cssSelector' : 'css'}(${q(l.css)})`;
}

const py = {
  cmd(c, ctx) {
    const L = `${wdLoc('python', c.target)}`;
    const el = `driver.find_element(${L})`;
    const s = (v) => strExpr('python', v);
    const wait = (cond) => `WebDriverWait(driver, 10).until(${cond})`;
    switch (c.command) {
      case 'open': return [`driver.get(${s(resolveUrl(c.target, ctx.baseUrl))})`];
      case 'click': case 'clickAt': return [`${wait(`EC.element_to_be_clickable((${L}))`)}.click()`];
      case 'doubleClick': case 'doubleClickAt': return [`ActionChains(driver).double_click(${el}).perform()`];
      case 'type': return [`${el}.clear()`, `${el}.send_keys(${s(c.value)})`];
      case 'sendKeys': return [`${el}.send_keys(${splitKeys(c.value).map((p) => (p.key ? `Keys.${pyKey(p.name)}` : s(p.text))).join(', ')})`];
      case 'select': case 'addSelection': {
        const o = selectOption(c.value);
        const m = o.by === 'index' ? `select_by_index(${Number(o.v) || 0})` : o.by === 'value' ? `select_by_value(${s(o.v)})` : `select_by_visible_text(${s(o.v)})`;
        return [`Select(${el}).${m}`];
      }
      case 'check': return [`if not ${el}.is_selected():`, IN, `${el}.click()`, OUT];
      case 'uncheck': return [`if ${el}.is_selected():`, IN, `${el}.click()`, OUT];
      case 'submit': return [`${el}.submit()`];
      case 'mouseOver': case 'mouseMoveAt': return [`ActionChains(driver).move_to_element(${el}).perform()`];
      case 'mouseOut': return [`ActionChains(driver).move_to_element(driver.find_element(By.TAG_NAME, "body")).perform()`];
      case 'mouseDown': case 'mouseDownAt': return [`ActionChains(driver).move_to_element(${el}).click_and_hold().perform()`];
      case 'mouseUp': case 'mouseUpAt': return [`ActionChains(driver).move_to_element(${el}).release().perform()`];
      case 'pause': return [`time.sleep(${(Number(c.target || c.value) || 0) / 1000})`];
      case 'setWindowSize': { const z = parseSize(c.target); return z ? [`driver.set_window_size(${z[0]}, ${z[1]})`] : null; }
      case 'store': return [`vars[${pyQ(c.value)}] = ${s(c.target)}`];
      case 'storeText': return [`vars[${pyQ(c.value)}] = ${el}.text`];
      case 'storeValue': return [`vars[${pyQ(c.value)}] = ${el}.get_attribute("value")`];
      case 'storeTitle': return [`vars[${pyQ(c.value || c.target)}] = driver.title`];
      case 'storeAttribute': { const i = c.target.lastIndexOf('@'); return [`vars[${pyQ(c.value)}] = driver.find_element(${wdLoc('python', c.target.slice(0, i))}).get_attribute(${pyQ(c.target.slice(i + 1))})`]; }
      case 'storeXpathCount': return [`vars[${pyQ(c.value)}] = len(driver.find_elements(By.XPATH, ${s(c.target)}))`];
      case 'storeElementCount': return [`vars[${pyQ(c.value)}] = len(driver.find_elements(${L}))`];
      case 'echo': return [`print(${s(c.target)})`];
      case 'executeScript': case 'runScript': case 'executeAsyncScript': {
        const { code, args } = scriptWithVars('python', c.target);
        const call = `driver.execute_script(${pyQ(code)}${args.map((a) => `, vars[${pyQ(a)}]`).join('')})`;
        return [c.value && c.command !== 'runScript' ? `vars[${pyQ(c.value)}] = ${call}` : call];
      }
      case 'assert': case 'verify': return [`assert str(vars[${pyQ(c.target)}]) == ${s(c.value)}`];
      case 'assertText': case 'verifyText': return [`assert ${el}.text == ${s(c.value)}`];
      case 'assertNotText': case 'verifyNotText': return [`assert ${el}.text != ${s(c.value)}`];
      case 'waitForText': return [wait(`EC.text_to_be_present_in_element((${L}), ${s(c.value)})`)];
      case 'assertTitle': case 'verifyTitle': return [`assert driver.title == ${s(c.target)}`];
      case 'assertValue': case 'verifyValue': case 'assertSelectedValue': case 'verifySelectedValue': return [`assert ${el}.get_attribute("value") == ${s(c.value)}`];
      case 'assertNotSelectedValue': case 'verifyNotSelectedValue': return [`assert ${el}.get_attribute("value") != ${s(c.value)}`];
      case 'assertSelectedLabel': case 'verifySelectedLabel': return [`assert Select(${el}).first_selected_option.text == ${s(c.value)}`];
      case 'assertElementPresent': case 'verifyElementPresent': return [`assert len(driver.find_elements(${L})) > 0`];
      case 'assertElementNotPresent': case 'verifyElementNotPresent': return [`assert len(driver.find_elements(${L})) == 0`];
      case 'waitForElementPresent': return [wait(`EC.presence_of_element_located((${L}))`)];
      case 'waitForElementNotPresent': return [`WebDriverWait(driver, 10).until(lambda d: len(d.find_elements(${L})) == 0)`];
      case 'waitForElementVisible': return [wait(`EC.visibility_of_element_located((${L}))`)];
      case 'waitForElementNotVisible': return [wait(`EC.invisibility_of_element_located((${L}))`)];
      case 'waitForElementEditable': return [wait(`EC.element_to_be_clickable((${L}))`)];
      case 'assertChecked': case 'verifyChecked': return [`assert ${el}.is_selected()`];
      case 'assertNotChecked': case 'verifyNotChecked': return [`assert not ${el}.is_selected()`];
      case 'assertEditable': case 'verifyEditable': return [`assert ${el}.is_enabled() and ${el}.get_attribute("readonly") is None`];
      case 'assertNotEditable': case 'verifyNotEditable': return [`assert not (${el}.is_enabled() and ${el}.get_attribute("readonly") is None)`];
      case 'if': return [`if ${this.cond(c.target)}:`, IN];
      case 'elseIf': return [OUT, `elif ${this.cond(c.target)}:`, IN];
      case 'else': return [OUT, `else:`, IN];
      case 'while': return [`while ${this.cond(c.target)}:`, IN];
      case 'times': return [`for _ in range(${Number(c.target) || 0}):`, IN];
      case 'forEach': return [`for item in vars[${pyQ(c.target)}]:`, IN, `vars[${pyQ(c.value)}] = item`];
      case 'do': return [`while True:`, IN];
      case 'repeatIf': return [`if not ${this.cond(c.target)}:`, IN, 'break', OUT, OUT];
      case 'end': return [OUT];
      default: return null;
    }
  },
  cond(expr) {
    const { code, args } = scriptWithVars('python', expr);
    return `driver.execute_script(${pyQ('return (' + code + ')')}${args.map((a) => `, vars[${pyQ(a)}]`).join('')})`;
  },
  comment: (t) => `# ${t}`,
  file(project, tests) {
    const out = [
      `# Exported from the .side project "${project.name}".`,
      '# Run with: pip install selenium pytest && pytest this_file.py',
      'import time',
      'import pytest',
      'from selenium import webdriver',
      'from selenium.webdriver.common.by import By',
      'from selenium.webdriver.common.keys import Keys',
      'from selenium.webdriver.common.action_chains import ActionChains',
      'from selenium.webdriver.support.ui import Select, WebDriverWait',
      'from selenium.webdriver.support import expected_conditions as EC',
      '',
      '',
      '@pytest.fixture',
      'def driver():',
      '    d = webdriver.Chrome()',
      '    d.implicitly_wait(10)',
      '    yield d',
      '    d.quit()',
      '',
    ];
    for (const t of tests) {
      out.push('', `def test_${pyName(t.name)}(driver):`, '    vars = {}');
      out.push(...t.lines.map((l) => '    ' + l));
      if (!t.lines.length) out.push('    pass');
    }
    return out.join('\n') + '\n';
  },
};

function pyName(n) {
  return (String(n).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'test').replace(/^(\d)/, '_$1');
}
function camel(n, upper) {
  const w = String(n).replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  let s = w.map((x, i) => (i === 0 && !upper ? x[0].toLowerCase() : x[0].toUpperCase()) + x.slice(1)).join('') || 'untitled';
  if (/^\d/.test(s)) s = (upper ? 'T' : 't') + s;
  return s;
}
function pyKey(name) {
  const map = { RETURN: 'RETURN', ESC: 'ESCAPE', DEL: 'DELETE', BACK_SPACE: 'BACKSPACE', CTRL: 'CONTROL', COMMAND: 'COMMAND' };
  return map[name] || name;
}
function javaKey(name) {
  const map = { ESC: 'ESCAPE', DEL: 'DELETE', BACKSPACE: 'BACK_SPACE', CTRL: 'CONTROL', UP: 'ARROW_UP', DOWN: 'ARROW_DOWN', LEFT: 'ARROW_LEFT', RIGHT: 'ARROW_RIGHT' };
  return map[name] || name;
}

// Java and selenium-webdriver JS share most shapes.
function wdDialect(lang) {
  const java = lang === 'java';
  const q = (v) => strExpr(java ? 'java' : 'js', v);
  const aw = java ? '' : 'await ';
  const semi = ';';
  const el = (t) => `${aw}driver.findElement(${wdLoc(lang, t)})`;
  const elx = (t) => (java ? el(t) : `(${el(t)})`);
  const call = (t, m) => (java ? `${el(t)}.${m}` : `await (${el(t)}).${m}`);
  const v = (name) => (java ? `vars.get(${javaQ(name)})` : `vars[${jsQ(name)}]`);
  const setv = (name, expr) => (java ? `vars.put(${javaQ(name)}, ${expr});` : `vars[${jsQ(name)}] = ${expr};`);
  const assertEq = (a, b) => (java ? `assertEquals(${b}, ${a});` : `assert.strictEqual(${a}, ${b});`);
  const assertTrue = (a) => (java ? `assertTrue(${a});` : `assert.ok(${a});`);
  const keys = (val) => splitKeys(val).map((p) => (p.key ? `Key.${javaKey(p.name)}` : q(p.text))).join(', ');
  const script = (target) => {
    const { code, args } = scriptWithVars(lang, target);
    return `${java ? '((JavascriptExecutor) driver).executeScript' : 'await driver.executeScript'}(${java ? javaQ(code) : jsQ(code)}${args.map((a) => `, ${v(a)}`).join('')})`;
  };
  const d = {
    cmd(c, ctx) {
      const T = c.target;
      switch (c.command) {
        case 'open': return [`${aw}driver.get(${q(resolveUrl(T, ctx.baseUrl))})${semi}`];
        case 'click': case 'clickAt': return [`${call(T, 'click()')}${semi}`];
        case 'doubleClick': case 'doubleClickAt': return [java ? `new Actions(driver).doubleClick(${el(T)}).perform();` : `await driver.actions().doubleClick(${el(T)}).perform();`];
        case 'type': return [`${call(T, 'clear()')}${semi}`, `${call(T, `sendKeys(${q(c.value)})`)}${semi}`];
        case 'sendKeys': return [`${call(T, `sendKeys(${keys(c.value)})`)}${semi}`];
        case 'select': case 'addSelection': {
          const o = selectOption(c.value);
          if (java) {
            const m = o.by === 'index' ? `selectByIndex(${Number(o.v) || 0})` : o.by === 'value' ? `selectByValue(${q(o.v)})` : `selectByVisibleText(${q(o.v)})`;
            return [`new Select(${el(T)}).${m};`];
          }
          const css = o.by === 'index' ? `option:nth-of-type(${(Number(o.v) || 0) + 1})` : null;
          if (css) return [`await (await driver.findElement(${wdLoc(lang, T)})).findElement(By.css(${jsQ(css)})).click();`];
          const xp = o.by === 'value' ? `.//option[@value=${xpLit(o.v)}]` : `.//option[normalize-space(.)=${xpLit(o.v)}]`;
          return [`await (await driver.findElement(${wdLoc(lang, T)})).findElement(By.xpath(${jsQ(xp)})).click();`];
        }
        case 'check': return java ? [`if (!${el(T)}.isSelected()) {`, IN, `${el(T)}.click();`, OUT, '}'] : [`if (!(${call(T, 'isSelected()')})) {`, IN, `${call(T, 'click()')};`, OUT, '}'];
        case 'uncheck': return java ? [`if (${el(T)}.isSelected()) {`, IN, `${el(T)}.click();`, OUT, '}'] : [`if (${call(T, 'isSelected()')}) {`, IN, `${call(T, 'click()')};`, OUT, '}'];
        case 'submit': return [`${call(T, 'submit()')}${semi}`];
        case 'mouseOver': case 'mouseMoveAt': return [java ? `new Actions(driver).moveToElement(${el(T)}).perform();` : `await driver.actions().move({ origin: ${el(T)} }).perform();`];
        case 'mouseOut': return [java ? `new Actions(driver).moveToElement(driver.findElement(By.tagName("body")), 0, 0).perform();` : `await driver.actions().move({ x: 0, y: 0 }).perform();`];
        case 'pause': return [java ? `Thread.sleep(${Number(T || c.value) || 0});` : `await driver.sleep(${Number(T || c.value) || 0});`];
        case 'setWindowSize': { const z = parseSize(T); return z ? [java ? `driver.manage().window().setSize(new Dimension(${z[0]}, ${z[1]}));` : `await driver.manage().window().setRect({ width: ${z[0]}, height: ${z[1]} });`] : null; }
        case 'store': return [setv(c.value, q(T))];
        case 'storeText': return [setv(c.value, call(T, 'getText()'))];
        case 'storeValue': return [setv(c.value, call(T, 'getAttribute("value")'))];
        case 'storeTitle': return [setv(c.value || T, `${aw}driver.getTitle()`)];
        case 'echo': return [java ? `System.out.println(${q(T)});` : `console.log(${q(T)});`];
        case 'executeScript': case 'runScript': case 'executeAsyncScript':
          return [c.value && c.command !== 'runScript' ? setv(c.value, script(T)) : `${script(T)};`];
        case 'assert': case 'verify': return [assertEq(java ? `${v(T)}.toString()` : `String(${v(T)})`, q(c.value))];
        case 'assertText': case 'verifyText': return [assertEq(call(T, 'getText()'), q(c.value))];
        case 'assertTitle': case 'verifyTitle': return [assertEq(`${aw}driver.getTitle()`, q(T))];
        case 'assertValue': case 'verifyValue': case 'assertSelectedValue': case 'verifySelectedValue': return [assertEq(call(T, 'getAttribute("value")'), q(c.value))];
        case 'assertElementPresent': case 'verifyElementPresent': case 'waitForElementPresent': return [assertTrue(`(${aw}driver.findElements(${wdLoc(lang, T)}))${java ? '.size()' : '.length'} > 0`)];
        case 'assertElementNotPresent': case 'verifyElementNotPresent': return [assertTrue(`(${aw}driver.findElements(${wdLoc(lang, T)}))${java ? '.size()' : '.length'} == 0`)];
        case 'assertChecked': case 'verifyChecked': return [assertTrue(call(T, 'isSelected()'))];
        case 'assertNotChecked': case 'verifyNotChecked': return [assertTrue(java ? `!${call(T, 'isSelected()')}` : `!(${call(T, 'isSelected()')})`)];
        case 'waitForElementVisible': return [java ? `new WebDriverWait(driver, Duration.ofSeconds(10)).until(ExpectedConditions.visibilityOfElementLocated(${wdLoc(lang, T)}));` : `await driver.wait(until.elementIsVisible(await driver.findElement(${wdLoc(lang, T)})), 10000);`];
        case 'if': return [`if (${this.cond(T)}) {`, IN];
        case 'elseIf': return [OUT, `} else if (${this.cond(T)}) {`, IN];
        case 'else': return [OUT, '} else {', IN];
        case 'while': return [`while (${this.cond(T)}) {`, IN];
        case 'times': return [`for (int i${ctx.depth} = 0; i${ctx.depth} < ${Number(T) || 0}; i${ctx.depth}++) {`.replace('int ', java ? 'int ' : 'let '), IN];
        case 'forEach': return [java ? `for (Object item : (List<?>) vars.get(${javaQ(T)})) {` : `for (const item of vars[${jsQ(T)}]) {`, IN, setv(c.value, 'item')];
        case 'do': return ['do {', IN];
        case 'repeatIf': return [OUT, `} while (${this.cond(T)});`];
        case 'end': return [OUT, '}'];
        default: return null;
      }
    },
    cond(expr) {
      const { code, args } = scriptWithVars(lang, expr);
      const src = 'return (' + code + ')';
      return java
        ? `(Boolean) ((JavascriptExecutor) driver).executeScript(${javaQ(src)}${args.map((a) => `, ${v(a)}`).join('')})`
        : `await driver.executeScript(${jsQ(src)}${args.map((a) => `, ${v(a)}`).join('')})`;
    },
    comment: (t) => `// ${t}`,
    file(project, tests) {
      if (java) {
        const cls = camel(project.name, true) + 'Test';
        const out = [
          `// Exported from the .side project "${project.name}".`,
          'import java.time.Duration;',
          'import java.util.*;',
          'import org.junit.jupiter.api.*;',
          'import static org.junit.jupiter.api.Assertions.*;',
          'import org.openqa.selenium.*;',
          'import org.openqa.selenium.chrome.ChromeDriver;',
          'import org.openqa.selenium.interactions.Actions;',
          'import org.openqa.selenium.support.ui.*;',
          '',
          `public class ${cls} {`,
          '  private WebDriver driver;',
          '  private Map<String, Object> vars;',
          '',
          '  @BeforeEach',
          '  public void setUp() {',
          '    driver = new ChromeDriver();',
          '    driver.manage().timeouts().implicitlyWait(Duration.ofSeconds(10));',
          '    vars = new HashMap<>();',
          '  }',
          '',
          '  @AfterEach',
          '  public void tearDown() {',
          '    driver.quit();',
          '  }',
        ];
        for (const t of tests) {
          out.push('', '  @Test', `  public void ${camel(t.name)}() throws Exception {`, ...t.lines.map((l) => '    ' + l), '  }');
        }
        out.push('}', '');
        return out.join('\n');
      }
      const out = [
        `// Exported from the .side project "${project.name}".`,
        '// Run with: npm i selenium-webdriver mocha && npx mocha this_file.spec.js',
        "const { Builder, By, Key, until } = require('selenium-webdriver');",
        "const assert = require('assert');",
        '',
        `describe(${jsQ(project.name)}, function () {`,
        '  this.timeout(60000);',
        '  let driver;',
        '  let vars;',
        '  beforeEach(async function () {',
        "    driver = await new Builder().forBrowser('chrome').build();",
        '    await driver.manage().setTimeouts({ implicit: 10000 });',
        '    vars = {};',
        '  });',
        '  afterEach(async function () {',
        '    await driver.quit();',
        '  });',
      ];
      for (const t of tests) out.push('', `  it(${jsQ(t.name)}, async function () {`, ...t.lines.map((l) => '    ' + l), '  });');
      out.push('});', '');
      return out.join('\n');
    },
  };
  return d;
}

function xpLit(s) {
  s = String(s);
  if (!s.includes("'")) return `'${s}'`;
  if (!s.includes('"')) return `"${s}"`;
  return 'concat(' + s.split("'").map((p) => `'${p}'`).join(`, "'", `) + ')';
}

const cy = {
  get(t) {
    const l = loc(t);
    if (l.link) return l.partial ? `cy.contains('a', ${jsQ(l.link)})` : `cy.contains('a', new RegExp('^\\\\s*' + Cypress._.escapeRegExp(${jsQ(l.link)}) + '\\\\s*$'))`;
    if (l.xpath) return `cy.xpath(${strExpr('js', l.xpath)})`;
    return `cy.get(${strExpr('js', l.css)})`;
  },
  cmd(c, ctx) {
    const G = () => this.get(c.target);
    const s = (v) => strExpr('js', v);
    switch (c.command) {
      case 'open': return [`cy.visit(${s(resolveUrl(c.target, ctx.baseUrl))});`];
      case 'click': case 'clickAt': return [`${G()}.first().click();`];
      case 'doubleClick': case 'doubleClickAt': return [`${G()}.first().dblclick();`];
      case 'type': return [`${G()}.first().clear().type(${s(c.value)});`];
      case 'sendKeys': return [`${G()}.first().type(${jsQ(splitKeys(c.value).map((p) => (p.key ? `{${cyKey(p.key)}}` : p.text.replace(/\{/g, '{{}'))).join(''))});`];
      case 'select': case 'addSelection': { const o = selectOption(c.value); return [`${G()}.first().select(${o.by === 'index' ? Number(o.v) || 0 : s(o.v)});`]; }
      case 'check': return [`${G()}.first().check();`];
      case 'uncheck': return [`${G()}.first().uncheck();`];
      case 'submit': return [`${G()}.first().submit();`];
      case 'mouseOver': return [`${G()}.first().trigger('mouseover');`];
      case 'mouseOut': return [`${G()}.first().trigger('mouseout');`];
      case 'mouseDown': case 'mouseDownAt': return [`${G()}.first().trigger('mousedown');`];
      case 'mouseUp': case 'mouseUpAt': return [`${G()}.first().trigger('mouseup');`];
      case 'pause': return [`cy.wait(${Number(c.target || c.value) || 0});`];
      case 'setWindowSize': { const z = parseSize(c.target); return z ? [`cy.viewport(${z[0]}, ${z[1]});`] : null; }
      case 'echo': return [`cy.log(${s(c.target)});`];
      case 'assertText': case 'verifyText': case 'waitForText': return [`${G()}.first().invoke('text').then((t) => expect(t.trim()).to.equal(${s(c.value)}));`];
      case 'assertTitle': case 'verifyTitle': return [`cy.title().should('eq', ${s(c.target)});`];
      case 'assertValue': case 'verifyValue': case 'assertSelectedValue': case 'verifySelectedValue': return [`${G()}.first().should('have.value', ${s(c.value)});`];
      case 'assertElementPresent': case 'verifyElementPresent': case 'waitForElementPresent': return [`${G()}.should('exist');`];
      case 'assertElementNotPresent': case 'verifyElementNotPresent': case 'waitForElementNotPresent': return [`${G()}.should('not.exist');`];
      case 'waitForElementVisible': return [`${G()}.first().should('be.visible');`];
      case 'waitForElementNotVisible': return [`${G()}.first().should('not.be.visible');`];
      case 'assertChecked': case 'verifyChecked': return [`${G()}.first().should('be.checked');`];
      case 'assertNotChecked': case 'verifyNotChecked': return [`${G()}.first().should('not.be.checked');`];
      case 'assertEditable': case 'verifyEditable': case 'waitForElementEditable': return [`${G()}.first().should('be.enabled');`];
      default: return null;
    }
  },
  comment: (t) => `// ${t}`,
  file(project, tests) {
    const out = [`// Exported from the .side project "${project.name}".`, '// XPath locators need the cypress-xpath plugin.', '', `describe(${jsQ(project.name)}, () => {`];
    for (const t of tests) out.push(`  it(${jsQ(t.name)}, () => {`, ...t.lines.map((l) => '    ' + l), '  });', '');
    out.push('});', '');
    return out.join('\n');
  },
};
function cyKey(k) {
  return { Enter: 'enter', Tab: 'tab', Escape: 'esc', Backspace: 'backspace', Delete: 'del', ArrowUp: 'uparrow', ArrowDown: 'downarrow', ArrowLeft: 'leftarrow', ArrowRight: 'rightarrow', Home: 'home', End: 'end', PageUp: 'pageup', PageDown: 'pagedown', ' ': ' ' }[k] || k.toLowerCase();
}

const DIALECTS = { playwright: pw, python: py, java: wdDialect('java'), webdriverjs: wdDialect('webdriverjs'), cypress: cy };

function linesFor(project, test, lang, seen = new Set()) {
  const d = DIALECTS[lang];
  const ctx = { baseUrl: project.url, depth: 0 };
  const out = [];
  const blocks = []; // one entry per open block: was its opening step exported?
  let indent = 0;
  const push = (l) => out.push('  '.repeat(Math.max(0, indent)) + l);
  for (const c of test.commands) {
    if (!c.command) continue;
    if (c.comment) push(d.comment(c.comment));
    if (isDisabled(c)) { push(d.comment(`(disabled) ${c.command.slice(2)} | ${c.target} | ${c.value}`)); continue; }
    if (c.command === 'run') {
      const other = project.tests.find((t) => t.name === c.target);
      if (other && !seen.has(other.id)) {
        push(d.comment(`run "${c.target}"`));
        for (const l of linesFor(project, other, lang, new Set([...seen, test.id, other.id]))) push(l);
        continue;
      }
    }
    let res;
    const name = c.command;
    const closes = ['end', 'repeatIf', 'else', 'elseIf'].includes(name);
    // A block whose opening step could not be exported has its closing steps left as comments too.
    if (closes && blocks.length && !blocks[blocks.length - 1]) res = null;
    else { try { res = d.cmd(c, ctx); } catch { res = null; } }
    if (OPENERS.has(name)) blocks.push(!!res);
    if ((name === 'end' || name === 'repeatIf') && blocks.length) blocks.pop();
    if (!res) { push(d.comment(`TODO: not exported automatically: ${c.command} | ${c.target} | ${c.value}`)); continue; }
    for (const l of res) {
      if (l === IN) { indent++; ctx.depth++; } else if (l === OUT) { indent--; ctx.depth--; } else push(l);
    }
  }
  return out;
}

export function exportTests(project, tests, lang) {
  const d = DIALECTS[lang];
  if (!d) throw new Error(`Unknown export language: ${lang}`);
  return d.file(project, tests.map((t) => ({ name: t.name, lines: linesFor(project, t, lang) })));
}

export function exportTest(project, test, lang) {
  return exportTests(project, [test], lang);
}

export function exportProject(project, lang) {
  return exportTests(project, project.tests, lang);
}

export function exportFileName(project, test, lang) {
  const base = test ? test.name : project.name;
  if (lang === 'java') return camel(project.name, true) + 'Test.java';
  if (lang === 'python') return `test_${pyName(base)}.py`;
  return `${pyName(base).replace(/_/g, '-')}.${LANGUAGES[lang].ext}`;
}
