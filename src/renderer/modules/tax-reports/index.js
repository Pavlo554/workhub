// src/renderer/modules/tax-reports/index.js
import { db } from '../../services/firebase.js'
import { getCurrentUser, getActivePathSegments } from '../../services/auth.js'
import {
  collection, getDocs, query, orderBy,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
import { icon } from '../../utils/icons.js'

const MONTHS_UK = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень']

export async function render(container) {
  injectStyles()
  const user = getCurrentUser()
  if (!user) return
  const base = getActivePathSegments(user.uid)

  const now = new Date()
  let period = { type: 'month', year: now.getFullYear(), month: now.getMonth(), quarter: Math.floor(now.getMonth() / 3) }
  let cache  = null

  container.innerHTML = `
    <div class="tr-page">
      <div class="tr-header">
        <div>
          <h1 class="tr-title">${icon('bar-chart', 22)} Звіти</h1>
          <p class="tr-sub">Дохід, витрати та рахунки за обраний період — для подачі звітності</p>
        </div>
        <button class="btn btn-secondary" id="tr-export">${icon('download', 14)} Експорт CSV</button>
      </div>

      <div class="tr-period-bar">
        <div class="tr-period-tabs">
          <button class="tr-period-tab active" data-type="month">Місяць</button>
          <button class="tr-period-tab" data-type="quarter">Квартал</button>
          <button class="tr-period-tab" data-type="year">Рік</button>
        </div>
        <div class="tr-period-nav">
          <button class="tr-nav-btn" id="tr-prev">${icon('chevron-left', 16)}</button>
          <span class="tr-period-label" id="tr-period-label"></span>
          <button class="tr-nav-btn" id="tr-next">${icon('chevron-right', 16)}</button>
        </div>
      </div>

      <div id="tr-content" class="tr-content">
        <div class="tr-loading"><div class="spinner"></div></div>
      </div>
    </div>
  `

  container.querySelector('.tr-period-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.tr-period-tab')
    if (!btn) return
    container.querySelectorAll('.tr-period-tab').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    period.type = btn.dataset.type
    renderAll()
  })
  container.querySelector('#tr-prev').addEventListener('click', () => { shiftPeriod(-1); renderAll() })
  container.querySelector('#tr-next').addEventListener('click', () => { shiftPeriod(1); renderAll() })
  container.querySelector('#tr-export').addEventListener('click', exportCsv)

  function shiftPeriod(dir) {
    if (period.type === 'month') {
      period.month += dir
      if (period.month < 0)  { period.month = 11; period.year-- }
      if (period.month > 11) { period.month = 0;  period.year++ }
    } else if (period.type === 'quarter') {
      period.quarter += dir
      if (period.quarter < 0) { period.quarter = 3; period.year-- }
      if (period.quarter > 3) { period.quarter = 0; period.year++ }
    } else {
      period.year += dir
    }
  }

  function getRange() {
    if (period.type === 'month') {
      const start = new Date(period.year, period.month, 1)
      const end   = new Date(period.year, period.month + 1, 1)
      return { start, end, label: `${MONTHS_UK[period.month]} ${period.year}` }
    }
    if (period.type === 'quarter') {
      const startMonth = period.quarter * 3
      const start = new Date(period.year, startMonth, 1)
      const end   = new Date(period.year, startMonth + 3, 1)
      return { start, end, label: `${period.quarter + 1} квартал ${period.year}` }
    }
    const start = new Date(period.year, 0, 1)
    const end   = new Date(period.year + 1, 0, 1)
    return { start, end, label: `${period.year} рік` }
  }

  async function loadData() {
    if (cache) return cache
    const [transactions, invoices] = await Promise.all([
      getDocs(collection(db, ...base, 'transactions')).then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))).catch(() => []),
      getDocs(query(collection(db, ...base, 'invoices'), orderBy('createdAt', 'desc'))).then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))).catch(() => []),
    ])
    cache = { transactions, invoices }
    return cache
  }

  function toDate(val) {
    if (!val) return null
    if (val.toDate) return val.toDate()
    return new Date(val)
  }

  async function renderAll() {
    const { start, end, label } = getRange()
    container.querySelector('#tr-period-label').textContent = label

    const el = container.querySelector('#tr-content')
    el.innerHTML = `<div class="tr-loading"><div class="spinner"></div></div>`

    const { transactions, invoices } = await loadData()

    const txInRange  = transactions.filter(t => { const d = toDate(t.date); return d && d >= start && d < end })
    const income      = txInRange.filter(t => t.type === 'income').reduce((s, t) => s + (t.amountUAH ?? t.amount ?? 0), 0)
    const expense      = txInRange.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amountUAH ?? t.amount ?? 0), 0)
    const profit       = income - expense

    const invInRange  = invoices.filter(inv => { const d = toDate(inv.createdAt); return d && d >= start && d < end })
    const invoiced     = invInRange.reduce((s, inv) => s + (inv.amount || 0), 0)
    const paidInvoices = invInRange.filter(inv => inv.status === 'paid')
    const paid          = paidInvoices.reduce((s, inv) => s + (inv.amount || 0), 0)

    el.innerHTML = `
      <div class="tr-kpi-grid">
        <div class="tr-kpi-card tr-kpi--income">
          <div class="tr-kpi-icon">${icon('finances', 22)}</div>
          <div class="tr-kpi-body">
            <div class="tr-kpi-label">Дохід</div>
            <div class="tr-kpi-value">₴${income.toLocaleString('uk-UA')}</div>
          </div>
        </div>
        <div class="tr-kpi-card tr-kpi--expense">
          <div class="tr-kpi-icon">${icon('trending-down', 22)}</div>
          <div class="tr-kpi-body">
            <div class="tr-kpi-label">Витрати</div>
            <div class="tr-kpi-value">₴${expense.toLocaleString('uk-UA')}</div>
          </div>
        </div>
        <div class="tr-kpi-card tr-kpi--profit">
          <div class="tr-kpi-icon">${icon('trending-up', 22)}</div>
          <div class="tr-kpi-body">
            <div class="tr-kpi-label">Чистий прибуток</div>
            <div class="tr-kpi-value" style="color:${profit >= 0 ? '#34D399' : '#F87171'}">₴${profit.toLocaleString('uk-UA')}</div>
          </div>
        </div>
        <div class="tr-kpi-card">
          <div class="tr-kpi-icon">${icon('invoices', 22)}</div>
          <div class="tr-kpi-body">
            <div class="tr-kpi-label">Виставлено / оплачено</div>
            <div class="tr-kpi-value">₴${invoiced.toLocaleString('uk-UA')} / ₴${paid.toLocaleString('uk-UA')}</div>
          </div>
        </div>
      </div>

      <div class="tr-section-card">
        <div class="tr-section-title">Рахунки за період (${invInRange.length})</div>
        ${invInRange.length ? `
          <div class="tr-table">
            <div class="tr-table-head">
              <div>Дата</div><div>Клієнт</div><div>Сума</div><div>Статус</div>
            </div>
            ${invInRange.map(inv => {
              const d = toDate(inv.createdAt)
              return `
                <div class="tr-table-row">
                  <div>${d ? d.toLocaleDateString('uk-UA') : '—'}</div>
                  <div>${inv.clientName || 'Невідомий клієнт'}</div>
                  <div>₴${(inv.amount || 0).toLocaleString('uk-UA')}</div>
                  <div><span class="tr-status tr-status--${inv.status || 'unpaid'}">${statusLabel(inv.status)}</span></div>
                </div>`
            }).join('')}
          </div>
        ` : `<div class="tr-empty">Рахунків за цей період немає</div>`}
      </div>
    `

    container.dataset.lastInRange = JSON.stringify({ income, expense, profit, invInRange: invInRange.length })
    container._lastTxInRange  = txInRange
    container._lastInvInRange = invInRange
    container._lastLabel      = label
  }

  function statusLabel(s) {
    return { paid: 'Оплачено', unpaid: 'Не оплачено', pending: 'Очікує', overdue: 'Просрочено' }[s] || s || 'Не оплачено'
  }

  function exportCsv() {
    const tx  = container._lastTxInRange  || []
    const inv = container._lastInvInRange || []
    const headers = ['Тип', 'Дата', 'Категорія/Клієнт', 'Сума', 'Статус']
    const rows = [
      ...tx.map(t => [t.type === 'income' ? 'Дохід' : 'Витрата', t.date || '', t.category || '', t.amountUAH ?? t.amount ?? 0, '']),
      ...inv.map(i => { const d = toDate(i.createdAt); return ['Рахунок', d ? d.toLocaleDateString('uk-UA') : '', i.clientName || '', i.amount || 0, statusLabel(i.status)] }),
    ]
    const csv  = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `workhub-zvit-${(container._lastLabel || '').replace(/\s+/g, '-')}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  renderAll()
}

function injectStyles() {
  if (document.getElementById('tr-styles')) return
  const s = document.createElement('style')
  s.id = 'tr-styles'
  s.textContent = `
    .tr-page { padding: 24px; }
    .tr-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; gap:12px; flex-wrap:wrap; }
    .tr-title { font-size:22px; font-weight:700; display:flex; align-items:center; gap:10px; color:var(--text-primary); }
    .tr-sub   { font-size:13px; color:var(--text-muted); margin-top:4px; }

    .tr-period-bar { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap:wrap; gap:12px; }
    .tr-period-tabs { display:flex; gap:4px; background:var(--bg-secondary); border-radius:10px; padding:4px; }
    .tr-period-tab { padding:7px 14px; border:none; background:none; border-radius:8px; font-size:13px; font-weight:600; color:var(--text-muted); cursor:pointer; }
    .tr-period-tab.active { background:#4F8EF7; color:#fff; }
    .tr-period-nav { display:flex; align-items:center; gap:10px; }
    .tr-nav-btn { width:30px; height:30px; border-radius:8px; border:1px solid var(--border); background:var(--bg-secondary); color:var(--text-primary); cursor:pointer; display:flex; align-items:center; justify-content:center; }
    .tr-period-label { font-size:14px; font-weight:700; color:var(--text-primary); min-width:140px; text-align:center; }

    .tr-kpi-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:20px; }
    .tr-kpi-card { background:var(--bg-secondary); border:1.5px solid var(--border); border-radius:var(--radius-xl,14px); padding:16px; display:flex; align-items:center; gap:12px; }
    .tr-kpi-icon { width:42px; height:42px; border-radius:10px; background:var(--bg-tertiary); display:flex; align-items:center; justify-content:center; color:#4F8EF7; flex-shrink:0; }
    .tr-kpi--income .tr-kpi-icon  { color:#34D399; }
    .tr-kpi--expense .tr-kpi-icon { color:#F87171; }
    .tr-kpi--profit .tr-kpi-icon  { color:#FBBF24; }
    .tr-kpi-label { font-size:12px; color:var(--text-muted); margin-bottom:2px; }
    .tr-kpi-value { font-size:17px; font-weight:700; color:var(--text-primary); }

    .tr-section-card { background:var(--bg-secondary); border:1.5px solid var(--border); border-radius:var(--radius-xl,14px); padding:18px 20px; }
    .tr-section-title { font-size:14px; font-weight:700; color:var(--text-primary); margin-bottom:12px; }

    .tr-table-head, .tr-table-row { display:grid; grid-template-columns:120px 1fr 120px 120px; gap:10px; padding:9px 4px; font-size:13px; align-items:center; }
    .tr-table-head { font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:var(--text-muted); border-bottom:1px solid var(--border); font-weight:700; }
    .tr-table-row  { border-bottom:1px solid var(--border); color:var(--text-primary); }
    .tr-table-row:last-child { border:none; }
    .tr-status { font-size:11px; font-weight:700; padding:3px 8px; border-radius:6px; }
    .tr-status--paid    { background:rgba(52,211,153,.12); color:#34D399; }
    .tr-status--unpaid  { background:rgba(248,113,113,.12); color:#F87171; }
    .tr-status--pending { background:rgba(251,191,36,.12); color:#FBBF24; }
    .tr-status--overdue { background:rgba(248,113,113,.12); color:#F87171; }

    .tr-empty   { text-align:center; padding:30px 0; color:var(--text-muted); font-size:13px; }
    .tr-loading { display:flex; justify-content:center; padding:60px 0; }
  `
  document.head.appendChild(s)
}
