/*
 * NeuroVoice — event detector
 * Turns a 4-channel stream into the three gestures the board understands:
 *
 *   doubleBlink  two blinks within 0.8 s on AF7/AF8   -> select
 *   jawClench    EMG burst (>30 Hz) on TP9/TP10       -> switch board
 *   eyesClosed   alpha (8–13 Hz) share rises and stays -> back / delete
 *
 * Per channel: 0.5 Hz high-pass, 60 Hz notch, 40 Hz low-pass for display and
 * spectra; a separate 30 Hz high-pass feeds the EMG envelope. Contact quality
 * comes from the 60 Hz hum amplitude, and channels marked "bad" are left out
 * of every detector.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./dsp.js'));
  else { root.NV = root.NV || {}; Object.assign(root.NV, factory(root.NV)); }
})(typeof self !== 'undefined' ? self : this, function (dsp) {
  'use strict';
  const { Biquad, RingBuffer, powerSpectrum, bandPower, toneAmplitude, BANDS } = dsp;

  const DEFAULTS = {
    blinkThreshold: 70, // µV, mean frontal deflection (blinks are negative-going here)
    blinkMinDur: 0.06, // s, measured above threshold
    blinkMaxDur: 0.7,
    blinkGap: 0.08, // s of quiet required between blinks
    doubleBlinkWindow: 0.8, // s between onsets
    jawFloor: 12, // µV RMS
    jawFactor: 3.5, // × quiet baseline
    jawHold: 0.15, // s above threshold before firing
    jawRearm: 0.3, // s below threshold before it can fire again
    alphaFloor: 0.4, // share of 1–44 Hz power
    alphaFactor: 1.8, // × eyes-open baseline
    alphaHold: 1.0, // s the alpha share must stay high
    alphaRelease: 0.5, // s below 80 % of threshold to count as eyes open again
    analysisEvery: 0.125, // s
    window: 1, // s of signal per spectrum
    humGood: 8, // µV at 60 Hz
    humBad: 20,
  };

  class EventDetector {
    constructor({ fs = 256, channels = ['TP9', 'AF7', 'AF8', 'TP10'], displaySeconds = 6, ...opts } = {}) {
      this.fs = fs;
      this.channels = channels.slice();
      this.opts = { ...DEFAULTS, ...opts };
      this.sampleIndex = 0;

      this._hp = channels.map(() => Biquad.design('highpass', fs, 0.5));
      this._notch = channels.map(() => Biquad.design('notch', fs, 60, 8));
      this._lp = channels.map(() => Biquad.design('lowpass', fs, 40));
      this._emgHp = channels.map(() => Biquad.design('highpass', fs, 30));
      this.display = channels.map(() => new RingBuffer(Math.round(displaySeconds * fs)));
      this.raw = channels.map(() => new RingBuffer(fs * 2));

      this._emgW = Math.round(0.1 * fs);
      this._emgBuf = channels.map(() => new Float64Array(this._emgW));
      this._emgSum = channels.map(() => 0);
      this._emgPos = 0;
      this._cur = new Float64Array(channels.length);

      this.frontal = ['AF7', 'AF8'].map((n) => channels.indexOf(n)).filter((i) => i >= 0);
      this.temporal = ['TP9', 'TP10'].map((n) => channels.indexOf(n)).filter((i) => i >= 0);
      this.quality = channels.map(() => 'good');
      this.hum = channels.map(() => 0);
      this.bands = null;
      this.alphaShare = 0;

      this._blink = { active: false, start: 0, peak: 0, lastEnd: -Infinity, lastOnset: -Infinity };
      this._jaw = { above: 0, below: 0, active: false, baseline: null };
      this._alpha = { baseline: null, above: 0, below: 0, closed: false };
      this._nextAnalysis = Math.round(this.opts.analysisEvery * fs);
      this._nextQuality = Math.round(0.5 * fs);
      this._analysisCount = 0;
      this._listeners = [];
    }

    /** Stream time (s) of the latest processed sample. */
    get time() { return this.sampleIndex / this.fs; }

    on(fn) {
      this._listeners.push(fn);
      return () => { this._listeners = this._listeners.filter((f) => f !== fn); };
    }

    _emit(ev) { for (const fn of this._listeners) fn(ev); }

    _usable(indices) { return indices.filter((c) => this.quality[c] !== 'bad'); }

    /** Feed one chunk: an array (per channel) of equally long sample arrays, in µV. */
    process(chunk) {
      const n = chunk[0].length;
      const nc = this.channels.length;
      for (let i = 0; i < n; i++) {
        for (let c = 0; c < nc; c++) {
          const x = chunk[c][i];
          this.raw[c].push(x);
          const y0 = this._notch[c].process(this._hp[c].process(x));
          const y = this._lp[c].process(y0);
          this.display[c].push(y);
          this._cur[c] = y;
          const e = this._emgHp[c].process(y0);
          const sq = e * e;
          this._emgSum[c] += sq - this._emgBuf[c][this._emgPos];
          this._emgBuf[c][this._emgPos] = sq;
        }
        this._emgPos = (this._emgPos + 1) % this._emgW;
        this.sampleIndex++;

        this._stepBlink();
        this._stepJaw();
        if (this.sampleIndex >= this._nextAnalysis) {
          this._analyze();
          this._nextAnalysis += Math.round(this.opts.analysisEvery * this.fs);
        }
        if (this.sampleIndex >= this._nextQuality) {
          this._checkQuality();
          this._nextQuality += Math.round(0.5 * this.fs);
        }
      }
    }

    _stepBlink() {
      const idx = this._usable(this.frontal);
      const b = this._blink;
      if (!idx.length) { b.active = false; return; }
      let v = 0;
      for (const c of idx) v += this._cur[c];
      const dip = -v / idx.length;
      const o = this.opts;
      const t = this.time;

      if (!b.active) {
        if (dip > o.blinkThreshold && t - b.lastEnd >= o.blinkGap) {
          b.active = true;
          b.start = t;
          b.peak = dip;
        }
        return;
      }
      if (dip > b.peak) b.peak = dip;
      if (dip < o.blinkThreshold * 0.4) {
        b.active = false;
        b.lastEnd = t;
        const dur = t - b.start;
        if (dur >= o.blinkMinDur && dur <= o.blinkMaxDur) this._onBlink(b.start, b.peak);
      }
    }

    _onBlink(onset, peak) {
      const b = this._blink;
      this._emit({ type: 'blink', t: onset, peak });
      if (onset - b.lastOnset <= this.opts.doubleBlinkWindow) {
        this._emit({ type: 'doubleBlink', t: onset, first: b.lastOnset });
        b.lastOnset = -Infinity; // a third blink starts a new pair
      } else {
        b.lastOnset = onset;
      }
    }

    _stepJaw() {
      const idx = this._usable(this.temporal);
      if (!idx.length) return;
      let rms = 0;
      for (const c of idx) rms += Math.sqrt(Math.max(this._emgSum[c], 0) / this._emgW);
      rms /= idx.length;

      const j = this._jaw;
      const o = this.opts;
      if (j.baseline === null) {
        if (this.sampleIndex < this._emgW) return;
        j.baseline = rms;
      }
      const threshold = Math.max(o.jawFloor, j.baseline * o.jawFactor);
      if (rms > threshold) {
        j.above++;
        j.below = 0;
      } else {
        j.below++;
        j.above = 0;
        if (!j.active) j.baseline += (rms - j.baseline) * 0.002;
      }
      if (!j.active && j.above >= o.jawHold * this.fs) {
        j.active = true;
        this._emit({ type: 'jawClench', t: this.time - o.jawHold, rms });
      } else if (j.active && j.below >= o.jawRearm * this.fs) {
        j.active = false;
        this._emit({ type: 'jawRelease', t: this.time });
      }
    }

    _analyze() {
      const n = Math.round(this.opts.window * this.fs);
      if (this.display[0].size < n) return;
      const usable = this._usable(this.channels.map((_, i) => i));
      if (!usable.length) return;

      const shares = {};
      BANDS.forEach((band) => { shares[band.key] = 0; });
      const alphaShares = [];
      for (const c of usable) {
        const spec = powerSpectrum(this.display[c].latest(n), this.fs);
        const total = bandPower(spec, 1, 44) || 1;
        for (const band of BANDS) {
          const share = bandPower(spec, band.lo, band.hi) / total;
          shares[band.key] += share / usable.length;
          if (band.key === 'alpha' && this.temporal.includes(c)) alphaShares.push(share);
        }
      }
      this.bands = shares;
      this._analysisCount++;
      if (this._analysisCount % 2 === 0) this._emit({ type: 'bands', t: this.time, bands: { ...shares } });

      if (!alphaShares.length) return;
      const ratio = alphaShares.reduce((a, b) => a + b, 0) / alphaShares.length;
      this.alphaShare = ratio;

      const a = this._alpha;
      const o = this.opts;
      const step = o.analysisEvery;
      if (a.baseline === null) a.baseline = ratio;
      const threshold = Math.max(o.alphaFloor, a.baseline * o.alphaFactor);
      if (!a.closed) {
        if (ratio > threshold) {
          a.above += step;
          if (a.above >= o.alphaHold) {
            a.closed = true;
            a.below = 0;
            this._emit({ type: 'eyesClosed', t: this.time - a.above, alphaShare: ratio });
          }
        } else {
          a.above = 0;
          a.baseline += (ratio - a.baseline) * 0.05;
        }
      } else if (ratio < threshold * 0.8) {
        a.below += step;
        if (a.below >= o.alphaRelease) {
          a.closed = false;
          a.above = 0;
          this._emit({ type: 'eyesOpened', t: this.time - a.below, alphaShare: ratio });
        }
      } else {
        a.below = 0;
      }
    }

    _checkQuality() {
      const n = this.fs;
      if (this.raw[0].size < n) return;
      const o = this.opts;
      const next = this.channels.map((_, c) => {
        const hum = toneAmplitude(this.raw[c].latest(n), this.fs, 60);
        this.hum[c] = hum;
        if (hum < o.humGood) return 'good';
        return hum < o.humBad ? 'fair' : 'bad';
      });
      const changed = next.some((q, i) => q !== this.quality[i]);
      this.quality = next;
      if (changed) this._emit({ type: 'quality', t: this.time, quality: next.slice(), hum: this.hum.slice() });
    }
  }

  return { EventDetector, DETECTOR_DEFAULTS: DEFAULTS };
});
