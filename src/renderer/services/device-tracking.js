// src/renderer/services/device-tracking.js
// Детектує новий пристрій/IP при вході та пише запис в users/{uid}/loginEvents.
// Не блокує нічого — лише фіксує для перегляду в адмінці (own account security).
import { db } from './firebase.js'
import { doc, getDoc, updateDoc, collection, addDoc, getDocs, query, orderBy, limit, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

function getDeviceId() {
  let id = localStorage.getItem('wh-device-id')
  if (!id) {
    id = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
    localStorage.setItem('wh-device-id', id)
  }
  return id
}

async function fetchPublicIp() {
  try {
    const res = await fetch('https://api.ipify.org?format=json')
    const data = await res.json()
    return data.ip || null
  } catch { return null }
}

export async function trackLogin(uid) {
  try {
    const deviceId = getDeviceId()
    const platform = window.electron?.platform || 'unknown'
    const ip = await fetchPublicIp()

    const userRef = doc(db, 'users', uid)
    const snap = await getDoc(userRef)
    const known = snap.exists() ? (snap.data().knownDevices || []) : []
    const isKnown = known.some(d => d.deviceId === deviceId)

    await addDoc(collection(db, 'users', uid, 'loginEvents'), {
      deviceId, platform, ip,
      isNewDevice: !isKnown,
      createdAt: serverTimestamp(),
    })

    if (!isKnown) {
      const updated = [...known, { deviceId, platform, ip, firstSeen: new Date().toISOString() }].slice(-10)
      await updateDoc(userRef, { knownDevices: updated })
    }
  } catch (err) { console.error('trackLogin:', err) }
}

export async function getLoginEvents(uid) {
  try {
    const snap = await getDocs(query(collection(db, 'users', uid, 'loginEvents'), orderBy('createdAt', 'desc'), limit(20)))
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch (err) { console.error('getLoginEvents:', err); return [] }
}
