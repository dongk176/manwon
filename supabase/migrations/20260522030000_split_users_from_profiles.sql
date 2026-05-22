create table if not exists manwon_happiness.users (
  id uuid primary key default gen_random_uuid(),
  nickname text,
  avatar_url text,
  gender manwon_happiness.gender_type not null default 'unknown',
  phone text,
  phone_verified boolean not null default true,
  phone_verified_at timestamptz,
  identity_verified boolean not null default false,
  gender_verified boolean not null default false,
  rating_avg numeric not null default 0 check (rating_avg >= 0 and rating_avg <= 5),
  review_count integer not null default 0 check (review_count >= 0),
  completed_count integer not null default 0 check (completed_count >= 0),
  is_blocked boolean not null default false,
  login_id text,
  password_hash text,
  display_name text,
  birth_date date,
  terms_agreed_at timestamptz,
  privacy_agreed_at timestamptz,
  marketing_agreed_at timestamptz,
  last_login_at timestamptz,
  trust_experience_summary text,
  trust_portfolio_url text,
  trust_response_time_text text,
  trust_gender_visibility manwon_happiness.gender_visibility not null default 'private',
  trust_example_images jsonb not null default '[]'::jsonb,
  trust_career_summary text,
  trust_portfolio_links jsonb not null default '[]'::jsonb,
  trust_work_sample_images jsonb not null default '[]'::jsonb,
  trust_response_time text,
  default_latitude numeric,
  default_longitude numeric,
  default_region_1depth text,
  default_region_2depth text,
  default_region_3depth text,
  location_permission_status text not null default 'unknown',
  withdrawn_at timestamptz,
  withdrawal_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_trust_example_images_array_check check (jsonb_typeof(trust_example_images) = 'array'),
  constraint users_trust_portfolio_links_array_check check (jsonb_typeof(trust_portfolio_links) = 'array'),
  constraint users_trust_work_sample_images_array_check check (jsonb_typeof(trust_work_sample_images) = 'array'),
  constraint users_default_latitude_range check (default_latitude is null or (default_latitude >= -90 and default_latitude <= 90)),
  constraint users_default_longitude_range check (default_longitude is null or (default_longitude >= -180 and default_longitude <= 180)),
  constraint users_location_permission_status_check check (location_permission_status in ('unknown', 'prompt', 'granted', 'denied', 'unavailable'))
);

create unique index if not exists users_login_id_unique_idx
  on manwon_happiness.users (login_id)
  where login_id is not null and withdrawn_at is null;

create unique index if not exists users_phone_unique_idx
  on manwon_happiness.users (phone)
  where phone is not null and withdrawn_at is null;

create index if not exists users_last_login_idx
  on manwon_happiness.users (last_login_at desc)
  where last_login_at is not null;

create index if not exists users_withdrawn_at_idx
  on manwon_happiness.users (withdrawn_at)
  where withdrawn_at is not null;

drop trigger if exists users_set_updated_at on manwon_happiness.users;
create trigger users_set_updated_at
before update on manwon_happiness.users
for each row execute function manwon_happiness.set_updated_at();

insert into manwon_happiness.users (
  id,
  nickname,
  avatar_url,
  gender,
  phone,
  phone_verified,
  phone_verified_at,
  identity_verified,
  gender_verified,
  rating_avg,
  review_count,
  completed_count,
  is_blocked,
  login_id,
  password_hash,
  display_name,
  birth_date,
  terms_agreed_at,
  privacy_agreed_at,
  marketing_agreed_at,
  last_login_at,
  trust_experience_summary,
  trust_portfolio_url,
  trust_response_time_text,
  trust_gender_visibility,
  trust_example_images,
  trust_career_summary,
  trust_portfolio_links,
  trust_work_sample_images,
  trust_response_time,
  default_latitude,
  default_longitude,
  default_region_1depth,
  default_region_2depth,
  default_region_3depth,
  location_permission_status,
  withdrawn_at,
  withdrawal_reason,
  created_at,
  updated_at
)
select
  p.id,
  p.nickname,
  p.avatar_url,
  p.gender,
  p.phone,
  coalesce(p.phone_verified, false),
  p.phone_verified_at,
  p.identity_verified,
  p.gender_verified,
  p.rating_avg,
  p.review_count,
  p.completed_count,
  p.is_blocked,
  p.login_id,
  p.password_hash,
  p.display_name,
  p.birth_date,
  p.terms_agreed_at,
  p.privacy_agreed_at,
  p.marketing_agreed_at,
  p.last_login_at,
  p.trust_experience_summary,
  p.trust_portfolio_url,
  p.trust_response_time_text,
  p.trust_gender_visibility,
  p.trust_example_images,
  p.trust_career_summary,
  p.trust_portfolio_links,
  p.trust_work_sample_images,
  p.trust_response_time,
  p.default_latitude,
  p.default_longitude,
  p.default_region_1depth,
  p.default_region_2depth,
  p.default_region_3depth,
  p.location_permission_status,
  p.withdrawn_at,
  p.withdrawal_reason,
  p.created_at,
  p.updated_at
