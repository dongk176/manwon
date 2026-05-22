import { z } from 'zod'

export const postTypeSchema = z.enum(['request', 'offer'])
export const taskModeSchema = z.enum(['nearby', 'online', 'both'])
export const postStatusSchema = z.enum(['open', 'pending', 'in_progress', 'completed', 'cancelled', 'hidden'])
export const genderVisibilitySchema = z.enum(['private', 'male', 'female'])
export const locationSourceSchema = z.enum(['gps', 'manual'])
export const dealStatusSchema = z.enum(['pending', 'accepted', 'in_progress', 'complete_requested', 'completed', 'cancelled', 'disputed'])
export const messageTypeSchema = z.enum(['text', 'image', 'system'])

const imageRecordInputSchema = z.object({
  imageUrl: z.string().url(),
  storageKey: z.string().min(1),
  sortOrder: z.number().int().min(0).default(0),
})

const portfolioLinkInputSchema = z.object({
  title: z.string().trim().min(1).max(80),
  url: z.string().trim().url().max(300),
})

export const listPostsSchema = z.object({
  post_type: postTypeSchema.optional(),
  status_scope: z.enum(['open', 'public']).default('open'),
  category: z.string().min(1).optional(),
  category_detail: z.string().min(1).optional(),
  mode: taskModeSchema.optional(),
  max_price: z.coerce.number().int().nonnegative().optional(),
  deadline_before: z.string().datetime().optional(),
  nearby: z.enum(['true', 'false']).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radius_m: z.coerce.number().int().min(100).max(20000).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
})

export const createPostSchema = z.object({
  profileId: z.string().uuid(),
  postType: postTypeSchema,
  title: z.string().trim().min(1).max(80),
  category: z.string().trim().min(1).max(40),
  categoryDetail: z.string().trim().min(1).max(60).nullable().optional(),
  description: z.string().trim().min(1).max(1200),
  mode: taskModeSchema,
  price: z.number().int().min(1).max(1000000),
  deadlineAt: z.string().datetime().nullable().optional(),
  deadlineText: z.string().trim().max(80).nullable().optional(),
  availableTimeText: z.string().trim().max(80).nullable().optional(),
  genderVisibility: genderVisibilitySchema.default('private'),
  receiptRequired: z.boolean().default(false),
  photoProofRequired: z.boolean().default(false),
  serviceIntro: z.string().trim().max(80).nullable().optional(),
  serviceScope: z.array(z.string().trim().min(1).max(60)).max(12).default([]),
  experienceSummary: z.string().trim().max(160).nullable().optional(),
  careerSummary: z.string().trim().max(160).nullable().optional(),
  portfolioUrl: z.string().trim().url().max(300).nullable().optional(),
  portfolioLinks: z.array(portfolioLinkInputSchema).max(5).default([]),
  responseTimeText: z.string().trim().max(80).nullable().optional(),
  responseTime: z.string().trim().max(80).nullable().optional(),
  addressText: z.string().trim().max(120).nullable().optional(),
  region1Depth: z.string().trim().max(40).nullable().optional(),
  region2Depth: z.string().trim().max(40).nullable().optional(),
  region3Depth: z.string().trim().max(40).nullable().optional(),
  regionCode: z.string().trim().max(40).nullable().optional(),
  locationSource: locationSourceSchema.nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  distanceVisible: z.boolean().default(true),
  images: z
    .array(imageRecordInputSchema)
    .max(5)
    .default([]),
  trustExampleImages: z.array(imageRecordInputSchema).max(5).default([]),
  workSampleImages: z.array(imageRecordInputSchema).max(5).default([]),
})

export const updatePostSchema = createPostSchema.partial().extend({
  status: postStatusSchema.optional(),
})

export const imageRecordSchema = z.object({
  imageUrl: z.string().url(),
  storageKey: z.string().min(1),
  sortOrder: z.number().int().min(0).default(0),
})

export const presignUploadSchema = z.object({
  target: z.enum(['task-post', 'profile-avatar', 'chat-message']),
  fileName: z.string().min(1).max(160),
  contentType: z.string().min(1).max(120),
  size: z.number().int().positive().max(5 * 1024 * 1024),
})

export const phoneOtpRequestSchema = z.object({
  phone: z.string().min(10).max(20),
})

export const phoneOtpConfirmSchema = z.object({
  phone: z.string().min(10).max(20),
  code: z.string().min(4).max(12),
})

export const loginIdSchema = z
  .string()
  .trim()
  .min(4)
  .max(30)
  .regex(/^[a-zA-Z0-9_]+$/)
  .transform((value) => value.toLowerCase())

