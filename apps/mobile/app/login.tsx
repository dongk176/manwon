import { router } from 'expo-router'
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native'
import { PrimaryButton, Screen } from '@/components/ui'
import { useAuth } from '@/features/auth/AuthProvider'
import { colors, spacing } from '@/theme/colors'

export default function LoginScreen() {
  const { signIn } = useAuth()
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    if (!loginId || !password || busy) return
    setBusy(true)
    setError('')
    try {
      await signIn({ loginId, password })
      router.replace('/(tabs)')
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '로그인하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap}>
        <Text style={styles.brand}>만원부탁소</Text>
        <Text style={styles.subtitle}>동네 부탁을 안전하게 주고받으세요.</Text>
        <View style={styles.form}>
          <TextInput style={styles.input} value={loginId} onChangeText={setLoginId} placeholder="아이디" autoCapitalize="none" />
          <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="비밀번호" secureTextEntry />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton disabled={busy || !loginId || !password} onPress={submit}>
            {busy ? '확인 중' : '로그인하기'}
          </PrimaryButton>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  screen: {
    justifyContent: 'center',
  },
  wrap: {
    gap: spacing.lg,
  },
  brand: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 0,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
  },
  form: {
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  error: {
    color: colors.danger,
    fontWeight: '700',
  },
})
