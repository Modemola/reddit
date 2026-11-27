import {requestExpandedMode} from '@devvit/web/client'
import {Endpoint, type InitRsp, type PlayerVault} from '../shared/api.ts'
import type {Level} from '../shared/engine.ts'
import {
  bestMoves,
  dailyVault,
  deadliness,
  nightOf,
  themeFor,
} from '../shared/vault.ts'

const startBtn = document.getElementById('start-btn') as HTMLButtonElement
const nightEl = document.getElementById('night') as HTMLElement
const statsEl = document.getElementById('stats') as HTMLElement
const dailyEl = document.getElementById('daily') as HTMLElement

/** A tiny map of a vault for the card: walls, floor, the gem, guard routes, laser beams, cameras. */
function miniMap(level: Level): void {
  const c = document.getElementById('dmap') as HTMLCanvasElement | null
  const x = c?.getContext('2d')
  if (!c || !x) return
  const t = 5
  const dpr = Math.min(devicePixelRatio || 1, 2)
  c.width = 7 * t * dpr
  c.height = 9 * t * dpr
  x.scale(dpr, dpr)
  level.map.forEach((row, y) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[i]
      x.fillStyle = ch === '#' ? '#5a2f26' : (i + y) % 2 ? '#7d5f42' : '#8a6a4a'
      x.fillRect(i * t, y * t, t, t)
      if (ch === 'G') {
        x.fillStyle = '#5ef0d6'
        x.fillRect(i * t + 1, y * t + 1, t - 2, t - 2)
      }
    }
  })
  const dirs: Record<string, [number, number]> = {
    U: [0, -1],
    D: [0, 1],
    L: [-1, 0],
    R: [1, 0],
  }
  x.fillStyle = '#ff4d5e'
  for (const l of level.lasers ?? []) {
    const [dx, dy] = dirs[l.dir] ?? [0, 0]
    let [px, py] = [l.at[0] + dx, l.at[1] + dy]
    while (level.map[py]?.[px] && level.map[py]?.[px] !== '#') {
      x.fillRect(px * t, py * t + t / 2 - 0.5, t, 1)
      px += dx
      py += dy
    }
  }
  x.fillStyle = '#ffb547'
  for (const g of level.guards ?? [])
    for (const [px, py] of g.path)
      x.fillRect(px * t + 1.5, py * t + 1.5, t - 3, t - 3)
  x.fillStyle = '#8fb3ff'
  for (const cam of level.cams ?? [])
    x.fillRect(cam.at[0] * t + 1, cam.at[1] * t + 1, t - 2, t - 2)
}
function showDaily(
  night: number,
  level: Level,
  best: number,
  stats: {people: number; cracked: number} | null,
  cracked: boolean,
): void {
  miniMap(level)
  ;(document.getElementById('dname') as HTMLElement).textContent =
    `Daily Vault #${night + 1}`
  ;(document.getElementById('dsub') as HTMLElement).textContent = stats?.people
    ? `stumped ${stats.people - stats.cracked} of ${stats.people} · perfect ${best}`
    : `same for everyone · perfect ${best}`
  dailyEl.hidden = false
  document.body.classList.add('has-daily')
  if (!cracked) startBtn.textContent = 'Crack today’s vault'
}

// The web preview (the Vercel build defines VAULT_PREVIEW) has no Reddit around it and no game server.
declare const VAULT_PREVIEW: boolean | undefined
const PREVIEW = typeof VAULT_PREVIEW !== 'undefined' && VAULT_PREVIEW

startBtn.addEventListener('click', ev => {
  if (PREVIEW) location.href = 'game.html'
  else requestExpandedMode(ev, 'game')
})
nightEl.textContent = `Night ${nightOf(Date.now()) + 1}`

