// Tesla light-show channels — matches the OFFICIAL teslamotors/light-show xLights
// model (Model S "All Lights and Closures" superset, used for every vehicle).
// Channel order is authoritative; do not reorder. 48 total (46 named + 2 pad).
// Coordinate system: X = front(+)/rear(-), Y = up(+), Z = right(+)/left(-), metres.

import type { TeslaModel, ShowStyle } from '@/lib/supabase'

// Frame rate. Tesla supports 15–100ms steps; 20ms (50fps) recommended.
export const FPS = 50
export const STEP_MS = 1000 / FPS   // 20ms
export const CHANNEL_COUNT = 48     // Tesla validator requires exactly 48 (or 200)

export type LightType =
  | 'headlight' | 'highbeam' | 'drl' | 'fog'
  | 'turn_front' | 'turn_rear' | 'tail' | 'brake'
  | 'reverse' | 'plate' | 'marker' | 'closure'

// Closure families (for per-show actuation limits)
export type ClosureFamily =
  | 'falcon_doors' | 'front_doors' | 'mirrors' | 'windows'
  | 'liftgate' | 'door_handles' | 'charge_port'

// ─── Closure command encoding (xLights "On" effect brightness → fseq byte) ──────
// Verified against a real Tesla lightshow.fseq: floor(percent x 255).
export const CLOSURE_CMD = {
  idle:  0,
  open:  63,   // 25%  floor(63.75)
  dance: 127,  // 50%  floor(127.5)
  close: 191,  // 75%  floor(191.25)
  stop:  255,  // 100%
} as const
export type ClosureCommand = keyof typeof CLOSURE_CMD

// ─── Per-closure actuation limits per show (car rejects shows that exceed) ──────
export const CLOSURE_LIMITS: Record<ClosureFamily, number> = {
  liftgate: 6, mirrors: 20, charge_port: 3, windows: 6,
  door_handles: 20, front_doors: 6, falcon_doors: 6,
}

// Only these can Dance, and a closure must already be OPEN before a dance takes
// effect (Tesla rule). Used by validation + the auto-choreographer.
export const DANCE_SUPPORTED: Set<ClosureFamily> = new Set(['liftgate', 'charge_port', 'windows', 'falcon_doors'])

// Approx seconds to fully actuate (Tesla: ~2s mirrors/handles/charge → ~22s front
// doors). Used to PRE-FIRE an open so the closure lands open exactly on the drop.
export const CLOSURE_DURATIONS: Record<ClosureFamily, number> = {
  mirrors: 2, door_handles: 2, charge_port: 2, windows: 4,
  liftgate: 6, falcon_doors: 12, front_doors: 22,
}

export interface LightZone {
  id: string
  label: string
  channel: number                          // 0-indexed FSEQ channel (authoritative)
  position: [number, number, number]       // [x, y, z] metres (procedural fallback)
  nx: number; ny: number; nz: number        // normalized car coords (front+, up 0..1, right+)
  color: number                            // Three.js 0xRRGGBB
  type: LightType
  closure?: ClosureFamily                   // present only on closure channels
}

export interface CarProportions {
  bodyL: number; bodyW: number; bodyH: number
  cabinL: number; cabinW: number; cabinH: number
  cabinX: number
  roofStyle: 'fastback' | 'suv' | 'angular'
  truckBed?: { bedL: number; bedW: number; bedH: number; bedX: number }
}

export interface ModelDefinition {
  model: TeslaModel
  channelCount: number
  zones: LightZone[]
  proportions: CarProportions
}

// ─── Canonical channel table (index = real Tesla fseq channel) ──────────────────
// Positions for the LIGHT channels (0-29) are the authoritative per-channel layout
// decoded from Tesla's official xLights model ("Tesla Model S.xmodel"), normalized:
//   nx = front(+1)/rear(-1)   ny = ground(0)/roof(1)   nz = right(+1)/left(-1)
// Closure channels (30-45) use sensible physical placements (used for future 3D).
type Side = 'L' | 'R' | 'C'
interface ChannelSpec {
  index: number
  id: string
  label: string
  type: LightType
  color: number
  closure?: ClosureFamily
  nx: number   // front(+1) .. rear(-1)
  ny: number   // ground(0) .. roof(1)
  nz: number   // right(+1) .. left(-1)
}

