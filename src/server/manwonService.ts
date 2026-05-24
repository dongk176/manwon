import { getSql } from '@/server/db'
import { HttpError } from '@/server/http'
import { createNotificationEvent } from '@/server/notifications'
import { assertPhoneVerified } from '@/server/phoneVerification'
import type {
  activityProfileSchema,
  blockSchema,
  createApplicationSchema,
  createConversationSchema,
  createMessageSchema,
  createReviewSchema,
  createPostSchema,
  favoriteSchema,
  imageRecordSchema,
  listPostsSchema,
  reportSchema,
  supportInquirySchema,
  updateApplicationStatusSchema,
  updateActivityProfileSchema,
  updateDealStatusSchema,
  updatePostSchema,
  reviewReminderSchema,
} from '@/server/validation'
import type postgres from 'postgres'
import type { z } from 'zod'

type ListPostsInput = z.infer<typeof listPostsSchema>
type ActivityProfileInput = z.infer<typeof activityProfileSchema>
type UpdateActivityProfileInput = z.infer<typeof updateActivityProfileSchema>
type CreatePostInput = z.infer<typeof createPostSchema>
type UpdatePostInput = z.infer<typeof updatePostSchema>
type ImageRecordInput = z.infer<typeof imageRecordSchema>
type CreateApplicationInput = z.infer<typeof createApplicationSchema>
type UpdateApplicationStatusInput = z.infer<typeof updateApplicationStatusSchema>
type UpdateDealStatusInput = z.infer<typeof updateDealStatusSchema>
type CreateConversationInput = z.infer<typeof createConversationSchema>
type CreateMessageInput = z.infer<typeof createMessageSchema>
type CreateReviewInput = z.infer<typeof createReviewSchema>
type ReviewReminderInput = z.infer<typeof reviewReminderSchema>
type ReportInput = z.infer<typeof reportSchema>
type SupportInquiryInput = z.infer<typeof supportInquirySchema>
type BlockInput = z.infer<typeof blockSchema>
type FavoriteInput = z.infer<typeof favoriteSchema>
type SqlExecutor = postgres.Sql | postgres.TransactionSql

const schema = 'manwon_happiness'
let dealsCancelledByColumnExists: boolean | null = null
const blockedNicknameParts = ['시발', '씨발', '병신', '좆', '개새', 'fuck', 'admin', '관리자', '운영자']

function normalizeNickname(value: string) {
  return value.trim().replace(/\s+/g, '')
}

function assertActivityProfileNickname(nickname: string) {
  const normalized = normalizeNickname(nickname).toLowerCase()
  if (normalized.length < 2 || normalized.length > 12) {
    throw new HttpError('닉네임은 2~12자로 입력해주세요.', 400)
  }
  if (blockedNicknameParts.some((part) => normalized.includes(part))) {
    throw new HttpError('사용할 수 없는 닉네임입니다.', 400)
  }
}

async function isActivityProfileNicknameTaken(nickname: string, excludeId?: string | null) {
  const sql = getSql()
  const rows = await sql`
    select 1
    from manwon_happiness.activity_profiles
    where is_active = true
      and lower(nickname) = lower(${normalizeNickname(nickname)})
      and (${excludeId ?? null}::uuid is null or id <> ${excludeId ?? null})
    limit 1
  `
  return Boolean(rows[0])
}

async function getDefaultActivityProfileId(userId: string) {
  const sql = getSql()
  const [profile] = await sql`
    select id
    from manwon_happiness.activity_profiles
    where user_id = ${userId}
      and is_active = true
    order by created_at asc
    limit 1
  `
  return profile?.id ? String(profile.id) : null
}

async function assertOwnedActiveActivityProfile(userId: string, profileId: string) {
  const sql = getSql()
  const rows = await sql`
    select *
    from manwon_happiness.activity_profiles
    where id = ${profileId}
      and user_id = ${userId}
      and is_active = true
    limit 1
  `
  if (!rows[0]) throw new HttpError('사용할 수 없는 프로필입니다.', 400)
  return rows[0]
}

function activityProfilePayload(input: ActivityProfileInput | UpdateActivityProfileInput) {
  return {
    avatarUrl: input.avatarUrl ?? null,
    defaultAvatarKey: input.defaultAvatarKey ?? null,
    nickname: input.nickname !== undefined ? normalizeNickname(input.nickname) : undefined,
    bio: input.bio ?? undefined,
    activityMode: input.activityMode,
    addressText: input.addressText ?? null,
    region1Depth: input.region1Depth ?? null,
    region2Depth: input.region2Depth ?? null,
    region3Depth: input.region3Depth ?? null,
    regionCode: input.regionCode ?? null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    careerSummary: input.careerSummary ?? null,
    careerDescription: input.careerDescription ?? null,
    portfolioLinks: jsonArray(input.portfolioLinks),
    workSampleImages: jsonArray(input.workSampleImages),
    availableTimeText: input.availableTimeText ?? null,
    basePrice: input.basePrice ?? null,
  }
}

export async function listActivityProfiles(userId: string) {
  const sql = getSql()
  return sql`
    with default_profile as (
      select id
      from manwon_happiness.activity_profiles
      where user_id = ${userId}
        and is_active = true
      order by created_at asc
      limit 1
    )
    select ap.*, (ap.id = default_profile.id) as is_default, p.gender, p.phone_verified, p.identity_verified, p.rating_avg::float8, p.review_count, p.completed_count
    from manwon_happiness.activity_profiles ap
    join manwon_happiness.users p on p.id = ap.user_id
    left join default_profile on true
    where ap.user_id = ${userId}
      and ap.is_active = true
    order by case when ap.id = default_profile.id then 0 else 1 end, ap.created_at asc
  `
}

export async function checkActivityProfileNickname(userId: string, nickname: string, excludeId?: string | null) {
  assertActivityProfileNickname(nickname)
  if (excludeId) {
    const [owned] = await getSql()`
      select 1 from manwon_happiness.activity_profiles where id = ${excludeId} and user_id = ${userId} limit 1
    `
    if (!owned) throw new HttpError('프로필을 찾을 수 없습니다.', 404)
  }
  return { available: !await isActivityProfileNicknameTaken(nickname, excludeId), nickname: normalizeNickname(nickname) }
}

export async function createActivityProfile(userId: string, input: ActivityProfileInput) {
  const payload = activityProfilePayload(input)
  const nickname = payload.nickname
  const bio = payload.bio
  const activityMode = payload.activityMode
  if (!nickname) throw new HttpError('닉네임을 입력해주세요.', 400)
  if (!bio) throw new HttpError('한 줄 소개를 입력해주세요.', 400)
  if (!activityMode) throw new HttpError('활동 방식을 선택해주세요.', 400)
  assertActivityProfileNickname(nickname)
  if (await isActivityProfileNicknameTaken(nickname)) throw new HttpError('이미 사용 중인 닉네임입니다.', 409)
  if ((activityMode === 'nearby' || activityMode === 'both') && (!payload.region2Depth || !payload.region3Depth)) {
    throw new HttpError('활동 지역을 선택해주세요.', 400)
  }

  const sql = getSql()
  return sql.begin(async (tx) => {
    const [created] = await tx`
      insert into manwon_happiness.activity_profiles (
        user_id, avatar_url, default_avatar_key, nickname, bio,
        activity_mode, address_text, region_1depth, region_2depth, region_3depth, region_code,
        latitude, longitude, career_summary, career_description, portfolio_links, work_sample_images,
        available_time_text, base_price
      )
      values (
        ${userId}, ${payload.avatarUrl}, ${payload.defaultAvatarKey}, ${nickname}, ${bio},
        ${activityMode}, ${payload.addressText}, ${payload.region1Depth}, ${payload.region2Depth},
        ${payload.region3Depth}, ${payload.regionCode}, ${payload.latitude}, ${payload.longitude},
        ${payload.careerSummary}, ${payload.careerDescription}, ${tx.json(payload.portfolioLinks)}::jsonb,
        ${tx.json(payload.workSampleImages)}::jsonb, ${payload.availableTimeText}, ${payload.basePrice}
      )
      returning *
    `

    await tx`
      update manwon_happiness.users
      set profile_onboarding_completed = true,
          profile_onboarding_completed_at = coalesce(profile_onboarding_completed_at, now()),
          updated_at = now()
      where id = ${userId}
    `

    return created ?? null
  })
}

export async function updateActivityProfile(userId: string, profileId: string, input: UpdateActivityProfileInput) {
  const sql = getSql()
  const [existing] = await sql`
    select *
    from manwon_happiness.activity_profiles
    where id = ${profileId}
      and user_id = ${userId}
      and is_active = true
    limit 1
  `
  if (!existing) return null

  const payload = activityProfilePayload(input)
  const nickname = payload.nickname ?? String(existing.nickname)
  assertActivityProfileNickname(nickname)
  if (payload.nickname && await isActivityProfileNicknameTaken(payload.nickname, profileId)) throw new HttpError('이미 사용 중인 닉네임입니다.', 409)
  const activityMode = payload.activityMode ?? existing.activityMode
  const region2Depth = input.region2Depth !== undefined ? payload.region2Depth : existing.region2depth
  const region3Depth = input.region3Depth !== undefined ? payload.region3Depth : existing.region3depth
  if ((activityMode === 'nearby' || activityMode === 'both') && (!region2Depth || !region3Depth)) {
    throw new HttpError('활동 지역을 선택해주세요.', 400)
  }

  const rows = await sql`
    update manwon_happiness.activity_profiles
    set avatar_url = ${input.avatarUrl !== undefined ? payload.avatarUrl : existing.avatarUrl},
        default_avatar_key = ${input.defaultAvatarKey !== undefined ? payload.defaultAvatarKey : existing.defaultAvatarKey},
        nickname = ${nickname},
        bio = ${input.bio !== undefined ? payload.bio : existing.bio},
        activity_mode = ${activityMode},
        address_text = ${input.addressText !== undefined ? payload.addressText : existing.addressText},
        region_1depth = ${input.region1Depth !== undefined ? payload.region1Depth : existing.region1depth},
        region_2depth = ${input.region2Depth !== undefined ? payload.region2Depth : existing.region2depth},
        region_3depth = ${input.region3Depth !== undefined ? payload.region3Depth : existing.region3depth},
        region_code = ${input.regionCode !== undefined ? payload.regionCode : existing.regionCode},
        latitude = ${input.latitude !== undefined ? payload.latitude : existing.latitude},
        longitude = ${input.longitude !== undefined ? payload.longitude : existing.longitude},
        career_summary = ${input.careerSummary !== undefined ? payload.careerSummary : existing.careerSummary},
        career_description = ${input.careerDescription !== undefined ? payload.careerDescription : existing.careerDescription},
        portfolio_links = ${input.portfolioLinks !== undefined ? sql.json(payload.portfolioLinks) : sql.json(jsonArray(existing.portfolioLinks))}::jsonb,
        work_sample_images = ${input.workSampleImages !== undefined ? sql.json(payload.workSampleImages) : sql.json(jsonArray(existing.workSampleImages))}::jsonb,
        available_time_text = ${input.availableTimeText !== undefined ? payload.availableTimeText : existing.availableTimeText},
        base_price = ${input.basePrice !== undefined ? payload.basePrice : existing.basePrice}
    where id = ${profileId}
      and user_id = ${userId}
    returning *
  `
  return rows[0] ?? null
}

export async function deactivateActivityProfile(userId: string, profileId: string) {
  const defaultProfileId = await getDefaultActivityProfileId(userId)
  if (defaultProfileId === profileId) {
    throw new HttpError('기본 프로필은 비활성화할 수 없습니다.', 400)
  }

  const sql = getSql()
  const [activeCount] = await sql`
    select count(*)::integer as count
    from manwon_happiness.activity_profiles
    where user_id = ${userId}
      and is_active = true
  `
  if (Number(activeCount?.count ?? 0) <= 1) {
    throw new HttpError('활동 프로필은 최소 1개가 필요합니다.', 400)
  }
  const rows = await sql`
    update manwon_happiness.activity_profiles
    set is_active = false
    where id = ${profileId}
      and user_id = ${userId}
      and is_active = true
    returning *
  `
  return rows[0] ?? null
}

