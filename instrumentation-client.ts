import * as Sentry from '@sentry/nextjs'

// instrumentation-client.ts — the Next 15.3+ convention (was sentry.client.config.ts).
// Client uses the public DSN (safe to expose — DSNs are not secrets).
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    enabled: process.env.NODE_ENV === 'production',
    tracesSampleRate: 0.1,
    replaysOnErrorSampleRate: 0,
    replaysSessionSampleRate: 0,
  })
}

// Lets Sentry instrument App Router navigations.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
