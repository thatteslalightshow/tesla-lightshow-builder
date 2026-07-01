/**
 * FSEQ conformance + regression harness.
 *
 * For every Tesla model it runs the SAME engine the app uses (analyzePCM) on a fixed, deterministic
 * synthetic song, writes the FSEQ with the shared buildFseq, and checks:
 *   1. CONFORMANCE  — validateFseq (magic/version/channel count/50fps/duration/compression/size).
 *   2. SAFETY       — validateClosureSafety (closure limits, no unsafe simultaneous edges, etc.).
 *   3. SHAPE        — every frame is exactly channelCount wide.
 *   4. REGRESSION   — a hash of the engine's frame output is compared to a committed golden
 *                     (scripts/fseq-golden.json). If the output changes, the run FAILS so an engine
 *                     tweak can't silently alter a model's show. Re-bless intentional changes with --bless.
 *   5. NEGATIVE     — hand-crafted UNSAFE fseqs that validateClosureSafety must REJECT (one per
 *                     invariant), plus a safe control it must pass. A passing golden alone doesn't
 *                     prove a guard works — this locks the validator itself against regression.
 *
 * Run:   npx tsx scripts/fseq-regression.ts          (check)
 *        npx tsx scripts/fseq-regression.ts --bless   (accept current output as the new golden)
 */
import * as fs from 'fs'
import * as path from 'path'
import { MODELS, STEP_MS, CLOSURE_CMD, validateClosureSafety } from '../src/lib/tesla-channels'
import { analyzePCM } from '../src/lib/audio-analysis'
import { buildFseq, validateFseq } from '../src/lib/fseq'
import type { TeslaModel } from '../src/lib/supabase'

const MODEL_LIST: TeslaModel[] = ['model3', 'modelY', 'modelS', 'modelX', 'cybertruck']
const GOLDEN_PATH = path.join(__dirname, 'fseq-golden.json')

// A fixed, deterministic "song" that the section detector actually bites on. It uses broadband noise
// (seeded LCG — reproducible, no Math.random) with a QUIET-dominant structure and two clearly louder,
// minority "drops", plus a kick on every beat. The detector's threshold is the 62nd percentile of
// smoothed energy, so drops must be the minority for it to find them — that then triggers per-model
// CLOSURE choreography (falcon doors, frunk, mirrors), which is exactly the risky path worth locking.
function synthPCM(seconds = 30, sr = 44100) {
  const n = seconds * sr
  const L = new Float32Array(n), R = new Float32Array(n)
  const beat = (sr * 60) / 120 // 120 BPM
  let seed = 0x2545f491 // deterministic PRNG
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0xffffffff * 2 - 1 }
  // energy by time (s): long quiet intro → DROP → long breakdown → DROP2 (drops ≈ 37% of the song)
  const level = (t: number) =>
    t < 8 ? 0.14 :
    t < 11 ? 0.14 + 0.86 * ((t - 8) / 3) : // build
    t < 16 ? 1.0 :                          // DROP (5s)
    t < 24 ? 0.14 :                         // breakdown (8s)
    1.0                                     // DROP 2 (6s)
  for (let i = 0; i < n; i++) {
    const t = i / sr
    const beatPos = (i % beat) / beat
    const kick = Math.sin(2 * Math.PI * 55 * t) * Math.exp(-beatPos * 12) // beat transient
    const noise = rnd()                                                   // broadband content
    const s = (kick * 0.7 + noise * 0.5) * level(t)
    L[i] = s * 0.85
    R[i] = (kick * 0.7 + rnd() * 0.5) * level(t) * 0.85                   // decorrelated R channel
  }
  return { L, R, sr }
}

function hashFrames(frames: Uint8Array[]): string {
  let h = 0x811c9dc5 // FNV-1a
  for (const fr of frames) for (let i = 0; i < fr.length; i++) { h ^= fr[i]; h = Math.imul(h, 0x01000193) }
  return (h >>> 0).toString(16).padStart(8, '0')
}

