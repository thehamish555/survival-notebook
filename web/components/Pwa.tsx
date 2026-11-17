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
    <p className="mut">Get a notification when someone assigns you a to-do or a farm, or adds you to a notebook. This is set per device.</p>
    {!pushSupported() ? <p className="mut small">{isIos() && !installed() ? 'On iPhone and iPad, install the app first, then turn notifications on from the app.' : 'This browser can’t show notifications.'}</p>
      : <div className="row"><button className={on ? 'ghost' : ''} disabled={busy || on === null} onClick={flip}>{on ? 'Turn off on this device' : 'Turn on for this device'}</button>
        {on && <button className="ghost" disabled={busy} onClick={() => api('/push/test', 'POST').then(() => toast('Sent. It should arrive in a few seconds.', 'ok')).catch((e: any) => toast(e.message, 'err'))}>Send a test</button>}</div>}
  </div>
}
