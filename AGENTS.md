<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# How to work in this repo

Distilled discipline (Karpathy-style) tailored to this codebase. This is a solo-founder,
production app where **a wrong change can move a customer's car, lose money, or corrupt an export** —
so bias toward understanding and verification over speed.

1. **Think before coding.** State your assumptions explicitly. If the request is ambiguous, stop and
   name what's unclear rather than choosing silently — present the interpretations. Read the actual
   code/encoding before changing anything near the engine or closures (e.g. read how `choreographClosures`
   emits bytes before touching `validateClosureSafety`).

2. **Simplicity first.** Minimum code that solves the problem — nothing speculative. No single-use
   abstractions, no error handling for impossible cases. Ask: would a senior engineer call this
   overcomplicated?

3. **Surgical changes.** Touch only what the task needs. Match the surrounding style; don't "improve"
   adjacent code. Only remove imports/vars your change orphaned — don't delete pre-existing code unless asked.

4. **Define verifiable success before coding.** Turn the task into a measurable check, not an imperative.
   For anything touching the **engine, closures, payments, or auth**, the bar is: `npx tsc --noEmit` +
   `npm run build` + `npm run test:fseq` all green, AND a **negative test** proving a new guard actually
   rejects bad input (a passing golden alone doesn't prove a safety check works — see the P0-1 falcon/blip proof).

**Load-bearing facts that override "helpfulness":**
- **Closures move a real car.** Any change near `choreographClosures` / `validateClosureSafety` must preserve
  every invariant (falcon ≥3.5s stagger, no simultaneous edges, hold-for-travel, per-family limits, Model X
  window/door exclusion) and be sim/harness-verified. Reject unsafe input; never silently fall back.
- **Never trust the client** for entitlement, moderation, or safety — the server re-validates.
- **The continuous "breathing" light feel is a DELIBERATE owner choice**, ear-tested; sparse/crisp was tried
  and rejected. Do NOT "fix" the engine toward sparse. It's a closed non-goal, not a defect.
- Migrations are applied **manually** in the Supabase SQL Editor (no CLI); repo migration files are the
  version-controlled record — flag when the owner needs to run one.
