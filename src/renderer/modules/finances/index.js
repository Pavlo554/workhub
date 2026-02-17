// src/renderer/modules/finances/index.js
import { db } from '../../services/firebase.js'
import { getCurrentUser } from '../../services/auth.js'
import {
  collection, addDoc, getDocs, deleteDoc, doc, updateDoc,
  query, orderBy, where, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

export async function render(container) {
  container.innerHTML = `
    <div class="finances-page">

      <!-- Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">💰 Фінанси</h1>
          <p class="page-subtitle" id="balance-label">Завантаження...</p>
        </div>
        <button class="btn btn-primary" id="add-transaction-btn">
          + Нова транзакція
        </button>
      </div>

      <!-- Stats -->
      <div class="finance-stats">
        <div class="stat-card income">
          <div class="stat-icon">📈</div>
          <div class="stat-body">
            <div class="stat-label">Дохід</div>
            <div class="stat-value" id="income-value">₴0</div>
          </div>
        </div>
        <div class="stat-card expense">
          <div class="stat-icon">📉</div>
          <div class="stat-body">
            <div class="stat-label">Витрати</div>
            <div class="stat-value" id="expense-value">₴0</div>
          </div>
        </div>
        <div class="stat-card balance">
          <div class="stat-icon">💵</div>
          <div class="stat-body">
            <div class="stat-label">Баланс</div>
            <div class="stat-value" id="balance-value">₴0</div>
          </div>
        </div>
      </div>

      <!-- Filter -->
      <div class="finance-filter">
        <button class="filter-btn active" data-filter="all">Всі</button>
        <button class="filter-btn" data-filter="income">Дохід</button>
        <button class="filter-btn" data-filter="expense">Витрати</button>
      </div>

      <!-- List -->
      <div id="transactions-list" class="transactions-list">
        <div class="clients-loading"><div class="spinner"></div></div>
      </div>

    </div>

    <!-- Modal -->
    <div class="modal-overlay" id="modal" style="display:none">
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title" id="modal-title">Нова транзакція</h2>
          <button class="modal-close" id="modal-close">✕</button>
        </div>
        <form class="modal-form" id="transaction-form" novalidate>
          <div class="modal-body">

            <div class="transaction-type-tabs">
              <button type="button" class="type-tab active" data-type="income">
                📈 Дохід
              </button>
              <button type="button" class="type-tab" data-type="expense">
                📉 Витрата
              </button>
            </div>

            <div class="field">
              <label>Сума *</label>
              <div class="amount-input-wrapper">
                <span class="currency">₴</span>
                <input id="f-amount" type="number" class="input amount-input" placeholder="0.00" step="0.01" />
              </div>
              <span class="field-error" id="e-amount"></span>
            </div>

            <div class="field">
              <label>Категорія *</label>
              <select id="f-category" class="input">
                <option value="">Оберіть категорію</option>
              </select>
            </div>

            <div class="field">
              <label>Дата</label>
              <input id="f-date" type="date" class="input" />
            </div>

            <div class="field">
              <label>Опис</label>
              <textarea id="f-desc" class="input" rows="2" placeholder="Опис транзакції..."></textarea>
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

  // ── State ───────────────────────────────────────────────
  let transactions = []
  let editingId    = null
  let currentType  = 'income'
  let currentFilter = 'all'
  const user = getCurrentUser()

  const CATEGORIES = {
    income: ['Зарплата', 'Фріланс', 'Інвестиції', 'Продаж', 'Інше'],
    expense: ['Оренда', 'Комунальні', 'Їжа', 'Транспорт', 'Зв\'язок', 'Розваги', 'Інше'],
  }

  // ── Load ────────────────────────────────────────────────
  async function loadTransactions() {
    try {
      const q    = query(collection(db, 'users', user.uid, 'transactions'), orderBy('date', 'desc'))
      const snap = await getDocs(q)
      transactions = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      renderList(filterTransactions())
      updateStats()
    } catch (err) {
      console.error(err)
      container.querySelector('#transactions-list').innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <div class="empty-title">Помилка завантаження</div>
        </div>
      `
    }
  }

  // ── Render list ─────────────────────────────────────────
  function renderList(list) {
    const el = container.querySelector('#transactions-list')
    if (list.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">💸</div>
          <div class="empty-title">Транзакцій ще немає</div>
          <div class="empty-desc">Додайте першу транзакцію щоб відстежувати фінанси</div>
        </div>
      `
      return
    }

    el.innerHTML = `
      <div class="transactions-grid">
        ${list.map(t => `
          <div class="transaction-card ${t.type}" data-id="${t.id}">
            <div class="transaction-icon ${t.type}">
              ${t.type === 'income' ? '📈' : '📉'}
            </div>
            <div class="transaction-info">
              <div class="transaction-category">${t.category}</div>
              <div class="transaction-desc">${t.description || ''}</div>
              <div class="transaction-date">${formatDate(t.date)}</div>
            </div>
            <div class="transaction-amount ${t.type}">
              ${t.type === 'income' ? '+' : '-'}₴${t.amount.toLocaleString('uk-UA', {minimumFractionDigits: 2})}
            </div>
            <div class="transaction-actions">
              <button class="client-btn edit-btn" data-id="${t.id}">✏️</button>
              <button class="client-btn delete-btn" data-id="${t.id}">🗑</button>
            </div>
          </div>
        `).join('')}
      </div>
    `

    // Edit
    el.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const transaction = transactions.find(t => t.id === btn.dataset.id)
        openModal(transaction)
      })
    })

    // Delete
    el.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        if (!confirm('Видалити транзакцію?')) return
        await deleteDoc(doc(db, 'users', user.uid, 'transactions', btn.dataset.id))
        await loadTransactions()
      })
    })
  }

  // ── Stats ───────────────────────────────────────────────
  function updateStats() {
    const income  = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0)
    const expense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0)
    const balance = income - expense

    container.querySelector('#income-value').textContent  = `₴${income.toLocaleString('uk-UA', {minimumFractionDigits: 2})}`
    container.querySelector('#expense-value').textContent = `₴${expense.toLocaleString('uk-UA', {minimumFractionDigits: 2})}`
    container.querySelector('#balance-value').textContent = `₴${balance.toLocaleString('uk-UA', {minimumFractionDigits: 2})}`
    container.querySelector('#balance-label').textContent = `${transactions.length} транзакцій`
  }

  // ── Filter ──────────────────────────────────────────────
  function filterTransactions() {
    if (currentFilter === 'all') return transactions
    return transactions.filter(t => t.type === currentFilter)
  }

  container.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      currentFilter = btn.dataset.filter
      renderList(filterTransactions())
    })
  })

  // ── Modal ───────────────────────────────────────────────
  function openModal(transaction = null) {
    editingId = transaction?.id || null
    currentType = transaction?.type || 'income'

    container.querySelector('#modal-title').textContent = transaction ? 'Редагувати транзакцію' : 'Нова транзакція'
    container.querySelector('#f-amount').value   = transaction?.amount || ''
    container.querySelector('#f-date').value     = transaction?.date || new Date().toISOString().split('T')[0]
    container.querySelector('#f-desc').value     = transaction?.description || ''
    container.querySelector('#e-amount').textContent = ''

    // Type tabs
    container.querySelectorAll('.type-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.type === currentType)
    })

    updateCategoryOptions()
    container.querySelector('#f-category').value = transaction?.category || ''
    container.querySelector('#modal').style.display = 'flex'
    setTimeout(() => container.querySelector('#f-amount').focus(), 100)
  }

  function updateCategoryOptions() {
    const select = container.querySelector('#f-category')
    select.innerHTML = '<option value="">Оберіть категорію</option>' +
      CATEGORIES[currentType].map(c => `<option value="${c}">${c}</option>`).join('')
  }

  function closeModal() {
    container.querySelector('#modal').style.display = 'none'
    editingId = null
  }

  // Type tabs
  container.querySelectorAll('.type-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('.type-tab').forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      currentType = tab.dataset.type
      updateCategoryOptions()
    })
  })

  container.querySelector('#add-transaction-btn').addEventListener('click', () => openModal())
  container.querySelector('#modal-close').addEventListener('click', closeModal)
  container.querySelector('#modal-cancel').addEventListener('click', closeModal)
  container.querySelector('#modal').addEventListener('click', (e) => {
    if (e.target === container.querySelector('#modal')) closeModal()
  })

  // ── Save ────────────────────────────────────────────────
  container.querySelector('#transaction-form').addEventListener('submit', async (e) => {
    e.preventDefault()

    const amount = parseFloat(container.querySelector('#f-amount').value)
    const category = container.querySelector('#f-category').value

    if (!amount || amount <= 0) {
      container.querySelector('#e-amount').textContent = 'Введіть суму'
      return
    }
    if (!category) {
      alert('Оберіть категорію')
      return
    }

    const btn = container.querySelector('#modal-submit')
    btn.disabled = true
    btn.innerHTML = '<div class="spinner"></div>'

    const data = {
      type: currentType,
      amount,
      category,
      date: container.querySelector('#f-date').value,
      description: container.querySelector('#f-desc').value.trim() || null,
    }

    try {
      if (editingId) {
        await updateDoc(doc(db, 'users', user.uid, 'transactions', editingId), {
          ...data, updatedAt: serverTimestamp()
        })
      } else {
        await addDoc(collection(db, 'users', user.uid, 'transactions'), {
          ...data, createdAt: serverTimestamp()
        })
      }
      closeModal()
      await loadTransactions()
    } catch (err) {
      console.error(err)
    } finally {
      btn.disabled = false
      btn.innerHTML = 'Зберегти'
    }
  })

  // ── Init ────────────────────────────────────────────────
  await loadTransactions()

  function formatDate(dateStr) {
    const d = new Date(dateStr)
    return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric' })
  }
}

// ── Styles ──────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('finances-styles')) return
  const style = document.createElement('style')
  style.id = 'finances-styles'
  style.textContent = `
    .finances-page { padding: 32px 36px; max-width: 1100px; }

    .finance-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin-bottom:24px; }
    .stat-card { display:flex; align-items:center; gap:14px; background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-md); padding:18px; }
    .stat-icon { width:44px; height:44px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:20px; background:var(--bg-tertiary); flex-shrink:0; }
    .stat-card.income .stat-icon { background:rgba(52,211,153,0.12); }
    .stat-card.expense .stat-icon { background:rgba(248,113,113,0.12); }
    .stat-card.balance .stat-icon { background:rgba(79,142,247,0.12); }
    .stat-label { font-size:12px; color:var(--text-secondary); margin-bottom:4px; }
    .stat-value { font-family:var(--font-display); font-size:22px; font-weight:700; }

    .finance-filter { display:flex; gap:8px; margin-bottom:20px; }
    .filter-btn { padding:8px 16px; border-radius:var(--radius-sm); font-size:13px; font-weight:500; color:var(--text-secondary); background:var(--bg-secondary); border:1px solid var(--border); transition:all .2s; }
    .filter-btn:hover { background:var(--bg-tertiary); }
    .filter-btn.active { background:var(--accent-blue); color:#fff; border-color:var(--accent-blue); }

    .transactions-grid { display:flex; flex-direction:column; gap:10px; }
    .transaction-card { display:flex; align-items:center; gap:14px; background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-md); padding:16px 18px; transition:all .2s; }
    .transaction-card:hover { border-color:rgba(255,255,255,0.12); transform:translateY(-1px); }
    .transaction-icon { width:40px; height:40px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0; }
    .transaction-icon.income { background:rgba(52,211,153,0.12); }
    .transaction-icon.expense { background:rgba(248,113,113,0.12); }
    .transaction-info { flex:1; min-width:0; }
    .transaction-category { font-weight:600; font-size:14px; margin-bottom:2px; }
    .transaction-desc { font-size:12px; color:var(--text-secondary); margin-bottom:4px; }
    .transaction-date { font-size:11px; color:var(--text-muted); }
    .transaction-amount { font-family:var(--font-display); font-size:18px; font-weight:700; margin-right:10px; }
    .transaction-amount.income { color:#34D399; }
    .transaction-amount.expense { color:#F87171; }
    .transaction-actions { display:flex; gap:6px; opacity:0; transition:opacity .2s; }
    .transaction-card:hover .transaction-actions { opacity:1; }

    .transaction-type-tabs { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:16px; }
    .type-tab { padding:10px; border-radius:var(--radius-sm); font-size:14px; font-weight:600; border:1.5px solid var(--border); background:var(--bg-tertiary); transition:all .2s; }
    .type-tab.active { background:var(--accent-blue); color:#fff; border-color:var(--accent-blue); }
    .type-tab:hover:not(.active) { border-color:rgba(255,255,255,0.15); }

    .amount-input-wrapper { position:relative; }
    .currency { position:absolute; left:14px; top:50%; transform:translateY(-50%); font-size:16px; font-weight:600; color:var(--text-secondary); pointer-events:none; }
    .amount-input { padding-left:36px !important; font-family:var(--font-display); font-size:18px; font-weight:600; }
  `
  document.head.appendChild(style)
}