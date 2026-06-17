'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

// ─── Ambient particle field ───────────────────────────────────────────────────
function Particles() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const resize = () => { c.width = window.innerWidth; c.height = window.innerHeight; };
    resize();
    const pts = Array.from({ length: 80 }, () => ({
      x: Math.random() * c.width, y: Math.random() * c.height,
      vx: (Math.random() - .5) * .25, vy: (Math.random() - .5) * .25,
      r: Math.random() * 1.4 + .3,
      o: Math.random() * .3 + .05,
      c: ['#e8404a','#ffffff','#ff8c00','#ffffff','#ffffff'][Math.floor(Math.random()*5)],
    }));
    let raf: number;
    const tick = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      pts.forEach(p => {
        p.x = (p.x + p.vx + c.width)  % c.width;
        p.y = (p.y + p.vy + c.height) % c.height;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
        ctx.fillStyle = p.c; ctx.globalAlpha = p.o; ctx.fill();
      });
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(tick);
    };
    tick();
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={ref} style={{ position:'fixed', inset:0, pointerEvents:'none', zIndex:0 }} />;
}

// ─── Bottom-of-hero light bar equalizer ──────────────────────────────────────
function LightEq() {
  const BARS = 48;
  return (
    <div style={{ width:'100%', display:'flex', gap:3, alignItems:'flex-end', height:48, padding:'0 2px' }}>
      {Array.from({ length: BARS }, (_, i) => (
        <div key={i} style={{ flex:1, borderRadius:1, background:'rgba(255,255,255,0.15)',
          animation:`eq ${(.6 + Math.random()*1.2).toFixed(2)}s ease-in-out ${(Math.random()*.8).toFixed(2)}s infinite alternate`,
          minHeight:4,
        }} />
      ))}
      <style>{`
        @keyframes eq {
          from { height: 4px; opacity:.15; }
          to   { height: ${Math.floor(Math.random()*100)+20}%; opacity:.8; }
        }
        ${Array.from({length:48},(_,i)=>`
          .eq-bar-${i} { animation-duration: ${(.55+i*.018).toFixed(2)}s; animation-delay: ${(i*.012).toFixed(2)}s; }
        `).join('')}
      `}</style>
    </div>
  );
}

// ─── Scroll-reveal hook ───────────────────────────────────────────────────────
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); obs.disconnect(); } }, { threshold: .15 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, style: { opacity: vis ? 1 : 0, transform: vis ? 'translateY(0)' : 'translateY(28px)', transition: 'opacity .7s ease, transform .7s ease' } };
}

// ─── Section label ────────────────────────────────────────────────────────────
function SLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily:'var(--font-mono,monospace)', fontSize:11, fontWeight:600, letterSpacing:'.2em', color:'rgba(255,255,255,0.3)', textTransform:'uppercase', marginBottom:24 }}>{children}</div>;
}

