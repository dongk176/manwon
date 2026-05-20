alter table manwon_happiness.profiles
  add column if not exists login_id text,
  add column if not exists password_hash text,
  add column if not exists display_name text,
  add column if not exists birth_date date,
  add column if not exists terms_agreed_at timestamptz,
  add column if not exists privacy_agreed_at timestamptz,
  add column if not exists marketing_agreed_at timestamptz,
  add column if not exists last_login_at timestamptz;

create unique index if not exists profiles_login_id_unique_idx
  on manwon_happiness.profiles (login_id)
  where login_id is not null;

create index if not exists profiles_last_login_idx
  on manwon_happiness.profiles (last_login_at desc)
  where last_login_at is not null;
