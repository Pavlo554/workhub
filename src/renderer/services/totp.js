// src/renderer/services/totp.js
// Мінімальна реалізація TOTP (RFC 6238) на Web Crypto API — без зовнішніх залежностей.
// Сумісна з Google Authenticator / Authy / будь-яким стандартним TOTP-застосунком.

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function generateSecret(length = 20) {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return base32Encode(bytes)
}

function base32Encode(bytes) {
  let bits = 0, value = 0, output = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  return output
}

function base32Decode(str) {
  str = str.replace(/=+$/, '').toUpperCase()
  let bits = 0, value = 0
  const bytes = []
  for (const ch of str) {
    const idx = BASE32_ALPHABET.indexOf(ch)
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return new Uint8Array(bytes)
}

async function hmacSha1(keyBytes, msgBytes) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, msgBytes)
  return new Uint8Array(sig)
}

function intToBytes(num) {
  const buf = new ArrayBuffer(8)
  const view = new DataView(buf)
  view.setUint32(4, num, false) // лише 32 нижні біти — достатньо до 2106 року
  return new Uint8Array(buf)
}

async function totpAt(secretB32, counter) {
  const key = base32Decode(secretB32)
  const msg = intToBytes(counter)
  const hash = await hmacSha1(key, msg)
  const offset = hash[hash.length - 1] & 0xf
  const code = ((hash[offset] & 0x7f) << 24 | (hash[offset + 1] & 0xff) << 16 |
                (hash[offset + 2] & 0xff) << 8 | (hash[offset + 3] & 0xff)) % 1000000
  return String(code).padStart(6, '0')
}

export async function generateTotpCode(secretB32, step = 30) {
  const counter = Math.floor(Date.now() / 1000 / step)
  return totpAt(secretB32, counter)
}

// Перевіряє код з допуском ±1 крок (30с) на розбіжність годинника
export async function verifyTotpCode(secretB32, code, step = 30) {
  const counter = Math.floor(Date.now() / 1000 / step)
  for (const delta of [0, -1, 1]) {
    if (await totpAt(secretB32, counter + delta) === code) return true
  }
  return false
}

export function buildOtpAuthUri(secretB32, accountLabel, issuer = 'WorkHub') {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountLabel)}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
}
