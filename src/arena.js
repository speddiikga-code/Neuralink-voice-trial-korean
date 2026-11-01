/*
 * NeuroVoice Arena — 2.5D quarter-view design shell.
 * A floating island laid out like the Muse 2 montage: electrode pylons
 * (TP9, AF7, AF8, TP10) and the Fpz reference stone around an avatar in a
 * headband. Reply crystals sit on the scan ring and take the highlight in
 * turn, and a short demo loop plays the three gestures. Nothing here reads
 * real input yet: this is the look, not the game.
 */
(function () {
  'use strict';

  const THREE = window.THREE;
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
  const GOOD = 0x5cc58b;
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
    return { ...e, group: g, orb, halo, phase: hash(e.deg, 3) * 6 };
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
  ELECTRODES.forEach((e) => {
    const p = polar(e.deg, 0.222);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 8), new THREE.MeshStandardMaterial({ color: GOOD, emissive: GOOD, emissiveIntensity: 1.4 }));
    dot.position.set(p.x, 1.07, p.z);
    avatar.add(dot);
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
  function tag(cls, html) {
    const el = document.createElement('div');
    el.className = `tag ${cls}`;
    el.innerHTML = html;
    labelsEl.appendChild(el);
    return el;
  }

  // ---------- reply crystals on the scan ring ----------
  const WORD_SETS = [
    { board: '답변 추천', words: ['김치찌개 먹고 싶어요', '죽이 좋겠어요', '조금만 먹을게요', '아직 배 안 고파요'] },
    { board: '자주 쓰는 말', words: ['물 주세요', '고마워요', '잠깐만요', '도와주세요'] },
  ];
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
    const label = tag('word', '<span class="word-text"></span><span class="dwell"></span>');
    return { group: g, gem, gemMat, ring, label, text: label.querySelector('.word-text'), phase: i * 1.3, spin: 0.6 };
  });

  const litLamp = new THREE.PointLight(0xffd60a, 1.4, 3.4, 2);
  scene.add(litLamp);

  const meTag = tag('me', '<span class="name">나</span><span class="cells"><i></i><i></i><i></i><i></i></span>');
  const bubble = tag('bubble', '');
  bubble.hidden = true;
  const pylonTags = pylons.map((p) => tag('pylon', `<i class="dot"></i>${p.name}`));
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
  function feed(text) {
    const li = document.createElement('li');
    li.textContent = text;
    feedEl.prepend(li);
    while (feedEl.children.length > 4) feedEl.lastElementChild.remove();
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

  // ---------- demo loop: the scan steps, and every few steps a gesture fires ----------
  const DWELL = 1.2;
  const SCRIPT = [
    { steps: 6, gesture: 'blink' },
    { steps: 5, gesture: 'blink' },
    { steps: 3, gesture: 'jaw' },
    { steps: 7, gesture: 'blink' },
    { steps: 2, gesture: 'eyes' },
  ];
  const demo = { set: 0, lit: 0, nextStep: 1.2, beat: 0, steps: 0 };
  const signal = { blinkAt: -9, jawUntil: 0, eyesUntil: 0 };

  function setWords() {
    WORD_SETS[demo.set].words.forEach((w, i) => { crystals[i].text.textContent = w; });
    $('#stat-board').textContent = WORD_SETS[demo.set].board;
  }

  function light(index) {
    demo.lit = index;
    crystals.forEach((c, i) => {
      const on = i === index;
      c.label.classList.toggle('is-lit', on);
      c.gemMat.color.setHex(on ? 0xffe680 : 0x8fe3d6);
      c.gemMat.emissive.setHex(on ? LIT_EMISSIVE : IDLE_EMISSIVE);
      c.ring.material.opacity = on ? 0.85 : 0;
    });
    crystals[index].group.updateMatrixWorld();
    litLamp.position.set(0, 0.9, 0);
    crystals[index].group.localToWorld(litLamp.position);
    const label = crystals[index].label;
    label.classList.remove('is-lit');
    void label.offsetWidth; // restart the dwell bar
    label.classList.add('is-lit');
  }

  function step() {
    const beat = SCRIPT[demo.beat];
    demo.steps += 1;
    if (demo.steps > beat.steps) {
      demo.steps = 0;
      demo.beat = (demo.beat + 1) % SCRIPT.length;
      if (beat.gesture === 'blink') select();
      else if (beat.gesture === 'jaw') switchBoard();
      else goBack();
      return;
    }
    light((demo.lit + 1) % crystals.length);
  }

  function select() {
    const c = crystals[demo.lit];
    const word = c.text.textContent;
    fire('blink');
    signal.blinkAt = now;
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
    tween(0.35, () => {}, () => { if (demo.lit === crystals.indexOf(c)) c.gemMat.emissive.setHex(LIT_EMISSIVE); });
    tween(0.45, (k) => { avatar.position.y = 0.14 + Math.sin(k * Math.PI) * 0.16; });
    floatText(c.group, new THREE.Vector3(0, 1.6, 0), '두 번 깜빡임');
    bubble.textContent = word;
    bubble.hidden = false;
    clearTimeout(select.timer);
    select.timer = setTimeout(() => { bubble.hidden = true; }, 2600);
    feed(`두 번 깜빡임 → “${word}”`);
    demo.nextStep = now + 2.6;
  }

  function switchBoard() {
    const next = (demo.set + 1) % WORD_SETS.length;
    fire('jaw');
    signal.jawUntil = now + 0.7;
    floatText(avatar, new THREE.Vector3(0, 1.75, 0), '이 악물기', true);
    crystals.forEach((c) => {
      c.label.classList.add('is-fading');
      c.spin = 9;
    });
    setTimeout(() => {
      demo.set = next;
      setWords();
      crystals.forEach((c) => {
        c.label.classList.remove('is-fading');
        c.spin = 0.6;
      });
      light(0);
    }, 450);
    feed(`이 악물기 → ${WORD_SETS[next].board}`);
    demo.nextStep = now + 1.8;
  }

  function goBack() {
    fire('eyes', 1.8);
    signal.eyesUntil = now + 1.8;
    floatText(avatar, new THREE.Vector3(0, 1.75, 0), '눈 감기', true);
    tween(1.8, (k) => {
      const a = Math.sin(k * Math.PI);
      shield.material.opacity = 0.22 * a;
      shield.scale.setScalar(0.85 + 0.15 * a);
    });
    light(0);
    feed('눈 감기 → 처음부터 다시 훑기');
    demo.nextStep = now + 2;
  }

  // ---------- small signal strip in the corner (decorative) ----------
  const MINI_N = 180;
  const traces = [0, 1, 2, 3].map(() => new Float32Array(MINI_N));
  let miniHead = 0;
  let miniAcc = 0;

  function sample(ch) {
    const temporal = ch === 0 || ch === 3;
    const eyes = now < signal.eyesUntil && temporal;
    let v = Math.sin(now * 2 * Math.PI * 10 + ch) * (eyes ? 10 : 2.5) + Math.sin(now * 2.3 + ch * 1.7) * 3 + (Math.random() - 0.5) * 4;
    const d = now - signal.blinkAt;
    if (!temporal && d >= 0 && d < 0.75) {
      const bump = (t0) => (d > t0 && d < t0 + 0.3 ? Math.sin(((d - t0) / 0.3) * Math.PI) : 0);
      v -= 24 * (bump(0) + bump(0.42));
    }
    if (now < signal.jawUntil && temporal) v += (Math.random() - 0.5) * 34;
    return v;
  }

  function drawMini(dt) {
    if (!mini.offsetParent || !mini.width) return;
    miniAcc += dt * 70;
    while (miniAcc >= 1) {
      miniAcc -= 1;
      for (let c = 0; c < 4; c++) traces[c][miniHead] = sample(c);
      miniHead = (miniHead + 1) % MINI_N;
    }
    const w = mini.width;
    const h = mini.height;
    const dpr = w / mini.clientWidth;
    mctx.clearRect(0, 0, w, h);
    const left = 34 * dpr;
    const rowH = h / 4;
    mctx.font = `600 ${9 * dpr}px "IBM Plex Sans KR", sans-serif`;
    mctx.textBaseline = 'middle';
    ['TP9', 'AF7', 'AF8', 'TP10'].forEach((name, c) => {
      const mid = rowH * (c + 0.5);
      mctx.fillStyle = 'rgba(159,180,176,0.9)';
      mctx.fillText(name, 6 * dpr, mid);
      mctx.strokeStyle = 'rgba(207,227,221,0.95)';
      mctx.lineWidth = 1.2 * dpr;
      mctx.beginPath();
      for (let i = 0; i < MINI_N; i++) {
        const v = traces[c][(miniHead + i) % MINI_N];
        const x = left + (i / (MINI_N - 1)) * (w - left - 6 * dpr);
        const y = mid - v * 0.32 * dpr;
        if (i === 0) mctx.moveTo(x, y); else mctx.lineTo(x, y);
      }
      mctx.stroke();
    });
  }

  // ---------- frame loop ----------
  const GEM_ANCHOR = new THREE.Vector3(0, 1.48, 0);
  const ME_ANCHOR = new THREE.Vector3(0, 1.5, 0);
  const PYLON_ANCHOR = new THREE.Vector3(0, 3.05, 0);
  const FPZ_ANCHOR = new THREE.Vector3(0, 1.0, 0);
  const statAlpha = $('#stat-alpha');
  let nextStat = 0;

  function animate(dt) {
    if (now >= demo.nextStep) {
      step();
      if (demo.nextStep <= now) demo.nextStep = now + DWELL;
    }

    if (!reduceMotion) {
      crystals.forEach((c) => {
        c.gem.position.y = 0.9 + Math.sin(now * 1.7 + c.phase) * 0.07;
        c.gem.rotation.y += dt * c.spin;
      });
      pylons.forEach((p) => {
        const y = 2.68 + Math.sin(now * 1.3 + p.phase) * 0.05;
        p.orb.position.y = y;
        p.halo.position.y = y;
        p.halo.scale.setScalar(1 + Math.sin(now * 2 + p.phase) * 0.08);
      });
      fpzRing.position.y = 0.66 + Math.sin(now * 1.1) * 0.06;
      fpzRing.rotation.z += dt * 0.4;
      footRing.material.opacity = 0.35 + Math.sin(now * 2.2) * 0.15;
      shards.forEach((s) => {
        s.m.position.y = s.y + Math.sin(now * 0.6 + s.phase) * 0.2;
        s.m.rotation.y += dt * 0.15;
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
      nextStat = now + 0.5;
      const alpha = now < signal.eyesUntil ? 52 + Math.random() * 6 : 16 + Math.random() * 5;
      statAlpha.textContent = `${Math.round(alpha)}%`;
    }
  }

  function placeLabels() {
    pin(meTag, avatar, ME_ANCHOR);
    pin(bubble, avatar, ME_ANCHOR, -34);
    crystals.forEach((c) => pin(c.label, c.group, GEM_ANCHOR));
    pylons.forEach((p, i) => pin(pylonTags[i], p.group, PYLON_ANCHOR));
    pin(fpzTag, fpz, FPZ_ANCHOR);
  }

  setWords();
  light(0);
  feed('데모 재생 중. 실제 입력은 아직 연결되지 않았어요.');

  // Console handles for trying the effects by hand: NVArena.select(), .switchBoard(), .goBack()
  window.NVArena = { select, switchBoard, goBack };

  const clock = new THREE.Clock();
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.1);
    now = clock.elapsedTime;
    animate(dt);
    renderer.render(scene, camera);
    placeLabels();
    drawMini(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
