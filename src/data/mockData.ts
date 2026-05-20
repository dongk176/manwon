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
  completedCount: number
  verified: boolean
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
  { id: 'errand', label: '동네 심부름', icon: 'basket', iconSrc: '/home%20icon/1.png' },
  { id: 'home', label: '집안 도움', icon: 'home', iconSrc: '/home%20icon/2.png' },
  { id: 'document', label: '문서 · 자료', icon: 'document', iconSrc: '/home%20icon/3.png' },
  { id: 'design', label: '디자인', icon: 'design', iconSrc: '/home%20icon/4.png' },
  { id: 'media', label: '사진·영상', icon: 'camera', iconSrc: '/home%20icon/5.png' },
  { id: 'dev_it', label: '개발 · IT', icon: 'document', iconSrc: '/home%20icon/6.png' },
  { id: 'lesson', label: '레슨', icon: 'book', iconSrc: '/home%20icon/7.png' },
  { id: 'find', label: '대신 찾아줘', icon: 'find', iconSrc: '/home%20icon/8.png' },
  { id: 'pet', label: '반려동물', icon: 'pet', iconSrc: '/home%20icon/9.png' },
  { id: 'etc', label: '기타', icon: 'etc', iconSrc: '/home%20icon/10.png' },
]

export const postCategories = categories.filter((category) => category.id !== 'all')

const defaultCategoryIconSrc = categories.find((category) => category.id === 'etc')?.iconSrc ?? '/home%20icon/10.png'
const categoryIconSrcCache = new Map(categories.map((category) => [category.id, category.iconSrc]))

export function getCategoryIconSrc(categoryId: string | null | undefined) {
  if (!categoryId) return defaultCategoryIconSrc
  return categoryIconSrcCache.get(categoryId) ?? defaultCategoryIconSrc
}

export const categoryDetailOptions: Record<string, string[]> = {
  errand: ['장보기', '물건 전달', '편의점 구매', '줄서기', '택배 보내기', '물건 찾아오기', '근처 사진 찍기', '기타'],
  home: ['벌레 잡기', '청소', '정리정돈', '가구 옮기기', '분리수거', '전구 교체', '설치 보조', '짐 정리', '기타'],
  document: ['타이핑', '엑셀 정리', 'PPT 정리', '자료 조사', '맞춤법 검토', 'PDF 정리', '문서 요약', '기타'],
  design: ['썸네일', '카드뉴스', '배너', '포스터', '간단 로고', '메뉴판', '상세페이지 일부', '기타'],
  media: ['사진 보정', '누끼 따기', '배경 제거', '숏폼 자막', '릴스 편집', '컷 편집', '썸네일 캡처', '기타'],
  dev_it: ['웹사이트 제작', '랜딩페이지', '오류 수정', '배포 도움', '도메인 연결', '워드프레스', '간단 자동화', '기타'],
  lesson: ['음악', '골프', '배드민턴', '영어', '수학', '코딩', '미술', '서예', '댄스', '보컬', '기타'],
  find: ['맛집 찾기', '선물 추천', '여행 코스', '숙소 비교', '제품 비교', '데이트 코스', '병원/업체 찾기', '기타'],
  pet: ['산책', '밥 주기', '방문 돌봄', '병원 동행', '사진 보내기', '목욕 보조', '배변 정리', '기타'],
  etc: ['간단 부탁', '급한 부탁', '반복 작업', '상담/조언', '대신 연락', '기타'],
}

