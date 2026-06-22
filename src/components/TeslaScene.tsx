'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { MODELS, generateFrames, FPS } from '@/lib/tesla-channels';
import type { TeslaModel, ShowStyle } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Props {
  teslaModel: TeslaModel;
  style: ShowStyle;
  intensity: number;
  bpm: number;
  previewBeat?: number | null;
  customFrames?: Uint8Array[] | null;
  // Fire a closure immediately on click (instant feedback, vs waiting for the
  // looping playhead to reach that beat). `n` changes each click to retrigger.
  pulse?: { ch: number; cmd: string; n: number } | null;
}
interface Tooltip { label: string; x: number; y: number }

// ─── Constants ────────────────────────────────────────────────────────────────
const GLTF_PATHS: Record<TeslaModel, string> = {
  model3:     '/models/model3.glb',
  modelY:     '/models/modelY.glb',
  modelS:     '/models/modelS.glb',
  modelX:     '/models/modelX.glb',
  cybertruck: '/models/cybertruck.glb',
};

// ─── Materials ────────────────────────────────────────────────────────────────
function bodyMat(metalness = 0.78) {
  return new THREE.MeshPhysicalMaterial({
    color: 0x1b1b28, roughness: 0.15, metalness,
    clearcoat: 1.0, clearcoatRoughness: 0.04,
  });
}
const GLASS = () => new THREE.MeshPhysicalMaterial({
  color: 0x1e3344, roughness: 0.0, metalness: 0.05,
  transmission: 0.55, transparent: true, opacity: 0.42, ior: 1.52,
});
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
  const lens = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.11, 0.012), GLASS());
  lens.position.set(x - 0.02, y, z + side * 0.19);
  scene.add(lens);
}

