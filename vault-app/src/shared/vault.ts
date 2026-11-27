// Shared rules for nights, house vaults, the parts box and player-built vaults.
import {type Dir, type Level, parse, solve, type XY} from './engine.ts'

export const W = 7
export const H = 9
export const START: XY = [3, 8]

/** Night 1 is 2026-11-19 (UTC). A new night starts at midnight UTC. */
const EPOCH = Date.UTC(2026, 10, 19)
export const nightOf = (ms: number) =>
  Math.max(0, Math.floor((ms - EPOCH) / 864e5))

function hash(n: number): number {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return v - Math.floor(v)
}

export type Parts = {wall: number; guard: number; laser: number; cam: number}

/** Some nights have a theme that shapes the parts box. Most nights are ordinary. */
export type Theme = {name: string; line: string}
const THEMES: (Theme & {parts: Parts})[] = [
  {
    name: 'Laser Night',
    line: 'Lasers only, and plenty of them.',
    parts: {wall: 7, guard: 0, laser: 3, cam: 0},
  },
  {
    name: 'Double Patrol',
    line: 'Three guards and nothing else to hide behind.',
    parts: {wall: 6, guard: 3, laser: 0, cam: 0},
  },
  {
    name: 'All Eyes',
    line: 'Two cameras and a guard to work with them.',
    parts: {wall: 8, guard: 1, laser: 0, cam: 2},
  },
  {
    name: 'Lockdown',
    line: 'A maze of walls, one guard and one camera.',
    parts: {wall: 14, guard: 1, laser: 0, cam: 1},
  },
]
/** Themed nights come round twice a week (nights 3 and 6 of each week), cycling through the themes. */
export function themeFor(night: number): Theme | null {
  const week = Math.floor(night / 7)
  const day = night % 7
  if (day !== 2 && day !== 5) return null
  const t = THEMES[(week * 2 + (day === 5 ? 1 : 0)) % THEMES.length]
  return t ? {name: t.name, line: t.line} : null
}

/** Tonight's box of parts. Everyone gets the same one. */
export function partsFor(night: number): Parts {
  const theme = themeFor(night)
  if (theme) {
    const t = THEMES.find(x => x.name === theme.name)
    if (t) return {...t.parts}
  }
  const r = (i: number) => hash(night * 7.77 + i)
  const p = {
    wall: 6 + Math.floor(r(1) * 5),
    guard: 1 + Math.floor(r(2) * 2),
    laser: Math.floor(r(3) * 3),
    cam: Math.floor(r(4) * 2),
  }
  if (p.guard + p.laser + p.cam < 3) p.laser++
  return p
}

export const RHYTHMS: [number, number][] = [
  [2, 2],
  [1, 2],
  [2, 1],
  [1, 1],
  [3, 2],
]
export const SWEEPS: Dir[][] = [
  ['U', 'D'],
  ['L', 'R'],
  ['U', 'R', 'D', 'L'],
  ['U', 'L', 'D', 'R'],
]

