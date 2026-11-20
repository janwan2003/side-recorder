// Tapeline recorder, injected into the page being recorded (all frames).
// Turns clicks, typing and selections into .side commands and sends them to the editor.
// Also serves "pick an element" for the step editor and the right-click assertion menu.
(() => {
  if (window.__tapelineRecorder) return;

  const TEST_ATTRS = ['data-testid', 'data-test-id', 'data-test', 'data-cy', 'data-qa', 'data-e2e'];
  let recording = false; // the editor sends tapeline:startRecording after injecting
  let picking = null;
  let lastContextTarget = null;
  let lastTyped = null; // { el, timer }

  const cssEsc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/[^\w-]/g, (c) => '\\' + c));
  const attrVal = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const xpLit = (s) => {
    s = String(s);
    if (!s.includes("'")) return `'${s}'`;
    if (!s.includes('"')) return `"${s}"`;
    return 'concat(' + s.split("'").map((p) => `'${p}'`).join(`, "'", `) + ')';
  };
  const unique = (sel) => { try { return document.querySelectorAll(sel).length === 1; } catch { return false; } };
  const xpCount = (xp) => {
    try { return document.evaluate(`count(${xp})`, document, null, XPathResult.NUMBER_TYPE, null).numberValue; } catch { return 0; }
  };
  // Ids and classes that frameworks generate change between builds; avoid them.
  const unstable = (s) => !s || /\d{4,}|^[a-f0-9-]{16,}$|^(ember|react|ng-|mat-|mui-|css-|jsx-|sc-|svelte-)|:r\w*:|__\w{5,}$/i.test(s);

  function cssPath(el) {
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      let part = node.localName;
      if (node.id && !unstable(node.id)) {
        part = '#' + cssEsc(node.id);
        parts.unshift(part);
        const sel = parts.join(' > ');
        if (unique(sel)) return sel;
        node = node.parentElement;
        continue;
      }
      const cls = [...node.classList].filter((c) => !unstable(c)).slice(0, 2);
      if (cls.length) part += '.' + cls.map(cssEsc).join('.');
      const parent = node.parentElement;
      if (parent) {
        const same = [...parent.children].filter((c) => c.localName === node.localName && (!cls.length || cls.every((k) => c.classList.contains(k))));
        if (same.length > 1) part += `:nth-child(${[...parent.children].indexOf(node) + 1})`;
      }
      parts.unshift(part);
      const sel = parts.join(' > ');
      if (unique(sel)) return sel;
      node = parent;
    }
    return parts.join(' > ');
  }

  function xpathPosition(el) {
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1) {
      const parent = node.parentNode;
      if (!parent || parent.nodeType !== 1) { parts.unshift(node.localName); break; }
      const same = [...parent.children].filter((c) => c.localName === node.localName);
      parts.unshift(same.length > 1 ? `${node.localName}[${same.indexOf(node) + 1}]` : node.localName);
      const xp = '//' + parts.join('/');
      if (xpCount(xp) === 1) return xp;
      node = parent;
    }
    return '/' + parts.join('/');
  }

  const visibleText = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();

  // Returns [[locator, strategy], ...], best first. The strategy names follow the .side convention.
  function locatorsFor(el) {
    const out = [];
    const add = (loc, strat) => { if (loc && !out.some((o) => o[0] === loc)) out.push([loc, strat]); };
    for (const a of TEST_ATTRS) {
      const v = el.getAttribute(a);
      if (v) { const sel = `[${a}="${attrVal(v)}"]`; if (unique(sel)) add('css=' + sel, 'css:data-attr'); }
    }
    if (el.id && !unstable(el.id) && unique('#' + cssEsc(el.id))) add('id=' + el.id, 'id');
    const name = el.getAttribute('name');
    if (name && document.getElementsByName(name).length === 1) add('name=' + name, 'name');
    const link = el.closest('a');
    if (link === el) {
      const t = visibleText(el);
      if (t && t.length < 80 && [...document.links].filter((l) => visibleText(l) === t).length === 1) add('linkText=' + t, 'linkText');
    }
    const aria = el.getAttribute('aria-label');
    if (aria) { const sel = `${el.localName}[aria-label="${attrVal(aria)}"]`; if (unique(sel)) add('css=' + sel, 'css:aria-label'); }
    add('css=' + cssPath(el), 'css:finder');
    const attrs = ['name', 'placeholder', 'type', 'value', 'title', 'alt', 'href', 'src'];
    for (const a of attrs) {
      const v = el.getAttribute(a);
      if (v && v.length < 100) { const xp = `//${el.localName}[@${a}=${xpLit(v)}]`; if (xpCount(xp) === 1) { add('xpath=' + xp, 'xpath:attributes'); break; } }
    }
    const t = visibleText(el);
    if (t && t.length < 60 && el.children.length < 3) {
      const xp = `//${el.localName}[contains(.,${xpLit(t)})]`;
      if (xpCount(xp) === 1) add('xpath=' + xp, 'xpath:innerText');
    }
    let anc = el.parentElement;
    while (anc && !(anc.id && !unstable(anc.id))) anc = anc.parentElement;
    if (anc) {
      const rel = xpathPosition(el).replace(/^\/+/, '');
      const full = xpathPosition(anc).replace(/^\/+/, '');
      if (rel.startsWith(full)) {
        const xp = `//*[@id=${xpLit(anc.id)}]${rel.slice(full.length) ? '/' + rel.slice(full.length).replace(/^\//, '') : ''}`;
        if (xpCount(xp) === 1) add('xpath=' + xp, 'xpath:idRelative');
      }
    }
    add('xpath=' + xpathPosition(el), 'xpath:position');
    return out;
  }

  function send(command, target, value, targets) {
    chrome.runtime.sendMessage({ type: 'tapeline:record', command: { command, target: target || '', value: value ?? '', targets: targets || [] }, top: window === top }).catch(() => {});
  }

  function sendFor(command, el, value) {
    const targets = locatorsFor(el);
    send(command, targets[0][0], value, targets);
  }

  // The element a click "means": the nearest interactive ancestor, so a click on an icon inside a
  // button records the button.
  function clickable(el) {
    return el.closest('a, button, input, select, textarea, label, summary, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="option"], [role="checkbox"], [onclick], [tabindex]') || el;
  }

  const isTextInput = (el) =>
    (el.localName === 'input' && !['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'image', 'range', 'color'].includes((el.type || '').toLowerCase())) ||
    el.localName === 'textarea';

  function flushTyping() {
    if (!lastTyped) return;
    const { el } = lastTyped;
    clearTimeout(lastTyped.timer);
    lastTyped = null;
    if (el.isContentEditable) sendFor('editContent', el, el.innerHTML);
    else sendFor('type', el, el.value);
  }

  function highlight(el, color = '#0e7490') {
    if (!el || !el.getBoundingClientRect) return;
    const r = el.getBoundingClientRect();
    const box = document.createElement('div');
    box.setAttribute('data-tapeline-ui', '');
    Object.assign(box.style, {
      position: 'fixed', left: r.left - 3 + 'px', top: r.top - 3 + 'px', width: r.width + 6 + 'px', height: r.height + 6 + 'px',
      border: `2px solid ${color}`, borderRadius: '4px', background: color + '22', zIndex: 2147483647, pointerEvents: 'none', transition: 'opacity .4s',
    });
    document.documentElement.appendChild(box);
    return box;
  }

  const listeners = {
    click(e) {
      if (picking) return;
      if (!recording || !e.isTrusted) return;
      const el = clickable(e.target);
      if (el.closest('[data-tapeline-ui]')) return;
      if (el.localName === 'select' || el.localName === 'option') return; // recorded as select on change
      if (el.localName === 'label' && el.control) return; // the click is replayed on the control itself
      flushTyping();
      sendFor(e.detail === 2 ? 'doubleClick' : 'click', el);
    },
    input(e) {
      if (!recording || !e.isTrusted) return;
      const el = e.target;
      if (!(isTextInput(el) || el.isContentEditable)) return;
      if (lastTyped && lastTyped.el !== el) flushTyping();
      if (!lastTyped) lastTyped = { el };
      clearTimeout(lastTyped.timer);
      lastTyped.timer = setTimeout(flushTyping, 1500);
    },
    change(e) {
      if (!recording || !e.isTrusted) return;
      const el = e.target;
      if (el.localName === 'select') {
        flushTyping();
        if (el.multiple) for (const o of el.selectedOptions) sendFor('addSelection', el, 'label=' + o.text.trim());
        else if (el.selectedOptions[0]) sendFor('select', el, 'label=' + el.selectedOptions[0].text.trim());
      } else if (isTextInput(el) && lastTyped?.el === el) flushTyping();
    },
    keydown(e) {
      if (!recording || !e.isTrusted) return;
      if (e.key === 'Enter' && isTextInput(e.target) && e.target.localName !== 'textarea') {
        if (lastTyped?.el === e.target) flushTyping();
        sendFor('sendKeys', e.target, '${KEY_ENTER}');
      }
    },
    contextmenu(e) { lastContextTarget = e.target; },
    // Element picking for the step editor's target field.
    mouseover(e) {
      if (!picking) return;
      picking.box?.remove();
      picking.box = highlight(e.target);
    },
    pickclick(e) {
      if (!picking) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      picking.box?.remove();
      const targets = locatorsFor(e.target);
      chrome.runtime.sendMessage({ type: 'tapeline:picked', targets }).catch(() => {});
      picking = null;
    },
  };

  for (const k of ['click', 'input', 'change', 'keydown', 'contextmenu']) document.addEventListener(k, listeners[k], true);
  document.addEventListener('mouseover', listeners.mouseover, true);
  for (const k of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup']) {
    window.addEventListener(k, (e) => { if (picking) { if (k === 'click') listeners.pickclick(e); else { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); } } }, true);
  }
  window.addEventListener('beforeunload', flushTyping, true);

  function assertionFor(kind, el) {
    const targets = locatorsFor(el);
    const t = targets[0][0];
    switch (kind) {
      case 'assertText': return ['assertText', t, visibleText(el), targets];
      case 'assertElementPresent': return ['assertElementPresent', t, '', targets];
      case 'assertValue': return ['assertValue', t, el.value ?? '', targets];
      case 'waitForElementVisible': return ['waitForElementVisible', t, '30000', targets];
      case 'storeText': return ['storeText', t, 'text', targets];
      case 'assertTitle': return ['assertTitle', document.title, '', []];
      default: return null;
    }
  }

  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (msg?.type === 'tapeline:assert' && lastContextTarget) {
      const a = assertionFor(msg.kind, msg.kind === 'assertTitle' ? document.documentElement : clickable(lastContextTarget).localName === 'a' ? lastContextTarget.closest('a') : lastContextTarget);
      if (a) { flushTyping(); send(...a); highlight(lastContextTarget, '#15803d'); }
      reply({ ok: !!a });
    } else if (msg?.type === 'tapeline:startRecording') {
      recording = true;
      reply({ ok: true });
    } else if (msg?.type === 'tapeline:stopRecording') {
      flushTyping();
      recording = false;
      reply({ ok: true });
    } else if (msg?.type === 'tapeline:pick') {
      picking = { box: null };
      reply({ ok: true });
    } else if (msg?.type === 'tapeline:cancelPick') {
      picking?.box?.remove();
      picking = null;
      reply({ ok: true });
    }
  });

  window.__tapelineRecorder = { locatorsFor };
})();
