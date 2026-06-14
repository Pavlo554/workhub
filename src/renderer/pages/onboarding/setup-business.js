// src/renderer/pages/onboarding/setup-business.js
import { db } from '../../services/firebase.js'
import { getCurrentUser, getUserProfile, updateProfileCache } from '../../services/auth.js'
import { navigate } from '../../../core/router.js'
import { renderNavigation } from '../../components/navigation.js'
import { doc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

export async function render(container) {
  const user    = getCurrentUser()
  const profile = await getUserProfile(user.uid)

  container.innerHTML = `
    <div class="onboarding-page">
      <div class="onboarding-content" style="max-width:480px">
        <div class="onboarding-header">
          <div class="onboarding-step">Крок 3 з 3</div>
          <h1 class="onboarding-title">Ваш бізнес</h1>
          <p class="onboarding-subtitle">Ця інформація буде використана в рахунках та договорах</p>
        </div>

        <div id="setup-error" style="display:none" class="auth-error"></div>

        <form class="auth-form" id="setup-form" novalidate>
          <div class="field">
            <label>Назва бізнесу або ваше ім'я *</label>
            <input id="biz-name" type="text" class="input" placeholder="ФОП Іванов або Design Studio"
                   value="${profile?.businessName || ''}" />
          </div>
          <div class="field">
            <label>Телефон</label>
            <input id="biz-phone" type="tel" class="input" placeholder="+380 XX XXX XX XX"
                   value="${profile?.phone || ''}" />
          </div>
          <div class="field">
            <label>Місто</label>
            <input id="biz-city" type="text" class="input" placeholder="Київ"
                   value="${profile?.city || ''}" />
          </div>
          <div class="field">
            <label>Сайт або Instagram</label>
            <input id="biz-site" type="text" class="input" placeholder="@username або yoursite.com"
                   value="${profile?.website || ''}" />
          </div>
          <div style="display:flex;gap:12px;margin-top:8px">
            <button type="button" class="btn btn-secondary" id="back-btn">← Назад</button>
            <button type="submit" class="btn btn-primary btn-full" id="submit-btn">Розпочати роботу →</button>
          </div>
        </form>
      </div>
    </div>
  `

  const errorBox = container.querySelector('#setup-error')

  container.querySelector('#back-btn').addEventListener('click', () => navigate('choose-profession'))

  container.querySelector('#setup-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const businessName = container.querySelector('#biz-name').value.trim()
    if (!businessName) {
      errorBox.textContent = "Введіть назву бізнесу або ваше ім'я"
      errorBox.style.display = 'flex'
      return
    }

    const btn = container.querySelector('#submit-btn')
    btn.disabled = true
    btn.innerHTML = '<div class="spinner"></div> Відкриваємо...'

    const user = getCurrentUser()
    const patch = {
      businessName,
      phone:          container.querySelector('#biz-phone').value.trim() || null,
      city:           container.querySelector('#biz-city').value.trim()  || null,
      website:        container.querySelector('#biz-site').value.trim()  || null,
      onboardingDone: true,
    }

    // Оновлюємо кеш ОДРАЗУ — без очікування Firestore
    updateProfileCache(user.uid, patch)
    const updatedProfile = await getUserProfile(user.uid) // instant from cache

    // Показуємо sidebar і переходимо одразу
    let sidebar = document.getElementById('sidebar')
    if (!sidebar) {
      sidebar = document.createElement('div')
      sidebar.id = 'sidebar'
      document.getElementById('app').prepend(sidebar)
    }
    renderNavigation(sidebar, updatedProfile)
    navigate('dashboard')

    // Фоновий запис у Firestore (setDoc+merge безпечно якщо doc ще не існує)
    setDoc(doc(db, 'users', user.uid), { ...patch, updatedAt: serverTimestamp() }, { merge: true })
      .catch(err => console.error('[setup-business] save error:', err))
  })

  setTimeout(() => container.querySelector('#biz-name').focus(), 100)
}
