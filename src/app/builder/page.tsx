'use client';
import { useEffect, useRef, useState, Suspense, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import JSZip from 'jszip';
import { supabase, validateAudioFile, type TeslaModel, type ShowStyle } from '@/lib/supabase';
import TeslaScene from '@/components/TeslaScene';
import { MODELS, generateFrames, getChannelCount, buildTimelineRows, CLOSURE_CMD, CLOSURE_LIMITS, type TimelineRow, type ClosureCommand, type ClosureFamily } from '@/lib/tesla-channels'

// Closure command UI metadata
const CMD_CYCLE: ClosureCommand[] = ['open', 'close', 'dance', 'stop'];
const CMD_STYLE: Record<ClosureCommand, { letter: string; fg: string; bg: string }> = {
  idle:  { letter: '',  fg: 'transparent', bg: 'transparent' },
  open:  { letter: 'O', fg: '#00e887', bg: 'rgba(0,232,135,0.22)' },
  close: { letter: 'C', fg: '#4a90e8', bg: 'rgba(74,144,232,0.22)' },
  dance: { letter: 'D', fg: '#ff4aa0', bg: 'rgba(255,74,160,0.22)' },
  stop:  { letter: 'S', fg: '#e8404a', bg: 'rgba(232,64,74,0.22)' },
};
// Reverse of CLOSURE_CMD: a closure byte in the frame data → its command name, so
// the timeline can surface AUTO-choreographed closures, not just hand-placed ones.
const BYTE_TO_CMD: Record<number, ClosureCommand> = Object.fromEntries(
  Object.entries(CLOSURE_CMD).filter(([k]) => k !== 'idle').map(([k, v]) => [v, k as ClosureCommand])
) as Record<number, ClosureCommand>;
const DANCE_SUPPORTED: Set<ClosureFamily> = new Set(['liftgate', 'charge_port', 'windows', 'falcon_doors']);

type ClosureBlocks = Record<number, Record<number, ClosureCommand>>;
import { analyzeAudioToFrames } from '@/lib/audio-analysis';
import { validateFseq, type FseqValidation } from '@/lib/fseq';
import { parseId3, titleFromFilename } from '@/lib/id3';
import { audioBufferToWav, resampleTo44100 } from '@/lib/wav';

// ─── Constants ────────────────────────────────────────────────────────────────
const TESLA_MODELS: { value: TeslaModel; label: string }[] = [
  { value: 'model3', label: 'Model 3' },
  { value: 'modelY', label: 'Model Y' },
  { value: 'modelS', label: 'Model S' },
  { value: 'modelX', label: 'Model X' },
  { value: 'cybertruck', label: 'Cybertruck' },
];

// The audio engine drives the show now — the legacy per-show "style" is kept only
// as a defaulted DB field (for the non-audio LightStrip preview); no UI for it.

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
// Mirror a channel to its left/right counterpart by geometry (same X, opposite Z).
function getMirrorChannel(zoneId: string, zones: { id: string; channel: number; position: [number, number, number] }[]): number | null {
  const src = zones.find(z => z.id === zoneId);
  if (!src) return null;
  const [sx, , sz] = src.position;
  if (Math.abs(sz) < 0.05) return null; // centre element — no mirror
  const m = zones.find(z => z.id !== zoneId && Math.abs(z.position[0] - sx) < 0.06 && Math.abs(z.position[2] + sz) < 0.10);
  return m?.channel ?? null;
}

function customBlocksToFrames(
  blocks: Record<number, Set<number>>,
  beats: number,
  bpm: number,
  channelCount: number,
  closureBlocks?: ClosureBlocks,
): Uint8Array[] {
  const FPS = 50;
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
  // Overlay closure command bytes (Open/Close/Dance/Stop) on their channels
  if (closureBlocks) {
    Object.entries(closureBlocks).forEach(([chStr, lane]) => {
      const ch = Number(chStr);
      Object.entries(lane).forEach(([beatStr, cmd]) => {
        const beatIdx = Number(beatStr);
        const start = Math.floor(beatIdx * fpb);
        const end = Math.min(totalFrames, Math.ceil((beatIdx + 1) * fpb));
        const val = CLOSURE_CMD[cmd];
        for (let f = start; f < end; f++) frames[f][ch] = val;
      });
    });
  }
  return frames;
}

// Per-closure actuation-limit + dance-support validation (item 4)
function validateClosures(
  closureBlocks: ClosureBlocks,
  zones: { channel: number; label: string; closure?: ClosureFamily }[],
): string[] {
  const warnings: string[] = [];
  Object.entries(closureBlocks).forEach(([chStr, lane]) => {
    const ch = Number(chStr);
    const zone = zones.find(z => z.channel === ch);
    if (!zone?.closure) return;
    const cmds = Object.values(lane);
    // EVERY command counts toward Tesla's per-closure limit — Open, Close, Dance, AND Stop.
    const actuations = cmds.filter(c => c !== 'idle').length;
    const limit = CLOSURE_LIMITS[zone.closure];
    if (actuations > limit) warnings.push(`${zone.label}: ${actuations} commands exceed Tesla's limit of ${limit} per show.`);
    if (cmds.includes('dance') && !DANCE_SUPPORTED.has(zone.closure)) {
      warnings.push(`${zone.label} can't Dance — use Open/Close instead.`);
    }
  });
  return warnings;
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
  closureBlocks?: ClosureBlocks;
  onClosureCommand?: (channel: number, beat: number) => void;
  beats?: number;   // total beats to render — spans the WHOLE song when audio is loaded
  revealClosures?: boolean;   // auto-expand the Closures group (e.g. when auto-choreograph is on)
}

function Timeline({
  model, bpm, style, intensity, playheadFraction,
  audioFrames, audioTriggers, waveformData, editMode, symmetry, customBlocks, onToggleBeat,
  closureBlocks, onClosureCommand, beats, revealClosures,
}: TimelineProps) {
  const def = MODELS[model];
  const zones = def.zones;

  // ── Mobile-aware sizing ────────────────────────────────────────────────────
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const LABEL_W  = isMobile ? 92  : 150;
  const ROW_H    = isMobile ? 40  : 22;
  const GROUP_H  = isMobile ? 32  : 26;
  const HEADER_H = isMobile ? 28  : 24;
  // Span the whole song when audio is loaded (caller passes the song's beat count).
  const BEATS = beats && beats > 0 ? beats : VISIBLE_BEATS;
  // A full-song timeline lays out at a fixed cell width so it's wide + scrolls
  // horizontally; the short no-audio default still flexes to fill the panel.
  const fullSong = BEATS > VISIBLE_BEATS;
  const CELL_W   = isMobile ? 38 : (fullSong ? 26 : null); // null → flex:1 on desktop
  const FPS = 50;
  const fpb = (60 / bpm) * FPS;

  // ── Collapsible channel tree (xLights-style: Group → Side → channel) ───────
  const allRows: TimelineRow[] = useMemo(() => buildTimelineRows(def), [def]);
  const rowById = useMemo(() => new Map(allRows.map(r => [r.id, r])), [allRows]);
  // All top-level groups start collapsed — EXCEPT Closures when auto-choreograph is
  // on, so the user immediately sees the closure commands we placed for them.
  const initialCollapsed = (d: typeof def) =>
    new Set(buildTimelineRows(d).filter(r => r.depth === 0 && !(revealClosures && r.id === 'grp:Closures')).map(r => r.id));
  const [collapsed, setCollapsed] = useState<Set<string>>(() => initialCollapsed(def));
  // When the model changes, collapse its groups afresh (respecting reveal).
  useEffect(() => {
    setCollapsed(initialCollapsed(def));
  }, [def]); // eslint-disable-line react-hooks/exhaustive-deps
  // When auto-choreograph turns on, reveal the Closures group so they're visible.
  useEffect(() => {
    if (revealClosures) setCollapsed(prev => { const n = new Set(prev); n.delete('grp:Closures'); return n; });
  }, [revealClosures]);

  function toggleRow(id: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function isVisible(r: TimelineRow): boolean {
    let p = r.parentId;
    while (p) {
      if (collapsed.has(p)) return false;
      p = rowById.get(p)?.parentId ?? null;
    }
    return true;
  }
  const rows = allRows.filter(isVisible);

  // ── Drag-to-paint ──────────────────────────────────────────────────────────
  const dragging = useRef<{ erasing: boolean; lastBeat: number } | null>(null);

  function getBeatAtClientX(rowEl: HTMLDivElement, clientX: number) {
    const rect = rowEl.getBoundingClientRect();
    const totalW = CELL_W ? BEATS * CELL_W : rect.width;
    const frac = (clientX - rect.left) / totalW;
    return Math.max(0, Math.min(BEATS - 1, Math.floor(frac * BEATS)));
  }

  function handleRowPointerDown(ch: number, e: React.PointerEvent<HTMLDivElement>) {
    if (!editMode || !onToggleBeat) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const beat = getBeatAtClientX(e.currentTarget, e.clientX);
    const isActive = !!(customBlocks?.[ch]?.has(beat));
    dragging.current = { erasing: isActive, lastBeat: beat };
    onToggleBeat(ch, beat);
    e.preventDefault();
  }

  function handleRowPointerMove(ch: number, e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current || !editMode || !onToggleBeat) return;
    const beat = getBeatAtClientX(e.currentTarget, e.clientX);
    if (beat === dragging.current.lastBeat) return;
    dragging.current.lastBeat = beat;
    const isActive = !!(customBlocks?.[ch]?.has(beat));
    if (dragging.current.erasing && isActive) onToggleBeat(ch, beat);
    else if (!dragging.current.erasing && !isActive) onToggleBeat(ch, beat);
  }

  function handleRowPointerUp() { dragging.current = null; }

  // ── Waveform SVG path ──────────────────────────────────────────────────────
  const WF_FPS = 100;
  const VW = 1000, VH = 56, MID = VH / 2;
  const wfPath = (() => {
    if (!waveformData || waveformData.length === 0) return null;
    const visibleSecs = BEATS / bpm * 60;
    const visibleN = Math.min(Math.ceil(visibleSecs * WF_FPS), waveformData.length);
    const step = VW / Math.max(visibleN - 1, 1);
    const top = Array.from({ length: visibleN }, (_, i) =>
      `${(i * step).toFixed(1)},${(MID - waveformData[i] * MID * 0.88).toFixed(1)}`
    );
    const bot = Array.from({ length: visibleN }, (_, i) => {
      const j = visibleN - 1 - i;
      return `${(j * step).toFixed(1)},${(MID + waveformData[j] * MID * 0.88).toFixed(1)}`;
    });
    return `M 0,${MID} L ${top.join(' L ')} L ${VW},${MID} L ${bot.join(' L ')} Z`;
  })();

  const triggerFracs = (() => {
    if (!audioTriggers || !waveformData) return [];
    const visibleFrames = BEATS * fpb;
    return [...audioTriggers].filter(f => f < visibleFrames).map(f => f / visibleFrames);
  })();

  // ── Display frames ─────────────────────────────────────────────────────────
  const hasCustom = (customBlocks && Object.keys(customBlocks).length > 0)
    || (closureBlocks && Object.keys(closureBlocks).length > 0);
  const displayFrames: Uint8Array[] = (() => {
    if (hasCustom) return customBlocksToFrames(customBlocks ?? {}, BEATS, bpm, def.channelCount, closureBlocks);
    if (audioFrames) return audioFrames;
    return generateFrames(style, intensity, bpm, BEATS, def);
  })();

  // Shared content width for scrollable column on mobile
  const contentW = CELL_W ? BEATS * CELL_W : undefined;

  return (
    <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11 }}>
      {/*
        Split layout: fixed label column (never scrolls) +
        scrollable content column (scrolls horizontally on mobile).
        Labels always visible; beat cells overflow horizontally on narrow screens.
      */}
      <div style={{ display: 'flex', alignItems: 'stretch' }}>

        {/* ── Fixed label column ─────────────────────────────────────────── */}
        <div style={{ width: LABEL_W, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
          {wfPath && <div style={{ height: VH + 8, display: 'flex', alignItems: 'center', paddingRight: 8 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.06em', color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase' }}>
              {isMobile ? 'Wave' : 'Waveform'}
            </span>
          </div>}
          <div style={{ height: HEADER_H + 4, flexShrink: 0 }} />
          {rows.map(row => {
            // ── Group / subgroup header (collapsible) ──
            if (row.kind === 'group' || row.kind === 'subgroup') {
              const isCollapsed = collapsed.has(row.id);
              const isGroup = row.kind === 'group';
              return (
                <div
                  key={row.id}
                  onClick={() => toggleRow(row.id)}
                  style={{
                    height: GROUP_H, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4,
                    paddingLeft: row.depth * 10, paddingRight: 8, cursor: 'pointer', userSelect: 'none', overflow: 'hidden',
                    borderBottom: isGroup ? '1px solid rgba(255,255,255,0.06)' : 'none',
                  }}
                >
                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', width: 9, flexShrink: 0, transition: 'transform .15s', transform: isCollapsed ? 'rotate(-90deg)' : 'none' }}>▾</span>
                  <span style={{
                    fontSize: isMobile ? 9 : 10, fontWeight: isGroup ? 700 : 600,
                    letterSpacing: isGroup ? '.04em' : 0,
                    color: isGroup ? 'rgba(255,255,255,0.62)' : 'rgba(255,255,255,0.4)',
                    textTransform: isGroup ? 'uppercase' : 'none',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {isGroup && isMobile ? row.label.replace(' Lights', '') : row.label}
                  </span>
                </div>
              );
            }
            // ── Closure leaf label (concise display, full name on hover) ──
            if (row.closure) {
              const shortLabel = row.label
                .replace(/^Left /, 'L ').replace(/^Right /, 'R ')
                .replace(/ Door Handle$/, ' Door');
              return (
                <div key={row.id} title={row.label} style={{ height: ROW_H, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 5, paddingLeft: row.depth * 10 + 8, paddingRight: 6, overflow: 'hidden' }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: '#9d6bff', flexShrink: 0, boxShadow: '0 0 4px #9d6bff' }} />
                  <span style={{ color: 'rgba(255,255,255,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: isMobile ? 9 : 10 }}>
                    {shortLabel}
                  </span>
                </div>
              );
            }
            // ── Light leaf ──
            const [r, g, b] = hexToRgb(row.color ?? 0xffffff);
            const colorStr = `rgb(${r},${g},${b})`;
            return (
              <div key={row.id} title={row.label} style={{ height: ROW_H, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 5, paddingLeft: row.depth * 10 + 8, paddingRight: 6, overflow: 'hidden' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: colorStr, flexShrink: 0, boxShadow: `0 0 4px ${colorStr}` }} />
                <span style={{ color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: isMobile ? 9 : 10 }}>
                  {row.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* ── Scrollable content column ──────────────────────────────────── */}
        <div style={{ flex: 1, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>

          {/* Waveform SVG */}
          {wfPath && (
            <div style={{ height: VH, marginBottom: 8, position: 'relative', borderRadius: 4, overflow: 'hidden', background: 'rgba(0,0,0,0.25)', minWidth: contentW }}>
              <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                <defs>
                  <linearGradient id="wfGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(0,200,110,0.18)" />
                    <stop offset="50%" stopColor="rgba(0,232,135,0.55)" />
                    <stop offset="100%" stopColor="rgba(0,200,110,0.18)" />
                  </linearGradient>
                </defs>
                <path d={wfPath} fill="url(#wfGrad)" />
                <line x1="0" y1={MID} x2={VW} y2={MID} stroke="rgba(0,232,135,0.18)" strokeWidth="0.5" />
                {Array.from({ length: BEATS + 1 }, (_, b) => (
                  <line key={b} x1={(b / BEATS * VW).toFixed(1)} y1="0" x2={(b / BEATS * VW).toFixed(1)} y2={VH}
                    stroke={b % 4 === 0 ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)'} strokeWidth="0.8" />
                ))}
                {triggerFracs.map((frac, i) => (
                  <line key={i} x1={(frac * VW).toFixed(1)} y1="0" x2={(frac * VW).toFixed(1)} y2={VH}
                    stroke="rgba(255,140,0,0.55)" strokeWidth="1.2" />
                ))}
                {playheadFraction !== null && (
                  <line x1={(playheadFraction * VW).toFixed(1)} y1="0" x2={(playheadFraction * VW).toFixed(1)} y2={VH}
                    stroke="rgba(255,255,255,0.9)" strokeWidth="1.5" />
                )}
              </svg>
              {editMode && Array.from({ length: BEATS / 4 }, (_, m) => (
                <div key={m} style={{ position: 'absolute', left: ((m * 4) / BEATS * 100) + '%', top: 3, paddingLeft: 4, fontSize: 9, color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }}>
                  bar {m + 1}
                </div>
              ))}
            </div>
          )}

          {/* Beat ruler */}
          <div style={{ marginBottom: 4 }}>
            {editMode ? (
              <div style={{ display: 'flex', width: contentW, height: HEADER_H, alignItems: 'flex-end' }}>
                {Array.from({ length: BEATS }, (_, b) => (
                  <div key={b} style={{
                    width: CELL_W ?? undefined, flex: CELL_W ? 'none' : 1,
                    textAlign: 'center', fontSize: 8,
                    color: b % 4 === 0 ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.18)',
                    paddingBottom: 3,
                    borderBottom: `1px solid ${b % 4 === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.05)'}`,
                  }}>
                    {b + 1}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ position: 'relative', width: contentW, height: HEADER_H }}>
                {Array.from({ length: BEATS + 1 }, (_, b) => {
                  const isMeasure = b % 4 === 0;
                  const isAudioBeat = audioTriggers?.has(Math.floor(b * fpb));
                  return (
                    <div key={b} style={{
                      position: 'absolute', left: (b / BEATS * 100) + '%',
                      top: 0, bottom: 0,
                      borderLeft: `1px solid ${isAudioBeat ? 'rgba(255,140,0,0.45)' : isMeasure ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.06)'}`,
                      paddingLeft: 3, display: 'flex', alignItems: 'flex-end', paddingBottom: 3,
                    }}>
                      {isMeasure && <span style={{ color: 'rgba(255,255,255,0.38)', fontSize: 9, whiteSpace: 'nowrap' }}>{(b / bpm * 60).toFixed(1)}s</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Zone rows (grouped tree) */}
          {rows.map(row => {
            // Group / subgroup spacer (keeps both columns aligned)
            if (row.kind === 'group' || row.kind === 'subgroup') {
              return (
                <div key={row.id} style={{
                  height: GROUP_H, marginBottom: 2, width: contentW,
                  borderBottom: row.kind === 'group' ? '1px solid rgba(255,255,255,0.06)' : 'none',
                  background: row.kind === 'group' ? 'linear-gradient(rgba(255,255,255,0.02), transparent)' : 'transparent',
                }} />
              );
            }
            // Closure command lane — click a cell to cycle Open→Close→Dance→Stop→clear
            if (row.closure) {
              const cch = row.channel!;
              const manual = closureBlocks?.[cch] ?? {};
              // Effective command per beat: a hand-placed command wins; otherwise we
              // decode the AUTO-choreographed closure baked into the analyzed audio
              // frames — so "Auto-choreograph closures to the music" actually shows
              // up on the timeline. Held commands render as a block (letter at the
              // start of the run); auto is dimmer than hand-placed.
              const eff: ({ cmd: ClosureCommand; auto: boolean } | null)[] = Array.from({ length: BEATS }, (_, bi) => {
                const m = manual[bi];
                if (m) return { cmd: m, auto: false };
                if (audioFrames) {
                  const v = audioFrames[Math.floor(bi * fpb)]?.[cch] ?? 0;
                  const c = BYTE_TO_CMD[v];
                  if (c && c !== 'idle') return { cmd: c, auto: true };
                }
                return null;
              });
              return (
                <div key={row.id} style={{ height: ROW_H, marginBottom: 2, display: 'flex', gap: 1, width: contentW }}>
                  {eff.map((e, beatIdx) => {
                    const cs = e ? CMD_STYLE[e.cmd] : null;
                    const isMeasure = beatIdx % 4 === 0;
                    const runStart = !!e && (beatIdx === 0 || eff[beatIdx - 1]?.cmd !== e.cmd);
                    return (
                      <div
                        key={beatIdx}
                        onClick={() => onClosureCommand?.(cch, beatIdx)}
                        title="Click to cycle Open / Close / Dance / Stop"
                        style={{
                          width: CELL_W ?? undefined, flex: CELL_W ? 'none' : 1, height: '100%',
                          borderRadius: isMobile ? 5 : 2, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: isMobile ? 11 : 9, fontWeight: 700,
                          color: cs ? cs.fg : 'transparent',
                          background: cs ? cs.bg : isMeasure ? 'rgba(157,107,255,0.06)' : 'rgba(157,107,255,0.03)',
                          border: cs ? `1px solid ${cs.fg}` : 'none',
                          opacity: e?.auto ? 0.6 : 1,   // auto-choreographed reads dimmer than hand-placed
                        }}
                      >
                        {runStart ? cs?.letter : ''}
                      </div>
                    );
                  })}
                </div>
              );
            }
            const channel = row.channel!;
            const [r, g, b] = hexToRgb(row.color ?? 0xffffff);
            const activeBeats = customBlocks?.[channel] ?? new Set<number>();

            if (editMode) {
              return (
                <div
                  key={row.id}
                  style={{
                    height: ROW_H, marginBottom: 2,
                    display: 'flex', gap: 1,
                    width: contentW, cursor: 'crosshair',
                    userSelect: 'none',
                    // touchAction:none lets us handle pointer events without browser scroll interference
                    touchAction: 'none',
                  }}
                  onPointerDown={e => handleRowPointerDown(channel, e)}
                  onPointerMove={e => handleRowPointerMove(channel, e)}
                  onPointerUp={handleRowPointerUp}
                  onPointerCancel={handleRowPointerUp}
                >
                  {Array.from({ length: BEATS }, (_, beatIdx) => {
                    const isActive = activeBeats.has(beatIdx);
                    const isMeasure = beatIdx % 4 === 0;
                    return (
                      <div
                        key={beatIdx}
                        style={{
                          width: CELL_W ?? undefined, flex: CELL_W ? 'none' : 1,
                          height: '100%',
                          borderRadius: isMobile ? 5 : 2,
                          background: isActive ? `rgba(${r},${g},${b},0.88)` : isMeasure ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.03)',
                          borderLeft: isMeasure && beatIdx > 0 ? '1px solid rgba(255,255,255,0.10)' : 'none',
                          boxShadow: isActive ? `0 0 6px rgba(${r},${g},${b},0.5)` : 'none',
                        }}
                      />
                    );
                  })}
                </div>
              );
            }

            // Preview mode
            return (
              <div key={row.id} style={{
                height: ROW_H, marginBottom: 2,
                position: 'relative',
                background: 'rgba(255,255,255,0.025)', borderRadius: 3, overflow: 'hidden',
                width: contentW,
              }}>
                {displayFrames.map((frame, fi) => {
                  const val = frame[channel] / 255;
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
          );
        })}

        </div>{/* end scrollable column */}
      </div>{/* end split layout */}

      {/* Footer hint */}
      <div style={{ display: 'flex', gap: 16, marginTop: 10, paddingLeft: LABEL_W, fontSize: 9, color: 'rgba(255,255,255,0.24)', flexWrap: 'wrap' }}>
        {editMode
          ? <span>{isMobile ? 'Tap or drag to paint beats · swipe ruler to scroll' : 'Click or drag to paint · hold to erase'} · {BEATS} beats ({(BEATS / bpm * 60).toFixed(1)}s)</span>
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
  const checkoutSession = searchParams.get('checkout_session');
  const checkoutCancelled = searchParams.get('checkout_cancelled');

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
  const [songTitle, setSongTitle] = useState('');
  const [songArtist, setSongArtist] = useState('');
  const [audioUploaded, setAudioUploaded] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportStage, setExportStage] = useState('');   // '' = idle; else label
  const [exportPct, setExportPct] = useState(0);         // 0 = indeterminate
  const [saveMsg, setSaveMsg] = useState('');

  // ── Audio preview state ───────────────────────────────────────────────────
  const rawAudioRef = useRef<ArrayBuffer | null>(null);
  const wavBlobRef = useRef<Blob | null>(null);  // decoded → WAV for Tesla
  const audioDurationRef = useRef<number | null>(null);  // seconds, for fseq length
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

  // ── Export validation + payment state ────────────────────────────────────
  const [fseqValidation, setFseqValidation] = useState<FseqValidation | null>(null);
  const [exportCount, setExportCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [checkoutMsg, setCheckoutMsg] = useState(checkoutCancelled ? 'Payment cancelled — your show is still saved.' : '');
  const [showSharePrompt, setShowSharePrompt] = useState(false);
  // Pay/subscribe choice prompt shown when a non-subscriber who's used their free
  // export tries to export again. payBusy = the option currently redirecting.
  const [payPromptOpen, setPayPromptOpen] = useState(false);
  const [payBusy, setPayBusy] = useState<'' | 'once' | 'monthly' | 'yearly'>('');
  const [payErr, setPayErr] = useState('');

  // ── Manual edit state ─────────────────────────────────────────────────────
  const [editMode, setEditMode] = useState(false);
  const [symmetry, setSymmetry] = useState(true);
  const [customBlocks, setCustomBlocks] = useState<Record<number, Set<number>>>({});
  const [closureBlocks, setClosureBlocks] = useState<ClosureBlocks>({});
  const [closurePulse, setClosurePulse] = useState<{ ch: number; cmd: ClosureCommand; n: number } | null>(null);
  const pulseN = useRef(0);
  const [autoClosures, setAutoClosures] = useState(false);   // opt-in: choreograph closures to the song
  const [mixPreset, setMixPreset] = useState('balanced');    // genre/vibe preset for the audio engine
  const [detectedVibe, setDetectedVibe] = useState<string | null>(null);  // auto-detected vibe (for the badge)
  const [closureSuggestion, setClosureSuggestion] = useState<number | null>(null);  // drop count when closures fit
  const vibeUserSet = useRef(false);                         // true once the user manually picks a vibe
  const decodedRef = useRef<AudioBuffer | null>(null);       // last decoded audio, for re-analysis on toggle

  // Cycle a closure command: empty → Open → Close → Dance → Stop → empty
  function onClosureCommand(channel: number, beatIdx: number) {
    // The new command for this cell (cycles open→close→dance→stop→clear)
    const cur = closureBlocks[channel]?.[beatIdx];
    const idx = cur ? CMD_CYCLE.indexOf(cur) : -1;
    const newCmd = idx >= CMD_CYCLE.length - 1 ? null : CMD_CYCLE[idx + 1];
    setClosureBlocks(prev => {
      const next = { ...prev };
      const lane = { ...(next[channel] ?? {}) };
      if (newCmd === null) delete lane[beatIdx];
      else lane[beatIdx] = newCmd;
      if (Object.keys(lane).length) next[channel] = lane; else delete next[channel];
      return next;
    });
    // Pulse the closure in the 3D view immediately for instant feedback.
    if (newCmd) setClosurePulse({ ch: channel, cmd: newCmd, n: ++pulseN.current });
  }
  const closureWarnings = useMemo(
    () => validateClosures(closureBlocks, MODELS[model].zones),
    [closureBlocks, model]
  );

  // ── Auth check ────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/auth'); return; }
      setAuthed(true);
      setUserId(session.user.id);
      if (editId) loadShow(editId);
      else if (remixToken) loadRemix(remixToken);

      // Load profile (admin flag + export count + subscription)
      const [{ data: profile }, { count }, { data: sub }] = await Promise.all([
        supabase.from('profiles').select('is_admin').eq('id', session.user.id).single(),
        supabase.from('exports').select('id', { count: 'exact', head: true }).eq('user_id', session.user.id),
        supabase.from('subscriptions').select('status').eq('user_id', session.user.id).in('status', ['active', 'trialing']).maybeSingle(),
      ]);
      if (profile?.is_admin) setIsAdmin(true);
      setExportCount(count ?? 0);
      if (sub) setIsSubscribed(true);

      // Returning from Stripe success — verify payment then auto-export
      if (checkoutSession && editId) {
        setCheckoutMsg('Verifying payment…');
        const res = await fetch(`/api/stripe/verify?session_id=${checkoutSession}`);
        if (res.ok) {
          setCheckoutMsg('Payment confirmed! Generating your export…');
          // Trigger the server-side export (show is already saved)
          const expRes = await fetch('/api/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ show_id: editId }) });
          if (expRes.ok) {
            const { url, filename } = await expRes.json();
            const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
            setCheckoutMsg('✓ Download started!');
            setExportCount(c => c + 1);
            setTimeout(() => setCheckoutMsg(''), 5000);
          } else {
            setCheckoutMsg('Export failed — please try the Export button again.');
          }
        } else {
          setCheckoutMsg('Could not verify payment. Contact support if you were charged.');
        }
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) router.replace('/auth');
    });
    return () => subscription.unsubscribe();
  }, [router, editId, remixToken, checkoutSession]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadShow(id: string) {
    const { data } = await supabase.from('shows').select('*').eq('id', id).single();
    if (!data) return;
    setName(data.name); setModel(data.tesla_model); setStyle(data.style);
    setIntensity(data.intensity);
    if (data.bpm) setBpm(data.bpm);
    setIsPublic(data.is_public); setShareToken(data.share_token);
    setSongTitle(data.song_title ?? ''); setSongArtist(data.song_artist ?? '');
    // Restore manual edits (light beats + closure commands)
    const ed = data.edit_data as { customBlocks?: Record<string, number[]>; closureBlocks?: ClosureBlocks; autoClosures?: boolean; mixPreset?: string } | null;
    if (ed) {
      setCustomBlocks(Object.fromEntries(Object.entries(ed.customBlocks ?? {}).map(([ch, arr]) => [Number(ch), new Set(arr)])));
      setClosureBlocks(ed.closureBlocks ?? {});
      setAutoClosures(ed.autoClosures ?? false);
      setMixPreset(ed.mixPreset ?? 'balanced');
      vibeUserSet.current = !!ed.mixPreset;   // respect a saved vibe over auto-detection
    } else {
      setCustomBlocks({}); setClosureBlocks({}); setAutoClosures(false); setMixPreset('balanced');
    }
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
    // Light up the fixture immediately on paint (instant feedback in the 3D view)
    const adding = !customBlocks[channel]?.has(beatIdx);
    if (adding) setClosurePulse({ ch: channel, cmd: 'open', n: ++pulseN.current });
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

  // Total beats to lay out in the timeline: the WHOLE song once audio is loaded
  // (so customers can see/edit every channel across the entire track, scrolling
  // horizontally), otherwise the short no-audio default.
  const timelineBeats = audioFrames && audioFrames.length
    ? Math.max(VISIBLE_BEATS, Math.ceil(audioFrames.length / ((60 / bpm) * 50)))
    : VISIBLE_BEATS;

  // Frames fed to the 3D scene: custom blocks > audio > null (uses internal generateFrames)
  const hasCustom = Object.keys(customBlocks).length > 0 || Object.keys(closureBlocks).length > 0;
  const sceneFrames: Uint8Array[] | null = hasCustom
    ? customBlocksToFrames(customBlocks, timelineBeats, bpm, getChannelCount(model), closureBlocks)
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

    wavBlobRef.current = null;
    vibeUserSet.current = false;        // new song → allow auto-vibe detection
    setClosureSuggestion(null);
    setAudioFrames(null);
    setAudioTriggers(new Set());
    setWaveformData(null);

    // Read song title + artist from the MP3's ID3 tags (filename fallback)
    parseId3(file).then(tags => {
      const title = tags.title?.trim() || titleFromFilename(file.name);
      setSongTitle(title);
      if (tags.artist?.trim()) setSongArtist(tags.artist.trim());
      // If the show still has the default name, adopt the detected song title
      setName(prev => (!prev || prev === 'My Light Show' || prev === 'Untitled Show') ? title : prev);
    }).catch(() => {
      setSongTitle(titleFromFilename(file.name));
    });

    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const raw = ev.target?.result as ArrayBuffer;
        rawAudioRef.current = raw.slice(0);
        const ctx = new AudioContext();
        const ab = await ctx.decodeAudioData(raw.slice(0));
        audioDurationRef.current = ab.duration;  // full song length for the fseq
        const detected = detectBPM(ab);
        setBpm(Math.max(60, Math.min(200, detected)));
        await ctx.close();

        // Full frequency analysis for audio-driven light show
        setAnalyzing(true);
        try {
          const ctx2 = new AudioContext();
          const ab2 = await ctx2.decodeAudioData((rawAudioRef.current as ArrayBuffer).slice(0));
          await ctx2.close();
          // Convert to WAV at 44.1 kHz (Tesla requires it — 48 kHz won't sync).
          try { wavBlobRef.current = audioBufferToWav(await resampleTo44100(ab2)); } catch { wavBlobRef.current = null; }
          decodedRef.current = ab2;
          const result = await analyzeAudioToFrames(ab2, MODELS[model], { autoClosures, model, preset: mixPreset });
          setAudioFrames(result.frames);
          setAudioTriggers(result.triggerFrames);
          setWaveformData(result.waveformData);
          if (result.bpm > 60) setBpm(Math.max(60, Math.min(200, result.bpm)));
          // ── Auto-build: apply the detected vibe (unless the user picked one) and
          // suggest closures if the song has clear drops (suggest-and-confirm). ──
          setDetectedVibe(result.suggestedPreset);
          if (!vibeUserSet.current && result.suggestedPreset !== mixPreset) {
            setMixPreset(result.suggestedPreset); // triggers re-analysis with the detected vibe
          }
          if (result.closuresRecommended && !autoClosures) setClosureSuggestion(result.dropCount);
        } catch { /* fall back to generated frames */ }
        setAnalyzing(false);
      } catch { /* ignore */ }
    };
    reader.readAsArrayBuffer(file);
  }

  // Re-analyze (without re-decoding) when the auto-closures toggle or model changes.
  useEffect(() => {
    if (!decodedRef.current) return;
    let cancelled = false;
    setAnalyzing(true);
    analyzeAudioToFrames(decodedRef.current, MODELS[model], { autoClosures, model, preset: mixPreset })
      .then(r => { if (!cancelled) { setAudioFrames(r.frames); setAudioTriggers(r.triggerFrames); } })
      .finally(() => { if (!cancelled) setAnalyzing(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoClosures, mixPreset]);

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

    // Upload straight from the browser to Supabase Storage via a signed URL.
    // (Vercel functions cap request bodies at ~4.5MB — a full-song WAV is far
    // bigger — so we never stream the file through our own API.)
    const putViaSignedUrl = async (f: File): Promise<string | null> => {
      // 1. Ask our API for a signed upload URL (tiny metadata-only request)
      const signRes = await fetch('/api/upload', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ show_id: showId, file_name: f.name, file_size: f.size }),
      });
      if (!signRes.ok) {
        const { error } = await signRes.json().catch(() => ({ error: 'upload error' }));
        return error ?? 'upload error';
      }
      const { path, token } = await signRes.json();
      // 2. PUT the bytes directly to Storage
      const { error: upErr } = await supabase.storage
        .from('audio-files').uploadToSignedUrl(path, token, f, { contentType: f.type });
      if (upErr) return upErr.message;
      // 3. Record the audio_files row
      const commitRes = await fetch('/api/upload/commit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ show_id: showId, path, original_name: f.name, file_size: f.size, mime_type: f.type }),
      });
      if (!commitRes.ok) {
        const { error } = await commitRes.json().catch(() => ({ error: 'upload error' }));
        return error ?? 'upload error';
      }
      return null; // success
    };

    // Prefer the converted 44.1kHz WAV (sample-accurate sync). If it fails,
    // fall back to the original — which ships with the correct extension and
    // still plays on Tesla.
    const base = file.name.replace(/\.[^.]+$/, '');
    const wavFile = wavBlobRef.current
      ? new File([wavBlobRef.current], `${base}.wav`, { type: 'audio/wav' })
      : null;

    let err = await putViaSignedUrl(wavFile ?? file);
    if (err && wavFile) err = await putViaSignedUrl(file);

    setUploading(false);
    if (!err) { setAudioUploaded(true); }
    else {
      setSaveMsg(`Audio upload failed: ${err}`);
      setTimeout(() => setSaveMsg(''), 5000);
    }
  }

  async function save(): Promise<string | null> {
    setSaving(true); setSaveMsg('');
    const editData = (Object.keys(customBlocks).length || Object.keys(closureBlocks).length || autoClosures || mixPreset !== 'balanced')
      ? {
          customBlocks: Object.fromEntries(Object.entries(customBlocks).map(([ch, set]) => [ch, [...set]])),
          closureBlocks,
          beats: timelineBeats,
          autoClosures,
          mixPreset,
        }
      : null;
    const fullPayload = { user_id: userId, name, tesla_model: model, style, intensity, bpm, is_public: isPublic, song_title: songTitle || null, song_artist: songArtist || null, edit_data: editData, duration_sec: audioDurationRef.current ?? undefined, updated_at: new Date().toISOString() };
    let showId = savedShowId;
    let error;

    // Save with edit_data; if that column doesn't exist yet (migration not run),
    // retry without it so saving never breaks.
    const trySave = async (payload: Record<string, unknown>) => {
      if (showId) {
        return (await supabase.from('shows').update(payload).eq('id', showId)).error;
      }
      const { error: e, data } = await supabase.from('shows')
        .insert({ ...payload, is_public: false, share_token: crypto.randomUUID() })
        .select().single();
      if (data) {
        showId = data.id; setSavedShowId(data.id); setShareToken(data.share_token);
        router.replace(`/builder?id=${data.id}`);
      }
      return e;
    };

    error = await trySave(fullPayload);
    if (error && /edit_data/.test(error.message)) {
      const { edit_data: _omit, ...noEdit } = fullPayload;
      void _omit;
      error = await trySave(noEdit);
    }
    setSaving(false);
    if (error) { setSaveMsg(`Error: ${error.message}`); setTimeout(() => setSaveMsg(''), 4000); return null; }
    setSaveMsg('Saved!'); setTimeout(() => setSaveMsg(''), 3000);
    if (audioFile && !audioUploaded && showId) await uploadAudio(showId, audioFile);
    return showId;
  }

  // ── Checkout handlers for the pay/subscribe choice prompt ─────────────────
  // All three routes are CORS-safe (same-origin) and surface their real error.
  async function checkoutPerExport() {
    setPayBusy('once'); setPayErr('');
    try {
      // $2.99 is per-show, so make sure the show is saved (and current) first.
      const id = await save();
      if (!id) { setPayErr('Could not save your show — please try again.'); setPayBusy(''); return; }
      const res = await fetch('/api/stripe/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ show_id: id }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) { window.location.href = data.url; return; }
      setPayErr(data.error ? `Checkout error: ${data.error}` : 'Could not start checkout — please try again.');
    } catch { setPayErr('Could not reach checkout — please try again.'); }
    setPayBusy('');
  }
  async function checkoutSubscription(plan: 'monthly' | 'yearly') {
    setPayBusy(plan); setPayErr('');
    try {
      const res = await fetch('/api/subscription/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) { window.location.href = data.url; return; }
      setPayErr(data.error ? `Checkout error: ${data.error}` : 'Could not start checkout — please try again.');
    } catch { setPayErr('Could not reach checkout — please try again.'); }
    setPayBusy('');
  }

  async function exportZip() {
    setExporting(true);
    setCheckoutMsg('');

    // Always persist the current builder state before exporting. The server
    // /api/export reads edit_data from the DB, so any change made since the last
    // save — enabling Auto-choreograph closures, switching the vibe preset,
    // editing blocks — must be saved first or it won't appear in the exported
    // show. (Previously this only saved brand-new shows, so toggling closures on
    // an already-saved show shipped a download with no closures.)
    const showId = await save();
    if (!showId) { setSaveMsg('Save failed — please try again.'); setExporting(false); return; }

    // Non-admin, non-subscriber, used free export → show the pay/subscribe choice.
    // The show is already saved above, so savedShowId is set for the $2.99 route.
    if (exportCount > 0 && !isAdmin && !isSubscribed) {
      setExporting(false);
      setPayErr('');
      setPayPromptOpen(true);
      return;
    }

    // Free / subscribed / admin → server-side export. This is authoritative: it
    // bundles the audio STORED for the show, so it works even when the song
    // isn't in memory (e.g. re-opening a saved show — the case that used to
    // silently ship an fseq with no audio).
    if (showId) {
      setExportStage('Building your light show'); setExportPct(0);
      let res: Response | null = null;
      try {
        res = await fetch('/api/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ show_id: showId }),
        });
      } catch { res = null; }

      if (res && res.ok) {
        const { url, filename, delivered_by_email } = await res.json();
        // Every export downloads directly AND emails a backup copy + setup steps.
        await streamDownload(url, filename || `${name.replace(/\s+/g, '_')}_lightshow.zip`);
        setCheckoutMsg(delivered_by_email ? '✓ Downloaded — backup + setup steps emailed to you' : '✓ Download started!');
        setTimeout(() => setCheckoutMsg(''), 6000);
        setExportCount(c => c + 1);
        setExporting(false); setExportStage(''); setShowSharePrompt(true);
        return;
      }

      // Server export failed. Fall back to a browser-built zip ONLY if the audio
      // is in memory this session — otherwise it would silently ship with no
      // audio (the "only the fseq exported" bug). Otherwise, surface the error.
      if (!wavBlobRef.current && !audioFile) {
        const { error: srvErr } = res ? await res.json().catch(() => ({ error: '' })) : { error: 'network error' };
        setSaveMsg(`Export failed: ${srvErr || 'please try again'}. Re-upload your song, then export.`);
        setTimeout(() => setSaveMsg(''), 8000);
        setExporting(false); setExportStage('');
        return;
      }
    }

    // ── Client-side fallback (only reached when audio is in memory) ───────────
    setExportStage('Packaging your show'); setExportPct(0);
    const FPS = 50;
    // Match the audio length when we have it; otherwise a 30s style loop.
    const frames = audioFrames ? audioFrames.length : 30 * FPS;
    const channels = getChannelCount(model);
    const def = MODELS[model];
    let frameData: Uint8Array[];
    if (hasCustom) {
      const pattern = customBlocksToFrames(customBlocks, VISIBLE_BEATS, bpm, channels, closureBlocks);
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
    // BYOM: ship the choreography ONLY (.fseq + a setup README). The customer
    // brings their own copy of the song — we never bundle/redistribute the audio.
    const songLabel = songTitle ? `"${songTitle}"${songArtist ? ` — ${songArtist}` : ''}` : 'your song';
    folder.file('README.txt', [
      `THAT LIGHTSHOW  —  your show is ready`,
      `Choreography by us. Soundtrack by you.`,
      ``,
      `IN THIS FOLDER`,
      `  - lightshow.fseq   (your custom light show)`,
      ``,
      `ONE LAST STEP - ADD YOUR MUSIC`,
      `  1. Find your copy of ${songLabel} - the same file you uploaded works perfectly.`,
      `  2. Rename it to:   lightshow.wav   (or  lightshow.mp3)`,
      `  3. Make sure it's 44.1 kHz so it stays perfectly in sync (most MP3s already are).`,
      `  4. Put it in this LightShow folder, right next to lightshow.fseq.`,
      `  5. Copy the whole LightShow folder to a USB drive (formatted exFAT or FAT32).`,
      `  6. In your Tesla: Toybox -> Light Show -> Schedule Show. Enjoy.`,
      ``,
      `WHY DO YOU ADD THE SONG YOURSELF?`,
      `The music belongs to the artists who made it - and we'd rather honor the`,
      `copyright that protects their work than tiptoe around it. So you bring your own`,
      `copy of the track, and we'll make your Tesla do it justice. It keeps your show`,
      `100% legal, 100% yours, and everyone on the right side of the music.`,
      ``,
      `Questions?  thatteslalightshow.com`,
      ``,
    ].join('\r\n'));
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `${name.replace(/\s+/g, '_')}_lightshow.zip`; a.click();
    URL.revokeObjectURL(url);
    setExporting(false); setExportStage('');
    setShowSharePrompt(true);
  }

  // Download the export zip with a real progress bar (the server zip can be
  // ~10MB once audio is bundled, and the build step itself takes a moment).
  async function streamDownload(url: string, filename: string) {
    setExportStage('Downloading'); setExportPct(0);
    try {
      const resp = await fetch(url);
      const total = Number(resp.headers.get('content-length')) || 0;
      if (resp.body && total > 0) {
        const reader = resp.body.getReader();
        const chunks: Uint8Array[] = []; let received = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) { chunks.push(value); received += value.length; setExportPct(Math.round((received / total) * 100)); }
        }
        const blob = new Blob(chunks as BlobPart[], { type: 'application/zip' });
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = objUrl; a.download = filename; a.click();
        URL.revokeObjectURL(objUrl);
        return;
      }
    } catch { /* fall through to a plain browser download */ }
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
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
          {uploading && <span className="builder-status-msg" style={{ fontSize: 12, color: 'var(--muted)' }}>Uploading audio…</span>}
          {checkoutMsg && <span className="builder-status-msg" style={{ fontSize: 12, color: checkoutMsg.startsWith('✓') ? 'var(--green)' : checkoutMsg.startsWith('Could') || checkoutMsg.startsWith('Payment cancelled') ? '#ff8a8a' : 'var(--muted)' }}>{checkoutMsg}</span>}
          {!checkoutMsg && saveMsg && <span className="builder-status-msg" style={{ fontSize: 12, color: saveMsg.startsWith('Error') || saveMsg.startsWith('Audio') ? '#ff8a8a' : 'var(--green)' }}>{saveMsg}</span>}
          {isAdmin && (
            <Link href="/admin" className="builder-admin-link" style={{ padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: 'rgba(232,64,74,0.12)', border: '1px solid rgba(232,64,74,0.3)', color: 'var(--red)', letterSpacing: '.05em' }}>
              Admin
            </Link>
          )}
          <button onClick={save} disabled={saving || uploading} className="btn btn-ghost btn-sm">{saving ? '…' : 'Save'}</button>
          <div style={{ position: 'relative' }}>
            <button onClick={exportZip} disabled={exporting || saving} className="btn btn-primary btn-sm">
              {exporting ? 'Exporting…' : (
                <>
                  <span className="desktop-only">
                    {(isAdmin || isSubscribed) ? '⬇ Export ZIP — Unlimited' : exportCount === 0 ? '⬇ Export ZIP — Free' : '⬇ Export ZIP — $2.99'}
                  </span>
                  <span className="mobile-only">⬇ Export</span>
                </>
              )}
            </button>
            {(isAdmin || isSubscribed || exportCount === 0) && (
              <span style={{ position: 'absolute', top: -8, right: -8, background: isAdmin ? 'var(--red)' : isSubscribed ? 'rgba(80,160,255,0.9)' : 'var(--green)', color: '#fff', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 8, whiteSpace: 'nowrap' }}>
                {isAdmin ? 'ADMIN' : isSubscribed ? 'PRO' : 'FREE'}
              </span>
            )}
          </div>
          {/* Subscription upsell for non-subscribers who've used their free export */}
          {!isAdmin && !isSubscribed && exportCount > 0 && (
            <button
              onClick={() => { setPayErr(''); setPayPromptOpen(true); }}
              style={{ fontSize: 11, color: 'rgba(80,160,255,0.85)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, whiteSpace: 'nowrap', textDecoration: 'underline' }}
            >
              Go Unlimited →
            </button>
          )}
        </div>
      </nav>

      <div className="builder-grid">
        {/* ── Left panel ─────────────────────────────────────────────────── */}
        <aside className="builder-sidebar" style={{ borderRight: '1px solid var(--border)', padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Tesla model — first: pick the car, then add the song */}
          <div>
            <div className="label">Tesla model</div>
            <div className="builder-models">
              {TESLA_MODELS.map(m => (
                <button key={m.value} onClick={() => { setModel(m.value); setAudioFrames(null); setAudioTriggers(new Set()); setWaveformData(null); setCustomBlocks({}); setClosureBlocks({}); }}
                  style={{ padding: '8px 12px', borderRadius: 'var(--radius)', border: `1px solid ${model === m.value ? 'var(--red)' : 'var(--border)'}`, background: model === m.value ? 'var(--red-glow)' : 'var(--bg3)', color: model === m.value ? 'var(--text)' : 'var(--muted)', fontSize: 13, textAlign: 'left', cursor: 'pointer', transition: 'all .15s' }}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Audio */}
          <div>
            <div className="label">Audio file</div>
            <label
              style={{ display: 'block', border: `1px dashed ${audioFile ? 'rgba(0,232,135,0.35)' : 'var(--border)'}`, borderRadius: 'var(--radius)', padding: '1rem', textAlign: 'center', cursor: 'pointer', transition: 'border-color .15s', background: audioFile ? 'rgba(0,232,135,0.04)' : 'transparent' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--red)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = audioFile ? 'rgba(0,232,135,0.35)' : 'var(--border)')}>
              <input type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac" onChange={onAudioChange} style={{ display: 'none' }} />
              <div style={{ fontSize: '1.4rem', marginBottom: 4 }}>🎵</div>
              <div style={{ fontSize: 12, color: audioUploaded ? 'var(--green)' : audioFile ? '#ff8c00' : 'var(--muted)' }}>
                {audioUploaded ? `✓ ${audioFile?.name ?? 'Audio saved'}` : audioFile ? audioFile.name : 'Click to upload your song'}
              </div>
              {!audioFile && <div style={{ fontSize: 11, color: 'var(--muted2)', marginTop: 2 }}>MP3, WAV, M4A… · auto-converted to Tesla WAV</div>}
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

            {/* Music vibe preset — retunes the audio engine for the song's genre */}
            {(audioFrames || audioFile) && (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 5 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--muted2)', textTransform: 'uppercase' }}>Music Vibe</span>
                  {detectedVibe && !vibeUserSet.current && (
                    <span style={{ fontSize: 10, color: 'var(--green)' }}>✨ auto-detected from your song</span>
                  )}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {([['balanced', 'Balanced'], ['edm', 'EDM'], ['hiphop', 'Hip-Hop'], ['rock', 'Rock'], ['pop', 'Pop'], ['cinematic', 'Cinematic']] as const).map(([k, label]) => (
                    <button key={k} onClick={() => { vibeUserSet.current = true; setMixPreset(k); }} disabled={analyzing}
                      style={{ padding: '4px 9px', fontSize: 11, borderRadius: 6, cursor: analyzing ? 'default' : 'pointer',
                        background: mixPreset === k ? 'rgba(232,64,74,0.18)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${mixPreset === k ? 'var(--red)' : 'var(--border)'}`,
                        color: mixPreset === k ? 'var(--text)' : 'var(--muted)' }}>{label}</button>
                  ))}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--muted2)', marginTop: 4, lineHeight: 1.4 }}>
                  Retunes the lights to the song — e.g. <strong>EDM</strong> hits the bass hard with explosive drops; <strong>Cinematic</strong> rides the swells gently.
                </div>
              </div>
            )}

            {/* Closure suggestion — suggest-and-confirm (the car physically moves) */}
            {closureSuggestion !== null && !autoClosures && (
              <div style={{ marginTop: 10, padding: '0.7rem 0.85rem', background: 'rgba(157,107,255,0.08)', border: '1px solid rgba(157,107,255,0.35)', borderRadius: 'var(--radius-lg)' }}>
                <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--muted)' }}>
                  <strong style={{ color: '#b48cff' }}>✨ We found {closureSuggestion} big drop{closureSuggestion === 1 ? '' : 's'}.</strong> Want to add
                  {' '}<strong style={{ color: 'var(--text)' }}>door &amp; closure choreography</strong> timed to land on them?
                  <span style={{ color: '#ffb454', display: 'block', marginTop: 2 }}>⚠ Your Tesla&apos;s doors/closures will physically move — ensure clearance.</span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button onClick={() => { setAutoClosures(true); setClosureSuggestion(null); }}
                    style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 7, cursor: 'pointer', background: 'rgba(157,107,255,0.25)', border: '1px solid #9d6bff', color: 'var(--text)' }}>Add choreography</button>
                  <button onClick={() => setClosureSuggestion(null)}
                    style={{ padding: '5px 12px', fontSize: 12, borderRadius: 7, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)' }}>No thanks</button>
                </div>
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
                pulse={closurePulse}
              />
            </div>

            {/* Big play overlay — only when audio is loaded and not yet previewing */}
            {audioFile && !previewing && (
              <button
                onClick={startPreview}
                style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, background: 'rgba(0,0,0,0.28)', border: 'none', cursor: 'pointer', transition: 'background .2s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.15)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.28)')}
              >
                <div style={{ width: 58, height: 58, borderRadius: '50%', background: 'rgba(232,64,74,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 40px rgba(232,64,74,0.45)' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.65)', letterSpacing: '.03em' }}>Preview with audio</span>
              </button>
            )}

            {/* Live indicator while previewing */}
            {previewing && (
              <div style={{ position: 'absolute', top: 14, left: 14, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', borderRadius: 20, padding: '5px 12px', border: '1px solid rgba(0,232,135,0.3)' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', animation: 'pulse 1s infinite' }} />
                <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>LIVE — {audioFile?.name?.slice(0, 22) ?? 'audio'}</span>
              </div>
            )}
            {/* Stop button while previewing */}
            {previewing && (
              <button
                onClick={stopPreview}
                style={{ position: 'absolute', top: 14, right: 14, width: 32, height: 32, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect width="10" height="10" rx="1.5"/></svg>
              </button>
            )}
          </div>

          {/* Stats bar */}
          <div className="builder-stats" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
            {[
              { label: 'Model', value: TESLA_MODELS.find(m => m.value === model)?.label },
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
          <div className="builder-timeline" style={{ padding: '1.25rem 1.5rem', background: 'var(--bg2)', border: `1px solid ${previewing ? 'rgba(0,232,135,0.15)' : editMode ? 'rgba(255,140,0,0.2)' : 'var(--border)'}`, borderRadius: 'var(--radius-lg)', transition: 'border-color .3s' }}>
            <div className="builder-timeline-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', gap: 8, flexWrap: 'wrap' }}>
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
                    onClick={() => { setCustomBlocks({}); setClosureBlocks({}); }}
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
              closureBlocks={closureBlocks}
              onClosureCommand={onClosureCommand}
              beats={timelineBeats}
              revealClosures={autoClosures}
            />
          </div>

          {/* Closures: command legend + live limit validation */}
          {/* Always-visible closure reference (not just after placing a command) */}
          <div style={{ padding: '0.85rem 1rem', background: 'rgba(157,107,255,0.05)', border: '1px solid rgba(157,107,255,0.2)', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 11, color: 'var(--muted)' }}>
              <span style={{ fontWeight: 700, color: '#b48cff', letterSpacing: '.04em' }}>CLOSURES</span>
              {(['open', 'close', 'dance', 'stop'] as const).map(c => (
                <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 14, height: 14, borderRadius: 3, background: CMD_STYLE[c].bg, border: `1px solid ${CMD_STYLE[c].fg}`, color: CMD_STYLE[c].fg, fontSize: 9, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{CMD_STYLE[c].letter}</span>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </span>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--muted2)', lineHeight: 1.55 }}>
              In the <strong style={{ color: 'var(--muted)' }}>Closures</strong> rows of the timeline, <strong style={{ color: 'var(--muted)' }}>click a beat cell to cycle</strong> its command:
              {' '}<strong style={{ color: CMD_STYLE.open.fg }}>Open</strong> and <strong style={{ color: CMD_STYLE.close.fg }}>Close</strong> actuate the panel,
              {' '}<strong style={{ color: CMD_STYLE.dance.fg }}>Dance</strong> wiggles it open &amp; shut, and
              {' '}<strong style={{ color: CMD_STYLE.stop.fg }}>Stop</strong> halts it mid-motion. Click again past Stop to clear.
              {' '}<span style={{ opacity: 0.7 }}>Dimmed cells are auto-choreographed for you; click any cell to override it.</span>
            </div>
            {/* Auto-choreograph closures to the song (opt-in — physical doors move) */}
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', userSelect: 'none', padding: '8px 10px', background: autoClosures ? 'rgba(157,107,255,0.12)' : 'rgba(255,255,255,0.03)', border: `1px solid ${autoClosures ? 'rgba(157,107,255,0.4)' : 'var(--border)'}`, borderRadius: 8 }}>
              <input type="checkbox" checked={autoClosures} onChange={e => setAutoClosures(e.target.checked)} style={{ accentColor: '#9d6bff', width: 15, height: 15, marginTop: 1 }} />
              <span style={{ fontSize: 12, lineHeight: 1.5 }}>
                <strong style={{ color: 'var(--text)' }}>Auto-choreograph closures to the music</strong> — opens your car&apos;s
                {' '}{MODELS[model].zones.some(z => z.closure === 'falcon_doors') ? 'falcon/front doors' : MODELS[model].zones.some(z => z.closure === 'door_handles') ? 'doors & mirrors' : 'mirrors & windows'} to land open on the drops and dance through big sections,
                {' '}<strong style={{ color: 'var(--muted)' }}>automatically within Tesla&apos;s limits</strong>.
                <span style={{ color: '#ffb454', display: 'block', marginTop: 2 }}>⚠ Real doors/closures will move — make sure your Tesla has clearance.</span>
              </span>
            </label>
            {Object.keys(closureBlocks).length > 0 && (
              closureWarnings.length > 0 ? (
                closureWarnings.map((w, i) => (
                  <div key={i} style={{ fontSize: 12, color: '#ff8a8a', display: 'flex', gap: 6 }}>
                    <span>⚠</span><span>{w}</span>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 12, color: 'var(--green)' }}>✓ Closure commands within Tesla limits</div>
              )
            )}
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
              <li>Copy the <code style={{ background: 'var(--bg3)', padding: '1px 4px', borderRadius: 3 }}>LightShow/</code> folder to the root of a USB drive (exFAT or FAT32 — not NTFS).</li>
              <li>Plug the USB into your Tesla's front USB or glovebox port.</li>
              <li>Tap <strong style={{ color: 'var(--text)' }}>Toybox → Light Show → Schedule Show</strong> on the touchscreen.</li>
            </ol>
            <a href="/guide" target="_blank" style={{ display: 'inline-block', marginTop: '.6rem', fontSize: 12.5, color: 'var(--red)' }}>
              Full step-by-step guide, incl. how to format a USB drive →
            </a>
          </div>
        </main>
      </div>

      {/* Export progress toast */}
      {exporting && exportStage && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 101, background: 'rgba(10,10,15,0.97)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14, padding: '1rem 1.25rem', width: 'min(420px, calc(100vw - 3rem))', backdropFilter: 'blur(16px)', boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13 }}>
              {exportStage}{exportStage === 'Downloading' && exportPct > 0 ? ` — ${exportPct}%` : '…'}
            </span>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>This can take a moment</span>
          </div>
          <div style={{ height: 6, borderRadius: 4, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', position: 'relative' }}>
            {exportStage === 'Downloading' && exportPct > 0 ? (
              <div style={{ height: '100%', width: `${exportPct}%`, background: 'var(--red)', borderRadius: 4, transition: 'width .2s' }} />
            ) : (
              <div style={{ position: 'absolute', height: '100%', width: '40%', background: 'var(--red)', borderRadius: 4, animation: 'tlsIndeterminate 1.1s ease-in-out infinite' }} />
            )}
          </div>
          <style>{`@keyframes tlsIndeterminate { 0% { left: -40%; } 100% { left: 100%; } }`}</style>
        </div>
      )}

      {/* Pay / subscribe choice — shown after the free export is used */}
      {payPromptOpen && (
        <div
          onClick={() => { if (!payBusy) setPayPromptOpen(false); }}
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
        >
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', boxShadow: '0 12px 50px rgba(0,0,0,0.6)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, marginBottom: 4 }}>You&apos;ve used your free export</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18 }}>Choose how you&apos;d like to export this show.</div>

            {/* Yearly — best value */}
            <button
              onClick={() => checkoutSubscription('yearly')}
              disabled={!!payBusy}
              style={{ width: '100%', textAlign: 'left', padding: '12px 14px', marginBottom: 10, borderRadius: 10, background: 'var(--red)', border: '1px solid var(--red)', color: '#fff', cursor: payBusy ? 'default' : 'pointer', opacity: payBusy && payBusy !== 'yearly' ? 0.5 : 1 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{payBusy === 'yearly' ? 'Redirecting…' : 'Go Unlimited — $49.99/yr'}</span>
                <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(255,255,255,0.22)', padding: '2px 7px', borderRadius: 20 }}>BEST VALUE</span>
              </div>
              <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>Unlimited exports · save 40%</div>
            </button>

            {/* Monthly */}
            <button
              onClick={() => checkoutSubscription('monthly')}
              disabled={!!payBusy}
              style={{ width: '100%', textAlign: 'left', padding: '12px 14px', marginBottom: 10, borderRadius: 10, background: 'rgba(80,160,255,0.1)', border: '1px solid rgba(80,160,255,0.4)', color: 'var(--text)', cursor: payBusy ? 'default' : 'pointer', opacity: payBusy && payBusy !== 'monthly' ? 0.5 : 1 }}
            >
              <div style={{ fontWeight: 700, fontSize: 14 }}>{payBusy === 'monthly' ? 'Redirecting…' : 'Unlimited — $6.99/mo'}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Export as many shows as you want</div>
            </button>

            {/* One-time $2.99 */}
            <button
              onClick={checkoutPerExport}
              disabled={!!payBusy}
              style={{ width: '100%', textAlign: 'left', padding: '12px 14px', borderRadius: 10, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', cursor: payBusy ? 'default' : 'pointer', opacity: payBusy && payBusy !== 'once' ? 0.5 : 1 }}
            >
              <div style={{ fontWeight: 600, fontSize: 14 }}>{payBusy === 'once' ? 'Redirecting…' : 'Just this export — $2.99'}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>One-time, no subscription</div>
            </button>

            {payErr && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 12 }}>{payErr}</div>}

            <button
              onClick={() => setPayPromptOpen(false)}
              disabled={!!payBusy}
              style={{ display: 'block', margin: '14px auto 0', background: 'none', border: 'none', color: 'var(--muted)', fontSize: 12, cursor: payBusy ? 'default' : 'pointer', textDecoration: 'underline' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Post-export share prompt */}
      {showSharePrompt && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 100, background: 'rgba(10,10,15,0.96)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14, padding: '1.25rem 1.5rem', maxWidth: 440, width: 'calc(100vw - 3rem)', backdropFilter: 'blur(16px)', boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, marginBottom: 3 }}>Show downloaded!</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
                When you post the video, tag <strong style={{ color: 'rgba(255,255,255,0.7)' }}>@ThatTeslaLightshow</strong> on TikTok or Instagram — we love to feature community shows!
              </div>
            </div>
            <button onClick={() => setShowSharePrompt(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1, flexShrink: 0, paddingTop: 1 }}>×</button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href="https://tiktok.com/@ThatTeslaLightshow" target="_blank" rel="noopener noreferrer" style={{ flex: 1, padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.65)', textAlign: 'center', textDecoration: 'none' }}>TikTok</a>
            <a href="https://instagram.com/ThatTeslaLightshow" target="_blank" rel="noopener noreferrer" style={{ flex: 1, padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.65)', textAlign: 'center', textDecoration: 'none' }}>Instagram</a>
            <a href="https://x.com/ThatTeslaLightshow" target="_blank" rel="noopener noreferrer" style={{ flex: 1, padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.65)', textAlign: 'center', textDecoration: 'none' }}>X</a>
          </div>
        </div>
      )}

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
