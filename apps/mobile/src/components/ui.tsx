import { ActivityIndicator, Pressable, StyleSheet, Text, View, type PressableProps, type ViewProps } from 'react-native'
import { colors, spacing } from '@/theme/colors'

export function Screen({ children, style }: ViewProps) {
  return <View style={[styles.screen, style]}>{children}</View>
}

export function Card({ children, style }: ViewProps) {
  return <View style={[styles.card, style]}>{children}</View>
}

export function PrimaryButton({ children, disabled, variant = 'filled', style, ...props }: PressableProps & { variant?: 'filled' | 'outline' }) {
  return (
    <Pressable
      {...props}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        variant === 'outline' ? styles.outlineButton : styles.filledButton,
        disabled ? styles.disabledButton : null,
        pressed && !disabled ? styles.pressed : null,
        style as object,
      ]}
    >
      <Text style={[styles.buttonText, variant === 'outline' ? styles.outlineButtonText : null]}>{children as string}</Text>
    </Pressable>
  )
}

export function Pill({ children, tone = 'neutral' }: { children: string; tone?: 'neutral' | 'progress' | 'done' | 'danger' }) {
  return (
    <View style={[styles.pill, tone === 'progress' && styles.progressPill, tone === 'done' && styles.donePill, tone === 'danger' && styles.dangerPill]}>
      <Text style={styles.pillText}>{children}</Text>
    </View>
  )
}

export function LoadingState({ label = '불러오는 중입니다.' }: { label?: string }) {
  return (
    <View style={styles.state}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.stateText}>{label}</Text>
    </View>
  )
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <View style={styles.state}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={styles.stateText}>{body}</Text> : null}
    </View>
  )
}

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  button: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingHorizontal: spacing.lg,
  },
  filledButton: {
    backgroundColor: colors.primary,
  },
  outlineButton: {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderWidth: 1,
  },
  disabledButton: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '800',
  },
  outlineButtonText: {
    color: colors.primary,
  },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  progressPill: {
    backgroundColor: '#e8f0ff',
  },
  donePill: {
    backgroundColor: '#e8f4ed',
  },
  dangerPill: {
    backgroundColor: '#fde9e6',
  },
  pillText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  state: {
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  stateText: {
    color: colors.textMuted,
    lineHeight: 20,
    textAlign: 'center',
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
})
