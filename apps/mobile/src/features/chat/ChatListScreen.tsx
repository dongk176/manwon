import { router } from 'expo-router'
import { useEffect } from 'react'
import { FlatList, RefreshControl, StyleSheet, Text, Pressable, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { fetchConversations } from '@/api/client'
import { getAuthorizedRealtimeClient } from '@/api/realtime'
import { EmptyState, LoadingState, Pill, Screen } from '@/components/ui'
import { useAuth } from '@/features/auth/AuthProvider'
import { colors, spacing } from '@/theme/colors'
import type { Conversation } from '@/types/manwon'

export function ChatListScreen() {
  const { profile } = useAuth()
  const query = useQuery({ queryKey: ['conversations'], queryFn: fetchConversations })

  useEffect(() => {
    let cleanup: (() => void) | undefined
    let cancelled = false
    getAuthorizedRealtimeClient()
      .then((client) => {
        if (!client || cancelled) return
        if (!profile?.id) return
        const channel = client.channel(`user:${profile.id}:conversations`, { config: { private: true } }).on('broadcast', { event: '*' }, () => void query.refetch()).subscribe()
        cleanup = () => {
          void client.removeChannel(channel)
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [profile?.id, query])

  if (query.isLoading) return <LoadingState label="채팅 목록을 불러오는 중입니다." />

  return (
    <Screen style={styles.screen}>
      <Text style={styles.title}>채팅</Text>
      <FlatList
        data={query.data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.primary} />}
        ListEmptyComponent={<EmptyState title="아직 대화가 없어요" body="게시글에서 문의하거나 지원하면 채팅방이 만들어집니다." />}
        renderItem={({ item }) => <ChatRow conversation={item} onPress={() => router.push(`/chat/${item.id}`)} />}
      />
    </Screen>
  )
}

function ChatRow({ conversation, onPress }: { conversation: Conversation; onPress: () => void }) {
  const unread = conversation.unreadCount ?? 0
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && styles.pressed]} onPress={onPress}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{(conversation.otherNickname ?? '상').slice(0, 1)}</Text>
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.name}>{conversation.otherNickname ?? '상대방'}</Text>
          <Pill tone={conversation.dealStatus === 'completed' ? 'done' : 'progress'}>{mapStatus(conversation)}</Pill>
        </View>
        <Text style={styles.last} numberOfLines={1}>{conversation.lastMessage ?? '새 채팅방이 생성되었어요.'}</Text>
      </View>
      {unread > 0 ? <View style={styles.unread}><Text style={styles.unreadText}>{unread > 9 ? '9+' : unread}</Text></View> : null}
    </Pressable>
  )
}

function mapStatus(conversation: Conversation) {
  if (conversation.dealStatus === 'completed') return '거래완료'
  if (conversation.dealStatus === 'cancelled') return '취소됨'
  if (conversation.dealStatus === 'in_progress') return '진행중'
  if (conversation.dealStatus === 'complete_requested') return '완료요청'
  if (conversation.dealStatus === 'accepted') return '수락대기'
  return conversation.applicationStatus === 'applied' ? '지원됨' : '문의'
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 58,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
    marginBottom: spacing.lg,
  },
  list: {
    gap: spacing.md,
    paddingBottom: 120,
  },
  row: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  pressed: {
    opacity: 0.82,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  avatarText: {
    color: colors.primary,
    fontWeight: '900',
  },
  rowBody: {
    flex: 1,
    gap: 6,
  },
  rowTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  name: {
    color: colors.text,
    fontWeight: '900',
  },
  last: {
    color: colors.textMuted,
  },
  unread: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 999,
    minWidth: 24,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  unreadText: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: '900',
  },
})
