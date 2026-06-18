import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getAdminClient } from '@/lib/supabase'
import { sendExportReceipt } from '@/lib/email'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' })

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

      // Record the purchase
      await admin.from('show_purchases').insert({
        user_id,
        show_id,
        stripe_session_id: session.id,
        stripe_payment_intent_id: session.payment_intent,
        amount_cents: session.amount_total,
        created_at: new Date().toISOString(),
      }).then(() => null, () => null)

      // Send receipt email
      const email = session.customer_email
      if (email) {
        const origin = process.env.NEXT_PUBLIC_APP_URL ?? 'https://lightshowbuilder.com'
        const { data: show } = await admin
          .from('shows')
          .select('name, tesla_model')
          .eq('id', show_id)
          .single()

        const MODEL_LABELS: Record<string, string> = {
          model3: 'Model 3', modelY: 'Model Y', modelS: 'Model S',
          modelX: 'Model X', cybertruck: 'Cybertruck',
        }

        await sendExportReceipt({
          to: email,
          showName: show?.name ?? 'your show',
          model: MODEL_LABELS[show?.tesla_model ?? ''] ?? 'Tesla',
          builderUrl: `${origin}/builder?id=${show_id}&checkout_session=${session.id}`,
        }).catch(() => null) // never block webhook response
      }
    }
  }

  return NextResponse.json({ received: true })
}
