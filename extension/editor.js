// Tapeline editor window: project and step editing, recording orchestration, replay.
import { newProject, newTest, newCommand, parseSide, serializeSide, fileNameFor, resolveUrl, SideFormatError } from './lib/side.js';
import { COMMANDS, COMMAND_NAMES, isDisabled } from './lib/commands.js';
import { runTest, analyzeBlocks, Stop } from './lib/runner.js';
import { LANGUAGES, exportTests, exportFileName } from './lib/export.js';

const $ = (id) => document.getElementById(id);
const api = globalThis.chrome;

const state = {
  project: null,
  testId: null,
  sel: -1, // selected step index
  recording: false,
  playing: false,
  stopRequested: false,
  tabId: null, // the tab being recorded or replayed
  results: new Map(), // testId -> Map(index -> {state, note})
  testStatus: new Map(), // testId -> 'passed' | 'failed' | 'running'
  dirty: false, // changed since last Save
  picking: false,
};

const params = new URLSearchParams(location.search);
if (params.get('tab')) state.tabId = Number(params.get('tab'));

// ---------- persistence ----------
let saveTimer;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => api.storage.local.set({ project: state.project, testId: state.testId, dirty: state.dirty }), 250);
}
function changed() { state.dirty = true; persist(); }

async function load() {
  const { project, testId, dirty } = await api.storage.local.get(['project', 'testId', 'dirty']);
  try { state.project = project ? parseSide(JSON.stringify(project)) : newProject(); } catch { state.project = newProject(); }
  state.testId = state.project.tests.some((t) => t.id === testId) ? testId : state.project.tests[0]?.id;
  state.dirty = !!dirty;
  if (!state.project.tests.length) addTest();
  // Default the base URL to the tab Tapeline was opened from.
  if (!state.project.url && state.tabId) {
    try {
      const tab = await api.tabs.get(state.tabId);
      if (/^https?:/.test(tab.url)) state.project.url = new URL(tab.url).origin;
    } catch {}
  }
  if (state.tabId) {
    try { state.tabUrl = (await api.tabs.get(state.tabId)).url; } catch {}
  }
  renderAll();
}

const test = () => state.project.tests.find((t) => t.id === state.testId);

// ---------- rendering ----------
function renderAll() {
  $('projectName').value = state.project.name;
  $('baseUrl').value = state.project.url || '';
  renderTests();
  renderSteps();
  renderForm();
}

function renderTests() {
  const ul = $('testList');
  ul.replaceChildren(...state.project.tests.map((t) => {
    const li = document.createElement('li');
    li.className = t.id === state.testId ? 'active' : '';
    li.dataset.id = t.id;
    li.title = t.name;
    const dot = document.createElement('span');
    dot.className = 'status-dot ' + (state.testStatus.get(t.id) || '');
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = t.name;
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = t.commands.length;
    const del = document.createElement('button');
    del.className = 'del';
    del.title = 'Delete test';
    del.setAttribute('aria-label', `Delete test ${t.name}`);
    del.textContent = '×';
    li.append(dot, name, count, del);
    return li;
  }));
  const n = state.project.tests.reduce((a, t) => a + t.commands.length, 0);
  $('projectStats').textContent = `${state.project.tests.length} test${state.project.tests.length === 1 ? '' : 's'}, ${n} step${n === 1 ? '' : 's'}`;
}

function indentLevels(cmds) {
  const out = [];
  let lvl = 0;
  for (const c of cmds) {
    const n = c.command;
    if (['end', 'elseIf', 'else', 'repeatIf'].includes(n)) lvl = Math.max(0, lvl - 1);
    out.push(lvl);
    if (['if', 'elseIf', 'else', 'while', 'times', 'forEach', 'do'].includes(n)) lvl++;
  }
  return out;
}

