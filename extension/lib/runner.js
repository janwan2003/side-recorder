// Runs a test: control flow, variables and the commands that do not touch the page. Page work goes
// through the `io` object, so the same runner drives the browser in the extension and a fake page in
// the unit tests.
//
// io = {
//   open(url), element(msg) -> {ok, value, fallback, error}, script(code, args, isAsync) -> value,
//   setWindowSize(w, h), dialog(command, target) -> {ok, error}, selectFrame(target) -> {ok, error},
//   log(level, text), step(testId, index, state, text), stopped() -> bool, sleep(ms)
// }
// state is one of 'running' | 'passed' | 'failed' | 'skipped' | 'warning'.

import { resolveUrl } from './side.js';
import { isDisabled } from './commands.js';

const LOOP_LIMIT = 1000;
const VAR_RE = /\$\{([A-Za-z_$][\w$]*)\}/g;

export class StepError extends Error {}
class Stop extends Error {}

export function interpolate(s, vars) {
  return String(s ?? '').replace(VAR_RE, (all, name) => (name.startsWith('KEY_') || !(name in vars) ? all : String(vars[name])));
}

// ${name} inside a script becomes arguments[i], and the value is passed in, so strings need no quoting.
export function scriptArgs(code, vars) {
  const names = [];
  const out = String(code).replace(VAR_RE, (all, name) => {
    if (name.startsWith('KEY_')) return all;
    let i = names.indexOf(name);
    if (i < 0) { names.push(name); i = names.length - 1; }
    return `arguments[${i}]`;
  });
  return { code: out, args: names.map((n) => vars[n]) };
}

// Matches if/elseIf/else/end, while/end, times/end, forEach/end and do/repeatIf.
export function analyzeBlocks(commands) {
  const info = new Map(); // index -> { kind, start, branches:[], end }
  const stack = [];
  const opens = new Set(['if', 'while', 'times', 'forEach', 'do']);
  commands.forEach((c, i) => {
    if (isDisabled(c)) return;
    const name = c.command;
    if (opens.has(name)) {
      const b = { kind: name, start: i, branches: [], end: -1 };
      info.set(i, b);
      stack.push(b);
    } else if (name === 'elseIf' || name === 'else') {
      const top = stack[stack.length - 1];
      if (!top || top.kind !== 'if') throw new StepError(`Step ${i + 1}: "${name}" is not inside an if block.`);
      if (top.branches.some((x) => commands[x].command === 'else')) throw new StepError(`Step ${i + 1}: "${name}" after else.`);
      top.branches.push(i);
      info.set(i, top);
    } else if (name === 'end') {
      const top = stack.pop();
      if (!top || top.kind === 'do') throw new StepError(`Step ${i + 1}: "end" has no matching if, while, times or forEach.`);
      top.end = i;
      info.set(i, top);
    } else if (name === 'repeatIf') {
      const top = stack.pop();
      if (!top || top.kind !== 'do') throw new StepError(`Step ${i + 1}: "repeatIf" has no matching do.`);
      top.end = i;
      info.set(i, top);
    }
  });
  if (stack.length) {
    const b = stack[stack.length - 1];
    throw new StepError(`Step ${b.start + 1}: "${b.kind}" is never closed with ${b.kind === 'do' ? 'repeatIf' : 'end'}.`);
  }
  return info;
}

const DIALOG_COMMANDS = new Set([
  'assertAlert', 'verifyAlert', 'assertConfirmation', 'verifyConfirmation', 'assertPrompt', 'verifyPrompt',
  'chooseOkOnNextConfirmation', 'chooseCancelOnNextConfirmation', 'answerOnNextPrompt', 'chooseCancelOnNextPrompt',
  'webdriverChooseOkOnVisibleConfirmation', 'webdriverChooseCancelOnVisibleConfirmation', 'webdriverAnswerOnVisiblePrompt',
]);

