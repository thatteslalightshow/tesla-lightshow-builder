'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { MODELS, generateFrames } from '@/lib/tesla-channels';
import type { TeslaModel, ShowStyle } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Props {
  teslaModel: TeslaModel;
  style: ShowStyle;
  intensity: number;
  bpm: number;
  previewBeat?: number | null;
  customFrames?: Uint8Array[] | null;       // audio-analyzed frames override generated frames
  paintColor?: number;                       // 0xRRGGBB body color; defaults to model signature color
  audioTriggerFrames?: Set<number> | null;  // frame indices with beat onset → animates doors
}
interface Tooltip { label: string; x: number; y: number }
interface DoorAnim { group: THREE.Group; axis: 'x' | 'y'; openAngle: number; current: number }

// ─── Constants ────────────────────────────────────────────────────────────────
const GLTF_PATHS: Record<TeslaModel, string> = {
  model3:     '/models/model3.glb',
  modelY:     '/models/modelY.glb',
  modelS:     '/models/modelS.glb',
  modelX:     '/models/modelX.glb',
  cybertruck: '/models/cybertruck.glb',
};

// ─── Materials ────────────────────────────────────────────────────────────────
const DEFAULT_PAINT: Record<TeslaModel, number> = {
  model3:     0xcc1f1f,  // Multi-Coat Red
  modelY:     0xf0efeb,  // Pearl White
  modelS:     0x4a4d5f,  // Midnight Silver
  modelX:     0x183861,  // Deep Blue Metallic
  cybertruck: 0xb8bfc8,  // Stainless (no paint)
};

function makePaint(color: number, model: TeslaModel): THREE.MeshPhysicalMaterial {
  if (model === 'cybertruck') {
    return new THREE.MeshPhysicalMaterial({
      color: 0xb8bfc8, roughness: 0.20, metalness: 1.0,
      clearcoat: 0.1, clearcoatRoughness: 0.45, envMapIntensity: 2.2,
    });
  }
  return new THREE.MeshPhysicalMaterial({
    color, roughness: 0.10, metalness: 0.55,
    clearcoat: 1.0, clearcoatRoughness: 0.03,
    envMapIntensity: 1.4, reflectivity: 0.95,
  });
}

function makeGlass(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: 0x8aafc4, roughness: 0.0, metalness: 0.0,
    transmission: 0.88, transparent: true, opacity: 0.55,
    ior: 1.52, thickness: 0.12,
    reflectivity: 0.85, envMapIntensity: 1.8,
  });
}
const RUBBER = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.88, metalness: 0.04 });
const RIM    = new THREE.MeshStandardMaterial({ color: 0x909aaa, roughness: 0.22, metalness: 0.92 });
const BRAKE  = new THREE.MeshStandardMaterial({ color: 0xcc4400, roughness: 0.55, metalness: 0.18 });
const CHROME = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.08, metalness: 1.0 });
const FLOOR  = new THREE.MeshStandardMaterial({ color: 0x0c0c13, roughness: 0.96, metalness: 0.0 });
const EMISSIVE_WHITE = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.8, roughness: 0.1 });

// ─── Side profile shapes per model ───────────────────────────────────────────
function pts(pairs: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < pairs.length; i += 2) out.push([pairs[i], pairs[i + 1]]);
  return out;
}

