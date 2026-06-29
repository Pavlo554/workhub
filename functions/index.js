const functions = require('firebase-functions')
const admin     = require('firebase-admin')
const crypto    = require('crypto')

admin.initializeApp()
const db = admin.firestore()

const PLAN_PRICES = { pro: 299, business: 799 }

// setMonth() overflows on month-end dates (Jan 31 + 1mo → Mar 3 instead of Feb 28).
// Clamp to the last day of the target month instead.
function addMonths(date, months) {
  const d   = new Date(date)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, lastDay))
  return d
}

// ── AIFO helpers (HMAC-SHA256, see https://aifo.pro/docs/swagger) ─────────
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

// ── createAifoInvoice (HTTPS Callable) ─────────────────────────────────────
exports.createAifoInvoice = functions
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

    const keysSnap = await db.collection('config').doc('aifo_keys').get()
    const keys = keysSnap.exists ? keysSnap.data() : {}
    const { shopId, secretKey } = keys

    if (!shopId || !secretKey) {
      throw new functions.https.HttpsError('failed-precondition', 'AIFO keys not configured')
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
      throw new functions.https.HttpsError('internal', result.message || 'AIFO error')
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

    return { url: result.data.payment_url, orderId: externalId }
  })

// ── aifoWebhook (HTTPS Trigger — receives AIFO payment notifications) ─────
exports.aifoWebhook = functions
  .region('europe-west1')
  .https.onRequest(async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return }

    try {
      const { sum, invoice, http_auth_signature } = req.body
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
  })

// ── deleteUserAccount (Admin only, Callable) ──────────────────────────────
exports.deleteUserAccount = functions
  .region('europe-west1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }

    // Verify caller is admin
    const callerDoc = await db.collection('users').doc(context.auth.uid).get()
    if (!callerDoc.exists || !callerDoc.data().isAdmin) {
      throw new functions.https.HttpsError('permission-denied', 'Admin only')
    }

    const { uid } = data
    if (!uid) throw new functions.https.HttpsError('invalid-argument', 'uid required')
    if (uid === context.auth.uid) {
      throw new functions.https.HttpsError('invalid-argument', 'Cannot delete your own account')
    }

    // Delete Firestore user document (subcollections are orphaned — clean up separately if needed)
    await db.collection('users').doc(uid).delete()

    // Delete Firebase Auth account
    await admin.auth().deleteUser(uid)

    return { success: true }
  })
