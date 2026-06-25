import { CLOSURE_CMD, CLOSURE_LIMITS, CLOSURE_DURATIONS, DANCE_SUPPORTED, MODEL_CLOSURES } from './tesla-channels'
import type { ModelDefinition, LightZone, ClosureFamily } from './tesla-channels'
import type { TeslaModel } from './supabase'

export interface AudioAnalysisResult {
  frames: Uint8Array[]
  triggerFrames: Set<number>
  bpm: number
  // Normalized amplitude envelope at 100fps (10ms windows) for waveform display.
  waveformData: Float32Array
  // Auto-build: the vibe preset the song best fits, and whether it has clear drops
  // worth choreographing closures to (suggest-and-confirm, since the car moves).
  suggestedPreset: string
  closuresRecommended: boolean
  dropCount: number
}

// Rule-based vibe classifier over song features (all preset-independent).
function classifyVibe(f: { bpm: number; bassRatio: number; brightness: number; dynamics: number; transientRate: number; dropCount: number }): string {
  const { bpm, bassRatio, brightness, dynamics, transientRate, dropCount } = f
  if (bpm < 100 && transientRate < 150 && dynamics > 0.11) return 'cinematic' // slow, smooth, swelling
  if (bpm >= 118 && bassRatio > 0.38 && dropCount >= 3 && dynamics > 0.12) return 'edm' // fast, bass-heavy, big drops
  if (bassRatio > 0.42 && bpm < 118) return 'hiphop'                          // 808-forward, mid tempo
  if (transientRate > 200 && bassRatio < 0.4) return 'rock'                    // drum/guitar-driven
  if (brightness > 0.6) return 'pop'                                           // bright, melodic
  return 'balanced'
}

// ─── Phase 1: stereo multi-band spectral engine (runs in browser AND Node) ──────
// Splits the song into bass / mid / high bands for the LEFT and RIGHT channels,
// then maps each band to the matching fixture group on that side of the car.
// Energy sets brightness (0-255), per-band transients add a punch on hits, and a
// song-wide energy envelope scales how busy the show is. Stereo content drives
// organic left/right asymmetry. Band filtering uses a manual biquad (no Web Audio)
// so the SAME analysis produces the preview AND the exported .fseq.

// RBJ-cookbook biquad (matches Web Audio's BiquadFilterNode). Pure JS → universal.
function biquad(data: Float32Array, type: 'lowpass' | 'bandpass' | 'highpass', f0: number, Q: number, fs: number): Float32Array {
  const w0 = 2 * Math.PI * f0 / fs
  const cw = Math.cos(w0), sw = Math.sin(w0)
  const alpha = sw / (2 * Q)
  let b0: number, b1: number, b2: number
  const a0 = 1 + alpha, a1 = -2 * cw, a2 = 1 - alpha
  if (type === 'lowpass') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2 }
  else if (type === 'highpass') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2 }
  else { b0 = alpha; b1 = 0; b2 = -alpha } // bandpass (0 dB peak)
  const nb0 = b0 / a0, nb1 = b1 / a0, nb2 = b2 / a0, na1 = a1 / a0, na2 = a2 / a0
  const out = new Float32Array(data.length)
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < data.length; i++) {
    const x = data[i]
    const y = nb0 * x + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2
    out[i] = y; x2 = x1; x1 = x; y2 = y1; y1 = y
  }
  return out
}

function rms(data: Float32Array, start: number, len: number): number {
  let sum = 0
  for (let i = start; i < start + len && i < data.length; i++) sum += data[i] * data[i]
  return Math.sqrt(sum / len)
}
function frameRms(data: Float32Array, totalFrames: number, frameSize: number): number[] {
  const out: number[] = new Array(totalFrames)
  for (let f = 0; f < totalFrames; f++) out[f] = rms(data, f * frameSize, frameSize)
  return out
}
// Normalize series by a shared 95th-percentile cap (preserves song dynamics + L/R diff).
function normShared(series: number[][], p = 0.95): number[][] {
  const all = ([] as number[]).concat(...series).sort((a, b) => a - b)
  const cap = all[Math.floor(all.length * p)] || 1
  return series.map(s => s.map(v => Math.min(v / cap, 1)))
}
function flux(norm: number[]): number[] {
  const out = new Array(norm.length).fill(0)
  for (let f = 1; f < norm.length; f++) out[f] = Math.max(0, norm[f] - norm[f - 1])
  return out
}

