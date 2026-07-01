// Client-side (in-browser) content guardrail for the shareable-clip tool. NOTHING is uploaded — we
// sample frames from the user's OWN video and check them ON-DEVICE, so our branding only ever ends up on
// real-car, on-brand footage. Song profanity is AUDIO and untouched; this is visual only.
//
// The TF.js libs are loaded from CDN at RUNTIME (not bundled): they're large, and nsfwjs ships its model
// as shards webpack can't statically analyse. It FAILS CLOSED — if the models can't load, we reject.
// Hardening follow-up: self-host the libs + weights under /public and drop the CDN (also lets us tighten CSP).
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Moderation = { ok: boolean; reason?: string }

const CDN = {
  tf: 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js',
  coco: 'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js',
  nsfw: 'https://cdn.jsdelivr.net/npm/nsfwjs@4.2.1/dist/nsfwjs.min.js',
}

function loadScript(src: string): Promise<void> {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res()
    const s = document.createElement('script'); s.src = src; s.async = true
    s.onload = () => res(); s.onerror = () => rej(new Error('script load failed'))
    document.head.appendChild(s)
  })
}

let coco: any = null, nsfw: any = null
async function loadModels(): Promise<void> {
  if (coco && nsfw) return
  await loadScript(CDN.tf)
  await Promise.all([loadScript(CDN.coco), loadScript(CDN.nsfw)])
  const w = window as any
  const [c, n] = await Promise.all([coco ?? w.cocoSsd.load(), nsfw ?? w.nsfwjs.load()])
  coco = c; nsfw = n
}

// PASS requires a car/truck visible in ≥1 sampled frame AND no clearly-explicit frame. Fails closed.
export async function moderateFrames(frames: HTMLCanvasElement[]): Promise<Moderation> {
  try { await loadModels() } catch { return { ok: false, reason: 'Could not load the on-device content checker. Check your connection and try again.' } }
  if (!coco || !nsfw) return { ok: false, reason: 'Content checker unavailable. Try again.' }

  let sawVehicle = false
  for (const f of frames) {
    const preds: Array<{ className: string; probability: number }> = await nsfw.classify(f)
    const p: Record<string, number> = {}
    for (const x of preds) p[x.className] = x.probability
    if ((p.Porn ?? 0) > 0.5 || (p.Hentai ?? 0) > 0.5 || (p.Sexy ?? 0) > 0.85) {
      return { ok: false, reason: "This video doesn't look appropriate for the site, so we can't brand it." }
    }
    const objs: Array<{ class: string; score: number }> = await coco.detect(f)
    if (objs.some(o => (o.class === 'car' || o.class === 'truck') && o.score > 0.45)) sawVehicle = true
  }
  if (!sawVehicle) return { ok: false, reason: "We couldn't spot a Tesla in the video — make sure your car is clearly in frame, then try again." }
  return { ok: true }
}