function renderSteps() {
  const t = test();
  const tbody = $('steps');
  const results = state.results.get(t.id) || new Map();
  const levels = indentLevels(t.commands);
  tbody.replaceChildren(...t.commands.map((c, i) => {
    const tr = document.createElement('tr');
    tr.dataset.i = i;
    const r = results.get(i);
    tr.className = [i === state.sel ? 'selected' : '', isDisabled(c) ? 'disabled' : '', r?.state || ''].join(' ').trim();
    const tdN = cell('n', String(i + 1));
    const tdC = cell('cmd indent-cell', c.command || '(empty)');
    tdC.style.setProperty('--indent', levels[i]);
    if (c.comment) { const s = document.createElement('span'); s.className = 'comment'; s.textContent = c.comment; tdC.append(s); }
    const tdT = cell('', c.target);
    tdT.title = c.target;
    if (r?.note) { const s = document.createElement('span'); s.className = 'note'; s.textContent = r.note; tdT.append(s); }
    const tdV = cell('', c.value);
    tdV.title = c.value;
    tr.append(tdN, tdC, tdT, tdV);
    return tr;
  }));
  $('emptyState').hidden = t.commands.length > 0;
  $('testName').value = t.name;
  for (const id of ['moveUp', 'moveDown', 'deleteStep', 'toggleStep']) $(id).disabled = state.sel < 0 || state.playing;
  $('toggleStep').textContent = state.sel >= 0 && isDisabled(t.commands[state.sel] || {}) ? 'Enable' : 'Disable';
  $('playFrom').disabled = state.sel < 0 || state.playing || state.recording;
}

function cell(cls, text) {
  const td = document.createElement('td');
  if (cls) td.className = cls;
  td.textContent = text;
  return td;
}

function renderForm() {
  const c = test().commands[state.sel];
  const fields = ['fCommand', 'fTarget', 'fValue', 'fComment', 'fTargets', 'pick', 'find'];
  for (const f of fields) $(f).disabled = !c;
  $('fCommand').value = c?.command || '';
  $('fTarget').value = c?.target || '';
  $('fValue').value = c?.value || '';
  $('fComment').value = c?.comment || '';
  const sel = $('fTargets');
  sel.replaceChildren();
  const alts = c?.targets || [];
  sel.hidden = alts.length < 2;
  const ph = new Option('▾', '');
  ph.disabled = true; ph.selected = true;
  sel.append(ph, ...alts.map(([loc, strat]) => new Option(`${loc}${strat ? `   (${strat})` : ''}`, loc)));
  renderHelp();
}