from manwon_happiness.profiles p
where coalesce(p.phone_verified, false)
  or exists (select 1 from manwon_happiness.task_posts x where x.creator_id = p.id)
  or exists (select 1 from manwon_happiness.task_post_images x where x.uploader_id = p.id)
  or exists (select 1 from manwon_happiness.applications x where x.applicant_id = p.id)
  or exists (select 1 from manwon_happiness.deals x where x.requester_id = p.id or x.helper_id = p.id or x.cancelled_by = p.id)
  or exists (select 1 from manwon_happiness.conversations x where x.requester_id = p.id or x.helper_id = p.id)
  or exists (select 1 from manwon_happiness.messages x where x.sender_id = p.id)
  or exists (select 1 from manwon_happiness.reviews x where x.reviewer_id = p.id or x.reviewee_id = p.id)
  or exists (select 1 from manwon_happiness.favorites x where x.user_id = p.id)
  or exists (select 1 from manwon_happiness.reports x where x.reporter_id = p.id or x.target_user_id = p.id)
  or exists (select 1 from manwon_happiness.blocks x where x.blocker_id = p.id or x.blocked_user_id = p.id)
  or exists (select 1 from manwon_happiness.settlements x where x.user_id = p.id)
  or exists (select 1 from manwon_happiness.notification_events x where x.user_id = p.id)
  or exists (select 1 from manwon_happiness.user_service_regions x where x.user_id = p.id)
  or exists (select 1 from manwon_happiness.device_push_tokens x where x.user_id = p.id)
  or exists (select 1 from manwon_happiness.review_reminders x where x.user_id = p.id)
on conflict (id) do update
set nickname = excluded.nickname,
    avatar_url = excluded.avatar_url,
    gender = excluded.gender,
    phone = excluded.phone,
    phone_verified = excluded.phone_verified,
    phone_verified_at = excluded.phone_verified_at,
    identity_verified = excluded.identity_verified,
    gender_verified = excluded.gender_verified,
    rating_avg = excluded.rating_avg,
    review_count = excluded.review_count,
    completed_count = excluded.completed_count,
    is_blocked = excluded.is_blocked,
    login_id = excluded.login_id,
    password_hash = excluded.password_hash,
    display_name = excluded.display_name,
    birth_date = excluded.birth_date,
    terms_agreed_at = excluded.terms_agreed_at,
    privacy_agreed_at = excluded.privacy_agreed_at,
    marketing_agreed_at = excluded.marketing_agreed_at,
    last_login_at = excluded.last_login_at,
    trust_experience_summary = excluded.trust_experience_summary,
    trust_portfolio_url = excluded.trust_portfolio_url,
    trust_response_time_text = excluded.trust_response_time_text,
    trust_gender_visibility = excluded.trust_gender_visibility,
    trust_example_images = excluded.trust_example_images,
    trust_career_summary = excluded.trust_career_summary,
    trust_portfolio_links = excluded.trust_portfolio_links,
    trust_work_sample_images = excluded.trust_work_sample_images,
    trust_response_time = excluded.trust_response_time,
    default_latitude = excluded.default_latitude,
    default_longitude = excluded.default_longitude,
    default_region_1depth = excluded.default_region_1depth,
    default_region_2depth = excluded.default_region_2depth,
    default_region_3depth = excluded.default_region_3depth,
    location_permission_status = excluded.location_permission_status,
    withdrawn_at = excluded.withdrawn_at,
    withdrawal_reason = excluded.withdrawal_reason,
    updated_at = excluded.updated_at;

