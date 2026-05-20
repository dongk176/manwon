import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { fetchTaskPosts } from '@/api/client'
import { EmptyState, LoadingState, Screen } from '@/components/ui'
import { PostCard } from '@/components/PostCard'
import { colors, spacing } from '@/theme/colors'
import type { TaskPost } from '@/types/manwon'

type HomeMode = 'request' | 'offer'

export function HomeScreen() {
  const [mode, setMode] = useState<HomeMode>('request')
  const query = useQuery({
    queryKey: ['home-posts', mode],
    queryFn: () => fetchTaskPosts({ postType: mode, statusScope: 'public' }),
  })
  const posts = useMemo(() => sortHomePosts(query.data ?? []), [query.data])

  if (query.isLoading) return <LoadingState label="홈 피드를 불러오는 중입니다." />

  return (
    <Screen style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>만원부탁소</Text>
        <View style={styles.segment}>
          <Text style={[styles.segmentItem, mode === 'request' && styles.active]} onPress={() => setMode('request')}>부탁해요</Text>
          <Text style={[styles.segmentItem, mode === 'offer' && styles.active]} onPress={() => setMode('offer')}>해줄게요</Text>
        </View>
      </View>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.primary} />}
        ListEmptyComponent={<EmptyState title="보이는 게시글이 없어요" body="필터를 바꾸거나 잠시 뒤 다시 확인해주세요." />}
        renderItem={({ item }) => <PostCard post={item} onPress={() => router.push(`/posts/${item.id}`)} />}
      />
    </Screen>
  )
}

function sortHomePosts(posts: TaskPost[]) {
  const rank = { open: 0, pending: 1, in_progress: 1, completed: 2, cancelled: 3, hidden: 4 } satisfies Record<TaskPost['status'], number>
  return posts.slice().sort((a, b) => rank[a.status] - rank[b.status])
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 58,
  },
  header: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  segment: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 10,
    flexDirection: 'row',
    padding: 4,
  },
  segmentItem: {
    borderRadius: 8,
    color: colors.textMuted,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  active: {
    backgroundColor: colors.surface,
    color: colors.primary,
  },
  list: {
    gap: spacing.md,
    paddingBottom: 120,
  },
})
