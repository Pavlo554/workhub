// src/renderer/modules/payroll/index.js — Нарахування зарплати (ПДФО 18%, ВЗ 1.5%, ЄСВ 22%)
import { icon }                               from '../../utils/icons.js'
import { db }                                 from '../../services/firebase.js'
import { getCurrentUser, getActivePathSegments } from '../../services/auth.js'
import { invalidateRoute } from '../../../core/router.js'
import {
  collection, addDoc, getDocs, deleteDoc, doc, updateDoc,
  query, orderBy, where, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

// ── Tax constants (Ukraine 2024) ────────────────────────────────────────────
const PDFO_RATE  = 0.18  // ПДФО — утримується з нарахованої зарплати
const VZ_RATE    = 0.05  // ВЗ (воєнний збір) — з 01.10.2024 ставка 5%
const ESV_RATE   = 0.22  // ЄСВ — нараховується зверху (платить роботодавець)
const MIN_WAGE   = 8000  // Мінімальна зарплата 2024 (базова ставка ЄСВ)

// Кількість робочих днів у місяці (Пн-Пт, без урахування свят)
function workingDaysInMonth(year, month) {
  const daysInMonth = new Date(year, month, 0).getDate()
  let count = 0
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay()
    if (dow !== 0 && dow !== 6) count++
  }
  return count
}

// Скільки робочих днів співробітник реально мав відпрацювати в цьому місяці,
// враховуючи дату прийняття на роботу (startDate) та дату звільнення (dismissalDate).
// Якщо прийнятий/звільнений в середині місяця — рахує лише ту частину періоду.
// "YYYY-MM-DD" → local midnight Date. new Date(str) парсить такі рядки як UTC,
// що через зсув часової зони ламає порівняння з датами, побудованими через
// new Date(y,m,d) (локальний час) — звідси й "зайва" чи "відсутня" доба.
function parseLocalDate(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function calcWorkedDaysForPeriod(emp, year, month) {
  const monthStart = new Date(year, month - 1, 1)
  const monthEnd   = new Date(year, month, 0)
  let from = monthStart, to = monthEnd

  if (emp?.startDate) {
    const sd = parseLocalDate(emp.startDate)
    if (sd > monthEnd) return 0           // ще не прийнятий у цьому періоді
    if (sd > from) from = sd
  }
  if (emp?.dismissalDate) {
    const dd = parseLocalDate(emp.dismissalDate)
    if (dd < monthStart) return 0         // вже звільнений до цього періоду
    if (dd < to) to = dd
  }
  if (from > to) return 0

  let count = 0
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) count++
  }
  return count
}

