'use strict';
/* Tampilan, input sentuh/keyboard, suara, layar penuh. Tanpa innerHTML/eval/jaringan. */
(() => {
  const E = window.NeonEngine; if (!E) return;
  const W = E.W, H = E.H, TAU = Math.PI * 2;
  const $ = id => document.getElementById(id);
  const cv = $('cv'), ctx = cv.getContext('2d'), stage = $('stage');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W * dpr; cv.height = H * dpr; ctx.scale(dpr, dpr);
  const grid = document.createElement('canvas'); grid.width = W * dpr; grid.height = H * dpr;
  { const c = grid.getContext('2d'); c.scale(dpr, dpr); c.fillStyle = '#05030c'; c.fillRect(0, 0, W, H); c.strokeStyle = 'rgba(139,92,246,.13)'; c.lineWidth = 1; c.beginPath();
    for (let x = 0; x <= W; x += 40) { c.moveTo(x, 0); c.lineTo(x, H); } for (let y = 0; y <= H; y += 40) { c.moveTo(0, y); c.lineTo(W, y); } c.stroke(); }

  const KEY = 'neon.best';
  const loadBest = () => { try { const n = parseInt(localStorage.getItem(KEY), 10); return Number.isFinite(n) && n >= 0 && n < 1e9 ? n : 0; } catch { return 0; } };
  const saveBest = n => { try { localStorage.setItem(KEY, String(n)); } catch { /* abaikan */ } };

  let g = E.createGame(), state = 'ready', best = loadBest(), muted = false, ac = null, last = 0, shakeT = 0, wake = null, bannerTO = 0;
  const keys = new Set(), fx = [], trail = [], cache = {};
  const joy = { id: null, ox: 0, oy: 0, vx: 0, vy: 0 };

  const beep = (f, d = 0.12, type = 'sine', v = 0.05) => {
    if (muted) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator(), gn = ac.createGain(), t = ac.currentTime;
      o.type = type; o.frequency.value = f; gn.gain.setValueAtTime(v, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(gn); gn.connect(ac.destination); o.start(t); o.stop(t + d);
    } catch { /* audio tidak tersedia */ }
  };
  const buzz = ms => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* abaikan */ } };
  const burst = (x, y, c, n = 12, sp = 160) => { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = 30 + Math.random() * sp, l = 0.35 + Math.random() * 0.4; fx.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, l, m: l, c, r: 1.5 + Math.random() * 2.5 }); } };
  const banner = t => { const b = $('banner'); b.textContent = t; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); clearTimeout(bannerTO); bannerTO = setTimeout(() => b.classList.remove('show'), 1900); };
  const CL = { swarm: '#f43f5e', tank: '#fb923c', shooter: '#c084fc' };

  /* ---------- layar penuh, orientasi, wake lock ---------- */
  const reqFS = stage.requestFullscreen || stage.webkitRequestFullscreen;
  const isFS = () => (document.fullscreenElement || document.webkitFullscreenElement) === stage;
  const toggleFS = async () => {
    try {
      if (isFS()) { await (document.exitFullscreen || document.webkitExitFullscreen).call(document); try { screen.orientation.unlock(); } catch { /* abaikan */ } }
      else { await reqFS.call(stage); try { await screen.orientation.lock('landscape'); } catch { /* tidak didukung */ } }
    } catch { banner('Layar penuh ditolak'); }
  };
  const syncFS = () => { $('bFs').textContent = isFS() ? '🗗' : '⛶'; $('bFs').setAttribute('aria-label', isFS() ? 'Keluar layar penuh' : 'Layar penuh'); };
  if (!reqFS) { $('bFs').disabled = true; $('bFs').title = 'Browser ini tidak mendukung layar penuh'; }
  $('bFs').addEventListener('click', toggleFS);
  document.addEventListener('fullscreenchange', syncFS); document.addEventListener('webkitfullscreenchange', syncFS);
  const getWake = async () => { try { if (navigator.wakeLock && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch { /* abaikan */ } };
  $('bMute').addEventListener('click', () => { muted = !muted; $('bMute').textContent = muted ? '🔇' : '🔊'; });

  /* ---------- alur ---------- */
  const overlay = (t, p, b) => { $('ovT').textContent = t; $('ovP').textContent = p; $('btn').textContent = b; $('ov').hidden = false; $('btn').focus({ preventScroll: true }); };
  const start = () => { g = E.createGame(); fx.length = 0; trail.length = 0; state = 'play'; $('ov').hidden = true; resetJoy(); beep(520, 0.15); getWake(); last = performance.now(); };
  const pause = () => { if (state === 'play') { state = 'pause'; keys.clear(); resetJoy(); overlay('Jeda', 'Skor ' + g.score + ' · Gelombang ' + Math.max(1, g.wave), 'Lanjutkan'); } };
  const resume = () => { state = 'play'; $('ov').hidden = true; last = performance.now(); getWake(); };
  const finish = () => {
    state = 'over'; resetJoy(); let m = 'Skor ' + g.score + ' · Gelombang ' + g.wave + ' · ' + Math.floor(g.time) + ' dtk.';
    if (g.score > best) { best = g.score; saveBest(best); m += ' Rekor baru! 🏆'; } else m += ' Rekor: ' + best;
    overlay('Pesawat hancur! 💥', m, 'Main Lagi');
  };
  overlay('Neon Siege', 'Tembakan otomatis ke musuh terdekat. Geser untuk menghindar, dash untuk kebal sesaat.' + (best ? ' Rekor: ' + best : ''), 'Mulai');
  $('btn').addEventListener('click', () => (state === 'pause' ? resume() : start()));
  $('bPause').addEventListener('click', () => (state === 'play' ? pause() : state === 'pause' && resume()));

  const handle = () => {
    for (const e of g.events) {
      if (e.type === 'kill') { burst(e.x, e.y, CL[e.kind] || '#fff', 14); burst(e.x, e.y, CL[e.kind] || '#fff', 10); beep(300 + Math.random() * 200, 0.08, 'triangle', 0.035); }
      else if (e.type === 'hit') burst(e.x, e.y, '#a5f3fc', 3, 90);
      else if (e.type === 'hurt') { shakeT = 0.3; stage.classList.remove('hurt'); void stage.offsetWidth; stage.classList.add('hurt'); beep(100, 0.3, 'sawtooth', 0.07); buzz(80); }
      else if (e.type === 'wave') { banner('GELOMBANG ' + e.n); beep(660, 0.25); }
      else if (e.type === 'clear') beep(880, 0.2);
      else if (e.type === 'pickup') { beep(900, 0.18); burst(g.p.x, g.p.y, '#fbbf24', 12); }
      else if (e.type === 'dash') beep(220, 0.12, 'square', 0.03);
      else if (e.type === 'over') { shakeT = 0.6; burst(g.p.x, g.p.y, '#22d3ee', 40, 260); beep(70, 0.6, 'sawtooth', 0.08); buzz(200); }
    }
    g.events.length = 0;
  };

  /* ---------- input: joystick melayang + keyboard ---------- */
  const R = 56;
  function resetJoy() { joy.id = null; joy.vx = joy.vy = 0; $('joyB').hidden = true; }
  stage.addEventListener('pointerdown', e => {
    if (state !== 'play' || joy.id !== null || e.target.closest('.ib,.dashbtn,.overlay')) return;
    joy.id = e.pointerId; const r = stage.getBoundingClientRect(); joy.ox = e.clientX; joy.oy = e.clientY;
    const jb = $('joyB'); jb.hidden = false; jb.style.setProperty('--x', (e.clientX - r.left) + 'px'); jb.style.setProperty('--y', (e.clientY - r.top) + 'px');
    jb.style.setProperty('--kx', '0px'); jb.style.setProperty('--ky', '0px');
    try { stage.setPointerCapture(e.pointerId); } catch { /* abaikan */ }
  });
  stage.addEventListener('pointermove', e => {
    if (e.pointerId !== joy.id) return;
    let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy; const l = Math.hypot(dx, dy);
    if (l > R) { dx = dx / l * R; dy = dy / l * R; }
    $('joyB').style.setProperty('--kx', dx + 'px'); $('joyB').style.setProperty('--ky', dy + 'px');
    const m = Math.hypot(dx, dy) / R; joy.vx = m < 0.15 ? 0 : dx / R; joy.vy = m < 0.15 ? 0 : dy / R;
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => stage.addEventListener(t, e => { if (e.pointerId === joy.id) resetJoy(); }));
  stage.addEventListener('contextmenu', e => e.preventDefault());
  $('bDash').addEventListener('pointerdown', e => { e.preventDefault(); if (state === 'play') g.dash(); });
  const KM = { arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0] };
  addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (KM[k] || k === ' ') e.preventDefault();
    if (KM[k]) { keys.add(k); return; }
    if (e.repeat) return;
    if ((k === ' ' || k === 'shift') && state === 'play') g.dash();
    else if (k === 'f') toggleFS(); else if (k === 'm') $('bMute').click();
    else if (k === 'p' || k === 'escape') $('bPause').click();
    else if (k === 'enter' && state === 'over') start();
  });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => { keys.clear(); pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); else if (state === 'play') getWake(); });
  const moveVec = () => {
    if (joy.id !== null) return [joy.vx, joy.vy];
    let x = 0, y = 0; keys.forEach(k => { if (KM[k]) { x += KM[k][0]; y += KM[k][1]; } }); return [x, y];
  };

  /* ---------- gambar ---------- */
  const glow = (x, y, r, c) => { const gr = ctx.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, c + '66'); gr.addColorStop(1, c + '00'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
  const poly = (x, y, r, n, rot) => { ctx.beginPath(); for (let i = 0; i < n; i++) { const a = rot + i * TAU / n; ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); };
  function draw(t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1;
    ctx.drawImage(grid, 0, 0, W, H);
    const sh = shakeT > 0 ? shakeT * 18 : 0; if (sh) ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
    for (const k of g.pickups) { const bob = Math.sin(t * 5 + k.x) * 3; ctx.globalAlpha = k.ttl < 2 ? 0.4 + 0.6 * Math.abs(Math.sin(t * 12)) : 1; glow(k.x, k.y, 26, k.type === 'heart' ? '#f43f5e' : '#fbbf24'); ctx.font = '22px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(k.type === 'heart' ? '❤️' : '⚡', k.x, k.y + bob); ctx.globalAlpha = 1; }
    for (const e of g.enemies) {
      const c = CL[e.type]; glow(e.x, e.y, e.r * 2.2, c); ctx.strokeStyle = c; ctx.fillStyle = c + '33';
      if (e.type === 'swarm') poly(e.x, e.y, e.r + 2, 4, t * 2 + e.x); else if (e.type === 'tank') poly(e.x, e.y, e.r + 2, 6, t); else poly(e.x, e.y, e.r + 3, 3, Math.atan2(g.p.y - e.y, g.p.x - e.x));
      ctx.fill(); ctx.stroke();
      if (e.type === 'tank') { ctx.fillStyle = c; for (let i = 0; i < e.hp; i++) ctx.fillRect(e.x - 10 + i * 6, e.y - 3, 4, 6); }
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const b of g.bullets) { const c = b.from === 'p' ? '#67e8f9' : '#fb7185'; ctx.strokeStyle = c; ctx.lineWidth = b.from === 'p' ? 3 : 4; ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * 0.025, b.y - b.vy * 0.025); ctx.stroke(); glow(b.x, b.y, 11, c); }
    ctx.restore(); ctx.lineWidth = 2.5;
    // pemain
    const p = g.p; trail.push({ x: p.x, y: p.y, l: 0.25 }); if (trail.length > 60) trail.shift();
    if (p.dash > 0) for (const q of trail) { ctx.globalAlpha = Math.max(0, q.l) * 1.4; ctx.fillStyle = '#22d3ee'; ctx.beginPath(); ctx.arc(q.x, q.y, 10, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1;
    if (!(p.inv > 0 && Math.floor(t * 18) % 2) || p.dash > 0) {
      const a = Math.atan2(p.fy, p.fx); glow(p.x, p.y, 40, p.rapid > 0 ? '#fbbf24' : '#22d3ee');
      ctx.strokeStyle = p.rapid > 0 ? '#fbbf24' : '#22d3ee'; ctx.fillStyle = '#0a1a24'; ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(a) * 18, p.y + Math.sin(a) * 18); ctx.lineTo(p.x + Math.cos(a + 2.5) * 15, p.y + Math.sin(a + 2.5) * 15); ctx.lineTo(p.x + Math.cos(a + Math.PI) * 5, p.y + Math.sin(a + Math.PI) * 5); ctx.lineTo(p.x + Math.cos(a - 2.5) * 15, p.y + Math.sin(a - 2.5) * 15); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    for (const f of fx) { ctx.globalAlpha = Math.max(0, f.l / f.m); ctx.fillStyle = f.c; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  const setTxt = (id, v) => { if (cache[id] !== v) { cache[id] = v; $(id).textContent = v; } };
  const hud = () => {
    setTxt('hHp', '❤️'.repeat(g.p.hp) + '🖤'.repeat(E.MAXHP - g.p.hp)); setTxt('hScore', String(g.score)); setTxt('hCombo', g.combo > 1 ? '×' + g.mult + ' · ' + g.combo + ' beruntun' : '');
    setTxt('hWave', 'Gelombang ' + Math.max(1, g.wave)); $('dashCd').style.setProperty('--c', (g.p.dashCd / E.DASH_CD * 100).toFixed(0));
  };

  function frame(ts) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
    if (state === 'play') { const [mx, my] = moveVec(); g.setMove(mx, my); g.tick(dt); handle(); if (g.over) finish(); }
    for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.l -= dt; f.x += f.vx * dt; f.y += f.vy * dt; if (f.l <= 0) fx.splice(i, 1); }
    if (fx.length > 500) fx.splice(0, fx.length - 500);
    for (const q of trail) q.l -= dt; shakeT = Math.max(0, shakeT - dt);
    draw(ts / 1000); hud();
  }
  requestAnimationFrame(frame);
})();
