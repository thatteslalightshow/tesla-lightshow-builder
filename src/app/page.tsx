'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

// ─── Particle canvas ──────────────────────────────────────────────────────────
function ParticleCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    const colors = ['#e8404a','#ff8c00','#ffffff','#00e887','#4488ff'];
    const pts = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      vx: (Math.random() - .5) * .4, vy: (Math.random() - .5) * .4,
      r: Math.random() * 2.5 + .5, o: Math.random() * .55 + .15,
      c: colors[Math.floor(Math.random() * colors.length)],
    }));
    let raf: number;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pts.forEach(p => {
        p.x = (p.x + p.vx + canvas.width)  % canvas.width;
        p.y = (p.y + p.vy + canvas.height) % canvas.height;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.c; ctx.globalAlpha = p.o; ctx.fill();
      });
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    draw();
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={ref} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', opacity: .35, zIndex: 0 }} />;
}

// ─── Animated channel bars (hero decoration) ─────────────────────────────────
function ChannelBars() {
  const bars = [
    { label: 'Headlights', color: '#ffffff', delay: '0s' },
    { label: 'DRL', color: '#4488ff', delay: '.15s' },
    { label: 'Taillights', color: '#e8404a', delay: '.3s' },
    { label: 'Turn signals', color: '#ff8c00', delay: '.45s' },
    { label: 'Sill strips', color: '#00e887', delay: '.6s' },
    { label: 'Interior', color: '#cc88ff', delay: '.75s' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 320 }}>
      {bars.map(b => (
        <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', width: 90, flexShrink: 0, textAlign: 'right' }}>{b.label}</span>
          <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 3, background: b.color,
              boxShadow: `0 0 8px ${b.color}`,
              animation: `barPulse 1.8s ease-in-out ${b.delay} infinite`,
            }} />
          </div>
        </div>
      ))}
      <style>{`
        @keyframes barPulse {
          0%, 100% { width: 15%; opacity: .4; }
          50% { width: 88%; opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ─── Step card ────────────────────────────────────────────────────────────────
function Step({ n, title, desc }: { n: string; title: string; desc: string }) {
  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--red-glow)', border: '1px solid rgba(232,64,74,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--red)', flexShrink: 0 }}>{n}</div>
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, marginBottom: 6, color: 'var(--text)' }}>{title}</div>
        <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.65 }}>{desc}</div>
      </div>
    </div>
  );
}

// ─── Feature pill ─────────────────────────────────────────────────────────────
function Feat({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, color: 'var(--text)' }}>
      <span style={{ fontSize: 18 }}>{icon}</span>{text}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', overflowX: 'hidden' }}>
      {mounted && <ParticleCanvas />}

      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2rem', height: 60, background: 'rgba(10,10,15,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16 }}>
          <div style={{ width: 30, height: 30, background: 'var(--red)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 700 }}>T</div>
          LightShow <span style={{ color: 'var(--red)', marginLeft: 4 }}>Builder</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link href="/gallery" className="btn btn-ghost btn-sm" style={{ display: 'flex' }}>Gallery</Link>
          <Link href="/pricing" className="btn btn-ghost btn-sm" style={{ display: 'flex' }}>Pricing</Link>
          <Link href="/auth" className="btn btn-ghost btn-sm">Sign in</Link>
          <Link href="/auth?mode=signup" className="btn btn-primary btn-sm">Start free →</Link>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', zIndex: 1, maxWidth: 1100, margin: '0 auto', padding: '7rem 2rem 6rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 20, border: '1px solid rgba(0,232,135,0.3)', background: 'rgba(0,232,135,0.07)', fontSize: 12, fontWeight: 600, color: 'var(--green)', marginBottom: '1.75rem' }}>
            ⚡ First export free — no credit card required
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.4rem, 5vw, 3.6rem)', fontWeight: 700, lineHeight: 1.08, letterSpacing: '-1.5px', marginBottom: '1.5rem' }}>
            Make your Tesla<br />
            <span style={{ background: 'linear-gradient(135deg, #e8404a, #ff6b35)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              put on a show.
            </span>
          </h1>
          <p style={{ fontSize: '1.05rem', color: 'var(--muted)', lineHeight: 1.75, maxWidth: 460, marginBottom: '2.5rem' }}>
            Upload your music, sync 48 light channels to every beat and drop, preview on a live 3D model, and export a Tesla-ready file in minutes. No coding. No hardware.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: '2rem' }}>
            <Link href="/auth?mode=signup" className="btn btn-primary btn-lg">
              Build your first show →
            </Link>
            <Link href="/gallery" className="btn btn-ghost btn-lg">
              Browse the gallery
            </Link>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted2)', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <span>✓ Model 3, Y, S, X, Cybertruck</span>
            <span>✓ USB export in seconds</span>
            <span>✓ No subscription</span>
          </div>
        </div>

        {/* Hero visual — animated channel preview */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '2rem', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '1.25rem' }}>
              Light Channel Timeline — live preview
            </div>
            <ChannelBars />
            <div style={{ marginTop: '1.5rem', height: 1, background: 'var(--border)' }} />
            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--muted2)' }}>BPM 128 · 48 channels · Model 3</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)' }}>● LIVE</span>
            </div>
          </div>
          {/* Glow behind card */}
          <div style={{ position: 'absolute', inset: -1, borderRadius: 'var(--radius-lg)', background: 'radial-gradient(ellipse at 50% 50%, rgba(232,64,74,0.12), transparent 70%)', zIndex: -1, filter: 'blur(24px)' }} />
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', zIndex: 1, borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'var(--bg2)', padding: '5rem 2rem' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.1em', color: 'var(--red)', textTransform: 'uppercase', marginBottom: 12 }}>How it works</div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 700 }}>From song to USB in three steps</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '2.5rem' }}>
            <Step n="1" title="Upload your song"
              desc="Drop in any MP3 or WAV. Our beat detection reads the tempo, identifies drops and transitions, and auto-syncs 48 light channels to the music." />
            <Step n="2" title="Customize your show"
              desc="Edit any channel manually, toggle beat symmetry, tweak intensity, and preview everything live on a 3D model of your exact Tesla — Model 3, Y, S, X, or Cybertruck." />
            <Step n="3" title="Export and plug in"
              desc="One click downloads a Tesla-ready ZIP with your FSEQ file and audio. Copy it to a USB drive, plug into your front port, and tap Light Show on your screen." />
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', zIndex: 1, maxWidth: 1000, margin: '0 auto', padding: '5rem 2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.1em', color: 'var(--red)', textTransform: 'uppercase', marginBottom: 12 }}>Features</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 700 }}>Everything you need, nothing you don&apos;t</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          <Feat icon="🎵" text="Auto beat detection at any BPM" />
          <Feat icon="🚗" text="5 Tesla models with 3D preview" />
          <Feat icon="💡" text="48 individual light channels" />
          <Feat icon="✏️" text="Manual per-channel beat editing" />
          <Feat icon="⇔" text="Left/right symmetry mode" />
          <Feat icon="💾" text="FSEQ v2 + WAV USB export" />
          <Feat icon="✓" text="FSEQ validation before download" />
          <Feat icon="🌐" text="Share shows publicly or keep private" />
          <Feat icon="🔀" text="Remix community shows" />
          <Feat icon="📱" text="Mobile-friendly builder" />
        </div>
      </section>

      {/* ── Social proof strip ───────────────────────────────────────────── */}
      <section style={{ position: 'relative', zIndex: 1, borderTop: '1px solid var(--border)', background: 'var(--bg2)', padding: '2rem' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3rem', flexWrap: 'wrap' }}>
          {[
            { stat: '5', label: 'Tesla models supported' },
            { stat: '48', label: 'light channels per show' },
            { stat: '20fps', label: 'export frame rate' },
            { stat: '$2.99', label: 'per export after first free' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 700, color: 'var(--white)' }}>{s.stat}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing teaser ───────────────────────────────────────────────── */}
      <section style={{ position: 'relative', zIndex: 1, maxWidth: 800, margin: '0 auto', padding: '5rem 2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.1em', color: 'var(--red)', textTransform: 'uppercase', marginBottom: 12 }}>Pricing</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 700, marginBottom: 12 }}>Simple, pay-as-you-go</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>No subscription. No monthly fee. Create and preview for free — only pay when you&apos;re ready to export.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Free tier */}
          <div style={{ padding: '2rem', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, marginBottom: 8 }}>Free</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.4rem', fontWeight: 700, marginBottom: 4 }}>$0</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: '1.5rem' }}>Your first export, on us</div>
            {['Build unlimited shows', 'Full 3D preview', 'Beat detection & editing', '1 free USB export'].map(f => (
              <div key={f} style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8, display: 'flex', gap: 8 }}>
                <span style={{ color: 'var(--green)' }}>✓</span>{f}
              </div>
            ))}
            <Link href="/auth?mode=signup" className="btn btn-ghost btn-full" style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'center' }}>Get started free</Link>
          </div>
          {/* Per export */}
          <div style={{ padding: '2rem', background: 'var(--bg2)', border: '1px solid var(--red)', borderRadius: 'var(--radius-lg)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 14, right: 14, background: 'var(--red)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>POPULAR</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, marginBottom: 8 }}>Per Export</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.4rem', fontWeight: 700, marginBottom: 4 }}>$2.99</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: '1.5rem' }}>per show download</div>
            {['Everything in Free', 'Unlimited exports', 'Audio-synced FSEQ + WAV', 'FSEQ validation report', 'Share to public gallery'].map(f => (
              <div key={f} style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8, display: 'flex', gap: 8 }}>
                <span style={{ color: 'var(--green)' }}>✓</span>{f}
              </div>
            ))}
            <Link href="/auth?mode=signup" className="btn btn-primary btn-full" style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'center' }}>Start building →</Link>
          </div>
        </div>
        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted2)', marginTop: '1.5rem' }}>
          Secure checkout powered by Stripe. Cancel or delete your account anytime.
        </p>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', zIndex: 1, borderTop: '1px solid var(--border)', background: 'var(--bg2)', padding: '6rem 2rem', textAlign: 'center' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', fontWeight: 700, marginBottom: '1rem', lineHeight: 1.15 }}>
            Your Tesla is ready.<br />
            <span style={{ background: 'linear-gradient(135deg, #e8404a, #ff6b35)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              Is your light show?
            </span>
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: '1rem', lineHeight: 1.7, marginBottom: '2rem' }}>
            Build your first custom light show for free. No experience needed — just your music and a USB drive.
          </p>
          <Link href="/auth?mode=signup" className="btn btn-primary btn-lg" style={{ display: 'inline-flex' }}>
            Build your first show — free →
          </Link>
          <div style={{ marginTop: '1rem', fontSize: 12, color: 'var(--muted2)' }}>
            No credit card required · First export always free
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer style={{ position: 'relative', zIndex: 1, borderTop: '1px solid var(--border)', padding: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13 }}>
          <div style={{ width: 24, height: 24, background: 'var(--red)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700 }}>T</div>
          LightShow Builder
        </div>
        <div style={{ display: 'flex', gap: 20, fontSize: 13, color: 'var(--muted)' }}>
          <Link href="/gallery">Gallery</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/auth">Sign in</Link>
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted2)', margin: 0 }}>
          Not affiliated with Tesla, Inc.
        </p>
      </footer>
    </div>
  );
}