type Side = 'L' | 'R' | 'C'
function sideOf(z: LightZone): Side { return z.nz < -0.12 ? 'L' : z.nz > 0.12 ? 'R' : 'C' }
type Band = 'bass' | 'mid' | 'high' | 'total'
function bandOf(type: string): Band {
  switch (type) {
    case 'headlight': case 'highbeam': case 'fog': case 'tail': case 'brake': return 'bass'
    case 'drl': return 'mid'
    case 'turn_front': case 'turn_rear': case 'marker': return 'high'
    default: return 'total'
  }
}

// ─── Phase 3: structure detection + closure choreography ────────────────────────
// Find the big high-energy sections (choruses/drops) from the smoothed envelope.
function detectSections(totalC: number[], FPS: number): { start: number; end: number; peak: number }[] {
  const n = totalC.length
  const sm = new Array(n).fill(0)
  let acc = 0
  for (let f = 0; f < n; f++) { acc = acc * 0.96 + totalC[f] * 0.04; sm[f] = acc } // ~1.5s smoothing
  const thresh = ([...sm].sort((a, b) => a - b)[Math.floor(n * 0.62)]) || 0.3
  const minLen = Math.round(FPS * 3)
  const out: { start: number; end: number; peak: number }[] = []
  let f = 0
  while (f < n) {
    if (sm[f] > thresh) {
      const start = f; let peak = 0
      while (f < n && sm[f] > thresh * 0.85) { peak = Math.max(peak, sm[f]); f++ }
      if (f - start >= minLen) out.push({ start, end: f, peak })
    } else f++
  }
  return out
}

// Approximate seconds for a closure to fully CLOSE (open durations live in
// CLOSURE_DURATIONS). We hold every command for its full travel time rather than
// firing a brief pulse — a real Model X showed the falcon doors stalling ~1 inch
// in on a 0.6s open "blip" then erroring when the next command arrived. Holding
// the command for the whole travel guarantees the closure actually commits.
const CLOSE_SECONDS: Record<ClosureFamily, number> = {
  liftgate: 4, falcon_doors: 8, front_doors: 3, windows: 4,
  mirrors: 2, door_handles: 2, charge_port: 2,
}

