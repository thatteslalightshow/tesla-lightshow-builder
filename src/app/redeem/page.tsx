'use client';
import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

const card: React.CSSProperties = { width: '100%', maxWidth: 460, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '2.5rem' };
const wrap: React.CSSProperties = { minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem 1.5rem' };

function RedeemInner() {
  const params = useSearchParams();
  const [code, setCode] = useState((params.get('code') ?? '').toUpperCase());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [needAuth, setNeedAuth] = useState(false);

  const redeem = async () => {
    setBusy(true); setErr(''); setNeedAuth(false);
    try {
      const res = await fetch('/api/gift/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code.trim() }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { setDone(true); setBusy(false); return; }
      if (res.status === 401) setNeedAuth(true);
      else setErr(data.error || 'Could not redeem — please try again.');
    } catch { setErr('Could not reach the server — please try again.'); }
    setBusy(false);
  };

  if (done) {
    return (
      <div style={wrap}><div style={{ ...card, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, margin: '0 0 12px' }}>Gift redeemed!</h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, margin: '0 0 22px' }}>
          One export has been added to your account. Build a show, preview it in 3D, and export it free with your gift.
        </p>
        <Link href="/builder" style={{ display: 'inline-block', padding: '13px 26px', borderRadius: 8, background: '#e8404a', color: '#fff', fontSize: 15, fontWeight: 600 }}>Build your show →</Link>
      </div></div>
    );
  }

  return (
    <div style={wrap}><div style={card}>
      <div style={{ fontSize: 36, marginBottom: 10 }}>🎁</div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, margin: '0 0 10px' }}>Redeem a gift</h1>
      <p style={{ fontSize: 14.5, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, margin: '0 0 22px' }}>
        Enter your gift code to add a light-show export to your account.
      </p>
      <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="ABCD1234" autoCapitalize="characters"
        style={{ width: '100%', padding: '13px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 18, letterSpacing: 3, fontFamily: 'monospace', textAlign: 'center', marginBottom: 18, boxSizing: 'border-box' }} />
      {needAuth && (
        <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, marginBottom: 14, padding: '10px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}>
          You&apos;ll need an account to bank your gift.{' '}
          <Link href={`/auth?mode=signup&next=${encodeURIComponent('/redeem?code=' + code.trim())}`} style={{ color: '#ff7a82', fontWeight: 600 }}>Create a free account →</Link>{' '}
          (we&apos;ll bring you right back here).
        </div>
      )}
      {err && <div style={{ fontSize: 13, color: '#ffb4b4', marginBottom: 12 }}>{err}</div>}
      <button onClick={redeem} disabled={busy || !code.trim()}
        style={{ width: '100%', padding: '14px', borderRadius: 8, background: '#e8404a', color: '#fff', fontSize: 15, fontWeight: 600, border: 'none', cursor: busy || !code.trim() ? 'default' : 'pointer', opacity: busy || !code.trim() ? 0.6 : 1 }}>
        {busy ? 'Redeeming…' : 'Redeem gift'}
      </button>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 14, marginBottom: 0 }}>
        Want to gift one? <Link href="/gift" style={{ color: 'rgba(255,255,255,0.5)' }}>Gift a light show →</Link>
      </p>
    </div></div>
  );
}

export default function RedeemPage() {
  return <Suspense fallback={<div style={wrap} />}><RedeemInner /></Suspense>;
}
