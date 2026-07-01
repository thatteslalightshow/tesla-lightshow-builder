import { CLOSURE_CMD, CLOSURE_LIMITS, CLOSURE_DURATIONS, DANCE_SUPPORTED, MODEL_CLOSURES, INTERIOR_RGB } from './tesla-channels'
import type { ModelDefinition, LightZone, ClosureFamily } from './tesla-channels'
import type { TeslaModel } from './supabase'
import { FFT, hann } from './fft'

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

type Side = 'L' | 'R' | 'C'
function sideOf(z: LightZone): Side { return z.nz < -0.12 ? 'L' : z.nz > 0.12 ? 'R' : 'C' }
type Band = 'bass' | 'mid' | 'high' | 'presence' | 'total'
function bandOf(type: string): Band {
  switch (type) {
    case 'headlight': case 'highbeam': case 'fog': case 'tail': case 'brake': return 'bass'
    case 'drl': return 'mid'
    case 'turn_front': case 'turn_rear': case 'marker': return 'high'
    default: return 'total'
  }
}

// The FRONT "voice" beams — main beams, signature/DRL bars, front fog. These are the fixtures that
// read as "always on": they ride continuous band energy, so they get the sustain-aware hold treatment
// (applyFrontHolds) instead of the fixed tempo envelope. nx > 0.5 keeps it to FRONT-facing fixtures,
// so the rear fog (same 'fog' type, nx < 0) and the rear/tail cluster are untouched.
function isFrontBeam(z: LightZone): boolean {
  return (z.type === 'headlight' || z.type === 'highbeam' || z.type === 'drl' || z.type === 'fog') && z.nx > 0.5
}

