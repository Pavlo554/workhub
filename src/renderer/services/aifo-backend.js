// src/renderer/services/aifo-backend.js
// AIFO invoice signing lives on a small Vercel backend (not in this client,
// and not in Firebase Cloud Functions — see project notes) because the
// signing secret must never ship inside the distributed Electron app.
import { getCurrentUser } from './auth.js'

const BASE_URL = 'https://workhub-aifo.vercel.app/api'

export async function callAifoApi(path, body) {
  const user = getCurrentUser()
  if (!user) throw new Error('Login required')
  const token = await user.getIdToken()

  const res = await fetch(`${BASE_URL}/${path}`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization':  `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}