function calcPayroll(gross, bonus = 0, workedDays = null, normDays = null) {
  // Якщо вказано відпрацьовані дні — оклад пропорційно зменшується
  const baseForPeriod = (workedDays != null && normDays > 0)
    ? Math.round((gross / normDays) * workedDays * 100) / 100
    : gross
  const accrual     = baseForPeriod + bonus
  const pdfo        = Math.round(accrual * PDFO_RATE * 100) / 100
  const vz          = Math.round(accrual * VZ_RATE  * 100) / 100
  const net         = Math.round((accrual - pdfo - vz) * 100) / 100
  const esvEmployer = Math.round(Math.max(accrual, MIN_WAGE) * ESV_RATE * 100) / 100
  const totalCost   = accrual + esvEmployer
  return { accrual, pdfo, vz, net, esvEmployer, totalCost }
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function fmt(v) {
  return '₴' + (v || 0).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const MONTH_NAMES = ['Січень','Лютий','Березень','Квітень','Травень','Червень',
                     'Липень','Серпень','Вересень','Жовтень','Листопад','Грудень']

function monthLabel(y, m) { return `${MONTH_NAMES[m - 1]} ${y}` }
function today() { return new Date().toISOString().slice(0, 10) }
function fmtDate(s) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}.${m}.${y}`
}

// ── Styles ──────────────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('pr-styles')) return
  const s = document.createElement('style')
  s.id = 'pr-styles'
  s.textContent = `
    .pr-page { display:flex; flex-direction:column; height:100%; background:var(--bg-primary,#0F1117); overflow:hidden; }
    .pr-header { display:flex; align-items:flex-start; justify-content:space-between; padding:20px 24px 0; flex-shrink:0; flex-wrap:wrap; gap:12px; }
    .pr-title  { font-size:20px; font-weight:700; color:var(--text-primary,#F1F5F9); display:flex; align-items:center; gap:8px; }
    .pr-subtitle { font-size:13px; color:var(--text-muted,#8B97B0); margin-top:2px; }
    .pr-toolbar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:16px 24px 0; flex-shrink:0; }
    .pr-period { display:flex; align-items:center; gap:6px; background:var(--bg-secondary,#1A1D27); border:1px solid var(--border,rgba(255,255,255,.08)); border-radius:8px; padding:6px 12px; }
    .pr-period select { background:var(--bg-secondary,#1A1D27); border:none; color:var(--text-primary,#F1F5F9); font-size:13px; cursor:pointer; outline:none; border-radius:5px; }
    .pr-period select option { background:#1A1D27; color:#F1F5F9; }
    .pr-btn { display:inline-flex; align-items:center; gap:6px; padding:8px 14px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; border:none; transition:.15s; }
    .pr-btn-primary { background:#4F8EF7; color:#fff; }
    .pr-btn-primary:hover { background:#3b7de8; }
    .pr-btn-green { background:rgba(52,211,153,.15); color:#34D399; }
    .pr-btn-green:hover { background:rgba(52,211,153,.25); }
    .pr-btn-outline { background:transparent; border:1px solid var(--border,rgba(255,255,255,.12)); color:var(--text-muted,#8B97B0); }
    .pr-btn-outline:hover { background:rgba(255,255,255,.06); color:var(--text-primary,#F1F5F9); }
    .pr-status { display:inline-flex; align-items:center; gap:5px; padding:4px 10px; border-radius:20px; font-size:12px; font-weight:600; }
    .pr-status.draft    { background:rgba(245,158,11,.12); color:#F59E0B; }
    .pr-status.approved { background:rgba(52,211,153,.12); color:#34D399; }
    .pr-kpi-row { display:grid; grid-template-columns:repeat(5,1fr); gap:12px; padding:16px 24px; flex-shrink:0; }
    .pr-kpi  { background:var(--bg-secondary,#1A1D27); border:1px solid var(--border,rgba(255,255,255,.08)); border-radius:10px; padding:12px 14px; }
    .pr-kpi-label { font-size:10px; color:var(--text-muted,#8B97B0); text-transform:uppercase; letter-spacing:.5px; margin-bottom:5px; }
    .pr-kpi-val   { font-size:18px; font-weight:700; color:var(--text-primary,#F1F5F9); }
    .pr-kpi-sub   { font-size:11px; color:var(--text-muted,#8B97B0); margin-top:2px; }
    .pr-scroll { flex:1; overflow-y:auto; padding:0 24px 24px; }
    .pr-table  { width:100%; border-collapse:collapse; font-size:13px; }
    .pr-table th { background:var(--bg-secondary,#1A1D27); color:var(--text-muted,#8B97B0); font-weight:500; padding:9px 12px; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.5px; position:sticky; top:0; z-index:1; white-space:nowrap; }
    .pr-table th:not(:first-child) { text-align:right; }
    .pr-table td { padding:11px 12px; border-bottom:1px solid var(--border,rgba(255,255,255,.06)); color:var(--text-primary,#F1F5F9); vertical-align:middle; }
    .pr-table td:not(:first-child) { text-align:right; font-family:monospace; font-size:13px; }
    .pr-table tr:hover td { background:rgba(255,255,255,.03); }
    .pr-table tfoot td { background:var(--bg-secondary,#1A1D27); font-weight:700; padding:10px 12px; border-top:2px solid var(--border,rgba(255,255,255,.15)); }
    .pr-emp-name { font-weight:600; color:var(--text-primary,#F1F5F9); }
    .pr-emp-pos  { font-size:11px; color:var(--text-muted,#8B97B0); }
    .pr-pdfo  { color:#F59E0B; }
    .pr-vz    { color:#FB923C; }
    .pr-esv   { color:#A78BFA; }
    .pr-net   { color:#34D399; font-weight:700; }
    .pr-cost  { color:#EF4444; }
    .pr-edit-btn { padding:3px 8px; border-radius:5px; border:none; background:rgba(79,142,247,.12); color:#4F8EF7; cursor:pointer; font-size:11px; opacity:0; transition:.15s; }
    .pr-table tr:hover .pr-edit-btn { opacity:1; }
    .pr-del-btn { padding:3px 7px; border-radius:5px; border:none; background:rgba(239,68,68,.1); color:#EF4444; cursor:pointer; font-size:11px; opacity:0; transition:.15s; margin-left:4px; }
    .pr-table tr:hover .pr-del-btn { opacity:1; }
    .pr-pay-btn { padding:4px 10px; border-radius:6px; border:none; font-size:11px; font-weight:600; cursor:pointer; white-space:nowrap; transition:.15s; }
    .pr-pay-advance { background:rgba(245,158,11,.15); color:#FBBF24; }
    .pr-pay-advance:hover { background:rgba(245,158,11,.25); }
    .pr-pay-final { background:rgba(52,211,153,.15); color:#34D399; }
    .pr-pay-final:hover { background:rgba(52,211,153,.25); }
    .pr-empty { text-align:center; padding:60px; color:var(--text-muted,#8B97B0); }
    .pr-info-box { background:rgba(79,142,247,.08); border:1px solid rgba(79,142,247,.2); border-radius:8px; padding:10px 14px; margin:0 24px 12px; font-size:12px; color:var(--text-muted,#8B97B0); display:flex; gap:8px; align-items:flex-start; flex-shrink:0; }
    .pr-tabs { display:flex; gap:2px; background:var(--bg-secondary,#1A1D27); border-radius:8px; padding:3px; margin-left:auto; }
    .pr-tab  { padding:6px 14px; border-radius:6px; border:none; background:transparent; color:var(--text-muted,#8B97B0); cursor:pointer; font-size:13px; transition:.15s; }
    .pr-tab.active { background:var(--bg-primary,#0F1117); color:var(--text-primary,#F1F5F9); }

    /* Modal */
    .pr-overlay { position:fixed; inset:0; background:rgba(0,0,0,.6); display:flex; align-items:center; justify-content:center; z-index:1000; backdrop-filter:blur(4px); }
    .pr-modal  { background:var(--bg-secondary,#1A1D27); border:1px solid var(--border,rgba(255,255,255,.1)); border-radius:14px; padding:24px; width:480px; max-width:90vw; }
    .pr-modal h3 { font-size:16px; font-weight:700; color:var(--text-primary,#F1F5F9); margin-bottom:18px; display:flex; align-items:center; gap:8px; }
    .pr-field  { margin-bottom:12px; }
    .pr-field label { display:block; font-size:12px; color:var(--text-muted,#8B97B0); margin-bottom:4px; }
    .pr-field input, .pr-field select {
      width:100%; background:var(--bg-primary,#0F1117); border:1px solid var(--border,rgba(255,255,255,.1));
      border-radius:8px; padding:9px 12px; color:var(--text-primary,#F1F5F9); font-size:13px;
      outline:none; transition:border .15s; box-sizing:border-box;
    }
    .pr-field input:focus, .pr-field select:focus { border-color:#4F8EF7; }
    .pr-field select option { background:#1A1D27; color:#F1F5F9; }
    .pr-modal-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .pr-calc-preview { background:var(--bg-primary,#0F1117); border-radius:10px; padding:14px; margin-top:12px; font-size:13px; }
    .pr-calc-row { display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid var(--border,rgba(255,255,255,.06)); }
    .pr-calc-row:last-child { border:none; font-weight:700; font-size:14px; margin-top:4px; }
    .pr-modal-actions { display:flex; gap:8px; justify-content:flex-end; margin-top:18px; }
    .pr-modal-cancel { padding:8px 16px; border-radius:8px; border:1px solid var(--border,rgba(255,255,255,.1)); background:transparent; color:var(--text-muted,#8B97B0); cursor:pointer; font-size:13px; }
    .pr-modal-save   { padding:8px 16px; border-radius:8px; border:none; background:#4F8EF7; color:#fff; cursor:pointer; font-size:13px; font-weight:600; }
    .pr-history-list { display:flex; flex-direction:column; gap:8px; }
    .pr-hist-item { background:var(--bg-secondary,#1A1D27); border:1px solid var(--border,rgba(255,255,255,.08)); border-radius:10px; padding:14px 16px; display:flex; align-items:center; gap:12px; cursor:pointer; transition:.15s; }
    .pr-hist-item:hover { border-color:rgba(79,142,247,.3); }
    .pr-hist-period { font-size:15px; font-weight:700; color:var(--text-primary,#F1F5F9); flex:1; }
    .pr-hist-meta   { font-size:12px; color:var(--text-muted,#8B97B0); }
  `
  document.head.appendChild(s)
}

// ── Main render ──────────────────────────────────────────────────────────────
export async function render(container) {
  injectStyles()
  const user = getCurrentUser()
  const base = getActivePathSegments(user.uid)
  const periodsRef  = () => collection(db, ...base, 'payroll_periods')
  const entriesRef  = () => collection(db, ...base, 'payroll_entries')
  const empRef      = () => collection(db, ...base, 'employees')
  const cashbookRef = () => collection(db, ...base, 'cashbook')

  // Створює РКО (видатковий касовий ордер) в Касі при виплаті авансу/зарплати
  async function payOut(emp, amount, category, paymentMethod) {
    const snap = await getDocs(cashbookRef())
    const maxNum = snap.docs
      .map(d => d.data())
      .filter(e => e.type === 'rko')
      .map(e => parseInt((e.docNum || '').replace(/\D/g, '')) || 0)
      .reduce((a, b) => Math.max(a, b), 0)
    const docNum = `РКО-${String(maxNum + 1).padStart(3, '0')}`
    await addDoc(cashbookRef(), {
      type: 'rko',
      docNum,
      date: today(),
      counterparty: emp.name,
      paymentMethod,
      category,
      description: `${category} — ${emp.name} (${monthLabel(selYear, selMonth)})`,
      amount,
      createdAt: serverTimestamp(),
    })
    invalidateRoute('cashbook')
  }

  const now = new Date()
  let selYear  = now.getFullYear()
  let selMonth = now.getMonth() + 1
  let activeTab = 'current'  // 'current' | 'history'
  let currentPeriod  = null  // loaded period doc
  let currentEntries = []    // payroll entries for current period
  let employees      = []    // HR employees

  async function loadAll() {
    try {
      // Load HR employees
      const empSnap = await getDocs(query(empRef(), orderBy('createdAt', 'asc')))
      employees = empSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e.status !== 'fired')
    } catch { employees = [] }

    await loadPeriod()
  }

  async function loadPeriod() {
    try {
      // No composite index needed — load all periods, filter client-side
      const pSnap = await getDocs(periodsRef())
      const allPeriods = pSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      const found = allPeriods.find(p => p.year === selYear && p.month === selMonth)
      currentPeriod = found || null

      if (currentPeriod) {
        // Only single-field where — no composite index
        const eSnap = await getDocs(query(entriesRef(), where('periodId', '==', currentPeriod.id)))
        currentEntries = eSnap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'uk'))
      } else {
        currentEntries = []
      }
    } catch { currentPeriod = null; currentEntries = [] }
    rerender()
  }

  // Summary calculations
  function calcTotals(entries) {
    return entries.reduce((t, e) => ({
      accrual:     t.accrual     + (e.accrual || 0),
      pdfo:        t.pdfo        + (e.pdfo    || 0),
      vz:          t.vz          + (e.vz      || 0),
      net:         t.net         + (e.net     || 0),
      esvEmployer: t.esvEmployer + (e.esvEmployer || 0),
      totalCost:   t.totalCost   + (e.totalCost   || 0),
    }), { accrual:0, pdfo:0, vz:0, net:0, esvEmployer:0, totalCost:0 })
  }

  function rerender() {
    const yearOpts  = Array.from({length:5}, (_,i) => now.getFullYear()-4+i)
      .map(y => `<option value="${y}" ${y===selYear?'selected':''}>${y}</option>`).join('')
    const monthOpts = Array.from({length:12}, (_,i) => i+1)
      .map(m => `<option value="${m}" ${m===selMonth?'selected':''}>${MONTH_NAMES[m-1]}</option>`).join('')

    const totals    = calcTotals(currentEntries)
    const isApproved = currentPeriod?.status === 'approved'

    // Payroll rows
    const rows = currentEntries.map(e => `
      <tr>
        <td>
          <div class="pr-emp-name">${e.name || '—'}</div>
          <div class="pr-emp-pos">${e.position || ''}</div>
        </td>
        <td>${fmt(e.baseSalary)}</td>
        <td style="${e.workedDays != null && e.workedDays < (e.normDays||0) ? 'color:#F59E0B' : ''}">${e.workedDays != null ? `${e.workedDays}/${e.normDays||'—'}` : '—'}</td>
        <td>${e.bonus > 0 ? fmt(e.bonus) : '—'}</td>
        <td>${fmt(e.accrual)}</td>
        <td class="pr-pdfo">${fmt(e.pdfo)}</td>
        <td class="pr-vz">${fmt(e.vz)}</td>
        <td class="pr-net">${fmt(e.net)}</td>
        <td class="pr-esv">${fmt(e.esvEmployer)}</td>
        <td class="pr-cost">${fmt(e.totalCost)}
          ${!isApproved ? `
            <button class="pr-edit-btn" data-id="${e.id}">✎</button>
            <button class="pr-del-btn" data-id="${e.id}">✕</button>
          ` : ''}
        </td>
        <td style="text-align:left">
          ${(() => {
            const advance  = e.advancePaid || 0
            const remain   = Math.round((e.net - advance) * 100) / 100
            const paidFull = !!e.salaryPaidAt
            return `
              <div style="display:flex;flex-direction:column;gap:4px;font-family:inherit">
                ${advance > 0 ? `<span style="font-size:11px;color:#FBBF24">Аванс: ${fmt(advance)} (${fmtDate(e.advancePaidAt)})</span>` : ''}
                ${paidFull ? `<span style="font-size:11px;color:#34D399">✓ Виплачено повністю (${fmtDate(e.salaryPaidAt)})</span>` : ''}
                <div style="display:flex;gap:6px">
                  ${(!paidFull && advance === 0) ? `<button class="pr-pay-btn pr-pay-advance" data-id="${e.id}">Аванс</button>` : ''}
                  ${!paidFull ? `<button class="pr-pay-btn pr-pay-final" data-id="${e.id}">Виплатити ${advance > 0 ? `залишок (${fmt(remain)})` : 'ЗП'}</button>` : ''}
                </div>
              </div>`
          })()}
        </td>
      </tr>`).join('')

    container.innerHTML = `
      <div class="pr-page">
        <div class="pr-header">
          <div>
            <div class="pr-title">${icon('calculator', 20)} Нарахування зарплати</div>
            <div class="pr-subtitle">${monthLabel(selYear, selMonth)} · ${employees.length} співробітників</div>
          </div>
          <div class="pr-tabs">
            <button class="pr-tab ${activeTab==='current'?'active':''}" id="pr-tab-curr">Поточний місяць</button>
            <button class="pr-tab ${activeTab==='history'?'active':''}" id="pr-tab-hist">Архів</button>
          </div>
        </div>

        ${activeTab === 'current' ? `
          <div class="pr-toolbar">
            <div class="pr-period">
              <select id="pr-year">${yearOpts}</select>
              <select id="pr-month">${monthOpts}</select>
            </div>
            ${currentPeriod
              ? `<span class="pr-status ${currentPeriod.status || 'draft'}">${currentPeriod.status === 'approved' ? '✓ Затверджено' : '○ Чернетка'}</span>`
              : ''}
            ${!currentPeriod
              ? `<button class="pr-btn pr-btn-primary" id="pr-init">${icon('plus', 14)} Розрахувати зарплату</button>`
              : (!isApproved ? `
                  <button class="pr-btn pr-btn-green" id="pr-sync-hr">${icon('refresh', 14)} Підтягнути з Кадрів</button>
                  <button class="pr-btn pr-btn-outline" id="pr-add-emp">${icon('plus', 14)} Додати вручну</button>
                  <button class="pr-btn pr-btn-outline" id="pr-approve">Затвердити відомість</button>
                  <button class="pr-btn" style="background:rgba(239,68,68,.1);color:#EF4444" id="pr-del-period">Видалити</button>
                ` : `
                  <button class="pr-btn pr-btn-outline" id="pr-print">🖨️ Роздрукувати</button>
                  <button class="pr-btn" style="background:rgba(239,68,68,.1);color:#EF4444;font-size:12px" id="pr-del-period">Скасувати затвердження</button>
                `)}
          </div>

          <div class="pr-info-box">
            ℹ️ Ставки з 01.10.2024: ПДФО 18% · ВЗ 5% · ЄСВ 22% (мін. база ${MIN_WAGE.toLocaleString('uk-UA')} грн)
          </div>

          ${!currentPeriod ? `
            <div class="pr-empty">
              <div style="font-size:32px;margin-bottom:8px">📋</div>
              <div>Відомість за ${monthLabel(selYear, selMonth)} ще не створена</div>
              <div style="font-size:12px;margin-top:6px">Натисніть «Розрахувати зарплату» щоб створити відомість</div>
            </div>
          ` : `
            <div class="pr-kpi-row">
              <div class="pr-kpi">
                <div class="pr-kpi-label">Нараховано</div>
                <div class="pr-kpi-val">${fmt(totals.accrual)}</div>
                <div class="pr-kpi-sub">${currentEntries.length} співробітників</div>
              </div>
              <div class="pr-kpi">
                <div class="pr-kpi-label">ПДФО (18%)</div>
                <div class="pr-kpi-val pr-pdfo">${fmt(totals.pdfo)}</div>
              </div>
              <div class="pr-kpi">
                <div class="pr-kpi-label">ВЗ (1.5%)</div>
                <div class="pr-kpi-val pr-vz">${fmt(totals.vz)}</div>
              </div>
              <div class="pr-kpi">
                <div class="pr-kpi-label">До виплати</div>
                <div class="pr-kpi-val pr-net">${fmt(totals.net)}</div>
              </div>
              <div class="pr-kpi">
                <div class="pr-kpi-label">ЄСВ + витрати</div>
                <div class="pr-kpi-val pr-cost">${fmt(totals.totalCost)}</div>
                <div class="pr-kpi-sub">ЄСВ: ${fmt(totals.esvEmployer)}</div>
              </div>
            </div>

            <div class="pr-scroll">
              ${currentEntries.length === 0 ? `
                <div class="pr-empty">Немає співробітників у відомості. Натисніть «Додати».</div>
              ` : `
                <table class="pr-table">
                  <thead><tr>
                    <th>Співробітник</th>
                    <th>Оклад</th>
                    <th>Дні</th>
                    <th>Доп.</th>
                    <th>Нарах.</th>
                    <th>ПДФО</th>
                    <th>ВЗ</th>
                    <th>До виплати</th>
                    <th>ЄСВ</th>
                    <th>Витрати</th>
                    <th>Виплата</th>
                  </tr></thead>
                  <tbody>${rows}</tbody>
                  <tfoot><tr>
                    <td>Разом</td>
                    <td></td><td></td><td></td>
                    <td>${fmt(totals.accrual)}</td>
                    <td class="pr-pdfo">${fmt(totals.pdfo)}</td>
                    <td class="pr-vz">${fmt(totals.vz)}</td>
                    <td class="pr-net">${fmt(totals.net)}</td>
                    <td class="pr-esv">${fmt(totals.esvEmployer)}</td>
                    <td class="pr-cost">${fmt(totals.totalCost)}</td>
                    <td></td>
                  </tr></tfoot>
                </table>
              `}
            </div>
          `}
        ` : `
          <div class="pr-scroll" style="margin-top:16px">
            <div id="pr-history-content"><div style="text-align:center;padding:40px;color:var(--text-muted,#8B97B0)">Завантаження...</div></div>
          </div>
        `}
      </div>
    `

    // Bind events
    container.querySelector('#pr-year')?.addEventListener('change', e => { selYear = +e.target.value; loadPeriod() })
    container.querySelector('#pr-month')?.addEventListener('change', e => { selMonth = +e.target.value; loadPeriod() })
    container.querySelector('#pr-tab-curr')?.addEventListener('click', () => { activeTab = 'current'; rerender() })
    container.querySelector('#pr-tab-hist')?.addEventListener('click', () => { activeTab = 'history'; rerender(); loadHistory() })
    container.querySelector('#pr-init')?.addEventListener('click', () => initPeriod())
    container.querySelector('#pr-sync-hr')?.addEventListener('click', () => syncFromHR())
    container.querySelector('#pr-add-emp')?.addEventListener('click', () => openEntryModal(null))
    container.querySelector('#pr-approve')?.addEventListener('click', () => approvePeriod())
    container.querySelector('#pr-del-period')?.addEventListener('click', () => deletePeriod())
    container.querySelector('#pr-print')?.addEventListener('click', () => printPayroll())

    container.querySelectorAll('.pr-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const entry = currentEntries.find(e => e.id === btn.dataset.id)
        if (entry) openEntryModal(entry)
      })
    })
    container.querySelectorAll('.pr-del-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteEntry(btn.dataset.id))
    })
    container.querySelectorAll('.pr-pay-advance').forEach(btn => {
      btn.addEventListener('click', () => openPayModal(currentEntries.find(e => e.id === btn.dataset.id), 'advance'))
    })
    container.querySelectorAll('.pr-pay-final').forEach(btn => {
      btn.addEventListener('click', () => openPayModal(currentEntries.find(e => e.id === btn.dataset.id), 'final'))
    })
  }

  // ── Виплата авансу / зарплати ───────────────────────────────
  function openPayModal(entry, kind) {
    if (!entry) return
    const advance  = entry.advancePaid || 0
    const defaultAmount = kind === 'advance'
      ? Math.round(entry.net / 2 * 100) / 100
      : Math.round((entry.net - advance) * 100) / 100

    const overlay = document.createElement('div')
    overlay.className = 'pr-overlay'
    overlay.innerHTML = `
      <div class="pr-modal">
        <h3>${icon('finances', 16)} ${kind === 'advance' ? 'Виплата авансу' : 'Виплата зарплати'} — ${entry.name}</h3>
        <div class="pr-field">
          <label>Сума (грн)</label>
          <input id="pm-amount" type="number" min="0.01" step="0.01" value="${defaultAmount}">
        </div>
        <div class="pr-field">
          <label>Спосіб виплати</label>
          <select id="pm-method">
            <option value="cash">Готівка</option>
            <option value="terminal">Термінал</option>
            <option value="transfer">Безготівково (на картку)</option>
          </select>
        </div>
        <div class="pr-modal-actions">
          <button class="pr-modal-cancel" id="pm-cancel">Скасувати</button>
          <button class="pr-modal-save" id="pm-save">Виплатити</button>
        </div>
      </div>
    `
    document.body.appendChild(overlay)
    const close = () => overlay.remove()
    overlay.querySelector('#pm-cancel').addEventListener('click', close)
    overlay.addEventListener('click', e => { if (e.target === overlay) close() })
    overlay.querySelector('#pm-save').addEventListener('click', async () => {
      const amount = parseFloat(overlay.querySelector('#pm-amount').value)
      const method = overlay.querySelector('#pm-method').value
      if (!amount || amount <= 0) { alert('Введіть суму'); return }
      const btn = overlay.querySelector('#pm-save')
      btn.disabled = true; btn.textContent = 'Виплата...'
      try {
        const methodLabels = { cash: 'Готівка', terminal: 'Термінал', transfer: 'Контрагент' }
        await payOut(entry, amount, kind === 'advance' ? 'Аванс' : 'Зарплата', method)
        if (kind === 'advance') {
          await updateDoc(doc(db, ...base, 'payroll_entries', entry.id), {
            advancePaid: amount, advancePaidAt: today(), advancePayMethod: method,
          })
        } else {
          await updateDoc(doc(db, ...base, 'payroll_entries', entry.id), {
            salaryPaidAt: today(), salaryPayMethod: method, finalPaidAmount: amount,
          })
        }
        close()
        await loadPeriod()
        alert(`Виплачено ${fmt(amount)} (${methodLabels[method]}). Запис додано в Касу як РКО.`)
      } catch (err) { btn.disabled = false; btn.textContent = 'Виплатити'; alert('Помилка: ' + err.message) }
    })
  }

  // Initialize payroll period from HR employees
  async function initPeriod() {
    const periodDoc = await addDoc(periodsRef(), {
      year: selYear, month: selMonth,
      status: 'draft',
      createdAt: serverTimestamp(),
    })
    currentPeriod = { id: periodDoc.id, year: selYear, month: selMonth, status: 'draft' }

    // Auto-populate from HR employees
    const normDays = workingDaysInMonth(selYear, selMonth)
    if (employees.length > 0) {
      const saves = employees.map(emp => {
        const workedDays = calcWorkedDaysForPeriod(emp, selYear, selMonth)
        const calc = calcPayroll(emp.salary || 0, 0, workedDays, normDays)
        return addDoc(entriesRef(), {
          periodId:    periodDoc.id,
          employeeId:  emp.id,
          name:        emp.name || '',
          position:    emp.position || emp.role || '',
          baseSalary:  emp.salary || 0,
          bonus:       0,
          workedDays,
          normDays,
          ...calc,
          createdAt: serverTimestamp(),
        })
      })
      await Promise.all(saves)
    }
    await loadPeriod()
  }

  // Підтягнути в існуючу (ще не затверджену) відомість співробітників з HR,
  // яких там ще немає — корисно якщо HR оновили вже після створення відомості
  async function syncFromHR() {
    if (!currentPeriod) return
    const normDays = workingDaysInMonth(selYear, selMonth)
    const existingEmpIds = new Set(currentEntries.map(e => e.employeeId).filter(Boolean))
    const toAdd = employees.filter(emp => !existingEmpIds.has(emp.id))

    if (toAdd.length === 0) { alert('Усі співробітники з Кадрів вже у відомості'); return }

    const saves = toAdd.map(emp => {
      const workedDays = calcWorkedDaysForPeriod(emp, selYear, selMonth)
      const calc = calcPayroll(emp.salary || 0, 0, workedDays, normDays)
      return addDoc(entriesRef(), {
        periodId:    currentPeriod.id,
        employeeId:  emp.id,
        name:        emp.name || '',
        position:    emp.position || emp.role || '',
        baseSalary:  emp.salary || 0,
        bonus:       0,
        workedDays,
        normDays,
        ...calc,
        createdAt: serverTimestamp(),
      })
    })
    await Promise.all(saves)
    await loadPeriod()
  }

  async function approvePeriod() {
    if (!currentPeriod || !confirm('Затвердити відомість за ' + monthLabel(selYear, selMonth) + '?')) return
    const totals = calcTotals(currentEntries)
    try {
      await updateDocHelper(currentPeriod.id, { status: 'approved', ...totals })
      await loadPeriod()
    } catch (err) { alert('Помилка: ' + err.message) }
  }

  async function updateDocHelper(id, data) {
    await updateDoc(doc(db, ...base, 'payroll_periods', id), data)
  }

  async function deletePeriod() {
    if (!currentPeriod || !confirm('Видалити відомість? Всі нарахування цього місяця будуть видалені.')) return
    await Promise.all(currentEntries.map(e => deleteDoc(doc(db, ...base, 'payroll_entries', e.id)).catch(() => {})))
    await deleteDoc(doc(db, ...base, 'payroll_periods', currentPeriod.id)).catch(() => {})
    currentPeriod = null; currentEntries = []
    await loadPeriod()
  }

  async function deleteEntry(id) {
    if (!confirm('Видалити запис?')) return
    await deleteDoc(doc(db, ...base, 'payroll_entries', id)).catch(() => {})
    await loadPeriod()
  }

  function openEntryModal(existing) {
    const overlay = document.createElement('div')
    overlay.className = 'pr-overlay'
    const normDays = existing?.normDays || workingDaysInMonth(selYear, selMonth)

    const empOptions = employees.map(e =>
      `<option value="${e.id}" ${existing?.employeeId === e.id ? 'selected' : ''} data-salary="${e.salary||0}" data-pos="${e.position||e.role||''}" data-name="${e.name||''}" data-worked="${calcWorkedDaysForPeriod(e, selYear, selMonth)}">${e.name}${e.position ? ' · ' + e.position : ''}</option>`
    ).join('')

    overlay.innerHTML = `
      <div class="pr-modal">
        <h3>${existing ? '✎ Редагувати' : icon('plus', 16) + ' Додати'} співробітника до відомості</h3>
        ${employees.length > 0 && !existing ? `
          <div class="pr-field">
            <label>Оберіть зі списку співробітників HR</label>
            <select id="pr-emp-sel"><option value="">— Ввести вручну —</option>${empOptions}</select>
          </div>
        ` : ''}
        <div class="pr-modal-row">
          <div class="pr-field">
            <label>П.І.Б. *</label>
            <input id="pr-name" value="${existing?.name || ''}" placeholder="Ім'я співробітника">
          </div>
          <div class="pr-field">
            <label>Посада</label>
            <input id="pr-pos" value="${existing?.position || ''}" placeholder="Посада">
          </div>
        </div>
        <div class="pr-modal-row">
          <div class="pr-field">
            <label>Оклад (грн) *</label>
            <input id="pr-salary" type="number" min="0" step="100" value="${existing?.baseSalary || ''}" placeholder="0.00">
          </div>
          <div class="pr-field">
            <label>Доплата / Премія</label>
            <input id="pr-bonus" type="number" min="0" step="100" value="${existing?.bonus || 0}" placeholder="0.00">
          </div>
        </div>
        <div class="pr-modal-row">
          <div class="pr-field">
            <label>Відпрацьовано днів</label>
            <input id="pr-workdays" type="number" min="0" step="1" value="${existing?.workedDays ?? normDays}" placeholder="0">
          </div>
          <div class="pr-field">
            <label>Норма днів (місяць)</label>
            <input id="pr-normdays" type="number" min="1" step="1" value="${normDays}">
          </div>
        </div>
        <div class="pr-calc-preview" id="pr-preview">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">ПОПЕРЕДНІЙ РОЗРАХУНОК</div>
          <div class="pr-calc-row"><span>Нараховано</span><span id="pv-accrual">—</span></div>
          <div class="pr-calc-row"><span>ПДФО (18%)</span><span id="pv-pdfo" class="pr-pdfo">—</span></div>
          <div class="pr-calc-row"><span>ВЗ (1.5%)</span><span id="pv-vz" class="pr-vz">—</span></div>
          <div class="pr-calc-row"><span>ЄСВ роботодавець (22%)</span><span id="pv-esv" class="pr-esv">—</span></div>
          <div class="pr-calc-row"><span style="color:#34D399">До виплати</span><span id="pv-net" class="pr-net">—</span></div>
          <div class="pr-calc-row"><span>Витрати роботодавця</span><span id="pv-cost" class="pr-cost">—</span></div>
        </div>
        <div class="pr-modal-actions">
          <button class="pr-modal-cancel" id="pr-cancel">Скасувати</button>
          <button class="pr-modal-save" id="pr-save">Зберегти</button>
        </div>
      </div>
    `
    document.body.appendChild(overlay)

    function updatePreview() {
      const salary     = parseFloat(overlay.querySelector('#pr-salary').value) || 0
      const bonus      = parseFloat(overlay.querySelector('#pr-bonus').value)  || 0
      const workedDays = parseFloat(overlay.querySelector('#pr-workdays').value)
      const normD      = parseFloat(overlay.querySelector('#pr-normdays').value) || normDays
      const calc   = calcPayroll(salary, bonus, isNaN(workedDays) ? normD : workedDays, normD)
      overlay.querySelector('#pv-accrual').textContent = fmt(calc.accrual)
      overlay.querySelector('#pv-pdfo').textContent    = fmt(calc.pdfo)
      overlay.querySelector('#pv-vz').textContent      = fmt(calc.vz)
      overlay.querySelector('#pv-esv').textContent     = fmt(calc.esvEmployer)
      overlay.querySelector('#pv-net').textContent     = fmt(calc.net)
      overlay.querySelector('#pv-cost').textContent    = fmt(calc.totalCost)
    }
    overlay.querySelector('#pr-salary')?.addEventListener('input', updatePreview)
    overlay.querySelector('#pr-workdays')?.addEventListener('input', updatePreview)
    overlay.querySelector('#pr-normdays')?.addEventListener('input', updatePreview)
    overlay.querySelector('#pr-bonus')?.addEventListener('input', updatePreview)
    overlay.querySelector('#pr-emp-sel')?.addEventListener('change', e => {
      const opt = e.target.selectedOptions[0]
      if (opt?.value) {
        overlay.querySelector('#pr-name').value     = opt.dataset.name || ''
        overlay.querySelector('#pr-pos').value      = opt.dataset.pos  || ''
        overlay.querySelector('#pr-salary').value   = opt.dataset.salary || ''
        overlay.querySelector('#pr-workdays').value = opt.dataset.worked ?? normDays
        updatePreview()
      }
    })
    if (existing) updatePreview()

    overlay.querySelector('#pr-cancel').addEventListener('click', () => overlay.remove())
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
    overlay.querySelector('#pr-save').addEventListener('click', async () => {
      const name       = overlay.querySelector('#pr-name').value.trim()
      const salary      = parseFloat(overlay.querySelector('#pr-salary').value) || 0
      const bonus       = parseFloat(overlay.querySelector('#pr-bonus').value)  || 0
      const normD       = parseFloat(overlay.querySelector('#pr-normdays').value) || normDays
      const workedDaysV = overlay.querySelector('#pr-workdays').value
      const workedDays  = workedDaysV === '' ? normD : parseFloat(workedDaysV)
      if (!name || !salary) { alert("Введіть ім'я та оклад"); return }
      const calc = calcPayroll(salary, bonus, workedDays, normD)
      const btn  = overlay.querySelector('#pr-save')
      btn.textContent = 'Збереження...'; btn.disabled = true
      try {
        if (existing) {
          await updateDoc(doc(db, ...base, 'payroll_entries', existing.id), {
            name, position: overlay.querySelector('#pr-pos').value.trim(),
            baseSalary: salary, bonus, workedDays, normDays: normD, ...calc,
          })
        } else {
          const empSel = overlay.querySelector('#pr-emp-sel')
          await addDoc(entriesRef(), {
            periodId:    currentPeriod.id,
            employeeId:  empSel?.value || null,
            name,
            position:    overlay.querySelector('#pr-pos').value.trim(),
            baseSalary:  salary, bonus, workedDays, normDays: normD,
            ...calc,
            createdAt: serverTimestamp(),
          })
        }
        overlay.remove()
        await loadPeriod()
      } catch (err) { btn.textContent = 'Зберегти'; btn.disabled = false; alert('Помилка: ' + err.message) }
    })
  }

  async function loadHistory() {
    const el = container.querySelector('#pr-history-content')
    if (!el) return
    try {
      // No composite index — load all, sort client-side
      const snap = await getDocs(periodsRef())
      const periods = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => b.year !== a.year ? b.year - a.year : b.month - a.month)
      if (periods.length === 0) {
        el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted,#8B97B0)">Відомостей ще немає</div>'
        return
      }
      el.innerHTML = `<div class="pr-history-list">${periods.map(p => `
        <div class="pr-hist-item" data-y="${p.year}" data-m="${p.month}">
          <span style="font-size:24px">📋</span>
          <div style="flex:1">
            <div class="pr-hist-period">${monthLabel(p.year, p.month)}</div>
            <div class="pr-hist-meta">
              Нараховано: ${fmt(p.accrual || 0)} · До виплати: ${fmt(p.net || 0)} · ЄСВ: ${fmt(p.esvEmployer || 0)}
            </div>
          </div>
          <span class="pr-status ${p.status || 'draft'}">${p.status === 'approved' ? '✓ Затверджено' : '○ Чернетка'}</span>
        </div>
      `).join('')}</div>`

      el.querySelectorAll('.pr-hist-item').forEach(item => {
        item.addEventListener('click', () => {
          selYear = +item.dataset.y; selMonth = +item.dataset.m
          activeTab = 'current'
          loadPeriod()
        })
      })
    } catch (err) {
      el.innerHTML = `<div style="text-align:center;padding:40px;color:#EF4444">Помилка: ${err.message}</div>`
    }
  }

  function printPayroll() {
    const totals = calcTotals(currentEntries)
    const rows = currentEntries.map(e =>
      `<tr><td>${e.name}</td><td>${e.position||''}</td>
       <td style="text-align:right">${fmt(e.baseSalary)}</td>
       <td style="text-align:right">${e.workedDays != null ? `${e.workedDays}/${e.normDays||'—'}` : '—'}</td>
       <td style="text-align:right">${fmt(e.bonus)}</td>
       <td style="text-align:right">${fmt(e.accrual)}</td><td style="text-align:right">${fmt(e.pdfo)}</td>
       <td style="text-align:right">${fmt(e.vz)}</td><td style="text-align:right">${fmt(e.net)}</td>
       <td style="text-align:right">${fmt(e.esvEmployer)}</td></tr>`
    ).join('')
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
      <style>body{font-family:Arial,sans-serif;font-size:12px}
      h2{text-align:center}table{width:100%;border-collapse:collapse}
      th,td{border:1px solid #ccc;padding:6px}th{background:#f0f0f0}
      tfoot td{font-weight:bold}</style></head><body>
      <h2>Розрахунково-платіжна відомість</h2>
      <p>Період: ${monthLabel(selYear, selMonth)}</p>
      <table><thead><tr>
        <th>П.І.Б.</th><th>Посада</th><th>Оклад</th><th>Дні</th><th>Доп.</th>
        <th>Нарах.</th><th>ПДФО</th><th>ВЗ</th><th>До виплати</th><th>ЄСВ</th>
      </tr></thead><tbody>${rows}</tbody>
      <tfoot><tr><td colspan="5">Разом</td>
        <td style="text-align:right">${fmt(totals.accrual)}</td>
        <td style="text-align:right">${fmt(totals.pdfo)}</td>
        <td style="text-align:right">${fmt(totals.vz)}</td>
        <td style="text-align:right">${fmt(totals.net)}</td>
        <td style="text-align:right">${fmt(totals.esvEmployer)}</td>
      </tr></tfoot></table>
      <p style="margin-top:20px">ФОП / Директор: _________________ Головний бухгалтер: _________________</p>
      </body></html>`
    if (window.electron?.pdf?.generate) {
      window.electron.pdf.generate(html, `payroll_${selYear}_${selMonth}.pdf`).catch(() => {})
    } else {
      const w = window.open('', '_blank')
      if (w) { w.document.write(html); w.document.close(); w.print() }
    }
  }

  await loadAll()
}
