// src/renderer/modules/appointments/index.js
import { icon } from '../../utils/icons.js'
import { db } from '../../services/firebase.js'
import { getCurrentUser, getActivePathSegments } from '../../services/auth.js'
import {
  collection, addDoc, getDocs, deleteDoc,
  doc, updateDoc, query, orderBy, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

// ── Status meta ────────────────────────────────────────────────────────────
const STATUS_META = {
  scheduled: { label: 'Заплановано', color: '#4F8EF7', bg: 'rgba(79,142,247,.12)'  },
  completed:  { label: 'Завершено',   color: '#34D399', bg: 'rgba(52,211,153,.12)'  },
  cancelled:  { label: 'Скасовано',   color: '#EF4444', bg: 'rgba(239,68,68,.12)'   },
  noshow:     { label: 'Не з\'явився', color: '#F59E0B', bg: 'rgba(245,158,11,.12)' },
}

function fmtDate(val) {
  if (!val) return '—'
  const d = new Date(val)
  if (isNaN(d)) return val
  return d.toLocaleDateString('uk-UA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtDateTime(date, time) {
  const d = fmtDate(date)
  return time ? `${d} о ${time}` : d
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function isoWeekStart(dateStr) {
  const d = new Date(dateStr || today())
  const day = d.getDay() // 0=Sun
  const diff = (day === 0 ? -6 : 1 - day)
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

function addDays(dateStr, n) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function shortDate(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('uk-UA', { weekday: 'short', day: 'numeric', month: 'short' })
}

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

// ── Styles ──────────────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('ap-styles')) return
  const style = document.createElement('style')
  style.id = 'ap-styles'
  style.textContent = `
    /* ── Layout ── */
    .ap-layout {
      display: flex;
      height: 100%;
      overflow: hidden;
      background: var(--bg-primary, #0F1117);
      font-family: inherit;
    }

    /* ── Left panel ── */
    .ap-left {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border-right: 1px solid var(--border, rgba(255,255,255,.08));
    }
    .ap-left-scroll {
      flex: 1;
      overflow-y: auto;
      padding: 0 20px 24px;
    }
    .ap-left-scroll::-webkit-scrollbar { width: 4px; }
    .ap-left-scroll::-webkit-scrollbar-track { background: transparent; }
    .ap-left-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,.12); border-radius: 2px; }

    /* ── Header ── */
    .ap-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding: 24px 20px 16px;
      flex-shrink: 0;
    }
    .ap-title {
      font-size: 22px;
      font-weight: 700;
      color: var(--text-primary, #F1F5F9);
      margin: 0 0 4px;
    }
    .ap-sub {
      font-size: 13px;
      color: var(--text-secondary, #94A3B8);
      margin: 0;
    }

    /* ── Add button ── */
    .ap-btn-add {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 9px 16px;
      background: #4F8EF7;
      color: #fff;
      border: none;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      transition: background .15s, transform .1s;
    }
    .ap-btn-add:hover { background: #3B7DE8; transform: translateY(-1px); }

    /* ── Stat cards ── */
    .ap-stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }
    .ap-stat {
      background: var(--bg-secondary, #1A1D2E);
      border: 1px solid var(--border, rgba(255,255,255,.08));
      border-radius: 12px;
      padding: 14px 16px;
      border-left: 4px solid var(--sc, #4F8EF7);
      transition: transform .15s;
    }
    .ap-stat:hover { transform: translateY(-2px); }
    .ap-stat-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: .06em;
      color: var(--sc, #4F8EF7);
      margin-bottom: 6px;
    }
    .ap-stat-val {
      font-size: 22px;
      font-weight: 700;
      color: var(--text-primary, #F1F5F9);
    }

    /* ── View tabs + week nav ── */
    .ap-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .ap-view-tabs {
      display: flex;
      gap: 4px;
      background: var(--bg-secondary, #1A1D2E);
      border-radius: 10px;
      padding: 4px;
    }
    .ap-view-tab {
      padding: 6px 14px;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-secondary, #94A3B8);
      border: none;
      background: transparent;
      border-radius: 8px;
      cursor: pointer;
      transition: all .15s;
    }
    .ap-view-tab.active {
      background: #4F8EF7;
      color: #fff;
    }
    .ap-week-nav {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .ap-week-nav button {
      width: 30px;
      height: 30px;
      border-radius: 8px;
      border: 1px solid var(--border, rgba(255,255,255,.08));
      background: var(--bg-secondary, #1A1D2E);
      color: var(--text-primary, #F1F5F9);
      font-size: 14px;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background .15s;
    }
    .ap-week-nav button:hover { background: rgba(79,142,247,.2); }
    .ap-week-label {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary, #F1F5F9);
      min-width: 180px;
      text-align: center;
    }

    /* ── Filters ── */
    .ap-filters {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .ap-pill {
      padding: 5px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      border: 1px solid var(--border, rgba(255,255,255,.08));
      background: var(--bg-secondary, #1A1D2E);
      color: var(--text-secondary, #94A3B8);
      cursor: pointer;
      transition: all .15s;
    }
    .ap-pill.active {
      background: rgba(79,142,247,.15);
      border-color: #4F8EF7;
      color: #4F8EF7;
    }

    /* ── Week view ── */
    .ap-week-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 8px;
    }
    .ap-day-col {
      background: var(--bg-secondary, #1A1D2E);
      border: 1px solid var(--border, rgba(255,255,255,.08));
      border-radius: 12px;
      overflow: hidden;
      min-height: 160px;
    }
    .ap-day-col.today-col {
      border-color: #4F8EF7;
    }
    .ap-day-head {
      padding: 10px 10px 8px;
      border-bottom: 1px solid var(--border, rgba(255,255,255,.08));
      text-align: center;
    }
    .ap-day-name {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: .05em;
      color: var(--text-secondary, #94A3B8);
      font-weight: 600;
      margin-bottom: 2px;
    }
    .ap-day-num {
      font-size: 18px;
      font-weight: 700;
      color: var(--text-primary, #F1F5F9);
    }
    .today-col .ap-day-num {
      color: #4F8EF7;
    }
    .ap-day-body {
      padding: 6px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    /* ── Week appointment chip ── */
    .ap-chip {
      padding: 6px 8px;
      border-radius: 8px;
      font-size: 11px;
      cursor: pointer;
      border-left: 3px solid var(--sc, #4F8EF7);
      background: var(--sb, rgba(79,142,247,.1));
      transition: opacity .15s, transform .1s;
    }
    .ap-chip:hover { opacity: .85; transform: translateX(2px); }
    .ap-chip.selected { outline: 1.5px solid var(--sc, #4F8EF7); }
    .ap-chip-time {
      font-weight: 700;
      color: var(--text-primary, #F1F5F9);
      margin-bottom: 2px;
    }
    .ap-chip-client {
      color: var(--text-secondary, #94A3B8);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* ── List view ── */
    .ap-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .ap-date-group-label {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .06em;
      color: var(--text-secondary, #94A3B8);
      padding: 8px 0 4px;
    }
    .ap-card {
      background: var(--bg-secondary, #1A1D2E);
      border: 1px solid var(--border, rgba(255,255,255,.08));
      border-radius: 12px;
      padding: 12px 14px;
      cursor: pointer;
      display: flex;
      gap: 12px;
      align-items: flex-start;
      border-left: 4px solid var(--sc, #4F8EF7);
      transition: background .15s, transform .1s;
    }
    .ap-card:hover { background: rgba(255,255,255,.03); transform: translateX(2px); }
    .ap-card.selected { background: rgba(79,142,247,.06); border-color: var(--sc, #4F8EF7); }
    .ap-card-time {
      font-size: 13px;
      font-weight: 700;
      color: var(--text-primary, #F1F5F9);
      min-width: 44px;
      padding-top: 2px;
    }
    .ap-card-info { flex: 1; min-width: 0; }
    .ap-card-client {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary, #F1F5F9);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 2px;
    }
    .ap-card-service {
      font-size: 12px;
      color: var(--text-secondary, #94A3B8);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ap-card-badge {
      padding: 3px 8px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
    }
    .ap-empty {
      text-align: center;
      padding: 48px 20px;
      color: var(--text-secondary, #94A3B8);
      font-size: 14px;
    }
    .ap-empty-icon { display: flex; align-items: center; justify-content: center; margin-bottom: 12px; color: var(--text-muted, #64748B); opacity: .4; }

    /* ── Right panel (detail) ── */
    .ap-right {
      width: 360px;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--bg-primary, #0F1117);
    }
    .ap-right-scroll {
      flex: 1;
      overflow-y: auto;
      padding: 24px 20px;
    }
    .ap-right-scroll::-webkit-scrollbar { width: 4px; }
    .ap-right-scroll::-webkit-scrollbar-track { background: transparent; }
    .ap-right-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,.12); border-radius: 2px; }

    /* ── Empty right panel ── */
    .ap-right-empty {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 24px;
      color: var(--text-secondary, #94A3B8);
      text-align: center;
    }
    .ap-right-empty-icon { display: flex; align-items: center; justify-content: center; opacity: .4; color: var(--text-muted, #64748B); }
    .ap-right-empty p { font-size: 14px; margin: 0; }

    /* ── Detail panel ── */
    .ap-d-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 20px;
    }
    .ap-d-title {
      font-size: 18px;
      font-weight: 700;
      color: var(--text-primary, #F1F5F9);
      margin: 0 0 6px;
    }
    .ap-d-sub {
      font-size: 13px;
      color: var(--text-secondary, #94A3B8);
    }
    .ap-d-close {
      width: 28px; height: 28px;
      border-radius: 8px;
      border: none;
      background: rgba(255,255,255,.06);
      color: var(--text-secondary, #94A3B8);
      font-size: 16px;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .ap-d-close:hover { background: rgba(255,255,255,.12); }

    .ap-d-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 20px;
    }

    .ap-d-section {
      margin-bottom: 20px;
    }
    .ap-d-row {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 10px 12px;
      background: var(--bg-secondary, #1A1D2E);
      border-radius: 10px;
      margin-bottom: 6px;
    }
    .ap-d-row-icon {
      display: flex; align-items: center; justify-content: center; color: var(--text-muted, #64748B);
      width: 22px;
      text-align: center;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .ap-d-row-body { flex: 1; min-width: 0; }
    .ap-d-row-label {
      font-size: 11px;
      color: var(--text-secondary, #94A3B8);
      margin-bottom: 2px;
    }
    .ap-d-row-value {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary, #F1F5F9);
    }

    .ap-d-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 8px;
    }
    .ap-d-btn {
      padding: 10px 14px;
      border-radius: 10px;
      border: none;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all .15s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .ap-d-btn-complete { background: rgba(52,211,153,.15); color: #34D399; }
    .ap-d-btn-complete:hover { background: rgba(52,211,153,.25); }
    .ap-d-btn-edit { background: rgba(79,142,247,.15); color: #4F8EF7; }
    .ap-d-btn-edit:hover { background: rgba(79,142,247,.25); }
    .ap-d-btn-delete { background: rgba(239,68,68,.12); color: #EF4444; }
    .ap-d-btn-delete:hover { background: rgba(239,68,68,.22); }

    /* ── Status quick change ── */
    .ap-d-statuses {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-bottom: 16px;
    }
    .ap-d-st-btn {
      padding: 5px 10px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
      border: 1px solid transparent;
      cursor: pointer;
      transition: all .15s;
    }

    /* ── Modal ── */
    .ap-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,.55);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    .ap-modal {
      background: var(--bg-secondary, #1A1D2E);
      border: 1px solid var(--border, rgba(255,255,255,.08));
      border-radius: 16px;
      padding: 28px;
      width: 480px;
      max-width: 95vw;
      max-height: 85vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0,0,0,.5);
    }
    .ap-modal::-webkit-scrollbar { width: 4px; }
    .ap-modal::-webkit-scrollbar-thumb { background: rgba(255,255,255,.1); border-radius: 2px; }
    .ap-modal-title {
      font-size: 18px;
      font-weight: 700;
      color: var(--text-primary, #F1F5F9);
      margin: 0 0 20px;
    }
    .ap-form-row {
      margin-bottom: 14px;
    }
    .ap-form-row label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary, #94A3B8);
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    .ap-form-row input,
    .ap-form-row select,
    .ap-form-row textarea {
      width: 100%;
      padding: 10px 12px;
      background: rgba(255,255,255,.05);
      border: 1px solid var(--border, rgba(255,255,255,.1));
      border-radius: 10px;
      color: var(--text-primary, #F1F5F9);
      font-size: 13px;
      outline: none;
      transition: border-color .15s;
      box-sizing: border-box;
    }
    .ap-form-row input:focus,
    .ap-form-row select:focus,
    .ap-form-row textarea:focus {
      border-color: #4F8EF7;
    }
    .ap-form-row select option { background: #1A1D2E; }
    .ap-form-row textarea { resize: vertical; min-height: 72px; }
    .ap-form-2col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .ap-modal-actions {
      display: flex;
      gap: 10px;
      margin-top: 20px;
      justify-content: flex-end;
    }
    .ap-modal-cancel {
      padding: 10px 18px;
      border-radius: 10px;
      border: 1px solid var(--border, rgba(255,255,255,.1));
      background: transparent;
      color: var(--text-secondary, #94A3B8);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    .ap-modal-cancel:hover { background: rgba(255,255,255,.05); }
    .ap-modal-submit {
      padding: 10px 20px;
      border-radius: 10px;
      border: none;
      background: #4F8EF7;
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background .15s;
    }
    .ap-modal-submit:hover { background: #3B7DE8; }
    .ap-modal-submit:disabled { opacity: .6; cursor: not-allowed; }

    /* ── Shimmer ── */
    .ap-shimmer {
      background: linear-gradient(90deg, rgba(255,255,255,.04) 25%, rgba(255,255,255,.09) 50%, rgba(255,255,255,.04) 75%);
      background-size: 200% 100%;
      animation: ap-shimmer 1.4s infinite;
      border-radius: 10px;
    }
    @keyframes ap-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
  `
  document.head.appendChild(style)
}

// ── Main render ──────────────────────────────────────────────────────────────
export async function render(container) {
  injectStyles()

  const user = await getCurrentUser()
  if (!user) { container.innerHTML = '<p style="color:#94A3B8;padding:24px">Потрібна авторизація</p>'; return }
  const base = getActivePathSegments(user.uid)

  // State
  let appointments = []
  let services     = []
  let selectedId   = null
  let filterStatus = 'all'
  let viewMode     = 'week'          // 'week' | 'list'
  let weekStart    = isoWeekStart()  // Monday of current week

  // ── Skeleton ──────────────────────────────────────────────────────────────
  container.innerHTML = `
    <div class="ap-layout">
      <div class="ap-left">
        <div class="ap-header">
          <div>
            <div class="ap-shimmer" style="width:160px;height:26px;margin-bottom:6px"></div>
            <div class="ap-shimmer" style="width:110px;height:14px"></div>
          </div>
          <div class="ap-shimmer" style="width:100px;height:36px;border-radius:10px"></div>
        </div>
        <div class="ap-left-scroll">
          <div class="ap-stats" style="margin-bottom:20px">
            ${[1,2,3,4].map(()=>`<div class="ap-shimmer" style="height:72px;border-radius:12px"></div>`).join('')}
          </div>
          ${[1,2,3,4,5].map(()=>`<div class="ap-shimmer" style="height:70px;border-radius:12px;margin-bottom:8px"></div>`).join('')}
        </div>
      </div>
      <div class="ap-right">
        <div class="ap-right-empty">
          <div class="ap-right-empty-icon">${icon('calendar', 36)}</div>
          <p>Завантаження...</p>
        </div>
      </div>
    </div>
  `

  // ── Load data ─────────────────────────────────────────────────────────────
  async function loadData() {
    try {
      const [apSnap, svSnap] = await Promise.all([
        getDocs(collection(db, ...base, 'appointments')),
        getDocs(collection(db, ...base, 'services')),
      ])
      appointments = apSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      appointments.sort((a,b) => {
        const da = (a.date||'') + ' ' + (a.time||'')
        const db2 = (b.date||'') + ' ' + (b.time||'')
        return da < db2 ? -1 : 1
      })
      services = svSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch (e) {
      console.error('ap load error', e)
    }
    renderAll()
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  function buildStats() {
    const t     = today()
    const todayAps = appointments.filter(a => a.date === t)
    const upcoming = appointments.filter(a => a.date > t && a.status !== 'cancelled')
    const completed = appointments.filter(a => a.status === 'completed').length
    const total     = appointments.length
    return [
      { label: 'Сьогодні',   val: todayAps.length,  color: '#4F8EF7' },
      { label: 'Майбутні',   val: upcoming.length,  color: '#A78BFA' },
      { label: 'Завершено',  val: completed,         color: '#34D399' },
      { label: 'Всього',     val: total,             color: '#F59E0B' },
    ]
  }

  // ── Filtered list ─────────────────────────────────────────────────────────
  function filtered() {
    let list = appointments
    if (filterStatus !== 'all') list = list.filter(a => a.status === filterStatus)
    return list
  }

  // ── Week view ─────────────────────────────────────────────────────────────
  function renderWeekView() {
    const days = Array.from({length: 7}, (_, i) => addDays(weekStart, i))
    const t    = today()
    const list = filtered()

    const cols = days.map(dateStr => {
      const d      = new Date(dateStr)
      const dayName = d.toLocaleDateString('uk-UA', { weekday: 'short' })
      const dayNum  = d.getDate()
      const isToday = dateStr === t
      const dayAps  = list.filter(a => a.date === dateStr)
        .sort((a,b) => (a.time||'') < (b.time||'') ? -1 : 1)

      const chips = dayAps.length
        ? dayAps.map(a => {
            const sm = STATUS_META[a.status] || STATUS_META.scheduled
            const sel = a.id === selectedId ? ' selected' : ''
            return `
              <div class="ap-chip${sel}" data-id="${a.id}"
                   style="--sc:${sm.color};--sb:${sm.bg}">
                <div class="ap-chip-time">${a.time || '—'}</div>
                <div class="ap-chip-client">${escHtml(a.clientName || '—')}</div>
              </div>`
          }).join('')
        : `<div style="font-size:11px;color:rgba(255,255,255,.2);text-align:center;padding:8px">—</div>`

      return `
        <div class="ap-day-col${isToday ? ' today-col' : ''}">
          <div class="ap-day-head">
            <div class="ap-day-name">${dayName}</div>
            <div class="ap-day-num">${dayNum}</div>
          </div>
          <div class="ap-day-body">${chips}</div>
        </div>`
    }).join('')

    return `<div class="ap-week-grid">${cols}</div>`
  }

  // ── List view ─────────────────────────────────────────────────────────────
  function renderListView() {
    const list = filtered()
    if (!list.length) return `
      <div class="ap-empty">
        <div class="ap-empty-icon">${icon('calendar', 40)}</div>
        <div>Записів не знайдено</div>
      </div>`

    // Group by date
    const groups = {}
    list.forEach(a => {
      const k = a.date || '—'
      if (!groups[k]) groups[k] = []
      groups[k].push(a)
    })

    return Object.entries(groups).sort((a,b)=>a[0]<b[0]?-1:1).map(([date, aps]) => {
      const t = today()
      const label = date === t ? 'Сьогодні' : fmtDate(date)
      const cards = aps.sort((a,b)=>(a.time||'')<(b.time||'')?-1:1).map(a => {
        const sm  = STATUS_META[a.status] || STATUS_META.scheduled
        const sel = a.id === selectedId ? ' selected' : ''
        return `
          <div class="ap-card${sel}" data-id="${a.id}" style="--sc:${sm.color}">
            <div class="ap-card-time">${a.time || '—'}</div>
            <div class="ap-card-info">
              <div class="ap-card-client">${escHtml(a.clientName || '—')}</div>
              <div class="ap-card-service">${escHtml(a.service || '')}${a.duration ? ` · ${a.duration} хв` : ''}</div>
            </div>
            <div class="ap-card-badge" style="background:${sm.bg};color:${sm.color}">${sm.label}</div>
          </div>`
      }).join('')

      return `
        <div class="ap-date-group-label">${label}</div>
        ${cards}`
    }).join('')
  }

  // ── Detail panel ──────────────────────────────────────────────────────────
  function renderDetail(ap) {
    const sm = STATUS_META[ap.status] || STATUS_META.scheduled
    const otherStatuses = Object.entries(STATUS_META)
      .filter(([k]) => k !== ap.status)
      .map(([k, v]) => `
        <button class="ap-d-st-btn" data-set-status="${k}"
          style="background:${v.bg};color:${v.color};border-color:${v.color}33">
          ${v.label}
        </button>`).join('')

    return `
      <div class="ap-d-header">
        <div>
          <div class="ap-d-title">${escHtml(ap.clientName || '—')}</div>
          <div class="ap-d-sub">${fmtDateTime(ap.date, ap.time)}</div>
        </div>
        <button class="ap-d-close" id="ap-d-close">${icon('x', 14)}</button>
      </div>

      <span class="ap-d-badge" style="background:${sm.bg};color:${sm.color}">${sm.label}</span>

      <div class="ap-d-section">
        <div class="ap-d-row">
          <div class="ap-d-row-icon">${icon('calendar', 14)}</div>
          <div class="ap-d-row-body">
            <div class="ap-d-row-label">Дата та час</div>
            <div class="ap-d-row-value">${fmtDateTime(ap.date, ap.time)}</div>
          </div>
        </div>
        ${ap.duration ? `
        <div class="ap-d-row">
          <div class="ap-d-row-icon">${icon('timer', 14)}</div>
          <div class="ap-d-row-body">
            <div class="ap-d-row-label">Тривалість</div>
            <div class="ap-d-row-value">${ap.duration} хв</div>
          </div>
        </div>` : ''}
        ${ap.service ? `
        <div class="ap-d-row">
          <div class="ap-d-row-icon">${icon('briefcase', 14)}</div>
          <div class="ap-d-row-body">
            <div class="ap-d-row-label">Послуга</div>
            <div class="ap-d-row-value">${escHtml(ap.service)}</div>
          </div>
        </div>` : ''}
        ${ap.phone ? `
        <div class="ap-d-row">
          <div class="ap-d-row-icon">${icon('phone', 14)}</div>
          <div class="ap-d-row-body">
            <div class="ap-d-row-label">Телефон</div>
            <div class="ap-d-row-value">${escHtml(ap.phone)}</div>
          </div>
        </div>` : ''}
        ${ap.price ? `
        <div class="ap-d-row">
          <div class="ap-d-row-icon">${icon('finances', 14)}</div>
          <div class="ap-d-row-body">
            <div class="ap-d-row-label">Вартість</div>
            <div class="ap-d-row-value">₴${Number(ap.price).toLocaleString('uk-UA')}</div>
          </div>
        </div>` : ''}
        ${ap.notes ? `
        <div class="ap-d-row">
          <div class="ap-d-row-icon">${icon('notes', 14)}</div>
          <div class="ap-d-row-body">
            <div class="ap-d-row-label">Нотатки</div>
            <div class="ap-d-row-value">${escHtml(ap.notes)}</div>
          </div>
        </div>` : ''}
      </div>

      ${ap.status === 'scheduled' ? `
      <div class="ap-d-section">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary,#94A3B8);margin-bottom:8px">Змінити статус</div>
        <div class="ap-d-statuses">${otherStatuses}</div>
      </div>` : ''}

      <div class="ap-d-actions">
        ${ap.status === 'scheduled' ? `
        <button class="ap-d-btn ap-d-btn-complete" data-complete="${ap.id}">${icon('check-circle', 13)} Позначити завершеним</button>` : ''}
        <button class="ap-d-btn ap-d-btn-edit" data-edit="${ap.id}">${icon('pencil', 13)} Редагувати</button>
        <button class="ap-d-btn ap-d-btn-delete" data-delete="${ap.id}">${icon('trash', 13)} Видалити запис</button>
      </div>
    `
  }

  // ── Full render ───────────────────────────────────────────────────────────
  function renderAll() {
    const stats    = buildStats()
    const weekEnd  = addDays(weekStart, 6)
    const weekLabel = `${shortDate(weekStart)} – ${shortDate(weekEnd)}`

    container.innerHTML = `
      <div class="ap-layout">
        <div class="ap-left">
          <div class="ap-header">
            <div>
              <h2 class="ap-title">Розклад</h2>
              <p class="ap-sub">${appointments.length} записів</p>
            </div>
            <button class="ap-btn-add" id="ap-add-btn">+ Новий запис</button>
          </div>
          <div class="ap-left-scroll">
            <div class="ap-stats">
              ${stats.map(s=>`
                <div class="ap-stat" style="--sc:${s.color}">
                  <div class="ap-stat-label">${s.label}</div>
                  <div class="ap-stat-val">${s.val}</div>
                </div>`).join('')}
            </div>

            <div class="ap-toolbar">
              <div class="ap-view-tabs">
                <button class="ap-view-tab${viewMode==='week'?' active':''}" data-view="week">${icon('calendar', 12)} Тиждень</button>
                <button class="ap-view-tab${viewMode==='list'?' active':''}" data-view="list">${icon('list', 12)} Список</button>
              </div>
              ${viewMode === 'week' ? `
              <div class="ap-week-nav">
                <button id="ap-prev-week">‹</button>
                <div class="ap-week-label">${weekLabel}</div>
                <button id="ap-next-week">›</button>
              </div>` : ''}
            </div>

            <div class="ap-filters">
              ${[
                ['all','Всі'],
                ['scheduled','Заплановані'],
                ['completed','Завершені'],
                ['cancelled','Скасовані'],
                ['noshow','Не з\'явився'],
              ].map(([k,l])=>`<button class="ap-pill${filterStatus===k?' active':''}" data-filter="${k}">${l}</button>`).join('')}
            </div>

            <div id="ap-content">
              ${viewMode === 'week' ? renderWeekView() : renderListView()}
            </div>
          </div>
        </div>

        <div class="ap-right" id="ap-right">
          ${selectedId && appointments.find(a=>a.id===selectedId)
            ? `<div class="ap-right-scroll">${renderDetail(appointments.find(a=>a.id===selectedId))}</div>`
            : `<div class="ap-right-empty">
                <div class="ap-right-empty-icon">${icon('calendar', 36)}</div>
                <p>Виберіть запис зі списку<br>або створіть новий</p>
               </div>`}
        </div>
      </div>
    `

    bindEvents()
  }

  // ── Events ────────────────────────────────────────────────────────────────
  function bindEvents() {
    // Add button
    container.querySelector('#ap-add-btn')?.addEventListener('click', () => openModal(null))

    // View tabs
    container.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        viewMode = btn.dataset.view
        renderAll()
      })
    })

    // Week nav
    container.querySelector('#ap-prev-week')?.addEventListener('click', () => {
      weekStart = addDays(weekStart, -7)
      renderAll()
    })
    container.querySelector('#ap-next-week')?.addEventListener('click', () => {
      weekStart = addDays(weekStart, 7)
      renderAll()
    })

    // Filter pills
    container.querySelectorAll('[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        filterStatus = btn.dataset.filter
        renderAll()
      })
    })

    // Card / chip click → select
    container.querySelectorAll('[data-id]').forEach(el => {
      el.addEventListener('click', () => {
        selectedId = el.dataset.id
        renderAll()
      })
    })

    // Detail close
    container.querySelector('#ap-d-close')?.addEventListener('click', () => {
      selectedId = null
      renderAll()
    })

    // Status change buttons
    container.querySelectorAll('[data-set-status]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const newStatus = btn.dataset.setStatus
        await updateStatus(selectedId, newStatus)
      })
    })

    // Complete
    container.querySelectorAll('[data-complete]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await updateStatus(btn.dataset.complete, 'completed')
      })
    })

    // Edit
    container.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const ap = appointments.find(a => a.id === btn.dataset.edit)
        if (ap) openModal(ap)
      })
    })

    // Delete
    container.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ap = appointments.find(a => a.id === btn.dataset.delete)
        if (!ap) return
        if (!confirm(`Видалити запис "${ap.clientName}"?`)) return
        try {
          await deleteDoc(doc(db, ...base, 'appointments', ap.id))
          appointments = appointments.filter(a => a.id !== ap.id)
          if (selectedId === ap.id) selectedId = null
          renderAll()
        } catch(e) { alert('Помилка: ' + e.message) }
      })
    })
  }

  // ── Update status ─────────────────────────────────────────────────────────
  async function updateStatus(id, newStatus) {
    const ap = appointments.find(a => a.id === id)
    if (!ap) return
    try {
      await updateDoc(doc(db, ...base, 'appointments', id), { status: newStatus, updatedAt: serverTimestamp() })
      ap.status = newStatus
      renderAll()
    } catch(e) { alert('Помилка: ' + e.message) }
  }

  // ── Modal ─────────────────────────────────────────────────────────────────
  function openModal(ap) {
    const isEdit = !!ap
    const svcOptions = services.map(s =>
      `<option value="${escHtml(s.name)}" ${ap?.service===s.name?'selected':''}>${escHtml(s.name)}</option>`
    ).join('')

    const overlay = document.createElement('div')
    overlay.className = 'ap-modal-overlay'
    overlay.innerHTML = `
      <div class="ap-modal">
        <h3 class="ap-modal-title">${isEdit ? 'Редагувати запис' : 'Новий запис'}</h3>

        <div class="ap-form-row">
          <label>Клієнт *</label>
          <input id="ap-f-client" type="text" placeholder="Ім'я клієнта" value="${escHtml(ap?.clientName||'')}">
        </div>

        <div class="ap-form-2col">
          <div class="ap-form-row">
            <label>Дата *</label>
            <input id="ap-f-date" type="date" value="${ap?.date || today()}">
          </div>
          <div class="ap-form-row">
            <label>Час</label>
            <input id="ap-f-time" type="time" value="${ap?.time || ''}">
          </div>
        </div>

        <div class="ap-form-2col">
          <div class="ap-form-row">
            <label>Послуга</label>
            <select id="ap-f-service">
              <option value="">— обрати —</option>
              ${svcOptions}
              <option value="__custom__">Інше (вручну)</option>
            </select>
          </div>
          <div class="ap-form-row">
            <label>Тривалість (хв)</label>
            <input id="ap-f-duration" type="number" min="5" step="5" placeholder="60" value="${ap?.duration||''}">
          </div>
        </div>

        <div class="ap-form-row" id="ap-f-custom-row" style="display:none">
          <label>Назва послуги (вручну)</label>
          <input id="ap-f-custom-service" type="text" placeholder="Назва послуги" value="">
        </div>

        <div class="ap-form-2col">
          <div class="ap-form-row">
            <label>Телефон</label>
            <input id="ap-f-phone" type="tel" placeholder="+380..." value="${escHtml(ap?.phone||'')}">
          </div>
          <div class="ap-form-row">
            <label>Вартість (₴)</label>
            <input id="ap-f-price" type="number" min="0" step="10" placeholder="0" value="${ap?.price||''}">
          </div>
        </div>

        <div class="ap-form-row">
          <label>Статус</label>
          <select id="ap-f-status">
            ${Object.entries(STATUS_META).map(([k,v])=>
              `<option value="${k}" ${(ap?.status||'scheduled')===k?'selected':''}>${v.label}</option>`
            ).join('')}
          </select>
        </div>

        <div class="ap-form-row">
          <label>Нотатки</label>
          <textarea id="ap-f-notes" placeholder="Додаткова інформація...">${escHtml(ap?.notes||'')}</textarea>
        </div>

        <div class="ap-modal-actions">
          <button class="ap-modal-cancel" id="ap-modal-cancel">Скасувати</button>
          <button class="ap-modal-submit" id="ap-modal-submit">${isEdit ? 'Зберегти' : 'Створити'}</button>
        </div>
      </div>
    `

    document.body.appendChild(overlay)

    // Custom service toggle
    const svcSel = overlay.querySelector('#ap-f-service')
    const customRow = overlay.querySelector('#ap-f-custom-row')
    // If existing ap has a custom service not in list
    if (isEdit && ap.service && !services.find(s => s.name === ap.service)) {
      svcSel.value = '__custom__'
      customRow.style.display = ''
      overlay.querySelector('#ap-f-custom-service').value = ap.service
    }
    svcSel.addEventListener('change', () => {
      customRow.style.display = svcSel.value === '__custom__' ? '' : 'none'
    })

    // Close
    const close = () => overlay.remove()
    overlay.querySelector('#ap-modal-cancel').addEventListener('click', close)
    overlay.addEventListener('click', e => { if (e.target === overlay) close() })

    // Submit
    overlay.querySelector('#ap-modal-submit').addEventListener('click', async () => {
      const clientName = overlay.querySelector('#ap-f-client').value.trim()
      if (!clientName) { alert('Вкажіть ім\'я клієнта'); return }

      let service = svcSel.value === '__custom__'
        ? overlay.querySelector('#ap-f-custom-service').value.trim()
        : svcSel.value

      const payload = {
        clientName,
        date:     overlay.querySelector('#ap-f-date').value,
        time:     overlay.querySelector('#ap-f-time').value,
        service:  service || '',
        duration: overlay.querySelector('#ap-f-duration').value || '',
        phone:    overlay.querySelector('#ap-f-phone').value.trim(),
        price:    overlay.querySelector('#ap-f-price').value || '',
        status:   overlay.querySelector('#ap-f-status').value,
        notes:    overlay.querySelector('#ap-f-notes').value.trim(),
        updatedAt: serverTimestamp(),
      }

      const submitBtn = overlay.querySelector('#ap-modal-submit')
      submitBtn.disabled = true
      submitBtn.textContent = 'Збереження...'

      try {
        if (isEdit) {
          await updateDoc(doc(db, ...base, 'appointments', ap.id), payload)
          const idx = appointments.findIndex(a => a.id === ap.id)
          if (idx !== -1) appointments[idx] = { ...appointments[idx], ...payload }
          selectedId = ap.id
        } else {
          payload.createdAt = serverTimestamp()
          const ref = await addDoc(collection(db, ...base, 'appointments'), payload)
          const newAp = { id: ref.id, ...payload }
          appointments.push(newAp)
          appointments.sort((a,b) => {
            const da = (a.date||'') + ' ' + (a.time||'')
            const db2 = (b.date||'') + ' ' + (b.time||'')
            return da < db2 ? -1 : 1
          })
          selectedId = ref.id
          // Switch week to show new appointment
          if (payload.date) weekStart = isoWeekStart(payload.date)
        }
        close()
        renderAll()
      } catch(e) {
        alert('Помилка: ' + e.message)
        submitBtn.disabled = false
        submitBtn.textContent = isEdit ? 'Зберегти' : 'Створити'
      }
    })
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  await loadData()
}
