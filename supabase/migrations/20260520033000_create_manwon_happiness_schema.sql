-- 뭐든해줌/만원의행복 전용 스키마
create schema if not exists manwon_happiness;
create extension if not exists pgcrypto;

create or replace function manwon_happiness.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'manwon_happiness' and t.typname = 'gender_type') then
    create type manwon_happiness.gender_type as enum ('male', 'female', 'unknown', 'private');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'manwon_happiness' and t.typname = 'post_type') then
    create type manwon_happiness.post_type as enum ('request', 'offer');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'manwon_happiness' and t.typname = 'task_mode') then
    create type manwon_happiness.task_mode as enum ('nearby', 'online', 'both');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'manwon_happiness' and t.typname = 'gender_preference') then
    create type manwon_happiness.gender_preference as enum ('any', 'male', 'female');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'manwon_happiness' and t.typname = 'gender_visibility') then
    create type manwon_happiness.gender_visibility as enum ('private', 'male', 'female');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'manwon_happiness' and t.typname = 'task_post_status') then
    create type manwon_happiness.task_post_status as enum ('open', 'pending', 'in_progress', 'completed', 'cancelled', 'hidden');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'manwon_happiness' and t.typname = 'application_status') then
    create type manwon_happiness.application_status as enum ('applied', 'accepted', 'rejected', 'cancelled');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'manwon_happiness' and t.typname = 'deal_status') then
    create type manwon_happiness.deal_status as enum ('pending', 'accepted', 'in_progress', 'complete_requested', 'completed', 'cancelled', 'disputed');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'manwon_happiness' and t.typname = 'message_type') then
    create type manwon_happiness.message_type as enum ('text', 'image', 'system');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'manwon_happiness' and t.typname = 'report_status') then
    create type manwon_happiness.report_status as enum ('pending', 'reviewed', 'resolved', 'rejected');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'manwon_happiness' and t.typname = 'settlement_status') then
    create type manwon_happiness.settlement_status as enum ('requested', 'processing', 'completed', 'rejected');
  end if;
end $$;

create table if not exists manwon_happiness.profiles (
  id uuid primary key default gen_random_uuid(),
  nickname text,
  avatar_url text,
  gender manwon_happiness.gender_type not null default 'unknown',
  phone_verified boolean not null default false,
  identity_verified boolean not null default false,
  gender_verified boolean not null default false,
  rating_avg numeric not null default 0 check (rating_avg >= 0 and rating_avg <= 5),
  review_count integer not null default 0 check (review_count >= 0),
  completed_count integer not null default 0 check (completed_count >= 0),
  is_blocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists manwon_happiness.task_posts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references manwon_happiness.profiles(id) on delete cascade,
  post_type manwon_happiness.post_type not null,
  title text not null check (char_length(title) between 1 and 80),
  category text not null,
  description text not null default '',
  mode manwon_happiness.task_mode not null,
  price integer not null check (price >= 0),
  deadline_at timestamptz,
  available_time_text text,
  gender_preference manwon_happiness.gender_preference not null default 'any',
  gender_visibility manwon_happiness.gender_visibility not null default 'private',
  status manwon_happiness.task_post_status not null default 'open',
  address_text text,
  region_1depth text,
  region_2depth text,
  region_3depth text,
  latitude numeric,
  longitude numeric,
  distance_visible boolean not null default true,
  view_count integer not null default 0 check (view_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_posts_latitude_range check (latitude is null or (latitude >= -90 and latitude <= 90)),
  constraint task_posts_longitude_range check (longitude is null or (longitude >= -180 and longitude <= 180))
);

create table if not exists manwon_happiness.task_post_images (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references manwon_happiness.task_posts(id) on delete cascade,
  uploader_id uuid not null references manwon_happiness.profiles(id) on delete cascade,
  image_url text not null,
  storage_key text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists manwon_happiness.applications (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references manwon_happiness.task_posts(id) on delete cascade,
  applicant_id uuid not null references manwon_happiness.profiles(id) on delete cascade,
  message text,
  status manwon_happiness.application_status not null default 'applied',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, applicant_id)
);

create table if not exists manwon_happiness.deals (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references manwon_happiness.task_posts(id) on delete cascade,
  requester_id uuid not null references manwon_happiness.profiles(id) on delete cascade,
  helper_id uuid not null references manwon_happiness.profiles(id) on delete cascade,
  application_id uuid references manwon_happiness.applications(id) on delete set null,
  price integer not null check (price >= 0),
  status manwon_happiness.deal_status not null default 'pending',
  accepted_at timestamptz,
  started_at timestamptz,
  complete_requested_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists manwon_happiness.conversations (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references manwon_happiness.deals(id) on delete set null,
  post_id uuid references manwon_happiness.task_posts(id) on delete set null,
  requester_id uuid not null references manwon_happiness.profiles(id) on delete cascade,
  helper_id uuid not null references manwon_happiness.profiles(id) on delete cascade,
  last_message text,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists manwon_happiness.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references manwon_happiness.conversations(id) on delete cascade,
  sender_id uuid not null references manwon_happiness.profiles(id) on delete cascade,
  message_type manwon_happiness.message_type not null default 'text',
  body text,
  image_url text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint messages_content_present check (body is not null or image_url is not null or message_type = 'system')
);

create table if not exists manwon_happiness.reviews (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references manwon_happiness.deals(id) on delete cascade,
  reviewer_id uuid not null references manwon_happiness.profiles(id) on delete cascade,
  reviewee_id uuid not null references manwon_happiness.profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  content text,
  created_at timestamptz not null default now(),
  unique (deal_id, reviewer_id)
);

create table if not exists manwon_happiness.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references manwon_happiness.profiles(id) on delete cascade,
  post_id uuid not null references manwon_happiness.task_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, post_id)
);

