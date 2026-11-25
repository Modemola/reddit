// VAULT rules engine. Pure and deterministic, shared by the client (play, draw, build)
// and the server (which replays every submitted run, so nobody can fake a crack).
//
// Turn order: you act (move, wait or throw a pebble), then everything else moves,
// then we check whether you were seen.

export type Dir = 'U' | 'D' | 'L' | 'R'
export type XY = [number, number]
export type Move = Dir | 'W' | {pebble: XY}

export type GuardDef = {path: XY[]; see?: number; face?: Dir}
export type LaserDef = {
  at: XY
  dir: Dir
  on: number
  off: number
  phase?: number
}
export type CamDef = {at: XY; dirs: Dir[]; see?: number}
export type Level = {
  name: string
  map: string[]
  guards?: GuardDef[]
  lasers?: LaserDef[]
  cams?: CamDef[]
  pebbles?: number
}

export type Guard = {i: number; see: number; seq: [number, number, Dir][]}
export type Laser = LaserDef & {beam: XY[]}
export type Cam = CamDef & {see: number}
export type Vault = {
  w: number
  h: number
  walls: Set<string>
  rawWalls: Set<string>
  start: XY
  gem: XY
  guards: Guard[]
  lasers: Laser[]
  cams: Cam[]
  name: string
  pebbles: number
}

/** Per guard: [patrol pause count, frozen turns left, facing while frozen, frozen right now (0|1)]. */
export type GuardState = [number, number, Dir, number]
export type Status = 'play' | 'caught' | 'won'
export type State = {
  pos: XY
  t: number
  ko: number
  peb: number
  gs: GuardState[]
  status: Status
  cause?: 'guard' | 'laser' | 'camera'
  by?: XY
  knocked?: number
  heard?: number[]
}

export const DIRS: Record<Dir, XY> = {
  U: [0, -1],
  D: [0, 1],
  L: [-1, 0],
  R: [1, 0],
}
export const PEBBLE_RANGE = 4
export const HEARING = 3
const FREEZE = 2

const dirOf = (a: XY, b: XY): Dir =>
  b[0] > a[0] ? 'R' : b[0] < a[0] ? 'L' : b[1] > a[1] ? 'D' : 'U'
const same = (a: XY, b: XY) => a[0] === b[0] && a[1] === b[1]
const mod = (a: number, n: number) => ((a % n) + n) % n

export function parse(L: Level): Vault {
  const rows = L.map
  const h = rows.length
  const w = rows[0]?.length ?? 0
  const walls = new Set<string>()
  const rawWalls = new Set<string>()
  let start: XY = [0, 0]
  let gem: XY = [0, 0]
  rows.forEach((r, y) => {
    ;[...r].forEach((c, x) => {
      if (c === '#') {
        walls.add(`${x},${y}`)
        rawWalls.add(`${x},${y}`)
      }
      if (c === 'S') start = [x, y]
      if (c === 'G') gem = [x, y]
    })
  })
  const guards: Guard[] = (L.guards ?? []).map((g, i) => ({
    i,
    see: g.see ?? 2,
    seq: patrol(g),
  }))
  const lasers: Laser[] = (L.lasers ?? []).map(l => ({...l, beam: []}))
  const cams: Cam[] = (L.cams ?? []).map(c => ({...c, see: c.see ?? 3}))
  const V: Vault = {
    w,
    h,
    walls,
    rawWalls,
    start,
    gem,
    guards,
    lasers,
    cams,
    name: L.name,
    pebbles: L.pebbles ?? 1,
  }
  for (const c of cams) walls.add(c.at.join(','))
  for (const l of lasers) {
    walls.add(l.at.join(','))
    l.beam = ray(V, l.at, l.dir, 99)
  }
  return V
}

/** A guard walks its route back and forth, spending a turn turning round at each end. */
function patrol(g: GuardDef): [number, number, Dir][] {
  // indexes below stay inside the path, which has at least one tile
  const p = g.path
  const q = (i: number): XY => p[i] as XY
  if (p.length === 1) return [[q(0)[0], q(0)[1], g.face ?? 'D']]
  const seq: [number, number, Dir][] = []
  const at = (q: XY, d: Dir): [number, number, Dir] => [q[0], q[1], d]
  for (let i = 0; i < p.length - 1; i++)
    seq.push(at(q(i), dirOf(q(i), q(i + 1))))
  const last = p.length - 1
  seq.push(at(q(last), dirOf(q(last - 1), q(last))))
  seq.push(at(q(last), dirOf(q(last), q(last - 1))))
  for (let i = last - 1; i > 0; i--) seq.push(at(q(i), dirOf(q(i), q(i - 1))))
  seq.push(at(q(0), dirOf(q(1), q(0))))
  seq.push(at(q(0), dirOf(q(0), q(1))))
  return seq
}

