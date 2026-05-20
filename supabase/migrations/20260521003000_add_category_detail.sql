alter table if exists manwon_happiness.task_posts
  add column if not exists category_detail text;

create index if not exists task_posts_category_detail_idx
  on manwon_happiness.task_posts (category, category_detail);
