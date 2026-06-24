'use client'
import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

// App Router global error boundary — reports React render errors to Sentry
// (inert if Sentry isn't initialized) and shows a friendly fallback.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', fontFamily: 'system-ui, sans-serif', background: '#0a0a0f', color: '#fff', padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem' }}>⚡</div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Something went wrong</h2>
          <p style={{ opacity: 0.55, fontSize: 14, maxWidth: 360 }}>An unexpected error occurred. We&apos;ve been notified — please try again.</p>
          <a href="/" style={{ color: '#e8404a', fontSize: 14, marginTop: 4 }}>← Back home</a>
        </div>
      </body>
    </html>
  )
}
