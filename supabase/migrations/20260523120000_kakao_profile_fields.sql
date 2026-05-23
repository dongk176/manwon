alter table manwon_happiness.users
  add column if not exists kakao_name text,
  add column if not exists kakao_gender text,
  add column if not exists kakao_birthday text,
  add column if not exists kakao_birthyear text,
  add column if not exists kakao_phone_number text;

create index if not exists users_kakao_phone_number_idx
  on manwon_happiness.users (kakao_phone_number)
  where kakao_phone_number is not null and withdrawn_at is null;
