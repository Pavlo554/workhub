// src/renderer/pages/auth/login.js
import { loginUser, resetPassword, getAuthErrorMessage } from '../../services/auth.js'
import { navigate } from '../../../core/router.js'

export async function render(container) {
  container.innerHTML = `
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-logo">
          <div class="auth-logo-icon">W</div>
          <span class="auth-logo-text">WorkHub</span>
        </div>
        <h1 class="auth-title">Вітаємо назад 👋</h1>
        <p class="auth-subtitle">Увійдіть у свій акаунт щоб продовжити</p>

        <div id="auth-error" style="display:none" class="auth-error"></div>

        <form class="auth-form" id="login-form" novalidate>
          <div class="field">
            <label>Email</label>
            <input id="email" type="email" class="input" placeholder="your@email.com" autocomplete="email" />
          </div>
          <div class="field">
            <label>Пароль</label>
            <div class="input-wrapper">
              <input id="password" type="password" class="input" placeholder="••••••••" autocomplete="current-password" />
              <button type="button" class="input-action" id="toggle-pass">👁</button>
            </div>
          </div>
          <div class="auth-forgot">
            <a href="#" id="forgot-link">Забули пароль?</a>
          </div>
          <button type="submit" class="btn btn-primary btn-full auth-submit" id="submit-btn">
            Увійти
          </button>
        </form>

        <div class="auth-footer">
          Ще немає акаунту? <a href="#" id="go-register">Зареєструватися</a>
        </div>
      </div>
    </div>
  `

  const form      = container.querySelector('#login-form')
  const emailEl   = container.querySelector('#email')
  const passEl    = container.querySelector('#password')
  const submitBtn = container.querySelector('#submit-btn')
  const errorBox  = container.querySelector('#auth-error')

  // Показати/сховати пароль
  container.querySelector('#toggle-pass').addEventListener('click', () => {
    const show = passEl.type === 'password'
    passEl.type = show ? 'text' : 'password'
    container.querySelector('#toggle-pass').textContent = show ? '🙈' : '👁'
  })

  // Забули пароль
  container.querySelector('#forgot-link').addEventListener('click', async (e) => {
    e.preventDefault()
    const email = emailEl.value.trim()
    if (!email) { showError('Введіть email для скидання пароля'); return }
    try {
      await resetPassword(email)
      showError('Лист надіслано на ' + email, true)
    } catch (err) {
      showError(getAuthErrorMessage(err.code))
    }
  })

  // Перехід на реєстрацію
  container.querySelector('#go-register').addEventListener('click', (e) => {
    e.preventDefault()
    navigate('register')
  })

  // Сабміт
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    errorBox.style.display = 'none'

    const email    = emailEl.value.trim()
    const password = passEl.value
    if (!email || !password) { showError('Заповніть усі поля'); return }

    setLoading(true)
    try {
      await loginUser({ email, password })
    } catch (err) {
      showError(getAuthErrorMessage(err.code))
      setLoading(false)
    }
  })

  function showError(msg, success = false) {
    errorBox.textContent = msg
    errorBox.style.display = 'flex'
    errorBox.style.color = success ? '#34D399' : ''
    errorBox.style.background = success ? 'rgba(52,211,153,0.12)' : ''
    errorBox.style.borderColor = success ? 'rgba(52,211,153,0.25)' : ''
  }

  function setLoading(on) {
    submitBtn.disabled = on
    submitBtn.innerHTML = on ? '<div class="spinner"></div> Вхід...' : 'Увійти'
  }

  setTimeout(() => emailEl.focus(), 100)
}