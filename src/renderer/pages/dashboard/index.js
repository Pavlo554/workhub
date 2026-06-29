// src/renderer/pages/dashboard/index.js
import { getCurrentUser, getUserProfile, getActivePathSegments } from '../../services/auth.js'
import { getProfessionConfig } from '../../../core/profession-config.js'
import { db } from '../../services/firebase.js'
import { collection, getDocs, query, orderBy, limit, where, doc, getDoc, updateDoc, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
import { navigate } from '../../../core/router.js'
import { clearProfileCache } from '../../services/auth.js'
import { icon } from '../../utils/icons.js'

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
        <div class="worker-welcome-icon">${icon('team', 56)}</div>
        <h1 class="worker-welcome-title">${getGreeting()}, ${name}!</h1>
        <p class="worker-welcome-sub">
          Щоб почати роботу, вам потрібен код запрошення від вашого менеджера або власника бізнесу.
        </p>
        <button class="btn btn-primary worker-join-btn" id="go-join">
          ${icon('join', 16)} Ввести код запрошення
        </button>
        <div class="worker-welcome-hint">
          Зверніться до вашого керівника, він надішле вам 6-значний код
        </div>
      </div>
    `
    container.querySelector('#go-join').addEventListener('click', () => navigate('join'))
    return
  }

  const modules   = profile.workspaceModules || []
  const role      = profile.workspaceRole || 'Учасник'
  const wsName    = profile.workspaceName  || profile.businessName || 'Робочий простір'
  const initials  = (profile.name || name).split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const hasStats  = modules.some(m => ['tasks','projects','clients','invoices'].includes(m))
  const user      = getCurrentUser()

  container.innerHTML = `
    <div class="wdb-page">

      <!-- Hero -->
      <div class="wdb-hero">
        <div class="wdb-hero-glow"></div>
        <div class="wdb-hero-left">
          <div class="wdb-avatar">${initials}</div>
          <div class="wdb-hero-text">
            <div class="wdb-greeting">${getGreeting()}, ${name}!</div>
            <div class="wdb-hero-meta">
              <span class="wdb-role-pill">${role}</span>
              <span class="wdb-hero-dot">·</span>
              <span class="wdb-ws-name">${wsName}</span>
            </div>
          </div>
        </div>
        <div class="wdb-hero-date">
          <div class="wdb-date-weekday">${new Date().toLocaleDateString('uk-UA', { weekday: 'long' })}</div>
          <div class="wdb-date-num">${new Date().toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}</div>
        </div>
      </div>

      <!-- Company info + Leave -->
      <div class="wdb-two-col">

        <div class="wdb-company-card" id="wdb-company-card">
          <div class="wdb-company-label">Ваша компанія</div>
          <div class="wdb-company-body">
            <div class="wdb-company-avatar" id="wdb-owner-avatar">…</div>
            <div class="wdb-company-info">
              <div class="wdb-company-biz" id="wdb-owner-biz">
                <span class="wdb-shimmer-line" style="width:140px"></span>
              </div>
              <div class="wdb-company-owner" id="wdb-owner-name">
                <span class="wdb-shimmer-line" style="width:100px"></span>
              </div>
              <div class="wdb-company-email" id="wdb-owner-email"></div>
            </div>
          </div>
          <div class="wdb-company-meta">
            <div class="wdb-company-meta-row">
              <span class="wdb-meta-key">Ваша роль</span>
              <span class="wdb-meta-val wdb-role-pill-sm">${role}</span>
            </div>
            <div class="wdb-company-meta-row">
              <span class="wdb-meta-key">Модулів доступно</span>
              <span class="wdb-meta-val">${modules.filter(m => m !== 'dashboard').length}</span>
            </div>
          </div>
        </div>

        <div class="wdb-leave-card">
          <div class="wdb-leave-icon">${icon('logout', 22)}</div>
          <div class="wdb-leave-title">Покинути компанію</div>
          <div class="wdb-leave-desc">
            Ви більше не матимете доступу до даних і модулів цього воркспейсу.
          </div>
          <button class="wdb-leave-btn" id="wdb-leave-btn">
            Вийти з воркспейсу
          </button>
        </div>

      </div>

      <!-- Quick stats -->
      ${hasStats ? `
      <div class="wdb-stats-row">
        ${modules.includes('tasks') ? `
        <div class="wdb-stat-card" data-route="tasks" style="--sc:#A78BFA">
          <div class="wdb-stat-icon">${icon('tasks', 20)}</div>
          <div class="wdb-stat-val" id="wdb-task-count"><span class="wdb-stat-spin"></span></div>
          <div class="wdb-stat-label">Відкритих задач</div>
        </div>` : ''}
        ${modules.includes('projects') ? `
        <div class="wdb-stat-card" data-route="projects" style="--sc:#34D399">
          <div class="wdb-stat-icon">${icon('projects', 20)}</div>
          <div class="wdb-stat-val" id="wdb-proj-count"><span class="wdb-stat-spin"></span></div>
          <div class="wdb-stat-label">Активних проектів</div>
        </div>` : ''}
        ${modules.includes('clients') ? `
        <div class="wdb-stat-card" data-route="clients" style="--sc:#4F8EF7">
          <div class="wdb-stat-icon">${icon('clients', 20)}</div>
          <div class="wdb-stat-val" id="wdb-client-count"><span class="wdb-stat-spin"></span></div>
          <div class="wdb-stat-label">Клієнтів</div>
        </div>` : ''}
        ${modules.includes('invoices') ? `
        <div class="wdb-stat-card" data-route="invoices" style="--sc:#F59E0B">
          <div class="wdb-stat-icon">${icon('invoices', 20)}</div>
          <div class="wdb-stat-val" id="wdb-inv-count"><span class="wdb-stat-spin"></span></div>
          <div class="wdb-stat-label">Неоплачених</div>
        </div>` : ''}
      </div>` : ''}

      <!-- Modules grid -->
      <div class="wdb-mods-wrap">
        <div class="wdb-mods-label">Модулі</div>
        <div class="wdb-mods-grid">
          ${modules.filter(id => id !== 'dashboard').map(id => {
            const m = MODULE_NAV[id]
            if (!m) return ''
            return `
              <button class="wdb-mod-tile" data-route="${id}" style="--mc:${m.color || '#4F8EF7'}">
                <div class="wdb-mod-tile-icon">${icon(id, 18)}</div>
                <div class="wdb-mod-tile-label">${m.label}</div>
              </button>
            `
          }).join('')}
        </div>
      </div>

    </div>
  `

  container.querySelectorAll('[data-route]').forEach(el =>
    el.addEventListener('click', () => navigate(el.dataset.route))
  )

  // Leave workspace
  container.querySelector('#wdb-leave-btn')?.addEventListener('click', () => {
    showLeaveConfirm(user.uid, profile.workspaceId)
  })

  // Load owner profile
  loadOwnerProfile(profile.workspaceId).then(owner => {
    const bizEl    = container.querySelector('#wdb-owner-biz')
    const nameEl   = container.querySelector('#wdb-owner-name')
    const emailEl  = container.querySelector('#wdb-owner-email')
    const avatarEl = container.querySelector('#wdb-owner-avatar')
    if (bizEl)    bizEl.textContent    = owner.businessName || owner.name || 'Бізнес'
    if (nameEl)   nameEl.textContent   = owner.name ? `Власник: ${owner.name}` : ''
    if (emailEl)  emailEl.textContent  = owner.email || ''
    if (avatarEl) avatarEl.textContent = (owner.businessName || owner.name || '?')[0].toUpperCase()
  }).catch(() => {})

  // Backfill workspaceName on the profile if missing (e.g. accounts that
  // joined before this field started being saved at invite-accept time)
  if (!profile.workspaceName && profile.workspaceId) {
    getDoc(doc(db, 'workspaces', profile.workspaceId)).then(snap => {
      const wsName = snap.exists() ? snap.data().name : null
      if (!wsName) return
      updateDoc(doc(db, 'users', user.uid), { workspaceName: wsName }).catch(() => {})
      const wsEl = container.querySelector('.wdb-ws-name')
      if (wsEl) wsEl.textContent = wsName
    }).catch(() => {})
  }

  // Load stats async
  if (profile.workspaceId) {
    loadWorkerStats(['users', profile.workspaceId], modules).then(stats => {
      const set = (id, val) => { const el = container.querySelector(id); if (el) el.textContent = val ?? '—' }
      set('#wdb-task-count',   stats.openTasks)
      set('#wdb-proj-count',   stats.activeProjects)
      set('#wdb-client-count', stats.totalClients)
      set('#wdb-inv-count',    stats.unpaidInvoices)
    }).catch(() => {})
  }
}

async function loadOwnerProfile(workspaceId) {
  try {
    const snap = await getDoc(doc(db, 'users', workspaceId))
    return snap.exists() ? snap.data() : {}
  } catch { return {} }
}

function showLeaveConfirm(uid, workspaceId) {
  const overlay = document.createElement('div')
  overlay.className = 'wdb-confirm-overlay'
  overlay.innerHTML = `
    <div class="wdb-confirm-dialog">
      <div class="wdb-confirm-icon">${icon('logout', 28)}</div>
      <div class="wdb-confirm-title">Покинути воркспейс?</div>
      <div class="wdb-confirm-desc">
        Ви втратите доступ до всіх даних цього бізнесу.<br>
        Власник зможе знову запросити вас пізніше.
      </div>
      <div class="wdb-confirm-actions">
        <button class="wdb-confirm-cancel">Скасувати</button>
        <button class="wdb-confirm-ok">Так, вийти</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
  overlay.querySelector('.wdb-confirm-cancel').addEventListener('click', () => overlay.remove())
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
  overlay.querySelector('.wdb-confirm-ok').addEventListener('click', async () => {
    const btn = overlay.querySelector('.wdb-confirm-ok')
    btn.textContent = 'Виходимо…'
    btn.disabled = true
    try {
      await leaveWorkspace(uid, workspaceId)
      overlay.remove()
      navigate('dashboard')
    } catch (e) {
      btn.textContent = 'Помилка, спробуй ще'
      btn.disabled = false
    }
  })
}