export async function listTaskPosts(input: ListPostsInput, viewerId?: string | null) {
  const sql = getSql()
  const lat = input.lat ?? null
  const lng = input.lng ?? null
  const nearbyOnly = input.nearby === 'true'
  const currentUserId = viewerId ?? null
  const publicStatusScope = input.status_scope === 'public'

  return sql`
    select
      p.*,
      p.creator_profile_id as creator_profile_id,
      coalesce(creator_profile.nickname, creator.nickname) as creator_nickname,
      coalesce(creator_profile.avatar_url, creator.avatar_url) as creator_avatar_url,
      creator_profile.bio as creator_bio,
      creator.gender as creator_gender,
      creator.phone_verified as creator_phone_verified,
      creator.identity_verified as creator_identity_verified,
      creator.rating_avg::float8 as creator_rating_avg,
      creator.review_count as creator_review_count,
      creator.completed_count as creator_completed_count,
      capacity_stats.occupied_count as occupied_count,
      chat_stats.active_chat_count as active_chat_count,
      case
        when p.capacity_type = 'limited' and p.capacity_limit is not null then greatest(p.capacity_limit - capacity_stats.occupied_count, 0)
        else null
      end as remaining_count,
      case
        when ${lat}::numeric is not null and ${lng}::numeric is not null and p.latitude is not null and p.longitude is not null then
          6371000 * acos(
            least(
              1,
              cos(radians(${lat}::numeric)) * cos(radians(p.latitude)) *
              cos(radians(p.longitude) - radians(${lng}::numeric)) +
              sin(radians(${lat}::numeric)) * sin(radians(p.latitude))
            )
          )
        else null
      end as distance_meters,
      coalesce(
        json_agg(
          json_build_object(
            'id', i.id,
            'imageUrl', i.image_url,
            'storageKey', i.storage_key,
            'sortOrder', i.sort_order
          )
          order by i.sort_order asc
        ) filter (where i.id is not null),
        '[]'::json
      ) as images
    from manwon_happiness.task_posts p
    join manwon_happiness.users creator on creator.id = p.creator_id
    left join manwon_happiness.activity_profiles creator_profile on creator_profile.id = p.creator_profile_id
    left join manwon_happiness.task_post_images i on i.post_id = p.id
    left join lateral (
      select
        count(d.id) filter (
          where d.status = 'completed'
        )::integer as occupied_count
      from manwon_happiness.deals d
      where d.post_id = p.id
    ) capacity_stats on true
    left join lateral (
      select count(distinct a.applicant_id)::integer as active_chat_count
      from manwon_happiness.applications a
      where a.post_id = p.id
    ) chat_stats on true
    where (
        (${publicStatusScope}::boolean = false and p.status = 'open')
        or (
          ${publicStatusScope}::boolean = true
          and p.status in ('open', 'pending', 'in_progress', 'completed', 'closed')
        )
      )
      and (${input.post_type ?? null}::manwon_happiness.post_type is null or p.post_type = ${input.post_type ?? null}::manwon_happiness.post_type)
      and (${input.category ?? null}::text is null or p.category = ${input.category ?? null})
      and (${input.category_detail ?? null}::text is null or p.category_detail = ${input.category_detail ?? null})
      and (${input.mode ?? null}::manwon_happiness.task_mode is null or p.mode = ${input.mode ?? null}::manwon_happiness.task_mode)
      and (${input.max_price ?? null}::integer is null or p.price <= ${input.max_price ?? null})
      and (${input.deadline_before ?? null}::timestamptz is null or p.deadline_at <= ${input.deadline_before ?? null})
      and (${nearbyOnly}::boolean = false or (p.latitude is not null and p.longitude is not null))
      and (
        ${input.radius_m ?? null}::integer is null
        or ${lat}::numeric is null
        or ${lng}::numeric is null
        or (
          p.latitude is not null
          and p.longitude is not null
          and 6371000 * acos(
            least(
              1,
              cos(radians(${lat}::numeric)) * cos(radians(p.latitude)) *
              cos(radians(p.longitude) - radians(${lng}::numeric)) +
              sin(radians(${lat}::numeric)) * sin(radians(p.latitude))
            )
          ) <= ${input.radius_m ?? null}::integer
        )
      )
      and (
        ${currentUserId}::uuid is null
        or not exists (
          select 1 from manwon_happiness.blocks b
          where (b.blocker_id = ${currentUserId}::uuid and b.blocked_user_id = p.creator_id)
             or (b.blocker_id = p.creator_id and b.blocked_user_id = ${currentUserId}::uuid)
        )
      )
    group by p.id, creator.nickname, creator.avatar_url, creator.gender, creator.phone_verified, creator.identity_verified, creator.rating_avg, creator.review_count, creator.completed_count, creator_profile.id, creator_profile.nickname, creator_profile.avatar_url, creator_profile.bio, capacity_stats.occupied_count, chat_stats.active_chat_count
    order by
      case
        when ${publicStatusScope}::boolean = true and p.status = 'open' then 0
        when ${publicStatusScope}::boolean = true and p.status in ('pending', 'in_progress') then 1
        when ${publicStatusScope}::boolean = true and p.status = 'closed' then 2
        when ${publicStatusScope}::boolean = true and p.status = 'completed' then 3
        else 0
      end asc,
      case when ${publicStatusScope}::boolean = true then p.created_at end desc,
      distance_meters asc nulls last,
      p.created_at desc
    limit ${input.limit}
  `
}

export async function getTaskPost(postId: string, viewerId?: string | null, options?: { incrementView?: boolean }) {
  const sql = getSql()
  const currentUserId = viewerId ?? null
  const cancelledByColumn = (await hasDealsCancelledByColumn(sql))
    ? sql`d.cancelled_by`
    : sql`null::uuid`
  const rows = await sql`
    select
      p.*,
      p.creator_profile_id as creator_profile_id,
      coalesce(creator_profile.nickname, creator.nickname) as creator_nickname,
      coalesce(creator_profile.avatar_url, creator.avatar_url) as creator_avatar_url,
      creator_profile.default_avatar_key as creator_default_avatar_key,
      creator_profile.bio as creator_bio,
      creator.gender as creator_gender,
      creator.phone_verified as creator_phone_verified,
      creator.identity_verified as creator_identity_verified,
      creator.rating_avg as creator_rating_avg,
      creator.review_count as creator_review_count,
      creator.completed_count as creator_completed_count,
      capacity_stats.occupied_count as occupied_count,
      chat_stats.active_chat_count as active_chat_count,
      case
        when p.capacity_type = 'limited' and p.capacity_limit is not null then greatest(p.capacity_limit - capacity_stats.occupied_count, 0)
        else null
      end as remaining_count,
      coalesce(creator_profile.career_summary, creator.trust_career_summary) as creator_career_summary,
      creator_profile.career_description as creator_career_description,
      case
        when jsonb_array_length(coalesce(creator_profile.portfolio_links, '[]'::jsonb)) > 0 then creator_profile.portfolio_links
        else coalesce(creator.trust_portfolio_links, '[]'::jsonb)
      end as creator_portfolio_links,
      case
        when jsonb_array_length(coalesce(creator_profile.work_sample_images, '[]'::jsonb)) > 0 then creator_profile.work_sample_images
        else coalesce(creator.trust_work_sample_images, '[]'::jsonb)
      end as creator_work_sample_images,
      coalesce(creator_profile.available_time_text, creator.trust_response_time, creator.trust_response_time_text) as creator_response_time,
      exists (
        select 1
        from manwon_happiness.favorites favorite
        where favorite.post_id = p.id
          and favorite.user_id = ${currentUserId}::uuid
      ) as is_favorited,
      latest_deal.id as latest_deal_id,
      latest_deal.status as latest_deal_status,
      latest_deal.cancelled_by as latest_deal_cancelled_by,
      viewer_application.id as viewer_application_id,
      viewer_application.status as viewer_application_status,
      viewer_application.conversation_id as viewer_conversation_id,
      viewer_application.deal_id as viewer_deal_id,
      viewer_application.deal_status as viewer_deal_status,
      coalesce(
        json_agg(
          json_build_object(
            'id', i.id,
            'imageUrl', i.image_url,
            'storageKey', i.storage_key,
            'sortOrder', i.sort_order
          )
          order by i.sort_order asc
        ) filter (where i.id is not null),
        '[]'::json
      ) as images
    from manwon_happiness.task_posts p
    join manwon_happiness.users creator on creator.id = p.creator_id
    left join manwon_happiness.activity_profiles creator_profile on creator_profile.id = p.creator_profile_id
    left join manwon_happiness.task_post_images i on i.post_id = p.id
    left join lateral (
      select
        count(d.id) filter (
          where d.status = 'completed'
        )::integer as occupied_count
      from manwon_happiness.deals d
      where d.post_id = p.id
    ) capacity_stats on true
    left join lateral (
      select count(distinct a.applicant_id)::integer as active_chat_count
      from manwon_happiness.applications a
      where a.post_id = p.id
    ) chat_stats on true
    left join lateral (
      select d.id, d.status, ${cancelledByColumn} as cancelled_by, d.cancelled_at, d.completed_at, d.updated_at, d.created_at
      from manwon_happiness.deals d
      where d.post_id = p.id
      order by coalesce(d.cancelled_at, d.completed_at, d.updated_at, d.created_at) desc
      limit 1
    ) latest_deal on true
    left join lateral (
      select
        a.id,
        a.status,
        c.id as conversation_id,
        d.id as deal_id,
        d.status as deal_status
      from manwon_happiness.applications a
      left join manwon_happiness.conversations c on c.post_id = a.post_id
        and c.recruitment_round = a.recruitment_round
        and (
          (p.post_type = 'request' and c.requester_id = p.creator_id and c.helper_id = a.applicant_id)
          or (p.post_type = 'offer' and c.requester_id = a.applicant_id and c.helper_id = p.creator_id)
        )
      left join manwon_happiness.deals d on d.application_id = a.id
      where ${currentUserId}::uuid is not null
        and a.post_id = p.id
        and a.applicant_id = ${currentUserId}::uuid
        and a.recruitment_round = p.recruitment_round
      order by a.updated_at desc
      limit 1
    ) viewer_application on true
    where p.id = ${postId}
    group by p.id, creator.nickname, creator.avatar_url, creator.gender, creator.phone_verified, creator.identity_verified, creator.rating_avg, creator.review_count, creator.completed_count, creator.trust_career_summary, creator.trust_portfolio_links, creator.trust_work_sample_images, creator.trust_response_time, creator.trust_response_time_text, creator_profile.id, creator_profile.nickname, creator_profile.avatar_url, creator_profile.default_avatar_key, creator_profile.bio, creator_profile.career_summary, creator_profile.career_description, creator_profile.portfolio_links, creator_profile.work_sample_images, creator_profile.available_time_text, capacity_stats.occupied_count, chat_stats.active_chat_count, latest_deal.id, latest_deal.status, latest_deal.cancelled_by, viewer_application.id, viewer_application.status, viewer_application.conversation_id, viewer_application.deal_id, viewer_application.deal_status
    limit 1
  `

  if (!rows[0]) return null
  if (rows[0].status === 'hidden' && String(rows[0].creatorId) !== currentUserId) {
    throw new HttpError('삭제된 게시물입니다.', 404)
  }

  if (currentUserId) {
    const creatorId = rows[0].creatorId
    const [blocked] = await sql`
      select 1
      from manwon_happiness.blocks b
      where (b.blocker_id = ${currentUserId}::uuid and b.blocked_user_id = ${creatorId}::uuid)
         or (b.blocker_id = ${creatorId}::uuid and b.blocked_user_id = ${currentUserId}::uuid)
      limit 1
    `
    if (blocked) {
      throw new HttpError('차단된 사용자의 게시글은 볼 수 없습니다.', 403)
    }
  }

  if (options?.incrementView !== false) {
    await sql`
      update manwon_happiness.task_posts
      set view_count = view_count + 1
      where id = ${postId}
    `
  }

  return rows[0]
}

export async function createTaskPost(userId: string, input: CreatePostInput) {
  await assertPhoneVerified(userId)
  await assertOwnedActiveActivityProfile(userId, input.profileId)

  const sql = getSql()
  const serviceScopeJson = jsonArray(input.serviceScope)
  const portfolioLinksJson = jsonArray(input.portfolioLinks)
  const trustExampleImagesJson = jsonArray(input.trustExampleImages)
  const workSampleImagesJson = jsonArray(input.workSampleImages)
  const capacity = normalizeCapacity(input)

  return sql.begin(async (tx) => {
    const rows = await tx`
      insert into manwon_happiness.task_posts (
        creator_id,
        creator_profile_id,
        post_type,
        title,
        category,
        category_detail,
        description,
        mode,
        price,
        deadline_at,
        deadline_text,
        available_time_text,
        gender_visibility,
        receipt_required,
        photo_proof_required,
        service_intro,
        service_scope,
        experience_summary,
        career_summary,
        portfolio_url,
        portfolio_links,
        response_time_text,
        response_time,
        capacity_type,
        capacity_limit,
        trust_example_images,
        work_sample_images,
        address_text,
        region_1depth,
        region_2depth,
        region_3depth,
        region_code,
        location_source,
        latitude,
        longitude,
        distance_visible
      )
      values (
        ${userId},
        ${input.profileId},
        ${input.postType},
        ${input.title},
        ${input.category},
        ${input.categoryDetail ?? null},
        ${input.description},
        ${input.mode},
        ${input.price},
        ${input.deadlineAt ?? null},
        ${input.deadlineText ?? null},
        ${input.availableTimeText ?? null},
        ${input.genderVisibility},
        ${input.receiptRequired},
        ${input.photoProofRequired},
        ${input.serviceIntro ?? null},
        ${sql.json(serviceScopeJson)}::jsonb,
        ${input.experienceSummary ?? null},
        ${input.careerSummary ?? null},
        ${input.portfolioUrl ?? null},
        ${sql.json(portfolioLinksJson)}::jsonb,
        ${input.responseTimeText ?? null},
        ${input.responseTime ?? null},
        ${capacity.capacityType},
        ${capacity.capacityLimit},
        ${sql.json(trustExampleImagesJson)}::jsonb,
        ${sql.json(workSampleImagesJson)}::jsonb,
        ${input.addressText ?? null},
        ${input.region1Depth ?? null},
        ${input.region2Depth ?? null},
        ${input.region3Depth ?? null},
        ${input.regionCode ?? null},
        ${input.locationSource ?? null},
        ${input.latitude ?? null},
        ${input.longitude ?? null},
        ${input.distanceVisible}
      )
      returning *
    `

    const post = rows[0]
    if (input.images.length > 0) {
      for (const image of input.images) {
        await tx`
          insert into manwon_happiness.task_post_images (post_id, uploader_id, image_url, storage_key, sort_order)
          values (${post.id}, ${userId}, ${image.imageUrl}, ${image.storageKey}, ${image.sortOrder})
        `
      }
    }

    if (input.postType === 'offer') {
      if (input.latitude != null && input.longitude != null && input.region1Depth && input.region2Depth && input.region3Depth) {
        await tx`
          insert into manwon_happiness.user_service_regions (
            user_id,
            region_1depth,
            region_2depth,
            region_3depth,
            latitude,
            longitude,
            radius_m
          )
          values (
            ${userId},
            ${input.region1Depth},
            ${input.region2Depth},
            ${input.region3Depth},
            ${input.latitude},
            ${input.longitude},
            3000
          )
        `
      }

      await tx`
        update manwon_happiness.users
        set trust_experience_summary = coalesce(${input.experienceSummary ?? null}, trust_experience_summary),
            trust_career_summary = coalesce(${input.careerSummary ?? input.experienceSummary ?? null}, trust_career_summary),
            trust_portfolio_url = coalesce(${input.portfolioUrl ?? null}, trust_portfolio_url),
            trust_portfolio_links = case
              when jsonb_array_length(${sql.json(portfolioLinksJson)}::jsonb) > 0 then ${sql.json(portfolioLinksJson)}::jsonb
              else trust_portfolio_links
            end,
            trust_response_time_text = coalesce(${input.responseTimeText ?? null}, trust_response_time_text),
            trust_response_time = coalesce(${input.responseTime ?? input.responseTimeText ?? null}, trust_response_time),
            trust_gender_visibility = ${input.genderVisibility},
            trust_example_images = case
              when jsonb_array_length(${sql.json(trustExampleImagesJson)}::jsonb) > 0 then ${sql.json(trustExampleImagesJson)}::jsonb
              else trust_example_images
            end,
            trust_work_sample_images = case
              when jsonb_array_length(${sql.json(workSampleImagesJson)}::jsonb) > 0 then ${sql.json(workSampleImagesJson)}::jsonb
              else trust_work_sample_images
            end
        where id = ${userId}
      `
    }

    return post
  })
}

