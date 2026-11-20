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
/** Tonight's box of parts. Everyone gets the same one. */
export function partsFor(night: number): Parts {
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
const isXY = (p: unknown): p is XY =>
  Array.isArray(p) &&
  p.length === 2 &&
  p.every(n => Number.isInteger(n) && n >= 0 && n < 9)

/** Checks the shape of a player vault and that it fits tonight's parts. Returns an error message or null. */
export function checkPlayerLevel(l: unknown, parts: Parts): string | null {
  if (!l || typeof l !== 'object') return 'not a vault'
  const v = l as Partial<Level>
  if (typeof v.name !== 'string' || !v.name.trim() || v.name.length > 24)
    return 'name must be 1 to 24 characters'
  if (!Array.isArray(v.map) || v.map.length !== H) return 'bad map'
  if (
    !v.map.every(
      r => typeof r === 'string' && r.length === W && /^[#.SG]+$/.test(r),
    )
  )
    return 'bad map'
  const flat = v.map.join('')
  if (flat.split('S').length !== 2 || flat.split('G').length !== 2)
    return 'one entrance and one gem'
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
    return 'bad parts'
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
    return 'bad guard'
  if (
    !lasers.every(
      x =>
        isXY(x.at) &&
        isDir(x.dir) &&
        RHYTHMS.some(([on, off]) => on === x.on && off === x.off),
    )
  )
    return 'bad laser'
  if (
    !cams.every(
      c =>
        isXY(c.at) &&
        Array.isArray(c.dirs) &&
        SWEEPS.some(s => s.join() === c.dirs.join()) &&
        (c.see === undefined || c.see === 2),
    )
  )
    return 'bad camera'
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
