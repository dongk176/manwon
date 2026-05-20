alter table if exists manwon_happiness.task_posts
  drop column if exists gender_preference;

drop type if exists manwon_happiness.gender_preference;
