'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase, type Show } from '@/lib/supabase';
import TeslaScene from '@/components/TeslaScene';
import SocialLinks from '@/components/SocialLinks';

const MODEL_LABELS: Record<string, string> = {
  model3: 'Model 3', modelY: 'Model Y', modelS: 'Model S',
  modelX: 'Model X', cybertruck: 'Cybertruck',
}
const STYLE_LABELS: Record<string, string> = {
  energetic: 'Energetic', wave: 'Wave', strobe: 'Strobe', chase: 'Chase',
}

interface Props {
  show: Show
  audioUrl: string | null
  audioName: string | null
}

function fmt(sec: number) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function ShowPreview({ show, audioUrl, audioName }: Props) {
  const [playing, setPlaying]         = useState(false);
  const [duration, setDuration]       = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [previewBeat, setPreviewBeat] = useState<number | null>(null);
  const [copied, setCopied]           = useState(false);
  const [audioReady, setAudioReady]   = useState(false);

  // Engagement
  const router = useRouter();
  const [viewCount, setViewCount] = useState(show.view_count ?? 0);
  const [likeCount, setLikeCount] = useState(show.like_count ?? 0);
  const [liked, setLiked]         = useState(false);
  const [likeBusy, setLikeBusy]   = useState(false);
  const [signedIn, setSignedIn]   = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef   = useRef<number>(0);
  const bpm      = show.bpm ?? 120;

  // Count a view once per page load, and load this user's like state
  useEffect(() => {
    fetch('/api/shows/view', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: show.share_token }),
    }).then(() => setViewCount(c => c + 1)).catch(() => null);

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSignedIn(!!session);
      const res = await fetch(`/api/shows/like?show_id=${show.id}`).catch(() => null);
      if (res?.ok) {
        const { liked, like_count } = await res.json();
        setLiked(liked);
        setLikeCount(like_count);
      }
    });
  }, [show.id, show.share_token]);

  async function toggleLike() {
    if (!signedIn) { router.push('/auth?mode=signup'); return; }
    if (likeBusy) return;
    setLikeBusy(true);
    // optimistic
    setLiked(v => !v);
    setLikeCount(c => c + (liked ? -1 : 1));
    const res = await fetch('/api/shows/like', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ show_id: show.id }),
    }).catch(() => null);
    if (res?.ok) {
      const { liked: serverLiked, like_count } = await res.json();
      setLiked(serverLiked);
      setLikeCount(like_count);
    }
    setLikeBusy(false);
  }

  // Build audio element once
  useEffect(() => {
    if (!audioUrl) return;
    const audio = new Audio(audioUrl);
    audio.preload = 'metadata';
    audioRef.current = audio;

    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration);
      setAudioReady(true);
    });
    audio.addEventListener('ended', stop);

    return () => {
      audio.pause();
      audio.src = '';
      cancelAnimationFrame(rafRef.current);
    };
  }, [audioUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.currentTime = 0; }
    cancelAnimationFrame(rafRef.current);
    setPlaying(false);
    setCurrentTime(0);
    setPreviewBeat(null);
  }, []);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
      cancelAnimationFrame(rafRef.current);
      setPlaying(false);
      setPreviewBeat(null);
    } else {
      audio.play().catch(() => {});
      setPlaying(true);
      const tick = () => {
        setCurrentTime(audio.currentTime);
        setPreviewBeat((audio.currentTime / 60) * bpm);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = frac * duration;
    setCurrentTime(audio.currentTime);
    setPreviewBeat((audio.currentTime / 60) * bpm);
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const progress = duration ? currentTime / duration : 0;

  return (
    <div style={{ minHeight: '100vh', background: '#000', color: '#fff', display: 'flex', flexDirection: 'column' }}>

      {/* Nav */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2rem', height: 54, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.07)', position: 'sticky', top: 0, zIndex: 50 }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, letterSpacing: '-.2px' }}>
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <rect width="22" height="22" rx="6" fill="#e8404a"/>
            <path d="M6 8h10M8 8v6M14 8v6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          LightShow Builder
        </Link>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={copyLink} style={{ padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', transition: 'all .15s' }}>
            {copied ? '✓ Copied!' : '↑ Share'}
          </button>
          <Link href="/auth?mode=signup" style={{ padding: '6px 16px', borderRadius: 7, fontSize: 12, fontWeight: 600, background: '#e8404a', color: '#fff', letterSpacing: '-.1px' }}>
            Build your own →
          </Link>
        </div>

      </nav>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: 1000, width: '100%', margin: '0 auto', padding: '2rem 2rem 3rem' }}>

        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.4rem, 4vw, 2rem)', fontWeight: 700, letterSpacing: '-0.5px', marginBottom: 8, lineHeight: 1.1 }}>
              {show.name}
            </h1>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'rgba(232,64,74,0.15)', border: '1px solid rgba(232,64,74,0.3)', color: '#ff8a8a' }}>
                {STYLE_LABELS[show.style] ?? show.style}
              </span>
              <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.55)' }}>
                {MODEL_LABELS[show.tesla_model] ?? show.tesla_model}
              </span>
              {show.bpm && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>{show.bpm} BPM</span>}
              {audioName && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>♪ {audioName}</span>}
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>👁 {viewCount.toLocaleString()} views</span>
            </div>
          </div>

          {/* Like button */}
          <button
            onClick={toggleLike}
            disabled={likeBusy}
            title={signedIn ? (liked ? 'Unlike' : 'Like this show') : 'Sign in to like'}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 22,
              background: liked ? 'rgba(232,64,74,0.14)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${liked ? 'rgba(232,64,74,0.4)' : 'rgba(255,255,255,0.12)'}`,
              color: liked ? '#ff8a8a' : 'rgba(255,255,255,0.7)', cursor: 'pointer',
              fontSize: 14, fontWeight: 600, transition: 'all .15s', flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 16 }}>{liked ? '❤️' : '🤍'}</span>
            {likeCount.toLocaleString()}
          </button>
        </div>

        {/* Scene with play overlay + watermark */}
        <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', border: `1px solid ${playing ? 'rgba(0,232,135,0.2)' : 'rgba(255,255,255,0.08)'}`, transition: 'border-color .4s', background: '#09090f' }}>
          <div style={{ height: 'clamp(300px, 50vw, 500px)' }}>
            <TeslaScene
              teslaModel={show.tesla_model}
              style={show.style}
              intensity={show.intensity}
              bpm={bpm}
              previewBeat={previewBeat}
            />
          </div>

          {/* Big play button overlay — shown when not playing */}
          {audioUrl && !playing && (
            <button
              onClick={togglePlay}
              style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
                background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)',
                border: 'none', cursor: 'pointer', transition: 'background .2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.22)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.35)')}
            >
              <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(232,64,74,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 48px rgba(232,64,74,0.5)', transition: 'transform .15s, box-shadow .15s' }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.7)', letterSpacing: '.03em' }}>
                {audioReady ? 'Play with audio' : 'Loading audio…'}
              </span>
            </button>
          )}

          {/* Live indicator when playing */}
          {playing && (
            <div style={{ position: 'absolute', top: 14, left: 14, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', borderRadius: 20, padding: '5px 12px', border: '1px solid rgba(0,232,135,0.3)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#00e887', display: 'inline-block', animation: 'pulse 1s infinite' }} />
              <span style={{ fontSize: 11, color: '#00e887', fontWeight: 600, letterSpacing: '.05em' }}>LIVE</span>
            </div>
          )}

          {/* Watermark */}
          <div style={{ position: 'absolute', bottom: 12, right: 14, fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.22)', letterSpacing: '.04em', pointerEvents: 'none', userSelect: 'none', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
            @thatteslalightshow
          </div>
        </div>

        {/* Audio controls */}
        {audioUrl && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Scrubber */}
            <div
              onClick={seek}
              style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, cursor: 'pointer', position: 'relative', overflow: 'hidden' }}
            >
              <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${progress * 100}%`, background: playing ? '#00e887' : 'rgba(255,255,255,0.4)', borderRadius: 2, transition: playing ? 'none' : 'width .1s' }} />
            </div>

            {/* Controls row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                onClick={togglePlay}
                style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.15)', background: playing ? 'rgba(0,232,135,0.12)' : 'rgba(255,255,255,0.07)', color: playing ? '#00e887' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .15s' }}
              >
                {playing
                  ? <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect width="3.5" height="12" rx="1"/><rect x="7.5" width="3.5" height="12" rx="1"/></svg>
                  : <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M2 1l9 5-9 5V1z"/></svg>
                }
              </button>
              {playing && (
                <button
                  onClick={stop}
                  style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .15s' }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect width="10" height="10" rx="1.5"/></svg>
                </button>
              )}
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', fontVariantNumeric: 'tabular-nums' }}>
                {fmt(currentTime)} {duration ? `/ ${fmt(duration)}` : ''}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(255,255,255,0.2)', letterSpacing: '.03em' }}>
                {playing ? 'lights synced to audio' : ''}
              </span>
            </div>
          </div>
        )}

        {/* No audio state */}
        {!audioUrl && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,0.25)', textAlign: 'center' }}>
            No audio attached to this show
          </div>
        )}

        {/* Share strip */}
        <div style={{ marginTop: '2rem', padding: '1.5rem 1.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.08em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 12 }}>Share this show</div>
          <div className="preview-share-strip" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={copyLink} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.65)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
              {copied ? '✓ Copied!' : 'Copy link'}
            </button>
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out this Tesla light show! 🚗⚡ Built with @ThatTeslaLightShow`)}&url=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '')}`}
              target="_blank" rel="noopener noreferrer"
              style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.65)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              Post on X
            </a>
            <a
              href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '')}`}
              target="_blank" rel="noopener noreferrer"
              style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.65)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg>
              Share on Facebook
            </a>
          </div>
        </div>

        {/* CTA strip */}
        <div style={{ marginTop: '1rem', padding: '1.75rem 2rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Build your own light show</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
              Upload any song · sync 48 channels · export to USB · first show free
            </div>
          </div>
          <Link href="/auth?mode=signup" style={{ padding: '10px 22px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: '#e8404a', color: '#fff', letterSpacing: '-.1px', boxShadow: '0 0 30px rgba(232,64,74,0.25)', flexShrink: 0 }}>
            Start building →
          </Link>
        </div>

      </div>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '1.25rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>Made with LightShow Builder</span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.15)', fontWeight: 600, letterSpacing: '.04em' }}>· @ThatTeslaLightShow</span>
        </div>
        <SocialLinks gap={4} size={26} />
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.12)' }}>Not affiliated with Tesla, Inc.</span>
      </footer>
    </div>
  );
}
