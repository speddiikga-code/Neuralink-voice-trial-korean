/*
 * NeuroVoice — switch scanning
 * The highlight moves on its own; one "select" gesture picks what is lit.
 *   linear  — step through every item (used for the four suggested replies)
 *   rowcol  — step through rows, select a row, then step through its items
 * After a selection the scan holds briefly, then starts again from the top.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.NV = root.NV || {}; Object.assign(root.NV, factory()); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class Scanner {
    constructor({ dwell = 1200, onChange = () => {}, cyclesPerRow = 2, holdAfterSelect = 900 } = {}) {
      this.dwell = dwell;
      this.onChange = onChange;
      this.cyclesPerRow = cyclesPerRow;
      this.holdAfterSelect = holdAfterSelect;
      this.rows = [];
      this.mode = 'linear';
      this.phase = 'item';
      this.row = 0;
      this.col = 0;
      this.cycles = 0;
      this.running = false;
      this.gridId = 0;
      this._timer = null;
    }

    get usesRows() { return this.mode === 'rowcol' && this.rows.length > 1; }

    /** rows: array of arrays of items (any values). */
    setGrid(rows, mode = 'rowcol') {
      this.rows = rows.filter((r) => r.length);
      this.mode = mode;
      this.gridId += 1;
      this.reset();
    }

    reset(hold = 0) {
      this.row = 0;
      this.col = 0;
      this.cycles = 0;
      this.phase = this.usesRows ? 'row' : 'item';
      this._kick(hold);
    }

    start() { this.running = true; this._kick(); }

    stop() { this.running = false; clearTimeout(this._timer); }

    setDwell(ms) { this.dwell = ms; this._kick(); }

    /** Item under the highlight, or null while rows are being scanned. */
    get current() { return this.phase === 'item' && this.rows[this.row] ? this.rows[this.row][this.col] : null; }

    state(stepMs = this.dwell) {
      return { gridId: this.gridId, mode: this.mode, phase: this.phase, row: this.row, col: this.col, dwell: this.dwell, stepMs };
    }

    /** Move the highlight one step. */
    advance() {
      if (!this.rows.length) return;
      if (this.phase === 'row') {
        this.row = (this.row + 1) % this.rows.length;
        return;
      }
      this.col += 1;
      if (this.col >= this.rows[this.row].length) {
        this.col = 0;
        if (this.usesRows && ++this.cycles >= this.cyclesPerRow) {
          this.phase = 'row';
          this.cycles = 0;
        }
      }
    }

    /**
     * The select gesture. Returns { type: 'row' } or { type: 'item', item }, or null if empty.
     * Pass the state() snapshot from when the gesture began to undo detection latency:
     * the highlight may have moved on while the second blink was still being confirmed.
     */
    select(at) {
      if (!this.rows.length) return null;
      if (at && at.gridId === this.gridId) {
        this.phase = at.phase;
        this.row = at.row;
        this.col = at.col;
      }
      if (this.phase === 'row') {
        const row = this.rows[this.row];
        if (row.length === 1) {
          this.reset(this.holdAfterSelect);
          return { type: 'item', item: row[0] };
        }
        this.phase = 'item';
        this.col = 0;
        this.cycles = 0;
        this._kick();
        return { type: 'row', row: this.row };
      }
      const item = this.rows[this.row][this.col];
      this.reset(this.holdAfterSelect);
      return { type: 'item', item };
    }

    /** The back gesture inside a row returns to row scanning. Returns true if it did something. */
    back() {
      if (!this.usesRows || this.phase !== 'item') return false;
      this.phase = 'row';
      this.cycles = 0;
      this._kick();
      return true;
    }

    _kick(hold = 0) {
      clearTimeout(this._timer);
      this.onChange(this.state(this.dwell + hold));
      if (!this.running || !this.rows.length) return;
      const tick = () => {
        this.advance();
        this.onChange(this.state());
        this._timer = setTimeout(tick, this.dwell);
      };
      this._timer = setTimeout(tick, this.dwell + hold);
    }
  }

  return { Scanner };
});
