// Redis layout
//   vault:{key}        hash  owner, author, name, level (JSON), best     a player's vault for one night
//   night:{n}:vaults   zset  owner -> publish time                       who built a vault that night
//   stats:{key}        hash  tries, caught, cracked                      public numbers for any vault
//   people:{key}       hash  userId -> 1                                 who has tried it
//   marks:{key}        hash  tile index -> count                         where people were caught
//   prog:{userId}      hash  key -> Progress (JSON)                      one player's record
import {redis} from '@devvit/web/server'
import type {PlayerVault, Progress, Streak, VaultStats} from '../shared/api.ts'
import type {Level} from '../shared/engine.ts'

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
  if (countsForStats) {
    await redis.hSet(`people:${key}`, {[userId]: '1'})
    await redis.hIncrBy(`stats:${key}`, 'tries', 1)
    if (result === 'caught') {
      await redis.hIncrBy(`stats:${key}`, 'caught', 1)
      if (caughtAt !== null)
        await redis.hIncrBy(`marks:${key}`, String(caughtAt), 1)
    } else if (!prev.won) {
      await redis.hIncrBy(`stats:${key}`, 'cracked', 1)
    }
  }
  return next
}

export async function getVault(
  key: string,
): Promise<Omit<PlayerVault, 'stats'> | null> {
  const v = await redis.hGetAll(`vault:${key}`)
  if (!v.level || !v.owner) return null
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
  return true
}

export async function nightOwners(
  night: number,
  limit = 60,
): Promise<string[]> {
  const rows = await redis.zRange(`night:${night}:vaults`, 0, limit - 1, {
    by: 'rank',
    reverse: true,
  })
  return rows.map(r => r.member)
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
