'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment';
import { MODELS, generateFrames } from '@/lib/tesla-channels';
import type { TeslaModel, ShowStyle } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Props { teslaModel: TeslaModel; style: ShowStyle; intensity: number; bpm: number }
interface Tooltip { label: string; x: number; y: number }
interface DoorAnim { group: THREE.Group; axis: 'x' | 'y'; openAngle: number; current: number; open: boolean }

// ─── Materials ────────────────────────────────────────────────────────────────
function makeBodyMat(metalness = 0.75): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: 0x1a1a28, roughness: 0.18, metalness,
    clearcoat: 1.0, clearcoatRoughness: 0.04,
  });
}
const GLASS_MAT = new THREE.MeshPhysicalMaterial({
  color: 0x223344, roughness: 0.0, metalness: 0.05,
  transmission: 0.5, transparent: true, opacity: 0.45, ior: 1.5,
});
const RUBBER_MAT = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.85, metalness: 0.05 });
const RIM_MAT = new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.25, metalness: 0.9 });
const BRAKE_MAT = new THREE.MeshStandardMaterial({ color: 0xcc4400, roughness: 0.6, metalness: 0.2 });
const FLOOR_MAT = new THREE.MeshStandardMaterial({ color: 0x0d0d14, roughness: 0.95, metalness: 0.0 });
const CHROME_MAT = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.1, metalness: 1.0 });

// ─── Body profile shapes ──────────────────────────────────────────────────────
function makeShape(pts: [number, number][], curves?: { at: number; cp: [number, number] }[]): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  const cmap = new Map(curves?.map(c => [c.at, c.cp]) ?? []);
  for (let i = 1; i < pts.length; i++) {
    const cp = cmap.get(i);
    if (cp) shape.quadraticCurveTo(cp[0], cp[1], pts[i][0], pts[i][1]);
    else shape.lineTo(pts[i][0], pts[i][1]);
  }
  shape.closePath();
  return shape;
}

const PROFILES: Record<TeslaModel, () => THREE.Shape> = {
  model3: () => makeShape([
    [-2.36, 0.10], [-2.36, 0.68], [-2.05, 0.75], [-1.82, 0.76],
    [-0.60, 1.44], [0.76, 1.44],
    [1.18, 0.74], [1.52, 0.72],
    [2.36, 0.38], [2.36, 0.10],
  ], [
    { at: 4, cp: [-1.20, 1.38] },   // fastback curve
    { at: 7, cp: [1.05, 0.85] },    // A-pillar junction
    { at: 8, cp: [2.18, 0.62] },    // front fascia
  ]),

  modelY: () => makeShape([
    [-2.40, 0.10], [-2.40, 0.70], [-2.18, 0.76], [-1.55, 0.80],
    [-1.10, 1.62], [0.82, 1.62],
    [1.22, 0.80], [1.55, 0.75],
    [2.40, 0.42], [2.40, 0.10],
  ], [
    { at: 4, cp: [-1.42, 1.44] },
    { at: 7, cp: [1.08, 0.88] },
    { at: 8, cp: [2.22, 0.64] },
  ]),

  modelS: () => makeShape([
    [-2.51, 0.10], [-2.51, 0.64], [-2.10, 0.74], [-1.90, 0.76],
    [-0.55, 1.43], [0.86, 1.43],
    [1.22, 0.72], [1.62, 0.70],
    [2.51, 0.36], [2.51, 0.10],
  ], [
    { at: 4, cp: [-1.25, 1.36] },
    { at: 7, cp: [1.06, 0.84] },
    { at: 8, cp: [2.28, 0.60] },
  ]),

  modelX: () => makeShape([
    [-2.52, 0.10], [-2.52, 0.72], [-2.20, 0.78], [-1.65, 0.80],
    [-1.25, 1.68], [0.92, 1.68],
    [1.28, 0.78], [1.62, 0.74],
    [2.52, 0.44], [2.52, 0.10],
  ], [
    { at: 4, cp: [-1.48, 1.52] },
    { at: 7, cp: [1.10, 0.90] },
    { at: 8, cp: [2.26, 0.66] },
  ]),

  cybertruck: () => makeShape([
    // All straight lines — angular Cybertruck geometry
    [-2.84, 0.10], [-2.84, 0.94],
    // Bed rear wall top
    [-0.82, 0.94],
    // Step up to cab rear
    [-0.82, 1.78],
    // Flat roof
    [0.52, 1.78],
    // Angular windshield (steep, flat panel)
    [1.82, 0.99],
    // Front body (flat hood)
    [2.84, 0.99], [2.84, 0.82],
    [2.60, 0.10],
  ]),
};

