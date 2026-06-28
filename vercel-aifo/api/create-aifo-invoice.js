const { admin, db, setCors, requireAuth } = require('./_lib/firebase')
const { PLAN_PRICES, aifoSign, crypto } = require('./_lib/aifo')

module.exports = async (req, res) => {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' })

  let decoded
  try {
    decoded = await requireAuth(req)
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message })
  }
  const uid = decoded.uid

  try {
    const { planId, months = 1 } = req.body || {}

    if (!PLAN_PRICES[planId]) {
      return res.status(400).json({ error: 'Unknown plan' })
    }

    const keysSnap = await db.collection('config').doc('aifo_keys').get()
    const keys = keysSnap.exists ? keysSnap.data() : {}
    const { shopId, secretKey } = keys

    if (!shopId || !secretKey) {
      return res.status(412).json({ error: 'AIFO keys not configured' })
    }

    const amount     = (PLAN_PRICES[planId] * months).toFixed(2)
    const externalId = `wh-${uid}-${planId}-${months}-${Date.now()}`
    const timestamp  = Math.floor(Date.now() / 1000)
    const nonce      = crypto.randomBytes(16).toString('hex')

    const params    = { shop_id: shopId, amount, external_id: externalId }
    const signature = aifoSign('POST', '/api/v2/invoices/create', timestamp, nonce, params, secretKey)

    const resp = await fetch('https://aifo.pro/api/v2/invoices/create', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({ ...params, timestamp: String(timestamp), nonce, signature }).toString(),
    })
    const result = await resp.json()

    if (result.status !== 'success') {
      console.error('createAifoInvoice: AIFO error', result)
      return res.status(502).json({ error: result.message || 'AIFO error' })
    }

    await db.collection('users').doc(uid).collection('pendingPayments').add({
      orderId:   externalId,
      planId,
      months,
      amount:    Number(amount),
      method:    'aifo',
      status:    'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    return res.status(200).json({ url: result.data.payment_url, orderId: externalId })
  } catch (err) {
    console.error('createAifoInvoice error:', err)
    return res.status(500).json({ error: 'Internal error' })
  }
}
