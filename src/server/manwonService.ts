import { getSql } from '@/server/db'
import { createNotificationEvent } from '@/server/notifications'
import { assertPhoneVerified } from '@/server/phoneVerification'
import type {
  blockSchema,
  createApplicationSchema,
  createConversationSchema,
  createMessageSchema,
  createPostSchema,
  favoriteSchema,
  imageRecordSchema,
  listPostsSchema,
  reportSchema,
  supportInquirySchema,
  updateApplicationStatusSchema,
  updateDealStatusSchema,
  updatePostSchema,
} from '@/server/validation'
import type { z } from 'zod'

type ListPostsInput = z.infer<typeof listPostsSchema>
type CreatePostInput = z.infer<typeof createPostSchema>
type UpdatePostInput = z.infer<typeof updatePostSchema>
type ImageRecordInput = z.infer<typeof imageRecordSchema>
type CreateApplicationInput = z.infer<typeof createApplicationSchema>
type UpdateApplicationStatusInput = z.infer<typeof updateApplicationStatusSchema>
type UpdateDealStatusInput = z.infer<typeof updateDealStatusSchema>
type CreateConversationInput = z.infer<typeof createConversationSchema>
type CreateMessageInput = z.infer<typeof createMessageSchema>
type ReportInput = z.infer<typeof reportSchema>
type SupportInquiryInput = z.infer<typeof supportInquirySchema>
type BlockInput = z.infer<typeof blockSchema>
type FavoriteInput = z.infer<typeof favoriteSchema>

const schema = 'manwon_happiness'
let dealsCancelledByColumnExists: boolean | null = null

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
      creator.nickname as creator_nickname,
      creator.avatar_url as creator_avatar_url,
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
    join manwon_happiness.profiles creator on creator.id = p.creator_id
    left join manwon_happiness.task_post_images i on i.post_id = p.id
    where (
        (${publicStatusScope}::boolean = false and p.status = 'open')
        or (
          ${publicStatusScope}::boolean = true
          and p.status in ('open', 'pending', 'in_progress', 'completed')
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
          where b.blocker_id = ${currentUserId}::uuid and b.blocked_user_id = p.creator_id
        )
      )
    group by p.id, creator.nickname, creator.avatar_url
    order by
      case
        when ${publicStatusScope}::boolean = true and p.status = 'open' then 0
        when ${publicStatusScope}::boolean = true and p.status in ('pending', 'in_progress') then 1
        when ${publicStatusScope}::boolean = true and p.status = 'completed' then 2
        else 0
      end asc,
      case when ${publicStatusScope}::boolean = true then p.created_at end desc,
      distance_meters asc nulls last,
      p.created_at desc
    limit ${input.limit}
  `
}

export async function getTaskPost(postId: string) {
  const sql = getSql()
  const cancelledByColumn = (await hasDealsCancelledByColumn(sql))
    ? sql`d.cancelled_by`
    : sql`null::uuid`
  const rows = await sql`
    select
      p.*,
      creator.nickname as creator_nickname,
      creator.avatar_url as creator_avatar_url,
      creator.rating_avg as creator_rating_avg,
      creator.completed_count as creator_completed_count,
      latest_deal.id as latest_deal_id,
      latest_deal.status as latest_deal_status,
      latest_deal.cancelled_by as latest_deal_cancelled_by,
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
    join manwon_happiness.profiles creator on creator.id = p.creator_id
    left join manwon_happiness.task_post_images i on i.post_id = p.id
    left join lateral (
      select d.id, d.status, ${cancelledByColumn} as cancelled_by, d.cancelled_at, d.completed_at, d.updated_at, d.created_at
      from manwon_happiness.deals d
      where d.post_id = p.id
      order by coalesce(d.cancelled_at, d.completed_at, d.updated_at, d.created_at) desc
      limit 1
    ) latest_deal on true
    where p.id = ${postId}
    group by p.id, creator.nickname, creator.avatar_url, creator.rating_avg, creator.completed_count, latest_deal.id, latest_deal.status, latest_deal.cancelled_by
    limit 1
  `

  if (!rows[0]) return null

  await sql`
    update manwon_happiness.task_posts
    set view_count = view_count + 1
    where id = ${postId}
  `

  return rows[0]
}

export async function createTaskPost(userId: string, input: CreatePostInput) {
  await assertPhoneVerified(userId)

  const sql = getSql()
  const serviceScopeJson = jsonArray(input.serviceScope)
  const portfolioLinksJson = jsonArray(input.portfolioLinks)
  const trustExampleImagesJson = jsonArray(input.trustExampleImages)
  const workSampleImagesJson = jsonArray(input.workSampleImages)

  return sql.begin(async (tx) => {
    const rows = await tx`
      insert into manwon_happiness.task_posts (
        creator_id,
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
        update manwon_happiness.profiles
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
    in_progress: ['complete_requested', 'completed', 'cancelled', 'disputed'],
    complete_requested: ['completed', 'cancelled', 'disputed'],
    disputed: [],
    completed: [],
    cancelled: [],
  }

  return transitions[current]?.includes(next) ?? false
}

