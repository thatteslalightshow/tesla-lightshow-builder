-- ─────────────────────────────────────────────────────────────────────────────
-- shows column-level write lockdown — SECURITY CRITICAL (P0-5)
-- ─────────────────────────────────────────────────────────────────────────────
-- Closes the free-export payment-bypass + cross-tenant FSEQ-read hole.
--
-- The builder saves an EXISTING show by writing `public.shows` directly from the browser
-- (PostgREST role = `authenticated`). RLS restricts which ROWS a user can touch, but NOT which
-- COLUMNS. Without a column grant, a user could PATCH:
--   • source_show_id  → the export gate treats the show as "acquired" → unlimited FREE exports, and
--   • fseq_path       → point at another tenant's canonical FSEQ → cross-tenant choreography read.
--
-- This grants UPDATE on ONLY the 12 columns the builder legitimately writes (see save() in
-- src/app/builder/page.tsx). Everything else — source_show_id, fseq_path, id, created_at, user_id
-- ownership transfer risk aside (RLS-bound), social_* moderation fields, etc. — stays writable ONLY
-- by the service role (server routes: /api/shows/create, /api/shows/link, /api/export).
--
-- STATUS: believed already live in prod (owner ran the original column-lockdown). This file
-- version-controls it and is IDEMPOTENT — re-run any time to GUARANTEE prod matches source control.
-- Deeper follow-up (P1-7): move the browser UPDATE to a column-whitelisting server route so the
-- write surface isn't client-reachable at all.

REVOKE UPDATE ON public.shows FROM authenticated, anon;

GRANT UPDATE (
  user_id,
  name,
  tesla_model,
  style,
  intensity,
  bpm,
  is_public,
  song_title,
  song_artist,
  edit_data,
  duration_sec,
  updated_at
) ON public.shows TO authenticated;

-- ── CONFORMANCE GUARD ─────────────────────────────────────────────────────────
-- After running, verify the hole is closed. As a NORMAL signed-in user (via the app or a
-- user-scoped connection), each of these must FAIL with "permission denied for column …":
--
--   update public.shows set source_show_id = gen_random_uuid() where id = '<one of your show ids>';
--   update public.shows set fseq_path = 'someone/else/canonical.fseq' where id = '<one of your show ids>';
--
-- And a normal save must still SUCCEED (proves we didn't over-revoke):
--   update public.shows set name = 'ok', updated_at = now() where id = '<one of your show ids>';
--
-- Inspect the effective grants any time:
--   select grantee, privilege_type, string_agg(column_name, ', ') as cols
--   from information_schema.column_privileges
--   where table_name = 'shows' and privilege_type = 'UPDATE'
--   group by grantee, privilege_type;
