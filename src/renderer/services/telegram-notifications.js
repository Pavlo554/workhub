// src/renderer/services/telegram-notifications.js
import { db } from './firebase.js'
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

let _tgCfg = null

async function getTgConfig() {
  if (_tgCfg) return _tgCfg
  const snap = await getDoc(doc(db, 'config', 'telegram'))
  if (!snap.exists()) return null
  const d = snap.data()
  if (!d.botToken || !d.chatId) return null
  _tgCfg = { botToken: d.botToken, chatId: d.chatId }
  return _tgCfg
}

export async function sendPaymentNotification(paymentData) {
  const cfg = await getTgConfig()
  if (!cfg) return // Telegram not configured — skip silently

  const { userId, userName, userEmail, planName, amount, currency, cryptoAmount, address, paymentId } = paymentData

  const message = `
🔔 Нова заявка на оплату!

👤 Користувач: ${userName || 'Без імені'}
📧 Email: ${userEmail}
🆔 User ID: ${userId}

💎 План: ${planName}
💰 Сума: ₴${amount}

🪙 Метод: ${currency}
${cryptoAmount ? `📊 Сума в крипті: ${cryptoAmount} ${currency}\n📍 Адреса: ${address}` : ''}

🆔 Payment ID: ${paymentId}
⏰ Час: ${new Date().toLocaleString('uk-UA')}
  `.trim()

  try {
    const res = await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: cfg.chatId, text: message }),
    })
    const data = await res.json()
    if (!data.ok) console.error('Telegram API error:', data.description)
    // Invalidate cache if token changed
    else _tgCfg = null
  } catch (err) {
    console.error('Telegram notification failed:', err.message)
    // Don't throw — payment flow should continue even if notification fails
  }
}
