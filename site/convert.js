import { parseSide } from './lib/side.js';
import { LANGUAGES, exportTests, exportFileName } from './lib/export.js';

const $ = (id) => document.getElementById(id);
let project = null;
for (const [k, v] of Object.entries(LANGUAGES)) $('lang').append(new Option(v.label, k));

const SAMPLE = {
  version: '2.0', name: 'Sample shop', url: 'https://shop.example.com',
  tests: [{ id: 't1', name: 'Sign up', commands: [
    { command: 'open', target: '/signup', value: '' },
    { command: 'type', target: 'css=[data-testid="email"]', value: 'ada@example.com' },
    { command: 'type', target: 'name=password', value: 's3cret' },
    { command: 'select', target: 'id=plan', value: 'label=Pro' },
    { command: 'click', target: 'id=terms', value: '' },
    { command: 'click', target: 'xpath=//button[contains(.,\'Sign up\')]', value: '' },
    { command: 'assertText', target: 'css=h1', value: 'Welcome, ada@example.com' },
    { command: 'storeText', target: 'id=plan-name', value: 'plan' },
    { command: 'if', target: "${plan} === 'Pro'", value: '' },
    { command: 'click', target: 'linkText=Billing', value: '' },
    { command: 'end', target: '', value: '' },
  ] }],
  suites: [], urls: [], plugins: [],
};

function render() {
  if (!project) return;
  const which = $('which').value;
  const tests = which === 'all' ? project.tests : project.tests.filter((t) => t.id === which);
  const lang = $('lang').value;
  $('code').textContent = exportTests(project, tests, lang);
  $('fname').textContent = exportFileName(project, which === 'all' ? null : tests[0], lang);
  $('copy').disabled = $('download').disabled = false;
}

function load(text, name) {
  $('err').textContent = '';
  try {
    project = parseSide(text);
  } catch (e) {
    project = null;
    $('err').textContent = e.message;
    $('code').textContent = '';
    $('copy').disabled = $('download').disabled = true;
    return;
  }
  const w = $('which');
  w.replaceChildren(new Option(`All tests (${project.tests.length})`, 'all'), ...project.tests.map((t) => new Option(t.name, t.id)));
  const steps = project.tests.reduce((a, t) => a + t.commands.length, 0);
  $('stats').textContent = `${name}: ${project.tests.length} test${project.tests.length === 1 ? '' : 's'}, ${steps} steps.`;
  render();
}

$('drop').addEventListener('click', () => $('file').click());
$('drop').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); } });
$('file').addEventListener('change', async (e) => { const f = e.target.files[0]; if (f) load(await f.text(), f.name); });
for (const ev of ['dragenter', 'dragover']) $('drop').addEventListener(ev, (e) => { e.preventDefault(); $('drop').classList.add('over'); });
$('drop').addEventListener('dragleave', () => $('drop').classList.remove('over'));
$('drop').addEventListener('drop', async (e) => { e.preventDefault(); $('drop').classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) load(await f.text(), f.name); });
$('sample').addEventListener('click', () => load(JSON.stringify(SAMPLE), 'sample.side'));
$('lang').addEventListener('change', render);
$('which').addEventListener('change', render);
$('copy').addEventListener('click', async () => { await navigator.clipboard.writeText($('code').textContent); $('copy').textContent = 'Copied'; setTimeout(() => { $('copy').textContent = 'Copy'; }, 1500); });
$('download').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([$('code').textContent], { type: 'text/plain' }));
  a.download = $('fname').textContent;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
