import { db } from './firebase.js'
import { collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
import { getCurrentUser } from './auth.js'
import { getCurrentRoute } from '../../core/router.js'

let _initialized = false

export function initErrorLogger() {
  if (_initialized) return
  _initialized = true

  window.addEventListener('error', (e) => {
    logError({
      type:    'uncaught',
      message: e.message || 'Unknown error',
      stack:   e.error?.stack || '',
      file:    e.filename || '',
      line:    e.lineno || 0,
    })
  })

  window.addEventListener('unhandledrejection', (e) => {
    const err = e.reason
    logError({
      type:    'promise',
      message: err?.message || String(err) || 'Unhandled promise rejection',
      stack:   err?.stack || '',
      file:    '',
      line:    0,
    })
  })
}

async function logError(data) {
  try {
    const user  = getCurrentUser()
    const route = getCurrentRoute()

    await addDoc(collection(db, 'errors'), {
      ...data,
      userId:     user?.uid   || null,
      userEmail:  user?.email || null,
      route:      route       || null,
      appVersion: window.electron?.appVersion || 'unknown',
      platform:   window.electron?.platform || 'unknown',
      createdAt:  serverTimestamp(),
    })
  } catch {
    // never throw from error logger
  }
}

export async function logManual(message, extra = {}) {
  await logError({ type: 'manual', message, stack: '', file: '', line: 0, ...extra })
}
