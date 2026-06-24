'use client';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import BrandLogo from '@/components/BrandLogo';

// Magic link is fully built, but its email delivery needs custom SMTP + a
// verified sending domain for production (Supabase's default email is
// rate-limited and often spam-filtered). Keep the button hidden until SMTP is
// configured, then flip this to true — no other change needed.
const MAGIC_LINK_ENABLED = false;

function AuthForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>(
    searchParams.get('mode') === 'signup' ? 'signup' : 'signin'
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(searchParams.get('error') ?? '');
  const [message, setMessage] = useState('');

  const callbackUrl = () => `${window.location.origin}/auth/callback`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email, password, options: { emailRedirectTo: callbackUrl() },
        });
        if (error) setError(error.message);
        else if (data.session) router.push('/dashboard');
        else setMessage('Check your email for a confirmation link.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setError(error.message);
        else router.push('/dashboard');
      }
    } finally {
      setLoading(false);
    }
  };

  // Continue with Google → redirects to Google, back to /auth/callback.
  const handleGoogle = async () => {
    setError(''); setMessage(''); setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl() },
    });
    if (error) { setError(error.message); setLoading(false); }
    // on success the browser navigates away to Google
  };

  // Passwordless magic link → emails a one-tap sign-in link.
  const handleMagicLink = async () => {
    if (!email) { setError('Enter your email first, then tap the magic link.'); return; }
    setError(''); setMessage(''); setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email, options: { emailRedirectTo: callbackUrl() },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setMessage('Check your email for a magic sign-in link.');
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
    }}>
      <div style={{ marginBottom: '2rem' }}>
        <BrandLogo boxSize={36} />
      </div>

      <div style={{
        width: '100%',
        maxWidth: 400,
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '2rem',
      }}>
        <div style={{ display: 'flex', gap: 4, marginBottom: '1.75rem', background: 'var(--bg3)', borderRadius: 'var(--radius)', padding: 4 }}>
          {(['signin', 'signup'] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(''); setMessage(''); }}
              style={{
                flex: 1,
                padding: '8px 0',
                borderRadius: 7,
                background: mode === m ? 'var(--bg4)' : 'transparent',
                color: mode === m ? 'var(--text)' : 'var(--muted)',
                border: mode === m ? '1px solid var(--border)' : '1px solid transparent',
                fontWeight: 500,
                fontSize: 13,
                cursor: 'pointer',
                transition: 'all .15s',
              }}
            >
              {m === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>

        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 700, marginBottom: '.25rem' }}>
          {mode === 'signin' ? 'Welcome back' : 'Get started free'}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: '1.5rem' }}>
          {mode === 'signin' ? 'Sign in to access your shows.' : 'Create your account to start building.'}
        </p>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading}
          className="btn btn-full"
          style={{ background: '#fff', color: '#1f1f1f', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontWeight: 500, marginBottom: '1rem' }}
        >
          <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden>
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.1 17.7 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 3-2.2 5.5-4.7 7.2l7.3 5.7c4.3-4 6.8-9.9 6.8-17.4z"/>
            <path fill="#FBBC05" d="M10.5 28.3c-.5-1.4-.7-2.9-.7-4.3s.3-2.9.7-4.3l-7.9-6.1C1 16.7 0 20.2 0 24s1 7.3 2.6 10.4l7.9-6.1z"/>
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.7c-2 1.4-4.7 2.3-8.6 2.3-6.3 0-11.6-3.6-13.5-8.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/>
          </svg>
          Continue with Google
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '0 0 1rem' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>or</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={mode === 'signup' ? 8 : 6}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
          </div>

          {error && (
            <div style={{ background: 'rgba(232,64,74,0.1)', border: '1px solid rgba(232,64,74,0.3)', borderRadius: 'var(--radius)', padding: '10px 12px', fontSize: 13, color: '#ff8a8a' }}>
              {error}
            </div>
          )}
          {message && (
            <div style={{ background: 'rgba(0,232,135,0.08)', border: '1px solid rgba(0,232,135,0.25)', borderRadius: 'var(--radius)', padding: '10px 12px', fontSize: 13, color: 'var(--green)' }}>
              {message}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-full"
            disabled={loading}
            style={{ marginTop: '.25rem' }}
          >
            {loading ? 'Loading…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>

          {MAGIC_LINK_ENABLED && (
            <button
              type="button"
              onClick={handleMagicLink}
              disabled={loading}
              className="btn btn-ghost btn-full"
              style={{ fontSize: 13 }}
            >
              Email me a magic link instead
            </button>
          )}
        </form>

        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', marginTop: '1.5rem' }}>
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setMessage(''); }}
            style={{ background: 'none', color: 'var(--red)', fontWeight: 500, fontSize: 12, cursor: 'pointer' }}
          >
            {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--bg)' }} />}>
      <AuthForm />
    </Suspense>
  );
}
