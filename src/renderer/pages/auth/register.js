// src/renderer/pages/auth/register.js
import { registerUser, getAuthErrorMessage } from '../../services/auth.js'
import { navigate, invalidateRoute } from '../../../core/router.js'
import { icon } from '../../utils/icons.js'

export async function render(container) {
  container.innerHTML = `
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-logo">
          <div class="auth-logo-icon">W</div>
          <span class="auth-logo-text">WorkHub</span>
        </div>
        <h1 class="auth-title">Створити акаунт</h1>
        <p class="auth-subtitle">Зареєструйтесь і починайте безкоштовно</p>

        <div id="auth-msg" style="display:none"></div>

        <form class="auth-form" id="register-form" novalidate>
          <div class="field">
            <label>Ваше ім'я</label>
            <input id="name" type="text" class="input" placeholder="Іван Іванов" autocomplete="name" />
          </div>
          <div class="field">
            <label>Email</label>
            <input id="email" type="email" class="input" placeholder="your@email.com" autocomplete="email" />
          </div>
          <div class="field">
            <label>Пароль</label>
            <div class="input-wrapper">
              <input id="password" type="password" class="input" placeholder="Мінімум 6 символів" autocomplete="new-password" />
              <button type="button" class="auth-eye-btn" id="toggle-pass">${icon('eye', 15)}</button>
            </div>
            <div class="password-strength" id="strength-wrap" style="display:none">
              <div class="strength-bar"><div class="strength-fill" id="strength-fill"></div></div>
              <span class="strength-label" id="strength-label"></span>
            </div>
          </div>
          <div class="field">
            <label>Підтвердження пароля</label>
            <input id="confirm" type="password" class="input" placeholder="Повторіть пароль" autocomplete="new-password" />
          </div>

          <button type="submit" class="btn btn-primary btn-full auth-submit" id="submit-btn">
            Зареєструватися
          </button>
        </form>

        <p class="auth-terms">
          Реєструючись, ви погоджуєтесь з <a href="#" id="terms-link">Умовами використання</a>,
          <a href="#" id="privacy-link">Політикою конфіденційності</a> та
          <a href="#" id="cookies-link">Політикою cookies</a>
        </p>
        <div class="auth-footer">
          Вже є акаунт? <a href="#" id="go-login">Увійти</a>
        </div>
      </div>
    </div>
  `

  const form      = container.querySelector('#register-form')
  const nameEl    = container.querySelector('#name')
  const emailEl   = container.querySelector('#email')
  const passEl    = container.querySelector('#password')
  const confEl    = container.querySelector('#confirm')
  const submitBtn = container.querySelector('#submit-btn')
  const msgBox    = container.querySelector('#auth-msg')

  container.querySelector('#toggle-pass').addEventListener('click', () => {
    const show = passEl.type === 'password'
    passEl.type = show ? 'text' : 'password'
    container.querySelector('#toggle-pass').innerHTML = icon(show ? 'eye-off' : 'eye', 15)
  })

  passEl.addEventListener('input', () => {
    const val  = passEl.value
    const wrap = container.querySelector('#strength-wrap')
    if (!val) { wrap.style.display = 'none'; return }
    wrap.style.display = 'block'
    const s = getStrength(val)
    container.querySelector('#strength-fill').className = `strength-fill ${s.level}`
    const lbl = container.querySelector('#strength-label')
    lbl.textContent = s.label
    lbl.style.color = s.color
  })

  container.querySelector('#go-login').addEventListener('click', (e) => {
    e.preventDefault()
    navigate('login')
  })

  const openLegal = (tab) => (e) => {
    e.preventDefault()
    location.hash = `#${tab}`
    invalidateRoute('legal')
    navigate('legal')
  }
  container.querySelector('#terms-link')?.addEventListener('click', openLegal('terms'))
  container.querySelector('#privacy-link')?.addEventListener('click', openLegal('privacy'))
  container.querySelector('#cookies-link')?.addEventListener('click', openLegal('cookies'))

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    msgBox.style.display = 'none'

    const name     = nameEl.value.trim()
    const email    = emailEl.value.trim()
    const password = passEl.value
    const confirm  = confEl.value

    if (!name)               { showMsg("Введіть ваше ім'я"); return }
    if (!email)              { showMsg('Введіть email'); return }
    if (password.length < 6) { showMsg('Пароль мінімум 6 символів'); return }
    if (password !== confirm){ showMsg('Паролі не співпадають'); return }

    setLoading(true)
    try {
      await registerUser({ name, email, password })
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
    submitBtn.innerHTML = on ? '<div class="spinner"></div> Реєстрація…' : 'Зареєструватися'
  }

  function getStrength(p) {
    let s = 0
    if (p.length >= 8) s++
    if (/[A-Z]/.test(p)) s++
    if (/[0-9]/.test(p)) s++
    if (/[^A-Za-z0-9]/.test(p)) s++
    if (s <= 1) return { level: 'weak',   label: 'Слабкий',  color: '#F87171' }
    if (s <= 2) return { level: 'medium', label: 'Середній', color: '#FBBF24' }
    return             { level: 'strong', label: 'Надійний', color: '#34D399' }
  }

  setTimeout(() => nameEl.focus(), 100)
}
