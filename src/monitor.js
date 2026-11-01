/*
 * NeuroVoice — signal monitor
 * Draws the filtered channels as a moving strip of EEG chart paper:
 * 0.2 s / 1 s grid, one ink trace per channel, a 100 µV / 1 s calibration
 * mark, shaded eyes-closed stretches, and red-pen notes where the detector
 * fired, the way a technologist marks a recording.
 */
(function (root, factory) {
  root.NV = root.NV || {};
  Object.assign(root.NV, factory());
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LABEL_GUTTER = 48;
  const TOP = 26;
  const BOTTOM = 22;
  const RIGHT = 10;

  class SignalMonitor {
    constructor(canvas, detector, { seconds = 5, uvPerRow = 240 } = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.det = detector;
      this.seconds = seconds;
      this.uvPerRow = uvPerRow;
      this.notes = [];
      this.closures = [];
      this.quality = detector.channels.map(() => 'good');
      this._bufs = detector.channels.map(() => null);
      this.readColors();
      this.resize();
      if (typeof ResizeObserver !== 'undefined') {
        this._ro = new ResizeObserver(() => this.resize());
        this._ro.observe(canvas);
      }
    }

    readColors() {
      const cs = getComputedStyle(document.documentElement);
      const v = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
      this.colors = {
        paper: v('--paper', '#f2f6f4'),
        grid: v('--grid', '#dce8e3'),
        gridMajor: v('--grid-major', '#c3d6ce'),
        ink: v('--ink', '#15243a'),
        inkSoft: v('--ink-soft', '#536274'),
        annot: v('--annot', '#c0262d'),
        closure: v('--closure', 'rgba(192,38,45,0.07)'),
        good: v('--good', '#23784a'),
        fair: v('--fair', '#a56a00'),
        bad: v('--bad', '#c0262d'),
      };
      this.fontUI = v('--font-ui', 'sans-serif');
      this.fontPen = v('--font-pen', 'cursive');
    }

    resize() {
      const r = this.canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = r.width;
      this.h = r.height;
      this.dpr = dpr;
      this.canvas.width = Math.max(1, Math.round(r.width * dpr));
      this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    }

    annotate(t, label, kind) { this.notes.push({ t, label, kind }); }

    /** Give an existing note (matched by time) a new label. */
    relabel(t, label) {
      const note = this.notes.find((n) => Math.abs(n.t - t) < 1e-6);
      if (note) note.label = label;
    }

    eyesClosedAt(t) {
      this.closures.push({ start: t, end: null });
      this.annotate(t, '눈 감음', 'eyes');
    }

    eyesOpenedAt(t) {
      const last = this.closures[this.closures.length - 1];
      if (last && last.end === null) last.end = t;
      this.annotate(t, '눈 뜸', 'eyes');
    }

    setQuality(q) { this.quality = q.slice(); }

    draw() {
      const { ctx, w, h } = this;
      if (!w || !h) return;
      const C = this.colors;
      const det = this.det;
      const fs = det.fs;
      const nCh = det.channels.length;
      const N = Math.round(this.seconds * fs);
      const x0 = LABEL_GUTTER;
      const plotW = w - LABEL_GUTTER - RIGHT;
      const plotH = h - TOP - BOTTOM;
      const rowH = plotH / nCh;
      const now = det.time;
      const tStart = now - this.seconds;
      const xOf = (t) => x0 + ((t - tStart) / this.seconds) * plotW;

      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.fillStyle = C.paper;
      ctx.fillRect(0, 0, w, h);

      // Eyes-closed stretches.
      ctx.fillStyle = C.closure;
      for (const c of this.closures) {
        const a = Math.max(c.start, tStart);
        const b = c.end === null ? now : Math.min(c.end, now);
        if (b > a) ctx.fillRect(xOf(a), TOP, xOf(b) - xOf(a), plotH);
      }
      this.closures = this.closures.filter((c) => c.end === null || c.end > tStart);

      // Paper grid: horizontal quarters per channel, vertical 0.2 s / 1 s, moving with the signal.
      ctx.lineWidth = 1;
      for (let i = 0; i <= nCh * 4; i++) {
        const y = Math.round(TOP + (plotH * i) / (nCh * 4)) + 0.5;
        ctx.strokeStyle = i % 4 === 0 ? C.gridMajor : C.grid;
        ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + plotW, y); ctx.stroke();
      }
      const firstTick = Math.ceil(tStart * 5) / 5;
      for (let t = firstTick; t <= now + 1e-9; t += 0.2) {
        const x = Math.round(xOf(t)) + 0.5;
        const major = Math.abs(t - Math.round(t)) < 1e-6;
        ctx.strokeStyle = major ? C.gridMajor : C.grid;
        ctx.beginPath(); ctx.moveTo(x, TOP); ctx.lineTo(x, TOP + plotH); ctx.stroke();
      }

      // Traces.
      const scale = (rowH * 0.9) / this.uvPerRow;
      ctx.lineJoin = 'round';
      ctx.lineWidth = 1.25;
      for (let c = 0; c < nCh; c++) {
        const mid = TOP + rowH * (c + 0.5);
        const buf = (this._bufs[c] = det.display[c].latest(N, this._bufs[c]));
        const n = buf.length;
        if (n > 1) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(x0, TOP + rowH * c - rowH * 0.3, plotW, rowH * 1.6);
          ctx.clip();
          ctx.strokeStyle = this.quality[c] === 'bad' ? C.inkSoft : C.ink;
          ctx.beginPath();
          const step = plotW / (N - 1);
          const xFirst = x0 + (N - n) * step;
          const perPx = 1 / step;
          if (perPx > 1.5) {
            // Min/max per pixel column keeps blink peaks and EMG bursts visible.
            let col = -1;
            let lo = 0;
            let hi = 0;
            let started = false;
            for (let i = 0; i < n; i++) {
              const px = Math.floor(xFirst + i * step);
              const v = buf[i];
              if (px !== col) {
                if (col >= 0) {
                  const yHi = mid - hi * scale;
                  const yLo = mid - lo * scale;
                  if (!started) { ctx.moveTo(col, yHi); started = true; } else ctx.lineTo(col, yHi);
                  ctx.lineTo(col, yLo);
                }
                col = px; lo = v; hi = v;
              } else {
                if (v < lo) lo = v;
                if (v > hi) hi = v;
              }
            }
            if (col >= 0) { ctx.lineTo(col, mid - hi * scale); ctx.lineTo(col, mid - lo * scale); }
          } else {
            for (let i = 0; i < n; i++) {
              const x = xFirst + i * step;
              const y = mid - buf[i] * scale;
              if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
          }
          ctx.stroke();
          ctx.restore();
        }

        // Channel name and contact dot in the gutter.
        ctx.fillStyle = C.paper;
        ctx.fillRect(0, mid - 10, LABEL_GUTTER - 2, 20);
        ctx.fillStyle = C.ink;
        ctx.font = `600 12px ${this.fontUI}`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillText(det.channels[c], 14, mid);
        ctx.fillStyle = C[this.quality[c]] || C.good;
        ctx.beginPath(); ctx.arc(6, mid, 3.5, 0, Math.PI * 2); ctx.fill();
      }

      // Calibration mark: 100 µV tall, 1 s wide.
      const calH = 100 * scale;
      const xR = x0 + plotW - 2;
      const yB = h - 6;
      const calW = plotW / this.seconds;
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(xR - calW, yB); ctx.lineTo(xR, yB); ctx.lineTo(xR, yB - Math.min(calH, BOTTOM + rowH * 0.6));
      ctx.stroke();
      ctx.fillStyle = C.inkSoft;
      ctx.font = `11px ${this.fontUI}`;
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'right';
      ctx.fillText('1 s', xR - calW - 6, yB + 1);
      ctx.fillText('100 µV', xR - 6, yB - Math.min(calH, BOTTOM + rowH * 0.6) + 10);

      // Red-pen notes.
      this.notes = this.notes.filter((nt) => nt.t > tStart - 0.5);
      ctx.strokeStyle = C.annot;
      ctx.fillStyle = C.annot;
      ctx.lineWidth = 1;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.font = `21px ${this.fontPen}`;
      let lastRight = -Infinity;
      let level = 0;
      const sorted = this.notes.slice().sort((a, b) => a.t - b.t);
      for (const nt of sorted) {
        const x = Math.round(xOf(nt.t)) + 0.5;
        if (x < x0) continue;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(x, TOP - 4); ctx.lineTo(x, TOP + plotH); ctx.stroke();
        ctx.setLineDash([]);
        if (!nt.label) continue;
        const width = ctx.measureText(nt.label).width;
        level = x < lastRight + 4 ? (level + 1) % 2 : 0;
        const tx = Math.min(x + 3, w - width - 2);
        ctx.fillText(nt.label, tx, TOP - 6 + level * 18);
        lastRight = tx + width;
      }
    }
  }

  return { SignalMonitor };
});
