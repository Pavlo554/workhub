// src/renderer/pages/profile/index.js
import { db } from '../../services/firebase.js'
import { getCurrentUser, getUserProfile, getActivePathSegments } from '../../services/auth.js'
import { getProfessionConfig } from '../../../core/profession-config.js'
import { navigate } from '../../../core/router.js'
import { icon } from '../../utils/icons.js'
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

export async function render(container) {
  injectStyles()
  const user = getCurrentUser()

  // Skeleton
  container.innerHTML = `
    <div class="pf-page">
      <div class="pf-header">
        <div class="pf-hdr-left">
          <div class="pf-avatar-skel pf-skel"></div>
          <div>
            <div class="pf-skel" style="width:220px;height:28px;border-radius:8px;margin-bottom:8px"></div>
            <div class="pf-skel" style="width:140px;height:16px;border-radius:6px"></div>
          </div>
        </div>
      </div>
      <div class="pf-kpi-row">
        ${[0,1,2,3].map(() => `<div class="pf-kpi-card pf-skel" style="height:100px"></div>`).join('')}
      </div>
      <div class="pf-charts-row">
        ${[0,1].map(() => `<div class="pf-chart-card pf-skel" style="height:240px"></div>`).join('')}
      </div>
    </div>
  `

  const [profile, stats] = await Promise.all([
    getUserProfile(user.uid),
    loadStats(user)
  ])

  const config = getProfessionConfig(profile?.profession)
  const profColor = config.color || '#4F8EF7'
  const name = profile?.name?.split(' ')[0] || 'Користувач'

  container.innerHTML = `
    <div class="pf-page">

      <!-- ── Header ── -->
      <div class="pf-header">
        <div class="pf-hdr-left">
          <div class="pf-avatar" style="background:linear-gradient(135deg,${profColor},${profColor}88)">
            ${(profile?.name || 'U')[0].toUpperCase()}
          </div>
          <div>
            <h1 class="pf-name">${getGreeting()}, ${name}!</h1>
            <div class="pf-meta">
              <span class="pf-biz">${profile?.businessName || 'Мій бізнес'}</span>
              <span class="pf-dot">·</span>
              <span>${config.label}</span>
              <span class="pf-dot">·</span>
              <span>${getTodayLabel()}</span>
            </div>
          </div>
        </div>
        <div class="pf-hdr-right">
          <button class="pf-hdr-btn" id="pf-btn-settings" title="Налаштування">${icon('settings', 14)} Налаштування</button>
          <button class="pf-hdr-btn pf-hdr-btn-primary" id="pf-btn-upgrade">
            ${profile?.plan === 'free' ? `${icon('upgrade', 14)} Оновити до PRO` : `${icon('gem', 14)} ${(profile?.plan||'').toUpperCase()}`}
          </button>
        </div>
      </div>

      <!-- ── KPI cards ── -->
      <div class="pf-kpi-row">
        <div class="pf-kpi-card" style="--kc:#4F8EF7">
          <div class="pf-kpi-icon" style="color:#4F8EF7">${icon('clients', 20)}</div>
          <div class="pf-kpi-val">${stats.totalClients}</div>
          <div class="pf-kpi-lbl">Всього клієнтів</div>
          ${stats.newClientsMonth > 0 ? `<div class="pf-kpi-sub pf-up">↗ +${stats.newClientsMonth} цього місяця</div>` : ''}
        </div>
        <div class="pf-kpi-card" style="--kc:#34D399">
          <div class="pf-kpi-icon" style="color:#34D399">${icon('finances', 20)}</div>
          <div class="pf-kpi-val">₴${fmtNum(stats.totalRevenue)}</div>
          <div class="pf-kpi-lbl">Загальний дохід</div>
          ${stats.monthRevenue > 0 ? `<div class="pf-kpi-sub pf-up">↗ ₴${fmtNum(stats.monthRevenue)} цього місяця</div>` : ''}
        </div>
        <div class="pf-kpi-card" style="--kc:#A78BFA">
          <div class="pf-kpi-icon" style="color:#A78BFA">${icon('invoices', 20)}</div>
          <div class="pf-kpi-val">${stats.totalInvoices}</div>
          <div class="pf-kpi-lbl">Рахунків створено</div>
          <div class="pf-kpi-sub">${stats.paidInvoices} оплачено</div>
        </div>
        <div class="pf-kpi-card" style="--kc:${stats.pendingInvoices > 0 ? '#F59E0B' : '#34D399'}">
          <div class="pf-kpi-icon" style="color:${stats.pendingInvoices > 0 ? '#F59E0B' : '#34D399'}">${stats.pendingInvoices > 0 ? icon('alert-triangle', 20) : icon('check-circle', 20)}</div>
          <div class="pf-kpi-val">${stats.pendingInvoices}</div>
          <div class="pf-kpi-lbl">Очікує оплати</div>
          <div class="pf-kpi-sub ${stats.pendingInvoices > 0 ? 'pf-warn' : 'pf-up'}">
            ${stats.pendingInvoices > 0 ? 'Потребує уваги' : 'Все оплачено'}
          </div>
        </div>
      </div>

      <!-- ── Charts ── -->
      <div class="pf-charts-row">
        <div class="pf-chart-card">
          <div class="pf-chart-hdr">
            <span class="pf-chart-title">${icon('client-analytics', 14)} Дохід за останні 7 днів</span>
            <span class="pf-chart-total">₴${fmtNum(stats.totalRevenue)}</span>
          </div>
          <div class="pf-chart-body" id="pf-rev-chart"></div>
          <div class="pf-chart-labels" id="pf-rev-labels"></div>
        </div>
        <div class="pf-chart-card">
          <div class="pf-chart-hdr">
            <span class="pf-chart-title">${icon('clients', 14)} Нові клієнти за 7 днів</span>
            <span class="pf-chart-total">+${stats.newClientsWeek} цього тижня</span>
          </div>
          <div class="pf-chart-body" id="pf-cli-chart"></div>
          <div class="pf-chart-labels" id="pf-cli-labels"></div>
        </div>
      </div>

      <!-- ── Bottom grid ── -->
      <div class="pf-bottom">

        <!-- Activity -->
        <div class="pf-section">
          <div class="pf-section-hdr">
            <span class="pf-section-title">${icon('timer', 14)} Остання активність</span>
            <button class="pf-link" data-route="invoices">Всі рахунки →</button>
          </div>
          ${stats.recentActivity.length > 0 ? stats.recentActivity.map(item => `
            <div class="pf-act-row">
              <div class="pf-act-icon ${item.status}">${icon('invoices', 14)}</div>
              <div class="pf-act-info">
                <div class="pf-act-text">${item.text}</div>
                <div class="pf-act-time">${item.timeAgo}</div>
              </div>
              ${item.amount ? `<div class="pf-act-amount ${item.status === 'paid' ? 'pf-green' : 'pf-yellow'}">₴${fmtNum(item.amount)}</div>` : ''}
            </div>
          `).join('') : '<div class="pf-empty">Активності ще немає</div>'}
        </div>

        <!-- Top clients -->
        <div class="pf-section">
          <div class="pf-section-hdr">
            <span class="pf-section-title">${icon('star', 14)} Топ клієнти</span>
            <button class="pf-link" data-route="clients">Всі клієнти →</button>
          </div>
          ${stats.topClients.length > 0 ? stats.topClients.map((c, i) => `
            <div class="pf-client-row">
              <div class="pf-rank" style="background:${['#F59E0B','#9CA3AF','#CD7F32','#4F8EF7','#A78BFA'][i]||'#4F8EF7'}">#${i+1}</div>
              <div class="pf-client-av" style="background:${strColor(c.name)}">${c.name[0].toUpperCase()}</div>
              <div class="pf-client-info">
                <div class="pf-client-name">${c.name}</div>
                <div class="pf-client-sub">${c.count} ${plural(c.count,'рахунок','рахунки','рахунків')}</div>
              </div>
              <div class="pf-client-amt">₴${fmtNum(c.total)}</div>
            </div>
          `).join('') : '<div class="pf-empty">Клієнтів з рахунками ще немає</div>'}
        </div>

        <!-- Profile info + plan -->
        <div class="pf-col-side">

          <div class="pf-section">
            <div class="pf-section-hdr"><span class="pf-section-title">${icon('user', 14)} Профіль</span></div>
            ${infoRow('mail',    'Email',   user.email)}
            ${infoRow('phone',   'Телефон', profile?.phone)}
            ${infoRow('map-pin', 'Місто',   profile?.city)}
            ${infoRow('globe',   'Сайт',    profile?.website)}
            <div class="pf-info-edit">
              <button class="pf-link" id="pf-btn-edit">${icon('pencil', 13)} Редагувати профіль</button>
            </div>
          </div>

          <div class="pf-section pf-plan-card">
            <div class="pf-section-hdr"><span class="pf-section-title">${icon('gem', 14)} Підписка</span></div>
            <div class="pf-plan-badge pf-plan-${profile?.plan || 'free'}">
              ${(profile?.plan || 'FREE').toUpperCase()}
            </div>
            ${profile?.subscriptionEnd ? `<div class="pf-plan-end">Діє до: <strong>${new Date(profile.subscriptionEnd).toLocaleDateString('uk-UA')}</strong></div>` : ''}
            <button class="pf-upgrade-btn" id="pf-btn-upgrade2">
              ${profile?.plan === 'free' ? `${icon('upgrade', 14)} Оновити до PRO` : `${icon('settings', 14)} Керувати підпискою`}
            </button>
          </div>

        </div>
      </div>

    </div>
  `

  // Charts
  renderBarChart('pf-rev-chart', 'pf-rev-labels', stats.revenueByDay, '#4F8EF7')
  renderBarChart('pf-cli-chart', 'pf-cli-labels', stats.clientsByDay, '#34D399')

  // Events
  container.querySelectorAll('.pf-link[data-route]').forEach(btn =>
    btn.addEventListener('click', () => navigate(btn.dataset.route))
  )
  container.querySelector('#pf-btn-settings')?.addEventListener('click', () => navigate('settings'))
  container.querySelector('#pf-btn-upgrade')?.addEventListener('click', () => navigate('subscribe'))
  container.querySelector('#pf-btn-upgrade2')?.addEventListener('click', () => navigate('subscribe'))
  container.querySelector('#pf-btn-edit')?.addEventListener('click', () => navigate('settings'))
}

