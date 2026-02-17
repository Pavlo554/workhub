// src/renderer/services/crypto-payment.js
// Мануальний прийом криптовалют

import { db } from './firebase.js'
import { doc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

// ⚠️ ВАЖЛИВО: Отримай адреси в Trustee Plus і вставь сюди
const CRYPTO_ADDRESSES = {
  'USDT': 'TE2EuWzsNE8mVW19pYMyJiFN9pHXj5CxhC',  // TRC20 (найдешевша мережа)
  'BTC': 'TE2EuWzsNE8mVW19pYMyJiFN9pHXj5CxhC',           // Bitcoin
  'ETH': 'TE2EuWzsNE8mVW19pYMyJiFN9pHXj5CxhC',           // Ethereum
}

// Приблизні курси (оновлюй вручну або через API)
const CRYPTO_RATES = {
  'USDT': 41,      // 1 USDT ≈ 41 UAH
  'BTC': 1850000,  // 1 BTC ≈ 1,850,000 UAH
  'ETH': 95000,    // 1 ETH ≈ 95,000 UAH
}

export function getCryptoAddress(currency) {
  return CRYPTO_ADDRESSES[currency] || null
}

export function calculateCryptoAmount(uahAmount, currency) {
  const rate = CRYPTO_RATES[currency]
  if (!rate) return '0'
  return (uahAmount / rate).toFixed(8)
}

export async function createPendingPayment(userId, planId, amount, currency) {
  const paymentId = `payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  try {
    await setDoc(doc(db, 'users', userId, 'pendingPayments', paymentId), {
      paymentId,
      planId,
      amount,
      currency,
      cryptoAmount: calculateCryptoAmount(amount, currency),
      address: getCryptoAddress(currency),
      status: 'pending',
      createdAt: serverTimestamp(),
    })
    
    console.log('Pending payment created:', paymentId)
    return paymentId
  } catch (err) {
    console.error('Error creating pending payment:', err)
    throw err
  }
}