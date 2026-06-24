// src/renderer/modules/cashbook/index.js — Касова книга (ПКО / РКО)
import { icon }                               from '../../utils/icons.js'
import { db }                                 from '../../services/firebase.js'
import { getCurrentUser, getActivePathSegments } from '../../services/auth.js'
import {
  collection, addDoc, getDocs, deleteDoc, doc,
  query, orderBy, serverTimestamp, where,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

// ── Helpers ────────────────────────────────────────────────────────────────
function today() { return new Date().toISOString().slice(0, 10) }

function fmt(v) {
  return '₴' + Math.abs(v || 0).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(s) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}.${m}.${y}`
}

function monthLabel(y, m) {
  const names = ['Січень','Лютий','Березень','Квітень','Травень','Червень',
                 'Липень','Серпень','Вересень','Жовтень','Листопад','Грудень']
  return `${names[m - 1]} ${y}`
}

let _docCounter = { pko: 0, rko: 0 }
function nextDocNum(type, existing) {
  const prefix = type === 'pko' ? 'ПКО' : 'РКО'
  const maxNum = existing
    .filter(e => e.type === type)
    .map(e => parseInt((e.docNum || '').replace(/\D/g, '')) || 0)
    .reduce((a, b) => Math.max(a, b), 0)
  return `${prefix}-${String(maxNum + 1).padStart(3, '0')}`
}

// ── Styles ─────────────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('cb-styles')) return
  const s = document.createElement('style')
  s.id = 'cb-styles'
  s.textContent = `
    .cb-page { display:flex; flex-direction:column; height:100%; background:var(--bg-primary,#0F1117); overflow:hidden; }
    .cb-header { display:flex; align-items:center; justify-content:space-between; padding:20px 24px 0; flex-shrink:0; }
    .cb-title  { font-size:20px; font-weight:700; color:var(--text-primary,#F1F5F9); display:flex; align-items:center; gap:8px; }
    .cb-subtitle { font-size:13px; color:var(--text-muted,#8B97B0); margin-top:2px; }
    .cb-toolbar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:16px 24px 0; flex-shrink:0; }
    .cb-period  { display:flex; align-items:center; gap:6px; background:var(--bg-secondary,#1A1D27); border:1px solid var(--border,rgba(255,255,255,.08)); border-radius:8px; padding:6px 12px; }
    .cb-period select { background:var(--bg-secondary,#1A1D27); border:none; color:var(--text-primary,#F1F5F9); font-size:13px; cursor:pointer; outline:none; border-radius:5px; }
    .cb-period select option { background:#1A1D27; color:#F1F5F9; }
    .cb-btn { display:inline-flex; align-items:center; gap:6px; padding:8px 14px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; border:none; transition:all .15s; }
    .cb-btn-pko { background:rgba(52,211,153,.15); color:#34D399; }
    .cb-btn-pko:hover { background:rgba(52,211,153,.25); }
    .cb-btn-rko { background:rgba(239,68,68,.12); color:#EF4444; }
    .cb-btn-rko:hover { background:rgba(239,68,68,.2); }
    .cb-kpi-row { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; padding:16px 24px; flex-shrink:0; }
    .cb-kpi    { background:var(--bg-secondary,#1A1D27); border:1px solid var(--border,rgba(255,255,255,.08)); border-radius:10px; padding:14px 16px; }
    .cb-kpi-label { font-size:11px; color:var(--text-muted,#8B97B0); text-transform:uppercase; letter-spacing:.5px; margin-bottom:6px; }
    .cb-kpi-val   { font-size:20px; font-weight:700; color:var(--text-primary,#F1F5F9); }
    .cb-kpi-val.green { color:#34D399; }
    .cb-kpi-val.red   { color:#EF4444; }
    .cb-scroll { flex:1; overflow-y:auto; padding:0 24px 24px; }
    .cb-table  { width:100%; border-collapse:collapse; font-size:13px; }
    .cb-table th { background:var(--bg-secondary,#1A1D27); color:var(--text-muted,#8B97B0); font-weight:500; padding:8px 12px; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.5px; position:sticky; top:0; z-index:1; }
    .cb-table th:last-child,.cb-table td:last-child { text-align:right; }
    .cb-table td { padding:10px 12px; border-bottom:1px solid var(--border,rgba(255,255,255,.06)); color:var(--text-primary,#F1F5F9); vertical-align:middle; }
    .cb-table tr:hover td { background:rgba(255,255,255,.03); }
    .cb-badge { display:inline-flex; align-items:center; gap:4px; padding:3px 8px; border-radius:5px; font-size:11px; font-weight:600; text-transform:uppercase; }
    .cb-badge.pko { background:rgba(52,211,153,.12); color:#34D399; }
    .cb-badge.rko { background:rgba(239,68,68,.1); color:#EF4444; }
    .cb-pay-badge { display:inline-flex; align-items:center; gap:4px; padding:3px 8px; border-radius:5px; font-size:11px; font-weight:600; background:rgba(255,255,255,.06); color:var(--text-muted,#8B97B0); }
    .cb-pay-cash     { background:rgba(52,211,153,.1); color:#34D399; }
    .cb-pay-terminal { background:rgba(79,142,247,.1); color:#4F8EF7; }
    .cb-pay-transfer { background:rgba(167,139,250,.1); color:#A78BFA; }
    .cb-income  { color:#34D399; font-weight:600; }
    .cb-expense { color:#EF4444; font-weight:600; }
    .cb-balance { color:var(--text-primary,#F1F5F9); font-weight:600; }
    .cb-day-row td { background:rgba(255,255,255,.03); color:var(--text-muted,#8B97B0); font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.5px; }
    .cb-delete-btn { padding:3px 8px; border-radius:5px; border:none; background:rgba(239,68,68,.1); color:#EF4444; cursor:pointer; font-size:11px; opacity:0; transition:.15s; }
    .cb-table tr:hover .cb-delete-btn { opacity:1; }
    .cb-empty { text-align:center; padding:60px 24px; color:var(--text-muted,#8B97B0); }
    .cb-empty-icon { font-size:40px; margin-bottom:12px; }

    /* Modal */
    .cb-overlay { position:fixed; inset:0; background:rgba(0,0,0,.6); display:flex; align-items:center; justify-content:center; z-index:1000; backdrop-filter:blur(4px); }
    .cb-modal  { background:var(--bg-secondary,#1A1D27); border:1px solid var(--border,rgba(255,255,255,.1)); border-radius:14px; padding:24px; width:440px; max-width:90vw; }
    .cb-modal h3 { font-size:17px; font-weight:700; color:var(--text-primary,#F1F5F9); margin-bottom:20px; display:flex; align-items:center; gap:8px; }
    .cb-field  { margin-bottom:14px; }
    .cb-field label { display:block; font-size:12px; color:var(--text-muted,#8B97B0); margin-bottom:5px; }
    .cb-field input, .cb-field select, .cb-field textarea {
      width:100%; background:var(--bg-primary,#0F1117); border:1px solid var(--border,rgba(255,255,255,.1));
      border-radius:8px; padding:9px 12px; color:var(--text-primary,#F1F5F9); font-size:13px;
      outline:none; transition:border .15s; box-sizing:border-box;
    }
    .cb-field input:focus, .cb-field select:focus { border-color:#4F8EF7; }
    .cb-field select option { background:#1A1D27; color:#F1F5F9; }
    .cb-field textarea { resize:vertical; min-height:60px; }
    .cb-modal-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .cb-modal-actions { display:flex; gap:8px; justify-content:flex-end; margin-top:20px; }
    .cb-modal-cancel { padding:9px 18px; border-radius:8px; border:1px solid var(--border,rgba(255,255,255,.1)); background:transparent; color:var(--text-muted,#8B97B0); cursor:pointer; font-size:13px; }
    .cb-modal-save   { padding:9px 18px; border-radius:8px; border:none; color:#fff; cursor:pointer; font-size:13px; font-weight:600; }
    .cb-modal-save.pko { background:#34D399; }
    .cb-modal-save.rko { background:#EF4444; }
    .cb-doc-num { font-size:11px; color:var(--text-muted,#8B97B0); font-family:monospace; }
  `
  document.head.appendChild(s)
}

// ── Categories ────────────────────────────────────────────────────────────
const PKO_CATS = ['Виручка від продажу', 'Оплата від клієнта', 'Аванс', 'Повернення коштів', 'Інше']
const RKO_CATS = ['Зарплата', 'Аванс', 'Господарські витрати', 'Матеріали', 'Послуги', 'Канцтовари', 'Витрати на відрядження', 'Інше']

// ── Payment methods ─────────────────────────────────────────────────────────
const PAY_METHODS = {
  cash:     { label: 'Готівка',    iconName: 'cashbook' },
  terminal: { label: 'Термінал',   iconName: 'bank' },
  transfer: { label: 'Контрагент', iconName: 'building' },
}

// ── Main render ────────────────────────────────────────────────────────────
export async function render(container) {
  injectStyles()
  const user = getCurrentUser()
  const base = getActivePathSegments(user.uid)
  const colRef = () => collection(db, ...base, 'cashbook')

  let entries = []
  const now = new Date()
  let selYear  = now.getFullYear()
  let selMonth = now.getMonth() + 1
  let modalType = null

  async function load() {
    try {
      const snap = await getDocs(query(colRef(), orderBy('createdAt', 'asc')))
      entries = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.date || '') < (b.date || '') ? -1 : (a.date || '') > (b.date || '') ? 1 : 0)
    } catch { entries = [] }
    rerender()
  }

  function filteredEntries() {
    return entries.filter(e => {
      if (!e.date) return false
      const [y, m] = e.date.split('-').map(Number)
      return y === selYear && m === selMonth
    })
  }

  // Entries sorted by date to get opening balance
  function openingBalance() {
    const prefix = `${selYear}-${String(selMonth).padStart(2, '0')}`
    const before = entries.filter(e => e.date && e.date < prefix + '-01')
    return before.reduce((sum, e) => e.type === 'pko' ? sum + (e.amount || 0) : sum - (e.amount || 0), 0)
  }

  function rerender() {
    const list    = filteredEntries()
    const opening = openingBalance()
    const receipts  = list.filter(e => e.type === 'pko').reduce((s, e) => s + (e.amount || 0), 0)
    const expenses  = list.filter(e => e.type === 'rko').reduce((s, e) => s + (e.amount || 0), 0)
    const closing   = opening + receipts - expenses

    // Build year options (5 years back)
    const yearOpts = Array.from({length: 5}, (_, i) => now.getFullYear() - 4 + i)
      .map(y => `<option value="${y}" ${y === selYear ? 'selected' : ''}>${y}</option>`).join('')
    const monthOpts = Array.from({length: 12}, (_, i) => i + 1)
      .map(m => `<option value="${m}" ${m === selMonth ? 'selected' : ''}>${monthLabel(selYear, m)}</option>`).join('')

    // Group entries by date
    const grouped = {}
    list.forEach(e => {
      if (!grouped[e.date]) grouped[e.date] = []
      grouped[e.date].push(e)
    })

    let runBalance = opening
    let rows = ''
    const dates = Object.keys(grouped).sort()
    for (const date of dates) {
      const dayEntries = grouped[date]
      const dayIncome  = dayEntries.filter(e => e.type === 'pko').reduce((s, e) => s + (e.amount || 0), 0)
      const dayExpense = dayEntries.filter(e => e.type === 'rko').reduce((s, e) => s + (e.amount || 0), 0)
      rows += `<tr class="cb-day-row"><td colspan="8">📅 ${fmtDate(date)} · Надходження: ${fmt(dayIncome)} · Видатки: ${fmt(dayExpense)}</td></tr>`
      for (const e of dayEntries) {
        runBalance += e.type === 'pko' ? (e.amount || 0) : -(e.amount || 0)
        const pm = PAY_METHODS[e.paymentMethod || 'cash'] || PAY_METHODS.cash
        const pmKey = e.paymentMethod || 'cash'
        rows += `
          <tr>
            <td><span class="cb-doc-num">${e.docNum || '—'}</span></td>
            <td><span class="cb-badge ${e.type}">${e.type === 'pko' ? 'ПКО' : 'РКО'}</span></td>
            <td>${e.counterparty || '—'}</td>
            <td><span class="cb-pay-badge cb-pay-${pmKey}">${icon(pm.iconName, 11)} ${pm.label}</span></td>
            <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              ${e.description || '—'}
              ${e.vatIncluded ? `<span class="cb-pay-badge" style="background:rgba(79,142,247,.1);color:#4F8EF7;margin-left:4px">ПДВ ${fmt(e.vatAmount)}</span>` : ''}
              ${e.exciseIncluded ? `<span class="cb-pay-badge" style="background:rgba(245,158,11,.1);color:#F59E0B;margin-left:4px">Акциз ${fmt(e.exciseAmount)}</span>` : ''}
            </td>
            <td class="cb-income">${e.type === 'pko' ? fmt(e.amount) : '—'}</td>
            <td class="cb-expense">${e.type === 'rko' ? fmt(e.amount) : '—'}</td>
            <td><span class="cb-balance" style="color:${runBalance >= 0 ? '#34D399' : '#EF4444'}">${fmt(runBalance)}</span>
              <button class="cb-delete-btn" data-id="${e.id}">✕</button>
            </td>
          </tr>`
      }
    }

    container.innerHTML = `
      <div class="cb-page">
        <div class="cb-header">
          <div>
            <div class="cb-title">${icon('finances', 20)} Касова книга</div>
            <div class="cb-subtitle">${monthLabel(selYear, selMonth)} · ${list.length} записів</div>
          </div>
        </div>

        <div class="cb-toolbar">
          <div class="cb-period">
            <select id="cb-year">${yearOpts}</select>
            <select id="cb-month">${monthOpts}</select>
          </div>
          <button class="cb-btn cb-btn-pko" id="cb-add-pko">${icon('plus', 14)} ПКО — Прихід</button>
          <button class="cb-btn cb-btn-rko" id="cb-add-rko">${icon('plus', 14)} РКО — Видаток</button>
        </div>

        <div class="cb-kpi-row">
          <div class="cb-kpi">
            <div class="cb-kpi-label">Залишок на початок</div>
            <div class="cb-kpi-val ${opening >= 0 ? '' : 'red'}">${fmt(opening)}</div>
          </div>
          <div class="cb-kpi">
            <div class="cb-kpi-label">Надходження (ПКО)</div>
            <div class="cb-kpi-val green">${fmt(receipts)}</div>
          </div>
          <div class="cb-kpi">
            <div class="cb-kpi-label">Видатки (РКО)</div>
            <div class="cb-kpi-val red">${fmt(expenses)}</div>
          </div>
          <div class="cb-kpi">
            <div class="cb-kpi-label">Залишок на кінець</div>
            <div class="cb-kpi-val ${closing >= 0 ? 'green' : 'red'}">${fmt(closing)}</div>
          </div>
        </div>

        <div class="cb-scroll">
          ${list.length === 0 ? `
            <div class="cb-empty">
              <div class="cb-empty-icon">🗂️</div>
              <div>Записів за ${monthLabel(selYear, selMonth)} немає</div>
              <div style="font-size:12px;margin-top:6px">Додайте ПКО або РКО за допомогою кнопок вище</div>
            </div>
          ` : `
            <table class="cb-table">
              <thead><tr>
                <th>№ Документа</th><th>Тип</th><th>Контрагент</th><th>Спосіб оплати</th>
                <th>Призначення</th><th>Прихід</th><th>Видаток</th><th>Залишок</th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>
          `}
        </div>
      </div>
    `

    container.querySelector('#cb-year')?.addEventListener('change', e => { selYear = +e.target.value; rerender() })
    container.querySelector('#cb-month')?.addEventListener('change', e => { selMonth = +e.target.value; rerender() })
    container.querySelector('#cb-add-pko')?.addEventListener('click', () => openModal('pko'))
    container.querySelector('#cb-add-rko')?.addEventListener('click', () => openModal('rko'))
    container.querySelectorAll('.cb-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteEntry(btn.dataset.id))
    })
  }

  async function deleteEntry(id) {
    if (!confirm('Видалити цей запис?')) return
    try { await deleteDoc(doc(db, ...base, 'cashbook', id)) } catch {}
    await load()
  }

  function openModal(type) {
    modalType = type
    const isIncome = type === 'pko'
    const docNum   = nextDocNum(type, entries)
    const cats     = isIncome ? PKO_CATS : RKO_CATS

    const overlay = document.createElement('div')
    overlay.className = 'cb-overlay'
    overlay.innerHTML = `
      <div class="cb-modal" id="cb-modal">
        <h3>${isIncome
          ? `${icon('plus', 16)} Прибутковий касовий ордер (ПКО)`
          : `${icon('minus', 16)} Видатковий касовий ордер (РКО)`}</h3>
        <div class="cb-modal-row">
          <div class="cb-field">
            <label>Номер документа</label>
            <input id="cb-docnum" value="${docNum}" readonly style="opacity:.7">
          </div>
          <div class="cb-field">
            <label>Дата *</label>
            <input id="cb-date" type="date" value="${today()}">
          </div>
        </div>
        <div class="cb-field">
          <label>Контрагент (від кого / кому)</label>
          <input id="cb-counterparty" placeholder="${isIncome ? 'Від кого отримано' : 'Кому видано'}">
        </div>
        <div class="cb-modal-row">
          <div class="cb-field">
            <label>Сума *</label>
            <input id="cb-amount" type="number" min="0.01" step="0.01" placeholder="0.00">
          </div>
          <div class="cb-field">
            <label>Спосіб оплати</label>
            <select id="cb-paymethod">
              ${Object.entries(PAY_METHODS).map(([k, m]) => `<option value="${k}">${m.label}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="cb-modal-row">
          <div class="cb-field" style="display:flex;align-items:center;gap:8px;margin-top:18px">
            <input type="checkbox" id="cb-vat" style="width:auto">
            <label for="cb-vat" style="margin:0;cursor:pointer">Сума включає ПДВ 20%</label>
          </div>
          <div class="cb-field" style="display:flex;align-items:center;gap:8px;margin-top:18px">
            <input type="checkbox" id="cb-excise" style="width:auto">
            <label for="cb-excise" style="margin:0;cursor:pointer">Сума включає Акциз 5%</label>
          </div>
        </div>
        <div class="cb-field" id="cb-tax-preview" style="display:none;background:var(--bg-primary,#0F1117);border-radius:8px;padding:10px 12px;font-size:12px;color:var(--text-muted,#8B97B0)"></div>
        <div class="cb-field">
          <label>Підстава / Категорія</label>
          <select id="cb-cat">
            ${cats.map(c => `<option>${c}</option>`).join('')}
          </select>
        </div>
        <div class="cb-field">
          <label>Призначення платежу</label>
          <textarea id="cb-desc" placeholder="Опис операції..."></textarea>
        </div>
        <div class="cb-modal-actions">
          <button class="cb-modal-cancel" id="cb-cancel">Скасувати</button>
          <button class="cb-modal-save ${type}" id="cb-save">
            ${isIncome ? 'Провести ПКО' : 'Провести РКО'}
          </button>
        </div>
      </div>
    `
    document.body.appendChild(overlay)

    function updateTaxPreview() {
      const amount   = parseFloat(overlay.querySelector('#cb-amount').value) || 0
      const vatOn    = overlay.querySelector('#cb-vat').checked
      const exciseOn = overlay.querySelector('#cb-excise').checked
      const prev = overlay.querySelector('#cb-tax-preview')
      if (!vatOn && !exciseOn) { prev.style.display = 'none'; return }
      const vatAmount    = vatOn    ? Math.round(amount * 20 / 120 * 100) / 100 : 0
      const exciseAmount = exciseOn ? Math.round(amount * 5  / 105 * 100) / 100 : 0
      prev.style.display = 'block'
      prev.innerHTML = `
        Сума без податків: <strong>${fmt(amount - vatAmount - exciseAmount)}</strong>
        ${vatOn    ? `· ПДВ 20%: <strong style="color:#4F8EF7">${fmt(vatAmount)}</strong>` : ''}
        ${exciseOn ? `· Акциз 5%: <strong style="color:#F59E0B">${fmt(exciseAmount)}</strong>` : ''}
      `
    }
    overlay.querySelector('#cb-amount').addEventListener('input', updateTaxPreview)
    overlay.querySelector('#cb-vat').addEventListener('change', updateTaxPreview)
    overlay.querySelector('#cb-excise').addEventListener('change', updateTaxPreview)

    overlay.querySelector('#cb-cancel').addEventListener('click', () => overlay.remove())
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
    overlay.querySelector('#cb-save').addEventListener('click', async () => {
      const amount = parseFloat(overlay.querySelector('#cb-amount').value)
      const date   = overlay.querySelector('#cb-date').value
      if (!date || !amount || amount <= 0) { alert('Введіть дату та суму'); return }

      const vatOn    = overlay.querySelector('#cb-vat').checked
      const exciseOn = overlay.querySelector('#cb-excise').checked
      const vatAmount    = vatOn    ? Math.round(amount * 20 / 120 * 100) / 100 : 0
      const exciseAmount = exciseOn ? Math.round(amount * 5  / 105 * 100) / 100 : 0

      const btn = overlay.querySelector('#cb-save')
      btn.textContent = 'Збереження...'
      btn.disabled = true

      try {
        await addDoc(colRef(), {
          type,
          docNum:        overlay.querySelector('#cb-docnum').value,
          date,
          counterparty:  overlay.querySelector('#cb-counterparty').value.trim(),
          paymentMethod: overlay.querySelector('#cb-paymethod').value,
          category:      overlay.querySelector('#cb-cat').value,
          description:   overlay.querySelector('#cb-desc').value.trim(),
          amount,
          vatIncluded:    vatOn,
          vatAmount,
          exciseIncluded: exciseOn,
          exciseAmount,
          createdAt: serverTimestamp(),
        })
        overlay.remove()
        await load()
      } catch (err) {
        btn.textContent = 'РКО'; btn.disabled = false
        alert('Помилка: ' + err.message)
      }
    })
  }

  await load()
}
