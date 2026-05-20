import { router } from 'expo-router'
import { useState } from 'react'
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { createTaskPost } from '@/api/client'
import { PrimaryButton, Screen } from '@/components/ui'
import { colors, spacing } from '@/theme/colors'

export function RegisterScreen() {
  const [postType, setPostType] = useState<'request' | 'offer'>('request')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('동네 심부름')
  const [price, setPrice] = useState('10000')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!title.trim() || !description.trim() || busy) return
    setBusy(true)
    try {
      const post = await createTaskPost({
        postType,
        title: title.trim(),
        category: category.trim() || '동네 심부름',
        description: description.trim(),
        mode: 'both',
        price: Number(price.replace(/\D/g, '')) || 0,
      })
      router.push(`/posts/${post.id}`)
    } catch (error) {
      Alert.alert('등록하지 못했습니다', error instanceof Error ? error.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>등록</Text>
        <View style={styles.segment}>
          <Text style={[styles.segmentItem, postType === 'request' && styles.active]} onPress={() => setPostType('request')}>부탁해요</Text>
          <Text style={[styles.segmentItem, postType === 'offer' && styles.active]} onPress={() => setPostType('offer')}>해줄게요</Text>
        </View>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="제목" />
        <TextInput style={styles.input} value={category} onChangeText={setCategory} placeholder="카테고리" />
        <TextInput style={styles.input} value={price} onChangeText={setPrice} placeholder="금액" keyboardType="number-pad" />
        <TextInput
          style={[styles.input, styles.textarea]}
          value={description}
          onChangeText={setDescription}
          placeholder="상세 내용을 적어주세요."
          multiline
        />
        <PrimaryButton disabled={busy || !title.trim() || !description.trim()} onPress={submit}>
          {busy ? '등록 중' : '등록하기'}
        </PrimaryButton>
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 58,
  },
  content: {
    gap: spacing.md,
    paddingBottom: 120,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
    marginBottom: spacing.sm,
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
  textarea: {
    minHeight: 150,
    paddingTop: spacing.lg,
    textAlignVertical: 'top',
  },
})
