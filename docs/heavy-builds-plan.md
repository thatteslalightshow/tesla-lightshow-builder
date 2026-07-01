# Heavy Builds — Approach & Session Plan

_Code-ready specs for the ambitious, multi-session work. Written 2026-07-01. Companion to
`tesla-lightshow-next-phase-plan.md`._

## Guardrails that carry over from the engine work
1. **Every engine-touching change is gated:** sim-verify the numbers → `npm run test:fseq` (re-bless
   the golden only for *intentional* output changes) → **owner ear-test** before we trust it.
2. **Enhancements MODULATE the loved "breathing" model — they never replace it or hard-gate.** (The
   crispen/sparse revert is the standing lesson.)
3. **Ship thin vertical slices**, each independently verifiable; put anything risky behind a flag.
4. **BYOM privacy is inviolable:** copyrighted audio never touches the server.

## What's already done (so we don't re-plan it)
- **FSEQ conformance + regression harness** (heavy #4) — ✅ done (`npm run test:fseq`).
- **Auto-vibe detection** (strong-but-lighter) — ✅ effectively done via Apple-genre lookup.

---

## Dependency map & recommended sequence

```
Build 1  Composed choreography ─────────────┐  (pure engine; independent)
                                             ├─► better SHOWS
Build 3  Model-accurate 3D closures ──┐      │
                                      ├──────┴─► Build 2  Shareable clip export
                                      │            (captures the 3D preview + picks the best
Pro/Sparse opt-in (½ session) ────────┘             15–30s window from Build 1's structure map)
```

- **Build 2 (shareable clip) depends on Build 3** (it records the preview — realism = clip quality) and
  **benefits from Build 1** (auto-pick the drop as the highlight).
- **Build 1 is independent** and the deepest quality lever.

**Recommendation:** do **Build 1 → Build 3 → Build 2**. Rationale: the engine is the differentiator and
Build 1 is now *de-risked* by the sim + harness; it makes every show (and every future clip) better. Then
Build 3 makes the preview real, and Build 2 turns those now-great shows into the growth flywheel — sharing a
clip of a mediocre show doesn't convert, so quality precedes distribution. Slot **Pro/Sparse** in anytime as
a half-session win. _(If pure growth speed is the priority instead, flip to Build 3 → Build 2 first.)_

---

## Build 1 — Composed choreography (song-structure) ⭐ deepest lever

**What / why.** Move the *lights* from local energy-reaction to whole-song choreography: hold back in
verses, bloom on choruses, blast real drops — so the show feels *composed*, not generated. The **closures
already do this** (`detectSections` + true-drop bloom in `audio-analysis.ts`); Build 1 brings that
structure-awareness to the light dynamics.

**Approach (2–3 sessions, each ear-test-gated):**
- **1a — Structure map.** Upgrade `detectSections` into a real `buildStructure()`: a self-similarity
  matrix over per-frame spectral features (reuse the existing FFT band energies + a small MFCC-lite
  vector), a novelty curve for boundaries, and per-section energy labels (intro / verse / build / chorus /
  drop / bridge / outro). Output `sections[]` with `{start, end, kind, targetIntensity}`. Keep it
  CPU-light (downsample features to ~5–10 fps; the O(n²) SSM is on hundreds of frames → fine on phones).
- **1b — Conductor.** A whole-track intensity ARC that **modulates the existing `density[]` envelope**
  (which already gates negative-space / expression / flourish) — scale it down in verses, up on choruses,
  full on drops. This is additive-safe: it multiplies knobs we already have; the reactive base is
  untouched.
- **1c — Facets.** Downbeat/measure emphasis (hit the "1" of the bar harder), phrase builds (ramp across a
  phrase), tempo-adaptive holds. Ship one at a time.

**Files:** `src/lib/audio-analysis.ts` (new `buildStructure()`, conductor modulation of `density[]`;
reactive base and per-vibe params unchanged).

**Verify:** sim — chorus intensity measurably > verse, drops peak highest, steady songs still ~unchanged;
`npm run test:fseq` (output will shift → re-bless); benchmark structure against the 67 reference shows;
owner ear-test. **Acceptance:** sections detected sensibly; verse↔chorus intensity delta > threshold;
A/B beats frame-by-frame; no regression on the shows the owner already loves.

**Risk:** it changes *feel* → the modulate-don't-replace guardrail + ear-test are mandatory.

---

## Build 2 — Shareable clip export ⭐ growth flywheel

**What / why.** Render the preview to a **vertical (9:16) video** the user posts to TikTok/Reels/Stories.
Every shared clip is free marketing — turns each user into a distributor.

**Hard constraint:** **client-side capture, audio NEVER uploaded** (BYOM copyright). Always offer a **silent
version** too.

**Approach (2 sessions):**
- **2a — Canvas capture.** Render `TeslaScene` to a 9:16 target and capture via
  `canvas.captureStream()` + `MediaRecorder` → WebM, entirely client-side, driven by the show frames.
  Auto-pick the best **15–30s window** (the loudest drop — reuse `detectSections` / Build 1's map). A hero
  camera move (slow orbit) for the clip.
- **2b — Audio + brand.** Mux the user's **local** audio track into the capture from the existing WebAudio
  graph (a `MediaStreamAudioDestinationNode`), plus a branding/watermark overlay and prefilled caption.
  Silent variant for the copyright-cautious.
- **2c — Share.** Download + prefilled captions/hashtags (from the marketing plan) and a share sheet.

**Files:** new `src/components/ClipExport.tsx` (+ a capture hook); hooks into `TeslaScene` and the builder's
audio graph.

**Key decisions:** codec — WebM (VP8/VP9) has broad support; **MP4 needs `ffmpeg.wasm` (heavy) → defer**.
Watch **Safari/iOS `MediaRecorder`** quirks (fallback: frame-by-frame canvas encode, or a "record your
screen" guide as interim). **Verify:** cross-browser, file size, and a hard check that **no audio request
leaves the client**. **Acceptance:** a 9:16 clip with lights + local audio (or silent), generated
client-side, downloadable/shareable.

**Risk:** browser codec/perf variance; copyright (mitigated by client-side + silent option — design it in
from the start, not bolted on).

---

## Build 3 — Model-accurate 3D preview (closure motion)

**What / why.** The preview is the in-app "wow" and the visitor→user conversion moment — and the raw
material for Build 2. Today `TeslaScene.tsx` **animates closures for Model S only**; the other four GLBs
(all present in `public/models/`) don't move their panels yet.

**Approach (2–3 sessions):**
- **3a — Rig each model's closures.** Map the GLB nodes for doors / **falcon wings** / frunk / liftgate /
  mirrors / charge port per model, and drive them from the closure channels (open / close / dance) in sync
  with the show — generalizing the Model-S path to a per-model node map.
- **3b — Motion realism.** Correct pivots, travel, and timing to match `CLOSURE_DURATIONS` and the
  safety limits (the falcon-wing arc especially), so the preview reflects the real car's motion.
- **3c — Light-geometry polish per model** (lens positions) — partly done (see `preview-parity` memory).

**Files:** `src/components/TeslaScene.tsx` (extend the Model-S closure animation to all models; per-model
node maps + graceful fallback when a node is missing).

**Verify:** visually per model against real footage; closures move in sync with the closure channels.
**Acceptance:** all 5 models animate their closures correctly in preview. **Dependency:** enables Build 2.
**Risk:** GLB rigging varies per model; keep motion faithful to the safety-accurate timing.

---

## Lighter-tier interstitials (fit between heavy builds)

- **Pro/Sparse opt-in style** (~½ session) — salvage the reverted crisp/negative-space look as a
  *selectable* style (a `style` flag or a `pro` entry alongside the vibes), **never the default**. The
  crispen + negative-space code and the sim targets already exist. Guardrail: opt-in only.
- **Gallery / remix / trending loop** (~1 session) — build on the community shows already in place.
- **Analytics / funnel instrumentation** (~½–1 session) — extend the existing admin funnel / add PostHog to
  see where the funnel leaks before optimizing.

---

## How we'll run each heavy session
1. Restate the guardrails; pick ONE thin slice.
2. Build it → sim-verify → `npm run test:fseq` → build/tsc.
3. For engine slices: **stop for the owner ear-test** before the next slice.
4. Update memory + this doc as slices land.

**Pick a build and I'll expand it into a first-session task breakdown (files, diffs, acceptance) and start.**
