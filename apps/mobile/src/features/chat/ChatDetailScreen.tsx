import { useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as ImagePicker from 'expo-image-picker'
import { fetchConversations, fetchMessages, markConversationRead, sendImageMessage, sendTextMessage, updateApplicationStatus, updateDealStatus, uploadImageFile } from '@/api/client'
import { getAuthorizedRealtimeClient } from '@/api/realtime'
import { EmptyState, LoadingState, PrimaryButton, Screen } from '@/components/ui'
import { useAuth } from '@/features/auth/AuthProvider'
import { colors, spacing } from '@/theme/colors'
import type { Conversation, Message } from '@/types/manwon'

export function ChatDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [body, setBody] = useState('')
  const [pending, setPending] = useState<Message[]>([])
  const listRef = useRef<FlatList<Message>>(null)

  const conversationsQuery = useQuery({ queryKey: ['conversations'], queryFn: fetchConversations })
  const messagesQuery = useQuery({
    queryKey: ['messages', id],
    queryFn: () => fetchMessages(id),
    enabled: Boolean(id),
  })
  const conversation = conversationsQuery.data?.find((item) => item.id === id) ?? null
  const messages = useMemo(() => [...(messagesQuery.data ?? []), ...pending].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()), [messagesQuery.data, pending])

  useEffect(() => {
    if (!id) return
    markConversationRead(id).catch(() => undefined)
  }, [id])

  useEffect(() => {
    let cleanup: (() => void) | undefined
    let cancelled = false
    getAuthorizedRealtimeClient()
      .then((client) => {
        if (!client || cancelled) return
        const channel = client
          .channel(`conversation:${id}`, { config: { private: true, broadcast: { self: false } } })
          .on('broadcast', { event: '*' }, () => {
            void queryClient.invalidateQueries({ queryKey: ['messages', id] })
            void queryClient.invalidateQueries({ queryKey: ['conversations'] })
          })
          .subscribe()
        cleanup = () => {
          void client.removeChannel(channel)
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [id, queryClient])

  async function send() {
    const text = body.trim()
    if (!text) return
    const clientMessageId = createClientMessageId()
    const optimistic: Message = {
      id: `pending-${clientMessageId}`,
      conversationId: id,
      senderId: profile?.id ?? 'me',
      messageType: 'text',
      body: text,
      imageUrl: null,
      clientMessageId,
      deliveredAt: null,
      readAt: null,
      createdAt: new Date().toISOString(),
    }
    setPending((current) => [...current, optimistic])
    setBody('')
    try {
      const sent = await sendTextMessage(id, text, clientMessageId)
      setPending((current) => current.filter((message) => message.clientMessageId !== clientMessageId))
      queryClient.setQueryData<Message[]>(['messages', id], (current = []) => mergeMessages(current, [sent]))
      void queryClient.invalidateQueries({ queryKey: ['conversations'] })
    } catch (error) {
      Alert.alert('전송 실패', error instanceof Error ? error.message : undefined)
    }
  }

  async function attachImage() {
    if (closed) return
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.82,
    })
    if (result.canceled || !result.assets[0]) return
    const asset = result.assets[0]
    const clientMessageId = createClientMessageId()
    try {
      const upload = await uploadImageFile({
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        target: 'chat-message',
      })
      const sent = await sendImageMessage(id, upload.imageUrl, clientMessageId)
      queryClient.setQueryData<Message[]>(['messages', id], (current = []) => mergeMessages(current, [sent]))
    } catch (error) {
      Alert.alert('사진을 보내지 못했습니다', error instanceof Error ? error.message : undefined)
    }
  }

  if (messagesQuery.isLoading || conversationsQuery.isLoading) return <LoadingState label="채팅방을 불러오는 중입니다." />
  if (!conversation) return <EmptyState title="채팅방을 찾지 못했어요" />

  const closed = conversation.dealStatus === 'completed' || conversation.dealStatus === 'cancelled'

  return (
    <Screen style={styles.screen}>
      <Text style={styles.title}>{conversation.otherNickname ?? '상대방'}</Text>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messages}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => <MessageBubble message={item} mine={item.senderId === profile?.id} />}
        ListHeaderComponent={<TradeActionPanel conversation={conversation} />}
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.composer}>
          <Pressable style={[styles.attach, closed && styles.disabled]} disabled={closed} onPress={attachImage}>
            <Text style={styles.attachText}>+</Text>
          </Pressable>
          <TextInput
            editable={!closed}
            style={styles.input}
            value={body}
            onChangeText={setBody}
            placeholder={closed ? '종료된 거래라 메시지를 보낼 수 없어요.' : '메시지를 입력하세요'}
          />
          <Pressable style={[styles.send, (!body.trim() || closed) && styles.disabled]} disabled={!body.trim() || closed} onPress={send}>
            <Text style={styles.sendText}>전송</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  )
}

