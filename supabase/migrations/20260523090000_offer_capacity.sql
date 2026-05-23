alter type manwon_happiness.task_post_status add value if not exists 'closed';

alter table manwon_happiness.task_posts
  add column if not exists capacity_type text not null default 'unlimited',
  add column if not exists capacity_limit integer,
  add column if not exists closed_reason text;

alter table manwon_happiness.task_posts
  drop constraint if exists task_posts_capacity_type_check,
  add constraint task_posts_capacity_type_check
    check (capacity_type in ('unlimited', 'limited'));

alter table manwon_happiness.task_posts
  drop constraint if exists task_posts_capacity_limit_check,
  add constraint task_posts_capacity_limit_check
    check (
      (capacity_type = 'unlimited' and capacity_limit is null)
      or (capacity_type = 'limited' and capacity_limit is not null and capacity_limit >= 1)
    );

alter table manwon_happiness.task_posts
  drop constraint if exists task_posts_closed_reason_check,
  add constraint task_posts_closed_reason_check
    check (closed_reason is null or closed_reason in ('capacity_full', 'manual'));

create index if not exists task_posts_capacity_status_idx
  on manwon_happiness.task_posts (post_type, status, capacity_type, created_at desc);

drop policy if exists "task posts public or own read" on manwon_happiness.task_posts;
create policy "task posts public or own read" on manwon_happiness.task_posts
for select using (
  status::text in ('open', 'pending', 'in_progress', 'completed', 'closed')
  or creator_id = auth.uid()
);

drop policy if exists "task post images readable with post" on manwon_happiness.task_post_images;
create policy "task post images readable with post" on manwon_happiness.task_post_images
for select using (
  exists (
    select 1 from manwon_happiness.task_posts p
    where p.id = post_id
      and (
        p.status::text in ('open', 'pending', 'in_progress', 'completed', 'closed')
        or p.creator_id = auth.uid()
        or uploader_id = auth.uid()
      )
  )
);
