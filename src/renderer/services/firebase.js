import { initializeApp }                                         from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js'
import { getAuth, setPersistence, indexedDBLocalPersistence }    from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js'
import { initializeFirestore, persistentLocalCache,
         persistentMultipleTabManager }                          from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
import { getStorage }                                            from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js'
import { getFunctions }                                          from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js'

const firebaseConfig = {
  apiKey:            "AIzaSyBb9ROBz6VeLfxFF4GihZV-i585GE5xKmQ",
  authDomain:        "desktop-crm.firebaseapp.com",
  projectId:         "desktop-crm",
  storageBucket:     "desktop-crm.firebasestorage.app",
  messagingSenderId: "208771547887",
  appId:             "1:208771547887:web:415690ed2be03bf14c911a",
  measurementId:     "G-F8ZLHDK56H",
}

const app = initializeApp(firebaseConfig)

// Auth: persist session in IndexedDB (survives app restart without re-login)
const auth = getAuth(app)
setPersistence(auth, indexedDBLocalPersistence).catch(() => {})

// Firestore: offline cache — reads from IndexedDB on next start (instant)
const db = initializeFirestore(app, {
    localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
})

export { auth, db }
export const storage   = getStorage(app)
export const functions = getFunctions(app, 'europe-west1')
export default app

// DEV: debug helper — прибрати перед релізом
if (location.href.includes('--dev') || localStorage.getItem('wh-dev')) {
  import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js').then(fs => {
    window.__t = { db, auth, doc: fs.doc, getDoc: fs.getDoc, getDocFromServer: fs.getDocFromServer, updateDoc: fs.updateDoc, setDoc: fs.setDoc }
    console.log('[WorkHub DEV] window.__t доступний для тестів')
  })
}
