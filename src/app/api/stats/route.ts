import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase'

// Public, no-PII aggregate counts for the homepage social-proof counter (total shows built + total
// exports — includes our own creation/testing). Cached at the edge so it doesn't hit the DB per view.
export const revalidate = 300

export async function GET() {
  try {
    const admin = getAdminClient()
    const [{ count: shows }, { count: exports }] = await Promise.all([
      admin.from('shows').select('id', { count: 'exact', head: true }),
      admin.from('exports').select('id', { count: 'exact', head: true }),
    ])
    return NextResponse.json(
      { shows: shows ?? 0, exports: exports ?? 0 },
      { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' } },
    )
  } catch {
    return NextResponse.json({ shows: 0, exports: 0 })
  }
}
