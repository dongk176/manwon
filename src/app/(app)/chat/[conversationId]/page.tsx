import { ChatScreens } from '@/components/ChatScreens'

export default async function ChatDetailPage({
  params,
}: {
  params: Promise<{ conversationId: string }>
}) {
  const { conversationId } = await params
  return <ChatScreens conversationId={decodeURIComponent(conversationId)} />
}
