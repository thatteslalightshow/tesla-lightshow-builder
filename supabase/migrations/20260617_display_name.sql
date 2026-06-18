-- Ensure display_name exists on profiles (may already be present)
alter table profiles add column if not exists display_name text;
