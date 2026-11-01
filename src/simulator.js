/*
 * NeuroVoice — synthetic EEG source
 * Four channels in the Muse 2 montage (TP9, AF7, AF8, TP10) at 256 Hz.
 * Background: 1/f noise, posterior alpha that grows with the eyes closed,
 * a little beta, mains hum and sensor noise. Artifacts on demand: eye blinks
 * (large frontal dips), jaw clench (broadband EMG over the temporal sites)
 * and poor electrode contact (drift + heavy hum).
 *
 * This replaces a real headband while the UI is being built. The detector
 * only ever sees the samples this produces, never the button presses.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.NV = root.NV || {}; Object.assign(root.NV, factory()); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CHANNELS = ['TP9', 'AF7', 'AF8', 'TP10'];
  const TEMPORAL = new Set([0, 3]);

  /** Small seeded PRNG so tests are reproducible. */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class SyntheticEEG {
    constructor({ fs = 256, seed = 7 } = {}) {
      this.fs = fs;
      this.channels = CHANNELS.slice();
      this.rand = mulberry32(seed);
      this.sampleIndex = 0;

      /** Environment noise, 0 (quiet room) … 1 (noisy). */
      this.noise = 0.25;
      /** Electrode contact per channel. */
      this.contact = [true, true, true, true];
      /** Mix in the occasional involuntary blink every 3–7 s. */
      this.naturalBlinks = true;

      this._eyesTarget = 0;
      this._eyes = 0;
      this._jawTarget = 0;
      this._jaw = 0;
      this._blinks = [];
      this._timers = [];
      this._pink = CHANNELS.map(() => [0, 0, 0]);
      this._drift = [0, 0, 0, 0];
      this._emgPrev = [0, 0, 0, 0];
      this._alphaFreq = [9.8, 10.3, 10.1, 9.9];
      this._alphaPhase = CHANNELS.map(() => this.rand() * Math.PI * 2);
      this._betaPhase = CHANNELS.map(() => this.rand() * Math.PI * 2);
      this._spare = null;
      this._nextNatural = this._naturalDelay();
    }

    /** Stream time in seconds of the next sample to be generated. */
    get time() { return this.sampleIndex / this.fs; }

    gauss() {
      if (this._spare !== null) {
        const s = this._spare;
        this._spare = null;
        return s;
      }
      let u = 0;
      while (u === 0) u = this.rand();
      const v = this.rand();
      const r = Math.sqrt(-2 * Math.log(u));
      this._spare = r * Math.sin(2 * Math.PI * v);
      return r * Math.cos(2 * Math.PI * v);
    }

    _naturalDelay() {
      return this.sampleIndex + Math.round(this.fs * (3 + this.rand() * 4));
    }

    /** Schedule something in stream time (keeps taps consistent with the signal clock). */
    after(seconds, fn) {
      this._timers.push({ at: this.sampleIndex + Math.max(0, Math.round(seconds * this.fs)), fn });
    }

    /** One eye blink. Deliberate blinks are a little larger and longer than natural ones. */
    blink(kind = 'deliberate', delaySec = 0) {
      const natural = kind === 'natural';
      const amp = natural ? 95 + this.rand() * 25 : 150 + this.rand() * 40;
      const dur = natural ? 0.22 + this.rand() * 0.06 : 0.3 + this.rand() * 0.08;
      this._blinks.push({ start: this.sampleIndex + Math.round(delaySec * this.fs), amp, dur });
      return dur;
    }

    /** Two deliberate blinks with a short gap, the "select" gesture. */
    doubleBlink() {
      const first = this.blink('deliberate', 0);
      this.blink('deliberate', first + 0.14 + this.rand() * 0.08);
    }

    jaw(clenched) { this._jawTarget = clenched ? 1 : 0; }

    eyes(closed) { this._eyesTarget = closed ? 1 : 0; }

    /** Generate `n` samples per channel, in microvolts. */
    generate(n) {
      const fs = this.fs;
      const out = CHANNELS.map(() => new Float32Array(n));
      const eyesK = 1 - Math.exp(-1 / (0.25 * fs));
      const jawUp = 1 - Math.exp(-1 / (0.04 * fs));
      const jawDown = 1 - Math.exp(-1 / (0.08 * fs));

      for (let i = 0; i < n; i++) {
        const s = this.sampleIndex;

        if (this._timers.length) {
          const due = this._timers.filter((tm) => tm.at <= s);
          if (due.length) {
            this._timers = this._timers.filter((tm) => tm.at > s);
            due.forEach((tm) => tm.fn());
          }
        }
        if (s >= this._nextNatural) {
          if (this.naturalBlinks && this._eyesTarget === 0) this.blink('natural');
          this._nextNatural = this._naturalDelay();
        }

        this._eyes += (this._eyesTarget - this._eyes) * eyesK;
        this._jaw += (this._jawTarget - this._jaw) * (this._jawTarget > this._jaw ? jawUp : jawDown);

        const t = s / fs;
        let blink = 0;
        for (const b of this._blinks) {
          const d = (s - b.start) / fs;
          if (d >= 0 && d <= b.dur) blink += b.amp * 0.5 * (1 - Math.cos((2 * Math.PI * d) / b.dur));
        }
        const hum = Math.sin(2 * Math.PI * 60 * t);
        const spindle = 0.75 + 0.25 * Math.sin(2 * Math.PI * 0.23 * t);

        for (let c = 0; c < 4; c++) {
          const temporal = TEMPORAL.has(c);
          const white = this.gauss();
          const p = this._pink[c];
          p[0] = 0.99765 * p[0] + white * 0.099046;
          p[1] = 0.963 * p[1] + white * 0.2965164;
          p[2] = 0.57 * p[2] + white * 1.0526913;
          let v = (p[0] + p[1] + p[2] + white * 0.1848) * 0.37 * 9;

          const alphaAmp = (temporal ? 3 + 22 * this._eyes : 1.5 + 7 * this._eyes) * spindle;
          this._alphaPhase[c] += (2 * Math.PI * this._alphaFreq[c]) / fs + this.gauss() * 0.01;
          v += alphaAmp * Math.sin(this._alphaPhase[c]);

          this._betaPhase[c] += (2 * Math.PI * 20.5) / fs + this.gauss() * 0.05;
          v += 1.6 * Math.sin(this._betaPhase[c]);

          v -= blink * (temporal ? 0.12 : 1);

          if (this._jaw > 0.001) {
            const e = this.gauss();
            v += (e - this._emgPrev[c]) * this._jaw * (temporal ? 55 : 18);
            this._emgPrev[c] = e;
          }

          v += hum * (1.2 + 9 * this.noise) + this.gauss() * (1 + 5 * this.noise);

          if (!this.contact[c]) {
            this._drift[c] = 0.998 * this._drift[c] + this.gauss() * 6;
            v += this._drift[c] + hum * 45 + this.gauss() * 22;
          } else {
            this._drift[c] *= 0.99;
          }
          out[c][i] = v;
        }
        this.sampleIndex++;
      }
      this._blinks = this._blinks.filter((b) => (this.sampleIndex - b.start) / fs <= b.dur);
      return out;
    }
  }

  return { SyntheticEEG, CHANNELS, mulberry32 };
});
