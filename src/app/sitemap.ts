import type { MetadataRoute } from 'next'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tesla-lightshow-builder-1yo3.vercel.app'

// App Router metadata file → served at /sitemap.xml.
// Public, indexable marketing/content pages only (auth-gated and per-user
// routes are intentionally excluded — see robots.ts).
export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    { path: '/', priority: 1.0, changeFrequency: 'weekly' as const },
    { path: '/pricing', priority: 0.8, changeFrequency: 'monthly' as const },
    { path: '/gallery', priority: 0.7, changeFrequency: 'weekly' as const },
    { path: '/guide', priority: 0.6, changeFrequency: 'monthly' as const },
  ]
  return routes.map((r) => ({
    url: `${BASE_URL}${r.path}`,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }))
}