function getDealStatusSystemMessage(status: string) {
  if (status === 'accepted') return '거래가 수락되었어요.'
  if (status === 'in_progress') return '거래가 진행 중으로 변경되었어요.'
  if (status === 'complete_requested') return '완료 요청이 도착했어요.'
  if (status === 'completed') return '거래가 완료되었어요.'
  if (status === 'cancelled') return '거래가 취소되었어요.'
  if (status === 'disputed') return '문제 신고가 접수되었어요.'
  return null
}

function getDealStatusNotification(status: string, postTitle: string | null) {
  const title = postTitle ? `"${postTitle}"` : '거래'
  if (status === 'accepted') return { type: 'deal.accepted', title: '거래가 수락됐어요', body: `${title} 거래가 수락됐습니다.` }
  if (status === 'in_progress') return { type: 'deal.in_progress', title: '거래가 시작됐어요', body: `${title} 거래가 진행 중으로 바뀌었습니다.` }
  if (status === 'complete_requested') return { type: 'deal.complete_requested', title: '완료 요청이 도착했어요', body: `${title} 거래를 확인하고 완료 승인해주세요.` }
  if (status === 'completed') return { type: 'deal.completed', title: '거래가 완료됐어요', body: `${title} 거래가 완료되었습니다.` }
  if (status === 'cancelled') return { type: 'deal.cancelled', title: '거래가 취소됐어요', body: `${title} 거래가 취소되었습니다.` }
  if (status === 'disputed') return { type: 'deal.disputed', title: '문제 신고가 접수됐어요', body: `${title} 거래가 분쟁 상태로 변경되었습니다.` }
  return null
}

