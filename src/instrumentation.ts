import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config')
  }
}

// Captures errors thrown from nested React Server Components (Sentry v10 wiring;
// the build warns when this hook is missing).
export const onRequestError = Sentry.captureRequestError
