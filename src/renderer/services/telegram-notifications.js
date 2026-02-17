// src/renderer/services/telegram-notifications.js
// Telegram бот для сповіщень про платежі

// Твій Telegram Bot Token (отримай у @BotFather)
const TELEGRAM_BOT_TOKEN = '5885495961:AAHTgHwngCc1G8A1-WrUm9Bd5n76n32X5bk'
// Твій Telegram Chat ID (отримай у @userinfobot)
const TELEGRAM_CHAT_ID = '-723349476'


export async function sendPaymentNotification(paymentData) {
  const { userId, userName, userEmail, planName, amount, currency, cryptoAmount, address, paymentId } = paymentData
  
  const message = `
🔔 Нова заявка на оплату!

👤 Користувач: ${userName || 'Без імені'}
📧 Email: ${userEmail}
🆔 User ID: ${userId}

💎 План: ${planName}
💰 Сума: ₴${amount}

🪙 Криптовалюта: ${currency}
📊 Сума в крипті: ${cryptoAmount} ${currency}
📍 Адреса: ${address}

🆔 Payment ID: ${paymentId}
⏰ Час: ${new Date().toLocaleString('uk-UA')}

  `.trim()

  try {
    console.log('Sending Telegram notification...')

    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML'
      })
    })

    const data = await response.json()
    
    if (!data.ok) {
      console.error('Telegram API error:', data)
      throw new Error(`Telegram API error: ${data.description}`)
    }

    console.log('Telegram notification sent successfully!')
    return true

  } catch (err) {
    console.error('Failed to send Telegram notification:', err)
    throw err
  }
}