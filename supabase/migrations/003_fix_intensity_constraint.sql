-- Fix shows_intensity_check constraint.
-- The original constraint limited intensity to 1-3 (a 3-level scale)
-- but the builder UI uses a 0-100 percentage slider.
-- This migration corrects the range.

ALTER TABLE public.shows DROP CONSTRAINT IF EXISTS shows_intensity_check;
ALTER TABLE public.shows ADD CONSTRAINT shows_intensity_check
  CHECK (intensity >= 0 AND intensity <= 100);