const C = {
  white: 0xffffff, warm: 0xfff0d0, drl: 0xe8e8ff, amber: 0xff8c00,
  red: 0xe8404a, brake: 0xff2020, fog: 0xffffcc, closure: 0x9d6bff,
}

const CHANNELS: ChannelSpec[] = [
  // ── Front lights (positions from Tesla's xLights model) ──
  { index: 0,  id: 'l_outer_main',  label: 'Left Outer Main Beam',  type: 'headlight', color: C.white, nx: +0.941, ny: 0.381, nz: -0.720 },
  { index: 1,  id: 'r_outer_main',  label: 'Right Outer Main Beam', type: 'headlight', color: C.white, nx: +0.941, ny: 0.381, nz: +0.740 },
  { index: 2,  id: 'l_inner_main',  label: 'Left Inner Main Beam',  type: 'highbeam',  color: C.white, nx: +0.966, ny: 0.357, nz: -0.620 },
  { index: 3,  id: 'r_inner_main',  label: 'Right Inner Main Beam', type: 'highbeam',  color: C.white, nx: +0.966, ny: 0.357, nz: +0.640 },
  { index: 4,  id: 'l_signature',   label: 'Left Signature',        type: 'drl',       color: C.drl,   nx: +0.907, ny: 0.476, nz: -0.780 },
  { index: 5,  id: 'r_signature',   label: 'Right Signature',       type: 'drl',       color: C.drl,   nx: +0.907, ny: 0.476, nz: +0.820 },
  { index: 6,  id: 'l_ch4',         label: 'Left Channel 4',        type: 'drl',       color: C.drl,   nx: +0.924, ny: 0.452, nz: -0.720 },
  { index: 7,  id: 'r_ch4',         label: 'Right Channel 4',       type: 'drl',       color: C.drl,   nx: +0.924, ny: 0.452, nz: +0.760 },
  { index: 8,  id: 'l_ch5',         label: 'Left Channel 5',        type: 'drl',       color: C.drl,   nx: +0.949, ny: 0.429, nz: -0.640 },
  { index: 9,  id: 'r_ch5',         label: 'Right Channel 5',       type: 'drl',       color: C.drl,   nx: +0.949, ny: 0.429, nz: +0.680 },
  { index: 10, id: 'l_ch6',         label: 'Left Channel 6',        type: 'drl',       color: C.drl,   nx: +0.975, ny: 0.405, nz: -0.560 },
  { index: 11, id: 'r_ch6',         label: 'Right Channel 6',       type: 'drl',       color: C.drl,   nx: +0.975, ny: 0.405, nz: +0.600 },
  { index: 12, id: 'l_front_turn',  label: 'Left Front Turn',       type: 'turn_front',color: C.amber, nx: +0.907, ny: 0.405, nz: -0.820 },
  { index: 13, id: 'r_front_turn',  label: 'Right Front Turn',      type: 'turn_front',color: C.amber, nx: +0.907, ny: 0.405, nz: +0.860 },
  { index: 14, id: 'l_front_fog',   label: 'Left Front Fog',        type: 'fog',       color: C.fog,   nx: +0.941, ny: 0.071, nz: -0.820 },
  { index: 15, id: 'r_front_fog',   label: 'Right Front Fog',       type: 'fog',       color: C.fog,   nx: +0.941, ny: 0.071, nz: +0.860 },
  { index: 16, id: 'l_aux_park',    label: 'Left Aux Park',         type: 'marker',    color: C.warm,  nx: +0.975, ny: 0.071, nz: -0.740 },
  { index: 17, id: 'r_aux_park',    label: 'Right Aux Park',        type: 'marker',    color: C.warm,  nx: +0.975, ny: 0.071, nz: +0.780 },
  // ── Side markers / repeaters ──
  { index: 18, id: 'l_side_marker', label: 'Left Side Marker',      type: 'marker',    color: C.amber, nx: +1.000, ny: 0.048, nz: -0.660 },
  { index: 19, id: 'r_side_marker', label: 'Right Side Marker',     type: 'marker',    color: C.amber, nx: +1.000, ny: 0.048, nz: +0.700 },
  { index: 20, id: 'l_side_rep',    label: 'Left Side Repeater',    type: 'marker',    color: C.amber, nx: +0.534, ny: 0.476, nz: -0.960 },
  { index: 21, id: 'r_side_rep',    label: 'Right Side Repeater',   type: 'marker',    color: C.amber, nx: +0.534, ny: 0.476, nz: +1.000 },
  // ── Rear lights ──
  { index: 22, id: 'l_rear_turn',   label: 'Left Rear Turn',        type: 'turn_rear', color: C.amber, nx: -0.924, ny: 0.619, nz: -0.720 },
  { index: 23, id: 'r_rear_turn',   label: 'Right Rear Turn',       type: 'turn_rear', color: C.amber, nx: -0.924, ny: 0.619, nz: +0.760 },
  { index: 24, id: 'brake',         label: 'Brake Lights',          type: 'brake',     color: C.brake, nx: -0.788, ny: 0.841, nz: +0.020 },
  { index: 25, id: 'l_tail',        label: 'Left Tail',             type: 'tail',      color: C.red,   nx: -0.938, ny: 0.611, nz: -0.647 },
  { index: 26, id: 'r_tail',        label: 'Right Tail',            type: 'tail',      color: C.red,   nx: -0.938, ny: 0.611, nz: +0.687 },
  { index: 27, id: 'reverse',       label: 'Reverse Lights',        type: 'reverse',   color: C.white, nx: -0.966, ny: 0.619, nz: +0.020 },
  { index: 28, id: 'rear_fog',      label: 'Rear Fog Lights',       type: 'fog',       color: C.fog,   nx: -0.975, ny: 0.619, nz: +0.020 },
  { index: 29, id: 'plate',         label: 'License Plate',         type: 'plate',     color: C.white, nx: -1.000, ny: 0.571, nz: +0.020 },
  // ── Closures (physical placements; invisible until 3D closure animation) ──
  { index: 30, id: 'falcon_l',      label: 'Left Falcon Door',      type: 'closure', color: C.closure, closure: 'falcon_doors', nx: +0.00, ny: 0.88, nz: -0.85 },
  { index: 31, id: 'falcon_r',      label: 'Right Falcon Door',     type: 'closure', color: C.closure, closure: 'falcon_doors', nx: +0.00, ny: 0.88, nz: +0.85 },
  { index: 32, id: 'front_door_l',  label: 'Left Front Door',       type: 'closure', color: C.closure, closure: 'front_doors', nx: +0.30, ny: 0.50, nz: -0.95 },
  { index: 33, id: 'front_door_r',  label: 'Right Front Door',      type: 'closure', color: C.closure, closure: 'front_doors', nx: +0.30, ny: 0.50, nz: +0.95 },
  { index: 34, id: 'mirror_l',      label: 'Left Mirror',           type: 'closure', color: C.closure, closure: 'mirrors', nx: +0.55, ny: 0.72, nz: -0.98 },
  { index: 35, id: 'mirror_r',      label: 'Right Mirror',          type: 'closure', color: C.closure, closure: 'mirrors', nx: +0.55, ny: 0.72, nz: +0.98 },
  { index: 36, id: 'window_fl',     label: 'Left Front Window',     type: 'closure', color: C.closure, closure: 'windows', nx: +0.35, ny: 0.78, nz: -0.95 },
  { index: 37, id: 'window_rl',     label: 'Left Rear Window',      type: 'closure', color: C.closure, closure: 'windows', nx: -0.20, ny: 0.78, nz: -0.95 },
  { index: 38, id: 'window_fr',     label: 'Right Front Window',    type: 'closure', color: C.closure, closure: 'windows', nx: +0.35, ny: 0.78, nz: +0.95 },
  { index: 39, id: 'window_rr',     label: 'Right Rear Window',     type: 'closure', color: C.closure, closure: 'windows', nx: -0.20, ny: 0.78, nz: +0.95 },
  { index: 40, id: 'liftgate',      label: 'Liftgate',              type: 'closure', color: C.closure, closure: 'liftgate', nx: -0.92, ny: 0.82, nz: +0.00 },
  { index: 41, id: 'handle_fl',     label: 'Left Front Door Handle',  type: 'closure', color: C.closure, closure: 'door_handles', nx: +0.35, ny: 0.55, nz: -0.97 },
  { index: 42, id: 'handle_rl',     label: 'Left Rear Door Handle',   type: 'closure', color: C.closure, closure: 'door_handles', nx: -0.20, ny: 0.55, nz: -0.97 },
  { index: 43, id: 'handle_fr',     label: 'Right Front Door Handle', type: 'closure', color: C.closure, closure: 'door_handles', nx: +0.35, ny: 0.55, nz: +0.97 },
  { index: 44, id: 'handle_rr',     label: 'Right Rear Door Handle',  type: 'closure', color: C.closure, closure: 'door_handles', nx: -0.20, ny: 0.55, nz: +0.97 },
  { index: 45, id: 'charge_port',   label: 'Charge Port',           type: 'closure', color: C.closure, closure: 'charge_port', nx: -0.80, ny: 0.50, nz: -0.90 },
]

