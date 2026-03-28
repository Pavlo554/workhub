// src/renderer/pages/dashboard/index.js
import { getCurrentUser, getUserProfile } from '../../services/auth.js'
import { getProfessionConfig } from '../../../core/profession-config.js'
import { db } from '../../services/firebase.js'
import { doc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
import { navigate } from '../../../core/router.js'

const PROFESSIONS = [
  { id: 'freelancer', icon: '💻', title: 'Фрілансер',       desc: 'Дизайнер, розробник, копірайтер',     color: '#4F8EF7' },
  { id: 'accountant', icon: '📊', title: 'Бухгалтер / ФОП', desc: 'Бухгалтер, податковий консультант',    color: '#34D399' },
  { id: 'smm',        icon: '📱', title: 'SMM / Маркетолог', desc: 'SMM спеціаліст, таргетолог',          color: '#A78BFA' },
  { id: 'beauty',     icon: '💅', title: 'Салон краси',      desc: 'Майстер нігтів, перукар, косметолог', color: '#F472B6' },
]

const WIDGETS = {
  'active-projects':    { icon: '📁', title: 'Активні проекти',     body: () => `<div class="widget-empty">Проектів ще немає</div>` },
  'unpaid-invoices':    { icon: '💸', title: 'Неоплачені рахунки',  body: () => `<div class="widget-empty">Всі рахунки оплачені ✓</div>` },
  'time-today':         { icon: '⏱',  title: 'Час сьогодні',        body: () => `<div class="widget-stat"><span class="stat-value">0h 0m</span><span class="stat-label">відпрацьовано</span></div>` },
  'recent-clients':     { icon: '👥', title: 'Клієнти',             body: () => `<div class="widget-stat"><span class="stat-value">0</span><span class="stat-label">клієнтів загалом</span></div>` },
  'monthly-income':     { icon: '💰', title: 'Дохід цього місяця',  body: () => `<div class="widget-stat"><span class="stat-value">₴0</span><span class="stat-label">за місяць</span></div>` },
  'upcoming-taxes':     { icon: '📅', title: 'Найближчі податки',   body: () => `<div class="widget-empty">Подій немає</div>` },
  'client-count':       { icon: '👥', title: 'Всього клієнтів',     body: () => `<div class="widget-stat"><span class="stat-value">0</span><span class="stat-label">клієнтів</span></div>` },
  'today-appointments': { icon: '📅', title: 'Записи сьогодні',     body: () => `<div class="widget-empty">Записів немає</div>` },
  'daily-revenue':      { icon: '💰', title: 'Виручка сьогодні',    body: () => `<div class="widget-stat"><span class="stat-value">₴0</span><span class="stat-label">за сьогодні</span></div>` },
  'new-clients':        { icon: '✨', title: 'Нові клієнти',        body: () => `<div class="widget-stat"><span class="stat-value">0</span><span class="stat-label">цього місяця</span></div>` },
  'posts-today':        { icon: '📝', title: 'Публікацій сьогодні', body: () => `<div class="widget-empty">Постів немає</div>` },
  'total-budget':       { icon: '💸', title: 'Загальний бюджет',    body: () => `<div class="widget-stat"><span class="stat-value">₴0</span><span class="stat-label">активних бюджетів</span></div>` },
  'content-calendar':   { icon: '📆', title: 'Контент-план',        body: () => `<div class="widget-empty">Постів не заплановано</div>` },
}

export async function render(container) {
  const user    = getCurrentUser()
  const profile = await getUserProfile(user.uid)

  // Учасник команди (воркер)
  if (profile?.accountType === 'worker') {
    renderWorkerDashboard(container, profile)
    return
  }

  // Власник без профессії і без завершеного онбординг — на вибір ніші
  if (!profile?.profession && !profile?.onboardingDone) {
    navigate('choose-profession')
    return
  }

  // Власник — повноцінний дашборд
  renderDashboard(container, profile)
}

// ═══════════════════════════════════════════════════════════
// WORKER DASHBOARD
// ═══════════════════════════════════════════════════════════
function renderWorkerDashboard(container, profile) {
  injectStyles()
  const name = profile?.name?.split(' ')[0] || 'Користувач'

  if (!profile?.workspaceId) {
    // Ще не приєднався до команди
    container.innerHTML = `
      <div class="worker-welcome">
        <div class="worker-welcome-icon">👋</div>
        <h1 class="worker-welcome-title">${getGreeting()}, ${name}!</h1>
        <p class="worker-welcome-sub">
          Щоб почати роботу, вам потрібен код запрошення від вашого менеджера або власника бізнесу.
        </p>
        <button class="btn btn-primary worker-join-btn" id="go-join">
          👥 Ввести код запрошення
        </button>
        <div class="worker-welcome-hint">
          Зверніться до вашого керівника, він надішле вам 6-значний код
        </div>
      </div>
    `
    container.querySelector('#go-join').addEventListener('click', () => navigate('join'))
    return
  }

  // Приєднався — показуємо що є доступ до
  const modules = profile.workspaceModules || []
  const MODULE_META = {
    dashboard: { icon: '⊞', label: 'Дашборд' }, clients: { icon: '👥', label: 'Клієнти' },
    projects: { icon: '📁', label: 'Проекти' }, invoices: { icon: '📄', label: 'Рахунки' },
    contracts: { icon: '📝', label: 'Договори' }, tasks: { icon: '✓', label: 'Задачі' },
    timer: { icon: '⏱', label: 'Таймер' }, finances: { icon: '💰', label: 'Фінанси' },
    'tax-calendar': { icon: '📅', label: 'Податки' }, appointments: { icon: '🗓', label: 'Розклад' },
    services: { icon: '💅', label: 'Послуги' }, 'content-plan': { icon: '📱', label: 'Контент' },
    accounts: { icon: '🔗', label: 'Акаунти' }, passwords: { icon: '🔑', label: 'Паролі' },
    notes: { icon: '🗒', label: 'Нотатки' },
  }

  container.innerHTML = `
    <div class="worker-dash">
      <div class="worker-dash-header">
        <h1>${getGreeting()}, ${name}!</h1>
        <p class="worker-dash-role">Ваша роль: <strong>${profile.workspaceRole || 'Учасник'}</strong></p>
      </div>
      <div class="worker-modules-title">Ваші розділи</div>
      <div class="worker-modules-grid">
        ${modules.filter(id => id !== 'dashboard').map(id => {
          const m = MODULE_META[id]
          if (!m) return ''
          return `
            <div class="worker-module-card" data-route="${id}">
              <div class="worker-module-icon">${m.icon}</div>
              <div class="worker-module-label">${m.label}</div>
            </div>
          `
        }).join('')}
      </div>
    </div>
  `
  container.querySelectorAll('.worker-module-card').forEach(c =>
    c.addEventListener('click', () => navigate(c.dataset.route))
  )
}

// ═══════════════════════════════════════════════════════════
// SETUP (legacy — власники без profession через старий флоу)
// ═══════════════════════════════════════════════════════════
function renderSetup(container, user) {
  injectStyles()

  container.innerHTML = `
    <div class="setup-page">

      <div class="setup-steps">
        <div class="setup-step active" id="dot-1">
          <div class="step-dot">1</div>
          <span>Сфера діяльності</span>
        </div>
        <div class="setup-step-line"></div>
        <div class="setup-step" id="dot-2">
          <div class="step-dot">2</div>
          <span>Про бізнес</span>
        </div>
      </div>

      <!-- Крок 1 -->
      <div id="step-1">
        <div class="setup-header">
          <h1 class="setup-title">Оберіть свою сферу 👋</h1>
          <p class="setup-subtitle">WorkHub підлаштує інструменти під вашу роботу</p>
        </div>
        <div class="profession-grid">
          ${PROFESSIONS.map(p => `
            <div class="profession-card" data-id="${p.id}" style="--prof-color:${p.color}">
              <div class="prof-card-icon">${p.icon}</div>
              <div class="prof-card-body">
                <div class="prof-card-title">${p.title}</div>
                <div class="prof-card-desc">${p.desc}</div>
              </div>
              <div class="prof-card-check">✓</div>
            </div>
          `).join('')}
        </div>
        <div class="setup-footer">
          <button class="btn btn-primary" id="step1-next" disabled>Далі →</button>
        </div>
      </div>

      <!-- Крок 2 -->
      <div id="step-2" style="display:none">
        <div class="setup-header">
          <h1 class="setup-title">Розкажіть про бізнес 🏢</h1>
          <p class="setup-subtitle">Ця інформація буде у рахунках та договорах</p>
        </div>
        <div class="setup-form-wrap">
          <div id="setup-error" style="display:none" class="auth-error"></div>
          <form id="setup-form" class="auth-form" novalidate>
            <div class="field">
              <label>Назва бізнесу або ваше ім'я *</label>
              <input id="biz-name" type="text" class="input" placeholder="ФОП Іванов або Design Studio" />
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
              <div class="field">
                <label>Телефон</label>
                <input id="biz-phone" type="tel" class="input" placeholder="+380 XX XXX XX XX" />
              </div>
              <div class="field">
                <label>Місто</label>
                <input id="biz-city" type="text" class="input" placeholder="Київ" />
              </div>
            </div>
            <div class="field">
              <label>Сайт або Instagram</label>
              <input id="biz-site" type="text" class="input" placeholder="@username або yoursite.com" />
            </div>
            <div style="display:flex;gap:12px;margin-top:8px">
              <button type="button" class="btn btn-secondary" id="step2-back">← Назад</button>
              <button type="submit" class="btn btn-primary btn-full" id="step2-submit">
                Розпочати роботу 🚀
              </button>
            </div>
          </form>
        </div>
      </div>

    </div>
  `

  let selectedProfession = null

  // Вибір профессії
  container.querySelectorAll('.profession-card').forEach(card => {
    card.addEventListener('click', () => {
      container.querySelectorAll('.profession-card').forEach(c => c.classList.remove('selected'))
      card.classList.add('selected')
      selectedProfession = card.dataset.id
      container.querySelector('#step1-next').disabled = false
    })
  })

  // Крок 1 → 2
  container.querySelector('#step1-next').addEventListener('click', () => {
    container.querySelector('#step-1').style.display = 'none'
    container.querySelector('#step-2').style.display = 'block'
    container.querySelector('#dot-1').classList.remove('active')
    container.querySelector('#dot-2').classList.add('active')
    setTimeout(() => container.querySelector('#biz-name').focus(), 100)
  })

  // Назад
  container.querySelector('#step2-back').addEventListener('click', () => {
    container.querySelector('#step-2').style.display = 'none'
    container.querySelector('#step-1').style.display = 'block'
    container.querySelector('#dot-2').classList.remove('active')
    container.querySelector('#dot-1').classList.add('active')
  })

  // Зберегти
  container.querySelector('#setup-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const errorBox     = container.querySelector('#setup-error')
    const businessName = container.querySelector('#biz-name').value.trim()

    if (!businessName) {
      errorBox.textContent = "Введіть назву бізнесу або ваше ім'я"
      errorBox.style.display = 'flex'
      return
    }

    const btn = container.querySelector('#step2-submit')
    btn.disabled = true
    btn.innerHTML = '<div class="spinner"></div> Зберігаємо...'

    try {
      await setDoc(doc(db, 'users', user.uid), {
        profession:     selectedProfession,
        businessName,
        phone:          container.querySelector('#biz-phone').value.trim() || null,
        city:           container.querySelector('#biz-city').value.trim()  || null,
        website:        container.querySelector('#biz-site').value.trim()  || null,
        onboardingDone: true,
        updatedAt:      serverTimestamp(),
      }, { merge: true })

      // Оновлюємо профіль і sidebar
      const { getUserProfile } = await import('../../services/auth.js')
      const newProfile = await getUserProfile(user.uid)
      
      // Створюємо sidebar якщо його немає
      let sidebar = document.getElementById('sidebar')
      if (!sidebar) {
        sidebar = document.createElement('div')
        sidebar.id = 'sidebar'
        document.getElementById('app').prepend(sidebar)
      }
      
      // Рендеримо навігацію
      const { renderNavigation } = await import('../../components/navigation.js')
      renderNavigation(sidebar, newProfile)

      // Переходимо на дашборд
      renderDashboard(container, newProfile)

    } catch (err) {
      console.error(err)
      errorBox.textContent = 'Помилка збереження. Спробуйте ще раз'
      errorBox.style.display = 'flex'
      btn.disabled = false
      btn.innerHTML = 'Розпочати роботу 🚀'
    }
  })
}

