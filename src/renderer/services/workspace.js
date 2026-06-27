// src/renderer/services/workspace.js
import { db } from './firebase.js'
import {
  doc, collection, setDoc, getDoc, getDocs,
  updateDoc, deleteDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

// ── Генерація invite-коду (6 символів без схожих) ────────
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// ── Створення / отримання воркспейсу ─────────────────────
export async function ensureWorkspace(ownerUid, ownerProfile) {
  const wsRef = doc(db, 'workspaces', ownerUid)
  const snap  = await getDoc(wsRef)
  if (!snap.exists()) {
    const name = ownerProfile.businessName || (ownerProfile.name + "'s Team")
    await setDoc(wsRef, { name, ownerId: ownerUid, createdAt: serverTimestamp() })
    await updateDoc(doc(db, 'users', ownerUid), {
      workspaceId: ownerUid, isWorkspaceOwner: true,
    })
  }
  return ownerUid
}

export async function getWorkspace(workspaceId) {
  const snap = await getDoc(doc(db, 'workspaces', workspaceId))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

export async function updateWorkspaceName(workspaceId, name) {
  await updateDoc(doc(db, 'workspaces', workspaceId), { name })
}

// ── Учасники ──────────────────────────────────────────────
export async function getMembers(workspaceId) {
  const snap = await getDocs(collection(db, 'workspaces', workspaceId, 'members'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function updateMember(workspaceId, memberUid, { role, modules }) {
  await updateDoc(doc(db, 'workspaces', workspaceId, 'members', memberUid), { role, modules })
  await updateDoc(doc(db, 'users', memberUid), { workspaceRole: role, workspaceModules: modules })
}

export async function removeMember(workspaceId, memberUid) {
  await deleteDoc(doc(db, 'workspaces', workspaceId, 'members', memberUid))
  await updateDoc(doc(db, 'users', memberUid), {
    workspaceId: null, isWorkspaceOwner: false,
    workspaceRole: null, workspaceModules: null,
  })
}

// ── Запрошення ────────────────────────────────────────────
export async function createInvite(workspaceId, { role, modules }) {
  const code = generateCode()
  const data = { workspaceId, role, modules, used: false, createdAt: serverTimestamp() }
  // Зберігаємо в двох місцях:
  //   invites/{code}                         — для пошуку при вводі коду
  //   workspaces/{id}/invites/{code}          — для відображення власнику
  await setDoc(doc(db, 'invites', code), data)
  await setDoc(doc(db, 'workspaces', workspaceId, 'invites', code), data)
  return code
}

export async function getPendingInvites(workspaceId) {
  const snap = await getDocs(collection(db, 'workspaces', workspaceId, 'invites'))
  return snap.docs
    .map(d => ({ code: d.id, ...d.data() }))
    .filter(i => !i.used)
}

export async function deleteInvite(workspaceId, code) {
  await deleteDoc(doc(db, 'invites', code))
  await deleteDoc(doc(db, 'workspaces', workspaceId, 'invites', code))
}

// ── Приєднання за кодом ───────────────────────────────────
export async function lookupInvite(code) {
  const snap = await getDoc(doc(db, 'invites', code.toUpperCase().trim()))
  if (!snap.exists()) return null
  const data = snap.data()
  if (data.used) return null
  return { code: snap.id, ...data }
}

export async function joinWorkspace(uid, userProfile, invite) {
  // Додаємо до членів воркспейсу
  await setDoc(doc(db, 'workspaces', invite.workspaceId, 'members', uid), {
    uid,
    name:        userProfile.name || '',
    email:       userProfile.email || '',
    role:        invite.role,
    modules:     invite.modules,
    inviteCode:  invite.code,
    joinedAt:    serverTimestamp(),
  })
  // Назва бізнесу — щоб дашборд воркера показував її, а не порожній фолбек
  const ws = await getWorkspace(invite.workspaceId)
  // Оновлюємо профіль юзера
  await updateDoc(doc(db, 'users', uid), {
    workspaceId:      invite.workspaceId,
    isWorkspaceOwner: false,
    workspaceRole:    invite.role,
    workspaceModules: invite.modules,
    workspaceName:    ws?.name || null,
  })
  // Позначаємо запрошення як використане
  await updateDoc(doc(db, 'invites', invite.code), {
    used: true, usedBy: uid, usedAt: serverTimestamp(),
  })
  await updateDoc(doc(db, 'workspaces', invite.workspaceId, 'invites', invite.code), {
    used: true, usedBy: uid,
  })
}

export async function leaveWorkspace(uid, workspaceId) {
  await deleteDoc(doc(db, 'workspaces', workspaceId, 'members', uid))
  await updateDoc(doc(db, 'users', uid), {
    workspaceId: null, isWorkspaceOwner: false,
    workspaceRole: null, workspaceModules: null,
  })
}
