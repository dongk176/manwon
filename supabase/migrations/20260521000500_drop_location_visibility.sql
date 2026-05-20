alter table if exists manwon_happiness.task_posts
  drop constraint if exists task_posts_location_visibility_check;

alter table if exists manwon_happiness.task_posts
  drop column if exists location_visibility;