// ═══════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════
function renderDashboard(container, profile) {
  injectStyles()
  const config = getProfessionConfig(profile?.profession)
  const name   = profile?.name?.split(' ')[0] || 'Користувач'

  container.innerHTML = `
    <div class="dashboard-page">
      <div class="dashboard-header">
        <div>
          <h1 class="dashboard-title">${getGreeting()}, ${name} ${config.icon}</h1>
          <p class="dashboard-subtitle">${profile?.businessName || 'Мій бізнес'} · ${config.label}</p>
        </div>
        <div class="dashboard-header-actions">
          ${config.quickActions.map(a => `
            <button class="btn btn-secondary quick-action" data-route="${actionToRoute(a.action)}">
              ${a.icon} ${a.label}
            </button>
          `).join('')}
        </div>
      </div>

      <div class="widgets-grid stagger-children">
        ${config.dashboardWidgets.map(id => {
          const w = WIDGETS[id]
          if (!w) return ''
          return `
            <div class="widget-card">
              <div class="widget-header">
                <span class="widget-icon">${w.icon}</span>
                <span class="widget-title">${w.title}</span>
              </div>
              <div class="widget-body">${w.body()}</div>
            </div>
          `
        }).join('')}
      </div>

      <div class="quick-start">
        <div class="quick-start-header">
          <h2>🚀 Швидкий старт</h2>
          <span class="quick-start-sub">Додайте перший запис щоб почати</span>
        </div>
        <div class="quick-start-cards">
          <div class="qs-card" data-route="clients">
            <div class="qs-icon">👤</div>
            <div class="qs-title">Додати клієнта</div>
            <div class="qs-desc">Введіть контактні дані першого клієнта</div>
          </div>
          ${config.modules.includes('projects') ? `
          <div class="qs-card" data-route="projects">
            <div class="qs-icon">📁</div>
            <div class="qs-title">Створити проект</div>
            <div class="qs-desc">Додайте перший проект та налаштуйте таймер</div>
          </div>` : ''}
          ${config.modules.includes('invoices') ? `
          <div class="qs-card" data-route="invoices">
            <div class="qs-icon">📄</div>
            <div class="qs-title">Виставити рахунок</div>
            <div class="qs-desc">Створіть та відправте перший рахунок</div>
          </div>` : ''}
          ${config.modules.includes('appointments') ? `
          <div class="qs-card" data-route="appointments">
            <div class="qs-icon">📅</div>
            <div class="qs-title">Записати клієнта</div>
            <div class="qs-desc">Додайте перший запис у розклад</div>
          </div>` : ''}
        </div>
      </div>
    </div>
  `

  container.querySelectorAll('.quick-action, .qs-card').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.route))
  })
}

