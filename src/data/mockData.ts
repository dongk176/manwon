export type TradeStatus =
  | '문의중'
  | '수락대기'
  | '진행중'
  | '완료요청'
  | '거래완료'
  | '취소됨'

export type PostStatus = 'open' | 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'hidden'

export type RequestMode = 'nearby' | 'online' | 'both'

export type IllustrationType =
  | 'all'
  | 'basket'
  | 'home'
  | 'document'
  | 'design'
  | 'camera'
  | 'find'
  | 'pet'
  | 'etc'
  | 'store'
  | 'book'
  | 'food'
  | 'profile'
  | 'wallet'
  | 'review'
  | 'shield'
  | 'music'

export interface Category {
  id: string
  label: string
  icon: IllustrationType
  iconSrc: string
}

export interface UserProfile {
  id: string
  name: string
  intro: string
  rating: number
  reviewCount?: number
  completedCount: number
  verified: boolean
  phoneVerified?: boolean
  identityVerified?: boolean
  responseTime?: string | null
  avatarTone: 'coral' | 'green' | 'blue' | 'violet' | 'gray'
}

export interface RequestPost {
  id: string
  postType?: 'request' | 'offer'
  categoryId: string
  category: string
  categoryDetail?: string
  title: string
  location: string
  listLocation?: string
  detailLocation: string
  deadline: string
  price: number
  mode: RequestMode
  distance?: string
  image: IllustrationType
  imageUrl?: string
  postStatus?: PostStatus
  status: TradeStatus
  description: string
  requesterId: string
  requesterName?: string
  requesterRating?: number
  requesterCompletedCount?: number
  genderVisibility?: 'private' | 'male' | 'female'
}

export interface ChatMessage {
  id: string
  sender: 'me' | 'other' | 'system'
  text: string
  time: string
}

export interface ChatThread {
  id: string
  userId: string
  requestId: string
  status: TradeStatus
  lastMessage: string
  lastTime: string
  unreadCount: number
  messages: ChatMessage[]
}

export interface Review {
  id: string
  from: string
  rating: number
  content: string
  date: string
}

export const categories: Category[] = [
  { id: 'all', label: '전체', icon: 'all', iconSrc: '/home%20icon/all.png' },
  { id: 'wake', label: '깨워줘', icon: 'shield', iconSrc: '/home%20icon/1.png' },
  { id: 'proxy', label: '대신해줘', icon: 'store', iconSrc: '/home%20icon/2.png' },
  { id: 'work', label: '일해줘', icon: 'document', iconSrc: '/home%20icon/3.png' },
  { id: 'listen', label: '들어줘', icon: 'review', iconSrc: '/home%20icon/4.png' },
  { id: 'call', label: '불러줘', icon: 'music', iconSrc: '/home%20icon/5.png' },
  { id: 'choose', label: '골라줘', icon: 'find', iconSrc: '/home%20icon/6.png' },
  { id: 'play', label: '놀아줘', icon: 'review', iconSrc: '/home%20icon/7.png' },
  { id: 'advice', label: '조언해줘', icon: 'book', iconSrc: '/home%20icon/8.png' },
]

export const postCategories = categories.filter((category) => category.id !== 'all')

const defaultCategoryIconSrc = categories.find((category) => category.id === 'work')?.iconSrc ?? '/home%20icon/8.png'
const categoryIconSrcCache = new Map(categories.map((category) => [category.id, category.iconSrc]))

export function getCategoryIconSrc(categoryId: string | null | undefined) {
  if (!categoryId) return defaultCategoryIconSrc
  return categoryIconSrcCache.get(categoryId) ?? defaultCategoryIconSrc
}

export const customCategoryDetailOption = '직접 입력'
export const customCategoryDetailMaxLength = 7

export const categoryDetailOptions: Record<string, string[]> = {
  wake: [],
  listen: ['하소연', '연애 얘기', '고민 들어주기', '화풀이', '비밀 이야기', '감정 정리', customCategoryDetailOption],
  advice: ['연애', '인생', '커리어', '사업 아이디어', '카톡 답장', '면접/발표', customCategoryDetailOption],
  call: ['생일축하', '자장가', '짧은 커버곡', '응원송', customCategoryDetailOption],
  play: ['랜덤 대화', '같이 게임', '산책', '밥친구', '카페 수다', '전화 수다', customCategoryDetailOption],
  choose: ['옷', '식사 메뉴', '선물', '답장 선택', '데이트 코스', '기타', customCategoryDetailOption],
  proxy: ['티켓팅', '예약하기', '줄서기', '오픈런', '물건수령', '현장확인', '자리맡기', customCategoryDetailOption],
  work: ['디자인', '사진 보정', '영상 편집', '개발·IT', '글쓰기', '자료조사', '기타', customCategoryDetailOption],
}