create table if not exists manwon_happiness.signup_drafts (
  id uuid primary key default gen_random_uuid(),
  login_id text not null,
  password_hash text not null,
  display_name text not null,
  gender manwon_happiness.gender_type not null default 'unknown',
  birth_date date not null,
  phone text not null,
  terms_agreed_at timestamptz not null,
  privacy_agreed_at timestamptz not null,
  marketing_agreed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists signup_drafts_login_phone_idx
  on manwon_happiness.signup_drafts (login_id, phone, created_at desc);

create index if not exists signup_drafts_expires_idx
  on manwon_happiness.signup_drafts (expires_at);

drop trigger if exists signup_drafts_set_updated_at on manwon_happiness.signup_drafts;
create trigger signup_drafts_set_updated_at
before update on manwon_happiness.signup_drafts
for each row execute function manwon_happiness.set_updated_at();

alter table manwon_happiness.phone_otps
  alter column user_id drop not null,
  add column if not exists signup_draft_id uuid;

delete from manwon_happiness.activity_profiles ap
where not exists (
  select 1 from manwon_happiness.users u where u.id = ap.user_id
);

delete from manwon_happiness.user_service_regions usr
where not exists (
  select 1 from manwon_happiness.users u where u.id = usr.user_id
);

delete from manwon_happiness.device_push_tokens dpt
where not exists (
  select 1 from manwon_happiness.users u where u.id = dpt.user_id
);

delete from manwon_happiness.review_reminders rr
where not exists (
  select 1 from manwon_happiness.users u where u.id = rr.user_id
);

update manwon_happiness.phone_otps po
set user_id = null
where po.user_id is not null
  and not exists (
    select 1 from manwon_happiness.users u where u.id = po.user_id
  );

delete from manwon_happiness.phone_otps
where user_id is null
  and signup_draft_id is null;

do $$
declare
  old_profiles regclass := to_regclass('manwon_happiness.profiles');
  fk record;
begin
  if old_profiles is not null then
    for fk in
      select conrelid::regclass as table_name, conname
      from pg_constraint
      where contype = 'f'
        and confrelid = old_profiles
    loop
      execute format('alter table %s drop constraint %I', fk.table_name, fk.conname);
    end loop;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'activity_profiles_user_id_users_fkey' and conrelid = 'manwon_happiness.activity_profiles'::regclass) then
    alter table manwon_happiness.activity_profiles add constraint activity_profiles_user_id_users_fkey foreign key (user_id) references manwon_happiness.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'task_posts_creator_id_users_fkey' and conrelid = 'manwon_happiness.task_posts'::regclass) then
    alter table manwon_happiness.task_posts add constraint task_posts_creator_id_users_fkey foreign key (creator_id) references manwon_happiness.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'task_post_images_uploader_id_users_fkey' and conrelid = 'manwon_happiness.task_post_images'::regclass) then
    alter table manwon_happiness.task_post_images add constraint task_post_images_uploader_id_users_fkey foreign key (uploader_id) references manwon_happiness.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'applications_applicant_id_users_fkey' and conrelid = 'manwon_happiness.applications'::regclass) then
    alter table manwon_happiness.applications add constraint applications_applicant_id_users_fkey foreign key (applicant_id) references manwon_happiness.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'deals_requester_id_users_fkey' and conrelid = 'manwon_happiness.deals'::regclass) then
    alter table manwon_happiness.deals add constraint deals_requester_id_users_fkey foreign key (requester_id) references manwon_happiness.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'deals_helper_id_users_fkey' and conrelid = 'manwon_happiness.deals'::regclass) then
    alter table manwon_happiness.deals add constraint deals_helper_id_users_fkey foreign key (helper_id) references manwon_happiness.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'deals_cancelled_by_users_fkey' and conrelid = 'manwon_happiness.deals'::regclass) then
    alter table manwon_happiness.deals add constraint deals_cancelled_by_users_fkey foreign key (cancelled_by) references manwon_happiness.users(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'conversations_requester_id_users_fkey' and conrelid = 'manwon_happiness.conversations'::regclass) then
    alter table manwon_happiness.conversations add constraint conversations_requester_id_users_fkey foreign key (requester_id) references manwon_happiness.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'conversations_helper_id_users_fkey' and conrelid = 'manwon_happiness.conversations'::regclass) then
    alter table manwon_happiness.conversations add constraint conversations_helper_id_users_fkey foreign key (helper_id) references manwon_happiness.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'messages_sender_id_users_fkey' and conrelid = 'manwon_happiness.messages'::regclass) then
    alter table manwon_happiness.messages add constraint messages_sender_id_users_fkey foreign key (sender_id) references manwon_happiness.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reviews_reviewer_id_users_fkey' and conrelid = 'manwon_happiness.reviews'::regclass) then
    alter table manwon_happiness.reviews add constraint reviews_reviewer_id_users_fkey foreign key (reviewer_id) references manwon_happiness.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reviews_reviewee_id_users_fkey' and conrelid = 'manwon_happiness.reviews'::regclass) then
    alter table manwon_happiness.reviews add constraint reviews_reviewee_id_users_fkey foreign key (reviewee_id) references manwon_happiness.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'favorites_user_id_users_fkey' and conrelid = 'manwon_happiness.favorites'::regclass) then
    alter table manwon_happiness.favorites add constraint favorites_user_id_users_fkey foreign key (user_id) references manwon_happiness.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reports_reporter_id_users_fkey' and conrelid = 'manwon_happiness.reports'::regclass) then
    alter table manwon_happiness.reports add constraint reports_reporter_id_users_fkey foreign key (reporter_id) references manwon_happiness.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reports_target_user_id_users_fkey' and conrelid = 'manwon_happiness.reports'::regclass) then
    alter table manwon_happiness.reports add constraint reports_target_user_id_users_fkey foreign key (target_user_id) references manwon_happiness.users(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'blocks_blocker_id_users_fkey' and conrelid = 'manwon_happiness.blocks'::regclass) then
    alter table manwon_happiness.blocks add constraint blocks_blocker_id_users_fkey foreign key (blocker_id) references manwon_happiness.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'blocks_blocked_user_id_users_fkey' and conrelid = 'manwon_happiness.blocks'::regclass) then
    alter table manwon_happiness.blocks add constraint blocks_blocked_user_id_users_fkey foreign key (blocked_user_id) references manwon_happiness.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'settlements_user_id_users_fkey' and conrelid = 'manwon_happiness.settlements'::regclass) then
    alter table manwon_happiness.settlements add constraint settlements_user_id_users_fkey foreign key (user_id) references manwon_happiness.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'notification_events_user_id_users_fkey' and conrelid = 'manwon_happiness.notification_events'::regclass) then
    alter table manwon_happiness.notification_events add constraint notification_events_user_id_users_fkey foreign key (user_id) references manwon_happiness.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_service_regions_user_id_users_fkey' and conrelid = 'manwon_happiness.user_service_regions'::regclass) then
    alter table manwon_happiness.user_service_regions add constraint user_service_regions_user_id_users_fkey foreign key (user_id) references manwon_happiness.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'device_push_tokens_user_id_users_fkey' and conrelid = 'manwon_happiness.device_push_tokens'::regclass) then
    alter table manwon_happiness.device_push_tokens add constraint device_push_tokens_user_id_users_fkey foreign key (user_id) references manwon_happiness.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'review_reminders_user_id_users_fkey' and conrelid = 'manwon_happiness.review_reminders'::regclass) then
    alter table manwon_happiness.review_reminders add constraint review_reminders_user_id_users_fkey foreign key (user_id) references manwon_happiness.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'phone_otps_user_id_users_fkey' and conrelid = 'manwon_happiness.phone_otps'::regclass) then
    alter table manwon_happiness.phone_otps add constraint phone_otps_user_id_users_fkey foreign key (user_id) references manwon_happiness.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'phone_otps_signup_draft_id_fkey' and conrelid = 'manwon_happiness.phone_otps'::regclass) then
    alter table manwon_happiness.phone_otps add constraint phone_otps_signup_draft_id_fkey foreign key (signup_draft_id) references manwon_happiness.signup_drafts(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'phone_otps_owner_check' and conrelid = 'manwon_happiness.phone_otps'::regclass) then
    alter table manwon_happiness.phone_otps add constraint phone_otps_owner_check check (user_id is not null or signup_draft_id is not null);
  end if;
end $$;

alter table manwon_happiness.users enable row level security;
alter table manwon_happiness.signup_drafts enable row level security;

grant select, update on manwon_happiness.users to authenticated;
grant select, insert, update, delete on manwon_happiness.signup_drafts to authenticated;

drop policy if exists "users own read" on manwon_happiness.users;
create policy "users own read" on manwon_happiness.users
for select to authenticated using (id = auth.uid());

drop policy if exists "users own update" on manwon_happiness.users;
create policy "users own update" on manwon_happiness.users
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "signup drafts no client access" on manwon_happiness.signup_drafts;
create policy "signup drafts no client access" on manwon_happiness.signup_drafts
for all to authenticated using (false) with check (false);

drop table if exists manwon_happiness.profiles;
