-- BYOM linchpin: store each show's choreography path so exports never need the raw audio.
-- With this column set, /api/export marks choreographyStored=true, which (a) lets no-audio
-- exports (BYOM-deleted or community clones) ship the stored FSEQ, and (b) enables the
-- delete-the-uploaded-audio-on-export behavior promised in the privacy policy / terms.
-- Pre-migration the code is fully defensive (no-op, audio kept, re-analyze on export).
-- Applied to production 2026-06-27 via the Supabase SQL editor.
ALTER TABLE shows ADD COLUMN IF NOT EXISTS fseq_path text;

-- Ask PostgREST to refresh its schema cache so the REST API sees the column immediately.
NOTIFY pgrst, 'reload schema';
