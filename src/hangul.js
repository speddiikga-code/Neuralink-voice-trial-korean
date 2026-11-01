/*
 * NeuroVoice — Hangul composer
 * Builds syllables from single jamo the way a 2-set (두벌식) keyboard does,
 * so the scanning keyboard can offer 자모 keys instead of 11,172 syllables.
 * Handles compound vowels (ㅗ+ㅏ=ㅘ), compound final consonants (ㄹ+ㄱ=ㄺ)
 * and moving a final consonant to the next syllable (갑+ㅣ → 가비).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.NV = root.NV || {}; Object.assign(root.NV, factory()); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  const JUNG = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'];
  const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

  const VOWEL_PAIRS = { 'ㅗㅏ': 'ㅘ', 'ㅗㅐ': 'ㅙ', 'ㅗㅣ': 'ㅚ', 'ㅜㅓ': 'ㅝ', 'ㅜㅔ': 'ㅞ', 'ㅜㅣ': 'ㅟ', 'ㅡㅣ': 'ㅢ' };
  const JONG_PAIRS = {
    'ㄱㅅ': 'ㄳ', 'ㄴㅈ': 'ㄵ', 'ㄴㅎ': 'ㄶ', 'ㄹㄱ': 'ㄺ', 'ㄹㅁ': 'ㄻ', 'ㄹㅂ': 'ㄼ',
    'ㄹㅅ': 'ㄽ', 'ㄹㅌ': 'ㄾ', 'ㄹㅍ': 'ㄿ', 'ㄹㅎ': 'ㅀ', 'ㅂㅅ': 'ㅄ',
  };
  const invert = (pairs) => Object.fromEntries(Object.entries(pairs).map(([k, v]) => [v, [k[0], k[1]]]));
  const VOWEL_SPLIT = invert(VOWEL_PAIRS);
  const JONG_SPLIT = invert(JONG_PAIRS);

  const isVowel = (j) => JUNG.includes(j);
  const isConsonant = (j) => CHO.includes(j);

  function composeSyllable(cho, jung, jong = '') {
    if (cho && jung) {
      return String.fromCharCode(0xac00 + (CHO.indexOf(cho) * 21 + JUNG.indexOf(jung)) * 28 + JONG.indexOf(jong));
    }
    return cho || jung || '';
  }

  class HangulComposer {
    constructor() {
      this.committed = '';
      this.cur = null; // { cho, jung, jong } while a syllable is being built
    }

    get composing() { return this.cur ? composeSyllable(this.cur.cho, this.cur.jung, this.cur.jong) : ''; }

    get value() { return this.committed + this.composing; }

    _commit() {
      this.committed += this.composing;
      this.cur = null;
    }

    input(jamo) {
      if (isVowel(jamo)) this._vowel(jamo);
      else if (isConsonant(jamo)) this._consonant(jamo);
      else { this._commit(); this.committed += jamo; }
    }

    _consonant(j) {
      const c = this.cur;
      if (c && c.cho && c.jung) {
        if (!c.jong && JONG.includes(j)) { c.jong = j; return; }
        if (c.jong && JONG_PAIRS[c.jong + j]) { c.jong = JONG_PAIRS[c.jong + j]; return; }
      }
      this._commit();
      this.cur = { cho: j, jung: '', jong: '' };
    }

    _vowel(j) {
      const c = this.cur;
      if (!c) { this.cur = { cho: '', jung: j, jong: '' }; return; }
      if (!c.jung) { c.jung = j; return; }
      if (!c.jong) {
        if (VOWEL_PAIRS[c.jung + j]) { c.jung = VOWEL_PAIRS[c.jung + j]; return; }
        this._commit();
        this.cur = { cho: '', jung: j, jong: '' };
        return;
      }
      // A vowel after a final consonant pulls (part of) it into the next syllable.
      let moved;
      if (JONG_SPLIT[c.jong]) { [c.jong, moved] = JONG_SPLIT[c.jong]; }
      else { moved = c.jong; c.jong = ''; }
      this._commit();
      this.cur = { cho: moved, jung: j, jong: '' };
    }

    space() { this._commit(); this.committed += ' '; }

    punct(ch) { this._commit(); this.committed += ch; }

    backspace() {
      const c = this.cur;
      if (!c) {
        this.committed = Array.from(this.committed).slice(0, -1).join('');
        return;
      }
      if (c.jong) {
        c.jong = JONG_SPLIT[c.jong] ? JONG_SPLIT[c.jong][0] : '';
      } else if (c.jung) {
        if (VOWEL_SPLIT[c.jung]) c.jung = VOWEL_SPLIT[c.jung][0];
        else { c.jung = ''; if (!c.cho) this.cur = null; }
      } else {
        this.cur = null;
      }
    }

    clear() {
      this.committed = '';
      this.cur = null;
    }
  }

  return { HangulComposer, composeSyllable, CHO, JUNG, JONG };
});
