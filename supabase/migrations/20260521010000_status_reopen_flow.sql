alter table manwon_happiness.task_posts
  add column if not exists recruitment_round integer not null default 1 check (recruitment_round >= 1);

alter table manwon_happiness.applications
  add column if not exists recruitment_round integer not null default 1 check (recruitment_round >= 1);

alter table manwon_happiness.conversations
  add column if not exists recruitment_round integer not null default 1 check (recruitment_round >= 1);

alter table manwon_happiness.deals
  add column if not exists recruitment_round integer not null default 1 check (recruitment_round >= 1),
  add column if not exists cancelled_by uuid references manwon_happiness.profiles(id) on delete set null;

update manwon_happiness.applications a
set recruitment_round = p.recruitment_round
from manwon_happiness.task_posts p
where a.post_id = p.id
  and a.recruitment_round is distinct from p.recruitment_round;

update manwon_happiness.conversations c
set recruitment_round = coalesce(
  (select d.recruitment_round from manwon_happiness.deals d where d.id = c.deal_id),
  (select p.recruitment_round from manwon_happiness.task_posts p where p.id = c.post_id),
  c.recruitment_round
)
where c.deal_id is not null or c.post_id is not null;

update manwon_happiness.deals d
set recruitment_round = p.recruitment_round
from manwon_happiness.task_posts p
where d.post_id = p.id
  and d.recruitment_round is distinct from p.recruitment_round;

alter table manwon_happiness.applications
  drop constraint if exists applications_post_id_applicant_id_key;

drop index if exists manwon_happiness.conversations_unique_post_pair_idx;
drop index if exists manwon_happiness.conversations_post_pair_idx;

create unique index if not exists applications_post_applicant_round_idx
  on manwon_happiness.applications (post_id, applicant_id, recruitment_round);

create unique index if not exists conversations_unique_post_pair_round_idx
  on manwon_happiness.conversations (post_id, requester_id, helper_id, recruitment_round)
  where deal_id is null and post_id is not null;

create index if not exists conversations_post_pair_round_idx
  on manwon_happiness.conversations (post_id, requester_id, helper_id, recruitment_round);

create index if not exists deals_cancelled_by_idx
  on manwon_happiness.deals (cancelled_by, cancelled_at desc)
  where cancelled_by is not null;
