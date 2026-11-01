const test = require('node:test');
const assert = require('node:assert/strict');
const { SyntheticEEG } = require('../src/simulator.js');
const { EventDetector } = require('../src/detector.js');

const GESTURES = new Set(['blink', 'doubleBlink', 'jawClench', 'eyesClosed', 'eyesOpened']);

function rig(seed = 3) {
  const sim = new SyntheticEEG({ seed });
  sim.naturalBlinks = false;
  const det = new EventDetector();
  const events = [];
  det.on((e) => { if (GESTURES.has(e.type)) events.push(e.type); });
  const run = (seconds) => {
    const n = Math.round(seconds * sim.fs);
    for (let i = 0; i < n; i += 32) det.process(sim.generate(Math.min(32, n - i)));
  };
  return { sim, det, events, run };
}

test('a quiet recording produces no gestures', () => {
  const { events, run } = rig();
  run(10);
  assert.deepEqual(events, []);
});

test('two quick blinks become a select', () => {
  const { sim, events, run } = rig();
  run(4);
  sim.doubleBlink();
  run(2);
  assert.deepEqual(events, ['blink', 'blink', 'doubleBlink']);
});

test('involuntary blinks never select', () => {
  const sim = new SyntheticEEG({ seed: 11 });
  const det = new EventDetector();
  let blinks = 0;
  let doubles = 0;
  det.on((e) => {
    if (e.type === 'blink') blinks++;
    if (e.type === 'doubleBlink') doubles++;
  });
  for (let i = 0; i < 256 * 90; i += 32) det.process(sim.generate(32));
  assert.ok(blinks >= 10, `expected at least 10 blinks, got ${blinks}`);
  assert.equal(doubles, 0);
});

test('each jaw clench fires once', () => {
  const { sim, events, run } = rig();
  run(4);
  for (let k = 0; k < 2; k++) {
    sim.jaw(true);
    sim.after(0.7, () => sim.jaw(false));
    run(2);
  }
  assert.deepEqual(events, ['jawClench', 'jawClench']);
});

test('closed eyes raise the alpha share and fire once', () => {
  const { sim, det, events, run } = rig();
  run(6);
  const open = det.alphaShare;
  sim.eyes(true);
  run(3);
  assert.ok(det.alphaShare > open * 2);
  sim.eyes(false);
  run(3);
  assert.deepEqual(events, ['eyesClosed', 'eyesOpened']);
});

test('a lifted electrode is flagged and the other side still works', () => {
  const { sim, det, events, run } = rig();
  sim.contact[1] = false; // AF7
  run(4);
  assert.equal(det.quality[1], 'bad');
  assert.equal(det.quality[2], 'good');
  sim.doubleBlink();
  run(2);
  assert.ok(events.includes('doubleBlink'));
});