async function leaveWorkspace(uid, workspaceId) {
  // Remove member doc from workspace
  await deleteDoc(doc(db, 'workspaces', workspaceId, 'members', uid))
  // Clear workspace fields from user profile
  await updateDoc(doc(db, 'users', uid), {
    accountType:      'owner',
    workspaceId:      null,
    workspaceRole:    null,
    workspaceModules: null,
    workspaceName:    null,
  })
  // Clear cache so dashboard re-reads fresh profile
  clearProfileCache()
}

async function loadWorkerStats(base, modules) {
  const stats = {}
  const getAll = async (coll) => {
    try {
      const snap = await getDocs(collection(db, ...base, coll))
      return snap.docs.map(d => d.data())
    } catch { return [] }
  }
  const [tasks, projects, clients, invoices] = await Promise.all([
    modules.includes('tasks')    ? getAll('tasks')    : Promise.resolve([]),
    modules.includes('projects') ? getAll('projects') : Promise.resolve([]),
    modules.includes('clients')  ? getAll('clients')  : Promise.resolve([]),
    modules.includes('invoices') ? getAll('invoices') : Promise.resolve([]),
  ])
  stats.openTasks      = tasks.filter(t => t.status !== 'done').length
  stats.activeProjects = projects.filter(p => p.status === 'active').length
  stats.totalClients   = clients.length
  stats.unpaidInvoices = invoices.filter(i => i.status === 'unpaid').length
  return stats
}

