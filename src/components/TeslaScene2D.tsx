'use client';
import { useRef, useEffect, useCallback } from 'react';
import type { TeslaModel, ShowStyle } from '@/lib/supabase';
import { MODELS, generateFrames } from '@/lib/tesla-channels';

interface Props {
  teslaModel: TeslaModel;
  style: ShowStyle;
  intensity: number;
  bpm: number;
  previewBeat: number | null;
  customFrames: Uint8Array[] | null;
  audioTriggerFrames?: Set<number>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function hexToRgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const cr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + cr, y);
  ctx.lineTo(x + w - cr, y); ctx.arcTo(x + w, y, x + w, y + cr, cr);
  ctx.lineTo(x + w, y + h - cr); ctx.arcTo(x + w, y + h, x + w - cr, y + h, cr);
  ctx.lineTo(x + cr, y + h); ctx.arcTo(x, y + h, x, y + h - cr, cr);
  ctx.lineTo(x, y + cr); ctx.arcTo(x, y, x + cr, y, cr);
  ctx.closePath();
}

function angledRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, chamfer: number) {
  ctx.beginPath();
  ctx.moveTo(x + chamfer, y);
  ctx.lineTo(x + w - chamfer, y); ctx.lineTo(x + w, y + chamfer);
  ctx.lineTo(x + w, y + h - chamfer); ctx.lineTo(x + w - chamfer, y + h);
  ctx.lineTo(x + chamfer, y + h); ctx.lineTo(x, y + h - chamfer);
  ctx.lineTo(x, y + chamfer); ctx.closePath();
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function TeslaScene2D({ teslaModel, style, intensity, bpm, previewBeat, customFrames, audioTriggerFrames }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);
  const frameIdx  = useRef(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const def   = MODELS[teslaModel];
    const { proportions: p, zones } = def;
    const W = canvas.width, H = canvas.height;
    const isCT = teslaModel === 'cybertruck';

    // Scale: fit car in canvas with padding
    const PAD = 32;
    const scaleX = (W - PAD * 2) / p.bodyW;
    const scaleY = (H - PAD * 2) / p.bodyL;
    const SC = Math.min(scaleX, scaleY);
    const cx = W / 2, cy = H / 2;

    // World → canvas (top-down: front = top, right = right)
    const wx = (z: number) => cx + z * SC;           // world Z → canvas X
    const wy = (x: number) => cy - x * SC;           // world X → canvas Y (inverted)

    // ── Background ───────────────────────────────────────────────────────────
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, W, H);

    // Subtle grid
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    const gridSpacing = SC * 0.5;
    for (let gx = cx % gridSpacing; gx < W; gx += gridSpacing) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
    }
    for (let gy = cy % gridSpacing; gy < H; gy += gridSpacing) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    }

    // ── Current frame brightness values ──────────────────────────────────────
    const frames: Uint8Array[] = customFrames ?? generateFrames(style, intensity, bpm, 240, def);
    const fi = frameIdx.current % frames.length;
    const frame = frames[fi];

    // ── Car body ─────────────────────────────────────────────────────────────
    const bW = p.bodyW * SC, bL = p.bodyL * SC;
    const bx = cx - bW / 2, by = cy - bL / 2;

    if (isCT) {
      // Cybertruck: angular chamfered rectangle
      ctx.fillStyle = '#1a1a22';
      angledRect(ctx, bx, by, bW, bL, 18);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1.5;
      angledRect(ctx, bx, by, bW, bL, 18);
      ctx.stroke();

      // Truck bed
      if (p.truckBed) {
        const { bedL, bedW, bedX } = p.truckBed;
        const tx = cx - (bedW * SC) / 2, ty = wy(bedX) - (bedL * SC) / 2;
        ctx.fillStyle = '#111116';
        ctx.fillRect(tx, ty, bedW * SC, bedL * SC);
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.strokeRect(tx, ty, bedW * SC, bedL * SC);
      }
    } else {
      // Sedan/SUV: softly rounded rectangle
      ctx.fillStyle = '#1a1a22';
      roundRect(ctx, bx, by, bW, bL, 20);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1.5;
      roundRect(ctx, bx, by, bW, bL, 20);
      ctx.stroke();
    }

    // Cabin roof
    const cW = p.cabinW * SC, cL = p.cabinL * SC;
    const cabinCenterX = p.cabinX; // world X of cabin center
    const ccx = cx - cW / 2, ccy = wy(cabinCenterX + p.cabinL / 2);
    const roofR = isCT ? 4 : (p.roofStyle === 'suv' ? 10 : 8);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    roundRect(ctx, ccx, ccy, cW, cL, roofR);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    roundRect(ctx, ccx, ccy, cW, cL, roofR);
    ctx.stroke();

    // Windshields
    const wshieldH = SC * 0.22;
    const windGrad = ctx.createLinearGradient(0, ccy, 0, ccy + wshieldH);
    windGrad.addColorStop(0, 'rgba(120,180,255,0.12)');
    windGrad.addColorStop(1, 'rgba(120,180,255,0.04)');
    ctx.fillStyle = windGrad;
    roundRect(ctx, ccx + 4, ccy, cW - 8, wshieldH, 4);
    ctx.fill();
    // Rear windshield
    roundRect(ctx, ccx + 4, ccy + cL - wshieldH, cW - 8, wshieldH, 4);
    ctx.fill();

    // ── Wheels ───────────────────────────────────────────────────────────────
    const wheelOffX = p.bodyL / 2 - 0.72;
    const wheelOffZ = p.bodyW / 2 - 0.06;
    const wheelW = SC * 0.22, wheelH = SC * 0.45;
    const wheelPositions = [
      [wheelOffX, -wheelOffZ], [wheelOffX, wheelOffZ],
      [-wheelOffX, -wheelOffZ], [-wheelOffX, wheelOffZ],
    ] as [number, number][];

    wheelPositions.forEach(([wx2, wz]) => {
      const px = wx(wz) - wheelW / 2, py = wy(wx2) - wheelH / 2;
      ctx.fillStyle = '#0a0a0e';
      roundRect(ctx, px, py, wheelW, wheelH, 4);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1.5;
      roundRect(ctx, px, py, wheelW, wheelH, 4);
      ctx.stroke();
      // Rim
      ctx.fillStyle = 'rgba(180,190,210,0.2)';
      roundRect(ctx, px + 3, py + 4, wheelW - 6, wheelH - 8, 3);
      ctx.fill();
    });

    // ── Light zones ───────────────────────────────────────────────────────────
    zones.forEach(zone => {
      const [zx, , zz] = zone.position;
      const brightness = frame[zone.channel] / 255;
      if (brightness < 0.01) return;

      const svgX = wx(zz);
      const svgY = wy(zx);
      const [r, g, b] = hexToRgb(zone.color);

      // Outer glow (big, soft)
      const glowR = getGlowRadius(zone.type) * SC;
      const grd = ctx.createRadialGradient(svgX, svgY, 0, svgX, svgY, glowR);
      grd.addColorStop(0, `rgba(${r},${g},${b},${(brightness * 0.55).toFixed(2)})`);
      grd.addColorStop(0.4, `rgba(${r},${g},${b},${(brightness * 0.18).toFixed(2)})`);
      grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(svgX, svgY, glowR, 0, Math.PI * 2);
      ctx.fill();

      // Core light dot
      const coreR = getCoreRadius(zone.type) * SC;
      const coreDot = ctx.createRadialGradient(svgX, svgY, 0, svgX, svgY, coreR);
      coreDot.addColorStop(0, `rgba(255,255,255,${(brightness * 0.9).toFixed(2)})`);
      coreDot.addColorStop(0.3, `rgba(${r},${g},${b},${(brightness * 0.85).toFixed(2)})`);
      coreDot.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = coreDot;
      ctx.beginPath();
      ctx.arc(svgX, svgY, coreR, 0, Math.PI * 2);
      ctx.fill();
    });

    // Sill strips as lines (legacy ids; none in the current channel model)
    zones.filter(z => z.id.includes('sill')).forEach(zone => {
      const [, , zz] = zone.position;
      const brightness = frame[zone.channel] / 255;
      if (brightness < 0.01) return;
      const [r, g, b] = hexToRgb(zone.color);
      const svgX = wx(zz);
      const frontY = wy(p.bodyL / 2 - 0.6);
      const rearY  = wy(-(p.bodyL / 2 - 0.6));
      const grad = ctx.createLinearGradient(svgX, frontY, svgX, rearY);
      grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
      grad.addColorStop(0.1, `rgba(${r},${g},${b},${(brightness * 0.8).toFixed(2)})`);
      grad.addColorStop(0.9, `rgba(${r},${g},${b},${(brightness * 0.8).toFixed(2)})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 3 * brightness;
      ctx.shadowColor = `rgb(${r},${g},${b})`;
      ctx.shadowBlur = 8 * brightness;
      ctx.beginPath();
      ctx.moveTo(svgX, frontY);
      ctx.lineTo(svgX, rearY);
      ctx.stroke();
      ctx.shadowBlur = 0;
    });

    // "FRONT" label
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('▲ FRONT', cx, PAD - 8);
  }, [teslaModel, style, intensity, bpm, customFrames]);

  // ── Animation loop ────────────────────────────────────────────────────────
  useEffect(() => {
    const FPS = 20, MS = 1000 / FPS;
    let last = 0;
    const loop = (now: number) => {
      rafRef.current = requestAnimationFrame(loop);
      if (now - last < MS) return;
      last = now;
      if (previewBeat === null) frameIdx.current++;
      else {
        const def = MODELS[teslaModel];
        const frames: Uint8Array[] = customFrames ?? generateFrames(style, intensity, bpm, 240, def);
        frameIdx.current = Math.floor(previewBeat * (MS / 1000) * 20) % frames.length;
      }
      draw();
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw, previewBeat, teslaModel, style, intensity, bpm, customFrames]);

  // Redraw on resize
  useEffect(() => {
    const obs = new ResizeObserver(() => draw());
    if (canvasRef.current?.parentElement) obs.observe(canvasRef.current.parentElement);
    return () => obs.disconnect();
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={340}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  );
}

function getGlowRadius(type: string): number {
  switch (type) {
    case 'headlight': case 'highbeam': return 0.32;
    case 'drl': return 0.22;
    case 'tail': case 'brake': return 0.30;
    case 'turn_front': case 'turn_rear': return 0.20;
    case 'interior': return 0.38;
    case 'fog': return 0.18;
    case 'strip': return 0.24;
    default: return 0.20;
  }
}

function getCoreRadius(type: string): number {
  switch (type) {
    case 'headlight': case 'tail': return 0.10;
    case 'drl': case 'brake': return 0.07;
    case 'highbeam': return 0.07;
    case 'interior': return 0.12;
    default: return 0.06;
  }
}
