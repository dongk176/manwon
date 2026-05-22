import Link from 'next/link'
import { notFound } from 'next/navigation'
import { documentMeta, legalPages } from '@/lib/legalDocuments'

const legalReturnFallback = '/support'
const allowedLegalReturnPathnames = new Set(['/support', '/my', '/my/support'])

function resolveLegalReturnTo(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value
  if (!rawValue) return legalReturnFallback

  let decodedValue = rawValue
  try {
    decodedValue = decodeURIComponent(rawValue)
  } catch {
    decodedValue = rawValue
  }

  if (!decodedValue.startsWith('/') || decodedValue.startsWith('//')) return legalReturnFallback

  try {
    const url = new URL(decodedValue, 'https://manwon.local')
    if (!allowedLegalReturnPathnames.has(url.pathname)) return legalReturnFallback
    return `${url.pathname}${url.search}`
  } catch {
    return legalReturnFallback
  }
}

export default async function TermsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const { slug } = await params
  const query = await searchParams
  const page = legalPages[slug]
  const returnTo = resolveLegalReturnTo(query?.returnTo)

  if (!page) notFound()

  return (
    <main className="app-shell legal-shell">
      <article className="legal-screen">
        <header className="legal-topbar">
          <Link className="legal-back-link" href={returnTo} replace aria-label="이전 화면으로 돌아가기">
            ‹
          </Link>
          <h1>{page.title}</h1>
        </header>

        <div className="legal-title-block">
          <span className={page.badge === '필수' ? 'is-required' : 'is-optional'}>[{page.badge}]</span>
          <h2>{page.title}</h2>
          <p>{page.summary}</p>
          <div className="legal-meta-list">
            {documentMeta.map((item) => (
              <small key={item}>{item}</small>
            ))}
          </div>
        </div>

        <div className="legal-content">
          {page.sections.map((section) => (
            <section key={section.heading}>
              <h3>{section.heading}</h3>
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          ))}
        </div>
      </article>
    </main>
  )
}
