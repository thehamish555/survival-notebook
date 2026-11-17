import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/site'

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: SITE, changeFrequency: 'monthly', priority: 1 }, { url: `${SITE}/changelog`, changeFrequency: 'monthly', priority: 0.5 }]
}
