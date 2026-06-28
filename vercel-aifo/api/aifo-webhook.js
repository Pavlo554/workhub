const { admin, db, setCors } = require('./_lib/firebase')
const { PLAN_PRICES, addMonths, crypto } = require('./_lib/aifo')

module.exports = async (req, res) => {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed')

  try {
    const { sum, invoice, http_auth_signature } = req.body || {}
    if (!sum || !invoice || !http_auth_signature) { res.status(400).send('Missing data'); return }

    const keysSnap = await db.collection('config').doc('aifo_keys').get()
    const keys = keysSnap.exists ? keysSnap.data() : {}
    const { shopId, secretKey } = keys
    if (!shopId || !secretKey) { res.status(500).send('AIFO not configured'); return }

    const expected = crypto
      .createHash('sha256')
      .update(`${shopId}:${sum}:${secretKey}:${invoice}`)
      .digest('hex')

    if (expected !== http_auth_signature) {
      console.warn('aifoWebhook: invalid signature')
      res.status(400).send('Invalid signature')
      return
    }

    console.log('aifoWebhook:', { sum, invoice })

    const parts = String(invoice).split('-')
    if (parts[0] !== 'wh' || parts.length < 5) { res.status(200).send('ok'); return }

    const uid    = parts[1]
    const planId = parts[2]
    const months = parseInt(parts[3], 10) || 1

    if (!PLAN_PRICES[planId]) { res.status(200).send('ok'); return }

    // Idempotency — skip if this invoice was already processed
    const snap = await db
      .collection('users').doc(uid)
      .collection('pendingPayments')
      .where('orderId', '==', invoice)
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