// Auto-choreograph closures — the "exclamation point" on the song's biggest
// moments. Closures bloom open as the band builds, hit fully-open ON the drop,
// dance through the climax, and button up at the end — scaled to the song's genre
// and energy so each show feels written for that track, not stamped from a mold.
//
// Movement GRAMMAR (the safety rules, from real Model-X testing):
//   • Any number of closures may be OPENING at once — a synchronized bloom (falcon
//     + both front doors + trunk all opening together is fine).
//   • A DANCE or CLOSE may NOT overlap an in-progress OPEN — you don't wiggle or
//     shut one closure while another is still swinging open.
//   • On Model X, window motion and door motion are mutually exclusive (false-pinch).
//   • Every command is HELD for its full travel (a brief blip stalls heavy doors).
//
// Layers:
//   1a. CLIMAX BLOOM — on the loudest drop, a genre-sized set of big closures opens
//       in an anticipatory cascade (slow doors start earlier in the build, all land
//       open on the hit), then the dancers dance through the climax.
//   1b. ACCENTS — colorful one-offs (charge-port rainbow, window dance) on the other
//       drops, rotated per song.
//   2.  RHYTHM — mirrors / door-handles fold & pop to the beat (low-risk, exempt
//       from the grammar; carries the groove between the big moments).
//   3.  FINALE — everything buttons up, windows clear of door motion.
// Always inside per-closure command limits + ~30s/≤8s thermal dance budget.
function choreographClosures(frames: Uint8Array[], totalC: number[], FPS: number, model: TeslaModel, zones: LightZone[], maxSections: number, bpm: number): void {
  const all = detectSections(totalC, FPS)
  if (!all.length) return
  const N = frames.length
  const families = MODEL_CLOSURES[model]
  const chOf = (fam: ClosureFamily) => zones.filter(z => z.closure === fam).map(z => z.channel)
  const has = (fam: ClosureFamily) => families.includes(fam) && chOf(fam).length > 0
  const isDoorFam = (fam: ClosureFamily) => fam === 'falcon_doors' || fam === 'front_doors'

  // ── budget bookkeeping ──
  const used: Partial<Record<ClosureFamily, number>> = {}
  const room = (fam: ClosureFamily, n: number) => (used[fam] ?? 0) + n <= CLOSURE_LIMITS[fam]
  const spend = (fam: ClosureFamily, n: number) => { used[fam] = (used[fam] ?? 0) + n }
  const PULSE = Math.round(FPS * 0.6)
  const SETTLE = Math.round(FPS * 2)                             // margin so a closure is fully open before it dances
  const DANCE_TOTAL = Math.round(FPS * 30), DANCE_MAX = Math.round(FPS * 8)
  let danceUsed = 0
  const secs = (fam: ClosureFamily) => Math.round(CLOSURE_DURATIONS[fam] * FPS)   // open travel (frames)
  const write = (ch: number, cmd: keyof typeof CLOSURE_CMD, from: number, len: number) => {
    const v = CLOSURE_CMD[cmd]
    for (let f = Math.max(0, from); f < Math.min(N, from + len); f++) frames[f][ch] = v
  }
  const hold = (fam: ClosureFamily, cmd: keyof typeof CLOSURE_CMD, at: number, len: number) => {
    for (const ch of chOf(fam)) write(ch, cmd, at, len)
  }

  // ── movement grammar ── opens may overlap opens (synchronized bloom); a dance or
  // close may not overlap an in-progress open; on Model X window motion and door
  // motion are mutually exclusive. Mirrors/handles are exempt (low-risk rhythm).
  type Kind = 'open' | 'dance' | 'close'
  const moves: { fam: ClosureFamily; kind: Kind; from: number; to: number }[] = []
  const hit = (pred: (m: { fam: ClosureFamily; kind: Kind }) => boolean, from: number, to: number) =>
    moves.some(m => pred(m) && from < m.to && to > m.from)
  const canPlace = (fam: ClosureFamily, kind: Kind, from: number, to: number) => {
    if (kind === 'open') { if (hit(m => m.kind !== 'open', from, to)) return false }
    else if (hit(m => m.kind === 'open', from, to)) return false
    if (model === 'modelX') {
      if (fam === 'windows' && hit(m => isDoorFam(m.fam), from, to)) return false
      if (isDoorFam(fam) && hit(m => m.fam === 'windows', from, to)) return false
    }
    return true
  }
  const place = (fam: ClosureFamily, kind: Kind, at: number, len: number) => {
    hold(fam, kind, at, len); moves.push({ fam, kind, from: at, to: at + len })
  }

  const byPeak = [...all].sort((a, b) => b.peak - a.peak)
  const byTime = [...all].sort((a, b) => a.start - b.start)
  const topPeak = byPeak[0]?.peak ?? 0
  const seed = (Math.round(bpm) * 2654435761 + all.length * 40503 + Math.round(topPeak * 1e4)) >>> 0
  const drama = Math.max(2, Math.min(8, maxSections))           // genre intensity: cinematic 2 … edm 8
  const opened: ClosureFamily[] = []                            // closures to button up in the finale

  // ════ Layer 1a — CLIMAX BLOOM on the loudest drop ════
  // A genre-sized set of big closures opens in an anticipatory cascade so they all
  // land fully open ON the drop, then the dance-capable ones dance through it.
  const climax = byPeak[0]
  if (climax) {
    const bloom: ClosureFamily[] = []
    if (has('liftgate')) bloom.push('liftgate')                  // graceful trunk — always if present
    if (drama >= 4 && has('falcon_doors')) bloom.push('falcon_doors')
    if (drama >= 5 && has('front_doors')) bloom.push('front_doors')
    const apex = climax.start
    for (const fam of bloom) {                                   // 1) anticipatory opens, all open by the apex
      const openAt = apex - secs(fam) - SETTLE
      if (openAt < PULSE || !room(fam, 2)) continue
      if (!canPlace(fam, 'open', openAt, apex)) continue
      place(fam, 'open', openAt, apex - openAt); spend(fam, 1); opened.push(fam)
    }
    for (const fam of [...opened]) {                             // 2) dance the bloomers through the climax
      if (!DANCE_SUPPORTED.has(fam) || danceUsed >= DANCE_TOTAL || !room(fam, 1)) continue
      const len = Math.min(climax.end - apex, DANCE_MAX, DANCE_TOTAL - danceUsed)
      if (len < FPS || !canPlace(fam, 'dance', apex, apex + len)) continue
      place(fam, 'dance', apex, len); spend(fam, 1); danceUsed += len
    }
  }

  // ════ Layer 1b — ACCENTS on the other drops (rotated per song) ════
  const accents: ClosureFamily[] = (['charge_port', 'windows'] as ClosureFamily[]).filter(has).filter(f => !opened.includes(f))
  const otherDrops = byPeak.slice(1, 1 + Math.max(1, Math.round(drama / 2)))
  let a = accents.length ? seed % accents.length : 0
  for (const sec of otherDrops) {
    if (!accents.length) break
    for (let t = 0; t < accents.length; t++) {
      const fam = accents[(a + t) % accents.length]
      if ((used[fam] ?? 0) > 0) continue                          // each accent used once
      const danceLen = Math.min(sec.end - sec.start, DANCE_MAX, DANCE_TOTAL - danceUsed)
      if (danceLen < FPS || danceUsed >= DANCE_TOTAL) continue
      if (fam === 'windows') {                                    // window dance — no open needed
        if (!room('windows', 2) || !canPlace('windows', 'dance', sec.start, sec.start + danceLen)) continue
        place('windows', 'dance', sec.start, danceLen); spend('windows', 1); danceUsed += danceLen
        opened.push('windows'); a = (a + t + 1) % accents.length; break
      } else {                                                    // charge-port rainbow: open → dance
        const openAt = sec.start - secs('charge_port') - SETTLE
        if (openAt < PULSE || !room('charge_port', 3)) continue
        if (!canPlace('charge_port', 'open', openAt, sec.start) || !canPlace('charge_port', 'dance', sec.start, sec.start + danceLen)) continue
        place('charge_port', 'open', openAt, sec.start - openAt); spend('charge_port', 1)
        place('charge_port', 'dance', sec.start, danceLen); spend('charge_port', 1); danceUsed += danceLen
        opened.push('charge_port'); a = (a + t + 1) % accents.length; break
      }
    }
  }

  // ════ Layer 2 — rhythm closures: mirrors + door handles flap to the beat ════
  // Big budgets, low risk → the main per-song movement. Each command is held for
  // its full ~2s travel; we cap well under the limit so it stays musical, not
  // machine-gun. Mirrors aren't a pinch risk, so they may move during door motion.
  if (bpm > 0) {
    const fpb = (60 / bpm) * FPS
    const half = Math.max(Math.round(FPS * 2), Math.round(fpb * 2))    // ≥2s per fold/unfold, beat-aligned
    for (const fam of ['mirrors', 'door_handles'] as ClosureFamily[]) {
      if (!has(fam)) continue
      const cap = Math.min(CLOSURE_LIMITS[fam] - 1, 12)                 // headroom + taste
      for (const sec of byTime) {
        if (sec.peak < topPeak * 0.55) continue                        // only the energetic sections
        for (let t = sec.start; t + half * 2 < sec.end; t += half * 2) {
          if ((used[fam] ?? 0) + 2 > cap) break
          hold(fam, 'open', Math.round(t), half); spend(fam, 1)
          hold(fam, 'close', Math.round(t + half), half); spend(fam, 1)
        }
      }
    }
  }

  // ════ Layer 3 — finale: everything fully CLOSED ~1s before the song ends ════
  // Each closure takes a different time to shut (falcon 8s, liftgate 4s, front 3s,
  // windows 4s, charge-port 2s), so we fire each close at end − (its close travel)
  // − buffer, holding the command for the full travel, so it finishes just before
  // the music stops. On Model X the windows finish closing BEFORE the doors begin
  // their close motion (window-vs-door rule). A close never starts before that
  // closure's own open/dance has finished.
  const BUFFER = Math.round(FPS * 1)                                  // ~1s margin (durations are approximate)
  const GAP = Math.round(FPS * 1)
  const closeF = (fam: ClosureFamily) => Math.round(CLOSE_SECONDS[fam] * FPS)
  const toClose = [...new Set(opened)]
  // earliest door-close start (longest-closing door) — windows must be done before this
  const doorCloseStart = toClose.filter(isDoorFam).reduce((m, f) => Math.min(m, N - closeF(f) - BUFFER), N)
  for (const fam of toClose) {
    if (!room(fam, 1)) continue
    const cf = closeF(fam)
    let at = N - cf - BUFFER                                          // finish ~1s before the end
    if (fam === 'windows' && model === 'modelX' && doorCloseStart < N)
      at = Math.min(at, doorCloseStart - GAP - cf)                    // …and clear of the doors' close motion
    const ownEnd = moves.filter(m => m.fam === fam).reduce((mx, m) => Math.max(mx, m.to), 0)
    at = Math.max(0, Math.max(at, ownEnd))                           // never close before its own open/dance ends
    at = Math.min(at, N - 1)
    place(fam, 'close', at, cf); spend(fam, 1)
  }
}

