create table if not exists subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id     text,
  stripe_subscription_id text unique,
  stripe_price_id        text,
  plan                   text not null default 'creator_monthly',
  status                 text not null default 'inactive',
  current_period_end     timestamptz,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

create index if not exists subscriptions_user_id_idx            on subscriptions(user_id);
create index if not exists subscriptions_stripe_customer_idx    on subscriptions(stripe_customer_id);
create index if not exists subscriptions_stripe_sub_idx         on subscriptions(stripe_subscription_id);

alter table subscriptions enable row level security;
create policy "Users can view own subscription"
  on subscriptions for select using (auth.uid() = user_id);