export const passwordSchema = z.string().min(8).max(72)

export const loginCheckSchema = z.object({
  loginId: loginIdSchema,
  password: passwordSchema,
})

export const signupLoginIdCheckSchema = z.object({
  loginId: loginIdSchema,
})

const signupAgreementsSchema = z.object({
  terms: z.boolean(),
  privacy: z.boolean(),
  marketing: z.boolean().default(false),
})

export const signupOtpRequestSchema = z.object({
  loginId: loginIdSchema,
  password: passwordSchema,
  name: z.string().trim().min(2).max(30),
  gender: z.enum(['male', 'female']),
  birthDate: z
    .string()
    .trim()
    .regex(/^\d{8}$/),
  phone: z.string().min(10).max(20),
  agreements: signupAgreementsSchema,
})

export const signupOtpConfirmSchema = signupOtpRequestSchema.extend({
  code: z.string().min(4).max(12),
})

export const accountRecoveryPhoneSchema = z.object({
  phone: z.string().min(10).max(20),
})

export const accountRecoveryPhoneConfirmSchema = accountRecoveryPhoneSchema.extend({
  code: z.string().min(4).max(12),
})

export const passwordRecoveryRequestSchema = z.object({
  loginId: loginIdSchema,
  phone: z.string().min(10).max(20),
})

export const passwordRecoveryResetSchema = passwordRecoveryRequestSchema.extend({
  code: z.string().min(4).max(12),
  password: passwordSchema,
})

export const createApplicationSchema = z.object({
  postId: z.string().uuid(),
  profileId: z.string().uuid(),
  message: z.string().max(500).nullable().optional(),
})

export const activityProfileSchema = z.object({
  avatarUrl: z.string().url().nullable().optional(),
  defaultAvatarKey: z.string().trim().max(40).nullable().optional(),
  nickname: z.string().trim().min(2).max(12),
  bio: z.string().trim().min(1).max(40),
  activityMode: taskModeSchema,
  addressText: z.string().trim().max(120).nullable().optional(),
  region1Depth: z.string().trim().max(40).nullable().optional(),
  region2Depth: z.string().trim().max(40).nullable().optional(),
  region3Depth: z.string().trim().max(40).nullable().optional(),
  regionCode: z.string().trim().max(40).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  careerSummary: z.string().trim().max(80).nullable().optional(),
  careerDescription: z.string().trim().max(1000).nullable().optional(),
  portfolioLinks: z.array(portfolioLinkInputSchema).max(8).default([]),
  workSampleImages: z.array(imageRecordInputSchema).max(5).default([]),
  availableTimeText: z.string().trim().max(80).nullable().optional(),
  basePrice: z.number().int().min(0).max(1000000).nullable().optional(),
})

export const updateActivityProfileSchema = activityProfileSchema.partial()

export const updateApplicationStatusSchema = z.object({
  status: z.enum(['accepted', 'rejected', 'cancelled']),
})

export const updateDealStatusSchema = z.object({
  status: dealStatusSchema,
})

export const createReviewSchema = z.object({
  dealId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  content: z.string().trim().max(1000).nullable().optional(),
})

export const reviewReminderSchema = z.object({
  dealId: z.string().uuid(),
})

export const createConversationSchema = z.object({
  postId: z.string().uuid().optional(),
  dealId: z.string().uuid().optional(),
  requesterId: z.string().uuid(),
  helperId: z.string().uuid(),
})

export const createMessageSchema = z.object({
  messageType: messageTypeSchema.default('text'),
  body: z.string().max(2000).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  clientMessageId: z.string().uuid().nullable().optional(),
})

export const reportSchema = z.object({
  targetUserId: z.string().uuid().nullable().optional(),
  postId: z.string().uuid().nullable().optional(),
  conversationId: z.string().uuid().nullable().optional(),
  messageId: z.string().uuid().nullable().optional(),
  reason: z.string().trim().min(1).max(80),
  description: z.string().trim().max(1000).nullable().optional(),
})

export const supportInquirySchema = z.object({
  type: z.string().trim().min(1).max(40),
  contact: z.string().trim().max(120).nullable().optional(),
  body: z.string().trim().min(10).max(1000),
})

export const blockSchema = z.object({
  blockedUserId: z.string().uuid(),
  postId: z.string().uuid().nullable().optional(),
  conversationId: z.string().uuid().nullable().optional(),
  messageId: z.string().uuid().nullable().optional(),
  reason: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
})

export const favoriteSchema = z.object({
  postId: z.string().uuid(),
})