export function getCategoryLabel(id: string) {
  return categories.find((category) => category.id === id)?.label ?? '일해줘'
}

export const users: UserProfile[] = [
  {
    id: 'me',
    name: '만부탁이',
    intro: '서로 돕고 신뢰하는 작은 거래를 좋아해요.',
    rating: 4.9,
    completedCount: 18,
    verified: true,
    avatarTone: 'coral',
  },
  {
    id: 'minji',
    name: '민지',
    intro: '역삼동 근처에서 빠르게 도와드려요.',
    rating: 4.9,
    completedCount: 128,
    verified: true,
    avatarTone: 'green',
  },
  {
    id: 'haesal',
    name: '김햇살',
    intro: '동네 산책과 간단한 외출 도움 가능해요.',
    rating: 4.8,
    completedCount: 42,
    verified: true,
    avatarTone: 'blue',
  },
  {
    id: 'jihun',
    name: '이지훈',
    intro: '문서 정리와 발표자료를 깔끔하게 다듬습니다.',
    rating: 4.7,
    completedCount: 35,
    verified: true,
    avatarTone: 'violet',
  },
  {
    id: 'sujin',
    name: '수진',
    intro: '책, 생활용품 픽업을 자주 도와요.',
    rating: 4.8,
    completedCount: 61,
    verified: true,
    avatarTone: 'gray',
  },
  {
    id: 'minsu',
    name: '민수',
    intro: '디자인 작업과 온라인 부탁을 맡고 있어요.',
    rating: 4.6,
    completedCount: 24,
    verified: false,
    avatarTone: 'blue',
  },
]