function buildProfile(model: TeslaModel): THREE.Shape {
  const s = new THREE.Shape();

  const profiles: Record<TeslaModel, () => void> = {
    model3: () => {
      // Fastback sedan — Highland proportions
      s.moveTo(-2.36, 0.10);
      s.lineTo(-2.36, 0.65);
      s.lineTo(-2.08, 0.74);
      s.lineTo(-1.85, 0.76);
      // Fastback rear glass — steep slope
      s.quadraticCurveTo(-1.22, 1.32, -0.58, 1.44);
      // Roof
      s.lineTo(0.78, 1.44);
      // A-pillar curve into hood
      s.quadraticCurveTo(1.02, 0.88, 1.18, 0.73);
      // Hood profile
      s.quadraticCurveTo(1.60, 0.71, 1.92, 0.68);
      // Front fascia — smooth curve down
      s.quadraticCurveTo(2.28, 0.62, 2.36, 0.38);
      s.lineTo(2.36, 0.10);
      s.closePath();
    },
    modelY: () => {
      // Taller SUV roofline
      s.moveTo(-2.40, 0.10);
      s.lineTo(-2.40, 0.68);
      s.lineTo(-2.18, 0.76);
      // Liftgate — nearly vertical then curves to roof
      s.quadraticCurveTo(-1.80, 1.30, -1.40, 1.62);
      s.lineTo(0.82, 1.62);
      // A-pillar
      s.quadraticCurveTo(1.06, 0.90, 1.24, 0.78);
      // Hood
      s.quadraticCurveTo(1.62, 0.74, 1.96, 0.70);
      s.quadraticCurveTo(2.26, 0.64, 2.40, 0.42);
      s.lineTo(2.40, 0.10);
      s.closePath();
    },
    modelS: () => {
      // Long fastback sedan
      s.moveTo(-2.51, 0.10);
      s.lineTo(-2.51, 0.62);
      s.lineTo(-2.12, 0.72);
      s.lineTo(-1.92, 0.75);
      // Very shallow, long fastback
      s.quadraticCurveTo(-1.30, 1.34, -0.52, 1.43);
      s.lineTo(0.88, 1.43);
      s.quadraticCurveTo(1.08, 0.84, 1.24, 0.71);
      s.quadraticCurveTo(1.68, 0.68, 2.05, 0.65);
      s.quadraticCurveTo(2.36, 0.58, 2.51, 0.34);
      s.lineTo(2.51, 0.10);
      s.closePath();
    },
    modelX: () => {
      // Tall SUV, similar to Y but larger
      s.moveTo(-2.52, 0.10);
      s.lineTo(-2.52, 0.70);
      s.lineTo(-2.22, 0.78);
      s.quadraticCurveTo(-1.82, 1.38, -1.30, 1.68);
      s.lineTo(0.90, 1.68);
      s.quadraticCurveTo(1.10, 0.92, 1.30, 0.78);
      s.quadraticCurveTo(1.68, 0.74, 2.02, 0.70);
      s.quadraticCurveTo(2.34, 0.64, 2.52, 0.44);
      s.lineTo(2.52, 0.10);
      s.closePath();
    },
    cybertruck: () => {
      // ALL straight lines — stainless steel angular panels
      // Rear bed wall, step up to cab, flat roof, angled windshield
      s.moveTo(-2.84, 0.10);
      s.lineTo(-2.84, 0.94);   // bed rear wall top
      s.lineTo(-0.84, 0.94);   // bed front wall top (step)
      s.lineTo(-0.84, 1.79);   // cab rear top
      s.lineTo(0.56, 1.79);    // flat cab roof
      // Steep straight-line windshield
      s.lineTo(1.84, 0.99);    // windshield base / hood height
      s.lineTo(2.84, 0.99);    // flat hood
      s.lineTo(2.84, 0.82);    // front face top
      s.lineTo(2.62, 0.10);    // angular front bottom
      s.closePath();
    },
  };

  profiles[model]();
  return s;
}

// ─── Wheel helper ─────────────────────────────────────────────────────────────
function addWheel(scene: THREE.Object3D, x: number, y: number, z: number, r: number, w: number) {
  const addC = (rIn: number, rOut: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rIn, rOut, w, 36), mat);
    m.rotation.z = Math.PI / 2; m.position.set(x, y, z); m.castShadow = true; scene.add(m);
  };
  addC(r, r, RUBBER);        // tyre
  addC(r * 0.64, r * 0.64, RIM);     // rim
  addC(r * 0.42, r * 0.42, BRAKE);   // brake disc
  addC(r * 0.13, r * 0.13, CHROME);  // centre hub
  // Spoke detail
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(w + 0.01, r * 0.10, r * 0.44), RIM);
    spoke.rotation.z = Math.PI / 2;
    spoke.rotation.x = angle;
    spoke.position.set(x, y, z);
    scene.add(spoke);
  }
}

// ─── Mirror helper ────────────────────────────────────────────────────────────
function addMirror(scene: THREE.Object3D, x: number, y: number, z: number, side: -1 | 1, bMat: THREE.Material) {
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 0.14), bMat);
  arm.position.set(x, y, z + side * 0.08);
  scene.add(arm);
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.04), bMat);
  housing.position.set(x - 0.02, y, z + side * 0.17);
  housing.castShadow = true; scene.add(housing);
  const lens = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.11, 0.012), makeGlass());
  lens.position.set(x - 0.02, y, z + side * 0.19);
  scene.add(lens);
}

