import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import type {AddressInfo, Server} from 'node:net'
import {after, before, beforeEach, test} from 'node:test'
import {
  type Context,
  media,
  reddit,
  redis,
  runWithContext,
} from '@devvit/web/server'
import {
  type AttemptRsp,
  Endpoint,
  type ErrorRsp,
  type InitRsp,
  type PublishRsp,
  type RemoveRsp,
  type ShareRsp,
} from '../shared/api.ts'
import {type Level, type Move, parse, replay, solve} from '../shared/engine.ts'
import {
  dailyKey,
  deadliness,
  HOUSE,
  nightOf,
  partsFor,
  playerKey,
  themeFor,
} from '../shared/vault.ts'
import {STAT_TRIES} from './db.ts'
import {onReq} from './server.ts'

// A small in-memory stand-in for the Redis calls the server uses.
const hashes = new Map<string, Map<string, string>>()
const zsets = new Map<string, Map<string, number>>()
const strings = new Map<string, string>()
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
  get: async (k: string) => strings.get(k),
  set: async (k: string, v: string) => {
    strings.set(k, v)
    return 'OK'
  },
  hDel: async (k: string, fields: string[]) => {
    for (const f of fields) h(k).delete(f)
    return fields.length
  },
  zAdd: async (k: string, ...m: {member: string; score: number}[]) => {
    const z = zsets.get(k) ?? zsets.set(k, new Map()).get(k)!
    for (const x of m) z.set(x.member, x.score)
    return m.length
  },
  zRem: async (k: string, members: string[]) => {
    for (const m of members) zsets.get(k)?.delete(m)
    return members.length
  },
  zCard: async (k: string) => zsets.get(k)?.size ?? 0,
  // always highest score first, as the server asks for it (reverse by rank)
  zRange: async (k: string, start = 0, stop = -1) =>
    [...(zsets.get(k) ?? new Map()).entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(start, stop < 0 ? undefined : stop + 1)
      .map(([member, score]) => ({member, score})),
}
const posts: string[] = []
let failPost = false
const saved: Record<string, unknown> = {}
let currentUser = 'tester'