export const blocked = (V: Vault, x: number, y: number) =>
  x < 0 || y < 0 || x >= V.w || y >= V.h || V.walls.has(`${x},${y}`)

export function ray(V: Vault, from: XY, dir: Dir, n: number): XY[] {
  const out: XY[] = []
  let [x, y] = from
  const [dx, dy] = DIRS[dir]
  for (let k = 0; k < n; k++) {
    x += dx
    y += dy
    if (blocked(V, x, y)) break
    out.push([x, y])
  }
  return out
}

export const laserOn = (l: LaserDef, t: number) =>
  (t + (l.phase ?? 0)) % (l.on + l.off) < l.on
export const camDir = (c: CamDef, t: number): Dir =>
  c.dirs[t % c.dirs.length] ?? 'D'

export const startState = (V: Vault): State => ({
  pos: V.start,
  t: 0,
  ko: 0,
  peb: V.pebbles,
  gs: V.guards.map((): GuardState => [0, 0, 'D', 0]),
  status: 'play',
})

/** Where a guard is and which way it faces in state s. */
export function guardPos(
  g: Guard,
  s: Pick<State, 't' | 'gs'>,
): [number, number, Dir] {
  const [off, , face, fz] = s.gs[g.i] ?? [0, 0, 'D', 0]
  const [x, y, f] = g.seq[mod(s.t - off, g.seq.length)] ?? [0, 0, 'D']
  return [x, y, fz ? face : f]
}

/** Every guard moves on one turn, or stays frozen facing a noise. */
export function advanceGuards(gs: GuardState[]): GuardState[] {
  return gs.map(
    ([off, fr, face]): GuardState =>
      fr > 0 ? [off + 1, fr - 1, face, 1] : [off, 0, face, 0],
  )
}

/** Every tile that can see or burn you in state s, with what does it. */
export function danger(
  V: Vault,
  s: Pick<State, 't' | 'gs' | 'ko'>,
): Map<string, 'guard' | 'laser' | 'camera'> {
  const tiles = new Map<string, 'guard' | 'laser' | 'camera'>()
  const mark = (p: XY, cause: 'guard' | 'laser' | 'camera') => {
    const k = `${p[0]},${p[1]}`
    if (!tiles.has(k)) tiles.set(k, cause)
  }
  for (const g of V.guards) {
    if (s.ko & (1 << g.i)) continue
    const [x, y, f] = guardPos(g, s)
    for (const p of ray(V, [x, y], f, g.see)) mark(p, 'guard')
  }
  for (const c of V.cams)
    for (const p of ray(V, c.at, camDir(c, s.t), c.see)) mark(p, 'camera')
  for (const l of V.lasers)
    if (laserOn(l, s.t)) for (const p of l.beam) mark(p, 'laser')
  return tiles
}

/** Tiles a pebble can land on: straight lines from you, up to 4 tiles, stopped by walls. */
export function pebbleTargets(V: Vault, s: State): XY[] {
  if (!s.peb) return []
  return (['U', 'D', 'L', 'R'] as const)
    .flatMap(d => ray(V, s.pos, d, PEBBLE_RANGE))
    .filter(p => !same(p, V.gem))
}

/** Guards close enough to hear a pebble at p. */
export function hearers(V: Vault, s: State, p: XY): Guard[] {
  return V.guards.filter(g => {
    if (s.ko & (1 << g.i)) return false
    const [x, y] = guardPos(g, s)
    return (
      Math.abs(x - p[0]) + Math.abs(y - p[1]) <= HEARING &&
      !(x === p[0] && y === p[1])
    )
  })
}

