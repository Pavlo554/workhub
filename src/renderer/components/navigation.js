import { navigate } from '../../core/router.js'
import { logoutUser } from '../services/auth.js'
import { getProfessionConfig } from '../../core/profession-config.js'

const MODULE_META = {
  dashboard:      { icon: '⊞', label: 'Дашборд' },
  clients:        { icon: '👥', label: 'Клієнти' },
  projects:       { icon: '📁', label: 'Проекти' },
  invoices:       { icon: '📄', label: 'Рахунки' },
  contracts:      { icon: '📝', label: 'Договори' },
  tasks:          { icon: '✓',  label: 'Задачі' },
  finances:       { icon: '💰', label: 'Фінанси' },
  'tax-calendar': { icon: '📅', label: 'Податки' },
  appointments:   { icon: '🗓', label: 'Розклад' },
  services:       { icon: '💅', label: 'Послуги' },
  'content-plan': { icon: '📱', label: 'Контент' },
  accounts:       { icon: '🔗', label: 'Акаунти' },
  passwords:      { icon: '🔑', label: 'Паролі' },
  notes:          { icon: '🗒', label: 'Нотатки' },
  timer:          { icon: '⏱', label: 'Таймер' },
}

const PLAN_COLORS = { free: '#94A3B8', pro: '#4F8EF7', business: '#A78BFA' }

export function renderNavigation(sidebar, profile) {
  const config = getProfessionConfig(profile?.profession)
  const plan   = profile?.plan || 'free'
  const color  = PLAN_COLORS[plan]

  const isWorker = profile?.accountType === 'worker'
  const isMember = profile?.workspaceId && !profile?.isWorkspaceOwner

  // Воркер без команди — без модулів
  // Воркер з командою — лише дозволені модулі
  // Власник — всі модулі своєї ніші
  const modules = isWorker
    ? (isMember ? (profile.workspaceModules || []) : [])
    : config.modules

  sidebar.innerHTML = `
    <div class="nav-wrapper">

      <button class="nav-user nav-user-clickable" id="nav-user-btn">
        <div class="nav-avatar" style="background:${config.color}22;border:1.5px solid ${config.color}44">
          <span style="color:${config.color}">${initials(profile?.name)}</span>
        </div>
        <div>
          <div class="nav-user-name">${profile?.name || 'Користувач'}</div>
          <div class="nav-user-biz">${profile?.businessName || 'Мій бізнес'}</div>
        </div>
      </button>

      ${isMember
        ? `<div class="nav-workspace-badge">
             <span class="nav-ws-dot"></span>
             <span class="nav-ws-role">${profile.workspaceRole || 'Учасник'}</span>
           </div>`
        : `<div class="nav-plan" style="color:${color};border-color:${color}44;background:${color}11">
             ${plan.toUpperCase()} ПЛАН
           </div>`
      }

      <nav class="nav-menu">
        <div class="nav-section-label">Головне</div>
        ${modules.map(id => {
          const m = MODULE_META[id]
          if (!m) return ''
          return `<button class="nav-item" data-route="${id}">
            <span class="nav-item-icon">${m.icon}</span>
            <span class="nav-item-label">${m.label}</span>
          </button>`
        }).join('')}

        <div class="nav-divider"></div>
        <div class="nav-section-label">Акаунт</div>

        ${profile?.accountType === 'owner' ? `
        <button class="nav-item nav-item-cabinet" data-route="business">
          <span class="nav-item-icon">🏢</span>
          <span class="nav-item-label">Мій кабінет</span>
        </button>` : ''}
        <button class="nav-item" data-route="settings">
          <span class="nav-item-icon">⚙</span>
          <span class="nav-item-label">Налаштування</span>
        </button>
        ${!isMember && plan === 'free' ? `
        <button class="nav-item nav-item-upgrade" data-route="subscribe">
          <span class="nav-item-icon">⭐</span>
          <span class="nav-item-label">Перейти на PRO</span>
        </button>` : ''}
        ${!profile?.workspaceId ? `
        <button class="nav-item nav-item-join" data-route="join">
          <span class="nav-item-icon">👥</span>
          <span class="nav-item-label">Долучитись до команди</span>
        </button>` : ''}
      </nav>

      <div class="nav-bottom">
        ${profile?.isWorkspaceOwner ? `
        <button class="nav-item nav-item-team" data-route="team">
          <span class="nav-item-icon">👥</span>
          <span class="nav-item-label">Команда</span>
        </button>` : ''}
        ${profile?.isAdmin ? `
        <button class="nav-item nav-item-admin" data-route="admin">
          <span class="nav-item-icon">🛡</span>
          <span class="nav-item-label">Адмін панель</span>
        </button>` : ''}
        <button class="nav-logout" id="nav-logout-btn">↪ Вийти</button>
      </div>

    </div>
  `

  sidebar.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.route))
  })

  sidebar.querySelector('#nav-user-btn').addEventListener('click', () => navigate('profile'))

  sidebar.querySelector('#nav-logout-btn').addEventListener('click', async () => {
    await logoutUser()
  })
}

function initials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || 'W'
}