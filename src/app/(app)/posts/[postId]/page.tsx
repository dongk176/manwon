import { PostDetailScreen } from '@/components/PostDetailScreen'

export default async function PostPage({
  params,
}: {
  params: Promise<{ postId: string }>
}) {
  const { postId } = await params
  return <PostDetailScreen postId={decodeURIComponent(postId)} />
}
