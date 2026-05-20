-- 등록 UX 개편에 필요한 선택 옵션/신뢰 정보 필드
alter table manwon_happiness.task_posts
  add column if not exists receipt_required boolean not null default false,
  add column if not exists photo_proof_required boolean not null default false,
  add column if not exists location_visibility text not null default 'rough',
  add column if not exists service_intro text,
  add column if not exists experience_summary text,
  add column if not exists portfolio_url text,
  add column if not exists response_time_text text,
  add column if not exists trust_example_images jsonb not null default '[]'::jsonb;

alter table manwon_happiness.profiles
  add column if not exists trust_experience_summary text,
  add column if not exists trust_portfolio_url text,
  add column if not exists trust_response_time_text text,
  add column if not exists trust_gender_visibility manwon_happiness.gender_visibility not null default 'private',
  add column if not exists trust_example_images jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'task_posts_location_visibility_check'
      and conrelid = 'manwon_happiness.task_posts'::regclass
  ) then
    alter table manwon_happiness.task_posts
      add constraint task_posts_location_visibility_check
      check (location_visibility in ('hidden', 'rough', 'exact'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'task_posts_trust_example_images_array_check'
      and conrelid = 'manwon_happiness.task_posts'::regclass
  ) then
    alter table manwon_happiness.task_posts
      add constraint task_posts_trust_example_images_array_check
      check (jsonb_typeof(trust_example_images) = 'array');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_trust_example_images_array_check'
      and conrelid = 'manwon_happiness.profiles'::regclass
  ) then
    alter table manwon_happiness.profiles
      add constraint profiles_trust_example_images_array_check
      check (jsonb_typeof(trust_example_images) = 'array');
  end if;
end $$;
