'use strict';
/* Mesin logika murni (tanpa DOM), bisa diuji di Node. */
(function (root) {
  const W = 960, H = 540, PR = 14, SPEED = 230, DASH_SPEED = 680, DASH_T = 0.16, DASH_CD = 1.1, FIRE = 0.18, RANGE = 520, MAXHP = 5, STEP = 1 / 60;
  const TYPES = { swarm: { r: 12, hp: 1, pts: 10 }, tank: { r: 20, hp: 4, pts: 30 }, shooter: { r: 14, hp: 2, pts: 25 } };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function createGame(rngFn) {
    const rng = typeof rngFn === 'function' ? rngFn : Math.random;
    const g = { W, H, p: { x: W / 2, y: H / 2, hp: MAXHP, inv: 0, dash: 0, dashCd: 0, fx: 0, fy: -1, fire: 0, rapid: 0, dx: 0, dy: -1 },
      enemies: [], bullets: [], pickups: [], wave: 0, toSpawn: 0, spawnT: 0, gap: 1.5, score: 0, combo: 0, comboT: 0, mult: 1,
      time: 0, over: false, events: [], mx: 0, my: 0 };
    const ev = (type, o) => { if (g.events.length < 200) g.events.push(Object.assign({ type }, o)); };
    const p = g.p;

    g.setMove = (x, y) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) { g.mx = g.my = 0; return; }
      const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } g.mx = x; g.my = y;
    };
    g.dash = () => {
      if (g.over || p.dashCd > 0) return false;
      let x = g.mx, y = g.my; if (!x && !y) { x = p.fx; y = p.fy; }
      const l = Math.hypot(x, y) || 1; p.dx = x / l; p.dy = y / l; p.dash = DASH_T; p.dashCd = DASH_CD; ev('dash'); return true;
    };
    const startWave = () => { g.wave++; g.toSpawn = Math.min(4 + g.wave * 2, 40); g.spawnT = 0.5; ev('wave', { n: g.wave }); };
    const spawn = () => {
      const r = rng(), type = g.wave >= 4 && r < 0.2 ? 'shooter' : g.wave >= 3 && r < 0.4 ? 'tank' : 'swarm', T = TYPES[type], side = Math.floor(rng() * 4) % 4;
      const x = side === 0 ? -20 : side === 1 ? W + 20 : rng() * W, y = side === 2 ? -20 : side === 3 ? H + 20 : rng() * H;
      g.enemies.push({ x, y, type, hp: T.hp, r: T.r, cd: 1 + rng() });
    };
    const hurt = () => {
      if (p.inv > 0 || p.dash > 0 || g.over) return false;
      p.hp--; p.inv = 1.1; ev('hurt');
      if (p.hp <= 0) { p.hp = 0; g.over = true; ev('over'); }
      return true;
    };
    const shoot = (x, y, dx, dy, speed, from) => {
      if (g.bullets.length < 300) g.bullets.push({ x, y, vx: dx * speed, vy: dy * speed, from, life: from === 'p' ? 1.1 : 3 });
    };
    const kill = e => {
      const T = TYPES[e.type]; g.combo++; g.comboT = 1.6; g.mult = Math.min(5, 1 + Math.floor(g.combo / 5)); g.score += T.pts * g.mult;
      ev('kill', { x: e.x, y: e.y, kind: e.type });
      const r = rng();
      if (r < (p.hp < MAXHP ? 0.07 : 0.02)) g.pickups.push({ x: e.x, y: e.y, type: 'heart', ttl: 8 });
      else if (r < 0.13) g.pickups.push({ x: e.x, y: e.y, type: 'rapid', ttl: 8 });
    };

    const step = dt => {
      g.time += dt; p.inv = Math.max(0, p.inv - dt); p.dashCd = Math.max(0, p.dashCd - dt); p.rapid = Math.max(0, p.rapid - dt); p.fire -= dt;
      g.comboT -= dt; if (g.comboT <= 0 && g.combo) { g.combo = 0; g.mult = 1; }
      // gerak pemain
      let vx, vy;
      if (p.dash > 0) { p.dash -= dt; vx = p.dx * DASH_SPEED; vy = p.dy * DASH_SPEED; } else { vx = g.mx * SPEED; vy = g.my * SPEED; }
      p.x = clamp(p.x + vx * dt, PR, W - PR); p.y = clamp(p.y + vy * dt, PR, H - PR);
      // tembak otomatis ke musuh terdekat
      let tg = null, td = RANGE;
      for (const e of g.enemies) { const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < td) { td = d; tg = e; } }
      if (tg) { p.fx = (tg.x - p.x) / (td || 1); p.fy = (tg.y - p.y) / (td || 1); if (p.fire <= 0) { shoot(p.x, p.y, p.fx, p.fy, 620, 'p'); p.fire = FIRE * (p.rapid > 0 ? 0.5 : 1); } }
      else if (g.mx || g.my) { const l = Math.hypot(g.mx, g.my); p.fx = g.mx / l; p.fy = g.my / l; }
      // musuh
      for (const e of g.enemies) {
        const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
        if (e.type === 'swarm') { const s = Math.min(160, 85 + g.wave * 4); e.x += ux * s * dt; e.y += uy * s * dt; }
        else if (e.type === 'tank') { const s = Math.min(100, 55 + g.wave * 1.5); e.x += ux * s * dt; e.y += uy * s * dt; }
        else {
          const s = 75; if (d > 280) { e.x += ux * s * dt; e.y += uy * s * dt; } else if (d < 200) { e.x -= ux * s * dt; e.y -= uy * s * dt; } else { e.x += -uy * s * 0.6 * dt; e.y += ux * s * 0.6 * dt; }
          e.cd -= dt; if (e.cd <= 0 && d < 640) { shoot(e.x, e.y, ux, uy, 250, 'e'); e.cd = Math.max(1, 2.4 - g.wave * 0.05) + rng() * 0.4; }
        }
      }
      for (let i = 0; i < g.enemies.length; i++) for (let j = i + 1; j < g.enemies.length; j++) { // saling dorong
        const a = g.enemies[i], b = g.enemies[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = a.r + b.r;
        if (d < m && d > 0.001) { const o = (m - d) / 2 / d; a.x -= dx * o; a.y -= dy * o; b.x += dx * o; b.y += dy * o; }
      }
      for (const e of g.enemies) { // sentuhan
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < e.r + PR - 2 && hurt()) { const l = d || 1; e.x += (e.x - p.x) / l * 50; e.y += (e.y - p.y) / l * 50; }
      }
      // peluru
      for (const b of g.bullets) {
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        if (b.x < -10 || b.y < -10 || b.x > W + 10 || b.y > H + 10) b.life = 0;
        if (b.life <= 0) continue;
        if (b.from === 'p') {
          for (const e of g.enemies) if (e.hp > 0 && Math.hypot(e.x - b.x, e.y - b.y) < e.r + 4) { e.hp--; b.life = 0; if (e.hp <= 0) kill(e); else ev('hit', { x: b.x, y: b.y }); break; }
        } else if (Math.hypot(p.x - b.x, p.y - b.y) < PR + 5 && p.inv <= 0 && p.dash <= 0) { b.life = 0; hurt(); }
      }
      g.enemies = g.enemies.filter(e => e.hp > 0); g.bullets = g.bullets.filter(b => b.life > 0);
      for (const k of g.pickups) {
        k.ttl -= dt;
        if (k.ttl > 0 && Math.hypot(k.x - p.x, k.y - p.y) < PR + 14) { k.ttl = 0; if (k.type === 'heart') p.hp = Math.min(MAXHP, p.hp + 1); else p.rapid = 6; ev('pickup', { kind: k.type }); }
      }
      g.pickups = g.pickups.filter(k => k.ttl > 0);
      // gelombang
      if (g.toSpawn > 0) { g.spawnT -= dt; if (g.spawnT <= 0 && g.enemies.length < 30) { spawn(); g.toSpawn--; g.spawnT = Math.max(0.25, 0.9 - g.wave * 0.04); } }
      else if (!g.enemies.length) { if (g.gap <= 0) { if (g.wave) { g.score += g.wave * 50; ev('clear'); } g.gap = 2; } g.gap -= dt; if (g.gap <= 0) startWave(); }
    };
    g.tick = dt => {
      if (g.over || !(dt > 0)) return;
      let rem = Math.min(dt, 0.1);
      while (rem > 1e-6 && !g.over) { const s = Math.min(rem, STEP); step(s); rem -= s; }
    };
    return g;
  }
  const api = { createGame, W, H, PR, MAXHP, DASH_CD, TYPES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NeonEngine = api;
})(typeof self !== 'undefined' ? self : this);