/** Hand-designed, solver-verified vaults that teach the tricks. */
export const HOUSE: Level[] = [
  {
    name: 'The Lobby',
    map: [
      '#######',
      '###G###',
      '###.###',
      '#.....#',
      '###.###',
      '###.###',
      '#.....#',
      '###.###',
      '###S###',
    ],
    guards: [
      {
        path: [
          [1, 3],
          [2, 3],
          [3, 3],
          [4, 3],
          [5, 3],
        ],
      },
      {
        path: [
          [5, 6],
          [4, 6],
          [3, 6],
          [2, 6],
          [1, 6],
        ],
      },
    ],
  },
  {
    name: 'Red Lines',
    map: [
      '#######',
      '#..G..#',
      '#.....#',
      '#.....#',
      '#.....#',
      '#.....#',
      '#.....#',
      '#.....#',
      '###S###',
    ],
    lasers: [
      {at: [0, 2], dir: 'R', on: 2, off: 2, phase: 0},
      {at: [6, 4], dir: 'L', on: 2, off: 2, phase: 1},
      {at: [0, 6], dir: 'R', on: 2, off: 1, phase: 0},
    ],
  },
  {
    name: 'Loose Change',
    map: [
      '#######',
      '###G###',
      '###.###',
      '#.....#',
      '###.###',
      '###.###',
      '###.###',
      '###.###',
      '###S###',
    ],
    guards: [{path: [[3, 3]], face: 'D', see: 1}],
  },
  {
    name: 'Night Shift',
    map: [
      '#######',
      '#G....#',
      '#.###.#',
      '#.#...#',
      '#.#.#.#',
      '#...#.#',
      '#.###.#',
      '#.....#',
      '###S###',
    ],
    guards: [
      {
        path: [
          [1, 7],
          [1, 6],
          [1, 5],
          [1, 4],
          [1, 3],
          [1, 2],
        ],
        see: 3,
      },
      {
        path: [
          [5, 1],
          [5, 2],
          [5, 3],
          [5, 4],
          [5, 5],
          [5, 6],
          [5, 7],
        ],
        see: 3,
      },
    ],
  },
  {
    name: 'Eye in the Sky',
    map: [
      '#######',
      '#..G..#',
      '#.....#',
      '#.....#',
      '#.....#',
      '#.....#',
      '#.....#',
      '#.....#',
      '###S###',
    ],
    cams: [{at: [3, 4], dirs: ['U', 'R', 'D', 'L'], see: 3}],
    guards: [
      {
        path: [
          [1, 2],
          [2, 2],
          [3, 2],
          [4, 2],
          [5, 2],
        ],
        see: 1,
      },
    ],
  },
  {
    name: 'The Core',
    map: [
      '#######',
      '#..G..#',
      '#.#.#.#',
      '#.....#',
      '#.#.#.#',
      '#.....#',
      '#.#.#.#',
      '#.....#',
      '###S###',
    ],
    guards: [
      {
        path: [
          [1, 3],
          [2, 3],
          [3, 3],
          [4, 3],
          [5, 3],
        ],
        see: 2,
      },
      {
        path: [
          [5, 7],
          [5, 6],
          [5, 5],
          [4, 5],
          [3, 5],
          [2, 5],
          [1, 5],
        ],
        see: 2,
      },
    ],
    lasers: [{at: [3, 2], dir: 'U', on: 1, off: 2, phase: 0}],
    cams: [{at: [3, 6], dirs: ['U', 'D'], see: 1}],
  },
]

/** Keys for anything that can be played: house vault `h1`..`h6`, or a player's vault for a night. */
export const houseKey = (i: number) => `h${i + 1}`
export const playerKey = (owner: string, night: number) => `p_${owner}_${night}`

const isDir = (d: unknown): d is Dir =>
  d === 'U' || d === 'D' || d === 'L' || d === 'R'
/** A tile on the board (x across 0..W-1, y down 0..H-1). */
const isXY = (p: unknown): p is XY =>
  Array.isArray(p) &&
  p.length === 2 &&
  p.every(n => Number.isInteger(n) && n >= 0) &&
  (p[0] as number) < W &&
  (p[1] as number) < H

/** Control and formatting characters (zero-width, right-to-left overrides and the like). */
export const HIDDEN_CHARS = /[\p{Cc}\p{Cf}]/u

