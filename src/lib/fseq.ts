export interface FseqValidation {
  ok: boolean
  errors: string[]
  warnings: string[]
  info: string[]
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

  // Data start / header size
  const dataStart = view.getUint16(4, true)
  if (dataStart < 32) errors.push(`Data start offset ${dataStart} < 32 bytes (header too small).`)

  // Channel count
  const channels = view.getUint32(10, true)
  if (channels === 0) errors.push('Channel count is 0.')
  if (channels !== expectedChannels) {
    warnings.push(`Channel count ${channels} doesn't match expected ${expectedChannels} for this model.`)
  }
  info.push(`${channels} channels`)

  // Frame count
  const frames = view.getUint32(14, true)
  if (frames === 0) errors.push('Frame count is 0.')
  info.push(`${frames} frames`)

  // Step time — Tesla supports 15–100ms; 20ms (50fps) recommended
  const stepMs = view.getUint16(18, true)
  if (stepMs === 0) errors.push('Step time is 0 ms.')
  else if (stepMs < 15 || stepMs > 100) warnings.push(`Step time ${stepMs} ms is outside Tesla's supported 15–100 ms range.`)
  const durationSec = (frames * stepMs) / 1000
  info.push(`${stepMs} ms/frame (${Math.round(1000 / stepMs)} fps)`)
  info.push(`~${durationSec.toFixed(1)}s duration`)
  // Tesla's hard limit is 4 hours
  if (durationSec > 4 * 3600) errors.push(`Show is ${(durationSec / 60).toFixed(0)} min — exceeds Tesla's 4-hour maximum.`)

  // Compression (Tesla requires uncompressed)
  const compressionType = u8[21]
  if (compressionType !== 0) {
    warnings.push(`Compression type ${compressionType} — Tesla requires uncompressed (0).`)
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
