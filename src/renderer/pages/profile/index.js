// src/renderer/pages/profile/index.js
import { db } from '../../services/firebase.js'
import { getCurrentUser, getUserProfile } from '../../services/auth.js'
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

// Простий кеш з TTL 60 секунд
const cache = { data: null, ts: 0 }
const CACHE_TTL = 60_000

export async function render(container) {
  const user = getCurrentUser()

  injectStyles()

  // Показуємо скелетон одразу — не чекаємо Firebase
  container.innerHTML = buildSkeleton()

  // Завантажуємо профіль і статистику паралельно
  const [profile, stats] = await Promise.all([
    getUserProfile(user.uid),
    loadStatistics(user.uid)
  ])

  // Підставляємо реальний контент
  container.innerHTML = `
    <div class="profile-analytics-page">
      
      <!-- Header -->
      <div class="analytics-header">
        <div class="header-user">
          <div class="user-avatar">
            ${(profile?.name || 'U')[0].toUpperCase()}
          </div>
          <div class="user-info">
            <h1 class="user-name">Привіт, ${profile?.name || 'Користувач'}! 👋</h1>
            <p class="user-subtitle">Ось ваша статистика за останній час</p>
          </div>
        </div>
        <div class="header-actions">
          <button class="btn-icon" id="btn-settings" title="Налаштування">
            ⚙️
          </button>
          <button class="btn-icon" id="btn-refresh" title="Оновити">
            🔄
          </button>
        </div>
      </div>

      <!-- Stats Cards -->
      <div class="stats-grid">
        
        <div class="stat-card card-blue">
          <div class="stat-icon">👥</div>
          <div class="stat-content">
            <div class="stat-value">${stats.totalClients}</div>
            <div class="stat-label">Всього клієнтів</div>
          </div>
          <div class="stat-trend ${stats.clientsGrowth >= 0 ? 'trend-up' : 'trend-down'}">
            ${stats.clientsGrowth >= 0 ? '↗' : '↘'} ${Math.abs(stats.clientsGrowth)}%
          </div>
        </div>

        <div class="stat-card card-green">
          <div class="stat-icon">💰</div>
          <div class="stat-content">
            <div class="stat-value">₴${stats.totalRevenue.toLocaleString('uk-UA')}</div>
            <div class="stat-label">Загальний дохід</div>
          </div>
          <div class="stat-trend ${stats.revenueGrowth >= 0 ? 'trend-up' : 'trend-down'}">
            ${stats.revenueGrowth >= 0 ? '↗' : '↘'} ${Math.abs(stats.revenueGrowth)}%
          </div>
        </div>

        <div class="stat-card card-purple">
          <div class="stat-icon">📄</div>
          <div class="stat-content">
            <div class="stat-value">${stats.totalInvoices}</div>
            <div class="stat-label">Рахунків створено</div>
          </div>
          <div class="stat-trend trend-neutral">
            За весь час
          </div>
        </div>

        <div class="stat-card card-orange">
          <div class="stat-icon">⏱️</div>
          <div class="stat-content">
            <div class="stat-value">${stats.pendingInvoices}</div>
            <div class="stat-label">Очікує оплати</div>
          </div>
          <div class="stat-trend trend-warning">
            ${stats.pendingInvoices > 0 ? 'Потребує уваги' : 'Все оплачено'}
          </div>
        </div>

      </div>

      <!-- Charts Row -->
      <div class="charts-row">
        
        <!-- Revenue Chart -->
        <div class="chart-card">
          <div class="chart-header">
            <h3 class="chart-title">📈 Дохід за місяць</h3>
            <select class="chart-period" id="revenue-period">
              <option value="7">7 днів</option>
              <option value="30" selected>30 днів</option>
              <option value="90">90 днів</option>
            </select>
          </div>
          <div class="chart-body">
            <canvas id="revenue-chart"></canvas>
          </div>
        </div>

        <!-- Clients Chart -->
        <div class="chart-card">
          <div class="chart-header">
            <h3 class="chart-title">👥 Нові клієнти</h3>
            <select class="chart-period" id="clients-period">
              <option value="7">7 днів</option>
              <option value="30" selected>30 днів</option>
              <option value="90">90 днів</option>
            </select>
          </div>
          <div class="chart-body">
            <canvas id="clients-chart"></canvas>
          </div>
        </div>

      </div>

      <!-- Activity Section -->
      <div class="activity-section">
        
        <!-- Recent Activity -->
        <div class="activity-card">
          <div class="activity-header">
            <h3 class="activity-title">🕐 Остання активність</h3>
            <a href="#/invoices" class="activity-link">Всі рахунки →</a>
          </div>
          <div class="activity-list">
            ${stats.recentActivity.length > 0 ? stats.recentActivity.map(item => `
              <div class="activity-item">
                <div class="activity-icon ${item.type}">${getActivityIcon(item.type)}</div>
                <div class="activity-content">
                  <div class="activity-text">${item.text}</div>
                  <div class="activity-time">${formatTimeAgo(item.date)}</div>
                </div>
                <div class="activity-amount">${item.amount ? '₴' + item.amount : ''}</div>
              </div>
            `).join('') : '<div class="empty-state">Поки немає активності</div>'}
          </div>
        </div>

        <!-- Top Clients -->
        <div class="top-clients-card">
          <div class="activity-header">
            <h3 class="activity-title">⭐ Топ клієнти</h3>
            <a href="#/clients" class="activity-link">Всі клієнти →</a>
          </div>
          <div class="clients-list">
            ${stats.topClients.length > 0 ? stats.topClients.map((client, idx) => `
              <div class="client-item">
                <div class="client-rank">#${idx + 1}</div>
                <div class="client-avatar">${client.name[0].toUpperCase()}</div>
                <div class="client-info">
                  <div class="client-name">${client.name}</div>
                  <div class="client-count">${client.invoiceCount} рахунків</div>
                </div>
                <div class="client-amount">₴${client.totalAmount.toLocaleString('uk-UA')}</div>
              </div>
            `).join('') : '<div class="empty-state">Поки немає клієнтів</div>'}
          </div>
        </div>

      </div>

      <!-- Account Info -->
      <div class="account-section">
        <div class="account-card">
          <div class="account-header">
            <h3 class="account-title">💎 Ваша підписка</h3>
          </div>
          <div class="account-body">
            <div class="subscription-info">
              <div class="subscription-plan">
                <div class="plan-badge plan-${profile?.plan || 'free'}">
                  ${(profile?.plan || 'free').toUpperCase()}
                </div>
                <div class="plan-status">
                  ${profile?.subscriptionStatus === 'active' ? '✓ Активна' : '○ Неактивна'}
                </div>
              </div>
              ${profile?.subscriptionEnd ? `
                <div class="subscription-end">
                  Діє до: <strong>${new Date(profile.subscriptionEnd).toLocaleDateString('uk-UA')}</strong>
                </div>
              ` : ''}
            </div>
            <button class="btn-upgrade" id="btn-upgrade">
              ${profile?.plan === 'free' ? '⭐ Оновити до PRO' : '📊 Керувати підпискою'}
            </button>
          </div>
        </div>

        <div class="account-card">
          <div class="account-header">
            <h3 class="account-title">👤 Профіль</h3>
          </div>
          <div class="account-body">
            <div class="profile-info-grid">
              <div class="profile-info-item">
                <div class="info-label">Email</div>
                <div class="info-value">${user.email}</div>
              </div>
              <div class="profile-info-item">
                <div class="info-label">Телефон</div>
                <div class="info-value">${profile?.phone || 'Не вказано'}</div>
              </div>
              <div class="profile-info-item">
                <div class="info-label">Місто</div>
                <div class="info-value">${profile?.city || 'Не вказано'}</div>
              </div>
              <div class="profile-info-item">
                <div class="info-label">Бізнес</div>
                <div class="info-value">${profile?.businessName || 'Не вказано'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  `

  attachEventListeners()
  renderCharts(stats)

  function attachEventListeners() {
    // Налаштування
    container.querySelector('#btn-settings')?.addEventListener('click', () => {
      window.router.navigate('/settings')
    })

    // Оновити
    container.querySelector('#btn-refresh')?.addEventListener('click', () => {
      location.reload()
    })

    // Оновити підписку
    container.querySelector('#btn-upgrade')?.addEventListener('click', () => {
      window.router.navigate('/subscribe')
    })
  }

  function renderCharts(stats) {
    // Простий bar chart для доходу
    renderSimpleChart('revenue-chart', stats.revenueByDay, '#4F8EF7')
    
    // Простий line chart для клієнтів
    renderSimpleChart('clients-chart', stats.clientsByDay, '#34D399')
  }

  function renderSimpleChart(canvasId, data, color) {
    const canvas = document.getElementById(canvasId)
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const width = canvas.width = canvas.offsetWidth * 2
    const height = canvas.height = canvas.offsetHeight * 2
    ctx.scale(2, 2)

    const maxValue = Math.max(...data.map(d => d.value), 1)
    const barWidth = (width / 2) / data.length - 10
    const chartHeight = height / 2 - 60

    // Малюємо bars
    data.forEach((item, idx) => {
      const barHeight = (item.value / maxValue) * chartHeight
      const x = idx * (barWidth + 10) + 20
      const y = chartHeight - barHeight + 20

      // Gradient
      const gradient = ctx.createLinearGradient(0, y, 0, chartHeight + 20)
      gradient.addColorStop(0, color)
      gradient.addColorStop(1, color + '44')

      ctx.fillStyle = gradient
      ctx.fillRect(x, y, barWidth, barHeight)

      // Label
      ctx.fillStyle = '#9CA3AF'
      ctx.font = '10px Inter'
      ctx.textAlign = 'center'
      ctx.fillText(item.label, x + barWidth / 2, chartHeight + 40)

      // Value
      if (item.value > 0) {
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 11px Inter'
        ctx.fillText(item.value, x + barWidth / 2, y - 5)
      }
    })
  }
}

