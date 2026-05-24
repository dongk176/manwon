import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: '고객센터 | 뭐든해줌',
  description: '뭐든해줌 고객 지원, 신고, 차단, 계정 문의 안내',
}

const contactEmail = 'artiroom176@gmail.com'

const supportSections = [
  {
    heading: '문의 방법',
    body: [
      `이메일 문의: ${contactEmail}`,
      '앱 내 문의: 마이 > 고객센터 > 1:1 문의 남기기',
      '답변 시간: 평일 10:00-18:00, 접수 순서대로 확인합니다.',
    ],
  },
  {
    heading: '신고 및 차단',
    body: [
      '게시글 상세 화면과 채팅방 더보기 메뉴에서 부적절한 콘텐츠를 신고할 수 있습니다.',
      '차단하면 해당 사용자의 게시글과 채팅이 내 화면에서 숨겨지고, 운영팀 검토용 신고가 함께 접수됩니다.',
      '사기, 외부 결제 유도, 개인정보 요구, 욕설, 괴롭힘, 위험한 부탁은 즉시 신고해주세요.',
    ],
  },
  {
    heading: '계정 및 개인정보',
    body: [
      '계정 탈퇴는 앱 내 마이 > 계정 관리에서 요청할 수 있습니다.',
      '개인정보 열람, 정정, 삭제, 처리 정지 요청은 앱 내 문의 또는 이메일로 접수할 수 있습니다.',
      '거래, 신고, 정산, 분쟁 대응에 필요한 기록은 관련 법령과 서비스 정책에 따라 일정 기간 보관될 수 있습니다.',
    ],
  },
]

export default function SupportPage() {
  return (
    <main className="app-shell legal-shell">
      <article className="legal-screen">
        <header className="legal-topbar">
          <Link className="legal-back-link" href="/" aria-label="홈으로 돌아가기">
            ‹
          </Link>
          <h1>고객센터</h1>
        </header>

        <div className="legal-title-block">
          <span className="is-required">지원</span>
          <h2>뭐든해줌 고객센터</h2>
          <p>문의, 신고, 차단, 계정 및 개인정보 요청 안내</p>
          <div className="legal-meta-list">
            <small>운영자: 아티룸</small>
            <small>문의: {contactEmail}</small>
          </div>
        </div>

        <div className="legal-content">
          {supportSections.map((section) => (
            <section key={section.heading}>
              <h3>{section.heading}</h3>
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          ))}
          <section>
            <h3>정책 문서</h3>
            <p>
              <Link href="/terms/service?returnTo=/support">서비스 이용약관</Link>
            </p>
            <p>
              <Link href="/terms/privacy?returnTo=/support">개인정보 처리방침</Link>
            </p>
            <p>
              <Link href="/terms/location?returnTo=/support">위치기반서비스 이용약관</Link>
            </p>
          </section>
        </div>
      </article>
    </main>
  )
}
