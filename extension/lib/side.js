// Reading and writing .side project files (the JSON project format used by Selenium IDE 3.x and 4.x).
// Written from the published format, checked against real project files. Unknown fields are kept,
// so a file opened and saved again loses nothing it did not understand.

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}

export function newCommand(command = '', target = '', value = '', extra = {}) {
  return { id: uid(), comment: '', command, target, targets: [], value, ...extra };
}

export function newTest(name = 'Untitled test') {
  return { id: uid(), name, commands: [] };
}

export function newProject(name = 'Untitled project', url = '') {
  const test = newTest('Untitled test');
  return {
    id: uid(),
    version: '2.0',
    name,
    url,
    tests: [test],
    suites: [{ id: uid(), name: 'Default Suite', persistSession: false, parallel: false, timeout: 300, tests: [test.id] }],
    urls: url ? [url] : [],
    plugins: [],
  };
}

export class SideFormatError extends Error {}

// Accepts the text of a .side file. Returns a normalised project, or throws SideFormatError with a
// message a person can act on.
export function parseSide(text) {
  if (typeof text !== 'string') throw new SideFormatError('Expected the text of a .side file.');
  let data;
  try {
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch (e) {
    throw new SideFormatError(`This is not valid JSON, so it is not a .side project (${e.message}).`);
  }
  return normalizeProject(data);
}

export function normalizeProject(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new SideFormatError('A .side project must be a JSON object.');
  if (!Array.isArray(data.tests)) {
    // Selenium IDE 1/2 used HTML suites; Katalon exports other shapes. Say so plainly.
    throw new SideFormatError('No "tests" list found. This file is not a Selenium IDE 3/4 (.side) project.');
  }
  const project = { ...data };
  project.id = str(data.id) || uid();
  project.version = str(data.version) || '2.0';
  project.name = str(data.name) || 'Untitled project';
  project.url = str(data.url);
  project.urls = Array.isArray(data.urls) ? data.urls.filter((u) => typeof u === 'string') : [];
  project.plugins = Array.isArray(data.plugins) ? data.plugins : [];
  const seenIds = new Set();
  project.tests = data.tests.map((t, i) => {
    if (!t || typeof t !== 'object') throw new SideFormatError(`Test ${i + 1} is not an object.`);
    let id = str(t.id);
    if (!id || seenIds.has(id)) id = uid();
    seenIds.add(id);
    const commands = Array.isArray(t.commands) ? t.commands : [];
    return {
      ...t,
      id,
      name: str(t.name) || `Test ${i + 1}`,
      commands: commands.map((c, j) => normalizeCommand(c, `test "${t.name || i + 1}", step ${j + 1}`)),
    };
  });
  const testIds = new Set(project.tests.map((t) => t.id));
  project.suites = (Array.isArray(data.suites) ? data.suites : []).map((s) => ({
    ...s,
    id: str(s?.id) || uid(),
    name: str(s?.name) || 'Suite',
    persistSession: !!s?.persistSession,
    parallel: !!s?.parallel,
    timeout: Number.isFinite(s?.timeout) ? s.timeout : 300,
    tests: (Array.isArray(s?.tests) ? s.tests : []).filter((id) => testIds.has(id)),
  }));
  if (!project.suites.length) {
    project.suites = [{ id: uid(), name: 'Default Suite', persistSession: false, parallel: false, timeout: 300, tests: [...testIds] }];
  }
  return project;
}

function normalizeCommand(c, where) {
  if (!c || typeof c !== 'object') throw new SideFormatError(`${where} is not an object.`);
  const targets = Array.isArray(c.targets)
    ? c.targets.filter((t) => Array.isArray(t) && typeof t[0] === 'string').map((t) => [t[0], typeof t[1] === 'string' ? t[1] : ''])
    : [];
  return {
    ...c,
    id: str(c.id) || uid(),
    comment: str(c.comment),
    command: str(c.command),
    target: str(c.target),
    targets,
    value: str(c.value),
  };
}

function str(v) {
  if (v == null) return '';
  return typeof v === 'string' ? v : String(v);
}

// Serialises with the same 2-space layout Selenium IDE writes, so diffs in version control stay small.
export function serializeSide(project) {
  const out = normalizeProject(project);
  // A disabled step is stored by Selenium IDE as a command name starting with "//". Keep it as is.
  return JSON.stringify(out, null, 2);
}

export function fileNameFor(project) {
  const base = (project.name || 'project').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'project';
  return `${base}.side`;
}

// Resolves an "open" target against the project's base URL, as Selenium IDE does.
export function resolveUrl(target, baseUrl) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return target;
  if (!baseUrl) return target;
  try {
    const base = new URL(baseUrl);
    if (target.startsWith('/')) return base.origin + target;
    if (!target) return base.href;
    return new URL(target, base.href.endsWith('/') ? base.href : base.href + '/').href;
  } catch {
    return target;
  }
}
