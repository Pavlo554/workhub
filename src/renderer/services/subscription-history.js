// src/renderer/services/subscription-history.js
// Лог змін тарифного плану конкретного користувача — видно і адміну, і самому юзеру.
import { db } from './firebase.js'
import { collection, addDoc, getDocs, query, orderBy, limit, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

export async function logSubscriptionChange(uid, {
  plan, previousPlan, source, amount = null, months = null, changedBy = null, changedByName = null, note = null,
}) {
  try {
    await addDoc(collection(db, 'users', uid, 'subscriptionHistory'), {
      plan, previousPlan, source, amount, months, changedBy, changedByName, note,
      createdAt: serverTimestamp(),
    })
  } catch (err) { console.error('logSubscriptionChange:', err) }
}

export async function getSubscriptionHistory(uid) {
  try {
    const snap = await getDocs(query(collection(db, 'users', uid, 'subscriptionHistory'), orderBy('createdAt', 'desc'), limit(50)))
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch (err) { console.error('getSubscriptionHistory:', err); return [] }
}

export const SOURCE_LABEL = {
  admin:          'Адмін змінив план',
  payment:        'Оплата підтверджена',
  system_expire:  'Автоматично знижено (закінчилась)',
  revoke:         'План забрано адміном',
}