// Closure channel indices and the set of closure families a model actually has.
export const CLOSURE_CHANNELS = CHANNELS.filter(c => c.type === 'closure').map(c => c.index)

// Channel index → closure family, for enforcing per-closure actuation limits.
export const CLOSURE_FAMILY_BY_CHANNEL: Record<number, ClosureFamily> = Object.fromEntries(
  CHANNELS.filter(c => c.closure).map(c => [c.index, c.closure!]),
) as Record<number, ClosureFamily>

// Which closure families exist per model (others are hidden in the timeline)
export const MODEL_CLOSURES: Record<TeslaModel, ClosureFamily[]> = {
  model3:     ['mirrors', 'windows', 'charge_port', 'liftgate'],
  modelY:     ['mirrors', 'windows', 'charge_port', 'liftgate'],
  modelS:     ['mirrors', 'windows', 'charge_port', 'liftgate', 'door_handles'],
  modelX:     ['mirrors', 'windows', 'charge_port', 'liftgate', 'front_doors', 'falcon_doors'],
  cybertruck: ['mirrors', 'windows', 'charge_port', 'liftgate'],
}

function placeFromSpec(spec: ChannelSpec, p: CarProportions): [number, number, number] {
  // nx/ny/nz are normalized car coords (front+, up, right+) from Tesla's xLights
  // model; scale to each car's length / full height / width.
  const carHeight = p.bodyH + p.cabinH
  const x = spec.nx * (p.bodyL / 2)
  const y = 0.10 + spec.ny * carHeight
  const z = spec.nz * (p.bodyW / 2)
  return [Number(x.toFixed(3)), Number(y.toFixed(3)), Number(z.toFixed(3))]
}