function renderHelp() {
  const name = $('fCommand').value.replace(/^\/\//, '');
  const spec = COMMANDS[name];
  const help = $('cmdHelp');
  if (!test().commands[state.sel]) { help.textContent = 'Select a step to edit it.'; return; }
  help.textContent = spec ? `${name}: ${spec.d}${spec.t ? `  Target: ${spec.t}.` : ''}${spec.v ? `  Value: ${spec.v}.` : ''}` : name ? `"${name}" is not a command Tapeline knows. It is kept in the file but fails in replay.` : '';
  $('fTarget').placeholder = spec?.t || '';
  $('fValue').placeholder = spec?.v || '';
}

function select(i, scroll = true) {
  const n = test().commands.length;
  state.sel = n ? Math.max(-1, Math.min(i, n - 1)) : -1;
  renderSteps();
  renderForm();
  if (scroll && state.sel >= 0) $('steps').children[state.sel]?.scrollIntoView({ block: 'nearest' });
}

// ---------- log ----------
function log(level, text) {
  const li = document.createElement('li');
  li.className = level;
  const time = document.createElement('time');
  time.textContent = new Date().toLocaleTimeString();
  li.append(time, text);
  $('log').append(li);
  li.scrollIntoView({ block: 'nearest' });
}

let toastTimer;
function toast(text, error = false) {
  const t = $('toast');
  t.textContent = text;
  t.className = 'toast show' + (error ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast' + (error ? ' error' : ''); }, error ? 4500 : 2200);
}

// ---------- editing ----------
function addTest() {
  const t = newTest(uniqueName('Untitled test'));
  state.project.tests.push(t);
  state.project.suites[0]?.tests.push(t.id);
  state.testId = t.id;
  state.sel = -1;
  changed();
  renderAll();
  return t;
}

function uniqueName(base) {
  const names = new Set(state.project.tests.map((t) => t.name));
  if (!names.has(base)) return base;
  let i = 2;
  while (names.has(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

function insertStep(cmd, at = state.sel + 1) {
  const t = test();
  t.commands.splice(at, 0, cmd);
  shiftResults(t.id);
  state.sel = at;
  changed();
  renderSteps();
  renderForm();
  renderTests();
  $('steps').children[at]?.scrollIntoView({ block: 'nearest' });
}

function shiftResults(id) { state.results.delete(id); }

function updateField(key, value) {
  const c = test().commands[state.sel];
  if (!c) return;
  c[key] = value;
  if (key === 'target' && !c.targets.some((x) => x[0] === value) && c.targets.length) {
    // A hand-typed target becomes the first choice; recorded alternatives stay as fallbacks.
  }
  changed();
  const tr = $('steps').children[state.sel];
  if (tr) {
    const levelsChanged = key === 'command';
    if (levelsChanged) renderSteps();
    else {
      const idx = { target: 2, value: 3 }[key];
      if (idx) { tr.children[idx].textContent = value; tr.children[idx].title = value; }
      if (key === 'comment') renderSteps();
    }
  }
}

// ---------- tabs and injection ----------
async function tabAlive(id) {
  if (id == null) return null;
  try { return await api.tabs.get(id); } catch { return null; }
}

async function ensureTab(url) {
  const tab = await tabAlive(state.tabId);
  if (tab) return tab;
  const win = await api.windows.create({ url: url || 'about:blank', type: 'normal', width: 1200, height: 860 });
  state.tabId = win.tabs[0].id;
  await waitForLoad(state.tabId);
  return api.tabs.get(state.tabId);
}

function waitForLoad(tabId, timeout = 30000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (done) return; done = true; api.tabs.onUpdated.removeListener(onUpd); clearTimeout(timer); resolve(); };
    const onUpd = (id, info) => { if (id === tabId && info.status === 'complete') finish(); };
    const timer = setTimeout(finish, timeout);
    api.tabs.onUpdated.addListener(onUpd);
    api.tabs.get(tabId).then((t) => { if (t.status === 'complete') finish(); }, finish);
  });
}

async function injectRecorder(tabId) {
  try {
    await api.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['content/recorder.js'] });
    return true;
  } catch (e) {
    log('warn', `Cannot record in this page: ${e.message}`);
    return false;
  }
}

async function sendToTab(msg, frameId = 0) {
  return api.tabs.sendMessage(state.tabId, msg, { frameId });
}

// ---------- recording ----------
// Host access granted so far, kept current so a click can decide without awaiting (Chrome only shows
// the permission prompt during the click's user gesture).
const perms = { origins: [] };
async function refreshPerms() { perms.origins = (await api.permissions.getAll()).origins || []; }
api.permissions.onAdded?.addListener(refreshPerms);
api.permissions.onRemoved?.addListener(refreshPerms);

function covered(url) {
  if (!url) return false;
  let u;
  try { u = new URL(url); } catch { return false; }
  return perms.origins.some((p) => {
    if (p === '<all_urls>') return true;
    const m = /^(\*|https?|file):\/\/([^/]*)\//.exec(p);
    if (!m) return false;
    const scheme = m[1] === '*' ? /^https?:$/.test(u.protocol) : u.protocol === m[1] + ':';
    const host = m[2] === '*' || m[2] === u.hostname || (m[2].startsWith('*.') && u.hostname.endsWith(m[2].slice(1)));
    return scheme && host;
  });
}

function requestHostAccess(url = state.project?.url) {
  if (covered(url) && (!/^(https?|file):/.test(state.tabUrl || '') || covered(state.tabUrl))) return Promise.resolve(true);
  return api.permissions.request({ origins: ['<all_urls>'] }).catch(() => false);
}

