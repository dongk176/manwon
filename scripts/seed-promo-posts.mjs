import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('Missing DATABASE_URL')
  process.exit(1)
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const photoDir = path.join(projectRoot, 'public', 'photho')
const seedLoginPrefix = 'promo-content-seed:'
const creatorLoginPrefix = `${seedLoginPrefix}creator:`
const applicantLoginPrefix = `${seedLoginPrefix}applicant:`
const favoriteLoginPrefix = `${seedLoginPrefix}favorite:`

const sql = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  idle_timeout: 5,
  connect_timeout: 10,
})

const posts = [
  {
    no: 1,
    category: '일해줘',
    categoryDetail: '기타',
    title: '바퀴벌레 잡아주세요 ㅠㅠㅠ',
    price: 18000,
    description: '방금 화장실 쪽에서 바퀴벌레 봤는데 진짜 못 들어가겠어요... 근처에 계신 분 중에 바로 와서 잡아주실 분 찾습니다. 잡고 나서 어디로 들어왔을지도 같이 봐주시면 감사해요.',
    location: ['서울', '마포구', '망원동'],
    mode: 'nearby',
    deadlineText: '오늘 바로',
    activeChatCount: 14,
    favoriteCount: 37,
  },
  {
    no: 2,
    category: '대신해줘',
    categoryDetail: '오픈런',
    title: '팝업 오픈런 줄 대신 서주실 분 구해요',
    price: 42000,
    description: '내일 아침에 팝업스토어 오픈런 해야 하는데 출근 때문에 못 가요. 줄 위치 공유해주시고, 제 차례 가까워지면 연락 주실 분 찾습니다. 너무 앞자리 아니어도 괜찮아요.',
    location: ['서울', '성동구', '성수동'],
    mode: 'nearby',
    deadlineText: '내일 오전 7시',
    activeChatCount: 21,
    favoriteCount: 64,
  },
  {
    no: 3,
    category: '조언해줘',
    categoryDetail: '연애',
    title: '이거 썸 맞는지 봐주실 분...',
    price: 9900,
    description: '카톡 보면 관심 있는 것 같기도 하고 아닌 것 같기도 해서 미치겠어요. 대화 캡처랑 상황 설명드리면 객관적으로 봐주시고 다음 답장도 같이 골라주세요.',
    location: null,
    mode: 'online',
    deadlineText: '오늘 밤',
    activeChatCount: 18,
    favoriteCount: 52,
  },
  {
    no: 4,
    category: '불러줘',
    categoryDetail: '생일축하',
    title: '친구 생일 축하 노래 대신 불러주세요ㅋㅋ',
    price: 13000,
    description: '친구 생일인데 그냥 카톡만 보내기엔 심심해서요. 짧게 생일 축하 멘트랑 노래 한 소절 녹음해주실 분 찾습니다. 웃긴 버전이면 더 좋아요.',
    location: null,
    mode: 'online',
    deadlineText: '오늘 21:00 전',
    activeChatCount: 9,
    favoriteCount: 28,
  },
  {
    no: 5,
    category: '골라줘',
    categoryDetail: '옷',
    title: '소개팅 옷 좀 골라주세요 제발',
    price: 12000,
    description: '옷장 앞에서 40분째 고민 중입니다. 옷 사진 몇 장 보내드릴 테니 너무 꾸민 느낌 말고 깔끔하고 호감 가는 조합으로 골라주세요. 이유도 짧게 말해주시면 좋아요.',
    location: null,
    mode: 'online',
    deadlineText: '오늘 18:30까지',
    activeChatCount: 12,
    favoriteCount: 41,
  },
  {
    no: 6,
    category: '조언해줘',
    categoryDetail: '기타',
    title: '헬스장 기구 사용법 한 번만 알려주실 분',
    price: 27000,
    description: '헬스장 등록했는데 기구 앞에서 뭘 해야 할지 모르겠어요. 40분 정도 같이 돌면서 초보자용으로 자세랑 루틴 알려주실 분 구합니다. 빡센 PT 말고 진짜 기본만요.',
    location: ['서울', '강남구', '역삼동'],
    mode: 'nearby',
    deadlineText: '오늘 저녁',
    activeChatCount: 7,
    favoriteCount: 23,
  },
  {
    no: 7,
    category: '대신해줘',
    categoryDetail: '예약하기',
    title: '병원 예약 전화 대신 해주실 분 있나요?',
    price: 7900,
    description: '전화 예약이 너무 부담돼서 계속 미루고 있어요. 가능한 날짜랑 증상 간단히 알려드릴 테니 병원에 전화해서 예약 가능 여부 확인해주실 분 찾습니다.',
    location: null,
    mode: 'online',
    deadlineText: '오늘 중',
    activeChatCount: 5,
    favoriteCount: 19,
  },
  {
    no: 8,
    category: '들어줘',
    categoryDetail: '하소연',
    title: '회사에서 빡친 일 좀 들어주실 분',
    price: 16000,
    description: '오늘 회사에서 진짜 어이없는 일이 있었는데 주변 사람한테 말하기 애매해요. 30~40분 정도 그냥 들어주시고 같이 욕은 아니더라도 공감 좀 해주실 분 찾습니다.',
    location: null,
    mode: 'online',
    deadlineText: '오늘 퇴근 후',
    activeChatCount: 16,
    favoriteCount: 48,
  },
  {
    no: 9,
    category: '대신해줘',
    categoryDetail: '줄서기',
    title: '맛집 웨이팅 대신 해주실 분 급구',
    price: 33000,
    description: '예약 안 되는 맛집이라 웨이팅이 길대요. 제가 도착하기 전까지 대신 줄 서주실 분 찾습니다. 순서 가까워지면 연락 주시고, 현장 상황 사진 한 장만 보내주세요.',
    location: ['서울', '종로구', '익선동'],
    mode: 'nearby',
    deadlineText: '오늘 17:30',
    activeChatCount: 19,
    favoriteCount: 73,
  },
  {
    no: 10,
    category: '일해줘',
    categoryDetail: '기타',
    title: '방 청소 시작만 같이 해주실 분...',
    price: 38000,
    description: '방이 너무 어질러져서 어디서부터 손대야 할지 모르겠어요. 1시간 정도 같이 버릴 것 분류하고 정리 순서만 잡아주셔도 됩니다. 혼자 하면 또 미룰 것 같아요.',
    location: ['서울', '관악구', '봉천동'],
    mode: 'nearby',
    deadlineText: '내일 오후',
    activeChatCount: 8,
    favoriteCount: 34,
  },
  {
    no: 11,
    category: '불러줘',
    categoryDetail: '짧은 커버곡',
    title: '신청곡 한 소절 감성 있게 불러주실 분',
    price: 17000,
    description: '친구한테 보내고 싶은 노래가 있는데 제가 부르면 망할 것 같아서요. 신청곡 한 소절 정도를 감성 있게 녹음해주실 분 찾습니다. 목소리 따뜻한 분이면 좋겠어요.',
    location: null,
    mode: 'online',
    deadlineText: '이번 주 안',
    activeChatCount: 11,
    favoriteCount: 45,
  },
  {
    no: 12,
    category: '조언해줘',
    categoryDetail: '면접/발표',
    title: '면접 답변 한번만 봐주세요',
    price: 24000,
    description: '면접 예상 질문 답변을 적어봤는데 말이 너무 딱딱한지 모르겠어요. 30분 정도 들어주시고 어색한 문장, 너무 긴 답변, 부족한 포인트를 짚어주실 분 찾습니다.',
    location: null,
    mode: 'online',
    deadlineText: '내일 22:00까지',
    activeChatCount: 10,
    favoriteCount: 39,
  },
  {
    no: 13,
    category: '골라줘',
    categoryDetail: '식사 메뉴',
    title: '오늘 저녁 뭐 먹을지 정해주세요',
    price: 3900,
    description: '배달앱만 30분째 보고 있습니다. 예산이랑 안 먹는 음식 알려드릴 테니 메뉴 하나만 딱 정해주세요. 이유까지 말해주시면 바로 시킬게요.',
    location: null,
    mode: 'online',
    deadlineText: '지금 바로',
    activeChatCount: 24,
    favoriteCount: 88,
  },
  {
    no: 14,
    category: '놀아줘',
    categoryDetail: '카페 수다',
    title: '전시회 혼자 가기 애매해서 같이 가주실 분',
    price: 29000,
    description: '보고 싶은 전시가 있는데 혼자 가면 괜히 뻘쭘할 것 같아서요. 같이 보고 가볍게 얘기 나눠주실 분 찾습니다. 사진 한두 장 찍어주시면 더 감사해요.',
    location: ['서울', '용산구', '한남동'],
    mode: 'nearby',
    deadlineText: '주말 오후',
    activeChatCount: 6,
    favoriteCount: 31,
  },
  {
    no: 15,
    category: '조언해줘',
    categoryDetail: '기타',
    title: '자취방 보러 가는데 같이 체크해주실 분',
    price: 46000,
    description: '처음 자취방 보러 가는 거라 뭘 봐야 할지 모르겠어요. 수압, 곰팡이, 채광, 소음, 관리비 같은 거 같이 체크해주실 분 찾습니다.',
    location: ['서울', '동작구', '상도동'],
    mode: 'nearby',
    deadlineText: '내일 15:00',
    activeChatCount: 13,
    favoriteCount: 56,
  },
  {
    no: 16,
    category: '일해줘',
    categoryDetail: '기타',
    title: '책상 조립 도와주실 분 구합니다',
    price: 44000,
    description: '책상 조립해야 하는데 설명서 봐도 감이 안 와요. 같이 조립 도와주실 분 찾습니다. 공구 있으시면 좋고, 없으면 제가 준비해볼게요.',
    location: ['서울', '강동구', '천호동'],
    mode: 'nearby',
    deadlineText: '이번 주 평일',
    activeChatCount: 9,
    favoriteCount: 44,
  },
  {
    no: 17,
    category: '들어줘',
    categoryDetail: '고민 들어주기',
    title: '새벽에 잠 안 오면 얘기 들어주실 분',
    price: 22000,
    description: '요즘 새벽마다 생각이 많아서 잠이 잘 안 와요. 무거운 상담까지는 아니고, 30분 정도 편하게 얘기 나눠주실 분 찾습니다.',
    location: null,
    mode: 'online',
    deadlineText: '오늘 새벽',
    activeChatCount: 15,
    favoriteCount: 67,
  },
  {
    no: 18,
    category: '골라줘',
    categoryDetail: '기타',
    title: '프사 뭐가 제일 나은지 골라주세요',
    price: 6900,
    description: '프로필 사진 후보가 몇 장 있는데 객관적으로 뭐가 제일 나은지 모르겠어요. 자연스럽고 호감 가는 사진으로 골라주시고 이유도 짧게 알려주세요.',
    location: null,
    mode: 'online',
    deadlineText: '오늘 중',
    activeChatCount: 17,
    favoriteCount: 71,
  },
  {
    no: 19,
    category: '조언해줘',
    categoryDetail: '연애',
    title: '연애상담 진지하게 해주실 분 찾습니다',
    price: 31000,
    description: '썸인지 아닌지 헷갈리는 상황이 오래돼서 진지하게 얘기해보고 싶어요. 카톡 흐름이랑 실제 만났을 때 분위기까지 설명드릴 테니 객관적으로 봐주세요.',
    location: null,
    mode: 'online',
    deadlineText: '내일 밤',
    activeChatCount: 22,
    favoriteCount: 94,
  },
  {
    no: 20,
    category: '일해줘',
    categoryDetail: '기타',
    title: '강아지 산책 한 번만 부탁드려요',
    price: 26000,
    description: '오늘 일정이 꼬여서 강아지 산책을 못 시킬 것 같아요. 40분 정도 동네 산책해주시고 중간에 사진 한 장 보내주시면 감사하겠습니다.',
    location: ['서울', '송파구', '잠실동'],
    mode: 'nearby',
    deadlineText: '오늘 19:00',
    activeChatCount: 12,
    favoriteCount: 59,
  },
  {
    no: 21,
    category: '대신해줘',
    categoryDetail: '기타',
    title: '환불 문의 전화 대신 해주실 분',
    price: 8500,
    description: '환불 문의를 해야 하는데 고객센터 전화가 너무 귀찮고 부담돼요. 주문 정보랑 상황 정리해서 보내드릴 테니 대신 전화하고 결과만 알려주세요.',
    location: null,
    mode: 'online',
    deadlineText: '오늘 업무시간',
    activeChatCount: 4,
    favoriteCount: 18,
  },
  {
    no: 22,
    category: '불러줘',
    categoryDetail: '생일축하',
    title: '사투리로 축하 멘트 녹음해주실 분ㅋㅋ',
    price: 11000,
    description: '친구한테 장난으로 보낼 축하 멘트가 필요해요. 부산/대구/전라도/충청도 사투리 자연스럽게 가능하신 분이면 좋겠습니다. 15초 정도면 돼요.',
    location: null,
    mode: 'online',
    deadlineText: '내일 전',
    activeChatCount: 8,
    favoriteCount: 36,
  },
  {
    no: 23,
    category: '놀아줘',
    categoryDetail: '같이 게임',
    title: '보드게임 카페 같이 가주실 분',
    price: 34000,
    description: '보드게임 카페 가보고 싶은데 혼자 가긴 애매해서요. 2시간 정도 같이 놀아주시고, 룰 잘 아시면 설명도 부탁드려요.',
    location: ['서울', '마포구', '홍대입구'],
    mode: 'nearby',
    deadlineText: '이번 주말',
    activeChatCount: 10,
    favoriteCount: 42,
  },
  {
    no: 24,
    category: '조언해줘',
    categoryDetail: '커리어',
    title: '자기소개서 이상한지 봐주실 분',
    price: 28000,
    description: '자소서 다 쓰긴 했는데 읽어보면 뭔가 어색해요. 문장 흐름이랑 설득력 약한 부분 위주로 가볍게 피드백해주실 분 찾습니다.',
    location: null,
    mode: 'online',
    deadlineText: '2일 안에',
    activeChatCount: 9,
    favoriteCount: 33,
  },
  {
    no: 25,
    category: '깨워줘',
    categoryDetail: null,
    title: '시험날 아침 진짜 깨워주세요',
    price: 14000,
    description: '중요한 시험인데 제가 알람을 진짜 잘 끕니다. 아침에 전화해주시고 제가 완전히 일어났는지 한 번 더 확인해주실 분 찾습니다.',
    location: null,
    mode: 'online',
    deadlineText: '내일 오전 6:30',
    activeChatCount: 13,
    favoriteCount: 54,
  },
  {
    no: 26,
    category: '골라줘',
    categoryDetail: '데이트 코스',
    title: '데이트 코스 짜주실 분 구해요',
    price: 23000,
    description: '주말 데이트 코스를 못 정하겠어요. 지역이랑 예산, 좋아하는 분위기 알려드릴 테니 밥집, 카페, 산책 코스까지 자연스럽게 짜주세요.',
    location: null,
    mode: 'online',
    deadlineText: '금요일까지',
    activeChatCount: 14,
    favoriteCount: 62,
  },
  {
    no: 27,
    category: '놀아줘',
    categoryDetail: '전화 수다',
    title: '혼코노 같이 가주실 분 있나요',
    price: 18500,
    description: '코인노래방 가고 싶은데 혼자 가면 금방 나올 것 같아서요. 노래 잘 못해도 괜찮고 그냥 편하게 같이 놀아주실 분 찾습니다.',
    location: ['서울', '관악구', '서울대입구'],
    mode: 'nearby',
    deadlineText: '오늘 밤',
    activeChatCount: 7,
    favoriteCount: 29,
  },
  {
    no: 28,
    category: '일해줘',
    categoryDetail: '기타',
    title: '고양이 밥이랑 물 챙겨주실 분',
    price: 37000,
    description: '하루 집을 비우게 돼서 고양이 밥이랑 물만 챙겨주실 분 찾습니다. 가능하면 화장실 상태도 간단히 봐주시고 사진 보내주시면 좋아요.',
    location: ['서울', '서대문구', '연희동'],
    mode: 'nearby',
    deadlineText: '내일 낮',
    activeChatCount: 6,
    favoriteCount: 38,
  },
  {
    no: 29,
    category: '대신해줘',
    categoryDetail: '현장확인',
    title: '중고거래 같이 가주실 분 구해요',
    price: 32000,
    description: '직거래를 해야 하는데 혼자 나가기가 조금 불안해요. 거래 장소까지 같이 가주시고 물건 확인할 때 옆에 있어주실 분 찾습니다.',
    location: ['서울', '영등포구', '당산동'],
    mode: 'nearby',
    deadlineText: '오늘 20:00',
    activeChatCount: 11,
    favoriteCount: 47,
  },
  {
    no: 30,
    category: '불러줘',
    categoryDetail: '자장가',
    title: 'ASMR 느낌으로 책 한 문단 읽어주세요',
    price: 19000,
    description: '잠들기 전에 들을 짧은 음성이 필요해요. 제가 보내드리는 짧은 글을 조용하고 차분한 톤으로 읽어서 녹음해주실 분 찾습니다.',
    location: null,
    mode: 'online',
    deadlineText: '오늘 자기 전',
    activeChatCount: 5,
    favoriteCount: 26,
  },
]

