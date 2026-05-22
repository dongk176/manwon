-- 뭐든해줌/만원의행복 전용 스키마 MVP 플로우 보강
create unique index if not exists conversations_unique_deal_idx
  on manwon_happiness.conversations (deal_id)
  where deal_id is not null;

create unique index if not exists conversations_unique_post_pair_idx
  on manwon_happiness.conversations (post_id, requester_id, helper_id)
  where deal_id is null and post_id is not null;

create index if not exists conversations_post_pair_idx
  on manwon_happiness.conversations (post_id, requester_id, helper_id);

create index if not exists reports_reporter_idx
  on manwon_happiness.reports (reporter_id, created_at desc);
