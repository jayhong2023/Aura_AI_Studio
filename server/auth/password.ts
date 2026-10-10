import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

const KEY_LENGTH = 64

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, (error, key) => {
      if (error) reject(error)
      else resolve(key)
    })
  })
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) return '密码至少需要 8 个字符'
  if (password.length > 128) return '密码不能超过 128 个字符'
  return null
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await derive(password, salt)
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`
}

export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  const [algorithm, saltHex, keyHex] = encoded.split('$')
  if (algorithm !== 'scrypt' || !saltHex || !keyHex) return false
  try {
    const expected = Buffer.from(keyHex, 'hex')
    const actual = await derive(password, Buffer.from(saltHex, 'hex'))
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    )
  } catch {
    return false
  }
}