const creatorNames = [
  '망원수현', '성수재윤', '연남다은', '역삼현우', '합정지아', '방배서준', '봉천하린', '잠실태오', '익선유나', '상도민재',
  '한남예린', '천호도윤', '서초소민', '홍대준호', '당산나경', '연희시우', '마포은채', '강남건우', '용산채원', '송파지민',
  '종로아린', '동작도현', '대치서연', '신촌윤재', '여의하윤', '문래민서', '건대서아', '왕십지후', '공덕예준', '압구나은',
]

const bios = [
  '근처에서 필요한 도움을 편하게 부탁드려요.',
  '시간 맞춰 꼼꼼하게 소통하는 편이에요.',
  '작은 부탁도 정확하게 주고받고 싶어요.',
  '급한 일이라 빠른 연락 부탁드려요.',
  '서로 부담 없이 매너 있게 거래해요.',
]

function assertPhotosExist() {
  const missing = posts
    .map((post) => `${post.no}.png`)
    .filter((fileName) => !fs.existsSync(path.join(photoDir, fileName)))

  if (missing.length > 0) {
    throw new Error(`Missing promo photos in public/photho: ${missing.join(', ')}`)
  }
}

function createdAtFor(index) {
  const date = new Date()
  date.setMinutes(date.getMinutes() - index * 23)
  return date
}

