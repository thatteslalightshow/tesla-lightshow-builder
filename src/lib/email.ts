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
  expiresMinutes = 60,
}: {
  to: string;
  showName: string;
  model: string;
  downloadUrl: string;
  expiresMinutes?: number;
}) {
  if (!resend) return;

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
          <p style="font-size:15px;color:rgba(255,255,255,0.5);margin:0 0 32px;line-height:1.6;">
            <strong style="color:rgba(255,255,255,0.8);">${escHtml(showName)}</strong> for the ${escHtml(model)}.<br/>
            Download link expires in ${expiresMinutes} minutes.
          </p>
          <a href="${downloadUrl}" style="display:inline-block;padding:14px 32px;background:#e8404a;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:700;letter-spacing:-0.2px;">
            Download your show →
          </a>
          <hr style="border:none;border-top:1px solid rgba(255,255,255,0.07);margin:32px 0;" />
          <p style="font-size:13px;color:rgba(255,255,255,0.35);margin:0;line-height:1.7;">
            <strong style="color:rgba(255,255,255,0.5);">How to use it:</strong><br />
            1. Copy the ZIP to a USB drive (FAT32 formatted)<br />
            2. Place in <code style="color:#e8404a;">/LightShow/</code> folder on the drive<br />
            3. Plug into your Tesla and tap Entertainment → Light Show
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

function escHtml(s: string) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
