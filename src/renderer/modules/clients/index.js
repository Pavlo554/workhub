// src/renderer/modules/clients/index.js
import { db } from '../../services/firebase.js'
import { getCurrentUser, getUserProfile, getActivePathSegments } from '../../services/auth.js'
import { checkPlanLimit } from '../../services/plan-guard.js'
import {
  collection, addDoc, getDocs, deleteDoc, doc, updateDoc,
  query, orderBy, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

// ── Constants ─────────────────────────────────────────────

const STATUSES = {
  active:   { label: 'Активний',   color: '#34D399', bg: 'rgba(52,211,153,.12)'  },
  lead:     { label: 'Лід',        color: '#FBBF24', bg: 'rgba(251,191,36,.12)'  },
  inactive: { label: 'Неактивний', color: '#6B7280', bg: 'rgba(107,114,128,.12)' },
}

const SOURCES = [
  { id: 'instagram', label: 'Instagram',    icon: '📸', color: '#E1306C' },
  { id: 'facebook',  label: 'Facebook Ads', icon: '👥', color: '#1877F2' },
  { id: 'google',    label: 'Google Ads',   icon: '🔍', color: '#4285F4' },
  { id: 'tiktok',    label: 'TikTok',       icon: '🎵', color: '#69C9D0' },
  { id: 'referral',  label: 'Рекомендація', icon: '🤝', color: '#34D399' },
  { id: 'site',      label: 'Сайт',         icon: '🌐', color: '#A78BFA' },
  { id: 'cold',      label: 'Холодний',     icon: '❄️', color: '#38BDF8' },
  { id: 'other',     label: 'Інше',         icon: '⭐', color: '#94A3B8' },
]

const INTERACTION_TYPES = {
  note:    { icon: '📝', label: 'Нотатка'      },
  call:    { icon: '📞', label: 'Дзвінок'      },
  email:   { icon: '✉️', label: 'Email'        },
  meeting: { icon: '🤝', label: 'Зустріч'      },
  message: { icon: '💬', label: 'Повідомлення' },
}

const MONTHS_UK = ['Січ','Лют','Бер','Кві','Тра','Чер','Лип','Сер','Вер','Жов','Лис','Гру']
const AVATAR_COLORS = ['#4F8EF7','#34D399','#A78BFA','#F472B6','#FBBF24','#F87171','#38BDF8','#FB923C']

// ── Helpers ───────────────────────────────────────────────

function getAvatarColor(name = '') {
  let h = 0; for (const c of name) h = c.charCodeAt(0) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}
function getInitials(name = '') {
  return name.split(' ').slice(0,2).map(w => w[0]?.toUpperCase() || '').join('')
}
function fmtDate(ts) {
  const d = ts?.toDate?.() || (ts instanceof Date ? ts : new Date())
  const now = new Date(), diff = (now - d) / 1000
  if (diff < 60)      return 'щойно'
  if (diff < 3600)    return `${Math.floor(diff/60)} хв тому`
  if (diff < 86400)   return `${Math.floor(diff/3600)} год тому`
  if (diff < 86400*7) return `${Math.floor(diff/86400)} дн тому`
  return d.toLocaleDateString('uk-UA', { day:'2-digit', month:'short', year:'numeric' })
}
function fmtMoney(n) {
  return n.toLocaleString('uk-UA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function getSource(id) {
  return SOURCES.find(s => s.id === id) || SOURCES[SOURCES.length - 1]
}

// ── Render ────────────────────────────────────────────────

export async function render(container) {
  injectStyles()
  const user    = getCurrentUser()
  const profile = await getUserProfile(user.uid)
  const base    = getActivePathSegments(user.uid)   // ['users',uid] or ['users',uid,'businesses',bizId]

  container.innerHTML = `
    <div class="cl-layout">

      <!-- ══ Left ══ -->
      <div class="cl-left" id="cl-left">

        <div class="cl-header">
          <div>
            <h1 class="cl-title">👥 Клієнти</h1>
            <p class="cl-sub" id="cl-sub">Завантаження...</p>
          </div>
          <div class="cl-header-actions">
            <div class="cl-tabs" id="cl-tabs">
              <button class="cl-tab active" data-tab="list">Список</button>
              <button class="cl-tab" data-tab="analytics">📊 Аналітика</button>
            </div>
            <button class="btn btn-primary" id="cl-add-btn">+ Клієнт</button>
          </div>
        </div>

        <!-- ── List view ── -->
        <div id="view-list">
          <div class="cl-toolbar">
            <div class="cl-search">
              <span>🔍</span>
              <input id="cl-search" class="cl-search-input" placeholder="Пошук за іменем, email, телефоном..." />
            </div>
            <div class="cl-filters" id="cl-filters">
              <button class="cl-filter active" data-st="all">Всі</button>
              <button class="cl-filter" data-st="active">Активні</button>
              <button class="cl-filter" data-st="lead">Ліди</button>
              <button class="cl-filter" data-st="inactive">Неактивні</button>
            </div>
          </div>
          <div class="cl-stats" id="cl-stats"></div>
          <div class="cl-grid" id="cl-grid">
            <div class="cl-loading"><div class="spinner"></div></div>
          </div>
        </div>

        <!-- ── Analytics view ── -->
        <div id="view-analytics" style="display:none">
          <div id="analytics-content">
            <div class="cl-loading"><div class="spinner"></div></div>
          </div>
        </div>

      </div>

      <!-- ══ Right: client detail ══ -->
      <div class="cl-right" id="cl-right" style="display:none">
        <div id="cl-detail"></div>
      </div>

    </div>

    <!-- ── Edit Modal ── -->
    <div class="cl-overlay" id="cl-modal" style="display:none">
      <div class="cl-modal">
        <div class="cl-modal-hd">
          <h2 class="cl-modal-title" id="cl-modal-title">Новий клієнт</h2>
          <button class="cl-modal-x" id="cl-modal-x">✕</button>
        </div>
        <form id="cl-form" novalidate>
          <div class="cl-modal-body">
            <div class="cl-row">
              <div class="field">
                <label>Ім'я *</label>
                <input id="f-name" type="text" class="input" placeholder="Іван Іванов" />
                <span class="field-error" id="e-name"></span>
              </div>
              <div class="field">
                <label>Статус</label>
                <select id="f-status" class="input">
                  <option value="active">🟢 Активний</option>
                  <option value="lead">🟡 Лід</option>
                  <option value="inactive">⚫ Неактивний</option>
                </select>
              </div>
            </div>
            <div class="cl-row">
              <div class="field">
                <label>Телефон</label>
                <input id="f-phone" type="tel" class="input" placeholder="+380 XX XXX XX XX" />
              </div>
              <div class="field">
                <label>Email</label>
                <input id="f-email" type="email" class="input" placeholder="client@email.com" />
              </div>
            </div>
            <div class="cl-row">
              <div class="field">
                <label>Telegram</label>
                <div class="cl-prefix-wrap">
                  <span class="cl-prefix">@</span>
                  <input id="f-telegram" type="text" class="input cl-prefix-input" placeholder="username" />
                </div>
              </div>
              <div class="field">
                <label>WhatsApp</label>
                <div class="cl-prefix-wrap">
                  <span class="cl-prefix">+</span>
                  <input id="f-whatsapp" type="tel" class="input cl-prefix-input" placeholder="380XXXXXXXXX" />
                </div>
              </div>
            </div>
            <div class="cl-row">
              <div class="field">
                <label>Компанія</label>
                <input id="f-company" type="text" class="input" placeholder="Назва компанії" />
              </div>
              <div class="field">
                <label>Джерело клієнта</label>
                <select id="f-source" class="input">
                  <option value="">— Не вказано</option>
                  ${SOURCES.map(s => `<option value="${s.id}">${s.icon} ${s.label}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="cl-row">
              <div class="field">
                <label>Сайт</label>
                <input id="f-site" type="url" class="input" placeholder="https://..." />
              </div>
              <div class="field">
                <label>Бюджет (грн)</label>
                <input id="f-budget" type="number" class="input" placeholder="10000" min="0" />
              </div>
            </div>
            <div class="field">
              <label>Нотатка</label>
              <textarea id="f-note" class="input" rows="3" placeholder="Додаткова інформація..." style="resize:vertical"></textarea>
            </div>
          </div>
          <div class="cl-modal-ft">
            <button type="button" class="btn btn-secondary" id="cl-cancel">Скасувати</button>
            <button type="submit" class="btn btn-primary" id="cl-submit">Зберегти</button>
          </div>
        </form>
      </div>
    </div>
  `

  // ── State ──────────────────────────────────────────────────
  let clients      = []
  let invoices     = []
  let activeFilter = 'all'
  let searchQ      = ''
  let selectedId   = null
  let editingId    = null
  let currentTab   = 'list'

  // ── Load ──────────────────────────────────────────────────
  async function load() {
    try {
      const [cSnap, iSnap] = await Promise.all([
        getDocs(query(collection(db, ...base, 'clients'), orderBy('createdAt', 'desc'))),
        getDocs(collection(db, ...base, 'invoices')).catch(() => ({ docs: [] })),
      ])
      clients  = cSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      invoices = iSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      renderStats()
      renderGrid()
      if (currentTab === 'analytics') renderAnalytics()
    } catch (err) {
      console.error(err)
    }
  }

  // ── Stats row ─────────────────────────────────────────────
  function renderStats() {
    const total  = clients.length
    const active = clients.filter(c => c.status === 'active').length
    const leads  = clients.filter(c => c.status === 'lead').length
    container.querySelector('#cl-sub').textContent =
      total === 0 ? 'Немає клієнтів' : `${total} клієнт${total === 1 ? '' : total < 5 ? 'и' : 'ів'}`
    if (total === 0) { container.querySelector('#cl-stats').innerHTML = ''; return }
    container.querySelector('#cl-stats').innerHTML = `
      <div class="cl-stat"><span class="cl-stat-n" style="color:#34D399">${active}</span><span class="cl-stat-l">Активних</span></div>
      <div class="cl-stat"><span class="cl-stat-n" style="color:#FBBF24">${leads}</span><span class="cl-stat-l">Ліди</span></div>
      <div class="cl-stat"><span class="cl-stat-n">${total}</span><span class="cl-stat-l">Всього</span></div>
    `
  }

  // ── List ──────────────────────────────────────────────────
  function filtered() {
    return clients.filter(c => {
      const matchSt = activeFilter === 'all' || (c.status || 'active') === activeFilter
      const q = searchQ.toLowerCase()
      const matchQ = !q || [c.name, c.email, c.phone, c.company, c.telegram]
        .filter(Boolean).some(v => v.toLowerCase().includes(q))
      return matchSt && matchQ
    })
  }

  function renderGrid() {
    const el   = container.querySelector('#cl-grid')
    const list = filtered()
    if (list.length === 0) {
      el.innerHTML = `
        <div class="cl-empty">
          <div class="cl-empty-icon">👥</div>
          <div class="cl-empty-title">${searchQ || activeFilter !== 'all' ? 'Нічого не знайдено' : 'Клієнтів ще немає'}</div>
          <div class="cl-empty-desc">${searchQ || activeFilter !== 'all' ? 'Спробуйте змінити фільтр' : 'Натисніть "+ Клієнт" щоб додати'}</div>
        </div>`
      return
    }
    el.innerHTML = list.map(c => {
      const color = getAvatarColor(c.name)
      const st    = STATUSES[c.status || 'active']
      const src   = c.source ? getSource(c.source) : null
      return `
        <div class="cl-card ${c.id === selectedId ? 'selected' : ''}" data-id="${c.id}">
          <div class="cl-card-av" style="background:${color}22;color:${color}">${getInitials(c.name)}</div>
          <div class="cl-card-info">
            <div class="cl-card-name">${c.name}</div>
            ${c.company ? `<div class="cl-card-co">🏢 ${c.company}</div>` : ''}
            <div class="cl-card-contacts">
              ${c.phone    ? `<span>📞 ${c.phone}</span>` : ''}
              ${c.telegram ? `<span>✈️ @${c.telegram}</span>` : ''}
              ${src        ? `<span style="color:${src.color}">${src.icon} ${src.label}</span>` : ''}
            </div>
          </div>
          <div class="cl-card-right">
            <span class="cl-badge" style="color:${st.color};background:${st.bg}">${st.label}</span>
            <div class="cl-card-btns">
              <button class="cl-icon-btn cl-edit-btn" data-id="${c.id}" title="Редагувати">✏️</button>
              <button class="cl-icon-btn cl-del-btn"  data-id="${c.id}" title="Видалити">🗑</button>
            </div>
          </div>
        </div>`
    }).join('')

    el.querySelectorAll('.cl-card').forEach(card => {
      card.addEventListener('click', e => { if (!e.target.closest('.cl-icon-btn')) openDetail(card.dataset.id) })
    })
    el.querySelectorAll('.cl-edit-btn').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); openModal(clients.find(c => c.id === btn.dataset.id)) })
    })
    el.querySelectorAll('.cl-del-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation()
        if (!confirm('Видалити клієнта?')) return
        if (selectedId === btn.dataset.id) closeDetail()
        await deleteDoc(doc(db, ...base, 'clients', btn.dataset.id))
        await load()
      })
    })
  }

  // ── Analytics ─────────────────────────────────────────────
  function renderAnalytics() {
    const el = container.querySelector('#analytics-content')
    const now = new Date()

    // KPI data
    const total     = clients.length
    const thisMonth = clients.filter(c => {
      const d = c.createdAt?.toDate?.()
      return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    }).length
    const lastMonth = clients.filter(c => {
      const d = c.createdAt?.toDate?.()
      if (!d) return false
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      return d.getMonth() === lm.getMonth() && d.getFullYear() === lm.getFullYear()
    }).length
    const active   = clients.filter(c => c.status === 'active').length
    const convRate = total > 0 ? Math.round((active / total) * 100) : 0

    // Revenue from paid invoices
    const paidInvoices  = invoices.filter(i => i.status === 'paid')
    const totalRevenue  = paidInvoices.reduce((s, i) => s + (Number(i.amount) || 0), 0)
    const monthRevenue  = paidInvoices.filter(i => {
      const d = i.paidAt?.toDate?.() || i.updatedAt?.toDate?.() || i.createdAt?.toDate?.()
      return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    }).reduce((s, i) => s + (Number(i.amount) || 0), 0)

    // Budget (sum of client budgets)
    const totalBudget = clients.reduce((s, c) => s + (Number(c.budget) || 0), 0)
    const roi = totalBudget > 0 ? Math.round(((totalRevenue - totalBudget) / totalBudget) * 100) : null

    // Source breakdown
    const sourceMap = {}
    clients.forEach(c => {
      const key = c.source || 'other'
      sourceMap[key] = (sourceMap[key] || 0) + 1
    })
    const sourceData = SOURCES
      .map(s => ({ ...s, count: sourceMap[s.id] || 0 }))
      .filter(s => s.count > 0)
      .sort((a, b) => b.count - a.count)
    const maxSrc = sourceData[0]?.count || 1

    // Monthly chart — last 6 months
    const months = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const count = clients.filter(c => {
        const cd = c.createdAt?.toDate?.()
        return cd && cd.getMonth() === d.getMonth() && cd.getFullYear() === d.getFullYear()
      }).length
      months.push({ label: MONTHS_UK[d.getMonth()], count })
    }
    const maxMonth = Math.max(...months.map(m => m.count), 1)

    // Growth indicator
    const growthDiff  = thisMonth - lastMonth
    const growthSign  = growthDiff > 0 ? '+' : ''
    const growthColor = growthDiff > 0 ? '#34D399' : growthDiff < 0 ? '#F87171' : '#6B7280'

    el.innerHTML = `
      <div class="an-page">

        <!-- KPI Cards -->
        <div class="an-kpi-row">
          <div class="an-kpi" style="--kc:#4F8EF7">
            <div class="an-kpi-top">
              <div class="an-kpi-icon">👥</div>
              <div class="an-kpi-badge" style="color:${growthColor}">
                ${growthDiff !== 0 ? `${growthSign}${growthDiff} цей міс.` : 'без змін'}
              </div>
            </div>
            <div class="an-kpi-val">${total}</div>
            <div class="an-kpi-label">Всього клієнтів</div>
          </div>

          <div class="an-kpi" style="--kc:#34D399">
            <div class="an-kpi-top">
              <div class="an-kpi-icon">🆕</div>
              <div class="an-kpi-badge" style="color:#34D399">цього місяця</div>
            </div>
            <div class="an-kpi-val">${thisMonth}</div>
            <div class="an-kpi-label">Нових клієнтів</div>
          </div>

          <div class="an-kpi" style="--kc:#A78BFA">
            <div class="an-kpi-top">
              <div class="an-kpi-icon">🎯</div>
              <div class="an-kpi-badge" style="color:#A78BFA">${active} активних</div>
            </div>
            <div class="an-kpi-val">${convRate}%</div>
            <div class="an-kpi-label">Конверсія в клієнти</div>
          </div>

          <div class="an-kpi" style="--kc:#FBBF24">
            <div class="an-kpi-top">
              <div class="an-kpi-icon">💰</div>
              <div class="an-kpi-badge" style="color:#FBBF24">${fmtMoney(monthRevenue)} грн цей міс.</div>
            </div>
            <div class="an-kpi-val">${fmtMoney(totalRevenue)}</div>
            <div class="an-kpi-label">Дохід загалом (грн)</div>
          </div>

          ${roi !== null ? `
          <div class="an-kpi" style="--kc:${roi >= 0 ? '#34D399' : '#F87171'}">
            <div class="an-kpi-top">
              <div class="an-kpi-icon">📈</div>
              <div class="an-kpi-badge" style="color:${roi >= 0 ? '#34D399' : '#F87171'}">${roi >= 0 ? 'прибуток' : 'збиток'}</div>
            </div>
            <div class="an-kpi-val" style="color:${roi >= 0 ? '#34D399' : '#F87171'}">${roi >= 0 ? '+' : ''}${roi}%</div>
            <div class="an-kpi-label">ROI реклами</div>
          </div>` : ''}
        </div>

        <!-- Charts row -->
        <div class="an-charts">

          <!-- Monthly trend -->
          <div class="an-card">
            <div class="an-card-title">📈 Приріст клієнтів (6 місяців)</div>
            <div class="an-bar-chart">
              ${months.map(m => `
                <div class="an-bar-col">
                  <div class="an-bar-wrap">
                    <div class="an-bar-fill" style="height:${m.count === 0 ? 4 : Math.round((m.count / maxMonth) * 100)}%;background:var(--accent-blue)">
                      ${m.count > 0 ? `<div class="an-bar-tip">${m.count}</div>` : ''}
                    </div>
                  </div>
                  <div class="an-bar-label">${m.label}</div>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Source breakdown -->
          <div class="an-card">
            <div class="an-card-title">🎯 Джерела клієнтів</div>
            ${sourceData.length === 0
              ? `<div class="an-empty">Вкажіть джерело при додаванні клієнта</div>`
              : sourceData.map(s => `
                  <div class="an-src-row">
                    <div class="an-src-meta">
                      <span class="an-src-icon">${s.icon}</span>
                      <span class="an-src-label">${s.label}</span>
                      <span class="an-src-count">${s.count}</span>
                    </div>
                    <div class="an-src-bar-wrap">
                      <div class="an-src-bar" style="width:${Math.round((s.count/maxSrc)*100)}%;background:${s.color}"></div>
                    </div>
                    <div class="an-src-pct">${Math.round((s.count/total)*100)}%</div>
                  </div>
                `).join('')
            }
          </div>

        </div>

        <!-- Status breakdown -->
        <div class="an-card an-status-card">
          <div class="an-card-title">📊 Розподіл за статусом</div>
          <div class="an-status-row">
            ${Object.entries(STATUSES).map(([key, st]) => {
              const cnt = clients.filter(c => (c.status || 'active') === key).length
              const pct = total > 0 ? Math.round((cnt / total) * 100) : 0
              return `
                <div class="an-status-item">
                  <div class="an-status-top">
                    <span class="an-status-dot" style="background:${st.color}"></span>
                    <span class="an-status-lbl">${st.label}</span>
                    <span class="an-status-cnt">${cnt}</span>
                  </div>
                  <div class="an-status-bar-wrap">
                    <div class="an-status-bar" style="width:${pct}%;background:${st.color}"></div>
                  </div>
                  <div class="an-status-pct">${pct}%</div>
                </div>
              `
            }).join('')}
          </div>
        </div>

        <!-- Revenue breakdown -->
        ${totalRevenue > 0 ? `
        <div class="an-card">
          <div class="an-card-title">💰 Фінансова зведка</div>
          <div class="an-finance-row">
            <div class="an-finance-item">
              <div class="an-finance-val" style="color:#34D399">${fmtMoney(totalRevenue)} грн</div>
              <div class="an-finance-label">Загальний дохід</div>
            </div>
            <div class="an-finance-item">
              <div class="an-finance-val" style="color:#4F8EF7">${fmtMoney(monthRevenue)} грн</div>
              <div class="an-finance-label">Дохід цього місяця</div>
            </div>
            <div class="an-finance-item">
              <div class="an-finance-val">${paidInvoices.length}</div>
              <div class="an-finance-label">Оплачених рахунків</div>
            </div>
            <div class="an-finance-item">
              <div class="an-finance-val">${total > 0 ? fmtMoney(Math.round(totalRevenue / total)) : '—'} грн</div>
              <div class="an-finance-label">Середній чек</div>
            </div>
          </div>
        </div>` : ''}

      </div>
    `
  }

  // ── Tabs ──────────────────────────────────────────────────
  container.querySelector('#cl-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.cl-tab')
    if (!btn) return
    currentTab = btn.dataset.tab
    container.querySelectorAll('.cl-tab').forEach(b => b.classList.toggle('active', b === btn))
    container.querySelector('#view-list').style.display      = currentTab === 'list'      ? '' : 'none'
    container.querySelector('#view-analytics').style.display = currentTab === 'analytics' ? '' : 'none'
    if (currentTab === 'analytics') renderAnalytics()
    if (currentTab === 'list' && selectedId) {
      container.querySelector('#cl-right').style.display = 'flex'
    }
  })

  // ── Filters / Search ──────────────────────────────────────
  container.querySelector('#cl-filters').addEventListener('click', e => {
    const btn = e.target.closest('.cl-filter')
    if (!btn) return
    activeFilter = btn.dataset.st
    container.querySelectorAll('.cl-filter').forEach(b => b.classList.toggle('active', b === btn))
    renderGrid()
  })
  container.querySelector('#cl-search').addEventListener('input', e => {
    searchQ = e.target.value.trim()
    renderGrid()
  })

  // ── Detail panel ──────────────────────────────────────────
  async function openDetail(id) {
    selectedId = id
    renderGrid()
    const client   = clients.find(c => c.id === id)
    if (!client) return
    const right    = container.querySelector('#cl-right')
    const detailEl = container.querySelector('#cl-detail')
    right.style.display = 'flex'

    let interactions = []
    try {
      const iSnap = await getDocs(
        query(collection(db, ...base, 'clients', id, 'interactions'), orderBy('createdAt', 'desc'))
      )
      interactions = iSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch (_) {}

    const color = getAvatarColor(client.name)
    const st    = STATUSES[client.status || 'active']
    const src   = client.source ? getSource(client.source) : null

    detailEl.innerHTML = `
      <div class="cl-detail">
        <div class="cl-detail-hd">
          <button class="cl-detail-close" id="cl-detail-close">✕</button>
        </div>
        <div class="cl-profile">
          <div class="cl-profile-av" style="background:${color}22;color:${color}">${getInitials(client.name)}</div>
          <div class="cl-profile-name">${client.name}</div>
          ${client.company ? `<div class="cl-profile-co">🏢 ${client.company}</div>` : ''}
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center">
            <span class="cl-badge" style="color:${st.color};background:${st.bg}">${st.label}</span>
            ${src ? `<span class="cl-badge" style="color:${src.color};background:${src.color}22">${src.icon} ${src.label}</span>` : ''}
          </div>
        </div>

        <div class="cl-quick">
          ${client.phone    ? `<a class="cl-quick-btn" href="tel:${client.phone}" title="Зателефонувати">📞<span>Дзвінок</span></a>` : ''}
          ${client.email    ? `<a class="cl-quick-btn" href="mailto:${client.email}" title="Email">✉️<span>Email</span></a>` : ''}
          ${client.telegram ? `<a class="cl-quick-btn" href="https://t.me/${client.telegram}" target="_blank">✈️<span>Telegram</span></a>` : ''}
          ${client.whatsapp ? `<a class="cl-quick-btn" href="https://wa.me/${client.whatsapp}" target="_blank">💬<span>WhatsApp</span></a>` : ''}
          ${client.site     ? `<a class="cl-quick-btn" href="${client.site}" target="_blank">🌐<span>Сайт</span></a>` : ''}
          <button class="cl-quick-btn" id="cl-edit-detail">✏️<span>Редагувати</span></button>
        </div>

        <div class="cl-section">
          <div class="cl-section-title">Контакти</div>
          <div class="cl-contacts-list">
            ${client.phone    ? `<div class="cl-contact-row"><span>📞</span><span>${client.phone}</span></div>` : ''}
            ${client.email    ? `<div class="cl-contact-row"><span>✉️</span><span>${client.email}</span></div>` : ''}
            ${client.telegram ? `<div class="cl-contact-row"><span>✈️</span><a href="https://t.me/${client.telegram}" target="_blank" class="cl-link">@${client.telegram}</a></div>` : ''}
            ${client.whatsapp ? `<div class="cl-contact-row"><span>💬</span><a href="https://wa.me/${client.whatsapp}" target="_blank" class="cl-link">+${client.whatsapp}</a></div>` : ''}
            ${client.site     ? `<div class="cl-contact-row"><span>🌐</span><a href="${client.site}" target="_blank" class="cl-link">${client.site}</a></div>` : ''}
            ${client.budget   ? `<div class="cl-contact-row"><span>💰</span><span>${fmtMoney(client.budget)} грн</span></div>` : ''}
          </div>
          ${client.note ? `<div class="cl-note-box">${client.note}</div>` : ''}
        </div>

        <div class="cl-section">
          <div class="cl-section-title">Комунікація</div>
          <div class="cl-add-inter">
            <div class="cl-inter-types" id="cl-inter-types">
              ${Object.entries(INTERACTION_TYPES).map(([k,v]) => `
                <button class="cl-type-btn ${k==='note'?'active':''}" data-type="${k}" title="${v.label}">${v.icon}</button>
              `).join('')}
            </div>
            <textarea class="input cl-inter-input" id="cl-inter-text" rows="2" placeholder="Введіть текст..."></textarea>
            <button class="btn btn-primary cl-inter-save" id="cl-inter-save">Зберегти</button>
          </div>
          <div class="cl-history" id="cl-history">
            ${interactions.length === 0
              ? `<div class="cl-history-empty">Ще немає записів комунікацій</div>`
              : interactions.map(i => {
                  const t = INTERACTION_TYPES[i.type] || INTERACTION_TYPES.note
                  return `
                    <div class="cl-inter-item">
                      <div class="cl-inter-icon">${t.icon}</div>
                      <div class="cl-inter-body">
                        <div class="cl-inter-meta">
                          <span class="cl-inter-type">${t.label}</span>
                          <span class="cl-inter-date">${fmtDate(i.createdAt)}</span>
                        </div>
                        <div class="cl-inter-text">${i.text}</div>
                      </div>
                      <button class="cl-inter-del" data-iid="${i.id}">✕</button>
                    </div>`
                }).join('')}
          </div>
        </div>
      </div>
    `

    detailEl.querySelector('#cl-detail-close').addEventListener('click', closeDetail)
    detailEl.querySelector('#cl-edit-detail')?.addEventListener('click', () => openModal(client))

    let selType = 'note'
    detailEl.querySelector('#cl-inter-types').addEventListener('click', e => {
      const btn = e.target.closest('.cl-type-btn')
      if (!btn) return
      selType = btn.dataset.type
      detailEl.querySelectorAll('.cl-type-btn').forEach(b => b.classList.toggle('active', b === btn))
    })

    detailEl.querySelector('#cl-inter-save').addEventListener('click', async () => {
      const text = detailEl.querySelector('#cl-inter-text').value.trim()
      if (!text) return
      const saveBtn = detailEl.querySelector('#cl-inter-save')
      saveBtn.disabled = true
      try {
        await addDoc(collection(db, ...base, 'clients', id, 'interactions'), {
          type: selType, text, createdAt: serverTimestamp()
        })
        await openDetail(id)
      } catch (err) { console.error(err) } finally { saveBtn.disabled = false }
    })

    detailEl.querySelectorAll('.cl-inter-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        await deleteDoc(doc(db, ...base, 'clients', id, 'interactions', btn.dataset.iid))
        await openDetail(id)
      })
    })
  }

  function closeDetail() {
    selectedId = null
    container.querySelector('#cl-right').style.display = 'none'
    renderGrid()
  }

  // ── Modal ─────────────────────────────────────────────────
  function openModal(client = null) {
    editingId = client?.id || null
    container.querySelector('#cl-modal-title').textContent = client ? 'Редагувати клієнта' : 'Новий клієнт'
    container.querySelector('#f-name').value     = client?.name     || ''
    container.querySelector('#f-phone').value    = client?.phone    || ''
    container.querySelector('#f-email').value    = client?.email    || ''
    container.querySelector('#f-company').value  = client?.company  || ''
    container.querySelector('#f-telegram').value = client?.telegram || ''
    container.querySelector('#f-whatsapp').value = client?.whatsapp || ''
    container.querySelector('#f-site').value     = client?.site     || ''
    container.querySelector('#f-budget').value   = client?.budget   || ''
    container.querySelector('#f-status').value   = client?.status   || 'active'
    container.querySelector('#f-source').value   = client?.source   || ''
    container.querySelector('#f-note').value     = client?.note     || ''
    container.querySelector('#e-name').textContent = ''
    container.querySelector('#cl-modal').style.display = 'flex'
    setTimeout(() => container.querySelector('#f-name').focus(), 80)
  }

  function closeModal() {
    container.querySelector('#cl-modal').style.display = 'none'
    editingId = null
  }

  container.querySelector('#cl-add-btn').addEventListener('click', () => {
    if (!checkPlanLimit(profile, 'clients', clients.length)) return
    openModal()
  })
  container.querySelector('#cl-modal-x').addEventListener('click', closeModal)
  container.querySelector('#cl-cancel').addEventListener('click', closeModal)
  container.querySelector('#cl-modal').addEventListener('click', e => {
    if (e.target === container.querySelector('#cl-modal')) closeModal()
  })

  // ── Save ──────────────────────────────────────────────────
  container.querySelector('#cl-form').addEventListener('submit', async e => {
    e.preventDefault()
    const name = container.querySelector('#f-name').value.trim()
    if (!name) { container.querySelector('#e-name').textContent = "Введіть ім'я"; return }
    const btn = container.querySelector('#cl-submit')
    btn.disabled = true; btn.innerHTML = '<div class="spinner"></div>'
    const data = {
      name,
      phone:    container.querySelector('#f-phone').value.trim()    || null,
      email:    container.querySelector('#f-email').value.trim()    || null,
      company:  container.querySelector('#f-company').value.trim()  || null,
      telegram: container.querySelector('#f-telegram').value.trim().replace(/^@/,'') || null,
      whatsapp: container.querySelector('#f-whatsapp').value.trim().replace(/^\+/,'') || null,
      site:     container.querySelector('#f-site').value.trim()     || null,
      budget:   Number(container.querySelector('#f-budget').value)  || null,
      status:   container.querySelector('#f-status').value,
      source:   container.querySelector('#f-source').value          || null,
      note:     container.querySelector('#f-note').value.trim()     || null,
    }
    try {
      if (editingId) {
        await updateDoc(doc(db, ...base, 'clients', editingId), { ...data, updatedAt: serverTimestamp() })
      } else {
        await addDoc(collection(db, ...base, 'clients'), { ...data, createdAt: serverTimestamp() })
      }
      closeModal()
      await load()
      if (editingId && selectedId === editingId) await openDetail(editingId)
    } catch (err) { console.error(err) } finally {
      btn.disabled = false; btn.innerHTML = 'Зберегти'
    }
  })

  await load()
}

