// src/renderer/modules/invoices/index.js
import { db } from '../../services/firebase.js'
import { getCurrentUser, getUserProfile } from '../../services/auth.js'
import { checkPlanLimit } from '../../services/plan-guard.js'
import {
  collection, addDoc, getDocs, deleteDoc, doc, updateDoc,
  query, orderBy, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

export async function render(container) {
  const user = getCurrentUser()

  container.innerHTML = `
    <div class="invoices-page">
      <div class="page-header">
        <div>
          <h1 class="page-title">📄 Рахунки</h1>
          <p class="page-subtitle" id="invoices-count">Завантаження...</p>
        </div>
        <button class="btn btn-primary" id="add-invoice-btn">+ Новий рахунок</button>
      </div>

      <div class="invoice-stats">
        <div class="stat-card">
          <div class="stat-icon">💰</div>
          <div class="stat-body">
            <div class="stat-label">Всього</div>
            <div class="stat-value" id="total-value">₴0</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">✓</div>
          <div class="stat-body">
            <div class="stat-label">Оплачено</div>
            <div class="stat-value" id="paid-value">₴0</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">⏳</div>
          <div class="stat-body">
            <div class="stat-label">Не оплачено</div>
            <div class="stat-value" id="unpaid-value">₴0</div>
          </div>
        </div>
      </div>

      <div class="invoice-filter">
        <button class="filter-btn active" data-filter="all">Всі</button>
        <button class="filter-btn" data-filter="paid">Оплачені</button>
        <button class="filter-btn" data-filter="unpaid">Не оплачені</button>
      </div>

      <div id="invoices-list" class="invoices-list">
        <div class="clients-loading"><div class="spinner"></div></div>
      </div>
    </div>

    <div class="modal-overlay" id="modal" style="display:none">
      <div class="modal" style="max-width:640px">
        <div class="modal-header">
          <h2 class="modal-title" id="modal-title">Новий рахунок</h2>
          <button class="modal-close" id="modal-close">✕</button>
        </div>
        <form class="modal-form" id="invoice-form" novalidate>
          <div class="modal-body">
            <div class="form-row">
              <div class="field">
                <label>Номер рахунку *</label>
                <input id="f-number" type="text" class="input" placeholder="INV-001" />
                <span class="field-error" id="e-number"></span>
              </div>
              <div class="field">
                <label>Дата виставлення</label>
                <input id="f-date" type="date" class="input" />
              </div>
            </div>

            <div class="field">
              <label>Клієнт *</label>
              <input id="f-client" type="text" class="input" placeholder="Назва клієнта або компанії" />
              <span class="field-error" id="e-client"></span>
            </div>

            <div class="field">
              <label>Опис послуг/товарів *</label>
              <textarea id="f-description" class="input" rows="3" placeholder="Опис робіт або товарів..."></textarea>
              <span class="field-error" id="e-description"></span>
            </div>

            <div class="form-row">
              <div class="field">
                <label>Сума *</label>
                <div class="amount-input-wrapper">
                  <span class="currency">₴</span>
                  <input id="f-amount" type="number" class="input amount-input" placeholder="0.00" step="0.01" />
                </div>
                <span class="field-error" id="e-amount"></span>
              </div>
              <div class="field">
                <label>Статус</label>
                <select id="f-status" class="input">
                  <option value="unpaid">Не оплачено</option>
                  <option value="paid">Оплачено</option>
                </select>
              </div>
            </div>

            <div class="field">
              <label>Нотатка</label>
              <textarea id="f-note" class="input" rows="2" placeholder="Додаткова інформація..."></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="modal-cancel">Скасувати</button>
            <button type="submit" class="btn btn-primary" id="modal-submit">Зберегти</button>
          </div>
        </form>
      </div>
    </div>
  `

  injectStyles()

  let invoices = []
  let editingId = null
  let currentFilter = 'all'
  const profile = await getUserProfile(user.uid)   // з кешу — миттєво

  // Load
  async function loadInvoices() {
    try {
      const q = query(collection(db, 'users', user.uid, 'invoices'), orderBy('date', 'desc'))
      const snap = await getDocs(q)
      invoices = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      renderList(filterInvoices())
      updateStats()
    } catch (err) {
      console.error(err)
      container.querySelector('#invoices-list').innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <div class="empty-title">Помилка завантаження</div>
        </div>
      `
    }
  }

  // Render
  function renderList(list) {
    const el = container.querySelector('#invoices-list')
    if (list.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📄</div>
          <div class="empty-title">Рахунків ще немає</div>
          <div class="empty-desc">Створіть перший рахунок для клієнта</div>
        </div>
      `
      return
    }

    el.innerHTML = `
      <div class="invoices-grid">
        ${list.map(inv => `
          <div class="invoice-card ${inv.status}" data-id="${inv.id}">
            <div class="invoice-header">
              <div class="invoice-number">${inv.number}</div>
              <div class="invoice-status ${inv.status}">
                ${inv.status === 'paid' ? '✓ Оплачено' : '⏳ Не оплачено'}
              </div>
            </div>
            <div class="invoice-client">${inv.client}</div>
            <div class="invoice-desc">${inv.description}</div>
            <div class="invoice-footer">
              <div class="invoice-date">${formatDate(inv.date)}</div>
              <div class="invoice-amount">₴${inv.amount.toLocaleString('uk-UA', {minimumFractionDigits: 2})}</div>
            </div>
            <div class="invoice-actions">
              <button class="client-btn edit-btn" data-id="${inv.id}" title="Редагувати">✏️</button>
              <button class="client-btn delete-btn" data-id="${inv.id}" title="Видалити">🗑</button>
            </div>
          </div>
        `).join('')}
      </div>
    `

    el.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const invoice = invoices.find(i => i.id === btn.dataset.id)
        openModal(invoice)
      })
    })

    el.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        if (!confirm('Видалити рахунок?')) return
        await deleteDoc(doc(db, 'users', user.uid, 'invoices', btn.dataset.id))
        await loadInvoices()
      })
    })
  }

  // Stats
  function updateStats() {
    const total = invoices.reduce((sum, i) => sum + i.amount, 0)
    const paid = invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + i.amount, 0)
    const unpaid = total - paid

    container.querySelector('#total-value').textContent = `₴${total.toLocaleString('uk-UA', {minimumFractionDigits: 2})}`
    container.querySelector('#paid-value').textContent = `₴${paid.toLocaleString('uk-UA', {minimumFractionDigits: 2})}`
    container.querySelector('#unpaid-value').textContent = `₴${unpaid.toLocaleString('uk-UA', {minimumFractionDigits: 2})}`
    container.querySelector('#invoices-count').textContent = `${invoices.length} рахунків`
  }

  // Filter
  function filterInvoices() {
    if (currentFilter === 'all') return invoices
    return invoices.filter(i => i.status === currentFilter)
  }

  container.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      currentFilter = btn.dataset.filter
      renderList(filterInvoices())
    })
  })

  // Modal
  function openModal(invoice = null) {
    editingId = invoice?.id || null
    container.querySelector('#modal-title').textContent = invoice ? 'Редагувати рахунок' : 'Новий рахунок'
    container.querySelector('#f-number').value = invoice?.number || `INV-${Date.now().toString().slice(-6)}`
    container.querySelector('#f-date').value = invoice?.date || new Date().toISOString().split('T')[0]
    container.querySelector('#f-client').value = invoice?.client || ''
    container.querySelector('#f-description').value = invoice?.description || ''
    container.querySelector('#f-amount').value = invoice?.amount || ''
    container.querySelector('#f-status').value = invoice?.status || 'unpaid'
    container.querySelector('#f-note').value = invoice?.note || ''

    container.querySelectorAll('.field-error').forEach(el => el.textContent = '')
    container.querySelector('#modal').style.display = 'flex'
    setTimeout(() => container.querySelector('#f-number').focus(), 100)
  }

  function closeModal() {
    container.querySelector('#modal').style.display = 'none'
    editingId = null
  }

  container.querySelector('#add-invoice-btn').addEventListener('click', () => {
    const thisMonth = new Date().toISOString().slice(0, 7)
    const monthCount = invoices.filter(i => (i.date || '').startsWith(thisMonth)).length
    if (!checkPlanLimit(profile, 'invoices-monthly', monthCount)) return
    openModal()
  })
  container.querySelector('#modal-close').addEventListener('click', closeModal)
  container.querySelector('#modal-cancel').addEventListener('click', closeModal)
  container.querySelector('#modal').addEventListener('click', (e) => {
    if (e.target === container.querySelector('#modal')) closeModal()
  })

  // Save
  container.querySelector('#invoice-form').addEventListener('submit', async (e) => {
    e.preventDefault()

    const number = container.querySelector('#f-number').value.trim()
    const client = container.querySelector('#f-client').value.trim()
    const description = container.querySelector('#f-description').value.trim()
    const amount = parseFloat(container.querySelector('#f-amount').value)

    let hasError = false
    if (!number) { container.querySelector('#e-number').textContent = 'Введіть номер'; hasError = true }
    if (!client) { container.querySelector('#e-client').textContent = 'Введіть клієнта'; hasError = true }
    if (!description) { container.querySelector('#e-description').textContent = 'Введіть опис'; hasError = true }
    if (!amount || amount <= 0) { container.querySelector('#e-amount').textContent = 'Введіть суму'; hasError = true }
    if (hasError) return

    const btn = container.querySelector('#modal-submit')
    btn.disabled = true
    btn.innerHTML = '<div class="spinner"></div>'

    const data = {
      number,
      client,
      description,
      amount,
      status: container.querySelector('#f-status').value,
      date: container.querySelector('#f-date').value,
      note: container.querySelector('#f-note').value.trim() || null,
    }

    try {
      if (editingId) {
        await updateDoc(doc(db, 'users', user.uid, 'invoices', editingId), {
          ...data, updatedAt: serverTimestamp()
        })
      } else {
        await addDoc(collection(db, 'users', user.uid, 'invoices'), {
          ...data, createdAt: serverTimestamp()
        })
      }
      closeModal()
      await loadInvoices()
    } catch (err) {
      console.error(err)
    } finally {
      btn.disabled = false
      btn.innerHTML = 'Зберегти'
    }
  })

  await loadInvoices()

  function formatDate(dateStr) {
    const d = new Date(dateStr)
    return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric' })
  }
}

