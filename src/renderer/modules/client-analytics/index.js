// src/renderer/modules/client-analytics/index.js
import { getCurrentUser, getActivePathSegments } from '../../services/auth.js'
import { db } from '../../services/firebase.js'
import { collection, getDocs, orderBy, query } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

export async function render(container) {
  injectStyles()
  const user = getCurrentUser()
  const base = getActivePathSegments(user.uid)

  container.innerHTML = `
    <div class="ca-page">
      <div class="ca-header">
        <div>
          <h1 class="ca-title">Аналітика клієнтів</h1>
          <p class="ca-sub">Статистика, джерела та LTV вашої клієнтської бази</p>
        </div>
        <div class="ca-period-tabs" id="ca-period-tabs">
          <button class="ca-period-btn active" data-period="30">30 днів</button>
          <button class="ca-period-btn" data-period="90">3 місяці</button>
          <button class="ca-period-btn" data-period="365">Рік</button>
          <button class="ca-period-btn" data-period="0">Все</button>
        </div>
      </div>

      <div class="ca-kpi-row" id="ca-kpi-row">
        ${[0,1,2,3].map(() => `<div class="ca-kpi-card ca-shimmer-card"><div class="ca-shimmer"></div></div>`).join('')}
      </div>

      <div class="ca-body">
        <div class="ca-col-main">
          <!-- Growth chart -->
          <div class="ca-card">
            <div class="ca-card-head">
              <span class="ca-card-title">📈 Приріст клієнтів</span>
            </div>
            <div class="ca-chart-wrap" id="ca-growth-chart">
              <div class="ca-chart-loading"><div class="spinner"></div></div>
            </div>
          </div>

          <!-- Source breakdown -->
          <div class="ca-card">
            <div class="ca-card-head">
              <span class="ca-card-title">🔍 Джерела клієнтів</span>
            </div>
            <div id="ca-sources-body">
              <div class="ca-chart-loading"><div class="spinner"></div></div>
            </div>
          </div>
        </div>

        <div class="ca-col-side">
          <!-- Top clients by activity -->
          <div class="ca-card">
            <div class="ca-card-head">
              <span class="ca-card-title">🏆 Топ клієнти</span>
            </div>
            <div id="ca-top-clients">
              <div class="ca-chart-loading"><div class="spinner"></div></div>
            </div>
          </div>

          <!-- Status breakdown -->
          <div class="ca-card">
            <div class="ca-card-head">
              <span class="ca-card-title">📊 Статуси</span>
            </div>
            <div id="ca-status-body">
              <div class="ca-chart-loading"><div class="spinner"></div></div>
            </div>
          </div>

          <!-- Activity by weekday -->
          <div class="ca-card">
            <div class="ca-card-head">
              <span class="ca-card-title">📅 Активність по днях тижня</span>
            </div>
            <div class="ca-weekday-chart" id="ca-weekday-chart">
              <div class="ca-chart-loading"><div class="spinner"></div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `

  container.querySelectorAll('.ca-period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.ca-period-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      loadAndRender(container, base, parseInt(btn.dataset.period))
    })
  })

  await loadAndRender(container, base, 30)
}

async function loadAndRender(container, base, days) {
  const allClients = await loadClients(base)
  const filtered = days === 0 ? allClients : filterByDays(allClients, days)

  renderKPI(container, allClients, filtered, days)
  renderGrowthChart(container, allClients, days)
  renderSources(container, filtered)
  renderTopClients(container, allClients)
  renderStatuses(container, allClients)
  renderWeekdayChart(container, allClients)
}

