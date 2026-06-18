-- Engagement signals for the gallery: view counts + likes
-- Run in the Supabase SQL editor.

-- Denormalized counters on shows (drive "Most popular" sorting cheaply)
alter table shows add column if not exists view_count int not null default 0;
alter table shows add column if not exists like_count int not null default 0;

-- Per-user likes (one heart per user per show)
create table if not exists show_likes (
  user_id    uuid not null references auth.users(id) on delete cascade,
  show_id    uuid not null references shows(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, show_id)
);

create index if not exists show_likes_show_idx on show_likes(show_id);
create index if not exists show_likes_user_idx on show_likes(user_id);

alter table show_likes enable row level security;

drop policy if exists "Users manage own likes" on show_likes;
create policy "Users manage own likes"
  on show_likes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Anyone can read likes" on show_likes;
create policy "Anyone can read likes"
  on show_likes for select
  using (true);

-- Keep shows.like_count in sync automatically
create or replace function sync_show_like_count() returns trigger as $$
begin
  if (TG_OP = 'INSERT') then
    update shows set like_count = like_count + 1 where id = NEW.show_id;
    return NEW;
  elsif (TG_OP = 'DELETE') then
    update shows set like_count = greatest(0, like_count - 1) where id = OLD.show_id;
    return OLD;
  end if;
  return null;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_sync_like_count on show_likes;
create trigger trg_sync_like_count
  after insert or delete on show_likes
  for each row execute function sync_show_like_count();

-- Atomic view increment, callable by anon via the API's admin client
create or replace function increment_show_view(p_token text) returns void as $$
  update shows set view_count = view_count + 1 where share_token = p_token and is_public = true;
$$ language sql security definer;
