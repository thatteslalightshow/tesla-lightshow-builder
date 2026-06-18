'use client';

/**
 * A tiny, GPU-cheap preview of a show's light pattern — a row of zones that
 * pulse according to the show's style + BPM + intensity. Pure CSS animation
 * (no canvas, no Three.js) so a gallery can render dozens at once.
 */

const ACCENT: Record<string, string> = {
  energetic: '#e8404a', wave: '#4a90e8', strobe: '#e8d84a', chase: '#00e887',
};

const ZONES = 11;

export default function LightStrip({
  style, bpm, intensity, height = 64,
}: {
  style: string; bpm: number | null; intensity: number; height?: number;
}) {
  const accent = ACCENT[style] ?? '#e8404a';
  const beat = 60 / (bpm && bpm > 0 ? bpm : 120); // seconds per beat
  const maxOpacity = 0.35 + (Math.min(100, Math.max(0, intensity)) / 100) * 0.65;

  const zones = Array.from({ length: ZONES }, (_, i) => {
    let animationName = 'ls-pulse';
    let duration = beat;
    let delay = 0;

    switch (style) {
      case 'wave': {
        duration = beat * 2;
        delay = (i / ZONES) * duration; // traveling wave
        break;
      }
      case 'chase': {
        animationName = 'ls-blip';
        duration = beat * ZONES * 0.5;
        delay = (i / ZONES) * duration; // single lit zone sweeps across
        break;
      }
      case 'strobe': {
        animationName = 'ls-strobe';
        duration = beat;
        delay = 0; // all flash together
        break;
      }
      case 'energetic':
      default: {
        duration = beat;
        delay = ((i * 137) % 100) / 100 * duration; // lively, offset per zone
        break;
      }
    }

    return (
      <span
        key={i}
        style={{
          flex: 1,
          borderRadius: 3,
          background: accent,
          boxShadow: `0 0 8px ${accent}`,
          animationName,
          animationDuration: `${duration}s`,
          animationDelay: `${delay}s`,
          animationIterationCount: 'infinite',
          animationTimingFunction: 'ease-in-out',
          // CSS var consumed by the keyframes for peak brightness
          ['--ls-peak' as string]: maxOpacity,
          opacity: 0.12,
        }}
      />
    );
  });

  return (
    <div
      style={{
        height,
        display: 'flex',
        alignItems: 'stretch',
        gap: 4,
        padding: 10,
        background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.025), transparent 70%), #08080f',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}
    >
      {zones}
    </div>
  );
}
