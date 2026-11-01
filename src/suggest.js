/*
 * NeuroVoice — reply suggestions
 * A small rule table: find the topic the partner mentioned first and offer
 * four short replies for it. This is a stand-in with the same shape an LLM
 * call would have later: text in, { topic, replies } out.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.NV = root.NV || {}; Object.assign(root.NV, factory()); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RULES = [
    { topic: '인사', pattern: /안녕|좋은 아침|왔어|왔어요|오셨|다녀왔/, replies: ['안녕하세요', '와 줘서 고마워요', '보고 싶었어요', '오늘은 좀 피곤해요'] },
    { topic: '식사', pattern: /밥|먹|배고|배 고|식사|점심|저녁|아침|간식|메뉴|반찬/, replies: ['김치찌개 먹고 싶어요', '죽이 좋겠어요', '조금만 먹을게요', '아직 배 안 고파요'] },
    { topic: '마실 것', pattern: /(?:^|\s)물(?:\s|을|이|\?|$)|마실|마셔|음료|커피|주스|우유|녹차/, replies: ['물 좀 주세요', '따뜻한 걸로 주세요', '빨대로 마실게요', '지금은 괜찮아요'] },
    { topic: '통증', pattern: /아프|아파|아픈|통증|불편|다쳤|쑤시|저려/, replies: ['괜찮아요', '조금 아파요', '자세를 바꿔 주세요', '많이 아파요, 간호사 불러 주세요'] },
    { topic: '병원·약', pattern: /(?:^|\s)약(?:\s|을|은|\?|$)|병원|의사|간호사|주사|검사|진료/, replies: ['약 먹을게요', '조금 이따 먹을게요', '선생님께 물어보고 싶어요', '검사 결과가 궁금해요'] },
    { topic: '기분', pattern: /기분|컨디션|어때요|어때\?|괜찮아요\?|괜찮아\?|잘 잤/, replies: ['좋아요', '그냥 그래요', '조금 피곤해요', '덕분에 좋아요, 고마워요'] },
    { topic: '온도', pattern: /춥|추워|추운|덥|더워|더운|온도|에어컨|히터|창문|이불|담요/, replies: ['조금 추워요, 담요 주세요', '더워요', '창문 열어 주세요', '지금 딱 좋아요'] },
    { topic: '잠', pattern: /잠을|잠이|잠 좀|졸려|졸리|자고 싶|잘래|잘까|잤|쉬고|쉴래|쉴까|피곤/, replies: ['조금 자고 싶어요', '불 꺼 주세요', '아직 괜찮아요', '30분 뒤에 깨워 주세요'] },
    { topic: 'TV·음악', pattern: /TV|티비|텔레비전|영화|드라마|음악|노래|유튜브|뉴스|라디오/i, replies: ['음악 틀어 주세요', '소리 조금 줄여 주세요', '다른 거 보고 싶어요', '지금은 조용히 있고 싶어요'] },
    { topic: '가족·연락', pattern: /엄마|아빠|어머니|아버지|가족|아들|딸|손주|전화|연락|문자|친구/, replies: ['전화 걸어 주세요', '보고 싶다고 전해 주세요', '나중에 연락할게요', '문자로 보내 주세요'] },
    { topic: '화장실', pattern: /화장실|소변|대변|기저귀/, replies: ['네, 가고 싶어요', '아직 괜찮아요', '조금 있다가요', '도와주세요'] },
    { topic: '마음', pattern: /사랑|고마|보고 싶|보고싶/, replies: ['나도 사랑해요', '정말 고마워요', '나도 보고 싶었어요', '옆에 있어 줘서 고마워요'] },
    { topic: '외출', pattern: /산책|밖에|나가|외출|바람 쐬|날씨/, replies: ['좋아요, 나가고 싶어요', '오늘은 쉬고 싶어요', '조금만 걷다 올게요', '날씨 어때요?'] },
  ];

  const FALLBACK = ['네', '아니요', '잠깐만요, 생각 중이에요', '다시 한 번 말해 주세요'];

  /** Pick the topic mentioned earliest in the sentence and return its replies. */
  function suggestReplies(utterance, count = 4) {
    const text = String(utterance || '').trim();
    let best = null;
    let bestAt = Infinity;
    for (const rule of RULES) {
      const m = rule.pattern.exec(text);
      if (m && m.index < bestAt) {
        best = rule;
        bestAt = m.index;
      }
    }
    const replies = [];
    const add = (s) => { if (!replies.includes(s)) replies.push(s); };
    if (best) best.replies.forEach(add);
    FALLBACK.forEach(add);
    return { topic: best ? best.topic : null, replies: replies.slice(0, count) };
  }

  return { suggestReplies, SUGGESTION_RULES: RULES };
});