export const requests: RequestPost[] = [
  {
    id: 'r7',
    categoryId: 'call',
    category: '불러줘',
    categoryDetail: '생일축하',
    title: '친구 생일에 짧게 축하 노래 불러주실 분',
    location: '서울 강남구 역삼동',
    detailLocation: '역삼동',
    deadline: '오늘 19:00~20:00',
    price: 15000,
    mode: 'nearby',
    distance: '410m',
    image: 'music',
    status: '문의중',
    description: '케이크 전달할 때 1분 정도 밝게 생일 축하 노래를 불러주시면 됩니다.',
    requesterId: 'jihun',
  },
  {
    id: 'r8',
    categoryId: 'listen',
    category: '들어줘',
    categoryDetail: '연애 얘기',
    title: '연애 고민 30분만 들어주실 분',
    location: '서울 마포구 연남동',
    detailLocation: '연남동',
    deadline: '내일 15:00~16:00',
    price: 12000,
    mode: 'online',
    distance: '온라인',
    image: 'review',
    status: '수락대기',
    description: '답을 정해주기보다 상황을 차분히 들어주고 생각 정리만 도와주시면 좋아요.',
    requesterId: 'minsu',
  },
  {
    id: 'r9',
    categoryId: 'advice',
    category: '조언해줘',
    categoryDetail: '면접/발표',
    title: '면접 답변 흐름 한번 봐주세요',
    location: '서울 서초구 방배동',
    detailLocation: '방배동',
    deadline: '2일 후 20:00~21:00',
    price: 20000,
    mode: 'online',
    distance: '온라인',
    image: 'book',
    status: '문의중',
    description: '예상 질문 답변을 같이 보고 어색한 표현이나 순서를 조언해주세요.',
    requesterId: 'sujin',
  },
  {
    id: 'r10',
    categoryId: 'play',
    category: '놀아줘',
    categoryDetail: '카페 수다',
    title: '주말 오후 카페에서 가볍게 수다 나눠요',
    location: '경기 성남시 분당구 정자동',
    detailLocation: '정자동',
    deadline: '3일 후 14:00~15:00',
    price: 10000,
    mode: 'nearby',
    distance: '2.8km',
    image: 'review',
    status: '진행중',
    description: '새로 생긴 카페에서 1시간 정도 편하게 대화할 분을 찾고 있어요.',
    requesterId: 'haesal',
  },
  {
    id: 'r1',
    categoryId: 'wake',
    category: '깨워줘',
    title: '내일 아침 7시에 전화로 깨워주세요',
    location: '서울 강남구 역삼동',
    detailLocation: '역삼동',
    deadline: '내일 07:00',
    price: 10000,
    mode: 'online',
    distance: '온라인',
    image: 'shield',
    status: '수락대기',
    description: '중요한 일정이 있어서 전화로 확실히 깨워주실 분을 찾습니다.',
    requesterId: 'minji',
  },
  {
    id: 'r2',
    categoryId: 'work',
    category: '일해줘',
    categoryDetail: '자료조사',
    title: '발표 자료에 넣을 사례 5개 찾아주세요',
    location: '온라인',
    detailLocation: '온라인',
    deadline: '내일 14:00까지',
    price: 12000,
    mode: 'online',
    distance: '온라인',
    image: 'document',
    status: '완료요청',
    description: '키워드와 기준은 정해두었습니다. 출처 링크와 한 줄 요약까지 부탁드려요.',
    requesterId: 'jihun',
  },
  {
    id: 'r3',
    categoryId: 'play',
    category: '놀아줘',
    categoryDetail: '산책',
    title: '저녁에 한강 산책 같이 하실 분',
    location: '경기 성남시 분당구 정자동',
    detailLocation: '정자동',
    deadline: '오늘 19:00~19:30',
    price: 10000,
    mode: 'nearby',
    distance: '280m',
    image: 'review',
    status: '진행중',
    description: '가볍게 걷고 근처에서 음료 한 잔 할 수 있으면 좋겠습니다.',
    requesterId: 'haesal',
  },
  {
    id: 'r4',
    categoryId: 'work',
    category: '일해줘',
    categoryDetail: '디자인',
    title: '인스타 게시물 썸네일 하나 만들어주세요',
    location: '온라인',
    detailLocation: '온라인',
    deadline: '2일 후까지',
    price: 10000,
    mode: 'online',
    distance: '온라인',
    image: 'design',
    status: '문의중',
    description:
      '카페 오픈 소식용 정사각형 썸네일이 필요해요. 사진과 문구는 전달드릴게요.',
    requesterId: 'minsu',
  },
  {
    id: 'r5',
    categoryId: 'proxy',
    category: '대신해줘',
    categoryDetail: '물건수령',
    title: '도서관에서 예약 책 찾아주실 분',
    location: '서울 송파구 잠실동',
    detailLocation: '잠실동',
    deadline: '오늘 안에',
    price: 8000,
    mode: 'nearby',
    distance: '730m',
    image: 'book',
    status: '거래완료',
    description:
      '예약대에 있는 책을 찾아서 아파트 경비실에 맡겨주시면 됩니다. 대출증은 사진으로 보내드려요.',
    requesterId: 'sujin',
  },
  {
    id: 'r6',
    categoryId: 'proxy',
    category: '대신해줘',
    categoryDetail: '예약하기',
    title: '분식집 포장 음식 픽업 해주세요',
    location: '서울 강남구 대치동',
    detailLocation: '대치동',
    deadline: '오늘 20:30까지',
    price: 9000,
    mode: 'nearby',
    distance: '1.1km',
    image: 'food',
    status: '거래완료',
    description:
      '결제는 미리 해두었습니다. 포장 번호만 말씀하시고 찾아와주시면 됩니다.',
    requesterId: 'minji',
  },
]

