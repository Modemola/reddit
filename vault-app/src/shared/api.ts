import type {Level, Move} from './engine.ts'
import type {Parts} from './vault.ts'

/** Generic error detail for all responses. */
export type ErrorRsp = {error: string; status: number}

/** How one player has done on one vault. */
export type Progress = {tries: number; won: boolean; moves: number}

/** Nights in a row with at least one crack. `tonight` is true once tonight already counts. */
export type Streak = {count: number; best: number; tonight: boolean}

/** Public numbers for one vault. `marks` maps tile index (y * 7 + x) to how many people were caught there. */
export type VaultStats = {
  tries: number
  caught: number
  cracked: number
  people: number
  marks: Record<string, number>
}

export type PlayerVault = {
  key: string
  owner: string
  author: string
  name: string
  level: Level
  best: number
  stats: VaultStats
}

/** The night's Daily Vault: one official vault everyone plays, with its leaderboard. */
export type DailyInfo = {
  key: string
  night: number
  name: string
  level: Level
  best: number
  stats: VaultStats
  /** fastest cracks first (ties: whoever got there first) */
  leaders: {name: string; moves: number}[]
  /** this player's place on the board, if they've cracked it */
  me: {place: number; moves: number; of: number} | null
}

/** Last night, in a few numbers (the recap comment and the home screen's 'Last night' card). */
export type LastNight = {
  night: number
  built: number
  caught: number
  deadliest: {
    name: string
    author: string
    stumped: number
    people: number
  } | null
  daily: {
    name: string
    best: number
    cracked: number
    people: number
    fastest: {name: string; moves: number} | null
  }
  /** this player's own vault last night */
  mine: {name: string; caught: number; cracked: number; people: number} | null
  /** this player's place on last night's Daily Vault */
  place: {place: number; of: number; moves: number} | null
}

export type InitRsp = {
  night: number
  username: string | null
  userId: string | null
  parts: Parts
  progress: Record<string, Progress>
  house: Record<string, VaultStats>
  mine: PlayerVault | null
  others: PlayerVault[]
  streak: Streak
  /** True for moderators of this subreddit, who can remove player vaults. */
  isMod: boolean
  /** True when a moderator removed this player's vault tonight (they can build again tomorrow). */
  removed?: boolean
  /** The server's clock (ms), so a device whose clock is off still knows when the night changes. */
  now?: number
  /** How last night went, for this player: their vault, their Daily Vault place, the deadliest vault. */
  lastNight?: LastNight
  /** Tonight's Daily Vault (absent from older servers). */
  daily?: DailyInfo
  /** Tonight's real totals, not limited to the vaults listed. */
  tonight?: {built: number; caught: number}
}

/** The client sends only its moves; the server replays them to decide what happened. */
export type AttemptReq = {key: string; moves: Move[]}
export type AttemptRsp = {
  result: 'won' | 'caught' | 'abandoned'
  moves: number
  progress: Progress
  stats: VaultStats
  streak: Streak
  /** After a crack: how this run compares with everyone else who cracked the vault. */
  rank?: Rank
}

/** `others` is how many other people cracked it; `slower` how many of them took more moves than this run. */
export type Rank = {others: number; slower: number}

/** Post a run as a comment. The server replays `moves` and writes the text itself; `gif` is an optional data URL. */
export type ShareReq = {key: string; moves: Move[]; gif?: string}
export type ShareRsp = {posted: 'gif' | 'text'; url: string}

/** Moderators only: take a player vault off tonight's list. */
export type RemoveReq = {key: string}
export type RemoveRsp = {removed: true}

export type PublishReq = {level: Level}
export type PublishRsp = {vault: PlayerVault}

export type Endpoint = (typeof Endpoint)[keyof typeof Endpoint]
export const Endpoint = {
  Init: 'api/init',
  Attempt: 'api/attempt',
  Publish: 'api/publish',
  Share: 'api/share',
  Remove: 'api/remove',
  OnAppInstall: 'internal/on/app/install',
  OnMenuNewPost: 'internal/on/menu/new-post',
  OnNewNight: 'internal/on/scheduler/new-night',
} as const

export const EndpointMethod = {
  [Endpoint.Init]: 'GET',
  [Endpoint.Attempt]: 'POST',
  [Endpoint.Publish]: 'POST',
  [Endpoint.Share]: 'POST',
  [Endpoint.Remove]: 'POST',
  [Endpoint.OnAppInstall]: 'POST',
  [Endpoint.OnMenuNewPost]: 'POST',
  [Endpoint.OnNewNight]: 'POST',
} as const satisfies {[endpoint: string]: 'GET' | 'POST'}
