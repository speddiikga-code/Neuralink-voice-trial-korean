const test = require('node:test');
const assert = require('node:assert/strict');
const { suggestReplies } = require('../src/suggest.js');

test('a lunch question gets food replies', () => {
  const r = suggestReplies('오늘 점심 뭐 먹고 싶어요?');
  assert.equal(r.topic, '식사');
  assert.ok(r.replies.includes('김치찌개 먹고 싶어요'));
});

test('the topic mentioned first wins', () => {
  assert.equal(suggestReplies('물 마시고 밥 먹을래요?').topic, '마실 것');
  assert.equal(suggestReplies('잘 잤어요?').topic, '기분');
  assert.equal(suggestReplies('약 먹었어요?').topic, '병원·약');
});

test('look-alike words do not trigger a topic', () => {
  assert.equal(suggestReplies('잠깐만 기다려 줘').topic, null);
  assert.equal(suggestReplies('선물 받았어요').topic, null);
});

test('unknown input falls back to yes and no', () => {
  const r = suggestReplies('그렇구나');
  assert.equal(r.topic, null);
  assert.deepEqual(r.replies.slice(0, 2), ['네', '아니요']);
});

test('always four different replies', () => {
  for (const s of ['', '산책 갈래요?', 'TV 볼래?', '엄마한테 전화할까?']) {
    const { replies } = suggestReplies(s);
    assert.equal(replies.length, 4);
    assert.equal(new Set(replies).size, 4);
  }
});
