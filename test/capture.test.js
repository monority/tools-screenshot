const test = require('node:test');
const assert = require('node:assert/strict');
const { findDisplay, cropTop } = require('../src/capture');

const displays = [
  { id: 'DISPLAY1', left: 0, top: 0, right: 1920, bottom: 1080, width: 1920, height: 1080 },
  { id: 'DISPLAY2', left: 1920, top: 0, right: 3840, bottom: 1080, width: 1920, height: 1080 },
];

test('findDisplay picks the monitor holding most of the window', () => {
  const mostlyRight = { x: 1500, y: 100, width: 1000, height: 600 };
  assert.equal(findDisplay(displays, mostlyRight).id, 'DISPLAY2');

  const mostlyLeft = { x: 900, y: 100, width: 1000, height: 600 };
  assert.equal(findDisplay(displays, mostlyLeft).id, 'DISPLAY1');
});

test('findDisplay handles a window entirely on one monitor', () => {
  assert.equal(findDisplay(displays, { x: 2000, y: 50, width: 400, height: 300 }).id, 'DISPLAY2');
});

test('findDisplay falls back to the first display when nothing overlaps', () => {
  assert.equal(findDisplay(displays, { x: 5000, y: 5000, width: 100, height: 100 }).id, 'DISPLAY1');
});

test('cropTop slices raw pixels row by row', () => {
  const width = 2;
  const height = 3;
  const channels = 3;
  const data = Buffer.from([1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6]);
  const result = cropTop({ data, width, height, channels }, 1);

  assert.equal(result.width, 2);
  assert.equal(result.height, 2);
  assert.equal(result.channels, 3);
  assert.deepEqual([...result.data], [3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6]);
});
