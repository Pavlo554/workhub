import { navigate, clearModuleCache } from '../../core/router.js'
import { logoutUser, getCurrentUser, updateProfileCache } from '../services/auth.js'
import { getProfessionConfig } from '../../core/profession-config.js'
import { icon } from '../utils/icons.js'
import { t } from '../../core/i18n.js'
import { db } from '../services/firebase.js'
import {
  collection, getDocs, addDoc, deleteDoc, doc, updateDoc,
  serverTimestamp, query, orderBy, limit,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

// labelKey maps to i18n keys; fallback label is Ukrainian
const MODULE_META = {
  dashboard:       { labelKey: 'module.dashboard',  label: 'Дашборд' },
  clients:         { labelKey: 'module.clients',    label: 'Клієнти' },
  projects:        { labelKey: 'module.projects',   label: 'Проекти' },
  invoices:        { labelKey: 'module.invoices',   label: 'Рахунки' },
  contracts:       { labelKey: 'module.contracts',  label: 'Договори' },
  tasks:           { labelKey: 'module.tasks',      label: 'Задачі' },
  finances:        { labelKey: 'module.finances',   label: 'Фінанси' },
  'tax-calendar':  { labelKey: 'module.tax-calendar', label: 'Податки' },
  appointments:    { labelKey: 'module.appointments', label: 'Розклад' },
  services:        { labelKey: 'module.services',   label: 'Послуги' },
  'content-plan':  { labelKey: 'module.smm',        label: 'Контент' },
  accounts:        { labelKey: 'module.accounts',   label: 'Акаунти' },
  passwords:       { labelKey: 'module.passwords',  label: 'Паролі' },
  notes:           { labelKey: 'module.notes',      label: 'Нотатки' },
  documents:       { labelKey: 'module.documents',  label: 'Документи' },
  'api-keys':      { labelKey: 'module.api',        label: 'API та інтеграції' },
  timer:           { labelKey: 'module.timer',      label: 'Таймер' },
  kanban:          { labelKey: 'module.kanban',     label: 'Kanban' },
  templates:       { labelKey: 'module.templates',  label: 'Шаблони' },
  warehouse:       { labelKey: 'module.warehouse',  label: 'Склад' },
  portfolio:       { labelKey: 'module.portfolio',  label: 'Портфоліо' },
  hr:              { labelKey: 'module.hr',         label: 'Персонал' },
  currency:        { labelKey: 'module.currency',   label: 'Валюти' },
  reports:         { labelKey: 'module.reports',    label: 'Звіти' },
  support:         { labelKey: 'module.support',    label: 'Підтримка' },
  cashbook:        { labelKey: 'module.cashbook',   label: 'Каса' },
  bank:            { labelKey: 'module.bank',        label: 'Банк' },
  payroll:         { labelKey: 'module.payroll',    label: 'Зарплата' },
  prro:            { labelKey: 'module.prro',        label: 'ПРРО' },
}

function modLabel(m) {
  return m.labelKey ? t(m.labelKey) : m.label
}

const PLAN_COLORS = { free: '#8B97B0', pro: '#5B8DEF', business: '#A78BFA' }

const NICHES = [
  { id: 'freelancer', iconName: 'laptop',     label: 'Фрілансер',         color: '#5B8DEF' },
  { id: 'accountant', iconName: 'calculator', label: 'Бухгалтер / ФОП',   color: '#34D399' },
  { id: 'smm',        iconName: 'grid',       label: 'SMM / Маркетолог',  color: '#A78BFA' },
  { id: 'beauty',     iconName: 'sparkles',   label: 'Салон краси',       color: '#F472B6' },
]

export function renderNavigation(sidebar, profile) {
  injectNavStyles()

  const plan      = profile?.plan || 'free'
  const color     = PLAN_COLORS[plan] || PLAN_COLORS.free
  const isWorker  = profile?.accountType === 'worker'
  const isMember  = profile?.workspaceId && !profile?.isWorkspaceOwner
  const isOwner   = profile?.accountType === 'owner' || profile?.isWorkspaceOwner
  const canMultiBiz = plan === 'business' && isOwner
  const activeProfession = profile?.activeBusiness && profile?.activeBusinessProfession
    ? profile.activeBusinessProfession
    : profile?.profession

  const config = getProfessionConfig(activeProfession)

  const professionModules = profile?.activeBusiness && profile?.activeBusinessModules?.length
    ? profile.activeBusinessModules
    : (profile?.selectedModules?.length ? profile.selectedModules : config.modules)

  const modules = isWorker
    ? (isMember ? (profile.workspaceModules || []) : [])
    : professionModules

  sidebar.innerHTML = `
    <div class="nav-wrapper">

      <button class="nav-user nav-user-clickable" id="nav-user-btn">
        <div class="nav-avatar" style="background:${config.color}1a;border:1.5px solid ${config.color}33">
          <span style="color:${config.color}">${initials(profile?.name)}</span>
        </div>
        <div style="min-width:0">
          <div class="nav-user-name">${profile?.name || 'Користувач'}</div>
          <div class="nav-user-biz">${profile?.activeBusiness && profile?.activeBusinessName ? profile.activeBusinessName : (profile?.businessName || 'Мій бізнес')}</div>
        </div>
      </button>

      ${canMultiBiz ? `
        <div class="nav-biz-switcher" id="nav-biz-switcher">
          <div class="nav-biz-loading"><div class="nav-biz-spinner"></div></div>
        </div>
      ` : ''}

      ${isMember
        ? `<div class="nav-workspace-badge">
             <span class="nav-ws-dot"></span>
             <span class="nav-ws-role">${profile.workspaceRole || 'Учасник'}</span>
           </div>`
        : `<div class="nav-plan" style="color:${color};border-color:${color}33;background:${color}0d">
             ${plan.toUpperCase()}
           </div>`
      }

      <div class="nav-search-wrap">
        <span class="nav-search-icon">${icon('search', 14)}</span>
        <input type="text" class="nav-search-input" id="nav-search" placeholder="Пошук…" autocomplete="off" spellcheck="false">
      </div>

      <nav class="nav-menu" id="nav-menu">
        <div class="nav-section-label">${t('nav.main')}</div>
        ${[...modules].sort((a, b) => {
          const keys = Object.keys(MODULE_META)
          return keys.indexOf(a) - keys.indexOf(b)
        }).map(id => {
          const m = MODULE_META[id]
          if (!m) return ''
          return `<button class="nav-item" data-route="${id}">
            <span class="nav-item-icon">${icon(id)}</span>
            <span class="nav-item-label">${modLabel(m)}</span>
          </button>`
        }).join('')}

        ${isOwner ? `
        <button class="nav-modules-edit-btn" id="nav-modules-edit-btn">
          ${icon('plus', 14)}
          <span>${t('nav.configure')}</span>
        </button>` : ''}

        <div class="nav-divider"></div>
        <div class="nav-section-label">${t('nav.account')}</div>

        ${isOwner ? `
        <button class="nav-item nav-item-cabinet" data-route="business">
          <span class="nav-item-icon">${icon('business')}</span>
          <span class="nav-item-label">${t('nav.cabinet')}</span>
        </button>` : ''}

        <button class="nav-item" data-route="settings">
          <span class="nav-item-icon">${icon('settings')}</span>
          <span class="nav-item-label">${t('nav.settings')}</span>
        </button>

        ${!isMember && plan === 'free' ? `
        <button class="nav-item nav-item-upgrade" data-route="subscribe">
          <span class="nav-item-icon">${icon('upgrade')}</span>
          <span class="nav-item-label">${t('nav.upgrade')}</span>
        </button>` : ''}

        ${!profile?.workspaceId ? `
        <button class="nav-item nav-item-join" data-route="join">
          <span class="nav-item-icon">${icon('join')}</span>
          <span class="nav-item-label">${t('nav.join')}</span>
        </button>` : ''}
      </nav>

      <div class="nav-bottom">
        ${profile?.isWorkspaceOwner ? `
        <button class="nav-item nav-item-team" data-route="team">
          <span class="nav-item-icon">${icon('team')}</span>
          <span class="nav-item-label">${t('nav.team')}</span>
        </button>` : ''}
        ${profile?.isAdmin ? `
        <button class="nav-item nav-item-admin" data-route="admin">
          <span class="nav-item-icon">${icon('admin')}</span>
          <span class="nav-item-label">${t('nav.admin')}</span>
        </button>` : ''}
        <button class="nav-logout" id="nav-logout-btn">
          ${icon('logout', 15)}
          <span>${t('nav.logout')}</span>
        </button>
        <div class="nav-version">v${window.electron?.appVersion || '—'}</div>
      </div>

    </div>
  `

  sidebar.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.route))
  })

  // ── Search ──────────────────────────────────────────────
  const searchInp = sidebar.querySelector('#nav-search')
  searchInp?.addEventListener('input', () => {
    const q    = searchInp.value.trim().toLowerCase()
    const menu = sidebar.querySelector('#nav-menu')

    sidebar.querySelectorAll('.nav-item').forEach(btn => {
      const label = btn.querySelector('.nav-item-label')?.textContent?.toLowerCase() || ''
      btn.style.display = (!q || label.includes(q)) ? '' : 'none'
    })

    const hasSections = !q
    menu?.querySelectorAll('.nav-section-label').forEach(el => { el.style.display = hasSections ? '' : 'none' })
    menu?.querySelectorAll('.nav-divider').forEach(el => { el.style.display = hasSections ? '' : 'none' })
    const editBtn = sidebar.querySelector('.nav-modules-edit-btn')
    if (editBtn) editBtn.style.display = hasSections ? '' : 'none'

    menu?.querySelector('.nav-search-empty')?.remove()
    if (q) {
      const visible = [...sidebar.querySelectorAll('.nav-item')].some(b => b.style.display !== 'none')
      if (!visible) {
        const empty = document.createElement('div')
        empty.className = 'nav-search-empty'
        empty.textContent = 'Нічого не знайдено'
        menu?.appendChild(empty)
      }
    }
  })

  sidebar.querySelector('#nav-user-btn').addEventListener('click', () => navigate('profile'))
  sidebar.querySelector('#nav-logout-btn').addEventListener('click', async () => { await logoutUser() })

  sidebar._profile = profile

  if (isOwner) {
    sidebar.querySelector('#nav-modules-edit-btn')?.addEventListener('click', () => {
      openModulesPanel(sidebar, profile, modules)
    })
  }

  if (canMultiBiz) {
    initBizSwitcher(sidebar, profile)
  }
}

