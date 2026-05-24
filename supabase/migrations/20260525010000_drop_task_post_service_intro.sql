-- 해줄게요 등록/상세에서 제거한 서비스 한 줄 소개 컬럼 삭제
alter table manwon_happiness.task_posts
  drop column if exists service_intro;
