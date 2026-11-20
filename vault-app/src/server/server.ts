import {once} from 'node:events'
import type {IncomingMessage, ServerResponse} from 'node:http'
import {context, reddit} from '@devvit/web/server'
import type {
  PartialJsonValue,
  TriggerResponse,
  UiResponse,
} from '@devvit/web/shared'
import {
  type AttemptReq,
  type AttemptRsp,
  Endpoint,
  EndpointMethod,
  type ErrorRsp,
  type InitRsp,
  type PlayerVault,
  type PublishReq,
  type PublishRsp,
} from '../shared/api.ts'
import {type Level, type Move, parse, replay} from '../shared/engine.ts'
import {
  bestMoves,
  checkPlayerLevel,
  HOUSE,
  houseKey,
  nightOf,
  partsFor,
  playerKey,
  W,
} from '../shared/vault.ts'
import {
  getProgress,
  getStats,
  getVault,
  nightOwners,
  recordAttempt,
  saveVault,
} from './db.ts'

type AnyRsp =
  | InitRsp
  | AttemptRsp
  | PublishRsp
  | UiResponse
  | TriggerResponse
  | ErrorRsp

export async function onReq(
  reqMsg: IncomingMessage,
  rspMsg: ServerResponse,
): Promise<void> {
  try {
    await route(reqMsg, rspMsg)
  } catch (err) {
    console.error(`server error; ${err instanceof Error ? err.stack : err}`)
    writeJson<ErrorRsp>(
      500,
      {error: 'Something went wrong on our side. Try again.', status: 500},
      rspMsg,
    )
  }
}

async function route(
  reqMsg: IncomingMessage,
  rspMsg: ServerResponse,
): Promise<void> {
  const endpoint = reqMsg.url?.slice(1).split('?')[0] as Endpoint
  const method = EndpointMethod[endpoint]
  let rsp: AnyRsp
  if (method !== reqMsg.method) {
    rsp = {error: 'not found', status: 404}
  } else {
    switch (endpoint) {
      case Endpoint.Init:
        rsp = await routeInit()
        break
      case Endpoint.Attempt:
        rsp = await routeAttempt(reqMsg)
        break
      case Endpoint.Publish:
        rsp = await routePublish(reqMsg)
        break
      case Endpoint.OnMenuNewPost:
        rsp = await routeMenuNewPost()
        break
      case Endpoint.OnAppInstall:
      case Endpoint.OnNewNight:
        await createNightPost()
        rsp = {}
        break
      default:
        endpoint satisfies never
        rsp = {error: 'not found', status: 404}
    }
  }
  writeJson<PartialJsonValue>(
    'status' in rsp && typeof rsp.status === 'number' ? rsp.status : 200,
    rsp,
    rspMsg,
  )
}

const tonight = () => nightOf(Date.now())

async function playerVaults(night: number): Promise<PlayerVault[]> {
  const owners = await nightOwners(night)
  const vaults = await Promise.all(
    owners.map(async owner => {
      const v = await getVault(playerKey(owner, night))
      return v ? {...v, stats: await getStats(v.key)} : null
    }),
  )
  return vaults.filter(v => v !== null)
}

async function routeInit(): Promise<InitRsp> {
  const night = tonight()
  const userId = context.userId ?? null
  const [username, progress, house, vaults] = await Promise.all([
    reddit.getCurrentUsername().catch(() => undefined),
    userId ? getProgress(userId) : Promise.resolve({}),
    Promise.all(HOUSE.map((_, i) => getStats(houseKey(i)))),
    playerVaults(night),
  ])
  const houseStats: InitRsp['house'] = {}
  house.forEach((s, i) => {
    houseStats[houseKey(i)] = s
  })
  return {
    night,
    username: username ?? null,
    userId,
    parts: partsFor(night),
    progress,
    house: houseStats,
    mine: vaults.find(v => v.owner === userId) ?? null,
    others: vaults.filter(v => v.owner !== userId),
  }
}

const isMove = (m: unknown): m is Move =>
  m === 'U' ||
  m === 'D' ||
  m === 'L' ||
  m === 'R' ||
  m === 'W' ||
  (typeof m === 'object' &&
    m !== null &&
    'pebble' in m &&
    Array.isArray(m.pebble) &&
    m.pebble.length === 2 &&
    m.pebble.every(n => Number.isInteger(n) && n >= 0 && n < 9))

