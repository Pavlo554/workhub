// src/renderer/modules/invoices/index.js
import { db } from '../../services/firebase.js'
import { getCurrentUser, getUserProfile, getActivePathSegments } from '../../services/auth.js'
import { checkPlanLimit } from '../../services/plan-guard.js'
import { generateInvoicePDF } from './invoice-pdf.js'
import {
  collection, addDoc, getDocs, deleteDoc, doc, updateDoc,
  query, orderBy, where, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

const PAY_METHODS = {
  card:   { icon: '💳', label: 'Картка' },
  crypto: { icon: '₿',  label: 'Крипта' },
  cash:   { icon: '💵', label: 'Наличка' },
}

const EXPENSE_CATS = [
  { id: 'salary',   icon: '👤', label: 'ЗП / Виплата' },
  { id: 'hosting',  icon: '🖥', label: 'Хостинг / Домен' },
  { id: 'software', icon: '💻', label: 'ПЗ / Підписки' },
  { id: 'ads',      icon: '📣', label: 'Реклама' },
  { id: 'office',   icon: '🏢', label: 'Офіс / Оренда' },
  { id: 'tax',      icon: '📋', label: 'Податки / ЄСВ' },
  { id: 'other',    icon: '📦', label: 'Інше' },
]

export async function render(container) {
  const user    = getCurrentUser()
  const base    = getActivePathSegments(user.uid)
  const profile = await getUserProfile(user.uid)

  injectStyles()

  container.innerHTML = `
    <div class="inv-layout">

      <!-- ══ LEFT ══ -->
      <div class="inv-left" id="inv-left">

        <div class="inv-page-header">
          <div>
            <h1 class="inv-page-title">📄 Рахунки та фінанси</h1>
            <p class="inv-page-sub" id="inv-subtitle">Завантаження...</p>
          </div>
          <div class="inv-header-btns">
            <button class="btn btn-secondary" id="add-expense-btn">+ Витрата</button>
            <button class="btn btn-primary"   id="add-invoice-btn">+ Рахунок</button>
          </div>
        </div>

        <!-- Summary cards -->
        <div class="inv-summary">
          <div class="summary-card income">
            <div class="sum-icon-wrap">📈</div>
            <div class="sum-val" id="s-income">₴0</div>
            <div class="sum-label">Дохід (оплачено)</div>
          </div>
          <div class="summary-card expense">
            <div class="sum-icon-wrap">📉</div>
            <div class="sum-val" id="s-expense">₴0</div>
            <div class="sum-label">Витрати</div>
          </div>
          <div class="summary-card profit">
            <div class="sum-icon-wrap">💰</div>
            <div class="sum-val" id="s-profit">₴0</div>
            <div class="sum-label">Чистий прибуток</div>
          </div>
          <div class="summary-card pending">
            <div class="sum-icon-wrap">⏳</div>
            <div class="sum-val" id="s-pending">₴0</div>
            <div class="sum-label">Очікується</div>
          </div>
        </div>

        <!-- Tabs -->
        <div class="inv-tabs">
          <button class="inv-tab active" data-tab="invoices">📄 Рахунки</button>
          <button class="inv-tab" data-tab="expenses">📉 Витрати</button>
        </div>

        <!-- Invoices panel -->
        <div id="panel-invoices">
          <div class="invoice-filter">
            <button class="filter-btn active" data-filter="all">Всі</button>
            <button class="filter-btn" data-filter="paid">✅ Оплачені</button>
            <button class="filter-btn" data-filter="unpaid">⏳ Очікуються</button>
          </div>
          <div id="invoices-list">
            <div class="inv-loading"><div class="spinner"></div></div>
          </div>
        </div>

        <!-- Expenses panel -->
        <div id="panel-expenses" style="display:none">
          <div id="expenses-list">
            <div class="inv-loading"><div class="spinner"></div></div>
          </div>
        </div>

      </div>

      <!-- ══ RIGHT: invoice detail ══ -->
      <div class="inv-right" id="inv-right" style="display:none">
        <div id="inv-detail"></div>
      </div>

    </div>

    <!-- ── Invoice Modal ── -->
    <div class="modal-overlay" id="inv-modal" style="display:none">
      <div class="modal" style="max-width:600px;max-height:90vh;overflow-y:auto">
        <div class="modal-header" style="position:sticky;top:0;background:var(--bg-secondary);z-index:1">
          <h2 class="modal-title" id="inv-modal-title">Новий рахунок</h2>
          <button class="modal-close" id="inv-modal-close">✕</button>
        </div>
        <form id="invoice-form" novalidate>
          <div class="modal-body">

            <div class="form-row">
              <div class="field">
                <label>Номер рахунку *</label>
                <input id="f-number" type="text" class="input" placeholder="INV-001" />
                <span class="field-error" id="e-number"></span>
              </div>
              <div class="field">
                <label>Дата</label>
                <input id="f-date" type="date" class="input" />
              </div>
            </div>

            <div class="field">
              <label>Клієнт *</label>
              <input id="f-client" type="text" class="input" placeholder="Назва клієнта або компанії" />
              <span class="field-error" id="e-client"></span>
            </div>

            <div class="field">
              <label>Опис послуг *</label>
              <textarea id="f-description" class="input" rows="3" placeholder="Що включає рахунок..."></textarea>
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

            <!-- Payment method -->
            <div class="field">
              <label>Спосіб оплати</label>
              <div class="pay-method-grid" id="pay-method-grid">
                ${Object.entries(PAY_METHODS).map(([key, m]) => `
                  <label class="pay-method-item">
                    <input type="radio" name="pay-method" value="${key}" ${key === 'card' ? 'checked' : ''} />
                    <div class="pay-method-box">
                      <span class="pay-method-icon">${m.icon}</span>
                      <span class="pay-method-label">${m.label}</span>
                    </div>
                  </label>
                `).join('')}
              </div>
            </div>

            <!-- Crypto details (shown when crypto selected) -->
            <div class="field" id="crypto-field" style="display:none">
              <label>Крипто адреса / TxID</label>
              <input id="f-crypto-addr" type="text" class="input" placeholder="0x... або TxID" />
            </div>

            <div class="field">
              <label>Нотатка</label>
              <textarea id="f-note" class="input" rows="2" placeholder="Додаткова інформація..."></textarea>
            </div>

          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="inv-modal-cancel">Скасувати</button>
            <button type="submit" class="btn btn-primary" id="inv-modal-submit">Зберегти</button>
          </div>
        </form>
      </div>
    </div>

    <!-- ── Expense Modal ── -->
    <div class="modal-overlay" id="exp-modal" style="display:none">
      <div class="modal" style="max-width:480px">
        <div class="modal-header">
          <h2 class="modal-title" id="exp-modal-title">Нова витрата</h2>
          <button class="modal-close" id="exp-modal-close">✕</button>
        </div>
        <form id="expense-form" novalidate>
          <div class="modal-body">

            <div class="field">
              <label>Назва *</label>
              <input id="ef-name" type="text" class="input" placeholder="Хостинг за березень, ЗП Іван..." />
              <span class="field-error" id="ee-name"></span>
            </div>

            <div class="field">
              <label>Категорія</label>
              <div class="exp-cat-grid" id="exp-cat-grid">
                ${EXPENSE_CATS.map((c, i) => `
                  <label class="exp-cat-item">
                    <input type="radio" name="exp-cat" value="${c.id}" ${i === 0 ? 'checked' : ''} />
                    <div class="exp-cat-box">
                      <span>${c.icon}</span>
                      <span>${c.label}</span>
                    </div>
                  </label>
                `).join('')}
              </div>
            </div>

            <div class="form-row">
              <div class="field">
                <label>Сума *</label>
                <div class="amount-input-wrapper">
                  <span class="currency">₴</span>
                  <input id="ef-amount" type="number" class="input amount-input" placeholder="0.00" step="0.01" />
                </div>
                <span class="field-error" id="ee-amount"></span>
              </div>
              <div class="field">
                <label>Дата</label>
                <input id="ef-date" type="date" class="input" />
              </div>
            </div>

            <div class="field">
              <label>Нотатка</label>
              <input id="ef-note" type="text" class="input" placeholder="Деталі..." />
            </div>

          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="exp-modal-cancel">Скасувати</button>
            <button type="submit" class="btn btn-primary" id="exp-modal-submit">Зберегти</button>
          </div>
        </form>
      </div>
    </div>
  `

  let invoices      = []
  let expenses      = []
  let editInvId     = null
  let editExpId     = null
  let invFilter     = 'all'
  let activeTab     = 'invoices'
  let selectedInvId = null

  // ── Tabs ──────────────────────────────────────────────────
  container.querySelector('.inv-tabs').addEventListener('click', e => {
    const tab = e.target.closest('.inv-tab')
    if (!tab) return
    container.querySelectorAll('.inv-tab').forEach(t => t.classList.remove('active'))
    tab.classList.add('active')
    activeTab = tab.dataset.tab
    container.querySelector('#panel-invoices').style.display = activeTab === 'invoices' ? 'block' : 'none'
    container.querySelector('#panel-expenses').style.display = activeTab === 'expenses' ? 'block' : 'none'
  })

  // ── Payment method toggle ──────────────────────────────────
  container.querySelector('#pay-method-grid').addEventListener('change', e => {
    container.querySelector('#crypto-field').style.display =
      e.target.value === 'crypto' ? 'block' : 'none'
  })

  // ── Load ──────────────────────────────────────────────────
  async function loadAll() {
    const [invSnap, expSnap] = await Promise.all([
      getDocs(query(collection(db, ...base, 'invoices'),  orderBy('date', 'desc'))).catch(() => null),
      getDocs(query(collection(db, ...base, 'expenses'),  orderBy('date', 'desc'))).catch(() => null),
    ])
    invoices = invSnap ? invSnap.docs.map(d => ({ id: d.id, ...d.data() })) : []
    expenses = expSnap ? expSnap.docs.map(d => ({ id: d.id, ...d.data() })) : []
    renderAll()
  }

  function renderAll() {
    renderInvoices()
    renderExpenses()
    updateSummary()
    updateSubtitle()
  }

  // ── Summary ───────────────────────────────────────────────
  function updateSummary() {
    const income  = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.amount || 0), 0)
    const pending = invoices.filter(i => i.status === 'unpaid').reduce((s, i) => s + (i.amount || 0), 0)
    const expense = expenses.reduce((s, e) => s + (e.amount || 0), 0)
    const profit  = income - expense

    const fmt = v => `₴${Math.abs(v).toLocaleString('uk-UA', { minimumFractionDigits: 0 })}`
    container.querySelector('#s-income').textContent  = fmt(income)
    container.querySelector('#s-expense').textContent = fmt(expense)
    container.querySelector('#s-pending').textContent = fmt(pending)

    const profEl = container.querySelector('#s-profit')
    profEl.textContent = (profit < 0 ? '−' : '') + fmt(profit)
    profEl.style.color = profit < 0 ? '#EF4444' : '#34D399'
  }

  function updateSubtitle() {
    const total = invoices.length
    const paid  = invoices.filter(i => i.status === 'paid').length
    container.querySelector('#inv-subtitle').textContent =
      `${total} рахунків · ${paid} оплачено · ${expenses.length} витрат`
  }

  // ── Invoices render ───────────────────────────────────────
  function renderInvoices() {
    const list = invFilter === 'all' ? invoices : invoices.filter(i => i.status === invFilter)
    const el   = container.querySelector('#invoices-list')

    if (list.length === 0) {
      el.innerHTML = `<div class="inv-empty"><div class="inv-empty-icon">📄</div><div class="inv-empty-title">Рахунків немає</div><div class="inv-empty-desc">Натисніть "+ Рахунок" щоб створити</div></div>`
      return
    }

    el.innerHTML = `<div class="invoices-grid">${list.map(inv => {
      const pm   = PAY_METHODS[inv.payMethod] || PAY_METHODS.card
      const paid = inv.status === 'paid'
      const sel  = inv.id === selectedInvId
      return `
        <div class="invoice-card ${inv.status} ${sel ? 'inv-selected' : ''}" data-id="${inv.id}">
          <div class="inv-card-top">
            <span class="inv-num-pill">${inv.number}</span>
            <span class="inv-st-badge ${inv.status}">${paid ? '✓ Оплачено' : '⏳ Очікується'}</span>
          </div>
          <div class="inv-card-client">${inv.client}</div>
          <div class="inv-card-desc">${inv.description}</div>
          <div class="inv-card-footer">
            <div class="inv-card-meta">
              <span class="inv-pm">${pm.icon} ${pm.label}</span>
              <span class="inv-date">📅 ${formatDate(inv.date)}</span>
            </div>
            <div class="inv-card-amount-row">
              <span class="inv-amount" style="color:${paid ? '#34D399' : '#FBBF24'}">₴${Number(inv.amount).toLocaleString('uk-UA')}</span>
              <div class="inv-card-btns">
                <button class="inv-icon-btn edit-inv" data-id="${inv.id}" title="Редагувати">✏️</button>
                <button class="inv-icon-btn del-inv"  data-id="${inv.id}" title="Видалити">🗑</button>
              </div>
            </div>
          </div>
        </div>`
    }).join('')}</div>`

    el.querySelectorAll('.invoice-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('.inv-icon-btn')) return
        openInvDetail(card.dataset.id)
      })
    })
    el.querySelectorAll('.edit-inv').forEach(btn =>
      btn.addEventListener('click', e => { e.stopPropagation(); openInvModal(invoices.find(i => i.id === btn.dataset.id)) })
    )
    el.querySelectorAll('.del-inv').forEach(btn =>
      btn.addEventListener('click', async e => {
        e.stopPropagation()
        if (!confirm('Видалити рахунок?')) return
        const inv = invoices.find(i => i.id === btn.dataset.id)
        if (selectedInvId === btn.dataset.id) closeInvDetail()
        await deleteDoc(doc(db, ...base, 'invoices', btn.dataset.id))
        if (inv?.status === 'paid') await removeInvoiceFinanceRecord(base, btn.dataset.id)
        await loadAll()
      })
    )
  }

  // ── Invoice detail panel ──────────────────────────────────
  function openInvDetail(id) {
    selectedInvId = id
    renderInvoices()
    const inv  = invoices.find(i => i.id === id)
    if (!inv) return
    const right = container.querySelector('#inv-right')
    const detEl = container.querySelector('#inv-detail')
    right.style.display = 'flex'

    const pm   = PAY_METHODS[inv.payMethod] || PAY_METHODS.card
    const paid = inv.status === 'paid'

    detEl.innerHTML = `
      <div class="invd-wrap">
        <div class="invd-hd">
          <div class="invd-stripe" style="background:${paid ? '#34D399' : '#FBBF24'}"></div>
          <button class="invd-close" id="invd-close">✕</button>
        </div>
        <div class="invd-body">

          <div class="invd-top">
            <span class="inv-num-pill">${inv.number}</span>
            <span class="inv-st-badge ${inv.status} invd-st">${paid ? '✓ Оплачено' : '⏳ Очікується'}</span>
          </div>

          <div class="invd-client">${inv.client}</div>
          <div class="invd-amount" style="color:${paid ? '#34D399' : '#FBBF24'}">
            ₴${Number(inv.amount).toLocaleString('uk-UA')}
          </div>

          <div class="invd-section">
            <div class="invd-label">Опис послуг</div>
            <div class="invd-desc-box">${inv.description}</div>
          </div>

          <div class="invd-section">
            <div class="invd-label">Деталі</div>
            <div class="invd-info-list">
              <div class="invd-row"><span class="invd-key">📅 Дата</span><span>${formatDate(inv.date)}</span></div>
              <div class="invd-row"><span class="invd-key">${pm.icon} Оплата</span><span>${pm.label}${inv.cryptoAddr ? ` · ${inv.cryptoAddr}` : ''}</span></div>
              ${inv.note ? `<div class="invd-row"><span class="invd-key">📝 Нотатка</span><span>${inv.note}</span></div>` : ''}
            </div>
          </div>

          <!-- Quick status toggle -->
          ${!paid ? `
          <button class="btn invd-pay-btn" id="invd-mark-paid">
            ✅ Позначити як оплачено
          </button>` : `
          <button class="btn invd-unpay-btn" id="invd-mark-unpaid">
            ↩ Скасувати оплату
          </button>`}

        </div>
        <div class="invd-footer">
          <button class="btn btn-secondary" id="invd-edit">✏️ Редагувати</button>
          <button class="btn btn-secondary" id="invd-pdf">📄 PDF</button>
          <button class="btn invd-del-btn" id="invd-delete">🗑 Видалити</button>
        </div>
      </div>
    `

    detEl.querySelector('#invd-close').addEventListener('click', closeInvDetail)
    detEl.querySelector('#invd-edit').addEventListener('click', () => openInvModal(inv))
    detEl.querySelector('#invd-pdf').addEventListener('click', () => generateInvoicePDF(inv, profile))
    detEl.querySelector('#invd-delete')?.addEventListener('click', async () => {
      if (!confirm('Видалити рахунок?')) return
      await deleteDoc(doc(db, ...base, 'invoices', inv.id))
      if (inv.status === 'paid') await removeInvoiceFinanceRecord(base, inv.id)
      closeInvDetail()
      await loadAll()
    })
    detEl.querySelector('#invd-mark-paid')?.addEventListener('click', async () => {
      await updateDoc(doc(db, ...base, 'invoices', inv.id), { status: 'paid', updatedAt: serverTimestamp() })
      await syncInvoiceToFinances(base, inv, 'paid', inv.status)
      await loadAll()
      openInvDetail(id)
    })
    detEl.querySelector('#invd-mark-unpaid')?.addEventListener('click', async () => {
      await updateDoc(doc(db, ...base, 'invoices', inv.id), { status: 'unpaid', updatedAt: serverTimestamp() })
      await syncInvoiceToFinances(base, inv, 'unpaid', inv.status)
      await loadAll()
      openInvDetail(id)
    })
  }

  function closeInvDetail() {
    selectedInvId = null
    container.querySelector('#inv-right').style.display = 'none'
    renderInvoices()
  }

  container.querySelector('.invoice-filter').addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn')
    if (!btn) return
    container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    invFilter = btn.dataset.filter
    renderInvoices()
  })

  // ── Expenses render ───────────────────────────────────────
  function renderExpenses() {
    const el = container.querySelector('#expenses-list')

    if (expenses.length === 0) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">📉</div><div class="empty-title">Витрат немає</div><div class="empty-desc">Натисніть "+ Витрата" щоб додати</div></div>`
      return
    }

    // Group by category for summary
    const byCat = {}
    expenses.forEach(e => {
      byCat[e.category] = (byCat[e.category] || 0) + (e.amount || 0)
    })

    el.innerHTML = `
      <div class="exp-breakdown">
        ${Object.entries(byCat).map(([catId, total]) => {
          const cat = EXPENSE_CATS.find(c => c.id === catId) || EXPENSE_CATS.at(-1)
          return `<div class="exp-cat-summary">
            <span>${cat.icon} ${cat.label}</span>
            <span class="exp-cat-total">₴${total.toLocaleString('uk-UA')}</span>
          </div>`
        }).join('')}
      </div>
      <div class="expenses-items">
        ${expenses.map(e => {
          const cat = EXPENSE_CATS.find(c => c.id === e.category) || EXPENSE_CATS.at(-1)
          return `
          <div class="expense-row">
            <div class="exp-cat-icon">${cat.icon}</div>
            <div class="exp-info">
              <div class="exp-name">${e.name}</div>
              <div class="exp-meta">${cat.label} · ${formatDate(e.date)}${e.note ? ' · ' + e.note : ''}</div>
            </div>
            <div class="exp-amount">−₴${Number(e.amount).toLocaleString('uk-UA')}</div>
            <div class="card-actions">
              <button class="card-btn edit-exp" data-id="${e.id}">✏️</button>
              <button class="card-btn del-exp"  data-id="${e.id}">🗑</button>
            </div>
          </div>`
        }).join('')}
      </div>
    `

    el.querySelectorAll('.edit-exp').forEach(btn =>
      btn.addEventListener('click', () => openExpModal(expenses.find(e => e.id === btn.dataset.id)))
    )
    el.querySelectorAll('.del-exp').forEach(btn =>
      btn.addEventListener('click', async () => {
        if (!confirm('Видалити витрату?')) return
        await deleteDoc(doc(db, ...base, 'expenses', btn.dataset.id))
        await loadAll()
      })
    )
  }

  // ── Invoice modal ─────────────────────────────────────────
  function openInvModal(inv = null) {
    editInvId = inv?.id || null
    container.querySelector('#inv-modal-title').textContent = inv ? 'Редагувати рахунок' : 'Новий рахунок'
    container.querySelector('#f-number').value      = inv?.number      || `INV-${String(invoices.length + 1).padStart(3, '0')}`
    container.querySelector('#f-date').value        = inv?.date        || today()
    container.querySelector('#f-client').value      = inv?.client      || ''
    container.querySelector('#f-description').value = inv?.description || ''
    container.querySelector('#f-amount').value      = inv?.amount      || ''
    container.querySelector('#f-status').value      = inv?.status      || 'unpaid'
    container.querySelector('#f-note').value        = inv?.note        || ''
    container.querySelector('#f-crypto-addr').value = inv?.cryptoAddr  || ''

    const pm = inv?.payMethod || 'card'
    container.querySelectorAll('input[name="pay-method"]').forEach(r => { r.checked = r.value === pm })
    container.querySelector('#crypto-field').style.display = pm === 'crypto' ? 'block' : 'none'

    container.querySelectorAll('#inv-modal .field-error').forEach(el => el.textContent = '')
    container.querySelector('#inv-modal').style.display = 'flex'
    setTimeout(() => container.querySelector('#f-number').focus(), 100)
  }

  function closeInvModal() {
    container.querySelector('#inv-modal').style.display = 'none'
    editInvId = null
  }

  container.querySelector('#add-invoice-btn').addEventListener('click', () => {
    const thisMonth  = today().slice(0, 7)
    const monthCount = invoices.filter(i => (i.date || '').startsWith(thisMonth)).length
    if (!checkPlanLimit(profile, 'invoices-monthly', monthCount)) return
    openInvModal()
  })
  container.querySelector('#inv-modal-close').addEventListener('click', closeInvModal)
  container.querySelector('#inv-modal-cancel').addEventListener('click', closeInvModal)
  container.querySelector('#inv-modal').addEventListener('click', e => { if (e.target === container.querySelector('#inv-modal')) closeInvModal() })

  container.querySelector('#invoice-form').addEventListener('submit', async e => {
    e.preventDefault()
    const number      = container.querySelector('#f-number').value.trim()
    const client      = container.querySelector('#f-client').value.trim()
    const description = container.querySelector('#f-description').value.trim()
    const amount      = parseFloat(container.querySelector('#f-amount').value)
    let hasErr = false
    if (!number)            { container.querySelector('#e-number').textContent      = 'Введіть номер'; hasErr = true }
    if (!client)            { container.querySelector('#e-client').textContent      = 'Введіть клієнта'; hasErr = true }
    if (!description)       { container.querySelector('#e-description').textContent = 'Введіть опис'; hasErr = true }
    if (!amount || amount <= 0) { container.querySelector('#e-amount').textContent  = 'Введіть суму'; hasErr = true }
    if (hasErr) return

    const btn = container.querySelector('#inv-modal-submit')
    btn.disabled = true; btn.innerHTML = '<div class="spinner"></div>'

    const payMethod = container.querySelector('input[name="pay-method"]:checked').value
    const data = {
      number, client, description, amount,
      status:     container.querySelector('#f-status').value,
      date:       container.querySelector('#f-date').value,
      note:       container.querySelector('#f-note').value.trim() || null,
      payMethod,
      cryptoAddr: payMethod === 'crypto' ? container.querySelector('#f-crypto-addr').value.trim() || null : null,
    }

    try {
      if (editInvId) {
        const prevInv = invoices.find(i => i.id === editInvId)
        await updateDoc(doc(db, ...base, 'invoices', editInvId), { ...data, updatedAt: serverTimestamp() })
        if (prevInv) {
          await syncInvoiceToFinances(base, { ...prevInv, ...data, id: editInvId }, data.status, prevInv.status)
        }
      } else {
        const ref = await addDoc(collection(db, ...base, 'invoices'), { ...data, createdAt: serverTimestamp() })
        if (data.status === 'paid') {
          await syncInvoiceToFinances(base, { ...data, id: ref.id }, 'paid', 'unpaid')
        }
      }
      closeInvModal()
      await loadAll()
    } catch (err) { console.error(err) }
    finally { btn.disabled = false; btn.innerHTML = 'Зберегти' }
  })

  // ── Expense modal ─────────────────────────────────────────
  function openExpModal(exp = null) {
    editExpId = exp?.id || null
    container.querySelector('#exp-modal-title').textContent = exp ? 'Редагувати витрату' : 'Нова витрата'
    container.querySelector('#ef-name').value   = exp?.name   || ''
    container.querySelector('#ef-amount').value = exp?.amount || ''
    container.querySelector('#ef-date').value   = exp?.date   || today()
    container.querySelector('#ef-note').value   = exp?.note   || ''

    const cat = exp?.category || 'salary'
    container.querySelectorAll('input[name="exp-cat"]').forEach(r => { r.checked = r.value === cat })

    container.querySelectorAll('#exp-modal .field-error').forEach(el => el.textContent = '')
    container.querySelector('#exp-modal').style.display = 'flex'
    setTimeout(() => container.querySelector('#ef-name').focus(), 100)
  }

  function closeExpModal() {
    container.querySelector('#exp-modal').style.display = 'none'
    editExpId = null
  }

  container.querySelector('#add-expense-btn').addEventListener('click', () => openExpModal())
  container.querySelector('#exp-modal-close').addEventListener('click', closeExpModal)
  container.querySelector('#exp-modal-cancel').addEventListener('click', closeExpModal)
  container.querySelector('#exp-modal').addEventListener('click', e => { if (e.target === container.querySelector('#exp-modal')) closeExpModal() })

  container.querySelector('#expense-form').addEventListener('submit', async e => {
    e.preventDefault()
    const name   = container.querySelector('#ef-name').value.trim()
    const amount = parseFloat(container.querySelector('#ef-amount').value)
    let hasErr = false
    if (!name)              { container.querySelector('#ee-name').textContent   = 'Введіть назву'; hasErr = true }
    if (!amount || amount <= 0) { container.querySelector('#ee-amount').textContent = 'Введіть суму'; hasErr = true }
    if (hasErr) return

    const btn = container.querySelector('#exp-modal-submit')
    btn.disabled = true; btn.innerHTML = '<div class="spinner"></div>'

    const data = {
      name, amount,
      category: container.querySelector('input[name="exp-cat"]:checked').value,
      date:     container.querySelector('#ef-date').value || today(),
      note:     container.querySelector('#ef-note').value.trim() || null,
    }

    try {
      if (editExpId) {
        await updateDoc(doc(db, ...base, 'expenses', editExpId), { ...data, updatedAt: serverTimestamp() })
      } else {
        await addDoc(collection(db, ...base, 'expenses'), { ...data, createdAt: serverTimestamp() })
      }
      closeExpModal()
      await loadAll()
    } catch (err) { console.error(err) }
    finally { btn.disabled = false; btn.innerHTML = 'Зберегти' }
  })

  await loadAll()

  function today() { return new Date().toISOString().split('T')[0] }
  function formatDate(d) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric' })
  }
}

