'use client'

import { type PointerEvent as ReactPointerEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Bell, LockKeyhole, MoreVertical, Plus, Send, Smile, Star } from 'lucide-react'
import {
  AppHeader,
  BrandButton,
  ChipGroup,
  MoreMenu,
  RatingStars,
  RequestCard,
  StatusBadge,
} from '@/components/ui/Common'
import { Avatar } from '@/components/ui/Illustration'
import { UserProfileSheet } from '@/components/UserProfileSheet'
import { PhoneVerificationOverlay } from '@/components/PhoneVerificationOverlay'
import {
  chats as mockChats,
  getRequest,
  getUser,
  type ChatMessage,
  type ChatThread,
  type RequestPost,
  type TradeStatus,
  type UserProfile,
} from '@/data/mockData'
import {
  fetchConversations,
  fetchMessages,
  createBlock,
  createReport,
  createReview,
  getCurrentUserId,
  getDisplayImageUrl,
  isPhoneVerificationRequired,
  normalizeDisplayImageUrl,
  scheduleReviewReminder,
  sendConversationMessage,
  updateApplicationStatus,
  updateDealStatus,
  type ApiConversation,
  type ApiMessage,
} from '@/lib/manwonApi'
import { authorizeRealtimeClient } from '@/lib/realtime'

type ChatFilter = 'all' | 'progress' | 'done' | 'unread'

const chatFilters = [
  { value: 'all', label: '전체' },
  { value: 'progress', label: '진행 중' },
  { value: 'done', label: '거래 완료' },
  { value: 'unread', label: '읽지 않음' },
] satisfies Array<{ value: ChatFilter; label: string }>

const reportReasons = [
  '부적절한 메시지',
  '거래와 무관한 연락',
  '사기 의심',
  '욕설/괴롭힘',
  '개인정보 요구',
  '기타',
] as const

interface UiChat {
  id: string
  dealId: string | null
  applicationId: string | null
  applicationStatus: ApiConversation['applicationStatus']
  requesterId: string
  helperId: string
  postCreatorId: string | null
  postType: ApiConversation['postType']
  applicationApplicantId: string | null
  hasChatAfterStarted: boolean
  myReviewId: string | null
  status: TradeStatus
  lastMessage: string
  lastTime: string
  unreadCount: number
  user: UserProfile
  request: RequestPost
}

interface UiMessage extends ChatMessage {
  clientMessageId?: string | null
  createdAt?: string
  failed?: boolean
  pending?: boolean
}

interface ComposerDisabledReason {
  message: string
  brand?: boolean
}

