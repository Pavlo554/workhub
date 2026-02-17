// src/renderer/services/liqpay.js
// LiqPay інтеграція для оплати підписок

import { db } from './firebase.js'
import { doc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

// ⚠️ ВАЖЛИВО: В production ці дані мають бути на сервері!
// Це тільки для тестування
const LIQPAY_PUBLIC_KEY = 'sandbox_i00000000000' // Замінити на реальний
const LIQPAY_PRIVATE_KEY = 'sandbox_XXXXXXXXXX' // Замінити на реальний

export async function createPayment(userId, planId, amount) {
  const orderId = `sub_${userId}_${Date.now()}`
  
  // Формуємо дані для LiqPay
  const paymentData = {
    version: 3,
    public_key: LIQPAY_PUBLIC_KEY,
    action: 'pay',
    amount: amount,
    currency: 'UAH',
    description: `WorkHub ${planId.toUpperCase()} підписка`,
    order_id: orderId,
    result_url: window.location.href, // Повернення на цю ж сторінку
    server_url: 'https://your-webhook-url.com/liqpay', // ⚠️ Потрібен backend
  }

  // ⚠️ НЕБЕЗПЕЧНО: Signature має генеруватись на сервері!
  // Це тимчасове рішення для тестування
  const data = btoa(JSON.stringify(paymentData))
  const signature = await generateSignature(data, LIQPAY_PRIVATE_KEY)

  return { data, signature, orderId }
}

export function openLiqPayCheckout(data, signature, onSuccess) {
  // Створюємо форму LiqPay
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = 'https://www.liqpay.ua/api/3/checkout'
  form.acceptCharset = 'utf-8'
  form.style.display = 'none'

  const dataInput = document.createElement('input')
  dataInput.type = 'hidden'
  dataInput.name = 'data'
  dataInput.value = data

  const signatureInput = document.createElement('input')
  signatureInput.type = 'hidden'
  signatureInput.name = 'signature'
  signatureInput.value = signature

  form.appendChild(dataInput)
  form.appendChild(signatureInput)
  document.body.appendChild(form)

  // Відкриваємо в новому вікні
  const popup = window.open('', 'liqpay', 'width=800,height=600')
  form.target = 'liqpay'
  form.submit()
  form.remove()

  // Слухаємо повідомлення від LiqPay
  const messageHandler = (event) => {
    if (event.origin !== 'https://www.liqpay.ua') return
    
    if (event.data.status === 'success') {
      popup?.close()
      window.removeEventListener('message', messageHandler)
      onSuccess()
    }
  }

  window.addEventListener('message', messageHandler)

  // Перевіряємо чи вікно закрите (скасування)
  const checkClosed = setInterval(() => {
    if (popup?.closed) {
      clearInterval(checkClosed)
      window.removeEventListener('message', messageHandler)
    }
  }, 500)
}

export async function updateSubscription(userId, planId) {
  const endDate = new Date()
  endDate.setMonth(endDate.getMonth() + 1) // +1 місяць

  await setDoc(doc(db, 'users', userId), {
    plan: planId,
    subscriptionEnd: endDate.toISOString(),
    subscriptionStatus: 'active',
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

// ⚠️ Тимчасова функція - має бути на сервері!
async function generateSignature(data, privateKey) {
  const message = privateKey + data + privateKey
  const encoder = new TextEncoder()
  const dataBuffer = encoder.encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-1', dataBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return btoa(hashHex)
}