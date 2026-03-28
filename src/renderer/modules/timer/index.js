// src/renderer/modules/timer/index.js
import { db } from '../../services/firebase.js'
import { getCurrentUser } from '../../services/auth.js'
import {
  collection, addDoc, getDocs, query,
  orderBy, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

export async function render(container) {
  injectStyles()

  container.innerHTML = `
    <div class="tp-wrap">

      <!-- Left column: timer control -->
      <div class="tp-left">

        <div class="tp-header">
          <h1 class="tp-title">Таймер</h1>
          <p class="tp-sub">Відслідковуйте час роботи і використані додатки</p>
        </div>

        <div class="tp-card">
          <div class="tp-clock" id="tp-clock">00:00:00</div>

          <div class="tp-app-row" id="tp-app-row">
            <span class="tp-dot tp-dot--idle" id="tp-dot"></span>
            <span class="tp-app-label" id="tp-app-label">Очікування…</span>
          </div>

          <input
            type="text"
            class="tp-task-input"
            id="tp-task"
            placeholder="Назва задачі або проекту (необов'язково)"
            maxlength="120"
          />

          <button class="tp-btn tp-btn--start" id="tp-toggle">
            <span class="tp-btn-icon">▶</span>
            <span class="tp-btn-label">Почати роботу</span>
          </button>

          <div class="tp-hint" id="tp-hint">
            Таймер відстежуватиме які програми ви відкривали
          </div>
        </div>

        <!-- Live apps (shown while tracking) -->
        <div class="tp-live-card" id="tp-live-card" style="display:none">
          <div class="tp-live-title">📱 Зараз активні</div>
          <div id="tp-live-list"></div>
        </div>

      </div>

      <!-- Right column: history -->
      <div class="tp-right">
        <div class="tp-hist-head">
          <div class="tp-hist-title">🗂 Історія сесій</div>
        </div>
        <div id="tp-history">
          <div class="tp-spinner-wrap"><div class="spinner"></div></div>
        </div>
      </div>

    </div>

    <!-- Summary modal -->
    <div class="tp-modal-overlay" id="tp-modal" style="display:none">
      <div class="tp-modal">
        <div class="tp-modal-head">
          <h2 class="tp-modal-title">📊 Підсумок сесії</h2>
          <button class="tp-modal-close" id="tp-modal-close">✕</button>
        </div>
        <div class="tp-modal-body" id="tp-modal-body"></div>
        <div class="tp-modal-foot">
          <button class="btn btn-secondary" id="tp-discard">Не зберігати</button>
          <button class="btn btn-primary"   id="tp-save">💾 Зберегти сесію</button>
        </div>
      </div>
    </div>
  `

  const user = getCurrentUser()
  if (!user) return

  // ── State ────────────────────────────────────────────────
  let destroyed     = false   // set true when user leaves page — stops all callbacks
  let tracking      = false
  let clockInterval = null
  let pollInterval  = null
  let liveApps      = {}      // key → { name, icon, totalMs }
  let sessionResult = null

  // Cleanup when router replaces this page
  const observer = new MutationObserver(() => {
    if (!container.contains(container.querySelector('#tp-clock'))) {
      destroyed = true
      clearInterval(clockInterval)
      clearInterval(pollInterval)
      observer.disconnect()
    }
  })
  observer.observe(container, { childList: true })

  // ── Відновлення якщо таймер вже запущено ─────────────────
  try {
    const status = await window.electron?.timer?.status()
    if (!destroyed && status?.tracking) {
      tracking = true
      setRunningUI()
      startClock(status.startTime)
      startPolling()
    }
  } catch (_) {}

  loadHistory()

  // ── Кнопка Старт / Стоп ──────────────────────────────────
  container.querySelector('#tp-toggle').addEventListener('click', () => {
    if (!tracking) doStart()
    else           doStop()
  })

  container.querySelector('#tp-modal-close').addEventListener('click', closeModal)
  container.querySelector('#tp-discard').addEventListener('click', closeModal)
  container.querySelector('#tp-save').addEventListener('click', () => doSave(sessionResult))

  // ════════════════════════════════════════════════════════
  // START
  // ════════════════════════════════════════════════════════
  async function doStart() {
    const btn = container.querySelector('#tp-toggle')
    btn.disabled = true
    setHint('Запускаємо таймер…')

    try {
      const res = await window.electron?.timer?.start()

      if (destroyed) return

      if (!res || res.error) {
        setHint(res?.error || 'Не вдалось запустити таймер')
        btn.disabled = false
        return
      }

      tracking = true
      liveApps = {}
      setRunningUI()
      startClock(res.startTime)
      startPolling()
    } catch (err) {
      if (destroyed) return
      console.error('timer:start', err)
      setHint('Помилка запуску — ' + (err.message || err))
      btn.disabled = false
    }
  }

  // ════════════════════════════════════════════════════════
  // STOP
  // ════════════════════════════════════════════════════════
  async function doStop() {
    clearInterval(clockInterval)
    clearInterval(pollInterval)
    clockInterval = null
    pollInterval  = null
    tracking      = false

    const btn = container.querySelector('#tp-toggle')
    btn.disabled = true
    setHint('Зупиняємо, збираємо дані…')

    try {
      const result = await window.electron?.timer?.stop()

      if (destroyed) return

      btn.disabled = false
      setIdleUI()

      if (!result || result.error) {
        setHint(result?.error || 'Помилка зупинки')
        return
      }

      sessionResult = result
      showSummary(result)
    } catch (err) {
      if (destroyed) return
      console.error('timer:stop', err)
      btn.disabled = false
      setIdleUI()
    }
  }

  // ════════════════════════════════════════════════════════
  // CLOCK
  // ════════════════════════════════════════════════════════
  function startClock(startTime) {
    const display = container.querySelector('#tp-clock')
    clockInterval = setInterval(() => {
      if (destroyed) { clearInterval(clockInterval); return }
      display.textContent = fmtMs(Date.now() - startTime)
    }, 500)
  }

  // ════════════════════════════════════════════════════════
  // POLLING — активний додаток кожні 3с
  // ════════════════════════════════════════════════════════
  function startPolling() {
    pollInterval = setInterval(async () => {
      if (destroyed) { clearInterval(pollInterval); return }

      try {
        const st = await window.electron?.timer?.status()
        if (!st?.tracking || destroyed) return

        const label = container.querySelector('#tp-app-label')
        const dot   = container.querySelector('#tp-dot')

        if (st.currentApp && label) {
          label.textContent = `${st.currentIcon || '📱'} ${st.currentApp}`
          dot.className = 'tp-dot tp-dot--active'
        }

        // Accumulate live apps (approximate)
        if (st.currentApp) {
          if (!liveApps[st.currentApp]) {
            liveApps[st.currentApp] = { name: st.currentApp, icon: st.currentIcon || '📱', totalMs: 0 }
          }
          liveApps[st.currentApp].totalMs += 3000
        }

        renderLiveApps()
      } catch (_) {}
    }, 3000)
  }

  // ════════════════════════════════════════════════════════
  // LIVE APPS
  // ════════════════════════════════════════════════════════
  function renderLiveApps() {
    const list   = container.querySelector('#tp-live-list')
    if (!list) return
    const sorted = Object.values(liveApps).sort((a, b) => b.totalMs - a.totalMs)
    if (sorted.length === 0) { list.innerHTML = ''; return }

    const maxMs = sorted[0].totalMs
    list.innerHTML = sorted.map(a => {
      const pct = maxMs > 0 ? Math.round((a.totalMs / maxMs) * 100) : 0
      return `
        <div class="tp-live-row">
          <span class="tp-live-icon">${a.icon}</span>
          <span class="tp-live-name">${a.name}</span>
          <div class="tp-live-bar-wrap">
            <div class="tp-live-bar" style="width:${pct}%"></div>
          </div>
          <span class="tp-live-time">${fmtMs(a.totalMs)}</span>
        </div>
      `
    }).join('')
  }

  // ════════════════════════════════════════════════════════
  // UI STATES
  // ════════════════════════════════════════════════════════
  function setRunningUI() {
    const btn   = container.querySelector('#tp-toggle')
    const task  = container.querySelector('#tp-task')
    const live  = container.querySelector('#tp-live-card')
    const dot   = container.querySelector('#tp-dot')
    const label = container.querySelector('#tp-app-label')

    btn.disabled = false
    btn.className = 'tp-btn tp-btn--stop'
    btn.querySelector('.tp-btn-icon').textContent = '⏹'
    btn.querySelector('.tp-btn-label').textContent = 'Зупинити таймер'
    task.disabled = true
    live.style.display = 'block'
    dot.className  = 'tp-dot tp-dot--active'
    label.textContent = 'Відстежуємо…'
    setHint('Таймер запущено — повертайтесь до роботи!')
  }

  function setIdleUI() {
    const btn   = container.querySelector('#tp-toggle')
    const task  = container.querySelector('#tp-task')
    const live  = container.querySelector('#tp-live-card')
    const clock = container.querySelector('#tp-clock')
    const dot   = container.querySelector('#tp-dot')
    const label = container.querySelector('#tp-app-label')

    if (!btn) return
    btn.disabled = false
    btn.className = 'tp-btn tp-btn--start'
    btn.querySelector('.tp-btn-icon').textContent = '▶'
    btn.querySelector('.tp-btn-label').textContent = 'Почати роботу'
    clock.textContent = '00:00:00'
    task.disabled  = false
    live.style.display = 'none'
    dot.className  = 'tp-dot tp-dot--idle'
    label.textContent = 'Очікування…'
    setHint('Таймер відстежуватиме які програми ви відкривали')
  }

  function setHint(text) {
    const hint = container.querySelector('#tp-hint')
    if (hint) hint.textContent = text
  }

  // ════════════════════════════════════════════════════════
  // SUMMARY MODAL
  // ════════════════════════════════════════════════════════
  function showSummary(result) {
    const { totalMs, apps = [], startTime, endTime } = result
    const maxMs = apps[0]?.totalMs || 1
    const timeFrom = new Date(startTime).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
    const timeTo   = new Date(endTime).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })

    container.querySelector('#tp-modal-body').innerHTML = `
      <div class="sum-total">
        <div class="sum-total-label">Загальний час</div>
        <div class="sum-total-value">${fmtMs(totalMs)}</div>
        <div class="sum-total-range">${timeFrom} → ${timeTo}</div>
      </div>

      ${apps.length === 0
        ? '<p class="sum-empty">Додатки не були відстежені</p>'
        : `
          <div class="sum-apps-label">Час по додатках</div>
          <div class="sum-apps">
            ${apps.map((a, i) => {
              const pct  = Math.round((a.totalMs / totalMs) * 100)
              const barW = Math.round((a.totalMs / maxMs) * 100)
              return `
                <div class="sum-app-row">
                  <span class="sum-rank">${i + 1}</span>
                  <span class="sum-icon">${a.icon}</span>
                  <div class="sum-info">
                    <div class="sum-name">${a.name}</div>
                    <div class="sum-bar-wrap"><div class="sum-bar" style="width:${barW}%"></div></div>
                  </div>
                  <div class="sum-meta">
                    <div class="sum-time">${fmtMs(a.totalMs)}</div>
                    <div class="sum-pct">${pct}%</div>
                  </div>
                </div>
              `
            }).join('')}
          </div>
        `
      }
    `

    container.querySelector('#tp-modal').style.display = 'flex'
  }

  function closeModal() {
    container.querySelector('#tp-modal').style.display = 'none'
    container.querySelector('#tp-task').value = ''
    loadHistory()
  }

  // ════════════════════════════════════════════════════════
  // SAVE
  // ════════════════════════════════════════════════════════
  async function doSave(result) {
    const btn = container.querySelector('#tp-save')
    btn.disabled    = true
    btn.textContent = '...'

    const task = container.querySelector('#tp-task').value.trim()

    try {
      await addDoc(collection(db, 'users', user.uid, 'timerSessions'), {
        task:      task || null,
        startTime: new Date(result.startTime).toISOString(),
        endTime:   new Date(result.endTime).toISOString(),
        totalMs:   result.totalMs,
        apps:      result.apps || [],
        createdAt: serverTimestamp(),
      })
      closeModal()
    } catch (err) {
      console.error('save session', err)
      btn.textContent = '💾 Зберегти сесію'
      btn.disabled = false
    }
  }

  // ════════════════════════════════════════════════════════
  // HISTORY
  // ════════════════════════════════════════════════════════
  async function loadHistory() {
    const el = container.querySelector('#tp-history')
    if (!el) return

    try {
      const q    = query(
        collection(db, 'users', user.uid, 'timerSessions'),
        orderBy('createdAt', 'desc'),
      )
      const snap = await getDocs(q)
      if (destroyed) return
      renderHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (err) {
      if (destroyed) return
      el.innerHTML = '<div class="tp-err">⚠️ Помилка завантаження</div>'
    }
  }

  function renderHistory(sessions) {
    const el = container.querySelector('#tp-history')
    if (!el) return

    if (sessions.length === 0) {
      el.innerHTML = `
        <div class="tp-empty">
          <div class="tp-empty-icon">⏱</div>
          <div class="tp-empty-title">Сесій ще немає</div>
          <div class="tp-empty-desc">Запустіть таймер щоб почати відстеження</div>
        </div>
      `
      return
    }

    el.innerHTML = sessions.map(s => {
      const date     = s.startTime ? new Date(s.startTime).toLocaleDateString('uk-UA', { day: '2-digit', month: 'short' }) : '—'
      const timeFrom = s.startTime ? new Date(s.startTime).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }) : ''
      const timeTo   = s.endTime   ? new Date(s.endTime).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }) : ''
      const topApps  = (s.apps || []).slice(0, 4)

      return `
        <div class="tp-sess-card">
          <div class="tp-sess-left">
            <div class="tp-sess-date">${date}</div>
            <div class="tp-sess-range">${timeFrom} → ${timeTo}</div>
            ${s.task ? `<div class="tp-sess-task">📌 ${s.task}</div>` : ''}
          </div>
          <div class="tp-sess-chips">
            ${topApps.map(a => `
              <span class="tp-chip" title="${a.name}: ${fmtMs(a.totalMs)}">
                ${a.icon} ${a.name} <span class="tp-chip-t">${fmtMs(a.totalMs)}</span>
              </span>
            `).join('')}
            ${s.apps?.length > 4 ? `<span class="tp-chip-more">+${s.apps.length - 4}</span>` : ''}
          </div>
          <div class="tp-sess-total">
            <div class="tp-sess-dur">${fmtMs(s.totalMs)}</div>
            <div class="tp-sess-dur-label">загалом</div>
          </div>
        </div>
      `
    }).join('')
  }

  // ── Helpers ──────────────────────────────────────────────
  function fmtMs(ms) {
    if (!ms || ms < 0) return '00:00:00'
    const s   = Math.floor(ms / 1000)
    const h   = Math.floor(s / 3600)
    const m   = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return [h, m, sec].map(n => String(n).padStart(2, '0')).join(':')
  }
}

