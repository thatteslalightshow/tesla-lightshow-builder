import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/Users/adamsmacbookpro/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.js');
const { writeFileSync } = await import('fs');

const BROWSERS = '/tmp/pw-browsers';
const BASE = 'http://localhost:3000';
const PROJECT_REF = 'qjpngxicxcoxuuuvkmtk';
const COOKIE_KEY = `sb-${PROJECT_REF}-auth-token`;

// Magic link token from admin API
const MAGIC_TOKEN = '3fa2bae07b0f38b27400a4e2cde633b686af57306d3d8abe6e5efa1f';
const VERIFY_URL = `https://${PROJECT_REF}.supabase.co/auth/v1/verify?token=${MAGIC_TOKEN}&type=magiclink&redirect_to=${BASE}/builder`;

const browser = await chromium.launch({
  executablePath: `${BROWSERS}/chromium_headless_shell-1228/chrome-headless-shell-mac-x64/chrome-headless-shell`,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

// Visit the Supabase magic link — it will redirect to BASE/builder with session in URL hash
// Then Supabase JS will exchange the hash fragment for cookies
console.log('Visiting magic link...');
await page.goto(VERIFY_URL, { waitUntil: 'load', timeout: 15000 });
await page.waitForTimeout(4000);
console.log('Landed at:', page.url());

// Extract cookies
const cookies = await ctx.cookies();
const sessionCookies = cookies.filter(c => c.name.startsWith(COOKIE_KEY));
console.log('Session cookies found:', sessionCookies.length);

if (sessionCookies.length > 0) {
  // Reconstruct the session JSON from chunks
  let sessionStr = '';
  if (sessionCookies.length === 1) {
    sessionStr = sessionCookies[0].value;
  } else {
    const sorted = sessionCookies.sort((a, b) => {
      const ai = parseInt(a.name.split('.').pop() || '0');
      const bi = parseInt(b.name.split('.').pop() || '0');
      return ai - bi;
    });
    sessionStr = sorted.map(c => c.value).join('');
  }

  try {
    const parsed = JSON.parse(sessionStr);
    // parsed is [access_token, refresh_token, ...]
    const session = { access_token: parsed[0], refresh_token: parsed[1] };
    writeFileSync('/Users/adamsmacbookpro/Desktop/tesla-lightshow-builder/.tmp/sb_session.json', JSON.stringify(session));
    console.log('Session saved ✓');
    console.log('access_token prefix:', session.access_token?.slice(0, 30));
  } catch (e) {
    console.log('Parse error:', e.message);
    console.log('Raw:', sessionStr.slice(0, 200));
  }
} else {
  console.log('No session cookies — checking localStorage...');
  const ls = await page.evaluate(() => {
    const keys = Object.keys(localStorage);
    return keys.map(k => ({ k, v: localStorage.getItem(k)?.slice(0, 100) }));
  });
  console.log('localStorage keys:', ls.map(x => x.k).join(', '));
}

await browser.close();
