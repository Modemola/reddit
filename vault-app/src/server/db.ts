// Redis layout
//   vault:{key}        hash  owner, author, name, level (JSON), best     a player's vault for one night
//   night:{n}:vaults   zset  owner -> publish time                       who built a vault that night
//   night:{n}:deadly   zset  owner -> deadliness                         the same vaults, deadliest first
//   stats:{key}        hash  tries, caught, cracked                      public numbers for any vault
//   people:{key}       hash  userId -> 1                                 who has tried it
//   marks:{key}        hash  tile index -> count                         where people were caught
//   prog:{userId}      hash  key -> Progress (JSON)                      one player's record
//   nightstats:{n}     hash  caught                                      tonight's counted busts, for the feed card
//   tally:{key}        hash  userId:busts, userId:won                    how much each player has moved a vault's numbers
import {redis} from '@devvit/web/server'
import type {
  PlayerVault,
  Progress,
  Rank,
  Streak,
  VaultStats,
} from '../shared/api.ts'
import type {Level} from '../shared/engine.ts'
import {bestMoves, dailyVault, deadliness, nightOf} from '../shared/vault.ts'

export async function getStats(key: string): Promise<VaultStats> {
  const [s, people, marks] = await Promise.all([
    redis.hGetAll(`stats:${key}`),
    redis.hLen(`people:${key}`),
    redis.hGetAll(`marks:${key}`),
  ])
  const marksOut: Record<string, number> = {}
  for (const [k, v] of Object.entries(marks)) marksOut[k] = Number(v)
  return {
    tries: Number(s.tries ?? 0),
    caught: Number(s.caught ?? 0),
    cracked: Number(s.cracked ?? 0),
    people,
    marks: marksOut,
  }
}

export async function getProgress(
  userId: string,
): Promise<Record<string, Progress>> {
  const all = await redis.hGetAll(`prog:${userId}`)
  const out: Record<string, Progress> = {}
  for (const [k, v] of Object.entries(all)) {
    try {
      out[k] = JSON.parse(v)
    } catch {
      // ignore a damaged record
    }
  }
  return out
}

/** How many of one person's runs on a vault count toward its public numbers. */
export const STAT_TRIES = 10

/** Records one finished attempt. Returns the player's updated record. */
export async function recordAttempt(
  userId: string,
  key: string,
  result: 'won' | 'caught',
  moves: number,
  caughtAt: number | null,
  countsForStats: boolean,
): Promise<Progress> {
  const prev = (await getProgress(userId))[key] ?? {
    tries: 0,
    won: false,
    moves: 0,
  }
  const next: Progress = {
    tries: prev.tries + 1,
    won: prev.won || result === 'won',
    moves:
      result === 'won'
        ? prev.won
          ? Math.min(prev.moves, moves)
          : moves
        : prev.moves,
  }
  await redis.hSet(`prog:${userId}`, {[key]: JSON.stringify(next)})
  // One person can shape a vault's public numbers only so much: their first crack
  // always counts, but busts after they cracked it, or past their first few, don't
  // (nobody can paint the floor red alone). Decided with atomic Redis operations, so
  // sending many runs at once doesn't get around it.
  let counts = false
  // (the player's own record still counts too, so history from before the tally can't be replayed)
  if (
    countsForStats &&
    !prev.won &&
    (result === 'won' || prev.tries < STAT_TRIES)
  ) {
    const tally = `tally:${key}`
    if (result === 'won') {
      counts = !!(await redis.hSetNX(tally, `${userId}:won`, '1'))
      // after a crack, none of this player's busts count any more
      if (counts) await redis.hIncrBy(tally, `${userId}:busts`, 1_000_000)
    } else {
      counts = (await redis.hIncrBy(tally, `${userId}:busts`, 1)) <= STAT_TRIES
    }
  }
  if (counts) {
    await redis.hSet(`people:${key}`, {[userId]: '1'})
    await redis.hIncrBy(`stats:${key}`, 'tries', 1)
    if (result === 'caught') {
      await redis.hIncrBy(`stats:${key}`, 'caught', 1)
      // filed under the vault's own night (a player vault), or tonight (a training vault)
      const night = /^p_.+_(\d+)$/.exec(key)?.[1] ?? nightOf(Date.now())
      await redis.hIncrBy(`nightstats:${night}`, 'caught', 1)
      if (caughtAt !== null)
        await redis.hIncrBy(`marks:${key}`, String(caughtAt), 1)
    } else {
      await redis.hIncrBy(`stats:${key}`, 'cracked', 1)
    }
    const [, owner, night] = /^p_(.+)_(\d+)$/.exec(key) ?? []
    if (owner && night) {
      const [s, people] = await Promise.all([
        redis.hGetAll(`stats:${key}`),
        redis.hLen(`people:${key}`),
      ])
      await redis.zAdd(`night:${night}:deadly`, {
        member: owner,
        score: deadliness({people, cracked: Number(s.cracked ?? 0)}),
      })
    }
  }
  return next
}

export async function getVault(
  key: string,
): Promise<Omit<PlayerVault, 'stats'> | null> {
  const v = await redis.hGetAll(`vault:${key}`)
  if (!v.level || !v.owner || v.removed) return null
  try {
    const level: Level = JSON.parse(v.level)
    return {
      key,
      owner: v.owner,
      author: v.author ?? '',
      name: v.name ?? level.name,
      level,
      best: Number(v.best ?? 0),
    }
  } catch {
    return null
  }
}

