import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

const keyLength = 64

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('base64url')
  const hash = scryptSync(password, salt, keyLength).toString('base64url')
  return `scrypt$${salt}$${hash}`
}

export function verifyPassword(password: string, passwordHash: string | null | undefined) {
  if (!passwordHash) return false

  const [algorithm, salt, expectedHash] = passwordHash.split('$')
  if (algorithm !== 'scrypt' || !salt || !expectedHash) return false

  const actual = Buffer.from(scryptSync(password, salt, keyLength).toString('base64url'))
  const expected = Buffer.from(expectedHash)

  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}
