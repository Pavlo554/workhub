// src/renderer/pages/admin/index.js
import { db } from '../../services/firebase.js'
import { getCurrentUser, getUserProfile, updateProfileCache } from '../../services/auth.js'
import { navigate } from '../../../core/router.js'
import {
  collection, collectionGroup, getDocs, getDoc, doc, setDoc,
  updateDoc, deleteDoc, serverTimestamp, query, orderBy, where, limit, addDoc, arrayUnion
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
import { icon } from '../../utils/icons.js'

const PLAN_META = {
  free:     { label: 'FREE',     color: '#94A3B8', price: 0 },
  pro:      { label: 'PRO',      color: '#4F8EF7', price: 299 },
  business: { label: 'BUSINESS', color: '#A78BFA', price: 799 },
}
const TABS = [
  { id: 'overview',       iconName: 'dashboard',    label: 'Огляд' },
  { id: 'analytics',      iconName: 'bar-chart',    label: 'Аналітика' },
  { id: 'users',          iconName: 'clients',      label: 'Користувачі' },
  { id: 'payments',       iconName: 'credit-card',  label: 'Платежі' },
  { id: 'support',        iconName: 'support',      label: 'Підтримка' },
  { id: 'notifications',  iconName: 'bell',         label: 'Новини' },
]

const TICKET_TYPE_META = {
  bug:     { label: 'Bug Report', color: '#F87171', bg: 'rgba(248,113,113,.12)', iconName: 'x-circle' },
  feature: { label: 'Пропозиція', color: '#A78BFA', bg: 'rgba(167,139,250,.12)', iconName: 'zap' },
  support: { label: 'Підтримка',  color: '#4F8EF7', bg: 'rgba(79,142,247,.12)',  iconName: 'message-circle' },
}
const TICKET_STATUS_META = {
  new:         { label: 'Нова',      color: '#94A3B8', iconName: 'info' },
  open:        { label: 'Відкрита',  color: '#4F8EF7', iconName: 'eye' },
  in_progress: { label: 'В роботі',  color: '#FBBF24', iconName: 'timer' },
  resolved:    { label: 'Вирішено',  color: '#34D399', iconName: 'check-circle' },
  closed:      { label: 'Закрита',   color: '#475569', iconName: 'x-circle' },
}
const TICKET_PRIORITY_META = {
  low:      { label: 'Низький',   color: '#94A3B8' },
  medium:   { label: 'Середній', color: '#FBBF24' },
  high:     { label: 'Високий',  color: '#FB923C' },
  critical: { label: 'Критич.',  color: '#F87171' },
}

export async function render(container) {
  const user    = getCurrentUser()
  const profile = await getUserProfile(user.uid)

  if (!profile?.isAdmin) {
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:60vh;gap:16px">
        <div style="color:var(--text-muted)">${icon('alert-triangle', 48)}</div>
        <div style="font-size:18px;font-weight:700">Доступ заборонено</div>
        <div style="font-size:14px;color:var(--text-muted)">У вас немає прав адміністратора</div>
        <button class="btn btn-secondary" id="back-btn">← Назад</button>
      </div>`
    container.querySelector('#back-btn').addEventListener('click', () => navigate('dashboard'))
    return
  }

  injectStyles()

  let activeTab  = 'overview'
  let allUsers   = []
  let allPayments = []
  let allAnnouncements = []
  let allTickets  = []
  let payFilter   = 'pending'
  let ticketTypeFilter   = 'all'
  let ticketStatusFilter = 'all'

  container.innerHTML = `
    <div class="adm-page">

      <div class="adm-header">
        <div>
          <h1 class="adm-title">Адмін панель</h1>
          <p class="adm-subtitle">WorkHub · Управління системою</p>
        </div>
        <div class="adm-header-right">
          <button class="adm-refresh-btn" id="adm-refresh">↻ Оновити</button>
          <span class="adm-badge">${icon('clients', 13)} ${profile.name || user.email}</span>
        </div>
      </div>

      <div class="adm-tabs" id="adm-tabs">
        ${TABS.map(t => `
          <button class="adm-tab ${t.id === 'overview' ? 'active' : ''}" data-tab="${t.id}">
            <span class="adm-tab-icon">${icon(t.iconName, 14)}</span> ${t.label}
          </button>
        `).join('')}
      </div>

      <!-- ── OVERVIEW ── -->
      <div id="tab-overview" class="adm-panel">
        <div class="adm-stats-row" id="adm-stats">
          ${[0,1,2,3,4,5].map(() => `<div class="adm-skel"></div>`).join('')}
        </div>
        <div class="adm-overview-grid">
          <div class="adm-card" id="recent-regs-card">
            <div class="adm-card-title">${icon('timer', 15)} Нові реєстрації</div>
            <div id="recent-regs-list"><div class="adm-loading"></div></div>
          </div>
          <div class="adm-card">
            <div class="adm-card-title">${icon('bar-chart', 15)} По планах</div>
            <div id="plan-breakdown"></div>
          </div>
          <div class="adm-card" id="adm-activity-card">
            <div class="adm-card-title">${icon('calendar', 15)} Активність (7 днів)</div>
            <div class="adm-activity-bars" id="adm-activity-bars"></div>
          </div>
        </div>
      </div>

      <!-- ── ANALYTICS ── -->
      <div id="tab-analytics" class="adm-panel" style="display:none">
        <div class="adm-an-grid">
          <div class="adm-card adm-card-wide">
            <div class="adm-card-title">${icon('calendar', 15)} Реєстрації за останні 30 днів</div>
            <div class="adm-chart-wrap" id="reg-chart"></div>
          </div>
          <div class="adm-card">
            <div class="adm-card-title">${icon('finances', 15)} Дохід по планах</div>
            <div id="revenue-breakdown"></div>
          </div>
          <div class="adm-card">
            <div class="adm-card-title">${icon('refresh', 15)} Конверсія free → paid</div>
            <div id="conversion-stats"></div>
          </div>
          <div class="adm-card">
            <div class="adm-card-title">${icon('globe', 15)} Ніші користувачів</div>
            <div id="niche-breakdown"></div>
          </div>
        </div>
      </div>

      <!-- ── USERS ── -->
      <div id="tab-users" class="adm-panel" style="display:none">
        <div class="adm-toolbar">
          <div class="adm-search">
            <span style="display:flex;align-items:center;color:var(--text-muted)">${icon('search', 14)}</span>
            <input type="text" id="users-search" placeholder="Пошук за іменем, email або бізнесом…">
          </div>
          <select id="plan-filter" class="adm-select">
            <option value="all">Всі плани</option>
            <option value="free">FREE</option>
            <option value="pro">PRO</option>
            <option value="business">BUSINESS</option>
          </select>
          <select id="status-filter" class="adm-select">
            <option value="all">Всі статуси</option>
            <option value="active">Активні</option>
            <option value="banned">Забановані</option>
          </select>
          <button class="adm-btn adm-btn-ghost" id="export-csv-btn">⬇ CSV</button>
          <span class="adm-count-label" id="users-count-label"></span>
        </div>
        <div id="users-table-wrap"><div class="adm-loading-big"></div></div>
      </div>

      <!-- ── PAYMENTS ── -->
      <div id="tab-payments" class="adm-panel" style="display:none">

        <!-- Налаштування способів оплати -->
        <div class="adm-pay-config" id="pay-config-block">
          <div class="adm-section-title" style="margin-bottom:16px">Налаштування способів оплати</div>

          <!-- LiqPay (автоматична оплата) -->
          <div style="margin-bottom:18px;padding:16px;background:rgba(255,107,53,.06);border:1px solid rgba(255,107,53,.25);border-radius:12px">
            <div style="font-size:12px;font-weight:700;color:#FF6B35;text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px">
              LiqPay — Автоматична оплата картою
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div>
                <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:6px">Public Key</label>
                <input class="adm-input" id="cfg-liqpay-pub" placeholder="sandbox_i12345..." type="text">
              </div>
              <div>
                <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:6px">Private Key</label>
                <input class="adm-input" id="cfg-liqpay-priv" placeholder="sandbox_..." type="password">
              </div>
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:8px">
              Ключі з кабінету liqpay.ua → Бізнес → Склад
            </div>
          </div>

          <!-- Ручна оплата -->
          <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">
            Ручна оплата (Monobank / Крипта)
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
            <div>
              <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:6px">USDT TRC20 адреса</label>
              <input class="adm-input" id="cfg-usdt" placeholder="TXxxxxxxxxxx..." type="text">
            </div>
            <div>
              <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:6px">Bitcoin (BTC) адреса</label>
              <input class="adm-input" id="cfg-btc" placeholder="1Axxxxxxxxxx..." type="text">
            </div>
            <div>
              <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:6px">Ethereum (ETH) адреса</label>
              <input class="adm-input" id="cfg-eth" placeholder="0xxxxxxxxxxx..." type="text">
            </div>
            <div>
              <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:6px">Monobank банка (URL)</label>
              <input class="adm-input" id="cfg-mono" placeholder="https://send.monobank.ua/jar/..." type="text">
            </div>
          </div>
          <button class="adm-action-btn adm-btn-approve" id="save-pay-cfg" style="padding:8px 20px">Зберегти реквізити</button>
          <span id="pay-cfg-status" style="font-size:12px;margin-left:12px;color:var(--text-muted)"></span>
        </div>

        <div class="adm-toolbar" style="margin-top:20px">
          <div class="adm-filter-pills" id="pay-filter-tabs">
            <button class="adm-pill active" data-status="pending">Очікують</button>
            <button class="adm-pill" data-status="approved">Підтверджені</button>
            <button class="adm-pill" data-status="rejected">Відхилені</button>
          </div>
          <span class="adm-count-label" id="pay-count-label"></span>
        </div>
        <div id="payments-list"><div class="adm-loading-big"></div></div>
      </div>

      <!-- ── SUPPORT ── -->
      <div id="tab-support" class="adm-panel" style="display:none">
        <div class="adm-toolbar">
          <div class="adm-filter-pills" id="ticket-type-pills">
            <button class="adm-pill active" data-type="all">Всі</button>
            <button class="adm-pill" data-type="bug">Bug</button>
            <button class="adm-pill" data-type="feature">Ідея</button>
            <button class="adm-pill" data-type="support">Підтримка</button>
          </div>
          <div class="adm-filter-pills" id="ticket-status-pills">
            <button class="adm-pill active" data-status="all">Всі статуси</button>
            <button class="adm-pill" data-status="new">Нові</button>
            <button class="adm-pill" data-status="open">Відкриті</button>
            <button class="adm-pill" data-status="in_progress">В роботі</button>
            <button class="adm-pill" data-status="resolved">Вирішені</button>
          </div>
          <span class="adm-count-label" id="ticket-count-label"></span>
        </div>
        <div id="tickets-list"><div class="adm-loading-big"></div></div>
      </div>

      <!-- ── NOTIFICATIONS ── -->
      <div id="tab-notifications" class="adm-panel" style="display:none">
        <div class="adm-notif-layout">

          <div class="adm-card adm-notif-form-card">
            <div class="adm-card-title">Нове повідомлення</div>
            <div class="adm-field">
              <label>Тип</label>
              <div class="adm-type-row" id="notif-type-row">
                <button class="adm-type-btn active" data-type="info">Інфо</button>
                <button class="adm-type-btn" data-type="success">Успіх</button>
                <button class="adm-type-btn" data-type="warning">Увага</button>
                <button class="adm-type-btn" data-type="error">Важливо</button>
              </div>
            </div>
            <div class="adm-field">
              <label>Заголовок</label>
              <input type="text" class="adm-input" id="notif-title" placeholder="Заголовок повідомлення">
            </div>
            <div class="adm-field">
              <label>Текст</label>
              <textarea class="adm-input adm-textarea" id="notif-body" placeholder="Текст повідомлення…" rows="4"></textarea>
            </div>
            <div class="adm-field">
              <label>Отримувачі</label>
              <select class="adm-input adm-select" id="notif-target">
                <option value="all">Всі користувачі</option>
                <option value="free">Тільки FREE план</option>
                <option value="pro">Тільки PRO план</option>
                <option value="business">Тільки BUSINESS план</option>
                <option value="paid">Всі платні (PRO + BUSINESS)</option>
              </select>
            </div>
            <button class="adm-btn adm-btn-primary" id="send-notif-btn">Надіслати</button>
          </div>

          <div class="adm-card adm-notif-list-card">
            <div class="adm-card-title">Попередні повідомлення</div>
            <div id="notif-history"><div class="adm-loading"></div></div>
          </div>

        </div>
      </div>

    </div>
  `

  // ── Tab switching ─────────────────────────────────────────
  container.querySelector('#adm-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.adm-tab')
    if (!btn) return
    activeTab = btn.dataset.tab
    container.querySelectorAll('.adm-tab').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    container.querySelectorAll('.adm-panel').forEach(p => p.style.display = 'none')
    container.querySelector(`#tab-${activeTab}`).style.display = 'block'
  })

  // ── Ticket filter pills ───────────────────────────────────
  container.querySelector('#ticket-type-pills').addEventListener('click', e => {
    const btn = e.target.closest('.adm-pill')
    if (!btn) return
    container.querySelectorAll('#ticket-type-pills .adm-pill').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    ticketTypeFilter = btn.dataset.type
    renderTickets()
  })
  container.querySelector('#ticket-status-pills').addEventListener('click', e => {
    const btn = e.target.closest('.adm-pill')
    if (!btn) return
    container.querySelectorAll('#ticket-status-pills .adm-pill').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    ticketStatusFilter = btn.dataset.status
    renderTickets()
  })

  // ── Payment filter pills ───────────────────────────────────
  container.querySelector('#pay-filter-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.adm-pill')
    if (!btn) return
    container.querySelectorAll('#pay-filter-tabs .adm-pill').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    payFilter = btn.dataset.status
    renderPayments()
  })

  // ── Search/filter ─────────────────────────────────────────
  container.querySelector('#users-search').addEventListener('input', renderUsersTable)
  container.querySelector('#plan-filter').addEventListener('change', renderUsersTable)
  container.querySelector('#status-filter').addEventListener('change', renderUsersTable)
  container.querySelector('#export-csv-btn').addEventListener('click', exportCSV)
  container.querySelector('#adm-refresh').addEventListener('click', loadAndRender)

  // ── Notifications ─────────────────────────────────────────
  let notifType = 'info'
  container.querySelector('#notif-type-row').addEventListener('click', e => {
    const btn = e.target.closest('.adm-type-btn')
    if (!btn) return
    container.querySelectorAll('.adm-type-btn').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    notifType = btn.dataset.type
  })

  container.querySelector('#send-notif-btn').addEventListener('click', async () => {
    const title  = container.querySelector('#notif-title').value.trim()
    const body   = container.querySelector('#notif-body').value.trim()
    const target = container.querySelector('#notif-target').value
    if (!title || !body) { showToast('Заповніть заголовок і текст', 'error'); return }

    const btn = container.querySelector('#send-notif-btn')
    btn.disabled = true; btn.textContent = '...'

    try {
      await addDoc(collection(db, 'announcements'), {
        title, body, type: notifType, target,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        createdByName: profile.name || user.email,
      })
      container.querySelector('#notif-title').value = ''
      container.querySelector('#notif-body').value  = ''
      showToast('Повідомлення надіслано')
      await loadAnnouncements()
      renderAnnouncements()
    } catch (err) {
      console.error(err); showToast('Помилка надсилання', 'error')
    } finally {
      btn.disabled = false; btn.textContent = 'Надіслати'
    }
  })

  // ── Payment config ────────────────────────────────────────
  async function loadPayCfg() {
    const snap = await getDoc(doc(db, 'config', 'payments'))
    if (!snap.exists()) return
    const d = snap.data()
    container.querySelector('#cfg-liqpay-pub').value  = d.liqpayPublicKey  || ''
    container.querySelector('#cfg-liqpay-priv').value = d.liqpayPrivateKey || ''
    container.querySelector('#cfg-usdt').value = d.address_usdt || ''
    container.querySelector('#cfg-btc').value  = d.address_btc  || ''
    container.querySelector('#cfg-eth').value  = d.address_eth  || ''
    container.querySelector('#cfg-mono').value = d.monobankJar  || ''
  }

  container.querySelector('#save-pay-cfg').addEventListener('click', async () => {
    const btn = container.querySelector('#save-pay-cfg')
    const st  = container.querySelector('#pay-cfg-status')
    btn.disabled = true
    try {
      await setDoc(doc(db, 'config', 'payments'), {
        liqpayPublicKey:  container.querySelector('#cfg-liqpay-pub').value.trim()  || null,
        liqpayPrivateKey: container.querySelector('#cfg-liqpay-priv').value.trim() || null,
        address_usdt: container.querySelector('#cfg-usdt').value.trim() || null,
        address_btc:  container.querySelector('#cfg-btc').value.trim()  || null,
        address_eth:  container.querySelector('#cfg-eth').value.trim()  || null,
        monobankJar:  container.querySelector('#cfg-mono').value.trim() || null,
        updatedAt: serverTimestamp(),
      })
      st.textContent = 'Збережено'
      setTimeout(() => { st.textContent = '' }, 3000)
    } catch (err) {
      console.error(err); st.textContent = 'Помилка'
    } finally { btn.disabled = false }
  })

  // ── Load ──────────────────────────────────────────────────
  async function loadAndRender() {
    const [users, payments, announcements, tickets] = await Promise.all([
      loadAllUsers(), loadAllPayments(), loadAnnouncements(), loadAllTickets()
    ])
    allUsers         = users
    allPayments      = payments
    allAnnouncements = announcements
    allTickets       = tickets
    renderOverview()
    renderAnalytics()
    renderUsersTable()
    renderPayments()
    renderTickets()
    renderAnnouncements()
  }

  await Promise.all([loadAndRender(), loadPayCfg()])

  // ═══════════════════════════════════════════════════════════
  // LOADERS
  // ═══════════════════════════════════════════════════════════
  async function loadAllUsers() {
    try {
      const snap = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc')))
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch (err) { console.error(err); return [] }
  }

  async function loadAllPayments() {
    try {
      const snap = await getDocs(query(collectionGroup(db, 'pendingPayments'), limit(300)))
      return snap.docs
        .map(d => ({ id: d.id, userId: d.ref.parent.parent.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
    } catch (err) { console.error(err); return [] }
  }

  async function loadAllTickets() {
    try {
      const snap = await getDocs(query(collection(db, 'tickets'), orderBy('createdAt', 'desc'), limit(300)))
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch (err) { console.error(err); return [] }
  }

  async function loadAnnouncements() {
    try {
      const snap = await getDocs(query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(50)))
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch (err) { console.error(err); return [] }
  }

  // ═══════════════════════════════════════════════════════════
  // OVERVIEW
  // ═══════════════════════════════════════════════════════════
  function renderOverview() {
    const total    = allUsers.length
    const byPlan   = { free: 0, pro: 0, business: 0 }
    allUsers.forEach(u => { byPlan[u.plan || 'free']++ })

    const paid        = byPlan.pro + byPlan.business
    const revenue     = byPlan.pro * 299 + byPlan.business * 799
    const pendingCnt  = allPayments.filter(p => p.status === 'pending').length
    const banned      = allUsers.filter(u => u.isBanned).length
    const conversion  = total > 0 ? ((paid / total) * 100).toFixed(1) : '0'

    // New today
    const todayStart = new Date(); todayStart.setHours(0,0,0,0)
    const newToday = allUsers.filter(u => {
      const d = u.createdAt?.toDate?.()
      return d && d >= todayStart
    }).length

    const stats = [
      { svgIcon: icon('clients', 20),     value: total,      label: 'Всього юзерів',         color: '' },
      { svgIcon: icon('plus', 20),        value: newToday,   label: 'Нових сьогодні',        color: 'blue' },
      { svgIcon: icon('upgrade', 20),     value: paid,       label: 'Платних підписок',      color: 'purple' },
      { svgIcon: icon('finances', 20),    value: `₴${revenue.toLocaleString()}`, label: 'Місячний дохід', color: 'green' },
      { svgIcon: icon('timer', 20),       value: pendingCnt, label: 'Платежів на перевірці', color: 'orange' },
      { svgIcon: icon('bar-chart', 20),   value: `${conversion}%`, label: 'Конверсія free→paid', color: '' },
    ]

    container.querySelector('#adm-stats').innerHTML = stats.map(s => `
      <div class="adm-stat-card ${s.color ? 'adm-stat-' + s.color : ''}">
        <div class="adm-stat-icon">${s.svgIcon}</div>
        <div class="adm-stat-val">${s.value}</div>
        <div class="adm-stat-lbl">${s.label}</div>
      </div>
    `).join('')

    // Recent registrations
    const recent = allUsers.slice(0, 6)
    container.querySelector('#recent-regs-list').innerHTML = recent.map(u => `
      <div class="adm-user-row" style="cursor:pointer" data-uid="${u.id}">
        <div class="adm-avatar">${(u.name || u.email || '?')[0].toUpperCase()}</div>
        <div class="adm-user-info">
          <div class="adm-user-name">${u.name || '—'}</div>
          <div class="adm-user-email">${u.email || u.id}</div>
        </div>
        <span class="adm-plan-pill" style="color:${(PLAN_META[u.plan]||PLAN_META.free).color};background:${(PLAN_META[u.plan]||PLAN_META.free).color}18">
          ${(PLAN_META[u.plan]||PLAN_META.free).label}
        </span>
      </div>
    `).join('')

    container.querySelectorAll('#recent-regs-list .adm-user-row').forEach(row => {
      row.addEventListener('click', () => openUserDetail(row.dataset.uid))
    })

    // Plan breakdown bars
    container.querySelector('#plan-breakdown').innerHTML = Object.entries(byPlan).map(([plan, count]) => {
      const pct = total > 0 ? Math.round((count / total) * 100) : 0
      const m   = PLAN_META[plan]
      return `
        <div class="adm-break-row">
          <span class="adm-break-label" style="color:${m.color}">${m.label}</span>
          <div class="adm-break-bar-wrap">
            <div class="adm-break-bar" style="width:${pct}%;background:${m.color}"></div>
          </div>
          <span class="adm-break-count">${count} <span style="color:var(--text-muted)">(${pct}%)</span></span>
        </div>`
    }).join('')

    // Activity bars (registrations by day, last 7 days)
    const days = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0)
      const next = new Date(d); next.setDate(d.getDate() + 1)
      const count = allUsers.filter(u => {
        const created = u.createdAt?.toDate?.()
        return created && created >= d && created < next
      }).length
      days.push({ label: d.toLocaleDateString('uk-UA', { weekday: 'short' }), count })
    }
    const maxDay = Math.max(...days.map(d => d.count), 1)
    container.querySelector('#adm-activity-bars').innerHTML = days.map(d => `
      <div class="adm-act-col">
        <div class="adm-act-bar-wrap">
          <div class="adm-act-bar" style="height:${Math.round((d.count / maxDay) * 100)}%"></div>
        </div>
        <div class="adm-act-count">${d.count}</div>
        <div class="adm-act-label">${d.label}</div>
      </div>
    `).join('')
  }

  // ═══════════════════════════════════════════════════════════
  // ANALYTICS
  // ═══════════════════════════════════════════════════════════
  function renderAnalytics() {
    // Registrations last 30 days
    const days = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0)
      const next = new Date(d); next.setDate(d.getDate() + 1)
      const count = allUsers.filter(u => {
        const created = u.createdAt?.toDate?.()
        return created && created >= d && created < next
      }).length
      days.push({ label: i % 5 === 0 ? d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' }) : '', count })
    }
    const maxDay = Math.max(...days.map(d => d.count), 1)
    container.querySelector('#reg-chart').innerHTML = `
      <div class="adm-reg-chart">
        ${days.map(d => `
          <div class="adm-reg-col" title="${d.count} реєстрацій">
            <div class="adm-reg-bar" style="height:${Math.round((d.count / maxDay) * 80) + 2}px"></div>
            <div class="adm-reg-label">${d.label}</div>
          </div>
        `).join('')}
      </div>`

    // Revenue breakdown
    const byPlan = { free: 0, pro: 0, business: 0 }
    allUsers.forEach(u => { byPlan[u.plan || 'free']++ })
    const totalRev = byPlan.pro * 299 + byPlan.business * 799
    container.querySelector('#revenue-breakdown').innerHTML = `
      <div class="adm-rev-total">₴${totalRev.toLocaleString('uk-UA')}<span style="font-size:13px;color:var(--text-muted)">/міс</span></div>
      ${Object.entries(byPlan).filter(([p]) => p !== 'free').map(([plan, count]) => {
        const rev = count * PLAN_META[plan].price
        const pct = totalRev > 0 ? Math.round((rev / totalRev) * 100) : 0
        return `
          <div class="adm-break-row">
            <span class="adm-break-label" style="color:${PLAN_META[plan].color}">${PLAN_META[plan].label}</span>
            <div class="adm-break-bar-wrap">
              <div class="adm-break-bar" style="width:${pct}%;background:${PLAN_META[plan].color}"></div>
            </div>
            <span class="adm-break-count">₴${rev.toLocaleString()}</span>
          </div>`
      }).join('')}`

    // Conversion
    const total = allUsers.length
    const paid  = byPlan.pro + byPlan.business
    const conv  = total > 0 ? ((paid / total) * 100).toFixed(1) : '0'
    container.querySelector('#conversion-stats').innerHTML = `
      <div class="adm-conv-ring">
        <svg viewBox="0 0 100 100" class="adm-ring-svg">
          <circle cx="50" cy="50" r="38" fill="none" stroke="var(--bg-tertiary)" stroke-width="10"/>
          <circle cx="50" cy="50" r="38" fill="none" stroke="#4F8EF7" stroke-width="10"
            stroke-dasharray="${(parseFloat(conv) / 100 * 238).toFixed(1)} 238"
            stroke-dashoffset="59.5" stroke-linecap="round"/>
        </svg>
        <div class="adm-ring-val">${conv}%</div>
      </div>
      <div class="adm-conv-row"><span>FREE</span><strong>${byPlan.free}</strong></div>
      <div class="adm-conv-row"><span>Платні</span><strong style="color:#4F8EF7">${paid}</strong></div>
      <div class="adm-conv-row"><span>Конверсія</span><strong style="color:#34D399">${conv}%</strong></div>`

    // Niches
    const niches = {}
    allUsers.forEach(u => { const n = u.profession || 'other'; niches[n] = (niches[n] || 0) + 1 })
    const nicheMap = { freelancer: 'Фрілансер', accountant: 'Бухгалтер', smm: 'SMM', beauty: 'Салон краси', other: 'Інша' }
    const nicheTotal = Object.values(niches).reduce((a, b) => a + b, 0) || 1
    container.querySelector('#niche-breakdown').innerHTML = Object.entries(niches)
      .sort((a, b) => b[1] - a[1])
      .map(([n, count]) => {
        const pct = Math.round((count / nicheTotal) * 100)
        return `
          <div class="adm-break-row">
            <span class="adm-break-label" style="font-size:12px">${nicheMap[n] || n}</span>
            <div class="adm-break-bar-wrap">
              <div class="adm-break-bar" style="width:${pct}%;background:#4F8EF7"></div>
            </div>
            <span class="adm-break-count">${count}</span>
          </div>`
      }).join('')
  }

  // ═══════════════════════════════════════════════════════════
  // USERS TABLE
  // ═══════════════════════════════════════════════════════════
  function renderUsersTable() {
    const q      = container.querySelector('#users-search').value.toLowerCase().trim()
    const planF  = container.querySelector('#plan-filter').value
    const statF  = container.querySelector('#status-filter').value

    let list = allUsers
    if (q) list = list.filter(u => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.businessName?.toLowerCase().includes(q))
    if (planF !== 'all') list = list.filter(u => (u.plan || 'free') === planF)
    if (statF === 'active') list = list.filter(u => !u.isBanned)
    if (statF === 'banned') list = list.filter(u => u.isBanned)

    container.querySelector('#users-count-label').textContent = `${list.length} / ${allUsers.length}`

    if (!list.length) {
      container.querySelector('#users-table-wrap').innerHTML = '<div class="adm-empty">Користувачів не знайдено</div>'
      return
    }

    container.querySelector('#users-table-wrap').innerHTML = `
      <table class="adm-table">
        <thead><tr>
          <th>Користувач</th><th>Бізнес / ніша</th><th>План</th>
          <th>Підписка до</th><th>Реєстрація</th><th>Дії</th>
        </tr></thead>
        <tbody>
          ${list.map(u => {
            const pm     = PLAN_META[u.plan || 'free'] || PLAN_META.free
            const regD   = u.createdAt?.toDate?.()?.toLocaleDateString('uk-UA') || '—'
            const subEnd = u.subscriptionEnd ? new Date(u.subscriptionEnd).toLocaleDateString('uk-UA') : '—'
            const banned = u.isBanned
            return `
              <tr class="${banned ? 'adm-row-banned' : ''}" data-uid="${u.id}" style="cursor:pointer">
                <td>
                  <div class="adm-user-cell">
                    <div class="adm-avatar ${banned ? 'adm-avatar-banned' : ''}">${(u.name || '?')[0].toUpperCase()}</div>
                    <div>
                      <div class="adm-user-name">${u.name || '—'} ${u.isAdmin ? '<span class="adm-admin-badge">Admin</span>' : ''} ${banned ? '<span class="adm-banned-badge">Banned</span>' : ''}</div>
                      <div class="adm-user-email">${u.email || u.id}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <div style="font-size:13px">${u.businessName || '—'}</div>
                  <div style="font-size:11px;color:var(--text-muted)">${profLabel(u.profession)}</div>
                </td>
                <td><span class="adm-plan-pill" style="color:${pm.color};background:${pm.color}18">${pm.label}</span></td>
                <td style="font-size:13px">${subEnd}</td>
                <td style="font-size:13px">${regD}</td>
                <td>
                  <div class="adm-action-btns" onclick="event.stopPropagation()">
                    <button class="adm-action-btn" data-uid="${u.id}" data-plan="${u.plan||'free'}" data-action="plan">План</button>
                    ${!u.isAdmin
                      ? `<button class="adm-action-btn adm-btn-admin" data-uid="${u.id}" data-action="admin" title="Зробити адміном">${icon('settings', 13)}</button>`
                      : ''
                    }
                    <button class="adm-action-btn ${banned ? 'adm-btn-unban' : 'adm-btn-ban'}" data-uid="${u.id}" data-banned="${banned}" data-action="ban">
                      ${banned ? 'Розбан' : 'Бан'}
                    </button>
                  </div>
                </td>
              </tr>`
          }).join('')}
        </tbody>
      </table>`

    // Row click → detail
    container.querySelectorAll('#users-table-wrap tbody tr').forEach(row => {
      row.addEventListener('click', () => openUserDetail(row.dataset.uid))
    })

    // Action buttons
    container.querySelectorAll('.adm-action-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation()
        const action = btn.dataset.action
        if (action === 'plan')  openChangePlanModal(btn.dataset.uid, btn.dataset.plan)
        if (action === 'admin') await makeAdmin(btn.dataset.uid)
        if (action === 'ban')   await toggleBan(btn.dataset.uid, btn.dataset.banned === 'true')
      })
    })
  }

  // ── User detail modal ─────────────────────────────────────
  async function openUserDetail(uid) {
    const u = allUsers.find(u => u.id === uid)
    if (!u) return

    // Load businesses
    let businesses = []
    try {
      const snap = await getDocs(collection(db, 'users', uid, 'businesses'))
      businesses = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch {}

    const pm = PLAN_META[u.plan || 'free'] || PLAN_META.free
    const regD = u.createdAt?.toDate?.()?.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' }) || '—'
    const modules = u.selectedModules || []

    const modal = document.createElement('div')
    modal.className = 'adm-overlay'
    modal.innerHTML = `
      <div class="adm-modal adm-modal-lg">
        <div class="adm-modal-head">
          <h2>Картка користувача</h2>
          <button class="adm-modal-close" id="ud-close">${icon('x', 14)}</button>
        </div>
        <div class="adm-modal-body adm-detail-body">

          <!-- Left: profile -->
          <div class="adm-detail-left">
            <div class="adm-detail-avatar">${(u.name || '?')[0].toUpperCase()}</div>
            <div class="adm-detail-name">${u.name || '—'}</div>
            <div class="adm-detail-email">${u.email || u.id}</div>
            <span class="adm-plan-pill adm-plan-pill-lg" style="color:${pm.color};background:${pm.color}18">${pm.label}</span>
            ${u.isBanned ? '<div class="adm-banned-badge" style="margin-top:8px">Забанований</div>' : ''}

            <div class="adm-detail-meta">
              ${metaRow('', 'Телефон', u.phone)}
              ${metaRow('', 'Місто', u.city)}
              ${metaRow('', 'Бізнес', u.businessName)}
              ${metaRow('', 'Ніша', profLabel(u.profession))}
              ${metaRow('', 'Зареєстрований', regD)}
              ${metaRow('', 'UID', `<span style="font-family:monospace;font-size:10px">${u.id}</span>`)}
            </div>

            <div class="adm-detail-actions">
              <button class="adm-btn adm-btn-primary" data-uid="${uid}" data-plan="${u.plan||'free'}" id="ud-change-plan">Змінити план</button>
              <button class="adm-btn ${u.isBanned ? 'adm-btn-success' : 'adm-btn-danger'}" id="ud-ban-btn">
                ${u.isBanned ? 'Розбанити' : 'Забанити'}
              </button>
              ${!u.isAdmin ? `<button class="adm-btn adm-btn-ghost" id="ud-admin-btn">Зробити адміном</button>` : '<div class="adm-admin-badge" style="margin-top:8px">Адміністратор</div>'}
            </div>
          </div>

          <!-- Right: businesses + modules -->
          <div class="adm-detail-right">
            <h3 class="adm-detail-section">Бізнеси (${businesses.length + 1})</h3>
            <div class="adm-biz-list">
              <div class="adm-biz-item adm-biz-main">
                <span class="adm-biz-icon">${icon('building', 16)}</span>
                <div>
                  <div class="adm-biz-name">${u.businessName || 'Основний бізнес'}</div>
                  <div class="adm-biz-niche">${profLabel(u.profession)}</div>
                </div>
                <span class="adm-biz-badge">Основний</span>
              </div>
              ${businesses.map(b => `
                <div class="adm-biz-item">
                  <span class="adm-biz-icon">${icon('building', 16)}</span>
                  <div>
                    <div class="adm-biz-name">${b.name || '—'}</div>
                    <div class="adm-biz-niche">${profLabel(b.profession)}</div>
                  </div>
                </div>`).join('')}
            </div>

            <h3 class="adm-detail-section" style="margin-top:20px">Активні модулі (${modules.length})</h3>
            <div class="adm-modules-wrap">
              ${modules.length ? modules.map(id => {
                const labels = { dashboard:'Дашборд',clients:'Клієнти',projects:'Проекти',invoices:'Рахунки',contracts:'Договори',tasks:'Задачі',timer:'Таймер',finances:'Фінанси','tax-calendar':'Податки',appointments:'Розклад',services:'Послуги','content-plan':'Контент',accounts:'Акаунти',passwords:'Паролі',notes:'Нотатки',documents:'Документи','api-keys':'API' }
                return `<span class="adm-mod-chip">${icon(id, 12)} ${labels[id]||id}</span>`
              }).join('') : '<span style="color:var(--text-muted);font-size:13px">Немає модулів</span>'}
            </div>

            ${u.subscriptionEnd ? `
              <h3 class="adm-detail-section" style="margin-top:20px">Підписка</h3>
              <div class="adm-detail-meta">
                ${metaRow('', 'Діє до', new Date(u.subscriptionEnd).toLocaleDateString('uk-UA'))}
                ${metaRow('', 'Статус', u.subscriptionStatus === 'active' ? '<span style="color:#34D399">Активна</span>' : '<span style="color:#94A3B8">Неактивна</span>')}
              </div>` : ''}
          </div>

        </div>
      </div>`

    document.body.appendChild(modal)
    modal.querySelector('#ud-close').addEventListener('click', () => modal.remove())
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove() })
    modal.querySelector('#ud-change-plan')?.addEventListener('click', () => { modal.remove(); openChangePlanModal(uid, u.plan || 'free') })
    modal.querySelector('#ud-ban-btn')?.addEventListener('click', async () => { modal.remove(); await toggleBan(uid, u.isBanned) })
    modal.querySelector('#ud-admin-btn')?.addEventListener('click', async () => { modal.remove(); await makeAdmin(uid) })
  }

  function metaRow(icon, label, val) {
    if (!val) return ''
    return `<div class="adm-meta-row"><span>${icon}</span><span class="adm-meta-label">${label}</span><span class="adm-meta-val">${val}</span></div>`
  }

  // ── Make admin ────────────────────────────────────────────
  async function makeAdmin(uid) {
    if (!confirm('Зробити цього користувача адміністратором?')) return
    try {
      await updateDoc(doc(db, 'users', uid), { isAdmin: true })
      const u = allUsers.find(u => u.id === uid); if (u) u.isAdmin = true
      renderUsersTable(); showToast('Права адміна надано')
    } catch (err) { console.error(err); showToast('Помилка', 'error') }
  }

  // ── Ban / unban ───────────────────────────────────────────
  async function toggleBan(uid, isBanned) {
    const action = isBanned ? 'розбанити' : 'забанити'
    if (!confirm(`Ви впевнені що хочете ${action} цього користувача?`)) return
    try {
      await updateDoc(doc(db, 'users', uid), { isBanned: !isBanned, updatedAt: serverTimestamp() })
      const u = allUsers.find(u => u.id === uid); if (u) u.isBanned = !isBanned
      renderUsersTable(); renderOverview()
      showToast(isBanned ? 'Користувача розбановано' : 'Користувача забановано')
    } catch (err) { console.error(err); showToast('Помилка', 'error') }
  }

  // ── Change plan modal ─────────────────────────────────────
  function openChangePlanModal(uid, currentPlan) {
    const u = allUsers.find(u => u.id === uid); if (!u) return

    const modal = document.createElement('div')
    modal.className = 'adm-overlay'
    modal.innerHTML = `
      <div class="adm-modal" style="max-width:420px">
        <div class="adm-modal-head">
          <h2>${icon('edit', 18)} Змінити план</h2>
          <button class="adm-modal-close" id="cp-close">${icon('x', 14)}</button>
        </div>
        <div class="adm-modal-body" style="gap:14px">
          <div class="adm-user-cell" style="padding:12px;background:var(--bg-tertiary);border-radius:var(--radius-md)">
            <div class="adm-avatar">${(u.name || '?')[0].toUpperCase()}</div>
            <div>
              <div class="adm-user-name">${u.name || '—'}</div>
              <div class="adm-user-email">${u.email || u.id}</div>
            </div>
          </div>
          <div class="adm-plan-picker">
            ${Object.entries(PLAN_META).map(([plan, m]) => `
              <button class="adm-plan-pick ${currentPlan === plan ? 'active' : ''}" data-plan="${plan}" style="--pc:${m.color}">
                <div class="adm-plan-pick-name" style="color:${m.color}">${m.label}</div>
                <div class="adm-plan-pick-price">₴${m.price}/міс</div>
              </button>`).join('')}
          </div>
          <div class="adm-field">
            <label>Підписка до</label>
            <input type="date" class="adm-input" id="cp-end" value="${u.subscriptionEnd ? u.subscriptionEnd.split('T')[0] : nextMonth()}">
          </div>
          <div class="adm-field">
            <label>Коментар (необов'язково)</label>
            <input type="text" class="adm-input" id="cp-reason" placeholder="Вручну, промо, тест...">
          </div>
        </div>
        <div class="adm-modal-foot">
          <button class="adm-btn adm-btn-ghost" id="cp-cancel">Скасувати</button>
          <button class="adm-btn adm-btn-primary" id="cp-save">Зберегти</button>
        </div>
      </div>`

    document.body.appendChild(modal)
    modal.querySelector('#cp-close').addEventListener('click',  () => modal.remove())
    modal.querySelector('#cp-cancel').addEventListener('click', () => modal.remove())
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove() })

    let selectedPlan = currentPlan
    modal.querySelectorAll('.adm-plan-pick').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('.adm-plan-pick').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        selectedPlan = btn.dataset.plan
      })
    })

    modal.querySelector('#cp-save').addEventListener('click', async () => {
      const endDate = modal.querySelector('#cp-end').value
      const btn     = modal.querySelector('#cp-save')
      btn.disabled  = true; btn.textContent = '...'
      try {
        const upd = {
          plan: selectedPlan, subscriptionEnd: endDate ? new Date(endDate).toISOString() : null,
          subscriptionStatus: selectedPlan === 'free' ? 'inactive' : 'active',
          updatedAt: serverTimestamp(), adminNote: modal.querySelector('#cp-reason').value.trim() || null,
        }
        await updateDoc(doc(db, 'users', uid), upd)
        const idx = allUsers.findIndex(u => u.id === uid)
        if (idx !== -1) Object.assign(allUsers[idx], upd)
        if (uid === user.uid) updateProfileCache(uid, upd)
        modal.remove(); renderUsersTable(); renderOverview(); renderAnalytics()
        showToast(`План змінено на ${selectedPlan.toUpperCase()}`)
      } catch (err) { console.error(err); btn.disabled = false; btn.textContent = 'Зберегти' }
    })
  }

  // ═══════════════════════════════════════════════════════════
  // PAYMENTS
  // ═══════════════════════════════════════════════════════════
  function renderPayments() {
    const filtered = allPayments.filter(p => p.status === payFilter)
    const el = container.querySelector('#payments-list')
    container.querySelector('#pay-count-label').textContent = `${filtered.length} записів`

    if (!filtered.length) {
      el.innerHTML = `<div class="adm-empty">${payFilter === 'pending' ? 'Немає платежів на перевірці' : 'Немає записів'}</div>`
      return
    }

    el.innerHTML = `
      <table class="adm-table">
        <thead><tr>
          <th>Користувач</th><th>План</th><th>Сума</th><th>Крипто</th><th>Дата</th><th>ID платежу</th>
          <th>${payFilter === 'pending' ? 'Дії' : 'Статус'}</th>
        </tr></thead>
        <tbody>
          ${filtered.map(p => {
            const u    = allUsers.find(u => u.id === p.userId)
            const date = p.createdAt?.toDate?.()?.toLocaleDateString('uk-UA') || '—'
            const pm   = PLAN_META[p.planId||'pro'] || PLAN_META.pro
            return `
              <tr>
                <td>
                  <div class="adm-user-cell">
                    <div class="adm-avatar" style="width:30px;height:30px;font-size:12px">${(u?.name||'?')[0].toUpperCase()}</div>
                    <div>
                      <div class="adm-user-name">${u?.name||'—'}</div>
                      <div class="adm-user-email">${u?.email||p.userId.slice(0,12)}</div>
                    </div>
                  </div>
                </td>
                <td><span class="adm-plan-pill" style="color:${pm.color};background:${pm.color}18">${pm.label}</span></td>
                <td><strong>₴${p.amount}</strong></td>
                <td style="font-family:monospace;font-size:12px;color:var(--text-muted)">${p.cryptoAmount ? `${p.cryptoAmount} ${p.currency||''}` : '—'}</td>
                <td>${date}</td>
                <td style="font-family:monospace;font-size:11px;color:var(--text-muted)">${(p.paymentId||p.id).slice(0,16)}…</td>
                <td>
                  ${payFilter === 'pending'
                    ? `<div class="adm-action-btns">
                        <button class="adm-action-btn adm-btn-approve" data-pid="${p.id}" data-uid="${p.userId}" data-plan="${p.planId||'pro'}">${icon('check', 13)} Підтвердити</button>
                        <button class="adm-action-btn adm-btn-rej"     data-pid="${p.id}" data-uid="${p.userId}">${icon('x', 13)}</button>
                       </div>`
                    : `<span class="adm-status-chip adm-status-${p.status}">${p.status==='approved'?icon('check',11)+' Підтверджено':icon('x',11)+' Відхилено'}</span>`
                  }
                </td>
              </tr>`
          }).join('')}
        </tbody>
      </table>`

    el.querySelectorAll('.adm-btn-approve').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Підтвердити платіж і активувати підписку?')) return
        btn.disabled = true; btn.textContent = '...'
        try {
          const endDate = new Date(); endDate.setMonth(endDate.getMonth() + 1)
          await Promise.all([
            updateDoc(doc(db, 'users', btn.dataset.uid), { plan: btn.dataset.plan||'pro', subscriptionEnd: endDate.toISOString(), subscriptionStatus: 'active', updatedAt: serverTimestamp() }),
            updateDoc(doc(db, 'users', btn.dataset.uid, 'pendingPayments', btn.dataset.pid), { status: 'approved', approvedAt: serverTimestamp(), approvedBy: user.uid }),
          ])
          const p = allPayments.find(p => p.id === btn.dataset.pid); if (p) p.status = 'approved'
          const u = allUsers.find(u => u.id === btn.dataset.uid); if (u) { u.plan = btn.dataset.plan||'pro'; u.subscriptionStatus = 'active' }
          renderPayments(); renderOverview(); renderAnalytics()
          showToast('Підписку активовано')
        } catch (err) { console.error(err); btn.disabled = false; btn.innerHTML = icon('check', 13) + ' Підтвердити' }
      })
    })

    el.querySelectorAll('.adm-btn-rej').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Відхилити цей платіж?')) return
        try {
          await updateDoc(doc(db, 'users', btn.dataset.uid, 'pendingPayments', btn.dataset.pid), { status: 'rejected', rejectedAt: serverTimestamp(), rejectedBy: user.uid })
          const p = allPayments.find(p => p.id === btn.dataset.pid); if (p) p.status = 'rejected'
          renderPayments(); renderOverview()
        } catch (err) { console.error(err) }
      })
    })
  }

  // ═══════════════════════════════════════════════════════════
  // SUPPORT TICKETS
  // ═══════════════════════════════════════════════════════════
  function renderTickets() {
    let list = allTickets
    if (ticketTypeFilter   !== 'all') list = list.filter(t => t.type   === ticketTypeFilter)
    if (ticketStatusFilter !== 'all') list = list.filter(t => t.status === ticketStatusFilter)

    const el = container.querySelector('#tickets-list')
    container.querySelector('#ticket-count-label').textContent = `${list.length} заявок`

    if (!list.length) {
      el.innerHTML = '<div class="adm-empty">Заявок не знайдено</div>'
      return
    }

    el.innerHTML = `
      <table class="adm-table">
        <thead><tr>
          <th>Тип</th><th>Заголовок</th><th>Від</th>
          <th>Пріоритет</th><th>Статус</th><th>Дата</th><th>Відп.</th>
        </tr></thead>
        <tbody>
          ${list.map(t => {
            const tm = TICKET_TYPE_META[t.type]         || TICKET_TYPE_META.support
            const sm = TICKET_STATUS_META[t.status]     || TICKET_STATUS_META.new
            const pm = TICKET_PRIORITY_META[t.priority] || TICKET_PRIORITY_META.medium
            const date = t.createdAt?.toDate?.()?.toLocaleDateString('uk-UA') || '—'
            const replyCnt = t.replies?.length || 0
            const isNew = t.status === 'new'
            return `
              <tr style="cursor:pointer${isNew ? ';font-weight:600' : ''}" data-tid="${t.id}">
                <td><span class="adm-plan-pill" style="color:${tm.color};background:${tm.bg}">${icon(tm.iconName, 12)} ${tm.label}</span></td>
                <td style="max-width:260px">
                  <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.title)}</div>
                  ${isNew ? '<span style="font-size:10px;color:#4F8EF7;font-weight:800">● НОВА</span>' : ''}
                </td>
                <td>
                  <div style="font-size:13px">${esc(t.userName || '—')}</div>
                  <div style="font-size:11px;color:var(--text-muted)">${esc(t.userEmail || '')}</div>
                </td>
                <td style="color:${pm.color};font-size:12px;font-weight:700">● ${pm.label}</td>
                <td style="color:${sm.color};font-size:12px;font-weight:700">${icon(sm.iconName, 12)} ${sm.label}</td>
                <td style="font-size:12px">${date}</td>
                <td style="font-size:12px;color:var(--text-muted)">${replyCnt > 0 ? `<span style="display:inline-flex;align-items:center;gap:3px">${icon('message-circle', 12)} ${replyCnt}</span>` : '—'}</td>
              </tr>`
          }).join('')}
        </tbody>
      </table>`

    el.querySelectorAll('tbody tr').forEach(row => {
      row.addEventListener('click', () => openTicketDetailAdmin(row.dataset.tid))
    })
  }

  function openTicketDetailAdmin(ticketId) {
    const t = allTickets.find(t => t.id === ticketId)
    if (!t) return
    const tm = TICKET_TYPE_META[t.type]         || TICKET_TYPE_META.support
    const sm = TICKET_STATUS_META[t.status]     || TICKET_STATUS_META.new
    const pm = TICKET_PRIORITY_META[t.priority] || TICKET_PRIORITY_META.medium
    const date = t.createdAt?.toDate?.()?.toLocaleString('uk-UA') || '—'

    const modal = document.createElement('div')
    modal.className = 'adm-overlay'
    modal.innerHTML = `
      <div class="adm-modal adm-modal-lg" style="max-width:700px">
        <div class="adm-modal-head" style="flex-wrap:wrap;gap:8px">
          <span class="adm-plan-pill" style="color:${tm.color};background:${tm.bg};font-size:12px">${icon(tm.iconName, 12)} ${tm.label}</span>
          <h2 style="font-family:var(--font-display);font-size:17px;font-weight:800;flex:1;min-width:0">${esc(t.title)}</h2>
          <button class="adm-modal-close" id="tad-close">${icon('x', 14)}</button>
        </div>

        <div style="display:flex;align-items:center;gap:12px;padding:10px 24px;border-bottom:1px solid var(--border);flex-wrap:wrap">
          <span style="color:${sm.color};font-size:12px;font-weight:700">${icon(sm.iconName, 12)} ${sm.label}</span>
          <span style="color:${pm.color};font-size:12px;font-weight:700">● ${pm.label}</span>
          <span style="font-size:12px;color:var(--text-muted)">${esc(t.userName||'—')} · ${esc(t.userEmail||'')}</span>
          <span style="font-size:12px;color:var(--text-muted)">${date}</span>
          <div style="margin-left:auto;display:flex;gap:6px" id="tad-status-btns">
            ${Object.entries(TICKET_STATUS_META).map(([id, m]) => `
              <button class="adm-action-btn ${t.status === id ? 'adm-btn-approve' : ''}" data-set-status="${id}" style="font-size:11px;display:inline-flex;align-items:center;gap:4px">${icon(m.iconName, 11)} ${m.label}</button>
            `).join('')}
          </div>
        </div>

        <div class="adm-modal-body" style="max-height:420px;overflow-y:auto;gap:12px;padding:16px 24px" id="tad-thread">
          <!-- Original -->
          <div style="background:var(--bg-tertiary);border-radius:var(--radius-lg);padding:14px">
            <div style="font-size:12px;font-weight:700;margin-bottom:8px;color:var(--text-muted)">${esc(t.userName||'Користувач')}</div>
            <div style="font-size:14px;line-height:1.55;white-space:pre-wrap;word-break:break-word">${esc(t.description)}</div>
          </div>
          ${(t.replies || []).map(r => `
            <div style="background:${r.fromAdmin ? 'rgba(79,142,247,.08)' : 'var(--bg-tertiary)'};border:1px solid ${r.fromAdmin ? 'rgba(79,142,247,.2)' : 'var(--border)'};border-radius:var(--radius-lg);padding:14px;${r.fromAdmin ? 'margin-left:24px' : 'margin-right:24px'}">
              <div style="font-size:12px;font-weight:700;margin-bottom:8px;color:${r.fromAdmin ? 'var(--accent-blue)' : 'var(--text-muted)'}">
                ${r.fromAdmin ? icon('shield', 12) + ' ' : ''}${esc(r.authorName || (r.fromAdmin ? 'Адмін' : 'Користувач'))}
                ${r.fromAdmin ? '<span style="font-size:10px;background:rgba(79,142,247,.15);color:var(--accent-blue);padding:1px 6px;border-radius:99px;margin-left:4px">Адмін</span>' : ''}
              </div>
              <div style="font-size:14px;line-height:1.55;white-space:pre-wrap;word-break:break-word">${esc(r.text)}</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:6px">${r.createdAt?.toDate?.()?.toLocaleString('uk-UA') || '—'}</div>
            </div>
          `).join('')}
        </div>

        <div class="adm-modal-foot" style="flex-direction:column;gap:10px;align-items:stretch">
          <textarea class="adm-input adm-textarea" id="tad-reply" placeholder="Написати відповідь користувачеві…" rows="3" style="min-height:70px"></textarea>
          <div style="display:flex;gap:10px;justify-content:flex-end">
            <button class="adm-btn adm-btn-ghost" id="tad-cancel">Закрити</button>
            <button class="adm-btn adm-btn-primary" id="tad-send">${icon('send', 14)} Надіслати відповідь</button>
          </div>
        </div>
      </div>`

    document.body.appendChild(modal)
    modal.querySelector('#tad-close').addEventListener('click',  () => modal.remove())
    modal.querySelector('#tad-cancel').addEventListener('click', () => modal.remove())
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove() })

    // Status change
    modal.querySelector('#tad-status-btns').addEventListener('click', async e => {
      const btn = e.target.closest('[data-set-status]')
      if (!btn) return
      const newStatus = btn.dataset.setStatus
      try {
        await updateDoc(doc(db, 'tickets', ticketId), { status: newStatus, updatedAt: serverTimestamp() })
        const idx = allTickets.findIndex(t => t.id === ticketId)
        if (idx !== -1) allTickets[idx].status = newStatus
        modal.remove()
        renderTickets()
        showToast(`Статус змінено: ${TICKET_STATUS_META[newStatus]?.label}`)
      } catch (err) { console.error(err) }
    })

    // Send reply
    modal.querySelector('#tad-send').addEventListener('click', async () => {
      const text = modal.querySelector('#tad-reply').value.trim()
      if (!text) { modal.querySelector('#tad-reply').focus(); return }
      const btn = modal.querySelector('#tad-send')
      btn.disabled = true; btn.textContent = '...'
      try {
        const reply = {
          text,
          fromAdmin: true,
          authorName: profile.name || user.email,
          createdAt: new Date(),
        }
        const newStatus = t.status === 'new' || t.status === 'open' ? 'in_progress' : t.status
        await updateDoc(doc(db, 'tickets', ticketId), {
          replies: arrayUnion(reply),
          status: newStatus,
          updatedAt: serverTimestamp(),
        })
        const idx = allTickets.findIndex(t => t.id === ticketId)
        if (idx !== -1) {
          allTickets[idx].replies = [...(allTickets[idx].replies || []), reply]
          allTickets[idx].status  = newStatus
        }
        modal.remove()
        renderTickets()
        showToast('Відповідь надіслано')
      } catch (err) { console.error(err); btn.disabled = false; btn.innerHTML = icon('send', 14) + ' Надіслати відповідь' }
    })
  }

  function esc(s = '') {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  }

  // ═══════════════════════════════════════════════════════════
  // ANNOUNCEMENTS
  // ═══════════════════════════════════════════════════════════
  function renderAnnouncements() {
    const el = container.querySelector('#notif-history')
    if (!allAnnouncements.length) {
      el.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:16px 0">Повідомлень ще немає</div>'
      return
    }
    const typeIcon = { info: icon('info',14), success: icon('check-circle',14), warning: icon('warning',14), error: icon('x-circle',14) }
    const targetLabel = { all: 'Всі', free: 'FREE', pro: 'PRO', business: 'BUSINESS', paid: 'Платні' }
    el.innerHTML = allAnnouncements.map(n => {
      const date = n.createdAt?.toDate?.()?.toLocaleDateString('uk-UA') || '—'
      return `
        <div class="adm-notif-item adm-notif-${n.type||'info'}">
          <div class="adm-notif-item-head">
            <span class="adm-notif-type-icon">${typeIcon[n.type]||icon('info',14)}</span>
            <span class="adm-notif-item-title">${n.title}</span>
            <span class="adm-notif-target">${targetLabel[n.target]||n.target}</span>
            <span class="adm-notif-date">${date}</span>
            <button class="adm-notif-del" data-id="${n.id}" title="Видалити">${icon('x', 12)}</button>
          </div>
          <div class="adm-notif-item-body">${n.body}</div>
          <div class="adm-notif-by">Відправив: ${n.createdByName || '—'}</div>
        </div>`
    }).join('')

    el.querySelectorAll('.adm-notif-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await deleteDoc(doc(db, 'announcements', btn.dataset.id))
          allAnnouncements = allAnnouncements.filter(n => n.id !== btn.dataset.id)
          renderAnnouncements()
        } catch (err) { console.error(err) }
      })
    })
  }

  // ═══════════════════════════════════════════════════════════
  // EXPORT CSV
  // ═══════════════════════════════════════════════════════════
  function exportCSV() {
    const headers = ['UID', 'Ім\'я', 'Email', 'Бізнес', 'Ніша', 'План', 'Підписка до', 'Зареєстрований', 'Забанований']
    const rows = allUsers.map(u => [
      u.id, u.name||'', u.email||'', u.businessName||'', u.profession||'',
      u.plan||'free', u.subscriptionEnd ? new Date(u.subscriptionEnd).toLocaleDateString('uk-UA') : '',
      u.createdAt?.toDate?.()?.toLocaleDateString('uk-UA') || '',
      u.isBanned ? 'Так' : 'Ні',
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `workhub-users-${new Date().toISOString().slice(0,10)}.csv`
    a.click(); URL.revokeObjectURL(url)
    showToast('CSV експортовано')
  }

  // ── Helpers ───────────────────────────────────────────────
  function profLabel(id) {
    return { freelancer:'Фрілансер', accountant:'Бухгалтер', smm:'SMM', beauty:'Салон' }[id] || '—'
  }
  function nicheIcon(id) {
    return icon({ freelancer:'laptop', accountant:'bar-chart', smm:'smartphone', beauty:'sparkles' }[id] || 'briefcase', 14)
  }
  function nextMonth() {
    const d = new Date(); d.setMonth(d.getMonth() + 1); return d.toISOString().split('T')[0]
  }
  function showToast(msg, type = 'success') {
    document.getElementById('adm-toast')?.remove()
    const el = document.createElement('div')
    el.id = 'adm-toast'
    el.className = `adm-toast adm-toast-${type}`
    el.textContent = msg
    document.body.appendChild(el)
    requestAnimationFrame(() => el.classList.add('show'))
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300) }, 2800)
  }
}

