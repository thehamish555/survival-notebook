import type { MetadataRoute } from 'next'
import { TAGLINE } from '@/lib/site'

export default function manifest(): MetadataRoute.Manifest {
  return { id: '/', name: 'The Survival Notebook', short_name: 'Notebook', description: TAGLINE, start_url: '/', scope: '/', display: 'standalone', background_color: '#14161a', theme_color: '#14161a',
    icons: [{ src: '/brand/icon-128.png', sizes: '128x128', type: 'image/png' }, { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/brand/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }] }
}
