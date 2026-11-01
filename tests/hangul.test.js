const test = require('node:test');
const assert = require('node:assert/strict');
const { HangulComposer } = require('../src/hangul.js');

function type(keys) {
  const h = new HangulComposer();
  for (const k of keys) {
    if (k === ' ') h.space();
    else h.input(k);
  }
  return h;
}

test('builds everyday words from single jamo', () => {
  assert.equal(type('ㅇㅏㄴㄴㅕㅇㅎㅏㅅㅔㅇㅛ').value, '안녕하세요');
  assert.equal(type('ㅁㅜㄹ ㅈㅜㅅㅔㅇㅛ').value, '물 주세요');
  assert.equal(type('ㄱㅗㅏㅈㅏ').value, '과자');
  assert.equal(type('ㅇㅡㅣㅅㅏ').value, '의사');
  assert.equal(type('ㅇㅖ').value, '예');
});

test('compound finals, and finals moving to the next syllable', () => {
  assert.equal(type('ㄷㅏㄹㄱ').value, '닭');
  assert.equal(type('ㄷㅏㄹㄱㅇㅣ').value, '닭이');
  assert.equal(type('ㅇㅏㄴㅈㅏ').value, '안자');
  assert.equal(type('ㄱㅏㅂㅅㅣ').value, '갑시');
  assert.equal(type('ㅇㅣㅆㅇㅓㅇㅛ').value, '있어요');
});

test('backspace removes one jamo at a time', () => {
  const h = type('ㄷㅏㄹㄱ');
  h.backspace(); assert.equal(h.value, '달');
  h.backspace(); assert.equal(h.value, '다');
  h.backspace(); assert.equal(h.value, 'ㄷ');
  h.backspace(); assert.equal(h.value, '');
  const g = type('ㄱㅗㅏ');
  g.backspace(); assert.equal(g.value, '고');
  const k = type('ㄴㅔ ');
  k.backspace(); assert.equal(k.value, '네');
  k.backspace(); assert.equal(k.value, '');
});

test('lone consonants and vowels stay as jamo', () => {
  assert.equal(type('ㅋㅋ').value, 'ㅋㅋ');
  assert.equal(type('ㅏㅏ').value, 'ㅏㅏ');
});
