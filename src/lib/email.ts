import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM = 'ThatTeslaLightshow <noreply@thatteslalightshow.com>';

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
                1. Copy the ZIP to a USB drive (FAT32 formatted)<br />
                2. Place in <code style="color:#e8404a;">/LightShow/</code> folder on the drive<br />
                3. Plug into your Tesla and tap Entertainment → Light Show
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

  await resend.emails.send({
    from: FROM,
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
          <p style="font-size:12px;color:rgba(255,255,255,0.3);margin:14px 0 0;">Link expires in ${expiresMinutes} minutes.</p>
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
    from: FROM,
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

function escHtml(s: string) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
