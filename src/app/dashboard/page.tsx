'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase, type Show } from '@/lib/supabase';
import SocialLinks from '@/components/SocialLinks';
import BrandLogo from '@/components/BrandLogo';

export default function DashboardPage() {
  const router = useRouter();
  const [shows, setShows] = useState<Show[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [userId, setUserId] = useState('');
  const [subscription, setSubscription] = useState<{ status: string; plan: string; current_period_end: string | null } | null>(null);
  const [subMsg, setSubMsg] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/auth'); return; }
      setEmail(session.user.email ?? '');
      setUserId(session.user.id);
      loadShows();
      const [{ data: profile }, { data: sub }] = await Promise.all([
        supabase.from('profiles').select('is_admin, display_name').eq('id', session.user.id).single(),
        supabase.from('subscriptions').select('status, plan, current_period_end').eq('user_id', session.user.id).in('status', ['active', 'trialing', 'past_due']).maybeSingle(),
      ]);
      if (profile?.is_admin) setIsAdmin(true);
      const dn = profile?.display_name ?? '';
      setDisplayName(dn);
      setNameInput(dn);
      if (!dn) setEditingName(true);
      if (sub) setSubscription(sub);

      // Handle post-Stripe redirect messages
      const params = new URLSearchParams(window.location.search);
      if (params.get('subscription_success')) {
        setSubMsg('🎉 You\'re now a Creator! Unlimited exports unlocked.');
        window.history.replaceState({}, '', '/dashboard');
      }
      if (params.get('subscription_cancelled')) {
        window.history.replaceState({}, '', '/dashboard');
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) router.replace('/auth');
    });
    return () => subscription.unsubscribe();
  }, [router]);

  async function loadShows() {
    setLoading(true);
    const { data } = await supabase
      .from('shows')
      .select('*')
      .order('updated_at', { ascending: false });
    setShows((data as Show[]) ?? []);
    setLoading(false);
  }

  async function deleteShow(id: string) {
    setDeleting(id);
    await supabase.from('shows').delete().eq('id', id);
    setShows(prev => prev.filter(s => s.id !== id));
    setDeleting(null);
  }

  async function togglePublic(show: Show) {
    setToggling(show.id);
    const next = !show.is_public;
    const { error } = await supabase
      .from('shows')
      .update({ is_public: next })
      .eq('id', show.id);
    if (!error) setShows(prev => prev.map(s => s.id === show.id ? { ...s, is_public: next } : s));
    setToggling(null);
  }

  function copyShareLink(show: Show) {
    const url = `${window.location.origin}/show/${show.share_token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(show.id);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  async function saveDisplayName() {
    const trimmed = nameInput.trim();
    if (!trimmed || !userId) return;
    setSavingName(true);
    await supabase.from('profiles').update({ display_name: trimmed }).eq('id', userId);
    setDisplayName(trimmed);
    setEditingName(false);
    setSavingName(false);
  }

  const modelLabels: Record<string, string> = {
    model3: 'Model 3', modelY: 'Model Y', modelS: 'Model S', modelX: 'Model X', cybertruck: 'Cybertruck',
  };
  const styleLabels: Record<string, string> = {
    energetic: 'Energetic', wave: 'Wave', strobe: 'Strobe', chase: 'Chase',
    pulse: 'Pulse', ripple: 'Ripple', bounce: 'Bounce', twinkle: 'Twinkle',
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 2rem', borderBottom: '1px solid var(--border)', background: 'rgba(10,10,15,0.9)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 10 }}>
        <BrandLogo />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/gallery" className="btn btn-ghost btn-sm">Gallery</Link>
          {isAdmin && (
            <Link href="/admin" style={{ padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: 'rgba(232,64,74,0.12)', border: '1px solid rgba(232,64,74,0.3)', color: 'var(--red)', letterSpacing: '.05em' }}>
              Admin
            </Link>
          )}
          <span className="dash-nav-email" style={{ fontSize: 13, color: 'var(--muted)' }}>{email}</span>
          <button onClick={signOut} className="btn btn-ghost btn-sm">Sign out</button>
        </div>
      </nav>

      <main style={{ flex: 1, maxWidth: 900, width: '100%', margin: '0 auto', padding: '2.5rem 2rem' }}>
        {/* Display name banner */}
        {editingName && (
          <div style={{ marginBottom: '1.5rem', padding: '1.25rem 1.5rem', background: 'rgba(232,64,74,0.06)', border: '1px solid rgba(232,64,74,0.2)', borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, marginBottom: 2 }}>
                {displayName ? 'Change your display name' : 'Set your display name'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                This is shown on your public shows in the gallery
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
              <input
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveDisplayName(); if (e.key === 'Escape') setEditingName(false); }}
                placeholder="e.g. TeslaFan42"
                maxLength={32}
                autoFocus
                style={{ padding: '7px 12px', borderRadius: 7, fontSize: 13, background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none', width: 180 }}
              />
              <button onClick={saveDisplayName} disabled={savingName || !nameInput.trim()} className="btn btn-primary btn-sm">
                {savingName ? '…' : 'Save'}
              </button>
              {displayName && <button onClick={() => setEditingName(false)} className="btn btn-ghost btn-sm">Cancel</button>}
            </div>
          </div>
        )}

        {/* Subscription success toast */}
        {subMsg && (
          <div style={{ marginBottom: '1.5rem', padding: '1rem 1.5rem', background: 'rgba(80,160,255,0.08)', border: '1px solid rgba(80,160,255,0.25)', borderRadius: 'var(--radius-lg)', fontSize: 14, color: 'rgba(80,160,255,0.9)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {subMsg}
            <button onClick={() => setSubMsg('')} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16 }}>×</button>
          </div>
        )}

        {/* Subscription status / upsell */}
        {!isAdmin && (
          <div style={{ marginBottom: '1.5rem', padding: '1rem 1.5rem', background: subscription?.status === 'active' || subscription?.status === 'trialing' ? 'rgba(80,160,255,0.05)' : 'rgba(255,255,255,0.03)', border: `1px solid ${subscription?.status === 'active' || subscription?.status === 'trialing' ? 'rgba(80,160,255,0.2)' : 'var(--border)'}`, borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            {subscription?.status === 'active' || subscription?.status === 'trialing' ? (
              <>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, color: 'rgba(80,160,255,0.9)', marginBottom: 2 }}>Creator Plan ✓</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    Unlimited exports · {subscription.plan === 'creator_yearly' ? 'Annual' : 'Monthly'} ·
                    renews {subscription.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString() : '—'}
                  </div>
                </div>
                <button
                  onClick={async () => {
                    const res = await fetch('/api/subscription/portal', { method: 'POST' });
                    if (res.ok) { const { url } = await res.json(); window.location.href = url; }
                  }}
                  className="btn btn-ghost btn-sm"
                >
                  Manage billing →
                </button>
              </>
            ) : (
              <>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, marginBottom: 2 }}>Free plan</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>1 free export · $2.99/export after that</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={async () => {
                      setSubMsg('Starting checkout…');
                      try {
                        const res = await fetch('/api/subscription/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: 'monthly' }) });
                        const data = await res.json().catch(() => ({}));
                        if (res.ok && data.url) { window.location.href = data.url; }
                        else { setSubMsg(data.error ? `Checkout error: ${data.error}` : 'Could not start checkout — please try again.'); }
                      } catch { setSubMsg('Could not reach checkout — please try again.'); }
                    }}
                    className="btn btn-ghost btn-sm" style={{ borderColor: 'rgba(80,160,255,0.3)', color: 'rgba(80,160,255,0.85)' }}
                  >
                    $6.99/mo
                  </button>
                  <button
                    onClick={async () => {
                      setSubMsg('Starting checkout…');
                      try {
                        const res = await fetch('/api/subscription/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: 'yearly' }) });
                        const data = await res.json().catch(() => ({}));
                        if (res.ok && data.url) { window.location.href = data.url; }
                        else { setSubMsg(data.error ? `Checkout error: ${data.error}` : 'Could not start checkout — please try again.'); }
                      } catch { setSubMsg('Could not reach checkout — please try again.'); }
                    }}
                    className="btn btn-primary btn-sm"
                  >
                    $49.99/yr — best value
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700, marginBottom: '.25rem' }}>My Shows</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>{shows.length} show{shows.length !== 1 ? 's' : ''}</p>
              {displayName && !editingName && (
                <button onClick={() => setEditingName(true)} style={{ fontSize: 12, color: 'var(--muted2)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                  @{displayName}
                </button>
              )}
            </div>
          </div>
          <Link href="/builder" className="btn btn-primary">+ New show</Link>
        </div>

        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: '1rem' }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ height: 175, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', animation: 'pulse 2s ease infinite' }} />
            ))}
          </div>
        ) : shows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '5rem 2rem', border: '1px dashed var(--border)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⚡</div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 600, marginBottom: '.5rem' }}>No shows yet</h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: '1.5rem' }}>Create your first Tesla light show to get started.</p>
            <Link href="/builder" className="btn btn-primary">Build your first show →</Link>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: '1rem' }}>
            {shows.map(show => (
              <div key={show.id} style={{ background: 'var(--bg2)', border: `1px solid ${show.is_public ? 'rgba(0,232,135,0.2)' : 'var(--border)'}`, borderRadius: 'var(--radius-lg)', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '.75rem', transition: 'border-color .2s' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, marginBottom: 3 }}>{show.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{modelLabels[show.tesla_model] ?? show.tesla_model}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span className="badge badge-red">{styleLabels[show.style] ?? show.style}</span>
                    {show.is_public && <span className="badge badge-green">Public</span>}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '1rem', fontSize: 12, color: 'var(--muted)' }}>
                  {show.bpm && <span>🎵 {show.bpm} BPM</span>}
                  {show.duration_sec && <span>⏱ {Math.floor(show.duration_sec / 60)}:{String(Math.round(show.duration_sec % 60)).padStart(2, '0')}</span>}
                  <span>⚡ {show.intensity}%</span>
                </div>

                {/* Share row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingTop: '.25rem', borderTop: '1px solid var(--border)' }}>
                  <button
                    onClick={() => togglePublic(show)}
                    disabled={toggling === show.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: show.is_public ? 'var(--green)' : 'var(--muted)', padding: '2px 0', transition: 'color .15s' }}
                  >
                    <span style={{ fontSize: 14 }}>{show.is_public ? '🌐' : '🔒'}</span>
                    {toggling === show.id ? '…' : show.is_public ? 'Public' : 'Private'}
                  </button>
                  {show.is_public && (
                    <button
                      onClick={() => copyShareLink(show)}
                      className="btn btn-ghost btn-sm"
                      style={{ marginLeft: 'auto', fontSize: 11 }}
                    >
                      {copied === show.id ? '✓ Copied!' : '🔗 Copy link'}
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <Link href={`/builder?id=${show.id}`} className="btn btn-ghost btn-sm" style={{ flex: 1, textAlign: 'center' }}>Edit</Link>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => deleteShow(show.id)}
                    disabled={deleting === show.id}
                    style={{ color: '#ff8a8a', borderColor: 'rgba(232,64,74,0.3)' }}
                  >
                    {deleting === show.id ? '…' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <footer style={{ borderTop: '1px solid var(--border)', padding: '1.25rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <span style={{ fontSize: 12, color: 'var(--muted2)' }}>ThatTeslaLightshow · @ThatTeslaLightshow</span>
        <SocialLinks gap={4} size={26} />
      </footer>
    </div>
  );
}
