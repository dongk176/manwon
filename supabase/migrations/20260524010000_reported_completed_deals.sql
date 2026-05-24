alter table manwon_happiness.deals
  add column if not exists reported_at timestamptz,
  add column if not exists reported_by uuid references manwon_happiness.users(id) on delete set null,
  add column if not exists reported_user_id uuid references manwon_happiness.users(id) on delete set null,
  add column if not exists report_reason text,
  add column if not exists report_description text,
  add column if not exists reported_report_id uuid references manwon_happiness.reports(id) on delete set null,
  add column if not exists chat_blocked_at timestamptz;

create index if not exists deals_reported_idx
  on manwon_happiness.deals (reported_at desc)
  where reported_at is not null;

create index if not exists deals_chat_blocked_idx
  on manwon_happiness.deals (chat_blocked_at desc)
  where chat_blocked_at is not null;
