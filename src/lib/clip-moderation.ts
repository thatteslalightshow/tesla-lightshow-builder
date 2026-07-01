// Client-side (in-browser) content guardrail for the shareable-clip tool. NOTHING is uploaded — we
// sample frames from the user's OWN video and check them ON-DEVICE, so our branding only ever ends up on
// real-car, on-brand footage. Song profanity is AUDIO and untouched; this is visual only.
//
// The TF.js libs load at RUNTIME (not webpack-bundled: they're large, and nsfwjs resolves its model
// through script-registered globals webpack can't analyse) from SELF-HOSTED copies under /public — no
// CDN, so CSP needs no external script/connect hosts and a third party can't alter what runs the
// guardrail. Pinned versions in public/vendor/ (tf 4.22.0, coco-ssd 2.2.3, nsfwjs 4.3.0); coco-ssd's
// weights (lite_mobilenet_v2) mirrored under /models/coco-ssd/. It FAILS CLOSED — models can't load
// → reject.
//
// nsfwjs's MobileNetV2 weights are NOT inside nsfwjs.min.js — the library expects the separate
// model.min.js + shard scripts (which register window.model / window.group1_shard1of1) to be loaded
// first, else load() throws. The CDN era loaded only the lib, so the NSFW gate silently never ran
// (the catch nulled it out and only the vehicle check applied). Self-hosting fixed that.
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Moderation = { ok: boolean; reason?: string }

const VENDOR = {
  tf: '/vendor/tf.min.js',
  coco: '/vendor/coco-ssd.min.js',
  nsfw: '/vendor/nsfwjs.min.js',
  nsfwModel: '/vendor/nsfw-mobilenet-v2/model.min.js',
  nsfwWeights: '/vendor/nsfw-mobilenet-v2/group1-shard1of1.min.js',
}
const COCO_MODEL_URL = '/models/coco-ssd/model.json'

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
// never kick off a second load (which races and throws "Could not load the model"). Full TF.js first.
// Load failures are logged (a silent catch here once hid the NSFW gate being dead for months).
function loadModels(): Promise<void> {
  if (!loadPromise) loadPromise = (async () => {
    const w = window as any
    await loadScript(VENDOR.tf)                                                 // full TF first (the models need it)
    try {
      // Model + weight scripts MUST come before load() — they register the globals it resolves.
      await loadScript(VENDOR.nsfw)
      await Promise.all([loadScript(VENDOR.nsfwModel), loadScript(VENDOR.nsfwWeights)])
      nsfw = await w.nsfwjs.load()
    } catch (e) { nsfw = null; console.warn('[clip-moderation] NSFW model failed to load:', e) }
    try { await loadScript(VENDOR.coco); coco = await w.cocoSsd.load({ modelUrl: COCO_MODEL_URL }) }
    catch (e) { coco = null; console.warn('[clip-moderation] vehicle model failed to load:', e) }
  })()
  return loadPromise
}

// PASS requires BOTH gates: no clearly-explicit frame AND a car/truck in ≥1 frame. FAIL CLOSED on load:
// each gate used to be "enforced when its model is available", so one flaky model load silently skipped
// its check — a no-car video shipped with our branding exactly that way. Both models are same-origin
// now, so requiring both costs little; a failed load resets the shared promise so the NEXT attempt
// retries instead of the failure poisoning the whole session.
export async function moderateFrames(frames: HTMLCanvasElement[]): Promise<Moderation> {
  await loadModels()
  if (!coco || !nsfw) { loadPromise = null; return { ok: false, reason: 'Could not load the on-device content checker. Check your connection and try again.' } }

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