// ─── Door builder ──────────────────────────────────────────────────────────────
function buildDoors(
  model: TeslaModel,
  halfW: number, groundY: number,
  bMat: THREE.Material, scene: THREE.Object3D,
): DoorAnim[] {
  const anims: DoorAnim[] = [];
  const THICK = 0.042;
  const OPEN = 1.22; // ~70°

  const cfg: Record<TeslaModel, { a: number; b: number; c: number; dh: number; roofY?: number }> = {
    model3:     { a: 0.90, b: -0.30, c: -1.58, dh: 0.70 },
    modelY:     { a: 0.90, b: -0.30, c: -1.60, dh: 0.76 },
    modelS:     { a: 0.96, b: -0.35, c: -1.70, dh: 0.68 },
    modelX:     { a: 0.94, b: -0.36, c: -1.72, dh: 0.74, roofY: 1.68 },
    cybertruck: { a: 1.80, b:  0.18, c:  0.18, dh: 0.82 },
  };
  const { a, b, c, dh, roofY } = cfg[model];

  function regularDoor(hingeX: number, len: number, sideZ: number, dir: -1 | 1) {
    const g = new THREE.Group();
    g.position.set(hingeX, groundY + dh / 2, sideZ);
    scene.add(g);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(len - 0.02, dh, THICK), bMat);
    mesh.position.set(-(len / 2), 0, dir * THICK / 2);
    mesh.castShadow = true;
    g.add(mesh);
    // Handle
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.022, 0.026), CHROME);
    h.position.set(-(len * 0.52), 0.04, dir * (THICK / 2 + 0.014));
    g.add(h);
    anims.push({ group: g, axis: 'y', openAngle: dir * -OPEN, current: 0 });
  }

  if (model === 'cybertruck') {
    regularDoor(a, a - b, -(halfW + 0.002), -1);
    regularDoor(a, a - b,  (halfW + 0.002),  1);
  } else if (model === 'modelX' && roofY) {
    // Front conventional doors
    regularDoor(a, a - b, -(halfW + 0.002), -1);
    regularDoor(a, a - b,  (halfW + 0.002),  1);

    // Falcon Wing doors: hinge at roof edge, swing UP and OUT
    const fwSpan = b - c;
    const fwMidX = (b + c) / 2;
    const fwDoorH = roofY - groundY - dh - 0.06;

    for (const side of [-1, 1] as const) {
      const g = new THREE.Group();
      // Hinge at roofline, left or right edge
      g.position.set(fwMidX, roofY, side * halfW);
      scene.add(g);

      // Door panel hangs DOWN from hinge
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(fwSpan - 0.03, fwDoorH, THICK), bMat);
      mesh.position.set(0, -(fwDoorH / 2), side * THICK / 2);
      mesh.castShadow = true;
      g.add(mesh);

      // Inner sill trim strip along bottom edge
      const trim = new THREE.Mesh(new THREE.BoxGeometry(fwSpan - 0.05, 0.04, 0.06), CHROME);
      trim.position.set(0, -(fwDoorH - 0.02), side * (THICK / 2 + 0.03));
      g.add(trim);

      // Interior LED strip visible on underside of door
      const led = new THREE.Mesh(new THREE.BoxGeometry(fwSpan - 0.10, 0.02, 0.02), EMISSIVE_WHITE);
      led.position.set(0, -(fwDoorH - 0.03), side * (-THICK / 2 - 0.01));
      g.add(led);

      // Falcon wing opens OUT then UP: positive X rotation for left, negative for right
      // side=-1 (left): +X rotation swings bottom toward -Z (outward) then up ✓
      // side=+1 (right): -X rotation swings bottom toward +Z (outward) then up ✓
      anims.push({ group: g, axis: 'x', openAngle: -side * 1.68, current: 0 });
    }
  } else {
    // 4-door sedan / SUV
    regularDoor(a, a - b, -(halfW + 0.002), -1);
    regularDoor(a, a - b,  (halfW + 0.002),  1);
    regularDoor(b, b - c, -(halfW + 0.002), -1);
    regularDoor(b, b - c,  (halfW + 0.002),  1);
  }

  return anims;
}

