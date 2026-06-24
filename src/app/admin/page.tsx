import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { getAdminClient } from '@/lib/supabase'
import Link from 'next/link'
import type { Metadata } from 'next'
import AdminSweepPanel from './AdminSweepPanel'

export const metadata: Metadata = { title: 'Admin' }
export const revalidate = 0

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ padding: '1.5rem', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.2rem', fontWeight: 700, letterSpacing: '-1px', color: 'var(--text)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--muted2)', marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

function Table({ cols, rows }: { cols: string[]; rows: (string | number | null | undefined)[][] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {cols.map(c => (
              <th key={c} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--muted)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              {row.map((cell, j) => (
                <td key={j} style={{ padding: '10px 14px', color: j === 0 ? 'var(--text)' : 'var(--muted)', whiteSpace: 'nowrap', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>{cell ?? '—'}</td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={cols.length} style={{ padding: '2rem 14px', textAlign: 'center', color: 'var(--muted2)' }}>No data yet</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export default async function AdminPage() {
  // Verify session
  const supabaseAuth = createServerComponentClient({ cookies })
  const { data: { session } } = await supabaseAuth.auth.getSession()
  if (!session) redirect('/auth')

  // Verify admin flag
  const { data: profile } = await supabaseAuth.from('profiles').select('is_admin, display_name').eq('id', session.user.id).single()
  if (!profile?.is_admin) redirect('/dashboard')

  // All stats via admin client (bypasses RLS)
  const db = getAdminClient()

  const [
    { count: userCount },
    { count: showCount },
    { count: publicShowCount },
    { count: purchaseCount },
    { data: purchases },
    { data: recentUsers },
    { data: recentShows },
    { data: recentPurchases },
    { data: allShows },
    { data: activeSubs },
    { data: purchaseUsers },
    { count: acquiredCount },
    { data: sweeps },
  ] = await Promise.all([
    db.from('profiles').select('*', { count: 'exact', head: true }),
    db.from('shows').select('*', { count: 'exact', head: true }),
    db.from('shows').select('*', { count: 'exact', head: true }).eq('is_public', true),
    db.from('show_purchases').select('*', { count: 'exact', head: true }),
    db.from('show_purchases').select('amount_cents'),
    db.from('profiles').select('id, display_name, created_at').order('created_at', { ascending: false }).limit(15),
    db.from('shows').select('id, name, tesla_model, style, is_public, created_at').order('created_at', { ascending: false }).limit(15),
    db.from('show_purchases').select('stripe_session_id, amount_cents, created_at, show_id').order('created_at', { ascending: false }).limit(10),
    db.from('shows').select('tesla_model, style'),
    db.from('subscriptions').select('user_id').in('status', ['active', 'trialing']),
    db.from('show_purchases').select('user_id'),
    db.from('shows').select('*', { count: 'exact', head: true }).not('source_show_id', 'is', null),
    db.from('storage_sweeps').select('*').order('run_at', { ascending: false }).limit(10),
  ])

  const revenue = (purchases ?? []).reduce((sum, p) => sum + (p.amount_cents ?? 0), 0)
  const revenueStr = `$${(revenue / 100).toFixed(2)}`

  // Conversion: distinct paying users (active sub OR any purchase) over total users.
  const subscriberCount = new Set((activeSubs ?? []).map(s => s.user_id)).size
  const payingUsers = new Set([...(activeSubs ?? []).map(s => s.user_id), ...(purchaseUsers ?? []).map(p => p.user_id)]).size
  const conversionPct = userCount ? ((payingUsers / userCount) * 100).toFixed(1) : '0'

  // Model breakdown
  const modelCounts: Record<string, number> = {}
  const styleCounts: Record<string, number> = {}
  ;(allShows ?? []).forEach(s => {
    modelCounts[s.tesla_model] = (modelCounts[s.tesla_model] ?? 0) + 1
    styleCounts[s.style] = (styleCounts[s.style] ?? 0) + 1
  })

  const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      {/* Nav */}
      <header style={{ position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2rem', height: 56, background: 'rgba(10,10,15,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link href="/" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15 }}>ThatTeslaLightshow</Link>
          <span style={{ padding: '2px 10px', background: 'rgba(232,64,74,0.15)', border: '1px solid rgba(232,64,74,0.3)', borderRadius: 20, fontSize: 11, fontWeight: 700, color: 'var(--red)', letterSpacing: '.08em' }}>ADMIN</span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>{profile.display_name ?? session.user.email}</span>
          <Link href="/dashboard" style={{ fontSize: 13, color: 'var(--muted)', padding: '5px 12px', border: '1px solid var(--border)', borderRadius: 8 }}>Dashboard</Link>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '2.5rem 2rem', display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>

        {/* Overview stats */}
        <section>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 16 }}>Overview</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            <StatCard label="Total Users" value={userCount ?? 0} />
            <StatCard label="Shows Created" value={showCount ?? 0} sub={`${publicShowCount ?? 0} public`} />
            <StatCard label="Exports Purchased" value={purchaseCount ?? 0} />
            <StatCard label="Revenue" value={revenueStr} sub={purchaseCount ? `avg $${((revenue / 100) / purchaseCount).toFixed(2)}/export` : undefined} />
          </div>
        </section>

        {/* Conversion */}
        <section>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 16 }}>Conversion</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            <StatCard label="Subscribers" value={subscriberCount} sub="active / trialing" />
            <StatCard label="Community Acquired" value={acquiredCount ?? 0} sub="shows added from gallery" />
            <StatCard label="Paying Users" value={payingUsers} sub={`of ${userCount ?? 0} total`} />
            <StatCard label="Paid Conversion" value={`${conversionPct}%`} sub="paid or subscribed" />
          </div>
        </section>

        {/* Storage cleanup */}
        <section>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 16 }}>Storage cleanup</div>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16, maxWidth: 660, lineHeight: 1.6 }}>
            Finds audio files no show references (orphans), older than the grace window. A dry-run reports what would be removed; cleanup moves them to <code>trash/</code> (recoverable 30 days). The quarterly cron logs dry-run reports automatically.
          </p>
          <AdminSweepPanel initial={sweeps ?? []} />
        </section>

        {/* Breakdowns */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* By model */}
          <section style={{ padding: '1.5rem', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13, marginBottom: 16 }}>Shows by Model</div>
            {Object.entries(modelCounts).sort((a, b) => b[1] - a[1]).map(([m, n]) => (
              <div key={m} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 13 }}>
                <span style={{ color: 'var(--muted)', textTransform: 'capitalize' }}>{m}</span>
                <span style={{ fontWeight: 600 }}>{n}</span>
              </div>
            ))}
            {Object.keys(modelCounts).length === 0 && <div style={{ fontSize: 13, color: 'var(--muted2)' }}>No shows yet</div>}
          </section>

          {/* By style */}
          <section style={{ padding: '1.5rem', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13, marginBottom: 16 }}>Shows by Style</div>
            {Object.entries(styleCounts).sort((a, b) => b[1] - a[1]).map(([s, n]) => (
              <div key={s} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 13 }}>
                <span style={{ color: 'var(--muted)', textTransform: 'capitalize' }}>{s}</span>
                <span style={{ fontWeight: 600 }}>{n}</span>
              </div>
            ))}
            {Object.keys(styleCounts).length === 0 && <div style={{ fontSize: 13, color: 'var(--muted2)' }}>No shows yet</div>}
          </section>
        </div>

        {/* Recent purchases */}
        <section style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13 }}>Recent Purchases</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{purchaseCount ?? 0} total</div>
          </div>
          <Table
            cols={['Date', 'Show ID', 'Amount', 'Stripe Session']}
            rows={(recentPurchases ?? []).map(p => [
              fmt(p.created_at),
              p.show_id?.slice(0, 8) + '…',
              p.amount_cents ? `$${(p.amount_cents / 100).toFixed(2)}` : '—',
              p.stripe_session_id?.slice(0, 20) + '…',
            ])}
          />
        </section>

        {/* Recent shows */}
        <section style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13 }}>Recent Shows</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{showCount ?? 0} total</div>
          </div>
          <Table
            cols={['Date', 'Name', 'Model', 'Style', 'Public']}
            rows={(recentShows ?? []).map(s => [
              fmt(s.created_at),
              s.name,
              s.tesla_model,
              s.style,
              s.is_public ? '✓' : '',
            ])}
          />
        </section>

        {/* Recent signups */}
        <section style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13 }}>Recent Signups</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{userCount ?? 0} total</div>
          </div>
          <Table
            cols={['Joined', 'Display Name', 'User ID']}
            rows={(recentUsers ?? []).map(u => [
              fmt(u.created_at),
              u.display_name ?? '(unnamed)',
              u.id.slice(0, 8) + '…',
            ])}
          />
        </section>

        {/* Traffic note */}
        <section style={{ padding: '1.5rem', background: 'rgba(232,64,74,0.05)', border: '1px solid rgba(232,64,74,0.15)', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Page Views & Traffic Sources</div>
          <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.7 }}>
            Visit analytics (page views, unique visitors, referrers, countries) are tracked via Vercel Analytics —
            view them in your{' '}
            <span style={{ color: 'var(--text)' }}>Vercel dashboard → Analytics tab</span>.
            Data appears within a few minutes of the first visit after deploy.
          </p>
        </section>

      </main>
    </div>
  )
}
