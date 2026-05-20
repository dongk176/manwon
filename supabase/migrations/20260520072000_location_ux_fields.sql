alter table manwon_happiness.task_posts
  add column if not exists region_code text,
  add column if not exists location_source text;

alter table manwon_happiness.task_posts
  alter column location_visibility set default 'approximate';

alter table manwon_happiness.profiles
  add column if not exists default_latitude numeric,
  add column if not exists default_longitude numeric,
  add column if not exists default_region_1depth text,
  add column if not exists default_region_2depth text,
  add column if not exists default_region_3depth text,
  add column if not exists location_permission_status text not null default 'unknown';

create table if not exists manwon_happiness.user_service_regions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references manwon_happiness.profiles(id) on delete cascade,
  region_1depth text not null,
  region_2depth text not null,
  region_3depth text not null,
  latitude numeric not null,
  longitude numeric not null,
  radius_m integer not null default 3000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_service_regions_latitude_range check (latitude >= -90 and latitude <= 90),
  constraint user_service_regions_longitude_range check (longitude >= -180 and longitude <= 180),
  constraint user_service_regions_radius_range check (radius_m between 100 and 20000)
);

create index if not exists user_service_regions_user_idx
  on manwon_happiness.user_service_regions (user_id, created_at desc);

do $$
begin
  alter table manwon_happiness.task_posts
    drop constraint if exists task_posts_location_visibility_check;

  alter table manwon_happiness.task_posts
    add constraint task_posts_location_visibility_check
    check (location_visibility in ('approximate', 'hidden', 'exact_after_accept', 'rough', 'exact'));

  if not exists (
    select 1 from pg_constraint
    where conname = 'task_posts_location_source_check'
      and conrelid = 'manwon_happiness.task_posts'::regclass
  ) then
    alter table manwon_happiness.task_posts
      add constraint task_posts_location_source_check
      check (location_source is null or location_source in ('gps', 'manual'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_default_latitude_range'
      and conrelid = 'manwon_happiness.profiles'::regclass
  ) then
    alter table manwon_happiness.profiles
      add constraint profiles_default_latitude_range
      check (default_latitude is null or (default_latitude >= -90 and default_latitude <= 90));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_default_longitude_range'
      and conrelid = 'manwon_happiness.profiles'::regclass
  ) then
    alter table manwon_happiness.profiles
      add constraint profiles_default_longitude_range
      check (default_longitude is null or (default_longitude >= -180 and default_longitude <= 180));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_location_permission_status_check'
      and conrelid = 'manwon_happiness.profiles'::regclass
  ) then
    alter table manwon_happiness.profiles
      add constraint profiles_location_permission_status_check
      check (location_permission_status in ('unknown', 'prompt', 'granted', 'denied', 'unavailable'));
  end if;
end $$;