function jsonArray(value: unknown) {
  return Array.isArray(value) ? value : []
}

function normalizeCapacity(input: Pick<CreatePostInput | UpdatePostInput, 'capacityType' | 'capacityLimit'>) {
  const capacityType = input.capacityType ?? 'unlimited'
  return {
    capacityType,
    capacityLimit: capacityType === 'limited' ? input.capacityLimit ?? null : null,
  }
}

async function getPostCapacitySnapshot(sql: SqlExecutor, postId: string) {
  const rows = await sql`
    select
      p.post_type,
      p.status,
      p.capacity_type,
      p.capacity_limit,
      p.closed_reason,
      count(d.id) filter (
        where d.status = 'completed'
      )::integer as occupied_count,
      (
        select count(distinct a.applicant_id)::integer
        from manwon_happiness.applications a
        where a.post_id = p.id
      ) as active_chat_count
    from manwon_happiness.task_posts p
    left join manwon_happiness.deals d on d.post_id = p.id
    where p.id = ${postId}
    group by p.id
    limit 1
  `
  return rows[0] ?? null
}

async function refreshPostCapacity(sql: SqlExecutor, postId: string) {
  const snapshot = await getPostCapacitySnapshot(sql, postId)
  if (!snapshot || snapshot.status === 'hidden') return snapshot

  const capacityType = String(snapshot.capacityType ?? 'unlimited')
  const capacityLimit = snapshot.capacityLimit == null ? null : Number(snapshot.capacityLimit)
  const occupiedCount = Number(snapshot.occupiedCount ?? 0)
  const isFull = capacityType === 'limited' && capacityLimit !== null && occupiedCount >= capacityLimit

  if (isFull && snapshot.status !== 'closed') {
    await sql`
      update manwon_happiness.task_posts
      set status = 'closed',
          closed_reason = 'capacity_full'
      where id = ${postId}
        and status <> 'hidden'
    `
    return { ...snapshot, status: 'closed', closedReason: 'capacity_full' }
  }

  if (!isFull && snapshot.status === 'closed' && snapshot.closedReason === 'capacity_full') {
    await sql`
      update manwon_happiness.task_posts
      set status = 'open',
          closed_reason = null
      where id = ${postId}
        and status = 'closed'
        and closed_reason = 'capacity_full'
    `
    return { ...snapshot, status: 'open', closedReason: null }
  }

  return snapshot
}

async function hasDealsCancelledByColumn(sql: ReturnType<typeof getSql>) {
  if (dealsCancelledByColumnExists !== null) return dealsCancelledByColumnExists

  const rows = await sql`
    select exists (
      select 1
      from information_schema.columns
      where table_schema = ${schema}
        and table_name = 'deals'
        and column_name = 'cancelled_by'
    ) as exists
  `
  dealsCancelledByColumnExists = Boolean(rows[0]?.exists)
  return dealsCancelledByColumnExists
}

function canTransitionDealStatus(current: string, next: string) {
  if (current === next) return true
  const transitions: Record<string, string[]> = {
    pending: ['accepted', 'cancelled'],
    accepted: ['in_progress', 'cancelled'],
    in_progress: ['complete_requested', 'cancelled'],
    complete_requested: ['completed', 'cancelled', 'disputed'],
    disputed: [],
    completed: [],
    cancelled: [],
  }

  return transitions[current]?.includes(next) ?? false
}

function getDealStatusSystemMessage(status: string, reportReason?: string | null) {
  if (status === 'accepted') return '거래가 수락되었어요.'
  if (status === 'in_progress') return '거래가 진행 중으로 변경되었어요.'
  if (status === 'complete_requested') return '완료 요청이 도착했어요.'
  if (status === 'completed') return '거래가 완료되었어요.'
  if (status === 'cancelled') return '거래가 취소되었어요.'
  if (status === 'disputed') return reportReason
    ? `‘${reportReason}’ 문제 신고가 접수되어 거래가 완료 처리되었어요.`
    : '문제 신고가 접수되어 거래가 완료 처리되었어요.'
  return null
}

function getDealStatusNotification(status: string, postTitle: string | null, reportReason?: string | null) {
  const title = postTitle ? `"${postTitle}"` : '거래'
  if (status === 'accepted') return { type: 'deal.accepted', title: '거래가 수락됐어요', body: `${title} 거래가 수락됐습니다.` }
  if (status === 'in_progress') return { type: 'deal.in_progress', title: '거래가 시작됐어요', body: `${title} 거래가 진행 중으로 바뀌었습니다.` }
  if (status === 'complete_requested') return { type: 'deal.complete_requested', title: '완료 요청이 도착했어요', body: `${title} 거래를 확인하고 완료 승인해주세요.` }
  if (status === 'completed') return { type: 'deal.completed', title: '거래가 완료됐어요', body: `${title} 거래가 완료되었습니다.` }
  if (status === 'cancelled') return { type: 'deal.cancelled', title: '거래가 취소됐어요', body: `${title} 거래가 취소되었습니다.` }
  if (status === 'disputed') return {
    type: 'deal.disputed',
    title: '문제 신고가 접수됐어요',
    body: reportReason ? `${title} 거래가 ‘${reportReason}’ 문제로 신고되어 완료 처리됐습니다.` : `${title} 거래가 신고되어 완료 처리됐습니다.`,
  }
  return null
}

function getApplicationStatusSystemMessage(status: string) {
  if (status === 'accepted') return '지원이 수락되었어요. 거래를 시작해보세요.'
  if (status === 'rejected') return '지원이 거절되었어요.'
  if (status === 'cancelled') return '지원이 취소되었어요.'
  return null
}

function getApplicationStatusNotification(status: string, postTitle?: string | null) {
  const title = postTitle ? `"${postTitle}"` : '게시물'
  if (status === 'accepted') return { type: 'application.accepted', title: '지원이 수락됐어요', body: `${title} 지원이 수락됐습니다. 채팅에서 거래를 시작해보세요.` }
  if (status === 'rejected') return { type: 'application.rejected', title: '지원이 거절됐어요', body: `${title} 지원이 거절되었습니다.` }
  if (status === 'cancelled') return { type: 'application.cancelled', title: '지원이 취소됐어요', body: `${title} 지원자가 지원을 취소했습니다.` }
  if (status === 'auto_rejected') return { type: 'application.rejected', title: '모집이 마감됐어요', body: `${title}에서 다른 지원자가 수락되어 이번 지원은 마감되었습니다.` }
  return null
}

function chatRoute(conversationId?: string | null, postId?: string | null) {
  if (conversationId) return `/chat/${conversationId}`
  if (postId) return `/posts/${postId}`
  return null
}

function chatNotificationData(input: {
  type: string
  conversationId?: string | null
  postId?: string | null
  dealId?: string | null
  applicationId?: string | null
  messageId?: string | null
}) {
  return {
    type: input.type,
    conversationId: input.conversationId ?? null,
    route: chatRoute(input.conversationId, input.postId),
    postId: input.postId ?? null,
    dealId: input.dealId ?? null,
    applicationId: input.applicationId ?? null,
    messageId: input.messageId ?? null,
  }
}

function getApplicationFromStatusResult(result: unknown): Record<string, unknown> | null {
  if (!result || typeof result !== 'object') return null
  if ('application' in result) {
    const application = (result as { application?: unknown }).application
    return application && typeof application === 'object' ? application as Record<string, unknown> : null
  }
  return result as Record<string, unknown>
}

function getDealIdFromStatusResult(result: unknown) {
  if (!result || typeof result !== 'object' || !('deal' in result)) return null
  const deal = (result as { deal?: unknown }).deal
  if (!deal || typeof deal !== 'object' || !('id' in deal)) return null
  return String((deal as { id?: unknown }).id)
}

export async function updateTaskPost(userId: string, postId: string, input: UpdatePostInput) {
  const sql = getSql()
  const [existing] = await sql`
    select *
    from manwon_happiness.task_posts
    where id = ${postId} and creator_id = ${userId}
    limit 1
  `

  if (!existing) return null
  if (input.profileId) await assertOwnedActiveActivityProfile(userId, input.profileId)

  const nextPostType = input.postType !== undefined ? input.postType : existing.postType
  const capacity = normalizeCapacity({
    capacityType: input.capacityType !== undefined ? input.capacityType : existing.capacityType,
    capacityLimit: input.capacityLimit !== undefined ? input.capacityLimit : existing.capacityLimit,
  })
  const capacitySnapshot = await getPostCapacitySnapshot(sql, postId)
  const occupiedCount = Number(capacitySnapshot?.occupiedCount ?? 0)
  if (capacity.capacityType === 'limited' && capacity.capacityLimit !== null && capacity.capacityLimit < occupiedCount) {
    throw new HttpError('이미 완료된 거래 인원보다 적게 설정할 수 없습니다.', 400)
  }

  let nextStatus = input.status !== undefined ? input.status : existing.status
  let nextClosedReason = input.closedReason !== undefined ? input.closedReason : existing.closedReason
  if (nextStatus === 'open') {
    nextClosedReason = null
  } else if (nextStatus === 'closed' && !nextClosedReason) {
    nextClosedReason = 'manual'
  } else if (existing.status === 'closed' && existing.closedReason === 'capacity_full' && input.status === undefined) {
    const isStillFull = capacity.capacityType === 'limited' && capacity.capacityLimit !== null && occupiedCount >= capacity.capacityLimit
    if (!isStillFull) {
      nextStatus = 'open'
      nextClosedReason = null
    }
  }
  if (
    nextStatus !== 'hidden' &&
    nextClosedReason !== 'manual' &&
    capacity.capacityType === 'limited' &&
    capacity.capacityLimit !== null &&
    occupiedCount >= capacity.capacityLimit
  ) {
    nextStatus = 'closed'
    nextClosedReason = 'capacity_full'
  }

  const updatedPost = await sql.begin(async (tx) => {
    const rows = await tx`
      update manwon_happiness.task_posts
      set creator_profile_id = ${input.profileId !== undefined ? input.profileId : existing.creatorProfileId},
          post_type = ${nextPostType},
          title = ${input.title !== undefined ? input.title : existing.title},
          category = ${input.category !== undefined ? input.category : existing.category},
          category_detail = ${input.categoryDetail !== undefined ? input.categoryDetail : existing.categoryDetail},
          description = ${input.description !== undefined ? input.description : existing.description},
          mode = ${input.mode !== undefined ? input.mode : existing.mode},
          price = ${input.price !== undefined ? input.price : existing.price},
          deadline_at = ${input.deadlineAt !== undefined ? input.deadlineAt : existing.deadlineAt},
          deadline_text = ${input.deadlineText !== undefined ? input.deadlineText : existing.deadlineText},
          available_time_text = ${input.availableTimeText !== undefined ? input.availableTimeText : existing.availableTimeText},
          gender_visibility = ${input.genderVisibility !== undefined ? input.genderVisibility : existing.genderVisibility},
          receipt_required = ${input.receiptRequired !== undefined ? input.receiptRequired : existing.receiptRequired},
          photo_proof_required = ${input.photoProofRequired !== undefined ? input.photoProofRequired : existing.photoProofRequired},
          service_intro = ${input.serviceIntro !== undefined ? input.serviceIntro : existing.serviceIntro},
          service_scope = ${sql.json(jsonArray(input.serviceScope !== undefined ? input.serviceScope : existing.serviceScope))}::jsonb,
          experience_summary = ${input.experienceSummary !== undefined ? input.experienceSummary : existing.experienceSummary},
          career_summary = ${input.careerSummary !== undefined ? input.careerSummary : existing.careerSummary},
          portfolio_url = ${input.portfolioUrl !== undefined ? input.portfolioUrl : existing.portfolioUrl},
          portfolio_links = ${sql.json(jsonArray(input.portfolioLinks !== undefined ? input.portfolioLinks : existing.portfolioLinks))}::jsonb,
          response_time_text = ${input.responseTimeText !== undefined ? input.responseTimeText : existing.responseTimeText},
          response_time = ${input.responseTime !== undefined ? input.responseTime : existing.responseTime},
          capacity_type = ${capacity.capacityType},
          capacity_limit = ${capacity.capacityLimit},
          closed_reason = ${nextClosedReason},
          trust_example_images = ${sql.json(jsonArray(input.trustExampleImages !== undefined ? input.trustExampleImages : existing.trustExampleImages))}::jsonb,
          work_sample_images = ${sql.json(jsonArray(input.workSampleImages !== undefined ? input.workSampleImages : existing.workSampleImages))}::jsonb,
          status = ${nextStatus},
          address_text = ${input.addressText !== undefined ? input.addressText : existing.addressText},
          region_1depth = ${input.region1Depth !== undefined ? input.region1Depth : existing.region1depth},
          region_2depth = ${input.region2Depth !== undefined ? input.region2Depth : existing.region2depth},
          region_3depth = ${input.region3Depth !== undefined ? input.region3Depth : existing.region3depth},
          region_code = ${input.regionCode !== undefined ? input.regionCode : existing.regionCode},
          location_source = ${input.locationSource !== undefined ? input.locationSource : existing.locationSource},
          latitude = ${input.latitude !== undefined ? input.latitude : existing.latitude},
          longitude = ${input.longitude !== undefined ? input.longitude : existing.longitude},
          distance_visible = ${input.distanceVisible !== undefined ? input.distanceVisible : existing.distanceVisible},
          updated_at = now()
      where id = ${postId} and creator_id = ${userId}
      returning *
    `

    const post = rows[0]
    if (!post) return null

    if (input.images !== undefined) {
      await tx`
        delete from manwon_happiness.task_post_images
        where post_id = ${postId}
      `

      for (const image of input.images) {
        await tx`
          insert into manwon_happiness.task_post_images (post_id, uploader_id, image_url, storage_key, sort_order)
          values (${postId}, ${userId}, ${image.imageUrl}, ${image.storageKey}, ${image.sortOrder})
        `
      }
    }

    return post
  })

  if (!updatedPost) return null
  return getTaskPost(postId, userId, { incrementView: false })
}

export async function deleteTaskPost(userId: string, postId: string) {
  const sql = getSql()
  const rows = await sql`
    update manwon_happiness.task_posts
    set status = 'hidden',
        updated_at = now()
    where id = ${postId}
      and creator_id = ${userId}
      and status <> 'hidden'
    returning *
  `

  return rows[0] ?? null
}

