'use client'
import { Logo } from '@/components/PixelIcon'

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return <div className="loading"><Logo size={72} /><h1>Something crashed</h1><p className="mut">{error.message || 'An unexpected error happened.'}</p>
    <div className="row"><button onClick={reset}>Try again</button><button className="ghost" onClick={() => { location.href = '/' }}>Back to spawn</button></div></div>
}
