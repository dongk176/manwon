alter table manwon_happiness.messages
  add column if not exists client_message_id uuid,
  add column if not exists delivered_at timestamptz;

alter table manwon_happiness.reports
  add column if not exists conversation_id uuid references manwon_happiness.conversations(id) on delete set null;

create unique index if not exists messages_conversation_client_message_idx
  on manwon_happiness.messages (conversation_id, client_message_id)
  where client_message_id is not null;

create index if not exists messages_conversation_created_id_idx
  on manwon_happiness.messages (conversation_id, created_at, id);

create index if not exists messages_unread_idx
  on manwon_happiness.messages (conversation_id, sender_id, read_at)
  where read_at is null;

create index if not exists conversations_requester_updated_idx
  on manwon_happiness.conversations (requester_id, last_message_at desc, created_at desc);

create index if not exists conversations_helper_updated_idx
  on manwon_happiness.conversations (helper_id, last_message_at desc, created_at desc);

create index if not exists reports_conversation_idx
  on manwon_happiness.reports (conversation_id, created_at desc)
  where conversation_id is not null;

create or replace function manwon_happiness.broadcast_message_change()
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

drop trigger if exists messages_realtime_broadcast on manwon_happiness.messages;
create trigger messages_realtime_broadcast
after insert or update on manwon_happiness.messages
for each row
execute function manwon_happiness.broadcast_message_change();

create or replace function manwon_happiness.broadcast_conversation_change()
returns trigger
language plpgsql
security definer
set search_path = public, manwon_happiness
as $$
begin
  if to_regprocedure('realtime.broadcast_changes(text,text,text,text,text,record,record)') is not null then
    execute
      'select realtime.broadcast_changes($1, $2, $3, $4, $5, $6, $7)'
      using 'user:' || new.requester_id::text || ':conversations', tg_op, tg_op, tg_table_name, tg_table_schema, new, old;

    if new.helper_id <> new.requester_id then
      execute
        'select realtime.broadcast_changes($1, $2, $3, $4, $5, $6, $7)'
        using 'user:' || new.helper_id::text || ':conversations', tg_op, tg_op, tg_table_name, tg_table_schema, new, old;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists conversations_realtime_broadcast on manwon_happiness.conversations;
create trigger conversations_realtime_broadcast
after insert or update on manwon_happiness.conversations
for each row
execute function manwon_happiness.broadcast_conversation_change();

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'realtime'
      and table_name = 'messages'
  ) then
    execute 'alter table realtime.messages enable row level security';
    execute 'grant select on realtime.messages to authenticated';
    execute 'drop policy if exists "manwon chat realtime read" on realtime.messages';
    execute $policy$
      create policy "manwon chat realtime read"
      on realtime.messages
      for select
      to authenticated
      using (
        realtime.topic() = ('user:' || auth.uid()::text || ':conversations')
        or exists (
          select 1
          from manwon_happiness.conversations c
          where realtime.topic() = ('conversation:' || c.id::text)
            and (c.requester_id = auth.uid() or c.helper_id = auth.uid())
        )
      )
    $policy$;
  end if;
end;
$$;