export async function reopenTaskPost(userId: string, postId: string) {
  const sql = getSql()
  const rows = await sql`
    update manwon_happiness.task_posts
    set status = 'open',
        recruitment_round = recruitment_round + 1,
        updated_at = now()
    where id = ${postId}
      and creator_id = ${userId}
      and status = 'cancelled'
    returning *
  `

  return rows[0] ?? null
}

export async function addTaskPostImage(userId: string, postId: string, input: ImageRecordInput) {
  const sql = getSql()
  const rows = await sql`
    insert into manwon_happiness.task_post_images (post_id, uploader_id, image_url, storage_key, sort_order)
    select ${postId}, ${userId}, ${input.imageUrl}, ${input.storageKey}, ${input.sortOrder}
    where exists (
      select 1 from manwon_happiness.task_posts
      where id = ${postId} and creator_id = ${userId}
    )
    returning *
  `

  return rows[0] ?? null
}

export async function createApplication(userId: string, input: CreateApplicationInput) {
  await assertPhoneVerified(userId)
  await assertOwnedActiveActivityProfile(userId, input.profileId)

  const sql = getSql()
  const rows = await sql`
    insert into manwon_happiness.applications (post_id, applicant_id, applicant_profile_id, message, recruitment_round)
    select p.id, ${userId}, ${input.profileId}, ${input.message ?? null}, p.recruitment_round
    from manwon_happiness.task_posts p
    where p.id = ${input.postId}
      and p.creator_id <> ${userId}
      and p.status = 'open'
      and (
        p.capacity_type <> 'limited'
        or p.capacity_limit is null
        or (
          select count(d.id)
          from manwon_happiness.deals d
          where d.post_id = p.id
            and d.status = 'completed'
        ) < p.capacity_limit
      )
      and not exists (
        select 1
        from manwon_happiness.blocks b
        where (
          b.blocker_id = ${userId}
          and b.blocked_user_id = p.creator_id
        )
        or (
          b.blocker_id = p.creator_id
          and b.blocked_user_id = ${userId}
        )
      )
    on conflict (post_id, applicant_id, recruitment_round) do update
      set applicant_profile_id = excluded.applicant_profile_id,
          message = excluded.message,
          status = 'applied',
          updated_at = now()
      where manwon_happiness.applications.status = 'rejected'
    returning *
  `

  return rows[0] ?? null
}

export async function updateApplicationStatus(userId: string, applicationId: string, input: UpdateApplicationStatusInput) {
  const sql = getSql()

  const result = await sql.begin(async (tx) => {
    const applicationRows = await tx`
      select
        a.*,
        p.creator_id,
        p.creator_profile_id,
        p.post_type,
        p.price,
        p.status as post_status,
        p.capacity_type,
        p.capacity_limit,
        p.closed_reason,
        p.title as post_title,
        p.recruitment_round as post_recruitment_round,
        capacity_stats.occupied_count as occupied_count
      from manwon_happiness.applications a
      join manwon_happiness.task_posts p on p.id = a.post_id
      left join lateral (
        select
          count(d.id) filter (
            where d.status = 'completed'
          )::integer as occupied_count
        from manwon_happiness.deals d
        where d.post_id = p.id
      ) capacity_stats on true
      where a.id = ${applicationId}
      for update of a, p
      limit 1
    `
    const application = applicationRows[0]
    if (!application) return null

    const isCreator = application.creatorId === userId
    const isApplicant = application.applicantId === userId
    if (!isCreator && !(isApplicant && input.status === 'cancelled')) return null

    if (input.status === 'accepted') {
      if (application.status !== 'applied' || application.postStatus !== 'open' || application.recruitmentRound !== application.postRecruitmentRound) {
        return null
      }
      const capacityLimit = application.capacityLimit == null ? null : Number(application.capacityLimit)
      const occupiedCount = Number(application.occupiedCount ?? 0)
      const isCapacityFull =
        application.capacityType === 'limited' &&
        capacityLimit !== null &&
        occupiedCount >= capacityLimit
      if (isCapacityFull) {
        await refreshPostCapacity(tx, String(application.postId))
        return null
      }
    }

    if ((input.status === 'rejected' || input.status === 'cancelled') && application.status !== 'applied') {
      return null
    }

    const requesterId = application.postType === 'request' ? application.creatorId : application.applicantId
    const helperId = application.postType === 'request' ? application.applicantId : application.creatorId
    const requesterProfileId = application.postType === 'request' ? application.creatorProfileId : application.applicantProfileId
    const helperProfileId = application.postType === 'request' ? application.applicantProfileId : application.creatorProfileId
    if (!requesterProfileId || !helperProfileId) return null
    const existingConversationRows = await tx`
      select id
      from manwon_happiness.conversations
      where post_id = ${application.postId}
        and requester_id = ${requesterId}
        and helper_id = ${helperId}
        and recruitment_round = ${application.recruitmentRound}
      limit 1
    `
    let conversationId = existingConversationRows[0]?.id ? String(existingConversationRows[0].id) : null

    const updatedRows = await tx`
      update manwon_happiness.applications
      set status = ${input.status}
      where id = ${applicationId}
      returning *
    `

    const updatedApplication = {
      ...updatedRows[0],
      creatorId: application.creatorId,
      postTitle: application.postTitle,
      conversationId,
    }

    if (input.status !== 'accepted') {
      const systemMessage = getApplicationStatusSystemMessage(input.status)
      if (conversationId && systemMessage) {
        await tx`
          insert into manwon_happiness.messages (conversation_id, sender_id, message_type, body)
          values (${conversationId}, ${userId}, 'system', ${systemMessage})
        `
        await tx`
          update manwon_happiness.conversations
          set last_message = ${systemMessage},
              last_message_at = now()
          where id = ${conversationId}
        `
      }

      return { application: updatedApplication, conversationId, notifications: [] }
    }

    const autoRejectedRows: Array<{ id: string; applicantId: string }> = []

    const dealRows = await tx`
      insert into manwon_happiness.deals (post_id, requester_id, helper_id, requester_profile_id, helper_profile_id, application_id, price, status, accepted_at, recruitment_round)
      values (${application.postId}, ${requesterId}, ${helperId}, ${requesterProfileId}, ${helperProfileId}, ${applicationId}, ${application.price}, 'accepted', now(), ${application.recruitmentRound})
      returning *
    `

    await refreshPostCapacity(tx, String(application.postId))

    const conversationRows = await tx`
      update manwon_happiness.conversations
      set deal_id = ${dealRows[0].id},
          last_message = '거래가 시작되었어요.',
          last_message_at = now()
      where post_id = ${application.postId}
        and requester_id = ${requesterId}
        and helper_id = ${helperId}
        and recruitment_round = ${application.recruitmentRound}
        and deal_id is null
      returning *
    `
    conversationId = conversationRows[0]?.id ? String(conversationRows[0].id) : conversationId

    if (conversationRows.length === 0) {
      const insertedConversationRows = await tx`
        insert into manwon_happiness.conversations (deal_id, post_id, requester_id, helper_id, recruitment_round, last_message, last_message_at)
        values (${dealRows[0].id}, ${application.postId}, ${requesterId}, ${helperId}, ${application.recruitmentRound}, '거래가 시작되었어요.', now())
        on conflict do nothing
        returning id
      `
      conversationId = insertedConversationRows[0]?.id ? String(insertedConversationRows[0].id) : conversationId
    }

    const acceptedSystemMessage = getApplicationStatusSystemMessage('accepted')
    if (conversationId && acceptedSystemMessage) {
      await tx`
        insert into manwon_happiness.messages (conversation_id, sender_id, message_type, body)
        values (${conversationId}, ${userId}, 'system', ${acceptedSystemMessage})
      `
      await tx`
        update manwon_happiness.conversations
        set last_message = ${acceptedSystemMessage},
            last_message_at = now()
        where id = ${conversationId}
      `
    }

    const autoRejectedNotifications: Array<{ userId: string; applicationId: string; conversationId: string | null }> = []
    const autoRejectedSystemMessage = '다른 지원자가 수락되어 이번 지원은 마감되었어요.'
    for (const row of autoRejectedRows) {
      const rejectedRequesterId = application.postType === 'request' ? application.creatorId : row.applicantId
      const rejectedHelperId = application.postType === 'request' ? row.applicantId : application.creatorId
      const rejectedConversationRows = await tx`
        select id
        from manwon_happiness.conversations
        where post_id = ${application.postId}
          and requester_id = ${rejectedRequesterId}
          and helper_id = ${rejectedHelperId}
          and recruitment_round = ${application.recruitmentRound}
        limit 1
      `
      const rejectedConversationId = rejectedConversationRows[0]?.id ? String(rejectedConversationRows[0].id) : null
      if (rejectedConversationId) {
        await tx`
          insert into manwon_happiness.messages (conversation_id, sender_id, message_type, body)
          values (${rejectedConversationId}, ${userId}, 'system', ${autoRejectedSystemMessage})
        `
        await tx`
          update manwon_happiness.conversations
          set last_message = ${autoRejectedSystemMessage},
              last_message_at = now()
          where id = ${rejectedConversationId}
        `
      }
      autoRejectedNotifications.push({
        userId: String(row.applicantId),
        applicationId: String(row.id),
        conversationId: rejectedConversationId,
      })
    }

    return {
      application: { ...updatedApplication, conversationId },
      deal: dealRows[0],
      conversationId,
      notifications: autoRejectedNotifications,
    }
  })

  const application = getApplicationFromStatusResult(result)
  if (application) {
    const targetUserId = input.status === 'cancelled' ? application.creatorId : application.applicantId
    const postTitle = application.postTitle ? String(application.postTitle) : null
    const conversationId = 'conversationId' in application && application.conversationId ? String(application.conversationId) : null
    const postId = application.postId ? String(application.postId) : null
    const notification = getApplicationStatusNotification(input.status, postTitle)
    if (targetUserId && notification) {
      void createNotificationEvent(String(targetUserId), {
        ...notification,
        data: chatNotificationData({
          type: notification.type,
          postId,
          applicationId,
          conversationId,
          dealId: getDealIdFromStatusResult(result),
        }),
      }).catch(() => undefined)
    }
  }

  if (result && typeof result === 'object' && 'notifications' in result && Array.isArray(result.notifications)) {
    for (const item of result.notifications) {
      if (!item || typeof item !== 'object' || !('userId' in item)) continue
      const notification = getApplicationStatusNotification('auto_rejected', application?.postTitle ? String(application.postTitle) : null)
      if (!notification) continue
      const postId = application?.postId ? String(application.postId) : null
      const conversationId = 'conversationId' in item && item.conversationId ? String(item.conversationId) : null
      void createNotificationEvent(String(item.userId), {
        ...notification,
        data: chatNotificationData({
          type: notification.type,
          postId,
          applicationId: 'applicationId' in item ? String(item.applicationId) : null,
          conversationId,
        }),
      }).catch(() => undefined)
    }
  }

  return result
}

export async function updateDealStatus(userId: string, dealId: string, input: UpdateDealStatusInput) {
  const isReportCompletion = input.status === 'disputed'
  const reportReason = input.reportReason?.trim() || '문제 신고'
  const reportDescription = input.reportDescription?.trim() || null

  if (isReportCompletion) {
    await assertPhoneVerified(userId)
  }

  const sql = getSql()
  const canStoreCancelledBy = input.status === 'cancelled' && await hasDealsCancelledByColumn(sql)
  const timestampColumn = {
    accepted: 'accepted_at',
    in_progress: 'started_at',
    complete_requested: 'complete_requested_at',
    completed: 'completed_at',
    cancelled: 'cancelled_at',
    pending: null,
    disputed: null,
  }[input.status]

  const result = await sql.begin(async (tx) => {
    const existingRows = await tx`
      select d.*, p.creator_id as post_creator_id, p.post_type as post_type
      from manwon_happiness.deals d
      join manwon_happiness.task_posts p on p.id = d.post_id
      where d.id = ${dealId}
        and (d.requester_id = ${userId} or d.helper_id = ${userId})
      for update
      limit 1
    `
    const existing = existingRows[0]
    if (!existing) return null
    if (!canTransitionDealStatus(existing.status, input.status)) return null
    const isPostCreator = String(existing.postCreatorId) === userId
    const isApplicant = Boolean(existing.postCreatorId) && !isPostCreator
    const reportTargetUserId = String(existing.requesterId) === userId ? String(existing.helperId) : String(existing.requesterId)
    if (input.status === 'in_progress' && !isPostCreator) return null
    if (input.status === 'complete_requested' && !isApplicant) return null
    if ((input.status === 'completed' || input.status === 'disputed') && !isPostCreator) return null
    if (existing.status === input.status) {
      return {
        deal: existing,
        conversationId: null,
        postTitle: null,
        notifyUserId: userId,
        skipNotification: true,
      }
    }
    if (input.status === 'completed' || input.status === 'disputed') {
      const turnRows = await tx`
        select count(distinct m.sender_id)::integer as sender_count
        from manwon_happiness.conversations c
        join manwon_happiness.deals d on d.id = c.deal_id
        join manwon_happiness.messages m on m.conversation_id = c.id
        where c.deal_id = ${dealId}
          and m.message_type <> 'system'
          and m.created_at > coalesce(d.started_at, d.accepted_at, c.created_at)
      `
      if (Number(turnRows[0]?.senderCount ?? 0) < 2) return null
    }

    const rows = isReportCompletion
      ? await tx`
          update manwon_happiness.deals
          set status = 'completed',
              completed_at = coalesce(completed_at, now()),
              reported_at = now(),
              reported_by = ${userId},
              reported_user_id = ${reportTargetUserId},
              report_reason = ${reportReason},
              report_description = ${reportDescription},
              chat_blocked_at = now()
          where id = ${dealId} and (requester_id = ${userId} or helper_id = ${userId})
          returning *
        `
      : input.status === 'cancelled'
      ? canStoreCancelledBy
        ? await tx`
          update manwon_happiness.deals
          set status = ${input.status},
              cancelled_at = now(),
              cancelled_by = ${userId}
          where id = ${dealId} and (requester_id = ${userId} or helper_id = ${userId})
          returning *
        `
        : await tx`
          update manwon_happiness.deals
          set status = ${input.status},
              cancelled_at = now()
          where id = ${dealId} and (requester_id = ${userId} or helper_id = ${userId})
          returning *
        `
      : timestampColumn
      ? await tx`
          update manwon_happiness.deals
          set status = ${input.status}, ${sql(timestampColumn)} = now()
          where id = ${dealId} and (requester_id = ${userId} or helper_id = ${userId})
          returning *
        `
      : await tx`
          update manwon_happiness.deals
          set status = ${input.status}
          where id = ${dealId} and (requester_id = ${userId} or helper_id = ${userId})
          returning *
        `

    const deal = rows[0]
    if (!deal) return null

    if (input.status === 'completed' || isReportCompletion) {
      await tx`
        update manwon_happiness.users
        set completed_count = completed_count + 1
        where id in (${deal.requesterId}, ${deal.helperId})
      `
    }
    await refreshPostCapacity(tx, String(deal.postId))

    const systemMessage = getDealStatusSystemMessage(input.status, isReportCompletion ? reportReason : null)
    const conversationRows = await tx`
      select c.id, p.title as post_title
      from manwon_happiness.conversations c
      left join manwon_happiness.task_posts p on p.id = c.post_id
      where c.deal_id = ${deal.id}
      limit 1
    `
    const conversation = conversationRows[0] ?? null
    if (isReportCompletion) {
      const reportRows = await tx`
        insert into manwon_happiness.reports (reporter_id, target_user_id, post_id, conversation_id, reason, description)
        values (
          ${userId},
          ${reportTargetUserId},
          ${deal.postId},
          ${conversation?.id ?? null},
          ${reportReason},
          ${reportDescription}
        )
        returning id
      `
      if (reportRows[0]?.id) {
        await tx`
          update manwon_happiness.deals
          set reported_report_id = ${reportRows[0].id}
          where id = ${deal.id}
        `
        deal.reportedReportId = reportRows[0].id
      }
    }
    if (conversation && systemMessage) {
      await tx`
        insert into manwon_happiness.messages (conversation_id, sender_id, message_type, body)
        values (${conversation.id}, ${userId}, 'system', ${systemMessage})
      `
      await tx`
        update manwon_happiness.conversations
        set last_message = ${systemMessage},
            last_message_at = now()
        where id = ${conversation.id}
      `
    }

    return {
      deal,
      conversationId: conversation?.id ? String(conversation.id) : null,
      postTitle: conversation?.postTitle ? String(conversation.postTitle) : null,
      notifyUserId: String(deal.requesterId) === userId ? String(deal.helperId) : String(deal.requesterId),
      reportReason: isReportCompletion ? reportReason : null,
    }
  })

  if (!result) return null
  if ('skipNotification' in result && result.skipNotification) return result.deal

  const notification = getDealStatusNotification(input.status, result.postTitle, result.reportReason)
  if (notification) {
    void createNotificationEvent(result.notifyUserId, {
      ...notification,
      data: chatNotificationData({
        type: notification.type,
        conversationId: result.conversationId,
        postId: String(result.deal.postId),
        dealId: String(result.deal.id),
      }),
    }).catch(() => undefined)
  }

  return result.deal
}

