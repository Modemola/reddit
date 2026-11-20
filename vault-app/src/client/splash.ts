import {requestExpandedMode} from '@devvit/web/client'
import {Endpoint, type InitRsp, type PlayerVault} from '../shared/api.ts'
import {nightOf} from '../shared/vault.ts'

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
    nightEl.textContent = `Night ${init.night + 1}`
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
    statsEl.textContent = parts.join(' · ')
    // the deadliest player vault tonight, if any has caught someone
    const deadliness = (v: PlayerVault) => v.stats.caught - v.stats.cracked * 3
    const top = [init.mine, ...init.others]
      .filter((v): v is PlayerVault => v !== null && v.stats.caught > 0)
      .sort((a, b) => deadliness(b) - deadliness(a))[0]
    if (top) {
      const line = document.createElement('div')
      line.className = 'votn'
      line.textContent = `Vault of the night: ${top.name} by u/${top.author || 'someone'}, caught ${top.stats.caught}`
      statsEl.after(line)
    }
  } catch {
    // the splash works without numbers
  }
}
void loadStats()
