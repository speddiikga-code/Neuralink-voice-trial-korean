/*
 * NeuroVoice — DSP helpers
 * FFT, Hann window, power spectrum, band power, Goertzel tone amplitude,
 * RBJ biquad filters and a small ring buffer. No dependencies.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.NV = root.NV || {}; Object.assign(root.NV, factory()); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** In-place iterative radix-2 FFT. `re` and `im` must share a power-of-two length. */
  function fft(re, im) {
    const n = re.length;
    if (n & (n - 1)) throw new Error('FFT length must be a power of two');
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1;
      const ang = (-2 * Math.PI) / len;
      const wr = Math.cos(ang);
      const wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1;
        let ci = 0;
        for (let k = 0; k < half; k++) {
          const a = i + k;
          const b = a + half;
          const vr = re[b] * cr - im[b] * ci;
          const vi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - vr;
          im[b] = im[a] - vi;
          re[a] += vr;
          im[a] += vi;
          const nr = cr * wr - ci * wi;
          ci = cr * wi + ci * wr;
          cr = nr;
        }
      }
    }
  }

  const hannCache = new Map();
  function hann(n) {
    let w = hannCache.get(n);
    if (!w) {
      w = new Float64Array(n);
      for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
      hannCache.set(n, w);
    }
    return w;
  }

  /** One-sided power spectrum (mean removed, Hann window). Returns { psd, df }. */
  function powerSpectrum(samples, fs) {
    const n = samples.length;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    let mean = 0;
    for (let i = 0; i < n; i++) mean += samples[i];
    mean /= n;
    const w = hann(n);
    for (let i = 0; i < n; i++) re[i] = (samples[i] - mean) * w[i];
    fft(re, im);
    const bins = n / 2 + 1;
    const psd = new Float64Array(bins);
    for (let k = 0; k < bins; k++) psd[k] = (re[k] * re[k] + im[k] * im[k]) / n;
    return { psd, df: fs / n };
  }

  /** Sum of spectral power in [lo, hi) Hz. */
  function bandPower(spec, lo, hi) {
    const { psd, df } = spec;
    let sum = 0;
    for (let k = Math.max(0, Math.ceil(lo / df)); k < psd.length && k * df < hi; k++) sum += psd[k];
    return sum;
  }

  /** Amplitude of a single frequency component (Goertzel), in the input's units. */
  function toneAmplitude(samples, fs, freq) {
    const n = samples.length;
    const k = Math.round((n * freq) / fs);
    const coeff = 2 * Math.cos((2 * Math.PI * k) / n);
    let s1 = 0;
    let s2 = 0;
    for (let i = 0; i < n; i++) {
      const s0 = samples[i] + coeff * s1 - s2;
      s2 = s1;
      s1 = s0;
    }
    const power = s1 * s1 + s2 * s2 - coeff * s1 * s2;
    return (2 * Math.sqrt(Math.max(power, 0))) / n;
  }

  /** Second-order IIR section (transposed direct form II), RBJ cookbook designs. */
  class Biquad {
    constructor(b0, b1, b2, a1, a2) {
      this.b0 = b0; this.b1 = b1; this.b2 = b2;
      this.a1 = a1; this.a2 = a2;
      this.z1 = 0; this.z2 = 0;
    }

    process(x) {
      const y = this.b0 * x + this.z1;
      this.z1 = this.b1 * x - this.a1 * y + this.z2;
      this.z2 = this.b2 * x - this.a2 * y;
      return y;
    }

    reset() { this.z1 = 0; this.z2 = 0; }

    static design(type, fs, f0, q = Math.SQRT1_2) {
      const w0 = (2 * Math.PI * f0) / fs;
      const cos = Math.cos(w0);
      const alpha = Math.sin(w0) / (2 * q);
      let b0;
      let b1;
      let b2;
      if (type === 'lowpass') { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0; }
      else if (type === 'highpass') { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0; }
      else if (type === 'notch') { b0 = 1; b1 = -2 * cos; b2 = 1; }
      else throw new Error('Unknown filter type: ' + type);
      const a0 = 1 + alpha;
      return new Biquad(b0 / a0, b1 / a0, b2 / a0, (-2 * cos) / a0, (1 - alpha) / a0);
    }
  }

  /** Fixed-size circular buffer of numbers. */
  class RingBuffer {
    constructor(capacity) {
      this.capacity = capacity;
      this.data = new Float32Array(capacity);
      this.size = 0;
      this.head = 0;
    }

    push(x) {
      this.data[this.head] = x;
      this.head = (this.head + 1) % this.capacity;
      if (this.size < this.capacity) this.size++;
    }

    /** Latest `n` values, oldest first. Reuses `out` when it has the right length. */
    latest(n, out) {
      const m = Math.min(n, this.size);
      const res = out && out.length === m ? out : new Float32Array(m);
      let idx = (this.head - m + this.capacity) % this.capacity;
      for (let i = 0; i < m; i++) {
        res[i] = this.data[idx];
        idx = (idx + 1) % this.capacity;
      }
      return res;
    }
  }

  const BANDS = [
    { key: 'delta', symbol: 'δ', name: '델타', lo: 1, hi: 4 },
    { key: 'theta', symbol: 'θ', name: '세타', lo: 4, hi: 8 },
    { key: 'alpha', symbol: 'α', name: '알파', lo: 8, hi: 13 },
    { key: 'beta', symbol: 'β', name: '베타', lo: 13, hi: 30 },
    { key: 'gamma', symbol: 'γ', name: '감마', lo: 30, hi: 44 },
  ];

  return { fft, hann, powerSpectrum, bandPower, toneAmplitude, Biquad, RingBuffer, BANDS };
});
