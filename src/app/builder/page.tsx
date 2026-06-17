'use client';
import { useEffect, useRef, useState, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import JSZip from 'jszip';
import { supabase, validateAudioFile, type TeslaModel, type ShowStyle } from '@/lib/supabase';
import TeslaScene from '@/components/TeslaScene';
import { MODELS, generateFrames, getChannelCount } from '@/lib/tesla-channels'
import { analyzeAudioToFrames } from '@/lib/audio-analysis';
import { validateFseq, type FseqValidation } from '@/lib/fseq';

// ─── Constants ────────────────────────────────────────────────────────────────
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

const PREVIEW_DURATION = 30;
const VISIBLE_BEATS = 16;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function hexToRgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

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
    if (e > threshold && i - lastBeat > minInterval) { beats.push(i); lastBeat = i; }
  });
  if (beats.length < 2) return 120;
  const intervals = beats.slice(1).map((b, i) => b - beats[i]);
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const fps = sampleRate / windowSize;
  return Math.round(60 / (avgInterval / fps));
}

function buildFseq(channels: number, frames: number, stepMs: number, frameData: Uint8Array[]): ArrayBuffer {
  const headerSize = 32;
  const buf = new ArrayBuffer(headerSize + frames * channels);
  const view = new DataView(buf);
  const u8 = new Uint8Array(buf);
  u8[0] = 0x50; u8[1] = 0x53; u8[2] = 0x45; u8[3] = 0x51;
  view.setUint16(4, headerSize, true); u8[6] = 0; u8[7] = 2;
  view.setUint16(8, headerSize, true);
  view.setUint32(10, channels, true);
  view.setUint32(14, frames, true);
  view.setUint16(18, stepMs, true);
  u8[20] = 0; u8[21] = 0; view.setUint16(22, 0, true);
  u8[24] = 1;
  for (let f = 0; f < frames; f++) u8.set(frameData[f] ?? new Uint8Array(channels), headerSize + f * channels);
  return buf;
}

// ─── Beat-edit helpers ────────────────────────────────────────────────────────
function getMirrorChannel(zoneId: string, zones: { id: string; channel: number }[]): number | null {
  let mirrorId: string | null = null;
  if (zoneId.startsWith('fl_'))      mirrorId = zoneId.replace('fl_', 'fr_');
  else if (zoneId.startsWith('fr_')) mirrorId = zoneId.replace('fr_', 'fl_');
  else if (zoneId.startsWith('rl_')) mirrorId = zoneId.replace('rl_', 'rr_');
  else if (zoneId.startsWith('rr_')) mirrorId = zoneId.replace('rr_', 'rl_');
  else if (zoneId === 'l_sill')      mirrorId = 'r_sill';
  else if (zoneId === 'r_sill')      mirrorId = 'l_sill';
  else if (zoneId === 'bed_l')       mirrorId = 'bed_r';
  else if (zoneId === 'bed_r')       mirrorId = 'bed_l';
  else if (zoneId.startsWith('falcon_l')) mirrorId = zoneId.replace('falcon_l', 'falcon_r');
  else if (zoneId.startsWith('falcon_r')) mirrorId = zoneId.replace('falcon_r', 'falcon_l');
  if (!mirrorId) return null;
  return zones.find(z => z.id === mirrorId)?.channel ?? null;
}

function customBlocksToFrames(
  blocks: Record<number, Set<number>>,
  beats: number,
  bpm: number,
  channelCount: number,
): Uint8Array[] {
  const FPS = 20;
  const fpb = (60 / bpm) * FPS;
  const totalFrames = Math.ceil(beats * fpb);
  const frames: Uint8Array[] = Array.from({ length: totalFrames }, () => new Uint8Array(channelCount));
  Object.entries(blocks).forEach(([chStr, beatSet]) => {
    const ch = Number(chStr);
    beatSet.forEach(beatIdx => {
      const start = Math.floor(beatIdx * fpb);
      const end = Math.min(totalFrames, Math.ceil((beatIdx + 1) * fpb));
      for (let f = start; f < end; f++) frames[f][ch] = 255;
    });
  });
  return frames;
}

// ─── Timeline component ───────────────────────────────────────────────────────
interface TimelineProps {
  model: TeslaModel;
  bpm: number;
  style: ShowStyle;
  intensity: number;
  playheadFraction: number | null;
  audioFrames?: Uint8Array[] | null;
  audioTriggers?: Set<number>;
  waveformData?: Float32Array | null;
  editMode?: boolean;
  symmetry?: boolean;
  customBlocks?: Record<number, Set<number>>;
  onToggleBeat?: (channel: number, beat: number) => void;
}

