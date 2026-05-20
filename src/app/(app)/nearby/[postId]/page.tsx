import { NearbyDetailScreen } from '@/components/NearbyScreens'

export default async function NearbyDetailPage({
  params,
}: {
  params: Promise<{ postId: string }>
}) {
  const { postId } = await params
  return <NearbyDetailScreen postId={decodeURIComponent(postId)} />
}