// ── Bar chart (CSS-based, no canvas) ─────────────────────
function renderBarChart(bodyId, labelsId, data, color) {
  const bodyEl   = document.getElementById(bodyId)
  const labelsEl = document.getElementById(labelsId)
  if (!bodyEl || !labelsEl) return

  const max = Math.max(...data.map(d => d.value), 1)
  bodyEl.innerHTML = data.map(d => {
    const pct = Math.round((d.value / max) * 100)
    return `
      <div class="pf-bar-wrap" title="${d.value}">
        <div class="pf-bar-val">${d.value > 0 ? (d.value >= 1000 ? fmtNum(d.value) : d.value) : ''}</div>
        <div class="pf-bar" style="height:${Math.max(pct, d.value > 0 ? 4 : 1)}%;background:${color}"></div>
      </div>
    `
  }).join('')
  labelsEl.innerHTML = data.map(d => `<div class="pf-bar-lbl">${d.label}</div>`).join('')
}

// ── Data loader ───────────────────────────────────────────
async function loadStats(user) {
  const base = getActivePathSegments(user.uid)
  const now  = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const weekStart  = new Date(now); weekStart.setDate(now.getDate() - 6); weekStart.setHours(0,0,0,0)

  try {
    const [clientsSnap, invoicesSnap] = await Promise.all([
      getDocs(collection(db, ...base, 'clients')),
      getDocs(collection(db, ...base, 'invoices')),
    ])

    const clients  = clientsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    const invoices = invoicesSnap.docs.map(d => ({ id: d.id, ...d.data() }))

    // Clients
    const totalClients    = clients.length
    const newClientsMonth = clients.filter(c => toDate(c.createdAt) >= monthStart).length
    const newClientsWeek  = clients.filter(c => toDate(c.createdAt) >= weekStart).length

    // Invoices
    const totalInvoices  = invoices.length
    const paidInvoices   = invoices.filter(i => i.status === 'paid').length
    const pendingInvoices = invoices.filter(i => i.status === 'unpaid' || i.status === 'pending').length
    const totalRevenue   = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (Number(i.amount)||0), 0)
    const monthRevenue   = invoices.filter(i => i.status === 'paid' && toDate(i.createdAt) >= monthStart)
                                   .reduce((s, i) => s + (Number(i.amount)||0), 0)

    // Recent activity
    const recentActivity = [...invoices]
      .sort((a, b) => toDate(b.createdAt) - toDate(a.createdAt))
      .slice(0, 6)
      .map(inv => ({
        text:    `Рахунок для ${inv.clientName || inv.client || '—'}`,
        status:  inv.status || 'unpaid',
        amount:  inv.amount,
        timeAgo: timeAgo(toDate(inv.createdAt)),
      }))

    // Top clients by revenue
    const clientMap = {}
    invoices.filter(i => i.status === 'paid').forEach(inv => {
      const name = inv.clientName || inv.client || '—'
      if (!clientMap[name]) clientMap[name] = { name, total: 0, count: 0 }
      clientMap[name].total += Number(inv.amount) || 0
      clientMap[name].count++
    })
    const topClients = Object.values(clientMap).sort((a, b) => b.total - a.total).slice(0, 5)

    // Charts — last 7 days
    const revenueByDay = last7Days(invoices, d => d.status === 'paid' ? (Number(d.amount)||0) : 0)
    const clientsByDay = last7Days(clients,  () => 1, 'createdAt')

    return { totalClients, newClientsMonth, newClientsWeek, totalInvoices, paidInvoices, pendingInvoices, totalRevenue, monthRevenue, recentActivity, topClients, revenueByDay, clientsByDay }
  } catch (err) {
    console.error('Stats error:', err)
    const empty7 = Array.from({length:7}, (_,i) => {
      const d = new Date(); d.setDate(d.getDate() - (6-i))
      return { label: d.toLocaleDateString('uk-UA',{day:'2-digit',month:'2-digit'}), value: 0 }
    })
    return { totalClients:0, newClientsMonth:0, newClientsWeek:0, totalInvoices:0, paidInvoices:0, pendingInvoices:0, totalRevenue:0, monthRevenue:0, recentActivity:[], topClients:[], revenueByDay:empty7, clientsByDay:empty7 }
  }
}