// ─── Door builder ──────────────────────────────────────────────────────────────
// ─── Window panels ────────────────────────────────────────────────────────────
function addWindows(model: TeslaModel, halfW: number, scene: THREE.Object3D) {
  const gm = GLASS();

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

// ─── Light driver ──────────────────────────────────────────────────────────────
// A glowing fixture: `mat` is the emissive material driven by its channel value,
// `center` is its world position (for the colored-spill pool), `baseOpacity` is
// the resting opacity (proxy boxes are faintly visible; real-lens overlays are
// invisible until lit). `nx/ny/nz` are the normalized car coords (proxies only,
// used to anchor/partition onto the loaded geometry).
interface LightObj {
  mesh?: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  ch: number;
  color: THREE.Color;
  center: THREE.Vector3;
  baseOpacity: number;
  nx?: number; ny?: number; nz?: number;
}

// ─── Light zone meshes ────────────────────────────────────────────────────────
function buildLightZones(def: typeof MODELS[TeslaModel], scene: THREE.Scene) {
  const out: LightObj[] = [];
  const zoneHitboxes: THREE.Mesh[] = [];

  def.zones.forEach(zone => {
    // Skip closures in the 3D scene — they have no light and only cost perf.
    // (They'll get dedicated geometry when closure animation is added.)
    if (zone.type === 'closure') return;
    const [x, y, z] = zone.position;

    // Lights are flat panels flush with the front/rear fascia.
    // Depth (X dimension) is kept thin so they sit on the surface, not protrude.
    // Span (Z dimension) reflects real light width. Y = vertical height of element.
    const D = 0.020; // fascia depth — how far the panel protrudes
    let geo: THREE.BufferGeometry;

    switch (zone.type) {
      case 'drl':
        // Thin wide horizontal LED strip (full-width bar on modern Teslas)
        geo = new THREE.BoxGeometry(D, 0.022, 0.54);
        break;
      case 'headlight':
        // Main headlight element — moderately wide, taller than DRL
        geo = new THREE.BoxGeometry(D, 0.058, 0.40);
        break;
      case 'highbeam':
        geo = new THREE.BoxGeometry(D, 0.028, 0.24);
        break;
      case 'tail':
        // Wide red tail bar, spans most of the rear half
        geo = new THREE.BoxGeometry(D, 0.058, 0.44);
        break;
      case 'brake':
        geo = new THREE.BoxGeometry(D, 0.044, 0.38);
        break;
      case 'turn_front':
      case 'turn_rear':
        geo = new THREE.BoxGeometry(D, 0.036, 0.18);
        break;
      case 'fog':
        geo = new THREE.BoxGeometry(D, 0.048, 0.14);
        break;
      case 'reverse':
        geo = new THREE.BoxGeometry(D, 0.036, 0.14);
        break;
      case 'plate':
        geo = new THREE.BoxGeometry(D, 0.026, 0.40);
        break;
      case 'marker':
        // Small side marker / aux park element
        geo = new THREE.BoxGeometry(D, 0.026, 0.10);
        break;
      default:
        geo = new THREE.BoxGeometry(D, 0.048, 0.18);
    }

    // Visible fixture lens: faint when the channel is off, glows when it fires.
    const mat = new THREE.MeshStandardMaterial({
      color: zone.color,
      emissive: new THREE.Color(zone.color),
      emissiveIntensity: 0.0,
      roughness: 0.25, metalness: 0.0,
      transparent: true, opacity: 0.16,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.userData.label = zone.label;
    scene.add(mesh);            // visible — this IS the light the user sees turn on
    zoneHitboxes.push(mesh);

    out.push({ mesh, mat, ch: zone.channel, color: new THREE.Color(zone.color), center: mesh.position, baseOpacity: 0.16, nx: zone.nx, ny: zone.ny, nz: zone.nz });
  });

  return { lightObjs: out, zoneHitboxes };
}

// ─── Real-lens lights (models whose GLB ships a 'Lights' mesh, e.g. Model S) ─────
// Proxy boxes never line up with the curved body. Instead, take the car's ACTUAL
// light geometry and partition its triangles to the nearest light channel (by
// normalized car position), then build a transparent emissive overlay per channel
// that glows over the real lens when its channel fires. Positions are exact because
// they ARE Tesla's lens geometry. Returns null if there's no 'Lights' mesh.
function buildMeshLights(
  gltfScene: THREE.Group,
  channels: { ch: number; color: THREE.Color; nx: number; ny: number; nz: number }[],
  scene: THREE.Scene,
  bodyBox: THREE.Box3,
  fullBox: THREE.Box3,
): LightObj[] | null {
  // Collect the car's real lens meshes: a single 'Lights' mesh (Model S) OR
  // light-named nodes like headlight/backlight/tail (other models). Match the
  // mesh's own name or any ancestor's name.
  const LIGHT_RX = /light|lamp/i;
  const lightMeshes: THREE.Mesh[] = [];
  gltfScene.traverse(obj => {
    if (!(obj instanceof THREE.Mesh)) return;
    for (let n: THREE.Object3D | null = obj; n; n = n.parent) {
      if (n.name && LIGHT_RX.test(n.name)) { lightMeshes.push(obj); break; }
    }
  });
  if (!lightMeshes.length) return null;

  const bc = bodyBox.getCenter(new THREE.Vector3());
  const bs = bodyBox.getSize(new THREE.Vector3());
  const minY = fullBox.min.y, fullH = fullBox.max.y - fullBox.min.y;
  const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3(), cen = new THREE.Vector3();

  // Assign each triangle to its nearest channel; collect WORLD-space vertex coords
  // per channel (meshes may have different world matrices, so we bake positions).
  const buckets = new Map<number, number[]>();
  for (const mesh of lightMeshes) {
    mesh.updateWorldMatrix(true, false);
    const m4 = mesh.matrixWorld;
    const geo = mesh.geometry as THREE.BufferGeometry;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const idx = geo.index;
    const triN = idx ? idx.count / 3 : pos.count / 3;
    const ti = (t: number, k: number) => (idx ? idx.getX(t * 3 + k) : t * 3 + k);
    for (let t = 0; t < triN; t++) {
      vA.fromBufferAttribute(pos, ti(t, 0)).applyMatrix4(m4);
      vB.fromBufferAttribute(pos, ti(t, 1)).applyMatrix4(m4);
      vC.fromBufferAttribute(pos, ti(t, 2)).applyMatrix4(m4);
      cen.copy(vA).add(vB).add(vC).multiplyScalar(1 / 3);
      const nx = (cen.x - bc.x) / (bs.x / 2);
      const ny = (cen.y - minY) / fullH;
      const nz = (cen.z - bc.z) / (bs.z / 2);
      let best = -1, bestD = Infinity;
      for (const c of channels) {
        const dx = nx - c.nx, dy = (ny - c.ny) * 0.6, dz = nz - c.nz;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < bestD) { bestD = d; best = c.ch; }
      }
      let arr = buckets.get(best);
      if (!arr) { arr = []; buckets.set(best, arr); }
      arr.push(vA.x, vA.y, vA.z, vB.x, vB.y, vB.z, vC.x, vC.y, vC.z);
    }
  }

  const out: LightObj[] = [];
  buckets.forEach((coords, ch) => {
    const chan = channels.find(c => c.ch === ch);
    if (!chan) return;
    // <3 triangles (27 floats) = a stray; leave uncovered.
    if (coords.length < 27) return;
    const positions = new Float32Array(coords);
    const center = new THREE.Vector3();
    for (let k = 0; k < coords.length; k += 3) { center.x += coords[k]; center.y += coords[k + 1]; center.z += coords[k + 2]; }
    center.multiplyScalar(3 / coords.length);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      color: chan.color, emissive: chan.color, emissiveIntensity: 0,
      roughness: 0.3, metalness: 0, transparent: true, opacity: 0,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    });
    const mesh = new THREE.Mesh(g, mat);
    scene.add(mesh);
    out.push({ mesh, mat, ch, color: chan.color.clone(), center, baseOpacity: 0 });
  });
  return out.length ? out : null;
}

