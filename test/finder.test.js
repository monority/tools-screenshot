const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseWindows,
  matchWindow,
  matchWindowById,
  getWindows,
  findWindow,
  findWindowById,
  listWindows,
  runPowerShell,
} = require('../src/finder');

const sample = [
  { title: 'Campfire — Mozilla Firefox', process: 'firefox', isBrowser: true },
  { title: 'index.js — Visual Studio Code', process: 'Code', isBrowser: false },
  { title: 'Untitled — Notepad', process: 'notepad', isBrowser: false },
];

test('parseWindows handles empty, BOM and single-object payloads', () => {
  assert.deepEqual(parseWindows(''), []);
  assert.deepEqual(parseWindows('  \r\n'), []);
  assert.deepEqual(parseWindows('\uFEFF[{"process":"a"}]'), [{ process: 'a' }]);
  assert.deepEqual(parseWindows('{"process":"a"}'), [{ process: 'a' }]);
});

test('matchWindow matches process names case-insensitively', () => {
  assert.equal(matchWindow(sample, 'code').process, 'Code');
  assert.equal(matchWindow(sample, '  FIREFOX ').process, 'firefox');
});

test('matchWindow falls back to window titles for non-browser apps', () => {
  assert.equal(matchWindow(sample, 'notepad').process, 'notepad');
  assert.equal(matchWindow(sample, 'untitled').process, 'notepad');
});

test('matchWindow refuses title fallback for browser-like queries', () => {
  const windows = [{ title: 'Download msedge — Notepad', process: 'notepad', isBrowser: false }];
  // The query names a browser, so a page/tab title must not be used as a match.
  assert.equal(matchWindow(windows, 'msedge'), null);
});

test('matchWindow returns null for empty or unknown queries', () => {
  assert.equal(matchWindow(sample, ''), null);
  assert.equal(matchWindow(sample, '   '), null);
  assert.equal(matchWindow(sample, 'does-not-exist'), null);
});

test('matchWindowById matches a specific window', () => {
  const windows = [
    { id: '100', title: 'Tab A', process: 'chrome' },
    { id: '200', title: 'Tab B', process: 'chrome' },
  ];
  assert.equal(matchWindowById(windows, '200').title, 'Tab B');
  assert.equal(matchWindowById(windows, 200).title, 'Tab B');
  assert.equal(matchWindowById(windows, '999'), null);
  assert.equal(matchWindowById(windows, null), null);
});

test('getWindows parses a JSON payload and normalizes single objects', () => {
  const run = () => JSON.stringify([{ id: '1', title: 'A', process: 'a', isBrowser: false }]);
  assert.equal(getWindows(run).length, 1);

  const single = () => JSON.stringify({ id: '2', title: 'B', process: 'b', isBrowser: true });
  assert.deepEqual(getWindows(single), [{ id: '2', title: 'B', process: 'b', isBrowser: true }]);
});

test('getWindows retries once after a transient failure', () => {
  let calls = 0;
  const run = () => {
    calls++;
    if (calls === 1) {
      const error = Object.assign(new Error('timeout'), { killed: true });
      throw error;
    }
    return '[]';
  };

  assert.deepEqual(getWindows(run), []);
  assert.equal(calls, 2);
});

test('getWindows reports a timeout after both attempts', () => {
  const run = () => {
    const error = Object.assign(new Error('timeout'), { killed: true });
    throw error;
  };

  assert.throws(() => getWindows(run), /timed out/);
});

test('getWindows reports PowerShell failures', () => {
  const run = () => {
    throw new Error('boom\nsecond line');
  };

  assert.throws(() => getWindows(run), /Window enumeration failed: boom/);

  const missing = Object.assign(new Error('missing'), { code: 'ENOENT' });
  assert.throws(
    () =>
      getWindows(() => {
        throw missing;
      }),
    /PowerShell not found/,
  );
});

test('listWindows exposes ids and browser flags', () => {
  const run = () => JSON.stringify([{ id: 42, title: 'T', process: 'p', isBrowser: true }]);
  assert.deepEqual(listWindows(run), [{ id: '42', title: 'T', process: 'p', isBrowser: true }]);
});

test('findWindow and findWindowById use the injected enumerator', () => {
  const run = () => JSON.stringify(sample);

  assert.equal(findWindow('notepad', run).title, 'Untitled — Notepad');
  assert.equal(findWindow('does-not-exist', run), null);
  assert.equal(findWindowById('42', () => JSON.stringify([{ id: 42, title: 'X', process: 'x' }])).title, 'X');
  assert.equal(findWindowById('999', run), null);
});

test('runPowerShell invokes PowerShell with the window config', () => {
  const calls = [];
  const exec = (file, args, options) => {
    calls.push({ file, args, options });
    return '[]';
  };

  assert.equal(runPowerShell(exec), '[]');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, 'powershell.exe');
  assert.ok(calls[0].args.includes('-NoProfile'));
  assert.match(calls[0].args.at(-1), /list-windows\.ps1$/);
  assert.equal(calls[0].options.encoding, 'utf8');
  const config = JSON.parse(calls[0].options.env.SW_WINDOW_CONFIG);
  assert.ok(Array.isArray(config.browsers));
  assert.ok(config.contentClasses.firefox);
});
