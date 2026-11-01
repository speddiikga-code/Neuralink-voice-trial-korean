const test = require('node:test');
const assert = require('node:assert/strict');
const { powerSpectrum, toneAmplitude, Biquad } = require('../src/dsp.js');

const FS = 256;
const sine = (n, f, amp = 1) => Float64Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * f * i) / FS));

test('spectrum peaks at the tone frequency', () => {
  const { psd, df } = powerSpectrum(sine(256, 10, 10), FS);
  let peak = 0;
  for (let k = 1; k < psd.length; k++) if (psd[k] > psd[peak]) peak = k;
  assert.equal(peak * df, 10);
});

test('Goertzel reads the amplitude of 60 Hz mains hum', () => {
  assert.ok(Math.abs(toneAmplitude(sine(256, 60, 12), FS, 60) - 12) < 0.01);
});

test('notch removes 60 Hz and keeps 10 Hz', () => {
  const gain = (f) => {
    const bq = Biquad.design('notch', FS, 60, 8);
    const x = sine(FS * 4, f);
    let sum = 0;
    let n = 0;
    x.forEach((v, i) => {
      const y = bq.process(v);
      if (i >= FS * 2) { sum += y * y; n++; }
    });
    return Math.sqrt(sum / n) * Math.SQRT2;
  };
  assert.ok(gain(60) < 0.05);
  assert.ok(gain(10) > 0.95);
});