// ─── Phase 4: genre/vibe presets that retune the mapping ────────────────────────
// bassWeight: how hard bass-driven fixtures hit · punch: transient emphasis ·
// sparkle: high-band (turns/markers) intensity · contrast: gamma (lower = darker
// builds, more explosive peaks) · closureSections: how many drops trigger closures.
export interface MixParams {
  bassWeight: number; punch: number; sparkle: number; contrast: number; closureSections: number
  phrasing: number  // strength of beat-synced structure: L↔R ping-pong + L→R sweep (0 = off)
}
export const MIX_PRESETS: Record<string, MixParams> = {
  balanced:  { bassWeight: 1.0,  punch: 1.0, sparkle: 1.0,  contrast: 0.72, closureSections: 6, phrasing: 0.5 }, // = original feel
  edm:       { bassWeight: 1.3,  punch: 1.5, sparkle: 1.3,  contrast: 0.62, closureSections: 8, phrasing: 0.9 }, // big drops, lots of movement
  hiphop:    { bassWeight: 1.45, punch: 1.3, sparkle: 0.85, contrast: 0.70, closureSections: 4, phrasing: 0.6 }, // 808-forward
  rock:      { bassWeight: 1.05, punch: 1.6, sparkle: 1.1,  contrast: 0.74, closureSections: 4, phrasing: 0.7 }, // punchy drums
  pop:       { bassWeight: 1.0,  punch: 1.1, sparkle: 1.25, contrast: 0.78, closureSections: 4, phrasing: 0.7 }, // bright, melodic
  cinematic: { bassWeight: 0.85, punch: 0.7, sparkle: 0.8,  contrast: 0.85, closureSections: 2, phrasing: 0.2 }, // smooth, minimal
}

