// src/renderer/pages/dashboard/index.js
import { getCurrentUser, getUserProfile, getActivePathSegments } from '../../services/auth.js'
import { getProfessionConfig } from '../../../core/profession-config.js'
import { db } from '../../services/firebase.js'
import { collection, getDocs, query, orderBy, limit, where } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
import { navigate } from '../../../core/router.js'

export async function render(container) {
  const user    = getCurrentUser()
  const profile = await getUserProfile(user.uid)

  if (profile?.accountType === 'worker') {
    renderWorkerDashboard(container, profile)
    return
  }

  if (!profile?.profession && !profile?.onboardingDone) {
    navigate('choose-profession')
    return
  }

  await renderDashboard(container, profile, user)
}

// ═══════════════════════════════════════════════════════════
// WORKER DASHBOARD
// ═══════════════════════════════════════════════════════════
function renderWorkerDashboard(container, profile) {
  injectStyles()
  const name = profile?.name?.split(' ')[0] || 'Користувач'

  if (!profile?.workspaceId) {
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
// MAIN DASHBOARD
// ═══════════════════════════════════════════════════════════
async function renderDashboard(container, profile, user) {
  injectStyles()
  const config = getProfessionConfig(profile?.profession)
  const name   = profile?.name?.split(' ')[0] || 'Користувач'
  const base   = getActivePathSegments(user.uid)

  // Skeleton
  container.innerHTML = `
    <div class="db-page">
      <div class="db-header">
        <div class="db-header-left">
          <div class="db-greeting">${getGreeting()}, ${name} ${config.icon}</div>
          <div class="db-meta">
            <span class="db-biz">${profile?.businessName || 'Мій бізнес'}</span>
            <span class="db-sep">·</span>
            <span class="db-prof">${config.label}</span>
            <span class="db-sep">·</span>
            <span class="db-date">${getTodayLabel()}</span>
          </div>
        </div>
        <div class="db-quick-actions" id="db-quick-actions">
          ${config.quickActions.map(a => `
            <button class="db-qa-btn" data-route="${actionToRoute(a.action)}">
              ${a.icon} ${a.label}
            </button>
          `).join('')}
        </div>
      </div>

      <!-- KPI row -->
      <div class="db-kpi-row" id="db-kpi-row">
        ${[0,1,2,3].map(() => `<div class="db-kpi-card db-kpi-loading"><div class="db-kpi-shimmer"></div></div>`).join('')}
      </div>

      <!-- Two-col body -->
      <div class="db-body">
        <div class="db-col-main">
          <!-- Recent clients -->
          <div class="db-section" id="db-recent-clients">
            <div class="db-section-header">
              <span class="db-section-title">👥 Останні клієнти</span>
              <button class="db-section-link" data-route="clients">Всі →</button>
            </div>
            <div class="db-section-body db-loading-rows">
              ${[0,1,2].map(() => `<div class="db-row-shimmer"></div>`).join('')}
            </div>
          </div>

          <!-- Recent invoices (if has module) -->
          ${config.modules.includes('invoices') ? `
          <div class="db-section" id="db-recent-invoices">
            <div class="db-section-header">
              <span class="db-section-title">📄 Останні рахунки</span>
              <button class="db-section-link" data-route="invoices">Всі →</button>
            </div>
            <div class="db-section-body db-loading-rows">
              ${[0,1,2].map(() => `<div class="db-row-shimmer"></div>`).join('')}
            </div>
          </div>` : ''}

          <!-- Content plan (SMM) -->
          ${config.modules.includes('content-plan') ? `
          <div class="db-section" id="db-recent-posts">
            <div class="db-section-header">
              <span class="db-section-title">📱 Контент-план</span>
              <button class="db-section-link" data-route="content-plan">Всі →</button>
            </div>
            <div class="db-section-body db-loading-rows">
              ${[0,1].map(() => `<div class="db-row-shimmer"></div>`).join('')}
            </div>
          </div>` : ''}
        </div>

        <div class="db-col-side">
          <!-- Tasks -->
          <div class="db-section" id="db-tasks-section">
            <div class="db-section-header">
              <span class="db-section-title">✅ Задачі</span>
              <button class="db-section-link" data-route="tasks">Всі →</button>
            </div>
            <div class="db-section-body" id="db-tasks-body">
              <div class="db-loading-rows">${[0,1,2,3].map(() => `<div class="db-row-shimmer"></div>`).join('')}</div>
            </div>
          </div>

          <!-- Active projects (only if has module) -->
          ${config.modules.includes('projects') ? `
          <div class="db-section" id="db-projects-section">
            <div class="db-section-header">
              <span class="db-section-title">📁 Активні проекти</span>
              <button class="db-section-link" data-route="projects">Всі →</button>
            </div>
            <div class="db-section-body" id="db-projects-body">
              <div class="db-loading-rows">${[0,1].map(() => `<div class="db-row-shimmer"></div>`).join('')}</div>
            </div>
          </div>` : ''}

          <!-- Notes -->
          ${config.modules.includes('notes') ? `
          <div class="db-section" id="db-notes-section">
            <div class="db-section-header">
              <span class="db-section-title">🗒 Нотатки</span>
              <button class="db-section-link" data-route="notes">Всі →</button>
            </div>
            <div class="db-section-body" id="db-notes-body">
              <div class="db-loading-rows">${[0,1,2].map(() => `<div class="db-row-shimmer"></div>`).join('')}</div>
            </div>
          </div>` : ''}

          <!-- Quick nav -->
          <div class="db-section db-quick-nav">
            <div class="db-section-header"><span class="db-section-title">⚡ Швидкий перехід</span></div>
            <div class="db-qnav-grid">
              ${config.modules.filter(m => m !== 'dashboard').map(m => {
                const meta = MODULE_NAV[m]
                if (!meta) return ''
                return `<button class="db-qnav-btn" data-route="${m}">${meta.icon}<span>${meta.label}</span></button>`
              }).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>
  `

  // Quick action buttons
  container.querySelectorAll('.db-qa-btn, .db-section-link, .db-qnav-btn').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.route))
  })

  // Load real data in parallel
  const [kpiData, clients, invoices, tasks, projects, posts, notes] = await Promise.allSettled([
    loadKPI(base, config),
    loadRecent(base, 'clients', 4),
    config.modules.includes('invoices')      ? loadRecent(base, 'invoices', 4)      : Promise.resolve([]),
    loadRecent(base, 'tasks', 8),
    config.modules.includes('projects')      ? loadRecentProjects(base)             : Promise.resolve([]),
    config.modules.includes('content-plan')  ? loadRecent(base, 'content-plan', 3) : Promise.resolve([]),
    config.modules.includes('notes')         ? loadRecent(base, 'notes', 4)         : Promise.resolve([]),
  ])

  renderKPI(container, kpiData.value || {}, profile?.profession)
  renderClientsList(container, clients.value || [])

  if (config.modules.includes('invoices'))
    renderInvoicesList(container, invoices.value || [])

  renderTasksList(container, tasks.value || [])

  if (config.modules.includes('projects'))
    renderProjectsList(container, projects.value || [])

  if (config.modules.includes('content-plan'))
    renderPostsList(container, posts.value || [])

  if (config.modules.includes('notes'))
    renderNotesList(container, notes.value || [])
}