// ─── Window panels ────────────────────────────────────────────────────────────
function addWindows(model: TeslaModel, halfW: number, scene: THREE.Object3D) {
  const gm = makeGlass();

  function plane(cx: number, cy: number, cz: number, pw: number, ph: number, ry = 0, rz = 0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), gm);
    m.position.set(cx, cy, cz);
    m.rotation.y = ry;
    m.rotation.z = rz;
    scene.add(m);
  }

  type WCfg = { wsBase: [number,number]; wsTop: [number,number]; rearBase: [number,number]; rearTop: [number,number]; sideY: number; sideH: number; fWinX: number; fWinW: number; rWinX: number; rWinW: number };

  const c: Record<TeslaModel, WCfg> = {
    model3: {
      wsBase:[1.18,0.73], wsTop:[0.78,1.44], rearBase:[-1.85,0.76], rearTop:[-0.58,1.44],
      sideY:1.09, sideH:0.40, fWinX:0.30, fWinW:1.08, rWinX:-0.94, rWinW:1.02,
    },
    modelY: {
      wsBase:[1.24,0.78], wsTop:[0.82,1.62], rearBase:[-1.55,0.78], rearTop:[-1.40,1.62],
      sideY:1.18, sideH:0.47, fWinX:0.30, fWinW:1.08, rWinX:-0.94, rWinW:1.02,
    },
    modelS: {
      wsBase:[1.24,0.71], wsTop:[0.88,1.43], rearBase:[-1.92,0.75], rearTop:[-0.52,1.43],
      sideY:1.06, sideH:0.38, fWinX:0.31, fWinW:1.18, rWinX:-1.02, rWinW:1.10,
    },
    modelX: {
      wsBase:[1.30,0.78], wsTop:[0.90,1.68], rearBase:[-1.65,0.78], rearTop:[-1.30,1.68],
      sideY:1.22, sideH:0.48, fWinX:0.30, fWinW:1.16, rWinX:-1.04, rWinW:1.10,
    },
    cybertruck: {
      wsBase:[1.84,0.99], wsTop:[0.56,1.79], rearBase:[-0.84,1.79], rearTop:[-0.84,1.79],
      sideY:1.40, sideH:0.40, fWinX:1.04, fWinW:1.26, rWinX:0, rWinW:0,
    },
  };
  const w = c[model];

  // Windscreen
  {
    const [bx, by] = w.wsBase, [tx, ty] = w.wsTop;
    const cx = (bx + tx) / 2, cy = (by + ty) / 2;
    const dx = bx - tx, dy = ty - by;
    const len = Math.sqrt(dx * dx + dy * dy);
    const rz = Math.atan2(dx, dy);
    plane(cx, cy, 0, halfW * 1.95, len, 0, rz);
  }

  // Rear glass (not Cybertruck cab-back)
  if (model !== 'cybertruck') {
    const [bx, by] = w.rearBase, [tx, ty] = w.rearTop;
    const cx = (bx + tx) / 2, cy = (by + ty) / 2;
    const dx = tx - bx, dy = ty - by;
    const len = Math.sqrt(dx * dx + dy * dy);
    const rz = Math.atan2(dx, dy);
    plane(cx, cy, 0, halfW * 1.80, len, 0, rz);
  }

  // Side windows
  for (const side of [-1, 1] as const) {
    const z = side * (halfW + 0.004);
    const ry = side < 0 ? -Math.PI / 2 : Math.PI / 2;
    if (w.fWinW > 0) plane(w.fWinX, w.sideY, z, w.fWinW, w.sideH, ry);
    if (w.rWinW > 0) plane(w.rWinX, w.sideY, z, w.rWinW, w.sideH, ry);
  }
}