/** One turn. Returns null for an illegal move. */
export function step(V: Vault, s: State, move: Move): State | null {
  let pos = s.pos
  let ko = s.ko
  let peb = s.peb
  let gs = s.gs
  let knocked = -1
  let heard: number[] = []
  if (typeof move === 'object') {
    const p = move.pebble
    if (!peb || !pebbleTargets(V, s).some(q => same(q, p))) return null
    peb--
    heard = hearers(V, s, p).map(g => g.i)
    gs = gs.map((st, i): GuardState => {
      if (!heard.includes(i)) return st
      const guard = V.guards[i]
      if (!guard) return st
      const [x, y] = guardPos(guard, s)
      const dx = p[0] - x
      const dy = p[1] - y
      const face: Dir =
        Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : dy > 0 ? 'D' : 'U'
      return [st[0], FREEZE, face, st[3]]
    })
  } else if (move !== 'W') {
    const [dx, dy] = DIRS[move]
    const np: XY = [pos[0] + dx, pos[1] + dy]
    if (blocked(V, np[0], np[1])) return null
    for (const g of V.guards) {
      if (ko & (1 << g.i)) continue
      const [gx, gy, f] = guardPos(g, s)
      if (gx === np[0] && gy === np[1]) {
        const [fx, fy] = DIRS[f]
        // walking into a guard's face gets you caught; from behind or the side knocks them out
        if (gx + fx === pos[0] && gy + fy === pos[1])
          return {
            ...s,
            pos: np,
            t: s.t + 1,
            status: 'caught',
            cause: 'guard',
            by: [gx, gy],
          }
        ko |= 1 << g.i
        knocked = g.i
      }
    }
    pos = np
  }
  const n: State = {
    pos,
    t: s.t + 1,
    ko,
    peb,
    gs: advanceGuards(gs),
    status: 'play',
    knocked,
    heard,
  }
  if (same(pos, V.gem)) return {...n, status: 'won'}
  const mid = {t: s.t, gs}
  for (const g of V.guards) {
    if (ko & (1 << g.i)) continue
    const a = guardPos(g, mid)
    const b = guardPos(g, n)
    // the guard walks onto you, or you and the guard swap tiles
    if (
      (b[0] === pos[0] && b[1] === pos[1]) ||
      (a[0] === pos[0] &&
        a[1] === pos[1] &&
        b[0] === s.pos[0] &&
        b[1] === s.pos[1])
    )
      return {...n, status: 'caught', cause: 'guard', by: [b[0], b[1]]}
  }
  const d = danger(V, n).get(`${pos[0]},${pos[1]}`)
  if (d) return {...n, status: 'caught', cause: d}
  return n
}

function cycle(V: Vault): number {
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)
  const lcm = (a: number, b: number) => (a / gcd(a, b)) * b
  let L = 1
  for (const g of V.guards) L = lcm(L, g.seq.length)
  for (const c of V.cams) L = lcm(L, c.dirs.length)
  for (const l of V.lasers) L = lcm(L, l.on + l.off)
  return L
}

/** Breadth-first search for the fewest-turns crack, or null if the vault can't be cracked. */
export function solve(
  V: Vault,
  {maxT = 150, usePebbles = true} = {},
): Move[] | null {
  const L = cycle(V)
  const start = startState(V)
  if (!usePebbles) start.peb = 0
  const key = (s: State) =>
    `${s.pos}|${mod(s.t, L)}|${s.ko}|${s.peb}|${s.gs
      .map(
        (g, i) =>
          `${mod(s.t - g[0], V.guards[i]?.seq.length ?? 1)}:${g[1]}:${g[1] || g[3] ? g[2] : ''}:${g[3]}`,
      )
      .join(',')}`
  const seen = new Set([key(start)])
  const q: [State, Move[]][] = [[start, []]]
  for (let head = 0; head < q.length; head++) {
    const item = q[head]
    if (!item) break
    const [s, path] = item
    if (s.t >= maxT) continue
    const moves: Move[] = [
      'U',
      'D',
      'L',
      'R',
      'W',
      ...pebbleTargets(V, s).map(p => ({pebble: p})),
    ]
    for (const m of moves) {
      const n = step(V, s, m)
      if (!n || n.status === 'caught') continue
      if (n.status === 'won') return [...path, m]
      const k = key(n)
      if (seen.has(k)) continue
      seen.add(k)
      q.push([n, [...path, m]])
    }
    if (q.length > 400000) return null
  }
  return null
}

/** Replay a list of moves. Stops at the first illegal move, catch or crack. */
export function replay(
  V: Vault,
  moves: Move[],
): {state: State; used: number; illegal: boolean} {
  let s = startState(V)
  let used = 0
  for (const m of moves) {
    const n = step(V, s, m)
    if (!n) return {state: s, used, illegal: true}
    s = n
    used++
    if (s.status !== 'play') break
  }
  return {state: s, used, illegal: false}
}
