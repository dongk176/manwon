do $$
declare
  check_constraint record;
begin
  for check_constraint in
    select conname
    from pg_constraint
    where conrelid = 'manwon_happiness.activity_profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%char_length%'
      and pg_get_constraintdef(oid) ilike '%bio%'
  loop
    execute format('alter table manwon_happiness.activity_profiles drop constraint %I', check_constraint.conname);
  end loop;
end $$;

alter table manwon_happiness.activity_profiles
  drop constraint if exists activity_profiles_bio_check,
  drop constraint if exists activity_profiles_bio_length_check;

alter table manwon_happiness.activity_profiles
  add constraint activity_profiles_bio_length_check
  check (char_length(bio) between 1 and 60);
