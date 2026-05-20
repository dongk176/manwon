import postgres from 'postgres'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('Missing DATABASE_URL')
  process.exit(1)
}

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.replace(/^--/, '').split('=')
    return [key, value.join('=') || '']
  }),
)

const targetLoginId = args.get('login-id') || 'ehdalsalcls'
const seedTag = '[MY_PAGE_SEED]'
const seedLoginPrefix = 'my-page-seed:'
const sql = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  idle_timeout: 5,
  connect_timeout: 10,
})

function daysFromNow(days, hour = 9) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(hour, 0, 0, 0)
  return date
}

async function findTargetProfile() {
  const [byLoginId] = await sql`
    select id, login_id, nickname
    from manwon_happiness.profiles
    where login_id = ${targetLoginId}
      and withdrawn_at is null
    limit 1
  `
  if (byLoginId) return byLoginId

  const [recentProfile] = await sql`
    select id, login_id, nickname
    from manwon_happiness.profiles
    where withdrawn_at is null
    order by last_login_at desc nulls last, created_at desc
    limit 1
  `
  return recentProfile
}

async function createSeedProfile(db, key, nickname) {
  const [profile] = await db`
    insert into manwon_happiness.profiles (
      nickname,
      display_name,
      login_id,
      phone_verified,
      phone_verified_at,
      rating_avg,
      review_count,
      completed_count
    )
    values (
      ${nickname},
      ${nickname},
      ${`${seedLoginPrefix}${key}`},
      true,
      now(),
      4.9,
      1,
      1
    )
    on conflict (login_id) where login_id is not null do update
      set nickname = excluded.nickname,
          display_name = excluded.display_name,
          phone_verified = true,
          phone_verified_at = now(),
          withdrawn_at = null,
          is_blocked = false,
          updated_at = now()
    returning id
  `
  return profile.id
}

async function createSeedPost(db, input) {
  const [post] = await db`
    insert into manwon_happiness.task_posts (
      creator_id,
      post_type,
      title,
      category,
      description,
      mode,
      price,
      deadline_at,
      deadline_text,
      available_time_text,
      gender_visibility,
      status,
      address_text,
      region_1depth,
      region_2depth,
      region_3depth,
      location_source,
      latitude,
      longitude,
      distance_visible
    )
    values (
      ${input.creatorId},
      ${input.postType},
      ${input.title},
      ${input.category},
      ${`${seedTag} ${input.description}`},
      ${input.mode},
      ${input.price},
      ${input.deadlineAt},
      ${input.deadlineText},
      ${input.availableTimeText},
      'private',
      ${input.status},
      ${input.addressText},
      '서울',
      ${input.region2Depth},
      ${input.region3Depth},
      'manual',
      37.5637,
      126.9084,
      true
    )
    returning id
  `
  return post.id
}

async function clearPreviousSeed(db, targetUserId) {
  await db`
    delete from manwon_happiness.reports
    where reporter_id = ${targetUserId}
      and (
        target_user_id in (
          select id from manwon_happiness.profiles where login_id like ${`${seedLoginPrefix}%`}
        )
        or post_id in (
          select id from manwon_happiness.task_posts where description like ${`%${seedTag}%`}
        )
      )
  `
  await db`
    delete from manwon_happiness.task_posts
    where description like ${`%${seedTag}%`}
  `
  await db`
    delete from manwon_happiness.profiles
    where login_id like ${`${seedLoginPrefix}%`}
  `
}

