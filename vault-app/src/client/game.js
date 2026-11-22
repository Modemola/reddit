// VAULT client: the home screen, the vaults and the builder. Ported from the prototype in prototype/vault/.
// Rules come from the shared engine; results are decided by the server replaying each run.
import { showToast } from '@devvit/web/client';
import { Endpoint } from '../shared/api.ts';
import { advanceGuards, camDir, DIRS, danger, guardPos, HEARING, laserOn, parse, pebbleTargets, ray, solve, startState, step } from '../shared/engine.ts';
import { deadliness, themeFor, HOUSE, H, nightOf, partsFor, RHYTHMS, START, SWEEPS, W } from '../shared/vault.ts';
import { GIF } from './gif.js';
import { MusicPlayer } from './music.js';
const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const C = Object.fromEntries(['night', 'floor', 'floor2', 'grain', 'mortar', 'wall', 'wallside', 'text', 'muted', 'you', 'gem', 'guard', 'laser', 'cam'].map(k => [k, css('--' + k)]));
let dayNo = nightOf(Date.now());
const W7 = W, H9 = H;
const LEVELS = HOUSE;

// ---------- shared drawing ----------
const FONT = { display: css('--display'), body: css('--body'), mono: css('--mono') };
const ANG = { R: 0, D: Math.PI / 2, L: Math.PI, U: -Math.PI / 2 };
function painter(cv) {
  const ctx = cv.getContext('2d'); let DPR = 1, T = 0, layer = null, layerSig = '', lightCv = null, tintCv = null;
  const rnd = (x, y, i) => { const n = Math.sin(x * 127.1 + y * 311.7 + i * 74.7) * 43758.5453; return n - Math.floor(n); };
  function boards(L, x, y) {
    // three oak planks per tile, joints staggered, a little grain and a soft sheen
    const X = x * T, Y = y * T, h = T / 3;
    for (let i = 0; i < 3; i++) {
      L.fillStyle = rnd(x, y, i) > 0.5 ? C.floor : C.floor2; L.fillRect(X, Y + i * h, T, h);
      const sheen = L.createLinearGradient(X, Y + i * h, X, Y + (i + 1) * h); sheen.addColorStop(0, 'rgba(255,230,190,0.07)'); sheen.addColorStop(1, 'rgba(0,0,0,0.06)');
      L.fillStyle = sheen; L.fillRect(X, Y + i * h, T, h);
      L.strokeStyle = C.grain; L.globalAlpha = 0.45; L.lineWidth = 1;
      for (let g = 0; g < 2; g++) { const gy = Y + i * h + h * (0.3 + 0.4 * rnd(x, y, i * 3 + g)); L.beginPath(); L.moveTo(X + T * rnd(x, y, 9 + g), gy); L.quadraticCurveTo(X + T * (rnd(x, y, 9 + g) + 0.2), gy + 1.2, X + T * Math.min(1, rnd(x, y, 9 + g) + 0.45), gy + 0.4); L.stroke(); }
      L.globalAlpha = 1; L.fillStyle = C.grain; L.fillRect(X, Y + (i + 1) * h - 1, T, 1);
      const j = X + T * (((x * 3 + y * 7 + i * 5) % 4) / 4 + 0.12); L.fillRect(j, Y + i * h, 1, h);
    }
  }
  function brick(L, x, y) {
    // a wall seen from above: a brick top, a dark front face below it, a lit top edge
    const X = x * T, Y = y * T, top = T * 0.78;
    L.fillStyle = C.wallside; L.fillRect(X, Y, T, T);
    L.fillStyle = C.mortar; L.fillRect(X, Y, T, top);
    const rows = 3, bh = top / rows;
    for (let r = 0; r < rows; r++) {
      const off = (r + y) % 2 ? T / 4 : 0;
      for (let b = -1; b < 3; b++) {
        const bx = X + off + b * T / 2 + 1, w = T / 2 - 2, x0 = Math.max(X + 1, bx), x1 = Math.min(X + T - 1, bx + w);
        if (x1 <= x0) continue;
        L.fillStyle = C.wall; L.globalAlpha = 0.8 + 0.2 * rnd(x * 4 + b, y * 3 + r, 1); L.fillRect(x0, Y + r * bh + 1, x1 - x0, bh - 2);
        L.globalAlpha = 0.12; L.fillStyle = '#ffd9c0'; L.fillRect(x0, Y + r * bh + 1, x1 - x0, 1); L.globalAlpha = 1;
      }
    }
    const face = L.createLinearGradient(X, Y + top, X, Y + T); face.addColorStop(0, '#2a1d18'); face.addColorStop(1, C.wallside);
    L.fillStyle = face; L.fillRect(X, Y + top, T, T - top);
    L.fillStyle = 'rgba(255,220,200,0.10)'; L.fillRect(X, Y, T, 1.5);
  }
  function isSolid(V, x, y) {
    if (x < 0 || y < 0 || x >= V.w || y >= V.h) return true;
    const k = x + ',' + y, cam = V.cams.some(c => c.at[0] === x && c.at[1] === y), las = V.lasers.some(l => l.at[0] === x && l.at[1] === y);
    return (V.walls.has(k) && !cam && !las) || (las && (x === 0 || y === 0 || x === V.w - 1 || y === V.h - 1 || isWallTile(V, x, y)));
  }
  function shade(L, V) {
    // walls cast soft shadows onto the floor below and beside them
    for (let y = 0; y < V.h; y++) for (let x = 0; x < V.w; x++) {
      if (isSolid(V, x, y)) continue;
      const X = x * T, Y = y * T;
      if (isSolid(V, x, y - 1)) { const g = L.createLinearGradient(X, Y, X, Y + T * 0.45); g.addColorStop(0, 'rgba(10,5,2,0.5)'); g.addColorStop(1, 'rgba(10,5,2,0)'); L.fillStyle = g; L.fillRect(X, Y, T, T * 0.45); }
      if (isSolid(V, x - 1, y)) { const g = L.createLinearGradient(X, Y, X + T * 0.22, Y); g.addColorStop(0, 'rgba(10,5,2,0.32)'); g.addColorStop(1, 'rgba(10,5,2,0)'); L.fillStyle = g; L.fillRect(X, Y, T * 0.22, T); }
      if (isSolid(V, x + 1, y)) { const g = L.createLinearGradient(X + T, Y, X + T * 0.78, Y); g.addColorStop(0, 'rgba(10,5,2,0.32)'); g.addColorStop(1, 'rgba(10,5,2,0)'); L.fillStyle = g; L.fillRect(X + T * 0.78, Y, T * 0.22, T); }
    }
    // and the room falls off into darkness at its edges
    const W = V.w * T, Hh = V.h * T, v = L.createRadialGradient(W / 2, Hh / 2, Math.min(W, Hh) * 0.35, W / 2, Hh / 2, Math.hypot(W, Hh) * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.38)'); L.fillStyle = v; L.fillRect(0, 0, W, Hh);
  }
  const api = {
    ctx, get T() { return T; },
    size(V) { DPR = Math.min(devicePixelRatio || 1, 2); const w = cv.clientWidth || 400; T = w / V.w; cv.style.height = (T * V.h) + 'px'; cv.width = Math.round(w * DPR); cv.height = Math.round(T * V.h * DPR); },
    // ox, oy shake the view; sc zooms it around (zx, zy) for a crack's punch
    begin(V, ox = 0, oy = 0, sc = 1, zx = 0, zy = 0) {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.fillStyle = C.night; ctx.fillRect(0, 0, V.w * T, V.h * T);
      if (ox || oy || sc !== 1) { ctx.translate(ox + zx, oy + zy); ctx.scale(sc, sc); ctx.translate(-zx, -zy); }
    },
    c(x, y) { return [(x + 0.5) * T, (y + 0.5) * T]; },
    floor(V, lit = true) {
      // The floor and walls never change during a vault, so they are drawn once and reused.
      const sig = V.w + 'x' + V.h + ':' + T + ':' + lit + ':' + [...V.walls].join(';');
      if (!layer || layerSig !== sig) {
        layer = document.createElement('canvas'); layer.width = cv.width; layer.height = cv.height; layerSig = sig;
        const L = layer.getContext('2d'); L.setTransform(DPR, 0, 0, DPR, 0, 0);
        for (let y = 0; y < V.h; y++) for (let x = 0; x < V.w; x++) isSolid(V, x, y) ? brick(L, x, y) : boards(L, x, y);
        if (lit) shade(L, V);
      }
      ctx.drawImage(layer, 0, 0, V.w * T, V.h * T);
    },
    // Night over everything, with pools of light cut out where the light is.
    // Light is soft, so this layer is drawn at a quarter of the resolution and scaled up: same look, far less work.
    light(V, sources) {
      const LS = 0.25, lw = Math.max(1, Math.round(V.w * T * LS)), lh = Math.max(1, Math.round(V.h * T * LS));
      if (!lightCv || lightCv.width !== lw || lightCv.height !== lh) { lightCv = document.createElement('canvas'); lightCv.width = lw; lightCv.height = lh; }
      const L = lightCv.getContext('2d'); L.setTransform(LS, 0, 0, LS, 0, 0); L.globalCompositeOperation = 'source-over';
      L.clearRect(0, 0, V.w * T, V.h * T); L.fillStyle = 'rgba(7, 10, 26, 0.5)'; L.fillRect(0, 0, V.w * T, V.h * T);
      L.globalCompositeOperation = 'destination-out';
      for (const s of sources) { const [cx, cy] = api.c(s.x, s.y), R = s.r * T, g = L.createRadialGradient(cx, cy, 0, cx, cy, R); g.addColorStop(0, 'rgba(0,0,0,' + s.a + ')'); g.addColorStop(1, 'rgba(0,0,0,0)'); L.fillStyle = g; L.fillRect(cx - R, cy - R, 2 * R, 2 * R); }
      ctx.imageSmoothingEnabled = true; ctx.drawImage(lightCv, 0, 0, V.w * T, V.h * T);
      // coloured glow (torch amber, gem teal, laser red) also lives at low resolution: one additive copy per frame
      if (!tintCv || tintCv.width !== lw || tintCv.height !== lh) { tintCv = document.createElement('canvas'); tintCv.width = lw; tintCv.height = lh; }
      const TC = tintCv.getContext('2d'); TC.setTransform(LS, 0, 0, LS, 0, 0); TC.globalCompositeOperation = 'source-over'; TC.clearRect(0, 0, V.w * T, V.h * T); TC.globalCompositeOperation = 'lighter';
      for (const s of sources) if (s.tint) { const [cx, cy] = api.c(s.x, s.y), R = s.r * T * 0.9, g = TC.createRadialGradient(cx, cy, 0, cx, cy, R); g.addColorStop(0, s.tint); g.addColorStop(1, 'rgba(0,0,0,0)'); TC.fillStyle = g; TC.fillRect(cx - R, cy - R, 2 * R, 2 * R); }
      ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(tintCv, 0, 0, V.w * T, V.h * T); ctx.globalCompositeOperation = 'source-over';
    },
    torch(gx, gy, ang, now, seed = 0) {
      // a small flame carried at the guard's side, flickering
      const [cx, cy] = [(gx + 0.5) * T, (gy + 0.5) * T], fx = Math.cos(ang), fy = Math.sin(ang);
      const sx = cx - fy * T * 0.3 + fx * T * 0.08, sy = cy + fx * T * 0.3 + fy * T * 0.08;
      const fl = 1 + 0.16 * Math.sin(now / 70 + seed * 3) + 0.1 * Math.sin(now / 37 + seed);
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, T * 0.32 * fl); g.addColorStop(0, 'rgba(255,200,110,0.55)'); g.addColorStop(1, 'rgba(255,160,60,0)');
      ctx.fillStyle = g; ctx.fillRect(sx - T * 0.4, sy - T * 0.4, T * 0.8, T * 0.8);
      ctx.fillStyle = '#ff9d3c'; ctx.beginPath(); ctx.ellipse(sx, sy - T * 0.02, T * 0.075 * fl, T * 0.105 * fl, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.ellipse(sx, sy, T * 0.04 * fl, T * 0.06 * fl, 0, 0, 7); ctx.fill();
    },
    gem(V, now, glow = 1) {
      // a cut gem that floats, breathes light and catches a glint now and then
      const [cx, cy0] = api.c(...V.gem), cy = cy0 + Math.sin(now / 520) * T * 0.035, r = T * 0.23;
      const pulse = 0.75 + 0.25 * Math.sin(now / 380);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, T * 0.85); g.addColorStop(0, `rgba(94,240,214,${0.38 * pulse * glow})`); g.addColorStop(1, 'rgba(94,240,214,0)');
      ctx.fillStyle = g; ctx.fillRect(cx - T, cy - T, 2 * T, 2 * T);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(cx, cy0 + T * 0.3, T * 0.17, T * 0.05, 0, 0, 7); ctx.fill();
      const top = cy - r * 0.62, girdle = cy - r * 0.12, tip = cy + r;
      const facet = (pts, fill) => { ctx.fillStyle = fill; ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill(); };
      facet([[cx - r, girdle], [cx - r * 0.5, top], [cx, top], [cx - r * 0.2, girdle]], '#a5fff0');
      facet([[cx - r * 0.2, girdle], [cx, top], [cx + r * 0.5, top], [cx + r * 0.25, girdle]], '#7cf7e2');
      facet([[cx + r * 0.25, girdle], [cx + r * 0.5, top], [cx + r, girdle]], '#45d9c0');
      facet([[cx - r, girdle], [cx - r * 0.2, girdle], [cx, tip]], '#5ef0d6');
      facet([[cx - r * 0.2, girdle], [cx + r * 0.25, girdle], [cx, tip]], '#3fcfb6');
      facet([[cx + r * 0.25, girdle], [cx + r, girdle], [cx, tip]], '#2aa893');
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx - r, girdle); ctx.lineTo(cx + r, girdle); ctx.stroke();
      const gl = (now % 2600) / 2600;
      if (gl < 0.18) { const k = Math.sin((gl / 0.18) * Math.PI), sx = cx - r * 0.45, sy = top + r * 0.1, L = T * 0.22 * k; ctx.strokeStyle = `rgba(255,255,255,${0.9 * k})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(sx - L, sy); ctx.lineTo(sx + L, sy); ctx.moveTo(sx, sy - L); ctx.lineTo(sx, sy + L); ctx.stroke(); }
    },
    laser(V, l, on, next, now) {
      const [ex, ey] = api.c(...l.at), end = l.beam.length ? api.c(...l.beam[l.beam.length - 1]) : [ex, ey], [dx, dy] = DIRS[l.dir];
      const fx = end[0] + dx * T * 0.5, fy = end[1] + dy * T * 0.5, sx = ex + dx * T * 0.18, sy = ey + dy * T * 0.18;
      if (on) {
        const j = 1 + 0.18 * Math.sin(now / 28) + 0.1 * Math.sin(now / 11);
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(255,60,80,0.18)'; ctx.lineWidth = T * 0.24 * j; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(fx, fy); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,77,94,0.6)'; ctx.lineWidth = T * 0.09 * j; ctx.stroke();
        ctx.strokeStyle = '#fff3f4'; ctx.lineWidth = Math.max(1, T * 0.025); ctx.stroke();
        for (let i = 0; i < 3; i++) { const a = now / 60 + i * 2.1, r = T * (0.04 + 0.05 * ((Math.sin(a * 3.1) + 1) / 2)); ctx.fillStyle = i ? 'rgba(255,120,130,0.8)' : '#fff'; ctx.beginPath(); ctx.arc(fx - dx * T * 0.04 + Math.cos(a) * r, fy - dy * T * 0.04 + Math.sin(a) * r, T * 0.018, 0, 7); ctx.fill(); }
        ctx.lineCap = 'butt';
      } else if (next) {
        ctx.strokeStyle = C.laser; ctx.globalAlpha = 0.45 + 0.4 * Math.sin(now / 80); ctx.setLineDash([T * 0.08, T * 0.12]); ctx.lineDashOffset = -now / 30; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(fx, fy); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.globalAlpha = 1;
      }
      // the emitter housing and its lens
      ctx.fillStyle = '#16100e'; ctx.beginPath(); ctx.roundRect(l.at[0] * T + T * 0.18, l.at[1] * T + T * 0.18, T * 0.64, T * 0.64, T * 0.12); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.stroke();
      const lens = on ? 1 : next ? 0.55 + 0.35 * Math.sin(now / 80) : 0.25;
      const lg = ctx.createRadialGradient(sx, sy, 0, sx, sy, T * 0.2); lg.addColorStop(0, `rgba(255,90,105,${lens})`); lg.addColorStop(1, 'rgba(255,90,105,0)');
      ctx.fillStyle = lg; ctx.fillRect(sx - T * 0.2, sy - T * 0.2, T * 0.4, T * 0.4);
      ctx.fillStyle = on ? '#ffd0d5' : '#7a3540'; ctx.beginPath(); ctx.arc(ex, ey, T * 0.09, 0, 7); ctx.fill();
    },
    cam(V, c, d, ang, now) {
      api.cone(c.at, ang, rayV(V, c.at, d, c.see).length, C.cam, 0.2);
      const [cx, cy] = api.c(...c.at);
      ctx.fillStyle = '#121626'; ctx.beginPath(); ctx.arc(cx, cy, T * 0.3, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(143,179,255,0.25)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
      ctx.fillStyle = '#2b3350'; ctx.beginPath(); ctx.roundRect(-T * 0.12, -T * 0.11, T * 0.32, T * 0.22, T * 0.05); ctx.fill();
      ctx.fillStyle = C.cam; ctx.beginPath(); ctx.arc(T * 0.17, 0, T * 0.075, 0, 7); ctx.fill();
      ctx.fillStyle = '#e8f0ff'; ctx.beginPath(); ctx.arc(T * 0.19, -T * 0.025, T * 0.022, 0, 7); ctx.fill();
      ctx.restore();
      if ((now % 1400) < 700) { ctx.fillStyle = '#ff4d5e'; ctx.beginPath(); ctx.arc(cx - T * 0.17, cy - T * 0.17, T * 0.035, 0, 7); ctx.fill(); }
    },
    guard(gx, gy, ang, o = {}) {
      // seen from above: broad amber shoulders, arms, a head under a dark cap whose peak points where he looks
      const [cx, cy] = [(gx + 0.5) * T, (gy + 0.5) * T], bob = (o.bob || 0) * T, S = T * 1.12;
      ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.beginPath(); ctx.ellipse(cx, cy + T * 0.22, T * 0.27, T * 0.09, 0, 0, 7); ctx.fill();
      ctx.save(); ctx.translate(cx, cy - bob); ctx.rotate(ang);
      if (o.alert) { ctx.strokeStyle = C.laser; ctx.lineWidth = T * 0.05; ctx.beginPath(); ctx.arc(0, 0, S * 0.36, 0, 7); ctx.stroke(); }
      // arms swing a little while walking
      const sw = (o.bob || 0) * 1.4;
      ctx.fillStyle = '#c47a2c';
      ctx.beginPath(); ctx.ellipse(S * (0.02 + sw), -S * 0.24, S * 0.09, S * 0.06, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(S * (0.02 - sw), S * 0.24, S * 0.09, S * 0.06, 0, 0, 7); ctx.fill();
      // shoulders
      const sh = ctx.createLinearGradient(-S * 0.2, 0, S * 0.15, 0); sh.addColorStop(0, '#d98a34'); sh.addColorStop(1, C.guard);
      ctx.fillStyle = sh; ctx.beginPath(); ctx.ellipse(-S * 0.03, 0, S * 0.17, S * 0.27, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(80,40,10,0.45)'; ctx.lineWidth = 1; ctx.stroke();
      // head and cap
      ctx.fillStyle = '#f3c48c'; ctx.beginPath(); ctx.arc(S * 0.04, 0, S * 0.13, 0, 7); ctx.fill();
      ctx.fillStyle = '#1f2740'; ctx.beginPath(); ctx.arc(S * 0.01, 0, S * 0.11, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(S * 0.06, -S * 0.1); ctx.quadraticCurveTo(S * 0.26, 0, S * 0.06, S * 0.1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.arc(S * 0.03, 0, S * 0.028, 0, 7); ctx.fill();
      ctx.restore();
    },
    guardDown(gx, gy, now, since) {
      // knocked out: flat on the floor, seeing stars
      const [cx, cy] = [(gx + 0.5) * T, (gy + 0.5) * T];
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(cx, cy + T * 0.06, T * 0.34, T * 0.12, 0.4, 0, 7); ctx.fill();
      ctx.fillStyle = '#8a5a26'; ctx.beginPath(); ctx.ellipse(cx, cy, T * 0.3, T * 0.15, 0.4, 0, 7); ctx.fill();
      ctx.fillStyle = C.guard; ctx.beginPath(); ctx.arc(cx + T * 0.2, cy + T * 0.09, T * 0.12, 0, 7); ctx.fill();
      if (now - since < 4000) for (let i = 0; i < 3; i++) { const a = now / 300 + i * 2.09; ctx.fillStyle = '#ffd27a'; ctx.font = `700 ${T * 0.18}px ${FONT.display}`; ctx.textAlign = 'center'; ctx.fillText('✦', cx + T * 0.2 + Math.cos(a) * T * 0.2, cy - T * 0.1 + Math.sin(a) * T * 0.08); }
    },
    cone(at, ang, len, color, alpha, flicker = 0) {
      if (!len) return;
      // a soft wedge of light along the facing angle
      const [cx, cy] = [(at[0] + 0.5) * T, (at[1] + 0.5) * T], L = (len + 0.5) * T, Wd = 0.5 * T;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
      const g = ctx.createLinearGradient(0, 0, L, 0); g.addColorStop(0, color + 'b0'); g.addColorStop(0.7, color + '40'); g.addColorStop(1, color + '00');
      ctx.globalAlpha = Math.min(1, alpha * 3) * (1 - flicker); ctx.fillStyle = g; ctx.beginPath();
      ctx.moveTo(T * 0.1, -T * 0.12); ctx.lineTo(L, -Wd); ctx.quadraticCurveTo(L + T * 0.12, 0, L, Wd); ctx.lineTo(T * 0.1, T * 0.12); ctx.closePath(); ctx.fill();
      ctx.restore(); ctx.globalAlpha = 1;
    },
    thief(px, py, o = {}) {
      // a hooded thief in a black mask; the eyes look where you're heading
      const [cx, cy] = [(px + 0.5) * T, (py + 0.5) * T], hop = o.hop || 0, sq = o.squash || 0, lift = hop * T * 0.16;
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(cx, cy + T * 0.22, T * 0.2 * (1 - 0.3 * hop), T * 0.07 * (1 - 0.3 * hop), 0, 0, 7); ctx.fill();
      ctx.save(); ctx.translate(cx, cy + T * 0.22 - lift); ctx.scale(1 + sq, 1 - sq); ctx.translate(0, -T * 0.22);
      const body = o.ghost ? C.gem : o.caught ? C.laser : C.you;
      const g = ctx.createRadialGradient(-T * 0.08, -T * 0.1, T * 0.02, 0, 0, T * 0.3); g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, body); g.addColorStop(1, o.ghost ? '#2aa893' : o.caught ? '#a8202e' : '#c9c2b2');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, T * 0.25, T * 0.27, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = T * 0.03; ctx.beginPath(); ctx.arc(0, T * 0.02, T * 0.21, Math.PI * 0.18, Math.PI * 0.82); ctx.stroke();
      const [fx, fy] = DIRS[o.face || 'U'], ex = fx * T * 0.05, ey = fy * T * 0.035;
      ctx.fillStyle = '#0e1016'; ctx.beginPath(); ctx.roundRect(-T * 0.2 + ex * 0.4, -T * 0.09 + ey, T * 0.4, T * 0.13, T * 0.065); ctx.fill();
      ctx.fillStyle = C.you;
      if (o.caught) { ctx.strokeStyle = C.you; ctx.lineWidth = T * 0.025; for (const sx of [-T * 0.075, T * 0.075]) { const X = sx + ex, Y = -T * 0.025 + ey, r = T * 0.03; ctx.beginPath(); ctx.moveTo(X - r, Y - r); ctx.lineTo(X + r, Y + r); ctx.moveTo(X + r, Y - r); ctx.lineTo(X - r, Y + r); ctx.stroke(); } }
      else { const open = o.blink ? 0.15 : 1; for (const sx of [-T * 0.075, T * 0.075]) { ctx.beginPath(); ctx.ellipse(sx + ex, -T * 0.025 + ey, T * 0.032, T * 0.032 * open, 0, 0, 7); ctx.fill(); } }
      ctx.restore();
    },
  };
  return api;
}
function isWallTile(V, x, y) { return V.rawWalls ? V.rawWalls.has(x + ',' + y) : true; }
const rayV = ray;
const parseL = L => parse(L);

// ---------- views ----------
let view = 'home';
// a new night started while the game was open: tonight's parts and vaults are different, so start fresh
function rolledOver() { return INIT && nightOf(Date.now()) !== dayNo; }
function show(v) {
  if (v !== 'play' && rolledOver()) { toast('A new night has started. Loading tonight’s vaults…'); setTimeout(() => location.reload(), 900); return; }
  view = v; if (v !== 'play') music.play(v === 'home' ? 'title' : null); for (const k of ['home', 'play', 'build']) $('v-' + k).hidden = k !== v; if (v === 'home') renderHome(); if (v === 'build') openBuilder(); window.scrollTo(0, 0); }
$('home-link').onclick = () => show('home');
$('home-link').onkeydown = e => { if (e.key === 'Enter') show('home'); };

// ---------- crack ----------
const P = painter($('board'));
const G = { queue: null, face: 'U', gAng: [], cAng: [], blinkAt: 0, frames: [], lastCap: 0, endAt: 0, result: null, drawn: {}, aim: false, barks: [], pebbleFx: null, L: null, key: '', label: '', next: null, V: null, s: null, prev: null, anim: 1, a0: 0, moves: 0, over: null, best: 0, owner: null };
// the legend and the one-line rules only mention what this vault actually has
function explain(V) {
  const g = V.guards.length, l = V.lasers.length, c = V.cams.length;
  $('legend').innerHTML = [g && '<span style="--c: var(--guard)">guard</span>', l && '<span style="--c: var(--laser)">laser, on and off</span>', c && '<span style="--c: var(--cam)">camera, turns each move</span>'].filter(Boolean).join('');
  $('legend').hidden = !(g || l || c);
  $('hint').innerHTML = '<b>Swipe</b> or tap to move. Red corners are watched next turn.' + (g ? ' Walk into a guard <b>from behind or the side</b> to knock them out. Your <b>pebble</b> turns nearby guards for two turns.' : '') + (l && !g ? ' A flickering beam fires next turn.' : '') + (c && !g ? ' Slip past a camera while it looks away.' : '');
  $('pebble').hidden = !g;
}
// The best possible run for a vault never changes once it exists, so it is solved once and remembered
// (the six house vaults are solved ahead of time, while the game is idle). Test runs are always solved fresh.
const BEST = new Map();
const bestKey = (key, L) => key === 'test' ? null : key + ':' + JSON.stringify(L);
function bestFor(key, L, V) {
  const k = bestKey(key, L); if (k && BEST.has(k)) return BEST.get(k);
  const n = (solve(V || parse(L)) || []).length; if (k) BEST.set(k, n); return n;
}
function warmBests() {
  const todo = LEVELS.map((L, i) => ['h' + (i + 1), L]).filter(([k, L]) => !BEST.has(bestKey(k, L)));
  if (!todo.length) return;
  const idle = window.requestIdleCallback || (f => setTimeout(() => f({ timeRemaining: () => 8 }), 200));
  idle(() => { const [k, L] = todo[0]; bestFor(k, L); warmBests(); });
}
function play(L, key, label, next, owner) {
  Object.assign(G, { L, key, label, next, owner, V: parseL(L), over: null, moves: 0, anim: 1, tryNo: (progress[key]?.tries || 0) + 1 });
  for (const f of G.frames || []) f.bmp?.close?.();
  G.log = []; G.queue = null; G.face = 'U'; G.gAng = []; G.cAng = []; FX.parts = []; FX.shake = FX.flash = FX.punch = null; G.downAt = {}; G.s = startState(G.V); G.prev = G.s; G.aim = false; G.barks = []; G.pebbleFx = null; G.frames = []; G.lastCap = 0; G.endAt = 0; G.result = null;
  G.best = bestFor(key, L, G.V);
  G.ghost = loadGhost(key, G.V);
  explain(G.V);
  $('overlay').hidden = true; $('coach').hidden = true; $('crowd').hidden = false; coachState.tip = null; show('play'); P.size(G.V); renderPlay(); music.play('heist'); music.setMood('calm');
}
function restart() { play(G.L, G.key, G.label, G.next, G.owner); }
function move(m) {
  lastActive = performance.now();
  if (view !== 'play' || G.over) return;
  // a move made while the last one is still animating is kept and played straight after
  if (G.anim < 1) { G.queue = m; return; }
  const n = step(G.V, G.s, m);
  if (!n) { bumpT = performance.now(); return; }
  const now = performance.now();
  if (typeof m === 'string' && m !== 'W') { G.face = m; dust(G.s.pos); }
  if (n.knocked >= 0) { const [gx, gy] = guardPos(G.V.guards[n.knocked], G.s); burst(gx, gy, ['#ffd27a', '#fff3c4'], 14, 2.6, 520); FX.shake = { t0: now, amp: 3 }; G.downAt[n.knocked] = now; }
  if (n.status === 'caught') { FX.shake = { t0: now, amp: 8 }; FX.flash = { t0: now, color: '255,77,94', a: 0.38 }; }
  if (n.status === 'won') { const [gx, gy] = G.V.gem; burst(gx, gy, ['#5ef0d6', '#a5fff0', '#ffffff'], 34, 4.2, 900); FX.punch = { t0: now, gx, gy }; FX.flash = { t0: now, color: '200,255,245', a: 0.3 }; }
  if (typeof m === 'object') { sfx.pebble(); G.pebbleFx = { from: G.s.pos, to: m.pebble, t0: now, landed: false }; G.aim = false; for (const i of n.heard || []) bark(i, 'suspicious', now + 260); if (n.heard?.length) setTimeout(() => sfx.hm(), 300); }
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
  if (G.key === 'test') { G.over = n.status; music.sting(n.status === 'won' ? 'cracked' : 'caught'); overlay(n.status, n.status === 'won' ? 'CRACKED' : 'CAUGHT', n.status === 'won' ? `Your vault works. ${G.moves} moves; the best possible is ${G.best}.` : why(n.cause, G.moves), G.label === 'Test run' ? 'Tap anywhere to go back to building' : 'Tap anywhere to go back'); return; }
  const prev = progress[G.key] || { tries: 0, won: false, moves: 0 };
  const tries = prev.tries + 1;
  try { navigator.vibrate?.(n.status === 'caught' ? [70, 50, 70] : [20, 40, 20, 40, 60]); } catch {}
  if (n.status === 'caught') {
    sfx.alarm(); music.sting('caught'); G.over = 'caught';
    overlay('caught', 'CAUGHT', why(n.cause, G.moves), 'Tap anywhere to try again');
  } else {
    sfx.win(); music.sting('cracked'); G.over = 'won';
    saveGhost(G.key, G.log);
    overlay('won', 'CRACKED', `${G.moves} moves${G.moves <= G.best ? ', a perfect run.' : `. The best possible is ${G.best}.`} ${tries === 1 ? 'First try.' : `Cracked on try ${tries}.`}`, G.next ? 'Tap anywhere for the next vault' : 'Tap anywhere to go back');
  }
  // what we show is local; what counts is the server's replay of the same moves
  progress[G.key] = { tries, won: prev.won || n.status === 'won', moves: n.status === 'won' ? (prev.won ? Math.min(prev.moves, G.moves) : G.moves) : prev.moves };
  submitAttempt(G.key, G.log.slice());
  renderPlay();
}
const why = (c, m) => ({ guard: 'A guard spotted you', laser: 'You walked into a live laser', camera: 'A camera caught you' }[c] || 'You were caught') + (m ? ` on move ${m}.` : '.');
function overlay(cls, h, p, sub) {
  const o = $('overlay'); o.className = 'overlay ' + cls; o.hidden = false;
  // with a keyboard and mouse, say which key continues
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) sub = sub.replace('Tap anywhere', 'Click or press space');
  // posting needs the server and a logged-in player
  const canShare = G.key !== 'test' && G.frames.length > 2 && !shared.has(G.key) && crowdStatus === 'live' && !!INIT?.userId;
  o.innerHTML = `<h2>${h}</h2><p>${p}</p><div class="extras"></div>` + (canShare ? `<button class="primary share" type="button" id="share-btn">${cls === 'won' ? 'Post this crack in the comments' : 'Post this bust in the comments'}</button>` : '') + `<div class="small">${sub}</div>`;
  const sb = $('share-btn'); if (sb) sb.onclick = e => { e.stopPropagation(); void shareRun(sb); };
}
$('overlay').onclick = () => {
  if (G.key === 'test') { show(G.label === 'Test run' ? 'build' : 'home'); return; }
  if (G.over === 'caught') restart();
  else if (G.over === 'won') G.next ? G.next() : show('home');
};
$('restart').onclick = () => { sfx.wake(); restart(); };
$('wait').onclick = () => { sfx.wake(); move('W'); };
$('pebble').onclick = () => { sfx.wake(); if (G.over || !G.s.peb || !G.V.guards.length) return; G.aim = !G.aim; renderPlay(); };
let down = null;
const swipeDir = (dx, dy) => Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U');
$('board').addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, used: false }; sfx.wake(); });
// a swipe moves as soon as the finger has travelled far enough, without waiting for it to lift
$('board').addEventListener('pointermove', e => {
  if (!down || down.used || G.aim) return;
  const dx = e.clientX - down.x, dy = e.clientY - down.y;
  if (Math.hypot(dx, dy) > 18) { down.used = true; move(swipeDir(dx, dy)); }
});
$('board').addEventListener('pointerup', e => {
  if (!down) return; const d = down; down = null;
  if (d.used) return;
  const dx = e.clientX - d.x, dy = e.clientY - d.y;
  if (Math.hypot(dx, dy) > 18 && !G.aim) { move(swipeDir(dx, dy)); return; }
  const r = $('board').getBoundingClientRect(), x = Math.floor((e.clientX - r.left) / P.T), y = Math.floor((e.clientY - r.top) / P.T);
  if (G.aim) { const ok = pebbleTargets(G.V, G.s).some(p => p[0] === x && p[1] === y); if (ok) move({ pebble: [x, y] }); else { G.aim = false; renderPlay(); } return; }
  const [px, py] = G.s.pos, ddx = x - px, ddy = y - py;
  if (!ddx && !ddy) move('W'); else if (Math.abs(ddx) >= Math.abs(ddy)) move(ddx > 0 ? 'R' : 'L'); else move(ddy > 0 ? 'D' : 'U');
});
$('board').addEventListener('pointercancel', () => { down = null; });
addEventListener('keydown', e => {
  if (view !== 'play' || e.target.tagName === 'INPUT') return;
  const m = { ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R', ' ': 'W' }[e.key];
  if (m) { e.preventDefault(); sfx.wake(); if (G.over && e.key === ' ') $('overlay').click(); else move(m); }
  if (e.key === 'r') restart();
  if (e.key === 'p') $('pebble').click();
  if (e.key === 'Escape' && G.aim) { G.aim = false; renderPlay(); }
});
const lerp = (a, b, k) => a + (b - a) * k, ease = k => 1 - Math.pow(1 - k, 3);
const easeBack = k => { const c = 1.6; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
const ANIM_MS = 160;
// turn toward a target angle along the short way round
const turn = (a, b, f) => { const d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI; return a + d * f; };

// ---------- effects: particles, shake, flash, the crack's punch ----------
const FX = { parts: [], shake: null, flash: null, punch: null, last: 0 };
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
function burst(x, y, colors, n, speed, life, list = FX) {
  if (REDUCED) n = Math.ceil(n / 3);
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = speed * (0.35 + Math.random() * 0.65); list.parts.push({ x: x + 0.5, y: y + 0.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.6, g: 3.2, life: life * (0.6 + Math.random() * 0.4), t: 0, color: colors[i % colors.length], size: 0.035 + Math.random() * 0.04 }); }
}
function dust([x, y]) {
  for (let i = 0; i < 4; i++) FX.parts.push({ x: x + 0.5 + (Math.random() - 0.5) * 0.3, y: y + 0.72, vx: (Math.random() - 0.5) * 0.8, vy: -0.25 - Math.random() * 0.3, g: 0, life: 380, t: 0, color: 'rgba(214,180,140,0.55)', size: 0.05 + Math.random() * 0.04, fade: true });
}
function drawFx(ctx, T, dt, list = FX) {
  const k = dt / 1000;
  list.parts = list.parts.filter(p => (p.t += dt) < p.life);
  for (const p of list.parts) {
    p.vy += p.g * k; p.x += p.vx * k; p.y += p.vy * k;
    const life = 1 - p.t / p.life;
    ctx.globalAlpha = p.fade ? life * 0.8 : Math.min(1, life * 1.6); ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x * T, p.y * T, p.size * T * (p.fade ? 1 + (1 - life) : 1), 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
// the next turn's danger only changes when the state does, so it is worked out once per move
const nextDangerCache = new WeakMap();
function nextDanger(s) {
  let d = nextDangerCache.get(s);
  if (!d) {
    const nextS = { ...s, t: s.t + 1, gs: advanceGuards(s.gs) };
    d = danger(G.V, nextS);
    for (const g of G.V.guards) if (!(s.ko & (1 << g.i))) { const n = guardPos(g, nextS); d.set(n[0] + ',' + n[1], 'guard'); }
    nextDangerCache.set(s, d);
  }
  return d;
}

function drawPlay(now) {
  const V = G.V, s = G.s, raw = G.anim, k = ease(raw), t = s.t, ctx = P.ctx, T = P.T;
  const dt = FX.last ? Math.min(50, now - FX.last) : 16; FX.last = now;
  const smooth = 1 - Math.exp(-dt / 55);
  // the camera: a shake on a bust, a little punch toward the gem on a crack
  let ox = 0, oy = 0, sc = 1, zx = 0, zy = 0;
  if (FX.shake && !REDUCED) { const e = (now - FX.shake.t0) / 450; if (e >= 1) FX.shake = null; else { const a = FX.shake.amp * (1 - e) * (1 - e); ox = Math.sin(now / 16) * a; oy = Math.cos(now / 21) * a; } }
  if (FX.punch && !REDUCED) { const e = (now - FX.punch.t0) / 600; if (e >= 1) FX.punch = null; else { sc = 1 + 0.05 * Math.sin(Math.PI * Math.min(1, e * 1.5)) * (1 - e); [zx, zy] = P.c(FX.punch.gx, FX.punch.gy); } }
  P.begin(V, ox, oy, sc, zx, zy); P.floor(V);
  for (const [idx, n] of crowdMarks) {
    const x = idx % V.w, y = Math.floor(idx / V.w), [cx, cy] = P.c(x, y), r = T * 0.12;
    ctx.globalAlpha = Math.min(0.75, 0.25 + 0.1 * n); ctx.strokeStyle = C.laser; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r); ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r); ctx.stroke(); ctx.lineCap = 'butt';
  }
  ctx.globalAlpha = 1;
  // where the thief is this frame: a short hop between tiles, a squash on landing, a shiver when blocked
  const moved = G.prev.pos[0] !== s.pos[0] || G.prev.pos[1] !== s.pos[1];
  const hop = moved && raw < 1 ? Math.sin(Math.PI * raw) : 0;
  const land = (now - G.a0 - ANIM_MS) / 200, squash = moved && land > 0 && land < 1 && !REDUCED ? Math.sin(Math.PI * land) * 0.13 * (1 - land) : -hop * 0.06;
  const bk = Math.max(0, 1 - (now - bumpT) / 200);
  const tx = lerp(G.prev.pos[0], s.pos[0], k) + Math.sin(now / 18) * 0.05 * bk, ty = lerp(G.prev.pos[1], s.pos[1], k);
  const lights = [{ x: V.gem[0], y: V.gem[1], r: 1.7, a: 0.9, tint: 'rgba(94,240,214,0.10)' }, { x: tx, y: ty, r: 2, a: 0.75 }];
  const gp = V.guards.map(g => { const a = guardPos(g, G.prev), b = guardPos(g, s); return { g, a, b, x: lerp(a[0], b[0], k), y: lerp(a[1], b[1], k), out: !!(s.ko & (1 << g.i)) }; });
  for (const q of gp) if (!q.out) lights.push({ x: q.x, y: q.y, r: 3 + 0.08 * Math.sin(now / 90 + q.g.i * 2), a: 0.95, tint: 'rgba(255,160,70,0.13)' });
  for (const l of V.lasers) if (laserOn(l, t)) for (const p of l.beam) lights.push({ x: p[0], y: p[1], r: 0.9, a: 0.35, tint: 'rgba(255,60,80,0.06)' });
  for (const c of V.cams) lights.push({ x: c.at[0], y: c.at[1], r: 1.1, a: 0.4, tint: 'rgba(140,180,255,0.06)' });
  P.light(V, lights);
  P.gem(V, now, s.status === 'won' ? 2 : 1);
  for (const l of V.lasers) P.laser(V, l, laserOn(l, t), laserOn(l, t + 1), now);
  V.cams.forEach((c, i) => { const d = camDir(c, t); G.cAng[i] = G.cAng[i] === undefined ? ANG[d] : turn(G.cAng[i], ANG[d], smooth); P.cam(V, c, d, G.cAng[i], now); });
  // guards: they walk with a bob and turn smoothly; their torches flicker
  for (const q of gp) {
    const { g, a, b } = q;
    if (q.out) { P.guardDown(a[0], a[1], now, G.downAt[g.i] || 0); continue; }
    G.drawn[g.i] = [q.x, q.y];
    G.gAng[g.i] = G.gAng[g.i] === undefined ? ANG[b[2]] : turn(G.gAng[g.i], ANG[b[2]], smooth);
    const ang = G.gAng[g.i], walking = (a[0] !== b[0] || a[1] !== b[1]) && raw < 1;
    P.cone([q.x, q.y], ang, rayV(V, [b[0], b[1]], b[2], g.see).length, C.guard, 0.2 * k + 0.05, 0.06 * (1 + Math.sin(now / 70 + g.i)));
    const alert = s.status === 'caught' && s.by && s.by[0] === b[0] && s.by[1] === b[1];
    P.guard(q.x, q.y, ang, { bob: walking ? Math.sin(Math.PI * raw) * 0.06 : 0, alert });
    P.torch(q.x, q.y, ang, now, g.i);
    if (s.gs[g.i][1] > 0 || s.gs[g.i][3]) { const [cx, cy] = P.c(q.x, q.y); ctx.fillStyle = C.guard; ctx.font = `700 ${T * 0.36}px ${FONT.display}`; ctx.textAlign = 'center'; ctx.fillText('?', cx + T * 0.3, cy - T * 0.22 + Math.sin(now / 180) * T * 0.04); }
    const n = guardPos(g, { ...s, t: t + 1, gs: advanceGuards(s.gs) });
    if (!G.over && (n[0] !== b[0] || n[1] !== b[1])) { const [cx, cy] = P.c(q.x, q.y), [nx, ny] = P.c(n[0], n[1]); ctx.strokeStyle = C.guard; ctx.globalAlpha = 0.6; ctx.lineWidth = 2; ctx.setLineDash([3, 4]); ctx.lineDashOffset = -now / 40; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(lerp(cx, nx, 0.72), lerp(cy, ny, 0.72)); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.globalAlpha = 1; }
  }
  // red corners: the tiles watched after your next move, breathing so the eye finds them
  if (!G.over) {
    const d = nextDanger(s), br = REDUCED ? 0 : (Math.sin(now / 260) + 1) / 2;
    ctx.strokeStyle = C.laser; ctx.lineWidth = 2 + br * 0.6; ctx.lineCap = 'round'; ctx.globalAlpha = 0.7 + 0.25 * br;
    for (const kk of d.keys()) { const [x, y] = kk.split(',').map(Number); corners(ctx, T, x, y, br * T * 0.025); hatch(ctx, T, x, y); }
    ctx.globalAlpha = 1; ctx.lineCap = 'butt';
  }
  // your best run so far, a turn at a time, as a faint ghost
  if (G.ghost) {
    const gs = G.ghost, i1 = Math.min(G.moves, gs.length - 1), i0 = Math.min(Math.max(0, G.moves - 1), gs.length - 1), kk = G.moves > gs.length - 1 ? 1 : k;
    const gx = lerp(gs[i0][0], gs[i1][0], kk), gy = lerp(gs[i0][1], gs[i1][1], kk);
    if (Math.abs(gx - tx) > 0.05 || Math.abs(gy - ty) > 0.05) { ctx.globalAlpha = 0.38; P.thief(gx, gy, { ghost: true, face: G.face }); ctx.globalAlpha = 1; }
  }
  // the thief
  if (now > G.blinkAt + 140) { if (now > G.blinkAt + 3200 + Math.random() * 2000) G.blinkAt = now; }
  P.thief(tx, ty, { hop, squash, face: G.face, caught: s.status === 'caught', blink: now - G.blinkAt < 140 });
  if (s.status === 'caught' && s.by) { const [bx, by] = P.c(...s.by), pop = easeBack(Math.min(1, (now - G.endAt) / 260)); ctx.save(); ctx.translate(bx, by - T * 0.42); ctx.scale(pop, pop); ctx.fillStyle = C.laser; ctx.font = `700 ${T * 0.5}px ${FONT.display}`; ctx.textAlign = 'center'; ctx.fillText('!', 0, 0); ctx.restore(); }
  // aiming: who would hear (amber), where it can land (rings)
  if (G.aim && !G.over) {
    ctx.fillStyle = C.guard; ctx.globalAlpha = 0.09;
    for (let y = 0; y < V.h; y++) for (let x = 0; x < V.w; x++) if (!V.walls.has(x + ',' + y) && gp.some(q => !q.out && Math.abs(q.b[0] - x) + Math.abs(q.b[1] - y) <= HEARING)) ctx.fillRect(x * T, y * T, T, T);
    const pr = (Math.sin(now / 160) + 1) / 2; ctx.globalAlpha = 0.85 + 0.15 * pr; ctx.strokeStyle = C.gem; ctx.lineWidth = 2;
    for (const [x, y] of pebbleTargets(V, s)) { const [cx, cy] = P.c(x, y); ctx.beginPath(); ctx.arc(cx, cy, T * (0.16 + 0.03 * pr), 0, 7); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  // the pebble in flight, then its ripple
  if (G.pebbleFx) {
    const f = G.pebbleFx, e = (now - f.t0) / 260, [ax, ay] = P.c(...f.from), [bx, by] = P.c(...f.to);
    if (e < 1) { const x = lerp(ax, bx, e), y = lerp(ay, by, e) - Math.sin(e * Math.PI) * T * 0.8; ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(lerp(ax, bx, e), lerp(ay, by, e) + T * 0.1, T * 0.06, T * 0.025, 0, 0, 7); ctx.fill(); ctx.fillStyle = C.you; ctx.beginPath(); ctx.arc(x, y, T * 0.07, 0, 7); ctx.fill(); }
    else if (e < 4) {
      if (!f.landed) { f.landed = true; burst(f.to[0], f.to[1], ['rgba(214,180,140,0.9)', '#f6f3ea'], 8, 1.6, 420); }
      const k2 = (e - 1) / 3; for (const off of [0, 0.25]) { const kk = Math.max(0, k2 - off); ctx.strokeStyle = C.you; ctx.globalAlpha = (1 - kk) * 0.8; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(bx, by, T * (0.2 + kk * HEARING), 0, 7); ctx.stroke(); }
      ctx.globalAlpha = 1; ctx.fillStyle = C.you; ctx.beginPath(); ctx.arc(bx, by, T * 0.06, 0, 7); ctx.fill();
    } else G.pebbleFx = null;
  }
  drawFx(ctx, T, dt);
  // a flash across the whole board on a bust or a crack
  if (FX.flash) { const e = (now - FX.flash.t0) / 500; if (e >= 1) FX.flash = null; else { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = `rgba(${FX.flash.color},${FX.flash.a * (1 - e) * (1 - e)})`; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore(); } }
  // what the guards say
  G.barks = G.barks.filter(b => now - b.t0 < 1900);
  for (const b of G.barks) {
    if (now < b.t0) continue;
    const at = G.drawn[b.i] || [0, 0], [cx, cy] = P.c(at[0], at[1]), age = now - b.t0, a = Math.min(1, age / 120, (1900 - age) / 300), pop = easeBack(Math.min(1, age / 220));
    ctx.font = `600 ${Math.max(11, T * 0.24)}px ${FONT.body}`; ctx.textAlign = 'center';
    const w = ctx.measureText(b.text).width + 16, h = Math.max(20, T * 0.42), bx = Math.min(V.w * T - w / 2 - 4, Math.max(w / 2 + 4, cx)), by = cy - T * 0.66;
    ctx.save(); ctx.translate(cx, by + h / 2); ctx.scale(pop, pop); ctx.translate(-cx, -(by + h / 2));
    ctx.globalAlpha = a; ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.roundRect(bx - w / 2, by - h / 2 + 2, w, h, 7); ctx.fill();
    ctx.fillStyle = b.kind === 'alert' ? C.laser : C.you;
    ctx.beginPath(); ctx.roundRect(bx - w / 2, by - h / 2, w, h, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - 5, by + h / 2 - 1); ctx.lineTo(cx, by + h / 2 + 6); ctx.lineTo(cx + 5, by + h / 2 - 1); ctx.fill();
    ctx.fillStyle = b.kind === 'alert' ? '#fff' : C.night; ctx.fillText(b.text, bx, by + h * 0.18); ctx.restore(); ctx.globalAlpha = 1;
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
// diagonal stripes inside a watched tile: readable without telling red from anything else
function hatch(ctx, T, x, y) {
  const a = ctx.globalAlpha, lw = ctx.lineWidth; ctx.globalAlpha = a * 0.32; ctx.lineWidth = 1.3;
  ctx.save(); ctx.beginPath(); ctx.rect(x * T + T * 0.14, y * T + T * 0.14, T * 0.72, T * 0.72); ctx.clip(); ctx.beginPath();
  for (let k = 0.25; k < 2; k += 0.25) { const o = k * T; ctx.moveTo(x * T + Math.max(0, o - T), y * T + Math.min(o, T)); ctx.lineTo(x * T + Math.min(o, T), y * T + Math.max(0, o - T)); }
  ctx.stroke(); ctx.restore(); ctx.globalAlpha = a; ctx.lineWidth = lw;
}
function corners(ctx, T, x, y, inset = 0) {
  const m = T * 0.12 - inset, l = T * 0.2, X = x * T, Y = y * T; ctx.beginPath();
  ctx.moveTo(X + m, Y + m + l); ctx.lineTo(X + m, Y + m); ctx.lineTo(X + m + l, Y + m);
  ctx.moveTo(X + T - m - l, Y + m); ctx.lineTo(X + T - m, Y + m); ctx.lineTo(X + T - m, Y + m + l);
  ctx.moveTo(X + m, Y + T - m - l); ctx.lineTo(X + m, Y + T - m); ctx.lineTo(X + m + l, Y + T - m);
  ctx.moveTo(X + T - m - l, Y + T - m); ctx.lineTo(X + T - m, Y + T - m); ctx.lineTo(X + T - m, Y + T - m - l); ctx.stroke();
}
let crowdMarks = new Map();
// ---------- your best run, as a ghost ----------
// Kept on this device only. It's replayed against the vault before use, so a stale or damaged one is ignored.
function loadGhost(key, V) {
  if (key === 'test') return null;
  let moves; try { moves = JSON.parse(localStorage.getItem('vault:ghost:' + key) || 'null'); } catch { return null; }
  if (!Array.isArray(moves) || !moves.length) return null;
  let st = startState(V); const pos = [st.pos];
  for (const m of moves) { st = step(V, st, m); if (!st) return null; pos.push(st.pos); }
  return st.status === 'won' ? pos : null;
}
function saveGhost(key, log) {
  if (key === 'test') return;
  try {
    const old = JSON.parse(localStorage.getItem('vault:ghost:' + key) || 'null');
    if (!Array.isArray(old) || log.length < old.length) localStorage.setItem('vault:ghost:' + key, JSON.stringify(log));
  } catch {}
}
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
    $('crowd').innerHTML = crowdStatus !== 'live' ? crowdLine() : !st.people ? '<b>Nobody has tried this vault yet.</b>' : `<b>${st.caught}</b> ${st.caught === 1 ? 'bust' : 'busts'} and <b>${st.cracked}</b> ${st.cracked === 1 ? 'crack' : 'cracks'} so far. The red marks show where people got caught.`;
  }
  const pb = $('pebble'); pb.textContent = G.aim ? 'Cancel' : `Pebble ×${G.s?.peb ?? 0}`; pb.disabled = !G.s?.peb && !G.aim;
  pb.className = G.aim ? 'primary' : 'ghost';
  if (G.ghost) $('meta').title = 'The teal ghost is your best run on this vault.';
  $('meta').innerHTML = `moves <b>${G.moves}</b> · best possible <b>${G.best}</b>` + (G.ghost ? ` · <span class="ghostnote">your best <b>${G.ghost.length - 1}</b></span>` : '') + (G.key !== 'test' ? ` · try <b>${G.tryNo}</b>` : '');
}

// ---------- home ----------
function playHouse(i) { play(LEVELS[i], 'h' + (i + 1), `Vault ${i + 1} of ${LEVELS.length}`, i < LEVELS.length - 1 ? () => playHouse(i + 1) : null); }
function renderHome() {
  const done = LEVELS.filter((_, i) => progress['h' + (i + 1)]?.won).length;
  const st = INIT?.streak;
  const streak = st?.count ? `<div class="streakline"><b>Streak: ${st.count} ${st.count === 1 ? 'night' : 'nights'}.</b> ${st.tonight ? 'Come back tomorrow night to keep it going.' : 'Crack any vault tonight to keep it.'}</div>` : '';
  $('job-line').innerHTML = (done === LEVELS.length ? '<b>All six cracked.</b> Now try the vaults other players built tonight, or build your own.' : `<b>${done} of ${LEVELS.length}</b> cracked. Six practice vaults, each teaching one trick.`) + streak;
  $('jobs').innerHTML = LEVELS.map((L, i) => `<button type="button" class="${progress['h' + (i + 1)]?.won ? 'done' : ''}" data-i="${i}" aria-label="${L.name}"><b>${i + 1}</b>${progress['h' + (i + 1)]?.won ? 'cracked' : progress['h' + (i + 1)]?.tries ? 'tried' : 'open'}</button>`).join('');
  $('jobs').querySelectorAll('button').forEach((b, i) => b.prepend(thumb(LEVELS[i], 30)));
  $('jobs').querySelectorAll('button').forEach(b => b.onclick = () => { sfx.wake(); playHouse(+b.dataset.i); });
  const mine = INIT?.mine;
  if (mine) {
    const st = mine.stats;
    $('mine').innerHTML = `<div class="title"><h3 style="font-size:1.25rem"></h3><div class="vno">best possible ${mine.best} moves</div></div>
      <div class="statrow"><div class="stat"><div class="v">${st.caught}</div><div class="l">busts</div></div><div class="stat"><div class="v">${st.cracked}</div><div class="l">cracks</div></div><div class="stat"><div class="v">${st.people ? Math.round(100 * st.cracked / st.people) + '%' : '–'}</div><div class="l">crack rate</div></div></div>
      <div class="sub">${st.people ? (st.cracked ? `${st.people} ${st.people === 1 ? 'person has' : 'people have'} tried it.` : '<b>Nobody has cracked it yet.</b>') : 'Nobody has tried it yet. Check back later tonight.'}</div>
      <div class="row"><button class="ghost" id="mine-play" type="button">Play it</button></div>`;
    $('mine').querySelector('h3').textContent = mine.name;
    $('mine-play').onclick = () => play(mine.level, 'test', 'Your vault');
  } else {
    const th = themeFor(dayNo);
    $('mine').innerHTML = `<div class="sub">${th ? `<b class="theme">Tonight is ${th.name}.</b> ${th.line} ` : ''}Tonight’s parts: <b>${partsLine()}</b>. Build a vault that catches people. You get one a night.</div>${INIT && !INIT.userId ? '<div class="sub"><b>Log in to Reddit</b> to publish your vault and keep your runs. You can still play and test everything.</div>' : ''}<div class="row"><button class="primary" id="go-build" type="button">Build tonight’s vault</button></div>`;
    $('go-build').onclick = () => show('build');
  }
  renderVaultOfTheNight();
  const list = (INIT?.others || []).slice().sort((a, b) => deadliness(b.stats) - deadliness(a.stats));
  $('others-line').innerHTML = crowdStatus !== 'live' ? crowdLine() : list.length ? 'Deadliest first. Each one was built by another player from tonight’s parts.' : 'Nobody else has built a vault tonight yet. Be the first, or check back later.';
  $('others').innerHTML = '';
  for (const b of list) {
    const r = progress[b.key], btn = document.createElement('button'); btn.type = 'button'; btn.className = 'vrow';
    btn.innerHTML = `<span class="n"></span><span class="s"></span><span class="tag ${r?.won ? 'ok' : r?.tries ? 'no' : ''}">${r?.won ? 'cracked' : r?.tries ? 'busted ×' + r.tries : 'new'}</span>`;
    btn.classList.add('thumbed'); btn.prepend(thumb(b.level, 34));
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
  $('votn').innerHTML = `<div class="thumbrow"><span class="tslot"></span><div><div class="n"></div><div class="sub"></div></div></div><div class="row"></div>`;
  $('votn').querySelector('.tslot').replaceWith(thumb(v.level, 56));
  $('votn').querySelector('.n').textContent = v.name;
  $('votn').querySelector('.sub').innerHTML = `${mine ? 'Yours.' : `By u/${escapeHtml(v.author || 'someone')}.`} Stumped <b>${v.stats.people - v.stats.cracked}</b> of <b>${v.stats.people}</b> ${v.stats.people === 1 ? 'thief' : 'thieves'} so far.`;
  const btn = document.createElement('button'); btn.type = 'button';
  btn.className = mine ? 'ghost' : 'primary';
  btn.textContent = mine ? 'Play your vault' : r?.won ? 'You cracked it. Play again' : 'Try to crack it';
  btn.onclick = () => { sfx.wake(); mine ? play(v.level, 'test', 'Your vault') : play(v.level, v.key, `By u/${v.author || 'someone'}`, null, v.owner); };
  $('votn').querySelector('.row').appendChild(btn);
  if (INIT?.isMod && !mine) $('votn').querySelector('.row').appendChild(removeButton(v));
}
// A tiny map of a vault: walls, the gem, guard routes, lasers and cameras. Cached per vault.
const thumbCache = new WeakMap();
function thumb(level, w) {
  const key = w, per = thumbCache.get(level) || new Map(); thumbCache.set(level, per);
  if (per.has(key)) return cloneThumb(per.get(key));
  const V = parseL(level), dpr = Math.min(devicePixelRatio || 1, 2), t = w / V.w, h = Math.round(t * V.h);
  const c = document.createElement('canvas'); c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); c.style.width = w + 'px'; c.style.height = h + 'px'; c.className = 'thumb'; c.setAttribute('aria-hidden', 'true');
  const x = c.getContext('2d'); x.scale(dpr, dpr);
  for (let yy = 0; yy < V.h; yy++) for (let xx = 0; xx < V.w; xx++) { x.fillStyle = V.walls.has(xx + ',' + yy) ? '#3a211b' : (xx + yy) % 2 ? '#6e5340' : '#765944'; x.fillRect(xx * t, yy * t, t + 0.5, t + 0.5); }
  for (const l of V.lasers) { x.strokeStyle = '#ff4d5e'; x.lineWidth = Math.max(1, t * 0.18); x.beginPath(); const a = l.at, b = l.beam[l.beam.length - 1] || a; x.moveTo((a[0] + 0.5) * t, (a[1] + 0.5) * t); x.lineTo((b[0] + 0.5) * t, (b[1] + 0.5) * t); x.stroke(); }
  for (const g of V.guards) {
    const route = level.guards[g.i].path;
    x.strokeStyle = 'rgba(255,181,71,0.7)'; x.lineWidth = Math.max(1, t * 0.16); x.beginPath(); route.forEach(([px, py], i) => i ? x.lineTo((px + 0.5) * t, (py + 0.5) * t) : x.moveTo((px + 0.5) * t, (py + 0.5) * t)); x.stroke();
    const [px, py] = route[0]; x.fillStyle = '#ffb547'; x.beginPath(); x.arc((px + 0.5) * t, (py + 0.5) * t, t * 0.38, 0, 7); x.fill();
  }
  for (const cm of V.cams) { x.fillStyle = '#8fb3ff'; x.beginPath(); x.arc((cm.at[0] + 0.5) * t, (cm.at[1] + 0.5) * t, t * 0.36, 0, 7); x.fill(); }
  const [gx, gy] = V.gem, r = t * 0.42; x.fillStyle = '#5ef0d6'; x.beginPath(); x.moveTo((gx + 0.5) * t, (gy + 0.5) * t - r); x.lineTo((gx + 0.5) * t + r, (gy + 0.5) * t); x.lineTo((gx + 0.5) * t, (gy + 0.5) * t + r); x.lineTo((gx + 0.5) * t - r, (gy + 0.5) * t); x.fill();
  per.set(key, c);
  return cloneThumb(c);
}
function cloneThumb(src) {
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; c.style.cssText = src.style.cssText; c.className = 'thumb'; c.setAttribute('aria-hidden', 'true');
  c.getContext('2d').drawImage(src, 0, 0); return c;
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
function crowdLine() { return crowdStatus === 'off' ? 'Tonight’s vaults couldn’t be loaded. The training heist still works; check your connection and reopen the post for the rest.' : 'Loading tonight’s vaults…'; }

// ---------- builder ----------
let PARTS = partsFor(dayNo);
const PART_NAMES = { wall: ['wall', 'walls'], guard: ['guard', 'guards'], laser: ['laser', 'lasers'], cam: ['camera', 'cameras'] };
const partsLine = () => Object.entries(PARTS).filter(([, n]) => n).map(([k, n]) => `${n} ${PART_NAMES[k][n === 1 ? 0 : 1]}`).join(', ');
const NAMES = ['The Velvet Box', 'Glass Hours', 'The Night Ledger', 'Copper Lung', 'Quiet Room', 'The Long Hall', 'Moth Box', 'The Counting House', 'Low Tide', 'The Lantern', 'Dead Drop', 'The Cold Room', 'Silver Spoon', 'The Back Office', 'Graveyard Shift', 'The Strongroom', 'Brass Monkey', 'The Pawnshop', 'Glasshouse', 'The Undercroft', 'Paper Moon', 'The Lockbox', 'Hush Money', 'The Gilded Cage'];
// a fresh draft gets a random name nobody has used tonight
const freshName = () => { const used = new Set([...LEVELS, ...(INIT?.others || [])].map(o => o.name)); const free = NAMES.filter(n => !used.has(n)); const pool = free.length ? free : NAMES; return pool[Math.floor(Math.random() * pool.length)]; };
const B = { hist: [], painting: false, d: null, tool: 'wall', sel: null, routing: null, verdict: null, best: 0 };
const BP = painter($('bboard'));
function blankDraft() { return { walls: [], gem: [3, 1], guards: [], lasers: [], cams: [], name: freshName() }; }
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
  if (!adj || !inside(...p) || occupant(...p) || g.path.length >= 6) { if (!adj) toast('Routes go one tile at a time. Tap a tile next to the end of the route.'); else if (g.path.length >= 6) toast('A route can be at most 6 tiles.'); else if (inside(...p)) toast('That tile is taken. Routes go over open floor.'); return; }
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
function changed() { if (!B.painting) pushHistory(); saveDraft(); renderBuilder(); clearTimeout(checkT); $('verdict').className = 'verdict'; $('verdict').textContent = 'Checking…'; checkT = setTimeout(check, 120); }
function check() {
  const L = draftToLevel(B.d);
  // lasers that sit on placed walls need that wall in the map
  for (const l of B.d.lasers) if (l.wall) { const r = [...L.map[l.at[1]]]; r[l.at[0]] = '#'; L.map[l.at[1]] = r.join(''); }
  const V = parse(L), sol = solve(V), straight = Math.abs(START[0] - B.d.gem[0]) + Math.abs(START[1] - B.d.gem[1]);
  B.level = L; B.best = sol ? sol.length : 0; B.verdict = sol ? 'ok' : 'bad';
  const v = $('verdict');
  let words, level;
  if (!sol) { level = 0; words = 'Impossible right now. There is no way to reach the gem without being seen. Open a path or slow something down.'; }
  else {
    const hard = B.best - straight;
    level = hard <= 0 ? 1 : hard < 4 ? 2 : hard < 8 ? 3 : 4;
    words = `Crackable. The best possible run is ${B.best} moves.` + (hard <= 0 ? ' Add something to get in the way.' : hard < 4 ? ' Make it meaner.' : hard < 8 ? ' People will have to think.' : ' People will need several tries.');
  }
  // a meter from impossible to nasty, so the verdict reads at a glance
  const labels = ['Impossible', 'Straight walk', 'Easy', 'A real puzzle', 'Nasty'];
  v.className = 'verdict ' + (sol ? 'ok' : 'bad');
  v.innerHTML = `<div class="meter" data-level="${level}" aria-hidden="true"><i></i><i></i><i></i><i></i></div><div class="vtext"><b>${labels[level]}.</b> </div>`;
  v.querySelector('.vtext').append(words.replace(/^Impossible right now\. |^Crackable\. /, ''));
  if (B.lastLevel !== undefined && B.lastLevel !== level) { v.classList.add('changed'); }
  B.lastLevel = level;
  $('b-lock').disabled = B.verdict !== 'ok' || !!myBuilt();
  $('b-test').disabled = B.verdict !== 'ok';
}
// Undo: each committed change is a snapshot of the draft; a drag of walls counts as one change.
function pushHistory() {
  const snap = JSON.stringify(B.d);
  if (B.hist.at(-1) !== snap) B.hist.push(snap);
  if (B.hist.length > 80) B.hist.shift();
  $('b-undo').disabled = B.hist.length < 2;
}
function undo() {
  if (B.hist.length < 2) return;
  B.hist.pop(); B.d = JSON.parse(B.hist.at(-1)); B.sel = null; B.routing = null;
  $('vaultName').value = B.d.name || '';
  saveDraft(); renderBuilder(); check(); sfx.place(true);
  $('b-undo').disabled = B.hist.length < 2;
}
function openBuilder() {
  if (!B.d) B.d = loadDraft();
  if (!B.hist.length) B.hist = [JSON.stringify(B.d)];
  $('b-undo').disabled = B.hist.length < 2;
  const tip = $('b-tip');
  if (!tipsSeen.builder) {
    tip.innerHTML = 'Stuck? Tap <strong>Surprise me</strong>, then make it meaner.' + (PARTS.guard ? ' Thieves carry a <strong>pebble</strong> that turns nearby guards, so a lone guard won’t stop them.' : ' The meter under the board shows how hard it is.');
    tip.hidden = false; tipsSeen.builder = 1; try { localStorage.setItem('vault:tips', JSON.stringify(tipsSeen)); } catch {}
  } else tip.hidden = true;
  $('vaultName').value = B.d.name || '';
  BP.size({ w: W7, h: H9 }); renderBuilder(); check();
}
function renderBuilder() {
  const d = B.d, used = { wall: wallsUsed(), guard: d.guards.length, laser: d.lasers.length, cam: d.cams.length };
  const th = themeFor(dayNo); $('b-night').textContent = th ? th.name : ''; // the header already says which night
  const tools = [['wall', 'Wall', 'var(--wall)'], ['guard', 'Guard', 'var(--guard)'], ['laser', 'Laser', 'var(--laser)'], ['cam', 'Camera', 'var(--cam)'], ['gem', 'Move gem', 'var(--gem)'], ['erase', 'Erase', 'var(--muted)']];
  $('parts').innerHTML = tools.filter(([k]) => !(k in PARTS) || PARTS[k] > 0).map(([k, l, c]) => `<button type="button" data-k="${k}" class="${B.tool === k ? 'on' : ''}"><span><i style="--c:${c}"></i>${l}</span><span class="c">${k in PARTS ? `${PARTS[k] - used[k]} left` : '&nbsp;'}</span></button>`).join('');
  $('parts').querySelectorAll('button').forEach(b => b.onclick = () => { B.tool = b.dataset.k; B.routing = null; B.sel = null; renderBuilder(); });
  // inspector
  const I = $('inspect'); I.innerHTML = '';
  const chip = (label, on, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip' + (on ? ' on' : ''); b.textContent = label; b.onclick = fn; I.appendChild(b); };
  const say = t => { const s = document.createElement('span'); s.textContent = t; I.appendChild(s); };
  const s = B.sel;
  if (B.routing != null) {
    say('Drag from the guard, or tap tile by tile, to draw its route (up to 6 tiles). Tap the end again to undo.');
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
    const placed = { guard: [d.guards.length, 'guards'], laser: [d.lasers.length, 'lasers'], cam: [d.cams.length, 'cameras'] }[B.tool];
    if (placed && placed[0] >= (PARTS[B.tool] || 0)) say(`All tonight’s ${placed[1]} are placed. Tap one to change it, or erase it to place it somewhere else.`);
    else say({ wall: 'Tap or drag across the floor to place walls; tap or drag over walls to remove them.', guard: 'Tap floor to place a guard, then drag out its route.', laser: 'Tap a wall to mount a laser on it.', cam: 'Tap floor to place a camera.', gem: 'Tap a floor tile in the top half to move the gem.', erase: 'Tap or drag over parts to remove them.' }[B.tool]);
  }
}
const BFX = { parts: [], rings: [], last: 0, hover: null };
const builtCache = new WeakMap();
function drawBuilder(now) {
  if (!B.d) return;
  const L = B.level || draftToLevel(B.d);
  let V = builtCache.get(L);
  if (!V) { try { V = parseL(L); } catch { return; } builtCache.set(L, V); }
  const ctx = BP.ctx, T = BP.T, dt = BFX.last ? Math.min(50, now - BFX.last) : 16; BFX.last = now;
  BP.begin(V); BP.floor(V);
  // entrance marker
  { const [cx, cy] = BP.c(...START); ctx.fillStyle = C.you; ctx.globalAlpha = 0.55 + 0.2 * Math.sin(now / 400); ctx.font = `600 ${T * 0.22}px ${FONT.mono}`; ctx.textAlign = 'center'; ctx.fillText('IN', cx, cy + T * 0.08); ctx.globalAlpha = 1; }
  // the tile under the pointer, in the colour of the selected part
  if (BFX.hover && !REDUCED) { const [hx, hy] = BFX.hover; ctx.strokeStyle = TOOL_COLOR[B.tool] || C.text; ctx.globalAlpha = 0.8; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(hx * T + 3, hy * T + 3, T - 6, T - 6, 6); ctx.stroke(); ctx.globalAlpha = 1; }
  BP.gem(V, now);
  const t = Math.floor(now / 700);
  V.lasers.forEach(l => BP.laser(V, l, laserOn(l, t), laserOn(l, t + 1), now));
  V.cams.forEach(c => BP.cam(V, c, camDir(c, t), ANG[camDir(c, t)], now));
  V.guards.forEach((g, i) => {
    const path = B.d.guards[i]?.path || [];
    // the route marches in the direction he walks
    ctx.strokeStyle = C.guard; ctx.globalAlpha = 0.75; ctx.lineWidth = 3; ctx.setLineDash([2, 6]); ctx.lineDashOffset = -now / 60; ctx.lineCap = 'round';
    ctx.beginPath(); path.forEach((p, k) => { const [cx, cy] = BP.c(...p); k ? ctx.lineTo(cx, cy) : ctx.moveTo(cx, cy); }); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.globalAlpha = 1;
    for (const p of path.slice(1)) { const [cx, cy] = BP.c(...p); ctx.fillStyle = C.guard; ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.arc(cx, cy, T * 0.07, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
    const [x, y, f] = g.seq[t % g.seq.length];
    BP.cone([x, y], ANG[f], rayV(V, [x, y], f, g.see).length, C.guard, 0.15); BP.guard(x, y, ANG[f]); BP.torch(x, y, ANG[f], now, g.i);
  });
  // placement rings
  BFX.rings = BFX.rings.filter(r => now - r.t0 < 450);
  for (const r of BFX.rings) { const e = (now - r.t0) / 450, [cx, cy] = BP.c(r.x, r.y); ctx.strokeStyle = r.color; ctx.globalAlpha = 1 - e; ctx.lineWidth = 2.5 * (1 - e) + 0.5; ctx.beginPath(); ctx.arc(cx, cy, T * (0.25 + 0.45 * ease(e)), 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
  drawFx(ctx, T, dt, BFX);
  // selection ring
  const s = B.routing != null ? { kind: 'guard', i: B.routing } : B.sel;
  if (s) {
    const tiles = s.kind === 'guard' ? (B.d.guards[s.i]?.path || []).slice(-1) : s.kind === 'laser' ? [B.d.lasers[s.i]?.at] : s.kind === 'cam' ? [B.d.cams[s.i]?.at] : [];
    const br = (Math.sin(now / 240) + 1) / 2; ctx.strokeStyle = C.text; ctx.lineWidth = 2; ctx.lineCap = 'round'; for (const p of tiles) if (p) corners(ctx, T, p[0], p[1], br * T * 0.03); ctx.lineCap = 'butt';
  }
}
const TOOL_COLOR = { wall: C.wall, guard: C.guard, laser: C.laser, cam: C.cam, gem: C.gem, erase: C.muted };
function placed(x, y, kind) {
  const color = kind === 'erase' ? '#9aa2b4' : TOOL_COLOR[kind] || C.text;
  BFX.rings.push({ x, y, t0: performance.now(), color });
  burst(x, y, [color, '#f6f3ea'], kind === 'erase' ? 6 : 10, 1.8, 420, BFX);
  sfx.place(kind === 'erase');
}
const tileAt = e => { const r = $('bboard').getBoundingClientRect(), x = Math.floor((e.clientX - r.left) / BP.T), y = Math.floor((e.clientY - r.top) / BP.T); return x >= 0 && y >= 0 && x < W7 && y < H9 ? [x, y] : null; };
function tapWithFeedback(x, y) {
  const before = JSON.stringify(B.d);
  tapTile(x, y);
  if (JSON.stringify(B.d) !== before) placed(x, y, B.tool);
}
// With Wall or Erase selected, dragging paints: the first tile decides whether the drag adds or removes walls.
let paint = null;
function paintTile(x, y) {
  const k = x + ',' + y; if (paint.seen.has(k)) return; paint.seen.add(k);
  const occ = occupant(x, y), isWall = occ?.kind === 'wall';
  if (B.tool === 'wall' && (paint.adding ? occ : !isWall)) return;
  if (B.tool === 'wall' && paint.adding && wallsUsed() >= PARTS.wall) { if (!paint.warned) { paint.warned = true; toast('No walls left in tonight’s box.'); } return; }
  if (B.tool === 'erase' && (!occ || occ.kind === 'gem')) return;
  tapWithFeedback(x, y);
}
let trace = null;
$('bboard').addEventListener('pointerdown', e => {
  const t = tileAt(e); if (!t) return;
  sfx.wake();
  const occ = occupant(...t);
  // tapping a guard, laser or camera selects it, whatever tool is active
  const selecting = B.tool === 'wall' && occ && occ.kind !== 'wall';
  // drawing a route: press on its end and drag through open floor (back over the last step undoes it)
  const rg = B.routing != null && B.d.guards[B.routing];
  if (rg && eq(t, rg.path[rg.path.length - 1])) {
    try { $('bboard').setPointerCapture(e.pointerId); } catch {}
    trace = { moved: false }; B.painting = true; paint = null; return;
  }
  if ((B.tool === 'wall' || B.tool === 'erase') && B.routing == null && !selecting) {
    try { $('bboard').setPointerCapture(e.pointerId); } catch {}
    paint = { seen: new Set(), adding: B.tool === 'wall' && occupant(...t)?.kind !== 'wall' };
    B.painting = true; paintTile(...t);
  } else paint = null;
});
$('bboard').addEventListener('pointermove', e => {
  const t = tileAt(e);
  BFX.hover = t && e.pointerType === 'mouse' ? t : null;
  if (paint && t) paintTile(...t);
  if (trace && t) {
    const g = B.d.guards[B.routing]; if (!g) return;
    const last = g.path[g.path.length - 1], prev = g.path[g.path.length - 2];
    if (eq(t, last)) return;
    if (prev && eq(t, prev)) { g.path.pop(); trace.moved = true; changed(); return; }
    if (Math.abs(t[0] - last[0]) + Math.abs(t[1] - last[1]) === 1 && inside(...t) && !occupant(...t) && g.path.length < 6) { g.path.push(t); trace.moved = true; changed(); }
  }
});
$('bboard').addEventListener('pointerleave', () => { BFX.hover = null; });
const endPaint = () => { if (!paint) return; paint = null; B.painting = false; pushHistory(); };
$('bboard').addEventListener('pointerup', e => {
  if (paint) { endPaint(); return; }
  if (trace) { const moved = trace.moved; trace = null; B.painting = false; if (moved) { pushHistory(); return; } }
  const t = tileAt(e); if (t) tapWithFeedback(...t);
});
$('bboard').addEventListener('pointercancel', () => { endPaint(); if (trace) { trace = null; B.painting = false; pushHistory(); } });
$('b-undo').onclick = () => undo();
addEventListener('keydown', e => { if (view === 'build' && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && e.target.tagName !== 'INPUT') { e.preventDefault(); undo(); } });
$('vaultName').addEventListener('input', e => {
  // invisible characters are dropped as you type, so the server never has to refuse the name
  const clean = e.target.value.replace(/[\p{Cc}\p{Cf}]/gu, '').slice(0, 24);
  if (clean !== e.target.value) e.target.value = clean;
  B.d.name = clean; saveDraft();
});
// A random vault from tonight's parts: try a few, keep the trickiest one that can still be cracked.
// Tries 30 random layouts and keeps the most interesting crackable one. It hands the main thread back
// between tries (about every 12 ms), so the page never freezes while the solver works.
async function surprise() {
  const btn = $('b-surprise'); if (btn.disabled) return;
  btn.disabled = true; const label = btn.textContent; btn.textContent = 'Building…';
  try {
  const rnd = n => Math.floor(Math.random() * n);
  const free = (d, x, y) => inside(x, y) && !(x === START[0] && y >= H9 - 2) && !(d.gem[0] === x && d.gem[1] === y) && !d.walls.some(w => w[0] === x && w[1] === y) && !d.guards.some(g => g.path.some(p => p[0] === x && p[1] === y)) && !d.cams.some(c => c.at[0] === x && c.at[1] === y);
  let best = null, bestScore = -1;
  let slice = performance.now();
  for (let attempt = 0; attempt < 30; attempt++) {
    if (performance.now() - slice > 12) { await new Promise(res => setTimeout(res, 0)); slice = performance.now(); if (view !== 'build') return; }
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
  } finally { btn.disabled = false; btn.textContent = label; }
}
$('b-surprise').onclick = () => { void surprise(); };
$('b-clear').onclick = () => { const n = B.d.name; B.d = blankDraft(); B.d.name = n; B.sel = null; B.routing = null; changed(); };
$('b-test').onclick = () => { if (B.verdict === 'ok') { sfx.wake(); play({ ...B.level, name: B.level.name }, 'test', 'Test run'); } };
$('b-lock').onclick = async () => {
  if (rolledOver()) { show('home'); return; } // yesterday's parts can't be published tonight
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
  // (without the server, this device's memory decides: no tips seen means a first visit)
  const firstVisit = INIT ? !Object.keys(progress).length : !Object.keys(tipsSeen).length;
  if (view === 'home' && firstVisit) { playHouse(0); return; }
  refresh();
}
async function submitAttempt(key, moves) {
  try {
    const rsp = await api(Endpoint.Attempt, { key, moves });
    progress[key] = rsp.progress;
    const was = INIT?.streak;
    if (INIT) INIT.streak = rsp.streak;
    if (rsp.rank && G.over === 'won' && !$('overlay').hidden) {
      const { others, slower } = rsp.rank, el = document.createElement('div'); el.className = 'rank';
      const them = `${others} other ${others === 1 ? 'thief' : 'thieves'}`;
      el.textContent = others === 0 ? 'First to crack it!'
        : slower > 0 ? `Fewer moves than ${Math.round(100 * slower / others)}% of the ${them} who cracked it.`
        : rsp.moves <= G.best ? `Tied for the fewest moves with ${them}.`
        : `Every other thief who cracked it was as quick or quicker. A perfect run takes ${G.best}.`;
      $('overlay').querySelector('.extras')?.appendChild(el);
    }
    if (rsp.result === 'won' && rsp.streak.tonight && !was?.tonight && G.over === 'won' && !$('overlay').hidden) {
      const el = document.createElement('div'); el.className = 'streak';
      el.textContent = rsp.streak.count === 1 ? 'Streak started. Crack a vault tomorrow night to keep it going.' : `${rsp.streak.count} nights in a row!`;
      $('overlay').querySelector('.extras')?.appendChild(el);
    }
    if (INIT) {
      if (INIT.house[key]) INIT.house[key] = rsp.stats;
      for (const v of [INIT.mine, ...INIT.others]) if (v && v.key === key) v.stats = rsp.stats;
    }
    if (view === 'play' && G.key === key) renderPlay();
  } catch (e) { toast(e.message); }
}
function refresh() { if (view === 'home') renderHome(); else if (view === 'play') renderPlay(); else if (view === 'build') check(); }
function toast(t) { showToast(t); }
// How to play: a card with every rule, open any time from the ? button in the header.
$('help').onclick = () => { sfx.wake(); $('howto').hidden = false; $('howto-close').focus(); };
$('howto-close').onclick = () => { $('howto').hidden = true; $('help').focus(); };
$('howto').onclick = e => { if (e.target === $('howto')) $('howto').hidden = true; };
addEventListener('keydown', e => { if (e.key === 'Escape' && !$('howto').hidden) { $('howto').hidden = true; $('help').focus(); } });

// ---------- your run as a GIF comment ----------
// While something moves on the board, keep small copies of it (thinking time is skipped).
const CAP_W = 270; // wide enough to read in a Reddit comment
function capture(now) {
  const moving = G.anim < 1 || G.pebbleFx || G.barks.some(b => now >= b.t0) || (G.endAt && now - G.endAt < 1100);
  const first = !G.frames.length;
  if (!first && (!moving || now - G.lastCap < 120)) return;
  if (G.endAt && now - G.endAt > 1100) return;
  // snapshots are taken off the main thread (no read-back stall), small, and only while something moves
  const cv = $('board'), h = Math.round(CAP_W * cv.height / cv.width), rec = { bmp: null, delay: first ? 700 : 120, h };
  G.frames.push(rec);
  if (G.frames.length > 160) G.frames.splice(1, 1)[0].bmp?.close?.();
  G.lastCap = now;
  createImageBitmap(cv, { resizeWidth: CAP_W, resizeHeight: h, resizeQuality: 'low' }).then(b => { rec.bmp = b; }).catch(() => {});
}
function gifDataUrl() {
  let fr = G.frames.filter(f => f.bmp);
  if (fr.length < 2) return null;
  const w = CAP_W, h = fr[0].h, bar = 36, H = h + bar, res = G.result || { status: 'play', moves: G.moves };
  const text = `VAULT · ${G.L.name} · ${res.status === 'won' ? `cracked in ${res.moves}` : `caught on move ${res.moves}`}`;
  const c = document.createElement('canvas'); c.width = w; c.height = H; const x = c.getContext('2d', { willReadFrequently: true });
  for (let tries = 0; tries < 4; tries++) {
    const frames = fr.map((f, i) => {
      x.fillStyle = C.night; x.fillRect(0, 0, w, H);
      x.drawImage(f.bmp, 0, 0, w, h);
      x.fillStyle = res.status === 'caught' ? C.laser : C.gem; x.fillRect(0, h, w, 3);
      x.fillStyle = C.text; x.font = `600 15px ${css('--body')}`; x.textAlign = 'center'; x.fillText(text, w / 2, h + 24, w - 14);
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
  btn.disabled = true; btn.textContent = 'Making your GIF…';
  // let the label paint before the encoder holds the main thread for a moment
  await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
  try {
    let gif = null; try { gif = gifDataUrl(); } catch {}
    btn.textContent = 'Posting…';
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
  behind: 'That guard isn’t facing you. Walk into them from behind or the side to knock them out.',
  pebble: 'This guard faces you. Tap Pebble and throw it past them: they’ll turn to look.',
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
  const el = $('coach'); el.textContent = TIPS[k]; el.hidden = false; $('crowd').hidden = true;
  return true;
}
function coach() {
  const el = $('coach');
  // the opening tip makes way as soon as you move, so a warning can take its place
  const hide = () => { el.hidden = true; coachState.tip = null; $('crowd').hidden = false; };
  if (coachState.tip === 'move' && G.moves >= 1) hide();
  if (coachState.tip && (G.over || G.moves - coachState.moves >= 2) && performance.now() - coachState.at > 2500) hide();
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
        if (!soundOn) this.ac.suspend?.(); // muted last visit: don't start the clock at all
      } catch {}
    }
    // a muted or hidden game keeps its audio clock stopped (no work, no battery)
    if (soundOn && !document.hidden) this.ac?.resume?.();
  },
  tone(f, d, type = 'sine', v = 0.12, f2) {
    const a = this.ac; if (!a) return; const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + d + 0.02);
  },
  // a soft burst of filtered noise: footfalls, thuds, scuffs
  thud(freq, dur, v) {
    const a = this.ac; if (!a) return; const t = a.currentTime, n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = v;
    src.buffer = buf; src.connect(f).connect(g).connect(this.out); src.start(t);
  },
  // footsteps alternate feet and never sound quite the same twice
  foot: 0,
  step() { this.foot ^= 1; const v = 0.85 + Math.random() * 0.3; this.thud(this.foot ? 520 : 440, 0.07, 0.22 * v); this.tone((this.foot ? 190 : 165) * v, 0.05, 'triangle', 0.05, 110); },
  knock() { this.thud(260, 0.22, 0.6); this.tone(120, 0.25, 'sine', 0.16, 45); setTimeout(() => this.tone(1500, 0.06, 'triangle', 0.04, 1200), 140); },
  // a guard's 'hm?': two little rising tones
  hm() { this.tone(230, 0.09, 'triangle', 0.07, 210); setTimeout(() => this.tone(260, 0.14, 'triangle', 0.07, 330), 100); },
  alarm() { this.tone(880, 0.16, 'sawtooth', 0.08); setTimeout(() => this.tone(660, 0.22, 'sawtooth', 0.08), 170); this.thud(180, 0.3, 0.35); },
  // a crack: a rising arpeggio and a shimmer of high notes
  win() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.32, 'triangle', 0.09), i * 70));
    for (let i = 0; i < 6; i++) setTimeout(() => this.tone(2093 + Math.random() * 1200, 0.12, 'sine', 0.025), 300 + i * 45);
  },
  place(erase) { erase ? this.tone(300, 0.08, 'triangle', 0.06, 160) : (this.thud(900, 0.05, 0.25), this.tone(420, 0.06, 'triangle', 0.05, 600)); },
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
function renderSound() { const b = $('snd'); b.textContent = soundOn ? 'Sound on' : 'Sound off'; b.setAttribute('aria-pressed', String(soundOn)); b.title = soundOn ? 'Tap to mute' : 'Tap to turn sound on'; }
$('snd').onclick = () => {
  soundOn = !soundOn; try { localStorage.setItem('vault:sound', soundOn ? 'on' : 'off'); } catch {}
  sfx.wake(); if (sfx.out) sfx.out.gain.setTargetAtTime(soundOn ? 1 : 0, sfx.ac.currentTime, 0.05);
  if (!soundOn && sfx.ac) setTimeout(() => { if (!soundOn) sfx.ac.suspend?.(); }, 250); // after the fade
  renderSound();
};
// scrolled away, app in the background, phone locked: the music stops, and picks up again on return
document.addEventListener('visibilitychange', () => {
  if (!sfx.ac) return;
  if (document.hidden) sfx.ac.suspend?.(); else if (soundOn) sfx.ac.resume?.();
});
addEventListener('pointerdown', () => sfx.wake(), { once: true });
renderSound();

// ---------- loop ----------
// Full frame rate while anything moves or the player is touching the game; when the board is just
// sitting there (torch flicker, gem sparkle), 30 fps looks the same and halves the work and the battery.
let lastActive = 0, lastDraw = 0;
const active = () => { lastActive = performance.now(); };
for (const t of ['keydown', 'pointerdown', 'pointermove', 'wheel', 'resize']) addEventListener(t, active, { passive: true, capture: true });
function calm(now) {
  if (now - lastActive < 2500) return false;
  if (view === 'play') return G.anim >= 1 && G.queue === null && !G.pebbleFx && !FX.parts.length && !FX.shake && !FX.flash && !FX.punch && !G.barks.length;
  if (view === 'build') return !BFX.rings.length && !BFX.parts.length && !B.painting;
  return true;
}
function frame(now) {
  requestAnimationFrame(frame);
  if (calm(now) && now - lastDraw < 30) return;
  lastDraw = now;
  if (view === 'play' && G.V) {
    if (G.anim < 1) G.anim = Math.min(1, (now - G.a0) / ANIM_MS);
    if (G.anim >= 1 && G.queue !== null && !G.over) { const m = G.queue; G.queue = null; move(m); }
    drawPlay(now); capture(now); coach();
  }
  if (view === 'build') drawBuilder(now);
}
addEventListener('resize', () => { if (view === 'play') P.size(G.V); if (view === 'build') BP.size({ w: W7, h: H9 }); });
$('night').textContent = 'Night ' + (dayNo + 1);
show('home'); requestAnimationFrame(frame); void load(); warmBests();