// ═══════════════════════════════════════════════════════════
// DATA LOADERS
// ═══════════════════════════════════════════════════════════
async function loadKPI(base, config) {
  const kpi = {}
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0)

  // Helper: get all docs from a collection (client-side filtering avoids composite indexes)
  const getAll = async (coll) => {
    try {
      const snap = await getDocs(collection(db, ...base, coll))
      return snap.docs.map(d => d.data())
    } catch { return [] }
  }

  // Clients
  const allClients = await getAll('clients')
  kpi.totalClients = allClients.length
  kpi.newClients = allClients.filter(c => {
    const d = c.createdAt?.toDate?.() || (c.createdAt ? new Date(c.createdAt) : null)
    return d && d >= monthStart
  }).length

  // Invoices
  if (config.modules.includes('invoices')) {
    const allInvoices = await getAll('invoices')
    kpi.unpaidCount = allInvoices.filter(i => i.status === 'unpaid').length
    kpi.monthlyIncome = allInvoices
      .filter(i => {
        if (i.status !== 'paid') return false
        const d = i.createdAt?.toDate?.() || (i.createdAt ? new Date(i.createdAt) : null)
        return d && d >= monthStart
      })
      .reduce((s, i) => s + (Number(i.amount) || 0), 0)
  }

  // Tasks (open)
  if (config.modules.includes('tasks')) {
    const allTasks = await getAll('tasks')
    kpi.activeTasks = allTasks.filter(t => t.status !== 'done').length
  }

  // Projects (active)
  if (config.modules.includes('projects')) {
    const allProj = await getAll('projects')
    kpi.activeProjects = allProj.filter(p => p.status === 'active').length
  }

  // Accounts
  if (config.modules.includes('accounts')) {
    const allAcc = await getAll('accounts')
    kpi.totalAccounts = allAcc.length
  }

  // Content plan (planned posts)
  if (config.modules.includes('content-plan')) {
    const allPosts = await getAll('content-plan')
    kpi.plannedPosts = allPosts.filter(p => p.status === 'planned').length
  }

  return kpi
}

