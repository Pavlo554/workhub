// Monobank Personal API integration (https://api.monobank.ua/docs/)
// Requests go through the main process (window.electron.shop.request) to bypass
// renderer CSP — the same pattern already used for warehouse product-link lookups.

import { db } from './firebase.js'
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

export async function getMonobankConfig(base) {
  const snap = await getDoc(doc(db, ...base, 'integrations', 'monobank'))
  return snap.exists() ? snap.data() : null
}

export async function saveMonobankConfig(base, { token, accountId, accountLabel }) {
  await setDoc(doc(db, ...base, 'integrations', 'monobank'), {
    token, accountId, accountLabel, updatedAt: serverTimestamp(),
  })
}

async function request(url, token) {
  const res = await window.electron.shop.request({ url, headers: { 'X-Token': token } })
  if (res.error) throw new Error(res.error)
  if (res.status !== 200) {
    let msg = `Monobank: HTTP ${res.status}`
    try { msg = JSON.parse(res.body).errorDescription || msg } catch {}
    throw new Error(msg)
  }
  return JSON.parse(res.body)
}

export async function fetchClientInfo(token) {
  return request('https://api.monobank.ua/personal/client-info', token)
}

// from/to are Date objects; Monobank API caps each request to a 31-day window
export async function fetchStatement(token, accountId, from, to) {
  const fromTs = Math.floor(from.getTime() / 1000)
  const toTs   = Math.floor(to.getTime() / 1000)
  return request(`https://api.monobank.ua/personal/statement/${accountId}/${fromTs}/${toTs}`, token)
}