// ─── Phase 2: musical phrasing + deliberate asymmetry ───────────────────────────
// Layered on top of the reactive base, aligned to the beat grid (anchored to the
// first detected onset). Two effects: (1) ping-pong — the accent fixtures (turn
// signals + markers) alternate LEFT↔RIGHT each beat; (2) sweep — a highlight runs
// L→R across the front/rear bars over two beats. Both gated by energy (so quiet
// parts stay calm) and scaled by the vibe's `phrasing`.
function applyPhrasing(frames: Uint8Array[], totalC: number[], bpm: number, FPS: number, zones: LightZone[], phrasing: number, anchor: number): void {
  if (phrasing <= 0) return
  const fpb = Math.max(1, (60 / bpm) * FPS)
  const lights = zones.filter(z => z.type !== 'closure')
  const span = fpb * 2 // sweep period = 2 beats
  for (let f = 0; f < frames.length; f++) {
    const energy = totalC[f]
    if (energy < 0.15) continue
    const rel = f - anchor
    const beatIdx = Math.floor(rel / fpb)
    const ppSide = beatIdx % 2 === 0 ? -1 : 1                          // accents fire this side this beat
    const head = -1 + 2 * (((rel % span) + span) % span) / span        // sweep head -1(L)→+1(R)
    for (const z of lights) {
      const ch = z.channel
      let v = frames[f][ch]
      if (z.type === 'turn_front' || z.type === 'turn_rear' || z.type === 'marker') {
        const onSide = Math.abs(z.nz) < 0.12 || (z.nz < 0 ? ppSide < 0 : ppSide > 0)
        if (!onSide) v = Math.round(v * (1 - phrasing * 0.75))         // suppress the off-side → L↔R bounce
      } else if (z.type === 'drl' || z.type === 'headlight' || z.type === 'tail') {
        const near = Math.max(0, 1 - Math.abs(z.nz - head) * 2)        // highlight near the moving head
        v = Math.min(255, v + Math.round(near * phrasing * energy * 170))
      }
      frames[f][ch] = v
    }
  }
}