/** Checks the shape of a player vault and that it fits tonight's parts. Returns an error message or null. */
export function checkPlayerLevel(l: unknown, parts: Parts): string | null {
  if (!l || typeof l !== 'object') return 'it isn’t a vault'
  const v = l as Partial<Level>
  if (typeof v.name !== 'string' || !v.name.trim() || v.name.length > 24)
    return 'the name must be 1 to 24 characters'
  // invisible and direction-flipping characters could make a name pose as something else
  if (HIDDEN_CHARS.test(v.name))
    return 'the name has characters that can’t be shown'
  if (!Array.isArray(v.map) || v.map.length !== H)
    return 'the floor plan is damaged'
  if (
    !v.map.every(
      r => typeof r === 'string' && r.length === W && /^[#.SG]+$/.test(r),
    )
  )
    return 'the floor plan is damaged'
  const flat = v.map.join('')
  if (flat.split('S').length !== 2 || flat.split('G').length !== 2)
    return 'it needs exactly one entrance and one gem'
  if (v.map[START[1]]?.[START[0]] !== 'S')
    return 'the entrance must stay where it is'
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const border = x === 0 || y === 0 || x === W - 1 || y === H - 1
      const c = v.map[y]?.[x]
      if (border && c !== '#' && !(x === START[0] && y === START[1]))
        return 'the outer wall must stay closed'
    }
  const guards = v.guards ?? []
  const lasers = v.lasers ?? []
  const cams = v.cams ?? []
  if (!Array.isArray(guards) || !Array.isArray(lasers) || !Array.isArray(cams))
    return 'a part is damaged'
  if (
    guards.length > parts.guard ||
    lasers.length > parts.laser ||
    cams.length > parts.cam
  )
    return 'more parts than tonight’s box'
  if (
    !guards.every(
      g =>
        Array.isArray(g.path) &&
        g.path.length >= 1 &&
        g.path.length <= 6 &&
        g.path.every(isXY) &&
        (g.see === 2 || g.see === 3) &&
        (g.face === undefined || isDir(g.face)),
    )
  )
    return 'a guard’s route or settings are invalid'
  if (
    !lasers.every(
      x =>
        isXY(x.at) &&
        isDir(x.dir) &&
        RHYTHMS.some(([on, off]) => on === x.on && off === x.off) &&
        (x.phase === undefined || x.phase === 0),
    )
  )
    return 'a laser’s settings are invalid'
  if (
    !cams.every(
      c =>
        isXY(c.at) &&
        Array.isArray(c.dirs) &&
        SWEEPS.some(s => s.join() === c.dirs.join()) &&
        (c.see === undefined || c.see === 2),
    )
  )
    return 'a camera’s settings are invalid'
  // The same placement rules the builder uses, so a modified client can't publish what the builder can't make.
  const tile = ([x, y]: XY) => v.map?.[y]?.[x]
  const interiorFloor = (p: XY) =>
    p[0] > 0 && p[1] > 0 && p[0] < W - 1 && p[1] < H - 1 && tile(p) === '.'
  const key = (p: XY) => `${p[0]},${p[1]}`
  const taken = new Set<string>()
  for (const c of cams) {
    if (!interiorFloor(c.at) || taken.has(key(c.at)))
      return 'a camera must stand on open floor'
    taken.add(key(c.at))
  }
  for (const g of guards)
    for (const [i, p] of g.path.entries()) {
      const prev = g.path[i - 1]
      if (prev && Math.abs(p[0] - prev[0]) + Math.abs(p[1] - prev[1]) !== 1)
        return 'a guard’s route must go one tile at a time'
      if (!interiorFloor(p) || taken.has(key(p)))
        return 'a guard’s route must stay on open floor'
      taken.add(key(p))
    }
  for (const l of lasers) {
    if (tile(l.at) !== '#' || taken.has(key(l.at)))
      return 'a laser must be mounted on its own wall tile'
    taken.add(key(l.at))
  }
  // walls placed inside the vault, including ones a laser is mounted on
  let inner = 0
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) if (v.map[y]?.[x] === '#') inner++
  if (inner > parts.wall) return 'more walls than tonight’s box'
  return null
}

/** Fewest moves to crack, or 0 if it can't be cracked. */
export function bestMoves(l: Level): number {
  try {
    return solve(parse(l))?.length ?? 0
  } catch {
    return 0
  }
}

/**
 * How deadly a vault is, counted in people rather than attempts, so one player busting
 * the same vault fifty times can't push it up the list. Every crack counts against it.
 */
export function deadliness(s: {people: number; cracked: number}): number {
  const stumped = s.people - s.cracked
  return stumped - 2 * s.cracked
}

// ---------- the Daily Vault ----------

/** The key of a night's Daily Vault, the one official vault everyone plays that night. */
export const dailyKey = (night: number) => `d${night}`
export const dailyNight = (key: string): number | null => {
  const m = /^d(\d+)$/.exec(key)
  return m ? Number(m[1]) : null
}

/** A small seeded random generator, so a night always produces the same Daily Vault everywhere. */
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A night's Daily Vault: built from that night's parts, proven crackable by the solver, checked like a
 * player vault, and chosen for interest (every part used, a perfect run of 11 to 18 moves where possible).
 * Deterministic: the same night gives the same vault on the server and in the web preview.
 */
