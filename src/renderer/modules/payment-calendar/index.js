// src/renderer/modules/payment-calendar/index.js
import { db } from '../../services/firebase.js'
import { getCurrentUser, getActivePathSegments } from '../../services/auth.js'
import { icon } from '../../utils/icons.js'
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
import { EVENTS as TAX_EVENTS, parseDate as parseTaxDate } from '../tax-calendar/index.js'

const MONTH_NAMES = ['Січень','Лютий','Березень','Квітень','Травень','Червень',
  'Липень','Серпень','Вересень','Жовтень','Листопад','Грудень']

const KIND_META = {
  income:  { label: 'Очікується надходження', color: '#34D399', bg: 'rgba(52,211,153,.12)', icon: 'invoices'  },
  expense: { label: 'Запланована витрата',     color: '#F87171', bg: 'rgba(248,113,113,.12)', icon: 'finances' },
  payroll: { label: 'Зарплата',                 color: '#5B8DEF', bg: 'rgba(91,141,239,.12)',  icon: 'briefcase' },
  tax:     { label: 'Податковий дедлайн',       color: '#FBBF24', bg: 'rgba(251,191,36,.12)',  icon: 'shield'   },
}

function fmtDate(d) {
  return d.toLocaleDateString('uk-UA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function daysUntil(d) {
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const dd  = new Date(d); dd.setHours(0, 0, 0, 0)
  return Math.round((dd - now) / 86400000)
}

function daysLabel(days) {
  if (days < 0)   return `Прострочено ${Math.abs(days)} дн`
  if (days === 0) return 'Сьогодні'
  if (days === 1) return 'Завтра'
  return `Через ${days} дн`
}

export async function render(container) {
  injectStyles()
  const user = getCurrentUser()
  const base = getActivePathSegments(user.uid)

  container.innerHTML = `
    <div class="pc-root">
      <div class="pc-header">
        <div>
          <h1 class="pc-title">${icon('calendar', 20)} Календар платежів</h1>
          <p class="pc-subtitle">Усі майбутні надходження, витрати, зарплати й податки в одному списку</p>
        </div>
      </div>
      <div class="pc-filters" id="pc-filters">
        <button class="pc-pill active" data-filter="all">Всі</button>
        <button class="pc-pill" data-filter="income">Надходження</button>
        <button class="pc-pill" data-filter="expense">Витрати</button>
        <button class="pc-pill" data-filter="payroll">Зарплата</button>
        <button class="pc-pill" data-filter="tax">Податки</button>
      </div>
      <div id="pc-list"><div class="pc-loading"><div class="pc-spinner"></div></div></div>
    </div>
  `

  let items = []
  let filter = 'all'

  await loadAll()

  async function loadAll() {
    const [invSnap, expSnap, finSnap, payrollSnap] = await Promise.all([
      getDocs(collection(db, ...base, 'invoices')).catch(() => null),
      getDocs(collection(db, ...base, 'expenses')).catch(() => null),
      getDocs(collection(db, ...base, 'transactions')).catch(() => null),
      getDocs(collection(db, ...base, 'payroll_periods')).catch(() => null),
    ])

    const today = new Date(); today.setHours(0, 0, 0, 0)
    const collected = []

    invSnap?.docs.forEach(d => {
      const inv = d.data()
      if (inv.status === 'paid') return
      const dateStr = inv.dueDate || inv.date
      if (!dateStr) return
      const dt = new Date(dateStr)
      if (isNaN(dt)) return
      collected.push({
        date: dt, kind: 'income',
        title: `Оплата від ${inv.client || 'клієнта'}`,
        sub:   `Рахунок ${inv.number || ''}`.trim(),
        amount: Number(inv.amount) || 0,
      })
    })

    expSnap?.docs.forEach(d => {
      const e = d.data()
      if (!e.date) return
      const dt = new Date(e.date)
      if (isNaN(dt) || dt < today) return
      collected.push({ date: dt, kind: 'expense', title: e.name || 'Витрата', sub: 'Рахунки · Витрати', amount: Number(e.amount) || 0 })
    })

    finSnap?.docs.forEach(d => {
      const t = d.data()
      if (t.type !== 'expense' || !t.date) return
      const dt = new Date(t.date)
      if (isNaN(dt) || dt < today) return
      collected.push({ date: dt, kind: 'expense', title: t.description || 'Витрата', sub: 'Фінанси', amount: Number(t.amount) || 0 })
    })

    payrollSnap?.docs.forEach(d => {
      const p = d.data()
      if (p.status === 'approved' || !p.year || !p.month) return
      const dt = new Date(p.year, p.month, 0) // last day of that (1-indexed) month
      collected.push({ date: dt, kind: 'payroll', title: `Зарплата за ${MONTH_NAMES[p.month - 1]} ${p.year}`, sub: 'Ще не виплачено', amount: null })
    })

    TAX_EVENTS.forEach(e => {
      collected.push({ date: parseTaxDate(e.date), kind: 'tax', title: e.title, sub: e.desc, amount: null })
    })

    collected.sort((a, b) => a.date - b.date)
    items = collected
    renderList()
  }

  function renderList() {
    const el = container.querySelector('#pc-list')
    const filtered = filter === 'all' ? items : items.filter(i => i.kind === filter)

    if (!filtered.length) {
      el.innerHTML = `
        <div class="pc-empty">
          <div class="pc-empty-icon">${icon('calendar', 40)}</div>
          <div class="pc-empty-title">Нічого не заплановано</div>
          <div class="pc-empty-desc">Неоплачені рахунки, витрати з майбутньою датою та зарплати з'являться тут</div>
        </div>`
      return
    }

    el.innerHTML = filtered.map(item => {
      const meta = KIND_META[item.kind]
      const days = daysUntil(item.date)
      const urge = days < 0 ? 'pc-urge-overdue' : days <= 7 ? 'pc-urge-soon' : 'pc-urge-ok'
      return `
        <div class="pc-row ${urge}">
          <div class="pc-row-icon" style="color:${meta.color};background:${meta.bg}">${icon(meta.icon, 18)}</div>
          <div class="pc-row-content">
            <div class="pc-row-title">${item.title}</div>
            <div class="pc-row-sub">${item.sub || ''}</div>
          </div>
          <div class="pc-row-right">
            ${item.amount ? `<div class="pc-row-amount" style="color:${meta.color}">₴${item.amount.toLocaleString('uk-UA')}</div>` : ''}
            <div class="pc-row-date">${fmtDate(item.date)}</div>
            <div class="pc-row-days">${daysLabel(days)}</div>
          </div>
        </div>`
    }).join('')
  }

  container.querySelector('#pc-filters').addEventListener('click', e => {
    const btn = e.target.closest('.pc-pill')
    if (!btn) return
    container.querySelectorAll('.pc-pill').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    filter = btn.dataset.filter
    renderList()
  })
}

function injectStyles() {
  if (document.getElementById('pc-styles')) return
  const style = document.createElement('style')
  style.id = 'pc-styles'
  style.textContent = `
    .pc-root { padding:24px; max-width:900px; margin:0 auto; }
    .pc-header { margin-bottom:18px; }
    .pc-title { font-family:var(--font-display); font-size:22px; font-weight:800; display:flex; align-items:center; gap:10px; }
    .pc-subtitle { font-size:13px; color:var(--text-muted); margin-top:4px; }

    .pc-filters { display:flex; gap:6px; margin-bottom:18px; flex-wrap:wrap; }
    .pc-pill { padding:7px 14px; border-radius:999px; font-size:12.5px; font-weight:600; cursor:pointer;
      border:1px solid var(--border); background:var(--bg-elevated); color:var(--text-muted); transition:all .15s; }
    .pc-pill:hover { color:var(--text-primary); }
    .pc-pill.active { background:var(--accent-blue-dim); border-color:var(--accent-blue); color:var(--accent-blue); }

    .pc-row { display:flex; align-items:center; gap:14px; padding:14px 16px; border-radius:var(--radius-lg);
      background:var(--bg-elevated); border:1px solid var(--border); margin-bottom:8px; }
    .pc-row-icon { width:38px; height:38px; border-radius:10px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .pc-row-content { flex:1; min-width:0; }
    .pc-row-title { font-size:14px; font-weight:700; }
    .pc-row-sub   { font-size:12px; color:var(--text-muted); margin-top:2px; }
    .pc-row-right { text-align:right; flex-shrink:0; }
    .pc-row-amount { font-family:var(--font-mono); font-weight:800; font-size:14px; }
    .pc-row-date   { font-size:11.5px; color:var(--text-muted); margin-top:2px; }
    .pc-row-days   { font-size:11px; font-weight:700; margin-top:2px; }
    .pc-urge-overdue .pc-row-days { color:#F87171; }
    .pc-urge-soon    .pc-row-days { color:#FBBF24; }
    .pc-urge-ok      .pc-row-days { color:var(--text-muted); }

    .pc-empty { text-align:center; padding:60px 20px; color:var(--text-muted); }
    .pc-empty-icon { opacity:.5; margin-bottom:14px; display:flex; justify-content:center; }
    .pc-empty-title { font-size:15px; font-weight:700; color:var(--text-secondary); margin-bottom:6px; }
    .pc-empty-desc { font-size:13px; max-width:340px; margin:0 auto; }

    .pc-loading { display:flex; justify-content:center; padding:60px 0; }
    .pc-spinner { width:28px; height:28px; border:3px solid var(--border); border-top-color:var(--accent-blue);
      border-radius:50%; animation:pc-spin .7s linear infinite; }
    @keyframes pc-spin { to { transform:rotate(360deg); } }
  `
  document.head.appendChild(style)
}