// Phase 4: cinematic ramping on the Inner Main Beam (channels 2 & 3) — the one
// light Tesla ramps on EVERY supported model (S/X/3/Y/CT). Where the engine holds
// the beam on through a sustained, CALM passage we swap the instant-on for a 2s
// fade-up and trail a 2s fade-down into the gap after — a gentle swell instead of
// a snap. Short or busy sections stay instant/punchy.
//
// The ramp command values come straight from Tesla's xLights guide (0-255 scale).
// We pick the ON ramp so it COMPLETES within the on-run (a 2s ramp on a 0.6s run
// would only reach ~30% then cut — a dim flicker; worse than instant):
//   on; 500ms = 178 (70%)  ·  on; 1000ms = 204 (80%)  ·  on; 2000ms = 229 (90%)
//   off; 2000ms = 76 (30%)  ← graceful fade-out tail
// These degrade gracefully on cars/channels WITHOUT ramping (178/204/229 all read
// as ON since >50%, 76 as OFF since <50%) — so a non-ramping vehicle renders the
// exact same on/off show. Zero-regression against the validated behavior; only
// ramp-capable cars gain the fade.
//
// (Channels 4-6 also ramp on S/X/3/Y but with a fiddly "Channel 4 sets the
//  duration for all three" leader rule — deferred to a follow-up after the inner
//  beam is validated on a real car.)
const RAMP_OFF = 76
function applyRamping(frames: Uint8Array[], density: number[], FPS: number): void {
  const N = frames.length
  if (!N) return
  const ON = 127                          // engine "on" threshold
  const minRun = Math.round(FPS * 0.6)    // "sustained" = held >= ~0.6s (ramp can finish)
  const tail = Math.round(FPS * 2.0)      // 2s graceful fade-out window
  for (const ch of [2, 3]) {              // L / R inner main beam
    let f = 0
    while (f < N) {
      if (frames[f][ch] <= ON) { f++; continue }
      let e = f
      while (e < N && frames[e][ch] > ON) e++   // extent of this on-run
      const runLen = e - f
      // Fade only a SUSTAINED beam that's emerging from a calmer moment — a swell.
      // A beam snapping on mid-drop (high density at the onset) stays instant/punchy.
      const emerging = (density[f] ?? 0) < 0.5
      if (runLen >= minRun && emerging) {
        // Pick the longest ramp that still finishes inside the run, so the beam
        // actually reaches full brightness before the run ends.
        const onVal = runLen >= FPS * 2.05 ? 229 : runLen >= FPS * 1.05 ? 204 : 178
        for (let k = f; k < e; k++) frames[k][ch] = onVal           // fade up + hold
        for (let k = e; k < Math.min(N, e + tail); k++) {            // fade down...
          if (frames[k][ch] > ON) break                             // ...unless it re-fires
          frames[k][ch] = RAMP_OFF
        }
      }
      f = e
    }
  }
}

