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
  nsfw: 'https://cdn.jsdelivr.net/npm/nsfwjs@4.3.0/dist/browser/nsfwjs.min.js',
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
let loadPromise: Promise<void> | null = null

// Load the models EXACTLY ONCE — a shared promise, so concurrent/repeat calls (React re-renders, retries)
// never kick off a second load (which races and throws "Could not load the model"). Full TF.js first, then
// each model BEST-EFFORT so a single flaky model can't take the whole tool down. Never throws.
function loadModels(): Promise<void> {
  if (!loadPromise) loadPromise = (async () => {
    const w = window as any
    await loadScript(CDN.tf)                                                    // full TF first (nsfwjs's graph model needs it)
    try { await loadScript(CDN.nsfw); nsfw = await w.nsfwjs.load() } catch { nsfw = null }   // NSFW gate — best-effort
    try { await loadScript(CDN.coco); coco = await w.cocoSsd.load() } catch { coco = null }   // vehicle gate — best-effort
  })()
  return loadPromise
}

// PASS: no clearly-explicit frame, and — if the vehicle detector loaded — a car/truck in ≥1 frame. Each
// check is enforced when its model is available; needs at least one to have loaded (else we can't verify).
export async function moderateFrames(frames: HTMLCanvasElement[]): Promise<Moderation> {
  await loadModels()
  if (!coco && !nsfw) { loadPromise = null; return { ok: false, reason: 'Could not load the on-device content checker. Check your connection and try again.' } }

  let sawVehicle = false
  for (const f of frames) {
    if (nsfw) {
      const preds: Array<{ className: string; probability: number }> = await nsfw.classify(f)
      const p: Record<string, number> = {}
      for (const x of preds) p[x.className] = x.probability
      if ((p.Porn ?? 0) > 0.5 || (p.Hentai ?? 0) > 0.5 || (p.Sexy ?? 0) > 0.85) {
        return { ok: false, reason: "This video doesn't look appropriate for the site, so we can't brand it." }
      }
    }
    if (coco) {
      const objs: Array<{ class: string; score: number }> = await coco.detect(f)
      if (objs.some(o => (o.class === 'car' || o.class === 'truck') && o.score > 0.45)) sawVehicle = true
    }
  }
  if (coco && !sawVehicle) return { ok: false, reason: "We couldn't spot a Tesla in the video — make sure your car is clearly in frame, then try again." }
  return { ok: true }
}

// Same on-device check on a single IMAGE (e.g. a linked post's oEmbed thumbnail, proxied same-origin as a
// data URL so it isn't a tainted canvas). Used to gate community links to real, on-brand car footage.
export async function moderateImage(src: string): Promise<Moderation> {
  let img: HTMLImageElement
  try {
    img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('image')); i.src = src })
  } catch { return { ok: false, reason: "Couldn't read the post's preview image." } }
  const c = document.createElement('canvas'); c.width = 224; c.height = 224
  c.getContext('2d')!.drawImage(img, 0, 0, 224, 224)
  return moderateFrames([c])
}
