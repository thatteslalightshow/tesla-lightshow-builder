import { createServerSupabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' })

const EXPORT_PRICE_CENTS = 299 // $2.99

export async function POST(req: Request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { show_id: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.show_id) return NextResponse.json({ error: 'Missing show_id' }, { status: 400 })

  const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: 'Tesla Light Show Export',
          description: 'Download your custom FSEQ + WAV light show package for your Tesla.',
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
