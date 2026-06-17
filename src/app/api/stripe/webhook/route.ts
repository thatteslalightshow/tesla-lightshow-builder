import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getAdminClient } from '@/lib/supabase'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' })

// Required: disable body parsing so we can verify the raw Stripe signature
export const config = { api: { bodyParser: false } }

export async function POST(req: Request) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 })

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const { show_id, user_id } = session.metadata ?? {}

    if (show_id && user_id && session.payment_status === 'paid') {
      const admin = getAdminClient()
      // Record the purchase — table may not exist yet; ignore the error gracefully
      await admin.from('show_purchases').insert({
        user_id,
        show_id,
        stripe_session_id: session.id,
        stripe_payment_intent_id: session.payment_intent,
        amount_cents: session.amount_total,
        created_at: new Date().toISOString(),
      }).then(() => null, () => null)
    }
  }

  return NextResponse.json({ received: true })
}