export function ChatScreens({ conversationId }: { conversationId?: string }) {
  const router = useRouter()
  const [filter, setFilter] = useState<ChatFilter>('all')
  const [chats, setChats] = useState<UiChat[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')

  const loadChats = useCallback(async () => {
    try {
      const currentUserId = getCurrentUserId()
      const conversations = await fetchConversations()
      setChats(conversations.map((conversation) => mapConversationToChat(conversation, currentUserId)))
      setLoadState('ready')
    } catch {
      setChats(mockChats.map(mapMockChatToChat))
      setLoadState('ready')
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void loadChats()
    })
  }, [loadChats])

  useEffect(() => {
    if (conversationId) return undefined

    const currentUserId = getCurrentUserId()
    if (!currentUserId) return undefined

    let cleanup: (() => void) | undefined
    let cancelled = false

    void authorizeRealtimeClient()
      .then((client) => {
        if (cancelled || !client) return
        const channel = client
          .channel(`user:${currentUserId}:conversations`, {
            config: {
              private: true,
            },
          })
          .on('broadcast', { event: 'INSERT' }, () => void loadChats())
          .on('broadcast', { event: 'UPDATE' }, () => void loadChats())
          .subscribe()

        cleanup = () => {
          void client.removeChannel(channel)
        }
      })
      .catch(() => {
        cleanup = undefined
      })

    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [conversationId, loadChats])

  const activeChat = conversationId ? chats.find((chat) => chat.id === conversationId) : null
  const filteredChats = useMemo(() => {
    return chats.filter((chat) => {
      if (filter === 'progress') return chat.status === '진행중' || chat.status === '완료요청' || chat.status === '수락대기'
      if (filter === 'done') return chat.status === '거래완료'
      if (filter === 'unread') return chat.unreadCount > 0
      return true
    })
  }, [chats, filter])

  if (conversationId) {
    if (loadState === 'loading') {
      return (
        <section className="screen chat-detail-screen">
          <p className="inline-status">채팅방을 불러오는 중입니다.</p>
        </section>
      )
    }

    if (!activeChat) {
      return (
        <section className="screen chat-detail-screen">
          <AppHeader title="채팅" centered onBack={() => router.push('/chat')} />
          <div className="empty-state">
            <strong>채팅방을 찾지 못했어요</strong>
            <span>목록에서 다시 선택해주세요.</span>
          </div>
        </section>
      )
    }

    return <ChatDetail chat={activeChat} onBack={() => router.push('/chat')} onRefresh={loadChats} />
  }

  return (
    <section className="screen chat-screen">
      <AppHeader title="채팅" subtitle="거래 대화를 확인하세요" showSearch />
      <ChipGroup options={chatFilters} value={filter} onChange={setFilter} className="chat-filter" />
      <div className="chat-list">
        {loadState === 'loading' && <p className="inline-status">채팅 목록을 불러오는 중입니다.</p>}
        {loadState === 'error' && <p className="inline-status is-error">채팅 목록을 불러오지 못했습니다.</p>}
        {loadState === 'ready' && filteredChats.length === 0 && (
          <div className="empty-state">
            <strong>대화가 아직 없어요</strong>
            <span>부탁에서 문의하거나 지원하면 채팅방이 만들어집니다.</span>
          </div>
        )}
        {filteredChats.map((chat) => (
          <ChatCard key={chat.id} chat={chat} onOpen={() => router.push(`/chat/${encodeURIComponent(chat.id)}`)} />
        ))}
      </div>
    </section>
  )
}

function ChatCard({ chat, onOpen }: { chat: UiChat; onOpen: () => void }) {
  const hasUnread = chat.unreadCount > 0

  return (
    <button className={`chat-card ${hasUnread ? 'has-unread' : ''}`} type="button" onClick={onOpen}>
      <Avatar user={chat.user} size="lg" />
      <span className="chat-card-body">
        <span className="chat-card-top">
          <span className="chat-card-name-wrap">
            <strong className="chat-card-name">
              <span>{chat.user.name}</span>
              {hasUnread && <i />}
            </strong>
            <StatusBadge status={chat.status} />
          </span>
          <time>{chat.lastTime}</time>
        </span>
        <span className="chat-card-bottom">
          <span>{chat.lastMessage}</span>
        </span>
      </span>
      {hasUnread && <b className="unread-count">{formatUnreadCount(chat.unreadCount)}</b>}
    </button>
  )
}

function formatUnreadCount(count: number) {
  return count >= 10 ? '10+' : String(count)
}

function ChatDetail({ chat, onBack, onRefresh }: { chat: UiChat; onBack: () => void; onRefresh: () => Promise<void> }) {
  const [showMore, setShowMore] = useState(false)
  const [showProfileSheet, setShowProfileSheet] = useState(false)
  const [showReportSheet, setShowReportSheet] = useState(false)
  const [showBlockConfirm, setShowBlockConfirm] = useState(false)
  const [showReviewPrompt, setShowReviewPrompt] = useState(false)
  const [reportVerificationInput, setReportVerificationInput] = useState<{ reason: string; description: string; blockAfterReport: boolean } | null>(null)
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [moderationStatus, setModerationStatus] = useState('')
  const [moderationError, setModerationError] = useState('')
  const messagesRef = useRef<UiMessage[]>([])
  const messageListRef = useRef<HTMLDivElement | null>(null)
  const lastScrolledMessageIdRef = useRef<string | null>(null)
  const composerDisabledReason = getComposerDisabledReason(chat)

  const loadMessages = useCallback(async (after?: string | null) => {
    try {
      const currentUserId = getCurrentUserId()
      const data = await fetchMessages(chat.id, after)
      const nextMessages = data.map((message) => mapApiMessage(message, currentUserId))
      setMessages((previous) => (after ? mergeMessages(previous, nextMessages) : nextMessages))
      setLoadState('ready')
    } catch {
      const fallback = mockChats.find((thread) => thread.id === chat.id)
      setMessages(fallback?.messages ?? [])
      setLoadState('ready')
    }
  }, [chat.id])

  useEffect(() => {
    queueMicrotask(() => {
      void loadMessages()
    })
  }, [loadMessages])

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    lastScrolledMessageIdRef.current = null
  }, [chat.id])

  useEffect(() => {
    const shouldShow = (() => {
      if (chat.status !== '거래완료' || !chat.dealId || chat.myReviewId) return false
      const deferredUntil = getDeferredReviewUntil(chat.dealId)
      return !deferredUntil || Date.now() >= deferredUntil
    })()

    queueMicrotask(() => setShowReviewPrompt(shouldShow))
  }, [chat.dealId, chat.id, chat.myReviewId, chat.status])

  useEffect(() => {
    if (loadState !== 'ready') return
    const lastMessage = messages[messages.length - 1]
    if (!lastMessage) return

    const previousMessageId = lastScrolledMessageIdRef.current
    lastScrolledMessageIdRef.current = lastMessage.id

    requestAnimationFrame(() => {
      const list = messageListRef.current
      if (!list) return
      list.scrollTo({
        top: list.scrollHeight,
        behavior: previousMessageId ? 'smooth' : 'auto',
      })
    })
  }, [chat.id, loadState, messages])

  function scrollMessagesToBottom(behavior: ScrollBehavior = 'smooth', delay = 0) {
    window.setTimeout(() => {
      const list = messageListRef.current
      if (!list) return
      list.scrollTo({
        top: list.scrollHeight,
        behavior,
      })
    }, delay)
  }

  useEffect(() => {
    const currentUserId = getCurrentUserId()
    let cleanup: (() => void) | undefined
    let cancelled = false

    void authorizeRealtimeClient()
      .then((client) => {
        if (cancelled || !client) return
        const channel = client
          .channel(`conversation:${chat.id}`, {
            config: {
              private: true,
              broadcast: {
                self: false,
              },
            },
          })
          .on('broadcast', { event: 'INSERT' }, (payload) => {
            const message = mapRealtimePayload(payload)
            if (!message || message.conversationId !== chat.id) return
            setMessages((previous) => mergeMessages(previous, [mapApiMessage(message, currentUserId)]))
            void onRefresh()
          })
          .on('broadcast', { event: 'UPDATE' }, (payload) => {
            const message = mapRealtimePayload(payload)
            if (!message || message.conversationId !== chat.id) return
            setMessages((previous) => mergeMessages(previous, [mapApiMessage(message, currentUserId)]))
          })
          .subscribe((status) => {
            if (status !== 'SUBSCRIBED') return
            const lastCreatedAt = getLastCreatedAt(messagesRef.current)
            if (lastCreatedAt) void loadMessages(lastCreatedAt)
          })

        cleanup = () => {
          void client.removeChannel(channel)
        }
      })
      .catch(() => {
        cleanup = undefined
      })

    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [chat.id, loadMessages, onRefresh])

  function addOptimisticMessage(text: string, clientMessageId: string) {
    const createdAt = new Date().toISOString()
    setMessages((previous) =>
      mergeMessages(previous, [
        {
          id: `pending-${clientMessageId}`,
          sender: 'me',
          text,
          time: formatTime(createdAt),
          clientMessageId,
          createdAt,
          pending: true,
        },
      ]),
    )
  }

  async function replaceOptimisticMessage(message: ApiMessage, clientMessageId: string) {
    const currentUserId = getCurrentUserId()
    setMessages((previous) =>
      mergeMessages(
        previous.filter((item) => item.clientMessageId !== clientMessageId || !item.pending),
        [mapApiMessage(message, currentUserId)],
      ),
    )
    await onRefresh()
  }

  function markMessageFailed(clientMessageId: string) {
    setMessages((previous) =>
      previous.map((message) =>
        message.clientMessageId === clientMessageId
          ? {
              ...message,
              failed: true,
              pending: false,
            }
          : message,
      ),
    )
  }

  async function retryMessage(message: UiMessage) {
    const text = message.text.trim()
    if (!text || composerDisabledReason) return

    const clientMessageId = createClientMessageId()
    setMessages((previous) => previous.filter((item) => item.id !== message.id))
    addOptimisticMessage(text, clientMessageId)

    try {
      const sentMessage = await sendConversationMessage(chat.id, text, clientMessageId)
      await replaceOptimisticMessage(sentMessage, clientMessageId)
    } catch {
      markMessageFailed(clientMessageId)
    }
  }

  async function blockUser() {
    setModerationStatus('')
    setModerationError('')
    try {
      await createBlock(chat.user.id, {
        postId: isUuid(chat.request.id) ? chat.request.id : undefined,
        conversationId: chat.id,
        reason: '채팅 상대 차단',
        description: `채팅방에서 차단됨: ${chat.request.title}`,
      })
      setShowBlockConfirm(false)
      setShowMore(false)
      setModerationStatus(`${chat.user.name}님을 차단했습니다.`)
      await onRefresh()
      onBack()
    } catch (error) {
      setModerationError(error instanceof Error ? error.message : '차단하지 못했습니다.')
    }
  }

  async function submitReport(input: { reason: string; description: string; blockAfterReport: boolean }) {
    setModerationStatus('')
    setModerationError('')
    try {
      await createReport({
        targetUserId: chat.user.id,
        postId: isUuid(chat.request.id) ? chat.request.id : undefined,
        conversationId: chat.id,
        reason: input.reason,
        description: input.description.trim() || undefined,
      })
      if (input.blockAfterReport) {
        await createBlock(chat.user.id, {
          postId: isUuid(chat.request.id) ? chat.request.id : undefined,
          conversationId: chat.id,
          reason: '신고 후 차단',
          description: input.description.trim() || `채팅방 신고 후 차단됨: ${chat.request.title}`,
        })
        await onRefresh()
        onBack()
      }
      setShowReportSheet(false)
      setShowMore(false)
      setModerationStatus(input.blockAfterReport ? '신고를 접수하고 사용자를 차단했습니다.' : '신고가 접수되었습니다.')
    } catch (error) {
      if (isPhoneVerificationRequired(error)) {
        setModerationError('')
        setReportVerificationInput(input)
        return
      }
      setModerationError(error instanceof Error ? error.message : '신고를 접수하지 못했습니다.')
    }
  }

  function dismissKeyboardIfOutsideComposer(event: ReactPointerEvent<HTMLElement>) {
    const activeElement = document.activeElement
    if (!(activeElement instanceof HTMLElement) || !activeElement.closest('.message-composer')) return

    const target = event.target
    if (!(target instanceof Element) || target.closest('.message-composer')) return

    activeElement.blur()
  }

  return (
    <section className="screen chat-detail-screen" onPointerDownCapture={dismissKeyboardIfOutsideComposer}>
      <header className="chat-detail-header">
        <button className="icon-button" type="button" onClick={onBack} aria-label="뒤로가기">
          <ArrowLeft size={24} />
        </button>
        <button className="chat-peer-button" type="button" onClick={() => setShowProfileSheet(true)} aria-label={`${chat.user.name} 프로필 보기`}>
          <Avatar user={chat.user} size="md" online />
          <span>
            <h1>{chat.user.name}</h1>
            <p>프로필 보기</p>
          </span>
        </button>
        <button className="icon-button detail-more" type="button" onClick={() => setShowMore((value) => !value)} aria-label="더보기">
          <MoreVertical size={23} />
        </button>
        {showMore && (
          <MoreMenu
            onReport={() => {
              setShowMore(false)
              setShowReportSheet(true)
            }}
            onBlock={() => {
              setShowMore(false)
              setShowBlockConfirm(true)
            }}
          />
        )}
      </header>

      <TradeActionPanel
        chat={chat}
        currentUserId={getCurrentUserId()}
        onOpenProfile={() => setShowProfileSheet(true)}
        onRefresh={onRefresh}
        onReview={() => setShowReviewPrompt(true)}
      />
      <RequestCard request={chat.request} variant="preview" />
      {moderationStatus && <p className="inline-status moderation-feedback">{moderationStatus}</p>}
      {moderationError && <p className="inline-status is-error moderation-feedback">{moderationError}</p>}

      <div className="date-pill">오늘</div>
      <div className="message-list" ref={messageListRef}>
        {loadState === 'loading' && <p className="inline-status">메시지를 불러오는 중입니다.</p>}
        {loadState === 'error' && <p className="inline-status is-error">메시지를 불러오지 못했습니다.</p>}
        {loadState === 'ready' && messages.length === 0 && (
          <div className="empty-state compact">
            <strong>아직 메시지가 없어요</strong>
            <span>첫 메시지를 보내 거래 조건을 확인해보세요.</span>
          </div>
        )}
        {messages.map((message) => {
          if (message.sender === 'system') {
            return (
              <div className="system-message" key={message.id}>
                <Bell size={18} />
                <span>{message.text}</span>
                <time>{message.time}</time>
              </div>
            )
          }

          const mine = message.sender === 'me'
          return (
            <div className={`message-row ${mine ? 'is-mine' : ''} ${message.pending ? 'is-pending' : ''} ${message.failed ? 'is-failed' : ''}`} key={message.id}>
              {!mine && <Avatar user={chat.user} size="sm" />}
              <div className="bubble-wrap">
                <p className="message-bubble">{message.text}</p>
                {message.failed && <span className="message-state">전송 실패</span>}
                {message.failed && mine && !composerDisabledReason && (
                  <button className="message-retry" type="button" onClick={() => void retryMessage(message)}>
                    재전송
                  </button>
                )}
                {message.pending && <span className="message-state">전송 중</span>}
                <time>{message.time}</time>
              </div>
            </div>
          )
        })}
      </div>

      <MessageComposer
        conversationId={chat.id}
        disabledReason={composerDisabledReason}
        onFailed={markMessageFailed}
        onFocus={() => scrollMessagesToBottom('smooth', 250)}
        onOptimistic={addOptimisticMessage}
        onSent={replaceOptimisticMessage}
      />
      {showBlockConfirm && (
        <BlockConfirmDialog
          userName={chat.user.name}
          error={moderationError}
          onCancel={() => setShowBlockConfirm(false)}
          onConfirm={() => void blockUser()}
        />
      )}
      {showReportSheet && (
        <ReportSheet
          userName={chat.user.name}
          error={moderationError}
          onClose={() => setShowReportSheet(false)}
          onSubmit={(input) => void submitReport(input)}
        />
      )}
      {reportVerificationInput && (
        <PhoneVerificationOverlay
          onClose={() => setReportVerificationInput(null)}
          onVerified={() => {
            const input = reportVerificationInput
            setReportVerificationInput(null)
            if (input) void submitReport(input)
          }}
        />
      )}
      {showProfileSheet && <UserProfileSheet user={chat.user} onClose={() => setShowProfileSheet(false)} />}
      {showReviewPrompt && chat.dealId && (
        <ReviewPromptSheet
          chat={chat}
          onDeferred={() => {
            setShowReviewPrompt(false)
          }}
          onSubmitted={async () => {
            if (chat.dealId) clearDeferredReview(chat.dealId)
            setShowReviewPrompt(false)
            await onRefresh()
          }}
        />
      )}
    </section>
  )
}

