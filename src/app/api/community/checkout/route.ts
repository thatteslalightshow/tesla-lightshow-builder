import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getAuthedUser } from '@/lib/auth'
import { getAdminClient, type TeslaModel } from '@/lib/supabase'
import { MODELS } from '@/lib/tesla-channels'

// Fallback keeps module load from throwing during `next build` when the key isn't in the build env
// (real calls are gated by the STRIPE_SECRET_KEY guards below, so the placeholder is never used).
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_unset_build_placeholder', { apiVersion: '2026-05-27.dahlia' })
const PRICE_CENTS = 299 // $2.99

// Stripe checkout to buy a community show. On success the webhook clones it into
// the buyer's library (tailored to tesla_model) — see stripe/webhook.
export async function POST(req: Request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  const user = await getAuthedUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { show_id?: string; tesla_model?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const sourceId = body.show_id
  const model = body.tesla_model as TeslaModel
  if (!sourceId) return NextResponse.json({ error: 'Missing show_id' }, { status: 400 })
  if (!model || !MODELS[model]) return NextResponse.json({ error: 'Pick a Tesla model' }, { status: 400 })

  // Source must exist + be public.
  const admin = getAdminClient()
  const { data: src } = await admin
    .from('shows').select('id, name').eq('id', sourceId).eq('is_public', true).maybeSingle()
  if (!src) return NextResponse.json({ error: 'Community show not found' }, { status: 404 })

  const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Tesla Light Show — ${src.name}`,
            description: 'Community show added to your library, tailored to your Tesla.',
          },
          unit_amount: PRICE_CENTS,
        },
        quantity: 1,
      }],
      metadata: { kind: 'community', source_show_id: sourceId, user_id: user.id, tesla_model: model },
      customer_email: user.email ?? undefined,
      success_url: `${origin}/dashboard?community_added=1`,
      cancel_url: `${origin}/gallery`,
      allow_promotion_codes: true,
    })
    return NextResponse.json({ url: session.url })
  } catch (e) {
    console.error('community checkout failed:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not start checkout' }, { status: 500 })
  }
}
