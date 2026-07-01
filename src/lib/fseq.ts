export interface FseqValidation {
  ok: boolean
  errors: string[]
  warnings: string[]
  info: string[]
}

/**
 * Write frames to a Tesla-compatible FSEQ v2 (PSEQ) binary — 32-byte header, uncompressed.
 * Single source of truth shared by the builder export, the admin batch tool, and the regression
 * harness so they can't drift. (Byte 20 = compression stays 0 = uncompressed, which validateFseq requires.)
 */
export function buildFseq(channels: number, frames: number, stepMs: number, frameData: Uint8Array[]): Uint8Array {
  const headerSize = 32
  const buf = new Uint8Array(headerSize + frames * channels)
  const view = new DataView(buf.buffer)
  buf[0] = 0x50; buf[1] = 0x53; buf[2] = 0x45; buf[3] = 0x51   // "PSEQ"
  view.setUint16(4, headerSize, true)                          // data start offset
  buf[6] = 0; buf[7] = 2                                       // v2.0
  view.setUint16(8, headerSize, true)                          // fixed-header size
  view.setUint32(10, channels, true)
  view.setUint32(14, frames, true)
  view.setUint16(18, stepMs, true)
  for (let f = 0; f < frames; f++) {
    buf.set(frameData[f] ?? new Uint8Array(channels), headerSize + f * channels)
  }
  return buf
}

/**
 * Validate an FSEQ v2 binary buffer for Tesla compatibility.
 * Returns structured errors, warnings, and info lines.
 */
export function validateFseq(
  buf: ArrayBuffer,
  expectedChannels: number,
  audioFileMimeType?: string,
): FseqValidation {
  const errors: string[] = []
  const warnings: string[] = []
  const info: string[] = []

  if (buf.byteLength < 32) {
    errors.push('File is too small to be a valid FSEQ (< 32 bytes).')
    return { ok: false, errors, warnings, info }
  }

  const u8 = new Uint8Array(buf)
  const view = new DataView(buf)

  // Magic
  const magic = String.fromCharCode(u8[0], u8[1], u8[2], u8[3])
  if (magic !== 'PSEQ') errors.push(`Bad magic "${magic}" — expected "PSEQ".`)

  // Version
  const minor = u8[6]; const major = u8[7]
  if (major !== 2) warnings.push(`FSEQ major version ${major} — Tesla expects 2.`)
  info.push(`FSEQ v${major}.${minor}`)

  // Data start / header size (official validator requires >= 24)
  const dataStart = view.getUint16(4, true)
  if (dataStart < 24) errors.push(`Data start offset ${dataStart} < 24 bytes (header too small).`)

  // Channel count — Tesla's validator accepts only 48 (single car) or 200 (multi)
  const channels = view.getUint32(10, true)
  if (channels !== 48 && channels !== 200) {
    errors.push(`Channel count ${channels} — Tesla requires exactly 48 (or 200 for multi-car).`)
  } else if (channels !== expectedChannels) {
    info.push(`${channels} channels`)
  } else {
    info.push(`${channels} channels`)
  }

  // Frame count
  const frames = view.getUint32(14, true)
  if (frames < 1) errors.push('Frame count must be at least 1.')
  info.push(`${frames} frames`)

  // Step time — official validator requires >= 15ms; Tesla recommends 20ms (50fps)
  const stepMs = view.getUint16(18, true)
  if (stepMs < 15) errors.push(`Step time ${stepMs} ms is below Tesla's 15 ms minimum.`)
  else if (stepMs > 100) warnings.push(`Step time ${stepMs} ms is above Tesla's supported 100 ms.`)
  const durationSec = (frames * stepMs) / 1000
  info.push(`${stepMs} ms/frame (${Math.round(1000 / stepMs)} fps)`)
  info.push(`~${durationSec.toFixed(1)}s duration`)
  // Tesla's hard limit is 4 hours
  if (durationSec > 4 * 3600) errors.push(`Show is ${(durationSec / 60).toFixed(0)} min — exceeds Tesla's 4-hour maximum.`)

  // Compression — official validator reads byte 20 and requires 0 (uncompressed)
  const compressionType = u8[20]
  if (compressionType !== 0) {
    errors.push(`Compression type ${compressionType} — Tesla requires V2 uncompressed (0).`)
  }

  // Size sanity
  const expectedSize = dataStart + frames * channels
  if (buf.byteLength < expectedSize) {
    errors.push(`Buffer too small: expected ≥${expectedSize} bytes, got ${buf.byteLength}.`)
  }

  // Audio format check
  if (audioFileMimeType) {
    const isWav = audioFileMimeType === 'audio/wav' || audioFileMimeType === 'audio/x-wav'
    if (!isWav) {
      warnings.push('Audio is not WAV — Tesla requires WAV for synced playback. Lights will still work but audio won\'t play from USB.')
    } else {
      info.push('WAV audio ✓')
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    info,
  }
}
