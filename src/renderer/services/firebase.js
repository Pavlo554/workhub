import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js'
import { getAuth }        from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js'
import { getFirestore }   from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
import { getStorage }     from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js'

const firebaseConfig = {
  apiKey: "AIzaSyBb9ROBz6VeLfxFF4GihZV-i585GE5xKmQ",
  authDomain: "desktop-crm.firebaseapp.com",
  projectId: "desktop-crm",
  storageBucket: "desktop-crm.firebasestorage.app",
  messagingSenderId: "208771547887",
  appId: "1:208771547887:web:415690ed2be03bf14c911a",
  measurementId: "G-F8ZLHDK56H"
}

const app            = initializeApp(firebaseConfig)
export const auth    = getAuth(app)
export const db      = getFirestore(app)
export const storage = getStorage(app)
export default app
