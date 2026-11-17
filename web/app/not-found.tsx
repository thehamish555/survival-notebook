import Link from 'next/link'
import { Logo } from '@/components/PixelIcon'

export default function NotFound() {
  return <div className="loading"><Logo size={72} /><h1>This chunk hasn’t generated yet</h1><p className="mut">The page you wanted doesn’t exist.</p><Link className="btn" href="/">Back to spawn</Link></div>
}
