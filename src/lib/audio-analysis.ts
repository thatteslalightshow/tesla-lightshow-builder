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

// Auto-choreograph closures: open the model's hero closure so it lands open ON the
// drop (pre-fired by its actuation duration), dance through the big section if it
// can, then close — all within Tesla's per-closure limits, dance support, ~30s
// thermal cap, and the Model-X windows-during-doors safety rule.
function choreographClosures(frames: Uint8Array[], totalC: number[], FPS: number, model: TeslaModel, zones: LightZone[], maxSections: number): void {
  const all = detectSections(totalC, FPS) // already in time order
  if (!all.length) return
  // Keep only the most prominent sections (count set by the vibe preset), time-ordered.
  const peakCut = [...all].sort((a, b) => b.peak - a.peak)[Math.min(all.length - 1, Math.max(1, maxSections) - 1)]?.peak ?? 0
  const sections = all.filter(s => s.peak >= peakCut)

  const families = MODEL_CLOSURES[model]
  const chOf = (fam: ClosureFamily) => zones.filter(z => z.closure === fam).map(z => z.channel)
  let heroOrder: ClosureFamily[] = ['falcon_doors', 'front_doors', 'liftgate', 'door_handles', 'windows', 'mirrors', 'charge_port']
  if (model === 'modelX') heroOrder = heroOrder.filter(f => f !== 'windows') // false-pinch rule
  const heroes = heroOrder.filter(f => families.includes(f))

  const used: Partial<Record<ClosureFamily, number>> = {}
  const busyUntil: Partial<Record<ClosureFamily, number>> = {} // frame a family is free again
  const HOLD = Math.round(FPS * 0.6)
  const DANCE_BUDGET = Math.round(FPS * 30)
  let danceUsed = 0
  const write = (ch: number, cmd: keyof typeof CLOSURE_CMD, from: number, to: number) => {
    const v = CLOSURE_CMD[cmd]
    for (let f = Math.max(0, from); f < Math.min(frames.length, to); f++) frames[f][ch] = v
  }

  for (const sec of sections) {
    for (const fam of heroes) {
      const chans = chOf(fam); if (!chans.length) continue
      const limit = CLOSURE_LIMITS[fam], dur = Math.round(CLOSURE_DURATIONS[fam] * FPS)
      const cur = used[fam] ?? 0
      if (cur + 2 > limit) continue                  // need open+close budget
      // Will this closure also dance? (dance-capable family + budget for
      // open+dance+close + thermal budget left.) Dancers must be FULLY OPEN
      // before the drop — Tesla ignores Dance unless already open — so pre-fire
      // them an extra settle so the open completes first.
      const willDance = DANCE_SUPPORTED.has(fam) && (cur + 3) <= limit && danceUsed < DANCE_BUDGET
      const settle = willDance ? HOLD : 0
      const openAt = sec.start - dur - settle        // open lands by the drop (dancers a touch earlier)
      if (openAt < HOLD) continue                    // not enough lead time
      if (openAt < (busyUntil[fam] ?? 0)) continue   // still actuating from a prior section → no overlap
      for (const ch of chans) write(ch, 'open', openAt, openAt + HOLD)
      used[fam] = cur + 1
      let closeAt = sec.end
      if (willDance) {
        const len = Math.min(sec.end - sec.start, DANCE_BUDGET - danceUsed)
        for (const ch of chans) write(ch, 'dance', sec.start, sec.start + len)
        danceUsed += len; used[fam] = used[fam]! + 1; closeAt = sec.start + len
      }
      for (const ch of chans) write(ch, 'close', closeAt, closeAt + HOLD)
      used[fam] = (used[fam] ?? 0) + 1
      busyUntil[fam] = closeAt + HOLD                // free again only after it closes
      break                                          // one hero closure per section
    }
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
    let bestLag = 0, bestCorr = -1
    for (let lag = minLag; lag <= maxLag; lag++) {
      let corr = 0
      for (let f = 0; f + lag < totalFrames; f++) corr += onset[f] * onset[f + lag]
      corr /= (totalFrames - lag)
      if (corr > bestCorr) { bestCorr = corr; bestLag = lag }
    }
    if (bestLag > 0) bpm = Math.max(60, Math.min(200, Math.round(60 / (bestLag / FPS))))
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
  if (opts?.autoClosures && opts.model) choreographClosures(frames, totalC, FPS, opts.model, zones, P.closureSections)

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
