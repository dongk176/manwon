create table if not exists manwon_happiness.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references manwon_happiness.profiles(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android', 'web')),
  fcm_token text not null,
  device_id text,
  app_version text,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fcm_token)
);

create index if not exists device_push_tokens_user_idx
  on manwon_happiness.device_push_tokens (user_id, enabled, last_seen_at desc);

create index if not exists device_push_tokens_device_idx
  on manwon_happiness.device_push_tokens (user_id, device_id)
  where device_id is not null;

drop trigger if exists device_push_tokens_set_updated_at on manwon_happiness.device_push_tokens;
create trigger device_push_tokens_set_updated_at
before update on manwon_happiness.device_push_tokens
for each row execute function manwon_happiness.set_updated_at();

alter table manwon_happiness.device_push_tokens enable row level security;

drop policy if exists "device push tokens own read" on manwon_happiness.device_push_tokens;
create policy "device push tokens own read" on manwon_happiness.device_push_tokens
  for select using (auth.uid() = user_id);

drop policy if exists "device push tokens own insert" on manwon_happiness.device_push_tokens;
create policy "device push tokens own insert" on manwon_happiness.device_push_tokens
  for insert with check (auth.uid() = user_id);

drop policy if exists "device push tokens own update" on manwon_happiness.device_push_tokens;
create policy "device push tokens own update" on manwon_happiness.device_push_tokens
  for update using (auth.uid() = user_id);