function ReviewPromptSheet({
  chat,
  onDeferred,
  onSubmitted,
}: {
  chat: UiChat
  onDeferred: () => void
  onSubmitted: () => Promise<void>
}) {
  const [rating, setRating] = useState(5)
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState<'submit' | 'later' | null>(null)
  const [error, setError] = useState('')
  const dealId = chat.dealId

  async function submit() {
    if (!dealId || busy) return
    setBusy('submit')
    setError('')
    try {
      await createReview({ dealId, rating, content: content.trim() || null })
      await onSubmitted()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '후기를 저장하지 못했습니다.')
    } finally {
      setBusy(null)
    }
  }

  async function remindLater() {
    if (!dealId || busy) return
    setBusy('later')
    setError('')
    try {
      await scheduleReviewReminder(dealId)
      deferReviewPrompt(dealId)
      onDeferred()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '리마인더를 설정하지 못했습니다.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="sheet-overlay is-centered" role="presentation">
      <div className="review-prompt-sheet" role="dialog" aria-modal="true" aria-labelledby="review-prompt-title">
        <button className="sheet-x" type="button" onClick={() => void remindLater()} aria-label="나중에">
          ×
        </button>
        <h2 id="review-prompt-title">거래 후기를 남겨주세요</h2>
        <p>{chat.user.name}님과의 거래는 어떠셨나요?</p>
        <div className="review-star-row" role="radiogroup" aria-label="별점">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              className={value <= rating ? 'is-active' : ''}
              type="button"
              onClick={() => setRating(value)}
              role="radio"
              aria-checked={value === rating}
              aria-label={`${value}점`}
            >
              <Star size={28} fill="currentColor" />
            </button>
          ))}
        </div>
        <label className="review-textarea">
          <span>후기</span>
          <textarea
            maxLength={1000}
            placeholder="상대방에게 도움이 되는 후기를 적어주세요."
            value={content}
            onChange={(event) => setContent(event.target.value)}
          />
          <em>{content.length}/1000</em>
        </label>
        {error && <p className="inline-status is-error">{error}</p>}
        <div className="review-prompt-actions">
          <BrandButton variant="outline" disabled={busy !== null} onClick={() => void remindLater()}>
            {busy === 'later' ? '설정 중' : '나중에'}
          </BrandButton>
          <BrandButton disabled={busy !== null} onClick={() => void submit()}>
            {busy === 'submit' ? '저장 중' : '후기 남기기'}
          </BrandButton>
        </div>
      </div>
    </div>
  )
}