// ─── Closures: animate the real GLB panels (Model S only) ───────────────────────
// Floating proxy panels never line up with the HD body, so we move the car's OWN
// panels. Only Model S exports separable named nodes (Door_*, Window_*, Trunk,
// Charge_Cap, mirrors); we reparent each under a world-space pivot at its hinge
// and rotate/slide it. Other models are merged meshes — no closure motion yet.
export interface ClosureObj {
  ch: number;
  open: number;            // smoothed openness 0..1
  apply: (open: number) => void;
}

function buildModelSClosures(gltfScene: THREE.Group, scene: THREE.Scene): ClosureObj[] {
  const out: ClosureObj[] = [];
  const get = (n: string) => gltfScene.getObjectByName(n);
  const worldBox = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o);
  // Reparent `node` under a fresh pivot placed at world-space `hinge`, preserving
  // the node's world transform (so rest pose is unchanged); return the pivot.
  const pivotAt = (node: THREE.Object3D, hinge: THREE.Vector3) => {
    const pivot = new THREE.Group();
    pivot.position.copy(hinge);
    scene.add(pivot);
    pivot.attach(node);
    return pivot;
  };

  // Doors + their windows. Each door (ch 41-44, the "door handle" family on S)
  // swings out around its front vertical edge; its window (ch 36-39) is nested
  // INSIDE the door pivot so the glass swings with the door AND can still roll
  // down (translated within the door's frame, like a real window).
  const DOORS = [
    { door: 'Door_LF', win: 'Window_LF', doorCh: 41, winCh: 36 },
    { door: 'Door_LR', win: 'Window_LR', doorCh: 42, winCh: 37 },
    { door: 'Door_RF', win: 'Window_RF', doorCh: 43, winCh: 38 },
    { door: 'Door_RR', win: 'Window_RR', doorCh: 44, winCh: 39 },
  ] as const;
  for (const d of DOORS) {
    const doorNode = get(d.door);
    const winNode = get(d.win);
    if (doorNode) {
      const b = worldBox(doorNode); const c = b.getCenter(new THREE.Vector3());
      const side: 1 | -1 = c.z >= 0 ? 1 : -1;       // body side the door sits on
      const pivot = pivotAt(doorNode, new THREE.Vector3(b.max.x, c.y, c.z)); // hinge front edge
      out.push({ ch: d.doorCh, open: 0, apply: o => { pivot.rotation.y = side * 0.62 * o; } });
      if (winNode) {
        const wb = worldBox(winNode);
        const drop = (wb.max.y - wb.min.y) * 0.92;
        pivot.attach(winNode);                       // window rides with the door
        const restY = winNode.position.y;
        out.push({ ch: d.winCh, open: 0, apply: o => { winNode.position.y = restY - drop * o; } });
      }
    } else if (winNode) {
      // No door node — fall back to a standalone sliding window
      const wb = worldBox(winNode);
      const drop = (wb.max.y - wb.min.y) * 0.92;
      const pivot = pivotAt(winNode, wb.getCenter(new THREE.Vector3()));
      const restY = pivot.position.y;
      out.push({ ch: d.winCh, open: 0, apply: o => { pivot.position.y = restY - drop * o; } });
    }
  }

  // Mirrors (ch 34-35) — fold inward around a vertical axis at the body-side edge
  for (const [name, ch, sign] of [['Door_LF_Mirror', 34, +1], ['Door_RF_Mirror', 35, -1]] as const) {
    const node = get(name); if (!node) continue;
    const b = worldBox(node); const c = b.getCenter(new THREE.Vector3());
    const innerZ = Math.abs(b.min.z) < Math.abs(b.max.z) ? b.min.z : b.max.z;
    const pivot = pivotAt(node, new THREE.Vector3(c.x, c.y, innerZ));
    out.push({ ch, open: 0, apply: o => { pivot.rotation.y = sign * 1.2 * o; } });
  }

  // Liftgate (ch 40) → Trunk lid — lift up, hinged at its cabin-side (front) edge.
  // The Spoiler sits on the lid, so attach it to the SAME pivot or it floats.
  {
    const node = get('Trunk');
    if (node) {
      const b = worldBox(node); const c = b.getCenter(new THREE.Vector3());
      const pivot = pivotAt(node, new THREE.Vector3(b.max.x, b.max.y, c.z));
      const spoiler = get('Spoiler');
      if (spoiler) pivot.attach(spoiler);   // lifts together with the lid
      out.push({ ch: 40, open: 0, apply: o => { pivot.rotation.z = -0.5 * o; } });
    }
  }

  // Charge port (ch 45) → Charge_Cap — small flap on the rear-left (driver's side)
  // quarter panel; swing it clearly outward, hinged at its forward vertical edge.
  {
    const node = get('Charge_Cap');
    if (node) {
      const b = worldBox(node); const c = b.getCenter(new THREE.Vector3());
      const side: 1 | -1 = c.z >= 0 ? 1 : -1;          // which body side it sits on
      const pivot = pivotAt(node, new THREE.Vector3(b.max.x, c.y, c.z));
      out.push({ ch: 45, open: 0, apply: o => { pivot.rotation.y = side * 1.2 * o; } });
    }
  }

  return out;
}

