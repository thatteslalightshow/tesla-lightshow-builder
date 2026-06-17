import type { ModelDefinition } from './tesla-channels'

export interface AudioAnalysisResult {
  frames: Uint8Array[]
  triggerFrames: Set<number>
  bpm: number
  // Normalized amplitude envelope at 100fps (10ms windows) for waveform display.
  // Index 0 = start of song. Length = floor(duration * 100).
  waveformData: Float32Array
}

// Render audio through a biquad filter into a Float32Array
async function renderBand(
  buffer: AudioBuffer,
  type: BiquadFilterType,
  freq: number,
  Q: number,
): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, buffer.length, buffer.sampleRate)
  const src = ctx.createBufferSource()
  src.buffer = buffer
  const filt = ctx.createBiquadFilter()
  filt.type = type
  filt.frequency.value = freq
  filt.Q.value = Q
  src.connect(filt)
  filt.connect(ctx.destination)
  src.start(0)
  const rendered = await ctx.startRendering()
  return rendered.getChannelData(0)
}

function rms(data: Float32Array, start: number, len: number): number {
  let sum = 0
  for (let i = start; i < start + len && i < data.length; i++) sum += data[i] * data[i]
  return Math.sqrt(sum / len)
}

function percentileNorm(vals: number[], p = 0.95): number[] {
  const sorted = [...vals].sort((a, b) => a - b)
  const cap = sorted[Math.floor(sorted.length * p)] || 1
  return vals.map(v => Math.min(v / cap, 1))
}

export async function analyzeAudioToFrames(
  audioBuffer: AudioBuffer,
  modelDef: ModelDefinition,
): Promise<AudioAnalysisResult> {
  const FPS = 20
  const frameSize = Math.floor(audioBuffer.sampleRate / FPS)
  const totalFrames = Math.floor(audioBuffer.length / frameSize)
  const { channelCount, zones } = modelDef

  // Three parallel band renders: bass / mid / treble
  const [bass, mid, treble] = await Promise.all([
    renderBand(audioBuffer, 'lowpass',  200, 1.0),
    renderBand(audioBuffer, 'bandpass', 1200, 1.2),
    renderBand(audioBuffer, 'highpass', 5000, 0.8),
  ])

  // Per-frame RMS for each band
  const bassRms: number[]   = []
  const midRms: number[]    = []
  const trebleRms: number[] = []
  for (let f = 0; f < totalFrames; f++) {
    bassRms.push(rms(bass, f * frameSize, frameSize))
    midRms.push(rms(mid, f * frameSize, frameSize))
    trebleRms.push(rms(treble, f * frameSize, frameSize))
  }

  // Normalize to 95th percentile so quiet and loud tracks both use full range
  const bassN   = percentileNorm(bassRms)
  const midN    = percentileNorm(midRms)
  const trebleN = percentileNorm(trebleRms)
  const totalN  = percentileNorm(bassRms.map((b, i) => (b + midRms[i] + trebleRms[i]) / 3))

  // Onset detection for beat-triggered effects
  const triggerFrames = new Set<number>()
  const lookback = 10
  const threshold = 1.55
  let lastTrigger = -4
  for (let f = lookback; f < totalFrames; f++) {
    const window = bassN.slice(f - lookback, f)
    const avg = window.reduce((a, b) => a + b, 0) / lookback
    if (bassN[f] > avg * threshold && f - lastTrigger >= 4) {
      triggerFrames.add(f)
      lastTrigger = f
    }
  }

  // Estimate BPM from onset intervals
  const onsets = [...triggerFrames].sort((a, b) => a - b)
  let bpm = 120
  if (onsets.length > 4) {
    const intervals = onsets.slice(1).map((o, i) => o - onsets[i])
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
    bpm = Math.round(60 / (avgInterval / FPS))
    bpm = Math.max(60, Math.min(200, bpm))
  }

  // Build frame data — map each zone type to a band
  const frames: Uint8Array[] = Array.from({ length: totalFrames }, (_, f) => {
    const frame = new Uint8Array(channelCount)
    zones.forEach(zone => {
      let brightness = 0
      switch (zone.type) {
        case 'headlight':
        case 'tail':
          brightness = bassN[f]; break
        case 'drl':
        case 'highbeam':
          brightness = midN[f]; break
        case 'interior':
          brightness = trebleN[f]; break
        case 'brake':
        case 'turn_front':
        case 'turn_rear':
          brightness = triggerFrames.has(f) ? 1.0 : 0; break
        case 'strip':
        case 'fog':
        case 'reverse':
        case 'plate':
          brightness = totalN[f]; break
        default:
          brightness = totalN[f]
      }
      frame[zone.channel] = Math.round(Math.min(brightness, 1) * 255)
    })
    return frame
  })

  // High-res amplitude envelope for the waveform display.
  // Computed directly from the raw channel data — no extra OfflineAudioContext needed.
  const WF_FPS = 100
  const wfFrameSize = Math.floor(audioBuffer.sampleRate / WF_FPS)
  const rawCh = audioBuffer.getChannelData(0)
  const wfTotal = Math.floor(audioBuffer.length / wfFrameSize)
  const wfRaw: number[] = []
  for (let f = 0; f < wfTotal; f++) {
    wfRaw.push(rms(rawCh, f * wfFrameSize, wfFrameSize))
  }
  const wfNorm = percentileNorm(wfRaw)
  const waveformData = new Float32Array(wfNorm)

  return { frames, triggerFrames, bpm, waveformData }
}
