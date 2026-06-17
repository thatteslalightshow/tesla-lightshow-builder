// Audio frequency analysis for light show generation.
// Uses OfflineAudioContext + BiquadFilters — browser-only, never call server-side.

import type { ModelDefinition } from './tesla-channels'

export interface AudioAnalysisResult {
  frames: Uint8Array[]
  triggerFrames: Set<number> // frame indices where a beat onset is detected
  bpm: number
}

async function renderBand(
  buffer: AudioBuffer,
  type: BiquadFilterType,
  freq: number,
  Q = 0.7,
): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, buffer.length, buffer.sampleRate)
  const src = ctx.createBufferSource()
  src.buffer = buffer
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = Q
  src.connect(f)
  f.connect(ctx.destination)
  src.start()
  const rendered = await ctx.startRendering()
  return rendered.getChannelData(0)
}

function rms(data: Float32Array, start: number, len: number): number {
  let s = 0
  const end = Math.min(start + len, data.length)
  const n = end - start
  if (n <= 0) return 0
  for (let i = start; i < end; i++) s += data[i] * data[i]
  return Math.sqrt(s / n)
}

function percentileNorm(vals: number[], p = 0.95): number[] {
  const sorted = [...vals].sort((a, b) => a - b)
  const ceil = sorted[Math.floor(sorted.length * p)] || 1e-9
  return vals.map(v => Math.min(v / ceil, 1))
}

export async function analyzeAudioToFrames(
  audioBuffer: AudioBuffer,
  modelDef: ModelDefinition,
): Promise<AudioAnalysisResult> {
  const { sampleRate, length } = audioBuffer
  const FPS = 20
  const hop = Math.floor(sampleRate / FPS)
  const frameCount = Math.floor(length / hop)

  // Parallel band extraction
  const [bassData, midData, highData] = await Promise.all([
    renderBand(audioBuffer, 'lowpass', 200),
    renderBand(audioBuffer, 'bandpass', 1200, 1.2),
    renderBand(audioBuffer, 'highpass', 5000),
  ])
  const raw = audioBuffer.getChannelData(0)

  const bassV = new Array<number>(frameCount)
  const midV  = new Array<number>(frameCount)
  const highV = new Array<number>(frameCount)
  const totV  = new Array<number>(frameCount)

  for (let f = 0; f < frameCount; f++) {
    const s = f * hop
    bassV[f] = rms(bassData, s, hop)
    midV[f]  = rms(midData,  s, hop)
    highV[f] = rms(highData, s, hop)
    totV[f]  = rms(raw,      s, hop)
  }

  const bassN = percentileNorm(bassV)
  const midN  = percentileNorm(midV)
  const highN = percentileNorm(highV)
  const totN  = percentileNorm(totV)

  // Onset detection: energy spike vs 10-frame running average, minimum 200ms apart
  const triggerFrames = new Set<number>()
  const LOOKBACK = 10, THRESH = 1.55, MIN_GAP = 4
  let lastOnset = -MIN_GAP
  for (let f = LOOKBACK; f < frameCount; f++) {
    let avg = 0
    for (let b = f - LOOKBACK; b < f; b++) avg += totN[b]
    avg /= LOOKBACK
    if (totN[f] > avg * THRESH && totN[f] > 0.22 && f - lastOnset >= MIN_GAP) {
      triggerFrames.add(f)
      lastOnset = f
    }
  }

  // BPM from onset spacing
  const onsets = Array.from(triggerFrames)
  let bpm = 120
  if (onsets.length >= 4) {
    const gaps = onsets.slice(1).map((f, i) => f - onsets[i])
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length
    bpm = Math.round(60 / (avgGap / FPS))
    bpm = Math.max(60, Math.min(200, bpm))
  }

  // Generate per-frame channel data
  const { zones, channelCount } = modelDef
  const frames: Uint8Array[] = Array.from({ length: frameCount }, (_, f) => {
    const frame = new Uint8Array(channelCount)
    const bass  = bassN[f]
    const mid   = midN[f]
    const high  = highN[f]
    const tot   = totN[f]
    const beat  = triggerFrames.has(f)

    zones.forEach(zone => {
      let b = 0
      switch (zone.type) {
        case 'headlight':   b = bass * 0.75 + tot  * 0.25; break
        case 'highbeam':    b = beat ? 1.0 : mid   * 0.6;  break
        case 'drl':         b = mid  * 0.65 + high * 0.35; break
        case 'fog':         b = bass * 0.85;                break
        case 'tail':        b = bass * 0.75 + tot  * 0.25; break
        case 'brake':       b = beat ? 1.0 : bass  * 0.45; break
        case 'turn_front':
        case 'turn_rear':   b = beat ? 1.0 : 0;            break
        case 'reverse':     b = tot  * 0.4;                 break
        case 'plate':       b = tot  * 0.5;                 break
        case 'interior':    b = high * 0.55 + mid  * 0.45; break
        case 'strip':       b = tot  * 0.9;                 break
      }
      frame[zone.channel] = Math.round(Math.min(b, 1) * 255)
    })
    return frame
  })

  return { frames, triggerFrames, bpm }
}