async function loadStats(): Promise<void> {
  try {
    const rsp = await fetch(Endpoint.Init, {
      headers: {Accept: 'application/json'},
    })
    if (!rsp.ok) return
    const init: InitRsp = await rsp.json()
    const theme = themeFor(init.night)
    nightEl.textContent = `Night ${init.night + 1}${theme ? ` · ${theme.name}` : ''}`
    if (init.daily)
      showDaily(
        init.daily.night,
        init.daily.level,
        init.daily.best,
        init.daily.stats,
        !!init.progress[init.daily.key]?.won,
      )
    // tonight's real totals from the server (older servers: fall back to summing the listed vaults)
    const built =
      init.tonight?.built ?? init.others.length + (init.mine ? 1 : 0)
    const caught =
      init.tonight?.caught ??
      [...init.others, ...(init.mine ? [init.mine] : [])].reduce(
        (n, v) => n + v.stats.caught,
        0,
      )
    const parts: string[] = []
    if (built)
      parts.push(`${built} ${built === 1 ? 'vault' : 'vaults'} built tonight`)
    if (caught)
      parts.push(`${caught} ${caught === 1 ? 'thief' : 'thieves'} caught`)
    // an empty night is an invitation, not a blank line
    statsEl.textContent = parts.length
      ? parts.join(' · ')
      : 'No vaults built yet. Be the first.'
    // the deadliest player vault tonight, if any has caught someone
    const top = [init.mine, ...init.others]
      .filter(
        (v): v is PlayerVault =>
          v !== null && v.stats.people - v.stats.cracked > 0,
      )
      .sort((a, b) => deadliness(b.stats) - deadliness(a.stats))[0]
    if (top) {
      const line = document.createElement('div')
      line.className = 'votn'
      line.textContent = `Deadliest tonight: ${top.name} by u/${top.author || 'someone'}, stumped ${top.stats.people - top.stats.cracked} of ${top.stats.people}`
      statsEl.after(line)
    }
  } catch {
    // the splash works without numbers
  }
}
if (PREVIEW) {
  statsEl.textContent = 'Web preview · the full game lives on Reddit'
  // the preview builds the same Daily Vault here, once the card is up
  const idle = window.requestIdleCallback ?? (f => setTimeout(f, 300))
  idle(() => {
    const night = nightOf(Date.now())
    const level = dailyVault(night)
    showDaily(night, level, bestMoves(level), null, false)
  })
} else void loadStats()

// A guard with a torch patrols along the bottom of the card while the light sweeps.
// Small, drawn in code, paused when the card is off screen, still for reduced motion.
const scene = document.getElementById('scene') as HTMLCanvasElement
const sctx = scene.getContext('2d')
const still = matchMedia('(prefers-reduced-motion: reduce)').matches
let floorAt = -1e9
let floorY = 0

