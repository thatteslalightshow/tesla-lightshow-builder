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
let _stripe: Stripe | null = null
export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' })
  }
  return _stripe
}