// Styles
function injectStyles() {
  if (document.getElementById('invoices-styles')) return
  const style = document.createElement('style')
  style.id = 'invoices-styles'
  style.textContent = `
    .invoices-page { padding: 32px 36px; max-width: 1100px; }
    
    /* Stats */
    .invoice-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin-bottom:24px; }
    .stat-card { display:flex; align-items:center; gap:14px; background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-md); padding:18px; }
    .stat-icon { width:44px; height:44px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:20px; background:var(--bg-tertiary); flex-shrink:0; }
    .stat-body { flex:1; }
    .stat-label { font-size:12px; color:var(--text-secondary); margin-bottom:4px; }
    .stat-value { font-family:var(--font-display); font-size:22px; font-weight:700; }
    
    /* Filter */
    .invoice-filter { display:flex; gap:8px; margin-bottom:20px; }
    .filter-btn { padding:8px 16px; border-radius:var(--radius-sm); font-size:13px; font-weight:500; color:var(--text-secondary); background:var(--bg-secondary); border:1px solid var(--border); transition:all .2s; }
    .filter-btn:hover { background:var(--bg-tertiary); }
    .filter-btn.active { background:var(--accent-blue); color:#fff; border-color:var(--accent-blue); }
    
    /* Grid */
    .invoices-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:14px; }

    /* Card */
    .invoice-card { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-lg); padding:18px; transition:all .2s; position:relative; }
    .invoice-card:hover { border-color:rgba(255,255,255,0.12); transform:translateY(-2px); box-shadow:var(--shadow-sm); }
    .invoice-card.paid { border-left:3px solid #34D399; }
    .invoice-card.unpaid { border-left:3px solid #FBBF24; }

    .invoice-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
    .invoice-number { font-family:var(--font-mono); font-size:13px; font-weight:600; color:var(--text-secondary); }
    .invoice-status { font-size:11px; font-weight:600; padding:4px 10px; border-radius:var(--radius-full); }
    .invoice-status.paid { background:rgba(52,211,153,0.12); color:#34D399; }
    .invoice-status.unpaid { background:rgba(251,191,36,0.12); color:#FBBF24; }

    .invoice-client { font-weight:600; font-size:15px; margin-bottom:6px; }
    .invoice-desc { font-size:12px; color:var(--text-secondary); margin-bottom:12px; line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }

    .invoice-footer { display:flex; justify-content:space-between; align-items:center; padding-top:12px; border-top:1px solid var(--border); }
    .invoice-date { font-size:11px; color:var(--text-muted); }
    .invoice-amount { font-family:var(--font-display); font-size:18px; font-weight:700; color:var(--accent-blue); }

    .invoice-actions { position:absolute; top:14px; right:14px; display:flex; gap:6px; opacity:0; transition:opacity .2s; }
    .invoice-card:hover .invoice-actions { opacity:1; }

    /* Form */
    .form-row { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .amount-input-wrapper { position:relative; }
    .currency { position:absolute; left:14px; top:50%; transform:translateY(-50%); font-size:16px; font-weight:600; color:var(--text-secondary); pointer-events:none; }
    .amount-input { padding-left:36px !important; font-family:var(--font-display); font-size:18px; font-weight:600; }
  `
  document.head.appendChild(style)
}