/** Saves a player's vault for a night. Returns false if they already have one. */
export async function saveVault(
  night: number,
  vault: Omit<PlayerVault, 'stats'>,
): Promise<boolean> {
  const claimed = await redis.hSetNX(`vault:${vault.key}`, 'owner', vault.owner)
  if (!claimed) return false
  await redis.hSet(`vault:${vault.key}`, {
    author: vault.author,
    name: vault.name,
    level: JSON.stringify(vault.level),
    best: String(vault.best),
  })
  await redis.zAdd(`night:${night}:vaults`, {
    member: vault.owner,
    score: Date.now(),
  })
  await redis.zAdd(`night:${night}:deadly`, {member: vault.owner, score: 0})
  return true
}

/** Tonight's real totals for the feed card: vaults built and thieves caught (counted runs only). */
export async function nightTotals(
  night: number,
): Promise<{built: number; caught: number}> {
  const [built, s] = await Promise.all([
    redis.zCard(`night:${night}:vaults`),
    redis.hGetAll(`nightstats:${night}`),
  ])
  return {built, caught: Number(s.caught ?? 0)}
}

/** Whether a moderator removed this vault. */
export async function isRemoved(key: string): Promise<boolean> {
  return !!(await redis.hGetAll(`vault:${key}`)).removed
}

/**
 * Whose vaults tonight's list shows: the deadliest and the newest (so a fresh vault
 * gets a chance to be played), never more than a page, deadliest first.
 */
export async function nightOwners(
  night: number,
  deadliest = 40,
  newest = 20,
): Promise<string[]> {
  const top = (zset: string, n: number) =>
    redis.zRange(zset, 0, n - 1, {by: 'rank', reverse: true})
  const [deadly, fresh] = await Promise.all([
    top(`night:${night}:deadly`, deadliest),
    top(`night:${night}:vaults`, newest),
  ])
  return [...new Set([...deadly, ...fresh].map(r => r.member))]
}

/** One shared comment per player per vault. Returns false if they already shared this one. */
export async function claimShare(
  userId: string,
  key: string,
): Promise<boolean> {
  return (await redis.hSetNX(`shared:${userId}`, key, String(Date.now()))) === 1
}

export async function releaseShare(userId: string, key: string): Promise<void> {
  await redis.hDel(`shared:${userId}`, [key])
}

/** A streak counts nights in a row with at least one crack. A missed night resets it. */
export async function getStreak(
  userId: string,
  night: number,
): Promise<Streak> {
  const s = await redis.hGetAll(`streak:${userId}`)
  const last = Number(s.last ?? -9)
  const count = last >= night - 1 ? Number(s.count ?? 0) : 0
  return {count, best: Number(s.best ?? 0), tonight: last === night}
}

/** Called after a crack. Extends the streak once per night. */
export async function extendStreak(
  userId: string,
  night: number,
): Promise<Streak> {
  const cur = await getStreak(userId, night)
  if (cur.tonight) return cur
  const count = cur.count + 1
  const best = Math.max(cur.best, count)
  await redis.hSet(`streak:${userId}`, {
    last: String(night),
    count: String(count),
    best: String(best),
  })
  return {count, best, tonight: true}
}

/** Remembers each cracker's fewest moves on a vault, and ranks a run against the others. */
export async function rankCrack(
  userId: string,
  key: string,
  moves: number,
  name?: string,
): Promise<Rank> {
  const all = await redis.hGetAll(`best:${key}`)
  const mine = Number(all[userId] ?? Number.POSITIVE_INFINITY)
  if (moves < mine) {
    await redis.hSet(`best:${key}`, {[userId]: String(moves)})
    // when they got there, so ties on the leaderboard go to whoever was first
    await redis.hSet(`bestAt:${key}`, {[userId]: String(Date.now())})
  }
  if (name) await redis.hSet(`names:${key}`, {[userId]: name})
  const others = Object.entries(all)
    .filter(([u]) => u !== userId)
    .map(([, v]) => Number(v))
  return {others: others.length, slower: others.filter(v => v > moves).length}
}

/** A night's Daily Vault, generated once and kept, so it never changes even if the generator does. */
export async function getDaily(
  night: number,
): Promise<{level: Level; best: number}> {
  const cached = await redis.get(`daily:${night}`)
  if (cached)
    try {
      return JSON.parse(cached)
    } catch {
      // regenerate below
    }
  const level = dailyVault(night)
  const out = {level, best: bestMoves(level)}
  await redis.set(`daily:${night}`, JSON.stringify(out))
  return out
}

/** The fastest cracks of a vault (ties: whoever got there first), and where this player stands. */
export async function leaders(
  key: string,
  userId: string | null,
  top = 5,
): Promise<{
  leaders: {name: string; moves: number}[]
  me: {place: number; moves: number; of: number} | null
}> {
  const [best, at, names] = await Promise.all([
    redis.hGetAll(`best:${key}`),
    redis.hGetAll(`bestAt:${key}`),
    redis.hGetAll(`names:${key}`),
  ])
  const rows = Object.entries(best)
    .map(([u, m]) => ({u, moves: Number(m), at: Number(at[u] ?? 0)}))
    .sort((a, b) => a.moves - b.moves || a.at - b.at)
  const i = userId ? rows.findIndex(r => r.u === userId) : -1
  return {
    leaders: rows
      .slice(0, top)
      .map(r => ({name: names[r.u] ?? 'a thief', moves: r.moves})),
    me:
      i >= 0
        ? {place: i + 1, moves: rows[i]?.moves ?? 0, of: rows.length}
        : null,
  }
}

/** Takes a player vault off its night's list and stops it being played. */
export async function removeVault(
  key: string,
  owner: string,
  night: number,
): Promise<void> {
  await redis.hSet(`vault:${key}`, {removed: String(Date.now())})
  await redis.zRem(`night:${night}:vaults`, [owner])
  await redis.zRem(`night:${night}:deadly`, [owner])
}
