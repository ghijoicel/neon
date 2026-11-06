// Jalankan: node tests/test.js
const E = require('../assets/js/engine.js'); const assert = require('assert');
let seed = 5; const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const OK_EV = ['kill', 'hit', 'hurt', 'wave', 'clear', 'pickup', 'dash', 'over'], seen = new Set();
const inv = g => {
  const p = g.p; [p.x, p.y, g.score].forEach(v => assert(Number.isFinite(v)));
  assert(p.hp >= 0 && p.hp <= E.MAXHP && p.x >= 0 && p.x <= E.W && p.y >= 0 && p.y <= E.H, 'pemain tidak valid');
  assert(g.score >= 0 && g.mult >= 1 && g.mult <= 5 && g.enemies.length <= 30 + 1 && g.bullets.length <= 300, 'status tidak valid');
  g.enemies.forEach(e => { assert(Number.isFinite(e.x + e.y) && e.hp > 0); });
  g.events.forEach(e => { assert(OK_EV.includes(e.type), 'tipe event tak dikenal: ' + e.type); seen.add(e.type); }); g.events.length = 0;
};
// 1) fuzz input ekstrem (NaN, Infinity, nilai besar, dt aneh)
for (let r = 0; r < 40; r++) { seed = r * 13 + 2; const g = E.createGame(rng);
  for (let k = 0; k < 4000 && !g.over; k++) { g.setMove(...[[rng() * 4 - 2, rng() * 4 - 2], [NaN, 1], [Infinity, 0], [0, 0]][k % 4]); if (rng() < 0.05) g.dash(); g.tick([0.016, 0.5, -1, NaN, 0][k % 5]); inv(g); } }
// 2) pemain diam harus kalah
{ seed = 8; const g = E.createGame(rng); while (!g.over && g.time < 400) { g.tick(0.033); inv(g); } assert(g.over, 'pemain diam harus kalah'); }
// 3) bot menghindar: harus bisa lolos beberapa gelombang
const bot = g => { let ax = 0, ay = 0;
  g.enemies.concat(g.bullets.filter(b => b.from === 'e')).forEach(e => { const dx = g.p.x - e.x, dy = g.p.y - e.y, d = Math.hypot(dx, dy) || 1; if (d < 220) { ax += dx / d / d * 220; ay += dy / d / d * 220; } });
  ax += (g.W / 2 - g.p.x) / 400; ay += (g.H / 2 - g.p.y) / 400; g.setMove(ax, ay);
  if (g.enemies.some(e => Math.hypot(e.x - g.p.x, e.y - g.p.y) < 40)) g.dash(); };
const waves = []; for (let r = 0; r < 12; r++) { seed = 100 + r; const g = E.createGame(rng); while (!g.over && g.time < 240) { bot(g); g.tick(1 / 30); inv(g); } waves.push(g.wave); }
assert(Math.max(...waves) >= 4, 'terlalu sulit: ' + waves); assert(Math.min(...waves) >= 2, 'bot tak lolos gelombang 2: ' + waves);
['kill', 'hit', 'hurt', 'wave', 'pickup', 'dash', 'over'].forEach(t => assert(seen.has(t), 'event tak pernah muncul: ' + t));
console.log('OK — fuzz, pemain diam kalah, bot mencapai gelombang:', waves.join(','));
