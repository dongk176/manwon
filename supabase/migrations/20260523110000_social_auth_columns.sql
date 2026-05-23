alter table manwon_happiness.users
  add column if not exists kakao_id text,
  add column if not exists kakao_email text,
  add column if not exists kakao_nickname text,
  add column if not exists kakao_avatar_url text,
  add column if not exists apple_id text,
  add column if not exists apple_email text,
  add column if not exists apple_full_name text,
  add column if not exists apple_email_verified boolean,
  add column if not exists apple_is_private_email boolean;

create unique index if not exists users_kakao_id_unique_idx
  on manwon_happiness.users (kakao_id)
  where kakao_id is not null and withdrawn_at is null;

create index if not exists users_kakao_email_idx
  on manwon_happiness.users (kakao_email)
  where kakao_email is not null and withdrawn_at is null;

create unique index if not exists users_apple_id_unique_idx
  on manwon_happiness.users (apple_id)
  where apple_id is not null and withdrawn_at is null;

create index if not exists users_apple_email_idx
  on manwon_happiness.users (apple_email)
  where apple_email is not null and withdrawn_at is null;
