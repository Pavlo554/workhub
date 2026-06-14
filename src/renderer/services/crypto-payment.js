// src/renderer/services/crypto-payment.js

import { db } from './firebase.js'
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

// Завантажує адреси з Firestore (налаштовуються в адмін-панелі)
export async function getPaymentConfig() {
  const snap = await getDoc(doc(db, 'config', 'payments'))
  if (!snap.exists()) return {}
  return Object.fromEntries(Object.entries(snap.data()).map(([k, v]) => [k.trim(), v]))
}

export function getCryptoAddress(config, currency) {
  const key = `address_${currency.toLowerCase()}`
  return config?.[key] || null
}

export function getMonobankJar(config) {
  return config?.monobankJar || null
}

// Живий курс з CoinGecko (безкоштовний API)
const _rateCache = {}
export async function fetchCryptoRate(currency) {
  const now = Date.now()
  if (_rateCache[currency] && now - _rateCache[currency].ts < 5 * 60_000) {
    return _rateCache[currency].rate
  }

  const ids = { USDT: 'tether', BTC: 'bitcoin', ETH: 'ethereum' }
  const id = ids[currency]
  if (!id) return null

  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=uah`)
    const json = await res.json()
    const rate = json[id]?.uah
    if (rate) _rateCache[currency] = { rate, ts: now }
    return rate
  } catch {
    // fallback курси якщо API недоступний
    const fallback = { USDT: 41.5, BTC: 3_900_000, ETH: 155_000 }
    return fallback[currency] ?? null
  }
}

export function calculateCryptoAmount(uahAmount, rateUAH) {
  if (!rateUAH) return '0'
  return (uahAmount / rateUAH).toFixed(8)
}

export async function createPendingPayment(userId, planId, amount, method, extra = {}) {
  const paymentId = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  await setDoc(doc(db, 'users', userId, 'pendingPayments', paymentId), {
    paymentId,
    planId,
    amount,
    method,   // 'usdt' | 'btc' | 'eth' | 'monobank'
    status: 'pending',
    createdAt: serverTimestamp(),
    ...extra,
  })
  return paymentId
}
