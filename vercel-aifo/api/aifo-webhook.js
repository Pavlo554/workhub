const { admin, db, setCors } = require('./_lib/firebase')
const { PLAN_PRICES, addMonths, crypto } = require('./_lib/aifo')

async function readRawBody(req) {
  // Fetch-style runtime (Web Request) — has .text()/.arrayBuffer(), no .on().
  if (typeof req.text === 'function') return await req.text()
  // Classic Node.js IncomingMessage stream.
  if (typeof req.on === 'function') {
    return new Promise((resolve, reject) => {
      let data = ''
      req.on('data', chunk => { data += chunk })
      req.on('end', () => resolve(data))
      req.on('error', reject)
    })
  }
  return null
}

async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed')

  try {
    // Prefer the raw stream (needed for byte-exact HMAC verification), but
    // fall back to re-serializing the already-parsed body if this runtime
    // handed us a consumed/parsed request instead of a raw Node stream.
    let rawBody = await readRawBody(req).catch(() => null)
    if (!rawBody) rawBody = req.body && typeof req.body === 'object' ? JSON.stringify(req.body) : req.body
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
    console.log('aifoWebhook payload:', JSON.stringify(payload))

    // Confirmed real shape: { event: "payment.success", data: { invoice_id, amount, ... } }
    const eventName = payload.event || payload.status || ''
    if (!/success/i.test(eventName)) { res.status(200).send('ok'); return }

    // AIFO does NOT echo back our external_id. On payment, AIFO creates a
    // NEW invoice record for the transaction itself (data.invoice_id) and
    // puts the ORIGINAL invoice's id — the one we created and stored as
    // aifoInvoiceId — in data.uid. Confirmed from AIFO's own dashboard:
    // invoice #566 (paid) has uid "565", which is the invoice we made.
    const invoiceIdRaw = payload.data?.uid ?? payload.uid
    if (!invoiceIdRaw) {
      console.warn('aifoWebhook: no invoice_id in payload')
      res.status(200).send('ok')
      return
    }
    // AIFO's invoice_id type isn't guaranteed to match what we stored —
    // try both Number and String forms rather than assuming one.
    const invoiceIdNum = Number(invoiceIdRaw)
    let snap = await db
      .collectionGroup('pendingPayments')
      .where('aifoInvoiceId', '==', invoiceIdNum)
      .limit(1)
      .get()
    if (snap.empty) {
      snap = await db
        .collectionGroup('pendingPayments')
        .where('aifoInvoiceId', '==', String(invoiceIdRaw))
        .limit(1)
        .get()
    }

    if (snap.empty) {
      console.warn('aifoWebhook: no pendingPayments doc for invoice_id', invoiceIdRaw, typeof invoiceIdRaw)
      res.status(200).send('ok')
      return
    }

    const paymentDoc = snap.docs[0]
    const payment    = paymentDoc.data()
    const uid        = paymentDoc.ref.parent.parent.id

    if (payment.status === 'approved') { res.status(200).send('ok'); return } // idempotency

    const planId = payment.planId
    const months = payment.months || 1
    if (!PLAN_PRICES[planId]) { res.status(200).send('ok'); return }

    const expiry = addMonths(new Date(), months)

    await Promise.all([
      db.collection('users').doc(uid).update({
        plan:               planId,
        subscriptionEnd:    expiry.toISOString(),
        subscriptionStatus: 'active',
        planExpiresAt:      admin.firestore.Timestamp.fromDate(expiry),
        planActivatedAt:    admin.firestore.FieldValue.serverTimestamp(),
        planMethod:         'aifo',
        updatedAt:          admin.firestore.FieldValue.serverTimestamp(),
      }),
      paymentDoc.ref.update({
        status:     'approved',
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      }),
    ])

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
