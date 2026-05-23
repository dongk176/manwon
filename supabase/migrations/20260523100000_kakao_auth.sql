alter table manwon_happiness.users
  add column if not exists kakao_id text,
  add column if not exists kakao_email text;

create unique index if not exists users_kakao_id_unique_idx
  on manwon_happiness.users (kakao_id)
  where kakao_id is not null and withdrawn_at is null;

create index if not exists users_kakao_email_idx
  on manwon_happiness.users (kakao_email)
  where kakao_email is not null and withdrawn_at is null;
