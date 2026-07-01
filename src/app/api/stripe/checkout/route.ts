import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getAdminClient } from '@/lib/supabase'
import { rateLimitOk } from '@/lib/rate-limit'

// Fallback keeps module load from throwing during `next build` when the key isn't in the build env
// (real calls are gated by the STRIPE_SECRET_KEY guards below, so the placeholder is never used).
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_unset_build_placeholder', { apiVersion: '2026-05-27.dahlia' })

const EXPORT_PRICE_CENTS = 399 // $3.99

export async function POST(req: Request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()   // getUser revalidates the JWT (rejects revoked cookies)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { show_id: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.show_id) return NextResponse.json({ error: 'Missing show_id' }, { status: 400 })

  // Only sell an export unlock for a show the buyer actually owns — a stray/foreign show_id
  // would take their $3.99 and unlock nothing (the export route re-checks ownership).
  const admin = getAdminClient()
  const { data: show, error: showErr } = await admin
    .from('shows').select('id').eq('id', body.show_id).eq('user_id', user.id).single()
  if (showErr || !show) return NextResponse.json({ error: 'Show not found' }, { status: 404 })

  if (!(await rateLimitOk(admin, user.id, 'checkout', 20))) {
    return NextResponse.json({ error: 'Too many checkout attempts — please try again later.' }, { status: 429, headers: { 'Retry-After': '3600' } })
  }

  const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: 'Tesla Light Show Export',
          description: 'Download your custom FSEQ light sequence for your Tesla, with step-by-step setup. Choreography by us, soundtrack by you.',
        },
        unit_amount: EXPORT_PRICE_CENTS,
      },
      quantity: 1,
    }],
    metadata: {
      show_id: body.show_id,
      user_id: user.id,
    },
    customer_email: user.email,
    success_url: `${origin}/builder?id=${body.show_id}&checkout_session={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/builder?id=${body.show_id}&checkout_cancelled=1`,
    allow_promotion_codes: true,
  })

  return NextResponse.json({ url: checkoutSession.url })
}
