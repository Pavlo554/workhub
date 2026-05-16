// src/renderer/services/liqpay.js
// Генерує LiqPay-посилання для прийому оплати від клієнтів.
// Ключі зберігаються в профілі користувача — сервер не потрібен.

export async function generatePaymentLink({ publicKey, privateKey, amount, description, orderId }) {
  const bytes = new TextEncoder().encode(JSON.stringify({
    public_key:  publicKey,
    version:     '3',
    action:      'pay',
    amount:      amount,
    currency:    'UAH',
    description: description,
    order_id:    orderId || `inv_${Date.now()}`,
  }))
  const data = btoa(String.fromCharCode(...bytes))

  const signature = await _sign(privateKey + data + privateKey)
  return `https://www.liqpay.ua/api/3/checkout?data=${encodeURIComponent(data)}&signature=${encodeURIComponent(signature)}`
}

async function _sign(str) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(str))
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}
