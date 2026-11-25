import {once} from 'node:events'
import type {IncomingMessage, ServerResponse} from 'node:http'
import {RichTextBuilder} from '@devvit/shared-types/richtext/RichTextBuilder.js'
import {context, media, reddit, redis} from '@devvit/web/server'
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
  type RemoveReq,
  type RemoveRsp,
  type ShareReq,
  type ShareRsp,
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
  themeFor,
  W,
} from '../shared/vault.ts'
import {
  claimShare,
  extendStreak,
  getProgress,
  getStats,
  getStreak,
  getVault,
  isRemoved,
  nightOwners,
  nightTotals,
  rankCrack,
  recordAttempt,
  releaseShare,
  removeVault,
  saveVault,
} from './db.ts'

type AnyRsp =
  | InitRsp
  | AttemptRsp
  | PublishRsp
  | ShareRsp
  | RemoveRsp
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
    rsp = {error: 'Not found.', status: 404}
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
      case Endpoint.Share:
        rsp = await routeShare(reqMsg)
        break
      case Endpoint.Remove:
        rsp = await routeRemove(reqMsg)
        break
      case Endpoint.OnMenuNewPost:
        rsp = await routeMenuNewPost()
        break
      case Endpoint.OnAppInstall:
      case Endpoint.OnNewNight:
        // automatic posts: at most one per night, even if the install and the nightly job overlap
        if (await redis.hSetNX('nightposts', String(tonight()), '1'))
          try {
            await createNightPost()
          } catch (err) {
            // let a retry (or the next trigger) try again
            await redis.hDel('nightposts', [String(tonight())])
            throw err
          }
        rsp = {}
        break
      default:
        endpoint satisfies never
        rsp = {error: 'Not found.', status: 404}
    }
  }
  writeJson<PartialJsonValue>(
    'status' in rsp && typeof rsp.status === 'number' ? rsp.status : 200,
    rsp,
    rspMsg,
  )
}

const tonight = () => nightOf(Date.now())

/** Whether the current user moderates this subreddit. Cached for ten minutes so a page load isn't an extra API call. */
async function isModerator(): Promise<boolean> {
  const subredditName = context.subredditName
  const username = await reddit.getCurrentUsername().catch(() => undefined)
  if (!subredditName || !username) return false
  const key = `mod:${subredditName}:${username.toLowerCase()}`
  const cached = await redis.get(key).catch(() => undefined)
  if (cached === '1' || cached === '0') return cached === '1'
  try {
    const mods = await reddit.getModerators({subredditName, username}).all()
    const yes = mods.some(
      m => m.username.toLowerCase() === username.toLowerCase(),
    )
    await redis
      .set(key, yes ? '1' : '0', {expiration: new Date(Date.now() + 600_000)})
      .catch(() => undefined)
    return yes
  } catch {
    return false
  }
}

async function routeRemove(
  reqMsg: IncomingMessage,
): Promise<RemoveRsp | ErrorRsp> {
  if (!(await isModerator()))
    return {error: 'Only moderators can remove vaults.', status: 403}
  const req = await readJson<RemoveReq>(reqMsg)
  const m = typeof req?.key === 'string' ? /^p_(.+)_(\d+)$/.exec(req.key) : null
  if (!m) return {error: 'That vault does not exist.', status: 404}
  const v = await getVault(req.key)
  if (!v) return {error: 'That vault does not exist.', status: 404}
  await removeVault(req.key, v.owner, Number(m[2]))
  return {removed: true}
}