// ─── Light zone meshes ────────────────────────────────────────────────────────
function buildLightZones(def: typeof MODELS[TeslaModel], scene: THREE.Scene) {
  const out: { mesh: THREE.Mesh; pl: THREE.PointLight; ch: number; label: string }[] = [];
  const zoneHitboxes: THREE.Mesh[] = [];

  def.zones.forEach(zone => {
    const [x, y, z] = zone.position;

    // Shape each zone to approximate real light geometry
    let geo: THREE.BufferGeometry;
    const isFront = x > 0;
    const isRear = x < 0;
    const isSide = Math.abs(z) > Math.abs(x) * 0.7;

    if (zone.type === 'strip') {
      geo = new THREE.BoxGeometry(isSide ? 0.06 : 0.06, 0.04, isSide ? 0.38 : 0.22);
    } else if (zone.type === 'drl') {
      // DRL strips: thin long horizontal bar
      geo = new THREE.BoxGeometry(0.035, 0.030, 0.34);
    } else if (zone.type === 'headlight') {
      // Boomerang-ish headlight — tall narrow box
      geo = new THREE.BoxGeometry(0.055, 0.12, 0.20);
    } else if (zone.type === 'tail' || zone.type === 'brake') {
      geo = new THREE.BoxGeometry(0.055, 0.11, 0.18);
    } else if (zone.type === 'interior') {
      geo = new THREE.BoxGeometry(0.10, 0.04, 0.22);
    } else {
      geo = new THREE.BoxGeometry(0.055, 0.08, 0.12);
    }

    const mat = new THREE.MeshStandardMaterial({
      color: zone.color,
      emissive: new THREE.Color(zone.color),
      emissiveIntensity: 0.15,
      roughness: 0.05,
      metalness: 0.0,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    // Face front/rear correctly
    if (isSide && !isFront && !isRear) mesh.rotation.y = Math.PI / 2;
    mesh.userData.label = zone.label;
    scene.add(mesh);
    zoneHitboxes.push(mesh);

    const pl = new THREE.PointLight(zone.color, 0, 1.8);
    pl.position.set(x, y, z);
    scene.add(pl);

    out.push({ mesh, pl, ch: zone.channel, label: zone.label });
  });

  return { lightObjs: out, zoneHitboxes };
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TeslaScene({
  teslaModel, style, intensity, bpm, previewBeat,
  customFrames, paintColor, audioTriggerFrames,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [doorsOpen, setDoorsOpen] = useState(false);
  const [falconOpen, setFalconOpen] = useState(false);
  const [gltfStatus, setGltfStatus] = useState<'loading' | 'loaded' | 'procedural'>('loading');

  const animsRef = useRef<DoorAnim[]>([]);
  const lightObjsRef = useRef<ReturnType<typeof buildLightZones>['lightObjs']>([]);
  const frameDataRef = useRef<Uint8Array[]>([]);
  const frameIdxRef = useRef(0);
  const doorsOpenRef = useRef(false);
  const falconOpenRef = useRef(false);
  const previewBeatRef = useRef<number | null>(null);
  const customFramesRef = useRef<Uint8Array[] | null>(null);
  const audioTriggerFramesRef = useRef<Set<number> | null>(null);
  const bMatRef = useRef<THREE.MeshPhysicalMaterial | null>(null);

  // Keep style/intensity/bpm in sync without rebuilding scene
  useEffect(() => {
    const def = MODELS[teslaModel];
    frameDataRef.current = generateFrames(style, intensity, bpm, 40, def);
    frameIdxRef.current = 0;
  }, [teslaModel, style, intensity, bpm]);

  useEffect(() => { doorsOpenRef.current = doorsOpen; }, [doorsOpen]);
  useEffect(() => { falconOpenRef.current = falconOpen; }, [falconOpen]);
  useEffect(() => { previewBeatRef.current = previewBeat ?? null; }, [previewBeat]);
  useEffect(() => { customFramesRef.current = customFrames ?? null; }, [customFrames]);
  useEffect(() => { audioTriggerFramesRef.current = audioTriggerFrames ?? null; }, [audioTriggerFrames]);

  // Live paint color update without scene rebuild
  useEffect(() => {
    if (bMatRef.current && paintColor !== undefined && teslaModel !== 'cybertruck') {
      bMatRef.current.color.setHex(paintColor);
    }
  }, [paintColor, teslaModel]);

  // Rebuild scene when model changes
  useEffect(() => {
    const elRaw = mountRef.current;
    if (!elRaw) return;
    const el: HTMLDivElement = elRaw;

    const def = MODELS[teslaModel];
    const { proportions: p } = def;
    const halfW = p.bodyW / 2;
    const groundY = 0.10;

    // ── Renderer ──────────────────────────────────────────────────────────────
    const w = el.clientWidth || 800;
    const h = el.clientHeight || 480;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    el.appendChild(renderer.domElement);

    // ── Scene ─────────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x09090f);
    scene.fog = new THREE.FogExp2(0x09090f, 0.030);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // ── Camera & Controls ─────────────────────────────────────────────────────
    const dist = p.bodyL * 1.75;
    const camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 180);
    camera.position.set(dist * 0.52, dist * 0.36, dist * 0.90);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.07;
    controls.minDistance = p.bodyL * 0.65; controls.maxDistance = p.bodyL * 5;
    controls.maxPolarAngle = Math.PI / 2 - 0.005;
    controls.target.set(0, p.bodyH * 0.5, 0);
    controls.update();

    // ── Scene Lighting ────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0x10101e, 0.5));
    const sun = new THREE.DirectionalLight(0xffffff, 3.0);
    sun.position.set(7, 12, 6); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -10; sun.shadow.camera.right = 10;
    sun.shadow.camera.top = 10; sun.shadow.camera.bottom = -10;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x5577cc, 0.7);
    fill.position.set(-8, 4, -5); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffeedd, 0.5);
    rim.position.set(0, 4, -10); scene.add(rim);

    // ── Floor ─────────────────────────────────────────────────────────────────
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), FLOOR);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    // Subtle reflection
    const grid = new THREE.GridHelper(40, 40, 0x15152a, 0x15152a);
    (grid.material as THREE.LineBasicMaterial).opacity = 0.6;
    (grid.material as THREE.LineBasicMaterial).transparent = true;
    scene.add(grid);

    // ── Car body: try GLTF, fall back to procedural ──────────────────────────
    const resolvedColor = paintColor ?? DEFAULT_PAINT[teslaModel];
    const bMat = makePaint(resolvedColor, teslaModel);
    bMatRef.current = bMat;

    // Procedural body group — shown immediately; removed if GLTF loads
    const proceduralGroup = new THREE.Group();
    buildProceduralCar(proceduralGroup, teslaModel, p, halfW, groundY, bMat);
    scene.add(proceduralGroup);
    setGltfStatus('loading');

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('/draco/');
    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);
    loader.load(
      GLTF_PATHS[teslaModel],
      (gltf: { scene: THREE.Group }) => {
        const gltfScene = gltf.scene;
        // Scale and centre
        const box = new THREE.Box3().setFromObject(gltfScene);
        const size = box.getSize(new THREE.Vector3());
        const centre = box.getCenter(new THREE.Vector3());
        const scale = p.bodyL / size.x;
        gltfScene.scale.setScalar(scale);
        gltfScene.position.x = -centre.x * scale;
        gltfScene.position.y = -box.min.y * scale;
        gltfScene.position.z = -centre.z * scale;
        // Apply PBR materials: detect by mesh + material name, keep originals for unknown
        gltfScene.traverse(child => {
          if (!(child instanceof THREE.Mesh)) return;
          child.castShadow = true; child.receiveShadow = true;
          const mat = Array.isArray(child.material) ? child.material[0] : child.material;
          const nm = ((child.name || '') + ' ' + ((mat as THREE.Material)?.name || '')).toLowerCase();

          if (/glass|window|wind|windscreen|windshield|visor/.test(nm)) {
            child.material = makeGlass();
          } else if (/tyre|tire|rubber/.test(nm)) {
            child.material = RUBBER;
          } else if (/\brim\b|alloy|wheel_hub|wheelrim/.test(nm)) {
            child.material = RIM;
          } else if (/chrome|trim|badge|molding/.test(nm)) {
            child.material = CHROME;
          } else if (/seat|leather|fabric|carpet|steer|dash|console/.test(nm)) {
            // keep original interior material
          } else {
            // body panels and unknown surfaces: apply paint
            child.material = bMat;
          }
        });
        // Replace procedural with GLTF
        scene.remove(proceduralGroup);
        scene.add(gltfScene);
        setGltfStatus('loaded');
      },
      undefined,
      () => {
        // No GLTF file found — procedural already in scene, nothing to do
        setGltfStatus('procedural');
      },
    );

    // ── Doors ─────────────────────────────────────────────────────────────────
    animsRef.current = buildDoors(teslaModel, halfW, groundY, bMat, scene);

    // ── Windows ───────────────────────────────────────────────────────────────
    addWindows(teslaModel, halfW, scene);

    // ── Mirrors ───────────────────────────────────────────────────────────────
    const mY = teslaModel === 'cybertruck' ? 1.22 : (p.bodyL > 5 ? 0.88 : 0.84);
    const mX = p.bodyL / 2 - 1.35;
    addMirror(scene, mX, mY, -halfW, -1, bMat);
    addMirror(scene, mX, mY,  halfW,  1, bMat);

    // ── Light zones ───────────────────────────────────────────────────────────
    const { lightObjs, zoneHitboxes } = buildLightZones(def, scene);
    lightObjsRef.current = lightObjs;
    frameDataRef.current = generateFrames(style, intensity, bpm, 40, def);

    // ── Raycaster tooltip ─────────────────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    function onMouseMove(e: MouseEvent) {
      const rect = el.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(zoneHitboxes);
      if (hits.length > 0) {
        setTooltip({ label: (hits[0].object as THREE.Mesh).userData.label, x: e.clientX - rect.left, y: e.clientY - rect.top });
      } else {
        setTooltip(null);
      }
    }
    el.addEventListener('mousemove', onMouseMove);

    // ── Animation loop ────────────────────────────────────────────────────────
    let raf: number;
    let lastFrame = 0;
    let autoDoorCounter = 0; // frames remaining for beat-triggered door open
    const FMS = 1000 / 20;

    function animate(now: number) {
      raf = requestAnimationFrame(animate);
      controls.update();

      if (now - lastFrame >= FMS) {
        lastFrame = now;
        // Use audio-analyzed frames if available, fall back to generated
        const frames = customFramesRef.current ?? frameDataRef.current;
        if (frames.length > 0) {
          let frameIdx: number;
          const pb = previewBeatRef.current;
          if (pb !== null) {
            frameIdx = Math.floor(pb * (FMS / 1000) * 20) % frames.length;
          } else {
            frameIdx = frameIdxRef.current % frames.length;
            frameIdxRef.current++;
          }
          const frame = frames[frameIdx];

          // Beat-driven door animation: open on onset, auto-close after ~1.3s
          const triggers = audioTriggerFramesRef.current;
          if (triggers?.has(frameIdx) && autoDoorCounter === 0) {
            autoDoorCounter = 26;
          }
          if (autoDoorCounter > 0) autoDoorCounter--;

          lightObjs.forEach(({ mesh, pl, ch }) => {
            const b = frame[ch] / 255;
            (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.12 + b * 4.5;
            pl.intensity = b * 2.8;
          });
        }
      }

      // Door / falcon wing animations (manual OR beat-triggered)
      const beatOpen = autoDoorCounter > 0;
      animsRef.current.forEach(a => {
        const isFW = a.axis === 'x';
        const shouldOpen = beatOpen || (isFW ? falconOpenRef.current : doorsOpenRef.current);
        const target = shouldOpen ? a.openAngle : 0;
        a.current = THREE.MathUtils.lerp(a.current, target, 0.075);
        a.group.rotation[a.axis] = a.current;
      });

      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(animate);

    // ── Resize observer ───────────────────────────────────────────────────────
    const obs = new ResizeObserver(() => {
      const nw = el.clientWidth, nh = el.clientHeight;
      camera.aspect = nw / nh; camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    });
    obs.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('mousemove', onMouseMove);
      obs.disconnect(); controls.dispose(); renderer.dispose(); dracoLoader.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
      setTooltip(null); setDoorsOpen(false); setFalconOpen(false);
    };
  }, [teslaModel]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%', cursor: 'grab' }} />

      {/* GLTF loading badge */}
      {gltfStatus === 'loaded' && (
        <div style={{ position: 'absolute', top: 10, right: 12, fontSize: 10, fontWeight: 600, color: 'rgba(0,232,135,0.7)', letterSpacing: '.5px' }}>
          HD MODEL
        </div>
      )}

      {/* Hover tooltip */}
      {tooltip && (
        <div style={{
          position: 'absolute', left: tooltip.x + 14, top: tooltip.y + 8,
          background: 'rgba(6,6,16,0.94)', border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 6, padding: '4px 10px', fontSize: 12, color: '#dde',
          pointerEvents: 'none', whiteSpace: 'nowrap', backdropFilter: 'blur(10px)', zIndex: 10,
        }}>
          {tooltip.label}
        </div>
      )}

      {/* Door controls */}
      <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 8, pointerEvents: 'none' }}>
        <button onClick={() => setDoorsOpen(v => !v)} style={{
          pointerEvents: 'auto', padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600,
          background: doorsOpen ? 'rgba(0,232,135,0.14)' : 'rgba(255,255,255,0.07)',
          border: `1px solid ${doorsOpen ? 'rgba(0,232,135,0.35)' : 'rgba(255,255,255,0.14)'}`,
          color: doorsOpen ? '#00e887' : '#bbb', cursor: 'pointer', backdropFilter: 'blur(8px)', transition: 'all .2s',
        }}>
          {doorsOpen ? 'Close Doors' : 'Open Doors'}
        </button>

        {teslaModel === 'modelX' && (
          <button onClick={() => setFalconOpen(v => !v)} style={{
            pointerEvents: 'auto', padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600,
            background: falconOpen ? 'rgba(80,160,255,0.14)' : 'rgba(255,255,255,0.07)',
            border: `1px solid ${falconOpen ? 'rgba(80,160,255,0.35)' : 'rgba(255,255,255,0.14)'}`,
            color: falconOpen ? '#50a0ff' : '#bbb', cursor: 'pointer', backdropFilter: 'blur(8px)', transition: 'all .2s',
          }}>
            {falconOpen ? 'Close Falcon Wings' : 'Falcon Wings ↑'}
          </button>
        )}
      </div>

      <div style={{ position: 'absolute', bottom: 50, right: 14, fontSize: 10, color: 'rgba(255,255,255,0.24)', pointerEvents: 'none' }}>
        drag · scroll · hover lights
      </div>
    </div>
  );
}

