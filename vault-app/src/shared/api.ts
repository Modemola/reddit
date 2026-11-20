import type {Level, Move} from './engine.ts'
import type {Parts} from './vault.ts'

/** Generic error detail for all responses. */
export type ErrorRsp = {error: string; status: number}

/** How one player has done on one vault. */
export type Progress = {tries: number; won: boolean; moves: number}

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

export type InitRsp = {
  night: number
  username: string | null
  userId: string | null
  parts: Parts
  progress: Record<string, Progress>
  house: Record<string, VaultStats>
  mine: PlayerVault | null
  others: PlayerVault[]
}

/** The client sends only its moves; the server replays them to decide what happened. */
export type AttemptReq = {key: string; moves: Move[]}
export type AttemptRsp = {
  result: 'won' | 'caught' | 'abandoned'
  moves: number
  progress: Progress
  stats: VaultStats
}

export type PublishReq = {level: Level}
export type PublishRsp = {vault: PlayerVault}

export type Endpoint = (typeof Endpoint)[keyof typeof Endpoint]
export const Endpoint = {
  Init: 'api/init',
  Attempt: 'api/attempt',
  Publish: 'api/publish',
  OnAppInstall: 'internal/on/app/install',
  OnMenuNewPost: 'internal/on/menu/new-post',
  OnNewNight: 'internal/on/scheduler/new-night',
} as const

export const EndpointMethod = {
  [Endpoint.Init]: 'GET',
  [Endpoint.Attempt]: 'POST',
  [Endpoint.Publish]: 'POST',
  [Endpoint.OnAppInstall]: 'POST',
  [Endpoint.OnMenuNewPost]: 'POST',
  [Endpoint.OnNewNight]: 'POST',
} as const satisfies {[endpoint: string]: 'GET' | 'POST'}
