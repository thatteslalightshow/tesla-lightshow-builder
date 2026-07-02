import { Resend } from 'resend';

// Module-scope construction must NEVER throw — it runs during `next build` page-data collection,
// so a malformed key (e.g. a masked "re_ab••••" pasted into an env var) would fail every deploy.
// (Resend puts the key straight into an Authorization header, which rejects non-Latin1 bytes.)
function makeResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  try { return new Resend(key); } catch (e) { console.warn('[email] RESEND_API_KEY unusable:', e); return null; }
}
const resend = makeResend();

const FROM = 'ThatTeslaLightshow <noreply@thatteslalightshow.com>';
const REPLY_TO = 'support@thatteslalightshow.com';   // a customer replying to any of our emails reaches support@ (not the noreply void)
// Lifecycle / marketing / re-engagement sends go from notifications@ to keep them OFF the
// transactional stream (noreply@ = receipts + export delivery). Same verified domain → no extra
// Resend setup. Protects transactional deliverability if marketing ever gets flagged.
const MARKETING_FROM = 'ThatTeslaLightshow <notifications@thatteslalightshow.com>';

// Gift code delivery (transactional — from noreply@, replies to support@).
export async function sendGiftCode({
  to, code, redeemUrl, forRecipient, fromEmail,
}: {
  to: string;
  code: string;
  redeemUrl: string;
  forRecipient: boolean;
  fromEmail?: string;
}) {
  if (!resend) return;
  const intro = forRecipient
    ? `${fromEmail ? `${fromEmail} sent` : 'Someone sent'} you a Tesla light show ⚡ Turn your favorite song into a beat-synced show your Tesla performs — this one's on them.`
    : `Thanks for gifting a Tesla light show ⚡ Here's the code to pass along — whoever you send it to can turn their favorite song into a show their Tesla performs.`;
  await resend.emails.send({
    from: FROM,
    replyTo: REPLY_TO,
    to,
    subject: forRecipient ? 'You’ve been gifted a Tesla light show ⚡' : 'Your gift code is ready ⚡',
    html: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#08080f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#ffffff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:40px 24px;">
    <tr><td>
      <div style="display:inline-flex;align-items:center;gap:10px;margin-bottom:32px;">
        <div style="width:36px;height:36px;background:#e8404a;border-radius:9px;display:inline-block;"></div>
        <span style="font-size:16px;font-weight:700;color:rgba(255,255,255,0.8);">ThatTeslaLightshow</span>
      </div>
      <h1 style="font-size:24px;font-weight:700;margin:0 0 16px;color:#fff;">${forRecipient ? 'A light show, just for you 🎁' : 'Your gift is ready 🎁'}</h1>
      <p style="font-size:15px;color:rgba(255,255,255,0.55);margin:0 0 24px;line-height:1.7;">${intro}</p>
      <div style="background:#12121c;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:24px;text-align:center;margin:0 0 24px;">
        <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,0.35);margin-bottom:10px;">Gift code</div>
        <div style="font-size:30px;font-weight:700;letter-spacing:4px;color:#fff;font-family:monospace;">${code}</div>
      </div>
      <a href="${redeemUrl}" style="display:inline-block;background:#e8404a;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:8px;">Redeem your gift →</a>
      <p style="font-size:13px;color:rgba(255,255,255,0.35);margin:24px 0 0;line-height:1.7;">Or visit thatteslalightshow.com/redeem and enter the code. You'll need a free account to redeem — it adds one export to it. Choreography by us, soundtrack by you.</p>
    </td></tr>
  </table>
</body></html>`,
  });
}

export async function sendExportReceipt({
  to,
  showName,
  model,
  builderUrl,
}: {
  to: string;
  showName: string;
  model: string;
  builderUrl: string;
}) {
  if (!resend) return; // silently skip if not configured

  await resend.emails.send({
    from: FROM,
    replyTo: REPLY_TO,
    to,
    subject: `Your light show "${showName}" is ready to download`,
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#08080f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#ffffff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:40px 24px;">
    <tr>
      <td>
        <!-- Header -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
          <tr>
            <td>
              <div style="display:inline-flex;align-items:center;gap:10px;">
                <div style="width:36px;height:36px;background:#e8404a;border-radius:9px;display:inline-block;"></div>
                <span style="font-size:16px;font-weight:700;color:rgba(255,255,255,0.8);">ThatTeslaLightshow</span>
              </div>
            </td>
          </tr>
        </table>

        <!-- Body card -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#111118;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:40px 36px;margin-bottom:24px;">
          <tr>
            <td>
              <p style="font-size:28px;font-weight:800;letter-spacing:-1px;margin:0 0 8px;">Your show is ready ⚡</p>
              <p style="font-size:15px;color:rgba(255,255,255,0.5);margin:0 0 32px;line-height:1.6;">
                Payment confirmed — your <strong style="color:rgba(255,255,255,0.8);">${escHtml(showName)}</strong>
                light show for the ${escHtml(model)} is available to download.
              </p>

              <a href="${builderUrl}" style="display:inline-block;padding:14px 32px;background:#e8404a;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:700;letter-spacing:-0.2px;">
                Download your show →
              </a>

              <hr style="border:none;border-top:1px solid rgba(255,255,255,0.07);margin:32px 0;" />

              <p style="font-size:13px;color:rgba(255,255,255,0.35);margin:0 0 8px;line-height:1.7;">
                <strong style="color:rgba(255,255,255,0.5);">How to use it:</strong><br />
                1. Unzip the download — you'll get a <code style="color:#e8404a;">LightShow</code> folder.<br />
                2. Add your own copy of the song, renamed to <code style="color:#e8404a;">lightshow.wav</code> (44.1&nbsp;kHz), next to <code style="color:#e8404a;">lightshow.fseq</code>.<br />
                3. Copy the <code style="color:#e8404a;">LightShow</code> folder to a USB drive (exFAT or FAT32).<br />
                4. Plug into your Tesla → <strong style="color:rgba(255,255,255,0.6);">Toybox → Light Show</strong>.
              </p>
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="text-align:center;">
              <p style="font-size:12px;color:rgba(255,255,255,0.2);margin:0 0 4px;">
                Made by <a href="https://tiktok.com/@ThatTeslaLightshow" style="color:rgba(255,255,255,0.3);">@ThatTeslaLightshow</a>
              </p>
              <p style="font-size:11px;color:rgba(255,255,255,0.12);margin:0;">Not affiliated with Tesla, Inc.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  });
}

export async function sendExportDownload({
  to,
  showName,
  model,
  downloadUrl,
  songTitle,
  expiresMinutes = 60,
}: {
  to: string;
  showName: string;
  model: string;
  downloadUrl: string;
  songTitle?: string;
  expiresMinutes?: number;
}) {
  if (!resend) return;
  const song = songTitle ? escHtml(songTitle) : 'your song';
  const expiresLabel = expiresMinutes >= 1440
    ? `${Math.round(expiresMinutes / 1440)} day${expiresMinutes >= 2880 ? 's' : ''}`
    : expiresMinutes >= 60
      ? `${Math.round(expiresMinutes / 60)} hour${expiresMinutes >= 120 ? 's' : ''}`
      : `${expiresMinutes} minutes`;

  await resend.emails.send({
    from: FROM,
    replyTo: REPLY_TO,
    to,
    subject: `Your light show "${showName}" is ready to download`,
    html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#08080f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#ffffff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:40px 24px;">
    <tr><td>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
        <tr><td>
          <div style="display:inline-flex;align-items:center;gap:10px;">
            <div style="width:36px;height:36px;background:#e8404a;border-radius:9px;display:inline-block;"></div>
            <span style="font-size:16px;font-weight:700;color:rgba(255,255,255,0.8);">ThatTeslaLightshow</span>
          </div>
        </td></tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#111118;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:40px 36px;margin-bottom:24px;">
        <tr><td>
          <p style="font-size:28px;font-weight:800;letter-spacing:-1px;margin:0 0 8px;">Your show is ready ⚡</p>
          <p style="font-size:15px;color:rgba(255,255,255,0.5);margin:0 0 6px;line-height:1.6;">
            <strong style="color:rgba(255,255,255,0.8);">${escHtml(showName)}</strong> for the ${escHtml(model)}.
          </p>
          <p style="font-size:14px;color:rgba(255,255,255,0.4);font-style:italic;margin:0 0 28px;">Choreography by us. Soundtrack by you.</p>
          <a href="${downloadUrl}" style="display:inline-block;padding:14px 32px;background:#e8404a;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:700;letter-spacing:-0.2px;">
            Download your show →
          </a>
          <p style="font-size:12px;color:rgba(255,255,255,0.3);margin:14px 0 0;">This download link stays active for ${expiresLabel}.</p>
          <hr style="border:none;border-top:1px solid rgba(255,255,255,0.07);margin:32px 0;" />
          <p style="font-size:15px;font-weight:700;color:rgba(255,255,255,0.85);margin:0 0 14px;">One last step — add your music 🎵</p>
          <p style="font-size:13px;color:rgba(255,255,255,0.45);margin:0;line-height:1.95;">
            1. Find your copy of <strong style="color:rgba(255,255,255,0.7);">${song}</strong> — the same file you uploaded works perfectly.<br />
            2. Rename it to <code style="color:#e8404a;">lightshow.wav</code> (or <code style="color:#e8404a;">.mp3</code>) — make sure it's <strong style="color:rgba(255,255,255,0.7);">44.1&nbsp;kHz</strong> so it stays in sync (most MP3s already are).<br />
            3. Drop it in the <code style="color:#e8404a;">LightShow</code> folder, next to <code style="color:#e8404a;">lightshow.fseq</code>.<br />
            4. Copy the folder to a USB drive (exFAT/FAT32) → plug into your Tesla → Toybox → Light Show.
          </p>
          <hr style="border:none;border-top:1px solid rgba(255,255,255,0.07);margin:28px 0;" />
          <p style="font-size:12.5px;color:rgba(255,255,255,0.4);margin:0;line-height:1.7;">
            <strong style="color:rgba(255,255,255,0.55);">Why do you add the song yourself?</strong><br />
            The music belongs to the artists who made it — and we'd rather honor the copyright that protects their work than tiptoe around it. It keeps your show 100% legal, 100% yours, and everyone on the right side of the music. 🎶
          </p>
        </td></tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="text-align:center;">
          <p style="font-size:12px;color:rgba(255,255,255,0.2);margin:0 0 4px;">
            Made by <a href="https://tiktok.com/@ThatTeslaLightshow" style="color:rgba(255,255,255,0.3);">@ThatTeslaLightshow</a>
          </p>
          <p style="font-size:11px;color:rgba(255,255,255,0.12);margin:0;">Not affiliated with Tesla, Inc.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
}

// Optional physical mailing address for the email footer (CAN-SPAM). Set
// REENGAGE_FROM_ADDRESS in env once you have a business/PO-box address; until then
// the line is omitted.
const BUSINESS_ADDRESS = process.env.REENGAGE_FROM_ADDRESS ?? '';

// Abandoned-show re-engagement — a two-touch nudge to people who built a show but
// never exported it. `touch: 'first'` = ~48h (warm, low-pressure); `touch: 'final'`
// = ~5 days (gentle last call). Same brand voice as the export email, plus a required
// unsubscribe link. Audience is gated upstream (non-subscribers only).
export async function sendReengagement({
  to, showName, model, builderUrl, unsubscribeUrl, songTitle, touch,
}: {
  to: string;
  showName: string;
  model: string;
  builderUrl: string;
  unsubscribeUrl: string;
  songTitle?: string;
  touch: 'first' | 'final';
}) {
  if (!resend) return;
  const song = songTitle ? escHtml(songTitle) : 'your song';
  const name = escHtml(showName);
  const subject = touch === 'first'
    ? `Your light show “${showName}” is ready to finish`
    : `Last call for your “${showName}” light show`;
  const headline = touch === 'first' ? 'You’re one step away ⚡' : 'Still want this one? ⚡';
  const lead = touch === 'first'
    ? `Your <strong style="color:rgba(255,255,255,0.85);">${name}</strong> for the ${escHtml(model)} is built and choreographed to ${song} — it’s just waiting for you to export it.`
    : `Your <strong style="color:rgba(255,255,255,0.85);">${name}</strong> is still here, already choreographed to ${song}. This is the last reminder we’ll send — grab it before it slips your mind.`;
  const cta = touch === 'first' ? 'Finish &amp; export →' : 'Pick up where you left off →';

  await resend.emails.send({
    from: MARKETING_FROM,
    replyTo: REPLY_TO,
    to,
    subject,
    html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#08080f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#ffffff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:40px 24px;">
    <tr><td>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
        <tr><td>
          <div style="display:inline-flex;align-items:center;gap:10px;">
            <div style="width:36px;height:36px;background:#e8404a;border-radius:9px;display:inline-block;"></div>
            <span style="font-size:16px;font-weight:700;color:rgba(255,255,255,0.8);">ThatTeslaLightshow</span>
          </div>
        </td></tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#111118;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:40px 36px;margin-bottom:24px;">
        <tr><td>
          <p style="font-size:28px;font-weight:800;letter-spacing:-1px;margin:0 0 12px;">${headline}</p>
          <p style="font-size:15px;color:rgba(255,255,255,0.55);margin:0 0 10px;line-height:1.6;">${lead}</p>
          <p style="font-size:14px;color:rgba(255,255,255,0.4);font-style:italic;margin:0 0 28px;">Choreography by us. Soundtrack by you.</p>
          <a href="${builderUrl}" style="display:inline-block;padding:14px 32px;background:#e8404a;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:700;letter-spacing:-0.2px;">
            ${cta}
          </a>
          <hr style="border:none;border-top:1px solid rgba(255,255,255,0.07);margin:32px 0;" />
          <p style="font-size:13px;color:rgba(255,255,255,0.4);margin:0;line-height:1.7;">
            Export takes one click — you get a Tesla-ready <code style="color:#e8404a;">.fseq</code> plus
            simple steps to add your own copy of the song. It keeps everyone on the right side of the music. 🎶
          </p>
        </td></tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="text-align:center;">
          <p style="font-size:12px;color:rgba(255,255,255,0.2);margin:0 0 4px;">
            Made by <a href="https://tiktok.com/@ThatTeslaLightshow" style="color:rgba(255,255,255,0.3);">@ThatTeslaLightshow</a> · Not affiliated with Tesla, Inc.
          </p>
          ${BUSINESS_ADDRESS ? `<p style="font-size:11px;color:rgba(255,255,255,0.18);margin:0 0 4px;">${escHtml(BUSINESS_ADDRESS)}</p>` : ''}
          <p style="font-size:11px;color:rgba(255,255,255,0.2);margin:0;">
            <a href="${unsubscribeUrl}" style="color:rgba(255,255,255,0.3);text-decoration:underline;">Unsubscribe from these reminders</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
}

// Shared dark-card shell for the short lifecycle emails (welcome / first export).
// headline + body HTML + one CTA + an unsubscribe footer, in the brand voice.
function lifecycleShell(opts: { headline: string; bodyHtml: string; ctaHref?: string; ctaText?: string; unsubscribeUrl: string }) {
  const cta = opts.ctaHref && opts.ctaText
    ? `<a href="${opts.ctaHref}" style="display:inline-block;margin-top:8px;padding:14px 32px;background:#e8404a;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:700;letter-spacing:-0.2px;">${opts.ctaText}</a>`
    : '';
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#08080f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#ffffff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:40px 24px;">
    <tr><td>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;"><tr><td>
        <div style="display:inline-flex;align-items:center;gap:10px;">
          <div style="width:36px;height:36px;background:#e8404a;border-radius:9px;display:inline-block;"></div>
          <span style="font-size:16px;font-weight:700;color:rgba(255,255,255,0.8);">ThatTeslaLightshow</span>
        </div>
      </td></tr></table>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#111118;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:40px 36px;margin-bottom:24px;"><tr><td>
        ${opts.headline ? `<p style="font-size:26px;font-weight:800;letter-spacing:-1px;margin:0 0 16px;">${opts.headline}</p>` : ''}
        ${opts.bodyHtml}
        ${cta}
      </td></tr></table>
      <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="text-align:center;">
        <p style="font-size:12px;color:rgba(255,255,255,0.2);margin:0 0 4px;">Made by <a href="https://tiktok.com/@ThatTeslaLightshow" style="color:rgba(255,255,255,0.3);">@ThatTeslaLightshow</a> · Not affiliated with Tesla, Inc.</p>
        ${BUSINESS_ADDRESS ? `<p style="font-size:11px;color:rgba(255,255,255,0.18);margin:0 0 4px;">${escHtml(BUSINESS_ADDRESS)}</p>` : ''}
        <p style="font-size:11px;color:rgba(255,255,255,0.2);margin:0;"><a href="${opts.unsubscribeUrl}" style="color:rgba(255,255,255,0.3);text-decoration:underline;">Unsubscribe from these emails</a></p>
      </td></tr></table>
    </td></tr>
  </table>
</body>
</html>`;
}

// New account → a warm welcome + how to make a first show (or finish one in progress).
export async function sendWelcome({ to, hasShow, builderUrl, unsubscribeUrl }: { to: string; hasShow: boolean; builderUrl: string; unsubscribeUrl: string }) {
  if (!resend) return;
  const body = hasShow
    ? `<p style="font-size:15px;color:rgba(255,255,255,0.55);margin:0 0 22px;line-height:1.7;">You’ve started a show — nice. When it’s ready, one click exports a Tesla-ready light sequence, and we’ll walk you through dropping in your song and copying it to a USB. <em style="color:rgba(255,255,255,0.45);">Choreography by us. Soundtrack by you.</em></p>`
    : `<p style="font-size:15px;color:rgba(255,255,255,0.55);margin:0 0 18px;line-height:1.7;">Welcome aboard ⚡ Making your first Tesla light show takes about three minutes:</p>`
      + `<p style="font-size:14px;color:rgba(255,255,255,0.5);margin:0 0 22px;line-height:1.9;">1. Pick your Tesla &amp; upload a song — our engine choreographs the lights to it.<br/>2. Preview it live in 3D on your exact model.<br/>3. Export, add your own copy of the song, plug in the USB. Done.</p>`;
  await resend.emails.send({ from: MARKETING_FROM, replyTo: REPLY_TO, to, subject: 'Welcome ⚡ let’s turn your song into a light show', html: lifecycleShell({ headline: hasShow ? 'Welcome ⚡' : 'Let’s build your first show ⚡', bodyHtml: body, ctaHref: builderUrl, ctaText: hasShow ? 'Open the builder →' : 'Build your first show →', unsubscribeUrl }) });
}

// New Creator subscriber → spell out everything they just unlocked.
export async function sendCreatorWelcome({ to, builderUrl, unsubscribeUrl }: { to: string; builderUrl: string; unsubscribeUrl: string }) {
  if (!resend) return;
  const body = `<p style="font-size:15px;color:rgba(255,255,255,0.55);margin:0 0 18px;line-height:1.7;">You’re a Creator now — thank you. Here’s everything you just unlocked:</p>`
    + `<p style="font-size:14px;color:rgba(255,255,255,0.55);margin:0 0 22px;line-height:1.95;">★ <strong style="color:rgba(255,255,255,0.8);">Unlimited exports</strong> — no per-show fee, ever<br/>★ <strong style="color:rgba(255,255,255,0.8);">Free re-exports</strong> of any show, forever<br/>★ <strong style="color:rgba(255,255,255,0.8);">Multi-model export</strong> — build once, export for every Tesla you own<br/>★ <strong style="color:rgba(255,255,255,0.8);">Unlimited cloud library</strong> — every show saved &amp; backed up<br/>★ Remix any community show + priority support</p>`;
  await resend.emails.send({ from: MARKETING_FROM, replyTo: REPLY_TO, to, subject: 'Welcome to Creator ⚡ here’s what you unlocked', html: lifecycleShell({ headline: 'Welcome to Creator ⚡', bodyHtml: body, ctaHref: builderUrl, ctaText: 'Start creating →', unsubscribeUrl }) });
}

// First successful export → celebrate, invite the NEXT show (peak-intent upsell), then share.
export async function sendFirstExportCheers({ to, showName, builderUrl, unsubscribeUrl }: { to: string; showName: string; builderUrl: string; unsubscribeUrl: string }) {
  if (!resend) return;
  const clipUrl = builderUrl.replace(/\/builder\b.*$/, '/clip');
  const body = `<p style="font-size:15px;color:rgba(255,255,255,0.55);margin:0 0 16px;line-height:1.7;">You just exported <strong style="color:rgba(255,255,255,0.8);">${escHtml(showName)}</strong> — your first light show is ready to run. 🎉</p>`
    + `<p style="font-size:14px;color:rgba(255,255,255,0.5);margin:0 0 14px;line-height:1.7;">Got another song stuck in your head? Your next show is one upload away — a fresh one only takes a few minutes.</p>`
    + `<p style="font-size:13px;color:rgba(255,255,255,0.42);margin:0 0 4px;line-height:1.7;">Making a few? <strong style="color:rgba(255,255,255,0.6);">Creator</strong> unlocks unlimited exports, multi-Tesla packs, and free community downloads.</p>`
    + `<p style="font-size:14px;color:rgba(255,255,255,0.5);margin:16px 0 6px;line-height:1.7;">And when you run it on your Tesla, film it, then turn your clip into a branded, share-ready video with our <a href="${clipUrl}" style="color:#ff5a63;font-weight:600;">free clip maker</a> — tag <strong style="color:rgba(255,255,255,0.7);">@ThatTeslaLightshow</strong> when you post and we'll feature it.</p>`;
  await resend.emails.send({ from: MARKETING_FROM, replyTo: REPLY_TO, to, subject: 'Your first light show is ready 🎉', html: lifecycleShell({ headline: 'Your first show is done 🎉', bodyHtml: body, ctaHref: builderUrl, ctaText: 'Make your next show →', unsubscribeUrl }) });
}

// Dormant user (built a show a while ago, gone quiet) → a no-pressure "come back".
// No featured/community show content — just an invite to build something new.
export async function sendWinBack({ to, builderUrl, unsubscribeUrl }: { to: string; builderUrl: string; unsubscribeUrl: string }) {
  if (!resend) return;
  const body = `<p style="font-size:15px;color:rgba(255,255,255,0.55);margin:0 0 18px;line-height:1.7;">It’s been a minute. New song stuck in your head? Turn it into a light show — your Tesla’s been waiting. ⚡</p>`
    + `<p style="font-size:14px;color:rgba(255,255,255,0.5);margin:0 0 22px;line-height:1.7;">Upload a track, our engine choreographs the lights to it, preview in 3D, and export. Two minutes, start to finish. <em style="color:rgba(255,255,255,0.45);">Choreography by us. Soundtrack by you.</em></p>`;
  await resend.emails.send({ from: MARKETING_FROM, replyTo: REPLY_TO, to, subject: 'Your Tesla misses the spotlight ⚡', html: lifecycleShell({ headline: 'Make something new ⚡', bodyHtml: body, ctaHref: builderUrl, ctaText: 'Build a show →', unsubscribeUrl }) });
}

// Yearly subscriber nearing renewal → a courtesy heads-up (transparency + retention).
export async function sendRenewalReminder({ to, renewDateLabel, manageUrl, unsubscribeUrl }: { to: string; renewDateLabel: string; manageUrl: string; unsubscribeUrl: string }) {
  if (!resend) return;
  const body = `<p style="font-size:15px;color:rgba(255,255,255,0.55);margin:0 0 18px;line-height:1.7;">Your Creator annual plan renews on <strong style="color:rgba(255,255,255,0.8);">${escHtml(renewDateLabel)}</strong>. No action needed — we just like to give a heads-up.</p>`
    + `<p style="font-size:14px;color:rgba(255,255,255,0.5);margin:0 0 22px;line-height:1.7;">You’ll keep unlimited exports, multi-model export, your unlimited cloud library, and free re-exports for another year. Manage or change your plan anytime from your dashboard.</p>`;
  await resend.emails.send({ from: MARKETING_FROM, replyTo: REPLY_TO, to, subject: 'Your Creator plan renews soon', html: lifecycleShell({ headline: 'Your Creator year is almost up ⚡', bodyHtml: body, ctaHref: manageUrl, ctaText: 'Manage your plan →', unsubscribeUrl }) });
}

// Admin broadcast (seasonal / announcement). `bodyHtml` is owner-authored content the
// API has already escaped + linkified. Returns true on a successful send.
export async function sendBroadcast({ to, subject, bodyHtml, unsubscribeUrl }: { to: string; subject: string; bodyHtml: string; unsubscribeUrl: string }): Promise<boolean> {
  if (!resend) return false;
  try {
    await resend.emails.send({ from: MARKETING_FROM, replyTo: REPLY_TO, to, subject, html: lifecycleShell({ headline: '', bodyHtml, unsubscribeUrl }) });
    return true;
  } catch { return false; }
}

function escHtml(s: string) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