function BlockConfirmDialog({
  userName,
  error,
  onCancel,
  onConfirm,
}: {
  userName: string
  error?: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="modal-overlay" role="presentation">
      <div className="confirm-dialog block-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="block-confirm-title">
        <h2 id="block-confirm-title">{userName}님을 차단할까요?</h2>
        <p>차단하면 상대방은 나에게 메시지를 보낼 수 없고, 내 채팅 목록에서도 숨겨집니다.</p>
        {error && <p className="inline-status is-error">{error}</p>}
        <div>
          <button type="button" onClick={onCancel}>
            취소
          </button>
          <button type="button" onClick={onConfirm}>
            차단하기
          </button>
        </div>
      </div>
    </div>
  )
}

function ReportSheet({
  userName,
  error,
  onClose,
  onSubmit,
}: {
  userName: string
  error?: string
  onClose: () => void
  onSubmit: (input: { reason: string; description: string; blockAfterReport: boolean }) => void
}) {
  const [reason, setReason] = useState<string>(reportReasons[0])
  const [description, setDescription] = useState('')

  return (
    <div className="sheet-overlay" role="presentation" onClick={onClose}>
      <div className="report-sheet" role="dialog" aria-modal="true" aria-labelledby="report-sheet-title" onClick={(event) => event.stopPropagation()}>
        <div className="drag-handle" />
        <button className="sheet-x" type="button" onClick={onClose} aria-label="닫기">
          ×
        </button>
        <h2 id="report-sheet-title">{userName}님 신고하기</h2>
        <p>신고 내용은 관리자에게 전달됩니다. 필요한 경우 상세 내용을 함께 적어주세요.</p>
        <div className="report-reason-grid" role="radiogroup" aria-label="신고 사유">
          {reportReasons.map((item) => (
            <button
              key={item}
              className={reason === item ? 'is-active' : ''}
              type="button"
              onClick={() => setReason(item)}
              role="radio"
              aria-checked={reason === item}
            >
              {item}
            </button>
          ))}
        </div>
        <label className="report-textarea">
          <span>상세 내용</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={1000}
            placeholder="상황을 자세히 적어주세요."
          />
          <em>{description.length}/1000</em>
        </label>
        {error && <p className="inline-status is-error">{error}</p>}
        <div className="report-sheet-actions">
          <BrandButton variant="outline" size="lg" onClick={() => onSubmit({ reason, description, blockAfterReport: false })}>
            신고하기
          </BrandButton>
          <BrandButton size="lg" onClick={() => onSubmit({ reason, description, blockAfterReport: true })}>
            차단하고 신고하기
          </BrandButton>
        </div>
      </div>
    </div>
  )
}

