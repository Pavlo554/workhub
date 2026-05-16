// src/renderer/modules/reports/index.js
import { db } from '../../services/firebase.js'
import { getCurrentUser, getActivePathSegments } from '../../services/auth.js'
import {
  collection, getDocs, query, orderBy, where,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

const MONTHS_UK = ['Січень','Лютий','Березень','Квітень','Травень','Червень',
                   'Липень','Серпень','Вересень','Жовтень','Листопад','Грудень']
const MONTHS_SHORT = ['Січ','Лют','Бер','Кві','Тра','Чер','Лип','Сер','Вер','Жов','Лис','Гру']

export async function render(container) {
  injectStyles()
  const user = getCurrentUser()
  if (!user) return
  const base = getActivePathSegments(user.uid)

  let activeTab = 'metrics'
  let taskPeriod = 'month'

  container.innerHTML = `
    <div class="rp-page">
      <div class="rp-header">
        <div>
          <h1 class="rp-title">📊 Звіти та аналітика</h1>
          <p class="rp-sub">Метрики, рейтинги та порівняння</p>
        </div>
      </div>

      <div class="rp-tabs">
        <button class="rp-tab active" data-tab="metrics">📈 Метрики</button>
        <button class="rp-tab" data-tab="clients">👥 ТОП клієнти</button>
        <button class="rp-tab" data-tab="tasks">✅ Задачі</button>
        <button class="rp-tab" data-tab="compare">🔄 Порівняння місяців</button>
      </div>

      <div id="rp-content" class="rp-content">
        <div class="rp-loading"><div class="rp-spinner"></div><span>Завантаження…</span></div>
      </div>
    </div>
  `

  container.querySelector('.rp-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.rp-tab')
    if (!btn) return
    activeTab = btn.dataset.tab
    container.querySelectorAll('.rp-tab').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    loadTab()
  })

  async function loadTab() {
    const el = container.querySelector('#rp-content')
    el.innerHTML = `<div class="rp-loading"><div class="rp-spinner"></div><span>Завантаження…</span></div>`
    try {
      const [invoices, tasks, clients] = await Promise.all([
        getDocs(query(collection(db, ...base, 'invoices'), orderBy('createdAt', 'desc'))).then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))).catch(() => []),
        getDocs(query(collection(db, ...base, 'tasks'),    orderBy('createdAt', 'desc'))).then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))).catch(() => []),
        getDocs(collection(db, ...base, 'clients')).then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))).catch(() => []),
      ])

      if (activeTab === 'metrics') renderMetrics(el, invoices, tasks, clients)
      if (activeTab === 'clients') renderTopClients(el, invoices, clients)
      if (activeTab === 'tasks')   renderTasks(el, tasks)
      if (activeTab === 'compare') renderCompare(el, invoices)
    } catch (err) {
      console.error(err)
      el.innerHTML = `<div class="rp-empty"><div style="font-size:40px">⚠️</div><div>Помилка завантаження</div></div>`
    }
  }

  // ══ TAB 1: МЕТРИКИ ══════════════════════════════════════════
  function renderMetrics(el, invoices, tasks, clients) {
    const now    = new Date()
    const thisM  = now.getMonth()
    const thisY  = now.getFullYear()
    const prevM  = thisM === 0 ? 11 : thisM - 1
    const prevY  = thisM === 0 ? thisY - 1 : thisY

    const inMonth = (inv, m, y) => {
      const d = inv.createdAt?.toDate?.() || (inv.date ? new Date(inv.date) : null)
      return d && d.getMonth() === m && d.getFullYear() === y
    }
    const taskInMonth = (t, m, y) => {
      const d = t.createdAt?.toDate?.() || null
      return d && d.getMonth() === m && d.getFullYear() === y
    }

    const incomeThis  = invoices.filter(i => i.status === 'paid' && inMonth(i, thisM, thisY)).reduce((s,i) => s+(i.amount||0), 0)
    const incomePrev  = invoices.filter(i => i.status === 'paid' && inMonth(i, prevM, prevY)).reduce((s,i) => s+(i.amount||0), 0)
    const unpaidAmt   = invoices.filter(i => i.status !== 'paid').reduce((s,i) => s+(i.amount||0), 0)
    const unpaidCount = invoices.filter(i => i.status !== 'paid').length
    const activeClients = clients.filter(c => c.status === 'active').length
    const totalClients  = clients.length
    const doneThis  = tasks.filter(t => t.status === 'done' && taskInMonth(t, thisM, thisY)).length
    const donePrev  = tasks.filter(t => t.status === 'done' && taskInMonth(t, prevM, prevY)).length
    const totalTasks = tasks.filter(t => taskInMonth(t, thisM, thisY)).length

    const pctDiff = (a, b) => {
      if (!b) return a > 0 ? '+100%' : '0%'
      const d = Math.round(((a - b) / b) * 100)
      return (d >= 0 ? '+' : '') + d + '%'
    }
    const pctColor = (a, b, inverse = false) => {
      if (a >= b) return inverse ? '#F87171' : '#34D399'
      return inverse ? '#34D399' : '#F87171'
    }

    // Last 6 months income bar chart
    const months6 = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(thisY, thisM - i, 1)
      const m = d.getMonth(), y = d.getFullYear()
      const inc = invoices.filter(inv => inv.status === 'paid' && inMonth(inv, m, y)).reduce((s,inv) => s+(inv.amount||0), 0)
      months6.push({ label: MONTHS_SHORT[m], income: inc })
    }
    const maxInc = Math.max(...months6.map(m => m.income), 1)

    el.innerHTML = `
      <div class="rp-metrics-grid">

        <div class="rp-kpi-card rp-kpi--income">
          <div class="rp-kpi-icon">💰</div>
          <div class="rp-kpi-body">
            <div class="rp-kpi-label">Дохід цього місяця</div>
            <div class="rp-kpi-value">₴${incomeThis.toLocaleString('uk-UA')}</div>
            <div class="rp-kpi-diff" style="color:${pctColor(incomeThis,incomePrev)}">
              ${pctDiff(incomeThis,incomePrev)} vs минулий місяць
              ${incomePrev ? `<span style="color:var(--text-muted)"> (₴${incomePrev.toLocaleString('uk-UA')})</span>` : ''}
            </div>
          </div>
        </div>

        <div class="rp-kpi-card rp-kpi--unpaid">
          <div class="rp-kpi-icon">⏳</div>
          <div class="rp-kpi-body">
            <div class="rp-kpi-label">Неоплачені рахунки</div>
            <div class="rp-kpi-value">₴${unpaidAmt.toLocaleString('uk-UA')}</div>
            <div class="rp-kpi-diff" style="color:${unpaidCount > 0 ? '#FBBF24' : '#34D399'}">
              ${unpaidCount} рахунків чекають оплати
            </div>
          </div>
        </div>

        <div class="rp-kpi-card rp-kpi--clients">
          <div class="rp-kpi-icon">👥</div>
          <div class="rp-kpi-body">
            <div class="rp-kpi-label">Активні клієнти</div>
            <div class="rp-kpi-value">${activeClients}</div>
            <div class="rp-kpi-diff" style="color:var(--text-muted)">
              з ${totalClients} загальних
            </div>
          </div>
        </div>

        <div class="rp-kpi-card rp-kpi--tasks">
          <div class="rp-kpi-icon">✅</div>
          <div class="rp-kpi-body">
            <div class="rp-kpi-label">Виконані задачі</div>
            <div class="rp-kpi-value">${doneThis}</div>
            <div class="rp-kpi-diff" style="color:${pctColor(doneThis,donePrev)}">
              ${pctDiff(doneThis,donePrev)} vs минулий місяць
              ${totalTasks ? `<span style="color:var(--text-muted)"> · ${totalTasks} всього</span>` : ''}
            </div>
          </div>
        </div>
      </div>

      <!-- Income chart -->
      <div class="rp-section-card">
        <div class="rp-section-head">
          <div class="rp-section-title">📊 Дохід за 6 місяців</div>
        </div>
        <div class="rp-chart-wrap">
          <canvas id="rp-income-canvas"></canvas>
        </div>
      </div>

      <!-- Tasks progress -->
      <div class="rp-section-card">
        <div class="rp-section-head">
          <div class="rp-section-title">✅ Задачі цього місяця</div>
        </div>
        <div class="rp-tasks-split">
          ${(() => {
            const byStatus = {
              new:         tasks.filter(t => t.status === 'new'         && taskInMonth(t, thisM, thisY)).length,
              in_progress: tasks.filter(t => t.status === 'in_progress' && taskInMonth(t, thisM, thisY)).length,
              done:        doneThis,
            }
            const total = Object.values(byStatus).reduce((a,b) => a+b, 0) || 1
            const rows = [
              { label: 'Нові',      count: byStatus.new,         color: '#94A3B8' },
              { label: 'В роботі',  count: byStatus.in_progress, color: '#FBBF24' },
              { label: 'Виконані',  count: byStatus.done,        color: '#34D399' },
            ]
            return `<div class="rp-progress-rows">
              ${rows.map(r => `
                <div class="rp-progress-row">
                  <div class="rp-progress-label-wrap">
                    <span class="rp-progress-dot" style="background:${r.color}"></span>
                    <span class="rp-progress-lbl">${r.label}</span>
                    <span class="rp-progress-cnt">${r.count}</span>
                  </div>
                  <div class="rp-progress-track">
                    <div class="rp-progress-fill" style="width:${Math.round(r.count/total*100)}%;background:${r.color}"></div>
                  </div>
                  <div class="rp-progress-pct">${Math.round(r.count/total*100)}%</div>
                </div>
              `).join('')}
            </div>`
          })()}
          <div class="rp-donut-wrap">
            <canvas id="rp-task-canvas"></canvas>
          </div>
        </div>
      </div>
    `

    const C = window.Chart
    if (C) {
      const incCanvas = el.querySelector('#rp-income-canvas')
      if (incCanvas) {
        new C(incCanvas, {
          type: 'bar',
          data: {
            labels: months6.map(m => m.label),
            datasets: [{
              data: months6.map(m => m.income),
              backgroundColor: months6.map((_, i) =>
                i === months6.length - 1 ? 'rgba(79,142,247,0.85)' : 'rgba(79,142,247,0.4)'),
              borderRadius: 8,
              borderSkipped: false,
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { label: c => '₴' + Number(c.raw).toLocaleString('uk-UA') } }
            },
            scales: {
              y: { beginAtZero: true, ticks: { color: '#6B7280', callback: v => v >= 1000 ? Math.round(v/1000) + 'к' : v }, grid: { color: 'rgba(255,255,255,0.06)' }, border: { display: false } },
              x: { ticks: { color: '#9CA3AF' }, grid: { display: false }, border: { display: false } }
            }
          }
        })
      }
      const taskCanvas = el.querySelector('#rp-task-canvas')
      if (taskCanvas) {
        const bySt = {
          new:         tasks.filter(t => t.status === 'new' && taskInMonth(t, thisM, thisY)).length,
          in_progress: tasks.filter(t => (t.status === 'in_progress' || t.status === 'in-progress') && taskInMonth(t, thisM, thisY)).length,
          done:        doneThis,
        }
        if (bySt.new + bySt.in_progress + bySt.done > 0) {
          new C(taskCanvas, {
            type: 'doughnut',
            data: {
              labels: ['Нові', 'В роботі', 'Виконані'],
              datasets: [{ data: [bySt.new, bySt.in_progress, bySt.done], backgroundColor: ['#94A3B8','#FBBF24','#34D399'], borderWidth: 0, hoverOffset: 4 }]
            },
            options: {
              cutout: '65%', responsive: true, maintainAspectRatio: false,
              plugins: { legend: { position: 'bottom', labels: { color: '#9CA3AF', padding: 10, font: { size: 11 }, boxWidth: 10 } } }
            }
          })
        }
      }
    }
  }

  // ══ TAB 2: ТОП КЛІЄНТИ ════════════════════════════════════
  function renderTopClients(el, invoices, clients) {
    const clientMap = {}
    clients.forEach(c => { clientMap[c.id] = c.name || c.id })

    const byClient = {}
    invoices.forEach(inv => {
      const cid   = inv.clientId || inv.client || '—'
      const name  = inv.clientName || clientMap[cid] || cid || 'Невідомий клієнт'
      if (!byClient[name]) byClient[name] = { name, paid: 0, total: 0, count: 0 }
      byClient[name].count++
      byClient[name].total += (inv.amount || 0)
      if (inv.status === 'paid') byClient[name].paid += (inv.amount || 0)
    })

    const sorted = Object.values(byClient).sort((a, b) => b.paid - a.paid)
    const maxPaid = sorted[0]?.paid || 1
    const totalPaid = sorted.reduce((s, c) => s + c.paid, 0) || 1

    if (!sorted.length) {
      el.innerHTML = `<div class="rp-empty"><div style="font-size:48px">📭</div><div>Рахунків ще немає</div></div>`
      return
    }

    el.innerHTML = `
      <div class="rp-section-card">
        <div class="rp-section-head">
          <div class="rp-section-title">👥 ТОП клієнти за доходом</div>
          <div class="rp-section-sub">Виплачені рахунки</div>
        </div>
        <div class="rp-client-list">
          ${sorted.map((c, i) => {
            const share = Math.round((c.paid / totalPaid) * 100)
            const barW  = Math.round((c.paid / maxPaid) * 100)
            const colors = ['#4F8EF7','#A78BFA','#34D399','#FBBF24','#F472B6','#FB923C','#38BDF8','#F87171']
            const col = colors[i % colors.length]
            return `
              <div class="rp-client-row">
                <div class="rp-client-rank" style="color:${i < 3 ? col : 'var(--text-muted)'}">
                  ${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`}
                </div>
                <div class="rp-client-avatar" style="background:${col}">
                  ${c.name[0]?.toUpperCase() || '?'}
                </div>
                <div class="rp-client-info">
                  <div class="rp-client-name">${c.name}</div>
                  <div class="rp-client-bar-wrap">
                    <div class="rp-client-bar" style="width:${barW}%;background:${col}"></div>
                  </div>
                </div>
                <div class="rp-client-stats">
                  <div class="rp-client-paid">₴${c.paid.toLocaleString('uk-UA')}</div>
                  <div class="rp-client-meta">${c.count} рах · ${share}%</div>
                </div>
              </div>`
          }).join('')}
        </div>
      </div>

      <div class="rp-metrics-grid rp-metrics-grid--2">
        <div class="rp-kpi-card">
          <div class="rp-kpi-icon">💰</div>
          <div class="rp-kpi-body">
            <div class="rp-kpi-label">Загальний дохід</div>
            <div class="rp-kpi-value">₴${totalPaid.toLocaleString('uk-UA')}</div>
            <div class="rp-kpi-diff" style="color:var(--text-muted)">${invoices.filter(i=>i.status==='paid').length} оплачених рахунків</div>
          </div>
        </div>
        <div class="rp-kpi-card">
          <div class="rp-kpi-icon">👤</div>
          <div class="rp-kpi-body">
            <div class="rp-kpi-label">Середній чек</div>
            <div class="rp-kpi-value">₴${Math.round(totalPaid / (invoices.filter(i=>i.status==='paid').length||1)).toLocaleString('uk-UA')}</div>
            <div class="rp-kpi-diff" style="color:var(--text-muted)">${sorted.length} клієнтів</div>
          </div>
        </div>
      </div>
    `
  }

  // ══ TAB 3: ЗАДАЧІ ════════════════════════════════════════
  function renderTasks(el, allTasks) {
    const now  = new Date()
    const periods = {
      week:  { label: 'Цей тиждень', from: new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()) },
      month: { label: 'Цей місяць',  from: new Date(now.getFullYear(), now.getMonth(), 1) },
      prev:  { label: 'Минулий місяць', from: new Date(now.getFullYear(), now.getMonth()-1, 1), to: new Date(now.getFullYear(), now.getMonth(), 0) },
      all:   { label: 'Весь час',    from: new Date(0) },
    }
    const p    = periods[taskPeriod]
    const from = p.from
    const to   = p.to || new Date(9999,0,1)

    const inPeriod = t => {
      const d = t.createdAt?.toDate?.() || null
      return d && d >= from && d <= to
    }

    const filtered = allTasks.filter(inPeriod)
    const done     = filtered.filter(t => t.status === 'done')
    const inProg   = filtered.filter(t => t.status === 'in_progress')
    const newTasks = filtered.filter(t => t.status === 'new')

    el.innerHTML = `
      <div class="rp-toolbar">
        ${Object.entries(periods).map(([id, p]) => `
          <button class="rp-period-btn ${taskPeriod === id ? 'active' : ''}" data-period="${id}">${p.label}</button>
        `).join('')}
      </div>

      <div class="rp-metrics-grid">
        <div class="rp-kpi-card">
          <div class="rp-kpi-icon">✅</div>
          <div class="rp-kpi-body">
            <div class="rp-kpi-label">Виконано</div>
            <div class="rp-kpi-value" style="color:#34D399">${done.length}</div>
            <div class="rp-kpi-diff" style="color:var(--text-muted)">${filtered.length ? Math.round(done.length/filtered.length*100) : 0}% від всіх</div>
          </div>
        </div>
        <div class="rp-kpi-card">
          <div class="rp-kpi-icon">🔄</div>
          <div class="rp-kpi-body">
            <div class="rp-kpi-label">В роботі</div>
            <div class="rp-kpi-value" style="color:#FBBF24">${inProg.length}</div>
          </div>
        </div>
        <div class="rp-kpi-card">
          <div class="rp-kpi-icon">📋</div>
          <div class="rp-kpi-body">
            <div class="rp-kpi-label">Нових</div>
            <div class="rp-kpi-value" style="color:#94A3B8">${newTasks.length}</div>
          </div>
        </div>
        <div class="rp-kpi-card">
          <div class="rp-kpi-icon">📦</div>
          <div class="rp-kpi-body">
            <div class="rp-kpi-label">Всього</div>
            <div class="rp-kpi-value">${filtered.length}</div>
          </div>
        </div>
      </div>

      <div class="rp-section-card">
        <div class="rp-section-head">
          <div class="rp-section-title">✅ Виконані задачі</div>
          <div class="rp-section-sub">${done.length} задач за період</div>
        </div>
        ${done.length === 0
          ? `<div class="rp-empty-inline">Немає виконаних задач за цей період</div>`
          : `<div class="rp-task-list">
              ${done.map(t => {
                const date = t.createdAt?.toDate?.()?.toLocaleDateString('uk-UA') || '—'
                const prio = { high: { color: '#F87171', label: 'Високий' }, medium: { color: '#FBBF24', label: 'Середній' }, low: { color: '#94A3B8', label: 'Низький' } }
                const p = prio[t.priority] || prio.medium
                return `
                  <div class="rp-task-row">
                    <span class="rp-task-check">✓</span>
                    <div class="rp-task-info">
                      <div class="rp-task-title">${t.title || '—'}</div>
                      ${t.clientName ? `<div class="rp-task-client">👤 ${t.clientName}</div>` : ''}
                    </div>
                    <div class="rp-task-right">
                      <span class="rp-task-prio" style="color:${p.color}">● ${p.label}</span>
                      <span class="rp-task-date">${date}</span>
                    </div>
                  </div>`
              }).join('')}
            </div>`
        }
      </div>
    `

    el.querySelectorAll('.rp-period-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        taskPeriod = btn.dataset.period
        renderTasks(el, allTasks)
      })
    })
  }

  // ══ TAB 4: ПОРІВНЯННЯ МІСЯЦІВ ══════════════════════════════
  function renderCompare(el, invoices) {
    const now = new Date()
    const months = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const m = d.getMonth(), y = d.getFullYear()
      const paid    = invoices.filter(inv => inv.status === 'paid' && inMonth(inv, m, y)).reduce((s,inv) => s+(inv.amount||0), 0)
      const pending = invoices.filter(inv => inv.status !== 'paid' && inMonth(inv, m, y)).reduce((s,inv) => s+(inv.amount||0), 0)
      const count   = invoices.filter(inv => inMonth(inv, m, y)).length
      months.push({ label: MONTHS_UK[m], short: MONTHS_SHORT[m], year: y, paid, pending, count })
    }

    function inMonth(inv, m, y) {
      const d = inv.createdAt?.toDate?.() || (inv.date ? new Date(inv.date) : null)
      return d && d.getMonth() === m && d.getFullYear() === y
    }

    const maxVal = Math.max(...months.map(m => m.paid + m.pending), 1)
    const current = months[months.length - 1]
    const previous = months[months.length - 2]
    const diff = current.paid - previous.paid
    const diffPct = previous.paid ? Math.round((diff / previous.paid) * 100) : 0

    el.innerHTML = `
      <div class="rp-compare-summary">
        <div class="rp-cs-card">
          <div class="rp-cs-label">Цей місяць</div>
          <div class="rp-cs-value">₴${current.paid.toLocaleString('uk-UA')}</div>
          <div class="rp-cs-sub">${current.label}</div>
        </div>
        <div class="rp-cs-arrow ${diff >= 0 ? 'rp-cs-arrow--up' : 'rp-cs-arrow--down'}">
          ${diff >= 0 ? '↑' : '↓'} ${Math.abs(diffPct)}%
        </div>
        <div class="rp-cs-card">
          <div class="rp-cs-label">Минулий місяць</div>
          <div class="rp-cs-value">₴${previous.paid.toLocaleString('uk-UA')}</div>
          <div class="rp-cs-sub">${previous.label}</div>
        </div>
      </div>

      <div class="rp-section-card">
        <div class="rp-section-head">
          <div class="rp-section-title">📊 Доходи по місяцях</div>
          <div class="rp-legend">
            <span class="rp-legend-dot" style="background:#34D399"></span> Оплачено
            <span class="rp-legend-dot" style="background:#FBBF24;margin-left:12px"></span> Очікується
          </div>
        </div>
        <div class="rp-chart-wrap" style="height:240px">
          <canvas id="rp-compare-canvas"></canvas>
        </div>
      </div>

      <div class="rp-section-card">
        <div class="rp-section-head">
          <div class="rp-section-title">📋 Деталі по місяцях</div>
        </div>
        <div class="rp-month-table">
          <div class="rp-mt-head">
            <span>Місяць</span>
            <span>Оплачено</span>
            <span>Очікується</span>
            <span>Рахунків</span>
            <span>Зміна</span>
          </div>
          ${months.map((m, i) => {
            const prev  = months[i - 1]
            const chg   = prev ? m.paid - prev.paid : null
            const chgPct = prev && prev.paid ? Math.round((chg / prev.paid) * 100) : null
            const isThisMonth = i === months.length - 1
            return `
              <div class="rp-mt-row ${isThisMonth ? 'rp-mt-row--current' : ''}">
                <span class="rp-mt-month">${m.label} ${m.year}</span>
                <span class="rp-mt-paid">₴${m.paid.toLocaleString('uk-UA')}</span>
                <span class="rp-mt-pending" style="color:#FBBF24">${m.pending > 0 ? '₴'+m.pending.toLocaleString('uk-UA') : '—'}</span>
                <span class="rp-mt-count">${m.count}</span>
                <span class="rp-mt-chg" style="color:${chg === null ? 'var(--text-muted)' : chg >= 0 ? '#34D399' : '#F87171'}">
                  ${chg === null ? '—' : (chg >= 0 ? '+' : '') + chgPct + '%'}
                </span>
              </div>`
          }).join('')}
        </div>
      </div>
    `

    const C = window.Chart
    if (C) {
      const compareCanvas = el.querySelector('#rp-compare-canvas')
      if (compareCanvas) {
        new C(compareCanvas, {
          type: 'bar',
          data: {
            labels: months.map(m => m.short),
            datasets: [
              { label: 'Оплачено',    data: months.map(m => m.paid),    backgroundColor: 'rgba(52,211,153,0.7)',  borderRadius: 6, borderSkipped: false },
              { label: 'Очікується',  data: months.map(m => m.pending), backgroundColor: 'rgba(251,191,36,0.5)', borderRadius: 6, borderSkipped: false }
            ]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { labels: { color: '#9CA3AF', padding: 16, font: { size: 12 } } },
              tooltip: { callbacks: { label: c => c.dataset.label + ': ₴' + Number(c.raw).toLocaleString('uk-UA') } }
            },
            scales: {
              y: { beginAtZero: true, ticks: { color: '#6B7280', callback: v => v >= 1000 ? Math.round(v/1000) + 'к' : v }, grid: { color: 'rgba(255,255,255,0.06)' }, border: { display: false } },
              x: { ticks: { color: '#9CA3AF' }, grid: { display: false }, border: { display: false } }
            }
          }
        })
      }
    }
  }

  loadTab()
}

// ── Styles ─────────────────────────────────────────────────
function injectStyles() {
  document.getElementById('reports-styles')?.remove()
  const s = document.createElement('style')
  s.id = 'reports-styles'
  s.textContent = `
    .rp-page    { padding: 28px 36px; max-width: 1100px; }
    .rp-header  { margin-bottom: 20px; }
    .rp-title   { font-family:var(--font-display); font-size:26px; font-weight:800; margin-bottom:4px; }
    .rp-sub     { font-size:13px; color:var(--text-muted); }

    .rp-tabs { display:flex; gap:4px; background:var(--bg-secondary); padding:4px; border-radius:var(--radius-md); border:1px solid var(--border); margin-bottom:24px; width:fit-content; }
    .rp-tab  { padding:8px 20px; border-radius:var(--radius-sm); font-size:13px; font-weight:600; color:var(--text-muted); cursor:pointer; border:none; background:none; transition:all .15s; white-space:nowrap; }
    .rp-tab:hover  { color:var(--text-primary); }
    .rp-tab.active { background:var(--bg-primary); color:var(--text-primary); box-shadow:0 1px 4px rgba(0,0,0,.4); }

    .rp-content { }

    .rp-loading { display:flex; align-items:center; justify-content:center; gap:12px; padding:80px; color:var(--text-muted); font-size:14px; }
    .rp-spinner { width:24px; height:24px; border:2.5px solid var(--border); border-top-color:var(--accent-blue); border-radius:50%; animation:rp-spin .7s linear infinite; flex-shrink:0; }
    @keyframes rp-spin { to{transform:rotate(360deg)} }

    .rp-empty { display:flex; flex-direction:column; align-items:center; gap:12px; padding:80px; color:var(--text-muted); text-align:center; font-size:14px; font-weight:600; }
    .rp-empty-inline { text-align:center; padding:24px; color:var(--text-muted); font-size:13px; }

    /* KPI cards */
    .rp-metrics-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:20px; }
    .rp-metrics-grid--2 { grid-template-columns:repeat(2,1fr); }
    @media (max-width:900px) { .rp-metrics-grid { grid-template-columns:repeat(2,1fr); } }

    .rp-kpi-card {
      background:var(--bg-secondary); border:1.5px solid var(--border);
      border-radius:var(--radius-xl); padding:18px 20px;
      display:flex; align-items:flex-start; gap:14px; transition:border-color .2s;
    }
    .rp-kpi-card:hover { border-color:rgba(255,255,255,.12); }
    .rp-kpi-icon  { font-size:28px; flex-shrink:0; }
    .rp-kpi-body  { flex:1; min-width:0; }
    .rp-kpi-label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--text-muted); margin-bottom:6px; }
    .rp-kpi-value { font-family:var(--font-display); font-size:26px; font-weight:800; line-height:1; margin-bottom:6px; }
    .rp-kpi-diff  { font-size:11px; font-weight:600; }

    /* Sections */
    .rp-section-card { background:var(--bg-secondary); border:1.5px solid var(--border); border-radius:var(--radius-xl); padding:20px 24px; margin-bottom:16px; }
    .rp-section-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:18px; gap:12px; flex-wrap:wrap; }
    .rp-section-title { font-size:15px; font-weight:700; }
    .rp-section-sub   { font-size:12px; color:var(--text-muted); }

    /* Chart.js wrappers */
    .rp-chart-wrap { position:relative; height:200px; padding:8px 0; }
    .rp-tasks-split { display:flex; gap:24px; padding:16px; align-items:center; }
    .rp-tasks-split .rp-progress-rows { flex:1; }
    .rp-donut-wrap { width:160px; height:160px; flex-shrink:0; position:relative; }

    /* Progress rows */
    .rp-progress-rows { display:flex; flex-direction:column; gap:12px; }
    .rp-progress-row  { display:flex; align-items:center; gap:12px; }
    .rp-progress-label-wrap { display:flex; align-items:center; gap:6px; width:120px; flex-shrink:0; }
    .rp-progress-dot  { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
    .rp-progress-lbl  { font-size:13px; font-weight:600; flex:1; }
    .rp-progress-cnt  { font-size:13px; font-weight:700; width:28px; text-align:right; }
    .rp-progress-track { flex:1; height:8px; background:var(--bg-tertiary); border-radius:4px; overflow:hidden; }
    .rp-progress-fill  { height:100%; border-radius:4px; transition:width .6s; }
    .rp-progress-pct   { font-size:12px; color:var(--text-muted); width:36px; text-align:right; flex-shrink:0; }

    /* Client list */
    .rp-client-list { display:flex; flex-direction:column; gap:10px; }
    .rp-client-row  { display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid var(--border); }
    .rp-client-row:last-child { border:none; }
    .rp-client-rank   { width:32px; font-size:18px; text-align:center; flex-shrink:0; }
    .rp-client-avatar { width:36px; height:36px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:800; color:#fff; flex-shrink:0; }
    .rp-client-info   { flex:1; min-width:0; }
    .rp-client-name   { font-size:14px; font-weight:700; margin-bottom:5px; }
    .rp-client-bar-wrap { height:4px; background:var(--bg-tertiary); border-radius:2px; overflow:hidden; }
    .rp-client-bar    { height:100%; border-radius:2px; transition:width .6s; }
    .rp-client-stats  { flex-shrink:0; text-align:right; }
    .rp-client-paid   { font-family:var(--font-mono,monospace); font-size:16px; font-weight:800; color:var(--accent-blue); }
    .rp-client-meta   { font-size:11px; color:var(--text-muted); margin-top:2px; }

    /* Toolbar */
    .rp-toolbar { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:18px; }
    .rp-period-btn {
      padding:6px 16px; border-radius:var(--radius-full); font-size:12px; font-weight:600;
      border:1.5px solid var(--border); background:var(--bg-secondary); color:var(--text-muted);
      cursor:pointer; transition:all .15s;
    }
    .rp-period-btn:hover  { border-color:var(--accent-blue); color:var(--text-primary); }
    .rp-period-btn.active { background:var(--accent-blue); border-color:var(--accent-blue); color:#fff; }

    /* Task list */
    .rp-task-list { display:flex; flex-direction:column; gap:0; }
    .rp-task-row  { display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid var(--border); }
    .rp-task-row:last-child { border:none; }
    .rp-task-check { width:22px; height:22px; border-radius:50%; background:rgba(52,211,153,.15); border:1.5px solid #34D399; color:#34D399; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:800; flex-shrink:0; }
    .rp-task-info  { flex:1; min-width:0; }
    .rp-task-title  { font-size:13px; font-weight:600; margin-bottom:2px; }
    .rp-task-client { font-size:11px; color:var(--text-muted); }
    .rp-task-right  { display:flex; flex-direction:column; align-items:flex-end; gap:3px; flex-shrink:0; }
    .rp-task-prio   { font-size:11px; font-weight:600; }
    .rp-task-date   { font-size:11px; color:var(--text-muted); }

    /* Compare */
    .rp-compare-summary { display:flex; align-items:center; justify-content:center; gap:24px; margin-bottom:20px; padding:24px; background:var(--bg-secondary); border:1.5px solid var(--border); border-radius:var(--radius-xl); }
    .rp-cs-card  { text-align:center; }
    .rp-cs-label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--text-muted); margin-bottom:8px; }
    .rp-cs-value { font-family:var(--font-display); font-size:32px; font-weight:800; }
    .rp-cs-sub   { font-size:12px; color:var(--text-muted); margin-top:4px; }
    .rp-cs-arrow { font-family:var(--font-display); font-size:28px; font-weight:800; padding:0 16px; }
    .rp-cs-arrow--up   { color:#34D399; }
    .rp-cs-arrow--down { color:#F87171; }

    /* Stacked chart */
    .rp-legend { display:flex; align-items:center; font-size:12px; color:var(--text-secondary); }
    .rp-legend-dot { width:10px; height:10px; border-radius:50%; display:inline-block; margin-right:5px; }
    .rp-stacked-chart { display:flex; align-items:flex-end; gap:12px; min-height:200px; padding-bottom:28px; }
    .rp-sc-col   { flex:1; display:flex; flex-direction:column; align-items:center; }
    .rp-sc-values { font-size:10px; color:var(--text-muted); margin-bottom:4px; height:16px; display:flex; align-items:center; }
    .rp-sc-val   { white-space:nowrap; }
    .rp-sc-bars  { display:flex; align-items:flex-end; gap:3px; width:100%; justify-content:center; }
    .rp-sc-bar   { width:22px; border-radius:4px 4px 0 0; min-height:0; transition:height .5s; }
    .rp-sc-bar--paid    { background:linear-gradient(180deg,#34D399,#10B981); }
    .rp-sc-bar--pending { background:linear-gradient(180deg,#FBBF24,#F59E0B); }
    .rp-sc-label { font-size:11px; color:var(--text-muted); margin-top:6px; font-weight:600; }

    /* Month table */
    .rp-month-table { display:flex; flex-direction:column; gap:0; }
    .rp-mt-head { display:grid; grid-template-columns:2fr 1.5fr 1.5fr 80px 80px; gap:8px; padding:8px 12px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:var(--text-muted); border-bottom:1px solid var(--border); }
    .rp-mt-row  { display:grid; grid-template-columns:2fr 1.5fr 1.5fr 80px 80px; gap:8px; padding:10px 12px; border-bottom:1px solid var(--border); font-size:13px; align-items:center; transition:background .15s; }
    .rp-mt-row:hover { background:var(--bg-tertiary); border-radius:var(--radius-sm); }
    .rp-mt-row:last-child { border:none; }
    .rp-mt-row--current { background:rgba(79,142,247,.05); }
    .rp-mt-month { font-weight:600; }
    .rp-mt-paid  { font-family:var(--font-mono,monospace); font-weight:700; color:#34D399; }
    .rp-mt-chg   { font-weight:700; font-size:12px; }
  `
  document.head.appendChild(s)
}
