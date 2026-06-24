import * as Sentry from '@sentry/nextjs'

// Only initializes when a DSN is set (production). Inert otherwise.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    enabled: process.env.NODE_ENV === 'production',
    tracesSampleRate: 0.1,
  })
}