type TradeActionId = 'accept' | 'reject' | 'complete' | 'dispute' | 'requestComplete' | 'cancel' | 'start'

const tradeActionPendingLabels: Record<TradeActionId, string> = {
  accept: '수락 중',
  reject: '거절 중',
  complete: '승인 중',
  dispute: '신고 중',
  requestComplete: '요청 중',
  cancel: '취소 중',
  start: '시작 중',
}

const tradeActionConfirmationCopy: Record<TradeActionId, { title: string; message: string; confirmLabel: string }> = {
  accept: {
    title: '지원자를 수락할까요?',
    message: '수락하면 거래가 만들어지고 채팅에서 진행을 시작할 수 있습니다.',
    confirmLabel: '수락하기',
  },
  reject: {
    title: '지원을 거절할까요?',
    message: '거절 후에는 이 채팅에서 거래를 진행할 수 없습니다.',
    confirmLabel: '거절하기',
  },
  complete: {
    title: '완료 승인할까요?',
    message: '승인하면 거래가 완료되고 후기 작성 단계로 넘어갑니다.',
    confirmLabel: '완료 승인',
  },
  dispute: {
    title: '문제를 신고할까요?',
    message: '거래에 문제가 있으면 신고 상태로 전환됩니다.',
    confirmLabel: '신고하기',
  },
  requestComplete: {
    title: '완료 요청을 보낼까요?',
    message: '작업이 끝났다면 작성자에게 완료 승인을 요청합니다.',
    confirmLabel: '요청 보내기',
  },
  cancel: {
    title: '거래를 취소할까요?',
    message: '취소 후에는 이 거래를 다시 진행할 수 없습니다.',
    confirmLabel: '취소하기',
  },
  start: {
    title: '거래를 시작할까요?',
    message: '시작 후 지원자가 완료 요청을 보낼 수 있습니다.',
    confirmLabel: '시작하기',
  },
}

interface TradeActionConfirmation {
  id: TradeActionId
  action: () => Promise<unknown>
}