// ── Module manager panel ───────────────────────────────────
function openModulesPanel(sidebar, profile, currentModules) {
  document.getElementById('nav-mod-overlay')?.remove()

  const ALL_MODS = Object.entries(MODULE_META).filter(([id]) => id !== 'dashboard')

  const overlay = document.createElement('div')
  overlay.id = 'nav-mod-overlay'
  overlay.innerHTML = `
    <div class="nav-mod-panel">
      <div class="nav-mod-head">
        <div class="nav-mod-title">Модулі</div>
        <button class="nav-mod-close" id="nav-mod-close">${icon('x', 14)}</button>
      </div>
      <p class="nav-mod-hint">Оберіть модулі, які відображатимуться в меню</p>
      <div class="nav-mod-grid" id="nav-mod-grid">
        ${ALL_MODS.map(([id, m]) => {
          const active = currentModules.includes(id)
          return `
            <button class="nav-mod-chip ${active ? 'active' : ''}" data-mod="${id}">
              <span class="nav-mod-chip-icon">${icon(id, 18)}</span>
              <span class="nav-mod-chip-label">${modLabel(m)}</span>
              <span class="nav-mod-chip-check">${icon('check', 9)}</span>
            </button>`
        }).join('')}
      </div>
      <div class="nav-mod-foot">
        <button class="nav-mod-cancel" id="nav-mod-cancel">Скасувати</button>
        <button class="nav-mod-save" id="nav-mod-save">Зберегти</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)

  overlay.querySelectorAll('.nav-mod-chip').forEach(chip => {
    chip.addEventListener('click', () => chip.classList.toggle('active'))
  })

  const close = () => overlay.remove()
  overlay.querySelector('#nav-mod-close').addEventListener('click', close)
  overlay.querySelector('#nav-mod-cancel').addEventListener('click', close)
  overlay.addEventListener('click', e => { if (e.target === overlay) close() })

  overlay.querySelector('#nav-mod-save').addEventListener('click', async () => {
    const selected = ['dashboard', ...Array.from(
      overlay.querySelectorAll('.nav-mod-chip.active')
    ).map(c => c.dataset.mod)]

    if (selected.length < 2) { navToast('Оберіть хоча б один модуль'); return }

    const saveBtn = overlay.querySelector('#nav-mod-save')
    saveBtn.disabled = true
    saveBtn.textContent = 'Збереження…'

    try {
      const user = getCurrentUser()
      if (!user) return

      if (profile?.activeBusiness && profile?._bizId) {
        await updateDoc(doc(db, 'users', user.uid, 'businesses', profile._bizId), {
          modules: selected, updatedAt: serverTimestamp()
        })
        updateProfileCache(user.uid, { activeBusinessModules: selected })
      } else {
        await updateDoc(doc(db, 'users', user.uid), {
          selectedModules: selected, updatedAt: serverTimestamp()
        })
        updateProfileCache(user.uid, { selectedModules: selected })
      }

      close()
      navToast('Модулі оновлено')

      const { getUserProfile } = await import('../services/auth.js')
      const freshProfile = await getUserProfile(user.uid)
      renderNavigation(sidebar, freshProfile)

    } catch (err) {
      console.error(err)
      navToast('Помилка збереження')
      saveBtn.disabled = false
      saveBtn.textContent = 'Зберегти'
    }
  })
}

function navToast(msg) {
  document.getElementById('nav-toast')?.remove()
  const el = document.createElement('div')
  el.id = 'nav-toast'
  el.className = 'nav-toast-msg'
  el.textContent = msg
  document.body.appendChild(el)
  requestAnimationFrame(() => el.classList.add('show'))
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300) }, 2500)
}

// ── Multi-business switcher ────────────────────────────────
async function initBizSwitcher(sidebar, profile) {
  const user = getCurrentUser()
  if (!user) return

  const switcher = sidebar.querySelector('#nav-biz-switcher')
  if (!switcher) return

  let businesses = []
  try {
    const q    = query(collection(db, 'users', user.uid, 'businesses'), orderBy('createdAt', 'asc'), limit(10))
    const snap = await getDocs(q)
    businesses = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch {}

  renderSwitcher(switcher, businesses, profile, user, sidebar)
}

function renderSwitcher(switcher, businesses, profile, user, sidebar) {
  const active    = profile?.activeBusiness || null
  const activeBiz = businesses.find(b => b.id === active)
  const MAX       = 10

  switcher.innerHTML = `
    <div class="nav-biz-header" id="nav-biz-header">
      <span class="nav-biz-icon">${activeBiz ? nicheIcon(activeBiz.profession) : icon('building', 13)}</span>
      <span class="nav-biz-name">${activeBiz ? activeBiz.name : (profile?.businessName || 'Основний бізнес')}</span>
      <span class="nav-biz-chevron" id="nav-biz-chevron">${icon('chevron-down', 12)}</span>
    </div>
    <div class="nav-biz-list" id="nav-biz-list" style="display:none">

      <div class="nav-biz-item ${!active ? 'active' : ''}" data-id="">
        <span class="nav-biz-item-icon">${icon('building', 13)}</span>
        <span class="nav-biz-item-name">${profile?.businessName || 'Основний бізнес'}</span>
        ${!active ? `<span class="nav-biz-check">${icon('check', 10)}</span>` : ''}
      </div>

      ${businesses.map(b => `
        <div class="nav-biz-item ${active === b.id ? 'active' : ''}" data-id="${b.id}">
          <span class="nav-biz-item-icon">${nicheIcon(b.profession)}</span>
          <span class="nav-biz-item-name">${b.name}</span>
          <span class="nav-biz-item-actions">
            ${active === b.id ? `<span class="nav-biz-check">${icon('check', 10)}</span>` : ''}
            <button class="nav-biz-del" data-id="${b.id}" title="Видалити">${icon('x', 9)}</button>
          </span>
        </div>
      `).join('')}

      ${businesses.length < MAX - 1 ? `
        <div class="nav-biz-add" id="nav-biz-add-btn">
          ${icon('plus', 12)}
          <span>Новий бізнес</span>
          <span class="nav-biz-counter">${businesses.length + 1}/${MAX}</span>
        </div>
      ` : `
        <div class="nav-biz-limit">Досягнуто ліміт (${MAX} бізнесів)</div>
      `}
    </div>

    <div class="nav-biz-form" id="nav-biz-form" style="display:none">
      <div class="nav-biz-form-step" id="nav-biz-step1">
        <div class="nav-biz-form-title">Новий бізнес</div>
        <input type="text" class="nav-biz-input" id="nav-biz-name-inp" placeholder="Назва бізнесу" maxlength="40">
        <div class="nav-biz-form-label">Ніша</div>
        <div class="nav-biz-niches">
          ${NICHES.map(n => `
            <div class="nav-biz-niche" data-niche="${n.id}" style="--nc:${n.color}">
              ${icon(n.iconName, 13)}<span>${n.label}</span>
            </div>
          `).join('')}
          <div class="nav-biz-niche nav-biz-niche-custom" data-niche="custom" style="--nc:#A78BFA;grid-column:span 2">
            ${icon('settings2', 13)}<span>Інша ніша — вибрати модулі вручну</span>
          </div>
        </div>
        <div class="nav-biz-form-actions">
          <button class="nav-biz-form-cancel" id="nav-biz-form-cancel">Скасувати</button>
          <button class="nav-biz-form-next" id="nav-biz-step1-next">Далі</button>
        </div>
      </div>

      <div class="nav-biz-form-step" id="nav-biz-step2" style="display:none">
        <div class="nav-biz-form-title" id="nav-biz-step2-title">Модулі бізнесу</div>
        <div class="nav-biz-form-hint" id="nav-biz-step2-hint">Оберіть що потрібно для цього бізнесу</div>
        <div class="nav-biz-mod-grid" id="nav-biz-mod-grid"></div>
        <div class="nav-biz-form-actions">
          <button class="nav-biz-form-cancel" id="nav-biz-step2-back">Назад</button>
          <button class="nav-biz-form-save" id="nav-biz-form-save">Створити</button>
        </div>
      </div>
    </div>
  `

  const BIZ_MODULES = [
    { id: 'clients',      label: 'Клієнти'    },
    { id: 'projects',     label: 'Проекти'    },
    { id: 'invoices',     label: 'Рахунки'    },
    { id: 'contracts',    label: 'Договори'   },
    { id: 'tasks',        label: 'Задачі'     },
    { id: 'timer',        label: 'Таймер'     },
    { id: 'finances',     label: 'Фінанси'    },
    { id: 'tax-calendar', label: 'Податки'    },
    { id: 'appointments', label: 'Розклад'    },
    { id: 'services',     label: 'Послуги'    },
    { id: 'content-plan', label: 'Контент'    },
    { id: 'accounts',     label: 'Акаунти'    },
    { id: 'passwords',    label: 'Паролі'     },
    { id: 'notes',        label: 'Нотатки'    },
    { id: 'documents',    label: 'Документи'  },
  ]

  const BIZ_DEFAULTS = {
    freelancer: ['clients','projects','invoices','contracts','tasks','timer','passwords','notes'],
    accountant: ['clients','finances','invoices','contracts','tax-calendar','passwords','notes'],
    smm:        ['clients','content-plan','accounts','tasks','passwords','notes'],
    beauty:     ['clients','appointments','services','finances','notes'],
  }

  let open          = false
  let selectedNiche = null
  let selectedMods  = new Set()

  const header  = switcher.querySelector('#nav-biz-header')
  const list    = switcher.querySelector('#nav-biz-list')
  const chevron = switcher.querySelector('#nav-biz-chevron')
  const form    = switcher.querySelector('#nav-biz-form')
  const step1   = switcher.querySelector('#nav-biz-step1')
  const step2   = switcher.querySelector('#nav-biz-step2')
  const modGrid = switcher.querySelector('#nav-biz-mod-grid')

  header.addEventListener('click', () => {
    open = !open
    list.style.display  = open ? 'block' : 'none'
    form.style.display  = 'none'
    chevron.innerHTML   = icon(open ? 'chevron-up' : 'chevron-down', 12)
  })

  switcher.querySelectorAll('.nav-biz-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      if (e.target.closest('.nav-biz-del')) return
      const bizId = item.dataset.id || null
      const biz   = businesses.find(b => b.id === bizId)

      const patch = {
        activeBusiness:           bizId || null,
        activeBusinessName:       biz?.name       || null,
        activeBusinessProfession: biz?.profession || null,
        activeBusinessModules:    biz?.modules    || null,
      }

      await updateDoc(doc(db, 'users', user.uid), patch)
      updateProfileCache(user.uid, patch)
      clearModuleCache()   // force fresh render for all modules after business switch
      renderNavigation(sidebar, { ...profile, ...patch })
      navigate('dashboard')
    })
  })

  switcher.querySelectorAll('.nav-biz-del').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const bizId = btn.dataset.id
      const biz   = businesses.find(b => b.id === bizId)
      if (!confirm(`Видалити бізнес "${biz?.name}"?`)) return

      await deleteDoc(doc(db, 'users', user.uid, 'businesses', bizId))
      if (profile?.activeBusiness === bizId) {
        const patch = { activeBusiness: null, activeBusinessName: null, activeBusinessProfession: null, activeBusinessModules: null }
        await updateDoc(doc(db, 'users', user.uid), patch)
        updateProfileCache(user.uid, patch)
      }
      businesses = businesses.filter(b => b.id !== bizId)
      renderSwitcher(switcher, businesses, profile, user, sidebar)
    })
  })

  switcher.querySelector('#nav-biz-add-btn')?.addEventListener('click', () => {
    list.style.display  = 'none'
    form.style.display  = 'block'
    step1.style.display = 'block'
    step2.style.display = 'none'
    open = false
    selectedNiche = null
    selectedMods  = new Set()
    switcher.querySelector('#nav-biz-name-inp').value = ''
    switcher.querySelectorAll('.nav-biz-niche').forEach(n => n.classList.remove('selected'))
  })

  switcher.querySelectorAll('.nav-biz-niche').forEach(n => {
    n.addEventListener('click', () => {
      switcher.querySelectorAll('.nav-biz-niche').forEach(x => x.classList.remove('selected'))
      n.classList.add('selected')
      selectedNiche = n.dataset.niche
    })
  })

  switcher.querySelector('#nav-biz-form-cancel')?.addEventListener('click', () => {
    form.style.display = 'none'
    list.style.display = 'block'
    open = true
  })

  switcher.querySelector('#nav-biz-step1-next')?.addEventListener('click', () => {
    const name = switcher.querySelector('#nav-biz-name-inp').value.trim()
    if (!name)          { showNavToast('Введіть назву бізнесу'); return }
    if (!selectedNiche) { showNavToast('Оберіть нішу'); return }

    const isCustom = selectedNiche === 'custom'
    selectedMods = isCustom ? new Set() : new Set(BIZ_DEFAULTS[selectedNiche] || [])
    const niche  = NICHES.find(n => n.id === selectedNiche)
    const mc     = isCustom ? '#A78BFA' : (niche?.color || '#5B8DEF')

    const titleEl = switcher.querySelector('#nav-biz-step2-title')
    const hintEl  = switcher.querySelector('#nav-biz-step2-hint')
    if (titleEl) titleEl.textContent = isCustom ? 'Вибери модулі' : 'Модулі бізнесу'
    if (hintEl)  hintEl.textContent  = isCustom
      ? 'Відмічай тільки те, що потрібно'
      : 'Типові модулі вже обрані — можеш змінити'

    modGrid.innerHTML = BIZ_MODULES.map(m => `
      <div class="nav-biz-mod-item ${selectedMods.has(m.id) ? 'checked' : ''}"
           data-mod="${m.id}" style="--mc:${mc}">
        <span class="nav-biz-mod-icon">${icon(m.id, 12)}</span>
        <span class="nav-biz-mod-label">${m.label}</span>
        <span class="nav-biz-mod-chk">${icon('check', 9)}</span>
      </div>
    `).join('')

    modGrid.querySelectorAll('.nav-biz-mod-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.mod
        if (selectedMods.has(id)) { selectedMods.delete(id); el.classList.remove('checked') }
        else                      { selectedMods.add(id);    el.classList.add('checked')    }
      })
    })

    step1.style.display = 'none'
    step2.style.display = 'block'
  })

  switcher.querySelector('#nav-biz-step2-back')?.addEventListener('click', () => {
    step2.style.display = 'none'
    step1.style.display = 'block'
  })

  switcher.querySelector('#nav-biz-form-save')?.addEventListener('click', async () => {
    const name    = switcher.querySelector('#nav-biz-name-inp').value.trim()
    const modules = ['dashboard', ...Array.from(selectedMods)]

    const saveBtn = switcher.querySelector('#nav-biz-form-save')
    saveBtn.disabled = true
    saveBtn.textContent = '…'
    try {
      const profession = selectedNiche === 'custom' ? null : selectedNiche
      const ref  = await addDoc(collection(db, 'users', user.uid, 'businesses'), {
        name, profession, modules, createdAt: serverTimestamp(),
      })
      businesses = [...businesses, { id: ref.id, name, profession, modules }]
      form.style.display = 'none'
      renderSwitcher(switcher, businesses, profile, user, sidebar)
      showNavToast(`Бізнес "${name}" створено`)
    } catch (err) {
      console.error(err)
      showNavToast('Помилка створення')
    } finally {
      saveBtn.disabled = false
      saveBtn.textContent = 'Створити'
    }
  })
}

// ── Helpers ────────────────────────────────────────────────
function nicheIcon(profession) {
  const map = { freelancer: 'laptop', accountant: 'calculator', smm: 'grid', beauty: 'sparkles' }
  return icon(map[profession] || 'building', 13)
}

function initials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || 'W'
}

function showNavToast(msg) {
  const t = document.createElement('div')
  t.className = 'nav-toast'
  t.textContent = msg
  document.body.appendChild(t)
  setTimeout(() => t.remove(), 2500)
}

// ── Injected styles (biz-switcher & module manager) ────────
function injectNavStyles() {
  document.getElementById('nav-styles')?.remove()
  const s = document.createElement('style')
  s.id = 'nav-styles'
  s.textContent = `
    /* ── Business switcher ── */
    .nav-biz-switcher {
      margin: 4px 0 8px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border);
      overflow: hidden;
      font-size: 12.5px;
    }
    .nav-biz-loading { display:flex; justify-content:center; padding:8px; }
    .nav-biz-spinner {
      width:14px; height:14px;
      border:2px solid var(--border); border-top-color:var(--accent-blue);
      border-radius:50%; animation:nav-spin .65s linear infinite;
    }
    @keyframes nav-spin { to { transform:rotate(360deg); } }

    .nav-biz-header {
      display:flex; align-items:center; gap:7px;
      padding:7px 10px; cursor:pointer;
      background:var(--bg-tertiary); user-select:none;
      transition:background .15s;
    }
    .nav-biz-header:hover { background:rgba(255,255,255,.04); }
    .nav-biz-icon    { flex-shrink:0; color:var(--text-secondary); display:flex; }
    .nav-biz-name    { flex:1; font-weight:600; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .nav-biz-chevron { color:var(--text-muted); flex-shrink:0; display:flex; }

    .nav-biz-list {
      border-top:1px solid var(--border);
      background:var(--bg-secondary);
      max-height:240px; overflow-y:auto;
    }
    .nav-biz-item {
      display:flex; align-items:center; gap:7px;
      padding:7px 10px; cursor:pointer;
      transition:background .12s; font-size:12px;
    }
    .nav-biz-item:hover  { background:rgba(255,255,255,.04); }
    .nav-biz-item.active { background:rgba(91,141,239,.08); }
    .nav-biz-item-icon   { flex-shrink:0; color:var(--text-secondary); display:flex; }
    .nav-biz-item-name   { flex:1; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .nav-biz-item-actions { display:flex; align-items:center; gap:3px; flex-shrink:0; }
    .nav-biz-check { color:var(--accent-blue); display:flex; }
    .nav-biz-del {
      background:none; border:none; cursor:pointer;
      color:var(--text-muted); padding:2px 4px;
      border-radius:4px; opacity:0; transition:all .15s; display:flex; align-items:center;
    }
    .nav-biz-item:hover .nav-biz-del { opacity:1; }
    .nav-biz-del:hover { color:var(--accent-red); background:var(--accent-red-dim); }

    .nav-biz-add {
      display:flex; align-items:center; gap:7px;
      padding:7px 10px; cursor:pointer; font-size:12px;
      color:var(--accent-blue); font-weight:600;
      border-top:1px solid var(--border);
      transition:background .12s;
    }
    .nav-biz-add:hover { background:rgba(91,141,239,.07); }
    .nav-biz-counter { margin-left:auto; font-size:10px; color:var(--text-muted); font-weight:400; }
    .nav-biz-limit { padding:8px 10px; font-size:11px; color:var(--text-muted); text-align:center; border-top:1px solid var(--border); }

    /* New biz form */
    .nav-biz-form { border-top:1px solid var(--border); padding:10px; background:var(--bg-secondary); }
    .nav-biz-form-title { font-size:12px; font-weight:700; margin-bottom:8px; }
    .nav-biz-form-hint  { font-size:11px; color:var(--text-muted); margin-bottom:8px; }
    .nav-biz-form-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:var(--text-muted); margin-bottom:5px; }
    .nav-biz-input {
      width:100%; box-sizing:border-box;
      background:var(--bg-tertiary); border:1px solid var(--border);
      border-radius:var(--radius-sm); color:var(--text-primary);
      padding:6px 10px; font-family:var(--font-body); font-size:12px; margin-bottom:8px; outline:none;
    }
    .nav-biz-input:focus { border-color:var(--accent-blue); }
    .nav-biz-niches { display:grid; grid-template-columns:1fr 1fr; gap:4px; margin-bottom:8px; }
    .nav-biz-niche {
      display:flex; align-items:center; gap:5px;
      background:var(--bg-tertiary); border:1.5px solid var(--border);
      border-radius:var(--radius-sm); padding:5px 7px;
      font-size:11px; font-weight:600; cursor:pointer; transition:all .12s;
    }
    .nav-biz-niche:hover { border-color:var(--nc); }
    .nav-biz-niche.selected { border-color:var(--nc); background:color-mix(in srgb,var(--nc) 13%,transparent); color:var(--nc); }
    .nav-biz-niche svg { flex-shrink:0; }
    .nav-biz-niche-custom { font-size:10.5px; color:var(--text-muted); border-style:dashed; }
    .nav-biz-niche-custom.selected { color:var(--nc); border-style:solid; }

    .nav-biz-form-actions { display:flex; gap:6px; }
    .nav-biz-form-cancel, .nav-biz-form-next, .nav-biz-form-save {
      flex:1; padding:6px; border-radius:var(--radius-sm);
      font-size:12px; font-weight:600; cursor:pointer; border:none; transition:all .15s;
    }
    .nav-biz-form-cancel { background:var(--bg-tertiary); color:var(--text-muted); border:1px solid var(--border); }
    .nav-biz-form-cancel:hover { color:var(--text-primary); }
    .nav-biz-form-next, .nav-biz-form-save { background:var(--accent-blue); color:#fff; }
    .nav-biz-form-next:hover, .nav-biz-form-save:hover { opacity:.9; }
    .nav-biz-form-save:disabled { opacity:.5; cursor:not-allowed; }

    /* Module grid in form */
    .nav-biz-mod-grid { display:grid; grid-template-columns:1fr 1fr; gap:4px; margin-bottom:8px; max-height:180px; overflow-y:auto; }
    .nav-biz-mod-grid::-webkit-scrollbar { width:3px; }
    .nav-biz-mod-grid::-webkit-scrollbar-thumb { background:rgba(255,255,255,.1); border-radius:2px; }
    .nav-biz-mod-item {
      display:flex; align-items:center; gap:5px;
      padding:5px 7px; border-radius:var(--radius-sm);
      border:1.5px solid var(--border); background:var(--bg-tertiary);
      cursor:pointer; font-size:11px; font-weight:500;
      transition:all .12s; user-select:none;
    }
    .nav-biz-mod-item:hover { border-color:rgba(255,255,255,.18); }
    .nav-biz-mod-item.checked {
      border-color:var(--mc, var(--accent-blue));
      background:color-mix(in srgb,var(--mc,var(--accent-blue)) 13%,transparent);
    }
    .nav-biz-mod-icon  { flex-shrink:0; color:var(--text-muted); display:flex; }
    .nav-biz-mod-item.checked .nav-biz-mod-icon { color:var(--mc, var(--accent-blue)); }
    .nav-biz-mod-label { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .nav-biz-mod-chk   { color:var(--mc,var(--accent-blue)); opacity:0; transition:opacity .12s; display:flex; }
    .nav-biz-mod-item.checked .nav-biz-mod-chk { opacity:1; }

    /* Toast */
    .nav-toast {
      position:fixed; bottom:26px; left:50%; transform:translateX(-50%);
      background:var(--bg-elevated); border:1px solid var(--border);
      border-radius:var(--radius-full); padding:9px 18px;
      font-size:12.5px; font-weight:500; z-index:9999;
      animation:nav-toast-in .2s ease; pointer-events:none;
      box-shadow:var(--shadow-xl);
    }
    @keyframes nav-toast-in { from{opacity:0;transform:translateX(-50%) translateY(6px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }

    /* ── Module manager overlay ── */
    #nav-mod-overlay {
      position:fixed; inset:0;
      background:rgba(0,0,0,.55); backdrop-filter:blur(6px);
      z-index:2000;
      display:flex; align-items:center; justify-content:center; padding:24px;
    }
    .nav-mod-panel {
      background:var(--bg-secondary); border:1px solid var(--border);
      border-radius:var(--radius-xl); width:100%; max-width:500px;
      max-height:88vh; display:flex; flex-direction:column;
      box-shadow:var(--shadow-xl);
      animation:modPanelIn .18s cubic-bezier(.34,1.2,.64,1);
    }
    @keyframes modPanelIn { from{opacity:0;transform:scale(0.96)} to{opacity:1;transform:scale(1)} }

    .nav-mod-head {
      display:flex; align-items:center; justify-content:space-between;
      padding:20px 22px 0; flex-shrink:0;
    }
    .nav-mod-title { font-family:var(--font-display); font-size:18px; font-weight:700; }
    .nav-mod-close {
      width:28px; height:28px; border-radius:7px;
      background:none; border:none; cursor:pointer;
      color:var(--text-muted); display:flex; align-items:center; justify-content:center;
      transition:all .15s;
    }
    .nav-mod-close:hover { background:var(--accent-red-dim); color:var(--accent-red); }
    .nav-mod-hint { font-size:12.5px; color:var(--text-muted); padding:8px 22px 14px; flex-shrink:0; }

    .nav-mod-grid {
      display:grid; grid-template-columns:repeat(3,1fr);
      gap:8px; padding:0 22px 16px; overflow-y:auto;
    }
    .nav-mod-chip {
      display:flex; flex-direction:column; align-items:center; gap:6px;
      padding:12px 8px; border-radius:var(--radius-md);
      background:var(--bg-tertiary); border:1.5px solid var(--border);
      cursor:pointer; transition:all .15s; position:relative; text-align:center;
    }
    .nav-mod-chip:hover { border-color:rgba(91,141,239,.4); }
    .nav-mod-chip.active { border-color:var(--accent-blue); background:rgba(91,141,239,.1); }
    .nav-mod-chip-icon  { color:var(--text-secondary); display:flex; }
    .nav-mod-chip.active .nav-mod-chip-icon { color:var(--accent-blue); }
    .nav-mod-chip-label { font-size:11px; font-weight:600; line-height:1.3; color:var(--text-muted); }
    .nav-mod-chip.active .nav-mod-chip-label { color:var(--text-primary); }
    .nav-mod-chip-check {
      position:absolute; top:6px; right:6px;
      width:15px; height:15px; border-radius:50%;
      background:var(--accent-blue); color:#fff;
      display:flex; align-items:center; justify-content:center;
      opacity:0; transition:opacity .15s;
    }
    .nav-mod-chip.active .nav-mod-chip-check { opacity:1; }

    .nav-mod-foot {
      display:flex; gap:10px; padding:14px 22px;
      border-top:1px solid var(--border); flex-shrink:0; justify-content:flex-end;
    }
    .nav-mod-cancel {
      padding:9px 20px; border-radius:var(--radius-sm);
      background:var(--bg-tertiary); border:1.5px solid var(--border);
      color:var(--text-primary); font-size:13px; font-weight:600;
      cursor:pointer; transition:all .15s;
    }
    .nav-mod-cancel:hover { border-color:var(--accent-blue); }
    .nav-mod-save {
      padding:9px 24px; border-radius:var(--radius-sm);
      background:var(--accent-blue); border:none;
      color:#fff; font-size:13px; font-weight:600;
      cursor:pointer; transition:all .15s;
    }
    .nav-mod-save:hover { opacity:.9; transform:translateY(-1px); }
    .nav-mod-save:disabled { opacity:.5; transform:none; cursor:not-allowed; }
  `
  document.head.appendChild(s)
}
