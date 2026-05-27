create table if not exists manwon_happiness.activity_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references manwon_happiness.profiles(id) on delete cascade,
  avatar_url text,
  default_avatar_key text,
  nickname text not null check (char_length(nickname) between 2 and 12),
  bio text not null check (char_length(bio) between 1 and 60),
  activity_mode manwon_happiness.task_mode not null default 'both',
  address_text text,
  region_1depth text,
  region_2depth text,
  region_3depth text,
  region_code text,
  latitude numeric,
  longitude numeric,
  career_summary text,
  career_description text,
  portfolio_links jsonb not null default '[]'::jsonb,
  work_sample_images jsonb not null default '[]'::jsonb,
  available_time_text text,
  base_price integer check (base_price is null or base_price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activity_profiles_portfolio_links_array_check check (jsonb_typeof(portfolio_links) = 'array'),
  constraint activity_profiles_work_sample_images_array_check check (jsonb_typeof(work_sample_images) = 'array'),
  constraint activity_profiles_latitude_range check (latitude is null or (latitude >= -90 and latitude <= 90)),
  constraint activity_profiles_longitude_range check (longitude is null or (longitude >= -180 and longitude <= 180))
);

create unique index if not exists activity_profiles_active_nickname_idx
  on manwon_happiness.activity_profiles (lower(nickname))
  where is_active;

create index if not exists activity_profiles_user_idx
  on manwon_happiness.activity_profiles (user_id, is_active, created_at desc);

drop trigger if exists activity_profiles_set_updated_at on manwon_happiness.activity_profiles;
create trigger activity_profiles_set_updated_at
before update on manwon_happiness.activity_profiles
for each row execute function manwon_happiness.set_updated_at();

alter table manwon_happiness.activity_profiles enable row level security;

grant select, insert, update on manwon_happiness.activity_profiles to authenticated;
grant select on manwon_happiness.activity_profiles to anon;

drop policy if exists "activity profiles public read" on manwon_happiness.activity_profiles;
create policy "activity profiles public read" on manwon_happiness.activity_profiles
for select using (true);

drop policy if exists "activity profiles own insert" on manwon_happiness.activity_profiles;
create policy "activity profiles own insert" on manwon_happiness.activity_profiles
for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "activity profiles own update" on manwon_happiness.activity_profiles;
create policy "activity profiles own update" on manwon_happiness.activity_profiles
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

with existing as (
  select
    p.*,
    row_number() over (
      partition by lower(coalesce(nullif(trim(p.nickname), ''), '뭐든해줌'))
      order by p.created_at, p.id
    ) as nickname_order
  from manwon_happiness.profiles p
  where not exists (
    select 1
    from manwon_happiness.activity_profiles ap
    where ap.user_id = p.id
  )
),
defaults as (
  select
    id as user_id,
    avatar_url,
    case
      when nickname_order = 1 then left(coalesce(nullif(trim(nickname), ''), '뭐든해줌'), 12)
      else left(coalesce(nullif(trim(nickname), ''), '뭐든해줌'), greatest(2, 12 - char_length(nickname_order::text))) || nickname_order::text
    end as profile_nickname,
    left(coalesce(nullif(trim(trust_career_summary), ''), nullif(trim(trust_experience_summary), ''), '안녕하세요 잘 부탁드려요'), 40) as profile_bio,
    coalesce(default_region_1depth, null) as region_1depth,
    coalesce(default_region_2depth, null) as region_2depth,
    coalesce(default_region_3depth, null) as region_3depth,
    default_latitude as latitude,
    default_longitude as longitude,
    coalesce(trust_career_summary, trust_experience_summary) as career_summary,
    trust_portfolio_links as portfolio_links,
    trust_work_sample_images as work_sample_images,
    coalesce(trust_response_time, trust_response_time_text) as available_time_text
  from existing
)
insert into manwon_happiness.activity_profiles (
  user_id,
  avatar_url,
  default_avatar_key,
  nickname,
  bio,
  activity_mode,
  region_1depth,
  region_2depth,
  region_3depth,
  latitude,
  longitude,
  career_summary,
  portfolio_links,
  work_sample_images,
  available_time_text
)
select
  user_id,
  avatar_url,
  'default-1',
  profile_nickname,
  profile_bio,
  case when region_2depth is null then 'online'::manwon_happiness.task_mode else 'both'::manwon_happiness.task_mode end,
  region_1depth,
  region_2depth,
  region_3depth,
  latitude,
  longitude,
  career_summary,
  coalesce(portfolio_links, '[]'::jsonb),
  coalesce(work_sample_images, '[]'::jsonb),
  available_time_text