async function loadRecent(base, coll, n = 5) {
  try {
    const snap = await getDocs(query(collection(db, ...base, coll), orderBy('createdAt', 'desc'), limit(n)))
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch { return [] }
}

async function loadRecentProjects(base) {
  try {
    const snap = await getDocs(
      query(collection(db, ...base, 'projects'), where('status', '==', 'active'), orderBy('createdAt', 'desc'), limit(4))
    )
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch { return [] }
}

// ═══════════════════════════════════════════════════════════
// RENDERERS
// ═══════════════════════════════════════════════════════════
function renderKPI(container, kpi, profession) {
  const cards = buildKPICards(kpi, profession)
  container.querySelector('#db-kpi-row').innerHTML = cards.map(c => `
    <div class="db-kpi-card" style="--kc:${c.color}">
      <div class="db-kpi-icon">${c.icon}</div>
      <div class="db-kpi-value">${c.value}</div>
      <div class="db-kpi-label">${c.label}</div>
      ${c.sub ? `<div class="db-kpi-sub">${c.sub}</div>` : ''}
    </div>
  `).join('')
}

const KPI_SETS = {
  freelancer: (kpi) => [
    { icon: '👥', label: 'Всього клієнтів',     value: kpi.totalClients ?? '—', color: '#4F8EF7', sub: `+${kpi.newClients ?? 0} цього місяця` },
    { icon: '💰', label: 'Дохід цього місяця',  value: `₴${formatNum(kpi.monthlyIncome ?? 0)}`, color: '#34D399' },
    { icon: '💸', label: 'Неоплачені рахунки',  value: kpi.unpaidCount ?? '—',  color: (kpi.unpaidCount || 0) > 0 ? '#F59E0B' : '#34D399' },
    { icon: '✅', label: 'Відкриті задачі',      value: kpi.activeTasks ?? '—',  color: '#A78BFA' },
  ],
  accountant: (kpi) => [
    { icon: '👥', label: 'Клієнти',              value: kpi.totalClients ?? '—', color: '#4F8EF7', sub: `+${kpi.newClients ?? 0} цього місяця` },
    { icon: '💰', label: 'Дохід цього місяця',  value: `₴${formatNum(kpi.monthlyIncome ?? 0)}`, color: '#34D399' },
    { icon: '💸', label: 'Неоплачені рахунки',  value: kpi.unpaidCount ?? '—',  color: (kpi.unpaidCount || 0) > 0 ? '#F59E0B' : '#34D399' },
    { icon: '✨', label: 'Нових цього місяця',   value: kpi.newClients ?? '—',   color: '#38BDF8' },
  ],
  smm: (kpi) => [
    { icon: '👥', label: 'Клієнти',              value: kpi.totalClients ?? '—', color: '#4F8EF7', sub: `+${kpi.newClients ?? 0} цього місяця` },
    { icon: '🔗', label: 'Акаунти',              value: kpi.totalAccounts ?? '—', color: '#F472B6' },
    { icon: '📝', label: 'Заплановано постів',   value: kpi.plannedPosts ?? '—', color: '#A78BFA' },
    { icon: '✅', label: 'Відкриті задачі',      value: kpi.activeTasks ?? '—',  color: '#34D399' },
  ],
  beauty: (kpi) => [
    { icon: '👥', label: 'Клієнти',              value: kpi.totalClients ?? '—', color: '#F472B6', sub: `+${kpi.newClients ?? 0} цього місяця` },
    { icon: '💰', label: 'Дохід цього місяця',  value: `₴${formatNum(kpi.monthlyIncome ?? 0)}`, color: '#34D399' },
    { icon: '✨', label: 'Нових цього місяця',   value: kpi.newClients ?? '—',   color: '#38BDF8' },
    { icon: '✅', label: 'Відкриті задачі',      value: kpi.activeTasks ?? '—',  color: '#A78BFA' },
  ],
}

function buildKPICards(kpi, profession) {
  const set = KPI_SETS[profession] || KPI_SETS.freelancer
  return set(kpi)
}

function renderClientsList(container, clients) {
  const el = container.querySelector('#db-recent-clients .db-section-body')
  if (!el) return
  if (!clients.length) {
    el.innerHTML = `<div class="db-empty-row">Клієнтів ще немає — <button class="db-inline-link" data-route="clients">додати першого →</button></div>`
    el.querySelector('.db-inline-link')?.addEventListener('click', () => navigate('clients'))
    return
  }
  el.innerHTML = clients.map(c => `
    <div class="db-item-row" data-route="clients">
      <div class="db-item-avatar" style="background:${strColor(c.name || '?')}">${(c.name||'?')[0].toUpperCase()}</div>
      <div class="db-item-info">
        <div class="db-item-name">${c.name || '—'}</div>
        <div class="db-item-meta">${c.phone || c.email || c.source || ''}</div>
      </div>
      <div class="db-item-badge ${c.status === 'active' ? 'badge-green' : c.status === 'lead' ? 'badge-yellow' : 'badge-grey'}">
        ${c.status === 'active' ? 'Активний' : c.status === 'lead' ? 'Лід' : c.status || ''}
      </div>
    </div>
  `).join('')
  el.querySelectorAll('.db-item-row').forEach(r => r.addEventListener('click', () => navigate(r.dataset.route)))
}

function renderInvoicesList(container, invoices) {
  const el = container.querySelector('#db-recent-invoices .db-section-body')
  if (!el) return
  if (!invoices.length) {
    el.innerHTML = `<div class="db-empty-row">Рахунків ще немає</div>`
    return
  }
  el.innerHTML = invoices.map(inv => `
    <div class="db-item-row" data-route="invoices">
      <div class="db-item-avatar" style="background:${inv.status === 'paid' ? '#34D399' : '#F59E0B'}">₴</div>
      <div class="db-item-info">
        <div class="db-item-name">${inv.clientName || inv.client || '—'}</div>
        <div class="db-item-meta">${inv.description || inv.note || ''}</div>
      </div>
      <div class="db-item-amount ${inv.status === 'paid' ? 'amount-green' : 'amount-yellow'}">
        ₴${formatNum(inv.amount || 0)}
      </div>
    </div>
  `).join('')
  el.querySelectorAll('.db-item-row').forEach(r => r.addEventListener('click', () => navigate(r.dataset.route)))
}

function renderTasksList(container, tasks) {
  const el = container.querySelector('#db-tasks-body')
  if (!el) return
  const open = tasks.filter(t => t.status !== 'done').slice(0, 8)
  if (!open.length) {
    el.innerHTML = `<div class="db-empty-row">Немає відкритих задач 🎉</div>`
    return
  }
  const PRI = { high: { color: '#EF4444', label: '!!!' }, medium: { color: '#F59E0B', label: '!!' }, low: { color: '#34D399', label: '!' } }
  el.innerHTML = open.map(t => {
    const p = PRI[t.priority] || { color: '#6B7280', label: '' }
    return `
      <div class="db-task-row">
        <div class="db-task-dot" style="background:${p.color}"></div>
        <div class="db-task-title">${t.title || '—'}</div>
        ${t.deadline ? `<div class="db-task-date">${fmtDate(t.deadline)}</div>` : ''}
      </div>
    `
  }).join('')
}

function renderProjectsList(container, projects) {
  const section = container.querySelector('#db-projects-section')
  const el = container.querySelector('#db-projects-body')
  if (!el) return
  if (!projects.length) {
    if (section) section.style.display = 'none'
    return
  }
  if (section) section.style.display = ''
  el.innerHTML = projects.map(p => `
    <div class="db-proj-row" data-route="projects">
      <div class="db-proj-info">
        <div class="db-item-name">${p.name || '—'}</div>
        <div class="db-proj-bar-wrap">
          <div class="db-proj-bar" style="width:${p.progress || 0}%"></div>
        </div>
      </div>
      <div class="db-proj-pct">${p.progress || 0}%</div>
    </div>
  `).join('')
  el.querySelectorAll('.db-proj-row').forEach(r => r.addEventListener('click', () => navigate(r.dataset.route)))
}

function renderPostsList(container, posts) {
  const el = container.querySelector('#db-recent-posts .db-section-body')
  if (!el) return
  if (!posts.length) {
    el.innerHTML = `<div class="db-empty-row">Постів ще немає</div>`
    return
  }
  const ST = { planned: { label: 'Заплановано', color: '#4F8EF7' }, published: { label: 'Опубліковано', color: '#34D399' }, draft: { label: 'Чернетка', color: '#6B7280' } }
  el.innerHTML = posts.map(p => {
    const s = ST[p.status] || { label: p.status, color: '#6B7280' }
    return `
      <div class="db-item-row" data-route="content-plan">
        <div class="db-item-avatar" style="background:${s.color}">📝</div>
        <div class="db-item-info">
          <div class="db-item-name">${p.title || p.text?.slice(0,40) || '—'}</div>
          <div class="db-item-meta">${p.platform || ''} ${p.scheduledDate ? '· ' + fmtDate(p.scheduledDate) : ''}</div>
        </div>
        <div class="db-item-badge" style="background:color-mix(in srgb,${s.color} 15%,transparent);color:${s.color}">${s.label}</div>
      </div>
    `
  }).join('')
  el.querySelectorAll('.db-item-row').forEach(r => r.addEventListener('click', () => navigate(r.dataset.route)))
}

function renderNotesList(container, notes) {
  const el = container.querySelector('#db-notes-body')
  if (!el) return
  if (!notes.length) {
    el.innerHTML = `<div class="db-empty-row">Нотаток ще немає</div>`
    return
  }
  el.innerHTML = notes.map(n => `
    <div class="db-note-row" data-route="notes">
      <div class="db-note-text">${(n.title || n.text || n.content || '').slice(0, 80)}</div>
      ${n.createdAt ? `<div class="db-note-date">${fmtDate(n.createdAt)}</div>` : ''}
    </div>
  `).join('')
  el.querySelectorAll('.db-note-row').forEach(r => r.addEventListener('click', () => navigate(r.dataset.route)))
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════
const MODULE_NAV = {
  clients:      { icon: '👥', label: 'Клієнти' },
  projects:     { icon: '📁', label: 'Проекти' },
  invoices:     { icon: '📄', label: 'Рахунки' },
  contracts:    { icon: '📝', label: 'Договори' },
  tasks:        { icon: '✅', label: 'Задачі' },
  timer:        { icon: '⏱', label: 'Таймер' },
  finances:     { icon: '💰', label: 'Фінанси' },
  'tax-calendar': { icon: '📅', label: 'Податки' },
  appointments: { icon: '🗓', label: 'Розклад' },
  services:     { icon: '💅', label: 'Послуги' },
  'content-plan': { icon: '📱', label: 'Контент' },
  accounts:     { icon: '🔗', label: 'Акаунти' },
  passwords:    { icon: '🔑', label: 'Паролі' },
  notes:        { icon: '🗒', label: 'Нотатки' },
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Доброго ранку'
  if (h < 17) return 'Доброго дня'
  if (h < 21) return 'Доброго вечора'
  return 'Добраніч'
}

function getTodayLabel() {
  return new Date().toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' })
}

function actionToRoute(action) {
  const map = { 'new-client':'clients','new-invoice':'invoices','start-timer':'projects','new-transaction':'finances','new-post':'content-plan','new-appointment':'appointments' }
  return map[action] || 'dashboard'
}

function formatNum(n) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.0','') + 'k'
  return String(Math.round(n))
}

function fmtDate(val) {
  if (!val) return ''
  try {
    const d = val?.toDate ? val.toDate() : new Date(val)
    return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })
  } catch { return '' }
}

