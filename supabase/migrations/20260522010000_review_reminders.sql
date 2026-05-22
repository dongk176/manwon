create table if not exists manwon_happiness.review_reminders (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references manwon_happiness.deals(id) on delete cascade,
  user_id uuid not null references manwon_happiness.profiles(id) on delete cascade,
  due_at timestamptz not null,
  sent_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (deal_id, user_id)
);

create index if not exists review_reminders_due_idx
  on manwon_happiness.review_reminders (due_at, sent_at, cancelled_at);

drop trigger if exists review_reminders_set_updated_at on manwon_happiness.review_reminders;
create trigger review_reminders_set_updated_at
before update on manwon_happiness.review_reminders
for each row execute function manwon_happiness.set_updated_at();

alter table manwon_happiness.review_reminders enable row level security;

grant select, insert, update on manwon_happiness.review_reminders to authenticated;

drop policy if exists "review reminders own read" on manwon_happiness.review_reminders;
create policy "review reminders own read" on manwon_happiness.review_reminders
for select to authenticated using (user_id = auth.uid());

drop policy if exists "review reminders own insert" on manwon_happiness.review_reminders;
create policy "review reminders own insert" on manwon_happiness.review_reminders
for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "review reminders own update" on manwon_happiness.review_reminders;
create policy "review reminders own update" on manwon_happiness.review_reminders
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