async function loadStatistics(userId) {
  // Повертаємо кешовані дані якщо вони ще свіжі
  if (cache.data && Date.now() - cache.ts < CACHE_TTL) {
    return cache.data
  }

  try {
    // Завантажуємо клієнтів і рахунки паралельно
    const [clientsSnapshot, invoicesSnapshot] = await Promise.all([
      getDocs(collection(db, 'users', userId, 'clients')),
      getDocs(collection(db, 'users', userId, 'invoices'))
    ])
    const totalClients = clientsSnapshot.size
    const invoices = invoicesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    
    const totalInvoices = invoices.length
    const totalRevenue = invoices.reduce((sum, inv) => sum + (inv.amount || 0), 0)
    const pendingInvoices = invoices.filter(inv => inv.status === 'pending').length

    // Остання активність (останні 5 рахунків)
    const recentActivity = invoices
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5)
      .map(inv => ({
        type: inv.status || 'pending',
        text: `Рахунок для ${inv.client}`,
        amount: inv.amount,
        date: inv.date
      }))

    // Топ клієнти
    const clientStats = {}
    invoices.forEach(inv => {
      if (!clientStats[inv.client]) {
        clientStats[inv.client] = { name: inv.client, invoiceCount: 0, totalAmount: 0 }
      }
      clientStats[inv.client].invoiceCount++
      clientStats[inv.client].totalAmount += inv.amount || 0
    })
    
    const topClients = Object.values(clientStats)
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 5)

    // Дані для графіків (останні 7 днів)
    const revenueByDay = getLast7DaysData(invoices, 'amount')
    const clientsByDay = getLast7DaysClients(clientsSnapshot.docs)

    const result = {
      totalClients,
      totalInvoices,
      totalRevenue,
      pendingInvoices,
      clientsGrowth: Math.floor(Math.random() * 20), // Mock
      revenueGrowth: Math.floor(Math.random() * 30), // Mock
      recentActivity,
      topClients,
      revenueByDay,
      clientsByDay
    }

    cache.data = result
    cache.ts = Date.now()
    return result
  } catch (err) {
    console.error('Error loading stats:', err)
    return {
      totalClients: 0,
      totalInvoices: 0,
      totalRevenue: 0,
      pendingInvoices: 0,
      clientsGrowth: 0,
      revenueGrowth: 0,
      recentActivity: [],
      topClients: [],
      revenueByDay: Array(7).fill(0).map((_, i) => ({ label: `День ${i+1}`, value: 0 })),
      clientsByDay: Array(7).fill(0).map((_, i) => ({ label: `День ${i+1}`, value: 0 }))
    }
  }
}

