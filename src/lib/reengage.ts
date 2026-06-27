import crypto from 'crypto'

// Shared helpers for the abandoned-show re-engagement flow. The unsubscribe token is
// an HMAC of the user id with a server secret — so an unsubscribe link can't be forged
// or enumerated, and we don't need to store a per-user token.
const SECRET = process.env.CRON_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'dev-secret'

export function unsubToken(userId: string): string {
  return crypto.createHmac('sha256', SECRET).update(`unsub:${userId}`).digest('hex').slice(0, 32)
}

export function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'https://thatteslalightshow.com'
}