// ── Styles ────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('timer-styles')) return
  const s = document.createElement('style')
  s.id = 'timer-styles'
  s.textContent = `
    /* ── Layout ──────────────────────────────── */
    .tp-wrap {
      display: grid;
      grid-template-columns: 380px 1fr;
      gap: 24px;
      padding: 32px 36px;
      height: 100%;
      box-sizing: border-box;
      align-items: start;
    }
    @media (max-width: 860px) {
      .tp-wrap { grid-template-columns: 1fr; }
    }

    /* ── Header ──────────────────────────────── */
    .tp-header { margin-bottom: 20px; }
    .tp-title  { font-family: var(--font-display); font-size: 26px; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 4px; }
    .tp-sub    { font-size: 13px; color: var(--text-secondary); }

    /* ── Timer card ──────────────────────────── */
    .tp-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius-xl);
      padding: 36px 28px;
      text-align: center;
      margin-bottom: 16px;
    }

    .tp-clock {
      font-family: var(--font-mono, 'Courier New', monospace);
      font-size: 64px;
      font-weight: 800;
      letter-spacing: 4px;
      line-height: 1;
      color: var(--text-primary);
      margin-bottom: 16px;
      transition: color .3s;
    }

    .tp-app-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font-size: 13px;
      color: var(--text-secondary);
      margin-bottom: 24px;
      min-height: 20px;
    }
    .tp-dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
      transition: background .3s;
    }
    .tp-dot--idle   { background: var(--border); }
    .tp-dot--active { background: #34D399; animation: tp-pulse 2s ease-in-out infinite; }
    @keyframes tp-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.6;transform:scale(1.4)} }

    .tp-task-input {
      width: 100%;
      background: var(--bg-tertiary);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 10px 14px;
      font-size: 13px;
      color: var(--text-primary);
      text-align: center;
      margin-bottom: 20px;
      box-sizing: border-box;
      outline: none;
      transition: border-color .2s;
    }
    .tp-task-input:focus { border-color: var(--accent-blue); }
    .tp-task-input::placeholder { color: var(--text-muted); }
    .tp-task-input:disabled { opacity: .5; cursor: not-allowed; }

    .tp-btn {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 14px 36px;
      border-radius: var(--radius-full);
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      border: none;
      transition: all .25s;
      width: 100%;
      justify-content: center;
      margin-bottom: 16px;
    }
    .tp-btn:disabled { opacity: .6; cursor: not-allowed; transform: none !important; }
    .tp-btn--start {
      background: linear-gradient(135deg, #34D399 0%, #10B981 100%);
      color: #fff;
      box-shadow: 0 6px 20px rgba(52,211,153,.35);
    }
    .tp-btn--start:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 10px 28px rgba(52,211,153,.45); }
    .tp-btn--stop {
      background: linear-gradient(135deg, #F87171 0%, #EF4444 100%);
      color: #fff;
      box-shadow: 0 6px 20px rgba(239,68,68,.35);
    }
    .tp-btn--stop:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 10px 28px rgba(239,68,68,.45); }
    .tp-btn-icon { font-size: 18px; }

    .tp-hint {
      font-size: 12px;
      color: var(--text-muted);
      line-height: 1.5;
    }

    /* ── Live card ───────────────────────────── */
    .tp-live-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius-xl);
      padding: 20px;
    }
    .tp-live-title {
      font-family: var(--font-display);
      font-size: 14px;
      font-weight: 700;
      margin-bottom: 14px;
    }
    .tp-live-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 7px 0;
      border-bottom: 1px solid var(--border);
    }
    .tp-live-row:last-child { border-bottom: none; }
    .tp-live-icon { font-size: 18px; width: 24px; text-align: center; flex-shrink: 0; }
    .tp-live-name { font-size: 13px; font-weight: 600; width: 120px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tp-live-bar-wrap { flex: 1; height: 5px; background: var(--bg-tertiary); border-radius: 3px; overflow: hidden; }
    .tp-live-bar { height: 100%; background: linear-gradient(90deg, #4F8EF7, #A78BFA); border-radius: 3px; transition: width .6s ease; }
    .tp-live-time { font-family: var(--font-mono, monospace); font-size: 12px; color: var(--text-secondary); width: 68px; text-align: right; flex-shrink: 0; }

    /* ── History column ──────────────────────── */
    .tp-hist-head  { margin-bottom: 16px; }
    .tp-hist-title { font-family: var(--font-display); font-size: 18px; font-weight: 700; }

    .tp-sess-card {
      display: flex;
      align-items: center;
      gap: 14px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 14px 18px;
      margin-bottom: 8px;
      transition: all .2s;
    }
    .tp-sess-card:hover { border-color: rgba(255,255,255,.12); transform: translateY(-1px); box-shadow: var(--shadow-sm); }

    .tp-sess-left { flex-shrink: 0; width: 90px; }
    .tp-sess-date  { font-weight: 700; font-size: 14px; margin-bottom: 2px; }
    .tp-sess-range { font-size: 11px; color: var(--text-secondary); margin-bottom: 3px; }
    .tp-sess-task  { font-size: 11px; color: var(--accent-blue); font-weight: 600; }

    .tp-sess-chips { flex: 1; display: flex; flex-wrap: wrap; gap: 6px; }
    .tp-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: var(--bg-tertiary);
      border-radius: var(--radius-full);
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
    }
    .tp-chip-t    { color: var(--text-muted); font-weight: 400; }
    .tp-chip-more { font-size: 12px; color: var(--text-muted); padding: 4px 8px; }

    .tp-sess-total { flex-shrink: 0; text-align: right; }
    .tp-sess-dur   { font-family: var(--font-mono, monospace); font-size: 20px; font-weight: 800; color: var(--accent-blue); }
    .tp-sess-dur-label { font-size: 11px; color: var(--text-muted); }

    .tp-empty { text-align: center; padding: 60px 24px; }
    .tp-empty-icon  { font-size: 48px; margin-bottom: 14px; }
    .tp-empty-title { font-family: var(--font-display); font-size: 18px; font-weight: 600; margin-bottom: 6px; }
    .tp-empty-desc  { font-size: 13px; color: var(--text-muted); }

    .tp-spinner-wrap { display: flex; justify-content: center; padding: 40px; }
    .tp-err { color: var(--text-muted); font-size: 14px; padding: 32px; text-align: center; }

    /* ── Summary modal ───────────────────────── */
    .tp-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,.65);
      backdrop-filter: blur(6px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 24px;
    }
    .tp-modal {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius-xl);
      width: 100%;
      max-width: 540px;
      max-height: 88vh;
      display: flex;
      flex-direction: column;
      box-shadow: var(--shadow-xl);
      animation: tp-scale .22s cubic-bezier(.34,1.2,.64,1);
    }
    @keyframes tp-scale { from{opacity:0;transform:scale(.94)} to{opacity:1;transform:scale(1)} }

    .tp-modal-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 22px 24px 0;
      flex-shrink: 0;
    }
    .tp-modal-title { font-family: var(--font-display); font-size: 20px; font-weight: 700; }
    .tp-modal-close {
      width: 30px; height: 30px;
      border-radius: 8px;
      color: var(--text-muted);
      font-size: 15px;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer;
      transition: all .2s;
    }
    .tp-modal-close:hover { background: rgba(239,68,68,.15); color: #F87171; }

    .tp-modal-body {
      padding: 20px 24px;
      overflow-y: auto;
      flex: 1;
    }
    .tp-modal-foot {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      padding: 14px 24px 20px;
      border-top: 1px solid var(--border);
      flex-shrink: 0;
    }

    /* Summary content */
    .sum-total {
      text-align: center;
      background: var(--bg-tertiary);
      border-radius: var(--radius-lg);
      padding: 20px;
      margin-bottom: 20px;
    }
    .sum-total-label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 6px; }
    .sum-total-value { font-family: var(--font-mono, monospace); font-size: 52px; font-weight: 800; color: var(--accent-blue); line-height: 1; margin-bottom: 6px; }
    .sum-total-range { font-size: 13px; color: var(--text-secondary); }

    .sum-apps-label { font-size: 12px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 12px; }
    .sum-apps       { display: flex; flex-direction: column; gap: 10px; }
    .sum-empty      { text-align: center; padding: 24px; color: var(--text-muted); font-size: 14px; }

    .sum-app-row  { display: flex; align-items: center; gap: 10px; }
    .sum-rank     { width: 18px; font-size: 12px; font-weight: 700; color: var(--text-muted); flex-shrink: 0; text-align: center; }
    .sum-icon     { font-size: 22px; width: 28px; text-align: center; flex-shrink: 0; }
    .sum-info     { flex: 1; min-width: 0; }
    .sum-name     { font-size: 13px; font-weight: 600; margin-bottom: 5px; }
    .sum-bar-wrap { height: 5px; background: var(--bg-tertiary); border-radius: 3px; overflow: hidden; }
    .sum-bar      { height: 100%; background: linear-gradient(90deg, #4F8EF7, #A78BFA); border-radius: 3px; }
    .sum-meta     { flex-shrink: 0; text-align: right; width: 76px; }
    .sum-time     { font-family: var(--font-mono, monospace); font-size: 14px; font-weight: 700; }
    .sum-pct      { font-size: 11px; color: var(--text-muted); }
  `
  document.head.appendChild(s)
}
