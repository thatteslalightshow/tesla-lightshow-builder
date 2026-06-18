'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import TeslaScene from '@/components/TeslaScene';
import type { TeslaModel, ShowStyle } from '@/lib/supabase';

const VALID_MODELS: TeslaModel[] = ['model3', 'modelY', 'modelS', 'modelX', 'cybertruck'];
const VALID_STYLES: ShowStyle[] = ['energetic', 'wave', 'strobe', 'chase', 'pulse', 'ripple', 'bounce', 'twinkle'];

/**
 * Public, auth-free 3D preview rendered inside the mobile app's WebView.
 * Driven entirely by URL params: ?model=model3&style=energetic&bpm=120&intensity=80
 */
function EmbedScene() {
  const params = useSearchParams();

  const rawModel = params.get('model') as TeslaModel;
  const rawStyle = params.get('style') as ShowStyle;
  const model: TeslaModel = VALID_MODELS.includes(rawModel) ? rawModel : 'model3';
  const style: ShowStyle = VALID_STYLES.includes(rawStyle) ? rawStyle : 'energetic';
  const bpm = Math.min(300, Math.max(40, parseInt(params.get('bpm') ?? '120') || 120));
  const intensity = Math.min(100, Math.max(0, parseInt(params.get('intensity') ?? '80') || 80));

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#06060e' }}>
      <TeslaScene teslaModel={model} style={style} intensity={intensity} bpm={bpm} />
    </div>
  );
}

export default function EmbedPage() {
  return (
    <Suspense fallback={<div style={{ position: 'fixed', inset: 0, background: '#06060e' }} />}>
      <EmbedScene />
    </Suspense>
  );
}
