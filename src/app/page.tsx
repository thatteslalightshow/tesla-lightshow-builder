'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import styles from './page.module.css';

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const setSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    setSize();

    const colors = ['#e8404a','#ff8c00','#ffffff','#4488ff','#00e887'];
    const particles = Array.from({length:100}, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - .5) * .5,
      vy: (Math.random() - .5) * .5,
      size: Math.random() * 3 + .5,
      opacity: Math.random() * .7 + .2,
      color: colors[Math.floor(Math.random() * colors.length)]
    }));

    let raf: number;
    function draw() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.opacity;
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    }
    draw();

    window.addEventListener('resize', setSize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', setSize);
    };
  }, [mounted]);

  return (
    <div className={styles.page}>
      {mounted && <canvas ref={canvasRef} className={styles.canvas}/>}
      <nav className={styles.nav}>
        <div className={styles.navLogo}>
          <div className={styles.logoMark}>T</div>
          <span>LightShow Builder</span>
        </div>
        <div className={styles.navLinks}>
          <Link href="/auth" className="btn btn-ghost btn-sm">Sign in</Link>
          <Link href="/auth?mode=signup" className="btn btn-primary btn-sm">Get started free</Link>
        </div>
      </nav>
      <main className={styles.hero}>
        <div className={styles.heroInner}>
          <div className="badge badge-red" style={{marginBottom:'1.5rem'}}>
            ⚡ Compatible with all Tesla models
          </div>
          <h1 className={styles.heroTitle}>
            Your music.<br/>
            <span className={styles.heroAccent}>Your light show.</span>
          </h1>
          <p className={styles.heroSub}>
            Upload any song, watch beat detection work in real time, and see your Tesla come alive in 3D — then export directly to USB in seconds.
          </p>
          <div className={styles.heroCta}>
            <Link href="/auth?mode=signup" className="btn btn-primary btn-lg">
              Build your first show →
            </Link>
            <Link href="/auth" className="btn btn-ghost btn-lg">
              Sign in
            </Link>
          </div>
        </div>
        <div className={styles.featureGrid}>
          {[
            {icon:'🎵',title:'Beat Detection',desc:'Automatic tempo analysis syncs lights to every beat, drop, and transition.'},
            {icon:'🚗',title:'3D Preview',desc:'Rotate around a full 3D model of your exact Tesla and watch the show live.'},
            {icon:'💾',title:'USB Export',desc:'One click exports a Tesla-ready ZIP. Plug in and play — no software needed.'},
            {icon:'🔒',title:'Your shows, private',desc:'Every show is locked to your account. Share only what you choose.'},
          ].map(f => (
            <div key={f.title} className={styles.featureCard}>
              <div className={styles.featureIcon}>{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </main>
      <footer className={styles.footer}>
        <p>Not affiliated with Tesla, Inc. Light shows are user-generated content.</p>
      </footer>
    </div>
  );
}