create table if not exists manwon_happiness.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references manwon_happiness.profiles(id) on delete cascade,
  target_user_id uuid references manwon_happiness.profiles(id) on delete set null,
  post_id uuid references manwon_happiness.task_posts(id) on delete set null,
  message_id uuid references manwon_happiness.messages(id) on delete set null,
  reason text not null,
  description text,
  status manwon_happiness.report_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists manwon_happiness.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references manwon_happiness.profiles(id) on delete cascade,
  blocked_user_id uuid not null references manwon_happiness.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_user_id),
  constraint blocks_no_self_block check (blocker_id <> blocked_user_id)
);

create table if not exists manwon_happiness.settlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references manwon_happiness.profiles(id) on delete cascade,
  amount integer not null check (amount >= 0),
  status manwon_happiness.settlement_status not null default 'requested',
  bank_name text,
  account_holder text,
  account_last4 text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint settlements_account_last4_format check (account_last4 is null or account_last4 ~ '^[0-9]{4}$')
);

create table if not exists manwon_happiness.notification_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references manwon_happiness.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists profiles_is_blocked_idx on manwon_happiness.profiles (is_blocked);
create index if not exists task_posts_public_list_idx on manwon_happiness.task_posts (status, post_type, category, mode, created_at desc);
create index if not exists task_posts_creator_idx on manwon_happiness.task_posts (creator_id, created_at desc);
create index if not exists task_posts_location_idx on manwon_happiness.task_posts (latitude, longitude) where latitude is not null and longitude is not null;
create index if not exists task_posts_price_idx on manwon_happiness.task_posts (price);
create index if not exists task_posts_deadline_idx on manwon_happiness.task_posts (deadline_at);
create index if not exists task_post_images_post_idx on manwon_happiness.task_post_images (post_id, sort_order);
create index if not exists applications_post_idx on manwon_happiness.applications (post_id, status, created_at desc);
create index if not exists applications_applicant_idx on manwon_happiness.applications (applicant_id, created_at desc);
create index if not exists deals_requester_idx on manwon_happiness.deals (requester_id, status, created_at desc);
create index if not exists deals_helper_idx on manwon_happiness.deals (helper_id, status, created_at desc);
create index if not exists conversations_participant_idx on manwon_happiness.conversations (requester_id, helper_id, updated_at desc);
create index if not exists messages_conversation_idx on manwon_happiness.messages (conversation_id, created_at);
create index if not exists reviews_reviewee_idx on manwon_happiness.reviews (reviewee_id, created_at desc);
create index if not exists favorites_user_idx on manwon_happiness.favorites (user_id, created_at desc);
create index if not exists reports_reporter_idx on manwon_happiness.reports (reporter_id, created_at desc);
create index if not exists blocks_blocker_idx on manwon_happiness.blocks (blocker_id, created_at desc);
create index if not exists settlements_user_idx on manwon_happiness.settlements (user_id, status, created_at desc);
create index if not exists notification_events_user_idx on manwon_happiness.notification_events (user_id, read_at, created_at desc);

