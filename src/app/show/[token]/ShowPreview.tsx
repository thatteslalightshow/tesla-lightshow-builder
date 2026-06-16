'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import * as THREE from 'three';
import type { Show, ShowStyle } from '@/lib/supabase';

const MODEL_LABELS: Record<string, string> = {
  model3: 'Model 3', modelY: 'Model Y', modelS: 'Model S',
  modelX: 'Model X', cybertruck: 'Cybertruck',
}

const STYLE_LABELS: Record<string, string> = {
  energetic: 'Energetic', wave: 'Wave', strobe: 'Strobe', chase: 'Chase',
}

function ThreePreview({ style, intensity, bpm }: { style: ShowStyle; intensity: number; bpm: number }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const w = el.clientWidth || 800;
    const h = el.clientHeight || 480;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0f);
    scene.fog = new THREE.Fog(0x0a0a0f, 12, 26);

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.set(5, 3, 8);
    camera.lookAt(0, 0, 0);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.MeshStandardMaterial({ color: 0x0f0f18, roughness: 0.9 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.8;
    floor.receiveShadow = true;
    scene.add(floor);
    scene.add(new THREE.AmbientLight(0x111122, 0.5));

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2a, roughness: 0.3, metalness: 0.7 });
    const addBox = (x: number, y: number, z: number, w: number, h: number, d: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
      m.position.set(x, y, z);
      m.castShadow = true;
      scene.add(m);
    };
    addBox(0, -0.15, 0, 3.8, 0.55, 1.65);
    addBox(0, 0.35, -0.05, 2.6, 0.65, 1.55);
    addBox(0, -0.4, 0, 3.8, 0.05, 1.75);

    const lightDefs: [number, number, number, number][] = [
      [1.9, -0.1, 0.65, 0xffffff], [1.9, -0.1, -0.65, 0xffffff],
      [-1.9, -0.1, 0.65, 0xe8404a], [-1.9, -0.1, -0.65, 0xe8404a],
      [1.85, 0.05, 0.5, 0x88aaff], [1.85, 0.05, -0.5, 0x88aaff],
      [1.85, -0.2, 0.72, 0xff8c00], [1.85, -0.2, -0.72, 0xff8c00],
      [-1.85, -0.2, 0.72, 0xff8c00], [-1.85, -0.2, -0.72, 0xff8c00],
      [0, 0.68, 0.78, 0x4488ff], [0, 0.68, -0.78, 0x4488ff],
    ];

    const lights = lightDefs.map(([x, y, z, color]) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 8, 8),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2 })
      );
      mesh.position.set(x, y, z);
      scene.add(mesh);
      const pl = new THREE.PointLight(color, 0, 3);
      pl.position.set(x, y, z);
      scene.add(pl);
      return { mesh, pl };
    });

    let raf: number;
    let t = 0;
    const scale = intensity / 100;
    const beatsPerSec = bpm / 60;

    function animate() {
      raf = requestAnimationFrame(animate);
      t += 0.016;
      const beat = t * beatsPerSec;
      lights.forEach(({ mesh, pl }, i) => {
        const zone = Math.floor(i / 2);
        let brightness = 0;
        switch (style) {
          case 'energetic': brightness = Math.sin(beat * Math.PI * 2 + zone * 0.8) > 0 ? 1 : 0.05; break;
          case 'wave':      brightness = Math.sin(beat * Math.PI * 2 - zone * 0.6) * 0.5 + 0.5; break;
          case 'strobe':    brightness = Math.floor(beat * 2) % 2 === 0 && i % 3 === 0 ? 1 : 0.02; break;
          case 'chase':     brightness = zone === Math.floor(beat) % lights.length ? 1 : 0.05; break;
        }
        const b = brightness * scale;
        (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = b * 3;
        pl.intensity = b * 2;
      });
      camera.position.x = Math.sin(t * 0.08) * 9;
      camera.position.z = Math.cos(t * 0.08) * 9;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    }
    animate();

    const onResize = () => {
      const nw = el.clientWidth || 800;
      const nh = el.clientHeight || 480;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); renderer.dispose(); el.removeChild(renderer.domElement); };
  }, [style, intensity, bpm]);

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />;
}

export default function ShowPreview({ show }: { show: Show }) {
  const [copied, setCopied] = useState(false);

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Nav */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 2rem', borderBottom: '1px solid var(--border)', background: 'rgba(10,10,15,0.9)', backdropFilter: 'blur(12px)' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, background: 'var(--red)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: '#fff', fontFamily: 'var(--font-display)' }}>T</div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14 }}>LightShow Builder</span>
        </Link>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={copyLink} className="btn btn-ghost btn-sm">
            {copied ? '✓ Copied!' : '🔗 Copy link'}
          </button>
          <Link href="/auth?mode=signup" className="btn btn-primary btn-sm">Build your own →</Link>
        </div>
      </nav>

      {/* Hero info */}
      <div style={{ padding: '2rem 2rem 1rem', maxWidth: 960, width: '100%', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.5rem, 4vw, 2.25rem)', fontWeight: 700, letterSpacing: '-0.5px', marginBottom: '0.5rem' }}>
              {show.name}
            </h1>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span className="badge badge-red">{STYLE_LABELS[show.style] ?? show.style}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'var(--bg3)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                {MODEL_LABELS[show.tesla_model] ?? show.tesla_model}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            {[
              { label: 'BPM', value: show.bpm ?? '—' },
              { label: 'Intensity', value: `${show.intensity}%` },
              ...(show.duration_sec ? [{ label: 'Duration', value: `${Math.floor(show.duration_sec / 60)}:${String(Math.round(show.duration_sec % 60)).padStart(2, '0')}` }] : []),
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)' }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 3D Preview */}
      <div style={{ flex: 1, maxWidth: 960, width: '100%', margin: '0 auto', padding: '0 2rem 2rem' }}>
        <div style={{ height: 460, borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--border)' }}>
          <ThreePreview style={show.style} intensity={show.intensity} bpm={show.bpm ?? 120} />
        </div>

        {/* CTA */}
        <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, marginBottom: '0.25rem' }}>Want to build your own?</div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>Upload any song, pick your Tesla model, and export in seconds.</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={copyLink} className="btn btn-ghost btn-sm">{copied ? '✓ Copied!' : '🔗 Share'}</button>
            <Link href="/auth?mode=signup" className="btn btn-primary">Build your own →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