// ═══════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ═══════════════════════════════════════════════════════════
async function renderDashboard(container, profile, user) {
  injectStyles()
  const baseConfig = getProfessionConfig(profile?.profession)
  // Use selectedModules if set, otherwise profession defaults.
  // 'dashboard' alone isn't a usable selection — same fallback as navigation.js.
  const hasUsableSelection = arr => Array.isArray(arr) && arr.length > (arr.includes('dashboard') ? 1 : 0)
  const activeModules = profile?.activeBusiness && hasUsableSelection(profile?.activeBusinessModules)
    ? profile.activeBusinessModules
    : (hasUsableSelection(profile?.selectedModules) ? profile.selectedModules : baseConfig.modules)
  const config = { ...baseConfig, modules: activeModules }
  const name   = profile?.name?.split(' ')[0] || 'Користувач'
  const base   = getActivePathSegments(user.uid)

  // Skeleton
  container.innerHTML = `
    <div class="db-page">

      <!-- ── Hero header ── -->
      <div class="db-hero">
        <div class="db-hero-orb db-hero-orb-1"></div>
        <div class="db-hero-orb db-hero-orb-2"></div>
        <div class="db-hero-content">
          <div class="db-hero-left">
            <div class="db-greeting">${getGreeting()}, ${name}</div>
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
                ${a.label}
              </button>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- ── KPI row ── -->
      <div class="db-kpi-row" id="db-kpi-row">
        ${[0,1,2,3].map(() => `<div class="db-kpi-card db-kpi-loading"><div class="db-kpi-shimmer"></div></div>`).join('')}
      </div>

      <!-- ── Two-col body ── -->
      <div class="db-body">
        <div class="db-col-main">

          <!-- Revenue chart ПЕРШИЙ -->
          ${config.modules.includes('invoices') ? `
          <div class="db-section db-chart-section" id="db-revenue-chart">
            <div class="db-section-header">
              <span class="db-section-title">Дохід за 6 місяців</span>
              <button class="db-section-link" data-route="reports">Детальніше →</button>
            </div>
            <div class="db-section-body" style="padding:16px 20px;position:relative;height:190px">
              <canvas id="db-revenue-canvas"></canvas>
            </div>
          </div>` : ''}

          <!-- Clients -->
          <div class="db-section" id="db-recent-clients">
            <div class="db-section-header">
              <span class="db-section-title">Останні клієнти</span>
              <button class="db-section-link" data-route="clients">Всі →</button>
            </div>
            <div class="db-section-body db-loading-rows">
              ${[0,1,2].map(() => `<div class="db-row-shimmer"></div>`).join('')}
            </div>
          </div>

          <!-- Invoices -->
          ${config.modules.includes('invoices') ? `
          <div class="db-section" id="db-recent-invoices">
            <div class="db-section-header">
              <span class="db-section-title">Останні рахунки</span>
              <button class="db-section-link" data-route="invoices">Всі →</button>
            </div>
            <div class="db-section-body db-loading-rows">
              ${[0,1,2].map(() => `<div class="db-row-shimmer"></div>`).join('')}
            </div>
          </div>` : ''}

          <!-- Content plan -->
          ${config.modules.includes('content-plan') ? `
          <div class="db-section" id="db-recent-posts">
            <div class="db-section-header">
              <span class="db-section-title">Контент-план</span>
              <button class="db-section-link" data-route="content-plan">Всі →</button>
            </div>
            <div class="db-section-body db-loading-rows">
              ${[0,1].map(() => `<div class="db-row-shimmer"></div>`).join('')}
            </div>
          </div>` : ''}

        </div>

        <div class="db-col-side">

          <!-- Today card -->
          <div class="db-today-card">
            <div class="db-today-inner">
              <div class="db-today-day">${new Date().toLocaleDateString('uk-UA', { weekday: 'long' })}</div>
              <div class="db-today-date">${new Date().toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}</div>
            </div>
            <div class="db-today-tasks-wrap">
              <div class="db-today-tasks-label">Задач відкрито</div>
              <div class="db-today-tasks-num" id="db-today-task-count">—</div>
            </div>
          </div>

          <!-- Tasks -->
          <div class="db-section" id="db-tasks-section">
            <div class="db-section-header">
              <span class="db-section-title">Відкриті задачі</span>
              <button class="db-section-link" data-route="tasks">Всі →</button>
            </div>
            <div class="db-section-body" id="db-tasks-body">
              <div class="db-loading-rows">${[0,1,2,3].map(() => `<div class="db-row-shimmer"></div>`).join('')}</div>
            </div>
          </div>

          <!-- Projects -->
          ${config.modules.includes('projects') ? `
          <div class="db-section" id="db-projects-section">
            <div class="db-section-header">
              <span class="db-section-title">Активні проекти</span>
              <button class="db-section-link" data-route="projects">Всі →</button>
            </div>
            <div class="db-section-body" id="db-projects-body">
              <div class="db-loading-rows">${[0,1].map(() => `<div class="db-row-shimmer"></div>`).join('')}</div>
            </div>
          </div>` : ''}

          <!-- Module grid -->
          <div class="db-modgrid-card">
            <div class="db-modgrid-title">Швидкий перехід</div>
            <div class="db-modgrid">
              ${config.modules.filter(m => m !== 'dashboard').map(m => {
                const meta = MODULE_NAV[m]
                if (!meta) return ''
                return `<button class="db-modtile" data-route="${m}" style="--mc:${meta.color||'#4F8EF7'}">
                  <span class="db-modtile-icon">${icon(m, 18)}</span>
                  <span class="db-modtile-label">${meta.label}</span>
                </button>`
              }).join('')}
            </div>
          </div>

          <!-- Tax -->
          ${config.modules.includes('tax-calendar') ? `
          <div class="db-section" id="db-tax-section">
            <div class="db-section-header">
              <span class="db-section-title">Найближчий податок</span>
              <button class="db-section-link" data-route="tax-calendar">Всі →</button>
            </div>
            <div class="db-section-body" id="db-tax-body">
              <div class="db-loading-rows"><div class="db-row-shimmer"></div></div>
            </div>
          </div>` : ''}

        </div>
      </div>
    </div>
  `

  // Quick action buttons + module tiles
  container.querySelectorAll('.db-qa-btn, .db-section-link, .db-modtile').forEach(btn => {
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

  if (config.modules.includes('tax-calendar'))
    renderTaxTeaser(container)

  // Revenue chart
  if (config.modules.includes('invoices') && window.Chart) {
    loadRevenueChart(base).then(chartData => {
      if (!chartData) return
      const canvas = container.querySelector('#db-revenue-canvas')
      if (!canvas) return
      new window.Chart(canvas, {
        type: 'bar',
        data: {
          labels: chartData.map(m => m.label),
          datasets: [{
            data: chartData.map(m => m.income),
            backgroundColor: chartData.map((_, i) =>
              i === chartData.length - 1 ? 'rgba(79,142,247,0.85)' : 'rgba(79,142,247,0.35)'),
            borderRadius: 6,
            borderSkipped: false,
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: c => '₴' + Number(c.raw).toLocaleString('uk-UA') } }
          },
          scales: {
            y: { beginAtZero: true, ticks: { color: '#6B7280', callback: v => v >= 1000 ? Math.round(v/1000) + 'к' : v }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { display: false } },
            x: { ticks: { color: '#9CA3AF' }, grid: { display: false }, border: { display: false } }
          }
        }
      })
    }).catch(() => {})
  }

  // Update today's open task count
  const openCount = (tasks.value || []).filter(t => t.status !== 'done').length
  const el = container.querySelector('#db-today-task-count')
  if (el) el.textContent = openCount
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

async function loadRevenueChart(base) {
  const SHORT = ['Січ','Лют','Бер','Кві','Тра','Чер','Лип','Сер','Вер','Жов','Лис','Гру']
  try {
    const snap = await getDocs(collection(db, ...base, 'invoices'))
    const invoices = snap.docs.map(d => d.data())
    const now = new Date()
    const months6 = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const m = d.getMonth(), y = d.getFullYear()
      const inc = invoices
        .filter(inv => {
          if (inv.status !== 'paid') return false
          const dt = inv.createdAt?.toDate?.() || (inv.createdAt ? new Date(inv.createdAt) : null)
          return dt && dt.getMonth() === m && dt.getFullYear() === y
        })
        .reduce((s, inv) => s + (Number(inv.amount) || 0), 0)
      months6.push({ label: SHORT[m], income: inc })
    }
    return months6
  } catch { return null }
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
  const row = container.querySelector('#db-kpi-row')
  if (!row) return
  const cards = buildKPICards(kpi, profession)
  row.innerHTML = cards.map(c => `
    <div class="db-kpi-card" style="--kc:${c.color}">
      <div class="db-kpi-icon-badge">${c.icon}</div>
      <div class="db-kpi-value">${c.value}</div>
      <div class="db-kpi-label">${c.label}</div>
      ${c.sub ? `<div class="db-kpi-sub">${c.sub}</div>` : ''}
    </div>
  `).join('')
}

const KPI_SETS = {
  freelancer: (kpi) => [
    { icon: icon('clients', 20),  label: 'Всього клієнтів',    value: kpi.totalClients ?? '—', color: '#4F8EF7', sub: `+${kpi.newClients ?? 0} цього місяця` },
    { icon: icon('finances', 20), label: 'Дохід цього місяця', value: `₴${formatNum(kpi.monthlyIncome ?? 0)}`, color: '#34D399' },
    { icon: icon('invoices', 20), label: 'Неоплачені рахунки', value: kpi.unpaidCount ?? '—',  color: (kpi.unpaidCount || 0) > 0 ? '#F59E0B' : '#34D399' },
    { icon: icon('tasks', 20),    label: 'Відкриті задачі',    value: kpi.activeTasks ?? '—',  color: '#A78BFA' },
  ],
  accountant: (kpi) => [
    { icon: icon('clients', 20),  label: 'Клієнти',             value: kpi.totalClients ?? '—', color: '#4F8EF7', sub: `+${kpi.newClients ?? 0} цього місяця` },
    { icon: icon('finances', 20), label: 'Дохід цього місяця',  value: `₴${formatNum(kpi.monthlyIncome ?? 0)}`, color: '#34D399' },
    { icon: icon('invoices', 20), label: 'Неоплачені рахунки',  value: kpi.unpaidCount ?? '—',  color: (kpi.unpaidCount || 0) > 0 ? '#F59E0B' : '#34D399' },
    { icon: icon('sparkles', 20), label: 'Нових цього місяця',  value: kpi.newClients ?? '—',   color: '#38BDF8' },
  ],
  smm: (kpi) => [
    { icon: icon('clients', 20),      label: 'Клієнти',             value: kpi.totalClients ?? '—',  color: '#4F8EF7', sub: `+${kpi.newClients ?? 0} цього місяця` },
    { icon: icon('accounts', 20),     label: 'Акаунти',             value: kpi.totalAccounts ?? '—', color: '#F472B6' },
    { icon: icon('content-plan', 20), label: 'Заплановано постів',  value: kpi.plannedPosts ?? '—',  color: '#A78BFA' },
    { icon: icon('tasks', 20),        label: 'Відкриті задачі',     value: kpi.activeTasks ?? '—',   color: '#34D399' },
  ],
  beauty: (kpi) => [
    { icon: icon('clients', 20),  label: 'Клієнти',             value: kpi.totalClients ?? '—', color: '#F472B6', sub: `+${kpi.newClients ?? 0} цього місяця` },
    { icon: icon('finances', 20), label: 'Дохід цього місяця',  value: `₴${formatNum(kpi.monthlyIncome ?? 0)}`, color: '#34D399' },
    { icon: icon('sparkles', 20), label: 'Нових цього місяця',  value: kpi.newClients ?? '—',   color: '#38BDF8' },
    { icon: icon('tasks', 20),    label: 'Відкриті задачі',     value: kpi.activeTasks ?? '—',  color: '#A78BFA' },
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
    el.innerHTML = `<div class="db-empty-row">Немає відкритих задач</div>`
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
        <div class="db-item-avatar" style="background:${s.color};color:#fff">${icon('notes', 14)}</div>
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

function renderTaxTeaser(container) {
  const el = container.querySelector('#db-tax-body')
  if (!el) return

  const EVENTS = [
    { month: 'Квітень', day: 19, label: 'ЄСВ (1 кв.)' },
    { month: 'Квітень', day: 30, label: 'ЄП декларація (1 кв.)' },
    { month: 'Травень', day: 19, label: 'ЄСВ (квітень)' },
    { month: 'Липень', day: 19, label: 'ЄСВ (2 кв.)' },
    { month: 'Серпень', day: 1,  label: 'ЄП (2 кв.)' },
    { month: 'Жовтень', day: 19, label: 'ЄСВ (3 кв.)' },
    { month: 'Листопад', day: 1, label: 'ЄП (3 кв.)' },
    { month: 'Січень', day: 19,  label: 'ЄСВ (4 кв.)' },
  ]

  const MONTH_MAP = { Січень:0, Лютий:1, Березень:2, Квітень:3, Травень:4, Червень:5, Липень:6, Серпень:7, Вересень:8, Жовтень:9, Листопад:10, Грудень:11 }
  const now = new Date()

  const upcoming = EVENTS.map(e => {
    const month = MONTH_MAP[e.month]
    let year = now.getFullYear()
    const d = new Date(year, month, e.day)
    if (d < now) d.setFullYear(year + 1)
    const days = Math.ceil((d - now) / 86400000)
    return { ...e, date: d, days }
  }).sort((a, b) => a.days - b.days)[0]

  if (!upcoming) { el.innerHTML = `<div class="db-empty-row">Дедлайнів не знайдено</div>`; return }

  const urgency = upcoming.days <= 3 ? 'db-tax-critical' : upcoming.days <= 7 ? 'db-tax-soon' : 'db-tax-ok'
  el.innerHTML = `
    <div class="db-tax-row ${urgency}">
      <div class="db-tax-days">${upcoming.days}</div>
      <div class="db-tax-info">
        <div class="db-tax-name">${upcoming.label}</div>
        <div class="db-tax-date">${upcoming.date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}</div>
      </div>
      <div class="db-tax-unit">дн.</div>
    </div>
  `
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════
const MODULE_NAV = {
  clients:           { label: 'Клієнти',    color: '#4F8EF7' },
  projects:          { label: 'Проекти',    color: '#34D399' },
  invoices:          { label: 'Рахунки',    color: '#F59E0B' },
  contracts:         { label: 'Договори',   color: '#A78BFA' },
  tasks:             { label: 'Задачі',     color: '#38BDF8' },
  timer:             { label: 'Таймер',     color: '#FB923C' },
  finances:          { label: 'Фінанси',    color: '#34D399' },
  'tax-calendar':    { label: 'Податки',    color: '#F87171' },
  appointments:      { label: 'Розклад',    color: '#E879F9' },
  services:          { label: 'Послуги',    color: '#F472B6' },
  'content-plan':    { label: 'Контент',    color: '#A78BFA' },
  accounts:          { label: 'Акаунти',    color: '#A3E635' },
  passwords:         { label: 'Паролі',     color: '#94A3B8' },
  notes:             { label: 'Нотатки',    color: '#6EE7B7' },
  kanban:            { label: 'Kanban',     color: '#60A5FA' },
  templates:         { label: 'Шаблони',    color: '#C084FC' },
  warehouse:         { label: 'Склад',      color: '#FB923C' },
  portfolio:         { label: 'Портфоліо',  color: '#34D399' },
  hr:                { label: 'Персонал',   color: '#38BDF8' },
  'client-analytics':{ label: 'Аналітика',  color: '#4F8EF7' },
  currency:          { label: 'Валюти',     color: '#F59E0B' },
  documents:         { label: 'Документи',  color: '#94A3B8' },
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
  const map = { 'new-client':'clients','new-invoice':'invoices','start-timer':'timer','new-transaction':'finances','new-post':'content-plan','new-appointment':'appointments' }
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
  document.getElementById('dashboard-styles-v2')?.remove()
  const style = document.createElement('style')
  style.id = 'dashboard-styles-v2'
  style.textContent = `

  /* ── Page ── */
  .db-page { padding: 22px 28px; max-width: 1600px; display: flex; flex-direction: column; gap: 18px; }

  /* ── Hero header ── */
  .db-hero {
    position: relative; overflow: hidden;
    background: linear-gradient(135deg,
      color-mix(in srgb,#4F8EF7 8%,var(--bg-secondary)) 0%,
      color-mix(in srgb,#7C3AED 5%,var(--bg-secondary)) 100%
    );
    border: 1px solid color-mix(in srgb,#4F8EF7 22%,var(--border));
    border-radius: 18px; padding: 22px 28px;
  }
  .db-hero-orb { position: absolute; border-radius: 50%; pointer-events: none; }
  .db-hero-orb-1 {
    width: 320px; height: 320px; top: -130px; right: 80px;
    background: radial-gradient(circle,rgba(79,142,247,.13) 0%,transparent 70%);
  }
  .db-hero-orb-2 {
    width: 180px; height: 180px; bottom: -80px; right: -20px;
    background: radial-gradient(circle,rgba(124,58,237,.1) 0%,transparent 70%);
  }
  .db-hero-content {
    position: relative; z-index: 1;
    display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
  }
  .db-hero-left { display: flex; flex-direction: column; gap: 8px; }
  .db-greeting {
    font-family: var(--font-display); font-size: 28px; font-weight: 900;
    letter-spacing: -0.03em;
  }
  .db-meta { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-secondary); }
  .db-sep  { color: var(--text-muted); }
  .db-biz  { font-weight: 700; color: var(--text-primary); }
  .db-date { text-transform: capitalize; }

  .db-quick-actions { display: flex; gap: 8px; flex-wrap: wrap; padding-top: 2px; }
  .db-qa-btn {
    background: rgba(255,255,255,.07); backdrop-filter: blur(8px);
    border: 1px solid rgba(255,255,255,.13);
    border-radius: 10px; padding: 9px 16px; font-size: 13px; font-weight: 600;
    cursor: pointer; color: var(--text-primary); transition: all .15s;
  }
  .db-qa-btn:hover {
    background: rgba(79,142,247,.18); border-color: rgba(79,142,247,.45);
    color: #4F8EF7; transform: translateY(-1px);
  }

  /* ── KPI row ── */
  .db-kpi-row { display: grid; grid-template-columns: repeat(4,1fr); gap: 14px; }
  .db-kpi-card {
    background: color-mix(in srgb,var(--kc) 8%,var(--bg-secondary));
    border: 1px solid color-mix(in srgb,var(--kc) 20%,var(--border));
    border-radius: 16px; padding: 20px 22px;
    position: relative; overflow: hidden;
    transition: transform .2s, box-shadow .2s;
  }
  .db-kpi-card::after {
    content:''; position:absolute; top:-40px; right:-20px;
    width:110px; height:110px; border-radius:50%;
    background: radial-gradient(circle,color-mix(in srgb,var(--kc) 20%,transparent) 0%,transparent 70%);
    pointer-events:none;
  }
  .db-kpi-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 14px 40px color-mix(in srgb,var(--kc) 20%,transparent);
  }
  .db-kpi-loading { min-height: 110px; }
  .db-kpi-shimmer {
    height:100%; border-radius:12px;
    background: linear-gradient(90deg,var(--bg-tertiary) 25%,var(--bg-elevated) 50%,var(--bg-tertiary) 75%);
    background-size:200% 100%; animation:db-shimmer 1.4s infinite;
  }
  @keyframes db-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

  .db-kpi-icon-badge {
    width:40px; height:40px; border-radius:11px;
    background: color-mix(in srgb,var(--kc) 16%,transparent);
    display:flex; align-items:center; justify-content:center;
    color:var(--kc); margin-bottom:14px; position:relative; z-index:1;
  }
  .db-kpi-value {
    font-family:var(--font-display); font-size:36px; font-weight:900;
    letter-spacing:-0.04em; color:var(--text-primary); line-height:1;
    margin-bottom:6px; position:relative; z-index:1;
  }
  .db-kpi-label {
    font-size:11px; font-weight:700; text-transform:uppercase;
    letter-spacing:.07em; color:var(--text-muted); position:relative; z-index:1;
  }
  .db-kpi-sub {
    font-size:11px; color:var(--kc); margin-top:6px;
    font-weight:600; position:relative; z-index:1;
  }

  /* ── Body ── */
  .db-body { display:grid; grid-template-columns:minmax(0,1fr) 330px; gap:16px; align-items:start; }
  @media (min-width:1400px) {
    .db-body { grid-template-columns:minmax(0,1fr) 390px; }
    .db-modgrid { grid-template-columns:repeat(4,1fr) !important; }
  }
  @media (min-width:1700px) {
    .db-body { grid-template-columns:minmax(0,1fr) 460px; }
    .db-modgrid { grid-template-columns:repeat(5,1fr) !important; }
    .db-today-tasks-num { font-size:44px !important; }
  }
  @media (max-width:900px) { .db-body { grid-template-columns:1fr; } }
  .db-col-main, .db-col-side { display:flex; flex-direction:column; gap:14px; }

  /* ── Section cards ── */
  .db-section {
    background:var(--bg-secondary); border:1px solid var(--border);
    border-radius:14px; overflow:hidden; transition:border-color .15s;
  }
  .db-section:hover { border-color:rgba(79,142,247,.25); }
  .db-chart-section { border-color:color-mix(in srgb,#4F8EF7 15%,var(--border)); }
  .db-section-header {
    display:flex; align-items:center; justify-content:space-between;
    padding:13px 18px; border-bottom:1px solid var(--border);
    background:rgba(255,255,255,.018);
  }
  .db-section-title {
    font-size:11px; font-weight:800; color:var(--text-secondary);
    text-transform:uppercase; letter-spacing:.07em;
  }
  .db-section-link {
    font-size:12px; color:var(--accent-blue); background:none; border:none;
    cursor:pointer; padding:0; font-weight:600; opacity:.75; transition:opacity .15s;
  }
  .db-section-link:hover { opacity:1; }
  .db-section-body { padding:6px 0; }

  /* ── Shimmers ── */
  .db-loading-rows { padding:10px 18px; display:flex; flex-direction:column; gap:10px; }
  .db-row-shimmer {
    height:40px; border-radius:10px;
    background:linear-gradient(90deg,var(--bg-tertiary) 25%,var(--bg-elevated) 50%,var(--bg-tertiary) 75%);
    background-size:200% 100%; animation:db-shimmer 1.4s infinite;
  }

  /* ── Item rows ── */
  .db-item-row {
    display:flex; align-items:center; gap:12px;
    padding:10px 18px; cursor:pointer; transition:background .12s;
    border-bottom:1px solid rgba(255,255,255,.03);
  }
  .db-item-row:last-child { border-bottom:none; }
  .db-item-row:hover { background:rgba(79,142,247,.05); }
  .db-item-avatar {
    width:36px; height:36px; border-radius:10px; flex-shrink:0;
    display:flex; align-items:center; justify-content:center;
    font-size:14px; font-weight:800; color:#fff;
  }
  .db-item-info { flex:1; min-width:0; }
  .db-item-name { font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .db-item-meta { font-size:11px; color:var(--text-muted); margin-top:2px; }
  .db-item-badge {
    font-size:10px; font-weight:700; padding:3px 9px; border-radius:20px;
    text-transform:uppercase; letter-spacing:.04em; white-space:nowrap;
  }
  .badge-green  { background:rgba(52,211,153,.12); color:#34D399; }
  .badge-yellow { background:rgba(245,158,11,.12);  color:#F59E0B; }
  .badge-grey   { background:rgba(107,114,128,.12); color:#9CA3AF; }
  .db-item-amount { font-size:15px; font-weight:800; white-space:nowrap; }
  .amount-green  { color:#34D399; }
  .amount-yellow { color:#F59E0B; }

  /* ── Task rows ── */
  .db-task-row {
    display:flex; align-items:center; gap:10px; padding:9px 18px; transition:background .12s;
    border-bottom:1px solid rgba(255,255,255,.03);
  }
  .db-task-row:last-child { border-bottom:none; }
  .db-task-row:hover { background:rgba(79,142,247,.05); }
  .db-task-dot  { width:7px; height:7px; border-radius:50%; flex-shrink:0; box-shadow:0 0 5px currentColor; }
  .db-task-title { flex:1; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .db-task-date { font-size:11px; color:var(--text-muted); white-space:nowrap; }

  /* ── Project rows ── */
  .db-proj-row {
    display:flex; align-items:center; gap:12px; padding:10px 18px;
    cursor:pointer; transition:background .12s;
  }
  .db-proj-row:hover { background:rgba(79,142,247,.05); }
  .db-proj-info { flex:1; min-width:0; }
  .db-proj-bar-wrap { height:3px; background:rgba(255,255,255,.07); border-radius:2px; margin-top:6px; overflow:hidden; }
  .db-proj-bar { height:100%; background:linear-gradient(90deg,#4F8EF7,#34D399); border-radius:2px; transition:width .6s cubic-bezier(.34,1.3,.64,1); }
  .db-proj-pct { font-size:12px; font-weight:700; color:var(--text-secondary); white-space:nowrap; }

  /* ── Empty ── */
  .db-empty-row { padding:22px 18px; font-size:13px; color:var(--text-muted); text-align:center; }
  .db-inline-link { background:none; border:none; color:var(--accent-blue); cursor:pointer; font-size:13px; padding:0; }

  /* ── Notes ── */
  .db-note-row {
    display:flex; align-items:flex-start; justify-content:space-between; gap:10px;
    padding:10px 18px; cursor:pointer; transition:background .12s;
  }
  .db-note-row:hover { background:rgba(79,142,247,.05); }
  .db-note-text { font-size:13px; color:var(--text-secondary); line-height:1.4; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .db-note-date { font-size:11px; color:var(--text-muted); white-space:nowrap; flex-shrink:0; }

  /* ── Today card ── */
  .db-today-card {
    background:linear-gradient(135deg,#4361ee 0%,#7209b7 100%);
    border-radius:14px; padding:20px 22px;
    display:flex; align-items:center; justify-content:space-between;
    position:relative; overflow:hidden;
    border:1px solid rgba(255,255,255,.08);
    box-shadow:0 8px 32px rgba(67,97,238,.25);
  }
  .db-today-card::before {
    content:''; position:absolute; right:-20px; top:-30px;
    width:140px; height:140px; border-radius:50%; background:rgba(255,255,255,.07);
  }
  .db-today-card::after {
    content:''; position:absolute; left:35%; bottom:-40px;
    width:100px; height:100px; border-radius:50%; background:rgba(255,255,255,.04);
  }
  .db-today-inner { position:relative; z-index:1; }
  .db-today-day  { font-size:12px; color:rgba(255,255,255,.65); font-weight:600; text-transform:capitalize; margin-bottom:4px; }
  .db-today-date { font-family:var(--font-display); font-size:19px; font-weight:800; color:#fff; }
  .db-today-tasks-wrap { text-align:center; position:relative; z-index:1; }
  .db-today-tasks-label { font-size:10px; color:rgba(255,255,255,.6); text-transform:uppercase; letter-spacing:.06em; font-weight:600; margin-bottom:2px; }
  .db-today-tasks-num { font-family:var(--font-display); font-size:40px; font-weight:900; color:#fff; line-height:1; }

  /* ── Module grid ── */
  .db-modgrid-card {
    background:var(--bg-secondary); border:1px solid var(--border);
    border-radius:14px; padding:16px 14px;
  }
  .db-modgrid-title {
    font-size:10px; font-weight:800; text-transform:uppercase;
    letter-spacing:.08em; color:var(--text-muted); margin-bottom:12px; padding:0 4px;
  }
  .db-modgrid { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; }
  .db-modtile {
    display:flex; flex-direction:column; align-items:center; gap:5px;
    padding:11px 6px; border-radius:10px; cursor:pointer;
    background:color-mix(in srgb,var(--mc) 10%,rgba(255,255,255,.02));
    border:1px solid color-mix(in srgb,var(--mc) 20%,transparent);
    transition:all .18s; color:var(--mc);
  }
  .db-modtile:hover {
    background:color-mix(in srgb,var(--mc) 20%,rgba(255,255,255,.04));
    transform:translateY(-2px);
    box-shadow:0 6px 16px color-mix(in srgb,var(--mc) 20%,transparent);
    border-color:color-mix(in srgb,var(--mc) 40%,transparent);
  }
  .db-modtile-icon  { display:flex; align-items:center; justify-content:center; }
  .db-modtile-label { font-size:9px; font-weight:700; text-align:center; color:var(--mc); line-height:1.2; }

  /* ── Tax ── */
  .db-tax-row { display:flex; align-items:center; gap:14px; padding:14px 18px; }
  .db-tax-days { font-family:var(--font-display); font-size:36px; font-weight:900; line-height:1; min-width:48px; text-align:center; }
  .db-tax-unit { font-size:10px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.06em; align-self:flex-end; padding-bottom:4px; }
  .db-tax-info { flex:1; }
  .db-tax-name { font-size:13px; font-weight:700; margin-bottom:2px; }
  .db-tax-date { font-size:11px; color:var(--text-muted); }
  .db-tax-critical .db-tax-days { color:#F87171; }
  .db-tax-soon    .db-tax-days  { color:#F59E0B; }
  .db-tax-ok      .db-tax-days  { color:#34D399; }

  /* ── Worker dashboard ── */
  .worker-welcome {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    min-height: calc(100vh - 80px); padding: 40px; text-align: center;
  }
  .worker-welcome-icon  { display: flex; align-items: center; justify-content: center; margin-bottom: 20px; color: var(--accent-blue); }
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

  /* ══════════════════════════════════════════════
     WORKER DASHBOARD v2  (wdb-*)
  ══════════════════════════════════════════════ */
  .wdb-page {
    padding: 28px 32px;
    max-width: 1200px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  /* ── Hero ── */
  .wdb-hero {
    position: relative; overflow: hidden;
    background: linear-gradient(135deg, #1e3a5f 0%, #312e81 60%, #4c1d95 100%);
    border-radius: var(--radius-lg);
    padding: 28px 32px;
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    border: 1px solid rgba(255,255,255,.08);
  }
  .wdb-hero-glow {
    position: absolute; top: -60px; left: -60px;
    width: 260px; height: 260px; border-radius: 50%;
    background: radial-gradient(circle, rgba(99,102,241,.35) 0%, transparent 70%);
    pointer-events: none;
  }
  .wdb-hero::after {
    content: ''; position: absolute; bottom: -40px; right: 60px;
    width: 180px; height: 180px; border-radius: 50%;
    background: radial-gradient(circle, rgba(167,139,250,.2) 0%, transparent 70%);
    pointer-events: none;
  }
  .wdb-hero-left {
    display: flex; align-items: center; gap: 18px; position: relative; z-index: 1;
  }
  .wdb-avatar {
    width: 52px; height: 52px; border-radius: 50%; flex-shrink: 0;
    background: linear-gradient(135deg, #6366f1, #a78bfa);
    display: flex; align-items: center; justify-content: center;
    font-size: 20px; font-weight: 800; color: #fff;
    border: 2px solid rgba(255,255,255,.2);
    box-shadow: 0 0 0 4px rgba(99,102,241,.25);
  }
  .wdb-hero-text { position: relative; }
  .wdb-greeting {
    font-family: var(--font-display); font-size: 24px; font-weight: 800;
    letter-spacing: -0.02em; color: #fff; margin-bottom: 8px;
  }
  .wdb-hero-meta {
    display: flex; align-items: center; gap: 8px;
    font-size: 13px; color: rgba(255,255,255,.65);
  }
  .wdb-role-pill {
    background: rgba(255,255,255,.15); border: 1px solid rgba(255,255,255,.2);
    border-radius: 20px; padding: 2px 10px; font-size: 11px; font-weight: 700;
    color: rgba(255,255,255,.9); text-transform: uppercase; letter-spacing: .04em;
  }
  .wdb-hero-dot { color: rgba(255,255,255,.3); }
  .wdb-ws-name  { font-weight: 600; color: rgba(255,255,255,.8); }

  .wdb-hero-date {
    text-align: right; position: relative; z-index: 1; flex-shrink: 0;
  }
  .wdb-date-weekday {
    font-size: 12px; color: rgba(255,255,255,.5); font-weight: 600;
    text-transform: capitalize; letter-spacing: .04em; margin-bottom: 4px;
  }
  .wdb-date-num {
    font-family: var(--font-display); font-size: 18px; font-weight: 800;
    color: rgba(255,255,255,.9); text-transform: capitalize;
  }

  /* ── Stats row ── */
  .wdb-stats-row {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 12px;
  }
  .wdb-stat-card {
    background: var(--bg-secondary); border: 1px solid var(--border);
    border-radius: var(--radius-lg); padding: 18px 20px;
    cursor: pointer; transition: all .18s;
    border-top: 3px solid var(--sc, var(--accent-blue));
    display: flex; flex-direction: column; gap: 4px;
  }
  .wdb-stat-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 8px 24px rgba(0,0,0,.2);
    border-color: var(--sc, var(--accent-blue));
  }
  .wdb-stat-icon { display: flex; align-items: center; margin-bottom: 6px; color: var(--sc, var(--accent-blue)); }
  .wdb-stat-val  {
    font-family: var(--font-display); font-size: 32px; font-weight: 800;
    color: var(--sc, var(--text-primary)); line-height: 1; letter-spacing: -0.03em;
  }
  .wdb-stat-label {
    font-size: 11px; font-weight: 600; text-transform: uppercase;
    letter-spacing: .06em; color: var(--text-muted); margin-top: 2px;
  }
  .wdb-stat-spin {
    display: inline-block; width: 20px; height: 20px; border-radius: 50%;
    border: 2px solid var(--border); border-top-color: var(--sc, var(--accent-blue));
    animation: wdb-spin .8s linear infinite; vertical-align: middle;
  }
  @keyframes wdb-spin { to { transform: rotate(360deg); } }

  /* ── Two-col row (company + leave) ── */
  .wdb-two-col {
    display: grid;
    grid-template-columns: 1fr 260px;
    gap: 14px;
  }
  @media (max-width: 700px) { .wdb-two-col { grid-template-columns: 1fr; } }

  /* ── Company card ── */
  .wdb-company-card {
    background: var(--bg-secondary); border: 1px solid var(--border);
    border-radius: var(--radius-lg); padding: 20px 22px;
    display: flex; flex-direction: column; gap: 16px;
  }
  .wdb-company-label {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .07em; color: var(--text-muted);
  }
  .wdb-company-body { display: flex; align-items: center; gap: 14px; }
  .wdb-company-avatar {
    width: 48px; height: 48px; border-radius: 12px; flex-shrink: 0;
    background: linear-gradient(135deg, #4F8EF7, #7C3AED);
    display: flex; align-items: center; justify-content: center;
    font-size: 22px; font-weight: 800; color: #fff;
  }
  .wdb-company-info { flex: 1; min-width: 0; }
  .wdb-company-biz  { font-size: 16px; font-weight: 700; margin-bottom: 3px; }
  .wdb-company-owner { font-size: 12px; color: var(--text-secondary); margin-bottom: 2px; }
  .wdb-company-email { font-size: 11px; color: var(--text-muted); }
  .wdb-shimmer-line {
    display: inline-block; height: 12px; border-radius: 6px;
    background: linear-gradient(90deg, var(--bg-tertiary) 25%, var(--bg-elevated) 50%, var(--bg-tertiary) 75%);
    background-size: 200% 100%; animation: db-shimmer 1.4s infinite;
  }
  .wdb-company-meta { border-top: 1px solid var(--border); padding-top: 14px; display: flex; flex-direction: column; gap: 8px; }
  .wdb-company-meta-row { display: flex; align-items: center; justify-content: space-between; }
  .wdb-meta-key { font-size: 12px; color: var(--text-muted); }
  .wdb-meta-val { font-size: 12px; font-weight: 600; }
  .wdb-role-pill-sm {
    background: rgba(99,102,241,.15); color: #818cf8;
    border-radius: 20px; padding: 2px 10px; font-size: 11px; font-weight: 700;
  }

  /* ── Leave card ── */
  .wdb-leave-card {
    background: var(--bg-secondary); border: 1px solid var(--border);
    border-radius: var(--radius-lg); padding: 22px 20px;
    display: flex; flex-direction: column; align-items: center;
    text-align: center; gap: 10px;
  }
  .wdb-leave-icon  { display: flex; align-items: center; justify-content: center; color: #F87171; }
  .wdb-leave-title { font-size: 14px; font-weight: 700; }
  .wdb-leave-desc  { font-size: 12px; color: var(--text-muted); line-height: 1.5; }
  .wdb-leave-btn {
    margin-top: 6px; width: 100%;
    padding: 10px 16px; border-radius: var(--radius-md);
    background: rgba(239,68,68,.12); border: 1px solid rgba(239,68,68,.3);
    color: #F87171; font-size: 13px; font-weight: 600; cursor: pointer;
    transition: all .18s;
  }
  .wdb-leave-btn:hover {
    background: rgba(239,68,68,.22); border-color: #F87171;
    transform: translateY(-1px);
  }

  /* ── Leave confirm dialog ── */
  .wdb-confirm-overlay {
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(0,0,0,.6); backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
  }
  .wdb-confirm-dialog {
    background: var(--bg-secondary); border: 1px solid var(--border);
    border-radius: var(--radius-xl, 16px); padding: 32px 28px;
    max-width: 380px; width: 90%; text-align: center;
    box-shadow: 0 24px 60px rgba(0,0,0,.4);
    animation: wdb-dialog-in .18s ease;
  }
  @keyframes wdb-dialog-in {
    from { opacity: 0; transform: scale(.94) translateY(8px); }
    to   { opacity: 1; transform: scale(1)  translateY(0); }
  }
  .wdb-confirm-icon  { display: flex; align-items: center; justify-content: center; margin-bottom: 12px; color: #F87171; }
  .wdb-confirm-title { font-size: 18px; font-weight: 800; margin-bottom: 10px; }
  .wdb-confirm-desc  { font-size: 13px; color: var(--text-secondary); line-height: 1.6; margin-bottom: 24px; }
  .wdb-confirm-actions { display: flex; gap: 10px; }
  .wdb-confirm-cancel {
    flex: 1; padding: 11px; border-radius: var(--radius-md);
    background: var(--bg-tertiary); border: 1px solid var(--border);
    color: var(--text-secondary); font-size: 14px; font-weight: 600; cursor: pointer;
    transition: all .15s;
  }
  .wdb-confirm-cancel:hover { border-color: var(--text-secondary); color: var(--text-primary); }
  .wdb-confirm-ok {
    flex: 1; padding: 11px; border-radius: var(--radius-md);
    background: rgba(239,68,68,.15); border: 1px solid rgba(239,68,68,.4);
    color: #F87171; font-size: 14px; font-weight: 700; cursor: pointer;
    transition: all .15s;
  }
  .wdb-confirm-ok:hover:not(:disabled) { background: rgba(239,68,68,.28); border-color: #F87171; }
  .wdb-confirm-ok:disabled { opacity: .6; cursor: default; }

  /* ── Modules grid ── */
  .wdb-mods-wrap {
    background: var(--bg-secondary); border: 1px solid var(--border);
    border-radius: var(--radius-lg); padding: 18px 16px;
  }
  .wdb-mods-label {
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .07em; color: var(--text-muted);
    margin-bottom: 14px; padding: 0 4px;
  }
  .wdb-mods-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: 8px;
  }
  .wdb-mod-tile {
    display: flex; flex-direction: column; align-items: center; gap: 7px;
    padding: 16px 8px 14px; border-radius: 12px; cursor: pointer;
    background: color-mix(in srgb, var(--mc) 10%, var(--bg-tertiary));
    border: 1px solid color-mix(in srgb, var(--mc) 22%, transparent);
    transition: all .18s; outline: none;
  }
  .wdb-mod-tile:hover {
    background: color-mix(in srgb, var(--mc) 20%, var(--bg-tertiary));
    border-color: color-mix(in srgb, var(--mc) 50%, transparent);
    transform: translateY(-3px);
    box-shadow: 0 6px 16px color-mix(in srgb, var(--mc) 25%, transparent);
  }
  .wdb-mod-tile:active { transform: translateY(-1px); }
  .wdb-mod-tile-icon  { display: flex; align-items: center; justify-content: center; color: var(--mc); }
  .wdb-mod-tile-label {
    font-size: 10px; font-weight: 700; text-align: center;
    color: var(--mc); line-height: 1.3; letter-spacing: .01em;
  }
  `
  document.head.appendChild(style)
}