// ── Finance sync helpers ───────────────────────────────────────────────────

async function syncInvoiceToFinances(base, inv, newStatus, oldStatus) {
  if (newStatus === oldStatus) return
  if (newStatus === 'paid') {
    // Avoid duplicate: check if finance record already exists
    try {
      const snap = await getDocs(query(
        collection(db, ...base, 'transactions'),
        where('invoiceId', '==', inv.id)
      ))
      if (!snap.empty) return
      await addDoc(collection(db, ...base, 'transactions'), {
        type:        'income',
        category:    'project',
        amount:      Number(inv.amount),
        date:        inv.date || new Date().toISOString().slice(0, 10),
        description: `${inv.client} — ${inv.description}`.slice(0, 200),
        source:      'invoice',
        invoiceId:   inv.id,
        createdAt:   serverTimestamp(),
        updatedAt:   serverTimestamp(),
      })
    } catch (err) { console.error('syncInvoiceToFinances create:', err) }
  } else if (oldStatus === 'paid') {
    await removeInvoiceFinanceRecord(base, inv.id)
  }
}

async function removeInvoiceFinanceRecord(base, invoiceId) {
  try {
    const snap = await getDocs(query(
      collection(db, ...base, 'transactions'),
      where('invoiceId', '==', invoiceId)
    ))
    for (const d of snap.docs) {
      await deleteDoc(doc(db, ...base, 'transactions', d.id))
    }
  } catch (err) { console.error('removeInvoiceFinanceRecord:', err) }
}

