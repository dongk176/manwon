do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'manwon_happiness'
      and t.typname = 'gender_type'
  ) then
    create type manwon_happiness.gender_type as enum ('male', 'female', 'unknown', 'private');
  end if;
end $$;

alter table manwon_happiness.profiles
  add column if not exists gender manwon_happiness.gender_type not null default 'unknown';