// The room behind the card: brick everywhere, a planked corridor along the bottom where the guard walks,
// lit the way the game is (wall faces, rim light, contact shadows). Painted once; repainted only when the
// card's size or the corridor's height changes.
const room = document.getElementById('room') as HTMLCanvasElement | null
let roomSig = ''
const hash = (a: number, b: number, c: number): number => {
  const n = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453
  return n - Math.floor(n)
}
function paintRoom(
  w: number,
  h: number,
  dpr: number,
  gy: number,
  s: number,
): void {
  const rc = room?.getContext('2d')
  if (!room || !rc) return
  const sig = `${w}x${h}@${dpr}:${Math.round(gy)}`
  if (sig === roomSig) return
  roomSig = sig
  room.width = Math.round(w * dpr)
  room.height = Math.round(h * dpr)
  rc.setTransform(dpr, 0, 0, dpr, 0, 0)
  const T = s * 1.5
  const bh = T / 3
  const bw = T / 2
  // brick
  rc.fillStyle = '#2a1c18'
  rc.fillRect(0, 0, w, h)
  for (let r = 0; r * bh < h; r++) {
    const off = r % 2 ? bw / 2 : 0
    for (let c = -1; c * bw + off < w; c++) {
      rc.globalAlpha = 0.72 + 0.28 * hash(c, r, 1)
      rc.fillStyle = '#6e3a2e'
      rc.fillRect(c * bw + off + 1, r * bh + 1, bw - 2, bh - 2)
      rc.globalAlpha = 0.1
      rc.fillStyle = '#ffd9c0'
      rc.fillRect(c * bw + off + 1, r * bh + 1, bw - 2, 1)
    }
  }
  rc.globalAlpha = 1
  // the corridor: planks laid across, three rows
  const top = gy - T * 0.5
  const bottom = Math.min(h, gy + T * 0.5)
  const face = T * 0.26
  const ph = (bottom - top) / 3
  for (let i = 0; i < 3; i++) {
    const seg = T * 1.6
    const shift = hash(i, 0, 7) * seg
    for (let k = -1; k * seg - shift < w; k++) {
      rc.fillStyle = hash(k, i, 2) > 0.5 ? '#8a6a4a' : '#7d5f42'
      rc.fillRect(k * seg - shift, top + i * ph, seg, ph)
      rc.fillStyle = '#4e3a28'
      rc.fillRect(k * seg - shift, top + i * ph, 1, ph)
    }
    rc.fillStyle = '#4e3a28'
    rc.fillRect(0, top + (i + 1) * ph - 1, w, 1)
  }
  // the wall's front face above the corridor, its lit lip, and the shadow it casts on the floor
  const fg = rc.createLinearGradient(0, top - face, 0, top)
  fg.addColorStop(0, '#3b2722')
  fg.addColorStop(1, '#1f1512')
  rc.fillStyle = fg
  rc.fillRect(0, top - face, w, face)
  rc.fillStyle = 'rgba(255,214,186,0.22)'
  rc.fillRect(0, top - face, w, 1.5)
  const sh = rc.createLinearGradient(0, top, 0, top + T * 0.45)
  sh.addColorStop(0, 'rgba(10,5,2,0.5)')
  sh.addColorStop(1, 'rgba(10,5,2,0)')
  rc.fillStyle = sh
  rc.fillRect(0, top, w, T * 0.45)
  if (bottom < h) {
    rc.fillStyle = 'rgba(255,222,200,0.16)'
    rc.fillRect(0, bottom, w, 1.5)
  }
  // the room falls off into darkness at its edges
  const v = rc.createRadialGradient(
    w / 2,
    h * 0.45,
    Math.min(w, h) * 0.3,
    w / 2,
    h * 0.45,
    Math.hypot(w, h) * 0.6,
  )
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(0,0,0,0.45)')
  rc.fillStyle = v
  rc.fillRect(0, 0, w, h)
}
function drawScene(now: number): void {
  if (!sctx) return
  const dpr = Math.min(devicePixelRatio || 1, 2)
  const w = scene.clientWidth
  const h = scene.clientHeight
  if (scene.width !== Math.round(w * dpr)) {
    scene.width = Math.round(w * dpr)
    scene.height = Math.round(h * dpr)
  }
  sctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  sctx.clearRect(0, 0, w, h)
  const s = Math.min(w, h) / 10
  const span = w * 0.36
  const phase = still ? 0.3 : (now / 9000) % 1
  const dir = phase < 0.5 ? 1 : -1
  const x = w / 2 + span * Math.sin(phase * Math.PI * 2 - Math.PI / 2) * -1
  // walk below the button when the card is short, so the guard never crosses it
  // (measured twice a second, not every frame: the stats line can push the button down once)
  if (now - floorAt > 500) {
    floorAt = now
    floorY =
      startBtn.getBoundingClientRect().bottom -
      scene.getBoundingClientRect().top
  }
  const y = Math.min(h - s * 0.55, Math.max(h - s * 1.3, floorY + s * 0.85))
  paintRoom(w, h, dpr, y, s)
  const ang = dir > 0 ? 0 : Math.PI
  const sweep = still ? 0 : Math.sin(now / 1300) * 0.35
  // the torch beam
  sctx.save()
  sctx.translate(x, y)
  sctx.rotate(ang - 0.55 + sweep)
  const beam = sctx.createLinearGradient(0, 0, s * 6, 0)
  beam.addColorStop(0, 'rgba(255,181,71,0.34)')
  beam.addColorStop(1, 'rgba(255,181,71,0)')
  sctx.fillStyle = beam
  sctx.beginPath()
  sctx.moveTo(s * 0.2, -s * 0.2)
  sctx.lineTo(s * 6, -s * 2.2)
  sctx.lineTo(s * 6, s * 2.2)
  sctx.lineTo(s * 0.2, s * 0.2)
  sctx.closePath()
  sctx.fill()
  sctx.restore()
  // a pool of warm light
  const pool = sctx.createRadialGradient(x, y, 0, x, y, s * 2.6)
  pool.addColorStop(0, 'rgba(255,170,80,0.28)')
  pool.addColorStop(1, 'rgba(255,170,80,0)')
  sctx.fillStyle = pool
  sctx.fillRect(x - s * 3, y - s * 3, s * 6, s * 6)
  // the guard, from above, with a little walking bob
  const bob = still ? 0 : Math.abs(Math.sin(now / 180)) * s * 0.06
  sctx.save()
  sctx.translate(x, y - bob)
  sctx.rotate(ang)
  sctx.fillStyle = '#d98a34'
  sctx.beginPath()
  sctx.ellipse(-s * 0.05, 0, s * 0.3, s * 0.48, 0, 0, 7)
  sctx.fill()
  sctx.fillStyle = '#f3c48c'
  sctx.beginPath()
  sctx.arc(s * 0.05, 0, s * 0.22, 0, 7)
  sctx.fill()
  sctx.fillStyle = '#1f2740'
  sctx.beginPath()
  sctx.arc(0, 0, s * 0.19, 0, 7)
  sctx.fill()
  sctx.beginPath()
  sctx.moveTo(s * 0.1, -s * 0.17)
  sctx.quadraticCurveTo(s * 0.44, 0, s * 0.1, s * 0.17)
  sctx.closePath()
  sctx.fill()
  sctx.fillStyle = '#ffd27a'
  sctx.beginPath()
  sctx.arc(
    s * 0.12,
    s * 0.5,
    s * 0.09 * (1 + (still ? 0 : 0.15 * Math.sin(now / 70))),
    0,
    7,
  )
  sctx.fill()
  sctx.restore()
}
// exactly one frame is ever pending, however often the page is hidden and shown
let pending = 0
function loop(now: number): void {
  pending = 0
  drawScene(now)
  if (!still && document.visibilityState === 'visible') schedule()
}
function schedule(): void {
  if (!pending) pending = requestAnimationFrame(loop)
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') schedule()
  else if (pending) {
    cancelAnimationFrame(pending)
    pending = 0
  }
})
schedule()