// ── Styles ─────────────────────────────────────────────────────────────────

function injectStyles() {
  if (document.getElementById('invoices-styles')) return
  const s = document.createElement('style')
  s.id = 'invoices-styles'
  s.textContent = `
    /* ── Layout ── */
    .inv-layout { display:flex; height:100%; overflow:hidden; }
    .inv-left   { flex:1; min-width:0; padding:32px 28px; overflow-y:auto; }
    .inv-right  { width:360px; flex-shrink:0; border-left:1px solid var(--border); overflow-y:auto; background:var(--bg-primary); display:flex; flex-direction:column; }

    /* Header */
    .inv-page-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:24px; gap:16px; flex-wrap:wrap; }
    .inv-page-title  { font-family:var(--font-display); font-size:26px; font-weight:700; letter-spacing:-0.02em; margin-bottom:4px; }
    .inv-page-sub    { font-size:13px; color:var(--text-secondary); }
    .inv-header-btns { display:flex; gap:10px; flex-shrink:0; }

    /* Summary */
    .inv-summary { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:24px; }
    .summary-card {
      background:var(--bg-secondary); border:1px solid var(--border);
      border-radius:var(--radius-xl); padding:18px 20px;
      transition:transform .2s, box-shadow .2s;
    }
    .summary-card:hover { transform:translateY(-2px); box-shadow:0 6px 20px rgba(0,0,0,.2); }
    .summary-card.income  { border-top:3px solid #34D399; }
    .summary-card.expense { border-top:3px solid #EF4444; }
    .summary-card.profit  { border-top:3px solid #4F8EF7; }
    .summary-card.pending { border-top:3px solid #FBBF24; }
    .sum-icon-wrap { font-size:22px; margin-bottom:10px; }
    .sum-val   { font-family:var(--font-display); font-size:26px; font-weight:800; letter-spacing:-0.02em; margin-bottom:4px; }
    .sum-label { font-size:11px; color:var(--text-muted); font-weight:500; text-transform:uppercase; letter-spacing:.04em; }

    /* Tabs */
    .inv-tabs { display:flex; gap:6px; margin-bottom:16px; background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-lg); padding:3px; width:fit-content; }
    .inv-tab  { padding:7px 20px; border-radius:calc(var(--radius-lg) - 2px); font-size:13px; font-weight:600; color:var(--text-muted); cursor:pointer; transition:all .2s; background:transparent; }
    .inv-tab.active { background:var(--bg-primary); color:var(--text-primary); box-shadow:0 1px 4px rgba(0,0,0,.3); }

    /* Filter */
    .invoice-filter { display:flex; gap:6px; margin-bottom:14px; }
    .filter-btn { padding:6px 14px; border-radius:var(--radius-full); font-size:13px; font-weight:500; color:var(--text-secondary); background:transparent; border:1.5px solid var(--border); cursor:pointer; transition:all .2s; }
    .filter-btn:hover { border-color:rgba(255,255,255,.2); color:var(--text-primary); }
    .filter-btn.active { background:var(--accent-blue); color:#fff; border-color:var(--accent-blue); }

    /* Loading */
    .inv-loading { display:flex; justify-content:center; padding:60px; }

    /* Invoice grid */
    .invoices-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(260px,1fr)); gap:14px; }

    .invoice-card {
      background:var(--bg-secondary); border:1.5px solid var(--border);
      border-radius:var(--radius-xl); overflow:hidden;
      display:flex; flex-direction:column; cursor:pointer;
      transition:transform .2s, box-shadow .2s, border-color .2s;
    }
    .invoice-card:hover  { transform:translateY(-3px); box-shadow:0 10px 30px rgba(0,0,0,.3); }
    .invoice-card.paid   { border-top:3px solid #34D399; }
    .invoice-card.unpaid { border-top:3px solid #FBBF24; }
    .invoice-card.inv-selected { border-color:var(--accent-blue); box-shadow:0 0 0 2px rgba(79,142,247,.25); }

    .inv-card-top    { display:flex; justify-content:space-between; align-items:center; padding:14px 16px 0; }
    .inv-num-pill    { font-family:var(--font-mono); font-size:11px; font-weight:700; color:var(--text-muted); background:var(--bg-tertiary); border:1px solid var(--border); padding:2px 9px; border-radius:var(--radius-full); }
    .inv-st-badge    { font-size:11px; font-weight:700; padding:3px 10px; border-radius:var(--radius-full); }
    .inv-st-badge.paid   { background:rgba(52,211,153,.12); color:#34D399; }
    .inv-st-badge.unpaid { background:rgba(251,191,36,.12);  color:#FBBF24; }

    .inv-card-client { font-weight:700; font-size:16px; padding:10px 16px 4px; line-height:1.3; }
    .inv-card-desc   { font-size:12px; color:var(--text-secondary); padding:0 16px 12px; line-height:1.5; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; flex:1; }

    .inv-card-footer { padding:12px 16px; border-top:1px solid rgba(255,255,255,.06); background:rgba(0,0,0,.1); }
    .inv-card-meta   { display:flex; gap:10px; align-items:center; margin-bottom:8px; }
    .inv-pm          { font-size:11px; font-weight:600; color:var(--text-secondary); }
    .inv-date        { font-size:11px; color:var(--text-muted); }
    .inv-card-amount-row { display:flex; justify-content:space-between; align-items:center; }
    .inv-amount      { font-family:var(--font-display); font-size:20px; font-weight:800; }
    .inv-card-btns   { display:flex; gap:4px; opacity:0; transition:opacity .2s; }
    .invoice-card:hover .inv-card-btns { opacity:1; }
    .inv-icon-btn    { width:28px; height:28px; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:13px; cursor:pointer; transition:background .2s; }
    .inv-icon-btn:hover { background:rgba(255,255,255,.1); }

    /* Empty */
    .inv-empty       { text-align:center; padding:60px 24px; grid-column:1/-1; }
    .inv-empty-icon  { font-size:52px; margin-bottom:14px; }
    .inv-empty-title { font-family:var(--font-display); font-size:18px; font-weight:600; margin-bottom:6px; }
    .inv-empty-desc  { font-size:13px; color:var(--text-muted); }

    /* ── Detail panel ── */
    .invd-wrap   { display:flex; flex-direction:column; height:100%; }
    .invd-hd     { position:relative; display:flex; justify-content:flex-end; padding:14px 16px 0; flex-shrink:0; }
    .invd-stripe { position:absolute; top:0; left:0; right:0; height:3px; }
    .invd-close  { width:30px; height:30px; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:14px; color:var(--text-muted); transition:all .2s; }
    .invd-close:hover { background:var(--accent-red-dim); color:var(--accent-red); }

    .invd-body   { padding:16px 20px; display:flex; flex-direction:column; gap:20px; flex:1; overflow-y:auto; }

    .invd-top    { display:flex; align-items:center; justify-content:space-between; }
    .invd-st     { font-size:13px !important; padding:5px 14px !important; }
    .invd-client { font-family:var(--font-display); font-size:22px; font-weight:800; line-height:1.3; }
    .invd-amount { font-family:var(--font-display); font-size:36px; font-weight:900; letter-spacing:-0.02em; }

    .invd-section { display:flex; flex-direction:column; gap:8px; }
    .invd-label   { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--text-muted); }
    .invd-desc-box { background:var(--bg-secondary); border-radius:var(--radius-lg); padding:12px 14px; font-size:13px; color:var(--text-secondary); line-height:1.6; }
    .invd-info-list { display:flex; flex-direction:column; gap:8px; }
    .invd-row    { display:flex; justify-content:space-between; font-size:13px; gap:16px; }
    .invd-key    { color:var(--text-muted); flex-shrink:0; }

    .invd-pay-btn   { background:rgba(52,211,153,.12); color:#34D399; border:1px solid rgba(52,211,153,.3); font-weight:600; }
    .invd-pay-btn:hover { background:rgba(52,211,153,.2); }
    .invd-unpay-btn { background:rgba(107,114,128,.12); color:var(--text-secondary); border:1px solid var(--border); font-weight:600; }
    .invd-unpay-btn:hover { background:rgba(107,114,128,.2); }

    .invd-footer { padding:16px 20px; display:flex; gap:8px; border-top:1px solid var(--border); flex-shrink:0; }
    .invd-del-btn { background:rgba(239,68,68,.1); color:#EF4444; border:1px solid rgba(239,68,68,.25); font-weight:600; border-radius:var(--radius-md); padding:8px 16px; cursor:pointer; font-size:13px; transition:all .2s; }
    .invd-del-btn:hover { background:rgba(239,68,68,.2); }

    /* Expenses */
    .exp-breakdown { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px; }
    .exp-cat-summary { display:flex; align-items:center; gap:8px; background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-full); padding:6px 14px; font-size:12px; font-weight:600; }
    .exp-cat-total { color:#EF4444; }
    .expenses-items { display:flex; flex-direction:column; gap:8px; }
    .expense-row { display:flex; align-items:center; gap:14px; background:var(--bg-secondary); border:1px solid var(--border); border-left:3px solid #EF4444; border-radius:var(--radius-lg); padding:14px 18px; transition:border-color .2s; }
    .expense-row:hover .inv-card-btns { opacity:1; }
    .exp-cat-icon { font-size:22px; width:32px; text-align:center; flex-shrink:0; }
    .exp-info { flex:1; }
    .exp-name { font-size:14px; font-weight:600; margin-bottom:2px; }
    .exp-meta { font-size:12px; color:var(--text-secondary); }
    .exp-amount { font-family:var(--font-display); font-size:16px; font-weight:700; color:#EF4444; white-space:nowrap; }
    .card-actions { display:flex; gap:5px; opacity:0; transition:opacity .2s; }
    .expense-row:hover .card-actions { opacity:1; }
    .card-btn { width:28px; height:28px; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:13px; background:var(--bg-tertiary); cursor:pointer; transition:background .2s; }

    /* Pay method picker */
    .pay-method-grid { display:flex; gap:10px; }
    .pay-method-item input { display:none; }
    .pay-method-box { display:flex; flex-direction:column; align-items:center; gap:4px; padding:12px 18px; background:var(--bg-tertiary); border:2px solid var(--border); border-radius:var(--radius-md); cursor:pointer; transition:all .2s; min-width:90px; }
    .pay-method-icon  { font-size:22px; }
    .pay-method-label { font-size:12px; font-weight:600; color:var(--text-secondary); }
    .pay-method-item input:checked + .pay-method-box { border-color:var(--accent-blue); background:var(--accent-blue-dim); }
    .pay-method-item input:checked + .pay-method-box .pay-method-label { color:var(--accent-blue); }

    /* Expense cat picker */
    .exp-cat-grid { display:flex; flex-wrap:wrap; gap:8px; }
    .exp-cat-item input { display:none; }
    .exp-cat-box { display:flex; align-items:center; gap:6px; padding:7px 12px; background:var(--bg-tertiary); border:1.5px solid var(--border); border-radius:var(--radius-full); cursor:pointer; font-size:12px; font-weight:500; color:var(--text-secondary); transition:all .2s; }
    .exp-cat-item input:checked + .exp-cat-box { border-color:#EF4444; background:rgba(239,68,68,.1); color:#EF4444; }

    /* Form */
    .form-row { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .amount-input-wrapper { position:relative; }
    .currency { position:absolute; left:14px; top:50%; transform:translateY(-50%); font-size:16px; font-weight:600; color:var(--text-secondary); pointer-events:none; }
    .amount-input { padding-left:36px !important; font-family:var(--font-display); font-size:18px; font-weight:600; }
    .field label { display:block; font-size:12px; font-weight:600; color:var(--text-secondary); text-transform:uppercase; letter-spacing:.05em; margin-bottom:6px; }
    .field-error  { font-size:12px; color:#EF4444; margin-top:4px; display:block; }
  `
  document.head.appendChild(s)
}