export const chats: ChatThread[] = [
  {
    id: 'c1',
    userId: 'haesal',
    requestId: 'r3',
    status: '문의중',
    lastMessage: '네! 오늘 7시 전에 맞춰서 갈게요.',
    lastTime: '오전 9:32',
    unreadCount: 2,
    messages: [
      { id: 'm1', sender: 'system', text: '김햇살님이 지원했어요.', time: '14:02' },
      {
        id: 'm2',
        sender: 'other',
        text: '안녕하세요. 산책 도움 가능해요. 몇 가지 여쭤봐도 될까요?',
        time: '14:03',
      },
      { id: 'm3', sender: 'me', text: '네, 편하게 물어보세요.', time: '14:04' },
      {
        id: 'm4',
        sender: 'other',
        text: '산책 코스는 정해져 있을까요? 강아지가 낯가림은 없나요?',
        time: '14:05',
      },
      { id: 'm5', sender: 'me', text: '단지 안쪽만 돌면 되고 낯가림은 거의 없어요.', time: '14:06' },
      { id: 'm6', sender: 'other', text: '알겠습니다. 바로 도와드릴게요.', time: '14:07' },
    ],
  },
  {
    id: 'c2',
    userId: 'minji',
    requestId: 'r1',
    status: '진행중',
    lastMessage: '약 종류 어떤 걸로 구매해드릴까요?',
    lastTime: '어제 18:45',
    unreadCount: 1,
    messages: [
      { id: 'm1', sender: 'system', text: '거래가 시작되었어요.', time: '18:00' },
      { id: 'm2', sender: 'me', text: '안녕하세요. 지금 이동 중이에요.', time: '18:05' },
      { id: 'm3', sender: 'other', text: '네, 감사합니다.', time: '18:06' },
      { id: 'm4', sender: 'me', text: '도착하면 다시 알려드릴게요.', time: '18:10' },
      { id: 'm5', sender: 'other', text: '네, 천천히 오세요.', time: '18:11' },
      { id: 'm6', sender: 'system', text: '상대방이 거래를 수락했어요.', time: '18:26' },
    ],
  },
  {
    id: 'c3',
    userId: 'jihun',
    requestId: 'r2',
    status: '완료요청',
    lastMessage: '혹시 수정할 부분 더 있을까요?',
    lastTime: '어제 15:22',
    unreadCount: 0,
    messages: [
      { id: 'm1', sender: 'other', text: '초안 확인했습니다. 제목만 조금 더 짧게 가능할까요?', time: '15:11' },
      { id: 'm2', sender: 'me', text: '네. 바로 반영해서 다시 보내드릴게요.', time: '15:13' },
      { id: 'm3', sender: 'system', text: '이지훈님이 완료 요청을 보냈습니다.', time: '15:22' },
    ],
  },
  {
    id: 'c4',
    userId: 'sujin',
    requestId: 'r5',
    status: '거래완료',
    lastMessage: '네 알겠습니다. 감사합니다.',
    lastTime: '어제 11:08',
    unreadCount: 0,
    messages: [
      { id: 'm1', sender: 'other', text: '책 찾아서 맡겨두었습니다.', time: '17:52' },
      { id: 'm2', sender: 'me', text: '확인했어요. 감사합니다.', time: '17:54' },
      { id: 'm3', sender: 'other', text: '다음에도 필요하시면 말씀해주세요.', time: '17:55' },
      { id: 'm4', sender: 'system', text: '거래가 완료되었어요.', time: '18:20' },
    ],
  },
  {
    id: 'c5',
    userId: 'minsu',
    requestId: 'r4',
    status: '진행중',
    lastMessage: '시안 확인 부탁드려요.',
    lastTime: '5. 13',
    unreadCount: 0,
    messages: [
      { id: 'm1', sender: 'other', text: '톤은 차분한 느낌이 좋을까요?', time: '오후 4:10' },
      { id: 'm2', sender: 'me', text: '네. 흰 배경에 포인트 컬러만 살려주세요.', time: '오후 4:12' },
    ],
  },
]

export const reviews: Review[] = [
  {
    id: 'rv1',
    from: '민지',
    rating: 5,
    content: '요청 내용을 빠르게 이해하고 시간 맞춰 도와주셨어요.',
    date: '2026.05.14',
  },
  {
    id: 'rv2',
    from: '이지훈',
    rating: 5,
    content: '수정 요청까지 깔끔하게 반영해주셔서 만족했습니다.',
    date: '2026.05.10',
  },
  {
    id: 'rv3',
    from: '수진',
    rating: 4,
    content: '메시지 응답이 빠르고 전달도 정확했어요.',
    date: '2026.05.02',
  },
]

export const settlement = {
  available: 128000,
  totalRevenue: 450000,
  settled: 322000,
  pending: 3,
}

export function formatPrice(price: number) {
  return `${price.toLocaleString('ko-KR')}원`
}

export function getUser(id: string) {
  return users.find((user) => user.id === id) ?? users[0]
}

export function getRequest(id: string) {
  return requests.find((request) => request.id === id) ?? requests[0]
}
