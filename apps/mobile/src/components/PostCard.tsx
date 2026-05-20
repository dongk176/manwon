import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { Pill } from '@/components/ui'
import { colors, spacing } from '@/theme/colors'
import type { TaskPost } from '@/types/manwon'

export function PostCard({ post, onPress }: { post: TaskPost; onPress: () => void }) {
  const badge = getStatusBadge(post.status)
  const imageUrl = post.images?.slice().sort((a, b) => a.sortOrder - b.sortOrder)[0]?.imageUrl

  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed]} onPress={onPress}>
      {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.image} /> : <View style={styles.imagePlaceholder} />}
      <View style={styles.body}>
        <View style={styles.topLine}>
          <Text style={styles.category}>{post.category}</Text>
          {badge ? <Pill tone={badge.tone}>{badge.label}</Pill> : null}
        </View>
        <Text style={styles.title} numberOfLines={2}>{post.title}</Text>
        <Text style={styles.meta} numberOfLines={1}>{post.addressText ?? '위치 협의'} · {formatPrice(post.price)}</Text>
      </View>
    </Pressable>
  )
}

function getStatusBadge(status: TaskPost['status']) {
  if (status === 'pending' || status === 'in_progress') return { label: '진행중', tone: 'progress' as const }
  if (status === 'completed') return { label: '거래 완료', tone: 'done' as const }
  return null
}

export function formatPrice(value: number) {
  return `${value.toLocaleString('ko-KR')}원`
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
  },
  pressed: {
    opacity: 0.82,
  },
  image: {
    width: 82,
    height: 82,
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
  },
  imagePlaceholder: {
    width: 82,
    height: 82,
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
  },
  body: {
    flex: 1,
    gap: 7,
  },
  topLine: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  category: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 21,
  },
  meta: {
    color: colors.textMuted,
    fontSize: 13,
  },
})