function TradeActionPanel({
  chat,
  currentUserId,
  onOpenProfile,
  onRefresh,
  onReview,
}: {
  chat: UiChat
  currentUserId: string | null
  onOpenProfile: () => void
  onRefresh: () => Promise<void>
  onReview: () => void
}) {
  const [pendingAction, setPendingAction] = useState<TradeActionId | null>(null)
  const [confirmAction, setConfirmAction] = useState<TradeActionConfirmation | null>(null)
  const [phoneVerificationAction, setPhoneVerificationAction] = useState<TradeActionConfirmation | null>(null)
  const [error, setError] = useState('')
  const busy = pendingAction !== null
  const postCreatorId = chat.postCreatorId ?? chat.requesterId
  const isPostWriter = postCreatorId === currentUserId
  const isApplicant = Boolean(currentUserId && currentUserId !== postCreatorId)
  const hasPendingApplication = chat.applicationStatus === 'applied' && !chat.dealId

  function actionText(actionId: TradeActionId, label: string) {
    return pendingAction === actionId ? tradeActionPendingLabels[actionId] : label
  }

  function actionClass(actionId: TradeActionId) {
    return pendingAction === actionId ? 'is-processing' : ''
  }

  async function run(actionId: TradeActionId, action: () => Promise<unknown>) {
    setPendingAction(actionId)
    setError('')
    try {
      await action()
      await onRefresh()
    } catch (nextError) {
      if (actionId === 'dispute' && isPhoneVerificationRequired(nextError)) {
        setError('')
        setPhoneVerificationAction({ id: actionId, action })
        return
      }
      setError(nextError instanceof Error ? nextError.message : '상태를 변경하지 못했습니다.')
    } finally {
      setPendingAction(null)
    }
  }

  function requestConfirmation(actionId: TradeActionId, action: () => Promise<unknown>) {
    if (busy) return
    setConfirmAction({ id: actionId, action })
  }

  async function confirmTradeAction() {
    const nextAction = confirmAction
    if (!nextAction) return
    setConfirmAction(null)
    await run(nextAction.id, nextAction.action)
  }

  function withConfirmation(content: ReactNode) {
    return (
      <>
        {content}
        {confirmAction && (
          <TradeActionConfirmDialog
            actionId={confirmAction.id}
            onCancel={() => setConfirmAction(null)}
            onConfirm={() => void confirmTradeAction()}
          />
        )}
        {phoneVerificationAction && (
          <PhoneVerificationOverlay
            onClose={() => setPhoneVerificationAction(null)}
            onVerified={() => {
              const nextAction = phoneVerificationAction
              setPhoneVerificationAction(null)
              if (nextAction) void run(nextAction.id, nextAction.action)
            }}
          />
        )}
      </>
    )
  }

  if (chat.status === '거래완료') {
    return withConfirmation(
      <div className="complete-panel">
        <div className="complete-icon">✓</div>
        <strong>거래가 완료되었어요. 수고하셨어요!</strong>
        <span>거래는 어떠셨나요?</span>
        <RatingStars rating={5} />
        <div className="two-buttons">
          <BrandButton variant="outline" disabled={Boolean(chat.myReviewId)} onClick={onReview}>
            {chat.myReviewId ? '후기 작성 완료' : '후기 남기기'}
          </BrandButton>
          <BrandButton>다시 부탁하기</BrandButton>
        </div>
      </div>,
    )
  }

  if (chat.status === '취소됨') {
    return withConfirmation(
      <div className="complete-panel">
        <div className="complete-icon">!</div>
        <strong>거래가 취소되었어요</strong>
        <span>필요하다면 게시글 상세에서 다시 모집을 시작할 수 있습니다.</span>
      </div>,
    )
  }

  if (hasPendingApplication && !isPostWriter) {
    return withConfirmation(
      <div className="request-complete-panel">
        <div>
          <strong>지원 수락을 기다리고 있어요.</strong>
          <span>작성자가 수락하면 거래가 시작됩니다.</span>
        </div>
      </div>,
    )
  }

  if (chat.status === '완료요청') {
    const dealId = chat.dealId
    if (!isPostWriter) {
      return withConfirmation(
        <div className="request-complete-panel">
          <div>
            <strong>완료 요청을 보냈어요.</strong>
            <span>게시글 작성자의 완료 승인을 기다리고 있어요.</span>
          </div>
        </div>,
      )
    }

    return withConfirmation(
      <div className="request-complete-panel">
        <div>
          <strong>지원자가 완료 요청을 보냈습니다.</strong>
          <span>
            {chat.hasChatAfterStarted
              ? '물건을 전달받았거나 작업을 확인했다면 승인해주세요.'
              : '진행 시작 후 양쪽 대화가 1턴 이상 있어야 승인할 수 있어요.'}
          </span>
        </div>
        {chat.hasChatAfterStarted && (
          <div className="two-buttons">
            <BrandButton className={actionClass('complete')} disabled={busy || !dealId} onClick={() => dealId && requestConfirmation('complete', () => updateDealStatus(dealId, 'completed'))}>
              {actionText('complete', '완료 승인')}
            </BrandButton>
            <BrandButton className={actionClass('dispute')} variant="outline" disabled={busy || !dealId} onClick={() => dealId && requestConfirmation('dispute', () => updateDealStatus(dealId, 'disputed'))}>
              {actionText('dispute', '문제 신고')}
            </BrandButton>
          </div>
        )}
        {error && <p className="inline-status is-error">{error}</p>}
      </div>,
    )
  }

  if (chat.status === '진행중') {
    const dealId = chat.dealId
    if (!isApplicant) {
      return withConfirmation(
        <div className="request-complete-panel">
          <div>
            <strong>거래가 진행 중이에요.</strong>
            <span>지원자가 완료 요청을 보내면 승인할 수 있습니다.</span>
          </div>
        </div>,
      )
    }

    return withConfirmation(
      <div className="two-buttons chat-action-bar">
        <BrandButton className={actionClass('requestComplete')} disabled={busy || !dealId} onClick={() => dealId && requestConfirmation('requestComplete', () => updateDealStatus(dealId, 'complete_requested'))}>
          {actionText('requestComplete', '완료 요청 보내기')}
        </BrandButton>
        <BrandButton className={actionClass('cancel')} variant="outline" disabled={busy || !dealId} onClick={() => dealId && requestConfirmation('cancel', () => updateDealStatus(dealId, 'cancelled'))}>
          {actionText('cancel', '취소')}
        </BrandButton>
        {error && <p className="inline-status is-error">{error}</p>}
      </div>,
    )
  }

  if (chat.status === '수락대기') {
    const dealId = chat.dealId
    if (!isPostWriter) {
      return withConfirmation(
        <div className="request-complete-panel">
          <div>
            <strong>작성자의 진행 시작을 기다리고 있어요.</strong>
            <span>진행 시작 후 완료 요청을 보낼 수 있습니다.</span>
          </div>
        </div>,
      )
    }

    return withConfirmation(
      <div className="two-buttons chat-action-bar">
        <BrandButton className={actionClass('start')} disabled={busy || !dealId} onClick={() => dealId && requestConfirmation('start', () => updateDealStatus(dealId, 'in_progress'))}>
          {actionText('start', '진행 시작')}
        </BrandButton>
        <BrandButton className={actionClass('cancel')} variant="outline" disabled={busy || !dealId} onClick={() => dealId && requestConfirmation('cancel', () => updateDealStatus(dealId, 'cancelled'))}>
          {actionText('cancel', '취소')}
        </BrandButton>
        {error && <p className="inline-status is-error">{error}</p>}
      </div>,
    )
  }

  if (!hasPendingApplication || !isPostWriter) return null

  const applicationId = chat.applicationId
  return withConfirmation(
    <div className="two-buttons chat-action-bar">
      <div className="applicant-profile-prompt">
        <span>수락 전에 지원자 프로필을 확인해보세요.</span>
        <button type="button" onClick={onOpenProfile}>
          프로필 보기
        </button>
      </div>
      <BrandButton className={actionClass('accept')} disabled={busy || !applicationId} onClick={() => applicationId && requestConfirmation('accept', () => updateApplicationStatus(applicationId, 'accepted'))}>
        {actionText('accept', '수락하기')}
      </BrandButton>
      <BrandButton className={actionClass('reject')} variant="outline" disabled={busy || !applicationId} onClick={() => applicationId && requestConfirmation('reject', () => updateApplicationStatus(applicationId, 'rejected'))}>
        {actionText('reject', '거절하기')}
      </BrandButton>
      {error && <p className="inline-status is-error">{error}</p>}
    </div>,
  )
}

