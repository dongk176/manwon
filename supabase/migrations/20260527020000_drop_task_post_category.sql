drop index if exists manwon_happiness.task_posts_category_detail_idx;
drop index if exists manwon_happiness.task_posts_public_list_idx;

alter table if exists manwon_happiness.task_posts
  drop column if exists category_detail,
  drop column if exists category;

create index if not exists task_posts_public_list_idx
  on manwon_happiness.task_posts (status, post_type, mode, created_at desc);