let server: Server
let url: string
before(async () => {
  for (const [k, fn] of Object.entries(fake)) {
    saved[k] = (redis as unknown as Record<string, unknown>)[k]
    ;(redis as unknown as Record<string, unknown>)[k] = fn
  }
  reddit.getCurrentUsername = async () => currentUser
  reddit.getModerators = (({username}: {username?: string}) => ({
    all: async () => (username === 'the_mod' ? [{username: 'the_mod'}] : []),
  })) as unknown as typeof reddit.getModerators
  media.upload = async opts => {
    if (failUpload) throw Error('upload refused')
    uploads.push(opts.url)
    return {mediaId: 'm1', mediaUrl: 'https://i.redd.it/m1.gif'}
  }
  reddit.submitComment = async opts => {
    if (opts.runAs === 'USER' && failAsUser) throw Error('not allowed')
    // render rich text the way the Reddit client does before sending it
    const rt = (opts as {richtext?: {build?: () => string}}).richtext
    comments.push({
      ...(opts as unknown as Record<string, unknown>),
      richtext: rt?.build ? rt.build() : rt,
    })
    return {permalink: '/r/test/comments/1/x/c1/'} as Awaited<
      ReturnType<typeof reddit.submitComment>
    >
  }
  reddit.submitCustomPost = (async (opts: {title: string}) => {
    if (failPost) throw Error('rate limited')
    posts.push(opts.title)
    return {id: 't3_new', url: 'https://reddit.com/r/vaulttest/comments/2/'}
  }) as unknown as typeof reddit.submitCustomPost
  server = createServer(async (req, rsp) => {
    const user = String(req.headers['x-test-user'] ?? 't2_alice')
    currentUser = user === 't2_mod' ? 'the_mod' : 'tester'
    await runWithContext(
      {
        appName: 'vault-heist',
        subredditName: 'vaulttest',
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
  strings.clear()
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
  assert.deepEqual(won.json.streak, {count: 1, best: 1, tonight: true})
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

test('one player cannot paint a vault red: busts past the cap or after a crack do not count', async () => {
  for (let i = 0; i < STAT_TRIES + 5; i++)
    await post<AttemptRsp>(
      Endpoint.Attempt,
      {key: 'h1', moves: ['U', 'U', 'U']},
      't2_spam',
    )
  const sol = solve(parse(HOUSE[0]!))!
  const won = await post<AttemptRsp>(
    Endpoint.Attempt,
    {key: 'h1', moves: sol},
    't2_spam',
  )
  // the first crack always counts, even after the cap
  assert.equal(won.json.stats.caught, STAT_TRIES)
  assert.equal(won.json.stats.cracked, 1)
  assert.equal(won.json.progress.tries, STAT_TRIES + 6)
  const after = await post<AttemptRsp>(
    Endpoint.Attempt,
    {key: 'h1', moves: ['U', 'U', 'U']},
    't2_spam',
  )
  assert.equal(after.json.stats.caught, STAT_TRIES)
  assert.equal(after.json.stats.people, 1)
})

test('the install and the nightly job together make one post a night; its title names tonight', async () => {
  posts.length = 0
  await post(Endpoint.OnAppInstall, {})
  await post(Endpoint.OnNewNight, {})
  assert.equal(posts.length, 1)
  const night = nightOf(Date.now())
  assert.match(posts[0]!, new RegExp(`^VAULT, Night ${night + 1}: `))
  const theme = themeFor(night)
  if (theme) assert.ok(posts[0]!.includes(theme.name))
})

test('the bust cap holds when one player sends many runs at once', async () => {
  const runs = Array.from({length: 40}, () =>
    post<AttemptRsp>(
      Endpoint.Attempt,
      {key: 'h1', moves: ['U', 'U', 'U']},
      't2_flood',
    ),
  )
  await Promise.all(runs)
  const init = await get<InitRsp>(Endpoint.Init, 't2_watcher')
  assert.equal(init.house.h1?.caught, STAT_TRIES)
  assert.equal(
    Object.values(init.house.h1?.marks ?? {}).reduce((a, b) => a + b, 0),
    STAT_TRIES,
  )
  assert.equal(init.tonight?.caught, STAT_TRIES)
})

test('a failed nightly post can be retried', async () => {
  posts.length = 0
  failPost = true
  const first = await fetch(`${url}/${Endpoint.OnNewNight}`, {
    method: 'POST',
    body: '{}',
  })
  failPost = false
  assert.equal(first.status, 500)
  await post(Endpoint.OnNewNight, {})
  assert.equal(posts.length, 1)
})

test('the Daily Vault: in init, ranked by name on a leaderboard, never served early, shared without spoilers', async () => {
  const night = nightOf(Date.now())
  const init = await get<InitRsp>(Endpoint.Init, 't2_d1')
  const daily = init.daily!
  assert.equal(daily.key, dailyKey(night))
  const sol = solve(parse(daily.level))!
  assert.equal(daily.best, sol.length)
  assert.deepEqual(daily.leaders, [])
  // a slow crack (the perfect route with one wait slipped in where it's still safe), then a perfect one
  const V = parse(daily.level)
  let slow: Move[] = []
  for (let i = 0; i <= sol.length && !slow.length; i++) {
    const m = [...sol.slice(0, i), 'W' as Move, ...sol.slice(i)]
    if (replay(V, m).state.status === 'won') slow = m
  }
  assert.equal(slow.length, sol.length + 1, 'a crack one move slower exists')
  await post<AttemptRsp>(
    Endpoint.Attempt,
    {key: daily.key, moves: slow},
    't2_d1',
  )
  await post<AttemptRsp>(
    Endpoint.Attempt,
    {key: daily.key, moves: sol},
    't2_d2',
  )
  const after = (await get<InitRsp>(Endpoint.Init, 't2_d1')).daily!
  assert.deepEqual(
    after.leaders.map(l => l.moves),
    [sol.length, sol.length + 1],
  )
  assert.equal(after.leaders[0]?.name, 'tester')
  assert.deepEqual(after.me, {place: 2, moves: sol.length + 1, of: 2})
  assert.equal(after.stats.cracked, 2)
  // tomorrow's vault can't be fetched early
  const early = await post<ErrorRsp>(Endpoint.Attempt, {
    key: dailyKey(night + 1),
    moves: sol,
  })
  assert.equal(early.status, 404)
  // sharing the perfect crack: the line gives the count, not the route
  const shared = await post<ShareRsp>(
    Endpoint.Share,
    {key: daily.key, moves: sol},
    't2_d2',
  )
  assert.equal(shared.status, 200)
  const line = String(comments.at(-1)?.richtext)
  assert.ok(
    line.includes(
      `VAULT Daily #${night + 1}: cracked in ${sol.length} (perfect ${sol.length}) 🟩`,
    ),
    line,
  )
})

test('the morning-after recap: a comment on the new post, and each player’s own last night', async () => {
  const n = nightOf(Date.now()) - 1
  const key = playerKey('t2_old', n)
  // last night: one vault that stumped 3 of 4, seven busts in all, two cracks of the Daily Vault
  for (const [f, v] of Object.entries({
    owner: 't2_old',
    author: 'old_builder',
    name: 'Old Box',
    level: JSON.stringify(vault()),
    best: '12',
  }))
    h(`vault:${key}`).set(f, v)
  zsets.set(`night:${n}:vaults`, new Map([['t2_old', 1]]))
  zsets.set(`night:${n}:deadly`, new Map([['t2_old', 3]]))
  for (const [f, v] of Object.entries({tries: '6', caught: '5', cracked: '1'}))
    h(`stats:${key}`).set(f, v)
  for (const u of ['a', 'b', 'c', 'd']) h(`people:${key}`).set(`t2_${u}`, '1')
  h(`nightstats:${n}`).set('caught', '7')
  const dk = dailyKey(n)
  h(`best:${dk}`).set('t2_a', '13').set('t2_b', '15')
  h(`bestAt:${dk}`).set('t2_a', '1').set('t2_b', '2')
  h(`names:${dk}`).set('t2_a', 'alpha').set('t2_b', 'beta')
  for (const [f, v] of Object.entries({tries: '4', caught: '1', cracked: '2'}))
    h(`stats:${dk}`).set(f, v)
  for (const u of ['a', 'b', 'c']) h(`people:${dk}`).set(`t2_${u}`, '1')

  comments.length = 0
  await post(Endpoint.OnNewNight, {})
  const recap = String(comments.at(-1)?.richtext)
  assert.equal(comments.at(-1)?.runAs, 'APP')
  assert.equal(comments.at(-1)?.id, 't3_new')
  for (const part of [
    `Last night (Night ${n + 1}): 1 vault built, 7 thieves caught.`,
    'Deadliest: Old Box by u/old_builder, stumped 3 of 4.',
    `Daily Vault #${n + 1}: cracked by 2 of 3; fastest u/alpha in 13 moves`,
  ])
    assert.ok(recap.includes(part), `${part}\n${recap}`)

  const old = (await get<InitRsp>(Endpoint.Init, 't2_old')).lastNight!
  assert.deepEqual(old.mine, {
    name: 'Old Box',
    caught: 5,
    cracked: 1,
    people: 4,
  })
  const beta = (await get<InitRsp>(Endpoint.Init, 't2_b')).lastNight!
  assert.deepEqual(beta.place, {place: 2, of: 2, moves: 15})
  assert.equal(beta.mine, null)
})

// A crackable test vault built from whatever tonight's parts are, so the tests pass on any date.
const vault = (name = 'Moth Box'): Level => {
  const parts = partsFor(nightOf(Date.now()))
  const map = [
    '#######',
    '#..G..#',
    '#.....#',
    '#.###.#',
    '#.....#',
    '#.....#',
    '#.....#',
    '#.....#',
    '###S###',
  ]
  if (parts.guard > 0)
    return {
      name,
      map,
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
    }
  if (parts.laser > 0)
    return {
      name,
      map,
      guards: [],
      lasers: [{at: [0, 5], dir: 'R', on: 2, off: 2}],
      cams: [],
    }
  return {
    name,
    map,
    guards: [],
    lasers: [],
    cams: [{at: [5, 5], dirs: ['U', 'D']}],
  }
}

test('a busy night: your own vault and the deadliest vaults stay listed however many are built', async () => {
  const n = 65
  for (let i = 0; i < n; i++) {
    const r = await post<PublishRsp>(
      Endpoint.Publish,
      {level: vault(`V${i}`)},
      `t2_b${i}`,
    )
    assert.equal(r.status, 200)
  }
  // a losing run on the second-oldest vault makes it the deadliest of the night
  const V = parse(vault())
  let lose: Move[] = []
  for (let w = 0; w < 6 && !lose.length; w++)
    for (let k = 1; k < 10 && !lose.length; k++) {
      const m = [...Array<Move>(w).fill('W'), ...Array<Move>(k).fill('U')]
      if (replay(V, m).state.status === 'caught') lose = m
    }
  assert.ok(lose.length, 'tonight’s test vault can be lost')
  const night = nightOf(Date.now())
  await post<AttemptRsp>(
    Endpoint.Attempt,
    {key: playerKey('t2_b1', night), moves: lose},
    't2_hunter',
  )
  const init = await get<InitRsp>(Endpoint.Init, 't2_b0')
  assert.equal(init.mine?.owner, 't2_b0')
  assert.ok(init.others.length <= 60)
  assert.equal(init.others[0]?.owner, 't2_b1')
  assert.ok(
    init.others.some(v => v.owner === 't2_b64'),
    'the newest is listed',
  )
})

test('published parts keep only their checked fields; tonight’s totals and a removed vault are reported', async () => {
  const level = vault('Junk Drawer') as unknown as Record<string, unknown[]>
  for (const k of ['guards', 'lasers', 'cams'])
    for (const part of level[k] ?? [])
      (part as Record<string, unknown>).junk = 'x'.repeat(1000)
  const pub = await post<PublishRsp>(Endpoint.Publish, {level}, 't2_jd')
  assert.equal(pub.status, 200)
  assert.ok(!JSON.stringify(pub.json.vault.level).includes('junk'))
  const before = await get<InitRsp>(Endpoint.Init, 't2_other')
  assert.equal(before.tonight?.built, 1)
  assert.ok(!JSON.stringify(before.others).includes('junk'))
  // a moderator removes it: its builder is told, and isn't invited to build again tonight
  const r = await post<RemoveRsp>(
    Endpoint.Remove,
    {key: pub.json.vault.key},
    't2_mod',
  )
  assert.equal(r.status, 200)
  const after = await get<InitRsp>(Endpoint.Init, 't2_jd')
  assert.equal(after.mine, null)
  assert.equal(after.removed, true)
  assert.equal((await get<InitRsp>(Endpoint.Init, 't2_other')).removed, false)
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

const uploads: string[] = []
const comments: Record<string, unknown>[] = []
let failUpload = false
let failAsUser = false

test('sharing a run: server-written text, the GIF attached, once per vault, with fallbacks', async () => {
  uploads.length = 0
  comments.length = 0
  const gif = `data:image/gif;base64,${Buffer.from('GIF89a').toString('base64')}`
  const sol = solve(parse(HOUSE[0]!))!
  // an unfinished or made-up run can't be posted
  const half = await post<ErrorRsp>(Endpoint.Share, {
    key: 'h1',
    moves: ['U'],
    gif,
  })
  assert.equal(half.status, 400)
  const ok = await post<ShareRsp>(Endpoint.Share, {key: 'h1', moves: sol, gif})
  assert.equal(ok.status, 200)
  assert.equal(ok.json.posted, 'gif')
  assert.deepEqual(uploads, [gif])
  const first = comments[0]!
  assert.equal(first.runAs, 'USER')
  assert.match(
    JSON.stringify(first.richtext),
    /cracked The Lobby in 8 moves \(a perfect run\)/,
  )
  // once per vault
  assert.equal(
    (await post<ErrorRsp>(Endpoint.Share, {key: 'h1', moves: sol, gif})).status,
    409,
  )
  // no GIF and no posting as the player: the app posts text that names them
  failUpload = true
  failAsUser = true
  const bust = await post<ShareRsp>(
    Endpoint.Share,
    {key: 'h1', moves: ['U', 'U', 'U'], gif},
    't2_bob',
  )
  failUpload = false
  failAsUser = false
  assert.equal(bust.json.posted, 'text')
  const last = comments.at(-1)!
  assert.equal(last.runAs, 'APP')
  // always rich text (never Markdown), so a vault name can't turn into a link or a mention
  assert.equal(last.text, undefined)
  assert.ok(
    String(last.richtext).includes(
      'u/tester got caught by a guard in The Lobby on move 2',
    ),
  )
})

test('streaks: one per night, kept by a crack the next night, reset by a missed night', async () => {
  const night = nightOf(Date.now())
  // pretend the last crack was last night
  h('streak:t2_dana').set('last', String(night - 1))
  h('streak:t2_dana').set('count', '4')
  h('streak:t2_dana').set('best', '4')
  const before = await get<InitRsp>(Endpoint.Init, 't2_dana')
  assert.deepEqual(before.streak, {count: 4, best: 4, tonight: false})
  const sol = solve(parse(HOUSE[1]!))!
  const won = await post<AttemptRsp>(
    Endpoint.Attempt,
    {key: 'h2', moves: sol},
    't2_dana',
  )
  assert.deepEqual(won.json.streak, {count: 5, best: 5, tonight: true})
  const again = await post<AttemptRsp>(
    Endpoint.Attempt,
    {key: 'h2', moves: sol},
    't2_dana',
  )
  assert.equal(again.json.streak.count, 5)
  // a gap of two nights resets it
  h('streak:t2_eve').set('last', String(night - 2))
  h('streak:t2_eve').set('count', '9')
  assert.equal((await get<InitRsp>(Endpoint.Init, 't2_eve')).streak.count, 0)
})

test('a crack is ranked against everyone else who cracked the vault', async () => {
  const V = parse(HOUSE[0]!)
  const fast = solve(V)! // 8 moves, with the pebble
  const slow = solve(V, {usePebbles: false})! // 10 moves
  assert.ok(slow.length > fast.length)
  const first = await post<AttemptRsp>(
    Endpoint.Attempt,
    {key: 'h1', moves: slow},
    't2_r1',
  )
  assert.deepEqual(first.json.rank, {others: 0, slower: 0})
  const second = await post<AttemptRsp>(
    Endpoint.Attempt,
    {key: 'h1', moves: fast},
    't2_r2',
  )
  assert.deepEqual(second.json.rank, {others: 1, slower: 1})
  const third = await post<AttemptRsp>(
    Endpoint.Attempt,
    {key: 'h1', moves: slow},
    't2_r3',
  )
  assert.deepEqual(third.json.rank, {others: 2, slower: 0})
  const bust = await post<AttemptRsp>(
    Endpoint.Attempt,
    {key: 'h1', moves: ['U', 'U']},
    't2_r4',
  )
  assert.equal(bust.json.rank, undefined)
})

test('moderators can remove a player vault; nobody else can', async () => {
  const pub = await post<PublishRsp>(
    Endpoint.Publish,
    {level: vault('Rude Name')},
    't2_alice',
  )
  const key = pub.json.vault.key
  assert.equal((await get<InitRsp>(Endpoint.Init, 't2_mod')).isMod, true)
  assert.equal((await get<InitRsp>(Endpoint.Init, 't2_bob')).isMod, false)
  assert.equal(
    (await post<ErrorRsp>(Endpoint.Remove, {key}, 't2_bob')).status,
    403,
  )
  assert.equal(
    (await post<RemoveRsp>(Endpoint.Remove, {key}, 't2_mod')).status,
    200,
  )
  assert.equal((await get<InitRsp>(Endpoint.Init, 't2_bob')).others.length, 0)
  assert.equal(
    (await post<ErrorRsp>(Endpoint.Attempt, {key, moves: ['U']}, 't2_bob'))
      .status,
    404,
  )
})

test('deadliness counts people, not attempts', () => {
  // one player busting fifty times is one stumped person
  assert.equal(deadliness({people: 1, cracked: 0}), 1)
  assert.ok(
    deadliness({people: 6, cracked: 0}) > deadliness({people: 9, cracked: 2}),
  )
})
