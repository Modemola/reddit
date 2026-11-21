// VAULT client: the job sheet, the vaults and the builder. Ported from the prototype in prototype/vault/.
// Rules come from the shared engine; results are decided by the server replaying each run.
import { showToast } from '@devvit/web/client';
import { Endpoint } from '../shared/api.ts';
import { advanceGuards, camDir, DIRS, danger, guardPos, HEARING, laserOn, parse, pebbleTargets, ray, solve, startState, step } from '../shared/engine.ts';
import { bestMoves, deadliness, HOUSE, H, nightOf, partsFor, RHYTHMS, START, SWEEPS, W } from '../shared/vault.ts';
import { GIF } from './gif.js';
import { MusicPlayer } from './music.js';
const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const C = Object.fromEntries(['night', 'floor', 'floor2', 'grain', 'mortar', 'wall', 'wallside', 'text', 'muted', 'you', 'gem', 'guard', 'laser', 'cam'].map(k => [k, css('--' + k)]));
let dayNo = nightOf(Date.now());
const W7 = W, H9 = H;
const LEVELS = HOUSE;

// ---------- shared drawing ----------
function painter(cv) {
  const ctx = cv.getContext('2d'); let DPR = 1, T = 0, layer = null, layerSig = '', lightCv = null;
  const rnd = (x, y, i) => { const n = Math.sin(x * 127.1 + y * 311.7 + i * 74.7) * 43758.5453; return n - Math.floor(n); };
  function boards(L, x, y) {
    // three oak planks per tile, joints staggered, a little grain
    const X = x * T, Y = y * T, h = T / 3;
    for (let i = 0; i < 3; i++) {
      L.fillStyle = rnd(x, y, i) > 0.5 ? C.floor : C.floor2; L.fillRect(X, Y + i * h, T, h);
      L.strokeStyle = C.grain; L.globalAlpha = 0.5; L.lineWidth = 1;
      for (let g = 0; g < 2; g++) { const gy = Y + i * h + h * (0.3 + 0.4 * rnd(x, y, i * 3 + g)); L.beginPath(); L.moveTo(X + T * rnd(x, y, 9 + g), gy); L.lineTo(X + T * Math.min(1, rnd(x, y, 9 + g) + 0.45), gy + 0.5); L.stroke(); }
      L.globalAlpha = 1; L.fillStyle = C.grain; L.fillRect(X, Y + (i + 1) * h - 1, T, 1);
      const j = X + T * (((x * 3 + y * 7 + i * 5) % 4) / 4 + 0.12); L.fillRect(j, Y + i * h, 1, h);
    }
  }
  function brick(L, x, y) {
    const X = x * T, Y = y * T, top = T * 0.8;
    L.fillStyle = C.wallside; L.fillRect(X, Y, T, T);
    L.fillStyle = C.mortar; L.fillRect(X, Y, T, top);
    const rows = 3, bh = top / rows;
    for (let r = 0; r < rows; r++) {
      const off = (r + y) % 2 ? T / 4 : 0;
      for (let b = -1; b < 3; b++) {
        const bx = X + off + b * T / 2 + 1, w = T / 2 - 2, x0 = Math.max(X + 1, bx), x1 = Math.min(X + T - 1, bx + w);
        if (x1 <= x0) continue;
        L.fillStyle = C.wall; L.globalAlpha = 0.82 + 0.18 * rnd(x * 4 + b, y * 3 + r, 1); L.fillRect(x0, Y + r * bh + 1, x1 - x0, bh - 2); L.globalAlpha = 1;
      }
    }
  }
  const api = {
    ctx, get T() { return T; },
    size(V) { DPR = Math.min(devicePixelRatio || 1, 2.5); const w = cv.clientWidth || 400; T = w / V.w; cv.style.height = (T * V.h) + 'px'; cv.width = Math.round(w * DPR); cv.height = Math.round(T * V.h * DPR); },
    begin(V) { ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.fillStyle = C.night; ctx.fillRect(0, 0, V.w * T, V.h * T); },
    c(x, y) { return [(x + 0.5) * T, (y + 0.5) * T]; },
    floor(V) {
      // The floor and walls never change during a vault, so they are drawn once and reused.
      const sig = V.w + 'x' + V.h + ':' + T + ':' + [...V.walls].join(';');
      if (!layer || layerSig !== sig) {
        layer = document.createElement('canvas'); layer.width = cv.width; layer.height = cv.height; layerSig = sig;
        const L = layer.getContext('2d'); L.setTransform(DPR, 0, 0, DPR, 0, 0);
        for (let y = 0; y < V.h; y++) for (let x = 0; x < V.w; x++) {
          const k = x + ',' + y, cam = V.cams.some(c => c.at[0] === x && c.at[1] === y), las = V.lasers.some(l => l.at[0] === x && l.at[1] === y);
          const wall = (V.walls.has(k) && !cam && !las) || (las && (x === 0 || y === 0 || x === V.w - 1 || y === V.h - 1 || isWallTile(V, x, y)));
          wall ? brick(L, x, y) : boards(L, x, y);
        }
      }
      ctx.drawImage(layer, 0, 0, V.w * T, V.h * T);
    },
    // Night over everything, with pools of light cut out where the light is.
    light(V, sources) {
      if (!lightCv || lightCv.width !== cv.width || lightCv.height !== cv.height) { lightCv = document.createElement('canvas'); lightCv.width = cv.width; lightCv.height = cv.height; }
      const L = lightCv.getContext('2d'); L.setTransform(DPR, 0, 0, DPR, 0, 0); L.globalCompositeOperation = 'source-over';
      L.clearRect(0, 0, V.w * T, V.h * T); L.fillStyle = 'rgba(7, 10, 26, 0.5)'; L.fillRect(0, 0, V.w * T, V.h * T);
      L.globalCompositeOperation = 'destination-out';
      for (const s of sources) { const [cx, cy] = api.c(s.x, s.y), R = s.r * T, g = L.createRadialGradient(cx, cy, 0, cx, cy, R); g.addColorStop(0, 'rgba(0,0,0,' + s.a + ')'); g.addColorStop(1, 'rgba(0,0,0,0)'); L.fillStyle = g; L.fillRect(cx - R, cy - R, 2 * R, 2 * R); }
      ctx.drawImage(lightCv, 0, 0, V.w * T, V.h * T);
      ctx.globalCompositeOperation = 'lighter';
      for (const s of sources) if (s.tint) { const [cx, cy] = api.c(s.x, s.y), R = s.r * T * 0.9, g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R); g.addColorStop(0, s.tint); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R); }
      ctx.globalCompositeOperation = 'source-over';
    },
    torch(gx, gy, f, now) {
      // a small flame carried at the guard's side
      const [cx, cy] = [(gx + 0.5) * T, (gy + 0.5) * T], [fx, fy] = DIRS[f], sx = cx + (-fy) * T * 0.3 + fx * T * 0.06, sy = cy + fx * T * 0.3 + fy * T * 0.06;
      const fl = 1 + 0.18 * Math.sin(now / 70 + gx * 3) + 0.1 * Math.sin(now / 37 + gy);
      ctx.fillStyle = '#ffdf8a'; ctx.beginPath(); ctx.ellipse(sx, sy, T * 0.07 * fl, T * 0.1 * fl, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff6d8'; ctx.beginPath(); ctx.arc(sx, sy + T * 0.02, T * 0.035, 0, 7); ctx.fill();
    },
    gem(V, now) {
      const [cx, cy] = api.c(...V.gem), r = T * 0.24 * (1 + 0.06 * Math.sin(now / 300));
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, T * 0.7); g.addColorStop(0, C.gem + '55'); g.addColorStop(1, C.gem + '00');
      ctx.fillStyle = g; ctx.fillRect(cx - T, cy - T, 2 * T, 2 * T);
      ctx.fillStyle = C.gem; ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r * 0.8, cy - r * 0.2); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r * 0.8, cy - r * 0.2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#ffffffaa'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx - r * 0.8, cy - r * 0.2); ctx.lineTo(cx + r * 0.8, cy - r * 0.2); ctx.stroke();
    },
    laser(V, l, on, next, now) {
      const [ex, ey] = api.c(...l.at), end = l.beam.length ? api.c(...l.beam[l.beam.length - 1]) : [ex, ey], [dx, dy] = DIRS[l.dir];
      const fx = end[0] + dx * T * 0.5, fy = end[1] + dy * T * 0.5;
      if (on) { ctx.strokeStyle = C.laser; ctx.shadowColor = C.laser; ctx.shadowBlur = 12; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(fx, fy); ctx.stroke(); ctx.shadowBlur = 0; ctx.lineWidth = 1; ctx.strokeStyle = '#fff'; ctx.stroke(); }
      else if (next) { ctx.strokeStyle = C.laser; ctx.globalAlpha = 0.5 + 0.4 * Math.sin(now / 90); ctx.setLineDash([4, 6]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(fx, fy); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; }
      ctx.fillStyle = C.wallside; ctx.fillRect(l.at[0] * T + T * 0.2, l.at[1] * T + T * 0.2, T * 0.6, T * 0.6);
      ctx.fillStyle = on ? C.laser : '#7a3540'; ctx.beginPath(); ctx.arc(ex, ey, T * 0.12, 0, 7); ctx.fill();
    },
    cam(V, c, d, nd) {
      api.cone(c.at, d, rayV(V, c.at, d, c.see).length, C.cam, 0.22);
      const [cx, cy] = api.c(...c.at); ctx.fillStyle = C.wallside; ctx.beginPath(); ctx.arc(cx, cy, T * 0.32, 0, 7); ctx.fill();
      ctx.fillStyle = C.cam; ctx.beginPath(); ctx.arc(cx, cy, T * 0.14, 0, 7); ctx.fill();
      if (nd) { const n = DIRS[nd]; ctx.strokeStyle = C.cam; ctx.globalAlpha = 0.6; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx + n[0] * T * 0.2, cy + n[1] * T * 0.2); ctx.lineTo(cx + n[0] * T * 0.34, cy + n[1] * T * 0.34); ctx.stroke(); ctx.globalAlpha = 1; }
    },
    guard(gx, gy, f) {
      const [cx, cy] = [(gx + 0.5) * T, (gy + 0.5) * T];
      ctx.fillStyle = C.guard; ctx.beginPath(); ctx.arc(cx, cy, T * 0.27, 0, 7); ctx.fill();
      const [fx, fy] = DIRS[f]; ctx.fillStyle = C.night; ctx.beginPath(); ctx.arc(cx + fx * T * 0.12, cy + fy * T * 0.12, T * 0.07, 0, 7); ctx.fill();
    },
    cone(at, dir, len, color, alpha) {
      if (!len) return;
      const [dx, dy] = DIRS[dir], [cx, cy] = [(at[0] + 0.5) * T, (at[1] + 0.5) * T], L = (len + 0.5) * T, Wd = 0.5 * T;
      const ex = cx + dx * L, ey = cy + dy * L, px = -dy, py = dx;
      const g = ctx.createLinearGradient(cx, cy, ex, ey); g.addColorStop(0, color + 'aa'); g.addColorStop(1, color + '10');
      ctx.globalAlpha = Math.min(1, alpha * 3); ctx.fillStyle = g; ctx.beginPath();
      ctx.moveTo(cx + px * T * 0.12, cy + py * T * 0.12); ctx.lineTo(ex + px * Wd, ey + py * Wd); ctx.lineTo(ex - px * Wd, ey - py * Wd); ctx.lineTo(cx - px * T * 0.12, cy - py * T * 0.12);
      ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    },
    thief(px, py, caught) {
      const [cx, cy] = [(px + 0.5) * T, (py + 0.5) * T];
      ctx.fillStyle = '#00000066'; ctx.beginPath(); ctx.ellipse(cx, cy + T * 0.2, T * 0.22, T * 0.08, 0, 0, 7); ctx.fill();
      ctx.fillStyle = caught ? C.laser : C.you; ctx.beginPath(); ctx.arc(cx, cy, T * 0.25, 0, 7); ctx.fill();
      ctx.fillStyle = C.night; ctx.fillRect(cx - T * 0.17, cy - T * 0.07, T * 0.34, T * 0.09);
      ctx.fillStyle = C.you; ctx.fillRect(cx - T * 0.1, cy - T * 0.05, T * 0.05, T * 0.05); ctx.fillRect(cx + T * 0.05, cy - T * 0.05, T * 0.05, T * 0.05);
    },
  };
  return api;
}
function isWallTile(V, x, y) { return V.rawWalls ? V.rawWalls.has(x + ',' + y) : true; }
const rayV = ray;
const parseL = L => parse(L);