function getLast7DaysData(invoices, field) {
  const days = []
  const today = new Date()
  
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().split('T')[0]
    
    const dayInvoices = invoices.filter(inv => inv.date?.startsWith(dateStr))
    const value = dayInvoices.reduce((sum, inv) => sum + (inv[field] || 0), 0)
    
    days.push({
      label: date.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' }),
      value: field === 'amount' ? Math.round(value) : dayInvoices.length
    })
  }
  
  return days
}

function getLast7DaysClients(clients) {
  const days = []
  const today = new Date()
  
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().split('T')[0]
    
    const count = clients.filter(doc => {
      const data = doc.data()
      return data.createdAt?.toDate().toISOString().startsWith(dateStr)
    }).length
    
    days.push({
      label: date.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' }),
      value: count
    })
  }
  
  return days
}

function buildSkeleton() {
  return `
    <div class="profile-analytics-page">
      <div class="analytics-header">
        <div class="header-user">
          <div class="skel skel-circle" style="width:64px;height:64px"></div>
          <div>
            <div class="skel skel-line" style="width:220px;height:28px;margin-bottom:8px"></div>
            <div class="skel skel-line" style="width:160px;height:16px"></div>
          </div>
        </div>
      </div>
      <div class="stats-grid">
        ${Array(4).fill('<div class="stat-card"><div class="skel skel-block" style="height:110px"></div></div>').join('')}
      </div>
      <div class="charts-row">
        ${Array(2).fill('<div class="chart-card"><div class="skel skel-block" style="height:260px"></div></div>').join('')}
      </div>
    </div>
  `
}

