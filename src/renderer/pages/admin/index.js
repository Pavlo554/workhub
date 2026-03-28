// src/renderer/pages/admin/index.js
import { db } from '../../services/firebase.js'
import { getCurrentUser, getUserProfile, updateProfileCache } from '../../services/auth.js'
import { navigate } from '../../../core/router.js'
import {
  collection, collectionGroup, getDocs, doc,
  updateDoc, serverTimestamp, query, orderBy, where, limit
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

const PLAN_META = {
  free:     { label: 'FREE',     color: '#94A3B8' },
  pro:      { label: 'PRO',      color: '#4F8EF7' },
  business: { label: 'BUSINESS', color: '#A78BFA' },
}

export async function render(container) {
  const user    = getCurrentUser()
  const profile = await getUserProfile(user.uid)

  // ── Захист: тільки адміни ─────────────────────────────────
  if (!profile?.isAdmin) {
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:60vh;gap:16px">
        <div style="font-size:48px">🚫</div>
        <div style="font-size:18px;font-weight:700">Доступ заборонено</div>
        <div style="font-size:14px;color:var(--text-muted)">У вас немає прав адміністратора</div>
        <button class="btn btn-secondary" id="back-btn">← Назад</button>
      </div>
    `
    container.querySelector('#back-btn').addEventListener('click', () => navigate('dashboard'))
    return
  }

  injectStyles()

  container.innerHTML = `
    <div class="admin-page">

      <div class="admin-header">
        <div>
          <h1 class="admin-title">🛡 Адмін панель</h1>
          <p class="admin-subtitle">WorkHub · Управління користувачами та платежами</p>
        </div>
        <div class="admin-header-right">
          <span class="admin-badge">Admin: ${profile.name || user.email}</span>
        </div>
      </div>

      <!-- Tabs -->
      <div class="admin-tabs" id="admin-tabs">
        <button class="admin-tab active" data-tab="overview">📊 Огляд</button>
        <button class="admin-tab" data-tab="users">👥 Користувачі</button>
        <button class="admin-tab" data-tab="payments">💳 Платежі</button>
      </div>

      <!-- Tab content -->
      <div id="tab-overview" class="tab-panel">
        <div class="overview-grid" id="overview-stats">
          ${[1,2,3,4].map(() => `<div class="stat-card-admin"><div class="skel skel-block" style="height:90px"></div></div>`).join('')}
        </div>
        <div class="overview-bottom">
          <div class="recent-card" id="recent-users-card">
            <div class="recent-header"><h3>🕐 Нові реєстрації</h3></div>
            <div class="recent-list" id="recent-users-list">
              <div class="loading-row"><div class="spinner"></div></div>
            </div>
          </div>
          <div class="recent-card" id="plan-breakdown-card">
            <div class="recent-header"><h3>📈 Розподіл по планах</h3></div>
            <div id="plan-breakdown"></div>
          </div>
        </div>
      </div>

      <div id="tab-users" class="tab-panel" style="display:none">
        <div class="users-toolbar">
          <div class="search-bar" style="flex:1;max-width:400px">
            <span class="search-icon">🔍</span>
            <input type="text" class="search-input" id="users-search" placeholder="Пошук за іменем або email..." />
          </div>
          <div class="users-filter-wrap">
            <select class="input" id="plan-filter" style="width:140px">
              <option value="all">Всі плани</option>
              <option value="free">FREE</option>
              <option value="pro">PRO</option>
              <option value="business">BUSINESS</option>
            </select>
          </div>
          <span class="users-count-label" id="users-count-label"></span>
        </div>
        <div id="users-table-wrap">
          <div class="loading-row"><div class="spinner"></div></div>
        </div>
      </div>

      <div id="tab-payments" class="tab-panel" style="display:none">
        <div class="payments-toolbar">
          <div class="pay-filter-tabs" id="pay-filter-tabs">
            <button class="filter-tab active" data-status="pending">⏳ Очікують</button>
            <button class="filter-tab" data-status="approved">✓ Підтверджені</button>
            <button class="filter-tab" data-status="rejected">✗ Відхилені</button>
          </div>
        </div>
        <div id="payments-list">
          <div class="loading-row"><div class="spinner"></div></div>
        </div>
      </div>

    </div>
  `

  // ── State ─────────────────────────────────────────────────
  let allUsers    = []
  let allPayments = []
  let activeTab   = 'overview'
  let payFilter   = 'pending'

  // ── Tabs ──────────────────────────────────────────────────
  container.querySelector('#admin-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.admin-tab')
    if (!tab) return
    container.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'))
    tab.classList.add('active')
    activeTab = tab.dataset.tab
    container.querySelectorAll('.tab-panel').forEach(p => p.style.display = 'none')
    container.querySelector(`#tab-${activeTab}`).style.display = 'block'
  })

  container.querySelector('#pay-filter-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.filter-tab')
    if (!tab) return
    container.querySelectorAll('#pay-filter-tabs .filter-tab').forEach(t => t.classList.remove('active'))
    tab.classList.add('active')
    payFilter = tab.dataset.status
    renderPayments()
  })

  // ── Load data (parallel) ──────────────────────────────────
  const [users, payments] = await Promise.all([
    loadAllUsers(),
    loadAllPayments(),
  ])
  allUsers    = users
  allPayments = payments

  renderOverview()
  renderUsersTable()
  renderPayments()

  // ── Search & filter ───────────────────────────────────────
  container.querySelector('#users-search').addEventListener('input', () => renderUsersTable())
  container.querySelector('#plan-filter').addEventListener('change', () => renderUsersTable())

  // ═══════════════════════════════════════════════════════════
  // LOADERS
  // ═══════════════════════════════════════════════════════════

  async function loadAllUsers() {
    try {
      const snap = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc')))
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch (err) {
      console.error('Admin: loadAllUsers', err)
      return []
    }
  }

  async function loadAllPayments() {
    try {
      const snap = await getDocs(
        query(collectionGroup(db, 'pendingPayments'), limit(200))
      )
      return snap.docs
        .map(d => ({ id: d.id, userId: d.ref.parent.parent.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
    } catch (err) {
      console.error('Admin: loadAllPayments', err)
      return []
    }
  }

  // ═══════════════════════════════════════════════════════════
  // OVERVIEW
  // ═══════════════════════════════════════════════════════════

  function renderOverview() {
    const total    = allUsers.length
    const byPlan   = { free: 0, pro: 0, business: 0 }
    allUsers.forEach(u => { byPlan[u.plan || 'free']++ })

    const pendingCount = allPayments.filter(p => p.status === 'pending').length
    const proRevenue   = byPlan.pro * 299 + byPlan.business * 799

    container.querySelector('#overview-stats').innerHTML = `
      <div class="stat-card-admin">
        <div class="stat-admin-icon">👥</div>
        <div class="stat-admin-value">${total}</div>
        <div class="stat-admin-label">Всього користувачів</div>
      </div>
      <div class="stat-card-admin card-blue">
        <div class="stat-admin-icon">⭐</div>
        <div class="stat-admin-value">${byPlan.pro + byPlan.business}</div>
        <div class="stat-admin-label">Платних підписок</div>
      </div>
      <div class="stat-card-admin card-green">
        <div class="stat-admin-icon">💰</div>
        <div class="stat-admin-value">₴${proRevenue.toLocaleString('uk-UA')}</div>
        <div class="stat-admin-label">Місячний дохід (орієнт.)</div>
      </div>
      <div class="stat-card-admin card-orange">
        <div class="stat-admin-icon">⏳</div>
        <div class="stat-admin-value">${pendingCount}</div>
        <div class="stat-admin-label">Платежів на перевірці</div>
      </div>
    `

    // Recent users (last 5)
    const recent = allUsers.slice(0, 5)
    container.querySelector('#recent-users-list').innerHTML = recent.length === 0
      ? '<div class="empty-row">Немає реєстрацій</div>'
      : recent.map(u => `
        <div class="recent-row">
          <div class="recent-avatar">${(u.name || u.email || '?')[0].toUpperCase()}</div>
          <div class="recent-info">
            <div class="recent-name">${u.name || '—'}</div>
            <div class="recent-email">${u.email || u.id}</div>
          </div>
          <span class="plan-pill" style="color:${(PLAN_META[u.plan]||PLAN_META.free).color};background:${(PLAN_META[u.plan]||PLAN_META.free).color}18">
            ${(PLAN_META[u.plan]||PLAN_META.free).label}
          </span>
        </div>
      `).join('')

    // Plan breakdown bars
    container.querySelector('#plan-breakdown').innerHTML = Object.entries(byPlan).map(([plan, count]) => {
      const pct = total > 0 ? Math.round((count / total) * 100) : 0
      const m   = PLAN_META[plan] || PLAN_META.free
      return `
        <div class="breakdown-row">
          <span class="breakdown-label">${m.label}</span>
          <div class="breakdown-bar-wrap">
            <div class="breakdown-bar" style="width:${pct}%;background:${m.color}"></div>
          </div>
          <span class="breakdown-count">${count} (${pct}%)</span>
        </div>
      `
    }).join('')
  }

  // ═══════════════════════════════════════════════════════════
  // USERS
  // ═══════════════════════════════════════════════════════════

  function renderUsersTable() {
    const q          = container.querySelector('#users-search').value.toLowerCase().trim()
    const planFilter = container.querySelector('#plan-filter').value

    let list = allUsers
    if (q) list = list.filter(u =>
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.businessName?.toLowerCase().includes(q)
    )
    if (planFilter !== 'all') list = list.filter(u => (u.plan || 'free') === planFilter)

    container.querySelector('#users-count-label').textContent = `${list.length} з ${allUsers.length}`

    if (list.length === 0) {
      container.querySelector('#users-table-wrap').innerHTML =
        '<div class="empty-row" style="padding:48px;text-align:center">Користувачів не знайдено</div>'
      return
    }

    container.querySelector('#users-table-wrap').innerHTML = `
      <table class="admin-table">
        <thead>
          <tr>
            <th>Користувач</th>
            <th>Бізнес</th>
            <th>Професія</th>
            <th>План</th>
            <th>Підписка до</th>
            <th>Реєстрація</th>
            <th>Дії</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(u => {
            const plan  = u.plan || 'free'
            const pm    = PLAN_META[plan] || PLAN_META.free
            const regDate = u.createdAt?.toDate ? u.createdAt.toDate().toLocaleDateString('uk-UA') : '—'
            const subEnd  = u.subscriptionEnd
              ? new Date(u.subscriptionEnd).toLocaleDateString('uk-UA')
              : '—'
            return `
              <tr data-uid="${u.id}">
                <td>
                  <div class="user-cell">
                    <div class="user-cell-avatar">${(u.name || '?')[0].toUpperCase()}</div>
                    <div>
                      <div class="user-cell-name">${u.name || '—'}</div>
                      <div class="user-cell-email">${u.email || u.id}</div>
                    </div>
                  </div>
                </td>
                <td>${u.businessName || '—'}</td>
                <td>${profLabel(u.profession)}</td>
                <td>
                  <span class="plan-pill" style="color:${pm.color};background:${pm.color}18">${pm.label}</span>
                </td>
                <td>${subEnd}</td>
                <td>${regDate}</td>
                <td>
                  <div class="action-btns">
                    <button class="action-btn btn-change-plan" data-uid="${u.id}" data-plan="${plan}" title="Змінити план">✏️ План</button>
                    ${!u.isAdmin
                      ? `<button class="action-btn btn-make-admin" data-uid="${u.id}" title="Зробити адміном">🛡</button>`
                      : `<span class="admin-label">🛡 Admin</span>`
                    }
                  </div>
                </td>
              </tr>
            `
          }).join('')}
        </tbody>
      </table>
    `

    // Change plan
    container.querySelectorAll('.btn-change-plan').forEach(btn => {
      btn.addEventListener('click', () => openChangePlanModal(btn.dataset.uid, btn.dataset.plan))
    })

    // Make admin
    container.querySelectorAll('.btn-make-admin').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Зробити цього користувача адміністратором?')) return
        await updateDoc(doc(db, 'users', btn.dataset.uid), { isAdmin: true })
        const u = allUsers.find(u => u.id === btn.dataset.uid)
        if (u) u.isAdmin = true
        renderUsersTable()
      })
    })
  }

  // ── Change plan modal ─────────────────────────────────────
  function openChangePlanModal(uid, currentPlan) {
    const user = allUsers.find(u => u.id === uid)
    if (!user) return

    const modal = document.createElement('div')
    modal.className = 'modal-overlay'
    modal.innerHTML = `
      <div class="modal" style="max-width:400px">
        <div class="modal-header">
          <h2 class="modal-title">Змінити план</h2>
          <button class="modal-close" id="cp-close">✕</button>
        </div>
        <div class="modal-body">
          <div style="margin-bottom:16px">
            <div style="font-weight:600;margin-bottom:4px">${user.name || user.email}</div>
            <div style="font-size:13px;color:var(--text-secondary)">Поточний план: <strong>${currentPlan.toUpperCase()}</strong></div>
          </div>

          <div class="field">
            <label>Новий план</label>
            <select class="input" id="cp-plan">
              <option value="free"     ${currentPlan==='free'     ? 'selected' : ''}>FREE — безкоштовно</option>
              <option value="pro"      ${currentPlan==='pro'      ? 'selected' : ''}>PRO — ₴299/міс</option>
              <option value="business" ${currentPlan==='business' ? 'selected' : ''}>BUSINESS — ₴799/міс</option>
            </select>
          </div>

          <div class="field">
            <label>Підписка до (дата)</label>
            <input type="date" class="input" id="cp-end"
              value="${user.subscriptionEnd ? user.subscriptionEnd.split('T')[0] : nextMonth()}" />
          </div>

          <div class="field">
            <label>Причина / коментар</label>
            <input type="text" class="input" id="cp-reason" placeholder="Вручну, промо, тест..." />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="cp-cancel">Скасувати</button>
          <button class="btn btn-primary" id="cp-save">Зберегти</button>
        </div>
      </div>
    `
    document.body.appendChild(modal)
    modal.querySelector('#cp-close').addEventListener('click',  () => modal.remove())
    modal.querySelector('#cp-cancel').addEventListener('click', () => modal.remove())
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove() })

    modal.querySelector('#cp-save').addEventListener('click', async () => {
      const newPlan = modal.querySelector('#cp-plan').value
      const endDate = modal.querySelector('#cp-end').value
      const btn     = modal.querySelector('#cp-save')
      btn.disabled  = true
      btn.textContent = '...'

      try {
        const updateData = {
          plan:               newPlan,
          subscriptionEnd:    endDate ? new Date(endDate).toISOString() : null,
          subscriptionStatus: newPlan === 'free' ? 'inactive' : 'active',
          updatedAt:          serverTimestamp(),
          adminNote:          modal.querySelector('#cp-reason').value.trim() || null,
        }
        await updateDoc(doc(db, 'users', uid), updateData)

        // Оновлюємо локальний список
        const idx = allUsers.findIndex(u => u.id === uid)
        if (idx !== -1) Object.assign(allUsers[idx], updateData)

        // Якщо це поточний юзер — оновлюємо кеш
        if (uid === user.uid) updateProfileCache(uid, updateData)

        modal.remove()
        renderUsersTable()
        renderOverview()
        showToast(`План ${user.name || uid} змінено на ${newPlan.toUpperCase()}`)
      } catch (err) {
        console.error(err)
        btn.disabled = false
        btn.textContent = 'Зберегти'
      }
    })
  }

  // ═══════════════════════════════════════════════════════════
  // PAYMENTS
  // ═══════════════════════════════════════════════════════════

  function renderPayments() {
    const filtered = allPayments.filter(p => p.status === payFilter)
    const el       = container.querySelector('#payments-list')

    if (filtered.length === 0) {
      el.innerHTML = `<div class="empty-row" style="padding:48px;text-align:center">
        ${payFilter === 'pending' ? 'Немає платежів на перевірці' : 'Немає записів'}
      </div>`
      return
    }

    el.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr>
            <th>Користувач</th>
            <th>План</th>
            <th>Сума</th>
            <th>Валюта</th>
            <th>Крипто сума</th>
            <th>Дата</th>
            <th>ID платежу</th>
            ${payFilter === 'pending' ? '<th>Дії</th>' : '<th>Статус</th>'}
          </tr>
        </thead>
        <tbody>
          ${filtered.map(p => {
            const u    = allUsers.find(u => u.id === p.userId)
            const date = p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString('uk-UA') : '—'
            return `
              <tr>
                <td>
                  <div class="user-cell">
                    <div class="user-cell-avatar" style="width:30px;height:30px;font-size:12px">
                      ${(u?.name || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <div class="user-cell-name" style="font-size:13px">${u?.name || '—'}</div>
                      <div class="user-cell-email">${u?.email || p.userId.slice(0,8)}</div>
                    </div>
                  </div>
                </td>
                <td><span class="plan-pill" style="color:${PLAN_META[p.planId||'pro'].color};background:${PLAN_META[p.planId||'pro'].color}18">${(p.planId||'pro').toUpperCase()}</span></td>
                <td><strong>₴${p.amount}</strong></td>
                <td>${p.currency || '—'}</td>
                <td style="font-family:monospace;font-size:12px">${p.cryptoAmount || '—'}</td>
                <td>${date}</td>
                <td style="font-family:monospace;font-size:11px;color:var(--text-muted)">${p.paymentId?.slice(0,16) || p.id.slice(0,16)}...</td>
                <td>
                  ${payFilter === 'pending'
                    ? `<div class="action-btns">
                        <button class="action-btn btn-approve" data-pid="${p.id}" data-uid="${p.userId}" data-plan="${p.planId}" title="Підтвердити">✓ Підтвердити</button>
                        <button class="action-btn btn-reject"  data-pid="${p.id}" data-uid="${p.userId}" title="Відхилити">✗</button>
                       </div>`
                    : `<span class="status-chip status-${p.status}">${p.status === 'approved' ? '✓ Підтверджено' : '✗ Відхилено'}</span>`
                  }
                </td>
              </tr>
            `
          }).join('')}
        </tbody>
      </table>
    `

    // Approve payment
    el.querySelectorAll('.btn-approve').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Підтвердити платіж і активувати підписку?')) return
        btn.disabled = true
        btn.textContent = '...'
        try {
          const endDate = new Date()
          endDate.setMonth(endDate.getMonth() + 1)

          await Promise.all([
            // Оновлюємо план юзера
            updateDoc(doc(db, 'users', btn.dataset.uid), {
              plan:               btn.dataset.plan || 'pro',
              subscriptionEnd:    endDate.toISOString(),
              subscriptionStatus: 'active',
              updatedAt:          serverTimestamp(),
            }),
            // Оновлюємо статус платежу
            updateDoc(doc(db, 'users', btn.dataset.uid, 'pendingPayments', btn.dataset.pid), {
              status:     'approved',
              approvedAt: serverTimestamp(),
              approvedBy: user.uid,
            }),
          ])

          // Оновлюємо локально
          const p = allPayments.find(p => p.id === btn.dataset.pid)
          if (p) p.status = 'approved'
          const u = allUsers.find(u => u.id === btn.dataset.uid)
          if (u) { u.plan = btn.dataset.plan || 'pro'; u.subscriptionStatus = 'active' }

          renderPayments()
          renderOverview()
          showToast('Підписку активовано!')
        } catch (err) {
          console.error(err)
          btn.disabled = false
          btn.textContent = '✓ Підтвердити'
        }
      })
    })

    // Reject payment
    el.querySelectorAll('.btn-reject').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Відхилити цей платіж?')) return
        try {
          await updateDoc(doc(db, 'users', btn.dataset.uid, 'pendingPayments', btn.dataset.pid), {
            status:     'rejected',
            rejectedAt: serverTimestamp(),
            rejectedBy: user.uid,
          })
          const p = allPayments.find(p => p.id === btn.dataset.pid)
          if (p) p.status = 'rejected'
          renderPayments()
          renderOverview()
        } catch (err) {
          console.error(err)
        }
      })
    })
  }

  // ── Toast ─────────────────────────────────────────────────
  function showToast(msg) {
    const t = document.createElement('div')
    t.className = 'admin-toast'
    t.textContent = msg
    document.body.appendChild(t)
    setTimeout(() => t.classList.add('show'), 10)
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300) }, 2500)
  }

  // ── Helpers ───────────────────────────────────────────────
  function profLabel(id) {
    const map = { freelancer: '💻 Фрілансер', accountant: '📊 Бухгалтер', smm: '📱 SMM', beauty: '💅 Салон' }
    return map[id] || '—'
  }

  function nextMonth() {
    const d = new Date()
    d.setMonth(d.getMonth() + 1)
    return d.toISOString().split('T')[0]
  }
}

// ── Styles ────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('admin-styles')) return
  const style = document.createElement('style')
  style.id = 'admin-styles'
  style.textContent = `
    .admin-page    { padding: 32px 36px; max-width: 1300px; }
    .admin-header  { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px; }
    .admin-title   { font-family:var(--font-display); font-size:26px; font-weight:700; letter-spacing:-0.02em; margin-bottom:4px; }
    .admin-subtitle{ font-size:13px; color:var(--text-secondary); }
    .admin-badge   { font-size:12px; font-weight:600; padding:6px 14px; background:rgba(239,68,68,0.12); color:#F87171; border-radius:var(--radius-full); border:1px solid rgba(239,68,68,0.2); }

    /* Tabs */
    .admin-tabs    { display:flex; gap:4px; margin-bottom:24px; background:var(--bg-secondary); padding:4px; border-radius:var(--radius-md); border:1px solid var(--border); width:fit-content; }
    .admin-tab     { padding:8px 20px; border-radius:var(--radius-sm); font-size:13px; font-weight:600; color:var(--text-secondary); cursor:pointer; transition:all .2s; }
    .admin-tab:hover  { color:var(--text-primary); }
    .admin-tab.active { background:var(--bg-primary); color:var(--text-primary); box-shadow:0 1px 4px rgba(0,0,0,.3); }

    /* Overview */
    .overview-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:24px; }
    .stat-card-admin { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-lg); padding:20px; }
    .stat-card-admin.card-blue   { border-color:rgba(79,142,247,0.3); }
    .stat-card-admin.card-green  { border-color:rgba(52,211,153,0.3); }
    .stat-card-admin.card-orange { border-color:rgba(245,158,11,0.3); }
    .stat-admin-icon  { font-size:24px; margin-bottom:10px; }
    .stat-admin-value { font-family:var(--font-display); font-size:30px; font-weight:800; margin-bottom:4px; }
    .stat-admin-label { font-size:12px; color:var(--text-secondary); }

    .overview-bottom { display:grid; grid-template-columns:1.2fr 1fr; gap:16px; }
    .recent-card     { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-lg); padding:20px; }
    .recent-header   { margin-bottom:16px; }
    .recent-header h3{ font-family:var(--font-display); font-size:16px; font-weight:700; }
    .recent-row      { display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid var(--border); }
    .recent-row:last-child { border-bottom:none; }
    .recent-avatar   { width:36px; height:36px; border-radius:50%; background:linear-gradient(135deg,#667eea,#4F8EF7); color:#fff; font-size:14px; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .recent-info     { flex:1; min-width:0; }
    .recent-name     { font-size:14px; font-weight:600; }
    .recent-email    { font-size:12px; color:var(--text-muted); }

    .breakdown-row   { display:flex; align-items:center; gap:12px; padding:10px 0; }
    .breakdown-label { font-size:13px; font-weight:700; width:70px; flex-shrink:0; }
    .breakdown-bar-wrap { flex:1; height:8px; background:var(--bg-tertiary); border-radius:4px; overflow:hidden; }
    .breakdown-bar   { height:100%; border-radius:4px; transition:width .5s ease; }
    .breakdown-count { font-size:12px; color:var(--text-secondary); width:80px; text-align:right; flex-shrink:0; }

    /* Users toolbar */
    .users-toolbar   { display:flex; align-items:center; gap:12px; margin-bottom:16px; flex-wrap:wrap; }
    .users-filter-wrap { display:flex; align-items:center; gap:8px; }
    .users-count-label { font-size:13px; color:var(--text-secondary); }

    /* Payments toolbar */
    .payments-toolbar { margin-bottom:16px; }
    .pay-filter-tabs  { display:flex; gap:8px; }
    .filter-tab       { padding:7px 16px; border-radius:var(--radius-full); font-size:13px; font-weight:600; color:var(--text-secondary); background:var(--bg-secondary); border:1px solid var(--border); cursor:pointer; transition:all .2s; }
    .filter-tab:hover { border-color:var(--accent-blue); color:var(--text-primary); }
    .filter-tab.active{ background:var(--accent-blue); border-color:var(--accent-blue); color:#fff; }

    /* Table */
    .admin-table     { width:100%; border-collapse:collapse; background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-lg); overflow:hidden; }
    .admin-table th  { text-align:left; padding:12px 16px; font-size:11px; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em; background:var(--bg-tertiary); border-bottom:1px solid var(--border); }
    .admin-table td  { padding:12px 16px; border-bottom:1px solid var(--border); font-size:13px; vertical-align:middle; }
    .admin-table tr:last-child td { border-bottom:none; }
    .admin-table tr:hover td { background:rgba(255,255,255,0.02); }

    .user-cell       { display:flex; align-items:center; gap:10px; }
    .user-cell-avatar{ width:36px; height:36px; border-radius:50%; background:linear-gradient(135deg,#667eea,#764ba2); color:#fff; font-size:14px; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .user-cell-name  { font-weight:600; font-size:13px; }
    .user-cell-email { font-size:11px; color:var(--text-muted); }

    .plan-pill       { font-size:11px; font-weight:700; padding:3px 10px; border-radius:var(--radius-full); }
    .action-btns     { display:flex; gap:6px; align-items:center; }
    .action-btn      { font-size:12px; font-weight:600; padding:5px 10px; border-radius:6px; cursor:pointer; transition:all .2s; border:1px solid var(--border); background:var(--bg-tertiary); white-space:nowrap; }
    .action-btn:hover{ border-color:var(--accent-blue); color:var(--accent-blue); }
    .btn-approve:hover { border-color:#34D399; color:#34D399; background:rgba(52,211,153,0.08); }
    .btn-reject:hover  { border-color:#EF4444; color:#EF4444; background:rgba(239,68,68,0.08); }
    .admin-label     { font-size:12px; color:#F59E0B; font-weight:600; }

    .status-chip     { font-size:11px; font-weight:700; padding:3px 10px; border-radius:var(--radius-full); }
    .status-approved { background:rgba(52,211,153,0.12); color:#34D399; }
    .status-rejected { background:rgba(239,68,68,0.12); color:#EF4444; }

    .empty-row       { color:var(--text-muted); font-size:14px; }
    .loading-row     { display:flex; justify-content:center; padding:48px; }

    /* Skeleton */
    .skel          { background:var(--bg-tertiary); border-radius:var(--radius-md); animation:skel-pulse 1.4s ease-in-out infinite; }
    .skel-block    { display:block; border-radius:var(--radius-lg); }
    @keyframes skel-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

    /* Nav admin button */
    .nav-item-admin { margin-bottom:4px; }
    .nav-item-admin .nav-item-icon { color:#F87171; }

    /* Toast */
    .admin-toast { position:fixed; bottom:24px; right:24px; background:#1E293B; color:#fff; padding:12px 20px; border-radius:var(--radius-md); font-size:14px; font-weight:600; box-shadow:var(--shadow-xl); z-index:9999; opacity:0; transform:translateY(8px); transition:all .3s; border-left:3px solid #34D399; }
    .admin-toast.show { opacity:1; transform:translateY(0); }

    /* Modal reuse */
    .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.6); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; z-index:1000; padding:24px; }
    .modal         { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-xl); width:100%; box-shadow:var(--shadow-xl); animation:scaleIn .2s cubic-bezier(0.34,1.2,0.64,1); }
    .modal-header  { display:flex; align-items:center; justify-content:space-between; padding:24px 24px 0; }
    .modal-title   { font-family:var(--font-display); font-size:20px; font-weight:700; }
    .modal-close   { width:32px; height:32px; border-radius:8px; color:var(--text-muted); font-size:16px; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all .2s; }
    .modal-close:hover { background:var(--accent-red-dim); color:var(--accent-red); }
    .modal-body    { padding:20px 24px; display:flex; flex-direction:column; gap:14px; }
    .modal-footer  { display:flex; gap:10px; justify-content:flex-end; padding:0 24px 24px; }
    .field label   { display:block; font-size:12px; font-weight:600; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:6px; }

    /* Search bar */
    .search-bar        { display:flex; align-items:center; gap:10px; background:var(--bg-secondary); border:1.5px solid var(--border); border-radius:var(--radius-sm); padding:10px 14px; transition:border-color .2s; }
    .search-bar:focus-within { border-color:var(--accent-blue); }
    .search-icon       { font-size:15px; flex-shrink:0; }
    .search-input      { flex:1; background:none; font-size:14px; color:var(--text-primary); }
    .search-input::placeholder { color:var(--text-muted); }

    @keyframes scaleIn { from{opacity:0;transform:scale(0.95)} to{opacity:1;transform:scale(1)} }

    @media (max-width: 1100px) {
      .overview-grid { grid-template-columns:repeat(2,1fr); }
      .overview-bottom { grid-template-columns:1fr; }
    }
  `
  document.head.appendChild(style)
}
