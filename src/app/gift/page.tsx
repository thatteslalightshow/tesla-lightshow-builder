'use client';
import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

const card: React.CSSProperties = { width: '100%', maxWidth: 460, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '2.5rem' };
const wrap: React.CSSProperties = { minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem 1.5rem' };

function GiftInner() {
  const params = useSearchParams();
  const success = params.get('success');
  const cancelled = params.get('cancelled');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const buy = async () => {
    setBusy(true); setErr('');
    try {
      const res = await fetch('/api/gift/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipient_email: email.trim() }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) { window.location.href = data.url; return; }
      setErr(data.error || 'Could not start checkout — please try again.');
    } catch { setErr('Could not reach checkout — please try again.'); }
    setBusy(false);
  };

  if (success) {
    return (
      <div style={wrap}><div style={{ ...card, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🎁</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, margin: '0 0 12px' }}>Gift sent!</h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, margin: 0 }}>
          We&apos;ve emailed the gift code{email ? ` to ${email}` : ''}. They redeem it for a light show their Tesla performs — choreography by us, soundtrack by them.
        </p>
        <Link href="/" style={{ display: 'inline-block', marginTop: 22, fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>← Back home</Link>
      </div></div>
    );
  }

  return (
    <div style={wrap}><div style={card}>
      <div style={{ fontSize: 36, marginBottom: 10 }}>🎁</div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, margin: '0 0 10px' }}>Gift a Tesla light show</h1>
      <p style={{ fontSize: 14.5, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, margin: '0 0 22px' }}>
        Give someone the show their Tesla&apos;s been waiting for. They pick any song, we choreograph the lights, and it runs from a USB. <strong style={{ color: '#fff' }}>$3.99</strong>, one export — no subscription.
      </p>
      {cancelled && <div style={{ fontSize: 13, color: '#ffb4b4', marginBottom: 14 }}>Checkout cancelled — no charge was made.</div>}
      <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>Recipient&apos;s email <span style={{ color: 'rgba(255,255,255,0.25)' }}>(optional — we&apos;ll send them the code; otherwise it comes to you)</span></label>
      <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="them@example.com"
        style={{ width: '100%', padding: '11px 13px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 14, marginBottom: 18, boxSizing: 'border-box' }} />
      {err && <div style={{ fontSize: 13, color: '#ffb4b4', marginBottom: 12 }}>{err}</div>}
      <button onClick={buy} disabled={busy}
        style={{ width: '100%', padding: '14px', borderRadius: 8, background: '#e8404a', color: '#fff', fontSize: 15, fontWeight: 600, border: 'none', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
        {busy ? 'Redirecting…' : 'Gift it — $3.99'}
      </button>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 14, marginBottom: 0 }}>
        Have a code? <Link href="/redeem" style={{ color: 'rgba(255,255,255,0.5)' }}>Redeem a gift →</Link>
      </p>
    </div></div>
  );
}

export default function GiftPage() {
  return <Suspense fallback={<div style={wrap} />}><GiftInner /></Suspense>;
}
