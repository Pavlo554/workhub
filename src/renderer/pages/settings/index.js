// src/renderer/pages/settings/index.js
import { getCurrentUser, getUserProfile } from '../../services/auth.js'
import { auth, db } from '../../services/firebase.js'
import { signOut, updatePassword, updateEmail, EmailAuthProvider, reauthenticateWithCredential } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js'
import { doc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

export async function render(container) {
  const user = getCurrentUser()
  const profile = await getUserProfile(user.uid)

  container.innerHTML = `
    <div class="settings-page">
      
      <div class="settings-header">
        <h1 class="settings-title">⚙️ Налаштування акаунта</h1>
        <p class="settings-subtitle">Керуйте своїм профілем та налаштуваннями безпеки</p>
      </div>

      <!-- Основна інформація -->
      <div class="settings-section">
        <div class="section-header">
          <h2 class="section-title">👤 Особиста інформація</h2>
        </div>
        <div class="settings-card">
          
          <!-- Аватарка (тільки показ) -->
          <div class="avatar-section">
            <div class="avatar-placeholder">
              ${(profile.name || 'U')[0].toUpperCase()}
            </div>
            <div class="avatar-info">
              <div class="avatar-info-title">${profile.name || 'Користувач'}</div>
              <div class="avatar-info-desc">${user.email}</div>
            </div>
          </div>

          <!-- Ім'я -->
          <div class="form-group">
            <label class="form-label">Повне ім'я</label>
            <input 
              type="text" 
              class="form-input" 
              id="input-name" 
              value="${profile.name || ''}"
              placeholder="Іван Петренко"
            >
          </div>

          <!-- Email -->
          <div class="form-group">
            <label class="form-label">Email</label>
            <input 
              type="email" 
              class="form-input" 
              id="input-email" 
              value="${user.email}"
              placeholder="email@example.com"
              disabled
            >
            <div class="form-hint">📧 Email не можна змінити</div>
          </div>

          <!-- Телефон -->
          <div class="form-group">
            <label class="form-label">Телефон</label>
            <input 
              type="tel" 
              class="form-input" 
              id="input-phone" 
              value="${profile.phone || ''}"
              placeholder="+380 XX XXX XX XX"
            >
          </div>

          <!-- Місто -->
          <div class="form-group">
            <label class="form-label">Місто</label>
            <input 
              type="text" 
              class="form-input" 
              id="input-city" 
              value="${profile.city || ''}"
              placeholder="Київ"
            >
          </div>

          <button class="btn-primary btn-large" id="save-profile-btn">
            💾 Зберегти зміни
          </button>
        </div>
      </div>

      <!-- Бізнес інформація -->
      <div class="settings-section">
        <div class="section-header">
          <h2 class="section-title">💼 Бізнес інформація</h2>
        </div>
        <div class="settings-card">
          
          <!-- Назва бізнесу -->
          <div class="form-group">
            <label class="form-label">Назва компанії/бізнесу</label>
            <input 
              type="text" 
              class="form-input" 
              id="input-business" 
              value="${profile.businessName || ''}"
              placeholder="ФОП Петренко І.І."
            >
          </div>

          <!-- Професія -->
          <div class="form-group">
            <label class="form-label">Професія</label>
            <select class="form-select" id="input-profession">
              <option value="">Оберіть професію</option>
              <option value="psychologist" ${profile.profession === 'psychologist' ? 'selected' : ''}>👨‍⚕️ Психолог</option>
              <option value="coach" ${profile.profession === 'coach' ? 'selected' : ''}>🎯 Коуч</option>
              <option value="therapist" ${profile.profession === 'therapist' ? 'selected' : ''}>💆 Терапевт</option>
              <option value="consultant" ${profile.profession === 'consultant' ? 'selected' : ''}>💡 Консультант</option>
              <option value="designer" ${profile.profession === 'designer' ? 'selected' : ''}>🎨 Дизайнер</option>
              <option value="developer" ${profile.profession === 'developer' ? 'selected' : ''}>💻 Розробник</option>
              <option value="photographer" ${profile.profession === 'photographer' ? 'selected' : ''}>📷 Фотограф</option>
              <option value="other" ${profile.profession === 'other' ? 'selected' : ''}>🔧 Інше</option>
            </select>
          </div>

          <!-- Веб-сайт -->
          <div class="form-group">
            <label class="form-label">Веб-сайт</label>
            <input 
              type="url" 
              class="form-input" 
              id="input-website" 
              value="${profile.website || ''}"
              placeholder="https://mysite.com"
            >
          </div>

          <!-- Instagram -->
          <div class="form-group">
            <label class="form-label">Instagram</label>
            <div class="input-with-prefix">
              <span class="input-prefix">@</span>
              <input 
                type="text" 
                class="form-input input-with-prefix-field" 
                id="input-instagram" 
                value="${profile.instagram || ''}"
                placeholder="username"
              >
            </div>
          </div>

          <button class="btn-primary btn-large" id="save-business-btn">
            💾 Зберегти бізнес інформацію
          </button>
        </div>
      </div>

      <!-- Зміна пароля -->
      <div class="settings-section">
        <div class="section-header">
          <h2 class="section-title">🔒 Безпека</h2>
        </div>
        <div class="settings-card">
          
          <div class="security-warning">
            <div class="warning-icon">⚠️</div>
            <div class="warning-text">
              Для зміни пароля потрібно підтвердити поточний пароль
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Поточний пароль</label>
            <input 
              type="password" 
              class="form-input" 
              id="input-current-password" 
              placeholder="••••••••"
            >
          </div>

          <div class="form-group">
            <label class="form-label">Новий пароль</label>
            <input 
              type="password" 
              class="form-input" 
              id="input-new-password" 
              placeholder="••••••••"
            >
            <div class="form-hint">Мінімум 6 символів</div>
          </div>

          <div class="form-group">
            <label class="form-label">Підтвердіть новий пароль</label>
            <input 
              type="password" 
              class="form-input" 
              id="input-confirm-password" 
              placeholder="••••••••"
            >
          </div>

          <button class="btn-secondary btn-large" id="change-password-btn">
            🔑 Змінити пароль
          </button>
        </div>
      </div>

      <!-- План підписки -->
      <div class="settings-section">
        <div class="section-header">
          <h2 class="section-title">💎 Підписка</h2>
        </div>
        <div class="settings-card">
          <div class="subscription-info">
            <div class="subscription-plan">
              <div class="plan-name">${(profile.plan || 'free').toUpperCase()}</div>
              <div class="plan-status ${profile.subscriptionStatus === 'active' ? 'status-active' : 'status-inactive'}">
                ${profile.subscriptionStatus === 'active' ? '✓ Активна' : '○ Неактивна'}
              </div>
            </div>
            ${profile.subscriptionEnd ? `
              <div class="subscription-end">
                Діє до: <strong>${new Date(profile.subscriptionEnd).toLocaleDateString('uk-UA')}</strong>
              </div>
            ` : ''}
          </div>
          <button class="btn-primary" id="manage-subscription-btn">
            Керувати підпискою
          </button>
        </div>
      </div>

      <!-- Небезпечна зона -->
      <div class="settings-section">
        <div class="section-header">
          <h2 class="section-title">⚠️ Небезпечна зона</h2>
        </div>
        <div class="settings-card danger-zone">
          
          <div class="danger-item">
            <div class="danger-info">
              <div class="danger-title">Вийти з акаунта</div>
              <div class="danger-desc">Вийти з поточного облікового запису на цьому пристрої</div>
            </div>
            <button class="btn-secondary" id="logout-btn">Вийти</button>
          </div>

          <div class="danger-item">
            <div class="danger-info">
              <div class="danger-title">Видалити акаунт</div>
              <div class="danger-desc">Назавжди видалити ваш акаунт та всі дані</div>
            </div>
            <button class="btn-danger" id="delete-account-btn">Видалити акаунт</button>
          </div>

        </div>
      </div>

    </div>
  `

  injectStyles()
  attachEventListeners()

  function attachEventListeners() {
    // Збереження профілю
    container.querySelector('#save-profile-btn')?.addEventListener('click', async () => {
      const name = container.querySelector('#input-name').value.trim()
      const phone = container.querySelector('#input-phone').value.trim()
      const city = container.querySelector('#input-city').value.trim()

      if (!name) {
        showToast('Введіть ім\'я', 'error')
        return
      }

      const loading = showLoading('Збереження...')

      try {
        await updateDoc(doc(db, 'users', user.uid), {
          name,
          phone,
          city,
          updatedAt: serverTimestamp()
        })

        loading.remove()
        showToast('Профіль оновлено!', 'success')
        setTimeout(() => location.reload(), 1000)
      } catch (err) {
        loading.remove()
        console.error(err)
        showToast('Помилка збереження', 'error')
      }
    })

    // Збереження бізнес інфо
    container.querySelector('#save-business-btn')?.addEventListener('click', async () => {
      const businessName = container.querySelector('#input-business').value.trim()
      const profession = container.querySelector('#input-profession').value
      const website = container.querySelector('#input-website').value.trim()
      const instagram = container.querySelector('#input-instagram').value.trim()

      const loading = showLoading('Збереження...')

      try {
        await updateDoc(doc(db, 'users', user.uid), {
          businessName,
          profession,
          website,
          instagram,
          updatedAt: serverTimestamp()
        })

        loading.remove()
        showToast('Бізнес інформацію оновлено!', 'success')
      } catch (err) {
        loading.remove()
        console.error(err)
        showToast('Помилка збереження', 'error')
      }
    })

    // Зміна пароля
    container.querySelector('#change-password-btn')?.addEventListener('click', async () => {
      const currentPassword = container.querySelector('#input-current-password').value
      const newPassword = container.querySelector('#input-new-password').value
      const confirmPassword = container.querySelector('#input-confirm-password').value

      if (!currentPassword || !newPassword || !confirmPassword) {
        showToast('Заповніть всі поля', 'error')
        return
      }

      if (newPassword.length < 6) {
        showToast('Пароль має бути мінімум 6 символів', 'error')
        return
      }

      if (newPassword !== confirmPassword) {
        showToast('Паролі не співпадають', 'error')
        return
      }

      const loading = showLoading('Зміна пароля...')

      try {
        const credential = EmailAuthProvider.credential(user.email, currentPassword)
        await reauthenticateWithCredential(user, credential)
        await updatePassword(user, newPassword)

        loading.remove()
        showToast('Пароль змінено!', 'success')
        
        // Очищаємо поля
        container.querySelector('#input-current-password').value = ''
        container.querySelector('#input-new-password').value = ''
        container.querySelector('#input-confirm-password').value = ''
      } catch (err) {
        loading.remove()
        console.error(err)
        if (err.code === 'auth/wrong-password') {
          showToast('Неправильний поточний пароль', 'error')
        } else {
          showToast('Помилка зміни пароля', 'error')
        }
      }
    })

    // Керування підпискою
    container.querySelector('#manage-subscription-btn')?.addEventListener('click', () => {
      window.router.navigate('/subscribe')
    })

    // Вихід
    container.querySelector('#logout-btn')?.addEventListener('click', async () => {
      if (confirm('Ви впевнені що хочете вийти?')) {
        try {
          await signOut(auth)
          window.location.reload()
        } catch (err) {
          console.error(err)
          showToast('Помилка виходу', 'error')
        }
      }
    })

    // Видалення акаунта
    container.querySelector('#delete-account-btn')?.addEventListener('click', () => {
      const confirmation = prompt('Це незворотня дія! Введіть "ВИДАЛИТИ" для підтвердження:')
      if (confirmation === 'ВИДАЛИТИ') {
        alert('Функція видалення акаунта в розробці. Зверніться в підтримку.')
      }
    })
  }

  function showLoading(text) {
    const loading = document.createElement('div')
    loading.className = 'loading-overlay'
    loading.innerHTML = `
      <div class="loading-content">
        <div class="spinner-large"></div>
        <div class="loading-text">${text}</div>
      </div>
    `
    document.body.appendChild(loading)
    return loading
  }

  function showToast(message, type = 'info') {
    const toast = document.createElement('div')
    toast.className = `toast toast-${type}`
    toast.textContent = message
    document.body.appendChild(toast)

    setTimeout(() => toast.classList.add('toast-show'), 100)
    setTimeout(() => {
      toast.classList.remove('toast-show')
      setTimeout(() => toast.remove(), 300)
    }, 3000)
  }
}

function injectStyles() {
  if (document.getElementById('settings-styles')) return
  const style = document.createElement('style')
  style.id = 'settings-styles'
  style.textContent = `
    .settings-page { padding: 32px 36px; max-width: 800px; margin: 0 auto; }

    .settings-header { margin-bottom: 40px; }
    .settings-title { font-family: var(--font-display); font-size: 36px; font-weight: 800; margin-bottom: 8px; }
    .settings-subtitle { font-size: 16px; color: var(--text-secondary); }

    .settings-section { margin-bottom: 32px; }
    .section-header { margin-bottom: 16px; }
    .section-title { font-family: var(--font-display); font-size: 20px; font-weight: 700; }

    .settings-card { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 28px; }

    /* Avatar */
    .avatar-section { display: flex; align-items: center; gap: 24px; margin-bottom: 28px; padding-bottom: 28px; border-bottom: 1px solid var(--border); }
    .avatar-placeholder { width: 80px; height: 80px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: 800; color: #fff; flex-shrink: 0; }
    .avatar-info { flex: 1; }
    .avatar-info-title { font-weight: 700; font-size: 18px; margin-bottom: 4px; }
    .avatar-info-desc { font-size: 14px; color: var(--text-secondary); }

    /* Forms */
    .form-group { margin-bottom: 24px; }
    .form-label { display: block; font-size: 14px; font-weight: 600; margin-bottom: 8px; }
    .form-input, .form-select { width: 100%; padding: 12px 16px; background: var(--bg-tertiary); border: 2px solid var(--border); border-radius: var(--radius-md); font-size: 14px; color: var(--text-primary); transition: all .2s; }
    .form-input:focus, .form-select:focus { outline: none; border-color: var(--accent-blue); background: var(--bg-primary); }
    .form-input:disabled { opacity: 0.6; cursor: not-allowed; }
    .form-hint { font-size: 12px; color: var(--text-muted); margin-top: 6px; }

    .input-with-prefix { position: relative; }
    .input-prefix { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: var(--text-secondary); font-weight: 600; }
    .input-with-prefix-field { padding-left: 36px; }

    /* Security */
    .security-warning { display: flex; align-items: center; gap: 12px; background: rgba(251,191,36,0.1); border: 1px solid rgba(251,191,36,0.3); border-radius: var(--radius-md); padding: 14px; margin-bottom: 24px; }
    .warning-icon { font-size: 24px; }
    .warning-text { font-size: 13px; line-height: 1.5; }

    /* Subscription */
    .subscription-info { margin-bottom: 20px; }
    .subscription-plan { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
    .plan-name { font-size: 24px; font-weight: 800; font-family: var(--font-display); }
    .plan-status { padding: 4px 12px; border-radius: 50px; font-size: 12px; font-weight: 700; }
    .status-active { background: rgba(52,211,153,0.2); color: #34D399; }
    .status-inactive { background: rgba(156,163,175,0.2); color: #9CA3AF; }
    .subscription-end { font-size: 14px; color: var(--text-secondary); }

    /* Buttons */
    .btn-primary, .btn-secondary, .btn-danger { padding: 12px 24px; border-radius: var(--radius-md); font-weight: 700; font-size: 14px; cursor: pointer; transition: all .3s; border: none; }
    .btn-large { width: 100%; padding: 14px; font-size: 15px; }
    .btn-primary { background: linear-gradient(135deg, #667eea 0%, #4F8EF7 100%); color: #fff; }
    .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(79,142,247,0.4); }
    .btn-secondary { background: var(--bg-tertiary); color: var(--text-primary); border: 2px solid var(--border); }
    .btn-secondary:hover { border-color: var(--accent-blue); }
    .btn-danger { background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%); color: #fff; }
    .btn-danger:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(239,68,68,0.4); }

    /* Danger Zone */
    .danger-zone { border: 2px solid rgba(239,68,68,0.3); }
    .danger-item { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 16px 0; border-bottom: 1px solid var(--border); }
    .danger-item:last-child { border-bottom: none; }
    .danger-title { font-weight: 700; font-size: 15px; margin-bottom: 4px; }
    .danger-desc { font-size: 13px; color: var(--text-secondary); }

    /* Loading */
    .loading-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 10000; }
    .loading-content { text-align: center; }
    .spinner-large { width: 48px; height: 48px; border: 4px solid rgba(255,255,255,0.2); border-top-color: #fff; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 16px; }
    .loading-text { font-size: 16px; font-weight: 600; color: #fff; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Toast */
    .toast { position: fixed; bottom: 24px; right: 24px; background: var(--bg-secondary); border: 1px solid var(--border); padding: 16px 24px; border-radius: var(--radius-md); box-shadow: var(--shadow-xl); z-index: 10000; transform: translateY(100px); opacity: 0; transition: all .3s; font-weight: 600; }
    .toast-show { transform: translateY(0); opacity: 1; }
    .toast-success { border-left: 4px solid #34D399; }
    .toast-error { border-left: 4px solid #EF4444; }
    .toast-info { border-left: 4px solid #4F8EF7; }
  `
  document.head.appendChild(style)
}