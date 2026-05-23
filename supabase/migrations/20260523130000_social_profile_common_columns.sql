update manwon_happiness.users
set nickname = coalesce(nullif(nickname, ''), nullif(kakao_nickname, ''), nullif(kakao_name, ''), nullif(apple_full_name, '')),
    display_name = coalesce(nullif(display_name, ''), nullif(kakao_name, ''), nullif(apple_full_name, ''), nullif(kakao_nickname, '')),
    avatar_url = coalesce(nullif(avatar_url, ''), nullif(kakao_avatar_url, '')),
    gender = case
      when gender::text = 'unknown' and kakao_gender in ('male', 'female') then kakao_gender::manwon_happiness.gender_type
      else gender
    end,
    birth_date = coalesce(
      birth_date,
      case
        when kakao_birthyear ~ '^[0-9]{4}$'
          and kakao_birthday ~ '^[0-9]{4}$'
          and to_char(to_date(kakao_birthyear || kakao_birthday, 'YYYYMMDD'), 'YYYYMMDD') = kakao_birthyear || kakao_birthday
        then to_date(kakao_birthyear || kakao_birthday, 'YYYYMMDD')
        else null
      end
    ),
    updated_at = now()
where kakao_nickname is not null
   or kakao_avatar_url is not null
   or kakao_name is not null
   or kakao_gender is not null
   or kakao_birthday is not null
   or kakao_birthyear is not null
   or apple_full_name is not null;

with phone_candidates as (
  select u.id, u.kakao_phone_number
  from manwon_happiness.users u
  where u.phone is null
    and u.kakao_phone_number ~ '^01[016789][0-9]{7,8}$'
    and not exists (
      select 1
      from manwon_happiness.users other
      where other.id <> u.id
        and other.phone = u.kakao_phone_number
        and other.withdrawn_at is null
    )
)
update manwon_happiness.users u
set phone = phone_candidates.kakao_phone_number,
    phone_verified = true,
    phone_verified_at = coalesce(u.phone_verified_at, now()),
    updated_at = now()
from phone_candidates
where u.id = phone_candidates.id;

drop index if exists manwon_happiness.users_kakao_phone_number_idx;

alter table manwon_happiness.users
  drop column if exists kakao_nickname,
  drop column if exists kakao_avatar_url,
  drop column if exists kakao_name,
  drop column if exists kakao_gender,
  drop column if exists kakao_birthday,
  drop column if exists kakao_birthyear,
  drop column if exists kakao_phone_number,
  drop column if exists apple_full_name;