try {
  const target = await findTargetProfile()
  if (!target) throw new Error('시드 대상 프로필을 찾지 못했습니다. 먼저 로그인/회원가입을 완료해주세요.')

  await sql.begin(async (tx) => {
    await clearPreviousSeed(tx, target.id)

    const requesterId = await createSeedProfile(tx, 'requester', '김민지')
    const favoriteOwnerId = await createSeedProfile(tx, 'favorite-owner', '박정훈')
    const blockedUserId = await createSeedProfile(tx, 'blocked-user', '최민수')
    const reportTargetId = await createSeedProfile(tx, 'report-target', '이서연')

    await createSeedPost(tx, {
      creatorId: target.id,
      postType: 'request',
      title: '편의점에서 감기약 사다주실 분',
      category: '동네 심부름',
      description: '내 부탁 화면 확인용 실제 데이터',
      mode: 'nearby',
      price: 10000,
      deadlineAt: daysFromNow(1, 18),
      deadlineText: '내일 오후 6시까지',
      availableTimeText: null,
      status: 'open',
      addressText: '서울 마포구 성산동',
      region2Depth: '마포구',
      region3Depth: '성산동',
    })

    const helpedPostId = await createSeedPost(tx, {
      creatorId: requesterId,
      postType: 'request',
      title: 'PPT 3장 정리 부탁드려요',
      category: '문서·자료',
      description: '내가 해준 일과 수익 화면 확인용 실제 데이터',
      mode: 'online',
      price: 15000,
      deadlineAt: daysFromNow(-1, 18),
      deadlineText: '완료된 거래',
      availableTimeText: '온라인 협의',
      status: 'completed',
      addressText: '온라인',
      region2Depth: null,
      region3Depth: null,
    })

    const [application] = await tx`
      insert into manwon_happiness.applications (post_id, applicant_id, message, status)
      values (${helpedPostId}, ${target.id}, '자료 정리 도와드릴게요.', 'accepted')
      returning id
    `
    const [deal] = await tx`
      insert into manwon_happiness.deals (
        post_id,
        requester_id,
        helper_id,
        application_id,
        price,
        status,
        accepted_at,
        started_at,
        complete_requested_at,
        completed_at
      )
      values (
        ${helpedPostId},
        ${requesterId},
        ${target.id},
        ${application.id},
        15000,
        'completed',
        now() - interval '2 days',
        now() - interval '2 days',
        now() - interval '1 day',
        now()
      )
      returning id
    `
    await tx`
      insert into manwon_happiness.reviews (deal_id, reviewer_id, reviewee_id, rating, content)
      values (${deal.id}, ${requesterId}, ${target.id}, 5, '전달드린 내용 그대로 깔끔하게 정리해주셨어요. 정말 빠르고 만족합니다.')
    `

    const favoritePostId = await createSeedPost(tx, {
      creatorId: favoriteOwnerId,
      postType: 'request',
      title: '강아지 산책 20분 부탁',
      category: '반려동물',
      description: '찜한 부탁 화면 확인용 실제 데이터',
      mode: 'nearby',
      price: 8000,
      deadlineAt: daysFromNow(2, 9),
      deadlineText: '모레 오전 9시',
      availableTimeText: null,
      status: 'open',
      addressText: '서울 마포구 연남동',
      region2Depth: '마포구',
      region3Depth: '연남동',
    })
    await tx`
      insert into manwon_happiness.favorites (user_id, post_id)
      values (${target.id}, ${favoritePostId})
      on conflict (user_id, post_id) do nothing
    `

    const reportedPostId = await createSeedPost(tx, {
      creatorId: reportTargetId,
      postType: 'request',
      title: '거래 조건이 다른 부탁글',
      category: '기타',
      description: '신고 내역 화면 확인용 실제 데이터',
      mode: 'nearby',
      price: 12000,
      deadlineAt: daysFromNow(3, 15),
      deadlineText: '이번 주 오후 3시',
      availableTimeText: null,
      status: 'open',
      addressText: '서울 마포구 합정동',
      region2Depth: '마포구',
      region3Depth: '합정동',
    })
    await tx`
      insert into manwon_happiness.reports (reporter_id, target_user_id, post_id, reason, description, status)
      values (${target.id}, ${reportTargetId}, ${reportedPostId}, '허위 정보', '거래 조건이 실제와 달랐어요.', 'pending')
    `

    await tx`
      insert into manwon_happiness.blocks (blocker_id, blocked_user_id)
      values (${target.id}, ${blockedUserId})
      on conflict (blocker_id, blocked_user_id) do nothing
    `
  })

  console.log(
    JSON.stringify(
      {
        ok: true,
        targetUserId: target.id,
        targetLoginId: target.login_id,
        seeded: ['myPosts', 'helpedDeals', 'favorites', 'receivedReviews', 'reports', 'blocks', 'settlementRevenue'],
      },
      null,
      2,
    ),
  )
} catch (error) {
  console.error(JSON.stringify({ ok: false, message: error instanceof Error ? error.message : String(error) }, null, 2))
  process.exitCode = 1
} finally {
  await sql.end({ timeout: 5 })
}
