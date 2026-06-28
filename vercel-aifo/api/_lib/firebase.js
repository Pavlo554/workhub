// Shared Firebase Admin init — reused across warm serverless invocations.
const admin = require('firebase-admin')

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  })
}

const db = admin.firestore()

// Allow the desktop app (file:// origin / Electron) and any future web client.
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

// Verifies the Firebase ID token sent by the renderer (Authorization: Bearer <token>).
// Mirrors what httpsCallable did automatically for context.auth.
async function requireAuth(req) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) throw Object.assign(new Error('Login required'), { status: 401 })
  try {
    return await admin.auth().verifyIdToken(token)
  } catch {
    throw Object.assign(new Error('Invalid token'), { status: 401 })
  }
}

module.exports = { admin, db, setCors, requireAuth }