async function startRecording() {
  const granted = await requestHostAccess();
  if (!granted) { toast('Tapeline needs access to the page to record it.', true); return; }
  const base = state.project.url;
  const t = test();
  const existing = await tabAlive(state.tabId);
  if (!existing && !base) {
    $('baseUrl').classList.add('invalid');
    $('baseUrl').focus();
    toast('Enter the base URL of the site to record.', true);
    return;
  }
  const tab = existing && /^https?:|^file:/.test(existing.url) ? existing : await ensureTab(base);
  if (!existing || !t.commands.length) {
    if (!t.commands.length) {
      const url = tab.url || base;
      let target = url;
      try { if (base && new URL(url).origin === new URL(base).origin) { const u = new URL(url); target = u.pathname + u.search + u.hash; } } catch {}
      if (!base) state.project.url = new URL(url).origin;
      insertStep(newCommand('open', target), 0);
      const win = await api.windows.get(tab.windowId);
      insertStep(newCommand('setWindowSize', `${win.width}x${win.height}`), 1);
    }
  }
  state.recording = true;
  state.tabId = tab.id;
  if (await injectRecorder(tab.id)) await broadcastRecording(true);
  api.contextMenus.update('tapeline', { visible: true }).catch(() => {});
  await api.windows.update(tab.windowId, { focused: true }).catch(() => {});
  log('info', `Recording in ${tab.url}`);
  renderRun();
}

async function broadcastRecording(on) {
  // Every frame's recorder instance gets the message (sendMessage without frameId reaches all frames).
  await api.tabs.sendMessage(state.tabId, { type: on ? 'tapeline:startRecording' : 'tapeline:stopRecording' }).catch(() => {});
}

async function stopRecording() {
  state.recording = false;
  await broadcastRecording(false);
  api.contextMenus.update('tapeline', { visible: false }).catch(() => {});
  log('info', 'Recording stopped.');
  renderRun();
}

api.tabs.onUpdated.addListener(async (tabId, info) => {
  if (tabId === state.tabId && info.url) state.tabUrl = info.url;
  if (tabId !== state.tabId || info.status !== 'complete') return;
  if (state.recording && (await injectRecorder(tabId))) await broadcastRecording(true);
});

api.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === 'tapeline:record') {
    if (!state.recording || sender.tab?.id !== state.tabId) return;
    if (sender.frameId && sender.frameId !== 0) {
      log('warn', 'Ignored an action inside an iframe: recording in frames is not supported yet.');
      return;
    }
    addRecorded(msg.command);
  } else if (msg?.type === 'tapeline:picked' && state.picking) {
    state.picking = false;
    $('pick').textContent = 'Pick';
    const c = test().commands[state.sel];
    if (c) {
      c.target = msg.targets[0][0];
      c.targets = msg.targets;
      changed();
      renderSteps();
      renderForm();
      api.windows.getCurrent().then((w) => api.windows.update(w.id, { focused: true })).catch(() => {});
    }
  }
});

function addRecorded(rc) {
  const t = test();
  const prev = t.commands[state.sel];
  // Typing into the same field again updates the previous "type" step instead of adding one.
  if (prev && rc.command === 'type' && prev.command === 'type' && prev.target === rc.target) {
    prev.value = rc.value;
    changed();
    renderSteps();
    renderForm();
    return;
  }
  insertStep(newCommand(rc.command, rc.target, rc.value, { targets: rc.targets || [] }));
}

// ---------- replay ----------
async function ensurePlayer(frameId = 0) {
  try {
    const r = await sendToTab({ type: 'tapeline:ping' }, frameId);
    if (r?.ok) return;
  } catch {}
  await waitForLoad(state.tabId);
  await api.scripting.executeScript({ target: { tabId: state.tabId, frameIds: [frameId] }, files: ['content/player.js'] });
}

// Replaces alert/confirm/prompt in the page so tests can check them without the page blocking.
function dialogShim() {
  if (window.__tapelineDialogs) return;
  const st = (window.__tapelineDialogs = { alerts: [], confirmations: [], prompts: [], confirmAnswer: true, promptAnswer: '' });
  window.alert = (m) => { st.alerts.push(String(m)); };
  window.confirm = (m) => { st.confirmations.push(String(m)); const a = st.confirmAnswer; st.confirmAnswer = true; return a; };
  window.prompt = (m) => { st.prompts.push(String(m)); const a = st.promptAnswer; st.promptAnswer = ''; return a; };
}

