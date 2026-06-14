// WorkHub Telegram Payment Bot
// Deploy to Railway / Render / Fly.io (free tier)
// Required env vars: TELEGRAM_BOT_TOKEN, WEBHOOK_URL, FIREBASE_PROJECT_ID,
//                    FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
'use strict'

const TelegramBot = require('node-telegram-bot-api')
const admin       = require('firebase-admin')
const express     = require('express')
const crypto      = require('crypto')

// ── Firebase Admin ────────────────────────────────────────
admin.initializeApp({
  credential: admin.credential.cert({
    projectId:   process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey:  (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  }),
})
const db = admin.firestore()

// ── Config ───────────────────────────────────────────────
const BOT_TOKEN   = process.env.TELEGRAM_BOT_TOKEN
const WEBHOOK_URL = (process.env.WEBHOOK_URL || '').replace(/\/$/, '')
const PORT        = parseInt(process.env.PORT || '3000', 10)

if (!BOT_TOKEN)   throw new Error('Missing TELEGRAM_BOT_TOKEN')
if (!WEBHOOK_URL) throw new Error('Missing WEBHOOK_URL (e.g. https://your-bot.railway.app)')

const PLAN_PRICES = { pro: 299, business: 799 }
const PLAN_NAMES  = { pro: 'PRO', business: 'BUSINESS' }

// ── LiqPay helper ─────────────────────────────────────────
const LIQPAY_WEBHOOK = 'https://europe-west1-desktop-crm.cloudfunctions.net/liqpayWebhook'

function liqpaySign(key, data) {
  return Buffer.from(
    crypto.createHash('sha1').update(key + data + key).digest()
  ).toString('base64')
}

async function createLiqPayUrl({ uid, planId, months, orderId }) {
  const [cfgSnap, keysSnap] = await Promise.all([
    db.collection('config').doc('payments').get(),
    db.collection('config').doc('liqpay_keys').get(),
  ])
  const cfg  = cfgSnap.exists  ? cfgSnap.data()  : {}
  const keys = keysSnap.exists ? keysSnap.data() : {}

  const publicKey  = cfg.liqpayPublicKey  || keys.publicKey
  const privateKey = keys.privateKey      || cfg.liqpayPrivateKey

  if (!publicKey || !privateKey) return null

  const amount = PLAN_PRICES[planId] * months
  const data   = Buffer.from(JSON.stringify({
    version:     3,
    public_key:  publicKey,
    action:      'pay',
    amount:      String(amount),
    currency:    'UAH',
    description: `WorkHub ${PLAN_NAMES[planId]} — ${months} міс`,
    order_id:    orderId,
    server_url:  LIQPAY_WEBHOOK,
  })).toString('base64')

  const sig = liqpaySign(privateKey, data)
  return `https://www.liqpay.ua/api/3/checkout?data=${encodeURIComponent(data)}&signature=${encodeURIComponent(sig)}`
}

// ── Bot setup ─────────────────────────────────────────────
const app = express()
app.use(express.json())

const bot = new TelegramBot(BOT_TOKEN)
bot.setWebHook(`${WEBHOOK_URL}/bot${BOT_TOKEN}`)

app.post(`/bot${BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body)
  res.sendStatus(200)
})

app.get('/', (_, res) => res.send('WorkHub Bot OK'))

// ── /start handler ────────────────────────────────────────
bot.onText(/\/start pay_(.+)/, async (msg, match) => {
  const chatId = msg.chat.id
  const parts  = (match[1] || '').split('_')
  const uid    = parts[0]
  const planId = parts[1]
  const months = parseInt(parts[2]) || 1

  if (!uid || !PLAN_PRICES[planId]) {
    return bot.sendMessage(chatId, '❌ Невірний запит. Поверніться в WorkHub і спробуйте ще раз.')
  }

  await bot.sendMessage(chatId, '⏳ Генеруємо посилання для оплати...')

  try {
    const userSnap = await db.collection('users').doc(uid).get()
    const user     = userSnap.exists ? userSnap.data() : {}
    const amount   = PLAN_PRICES[planId] * months
    const orderId  = `wh_${uid}_${planId}_${months}_${Date.now()}`

    const payUrl = await createLiqPayUrl({ uid, planId, months, orderId })

    if (!payUrl) {
      return bot.sendMessage(chatId, '❌ Платіжна система не налаштована. Зверніться до підтримки.')
    }

    // Save pending payment
    await db.collection('users').doc(uid).collection('pendingPayments').add({
      orderId, planId, months, amount,
      method:    'liqpay',
      source:    'telegram',
      status:    'pending',
      chatId:    chatId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    const text = [
      `💎 *WorkHub ${PLAN_NAMES[planId]}* — ${months} міс`,
      `💰 Сума: *₴${amount}*`,
      user.email ? `👤 Акаунт: ${user.email}` : '',
      '',
      'Натисніть кнопку нижче для безпечної оплати карткою.',
      '✅ Підписка активується *автоматично* після оплати.',
    ].filter(Boolean).join('\n')

    await bot.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: `💳 Оплатити ₴${amount}`, url: payUrl },
        ]],
      },
    })
  } catch (err) {
    console.error('[bot] payment error:', err)
    bot.sendMessage(chatId, '❌ Сталася помилка. Спробуйте пізніше або оплатіть через додаток.')
  }
})

// Default /start (without params)
bot.onText(/^\/start$/, (msg) => {
  bot.sendMessage(msg.chat.id,
    '👋 *WorkHub CRM — платіжний бот*\n\nЦей бот приймає оплату підписки.\n\n' +
    'Відкрийте WorkHub → Підписка → "Оплатити через Telegram" щоб отримати посилання на оплату.',
    { parse_mode: 'Markdown' }
  )
})

// ── Start server ──────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[WorkHub Bot] listening on :${PORT}`)
  console.log(`[WorkHub Bot] webhook: ${WEBHOOK_URL}/bot${BOT_TOKEN.slice(0, 8)}...`)
})