export async function runTest(project, test, io, opts = {}) {
  const vars = opts.vars || {};
  const depth = opts.depth || 0;
  let speed = opts.speed || 0;
  const timeout = opts.timeout || 15000;
  const cmds = test.commands;
  let failed = false;
  let info;
  try {
    info = analyzeBlocks(cmds);
  } catch (e) {
    io.log('error', `${test.name}: ${e.message}`);
    return { passed: false, error: e.message, vars };
  }
  const loopState = new Map();

  const cond = async (expr, i) => {
    const { code, args } = scriptArgs(expr, vars);
    const r = await io.script(`return (${code});`, args, false);
    if (r && r.error) throw new StepError(r.error);
    return !!(r && 'value' in r ? r.value : r);
  };

  let pc = opts.startAt || 0;
  while (pc < cmds.length) {
    if (io.stopped()) throw new Stop('Stopped');
    const c = cmds[pc];
    const i = pc;
    if (!c.command || isDisabled(c)) { io.step(test.id, i, 'skipped', ''); pc++; continue; }
    if (opts.stopAt === i) { io.log('info', `Paused before step ${i + 1}.`); return { passed: !failed, pausedAt: i, vars }; }
    io.step(test.id, i, 'running', '');
    const name = c.command;
    const isVerify = name.startsWith('verify');
    const target = interpolate(c.target, vars);
    const value = interpolate(c.value, vars);
    let next = pc + 1;
    let note = '';
    let warn = false;
    try {
      const b = info.get(i);
      switch (name) {
        case 'if': {
          next = b.end + 1;
          if (await cond(c.target, i)) next = i + 1;
          else {
            for (const br of b.branches) {
              if (cmds[br].command === 'else') { next = br + 1; break; }
              io.step(test.id, br, 'running', '');
              const ok = await cond(cmds[br].target, br);
              io.step(test.id, br, 'passed', ok ? 'true' : 'false');
              if (ok) { next = br + 1; break; }
            }
          }
          break;
        }
        case 'elseIf': case 'else': next = b.end + 1; break; // reached by finishing the branch above
        case 'while': {
          const st = loopState.get(i) || { n: 0 };
          if (await cond(c.target, i)) {
            if (++st.n > LOOP_LIMIT) throw new StepError(`while ran more than ${LOOP_LIMIT} times; stopping.`);
            loopState.set(i, st);
            next = i + 1;
          } else { loopState.delete(i); next = b.end + 1; }
          break;
        }
        case 'times': {
          const n = Number(target);
          if (!Number.isFinite(n)) throw new StepError(`times needs a number, got "${target}".`);
          const st = loopState.get(i) || { n: 0 };
          if (st.n < n) { st.n++; loopState.set(i, st); next = i + 1; note = `${st.n} of ${n}`; } else { loopState.delete(i); next = b.end + 1; }
          break;
        }
        case 'forEach': {
          const arr = vars[c.target];
          if (!Array.isArray(arr)) throw new StepError(`forEach needs an array in \${${c.target}}.`);
          const st = loopState.get(i) || { n: 0 };
          if (st.n < arr.length) { vars[c.value] = arr[st.n]; st.n++; loopState.set(i, st); next = i + 1; } else { loopState.delete(i); next = b.end + 1; }
          break;
        }
        case 'do': {
          const st = loopState.get(i) || { n: 0 };
          if (++st.n > LOOP_LIMIT) throw new StepError(`do ran more than ${LOOP_LIMIT} times; stopping.`);
          loopState.set(i, st);
          break;
        }
        case 'repeatIf': {
          if (await cond(c.target, i)) next = b.start + 1;
          else loopState.delete(b.start);
          break;
        }
        case 'end': {
          next = b.kind === 'if' ? i + 1 : b.start;
          break;
        }
        case 'open': {
          const url = resolveUrl(target, project.url);
          if (!/^(https?|file):/i.test(url)) throw new StepError(`Cannot open "${target}": set the project base URL or use a full URL.`);
          await io.open(url);
          break;
        }
        case 'pause': await io.sleep(Number(target || value) || 0); break;
        case 'setSpeed': speed = Number(target) || 0; break;
        case 'setWindowSize': {
          const m = /^\s*(\d+)\s*[x×,]\s*(\d+)\s*$/i.exec(target);
          if (!m) throw new StepError(`setWindowSize needs WIDTHxHEIGHT, got "${target}".`);
          const r = await io.setWindowSize(Number(m[1]), Number(m[2]));
          if (r?.note) { note = r.note; warn = true; }
          break;
        }
        case 'store': vars[c.value] = target; break;
        case 'echo': io.log('echo', target); note = target; break;
        case 'assert': case 'verify': {
          const actual = String(vars[c.target]);
          if (actual !== value) throw new StepError(`\${${c.target}} is "${actual}", expected "${value}".`);
          break;
        }
        case 'executeScript': case 'runScript': case 'executeAsyncScript': {
          const { code, args } = scriptArgs(c.target, vars);
          const r = await io.script(code, args, name === 'executeAsyncScript');
          if (r && r.error) throw new StepError(r.error);
          if (c.value && name !== 'runScript') vars[c.value] = r?.value;
          break;
        }
        case 'run': {
          const other = project.tests.find((t) => t.name === target);
          if (!other) throw new StepError(`No test named "${target}" in this project.`);
          if (depth > 10) throw new StepError('run is nested more than 10 deep.');
          const r = await runTest(project, other, io, { ...opts, vars, depth: depth + 1, startAt: 0, stopAt: undefined });
          if (!r.passed) throw new StepError(`Test "${target}" failed.`);
          break;
        }
        case 'selectFrame': {
          const r = await io.selectFrame(target);
          if (!r.ok) throw new StepError(r.error);
          break;
        }
        case 'selectWindow': case 'close':
          throw new StepError(`"${name}" (switching or closing windows) is not supported in replay yet. It is kept in the file and in exported code.`);
        default: {
          if (DIALOG_COMMANDS.has(name)) {
            const r = await io.dialog(name, target);
            if (!r.ok) throw new StepError(r.error);
            break;
          }
          const msg = { command: name, target, value, targets: (c.targets || []).map((t) => [interpolate(t[0], vars), t[1]]), timeout: /^waitFor/.test(name) && Number(value) > 0 ? Number(value) : timeout };
          const r = await io.element(msg);
          if (!r.ok) throw new StepError(r.error);
          if (/^store/.test(name) && 'value' in r) vars[c.value] = r.value;
          if (r.fallback) { note = `Used fallback locator ${r.fallback}`; warn = true; }
        }
      }
      if (warn) io.log('warn', `${test.name}, step ${i + 1} (${name}): ${note}`);
      io.step(test.id, i, warn ? 'warning' : 'passed', note);
    } catch (e) {
      if (e instanceof Stop) throw e;
      const text = e instanceof StepError ? e.message : `${e.name}: ${e.message}`;
      io.step(test.id, i, 'failed', text);
      io.log('error', `${test.name}, step ${i + 1} (${name}): ${text}`);
      failed = true;
      if (!isVerify) return { passed: false, failedAt: i, error: text, vars };
    }
    pc = next;
    if (speed) await io.sleep(speed);
  }
  return { passed: !failed, vars };
}

export { Stop };
