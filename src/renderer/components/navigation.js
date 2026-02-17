// src/renderer/components/navigation.js
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
}

const PLAN_COLORS = { free: '#94A3B8', pro: '#4F8EF7', business: '#A78BFA' }

export function renderNavigation(sidebar, profile) {
  const config = getProfessionConfig(profile?.profession)
  const plan   = profile?.plan || 'free'
  const color  = PLAN_COLORS[plan]

  sidebar.innerHTML = `
    <div class="nav-wrapper">

      <div class="nav-user">
        <div class="nav-avatar" style="background:${config.color}22;border:1.5px solid ${config.color}44">
          <span style="color:${config.color}">${initials(profile?.name)}</span>
        </div>
        <div>
          <div class="nav-user-name">${profile?.name || 'Користувач'}</div>
          <div class="nav-user-biz">${profile?.businessName || 'Мій бізнес'}</div>
        </div>
      </div>

      <div class="nav-plan" style="color:${color};border-color:${color}44;background:${color}11">
        ${plan.toUpperCase()} ПЛАН
      </div>

      <nav class="nav-menu">
        <div class="nav-section-label">Головне</div>
        ${config.modules.map(id => {
          const m = MODULE_META[id]
          if (!m) return ''
          return `<button class="nav-item" data-route="${id}">
            <span class="nav-item-icon">${m.icon}</span>
            <span class="nav-item-label">${m.label}</span>
          </button>`
        }).join('')}

        <div class="nav-divider"></div>
        <div class="nav-section-label">Акаунт</div>

        <button class="nav-item" data-route="profile">
          <span class="nav-item-icon">👤</span>
          <span class="nav-item-label">Профіль</span>
        </button>
        <button class="nav-item" data-route="settings">
          <span class="nav-item-icon">⚙</span>
          <span class="nav-item-label">Налаштування</span>
        </button>
        ${plan === 'free' ? `
        <button class="nav-item nav-item-upgrade" data-route="subscribe">
          <span class="nav-item-icon">⭐</span>
          <span class="nav-item-label">Перейти на PRO</span>
        </button>` : ''}
      </nav>

      <div class="nav-bottom">
        <button class="nav-logout" id="nav-logout-btn">↪ Вийти</button>
      </div>

    </div>
  `

  sidebar.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.route))
  })

  sidebar.querySelector('#nav-logout-btn').addEventListener('click', async () => {
    await logoutUser()
  })
}

function initials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || 'W'
}