const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { detectNavBarFast } = require('../src/navbar-detector');

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'navbar');
const manifest = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'manifest.json'), 'utf8'));

test('navbar fixture manifest is complete and stable', () => {
  assert.equal(manifest.version, 1);
  assert.ok(Array.isArray(manifest.cases));
  assert.ok(manifest.cases.length >= 5);

  const files = new Set(manifest.cases.map((entry) => entry.file));
  assert.equal(files.size, manifest.cases.length, 'fixture file names must be unique');

  for (const entry of manifest.cases) {
    assert.ok(fs.existsSync(path.join(FIXTURE_DIR, entry.file)), `missing fixture ${entry.file}`);
    assert.equal(typeof entry.expectedNavBarHeight, 'number');
    assert.ok(entry.tolerancePx >= 0);
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
  }
});

for (const entry of manifest.cases) {
  test(`navbar fixture: ${entry.file}`, async () => {
    const buffer = fs.readFileSync(path.join(FIXTURE_DIR, entry.file));

    const digest = crypto.createHash('sha256').update(buffer).digest('hex');
    assert.equal(digest, entry.sha256, 'fixture changed — regenerate with npm run fixtures');

    const result = await detectNavBarFast(buffer);

    if (entry.expectedNavBarHeight === 0) {
      assert.equal(result.found, false, `expected no navbar in ${entry.file}`);
      assert.equal(result.navBarHeight, 0);
      return;
    }

    assert.equal(result.found, true, `expected a navbar in ${entry.file}`);
    const delta = Math.abs(result.navBarHeight - entry.expectedNavBarHeight);
    assert.ok(
      delta <= entry.tolerancePx,
      `${entry.file}: detected ${result.navBarHeight}px, expected ${entry.expectedNavBarHeight}px ±${entry.tolerancePx}px`,
    );
  });
}
