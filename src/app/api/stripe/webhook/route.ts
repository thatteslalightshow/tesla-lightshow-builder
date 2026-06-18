import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getAdminClient } from '@/lib/supabase'
import { sendExportReceipt } from '@/lib/email'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' })

const MODEL_LABELS: Record<string, string> = {
  model3: 'Model 3', modelY: 'Model Y', modelS: 'Model S',
  modelX: 'Model X', cybertruck: 'Cybertruck',
}

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

  const admin = getAdminClient()

  // ── One-time export payment ───────────────────────────────────────────────
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session

    if (session.mode === 'payment') {
      const { show_id, user_id } = session.metadata ?? {}
      if (show_id && user_id && session.payment_status === 'paid') {
        await admin.from('show_purchases').insert({
          user_id, show_id,
          stripe_session_id: session.id,
          stripe_payment_intent_id: session.payment_intent,
          amount_cents: session.amount_total,
          created_at: new Date().toISOString(),
        }).then(() => null, () => null)

        const email = session.customer_email
        if (email) {
          const origin = process.env.NEXT_PUBLIC_APP_URL ?? 'https://lightshowbuilder.com'
          const { data: show } = await admin.from('shows').select('name, tesla_model').eq('id', show_id).single()
          await sendExportReceipt({
            to: email,
            showName: show?.name ?? 'your show',
            model: MODEL_LABELS[show?.tesla_model ?? ''] ?? 'Tesla',
            builderUrl: `${origin}/builder?id=${show_id}&checkout_session=${session.id}`,
          }).catch(() => null)
        }
      }
    }

    // ── Subscription checkout completed ─────────────────────────────────────
    if (session.mode === 'subscription') {
      const user_id = session.metadata?.user_id
      const stripeSubId = session.subscription as string
      if (user_id && stripeSubId) {
        const sub = await stripe.subscriptions.retrieve(stripeSubId)
        await upsertSubscription(admin, user_id, sub)
      }
    }
  }

  // ── Subscription updated (plan change, renewal, payment failure) ──────────
  if (event.type === 'customer.subscription.updated') {
    const sub = event.data.object as Stripe.Subscription
    const user_id = sub.metadata?.user_id
    if (user_id) await upsertSubscription(admin, user_id, sub)
  }

  // ── Subscription cancelled ────────────────────────────────────────────────
  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription
    await admin.from('subscriptions')
      .update({ status: 'canceled', updated_at: new Date().toISOString() })
      .eq('stripe_subscription_id', sub.id)
  }

  return NextResponse.json({ received: true })
}

async function upsertSubscription(
  admin: ReturnType<typeof getAdminClient>,
  user_id: string,
  sub: Stripe.Subscription,
) {
  const priceId = sub.items.data[0]?.price?.id ?? null
  const lookupKey = sub.items.data[0]?.price?.lookup_key ?? null
  const plan = lookupKey === 'creator_yearly' ? 'creator_yearly' : 'creator_monthly'
  const currentPeriodEnd = new Date((sub as unknown as { current_period_end: number }).current_period_end * 1000).toISOString()

  await admin.from('subscriptions').upsert({
    user_id,
    stripe_customer_id: sub.customer as string,
    stripe_subscription_id: sub.id,
    stripe_price_id: priceId,
    plan,
    status: sub.status,
    current_period_end: currentPeriodEnd,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'stripe_subscription_id' })
}