async function playerVaults(
  night: number,
  userId: string | null,
): Promise<PlayerVault[]> {
  const owners = await nightOwners(night)
  // your own vault is always on your home screen, however busy the night is
  if (userId && !owners.includes(userId)) owners.push(userId)
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
  const [username, progress, house, vaults, streak, isMod, removed, totals] =
    await Promise.all([
      reddit.getCurrentUsername().catch(() => undefined),
      userId ? getProgress(userId) : Promise.resolve({}),
      Promise.all(HOUSE.map((_, i) => getStats(houseKey(i)))),
      playerVaults(night, userId),
      userId
        ? getStreak(userId, night)
        : Promise.resolve({count: 0, best: 0, tonight: false}),
      isModerator(),
      userId ? isRemoved(playerKey(userId, night)) : Promise.resolve(false),
      nightTotals(night),
    ])
  const mine = vaults.find(v => v.owner === userId) ?? null
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
    mine,
    others: vaults.filter(v => v.owner !== userId),
    streak,
    isMod,
    removed: !mine && removed,
    tonight: totals,
    now: Date.now(),
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
    return {error: 'That run couldn’t be read. Try again.', status: 400}
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
  // cracking someone else's vault, or a house vault, keeps the nightly streak going
  const streak =
    result === 'won' && !ownVault
      ? await extendStreak(userId, tonight())
      : await getStreak(userId, tonight())
  const rank =
    result === 'won' && !ownVault
      ? await rankCrack(userId, req.key, used)
      : undefined
  return {
    result,
    moves: used,
    progress,
    stats: await getStats(req.key),
    streak,
    ...(rank ? {rank} : {}),
  }
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
    name: req.level.name.trim().replace(/\s+/g, ' ').slice(0, 24),
    map: req.level.map.slice(),
    // rebuilt from the checked fields only: nothing else the client sent is stored or served
    guards: (req.level.guards ?? []).map(g => ({
      path: g.path.map(([x, y]) => [x, y] as [number, number]),
      see: g.see,
      ...(g.face ? {face: g.face} : {}),
    })),
    lasers: (req.level.lasers ?? []).map(l => ({
      at: [l.at[0], l.at[1]] as [number, number],
      dir: l.dir,
      on: l.on,
      off: l.off,
    })),
    cams: (req.level.cams ?? []).map(c => ({
      at: [c.at[0], c.at[1]] as [number, number],
      dirs: c.dirs.slice(),
      ...(c.see ? {see: c.see} : {}),
    })),
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

const GIF_PREFIX = 'data:image/gif;base64,'
const MAX_GIF_CHARS = 2_000_000

/** Posts a run as a comment on the post. The text comes from the server's own replay, never from the client. */
async function routeShare(
  reqMsg: IncomingMessage,
): Promise<ShareRsp | ErrorRsp> {
  const userId = context.userId
  const postId = context.postId
  if (!userId || !postId)
    return {error: 'Log in to Reddit to post your run.', status: 401}
  const req = await readJson<ShareReq>(reqMsg, MAX_SHARE_BODY)
  if (
    typeof req?.key !== 'string' ||
    !Array.isArray(req.moves) ||
    req.moves.length > 400 ||
    !req.moves.every(isMove)
  )
    return {error: 'That run couldn’t be read. Try again.', status: 400}
  const found = await levelFor(req.key)
  if (!found) return {error: 'That vault does not exist.', status: 404}
  const V = parse(found.level)
  const {state, used, illegal} = replay(V, req.moves)
  if (illegal || state.status === 'play')
    return {error: 'Only a finished run can be posted.', status: 400}
  if (!(await claimShare(userId, req.key)))
    return {error: 'You already posted a run for this vault.', status: 409}

  const best = bestMoves(found.level)
  const night = tonight() + 1
  const verb =
    state.status === 'won'
      ? `cracked ${found.level.name} in ${used} moves${used <= best ? ' (a perfect run)' : ` (best possible ${best})`}`
      : `got caught ${state.cause === 'laser' ? 'by a laser' : state.cause === 'camera' ? 'on camera' : 'by a guard'} in ${found.level.name} on move ${used}`
  const text = `VAULT, Night ${night}: I ${verb}.`

  try {
    let gifUrl: string | null = null
    if (
      typeof req.gif === 'string' &&
      req.gif.startsWith(GIF_PREFIX) &&
      req.gif.length < MAX_GIF_CHARS
    ) {
      try {
        gifUrl = (await media.upload({url: req.gif, type: 'gif'})).mediaUrl
      } catch (err) {
        console.error(`gif upload failed; ${err}`)
      }
    }
    // a text line, then the GIF when it uploaded
    const post = (line: string, runAs: 'USER' | 'APP') =>
      gifUrl
        ? reddit.submitComment({
            id: postId,
            richtext: new RichTextBuilder()
              .paragraph(p => p.text({text: line}))
              .animatedImage({mediaUrl: gifUrl, caption: line}),
            runAs,
          })
        : reddit.submitComment({
            id: postId,
            // rich text, never Markdown: a vault name can't become a link or a mention
            richtext: new RichTextBuilder().paragraph(p =>
              p.text({text: line}),
            ),
            runAs,
          })
    let comment: Awaited<ReturnType<typeof post>>
    try {
      comment = await post(text, 'USER')
    } catch (err) {
      // posting as the player can be unavailable; post from the app and name them instead
      console.error(`comment as user failed; ${err}`)
      const name =
        (await reddit.getCurrentUsername().catch(() => undefined)) ?? 'someone'
      comment = await post(`u/${name} ${verb} (VAULT, Night ${night}).`, 'APP')
    }
    return {posted: gifUrl ? 'gif' : 'text', url: comment.permalink}
  } catch (err) {
    await releaseShare(userId, req.key)
    throw err
  }
}

async function createNightPost() {
  const night = tonight()
  const theme = themeFor(night)
  return reddit.submitCustomPost({
    title: theme
      ? `VAULT, Night ${night + 1}: it’s ${theme.name}. Crack tonight’s vaults, then build one that catches everyone`
      : `VAULT, Night ${night + 1}: crack tonight’s vaults, then build one that catches everyone`,
  })
}

async function routeMenuNewPost(): Promise<UiResponse> {
  const post = await createNightPost()
  return {
    showToast: {text: 'Tonight’s VAULT post is up.', appearance: 'success'},
    navigateTo: post.url,
  }
}

/** Request body limits: a shared run carries a GIF; everything else is small. */
const MAX_BODY = 64_000
const MAX_SHARE_BODY = MAX_GIF_CHARS + 64_000

async function readJson<T>(
  reqMsg: IncomingMessage,
  limit = MAX_BODY,
): Promise<T> {
  const chunks: Uint8Array[] = []
  let size = 0
  reqMsg.on('data', (chunk: Uint8Array) => {
    size += chunk.length
    if (size <= limit) chunks.push(chunk)
  })
  await once(reqMsg, 'end')
  // an oversized body reads as nothing, which every route rejects as unreadable
  if (size > limit) return undefined as T
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
