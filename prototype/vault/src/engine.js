// VAULT rules engine. Pure and deterministic, shared by the page and the solver.
// Turn order: you act (move, wait or throw a pebble), then everything else moves, then we check if you were seen.
//
// State: { pos, t, ko, peb, gs, status }
//   ko   bitmask of knocked-out guards
//   peb  pebbles left
//   gs   per guard [off, frozen, face, frozenNow]: `off` is how many turns its patrol has been paused,
//        so its place on the route is seq[(t - off) % len]. A pebble freezes a guard for 2 turns,
//        facing the noise.
const DIRS = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
const dirOf = (a, b) => b[0] > a[0] ? 'R' : b[0] < a[0] ? 'L' : b[1] > a[1] ? 'D' : 'U';
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const PEBBLE_RANGE = 4, HEARING = 3, FREEZE = 2;

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
  const V = { w, h, walls, start, gem, guards, lasers, cams, name: L.name, pebbles: L.pebbles ?? 1 };
  for (const c of cams) walls.add(c.at.join(','));
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
  seq.push([...p[p.length - 1], dirOf(p[p.length - 1], p[p.length - 2])]);
  for (let i = p.length - 2; i > 0; i--) seq.push([...p[i], dirOf(p[i], p[i - 1])]);
  seq.push([...p[0], dirOf(p[1], p[0])]);
  seq.push([...p[0], dirOf(p[0], p[1])]);
  return seq;
}
const blocked = (V, x, y) => x < 0 || y < 0 || x >= V.w || y >= V.h || V.walls.has(x + ',' + y);
function ray(V, from, dir, n) {
  const out = []; let [x, y] = from; const [dx, dy] = DIRS[dir];
  for (let k = 0; k < n; k++) { x += dx; y += dy; if (blocked(V, x, y)) break; out.push([x, y]); }
  return out;
}
const mod = (a, n) => ((a % n) + n) % n;
const laserOn = (l, t) => ((t + (l.phase || 0)) % (l.on + l.off)) < l.on;
const camDir = (c, t) => c.dirs[t % c.dirs.length];
const startState = V => ({ pos: V.start, t: 0, ko: 0, peb: V.pebbles, gs: V.guards.map(() => [0, 0, 'D', 0]), status: 'play' });
// Where a guard is and which way it faces in state s.
function guardPos(g, s) {
  const [off, , face, fz] = s.gs[g.i], [x, y, f] = g.seq[mod(s.t - off, g.seq.length)];
  return [x, y, fz ? face : f];
}
// Advance every guard one turn (patrol on, or stay frozen facing a noise).
function advanceGuards(gs) {
  return gs.map(([off, fr, face]) => fr > 0 ? [off + 1, fr - 1, face, 1] : [off, 0, face, 0]);
}

