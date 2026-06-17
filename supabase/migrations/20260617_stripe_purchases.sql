-- Records each paid export purchase
create table if not exists show_purchases (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references auth.users(id) on delete cascade,
  show_id                   uuid not null references shows(id) on delete cascade,
  stripe_session_id         text not null unique,
  stripe_payment_intent_id  text,
  amount_cents              integer,
  created_at                timestamptz not null default now()
);

-- Users can read their own purchases
alter table show_purchases enable row level security;
create policy "users_read_own_purchases"
  on show_purchases for select
  using (auth.uid() = user_id);
