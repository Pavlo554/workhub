// src/renderer/modules/timer/index.js
import { db } from '../../services/firebase.js'
import { getCurrentUser } from '../../services/auth.js'
import { icon } from '../../utils/icons.js'
import {
  collection, addDoc, getDocs, query,
  orderBy, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

const BREAK_TYPES = [
  { id: 'lunch',   iconName: 'coffee',    label: 'Обід'          },
  { id: 'smoke',   iconName: 'x',         label: 'Покурити'      },
  { id: 'coffee',  iconName: 'coffee',    label: 'Кава'          },
  { id: 'away',    iconName: 'user',      label: 'Відійшов'      },
  { id: 'project', iconName: 'refresh',   label: 'Інший проект'  },
  { id: 'pause',   iconName: 'timer',     label: 'Пауза'         },
]

export async function render(container) {
  injectStyles()

  container.innerHTML = `
    <div class="tp-wrap">

      <!-- Left: timer -->
      <div class="tp-left">
        <div class="tp-header">
          <h1 class="tp-title" style="display:flex;align-items:center;gap:8px">${icon('timer', 22)} Таймер</h1>
          <p class="tp-sub">Відслідковуйте час роботи та перерви</p>
        </div>

        <div class="tp-card" id="tp-card">
          <!-- Status badge -->
          <div class="tp-status-badge" id="tp-status-badge">
            <span class="tp-dot tp-dot--idle" id="tp-dot"></span>
            <span id="tp-status-text">Очікування…</span>
          </div>

          <!-- Clock -->
          <div class="tp-clock-wrap">
            <div class="tp-clock" id="tp-clock">00:00:00</div>
            <div class="tp-clock-sub" id="tp-clock-sub" style="display:none"></div>
          </div>

          <!-- Current task (shown when running) -->
          <div class="tp-current-task" id="tp-current-task" style="display:none">
            <span class="tp-task-icon">${icon('pin', 14)}</span>
            <span id="tp-task-display">—</span>
            <button class="tp-change-task-btn" id="tp-change-task-btn">змінити</button>
          </div>

          <!-- Task input (shown when idle) -->
          <div id="tp-task-input-wrap">
            <input type="text" class="tp-task-input" id="tp-task"
              placeholder="Назва задачі або проекту (необов'язково)" maxlength="120"/>
          </div>

          <!-- Main button -->
          <button class="tp-btn tp-btn--start" id="tp-toggle">
            <span class="tp-btn-icon">▶</span>
            <span class="tp-btn-label">Почати роботу</span>
          </button>

          <!-- Break buttons (shown when working) -->
          <div class="tp-break-row" id="tp-break-row" style="display:none">
            <div class="tp-break-label">Перерва:</div>
            <div class="tp-break-btns">
              ${BREAK_TYPES.map(b => `
                <button class="tp-break-btn" data-break="${b.id}" title="${b.label}" style="display:inline-flex;align-items:center;gap:4px">
                  ${icon(b.iconName, 13)} <span>${b.label}</span>
                </button>
              `).join('')}
            </div>
          </div>

          <!-- Return from break button (shown on break) -->
          <button class="tp-btn tp-btn--return" id="tp-return-btn" style="display:none">
            <span style="display:flex;align-items:center;color:#34D399">${icon('check-circle', 16)}</span>
            <span class="tp-btn-label">Повернутись до роботи</span>
          </button>

          <div class="tp-hint" id="tp-hint">
            Таймер відстежуватиме які програми ви відкривали
          </div>
        </div>

        <!-- Live apps -->
        <div class="tp-live-card" id="tp-live-card" style="display:none">
          <div class="tp-live-title" style="display:flex;align-items:center;gap:6px">${icon('smartphone', 13)} Активні зараз</div>
          <div id="tp-live-list"></div>
        </div>
      </div>

      <!-- Right: history -->
      <div class="tp-right">
        <div class="tp-hist-head">
          <div class="tp-hist-title" style="display:flex;align-items:center;gap:6px">${icon('documents', 14)} Історія сесій</div>
          <div class="tp-hist-sub">Натисніть на сесію щоб переглянути деталі</div>
        </div>
        <div id="tp-history">
          <div class="tp-spinner-wrap"><div class="tp-spinner"></div></div>
        </div>
      </div>

    </div>

    <!-- Summary modal -->
    <div class="tp-overlay" id="tp-modal" style="display:none">
      <div class="tp-modal">
        <div class="tp-modal-head">
          <h2 class="tp-modal-title" style="display:flex;align-items:center;gap:7px">${icon('bar-chart', 16)} Підсумок сесії</h2>
          <button class="tp-modal-close" id="tp-modal-close">${icon('x', 14)}</button>
        </div>
        <div class="tp-modal-body" id="tp-modal-body"></div>
        <div class="tp-modal-foot">
          <button class="tp-btn-ghost" id="tp-discard">Не зберігати</button>
          <button class="tp-btn-save"  id="tp-save" style="display:inline-flex;align-items:center;gap:5px">${icon('check', 14)} Зберегти сесію</button>
        </div>
      </div>
    </div>

    <!-- View session modal -->
    <div class="tp-overlay" id="tp-view-modal" style="display:none">
      <div class="tp-modal">
        <div class="tp-modal-head">
          <h2 class="tp-modal-title" style="display:flex;align-items:center;gap:7px">${icon('templates', 16)} Деталі сесії</h2>
          <button class="tp-modal-close" id="tp-view-close">${icon('x', 14)}</button>
        </div>
        <div class="tp-modal-body" id="tp-view-body"></div>
        <div class="tp-modal-foot">
          <button class="tp-btn-save" id="tp-view-ok">Закрити</button>
        </div>
      </div>
    </div>

    <!-- Change task modal -->
    <div class="tp-overlay" id="tp-task-modal" style="display:none">
      <div class="tp-modal tp-modal--sm">
        <div class="tp-modal-head">
          <h2 class="tp-modal-title" style="display:flex;align-items:center;gap:7px">${icon('refresh', 16)} Змінити задачу</h2>
          <button class="tp-modal-close" id="tp-task-modal-close">${icon('x', 14)}</button>
        </div>
        <div class="tp-modal-body">
          <input type="text" class="tp-task-input" id="tp-new-task-input"
            placeholder="Нова задача або проект" maxlength="120" style="margin-bottom:0"/>
        </div>
        <div class="tp-modal-foot">
          <button class="tp-btn-ghost" id="tp-task-cancel">Скасувати</button>
          <button class="tp-btn-save"  id="tp-task-confirm">Змінити</button>
        </div>
      </div>
    </div>
  `

  const user = getCurrentUser()
  if (!user) return

  // ── State ─────────────────────────────────────────────────
  let destroyed     = false
  let tracking      = false
  let onBreak       = false
  let currentTask   = ''
  let clockInterval = null
  let pollInterval  = null
  let breakInterval = null
  let liveApps      = {}
  let sessionResult = null

  // Segments: { type:'work'|'break', icon, label, startMs, endMs }
  let segments      = []
  let segStart      = null
  let currentBreak  = null  // { id, icon, label }
  let globalStart   = null

  // Cleanup on page leave
  const observer = new MutationObserver(() => {
    if (!container.contains(container.querySelector('#tp-clock'))) {
      destroyed = true
      clearInterval(clockInterval)
      clearInterval(pollInterval)
      clearInterval(breakInterval)
      observer.disconnect()
    }
  })
  observer.observe(container, { childList: true })

  // Restore if already running
  try {
    const status = await window.electron?.timer?.status()
    if (!destroyed && status?.tracking) {
      tracking    = true
      globalStart = status.startTime
      segStart    = status.startTime
      segments    = [{ type: 'work', iconName: 'briefcase', label: 'Робота', startMs: status.startTime }]
      setWorkingUI()
      startClock(status.startTime)
      startPolling()
    }
  } catch (_) {}

  loadHistory()

  // ── Button events ──────────────────────────────────────────
  container.querySelector('#tp-toggle').addEventListener('click', () => {
    if (!tracking) doStart()
    else           doStop()
  })

  container.querySelector('#tp-return-btn').addEventListener('click', returnFromBreak)

  container.querySelector('#tp-break-row').addEventListener('click', e => {
    const btn = e.target.closest('.tp-break-btn')
    if (!btn) return
    const bt = BREAK_TYPES.find(b => b.id === btn.dataset.break)
    if (bt) startBreak(bt)
  })

  container.querySelector('#tp-change-task-btn').addEventListener('click', openChangeTask)

  // Summary modal
  container.querySelector('#tp-modal-close').addEventListener('click', closeModal)
  container.querySelector('#tp-discard').addEventListener('click', closeModal)
  container.querySelector('#tp-save').addEventListener('click', () => doSave(sessionResult))

  // View modal
  const viewModal = container.querySelector('#tp-view-modal')
  container.querySelector('#tp-view-close').addEventListener('click', () => viewModal.style.display = 'none')
  container.querySelector('#tp-view-ok').addEventListener('click',    () => viewModal.style.display = 'none')
  viewModal.addEventListener('click', e => { if (e.target === viewModal) viewModal.style.display = 'none' })

  // Change task modal
  const taskModal = container.querySelector('#tp-task-modal')
  container.querySelector('#tp-task-modal-close').addEventListener('click', () => taskModal.style.display = 'none')
  container.querySelector('#tp-task-cancel').addEventListener('click',       () => taskModal.style.display = 'none')
  container.querySelector('#tp-task-confirm').addEventListener('click', confirmChangeTask)
  container.querySelector('#tp-new-task-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmChangeTask()
  })

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
      if (!res || res.error) { setHint(res?.error || 'Не вдалось запустити'); btn.disabled = false; return }

      tracking    = true
      onBreak     = false
      liveApps    = {}
      currentTask = container.querySelector('#tp-task').value.trim()
      globalStart = res.startTime
      segStart    = res.startTime
      segments    = [{ type: 'work', iconName: 'briefcase', label: currentTask || 'Робота', startMs: res.startTime }]

      setWorkingUI()
      startClock(res.startTime)
      startPolling()
    } catch (err) {
      if (destroyed) return
      setHint('Помилка: ' + (err.message || err))
      btn.disabled = false
    }
  }

  // ════════════════════════════════════════════════════════
  // STOP
  // ════════════════════════════════════════════════════════
  async function doStop() {
    clearInterval(clockInterval)
    clearInterval(pollInterval)
    clearInterval(breakInterval)
    clockInterval = null; pollInterval = null; breakInterval = null
    tracking = false; onBreak = false

    // Close last segment
    const now = Date.now()
    if (segments.length && !segments[segments.length - 1].endMs) {
      segments[segments.length - 1].endMs = now
    }

    const btn = container.querySelector('#tp-toggle')
    btn.disabled = true
    setHint('Зупиняємо…')

    try {
      const result = await window.electron?.timer?.stop()
      if (destroyed) return
      btn.disabled = false
      setIdleUI()
      if (!result || result.error) { setHint(result?.error || 'Помилка зупинки'); return }

      sessionResult = { ...result, segments, task: currentTask }
      showSummary(sessionResult)
    } catch (err) {
      if (destroyed) return
      btn.disabled = false
      setIdleUI()
    }
  }

  // ════════════════════════════════════════════════════════
  // BREAK
  // ════════════════════════════════════════════════════════
  function startBreak(bt) {
    if (!tracking || onBreak) return
    const now = Date.now()

    // Close current work segment
    if (segments.length) segments[segments.length - 1].endMs = now

    // Push break segment
    segments.push({ type: 'break', iconName: bt.iconName, label: bt.label, startMs: now })
    currentBreak = bt
    segStart     = now
    onBreak      = true

    setBreakUI(bt)
  }

  function returnFromBreak() {
    if (!onBreak) return
    const now = Date.now()

    // Close break segment
    if (segments.length) segments[segments.length - 1].endMs = now

    // New work segment
    segments.push({ type: 'work', iconName: 'briefcase', label: currentTask || 'Робота', startMs: now })
    segStart     = now
    currentBreak = null
    onBreak      = false

    clearInterval(breakInterval)
    breakInterval = null
    setWorkingUI()
  }

  // ════════════════════════════════════════════════════════
  // CHANGE TASK
  // ════════════════════════════════════════════════════════
  function openChangeTask() {
    const modal = container.querySelector('#tp-task-modal')
    container.querySelector('#tp-new-task-input').value = currentTask
    modal.style.display = 'flex'
    setTimeout(() => container.querySelector('#tp-new-task-input').focus(), 50)
  }

  function confirmChangeTask() {
    const val = container.querySelector('#tp-new-task-input').value.trim()
    currentTask = val
    container.querySelector('#tp-task-display').textContent = val || '—'

    // Update last work segment label
    const last = segments[segments.length - 1]
    if (last && last.type === 'work') last.label = val || 'Робота'

    container.querySelector('#tp-task-modal').style.display = 'none'
    showToast('Задачу змінено')
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

  function startBreakClock(breakStartTime) {
    const sub = container.querySelector('#tp-clock-sub')
    breakInterval = setInterval(() => {
      if (destroyed) { clearInterval(breakInterval); return }
      sub.textContent = 'Перерва: ' + fmtMs(Date.now() - breakStartTime)
    }, 500)
  }

  // ════════════════════════════════════════════════════════
  // POLLING
  // ════════════════════════════════════════════════════════
  function startPolling() {
    pollInterval = setInterval(async () => {
      if (destroyed) { clearInterval(pollInterval); return }
      try {
        const st = await window.electron?.timer?.status()
        if (!st?.tracking || destroyed) return
        if (st.currentApp && !onBreak) {
          if (!liveApps[st.currentApp]) {
            liveApps[st.currentApp] = { name: st.currentApp, icon: st.currentIcon || icon('smartphone', 14), totalMs: 0 }
          }
          liveApps[st.currentApp].totalMs += 3000
          renderLiveApps()
        }
      } catch (_) {}
    }, 3000)
  }

  // ── LIVE APPS ──────────────────────────────────────────────
  function renderLiveApps() {
    const list = container.querySelector('#tp-live-list')
    if (!list) return
    const sorted = Object.values(liveApps).sort((a, b) => b.totalMs - a.totalMs)
    if (!sorted.length) { list.innerHTML = ''; return }
    const maxMs = sorted[0].totalMs
    list.innerHTML = sorted.map(a => `
      <div class="tp-live-row">
        <span class="tp-live-icon">${a.icon}</span>
        <span class="tp-live-name">${a.name}</span>
        <div class="tp-live-bar-wrap"><div class="tp-live-bar" style="width:${Math.round(a.totalMs/maxMs*100)}%"></div></div>
        <span class="tp-live-time">${fmtMs(a.totalMs)}</span>
      </div>`).join('')
  }

  // ════════════════════════════════════════════════════════
  // UI STATES
  // ════════════════════════════════════════════════════════
  function setWorkingUI() {
    const card     = container.querySelector('#tp-card')
    const dot      = container.querySelector('#tp-dot')
    const btn      = container.querySelector('#tp-toggle')
    const breakRow = container.querySelector('#tp-break-row')
    const returnBtn= container.querySelector('#tp-return-btn')
    const taskWrap = container.querySelector('#tp-task-input-wrap')
    const currTask = container.querySelector('#tp-current-task')
    const taskDisp = container.querySelector('#tp-task-display')
    const live     = container.querySelector('#tp-live-card')
    const sub      = container.querySelector('#tp-clock-sub')
    const badge    = container.querySelector('#tp-status-text')

    card.className = 'tp-card tp-card--running'
    dot.className  = 'tp-dot tp-dot--active'
    badge.innerHTML = icon('check-circle', 13) + ' Працюємо'

    btn.disabled = false
    btn.className = 'tp-btn tp-btn--stop'
    btn.querySelector('.tp-btn-icon').textContent = '⏹'
    btn.querySelector('.tp-btn-label').textContent = 'Зупинити сесію'

    breakRow.style.display  = ''
    returnBtn.style.display = 'none'
    taskWrap.style.display  = 'none'
    currTask.style.display  = 'flex'
    taskDisp.textContent    = currentTask || '—'
    live.style.display      = 'block'
    sub.style.display       = 'none'

    setHint('Таймер запущено. Натисніть перерву коли відходите.')
  }

  function setBreakUI(bt) {
    const card     = container.querySelector('#tp-card')
    const dot      = container.querySelector('#tp-dot')
    const btn      = container.querySelector('#tp-toggle')
    const breakRow = container.querySelector('#tp-break-row')
    const returnBtn= container.querySelector('#tp-return-btn')
    const live     = container.querySelector('#tp-live-card')
    const sub      = container.querySelector('#tp-clock-sub')
    const badge    = container.querySelector('#tp-status-text')

    card.className = 'tp-card tp-card--break'
    dot.className  = 'tp-dot tp-dot--break'
    badge.innerHTML = icon(bt.iconName, 13) + ' ' + bt.label

    btn.disabled = false
    btn.className = 'tp-btn tp-btn--stop tp-btn--stop-sm'
    btn.querySelector('.tp-btn-icon').textContent = '⏹'
    btn.querySelector('.tp-btn-label').textContent = 'Завершити сесію'

    breakRow.style.display  = 'none'
    returnBtn.style.display = ''
    live.style.display      = 'none'
    sub.style.display       = ''

    clearInterval(breakInterval)
    startBreakClock(Date.now())
    setHint(`Перерва: ${bt.label}. Натисніть "Повернутись" коли готові.`)
  }

  function setIdleUI() {
    const card     = container.querySelector('#tp-card')
    const dot      = container.querySelector('#tp-dot')
    const btn      = container.querySelector('#tp-toggle')
    const breakRow = container.querySelector('#tp-break-row')
    const returnBtn= container.querySelector('#tp-return-btn')
    const taskWrap = container.querySelector('#tp-task-input-wrap')
    const currTask = container.querySelector('#tp-current-task')
    const live     = container.querySelector('#tp-live-card')
    const clock    = container.querySelector('#tp-clock')
    const sub      = container.querySelector('#tp-clock-sub')
    const badge    = container.querySelector('#tp-status-text')
    if (!btn) return

    card.className = 'tp-card'
    dot.className  = 'tp-dot tp-dot--idle'
    badge.textContent = 'Очікування…'
    clock.textContent = '00:00:00'

    btn.disabled = false
    btn.className = 'tp-btn tp-btn--start'
    btn.querySelector('.tp-btn-icon').textContent = '▶'
    btn.querySelector('.tp-btn-label').textContent = 'Почати роботу'

    breakRow.style.display  = 'none'
    returnBtn.style.display = 'none'
    taskWrap.style.display  = ''
    currTask.style.display  = 'none'
    live.style.display      = 'none'
    sub.style.display       = 'none'

    container.querySelector('#tp-task').value = ''
    currentTask = ''
    segments    = []
    setHint('Таймер відстежуватиме які програми ви відкривали')
  }

  function setHint(text) {
    const h = container.querySelector('#tp-hint')
    if (h) h.textContent = text
  }

  // ════════════════════════════════════════════════════════
  // SUMMARY HTML
  // ════════════════════════════════════════════════════════
  function buildSummaryHTML(result) {
    const { totalMs, apps = [], startTime, endTime, task, segments: segs = [] } = result
    const maxMs    = apps[0]?.totalMs || 1
    const timeFrom = new Date(startTime).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
    const timeTo   = new Date(endTime).toLocaleTimeString('uk-UA',   { hour: '2-digit', minute: '2-digit' })
    const dateStr  = new Date(startTime).toLocaleDateString('uk-UA', { weekday:'long', day:'numeric', month:'long' })

    // Work vs break time
    let workMs  = 0
    let breakMs = 0
    segs.forEach(seg => {
      const dur = (seg.endMs || endTime) - seg.startMs
      if (seg.type === 'work')  workMs  += dur
      else                      breakMs += dur
    })
    if (!segs.length) workMs = totalMs

    // Timeline
    const timelineHTML = segs.length > 1 ? `
      <div class="sum-timeline-label">Таймлайн сесії</div>
      <div class="sum-timeline">
        ${segs.map(seg => {
          const dur  = (seg.endMs || endTime) - seg.startMs
          const flex = Math.max(dur / totalMs * 100, 3)
          const from = new Date(seg.startMs).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
          return `
            <div class="sum-tl-seg sum-tl-seg--${seg.type}" style="flex:${flex}" title="${seg.label} · ${fmtMs(dur)} (${from})">
              <span class="sum-tl-icon">${icon(seg.iconName || 'briefcase', 11)}</span>
            </div>`
        }).join('')}
      </div>
      <div class="sum-segs">
        ${segs.map(seg => {
          const dur  = (seg.endMs || endTime) - seg.startMs
          const from = new Date(seg.startMs).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
          const to   = new Date(seg.endMs || endTime).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
          return `
            <div class="sum-seg-row">
              <span class="sum-seg-icon">${icon(seg.iconName || 'briefcase', 13)}</span>
              <div class="sum-seg-info">
                <span class="sum-seg-label">${seg.label}</span>
                <span class="sum-seg-range">${from} → ${to}</span>
              </div>
              <span class="sum-seg-dur sum-seg-dur--${seg.type}">${fmtMs(dur)}</span>
            </div>`
        }).join('')}
      </div>` : ''

    return `
      <div class="sum-total">
        <div class="sum-date">${dateStr}</div>
        <div class="sum-total-value">${fmtMs(totalMs)}</div>
        <div class="sum-total-range">${timeFrom} → ${timeTo}</div>
        ${task ? `<div class="sum-task" style="display:flex;align-items:center;gap:5px">${icon('pin', 12)} ${task}</div>` : ''}
        ${breakMs > 0 ? `
          <div class="sum-stats-row">
            <div class="sum-stat">
              <div class="sum-stat-val sum-stat-val--work">${fmtMs(workMs)}</div>
              <div class="sum-stat-label" style="display:flex;align-items:center;gap:3px">${icon('briefcase', 11)} Робота</div>
            </div>
            <div class="sum-stat-sep">+</div>
            <div class="sum-stat">
              <div class="sum-stat-val sum-stat-val--break">${fmtMs(breakMs)}</div>
              <div class="sum-stat-label" style="display:flex;align-items:center;gap:3px">${icon('timer', 11)} Перерви</div>
            </div>
          </div>` : ''}
      </div>

      ${timelineHTML}

      ${apps.length ? `
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
              </div>`
          }).join('')}
        </div>` : '<p class="sum-empty">Додатки не були відстежені</p>'
      }`
  }

  function showSummary(result) {
    container.querySelector('#tp-modal-body').innerHTML = buildSummaryHTML(result)
    container.querySelector('#tp-modal').style.display = 'flex'
  }

  function closeModal() {
    container.querySelector('#tp-modal').style.display = 'none'
    loadHistory()
  }

  // ── SAVE ───────────────────────────────────────────────────
  async function doSave(result) {
    const btn = container.querySelector('#tp-save')
    btn.disabled = true; btn.textContent = '...'
    try {
      await addDoc(collection(db, 'users', user.uid, 'timerSessions'), {
        task:      result.task || null,
        startTime: new Date(result.startTime).toISOString(),
        endTime:   new Date(result.endTime).toISOString(),
        totalMs:   result.totalMs,
        apps:      result.apps || [],
        segments:  (result.segments || []).map(s => ({ ...s })),
        createdAt: serverTimestamp(),
      })
      closeModal()
    } catch (err) {
      console.error(err)
      btn.innerHTML = icon('check', 14) + ' Зберегти сесію'
      btn.disabled = false
    }
  }

  // ── HISTORY ────────────────────────────────────────────────
  async function loadHistory() {
    const el = container.querySelector('#tp-history')
    if (!el) return
    try {
      const snap = await getDocs(query(
        collection(db, 'users', user.uid, 'timerSessions'),
        orderBy('createdAt', 'desc'),
      ))
      if (destroyed) return
      renderHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch {
      if (!destroyed) el.innerHTML = `<div class="tp-err" style="display:flex;align-items:center;gap:5px">${icon('warning', 14)} Помилка завантаження</div>`
    }
  }

  function renderHistory(sessions) {
    const el = container.querySelector('#tp-history')
    if (!el) return
    if (!sessions.length) {
      el.innerHTML = `
        <div class="tp-empty">
          <div class="tp-empty-icon">${icon('timer', 36)}</div>
          <div class="tp-empty-title">Сесій ще немає</div>
          <div class="tp-empty-desc">Запустіть таймер щоб почати відстеження</div>
        </div>`
      return
    }

    const groups = {}
    sessions.forEach(s => {
      const key = s.startTime
        ? new Date(s.startTime).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })
        : '—'
      if (!groups[key]) groups[key] = []
      groups[key].push(s)
    })

    el.innerHTML = Object.entries(groups).map(([date, list]) => `
      <div class="tp-group">
        <div class="tp-group-label">${date}</div>
        ${list.map(s => {
          const timeFrom = s.startTime ? new Date(s.startTime).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }) : ''
          const timeTo   = s.endTime   ? new Date(s.endTime).toLocaleTimeString('uk-UA',   { hour: '2-digit', minute: '2-digit' }) : ''
          const topApps  = (s.apps || []).slice(0, 3)
          const segs     = s.segments || []
          const breakCount = segs.filter(sg => sg.type === 'break').length

          return `
            <div class="tp-sess-card" data-id="${s.id}">
              <div class="tp-sess-time">
                <div class="tp-sess-range">${timeFrom} → ${timeTo}</div>
                ${s.task ? `<div class="tp-sess-task" style="display:flex;align-items:center;gap:4px">${icon('pin', 11)} ${s.task}</div>` : ''}
                ${breakCount ? `<div class="tp-sess-breaks">⏸ ${breakCount} перерв${breakCount > 1 ? 'и' : 'а'}</div>` : ''}
              </div>
              <div class="tp-sess-chips">
                ${topApps.map(a => `<span class="tp-chip">${a.icon} ${a.name} <span class="tp-chip-t">${fmtMs(a.totalMs)}</span></span>`).join('')}
                ${(s.apps||[]).length > 3 ? `<span class="tp-chip-more">+${s.apps.length - 3}</span>` : ''}
              </div>
              <div class="tp-sess-right">
                <div class="tp-sess-dur">${fmtMs(s.totalMs)}</div>
                <div class="tp-sess-dur-label">загалом</div>
                <div class="tp-sess-arrow">›</div>
              </div>
            </div>`
        }).join('')}
      </div>
    `).join('')

    el.querySelectorAll('.tp-sess-card').forEach(card => {
      card.addEventListener('click', () => {
        const session = sessions.find(s => s.id === card.dataset.id)
        if (session) openSessionDetail(session)
      })
    })
  }

  function openSessionDetail(session) {
    const body = container.querySelector('#tp-view-body')
    body.innerHTML = buildSummaryHTML({
      totalMs:   session.totalMs,
      apps:      session.apps || [],
      startTime: new Date(session.startTime).getTime(),
      endTime:   new Date(session.endTime).getTime(),
      task:      session.task,
      segments:  (session.segments || []).map(s => ({
        ...s,
        startMs: s.startMs || new Date(session.startTime).getTime(),
        endMs:   s.endMs   || new Date(session.endTime).getTime(),
      })),
    })
    container.querySelector('#tp-view-modal').style.display = 'flex'
  }

  // ── TOAST ─────────────────────────────────────────────────
  function showToast(msg) {
    document.querySelector('.tp-toast')?.remove()
    const el = document.createElement('div')
    el.className = 'tp-toast'
    el.textContent = msg
    document.body.appendChild(el)
    requestAnimationFrame(() => el.classList.add('show'))
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300) }, 2500)
  }

  // ── HELPERS ────────────────────────────────────────────────
  function fmtMs(ms) {
    if (!ms || ms < 0) return '00:00:00'
    const s   = Math.floor(ms / 1000)
    const h   = Math.floor(s / 3600)
    const m   = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return [h, m, sec].map(n => String(n).padStart(2, '0')).join(':')
  }
}

// ── Styles ─────────────────────────────────────────────────
function injectStyles() {
  document.getElementById('timer-styles')?.remove()
  const s = document.createElement('style')
  s.id = 'timer-styles'
  s.textContent = `
    .tp-wrap {
      display: grid; grid-template-columns: 420px 1fr;
      gap: 28px; padding: 32px 36px; align-items: start; box-sizing: border-box;
    }
    @media (max-width: 900px) { .tp-wrap { grid-template-columns: 1fr; } }

    .tp-header { margin-bottom: 20px; }
    .tp-title  { font-family: var(--font-display); font-size: 26px; font-weight: 800; margin-bottom: 4px; }
    .tp-sub    { font-size: 13px; color: var(--text-muted); }

    /* Card */
    .tp-card {
      background: var(--bg-secondary); border: 1.5px solid var(--border);
      border-radius: 24px; padding: 28px 24px 22px; text-align: center;
      margin-bottom: 16px; transition: border-color .4s, box-shadow .4s;
      position: relative; overflow: hidden;
    }
    .tp-card::before {
      content:''; position:absolute; top:0; left:0; right:0; height:3px;
      background: linear-gradient(90deg,#4F8EF7,#A78BFA,#34D399); opacity:0; transition:opacity .4s;
    }
    .tp-card--running { border-color:rgba(52,211,153,.3); box-shadow:0 0 40px rgba(52,211,153,.07); }
    .tp-card--running::before { opacity:1; }
    .tp-card--break   { border-color:rgba(251,146,60,.3); box-shadow:0 0 40px rgba(251,146,60,.07); }
    .tp-card--break::before { background:linear-gradient(90deg,#FB923C,#F59E0B,#FBBF24); opacity:1; }

    /* Status badge */
    .tp-status-badge {
      display:inline-flex; align-items:center; gap:6px;
      font-size:13px; font-weight:600; color:var(--text-secondary);
      background:var(--bg-tertiary); border-radius:var(--radius-full);
      padding:5px 14px; margin-bottom:18px;
    }
    .tp-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; transition:background .3s; }
    .tp-dot--idle   { background:var(--border); }
    .tp-dot--active { background:#34D399; animation:tp-pulse 2s ease-in-out infinite; }
    .tp-dot--break  { background:#FB923C; animation:tp-pulse 2s ease-in-out infinite; }
    @keyframes tp-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.5)} }

    /* Clock */
    .tp-clock-wrap { margin-bottom: 6px; }
    .tp-clock {
      font-family: var(--font-mono,'SF Mono','Courier New',monospace);
      font-size:60px; font-weight:800; letter-spacing:3px; line-height:1;
      color:var(--text-primary); transition:color .4s;
    }
    .tp-card--running .tp-clock { color:#34D399; }
    .tp-card--break   .tp-clock { color:#FB923C; }
    .tp-clock-sub { font-size:12px; color:var(--text-muted); margin-top:4px; margin-bottom:8px; }

    /* Current task row */
    .tp-current-task {
      display:flex; align-items:center; justify-content:center; gap:8px;
      font-size:13px; color:var(--text-secondary); margin-bottom:18px;
    }
    .tp-task-icon { display:flex; align-items:center; color:var(--accent-blue); }
    .tp-change-task-btn {
      font-size:11px; color:var(--accent-blue); background:none; border:none;
      cursor:pointer; padding:2px 6px; border-radius:4px; transition:background .15s;
      text-decoration:underline; opacity:.7;
    }
    .tp-change-task-btn:hover { opacity:1; background:rgba(79,142,247,.1); }

    /* Task input */
    .tp-task-input {
      width:100%; box-sizing:border-box; background:var(--bg-tertiary);
      border:1.5px solid var(--border); border-radius:var(--radius-md);
      padding:11px 16px; font-size:13px; color:var(--text-primary);
      text-align:center; margin-bottom:18px; outline:none;
      transition:border-color .2s; font-family:inherit;
    }
    .tp-task-input:focus { border-color:var(--accent-blue); }
    .tp-task-input::placeholder { color:var(--text-muted); }
    .tp-task-input:disabled { opacity:.4; cursor:not-allowed; }

    /* Buttons */
    .tp-btn {
      display:inline-flex; align-items:center; justify-content:center; gap:10px;
      padding:13px 32px; border-radius:var(--radius-full);
      font-size:15px; font-weight:700; cursor:pointer; border:none;
      transition:all .25s; width:100%; margin-bottom:14px;
    }
    .tp-btn:disabled { opacity:.5; cursor:not-allowed; transform:none!important; }
    .tp-btn--start {
      background:linear-gradient(135deg,#34D399 0%,#10B981 100%);
      color:#fff; box-shadow:0 6px 24px rgba(52,211,153,.35);
    }
    .tp-btn--start:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 10px 32px rgba(52,211,153,.45); }
    .tp-btn--stop {
      background:linear-gradient(135deg,#F87171 0%,#EF4444 100%);
      color:#fff; box-shadow:0 4px 16px rgba(239,68,68,.3);
    }
    .tp-btn--stop:hover:not(:disabled) { transform:translateY(-1px); }
    .tp-btn--stop-sm { padding:10px 24px; font-size:13px; }
    .tp-btn--return {
      background:linear-gradient(135deg,#34D399 0%,#10B981 100%);
      color:#fff; box-shadow:0 6px 24px rgba(52,211,153,.3);
      display:inline-flex; align-items:center; justify-content:center; gap:10px;
      padding:13px 32px; border-radius:var(--radius-full);
      font-size:15px; font-weight:700; cursor:pointer; border:none;
      transition:all .25s; width:100%; margin-bottom:14px;
    }
    .tp-btn--return:hover { transform:translateY(-2px); box-shadow:0 10px 32px rgba(52,211,153,.4); }
    .tp-btn-icon { font-size:16px; }

    /* Break buttons */
    .tp-break-row { margin-bottom:14px; }
    .tp-break-label { font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.06em; margin-bottom:8px; }
    .tp-break-btns { display:flex; flex-wrap:wrap; gap:6px; justify-content:center; }
    .tp-break-btn {
      display:inline-flex; align-items:center; gap:5px;
      padding:6px 12px; border-radius:var(--radius-full);
      font-size:12px; font-weight:600;
      background:var(--bg-tertiary); border:1.5px solid var(--border);
      color:var(--text-secondary); cursor:pointer;
      transition:all .18s;
    }
    .tp-break-btn:hover {
      background:rgba(251,146,60,.1); border-color:rgba(251,146,60,.4);
      color:#FB923C; transform:translateY(-1px);
    }

    .tp-hint { font-size:12px; color:var(--text-muted); line-height:1.5; }

    /* Live card */
    .tp-live-card {
      background:var(--bg-secondary); border:1.5px solid var(--border);
      border-radius:20px; padding:18px;
    }
    .tp-live-title { font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.05em; margin-bottom:12px; }
    .tp-live-row { display:flex; align-items:center; gap:10px; padding:6px 0; border-bottom:1px solid var(--border); }
    .tp-live-row:last-child { border-bottom:none; }
    .tp-live-icon { display:flex; align-items:center; justify-content:center; width:22px; flex-shrink:0; }
    .tp-live-name { font-size:12px; font-weight:600; width:100px; flex-shrink:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .tp-live-bar-wrap { flex:1; height:4px; background:var(--bg-tertiary); border-radius:2px; overflow:hidden; }
    .tp-live-bar { height:100%; background:linear-gradient(90deg,#4F8EF7,#A78BFA); border-radius:2px; transition:width .6s; }
    .tp-live-time { font-family:var(--font-mono,monospace); font-size:11px; color:var(--text-secondary); width:60px; text-align:right; flex-shrink:0; }

    /* History */
    .tp-hist-head { margin-bottom:18px; }
    .tp-hist-title { font-family:var(--font-display); font-size:20px; font-weight:800; margin-bottom:4px; }
    .tp-hist-sub   { font-size:12px; color:var(--text-muted); }

    .tp-group       { margin-bottom:22px; }
    .tp-group-label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:var(--text-muted); margin-bottom:8px; padding-left:2px; }

    .tp-sess-card {
      display:flex; align-items:center; gap:14px;
      background:var(--bg-secondary); border:1.5px solid var(--border);
      border-radius:16px; padding:13px 16px; margin-bottom:8px;
      cursor:pointer; transition:all .2s; user-select:none;
    }
    .tp-sess-card:hover { border-color:var(--accent-blue); transform:translateY(-1px); box-shadow:0 4px 16px rgba(79,142,247,.1); }
    .tp-sess-time  { flex-shrink:0; width:110px; }
    .tp-sess-range { font-size:12px; color:var(--text-secondary); margin-bottom:3px; }
    .tp-sess-task  { font-size:11px; color:var(--accent-blue); font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:105px; }
    .tp-sess-breaks{ font-size:11px; color:#FB923C; font-weight:600; margin-top:2px; }

    .tp-sess-chips { flex:1; display:flex; flex-wrap:wrap; gap:5px; }
    .tp-chip { display:inline-flex; align-items:center; gap:4px; background:var(--bg-tertiary); border-radius:var(--radius-full); padding:3px 9px; font-size:11px; font-weight:600; white-space:nowrap; }
    .tp-chip-t    { color:var(--text-muted); font-weight:400; }
    .tp-chip-more { font-size:11px; color:var(--text-muted); padding:3px 6px; }

    .tp-sess-right { flex-shrink:0; text-align:right; display:flex; flex-direction:column; align-items:flex-end; }
    .tp-sess-dur       { font-family:var(--font-mono,monospace); font-size:18px; font-weight:800; color:var(--accent-blue); }
    .tp-sess-dur-label { font-size:10px; color:var(--text-muted); }
    .tp-sess-arrow     { font-size:18px; color:var(--text-muted); margin-top:4px; }

    .tp-empty { text-align:center; padding:72px 24px; }
    .tp-empty-icon  { display:flex; align-items:center; justify-content:center; margin-bottom:14px; color:var(--text-muted); }
    .tp-empty-title { font-family:var(--font-display); font-size:18px; font-weight:700; margin-bottom:6px; }
    .tp-empty-desc  { font-size:13px; color:var(--text-muted); }

    .tp-spinner-wrap { display:flex; justify-content:center; padding:50px; }
    .tp-spinner { width:28px; height:28px; border:3px solid var(--border); border-top-color:var(--accent-blue); border-radius:50%; animation:tp-spin .7s linear infinite; }
    @keyframes tp-spin { to{transform:rotate(360deg)} }
    .tp-err { color:var(--text-muted); font-size:14px; padding:32px; text-align:center; }

    /* Modal */
    .tp-overlay {
      position:fixed; inset:0; background:rgba(0,0,0,.65); backdrop-filter:blur(6px);
      display:flex; align-items:center; justify-content:center; z-index:1000; padding:24px;
    }
    .tp-modal {
      background:var(--bg-secondary); border:1.5px solid var(--border);
      border-radius:24px; width:100%; max-width:560px; max-height:88vh;
      display:flex; flex-direction:column;
      box-shadow:0 24px 80px rgba(0,0,0,.5);
      animation:tp-scale .22s cubic-bezier(.34,1.2,.64,1);
    }
    .tp-modal--sm { max-width:400px; }
    @keyframes tp-scale { from{opacity:0;transform:scale(.93)} to{opacity:1;transform:scale(1)} }

    .tp-modal-head {
      display:flex; align-items:center; justify-content:space-between;
      padding:20px 22px 0; flex-shrink:0;
    }
    .tp-modal-title { font-family:var(--font-display); font-size:20px; font-weight:800; }
    .tp-modal-close {
      width:30px; height:30px; border-radius:8px; background:none; border:none;
      color:var(--text-muted); font-size:14px;
      display:flex; align-items:center; justify-content:center;
      cursor:pointer; transition:all .2s;
    }
    .tp-modal-close:hover { background:rgba(239,68,68,.15); color:#F87171; }
    .tp-modal-body { padding:18px 22px; overflow-y:auto; flex:1; }
    .tp-modal-foot {
      display:flex; gap:10px; justify-content:flex-end;
      padding:14px 22px 18px; border-top:1px solid var(--border); flex-shrink:0;
    }

    .tp-btn-ghost {
      padding:9px 20px; background:var(--bg-tertiary); border:1.5px solid var(--border);
      border-radius:var(--radius-md); font-size:13px; font-weight:600;
      color:var(--text-primary); cursor:pointer; transition:all .15s;
    }
    .tp-btn-ghost:hover { border-color:var(--accent-blue); }
    .tp-btn-save {
      padding:9px 22px; background:linear-gradient(135deg,#667eea,#4F8EF7);
      border:none; border-radius:var(--radius-md); font-size:13px; font-weight:700;
      color:#fff; cursor:pointer; transition:all .18s;
    }
    .tp-btn-save:hover { transform:translateY(-1px); box-shadow:0 4px 14px rgba(79,142,247,.4); }
    .tp-btn-save:disabled { opacity:.6; transform:none; box-shadow:none; }

    /* Summary */
    .sum-total {
      text-align:center; background:var(--bg-tertiary);
      border-radius:var(--radius-xl); padding:22px 16px; margin-bottom:20px;
    }
    .sum-date        { font-size:12px; color:var(--text-muted); text-transform:capitalize; margin-bottom:8px; }
    .sum-total-value { font-family:var(--font-mono,monospace); font-size:50px; font-weight:800; color:var(--accent-blue); line-height:1; margin-bottom:6px; }
    .sum-total-range { font-size:13px; color:var(--text-secondary); }
    .sum-task        { margin-top:8px; font-size:13px; font-weight:600; color:var(--accent-blue); }
    .sum-stats-row   { display:flex; align-items:center; justify-content:center; gap:16px; margin-top:14px; }
    .sum-stat        { text-align:center; }
    .sum-stat-val    { font-family:var(--font-mono,monospace); font-size:20px; font-weight:800; }
    .sum-stat-val--work  { color:#34D399; }
    .sum-stat-val--break { color:#FB923C; }
    .sum-stat-label  { font-size:11px; color:var(--text-muted); margin-top:2px; }
    .sum-stat-sep    { font-size:20px; color:var(--text-muted); }

    /* Timeline */
    .sum-timeline-label { font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.06em; margin-bottom:10px; }
    .sum-timeline { display:flex; height:36px; border-radius:12px; overflow:hidden; gap:2px; margin-bottom:10px; }
    .sum-tl-seg { display:flex; align-items:center; justify-content:center; min-width:24px; transition:opacity .2s; cursor:default; }
    .sum-tl-seg:hover { opacity:.8; }
    .sum-tl-seg--work  { background:rgba(52,211,153,.25); }
    .sum-tl-seg--break { background:rgba(251,146,60,.25); }
    .sum-tl-icon { display:flex; align-items:center; justify-content:center; }

    .sum-segs { display:flex; flex-direction:column; gap:6px; margin-bottom:18px; }
    .sum-seg-row { display:flex; align-items:center; gap:10px; padding:8px 12px; background:var(--bg-tertiary); border-radius:var(--radius-md); }
    .sum-seg-icon  { display:flex; align-items:center; justify-content:center; width:24px; flex-shrink:0; }
    .sum-seg-info  { flex:1; }
    .sum-seg-label { font-size:13px; font-weight:600; display:block; }
    .sum-seg-range { font-size:11px; color:var(--text-muted); }
    .sum-seg-dur   { font-family:var(--font-mono,monospace); font-size:14px; font-weight:700; flex-shrink:0; }
    .sum-seg-dur--work  { color:#34D399; }
    .sum-seg-dur--break { color:#FB923C; }

    .sum-apps-label { font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.06em; margin-bottom:12px; }
    .sum-apps  { display:flex; flex-direction:column; gap:10px; }
    .sum-empty { text-align:center; padding:20px; color:var(--text-muted); font-size:14px; }

    .sum-app-row { display:flex; align-items:center; gap:10px; }
    .sum-rank    { width:18px; font-size:12px; font-weight:700; color:var(--text-muted); flex-shrink:0; text-align:center; }
    .sum-icon    { display:flex; align-items:center; justify-content:center; width:26px; flex-shrink:0; }
    .sum-info    { flex:1; min-width:0; }
    .sum-name    { font-size:13px; font-weight:600; margin-bottom:4px; }
    .sum-bar-wrap{ height:4px; background:var(--bg-tertiary); border-radius:2px; overflow:hidden; }
    .sum-bar     { height:100%; background:linear-gradient(90deg,#4F8EF7,#A78BFA); border-radius:2px; }
    .sum-meta    { flex-shrink:0; text-align:right; width:72px; }
    .sum-time    { font-family:var(--font-mono,monospace); font-size:13px; font-weight:700; }
    .sum-pct     { font-size:11px; color:var(--text-muted); }

    /* Toast */
    .tp-toast {
      position:fixed; bottom:24px; right:24px; z-index:9999;
      padding:11px 20px; border-radius:var(--radius-md);
      background:var(--bg-secondary); border:1px solid var(--border);
      font-size:14px; font-weight:600; box-shadow:var(--shadow-xl);
      transform:translateY(16px); opacity:0; transition:all .25s;
      border-left:4px solid #34D399;
    }
    .tp-toast.show { transform:translateY(0); opacity:1; }
  `
  document.head.appendChild(s)
}
