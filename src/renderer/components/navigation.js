import { navigate } from '../../core/router.js'
import { logoutUser, getCurrentUser, updateProfileCache } from '../services/auth.js'
import { getProfessionConfig } from '../../core/profession-config.js'
import { db } from '../services/firebase.js'
import {
  collection, getDocs, addDoc, deleteDoc, doc, updateDoc,
  serverTimestamp, query, orderBy, limit,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

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

  // Якщо активний другий бізнес — використовуємо його нішу для модулів і аватара
  const activeProfession = profile?.activeBusiness && profile?.activeBusinessProfession
    ? profile.activeBusinessProfession
    : profile?.profession

  const config = getProfessionConfig(activeProfession)

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

  sidebar.querySelector('#nav-user-btn').addEventListener('click', () => navigate('profile'))
  sidebar.querySelector('#nav-logout-btn').addEventListener('click', async () => { await logoutUser() })

  // Завантажуємо бізнеси асинхронно (тільки для business-плану)
  if (canMultiBiz) {
    initBizSwitcher(sidebar, profile)
  }
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

    <!-- Форма нового бізнесу -->
    <div class="nav-biz-form" id="nav-biz-form" style="display:none">
      <div class="nav-biz-form-title">Новий бізнес</div>
      <input type="text" class="nav-biz-input" id="nav-biz-name-inp" placeholder="Назва бізнесу" maxlength="40">
      <div class="nav-biz-niches">
        ${NICHES.map(n => `
          <div class="nav-biz-niche" data-niche="${n.id}" style="--nc:${n.color}">
            <span>${n.icon}</span><span>${n.label}</span>
          </div>
        `).join('')}
      </div>
      <div class="nav-biz-form-actions">
        <button class="nav-biz-form-cancel" id="nav-biz-form-cancel">Скасувати</button>
        <button class="nav-biz-form-save"   id="nav-biz-form-save">Створити</button>
      </div>
    </div>
  `

  let open = false
  const header   = switcher.querySelector('#nav-biz-header')
  const list     = switcher.querySelector('#nav-biz-list')
  const chevron  = switcher.querySelector('#nav-biz-chevron')
  const form     = switcher.querySelector('#nav-biz-form')

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
        activeBusiness:           bizId || null,
        activeBusinessName:       biz?.name       || null,
        activeBusinessProfession: biz?.profession || null,
      }

      await updateDoc(doc(db, 'users', user.uid), newProfilePatch)
      updateProfileCache(user.uid, newProfilePatch)

      // Перерендеруємо весь сайдбар щоб оновились модулі
      const updatedProfile = { ...profile, ...newProfilePatch }
      renderNavigation(sidebar, updatedProfile)

      navigate('business')
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
        await updateDoc(doc(db, 'users', user.uid), { activeBusiness: null })
        updateProfileCache(user.uid, { activeBusiness: null })
      }
      businesses = businesses.filter(b => b.id !== bizId)
      renderSwitcher(switcher, businesses, profile, user, sidebar)
    })
  })

  // Показати форму
  switcher.querySelector('#nav-biz-add-btn')?.addEventListener('click', () => {
    list.style.display = 'none'
    form.style.display = 'block'
    open = false
    // скидаємо форму
    switcher.querySelector('#nav-biz-name-inp').value = ''
    switcher.querySelectorAll('.nav-biz-niche').forEach(n => n.classList.remove('selected'))
  })

  // Ніша
  let selectedNiche = null
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

  // Зберегти новий бізнес
  switcher.querySelector('#nav-biz-form-save')?.addEventListener('click', async () => {
    const name = switcher.querySelector('#nav-biz-name-inp').value.trim()
    if (!name)          { showNavToast('Введіть назву'); return }
    if (!selectedNiche) { showNavToast('Оберіть нішу'); return }

    const saveBtn = switcher.querySelector('#nav-biz-form-save')
    saveBtn.disabled = true
    try {
      const ref  = await addDoc(collection(db, 'users', user.uid, 'businesses'), {
        name, profession: selectedNiche, createdAt: serverTimestamp(),
      })
      const newBiz = { id: ref.id, name, profession: selectedNiche }
      businesses = [...businesses, newBiz]

      form.style.display = 'none'
      renderSwitcher(switcher, businesses, profile, user, sidebar)
      showNavToast(`Бізнес "${name}" створено ✓`)
    } catch (err) {
      console.error(err)
      showNavToast('Помилка створення')
    } finally {
      saveBtn.disabled = false
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
  if (document.getElementById('nav-styles')) return
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
      font-size: 11px; font-weight: 700; color: var(--text-muted);
      text-transform: uppercase; letter-spacing: .05em; margin-bottom: 8px;
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
      transition: all .12s;
    }
    .nav-biz-niche:hover  { border-color: var(--nc); }
    .nav-biz-niche.selected { border-color: var(--nc); background: color-mix(in srgb, var(--nc) 15%, transparent); color: var(--nc); }
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
  `
  document.head.appendChild(s)
}
