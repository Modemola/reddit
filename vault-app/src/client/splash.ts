import {requestExpandedMode} from '@devvit/web/client'
import {Endpoint, type InitRsp, type PlayerVault} from '../shared/api.ts'
import {deadliness, nightOf, themeFor} from '../shared/vault.ts'

const startBtn = document.getElementById('start-btn') as HTMLButtonElement
const nightEl = document.getElementById('night') as HTMLElement
const statsEl = document.getElementById('stats') as HTMLElement

startBtn.addEventListener('click', ev => requestExpandedMode(ev, 'game'))
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
    const built = init.others.length + (init.mine ? 1 : 0)
    const caught = [
      ...Object.values(init.house),
      ...init.others.map(v => v.stats),
    ].reduce((n, s) => n + s.caught, 0)
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
      line.textContent = `Vault of the night: ${top.name} by u/${top.author || 'someone'}, stumped ${top.stats.people - top.stats.cracked} of ${top.stats.people}`
      statsEl.after(line)
    }
  } catch {
    // the splash works without numbers
  }
}
void loadStats()

// A guard with a torch patrols along the bottom of the card while the light sweeps.
// Small, drawn in code, paused when the card is off screen, still for reduced motion.
const scene = document.getElementById('scene') as HTMLCanvasElement
const sctx = scene.getContext('2d')
const still = matchMedia('(prefers-reduced-motion: reduce)').matches
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
  const btn = startBtn.getBoundingClientRect()
  const top = scene.getBoundingClientRect().top
  const y = Math.min(h - s * 0.55, Math.max(h - s * 1.3, btn.bottom - top + s * 0.85))
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
let running = true
function loop(now: number): void {
  drawScene(now)
  if (running && !still) requestAnimationFrame(loop)
}
document.addEventListener('visibilitychange', () => {
  const was = running
  running = document.visibilityState === 'visible'
  if (running && !was) requestAnimationFrame(loop)
})
requestAnimationFrame(loop)
