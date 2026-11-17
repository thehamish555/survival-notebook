// Production calls the same-origin /api path, which next.config.mjs forwards to the API server (set API_ORIGIN on Vercel).
// Local development points at the local API through NEXT_PUBLIC_API_URL (web/.env.development).
const BASE = (process.env.NEXT_PUBLIC_API_URL || '/api').replace(/\/+$/, '')
export const getToken = () => (typeof window === 'undefined' ? '' : localStorage.getItem('sn_token') || '')
export const setToken = (t: string) => (t ? localStorage.setItem('sn_token', t) : localStorage.removeItem('sn_token'))
export const eventsUrl = (id: string) => `${BASE}/notebooks/${id}/events?t=${getToken()}`

async function call(path: string, init: RequestInit = {}) {
  let r: Response
  try { r = await fetch(BASE + path, init) } catch { throw new Error("Can't reach the server. Try again in a moment.") }
  const text = await r.text()
  let j: any = {}
  try { j = text ? JSON.parse(text) : {} } catch { throw new Error(`Unexpected response from the server (${r.status}).`) }
  if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), { status: r.status })
  return j
}
// A per-tab id sent with every write; live events echo it back so a tab ignores its own changes but shows edits from the mod or other tabs.
const CID = (() => { if (typeof window === 'undefined') return ''; try { let v = sessionStorage.getItem('sn_cid'); if (!v) { v = Math.random().toString(36).slice(2, 10); sessionStorage.setItem('sn_cid', v) } return v } catch { return '' } })()
export const clientId = () => CID
const auth = (extra: Record<string, string> = {}) => ({ authorization: `Bearer ${getToken()}`, 'x-client-id': CID, ...extra })
export const api = (path: string, method = 'GET', body?: any) =>
  call(path, { method, headers: auth({ 'content-type': 'application/json' }), body: body ? JSON.stringify(body) : undefined })
export const authCall = (mode: 'login' | 'register', body: any) =>
  call(`/auth/${mode}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
export const uploadFile = (nb: string, f: File) =>
  call(`/notebooks/${nb}/files?name=${encodeURIComponent(f.name)}`, { method: 'POST', headers: auth({ 'content-type': 'application/octet-stream' }), body: f })
export async function downloadFile(nb: string, file: { id: string; name: string }) {
  const r = await fetch(`${BASE}/notebooks/${nb}/files/${file.id}`, { headers: auth() })
  if (!r.ok) throw new Error('Download failed')
  const url = URL.createObjectURL(await r.blob()), a = document.createElement('a'); a.href = url; a.download = file.name; a.click(); URL.revokeObjectURL(url)
}