export function getCategoryLabel(id: string) {
  return categories.find((category) => category.id === id)?.label ?? '기타'
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
    categoryId: 'lesson',
    category: '레슨 · 음악',
    title: '피아노 기초 1:1 레슨 (성인 초보 환영)',
    location: '서울 강남구 역삼동',
    detailLocation: '역삼동',
    deadline: '오늘 19:00~20:00',
    price: 15000,
    mode: 'nearby',
    distance: '410m',
    image: 'music',
    status: '문의중',
    description: '음악 레슨으로 피아노 기초 자세와 쉬운 코드 진행을 알려드려요.',
    requesterId: 'jihun',
  },
  {
    id: 'r8',
    categoryId: 'lesson',
    category: '레슨 · 음악',
    title: '기타 코드 잡는 법부터 차근차근!',
    location: '서울 마포구 연남동',
    detailLocation: '연남동',
    deadline: '내일 15:00~16:00',
    price: 12000,
    mode: 'nearby',
    distance: '1.4km',
    image: 'music',
    status: '수락대기',
    description: '음악 레슨으로 기타 기본 코드와 손가락 위치를 쉽게 알려드립니다.',
    requesterId: 'minsu',
  },
  {
    id: 'r9',
    categoryId: 'lesson',
    category: '레슨 · 음악',
    title: '보컬 발성 및 고음 뚫기 코칭',
    location: '서울 서초구 방배동',
    detailLocation: '방배동',
    deadline: '2일 후 20:00~21:00',
    price: 20000,
    mode: 'nearby',
    distance: '2.2km',
    image: 'music',
    status: '문의중',
    description: '음악 레슨으로 보컬 호흡, 발성, 고음 연습을 도와드려요.',
    requesterId: 'sujin',
  },
  {
    id: 'r10',
    categoryId: 'lesson',
    category: '레슨 · 음악',
    title: '우쿨렐레 초급반 (왕초보 환영)',
    location: '경기 성남시 분당구 정자동',
    detailLocation: '정자동',
    deadline: '3일 후 14:00~15:00',
    price: 10000,
    mode: 'nearby',
    distance: '2.8km',
    image: 'music',
    status: '진행중',
    description: '음악 레슨으로 우쿨렐레 기본 코드와 간단한 연주곡을 같이 연습해요.',
    requesterId: 'haesal',
  },
  {
    id: 'r1',
    categoryId: 'errand',
    category: '동네 심부름',
    title: '약국에서 감기약 받아와주실 분',
    location: '서울 강남구 역삼동',
    detailLocation: '역삼동',
    deadline: '오늘 18:00까지',
    price: 10000,
    mode: 'nearby',
    distance: '320m',
    image: 'store',
    status: '수락대기',
    description:
      '역삼역 근처 약국에서 감기약 한 통만 구매해서 전달 부탁드려요. 구매 후 사진으로 확인해주시면 됩니다.',
    requesterId: 'minji',
  },
  {
    id: 'r2',
    categoryId: 'document',
    category: '문서 · 자료',
    title: 'PPT 3장 깔끔하게 정리해주세요',
    location: '온라인',
    detailLocation: '온라인',
    deadline: '내일 14:00까지',
    price: 12000,
    mode: 'online',
    distance: '온라인',
    image: 'document',
    status: '완료요청',
    description:
      '초안은 있어서 문장 길이와 제목만 정리하면 됩니다. 과한 디자인보다 읽기 편한 느낌이면 좋아요.',
    requesterId: 'jihun',
  },
  {
    id: 'r3',
    categoryId: 'pet',
    category: '반려동물',
    title: '저녁에 강아지 산책 20분 부탁드려요',
    location: '경기 성남시 분당구 정자동',
    detailLocation: '정자동',
    deadline: '오늘 19:00~19:30',
    price: 10000,
    mode: 'nearby',
    distance: '280m',
    image: 'pet',
    status: '진행중',
    description:
      '아파트 단지 안에서 20분 정도 산책만 부탁드려요. 리드줄과 배변봉투는 준비해둘게요.',
    requesterId: 'haesal',
  },
  {
    id: 'r4',
    categoryId: 'design',
    category: '디자인',
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
    categoryId: 'find',
    category: '대신 찾아줘',
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
    categoryId: 'errand',
    category: '동네 심부름',
    title: '분식집 포장 음식 픽업 부탁해요',
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
