// src/renderer/pages/onboarding/setup-business.js
import { db } from '../../services/firebase.js'
import { getCurrentUser, getUserProfile, updateProfileCache } from '../../services/auth.js'
import { navigate } from '../../../core/router.js'
import { doc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

export async function render(container) {
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
            <input id="biz-name" type="text" class="input" placeholder="ФОП Іванов або Design Studio" />
          </div>
          <div class="field">
            <label>Телефон</label>
            <input id="biz-phone" type="tel" class="input" placeholder="+380 XX XXX XX XX" />
          </div>
          <div class="field">
            <label>Місто</label>
            <input id="biz-city" type="text" class="input" placeholder="Київ" />
          </div>
          <div class="field">
            <label>Сайт або Instagram</label>
            <input id="biz-site" type="text" class="input" placeholder="@username або yoursite.com" />
          </div>
          <div style="display:flex;gap:12px;margin-top:8px">
            <button type="button" class="btn btn-secondary" id="back-btn">← Назад</button>
            <button type="submit" class="btn btn-primary btn-full" id="submit-btn">Розпочати роботу</button>
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
    btn.innerHTML = '<div class="spinner"></div> Налаштовуємо...'

    try {
      const user   = getCurrentUser()
      const data   = {
        businessName,
        phone:          container.querySelector('#biz-phone').value.trim() || null,
        city:           container.querySelector('#biz-city').value.trim()  || null,
        website:        container.querySelector('#biz-site').value.trim()  || null,
        onboardingDone: true,
        updatedAt:      serverTimestamp(),
      }
      await updateDoc(doc(db, 'users', user.uid), data)
      updateProfileCache(user.uid, data)

      // Показуємо сайдбар і переходимо на дашборд
      const updatedProfile = await getUserProfile(user.uid)
      const { renderNavigation } = await import('../../components/navigation.js')
      let sidebar = document.getElementById('sidebar')
      if (!sidebar) {
        sidebar = document.createElement('div')
        sidebar.id = 'sidebar'
        document.getElementById('app').prepend(sidebar)
      }
      renderNavigation(sidebar, updatedProfile)
      navigate('dashboard')
    } catch (err) {
      errorBox.textContent = 'Помилка збереження. Спробуйте ще раз'
      errorBox.style.display = 'flex'
      btn.disabled = false
      btn.innerHTML = 'Розпочати роботу'
    }
  })

  setTimeout(() => container.querySelector('#biz-name').focus(), 100)
}