import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchTaskPost, reopenTaskPost, startConversationFromPost } from '@/api/client'
import { EmptyState, LoadingState, Pill, PrimaryButton, Screen } from '@/components/ui'
import { formatPrice } from '@/components/PostCard'
import { useAuth } from '@/features/auth/AuthProvider'
import { colors, spacing } from '@/theme/colors'
import type { TaskPost } from '@/types/manwon'

export function PostDetailScreen() {
  const params = useLocalSearchParams<{ id?: string; postId?: string }>()
  const id = params.id ?? params.postId ?? ''
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const [busy, setBusy] = useState(false)
  const query = useQuery({
    queryKey: ['post', id],
    queryFn: () => fetchTaskPost(id),
    enabled: Boolean(id),
  })

  if (query.isLoading) return <LoadingState label="게시글을 불러오는 중입니다." />
  if (!query.data) return <EmptyState title="게시글을 찾지 못했어요" />

  const post = query.data
  const cta = getCta(post, profile?.id === post.creatorId)
  const imageUrl = post.images?.slice().sort((a, b) => a.sortOrder - b.sortOrder)[0]?.imageUrl

  async function runPrimaryAction() {
    if (busy || cta.disabled) return
    setBusy(true)
    try {
      if (post.status === 'cancelled') {
        const updated = await reopenTaskPost(post.id)
        queryClient.setQueryData(['post', id], updated)
        Alert.alert('다시 모집을 시작했어요')
        return
      }
      const conversation = await startConversationFromPost(post.id, '문의드려요.')
      router.push(`/chat/${conversation.id}`)
    } catch (error) {
      Alert.alert('처리하지 못했습니다', error instanceof Error ? error.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.image} /> : <View style={styles.imagePlaceholder} />}
        <View style={styles.titleRow}>
          <Text style={styles.category}>{post.category}</Text>
          {getBadge(post) ? <Pill tone={getBadge(post)?.tone}>{getBadge(post)?.label ?? ''}</Pill> : null}
        </View>
        <Text style={styles.title}>{post.title}</Text>
        <Text style={styles.price}>{formatPrice(post.price)}</Text>
        <Text style={styles.meta}>{post.addressText ?? '위치 협의'} · {post.deadlineText ?? '시간 협의'}</Text>
        <View style={styles.authorBox}>
          <Text style={styles.authorName}>{post.creatorNickname ?? '작성자'}</Text>
          <Text style={styles.authorMeta}>완료 {post.creatorCompletedCount ?? 0}건 · 평점 {post.creatorRatingAvg ?? '-'}</Text>
        </View>
        <Text style={styles.description}>{post.description}</Text>
      </ScrollView>
      <View style={styles.ctaBar}>
        <PrimaryButton disabled={busy || cta.disabled} onPress={runPrimaryAction}>
          {busy ? '처리 중' : cta.label}
        </PrimaryButton>
      </View>
    </Screen>
  )
}

function getBadge(post: TaskPost) {
  if (post.status === 'pending' || post.status === 'in_progress') return { label: '진행중', tone: 'progress' as const }
  if (post.status === 'completed') return { label: '거래 완료', tone: 'done' as const }
  if (post.status === 'cancelled') return { label: '취소됨', tone: 'danger' as const }
  return null
}

function getCta(post: TaskPost, isOwner: boolean) {
  if (post.status === 'open') return { label: post.postType === 'offer' ? '문의하기' : '제가 할게요', disabled: false }
  if (post.status === 'pending' || post.status === 'in_progress') return { label: '이미 진행중입니다', disabled: true }
  if (post.status === 'completed') return { label: '거래 완료됨', disabled: true }
  if (post.status === 'cancelled') return isOwner ? { label: '다시 모집하기', disabled: false } : { label: '취소된 부탁입니다', disabled: true }
  return { label: '이용할 수 없습니다', disabled: true }
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 0,
  },
  content: {
    paddingBottom: 120,
  },
  image: {
    width: '100%',
    height: 310,
    backgroundColor: colors.surfaceMuted,
  },
  imagePlaceholder: {
    height: 260,
    backgroundColor: colors.surfaceMuted,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  category: {
    color: colors.textMuted,
    fontWeight: '800',
  },
  title: {
    color: colors.text,
    fontSize: 25,
    fontWeight: '900',
    lineHeight: 32,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  price: {
    color: colors.primary,
    fontSize: 22,
    fontWeight: '900',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  meta: {
    color: colors.textMuted,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  authorBox: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    gap: 4,
    margin: spacing.lg,
    padding: spacing.lg,
  },
  authorName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  authorMeta: {
    color: colors.textMuted,
  },
  description: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
    paddingHorizontal: spacing.lg,
  },
  ctaBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    bottom: 0,
    left: 0,
    padding: spacing.lg,
    position: 'absolute',
    right: 0,
  },
})