// bytes: 0 idle · 63 open · 127 dance · 191 close · 255 stop → target openness
function closureTarget(byte: number, tSec: number): number {
  if (byte < 32) return 0;                          // idle
  if (byte < 96) return 1;                          // open
  if (byte < 160) return 0.5 + 0.5 * Math.sin(tSec * 7); // dance — oscillate
  return 0;                                         // close / stop
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TeslaScene({
  teslaModel, style, intensity, bpm, previewBeat,
  customFrames, pulse,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [gltfStatus, setGltfStatus] = useState<'loading' | 'loaded' | 'procedural'>('loading');

  const lightObjsRef = useRef<ReturnType<typeof buildLightZones>['lightObjs']>([]);
  const closureObjsRef = useRef<ClosureObj[]>([]);
  const pulseRef = useRef<{ ch: number; target: number; until: number } | null>(null);
  const activeFrameRef = useRef<Uint8Array | null>(null);
  const frameDataRef = useRef<Uint8Array[]>([]);
  const frameIdxRef = useRef(0);
  const previewBeatRef = useRef<number | null>(null);
  const customFramesRef = useRef<Uint8Array[] | null>(null);

  // Keep style/intensity/bpm in sync without rebuilding scene
  useEffect(() => {
    const def = MODELS[teslaModel];
    frameDataRef.current = generateFrames(style, intensity, bpm, 40, def);
    frameIdxRef.current = 0;
  }, [teslaModel, style, intensity, bpm]);

  useEffect(() => { previewBeatRef.current = previewBeat ?? null; }, [previewBeat]);
  useEffect(() => { customFramesRef.current = customFrames ?? null; }, [customFrames]);

  // Clicking a closure pulses it open right away (≈1.4s) so you don't wait for
  // the looping playhead to come around. open/dance → open; close/stop → rest.
  useEffect(() => {
    if (!pulse) return;
    const target = pulse.cmd === 'open' || pulse.cmd === 'dance' ? 1 : 0;
    pulseRef.current = { ch: pulse.ch, target, until: performance.now() + 1400 };
  }, [pulse]);

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
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(w, h);
    // Cap pixel ratio — 2x on retina is 4x the pixels for little visual gain and
    // is the main interaction-lag culprit alongside the per-light cost.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    // The car & sun are static (only the camera orbits), so render shadows once
    // instead of every frame — a big chunk of the orbit lag. We flip needsUpdate
    // whenever the scene content changes (GLTF load / fallback).
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
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
    sun.shadow.mapSize.set(1024, 1024);
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
    const bMat = bodyMat(teslaModel === 'cybertruck' ? 0.92 : 0.78);

    // Procedural group — built but NOT shown during loading (it looked clunky).
    // It's added to the scene only if the GLTF fails to load (error fallback).
    const proceduralGroup = new THREE.Group();
    buildProceduralCar(proceduralGroup, teslaModel, p, halfW, groundY, bMat);
    addWindows(teslaModel, halfW, proceduralGroup);
    const mY = teslaModel === 'cybertruck' ? 1.22 : (p.bodyL > 5 ? 0.88 : 0.84);
    const mX = p.bodyL / 2 - 1.35;
    addMirror(proceduralGroup, mX, mY, -halfW, -1, bMat);
    addMirror(proceduralGroup, mX, mY,  halfW,  1, bMat);
    setGltfStatus('loading');

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('/draco/');
    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);
    loader.load(
      GLTF_PATHS[teslaModel],
      (gltf: { scene: THREE.Group }) => {
        const gltfScene = gltf.scene;

        // ── Step 1: measure as-loaded (GLTFLoader has already applied node transforms) ──
        let box = new THREE.Box3().setFromObject(gltfScene);
        let size = box.getSize(new THREE.Vector3());

        // ── Step 2: orient so the car's long axis = +X (front) ──────────────────
        // Most Sketchfab car models export with their length along Z (front at ±Z).
        // A -90° Y rotation maps the car's -Z end to +X (our forward direction).
        // This is confirmed correct for model3 / modelY (baked -90°X node rotation
        // leaves front at -Z). For modelX / cybertruck we also apply it based on
        // bounding-box analysis (flat rear panel sits at +Z_max).
        // modelS is the exception: its long axis is already X in the GLB file.
        if (size.z > size.x * 1.1) {
          gltfScene.rotation.y = -Math.PI / 2;
          // Re-measure after rotation so scale uses the true car length
          box = new THREE.Box3().setFromObject(gltfScene);
          size = box.getSize(new THREE.Vector3());
        }

        // ── Step 2b: front/back — ensure headlights face +X (front) ─────────────
        // The generic orient can leave a model backwards. If the car exposes a
        // headlight node and it ends up at -X, flip 180°. Uses real geometry, so
        // it's model-agnostic (models without a headlight node are unaffected).
        const hls: THREE.Object3D[] = [];
        gltfScene.traverse(o => { if (o.name && /head\s*light/i.test(o.name)) hls.push(o); });
        // Model-specific front/back override for models with no headlight node to
        // auto-detect from (the generic orient leaves Model Y's front at -X, so
        // front light channels were lighting the rear). Add 180°.
        const MODEL_EXTRA_YAW: Partial<Record<TeslaModel, number>> = { modelY: Math.PI };
        let yaw = MODEL_EXTRA_YAW[teslaModel] ?? 0;
        if (hls.length) {
          const hc = new THREE.Box3().setFromObject(hls[0]).getCenter(new THREE.Vector3());
          if (hc.x < 0) yaw += Math.PI;
        }
        if (yaw) {
          gltfScene.rotation.y += yaw;
          box = new THREE.Box3().setFromObject(gltfScene);
          size = box.getSize(new THREE.Vector3());
        }

        // ── Step 3: scale so car length (X after orientation fix) = bodyL ────────
        const scale = p.bodyL / size.x;
        gltfScene.scale.setScalar(scale);

        // ── Step 4: robust floor — exclude only TRUE outlier geometry ────────────
        // Some models include a stray ground-plane mesh far below the car. Collect
        // each mesh's world min-Y; the real floor is the lowest one, UNLESS a mesh
        // sits far below the rest (detected by a large gap above it) — then it's an
        // outlier and we step up. The wheels cluster near the body bottom, so they
        // stay the floor (fixes detailed models whose tyres sank under the ground).
        box = new THREE.Box3().setFromObject(gltfScene);
        const centre = box.getCenter(new THREE.Vector3());
        const meshBottoms: number[] = [];
        gltfScene.traverse(child => {
          if (child instanceof THREE.Mesh) {
            const mb = new THREE.Box3().setFromObject(child);
            if (mb.min.y < mb.max.y) meshBottoms.push(mb.min.y);
          }
        });
        meshBottoms.sort((a, b) => a - b);
        const carH = box.max.y - box.min.y;
        let robustFloor = meshBottoms[0] ?? box.min.y;
        for (let i = 0; i < meshBottoms.length - 1; i++) {
          if (meshBottoms[i + 1] - meshBottoms[i] > carH * 0.12) robustFloor = meshBottoms[i + 1];
          else break;
        }
        console.log(`[GLTF ${teslaModel}] meshes=${meshBottoms.length} floor=${robustFloor.toFixed(3)} (raw min=${box.min.y.toFixed(3)}) size=${size.x.toFixed(2)}x${size.y.toFixed(2)}x${size.z.toFixed(2)}`);
        gltfScene.position.x = -centre.x;
        gltfScene.position.y = -robustFloor;
        gltfScene.position.z = -centre.z;

        // ── Step 5: keep original GLTF materials, enable shadows + env reflections
        gltfScene.traverse(child => {
          if (!(child instanceof THREE.Mesh)) return;
          child.castShadow = true;
          child.receiveShadow = true;
          // scene.environment (PMREMGenerator) auto-supplies envMap to Standard/Physical
          // materials — force a needsUpdate so it's picked up immediately.
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach(m => {
            if (m instanceof THREE.MeshStandardMaterial) {
              m.envMapIntensity = 1.2;
              m.needsUpdate = true;
            }
          });
        });

        // ── Step 6: light up the REAL lens geometry where the GLB provides it ────
        const bodyNode = gltfScene.getObjectByName('Body');
        const bodyBox = bodyNode ? new THREE.Box3().setFromObject(bodyNode) : box;

        // Add the car first so we can read its 'Lights' mesh / raycast against it.
        scene.remove(proceduralGroup);
        scene.add(gltfScene);

        const realLights = buildMeshLights(
          gltfScene,
          lightObjsRef.current.map(o => ({ ch: o.ch, color: o.color, nx: o.nx ?? 0, ny: o.ny ?? 0, nz: o.nz ?? 0 })),
          scene, bodyBox, box,
        );
        if (realLights) {
          // Hide the proxy boxes — the real-lens overlays take over (perfectly placed).
          lightObjsRef.current.forEach(o => { if (o.mesh) o.mesh.visible = false; });
          lightObjsRef.current = realLights;
        } else {
          // No 'Lights' mesh: anchor proxy boxes to the body, then raycast each onto
          // the real surface so they don't poke out of the curved body.
          const bc = bodyBox.getCenter(new THREE.Vector3());
          const bs = bodyBox.getSize(new THREE.Vector3());
          const fullH = box.max.y - box.min.y;
          lightObjsRef.current.forEach(o => {
            o.mesh?.position.set(
              bc.x + (o.nx ?? 0) * (bs.x / 2) * 1.12,
              box.min.y + (o.ny ?? 0) * fullH,
              bc.z + (o.nz ?? 0) * (bs.z / 2) * 1.12,
            );
          });
          const snapRay = new THREE.Raycaster();
          snapRay.far = 2.5;
          lightObjsRef.current.forEach(o => {
            if (!o.mesh) return;
            const from = o.mesh.position.clone();
            const dir = new THREE.Vector3(bc.x, from.y, bc.z).sub(from).normalize();
            snapRay.set(from.addScaledVector(dir, -0.5), dir);
            const hit = snapRay.intersectObject(gltfScene, true)[0];
            if (hit) o.mesh.position.copy(hit.point).addScaledVector(dir, -0.015);
          });
        }
        // Model S exports real, separable panels — animate them directly.
        if (teslaModel === 'modelS') closureObjsRef.current = buildModelSClosures(gltfScene, scene);
        renderer.shadowMap.needsUpdate = true;  // re-render shadows now the car is in
        setGltfStatus('loaded');
      },
      undefined,
      () => {
        // GLTF failed to load — fall back to the procedural car
        scene.add(proceduralGroup);
        renderer.shadowMap.needsUpdate = true;
        setGltfStatus('procedural');
      },
    );

    // ── Light zones ───────────────────────────────────────────────────────────
    const { lightObjs, zoneHitboxes } = buildLightZones(def, scene);
    lightObjsRef.current = lightObjs;

    // Colored spill pool: a fixed handful of point lights (constant shader cost)
    // reassigned each frame to the brightest active fixtures — replaces the old
    // one-point-light-per-channel setup that made orbiting lag.
    const SPILL_POOL = 8;
    const poolLights: THREE.PointLight[] = [];
    for (let i = 0; i < SPILL_POOL; i++) {
      const pl = new THREE.PointLight(0xffffff, 0, 1.8, 2);
      scene.add(pl);
      poolLights.push(pl);
    }

    // Closures animate the real GLB panels — populated in the GLTF onLoad for
    // Model S (the only model with separable named nodes); empty otherwise.
    closureObjsRef.current = [];
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
    const FMS = 1000 / FPS;

    function animate(now: number) {
      raf = requestAnimationFrame(animate);
      controls.update();

      if (now - lastFrame >= FMS) {
        lastFrame = now;
        const frames = customFramesRef.current ?? frameDataRef.current;
        if (frames.length > 0) {
          let frameIdx: number;
          const pb = previewBeatRef.current;
          if (pb !== null) {
            frameIdx = Math.floor(pb * (FMS / 1000) * FPS) % frames.length;
          } else {
            frameIdx = frameIdxRef.current % frames.length;
            frameIdxRef.current++;
          }
          const frame = frames[frameIdx];
          activeFrameRef.current = frame;
          // Each fixture glows with its channel value (or a click pulse).
          const lpz = pulseRef.current;
          const activeForPool: { pos: THREE.Vector3; color: THREE.Color; v: number }[] = [];
          lightObjsRef.current.forEach(({ mat, ch, color, center, baseOpacity }) => {
            let v = (frame[ch] ?? 0) / 255;
            if (lpz && lpz.ch === ch && now < lpz.until) v = Math.max(v, lpz.target);
            mat.emissiveIntensity = v * 3.2;
            mat.opacity = baseOpacity + v * (1 - baseOpacity);
            if (v > 0.06) activeForPool.push({ pos: center, color, v });
          });
          // ...and the spill pool follows the brightest few for colored glow.
          activeForPool.sort((a, b) => b.v - a.v);
          for (let i = 0; i < poolLights.length; i++) {
            const a = activeForPool[i];
            if (a) { poolLights[i].position.copy(a.pos); poolLights[i].color.copy(a.color); poolLights[i].intensity = a.v * 1.8; }
            else poolLights[i].intensity = 0;
          }
        }
      }

      // Closures animate every render frame (smoother than the 50fps light tick).
      // apply(0) restores the panel's rest pose, so this is safe to run always.
      const closureObjs = closureObjsRef.current;
      if (closureObjs.length) {
        const frame = activeFrameRef.current;
        const tSec = now / 1000;
        const pz = pulseRef.current;
        if (pz && now >= pz.until) pulseRef.current = null;
        closureObjs.forEach(co => {
          let target = frame ? closureTarget(frame[co.ch] ?? 0, tSec) : 0;
          if (pz && pz.ch === co.ch && now < pz.until) target = pz.target; // instant click feedback
          co.open += (target - co.open) * 0.18;
          if (co.open < 0.004) co.open = 0;
          co.apply(co.open);
        });
      }

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
      setTooltip(null);
    };
  }, [teslaModel]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%', cursor: 'grab' }} />

      {/* Clean loading state (instead of the clunky procedural placeholder) */}
      {gltfStatus === 'loading' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, pointerEvents: 'none' }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.12)', borderTopColor: 'rgba(232,64,74,0.9)', animation: 'spin 0.8s linear infinite' }} />
          <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '.06em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Loading model</div>
        </div>
      )}

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

      <div style={{ position: 'absolute', bottom: 14, right: 14, fontSize: 10, color: 'rgba(255,255,255,0.24)', pointerEvents: 'none' }}>
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
    const roofGlass = new THREE.Mesh(new THREE.BoxGeometry(p.bodyL * 0.42, 0.018, p.bodyW * 0.86), GLASS());
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
