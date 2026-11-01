const test = require('node:test');
const assert = require('node:assert/strict');
const { Scanner } = require('../src/scanner.js');

test('linear scanning steps through items and wraps', () => {
  const s = new Scanner();
  s.setGrid([['a', 'b', 'c']], 'linear');
  assert.equal(s.current, 'a');
  s.advance(); s.advance();
  assert.equal(s.current, 'c');
  s.advance();
  assert.equal(s.current, 'a');
  assert.deepEqual(s.select(), { type: 'item', item: 'a' });
});

test('row-column scanning picks a row, then an item', () => {
  const s = new Scanner();
  s.setGrid([['a', 'b'], ['c', 'd'], ['e', 'f']], 'rowcol');
  assert.equal(s.phase, 'row');
  s.advance();
  assert.deepEqual(s.select(), { type: 'row', row: 1 });
  assert.equal(s.current, 'c');
  s.advance();
  assert.deepEqual(s.select(), { type: 'item', item: 'd' });
  assert.equal(s.phase, 'row');
  assert.equal(s.row, 0);
});

test('back returns to rows, and an ignored row times out', () => {
  const s = new Scanner({ cyclesPerRow: 2 });
  s.setGrid([['a', 'b'], ['c', 'd']], 'rowcol');
  s.select();
  assert.equal(s.back(), true);
  assert.equal(s.phase, 'row');
  assert.equal(s.back(), false);
  s.select();
  for (let i = 0; i < 4; i++) s.advance();
  assert.equal(s.phase, 'row');
});

test('a row with one item is chosen straight away', () => {
  const s = new Scanner();
  s.setGrid([['a', 'b'], ['only']], 'rowcol');
  s.advance();
  assert.deepEqual(s.select(), { type: 'item', item: 'only' });
});

test('select can use the snapshot from when the gesture began', () => {
  const s = new Scanner();
  s.setGrid([['a', 'b', 'c']], 'linear');
  const atOnset = s.state();
  s.advance(); // the highlight moved on while the gesture was being confirmed
  assert.deepEqual(s.select(atOnset), { type: 'item', item: 'a' });
  const stale = s.state();
  s.setGrid([['x', 'y']], 'linear'); // a different board: old snapshots are ignored
  s.advance();
  assert.deepEqual(s.select(stale), { type: 'item', item: 'y' });
});
