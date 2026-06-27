'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

// Fires a first-party page_view to /api/track on every route change. The anonymous
// id lives in localStorage (no cookie, no PII) so we can count distinct visitors +
// the build funnel. Skips /admin so our own dashboard views don't inflate the stats.
function anonId(): string {
  try {
    let id = localStorage.getItem('tls_aid');
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('tls_aid', id); }
    return id;
  } catch { return 'anon'; }
}

export default function Track() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || pathname.startsWith('/admin')) return;
    const payload = JSON.stringify({ type: 'page_view', path: pathname, anon_id: anonId() });
    fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
  }, [pathname]);
  return null;
}
