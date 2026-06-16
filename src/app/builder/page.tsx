'use client';
import { useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import * as THREE from 'three';
import JSZip from 'jszip';
import { supabase, validateAudioFile, type TeslaModel, type ShowStyle } from '@/lib/supabase';
import TeslaScene from '@/components/TeslaScene';
import { generateFrames, getChannelCount } from '@/lib/tesla-channels';

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
  u8[0] = 0x50; u8[1] = 0x53; u8[2] = 0x45; u8[3] = 0x51;
  view.setUint16(4, headerSize, true);
  u8[6] = 0; u8[7] = 2;
  view.setUint16(8, headerSize, true);
  view.setUint32(10, channels, true);
  view.setUint32(14, frames, true);
  view.setUint16(18, stepMs, true);
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

function BuilderInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('id');

  const [authed, setAuthed] = useState(false);
  const [userId, setUserId] = useState('');
  const [savedShowId, setSavedShowId] = useState<string | null>(editId);
  const [name, setName] = useState('My Light Show');
  const [model, setModel] = useState<TeslaModel>('model3');
  const [style, setStyle] = useState<ShowStyle>('energetic');
  const [intensity, setIntensity] = useState(80);
  const [bpm, setBpm] = useState(120);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioError, setAudioError] = useState('');
  const [audioUploaded, setAudioUploaded] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
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
    setIsPublic(data.is_public);
    setShareToken(data.share_token);
    // Check if audio already uploaded for this show
    const { data: audio } = await supabase
      .from('audio_files').select('id').eq('show_id', id).limit(1);
    if (audio?.length) setAudioUploaded(true);
  }

  function onAudioChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateAudioFile(file);
    if (err) { setAudioError(err); return; }
    setAudioError('');
    setAudioFile(file);
    setAudioUploaded(false);

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

  async function uploadAudio(showId: string, file: File) {
    setUploading(true);
    const form = new FormData();
    form.append('file', file);
    form.append('show_id', showId);
    const res = await fetch('/api/upload', { method: 'POST', body: form });
    setUploading(false);
    if (res.ok) {
      setAudioUploaded(true);
    } else {
      const { error } = await res.json();
      setSaveMsg(`Audio upload failed: ${error}`);
      setTimeout(() => setSaveMsg(''), 4000);
    }
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
      is_public: isPublic,
      updated_at: new Date().toISOString(),
    };
    let showId = savedShowId;
    let error;
    if (showId) {
      ({ error } = await supabase.from('shows').update(payload).eq('id', showId));
    } else {
      const { error: e, data } = await supabase
        .from('shows')
        .insert({ ...payload, is_public: false, share_token: crypto.randomUUID() })
        .select().single();
      error = e;
      if (data) {
        showId = data.id;
        setSavedShowId(data.id);
        setShareToken(data.share_token);
        router.replace(`/builder?id=${data.id}`);
      }
    }
    setSaving(false);
    if (error) {
      setSaveMsg(`Error: ${error.message}`);
      setTimeout(() => setSaveMsg(''), 4000);
      return;
    }
    setSaveMsg('Saved!');
    setTimeout(() => setSaveMsg(''), 3000);
    // Auto-upload audio if a new file was selected and not yet uploaded
    if (audioFile && !audioUploaded && showId) {
      await uploadAudio(showId, audioFile);
    }
  }

  async function exportZip() {
    setExporting(true);
    // Prefer server-side export when the show has been saved (includes stored audio)
    if (savedShowId) {
      try {
        const res = await fetch('/api/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ show_id: savedShowId }),
        });
        if (res.ok) {
          const { url, filename } = await res.json();
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          a.click();
          setExporting(false);
          return;
        }
      } catch { /* fall through to client-side export */ }
    }

    // Client-side fallback (unsaved show or API error)
    const FPS = 20;
    const frames = 600;
    const channels = getChannelCount(model);
    const { MODELS } = await import('@/lib/tesla-channels');
    const frameData = generateFrames(style, intensity, bpm, frames, MODELS[model]);
    const fseq = buildFseq(channels, frames, Math.round(1000 / FPS), frameData);
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {uploading && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Uploading audio…</span>}
          {saveMsg && <span style={{ fontSize: 12, color: saveMsg.startsWith('Error') || saveMsg.startsWith('Audio') ? '#ff8a8a' : 'var(--green)' }}>{saveMsg}</span>}
          <button onClick={save} disabled={saving || uploading} className="btn btn-ghost btn-sm">{saving ? 'Saving…' : 'Save'}</button>
          <button onClick={exportZip} disabled={exporting || saving} className="btn btn-primary btn-sm">{exporting ? 'Exporting…' : '⬇ Export ZIP'}</button>
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
              <div style={{ fontSize: 12, color: audioUploaded ? 'var(--green)' : audioFile ? '#ff8c00' : 'var(--muted)' }}>
                {audioUploaded ? `✓ ${audioFile?.name ?? 'Audio saved'}` : audioFile ? `${audioFile.name} (save to upload)` : 'Click to upload MP3 or WAV'}
              </div>
              {!audioFile && <div style={{ fontSize: 11, color: 'var(--muted2)', marginTop: 2 }}>Max 50MB · uploaded to your account</div>}
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

          {/* Share */}
          {savedShowId && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
              <div className="label" style={{ marginBottom: '.5rem' }}>Share</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.5rem' }}>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>{isPublic ? 'Anyone with the link can view' : 'Only you can see this'}</span>
                <button
                  onClick={() => setIsPublic(p => !p)}
                  style={{ width: 36, height: 20, borderRadius: 10, background: isPublic ? 'var(--green)' : 'var(--bg4)', border: '1px solid var(--border2)', cursor: 'pointer', position: 'relative', transition: 'background .2s', flexShrink: 0 }}
                >
                  <span style={{ position: 'absolute', top: 2, left: isPublic ? 18 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
                </button>
              </div>
              {isPublic && shareToken && (
                <button
                  onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/show/${shareToken}`); setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000); }}
                  className="btn btn-ghost btn-sm btn-full"
                  style={{ fontSize: 12 }}
                >
                  {copiedLink ? '✓ Link copied!' : '🔗 Copy share link'}
                </button>
              )}
              {isPublic && <p style={{ fontSize: 11, color: 'var(--muted2)', marginTop: '.4rem' }}>Save to publish your changes.</p>}
            </div>
          )}
        </aside>

        {/* Main area */}
        <main style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
          <div style={{ height: 420, borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--border)' }}>
            <TeslaScene teslaModel={model} style={style} intensity={intensity} bpm={bpm} />
          </div>

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