export async function listConversations(userId: string) {
  const sql = getSql()
  return sql`
    select
      c.*,
      p.title as post_title,
      p.category as post_category,
      p.price as post_price,
      p.status as post_status,
      p.creator_id as post_creator_id,
      p.post_type as post_type,
      d.status as deal_status,
      d.reported_at as deal_reported_at,
      d.reported_by as deal_reported_by,
      d.reported_user_id as deal_reported_user_id,
      d.report_reason as deal_report_reason,
      d.report_description as deal_report_description,
      d.chat_blocked_at as deal_chat_blocked_at,
      coalesce(
        d.requester_profile_id,
        case
          when p.post_type = 'request' then p.creator_profile_id
          when p.post_type = 'offer' then a.applicant_profile_id
          else null
        end
      ) as requester_profile_id,
      coalesce(
        d.helper_profile_id,
        case
          when p.post_type = 'request' then a.applicant_profile_id
          when p.post_type = 'offer' then p.creator_profile_id
          else null
        end
      ) as helper_profile_id,
      a.id as application_id,
      a.status as application_status,
      a.applicant_id as application_applicant_id,
      coalesce(requester_activity.nickname, requester.nickname) as requester_nickname,
      coalesce(requester_activity.avatar_url, requester.avatar_url) as requester_avatar_url,
      requester_activity.bio as requester_bio,
      coalesce(helper_activity.nickname, helper.nickname) as helper_nickname,
      coalesce(helper_activity.avatar_url, helper.avatar_url) as helper_avatar_url,
      helper_activity.bio as helper_bio,
      case when c.requester_id = ${userId} then c.helper_id else c.requester_id end as other_user_id,
      case when c.requester_id = ${userId} then coalesce(helper_activity.nickname, helper.nickname) else coalesce(requester_activity.nickname, requester.nickname) end as other_nickname,
      case when c.requester_id = ${userId} then coalesce(helper_activity.avatar_url, helper.avatar_url) else coalesce(requester_activity.avatar_url, requester.avatar_url) end as other_avatar_url,
      case when c.requester_id = ${userId} then helper_activity.default_avatar_key else requester_activity.default_avatar_key end as other_default_avatar_key,
      case when c.requester_id = ${userId} then helper_activity.bio else requester_activity.bio end as other_bio,
      case when c.requester_id = ${userId} then helper.gender else requester.gender end as other_gender,
      case when c.requester_id = ${userId} then helper.rating_avg::float8 else requester.rating_avg::float8 end as other_rating_avg,
      case when c.requester_id = ${userId} then helper.review_count else requester.review_count end as other_review_count,
      case when c.requester_id = ${userId} then helper.completed_count else requester.completed_count end as other_completed_count,
      case when c.requester_id = ${userId} then helper.phone_verified else requester.phone_verified end as other_phone_verified,
      case when c.requester_id = ${userId} then helper.identity_verified else requester.identity_verified end as other_identity_verified,
      case when c.requester_id = ${userId} then coalesce(helper_activity.career_summary, helper.trust_career_summary) else coalesce(requester_activity.career_summary, requester.trust_career_summary) end as other_career_summary,
      case when c.requester_id = ${userId} then helper_activity.career_description else requester_activity.career_description end as other_career_description,
      case
        when c.requester_id = ${userId} then
          case
            when jsonb_array_length(coalesce(helper_activity.portfolio_links, '[]'::jsonb)) > 0 then helper_activity.portfolio_links
            else coalesce(helper.trust_portfolio_links, '[]'::jsonb)
          end
        else
          case
            when jsonb_array_length(coalesce(requester_activity.portfolio_links, '[]'::jsonb)) > 0 then requester_activity.portfolio_links
            else coalesce(requester.trust_portfolio_links, '[]'::jsonb)
          end
      end as other_portfolio_links,
      case
        when c.requester_id = ${userId} then
          case
            when jsonb_array_length(coalesce(helper_activity.work_sample_images, '[]'::jsonb)) > 0 then helper_activity.work_sample_images
            else coalesce(helper.trust_work_sample_images, '[]'::jsonb)
          end
        else
          case
            when jsonb_array_length(coalesce(requester_activity.work_sample_images, '[]'::jsonb)) > 0 then requester_activity.work_sample_images
            else coalesce(requester.trust_work_sample_images, '[]'::jsonb)
          end
      end as other_work_sample_images,
      case when c.requester_id = ${userId} then coalesce(helper_activity.available_time_text, helper.trust_response_time, helper.trust_response_time_text) else coalesce(requester_activity.available_time_text, requester.trust_response_time, requester.trust_response_time_text) end as other_response_time,
      exists (
        select 1
        from manwon_happiness.messages m
        where m.conversation_id = c.id
          and m.message_type <> 'system'
          and m.created_at > coalesce(d.started_at, d.accepted_at, c.created_at)
        group by m.conversation_id
        having count(distinct m.sender_id) >= 2
      ) as has_chat_after_started,
      (
        select r.id
        from manwon_happiness.reviews r
        where r.deal_id = c.deal_id
          and r.reviewer_id = ${userId}
        limit 1
      ) as my_review_id,
      (
        select count(*)::integer
        from manwon_happiness.messages m
        where m.conversation_id = c.id
          and m.sender_id <> ${userId}
          and (
            viewer_read_marker.id is null
            or m.created_at > viewer_read_marker.created_at
            or (
              m.created_at = viewer_read_marker.created_at
              and m.id::text > viewer_read_marker.id::text
            )
          )
      ) as unread_count
    from manwon_happiness.conversations c
    left join manwon_happiness.task_posts p on p.id = c.post_id
    left join manwon_happiness.deals d on d.id = c.deal_id
    left join manwon_happiness.conversation_read_states viewer_read
      on viewer_read.conversation_id = c.id
      and viewer_read.user_id = ${userId}
    left join manwon_happiness.messages viewer_read_marker
      on viewer_read_marker.id = viewer_read.last_read_message_id
    left join manwon_happiness.applications a on a.post_id = c.post_id
      and a.recruitment_round = c.recruitment_round
      and (
        (p.post_type = 'request' and a.applicant_id = c.helper_id)
        or (p.post_type = 'offer' and a.applicant_id = c.requester_id)
      )
    left join manwon_happiness.activity_profiles requester_activity on requester_activity.id = coalesce(
      d.requester_profile_id,
      case
        when p.post_type = 'request' then p.creator_profile_id
        when p.post_type = 'offer' then a.applicant_profile_id
        else null
      end
    )
    left join manwon_happiness.activity_profiles helper_activity on helper_activity.id = coalesce(
      d.helper_profile_id,
      case
        when p.post_type = 'request' then a.applicant_profile_id
        when p.post_type = 'offer' then p.creator_profile_id
        else null
      end
    )
    join manwon_happiness.users requester on requester.id = c.requester_id
    join manwon_happiness.users helper on helper.id = c.helper_id
    where (c.requester_id = ${userId} or c.helper_id = ${userId})
      and not exists (
        select 1 from manwon_happiness.blocks b
        where (
          b.blocker_id = ${userId}
          and b.blocked_user_id = case when c.requester_id = ${userId} then c.helper_id else c.requester_id end
        ) or (
          b.blocker_id = case when c.requester_id = ${userId} then c.helper_id else c.requester_id end
          and b.blocked_user_id = ${userId}
        )
      )
    order by coalesce(c.last_message_at, c.created_at) desc
  `
}

export async function resolveConversationTarget(userId: string, input: {
  conversationId?: string | null
  dealId?: string | null
  applicationId?: string | null
  postId?: string | null
}) {
  const sql = getSql()

  if (input.conversationId) {
    const rows = await sql`
      select id, post_id
      from manwon_happiness.conversations
      where id = ${input.conversationId}
        and (requester_id = ${userId} or helper_id = ${userId})
      limit 1
    `
    const conversation = rows[0]
    if (conversation?.id) {
      const conversationId = String(conversation.id)
      const postId = conversation.postId ? String(conversation.postId) : input.postId ?? null
      return { conversationId, postId, route: chatRoute(conversationId, postId) }
    }
  }

  if (input.dealId) {
    const rows = await sql`
      select id, post_id
      from manwon_happiness.conversations
      where deal_id = ${input.dealId}
        and (requester_id = ${userId} or helper_id = ${userId})
      order by coalesce(last_message_at, created_at) desc
      limit 1
    `
    const conversation = rows[0]
    if (conversation?.id) {
      const conversationId = String(conversation.id)
      const postId = conversation.postId ? String(conversation.postId) : input.postId ?? null
      return { conversationId, postId, route: chatRoute(conversationId, postId) }
    }
  }

  if (input.applicationId) {
    const rows = await sql`
      select c.id, c.post_id
      from manwon_happiness.applications a
      join manwon_happiness.task_posts p on p.id = a.post_id
      join manwon_happiness.conversations c on c.post_id = a.post_id
        and c.recruitment_round = a.recruitment_round
        and (
          (p.post_type = 'request' and c.requester_id = p.creator_id and c.helper_id = a.applicant_id)
          or (p.post_type = 'offer' and c.requester_id = a.applicant_id and c.helper_id = p.creator_id)
        )
        and (c.requester_id = ${userId} or c.helper_id = ${userId})
      where a.id = ${input.applicationId}
      order by coalesce(c.last_message_at, c.created_at) desc
      limit 1
    `
    const conversation = rows[0]
    if (conversation?.id) {
      const conversationId = String(conversation.id)
      const postId = conversation.postId ? String(conversation.postId) : input.postId ?? null
      return { conversationId, postId, route: chatRoute(conversationId, postId) }
    }
  }

  if (input.postId) {
    const rows = await sql`
      select id, post_id
      from manwon_happiness.conversations
      where post_id = ${input.postId}
        and (requester_id = ${userId} or helper_id = ${userId})
      order by coalesce(last_message_at, created_at) desc
      limit 1
    `
    const conversation = rows[0]
    if (conversation?.id) {
      const conversationId = String(conversation.id)
      const postId = conversation.postId ? String(conversation.postId) : input.postId
      return { conversationId, postId, route: chatRoute(conversationId, postId) }
    }

    return { conversationId: null, postId: input.postId, route: chatRoute(null, input.postId) }
  }

  return { conversationId: null, postId: null, route: null }
}

export async function createConversation(userId: string, input: CreateConversationInput) {
  if (input.requesterId !== userId && input.helperId !== userId) return null
  await assertPhoneVerified(userId)

  const sql = getSql()
  const rows = await sql`
    insert into manwon_happiness.conversations (deal_id, post_id, requester_id, helper_id, recruitment_round)
    select
      ${input.dealId ?? null},
      ${input.postId ?? null},
      ${input.requesterId},
      ${input.helperId},
      coalesce(
        (select d.recruitment_round from manwon_happiness.deals d where d.id = ${input.dealId ?? null}),
        (select p.recruitment_round from manwon_happiness.task_posts p where p.id = ${input.postId ?? null}),
        1
      )
    where not exists (
      select 1
      from manwon_happiness.blocks b
      where (
        b.blocker_id = ${input.requesterId}
        and b.blocked_user_id = ${input.helperId}
      )
      or (
        b.blocker_id = ${input.helperId}
        and b.blocked_user_id = ${input.requesterId}
      )
    )
    on conflict do nothing
    returning *
  `

  if (rows[0]) return rows[0]

  const existingRows = input.dealId
    ? await sql`select * from manwon_happiness.conversations where deal_id = ${input.dealId} limit 1`
    : await sql`
        select c.*
        from manwon_happiness.conversations c
        join manwon_happiness.task_posts p on p.id = c.post_id
        where c.post_id = ${input.postId ?? null}
          and c.requester_id = ${input.requesterId}
          and c.helper_id = ${input.helperId}
          and c.recruitment_round = p.recruitment_round
        limit 1
      `

  return existingRows[0] ?? null
}

