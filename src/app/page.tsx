'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import SocialLinks from '@/components/SocialLinks';
import BrandLogo from '@/components/BrandLogo';
import SiteMenu from '@/components/SiteMenu';

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

// ─── Oscilloscope waveform ────────────────────────────────────────────────────
function HeroWave() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    let t = 0, raf: number;
    const resize = () => { c.width = c.offsetWidth * window.devicePixelRatio; c.height = c.offsetHeight * window.devicePixelRatio; ctx.scale(window.devicePixelRatio, window.devicePixelRatio); };
    resize();
    const W = () => c.offsetWidth, H = () => c.offsetHeight;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      t += 0.008;
      ctx.clearRect(0, 0, c.width, c.height);
      const w = W(), h = H(), mid = h * 0.5;

      // Three layered waves — different speeds and amplitudes
      const waves = [
        { freq: 0.0055, amp: 0.30, speed: 1.0,  alpha: 0.07, width: 1   },
        { freq: 0.0088, amp: 0.18, speed: 1.6,  alpha: 0.05, width: 1   },
        { freq: 0.0032, amp: 0.22, speed: 0.65, alpha: 0.06, width: 1   },
        { freq: 0.0062, amp: 0.26, speed: 1.0,  alpha: 0.13, width: 1.5 }, // primary
      ];

      waves.forEach(({ freq, amp, speed, alpha, width }) => {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 1.5) {
          const y = mid
            + Math.sin(x * freq + t * speed) * amp * h
            + Math.sin(x * freq * 2.1 + t * speed * 0.7) * amp * 0.28 * h;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
        ctx.lineWidth = width;
        ctx.lineJoin = 'round';
        ctx.stroke();
      });

      // Faint fill below primary wave
      ctx.beginPath();
      for (let x = 0; x <= w; x += 1.5) {
        const y = mid
          + Math.sin(x * 0.0062 + t) * 0.26 * h
          + Math.sin(x * 0.013 + t * 0.7) * 0.072 * h;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
      const grad = ctx.createLinearGradient(0, mid, 0, h);
      grad.addColorStop(0, 'rgba(255,255,255,0.03)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fill();
    };
    tick();
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={ref} style={{ position:'absolute', bottom:0, left:0, width:'100%', height:88, pointerEvents:'none', display:'block' }} />;
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
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <BrandLogo boxSize={30} />
          <SiteMenu align="left" />
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
          <Link href="/auth" style={{ padding:'6px 14px', fontSize:13, color:'rgba(255,255,255,0.55)', transition:'color .15s' }}
            onMouseEnter={e=>(e.currentTarget.style.color='#fff')} onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,255,255,0.55)')}>Sign in</Link>
          <Link href="/auth?mode=signup" style={{ marginLeft:8, padding:'7px 18px', borderRadius:6, background:'#e8404a', color:'#fff', fontSize:13, fontWeight:600, transition:'background .15s', letterSpacing:'-.2px' }}
            onMouseEnter={e=>(e.currentTarget.style.background='#c73038')} onMouseLeave={e=>(e.currentTarget.style.background='#e8404a')}>
            Start free
          </Link>
        </div>
      </nav>

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section style={{ position:'relative', zIndex:1, minHeight:'100svh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'8rem 2rem 0', textAlign:'center' }}>
        {/* Radial glow behind text */}
        <div style={{ position:'absolute', top:'30%', left:'50%', transform:'translate(-50%,-50%)', width:'min(700px, 100%)', height:400, background:'radial-gradient(ellipse, rgba(232,64,74,0.12) 0%, transparent 70%)', pointerEvents:'none' }} />

        <div ref={heroReveal.ref} style={heroReveal.style}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo.png" alt="That Lightshow — Tesla Lightshow Builder"
            style={{ width:'min(460px, 84vw)', height:'auto', display:'block', margin:'0 auto 2rem', filter:'drop-shadow(0 0 55px rgba(232,64,74,0.18))' }} />
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

        <HeroWave />
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
        <HowStep n="03" title="Export, add your song, plug in"
          desc="One click downloads a Tesla-ready folder with your FSEQ light sequence and simple setup instructions. Drop in your own copy of the song, copy it to a USB drive, plug into the front port, and tap Light Show on your touchscreen." />
      </section>

      {/* ── BYOM ─────────────────────────────────────────────────────────── */}
      <section style={{ position:'relative', zIndex:1, borderTop:'1px solid rgba(255,255,255,0.06)', background:'linear-gradient(180deg,rgba(232,64,74,0.06),rgba(255,96,48,0.02))' }}>
        <div style={{ maxWidth:820, margin:'0 auto', padding:'7rem 2rem', textAlign:'center' }}>
          <SLabel>Bring your own music</SLabel>
          <h2 style={{ fontFamily:'var(--font-display)', fontSize:'clamp(2rem,5vw,3.4rem)', fontWeight:700, letterSpacing:'-2px', lineHeight:1.02, marginBottom:'1.5rem' }}>
            Choreography by us.<br /><span style={{ background:'linear-gradient(90deg,#e8404a,#ff6030)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>Soundtrack by you.</span>
          </h2>
          <p style={{ fontSize:16, color:'rgba(255,255,255,0.45)', maxWidth:560, margin:'0 auto', lineHeight:1.75 }}>
            Your export is the light sequence — never the song. We use your upload only to build the show, then <strong style={{ color:'rgba(255,255,255,0.7)' }}>delete it the moment you export</strong>. To run a show, drop your own copy of the same track into the LightShow folder. It keeps everyone <strong style={{ color:'rgba(255,255,255,0.7)' }}>on the right side of the music</strong> — the song belongs to the artists who made it.
          </p>
        </div>
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
              ['FSEQ v2 export','Validated FSEQ light sequence with step-by-step setup. Add your own song and plug in.'],
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
          Build and preview for free, forever. Pay $2.99 per export, or go unlimited with Creator when you&apos;re building regularly.
        </p>
        <div className="home-pricing-grid" style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:1, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:16, overflow:'hidden' }}>
          {/* Free */}
          <div style={{ padding:'2.5rem', background:'#000' }}>
            <div style={{ fontSize:12, fontWeight:600, letterSpacing:'.12em', color:'rgba(255,255,255,0.3)', textTransform:'uppercase', marginBottom:20 }}>Free</div>
            <div style={{ fontFamily:'var(--font-display)', fontSize:'3.2rem', fontWeight:700, letterSpacing:'-2px', marginBottom:4 }}>$0</div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.3)', marginBottom:'2rem', paddingBottom:'2rem', borderBottom:'1px solid rgba(255,255,255,0.07)' }}>First export included</div>
            {['Unlimited show building','Music-reactive audio engine','3D live preview on your model','Manual channel editing','1 free USB export'].map(f=>(
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
          <div style={{ padding:'2.5rem', background:'#000' }}>
            <div style={{ fontSize:12, fontWeight:600, letterSpacing:'.12em', color:'rgba(255,255,255,0.3)', textTransform:'uppercase', marginBottom:20 }}>Per Export</div>
            <div style={{ fontFamily:'var(--font-display)', fontSize:'3.2rem', fontWeight:700, letterSpacing:'-2px', marginBottom:4 }}>$2.99</div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.3)', marginBottom:'2rem', paddingBottom:'2rem', borderBottom:'1px solid rgba(255,255,255,0.07)' }}>per USB download</div>
            {['Everything in Free','Export any show for $2.99','Beat-synced FSEQ + emailed setup steps','FSEQ v2 validation report','Pay only when you export'].map(f=>(
              <div key={f} style={{ display:'flex', gap:10, fontSize:14, color:'rgba(255,255,255,0.5)', marginBottom:10, alignItems:'center' }}>
                <span style={{ color:'#00e887', fontSize:12 }}>✓</span>{f}
              </div>
            ))}
            <Link href="/auth?mode=signup" style={{ marginTop:'2rem', display:'flex', alignItems:'center', justifyContent:'center', padding:'12px', borderRadius:8, border:'1px solid rgba(255,255,255,0.12)', color:'rgba(255,255,255,0.6)', fontSize:14, transition:'all .15s' }}
              onMouseEnter={e=>{ e.currentTarget.style.borderColor='rgba(255,255,255,0.3)'; e.currentTarget.style.color='#fff'; }}
              onMouseLeave={e=>{ e.currentTarget.style.borderColor='rgba(255,255,255,0.12)'; e.currentTarget.style.color='rgba(255,255,255,0.6)'; }}>
              Start building →
            </Link>
          </div>
          {/* Creator subscription */}
          <div style={{ padding:'2.5rem', background:'#0a0000', position:'relative' }}>
            <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'linear-gradient(90deg,#e8404a,#ff6030)' }} />
            <div style={{ position:'absolute', top:14, right:14, fontSize:9, fontWeight:700, letterSpacing:'.05em', color:'#fff', background:'#e8404a', padding:'3px 8px', borderRadius:10 }}>BEST VALUE</div>
            <div style={{ fontSize:12, fontWeight:600, letterSpacing:'.12em', color:'#e8404a', textTransform:'uppercase', marginBottom:20 }}>Creator</div>
            <div style={{ fontFamily:'var(--font-display)', fontSize:'3.2rem', fontWeight:700, letterSpacing:'-2px', marginBottom:4 }}>$6.99<span style={{ fontSize:'1rem', fontWeight:500, color:'rgba(255,255,255,0.3)', letterSpacing:0 }}>/mo</span></div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.3)', marginBottom:'2rem', paddingBottom:'2rem', borderBottom:'1px solid rgba(255,255,255,0.07)' }}>or $59.99/yr — save 28%</div>
            {['Everything in Per Export','Unlimited exports + free re-exports','Export to all your Teslas at once','Unlimited cloud library','Remix any community show'].map(f=>(
              <div key={f} style={{ display:'flex', gap:10, fontSize:14, color:'rgba(255,255,255,0.5)', marginBottom:10, alignItems:'center' }}>
                <span style={{ color:'#00e887', fontSize:12 }}>✓</span>{f}
              </div>
            ))}
            <Link href="/auth?mode=signup" style={{ marginTop:'2rem', display:'flex', alignItems:'center', justifyContent:'center', padding:'12px', borderRadius:8, background:'#e8404a', color:'#fff', fontSize:14, fontWeight:600, transition:'all .15s', boxShadow:'0 0 30px rgba(232,64,74,0.25)' }}
              onMouseEnter={e=>{ e.currentTarget.style.background='#c73038'; }}
              onMouseLeave={e=>{ e.currentTarget.style.background='#e8404a'; }}>
              Go unlimited →
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
        <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:'min(800px, 100%)', height:400, background:'radial-gradient(ellipse,rgba(232,64,74,0.1) 0%,transparent 70%)', pointerEvents:'none' }} />
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

      {/* ── APPS IN DEVELOPMENT ──────────────────────────────────────────── */}
      <section style={{ position:'relative', zIndex:1, borderTop:'1px solid rgba(255,255,255,0.06)', padding:'5rem 2rem', textAlign:'center' }}>
        <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'5px 14px', borderRadius:20, border:'1px solid rgba(255,255,255,0.12)', fontSize:11, fontWeight:600, letterSpacing:'.12em', color:'rgba(255,255,255,0.45)', textTransform:'uppercase', marginBottom:'1.5rem' }}>
          <span style={{ width:6, height:6, borderRadius:'50%', background:'#ff8c00', display:'inline-block', boxShadow:'0 0 6px #ff8c00' }} />
          In development
        </div>
        <h2 style={{ fontFamily:'var(--font-display)', fontSize:'clamp(1.8rem,5vw,3rem)', fontWeight:700, letterSpacing:'-1.5px', marginBottom:'1rem' }}>
          Coming to your pocket
        </h2>
        <p style={{ fontSize:15, color:'rgba(255,255,255,0.4)', maxWidth:480, margin:'0 auto 2.5rem', lineHeight:1.7 }}>
          Native iOS and Android apps are on the way — build shows, preview in 3D, and get your export emailed straight to you.
          For now, everything works right here in your browser, on any device.
        </p>
        <div style={{ display:'flex', gap:14, justifyContent:'center', flexWrap:'wrap' }}>
          {/* App Store — coming soon */}
          <div style={{ display:'inline-flex', alignItems:'center', gap:10, padding:'10px 20px', borderRadius:12, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)', opacity:.8 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="rgba(255,255,255,0.75)" aria-hidden="true"><path d="M17.05 12.04c-.03-2.9 2.37-4.3 2.48-4.36-1.35-1.98-3.46-2.25-4.2-2.28-1.79-.18-3.5 1.05-4.4 1.05-.91 0-2.31-1.03-3.8-1-1.95.03-3.76 1.13-4.76 2.88-2.03 3.52-.52 8.74 1.45 11.6.96 1.4 2.1 2.97 3.6 2.91 1.44-.06 1.99-.93 3.74-.93 1.73 0 2.23.93 3.76.9 1.55-.03 2.53-1.42 3.48-2.83 1.1-1.62 1.55-3.19 1.57-3.27-.03-.02-3.01-1.16-3.04-4.59zM14.2 4.66c.8-.96 1.33-2.3 1.18-3.63-1.15.05-2.53.77-3.35 1.73-.74.85-1.38 2.21-1.21 3.51 1.28.1 2.59-.65 3.38-1.61z"/></svg>
            <div style={{ textAlign:'left' }}>
              <div style={{ fontSize:9, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'.08em' }}>Coming soon to</div>
              <div style={{ fontSize:15, fontWeight:600, color:'rgba(255,255,255,0.8)' }}>App Store</div>
            </div>
          </div>
          {/* Google Play — coming soon */}
          <div style={{ display:'inline-flex', alignItems:'center', gap:10, padding:'10px 20px', borderRadius:12, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)', opacity:.8 }}>
            <svg width="20" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.6 1.8c-.3.32-.48.82-.48 1.47v17.46c0 .65.18 1.15.48 1.47l.06.06L13.4 12.1v-.2L3.66 1.74l-.06.06z" fill="#4ac0ff"/><path d="M16.7 15.4l-3.3-3.3v-.2l3.3-3.3.08.04 3.9 2.22c1.12.63 1.12 1.67 0 2.31l-3.9 2.22-.08.01z" fill="#ffc94a"/><path d="M16.78 15.36L13.4 12 3.6 21.66c.37.39.98.44 1.67.05l11.51-6.35z" fill="#f4423e"/><path d="M16.78 8.64L5.27 2.29c-.69-.39-1.3-.34-1.67.05L13.4 12l3.38-3.36z" fill="#00d885"/></svg>
            <div style={{ textAlign:'left' }}>
              <div style={{ fontSize:9, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'.08em' }}>Coming soon to</div>
              <div style={{ fontSize:15, fontWeight:600, color:'rgba(255,255,255,0.8)' }}>Google Play</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CREATOR STRIP ────────────────────────────────────────────────── */}
      <section style={{ position:'relative', zIndex:1, borderTop:'1px solid rgba(255,255,255,0.06)', padding:'4rem 2.5rem', display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', gap:'1.25rem' }}>
        <div style={{ fontSize:11, fontWeight:600, letterSpacing:'.15em', color:'rgba(255,255,255,0.2)', textTransform:'uppercase' }}>Created by</div>
        <div style={{ fontFamily:'var(--font-display)', fontSize:'clamp(1.4rem,4vw,2rem)', fontWeight:700, letterSpacing:'-1px', lineHeight:1 }}>
          @ThatTeslaLightshow
        </div>
        <div style={{ fontSize:14, color:'rgba(255,255,255,0.35)', maxWidth:460, lineHeight:1.7 }}>
          Building the best Tesla light show tools for the community.
          Follow along for tutorials, featured shows, and inspiration.
        </div>
        <SocialLinks gap={8} size={38} style={{ marginTop:4 }} />
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer style={{ position:'relative', zIndex:1, borderTop:'1px solid rgba(255,255,255,0.06)', padding:'1.5rem 2.5rem', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
          <div style={{ fontFamily:'var(--font-display)', fontWeight:600, fontSize:13, color:'rgba(255,255,255,0.4)' }}>ThatTeslaLightshow</div>
          <a href="mailto:support@thatteslalightshow.com" style={{ fontSize:12, color:'rgba(255,255,255,0.3)' }} onMouseEnter={e=>(e.currentTarget.style.color='rgba(255,255,255,0.6)')} onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,255,255,0.3)')}>support@thatteslalightshow.com</a>
        </div>
        <div style={{ display:'flex', gap:24, fontSize:13, color:'rgba(255,255,255,0.25)' }}>
          <Link href="/gallery" onMouseEnter={e=>(e.currentTarget.style.color='rgba(255,255,255,0.6)')} onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,255,255,0.25)')}>Gallery</Link>
          <Link href="/guide" onMouseEnter={e=>(e.currentTarget.style.color='rgba(255,255,255,0.6)')} onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,255,255,0.25)')}>Guide</Link>
          <Link href="/pricing" onMouseEnter={e=>(e.currentTarget.style.color='rgba(255,255,255,0.6)')} onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,255,255,0.25)')}>Pricing</Link>
          <Link href="/auth" onMouseEnter={e=>(e.currentTarget.style.color='rgba(255,255,255,0.6)')} onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,255,255,0.25)')}>Sign in</Link>
          <Link href="/faq" onMouseEnter={e=>(e.currentTarget.style.color='rgba(255,255,255,0.6)')} onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,255,255,0.25)')}>FAQ</Link>
          <Link href="/contact" onMouseEnter={e=>(e.currentTarget.style.color='rgba(255,255,255,0.6)')} onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,255,255,0.25)')}>Contact</Link>
          <Link href="/privacy" onMouseEnter={e=>(e.currentTarget.style.color='rgba(255,255,255,0.6)')} onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,255,255,0.25)')}>Privacy</Link>
          <Link href="/terms" onMouseEnter={e=>(e.currentTarget.style.color='rgba(255,255,255,0.6)')} onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,255,255,0.25)')}>Terms</Link>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:16 }}>
          <SocialLinks gap={4} size={28} />
          <div style={{ fontSize:12, color:'rgba(255,255,255,0.15)' }}>Not affiliated with Tesla, Inc.</div>
        </div>
      </footer>

      <style>{`
        @media (max-width: 768px) {
          /* Nav: tighten padding (Sign in stays visible next to Start free) */
          nav { padding: 0 1rem !important; }

          /* Hero: reduce top padding so content isn't buried under fixed nav */
          section:first-of-type { padding-top: 5rem !important; }

          /* Stats row: 2x2 grid */
          div[style*="grid-template-columns: repeat(4"] { grid-template-columns: repeat(2,1fr) !important; }

          /* Pricing: stack cards */
          div[style*="grid-template-columns: 1fr 1fr"] { grid-template-columns: 1fr !important; }
          .home-pricing-grid { grid-template-columns: 1fr !important; }

          /* How-it-works steps: tighter grid */
          div[style*="grid-template-columns: 64px 1fr"] { grid-template-columns: 40px 1fr !important; gap: 1rem !important; }

          /* CTA buttons: stack on tiny screens */
          div[style*="justifyContent: 'center'"][style*="flexWrap: 'wrap'"] { flex-direction: column; align-items: stretch; }

          /* Creator strip: tighter padding */
          section[style*="4rem 2.5rem"] { padding: 2.5rem 1.25rem !important; }

          /* Footer: stack */
          footer { flex-direction: column; align-items: flex-start !important; gap: 14px !important; padding: 1.5rem 1.25rem !important; }
        }

        @media (max-width: 480px) {
          /* Features grid: single column */
          div[style*="minmax(280px,1fr)"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