from defaults
on conflict do nothing;

alter table manwon_happiness.task_posts
  add column if not exists creator_profile_id uuid references manwon_happiness.activity_profiles(id) on delete set null;

alter table manwon_happiness.applications
  add column if not exists applicant_profile_id uuid references manwon_happiness.activity_profiles(id) on delete set null;

alter table manwon_happiness.deals
  add column if not exists requester_profile_id uuid references manwon_happiness.activity_profiles(id) on delete set null,
  add column if not exists helper_profile_id uuid references manwon_happiness.activity_profiles(id) on delete set null;

alter table manwon_happiness.reviews
  add column if not exists reviewer_profile_id uuid references manwon_happiness.activity_profiles(id) on delete set null,
  add column if not exists reviewee_profile_id uuid references manwon_happiness.activity_profiles(id) on delete set null;

update manwon_happiness.task_posts p
set creator_profile_id = (
  select id
  from manwon_happiness.activity_profiles
  where user_id = p.creator_id
  order by is_active desc, created_at asc
  limit 1
)
where p.creator_profile_id is null
  and exists (
    select 1
    from manwon_happiness.activity_profiles
    where user_id = p.creator_id
  );

update manwon_happiness.applications a
set applicant_profile_id = (
  select id
  from manwon_happiness.activity_profiles
  where user_id = a.applicant_id
  order by is_active desc, created_at asc
  limit 1
)
where a.applicant_profile_id is null
  and exists (
    select 1
    from manwon_happiness.activity_profiles
    where user_id = a.applicant_id
  );

update manwon_happiness.deals d
set requester_profile_id = case
      when p.post_type = 'request' then p.creator_profile_id
      else (
        select applicant_profile_id
        from manwon_happiness.applications
        where id = d.application_id
        limit 1
      )
    end,
    helper_profile_id = case
      when p.post_type = 'request' then (
        select applicant_profile_id
        from manwon_happiness.applications
        where id = d.application_id
        limit 1
      )
      else p.creator_profile_id
    end
from manwon_happiness.task_posts p
where p.id = d.post_id
  and (d.requester_profile_id is null or d.helper_profile_id is null);

update manwon_happiness.deals d
set requester_profile_id = coalesce(d.requester_profile_id, (
      select id
      from manwon_happiness.activity_profiles
      where user_id = d.requester_id
      order by is_active desc, created_at asc
      limit 1
    )),
    helper_profile_id = coalesce(d.helper_profile_id, (
      select id
      from manwon_happiness.activity_profiles
      where user_id = d.helper_id
      order by is_active desc, created_at asc
      limit 1
    ))
where d.requester_profile_id is null or d.helper_profile_id is null;

update manwon_happiness.reviews r
set reviewer_profile_id = case
      when r.reviewer_id = d.requester_id then d.requester_profile_id
      when r.reviewer_id = d.helper_id then d.helper_profile_id
      else r.reviewer_profile_id
    end,
    reviewee_profile_id = case
      when r.reviewee_id = d.requester_id then d.requester_profile_id
      when r.reviewee_id = d.helper_id then d.helper_profile_id
      else r.reviewee_profile_id
    end
from manwon_happiness.deals d
where d.id = r.deal_id
  and (r.reviewer_profile_id is null or r.reviewee_profile_id is null);

create index if not exists task_posts_creator_profile_idx
  on manwon_happiness.task_posts (creator_profile_id);

create index if not exists applications_applicant_profile_idx
  on manwon_happiness.applications (applicant_profile_id);

create index if not exists deals_requester_profile_idx
  on manwon_happiness.deals (requester_profile_id);

create index if not exists deals_helper_profile_idx
  on manwon_happiness.deals (helper_profile_id);

create index if not exists reviews_reviewee_profile_idx
  on manwon_happiness.reviews (reviewee_profile_id, created_at desc);