async function loadClients(base) {
  try {
    const snap = await getDocs(query(collection(db, ...base, 'clients'), orderBy('createdAt', 'asc')))
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch { return [] }
}

function filterByDays(clients, days) {
  if (!days) return clients
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  return clients.filter(c => {
    const d = toDate(c.createdAt)
    return d && d >= cutoff
  })
}

function toDate(val) {
  if (!val) return null
  try { return val?.toDate ? val.toDate() : new Date(val) } catch { return null }
}

function renderKPI(container, all, filtered, days) {
  const row = container.querySelector('#ca-kpi-row')
  if (!row) return

  const total = all.length
  const newCount = filtered.length
  const active = all.filter(c => c.status === 'active').length
  const retention = total ? Math.round((active / total) * 100) : 0

  const prevCutoff = new Date()
  prevCutoff.setDate(prevCutoff.getDate() - (days * 2 || 60))
  const midCutoff = new Date()
  midCutoff.setDate(midCutoff.getDate() - (days || 30))
  const prev = days === 0 ? 0 : all.filter(c => {
    const d = toDate(c.createdAt)
    return d && d >= prevCutoff && d < midCutoff
  }).length
  const growth = prev > 0 ? Math.round(((newCount - prev) / prev) * 100) : newCount > 0 ? 100 : 0
  const growthLabel = growth >= 0 ? `+${growth}%` : `${growth}%`
  const growthColor = growth >= 0 ? '#34D399' : '#F87171'

  row.innerHTML = `
    <div class="ca-kpi-card" style="--cc:#4F8EF7">
      <div class="ca-kpi-icon">👥</div>
      <div class="ca-kpi-value">${total}</div>
      <div class="ca-kpi-label">Всього клієнтів</div>
    </div>
    <div class="ca-kpi-card" style="--cc:#34D399">
      <div class="ca-kpi-icon">✨</div>
      <div class="ca-kpi-value">${newCount}</div>
      <div class="ca-kpi-label">${days === 0 ? 'За весь час' : `За ${days} днів`}</div>
      <div class="ca-kpi-sub" style="color:${growthColor}">${days > 0 ? growthLabel + ' до пред. пер.' : ''}</div>
    </div>
    <div class="ca-kpi-card" style="--cc:#A78BFA">
      <div class="ca-kpi-icon">💚</div>
      <div class="ca-kpi-value">${active}</div>
      <div class="ca-kpi-label">Активних</div>
    </div>
    <div class="ca-kpi-card" style="--cc:#F59E0B">
      <div class="ca-kpi-icon">📊</div>
      <div class="ca-kpi-value">${retention}%</div>
      <div class="ca-kpi-label">Утримання</div>
    </div>
  `
}

function renderGrowthChart(container, clients, days) {
  const el = container.querySelector('#ca-growth-chart')
  if (!el) return

  if (!clients.length) {
    el.innerHTML = `<div class="ca-empty">Клієнтів ще немає</div>`
    return
  }

  const buckets = buildMonthBuckets(clients, days)
  if (!buckets.length) {
    el.innerHTML = `<div class="ca-empty">Немає даних за цей період</div>`
    return
  }
  const maxVal = Math.max(...buckets.map(b => b.count), 1)

  el.innerHTML = `
    <div class="ca-bar-chart">
      ${buckets.map(b => `
        <div class="ca-bar-col">
          <div class="ca-bar-val">${b.count > 0 ? b.count : ''}</div>
          <div class="ca-bar" style="height:${Math.max((b.count / maxVal) * 100, b.count > 0 ? 4 : 0)}%" title="${b.label}: ${b.count}"></div>
          <div class="ca-bar-lbl">${b.shortLabel}</div>
        </div>
      `).join('')}
    </div>
  `
}

function buildMonthBuckets(clients, days) {
  const now = new Date()
  const months = days === 0 ? 12 : days <= 30 ? Math.ceil(days / 7) : Math.ceil(days / 30)
  const useWeeks = days > 0 && days <= 30
  const buckets = []

  if (useWeeks) {
    for (let i = months - 1; i >= 0; i--) {
      const end = new Date(now)
      end.setDate(end.getDate() - i * 7)
      const start = new Date(end)
      start.setDate(start.getDate() - 7)
      const count = clients.filter(c => {
        const d = toDate(c.createdAt)
        return d && d >= start && d < end
      }).length
      buckets.push({ label: `Тиждень ${months - i}`, shortLabel: `Т${months - i}`, count })
    }
  } else {
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const nextD = new Date(d.getFullYear(), d.getMonth() + 1, 1)
      const count = clients.filter(c => {
        const cd = toDate(c.createdAt)
        return cd && cd >= d && cd < nextD
      }).length
      const MONTHS_SHORT = ['Січ','Лют','Бер','Кві','Тра','Чер','Лип','Сер','Вер','Жов','Лис','Гру']
      buckets.push({ label: MONTHS_SHORT[d.getMonth()] + ' ' + d.getFullYear(), shortLabel: MONTHS_SHORT[d.getMonth()], count })
    }
  }
  return buckets
}

