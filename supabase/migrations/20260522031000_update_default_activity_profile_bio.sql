begin;

set local search_path = manwon_happiness, public;

update manwon_happiness.activity_profiles
set
  bio = '안녕하세요 잘 부탁드려요',
  updated_at = now()
where bio = '가까운 이웃이 안심하고 부탁할 수 있도록 도와드려요.';

commit;
