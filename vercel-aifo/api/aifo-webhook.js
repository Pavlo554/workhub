const { admin, db, setCors } = require('./_lib/firebase')
const { PLAN_PRICES, addMonths, crypto } = require('./_lib/aifo')

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', chunk => { data += chunk })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed')

  try {
    const rawBody = await readRawBody(req)
    const signature = req.headers['x-aifo-signature']
    if (!rawBody || !signature) { res.status(400).send('Missing data'); return }

    const keysSnap = await db.collection('config').doc('aifo_keys').get()
    const keys = keysSnap.exists ? keysSnap.data() : {}
    const { webhookSecret } = keys
    if (!webhookSecret) { res.status(500).send('Webhook secret not configured'); return }

    const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex')
    if (expected !== signature) {
      console.warn('aifoWebhook: invalid signature')
      res.status(400).send('Invalid signature')
      return
    }

    const payload = JSON.parse(rawBody)
    // Log the full verified payload once — real field names get confirmed
    // here on the first live webhook call, since AIFO's docs only show the
    // deep-link query params (invoice, orderReference, status), not the
    // webhook POST body shape itself.
    console.log('aifoWebhook payload:', JSON.stringify(payload))

    const status = payload.status || payload.event || ''
    const isSuccess = /success/i.test(status)
    if (!isSuccess) { res.status(200).send('ok'); return }

    // orderReference should be the external_id we generated at invoice
    // creation (wh-{uid}-{planId}-{months}-{timestamp}) — NOT AIFO's own
    // numeric "invoice" id.
    const orderReference = payload.orderReference || payload.order_reference || payload.external_id
    const parts = String(orderReference).split('-')
    if (parts[0] !== 'wh' || parts.length < 5) {
      console.warn('aifoWebhook: unrecognized orderReference', orderReference)
      res.status(200).send('ok')
      return
    }

    const uid    = parts[1]
    const planId = parts[2]
    const months = parseInt(parts[3], 10) || 1

    if (!PLAN_PRICES[planId]) { res.status(200).send('ok'); return }

    // Idempotency — skip if this invoice was already processed
    const snap = await db
      .collection('users').doc(uid)
      .collection('pendingPayments')
      .where('orderId', '==', orderReference)
      .get()

    if (!snap.empty && snap.docs[0].data().status === 'approved') {
      res.status(200).send('ok')
      return
    }

    const expiry = addMonths(new Date(), months)

    await db.collection('users').doc(uid).update({
      plan:               planId,
      subscriptionEnd:    expiry.toISOString(),
      subscriptionStatus: 'active',
      planExpiresAt:      admin.firestore.Timestamp.fromDate(expiry),
      planActivatedAt:    admin.firestore.FieldValue.serverTimestamp(),
      planMethod:         'aifo',
      updatedAt:          admin.firestore.FieldValue.serverTimestamp(),
    })

    if (!snap.empty) {
      const batch = db.batch()
      snap.forEach(d =>
        batch.update(d.ref, {
          status:     'approved',
          approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      )
      await batch.commit()
    }

    res.status(200).send('ok')
  } catch (err) {
    console.error('aifoWebhook error:', err)
    res.status(500).send('Internal Server Error')
  }
}

module.exports = handler
// AIFO signs the *raw* request body with HMAC-SHA256 (X-AIFO-Signature
// header) — Vercel's default body parser would hand us an already-parsed
// object that may not byte-for-byte match what was signed, so we disable
// it and read the raw stream ourselves above.
module.exports.config = { api: { bodyParser: false } }
