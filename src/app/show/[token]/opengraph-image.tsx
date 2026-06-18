import { ImageResponse } from 'next/og'
import { getAdminClient } from '@/lib/supabase'

export const size        = { width: 1200, height: 630 }
export const contentType = 'image/png'

const MODEL_LABELS: Record<string, string> = {
  model3: 'Model 3', modelY: 'Model Y', modelS: 'Model S',
  modelX: 'Model X', cybertruck: 'Cybertruck',
}
const STYLE_COLORS: Record<string, string> = {
  energetic: '#e8404a', wave: '#4a90e8', strobe: '#e8d84a', chase: '#00e887',
  pulse: '#ff6b35', ripple: '#9d6bff', bounce: '#ff4aa0', twinkle: '#4ad8e8',
}

export default async function Image({ params }: { params: { token: string } }) {
  const admin = getAdminClient()
  const { data: show } = await admin
    .from('shows')
    .select('name, tesla_model, style, bpm, intensity')
    .eq('share_token', params.token)
    .eq('is_public', true)
    .single()

  const name       = show?.name       ?? 'Tesla Light Show'
  const model      = MODEL_LABELS[show?.tesla_model ?? ''] ?? 'Tesla'
  const style      = show?.style      ?? 'energetic'
  const accentColor = STYLE_COLORS[style] ?? '#e8404a'
  const bpm        = show?.bpm

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200, height: 630,
          background: '#08080f',
          display: 'flex', flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '60px 80px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background glow */}
        <div style={{
          position: 'absolute', top: -100, right: -100,
          width: 500, height: 500,
          background: `radial-gradient(ellipse, ${accentColor}22 0%, transparent 70%)`,
          display: 'flex',
        }} />
        <div style={{
          position: 'absolute', bottom: -80, left: 0,
          width: 400, height: 300,
          background: 'radial-gradient(ellipse, rgba(255,255,255,0.03) 0%, transparent 70%)',
          display: 'flex',
        }} />

        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* Logo mark */}
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: accentColor,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{ display: 'flex', gap: 3 }}>
                {[0,1,2,3].map(i => (
                  <div key={i} style={{
                    width: 3, borderRadius: 2,
                    height: [18, 28, 22, 14][i],
                    background: '#fff',
                    display: 'flex',
                  }} />
                ))}
              </div>
            </div>
            <span style={{ fontSize: 18, fontWeight: 600, color: 'rgba(255,255,255,0.6)', letterSpacing: '-0.3px' }}>
              ThatTeslaLightshow
            </span>
          </div>

          {/* Style pill */}
          <div style={{
            padding: '6px 18px', borderRadius: 100,
            background: `${accentColor}22`,
            border: `1px solid ${accentColor}55`,
            fontSize: 15, fontWeight: 700,
            color: accentColor,
            letterSpacing: '0.05em', textTransform: 'uppercase',
            display: 'flex',
          }}>
            {style.charAt(0).toUpperCase() + style.slice(1)}
          </div>
        </div>

        {/* Main content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            {model} Light Show
          </div>
          <div style={{
            fontSize: name.length > 28 ? 52 : 64,
            fontWeight: 800,
            color: '#fff',
            lineHeight: 1.05,
            letterSpacing: '-2px',
          }}>
            {name}
          </div>
          {bpm && (
            <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.35)', display: 'flex', gap: 6 }}>
              <span style={{ color: accentColor }}>♪</span>
              <span>{bpm} BPM</span>
            </div>
          )}
        </div>

        {/* Bottom bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.04em' }}>
            @ThatTeslaLightshow
          </span>
          <div style={{
            padding: '10px 28px', borderRadius: 8,
            background: accentColor,
            fontSize: 16, fontWeight: 700,
            color: '#fff', letterSpacing: '-0.2px',
            display: 'flex',
          }}>
            Watch the Show →
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