drop trigger if exists profiles_set_updated_at on manwon_happiness.profiles;
create trigger profiles_set_updated_at before update on manwon_happiness.profiles for each row execute function manwon_happiness.set_updated_at();
drop trigger if exists task_posts_set_updated_at on manwon_happiness.task_posts;
create trigger task_posts_set_updated_at before update on manwon_happiness.task_posts for each row execute function manwon_happiness.set_updated_at();
drop trigger if exists applications_set_updated_at on manwon_happiness.applications;
create trigger applications_set_updated_at before update on manwon_happiness.applications for each row execute function manwon_happiness.set_updated_at();
drop trigger if exists deals_set_updated_at on manwon_happiness.deals;
create trigger deals_set_updated_at before update on manwon_happiness.deals for each row execute function manwon_happiness.set_updated_at();
drop trigger if exists conversations_set_updated_at on manwon_happiness.conversations;
create trigger conversations_set_updated_at before update on manwon_happiness.conversations for each row execute function manwon_happiness.set_updated_at();
drop trigger if exists reports_set_updated_at on manwon_happiness.reports;
create trigger reports_set_updated_at before update on manwon_happiness.reports for each row execute function manwon_happiness.set_updated_at();
drop trigger if exists settlements_set_updated_at on manwon_happiness.settlements;
create trigger settlements_set_updated_at before update on manwon_happiness.settlements for each row execute function manwon_happiness.set_updated_at();

alter table manwon_happiness.profiles enable row level security;
alter table manwon_happiness.task_posts enable row level security;
alter table manwon_happiness.task_post_images enable row level security;
alter table manwon_happiness.applications enable row level security;
alter table manwon_happiness.deals enable row level security;
alter table manwon_happiness.conversations enable row level security;
alter table manwon_happiness.messages enable row level security;
alter table manwon_happiness.reviews enable row level security;
alter table manwon_happiness.favorites enable row level security;
alter table manwon_happiness.reports enable row level security;
alter table manwon_happiness.blocks enable row level security;
alter table manwon_happiness.settlements enable row level security;
alter table manwon_happiness.notification_events enable row level security;

grant usage on schema manwon_happiness to anon, authenticated;
grant select, insert, update, delete on all tables in schema manwon_happiness to authenticated;
grant select on manwon_happiness.profiles, manwon_happiness.task_posts, manwon_happiness.task_post_images, manwon_happiness.reviews to anon;

drop policy if exists "profiles public read" on manwon_happiness.profiles;
create policy "profiles public read" on manwon_happiness.profiles
for select using (is_blocked = false);
drop policy if exists "profiles own insert" on manwon_happiness.profiles;
create policy "profiles own insert" on manwon_happiness.profiles
for insert to authenticated with check (id = auth.uid());
drop policy if exists "profiles own update" on manwon_happiness.profiles;
create policy "profiles own update" on manwon_happiness.profiles
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "task posts public or own read" on manwon_happiness.task_posts;
create policy "task posts public or own read" on manwon_happiness.task_posts
for select using (status = 'open' or creator_id = auth.uid());
drop policy if exists "task posts authenticated insert" on manwon_happiness.task_posts;
create policy "task posts authenticated insert" on manwon_happiness.task_posts
for insert to authenticated with check (creator_id = auth.uid());
drop policy if exists "task posts creator update" on manwon_happiness.task_posts;
create policy "task posts creator update" on manwon_happiness.task_posts
for update to authenticated using (creator_id = auth.uid()) with check (creator_id = auth.uid());
drop policy if exists "task posts creator delete" on manwon_happiness.task_posts;
create policy "task posts creator delete" on manwon_happiness.task_posts
for delete to authenticated using (creator_id = auth.uid());

