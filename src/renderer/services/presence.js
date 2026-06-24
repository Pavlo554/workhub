// src/renderer/services/presence.js
// Простий heartbeat-трекер "онлайн" статусу: пише lastSeenAt раз на хвилину,
// доки застосунок відкритий. Admin вважає юзера "онлайн" якщо lastSeenAt
// свіжіший за HEARTBEAT_MS * 2 (на випадок пропущеного тіку).
import { db } from './firebase.js'
import { doc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

const HEARTBEAT_MS = 60 * 1000
let _interval = null

export function startPresenceHeartbeat(uid) {
  stopPresenceHeartbeat()
  const tick = () => updateDoc(doc(db, 'users', uid), { lastSeenAt: serverTimestamp() }).catch(() => {})
  tick()
  _interval = setInterval(tick, HEARTBEAT_MS)
}

export function stopPresenceHeartbeat() {
  if (_interval) { clearInterval(_interval); _interval = null }
}

export const ONLINE_THRESHOLD_MS = HEARTBEAT_MS * 3