// Core engine — takes raw channel data. Works in the browser and on the server.
export function analyzePCM(
  left: Float32Array, right: Float32Array, sampleRate: number,
  zones: LightZone[], channelCount: number,
  opts?: { autoClosures?: boolean; model?: TeslaModel; preset?: string },
): AudioAnalysisResult {
  const P = MIX_PRESETS[opts?.preset ?? 'balanced'] ?? MIX_PRESETS.balanced
  const FPS = 50
  const frameSize = Math.floor(sampleRate / FPS)
  const totalFrames = Math.max(1, Math.floor(Math.min(left.length, right.length) / frameSize))

  // Band-filter each channel, then per-frame RMS, normalized per band across L+R.
  const [bN_L, bN_R] = normShared([
    frameRms(biquad(left, 'lowpass', 160, 1.0, sampleRate), totalFrames, frameSize),
    frameRms(biquad(right, 'lowpass', 160, 1.0, sampleRate), totalFrames, frameSize),
  ])
  const [mN_L, mN_R] = normShared([
    frameRms(biquad(left, 'bandpass', 1000, 1.1, sampleRate), totalFrames, frameSize),
    frameRms(biquad(right, 'bandpass', 1000, 1.1, sampleRate), totalFrames, frameSize),
  ])
  const [hN_L, hN_R] = normShared([
    frameRms(biquad(left, 'highpass', 4500, 0.8, sampleRate), totalFrames, frameSize),
    frameRms(biquad(right, 'highpass', 4500, 0.8, sampleRate), totalFrames, frameSize),
  ])

  const avg = (a: number[], b: number[]) => a.map((v, i) => (v + b[i]) / 2)
  const bN_C = avg(bN_L, bN_R), mN_C = avg(mN_L, mN_R), hN_C = avg(hN_L, hN_R)
  const totalC = bN_C.map((v, i) => Math.min(1, (v + mN_C[i] + hN_C[i]) / 2.2))

  const E: Record<Band, Record<Side, number[]>> = {
    bass: { L: bN_L, R: bN_R, C: bN_C },
    mid: { L: mN_L, R: mN_R, C: mN_C },
    high: { L: hN_L, R: hN_R, C: hN_C },
    total: { L: totalC, R: totalC, C: totalC },
  }
  const O: Record<Band, number[]> = { bass: flux(bN_C), mid: flux(mN_C), high: flux(hN_C), total: flux(totalC) }

  // Density envelope (how busy the show should be right now).
  const density: number[] = new Array(totalFrames).fill(0)
  { let acc = 0; for (let f = 0; f < totalFrames; f++) { acc = acc * 0.92 + totalC[f] * 0.08; density[f] = Math.min(1, acc * 1.6) } }

  // BPM via autocorrelation of the onset envelope.
  const onset = O.bass.map((v, i) => v * 0.7 + O.mid[i] * 0.3)
  let bpm = 120
  {
    const minLag = Math.round(FPS * 60 / 180), maxLag = Math.round(FPS * 60 / 60)
    const corrs: number[] = []
    let bestLag = 0, bestCorr = -1
    for (let lag = minLag; lag <= maxLag; lag++) {
      let corr = 0
      for (let f = 0; f + lag < totalFrames; f++) corr += onset[f] * onset[f + lag]
      corr /= (totalFrames - lag)
      corrs[lag] = corr
      if (corr > bestCorr) { bestCorr = corr; bestLag = lag }
    }
    // Octave correction: autocorrelation favors sub-harmonics — it locks onto the
    // HALF tempo because every other beat also aligns, so a ~130 BPM song reads as
    // ~65. If the half-lag (double BPM) still correlates nearly as strongly, that's
    // the real tempo — prefer it. The 0.80 threshold leaves genuinely slow songs
    // (where the double-tempo lag is weak) alone.
    let lag = bestLag
    const half = Math.round(bestLag / 2)
    if (half >= minLag && corrs[half] !== undefined && corrs[half] >= bestCorr * 0.80) lag = half
    if (lag > 0) bpm = Math.max(60, Math.min(200, Math.round(60 / (lag / FPS))))
  }
  const beatFrames = (60 / bpm) * FPS

  // Peak-pick onsets for the timeline beat markers.
  const triggerFrames = new Set<number>()
  {
    const W = 8, minGap = Math.max(4, Math.floor(beatFrames * 0.5))
    let last = -minGap
    for (let f = 2; f < totalFrames - 2; f++) {
      let s = 0, n = 0
      for (let k = f - W; k <= f + W; k++) if (k >= 0 && k < totalFrames) { s += onset[k]; n++ }
      const peak = onset[f] > onset[f - 1] && onset[f] >= onset[f + 1]
      if (peak && onset[f] > (s / n) * 1.8 + 0.03 && f - last >= minGap) { triggerFrames.add(f); last = f }
    }
  }

  // Build frames: each fixture glows with its band's energy on its own side,
  // punched by transients, gated by density — shaped by the chosen vibe preset.
  const curve = (v: number) => Math.pow(Math.min(1, Math.max(0, v)), P.contrast)
  const frames: Uint8Array[] = Array.from({ length: totalFrames }, (_, f) => {
    const frame = new Uint8Array(channelCount)
    const dens = density[f]
    zones.forEach(zone => {
      if (zone.type === 'closure') return
      const band = bandOf(zone.type), side = sideOf(zone)
      const energy = E[band][side][f]
      const punch = O[band][f]
      let b: number
      switch (zone.type) {
        case 'turn_front': case 'turn_rear': b = punch * 1.5 * P.sparkle * (0.4 + 0.6 * dens); break
        case 'marker': b = (energy * 0.45 + punch * 0.9) * P.sparkle * (0.3 + 0.7 * dens); break
        case 'drl': case 'highbeam': b = energy * 0.95 + punch * 0.5 * P.punch; break
        default: b = (energy * 0.9 + punch * 1.0 * P.punch) * P.bassWeight; break
      }
      frame[zone.channel] = Math.round(curve(b) * 255)
    })
    return frame
  })

  // Phase 2: layer beat-synced phrasing (ping-pong + sweep) over the reactive base.
  applyPhrasing(frames, totalC, bpm, FPS, zones, P.phrasing, triggerFrames.size ? Math.min(...triggerFrames) : 0)

  // Phase 3: auto-choreograph closures to the song structure (opt-in per show).
  if (opts?.autoClosures && opts.model) choreographClosures(frames, totalC, FPS, opts.model, zones, P.closureSections, bpm)

  // Phase 4: graceful ramping on the inner main beam (cinematic fades; runs last
  // so it sees the final on/off pattern). Degrades to the same on/off show on
  // cars without ramping, so it's safe across every model.
  applyRamping(frames, density, FPS)

  // High-res amplitude envelope for the waveform display.
  const WF_FPS = 100
  const wfFrameSize = Math.floor(sampleRate / WF_FPS)
  const wfTotal = Math.floor(left.length / wfFrameSize)
  const wfRaw: number[] = new Array(wfTotal)
  for (let f = 0; f < wfTotal; f++) wfRaw[f] = rms(left, f * wfFrameSize, wfFrameSize)
  const [wfNorm] = normShared([wfRaw])

  // ── Auto-build: classify the song's vibe + whether closures fit ──
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length)
  const bM = mean(bN_C), mM = mean(mN_C), hM = mean(hN_C), tM = mean(totalC)
  const denom = bM + mM + hM + 1e-6
  const dynamics = Math.sqrt(mean(totalC.map(v => (v - tM) * (v - tM))))
  const dropCount = detectSections(totalC, FPS).length
  const features = {
    bpm,
    bassRatio: bM / denom,
    brightness: (mM + hM) / denom,
    dynamics,
    transientRate: triggerFrames.size / Math.max(0.1, totalFrames / FPS / 60),
    dropCount,
  }
  const suggestedPreset = classifyVibe(features)
  const closuresRecommended = dropCount >= 2 && dynamics > 0.1

  return { frames, triggerFrames, bpm, waveformData: new Float32Array(wfNorm), suggestedPreset, closuresRecommended, dropCount }
}

// Browser entry point — pulls L/R out of the decoded AudioBuffer.
export async function analyzeAudioToFrames(
  audioBuffer: AudioBuffer, modelDef: ModelDefinition,
  opts?: { autoClosures?: boolean; model?: TeslaModel; preset?: string },
): Promise<AudioAnalysisResult> {
  const L = audioBuffer.getChannelData(0)
  const R = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : L
  return analyzePCM(L, R, audioBuffer.sampleRate, modelDef.zones, modelDef.channelCount, opts)
}
