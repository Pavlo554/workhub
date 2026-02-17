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
  await signOut(auth)
}

// ── Профіль з Firestore ───────────────────────────────────
export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid))
  return snap.exists() ? snap.data() : null
}

// ── Поточний юзер ─────────────────────────────────────────
export function getCurrentUser() {
  return auth.currentUser
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