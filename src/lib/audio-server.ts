import { MPEGDecoder } from 'mpg123-decoder'

// Server-side audio helpers shared by the admin batch tool. (The customer /api/export
// route keeps its own validated copies — these are intentionally identical so the batch
// testing tool produces the same FSEQ/WAV output as a real export.)

function decodeWavPCM(buf: ArrayBuffer): { L: Float32Array; R: Float32Array; sampleRate: number } | null {
  const dv = new DataView(buf)
  if (dv.byteLength < 44 || dv.getUint32(0, false) !== 0x52494646 || dv.getUint32(8, false) !== 0x57415645) return null
  let off = 12, channels = 0, sampleRate = 0, bits = 0, dataOff = -1, dataLen = 0
  while (off + 8 <= dv.byteLength) {
    const id = dv.getUint32(off, false), sz = dv.getUint32(off + 4, true)
    if (id === 0x666d7420) { channels = dv.getUint16(off + 10, true); sampleRate = dv.getUint32(off + 12, true); bits = dv.getUint16(off + 22, true) }
    else if (id === 0x64617461) { dataOff = off + 8; dataLen = sz }
    off += 8 + sz + (sz & 1)
  }
  if (dataOff < 0 || bits !== 16 || channels < 1 || sampleRate < 8000) return null
  const n = Math.floor(dataLen / 2 / channels)
  const L = new Float32Array(n), R = new Float32Array(n)
  let p = dataOff
  for (let i = 0; i < n; i++) {
    L[i] = dv.getInt16(p, true) / 32768; p += 2
    if (channels > 1) { R[i] = dv.getInt16(p, true) / 32768; p += 2 } else R[i] = L[i]
  }
  return { L, R, sampleRate }
}

export async function decodeAudioPCM(bytes: ArrayBuffer): Promise<{ L: Float32Array; R: Float32Array; sampleRate: number } | null> {
  const wav = decodeWavPCM(bytes)
  if (wav) return wav
  try {
    const dec = new MPEGDecoder()
    await dec.ready
    const { channelData, samplesDecoded, sampleRate } = dec.decode(new Uint8Array(bytes))
    dec.free()
    if (samplesDecoded > 0 && channelData?.[0]?.length) {
      return { L: channelData[0], R: channelData[1] ?? channelData[0], sampleRate }
    }
  } catch { /* not decodable */ }
  return null
}

export function resamplePCM(data: Float32Array, srcRate: number, dstRate: number): Float32Array {
  if (srcRate === dstRate) return data
  const ratio = srcRate / dstRate
  const outLen = Math.max(1, Math.round(data.length / ratio))
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio, i0 = Math.floor(pos), i1 = Math.min(i0 + 1, data.length - 1)
    const frac = pos - i0
    out[i] = data[i0] * (1 - frac) + data[i1] * frac
  }
  return out
}

export function encodeWav(L: Float32Array, R: Float32Array, sampleRate: number): Uint8Array {
  const numFrames = Math.min(L.length, R.length)
  const blockAlign = 2 * 2
  const dataSize = numFrames * blockAlign
  const out = new Uint8Array(44 + dataSize)
  const view = new DataView(out.buffer)
  const writeStr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)) }
  writeStr(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); writeStr(8, 'WAVE')
  writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true)
  view.setUint16(22, 2, true); view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true); view.setUint16(32, blockAlign, true); view.setUint16(34, 16, true)
  writeStr(36, 'data'); view.setUint32(40, dataSize, true)
  let off = 44
  for (let i = 0; i < numFrames; i++) {
    let l = Math.max(-1, Math.min(1, L[i])); l = l < 0 ? l * 0x8000 : l * 0x7fff
    let r = Math.max(-1, Math.min(1, R[i])); r = r < 0 ? r * 0x8000 : r * 0x7fff
    view.setInt16(off, l, true); off += 2
    view.setInt16(off, r, true); off += 2
  }
  return out
}

export function buildFseq(channels: number, frames: number, stepMs: number, frameData: Uint8Array[]): Uint8Array {
  const headerSize = 32
  const buf = new Uint8Array(headerSize + frames * channels)
  const view = new DataView(buf.buffer)
  buf[0] = 0x50; buf[1] = 0x53; buf[2] = 0x45; buf[3] = 0x51
  view.setUint16(4, headerSize, true)
  buf[6] = 0; buf[7] = 2
  view.setUint16(8, headerSize, true)
  view.setUint32(10, channels, true)
  view.setUint32(14, frames, true)
  view.setUint16(18, stepMs, true)
  for (let f = 0; f < frames; f++) buf.set(frameData[f] ?? new Uint8Array(channels), headerSize + f * channels)
  return buf
}

// Make a filesystem-safe base name from "Title-Artist" (Tesla needs the .fseq and .wav
// to share the exact same name to pair them on a USB).
export function sanitizeBaseName(name: string): string {
  return (name || 'lightshow')
    .replace(/[/\\:*?"<>|]+/g, ' ')   // strip illegal filename chars
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'lightshow'
}