drop policy if exists "task post images readable with post" on manwon_happiness.task_post_images;
create policy "task post images readable with post" on manwon_happiness.task_post_images
for select using (
  exists (
    select 1 from manwon_happiness.task_posts p
    where p.id = post_id and (p.status = 'open' or p.creator_id = auth.uid() or uploader_id = auth.uid())
  )
);
drop policy if exists "task post images uploader insert" on manwon_happiness.task_post_images;
create policy "task post images uploader insert" on manwon_happiness.task_post_images
for insert to authenticated with check (uploader_id = auth.uid());
drop policy if exists "task post images uploader delete" on manwon_happiness.task_post_images;
create policy "task post images uploader delete" on manwon_happiness.task_post_images
for delete to authenticated using (uploader_id = auth.uid());

drop policy if exists "applications participant read" on manwon_happiness.applications;
create policy "applications participant read" on manwon_happiness.applications
for select to authenticated using (
  applicant_id = auth.uid()
  or exists (select 1 from manwon_happiness.task_posts p where p.id = post_id and p.creator_id = auth.uid())
);
drop policy if exists "applications applicant insert" on manwon_happiness.applications;
create policy "applications applicant insert" on manwon_happiness.applications
for insert to authenticated with check (applicant_id = auth.uid());
drop policy if exists "applications applicant or creator update" on manwon_happiness.applications;
create policy "applications applicant or creator update" on manwon_happiness.applications
for update to authenticated using (
  applicant_id = auth.uid()
  or exists (select 1 from manwon_happiness.task_posts p where p.id = post_id and p.creator_id = auth.uid())
) with check (
  applicant_id = auth.uid()
  or exists (select 1 from manwon_happiness.task_posts p where p.id = post_id and p.creator_id = auth.uid())
);

drop policy if exists "deals participants read" on manwon_happiness.deals;
create policy "deals participants read" on manwon_happiness.deals
for select to authenticated using (requester_id = auth.uid() or helper_id = auth.uid());
drop policy if exists "deals participants insert" on manwon_happiness.deals;
create policy "deals participants insert" on manwon_happiness.deals
for insert to authenticated with check (requester_id = auth.uid() or helper_id = auth.uid());
drop policy if exists "deals participants update" on manwon_happiness.deals;
create policy "deals participants update" on manwon_happiness.deals
for update to authenticated using (requester_id = auth.uid() or helper_id = auth.uid())
with check (requester_id = auth.uid() or helper_id = auth.uid());

drop policy if exists "conversations participants read" on manwon_happiness.conversations;
create policy "conversations participants read" on manwon_happiness.conversations
for select to authenticated using (requester_id = auth.uid() or helper_id = auth.uid());
drop policy if exists "conversations participants insert" on manwon_happiness.conversations;
create policy "conversations participants insert" on manwon_happiness.conversations
for insert to authenticated with check (requester_id = auth.uid() or helper_id = auth.uid());
drop policy if exists "conversations participants update" on manwon_happiness.conversations;
create policy "conversations participants update" on manwon_happiness.conversations
for update to authenticated using (requester_id = auth.uid() or helper_id = auth.uid())
with check (requester_id = auth.uid() or helper_id = auth.uid());

