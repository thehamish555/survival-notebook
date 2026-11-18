'use client'
import { useEffect, useState } from 'react'
import { canInstall, currentSub, disablePush, enablePush, install, installed, isIos, onInstallChange, pushSupported, startPwa } from '@/lib/pwa'
import { api } from '@/lib/api'
import { useToast } from '@/lib/ui'

/** Registers the service worker once per page load. */
export function PwaStart() { useEffect(() => { startPwa() }, []); return null }

/** Account page card: install the app on this device and turn notifications on or off. */
export function AppCard() {
  const toast = useToast()
  const [, bump] = useState(0), [on, setOn] = useState<boolean | null>(null), [busy, setBusy] = useState(false)
  useEffect(() => onInstallChange(() => bump(n => n + 1)), [])
  useEffect(() => { currentSub().then(s => setOn(!!s)).catch(() => setOn(false)) }, [])
  const flip = async () => {
    setBusy(true)
    try { if (on) { await disablePush(); setOn(false); toast('Notifications off on this device', 'ok') } else { await enablePush(); setOn(true); toast('Notifications on', 'ok') } }
    catch (e: any) { toast(e.message, 'err') }
    setBusy(false)
  }
  return <div className="card"><h2>App and notifications</h2>
    <p className="mut">Install the notebook like an app. It opens in its own window and still shows your notebooks when you're offline (read-only).</p>
    {installed() ? <p className="pill t-green">Installed on this device</p>
      : canInstall() ? <button onClick={() => install()}>Install app</button>
      : <p className="mut small">{isIos() ? 'On iPhone or iPad: tap Share, then Add to Home Screen.' : 'Use your browser’s menu and choose Install or Add to Home Screen.'}</p>}
    <h3 style={{ marginTop: 18 }}>Notifications</h3>
    <p className="mut">Turn notifications on for each device you want them on. Choose what you get below. That part applies to every device.</p>
    {!pushSupported() ? <p className="mut small">{isIos() && !installed() ? 'On iPhone and iPad, install the app first, then turn notifications on from the app.' : 'This browser can’t show notifications.'}</p>
      : <div className="row"><button className={on ? 'ghost' : ''} disabled={busy || on === null} onClick={flip}>{on ? 'Turn off on this device' : 'Turn on for this device'}</button>
        {on && <button className="ghost" disabled={busy} onClick={() => api('/push/test', 'POST').then(() => toast('Sent. It should arrive in a few seconds.', 'ok')).catch((e: any) => toast(e.message, 'err'))}>Send a test</button>}</div>}
    <NotifyChoices />
  </div>
}

const KINDS: [string, string, string][] = [
  ['assigned', 'Assigned to you', 'Someone gives you a to-do or a farm'],
  ['finished', 'Your to-dos finished', 'Someone finishes a to-do you made'],
  ['built', 'Farms built', 'Someone marks a farm as built'],
  ['deaths', 'Deaths', 'A teammate dies'],
  ['invited', 'Added to a notebook', 'Someone adds you to their notebook'],
  ['recap', 'Weekly recap', 'Sunday evening: what your team did that week'],
  ['online', 'Someone starts playing', 'A teammate joins after 20 minutes or more away'],
  ['places', 'New places', 'A teammate adds places'],
  ['todos', 'New to-dos', 'A teammate adds to-dos'],
]
/** Which kinds of notification you get, saved on your account. */
function NotifyChoices() {
  const toast = useToast(), [prefs, setPrefs] = useState<Record<string, boolean> | null>(null)
  useEffect(() => { api('/push/prefs').then(setPrefs).catch(() => setPrefs(null)) }, [])
  if (!prefs) return null
  const flip = (k: string) => {
    const next = { ...prefs, [k]: !prefs[k] }; setPrefs(next)
    api('/push/prefs', 'PUT', { [k]: next[k] }).then(setPrefs).catch((e: any) => { setPrefs(prefs); toast(e.message, 'err') })
  }
  return <div className="notifylist">
    {KINDS.map(([k, label, hint]) => <div key={k} className="notifyrow">
      <div><div>{label}</div><div className="mut small">{hint}</div></div>
      <button type="button" className={`pill togglepill t-${prefs[k] ? 'green' : 'gray'}`} aria-pressed={prefs[k]} onClick={() => flip(k)}>{prefs[k] ? 'On' : 'Off'}</button>
    </div>)}
  </div>
}