function locationFields(post) {
  if (post.mode === 'online' || !post.location) {
    return {
      addressText: '온라인',
      region1Depth: null,
      region2Depth: null,
      region3Depth: null,
      latitude: null,
      longitude: null,
      locationSource: null,
      distanceVisible: false,
    }
  }

  const [region1Depth, region2Depth, region3Depth] = post.location
  const offset = post.no * 0.0021
  return {
    addressText: `${region1Depth} ${region2Depth} ${region3Depth}`,
    region1Depth,
    region2Depth,
    region3Depth,
    latitude: 37.548 + offset,
    longitude: 126.91 + offset,
    locationSource: 'manual',
    distanceVisible: true,
  }
}

async function createSeedUser(db, loginId, nickname, index, options = {}) {
  const [user] = await db`
    insert into manwon_happiness.users (
      nickname,
      display_name,
      login_id,
      gender,
      phone_verified,
      phone_verified_at,
      rating_avg,
      review_count,
      completed_count,
      is_blocked
    )
    values (
      ${nickname},
      ${nickname},
      ${loginId},
      ${options.gender ?? 'unknown'},
      true,
      now(),
      ${options.rating ?? (4.6 + (index % 4) * 0.1)},
      ${options.reviewCount ?? (8 + (index * 3) % 57)},
      ${options.completedCount ?? (12 + (index * 5) % 130)},
      false
    )
    on conflict (login_id) where login_id is not null and withdrawn_at is null do update
      set nickname = excluded.nickname,
          display_name = excluded.display_name,
          gender = excluded.gender,
          phone_verified = true,
          phone_verified_at = now(),
          rating_avg = excluded.rating_avg,
          review_count = excluded.review_count,
          completed_count = excluded.completed_count,
          is_blocked = false,
          withdrawn_at = null,
          updated_at = now()
    returning id
  `
  return user.id
}