const bless = process.argv.includes('--bless')
let golden: Record<string, string> = {}
try { golden = JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf8')) } catch { /* first run */ }

const { L, R, sr } = synthPCM()
const stepMs = Math.round(STEP_MS)
const newGolden: Record<string, string> = {}
let failures = 0

for (const model of MODEL_LIST) {
  const def = MODELS[model]
  const res = analyzePCM(L, R, sr, def.zones, def.channelCount, { autoClosures: true, model, preset: 'balanced' })
  const fseq = buildFseq(def.channelCount, res.frames.length, stepMs, res.frames)
  const conf = validateFseq(fseq.buffer as ArrayBuffer, def.channelCount)
  const safety = validateClosureSafety(fseq, model)
  const hash = hashFrames(res.frames)
  newGolden[model] = hash
  // how many frames drive a closure channel — confirms the harness exercises per-model closures
  const closureCh = def.zones.filter(z => z.type === 'closure').map(z => z.channel)
  const closureFrames = res.frames.filter(fr => closureCh.some(c => fr[c] > 0)).length

  const problems: string[] = []
  if (!conf.ok) problems.push(`conformance: ${conf.errors.join('; ')}`)
  if (!safety.ok) problems.push(`closure-safety: ${safety.reason}`)
  if (res.frames.some(fr => fr.length !== def.channelCount)) problems.push('frame width != channelCount')
  if (!bless && golden[model] && golden[model] !== hash) {
    problems.push(`OUTPUT CHANGED: golden ${golden[model]} != ${hash} — re-bless with --bless if intentional`)
  }

  if (problems.length) { failures++; console.log(`✗ ${model.padEnd(11)} ${problems.join(' | ')}`) }
  else console.log(`✓ ${model.padEnd(11)} ${res.frames.length} frames · ${def.channelCount}ch · ${res.dropCount} drops · ${closureFrames} closure-frames · hash ${hash}${golden[model] ? '' : ' (no golden yet)'}`)
}

// ── NEGATIVE closure-safety cases ────────────────────────────────────────────────────────────────
// Each paints an unsafe pattern straight onto closure channels and asserts the validator REJECTS it
// with the right reason. Channels are looked up by id from the authoritative map (never hardcoded).
const CH = Object.fromEntries(
  MODELS.modelX.zones.filter(z => z.closure).map(z => [z.id, z.channel]),
) as Record<string, number>

function craftFseq(frames: number, paint: (fr: Uint8Array[]) => void): Uint8Array {
  const fr = Array.from({ length: frames }, () => new Uint8Array(200))
  paint(fr)
  return buildFseq(200, frames, stepMs, fr)
}

const negatives: { name: string; model: TeslaModel; expect: string; fseq: Uint8Array }[] = [
  {
    name: 'invalid closure command byte', model: 'model3', expect: 'invalid closure byte',
    fseq: craftFseq(200, fr => { fr[50][CH.mirror_l] = 100 }),                 // 100 is not a valid command
  },
  {
    name: 'per-family limit exceeded (mirrors 21 > 20)', model: 'model3', expect: 'mirrors actuations',
    fseq: craftFseq(2000, fr => {
      for (let i = 0; i < 21; i++) for (let f = i * 60; f < i * 60 + 20; f++) fr[f][CH.mirror_l] = CLOSURE_CMD.open
    }),
  },
  {
    name: 'falcon doors actuate simultaneously', model: 'modelX', expect: 'falcon doors actuate',
    fseq: craftFseq(1200, fr => {
      // both doors open on the same frame, held to the end (so only the stagger rule can fire)
      for (let f = 100; f < 1200; f++) { fr[f][CH.falcon_l] = CLOSURE_CMD.open; fr[f][CH.falcon_r] = CLOSURE_CMD.open }
    }),
  },
  {
    name: 'heavy closure blip (liftgate open 2s « 14s travel)', model: 'modelY', expect: 'blip stalls heavy closure',
    fseq: craftFseq(2000, fr => { for (let f = 10; f < 110; f++) fr[f][CH.liftgate] = CLOSURE_CMD.open }),
  },
  {
    name: 'Model X window moves while door moves', model: 'modelX', expect: 'window',
    fseq: craftFseq(1500, fr => {
      for (let f = 0; f < 1500; f++) fr[f][CH.front_door_l] = CLOSURE_CMD.open // held to end → not a blip
      for (let f = 500; f < 700; f++) fr[f][CH.window_fl] = CLOSURE_CMD.open   // window during door travel
    }),
  },
]

console.log('')
for (const t of negatives) {
  const res = validateClosureSafety(t.fseq, t.model)
  if (res.ok) { failures++; console.log(`✗ NEGATIVE ${t.name} — validator ACCEPTED an unsafe fseq`) }
  else if (!res.reason?.includes(t.expect)) { failures++; console.log(`✗ NEGATIVE ${t.name} — rejected for the wrong reason: ${res.reason}`) }
  else console.log(`✓ NEGATIVE ${t.name} → rejected (${res.reason})`)
}

// Safe control: a plain mirror gesture must PASS (proves the guards aren't rejecting everything).
{
  const safe = craftFseq(500, fr => { for (let f = 100; f < 220; f++) fr[f][CH.mirror_l] = CLOSURE_CMD.open })
  const res = validateClosureSafety(safe, 'model3')
  if (!res.ok) { failures++; console.log(`✗ CONTROL safe mirror gesture was rejected: ${res.reason}`) }
  else console.log('✓ CONTROL safe mirror gesture passes')
}

if (bless) {
  fs.writeFileSync(GOLDEN_PATH, JSON.stringify(newGolden, null, 2) + '\n')
  console.log(`\nGolden hashes written to ${path.relative(process.cwd(), GOLDEN_PATH)}.`)
} else if (failures) {
  console.log(`\n${failures} model(s) FAILED.`)
  process.exit(1)
} else {
  console.log('\nAll models pass conformance, safety, and regression.')
}
