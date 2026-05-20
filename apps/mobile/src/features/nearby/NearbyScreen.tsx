import { router } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import * as Location from 'expo-location'
import { useQuery } from '@tanstack/react-query'
import { fetchTaskPosts } from '@/api/client'
import { PostCard } from '@/components/PostCard'
import { LoadingState, Screen } from '@/components/ui'
import { KakaoMapView } from '@/features/nearby/KakaoMapView'
import { colors, spacing } from '@/theme/colors'

type PanelState = 'collapsed' | 'peek' | 'expanded'

export function NearbyScreen() {
  const [panelState, setPanelState] = useState<PanelState>('peek')
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null)
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({ lat: 37.5009, lng: 127.0365 })

  useEffect(() => {
    Location.requestForegroundPermissionsAsync()
      .then(async ({ status }) => {
        if (status !== 'granted') return
        const current = await Location.getCurrentPositionAsync({})
        setCoords({ lat: current.coords.latitude, lng: current.coords.longitude })
      })
      .catch(() => undefined)
  }, [])

  const query = useQuery({
    queryKey: ['nearby-posts', coords],
    queryFn: () => fetchTaskPosts({ nearby: true, lat: coords.lat, lng: coords.lng, radiusM: 1000, statusScope: 'public' }),
  })
  const posts = query.data ?? []
  const selectedPost = useMemo(() => posts.find((post) => post.id === selectedPostId) ?? posts[0] ?? null, [posts, selectedPostId])

  if (query.isLoading) return <LoadingState label="주변 부탁을 불러오는 중입니다." />

  return (
    <View style={styles.container}>
      <KakaoMapView posts={posts} selectedPostId={selectedPost?.id} onSelectPost={setSelectedPostId} />
      <View style={[styles.sheet, panelState === 'collapsed' && styles.collapsed, panelState === 'expanded' && styles.expanded]}>
        <Pressable style={styles.handle} onPress={() => setPanelState(panelState === 'expanded' ? 'peek' : 'expanded')}>
          <View style={styles.handleBar} />
          <Text style={styles.sheetTitle}>주변 부탁 {posts.length}개</Text>
        </Pressable>
        {panelState === 'collapsed' && selectedPost ? (
          <PostCard post={selectedPost} onPress={() => router.push(`/posts/${selectedPost.id}`)} />
        ) : (
          <FlatList
            data={posts}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => <PostCard post={item} onPress={() => router.push(`/posts/${item.id}`)} />}
          />
        )}
      </View>
    </View>
  )
}

export function NearbyPostDetailScreen() {
  return <Screen><Text>주변 상세는 게시글 상세 화면으로 연결됩니다.</Text></Screen>
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    bottom: 0,
    height: '42%',
    left: 0,
    paddingHorizontal: spacing.lg,
    position: 'absolute',
    right: 0,
  },
  collapsed: {
    height: 146,
  },
  expanded: {
    height: '78%',
  },
  handle: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  handleBar: {
    backgroundColor: colors.border,
    borderRadius: 999,
    height: 5,
    width: 42,
  },
  sheetTitle: {
    alignSelf: 'flex-start',
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  list: {
    gap: spacing.md,
    paddingBottom: 40,
    paddingTop: spacing.md,
  },
})
