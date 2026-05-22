alter table manwon_happiness.users
  add column if not exists profile_onboarding_completed boolean not null default false,
  add column if not exists profile_onboarding_completed_at timestamptz;

update manwon_happiness.users u
set profile_onboarding_completed = true,
    profile_onboarding_completed_at = coalesce(u.profile_onboarding_completed_at, now()),
    updated_at = now()
where u.profile_onboarding_completed = false
  and exists (
    select 1
    from manwon_happiness.activity_profiles ap
    where ap.user_id = u.id
      and ap.is_active = true
  );
