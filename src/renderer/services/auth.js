// src/renderer/services/auth.js
import { auth, db } from './firebase.js'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js'
import {
  doc, setDoc, getDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

// ── Реєстрація ────────────────────────────────────────────
export async function registerUser({ name, email, password }) {
  const cred = await createUserWithEmailAndPassword(auth, email, password)
  await updateProfile(cred.user, { displayName: name })
  await setDoc(doc(db, 'users', cred.user.uid), {
    name,
    email,
    plan:           'free',
    profession:     null,
    businessName:   null,
    onboardingDone: false,
    createdAt:      serverTimestamp(),
  })
  return cred.user
}

// ── Вхід ──────────────────────────────────────────────────
export async function loginUser({ email, password }) {
  const cred = await signInWithEmailAndPassword(auth, email, password)
  return cred.user
}

// ── Вихід ─────────────────────────────────────────────────
export async function logoutUser() {
  clearProfileCache()
  await signOut(auth)
}

// ── Профіль з Firestore (з кешем) ────────────────────────
let _profileCache    = null
let _profileCacheUid = null

export async function getUserProfile(uid) {
  if (_profileCache && _profileCacheUid === uid) return _profileCache
  const snap   = await getDoc(doc(db, 'users', uid))
  _profileCache    = snap.exists() ? snap.data() : null
  _profileCacheUid = uid
  return _profileCache
}

export function updateProfileCache(uid, data) {
  _profileCacheUid = uid
  _profileCache    = _profileCache ? { ..._profileCache, ...data } : data
}

export function clearProfileCache() {
  _profileCache    = null
  _profileCacheUid = null
}

// ── Поточний юзер ─────────────────────────────────────────
export function getCurrentUser() {
  return auth.currentUser
}

// ── Базовий шлях для даних активного бізнесу ─────────────
// Головний бізнес:  "users/{uid}"
// Другий бізнес:    "users/{uid}/businesses/{bizId}"
export function getActiveBasePath(uid) {
  const bizId = _profileCache?.activeBusiness
  if (bizId) return `users/${uid}/businesses/${bizId}`
  return `users/${uid}`
}

// Повертає масив сегментів для використання в collection(db, ...segments, 'module')
export function getActivePathSegments(uid) {
  return getActiveBasePath(uid).split('/')
}

// ── Слухач стану авторизації ──────────────────────────────
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback)
}

// ── Скидання пароля ───────────────────────────────────────
export function resetPassword(email) {
  return sendPasswordResetEmail(auth, email)
}

// ── Повідомлення про помилки ──────────────────────────────
export function getAuthErrorMessage(code) {
  const errors = {
    'auth/email-already-in-use':   'Цей email вже зареєстрований',
    'auth/invalid-email':          'Невірний формат email',
    'auth/weak-password':          'Пароль занадто слабкий (мін. 6 символів)',
    'auth/user-not-found':         'Користувача не знайдено',
    'auth/wrong-password':         'Невірний пароль',
    'auth/invalid-credential':     'Невірний email або пароль',
    'auth/too-many-requests':      'Забагато спроб. Спробуйте пізніше',
    'auth/network-request-failed': "Помилка мережі. Перевірте з'єднання",
  }
  return errors[code] || 'Сталася помилка. Спробуйте ще раз'
}