'use client';
import { useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import * as THREE from 'three';
import JSZip from 'jszip';
import { supabase, validateAudioFile, type TeslaModel, type ShowStyle } from '@/lib/supabase';

const TESLA_MODELS: { value: TeslaModel; label: string }[] = [
  { value: 'model3', label: 'Model 3' },
  { value: 'modelY', label: 'Model Y' },
  { value: 'modelS', label: 'Model S' },
  { value: 'modelX', label: 'Model X' },
  { value: 'cybertruck', label: 'Cybertruck' },
];

const STYLES: { value: ShowStyle; label: string; desc: string }[] = [
  { value: 'energetic', label: 'Energetic', desc: 'Fast flashes synced to beats' },
  { value: 'wave', label: 'Wave', desc: 'Smooth rolling light waves' },
  { value: 'strobe', label: 'Strobe', desc: 'Sharp rhythmic strobing' },
  { value: 'chase', label: 'Chase', desc: 'Sequential chasing pattern' },
];

function detectBPM(buffer: AudioBuffer): number {
  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const windowSize = Math.floor(sampleRate * 0.02);
  const energies: number[] = [];
  for (let i = 0; i < data.length - windowSize; i += windowSize) {
    let sum = 0;
    for (let j = 0; j < windowSize; j++) sum += data[i + j] ** 2;
    energies.push(sum / windowSize);
  }
  const avg = energies.reduce((a, b) => a + b, 0) / energies.length;
  const threshold = avg * 1.5;
  const beats: number[] = [];
  let lastBeat = -Infinity;
  const minInterval = Math.floor(0.25 * (sampleRate / windowSize));
  energies.forEach((e, i) => {
    if (e > threshold && i - lastBeat > minInterval) {
      beats.push(i);
      lastBeat = i;
    }
  });
  if (beats.length < 2) return 120;
  const intervals = beats.slice(1).map((b, i) => b - beats[i]);
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const fps = sampleRate / windowSize;
  return Math.round(60 / (avgInterval / fps));
}

function buildFseq(channels: number, frames: number, stepMs: number, frameData: Uint8Array[]): ArrayBuffer {
  const headerSize = 32;
  const totalSize = headerSize + frames * channels;
  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);
  const u8 = new Uint8Array(buf);
  // Magic "PSEQ"
  u8[0] = 0x50; u8[1] = 0x53; u8[2] = 0x45; u8[3] = 0x51;
  view.setUint16(4, headerSize, true);  // channel data start
  u8[6] = 0; u8[7] = 2;                // version 2.0
  view.setUint16(8, headerSize, true);  // header length
  view.setUint32(10, channels, true);   // channel count
  view.setUint32(14, frames, true);     // frame count
  view.setUint16(18, stepMs, true);     // step time ms
  u8[20] = 0; u8[21] = 0;
  view.setUint16(22, 0, true);
  u8[24] = 1; u8[25] = 0; u8[26] = 0; u8[27] = 0;
  u8[28] = 0; u8[29] = 0; u8[30] = 0; u8[31] = 0;
  for (let f = 0; f < frames; f++) {
    const offset = headerSize + f * channels;
    u8.set(frameData[f] ?? new Uint8Array(channels), offset);
  }
  return buf;
}

function generateFrames(style: ShowStyle, intensity: number, bpm: number, frames: number, channels: number): Uint8Array[] {
  const result: Uint8Array[] = [];
  const scale = intensity / 100;
  const beatsPerFrame = bpm / (60 * 20); // frames at 20fps
  for (let f = 0; f < frames; f++) {
    const frame = new Uint8Array(channels);
    const t = f * beatsPerFrame;
    for (let c = 0; c < channels; c++) {
      let val = 0;
      const zone = Math.floor(c / 3);
      switch (style) {
        case 'energetic':
          val = Math.sin(t * Math.PI * 2 + zone * 0.8) > 0.2 ? 255 : 0;
          break;
        case 'wave':
          val = Math.round((Math.sin(t * Math.PI * 2 - zone * 0.5) * 0.5 + 0.5) * 255);
          break;
        case 'strobe':
          val = Math.floor(t) % 2 === 0 && f % 3 === 0 ? 255 : 0;
          break;
        case 'chase':
          val = (zone === Math.floor(t) % Math.ceil(channels / 3)) ? 255 : 0;
          break;
      }
      frame[c] = Math.round(val * scale);
    }
    result.push(frame);
  }
  return result;
}

