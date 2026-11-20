import assert from 'node:assert/strict'
import {test} from 'node:test'
import {guardPos, parse, replay, solve, startState, step} from './engine.ts'
import {bestMoves, checkPlayerLevel, HOUSE, partsFor} from './vault.ts'

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
