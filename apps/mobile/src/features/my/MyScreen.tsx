import { router } from 'expo-router'
import { Alert, StyleSheet, Text, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { fetchSession } from '@/api/client'
import { Card, LoadingState, PrimaryButton, Screen } from '@/components/ui'
import { useAuth } from '@/features/auth/AuthProvider'
import { colors, spacing } from '@/theme/colors'

export function MyScreen() {
  const auth = useAuth()
  const query = useQuery({ queryKey: ['session'], queryFn: fetchSession })

  if (auth.loading || query.isLoading) return <LoadingState label="내 정보를 불러오는 중입니다." />
  if (!auth.signedIn) {
    return (
      <Screen style={styles.screen}>
        <Text style={styles.title}>마이</Text>
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>로그인이 필요해요</Text>
          <Text style={styles.muted}>채팅, 등록, 거래 알림을 사용하려면 로그인해주세요.</Text>
          <PrimaryButton onPress={() => router.push('/login')}>로그인하기</PrimaryButton>
        </Card>
      </Screen>
    )
  }

  const profile = query.data?.profile ?? auth.profile

  async function signOut() {
    try {
      await auth.signOut()
    } catch (error) {
      Alert.alert('로그아웃하지 못했습니다', error instanceof Error ? error.message : undefined)
    }
  }

  return (
    <Screen style={styles.screen}>
      <Text style={styles.title}>마이</Text>
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>{profile?.nickname ?? profile?.displayName ?? '만원부탁소 사용자'}</Text>
        <Text style={styles.muted}>완료 {profile?.completedCount ?? 0}건 · 평점 {profile?.ratingAvg ?? '-'}</Text>
      </Card>
      <View style={styles.menu}>
        <Text style={styles.menuItem}>내 부탁</Text>
        <Text style={styles.menuItem}>내가 해준 일</Text>
        <Text style={styles.menuItem}>찜한 부탁</Text>
        <Text style={styles.menuItem}>정산/후기/인증 관리</Text>
      </View>
      <PrimaryButton variant="outline" onPress={signOut}>로그아웃</PrimaryButton>
    </Screen>
  )
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 58,
    gap: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  card: {
    gap: spacing.md,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '900',
  },
  muted: {
    color: colors.textMuted,
  },
  menu: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    overflow: 'hidden',
  },
  menuItem: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    padding: spacing.lg,
  },
})
