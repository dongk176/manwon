alter table manwon_happiness.profiles
  add column if not exists withdrawn_at timestamptz,
  add column if not exists withdrawal_reason text;

create index if not exists profiles_withdrawn_at_idx
  on manwon_happiness.profiles (withdrawn_at)
  where withdrawn_at is not null;