function zonesFor(model: TeslaModel, p: CarProportions): LightZone[] {
  return CHANNELS.map(spec => ({
    id: spec.id, label: spec.label, channel: spec.index,
    position: placeFromSpec(spec, p),
    nx: spec.nx, ny: spec.ny, nz: spec.nz,
    color: spec.color, type: spec.type,
    closure: spec.closure,
  }))
}

// ─── Model registry ───────────────────────────────────────────────────────────
const PROPS: Record<TeslaModel, CarProportions> = {
  model3:     { bodyL: 4.69, bodyW: 1.85, bodyH: 0.72, cabinL: 2.80, cabinW: 1.75, cabinH: 0.65, cabinX: -0.15, roofStyle: 'fastback' },
  modelY:     { bodyL: 4.75, bodyW: 1.92, bodyH: 0.82, cabinL: 2.90, cabinW: 1.82, cabinH: 0.72, cabinX: -0.10, roofStyle: 'suv' },
  modelS:     { bodyL: 4.97, bodyW: 1.96, bodyH: 0.72, cabinL: 3.10, cabinW: 1.86, cabinH: 0.65, cabinX: -0.20, roofStyle: 'fastback' },
  modelX:     { bodyL: 5.04, bodyW: 1.99, bodyH: 0.88, cabinL: 3.00, cabinW: 1.89, cabinH: 0.72, cabinX: -0.10, roofStyle: 'suv' },
  cybertruck: { bodyL: 5.68, bodyW: 2.08, bodyH: 0.99, cabinL: 2.10, cabinW: 1.98, cabinH: 0.72, cabinX: 0.70, roofStyle: 'angular',
                truckBed: { bedL: 1.80, bedW: 2.00, bedH: 0.50, bedX: -1.14 } },
}

export const MODELS: Record<TeslaModel, ModelDefinition> = Object.fromEntries(
  (Object.keys(PROPS) as TeslaModel[]).map(m => [m, {
    model: m, channelCount: CHANNEL_COUNT, zones: zonesFor(m, PROPS[m]), proportions: PROPS[m],
  }])
) as Record<TeslaModel, ModelDefinition>