async function createActivityProfile(db, userId, nickname, index, post) {
  const location = locationFields(post)
  const [profile] = await db`
    insert into manwon_happiness.activity_profiles (
      user_id,
      default_avatar_key,
      nickname,
      bio,
      activity_mode,
      address_text,
      region_1depth,
      region_2depth,
      region_3depth,
      latitude,
      longitude,
      available_time_text
    )
    values (
      ${userId},
      ${index % 2 === 0 ? 'default-woman' : 'default-man'},
      ${nickname},
      ${bios[index % bios.length]},
      ${post.mode === 'online' ? 'online' : 'both'},
      ${location.addressText},
      ${location.region1Depth},
      ${location.region2Depth},
      ${location.region3Depth},
      ${location.latitude},
      ${location.longitude},
      '채팅 확인 빨라요'
    )
    returning id
  `
  return profile.id
}

async function clearPreviousSeed(db) {
  await db`
    delete from manwon_happiness.task_posts
    where creator_id in (
      select id from manwon_happiness.users where login_id like ${`${seedLoginPrefix}%`}
    )
  `
  await db`
    delete from manwon_happiness.users
    where login_id like ${`${seedLoginPrefix}%`}
  `
}

async function createPost(db, post, creatorId, creatorProfileId, createdAt) {
  const location = locationFields(post)
  const [row] = await db`
    insert into manwon_happiness.task_posts (
      creator_id,
      creator_profile_id,
      post_type,
      title,
      category,
      category_detail,
      description,
      mode,
      price,
      deadline_at,
      deadline_text,
      available_time_text,
      gender_visibility,
      receipt_required,
      photo_proof_required,
      status,
      address_text,
      region_1depth,
      region_2depth,
      region_3depth,
      location_source,
      latitude,
      longitude,
      distance_visible,
      capacity_type,
      capacity_limit,
      created_at,
      updated_at
    )
    values (
      ${creatorId},
      ${creatorProfileId},
      'request',
      ${post.title},
      ${post.category},
      ${post.categoryDetail},
      ${post.description},
      ${post.mode},
      ${post.price},
      null,
      ${post.deadlineText},
      ${post.mode === 'online' ? '온라인으로 진행' : '장소 협의'},
      'private',
      false,
      ${post.mode !== 'online'},
      'open',
      ${location.addressText},
      ${location.region1Depth},
      ${location.region2Depth},
      ${location.region3Depth},
      ${location.locationSource},
      ${location.latitude},
      ${location.longitude},
      ${location.distanceVisible},
      'unlimited',
      null,
      ${createdAt},
      ${createdAt}
    )
    returning id
  `

  await db`
    insert into manwon_happiness.task_post_images (post_id, uploader_id, image_url, storage_key, sort_order, created_at)
    values (${row.id}, ${creatorId}, ${`/photho/${post.no}.png`}, '', 0, ${createdAt})
  `

  return row.id
}

