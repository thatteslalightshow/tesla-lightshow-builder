-- Persist manual timeline edits (light beats + closure commands) so the
-- server export can reproduce them. Run in the Supabase SQL editor.
alter table shows add column if not exists edit_data jsonb;
