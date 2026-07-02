# Engine + Website Roadmap (approved 2026-07-01, post-majors)

Owner-approved phased plan from the deep-dive proposal (lights, music analysis, closures, falcon
doors, website). Full reasoning lived in the 2026-07-01 session; the load-bearing findings are
recorded here so any session can execute without re-deriving.

## Key findings the phases rest on

1. **Channel-semantics gap (Lights, biggest finding).** Per the official teslamotors/light-show
   spec: most light channels are BOOLEAN on the car — byte ≥128 (>50%) = ON, else OFF. Ramping
   channels interpret brightness as command BUCKETS (30%=off-2s, 70%=on-500ms, 80%=on-1s,
   90%=on-2s, 100%=instant). Cybertruck alone renders true full brightness. The engine emits
   continuous bytes everywhere; `applyRamping` already speaks bucket-ese but only on channels 2–3.
   Result: the 3D preview shows gradients the car thresholds/buckets — a WYSIWYG gap. Fix order:
   capability table from the official xLights model → car-accurate preview mode → (only after
   owner eye-tests on a real car) a semantics-aware emitter with hysteresis on boolean channels.
   Tesla's old show command/memory limit is REMOVED (verified in official README) — not a concern.
2. **Motif reprise.** Self-similarity is already computed for novelty; cluster repeated sections
   (choruses) and replay the same light + closure motif per cluster. Highest musicality win.
3. **Falcon stagger is wall-clock (3.5s), not musical.** Quantize UP to whole bars (≥3.5s always,
   validator-safe) → the safety delay reads as a deliberate canon. Variants: staggered-apex
   (L apexes a bar early, R on the drop) and "Embrace" (8s close sealing on the final chord).
4. **Loudest-drop trap.** `byPeak[0]` wins the falcon bloom; on loudness-war masters that's the
   FIRST chorus. Tie-break toward later sections now; proper section-cluster budgeting after (2).
5. **Website converts below its substance.** Hero needs a real-car video; add an instant
   pre-analyzed demo show (no upload/account → play in <5s); Lighthouse + Speed Insights before
   any RSC refactor; a11y (focus traps, reduced-motion, timeline aria); RFC 8058 one-click
   List-Unsubscribe headers for Gmail bulk-sender compliance.

Non-goals (do NOT propose): sparse/crisp light feel (owner-closed), partial-pose closures via
Stop (violates the blip-safety invariant), loosening any closure-safety validator rule.

## Phases

- **Phase 1 (~a day): Backlog clear-out** — library-cap/export "Replace my saved show & continue"
  (server-side delete-oldest+create, user-explicit; also fixes the misleading "Save failed" toast),
  falcon musical stagger + loudest-drop tie-break, List-Unsubscribe headers, react-hooks warnings
  triage (27), rotate the no-expiry "WorkFlow" GitHub PAT.
- **Phase 2 (~2–3 days): Channel semantics** — per-channel capability table, car-accurate preview
  mode, harness blink-rate check in the THRESHOLDED domain (seizure-safety angle). Owner eye-tests
  on the real car before any emitter change.
- **Phase 3 (~2–3 days): Musicality** — section clustering → reprise for lights + closures;
  falcon Canon/Embrace variants behind preset flags; owner ear decides.
- **Phase 4 (~2 days): Website** — hero video, instant demo show, Lighthouse pass, a11y.
- **Later:** Turbopack migration (drop `--webpack`), CSP nonces ('unsafe-inline' removal),
  RSC homepage refactor.
