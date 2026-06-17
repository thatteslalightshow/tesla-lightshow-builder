import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/Users/adamsmacbookpro/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.js');
const { readFileSync } = await import('fs');

const BROWSERS = '/tmp/pw-browsers';
const BASE = 'http://localhost:3000';
const PROJECT_REF = 'qjpngxicxcoxuuuvkmtk';
const COOKIE_KEY = `sb-${PROJECT_REF}-auth-token`;
const MAX_CHUNK = 3180;

let session;
try {
  session = JSON.parse(readFileSync('/Users/adamsmacbookpro/Desktop/tesla-lightshow-builder/.tmp/sb_session.json', 'utf8'));
} catch {
  session = null;
}

const browser = await chromium.launch({
  executablePath: `${BROWSERS}/chromium_headless_shell-1228/chrome-headless-shell-mac-x64/chrome-headless-shell`,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });

if (session) {
  const sessionStr = JSON.stringify([session.access_token, session.refresh_token, null, null, null]);
  const chunks = sessionStr.length <= MAX_CHUNK
    ? [{ name: COOKIE_KEY, value: sessionStr }]
    : Array.from({ length: Math.ceil(sessionStr.length / MAX_CHUNK) }, (_, i) => ({
        name: `${COOKIE_KEY}.${i}`,
        value: sessionStr.slice(i * MAX_CHUNK, (i + 1) * MAX_CHUNK),
      }));
  await ctx.addCookies(chunks.map(c => ({
    name: c.name, value: c.value,
    domain: 'localhost', path: '/',
    httpOnly: false, secure: false, sameSite: 'Lax',
  })));
}

const page = await ctx.newPage();
const errors = [], networkFails = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(e.message));
page.on('response', r => { if (r.status() >= 400 && r.url().includes('/models/')) networkFails.push(`${r.status()} ${r.url()}`); });

// ── Load builder ───────────────────────────────────────────────────────────
console.log('=== Loading builder ===');
await page.goto(`${BASE}/builder`, { waitUntil: 'load' });
await page.waitForTimeout(5000);
const url = page.url();
console.log('URL:', url);
console.log('On builder:', url.includes('/builder') ? '✓' : '✗ redirected');
const canvas = await page.locator('canvas').count();
console.log('Canvas present:', canvas > 0 ? '✓' : '✗');

if (!url.includes('/builder')) {
  console.log('Not on builder — stopping.');
  await browser.close(); process.exit(1);
}

// ── Check GLTF status badge ────────────────────────────────────────────────
console.log('\n=== GLTF model status (Model 3) ===');
let hdBadge = 0;
for (let i = 0; i < 10; i++) {
  hdBadge = await page.locator('text=HD MODEL').count();
  if (hdBadge > 0) break;
  await page.waitForTimeout(1000);
}
console.log('HD MODEL badge:', hdBadge > 0 ? '✓ GLTF loaded' : '✗ procedural fallback');
await page.screenshot({ path: '/Users/adamsmacbookpro/Desktop/tesla-lightshow-builder/.tmp/ss_model3.png' });

// ── Cycle all 5 models ────────────────────────────────────────────────────
console.log('\n=== Cycle all models ===');
const MODELS = ['Model Y', 'Model S', 'Model X', 'Cybertruck', 'Model 3'];
for (const m of MODELS) {
  // JS click bypasses main-thread blocking from WebGL
  await page.evaluate((label) => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => b.textContent?.includes(label));
    if (btn) btn.click();
  }, m);
  await page.waitForTimeout(1500);
  // Wait for GLTF to resolve (up to 10s per model)
  let badge = 0;
  for (let i = 0; i < 10; i++) {
    badge = await page.locator('text=HD MODEL').count();
    if (badge > 0) break;
    await page.waitForTimeout(1000);
  }
  const safeName = m.replace(/ /g, '_');
  await page.screenshot({ path: `/Users/adamsmacbookpro/Desktop/tesla-lightshow-builder/.tmp/ss_${safeName}.png` });
  console.log(`${m}: ${badge > 0 ? '✓ HD MODEL' : '✗ procedural'}`);
}

// ── Network failures ───────────────────────────────────────────────────────
console.log('\n=== Model network requests ===');
console.log(networkFails.length === 0 ? 'No 4xx/5xx ✓' : networkFails.join('\n'));

// ── Console errors ─────────────────────────────────────────────────────────
console.log('\n=== Console errors ===');
const rel = errors.filter(e => !e.includes('favicon') && !e.includes('Failed to load resource'));
console.log(rel.length === 0 ? 'None ✓' : rel.slice(0, 10).join('\n'));

// ── Draco decoder served ───────────────────────────────────────────────────
console.log('\n=== Draco decoder endpoint ===');
const dracoRes = await page.evaluate(async () => {
  const r = await fetch('/draco/draco_wasm_wrapper.js');
  return { status: r.status };
});
console.log(`/draco/draco_wasm_wrapper.js: ${dracoRes.status} ${dracoRes.status === 200 ? '✓' : '✗'}`);

await browser.close();
console.log('\nDone. Screenshots in .tmp/ss_*.png');
