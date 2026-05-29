// src/renderer/pages/auth/login.js
import { loginUser, resetPassword, getAuthErrorMessage } from '../../services/auth.js'
import { navigate } from '../../../core/router.js'
import { icon } from '../../utils/icons.js'

export async function render(container) {
  container.innerHTML = `
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-logo">
          <div class="auth-logo-icon">W</div>
          <span class="auth-logo-text">WorkHub</span>
        </div>
        <h1 class="auth-title">Вітаємо назад</h1>
        <p class="auth-subtitle">Увійдіть у свій акаунт, щоб продовжити</p>

        <div id="auth-msg" style="display:none"></div>

        <form class="auth-form" id="login-form" novalidate>
          <div class="field">
            <label>Email</label>
            <input id="email" type="email" class="input" placeholder="your@email.com" autocomplete="email" />
          </div>
          <div class="field">
            <label>Пароль</label>
            <div class="input-wrapper">
              <input id="password" type="password" class="input" placeholder="••••••••" autocomplete="current-password" />
              <button type="button" class="auth-eye-btn" id="toggle-pass">${icon('eye', 15)}</button>
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
  const msgBox    = container.querySelector('#auth-msg')

  container.querySelector('#toggle-pass').addEventListener('click', () => {
    const show = passEl.type === 'password'
    passEl.type = show ? 'text' : 'password'
    container.querySelector('#toggle-pass').innerHTML = icon(show ? 'eye-off' : 'eye', 15)
  })

  container.querySelector('#forgot-link').addEventListener('click', async (e) => {
    e.preventDefault()
    const email = emailEl.value.trim()
    if (!email) { showMsg('Введіть email для скидання пароля'); return }
    try {
      await resetPassword(email)
      showMsg('Лист надіслано на ' + email, true)
    } catch (err) {
      showMsg(getAuthErrorMessage(err.code))
    }
  })

  container.querySelector('#go-register').addEventListener('click', (e) => {
    e.preventDefault()
    navigate('register')
  })

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    msgBox.style.display = 'none'

    const email    = emailEl.value.trim()
    const password = passEl.value
    if (!email || !password) { showMsg('Заповніть усі поля'); return }

    setLoading(true)
    try {
      await loginUser({ email, password })
    } catch (err) {
      showMsg(getAuthErrorMessage(err.code))
      setLoading(false)
    }
  })

  function showMsg(msg, success = false) {
    msgBox.className = success ? 'auth-success' : 'auth-error'
    msgBox.innerHTML = `${icon(success ? 'check' : 'x', 14)} <span>${msg}</span>`
    msgBox.style.display = 'flex'
  }

  function setLoading(on) {
    submitBtn.disabled = on
    submitBtn.innerHTML = on
      ? `<div class="spinner"></div> Вхід…`
      : 'Увійти'
  }

  setTimeout(() => emailEl.focus(), 100)
}