function ThreePreview({ style, intensity, bpm }: { style: ShowStyle; intensity: number; bpm: number }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const w = el.clientWidth || 600;
    const h = el.clientHeight || 340;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0f);
    scene.fog = new THREE.Fog(0x0a0a0f, 12, 25);

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.set(5, 3, 8);
    camera.lookAt(0, 0, 0);

    // Floor
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.MeshStandardMaterial({ color: 0x0f0f18, roughness: 0.9 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.8;
    floor.receiveShadow = true;
    scene.add(floor);

    // Ambient
    scene.add(new THREE.AmbientLight(0x111122, 0.5));

    // Car body segments
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2a, roughness: 0.3, metalness: 0.7 });
    const addBox = (x: number, y: number, z: number, w: number, h: number, d: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
      m.position.set(x, y, z);
      m.castShadow = true;
      scene.add(m);
      return m;
    };
    addBox(0, -0.15, 0, 3.8, 0.55, 1.65);  // chassis
    addBox(0, 0.35, -0.05, 2.6, 0.65, 1.55); // cabin
    addBox(0, -0.4, 0, 3.8, 0.05, 1.75);    // underbody

    // Light positions: [x, y, z, color, label]
    const lightDefs: [number, number, number, number][] = [
      // headlights
      [1.9, -0.1, 0.65, 0xffffff],
      [1.9, -0.1, -0.65, 0xffffff],
      // tail lights
      [-1.9, -0.1, 0.65, 0xe8404a],
      [-1.9, -0.1, -0.65, 0xe8404a],
      // DRL / running
      [1.85, 0.05, 0.5, 0x88aaff],
      [1.85, 0.05, -0.5, 0x88aaff],
      // turn signals front
      [1.85, -0.2, 0.72, 0xff8c00],
      [1.85, -0.2, -0.72, 0xff8c00],
      // turn signals rear
      [-1.85, -0.2, 0.72, 0xff8c00],
      [-1.85, -0.2, -0.72, 0xff8c00],
      // top marker
      [0, 0.68, 0.78, 0x4488ff],
      [0, 0.68, -0.78, 0x4488ff],
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
      return { mesh, pl, baseColor: new THREE.Color(color) };
    });

    let raf: number;
    let t = 0;
    const scale = intensity / 100;
    const beatsPerSec = bpm / 60;

    function animate() {
      raf = requestAnimationFrame(animate);
      t += 0.016;
      const beat = t * beatsPerSec;

      lights.forEach(({ mesh, pl, baseColor }, i) => {
        const zone = Math.floor(i / 2);
        let brightness = 0;
        switch (style) {
          case 'energetic':
            brightness = Math.sin(beat * Math.PI * 2 + zone * 0.8) > 0 ? 1 : 0.05;
            break;
          case 'wave':
            brightness = Math.sin(beat * Math.PI * 2 - zone * 0.6) * 0.5 + 0.5;
            break;
          case 'strobe':
            brightness = Math.floor(beat * 2) % 2 === 0 && i % 3 === 0 ? 1 : 0.02;
            break;
          case 'chase':
            brightness = zone === Math.floor(beat) % lights.length ? 1 : 0.05;
            break;
        }
        const b = brightness * scale;
        (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = b * 3;
        pl.intensity = b * 2;
      });

      // Slow camera orbit
      camera.position.x = Math.sin(t * 0.1) * 9;
      camera.position.z = Math.cos(t * 0.1) * 9;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    }
    animate();

    const onResize = () => {
      const nw = el.clientWidth || 600;
      const nh = el.clientHeight || 340;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [style, intensity, bpm]);

  return <div ref={mountRef} style={{ width: '100%', height: 340, borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: '#0a0a0f' }} />;
}

function BuilderInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('id');

  const [authed, setAuthed] = useState(false);
  const [userId, setUserId] = useState('');
  const [name, setName] = useState('My Light Show');
  const [model, setModel] = useState<TeslaModel>('model3');
  const [style, setStyle] = useState<ShowStyle>('energetic');
  const [intensity, setIntensity] = useState(80);
  const [bpm, setBpm] = useState(120);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioError, setAudioError] = useState('');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/auth'); return; }
      setAuthed(true);
      setUserId(session.user.id);
      if (editId) loadShow(editId);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) router.replace('/auth');
    });
    return () => subscription.unsubscribe();
  }, [router, editId]);

  async function loadShow(id: string) {
    const { data } = await supabase.from('shows').select('*').eq('id', id).single();
    if (!data) return;
    setName(data.name);
    setModel(data.tesla_model);
    setStyle(data.style);
    setIntensity(data.intensity);
    if (data.bpm) setBpm(data.bpm);
  }

  function onAudioChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateAudioFile(file);
    if (err) { setAudioError(err); return; }
    setAudioError('');
    setAudioFile(file);

    // Detect BPM
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const ctx = new AudioContext();
        const ab = await ctx.decodeAudioData(ev.target?.result as ArrayBuffer);
        const detected = detectBPM(ab);
        setBpm(Math.max(60, Math.min(200, detected)));
        ctx.close();
      } catch { /* ignore */ }
    };
    reader.readAsArrayBuffer(file);
  }

  async function save() {
    setSaving(true);
    setSaveMsg('');
    const payload = {
      user_id: userId,
      name,
      tesla_model: model,
      style,
      intensity,
      bpm,
      updated_at: new Date().toISOString(),
    };
    let error;
    if (editId) {
      ({ error } = await supabase.from('shows').update(payload).eq('id', editId));
    } else {
      const { error: e, data } = await supabase.from('shows').insert({ ...payload, is_public: false, share_token: crypto.randomUUID() }).select().single();
      error = e;
      if (data) router.replace(`/builder?id=${data.id}`);
    }
    setSaving(false);
    setSaveMsg(error ? `Error: ${error.message}` : 'Saved!');
    setTimeout(() => setSaveMsg(''), 3000);
  }

  async function exportZip() {
    setExporting(true);
    const FPS = 20;
    const durationSec = audioFile ? 0 : 30;
    const frames = durationSec * FPS || 600;
    const channels = 48;
    const frameData = generateFrames(style, intensity, bpm, frames, channels);
    const fseq = buildFseq(channels, frames, 1000 / FPS, frameData);

    const zip = new JSZip();
    const folder = zip.folder('LightShow')!;
    folder.file('lightshow.fseq', fseq);
    if (audioFile) folder.file('lightshow.wav', await audioFile.arrayBuffer());
    folder.file('show_config.json', JSON.stringify({ name, tesla_model: model, style, intensity, bpm }, null, 2));

    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/\s+/g, '_')}_lightshow.zip`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  }

  if (!authed) return <div style={{ minHeight: '100vh', background: 'var(--bg)' }} />;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Nav */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 2rem', borderBottom: '1px solid var(--border)', background: 'rgba(10,10,15,0.9)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 13 }}>
            ← Dashboard
          </Link>
          <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            style={{ background: 'none', border: 'none', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, color: 'var(--text)', minWidth: 0, outline: 'none' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {saveMsg && <span style={{ fontSize: 12, color: saveMsg.startsWith('Error') ? '#ff8a8a' : 'var(--green)', alignSelf: 'center' }}>{saveMsg}</span>}
          <button onClick={save} disabled={saving} className="btn btn-ghost btn-sm">{saving ? 'Saving…' : 'Save'}</button>
          <button onClick={exportZip} disabled={exporting} className="btn btn-primary btn-sm">{exporting ? 'Exporting…' : '⬇ Export ZIP'}</button>
        </div>
      </nav>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '280px 1fr', gap: 0, minHeight: 0 }}>
        {/* Left panel */}
        <aside style={{ borderRight: '1px solid var(--border)', padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Audio upload */}
          <div>
            <div className="label">Audio file</div>
            <label style={{ display: 'block', border: '1px dashed var(--border)', borderRadius: 'var(--radius)', padding: '1rem', textAlign: 'center', cursor: 'pointer', transition: 'border-color .15s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--red)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
              <input type="file" accept="audio/mpeg,audio/mp3,audio/wav" onChange={onAudioChange} style={{ display: 'none' }} />
              <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>🎵</div>
              <div style={{ fontSize: 12, color: audioFile ? 'var(--green)' : 'var(--muted)' }}>
                {audioFile ? audioFile.name : 'Click to upload MP3 or WAV'}
              </div>
              {!audioFile && <div style={{ fontSize: 11, color: 'var(--muted2)', marginTop: 2 }}>Max 50MB</div>}
            </label>
            {audioError && <div style={{ fontSize: 11, color: '#ff8a8a', marginTop: 4 }}>{audioError}</div>}
          </div>

          {/* Tesla model */}
          <div>
            <div className="label">Tesla model</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {TESLA_MODELS.map(m => (
                <button key={m.value} onClick={() => setModel(m.value)}
                  style={{ padding: '8px 12px', borderRadius: 'var(--radius)', border: `1px solid ${model === m.value ? 'var(--red)' : 'var(--border)'}`, background: model === m.value ? 'var(--red-glow)' : 'var(--bg3)', color: model === m.value ? 'var(--text)' : 'var(--muted)', fontSize: 13, textAlign: 'left', cursor: 'pointer', transition: 'all .15s' }}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Style */}
          <div>
            <div className="label">Animation style</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {STYLES.map(s => (
                <button key={s.value} onClick={() => setStyle(s.value)}
                  style={{ padding: '8px 12px', borderRadius: 'var(--radius)', border: `1px solid ${style === s.value ? 'var(--red)' : 'var(--border)'}`, background: style === s.value ? 'var(--red-glow)' : 'var(--bg3)', textAlign: 'left', cursor: 'pointer', transition: 'all .15s' }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: style === s.value ? 'var(--text)' : 'var(--muted)' }}>{s.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted2)', marginTop: 1 }}>{s.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* BPM */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div className="label">BPM</div>
              <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>{bpm}</span>
            </div>
            <input type="range" min={60} max={200} value={bpm} onChange={e => setBpm(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--red)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted2)', marginTop: 2 }}>
              <span>60</span><span>200</span>
            </div>
          </div>

          {/* Intensity */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div className="label">Intensity</div>
              <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>{intensity}%</span>
            </div>
            <input type="range" min={10} max={100} value={intensity} onChange={e => setIntensity(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--red)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted2)', marginTop: 2 }}>
              <span>10%</span><span>100%</span>
            </div>
          </div>
        </aside>

        {/* Main area */}
        <main style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
          <ThreePreview style={style} intensity={intensity} bpm={bpm} />

          {/* Stats bar */}
          <div style={{ display: 'flex', gap: '1rem', padding: '1rem', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
            {[
              { label: 'Model', value: TESLA_MODELS.find(m => m.value === model)?.label },
              { label: 'Style', value: STYLES.find(s => s.value === style)?.label },
              { label: 'BPM', value: bpm },
              { label: 'Intensity', value: `${intensity}%` },
              { label: 'Audio', value: audioFile ? audioFile.name.slice(0, 20) : 'None' },
            ].map(item => (
              <div key={item.label} style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3 }}>{item.label}</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* Timeline */}
          <div style={{ padding: '1rem', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
            <div className="label" style={{ marginBottom: '.75rem' }}>Timeline preview</div>
            <TimelinePreview bpm={bpm} style={style} intensity={intensity} />
          </div>

          {/* Export instructions */}
          <div style={{ padding: '1rem', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', fontSize: 13, color: 'var(--muted)' }}>
            <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '.5rem' }}>How to use on your Tesla</div>
            <ol style={{ paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
              <li>Click <strong style={{ color: 'var(--text)' }}>Export ZIP</strong> to download the LightShow package.</li>
              <li>Copy the <code style={{ background: 'var(--bg3)', padding: '1px 4px', borderRadius: 3 }}>LightShow/</code> folder to the root of a USB drive formatted as exFAT.</li>
              <li>Plug the USB into the front USB port of your Tesla.</li>
              <li>Go to <strong style={{ color: 'var(--text)' }}>Entertainment → Light Show</strong> in your Tesla touchscreen.</li>
            </ol>
          </div>
        </main>
      </div>
    </div>
  );
}

function TimelinePreview({ bpm, style, intensity }: { bpm: number; style: ShowStyle; intensity: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const zones = 8;
    const zoneH = h / zones;
    const totalBeats = Math.round(bpm * 8 / 60);
    const beatW = w / totalBeats;
    const scale = intensity / 100;
    const colors = ['#e8404a', '#ff8c00', '#ffffff', '#4488ff', '#00e887', '#e8404a', '#ff8c00', '#ffffff'];

    for (let z = 0; z < zones; z++) {
      for (let b = 0; b < totalBeats; b++) {
        let brightness = 0;
        switch (style) {
          case 'energetic': brightness = Math.sin((b + z * 0.8) * Math.PI) > 0 ? 1 : 0; break;
          case 'wave': brightness = Math.sin((b - z * 0.6) * Math.PI * 0.5) * 0.5 + 0.5; break;
          case 'strobe': brightness = b % 2 === 0 && z % 3 === 0 ? 1 : 0; break;
          case 'chase': brightness = z === b % zones ? 1 : 0; break;
        }
        const alpha = brightness * scale;
        if (alpha < 0.01) continue;
        const col = new THREE.Color(colors[z]);
        ctx.fillStyle = `rgba(${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)},${alpha})`;
        ctx.fillRect(b * beatW + 1, z * zoneH + 1, beatW - 2, zoneH - 2);
      }
    }

    // Beat markers
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let b = 0; b <= totalBeats; b++) {
      ctx.beginPath();
      ctx.moveTo(b * beatW, 0);
      ctx.lineTo(b * beatW, h);
      ctx.stroke();
    }
  }, [bpm, style, intensity]);

  return <canvas ref={canvasRef} width={800} height={80} style={{ width: '100%', height: 80, borderRadius: 6, background: 'var(--bg3)' }} />;
}

export default function BuilderPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--bg)' }} />}>
      <BuilderInner />
    </Suspense>
  );
}
