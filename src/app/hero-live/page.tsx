'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

// The real 3D Tesla from the builder — client-only (WebGL needs window).
const TeslaScene = dynamic(() => import('@/components/TeslaScene'), { ssr: false });

// Drives the scene with a continuously advancing beat so the car runs a light
// show on its own (same mechanism the builder's preview uses).
function LiveShow() {
  const [beat, setBeat] = useState(0);
  const bpm = 124;
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      setBeat(((t - start) / 1000 / 60) * bpm);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <TeslaScene teslaModel="modelX" style="energetic" intensity={92} bpm={bpm} previewBeat={beat} />
  );
}

export default function HeroLive() {
  return (
    <div style={{ background: '#000', color: '#fff', minHeight: '100vh', overflowX: 'hidden' }}>
      <div style={{ position: 'fixed', top: 10, left: 10, zIndex: 99, fontSize: 11, letterSpacing: '.1em', color: 'rgba(255,255,255,.4)', background: 'rgba(255,255,255,.06)', padding: '5px 10px', borderRadius: 6 }}>
        MOCK C · Live Tesla
      </div>

      {/* NAV — logo small + present in the corner */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2.5rem', height: 64, backdropFilter: 'blur(16px)', background: 'rgba(0,0,0,.4)', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo.png" alt="That Lightshow" style={{ height: 34, width: 'auto' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 26, fontSize: 13 }}>
          <Link href="#" style={{ color: 'rgba(255,255,255,.62)', textDecoration: 'none' }}>Gallery</Link>
          <Link href="#" style={{ color: 'rgba(255,255,255,.62)', textDecoration: 'none' }}>Pricing</Link>
          <Link href="#" style={{ color: 'rgba(255,255,255,.62)', textDecoration: 'none' }}>Sign in</Link>
          <Link href="#" style={{ padding: '8px 18px', border: '1px solid rgba(255,255,255,.25)', borderRadius: 6, color: '#fff', textDecoration: 'none' }}>Start free</Link>
        </div>
      </nav>

      {/* HERO — headline, then the real car mid-light-show as the centerpiece */}
      <section style={{ position: 'relative', minHeight: '100svh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6rem 1.5rem 2rem', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 16px', borderRadius: 20, border: '1px solid rgba(255,255,255,.12)', fontSize: 12, color: 'rgba(255,255,255,.5)', marginBottom: '1.6rem' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00e887', boxShadow: '0 0 6px #00e887' }} />
          First export free · no card required
        </div>

        <h1 style={{ fontFamily: 'var(--font-display, sans-serif)', fontSize: 'clamp(2.6rem,6.5vw,5.5rem)', fontWeight: 700, lineHeight: .97, letterSpacing: '-2.5px', margin: 0 }}>
          Your music.<br />
          <span style={{ background: 'linear-gradient(120deg,#e8404a,#ff6a3d,#ff8c00)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Your light show.</span>
        </h1>

        {/* THE CENTERPIECE — real 3D Tesla running a light show, on a red glow */}
        <div style={{ position: 'relative', width: 'min(1100px, 96vw)', height: 'min(58vh, 560px)', margin: '0.5rem auto 0' }}>
          <div style={{ position: 'absolute', left: '50%', top: '54%', transform: 'translate(-50%,-50%)', width: '85%', height: '70%', background: 'radial-gradient(ellipse, rgba(232,64,74,.22) 0%, transparent 68%)', pointerEvents: 'none', zIndex: 0 }} />
          <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
            <LiveShow />
          </div>
        </div>

        <p style={{ fontSize: 'clamp(.9rem,1.8vw,1.1rem)', color: 'rgba(255,255,255,.5)', lineHeight: 1.7, maxWidth: 500, margin: '0.5rem auto 2rem' }}>
          Upload any song. Watch your Tesla&apos;s lights, doors, and cabin choreograph to every beat. Export a USB-ready file in seconds.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="#" style={{ padding: '14px 32px', borderRadius: 8, background: '#e8404a', color: '#fff', fontSize: 15, fontWeight: 600, textDecoration: 'none', boxShadow: '0 0 40px rgba(232,64,74,.32)' }}>Build your first show →</Link>
          <Link href="#" style={{ padding: '14px 32px', borderRadius: 8, background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.75)', fontSize: 15, fontWeight: 500, border: '1px solid rgba(255,255,255,.1)', textDecoration: 'none' }}>Browse the gallery</Link>
        </div>
      </section>
    </div>
  );
}