function TradeActionConfirmDialog({
  actionId,
  onCancel,
  onConfirm,
}: {
  actionId: TradeActionId
  onCancel: () => void
  onConfirm: () => void
}) {
  const copy = tradeActionConfirmationCopy[actionId]

  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div className="confirm-dialog trade-action-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="trade-action-confirm-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="trade-action-confirm-title">{copy.title}</h2>
        <p>{copy.message}</p>
        <div>
          <button type="button" onClick={onCancel}>
            돌아가기
          </button>
          <button type="button" onClick={onConfirm}>
            {copy.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function MessageComposer({
  conversationId,
  disabledReason,
  onFailed,
  onFocus,
  onOptimistic,
  onSent,
}: {
  conversationId: string
  disabledReason?: ComposerDisabledReason | null
  onFailed: (clientMessageId: string) => void
  onFocus?: () => void
  onOptimistic: (text: string, clientMessageId: string) => void
  onSent: (message: ApiMessage, clientMessageId: string) => Promise<void>
}) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showPhoneVerification, setShowPhoneVerification] = useState(false)
  const disabled = Boolean(disabledReason)

  async function send() {
    const text = body.trim()
    if (!text || busy || disabled) return
    const clientMessageId = createClientMessageId()
    setBusy(true)
    setError('')
    onOptimistic(text, clientMessageId)
    setBody('')
    try {
      const message = await sendConversationMessage(conversationId, text, clientMessageId)
      await onSent(message, clientMessageId)
    } catch (nextError) {
      onFailed(clientMessageId)
      if (isPhoneVerificationRequired(nextError)) {
        setBody(text)
        setShowPhoneVerification(true)
        return
      }
      setError(nextError instanceof Error ? nextError.message : '메시지를 보내지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="message-composer-wrap">
      {error && <p className="inline-status is-error">{error}</p>}
      <div className={`message-composer ${disabled ? 'is-disabled' : ''} ${disabledReason?.brand ? 'is-brand-notice' : ''}`}>
        <button type="button" aria-label="첨부">
          {disabled ? <LockKeyhole size={18} /> : <Plus size={22} />}
        </button>
        <input
          disabled={disabled}
          placeholder={disabledReason?.message ?? '메시지를 입력하세요'}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onFocus={onFocus}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void send()
          }}
        />
        {!disabled && (
          <>
            <button type="button" aria-label="이모지">
              <Smile size={20} />
            </button>
            <button className="send-button" type="button" aria-label="전송" onClick={send} disabled={busy || body.trim().length === 0}>
              <Send size={18} />
            </button>
          </>
        )}
      </div>
      {showPhoneVerification && (
        <PhoneVerificationOverlay
          onClose={() => setShowPhoneVerification(false)}
          onVerified={() => void send()}
        />
      )}
    </div>
  )
}

function mapConversationToChat(conversation: ApiConversation, currentUserId: string | null): UiChat {
  const otherIsRequester = conversation.helperId === currentUserId
  const otherId = conversation.otherUserId ?? (otherIsRequester ? conversation.requesterId : conversation.helperId)
  const otherName = conversation.otherNickname ?? (otherIsRequester ? conversation.requesterNickname : conversation.helperNickname) ?? '사용자'
  const user: UserProfile = {
    id: otherId,
    name: otherName,
    intro: conversation.otherBio?.trim() || '',
    avatarUrl: normalizeDisplayImageUrl(conversation.otherAvatarUrl) ?? null,
    defaultAvatarKey: conversation.otherDefaultAvatarKey ?? null,
    rating: Number(conversation.otherRatingAvg ?? 0),
    reviewCount: conversation.otherReviewCount ?? undefined,
    completedCount: conversation.otherCompletedCount ?? 0,
    verified: Boolean(conversation.otherPhoneVerified || conversation.otherIdentityVerified),
    phoneVerified: Boolean(conversation.otherPhoneVerified),
    identityVerified: Boolean(conversation.otherIdentityVerified),
    responseTime: conversation.otherResponseTime ?? null,
    gender: conversation.otherGender ?? null,
    careerSummary: conversation.otherCareerSummary ?? null,
    careerDescription: conversation.otherCareerDescription ?? null,
    portfolioLinks: normalizeProfileLinks(conversation.otherPortfolioLinks),
    workSampleImages: normalizeProfileImages(conversation.otherWorkSampleImages),
    avatarTone: otherIsRequester ? 'green' : 'blue',
  }

  const status = mapTradeStatus(conversation)
  const request: RequestPost = {
    id: conversation.postId ?? conversation.id,
    categoryId: 'proxy',
    category: conversation.postCategory ?? '대신해줘',
    title: conversation.postTitle ?? '거래 대화',
    location: '위치 협의',
    detailLocation: '위치 협의',
    deadline: '시간 협의',
    price: conversation.postPrice ?? 0,
    mode: 'both',
    image: 'store',
    status,
    description: '',
    requesterId: conversation.requesterId,
  }

  return {
    id: conversation.id,
    dealId: conversation.dealId,
    applicationId: conversation.applicationId ?? null,
    applicationStatus: conversation.applicationStatus,
    requesterId: conversation.requesterId,
    helperId: conversation.helperId,
    postCreatorId: conversation.postCreatorId ?? null,
    postType: conversation.postType ?? null,
    applicationApplicantId: conversation.applicationApplicantId ?? null,
    hasChatAfterStarted: Boolean(conversation.hasChatAfterStarted),
    myReviewId: conversation.myReviewId ?? null,
    status,
    lastMessage: conversation.lastMessage ?? '새 채팅방이 생성되었어요.',
    lastTime: formatTime(conversation.lastMessageAt),
    unreadCount: conversation.unreadCount ?? 0,
    user,
    request,
  }
}

function mapMockChatToChat(thread: ChatThread): UiChat {
  const request = getRequest(thread.requestId)
  return {
    id: thread.id,
    dealId: null,
    applicationId: null,
    applicationStatus: null,
    requesterId: request.requesterId,
    helperId: thread.userId,
    postCreatorId: request.requesterId,
    postType: 'request',
    applicationApplicantId: thread.userId,
    hasChatAfterStarted: true,
    myReviewId: null,
    status: thread.status,
    lastMessage: thread.lastMessage,
    lastTime: thread.lastTime,
    unreadCount: thread.unreadCount,
    user: getUser(thread.userId),
    request,
  }
}

