import Link from 'next/link'
import { CHANGELOG } from '@/lib/data'
import { Footer } from '@/lib/ui'

export const metadata = { title: 'Changelog' }

export default function ChangelogPage() {
  return <>
    <div className="hero" style={{ minHeight: 170 }}><div><Link href="/" className="back">← Home</Link><h1>Changelog</h1></div></div>
    <div className="wrap">{CHANGELOG.map(([v, date, items]) => <div className="card" key={v}>
      <h2>Version {v} <span className="mut" style={{ fontSize: 15 }}>— {date}</span></h2>
      {items.map(i => i.endsWith(':') ? <div className="lbl" key={i} style={{ marginTop: 8 }}>{i}</div> : <div key={i}>• {i}</div>)}</div>)}</div>
    <Footer />
  </>
}