export async function startConversationForPost(userId: string, postId: string, profileId: string, message?: string | null) {
  await assertPhoneVerified(userId)
  await assertOwnedActiveActivityProfile(userId, profileId)

  const sql = getSql()

  const result = await sql.begin(async (tx) => {
    const postRows = await tx`
      select p.*, capacity_stats.occupied_count as occupied_count
      from manwon_happiness.task_posts p
      left join lateral (
        select
          count(d.id) filter (
            where d.status = 'completed'
          )::integer as occupied_count
        from manwon_happiness.deals d
        where d.post_id = p.id
      ) capacity_stats on true
      where p.id = ${postId}
        and p.status = 'open'
        and p.creator_id <> ${userId}
        and not exists (
          select 1 from manwon_happiness.blocks b
          where b.blocker_id = ${userId} and b.blocked_user_id = p.creator_id
        )
        and not exists (
          select 1 from manwon_happiness.blocks b
          where b.blocker_id = p.creator_id and b.blocked_user_id = ${userId}
        )
      limit 1
    `
    const post = postRows[0]
    if (!post) return null
    if (post.capacityType === 'limited' && post.capacityLimit != null && Number(post.occupiedCount ?? 0) >= Number(post.capacityLimit)) {
      await refreshPostCapacity(tx, postId)
      return null
    }

    const requesterId = post.postType === 'request' ? post.creatorId : userId
    const helperId = post.postType === 'request' ? userId : post.creatorId
    const postTitle = post.title ? String(post.title).trim() : ''
    const applicationSystemMessage = postTitle
      ? `"${postTitle}"에 지원 요청이 도착했어요. 작성자가 수락하면 거래가 시작됩니다.`
      : '지원 요청이 도착했어요. 작성자가 수락하면 거래가 시작됩니다.'
    const initialLastMessage = post.postType === 'request' ? applicationSystemMessage : message ?? '문의가 시작되었어요.'

    let previousApplicationStatus: string | null = null
    let applicationId: string | null = null
    if (post.postType === 'request' || post.postType === 'offer') {
      const [existingApplication] = await tx`
        select status
        from manwon_happiness.applications
        where post_id = ${postId}
          and applicant_id = ${userId}
          and recruitment_round = ${post.recruitmentRound}
        limit 1
      `
      previousApplicationStatus = existingApplication?.status ? String(existingApplication.status) : null
      if (previousApplicationStatus !== null && previousApplicationStatus !== 'rejected') {
        throw new HttpError('이미 보낸 요청입니다. 거절된 경우에만 다시 보낼 수 있습니다.', 409)
      }

      const applicationRows = await tx`
        insert into manwon_happiness.applications (post_id, applicant_id, applicant_profile_id, message, recruitment_round)
        values (${postId}, ${userId}, ${profileId}, ${message ?? (post.postType === 'request' ? '도와드릴 수 있어요.' : '문의드려요.')}, ${post.recruitmentRound})
        on conflict (post_id, applicant_id, recruitment_round) do update
          set applicant_profile_id = excluded.applicant_profile_id,
              message = coalesce(excluded.message, manwon_happiness.applications.message),
              status = 'applied'::manwon_happiness.application_status,
              updated_at = now()
          where manwon_happiness.applications.status = 'rejected'
        returning id
      `
      if (applicationRows.length === 0) {
        throw new HttpError('이미 보낸 요청입니다. 거절된 경우에만 다시 보낼 수 있습니다.', 409)
      }
      applicationId = applicationRows[0]?.id ? String(applicationRows[0].id) : null
    }

    const insertedRows = await tx`
      insert into manwon_happiness.conversations (post_id, requester_id, helper_id, recruitment_round, last_message, last_message_at)
      values (${postId}, ${requesterId}, ${helperId}, ${post.recruitmentRound}, ${initialLastMessage}, now())
      on conflict do nothing
      returning *
    `

    const conversationRows =
      insertedRows.length > 0
        ? insertedRows
        : await tx`
            select *
            from manwon_happiness.conversations
            where post_id = ${postId}
              and requester_id = ${requesterId}
              and helper_id = ${helperId}
              and recruitment_round = ${post.recruitmentRound}
            limit 1
          `

    const conversation = conversationRows[0]
    if (!conversation) return null

    const messageCountRows = await tx`
      select count(*)::integer as count
      from manwon_happiness.messages
      where conversation_id = ${conversation.id}
    `

    const shouldAddReapplicationMessage =
      post.postType === 'request' && previousApplicationStatus === 'rejected'
    const shouldAddSystemMessage = Number(messageCountRows[0]?.count ?? 0) === 0 || shouldAddReapplicationMessage

    if (shouldAddSystemMessage) {
      const systemMessage = post.postType === 'request' ? applicationSystemMessage : '문의가 시작되었어요.'
      await tx`
        insert into manwon_happiness.messages (conversation_id, sender_id, message_type, body)
        values (${conversation.id}, ${userId}, 'system', ${systemMessage})
      `
      await tx`
        update manwon_happiness.conversations
        set last_message = ${systemMessage},
            last_message_at = now()
        where id = ${conversation.id}
      `
    }

    return {
      conversation,
      postType: String(post.postType),
      postTitle: post.title ? String(post.title) : null,
      notifyUserId: String(post.creatorId),
      applicationId,
    }
  })

  if (!result) return null

  void createNotificationEvent(result.notifyUserId, {
    type: result.postType === 'request' ? 'application.created' : 'conversation.started',
    title: result.postType === 'request' ? '새 지원이 도착했어요' : '새 문의가 도착했어요',
    body: result.postTitle ? `"${result.postTitle}"에서 대화가 시작됐습니다.` : '새 대화가 시작됐습니다.',
    data: chatNotificationData({
      type: result.postType === 'request' ? 'application.created' : 'conversation.started',
      conversationId: String(result.conversation.id),
      postId,
      applicationId: result.applicationId,
    }),
  }).catch(() => undefined)

  return result.conversation
}

export async function listMessages(userId: string, conversationId: string, options: { after?: string | null } = {}) {
  const sql = getSql()
  return sql.begin(async (tx) => {
    const conversationRows = await tx`
      select 1
      from manwon_happiness.conversations c
      where c.id = ${conversationId}
        and (c.requester_id = ${userId} or c.helper_id = ${userId})
        and not exists (
          select 1
          from manwon_happiness.blocks b
          where (
            b.blocker_id = ${userId}
            and b.blocked_user_id = case when c.requester_id = ${userId} then c.helper_id else c.requester_id end
          )
          or (
            b.blocker_id = case when c.requester_id = ${userId} then c.helper_id else c.requester_id end
            and b.blocked_user_id = ${userId}
          )
        )
      limit 1
    `

    if (!conversationRows[0]) return null

    if (options.after) {
      return tx`
        select
          m.id,
          m.conversation_id,
          m.sender_id,
          m.message_type,
          m.body,
          m.image_url,
          m.client_message_id,
          m.delivered_at,
          case
            when m.sender_id = ${userId}
              and other_read_marker.id is not null
              and (
                other_read_marker.created_at > m.created_at
                or (other_read_marker.created_at = m.created_at and other_read_marker.id::text >= m.id::text)
              )
              then coalesce(other_read.last_read_at, m.read_at)
            else m.read_at
          end as read_at,
          m.created_at
        from manwon_happiness.messages m
        left join manwon_happiness.conversation_read_states other_read
          on other_read.conversation_id = m.conversation_id
          and other_read.user_id <> ${userId}
        left join manwon_happiness.messages other_read_marker
          on other_read_marker.id = other_read.last_read_message_id
        where m.conversation_id = ${conversationId}
          and m.created_at > ${options.after}::timestamptz
        order by m.created_at asc
      `
    }

    return tx`
      select
        m.id,
        m.conversation_id,
        m.sender_id,
        m.message_type,
        m.body,
        m.image_url,
        m.client_message_id,
        m.delivered_at,
        case
          when m.sender_id = ${userId}
            and other_read_marker.id is not null
            and (
              other_read_marker.created_at > m.created_at
              or (other_read_marker.created_at = m.created_at and other_read_marker.id::text >= m.id::text)
            )
            then coalesce(other_read.last_read_at, m.read_at)
          else m.read_at
        end as read_at,
        m.created_at
      from manwon_happiness.messages m
      left join manwon_happiness.conversation_read_states other_read
        on other_read.conversation_id = m.conversation_id
        and other_read.user_id <> ${userId}
      left join manwon_happiness.messages other_read_marker
        on other_read_marker.id = other_read.last_read_message_id
      where m.conversation_id = ${conversationId}
      order by m.created_at asc
    `
  })
}

export async function markConversationRead(userId: string, conversationId: string, input: { lastMessageId?: string | null } = {}) {
  const sql = getSql()
  return sql.begin(async (tx) => {
    const conversationRows = await tx`
      select 1
      from manwon_happiness.conversations c
      where c.id = ${conversationId}
        and (c.requester_id = ${userId} or c.helper_id = ${userId})
        and not exists (
          select 1
          from manwon_happiness.blocks b
          where (
            b.blocker_id = ${userId}
            and b.blocked_user_id = case when c.requester_id = ${userId} then c.helper_id else c.requester_id end
          )
          or (
            b.blocker_id = case when c.requester_id = ${userId} then c.helper_id else c.requester_id end
            and b.blocked_user_id = ${userId}
          )
        )
      limit 1
    `
    if (!conversationRows[0]) return null

    const targetRows = input.lastMessageId
      ? await tx`
          select id, created_at
          from manwon_happiness.messages
          where id = ${input.lastMessageId}
            and conversation_id = ${conversationId}
          limit 1
        `
      : await tx`
          select id, created_at
          from manwon_happiness.messages
          where conversation_id = ${conversationId}
          order by created_at desc, id desc
          limit 1
        `

    const target = targetRows[0]
    if (!target) return { readCount: 0, lastReadMessageId: null, lastReadAt: null }

    const currentRows = await tx`
      select s.*, marker.created_at as marker_created_at
      from manwon_happiness.conversation_read_states s
      left join manwon_happiness.messages marker on marker.id = s.last_read_message_id
      where s.conversation_id = ${conversationId}
        and s.user_id = ${userId}
      limit 1
    `
    const current = currentRows[0]
    const currentCreatedAt = current?.markerCreatedAt ? new Date(current.markerCreatedAt).getTime() : 0
    const targetCreatedAt = new Date(target.createdAt).getTime()
    const currentMessageId = current?.lastReadMessageId ? String(current.lastReadMessageId) : null
    const targetMessageId = String(target.id)
    if (
      currentMessageId &&
      (
        currentCreatedAt > targetCreatedAt ||
        (currentCreatedAt === targetCreatedAt && currentMessageId >= targetMessageId)
      )
    ) {
      return {
        readCount: 0,
        lastReadMessageId: currentMessageId,
        lastReadAt: current.lastReadAt ? String(current.lastReadAt) : null,
      }
    }

    const rows = await tx`
      insert into manwon_happiness.conversation_read_states (
        conversation_id,
        user_id,
        last_read_message_id,
        last_read_at
      )
      values (${conversationId}, ${userId}, ${target.id}, now())
      on conflict (conversation_id, user_id) do update
        set last_read_message_id = excluded.last_read_message_id,
            last_read_at = excluded.last_read_at,
            updated_at = now()
      returning *
    `

    return {
      readCount: 0,
      lastReadMessageId: rows[0]?.lastReadMessageId ? String(rows[0].lastReadMessageId) : null,
      lastReadAt: rows[0]?.lastReadAt ? String(rows[0].lastReadAt) : null,
    }
  })
}

export async function sendMessage(userId: string, conversationId: string, input: CreateMessageInput) {
  await assertPhoneVerified(userId)

  const sql = getSql()
  const result = await sql.begin(async (tx) => {
    const conversationRows = await tx`
      select
        c.*,
        p.title as post_title,
        p.post_type as post_type,
        d.chat_blocked_at as deal_chat_blocked_at,
        d.report_reason as deal_report_reason,
        a.status as application_status,
        sender.nickname as sender_nickname,
        case when c.requester_id = ${userId} then c.helper_id else c.requester_id end as other_user_id
      from manwon_happiness.conversations c
      left join manwon_happiness.task_posts p on p.id = c.post_id
      left join manwon_happiness.deals d on d.id = c.deal_id
      left join manwon_happiness.applications a on a.post_id = c.post_id
        and a.recruitment_round = c.recruitment_round
        and (
          (p.post_type = 'request' and a.applicant_id = c.helper_id)
          or (p.post_type = 'offer' and a.applicant_id = c.requester_id)
        )
      left join manwon_happiness.users sender on sender.id = ${userId}
      where c.id = ${conversationId}
        and (c.requester_id = ${userId} or c.helper_id = ${userId})
      limit 1
    `
    const conversation = conversationRows[0]
    if (!conversation) return null

    if (conversation.postType === 'request' && !conversation.dealId && conversation.applicationStatus === 'applied') {
      throw new HttpError('지원 요청이 수락되면 채팅을 할 수 있습니다.', 403)
    }
    if (conversation.dealChatBlockedAt) {
      const reason = conversation.dealReportReason ? `‘${String(conversation.dealReportReason)}’ 문제 신고로 ` : ''
      throw new HttpError(`${reason}이 거래 채팅이 차단되었습니다.`, 403)
    }

    const blockedRows = await tx`
      select 1
      from manwon_happiness.blocks b
      where (
        b.blocker_id = ${conversation.otherUserId}
        and b.blocked_user_id = ${userId}
      )
      or (
        b.blocker_id = ${userId}
        and b.blocked_user_id = ${conversation.otherUserId}
      )
      limit 1
    `
    if (blockedRows[0]) return null

    if (input.clientMessageId) {
      const existingRows = await tx`
        select *
        from manwon_happiness.messages
        where conversation_id = ${conversationId}
          and sender_id = ${userId}
          and client_message_id = ${input.clientMessageId}
        limit 1
      `
      if (existingRows[0]) return existingRows[0]
    }

    const rows = await tx`
      insert into manwon_happiness.messages (
        conversation_id,
        sender_id,
        message_type,
        body,
        image_url,
        client_message_id,
        delivered_at
      )
      values (
        ${conversationId},
        ${userId},
        ${input.messageType},
        ${input.body ?? null},
        ${input.imageUrl ?? null},
        ${input.clientMessageId ?? null},
        now()
      )
      returning *
    `

    const message = rows[0]
    if (!message) return null

    const lastMessage = input.body ?? (input.messageType === 'image' ? '사진을 보냈습니다.' : '시스템 메시지')
    await tx`
      update manwon_happiness.conversations
      set last_message = ${lastMessage},
          last_message_at = now()
      where id = ${conversationId}
    `

    return {
      message,
      lastMessage,
      notifyUserId: String(conversation.otherUserId),
      senderNickname: conversation.senderNickname ? String(conversation.senderNickname) : '뭐든해줌',
      postId: conversation.postId ? String(conversation.postId) : null,
      dealId: conversation.dealId ? String(conversation.dealId) : null,
    }
  })

  if (!result) return null

  void createNotificationEvent(result.notifyUserId, {
    type: 'message.new',
    title: `${result.senderNickname}님의 새 메시지`,
    body: result.lastMessage,
    data: chatNotificationData({
      type: 'message.new',
      conversationId,
      messageId: String(result.message.id),
      postId: result.postId,
      dealId: result.dealId,
    }),
  }).catch(() => undefined)

  return result.message
}

