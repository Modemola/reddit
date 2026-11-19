// VAULT rules engine. Pure and deterministic, shared by the page and the solver.
// Turn order: you move (or wait), then everything else moves, then we check if you were seen.
const DIRS = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
const OPP = { U: 'D', D: 'U', L: 'R', R: 'L' };
const dirOf = (a, b) => b[0] > a[0] ? 'R' : b[0] < a[0] ? 'L' : b[1] > a[1] ? 'D' : 'U';
const same = (a, b) => a[0] === b[0] && a[1] === b[1];

function parse(L) {
  const rows = L.map, h = rows.length, w = rows[0].length, walls = new Set();
  let start, gem;
  rows.forEach((r, y) => [...r].forEach((c, x) => {
    if (c === '#') walls.add(x + ',' + y);
    if (c === 'S') start = [x, y];
    if (c === 'G') gem = [x, y];
  }));
  const guards = (L.guards || []).map((g, i) => ({ i, see: g.see ?? 2, seq: patrol(g) }));
  const lasers = (L.lasers || []).map(l => ({ ...l, beam: [] }));
  const cams = (L.cams || []).map(c => ({ ...c, see: c.see ?? 3 }));
  const V = { w, h, walls, start, gem, guards, lasers, cams, name: L.name, par: L.par };
  for (const c of cams) walls.add(c.at.join(','));            // cameras block movement
  for (const l of lasers) { walls.add(l.at.join(',')); l.beam = ray(V, l.at, l.dir, 99); }
  return V;
}
// A guard walks its route back and forth. At each end it spends a turn turning round.
function patrol(g) {
  const p = g.path;
  if (p.length === 1) return [[...p[0], g.face || 'D']];
  const seq = [];
  for (let i = 0; i < p.length - 1; i++) seq.push([...p[i], dirOf(p[i], p[i + 1])]);
  seq.push([...p[p.length - 1], dirOf(p[p.length - 2], p[p.length - 1])]);
  seq.push([...p[p.length - 1], dirOf(p[p.length - 1], p[p.length - 2])]); // turn
  for (let i = p.length - 2; i > 0; i--) seq.push([...p[i], dirOf(p[i], p[i - 1])]);
  seq.push([...p[0], dirOf(p[1], p[0])]);
  seq.push([...p[0], dirOf(p[0], p[1])]); // turn
  return seq;
}
const blocked = (V, x, y) => x < 0 || y < 0 || x >= V.w || y >= V.h || V.walls.has(x + ',' + y);
function ray(V, from, dir, n) {
  const out = []; let [x, y] = from; const [dx, dy] = DIRS[dir];
  for (let k = 0; k < n; k++) { x += dx; y += dy; if (blocked(V, x, y)) break; out.push([x, y]); }
  return out;
}
const guardAt = (g, t) => g.seq[t % g.seq.length];
const laserOn = (l, t) => ((t + (l.phase || 0)) % (l.on + l.off)) < l.on;
const camDir = (c, t) => c.dirs[t % c.dirs.length];

// Everything that can see or burn you at time t (ko = knocked-out guard ids).
function danger(V, t, ko) {
  const tiles = new Map(); // "x,y" -> cause
  const mark = (p, cause) => { const k = p[0] + ',' + p[1]; if (!tiles.has(k)) tiles.set(k, cause); };
  V.guards.forEach(g => { if (ko & (1 << g.i)) return; const [x, y, f] = guardAt(g, t); for (const p of ray(V, [x, y], f, g.see)) mark(p, 'guard'); });
  V.cams.forEach(c => { for (const p of ray(V, c.at, camDir(c, t), c.see)) mark(p, 'camera'); });
  V.lasers.forEach(l => { if (laserOn(l, t)) for (const p of l.beam) mark(p, 'laser'); });
  return tiles;
}
// One turn. s = {pos, t, ko}. move = 'U'|'D'|'L'|'R'|'W'(wait).
// Returns null for an illegal move, else the next state with status play|caught|won.
function step(V, s, move) {
  let pos = s.pos, ko = s.ko, knocked = -1;
  if (move !== 'W') {
    const [dx, dy] = DIRS[move], np = [pos[0] + dx, pos[1] + dy];
    if (blocked(V, np[0], np[1])) return null;
    // walking into a guard from behind or the side knocks them out
    for (const g of V.guards) {
      if (ko & (1 << g.i)) continue;
      const [gx, gy, f] = guardAt(g, s.t);
      if (gx === np[0] && gy === np[1]) {
        const [fx, fy] = DIRS[f];
        if (gx + fx === pos[0] && gy + fy === pos[1]) return { pos: np, t: s.t + 1, ko, status: 'caught', cause: 'guard', by: [gx, gy] };
        ko |= 1 << g.i; knocked = g.i;
      }
    }
    pos = np;
  }
  const t = s.t + 1;
  if (same(pos, V.gem)) return { pos, t, ko, status: 'won', knocked };
  for (const g of V.guards) {
    if (ko & (1 << g.i)) continue;
    const a = guardAt(g, s.t), b = guardAt(g, t);
    if (same(b, pos) || (same(a, pos) && same(b, s.pos))) return { pos, t, ko, status: 'caught', cause: 'guard', by: [b[0], b[1]], knocked };
  }
  const d = danger(V, t, ko).get(pos[0] + ',' + pos[1]);
  if (d) return { pos, t, ko, status: 'caught', cause: d, knocked };
  return { pos, t, ko, status: 'play', knocked };
}
function cycle(V) {
  const gcd = (a, b) => b ? gcd(b, a % b) : a, lcm = (a, b) => a / gcd(a, b) * b;
  let L = 1;
  V.guards.forEach(g => L = lcm(L, g.seq.length));
  V.cams.forEach(c => L = lcm(L, c.dirs.length));
  V.lasers.forEach(l => L = lcm(L, l.on + l.off));
  return L;
}
// Breadth-first search for the fewest-moves crack. Returns the move list or null.
function solve(V, maxT = 80) {
  const L = cycle(V), start = { pos: V.start, t: 0, ko: 0 }, seen = new Set(), q = [[start, '']];
  const key = s => s.pos + '|' + (s.t % L) + '|' + s.ko;
  seen.add(key(start));
  while (q.length) {
    const [s, path] = q.shift();
    if (s.t >= maxT) continue;
    for (const m of ['U', 'D', 'L', 'R', 'W']) {
      const n = step(V, s, m); if (!n || n.status === 'caught') continue;
      if (n.status === 'won') return path + m;
      const k = key(n); if (seen.has(k)) continue; seen.add(k); q.push([n, path + m]);
    }
  }
  return null;
}
if (typeof module !== 'undefined') module.exports = { parse, step, danger, solve, guardAt, laserOn, camDir, cycle, DIRS };