// ── Helpers ───────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Доброго ранку'
  if (h < 17) return 'Доброго дня'
  if (h < 21) return 'Доброго вечора'
  return 'Добраніч'
}

function actionToRoute(action) {
  const map = { 'new-client':'clients','new-invoice':'invoices','start-timer':'projects','new-transaction':'finances','new-post':'content-plan','new-appointment':'appointments' }
  return map[action] || 'dashboard'
}

function injectStyles() {
  if (document.getElementById('dashboard-extra-styles')) return
  const style = document.createElement('style')
  style.id = 'dashboard-extra-styles'
  style.textContent = `
    .setup-page { padding:40px 36px; max-width:700px; margin:0 auto; }
    .setup-steps { display:flex; align-items:center; margin-bottom:40px; }
    .setup-step { display:flex; align-items:center; gap:8px; font-size:13px; font-weight:500; color:var(--text-muted); transition:color .2s; }
    .setup-step.active { color:var(--text-primary); }
    .setup-step.active .step-dot { background:var(--accent-blue); border-color:var(--accent-blue); color:#fff; }
    .step-dot { width:28px; height:28px; border-radius:50%; border:2px solid var(--border); display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; color:var(--text-muted); transition:all .2s; }
    .setup-step-line { flex:1; height:1px; background:var(--border); margin:0 12px; }
    .setup-header { text-align:center; margin-bottom:32px; }
    .setup-title { font-family:var(--font-display); font-size:30px; font-weight:800; letter-spacing:-0.02em; margin-bottom:8px; }
    .setup-subtitle { font-size:15px; color:var(--text-secondary); }
    .setup-footer { display:flex; justify-content:center; margin-top:28px; }
    .setup-footer .btn { min-width:180px; height:46px; font-size:15px; }
    .setup-form-wrap { max-width:480px; margin:0 auto; }
    .profession-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:12px; }
    .profession-card { background:var(--bg-secondary); border:2px solid var(--border); border-radius:var(--radius-lg); padding:18px; cursor:pointer; transition:all .2s; display:flex; gap:12px; align-items:center; position:relative; }
    .profession-card:hover { border-color:var(--prof-color); transform:translateY(-2px); box-shadow:0 8px 24px rgba(0,0,0,.3); }
    .profession-card.selected { border-color:var(--prof-color); background:color-mix(in srgb,var(--prof-color) 8%,var(--bg-secondary)); }
    .prof-card-icon { font-size:28px; flex-shrink:0; }
    .prof-card-title { font-family:var(--font-display); font-size:15px; font-weight:700; margin-bottom:2px; }
    .prof-card-desc { font-size:11px; color:var(--text-secondary); }
    .prof-card-check { position:absolute; top:10px; right:10px; width:20px; height:20px; border-radius:50%; background:var(--prof-color); color:#fff; font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center; opacity:0; transform:scale(.5); transition:all .2s cubic-bezier(.34,1.56,.64,1); }
    .profession-card.selected .prof-card-check { opacity:1; transform:scale(1); }
    .qs-card { cursor:pointer; }
    .qs-card:hover .qs-title { color:var(--accent-blue); }

    /* Worker dashboard */
    .worker-welcome {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      min-height: calc(100vh - 80px); padding: 40px; text-align: center;
    }
    .worker-welcome-icon  { font-size: 64px; margin-bottom: 20px; }
    .worker-welcome-title { font-family: var(--font-display); font-size: 32px; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 14px; }
    .worker-welcome-sub   { font-size: 15px; color: var(--text-secondary); line-height: 1.6; max-width: 420px; margin-bottom: 28px; }
    .worker-join-btn      { padding: 14px 36px; font-size: 16px; margin-bottom: 16px; }
    .worker-welcome-hint  { font-size: 12px; color: var(--text-muted); }

    .worker-dash         { padding: 32px 36px; max-width: 800px; }
    .worker-dash-header  { margin-bottom: 28px; }
    .worker-dash-header h1 { font-family: var(--font-display); font-size: 28px; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 4px; }
    .worker-dash-role    { font-size: 14px; color: var(--text-secondary); }
    .worker-modules-title { font-family: var(--font-display); font-size: 14px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 14px; }
    .worker-modules-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px; }
    .worker-module-card  {
      background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-lg);
      padding: 20px 16px; cursor: pointer; text-align: center; transition: all .2s;
    }
    .worker-module-card:hover { border-color: var(--accent-blue); transform: translateY(-2px); box-shadow: var(--shadow-sm); }
    .worker-module-icon  { font-size: 28px; margin-bottom: 10px; }
    .worker-module-label { font-size: 13px; font-weight: 600; }
  `
  document.head.appendChild(style)
}