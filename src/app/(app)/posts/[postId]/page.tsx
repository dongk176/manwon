import { PostDetailScreen } from '@/components/PostDetailScreen'
import { requests, type RequestPost } from '@/data/mockData'

export default async function PostPage({
  params,
  searchParams,
}: {
  params: Promise<{ postId: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const { postId } = await params
  const query = await searchParams
  const fallbackPost = getFallbackPost(decodeURIComponent(postId), getParam(query, 'postType'))
  return <PostDetailScreen postId={decodeURIComponent(postId)} fallbackPost={fallbackPost} />
}

function getFallbackPost(postId: string, postTypeParam: string | undefined): RequestPost | undefined {
  const post = requests.find((request) => request.id === postId)
  if (!post) return undefined

  const postType = postTypeParam === 'offer' ? 'offer' : postTypeParam === 'request' ? 'request' : post.postType
  return postType ? { ...post, postType } : post
}

function getParam(params: Record<string, string | string[] | undefined> | undefined, key: string) {
  const value = params?.[key]
  return Array.isArray(value) ? value[0] : value
}
