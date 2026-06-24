// Client-side AIFO invoice creation (no Cloud Functions required)
// Uses SubtleCrypto for HMAC-SHA256 — available in Electron renderer (Chromium)

import { db } from './firebase.js'
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
import { createPendingPayment } from './crypto-payment.js'

const PLAN_PRICES = { pro: 299, business: 799 }

function aifoUrlEncode(str) {
  return encodeURIComponent(str)
    .replace(/%20/g, '+')
    .replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}

function toHex(buf) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hmacSha256Hex(secret, message) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return toHex(sig)
}

export async function getAifoKeys() {
  const snap = await getDoc(doc(db, 'config', 'aifo_keys'))
  if (!snap.exists()) return null
  const { shopId, secretKey } = snap.data()
  if (!shopId || !secretKey) return null
  return { shopId, secretKey }
}

export async function createAifoInvoice(uid, planId, months = 1) {
  const keys = await getAifoKeys()
  if (!keys) throw new Error('AIFO keys not configured')
  const { shopId, secretKey } = keys

  const amount     = (PLAN_PRICES[planId] * months).toFixed(2)
  const externalId = `wh-${uid}-${planId}-${months}-${Date.now()}`
  const timestamp  = Math.floor(Date.now() / 1000)
  const nonce      = toHex(crypto.getRandomValues(new Uint8Array(16)))

  const params = { shop_id: shopId, amount, external_id: externalId }
  const canonical = Object.keys(params).sort()
    .map(k => `${aifoUrlEncode(k)}=${aifoUrlEncode(String(params[k]))}`)
    .join('&')
  const base = `POST\n/api/v2/invoices/create\n${timestamp}\n${nonce}\n${canonical}`
  const signature = await hmacSha256Hex(secretKey, base)

  const resp = await fetch('https://aifo.pro/api/v2/invoices/create', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({ ...params, timestamp: String(timestamp), nonce, signature }).toString(),
  })
  const result = await resp.json()

  if (result.status !== 'success') {
    throw new Error(result.message || 'AIFO: не вдалося створити рахунок')
  }

  await createPendingPayment(uid, planId, Number(amount), 'aifo', { months, orderId: externalId })

  return { url: result.data.payment_url, orderId: externalId }
}