export async function createReview(userId: string, input: CreateReviewInput) {
  const sql = getSql()
  const result = await sql.begin(async (tx) => {
    const dealRows = await tx`
      select d.*, p.title as post_title, c.id as conversation_id
      from manwon_happiness.deals d
      join manwon_happiness.task_posts p on p.id = d.post_id
      left join manwon_happiness.conversations c on c.deal_id = d.id
      where d.id = ${input.dealId}
        and d.status = 'completed'
        and (d.requester_id = ${userId} or d.helper_id = ${userId})
      for update of d
      limit 1
    `
    const deal = dealRows[0]
    if (!deal) return null

    const revieweeId = String(deal.requesterId) === userId ? String(deal.helperId) : String(deal.requesterId)
    const reviewerProfileId = String(deal.requesterId) === userId ? deal.requesterProfileId : deal.helperProfileId
    const revieweeProfileId = String(deal.requesterId) === userId ? deal.helperProfileId : deal.requesterProfileId
    const content = input.content?.trim() || null
    const reviewRows = await tx`
      insert into manwon_happiness.reviews (deal_id, reviewer_id, reviewee_id, reviewer_profile_id, reviewee_profile_id, rating, content)
      values (${input.dealId}, ${userId}, ${revieweeId}, ${reviewerProfileId ?? null}, ${revieweeProfileId ?? null}, ${input.rating}, ${content})
      on conflict (deal_id, reviewer_id) do update
        set rating = excluded.rating,
            content = excluded.content,
            reviewer_profile_id = excluded.reviewer_profile_id,
            reviewee_profile_id = excluded.reviewee_profile_id
      returning *
    `
    const review = reviewRows[0]
    if (!review) return null

    await tx`
      update manwon_happiness.review_reminders
      set cancelled_at = coalesce(cancelled_at, now()),
          updated_at = now()
      where deal_id = ${input.dealId}
        and user_id = ${userId}
    `

    await tx`
      update manwon_happiness.users p
      set review_count = stats.review_count,
          rating_avg = stats.rating_avg
      from (
        select reviewee_id, count(*)::integer as review_count, coalesce(round(avg(rating)::numeric, 2), 0) as rating_avg
        from manwon_happiness.reviews
        where reviewee_id = ${revieweeId}
        group by reviewee_id
      ) stats
      where p.id = stats.reviewee_id
    `

    return {
      review,
      revieweeId,
      conversationId: deal.conversationId ? String(deal.conversationId) : null,
      postTitle: deal.postTitle ? String(deal.postTitle) : null,
    }
  })

  if (!result) return null

  void createNotificationEvent(result.revieweeId, {
    type: 'review.created',
    title: '새 후기가 도착했어요',
    body: result.postTitle ? `"${result.postTitle}" 거래 후기가 등록됐습니다.` : '거래 후기가 등록됐습니다.',
    data: chatNotificationData({
      type: 'review.created',
      conversationId: result.conversationId,
      dealId: String(result.review.dealId),
    }),
  }).catch(() => undefined)

  return result.review
}

export async function listUserReceivedReviews(userId: string, limit = 50) {
  const sql = getSql()
  return sql`
    select
      r.id,
      r.deal_id,
      r.reviewer_id,
      r.reviewee_id,
      r.rating,
      r.content,
      r.created_at,
      coalesce(reviewer_profile.nickname, reviewer.nickname) as reviewer_nickname,
      coalesce(reviewer_profile.avatar_url, reviewer.avatar_url) as reviewer_avatar_url,
      reviewer_profile.default_avatar_key as reviewer_default_avatar_key,
      p.title as post_title
    from manwon_happiness.reviews r
    join manwon_happiness.users reviewer on reviewer.id = r.reviewer_id
    left join manwon_happiness.activity_profiles reviewer_profile on reviewer_profile.id = r.reviewer_profile_id
    left join manwon_happiness.deals d on d.id = r.deal_id
    left join manwon_happiness.task_posts p on p.id = d.post_id
    where r.reviewee_id = ${userId}
    order by r.created_at desc
    limit ${Math.max(1, Math.min(limit, 100))}
  `
}

export async function scheduleReviewReminder(userId: string, input: ReviewReminderInput) {
  const sql = getSql()
  const rows = await sql`
    insert into manwon_happiness.review_reminders (deal_id, user_id, due_at)
    select d.id, ${userId}, now() + interval '1 day'
    from manwon_happiness.deals d
    where d.id = ${input.dealId}
      and d.status = 'completed'
      and (d.requester_id = ${userId} or d.helper_id = ${userId})
      and not exists (
        select 1
        from manwon_happiness.reviews r
        where r.deal_id = d.id
          and r.reviewer_id = ${userId}
      )
    on conflict (deal_id, user_id) do update
      set due_at = now() + interval '1 day',
          sent_at = null,
          cancelled_at = null,
          updated_at = now()
    returning *
  `

  return rows[0] ?? null
}

export async function getDueReviewReminder(userId: string) {
  const sql = getSql()
  const rows = await sql`
    select
      rr.*,
      c.id as conversation_id,
      p.title as post_title
    from manwon_happiness.review_reminders rr
    join manwon_happiness.deals d on d.id = rr.deal_id
    join manwon_happiness.task_posts p on p.id = d.post_id
    left join manwon_happiness.conversations c on c.deal_id = d.id
    where rr.user_id = ${userId}
      and rr.due_at <= now()
      and rr.cancelled_at is null
      and d.status = 'completed'
      and not exists (
        select 1
        from manwon_happiness.reviews r
        where r.deal_id = rr.deal_id
          and r.reviewer_id = rr.user_id
      )
    order by rr.due_at asc
    limit 1
  `

  return rows[0] ?? null
}

export async function processDueReviewReminders(limit = 100) {
  const sql = getSql()
  const cappedLimit = Math.min(Math.max(limit, 1), 500)
  const reminders = await sql.begin(async (tx) => tx`
    with due as (
      select
        rr.id,
        rr.user_id,
        rr.deal_id,
        c.id as conversation_id,
        p.title as post_title
      from manwon_happiness.review_reminders rr
      join manwon_happiness.deals d on d.id = rr.deal_id
      join manwon_happiness.task_posts p on p.id = d.post_id
      left join manwon_happiness.conversations c on c.deal_id = d.id
      where rr.due_at <= now()
        and rr.sent_at is null
        and rr.cancelled_at is null
        and d.status = 'completed'
        and not exists (
          select 1
          from manwon_happiness.reviews r
          where r.deal_id = rr.deal_id
            and r.reviewer_id = rr.user_id
        )
      order by rr.due_at asc
      limit ${cappedLimit}
      for update of rr skip locked
    ),
    updated as (
      update manwon_happiness.review_reminders rr
      set sent_at = now(),
          updated_at = now()
      from due
      where rr.id = due.id
      returning rr.id, rr.user_id, rr.deal_id, due.conversation_id, due.post_title
    )
    select * from updated
  `)

  await Promise.all(reminders.map((reminder) => createNotificationEvent(String(reminder.userId), {
    type: 'review.reminder',
    title: '거래 후기를 남겨주세요',
    body: reminder.postTitle ? `"${String(reminder.postTitle)}" 거래는 어떠셨나요?` : '완료된 거래는 어떠셨나요?',
    data: chatNotificationData({
      type: 'review.reminder',
      conversationId: reminder.conversationId ? String(reminder.conversationId) : null,
      dealId: String(reminder.dealId),
    }),
  }).catch(() => undefined)))

  return { processed: reminders.length }
}

export async function getMyActivity(userId: string) {
  const sql = getSql()
  const [myPosts, requestDeals, helpedDeals, favorites, receivedReviews, writtenReviews, reports, blocks] = await Promise.all([
    sql`
      select
        p.*,
        (
          select c.id
          from manwon_happiness.conversations c
          where c.post_id = p.id
            and (c.requester_id = ${userId} or c.helper_id = ${userId})
          order by c.last_message_at desc nulls last, c.created_at desc
          limit 1
        ) as conversation_id,
        count(distinct f.id)::integer as favorite_count,
        count(distinct a.id)::integer as application_count
      from manwon_happiness.task_posts p
      left join manwon_happiness.favorites f on f.post_id = p.id
      left join manwon_happiness.applications a on a.post_id = p.id
      where p.creator_id = ${userId}
        and p.post_type = 'request'
        and p.status <> 'hidden'
      group by p.id
      order by p.created_at desc
      limit 50
    `,
    sql`
      select
        d.*,
        c.id as conversation_id,
        p.title as post_title,
        p.category as post_category,
        p.mode as post_mode,
        p.deadline_at as post_deadline_at,
        p.deadline_text as post_deadline_text,
        p.available_time_text as post_available_time_text,
        p.address_text as post_address_text,
        p.region_2depth as post_region_2depth,
        p.region_3depth as post_region_3depth,
        p.post_type as post_type,
        requester.nickname as requester_nickname,
        requester.avatar_url as requester_avatar_url,
        helper.nickname as helper_nickname,
        helper.avatar_url as helper_avatar_url,
        helper.nickname as counterpart_nickname,
        helper.avatar_url as counterpart_avatar_url,
        'requester' as activity_role
      from manwon_happiness.deals d
      join manwon_happiness.task_posts p on p.id = d.post_id
      join manwon_happiness.users requester on requester.id = d.requester_id
      join manwon_happiness.users helper on helper.id = d.helper_id
      left join manwon_happiness.conversations c on c.deal_id = d.id
      where d.requester_id = ${userId}
        and p.creator_id = ${userId}
        and p.post_type = 'request'
      order by d.created_at desc
      limit 50
    `,
    sql`
      select
        d.*,
        c.id as conversation_id,
        p.title as post_title,
        p.category as post_category,
        p.mode as post_mode,
        p.deadline_at as post_deadline_at,
        p.deadline_text as post_deadline_text,
        p.available_time_text as post_available_time_text,
        p.address_text as post_address_text,
        p.region_2depth as post_region_2depth,
        p.region_3depth as post_region_3depth,
        p.post_type as post_type,
        requester.nickname as requester_nickname,
        requester.avatar_url as requester_avatar_url,
        helper.nickname as helper_nickname,
        helper.avatar_url as helper_avatar_url,
        requester.nickname as counterpart_nickname,
        requester.avatar_url as counterpart_avatar_url,
        'helper' as activity_role
      from manwon_happiness.deals d
      join manwon_happiness.task_posts p on p.id = d.post_id
      join manwon_happiness.users requester on requester.id = d.requester_id
      join manwon_happiness.users helper on helper.id = d.helper_id
      left join manwon_happiness.conversations c on c.deal_id = d.id
      where d.helper_id = ${userId}
        and (
          (p.post_type = 'offer' and p.creator_id = ${userId})
          or p.post_type = 'request'
        )
        and not (
          d.requester_id = ${userId}
          and p.creator_id = ${userId}
          and p.post_type = 'request'
        )
      order by d.created_at desc
      limit 50
    `,
    sql`
      select
        f.*,
        p.creator_id as post_creator_id,
        p.title as post_title,
        p.category as post_category,
        p.price as post_price,
        p.status as post_status,
        p.mode as post_mode,
        p.deadline_at as post_deadline_at,
        p.deadline_text as post_deadline_text,
        p.available_time_text as post_available_time_text,
        p.address_text as post_address_text,
        p.region_2depth as post_region_2depth,
        p.region_3depth as post_region_3depth
      from manwon_happiness.favorites f
      join manwon_happiness.task_posts p on p.id = f.post_id
      where f.user_id = ${userId}
        and p.status <> 'hidden'
      order by f.created_at desc
      limit 50
    `,
    sql`
      select
        r.*,
        reviewer.nickname as reviewer_nickname,
        reviewer.avatar_url as reviewer_avatar_url,
        p.title as post_title
      from manwon_happiness.reviews r
      join manwon_happiness.users reviewer on reviewer.id = r.reviewer_id
      left join manwon_happiness.deals d on d.id = r.deal_id
      left join manwon_happiness.task_posts p on p.id = d.post_id
      where r.reviewee_id = ${userId}
      order by r.created_at desc
      limit 50
    `,
    sql`
      select
        r.*,
        reviewee.nickname as reviewee_nickname,
        p.title as post_title
      from manwon_happiness.reviews r
      join manwon_happiness.users reviewee on reviewee.id = r.reviewee_id
      left join manwon_happiness.deals d on d.id = r.deal_id
      left join manwon_happiness.task_posts p on p.id = d.post_id
      where r.reviewer_id = ${userId}
      order by r.created_at desc
      limit 50
    `,
    sql`
      select
        r.*,
        target.nickname as target_nickname,
        p.title as post_title
      from manwon_happiness.reports r
      left join manwon_happiness.users target on target.id = r.target_user_id
      left join manwon_happiness.task_posts p on p.id = r.post_id
      where r.reporter_id = ${userId}
      order by r.created_at desc
      limit 50
    `,
    sql`
      select
        b.*,
        blocked.nickname as blocked_nickname,
        blocked.avatar_url as blocked_avatar_url
      from manwon_happiness.blocks b
      join manwon_happiness.users blocked on blocked.id = b.blocked_user_id
      where b.blocker_id = ${userId}
      order by b.created_at desc
      limit 50
    `,
  ])

  return { myPosts, requestDeals, helpedDeals, favorites, receivedReviews, writtenReviews, reports, blocks }
}

