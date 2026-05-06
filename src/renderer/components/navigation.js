import { navigate } from '../../core/router.js'
import { logoutUser, getCurrentUser, updateProfileCache } from '../services/auth.js'
import { getProfessionConfig } from '../../core/profession-config.js'
import { db } from '../services/firebase.js'
import {
  collection, getDocs, addDoc, deleteDoc, doc, updateDoc,
  serverTimestamp, query, orderBy, limit,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

const MODULE_META = {
  dashboard:           { icon: '⊞', label: 'Дашборд' },
  clients:             { icon: '👥', label: 'Клієнти' },
  projects:            { icon: '📁', label: 'Проекти' },
  invoices:            { icon: '📄', label: 'Рахунки' },
  contracts:           { icon: '📝', label: 'Договори' },
  tasks:               { icon: '✓',  label: 'Задачі' },
  finances:            { icon: '💰', label: 'Фінанси' },
  'tax-calendar':      { icon: '📅', label: 'Податки' },
  appointments:        { icon: '🗓', label: 'Розклад' },
  services:            { icon: '💅', label: 'Послуги' },
  'content-plan':      { icon: '📱', label: 'Контент' },
  accounts:            { icon: '🔗', label: 'Акаунти' },
  passwords:           { icon: '🔑', label: 'Паролі' },
  notes:               { icon: '🗒', label: 'Нотатки' },
  documents:           { icon: '📁', label: 'Документи' },
  'api-keys':          { icon: '🔗', label: 'API & Інтеграції' },
  timer:               { icon: '⏱', label: 'Таймер' },
  kanban:              { icon: '🗂', label: 'Kanban' },
  templates:           { icon: '📋', label: 'Шаблони' },
  warehouse:           { icon: '📦', label: 'Склад' },
  portfolio:           { icon: '🖼', label: 'Портфоліо' },
  hr:                  { icon: '👔', label: 'Персонал' },
  'client-analytics':  { icon: '📈', label: 'Аналітика' },
  currency:            { icon: '💱', label: 'Валюти' },
  reports:             { icon: '📊', label: 'Звіти' },
  support:             { icon: '💬', label: 'Підтримка' },
}

const PLAN_COLORS = { free: '#94A3B8', pro: '#4F8EF7', business: '#A78BFA' }

const NICHES = [
  { id: 'freelancer', icon: '💻', label: 'Фрілансер',       color: '#4F8EF7' },
  { id: 'accountant', icon: '📊', label: 'Бухгалтер / ФОП', color: '#34D399' },
  { id: 'smm',        icon: '📱', label: 'SMM / Маркетолог', color: '#A78BFA' },
  { id: 'beauty',     icon: '💅', label: 'Салон краси',      color: '#F472B6' },
]

export function renderNavigation(sidebar, profile) {
  injectNavStyles()
  
  const plan    = profile?.plan || 'free'
  const color   = PLAN_COLORS[plan] || PLAN_COLORS.free
  const isWorker = profile?.accountType === 'worker'
  const isMember = profile?.workspaceId && !profile?.isWorkspaceOwner
  const isOwner  = profile?.accountType === 'owner' || profile?.isWorkspaceOwner
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
        <div class="nav-avatar" style="background:${config.color}22;border:1.5px solid ${config.color}44">
          <span style="color:${config.color}">${initials(profile?.name)}</span>
        </div>
        <div>
          <div class="nav-user-name">${profile?.name || 'Користувач'}</div>
          <div class="nav-user-biz">${profile?.activeBusiness && profile?.activeBusinessName ? profile.activeBusinessName : (profile?.businessName || 'Мій бізнес')}</div>
        </div>
      </button>

      ${canMultiBiz ? `
        <div class="nav-biz-switcher" id="nav-biz-switcher">
          <div class="nav-biz-loading">
            <div class="nav-biz-spinner"></div>
          </div>
        </div>
      ` : ''}

      ${isMember
        ? `<div class="nav-workspace-badge">
             <span class="nav-ws-dot"></span>
             <span class="nav-ws-role">${profile.workspaceRole || 'Учасник'}</span>
           </div>`
        : `<div class="nav-plan" style="color:${color};border-color:${color}44;background:${color}11">
             ${plan.toUpperCase()} ПЛАН
           </div>`
      }

      <div class="nav-search-wrap">
        <span class="nav-search-icon">⌕</span>
        <input type="text" class="nav-search-input" id="nav-search" placeholder="Пошук модулів…" autocomplete="off" spellcheck="false">
      </div>

      <nav class="nav-menu" id="nav-menu">
        <div class="nav-section-label" data-section="main">Головне</div>
        ${modules.map(id => {
          const m = MODULE_META[id]
          if (!m) return ''
          return `<button class="nav-item" data-route="${id}">
            <span class="nav-item-icon">${m.icon}</span>
            <span class="nav-item-label">${m.label}</span>
          </button>`
        }).join('')}

        ${isOwner ? `
        <button class="nav-modules-edit-btn" id="nav-modules-edit-btn" title="Керувати модулями">
          <span>⊕</span>
          <span>Налаштувати модулі</span>
        </button>` : ''}

        <div class="nav-divider" data-divider="account"></div>
        <div class="nav-section-label" data-section="account">Акаунт</div>

        ${isOwner ? `
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

  // ── Search ──────────────────────────────────────────────────
  const searchInp = sidebar.querySelector('#nav-search')
  searchInp?.addEventListener('input', () => {
    const q = searchInp.value.trim().toLowerCase()
    const menu = sidebar.querySelector('#nav-menu')

    sidebar.querySelectorAll('.nav-item').forEach(btn => {
      const label = btn.querySelector('.nav-item-label')?.textContent?.toLowerCase() || ''
      btn.style.display = (!q || label.includes(q)) ? '' : 'none'
    })

    const hasSections = !q
    menu?.querySelectorAll('.nav-section-label').forEach(el => {
      el.style.display = hasSections ? '' : 'none'
    })
    menu?.querySelectorAll('.nav-divider').forEach(el => {
      el.style.display = hasSections ? '' : 'none'
    })
    sidebar.querySelector('.nav-modules-edit-btn')?.style &&
      (sidebar.querySelector('.nav-modules-edit-btn').style.display = hasSections ? '' : 'none')

    // Empty state
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

  // ── Керування модулями ──────────────────────────────────────
  if (isOwner) {
    sidebar.querySelector('#nav-modules-edit-btn')?.addEventListener('click', () => {
      openModulesPanel(sidebar, profile, modules)
    })
  }

  // Завантажуємо бізнеси асинхронно (тільки для business-плану)
  if (canMultiBiz) {
    initBizSwitcher(sidebar, profile)
  }
}

// ── Module manager panel ───────────────────────────────────────
function openModulesPanel(sidebar, profile, currentModules) {
  // Remove existing panel
  document.getElementById('nav-mod-overlay')?.remove()

  const ALL_MODS = Object.entries(MODULE_META).filter(([id]) => id !== 'dashboard')

  const overlay = document.createElement('div')
  overlay.id = 'nav-mod-overlay'
  overlay.innerHTML = `
    <div class="nav-mod-panel">
      <div class="nav-mod-head">
        <div class="nav-mod-title">⊕ Модулі</div>
        <button class="nav-mod-close" id="nav-mod-close">✕</button>
      </div>
      <p class="nav-mod-hint">Обери модулі які відображатимуться в меню</p>
      <div class="nav-mod-grid" id="nav-mod-grid">
        ${ALL_MODS.map(([id, m]) => {
          const active = currentModules.includes(id)
          return `
            <button class="nav-mod-chip ${active ? 'active' : ''}" data-mod="${id}">
              <span class="nav-mod-chip-icon">${m.icon}</span>
              <span class="nav-mod-chip-label">${m.label}</span>
              <span class="nav-mod-chip-check">✓</span>
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

  // Toggle chips
  overlay.querySelectorAll('.nav-mod-chip').forEach(chip => {
    chip.addEventListener('click', () => chip.classList.toggle('active'))
  })

  // Close
  const close = () => overlay.remove()
  overlay.querySelector('#nav-mod-close').addEventListener('click', close)
  overlay.querySelector('#nav-mod-cancel').addEventListener('click', close)
  overlay.addEventListener('click', e => { if (e.target === overlay) close() })

  // Save
  overlay.querySelector('#nav-mod-save').addEventListener('click', async () => {
    const selected = ['dashboard', ...Array.from(
      overlay.querySelectorAll('.nav-mod-chip.active')
    ).map(c => c.dataset.mod)]

    if (selected.length < 2) {
      navToast('Обери хоча б один модуль'); return
    }

    const saveBtn = overlay.querySelector('#nav-mod-save')
    saveBtn.disabled = true
    saveBtn.textContent = 'Збереження...'

    try {
      const user = getCurrentUser()
      if (!user) return

      if (profile?.activeBusiness && profile?._bizId) {
        // Secondary business — save to businesses/{bizId}
        await updateDoc(doc(db, 'users', user.uid, 'businesses', profile._bizId), {
          modules: selected, updatedAt: serverTimestamp()
        })
        updateProfileCache(user.uid, { activeBusinessModules: selected })
      } else {
        // Main business — save to users/{uid}
        await updateDoc(doc(db, 'users', user.uid), {
          selectedModules: selected, updatedAt: serverTimestamp()
        })
        updateProfileCache(user.uid, { selectedModules: selected })
      }

      close()
      navToast('Модулі оновлено ✓')

      // Re-render navigation with fresh profile
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
  } catch { /* перша завантаження — колекція може бути порожня */ }

  renderSwitcher(switcher, businesses, profile, user, sidebar)
}

function renderSwitcher(switcher, businesses, profile, user, sidebar) {
  const active = profile?.activeBusiness || null
  const activeBiz = businesses.find(b => b.id === active)
  const MAX = 10

  switcher.innerHTML = `
    <div class="nav-biz-header" id="nav-biz-header">
      <span class="nav-biz-icon">${activeBiz ? nicheIcon(activeBiz.profession) : '🏢'}</span>
      <span class="nav-biz-name">${activeBiz ? activeBiz.name : (profile?.businessName || 'Основний бізнес')}</span>
      <span class="nav-biz-chevron" id="nav-biz-chevron">▾</span>
    </div>
    <div class="nav-biz-list" id="nav-biz-list" style="display:none">

      <!-- Основний бізнес -->
      <div class="nav-biz-item ${!active ? 'active' : ''}" data-id="">
        <span class="nav-biz-item-icon">🏢</span>
        <span class="nav-biz-item-name">${profile?.businessName || 'Основний бізнес'}</span>
        ${!active ? '<span class="nav-biz-check">✓</span>' : ''}
      </div>

      <!-- Додаткові бізнеси -->
      ${businesses.map(b => `
        <div class="nav-biz-item ${active === b.id ? 'active' : ''}" data-id="${b.id}">
          <span class="nav-biz-item-icon">${nicheIcon(b.profession)}</span>
          <span class="nav-biz-item-name">${b.name}</span>
          <span class="nav-biz-item-actions">
            ${active === b.id ? '<span class="nav-biz-check">✓</span>' : ''}
            <button class="nav-biz-del" data-id="${b.id}" title="Видалити">✕</button>
          </span>
        </div>
      `).join('')}

      <!-- Додати новий -->
      ${businesses.length < MAX - 1 ? `
        <div class="nav-biz-add" id="nav-biz-add-btn">
          <span>＋</span>
          <span>Новий бізнес</span>
          <span class="nav-biz-counter">${businesses.length + 1}/${MAX}</span>
        </div>
      ` : `
        <div class="nav-biz-limit">Досягнуто ліміт (${MAX} бізнесів)</div>
      `}
    </div>

    <!-- Форма нового бізнесу: крок 1 — назва + ніша -->
    <div class="nav-biz-form" id="nav-biz-form" style="display:none">
      <div class="nav-biz-form-step" id="nav-biz-step1">
        <div class="nav-biz-form-title">Новий бізнес</div>
        <input type="text" class="nav-biz-input" id="nav-biz-name-inp" placeholder="Назва бізнесу" maxlength="40">
        <div class="nav-biz-form-label">Ніша *</div>
        <div class="nav-biz-niches">
          ${NICHES.map(n => `
            <div class="nav-biz-niche" data-niche="${n.id}" style="--nc:${n.color}">
              <span>${n.icon}</span><span>${n.label}</span>
            </div>
          `).join('')}
          <div class="nav-biz-niche nav-biz-niche-custom" data-niche="custom" style="--nc:#A78BFA;grid-column:span 2">
            <span>✦</span><span>Інша ніша — обрати модулі вручну</span>
          </div>
        </div>
        <div class="nav-biz-form-actions">
          <button class="nav-biz-form-cancel" id="nav-biz-form-cancel">Скасувати</button>
          <button class="nav-biz-form-next" id="nav-biz-step1-next">Далі →</button>
        </div>
      </div>

      <!-- Крок 2 — модулі -->
      <div class="nav-biz-form-step" id="nav-biz-step2" style="display:none">
        <div class="nav-biz-form-title" id="nav-biz-step2-title">Модулі бізнесу</div>
        <div class="nav-biz-form-hint" id="nav-biz-step2-hint">Обери що потрібно для цього бізнесу</div>
        <div class="nav-biz-mod-grid" id="nav-biz-mod-grid"></div>
        <div class="nav-biz-form-actions">
          <button class="nav-biz-form-cancel" id="nav-biz-step2-back">← Назад</button>
          <button class="nav-biz-form-save" id="nav-biz-form-save">Створити</button>
        </div>
      </div>
    </div>
  `

  const BIZ_MODULES = [
    { id: 'clients',      icon: '👥', label: 'Клієнти'    },
    { id: 'projects',     icon: '📁', label: 'Проекти'    },
    { id: 'invoices',     icon: '📄', label: 'Рахунки'    },
    { id: 'contracts',    icon: '📝', label: 'Договори'   },
    { id: 'tasks',        icon: '✓',  label: 'Задачі'     },
    { id: 'timer',        icon: '⏱', label: 'Таймер'     },
    { id: 'finances',     icon: '💰', label: 'Фінанси'    },
    { id: 'tax-calendar', icon: '📅', label: 'Податки'    },
    { id: 'appointments', icon: '🗓', label: 'Розклад'    },
    { id: 'services',     icon: '💅', label: 'Послуги'    },
    { id: 'content-plan', icon: '📱', label: 'Контент'    },
    { id: 'accounts',     icon: '🔗', label: 'Акаунти'    },
    { id: 'passwords',    icon: '🔑', label: 'Паролі'     },
    { id: 'notes',        icon: '🗒', label: 'Нотатки'    },
    { id: 'documents',   icon: '📁', label: 'Документи'  },
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

  // Відкрити/закрити список
  header.addEventListener('click', () => {
    open = !open
    list.style.display   = open ? 'block' : 'none'
    form.style.display   = 'none'
    chevron.textContent  = open ? '▴' : '▾'
  })

  // Перемикання бізнесу
  switcher.querySelectorAll('.nav-biz-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      if (e.target.closest('.nav-biz-del')) return
      const bizId = item.dataset.id || null
      const biz   = businesses.find(b => b.id === bizId)

      const newProfilePatch = {
        activeBusiness:            bizId || null,
        activeBusinessName:        biz?.name       || null,
        activeBusinessProfession:  biz?.profession || null,
        activeBusinessModules:     biz?.modules    || null,
      }

      await updateDoc(doc(db, 'users', user.uid), newProfilePatch)
      updateProfileCache(user.uid, newProfilePatch)

      const updatedProfile = { ...profile, ...newProfilePatch }
      renderNavigation(sidebar, updatedProfile)
      navigate('dashboard')
    })
  })

  // Видалити бізнес
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

  // Показати форму (скидаємо стан)
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

  // Ніша click
  switcher.querySelectorAll('.nav-biz-niche').forEach(n => {
    n.addEventListener('click', () => {
      switcher.querySelectorAll('.nav-biz-niche').forEach(x => x.classList.remove('selected'))
      n.classList.add('selected')
      selectedNiche = n.dataset.niche
    })
  })

  // Скасувати форму
  switcher.querySelector('#nav-biz-form-cancel')?.addEventListener('click', () => {
    form.style.display = 'none'
    list.style.display = 'block'
    open = true
  })

  // Крок 1 → 2
  switcher.querySelector('#nav-biz-step1-next')?.addEventListener('click', () => {
    const name = switcher.querySelector('#nav-biz-name-inp').value.trim()
    if (!name)          { showNavToast('Введіть назву бізнесу'); return }
    if (!selectedNiche) { showNavToast('Оберіть нішу'); return }

    const isCustom = selectedNiche === 'custom'
    // Pre-fill modules: empty for custom, defaults for known niches
    selectedMods = isCustom ? new Set() : new Set(BIZ_DEFAULTS[selectedNiche] || [])
    const niche  = NICHES.find(n => n.id === selectedNiche)
    const color  = isCustom ? '#A78BFA' : (niche?.color || '#4F8EF7')

    // Update step2 title/hint
    const titleEl = switcher.querySelector('#nav-biz-step2-title')
    const hintEl  = switcher.querySelector('#nav-biz-step2-hint')
    if (titleEl) titleEl.textContent = isCustom ? 'Вибери модулі' : 'Модулі бізнесу'
    if (hintEl)  hintEl.textContent  = isCustom
      ? 'Відмічай тільки те, що потрібно для твого бізнесу'
      : 'Типові модулі вже обрані — можеш змінити'

    modGrid.innerHTML = BIZ_MODULES.map(m => `
      <div class="nav-biz-mod-item ${selectedMods.has(m.id) ? 'checked' : ''}"
           data-mod="${m.id}" style="--mc:${color}">
        <span class="nav-biz-mod-icon">${m.icon}</span>
        <span class="nav-biz-mod-label">${m.label}</span>
        <span class="nav-biz-mod-chk">✓</span>
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

  // Крок 2 → назад
  switcher.querySelector('#nav-biz-step2-back')?.addEventListener('click', () => {
    step2.style.display = 'none'
    step1.style.display = 'block'
  })

  // Зберегти новий бізнес
  switcher.querySelector('#nav-biz-form-save')?.addEventListener('click', async () => {
    const name = switcher.querySelector('#nav-biz-name-inp').value.trim()
    const modules = ['dashboard', ...Array.from(selectedMods)]

    const saveBtn = switcher.querySelector('#nav-biz-form-save')
    saveBtn.disabled = true
    saveBtn.textContent = '...'
    try {
      const profession = selectedNiche === 'custom' ? null : selectedNiche
      const ref  = await addDoc(collection(db, 'users', user.uid, 'businesses'), {
        name, profession, modules, createdAt: serverTimestamp(),
      })
      const newBiz = { id: ref.id, name, profession, modules }
      businesses = [...businesses, newBiz]

      form.style.display = 'none'
      renderSwitcher(switcher, businesses, profile, user, sidebar)
      showNavToast(`Бізнес "${name}" створено ✓`)
    } catch (err) {
      console.error(err)
      showNavToast('Помилка створення')
    } finally {
      saveBtn.disabled = false
      saveBtn.textContent = 'Створити'
    }
  })
}

// ── Helpers ───────────────────────────────────────────────
function nicheIcon(profession) {
  const map = { freelancer: '💻', accountant: '📊', smm: '📱', beauty: '💅' }
  return map[profession] || '🏢'
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

// ── Styles ────────────────────────────────────────────────
function injectNavStyles() {
  document.getElementById('nav-styles')?.remove()
  const s = document.createElement('style')
  s.id = 'nav-styles'
  s.textContent = `
    /* Business switcher */
    .nav-biz-switcher {
      margin: 6px 10px 4px;
      border-radius: var(--radius-md);
      border: 1px solid var(--border);
      overflow: hidden;
      font-size: 13px;
    }
    .nav-biz-loading {
      display: flex; justify-content: center; padding: 8px;
    }
    .nav-biz-spinner {
      width: 16px; height: 16px; border: 2px solid var(--border);
      border-top-color: var(--accent-blue); border-radius: 50%;
      animation: nav-spin .6s linear infinite;
    }
    @keyframes nav-spin { to { transform: rotate(360deg); } }

    .nav-biz-header {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 10px; cursor: pointer;
      background: var(--bg-tertiary);
      user-select: none; transition: background .15s;
    }
    .nav-biz-header:hover { background: rgba(255,255,255,.05); }
    .nav-biz-icon  { font-size: 14px; flex-shrink: 0; }
    .nav-biz-name  { flex: 1; font-weight: 600; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .nav-biz-chevron { font-size: 10px; color: var(--text-muted); flex-shrink: 0; }

    .nav-biz-list {
      border-top: 1px solid var(--border);
      background: var(--bg-secondary);
      max-height: 260px; overflow-y: auto;
    }
    .nav-biz-item {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 10px; cursor: pointer;
      transition: background .12s; font-size: 12px;
    }
    .nav-biz-item:hover { background: rgba(255,255,255,.04); }
    .nav-biz-item.active { background: rgba(79,142,247,.08); }
    .nav-biz-item-icon   { font-size: 13px; flex-shrink: 0; }
    .nav-biz-item-name   { flex: 1; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .nav-biz-item-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
    .nav-biz-check { font-size: 11px; color: var(--accent-blue); font-weight: 800; }
    .nav-biz-del {
      background: none; border: none; cursor: pointer;
      font-size: 10px; color: var(--text-muted); padding: 2px 4px;
      border-radius: 4px; opacity: 0; transition: all .15s;
    }
    .nav-biz-item:hover .nav-biz-del { opacity: 1; }
    .nav-biz-del:hover { color: #F87171; background: rgba(248,113,113,.1); }

    .nav-biz-add {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 10px; cursor: pointer; font-size: 12px;
      color: var(--accent-blue); font-weight: 600;
      border-top: 1px solid var(--border);
      transition: background .12s;
    }
    .nav-biz-add:hover { background: rgba(79,142,247,.08); }
    .nav-biz-counter {
      margin-left: auto; font-size: 10px;
      color: var(--text-muted); font-weight: 400;
    }
    .nav-biz-limit {
      padding: 8px 10px; font-size: 11px;
      color: var(--text-muted); text-align: center;
      border-top: 1px solid var(--border);
    }

    /* New biz form */
    .nav-biz-form {
      border-top: 1px solid var(--border);
      padding: 10px;
      background: var(--bg-secondary);
    }
    .nav-biz-form-title {
      font-size: 12px; font-weight: 700; color: var(--text);
      margin-bottom: 8px;
    }
    .nav-biz-form-hint {
      font-size: 11px; color: var(--text-muted); margin-bottom: 8px;
    }
    .nav-biz-form-label {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: .05em; color: var(--text-muted); margin-bottom: 5px;
    }
    .nav-biz-input {
      width: 100%; box-sizing: border-box;
      background: var(--bg-tertiary); border: 1px solid var(--border);
      border-radius: var(--radius-sm); color: var(--text);
      padding: 7px 10px; font-size: 12px; margin-bottom: 8px;
      outline: none;
    }
    .nav-biz-input:focus { border-color: var(--accent-blue); }
    .nav-biz-niches {
      display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 8px;
    }
    .nav-biz-niche {
      display: flex; align-items: center; gap: 5px;
      background: var(--bg-tertiary); border: 1.5px solid var(--border);
      border-radius: var(--radius-sm); padding: 5px 7px;
      font-size: 11px; font-weight: 600; cursor: pointer;
      transition: all .12s; word-break: break-word;
    }
    .nav-biz-niche:hover  { border-color: var(--nc); }
    .nav-biz-niche.selected { border-color: var(--nc); background: color-mix(in srgb, var(--nc) 15%, transparent); color: var(--nc); }
    .nav-biz-niche-custom {
      font-size: 10.5px; color: var(--text-muted);
      border-style: dashed;
    }
    .nav-biz-niche-custom.selected { color: var(--nc); border-style: solid; }
    .nav-biz-form-actions {
      display: flex; gap: 6px;
    }
    .nav-biz-form-cancel, .nav-biz-form-save {
      flex: 1; padding: 6px; border-radius: var(--radius-sm);
      font-size: 12px; font-weight: 600; cursor: pointer; border: none; transition: all .15s;
    }
    .nav-biz-form-cancel {
      background: var(--bg-tertiary); color: var(--text-muted); border: 1px solid var(--border);
    }
    .nav-biz-form-cancel:hover { color: var(--text); }
    .nav-biz-form-save {
      background: var(--accent-blue); color: #fff;
    }
    .nav-biz-form-save:hover { opacity: .9; }
    .nav-biz-form-save:disabled { opacity: .5; cursor: not-allowed; }
    .nav-biz-form-next {
      flex: 1; padding: 6px; border-radius: var(--radius-sm);
      font-size: 12px; font-weight: 600; cursor: pointer; border: none;
      background: var(--accent-blue); color: #fff; transition: opacity .15s;
    }
    .nav-biz-form-next:hover { opacity: .9; }

    /* Module grid in form */
    .nav-biz-mod-grid {
      display: grid; grid-template-columns: 1fr 1fr;
      gap: 4px; margin-bottom: 8px; max-height: 200px; overflow-y: auto;
    }
    .nav-biz-mod-grid::-webkit-scrollbar { width: 3px; }
    .nav-biz-mod-grid::-webkit-scrollbar-thumb { background: rgba(255,255,255,.1); border-radius: 2px; }
    .nav-biz-mod-item {
      display: flex; align-items: center; gap: 5px;
      padding: 5px 7px; border-radius: var(--radius-sm);
      border: 1.5px solid var(--border); background: var(--bg-tertiary);
      cursor: pointer; font-size: 11px; font-weight: 500;
      transition: all .12s; user-select: none;
    }
    .nav-biz-mod-item:hover { border-color: rgba(255,255,255,.2); }
    .nav-biz-mod-item.checked {
      border-color: var(--mc, var(--accent-blue));
      background: color-mix(in srgb, var(--mc, var(--accent-blue)) 15%, transparent);
    }
    .nav-biz-mod-icon { font-size: 12px; flex-shrink: 0; }
    .nav-biz-mod-label { flex: 1; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .nav-biz-mod-chk {
      font-size: 9px; color: var(--mc, var(--accent-blue));
      font-weight: 800; opacity: 0; flex-shrink: 0; transition: opacity .12s;
    }
    .nav-biz-mod-item.checked .nav-biz-mod-chk { opacity: 1; }

    /* Toast */
    .nav-toast {
      position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
      background: var(--bg-secondary); border: 1px solid var(--border);
      border-radius: 999px; padding: 9px 18px;
      font-size: 13px; font-weight: 600; z-index: 9999;
      animation: nav-toast-in .2s ease;
      pointer-events: none;
    }
    @keyframes nav-toast-in { from{opacity:0;transform:translateX(-50%) translateY(6px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }

    /* ── Modules edit button ── */
    .nav-modules-edit-btn {
      display: flex; align-items: center; gap: 7px;
      width: calc(100% - 20px); margin: 4px 10px 2px;
      padding: 7px 10px; border-radius: var(--radius-md);
      background: none; border: 1.5px dashed var(--border);
      color: var(--text-muted); font-size: 12px; font-weight: 600;
      cursor: pointer; transition: all .15s; text-align: left;
    }
    .nav-modules-edit-btn:hover {
      border-color: var(--accent-blue);
      color: var(--accent-blue);
      background: rgba(79,142,247,.06);
    }
    .nav-modules-edit-btn span:first-child { font-size: 14px; }

    /* ── Module manager overlay ── */
    #nav-mod-overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,.6); backdrop-filter: blur(6px);
      z-index: 2000;
      display: flex; align-items: center; justify-content: center;
      padding: 24px;
    }
    .nav-mod-panel {
      background: var(--bg-secondary); border: 1px solid var(--border);
      border-radius: var(--radius-xl); width: 100%; max-width: 520px;
      max-height: 88vh; display: flex; flex-direction: column;
      box-shadow: var(--shadow-xl);
      animation: biz-in .2s cubic-bezier(.34,1.2,.64,1);
    }
    .nav-mod-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 20px 22px 0; flex-shrink: 0;
    }
    .nav-mod-title { font-family: var(--font-display); font-size: 18px; font-weight: 800; }
    .nav-mod-close {
      background: none; border: none; font-size: 14px;
      color: var(--text-muted); cursor: pointer; padding: 4px 8px;
      border-radius: 6px; transition: all .15s;
    }
    .nav-mod-close:hover { background: var(--bg-tertiary); color: var(--text-primary); }
    .nav-mod-hint { font-size: 12px; color: var(--text-muted); padding: 6px 22px 14px; flex-shrink: 0; }
    .nav-mod-grid {
      display: grid; grid-template-columns: repeat(3, 1fr);
      gap: 8px; padding: 0 22px 16px; overflow-y: auto;
    }
    .nav-mod-chip {
      display: flex; flex-direction: column; align-items: center; gap: 6px;
      padding: 12px 8px; border-radius: var(--radius-md);
      background: var(--bg-tertiary); border: 2px solid var(--border);
      cursor: pointer; transition: all .15s; position: relative;
      text-align: center;
    }
    .nav-mod-chip:hover { border-color: rgba(79,142,247,.5); }
    .nav-mod-chip.active {
      border-color: var(--accent-blue);
      background: rgba(79,142,247,.1);
    }
    .nav-mod-chip-icon  { font-size: 20px; line-height: 1; }
    .nav-mod-chip-label { font-size: 11px; font-weight: 600; line-height: 1.3; color: var(--text-secondary); }
    .nav-mod-chip.active .nav-mod-chip-label { color: var(--text-primary); }
    .nav-mod-chip-check {
      position: absolute; top: 6px; right: 6px;
      font-size: 9px; font-weight: 800;
      width: 16px; height: 16px; border-radius: 50%;
      background: var(--accent-blue); color: #fff;
      display: flex; align-items: center; justify-content: center;
      opacity: 0; transition: opacity .15s;
    }
    .nav-mod-chip.active .nav-mod-chip-check { opacity: 1; }
    .nav-mod-foot {
      display: flex; gap: 10px; padding: 14px 22px;
      border-top: 1px solid var(--border); flex-shrink: 0;
      justify-content: flex-end;
    }
    .nav-mod-cancel {
      padding: 9px 20px; border-radius: var(--radius-md);
      background: var(--bg-tertiary); border: 1.5px solid var(--border);
      color: var(--text-primary); font-size: 13px; font-weight: 700;
      cursor: pointer; transition: all .15s;
    }
    .nav-mod-cancel:hover { border-color: var(--accent-blue); }
    .nav-mod-save {
      padding: 9px 24px; border-radius: var(--radius-md);
      background: linear-gradient(135deg,#667eea,#4F8EF7);
      border: none; color: #fff; font-size: 13px; font-weight: 700;
      cursor: pointer; transition: all .15s;
    }
    .nav-mod-save:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(79,142,247,.4); }
    .nav-mod-save:disabled { opacity: .6; transform: none; box-shadow: none; }

    /* ── Nav search ── */
    .nav-search-wrap {
      display: flex; align-items: center; gap: 6px;
      margin: 6px 10px 4px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 5px 10px;
      transition: border-color .15s;
    }
    .nav-search-wrap:focus-within {
      border-color: var(--accent-blue);
      background: rgba(79,142,247,.04);
    }
    .nav-search-icon {
      font-size: 14px; color: var(--text-muted); flex-shrink: 0; line-height: 1;
    }
    .nav-search-input {
      flex: 1; background: none; border: none; outline: none;
      color: var(--text-primary); font-size: 12px; font-weight: 500;
      caret-color: var(--accent-blue);
    }
    .nav-search-input::placeholder { color: var(--text-muted); }
    .nav-search-empty {
      padding: 14px 10px; text-align: center;
      font-size: 12px; color: var(--text-muted); font-weight: 500;
    }

    /* ── Nav toast ── */
    .nav-toast-msg {
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(8px);
      background: var(--bg-secondary); border: 1px solid var(--border);
      padding: 10px 20px; border-radius: var(--radius-full);
      font-size: 13px; font-weight: 600; z-index: 3000;
      box-shadow: var(--shadow-xl); opacity: 0;
      transition: all .25s; pointer-events: none;
    }
    .nav-toast-msg.show { opacity: 1; transform: translateX(-50%) translateY(0); }
  `
  document.head.appendChild(s)
}