async function mainWorld(func, args = []) {
  const [r] = await api.scripting.executeScript({ target: { tabId: state.tabId, frameIds: [0] }, world: 'MAIN', func, args });
  return r?.result;
}

function makeIO() {
  return {
    async open(url) {
      await ensureTab();
      await api.tabs.update(state.tabId, { url });
      await new Promise((r) => setTimeout(r, 100));
      await waitForLoad(state.tabId);
    },
    async element(msg) {
      await waitForLoad(state.tabId);
      try {
        await ensurePlayer();
        await mainWorld(dialogShim).catch(() => {});
        return await sendToTab({ type: 'tapeline:exec', ...msg });
      } catch (e) {
        // The page navigated away while the step ran (a link or submit button): the step did its job.
        if (/message port closed|Receiving end does not exist|back\/forward cache|frame was removed/i.test(e.message) && /click|sendKeys|submit/i.test(msg.command)) return { ok: true };
        return { ok: false, error: e.message };
      }
    },
    async script(code, args, isAsync) {
      await waitForLoad(state.tabId);
      try {
        const r = await mainWorld(async (src, a) => {
          try {
            // eslint-disable-next-line no-new-func
            const f = new Function(src);
            const v = await f.apply(window, a);
            return { value: v === undefined ? null : JSON.parse(JSON.stringify(v ?? null)) };
          } catch (e) {
            if (/unsafe-eval|Content Security Policy/i.test(e.message)) return { error: 'This page\'s Content Security Policy blocks scripts from tests (executeScript, if, while).' };
            return { error: `Script error: ${e.message}` };
          }
        }, [code, args]);
        return r || { error: 'The script did not return.' };
      } catch (e) {
        return { error: e.message };
      }
    },
    async setWindowSize(w, h) {
      const tab = await ensureTab();
      try {
        await api.windows.update(tab.windowId, { width: w, height: h, state: 'normal' });
      } catch {
        // The recorded size is larger than this screen: use the largest size that fits.
        const cw = Math.min(w, screen.availWidth), ch = Math.min(h, screen.availHeight);
        try {
          await api.windows.update(tab.windowId, { width: cw, height: ch, left: 0, top: 0, state: 'normal' });
          return { note: `Screen too small for ${w}x${h}; used ${cw}x${ch}` };
        } catch {
          return { note: `Could not resize the window to ${w}x${h}; kept its size` };
        }
      }
    },
    async dialog(command, target) {
      await mainWorld(dialogShim).catch(() => {});
      const r = await mainWorld((cmd, text) => {
        const st = window.__tapelineDialogs;
        const base = cmd.replace(/^verify/, 'assert');
        const check = (list, kind) => {
          const got = list.shift();
          if (got === undefined) return { ok: false, error: `No ${kind} was shown.` };
          return got === text ? { ok: true } : { ok: false, error: `The ${kind} said "${got}", expected "${text}".` };
        };
        switch (base) {
          case 'assertAlert': return check(st.alerts, 'alert');
          case 'assertConfirmation': return check(st.confirmations, 'confirmation');
          case 'assertPrompt': return check(st.prompts, 'prompt');
          case 'chooseOkOnNextConfirmation': case 'webdriverChooseOkOnVisibleConfirmation': st.confirmAnswer = true; return { ok: true };
          case 'chooseCancelOnNextConfirmation': case 'webdriverChooseCancelOnVisibleConfirmation': st.confirmAnswer = false; return { ok: true };
          case 'answerOnNextPrompt': case 'webdriverAnswerOnVisiblePrompt': st.promptAnswer = text; return { ok: true };
          case 'chooseCancelOnNextPrompt': st.promptAnswer = null; return { ok: true };
          default: return { ok: false, error: `Unknown dialog command ${cmd}.` };
        }
      }, [command, target]).catch((e) => ({ ok: false, error: e.message }));
      return r || { ok: false, error: 'No page to check.' };
    },
    async selectFrame(target) {
      if (target === 'relative=top' || target === 'relative=parent') return { ok: true };
      return { ok: false, error: 'Switching into iframes (selectFrame) is not supported in replay yet. It is kept in the file and in exported code.' };
    },
    log,
    step(testId, i, st, note) {
      if (!state.results.has(testId)) state.results.set(testId, new Map());
      state.results.get(testId).set(i, { state: st, note });
      if (testId === state.testId) {
        const tr = $('steps').children[i];
        if (tr) {
          tr.classList.remove('running', 'passed', 'failed', 'warning', 'skipped');
          tr.classList.add(st);
          tr.querySelector('.note')?.remove();
          if (note && (st === 'failed' || st === 'warning')) {
            const s = document.createElement('span'); s.className = 'note'; s.textContent = note; tr.children[2].append(s);
          }
          if (st === 'running') tr.scrollIntoView({ block: 'nearest' });
        }
      }
    },
    stopped: () => state.stopRequested,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
}

async function play(tests, startAt = 0) {
  if (state.playing) return;
  const access = requestHostAccess(); // first, while the click's user gesture is still active
  state.playing = true;
  renderRun();
  if (state.recording) await stopRecording();
  if (!(await access)) { state.playing = false; renderRun(); toast('Tapeline needs access to the page to replay a test.', true); return; }
  state.stopRequested = false;
  renderRun();
  const io = makeIO();
  let passed = 0, failed = 0;
  const started = performance.now();
  try {
    const first = tests[0];
    if (!(await tabAlive(state.tabId))) {
      const startsWithOpen = first.commands.find((c) => c.command && !isDisabled(c))?.command === 'open';
      await ensureTab(startsWithOpen ? 'about:blank' : state.project.url || 'about:blank');
    }
    for (const t of tests) {
      state.results.set(t.id, new Map());
      state.testStatus.set(t.id, 'running');
      renderTests();
      if (t.id === state.testId) renderSteps();
      log('info', `Running "${t.name}"`);
      const r = await runTest(state.project, t, io, { speed: Number($('speed').value), startAt: t === first ? startAt : 0, timeout: 15000 });
      state.testStatus.set(t.id, r.passed ? 'passed' : 'failed');
      if (r.passed) { passed++; log('ok', `"${t.name}" passed.`); } else { failed++; log('error', `"${t.name}" failed.`); }
      renderTests();
    }
  } catch (e) {
    if (e instanceof Stop) log('warn', 'Stopped.');
    else log('error', `Replay error: ${e.message}`);
    for (const t of tests) if (state.testStatus.get(t.id) === 'running') state.testStatus.delete(t.id);
  } finally {
    state.playing = false;
    const secs = ((performance.now() - started) / 1000).toFixed(1);
    const s = $('summary');
    if (passed + failed) {
      s.textContent = failed ? `${failed} of ${passed + failed} failed (${secs} s)` : `${passed} passed (${secs} s)`;
      s.className = 'summary ' + (failed ? 'failed' : 'passed');
    }
    renderRun();
    renderTests();
    renderSteps();
  }
}

function renderRun() {
  const busy = state.playing || state.recording;
  $('record').classList.toggle('on', state.recording);
  $('record').querySelector('.label').textContent = state.recording ? 'Stop recording' : 'Record';
  $('record').disabled = state.playing;
  $('play').disabled = busy;
  $('playAll').disabled = busy;
  $('stop').disabled = !state.playing;
  $('playFrom').disabled = busy || state.sel < 0;
}

// ---------- files ----------
function download(name, text, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function saveProject() {
  download(fileNameFor(state.project), serializeSide(state.project));
  state.dirty = false;
  persist();
  toast(`Saved ${fileNameFor(state.project)}`);
}

async function openFile(file) {
  const text = await file.text();
  try {
    const p = parseSide(text);
    if (state.dirty && test().commands.length && !confirm('Replace the current project? Its unsaved changes will be lost.')) return;
    state.project = p;
    state.testId = p.tests[0]?.id;
    if (!state.testId) addTest();
    state.sel = -1;
    state.results.clear();
    state.testStatus.clear();
    state.dirty = false;
    persist();
    renderAll();
    const steps = p.tests.reduce((a, t) => a + t.commands.length, 0);
    const unknown = new Set(p.tests.flatMap((t) => t.commands.map((c) => c.command.replace(/^\/\//, '')).filter((n) => n && !COMMANDS[n])));
    log('info', `Opened ${file.name}: ${p.tests.length} tests, ${steps} steps.` + (unknown.size ? ` Unknown commands kept as is: ${[...unknown].join(', ')}.` : ''));
    toast(`Opened ${file.name}`);
  } catch (e) {
    toast(e instanceof SideFormatError ? e.message : `Could not open ${file.name}: ${e.message}`, true);
  }
}

// ---------- export ----------
function renderExport() {
  const lang = $('exportLang').value;
  const tests = $('exportScope').value === 'all' ? state.project.tests : [test()];
  $('exportOut').textContent = exportTests(state.project, tests, lang);
}

// ---------- events ----------
function bind() {
  const dl = $('commandList');
  dl.replaceChildren(...COMMAND_NAMES.map((n) => new Option(COMMANDS[n].d.slice(0, 70), n)));
  for (const [k, v] of Object.entries(LANGUAGES)) $('exportLang').append(new Option(v.label, k));

  $('projectName').addEventListener('input', (e) => { state.project.name = e.target.value; changed(); });
  $('baseUrl').addEventListener('input', (e) => { state.project.url = e.target.value.trim(); e.target.classList.remove('invalid'); if (state.project.url && !state.project.urls.includes(state.project.url)) state.project.urls.push(state.project.url); changed(); });
  $('testName').addEventListener('input', (e) => { test().name = e.target.value; changed(); renderTests(); });

  $('testList').addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    if (e.target.classList.contains('del')) {
      const t = state.project.tests.find((x) => x.id === li.dataset.id);
      if (t.commands.length && !confirm(`Delete the test "${t.name}"?`)) return;
      state.project.tests = state.project.tests.filter((x) => x.id !== t.id);
      for (const s of state.project.suites) s.tests = s.tests.filter((id) => id !== t.id);
      if (!state.project.tests.length) { addTest(); return; }
      if (state.testId === t.id) state.testId = state.project.tests[0].id;
      changed();
      state.sel = -1;
      renderAll();
      return;
    }
    if (state.recording) { toast('Stop recording before switching tests.'); return; }
    state.testId = li.dataset.id;
    state.sel = -1;
    persist();
    renderAll();
  });
  $('addTest').addEventListener('click', () => { if (!state.recording) { addTest(); $('testName').select(); } });

  $('steps').addEventListener('click', (e) => {
    const tr = e.target.closest('tr');
    if (tr) select(Number(tr.dataset.i), false);
  });
  $('steps').addEventListener('dblclick', () => $('fCommand').focus());
  $('tableWrap').addEventListener('keydown', (e) => {
    if (e.target !== $('tableWrap')) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); select(state.sel + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); select(Math.max(0, state.sel - 1)); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && state.sel >= 0) { e.preventDefault(); $('deleteStep').click(); }
    else if (e.key === 'Enter' && state.sel >= 0) { e.preventDefault(); $('fCommand').focus(); }
  });

  $('addStep').addEventListener('click', () => { insertStep(newCommand('')); $('fCommand').focus(); });
  $('deleteStep').addEventListener('click', () => {
    const t = test();
    if (state.sel < 0) return;
    t.commands.splice(state.sel, 1);
    shiftResults(t.id);
    changed();
    select(Math.min(state.sel, t.commands.length - 1));
    renderTests();
    $('tableWrap').focus();
  });
  const move = (d) => {
    const t = test(); const i = state.sel; const j = i + d;
    if (i < 0 || j < 0 || j >= t.commands.length) return;
    [t.commands[i], t.commands[j]] = [t.commands[j], t.commands[i]];
    shiftResults(t.id);
    changed();
    select(j);
  };
  $('moveUp').addEventListener('click', () => move(-1));
  $('moveDown').addEventListener('click', () => move(1));
  $('toggleStep').addEventListener('click', () => {
    const c = test().commands[state.sel];
    if (!c) return;
    c.command = isDisabled(c) ? c.command.slice(2) : '//' + c.command;
    changed();
    renderSteps();
    renderForm();
  });

  $('fCommand').addEventListener('input', (e) => { updateField('command', e.target.value.trim()); renderHelp(); });
  $('fTarget').addEventListener('input', (e) => updateField('target', e.target.value));
  $('fValue').addEventListener('input', (e) => updateField('value', e.target.value));
  $('fComment').addEventListener('input', (e) => updateField('comment', e.target.value));
  $('fTargets').addEventListener('change', (e) => {
    if (!e.target.value) return;
    $('fTarget').value = e.target.value;
    updateField('target', e.target.value);
    renderForm();
  });
  $('stepForm').addEventListener('submit', (e) => e.preventDefault());

  $('find').addEventListener('click', async () => {
    const c = test().commands[state.sel];
    if (!c || !(await tabAlive(state.tabId))) { toast('Open the page first: record or run the test.'); return; }
    if (!(await requestHostAccess())) return;
    try {
      await ensurePlayer();
      const r = await sendToTab({ type: 'tapeline:exec', command: 'highlight', target: c.target, targets: c.targets, timeout: 1500 });
      if (r.ok) toast(r.fallback ? `Not found by this locator; found by ${r.fallback}` : `Found ${r.count} element${r.count === 1 ? '' : 's'}`);
      else toast(r.error, true);
    } catch (e) { toast(e.message, true); }
  });
  $('pick').addEventListener('click', async () => {
    if (state.picking) {
      state.picking = false; $('pick').textContent = 'Pick';
      sendToTab({ type: 'tapeline:cancelPick' }).catch(() => {});
      return;
    }
    const granted = await requestHostAccess();
    const tab = await tabAlive(state.tabId);
    if (!granted || !tab) { toast('Open the page first: record or run the test.'); return; }
    if (!(await injectRecorder(tab.id))) return;
    await sendToTab({ type: 'tapeline:pick' }).catch(() => {});
    state.picking = true;
    $('pick').textContent = 'Cancel';
    await api.windows.update(tab.windowId, { focused: true });
  });

  $('record').addEventListener('click', () => (state.recording ? stopRecording() : startRecording()));
  $('play').addEventListener('click', () => play([test()]));
  $('playAll').addEventListener('click', () => play(state.project.tests));
  $('playFrom').addEventListener('click', () => { if (state.sel >= 0) play([test()], state.sel); });
  $('stop').addEventListener('click', () => { state.stopRequested = true; });
  $('clearLog').addEventListener('click', () => { $('log').replaceChildren(); $('summary').textContent = ''; });

  $('newProject').addEventListener('click', () => {
    if (state.dirty && !confirm('Start a new project? Unsaved changes to this one will be lost.')) return;
    state.project = newProject();
    state.testId = state.project.tests[0].id;
    state.sel = -1;
    state.results.clear();
    state.testStatus.clear();
    state.dirty = false;
    persist();
    renderAll();
  });
  $('openProject').addEventListener('click', () => $('fileInput').click());
  $('emptyOpen').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) openFile(f); e.target.value = ''; });
  $('saveProject').addEventListener('click', saveProject);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveProject(); }
  });
  // Dropping a .side file on the window opens it.
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) openFile(f); });

  $('exportCode').addEventListener('click', () => { renderExport(); $('exportDialog').showModal(); });
  $('exportLang').addEventListener('change', renderExport);
  $('exportScope').addEventListener('change', renderExport);
  $('copyExport').addEventListener('click', async () => { await navigator.clipboard.writeText($('exportOut').textContent); toast('Copied'); });
  $('downloadExport').addEventListener('click', () => {
    const lang = $('exportLang').value;
    const all = $('exportScope').value === 'all';
    download(exportFileName(state.project, all ? null : test(), lang), $('exportOut').textContent, 'text/plain');
  });
}

// Validate block structure as the user edits, so a missing "end" shows before a run.
export function blockProblem(t) {
  try { analyzeBlocks(t.commands); return null; } catch (e) { return e.message; }
}

bind();
refreshPerms().then(load);
window.tapeline = { state, openText: (text, name = 'test.side') => openFile(new File([text], name)), play, test };
