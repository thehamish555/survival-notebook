'use client'
import { useEffect, useRef, useState } from 'react'
import { api, clientId, eventsUrl, getToken } from '@/lib/api'
import { mergeSection } from '@/lib/merge'
import { useToast } from '@/lib/ui'

type Base = { data: any; rev: number }

/**
 * Loads a notebook, keeps it live over SSE, and saves sections optimistically.
 * Every write carries the revision it was based on; if someone else changed the section first (409) we fetch theirs,
 * merge my pending edits on top (by row id) and retry — so simultaneous edits combine instead of overwriting.
 */
export function useNotebook(id: string) {
  const toast = useToast()
  const [nb, setNb] = useState<any>(null), [role, setRole] = useState(''), [d, setD] = useState<any>({}), [members, setMembers] = useState<any[]>([])
  const [live, setLive] = useState(false), [err, setErr] = useState(''), [meId, setMeId] = useState(''), [activity, setActivity] = useState<any[]>([])
  const ctl = useRef<{ save: (k: string, v: any) => void; reload: () => Promise<void> }>({ save: () => {}, reload: async () => {} })

  useEffect(() => {
    if (!getToken()) { location.href = '/'; return }
    const timers: Record<string, any> = {}, pending: Record<string, any> = {}, base: Record<string, Base> = {}
    let me = '', offline = false, actTimer: any

    const schedule = (k: string, ms = 500) => { clearTimeout(timers[k]); timers[k] = setTimeout(() => write(k), ms) }

    const applyServer = (k: string, data: any, rev: number) => {
      const b = base[k]
      if (pending[k] !== undefined && b) {                       // I have unsaved edits: merge them onto the new server copy
        pending[k] = mergeSection(k, b.data, pending[k], data)
        const merged = pending[k]; setD((p: any) => ({ ...p, [k]: merged })); schedule(k)
      } else setD((p: any) => ({ ...p, [k]: data }))
      base[k] = { data, rev }
    }

    async function write(k: string): Promise<void> {
      for (let attempt = 0; attempt < 4; attempt++) {
        const v = pending[k]; if (v === undefined) return
        try {
          const r = await api(`/notebooks/${id}/s/${k}`, 'PUT', { data: v, baseRev: base[k]?.rev })
          if (pending[k] === v) delete pending[k]
          base[k] = { data: v, rev: r.rev }
          if (offline) { offline = false; toast('Back online, changes saved', 'ok') }
          return
        } catch (e: any) {
          if (e.status === 409) { const s = await api(`/notebooks/${id}/s/${k}`).catch(() => null); if (s) applyServer(k, s.data, s.rev); continue }
          if (e.status === 403) { delete pending[k]; toast(e.message || 'You can’t edit this', 'err'); load(k); return }
          if (!e.status) { if (!offline) toast('Can’t reach the server. Retrying.', 'err'); offline = true; schedule(k, 4000); return }
          toast(`Couldn’t save: ${e.message}`, 'err'); return
        }
      }
      toast('Someone else edited this at the same time. Your last change may need redoing.', 'err')
    }

    async function load(only?: string) {
      try {
        const r = await api(`/notebooks/${id}`)
        setNb(r.notebook); setRole(r.role); setMembers(r.members)
        for (const k of Object.keys(r.sections)) if (!only || only === k) applyServer(k, r.sections[k].data, r.sections[k].rev)
      } catch (e: any) { if (e.status === 401 || e.status === 404) location.href = '/'; else setErr(e.message) }
    }
    const loadActivity = () => api(`/notebooks/${id}/activity`).then(setActivity).catch(() => {})
    const bumpActivity = () => { clearTimeout(actTimer); actTimer = setTimeout(loadActivity, 1500) }

    ctl.current = {
      save: (k, v) => { setD((p: any) => ({ ...p, [k]: v })); pending[k] = v; schedule(k) },
      reload: () => load(),
    }
    api('/me').then(u => { me = u.id; setMeId(u.id) }).catch(() => { location.href = '/' })
    load(); loadActivity()

    const es = new EventSource(eventsUrl(id))
    let opened = false
    es.onopen = () => { setLive(true); if (opened) load(); opened = true }   // after a reconnect, catch up on anything missed
    es.onerror = () => setLive(false)
    const poll = setInterval(() => { if (document.visibilityState === 'visible' && es.readyState !== EventSource.OPEN) load() }, 20000)   // safety net if the live stream can't stay connected
    es.onmessage = e => { const m = JSON.parse(e.data); if (!m.cid || m.cid !== clientId()) load(m.section); bumpActivity() }   // apply everything except this tab's own echo
    const beforeUnload = (e: BeforeUnloadEvent) => { if (Object.keys(pending).length) { e.preventDefault(); e.returnValue = '' } }   // unsaved edits
    window.addEventListener('beforeunload', beforeUnload)
    return () => { es.close(); clearInterval(poll); window.removeEventListener('beforeunload', beforeUnload); clearTimeout(actTimer); Object.keys(pending).forEach(k => { write(k) }) }
  }, [id, toast])

  return { nb, role, d, members, meId, live, err, setErr, activity, save: (k: string, v: any) => ctl.current.save(k, v), reload: () => ctl.current.reload(), edit: role === 'owner' || role === 'editor' }
}