function last7Days(items, getValue, dateField = 'createdAt') {
  return Array.from({length:7}, (_,i) => {
    const d = new Date(); d.setDate(d.getDate() - (6-i)); d.setHours(0,0,0,0)
    const next = new Date(d); next.setDate(d.getDate()+1)
    const value = items.filter(item => {
      const t = toDate(item[dateField])
      return t >= d && t < next
    }).reduce((s, item) => s + getValue(item), 0)
    return { label: d.toLocaleDateString('uk-UA',{day:'2-digit',month:'2-digit'}), value: Math.round(value) }
  })
}

// ── Helpers ───────────────────────────────────────────────
function toDate(val) {
  if (!val) return new Date(0)
  if (val?.toDate) return val.toDate()
  return new Date(val)
}

function timeAgo(date) {
  const diff = Date.now() - date.getTime()
  const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), d = Math.floor(diff / 86400000)
  if (d > 0) return `${d} дн. тому`
  if (h > 0) return `${h} год. тому`
  if (m > 0) return `${m} хв. тому`
  return 'Щойно'
}

function fmtNum(n) {
  const num = Number(n)
  if (isNaN(num)) return '0'
  if (num >= 1000000) return (num/1000000).toFixed(1).replace('.0','') + 'M'
  if (num >= 1000)    return (num/1000).toFixed(1).replace('.0','') + 'k'
  return num.toLocaleString('uk-UA')
}

