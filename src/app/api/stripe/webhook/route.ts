import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getAdminClient, type TeslaModel } from '@/lib/supabase'
import { cloneCommunityShow } from '@/lib/community'
import { sendExportReceipt, sendGiftCode } from '@/lib/email'

// Fallback keeps module load from throwing during `next build` when the key isn't in the build env
// (real calls are gated by the STRIPE_SECRET_KEY guards below, so the placeholder is never used).
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_unset_build_placeholder', { apiVersion: '2026-05-27.dahlia' })

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
      const meta = session.metadata ?? {}

      // Community show purchase → clone it into the buyer's library, tailored to
      // their model (their own private copy; the listing isn't re-published).
      if (meta.kind === 'community' && meta.source_show_id && meta.user_id && session.payment_status === 'paid') {
        await cloneCommunityShow(meta.source_show_id, meta.user_id, (meta.tesla_model as TeslaModel) || 'model3')
      } else if (meta.kind === 'gift' && session.payment_status === 'paid') {
        // Gift purchase → mint a redeem code (idempotent on the session id) and email it.
        await createGiftCode(admin, session)
      } else {
        // Per-export purchase → unlock the buyer's own show for export.
        const { show_id, user_id } = meta
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
            const origin = process.env.NEXT_PUBLIC_APP_URL ?? 'https://thatteslalightshow.com'
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
  const item = sub.items?.data?.[0]
  const priceId = item?.price?.id ?? null
  const lookupKey = item?.price?.lookup_key ?? null
  // Store the tier from the lookup key; handles both old and _v2 keys.
  const plan = lookupKey?.startsWith('creator_yearly') ? 'creator_yearly' : 'creator_monthly'

  // current_period_end lives on the subscription (older API versions) OR on the
  // line item (newer versions). Read whichever exists; never throw on a bad value.
  const periodEndUnix =
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    (item as unknown as { current_period_end?: number } | undefined)?.current_period_end ??
    null
  const currentPeriodEnd = periodEndUnix
    ? new Date(periodEndUnix * 1000).toISOString()
    : null

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

// Readable code, no ambiguous characters (0/O, 1/I/L).
const GIFT_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
function genGiftCode(): string {
  let s = ''
  for (let i = 0; i < 8; i++) s += GIFT_ALPHABET[Math.floor(Math.random() * GIFT_ALPHABET.length)]
  return s
}

async function createGiftCode(admin: ReturnType<typeof getAdminClient>, session: Stripe.Checkout.Session) {
  // Idempotent: Stripe retries webhooks and stripe_session_id is UNIQUE — if a code already exists for
  // this session, reuse it and DON'T re-email.
  const { data: existing } = await admin.from('gift_codes').select('code').eq('stripe_session_id', session.id).limit(1)
  const meta = session.metadata ?? {}
  const recipient = (meta.recipient_email || '').trim() || null
  const purchaser = session.customer_details?.email ?? session.customer_email ?? null

  let code = existing?.[0]?.code as string | undefined
  let justCreated = false
  if (!code) {
    for (let attempt = 0; attempt < 6 && !code; attempt++) {
      const candidate = genGiftCode()
      const { error } = await admin.from('gift_codes').insert({
        code: candidate, credits: 1, purchaser_email: purchaser, recipient_email: recipient, stripe_session_id: session.id,
      })
      if (!error) { code = candidate; justCreated = true; break }
      // a concurrent webhook already inserted the row for this session → reuse it (no double code)
      const { data: again } = await admin.from('gift_codes').select('code').eq('stripe_session_id', session.id).limit(1)
      if (again?.[0]?.code) { code = again[0].code as string; break }
      // otherwise it was a code collision → loop with a fresh candidate
    }
  }
  if (!code || !justCreated) return   // only email when we just minted it (idempotent)

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? 'https://thatteslalightshow.com'
  const to = recipient || purchaser
  if (to) {
    await sendGiftCode({
      to, code, redeemUrl: `${origin}/redeem?code=${code}`,
      forRecipient: !!recipient, fromEmail: purchaser ?? undefined,
    }).catch(() => null)
  }
}
