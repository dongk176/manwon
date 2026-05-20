alter table manwon_happiness.task_posts
  add column if not exists deadline_text text,
  add column if not exists service_scope jsonb not null default '[]'::jsonb,
  add column if not exists career_summary text,
  add column if not exists portfolio_links jsonb not null default '[]'::jsonb,
  add column if not exists work_sample_images jsonb not null default '[]'::jsonb,
  add column if not exists response_time text;

alter table manwon_happiness.profiles
  add column if not exists trust_career_summary text,
  add column if not exists trust_portfolio_links jsonb not null default '[]'::jsonb,
  add column if not exists trust_work_sample_images jsonb not null default '[]'::jsonb,
  add column if not exists trust_response_time text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'task_posts_service_scope_array_check'
      and connamespace = 'manwon_happiness'::regnamespace
  ) then
    alter table manwon_happiness.task_posts
      add constraint task_posts_service_scope_array_check
      check (jsonb_typeof(service_scope) = 'array');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'task_posts_portfolio_links_array_check'
      and connamespace = 'manwon_happiness'::regnamespace
  ) then
    alter table manwon_happiness.task_posts
      add constraint task_posts_portfolio_links_array_check
      check (jsonb_typeof(portfolio_links) = 'array');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'task_posts_work_sample_images_array_check'
      and connamespace = 'manwon_happiness'::regnamespace
  ) then
    alter table manwon_happiness.task_posts
      add constraint task_posts_work_sample_images_array_check
      check (jsonb_typeof(work_sample_images) = 'array');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_trust_portfolio_links_array_check'
      and connamespace = 'manwon_happiness'::regnamespace
  ) then
    alter table manwon_happiness.profiles
      add constraint profiles_trust_portfolio_links_array_check
      check (jsonb_typeof(trust_portfolio_links) = 'array');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_trust_work_sample_images_array_check'
      and connamespace = 'manwon_happiness'::regnamespace
  ) then
    alter table manwon_happiness.profiles
      add constraint profiles_trust_work_sample_images_array_check
      check (jsonb_typeof(trust_work_sample_images) = 'array');
  end if;
end $$;
