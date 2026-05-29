const functions = require('firebase-functions')
const admin     = require('firebase-admin')
const crypto    = require('crypto')

admin.initializeApp()
const db = admin.firestore()

// ── LiqPay helpers ─────────────────────────────────────────────────────────
function liqpaySign(privateKey, data) {
  return Buffer.from(
    crypto.createHash('sha1').update(privateKey + data + privateKey).digest()
  ).toString('base64')
}

function liqpayData(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64')
}

const PLAN_PRICES = { pro: 299, business: 799 }
const WEBHOOK_URL = 'https://europe-west1-desktop-crm.cloudfunctions.net/liqpayWebhook'

// ── createLiqPayOrder (HTTPS Callable) ────────────────────────────────────
exports.createLiqPayOrder = functions
  .region('europe-west1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }

    const { planId, months = 1 } = data
    const uid = context.auth.uid

    if (!PLAN_PRICES[planId]) {
      throw new functions.https.HttpsError('invalid-argument', 'Unknown plan')
    }

    // Read LiqPay keys from Firestore (only accessible server-side via Admin SDK)
    const cfgSnap = await db.collection('config').doc('payments').get()
    const cfg = cfgSnap.exists ? cfgSnap.data() : {}
    const publicKey  = cfg.liqpayPublicKey
    const privateKey = cfg.liqpayPrivateKey

    if (!publicKey || !privateKey) {
      throw new functions.https.HttpsError('failed-precondition', 'LiqPay keys not configured')
    }

    const amount   = PLAN_PRICES[planId] * months
    const orderId  = `wh_${uid}_${planId}_${months}_${Date.now()}`
    const description = `WorkHub ${planId.toUpperCase()} — ${months} міс`

    const orderData = liqpayData({
      version:     3,
      public_key:  publicKey,
      action:      'pay',
      amount:      String(amount),
      currency:    'UAH',
      description,
      order_id:    orderId,
      server_url:  WEBHOOK_URL,
    })

    const signature    = liqpaySign(privateKey, orderData)
    const checkoutUrl  = `https://www.liqpay.ua/api/3/checkout?data=${encodeURIComponent(orderData)}&signature=${encodeURIComponent(signature)}`

    // Record pending payment in Firestore
    await db.collection('users').doc(uid).collection('pendingPayments').add({
      orderId,
      planId,
      months,
      amount,
      method:    'liqpay',
      status:    'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    return { url: checkoutUrl, orderId }
  })

// ── liqpayWebhook (HTTPS Trigger — receives LiqPay callbacks) ─────────────
exports.liqpayWebhook = functions
  .region('europe-west1')
  .https.onRequest(async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return }

    try {
      const { data, signature } = req.body
      if (!data || !signature) { res.status(400).send('Missing data'); return }

      const cfgSnap = await db.collection('config').doc('payments').get()
      const privateKey = cfgSnap.exists ? cfgSnap.data()?.liqpayPrivateKey : null
      if (!privateKey) { res.status(500).send('LiqPay not configured'); return }

      // Verify signature
      const expected = liqpaySign(privateKey, data)
      if (expected !== signature) {
        console.warn('liqpayWebhook: invalid signature')
        res.status(400).send('Invalid signature')
        return
      }

      const payload = JSON.parse(Buffer.from(data, 'base64').toString('utf8'))
      const { status, order_id } = payload

      console.log('liqpayWebhook:', { status, order_id })

      // Accept only successful payments
      if (status !== 'success' && status !== 'sandbox') {
        res.status(200).send('OK')
        return
      }

      // Parse order_id: wh_{uid}_{planId}_{months}_{timestamp}
      const parts = (order_id || '').split('_')
      if (parts[0] !== 'wh' || parts.length < 5) {
        res.status(400).send('Invalid order_id')
        return
      }

      const uid    = parts[1]
      const planId = parts[2]
      const months = parseInt(parts[3], 10) || 1

      if (!PLAN_PRICES[planId]) { res.status(400).send('Unknown plan'); return }

      // Calculate expiry date
      const now    = new Date()
      const expiry = new Date(now.getFullYear(), now.getMonth() + months, now.getDate())

      // Activate subscription in Firestore
      await db.collection('users').doc(uid).update({
        plan:             planId,
        planExpiresAt:    admin.firestore.Timestamp.fromDate(expiry),
        planActivatedAt:  admin.firestore.FieldValue.serverTimestamp(),
        planMethod:       'liqpay',
        updatedAt:        admin.firestore.FieldValue.serverTimestamp(),
      })

      // Mark pending payment as approved
      const snap = await db
        .collection('users').doc(uid)
        .collection('pendingPayments')
        .where('orderId', '==', order_id)
        .where('status', '==', 'pending')
        .get()

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

      res.status(200).send('OK')
    } catch (err) {
      console.error('liqpayWebhook error:', err)
      res.status(500).send('Internal Server Error')
    }
  })
