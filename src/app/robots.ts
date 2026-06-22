import type { MetadataRoute } from 'next'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tesla-lightshow-builder-1yo3.vercel.app'

// App Router metadata file → served at /robots.txt
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Auth-gated, per-user, or non-content routes — no SEO value, keep crawlers out.
      disallow: ['/api/', '/admin', '/dashboard', '/builder', '/embed', '/show/'],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  }
}
