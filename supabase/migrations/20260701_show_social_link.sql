-- A community show can link OUT to the creator's own social post (TikTok / YouTube) of their car
-- running the show. We host silent light sequences, not video — this is just a link to the platform,
-- which holds the music license (keeps us on the right side of BYOM/copyright).
--
-- Moderation with an ADMIN backstop: on submit we run an on-device check on the post's thumbnail.
-- Clean → 'approved' (link is live). Flagged → 'pending' (HOLD — not shown on the site) and it surfaces
-- in the admin review queue with the reason; the admin approves or denies. 'rejected' = denied.
alter table public.shows
  add column if not exists social_url         text,
  add column if not exists social_status      text,  -- 'approved' | 'pending' | 'rejected'
  add column if not exists social_flag_reason text,  -- why it went to review (shown to the admin)
  add column if not exists social_thumb_url   text,  -- the post's cover image, for the admin review preview
  add column if not exists social_submitted_at timestamptz;

-- Admin review queue lookup.
create index if not exists shows_social_status_idx on public.shows (social_status) where social_status is not null;