// ── Styles ────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('clients-styles')) return
  const s = document.createElement('style')
  s.id = 'clients-styles'
  s.textContent = `
    /* Layout */
    .cl-layout { display:flex; height:100%; overflow:hidden; }
    .cl-left   { flex:1; min-width:0; padding:32px 28px; overflow-y:auto; display:flex; flex-direction:column; }
    .cl-right  { width:380px; flex-shrink:0; border-left:1px solid var(--border); overflow-y:auto; background:var(--bg-primary); display:flex; flex-direction:column; }

    /* Header */
    .cl-header         { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:20px; }
    .cl-header-actions { display:flex; align-items:center; gap:10px; flex-wrap:wrap; justify-content:flex-end; }
    .cl-title          { font-family:var(--font-display); font-size:26px; font-weight:700; letter-spacing:-0.02em; margin-bottom:4px; }
    .cl-sub            { font-size:13px; color:var(--text-secondary); }

    /* Tabs */
    .cl-tabs { display:flex; background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-lg); padding:3px; gap:2px; }
    .cl-tab  { padding:6px 14px; border-radius:calc(var(--radius-lg) - 2px); font-size:13px; font-weight:500; cursor:pointer; color:var(--text-muted); transition:all .2s; background:transparent; }
    .cl-tab.active { background:var(--bg-primary); color:var(--text-primary); box-shadow:0 1px 4px rgba(0,0,0,.3); }

    /* Toolbar */
    .cl-toolbar { display:flex; flex-direction:column; gap:10px; margin-bottom:14px; }
    .cl-search  { display:flex; align-items:center; gap:10px; background:var(--bg-secondary); border:1.5px solid var(--border); border-radius:var(--radius-sm); padding:9px 14px; transition:border-color .2s; }
    .cl-search:focus-within { border-color:var(--accent-blue); }
    .cl-search-input { flex:1; background:none; font-size:14px; color:var(--text-primary); }
    .cl-search-input::placeholder { color:var(--text-muted); }

    .cl-filters { display:flex; gap:6px; flex-wrap:wrap; }
    .cl-filter  { padding:5px 14px; border-radius:var(--radius-full); font-size:13px; font-weight:500; cursor:pointer; border:1.5px solid var(--border); color:var(--text-secondary); transition:all .2s; background:transparent; }
    .cl-filter:hover { border-color:rgba(255,255,255,.2); color:var(--text-primary); }
    .cl-filter.active { background:var(--accent-blue); border-color:var(--accent-blue); color:#fff; }

    /* Stats */
    .cl-stats  { display:flex; gap:12px; margin-bottom:14px; flex-wrap:wrap; }
    .cl-stat   { display:flex; align-items:center; gap:8px; background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-lg); padding:8px 16px; }
    .cl-stat-n { font-family:var(--font-display); font-size:20px; font-weight:800; }
    .cl-stat-l { font-size:12px; color:var(--text-muted); }

    /* Grid */
    .cl-loading { display:flex; justify-content:center; padding:60px; }
    .cl-grid    { display:flex; flex-direction:column; gap:8px; }

    .cl-card { display:flex; align-items:center; gap:12px; background:var(--bg-secondary); border:1.5px solid var(--border); border-radius:var(--radius-lg); padding:14px 16px; cursor:pointer; transition:all .2s; }
    .cl-card:hover   { border-color:rgba(255,255,255,.15); transform:translateX(2px); }
    .cl-card.selected { border-color:var(--accent-blue); background:rgba(79,142,247,.06); }

    .cl-card-av { width:42px; height:42px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:15px; flex-shrink:0; }
    .cl-card-info { flex:1; min-width:0; }
    .cl-card-name { font-weight:600; font-size:14px; margin-bottom:2px; }
    .cl-card-co   { font-size:12px; color:var(--text-secondary); margin-bottom:3px; }
    .cl-card-contacts { display:flex; gap:10px; flex-wrap:wrap; }
    .cl-card-contacts span { font-size:11px; color:var(--text-muted); }

    .cl-card-right { display:flex; flex-direction:column; align-items:flex-end; gap:6px; flex-shrink:0; }
    .cl-badge { font-size:11px; font-weight:600; padding:3px 10px; border-radius:var(--radius-full); white-space:nowrap; }
    .cl-card-btns { display:flex; gap:4px; opacity:0; transition:opacity .2s; }
    .cl-card:hover .cl-card-btns { opacity:1; }
    .cl-icon-btn { width:28px; height:28px; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:13px; cursor:pointer; transition:background .2s; }
    .cl-icon-btn:hover { background:rgba(255,255,255,.1); }

    .cl-empty       { text-align:center; padding:60px 24px; }
    .cl-empty-icon  { font-size:48px; margin-bottom:12px; }
    .cl-empty-title { font-family:var(--font-display); font-size:18px; font-weight:600; margin-bottom:6px; }
    .cl-empty-desc  { font-size:13px; color:var(--text-muted); }

    /* ── Detail ── */
    .cl-detail     { padding:0 0 40px; }
    .cl-detail-hd  { display:flex; justify-content:flex-end; padding:16px 16px 0; }
    .cl-detail-close { width:30px; height:30px; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:14px; color:var(--text-muted); transition:all .2s; }
    .cl-detail-close:hover { background:var(--accent-red-dim); color:var(--accent-red); }

    .cl-profile     { display:flex; flex-direction:column; align-items:center; gap:8px; padding:16px 24px 20px; border-bottom:1px solid var(--border); }
    .cl-profile-av  { width:72px; height:72px; border-radius:20px; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:26px; }
    .cl-profile-name { font-family:var(--font-display); font-size:20px; font-weight:700; text-align:center; }
    .cl-profile-co  { font-size:13px; color:var(--text-secondary); }

    .cl-quick       { display:flex; gap:8px; padding:16px; flex-wrap:wrap; border-bottom:1px solid var(--border); }
    .cl-quick-btn   { display:flex; flex-direction:column; align-items:center; gap:4px; padding:10px 12px; border-radius:var(--radius-lg); background:var(--bg-secondary); border:1px solid var(--border); cursor:pointer; transition:all .2s; color:var(--text-primary); text-decoration:none; font-size:20px; flex:1; min-width:56px; }
    .cl-quick-btn span { font-size:10px; color:var(--text-muted); font-weight:500; white-space:nowrap; }
    .cl-quick-btn:hover { border-color:var(--accent-blue); background:rgba(79,142,247,.08); }

    .cl-section       { padding:16px 20px; border-bottom:1px solid var(--border); }
    .cl-section-title { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--text-muted); margin-bottom:12px; }
    .cl-contacts-list { display:flex; flex-direction:column; gap:8px; }
    .cl-contact-row   { display:flex; align-items:center; gap:10px; font-size:13px; }
    .cl-link { color:var(--accent-blue); text-decoration:none; }
    .cl-link:hover { text-decoration:underline; }
    .cl-note-box { margin-top:12px; padding:12px; background:var(--bg-secondary); border-radius:var(--radius-lg); font-size:13px; color:var(--text-secondary); line-height:1.6; }

    .cl-add-inter  { display:flex; flex-direction:column; gap:8px; margin-bottom:16px; }
    .cl-inter-types { display:flex; gap:6px; }
    .cl-type-btn   { width:36px; height:36px; border-radius:10px; font-size:16px; display:flex; align-items:center; justify-content:center; cursor:pointer; border:2px solid var(--border); background:var(--bg-secondary); transition:all .2s; }
    .cl-type-btn:hover  { border-color:var(--accent-blue); }
    .cl-type-btn.active { border-color:var(--accent-blue); background:rgba(79,142,247,.12); }
    .cl-inter-input  { resize:vertical; font-size:13px; }
    .cl-inter-save   { align-self:flex-end; }

    .cl-history      { display:flex; flex-direction:column; gap:10px; }
    .cl-history-empty { text-align:center; font-size:13px; color:var(--text-muted); padding:20px 0; }
    .cl-inter-item   { display:flex; gap:10px; align-items:flex-start; background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-lg); padding:12px; }
    .cl-inter-icon   { font-size:18px; flex-shrink:0; margin-top:1px; }
    .cl-inter-body   { flex:1; min-width:0; }
    .cl-inter-meta   { display:flex; justify-content:space-between; margin-bottom:4px; }
    .cl-inter-type   { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; color:var(--text-muted); }
    .cl-inter-date   { font-size:11px; color:var(--text-muted); }
    .cl-inter-text   { font-size:13px; line-height:1.5; word-break:break-word; }
    .cl-inter-del    { width:22px; height:22px; border-radius:6px; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:11px; color:var(--text-muted); cursor:pointer; transition:all .2s; }
    .cl-inter-del:hover { background:var(--accent-red-dim); color:var(--accent-red); }

    /* ── Analytics ── */
    .an-page      { padding:24px 4px; display:flex; flex-direction:column; gap:20px; }

    .an-kpi-row   { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:14px; }
    .an-kpi       {
      background:var(--bg-secondary); border:1px solid var(--border);
      border-radius:var(--radius-xl); padding:20px;
      border-top:3px solid var(--kc, var(--border));
      transition:transform .2s, box-shadow .2s;
    }
    .an-kpi:hover { transform:translateY(-2px); box-shadow:0 6px 20px rgba(0,0,0,.25); }
    .an-kpi-top   { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }
    .an-kpi-icon  { font-size:22px; }
    .an-kpi-badge { font-size:11px; font-weight:600; }
    .an-kpi-val   { font-family:var(--font-display); font-size:32px; font-weight:900; letter-spacing:-0.02em; line-height:1; margin-bottom:6px; }
    .an-kpi-label { font-size:12px; color:var(--text-muted); }

    .an-charts  { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    @media (max-width:800px) { .an-charts { grid-template-columns:1fr; } }

    .an-card       { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-xl); padding:20px; }
    .an-card-title { font-size:13px; font-weight:700; margin-bottom:18px; color:var(--text-secondary); }
    .an-empty      { font-size:13px; color:var(--text-muted); text-align:center; padding:20px 0; }

    /* Bar chart */
    .an-bar-chart { display:flex; align-items:flex-end; gap:6px; height:120px; }
    .an-bar-col   { flex:1; display:flex; flex-direction:column; align-items:center; gap:6px; height:100%; }
    .an-bar-wrap  { flex:1; width:100%; display:flex; align-items:flex-end; }
    .an-bar-fill  {
      width:100%; border-radius:6px 6px 0 0; min-height:4px;
      position:relative; transition:height .6s cubic-bezier(.34,1.56,.64,1);
    }
    .an-bar-tip   { position:absolute; top:-20px; left:50%; transform:translateX(-50%); font-size:11px; font-weight:700; color:var(--text-primary); white-space:nowrap; }
    .an-bar-label { font-size:11px; color:var(--text-muted); }

    /* Source breakdown */
    .an-src-row    { display:grid; grid-template-columns:140px 1fr 40px; align-items:center; gap:10px; margin-bottom:10px; }
    .an-src-meta   { display:flex; align-items:center; gap:6px; }
    .an-src-icon   { font-size:16px; flex-shrink:0; }
    .an-src-label  { font-size:13px; font-weight:500; }
    .an-src-count  { font-size:12px; color:var(--text-muted); margin-left:auto; }
    .an-src-bar-wrap { background:rgba(255,255,255,.06); border-radius:4px; height:8px; overflow:hidden; }
    .an-src-bar    { height:100%; border-radius:4px; transition:width .6s cubic-bezier(.34,1.56,.64,1); }
    .an-src-pct    { font-size:12px; font-weight:700; color:var(--text-muted); text-align:right; }

    /* Status breakdown */
    .an-status-card .an-card-title { margin-bottom:14px; }
    .an-status-row  { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
    .an-status-item { display:flex; flex-direction:column; gap:6px; }
    .an-status-top  { display:flex; align-items:center; gap:6px; }
    .an-status-dot  { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
    .an-status-lbl  { font-size:13px; font-weight:500; flex:1; }
    .an-status-cnt  { font-size:13px; font-weight:700; }
    .an-status-bar-wrap { background:rgba(255,255,255,.06); border-radius:4px; height:6px; overflow:hidden; }
    .an-status-bar  { height:100%; border-radius:4px; transition:width .6s; }
    .an-status-pct  { font-size:11px; color:var(--text-muted); }

    /* Finance */
    .an-finance-row  { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:12px; }
    .an-finance-item { background:var(--bg-primary); border-radius:var(--radius-lg); padding:14px 16px; }
    .an-finance-val  { font-family:var(--font-display); font-size:20px; font-weight:800; margin-bottom:4px; }
    .an-finance-label { font-size:12px; color:var(--text-muted); }

    /* Modal */
    .cl-overlay { position:fixed; inset:0; background:rgba(0,0,0,.6); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; z-index:1000; padding:24px; }
    .cl-modal   { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-xl); width:100%; max-width:600px; box-shadow:var(--shadow-xl); animation:clModalIn .2s cubic-bezier(.34,1.2,.64,1); max-height:90vh; display:flex; flex-direction:column; overflow:hidden; }
    .cl-modal-hd { display:flex; align-items:center; justify-content:space-between; padding:20px 24px 0; flex-shrink:0; }
    .cl-modal-title { font-family:var(--font-display); font-size:20px; font-weight:700; }
    .cl-modal-x { width:32px; height:32px; border-radius:8px; color:var(--text-muted); font-size:16px; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all .2s; }
    .cl-modal-x:hover { background:var(--accent-red-dim); color:var(--accent-red); }
    .cl-modal-body { padding:20px 24px; display:flex; flex-direction:column; gap:14px; overflow-y:auto; }
    .cl-modal-ft   { padding:0 24px 20px; display:flex; gap:10px; justify-content:flex-end; flex-shrink:0; }
    .cl-row { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .field label { display:block; font-size:12px; font-weight:600; color:var(--text-secondary); text-transform:uppercase; letter-spacing:.05em; margin-bottom:6px; }
    .field-error { font-size:12px; color:#EF4444; margin-top:4px; display:block; }
    .cl-prefix-wrap { position:relative; }
    .cl-prefix { position:absolute; left:12px; top:50%; transform:translateY(-50%); font-size:13px; color:var(--text-muted); pointer-events:none; }
    .cl-prefix-input { padding-left:24px !important; }

    @keyframes clModalIn { from{opacity:0;transform:scale(.95)} to{opacity:1;transform:scale(1)} }
  `
  document.head.appendChild(s)
}