// ---------- views ----------
let view = 'home';
function show(v) { view = v; if (v !== 'play') music.play(v === 'home' ? 'title' : null); for (const k of ['home', 'play', 'build']) $('v-' + k).hidden = k !== v; if (v === 'home') renderHome(); if (v === 'build') openBuilder(); window.scrollTo(0, 0); }
$('home-link').onclick = () => show('home');
$('home-link').onkeydown = e => { if (e.key === 'Enter') show('home'); };

// ---------- crack ----------
const P = painter($('board'));
const G = { frames: [], lastCap: 0, endAt: 0, result: null, drawn: {}, aim: false, barks: [], pebbleFx: null, L: null, key: '', label: '', next: null, V: null, s: null, prev: null, anim: 1, a0: 0, moves: 0, over: null, best: 0, owner: null };
function play(L, key, label, next, owner) {
  Object.assign(G, { L, key, label, next, owner, V: parseL(L), over: null, moves: 0, anim: 1 });
  G.log = []; G.s = startState(G.V); G.prev = G.s; G.aim = false; G.barks = []; G.pebbleFx = null; G.frames = []; G.lastCap = 0; G.endAt = 0; G.result = null;
  G.best = (solve(G.V) || []).length;
  $('overlay').hidden = true; $('coach').hidden = true; coachState.tip = null; show('play'); P.size(G.V); renderPlay(); music.play('heist'); music.setMood('calm');
}
function restart() { play(G.L, G.key, G.label, G.next, G.owner); }
function move(m) {
  if (view !== 'play' || G.over || G.anim < 1) return;
  const n = step(G.V, G.s, m);
  if (!n) { bumpT = performance.now(); return; }
  const now = performance.now();
  if (typeof m === 'object') { sfx.pebble(); G.pebbleFx = { from: G.s.pos, to: m.pebble, t0: now }; G.aim = false; for (const i of n.heard || []) bark(i, 'suspicious', now + 260); }
  else n.knocked >= 0 ? (sfx.knock(), bark(n.knocked, 'knocked', now)) : sfx.step();
  G.s.gs.forEach((g, i) => { if (g[3] && !n.gs[i][3] && !(n.ko & (1 << i))) bark(i, 'return', now); });
  G.log.push(m); G.prev = G.s; G.s = n; G.moves++; G.a0 = now; G.anim = 0;
  music.setMood(n.status === 'caught' ? 'chase' : tension(n));
  if (n.status === 'caught' && n.by) { const gi = G.V.guards.findIndex(g => { const p = guardPos(g, n); return p[0] === n.by[0] && p[1] === n.by[1]; }); if (gi >= 0) bark(gi, 'alert', now); }
  if (n.status !== 'play') { G.endAt = now; G.result = { status: n.status, moves: G.moves, cause: n.cause }; G.over = 'pending'; setTimeout(() => finish(n), n.status === 'caught' ? 900 : 350); }
  renderPlay();
}
let bumpT = 0;
function finish(n) {
  if (G.key === 'test') { G.over = n.status; music.sting(n.status === 'won' ? 'cracked' : 'caught'); overlay(n.status, n.status === 'won' ? 'CRACKED' : 'CAUGHT', n.status === 'won' ? `Your vault works. ${G.moves} moves; the best possible is ${G.best}.` : why(n.cause), G.label === 'Test run' ? 'Tap to go back to building' : 'Tap to go back to the job sheet'); return; }
  const prev = progress[G.key] || { tries: 0, won: false, moves: 0 };
  const tries = prev.tries + 1;
  try { navigator.vibrate?.(n.status === 'caught' ? [70, 50, 70] : [20, 40, 20, 40, 60]); } catch {}
  if (n.status === 'caught') {
    sfx.alarm(); music.sting('caught'); G.over = 'caught';
    overlay('caught', 'CAUGHT', why(n.cause), 'Tap to try again');
  } else {
    sfx.win(); music.sting('cracked'); G.over = 'won';
    overlay('won', 'CRACKED', `${G.moves} moves${G.moves <= G.best ? ' · a perfect run' : ` · best possible is ${G.best}`}. Caught ${tries - 1} ${tries - 1 === 1 ? 'time' : 'times'} first.`, G.next ? 'Tap for the next vault' : 'Tap to go back to the job sheet');
  }
  // what we show is local; what counts is the server's replay of the same moves
  progress[G.key] = { tries, won: prev.won || n.status === 'won', moves: n.status === 'won' ? (prev.won ? Math.min(prev.moves, G.moves) : G.moves) : prev.moves };
  submitAttempt(G.key, G.log.slice());
  renderPlay();
}
const why = c => ({ guard: 'A guard spotted you.', laser: 'You walked into a live laser.', camera: 'The camera caught you.' }[c] || 'You were caught.');
function overlay(cls, h, p, sub) {
  const o = $('overlay'); o.className = 'overlay ' + cls; o.hidden = false;
  const canShare = G.key !== 'test' && G.frames.length > 2 && !shared.has(G.key);
  o.innerHTML = `<h2>${h}</h2><p>${p}</p><div class="small">${sub}</div>` + (canShare ? `<button class="primary share" type="button" id="share-btn">${cls === 'won' ? 'Post this crack in the comments' : 'Post this bust in the comments'}</button>` : '');
  const sb = $('share-btn'); if (sb) sb.onclick = e => { e.stopPropagation(); void shareRun(sb); };
}
$('overlay').onclick = () => {
  if (G.key === 'test') { show(G.label === 'Test run' ? 'build' : 'home'); return; }
  if (G.over === 'caught') restart();
  else if (G.over === 'won') G.next ? G.next() : show('home');
};
$('restart').onclick = () => { sfx.wake(); restart(); };
$('wait').onclick = () => { sfx.wake(); move('W'); };
$('pebble').onclick = () => { sfx.wake(); if (G.over || !G.s.peb) return; G.aim = !G.aim; renderPlay(); };
let down = null;
$('board').addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; sfx.wake(); });
$('board').addEventListener('pointerup', e => {
  if (!down) return; const dx = e.clientX - down[0], dy = e.clientY - down[1]; down = null;
  if (Math.hypot(dx, dy) > 22) { move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U')); return; }
  const r = $('board').getBoundingClientRect(), x = Math.floor((e.clientX - r.left) / P.T), y = Math.floor((e.clientY - r.top) / P.T);
  if (G.aim) { const ok = pebbleTargets(G.V, G.s).some(p => p[0] === x && p[1] === y); if (ok) move({ pebble: [x, y] }); else { G.aim = false; renderPlay(); } return; }
  const [px, py] = G.s.pos, ddx = x - px, ddy = y - py;
  if (!ddx && !ddy) move('W'); else if (Math.abs(ddx) >= Math.abs(ddy)) move(ddx > 0 ? 'R' : 'L'); else move(ddy > 0 ? 'D' : 'U');
});
addEventListener('keydown', e => {
  if (view !== 'play' || e.target.tagName === 'INPUT') return;
  const m = { ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R', ' ': 'W' }[e.key];
  if (m) { e.preventDefault(); sfx.wake(); if (G.over && e.key === ' ') $('overlay').click(); else move(m); }
  if (e.key === 'r') restart();
  if (e.key === 'p') $('pebble').click();
  if (e.key === 'Escape' && G.aim) { G.aim = false; renderPlay(); }
});
const lerp = (a, b, k) => a + (b - a) * k, ease = k => 1 - Math.pow(1 - k, 3);
function drawPlay(now) {
  const V = G.V, s = G.s, k = ease(G.anim), t = s.t, ctx = P.ctx, T = P.T, nextS = { ...s, t: t + 1, gs: advanceGuards(s.gs) };
  P.begin(V); P.floor(V);
  for (const [idx, n] of crowdMarks) {
    const x = idx % V.w, y = Math.floor(idx / V.w), [cx, cy] = P.c(x, y), r = T * 0.13;
    ctx.globalAlpha = Math.min(0.8, 0.22 + 0.1 * n); ctx.strokeStyle = C.laser; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r); ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const lights = [{ x: V.gem[0], y: V.gem[1], r: 1.7, a: 0.9, tint: 'rgba(94,240,214,0.10)' }];
  { const p = G.prev.pos, q = s.pos; lights.push({ x: lerp(p[0], q[0], k), y: lerp(p[1], q[1], k), r: 2, a: 0.75 }); }
  for (const g of V.guards) if (!(s.ko & (1 << g.i))) { const a = guardPos(g, G.prev), b = guardPos(g, s), fl = 0.06 * Math.sin(now / 90 + g.i); lights.push({ x: lerp(a[0], b[0], k), y: lerp(a[1], b[1], k), r: 3 + fl, a: 0.95, tint: 'rgba(255,160,70,0.13)' }); }
  for (const l of V.lasers) if (laserOn(l, t)) for (const p of l.beam) lights.push({ x: p[0], y: p[1], r: 0.9, a: 0.35, tint: 'rgba(255,60,80,0.05)' });
  for (const c of V.cams) lights.push({ x: c.at[0], y: c.at[1], r: 1.1, a: 0.4, tint: 'rgba(140,180,255,0.06)' });
  P.light(V, lights);
  P.gem(V, now);
  for (const l of V.lasers) P.laser(V, l, laserOn(l, t), laserOn(l, t + 1), now);
  for (const c of V.cams) P.cam(V, c, camDir(c, t), camDir(c, t + 1));
  for (const g of V.guards) {
    const out = s.ko & (1 << g.i), a = guardPos(g, G.prev), b = guardPos(g, s);
    if (out) { const [cx, cy] = P.c(a[0], a[1]); ctx.globalAlpha = 0.45; ctx.fillStyle = C.guard; ctx.beginPath(); ctx.ellipse(cx, cy, T * 0.3, T * 0.16, 0.5, 0, 7); ctx.fill(); ctx.globalAlpha = 1; continue; }
    const gx = lerp(a[0], b[0], k), gy = lerp(a[1], b[1], k);
    G.drawn[g.i] = [gx, gy];
    P.cone([gx, gy], b[2], rayV(V, [b[0], b[1]], b[2], g.see).length, C.guard, 0.2 * k + 0.05);
    P.guard(gx, gy, b[2]); P.torch(gx, gy, b[2], now);
    if (s.gs[g.i][1] > 0 || s.gs[g.i][3]) { const [cx, cy] = P.c(gx, gy); ctx.fillStyle = C.guard; ctx.font = `700 ${T * 0.34}px ${css('--display')}`; ctx.textAlign = 'center'; ctx.fillText('?', cx + T * 0.28, cy - T * 0.2); }
    const n = guardPos(g, nextS); if (n[0] !== b[0] || n[1] !== b[1]) { const [cx, cy] = P.c(gx, gy), [nx, ny] = P.c(n[0], n[1]); ctx.strokeStyle = C.guard; ctx.globalAlpha = 0.55; ctx.lineWidth = 2; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(lerp(cx, nx, 0.7), lerp(cy, ny, 0.7)); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; }
  }
  if (!G.over) {
    const d = danger(V, nextS);
    for (const g of V.guards) if (!(s.ko & (1 << g.i))) { const n = guardPos(g, nextS); d.set(n[0] + ',' + n[1], 'guard'); }
    ctx.strokeStyle = C.laser; ctx.lineWidth = 2; ctx.globalAlpha = 0.85;
    for (const kk of d.keys()) corners(ctx, T, ...kk.split(',').map(Number));
    ctx.globalAlpha = 1;
  }
  const p = G.prev.pos, q = s.pos, bk = Math.max(0, 1 - (now - bumpT) / 180);
  P.thief(lerp(p[0], q[0], k) + Math.sin(now / 20) * 0.04 * bk, lerp(p[1], q[1], k), s.status === 'caught');
  if (s.status === 'caught' && s.by) { const [bx, by] = P.c(...s.by); ctx.fillStyle = C.laser; ctx.font = `700 ${T * 0.45}px ${css('--display')}`; ctx.textAlign = 'center'; ctx.fillText('!', bx, by - T * 0.35); }
  // aiming: who would hear (amber), where it can land (rings)
  if (G.aim && !G.over) {
    ctx.fillStyle = C.guard; ctx.globalAlpha = 0.08;
    for (let y = 0; y < V.h; y++) for (let x = 0; x < V.w; x++) if (!V.walls.has(x + ',' + y) && V.guards.some(g => !(s.ko & (1 << g.i)) && (() => { const [gx, gy] = guardPos(g, s); return Math.abs(gx - x) + Math.abs(gy - y) <= HEARING; })())) ctx.fillRect(x * T, y * T, T, T);
    ctx.globalAlpha = 0.9 + 0.1 * Math.sin(now / 150); ctx.strokeStyle = C.gem; ctx.lineWidth = 2;
    for (const [x, y] of pebbleTargets(V, s)) { const [cx, cy] = P.c(x, y); ctx.beginPath(); ctx.arc(cx, cy, T * 0.18, 0, 7); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  // the pebble in flight, then its ripple
  if (G.pebbleFx) {
    const f = G.pebbleFx, e = (now - f.t0) / 260, [ax, ay] = P.c(...f.from), [bx, by] = P.c(...f.to);
    if (e < 1) { ctx.fillStyle = C.you; ctx.beginPath(); ctx.arc(lerp(ax, bx, e), lerp(ay, by, e) - Math.sin(e * Math.PI) * T * 0.8, T * 0.08, 0, 7); ctx.fill(); }
    else if (e < 4) { const k2 = (e - 1) / 3; ctx.strokeStyle = C.you; ctx.globalAlpha = 1 - k2; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(bx, by, T * (0.2 + k2 * HEARING), 0, 7); ctx.stroke(); ctx.globalAlpha = 1; ctx.fillStyle = C.you; ctx.beginPath(); ctx.arc(bx, by, T * 0.07, 0, 7); ctx.fill(); }
    else G.pebbleFx = null;
  }
  // what the guards say
  G.barks = G.barks.filter(b => now - b.t0 < 1900);
  for (const b of G.barks) {
    if (now < b.t0) continue;
    const at = G.drawn[b.i] || [0, 0], [cx, cy] = P.c(at[0], at[1]), a = Math.min(1, (now - b.t0) / 120, (1900 - (now - b.t0)) / 300);
    ctx.font = `600 ${Math.max(11, T * 0.24)}px ${css('--body')}`; ctx.textAlign = 'center';
    const w = ctx.measureText(b.text).width + 14, h = Math.max(20, T * 0.42), bx = Math.min(V.w * T - w / 2 - 4, Math.max(w / 2 + 4, cx)), by = cy - T * 0.62;
    ctx.globalAlpha = a; ctx.fillStyle = b.kind === 'alert' ? C.laser : C.you;
    ctx.beginPath(); ctx.roundRect(bx - w / 2, by - h / 2, w, h, 6); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - 5, by + h / 2 - 1); ctx.lineTo(cx, by + h / 2 + 6); ctx.lineTo(cx + 5, by + h / 2 - 1); ctx.fill();
    ctx.fillStyle = C.night; ctx.fillText(b.text, bx, by + h * 0.18); ctx.globalAlpha = 1;
  }
}
// Guard voices (from Hooja's guards, minus the lines about Hooja).
const BARKS = {
  suspicious: ['Hm?', "Who's there?", 'What was that?', 'Hello?'],
  return: ["Must've been rats.", 'Nothing. Again.', 'Bah. Back to it.'],
  alert: ['THIEF!', 'Guards! GUARDS!', 'Got you!', 'Stop right there!'],
  knocked: ['Oof—', 'Ngh…', 'Zzz…'],
};
function bark(i, kind, t0) {
  const list = BARKS[kind], text = list[(i * 7 + G.moves * 3 + G.L.name.length) % list.length];
  G.barks = G.barks.filter(b => b.i !== i).concat([{ i, kind, text, t0 }]);
}
// The music tightens when danger is next to you or a guard is on edge.
function tension(s) {
  const V = G.V, near = (x, y) => Math.abs(x - s.pos[0]) + Math.abs(y - s.pos[1]) <= 1;
  const d1 = danger(V, s), d2 = danger(V, { ...s, t: s.t + 1, gs: advanceGuards(s.gs) });
  for (const m of [d1, d2]) for (const k of m.keys()) { const [x, y] = k.split(',').map(Number); if (near(x, y)) return 'tense'; }
  return s.gs.some((g, i) => (g[1] > 0 || g[3]) && !(s.ko & (1 << i))) ? 'tense' : 'calm';
}
function corners(ctx, T, x, y) {
  const m = T * 0.12, l = T * 0.2, X = x * T, Y = y * T; ctx.beginPath();
  ctx.moveTo(X + m, Y + m + l); ctx.lineTo(X + m, Y + m); ctx.lineTo(X + m + l, Y + m);
  ctx.moveTo(X + T - m - l, Y + m); ctx.lineTo(X + T - m, Y + m); ctx.lineTo(X + T - m, Y + m + l);
  ctx.moveTo(X + m, Y + T - m - l); ctx.lineTo(X + m, Y + T - m); ctx.lineTo(X + m + l, Y + T - m);
  ctx.moveTo(X + T - m - l, Y + T - m); ctx.lineTo(X + T - m, Y + T - m); ctx.lineTo(X + T - m, Y + T - m - l); ctx.stroke();
}
let crowdMarks = new Map();
function statsFor(key) {
  const empty = { tries: 0, caught: 0, cracked: 0, people: 0, marks: {} };
  if (!INIT) return empty;
  if (INIT.house[key]) return INIT.house[key];
  const v = [INIT.mine, ...INIT.others].find(x => x && x.key === key);
  return v ? v.stats : empty;
}
function renderPlay() {
  $('vname').textContent = G.L.name; $('vno').textContent = G.label;
  crowdMarks = new Map();
  if (G.key === 'test') { $('crowd').innerHTML = '<b>Test run.</b> Nothing here is saved.'; }
  else {
    const st = statsFor(G.key); for (const [i, c] of Object.entries(st.marks)) crowdMarks.set(Number(i), c);
    $('crowd').innerHTML = crowdStatus !== 'live' ? crowdLine() : !st.people ? '<b>Nobody has tried it yet.</b> Your mistakes will be the first marks.' : `Caught <b>${st.caught}</b> · cracked by <b>${st.cracked}</b>. Red marks: where people got caught.`;
  }
  const pb = $('pebble'); pb.textContent = G.aim ? 'Cancel' : `Pebble ×${G.s?.peb ?? 0}`; pb.disabled = !G.s?.peb && !G.aim;
  pb.className = G.aim ? 'primary' : 'ghost';
  const rec = progress[G.key];
  $('meta').innerHTML = `moves <b>${G.moves}</b> · best possible <b>${G.best}</b>` + (G.key !== 'test' ? ` · try <b>${(rec?.tries || 0) + (G.over ? 0 : 1)}</b>` : '');
}

// ---------- home ----------
function playHouse(i) { play(LEVELS[i], 'h' + (i + 1), `Vault ${i + 1} of ${LEVELS.length}`, i < LEVELS.length - 1 ? () => playHouse(i + 1) : null); }
function renderHome() {
  const done = LEVELS.filter((_, i) => progress['h' + (i + 1)]?.won).length;
  const st = INIT?.streak;
  const streak = st?.count ? ` <b>${st.count}-night streak.</b>${st.tonight ? '' : ' Crack any vault tonight to keep it.'}` : '';
  $('job-line').innerHTML = (done === LEVELS.length ? '<b>All six cracked.</b> Now try the vaults other players built, or build your own.' : `<b>${done} of ${LEVELS.length}</b> house vaults cracked. Each one teaches a trick.`) + streak;
  $('jobs').innerHTML = LEVELS.map((L, i) => `<button type="button" class="${progress['h' + (i + 1)]?.won ? 'done' : ''}" data-i="${i}" aria-label="${L.name}"><b>${i + 1}</b>${progress['h' + (i + 1)]?.won ? 'cracked' : progress['h' + (i + 1)]?.tries ? 'tried' : 'open'}</button>`).join('');
  $('jobs').querySelectorAll('button').forEach(b => b.onclick = () => { sfx.wake(); playHouse(+b.dataset.i); });
  const mine = INIT?.mine;
  if (mine) {
    const st = mine.stats;
    $('mine').innerHTML = `<div class="title"><h3 style="font-size:1.25rem"></h3><div class="vno">best possible ${mine.best} moves</div></div>
      <div class="statrow"><div class="stat"><div class="v">${st.caught}</div><div class="l">thieves caught</div></div><div class="stat"><div class="v">${st.cracked}</div><div class="l">cracked it</div></div><div class="stat"><div class="v">${st.people ? Math.round(100 * st.cracked / st.people) + '%' : '–'}</div><div class="l">success rate</div></div></div>
      <div class="sub">${st.people ? (st.cracked ? `${st.people} ${st.people === 1 ? 'person has' : 'people have'} tried it.` : '<b>Nobody has cracked it yet.</b>') : 'Nobody has tried it yet. Check back later tonight.'}</div>
      <div class="row"><button class="ghost" id="mine-play" type="button">Play it</button></div>`;
    $('mine').querySelector('h3').textContent = mine.name;
    $('mine-play').onclick = () => play(mine.level, 'test', 'Your vault');
  } else {
    $('mine').innerHTML = `<div class="sub">Tonight’s parts: <b>${partsLine()}</b>. Build a vault that catches people. You get one a night.</div><div class="row"><button class="primary" id="go-build" type="button">Build tonight’s vault</button></div>`;
    $('go-build').onclick = () => show('build');
  }
  renderVaultOfTheNight();
  const list = (INIT?.others || []).slice().sort((a, b) => deadliness(b.stats) - deadliness(a.stats));
  $('others-line').innerHTML = crowdStatus !== 'live' ? crowdLine() : list.length ? 'Deadliest first. Each one was built by another player from tonight’s parts.' : 'Nobody else has built a vault tonight yet. Be the first, or check back later.';
  $('others').innerHTML = '';
  for (const b of list) {
    const r = progress[b.key], btn = document.createElement('button'); btn.type = 'button'; btn.className = 'vrow';
    btn.innerHTML = `<span class="n"></span><span class="s"></span><span class="tag ${r?.won ? 'ok' : r?.tries ? 'no' : ''}">${r?.won ? 'cracked' : r?.tries ? 'caught ×' + r.tries : 'new'}</span>`;
    btn.querySelector('.n').textContent = b.name;
    btn.querySelector('.s').textContent = `by u/${b.author || 'someone'} · ${stumpedLine(b.stats)}`;

    btn.onclick = () => { sfx.wake(); play(b.level, b.key, `By u/${b.author || 'someone'}`, null, b.owner); };
    if (INIT?.isMod) {
      // moderators get a Remove button next to the row, never inside it
      const wrap = document.createElement('div'); wrap.className = 'vrow-wrap';
      wrap.append(btn, removeButton(b)); $('others').appendChild(wrap);
    } else $('others').appendChild(btn);
  }
}
// The deadliest player vault tonight: most thieves caught, with every crack counting against it.
function vaultOfTheNight() {
  const all = [INIT?.mine, ...(INIT?.others || [])].filter(v => v && v.stats.people - v.stats.cracked > 0);
  all.sort((a, b) => deadliness(b.stats) - deadliness(a.stats) || b.stats.caught - a.stats.caught);
  return all[0] || null;
}
function renderVaultOfTheNight() {
  const v = vaultOfTheNight(), sec = $('votn-section');
  if (!v) { sec.hidden = true; return; }
  sec.hidden = false;
  const mine = v.owner === INIT.userId, r = progress[v.key];
  $('votn').innerHTML = `<div class="n"></div><div class="sub"></div><div class="row"></div>`;
  $('votn').querySelector('.n').textContent = v.name;
  $('votn').querySelector('.sub').innerHTML = `${mine ? 'Yours.' : `By u/${escapeHtml(v.author || 'someone')}.`} Stumped <b>${v.stats.people - v.stats.cracked}</b> of <b>${v.stats.people}</b> ${v.stats.people === 1 ? 'thief' : 'thieves'} so far.`;
  const btn = document.createElement('button'); btn.type = 'button';
  btn.className = mine ? 'ghost' : 'primary';
  btn.textContent = mine ? 'Play your vault' : r?.won ? 'You cracked it. Play again' : 'Try to crack it';
  btn.onclick = () => { sfx.wake(); mine ? play(v.level, 'test', 'Your vault') : play(v.level, v.key, `By u/${v.author || 'someone'}`, null, v.owner); };
  $('votn').querySelector('.row').appendChild(btn);
  if (INIT?.isMod && !mine) $('votn').querySelector('.row').appendChild(removeButton(v));
}
const stumpedLine = s => !s.people ? 'nobody has tried it yet' : `stumped ${s.people - s.cracked} of ${s.people}`;
// Moderators only: two taps to take a vault off tonight's list.
function removeButton(v) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'ghost mod-remove'; b.textContent = 'Remove';
  let armed = false;
  b.onclick = async e => {
    e.stopPropagation();
    if (!armed) { armed = true; b.textContent = 'Tap again to remove'; setTimeout(() => { armed = false; b.textContent = 'Remove'; }, 4000); return; }
    b.disabled = true;
    try {
      await api(Endpoint.Remove, { key: v.key });
      INIT.others = INIT.others.filter(o => o.key !== v.key);
      toast(`Removed “${v.name}”.`); renderHome();
    } catch (err) { b.disabled = false; toast(err.message); }
  };
  return b;
}
const escapeHtml = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function crowdLine() { return crowdStatus === 'off' ? 'Tonight’s board could not be loaded. Check your connection and reopen the post.' : 'Loading tonight’s board…'; }

// ---------- builder ----------
function hash(n) { n = Math.sin(n * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); }
let PARTS = partsFor(dayNo);
const PART_NAMES = { wall: ['wall', 'walls'], guard: ['guard', 'guards'], laser: ['laser', 'lasers'], cam: ['camera', 'cameras'] };
const partsLine = () => Object.entries(PARTS).filter(([, n]) => n).map(([k, n]) => `${n} ${PART_NAMES[k][n === 1 ? 0 : 1]}`).join(', ');
const NAMES = ['The Velvet Box', 'Glass Hours', 'The Night Ledger', 'Copper Lung', 'Quiet Room', 'The Long Hall', 'Moth Box', 'The Counting House', 'Low Tide', 'The Lantern'];
const B = { d: null, tool: 'wall', sel: null, routing: null, verdict: null, best: 0 };
const BP = painter($('bboard'));
function blankDraft() { return { walls: [], gem: [3, 1], guards: [], lasers: [], cams: [], name: NAMES[Math.floor(hash(dayNo + 0.5) * NAMES.length)] }; }
function loadDraft() { try { const v = JSON.parse(localStorage.getItem('vault:draft:' + dayNo) || 'null'); if (v && v.walls) return v; } catch {} return blankDraft(); }
function saveDraft() { try { localStorage.setItem('vault:draft:' + dayNo, JSON.stringify(B.d)); } catch {} }
function draftToLevel(d) {
  const rows = [];
  for (let y = 0; y < H9; y++) { let r = ''; for (let x = 0; x < W7; x++) {
    const border = x === 0 || x === W7 - 1 || y === 0 || y === H9 - 1;
    let c = border ? '#' : '.';
    if (x === START[0] && y === START[1]) c = 'S';
    if (d.walls.some(w => w[0] === x && w[1] === y)) c = '#';
    if (d.gem[0] === x && d.gem[1] === y) c = 'G';
    r += c; } rows.push(r); }
  return { name: (d.name || '').trim() || 'Untitled vault', map: rows, guards: d.guards.map(g => ({ path: g.path, see: g.see, face: g.face })), lasers: d.lasers.map(l => ({ at: l.at, dir: l.dir, on: l.on, off: l.off, phase: 0 })), cams: d.cams.map(c => ({ at: c.at, dirs: c.dirs, see: 2 })) };
}
const wallsUsed = () => B.d.walls.length + B.d.lasers.filter(l => l.wall).length;
const eq = (a, b) => a[0] === b[0] && a[1] === b[1];
const inside = (x, y) => x > 0 && y > 0 && x < W7 - 1 && y < H9 - 1;
const isBorder = (x, y) => x === 0 || y === 0 || x === W7 - 1 || y === H9 - 1;
function occupant(x, y) {
  const d = B.d, p = [x, y];
  if (eq(d.gem, p)) return { kind: 'gem' };
  let i = d.walls.findIndex(w => eq(w, p)); if (i >= 0) return { kind: 'wall', i };
  i = d.lasers.findIndex(l => eq(l.at, p)); if (i >= 0) return { kind: 'laser', i };
  i = d.cams.findIndex(c => eq(c.at, p)); if (i >= 0) return { kind: 'cam', i };
  i = d.guards.findIndex(g => g.path.some(q => eq(q, p))); if (i >= 0) return { kind: 'guard', i };
  return null;
}
function laserDirs(at) {
  const L = draftToLevel(B.d), V = parse({ ...L, lasers: [], cams: [] });
  return ['U', 'D', 'L', 'R'].filter(dir => rayV(V, at, dir, 99).length > 0);
}
function tapTile(x, y) {
  const d = B.d, p = [x, y];
  if (eq(p, START) || (y === H9 - 1 && x === START[0])) { toast('The entrance has to stay open.'); return; }
  if (B.routing != null) { routeTap(p); return; }
  const occ = occupant(x, y);
  if (B.tool === 'erase') { if (occ && occ.kind !== 'gem') { removeOcc(occ); B.sel = null; changed(); } return; }
  if (occ && occ.kind !== 'wall' || (occ && occ.kind === 'wall' && B.tool !== 'wall' && B.tool !== 'laser')) { B.sel = occ.kind === 'gem' ? null : occ; renderBuilder(); return; }
  if (B.tool === 'wall') {
    if (!inside(x, y)) return;
    if (occ?.kind === 'wall') { d.walls.splice(occ.i, 1); changed(); return; }
    if (wallsUsed() >= PARTS.wall) { toast('No walls left in tonight’s box.'); return; }
    d.walls.push(p); changed();
  } else if (B.tool === 'gem') {
    if (!inside(x, y) || occ) return; if (y > 4) { toast('Keep the gem in the top half of the vault.'); return; }
    d.gem = p; changed();
  } else if (B.tool === 'guard') {
    if (!inside(x, y) || occ) return;
    if (d.guards.length >= PARTS.guard) { toast('No guards left in tonight’s box.'); return; }
    d.guards.push({ path: [p], see: 2, face: 'D' }); B.sel = { kind: 'guard', i: d.guards.length - 1 }; B.routing = d.guards.length - 1; changed();
  } else if (B.tool === 'laser') {
    const wallHere = isBorder(x, y) || occ?.kind === 'wall';
    if (!wallHere) { toast('Lasers mount on a wall. Tap an outer wall or one you placed.'); return; }
    if (d.lasers.length >= PARTS.laser) { toast('No lasers left in tonight’s box.'); return; }
    const dirs = laserDirs(p); if (!dirs.length) { toast('A laser here would point at a wall.'); return; }
    if (occ?.kind === 'wall') d.walls.splice(occ.i, 1);
    d.lasers.push({ at: p, dir: dirs[0], on: 2, off: 2, wall: occ?.kind === 'wall' }); B.sel = { kind: 'laser', i: d.lasers.length - 1 }; changed();
  } else if (B.tool === 'cam') {
    if (!inside(x, y) || occ) return;
    if (d.cams.length >= PARTS.cam) { toast('No cameras left in tonight’s box.'); return; }
    d.cams.push({ at: p, dirs: SWEEPS[0] }); B.sel = { kind: 'cam', i: d.cams.length - 1 }; changed();
  }
}
function routeTap(p) {
  const g = B.d.guards[B.routing], last = g.path[g.path.length - 1];
  if (eq(p, last) && g.path.length > 1) { g.path.pop(); changed(); return; }
  if (eq(p, last)) { B.routing = null; renderBuilder(); return; }
  const adj = Math.abs(p[0] - last[0]) + Math.abs(p[1] - last[1]) === 1;
  if (!adj || !inside(...p) || occupant(...p) || g.path.length >= 6) { if (!adj) toast('Routes go one tile at a time. Tap a tile next to the end of the route.'); else if (g.path.length >= 6) toast('A route can be at most 6 tiles.'); return; }
  g.path.push(p); changed();
}
function removeOcc(o) {
  const d = B.d;
  if (o.kind === 'wall') d.walls.splice(o.i, 1);
  if (o.kind === 'guard') { d.guards.splice(o.i, 1); B.routing = null; }
  if (o.kind === 'laser') { const l = d.lasers.splice(o.i, 1)[0]; if (l.wall) d.walls.push(l.at); }
  if (o.kind === 'cam') d.cams.splice(o.i, 1);
}
let checkT = 0;
function changed() { saveDraft(); renderBuilder(); clearTimeout(checkT); $('verdict').className = 'verdict'; $('verdict').textContent = 'Checking…'; checkT = setTimeout(check, 120); }
function check() {
  const L = draftToLevel(B.d);
  // lasers that sit on placed walls need that wall in the map
  for (const l of B.d.lasers) if (l.wall) { const r = [...L.map[l.at[1]]]; r[l.at[0]] = '#'; L.map[l.at[1]] = r.join(''); }
  const V = parse(L), sol = solve(V), straight = Math.abs(START[0] - B.d.gem[0]) + Math.abs(START[1] - B.d.gem[1]);
  B.level = L; B.best = sol ? sol.length : 0; B.verdict = sol ? 'ok' : 'bad';
  const v = $('verdict');
  if (!sol) { v.className = 'verdict bad'; v.textContent = 'Impossible right now. There is no way to reach the gem without being seen. Open a path or slow something down.'; }
  else {
    v.className = 'verdict ok';
    const hard = B.best - straight;
    v.textContent = `Crackable. The best possible run is ${B.best} moves` + (hard <= 0 ? ', a straight walk. Add something to get in the way.' : hard < 4 ? '. Fairly easy.' : hard < 8 ? '. A real puzzle.' : '. Nasty. People will need several tries.');
  }
  $('b-lock').disabled = B.verdict !== 'ok' || !!myBuilt();
  $('b-test').disabled = B.verdict !== 'ok';
}
function openBuilder() {
  if (!B.d) B.d = loadDraft();
  const tip = $('b-tip');
  if (!tipsSeen.builder) {
    tip.innerHTML = 'Not sure where to start? Tap <strong>Surprise me</strong> for a layout from tonight’s parts, then make it meaner. Thieves carry one <strong>pebble</strong>, and the checker counts it, so a guard alone in a corridor won’t stop anyone.';
    tip.hidden = false; tipsSeen.builder = 1; try { localStorage.setItem('vault:tips', JSON.stringify(tipsSeen)); } catch {}
  } else tip.hidden = true;
  $('vaultName').value = B.d.name || '';
  BP.size({ w: W7, h: H9 }); renderBuilder(); check();
}
function renderBuilder() {
  const d = B.d, used = { wall: wallsUsed(), guard: d.guards.length, laser: d.lasers.length, cam: d.cams.length };
  $('b-night').textContent = 'Night ' + (dayNo + 1);
  const tools = [['wall', 'Wall', 'var(--wall)'], ['guard', 'Guard', 'var(--guard)'], ['laser', 'Laser', 'var(--laser)'], ['cam', 'Camera', 'var(--cam)'], ['gem', 'Move gem', 'var(--gem)'], ['erase', 'Erase', 'var(--muted)']];
  $('parts').innerHTML = tools.filter(([k]) => !(k in PARTS) || PARTS[k] > 0).map(([k, l, c]) => `<button type="button" data-k="${k}" class="${B.tool === k ? 'on' : ''}"><span><i style="--c:${c}"></i>${l}</span><span class="c">${k in PARTS ? `${PARTS[k] - used[k]} left` : '&nbsp;'}</span></button>`).join('');
  $('parts').querySelectorAll('button').forEach(b => b.onclick = () => { B.tool = b.dataset.k; B.routing = null; B.sel = null; renderBuilder(); });
  // inspector
  const I = $('inspect'); I.innerHTML = '';
  const chip = (label, on, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip' + (on ? ' on' : ''); b.textContent = label; b.onclick = fn; I.appendChild(b); };
  const say = t => { const s = document.createElement('span'); s.textContent = t; I.appendChild(s); };
  const s = B.sel;
  if (B.routing != null) {
    say('Tap tiles next to the guard to draw its route. Tap the end again to undo.');
    chip('Done', true, () => { B.routing = null; renderBuilder(); });
  } else if (s?.kind === 'guard' && d.guards[s.i]) {
    const g = d.guards[s.i];
    say('Guard:'); chip('Sees 2', g.see === 2, () => { g.see = 2; changed(); }); chip('Sees 3', g.see === 3, () => { g.see = 3; changed(); });
    if (g.path.length === 1) for (const f of ['U', 'R', 'D', 'L']) chip({ U: '↑', R: '→', D: '↓', L: '←' }[f], g.face === f, () => { g.face = f; changed(); });
    chip('Edit route', false, () => { B.routing = s.i; renderBuilder(); });
    chip('Remove', false, () => { removeOcc(s); B.sel = null; changed(); });
  } else if (s?.kind === 'laser' && d.lasers[s.i]) {
    const l = d.lasers[s.i];
    say('Laser:'); for (const dir of laserDirs(l.at)) chip({ U: '↑', R: '→', D: '↓', L: '←' }[dir], l.dir === dir, () => { l.dir = dir; changed(); });
    for (const [on, off] of RHYTHMS) chip(`${on} on ${off} off`, l.on === on && l.off === off, () => { l.on = on; l.off = off; changed(); });
    chip('Remove', false, () => { removeOcc(s); B.sel = null; changed(); });
  } else if (s?.kind === 'cam' && d.cams[s.i]) {
    const c = d.cams[s.i];
    say('Camera:'); SWEEPS.forEach((sw, i) => chip(['↕ up/down', '↔ left/right', '↻ clockwise', '↺ anticlockwise'][i], c.dirs.join() === sw.join(), () => { c.dirs = sw; changed(); }));
    chip('Remove', false, () => { removeOcc(s); B.sel = null; changed(); });
  } else {
    say({ wall: 'Tap floor to place a wall, tap a wall to remove it.', guard: 'Tap floor to place a guard, then draw its route.', laser: 'Tap a wall to mount a laser on it.', cam: 'Tap floor to place a camera.', gem: 'Tap a floor tile in the top half to move the gem.', erase: 'Tap any part to remove it.' }[B.tool]);
  }
}
function drawBuilder(now) {
  if (!B.d) return;
  const L = B.level || draftToLevel(B.d); let V; try { V = parseL(L); } catch { return; }
  const ctx = BP.ctx, T = BP.T;
  BP.begin(V); BP.floor(V);
  // entrance marker
  { const [cx, cy] = BP.c(...START); ctx.fillStyle = C.you; ctx.globalAlpha = 0.5; ctx.font = `600 ${T * 0.22}px ${css('--mono')}`; ctx.textAlign = 'center'; ctx.fillText('IN', cx, cy + T * 0.08); ctx.globalAlpha = 1; }
  BP.gem(V, now);
  const t = Math.floor(now / 700);
  V.lasers.forEach((l, i) => BP.laser(V, l, laserOn(l, t), laserOn(l, t + 1), now));
  V.cams.forEach(c => BP.cam(V, c, camDir(c, t), null));
  V.guards.forEach((g, i) => {
    const path = B.d.guards[i]?.path || [];
    ctx.strokeStyle = C.guard; ctx.globalAlpha = 0.7; ctx.lineWidth = 3; ctx.setLineDash([2, 5]); ctx.lineCap = 'round';
    ctx.beginPath(); path.forEach((p, k) => { const [cx, cy] = BP.c(...p); k ? ctx.lineTo(cx, cy) : ctx.moveTo(cx, cy); }); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    for (const p of path.slice(1)) { const [cx, cy] = BP.c(...p); ctx.fillStyle = C.guard; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(cx, cy, T * 0.07, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
    const [x, y, f] = g.seq[t % g.seq.length];
    BP.cone([x, y], f, rayV(V, [x, y], f, g.see).length, C.guard, 0.15); BP.guard(x, y, f);
  });
  // selection ring
  const s = B.routing != null ? { kind: 'guard', i: B.routing } : B.sel;
  if (s) {
    const tiles = s.kind === 'guard' ? (B.d.guards[s.i]?.path || []).slice(-1) : s.kind === 'laser' ? [B.d.lasers[s.i]?.at] : s.kind === 'cam' ? [B.d.cams[s.i]?.at] : [];
    ctx.strokeStyle = C.text; ctx.lineWidth = 2; for (const p of tiles) if (p) corners(ctx, T, p[0], p[1]);
  }
}
$('bboard').addEventListener('pointerup', e => {
  const r = $('bboard').getBoundingClientRect(), x = Math.floor((e.clientX - r.left) / BP.T), y = Math.floor((e.clientY - r.top) / BP.T);
  if (x >= 0 && y >= 0 && x < W7 && y < H9) tapTile(x, y);
});
$('vaultName').addEventListener('input', e => { B.d.name = e.target.value.slice(0, 24); saveDraft(); });
// A random vault from tonight's parts: try a few, keep the trickiest one that can still be cracked.
function surprise() {
  const rnd = n => Math.floor(Math.random() * n);
  const free = (d, x, y) => inside(x, y) && !(x === START[0] && y >= H9 - 2) && !(d.gem[0] === x && d.gem[1] === y) && !d.walls.some(w => w[0] === x && w[1] === y) && !d.guards.some(g => g.path.some(p => p[0] === x && p[1] === y)) && !d.cams.some(c => c.at[0] === x && c.at[1] === y);
  let best = null, bestScore = -1;
  for (let attempt = 0; attempt < 30; attempt++) {
    const d = blankDraft(); d.name = B.d.name;
    d.gem = [1 + rnd(5), 1 + rnd(3)];
    for (let i = 0; i < PARTS.wall; i++) { const x = 1 + rnd(5), y = 2 + rnd(5); if (free(d, x, y)) d.walls.push([x, y]); }
    for (let i = 0; i < PARTS.guard; i++) {
      const horiz = Math.random() < 0.6, len = 2 + rnd(4);
      let x = 1 + rnd(5), y = 1 + rnd(6); const path = [];
      for (let k = 0; k < len && free(d, x, y); k++) { path.push([x, y]); horiz ? x++ : y++; }
      if (path.length) d.guards.push({ path, see: Math.random() < 0.3 ? 3 : 2, face: ['U', 'R', 'D', 'L'][rnd(4)] });
    }
    for (let i = 0; i < PARTS.cam; i++) { const x = 1 + rnd(5), y = 1 + rnd(6); if (free(d, x, y)) d.cams.push({ at: [x, y], dirs: SWEEPS[rnd(SWEEPS.length)] }); }
    for (let i = 0; i < PARTS.laser; i++) {
      const left = Math.random() < 0.5, y = 1 + rnd(7), at = [left ? 0 : W7 - 1, y];
      if (d.lasers.some(l => l.at[1] === y)) continue;
      const [on, off] = RHYTHMS[rnd(RHYTHMS.length)];
      d.lasers.push({ at, dir: left ? 'R' : 'L', on, off, wall: false });
    }
    const L = draftToLevel(d), sol = solve(parse(L));
    if (!sol) continue;
    const straight = Math.abs(START[0] - d.gem[0]) + Math.abs(START[1] - d.gem[1]);
    const score = Math.min(sol.length - straight, 10) + d.guards.length + d.cams.length + d.lasers.length;
    if (score > bestScore) { best = d; bestScore = score; }
  }
  if (!best) { toast('Couldn’t find a good layout this time. Try again.'); return; }
  B.d = best; B.sel = null; B.routing = null; changed();
  toast('Here’s a start. Tweak it until it’s nasty.');
}
$('b-surprise').onclick = () => surprise();
$('b-clear').onclick = () => { const n = B.d.name; B.d = blankDraft(); B.d.name = n; B.sel = null; B.routing = null; changed(); };
$('b-test').onclick = () => { if (B.verdict === 'ok') { sfx.wake(); play({ ...B.level, name: B.level.name }, 'test', 'Test run'); } };
$('b-lock').onclick = async () => {
  if (B.verdict !== 'ok' || myBuilt()) return;
  const level = { ...B.level, name: (B.d.name || '').trim() || B.level.name };
  $('b-lock').disabled = true;
  try {
    const rsp = await api(Endpoint.Publish, { level });
    INIT.mine = rsp.vault; toast('Locked in. Your vault is live tonight.'); show('home');
  } catch (e) { toast(e.message); $('b-lock').disabled = false; }
};
function myBuilt() { return INIT?.mine || null; }

// ---------- server ----------
let INIT = null, crowdStatus = 'loading', progress = {};
async function api(ep, body) {
  const rsp = await fetch(ep, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { headers: { Accept: 'application/json' } });
  const json = await rsp.json().catch(() => ({}));
  if (!rsp.ok) throw new Error(json.error || 'The server did not answer. Try again in a moment.');
  return json;
}
async function load() {
  try {
    INIT = await api(Endpoint.Init); progress = INIT.progress || {}; crowdStatus = 'live';
    dayNo = INIT.night; PARTS = INIT.parts; $('night').textContent = 'Night ' + (dayNo + 1);
  } catch { crowdStatus = 'off'; }
  // someone who has never played starts in the first vault, not on a menu
  if (view === 'home' && INIT && !Object.keys(progress).length) { playHouse(0); return; }
  refresh();
}
async function submitAttempt(key, moves) {
  try {
    const rsp = await api(Endpoint.Attempt, { key, moves });
    progress[key] = rsp.progress;
    const was = INIT?.streak;
    if (INIT) INIT.streak = rsp.streak;
    if (rsp.rank && G.over === 'won' && !$('overlay').hidden) {
      const { others, slower } = rsp.rank, el = document.createElement('div'); el.className = 'small rank';
      const them = `${others} other ${others === 1 ? 'thief' : 'thieves'}`;
      el.textContent = others === 0 ? 'First to crack it!'
        : slower > 0 ? `Fewer moves than ${Math.round(100 * slower / others)}% of the ${them} who cracked it.`
        : rsp.moves <= G.best ? `Tied for the fewest moves with ${them}.`
        : `${others === 1 ? 'The other thief' : `All ${them}`} who cracked it used fewer or as many moves. A perfect run takes ${G.best}.`;
      $('overlay').insertBefore(el, $('share-btn'));
    }
    if (rsp.result === 'won' && rsp.streak.tonight && !was?.tonight && G.over === 'won' && !$('overlay').hidden) {
      const el = document.createElement('div'); el.className = 'small streak';
      el.textContent = rsp.streak.count === 1 ? 'Night streak started. Crack a vault tomorrow to keep it going.' : `${rsp.streak.count}-night streak!`;
      $('overlay').insertBefore(el, $('share-btn'));
    }
    if (INIT) {
      if (INIT.house[key]) INIT.house[key] = rsp.stats;
      for (const v of [INIT.mine, ...INIT.others]) if (v && v.key === key) v.stats = rsp.stats;
    }
    if (view === 'play' && G.key === key) renderPlay();
  } catch (e) { toast(e.message); }
}
function refresh() { if (view === 'home') renderHome(); else if (view === 'play') renderPlay(); else if (view === 'build') check(); }
async function copyResult(cls) {
  const text = `VAULT Night ${dayNo + 1} · ${G.L.name} · ${cls === 'won' ? `cracked in ${G.moves} (best ${G.best})` : `caught on move ${G.moves}`}`;
  try { await navigator.clipboard.writeText(text); toast('Copied. Paste it in the comments.'); } catch { toast(text); }
}
function toast(t) { showToast(t); }

// ---------- your run as a GIF comment ----------
// While something moves on the board, keep small copies of it (thinking time is skipped).
const CAP_W = 180;
function capture(now) {
  const moving = G.anim < 1 || G.pebbleFx || G.barks.some(b => now >= b.t0) || (G.endAt && now - G.endAt < 1100);
  const first = !G.frames.length;
  if (!first && (!moving || now - G.lastCap < 90)) return;
  if (G.endAt && now - G.endAt > 1100) return;
  const cv = $('board'), h = Math.round(CAP_W * cv.height / cv.width);
  const c = capture.c || (capture.c = document.createElement('canvas')); c.width = CAP_W; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(cv, 0, 0, CAP_W, h);
  G.frames.push({ rgba: x.getImageData(0, 0, CAP_W, h).data, delay: first ? 700 : 90, h });
  if (G.frames.length > 160) G.frames.splice(1, 1);
  G.lastCap = now;
}
function gifDataUrl() {
  let fr = G.frames;
  const w = CAP_W, h = fr[0].h, bar = 26, H = h + bar, res = G.result || { status: 'play', moves: G.moves };
  const text = `VAULT · ${G.L.name} · ${res.status === 'won' ? `cracked in ${res.moves}` : `caught on move ${res.moves}`}`;
  const c = document.createElement('canvas'); c.width = w; c.height = H; const x = c.getContext('2d', { willReadFrequently: true });
  for (let tries = 0; tries < 4; tries++) {
    const frames = fr.map((f, i) => {
      x.fillStyle = C.night; x.fillRect(0, 0, w, H);
      x.putImageData(new ImageData(new Uint8ClampedArray(f.rgba), w, h), 0, 0);
      x.fillStyle = res.status === 'caught' ? C.laser : C.gem; x.fillRect(0, h, w, 2);
      x.fillStyle = C.text; x.font = `600 11px ${css('--body')}`; x.textAlign = 'center'; x.fillText(text, w / 2, h + 17, w - 10);
      return { rgba: x.getImageData(0, 0, w, H).data, delay: i === fr.length - 1 ? 1600 : f.delay };
    });
    const bytes = GIF.encode(frames, w, H);
    let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    const url = 'data:image/gif;base64,' + btoa(bin);
    if (url.length < 1_800_000) return url;
    fr = fr.filter((_, i) => i % 2 === 0 || i === fr.length - 1); // too big: keep every other frame
  }
  return null;
}
const shared = new Set();
async function shareRun(btn) {
  btn.disabled = true; btn.textContent = 'Posting…';
  try {
    let gif = null; try { gif = gifDataUrl(); } catch {}
    const rsp = await api(Endpoint.Share, { key: G.key, moves: G.log.slice(), gif });
    shared.add(G.key);
    btn.textContent = 'Posted to the comments';
    toast(rsp.posted === 'gif' ? 'Your run is in the comments.' : 'Your run is in the comments (text only this time).');
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Try posting again';
    toast(e.message);
  }
}

// ---------- first-run coach ----------
// One short tip on the board, at the moment it matters, each shown once.
const TIPS = {
  move: 'Swipe, or tap a tile next to you, to move. Everything else moves after you.',
  corners: 'Red corners are watched after your next move. Tap yourself to wait a turn.',
  arrow: 'The dashed line shows where a guard steps next. Time your move around it.',
  behind: 'That guard isn’t facing you. Walk into him from behind or the side to knock him out.',
  pebble: 'This guard faces you. Tap Pebble and throw it past him: he’ll turn to look.',
  aim: 'Tap a ringed tile. Guards within 3 tiles turn to the noise for two turns.',
  laser: 'A flickering dashed beam fires next turn. Step through when it’s dark.',
  camera: 'The camera turns every move. Slip past when it looks away.',
};
let tipsSeen = {}; try { tipsSeen = JSON.parse(localStorage.getItem('vault:tips') || '{}') || {}; } catch {}
const coachState = { tip: null, at: 0, moves: 0 };
function showTip(k) {
  if (tipsSeen[k] || coachState.tip === k) return false;
  tipsSeen[k] = 1; try { localStorage.setItem('vault:tips', JSON.stringify(tipsSeen)); } catch {}
  coachState.tip = k; coachState.at = performance.now(); coachState.moves = G.moves;
  const el = $('coach'); el.textContent = TIPS[k]; el.hidden = false;
  return true;
}
function coach() {
  const el = $('coach');
  // the opening tip makes way as soon as you move, so a warning can take its place
  if (coachState.tip === 'move' && G.moves >= 1) { el.hidden = true; coachState.tip = null; }
  if (coachState.tip && (G.over || G.moves - coachState.moves >= 2) && performance.now() - coachState.at > 2500) { el.hidden = true; coachState.tip = null; }
  if (view !== 'play' || G.over || G.key === 'test' || coachState.tip) return;
  const V = G.V, s = G.s, nextS = { ...s, t: s.t + 1, gs: advanceGuards(s.gs) };
  if (G.aim && showTip('aim')) return;
  if (G.moves === 0 && showTip('move')) return;
  if (G.key === 'h3' && G.moves >= 2 && s.peb && showTip('pebble')) return;
  const near = (x, y) => Math.abs(x - s.pos[0]) + Math.abs(y - s.pos[1]) === 1;
  const d = danger(V, nextS);
  for (const k of d.keys()) { const [x, y] = k.split(',').map(Number); if (near(x, y) && showTip('corners')) return; }
  for (const g of V.guards) {
    if (s.ko & (1 << g.i)) continue;
    const [gx, gy, f] = guardPos(g, s), [fx, fy] = DIRS[f];
    if (near(gx, gy) && !(gx + fx === s.pos[0] && gy + fy === s.pos[1]) && showTip('behind')) return;
  }
  if ((progress[G.key]?.tries || 0) >= 1 && V.guards.length && showTip('arrow')) return;
  if (V.lasers.some(l => !laserOn(l, s.t) && laserOn(l, s.t + 1)) && showTip('laser')) return;
  if (V.cams.length && showTip('camera')) return;
}

// ---------- sound ----------
let soundOn = true; try { soundOn = localStorage.getItem('vault:sound') !== 'off'; } catch {}
const sfx = {
  ac: null, out: null,
  wake() {
    if (!this.ac) {
      try {
        this.ac = new (window.AudioContext || window.webkitAudioContext)();
        this.out = this.ac.createGain(); this.out.gain.value = soundOn ? 1 : 0; this.out.connect(this.ac.destination);
        const n = this.ac.createBuffer(1, this.ac.sampleRate, this.ac.sampleRate), d = n.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        music.attach(new MusicPlayer(this.ac, this.out, n));
      } catch {}
    }
    this.ac?.resume?.();
  },
  tone(f, d, type = 'sine', v = 0.12, f2) {
    const a = this.ac; if (!a) return; const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + d + 0.02);
  },
  step() { this.tone(180, 0.06, 'triangle', 0.08, 120); },
  knock() { this.tone(140, 0.18, 'square', 0.1, 60); },
  alarm() { this.tone(880, 0.16, 'sawtooth', 0.08); setTimeout(() => this.tone(660, 0.22, 'sawtooth', 0.08), 170); },
  win() { [660, 880, 1320].forEach((f, i) => setTimeout(() => this.tone(f, 0.25, 'sine', 0.1), i * 90)); },
  pebble() { this.tone(1400, 0.05, 'triangle', 0.06, 900); setTimeout(() => this.tone(700, 0.08, 'triangle', 0.09, 500), 260); setTimeout(() => this.tone(620, 0.06, 'triangle', 0.05, 480), 360); },
};
// Music waits for the first tap (browsers block sound before that), then follows the screen.
const music = {
  p: null, want: null, mood: 'calm',
  attach(p) { this.p = p; if (this.want) { p.play(this.want); p.setMood(this.mood); } },
  play(track) { this.want = track; try { this.p?.play(track); } catch {} },
  setMood(m) { this.mood = m; try { this.p?.setMood(m); } catch {} },
  sting(k) { try { this.p?.sting(k); } catch {} },
};
function renderSound() { $('snd').textContent = soundOn ? 'Sound on' : 'Sound off'; }
$('snd').onclick = () => { soundOn = !soundOn; try { localStorage.setItem('vault:sound', soundOn ? 'on' : 'off'); } catch {} sfx.wake(); if (sfx.out) sfx.out.gain.setTargetAtTime(soundOn ? 1 : 0, sfx.ac.currentTime, 0.05); renderSound(); };
addEventListener('pointerdown', () => sfx.wake(), { once: true });
renderSound();

// ---------- loop ----------
function frame(now) {
  if (view === 'play' && G.V) { if (G.anim < 1) G.anim = Math.min(1, (now - G.a0) / 150); drawPlay(now); capture(now); coach(); }
  if (view === 'build') drawBuilder(now);
  requestAnimationFrame(frame);
}
addEventListener('resize', () => { if (view === 'play') P.size(G.V); if (view === 'build') BP.size({ w: W7, h: H9 }); });
$('night').textContent = 'Night ' + (dayNo + 1);
show('home'); requestAnimationFrame(frame); void load();
