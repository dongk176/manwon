create table if not exists manwon_happiness.conversation_read_states (
  conversation_id uuid not null references manwon_happiness.conversations(id) on delete cascade,
  user_id uuid not null references manwon_happiness.users(id) on delete cascade,
  last_read_message_id uuid references manwon_happiness.messages(id) on delete set null,
  last_read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists conversation_read_states_user_idx
  on manwon_happiness.conversation_read_states (user_id, updated_at desc);

create index if not exists conversation_read_states_message_idx
  on manwon_happiness.conversation_read_states (last_read_message_id)
  where last_read_message_id is not null;

insert into manwon_happiness.conversation_read_states (
  conversation_id,
  user_id,
  last_read_message_id,
  last_read_at,
  created_at,
  updated_at
)
select
  c.id,
  participant.user_id,
  last_read_message.id,
  coalesce(last_read_message.read_at, now()),
  now(),
  now()
from manwon_happiness.conversations c
cross join lateral (
  values (c.requester_id), (c.helper_id)
) participant(user_id)
join lateral (
  select m.id, m.read_at
  from manwon_happiness.messages m
  where m.conversation_id = c.id
    and m.sender_id <> participant.user_id
    and m.read_at is not null
  order by m.created_at desc, m.id desc
  limit 1
) last_read_message on true
on conflict (conversation_id, user_id) do update
set last_read_message_id = excluded.last_read_message_id,
    last_read_at = excluded.last_read_at,
    updated_at = now();

alter table manwon_happiness.conversation_read_states enable row level security;

drop policy if exists "conversation read states participants read" on manwon_happiness.conversation_read_states;
create policy "conversation read states participants read" on manwon_happiness.conversation_read_states
  for select using (
    exists (
      select 1
      from manwon_happiness.conversations c
      where c.id = conversation_read_states.conversation_id
        and (c.requester_id = auth.uid() or c.helper_id = auth.uid())
    )
  );

drop policy if exists "conversation read states owner upsert" on manwon_happiness.conversation_read_states;
create policy "conversation read states owner upsert" on manwon_happiness.conversation_read_states
  for all using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from manwon_happiness.conversations c
      where c.id = conversation_read_states.conversation_id
        and (c.requester_id = auth.uid() or c.helper_id = auth.uid())
    )
  );

create or replace function manwon_happiness.broadcast_conversation_read_state_change()
returns trigger
language plpgsql
security definer
set search_path = public, manwon_happiness
as $$
declare
  topic text;
begin
  topic := 'conversation:' || coalesce(new.conversation_id, old.conversation_id)::text;

  if to_regprocedure('realtime.broadcast_changes(text,text,text,text,text,record,record)') is not null then
    execute
      'select realtime.broadcast_changes($1, $2, $3, $4, $5, $6, $7)'
      using topic, tg_op, tg_op, tg_table_name, tg_table_schema, new, old;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists conversation_read_states_realtime_broadcast on manwon_happiness.conversation_read_states;
create trigger conversation_read_states_realtime_broadcast
after insert or update on manwon_happiness.conversation_read_states
for each row
execute function manwon_happiness.broadcast_conversation_read_state_change();
