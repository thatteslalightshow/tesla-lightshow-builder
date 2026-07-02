import { NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase-server'
import Stripe from 'stripe'

// Fallback keeps module load from throwing during `next build` when the key isn't in the build env
// (real calls are gated by the STRIPE_SECRET_KEY guards below, so the placeholder is never used).
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_unset_build_placeholder', { apiVersion: '2026-05-27.dahlia' })

export async function GET(req: Request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get('session_id')
  if (!sessionId) return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })

  const supabase = await createRouteClient()
  const { data: { user } } = await supabase.auth.getUser()   // getUser revalidates the JWT (rejects revoked cookies)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let checkoutSession: Stripe.Checkout.Session
  try {
    checkoutSession = await stripe.checkout.sessions.retrieve(sessionId)
  } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 400 })
  }

  if (checkoutSession.payment_status !== 'paid') {
    return NextResponse.json({ error: 'Payment not completed', status: checkoutSession.payment_status }, { status: 402 })
  }

  if (checkoutSession.metadata?.user_id !== user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  return NextResponse.json({
    ok: true,
    show_id: checkoutSession.metadata?.show_id,
    amount_total: checkoutSession.amount_total,
  })
}
