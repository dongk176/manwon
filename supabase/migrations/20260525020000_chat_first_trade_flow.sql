alter table manwon_happiness.deals
  add column if not exists appointment_mode text,
  add column if not exists appointment_scheduled_at timestamptz,
  add column if not exists appointment_location_text text,
  add column if not exists appointment_created_by uuid references manwon_happiness.users(id) on delete set null,
  add column if not exists appointment_updated_by uuid references manwon_happiness.users(id) on delete set null,
  add column if not exists appointment_set_at timestamptz,
  add column if not exists appointment_before_notified_at timestamptz,
  add column if not exists appointment_review_prompt_notified_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'deals_appointment_mode_check'
      and conrelid = 'manwon_happiness.deals'::regclass
  ) then
    alter table manwon_happiness.deals
      add constraint deals_appointment_mode_check
      check (appointment_mode is null or appointment_mode in ('online', 'in_person'));
  end if;
end $$;

with candidates as (
  select
    c.id as conversation_id,
    c.post_id,
    c.requester_id,
    c.helper_id,
    c.recruitment_round,
    p.price,
    p.post_type,
    p.creator_profile_id,
    a.id as application_id,
    a.applicant_profile_id,
    case
      when p.post_type = 'request' then p.creator_profile_id
      when p.post_type = 'offer' then a.applicant_profile_id
      else null
    end as requester_profile_id,
    case
      when p.post_type = 'request' then a.applicant_profile_id
      when p.post_type = 'offer' then p.creator_profile_id
      else null
    end as helper_profile_id,
    coalesce(c.created_at, now()) as accepted_at
  from manwon_happiness.conversations c
  join manwon_happiness.task_posts p on p.id = c.post_id
  left join manwon_happiness.applications a on a.post_id = c.post_id
    and a.recruitment_round = c.recruitment_round
    and (
      (p.post_type = 'request' and a.applicant_id = c.helper_id)
      or (p.post_type = 'offer' and a.applicant_id = c.requester_id)
    )
  where c.deal_id is null
    and c.post_id is not null
),
inserted as (
  insert into manwon_happiness.deals (
    post_id,
    requester_id,
    helper_id,
    requester_profile_id,
    helper_profile_id,
    application_id,
    price,
    status,
    accepted_at,
    recruitment_round
  )
  select
    post_id,
    requester_id,
    helper_id,
    requester_profile_id,
    helper_profile_id,
    application_id,
    price,
    'accepted',
    accepted_at,
    recruitment_round
  from candidates
  where requester_profile_id is not null
    and helper_profile_id is not null
  returning id, post_id, requester_id, helper_id, recruitment_round
)
update manwon_happiness.conversations c
set deal_id = inserted.id,
    updated_at = now()
from inserted
where c.deal_id is null
  and c.post_id = inserted.post_id
  and c.requester_id = inserted.requester_id
  and c.helper_id = inserted.helper_id
  and c.recruitment_round = inserted.recruitment_round;

update manwon_happiness.applications a
set status = 'accepted',
    updated_at = now()
from manwon_happiness.conversations c
join manwon_happiness.task_posts p on p.id = c.post_id
where a.post_id = c.post_id
  and a.recruitment_round = c.recruitment_round
  and a.status = 'applied'
  and (
    (p.post_type = 'request' and a.applicant_id = c.helper_id)
    or (p.post_type = 'offer' and a.applicant_id = c.requester_id)
  );

update manwon_happiness.review_reminders
set cancelled_at = coalesce(cancelled_at, now()),
    updated_at = now()
where cancelled_at is null;

create index if not exists deals_appointment_due_idx
  on manwon_happiness.deals (appointment_scheduled_at, appointment_before_notified_at, appointment_review_prompt_notified_at)
  where appointment_scheduled_at is not null;

create index if not exists deals_appointment_mode_idx
  on manwon_happiness.deals (appointment_mode)
  where appointment_mode is not null;
