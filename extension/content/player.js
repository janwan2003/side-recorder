// Tapeline player, injected into the page under test. Runs one element command at a time for the editor:
// finds the element (waiting for it, falling back to the step's other recorded locators), acts, checks.
(() => {
  if (window.__tapelinePlayer) return;
  window.__tapelinePlayer = true;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const text = (el) => (el.innerText ?? el.textContent ?? '').replace(/[ \t\r\n ]+/g, ' ').trim();
  const KEYS = {
    ENTER: 'Enter', RETURN: 'Enter', TAB: 'Tab', ESC: 'Escape', ESCAPE: 'Escape', BACKSPACE: 'Backspace', BACK_SPACE: 'Backspace',
    DELETE: 'Delete', DEL: 'Delete', SPACE: ' ', UP: 'ArrowUp', DOWN: 'ArrowDown', LEFT: 'ArrowLeft', RIGHT: 'ArrowRight',
    ARROW_UP: 'ArrowUp', ARROW_DOWN: 'ArrowDown', ARROW_LEFT: 'ArrowLeft', ARROW_RIGHT: 'ArrowRight', HOME: 'Home', END: 'End',
    PAGE_UP: 'PageUp', PAGE_DOWN: 'PageDown', SHIFT: 'Shift', CONTROL: 'Control', CTRL: 'Control', ALT: 'Alt', META: 'Meta',
  };

  class Fail extends Error {}

  function findAll(locator) {
    const t = String(locator || '').trim();
    let type = 'css', value = t;
    const m = /^(id|name|css|xpath|linkText|link|partialLinkText|identifier)=([\s\S]*)$/.exec(t);
    if (m) { type = m[1]; value = m[2]; } else if (t.startsWith('//') || t.startsWith('(//')) type = 'xpath';
    try {
      switch (type) {
        case 'id': case 'identifier': { const el = document.getElementById(value); return el ? [el] : type === 'identifier' ? [...document.getElementsByName(value)] : []; }
        case 'name': return [...document.getElementsByName(value)];
        case 'xpath': {
          const r = document.evaluate(value, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
          const out = [];
          for (let i = 0; i < r.snapshotLength; i++) if (r.snapshotItem(i).nodeType === 1) out.push(r.snapshotItem(i));
          return out;
        }
        case 'linkText': case 'link': return [...document.querySelectorAll('a')].filter((a) => text(a) === value.trim());
        case 'partialLinkText': return [...document.querySelectorAll('a')].filter((a) => text(a).includes(value.trim()));
        default: return [...document.querySelectorAll(value)];
      }
    } catch (e) {
      throw new Fail(`Invalid locator "${t}": ${e.message}`);
    }
  }

  const visible = (el) => {
    if (!el.isConnected) return false;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0 || el.getClientRects().length > 0;
  };
  const editable = (el) => !el.disabled && !el.readOnly && (el.matches?.('input, textarea, select') || el.isContentEditable);

  // Waits for an element matching the step's locator. After the first second, also tries the other
  // recorded locators, in order, so a changed id or class does not fail the step.
  async function find(msg, { needVisible = false } = {}) {
    const start = Date.now();
    const deadline = start + msg.timeout;
    const alts = (msg.targets || []).map((t) => t[0]).filter((t) => t && t !== msg.target);
    let lastErr = null;
    for (;;) {
      const tryOne = (loc) => {
        const els = findAll(loc);
        const el = needVisible ? els.find(visible) : els[0];
        return el || null;
      };
      let el = tryOne(msg.target);
      if (el) return { el };
      if (Date.now() - start > 1000) {
        for (const alt of alts) {
          try { el = tryOne(alt); } catch (e) { lastErr = e; continue; }
          if (el) return { el, fallback: alt };
        }
      }
      if (Date.now() > deadline) {
        const n = findAll(msg.target).length;
        if (n && needVisible) throw new Fail(`Element ${msg.target} exists but is not visible.`);
        throw new Fail(`Element not found: ${msg.target}${alts.length ? ` (also tried ${alts.length} other recorded locator${alts.length > 1 ? 's' : ''})` : ''}.` + (lastErr ? ` ${lastErr.message}` : ''));
      }
      await sleep(100);
    }
  }

  function mouse(el, type, opts = {}) {
    const r = el.getBoundingClientRect();
    const init = { bubbles: true, cancelable: true, composed: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0, buttons: type.endsWith('down') ? 1 : 0, ...opts };
    const Ctor = type.startsWith('pointer') ? PointerEvent : MouseEvent;
    return el.dispatchEvent(new Ctor(type, { pointerId: 1, pointerType: 'mouse', isPrimary: true, ...init }));
  }

  function realClick(el, double) {
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    mouse(el, 'pointerover'); mouse(el, 'mouseover');
    mouse(el, 'pointerdown');
    if (mouse(el, 'mousedown') && el.focus) el.focus({ preventScroll: true });
    mouse(el, 'pointerup'); mouse(el, 'mouseup');
    el.click();
    if (double) { mouse(el, 'mousedown'); mouse(el, 'mouseup'); el.click(); mouse(el, 'dblclick', { detail: 2 }); }
  }

  function setValue(el, value) {
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    el.focus?.({ preventScroll: true });
    if (el.isContentEditable) {
      el.textContent = value;
    } else {
      // Use the prototype setter so frameworks that track the value (React) see the change.
      const proto = el.localName === 'textarea' ? HTMLTextAreaElement.prototype : el.localName === 'select' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(el, value); else el.value = value;
    }
    el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: value }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function key(el, k) {
    const init = { key: k, code: k.length === 1 ? 'Key' + k.toUpperCase() : k, bubbles: true, cancelable: true, composed: true };
    if (k === 'Enter') Object.assign(init, { keyCode: 13, which: 13 });
    const proceed = el.dispatchEvent(new KeyboardEvent('keydown', init));
    if (proceed && k.length === 1) el.dispatchEvent(new KeyboardEvent('keypress', init));
    if (proceed) {
      if (k.length === 1) {
        if (!document.execCommand('insertText', false, k) && 'value' in el) setValue(el, el.value + k);
      } else if (k === 'Backspace') document.execCommand('delete');
      else if (k === 'Enter') {
        if (el.localName === 'textarea' || el.isContentEditable) document.execCommand('insertLineBreak');
        else if (el.form && el.localName === 'input') {
          const btn = el.form.querySelector('button:not([type]), button[type=submit], input[type=submit]');
          if (btn) btn.click(); else el.form.requestSubmit();
        }
      } else if (k === 'Tab') {
        const f = [...document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && visible(x));
        const i = f.indexOf(el);
        f[(i + 1) % f.length]?.focus();
      }
    }
    el.dispatchEvent(new KeyboardEvent('keyup', init));
  }

  function sendKeys(el, value) {
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    el.focus?.({ preventScroll: true });
    const re = /\$\{KEY_([A-Z0-9_]+)\}/g;
    let last = 0, m;
    const typeText = (s) => { for (const ch of s) key(document.activeElement || el, ch); };
    while ((m = re.exec(value))) {
      typeText(value.slice(last, m.index));
      key(document.activeElement || el, KEYS[m[1]] || m[1]);
      last = re.lastIndex;
    }
    typeText(value.slice(last));
  }

  function pickOption(sel, spec) {
    const m = /^(label|value|index|id)=([\s\S]*)$/.exec(spec);
    const by = m ? m[1] : 'label';
    const v = m ? m[2] : spec;
    const opts = [...sel.options];
    let o;
    if (by === 'value') o = opts.find((x) => x.value === v);
    else if (by === 'index') o = opts[Number(v)];
    else if (by === 'id') o = opts.find((x) => x.id === v);
    else {
      o = opts.find((x) => x.text.trim() === v.trim());
      if (!o && /^regexp:/.test(v)) { const r = new RegExp(v.slice(7)); o = opts.find((x) => r.test(x.text)); }
      if (!o && /^glob:/.test(v)) o = opts.find((x) => globMatch(v.slice(5), x.text.trim()));
    }
    if (!o) throw new Fail(`No option ${spec} in ${sel.localName}. Options: ${opts.slice(0, 8).map((x) => `"${x.text.trim()}"`).join(', ')}${opts.length > 8 ? ', ...' : ''}`);
    return o;
  }

  function globMatch(pattern, s) {
    const re = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 's');
    return re.test(s);
  }
  // Text matching as .side tests expect: exact by default, glob:, regexp:, exact: prefixes.
  function textMatch(expected, actual) {
    if (expected.startsWith('regexp:')) return new RegExp(expected.slice(7)).test(actual);
    if (expected.startsWith('regexpi:')) return new RegExp(expected.slice(8), 'i').test(actual);
    if (expected.startsWith('glob:')) return globMatch(expected.slice(5), actual);
    if (expected.startsWith('exact:')) return expected.slice(6) === actual;
    return expected.trim() === actual.trim();
  }

  async function waitUntil(fn, timeout, what) {
    const deadline = Date.now() + timeout;
    for (;;) {
      if (await fn()) return;
      if (Date.now() > deadline) throw new Fail(`Timed out after ${timeout} ms waiting for ${what}.`);
      await sleep(100);
    }
  }

  async function run(msg) {
    const { command, value } = msg;
    const base = command.replace(/^verify/, 'assert');
    const fallbackNote = (r) => (r.fallback ? { fallback: r.fallback } : {});
    const offset = (v) => { const [x, y] = String(v || '').split(',').map(Number); return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null; };

    switch (base) {
      case 'click': case 'clickAt': case 'doubleClick': case 'doubleClickAt': {
        const r = await find(msg, { needVisible: true });
        if (r.el.disabled) await waitUntil(() => !r.el.disabled, msg.timeout, `${msg.target} to be enabled`);
        const o = command.endsWith('At') ? offset(value) : null;
        if (o) { /* offsets are relative to the element's top-left; the click still goes to the element */ }
        realClick(r.el, command.startsWith('double'));
        return fallbackNote(r);
      }
      case 'check': case 'uncheck': {
        const r = await find(msg);
        if (r.el.checked !== (base === 'check')) realClick(r.el);
        return fallbackNote(r);
      }
      case 'type': case 'editContent': {
        const r = await find(msg);
        if (r.el.localName === 'input' && r.el.type === 'file') throw new Fail('A file input cannot be filled from a test in the browser. Upload steps need a WebDriver or Playwright run.');
        setValue(r.el, value);
        return fallbackNote(r);
      }
      case 'sendKeys': {
        const r = await find(msg);
        sendKeys(r.el, value);
        return fallbackNote(r);
      }
      case 'select': case 'addSelection': case 'removeSelection': {
        const r = await find(msg);
        const sel = r.el.localName === 'select' ? r.el : r.el.closest('select');
        if (!sel) throw new Fail(`${msg.target} is not a drop-down.`);
        const o = pickOption(sel, value);
        if (base === 'select') { sel.value = o.value; o.selected = true; } else o.selected = base === 'addSelection';
        sel.dispatchEvent(new Event('input', { bubbles: true }));
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return fallbackNote(r);
      }
      case 'submit': {
        const r = await find(msg);
        const f = r.el.localName === 'form' ? r.el : r.el.form || r.el.closest('form');
        if (!f) throw new Fail(`${msg.target} is not in a form.`);
        f.requestSubmit();
        return fallbackNote(r);
      }
      case 'mouseOver': case 'mouseMoveAt': {
        const r = await find(msg);
        r.el.scrollIntoView({ block: 'center', behavior: 'instant' });
        for (const t of ['pointerover', 'pointerenter', 'mouseover', 'mouseenter', 'pointermove', 'mousemove']) mouse(r.el, t, { bubbles: !t.endsWith('enter') });
        return fallbackNote(r);
      }
      case 'mouseOut': {
        const r = await find(msg);
        for (const t of ['pointerout', 'pointerleave', 'mouseout', 'mouseleave']) mouse(r.el, t, { bubbles: !t.endsWith('leave') });
        return fallbackNote(r);
      }
      case 'mouseDown': case 'mouseDownAt': case 'mouseUp': case 'mouseUpAt': {
        const r = await find(msg);
        const down = base.startsWith('mouseDown');
        mouse(r.el, down ? 'pointerdown' : 'pointerup'); mouse(r.el, down ? 'mousedown' : 'mouseup');
        return fallbackNote(r);
      }
      case 'storeText': { const r = await find(msg); return { value: text(r.el), ...fallbackNote(r) }; }
      case 'storeValue': { const r = await find(msg); return { value: r.el.value ?? '', ...fallbackNote(r) }; }
      case 'storeAttribute': {
        const i = msg.target.lastIndexOf('@');
        const r = await find({ ...msg, target: msg.target.slice(0, i), targets: [] });
        return { value: r.el.getAttribute(msg.target.slice(i + 1)) };
      }
      case 'storeXpathCount': return { value: findAll('xpath=' + msg.target.replace(/^xpath=/, '')).length };
      case 'storeElementCount': return { value: findAll(msg.target).length };
      case 'storeTitle': return { value: document.title };
      case 'assertTitle': {
        if (!textMatch(msg.target, document.title)) throw new Fail(`Title is "${document.title}", expected "${msg.target}".`);
        return {};
      }
      case 'assertText': case 'assertNotText': case 'waitForText': {
        const r = await find(msg);
        if (base === 'waitForText') { await waitUntil(() => textMatch(value, text(r.el)), Number(msg.timeout), `text "${value}"`); return fallbackNote(r); }
        const ok = textMatch(value, text(r.el));
        if (base === 'assertText' && !ok) throw new Fail(`Text is "${text(r.el).slice(0, 200)}", expected "${value}".`);
        if (base === 'assertNotText' && ok) throw new Fail(`Text is "${value}", expected something else.`);
        return fallbackNote(r);
      }
      case 'assertValue': case 'assertSelectedValue': case 'assertNotSelectedValue': {
        const r = await find(msg);
        const ok = textMatch(value, String(r.el.value ?? ''));
        if (base !== 'assertNotSelectedValue' && !ok) throw new Fail(`Value is "${r.el.value}", expected "${value}".`);
        if (base === 'assertNotSelectedValue' && ok) throw new Fail(`Value is "${value}", expected something else.`);
        return fallbackNote(r);
      }
      case 'assertSelectedLabel': {
        const r = await find(msg);
        const label = r.el.selectedOptions?.[0]?.text.trim() ?? '';
        if (!textMatch(value, label)) throw new Fail(`Selected label is "${label}", expected "${value}".`);
        return fallbackNote(r);
      }
      case 'assertElementPresent': { const r = await find(msg); return fallbackNote(r); }
      case 'assertElementNotPresent': {
        if (findAll(msg.target).length) throw new Fail(`Element ${msg.target} is present.`);
        return {};
      }
      case 'assertChecked': case 'assertNotChecked': {
        const r = await find(msg);
        if (!!r.el.checked !== (base === 'assertChecked')) throw new Fail(`${msg.target} is ${r.el.checked ? '' : 'not '}checked.`);
        return fallbackNote(r);
      }
      case 'assertEditable': case 'assertNotEditable': {
        const r = await find(msg);
        if (editable(r.el) !== (base === 'assertEditable')) throw new Fail(`${msg.target} is ${editable(r.el) ? '' : 'not '}editable.`);
        return fallbackNote(r);
      }
      case 'waitForElementPresent': await waitUntil(() => findAll(msg.target).length > 0, msg.timeout, `${msg.target} to be present`); return {};
      case 'waitForElementNotPresent': await waitUntil(() => findAll(msg.target).length === 0, msg.timeout, `${msg.target} to be gone`); return {};
      case 'waitForElementVisible': await waitUntil(() => findAll(msg.target).some(visible), msg.timeout, `${msg.target} to be visible`); return {};
      case 'waitForElementNotVisible': await waitUntil(() => !findAll(msg.target).some(visible), msg.timeout, `${msg.target} to be hidden`); return {};
      case 'waitForElementEditable': await waitUntil(() => findAll(msg.target).some(editable), msg.timeout, `${msg.target} to be editable`); return {};
      case 'waitForElementNotEditable': await waitUntil(() => { const e = findAll(msg.target)[0]; return e && !editable(e); }, msg.timeout, `${msg.target} to be read-only`); return {};
      case 'highlight': {
        const r = await find({ ...msg, timeout: 1500 });
        r.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        const old = r.el.style.outline;
        r.el.style.outline = '3px solid #0e7490';
        setTimeout(() => { r.el.style.outline = old; }, 1500);
        return { count: findAll(msg.target).length, ...fallbackNote(r) };
      }
      default:
        throw new Fail(`The command "${command}" is not supported in replay.`);
    }
  }

  // Assertions retry for up to 3 seconds before failing, so text that appears just after a page load
  // or a request does not fail the test. A failing assertion still reports the last mismatch.
  const RETRY = /^(assert|verify)(Text|NotText|Title|Value|SelectedValue|NotSelectedValue|SelectedLabel|Checked|NotChecked|Editable|NotEditable|ElementNotPresent)$/;
  async function runWithRetry(msg) {
    if (!RETRY.test(msg.command)) return run(msg);
    const deadline = Date.now() + Math.min(3000, msg.timeout || 3000);
    for (;;) {
      try { return await run(msg); } catch (e) {
        if (!(e instanceof Fail) || Date.now() > deadline) throw e;
      }
      await sleep(150);
    }
  }

  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (msg?.type === 'tapeline:ping') { reply({ ok: true }); return; }
    if (msg?.type !== 'tapeline:exec') return;
    runWithRetry(msg).then(
      (r) => reply({ ok: true, ...r }),
      (e) => reply({ ok: false, error: e instanceof Fail ? e.message : `${e.name}: ${e.message}` }),
    );
    return true;
  });
})();