// FFT-based per-band SPECTRAL-FLUX onset detection (SuperFlux-style). RMS loudness can't see
// fast RE-ARTICULATED notes (e.g. tremolo-picked guitar) because the level barely moves — but the
// SPECTRUM changes on every new note. We STFT a mono, down-sampled mix and sum the positive
// frame-to-frame magnitude change per band, with a frequency max-filter so vibrato/tremolo doesn't
// smear it. Returns onset strength per band, max-pooled onto the engine's FPS grid + normalized 0-1.
// This replaces the old time-domain RMS flux as the onset source for lights/BPM/closures/flourishes.
function spectralOnsets(mono: Float32Array, sr: number, outFrames: number, FPS: number): Record<Band, number[]> {
  const dec = Math.max(1, Math.round(sr / 22050))          // work at ~22kHz (covers guitar/cymbals) for speed
  let m = mono, fs = sr
  if (dec > 1) {                                            // box-average decimate (light anti-alias)
    const len = Math.floor(mono.length / dec)
    const d = new Float32Array(len)
    for (let i = 0; i < len; i++) { let s = 0; for (let k = 0; k < dec; k++) s += mono[i * dec + k]; d[i] = s / dec }
    m = d; fs = sr / dec
  }
  const N = 1024, H = 256, half = N / 2
  const fft = new FFT(N), win = hann(N)
  const re = new Float32Array(N), im = new Float32Array(N)
  const binOf = (hz: number) => Math.max(0, Math.min(half, Math.round(hz * N / fs)))
  const ranges: [Band, number, number][] = [
    ['bass', binOf(20), binOf(160)],
    ['mid', binOf(300), binOf(1400)],
    ['presence', binOf(1400), binOf(5000)],
    ['high', binOf(5000), half],
  ]
  const nf = Math.max(1, Math.floor((m.length - N) / H) + 1)
  const raw: Record<Band, number[]> = { bass: [], mid: [], high: [], presence: [], total: [] }
  const times: number[] = []
  let prev = new Float32Array(half + 1)
  let mag = new Float32Array(half + 1)   // ping-ponged with prev each frame — no per-frame allocation (phone GC)
  for (let t = 0; t < nf; t++) {
    const off = t * H
    for (let i = 0; i < N; i++) { re[i] = (m[off + i] || 0) * win[i]; im[i] = 0 }
    fft.transform(re, im)
    for (let k = 0; k <= half; k++) mag[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k])
    let broad = 0
    const acc: Record<string, number> = { bass: 0, mid: 0, presence: 0, high: 0 }
    for (const [name, lo, hi] of ranges) {
      let s = 0
      for (let k = lo; k < hi; k++) {
        const ref = Math.max(prev[k], prev[k - 1] || 0, prev[k + 1] || 0)   // freq max-filter (vibrato/tremolo-robust)
        const d = mag[k] - ref
        if (d > 0) { s += d; broad += d }
      }
      acc[name] = s
    }
    raw.bass.push(acc.bass); raw.mid.push(acc.mid); raw.presence.push(acc.presence); raw.high.push(acc.high); raw.total.push(broad)
    times.push(off / fs)
    const tmp = prev; prev = mag; mag = tmp   // ping-pong: this frame's mag becomes next frame's prev (mag fully overwritten next iter)
  }
  const toGrid = (arr: number[]) => {                       // STFT rate → engine FPS grid (max-pool)
    const out = new Array<number>(outFrames).fill(0)
    for (let t = 0; t < arr.length; t++) { const f = Math.min(outFrames - 1, Math.floor(times[t] * FPS)); if (arr[t] > out[f]) out[f] = arr[t] }
    return out
  }
  const norm01 = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const p = s[Math.floor(s.length * 0.97)] || 1; return a.map(v => Math.min(1, v / (p || 1))) }
  return {
    bass: norm01(toGrid(raw.bass)), mid: norm01(toGrid(raw.mid)),
    high: norm01(toGrid(raw.high)), presence: norm01(toGrid(raw.presence)),
    total: norm01(toGrid(raw.total)),
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

// The zero-phase-smoothed, percentile-normalized ENERGY envelope in 0..1 (uncentered). It's both the
// fallback arc and the per-section "how loud is this part" source. `structure` = how dynamic the whole
// track is (0 = flat/compressed → the conductor barely touches it; 1 = clearly dynamic).
function energyArc(totalC: number[], FPS: number): { arc: Float64Array; structure: number } {
  const n = totalC.length
  const arc = new Float64Array(n)
  if (!n) return { arc, structure: 0 }
  const coef = Math.exp(-1 / (FPS * 3)) // ~3s time constant → section scale, not beats
  const sm = new Float64Array(n)
  let a = 0
  for (let f = 0; f < n; f++) { a = a * coef + totalC[f] * (1 - coef); sm[f] = a }         // forward
  let b = 0
  for (let f = n - 1; f >= 0; f--) { b = b * coef + sm[f] * (1 - coef); sm[f] = b }         // backward → zero-phase
  const sorted = [...sm].sort((x, y) => x - y)
  const lo = sorted[Math.floor(n * 0.10)] ?? 0
  const hi = sorted[Math.floor(n * 0.90)] ?? 1
  const span = hi - lo
  const structure = Math.min(1, span / 0.28)
  for (let f = 0; f < n; f++) arc[f] = span > 1e-6 ? Math.min(1, Math.max(0, (sm[f] - lo) / span)) : 0.5
  return { arc, structure }
}

// COMPOSED CHOREOGRAPHY — a whole-song intensity ARC in 0..1: low through quiet sections (verses,
// breakdowns), high through loud ones (choruses, drops). It reads the MACRO SECTION structure of the
// track (not just local energy) so the conductor can hold back and bloom across the song:
//   • segment the song with a SELF-SIMILARITY matrix + Foote NOVELTY over coarse TIMBRAL features (so
//     boundaries land where the section actually changes — verse→chorus adds brightness/energy — not just
//     where it gets louder), then
//   • give each section ONE intensity level from its own energy and lay it down as a piecewise arc,
//     smoothed at the seams — so a whole verse reads uniformly calm and a whole chorus uniformly full
//     ("sections have identity"), instead of the arc wandering within a section.
// Falls back to the plain energy arc when the song is too short or has no clear structure. Finally it's
// CENTERED on 0.5 and scaled by how dynamic the song is, so a flat/evenly-loud song stays ~0.5 everywhere.
function buildStructureArc(totalC: number[], E: Record<Band, Record<Side, number[]>>, FPS: number): Float64Array {
  const n = totalC.length
  const out = new Float64Array(n)
  const base = energyArc(totalC, FPS)
  const finish = (raw: Float64Array) => { for (let f = 0; f < n; f++) out[f] = 0.5 + (raw[f] - 0.5) * base.structure; return out }
  if (n < FPS * 12 || base.structure < 0.15) return finish(base.arc) // too short / too flat → energy arc

  // ── coarse timbral features at ~2 fps (sections span tens of seconds), L2-normalized so the matrix
  //    compares TIMBRE (what section this is), energy-invariant ──
  const step = Math.max(1, Math.round(FPS / 2))
  const m = Math.floor(n / step)
  if (m < 8) return finish(base.arc)
  const B = E.bass.C, M = E.mid.C, H = E.high.C
  const fb: number[] = [], fm: number[] = [], fh: number[] = []
  for (let k = 0; k < m; k++) {
    let sb = 0, sm2 = 0, sh = 0
    for (let f = k * step; f < (k + 1) * step && f < n; f++) { sb += B[f]; sm2 += M[f]; sh += H[f] }
    const nrm = Math.hypot(sb, sm2, sh) || 1
    fb.push(sb / nrm); fm.push(sm2 / nrm); fh.push(sh / nrm)
  }
  const sim = (i: number, j: number) => fb[i] * fb[j] + fm[i] * fm[j] + fh[i] * fh[j] // cosine

  // ── Foote novelty: a checkerboard correlation along the diagonal peaks at section boundaries ──
  const w = Math.max(3, Math.round((FPS / step) * 2.5)) // ~2.5s half-window
  const nov = new Float64Array(m)
  for (let k = w; k < m - w; k++) {
    let same = 0, cross = 0, c = 0
    for (let x = 1; x <= w; x++) for (let y = 1; y <= w; y++) {
      same += sim(k - x, k - y) + sim(k + x - 1, k + y - 1)   // both-before + both-after (within-section)
      cross += sim(k - x, k + y - 1) + sim(k + x - 1, k - y)  // before×after (cross-section)
      c++
    }
    nov[k] = (same - cross) / (2 * c)
  }
  const nv = [...nov].filter(v => v > 0).sort((p, q) => p - q)
  const thr = (nv[Math.floor(nv.length * 0.75)] ?? 0) * 0.9
  const minSeg = Math.max(2, Math.round((FPS / step) * 4)) // ≥4s sections
  const bounds: number[] = [0]
  for (let k = w; k < m - w; k++) {
    if (nov[k] > thr && nov[k] >= nov[k - 1] && nov[k] > nov[k + 1] && k - bounds[bounds.length - 1] >= minSeg) bounds.push(k)
  }
  bounds.push(m)
  if (bounds.length <= 2) return finish(base.arc) // no real sections found → energy arc

  // ── each section gets ONE level = the median of the energy arc across it ──
  const coarseLvl = new Float64Array(m)
  for (let s = 0; s < bounds.length - 1; s++) {
    const seg: number[] = []
    for (let k = bounds[s]; k < bounds[s + 1]; k++) seg.push(base.arc[Math.min(n - 1, k * step)])
    seg.sort((p, q) => p - q)
    const lvl = seg[Math.floor(seg.length / 2)] ?? 0.5
    for (let k = bounds[s]; k < bounds[s + 1]; k++) coarseLvl[k] = lvl
  }
  // lay down per frame, then smooth ~0.8s at the seams (zero-phase) so boundaries ease instead of stepping
  const raw = new Float64Array(n)
  for (let f = 0; f < n; f++) raw[f] = coarseLvl[Math.min(m - 1, Math.floor(f / step))]
  const sc = Math.exp(-1 / (FPS * 0.8))
  let a2 = raw[0]; for (let f = 0; f < n; f++) { a2 = a2 * sc + raw[f] * (1 - sc); raw[f] = a2 }
  let b2 = raw[n - 1]; for (let f = n - 1; f >= 0; f--) { b2 = b2 * sc + raw[f] * (1 - sc); raw[f] = b2 }
  return finish(raw)
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
function choreographClosures(frames: Uint8Array[], totalC: number[], density: number[], triggers: number[], FPS: number, model: TeslaModel, zones: LightZone[], maxSections: number, bpm: number, anchor: number, slam: number[]): void {
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

  // ── STRUCTURE: land the bloom on the TRUE drop. detectSections marks a section from a ~1.5s
  // SMOOTHED envelope, so its start LAGS the real hit by up to ~1s — doors would land open a beat
  // late. Re-find the actual slam: the strongest LOW-END onset in a window straddling the section
  // start (searching ~2 bars BEFORE it too, since smoothing delays the crossing — and the drop's
  // defining feature is bass slamming in, which a riser lacks), then snap to the grid. The doors
  // already anticipate by their long travel, so this only sharpens WHAT they land on, nothing else.
  const dropHit = (start: number): number => {
    const lo = Math.max(anchor, start - bars(2)), hi = Math.min(N - 1, start + Math.round(beat))
    let best = start, bv = -1
    for (let f = lo; f <= hi; f++) { const v = slam[f] ?? 0; if (v > bv) { bv = v; best = f } }
    return snap(best, Math.round(beat * 0.5))
  }
  const drops = all.map(s => ({ ...s, hit: dropHit(s.start) }))
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
  // DOORS first: if a late climax forces a collision, we drop the (benign) window close, never a
  // door. Every finale close is routed through canPlace() + a fit check, so a Model X door can never
  // be closing while a window moves, and a close can never truncate or leave the 2nd falcon door open.
  const closeOrder = [...toClose].sort((a, b) => (isDoorFam(b) ? 1 : 0) - (isDoorFam(a) ? 1 : 0))
  for (const fam of closeOrder) {
    if (!room(fam, 1)) continue
    const cf = closeF(fam)
    let at = (isDoorFam(fam) && windowsLast) ? doorFinishBy - cf      // doors close first…
      : N - cf - BUFFER                                              // …windows (last) + liftgate/charge-port finish ~1s before end
    const ownEnd = moves.filter(m => m.fam === fam).reduce((mx, m) => Math.max(mx, m.to), 0)
    at = Math.max(0, Math.max(at, ownEnd))                           // never before its own open/dance
    const tail = falconStag(fam, chOf(fam).length - 1)               // 2nd falcon door's close finishes this much later
    if (at + cf + tail > N - 1) continue                             // no room to finish in time → leave it (safe vs. truncating)
    if (!canPlace(fam, 'close', at, at + cf + tail)) continue        // would collide (Model X window↔door) → skip
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
  expression: number  // per-fixture independence: stereo widen + cascade/chase/ripple in verses,
                      // snapping back to symmetric UNISON on drops (0 = off)
  lead: number      // how hard PICKED/STRUMMED notes (guitar "presence" band ~2.5kHz) drive the lights
  sustain: number   // light hold/release as a fraction of a beat — higher = lights breathe, less strobe
  frontHold: number // FRONT beams only: sustain-aware hold length. The front "voice" beams follow the
                    // real note — a short linear anti-strobe release, extended to a long tail only while a
                    // note is genuinely ringing — so they swell on held notes and ease off in the gaps
                    // instead of a constant DC wash. higher = longer sustains (0 ≈ crisp, no extra hold).
  flourish: number  // signature move strength at big moments (360 chase / symmetric ping-pong)
  density: number   // NEGATIVE SPACE: target fraction of light fixtures lit at once. Pro shows sit ~0.10-0.15
                    // (mostly dark, a few sharp accents) — this dials the sparse "hand-placed" look per vibe.
  composition: number // COMPOSED CHOREOGRAPHY: how much a whole-song intensity ARC shapes the show — hold
                      // back in verses, bloom on choruses, blast real drops. It modulates `density` BEFORE
                      // every consumer (negative space / expression / flourish / ramping / closures), so the
                      // show follows song structure. 0 = pure frame-by-frame reaction (old feel); 1 = fully composed.
  downbeat: number    // MEASURE/PHRASE dynamics: emphasis on the "1" of each bar + a build across each 4-bar
                      // phrase, so the show breathes with the BAR and PHRASE, not just the beat. 0 = off.
}
export const MIX_PRESETS: Record<string, MixParams> = {
  balanced:  { bassWeight: 1.0,  punch: 1.0, sparkle: 1.0,  contrast: 0.72, closureSections: 6, phrasing: 0.5, expression: 0.5,  lead: 0.6,  sustain: 0.6,  frontHold: 0.45, flourish: 0.6, density: 0.82, composition: 0.5, downbeat: 0.45 },  // = original feel
  edm:       { bassWeight: 1.3,  punch: 1.5, sparkle: 1.3,  contrast: 0.62, closureSections: 8, phrasing: 0.9, expression: 0.5,  lead: 0.4,  sustain: 0.45, frontHold: 0.3,  flourish: 0.85, density: 0.90, composition: 0.7, downbeat: 0.7 }, // big drops, lots of movement
  hiphop:    { bassWeight: 1.45, punch: 1.3, sparkle: 0.85, contrast: 0.70, closureSections: 4, phrasing: 0.6, expression: 0.6,  lead: 0.35, sustain: 0.55, frontHold: 0.35, flourish: 0.6, density: 0.80, composition: 0.4, downbeat: 0.55 },  // 808-forward
  rock:      { bassWeight: 1.05, punch: 1.6, sparkle: 1.1,  contrast: 0.74, closureSections: 4, phrasing: 0.7, expression: 0.55, lead: 1.0,  sustain: 0.5,  frontHold: 0.45, flourish: 0.9, density: 0.88, composition: 0.45, downbeat: 0.6 },  // punchy drums + guitar
  pop:       { bassWeight: 1.0,  punch: 1.1, sparkle: 1.25, contrast: 0.78, closureSections: 4, phrasing: 0.7, expression: 0.7,  lead: 0.7,  sustain: 0.6,  frontHold: 0.45, flourish: 0.7, density: 0.80, composition: 0.5, downbeat: 0.5 },  // bright, melodic
  cinematic: { bassWeight: 0.85, punch: 0.7, sparkle: 0.8,  contrast: 0.85, closureSections: 2, phrasing: 0.2, expression: 0.35, lead: 0.5,  sustain: 0.9,  frontHold: 0.8,  flourish: 0.4, density: 0.72, composition: 0.7, downbeat: 0.3 },  // smooth, minimal
  country:   { bassWeight: 1.05, punch: 1.2, sparkle: 1.0,  contrast: 0.74, closureSections: 4, phrasing: 0.6, expression: 0.6,  lead: 0.85, sustain: 0.6,  frontHold: 0.55, flourish: 0.7, density: 0.82, composition: 0.5, downbeat: 0.5 },  // guitar/vocal-forward, warm, mid-energy — steel/vocal SUSTAINS lean on frontHold, less punch/flourish than rock
}

// ─── Phase 2: musical phrasing + deliberate asymmetry ───────────────────────────
// ── BEAT GRID ───────────────────────────────────────────────────────────────────────────────────
// A tempo-TRACKING beat grid, so the phrasing + expression layers stay locked to the actual beats
// even when a song's tempo drifts (live drummers, rubato, ritardando) — where a single fixed BPM
// grid slowly slips out of phase and the moves land off-beat by the last chorus.
//
// It's a BOUNDED corrector: start from the nominal grid (the global beat period) and nudge each beat
// toward the strongest nearby onset, but never more than ~18% of a beat. So on a steady song the
// corrections are ≈0 and the grid is identical to the old fixed grid (the shows you love are
// unchanged); on a drifting song each beat snaps to the real onset and the grid follows the music.
// Returns a CONTINUOUS per-frame beat phase (fractional beats since the anchor), offset so phase==0
// at the anchor — i.e. on a steady song phase[f] === (f-anchor)/beatFrames, exactly as before.
function buildBeatGrid(onset: number[], totalFrames: number, FPS: number, bpm: number, anchor: number): Float64Array {
  const P = Math.max(2, (60 / bpm) * FPS)                 // nominal frames per beat
  const maxCorr = Math.max(1, Math.round(P * 0.18))       // a beat may snap ≤18% of a beat toward an onset
  // lightly smoothed onset so one noisy sample can't grab a beat
  const sm = new Float64Array(totalFrames)
  for (let f = 0; f < totalFrames; f++) sm[f] = onset[f] + 0.5 * (onset[f - 1] || 0) + 0.5 * (onset[f + 1] || 0)
  // place a beat near `nominal`: pick the strongest onset within ±maxCorr, penalizing distance so a
  // weak far onset can't yank the beat; keep the nominal position if there's no real onset nearby.
  const placeBeat = (nominal: number): number => {
    const c0 = Math.round(nominal)
    const lo = Math.max(0, c0 - maxCorr), hi = Math.min(totalFrames - 1, c0 + maxCorr)
    let best = c0, bestScore = -Infinity
    for (let c = lo; c <= hi; c++) {
      const score = sm[c] - (Math.abs(c - nominal) / P) * 0.6
      if (score > bestScore) { bestScore = score; best = c }
    }
    return sm[best] > 0.04 ? best : c0                    // no real onset → keep the steady-grid position
  }
  const fwd: number[] = []
  for (let pos = anchor; pos < totalFrames + P; pos = fwd[fwd.length - 1] + P) fwd.push(placeBeat(pos))
  const back: number[] = []
  for (let pos = anchor - P; pos > -P; pos = back[back.length - 1] - P) back.push(placeBeat(pos))
  // strictly-increasing grid: …back(reversed)… then forward (forward[0] is the anchor beat)
  const grid: number[] = []
  for (const b of [...back.reverse(), ...fwd]) if (grid.length === 0 || b > grid[grid.length - 1]) grid.push(b)
  // index of the anchor beat → phase is offset so phase==0 there (matches the old (f-anchor)/fpb)
  let anchorIdx = 0, bestD = Infinity
  for (let i = 0; i < grid.length; i++) { const d = Math.abs(grid[i] - anchor); if (d < bestD) { bestD = d; anchorIdx = i } }
  const phase = new Float64Array(totalFrames)
  if (grid.length < 2) { for (let f = 0; f < totalFrames; f++) phase[f] = (f - anchor) / P; return phase }
  let gi = 0
  for (let f = 0; f < totalFrames; f++) {
    while (gi < grid.length - 2 && f >= grid[gi + 1]) gi++
    const a = grid[gi], span = Math.max(1, grid[gi + 1] - a)
    phase[f] = (gi - anchorIdx) + (f - a) / span          // continuous fractional beats, 0 at the anchor
  }
  return phase
}

// Phase 2c-bis: MEASURE / PHRASE dynamics (Build 1c facets) — make the show breathe with the BAR and the
// PHRASE, not just the beat. Two gentle brightness modulations, both riding the tempo-tracked beat grid:
//   • DOWNBEAT emphasis — a short lift on the "1" of each 4/4 bar (tapers over ~⅓ beat), so the top of
//     every measure lands a touch harder — the difference between a pulse and a phrase.
//   • PHRASE build — a slow rise across the last stretch of each 4-bar phrase, an anticipation swell into
//     the next downbeat (how pros telegraph a section change).
// It only lifts fixtures the music ALREADY lit (never creates light), is gated by energy (quiet stays
// calm), and runs before negative space so an emphasized "1" can bloom a little fuller. Per-vibe `downbeat`.
function applyMeasureDynamics(frames: Uint8Array[], zones: LightZone[], beatPhase: Float64Array, density: number[], strength: number): void {
  if (strength <= 0) return
  const light = zones.filter(z => z.type !== 'closure')
  const BAR = 4, PHRASE = 16   // 4/4 bar, 4-bar phrase (the common case)
  for (let f = 0; f < frames.length; f++) {
    const ph = beatPhase[f]
    const barPos = ((ph % BAR) + BAR) % BAR
    const downbeat = Math.max(0, 1 - barPos / 0.35)                       // 1 on the "1", gone by ⅓ beat
    const phrasePos = ((((ph % PHRASE) + PHRASE) % PHRASE) / PHRASE)      // 0..1 through the phrase
    const build = Math.pow(phrasePos, 3)                                  // rises only near the phrase end
    const boost = strength * (downbeat * 0.32 + build * 0.20) * (0.4 + 0.6 * density[f])
    if (boost < 0.01) continue
    for (const z of light) {
      const v = frames[f][z.channel]
      if (v < 8) continue                                                 // emphasize what's playing, don't light the dark
      frames[f][z.channel] = Math.min(255, Math.round(v * (1 + boost)))
    }
  }
}

// ── NEGATIVE SPACE ────────────────────────────────────────────────────────────────────────────────
// Hand-crafted shows are SPARSE: measured across 67 pro shows, only ~10–15% of the lights are on at any
// moment (mostly dark, a few sharp accents), while our reactive base lights ~90%. After the layers shape
// the lights, we keep only the K BRIGHTEST fixtures this frame (K = the vibe's `density` target) and dark
// the rest — so any moment reads as deliberately placed. K WIDENS toward "all on" as the song peaks, so
// real drops still blast. This is the single biggest step toward the "someone spent weeks on this" look.
function applyNegativeSpace(frames: Uint8Array[], zones: LightZone[], density: number[], target: number): void {
  if (target >= 1) return
  const light = zones.filter(z => z.type !== 'closure')
  const nL = light.length
  if (nL === 0) return
  const ch = light.map(z => z.channel)
  const angle = light.map(z => Math.atan2(z.nz, z.nx))   // position around the car → rotation order
  const score = new Float64Array(nL)
  const idx = Array.from({ length: nL }, (_, i) => i)
  const wasOn = new Uint8Array(nL)                        // kept last frame → STICKY (resists being bumped)
  for (let f = 0; f < frames.length; f++) {
    // K = fixtures lit this frame. Strict to the vibe target most of the time; only the very biggest
    // moments (density⁸) open it toward a full blast — our density envelope runs high, so the exponent
    // must be steep or every loud bar would "blast" and there'd be no negative space.
    const open = Math.min(1, target * (1 + 0.8 * Math.pow(density[f], 8)))
    const K = Math.max(1, Math.round(nL * open))
    if (K >= nL) { wasOn.fill(1); continue }
    // rank by brightness + a slow spatial rotation (movement) + STICKINESS for fixtures already lit, so a
    // held light isn't strobed off the instant another fixture flashes — it stays until clearly beaten.
    for (let i = 0; i < nL; i++) score[i] = frames[f][ch[i]] + 22 * Math.sin(angle[i] * 2 + f * 0.045) + (wasOn[i] ? 55 : 0)
    idx.sort((a, b) => score[b] - score[a])
    for (let i = 0; i < nL; i++) {
      const keep = i < K
      const j = idx[i]
      wasOn[j] = keep ? 1 : 0
      if (!keep) frames[f][ch[j]] = 0                     // dark all but the top K → exactly K lit
    }
  }
}

// Layered on top of the reactive base, aligned to the beat grid (anchored to the
// first detected onset). Two effects: (1) ping-pong — the accent fixtures (turn
// signals + markers) alternate LEFT↔RIGHT each beat; (2) sweep — a highlight runs
// L→R across the front/rear bars over two beats. Both gated by energy (so quiet
// parts stay calm) and scaled by the vibe's `phrasing`.
function applyPhrasing(frames: Uint8Array[], totalC: number[], zones: LightZone[], phrasing: number, phase: Float64Array): void {
  if (phrasing <= 0) return
  const lights = zones.filter(z => z.type !== 'closure')
  for (let f = 0; f < frames.length; f++) {
    const energy = totalC[f]
    if (energy < 0.15) continue
    const ph = phase[f]                                                // continuous beat position (tempo-tracked grid)
    const beatIdx = Math.floor(ph)
    const ppSide = beatIdx % 2 === 0 ? -1 : 1                          // accents fire this side this beat
    const fp2 = (((ph / 2) % 1) + 1) % 1                               // position within the 2-beat sweep window
    const head = -1 + 2 * fp2                                          // sweep head -1(L)→+1(R)
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

// Phase 2b: spatial EXPRESSION — make the lights act like INDEPENDENT fixtures (cascade /
// chase / per-fixture ripple) instead of moving as one symmetric block. Gated by `expr`,
// which is ≈0 on loud drops (so drops snap back to symmetric UNISON for impact) and high in
// verses / builds (independent, asymmetric movement for personality). Only shapes the accent
// fixtures (DRLs, signatures, markers, turns) — the main beams stay an anchor (and keep their
// cinematic ramping). Scaled by the vibe's `expression`. Symmetry for power, asymmetry for
// expression — exactly how a world-class designer balances a show.
function applyExpression(frames: Uint8Array[], density: number[], zones: LightZone[], strength: number, phase: Float64Array): void {
  if (strength <= 0) return
  const lights = zones.filter(z => z.type !== 'closure' && z.type !== 'highbeam' && z.type !== 'headlight')
  for (let f = 0; f < frames.length; f++) {
    const expr = strength * Math.max(0, 1 - density[f] * 1.2)         // unison on drops, expressive when calm
    if (expr < 0.03) continue
    const t = phase[f]                                                 // beats since the anchor (tempo-tracked grid)
    const dir = Math.floor(t / 8) % 2 === 0 ? 1 : -1                   // sweep direction flips every 8 beats
    const headX = (((t / 4) % 1) + 1) % 1                              // chase head 0→1 across the car / 4 beats
    for (const z of lights) {
      const ch = z.channel
      const base = frames[f][ch] / 255
      if (base < 0.015) continue                                       // only reshape fixtures the music already lit
      const nx = (z.nx + 1) / 2                                        // 0 (rear) … 1 (front)
      const along = dir > 0 ? nx : 1 - nx
      const near = Math.max(0, 1 - Math.abs(along - headX) * 2.2)      // moving spatial chase head
      const ripple = 0.5 + 0.5 * Math.sin((t * 2.2 + z.nz * 2.4 + nx * 3.1) * Math.PI)   // per-fixture shimmer
      const expressive = Math.min(1, base * (0.4 + 0.6 * ripple) + near * 0.45)
      frames[f][ch] = Math.min(255, Math.round((base * (1 - expr) + expressive * expr) * 255))
    }
  }
}

// Phase 1: light HOLD / RELEASE envelope. The reactive base is instantaneous, so fast transients
// made the lights blink faster than the beat (strobey). Give every fixture a snappy attack but a
// release tied to the tempo — each hit lands, holds, then decays toward the next beat. A ~120ms
// floor means nothing strobes even on busy tracks. `sustain` = release length as a fraction of a beat.
function applyLightEnvelope(frames: Uint8Array[], zones: LightZone[], bpm: number, FPS: number, sustain: number): void {
  if (sustain <= 0) return
  const beatFrames = (60 / bpm) * FPS
  const releaseFrames = Math.max(6, beatFrames * sustain)        // ~120ms floor → no strobe
  const coef = Math.exp(-1 / releaseFrames)
  for (const z of zones) {
    if (z.type === 'closure' || isFrontBeam(z)) continue   // FRONT beams get the sustain-aware hold instead
    const ch = z.channel
    let prev = 0
    for (let f = 0; f < frames.length; f++) {
      const cur = frames[f][ch]
      prev = cur >= prev ? cur : Math.max(cur, Math.round(prev * coef))   // fast attack, slow release
      frames[f][ch] = prev
    }
  }
}

// Phase 1b: SUSTAIN-AWARE holds on the FRONT "voice" beams (note-duration). The reshaped front base
// already BREATHES (dim between hits, bright on each strike) but flickers frame-to-frame around the
// on/off line (strobey on its own). This layer does two things, and only these two:
//   1. ANTI-STROBE: after each strike the beam releases LINEARLY to the live base over a short tail, so
//      sub-strobe flicker merges into a clean flash — but because the release is linear it reaches the
//      base within a BOUNDED number of frames, so the real gaps between notes fully reappear (unlike an
//      exponential tail, which lingers and smears the breathing into a wash).
//   2. NOTE-DURATION: while the triggering band's energy stays near its onset level (the note is still
//      ringing) the release slows to a long tail, so a genuinely SUSTAINED note stays lit for its real
//      length; a staccato stab, whose energy collapses at once, gets the short tail and drops. This is
//      the deliberate short-to-long variety the pros show — and it MODULATES the breathing base, decaying
//      toward it and never below, so it never hard-gates to black.
// Front only; rear/rhythm keep applyLightEnvelope's groove. `strength` = the vibe's frontHold.
function applyFrontHolds(
  frames: Uint8Array[], zones: LightZone[], E: Record<Band, Record<Side, number[]>>,
  O: Record<Band, number[]>, bpm: number, FPS: number, strength: number,
): void {
  const beatFrames = (60 / bpm) * FPS
  const shortTail = Math.max(6, beatFrames * 0.36)                        // stab/anti-strobe release: frames to fall full→base (~180ms floor)
  const longTail = Math.max(shortTail, beatFrames * (0.9 + 2.2 * strength)) // sustained-note release: much longer, per vibe
  const stepFast = 255 / shortTail                                       // LINEAR fall rates (per frame) — bounded release, so breathing returns
  const stepSlow = 255 / longTail
  for (const z of zones) {
    if (!isFrontBeam(z)) continue
    const ch = z.channel
    const isDrl = z.type === 'drl'
    const band = bandOf(z.type)
    const en = E[band][sideOf(z)]
    const on = O[band]
    let prev = 0, trigE = 0
    for (let f = 0; f < frames.length; f++) {
      const e = en[f]
      const cur = frames[f][ch]
      if (cur >= prev) { prev = cur; trigE = e }                          // fast attack — remember the note's onset energy
      else {
        // A genuine SUSTAIN = the note is still RINGING (energy near its onset level) AND it is NOT being
        // re-articulated (band onset flux is quiet) — a held vocal / bent guitar / pad. Only that gets the
        // long tail. Dense staccato keeps firing onsets, so each hit takes the short anti-strobe tail and
        // drops — no gap-filling wash. Either way it never falls below the live base, so breathing shows.
        // DRL/signature bars ride the near-continuous mid band, where a long tail just welds them on — so
        // they only ever get the fast anti-strobe release, letting them PULSE with the beat.
        const sustaining = !isDrl && e >= trigE * 0.55 && on[f] < 0.14
        prev = Math.max(cur, prev - (sustaining ? stepSlow : stepFast))
      }
      frames[f][ch] = Math.round(prev)
    }
  }
}

// Phase 2c: SIGNATURE MOVES at the big moments. When the song peaks AND the guitar/lead is driving
// (a solo, a drop), take creative liberty — either a 360° CHASE that rotates a bright arc around the
// car stepping on each picked note, or a symmetric L↔R PING-PONG that snaps side-to-side with the
// instrument. Gated to those moments (rare = special) and clocked to the presence onsets so it
// "matches the instrument playing." `strength` = the vibe's flourish amount.
function applyFlourish(
  frames: Uint8Array[], density: number[], presenceEnv: number[],
  presenceOnsets: number[], FPS: number, zones: LightZone[], strength: number,
): void {
  if (strength <= 0 || frames.length === 0) return
  const lights = zones.filter(z => z.type !== 'closure' && z.type !== 'highbeam' && z.type !== 'headlight')
  if (lights.length < 2) return
  // Ring order: sort fixtures by their angle around the car so advancing the index rotates a sweep.
  const ring = [...lights].sort((a, b) => Math.atan2(a.nz, a.nx) - Math.atan2(b.nz, b.nx))
  const ringIdx = new Map(ring.map((z, i) => [z.channel, i] as const))
  const R = ring.length
  // step[f] = how many picked-note (presence) onsets have fired by frame f — the move clock.
  const step = new Array<number>(frames.length).fill(0)
  { let s = 0, oi = 0
    for (let f = 0; f < frames.length; f++) { while (oi < presenceOnsets.length && presenceOnsets[oi] <= f) { s++; oi++ } step[f] = s } }
  for (let f = 0; f < frames.length; f++) {
    // Fire when the song peaks OR the lead alone is busy (e.g. a drum-less fast-guitar intro).
    const moment = Math.min(1, Math.max(density[f] * presenceEnv[f] * 2.4, presenceEnv[f] * 1.25))
    if (moment < 0.4) continue
    const s = strength * moment
    const rate = step[f] - step[Math.max(0, f - FPS)]                   // picked notes in the last ~1s
    if (rate >= 6) {                                                    // FAST picking → quick symmetric ping-pong
      const side = step[f] % 2 === 0 ? -1 : 1
      for (const z of lights) {
        if (Math.abs(z.nz) < 0.1) continue
        const onSide = z.nz < 0 ? side < 0 : side > 0
        frames[f][z.channel] = onSide
          ? Math.min(255, frames[f][z.channel] + Math.round(s * 200))
          : Math.round(frames[f][z.channel] * (1 - s * 0.6))
      }
    } else {                                                           // melodic/moderate → rotate a 360° arc
      const head = step[f] % R
      for (const z of lights) {
        const i = ringIdx.get(z.channel)!
        let d = Math.abs(i - head); d = Math.min(d, R - d)             // circular distance around the ring
        const near = Math.max(0, 1 - d / Math.max(1, R * 0.28))         // a lit arc that rotates around the car
        if (near > 0) frames[f][z.channel] = Math.min(255, frames[f][z.channel] + Math.round(near * s * 255))
      }
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
    // Lights never read the presence BAND energy — guitars/leads drive the lights via the FFT
    // presence ONSET (O.presence, below). This key is just a placeholder to keep the Band record
    // complete; the costly biquad presence filtering that used to fill it was dead work (removed).
    presence: { L: totalC, R: totalC, C: totalC },
    total: { L: totalC, R: totalC, C: totalC },
  }
  // Onset detection via FFT spectral flux (sees fast re-picked notes that RMS flux can't) — the
  // single onset source for every light hit, the BPM, the closure landmarks, and the flourishes.
  const monoLen = Math.min(left.length, right.length)
  const mono = new Float32Array(monoLen)
  for (let i = 0; i < monoLen; i++) mono[i] = (left[i] + right[i]) * 0.5
  const O: Record<Band, number[]> = spectralOnsets(mono, sampleRate, totalFrames, FPS)

  // Density envelope (how busy the show should be right now).
  const density: number[] = new Array(totalFrames).fill(0)
  { let acc = 0; for (let f = 0; f < totalFrames; f++) { acc = acc * 0.92 + totalC[f] * 0.08; density[f] = Math.min(1, acc * 1.6) } }

  // ── COMPOSED CHOREOGRAPHY (the conductor) ── shape the local density envelope by the whole-song
  // intensity arc BEFORE any consumer reads it, so negative space, expression, flourish, ramping, and
  // closures all follow song structure: pull back in verses/breakdowns, bloom on choruses, blast drops.
  // The scale runs 0.72 (arc=0, verse) → 1.28 (arc=1, chorus), neutral at arc=0.5, then blended by the
  // vibe's `composition` — so composition=0 is byte-identical to the old behavior, and a flat song (arc≈0.5
  // everywhere) is barely touched. It MODULATES the breathing envelope; it never hard-gates.
  if (P.composition > 0) {
    const arc = buildStructureArc(totalC, E, FPS)
    for (let f = 0; f < totalFrames; f++) {
      const scale = 0.72 + 0.56 * arc[f]
      density[f] = Math.min(1, density[f] * (1 - P.composition + P.composition * scale))
    }
  }

  // Expression: stronger STEREO separation — push each band's L/R away from the center mix
  // so panned content reads as visibly independent sides. Gated to calmer passages (eased off
  // on drops, which stay punchy + symmetric). Mutates the per-side energy the frame build reads.
  if (P.expression > 0) {
    const widen = (L: number[], R: number[], C: number[]) => {
      for (let f = 0; f < totalFrames; f++) {
        const w = P.expression * 0.7 * Math.max(0, 1 - density[f] * 1.2)
        L[f] = Math.max(0, Math.min(1, L[f] + (L[f] - C[f]) * w))
        R[f] = Math.max(0, Math.min(1, R[f] + (R[f] - C[f]) * w))
      }
    }
    widen(bN_L, bN_R, bN_C); widen(mN_L, mN_R, mN_C); widen(hN_L, hN_R, hN_C)
  }

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
      const gtr = O.presence[f] * P.lead   // picked/strummed-note attack → lights react to the guitar, not just volume
      let b: number
      switch (zone.type) {
        case 'turn_front': case 'turn_rear': b = (punch * 1.5 + gtr * 0.8) * P.sparkle * (0.4 + 0.6 * dens); break
        case 'marker': b = (energy * 0.45 + punch * 0.9 + gtr * 0.6) * P.sparkle * (0.3 + 0.7 * dens); break
        default:
          if (zone.type === 'drl') {
            // Signature/DRL bars (the big front strips) ride the near-CONTINUOUS mid band (synths/vocals),
            // so a flat energy floor + big punch pins them into a saturated wash — worst on high-punch vibes
            // like EDM. Drive them almost purely by TRANSIENTS (near-zero energy floor, lighter punch) so
            // they PULSE with the beat and fall dark between hits, the way the bass-driven main beams do —
            // then SECTION-gate by density so they pull back in builds/verses and blast on the drop/chorus.
            b = (energy * 0.05 + punch * 0.6 * P.punch + gtr * 0.85) * (0.4 + 0.6 * dens)
          } else if (isFrontBeam(zone)) {
            // FRONT main beams + front fog (bass-driven): only a THIN energy floor (a dim loudness cue that
            // lets them breathe), with the real drive from onsets + picked/lead notes — so between hits the
            // beam falls dim and each note reads as a deliberate strike, instead of the constant DC wash it
            // was. applyFrontHolds then sustains genuinely held notes to their real length (note-duration).
            b = energy * 0.15 + punch * 1.0 * P.punch + gtr * 0.9
          } else {
            // rear beams (tail/brake/rear fog) + any other fixture — unchanged reactive base.
            b = (energy * 0.9 + punch * 1.0 * P.punch) * P.bassWeight + gtr * 0.45
          }
          break
      }
      frame[zone.channel] = Math.round(curve(b) * 255)
    })
    return frame
  })

  // Phase 1: light hold/release envelope so flashes land WITH the beat instead of strobing.
  applyLightEnvelope(frames, zones, bpm, FPS, P.sustain)
  // Phase 1b: sustain-aware holds on the FRONT beams — they follow the real note length (linear
  // anti-strobe release, extended for genuine sustains) so they breathe instead of a constant DC wash.
  applyFrontHolds(frames, zones, E, O, bpm, FPS, P.frontHold)

  // Phase 2: layer beat-synced phrasing (ping-pong + sweep) over the reactive base.
  const lightAnchor = triggerFrames.size ? Math.min(...triggerFrames) : 0
  // Tempo-tracking beat grid (built once): a bounded corrector so phrasing + expression stay locked to
  // the beat even when the song's tempo drifts — ≈ the old fixed grid on steady songs.
  const beatPhase = buildBeatGrid(onset, totalFrames, FPS, bpm, lightAnchor)
  applyPhrasing(frames, totalC, zones, P.phrasing, beatPhase)
  // Phase 2b: per-fixture spatial expression (cascade/chase/ripple in verses, unison on drops).
  applyExpression(frames, density, zones, P.expression, beatPhase)
  // Phase 2c: signature moves at the guitar/drum-solo peaks — clocked to the picked-note onsets.
  const presenceEnv = new Array<number>(totalFrames).fill(0)
  { let acc = 0; for (let f = 0; f < totalFrames; f++) { acc = acc * 0.90 + O.presence[f] * 0.10; presenceEnv[f] = Math.min(1, acc * 1.8) } }
  const presenceOnsets: number[] = []
  { const Op = O.presence, minGap = 3; let last = -minGap   // ~60ms gap → tracks up to ~16 picked notes/sec
    for (let f = 2; f < totalFrames - 2; f++) {
      let s = 0, n = 0; for (let k = f - 6; k <= f + 6; k++) if (k >= 0 && k < totalFrames) { s += Op[k]; n++ }
      if (Op[f] > Op[f - 1] && Op[f] >= Op[f + 1] && Op[f] > (s / n) * 1.5 + 0.02 && f - last >= minGap) { presenceOnsets.push(f); last = f }
    } }
  applyFlourish(frames, density, presenceEnv, presenceOnsets, FPS, zones, P.flourish)

  // Phase 2c-bis: measure/phrase dynamics — emphasize the "1" of each bar + build across each phrase.
  applyMeasureDynamics(frames, zones, beatPhase, density, P.downbeat)

  // Phase 2d: a LIGHT touch of negative space — rest only the DIMMEST fixtures (the per-vibe `density`
  // target is HIGH, so the bright, "breathing" majority is untouched). This nods to the pro "less is
  // more" contrast WITHOUT the crisp/sparse look that felt like a step back — gradation is fully kept,
  // no hard on/off. Easily dialed per vibe (or removed) in MIX_PRESETS.density.
  applyNegativeSpace(frames, zones, density, P.density)

  // Phase 3: auto-choreograph closures to the song structure (opt-in per show).
  // Feed it the SAME musical landmarks the lights use: the onset hits + beat anchor.
  if (opts?.autoClosures && opts.model) {
    const triggers = [...triggerFrames].sort((p, q) => p - q)
    const anchor = triggerFrames.size ? Math.min(...triggerFrames) : 0
    // "slam" = bass-weighted onset strength → finds the true drop (bass crashing in) for closures.
    const slam = O.bass.map((v, i) => v * 1.5 + O.total[i])
    choreographClosures(frames, totalC, density, triggers, FPS, opts.model, zones, P.closureSections, bpm, anchor, slam)
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