// ─── Frame generator (lights only; closures stay idle = 0) ──────────────────────
export function generateFrames(
  style: ShowStyle, intensity: number, bpm: number, frames: number, modelDef: ModelDefinition,
): Uint8Array[] {
  const { channelCount, zones } = modelDef
  const lightZones = zones.filter(z => z.type !== 'closure')
  const scale = intensity / 100
  const beatsPerFrame = bpm / (60 * FPS)
  const maxX = Math.max(...lightZones.map(z => Math.abs(z.position[0]))) || 1

  return Array.from({ length: frames }, (_, f) => {
    const frame = new Uint8Array(channelCount)
    const t = f * beatsPerFrame

    lightZones.forEach((zone, zoneIdx) => {
      let brightness = 0
      const isLeft = zone.position[2] < 0
      const sidePhase = isLeft ? 0 : 0.5
      const xNorm = zone.position[0] / maxX
      const distFromCenter = Math.abs(xNorm)

      switch (style) {
        case 'energetic': brightness = Math.sin(t * Math.PI * 2 + zoneIdx * 0.4) > 0.1 ? 1 : 0; break
        case 'wave':      brightness = Math.sin(t * Math.PI * 2 - zoneIdx * 0.35 + sidePhase) * 0.5 + 0.5; break
        case 'strobe':    brightness = Math.floor(t * 2) % 2 === (zoneIdx % 2) ? 1 : 0; break
        case 'chase':     brightness = zoneIdx === Math.floor(t) % lightZones.length ? 1 : 0.03; break
        case 'pulse':     brightness = Math.pow(Math.sin(t * Math.PI) * 0.5 + 0.5, 2); break
        case 'ripple':    brightness = Math.max(0, Math.sin((t * 1.5 - distFromCenter * 2) * Math.PI)); break
        case 'bounce': {
          const tri = Math.abs(((t * 0.5) % 2) - 1)
          const pos = tri * 2 - 1
          brightness = Math.max(0, 1 - Math.abs(xNorm - pos) * 2.2)
          break
        }
        case 'twinkle': {
          const tick = Math.floor(t * 4)
          const h = Math.sin((zoneIdx + 1) * 12.9898 + tick * 78.233) * 43758.5453
          brightness = (h - Math.floor(h)) > 0.78 ? 1 : 0.02
          break
        }
      }
      frame[zone.channel] = Math.round(Math.min(brightness * scale, 1) * 255)
    })
    return frame
  })
}

export function getChannelCount(_model: TeslaModel): number {
  return CHANNEL_COUNT
}

// Serialized manual-edit data persisted on a show (JSON-safe).
export interface EditData {
  customBlocks: Record<number, number[]>                       // light channel → beat indices (full = 255)
  closureBlocks: Record<number, Record<number, ClosureCommand>> // closure channel → beat → command
  beats: number                                                 // loop length in beats
  autoClosures?: boolean                                        // opt-in: auto-choreograph closures to the song
  mixPreset?: string                                            // genre/vibe preset key for the audio engine
}

// True only when there are MANUAL edits (which override the audio engine).
// `autoClosures` alone does NOT count — it's a flag for the audio-reactive path.
export function hasEdits(ed?: EditData | null): boolean {
  if (!ed) return false
  return Object.keys(ed.customBlocks ?? {}).length > 0 || Object.keys(ed.closureBlocks ?? {}).length > 0
}

// Build a `beats`-long loop of frames from manual edit data (lights + closures).
export function buildEditFrames(ed: EditData, bpm: number, channelCount: number): Uint8Array[] {
  const fpb = (60 / bpm) * FPS
  const total = Math.max(1, Math.ceil(ed.beats * fpb))
  const frames = Array.from({ length: total }, () => new Uint8Array(channelCount))
  const span = (beatIdx: number): [number, number] => [
    Math.floor(beatIdx * fpb),
    Math.min(total, Math.ceil((beatIdx + 1) * fpb)),
  ]
  for (const [chStr, beatList] of Object.entries(ed.customBlocks ?? {})) {
    const ch = Number(chStr)
    for (const beatIdx of beatList) {
      const [s, e] = span(beatIdx)
      for (let f = s; f < e; f++) frames[f][ch] = 255
    }
  }
  for (const [chStr, lane] of Object.entries(ed.closureBlocks ?? {})) {
    const ch = Number(chStr)
    const family = CLOSURE_FAMILY_BY_CHANNEL[ch]
    const limit = family ? CLOSURE_LIMITS[family] : Infinity
    // Hard cap: keep the EARLIEST actuations within Tesla's per-closure limit and
    // drop the rest, so an exported show can never exceed the published parameters
    // (Open/Close/Dance count; Stop does not). The UI also warns before this.
    let used = 0
    const ordered = Object.entries(lane).sort((a, b) => Number(a[0]) - Number(b[0]))
    for (const [beatStr, cmd] of ordered) {
      if (cmd !== 'stop') {
        if (used >= limit) continue
        used++
      }
      const [s, e] = span(Number(beatStr))
      for (let f = s; f < e; f++) frames[f][ch] = CLOSURE_CMD[cmd]
    }
  }
  return frames
}