export async function getMyPage(userId: string) {
  const sql = getSql()
  const rows = await sql`
    select
      p.*,
      default_activity_profile.id as default_activity_profile_id,
      default_activity_profile.avatar_url as default_activity_profile_avatar_url,
      default_activity_profile.default_avatar_key as default_activity_profile_default_avatar_key,
      default_activity_profile.nickname as default_activity_profile_nickname,
      default_activity_profile.bio as default_activity_profile_bio,
      (select count(*)::integer from manwon_happiness.task_posts where creator_id = ${userId} and status <> 'hidden') as posts_count,
      (select count(*)::integer from manwon_happiness.deals where helper_id = ${userId}) as helping_count,
      (select count(*)::integer from manwon_happiness.task_posts where creator_id = ${userId} and status in ('open', 'pending', 'in_progress')) as active_posts_count,
      (select count(*)::integer from manwon_happiness.deals where helper_id = ${userId} and status in ('accepted', 'in_progress', 'complete_requested')) as active_helping_count,
      (
        select count(*)::integer
        from manwon_happiness.favorites f
        join manwon_happiness.task_posts tp on tp.id = f.post_id
        where f.user_id = ${userId}
          and tp.status <> 'hidden'
      ) as favorite_count,
      (select count(*)::integer from manwon_happiness.reviews where reviewee_id = ${userId}) as received_review_count
    from manwon_happiness.users p
    left join lateral (
      select id, avatar_url, default_avatar_key, nickname, bio
      from manwon_happiness.activity_profiles
      where user_id = p.id
        and is_active = true
      order by created_at asc
      limit 1
    ) default_activity_profile on true
    where p.id = ${userId}
    limit 1
  `

  return rows[0] ?? null
}

export async function updateLocationPreference(
  userId: string,
  input: {
    latitude?: number | null
    longitude?: number | null
    region1Depth?: string | null
    region2Depth?: string | null
    region3Depth?: string | null
    permissionStatus?: 'unknown' | 'prompt' | 'granted' | 'denied' | 'unavailable'
  },
) {
  const sql = getSql()
  const rows = await sql`
    update manwon_happiness.users
    set default_latitude = ${input.latitude ?? null},
        default_longitude = ${input.longitude ?? null},
        default_region_1depth = ${input.region1Depth ?? null},
        default_region_2depth = ${input.region2Depth ?? null},
        default_region_3depth = ${input.region3Depth ?? null},
        location_permission_status = ${input.permissionStatus ?? 'unknown'},
        updated_at = now()
    where id = ${userId}
    returning *
  `

  return rows[0] ?? null
}

function normalizeSettlementMonth(value?: string | null) {
  if (value && /^\d{4}-\d{2}$/.test(value)) return value
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function addMonths(month: string, offset: number) {
  const [year, monthIndex] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, monthIndex - 1 + offset, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function formatSettlementMonthLabel(month: string) {
  const [year, monthIndex] = month.split('-')
  return `${year.slice(2)}년 ${Number(monthIndex)}월`
}

export async function getSettlementSummary(userId: string, month?: string | null) {
  const selectedMonth = normalizeSettlementMonth(month)
  const firstChartMonth = addMonths(selectedMonth, -5)
  const afterSelectedMonth = addMonths(selectedMonth, 1)
  const sql = getSql()
  const [rows, monthlyRows, recentIncome] = await Promise.all([
    sql`
      select
        coalesce((select sum(price)::integer from manwon_happiness.deals where helper_id = ${userId} and status = 'completed'), 0) as total_revenue,
        coalesce((select sum(amount)::integer from manwon_happiness.settlements where user_id = ${userId} and status = 'completed'), 0) as completed_settlements,
        coalesce((select sum(amount)::integer from manwon_happiness.settlements where user_id = ${userId} and status in ('requested', 'processing')), 0) as pending_settlements,
        coalesce((
          select sum(price)::integer
          from manwon_happiness.deals
          where helper_id = ${userId}
            and status = 'completed'
            and coalesce(completed_at, updated_at, created_at) >= ${`${selectedMonth}-01`}::date
            and coalesce(completed_at, updated_at, created_at) < (${`${selectedMonth}-01`}::date + interval '1 month')
        ), 0) as month_revenue,
        coalesce((
          select count(*)::integer
          from manwon_happiness.deals
          where helper_id = ${userId}
            and status = 'completed'
            and coalesce(completed_at, updated_at, created_at) >= ${`${selectedMonth}-01`}::date
            and coalesce(completed_at, updated_at, created_at) < (${`${selectedMonth}-01`}::date + interval '1 month')
        ), 0) as month_deal_count
    `,
    sql`
      select
        to_char(coalesce(completed_at, updated_at, created_at) at time zone 'Asia/Seoul', 'YYYY-MM') as month,
        coalesce(sum(price)::integer, 0) as amount
      from manwon_happiness.deals
      where helper_id = ${userId}
        and status = 'completed'
        and coalesce(completed_at, updated_at, created_at) >= ${`${firstChartMonth}-01`}::date
        and coalesce(completed_at, updated_at, created_at) < ${`${afterSelectedMonth}-01`}::date
      group by 1
      order by 1 asc
    `,
    sql`
      select
        d.id,
        d.price as amount,
        coalesce(d.completed_at, d.updated_at, d.created_at) as completed_at,
        p.title,
        p.category
      from manwon_happiness.deals d
      join manwon_happiness.task_posts p on p.id = d.post_id
      where d.helper_id = ${userId}
        and d.status = 'completed'
        and coalesce(d.completed_at, d.updated_at, d.created_at) >= ${`${selectedMonth}-01`}::date
        and coalesce(d.completed_at, d.updated_at, d.created_at) < (${`${selectedMonth}-01`}::date + interval '1 month')
      order by coalesce(d.completed_at, d.updated_at, d.created_at) desc
      limit 20
    `,
  ])
  const summary = rows[0] ?? { totalRevenue: 0, completedSettlements: 0, pendingSettlements: 0 }
  const available = Math.max(0, Number(summary.totalRevenue) - Number(summary.completedSettlements) - Number(summary.pendingSettlements))
  const monthlyMap = new Map(monthlyRows.map((row) => [String(row.month), Number(row.amount)]))
  const monthlyRevenue = Array.from({ length: 6 }, (_, index) => {
    const itemMonth = addMonths(selectedMonth, index - 5)
    return {
      month: itemMonth,
      label: formatSettlementMonthLabel(itemMonth),
      amount: monthlyMap.get(itemMonth) ?? 0,
    }
  })

  return {
    ...summary,
    selectedMonth,
    available,
    monthlyRevenue,
    recentIncome,
  }
}

export async function withdrawMyAccount(userId: string) {
  const sql = getSql()
  const withdrawnAt = new Date()

  return sql.begin(async (tx) => {
    await tx`
      update manwon_happiness.task_posts
      set status = 'hidden',
          updated_at = now()
      where creator_id = ${userId}
        and status in ('open', 'pending', 'in_progress')
    `

    const [profile] = await tx`
      update manwon_happiness.users
      set nickname = '탈퇴한 사용자',
          display_name = null,
          login_id = null,
          password_hash = null,
          avatar_url = null,
          withdrawn_at = coalesce(withdrawn_at, ${withdrawnAt}),
          withdrawal_reason = coalesce(withdrawal_reason, 'user_requested'),
          is_blocked = true,
          updated_at = now()
      where id = ${userId}
      returning id, withdrawn_at
    `

    await tx`
      delete from manwon_happiness.device_push_tokens
      where user_id = ${userId}
    `

    return { success: Boolean(profile), withdrawnAt: profile?.withdrawnAt ?? withdrawnAt }
  })
}

export async function createReport(userId: string, input: ReportInput) {
  await assertPhoneVerified(userId)

  const sql = getSql()
  return sql.begin(async (tx) => {
    let targetUserId = input.targetUserId ?? null
    let conversationId = input.conversationId ?? null

    if (input.messageId) {
      const [message] = await tx`
        select
          m.sender_id,
          m.conversation_id
        from manwon_happiness.messages m
        join manwon_happiness.conversations c on c.id = m.conversation_id
        where m.id = ${input.messageId}
          and (c.requester_id = ${userId} or c.helper_id = ${userId})
        limit 1
      `
      if (!message) throw new HttpError('신고할 메시지를 찾을 수 없습니다.', 404)
      targetUserId = targetUserId ?? String(message.senderId)
      conversationId = conversationId ?? String(message.conversationId)
    }

    if (input.postId) {
      const [post] = await tx`
        select creator_id
        from manwon_happiness.task_posts
        where id = ${input.postId}
        limit 1
      `
      if (!post) throw new HttpError('신고할 게시글을 찾을 수 없습니다.', 404)
      targetUserId = targetUserId ?? String(post.creatorId)
    }

    if (conversationId) {
      const [conversation] = await tx`
        select requester_id, helper_id
        from manwon_happiness.conversations
        where id = ${conversationId}
          and (requester_id = ${userId} or helper_id = ${userId})
        limit 1
      `
      if (!conversation) throw new HttpError('신고할 채팅을 찾을 수 없습니다.', 404)
      targetUserId = targetUserId
        ?? (String(conversation.requesterId) === userId ? String(conversation.helperId) : String(conversation.requesterId))
    }

    if (!targetUserId) {
      throw new HttpError('신고 대상을 확인할 수 없습니다.', 400)
    }
    if (targetUserId === userId) {
      throw new HttpError('본인은 신고할 수 없습니다.', 400)
    }

    const [target] = await tx`
      select id
      from manwon_happiness.users
      where id = ${targetUserId}
      limit 1
    `
    if (!target) throw new HttpError('신고 대상을 찾을 수 없습니다.', 404)

    const rows = await tx`
      insert into manwon_happiness.reports (reporter_id, target_user_id, post_id, conversation_id, message_id, reason, description)
      values (
        ${userId},
        ${targetUserId},
        ${input.postId ?? null},
        ${conversationId},
        ${input.messageId ?? null},
        ${input.reason},
        ${input.description ?? null}
      )
      returning *
    `
    return rows[0]
  })
}

export async function createSupportInquiry(userId: string, input: SupportInquiryInput) {
  await assertPhoneVerified(userId)
  const sql = getSql()
  const descriptionLines = [`문의 유형: ${input.type}`]
  if (input.contact) descriptionLines.push(`답변 연락처: ${input.contact}`)
  descriptionLines.push('', input.body)

  const rows = await sql`
    insert into manwon_happiness.reports (reporter_id, reason, description)
    values (${userId}, ${`1:1 문의 - ${input.type}`}, ${descriptionLines.join('\n')})
    returning *
  `
  return rows[0]
}

export async function listAdminReports() {
  const sql = getSql()
  return sql`
    select
      r.*,
      reporter.nickname as reporter_nickname,
      target.nickname as target_nickname,
      p.title as post_title,
      p.category as post_category,
      coalesce(r.conversation_id, m.conversation_id) as report_conversation_id,
      m.conversation_id as message_conversation_id,
      m.sender_id as message_sender_id,
      m.message_type as message_type,
      m.body as message_body,
      m.image_url as message_image_url,
      m.created_at as message_created_at,
      context.message_context
    from manwon_happiness.reports r
    left join manwon_happiness.users reporter on reporter.id = r.reporter_id
    left join manwon_happiness.users target on target.id = r.target_user_id
    left join manwon_happiness.task_posts p on p.id = r.post_id
    left join manwon_happiness.messages m on m.id = r.message_id
    left join lateral (
      select coalesce(
        json_agg(
          json_build_object(
            'id', recent.id,
            'senderId', recent.sender_id,
            'messageType', recent.message_type,
            'body', recent.body,
            'imageUrl', recent.image_url,
            'createdAt', recent.created_at
          )
          order by recent.created_at asc
        ),
        '[]'::json
      ) as message_context
      from (
        select mm.*
        from manwon_happiness.messages mm
        where mm.conversation_id = coalesce(r.conversation_id, m.conversation_id)
        order by mm.created_at desc
        limit 20
      ) recent
    ) context on true
    order by
      case when r.status = 'pending' then 0 else 1 end,
      r.created_at desc
    limit 200
  `
}

export async function createBlock(userId: string, input: BlockInput) {
  const sql = getSql()
  if (input.blockedUserId === userId) {
    throw new HttpError('본인은 차단할 수 없습니다.', 400)
  }

  return sql.begin(async (tx) => {
    const [target] = await tx`
      select id
      from manwon_happiness.users
      where id = ${input.blockedUserId}
      limit 1
    `
    if (!target) throw new HttpError('차단할 사용자를 찾을 수 없습니다.', 404)

    const rows = await tx`
      insert into manwon_happiness.blocks (blocker_id, blocked_user_id)
      values (${userId}, ${input.blockedUserId})
      on conflict (blocker_id, blocked_user_id) do update set blocker_id = excluded.blocker_id
      returning *
    `

    const description = [
      input.description?.trim(),
      '사용자가 차단하기를 실행하여 운영팀 검토용 신고가 자동 접수되었습니다.',
    ].filter(Boolean).join('\n\n')

    await tx`
      insert into manwon_happiness.reports (
        reporter_id,
        target_user_id,
        post_id,
        conversation_id,
        message_id,
        reason,
        description
      )
      values (
        ${userId},
        ${input.blockedUserId},
        ${input.postId ?? null},
        ${input.conversationId ?? null},
        ${input.messageId ?? null},
        ${input.reason ?? '사용자 차단'},
        ${description}
      )
    `

    return rows[0]
  })
}

export async function deleteBlock(userId: string, blockedUserId: string) {
  const sql = getSql()
  const rows = await sql`
    delete from manwon_happiness.blocks
    where blocker_id = ${userId} and blocked_user_id = ${blockedUserId}
    returning *
  `
  return rows[0] ?? null
}

export async function addFavorite(userId: string, input: FavoriteInput) {
  const sql = getSql()
  const rows = await sql`
    insert into manwon_happiness.favorites (user_id, post_id)
    values (${userId}, ${input.postId})
    on conflict (user_id, post_id) do update set user_id = excluded.user_id
    returning *
  `
  return rows[0]
}

export async function deleteFavorite(userId: string, postId: string) {
  const sql = getSql()
  const rows = await sql`
    delete from manwon_happiness.favorites
    where user_id = ${userId} and post_id = ${postId}
    returning *
  `
  return rows[0] ?? null
}

export function getSchemaName() {
  return schema
}