function TradeActionPanel({ conversation }: { conversation: Conversation }) {
  const [busy, setBusy] = useState(false)
  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    try {
      await action()
    } catch (error) {
      Alert.alert('상태를 바꾸지 못했습니다', error instanceof Error ? error.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  if (conversation.dealStatus === 'completed') return <View style={styles.panel}><Text style={styles.panelTitle}>거래가 완료되었어요.</Text></View>
  if (conversation.dealStatus === 'cancelled') return <View style={styles.panel}><Text style={styles.panelTitle}>거래가 취소되었어요.</Text></View>
  if (conversation.dealStatus === 'complete_requested' && conversation.dealId) {
    return (
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>완료 요청이 도착했어요.</Text>
        <View style={styles.actions}>
          <PrimaryButton disabled={busy} onPress={() => run(() => updateDealStatus(conversation.dealId as string, 'completed'))}>완료 승인</PrimaryButton>
          <PrimaryButton variant="outline" disabled={busy} onPress={() => run(() => updateDealStatus(conversation.dealId as string, 'disputed'))}>문제 신고</PrimaryButton>
        </View>
      </View>
    )
  }
  if ((conversation.dealStatus === 'accepted' || conversation.dealStatus === 'in_progress') && conversation.dealId) {
    return (
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>{conversation.dealStatus === 'accepted' ? '거래를 시작할 수 있어요.' : '진행 중인 거래입니다.'}</Text>
        <View style={styles.actions}>
          <PrimaryButton disabled={busy} onPress={() => run(() => updateDealStatus(conversation.dealId as string, conversation.dealStatus === 'accepted' ? 'in_progress' : 'complete_requested'))}>
            {conversation.dealStatus === 'accepted' ? '진행 시작' : '완료 요청'}
          </PrimaryButton>
          <PrimaryButton variant="outline" disabled={busy} onPress={() => run(() => updateDealStatus(conversation.dealId as string, 'cancelled'))}>취소</PrimaryButton>
        </View>
      </View>
    )
  }
  if (conversation.applicationId) {
    return (
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>지원 요청이 도착했어요.</Text>
        <View style={styles.actions}>
          <PrimaryButton disabled={busy} onPress={() => run(() => updateApplicationStatus(conversation.applicationId as string, 'accepted'))}>수락하기</PrimaryButton>
          <PrimaryButton variant="outline" disabled={busy} onPress={() => run(() => updateApplicationStatus(conversation.applicationId as string, 'rejected'))}>거절하기</PrimaryButton>
        </View>
      </View>
    )
  }
  return null
}

function MessageBubble({ message, mine }: { message: Message; mine: boolean }) {
  if (message.messageType === 'system') {
    return <Text style={styles.system}>{message.body}</Text>
  }
  return (
    <View style={[styles.bubble, mine ? styles.mine : styles.other]}>
      <Text style={mine ? styles.mineText : styles.otherText}>{message.body ?? (message.imageUrl ? '사진을 보냈습니다.' : '')}</Text>
    </View>
  )
}

function mergeMessages(current: Message[], incoming: Message[]) {
  const map = new Map(current.map((message) => [message.clientMessageId ?? message.id, message]))
  incoming.forEach((message) => map.set(message.clientMessageId ?? message.id, message))
  return Array.from(map.values()).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
}

function createClientMessageId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (value) => {
    const random = Math.floor(Math.random() * 16)
    const next = value === 'x' ? random : (random & 0x3) | 0x8
    return next.toString(16)
  })
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 58,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
    marginBottom: spacing.md,
  },
  messages: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    gap: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  panelTitle: {
    color: colors.text,
    fontWeight: '900',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  system: {
    alignSelf: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    color: colors.textMuted,
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bubble: {
    borderRadius: 16,
    maxWidth: '78%',
    padding: spacing.md,
  },
  mine: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
  },
  other: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
  },
  mineText: {
    color: colors.surface,
    lineHeight: 20,
  },
  otherText: {
    color: colors.text,
    lineHeight: 20,
  },
  composer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 999,
    color: colors.text,
    flex: 1,
    minHeight: 46,
    paddingHorizontal: spacing.lg,
  },
  send: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  attach: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 999,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  attachText: {
    color: colors.primary,
    fontSize: 22,
    fontWeight: '900',
  },
  disabled: {
    opacity: 0.45,
  },
  sendText: {
    color: colors.surface,
    fontWeight: '900',
  },
})
