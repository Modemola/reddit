import assert from 'node:assert/strict'
import {test} from 'node:test'
import {guardPos, parse, replay, solve, startState, step} from './engine.ts'
import {
  bestMoves,
  checkPlayerLevel,
  dailyKey,
  dailyNight,
  dailyVault,
  HOUSE,
  partsFor,
  themeFor,
} from './vault.ts'

test('house vaults keep the prototype solutions', () => {
  // same numbers the prototype solver printed
  assert.deepEqual(
    HOUSE.map(l => bestMoves(l)),
    [8, 8, 8, 14, 10, 12],
  )
  assert.deepEqual(
    HOUSE.map(l => solve(parse(l), {usePebbles: false})?.length ?? 0),
    [10, 8, 0, 14, 10, 12],
  )
})

test('a pebble turns nearby guards for two turns, then they resume', () => {
  const V = parse(HOUSE[0]!)
  let s = step(V, startState(V), 'U')!
  assert.ok(s)
  const t1 = step(V, s, {pebble: [3, 4]})
  assert.ok(t1)
  assert.deepEqual(t1.heard, [0, 1])
  assert.equal(t1.peb, 0)
  assert.deepEqual(
    V.guards.map(g => guardPos(g, t1!)),
    [
      [2, 3, 'R'],
      [4, 6, 'U'],
    ],
  )
  s = step(V, t1, 'W')!
  assert.deepEqual(
    V.guards.map(g => guardPos(g, s)),
    [
      [2, 3, 'R'],
      [4, 6, 'U'],
    ],
  )
  s = step(V, s, 'W')!
  assert.deepEqual(
    V.guards.map(g => guardPos(g, s)),
    [
      [3, 3, 'R'],
      [3, 6, 'L'],
    ],
  )
  assert.equal(step(V, t1, {pebble: [3, 4]}), null, 'only one pebble')
})

test('replay agrees with the solver and catches a straight walk', () => {
  for (const L of HOUSE) {
    const V = parse(L)
    const sol = solve(V)
    assert.ok(sol)
    assert.equal(replay(V, sol).state.status, 'won')
  }
  const lobby = parse(HOUSE[0]!)
  assert.equal(replay(lobby, ['U', 'U', 'U']).state.status, 'caught')
  assert.equal(replay(lobby, ['L']).illegal, true)
})

test('player vault checks', () => {
  const parts = {wall: 6, guard: 2, laser: 1, cam: 1}
  const ok = {
    name: 'Moth Box',
    map: [
      '#######',
      '#..G..#',
      '#.....#',
      '#.###.#',
      '#.....#',
      '#.....#',
      '#.....#',
      '#.....#',
      '###S###',
    ],
    guards: [
      {
        path: [
          [1, 4],
          [2, 4],
          [3, 4],
        ],
        see: 2,
      },
    ],
    lasers: [],
    cams: [],
  }
  assert.equal(checkPlayerLevel(ok, parts), null)
  // parts follow the builder's own placement rules
  const g = (path: number[][]) => ({...ok, guards: [{path, see: 2}]})
  const bad = (l: unknown, re: RegExp) =>
    assert.match(checkPlayerLevel(l, parts) ?? 'accepted', re)
  bad(
    g([
      [1, 4],
      [8, 1],
    ]),
    /route|invalid/,
  ) // off the board
  bad(
    g([
      [1, 4],
      [3, 4],
    ]),
    /one tile at a time/,
  ) // a jump
  bad(
    g([
      [2, 4],
      [2, 3],
    ]),
    /open floor/,
  ) // into a wall
  bad(g([[3, 1]]), /open floor/) // on the gem
  bad({...ok, guards: [ok.guards[0], {path: [[3, 4]], see: 2}]}, /open floor/) // two guards on one tile
  const laser = (l: object) => ({
    ...ok,
    lasers: [{at: [0, 5], dir: 'R', on: 2, off: 2, ...l}],
  })
  assert.equal(checkPlayerLevel(laser({}), parts), null)
  bad(laser({phase: -3}), /laser/) // a phase that breaks its rhythm
  bad(laser({at: [3, 5]}), /mounted on its own wall/) // on the floor
  bad({...ok, cams: [{at: [2, 3], dirs: ['U', 'D']}]}, /camera/) // inside a wall
  // two lasers on one tile (a box with two lasers, so the count isn't what stops it)
  assert.match(
    checkPlayerLevel(
      {
        ...ok,
        lasers: [
          {at: [0, 5], dir: 'R', on: 2, off: 2},
          {at: [0, 5], dir: 'U', on: 2, off: 2},
        ],
      },
      {...parts, laser: 2},
    ) ?? 'accepted',
    /own wall/,
  )
  assert.equal(
    checkPlayerLevel({...ok, cams: [{at: [5, 6], dirs: ['U', 'D']}]}, parts),
    null,
  )
  // names with hidden or direction-flipping characters are refused
  for (const bad of ['Moth\u202EBox', 'Moth\u200BBox', 'Moth\nBox'])
    assert.match(
      checkPlayerLevel({...ok, name: bad}, parts) ?? '',
      /characters/,
    )
  assert.equal(
    checkPlayerLevel({...ok, name: 'Caf\u00e9 Noir ☕'}, parts),
    null,
  )
  assert.match(
    checkPlayerLevel(
      {...ok, guards: [ok.guards[0], ok.guards[0], ok.guards[0]]},
      parts,
    ) ?? '',
    /parts/,
  )
  assert.match(
    checkPlayerLevel(
      {...ok, map: ok.map.map((r, i) => (i === 0 ? '###.###' : r))},
      parts,
    ) ?? '',
    /outer wall/,
  )
  assert.match(
    checkPlayerLevel({...ok, name: `<script>${'x'.repeat(30)}`}, parts) ?? '',
    /name/,
  )
  assert.ok(partsFor(0).guard >= 1)
})

test('themed nights: twice a week, each with a buildable parts box', () => {
  const themed = Array.from({length: 28}, (_, n) => themeFor(n)).filter(
    t => t !== null,
  )
  assert.equal(themed.length, 8)
  assert.deepEqual(new Set(themed.map(t => t.name)).size, 4)
  for (let n = 0; n < 60; n++) {
    const p = partsFor(n)
    // every night has something that can catch a thief, and walls to build with
    assert.ok(p.guard + p.laser + p.cam >= 2, `night ${n}`)
    assert.ok(p.wall >= 6, `night ${n}`)
  }
})

test('the Daily Vault: the same vault for a night everywhere, valid, crackable, and a fair size', () => {
  for (let night = 0; night < 10; night++) {
    const a = dailyVault(night)
    assert.deepEqual(dailyVault(night), a)
    assert.equal(checkPlayerLevel(a, partsFor(night)), null)
    const best = bestMoves(a)
    assert.ok(best >= 8 && best <= 24, `night ${night}: best ${best}`)
  }
  assert.notDeepEqual(dailyVault(1).map, dailyVault(2).map)
  assert.equal(dailyNight(dailyKey(41)), 41)
  assert.equal(dailyNight('h1'), null)
})
