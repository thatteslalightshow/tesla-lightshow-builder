import { CLOSURE_CMD, CLOSURE_LIMITS, CLOSURE_DURATIONS, DANCE_SUPPORTED, MODEL_CLOSURES, INTERIOR_RGB } from './tesla-channels'
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
function choreographClosures(frames: Uint8Array[], totalC: number[], density: number[], triggers: number[], FPS: number, model: TeslaModel, zones: LightZone[], maxSections: number, bpm: number, anchor: number): void {
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
  // FALCON DOORS — never command both on the same frame. Two real-car tests faulted
  // one falcon door on byte-identical L/R commands, and the FAILING SIDE SWITCHED
  // run-to-run → it's simultaneous-actuation arbitration (the heavy double-hinged
  // doors + pinch sensors can't both swing at the exact same instant via a show),
  // NOT hardware. So we offset the 2nd falcon door by a few seconds — the car's own
  // button-press sequences them the same way. Front doors move together fine (lighter).
  const FALCON_STAGGER = Math.round(FPS * 3.5)
  const falconStag = (fam: ClosureFamily, i: number) => (fam === 'falcon_doors' ? i * FALCON_STAGGER : 0)
  let danceUsed = 0
  const secs = (fam: ClosureFamily) => Math.round(CLOSURE_DURATIONS[fam] * FPS)   // open travel (frames)
  const write = (ch: number, cmd: keyof typeof CLOSURE_CMD, from: number, len: number) => {
    const v = CLOSURE_CMD[cmd]
    for (let f = Math.max(0, from); f < Math.min(N, from + len); f++) frames[f][ch] = v
  }
  const hold = (fam: ClosureFamily, cmd: keyof typeof CLOSURE_CMD, at: number, len: number) => {
    chOf(fam).forEach((ch, i) => write(ch, cmd, at + falconStag(fam, i), len))   // falcon L/R offset
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
    hold(fam, kind, at, len)
    moves.push({ fam, kind, from: at, to: at + len + falconStag(fam, chOf(fam).length - 1) })  // cover the staggered tail
  }

  // ── musical landmarks (the SAME grid + onset hits the lights choreograph to) ──
  // beat = frames per beat; bars(n) = n-bar phrase length in frames (4 beats/bar).
  const beat = bpm > 0 ? (60 / bpm) * FPS : FPS / 2
  const bars = (n: number) => Math.max(1, Math.round(n * 4 * beat))
  // Snap a frame to the nearest real onset within ±win so a gesture lands ON the hit
  // rather than where a smoothed envelope happened to cross threshold.
  const snap = (f: number, win: number) => {
    let best = f, bd = win + 1
    for (const t of triggers) { const d = Math.abs(t - f); if (d <= win && d < bd) { bd = d; best = t } }
    return best
  }
  // Quantize a length to a whole number of beats (≥1) so dances resolve on the grid.
  const qbeat = (len: number) => Math.max(Math.round(beat), Math.round(len / beat) * beat)

  // Each section's true musical hit = its start snapped to the nearest strong onset.
  const drops = all.map(s => ({ ...s, hit: snap(s.start, Math.round(beat * 0.9)) }))
  const byPeak = [...drops].sort((a, b) => b.peak - a.peak)
  const byTime = [...drops].sort((a, b) => a.start - b.start)
  const topPeak = byPeak[0]?.peak ?? 0
  const seed = (Math.round(bpm) * 2654435761 + all.length * 40503 + Math.round(topPeak * 1e4)) >>> 0
  const drama = Math.max(2, Math.min(8, maxSections))           // genre intensity: cinematic 2 … edm 8
  const opened: ClosureFamily[] = []                            // closures to button up in the finale

  // ════ Layer 1 — a varied GESTURE on each strong drop ════
  // The loudest drop gets the full genre-sized door bloom; the rest rotate between a
  // smaller door bloom and a colorful accent (charge-port rainbow / window dance) so
  // each track gets its own signature, every strong moment feels intentional, and no
  // drop is left dead on cars without powered doors. Slow closures start their travel
  // early so they land fully open ON the hit; dance-capable ones dance a whole-phrase
  // window. All within budget (open + dance + a reserved finale close).
  const D = byPeak.length
  const nBlooms = Math.max(1, Math.min(Math.round(drama / 3) + 1, Math.ceil(D / 2)))
  const maxDrops = Math.min(D, nBlooms + Math.max(1, Math.round(drama / 2)))
  const accentPool: ClosureFamily[] = (['charge_port', 'windows'] as ClosureFamily[]).filter(has)
  let ai = accentPool.length ? seed % accentPool.length : 0

  byPeak.slice(0, maxDrops).forEach((drop, di) => {
    const apex = drop.hit
    const isClimax = di === 0

    // 1) DOOR/TRUNK BLOOM on the loudest drops (anticipatory open → land open on the hit)
    if (di < nBlooms) {
      const bloom: ClosureFamily[] = []
      if (isClimax && has('liftgate')) bloom.push('liftgate')          // trunk leads the climax
      if (isClimax) {
        if (drama >= 4 && has('falcon_doors')) bloom.push('falcon_doors')
        if (drama >= 5 && has('front_doors')) bloom.push('front_doors')
      } else if (drama >= 5) {                                          // secondary: one alternating door
        if (di % 2 === 1 && has('front_doors')) bloom.push('front_doors')
        else if (has('falcon_doors')) bloom.push('falcon_doors')
      }
      const justOpened: ClosureFamily[] = []
      for (const fam of bloom) {
        // extra lead for falcon so the offset 2nd door is also fully open by the apex
        const openAt = apex - secs(fam) - SETTLE - falconStag(fam, chOf(fam).length - 1)
        if (openAt < PULSE || !room(fam, 2)) continue                  // reserve a finale close
        if (!canPlace(fam, 'open', openAt, apex)) continue
        place(fam, 'open', openAt, apex - openAt); spend(fam, 1); opened.push(fam); justOpened.push(fam)
      }
      for (const fam of justOpened) {                                  // dance a whole-phrase window
        if (!DANCE_SUPPORTED.has(fam) || danceUsed >= DANCE_TOTAL || !room(fam, 1)) continue
        const len = Math.min(qbeat(Math.min(drop.end - apex, bars(isClimax ? 2 : 1))), DANCE_MAX, DANCE_TOTAL - danceUsed)
        if (len < FPS || !canPlace(fam, 'dance', apex, apex + len)) continue
        place(fam, 'dance', apex, len); spend(fam, 1); danceUsed += len
      }
      if (justOpened.length) return                                    // the bloom claimed this drop
    }

    // 2) otherwise (or if this car has no doors to bloom) → a colorful ACCENT, rotated
    if (!accentPool.length) return
    for (let t = 0; t < accentPool.length; t++) {
      const fam = accentPool[(ai + t) % accentPool.length]
      if ((used[fam] ?? 0) > 0) continue                               // each accent used once
      const danceLen = Math.min(qbeat(Math.min(drop.end - apex, bars(1))), DANCE_MAX, DANCE_TOTAL - danceUsed)
      if (danceLen < FPS || danceUsed >= DANCE_TOTAL) continue
      if (fam === 'windows') {                                         // window dance — no open needed
        if (!room('windows', 2) || !canPlace('windows', 'dance', apex, apex + danceLen)) continue
        place('windows', 'dance', apex, danceLen); spend('windows', 1); danceUsed += danceLen
        opened.push('windows'); ai = (ai + t + 1) % accentPool.length; return
      } else {                                                         // charge-port rainbow: open → dance
        const openAt = apex - secs('charge_port') - SETTLE
        if (openAt < PULSE || !room('charge_port', 3)) continue
        if (!canPlace('charge_port', 'open', openAt, apex) || !canPlace('charge_port', 'dance', apex, apex + danceLen)) continue
        place('charge_port', 'open', openAt, apex - openAt); spend('charge_port', 1)
        place('charge_port', 'dance', apex, danceLen); spend('charge_port', 1); danceUsed += danceLen
        opened.push('charge_port'); ai = (ai + t + 1) % accentPool.length; return
      }
    }
  })

  // ════ Layer 2 — rhythm closures: mirrors + door handles flap ON the grid ════
  // The main per-song movement. Each fold is still HELD for its full ~2s travel, but
  // now it's anchored to the SONG'S beat grid (not a free-running 2s metronome) and
  // the pop snaps to the nearest real onset — so the groove locks to the track. We use
  // the smallest whole-beat period that still clears the ~2s travel, and cap under the
  // limit so it stays musical. Mirrors aren't a pinch risk → may move during doors.
  if (beat > 0) {
    const travel = Math.round(FPS * 2)                                 // 2s mirror/handle travel
    let period = beat
    while (period < travel) period += beat                             // whole beats, ≥ travel
    for (const fam of ['mirrors', 'door_handles'] as ClosureFamily[]) {
      if (!has(fam)) continue
      const cap = Math.min(CLOSURE_LIMITS[fam] - 1, 12)                 // headroom + taste
      for (const sec of byTime) {
        if (sec.peak < topPeak * 0.55) continue                        // only the energetic sections
        // first grid position at/after the section start, anchored to the song's grid
        let g = anchor + Math.ceil((sec.start - anchor) / period) * period
        for (; g + period * 2 < sec.end; g += period * 2) {
          if ((used[fam] ?? 0) + 2 > cap) break
          if ((density[Math.min(density.length - 1, Math.max(0, Math.round(g)))] ?? 1) < 0.25) continue  // stay calm through breakdowns
          const t = snap(g, Math.round(beat * 0.4))                    // pop on the real hit near the grid
          hold(fam, 'open', Math.round(t), period); spend(fam, 1)
          hold(fam, 'close', Math.round(t + period), period); spend(fam, 1)
        }
      }
    }
  }

  // ════ Layer 3 — finale: everything fully CLOSED ~1s before the song ends ════
  // Each closure takes a different time to shut (falcon 8s, liftgate 4s, front 3s,
  // windows 4s, charge-port 2s), so we fire each close at end − (its close travel)
  // − buffer, holding the command for the full travel, so it finishes just before
  // the music stops. The WINDOWS close LAST — after the doors are fully shut — so
  // the cabin music stays audible outside through the door finale (and that also
  // honors the Model-X window-vs-door rule, since windows then move only once door
  // motion is done). A close never starts before that closure's own open/dance ends.
  const BUFFER = Math.round(FPS * 1)                                  // ~1s margin (durations are approximate)
  const GAP = Math.round(FPS * 1.5)                                   // settle time between door close and window close
  const closeF = (fam: ClosureFamily) => Math.round(CLOSE_SECONDS[fam] * FPS)
  const toClose = [...new Set(opened)]
  const windowsLast = toClose.includes('windows') && model === 'modelX' && toClose.some(isDoorFam)
  const windowsStart = N - closeF('windows') - BUFFER                // windows finish ~1s before the end
  // Doors wrap up before the windows move. On Model X the 2nd falcon door is offset by
  // FALCON_STAGGER, so its close finishes that much later — clear the staggered tail too,
  // or the still-closing falcon overlaps the window close (a false-pinch that halts the show).
  const falconTail = toClose.includes('falcon_doors') ? FALCON_STAGGER : 0
  const doorFinishBy = windowsLast ? windowsStart - GAP - falconTail : N - BUFFER
  for (const fam of toClose) {
    if (!room(fam, 1)) continue
    const cf = closeF(fam)
    let at = (isDoorFam(fam) && windowsLast) ? doorFinishBy - cf      // doors close first…
      : N - cf - BUFFER                                              // …windows (last) + liftgate/charge-port finish ~1s before end
    const ownEnd = moves.filter(m => m.fam === fam).reduce((mx, m) => Math.max(mx, m.to), 0)
    at = Math.min(Math.max(0, Math.max(at, ownEnd)), N - 1)          // never before its own open/dance; keep in-bounds
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

// HSV (h in degrees, s/v in 0-1) → R,G,B 0-255. For the interior color wash.
function hsv2rgb(h: number, s: number, v: number): [number, number, number] {
  h = ((h % 360) + 360) % 360
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x } else if (h < 120) { r = x; g = c } else if (h < 180) { g = c; b = x }
  else if (h < 240) { g = x; b = c } else if (h < 300) { r = x; b = c } else { r = c; b = x }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

// Phase 5: INTERIOR RGB — a music-reactive color wash across the cabin (the center
// screen + 5 accent segments, channels 175-192). The hue evolves with the song:
// each detected section gets its own color identity (a fresh color when the beat
// drops), nudged by the spectral balance (bass→warm, treble→cool) and a slow drift
// so it's never static. Brightness pulses with per-side energy (left segments to
// the left channel, right to the right) and the screen rides brightest. Purely
// additive on dedicated channels — cars without accent lights just ignore them, so
// this can't touch the validated exterior show.
function choreographInteriorRGB(
  frames: Uint8Array[], E: Record<Band, Record<Side, number[]>>, totalC: number[],
  density: number[], FPS: number, seed: number,
): void {
  const N = frames.length
  if (!N) return
  const baseHue = seed % 360
  // a distinct hue offset per section, stepped at each drop
  const secHue = new Array<number>(N).fill(0)
  const sections = detectSections(totalC, FPS)
  for (let i = 0; i < sections.length; i++) {
    const off = (i * 67) % 360                                   // ~golden spacing → varied, non-repeating colors
    for (let f = sections[i].start; f < (sections[i + 1]?.start ?? N); f++) secHue[f] = off
  }
  const sideE = (side: Side, f: number) => Math.min(1, (E.bass[side][f] + E.mid[side][f] + E.high[side][f]) / 2.2)
  for (let f = 0; f < N; f++) {
    const tilt = E.high.C[f] - E.bass.C[f]                       // −1 (bassy) … +1 (bright)
    const drift = (f / FPS) * 6                                  // ~6°/s gentle hue drift
    const sat = Math.max(0.5, Math.min(1, 0.55 + 0.45 * density[f]))
    for (const seg of INTERIOR_RGB) {
      const e = seg.side === 'C' ? totalC[f] : sideE(seg.side, f)
      let val = Math.min(1, 0.16 + 0.9 * e)                      // floor so the cabin always glows a little
      if (seg.display) val = Math.min(1, val * 1.15)             // the screen is brightest
      const hue = baseHue + secHue[f] + drift + tilt * 38 + (seg.side === 'L' ? -16 : seg.side === 'R' ? 16 : 0)
      const [r, g, b] = hsv2rgb(hue, sat, val)
      frames[f][seg.rgb[0]] = r; frames[f][seg.rgb[1]] = g; frames[f][seg.rgb[2]] = b
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
  // Feed it the SAME musical landmarks the lights use: the onset hits + beat anchor.
  if (opts?.autoClosures && opts.model) {
    const triggers = [...triggerFrames].sort((p, q) => p - q)
    const anchor = triggerFrames.size ? Math.min(...triggerFrames) : 0
    choreographClosures(frames, totalC, density, triggers, FPS, opts.model, zones, P.closureSections, bpm, anchor)
  }

  // Phase 4: graceful ramping on the inner main beam (cinematic fades; runs last
  // so it sees the final on/off pattern). Degrades to the same on/off show on
  // cars without ramping, so it's safe across every model.
  applyRamping(frames, density, FPS)

  // Phase 5: interior RGB color wash (additive on channels 175-192 — color on every
  // car's cabin screen, accents where present; never touches the exterior lights).
  choreographInteriorRGB(frames, E, totalC, density, FPS, Math.round(bpm * 7 + totalFrames))

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
