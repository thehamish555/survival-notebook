'use client'
import { useEffect, useRef, useState } from 'react'
import { googleLogin, setToken } from '@/lib/api'

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ''

/** "Continue with Google". Locally, with no client ID, a small dev form stands in for it (the API only accepts that outside production). */
export function GoogleSignIn({ onDone, onError }: { onDone: () => void; onError: (m: string) => void }) {
  const box = useRef<HTMLDivElement>(null), [dev, setDev] = useState({ email: '', name: '' })
  const send = (credential: string) => fetchLogin(credential).then(onDone).catch((e: any) => onError(e.message))

  useEffect(() => {
    if (!CLIENT_ID) return
    const start = () => {
      const g = (window as any).google?.accounts?.id; if (!g || !box.current) return
      g.initialize({ client_id: CLIENT_ID, callback: (r: any) => send(r.credential), ux_mode: 'popup' })
      g.renderButton(box.current, { theme: 'filled_black', size: 'large', text: 'continue_with', shape: 'pill', width: 300 })
    }
    if ((window as any).google?.accounts) { start(); return }
    const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = start
    s.onerror = () => onError('Could not load Google sign-in. Check your connection and try again.')
    document.head.appendChild(s)
  }, [])

  if (!CLIENT_ID) {
    if (process.env.NODE_ENV === 'production') return <div className="err">Sign-in isn’t set up yet.</div>
    return <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <p className="mut">Local development: Google sign-in is off, so this form signs you in directly.</p>
      <input type="email" placeholder="Email" value={dev.email} onChange={e => setDev({ ...dev, email: e.target.value })} />
      <input placeholder="Display name" value={dev.name} onChange={e => setDev({ ...dev, name: e.target.value })} />
      <button disabled={!dev.email.includes('@')} onClick={() => send(`dev:${dev.email.trim()}:${dev.name.trim()}`)}>Sign in</button></div>
  }
  // colorScheme: light stops the browser painting Google's iframe with an opaque white backdrop on the dark page
  return <div ref={box} style={{ minHeight: 44, display: 'flex', justifyContent: 'flex-start', colorScheme: 'light', marginTop: 6 }} />
}

async function fetchLogin(credential: string) {
  const r = await googleLogin(credential); setToken(r.token)
}