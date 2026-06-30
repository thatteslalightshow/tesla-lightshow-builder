import { NextResponse } from 'next/server'
import Stripe from 'stripe'

// Fallback keeps module load from throwing during `next build` when the key isn't in the build env
// (real calls are gated by the STRIPE_SECRET_KEY guard below, so the placeholder is never used).
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_unset_build_placeholder', { apiVersion: '2026-05-27.dahlia' })

const GIFT_PRICE_CENTS = 399 // $3.99 — one gifted light-show export

// Buy a light show as a GIFT. No account needed to give one — Stripe collects the buyer's email; the
// webhook generates a redeem code and emails it. The recipient redeems it for one export credit.
export async function POST(req: Request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }
  let body: { recipient_email?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const recipient = (body.recipient_email ?? '').trim().slice(0, 200)

  const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: 'Gift — Tesla Light Show',
          description: 'A gifted light-show export. The recipient redeems a code for one export — choreography by us, soundtrack by them.',
        },
        unit_amount: GIFT_PRICE_CENTS,
      },
      quantity: 1,
    }],
    metadata: { kind: 'gift', recipient_email: recipient },
    success_url: `${origin}/gift?success=1`,
    cancel_url: `${origin}/gift?cancelled=1`,
    allow_promotion_codes: true,
  })

  return NextResponse.json({ url: session.url })
}
