// Pulls recent unresolved issues from the Sentry API for the admin dashboard.
// Returns null when not configured (no SENTRY_AUTH_TOKEN) so the UI can show a
// "connect" placeholder; returns [] when there are simply no open issues.
export type SentryIssue = {
  id: string
  title: string
  culprit?: string
  level?: string
  count?: string
  userCount?: number
  lastSeen?: string
  permalink?: string
}

export async function fetchRecentSentryIssues(limit = 8): Promise<SentryIssue[] | null> {
  const token = process.env.SENTRY_AUTH_TOKEN
  if (!token) return null
  const org = process.env.SENTRY_ORG || 'thatteslalightshow'
  const project = process.env.SENTRY_PROJECT || 'javascript-nextjs'
  const base = process.env.SENTRY_API_URL || 'https://us.sentry.io/api/0'

  try {
    const res = await fetch(
      `${base}/projects/${org}/${project}/issues/?query=is:unresolved&statsPeriod=14d&limit=${limit}`,
      { headers: { Authorization: `Bearer ${token}` }, next: { revalidate: 60 } },
    )
    if (!res.ok) return null
    const data = await res.json()
    return Array.isArray(data) ? (data as SentryIssue[]) : []
  } catch {
    return null
  }
}