function getActivityIcon(type) {
  const icons = {
    paid: '✓',
    pending: '⏱',
    cancelled: '✗'
  }
  return icons[type] || '📄'
}

function formatTimeAgo(dateStr) {
  if (!dateStr) return 'Невідомо'
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now - date
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const minutes = Math.floor(diff / (1000 * 60))
  
  if (days > 0) return `${days} дн. тому`
  if (hours > 0) return `${hours} год. тому`
  if (minutes > 0) return `${minutes} хв. тому`
  return 'Щойно'
}

function injectStyles() {
  if (document.getElementById('profile-analytics-styles')) return
  const style = document.createElement('style')
  style.id = 'profile-analytics-styles'
  style.textContent = `
    /* Skeleton */
    .skel { background: var(--bg-tertiary); border-radius: var(--radius-md); animation: skel-pulse 1.4s ease-in-out infinite; }
    .skel-circle { border-radius: 50%; }
    .skel-line { display: block; }
    .skel-block { display: block; border-radius: var(--radius-lg); }
    @keyframes skel-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

    .profile-analytics-page { padding: 32px 36px; max-width: 1400px; margin: 0 auto; }

    /* Header */
    .analytics-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 32px; }
    .header-user { display: flex; align-items: center; gap: 20px; }
    .user-avatar { width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 800; color: #fff; }
    .user-name { font-family: var(--font-display); font-size: 32px; font-weight: 800; margin-bottom: 4px; }
    .user-subtitle { font-size: 16px; color: var(--text-secondary); }
    .header-actions { display: flex; gap: 12px; }
    .btn-icon { width: 44px; height: 44px; border-radius: var(--radius-md); background: var(--bg-secondary); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 20px; cursor: pointer; transition: all .2s; }
    .btn-icon:hover { border-color: var(--accent-blue); transform: translateY(-2px); }

    /* Stats Grid */
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 32px; }
    .stat-card { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 24px; position: relative; overflow: hidden; transition: all .3s; }
    .stat-card:hover { transform: translateY(-4px); box-shadow: var(--shadow-lg); }
    .stat-card::before { content: ''; position: absolute; top: 0; right: 0; width: 100px; height: 100px; border-radius: 50%; opacity: 0.1; }
    .card-blue::before { background: #4F8EF7; }
    .card-green::before { background: #34D399; }
    .card-purple::before { background: #A78BFA; }
    .card-orange::before { background: #F59E0B; }
    
    .stat-icon { font-size: 32px; margin-bottom: 12px; }
    .stat-value { font-family: var(--font-display); font-size: 36px; font-weight: 900; margin-bottom: 4px; }
    .stat-label { font-size: 13px; color: var(--text-secondary); margin-bottom: 12px; }
    .stat-trend { font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: var(--radius-sm); display: inline-block; }
    .trend-up { background: rgba(52,211,153,0.2); color: #34D399; }
    .trend-down { background: rgba(239,68,68,0.2); color: #EF4444; }
    .trend-neutral { background: rgba(156,163,175,0.2); color: #9CA3AF; }
    .trend-warning { background: rgba(245,158,11,0.2); color: #F59E0B; }

    /* Charts */
    .charts-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px; margin-bottom: 32px; }
    .chart-card { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 24px; }
    .chart-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
    .chart-title { font-family: var(--font-display); font-size: 18px; font-weight: 700; }
    .chart-period { padding: 6px 12px; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 12px; cursor: pointer; }
    .chart-body { height: 200px; }
    .chart-body canvas { width: 100%; height: 100%; }

    /* Activity */
    .activity-section { display: grid; grid-template-columns: 1.5fr 1fr; gap: 20px; margin-bottom: 32px; }
    .activity-card, .top-clients-card { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 24px; }
    .activity-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
    .activity-title { font-family: var(--font-display); font-size: 18px; font-weight: 700; }
    .activity-link { font-size: 13px; color: var(--accent-blue); font-weight: 600; text-decoration: none; }
    .activity-link:hover { text-decoration: underline; }

    .activity-list { display: flex; flex-direction: column; gap: 12px; }
    .activity-item { display: flex; align-items: center; gap: 12px; padding: 12px; background: var(--bg-tertiary); border-radius: var(--radius-md); }
    .activity-icon { width: 36px; height: 36px; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
    .activity-icon.paid { background: rgba(52,211,153,0.2); }
    .activity-icon.pending { background: rgba(245,158,11,0.2); }
    .activity-icon.cancelled { background: rgba(239,68,68,0.2); }
    .activity-content { flex: 1; }
    .activity-text { font-size: 14px; font-weight: 600; margin-bottom: 2px; }
    .activity-time { font-size: 12px; color: var(--text-secondary); }
    .activity-amount { font-weight: 700; font-size: 15px; }

    .clients-list { display: flex; flex-direction: column; gap: 12px; }
    .client-item { display: flex; align-items: center; gap: 12px; padding: 12px; background: var(--bg-tertiary); border-radius: var(--radius-md); }
    .client-rank { width: 24px; height: 24px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #4F8EF7 100%); color: #fff; font-size: 11px; font-weight: 800; display: flex; align-items: center; justify-content: center; }
    .client-avatar { width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #A78BFA 0%, #8B5CF6 100%); color: #fff; font-size: 16px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
    .client-info { flex: 1; }
    .client-name { font-size: 14px; font-weight: 600; margin-bottom: 2px; }
    .client-count { font-size: 12px; color: var(--text-secondary); }
    .client-amount { font-weight: 700; font-size: 15px; }

    .empty-state { text-align: center; padding: 40px 20px; color: var(--text-muted); font-size: 14px; }

    /* Account */
    .account-section { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .account-card { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 24px; }
    .account-header { margin-bottom: 20px; }
    .account-title { font-family: var(--font-display); font-size: 18px; font-weight: 700; }
    
    .subscription-info { margin-bottom: 20px; }
    .subscription-plan { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
    .plan-badge { padding: 6px 16px; border-radius: var(--radius-full); font-size: 12px; font-weight: 800; letter-spacing: 0.05em; }
    .plan-free { background: rgba(156,163,175,0.2); color: #9CA3AF; }
    .plan-pro { background: linear-gradient(135deg, #667eea 0%, #4F8EF7 100%); color: #fff; }
    .plan-business { background: linear-gradient(135deg, #34D399 0%, #10B981 100%); color: #fff; }
    .plan-status { font-size: 13px; color: var(--text-secondary); }
    .subscription-end { font-size: 14px; color: var(--text-secondary); }

    .btn-upgrade { width: 100%; padding: 12px; background: linear-gradient(135deg, #667eea 0%, #4F8EF7 100%); border: none; border-radius: var(--radius-md); color: #fff; font-weight: 700; font-size: 14px; cursor: pointer; transition: all .3s; }
    .btn-upgrade:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(79,142,247,0.4); }

    .profile-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .profile-info-item { }
    .info-label { font-size: 12px; color: var(--text-muted); margin-bottom: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
    .info-value { font-size: 14px; font-weight: 600; }

    @media (max-width: 1024px) {
      .activity-section { grid-template-columns: 1fr; }
      .account-section { grid-template-columns: 1fr; }
      .charts-row { grid-template-columns: 1fr; }
    }
  `
  document.head.appendChild(style)
}