// ─── Step ─────────────────────────────────────────────────────────────────────
function HowStep({ n, title, desc }: { n: string; title: string; desc: string }) {
  const r = useReveal();
  return (
    <div ref={r.ref} style={{ ...r.style, display:'grid', gridTemplateColumns:'64px 1fr', gap:'2rem', padding:'2.5rem 0', borderTop:'1px solid rgba(255,255,255,0.07)' }}>
      <div style={{ fontFamily:'var(--font-display)', fontSize:'clamp(2rem,4vw,3rem)', fontWeight:700, color:'rgba(255,255,255,0.08)', lineHeight:1 }}>{n}</div>
      <div>
        <div style={{ fontFamily:'var(--font-display)', fontSize:'clamp(1.1rem,2.5vw,1.4rem)', fontWeight:700, marginBottom:12, color:'#fff' }}>{title}</div>
        <div style={{ fontSize:15, color:'rgba(255,255,255,0.45)', lineHeight:1.75, maxWidth:520 }}>{desc}</div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const heroReveal = useReveal();
  const statsReveal = useReveal();

  return (
    <div style={{ background:'#000', color:'#fff', minHeight:'100vh', overflowX:'hidden' }}>
      {mounted && <Particles />}

      {/* ── NAV ──────────────────────────────────────────────────────────── */}
      <nav style={{ position:'fixed', top:0, left:0, right:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 2.5rem', height:56, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(20px)', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
        <Link href="/" style={{ display:'flex', alignItems:'center', gap:10, fontFamily:'var(--font-display)', fontWeight:700, fontSize:15, letterSpacing:'-.3px' }}>
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <rect width="22" height="22" rx="6" fill="#e8404a"/>
            <path d="M6 8h10M8 8v6M14 8v6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          LightShow Builder
        </Link>
        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
          <Link href="/gallery" style={{ padding:'6px 14px', fontSize:13, color:'rgba(255,255,255,0.55)', transition:'color .15s' }}
            onMouseEnter={e=>(e.currentTarget.style.color='#fff')} onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,255,255,0.55)')}>Gallery</Link>
          <Link href="/pricing" style={{ padding:'6px 14px', fontSize:13, color:'rgba(255,255,255,0.55)', transition:'color .15s' }}
            onMouseEnter={e=>(e.currentTarget.style.color='#fff')} onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,255,255,0.55)')}>Pricing</Link>
          <Link href="/auth" style={{ padding:'6px 14px', fontSize:13, color:'rgba(255,255,255,0.55)', transition:'color .15s' }}
            onMouseEnter={e=>(e.currentTarget.style.color='#fff')} onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,255,255,0.55)')}>Sign in</Link>
          <Link href="/auth?mode=signup" style={{ marginLeft:8, padding:'7px 20px', borderRadius:6, background:'#e8404a', color:'#fff', fontSize:13, fontWeight:600, transition:'background .15s', letterSpacing:'-.2px' }}
            onMouseEnter={e=>(e.currentTarget.style.background='#c73038')} onMouseLeave={e=>(e.currentTarget.style.background='#e8404a')}>
            Start free
          </Link>
        </div>
      </nav>

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section style={{ position:'relative', zIndex:1, minHeight:'100svh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'8rem 2rem 0', textAlign:'center' }}>
        {/* Radial glow behind text */}
        <div style={{ position:'absolute', top:'30%', left:'50%', transform:'translate(-50%,-50%)', width:700, height:400, background:'radial-gradient(ellipse, rgba(232,64,74,0.12) 0%, transparent 70%)', pointerEvents:'none' }} />

        <div ref={heroReveal.ref} style={heroReveal.style}>
          <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'5px 16px', borderRadius:20, border:'1px solid rgba(255,255,255,0.12)', fontSize:12, fontWeight:500, letterSpacing:'.08em', color:'rgba(255,255,255,0.5)', marginBottom:'2.5rem' }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background:'#00e887', display:'inline-block', boxShadow:'0 0 6px #00e887' }} />
            First export free · No credit card required
          </div>

          <h1 style={{ fontFamily:'var(--font-display)', fontSize:'clamp(3rem,8vw,7rem)', fontWeight:700, lineHeight:.96, letterSpacing:'-3px', marginBottom:'2rem', color:'#fff' }}>
            Your music.<br />
            <span style={{ background:'linear-gradient(135deg,#e8404a 0%,#ff6030 50%,#ff8c00 100%)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>
              Your light show.
            </span>
          </h1>

          <p style={{ fontSize:'clamp(.95rem,2vw,1.15rem)', color:'rgba(255,255,255,0.4)', lineHeight:1.75, maxWidth:520, margin:'0 auto 3rem' }}>
            Upload any song. Watch 48 channels sync to every beat in real time.
            Export a Tesla-ready file to USB in seconds.
          </p>

          <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap', marginBottom:'5rem' }}>
            <Link href="/auth?mode=signup" style={{ padding:'14px 32px', borderRadius:8, background:'#e8404a', color:'#fff', fontSize:15, fontWeight:600, letterSpacing:'-.2px', transition:'all .2s', boxShadow:'0 0 40px rgba(232,64,74,0.3)' }}
              onMouseEnter={e=>{ e.currentTarget.style.background='#c73038'; e.currentTarget.style.boxShadow='0 0 60px rgba(232,64,74,0.5)'; }}
              onMouseLeave={e=>{ e.currentTarget.style.background='#e8404a'; e.currentTarget.style.boxShadow='0 0 40px rgba(232,64,74,0.3)'; }}>
              Build your first show →
            </Link>
            <Link href="/gallery" style={{ padding:'14px 32px', borderRadius:8, background:'rgba(255,255,255,0.05)', color:'rgba(255,255,255,0.7)', fontSize:15, fontWeight:500, border:'1px solid rgba(255,255,255,0.1)', transition:'all .2s' }}
              onMouseEnter={e=>{ e.currentTarget.style.background='rgba(255,255,255,0.08)'; e.currentTarget.style.color='#fff'; }}
              onMouseLeave={e=>{ e.currentTarget.style.background='rgba(255,255,255,0.05)'; e.currentTarget.style.color='rgba(255,255,255,0.7)'; }}>
              Browse the gallery
            </Link>
          </div>
        </div>

        {/* Light equalizer — 48 channels animated */}
        <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:'0 0' }}>
          <div style={{ width:'100%', display:'flex', gap:2, alignItems:'flex-end', height:64, overflow:'hidden' }}>
            {Array.from({ length: 80 }, (_, i) => (
              <div key={i} style={{
                flex:1, background:`hsl(${i*4},85%,62%)`, borderRadius:'2px 2px 0 0', opacity:.25,
                animation:`lbar ${(.5 + (i%7)*.18).toFixed(2)}s ease-in-out ${((i%11)*.07).toFixed(2)}s infinite alternate`,
              }} />
            ))}
          </div>
          <div style={{ height:1, background:'linear-gradient(90deg, transparent, rgba(255,255,255,0.1) 20%, rgba(255,255,255,0.1) 80%, transparent)' }} />
        </div>
      </section>

      {/* ── STATS ────────────────────────────────────────────────────────── */}
      <section style={{ position:'relative', zIndex:1, padding:'6rem 2rem', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
        <div ref={statsReveal.ref} style={{ ...statsReveal.style, maxWidth:960, margin:'0 auto', display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'2rem', textAlign:'center' }}>
          {[
            { n:'48', sub:'light channels' },
            { n:'5',  sub:'Tesla models' },
            { n:'20fps', sub:'export frame rate' },
            { n:'$2.99', sub:'per export after first free' },
          ].map(s => (
            <div key={s.n}>
              <div style={{ fontFamily:'var(--font-display)', fontSize:'clamp(2.2rem,4vw,3.5rem)', fontWeight:700, letterSpacing:'-2px', color:'#fff', marginBottom:8 }}>{s.n}</div>
              <div style={{ fontSize:13, color:'rgba(255,255,255,0.3)', letterSpacing:'.04em' }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section style={{ position:'relative', zIndex:1, maxWidth:820, margin:'0 auto', padding:'7rem 2rem' }}>
        <SLabel>How it works</SLabel>
        <h2 style={{ fontFamily:'var(--font-display)', fontSize:'clamp(1.8rem,4vw,2.8rem)', fontWeight:700, letterSpacing:'-1.5px', marginBottom:'1rem', lineHeight:1.05 }}>
          From song to USB.<br />Three steps.
        </h2>
        <p style={{ fontSize:15, color:'rgba(255,255,255,0.35)', marginBottom:'3rem', maxWidth:480, lineHeight:1.7 }}>No prior experience with Tesla light shows needed. If you can upload a file and plug in a USB drive, you can build a show.</p>
        <HowStep n="01" title="Upload your song"
          desc="Drop in any MP3 or WAV. Our beat detection reads the tempo, identifies drops and transitions, and auto-syncs 48 light channels to the music — all in seconds." />
        <HowStep n="02" title="Customize your show"
          desc="Edit any channel manually in the timeline. Toggle symmetry, adjust intensity, and preview live on a 3D model of your exact Tesla — Model 3, Y, S, X, or Cybertruck." />
        <HowStep n="03" title="Export and plug in"
          desc="One click downloads a Tesla-ready ZIP with your FSEQ file and audio. Copy it to a USB drive, plug into the front port, and tap Light Show on your touchscreen." />
      </section>

      {/* ── FEATURES ─────────────────────────────────────────────────────── */}
      <section style={{ position:'relative', zIndex:1, borderTop:'1px solid rgba(255,255,255,0.06)', padding:'7rem 2rem', background:'rgba(255,255,255,0.02)' }}>
        <div style={{ maxWidth:960, margin:'0 auto' }}>
          <SLabel>Capabilities</SLabel>
          <h2 style={{ fontFamily:'var(--font-display)', fontSize:'clamp(1.8rem,4vw,2.8rem)', fontWeight:700, letterSpacing:'-1.5px', marginBottom:'3.5rem', lineHeight:1.05 }}>
            Built for precision.<br />Designed for anyone.
          </h2>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:0 }}>
            {[
              ['Auto beat detection','Tempo analysis at any BPM — identifies drops, builds, and transitions.'],
              ['48 independent channels','Control headlights, taillights, turn signals, sill strips, interior, and more — individually.'],
              ['5 Tesla models','Model 3, Model Y, Model S, Model X, and Cybertruck — each with their exact channel layout.'],
              ['Manual beat editing','Click any beat on any channel to toggle it. Draw your own patterns from scratch.'],
              ['Left/right symmetry','Mirror edits across the car automatically. One click, perfect symmetry.'],
              ['FSEQ v2 export','Validated FSEQ file + WAV audio package. Plug in and it just works.'],
              ['Community gallery','Browse, preview, and remix shows shared by other Tesla owners.'],
              ['Real-time 3D preview','Rotate around your exact model. Watch the light show play live before you export.'],
            ].map(([title, desc], i) => (
              <div key={i} style={{ padding:'1.75rem', borderTop:'1px solid rgba(255,255,255,0.06)', borderRight: i%2===0 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                <div style={{ fontFamily:'var(--font-display)', fontSize:15, fontWeight:600, color:'#fff', marginBottom:8 }}>{title}</div>
                <div style={{ fontSize:13, color:'rgba(255,255,255,0.35)', lineHeight:1.7 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ──────────────────────────────────────────────────────── */}
      <section style={{ position:'relative', zIndex:1, maxWidth:820, margin:'0 auto', padding:'7rem 2rem' }}>
        <SLabel>Pricing</SLabel>
        <h2 style={{ fontFamily:'var(--font-display)', fontSize:'clamp(1.8rem,4vw,2.8rem)', fontWeight:700, letterSpacing:'-1.5px', marginBottom:'1rem' }}>
          Simple. No surprises.
        </h2>
        <p style={{ fontSize:15, color:'rgba(255,255,255,0.35)', marginBottom:'3rem', lineHeight:1.7 }}>
          Build and preview for free, forever. Pay once per export when you&apos;re ready to put it on your Tesla.
        </p>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:1, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:16, overflow:'hidden' }}>
          {/* Free */}
          <div style={{ padding:'2.5rem', background:'#000' }}>
            <div style={{ fontSize:12, fontWeight:600, letterSpacing:'.12em', color:'rgba(255,255,255,0.3)', textTransform:'uppercase', marginBottom:20 }}>Free</div>
            <div style={{ fontFamily:'var(--font-display)', fontSize:'3.2rem', fontWeight:700, letterSpacing:'-2px', marginBottom:4 }}>$0</div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.3)', marginBottom:'2rem', paddingBottom:'2rem', borderBottom:'1px solid rgba(255,255,255,0.07)' }}>First export included</div>
            {['Unlimited show building','Full beat detection','3D live preview','Manual channel editing','1 free USB export'].map(f=>(
              <div key={f} style={{ display:'flex', gap:10, fontSize:14, color:'rgba(255,255,255,0.5)', marginBottom:10, alignItems:'center' }}>
                <span style={{ color:'#00e887', fontSize:12 }}>✓</span>{f}
              </div>
            ))}
            <Link href="/auth?mode=signup" style={{ marginTop:'2rem', display:'flex', alignItems:'center', justifyContent:'center', padding:'12px', borderRadius:8, border:'1px solid rgba(255,255,255,0.12)', color:'rgba(255,255,255,0.6)', fontSize:14, transition:'all .15s' }}
              onMouseEnter={e=>{ e.currentTarget.style.borderColor='rgba(255,255,255,0.3)'; e.currentTarget.style.color='#fff'; }}
              onMouseLeave={e=>{ e.currentTarget.style.borderColor='rgba(255,255,255,0.12)'; e.currentTarget.style.color='rgba(255,255,255,0.6)'; }}>
              Get started free
            </Link>
          </div>
          {/* Per export */}
          <div style={{ padding:'2.5rem', background:'#0a0000', position:'relative' }}>
            <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'linear-gradient(90deg,#e8404a,#ff6030)' }} />
            <div style={{ fontSize:12, fontWeight:600, letterSpacing:'.12em', color:'#e8404a', textTransform:'uppercase', marginBottom:20 }}>Per Export</div>
            <div style={{ fontFamily:'var(--font-display)', fontSize:'3.2rem', fontWeight:700, letterSpacing:'-2px', marginBottom:4 }}>$2.99</div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.3)', marginBottom:'2rem', paddingBottom:'2rem', borderBottom:'1px solid rgba(255,255,255,0.07)' }}>per USB download</div>
            {['Everything in Free','Unlimited exports','FSEQ + WAV package','FSEQ validation report','Community gallery sharing'].map(f=>(
              <div key={f} style={{ display:'flex', gap:10, fontSize:14, color:'rgba(255,255,255,0.5)', marginBottom:10, alignItems:'center' }}>
                <span style={{ color:'#00e887', fontSize:12 }}>✓</span>{f}
              </div>
            ))}
            <Link href="/auth?mode=signup" style={{ marginTop:'2rem', display:'flex', alignItems:'center', justifyContent:'center', padding:'12px', borderRadius:8, background:'#e8404a', color:'#fff', fontSize:14, fontWeight:600, transition:'all .15s', boxShadow:'0 0 30px rgba(232,64,74,0.25)' }}
              onMouseEnter={e=>{ e.currentTarget.style.background='#c73038'; }}
              onMouseLeave={e=>{ e.currentTarget.style.background='#e8404a'; }}>
              Start building →
            </Link>
          </div>
        </div>
        <Link href="/pricing" style={{ display:'block', textAlign:'center', marginTop:16, fontSize:13, color:'rgba(255,255,255,0.25)', transition:'color .15s' }}
          onMouseEnter={e=>(e.currentTarget.style.color='rgba(255,255,255,0.5)')} onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,255,255,0.25)')}>
          View full pricing details →
        </Link>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────────────────── */}
      <section style={{ position:'relative', zIndex:1, borderTop:'1px solid rgba(255,255,255,0.06)', padding:'10rem 2rem', textAlign:'center', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:800, height:400, background:'radial-gradient(ellipse,rgba(232,64,74,0.1) 0%,transparent 70%)', pointerEvents:'none' }} />
        <div style={{ position:'relative' }}>
          <h2 style={{ fontFamily:'var(--font-display)', fontSize:'clamp(2.5rem,7vw,5.5rem)', fontWeight:700, letterSpacing:'-3px', lineHeight:.96, marginBottom:'2rem' }}>
            Your Tesla is ready.<br />
            <span style={{ background:'linear-gradient(135deg,#e8404a,#ff6030,#ff8c00)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>
              Is your show?
            </span>
          </h2>
          <p style={{ fontSize:16, color:'rgba(255,255,255,0.35)', marginBottom:'2.5rem', lineHeight:1.7 }}>
            Build your first custom light show free.<br />No experience needed — just your music and a USB drive.
          </p>
          <Link href="/auth?mode=signup" style={{ display:'inline-flex', alignItems:'center', padding:'16px 40px', borderRadius:8, background:'#e8404a', color:'#fff', fontSize:16, fontWeight:600, letterSpacing:'-.2px', transition:'all .2s', boxShadow:'0 0 60px rgba(232,64,74,0.3)' }}
            onMouseEnter={e=>{ e.currentTarget.style.background='#c73038'; e.currentTarget.style.boxShadow='0 0 80px rgba(232,64,74,0.5)'; }}
            onMouseLeave={e=>{ e.currentTarget.style.background='#e8404a'; e.currentTarget.style.boxShadow='0 0 60px rgba(232,64,74,0.3)'; }}>
            Build your first show — free →
          </Link>
          <div style={{ marginTop:16, fontSize:13, color:'rgba(255,255,255,0.2)' }}>No credit card required</div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer style={{ position:'relative', zIndex:1, borderTop:'1px solid rgba(255,255,255,0.06)', padding:'2rem 2.5rem', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
        <div style={{ fontFamily:'var(--font-display)', fontWeight:600, fontSize:13, color:'rgba(255,255,255,0.4)' }}>LightShow Builder</div>
        <div style={{ display:'flex', gap:24, fontSize:13, color:'rgba(255,255,255,0.25)' }}>
          <Link href="/gallery" onMouseEnter={e=>(e.currentTarget.style.color='rgba(255,255,255,0.6)')} onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,255,255,0.25)')}>Gallery</Link>
          <Link href="/pricing" onMouseEnter={e=>(e.currentTarget.style.color='rgba(255,255,255,0.6)')} onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,255,255,0.25)')}>Pricing</Link>
          <Link href="/auth" onMouseEnter={e=>(e.currentTarget.style.color='rgba(255,255,255,0.6)')} onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,255,255,0.25)')}>Sign in</Link>
        </div>
        <div style={{ fontSize:12, color:'rgba(255,255,255,0.15)' }}>Not affiliated with Tesla, Inc.</div>
      </footer>

      <style>{`
        @keyframes lbar {
          from { height: 4px; opacity: .15; }
          to   { height: 56px; opacity: .4; }
        }
        @media (max-width: 768px) {
          nav { padding: 0 1.25rem !important; }
          nav a[href="/gallery"], nav a[href="/pricing"], nav a[href="/auth"]:not([href*="signup"]) { display: none; }
        }
        @media (max-width: 640px) {
          div[style*="grid-template-columns: repeat(4"] { grid-template-columns: repeat(2,1fr) !important; }
          div[style*="grid-template-columns: 1fr 1fr"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