function Timeline({
  model, bpm, style, intensity, playheadFraction,
  audioFrames, audioTriggers, waveformData, editMode, symmetry, customBlocks, onToggleBeat,
}: TimelineProps) {
  const def = MODELS[model];
  const zones = def.zones;
  const LABEL_W = 112;
  const ROW_H = 22;
  const HEADER_H = 24;
  const BEATS = VISIBLE_BEATS;
  const FPS = 20;
  const fpb = (60 / bpm) * FPS;

  // ── Waveform SVG path ──────────────────────────────────────────────────────
  // Build a mirrored amplitude envelope SVG covering the visible beat window.
  const WF_FPS = 100; // waveformData is at 100fps (10ms windows)
  const VW = 1000, VH = 56, MID = VH / 2;
  const wfPath = (() => {
    if (!waveformData || waveformData.length === 0) return null;
    const visibleSecs = BEATS / bpm * 60;
    const visibleN = Math.min(Math.ceil(visibleSecs * WF_FPS), waveformData.length);
    const step = VW / Math.max(visibleN - 1, 1);
    // Top edge (left → right)
    const top = Array.from({ length: visibleN }, (_, i) =>
      `${(i * step).toFixed(1)},${(MID - waveformData[i] * MID * 0.88).toFixed(1)}`
    );
    // Bottom edge (right → left, mirrored)
    const bot = Array.from({ length: visibleN }, (_, i) => {
      const j = visibleN - 1 - i;
      return `${(j * step).toFixed(1)},${(MID + waveformData[j] * MID * 0.88).toFixed(1)}`;
    });
    return `M 0,${MID} L ${top.join(' L ')} L ${VW},${MID} L ${bot.join(' L ')} Z`;
  })();

  // Beat trigger positions as fractions of the visible window
  const triggerFracs = (() => {
    if (!audioTriggers || !waveformData) return [];
    const visibleFrames = BEATS * fpb;
    return [...audioTriggers]
      .filter(f => f < visibleFrames)
      .map(f => f / visibleFrames);
  })();

  // Frames to render in preview mode
  const hasCustom = customBlocks && Object.keys(customBlocks).length > 0;
  const displayFrames: Uint8Array[] = (() => {
    if (hasCustom) return customBlocksToFrames(customBlocks!, BEATS, bpm, def.channelCount);
    if (audioFrames) return audioFrames;
    return generateFrames(style, intensity, bpm, BEATS, def);
  })();

  return (
    <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11 }}>

      {/* ── Waveform row ──────────────────────────────────────────────────── */}
      {wfPath && (
        <div style={{ display: 'flex', height: VH, marginBottom: 8, alignItems: 'stretch' }}>
          {/* Label */}
          <div style={{ width: LABEL_W, flexShrink: 0, display: 'flex', alignItems: 'center', paddingRight: 8 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.06em', color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase' }}>Waveform</span>
          </div>
          {/* SVG waveform */}
          <div style={{ flex: 1, position: 'relative', borderRadius: 4, overflow: 'hidden', background: 'rgba(0,0,0,0.25)' }}>
            <svg
              viewBox={`0 0 ${VW} ${VH}`}
              preserveAspectRatio="none"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            >
              <defs>
                <linearGradient id="wfGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(0,200,110,0.18)" />
                  <stop offset="50%" stopColor="rgba(0,232,135,0.55)" />
                  <stop offset="100%" stopColor="rgba(0,200,110,0.18)" />
                </linearGradient>
              </defs>
              {/* Waveform fill */}
              <path d={wfPath} fill="url(#wfGrad)" />
              {/* Centre line */}
              <line x1="0" y1={MID} x2={VW} y2={MID} stroke="rgba(0,232,135,0.18)" strokeWidth="0.5" />
              {/* Measure grid lines */}
              {Array.from({ length: BEATS + 1 }, (_, b) => (
                <line key={b}
                  x1={(b / BEATS * VW).toFixed(1)} y1="0"
                  x2={(b / BEATS * VW).toFixed(1)} y2={VH}
                  stroke={b % 4 === 0 ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)'}
                  strokeWidth="0.8"
                />
              ))}
              {/* Beat trigger spikes (orange) */}
              {triggerFracs.map((frac, i) => (
                <line key={i}
                  x1={(frac * VW).toFixed(1)} y1="0"
                  x2={(frac * VW).toFixed(1)} y2={VH}
                  stroke="rgba(255,140,0,0.55)" strokeWidth="1.2"
                />
              ))}
              {/* Playhead */}
              {playheadFraction !== null && (
                <line
                  x1={(playheadFraction * VW).toFixed(1)} y1="0"
                  x2={(playheadFraction * VW).toFixed(1)} y2={VH}
                  stroke="rgba(255,255,255,0.9)" strokeWidth="1.5"
                />
              )}
            </svg>
            {/* Beat number labels inside waveform for edit mode */}
            {editMode && Array.from({ length: BEATS / 4 }, (_, m) => (
              <div key={m} style={{
                position: 'absolute', left: ((m * 4) / BEATS * 100) + '%',
                top: 3, paddingLeft: 4, fontSize: 9, color: 'rgba(255,255,255,0.35)', pointerEvents: 'none',
              }}>
                bar {m + 1}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Beat ruler */}
      <div style={{ display: 'flex', height: HEADER_H, alignItems: 'flex-end', marginBottom: 4 }}>
        <div style={{ width: LABEL_W, flexShrink: 0 }} />
        {editMode ? (
          // Edit mode: evenly-spaced beat numbers
          <div style={{ flex: 1, display: 'flex' }}>
            {Array.from({ length: BEATS }, (_, b) => (
              <div key={b} style={{ flex: 1, textAlign: 'center', fontSize: 8, color: b % 4 === 0 ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.18)', paddingBottom: 3, borderBottom: `1px solid ${b % 4 === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.05)'}` }}>
                {b + 1}
              </div>
            ))}
          </div>
        ) : (
          // Preview mode: time ruler
          <div style={{ flex: 1, position: 'relative', height: HEADER_H }}>
            {Array.from({ length: BEATS + 1 }, (_, b) => {
              const isMeasure = b % 4 === 0;
              const isAudioBeat = audioTriggers?.has(Math.floor(b * fpb));
              return (
                <div key={b} style={{
                  position: 'absolute',
                  left: (b / BEATS * 100) + '%',
                  top: 0, bottom: 0,
                  borderLeft: `1px solid ${isAudioBeat ? 'rgba(255,140,0,0.45)' : isMeasure ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.06)'}`,
                  paddingLeft: 3,
                  display: 'flex', alignItems: 'flex-end', paddingBottom: 3,
                }}>
                  {isMeasure && (
                    <span style={{ color: 'rgba(255,255,255,0.38)', fontSize: 9, whiteSpace: 'nowrap' }}>
                      {(b / bpm * 60).toFixed(1)}s
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Zone rows */}
      {zones.map(zone => {
        const [r, g, b] = hexToRgb(zone.color);
        const colorStr = `rgb(${r},${g},${b})`;
        const activeBeats = customBlocks?.[zone.channel] ?? new Set<number>();

        if (editMode) {
          return (
            <div key={zone.channel} style={{ display: 'flex', height: ROW_H, marginBottom: 2, alignItems: 'stretch' }}>
              <div style={{ width: LABEL_W, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, paddingRight: 8, overflow: 'hidden' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: colorStr, flexShrink: 0, boxShadow: `0 0 4px ${colorStr}` }} />
                <span style={{ color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10 }}>
                  {zone.label}
                </span>
              </div>
              <div style={{ flex: 1, display: 'flex', gap: 1 }}>
                {Array.from({ length: BEATS }, (_, beatIdx) => {
                  const isActive = activeBeats.has(beatIdx);
                  const isMeasure = beatIdx % 4 === 0;
                  return (
                    <div
                      key={beatIdx}
                      onClick={() => onToggleBeat?.(zone.channel, beatIdx)}
                      title={`${zone.label} · beat ${beatIdx + 1}`}
                      style={{
                        flex: 1, height: '100%', cursor: 'pointer', borderRadius: 2,
                        background: isActive ? `rgba(${r},${g},${b},0.88)` : isMeasure ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.03)',
                        borderLeft: isMeasure && beatIdx > 0 ? '1px solid rgba(255,255,255,0.10)' : 'none',
                        boxShadow: isActive ? `0 0 6px rgba(${r},${g},${b},0.5)` : 'none',
                        transition: 'background .08s',
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        }

        // Preview mode
        return (
          <div key={zone.channel} style={{ display: 'flex', height: ROW_H, marginBottom: 2, alignItems: 'stretch' }}>
            <div style={{ width: LABEL_W, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, paddingRight: 8, overflow: 'hidden' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: colorStr, flexShrink: 0, boxShadow: `0 0 4px ${colorStr}` }} />
              <span style={{ color: 'rgba(255,255,255,0.48)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10 }}>
                {zone.label}
              </span>
            </div>
            <div style={{ flex: 1, position: 'relative', background: 'rgba(255,255,255,0.025)', borderRadius: 3, overflow: 'hidden' }}>
              {displayFrames.map((frame, fi) => {
                const val = frame[zone.channel] / 255;
                if (val < 0.02) return null;
                return (
                  <div key={fi} style={{
                    position: 'absolute',
                    left: (fi / displayFrames.length * 100) + '%',
                    width: (100 / displayFrames.length) + '%',
                    top: 0, bottom: 0,
                    background: `rgba(${r},${g},${b},${val * 0.85})`,
                  }} />
                );
              })}
              {Array.from({ length: BEATS + 1 }, (_, b) => {
                const isAudioBeat = audioTriggers?.has(Math.floor(b * fpb));
                return (
                  <div key={b} style={{
                    position: 'absolute', left: (b / BEATS * 100) + '%',
                    top: 0, bottom: 0, width: 1, pointerEvents: 'none',
                    background: isAudioBeat ? 'rgba(255,140,0,0.28)' : b % 4 === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
                  }} />
                );
              })}
              {playheadFraction !== null && (
                <div style={{
                  position: 'absolute', left: (playheadFraction * 100) + '%',
                  top: -2, bottom: -2, width: 2,
                  background: 'rgba(255,255,255,0.90)',
                  boxShadow: '0 0 8px rgba(255,255,255,0.7)',
                  zIndex: 3, borderRadius: 1,
                }} />
              )}
            </div>
          </div>
        );
      })}

      <div style={{ display: 'flex', gap: 16, marginTop: 10, paddingLeft: LABEL_W, fontSize: 9, color: 'rgba(255,255,255,0.24)' }}>
        {editMode
          ? <span>Click beats to toggle · {BEATS} beats ({(BEATS / bpm * 60).toFixed(1)}s loop)</span>
          : <><span>|— 4 beats ——|</span><span>{bpm} BPM · {BEATS} beats</span></>
        }
        {audioFrames && !editMode && <span style={{ color: 'rgba(255,140,0,0.7)' }}>♪ audio-synced</span>}
        {hasCustom && <span style={{ color: 'rgba(0,232,135,0.7)' }}>✎ custom edits</span>}
      </div>
    </div>
  );
}

// ─── Builder inner ────────────────────────────────────────────────────────────
function BuilderInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('id');
  const remixToken = searchParams.get('remix');

  // ── Auth & show state ─────────────────────────────────────────────────────
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

  // ── Audio preview state ───────────────────────────────────────────────────
  const rawAudioRef = useRef<ArrayBuffer | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const previewRafRef = useRef<number>(0);
  const previewStartCtxTimeRef = useRef(0);
  const previewAudioOffsetRef = useRef(0);
  const bpmRef = useRef(bpm);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);

  const [previewing, setPreviewing] = useState(false);
  const [previewBeat, setPreviewBeat] = useState<number | null>(null);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [audioFrames, setAudioFrames] = useState<Uint8Array[] | null>(null);
  const [audioTriggers, setAudioTriggers] = useState<Set<number>>(new Set());
  const [waveformData, setWaveformData] = useState<Float32Array | null>(null);

  // ── Export validation state ───────────────────────────────────────────────
  const [fseqValidation, setFseqValidation] = useState<FseqValidation | null>(null);

  // ── Manual edit state ─────────────────────────────────────────────────────
  const [editMode, setEditMode] = useState(false);
  const [symmetry, setSymmetry] = useState(true);
  const [customBlocks, setCustomBlocks] = useState<Record<number, Set<number>>>({});

  // ── Auth check ────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/auth'); return; }
      setAuthed(true);
      setUserId(session.user.id);
      if (editId) loadShow(editId);
      else if (remixToken) loadRemix(remixToken);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) router.replace('/auth');
    });
    return () => subscription.unsubscribe();
  }, [router, editId, remixToken]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadShow(id: string) {
    const { data } = await supabase.from('shows').select('*').eq('id', id).single();
    if (!data) return;
    setName(data.name); setModel(data.tesla_model); setStyle(data.style);
    setIntensity(data.intensity);
    if (data.bpm) setBpm(data.bpm);
    setIsPublic(data.is_public); setShareToken(data.share_token);
    const { data: audio } = await supabase.from('audio_files').select('id').eq('show_id', id).limit(1);
    if (audio?.length) setAudioUploaded(true);
  }

  async function loadRemix(token: string) {
    const { data } = await supabase
      .from('shows')
      .select('name, tesla_model, style, intensity, bpm')
      .eq('share_token', token)
      .eq('is_public', true)
      .single();
    if (!data) return;
    setName(`${data.name} (remix)`);
    setModel(data.tesla_model as TeslaModel);
    setStyle(data.style as ShowStyle);
    setIntensity(data.intensity);
    if (data.bpm) setBpm(data.bpm);
    // Remix starts as a fresh unsaved show — no savedShowId or shareToken
  }

  // ── Beat toggle handler ───────────────────────────────────────────────────
  function onToggleBeat(channel: number, beatIdx: number) {
    const def = MODELS[model];
    const zone = def.zones.find(z => z.channel === channel);
    if (!zone) return;
    const mirrorCh = symmetry ? getMirrorChannel(zone.id, def.zones) : null;
    setCustomBlocks(prev => {
      const next = { ...prev };
      const beats = new Set(next[channel] ?? []);
      if (beats.has(beatIdx)) beats.delete(beatIdx); else beats.add(beatIdx);
      next[channel] = beats;
      if (mirrorCh !== null) {
        const mb = new Set(next[mirrorCh] ?? []);
        if (beats.has(beatIdx)) mb.add(beatIdx); else mb.delete(beatIdx);
        next[mirrorCh] = mb;
      }
      return next;
    });
  }

  // Frames fed to the 3D scene: custom blocks > audio > null (uses internal generateFrames)
  const hasCustom = Object.keys(customBlocks).length > 0;
  const sceneFrames: Uint8Array[] | null = hasCustom
    ? customBlocksToFrames(customBlocks, VISIBLE_BEATS, bpm, getChannelCount(model))
    : audioFrames;

  // ── Audio file selection ──────────────────────────────────────────────────
  function onAudioChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateAudioFile(file);
    if (err) { setAudioError(err); return; }
    setAudioError('');
    setAudioFile(file);
    setAudioUploaded(false);
    stopPreview();

    setAudioFrames(null);
    setAudioTriggers(new Set());
    setWaveformData(null);

    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const raw = ev.target?.result as ArrayBuffer;
        rawAudioRef.current = raw.slice(0);
        const ctx = new AudioContext();
        const ab = await ctx.decodeAudioData(raw.slice(0));
        const detected = detectBPM(ab);
        setBpm(Math.max(60, Math.min(200, detected)));
        await ctx.close();

        // Full frequency analysis for audio-driven light show
        setAnalyzing(true);
        try {
          const ctx2 = new AudioContext();
          const ab2 = await ctx2.decodeAudioData((rawAudioRef.current as ArrayBuffer).slice(0));
          await ctx2.close();
          const result = await analyzeAudioToFrames(ab2, MODELS[model]);
          setAudioFrames(result.frames);
          setAudioTriggers(result.triggerFrames);
          setWaveformData(result.waveformData);
          if (result.bpm > 60) setBpm(Math.max(60, Math.min(200, result.bpm)));
        } catch { /* fall back to generated frames */ }
        setAnalyzing(false);
      } catch { /* ignore */ }
    };
    reader.readAsArrayBuffer(file);
  }

  // ── Audio preview ─────────────────────────────────────────────────────────
  const stopPreview = useCallback(() => {
    if (audioSourceRef.current) {
      try { audioSourceRef.current.stop(); } catch { /* already stopped */ }
      audioSourceRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    cancelAnimationFrame(previewRafRef.current);
    setPreviewing(false);
    setPreviewBeat(null);
    setPreviewProgress(0);
  }, []);

  async function startPreview() {
    const raw = rawAudioRef.current;
    if (!raw) return;
    stopPreview();

    const ctx = new AudioContext();
    audioCtxRef.current = ctx;

    let ab: AudioBuffer;
    try {
      ab = await ctx.decodeAudioData(raw.slice(0));
    } catch { return; }

    // Start from 25% into song (more interesting) or beginning if short
    const startOffset = ab.duration > 60 ? Math.min(ab.duration * 0.25, 60) : 0;
    const source = ctx.createBufferSource();
    source.buffer = ab;
    source.connect(ctx.destination);
    source.start(0, startOffset);
    source.stop(ctx.currentTime + PREVIEW_DURATION);
    audioSourceRef.current = source;

    previewStartCtxTimeRef.current = ctx.currentTime;
    previewAudioOffsetRef.current = startOffset;

    setPreviewing(true);

    const tick = () => {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      const elapsed = ctx.currentTime - previewStartCtxTimeRef.current;
      if (elapsed >= PREVIEW_DURATION) { stopPreview(); return; }
      setPreviewProgress(elapsed / PREVIEW_DURATION);
      const beatPos = ((previewAudioOffsetRef.current + elapsed) / 60) * bpmRef.current;
      setPreviewBeat(beatPos);
      previewRafRef.current = requestAnimationFrame(tick);
    };
    previewRafRef.current = requestAnimationFrame(tick);

    source.onended = () => stopPreview();
  }

  // ── Save & upload ─────────────────────────────────────────────────────────
  async function uploadAudio(showId: string, file: File) {
    setUploading(true);
    const form = new FormData();
    form.append('file', file); form.append('show_id', showId);
    const res = await fetch('/api/upload', { method: 'POST', body: form });
    setUploading(false);
    if (res.ok) { setAudioUploaded(true); }
    else {
      const { error } = await res.json();
      setSaveMsg(`Audio upload failed: ${error}`);
      setTimeout(() => setSaveMsg(''), 4000);
    }
  }

  async function save() {
    setSaving(true); setSaveMsg('');
    const payload = { user_id: userId, name, tesla_model: model, style, intensity, bpm, is_public: isPublic, updated_at: new Date().toISOString() };
    let showId = savedShowId;
    let error;
    if (showId) {
      ({ error } = await supabase.from('shows').update(payload).eq('id', showId));
    } else {
      const { error: e, data } = await supabase.from('shows')
        .insert({ ...payload, is_public: false, share_token: crypto.randomUUID() })
        .select().single();
      error = e;
      if (data) {
        showId = data.id; setSavedShowId(data.id); setShareToken(data.share_token);
        router.replace(`/builder?id=${data.id}`);
      }
    }
    setSaving(false);
    if (error) { setSaveMsg(`Error: ${error.message}`); setTimeout(() => setSaveMsg(''), 4000); return; }
    setSaveMsg('Saved!'); setTimeout(() => setSaveMsg(''), 3000);
    if (audioFile && !audioUploaded && showId) await uploadAudio(showId, audioFile);
  }

  async function exportZip() {
    setExporting(true);
    if (savedShowId) {
      try {
        const res = await fetch('/api/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ show_id: savedShowId }) });
        if (res.ok) {
          const { url, filename } = await res.json();
          const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
          setExporting(false); return;
        }
      } catch { /* fall through */ }
    }
    const FPS = 20;
    const frames = 600;
    const channels = getChannelCount(model);
    const def = MODELS[model];
    let frameData: Uint8Array[];
    if (hasCustom) {
      // Repeat the custom loop pattern to fill 30 seconds
      const pattern = customBlocksToFrames(customBlocks, VISIBLE_BEATS, bpm, channels);
      frameData = Array.from({ length: frames }, (_, f) => pattern[f % pattern.length]);
    } else if (audioFrames) {
      frameData = audioFrames.slice(0, frames);
    } else {
      frameData = generateFrames(style, intensity, bpm, frames, def);
    }
    const fseq = buildFseq(channels, frames, Math.round(1000 / FPS), frameData);

    // Validate FSEQ before packaging
    const validation = validateFseq(fseq, channels, audioFile?.type);
    setFseqValidation(validation);

    const zip = new JSZip();
    const folder = zip.folder('LightShow')!;
    folder.file('lightshow.fseq', fseq);
    // Only include audio if it's WAV — Tesla ignores non-WAV audio
    if (audioFile) {
      const isWav = audioFile.type === 'audio/wav' || audioFile.type === 'audio/x-wav';
      folder.file('lightshow.wav', await audioFile.arrayBuffer(), { comment: isWav ? '' : 'WARNING: convert to WAV for Tesla audio playback' });
    }
    folder.file('show_config.json', JSON.stringify({ name, tesla_model: model, style, intensity, bpm }, null, 2));
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `${name.replace(/\s+/g, '_')}_lightshow.zip`; a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  }

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => () => stopPreview(), [stopPreview]);

  if (!authed) return <div style={{ minHeight: '100vh', background: 'var(--bg)' }} />;

  const canPreview = !!rawAudioRef.current || !!audioFile;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Nav */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 2rem', borderBottom: '1px solid var(--border)', background: 'rgba(10,10,15,0.9)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 10 }}>
        <div className="builder-nav-title">
          <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 13, whiteSpace: 'nowrap' }}>← Dashboard</Link>
          <div style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0 }} />
          <input value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {uploading && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Uploading audio…</span>}
          {saveMsg && <span style={{ fontSize: 12, color: saveMsg.startsWith('Error') || saveMsg.startsWith('Audio') ? '#ff8a8a' : 'var(--green)' }}>{saveMsg}</span>}
          <button onClick={save} disabled={saving || uploading} className="btn btn-ghost btn-sm">{saving ? 'Saving…' : 'Save'}</button>
          <button onClick={exportZip} disabled={exporting || saving} className="btn btn-primary btn-sm">{exporting ? 'Exporting…' : '⬇ Export ZIP'}</button>
        </div>
      </nav>

      <div className="builder-grid">
        {/* ── Left panel ─────────────────────────────────────────────────── */}
        <aside className="builder-sidebar" style={{ borderRight: '1px solid var(--border)', padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Audio */}
          <div>
            <div className="label">Audio file</div>
            <label
              style={{ display: 'block', border: `1px dashed ${audioFile ? 'rgba(0,232,135,0.35)' : 'var(--border)'}`, borderRadius: 'var(--radius)', padding: '1rem', textAlign: 'center', cursor: 'pointer', transition: 'border-color .15s', background: audioFile ? 'rgba(0,232,135,0.04)' : 'transparent' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--red)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = audioFile ? 'rgba(0,232,135,0.35)' : 'var(--border)')}>
              <input type="file" accept="audio/mpeg,audio/mp3,audio/wav" onChange={onAudioChange} style={{ display: 'none' }} />
              <div style={{ fontSize: '1.4rem', marginBottom: 4 }}>🎵</div>
              <div style={{ fontSize: 12, color: audioUploaded ? 'var(--green)' : audioFile ? '#ff8c00' : 'var(--muted)' }}>
                {audioUploaded ? `✓ ${audioFile?.name ?? 'Audio saved'}` : audioFile ? audioFile.name : 'Click to upload MP3 or WAV'}
              </div>
              {!audioFile && <div style={{ fontSize: 11, color: 'var(--muted2)', marginTop: 2 }}>Max 50MB · MP3 or WAV</div>}
            </label>
            {audioError && <div style={{ fontSize: 11, color: '#ff8a8a', marginTop: 4 }}>{audioError}</div>}
            {analyzing && (
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--red)', display: 'inline-block', animation: 'pulse 1s infinite' }} />
                Analyzing audio for light show…
              </div>
            )}
            {!analyzing && audioFrames && (
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--green)' }}>
                ✓ Audio analyzed · {audioFrames.length} frames generated
              </div>
            )}

            {/* Preview button */}
            {audioFile && (
              <button
                onClick={previewing ? stopPreview : startPreview}
                style={{
                  marginTop: 8, width: '100%', padding: '8px 0', borderRadius: 'var(--radius)',
                  border: `1px solid ${previewing ? 'rgba(255,80,80,0.5)' : 'rgba(0,232,135,0.35)'}`,
                  background: previewing ? 'rgba(255,80,80,0.08)' : 'rgba(0,232,135,0.08)',
                  color: previewing ? '#ff8a8a' : 'var(--green)', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all .15s',
                }}
              >
                {previewing ? (
                  <>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect width="3" height="10" rx="1"/><rect x="6" width="3" height="10" rx="1"/></svg>
                    Stop Preview
                  </>
                ) : (
                  <>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M2 1l7 4-7 4V1z"/></svg>
                    Preview 30s
                  </>
                )}
              </button>
            )}

            {/* Preview progress bar */}
            {previewing && (
              <div style={{ marginTop: 6, height: 3, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: (previewProgress * 100) + '%', background: 'var(--green)', borderRadius: 2, transition: 'width .1s linear' }} />
              </div>
            )}
            {previewing && (
              <div style={{ marginTop: 4, fontSize: 10, color: 'var(--muted)', textAlign: 'center' }}>
                {Math.round(previewProgress * PREVIEW_DURATION)}s / {PREVIEW_DURATION}s · lights synced to audio
              </div>
            )}
          </div>

          {/* Tesla model */}
          <div>
            <div className="label">Tesla model</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {TESLA_MODELS.map(m => (
                <button key={m.value} onClick={() => { setModel(m.value); setAudioFrames(null); setAudioTriggers(new Set()); setWaveformData(null); setCustomBlocks({}); }}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="label" style={{ margin: 0 }}>BPM</div>
              <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 700 }}>{bpm}</span>
            </div>
            <input type="range" min={60} max={200} value={bpm} onChange={e => setBpm(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--red)', marginTop: 6 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted2)', marginTop: 2 }}>
              <span>60</span><span>200</span>
            </div>
          </div>

          {/* Intensity */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="label" style={{ margin: 0 }}>Intensity</div>
              <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 700 }}>{intensity}%</span>
            </div>
            <input type="range" min={10} max={100} value={intensity} onChange={e => setIntensity(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--red)', marginTop: 6 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted2)', marginTop: 2 }}>
              <span>10%</span><span>100%</span>
            </div>
          </div>

          {/* Share */}
          {savedShowId && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
              <div className="label" style={{ marginBottom: '.5rem' }}>Share</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.5rem' }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{isPublic ? 'Anyone with link can view' : 'Only you can see this'}</span>
                <button onClick={() => setIsPublic(p => !p)} style={{ width: 36, height: 20, borderRadius: 10, background: isPublic ? 'var(--green)' : 'var(--bg4)', border: '1px solid var(--border2)', cursor: 'pointer', position: 'relative', transition: 'background .2s', flexShrink: 0 }}>
                  <span style={{ position: 'absolute', top: 2, left: isPublic ? 18 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
                </button>
              </div>
              {isPublic && shareToken && (
                <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/show/${shareToken}`); setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000); }} className="btn btn-ghost btn-sm btn-full" style={{ fontSize: 12 }}>
                  {copiedLink ? '✓ Link copied!' : '🔗 Copy share link'}
                </button>
              )}
              {isPublic && <p style={{ fontSize: 11, color: 'var(--muted2)', marginTop: '.4rem' }}>Save to publish changes.</p>}
            </div>
          )}
        </aside>

        {/* ── Main area ──────────────────────────────────────────────────── */}
        <main className="builder-main" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
          {/* 3D Scene */}
          <div style={{ position: 'relative' }}>
            <div className="builder-scene-h" style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: `1px solid ${previewing ? 'rgba(0,232,135,0.25)' : 'var(--border)'}`, transition: 'border-color .3s' }}>
              <TeslaScene
                teslaModel={model}
                style={style}
                intensity={intensity}
                bpm={bpm}
                previewBeat={previewBeat}
                customFrames={sceneFrames}
                audioTriggerFrames={audioTriggers}
              />
            </div>

            {/* Preview indicator overlay */}
            {previewing && (
              <div style={{ position: 'absolute', top: 14, left: 14, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', borderRadius: 20, padding: '5px 12px', border: '1px solid rgba(0,232,135,0.3)' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', animation: 'pulse 1s infinite' }} />
                <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>LIVE PREVIEW — {audioFile?.name?.slice(0, 24) ?? 'audio'}</span>
              </div>
            )}
          </div>

          {/* Stats bar */}
          <div className="builder-stats" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
            {[
              { label: 'Model', value: TESLA_MODELS.find(m => m.value === model)?.label },
              { label: 'Style', value: STYLES.find(s => s.value === style)?.label },
              { label: 'BPM', value: bpm },
              { label: 'Intensity', value: `${intensity}%` },
              { label: 'Channels', value: getChannelCount(model) },
              { label: 'Audio', value: audioFile ? (audioFile.name.length > 18 ? audioFile.name.slice(0, 18) + '…' : audioFile.name) : 'None' },
            ].map(item => (
              <div key={item.label} style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3 }}>{item.label}</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* Timeline */}
          <div style={{ padding: '1.25rem 1.5rem', background: 'var(--bg2)', border: `1px solid ${previewing ? 'rgba(0,232,135,0.15)' : editMode ? 'rgba(255,140,0,0.2)' : 'var(--border)'}`, borderRadius: 'var(--radius-lg)', transition: 'border-color .3s' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13 }}>Light Channel Timeline</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {previewing && <span style={{ fontSize: 10, color: 'var(--green)' }}>● synced to audio</span>}
                {audioFrames && !editMode && <span style={{ fontSize: 10, color: 'rgba(255,140,0,0.8)' }}>♪ audio-driven</span>}

                {/* Symmetry toggle — only shown in edit mode */}
                {editMode && (
                  <button
                    onClick={() => setSymmetry(s => !s)}
                    style={{
                      padding: '4px 10px', borderRadius: 12, fontSize: 10, fontWeight: 600,
                      background: symmetry ? 'rgba(0,232,135,0.12)' : 'rgba(255,255,255,0.06)',
                      border: `1px solid ${symmetry ? 'rgba(0,232,135,0.35)' : 'rgba(255,255,255,0.14)'}`,
                      color: symmetry ? 'var(--green)' : 'var(--muted)', cursor: 'pointer',
                    }}>
                    ⇔ Symmetry {symmetry ? 'On' : 'Off'}
                  </button>
                )}

                {/* Clear edits button */}
                {hasCustom && (
                  <button
                    onClick={() => setCustomBlocks({})}
                    style={{
                      padding: '4px 10px', borderRadius: 12, fontSize: 10, fontWeight: 600,
                      background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.25)',
                      color: '#ff8a8a', cursor: 'pointer',
                    }}>
                    ✕ Clear
                  </button>
                )}

                {/* Edit / Preview mode toggle */}
                <button
                  onClick={() => setEditMode(e => !e)}
                  style={{
                    padding: '4px 12px', borderRadius: 12, fontSize: 10, fontWeight: 600,
                    background: editMode ? 'rgba(255,140,0,0.14)' : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${editMode ? 'rgba(255,140,0,0.4)' : 'rgba(255,255,255,0.14)'}`,
                    color: editMode ? '#ff8c00' : 'var(--muted)', cursor: 'pointer',
                  }}>
                  {editMode ? '✎ Editing' : '✎ Edit'}
                </button>

                <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                  {MODELS[model].zones.length} channels
                </span>
              </div>
            </div>
            <Timeline
              model={model}
              bpm={bpm}
              style={style}
              intensity={intensity}
              playheadFraction={previewing && !editMode ? previewProgress : null}
              audioFrames={audioFrames}
              audioTriggers={audioTriggers}
              editMode={editMode}
              symmetry={symmetry}
              customBlocks={customBlocks}
              onToggleBeat={onToggleBeat}
            />
          </div>

          {/* FSEQ Validation panel — shown after export */}
          {fseqValidation && (
            <div style={{ padding: '1rem', background: fseqValidation.ok ? 'rgba(0,232,135,0.05)' : 'rgba(232,64,74,0.05)', border: `1px solid ${fseqValidation.ok ? 'rgba(0,232,135,0.2)' : 'rgba(232,64,74,0.3)'}`, borderRadius: 'var(--radius-lg)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontWeight: 600, fontSize: 13, color: fseqValidation.ok ? 'var(--green)' : '#ff8a8a' }}>
                {fseqValidation.ok ? '✓ FSEQ valid — ready for Tesla' : '⚠ FSEQ issues found'}
                <button onClick={() => setFseqValidation(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
              </div>
              {fseqValidation.errors.map((e, i) => (
                <div key={i} style={{ fontSize: 11, color: '#ff8a8a', marginBottom: 3 }}>✗ {e}</div>
              ))}
              {fseqValidation.warnings.map((w, i) => (
                <div key={i} style={{ fontSize: 11, color: '#ff8c00', marginBottom: 3 }}>⚠ {w}</div>
              ))}
              <div style={{ display: 'flex', gap: 12, marginTop: fseqValidation.warnings.length || fseqValidation.errors.length ? 8 : 0, flexWrap: 'wrap' }}>
                {fseqValidation.info.map((inf, i) => (
                  <span key={i} style={{ fontSize: 10, color: 'var(--muted)', background: 'var(--bg3)', padding: '2px 8px', borderRadius: 12 }}>{inf}</span>
                ))}
              </div>
            </div>
          )}

          {/* Export instructions */}
          <div style={{ padding: '1rem', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', fontSize: 13, color: 'var(--muted)' }}>
            <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '.5rem' }}>How to use on your Tesla</div>
            <ol style={{ paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
              <li>Click <strong style={{ color: 'var(--text)' }}>Export ZIP</strong> to download the LightShow package.</li>
              <li>Copy the <code style={{ background: 'var(--bg3)', padding: '1px 4px', borderRadius: 3 }}>LightShow/</code> folder to the root of a USB drive (exFAT).</li>
              <li>Plug the USB into your Tesla's front USB port.</li>
              <li>Tap <strong style={{ color: 'var(--text)' }}>Entertainment → Light Show</strong> on the touchscreen.</li>
            </ol>
          </div>
        </main>
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  );
}

export default function BuilderPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--bg)' }} />}>
      <BuilderInner />
    </Suspense>
  );
}