drop policy if exists "messages participants read" on manwon_happiness.messages;
create policy "messages participants read" on manwon_happiness.messages
for select to authenticated using (
  exists (
    select 1 from manwon_happiness.conversations c
    where c.id = conversation_id and (c.requester_id = auth.uid() or c.helper_id = auth.uid())
  )
);
drop policy if exists "messages participants insert" on manwon_happiness.messages;
create policy "messages participants insert" on manwon_happiness.messages
for insert to authenticated with check (
  sender_id = auth.uid()
  and exists (
    select 1 from manwon_happiness.conversations c
    where c.id = conversation_id and (c.requester_id = auth.uid() or c.helper_id = auth.uid())
  )
);
drop policy if exists "messages sender update read at" on manwon_happiness.messages;
create policy "messages sender update read at" on manwon_happiness.messages
for update to authenticated using (
  exists (
    select 1 from manwon_happiness.conversations c
    where c.id = conversation_id and (c.requester_id = auth.uid() or c.helper_id = auth.uid())
  )
);

drop policy if exists "reviews public read" on manwon_happiness.reviews;
create policy "reviews public read" on manwon_happiness.reviews
for select using (true);
drop policy if exists "reviews participant insert" on manwon_happiness.reviews;
create policy "reviews participant insert" on manwon_happiness.reviews
for insert to authenticated with check (
  reviewer_id = auth.uid()
  and exists (
    select 1 from manwon_happiness.deals d
    where d.id = deal_id and d.status = 'completed' and (d.requester_id = auth.uid() or d.helper_id = auth.uid())
  )
);

drop policy if exists "favorites own read" on manwon_happiness.favorites;
create policy "favorites own read" on manwon_happiness.favorites
for select to authenticated using (user_id = auth.uid());
drop policy if exists "favorites own insert" on manwon_happiness.favorites;
create policy "favorites own insert" on manwon_happiness.favorites
for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "favorites own delete" on manwon_happiness.favorites;
create policy "favorites own delete" on manwon_happiness.favorites
for delete to authenticated using (user_id = auth.uid());

drop policy if exists "reports own read" on manwon_happiness.reports;
create policy "reports own read" on manwon_happiness.reports
for select to authenticated using (reporter_id = auth.uid());
drop policy if exists "reports own insert" on manwon_happiness.reports;
create policy "reports own insert" on manwon_happiness.reports
for insert to authenticated with check (reporter_id = auth.uid());
-- TODO: 관리자 검토용 reports update/select 정책은 Supabase role 또는 별도 admin 권한 설계 후 추가합니다.

drop policy if exists "blocks own read" on manwon_happiness.blocks;
create policy "blocks own read" on manwon_happiness.blocks
for select to authenticated using (blocker_id = auth.uid());
drop policy if exists "blocks own insert" on manwon_happiness.blocks;
create policy "blocks own insert" on manwon_happiness.blocks
for insert to authenticated with check (blocker_id = auth.uid());
drop policy if exists "blocks own delete" on manwon_happiness.blocks;
create policy "blocks own delete" on manwon_happiness.blocks
for delete to authenticated using (blocker_id = auth.uid());

drop policy if exists "settlements own read" on manwon_happiness.settlements;
create policy "settlements own read" on manwon_happiness.settlements
for select to authenticated using (user_id = auth.uid());
drop policy if exists "settlements own insert" on manwon_happiness.settlements;
create policy "settlements own insert" on manwon_happiness.settlements
for insert to authenticated with check (user_id = auth.uid());
-- TODO: 실제 정산 처리 update는 관리자/운영자 role 정책을 별도로 추가합니다.

drop policy if exists "notification events own read" on manwon_happiness.notification_events;
create policy "notification events own read" on manwon_happiness.notification_events
for select to authenticated using (user_id = auth.uid());
drop policy if exists "notification events own update" on manwon_happiness.notification_events;
create policy "notification events own update" on manwon_happiness.notification_events
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "notification events own insert" on manwon_happiness.notification_events;
create policy "notification events own insert" on manwon_happiness.notification_events
for insert to authenticated with check (user_id = auth.uid());
