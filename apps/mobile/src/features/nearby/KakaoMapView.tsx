import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, spacing } from '@/theme/colors'
import type { TaskPost } from '@/types/manwon'

export function KakaoMapView({
  posts,
  selectedPostId,
  onSelectPost,
}: {
  posts: TaskPost[]
  selectedPostId?: string | null
  onSelectPost: (postId: string) => void
}) {
  return (
    <View style={styles.map}>
      <Text style={styles.mapLabel}>Kakao Map</Text>
      {posts.slice(0, 8).map((post, index) => (
        <Pressable
          key={post.id}
          style={[
            styles.pin,
            {
              left: `${18 + (index * 19) % 64}%`,
              top: `${22 + (index * 13) % 48}%`,
            },
            post.id === selectedPostId && styles.activePin,
          ]}
          onPress={() => onSelectPost(post.id)}
        >
          <Text style={styles.pinText}>{Math.min(Math.max(Math.round(post.price / 1000), 1), 99)}</Text>
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  map: {
    backgroundColor: '#dfe9df',
    flex: 1,
    minHeight: 360,
    overflow: 'hidden',
  },
  mapLabel: {
    color: colors.primaryDark,
    fontSize: 18,
    fontWeight: '900',
    left: spacing.lg,
    position: 'absolute',
    top: spacing.lg,
  },
  pin: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderRadius: 999,
    borderWidth: 2,
    height: 38,
    justifyContent: 'center',
    position: 'absolute',
    width: 38,
  },
  activePin: {
    backgroundColor: colors.primary,
  },
  pinText: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '900',
  },
})
