# Smoke tests (owner-run)

Manual pre-launch checks for the flows that are hard to unit-test — money, auth, and browser media
under the production CSP. Code scaffolds the steps; **you run them** and tick the pass criteria.
Run these against a **preview/staging deploy** (or production with Stripe in **test mode**) before any push.

Reference commit: keep this file updated when the flows change.

---

## 1. Gifting — end-to-end (money path) 🔴 highest priority

**What it proves:** buy a gift → recipient gets a code by email → they redeem it → the banked credit is
spent on one export with **no charge**, and can't be double-spent.

**Setup**
- Stripe in **test mode** (use test card `4242 4242 4242 4242`, any future expiry/CVC/ZIP).
- Two email addresses you can read (purchaser + recipient), or use the same for both.
- Two accounts (or use one for redeem): the redeemer must be able to sign in.

**Steps & pass criteria**
1. Go to **`/gift`**, enter a recipient email, check out (`POST /api/gift/checkout`).
   - ✅ Stripe Checkout opens with the gift line item and the correct price. Promo codes are allowed.
2. Pay with the test card.
   - ✅ Stripe dashboard (test) shows a **paid** `checkout.session` with metadata `kind=gift`, `recipient_email=…`.
   - ✅ The **`gift_codes`** table has a new row: unique `code`, `credits=1`, `purchaser_email`, `recipient_email`, `stripe_session_id`.
   - ✅ The recipient (or purchaser if no recipient) receives the **gift-code email** (`sendGiftCode`).
   - ✅ Re-sending the same webhook does **not** create a second code (idempotent on `stripe_session_id`).
3. Sign in as the redeemer, go to **`/redeem`**, enter the code (`POST /api/gift/redeem`).
   - ✅ Success; **`profiles.gift_credits`** for that user increments by 1.
   - ✅ Entering the **same code again** → "already been redeemed" (409). No extra credit.
   - ✅ A bogus code → "isn't valid" (404).
4. As the redeemer, build a show and **export** (`/api/export`) with no subscription/free-export/purchase.
   - ✅ Export succeeds and **`gift_credits` decrements by 1** (atomic — a second concurrent export can't spend the same credit).
   - ✅ **No Stripe charge** for this export.
5. Spend-down: with 0 credits and no other entitlement, exporting should require payment.
   - ✅ Not entitled → prompted to pay (not a silent free export).

---

## 2. Anonymous → signup (no wall, work preserved)

**What it proves:** a first-time visitor can build a show **without an account**, and creating one
**preserves their in-progress work** (the signup wall was intentionally dropped).

**Steps & pass criteria**
1. Open the site in a **fresh/incognito** window (no session). Go to **`/builder`**.
   - ✅ You can upload a song, build, and **preview in 3D without being forced to sign in**.
2. With a show in progress, start **sign up** (`/auth?mode=signup`) and complete it.
   - ✅ After signup you land back with the **same show/edits restored** (draft is not lost).
3. Confirm the account is real and usable.
   - ✅ The new user appears in Supabase auth; `profiles` row exists; dashboard loads their show.
4. Sign out and back in.
   - ✅ Saved show persists; no "please sign in" dead-ends on builder/preview.

_Note: verify the exact restore behavior in the current build — if a draft is stored client-side, it should
survive the signup redirect._

---

## 3. Audio playback under the production CSP

**What it proves:** the hardened production **Content-Security-Policy** (`src/middleware/security.ts`)
still allows the builder's audio preview (decoded to a `blob:`) and any Supabase-hosted audio to play.
Relevant directives: `media-src 'self' blob: https://*.supabase.co`, `connect-src 'self' https://*.supabase.co wss: blob:`.

**Steps & pass criteria** (run on the **production/preview** deploy, not `localhost` — the CSP differs by env)
1. Open **`/builder`**, open the browser **console**, upload a song, and press play/preview.
   - ✅ Audio plays in sync with the 3D preview.
   - ✅ **No CSP violations** in the console (watch for `Refused to load … because it violates … media-src/connect-src`).
2. Load a saved show whose audio is restored from storage and preview it.
   - ✅ Plays; no CSP/blob errors.
3. Export flow audio (if the export/preview streams anything) works with no console CSP errors.
   - ✅ Clean console through upload → preview → export.

---

## Quick reference — what backs each test

| Flow | Routes / tables |
|---|---|
| Gifting | `POST /api/gift/checkout` · `POST /api/stripe/webhook` (inserts `gift_codes`, `sendGiftCode`) · `POST /api/gift/redeem` (→ `profiles.gift_credits`) · `POST /api/export` (spends a credit) |
| Anon → signup | `/builder` (no-auth build) · `/auth?mode=signup` · Supabase auth + `profiles` |
| CSP audio | `src/middleware/security.ts` (CSP) · builder preview (`blob:` media) · Supabase-hosted audio |

**Regression coverage note:** the export/engine output itself is guarded automatically by
`npm run test:fseq` (conformance + closure-safety + golden-file regression across all 5 models) —
run that before shipping engine changes; these three remain manual because they cross Stripe/email/browser.