// ─── Wheel builder ────────────────────────────────────────────────────────────
function addWheel(scene: THREE.Scene, cx: number, cy: number, cz: number, r: number, w: number) {
  // Tyre
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 32), RUBBER_MAT);
  tyre.rotation.z = Math.PI / 2;
  tyre.position.set(cx, cy, cz);
  tyre.castShadow = true;
  scene.add(tyre);

  // Rim face
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.62, w + 0.01, 32), RIM_MAT);
  rim.rotation.z = Math.PI / 2;
  rim.position.set(cx, cy, cz);
  rim.castShadow = true;
  scene.add(rim);

  // Brake disc (visible through spokes)
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.40, r * 0.40, w * 0.25, 24), BRAKE_MAT);
  disc.rotation.z = Math.PI / 2;
  disc.position.set(cx, cy, cz);
  scene.add(disc);

  // Hub cap center
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.12, r * 0.12, w + 0.02, 16), CHROME_MAT);
  hub.rotation.z = Math.PI / 2;
  hub.position.set(cx, cy, cz);
  scene.add(hub);
}

// ─── Mirror builder ───────────────────────────────────────────────────────────
function addMirror(scene: THREE.Scene, x: number, y: number, z: number, side: -1 | 1, bodyMat: THREE.Material) {
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.14 * side), bodyMat);
  arm.position.set(x, y, z + 0.07 * side);
  scene.add(arm);

  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.14, 0.04), bodyMat);
  housing.position.set(x - 0.02, y, z + 0.16 * side);
  housing.castShadow = true;
  scene.add(housing);

  const lens = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.115, 0.01), GLASS_MAT);
  lens.position.set(x - 0.02, y, z + 0.18 * side);
  scene.add(lens);
}

// ─── Door builder ─────────────────────────────────────────────────────────────
function buildDoors(
  model: TeslaModel,
  halfL: number, halfW: number, groundY: number,
  bodyMat: THREE.Material, scene: THREE.Scene,
): DoorAnim[] {
  const anims: DoorAnim[] = [];

  // Per-model pillar X positions (hinge locations)
  const cfg: Record<TeslaModel, { a: number; b: number; c: number; doorH: number }> = {
    model3:     { a: 0.88, b: -0.32, c: -1.62, doorH: 0.68 },
    modelY:     { a: 0.88, b: -0.32, c: -1.64, doorH: 0.74 },
    modelS:     { a: 0.94, b: -0.38, c: -1.72, doorH: 0.68 },
    modelX:     { a: 0.94, b: -0.38, c: -1.74, doorH: 0.74 },
    cybertruck: { a: 1.78, b: 0.18,  c: 0.18,  doorH: 0.78 },
  };

  const { a: aPillar, b: bPillar, c: cPillar, doorH } = cfg[model];
  const THICK = 0.045;
  const OPEN_ANGLE = 1.25; // ~72 degrees

  function makeDoor(
    hingeX: number, doorLen: number,
    hingeSideZ: number, side: -1 | 1,
  ): DoorAnim {
    const grp = new THREE.Group();
    grp.position.set(hingeX, groundY + doorH / 2, hingeSideZ);
    scene.add(grp);

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(doorLen, doorH, THICK), bodyMat);
    mesh.position.set(-doorLen / 2, 0, side * THICK / 2);
    mesh.castShadow = true;
    grp.add(mesh);

    // Door handle
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.025, 0.03), CHROME_MAT);
    handle.position.set(-doorLen * 0.55, 0.04, side * (THICK / 2 + 0.015));
    grp.add(handle);

    return { group: grp, axis: 'y', openAngle: side * -OPEN_ANGLE, current: 0, open: false };
  }

  if (model === 'cybertruck') {
    // Cybertruck: 2 front doors only (crew cab, front only)
    const fLen = aPillar - bPillar;
    anims.push(makeDoor(aPillar,  fLen, -halfW, -1));
    anims.push(makeDoor(aPillar,  fLen, +halfW,  1));
  } else if (model === 'modelX') {
    // Model X: 2 conventional front doors + 2 falcon wing rear doors
    const fLen = aPillar - bPillar;
    anims.push(makeDoor(aPillar, fLen, -halfW, -1));
    anims.push(makeDoor(aPillar, fLen, +halfW,  1));

    // Falcon wing doors — hinge at roofline, swing up
    const fwRoofY = 1.68; // Model X roof height
    const fwMidX = (bPillar + cPillar) / 2;
    const fwLen = bPillar - cPillar;
    const fwDoorH = fwRoofY - groundY - doorH - 0.04;

    for (const side of [-1, 1] as const) {
      const grp = new THREE.Group();
      grp.position.set(fwMidX, fwRoofY, side * halfW);
      scene.add(grp);

      const mesh = new THREE.Mesh(new THREE.BoxGeometry(fwLen, fwDoorH, THICK), bodyMat);
      mesh.position.set(0, -fwDoorH / 2, side * THICK / 2);
      mesh.castShadow = true;
      grp.add(mesh);

      // Falcon wing inner edge strip
      const strip = new THREE.Mesh(new THREE.BoxGeometry(fwLen, 0.05, 0.06), CHROME_MAT);
      strip.position.set(0, -fwDoorH + 0.04, side * (THICK / 2 + 0.03));
      grp.add(strip);

      anims.push({ group: grp, axis: 'x', openAngle: side * 1.65, current: 0, open: false });
    }
  } else {
    // Sedan/SUV: 4 doors
    const fLen = aPillar - bPillar;
    const rLen = bPillar - cPillar;
    anims.push(makeDoor(aPillar, fLen, -halfW, -1));
    anims.push(makeDoor(aPillar, fLen, +halfW,  1));
    anims.push(makeDoor(bPillar, rLen, -halfW, -1));
    anims.push(makeDoor(bPillar, rLen, +halfW,  1));
  }

  return anims;
}

