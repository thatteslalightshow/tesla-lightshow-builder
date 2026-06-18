import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' })

// Lookup keys keep these idempotent — Stripe creates the price once, reuses it forever
const PLANS = {
  monthly: { lookup_key: 'creator_monthly', unit_amount: 499,   interval: 'month' as const, label: 'Creator Monthly' },
  yearly:  { lookup_key: 'creator_yearly',  unit_amount: 3999,  interval: 'year'  as const, label: 'Creator Annual'  },
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

  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { plan?: 'monthly' | 'yearly' }
  try { body = await req.json() }
  catch { body = {} }

  const plan = PLANS[body.plan ?? 'monthly']
  const priceId = await getOrCreatePrice(plan)

  const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { user_id: session.user.id },
    customer_email: session.user.email ?? undefined,
    success_url: `${origin}/dashboard?subscription_success=1`,
    cancel_url: `${origin}/dashboard?subscription_cancelled=1`,
    allow_promotion_codes: true,
    subscription_data: {
      metadata: { user_id: session.user.id },
    },
  })

  return NextResponse.json({ url: checkoutSession.url })
}
