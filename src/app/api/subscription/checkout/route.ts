import { NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { getAuthedUser } from '@/lib/auth'

// Lookup keys keep these idempotent — Stripe creates the price once, reuses it forever
const PLANS = {
  monthly: { lookup_key: 'creator_monthly', unit_amount: 499,   interval: 'month' as const, label: 'Creator Monthly' },
  yearly:  { lookup_key: 'creator_yearly',  unit_amount: 3999,  interval: 'year'  as const, label: 'Creator Annual'  },
}

async function getOrCreatePrice(plan: typeof PLANS[keyof typeof PLANS]): Promise<string> {
  const stripe = getStripe()
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
  const stripe = getStripe()

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
    // Surface the real Stripe error so the UI can show why checkout failed
    // (e.g. invalid key, live/test mismatch) instead of silently doing nothing.
    console.error('subscription checkout failed:', e)
    const message = e instanceof Error ? e.message : 'Could not start checkout'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