function renderSources(container, clients) {
  const el = container.querySelector('#ca-sources-body')
  if (!el) return

  const SOURCES = { instagram: { label: 'Instagram', color: '#E879F9', icon: '📸' }, referral: { label: 'Рекомендація', color: '#34D399', icon: '🤝' }, website: { label: 'Сайт', color: '#4F8EF7', icon: '🌐' }, facebook: { label: 'Facebook', color: '#60A5FA', icon: '👥' }, telegram: { label: 'Telegram', color: '#38BDF8', icon: '✈️' }, google: { label: 'Google', color: '#F59E0B', icon: '🔍' }, other: { label: 'Інше', color: '#9CA3AF', icon: '📌' } }

  const counts = {}
  clients.forEach(c => {
    const src = (c.source || 'other').toLowerCase()
    const key = SOURCES[src] ? src : 'other'
    counts[key] = (counts[key] || 0) + 1
  })

  const total = clients.length || 1
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])

  if (!sorted.length) {
    el.innerHTML = `<div class="ca-empty">Немає даних про джерела</div>`
    return
  }

  el.innerHTML = `
    <div class="ca-sources-list">
      ${sorted.map(([key, count]) => {
        const s = SOURCES[key] || SOURCES.other
        const pct = Math.round((count / total) * 100)
        return `
          <div class="ca-source-row">
            <div class="ca-source-icon">${s.icon}</div>
            <div class="ca-source-info">
              <div class="ca-source-top">
                <span class="ca-source-label">${s.label}</span>
                <span class="ca-source-pct">${pct}%</span>
              </div>
              <div class="ca-source-bar-wrap">
                <div class="ca-source-bar" style="width:${pct}%;background:${s.color}"></div>
              </div>
            </div>
            <div class="ca-source-count">${count}</div>
          </div>
        `
      }).join('')}
    </div>
  `
}

function renderTopClients(container, clients) {
  const el = container.querySelector('#ca-top-clients')
  if (!el) return
  if (!clients.length) {
    el.innerHTML = `<div class="ca-empty">Клієнтів ще немає</div>`
    return
  }

  const sorted = [...clients]
    .sort((a, b) => (toDate(b.createdAt) || 0) - (toDate(a.createdAt) || 0))
    .slice(0, 5)

  const COLORS = ['#4F8EF7','#34D399','#A78BFA','#F59E0B','#F472B6']
  el.innerHTML = `
    <div class="ca-top-list">
      ${sorted.map((c, i) => {
        const initial = (c.name || '?')[0].toUpperCase()
        const d = toDate(c.createdAt)
        const dateStr = d ? d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' }) : ''
        return `
          <div class="ca-top-row">
            <div class="ca-top-rank">${i + 1}</div>
            <div class="ca-top-avatar" style="background:${COLORS[i % COLORS.length]}">${initial}</div>
            <div class="ca-top-info">
              <div class="ca-top-name">${c.name || '—'}</div>
              <div class="ca-top-meta">${c.phone || c.email || c.source || dateStr}</div>
            </div>
            <div class="ca-top-badge ca-badge-${c.status || 'unknown'}">${statusLabel(c.status)}</div>
          </div>
        `
      }).join('')}
    </div>
  `
}

function renderStatuses(container, clients) {
  const el = container.querySelector('#ca-status-body')
  if (!el) return

  const STATUS_META = {
    active:   { label: 'Активний',   color: '#34D399' },
    inactive: { label: 'Неактивний', color: '#6B7280' },
    lead:     { label: 'Лід',         color: '#F59E0B' },
    vip:      { label: 'VIP',         color: '#A78BFA' },
  }

  const counts = {}
  clients.forEach(c => { const s = c.status || 'inactive'; counts[s] = (counts[s] || 0) + 1 })
  const total = clients.length || 1

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
  el.innerHTML = `
    <div class="ca-status-list">
      ${sorted.map(([status, count]) => {
        const m = STATUS_META[status] || { label: status, color: '#9CA3AF' }
        const pct = Math.round((count / total) * 100)
        return `
          <div class="ca-status-row">
            <div class="ca-status-dot" style="background:${m.color}"></div>
            <div class="ca-status-label">${m.label}</div>
            <div class="ca-status-bar-wrap">
              <div class="ca-status-bar" style="width:${pct}%;background:${m.color}"></div>
            </div>
            <div class="ca-status-pct">${pct}%</div>
            <div class="ca-status-count">${count}</div>
          </div>
        `
      }).join('')}
    </div>
  `
}