// ─── Channel grouping (xLights-style model tree) ────────────────────────────────
export type ZoneGroup = 'Front Lights' | 'Rear Lights' | 'Markers' | 'Closures'

export function zoneGroup(zone: LightZone): ZoneGroup {
  if (zone.type === 'closure') return 'Closures'
  if (zone.type === 'marker') return 'Markers'
  return zone.position[0] >= 0 ? 'Front Lights' : 'Rear Lights'
}

// Closures still defined for legacy callers (UI uses MODEL_CLOSURES via buildTimelineRows)
export interface ClosureDef { id: string; label: string }
export function modelClosures(model: TeslaModel): ClosureDef[] {
  const fams = MODEL_CLOSURES[model]
  return CHANNELS.filter(c => c.closure && fams.includes(c.closure)).map(c => ({ id: c.id, label: c.label }))
}

// ─── Flat timeline tree (Group → Side → channel) ────────────────────────────────
const ZONE_GROUP_ORDER: ZoneGroup[] = ['Front Lights', 'Rear Lights', 'Markers', 'Closures']

export interface TimelineRow {
  kind: 'group' | 'subgroup' | 'leaf'
  id: string
  parentId: string | null
  depth: number
  label: string
  channel?: number
  color?: number
  closure?: ClosureFamily
}

function sideOf(z: LightZone): Side {
  const zPos = z.position[2]
  return zPos < -0.05 ? 'L' : zPos > 0.05 ? 'R' : 'C'
}

function strippedLabel(z: LightZone, group: ZoneGroup): string {
  let label = z.label.replace(/\b(Left|Right)\b/g, '')
  if (group === 'Front Lights' || group === 'Rear Lights') label = label.replace(/\b(Front|Rear)\b/g, '')
  return label.replace(/\s{2,}/g, ' ').trim() || z.label
}

export function buildTimelineRows(modelDef: ModelDefinition): TimelineRow[] {
  const rows: TimelineRow[] = []
  const SIDES: { key: Side; label: string }[] = [
    { key: 'L', label: 'Left' }, { key: 'R', label: 'Right' }, { key: 'C', label: 'Center' },
  ]
  const fams = MODEL_CLOSURES[modelDef.model]

  for (const group of ZONE_GROUP_ORDER) {
    let zones = modelDef.zones.filter(z => zoneGroup(z) === group)
    if (group === 'Closures') zones = zones.filter(z => z.closure && fams.includes(z.closure))
    if (!zones.length) continue

    const gid = `grp:${group}`
    rows.push({ kind: 'group', id: gid, parentId: null, depth: 0, label: group })

    if (group === 'Closures') {
      // closures listed flat (single channels), no side split
      for (const z of zones) {
        rows.push({ kind: 'leaf', id: `z:${z.channel}`, parentId: gid, depth: 1, label: z.label, channel: z.channel, color: z.color, closure: z.closure })
      }
      continue
    }

    const presentSides = SIDES.filter(s => zones.some(z => sideOf(z) === s.key))
    const single = presentSides.length === 1
    for (const side of SIDES) {
      const subZones = zones.filter(z => sideOf(z) === side.key)
      if (!subZones.length) continue
      const sid = `${gid}:${side.key}`
      if (!single) rows.push({ kind: 'subgroup', id: sid, parentId: gid, depth: 1, label: side.label })
      for (const z of subZones) {
        rows.push({
          kind: 'leaf', id: `z:${z.channel}`, parentId: single ? gid : sid,
          depth: single ? 1 : 2, label: strippedLabel(z, group), channel: z.channel, color: z.color,
        })
      }
    }
  }
  return rows
}
