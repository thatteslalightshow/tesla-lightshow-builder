import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getAuthedUser } from '@/lib/auth'

// Fallback keeps module load from throwing during `next build` when the key isn't in the build env
// (real calls are gated by the STRIPE_SECRET_KEY guards below, so the placeholder is never used).
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_unset_build_placeholder', { apiVersion: '2026-05-27.dahlia' })

// Lookup keys keep these idempotent — Stripe creates the price once, reuses it forever
const PLANS = {
  // Versioned lookup keys force Stripe to mint a NEW price object whenever the amount
  // changes (changing unit_amount alone reuses the old price). Bump the suffix on every
  // price change; existing subscribers stay grandfathered on their old price.
  //   monthly: v2 = $6.99 · yearly: v3 = $59.99 (was v2 $49.99, raised 2026-06-27)
  monthly: { lookup_key: 'creator_monthly_v2', unit_amount: 699,  interval: 'month' as const, label: 'Creator Monthly' },
  yearly:  { lookup_key: 'creator_yearly_v3',  unit_amount: 5999, interval: 'year'  as const, label: 'Creator Annual'  },
}

async function getOrCreatePrice(plan: typeof PLANS[keyof typeof PLANS]): Promise<string> {
  const existing = await stripe.prices.list({ lookup_keys: [plan.lookup_key], active: true })
  if (existing.data.length > 0) return existing.data[0].id

  const price = await stripe.prices.create({
    currency: 'usd',
    unit_amount: plan.unit_amount,
    recurring: { interval: plan.interval },
    product_data: { name: plan.label },
    lookup_key: plan.lookup_key,
  })
  return price.id
}

export async function POST(req: Request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  const user = await getAuthedUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { plan?: 'monthly' | 'yearly' }
  try { body = await req.json() }
  catch { body = {} }

  const plan = PLANS[body.plan ?? 'monthly']
  const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  try {
    const priceId = await getOrCreatePrice(plan)

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { user_id: user.id },
      customer_email: user.email ?? undefined,
      success_url: `${origin}/dashboard?subscription_success=1`,
      cancel_url: `${origin}/dashboard?subscription_cancelled=1`,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { user_id: user.id },
      },
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (e) {
    // Surface the real Stripe error (e.g. account not activated for live mode,
    // restricted key) so the UI can show why checkout failed instead of the
    // button silently doing nothing.
    console.error('subscription checkout failed:', e)
    const message = e instanceof Error ? e.message : 'Could not start checkout'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
