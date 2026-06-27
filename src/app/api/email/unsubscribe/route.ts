import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase'
import { unsubToken } from '@/lib/reengage'

// One-click unsubscribe from re-engagement reminders (CAN-SPAM). Link from the email
// is /api/email/unsubscribe?u=<userId>&t=<hmac>. Verifies the HMAC, flips
// profiles.marketing_opt_out, and returns a small confirmation page.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const u = url.searchParams.get('u') ?? ''
  const t = url.searchParams.get('t') ?? ''
  const ok = !!u && !!t && t === unsubToken(u)

  if (ok) {
    const admin = getAdminClient()
    await admin.from('profiles').update({ marketing_opt_out: true }).eq('id', u).then(() => null, () => null)
  }

  const title = ok ? 'You’re unsubscribed' : 'Link expired'
  const body = ok
    ? 'You won’t get any more build reminders. You’ll still get important emails about exports you make.'
    : 'We couldn’t verify this unsubscribe link. Reply to the email and we’ll sort it out.'
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>`
    + `<body style="margin:0;background:#08080f;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:24px">`
    + `<div><div style="width:40px;height:40px;background:#e8404a;border-radius:10px;margin:0 auto 20px"></div>`
    + `<h1 style="font-size:22px;margin:0 0 8px">${title}</h1>`
    + `<p style="color:rgba(255,255,255,0.5);font-size:14px;max-width:380px;margin:0 auto 20px;line-height:1.6">${body}</p>`
    + `<a href="https://thatteslalightshow.com" style="color:rgba(255,255,255,0.6);font-size:13px">← thatteslalightshow.com</a></div></body></html>`

  return new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
}
