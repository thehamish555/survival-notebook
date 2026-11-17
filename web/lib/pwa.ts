'use client'
import { api } from '@/lib/api'

// Installing the site as an app, and browser push notifications (free Web Push, no app store needed).

let installEvent: any = null
const listeners = new Set<() => void>()
export function startPwa() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  if (process.env.NODE_ENV === 'production') navigator.serviceWorker.register('/sw.js').catch(() => {})
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; listeners.forEach(f => f()) })
  window.addEventListener('appinstalled', () => { installEvent = null; listeners.forEach(f => f()) })
}
export const onInstallChange = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f) } }
export const canInstall = () => !!installEvent
export const installed = () => typeof window !== 'undefined' && (matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true)
export const isIos = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)
export async function install() { if (!installEvent) return false; installEvent.prompt(); const r = await installEvent.userChoice.catch(() => null); installEvent = null; return r?.outcome === 'accepted' }

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
const keyBytes = (b64: string) => { const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, c => c.charCodeAt(0)) }

/** This browser's current subscription, if notifications are on here. */
export async function currentSub(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration(); return reg ? reg.pushManager.getSubscription() : null
}

export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error('This browser can’t show notifications.')
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications are blocked for this site. Allow them in your browser settings.')
  const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('/sw.js'))
  await navigator.serviceWorker.ready
  const { key } = await api('/push/key')
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }))
  await api('/push/subscribe', 'POST', sub.toJSON())
}

export async function disablePush(): Promise<void> {
  const sub = await currentSub(); if (!sub) return
  await api('/push/subscribe', 'DELETE', { endpoint: sub.endpoint }).catch(() => {})
  await sub.unsubscribe()
}
