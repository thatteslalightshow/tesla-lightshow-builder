'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { MODELS, generateFrames } from '@/lib/tesla-channels';
import type { TeslaModel, ShowStyle } from '@/lib/supabase';

interface Props {
  teslaModel: TeslaModel;
  style: ShowStyle;
  intensity: number;
  bpm: number;
}

interface Tooltip { label: string; x: number; y: number }

export default function TeslaScene({ teslaModel, style, intensity, bpm }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  useEffect(() => {
    const elRaw = mountRef.current;
    if (!elRaw) return;
    const el: HTMLDivElement = elRaw;

    const def = MODELS[teslaModel];
    const { proportions: p, zones } = def;

    // ── Renderer ─────────────────────────────────────────────────────────────
    const w = el.clientWidth || 800;
    const h = el.clientHeight || 480;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    // ── Scene ─────────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0f);
    scene.fog = new THREE.FogExp2(0x0a0a0f, 0.04);

    // ── Camera ────────────────────────────────────────────────────────────────
    const dist = p.bodyL * 1.8;
    const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 120);
    camera.position.set(dist * 0.5, dist * 0.35, dist * 0.9);

    // ── Controls ─────────────────────────────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = p.bodyL * 0.8;
    controls.maxDistance = p.bodyL * 4;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.target.set(0, p.bodyH * 0.5, 0);
    controls.update();

    // ── Lighting ─────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0x111122, 0.6));
    const sun = new THREE.DirectionalLight(0x8899cc, 0.4);
    sun.position.set(4, 8, 4);
    sun.castShadow = true;
    scene.add(sun);

    // ── Floor ─────────────────────────────────────────────────────────────────
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({ color: 0x0e0e16, roughness: 0.95, metalness: 0 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // ── Car body ─────────────────────────────────────────────────────────────
    const metalness = teslaModel === 'cybertruck' ? 0.9 : 0.65;
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1c1c2e, roughness: 0.28, metalness });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x224466, roughness: 0.05, metalness: 0.1, opacity: 0.6, transparent: true });
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111118, roughness: 0.7, metalness: 0.2 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x888899, roughness: 0.3, metalness: 0.8 });

    function addBox(x: number, y: number, z: number, bw: number, bh: number, bd: number, mat: THREE.Material) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      scene.add(m);
      return m;
    }

    // Lower body — centred at Y = bodyH/2 (bottom flush with floor)
    const floorOffset = 0.10;
    addBox(0, floorOffset + p.bodyH / 2, 0, p.bodyL, p.bodyH, p.bodyW, bodyMat);

    // Cabin
    if (p.roofStyle === 'fastback') {
      addBox(p.cabinX, floorOffset + p.bodyH + p.cabinH / 2, 0, p.cabinL, p.cabinH, p.cabinW, bodyMat);
      // Windscreen
      addBox(p.cabinX + p.cabinL * 0.36, floorOffset + p.bodyH + p.cabinH * 0.5, 0, p.cabinL * 0.08, p.cabinH * 0.9, p.cabinW * 0.95, glassMat);
      // Rear glass
      addBox(p.cabinX - p.cabinL * 0.38, floorOffset + p.bodyH + p.cabinH * 0.45, 0, p.cabinL * 0.06, p.cabinH * 0.7, p.cabinW * 0.95, glassMat);
    } else if (p.roofStyle === 'suv') {
      addBox(p.cabinX, floorOffset + p.bodyH + p.cabinH / 2, 0, p.cabinL, p.cabinH, p.cabinW, bodyMat);
      addBox(p.cabinX + p.cabinL * 0.34, floorOffset + p.bodyH + p.cabinH * 0.48, 0, p.cabinL * 0.07, p.cabinH * 0.85, p.cabinW * 0.94, glassMat);
      addBox(p.cabinX - p.cabinL * 0.36, floorOffset + p.bodyH + p.cabinH * 0.48, 0, p.cabinL * 0.05, p.cabinH * 0.75, p.cabinW * 0.94, glassMat);
    } else {
      // Angular (Cybertruck) — add angular cabin using two angled boxes
      addBox(p.cabinX, floorOffset + p.bodyH + p.cabinH / 2, 0, p.cabinL, p.cabinH, p.cabinW, bodyMat);
      // Slanted windscreen effect (thin flat glass piece)
      const wg = new THREE.Mesh(new THREE.BoxGeometry(p.cabinL * 0.12, p.cabinH * 0.95, p.cabinW * 0.95), glassMat);
      wg.position.set(p.cabinX + p.cabinL * 0.38, floorOffset + p.bodyH + p.cabinH * 0.5, 0);
      wg.rotation.z = -0.28;
      wg.castShadow = true;
      scene.add(wg);
    }

    // Truck bed (Cybertruck only)
    if (p.truckBed) {
      const { bedL, bedW, bedH, bedX } = p.truckBed;
      // Bed walls
      addBox(bedX, floorOffset + p.bodyH + bedH / 2, -bedW / 2 + 0.06, bedL, bedH, 0.10, bodyMat);
      addBox(bedX, floorOffset + p.bodyH + bedH / 2,  bedW / 2 - 0.06, bedL, bedH, 0.10, bodyMat);
      addBox(bedX - bedL / 2, floorOffset + p.bodyH + bedH / 2, 0, 0.10, bedH, bedW, bodyMat);
    }

    // Wheels — four cylinders
    const wheelR = 0.36;
    const wheelW = 0.22;
    const axleY = floorOffset + wheelR;
    const axleX = p.bodyL * 0.33;
    const axleZ = p.bodyW / 2 + wheelW * 0.3;
    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        const tire = new THREE.Mesh(new THREE.CylinderGeometry(wheelR, wheelR, wheelW, 24), wheelMat);
        tire.rotation.z = Math.PI / 2;
        tire.position.set(sx * axleX, axleY, sz * axleZ);
        tire.castShadow = true;
        scene.add(tire);

        const rim = new THREE.Mesh(new THREE.CylinderGeometry(wheelR * 0.55, wheelR * 0.55, wheelW + 0.01, 24), rimMat);
        rim.rotation.z = Math.PI / 2;
        rim.position.copy(tire.position);
        rim.castShadow = true;
        scene.add(rim);
      }
    }

    // ── Light zones (interactive spheres + point lights) ─────────────────────
    const zoneObjects: { mesh: THREE.Mesh; pl: THREE.PointLight; zone: typeof zones[0] }[] = [];

    zones.forEach(zone => {
      const [x, y, z] = zone.position;

      const mat = new THREE.MeshStandardMaterial({
        color: zone.color,
        emissive: zone.color,
        emissiveIntensity: 0.3,
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), mat);
      mesh.position.set(x, y, z);
      mesh.userData.zoneId = zone.id;
      scene.add(mesh);

      const pl = new THREE.PointLight(zone.color, 0, 1.5);
      pl.position.set(x, y, z);
      scene.add(pl);

      zoneObjects.push({ mesh, pl, zone });
    });

    // ── Pre-generate 2 seconds of frame data for looping ─────────────────────
    const LOOP_FRAMES = 40; // 2 s at 20 fps
    const frameData = generateFrames(style, intensity, bpm, LOOP_FRAMES, def);

    // ── Raycaster for hover tooltips ─────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const zoneMeshes = zoneObjects.map(o => o.mesh);

    function onMouseMove(e: MouseEvent) {
      const rect = el.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(zoneMeshes);
      if (hits.length > 0) {
        const hit = hits[0].object as THREE.Mesh;
        const zone = zoneObjects.find(o => o.mesh === hit)?.zone;
        if (zone) {
          setTooltip({ label: zone.label, x: e.clientX - rect.left, y: e.clientY - rect.top });
        }
      } else {
        setTooltip(null);
      }
    }

    el.addEventListener('mousemove', onMouseMove);

    // ── Animation loop ────────────────────────────────────────────────────────
    let raf: number;
    let frameIdx = 0;
    let lastFrameTime = 0;
    const frameIntervalMs = 1000 / 20;

    function animate(now: number) {
      raf = requestAnimationFrame(animate);
      controls.update();

      if (now - lastFrameTime >= frameIntervalMs) {
        lastFrameTime = now;
        const frame = frameData[frameIdx % LOOP_FRAMES];
        frameIdx++;

        zoneObjects.forEach(({ mesh, pl, zone }) => {
          const raw = frame[zone.channel];
          const b = raw / 255;
          const mat = mesh.material as THREE.MeshStandardMaterial;
          mat.emissiveIntensity = 0.15 + b * 3.5;
          pl.intensity = b * 2.2;
        });
      }

      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(animate);

    // ── Resize handler ────────────────────────────────────────────────────────
    const observer = new ResizeObserver(() => {
      const nw = el.clientWidth;
      const nh = el.clientHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    });
    observer.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('mousemove', onMouseMove);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
      setTooltip(null);
    };
  }, [teslaModel, style, intensity, bpm]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%', cursor: 'grab' }} />
      {tooltip && (
        <div
          style={{
            position: 'absolute',
            left: tooltip.x + 12,
            top: tooltip.y + 8,
            background: 'rgba(10,10,20,0.9)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 6,
            padding: '4px 10px',
            fontSize: 12,
            color: '#e8e8f0',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            backdropFilter: 'blur(8px)',
            zIndex: 10,
          }}
        >
          {tooltip.label}
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          bottom: 10,
          right: 12,
          fontSize: 11,
          color: 'rgba(255,255,255,0.3)',
          pointerEvents: 'none',
        }}
      >
        drag to rotate · scroll to zoom
      </div>
    </div>
  );
}