function renderWeekdayChart(container, clients) {
  const el = container.querySelector('#ca-weekday-chart')
  if (!el) return

  const DAYS = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
  const counts = [0, 0, 0, 0, 0, 0, 0]
  clients.forEach(c => {
    const d = toDate(c.createdAt)
    if (d) counts[d.getDay()]++
  })
  const max = Math.max(...counts, 1)

  el.innerHTML = `
    <div class="ca-weekday-bars">
      ${counts.map((count, i) => `
        <div class="ca-wd-col">
          <div class="ca-wd-bar" style="height:${Math.max((count / max) * 80, count > 0 ? 4 : 2)}px" title="${DAYS[i]}: ${count}"></div>
          <div class="ca-wd-lbl">${DAYS[i]}</div>
        </div>
      `).join('')}
    </div>
  `
}

function statusLabel(s) {
  const MAP = { active: 'Активний', inactive: 'Неактивний', lead: 'Лід', vip: 'VIP' }
  return MAP[s] || s || '—'
}

function injectStyles() {
  document.getElementById('ca-styles')?.remove()
  const style = document.createElement('style')
  style.id = 'ca-styles'
  style.textContent = `
  .ca-page { padding: 28px 32px; max-width: 1200px; display: flex; flex-direction: column; gap: 22px; }

  .ca-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .ca-title { font-family: var(--font-display); font-size: 26px; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 6px; }
  .ca-sub { font-size: 13px; color: var(--text-secondary); margin: 0; }

  .ca-period-tabs { display: flex; gap: 4px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 4px; }
  .ca-period-btn { background: none; border: none; padding: 6px 14px; border-radius: var(--radius-md); font-size: 12px; font-weight: 600; cursor: pointer; color: var(--text-secondary); transition: all .15s; }
  .ca-period-btn.active { background: var(--accent-blue); color: #fff; }
  .ca-period-btn:not(.active):hover { background: var(--bg-tertiary); color: var(--text-primary); }

  .ca-kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
  .ca-kpi-card {
    background: var(--bg-secondary); border: 1px solid var(--border);
    border-radius: var(--radius-lg); padding: 20px 22px;
    border-left: 3px solid var(--cc, var(--accent-blue));
  }
  .ca-shimmer-card { min-height: 90px; }
  .ca-shimmer {
    height: 100%; border-radius: var(--radius-sm);
    background: linear-gradient(90deg, var(--bg-tertiary) 25%, var(--bg-elevated) 50%, var(--bg-tertiary) 75%);
    background-size: 200% 100%; animation: ca-sh 1.4s infinite;
  }
  @keyframes ca-sh { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
  .ca-kpi-icon  { font-size: 20px; margin-bottom: 10px; }
  .ca-kpi-value { font-family: var(--font-display); font-size: 30px; font-weight: 800; letter-spacing: -0.03em; color: var(--cc); line-height: 1; margin-bottom: 4px; }
  .ca-kpi-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--text-muted); }
  .ca-kpi-sub   { font-size: 11px; margin-top: 4px; font-weight: 600; }

  .ca-body { display: grid; grid-template-columns: 1fr 320px; gap: 18px; align-items: start; }
  @media (max-width: 900px) { .ca-body { grid-template-columns: 1fr; } .ca-kpi-row { grid-template-columns: repeat(2,1fr); } }

  .ca-col-main, .ca-col-side { display: flex; flex-direction: column; gap: 16px; }

  .ca-card {
    background: var(--bg-secondary); border: 1px solid var(--border);
    border-radius: var(--radius-lg); overflow: hidden;
  }
  .ca-card-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--border); }
  .ca-card-title { font-size: 13px; font-weight: 700; }
  .ca-chart-loading { display: flex; justify-content: center; padding: 32px; }
  .ca-empty { padding: 24px 18px; text-align: center; font-size: 13px; color: var(--text-muted); }
  .ca-chart-wrap { padding: 16px 18px; }

  /* Bar chart */
  .ca-bar-chart { display: flex; align-items: flex-end; gap: 6px; height: 140px; padding-bottom: 28px; position: relative; }
  .ca-bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; height: 100%; justify-content: flex-end; }
  .ca-bar-val { font-size: 10px; color: var(--text-muted); font-weight: 600; min-height: 14px; }
  .ca-bar { width: 100%; background: linear-gradient(180deg, #4F8EF7, #3B82F6); border-radius: 4px 4px 0 0; min-height: 2px; transition: height .4s; }
  .ca-bar-lbl { font-size: 10px; color: var(--text-muted); position: absolute; bottom: 0; white-space: nowrap; }

  /* Sources */
  .ca-sources-list { padding: 8px 18px 12px; display: flex; flex-direction: column; gap: 12px; }
  .ca-source-row { display: flex; align-items: center; gap: 10px; }
  .ca-source-icon { font-size: 18px; width: 28px; flex-shrink: 0; }
  .ca-source-info { flex: 1; min-width: 0; }
  .ca-source-top { display: flex; justify-content: space-between; margin-bottom: 4px; }
  .ca-source-label { font-size: 13px; font-weight: 600; }
  .ca-source-pct { font-size: 11px; color: var(--text-muted); font-weight: 700; }
  .ca-source-bar-wrap { height: 5px; background: var(--bg-tertiary); border-radius: 3px; overflow: hidden; }
  .ca-source-bar { height: 100%; border-radius: 3px; transition: width .5s; }
  .ca-source-count { font-size: 13px; font-weight: 700; width: 28px; text-align: right; color: var(--text-secondary); }

  /* Top clients */
  .ca-top-list { padding: 6px 0; }
  .ca-top-row { display: flex; align-items: center; gap: 10px; padding: 9px 18px; transition: background .15s; }
  .ca-top-row:hover { background: var(--bg-tertiary); }
  .ca-top-rank { font-size: 11px; font-weight: 800; color: var(--text-muted); width: 16px; flex-shrink: 0; }
  .ca-top-avatar {
    width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 700; color: #fff;
  }
  .ca-top-info { flex: 1; min-width: 0; }
  .ca-top-name { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ca-top-meta { font-size: 11px; color: var(--text-muted); }
  .ca-top-badge { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: var(--radius-full); white-space: nowrap; }
  .ca-badge-active   { background: rgba(52,211,153,.15); color: #34D399; }
  .ca-badge-lead     { background: rgba(245,158,11,.15);  color: #F59E0B; }
  .ca-badge-vip      { background: rgba(167,139,250,.15); color: #A78BFA; }
  .ca-badge-inactive, .ca-badge-unknown { background: rgba(107,114,128,.15); color: #9CA3AF; }

  /* Status chart */
  .ca-status-list { padding: 10px 18px 14px; display: flex; flex-direction: column; gap: 10px; }
  .ca-status-row { display: flex; align-items: center; gap: 8px; }
  .ca-status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .ca-status-label { font-size: 12px; font-weight: 600; width: 90px; flex-shrink: 0; }
  .ca-status-bar-wrap { flex: 1; height: 6px; background: var(--bg-tertiary); border-radius: 3px; overflow: hidden; }
  .ca-status-bar { height: 100%; border-radius: 3px; transition: width .5s; }
  .ca-status-pct { font-size: 11px; color: var(--text-muted); width: 32px; text-align: right; font-weight: 700; }
  .ca-status-count { font-size: 12px; font-weight: 700; width: 24px; text-align: right; }

  /* Weekday chart */
  .ca-weekday-bars { display: flex; align-items: flex-end; gap: 6px; padding: 14px 18px 8px; height: 100px; }
  .ca-wd-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 5px; justify-content: flex-end; }
  .ca-wd-bar { width: 100%; background: linear-gradient(180deg,#A78BFA,#8B5CF6); border-radius: 3px 3px 0 0; min-height: 2px; transition: height .4s; }
  .ca-wd-lbl { font-size: 10px; color: var(--text-muted); font-weight: 600; }
  `
  document.head.appendChild(style)
}
