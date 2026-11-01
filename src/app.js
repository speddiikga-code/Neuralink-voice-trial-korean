/*
 * NeuroVoice — app
 * Signal chain: simulator → detector → monitor.
 * Gestures from the detector drive the scanner; what gets selected is spoken.
 */
(function () {
  'use strict';

  const NV = window.NV;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ---------- settings (kept per browser; the page works without storage) ----------
  const STORE_KEY = 'neurovoice:settings:v1';
  const settings = Object.assign(
    { dwell: 1200, voice: true, theme: 'system', naturalBlinks: true, noise: 25 },
    readStore(),
  );

  function readStore() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (err) { return {}; }
  }

  function writeStore() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch (err) { /* settings last for this visit */ }
  }

  // ---------- signal chain ----------
  const FS = 256;
  const sim = new NV.SyntheticEEG({ fs: FS, seed: (Date.now() % 100000) + 1 });
  sim.naturalBlinks = settings.naturalBlinks;
  sim.noise = settings.noise / 100;
  const detector = new NV.EventDetector({ fs: FS, channels: sim.channels, displaySeconds: 6 });
  const monitor = new NV.SignalMonitor($('#eeg'), detector, { seconds: 5 });

  // ---------- board content ----------
  const PANELS = ['suggest', 'quick', 'keyboard'];
  const PANEL_NAMES = { suggest: '답변 추천', quick: '자주 쓰는 말', keyboard: '글자 입력' };
  const EXAMPLE_PARTNER = '오늘 점심 뭐 먹고 싶어요?';

  const QUICK = [
    ['네', '아니요', '잠깐만요'],
    ['고마워요', '괜찮아요', '도와주세요'],
    ['물 주세요', '아파요', '자세 바꿔 주세요'],
    ['화장실 가고 싶어요', '다시 말해 주세요', '사랑해요'],
  ];

  // Jamo ordered roughly by how often they appear in Korean text, so common letters come up first.
  const KEY_ROWS = [
    ['ㅇ', 'ㄱ', 'ㄴ', 'ㄹ', 'ㅅ', 'ㄷ', 'ㅈ'],
    ['ㅏ', 'ㅣ', 'ㅡ', 'ㅓ', 'ㅗ', 'ㅜ', 'ㅐ'],
    ['ㅁ', 'ㅎ', 'ㅂ', 'ㅊ', 'ㅌ', 'ㅋ', 'ㅍ'],
    ['ㅔ', 'ㅕ', 'ㅛ', 'ㅑ', 'ㅠ', 'ㅘ', 'ㅝ'],
    ['ㄲ', 'ㄸ', 'ㅃ', 'ㅆ', 'ㅉ', 'ㅖ', 'ㅒ'],
    [
      { action: 'space', label: '띄어쓰기', wide: true },
      { action: 'backspace', label: '지우기' },
      { action: 'speak', label: '말하기', wide: true },
      { action: 'question', label: '?', aria: '물음표' },
      { action: 'clear', label: '비우기' },
    ],
  ];

  const composer = new NV.HangulComposer();
  const state = { panel: 'suggest', lastSaid: '' };

  // ---------- scanning ----------
  const board = $('#board');
  let rowEls = [];
  let itemEls = [];
  const scanner = new NV.Scanner({ dwell: settings.dwell, onChange: renderScan });

  // Highlight history in stream time, so a gesture selects what was lit when it began.
  const scanTrail = [];
  function stateAt(t) {
    for (let i = scanTrail.length - 1; i >= 0; i--) if (scanTrail[i].t <= t) return scanTrail[i].s;
    return null;
  }

  function renderScan(s) {
    scanTrail.push({ t: detector.time, s });
    if (scanTrail.length > 60) scanTrail.shift();
    for (const el of $$('.is-scan, .is-row', board)) el.classList.remove('is-scan', 'is-row');
    board.style.setProperty('--step', `${s.stepMs}ms`);
    if (s.phase === 'row') {
      if (rowEls[s.row]) restartClass(rowEls[s.row], 'is-row');
      return;
    }
    const el = itemEls[s.row] && itemEls[s.row][s.col];
    if (el) restartClass(el, 'is-scan');
  }

  function restartClass(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth; // restart the dwell bar animation
    el.classList.add(cls);
  }

  function showPanel(name) {
    state.panel = name;
    for (const p of PANELS) {
      $(`#panel-${p}`).hidden = p !== name;
      const tab = $(`#tab-${p}`);
      tab.setAttribute('aria-selected', String(p === name));
      tab.tabIndex = p === name ? 0 : -1;
    }
    rowEls = $$('.scan-row', $(`#panel-${name}`));
    itemEls = rowEls.map((r) => $$('.scan-item', r));
    scanner.setGrid(itemEls, name === 'suggest' ? 'linear' : 'rowcol');
  }

  function makeItem(label, payload, className) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `scan-item ${className}`;
    b.textContent = label;
    b._payload = payload;
    b.addEventListener('click', () => {
      activate(b);
      scanner.reset(scanner.holdAfterSelect);
    });
    return b;
  }

  function buildQuick() {
    const panel = $('#panel-quick');
    for (const row of QUICK) {
      const r = document.createElement('div');
      r.className = 'scan-row quick-row';
      row.forEach((text) => r.appendChild(makeItem(text, { text }, 'quick')));
      panel.appendChild(r);
    }
  }

  function buildKeys() {
    const wrap = $('#keys');
    for (const row of KEY_ROWS) {
      const r = document.createElement('div');
      r.className = 'scan-row key-row';
      for (const k of row) {
        if (typeof k === 'string') {
          r.appendChild(makeItem(k, { jamo: k }, 'key'));
        } else {
          const el = makeItem(k.label, { action: k.action, label: k.label }, `key fn${k.wide ? ' wide' : ''}`);
          if (k.aria) el.setAttribute('aria-label', k.aria);
          r.appendChild(el);
        }
      }
      wrap.appendChild(r);
    }
  }

  function buildSuggestions(result) {
    const row = $('#suggest-row');
    row.textContent = '';
    result.replies.forEach((text) => row.appendChild(makeItem(text, { text }, 'phrase')));
    $('#engine-note').textContent = result.topic
      ? `‘${result.topic}’ 이야기로 보고 고른 답입니다. 추천은 아직 낱말 규칙으로 만듭니다.`
      : '맞는 주제를 찾지 못해 기본 답을 보여 줍니다. 추천은 아직 낱말 규칙으로 만듭니다.';
  }

  /** Do what a board item says. Returns a short description for the log. */
  function activate(el) {
    const p = el && el._payload;
    if (!p) return '';
    el.classList.add('is-chosen');
    setTimeout(() => el.classList.remove('is-chosen'), 900);

    if (p.text) {
      say(p.text);
      return `“${p.text}”`;
    }
    if (p.jamo) {
      composer.input(p.jamo);
      renderCompose();
      return `글자 ${p.jamo}`;
    }
    if (p.action === 'space') composer.space();
    else if (p.action === 'backspace') composer.backspace();
    else if (p.action === 'question') composer.punct('?');
    else if (p.action === 'clear') composer.clear();
    else if (p.action === 'speak') {
      const text = composer.value.trim();
      if (text) {
        say(text);
        composer.clear();
      }
    }
    renderCompose();
    return p.label;
  }

  function renderCompose() {
    const el = $('#compose-text');
    const text = composer.value;
    el.textContent = text || '글자를 골라 문장을 만드세요';
    el.classList.toggle('hint', !text);
  }

  // ---------- speech ----------
  function say(text) {
    state.lastSaid = text;
    $('#output').textContent = text;
    $('#repeat-btn').disabled = false;
    addHistory('me', text);
    speak(text);
  }

  function speak(text) {
    if (!settings.voice) return;
    NV.Speaker.speak(text, { onstart: () => setSpeaking(true), onend: () => setSpeaking(false) });
  }

  function setSpeaking(on) { $('#speaking').hidden = !on; }

  function partnerSaid(text, { example = false } = {}) {
    $('#partner-text').textContent = text;
    addHistory('partner', text, example);
    buildSuggestions(NV.suggestReplies(text));
    showPanel('suggest');
  }

  // ---------- logs ----------
  const logEl = $('#event-log');
  const historyEl = $('#history');
  const pad = (n) => String(n).padStart(2, '0');
  const clock = (d, withSeconds) => `${pad(d.getHours())}:${pad(d.getMinutes())}${withSeconds ? `:${pad(d.getSeconds())}` : ''}`;

  function logEvent(text, muted = false) {
    const empty = logEl.querySelector('.empty');
    if (empty) empty.remove();
    const li = document.createElement('li');
    if (muted) li.className = 'muted';
    const time = document.createElement('time');
    time.textContent = clock(new Date(), true);
    const span = document.createElement('span');
    span.textContent = text;
    li.append(time, span);
    logEl.prepend(li);
    while (logEl.children.length > 8) logEl.lastElementChild.remove();
  }

  function addHistory(who, text, example = false) {
    const li = document.createElement('li');
    li.className = who;
    const tag = document.createElement('span');
    tag.className = 'who-tag';
    tag.textContent = who === 'me' ? '나' : '상대방';
    const body = document.createElement('span');
    body.textContent = text;
    if (example) {
      const ex = document.createElement('span');
      ex.className = 'example';
      ex.textContent = ' 예시';
      body.appendChild(ex);
    }
    const time = document.createElement('time');
    time.textContent = clock(new Date(), false);
    li.append(tag, body, time);
    historyEl.prepend(li);
    while (historyEl.children.length > 30) historyEl.lastElementChild.remove();
  }

  // ---------- gestures ----------
  const pendingBlinkLogs = new Map();

  detector.on((ev) => {
    switch (ev.type) {
      case 'blink':
        monitor.annotate(ev.t, '깜빡임', 'blink');
        // Log a single blink only once it is clear no second blink followed.
        pendingBlinkLogs.set(ev.t, setTimeout(() => {
          pendingBlinkLogs.delete(ev.t);
          logEvent('깜빡임 한 번 (선택 아님)', true);
        }, 900));
        break;
      case 'doubleBlink':
        for (const t of [ev.first, ev.t]) {
          clearTimeout(pendingBlinkLogs.get(t));
          pendingBlinkLogs.delete(t);
        }
        monitor.relabel(ev.first, '두 번 깜빡임');
        monitor.relabel(ev.t, '');
        onSelect(ev.first);
        break;
      case 'jawClench':
        monitor.annotate(ev.t, '이 악물기', 'jaw');
        onSwitch();
        break;
      case 'eyesClosed':
        monitor.eyesClosedAt(ev.t);
        onBack();
        break;
      case 'eyesOpened':
        monitor.eyesOpenedAt(ev.t);
        break;
      case 'bands':
        renderBands(ev.bands);
        break;
      case 'quality':
        renderQuality(ev.quality);
        break;
      default:
        break;
    }
  });

  function onSelect(onset) {
    const res = scanner.select(stateAt(onset));
    if (!res) { logEvent('두 번 깜빡임 (고를 항목 없음)'); return; }
    if (res.type === 'row') { logEvent(`두 번 깜빡임 → ${res.row + 1}번째 줄`); return; }
    logEvent(`두 번 깜빡임 → ${activate(res.item)}`);
  }

  function onSwitch() {
    const next = PANELS[(PANELS.indexOf(state.panel) + 1) % PANELS.length];
    showPanel(next);
    logEvent(`이 악물기 → ${PANEL_NAMES[next]}`);
  }

  function onBack() {
    if (scanner.back()) { logEvent('눈 감기 → 줄 고르기로 돌아감'); return; }
    if (state.panel === 'keyboard' && composer.value) {
      composer.backspace();
      renderCompose();
      logEvent('눈 감기 → 한 글자 지움');
      return;
    }
    if (NV.Speaker.speaking) {
      NV.Speaker.cancel();
      setSpeaking(false);
      logEvent('눈 감기 → 말하기 멈춤');
      return;
    }
    scanner.reset();
    logEvent('눈 감기 → 처음부터 다시 훑기');
  }

  // ---------- signal panel ----------
  const bandEls = {};
  function buildBands() {
    const ul = $('#bands');
    for (const b of NV.BANDS) {
      const li = document.createElement('li');
      li.className = 'band';
      li.dataset.band = b.key;
      li.innerHTML = `<span class="band-symbol" aria-hidden="true">${b.symbol}</span>`
        + `<span class="band-name">${b.name} ${b.lo}–${b.hi} Hz</span>`
        + '<span class="band-track"><span class="band-fill"></span></span>'
        + '<span class="band-value">–</span>';
      ul.appendChild(li);
      bandEls[b.key] = { fill: $('.band-fill', li), value: $('.band-value', li) };
    }
  }

  function renderBands(shares) {
    for (const b of NV.BANDS) {
      const pct = Math.round((shares[b.key] || 0) * 100);
      bandEls[b.key].fill.style.width = `${pct}%`;
      bandEls[b.key].value.textContent = `${pct}%`;
    }
  }

  const LEVEL_WORD = { good: '좋음', fair: '보통', bad: '불량' };
  const contactEls = [];
  let lastQuality = sim.channels.map(() => 'good');

  function buildContacts() {
    const wrap = $('#contacts');
    sim.channels.forEach((name, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'contact';
      b.dataset.level = 'good';
      b.setAttribute('aria-pressed', 'false');
      b.title = `${name} 전극 떼기 또는 붙이기`;
      b.innerHTML = `<span class="dot" aria-hidden="true"></span><span>${name}</span><span class="level">${LEVEL_WORD.good}</span>`;
      b.addEventListener('click', () => {
        sim.contact[i] = !sim.contact[i];
        b.setAttribute('aria-pressed', String(!sim.contact[i]));
        logEvent(sim.contact[i] ? `${name} 전극을 다시 붙임` : `${name} 전극을 뗌`);
      });
      wrap.appendChild(b);
      contactEls.push(b);
    });
  }

  function renderQuality(q) {
    q.forEach((level, i) => {
      contactEls[i].dataset.level = level;
      $('.level', contactEls[i]).textContent = LEVEL_WORD[level];
      const dot = $(`.electrode[data-ch="${i}"]`);
      if (dot) dot.dataset.level = level;
      if ((level === 'bad') !== (lastQuality[i] === 'bad')) {
        logEvent(level === 'bad' ? `${sim.channels[i]} 접촉 불량, 감지에서 뺌` : `${sim.channels[i]} 접촉 회복`);
      }
    });
    lastQuality = q.slice();
    monitor.setQuality(q);
    const warnings = [];
    if (q[1] === 'bad' && q[2] === 'bad') warnings.push('AF7과 AF8이 모두 불량이라 깜빡임을 읽을 수 없어요.');
    if (q[0] === 'bad' && q[3] === 'bad') warnings.push('TP9와 TP10이 모두 불량이라 이 악물기와 눈 감기를 읽을 수 없어요.');
    const warn = $('#signal-warning');
    warn.hidden = warnings.length === 0;
    warn.textContent = warnings.join(' ');
  }

  // ---------- simulator controls ----------
  /** Press-and-hold gesture with a minimum length, so a quick tap still produces a usable signal. */
  function holdControl(on, off, minMs) {
    let token = 0;
    let downAt = 0;
    let active = false;
    return {
      start() {
        if (active) return;
        active = true;
        token += 1;
        downAt = performance.now();
        on();
      },
      end() {
        if (!active) return;
        active = false;
        const mine = token;
        const rest = Math.max(0, minMs - (performance.now() - downAt));
        const finish = () => { if (mine === token) off(); };
        if (rest > 0) sim.after(rest / 1000, finish);
        else finish();
      },
      tap() {
        this.start();
        this.end();
      },
    };
  }

  const jaw = holdControl(() => sim.jaw(true), () => sim.jaw(false), 650);
  const eyes = holdControl(() => sim.eyes(true), () => sim.eyes(false), 2400);

  function bindHold(btn, ctl) {
    let viaPointer = false;
    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      viaPointer = true;
      try { btn.setPointerCapture(e.pointerId); } catch (err) { /* capture unavailable */ }
      btn.classList.add('is-held');
      ctl.start();
    });
    const release = () => {
      if (!btn.classList.contains('is-held')) return;
      btn.classList.remove('is-held');
      ctl.end();
    };
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('lostpointercapture', release);
    btn.addEventListener('click', () => {
      if (viaPointer) { viaPointer = false; return; }
      ctl.tap(); // keyboard activation
    });
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  for (const btn of $$('[data-sim]')) {
    const kind = btn.dataset.sim;
    if (kind === 'blink') btn.addEventListener('click', () => sim.blink());
    else if (kind === 'double') btn.addEventListener('click', () => sim.doubleBlink());
    else bindHold(btn, kind === 'jaw' ? jaw : eyes);
  }

  // Physical keys (layout independent, so Korean input mode does not matter).
  const CODE_TO_SIM = { KeyB: 'blink', KeyV: 'double', KeyJ: 'jaw', KeyE: 'eyes' };
  const markKey = (kind, on) => $$(`[data-sim="${kind}"]`).forEach((b) => b.classList.toggle('is-key', on));

  document.addEventListener('keydown', (e) => {
    const kind = CODE_TO_SIM[e.code];
    if (!kind || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (kind === 'blink') sim.blink();
    else if (kind === 'double') sim.doubleBlink();
    else if (kind === 'jaw') jaw.start();
    else eyes.start();
    markKey(kind, true);
    e.preventDefault();
  });

  document.addEventListener('keyup', (e) => {
    const kind = CODE_TO_SIM[e.code];
    if (!kind) return;
    if (kind === 'jaw') jaw.end();
    else if (kind === 'eyes') eyes.end();
    markKey(kind, false);
  });

  // ---------- settings controls ----------
  const dwellInput = $('#dwell');
  const dwellOut = $('#dwell-out');
  const showDwell = () => { dwellOut.textContent = `${(settings.dwell / 1000).toFixed(1)}초`; };
  dwellInput.value = String(settings.dwell);
  showDwell();
  dwellInput.addEventListener('input', () => {
    settings.dwell = Number(dwellInput.value);
    showDwell();
    scanner.setDwell(settings.dwell);
    writeStore();
  });

  const naturalInput = $('#natural-blinks');
  naturalInput.checked = settings.naturalBlinks;
  naturalInput.addEventListener('change', () => {
    settings.naturalBlinks = naturalInput.checked;
    sim.naturalBlinks = naturalInput.checked;
    writeStore();
  });

  const noiseInput = $('#noise');
  noiseInput.value = String(settings.noise);
  noiseInput.addEventListener('input', () => {
    settings.noise = Number(noiseInput.value);
    sim.noise = settings.noise / 100;
    writeStore();
  });

  const voiceBtn = $('#voice-toggle');
  const showVoice = () => {
    voiceBtn.setAttribute('aria-pressed', String(settings.voice));
    voiceBtn.textContent = settings.voice ? '음성 켜짐' : '음성 꺼짐';
  };
  voiceBtn.addEventListener('click', () => {
    settings.voice = !settings.voice;
    if (!settings.voice) { NV.Speaker.cancel(); setSpeaking(false); }
    showVoice();
    writeStore();
  });

  $('#repeat-btn').addEventListener('click', () => { if (state.lastSaid) speak(state.lastSaid); });

  const THEMES = ['system', 'light', 'dark'];
  const THEME_LABEL = { system: '화면: 시스템', light: '화면: 밝게', dark: '화면: 어둡게' };
  const themeBtn = $('#theme-toggle');
  function applyTheme(fromUser) {
    // Leave the host's own theme alone unless the viewer picks one here.
    if (fromUser || settings.theme !== 'system') {
      if (settings.theme === 'system') document.documentElement.removeAttribute('data-theme');
      else document.documentElement.setAttribute('data-theme', settings.theme);
    }
    themeBtn.textContent = THEME_LABEL[settings.theme];
  }
  themeBtn.addEventListener('click', () => {
    settings.theme = THEMES[(THEMES.indexOf(settings.theme) + 1) % THEMES.length];
    applyTheme(true);
    writeStore();
  });
  new MutationObserver(() => monitor.readColors())
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', () => monitor.readColors());
  }

  for (const tab of $$('.tab')) {
    tab.addEventListener('click', () => showPanel(tab.dataset.panel));
    tab.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const i = PANELS.indexOf(tab.dataset.panel) + (e.key === 'ArrowRight' ? 1 : -1);
      const next = PANELS[(i + PANELS.length) % PANELS.length];
      showPanel(next);
      $(`#tab-${next}`).focus();
      e.preventDefault();
    });
  }

  // ---------- partner input ----------
  $('#partner-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#partner-input');
    const text = input.value.trim();
    if (!text) { input.focus(); return; }
    input.value = '';
    partnerSaid(text);
    logEvent('상대방 말 입력 → 답변 추천 새로 고름');
  });

  const micBtn = $('#mic-btn');
  const micStatus = $('#mic-status');
  let recognizer = null;
  const showMic = (text) => { micStatus.hidden = !text; micStatus.textContent = text || ''; };
  if (NV.Listener.supported) micBtn.hidden = false;
  micBtn.addEventListener('click', () => {
    if (recognizer) { recognizer.stop(); return; }
    showMic('듣는 중입니다. 말이 끝나면 저절로 멈춥니다.');
    micBtn.textContent = '멈추기';
    recognizer = NV.Listener.listen({
      onPartial: (t) => showMic(`듣는 중: ${t}`),
      onFinal: (t) => {
        if (!t) return;
        partnerSaid(t);
        logEvent('상대방 말 듣기 → 답변 추천 새로 고름');
      },
      onError: (err) => {
        if (err === 'not-allowed' || err === 'service-not-allowed') showMic('마이크를 쓸 수 없어요. 상대방 말을 직접 입력해 주세요.');
        else if (err === 'no-speech') showMic('말소리가 들리지 않았어요. 다시 눌러 주세요.');
        else showMic('음성을 알아듣지 못했어요. 직접 입력해 주세요.');
      },
      onEnd: () => {
        recognizer = null;
        micBtn.textContent = '듣기';
        setTimeout(() => { if (!recognizer) showMic(''); }, 4000);
      },
    });
    if (!recognizer) micBtn.textContent = '듣기';
  });

  // ---------- start ----------
  buildBands();
  buildContacts();
  buildQuick();
  buildKeys();
  renderCompose();
  showVoice();
  applyTheme(false);
  if (!NV.Speaker.supported) {
    voiceBtn.disabled = true;
    voiceBtn.textContent = '음성 출력 없음';
  }
  if (document.fonts && document.fonts.load) document.fonts.load('21px "Nanum Pen Script"').catch(() => {});

  // Handles for poking at the pipeline from the browser console.
  NV.app = { sim, detector, scanner, monitor, composer };

  detector.process(sim.generate(FS * 5)); // five seconds of history so the strip opens full
  partnerSaid(EXAMPLE_PARTNER, { example: true });
  scanner.start();

  let last = 0;
  let carry = 0;
  function frame(now) {
    const dt = Math.min(Math.max(now - last, 0), 250) / 1000;
    last = now;
    carry += dt * FS;
    const n = Math.floor(carry);
    if (n > 0) {
      carry -= n;
      detector.process(sim.generate(n));
    }
    monitor.draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame((now) => {
    last = now;
    requestAnimationFrame(frame);
  });
})();
