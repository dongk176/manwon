begin;

set local search_path = manwon_happiness, public;

alter table manwon_happiness.activity_profiles
  drop column if exists main_categories,
  drop column if exists sub_categories;

commit;
