// Client-side LiqPay URL generator (no Cloud Functions required)
// Uses SubtleCrypto for SHA-1 — available in Electron renderer (Chromium)

import { db } from './firebase.js'
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

const PLAN_PRICES = { pro: 299, business: 799 }

async function sha1Base64(str) {
  const buf    = new TextEncoder().encode(str)
  const hash   = await crypto.subtle.digest('SHA-1', buf)
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
}

function b64encode(str) {
  // UTF-8 safe base64
  return btoa(unescape(encodeURIComponent(str)))
}

export async function getLiqPayKeys() {
  const [paySnap, keysSnap] = await Promise.all([
    getDoc(doc(db, 'config', 'payments')),
    getDoc(doc(db, 'config', 'liqpay_keys')),
  ])
  const publicKey  = paySnap.exists()  ? paySnap.data().liqpayPublicKey : null
  const privateKey = keysSnap.exists() ? keysSnap.data().privateKey     : null
  if (!publicKey || !privateKey) return null
  return { publicKey, privateKey }
}

export async function createLiqPayUrl(uid, planId, months = 1, webhookUrl = null) {
  const keys = await getLiqPayKeys()
  if (!keys) throw new Error('LiqPay keys not configured')

  const { publicKey, privateKey } = keys
  const amount  = PLAN_PRICES[planId] * months
  const orderId = `wh_${uid}_${planId}_${months}_${Date.now()}`

  const payload = {
    version:     3,
    public_key:  publicKey,
    action:      'pay',
    amount:      String(amount),
    currency:    'UAH',
    description: `WorkHub ${planId.toUpperCase()} — ${months} міс`,
    order_id:    orderId,
  }

  if (webhookUrl) payload.server_url = webhookUrl

  const data      = b64encode(JSON.stringify(payload))
  const signature = await sha1Base64(privateKey + data + privateKey)

  return {
    url: `https://www.liqpay.ua/api/3/checkout?data=${encodeURIComponent(data)}&signature=${encodeURIComponent(signature)}`,
    orderId,
  }
}
