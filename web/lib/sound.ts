// UI sounds are Minecraft's own, copied out of your game by `npm run icons` into /mc/sound. If they aren't there, the site stays silent.
let muted = false
try { muted = localStorage.getItem('sn_sound') === 'off' } catch { /* private mode */ }

let volume = 0.7
try { const v = parseFloat(localStorage.getItem('sn_vol') || ''); if (v >= 0 && v <= 1) volume = v } catch { /* private mode */ }
export const getVolume = () => volume
export function setVolume(v: number) {
  volume = Math.max(0, Math.min(1, v))
  try { localStorage.setItem('sn_vol', String(volume)) } catch { /* private mode */ }
}
export const soundOn = () => !muted
export function setSound(on: boolean) {
  muted = !on
  try { localStorage.setItem('sn_sound', on ? 'on' : 'off') } catch { /* private mode */ }
}

export type SoundName = 'click' | 'ok' | 'err' | 'del' | 'open'
const VOL: Record<SoundName, number> = { click: 0.35, ok: 0.4, err: 0.4, del: 0.4, open: 0.3 }
const missing = new Set<string>()

export function play(name: SoundName) {
  if (muted || typeof window === 'undefined' || missing.has(name)) return
  try {
    const a = new Audio(`/mc/sound/${name}.ogg`)
    a.volume = Math.min(1, VOL[name] * volume * 1.4)
    a.addEventListener('error', () => missing.add(name))
    void a.play().catch(() => { /* blocked or missing */ })
  } catch { /* audio not available */ }
}
