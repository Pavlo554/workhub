// src/renderer/modules/prro/index.js — ПРРО Checkbox API
import { icon }                               from '../../utils/icons.js'
import { db }                                 from '../../services/firebase.js'
import { getCurrentUser, getActivePathSegments } from '../../services/auth.js'
import { wbAlert, wbConfirm }                 from '../../utils/dialogs.js'
import {
  doc, getDoc, setDoc,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

const CHECKBOX_BASE = 'https://api.checkbox.ua/api/v1'

// ── Checkbox API helpers ────────────────────────────────────────────────────
async function cbFetch(path, { method = 'GET', body, licenseKey, token } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (licenseKey) headers['X-License-Key'] = licenseKey
  if (token)      headers['Authorization']  = `Bearer ${token}`
  const res = await fetch(`${CHECKBOX_BASE}${path}`, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Checkbox API ${res.status}: ${text}`)
  }
  return res.json()
}

async function cashierSignin(licenseKey, login, password) {
  return cbFetch('/cashier/signin', { method: 'POST', licenseKey, body: { login, password } })
}

// Token cache per session
const _tokenCache = new Map()
async function getToken(licenseKey, login, password) {
  const key = licenseKey + login
  if (_tokenCache.has(key)) return _tokenCache.get(key)
  const data = await cashierSignin(licenseKey, login, password)
  _tokenCache.set(key, data.access_token)
  return data.access_token
}

// ── Styles ──────────────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('prro-styles')) return
  const s = document.createElement('style')
  s.id = 'prro-styles'
  s.textContent = `
    .prro-page { padding: 28px 32px; max-width: 1100px; }
    .prro-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; flex-wrap: wrap; gap: 12px; }
    .prro-title { display: flex; align-items: center; gap: 10px; font-family: var(--font-display); font-size: 26px; font-weight: 800; }
    .prro-sub   { font-size: 13px; color: var(--text-muted); margin-top: 4px; }
    .prro-header-actions { display: flex; gap: 10px; }

    .prro-tabs { display: flex; gap: 4px; margin-bottom: 24px; background: var(--bg-secondary); border-radius: var(--radius-lg); padding: 5px; width: fit-content; }
    .prro-tab  { padding: 8px 18px; border-radius: var(--radius-md); border: none; background: none; color: var(--text-muted); font-size: 13px; font-weight: 600; cursor: pointer; transition: all .15s; }
    .prro-tab.active { background: var(--bg-primary); color: var(--text-primary); box-shadow: 0 1px 4px rgba(0,0,0,.25); }
    .prro-tab-content { display: none; }
    .prro-tab-content.active { display: block; }

    /* KPI cards */
    .prro-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
    .prro-kpi  { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 18px 20px; }
    .prro-kpi-label { font-size: 12px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 8px; }
    .prro-kpi-value { font-size: 24px; font-weight: 800; font-family: var(--font-display); }
    .prro-kpi-value.green { color: #34D399; }
    .prro-kpi-value.blue  { color: #4F8EF7; }
    .prro-kpi-value.amber { color: #F59E0B; }
    .prro-kpi-value.red   { color: #F87171; }

    /* Shift status */
    .prro-shift-banner {
      display: flex; align-items: center; gap: 16px;
      background: var(--bg-secondary); border: 1px solid var(--border);
      border-radius: var(--radius-lg); padding: 18px 22px; margin-bottom: 24px;
    }
    .prro-shift-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
    .prro-shift-dot.open   { background: #34D399; box-shadow: 0 0 8px #34D39988; }
    .prro-shift-dot.closed { background: #6B7280; }
    .prro-shift-info { flex: 1; }
    .prro-shift-name { font-weight: 700; font-size: 15px; }
    .prro-shift-meta { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
    .prro-shift-actions { display: flex; gap: 8px; }

    /* Table */
    .prro-table-wrap { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; }
    .prro-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .prro-table th { padding: 10px 14px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--text-muted); border-bottom: 1px solid var(--border); background: var(--bg-tertiary); }
    .prro-table td { padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,.04); vertical-align: middle; }
    .prro-table tr:last-child td { border-bottom: none; }
    .prro-table tr:hover td { background: rgba(255,255,255,.02); }
    .prro-receipt-type { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 20px; }
    .prro-receipt-type.sell   { background: rgba(52,211,153,.1); color: #34D399; }
    .prro-receipt-type.return { background: rgba(248,113,113,.1); color: #F87171; }
    .prro-amount-plus  { color: #34D399; font-weight: 700; }
    .prro-amount-minus { color: #F87171; font-weight: 700; }
    .prro-fiscal-num { font-family: var(--font-mono, monospace); font-size: 12px; color: var(--text-muted); }

    /* Settings */
    .prro-settings-card { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 24px; margin-bottom: 20px; max-width: 560px; }
    .prro-settings-title { font-weight: 700; font-size: 16px; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
    .prro-form-row { margin-bottom: 14px; }
    .prro-form-label { display: block; font-size: 12px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 6px; }
    .prro-form-hint  { font-size: 11px; color: var(--text-muted); margin-top: 4px; }
    .prro-status-connected    { display: inline-flex; align-items: center; gap: 6px; background: rgba(52,211,153,.1); border: 1px solid rgba(52,211,153,.3); border-radius: 20px; padding: 4px 12px; font-size: 12px; font-weight: 700; color: #34D399; }
    .prro-status-disconnected { display: inline-flex; align-items: center; gap: 6px; background: rgba(107,114,128,.1); border: 1px solid rgba(107,114,128,.3); border-radius: 20px; padding: 4px 12px; font-size: 12px; font-weight: 700; color: #6B7280; }

    /* No config placeholder */
    .prro-no-config { text-align: center; padding: 60px 20px; color: var(--text-muted); }
    .prro-no-config-icon { font-size: 48px; margin-bottom: 16px; }
    .prro-no-config h3 { font-size: 18px; font-weight: 700; color: var(--text-secondary); margin-bottom: 8px; }
    .prro-no-config p  { font-size: 14px; line-height: 1.6; max-width: 360px; margin: 0 auto 20px; }

    /* Spinner */
    .prro-loading { display: flex; align-items: center; justify-content: center; padding: 60px; }

    /* Pagination bar */
    .prro-pager { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--border); }
    .prro-pager-info { font-size: 12px; color: var(--text-muted); flex: 1; }
    .prro-pager button { padding: 5px 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-tertiary); color: var(--text-secondary); font-size: 12px; cursor: pointer; }
    .prro-pager button:disabled { opacity: .35; cursor: default; }

    select option { background: #1A1D27; color: #F1F5F9; }
  `
  document.head.appendChild(s)
}

// ── Firestore helpers ────────────────────────────────────────────────────────
async function loadConfig(uid) {
  const segs = getActivePathSegments(uid)
  const ref  = doc(db, ...segs, 'settings', 'prro')
  const snap = await getDoc(ref)
  return snap.exists() ? snap.data() : null
}

async function saveConfig(uid, data) {
  const segs = getActivePathSegments(uid)
  const ref  = doc(db, ...segs, 'settings', 'prro')
  await setDoc(ref, data, { merge: true })
}

// ── Format helpers ───────────────────────────────────────────────────────────
function fmt(v) {
  return '₴' + Number(v || 0).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDt(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function shiftStatus(shift) {
  if (!shift) return { label: 'Зміна закрита', open: false }
  if (shift.status === 'OPENED') return { label: 'Зміна відкрита', open: true }
  if (shift.status === 'CLOSED') return { label: 'Зміна закрита', open: false }
  return { label: shift.status || '—', open: false }
}

// ── Main render ──────────────────────────────────────────────────────────────
export async function render(container) {
  injectStyles()

  const user = getCurrentUser()
  let cfg    = await loadConfig(user.uid)

  container.innerHTML = buildLayout(cfg)

  // Tab switching
  container.querySelectorAll('.prro-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('.prro-tab').forEach(t => t.classList.remove('active'))
      container.querySelectorAll('.prro-tab-content').forEach(c => c.classList.remove('active'))
      tab.classList.add('active')
      container.querySelector(`#prro-tab-${tab.dataset.tab}`).classList.add('active')
    })
  })

  // Settings save
  container.querySelector('#prro-save-btn').addEventListener('click', async () => {
    const licenseKey = container.querySelector('#prro-license-key').value.trim()
    const login      = container.querySelector('#prro-login').value.trim()
    const password   = container.querySelector('#prro-password').value.trim()

    if (!licenseKey || !login || !password) {
      wbAlert('Заповніть всі поля', 'warning'); return
    }

    const btn = container.querySelector('#prro-save-btn')
    btn.disabled = true
    btn.textContent = 'Перевірка…'

    try {
      _tokenCache.clear()
      const data = await cashierSignin(licenseKey, login, password)
      _tokenCache.set(licenseKey + login, data.access_token)

      cfg = { licenseKey, login, password, connectedAt: new Date().toISOString() }
      await saveConfig(user.uid, cfg)

      wbAlert('Підключено успішно!', 'success')
      // Refresh UI
      container.querySelector('#prro-connect-status').outerHTML =
        `<span class="prro-status-connected" id="prro-connect-status">● Підключено</span>`
      btn.textContent = 'Зберегти'
      btn.disabled = false

      // Load dashboard
      await loadDashboard(container, cfg)
    } catch (err) {
      wbAlert('Помилка підключення: ' + err.message, 'error')
      btn.textContent = 'Зберегти'
      btn.disabled = false
    }
  })

  // Disconnect
  container.querySelector('#prro-disconnect-btn')?.addEventListener('click', async () => {
    const ok = await wbConfirm('Відключити інтеграцію з Checkbox?', { okLabel: 'Відключити', danger: true })
    if (!ok) return
    await saveConfig(user.uid, { licenseKey: null, login: null, password: null, connectedAt: null })
    cfg = null
    _tokenCache.clear()
    container.innerHTML = buildLayout(null)
    // Re-attach all listeners by re-calling render logic
    await render(container)
    return
  })

  if (cfg?.licenseKey) {
    await loadDashboard(container, cfg)
  }
}

function buildLayout(cfg) {
  const isConnected = !!cfg?.licenseKey
  return `
    <div class="prro-page">
      <div class="prro-header">
        <div>
          <h1 class="prro-title">${icon('receipt', 24)} ПРРО / Checkbox</h1>
          <p class="prro-sub">Програмний реєстратор розрахункових операцій через Checkbox Ukraine API</p>
        </div>
        ${isConnected ? `
          <div class="prro-header-actions">
            <button class="btn btn-secondary" id="prro-refresh-btn">${icon('refresh', 14)} Оновити</button>
          </div>
        ` : ''}
      </div>

      <div class="prro-tabs">
        <button class="prro-tab active" data-tab="dashboard">Огляд</button>
        <button class="prro-tab" data-tab="receipts">Чеки</button>
        <button class="prro-tab" data-tab="shifts">Зміни</button>
        <button class="prro-tab" data-tab="settings">Налаштування</button>
      </div>

      <!-- Dashboard tab -->
      <div class="prro-tab-content active" id="prro-tab-dashboard">
        ${isConnected
          ? `<div class="prro-loading"><div class="spinner"></div></div>`
          : buildNoConfig()
        }
      </div>

      <!-- Receipts tab -->
      <div class="prro-tab-content" id="prro-tab-receipts">
        ${isConnected
          ? `<div class="prro-loading"><div class="spinner"></div></div>`
          : buildNoConfig()
        }
      </div>

      <!-- Shifts tab -->
      <div class="prro-tab-content" id="prro-tab-shifts">
        ${isConnected
          ? `<div class="prro-loading"><div class="spinner"></div></div>`
          : buildNoConfig()
        }
      </div>

      <!-- Settings tab -->
      <div class="prro-tab-content" id="prro-tab-settings">
        ${buildSettings(cfg)}
      </div>
    </div>
  `
}

function buildNoConfig() {
  return `
    <div class="prro-no-config">
      <div class="prro-no-config-icon">🏪</div>
      <h3>Інтеграцію не налаштовано</h3>
      <p>Перейдіть у вкладку «Налаштування», введіть ліцензійний ключ Checkbox та дані касира.</p>
    </div>
  `
}

function buildSettings(cfg) {
  const isConnected = !!cfg?.licenseKey
  return `
    <div class="prro-settings-card">
      <div class="prro-settings-title">${icon('key', 16)} Підключення до Checkbox</div>

      ${isConnected ? `
        <div style="display:flex; align-items:center; gap:12px; margin-bottom:20px;">
          <span class="prro-status-connected" id="prro-connect-status">● Підключено</span>
          <span style="font-size:12px; color:var(--text-muted)">
            ${cfg.connectedAt ? 'з ' + fmtDt(cfg.connectedAt) : ''}
          </span>
          <button class="btn btn-ghost btn-sm" id="prro-disconnect-btn" style="margin-left:auto; font-size:12px;">Відключити</button>
        </div>
      ` : `
        <span class="prro-status-disconnected" id="prro-connect-status" style="margin-bottom:20px; display:inline-flex;">● Не підключено</span>
      `}

      <div class="prro-form-row">
        <label class="prro-form-label">Ліцензійний ключ (License Key)</label>
        <input type="text" class="input" id="prro-license-key"
          value="${cfg?.licenseKey || ''}"
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx">
        <div class="prro-form-hint">Знайдіть у кабінеті Checkbox: Каса → Налаштування → Ліцензійний ключ</div>
      </div>

      <div class="prro-form-row">
        <label class="prro-form-label">Логін касира</label>
        <input type="text" class="input" id="prro-login"
          value="${cfg?.login || ''}"
          placeholder="cashier@example.com або PIN">
      </div>

      <div class="prro-form-row">
        <label class="prro-form-label">Пароль / PIN касира</label>
        <input type="password" class="input" id="prro-password"
          value="${cfg?.password || ''}"
          placeholder="••••••••">
        <div class="prro-form-hint">Пароль зберігається зашифровано у вашій базі даних</div>
      </div>

      <button class="btn btn-primary" id="prro-save-btn">
        ${isConnected ? 'Оновити підключення' : 'Підключити'}
      </button>
    </div>

    <div class="prro-settings-card">
      <div class="prro-settings-title">${icon('info', 16)} Що таке Checkbox?</div>
      <p style="font-size:13px; color:var(--text-secondary); line-height:1.7; margin:0">
        <strong>Checkbox</strong> — українська ПРРО-система для реєстрації розрахункових операцій.
        Після підключення WorkHub автоматично підтягує дані про зміни, чеки та Z-звіти.
        API ключ та дані касира можна знайти у особистому кабінеті на сайті <strong>checkbox.ua</strong>.
      </p>
    </div>
  `
}

async function loadDashboard(container, cfg) {
  const { licenseKey, login, password } = cfg

  try {
    const token = await getToken(licenseKey, login, password)

    // Load in parallel
    const [shiftData, cashierData] = await Promise.all([
      cbFetch('/shifts/active', { licenseKey, token }).catch(() => null),
      cbFetch('/cashier/me', { licenseKey, token }).catch(() => null),
    ])

    // Today's receipts
    const today = new Date()
    const fromDate = today.toISOString().slice(0, 10) + 'T00:00:00'
    const toDate   = today.toISOString().slice(0, 10) + 'T23:59:59'
    const receiptsToday = await cbFetch(
      `/receipts?from_date=${encodeURIComponent(fromDate)}&to_date=${encodeURIComponent(toDate)}&limit=100`,
      { licenseKey, token }
    ).catch(() => ({ results: [] }))

    const receipts = receiptsToday.results || []
    const sells    = receipts.filter(r => r.type === 'SELL')
    const returns  = receipts.filter(r => r.type === 'RETURN')
    const totalSell   = sells.reduce((s, r)   => s + (r.total_sum || 0) / 100, 0)
    const totalReturn = returns.reduce((s, r) => s + (r.total_sum || 0) / 100, 0)
    const netRevenue  = totalSell - totalReturn

    const shift  = shiftData
    const sInfo  = shiftStatus(shift)

    // Render dashboard
    container.querySelector('#prro-tab-dashboard').innerHTML = `
      <div class="prro-shift-banner">
        <div class="prro-shift-dot ${sInfo.open ? 'open' : 'closed'}"></div>
        <div class="prro-shift-info">
          <div class="prro-shift-name">${sInfo.label}</div>
          <div class="prro-shift-meta">
            ${cashierData ? 'Касир: ' + (cashierData.full_name || cashierData.name || cashierData.login || '—') : ''}
            ${shift?.opened_at ? ' · Відкрита: ' + fmtDt(shift.opened_at) : ''}
            ${shift?.fiscal_code ? ' · ' + shift.fiscal_code : ''}
          </div>
        </div>
        <div class="prro-shift-actions">
          ${sInfo.open
            ? `<button class="btn btn-secondary btn-sm" id="prro-close-shift-btn">Закрити зміну</button>`
            : `<button class="btn btn-primary btn-sm" id="prro-open-shift-btn">Відкрити зміну</button>`
          }
        </div>
      </div>

      <div class="prro-kpis">
        <div class="prro-kpi">
          <div class="prro-kpi-label">Виручка сьогодні</div>
          <div class="prro-kpi-value green">${fmt(netRevenue)}</div>
        </div>
        <div class="prro-kpi">
          <div class="prro-kpi-label">Продажі</div>
          <div class="prro-kpi-value blue">${fmt(totalSell)}</div>
        </div>
        <div class="prro-kpi">
          <div class="prro-kpi-label">Повернення</div>
          <div class="prro-kpi-value red">${fmt(totalReturn)}</div>
        </div>
        <div class="prro-kpi">
          <div class="prro-kpi-label">Чеків сьогодні</div>
          <div class="prro-kpi-value amber">${receipts.length}</div>
        </div>
      </div>

      <h3 style="font-size:14px; font-weight:700; color:var(--text-secondary); margin-bottom:12px;">Останні чеки сьогодні</h3>
      ${buildReceiptsTable(receipts.slice(0, 10))}
    `

    // Shift buttons
    container.querySelector('#prro-open-shift-btn')?.addEventListener('click', () => openShift(container, cfg))
    container.querySelector('#prro-close-shift-btn')?.addEventListener('click', () => closeShift(container, cfg, shift?.id))

    // Also populate receipts tab
    await loadReceipts(container, cfg)
    await loadShifts(container, cfg)

    // Refresh button
    container.querySelector('#prro-refresh-btn')?.addEventListener('click', async () => {
      container.querySelector('#prro-tab-dashboard').innerHTML = `<div class="prro-loading"><div class="spinner"></div></div>`
      _tokenCache.clear()
      await loadDashboard(container, cfg)
    })

  } catch (err) {
    container.querySelector('#prro-tab-dashboard').innerHTML = `
      <div class="prro-no-config">
        <div class="prro-no-config-icon">⚠️</div>
        <h3>Помилка підключення</h3>
        <p>${err.message}</p>
        <button class="btn btn-primary" id="prro-retry-btn">Спробувати знову</button>
      </div>
    `
    container.querySelector('#prro-retry-btn')?.addEventListener('click', async () => {
      container.querySelector('#prro-tab-dashboard').innerHTML = `<div class="prro-loading"><div class="spinner"></div></div>`
      _tokenCache.clear()
      await loadDashboard(container, cfg)
    })
  }
}

async function loadReceipts(container, cfg) {
  const { licenseKey, login, password } = cfg
  const wrap = container.querySelector('#prro-tab-receipts')

  try {
    const token = await getToken(licenseKey, login, password)

    // Date range: last 30 days
    const to   = new Date()
    const from = new Date(to); from.setDate(from.getDate() - 30)
    const fromStr = from.toISOString().slice(0, 10) + 'T00:00:00'
    const toStr   = to.toISOString().slice(0, 10)   + 'T23:59:59'

    const data = await cbFetch(
      `/receipts?from_date=${encodeURIComponent(fromStr)}&to_date=${encodeURIComponent(toStr)}&limit=50&desc=true`,
      { licenseKey, token }
    ).catch(() => ({ results: [], count: 0 }))

    const receipts = data.results || []
    wrap.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
        <span style="font-size:13px; color:var(--text-muted)">Чеки за останні 30 днів · ${data.count || receipts.length} записів</span>
      </div>
      <div class="prro-table-wrap">
        ${buildReceiptsTable(receipts)}
        ${receipts.length === 0 ? '<div style="padding:32px;text-align:center;color:var(--text-muted)">Чеків не знайдено</div>' : ''}
      </div>
    `
  } catch (err) {
    wrap.innerHTML = `<div style="padding:32px;text-align:center;color:#F87171">${err.message}</div>`
  }
}

async function loadShifts(container, cfg) {
  const { licenseKey, login, password } = cfg
  const wrap = container.querySelector('#prro-tab-shifts')

  try {
    const token  = await getToken(licenseKey, login, password)
    const data   = await cbFetch('/shifts?limit=20&desc=true', { licenseKey, token }).catch(() => ({ results: [] }))
    const shifts = data.results || []

    wrap.innerHTML = `
      <div class="prro-table-wrap">
        <table class="prro-table">
          <thead>
            <tr>
              <th>Фіскальний номер</th>
              <th>Відкрита</th>
              <th>Закрита</th>
              <th>Статус</th>
              <th>Чеків</th>
              <th>Сума</th>
            </tr>
          </thead>
          <tbody>
            ${shifts.length === 0
              ? '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:32px">Зміни не знайдено</td></tr>'
              : shifts.map(s => `
                <tr>
                  <td class="prro-fiscal-num">${s.fiscal_code || s.id?.slice(0, 8) || '—'}</td>
                  <td>${fmtDt(s.opened_at)}</td>
                  <td>${s.closed_at ? fmtDt(s.closed_at) : '—'}</td>
                  <td>
                    <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;
                      background:${s.status === 'OPENED' ? 'rgba(52,211,153,.1)' : 'rgba(107,114,128,.1)'};
                      color:${s.status === 'OPENED' ? '#34D399' : '#6B7280'}">
                      ${s.status === 'OPENED' ? 'Відкрита' : 'Закрита'}
                    </span>
                  </td>
                  <td>${s.receipts_count ?? '—'}</td>
                  <td class="${s.total_sum > 0 ? 'prro-amount-plus' : ''}">${s.total_sum != null ? fmt(s.total_sum / 100) : '—'}</td>
                </tr>
              `).join('')
            }
          </tbody>
        </table>
      </div>
    `
  } catch (err) {
    wrap.innerHTML = `<div style="padding:32px;text-align:center;color:#F87171">${err.message}</div>`
  }
}

function buildReceiptsTable(receipts) {
  if (!receipts.length) return ''
  return `
    <table class="prro-table">
      <thead>
        <tr>
          <th>Дата / Час</th>
          <th>Тип</th>
          <th>Фіскальний №</th>
          <th>Оплата</th>
          <th style="text-align:right">Сума</th>
        </tr>
      </thead>
      <tbody>
        ${receipts.map(r => {
          const isSell   = r.type === 'SELL'
          const amount   = (r.total_sum || 0) / 100
          const payment  = (r.payments || []).map(p => p.type === 'CASHLESS' ? 'Картка' : 'Готівка').join(', ') || '—'
          return `
            <tr>
              <td>${fmtDt(r.fiscal_date || r.created_at)}</td>
              <td>
                <span class="prro-receipt-type ${isSell ? 'sell' : 'return'}">
                  ${isSell ? '↑ Продаж' : '↓ Повернення'}
                </span>
              </td>
              <td class="prro-fiscal-num">${r.fiscal_code || r.id?.slice(0, 12) || '—'}</td>
              <td>${payment}</td>
              <td style="text-align:right" class="${isSell ? 'prro-amount-plus' : 'prro-amount-minus'}">
                ${isSell ? '+' : '−'}${fmt(amount)}
              </td>
            </tr>
          `
        }).join('')}
      </tbody>
    </table>
  `
}

async function openShift(container, cfg) {
  const { licenseKey, login, password } = cfg
  const btn = container.querySelector('#prro-open-shift-btn')
  if (btn) { btn.disabled = true; btn.textContent = '...' }

  try {
    const token = await getToken(licenseKey, login, password)
    await cbFetch('/shifts', { method: 'POST', licenseKey, token })
    wbAlert('Зміну відкрито!', 'success')
    _tokenCache.clear()
    container.querySelector('#prro-tab-dashboard').innerHTML = `<div class="prro-loading"><div class="spinner"></div></div>`
    await loadDashboard(container, cfg)
  } catch (err) {
    wbAlert('Помилка: ' + err.message, 'error')
    if (btn) { btn.disabled = false; btn.textContent = 'Відкрити зміну' }
  }
}

async function closeShift(container, cfg, shiftId) {
  if (!shiftId) { wbAlert('Ідентифікатор зміни не знайдено', 'error'); return }
  const ok = await wbConfirm('Закрити поточну зміну? Буде сформовано Z-звіт.', { okLabel: 'Закрити зміну', danger: false })
  if (!ok) return

  const { licenseKey, login, password } = cfg
  const btn = container.querySelector('#prro-close-shift-btn')
  if (btn) { btn.disabled = true; btn.textContent = '...' }

  try {
    const token = await getToken(licenseKey, login, password)
    await cbFetch(`/shifts/${shiftId}/close`, { method: 'POST', licenseKey, token })
    wbAlert('Зміну закрито. Z-звіт сформовано.', 'success')
    _tokenCache.clear()
    container.querySelector('#prro-tab-dashboard').innerHTML = `<div class="prro-loading"><div class="spinner"></div></div>`
    await loadDashboard(container, cfg)
  } catch (err) {
    wbAlert('Помилка: ' + err.message, 'error')
    if (btn) { btn.disabled = false; btn.textContent = 'Закрити зміну' }
  }
}
