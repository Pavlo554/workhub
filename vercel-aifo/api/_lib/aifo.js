// AIFO helpers (HMAC-SHA256, see https://aifo.pro/docs/swagger) — ported
// from functions/index.js, logic unchanged.
const crypto = require('crypto')

const PLAN_PRICES = { pro: 299, business: 799 }

function aifoUrlEncode(str) {
  return encodeURIComponent(str)
    .replace(/%20/g, '+')
    .replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}

function aifoSign(method, path, timestamp, nonce, params, secretKey) {
  const sortedKeys = Object.keys(params).sort()
  const canonical = sortedKeys
    .map(k => `${aifoUrlEncode(k)}=${aifoUrlEncode(String(params[k]))}`)
    .join('&')
  const base = `${method}\n${path}\n${timestamp}\n${nonce}\n${canonical}`
  return crypto.createHmac('sha256', secretKey).update(base).digest('hex')
}

// setMonth() overflows on month-end dates (Jan 31 + 1mo → Mar 3 instead of Feb 28).
function addMonths(date, months) {
  const d   = new Date(date)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, lastDay))
  return d
}

module.exports = { PLAN_PRICES, aifoSign, addMonths, crypto }
