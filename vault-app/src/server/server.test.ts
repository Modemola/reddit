import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import type {AddressInfo, Server} from 'node:net'
import {after, before, beforeEach, test} from 'node:test'
import {type Context, reddit, redis, runWithContext} from '@devvit/web/server'
import {
  type AttemptRsp,
  Endpoint,
  type ErrorRsp,
  type InitRsp,
  type PublishRsp,
} from '../shared/api.ts'
import {type Level, parse, solve} from '../shared/engine.ts'
import {HOUSE, nightOf, partsFor} from '../shared/vault.ts'
import {onReq} from './server.ts'

// A small in-memory stand-in for the Redis calls the server uses.
const hashes = new Map<string, Map<string, string>>()
const zsets = new Map<string, Map<string, number>>()
const h = (k: string) => hashes.get(k) ?? hashes.set(k, new Map()).get(k)!
const fake = {
  hGetAll: async (k: string) => Object.fromEntries(h(k)),
  hSet: async (k: string, v: Record<string, string>) => {
    for (const [f, x] of Object.entries(v)) h(k).set(f, x)
    return Object.keys(v).length
  },
  hSetNX: async (k: string, f: string, v: string) => {
    if (h(k).has(f)) return 0
    h(k).set(f, v)
    return 1
  },
  hIncrBy: async (k: string, f: string, n: number) => {
    const v = Number(h(k).get(f) ?? 0) + n
    h(k).set(f, String(v))
    return v
  },
  hLen: async (k: string) => h(k).size,
  zAdd: async (k: string, ...m: {member: string; score: number}[]) => {
    const z = zsets.get(k) ?? zsets.set(k, new Map()).get(k)!
    for (const x of m) z.set(x.member, x.score)
    return m.length
  },
  zRange: async (k: string) =>
    [...(zsets.get(k) ?? new Map()).entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([member, score]) => ({member, score})),
}
const saved: Record<string, unknown> = {}

let server: Server
let url: string
before(async () => {
  for (const [k, fn] of Object.entries(fake)) {
    saved[k] = (redis as unknown as Record<string, unknown>)[k]
    ;(redis as unknown as Record<string, unknown>)[k] = fn
  }
  reddit.getCurrentUsername = async () => 'tester'
  server = createServer(async (req, rsp) => {
    const user = String(req.headers['x-test-user'] ?? 't2_alice')
    await runWithContext(
      {
        appName: 'vault-heist',
        postId: 't3_1',
        userId: user,
        username: user,
      } as unknown as Context,
      () => onReq(req, rsp),
    )
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
after(async () => {
  for (const [k, fn] of Object.entries(saved))
    (redis as unknown as Record<string, unknown>)[k] = fn
  await new Promise<void>(r => server.close(() => r()))
})
beforeEach(() => {
  hashes.clear()
  zsets.clear()
})

const get = async <T>(ep: string, user = 't2_alice') =>
  (
    await fetch(`${url}/${ep}`, {headers: {'x-test-user': user}})
  ).json() as Promise<T>
const post = async <T>(ep: string, body: unknown, user = 't2_alice') => {
  const r = await fetch(`${url}/${ep}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {'x-test-user': user, 'Content-Type': 'application/json'},
  })
  return {status: r.status, json: (await r.json()) as T}
}

test('init describes tonight', async () => {
  const init = await get<InitRsp>(Endpoint.Init)
  assert.equal(init.night, nightOf(Date.now()))
  assert.deepEqual(init.parts, partsFor(init.night))
  assert.equal(Object.keys(init.house).length, HOUSE.length)
  assert.equal(init.mine, null)
})

test('the server replays runs: a real crack counts, a bust leaves a mark, a half run does not count', async () => {
  const sol = solve(parse(HOUSE[0]!))!
  const won = await post<AttemptRsp>(Endpoint.Attempt, {key: 'h1', moves: sol})
  assert.equal(won.json.result, 'won')
  assert.equal(won.json.progress.moves, sol.length)
  const bust = await post<AttemptRsp>(
    Endpoint.Attempt,
    {key: 'h1', moves: ['U', 'U', 'U']},
    't2_bob',
  )
  assert.equal(bust.json.result, 'caught')
  assert.equal(bust.json.stats.caught, 1)
  assert.equal(bust.json.stats.cracked, 1)
  assert.equal(
    Object.values(bust.json.stats.marks).reduce((a, b) => a + b, 0),
    1,
  )
  const half = await post<AttemptRsp>(
    Endpoint.Attempt,
    {key: 'h1', moves: ['U']},
    't2_bob',
  )
  assert.equal(half.json.result, 'abandoned')
  assert.equal(half.json.stats.tries, 2)
  // claiming a crack with moves that walk into a wall gets nothing
  const fake = await post<AttemptRsp>(
    Endpoint.Attempt,
    {key: 'h1', moves: ['L', 'U', 'U']},
    't2_carol',
  )
  assert.equal(fake.json.result, 'abandoned')
  const junk = await post<ErrorRsp>(Endpoint.Attempt, {
    key: 'h1',
    moves: [{pebble: 'everywhere'}],
  })
  assert.equal(junk.status, 400)
})

const vault = (name = 'Moth Box'): Level => ({
  name,
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
        [4, 4],
        [5, 4],
      ],
      see: 2,
    },
  ],
  lasers: [],
  cams: [],
})

test('publishing: one solvable vault per player per night, and others can crack it', async () => {
  const pub = await post<PublishRsp>(Endpoint.Publish, {level: vault()})
  assert.equal(pub.status, 200)
  assert.ok(pub.json.vault.best > 0)
  assert.equal(
    (await post<ErrorRsp>(Endpoint.Publish, {level: vault('Again')})).status,
    409,
  )

  const sealed = vault('Sealed')
  sealed.map = [
    '#######',
    '#..G..#',
    '#.....#',
    '#######',
    '#.....#',
    '#.....#',
    '#.....#',
    '#.....#',
    '###S###',
  ]
  const bad = await post<ErrorRsp>(Endpoint.Publish, {level: sealed}, 't2_bob')
  assert.equal(bad.status, 400)

  const bob = await get<InitRsp>(Endpoint.Init, 't2_bob')
  assert.equal(bob.others.length, 1)
  const key = bob.others[0]!.key
  const sol = solve(parse(bob.others[0]!.level))!
  const crack = await post<AttemptRsp>(
    Endpoint.Attempt,
    {key, moves: sol},
    't2_bob',
  )
  assert.equal(crack.json.result, 'won')
  assert.equal(crack.json.stats.cracked, 1)
  // the owner playing their own vault doesn't change its numbers
  const own = await post<AttemptRsp>(Endpoint.Attempt, {key, moves: sol})
  assert.equal(own.json.stats.tries, 1)
  const alice = await get<InitRsp>(Endpoint.Init)
  assert.equal(alice.mine?.stats.cracked, 1)
})