function mapApiMessage(message: ApiMessage, currentUserId: string | null): UiMessage {
  return {
    id: message.id,
    sender: message.messageType === 'system' ? 'system' : message.senderId === currentUserId ? 'me' : 'other',
    text: message.body ?? (message.messageType === 'image' ? '사진을 보냈습니다.' : '시스템 메시지'),
    time: formatTime(message.createdAt),
    clientMessageId: message.clientMessageId,
    createdAt: message.createdAt,
  }
}

function mergeMessages(previous: UiMessage[], incoming: UiMessage[]) {
  const messages = [...previous]

  incoming.forEach((message) => {
    const existingIndex = messages.findIndex(
      (item) => item.id === message.id || Boolean(message.clientMessageId && item.clientMessageId === message.clientMessageId),
    )
    if (existingIndex >= 0) {
      messages[existingIndex] = {
        ...messages[existingIndex],
        ...message,
        failed: message.failed ?? false,
        pending: message.pending ?? false,
      }
      return
    }

    messages.push(message)
  })

  return messages.sort((a, b) => {
    const left = a.createdAt ? new Date(a.createdAt).getTime() : 0
    const right = b.createdAt ? new Date(b.createdAt).getTime() : 0
    return left - right
  })
}

function getLastCreatedAt(messages: UiMessage[]) {
  return messages.reduce<string | null>((latest, message) => {
    if (!message.createdAt) return latest
    if (!latest) return message.createdAt
    return new Date(message.createdAt).getTime() > new Date(latest).getTime() ? message.createdAt : latest
  }, null)
}

function mapRealtimePayload(payload: unknown): ApiMessage | null {
  const record = getRealtimeRecord(payload)
  if (!record) return null

  const id = readString(record, 'id')
  const conversationId = readString(record, 'conversationId', 'conversation_id')
  const senderId = readString(record, 'senderId', 'sender_id')
  const createdAt = readString(record, 'createdAt', 'created_at')
  const messageType = readString(record, 'messageType', 'message_type')

  if (!id || !conversationId || !senderId || !createdAt || !isMessageType(messageType)) return null

  return {
    id,
    conversationId,
    senderId,
    messageType,
    body: readNullableString(record, 'body'),
    imageUrl: readNullableString(record, 'imageUrl', 'image_url'),
    clientMessageId: readNullableString(record, 'clientMessageId', 'client_message_id'),
    deliveredAt: readNullableString(record, 'deliveredAt', 'delivered_at'),
    readAt: readNullableString(record, 'readAt', 'read_at'),
    createdAt,
  }
}

function getRealtimeRecord(payload: unknown): Record<string, unknown> | null {
  const value = isRecord(payload) && isRecord(payload.payload) ? payload.payload : payload
  const candidates = [
    isRecord(value) ? value.record : null,
    isRecord(value) ? value.new : null,
    isRecord(value) ? value.new_record : null,
    value,
  ]

  return candidates.find(isRecord) ?? null
}

function readString(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string') return value
  }
  return null
}

function readNullableString(record: Record<string, unknown>, ...keys: string[]) {
  return readString(record, ...keys)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMessageType(value: string | null): value is ApiMessage['messageType'] {
  return value === 'text' || value === 'image' || value === 'system'
}

function createClientMessageId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `00000000-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`
}

function getComposerDisabledReason(chat: UiChat): ComposerDisabledReason | null {
  if (chat.postType === 'request' && chat.applicationStatus === 'applied' && !chat.dealId) {
    return {
      message: '지원 요청이 수락되면 채팅을 할 수 있습니다.',
      brand: true,
    }
  }
  if (chat.status === '거래완료' || chat.status === '취소됨') {
    return {
      message: '종료된 거래라 메시지를 보낼 수 없어요.',
    }
  }
  return null
}

function mapTradeStatus(conversation: ApiConversation): TradeStatus {
  if (conversation.dealStatus === 'completed') return '거래완료'
  if (conversation.dealStatus === 'complete_requested') return '완료요청'
  if (conversation.dealStatus === 'in_progress') return '진행중'
  if (conversation.dealStatus === 'cancelled' || conversation.dealStatus === 'disputed') return '취소됨'
  if (conversation.dealStatus === 'accepted' || conversation.dealStatus === 'pending') return '수락대기'
  if (conversation.applicationStatus === 'rejected' || conversation.applicationStatus === 'cancelled') return '취소됨'
  return '문의중'
}

function formatTime(value?: string | null) {
  if (!value) return '대화 전'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '방금 전'
  return new Intl.DateTimeFormat('ko-KR', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function normalizeProfileLinks(value: unknown): Array<{ title: string; url: string }> {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const url = typeof item.url === 'string' ? item.url.trim() : ''
    if (!isHttpUrl(url)) return []
    const title = typeof item.title === 'string' ? item.title.trim() : ''
    return [{ title, url }]
  })
}

function normalizeProfileImages(value: unknown): Array<{ imageUrl: string; storageKey?: string; sortOrder?: number }> {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const imageUrl = getDisplayImageUrl({
      imageUrl: typeof item.imageUrl === 'string' ? item.imageUrl : undefined,
      storageKey: typeof item.storageKey === 'string' ? item.storageKey : undefined,
    })?.trim() ?? ''
    if (!imageUrl || (!isHttpUrl(imageUrl) && !imageUrl.startsWith('/'))) return []
    const storageKey = typeof item.storageKey === 'string' ? item.storageKey : undefined
    const sortOrder = typeof item.sortOrder === 'number' ? item.sortOrder : undefined
    return [{ imageUrl, storageKey, sortOrder }]
  })
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function reviewPromptStorageKey(dealId: string) {
  return `manwon_review_prompt_deferred_until:${dealId}`
}

function getDeferredReviewUntil(dealId: string) {
  if (typeof window === 'undefined') return null
  const value = window.localStorage.getItem(reviewPromptStorageKey(dealId))
  if (!value) return null
  const timestamp = Number(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

function deferReviewPrompt(dealId: string) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(reviewPromptStorageKey(dealId), String(Date.now() + 24 * 60 * 60 * 1000))
}

function clearDeferredReview(dealId: string) {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(reviewPromptStorageKey(dealId))
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