async function levelFor(
  key: string,
): Promise<{level: Level; owner: string | null} | null> {
  const h = /^h([1-9])$/.exec(key)
  if (h) {
    const level = HOUSE[Number(h[1]) - 1]
    return level ? {level, owner: null} : null
  }
  const v = await getVault(key)
  return v ? {level: v.level, owner: v.owner} : null
}

async function routeAttempt(
  reqMsg: IncomingMessage,
): Promise<AttemptRsp | ErrorRsp> {
  const userId = context.userId
  if (!userId)
    return {error: 'Log in to Reddit to save your runs.', status: 401}
  const req = await readJson<AttemptReq>(reqMsg)
  if (
    typeof req?.key !== 'string' ||
    !Array.isArray(req.moves) ||
    req.moves.length > 400 ||
    !req.moves.every(isMove)
  )
    return {error: 'bad run', status: 400}
  const found = await levelFor(req.key)
  if (!found) return {error: 'That vault does not exist.', status: 404}
  // The server replays the moves itself: what counts is what the rules say happened.
  const V = parse(found.level)
  const {state, used, illegal} = replay(V, req.moves)
  const result = illegal || state.status === 'play' ? 'abandoned' : state.status
  const ownVault = found.owner === userId
  let progress = (await getProgress(userId))[req.key] ?? {
    tries: 0,
    won: false,
    moves: 0,
  }
  if (result !== 'abandoned') {
    const caughtAt =
      result === 'caught' ? state.pos[1] * W + state.pos[0] : null
    progress = await recordAttempt(
      userId,
      req.key,
      result,
      used,
      caughtAt,
      !ownVault,
    )
  }
  return {result, moves: used, progress, stats: await getStats(req.key)}
}

async function routePublish(
  reqMsg: IncomingMessage,
): Promise<PublishRsp | ErrorRsp> {
  const userId = context.userId
  if (!userId)
    return {error: 'Log in to Reddit to publish a vault.', status: 401}
  const night = tonight()
  const req = await readJson<PublishReq>(reqMsg)
  const problem = checkPlayerLevel(req?.level, partsFor(night))
  if (problem)
    return {error: `That vault can’t be published: ${problem}.`, status: 400}
  const level: Level = {
    name: req.level.name.trim().slice(0, 24),
    map: req.level.map,
    guards: req.level.guards ?? [],
    lasers: req.level.lasers ?? [],
    cams: req.level.cams ?? [],
  }
  const best = bestMoves(level)
  if (!best)
    return {
      error: 'Nobody could crack that vault. Open a path before publishing.',
      status: 400,
    }
  const author =
    (await reddit.getCurrentUsername().catch(() => undefined)) ?? ''
  const vault = {
    key: playerKey(userId, night),
    owner: userId,
    author,
    name: level.name,
    level,
    best,
  }
  if (!(await saveVault(night, vault)))
    return {error: 'You already built a vault tonight.', status: 409}
  return {vault: {...vault, stats: await getStats(vault.key)}}
}

async function createNightPost() {
  const night = tonight()
  return reddit.submitCustomPost({
    title: `VAULT, Night ${night + 1}: crack tonight’s vaults, then build one that catches people`,
  })
}

async function routeMenuNewPost(): Promise<UiResponse> {
  const post = await createNightPost()
  return {
    showToast: {text: 'Tonight’s VAULT post is up.', appearance: 'success'},
    navigateTo: post.url,
  }
}

async function readJson<T>(reqMsg: IncomingMessage): Promise<T> {
  const chunks: Uint8Array[] = []
  reqMsg.on('data', chunk => chunks.push(chunk))
  await once(reqMsg, 'end')
  return JSON.parse(`${Buffer.concat(chunks)}`)
}

function writeJson<T extends PartialJsonValue>(
  status: number,
  json: Readonly<T>,
  rsp: ServerResponse,
): void {
  const body = JSON.stringify(json)
  rsp.writeHead(status, {
    'Content-Length': Buffer.byteLength(body),
    'Content-Type': 'application/json',
  })
  rsp.end(body)
}