// Everything that can see or burn you in state s.
function danger(V, s) {
  const tiles = new Map();
  const mark = (p, cause) => { const k = p[0] + ',' + p[1]; if (!tiles.has(k)) tiles.set(k, cause); };
  V.guards.forEach(g => { if (s.ko & (1 << g.i)) return; const [x, y, f] = guardPos(g, s); for (const p of ray(V, [x, y], f, g.see)) mark(p, 'guard'); });
  V.cams.forEach(c => { for (const p of ray(V, c.at, camDir(c, s.t), c.see)) mark(p, 'camera'); });
  V.lasers.forEach(l => { if (laserOn(l, s.t)) for (const p of l.beam) mark(p, 'laser'); });
  return tiles;
}
// Tiles a pebble can land on: straight lines from you, up to 4 tiles, stopped by walls.
function pebbleTargets(V, s) {
  if (!s.peb) return [];
  return ['U', 'D', 'L', 'R'].flatMap(d => ray(V, s.pos, d, PEBBLE_RANGE)).filter(p => !same(p, V.gem));
}
// Guards close enough to hear a pebble at p (and not knocked out).
function hearers(V, s, p) {
  return V.guards.filter(g => { if (s.ko & (1 << g.i)) return false; const [x, y] = guardPos(g, s); return Math.abs(x - p[0]) + Math.abs(y - p[1]) <= HEARING && !(x === p[0] && y === p[1]); });
}
// One turn. move = 'U'|'D'|'L'|'R'|'W' (wait) or {pebble:[x,y]}.
// Returns null for an illegal move, else the next state with status play|caught|won (+ cause, by, knocked, heard).
function step(V, s, move) {
  let pos = s.pos, ko = s.ko, peb = s.peb, gs = s.gs, knocked = -1, heard = [];
  if (typeof move === 'object') {
    const p = move.pebble;
    if (!peb || !pebbleTargets(V, s).some(q => same(q, p))) return null;
    peb--;
    heard = hearers(V, s, p).map(g => g.i);
    gs = gs.map((st, i) => {
      if (!heard.includes(i)) return st;
      const [x, y] = guardPos(V.guards[i], s), dx = p[0] - x, dy = p[1] - y;
      const face = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U');
      return [st[0], FREEZE, face, st[3]];
    });
  } else if (move !== 'W') {
    const [dx, dy] = DIRS[move], np = [pos[0] + dx, pos[1] + dy];
    if (blocked(V, np[0], np[1])) return null;
    for (const g of V.guards) {
      if (ko & (1 << g.i)) continue;
      const [gx, gy, f] = guardPos(g, s);
      if (gx === np[0] && gy === np[1]) {
        const [fx, fy] = DIRS[f];
        if (gx + fx === pos[0] && gy + fy === pos[1]) return { ...s, pos: np, t: s.t + 1, status: 'caught', cause: 'guard', by: [gx, gy] };
        ko |= 1 << g.i; knocked = g.i;
      }
    }
    pos = np;
  }
  const n = { pos, t: s.t + 1, ko, peb, gs: advanceGuards(gs), status: 'play', knocked, heard };
  if (same(pos, V.gem)) return { ...n, status: 'won' };
  const mid = { ...s, gs, ko };
  for (const g of V.guards) {
    if (ko & (1 << g.i)) continue;
    const a = guardPos(g, mid), b = guardPos(g, n);
    // the guard walks onto you, or you and the guard swap tiles
    if ((b[0] === pos[0] && b[1] === pos[1]) || (a[0] === pos[0] && a[1] === pos[1] && b[0] === s.pos[0] && b[1] === s.pos[1]))
      return { ...n, status: 'caught', cause: 'guard', by: [b[0], b[1]] };
  }
  const d = danger(V, n).get(pos[0] + ',' + pos[1]);
  if (d) return { ...n, status: 'caught', cause: d };
  return n;
}
function cycle(V) {
  const gcd = (a, b) => b ? gcd(b, a % b) : a, lcm = (a, b) => a / gcd(a, b) * b;
  let L = 1;
  V.guards.forEach(g => L = lcm(L, g.seq.length));
  V.cams.forEach(c => L = lcm(L, c.dirs.length));
  V.lasers.forEach(l => L = lcm(L, l.on + l.off));
  return L;
}
// Breadth-first search for the fewest-turns crack. Returns the list of moves or null.
// usePebbles=false finds the best run without throwing anything.
function solve(V, { maxT = 150, usePebbles = true } = {}) {
  const L = cycle(V), start = startState(V);
  if (!usePebbles) start.peb = 0;
  // a guard's identity is its place on the route plus its freeze, not its raw pause count
  const key = s => s.pos + '|' + mod(s.t, L) + '|' + s.ko + '|' + s.peb + '|' + s.gs.map((g, i) => mod(s.t - g[0], V.guards[i].seq.length) + ':' + g[1] + ':' + (g[1] || g[3] ? g[2] : '') + ':' + g[3]).join(',');
  const seen = new Set([key(start)]), q = [[start, []]];
  for (let head = 0; head < q.length; head++) {
    const [s, path] = q[head];
    if (s.t >= maxT) continue;
    const moves = ['U', 'D', 'L', 'R', 'W', ...pebbleTargets(V, s).map(p => ({ pebble: p }))];
    for (const m of moves) {
      const n = step(V, s, m); if (!n || n.status === 'caught') continue;
      if (n.status === 'won') return path.concat([m]);
      const k = key(n); if (seen.has(k)) continue; seen.add(k); q.push([n, path.concat([m])]);
    }
    if (q.length > 400000) return null; // give up on pathological vaults
  }
  return null;
}
if (typeof module !== 'undefined') module.exports = { parse, step, danger, solve, guardPos, startState, pebbleTargets, hearers, laserOn, camDir, cycle, ray, DIRS, HEARING };