// ── Styles ────────────────────────────────────────────────
function injectStyles() {
  document.getElementById('admin-styles')?.remove()
  const s = document.createElement('style')
  s.id = 'admin-styles'
  s.textContent = `
    .adm-page    { padding: 28px 36px; max-width: 1300px; }
    .adm-header  { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:22px; gap:16px; }
    .adm-title   { font-family:var(--font-display); font-size:26px; font-weight:800; margin-bottom:4px; }
    .adm-subtitle{ font-size:13px; color:var(--text-muted); }
    .adm-header-right { display:flex; gap:10px; align-items:center; }
    .adm-badge   { font-size:12px; font-weight:600; padding:5px 14px; background:rgba(239,68,68,.12); color:#F87171; border-radius:var(--radius-full); border:1px solid rgba(239,68,68,.2); }
    .adm-refresh-btn { font-size:13px; font-weight:600; padding:5px 14px; background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-md); cursor:pointer; transition:all .15s; color:var(--text-secondary); }
    .adm-refresh-btn:hover { border-color:var(--accent-blue); color:var(--accent-blue); }

    /* Tabs */
    .adm-tabs  { display:flex; gap:4px; margin-bottom:22px; background:var(--bg-secondary); padding:4px; border-radius:var(--radius-md); border:1px solid var(--border); width:fit-content; }
    .adm-tab   { display:flex; align-items:center; gap:6px; padding:7px 18px; border-radius:var(--radius-sm); font-size:13px; font-weight:600; color:var(--text-muted); cursor:pointer; border:none; background:none; transition:all .15s; white-space:nowrap; }
    .adm-tab:hover  { color:var(--text-primary); }
    .adm-tab.active { background:var(--bg-primary); color:var(--text-primary); box-shadow:0 1px 4px rgba(0,0,0,.3); }

    /* Stats row */
    .adm-stats-row  { display:grid; grid-template-columns:repeat(6,1fr); gap:12px; margin-bottom:20px; }
    .adm-stat-card  { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-lg); padding:18px 16px; }
    .adm-stat-blue   { border-color:rgba(79,142,247,.3); }
    .adm-stat-purple { border-color:rgba(167,139,250,.3); }
    .adm-stat-green  { border-color:rgba(52,211,153,.3); }
    .adm-stat-orange { border-color:rgba(245,158,11,.3); }
    .adm-stat-icon   { display:flex; align-items:center; margin-bottom:8px; color:var(--text-secondary); }
    .adm-stat-val    { font-family:var(--font-display); font-size:26px; font-weight:800; margin-bottom:3px; line-height:1; }
    .adm-stat-lbl    { font-size:11px; color:var(--text-muted); }
    .adm-skel        { height:90px; background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-lg); animation:skel-pulse 1.4s ease infinite; }
    @keyframes skel-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

    /* Overview grid */
    .adm-overview-grid { display:grid; grid-template-columns:1.2fr 1fr 1fr; gap:14px; }
    .adm-card { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-xl); padding:20px; }
    .adm-card-wide { grid-column: 1/-1; }
    .adm-card-title { font-family:var(--font-display); font-size:15px; font-weight:700; margin-bottom:16px; }

    /* Activity bars */
    .adm-activity-bars { display:flex; align-items:flex-end; gap:6px; height:80px; }
    .adm-act-col  { display:flex; flex-direction:column; align-items:center; gap:2px; flex:1; }
    .adm-act-bar-wrap { flex:1; width:100%; display:flex; align-items:flex-end; }
    .adm-act-bar  { width:100%; min-height:3px; background:var(--accent-blue); border-radius:3px 3px 0 0; opacity:.8; }
    .adm-act-count{ font-size:10px; font-weight:700; color:var(--text-muted); }
    .adm-act-label{ font-size:9px; color:var(--text-muted); text-transform:capitalize; }

    /* Breakdown */
    .adm-break-row   { display:flex; align-items:center; gap:10px; padding:7px 0; }
    .adm-break-label { font-size:12px; font-weight:700; width:80px; flex-shrink:0; }
    .adm-break-bar-wrap { flex:1; height:6px; background:var(--bg-tertiary); border-radius:3px; overflow:hidden; }
    .adm-break-bar   { height:100%; border-radius:3px; transition:width .5s; }
    .adm-break-count { font-size:12px; color:var(--text-secondary); width:70px; text-align:right; flex-shrink:0; }

    /* Analytics */
    .adm-an-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .adm-chart-wrap { overflow-x:auto; }
    .adm-reg-chart { display:flex; align-items:flex-end; gap:3px; height:100px; padding-bottom:18px; min-width:500px; }
    .adm-reg-col   { display:flex; flex-direction:column; align-items:center; flex:1; min-width:14px; }
    .adm-reg-bar   { width:100%; background:linear-gradient(180deg,#4F8EF7,#667eea); border-radius:3px 3px 0 0; min-height:3px; transition:height .3s; }
    .adm-reg-label { font-size:9px; color:var(--text-muted); margin-top:4px; white-space:nowrap; }
    .adm-rev-total { font-family:var(--font-display); font-size:32px; font-weight:800; margin-bottom:14px; }
    .adm-conv-ring { position:relative; width:100px; height:100px; margin:8px auto 12px; }
    .adm-ring-svg  { width:100%; height:100%; transform:rotate(-90deg); }
    .adm-ring-val  { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-family:var(--font-display); font-size:18px; font-weight:800; }
    .adm-conv-row  { display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--border); font-size:13px; }
    .adm-conv-row:last-child { border:none; }

    /* Toolbar */
    .adm-toolbar     { display:flex; align-items:center; gap:10px; margin-bottom:14px; flex-wrap:wrap; }
    .adm-search      { display:flex; align-items:center; gap:8px; background:var(--bg-secondary); border:1.5px solid var(--border); border-radius:var(--radius-md); padding:9px 14px; flex:1; max-width:400px; transition:border-color .15s; }
    .adm-search:focus-within { border-color:var(--accent-blue); }
    .adm-search input { flex:1; background:none; font-size:14px; color:var(--text-primary); outline:none; }
    .adm-search input::placeholder { color:var(--text-muted); }
    .adm-select      { padding:8px 12px; background:var(--bg-secondary); border:1.5px solid var(--border); border-radius:var(--radius-md); font-size:13px; color:var(--text-primary); cursor:pointer; }
    .adm-count-label { font-size:13px; color:var(--text-muted); white-space:nowrap; }
    .adm-filter-pills { display:flex; gap:6px; }
    .adm-pill { padding:6px 16px; border-radius:var(--radius-full); font-size:13px; font-weight:600; color:var(--text-secondary); background:var(--bg-secondary); border:1px solid var(--border); cursor:pointer; transition:all .15s; }
    .adm-pill:hover  { border-color:var(--accent-blue); color:var(--text-primary); }
    .adm-pill.active { background:var(--accent-blue); border-color:var(--accent-blue); color:#fff; }

    /* Table */
    .adm-table     { width:100%; border-collapse:collapse; background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-xl); overflow:hidden; }
    .adm-table th  { text-align:left; padding:11px 14px; font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.05em; background:var(--bg-tertiary); border-bottom:1px solid var(--border); }
    .adm-table td  { padding:11px 14px; border-bottom:1px solid var(--border); font-size:13px; vertical-align:middle; }
    .adm-table tr:last-child td { border-bottom:none; }
    .adm-table tr:hover td { background:rgba(255,255,255,.02); }
    .adm-row-banned td { opacity:.6; }

    .adm-user-cell   { display:flex; align-items:center; gap:10px; }
    .adm-avatar      { width:36px; height:36px; border-radius:50%; background:linear-gradient(135deg,#667eea,#764ba2); color:#fff; font-size:14px; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .adm-avatar-banned { filter:grayscale(1); opacity:.7; }
    .adm-user-name   { font-weight:600; font-size:13px; }
    .adm-user-email  { font-size:11px; color:var(--text-muted); }
    .adm-user-row    { display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid var(--border); }
    .adm-user-row:last-child { border-bottom:none; }
    .adm-user-info   { flex:1; min-width:0; }
    .adm-plan-pill   { font-size:11px; font-weight:700; padding:3px 10px; border-radius:var(--radius-full); white-space:nowrap; }
    .adm-plan-pill-lg { font-size:13px; padding:5px 14px; }
    .adm-admin-badge { display:inline-flex; font-size:10px; font-weight:800; padding:2px 7px; background:rgba(245,158,11,.15); color:#F59E0B; border-radius:var(--radius-full); margin-left:6px; }
    .adm-banned-badge { display:inline-flex; font-size:10px; font-weight:800; padding:2px 7px; background:rgba(239,68,68,.15); color:#F87171; border-radius:var(--radius-full); margin-left:6px; }
    .adm-action-btns { display:flex; gap:5px; align-items:center; }
    .adm-action-btn  { font-size:11px; font-weight:600; padding:4px 9px; border-radius:var(--radius-sm); cursor:pointer; transition:all .15s; border:1px solid var(--border); background:var(--bg-tertiary); white-space:nowrap; }
    .adm-action-btn:hover { border-color:var(--accent-blue); color:var(--accent-blue); }
    .adm-btn-approve:hover,.adm-btn-approve { color:#34D399; border-color:rgba(52,211,153,.4); }
    .adm-btn-rej:hover     { color:#F87171; border-color:rgba(239,68,68,.4); background:rgba(239,68,68,.06); }
    .adm-btn-ban:hover     { color:#F87171; border-color:rgba(239,68,68,.4); background:rgba(239,68,68,.06); }
    .adm-btn-unban:hover   { color:#34D399; border-color:rgba(52,211,153,.4); }
    .adm-btn-admin:hover   { color:#F59E0B; border-color:rgba(245,158,11,.4); }
    .adm-status-chip { font-size:11px; font-weight:700; padding:3px 10px; border-radius:var(--radius-full); }
    .adm-status-approved { background:rgba(52,211,153,.12); color:#34D399; }
    .adm-status-rejected { background:rgba(239,68,68,.12); color:#F87171; }

    /* Buttons */
    .adm-btn { display:inline-flex; align-items:center; gap:6px; padding:9px 18px; border-radius:var(--radius-md); font-size:13px; font-weight:700; cursor:pointer; border:none; transition:all .15s; }
    .adm-btn-primary { background:linear-gradient(135deg,#667eea,#4F8EF7); color:#fff; }
    .adm-btn-primary:hover { transform:translateY(-1px); box-shadow:0 4px 14px rgba(79,142,247,.4); }
    .adm-btn-primary:disabled { opacity:.6; transform:none; box-shadow:none; }
    .adm-btn-ghost { background:var(--bg-tertiary); border:1.5px solid var(--border); color:var(--text-primary); }
    .adm-btn-ghost:hover { border-color:var(--accent-blue); }
    .adm-btn-danger { background:rgba(239,68,68,.15); color:#F87171; border:1.5px solid rgba(239,68,68,.3); }
    .adm-btn-danger:hover { background:rgba(239,68,68,.25); }
    .adm-btn-success { background:rgba(52,211,153,.15); color:#34D399; border:1.5px solid rgba(52,211,153,.3); }
    .adm-btn-success:hover { background:rgba(52,211,153,.25); }

    /* Modals */
    .adm-overlay { position:fixed; inset:0; background:rgba(0,0,0,.65); backdrop-filter:blur(6px); display:flex; align-items:center; justify-content:center; z-index:2000; padding:24px; }
    .adm-modal   { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-xl); width:100%; max-width:560px; max-height:90vh; overflow:hidden; display:flex; flex-direction:column; box-shadow:var(--shadow-xl); animation:adm-in .2s cubic-bezier(.34,1.2,.64,1); }
    .adm-modal-lg { max-width:840px; }
    @keyframes adm-in { from{opacity:0;transform:scale(.94)} to{opacity:1;transform:scale(1)} }
    .adm-modal-head { display:flex; align-items:center; justify-content:space-between; padding:22px 24px 0; flex-shrink:0; }
    .adm-modal-head h2 { font-family:var(--font-display); font-size:20px; font-weight:800; }
    .adm-modal-close { background:none; border:none; font-size:14px; color:var(--text-muted); cursor:pointer; padding:4px 8px; border-radius:6px; transition:all .15s; }
    .adm-modal-close:hover { background:var(--bg-tertiary); color:var(--text-primary); }
    .adm-modal-body { padding:20px 24px; display:flex; flex-direction:column; gap:16px; overflow-y:auto; flex:1; }
    .adm-modal-foot { display:flex; gap:10px; justify-content:flex-end; padding:14px 24px; border-top:1px solid var(--border); flex-shrink:0; }
    .adm-field label { display:block; font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.05em; margin-bottom:6px; }
    .adm-input { width:100%; box-sizing:border-box; padding:10px 14px; background:var(--bg-tertiary); border:1.5px solid var(--border); border-radius:var(--radius-md); font-size:14px; color:var(--text-primary); outline:none; transition:border-color .15s; font-family:inherit; }
    .adm-input:focus { border-color:var(--accent-blue); }
    .adm-pay-config { background:var(--bg-tertiary); border:1px solid var(--border); border-radius:var(--radius-lg); padding:20px 24px; margin-bottom:4px; }
    .adm-textarea { resize:vertical; min-height:80px; }

    /* Plan picker */
    .adm-plan-picker { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
    .adm-plan-pick   { padding:12px; border-radius:var(--radius-md); background:var(--bg-tertiary); border:2px solid var(--border); cursor:pointer; transition:all .15s; text-align:center; }
    .adm-plan-pick:hover { border-color:var(--pc,var(--border)); }
    .adm-plan-pick.active { border-color:var(--pc); background:color-mix(in srgb,var(--pc) 10%,var(--bg-tertiary)); }
    .adm-plan-pick-name  { font-size:13px; font-weight:800; margin-bottom:3px; }
    .adm-plan-pick-price { font-size:11px; color:var(--text-muted); }

    /* User detail */
    .adm-detail-body  { display:grid; grid-template-columns:220px 1fr; gap:20px; }
    .adm-detail-left  { display:flex; flex-direction:column; align-items:center; text-align:center; gap:8px; }
    .adm-detail-avatar{ width:80px; height:80px; border-radius:50%; background:linear-gradient(135deg,#667eea,#764ba2); color:#fff; font-size:30px; font-weight:800; display:flex; align-items:center; justify-content:center; }
    .adm-detail-name  { font-size:17px; font-weight:800; }
    .adm-detail-email { font-size:12px; color:var(--text-muted); word-break:break-all; }
    .adm-detail-meta  { width:100%; margin-top:8px; }
    .adm-meta-row     { display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid var(--border); font-size:12px; }
    .adm-meta-row:last-child { border:none; }
    .adm-meta-label   { color:var(--text-muted); width:70px; flex-shrink:0; }
    .adm-meta-val     { flex:1; text-align:left; font-weight:500; overflow:hidden; text-overflow:ellipsis; }
    .adm-detail-actions { display:flex; flex-direction:column; gap:8px; width:100%; margin-top:8px; }
    .adm-detail-section { font-size:13px; font-weight:700; color:var(--text-secondary); border-bottom:1px solid var(--border); padding-bottom:8px; margin-bottom:12px; }
    .adm-biz-list     { display:flex; flex-direction:column; gap:8px; }
    .adm-biz-item     { display:flex; align-items:center; gap:10px; padding:10px 12px; background:var(--bg-tertiary); border-radius:var(--radius-md); }
    .adm-biz-main     { border:1px solid rgba(79,142,247,.3); }
    .adm-biz-icon     { display:flex; align-items:center; flex-shrink:0; color:var(--text-secondary); }
    .adm-biz-name     { font-size:13px; font-weight:600; }
    .adm-biz-niche    { font-size:11px; color:var(--text-muted); }
    .adm-biz-badge    { font-size:10px; font-weight:800; padding:2px 8px; background:rgba(79,142,247,.15); color:var(--accent-blue); border-radius:var(--radius-full); margin-left:auto; }
    .adm-modules-wrap { display:flex; flex-wrap:wrap; gap:6px; }
    .adm-mod-chip     { font-size:11px; font-weight:600; padding:4px 10px; border-radius:var(--radius-full); background:var(--bg-tertiary); border:1px solid var(--border); }

    /* Notifications */
    .adm-notif-layout    { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
    .adm-notif-form-card { display:flex; flex-direction:column; gap:14px; }
    .adm-notif-list-card { overflow-y:auto; max-height:600px; }
    .adm-type-row        { display:flex; gap:6px; flex-wrap:wrap; }
    .adm-type-btn        { padding:6px 12px; border-radius:var(--radius-md); font-size:12px; font-weight:600; border:1.5px solid var(--border); background:var(--bg-tertiary); cursor:pointer; transition:all .15s; }
    .adm-type-btn:hover  { border-color:var(--accent-blue); }
    .adm-type-btn.active { background:var(--accent-blue); border-color:var(--accent-blue); color:#fff; }
    .adm-notif-item      { background:var(--bg-tertiary); border:1px solid var(--border); border-radius:var(--radius-md); padding:12px 14px; margin-bottom:8px; border-left:3px solid var(--border); }
    .adm-notif-info    { border-left-color:#4F8EF7; }
    .adm-notif-success { border-left-color:#34D399; }
    .adm-notif-warning { border-left-color:#F59E0B; }
    .adm-notif-error   { border-left-color:#F87171; }
    .adm-notif-item-head { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
    .adm-notif-type-icon { font-size:15px; flex-shrink:0; }
    .adm-notif-item-title{ font-size:13px; font-weight:700; flex:1; }
    .adm-notif-target    { font-size:10px; font-weight:700; padding:2px 8px; border-radius:var(--radius-full); background:rgba(79,142,247,.12); color:var(--accent-blue); flex-shrink:0; }
    .adm-notif-date      { font-size:11px; color:var(--text-muted); flex-shrink:0; }
    .adm-notif-del       { background:none; border:none; font-size:11px; color:var(--text-muted); cursor:pointer; padding:2px 4px; border-radius:4px; flex-shrink:0; }
    .adm-notif-del:hover { color:#F87171; }
    .adm-notif-item-body { font-size:12px; color:var(--text-secondary); margin-bottom:6px; line-height:1.5; }
    .adm-notif-by        { font-size:10px; color:var(--text-muted); }

    /* Misc */
    .adm-empty       { color:var(--text-muted); font-size:14px; text-align:center; padding:48px; }
    .adm-loading     { display:flex; justify-content:center; padding:20px; }
    .adm-loading::after { content:''; width:20px; height:20px; border:2px solid var(--border); border-top-color:var(--accent-blue); border-radius:50%; animation:adm-spin .7s linear infinite; }
    .adm-loading-big { display:flex; justify-content:center; padding:60px; }
    .adm-loading-big::after { content:''; width:32px; height:32px; border:3px solid var(--border); border-top-color:var(--accent-blue); border-radius:50%; animation:adm-spin .7s linear infinite; }
    @keyframes adm-spin { to{transform:rotate(360deg)} }

    /* Toast */
    .adm-toast { position:fixed; bottom:24px; right:24px; padding:12px 20px; border-radius:var(--radius-md); font-size:14px; font-weight:600; box-shadow:var(--shadow-xl); z-index:9999; opacity:0; transform:translateY(8px); transition:all .25s; border-left:3px solid #34D399; background:var(--bg-secondary); border:1px solid var(--border); }
    .adm-toast.show { opacity:1; transform:translateY(0); }
    .adm-toast-success { border-left:3px solid #34D399; }
    .adm-toast-error   { border-left:3px solid #F87171; }

    @media (max-width:1100px) {
      .adm-stats-row { grid-template-columns:repeat(3,1fr); }
      .adm-overview-grid { grid-template-columns:1fr; }
      .adm-an-grid { grid-template-columns:1fr; }
      .adm-detail-body { grid-template-columns:1fr; }
      .adm-notif-layout { grid-template-columns:1fr; }
    }
  `
  document.head.appendChild(s)
}