export function dailyVault(night: number): Level {
  const parts = partsFor(night)
  const rand = seeded(night * 2654435761 + 97)
  const rnd = (n: number) => Math.floor(rand() * n)
  let best: Level | null = null
  let bestScore = -1e9
  for (let attempt = 0; attempt < 60; attempt++) {
    const gem: XY = [1 + rnd(5), 1 + rnd(3)]
    const walls: XY[] = []
    const guards: NonNullable<Level['guards']> = []
    const cams: NonNullable<Level['cams']> = []
    const lasers: NonNullable<Level['lasers']> = []
    const used = (x: number, y: number) =>
      (x === gem[0] && y === gem[1]) ||
      walls.some(w => w[0] === x && w[1] === y) ||
      guards.some(g => g.path.some(p => p[0] === x && p[1] === y)) ||
      cams.some(c => c.at[0] === x && c.at[1] === y)
    const free = (x: number, y: number) =>
      x > 0 &&
      y > 0 &&
      x < W - 1 &&
      y < H - 1 &&
      !(x === START[0] && y >= H - 2) &&
      !used(x, y)
    for (let i = 0; i < parts.wall; i++) {
      const x = 1 + rnd(5)
      const y = 2 + rnd(5)
      if (free(x, y)) walls.push([x, y])
    }
    for (let i = 0; i < parts.guard; i++) {
      const horiz = rand() < 0.6
      const len = 2 + rnd(4)
      let x = 1 + rnd(5)
      let y = 1 + rnd(6)
      const path: XY[] = []
      for (let k = 0; k < len && free(x, y); k++) {
        path.push([x, y])
        if (horiz) x++
        else y++
      }
      if (path.length)
        guards.push({
          path,
          see: rand() < 0.3 ? 3 : 2,
          face: (['U', 'R', 'D', 'L'] as Dir[])[rnd(4)],
        })
    }
    for (let i = 0; i < parts.cam; i++) {
      const x = 1 + rnd(5)
      const y = 1 + rnd(6)
      if (free(x, y))
        cams.push({at: [x, y], dirs: SWEEPS[rnd(SWEEPS.length)] ?? ['U', 'D']})
    }
    for (let i = 0; i < parts.laser; i++) {
      const left = rand() < 0.5
      const y = 1 + rnd(7)
      if (lasers.some(l => l.at[1] === y)) continue
      const [on, off] = RHYTHMS[rnd(RHYTHMS.length)] ?? [2, 2]
      lasers.push({at: [left ? 0 : W - 1, y], dir: left ? 'R' : 'L', on, off})
    }
    const map: string[] = []
    for (let y = 0; y < H; y++) {
      let row = ''
      for (let x = 0; x < W; x++) {
        const border = x === 0 || y === 0 || x === W - 1 || y === H - 1
        let c = border ? '#' : '.'
        if (x === START[0] && y === START[1]) c = 'S'
        if (walls.some(w => w[0] === x && w[1] === y)) c = '#'
        if (x === gem[0] && y === gem[1]) c = 'G'
        row += c
      }
      map.push(row)
    }
    const level: Level = {
      name: `Daily Vault #${night + 1}`,
      map,
      guards,
      lasers,
      cams,
    }
    if (checkPlayerLevel(level, parts)) continue
    const sol = solve(parse(level))
    if (!sol) continue
    const straight = Math.abs(START[0] - gem[0]) + Math.abs(START[1] - gem[1])
    const used2 = guards.length + cams.length + lasers.length
    const n = sol.length
    // interest: detours forced by the parts, every part in play, and a perfect run of 11 to 18 moves
    const score =
      Math.min(n - straight, 10) +
      2 * used2 -
      (n < 11 ? (11 - n) * 2 : 0) -
      (n > 18 ? (n - 18) * 2 : 0)
    if (score > bestScore) {
      best = level
      bestScore = score
    }
  }
  // (a vault is always found in practice; the fallback is the first training vault, renamed)
  return best ?? {...(HOUSE[0] as Level), name: `Daily Vault #${night + 1}`}
}
