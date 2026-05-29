// src/renderer/modules/finances/index.js
import { db } from '../../services/firebase.js'
import { getCurrentUser, getActivePathSegments } from '../../services/auth.js'
import { icon } from '../../utils/icons.js'
import {
  collection, addDoc, getDocs, deleteDoc,
  doc, updateDoc, query, orderBy, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

// ── Category definitions ───────────────────────────────────────────────────
const INCOME_CATS = [
  { id: 'freelance',   label: 'Фріланс'    },
  { id: 'salary',      label: 'Зарплата'   },
  { id: 'project',     label: 'Проект'     },
  { id: 'investment',  label: 'Інвестиції' },
  { id: 'sale',        label: 'Продаж'     },
  { id: 'other',       label: 'Інше'       },
]

const EXPENSE_CATS = [
  { id: 'rent',        label: 'Оренда'     },
  { id: 'utilities',   label: 'Комунальні' },
  { id: 'food',        label: 'Їжа'        },
  { id: 'transport',   label: 'Транспорт'  },
  { id: 'comms',       label: 'Зв\'язок'   },
  { id: 'marketing',   label: 'Маркетинг'  },
  { id: 'equipment',   label: 'Обладнання' },
  { id: 'other',       label: 'Інше'       },
]

function getCatMeta(type, catId) {
  const list = type === 'income' ? INCOME_CATS : EXPENSE_CATS
  return list.find(c => c.id === catId) || { label: catId || 'Інше' }
}

function fmtAmt(v) {
  return '₴' + Math.abs(v || 0).toLocaleString('uk-UA', { minimumFractionDigits: 0 })
}

function fmtDate(val) {
  if (!val) return '—'
  const d = new Date(val)
  if (isNaN(d)) return val
  return d.toLocaleDateString('uk-UA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

// ── Styles ─────────────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('fn-styles')) return
  const style = document.createElement('style')
  style.id = 'fn-styles'
  style.textContent = `
    /* ── Layout ── */
    .fn-layout {
      display: flex;
      height: 100%;
      overflow: hidden;
      background: var(--bg-primary, #0F1117);
      font-family: inherit;
    }

    /* ── Left panel ── */
    .fn-left {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border-right: 1px solid var(--border, rgba(255,255,255,.08));
    }

    .fn-left-scroll {
      flex: 1;
      overflow-y: auto;
      padding: 0 20px 24px;
    }
    .fn-left-scroll::-webkit-scrollbar { width: 4px; }
    .fn-left-scroll::-webkit-scrollbar-track { background: transparent; }
    .fn-left-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,.12); border-radius: 2px; }

    /* ── Header ── */
    .fn-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding: 24px 20px 16px;
      flex-shrink: 0;
    }
    .fn-title {
      font-size: 22px;
      font-weight: 700;
      color: var(--text-primary, #F1F5F9);
      margin: 0 0 4px;
    }
    .fn-sub {
      font-size: 13px;
      color: var(--text-secondary, #94A3B8);
      margin: 0;
    }

    /* ── Stat cards ── */
    .fn-stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }
    .fn-stat {
      background: var(--bg-secondary, #1A1D2E);
      border: 1px solid var(--border, rgba(255,255,255,.08));
      border-radius: 12px;
      padding: 14px 16px;
      border-left: 4px solid transparent;
      transition: transform .15s, box-shadow .15s;
    }
    .fn-stat:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 16px rgba(0,0,0,.25);
    }
    .fn-stat-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: .06em;
      color: var(--text-secondary, #94A3B8);
      margin-bottom: 6px;
    }
    .fn-stat-val {
      font-size: 20px;
      font-weight: 700;
      color: var(--text-primary, #F1F5F9);
    }
    .fn-stat.fn-stat-income  { border-left-color: #34D399; }
    .fn-stat.fn-stat-expense { border-left-color: #EF4444; }
    .fn-stat.fn-stat-balance { border-left-color: #4F8EF7; }
    .fn-stat-income  .fn-stat-label { color: #34D399; }
    .fn-stat-expense .fn-stat-label { color: #EF4444; }
    .fn-stat-balance .fn-stat-label { color: #4F8EF7; }

    /* ── Filter pills ── */
    .fn-filters {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .fn-pill {
      padding: 6px 14px;
      border-radius: 20px;
      border: 1px solid var(--border, rgba(255,255,255,.1));
      background: transparent;
      color: var(--text-secondary, #94A3B8);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all .15s;
    }
    .fn-pill:hover {
      border-color: rgba(255,255,255,.25);
      color: var(--text-primary, #F1F5F9);
    }
    .fn-pill.active {
      background: var(--accent, #4F8EF7);
      border-color: var(--accent, #4F8EF7);
      color: #fff;
    }

    /* ── Transaction list ── */
    .fn-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .fn-card {
      background: var(--bg-secondary, #1A1D2E);
      border: 1px solid var(--border, rgba(255,255,255,.08));
      border-radius: 12px;
      padding: 14px 16px;
      cursor: pointer;
      transition: border-color .15s, box-shadow .15s, transform .1s;
      display: flex;
      align-items: center;
      gap: 14px;
      position: relative;
      overflow: hidden;
    }
    .fn-card::before {
      content: '';
      position: absolute;
      left: 0; top: 0; bottom: 0;
      width: 4px;
      border-radius: 12px 0 0 12px;
    }
    .fn-card.fn-card-income::before  { background: #34D399; }
    .fn-card.fn-card-expense::before { background: #EF4444; }

    .fn-card:hover {
      border-color: rgba(255,255,255,.2);
      box-shadow: 0 2px 12px rgba(0,0,0,.2);
    }
    .fn-card.fn-card-selected {
      border-color: var(--accent, #4F8EF7);
      box-shadow: 0 0 0 1px var(--accent, #4F8EF7), 0 4px 16px rgba(79,142,247,.15);
    }

    .fn-card-icon {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-left: 6px;
    }
    .fn-card-income  .fn-card-icon { background: rgba(52,211,153,.15); }
    .fn-card-expense .fn-card-icon { background: rgba(239,68,68,.15);  }

    .fn-card-body {
      flex: 1;
      min-width: 0;
    }
    .fn-card-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 3px;
    }
    .fn-card-cat {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary, #F1F5F9);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .fn-card-amount {
      font-size: 15px;
      font-weight: 700;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .fn-card-amount.income  { color: #34D399; }
    .fn-card-amount.expense { color: #EF4444; }

    .fn-card-desc {
      font-size: 12px;
      color: var(--text-secondary, #94A3B8);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 4px;
    }
    .fn-card-date {
      font-size: 11px;
      color: var(--text-muted, #64748B);
    }

    /* ── Empty / Loading ── */
    .fn-empty {
      text-align: center;
      padding: 60px 20px;
    }
    .fn-empty-icon { display:flex; align-items:center; justify-content:center; margin-bottom:12px; color:var(--text-muted); }
    .fn-empty-title { font-size: 16px; font-weight: 600; color: var(--text-secondary, #94A3B8); margin-bottom: 6px; }
    .fn-empty-desc  { font-size: 13px; color: var(--text-muted, #64748B); }

    .fn-loading {
      display: flex;
      justify-content: center;
      padding: 48px;
    }

    /* ── Right detail panel ── */
    .fn-right {
      width: 360px;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--bg-secondary, #1A1D2E);
    }
    .fn-detail {
      flex: 1;
      overflow-y: auto;
    }
    .fn-detail::-webkit-scrollbar { width: 4px; }
    .fn-detail::-webkit-scrollbar-track { background: transparent; }
    .fn-detail::-webkit-scrollbar-thumb { background: rgba(255,255,255,.12); border-radius: 2px; }

    /* ── Detail stripe ── */
    .fn-detail-stripe {
      height: 6px;
      flex-shrink: 0;
    }
    .fn-detail-stripe.income  { background: linear-gradient(90deg, #34D399, #059669); }
    .fn-detail-stripe.expense { background: linear-gradient(90deg, #EF4444, #DC2626); }

    .fn-detail-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      padding: 20px 20px 0;
      gap: 12px;
    }
    .fn-detail-close {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      border: 1px solid var(--border, rgba(255,255,255,.1));
      background: transparent;
      color: var(--text-secondary, #94A3B8);
      font-size: 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all .15s;
      flex-shrink: 0;
    }
    .fn-detail-close:hover {
      background: rgba(239,68,68,.15);
      border-color: #EF4444;
      color: #EF4444;
    }

    .fn-detail-type-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .fn-detail-type-badge.income  { background: rgba(52,211,153,.15);  color: #34D399; }
    .fn-detail-type-badge.expense { background: rgba(239,68,68,.15);   color: #EF4444; }

    .fn-detail-amount {
      font-size: 36px;
      font-weight: 800;
      line-height: 1;
      margin-bottom: 4px;
    }
    .fn-detail-amount.income  { color: #34D399; }
    .fn-detail-amount.expense { color: #EF4444; }

    .fn-detail-body {
      padding: 16px 20px;
    }

    .fn-detail-section {
      background: var(--bg-primary, #0F1117);
      border: 1px solid var(--border, rgba(255,255,255,.07));
      border-radius: 12px;
      padding: 14px 16px;
      margin-bottom: 12px;
    }
    .fn-detail-row {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 8px 0;
      border-bottom: 1px solid var(--border, rgba(255,255,255,.05));
    }
    .fn-detail-row:last-child { border-bottom: none; }
    .fn-detail-row-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: .06em;
      color: var(--text-muted, #64748B);
      width: 90px;
      flex-shrink: 0;
      padding-top: 1px;
    }
    .fn-detail-row-val {
      font-size: 13px;
      color: var(--text-primary, #F1F5F9);
      flex: 1;
    }

    .fn-detail-footer {
      display: flex;
      gap: 8px;
      padding: 16px 20px;
      border-top: 1px solid var(--border, rgba(255,255,255,.08));
      flex-shrink: 0;
    }
    .fn-detail-footer .btn { flex: 1; }

    /* ── Modal ── */
    .fn-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,.6);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 20px;
    }
    .fn-modal {
      background: var(--bg-secondary, #1A1D2E);
      border: 1px solid var(--border, rgba(255,255,255,.1));
      border-radius: 16px;
      width: 100%;
      max-width: 480px;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 24px 64px rgba(0,0,0,.5);
    }
    .fn-modal::-webkit-scrollbar { width: 4px; }
    .fn-modal::-webkit-scrollbar-track { background: transparent; }
    .fn-modal::-webkit-scrollbar-thumb { background: rgba(255,255,255,.12); border-radius: 2px; }

    .fn-modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 24px 0;
      position: sticky;
      top: 0;
      background: var(--bg-secondary, #1A1D2E);
      z-index: 1;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border, rgba(255,255,255,.08));
    }
    .fn-modal-title {
      font-size: 17px;
      font-weight: 700;
      color: var(--text-primary, #F1F5F9);
      margin: 0;
    }
    .fn-modal-close {
      width: 32px; height: 32px;
      border-radius: 8px;
      border: 1px solid var(--border, rgba(255,255,255,.1));
      background: transparent;
      color: var(--text-secondary, #94A3B8);
      font-size: 14px;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: all .15s;
    }
    .fn-modal-close:hover { background: rgba(239,68,68,.15); border-color: #EF4444; color: #EF4444; }

    /* Type tabs inside modal */
    .fn-type-tabs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 4px;
    }
    .fn-type-tab {
      padding: 10px;
      border-radius: 10px;
      border: 2px solid var(--border, rgba(255,255,255,.1));
      background: transparent;
      color: var(--text-secondary, #94A3B8);
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all .15s;
      text-align: center;
    }
    .fn-type-tab:hover { border-color: rgba(255,255,255,.25); color: var(--text-primary, #F1F5F9); }
    .fn-type-tab.active[data-type="income"]  { border-color: #34D399; color: #34D399; background: rgba(52,211,153,.1);  }
    .fn-type-tab.active[data-type="expense"] { border-color: #EF4444; color: #EF4444; background: rgba(239,68,68,.1);   }

    .fn-modal-body  { padding: 20px 24px; }
    .fn-modal-footer {
      display: flex;
      gap: 10px;
      padding: 16px 24px;
      border-top: 1px solid var(--border, rgba(255,255,255,.08));
    }
    .fn-modal-footer .btn { flex: 1; }

    /* Amount input */
    .fn-amount-wrap {
      position: relative;
    }
    .fn-amount-prefix {
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 15px;
      font-weight: 600;
      color: var(--text-secondary, #94A3B8);
      pointer-events: none;
    }
    .fn-amount-input {
      padding-left: 28px !important;
    }

    /* Spinner (reuse global if available, else define) */
    .fn-spinner {
      width: 32px; height: 32px;
      border: 3px solid rgba(255,255,255,.1);
      border-top-color: var(--accent, #4F8EF7);
      border-radius: 50%;
      animation: fn-spin .7s linear infinite;
    }
    @keyframes fn-spin { to { transform: rotate(360deg); } }

    .fn-field-error {
      font-size: 12px;
      color: #EF4444;
      margin-top: 4px;
      display: block;
    }
  `
  document.head.appendChild(style)
}

// ── Main render ─────────────────────────────────────────────────────────────
export async function render(container) {
  injectStyles()

  const user = getCurrentUser()
  const base = getActivePathSegments(user.uid)

  container.innerHTML = `
    <div class="fn-layout">

      <!-- ══ Left ══ -->
      <div class="fn-left" id="fn-left">

        <div class="fn-header">
          <div>
            <h1 class="fn-title">Фінанси</h1>
            <p class="fn-sub" id="fn-subtitle">Завантаження...</p>
          </div>
          <button class="btn btn-primary" id="fn-add-btn">+ Нова транзакція</button>
        </div>

        <div class="fn-left-scroll">

          <!-- Stat cards -->
          <div class="fn-stats">
            <div class="fn-stat fn-stat-income">
              <div class="fn-stat-label">Дохід</div>
              <div class="fn-stat-val" id="fn-s-income">₴0</div>
            </div>
            <div class="fn-stat fn-stat-expense">
              <div class="fn-stat-label">Витрати</div>
              <div class="fn-stat-val" id="fn-s-expense">₴0</div>
            </div>
            <div class="fn-stat fn-stat-balance">
              <div class="fn-stat-label">Баланс</div>
              <div class="fn-stat-val" id="fn-s-balance">₴0</div>
            </div>
          </div>

          <!-- Filter pills -->
          <div class="fn-filters" id="fn-filters">
            <button class="fn-pill active" data-filter="all">Всі</button>
            <button class="fn-pill" data-filter="income">Дохід</button>
            <button class="fn-pill" data-filter="expense">Витрати</button>
          </div>

          <!-- Transaction list -->
          <div id="fn-list">
            <div class="fn-loading"><div class="fn-spinner"></div></div>
          </div>

        </div>
      </div>

      <!-- ══ Right: detail panel ══ -->
      <div class="fn-right" id="fn-right" style="display:none">
        <div class="fn-detail-stripe" id="fn-detail-stripe"></div>
        <div class="fn-detail" id="fn-detail"></div>
      </div>

    </div>

    <!-- ══ Modal ══ -->
    <div class="fn-modal-overlay" id="fn-modal" style="display:none">
      <div class="fn-modal">
        <div class="fn-modal-header">
          <h2 class="fn-modal-title" id="fn-modal-title">Нова транзакція</h2>
          <button class="fn-modal-close" id="fn-modal-close">${icon('x', 14)}</button>
        </div>
        <form id="fn-form" novalidate>
          <div class="fn-modal-body">

            <!-- Type tabs -->
            <div class="field" style="margin-bottom:16px">
              <div class="fn-type-tabs" id="fn-type-tabs">
                <button type="button" class="fn-type-tab active" data-type="income">Дохід</button>
                <button type="button" class="fn-type-tab"        data-type="expense">Витрата</button>
              </div>
            </div>

            <!-- Amount -->
            <div class="field">
              <label>Сума *</label>
              <div class="fn-amount-wrap">
                <span class="fn-amount-prefix">₴</span>
                <input id="fn-f-amount" type="number" class="input fn-amount-input"
                       placeholder="0.00" step="0.01" min="0" />
              </div>
              <span class="fn-field-error" id="fn-e-amount"></span>
            </div>

            <!-- Category -->
            <div class="field">
              <label>Категорія</label>
              <select id="fn-f-category" class="input"></select>
            </div>

            <!-- Date -->
            <div class="field">
              <label>Дата</label>
              <input id="fn-f-date" type="date" class="input" />
            </div>

            <!-- Description -->
            <div class="field">
              <label>Опис</label>
              <textarea id="fn-f-desc" class="input" rows="3"
                        placeholder="Деталі транзакції..." style="resize:vertical"></textarea>
            </div>

          </div>
          <div class="fn-modal-footer">
            <button type="button" class="btn btn-secondary" id="fn-modal-cancel">Скасувати</button>
            <button type="submit" class="btn btn-primary"   id="fn-modal-submit">Зберегти</button>
          </div>
        </form>
      </div>
    </div>
  `

  // ── State ────────────────────────────────────────────────────────────────
  let transactions = []
  let filter       = 'all'
  let selectedId   = null
  let editingId    = null
  let modalType    = 'income'   // current type tab in modal

  // ── DOM refs ─────────────────────────────────────────────────────────────
  const listEl    = container.querySelector('#fn-list')
  const rightEl   = container.querySelector('#fn-right')
  const detailEl  = container.querySelector('#fn-detail')
  const stripeEl  = container.querySelector('#fn-detail-stripe')
  const modalEl   = container.querySelector('#fn-modal')
  const formEl    = container.querySelector('#fn-form')

  // ── Load ──────────────────────────────────────────────────────────────────
  async function loadTransactions() {
    try {
      let snap
      try {
        snap = await getDocs(
          query(collection(db, ...base, 'transactions'), orderBy('date', 'desc'))
        )
      } catch (_) {
        // fallback if composite index not ready
        snap = await getDocs(collection(db, ...base, 'transactions'))
      }
      transactions = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      // client-side sort fallback
      transactions.sort((a, b) => {
        const da = a.date || ''
        const db2 = b.date || ''
        return da < db2 ? 1 : da > db2 ? -1 : 0
      })
      renderAll()
    } catch (err) {
      console.error('finances load error', err)
      listEl.innerHTML = `
        <div class="fn-empty">
          <div class="fn-empty-icon">${icon('alert-triangle', 40)}</div>
          <div class="fn-empty-title">Помилка завантаження</div>
          <div class="fn-empty-desc">${err.message}</div>
        </div>`
    }
  }

  // ── Render all ───────────────────────────────────────────────────────────
  function renderAll() {
    renderStats()
    renderList()
    updateSubtitle()
  }

  function renderStats() {
    const income  = transactions.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0)
    const expense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0)
    const balance = income - expense

    container.querySelector('#fn-s-income').textContent  = fmtAmt(income)
    container.querySelector('#fn-s-expense').textContent = fmtAmt(expense)

    const balEl = container.querySelector('#fn-s-balance')
    balEl.textContent = (balance < 0 ? '−' : '') + fmtAmt(balance)
    balEl.style.color = balance < 0 ? '#EF4444' : balance > 0 ? '#34D399' : ''
  }

  function updateSubtitle() {
    const income  = transactions.filter(t => t.type === 'income').length
    const expense = transactions.filter(t => t.type === 'expense').length
    container.querySelector('#fn-subtitle').textContent =
      `${transactions.length} транзакцій · ${income} доходів · ${expense} витрат`
  }

  function renderList() {
    const list = filter === 'all'
      ? transactions
      : transactions.filter(t => t.type === filter)

    if (list.length === 0) {
      listEl.innerHTML = `
        <div class="fn-empty">
          <div class="fn-empty-icon">${icon('finances', 48)}</div>
          <div class="fn-empty-title">Транзакцій немає</div>
          <div class="fn-empty-desc">Натисніть "+ Нова транзакція" щоб додати</div>
        </div>`
      return
    }

    listEl.innerHTML = `<div class="fn-list">${list.map(t => {
      const cat = getCatMeta(t.type, t.category)
      const sel = t.id === selectedId
      return `
        <div class="fn-card fn-card-${t.type} ${sel ? 'fn-card-selected' : ''}" data-id="${t.id}">
          <div class="fn-card-icon">${icon(t.type === 'income' ? 'finances' : 'bar-chart', 20)}</div>
          <div class="fn-card-body">
            <div class="fn-card-top">
              <span class="fn-card-cat">${cat.label}</span>
              <span class="fn-card-amount ${t.type}">
                ${t.type === 'income' ? '+' : '−'}${fmtAmt(t.amount)}
              </span>
            </div>
            ${t.description ? `<div class="fn-card-desc">${t.description}</div>` : ''}
            <div class="fn-card-date">${fmtDate(t.date)}</div>
          </div>
        </div>`
    }).join('')}</div>`

    // click to select
    listEl.querySelectorAll('.fn-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.id
        selectedId = id === selectedId ? null : id
        if (selectedId) {
          showDetail(transactions.find(t => t.id === selectedId))
        } else {
          closeDetail()
        }
        // update selection highlight
        listEl.querySelectorAll('.fn-card').forEach(c => {
          c.classList.toggle('fn-card-selected', c.dataset.id === selectedId)
        })
      })
    })
  }

  // ── Detail panel ─────────────────────────────────────────────────────────
  function showDetail(t) {
    if (!t) return
    rightEl.style.display = 'flex'
    rightEl.style.flexDirection = 'column'
    stripeEl.className = `fn-detail-stripe ${t.type}`

    const cat = getCatMeta(t.type, t.category)
    const typeLabel  = t.type === 'income' ? 'Дохід' : 'Витрата'

    detailEl.innerHTML = `
      <div class="fn-detail-header">
        <div>
          <div class="fn-detail-type-badge ${t.type}">${typeLabel}</div>
          <div class="fn-detail-amount ${t.type}">
            ${t.type === 'income' ? '+' : '−'}${fmtAmt(t.amount)}
          </div>
        </div>
        <button class="fn-detail-close" id="fn-detail-close">${icon('x', 14)}</button>
      </div>

      <div class="fn-detail-body">
        <div class="fn-detail-section">
          <div class="fn-detail-row">
            <span class="fn-detail-row-label">Категорія</span>
            <span class="fn-detail-row-val">${cat.label}</span>
          </div>
          <div class="fn-detail-row">
            <span class="fn-detail-row-label">Дата</span>
            <span class="fn-detail-row-val">${fmtDate(t.date)}</span>
          </div>
          ${t.description ? `
          <div class="fn-detail-row">
            <span class="fn-detail-row-label">Опис</span>
            <span class="fn-detail-row-val">${t.description}</span>
          </div>` : ''}
        </div>
      </div>

      <div class="fn-detail-footer">
        <button class="btn btn-secondary" id="fn-detail-edit">Редагувати</button>
        <button class="btn btn-danger"    id="fn-detail-delete">Видалити</button>
      </div>
    `

    detailEl.querySelector('#fn-detail-close').addEventListener('click', closeDetail)

    detailEl.querySelector('#fn-detail-edit').addEventListener('click', () => {
      openModal(t)
    })

    detailEl.querySelector('#fn-detail-delete').addEventListener('click', async () => {
      if (!confirm(`Видалити транзакцію "${cat.label} ${fmtAmt(t.amount)}"?`)) return
      try {
        await deleteDoc(doc(db, ...base, 'transactions', t.id))
        transactions = transactions.filter(tx => tx.id !== t.id)
        closeDetail()
        renderAll()
      } catch (err) {
        alert('Помилка видалення: ' + err.message)
      }
    })
  }

  function closeDetail() {
    selectedId = null
    rightEl.style.display = 'none'
    detailEl.innerHTML = ''
    listEl.querySelectorAll('.fn-card').forEach(c => c.classList.remove('fn-card-selected'))
  }

  // ── Filter pills ──────────────────────────────────────────────────────────
  container.querySelector('#fn-filters').addEventListener('click', e => {
    const pill = e.target.closest('.fn-pill')
    if (!pill) return
    container.querySelectorAll('.fn-pill').forEach(p => p.classList.remove('active'))
    pill.classList.add('active')
    filter = pill.dataset.filter
    renderList()
  })

  // ── Modal open/close ──────────────────────────────────────────────────────
  function openModal(existing = null) {
    editingId = existing ? existing.id : null
    container.querySelector('#fn-modal-title').textContent =
      existing ? 'Редагувати транзакцію' : 'Нова транзакція'

    // set type
    modalType = existing ? (existing.type || 'income') : 'income'
    updateTypeTabs()
    populateCategorySelect()

    // fill fields
    container.querySelector('#fn-f-amount').value   = existing ? (existing.amount || '') : ''
    container.querySelector('#fn-f-date').value     = existing ? (existing.date || today()) : today()
    container.querySelector('#fn-f-desc').value     = existing ? (existing.description || '') : ''
    container.querySelector('#fn-e-amount').textContent = ''

    // select category
    if (existing && existing.category) {
      const sel = container.querySelector('#fn-f-category')
      sel.value = existing.category
    }

    modalEl.style.display = 'flex'
    container.querySelector('#fn-f-amount').focus()
  }

  function closeModal() {
    modalEl.style.display = 'none'
    editingId = null
  }

  // ── Type tabs in modal ────────────────────────────────────────────────────
  function updateTypeTabs() {
    container.querySelectorAll('.fn-type-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.type === modalType)
    })
  }

  function populateCategorySelect() {
    const sel  = container.querySelector('#fn-f-category')
    const cats = modalType === 'income' ? INCOME_CATS : EXPENSE_CATS
    sel.innerHTML = cats.map(c => `<option value="${c.id}">${c.label}</option>`).join('')
  }

  container.querySelector('#fn-type-tabs').addEventListener('click', e => {
    const tab = e.target.closest('.fn-type-tab')
    if (!tab) return
    modalType = tab.dataset.type
    updateTypeTabs()
    populateCategorySelect()
  })

  // ── Modal buttons ─────────────────────────────────────────────────────────
  container.querySelector('#fn-add-btn').addEventListener('click', () => openModal())
  container.querySelector('#fn-modal-close').addEventListener('click', closeModal)
  container.querySelector('#fn-modal-cancel').addEventListener('click', closeModal)
  modalEl.addEventListener('click', e => {
    if (e.target === modalEl) closeModal()
  })

  // ── Form submit ───────────────────────────────────────────────────────────
  formEl.addEventListener('submit', async e => {
    e.preventDefault()

    const amountRaw = container.querySelector('#fn-f-amount').value.trim()
    const amount    = parseFloat(amountRaw)
    const errEl     = container.querySelector('#fn-e-amount')

    errEl.textContent = ''
    if (!amountRaw || isNaN(amount) || amount <= 0) {
      errEl.textContent = 'Введіть коректну суму'
      return
    }

    const payload = {
      type:        modalType,
      amount,
      category:    container.querySelector('#fn-f-category').value,
      date:        container.querySelector('#fn-f-date').value || today(),
      description: container.querySelector('#fn-f-desc').value.trim(),
      updatedAt:   serverTimestamp(),
    }

    const submitBtn = container.querySelector('#fn-modal-submit')
    submitBtn.disabled = true
    submitBtn.textContent = 'Збереження...'

    try {
      if (editingId) {
        await updateDoc(doc(db, ...base, 'transactions', editingId), payload)
        const idx = transactions.findIndex(t => t.id === editingId)
        if (idx !== -1) transactions[idx] = { ...transactions[idx], ...payload }
        // refresh detail if still open
        if (selectedId === editingId) showDetail(transactions[idx])
      } else {
        payload.createdAt = serverTimestamp()
        const ref = await addDoc(collection(db, ...base, 'transactions'), payload)
        transactions.unshift({ id: ref.id, ...payload })
      }
      closeModal()
      renderAll()
    } catch (err) {
      alert('Помилка збереження: ' + err.message)
    } finally {
      submitBtn.disabled = false
      submitBtn.textContent = 'Зберегти'
    }
  })

  // ── Initial load ──────────────────────────────────────────────────────────
  await loadTransactions()
}