function plural(n, one, few, many) {
  const m = n % 10, m2 = n % 100
  if (m === 1 && m2 !== 11) return one
  if (m >= 2 && m <= 4 && (m2 < 10 || m2 >= 20)) return few
  return many
}

function strColor(str) {
  const COLORS = ['#4F8EF7','#34D399','#A78BFA','#F59E0B','#F472B6','#38BDF8']
  let h = 0; for (const c of str) h = c.charCodeAt(0) + ((h<<5)-h)
  return COLORS[Math.abs(h) % COLORS.length]
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Доброго ранку'
  if (h < 17) return 'Доброго дня'
  if (h < 21) return 'Доброго вечора'
  return 'Добраніч'
}

function getTodayLabel() {
  return new Date().toLocaleDateString('uk-UA', { weekday:'long', day:'numeric', month:'long' })
}

function infoRow(iconName, label, val) {
  if (!val) return ''
  return `
    <div class="pf-info-row">
      <span class="pf-info-icon">${icon(iconName, 14)}</span>
      <div class="pf-info-body">
        <div class="pf-info-lbl">${label}</div>
        <div class="pf-info-val">${val}</div>
      </div>
    </div>
  `
}

// ── Styles ────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('pf-styles')) return
  const style = document.createElement('style')
  style.id = 'pf-styles'
  style.textContent = `
  .pf-page { padding:28px 32px; max-width:1300px; display:flex; flex-direction:column; gap:20px; }
  .pf-skel { background:var(--bg-tertiary); border-radius:var(--radius-md); animation:pf-pulse 1.4s infinite; }
  .pf-avatar-skel { width:64px; height:64px; border-radius:50%; }
  @keyframes pf-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

  /* ── Header ── */
  .pf-header {
    display:flex; align-items:center; justify-content:space-between; gap:16px;
  }
  .pf-hdr-left { display:flex; align-items:center; gap:18px; }
  .pf-avatar {
    width:60px; height:60px; border-radius:50%; flex-shrink:0;
    display:flex; align-items:center; justify-content:center;
    font-size:26px; font-weight:800; color:#fff;
  }
  .pf-name {
    font-family:var(--font-display); font-size:24px; font-weight:800;
    letter-spacing:-0.02em; margin-bottom:5px;
  }
  .pf-meta { display:flex; gap:6px; font-size:13px; color:var(--text-secondary); align-items:center; flex-wrap:wrap; }
  .pf-biz  { font-weight:600; color:var(--text-primary); }
  .pf-dot  { color:var(--text-muted); }

  .pf-hdr-right { display:flex; gap:8px; align-items:center; flex-shrink:0; }
  .pf-hdr-btn {
    padding:8px 16px; border-radius:var(--radius-md); font-size:13px; font-weight:600;
    border:1px solid var(--border); background:var(--bg-secondary); color:var(--text-primary);
    cursor:pointer; transition:all .15s;
  }
  .pf-hdr-btn:hover { border-color:var(--accent-blue); }
  .pf-hdr-btn-primary { background:var(--accent-blue); border-color:var(--accent-blue); color:#fff; }
  .pf-hdr-btn-primary:hover { filter:brightness(1.1); }

  /* ── KPI ── */
  .pf-kpi-row { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:14px; }
  .pf-kpi-card {
    background:var(--bg-secondary); border:1px solid var(--border);
    border-left:3px solid var(--kc,var(--accent-blue)); border-radius:var(--radius-lg);
    padding:18px 20px; transition:transform .15s, box-shadow .15s;
  }
  .pf-kpi-card:hover { transform:translateY(-2px); box-shadow:0 8px 24px rgba(0,0,0,.2); }
  .pf-kpi-icon { font-size:22px; margin-bottom:10px; }
  .pf-kpi-val  {
    font-family:var(--font-display); font-size:32px; font-weight:800;
    letter-spacing:-0.03em; color:var(--kc,var(--text-primary)); line-height:1; margin-bottom:4px;
  }
  .pf-kpi-lbl { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.06em; color:var(--text-muted); }
  .pf-kpi-sub { font-size:11px; margin-top:6px; }
  .pf-up   { color:#34D399; }
  .pf-warn { color:#F59E0B; }
  .pf-green { color:#34D399 !important; }
  .pf-yellow { color:#F59E0B !important; }

  /* ── Charts ── */
  .pf-charts-row { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  @media (max-width:900px) { .pf-charts-row { grid-template-columns:1fr; } }

  .pf-chart-card {
    background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-lg);
    padding:20px 22px;
  }
  .pf-chart-hdr   { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
  .pf-chart-title { font-size:14px; font-weight:700; }
  .pf-chart-total { font-family:var(--font-display); font-size:18px; font-weight:800; color:var(--text-secondary); }

  .pf-chart-body {
    display:flex; align-items:flex-end; gap:6px; height:120px;
    border-bottom:1px solid var(--border); padding-bottom:4px;
  }
  .pf-bar-wrap { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; position:relative; }
  .pf-bar-val  { font-size:9px; color:var(--text-muted); margin-bottom:2px; font-weight:600; text-align:center; }
  .pf-bar      { width:100%; border-radius:3px 3px 0 0; min-height:2px; transition:height .3s; }
  .pf-chart-labels { display:flex; gap:6px; margin-top:6px; }
  .pf-bar-lbl  { flex:1; text-align:center; font-size:10px; color:var(--text-muted); }

  /* ── Bottom ── */
  .pf-bottom { display:grid; grid-template-columns:1fr 1fr 320px; gap:16px; align-items:start; }
  @media (max-width:1100px) { .pf-bottom { grid-template-columns:1fr 1fr; } }
  @media (max-width:700px)  { .pf-bottom { grid-template-columns:1fr; } }

  .pf-col-side { display:flex; flex-direction:column; gap:16px; }

  .pf-section {
    background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-lg);
    padding:18px 20px;
  }
  .pf-section-hdr {
    display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;
  }
  .pf-section-title { font-size:14px; font-weight:700; }
  .pf-link {
    font-size:12px; color:var(--accent-blue); background:none; border:none;
    cursor:pointer; padding:0; font-weight:500;
  }
  .pf-link:hover { text-decoration:underline; }

  /* Activity */
  .pf-act-row {
    display:flex; align-items:center; gap:12px; padding:10px 0;
    border-bottom:1px solid var(--border);
  }
  .pf-act-row:last-child { border-bottom:none; }
  .pf-act-icon {
    width:34px; height:34px; border-radius:var(--radius-sm); flex-shrink:0;
    display:flex; align-items:center; justify-content:center; font-size:16px;
  }
  .pf-act-icon.paid    { background:rgba(52,211,153,.15); }
  .pf-act-icon.unpaid,
  .pf-act-icon.pending { background:rgba(245,158,11,.15); }
  .pf-act-info  { flex:1; min-width:0; }
  .pf-act-text  { font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .pf-act-time  { font-size:11px; color:var(--text-muted); margin-top:2px; }
  .pf-act-amount { font-size:14px; font-weight:700; white-space:nowrap; }

  /* Top clients */
  .pf-client-row {
    display:flex; align-items:center; gap:10px; padding:10px 0;
    border-bottom:1px solid var(--border);
  }
  .pf-client-row:last-child { border-bottom:none; }
  .pf-rank {
    width:22px; height:22px; border-radius:50%; flex-shrink:0;
    display:flex; align-items:center; justify-content:center;
    font-size:10px; font-weight:800; color:#fff;
  }
  .pf-client-av {
    width:36px; height:36px; border-radius:50%; flex-shrink:0;
    display:flex; align-items:center; justify-content:center;
    font-size:15px; font-weight:700; color:#fff;
  }
  .pf-client-info { flex:1; min-width:0; }
  .pf-client-name { font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .pf-client-sub  { font-size:11px; color:var(--text-muted); margin-top:1px; }
  .pf-client-amt  { font-size:14px; font-weight:700; white-space:nowrap; }

  /* Profile info */
  .pf-info-row {
    display:flex; gap:12px; align-items:center; padding:8px 0;
    border-bottom:1px solid var(--border);
  }
  .pf-info-row:last-of-type { border-bottom:none; }
  .pf-info-icon { font-size:16px; flex-shrink:0; width:22px; text-align:center; }
  .pf-info-lbl  { font-size:10px; text-transform:uppercase; letter-spacing:.05em; color:var(--text-muted); font-weight:600; }
  .pf-info-val  { font-size:13px; font-weight:600; margin-top:1px; }
  .pf-info-edit { padding-top:12px; }

  /* Plan */
  .pf-plan-badge {
    display:inline-block; padding:6px 18px; border-radius:var(--radius-full);
    font-size:13px; font-weight:800; letter-spacing:.06em; margin-bottom:10px;
  }
  .pf-plan-free     { background:rgba(156,163,175,.2); color:#9CA3AF; }
  .pf-plan-pro      { background:linear-gradient(135deg,#667eea,#4F8EF7); color:#fff; }
  .pf-plan-business { background:linear-gradient(135deg,#34D399,#10B981); color:#fff; }
  .pf-plan-end      { font-size:13px; color:var(--text-secondary); margin-bottom:14px; }
  .pf-upgrade-btn {
    width:100%; padding:11px; border-radius:var(--radius-md); border:none;
    background:linear-gradient(135deg,#667eea,#4F8EF7); color:#fff;
    font-weight:700; font-size:13px; cursor:pointer; transition:all .2s;
  }
  .pf-upgrade-btn:hover { filter:brightness(1.1); transform:translateY(-1px); box-shadow:0 6px 20px rgba(79,142,247,.35); }

  .pf-empty { padding:24px; text-align:center; font-size:13px; color:var(--text-muted); }
  `
  document.head.appendChild(style)
}