// ─── Procedural car builder (fallback when no GLTF) ───────────────────────────
function buildProceduralCar(
  scene: THREE.Object3D,
  model: TeslaModel,
  p: { bodyL: number; bodyW: number; bodyH: number; truckBed?: { bedL: number; bedW: number; bedH: number; bedX: number } },
  halfW: number,
  groundY: number,
  bMat: THREE.MeshPhysicalMaterial,
) {
  // Main body extrusion
  const profile = buildProfile(model);
  const bodyGeom = new THREE.ExtrudeGeometry(profile, { steps: 1, depth: p.bodyW, bevelEnabled: false });
  const bodyMesh = new THREE.Mesh(bodyGeom, bMat);
  bodyMesh.position.z = -halfW;
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  scene.add(bodyMesh);

  // Cybertruck: stainless panel seam lines
  if (model === 'cybertruck') {
    const lineMat = new THREE.LineBasicMaterial({ color: 0x555566, linewidth: 1 });
    const seamXs = [1.84, 0.56, -0.84];
    for (const sx of seamXs) {
      const pts = [new THREE.Vector3(sx, groundY + 0.10, -halfW - 0.01), new THREE.Vector3(sx, 1.79, -halfW - 0.01)];
      const geom = new THREE.BufferGeometry().setFromPoints(pts);
      scene.add(new THREE.Line(geom, lineMat));
      const pts2 = [new THREE.Vector3(sx, groundY + 0.10, halfW + 0.01), new THREE.Vector3(sx, 1.79, halfW + 0.01)];
      const g2 = new THREE.BufferGeometry().setFromPoints(pts2);
      scene.add(new THREE.Line(g2, lineMat));
    }
    // Truck bed floor
    if (p.truckBed) {
      const { bedL, bedW, bedX } = p.truckBed;
      const bf = new THREE.Mesh(new THREE.BoxGeometry(bedL - 0.06, 0.03, bedW - 0.10),
        new THREE.MeshStandardMaterial({ color: 0x0f0f18, roughness: 0.92, metalness: 0.5 }));
      bf.position.set(bedX, groundY + 0.46, 0);
      scene.add(bf);
    }
  }

  // Wheels
  const wheelR = model === 'cybertruck' ? 0.42 : 0.36;
  const wheelW = model === 'cybertruck' ? 0.28 : 0.22;
  const axleY = groundY + wheelR;
  const axleX = p.bodyL * 0.305;
  const axleZ = halfW + wheelW * 0.18;
  for (const sx of [1, -1]) for (const sz of [1, -1]) addWheel(scene, sx * axleX, axleY, sz * axleZ, wheelR, wheelW);

  // Rooftop accent / panoramic roof tint
  if (model !== 'cybertruck') {
    const roofY = model === 'modelX' ? 1.68 : model === 'modelY' ? 1.62 : 1.44;
    const roofGlass = new THREE.Mesh(new THREE.BoxGeometry(p.bodyL * 0.42, 0.018, p.bodyW * 0.86), makeGlass());
    roofGlass.position.set(-0.05, roofY - 0.008, 0);
    scene.add(roofGlass);
  }

  // Front bumper lower panel
  const fBump = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, p.bodyW), bMat);
  fBump.position.set(p.bodyL / 2 + 0.04, groundY + 0.24, 0);
  scene.add(fBump);

  // Rear bumper
  const rBump = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.20, p.bodyW), bMat);
  rBump.position.set(-p.bodyL / 2 - 0.04, groundY + 0.24, 0);
  scene.add(rBump);
}