function getApplicationStatusNotification(status: string) {
  if (status === 'accepted') return { type: 'application.accepted', title: '지원이 수락됐어요', body: '작성자가 지원을 수락했습니다. 채팅에서 거래를 시작해보세요.' }
  if (status === 'rejected') return { type: 'application.rejected', title: '지원이 거절됐어요', body: '아쉽지만 이번 지원은 거절되었습니다.' }
  if (status === 'cancelled') return { type: 'application.cancelled', title: '지원이 취소됐어요', body: '지원자가 지원을 취소했습니다.' }
  return null
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

  const rows = await sql`
    update manwon_happiness.task_posts
    set post_type = ${input.postType !== undefined ? input.postType : existing.postType},
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
        trust_example_images = ${sql.json(jsonArray(input.trustExampleImages !== undefined ? input.trustExampleImages : existing.trustExampleImages))}::jsonb,
        work_sample_images = ${sql.json(jsonArray(input.workSampleImages !== undefined ? input.workSampleImages : existing.workSampleImages))}::jsonb,
        status = ${input.status !== undefined ? input.status : existing.status},
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

  const application = rows[0] ?? null
  if (application) {
    const [post] = await sql`
      select creator_id, title
      from manwon_happiness.task_posts
      where id = ${application.postId}
      limit 1
    `
    if (post?.creatorId) {
      void createNotificationEvent(String(post.creatorId), {
        type: 'application.created',
        title: '새 지원이 도착했어요',
        body: post.title ? `"${post.title}"에 새 지원이 왔습니다.` : '새 지원이 도착했습니다.',
        data: {
          type: 'application.created',
          postId: String(application.postId),
          applicationId: String(application.id),
        },
      }).catch(() => undefined)
    }
  }

  return application
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

  const sql = getSql()
  const rows = await sql`
    insert into manwon_happiness.applications (post_id, applicant_id, message, recruitment_round)
    select p.id, ${userId}, ${input.message ?? null}, p.recruitment_round
    from manwon_happiness.task_posts p
    where p.id = ${input.postId}
      and p.creator_id <> ${userId}
      and p.status = 'open'
    on conflict (post_id, applicant_id, recruitment_round) do update
      set message = excluded.message, status = 'applied'
    returning *
  `

  return rows[0] ?? null
}

export async function updateApplicationStatus(userId: string, applicationId: string, input: UpdateApplicationStatusInput) {
  const sql = getSql()

  const result = await sql.begin(async (tx) => {
    const applicationRows = await tx`
      select a.*, p.creator_id, p.post_type, p.price, p.status as post_status, p.recruitment_round as post_recruitment_round
      from manwon_happiness.applications a
      join manwon_happiness.task_posts p on p.id = a.post_id
      where a.id = ${applicationId}
      limit 1
    `
    const application = applicationRows[0]
    if (!application) return null

    const isCreator = application.creatorId === userId
    const isApplicant = application.applicantId === userId
    if (!isCreator && !(isApplicant && input.status === 'cancelled')) return null

    if (input.status === 'accepted' && (application.status !== 'applied' || application.postStatus !== 'open' || application.recruitmentRound !== application.postRecruitmentRound)) {
      return null
    }

    const updatedRows = await tx`
      update manwon_happiness.applications
      set status = ${input.status}
      where id = ${applicationId}
      returning *
    `

    if (input.status !== 'accepted') return updatedRows[0]

    await tx`
      update manwon_happiness.applications
      set status = 'rejected'
      where post_id = ${application.postId}
        and recruitment_round = ${application.recruitmentRound}
        and id <> ${applicationId}
        and status = 'applied'
    `

    const requesterId = application.postType === 'request' ? application.creatorId : application.applicantId
    const helperId = application.postType === 'request' ? application.applicantId : application.creatorId

    const dealRows = await tx`
      insert into manwon_happiness.deals (post_id, requester_id, helper_id, application_id, price, status, accepted_at, recruitment_round)
      values (${application.postId}, ${requesterId}, ${helperId}, ${applicationId}, ${application.price}, 'accepted', now(), ${application.recruitmentRound})
      returning *
    `

    await tx`
      update manwon_happiness.task_posts
      set status = 'pending'
      where id = ${application.postId}
        and recruitment_round = ${application.recruitmentRound}
    `

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

    if (conversationRows.length === 0) {
      await tx`
        insert into manwon_happiness.conversations (deal_id, post_id, requester_id, helper_id, recruitment_round, last_message, last_message_at)
        values (${dealRows[0].id}, ${application.postId}, ${requesterId}, ${helperId}, ${application.recruitmentRound}, '거래가 시작되었어요.', now())
        on conflict do nothing
      `
    }

    return { application: updatedRows[0], deal: dealRows[0] }
  })

  const application = getApplicationFromStatusResult(result)
  if (application) {
    const targetUserId = input.status === 'cancelled' ? application.creatorId : application.applicantId
    const notification = getApplicationStatusNotification(input.status)
    if (targetUserId && notification) {
      void createNotificationEvent(String(targetUserId), {
        ...notification,
        data: {
          type: notification.type,
          postId: application.postId ? String(application.postId) : null,
          applicationId,
          dealId: getDealIdFromStatusResult(result),
        },
      }).catch(() => undefined)
    }
  }

  return result
}

export async function updateDealStatus(userId: string, dealId: string, input: UpdateDealStatusInput) {
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
      select *
      from manwon_happiness.deals
      where id = ${dealId}
        and (requester_id = ${userId} or helper_id = ${userId})
      for update
      limit 1
    `
    const existing = existingRows[0]
    if (!existing) return null
    if (!canTransitionDealStatus(existing.status, input.status)) return null

    const rows = input.status === 'cancelled'
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

    if (input.status === 'in_progress') {
      await tx`update manwon_happiness.task_posts set status = 'in_progress' where id = ${deal.postId}`
    }
    if (input.status === 'completed') {
      await tx`update manwon_happiness.task_posts set status = 'completed' where id = ${deal.postId}`
      await tx`
        update manwon_happiness.profiles
        set completed_count = completed_count + 1
        where id in (${deal.requesterId}, ${deal.helperId})
      `
    }
    if (input.status === 'cancelled') {
      await tx`update manwon_happiness.task_posts set status = 'cancelled' where id = ${deal.postId}`
    }

    const systemMessage = getDealStatusSystemMessage(input.status)
    const conversationRows = await tx`
      select c.id, p.title as post_title
      from manwon_happiness.conversations c
      left join manwon_happiness.task_posts p on p.id = c.post_id
      where c.deal_id = ${deal.id}
      limit 1
    `
    const conversation = conversationRows[0] ?? null
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
    }
  })

  if (!result) return null

  const notification = getDealStatusNotification(input.status, result.postTitle)
  if (notification) {
    void createNotificationEvent(result.notifyUserId, {
      ...notification,
      data: {
        type: notification.type,
        conversationId: result.conversationId,
        postId: String(result.deal.postId),
        dealId: String(result.deal.id),
      },
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
      d.status as deal_status,
      a.id as application_id,
      a.status as application_status,
      requester.nickname as requester_nickname,
      requester.avatar_url as requester_avatar_url,
      helper.nickname as helper_nickname,
      helper.avatar_url as helper_avatar_url,
      case when c.requester_id = ${userId} then c.helper_id else c.requester_id end as other_user_id,
      case when c.requester_id = ${userId} then helper.nickname else requester.nickname end as other_nickname,
      (
        select count(*)::integer
        from manwon_happiness.messages m
        where m.conversation_id = c.id
          and m.sender_id <> ${userId}
          and m.read_at is null
      ) as unread_count
    from manwon_happiness.conversations c
    left join manwon_happiness.task_posts p on p.id = c.post_id
    left join manwon_happiness.deals d on d.id = c.deal_id
    left join manwon_happiness.applications a on a.post_id = c.post_id
      and a.recruitment_round = c.recruitment_round
      and (
        (p.post_type = 'request' and a.applicant_id = c.helper_id)
        or (p.post_type = 'offer' and a.applicant_id = c.requester_id)
      )
    join manwon_happiness.profiles requester on requester.id = c.requester_id
    join manwon_happiness.profiles helper on helper.id = c.helper_id
    where (c.requester_id = ${userId} or c.helper_id = ${userId})
      and not exists (
        select 1 from manwon_happiness.blocks b
        where b.blocker_id = ${userId}
          and b.blocked_user_id = case when c.requester_id = ${userId} then c.helper_id else c.requester_id end
      )
    order by coalesce(c.last_message_at, c.created_at) desc
  `
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

export async function startConversationForPost(userId: string, postId: string, message?: string | null) {
  await assertPhoneVerified(userId)

  const sql = getSql()

  const result = await sql.begin(async (tx) => {
    const postRows = await tx`
      select p.*
      from manwon_happiness.task_posts p
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

    const requesterId = post.postType === 'request' ? post.creatorId : userId
    const helperId = post.postType === 'request' ? userId : post.creatorId

    if (post.postType === 'request') {
      await tx`
        insert into manwon_happiness.applications (post_id, applicant_id, message, recruitment_round)
        values (${postId}, ${userId}, ${message ?? '도와드릴 수 있어요.'}, ${post.recruitmentRound})
        on conflict (post_id, applicant_id, recruitment_round) do update
          set message = coalesce(excluded.message, manwon_happiness.applications.message),
              status = case
                when manwon_happiness.applications.status = 'cancelled' then 'applied'::manwon_happiness.application_status
                else manwon_happiness.applications.status
              end
      `
    }

    const insertedRows = await tx`
      insert into manwon_happiness.conversations (post_id, requester_id, helper_id, recruitment_round, last_message, last_message_at)
      values (${postId}, ${requesterId}, ${helperId}, ${post.recruitmentRound}, ${message ?? '문의가 시작되었어요.'}, now())
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

    if (Number(messageCountRows[0]?.count ?? 0) === 0) {
      await tx`
        insert into manwon_happiness.messages (conversation_id, sender_id, message_type, body)
        values (${conversation.id}, ${userId}, 'system', ${post.postType === 'request' ? '지원했어요. 작성자가 수락하면 거래가 시작됩니다.' : '문의가 시작되었어요.'})
      `
    }

    return {
      conversation,
      postType: String(post.postType),
      postTitle: post.title ? String(post.title) : null,
      notifyUserId: String(post.creatorId),
    }
  })

  if (!result) return null

  void createNotificationEvent(result.notifyUserId, {
    type: result.postType === 'request' ? 'application.created' : 'conversation.started',
    title: result.postType === 'request' ? '새 지원이 도착했어요' : '새 문의가 도착했어요',
    body: result.postTitle ? `"${result.postTitle}"에서 대화가 시작됐습니다.` : '새 대화가 시작됐습니다.',
    data: {
      type: result.postType === 'request' ? 'application.created' : 'conversation.started',
      conversationId: String(result.conversation.id),
      postId,
    },
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
      limit 1
    `

    if (!conversationRows[0]) return null

    await tx`
      update manwon_happiness.messages
      set read_at = coalesce(read_at, now())
      where conversation_id = ${conversationId}
        and sender_id <> ${userId}
        and read_at is null
    `

    if (options.after) {
      return tx`
        select m.*
        from manwon_happiness.messages m
        where m.conversation_id = ${conversationId}
          and m.created_at > ${options.after}::timestamptz
        order by m.created_at asc
      `
    }

    return tx`
      select m.*
      from manwon_happiness.messages m
      where m.conversation_id = ${conversationId}
      order by m.created_at asc
    `
  })
}

