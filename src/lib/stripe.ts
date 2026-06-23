import Stripe from 'stripe'

// Lazy Stripe singleton.
//
// Constructing Stripe at a route module's top level broke the build: `new
// Stripe(key)` eagerly builds an Authorization header from STRIPE_SECRET_KEY,
// and Next executes route modules during the "collect page data" build phase.
// So a missing OR malformed key (e.g. a masked value pasted from a dashboard,
// which contains non-ASCII '•' chars) threw at BUILD time, not just runtime.
//
// Deferring construction to first call keeps Stripe out of the build entirely.
// Every route already guards on a missing key and returns 503.
// Strip anything outside printable ASCII. A valid sk_ key is pure ASCII, so
// this is a no-op for good keys — but if a MASKED value (full of '•' U+2022)
// gets pasted into the env, those non-ASCII chars would make `new Stripe()`
// throw "Cannot convert argument to a ByteString" while building the auth
// header, which breaks the BUILD. Sanitizing guarantees that can never happen;
// a genuinely wrong key still fails at runtime (surfaced to the UI), not at build.
function cleanKey(raw: string | undefined): string {
  return (raw ?? '').replace(/[^\x20-\x7E]/g, '').trim()
}

let _stripe: Stripe | null = null
export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(cleanKey(process.env.STRIPE_SECRET_KEY), { apiVersion: '2026-05-27.dahlia' })
  }
  return _stripe
}