async function seedEngagement(db, postId, post, applicantIds, favoriteIds, createdAt) {
  for (let index = 0; index < post.activeChatCount; index += 1) {
    await db`
      insert into manwon_happiness.applications (post_id, applicant_id, message, status, created_at, updated_at)
      values (
        ${postId},
        ${applicantIds[index]},
        ${applicationMessage(post, index)},
        'applied',
        ${createdAt},
        ${createdAt}
      )
      on conflict do nothing
    `
  }

  for (let index = 0; index < post.favoriteCount; index += 1) {
    await db`
      insert into manwon_happiness.favorites (user_id, post_id, created_at)
      values (${favoriteIds[index]}, ${postId}, ${createdAt})
      on conflict do nothing
    `
  }
}

function applicationMessage(post, index) {
  const messages = [
    '가능해요. 시간 맞춰서 도와드릴게요.',
    '근처라 바로 연락 가능합니다.',
    '내용 확인했습니다. 제가 맡아볼게요.',
    '비슷한 부탁 해본 적 있어요.',
  ]
  return `${messages[index % messages.length]} (${post.no})`
}

try {
  assertPhotosExist()

  await sql.begin(async (tx) => {
    await clearPreviousSeed(tx)

    const maxChatCount = Math.max(...posts.map((post) => post.activeChatCount))
    const maxFavoriteCount = Math.max(...posts.map((post) => post.favoriteCount))
    const applicantIds = []
    const favoriteIds = []

    for (let index = 0; index < maxChatCount; index += 1) {
      applicantIds.push(await createSeedUser(tx, `${applicantLoginPrefix}${index + 1}`, `도움이${index + 1}`, index))
    }

    for (let index = 0; index < maxFavoriteCount; index += 1) {
      favoriteIds.push(await createSeedUser(tx, `${favoriteLoginPrefix}${index + 1}`, `관심유저${index + 1}`, index))
    }

    const createdPostIds = []
    for (const [index, post] of posts.entries()) {
      const creatorName = creatorNames[index]
      const creatorId = await createSeedUser(tx, `${creatorLoginPrefix}${post.no}`, creatorName, index)
      const creatorProfileId = await createActivityProfile(tx, creatorId, creatorName, index, post)
      const createdAt = createdAtFor(index)
      const postId = await createPost(tx, post, creatorId, creatorProfileId, createdAt)
      await seedEngagement(tx, postId, post, applicantIds, favoriteIds, createdAt)
      createdPostIds.push(postId)
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          seededPosts: createdPostIds.length,
          imagePath: '/photho/{1..30}.png',
          chatCountRange: [Math.min(...posts.map((post) => post.activeChatCount)), maxChatCount],
          favoriteCountRange: [Math.min(...posts.map((post) => post.favoriteCount)), maxFavoriteCount],
        },
        null,
        2,
      ),
    )
  })
} catch (error) {
  console.error(JSON.stringify({ ok: false, message: error instanceof Error ? error.message : String(error) }, null, 2))
  process.exitCode = 1
} finally {
  await sql.end({ timeout: 5 })
}