export async function markConversationRead(userId: string, conversationId: string) {
  const sql = getSql()
  return sql.begin(async (tx) => {
    const conversationRows = await tx`
      select 1
      from manwon_happiness.conversations c
      where c.id = ${conversationId}
        and (c.requester_id = ${userId} or c.helper_id = ${userId})
      limit 1
    `
    if (!conversationRows[0]) return null

    const rows = await tx`
      update manwon_happiness.messages
      set read_at = coalesce(read_at, now())
      where conversation_id = ${conversationId}
        and sender_id <> ${userId}
        and read_at is null
      returning *
    `

    return { readCount: rows.length }
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
        sender.nickname as sender_nickname,
        case when c.requester_id = ${userId} then c.helper_id else c.requester_id end as other_user_id
      from manwon_happiness.conversations c
      left join manwon_happiness.task_posts p on p.id = c.post_id
      left join manwon_happiness.profiles sender on sender.id = ${userId}
      where c.id = ${conversationId}
        and (c.requester_id = ${userId} or c.helper_id = ${userId})
      limit 1
    `
    const conversation = conversationRows[0]
    if (!conversation) return null

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
      senderNickname: conversation.senderNickname ? String(conversation.senderNickname) : '만원부탁소',
      postId: conversation.postId ? String(conversation.postId) : null,
      dealId: conversation.dealId ? String(conversation.dealId) : null,
    }
  })

  if (!result) return null

  void createNotificationEvent(result.notifyUserId, {
    type: 'message.new',
    title: `${result.senderNickname}님의 새 메시지`,
    body: result.lastMessage,
    data: {
      type: 'message.new',
      conversationId,
      messageId: String(result.message.id),
      postId: result.postId,
      dealId: result.dealId,
    },
  }).catch(() => undefined)

  return result.message
}

export async function getMyActivity(userId: string) {
  const sql = getSql()
  const [myPosts, helpedDeals, favorites, receivedReviews, writtenReviews, reports, blocks] = await Promise.all([
    sql`
      select
        p.*,
        count(distinct f.id)::integer as favorite_count,
        count(distinct a.id)::integer as application_count
      from manwon_happiness.task_posts p
      left join manwon_happiness.favorites f on f.post_id = p.id
      left join manwon_happiness.applications a on a.post_id = p.id
      where p.creator_id = ${userId}
      group by p.id
      order by p.created_at desc
      limit 50
    `,
    sql`
      select
        d.*,
        p.title as post_title,
        p.category as post_category,
        p.mode as post_mode,
        p.deadline_at as post_deadline_at,
        p.deadline_text as post_deadline_text,
        p.available_time_text as post_available_time_text,
        p.address_text as post_address_text,
        p.region_2depth as post_region_2depth,
        p.region_3depth as post_region_3depth,
        requester.nickname as requester_nickname,
        requester.avatar_url as requester_avatar_url
      from manwon_happiness.deals d
      join manwon_happiness.task_posts p on p.id = d.post_id
      join manwon_happiness.profiles requester on requester.id = d.requester_id
      where d.helper_id = ${userId}
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
      join manwon_happiness.profiles reviewer on reviewer.id = r.reviewer_id
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
      join manwon_happiness.profiles reviewee on reviewee.id = r.reviewee_id
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
      left join manwon_happiness.profiles target on target.id = r.target_user_id
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
      join manwon_happiness.profiles blocked on blocked.id = b.blocked_user_id
      where b.blocker_id = ${userId}
      order by b.created_at desc
      limit 50
    `,
  ])

  return { myPosts, helpedDeals, favorites, receivedReviews, writtenReviews, reports, blocks }
}

export async function getMyPage(userId: string) {
  const sql = getSql()
  const rows = await sql`
    select
      p.*,
      (select count(*)::integer from manwon_happiness.task_posts where creator_id = ${userId} and status in ('open', 'pending', 'in_progress')) as active_posts_count,
      (select count(*)::integer from manwon_happiness.deals where helper_id = ${userId} and status in ('accepted', 'in_progress', 'complete_requested')) as active_helping_count,
      (select count(*)::integer from manwon_happiness.favorites where user_id = ${userId}) as favorite_count,
      (select count(*)::integer from manwon_happiness.reviews where reviewee_id = ${userId}) as received_review_count
    from manwon_happiness.profiles p
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
    update manwon_happiness.profiles
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
      update manwon_happiness.profiles
      set nickname = '탈퇴한 사용자',
          display_name = null,
          login_id = null,
          password_hash = null,
          phone = null,
          avatar_url = null,
          withdrawn_at = coalesce(withdrawn_at, ${withdrawnAt}),
          is_blocked = true,
          updated_at = now()
      where id = ${userId}
      returning id, withdrawn_at
    `

    return { success: Boolean(profile), withdrawnAt: profile?.withdrawnAt ?? withdrawnAt }
  })
}

export async function createReport(userId: string, input: ReportInput) {
  const sql = getSql()
  const rows = await sql`
    insert into manwon_happiness.reports (reporter_id, target_user_id, post_id, conversation_id, message_id, reason, description)
    values (
      ${userId},
      ${input.targetUserId ?? null},
      ${input.postId ?? null},
      ${input.conversationId ?? null},
      ${input.messageId ?? null},
      ${input.reason},
      ${input.description ?? null}
    )
    returning *
  `
  return rows[0]
}

export async function createSupportInquiry(userId: string, input: SupportInquiryInput) {
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
    left join manwon_happiness.profiles reporter on reporter.id = r.reporter_id
    left join manwon_happiness.profiles target on target.id = r.target_user_id
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
  const rows = await sql`
    insert into manwon_happiness.blocks (blocker_id, blocked_user_id)
    values (${userId}, ${input.blockedUserId})
    on conflict (blocker_id, blocked_user_id) do update set blocker_id = excluded.blocker_id
    returning *
  `
  return rows[0]
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
