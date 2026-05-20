alter table manwon_happiness.profiles
  add column if not exists phone text,
  add column if not exists phone_verified_at timestamptz;

create unique index if not exists profiles_phone_unique_idx
  on manwon_happiness.profiles (phone)
  where phone is not null;

create table if not exists manwon_happiness.phone_otps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references manwon_happiness.profiles(id) on delete cascade,
  phone text not null,
  code_hash text not null,
  attempts integer not null default 0 check (attempts >= 0),
  ip_hash text,
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists phone_otps_user_phone_idx
  on manwon_happiness.phone_otps (user_id, phone, created_at desc);

create index if not exists phone_otps_phone_created_idx
  on manwon_happiness.phone_otps (phone, created_at desc);

create index if not exists phone_otps_ip_hash_created_idx
  on manwon_happiness.phone_otps (ip_hash, created_at desc)
  where ip_hash is not null;