// ─── Window panels ────────────────────────────────────────────────────────────
function addWindows(
  model: TeslaModel,
  halfW: number, scene: THREE.Scene,
) {
  const glassMat = GLASS_MAT.clone();
  function panel(x: number, y: number, z: number, w: number, h: number, rotY = 0, rotZ = 0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glassMat);
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    m.rotation.z = rotZ;
    scene.add(m);
  }

  const wConf: Record<TeslaModel, {
    wsBase: [number,number]; wsTop: [number,number];
    rearBase: [number,number]; rearTop: [number,number];
    sideWinY: number; sideWinH: number;
    frontDoorWinX: number; frontDoorWinL: number;
    rearDoorWinX: number; rearDoorWinL: number;
  }> = {
    model3: {
      wsBase: [1.18, 0.74], wsTop: [0.76, 1.44],
      rearBase: [-1.82, 0.76], rearTop: [-0.60, 1.44],
      sideWinY: 1.08, sideWinH: 0.42,
      frontDoorWinX: 0.28, frontDoorWinL: 1.05,
      rearDoorWinX: -0.97, rearDoorWinL: 1.00,
    },
    modelY: {
      wsBase: [1.22, 0.80], wsTop: [0.82, 1.62],
      rearBase: [-1.55, 0.80], rearTop: [-1.10, 1.62],
      sideWinY: 1.18, sideWinH: 0.48,
      frontDoorWinX: 0.28, frontDoorWinL: 1.05,
      rearDoorWinX: -0.97, rearDoorWinL: 1.00,
    },
    modelS: {
      wsBase: [1.22, 0.72], wsTop: [0.86, 1.43],
      rearBase: [-1.90, 0.76], rearTop: [-0.55, 1.43],
      sideWinY: 1.06, sideWinH: 0.40,
      frontDoorWinX: 0.28, frontDoorWinL: 1.18,
      rearDoorWinX: -1.05, rearDoorWinL: 1.10,
    },
    modelX: {
      wsBase: [1.28, 0.78], wsTop: [0.92, 1.68],
      rearBase: [-1.65, 0.80], rearTop: [-1.25, 1.68],
      sideWinY: 1.22, sideWinH: 0.50,
      frontDoorWinX: 0.28, frontDoorWinL: 1.18,
      rearDoorWinX: -1.06, rearDoorWinL: 1.10,
    },
    cybertruck: {
      wsBase: [1.82, 0.99], wsTop: [0.52, 1.78],
      rearBase: [-0.82, 1.78], rearTop: [-0.82, 1.78], // no rear glass (flat cab back)
      sideWinY: 1.38, sideWinH: 0.42,
      frontDoorWinX: 1.0, frontDoorWinL: 1.30,
      rearDoorWinX: -0.0, rearDoorWinL: 0, // no rear door windows on CT
    },
  };

  const c = wConf[model];

  // Windscreen (angled front glass)
  {
    const [bx, by] = c.wsBase, [tx, ty] = c.wsTop;
    const cx = (bx + tx) / 2, cy = (by + ty) / 2;
    const dx = bx - tx, dy = ty - by;
    const len = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dx, dy); // tilt from vertical
    panel(cx, cy, 0, halfW * 2.0, len, 0, angle);
  }

  // Rear glass
  if (model !== 'cybertruck') {
    const [bx, by] = c.rearBase, [tx, ty] = c.rearTop;
    const cx = (bx + tx) / 2, cy = (by + ty) / 2;
    const dx = tx - bx, dy = ty - by;
    const len = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dx, dy);
    panel(cx, cy, 0, halfW * 1.8, len, 0, angle);
  }

  // Side windows — left and right
  for (const side of [-1, 1] as const) {
    const z = side * (halfW + 0.003);
    const rotY = side < 0 ? -Math.PI / 2 : Math.PI / 2;

    // Front door window
    if (c.frontDoorWinL > 0) {
      panel(c.frontDoorWinX, c.sideWinY, z, c.frontDoorWinL, c.sideWinH, rotY);
    }
    // Rear door window
    if (c.rearDoorWinL > 0) {
      panel(c.rearDoorWinX, c.sideWinY, z, c.rearDoorWinL, c.sideWinH, rotY);
    }
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TeslaScene({ teslaModel, style, intensity, bpm }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [doorsOpen, setDoorsOpen] = useState(false);
  const [falconOpen, setFalconOpen] = useState(false);

  // Mutable scene refs (survive re-renders without triggering them)
  const animsRef = useRef<DoorAnim[]>([]);
  const lightObjsRef = useRef<{ mesh: THREE.Mesh; pl: THREE.PointLight; ch: number }[]>([]);
  const frameDataRef = useRef<Uint8Array[]>([]);
  const frameIdxRef = useRef(0);
  const doorsOpenRef = useRef(false);
  const falconOpenRef = useRef(false);

  // Re-generate frame data when show params change (without rebuilding geometry)
  useEffect(() => {
    const def = MODELS[teslaModel];
    frameDataRef.current = generateFrames(style, intensity, bpm, 40, def);
    frameIdxRef.current = 0;
  }, [teslaModel, style, intensity, bpm]);

  // Sync door state to refs
  useEffect(() => { doorsOpenRef.current = doorsOpen; }, [doorsOpen]);
  useEffect(() => { falconOpenRef.current = falconOpen; }, [falconOpen]);

  // Build/rebuild scene when model changes
  useEffect(() => {
    const elRaw = mountRef.current;
    if (!elRaw) return;
    const el: HTMLDivElement = elRaw;

    const def = MODELS[teslaModel];
    const { proportions: p } = def;
    const halfL = p.bodyL / 2;
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
    renderer.toneMappingExposure = 1.2;
    el.appendChild(renderer.domElement);

    // ── Scene & environment ───────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0f);
    scene.fog = new THREE.FogExp2(0x0a0a0f, 0.032);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // ── Camera & controls ──────────────────────────────────────────────────────
    const dist = p.bodyL * 1.7;
    const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 150);
    camera.position.set(dist * 0.55, dist * 0.38, dist * 0.85);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = p.bodyL * 0.7;
    controls.maxDistance = p.bodyL * 4.5;
    controls.maxPolarAngle = Math.PI / 2 - 0.01;
    controls.target.set(0, p.bodyL > 5 ? 0.55 : 0.45, 0);
    controls.update();

    // ── Lights ─────────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0x111122, 0.4));
    const sun = new THREE.DirectionalLight(0xffffff, 2.5);
    sun.position.set(6, 10, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 40;
    sun.shadow.camera.left = -8;
    sun.shadow.camera.right = 8;
    sun.shadow.camera.top = 8;
    sun.shadow.camera.bottom = -8;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x6688cc, 0.6);
    fill.position.set(-6, 4, -4);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffeecc, 0.4);
    rim.position.set(0, 3, -8);
    scene.add(rim);

    // ── Floor ──────────────────────────────────────────────────────────────────
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), FLOOR_MAT);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Floor grid lines
    const gridHelper = new THREE.GridHelper(30, 30, 0x1a1a2e, 0x1a1a2e);
    (gridHelper.material as THREE.LineBasicMaterial).opacity = 0.5;
    (gridHelper.material as THREE.LineBasicMaterial).transparent = true;
    scene.add(gridHelper);

    // ── Car body ───────────────────────────────────────────────────────────────
    const metalness = teslaModel === 'cybertruck' ? 0.92 : 0.75;
    const bodyMat = makeBodyMat(metalness);

    const profile = PROFILES[teslaModel]();
    const bodyGeom = new THREE.ExtrudeGeometry(profile, { steps: 1, depth: p.bodyW, bevelEnabled: false });
    const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
    bodyMesh.position.z = -halfW;
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    scene.add(bodyMesh);

    // ── Cybertruck truck bed interior ─────────────────────────────────────────
    if (teslaModel === 'cybertruck' && p.truckBed) {
      const { bedL, bedW, bedH, bedX } = p.truckBed;
      const bedFloor = new THREE.Mesh(
        new THREE.BoxGeometry(bedL - 0.08, 0.03, bedW - 0.12),
        new THREE.MeshStandardMaterial({ color: 0x111118, roughness: 0.9, metalness: 0.6 }),
      );
      bedFloor.position.set(bedX, groundY + 0.44, 0);
      scene.add(bedFloor);

      // Tonneau cover rails
      for (const sz of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(bedL, 0.04, 0.04), CHROME_MAT);
        rail.position.set(bedX, groundY + 0.94, sz * (bedW / 2 - 0.06));
        scene.add(rail);
      }
    }

    // ── Wheels ─────────────────────────────────────────────────────────────────
    const wheelR = teslaModel === 'cybertruck' ? 0.42 : 0.37;
    const wheelW = teslaModel === 'cybertruck' ? 0.28 : 0.22;
    const axleY = groundY + wheelR;
    const axleX = p.bodyL * 0.305;
    const axleZ = halfW + wheelW * 0.18;

    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        addWheel(scene, sx * axleX, axleY, sz * axleZ, wheelR, wheelW);
      }
    }

    // ── Mirrors ────────────────────────────────────────────────────────────────
    const mirrorY = teslaModel === 'cybertruck' ? 1.22 : (p.bodyL > 5 ? 0.88 : 0.82);
    const mirrorX = teslaModel === 'cybertruck' ? 1.60 : (halfL - 1.4);
    addMirror(scene, mirrorX, mirrorY, -halfW, -1, bodyMat);
    addMirror(scene, mirrorX, mirrorY, +halfW,  1, bodyMat);

    // ── Doors ──────────────────────────────────────────────────────────────────
    animsRef.current = buildDoors(teslaModel, halfL, halfW + 0.005, groundY, bodyMat, scene);

    // ── Windows ────────────────────────────────────────────────────────────────
    addWindows(teslaModel, halfW, scene);

    // ── Light zones as emissive strip meshes ───────────────────────────────────
    const lightObjs: typeof lightObjsRef.current = [];
    const zoneMeshes: THREE.Mesh[] = [];

    def.zones.forEach(zone => {
      const [x, y, z] = zone.position;

      // Pick geometry based on light type
      let geo: THREE.BufferGeometry;
      if (zone.type === 'strip') {
        geo = new THREE.BoxGeometry(0.08, 0.05, 0.40);
      } else if (zone.type === 'headlight' || zone.type === 'tail' || zone.type === 'brake') {
        geo = new THREE.BoxGeometry(0.06, 0.12, 0.22);
      } else if (zone.type === 'drl') {
        geo = new THREE.BoxGeometry(0.04, 0.04, 0.32);
      } else {
        geo = new THREE.BoxGeometry(0.06, 0.08, 0.14);
      }

      const mat = new THREE.MeshStandardMaterial({
        color: zone.color,
        emissive: new THREE.Color(zone.color),
        emissiveIntensity: 0.2,
        roughness: 0.1,
        metalness: 0.0,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      // Orient strip zones based on position
      if (Math.abs(x) > Math.abs(z)) {
        // front/rear facing — already correct
      } else {
        mesh.rotation.y = Math.PI / 2; // side facing
      }
      mesh.userData.zoneLabel = zone.label;
      zoneMeshes.push(mesh);
      scene.add(mesh);

      const pl = new THREE.PointLight(zone.color, 0, 1.8);
      pl.position.set(x, y, z);
      scene.add(pl);

      lightObjs.push({ mesh, pl, ch: zone.channel });
    });

    lightObjsRef.current = lightObjs;
    frameDataRef.current = generateFrames(style, intensity, bpm, 40, def);
    frameIdxRef.current = 0;

    // ── Raycaster for hover tooltips ───────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    function onMouseMove(e: MouseEvent) {
      const rect = el.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(zoneMeshes);
      if (hits.length > 0) {
        const label = (hits[0].object as THREE.Mesh).userData.zoneLabel as string;
        setTooltip({ label, x: e.clientX - rect.left, y: e.clientY - rect.top });
      } else {
        setTooltip(null);
      }
    }
    el.addEventListener('mousemove', onMouseMove);

    // ── Animation loop ─────────────────────────────────────────────────────────
    let raf: number;
    let lastFrameTime = 0;
    const FRAME_MS = 1000 / 20;

    function animate(now: number) {
      raf = requestAnimationFrame(animate);
      controls.update();

      // Light frame animation (20 fps stepped)
      if (now - lastFrameTime >= FRAME_MS) {
        lastFrameTime = now;
        const frames = frameDataRef.current;
        if (frames.length > 0) {
          const frame = frames[frameIdxRef.current % frames.length];
          frameIdxRef.current++;
          lightObjs.forEach(({ mesh, pl, ch }) => {
            const b = frame[ch] / 255;
            (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.12 + b * 4.0;
            pl.intensity = b * 2.5;
          });
        }
      }

      // Door animations — lerp toward target
      animsRef.current.forEach(a => {
        // Determine if this door should be open:
        // Falcon wings (axis=x on Model X) follow falconOpenRef, others follow doorsOpenRef
        const isFalcon = a.axis === 'x';
        const shouldOpen = isFalcon ? falconOpenRef.current : doorsOpenRef.current;
        const target = shouldOpen ? a.openAngle : 0;
        a.current = THREE.MathUtils.lerp(a.current, target, 0.08);
        a.group.rotation[a.axis] = a.current;
      });

      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(animate);

    // ── Resize observer ────────────────────────────────────────────────────────
    const obs = new ResizeObserver(() => {
      const nw = el.clientWidth, nh = el.clientHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    });
    obs.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('mousemove', onMouseMove);
      obs.disconnect();
      controls.dispose();
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
      setTooltip(null);
      setDoorsOpen(false);
      setFalconOpen(false);
    };
  }, [teslaModel]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasFalconWings = teslaModel === 'modelX';

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%', cursor: 'grab' }} />

      {/* Hover tooltip */}
      {tooltip && (
        <div style={{
          position: 'absolute', left: tooltip.x + 14, top: tooltip.y + 8,
          background: 'rgba(8,8,18,0.92)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 6, padding: '4px 10px', fontSize: 12, color: '#dde',
          pointerEvents: 'none', whiteSpace: 'nowrap', backdropFilter: 'blur(8px)', zIndex: 10,
        }}>
          {tooltip.label}
        </div>
      )}

      {/* Door controls */}
      <div style={{
        position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 8, pointerEvents: 'none',
      }}>
        <button
          onClick={() => setDoorsOpen(v => !v)}
          style={{
            pointerEvents: 'auto',
            padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600,
            background: doorsOpen ? 'rgba(0,232,135,0.15)' : 'rgba(255,255,255,0.08)',
            border: `1px solid ${doorsOpen ? 'rgba(0,232,135,0.4)' : 'rgba(255,255,255,0.15)'}`,
            color: doorsOpen ? '#00e887' : '#ccc', cursor: 'pointer', backdropFilter: 'blur(8px)',
            transition: 'all .2s',
          }}
        >
          {doorsOpen ? 'Close Doors' : 'Open Doors'}
        </button>

        {hasFalconWings && (
          <button
            onClick={() => setFalconOpen(v => !v)}
            style={{
              pointerEvents: 'auto',
              padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              background: falconOpen ? 'rgba(100,180,255,0.15)' : 'rgba(255,255,255,0.08)',
              border: `1px solid ${falconOpen ? 'rgba(100,180,255,0.4)' : 'rgba(255,255,255,0.15)'}`,
              color: falconOpen ? '#64b4ff' : '#ccc', cursor: 'pointer', backdropFilter: 'blur(8px)',
              transition: 'all .2s',
            }}
          >
            {falconOpen ? 'Close Falcon Wings' : 'Open Falcon Wings'}
          </button>
        )}
      </div>

      {/* Hint */}
      <div style={{
        position: 'absolute', bottom: 52, right: 14, fontSize: 11,
        color: 'rgba(255,255,255,0.28)', pointerEvents: 'none',
      }}>
        drag · scroll · hover lights
      </div>
    </div>
  );
}