function strColor(str) {
  const COLORS = ['#4F8EF7','#34D399','#A78BFA','#F59E0B','#F472B6','#38BDF8','#FB923C','#6EE7B7']
  let h = 0
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h)
  return COLORS[Math.abs(h) % COLORS.length]
}

// ═══════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════
function injectStyles() {
  if (document.getElementById('dashboard-styles-v2')) return
  const style = document.createElement('style')
  style.id = 'dashboard-styles-v2'
  style.textContent = `

  /* ── Page ── */
  .db-page { padding: 28px 32px; max-width: 1200px; display: flex; flex-direction: column; gap: 24px; }

  /* ── Header ── */
  .db-header {
    display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
  }
  .db-greeting {
    font-family: var(--font-display); font-size: 26px; font-weight: 800;
    letter-spacing: -0.02em; margin-bottom: 6px;
  }
  .db-meta { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-secondary); }
  .db-sep  { color: var(--text-muted); }
  .db-biz  { font-weight: 600; color: var(--text-primary); }
  .db-date { text-transform: capitalize; }

  .db-quick-actions { display: flex; gap: 8px; flex-wrap: wrap; padding-top: 4px; }
  .db-qa-btn {
    background: var(--bg-secondary); border: 1px solid var(--border);
    border-radius: var(--radius-md); padding: 8px 14px; font-size: 13px; font-weight: 500;
    cursor: pointer; color: var(--text-primary); transition: all .15s;
  }
  .db-qa-btn:hover { border-color: var(--accent-blue); color: var(--accent-blue); transform: translateY(-1px); }

  /* ── KPI row ── */
  .db-kpi-row {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 14px;
  }
  .db-kpi-card {
    background: var(--bg-secondary); border: 1px solid var(--border);
    border-radius: var(--radius-lg); padding: 20px 22px;
    border-left: 3px solid var(--kc, var(--accent-blue));
    transition: transform .15s, box-shadow .15s;
  }
  .db-kpi-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,.2); }
  .db-kpi-loading { min-height: 90px; }
  .db-kpi-shimmer {
    height: 100%; background: linear-gradient(90deg, var(--bg-tertiary) 25%, var(--bg-elevated) 50%, var(--bg-tertiary) 75%);
    background-size: 200% 100%; animation: db-shimmer 1.4s infinite; border-radius: var(--radius-sm);
  }
  @keyframes db-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
  .db-kpi-icon  { font-size: 20px; margin-bottom: 10px; }
  .db-kpi-value {
    font-family: var(--font-display); font-size: 30px; font-weight: 800;
    letter-spacing: -0.03em; color: var(--kc, var(--text-primary)); line-height: 1;
    margin-bottom: 4px;
  }
  .db-kpi-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--text-muted); }
  .db-kpi-sub   { font-size: 11px; color: var(--text-secondary); margin-top: 4px; }

  /* ── Body two-col ── */
  .db-body { display: grid; grid-template-columns: 1fr 340px; gap: 18px; align-items: start; }
  @media (max-width: 900px) { .db-body { grid-template-columns: 1fr; } }

  .db-col-main, .db-col-side { display: flex; flex-direction: column; gap: 16px; }

  /* ── Section card ── */
  .db-section {
    background: var(--bg-secondary); border: 1px solid var(--border);
    border-radius: var(--radius-lg); overflow: hidden;
  }
  .db-section-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 18px; border-bottom: 1px solid var(--border);
  }
  .db-section-title { font-size: 13px; font-weight: 700; }
  .db-section-link  {
    font-size: 12px; color: var(--accent-blue); background: none; border: none;
    cursor: pointer; padding: 0; font-weight: 500;
  }
  .db-section-link:hover { text-decoration: underline; }
  .db-section-body  { padding: 8px 0; }

  /* ── Loading shimmers ── */
  .db-loading-rows { padding: 8px 18px; display: flex; flex-direction: column; gap: 10px; }
  .db-row-shimmer {
    height: 36px; background: linear-gradient(90deg, var(--bg-tertiary) 25%, var(--bg-elevated) 50%, var(--bg-tertiary) 75%);
    background-size: 200% 100%; animation: db-shimmer 1.4s infinite; border-radius: var(--radius-sm);
  }

  /* ── Item rows ── */
  .db-item-row {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 18px; cursor: pointer; transition: background .15s;
  }
  .db-item-row:hover { background: var(--bg-tertiary); }
  .db-item-avatar {
    width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px; font-weight: 700; color: #fff;
  }
  .db-item-info { flex: 1; min-width: 0; }
  .db-item-name { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .db-item-meta { font-size: 11px; color: var(--text-muted); margin-top: 1px; }

  .db-item-badge {
    font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: var(--radius-xs);
    text-transform: uppercase; letter-spacing: .04em; white-space: nowrap;
  }
  .badge-green  { background: rgba(52,211,153,.15); color: #34D399; }
  .badge-yellow { background: rgba(245,158,11,.15);  color: #F59E0B; }
  .badge-grey   { background: rgba(107,114,128,.15); color: #9CA3AF; }

  .db-item-amount { font-size: 14px; font-weight: 700; white-space: nowrap; }
  .amount-green { color: #34D399; }
  .amount-yellow { color: #F59E0B; }

  /* ── Task rows ── */
  .db-task-row {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 18px; transition: background .15s;
  }
  .db-task-row:hover { background: var(--bg-tertiary); }
  .db-task-dot  { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .db-task-title { flex: 1; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .db-task-date { font-size: 11px; color: var(--text-muted); white-space: nowrap; }

  /* ── Project rows ── */
  .db-proj-row {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 18px; cursor: pointer; transition: background .15s;
  }
  .db-proj-row:hover { background: var(--bg-tertiary); }
  .db-proj-info { flex: 1; min-width: 0; }
  .db-proj-bar-wrap {
    height: 4px; background: var(--bg-tertiary); border-radius: 2px; margin-top: 5px; overflow: hidden;
  }
  .db-proj-bar { height: 100%; background: linear-gradient(90deg, #4F8EF7, #34D399); border-radius: 2px; transition: width .4s; }
  .db-proj-pct { font-size: 12px; font-weight: 700; color: var(--text-secondary); white-space: nowrap; }

  /* ── Empty row ── */
  .db-empty-row {
    padding: 16px 18px; font-size: 13px; color: var(--text-muted); text-align: center;
  }
  .db-inline-link { background: none; border: none; color: var(--accent-blue); cursor: pointer; font-size: 13px; padding: 0; }

  /* ── Notes rows ── */
  .db-note-row {
    display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;
    padding: 10px 18px; cursor: pointer; transition: background .15s;
  }
  .db-note-row:hover { background: var(--bg-tertiary); }
  .db-note-text { font-size: 13px; color: var(--text-secondary); line-height: 1.4; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .db-note-date { font-size: 11px; color: var(--text-muted); white-space: nowrap; flex-shrink: 0; }

  /* ── Quick nav ── */
  .db-quick-nav .db-section-header { border-bottom: 1px solid var(--border); }
  .db-qnav-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: 2px; padding: 8px;
  }
  .db-qnav-btn {
    display: flex; flex-direction: column; align-items: center; gap: 4px;
    padding: 10px 6px; background: none; border: none; cursor: pointer;
    border-radius: var(--radius-sm); transition: background .15s; font-size: 20px;
  }
  .db-qnav-btn span { font-size: 10px; font-weight: 600; color: var(--text-secondary); text-align: center; }
  .db-qnav-btn:hover { background: var(--bg-tertiary); }
  .db-qnav-btn:hover span { color: var(--text-primary); }

  /* ── Worker dashboard ── */
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
