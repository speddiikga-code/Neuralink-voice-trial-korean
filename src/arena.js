/*
 * NeuroVoice Arena — the 2.5D view of the same pipeline.
 * A floating island laid out like the Muse 2 montage: electrode pylons
 * (TP9, AF7, AF8, TP10) and the Fpz reference stone around an avatar in a
 * headband. Reply crystals sit on the scan ring.
 *
 * The simulated headband, detector and scanner from the main screen drive it:
 *   double blink → select the lit crystal (beam, speech)
 *   jaw clench   → switch between suggested replies and quick phrases
 *   eyes closed  → back to the first crystal (shield)
 * The detector only sees the simulated signal, never the buttons.
 */
(function () {
  'use strict';

  const THREE = window.THREE;
  const NV = window.NV || {};
  const $ = (sel) => document.querySelector(sel);
  const stage = $('#stage');
  const labelsEl = $('#labels');
  const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function fail(message) {
    const p = document.createElement('p');
    p.className = 'fallback';
    p.textContent = message;
    stage.replaceWith(p);
  }

  if (!THREE) { fail('3D 그래픽 라이브러리를 불러오지 못했어요. 연결을 확인한 뒤 새로고침해 주세요.'); return; }
  if (!NV.SyntheticEEG || !NV.EventDetector || !NV.Scanner) { fail('신호 처리 스크립트를 불러오지 못했어요. 새로고침해 주세요.'); return; }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: stage, antialias: true, alpha: true });
  } catch (err) {
    fail('이 브라우저에서는 3D 그래픽(WebGL)을 쓸 수 없어요.');
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // ---------- scene, camera, light ----------
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0b1620, 26, 44);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  const TARGET = new THREE.Vector3(0, 0.6, 0);
  // 30° above the ground plane: the classic 2:1 tile look.
  camera.position.copy(TARGET).addScaledVector(new THREE.Vector3(1, 0.8165, 1).normalize(), 30);
  camera.lookAt(TARGET);

  scene.add(new THREE.HemisphereLight(0xbcd6ff, 0x1b2b2a, 0.62));
  const moon = new THREE.DirectionalLight(0xe2ecff, 0.85);
  moon.position.set(-7, 14, 5);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  Object.assign(moon.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
  moon.shadow.bias = -0.0006;
  moon.shadow.normalBias = 0.02;
  scene.add(moon, moon.target);

  const mat = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.85, metalness: 0.05, flatShading: true }, extra));
  const glow = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

  // Directions on the ground that read as "up" and "right" on screen.
  const UP = new THREE.Vector3(-1, 0, -1).normalize();
  const RIGHT = new THREE.Vector3(1, 0, -1).normalize();
  const polar = (deg, r) => {
    const a = (deg * Math.PI) / 180;
    return UP.clone().multiplyScalar(Math.cos(a) * r).addScaledVector(RIGHT, Math.sin(a) * r);
  };

  // ---------- floating island ----------
  const R = 6;
  const DEPTH = 0.55;
  const tileGeo = new THREE.BoxGeometry(0.96, 1, 0.96);
  const stone = [mat(0x3b6062), mat(0x35585b), mat(0x2f5154)];
  const ringStone = mat(0x5b847e);
  const coreStone = mat(0x4a736f);
  const tilesByMat = new Map();
  for (let x = -R; x <= R; x++) {
    for (let z = -R; z <= R; z++) {
      const r = Math.hypot(x, z);
      const n = hash(x, z);
      if (r > R + 0.35 - n * 1.3) continue;
      let top = (n - 0.5) * 0.06;
      let m = stone[Math.floor(n * 3) % 3];
      if (r < 1.6) { top = 0.14; m = coreStone; } // the avatar's platform
      else if (r > 2.6 && r < 3.7) { top = 0.03; m = ringStone; } // the scan ring
      const edge = r > R - 1.3;
      const h = DEPTH + (edge ? 0.2 + n * 0.6 : 0);
      if (!tilesByMat.has(m)) tilesByMat.set(m, []);
      tilesByMat.get(m).push(new THREE.Matrix4().compose(new THREE.Vector3(x, top - h / 2, z), new THREE.Quaternion(), new THREE.Vector3(1, h, 1)));
    }
  }
  tilesByMat.forEach((list, m) => {
    const inst = new THREE.InstancedMesh(tileGeo, m, list.length);
    list.forEach((m4, i) => inst.setMatrixAt(i, m4));
    inst.castShadow = true;
    inst.receiveShadow = true;
    scene.add(inst);
  });

  const rockGeo = new THREE.ConeGeometry(R + 0.6, 6.5, 12, 3);
  const rp = rockGeo.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const y = rp.getY(i);
    if (y > -3.24 && y < 3.24) {
      const k = 0.8 + hash(Math.round(rp.getX(i) * 10), Math.round(y * 10 + rp.getZ(i) * 7)) * 0.34;
      rp.setX(i, rp.getX(i) * k);
      rp.setZ(i, rp.getZ(i) * k);
    }
  }
  rockGeo.computeVertexNormals();
  const rock = new THREE.Mesh(rockGeo, mat(0x1d3134));
  rock.rotation.x = Math.PI;
  rock.position.y = -DEPTH - 3.2;
  scene.add(rock);

  const shards = [[-6.6, -1.8, 2.6, 0.5], [5.9, -2.6, 3.5, 0.38], [3.2, -3.4, -6.5, 0.45], [-3.7, -2.2, -6.3, 0.3], [6.9, -1.2, -2.7, 0.32]]
    .map(([x, y, z, s], i) => {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), mat(0x223a3d));
      m.position.set(x, y, z);
      scene.add(m);
      return { m, y, phase: i * 1.7 };
    });

  // ---------- electrode pylons and the reference stone ----------
  const LEVELS = {
    good: { hex: 0x5cc58b, word: '좋음' },
    fair: { hex: 0xe5a83d, word: '보통' },
    bad: { hex: 0xff7b7b, word: '불량' },
  };
  const GOOD = LEVELS.good.hex;
  const ELECTRODES = [
    { name: 'TP9', deg: -118 },
    { name: 'AF7', deg: -40 },
    { name: 'AF8', deg: 40 },
    { name: 'TP10', deg: 118 },
  ];
  const pylonStone = mat(0x2d4a4d);
  const capStone = mat(0x3e6466);
  const pylons = ELECTRODES.map((e) => {
    const g = new THREE.Group();
    g.position.copy(polar(e.deg, 5.1));
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.3, 0.95), pylonStone);
    base.position.y = 0.15;
    const column = new THREE.Mesh(new THREE.BoxGeometry(0.46, 1.9, 0.46), capStone);
    column.position.y = 1.25;
    column.rotation.y = Math.PI / 4;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.07, 0.52), mat(GOOD, { emissive: GOOD, emissiveIntensity: 0.8 }));
    band.position.y = 1;
    band.rotation.y = Math.PI / 4;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.16, 0.66), pylonStone);
    cap.position.y = 2.28;
    cap.rotation.y = Math.PI / 4;
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), new THREE.MeshStandardMaterial({ color: GOOD, emissive: GOOD, emissiveIntensity: 1.2 }));
    orb.position.y = 2.68;
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), glow(GOOD, 0.18));
    halo.position.y = 2.68;
    const lamp = new THREE.PointLight(GOOD, 0.9, 5, 2);
    lamp.position.y = 2.6;
    [base, column, cap].forEach((m) => { m.castShadow = true; m.receiveShadow = true; });
    g.add(base, column, band, cap, orb, halo, lamp);
    scene.add(g);
    return { ...e, group: g, orb, halo, band, lamp, phase: hash(e.deg, 3) * 6, pulse: 0 };
  });

  const fpz = new THREE.Group();
  fpz.position.copy(polar(0, 5.3));
  const fpzBase = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.4, 6), pylonStone);
  fpzBase.position.y = 0.2;
  fpzBase.castShadow = true;
  const fpzRing = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 8, 36), glow(0xe6efec, 0.65));
  fpzRing.rotation.x = Math.PI / 2;
  fpzRing.position.y = 0.66;
  fpz.add(fpzBase, fpzRing);
  scene.add(fpz);

  // ---------- avatar ----------
  const avatar = new THREE.Group();
  avatar.position.set(0, 0.14, 0);
  avatar.scale.setScalar(1.25);
  scene.add(avatar);
  const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.38, 0.8, 10), mat(0x22355a));
  robe.position.y = 0.4;
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.03, 6, 20), mat(0x15243a));
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 0.3;
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.065, 8, 18), mat(0xffd60a, { emissive: 0x3a2f00 }));
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 0.8;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 20, 14), mat(0xead9c6, { flatShading: false, roughness: 0.6 }));
  head.position.y = 1.03;
  const headband = new THREE.Mesh(new THREE.TorusGeometry(0.217, 0.03, 8, 36), mat(0x182233, { flatShading: false, roughness: 0.4 }));
  headband.rotation.x = Math.PI / 2;
  headband.position.y = 1.07;
  [robe, head, scarf].forEach((m) => { m.castShadow = true; });
  avatar.add(robe, belt, scarf, head, headband);
  const headDots = ELECTRODES.map((e) => {
    const p = polar(e.deg, 0.222);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 8), new THREE.MeshStandardMaterial({ color: GOOD, emissive: GOOD, emissiveIntensity: 1.4 }));
    dot.position.set(p.x, 1.07, p.z);
    avatar.add(dot);
    return dot;
  });
  const footRing = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.56, 48), glow(0x7fe0d4, 0.5));
  footRing.rotation.x = -Math.PI / 2;
  footRing.position.y = 0.02;
  const shield = new THREE.Mesh(new THREE.SphereGeometry(0.85, 28, 18), glow(0x8fbfff, 0));
  shield.position.y = 0.65;
  avatar.add(footRing, shield);

  const buddy = new THREE.Mesh(new THREE.IcosahedronGeometry(0.085, 0), new THREE.MeshStandardMaterial({ color: 0x9ff0e6, emissive: 0x4fd6c6, emissiveIntensity: 1.1, flatShading: true }));
  const buddyLight = new THREE.PointLight(0x7fe0d4, 0.7, 3, 2);
  scene.add(buddy, buddyLight);

  // ---------- labels that follow the scene ----------
  function tag(cls, html, element = 'div') {
    const el = document.createElement(element);
    el.className = `tag ${cls}`;
    el.innerHTML = html;
    labelsEl.appendChild(el);
    return el;
  }

  // ---------- reply crystals on the scan ring ----------
  const LIT_EMISSIVE = 0x8a6f00;
  const IDLE_EMISSIVE = 0x1b5f5a;
  const gemGeo = new THREE.OctahedronGeometry(0.3, 0);
  const crystals = [-56, -19, 19, 56].map((deg, i) => {
    const g = new THREE.Group();
    g.position.copy(polar(deg, 3.1));
    g.position.y = 0.03;
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.22, 6), pylonStone);
    pedestal.position.y = 0.11;
    pedestal.castShadow = true;
    pedestal.receiveShadow = true;
    const gemMat = new THREE.MeshStandardMaterial({
      color: 0x8fe3d6, emissive: IDLE_EMISSIVE, emissiveIntensity: 0.7, roughness: 0.18, metalness: 0.1, flatShading: true, transparent: true, opacity: 0.95,
    });
    const gem = new THREE.Mesh(gemGeo, gemMat);
    gem.scale.set(1, 1.55, 1);
    gem.position.y = 0.9;
    gem.castShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.028, 6, 40), glow(0xffd60a, 0));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.25;
    g.add(pedestal, gem, ring);
    scene.add(g);
    const label = tag('word', '<span class="word-text"></span><span class="dwell"></span>', 'button');
    label.type = 'button';
    return { group: g, gem, gemMat, ring, label, text: label.querySelector('.word-text'), phase: i * 1.3, spin: 0.6 };
  });

  const litLamp = new THREE.PointLight(0xffd60a, 1.4, 3.4, 2);
  scene.add(litLamp);

  const meTag = tag('me', '<span class="name">나</span><span class="cells"><i></i><i></i><i></i><i></i></span>');
  const cells = Array.from(meTag.querySelectorAll('.cells i'));
  const bubble = tag('bubble', '');
  bubble.hidden = true;
  const pylonTags = pylons.map((p) => {
    const b = tag('pylon', `<i class="dot"></i>${p.name}`, 'button');
    b.type = 'button';
    b.dataset.level = 'good';
    b.setAttribute('aria-pressed', 'false');
    b.title = `${p.name} 전극 떼기 또는 붙이기`;
    return b;
  });
  const fpzTag = tag('pylon ref', '<i class="dot"></i>Fpz 기준');

  // ---------- effects ----------
  const Y_AXIS = new THREE.Vector3(0, 1, 0);
  const beamCore = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 8, 1, true), glow(0xfff3b0, 0));
  const beamGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1, 12, 1, true), glow(0xffd60a, 0));
  const burst = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.04, 8, 48), glow(0xffd60a, 0));
  burst.rotation.x = Math.PI / 2;
  scene.add(beamCore, beamGlow, burst);

  function aim(mesh, from, to) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    mesh.position.copy(from).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(Y_AXIS, dir.normalize());
    mesh.scale.set(1, len, 1);
  }

  let particles = null;
  if (!reduceMotion) {
    const COUNT = 260;
    const pos = new Float32Array(COUNT * 3);
    const speed = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 8.5;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = -3 + Math.random() * 9;
      pos[i * 3 + 2] = Math.sin(a) * r;
      speed[i] = 0.12 + Math.random() * 0.25;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dot = document.createElement('canvas');
    dot.width = 32;
    dot.height = 32;
    const dctx = dot.getContext('2d');
    const grd = dctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.4, 'rgba(255,255,255,0.45)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    dctx.fillStyle = grd;
    dctx.fillRect(0, 0, 32, 32);
    particles = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 3.2, sizeAttenuation: false, map: new THREE.CanvasTexture(dot), color: 0xcfe8ff,
      transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    particles.userData.speed = speed;
    scene.add(particles);
  }

  // ---------- sizing ----------
  const view = { w: 1, h: 1 };
  const mini = $('#mini-eeg');
  const mctx = mini.getContext('2d');

  function resize() {
    const w = stage.clientWidth || window.innerWidth;
    const h = stage.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    const narrow = aspect < 0.8;
    const fitW = narrow ? 11 : 16.5;
    const fitH = narrow ? 13.5 : 12.5;
    const halfH = Math.max(fitH / 2, fitW / (2 * aspect));
    Object.assign(camera, { left: -halfH * aspect, right: halfH * aspect, top: halfH, bottom: -halfH });
    camera.updateProjectionMatrix();
    view.w = w;
    view.h = h;
    if (particles) particles.material.size = 3.2 * renderer.getPixelRatio();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    mini.width = Math.round(mini.clientWidth * dpr);
    mini.height = Math.round(mini.clientHeight * dpr);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- screen-space helpers ----------
  const tmp = new THREE.Vector3();
  function screenOf(obj, local) {
    tmp.copy(local);
    obj.localToWorld(tmp);
    tmp.project(camera);
    return { x: ((tmp.x + 1) / 2) * view.w, y: ((1 - tmp.y) / 2) * view.h };
  }

  function pin(el, obj, local, dy = 0) {
    const s = screenOf(obj, local);
    el.style.transform = `translate(${s.x.toFixed(1)}px, ${(s.y + dy).toFixed(1)}px) translate(-50%, -100%)`;
  }

  function floatText(obj, local, text, pen) {
    const s = screenOf(obj, local);
    const el = document.createElement('div');
    el.className = `float${pen ? ' pen' : ''}`;
    el.textContent = text;
    el.style.left = `${s.x}px`;
    el.style.top = `${s.y}px`;
    labelsEl.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  const feedEl = $('#feed');
  function feed(text, muted = false) {
    const first = feedEl.firstElementChild;
    if (muted && first && first.dataset.text === text) {
      // Fold repeats of the same quiet entry into a count.
      const n = Number(first.dataset.count || 1) + 1;
      first.dataset.count = String(n);
      first.textContent = `${text} ×${n}`;
      return;
    }
    const li = document.createElement('li');
    li.textContent = text;
    li.dataset.text = text;
    if (muted) li.className = 'muted';
    feedEl.prepend(li);
    while (feedEl.children.length > 5) feedEl.lastElementChild.remove();
  }

  // ---------- tiny animation helpers ----------
  let now = 0;
  const tweens = [];
  const tween = (dur, fn, done) => tweens.push({ t0: now, dur, fn, done });
  const cooldowns = [];
  const slots = {
    blink: $('.slot[data-gesture="blink"]'),
    jaw: $('.slot[data-gesture="jaw"]'),
    eyes: $('.slot[data-gesture="eyes"]'),
  };
  function fire(gesture, dur = 1.4) {
    const el = slots[gesture];
    el.classList.add('is-firing');
    cooldowns.push({ el, t0: now, dur });
  }

  // ---------- signal chain (same as the main screen) ----------
  const FS = 256;
  const sim = new NV.SyntheticEEG({ fs: FS, seed: (Date.now() % 100000) + 1 });
  const detector = new NV.EventDetector({ fs: FS, channels: sim.channels, displaySeconds: 4 });
  detector.process(sim.generate(FS * 3)); // a few seconds of history so the strip opens full

  const EXAMPLE_PARTNER = '오늘 점심 뭐 먹고 싶어요?';
  const boards = [
    { name: '답변 추천', words: [] },
    { name: '자주 쓰는 말', words: ['물 주세요', '고마워요', '잠깐만요', '도와주세요'] },
  ];
  let boardIndex = 0;
  let lit = 0;
  let shieldTarget = 0;
  let voiceOn = !!(NV.Speaker && NV.Speaker.supported);

  // Highlight history in stream time, so a gesture selects what was lit when it began.
  const scanTrail = [];
  const stateAt = (t) => {
    for (let i = scanTrail.length - 1; i >= 0; i--) if (scanTrail[i].t <= t) return scanTrail[i].s;
    return null;
  };

  function light(index, stepMs) {
    lit = index;
    crystals.forEach((c, i) => {
      const on = i === index;
      c.label.classList.toggle('is-lit', on);
      c.gemMat.color.setHex(on ? 0xffe680 : 0x8fe3d6);
      c.gemMat.emissive.setHex(on ? LIT_EMISSIVE : IDLE_EMISSIVE);
      c.ring.material.opacity = on ? 0.85 : 0;
    });
    const label = crystals[index].label;
    label.style.setProperty('--dwell', `${stepMs}ms`);
    label.classList.remove('is-lit');
    void label.offsetWidth; // restart the dwell bar
    label.classList.add('is-lit');
    crystals[index].group.updateMatrixWorld();
    litLamp.position.set(0, 0.9, 0);
    crystals[index].group.localToWorld(litLamp.position);
  }

  const scanner = new NV.Scanner({
    dwell: 1200,
    onChange: (s) => {
      scanTrail.push({ t: detector.time, s });
      if (scanTrail.length > 40) scanTrail.shift();
      if (s.phase === 'item') light(s.col, s.stepMs);
    },
  });

  function showBoard(index) {
    boardIndex = index;
    boards[index].words.forEach((w, i) => { crystals[i].text.textContent = w; });
    $('#stat-board').textContent = boards[index].name;
    scanner.setGrid([crystals.map((_, i) => i)], 'linear');
  }

  function speak(text) {
    if (voiceOn && NV.Speaker) NV.Speaker.speak(text);
  }

  function select(index, how) {
    const c = crystals[index];
    const word = c.text.textContent;
    avatar.updateMatrixWorld();
    c.group.updateMatrixWorld();
    const from = new THREE.Vector3(0, 1.07, 0);
    avatar.localToWorld(from);
    const to = new THREE.Vector3(0, 0.9, 0);
    c.group.localToWorld(to);
    aim(beamCore, from, to);
    aim(beamGlow, from, to);
    tween(0.7, (k) => {
      const a = k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8;
      beamCore.material.opacity = a;
      beamGlow.material.opacity = a * 0.35;
    });
    burst.position.copy(to);
    tween(0.8, (k) => {
      burst.scale.setScalar(1 + k * 2.4);
      burst.material.opacity = 0.9 * (1 - k);
    });
    c.gemMat.emissive.setHex(0xffffff);
    tween(0.35, () => {}, () => c.gemMat.emissive.setHex(lit === index ? LIT_EMISSIVE : IDLE_EMISSIVE));
    tween(0.45, (k) => { avatar.position.y = 0.14 + Math.sin(k * Math.PI) * 0.16; });
    floatText(c.group, new THREE.Vector3(0, 1.6, 0), how === 'gesture' ? '두 번 깜빡임' : '선택');
    bubble.textContent = word;
    bubble.hidden = false;
    clearTimeout(select.timer);
    select.timer = setTimeout(() => { bubble.hidden = true; }, 2600);
    speak(word);
    feed(how === 'gesture' ? `두 번 깜빡임 → “${word}”` : `눌러서 고름 → “${word}”`);
  }

  function switchBoard() {
    const next = (boardIndex + 1) % boards.length;
    floatText(avatar, new THREE.Vector3(0, 1.75, 0), '이 악물기', true);
    crystals.forEach((c) => {
      c.label.classList.add('is-fading');
      c.spin = 9;
    });
    setTimeout(() => {
      showBoard(next);
      crystals.forEach((c) => {
        c.label.classList.remove('is-fading');
        c.spin = 0.6;
      });
    }, 380);
    feed(`이 악물기 → ${boards[next].name}`);
  }

  function goBack() {
    shieldTarget = 1;
    floatText(avatar, new THREE.Vector3(0, 1.75, 0), '눈 감기', true);
    if (NV.Speaker && NV.Speaker.speaking) {
      NV.Speaker.cancel();
      feed('눈 감기 → 말하기 멈춤');
      return;
    }
    scanner.reset();
    feed('눈 감기 → 처음부터 다시 훑기');
  }

  function renderQuality(q) {
    q.forEach((level, i) => {
      const hex = LEVELS[level].hex;
      const p = pylons[i];
      p.orb.material.color.setHex(hex);
      p.orb.material.emissive.setHex(hex);
      p.halo.material.color.setHex(hex);
      p.band.material.color.setHex(hex);
      p.band.material.emissive.setHex(hex);
      p.lamp.color.setHex(hex);
      p.lamp.intensity = level === 'bad' ? 0.35 : 0.9;
      headDots[i].material.color.setHex(hex);
      headDots[i].material.emissive.setHex(hex);
      cells[i].dataset.level = level;
      pylonTags[i].dataset.level = level;
    });
    const usable = q.filter((level) => level !== 'bad').length;
    $('#stat-electrodes').textContent = `${usable}/4 사용 중`;
  }

  let lastQuality = sim.channels.map(() => 'good');
  const pendingBlinks = new Map();
  detector.on((ev) => {
    switch (ev.type) {
      case 'blink':
        pylons[1].pulse = 1;
        pylons[2].pulse = 1;
        // Log a single blink only once it is clear no second blink followed.
        pendingBlinks.set(ev.t, setTimeout(() => {
          pendingBlinks.delete(ev.t);
          feed('깜빡임 한 번 (선택 아님)', true);
        }, 900));
        break;
      case 'doubleBlink': {
        [ev.first, ev.t].forEach((t) => {
          clearTimeout(pendingBlinks.get(t));
          pendingBlinks.delete(t);
        });
        fire('blink');
        const res = scanner.select(stateAt(ev.first));
        if (res && res.type === 'item') select(res.item, 'gesture');
        break;
      }
      case 'jawClench':
        pylons[0].pulse = 1;
        pylons[3].pulse = 1;
        fire('jaw');
        switchBoard();
        break;
      case 'eyesClosed':
        fire('eyes', 1.6);
        goBack();
        break;
      case 'eyesOpened':
        shieldTarget = 0;
        break;
      case 'quality':
        ev.quality.forEach((level, i) => {
          if ((level === 'bad') !== (lastQuality[i] === 'bad')) {
            feed(level === 'bad' ? `${sim.channels[i]} 접촉 불량, 감지에서 뺌` : `${sim.channels[i]} 접촉 회복`);
          }
        });
        lastQuality = ev.quality.slice();
        renderQuality(ev.quality);
        break;
      default:
        break;
    }
  });

  // ---------- controls ----------
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

  const jawCtl = holdControl(() => sim.jaw(true), () => sim.jaw(false), 650);
  const eyesCtl = holdControl(() => sim.eyes(true), () => sim.eyes(false), 2400);

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

  slots.blink.addEventListener('click', () => sim.doubleBlink());
  bindHold(slots.jaw, jawCtl);
  bindHold(slots.eyes, eyesCtl);

  // Physical keys (layout independent, so Korean input mode does not matter).
  const CODE_TO_GESTURE = { KeyB: 'single', KeyV: 'blink', KeyJ: 'jaw', KeyE: 'eyes' };
  document.addEventListener('keydown', (e) => {
    const g = CODE_TO_GESTURE[e.code];
    if (!g || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (g === 'single') sim.blink();
    else if (g === 'blink') sim.doubleBlink();
    else if (g === 'jaw') jawCtl.start();
    else eyesCtl.start();
    if (slots[g]) slots[g].classList.add('is-held');
    e.preventDefault();
  });
  document.addEventListener('keyup', (e) => {
    const g = CODE_TO_GESTURE[e.code];
    if (!g) return;
    if (g === 'jaw') jawCtl.end();
    else if (g === 'eyes') eyesCtl.end();
    if (slots[g]) slots[g].classList.remove('is-held');
  });

  // Tap a crystal to pick it directly, the way a caregiver would touch the board.
  crystals.forEach((c, i) => {
    c.label.addEventListener('click', () => {
      scanner.reset(scanner.holdAfterSelect);
      select(i, 'touch');
    });
  });

  // Tap a pylon's tag to lift that electrode; bad channels drop out of detection.
  pylonTags.forEach((b, i) => {
    b.addEventListener('click', () => {
      sim.contact[i] = !sim.contact[i];
      b.setAttribute('aria-pressed', String(!sim.contact[i]));
      feed(sim.contact[i] ? `${sim.channels[i]} 전극을 다시 붙임` : `${sim.channels[i]} 전극을 뗌`);
    });
  });

  const voiceBtn = $('#voice-toggle');
  const showVoice = () => {
    voiceBtn.setAttribute('aria-pressed', String(voiceOn));
    voiceBtn.textContent = voiceOn ? '음성 켜짐' : '음성 꺼짐';
  };
  if (!NV.Speaker || !NV.Speaker.supported) {
    voiceBtn.disabled = true;
    voiceBtn.textContent = '음성 출력 없음';
  } else {
    showVoice();
    voiceBtn.addEventListener('click', () => {
      voiceOn = !voiceOn;
      if (!voiceOn) NV.Speaker.cancel();
      showVoice();
    });
  }

  const partnerInput = $('#partner-input');
  function partnerSaid(text) {
    $('#partner-text').textContent = text;
    boards[0].words = NV.suggestReplies ? NV.suggestReplies(text).replies : boards[0].words;
    showBoard(0);
  }
  $('#partner-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = partnerInput.value.trim();
    if (!text) { partnerInput.focus(); return; }
    partnerInput.value = '';
    partnerInput.blur();
    partnerSaid(text);
    feed('상대방 말 → 답변 추천 새로 고름');
  });

  // ---------- signal strip in the corner: the detector's own filtered channels ----------
  const MINI_N = FS * 3;
  const miniBufs = [null, null, null, null];
  function drawMini() {
    if (!mini.offsetParent || !mini.width) return;
    const w = mini.width;
    const h = mini.height;
    const dpr = w / mini.clientWidth;
    mctx.clearRect(0, 0, w, h);
    const left = 34 * dpr;
    const plotW = w - left - 6 * dpr;
    const rowH = h / 4;
    const scale = (rowH * 0.42) / 100; // 100 µV fills about 40 % of a row
    mctx.font = `600 ${9 * dpr}px "IBM Plex Sans KR", sans-serif`;
    mctx.textBaseline = 'middle';
    sim.channels.forEach((name, c) => {
      const mid = rowH * (c + 0.5);
      const bad = lastQuality[c] === 'bad';
      mctx.fillStyle = 'rgba(159,180,176,0.9)';
      mctx.fillText(name, 6 * dpr, mid);
      const buf = (miniBufs[c] = detector.display[c].latest(MINI_N, miniBufs[c]));
      const n = buf.length;
      if (n < 2) return;
      mctx.save();
      mctx.beginPath();
      mctx.rect(left, rowH * c, plotW, rowH);
      mctx.clip();
      mctx.strokeStyle = bad ? 'rgba(255,123,123,0.75)' : 'rgba(207,227,221,0.95)';
      mctx.lineWidth = 1.1 * dpr;
      mctx.beginPath();
      const x0 = left + plotW * (1 - n / MINI_N);
      for (let i = 0; i < n; i++) {
        const x = x0 + (i / (MINI_N - 1)) * plotW;
        const y = mid - buf[i] * scale;
        if (i === 0) mctx.moveTo(x, y); else mctx.lineTo(x, y);
      }
      mctx.stroke();
      mctx.restore();
    });
  }

  // ---------- frame loop ----------
  const GEM_ANCHOR = new THREE.Vector3(0, 1.48, 0);
  const ME_ANCHOR = new THREE.Vector3(0, 1.5, 0);
  const PYLON_ANCHOR = new THREE.Vector3(0, 3.05, 0);
  const FPZ_ANCHOR = new THREE.Vector3(0, 1.0, 0);
  const statAlpha = $('#stat-alpha');
  let nextStat = 0;
  let carry = 0;

  function animate(dt) {
    carry += dt * FS;
    const n = Math.floor(carry);
    if (n > 0) {
      carry -= n;
      detector.process(sim.generate(n));
    }

    const s = shieldTarget ? 0.22 : 0;
    shield.material.opacity += (s - shield.material.opacity) * Math.min(1, dt * 6);
    shield.scale.setScalar(0.85 + shield.material.opacity * 0.7);

    pylons.forEach((p) => {
      p.pulse = Math.max(0, p.pulse - dt * 2.5);
      const bob = reduceMotion ? 0 : Math.sin(now * 1.3 + p.phase) * 0.05;
      p.orb.position.y = 2.68 + bob;
      p.halo.position.y = p.orb.position.y;
      p.halo.scale.setScalar(1 + (reduceMotion ? 0 : Math.sin(now * 2 + p.phase) * 0.08) + p.pulse * 0.9);
      p.halo.material.opacity = 0.18 + p.pulse * 0.35;
    });

    if (!reduceMotion) {
      crystals.forEach((c) => {
        c.gem.position.y = 0.9 + Math.sin(now * 1.7 + c.phase) * 0.07;
        c.gem.rotation.y += dt * c.spin;
      });
      fpzRing.position.y = 0.66 + Math.sin(now * 1.1) * 0.06;
      fpzRing.rotation.z += dt * 0.4;
      footRing.material.opacity = 0.35 + Math.sin(now * 2.2) * 0.15;
      shards.forEach((sh) => {
        sh.m.position.y = sh.y + Math.sin(now * 0.6 + sh.phase) * 0.2;
        sh.m.rotation.y += dt * 0.15;
      });
      if (particles) {
        const pos = particles.geometry.attributes.position;
        const speed = particles.userData.speed;
        for (let i = 0; i < speed.length; i++) {
          let y = pos.getY(i) + speed[i] * dt;
          if (y > 6) y = -3;
          pos.setY(i, y);
        }
        pos.needsUpdate = true;
      }
    }
    const a = now * 0.9;
    buddy.position.set(Math.cos(a) * 0.8, 1.9 + Math.sin(now * 1.8) * 0.08, Math.sin(a) * 0.8);
    buddy.rotation.y += dt;
    buddyLight.position.copy(buddy.position);

    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      const k = Math.min(1, (now - tw.t0) / tw.dur);
      tw.fn(k);
      if (k >= 1) {
        tweens.splice(i, 1);
        if (tw.done) tw.done();
      }
    }
    for (let i = cooldowns.length - 1; i >= 0; i--) {
      const cd = cooldowns[i];
      const k = Math.min(1, (now - cd.t0) / cd.dur);
      cd.el.style.setProperty('--p', (1 - k).toFixed(3));
      if (k >= 1) {
        cd.el.classList.remove('is-firing');
        cooldowns.splice(i, 1);
      }
    }
    if (now >= nextStat) {
      nextStat = now + 0.25;
      statAlpha.textContent = `${Math.round(detector.alphaShare * 100)}%`;
    }
  }

  function placeLabels() {
    pin(meTag, avatar, ME_ANCHOR);
    pin(bubble, avatar, ME_ANCHOR, -34);
    crystals.forEach((c) => pin(c.label, c.group, GEM_ANCHOR));
    pylons.forEach((p, i) => pin(pylonTags[i], p.group, PYLON_ANCHOR));
    pin(fpzTag, fpz, FPZ_ANCHOR);
  }

  partnerSaid(EXAMPLE_PARTNER);
  scanner.start();
  feed('가상 헤드밴드 연결됨. 두 번 깜빡여서 크리스털을 고르세요.');

  // Handles for poking at it from the browser console.
  window.NVArena = { sim, detector, scanner, select: (i) => select(i, 'touch'), switchBoard, goBack };

  const clock = new THREE.Clock();
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.25);
    now = clock.elapsedTime;
    animate(dt);
    renderer.render(scene, camera);
    placeLabels();
    drawMini();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
