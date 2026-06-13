// src/renderer/modules/bank/index.js — Банківські рахунки та виписки
import { icon }                               from '../../utils/icons.js'
import { db }                                 from '../../services/firebase.js'
import { getCurrentUser, getActivePathSegments } from '../../services/auth.js'
import {
  collection, addDoc, getDocs, deleteDoc, doc, updateDoc,
  query, orderBy, where, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt(v, curr = '₴') {
  return curr + Math.abs(v || 0).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(s) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}.${m}.${y}`
}
function today() { return new Date().toISOString().slice(0, 10) }

const BANK_COLORS = ['#4F8EF7','#34D399','#F59E0B','#A78BFA','#F472B6','#38BDF8','#FB923C']
const BANK_TEMPLATES = [
  { name: 'ПриватБанк',    color: '#4F8EF7' },
  { name: 'Монобанк',      color: '#1C1C1E' },
  { name: 'Ощадбанк',      color: '#34D399' },
  { name: 'ПУМБ',          color: '#F59E0B' },
  { name: 'Укрсиббанк',    color: '#A78BFA' },
  { name: 'Інший рахунок', color: '#8B97B0' },
]
const CURRENCIES = ['UAH', 'USD', 'EUR', 'GBP', 'PLN']
const TRANS_CATS = ['Оплата від клієнта', 'Переказ між рахунками', 'Зарплата', 'Постачальник', 'Оренда', 'Комунальні', 'Маркетинг', 'Обладнання', 'Інше']

// ── Styles ─────────────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('bk-styles')) return
  const s = document.createElement('style')
  s.id = 'bk-styles'
  s.textContent = `
    .bk-page { display:flex; flex-direction:column; height:100%; background:var(--bg-primary,#0F1117); overflow:hidden; }
    .bk-header { padding:20px 24px 0; flex-shrink:0; }
    .bk-title  { font-size:20px; font-weight:700; color:var(--text-primary,#F1F5F9); display:flex; align-items:center; gap:8px; }
    .bk-subtitle { font-size:13px; color:var(--text-muted,#8B97B0); margin-top:2px; }
    .bk-layout { display:flex; flex:1; overflow:hidden; gap:0; }
    .bk-sidebar { width:280px; flex-shrink:0; border-right:1px solid var(--border,rgba(255,255,255,.08)); display:flex; flex-direction:column; overflow:hidden; }
    .bk-sidebar-header { padding:16px; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid var(--border,rgba(255,255,255,.08)); flex-shrink:0; }
    .bk-sidebar-title { font-size:12px; font-weight:600; color:var(--text-muted,#8B97B0); text-transform:uppercase; letter-spacing:.5px; }
    .bk-add-acc-btn { width:28px; height:28px; border-radius:7px; border:none; background:rgba(79,142,247,.15); color:#4F8EF7; cursor:pointer; display:flex; align-items:center; justify-content:center; }
    .bk-add-acc-btn:hover { background:rgba(79,142,247,.25); }
    .bk-accounts { flex:1; overflow-y:auto; padding:8px; }
    .bk-acc-card { border-radius:10px; padding:12px 14px; cursor:pointer; margin-bottom:6px; transition:.15s; border:1px solid transparent; }
    .bk-acc-card:hover { background:rgba(255,255,255,.04); }
    .bk-acc-card.active { background:rgba(79,142,247,.08); border-color:rgba(79,142,247,.25); }
    .bk-acc-header { display:flex; align-items:center; gap:10px; }
    .bk-acc-dot  { width:10px; height:10px; border-radius:50%; flex-shrink:0; }
    .bk-acc-name { font-size:13px; font-weight:600; color:var(--text-primary,#F1F5F9); flex:1; }
    .bk-acc-curr { font-size:11px; color:var(--text-muted,#8B97B0); }
    .bk-acc-balance { font-size:16px; font-weight:700; margin-top:6px; }
    .bk-acc-iban { font-size:10px; color:var(--text-muted,#8B97B0); font-family:monospace; margin-top:3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .bk-total-row { padding:12px 16px; border-top:1px solid var(--border,rgba(255,255,255,.08)); }
    .bk-total-label { font-size:11px; color:var(--text-muted,#8B97B0); }
    .bk-total-val   { font-size:18px; font-weight:700; color:#4F8EF7; margin-top:2px; }
    .bk-main { flex:1; display:flex; flex-direction:column; overflow:hidden; }
    .bk-main-toolbar { padding:16px 20px; display:flex; align-items:center; gap:8px; flex-wrap:wrap; border-bottom:1px solid var(--border,rgba(255,255,255,.08)); flex-shrink:0; }
    .bk-main-acc-name { font-size:16px; font-weight:700; color:var(--text-primary,#F1F5F9); flex:1; }
    .bk-btn { display:inline-flex; align-items:center; gap:6px; padding:7px 13px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; border:none; transition:.15s; }
    .bk-btn-credit { background:rgba(52,211,153,.15); color:#34D399; }
    .bk-btn-credit:hover { background:rgba(52,211,153,.25); }
    .bk-btn-debit  { background:rgba(239,68,68,.12); color:#EF4444; }
    .bk-btn-debit:hover  { background:rgba(239,68,68,.2); }
    .bk-btn-del    { background:rgba(239,68,68,.08); color:#EF4444; font-size:12px; padding:6px 10px; }
    .bk-trans-scroll { flex:1; overflow-y:auto; padding:0 20px 20px; }
    .bk-trans-table { width:100%; border-collapse:collapse; font-size:13px; }
    .bk-trans-table th { background:var(--bg-secondary,#1A1D27); color:var(--text-muted,#8B97B0); font-weight:500; padding:8px 12px; text-align:left; font-size:11px; text-transform:uppercase; position:sticky; top:0; z-index:1; }
    .bk-trans-table td { padding:10px 12px; border-bottom:1px solid var(--border,rgba(255,255,255,.06)); color:var(--text-primary,#F1F5F9); }
    .bk-trans-table tr:hover td { background:rgba(255,255,255,.03); }
    .bk-credit { color:#34D399; font-weight:600; }
    .bk-debit  { color:#EF4444; font-weight:600; }
    .bk-balance-col { color:var(--text-primary,#F1F5F9); font-weight:600; }
    .bk-type-badge { display:inline-flex; padding:2px 8px; border-radius:5px; font-size:11px; font-weight:600; text-transform:uppercase; }
    .bk-type-badge.credit { background:rgba(52,211,153,.12); color:#34D399; }
    .bk-type-badge.debit  { background:rgba(239,68,68,.1); color:#EF4444; }
    .bk-delete-btn { padding:3px 7px; border-radius:5px; border:none; background:rgba(239,68,68,.1); color:#EF4444; cursor:pointer; font-size:11px; opacity:0; transition:.15s; }
    .bk-trans-table tr:hover .bk-delete-btn { opacity:1; }
    .bk-empty { text-align:center; padding:60px; color:var(--text-muted,#8B97B0); }
    .bk-no-acc { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:var(--text-muted,#8B97B0); gap:8px; }

    /* Modal */
    .bk-overlay { position:fixed; inset:0; background:rgba(0,0,0,.6); display:flex; align-items:center; justify-content:center; z-index:1000; backdrop-filter:blur(4px); }
    .bk-modal  { background:var(--bg-secondary,#1A1D27); border:1px solid var(--border,rgba(255,255,255,.1)); border-radius:14px; padding:24px; width:420px; max-width:90vw; }
    .bk-modal h3 { font-size:16px; font-weight:700; color:var(--text-primary,#F1F5F9); margin-bottom:18px; display:flex; align-items:center; gap:8px; }
    .bk-field  { margin-bottom:12px; }
    .bk-field label { display:block; font-size:12px; color:var(--text-muted,#8B97B0); margin-bottom:4px; }
    .bk-field input, .bk-field select, .bk-field textarea {
      width:100%; background:var(--bg-primary,#0F1117); border:1px solid var(--border,rgba(255,255,255,.1));
      border-radius:8px; padding:9px 12px; color:var(--text-primary,#F1F5F9); font-size:13px;
      outline:none; transition:border .15s; box-sizing:border-box;
    }
    .bk-field input:focus, .bk-field select:focus, .bk-field textarea:focus { border-color:#4F8EF7; }
    .bk-field select option { background:#1A1D27; color:#F1F5F9; }
    .bk-modal-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .bk-color-row { display:flex; gap:8px; flex-wrap:wrap; margin-top:6px; }
    .bk-color-dot { width:24px; height:24px; border-radius:50%; cursor:pointer; border:2px solid transparent; transition:.15s; }
    .bk-color-dot.sel { border-color:#fff; transform:scale(1.15); }
    .bk-modal-actions { display:flex; gap:8px; justify-content:flex-end; margin-top:18px; }
    .bk-modal-cancel { padding:8px 16px; border-radius:8px; border:1px solid var(--border,rgba(255,255,255,.1)); background:transparent; color:var(--text-muted,#8B97B0); cursor:pointer; font-size:13px; }
    .bk-modal-save   { padding:8px 16px; border-radius:8px; border:none; background:#4F8EF7; color:#fff; cursor:pointer; font-size:13px; font-weight:600; }
    .bk-template-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:12px; }
    .bk-tpl-btn { padding:8px; border-radius:8px; border:1px solid var(--border,rgba(255,255,255,.1)); background:transparent; color:var(--text-primary,#F1F5F9); cursor:pointer; font-size:12px; text-align:center; transition:.15s; }
    .bk-tpl-btn:hover { background:rgba(255,255,255,.06); }
  `
  document.head.appendChild(s)
}

// ── Main render ────────────────────────────────────────────────────────────
export async function render(container) {
  injectStyles()
  const user = getCurrentUser()
  const base = getActivePathSegments(user.uid)
  const accRef   = () => collection(db, ...base, 'bank_accounts')
  const transRef = () => collection(db, ...base, 'bank_transactions')

  let accounts     = []
  let transactions = []
  let activeAccId  = null

  async function loadAll() {
    try {
      const [accSnap, transSnap] = await Promise.all([
        getDocs(query(accRef(), orderBy('createdAt', 'asc'))),
        getDocs(query(transRef(), orderBy('createdAt', 'asc'))),
      ])
      accounts     = accSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      transactions = transSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.date || '') < (b.date || '') ? -1 : (a.date || '') > (b.date || '') ? 1 : 0)
    } catch {
      accounts = []; transactions = []
    }
    if (!activeAccId && accounts.length > 0) activeAccId = accounts[0].id
    rerender()
  }

  function getAccountBalance(accId) {
    const acc = accounts.find(a => a.id === accId)
    const init = acc?.initialBalance || 0
    return transactions
      .filter(t => t.accountId === accId)
      .reduce((s, t) => t.type === 'credit' ? s + (t.amount || 0) : s - (t.amount || 0), init)
  }

  function rerender() {
    const totalUAH = accounts.reduce((s, a) => {
      if ((a.currency || 'UAH') !== 'UAH') return s
      return s + getAccountBalance(a.id)
    }, 0)

    const accCards = accounts.map(a => {
      const bal = getAccountBalance(a.id)
      const curr = a.currency || 'UAH'
      const sym  = curr === 'UAH' ? '₴' : (curr === 'USD' ? '$' : curr === 'EUR' ? '€' : curr)
      return `
        <div class="bk-acc-card ${a.id === activeAccId ? 'active' : ''}" data-acc="${a.id}">
          <div class="bk-acc-header">
            <div class="bk-acc-dot" style="background:${a.color || '#4F8EF7'}"></div>
            <div class="bk-acc-name">${a.name}</div>
            <div class="bk-acc-curr">${curr}</div>
          </div>
          <div class="bk-acc-balance" style="color:${bal >= 0 ? (a.color || '#4F8EF7') : '#EF4444'}">${sym}${Math.abs(bal).toLocaleString('uk-UA', {minimumFractionDigits:2})}</div>
          ${a.iban ? `<div class="bk-acc-iban">${a.iban}</div>` : ''}
        </div>`
    }).join('')

    const activeTrans = transactions.filter(t => t.accountId === activeAccId)
    const activeAcc   = accounts.find(a => a.id === activeAccId)
    const accBal      = activeAccId ? getAccountBalance(activeAccId) : 0
    const curr        = activeAcc?.currency || 'UAH'
    const sym         = curr === 'UAH' ? '₴' : (curr === 'USD' ? '$' : curr === 'EUR' ? '€' : curr)

    // Build transaction rows with running balance
    let runBal   = activeAcc?.initialBalance || 0
    let transRows = ''
    for (const t of activeTrans) {
      runBal += t.type === 'credit' ? (t.amount || 0) : -(t.amount || 0)
      transRows += `
        <tr>
          <td>${fmtDate(t.date)}</td>
          <td><span class="bk-type-badge ${t.type}">${t.type === 'credit' ? 'Надх.' : 'Видат.'}</span></td>
          <td>${t.counterparty || '—'}</td>
          <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.description || t.category || '—'}</td>
          <td class="bk-credit">${t.type === 'credit' ? sym + (t.amount||0).toLocaleString('uk-UA',{minimumFractionDigits:2}) : '—'}</td>
          <td class="bk-debit">${t.type === 'debit' ? sym + (t.amount||0).toLocaleString('uk-UA',{minimumFractionDigits:2}) : '—'}</td>
          <td class="bk-balance-col" style="color:${runBal>=0?'#34D399':'#EF4444'}">${sym}${Math.abs(runBal).toLocaleString('uk-UA',{minimumFractionDigits:2})}
            <button class="bk-delete-btn" data-id="${t.id}">✕</button>
          </td>
        </tr>`
    }

    container.innerHTML = `
      <div class="bk-page">
        <div class="bk-header">
          <div class="bk-title">${icon('building', 20)} Банківські рахунки</div>
          <div class="bk-subtitle">${accounts.length} рахунків · Загальний залишок UAH: ₴${totalUAH.toLocaleString('uk-UA', {minimumFractionDigits:2})}</div>
        </div>
        <div class="bk-layout">
          <div class="bk-sidebar">
            <div class="bk-sidebar-header">
              <span class="bk-sidebar-title">Рахунки</span>
              <button class="bk-add-acc-btn" id="bk-add-acc" title="Додати рахунок">${icon('plus', 14)}</button>
            </div>
            <div class="bk-accounts">
              ${accounts.length === 0 ? '<div style="padding:20px;text-align:center;color:var(--text-muted,#8B97B0);font-size:13px">Немає рахунків</div>' : accCards}
            </div>
            <div class="bk-total-row">
              <div class="bk-total-label">Загальний залишок (UAH)</div>
              <div class="bk-total-val">₴${totalUAH.toLocaleString('uk-UA', {minimumFractionDigits:2})}</div>
            </div>
          </div>
          <div class="bk-main">
            ${!activeAcc ? `
              <div class="bk-no-acc">
                ${icon('building', 32)}
                <div>Виберіть або додайте рахунок</div>
              </div>
            ` : `
              <div class="bk-main-toolbar">
                <div class="bk-main-acc-name" style="color:${activeAcc.color || '#4F8EF7'}">${activeAcc.name}</div>
                <div style="font-size:20px;font-weight:700;color:${accBal>=0?'#34D399':'#EF4444'}">${sym}${Math.abs(accBal).toLocaleString('uk-UA',{minimumFractionDigits:2})}</div>
                <button class="bk-btn bk-btn-credit" id="bk-add-credit">${icon('plus', 13)} Надходження</button>
                <button class="bk-btn bk-btn-debit"  id="bk-add-debit">${icon('minus', 13)} Видаток</button>
                <button class="bk-btn bk-btn-del"   id="bk-del-acc">Видалити рахунок</button>
              </div>
              <div class="bk-trans-scroll">
                ${activeTrans.length === 0 ? `
                  <div class="bk-empty">
                    <div style="font-size:32px;margin-bottom:8px">🏦</div>
                    <div>Операцій по рахунку немає</div>
                    <div style="font-size:12px;margin-top:4px">Додайте надходження або видаток</div>
                  </div>
                ` : `
                  <table class="bk-trans-table">
                    <thead><tr>
                      <th>Дата</th><th>Тип</th><th>Контрагент</th>
                      <th>Призначення</th><th>Надх.</th><th>Видат.</th><th>Залишок</th>
                    </tr></thead>
                    <tbody>${transRows}</tbody>
                  </table>
                `}
              </div>
            `}
          </div>
        </div>
      </div>
    `

    container.querySelectorAll('.bk-acc-card').forEach(card => {
      card.addEventListener('click', () => { activeAccId = card.dataset.acc; rerender() })
    })
    container.querySelector('#bk-add-acc')?.addEventListener('click', () => openAccountModal())
    container.querySelector('#bk-add-credit')?.addEventListener('click', () => openTransModal('credit'))
    container.querySelector('#bk-add-debit')?.addEventListener('click', () => openTransModal('debit'))
    container.querySelector('#bk-del-acc')?.addEventListener('click', () => deleteAccount())
    container.querySelectorAll('.bk-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteTrans(btn.dataset.id))
    })
  }

  async function deleteAccount() {
    if (!activeAccId) return
    if (!confirm('Видалити рахунок та всі його операції?')) return
    const myTrans = transactions.filter(t => t.accountId === activeAccId)
    await Promise.all(myTrans.map(t => deleteDoc(doc(db, ...base, 'bank_transactions', t.id)).catch(() => {})))
    await deleteDoc(doc(db, ...base, 'bank_accounts', activeAccId)).catch(() => {})
    activeAccId = null
    await loadAll()
  }

  async function deleteTrans(id) {
    if (!confirm('Видалити операцію?')) return
    await deleteDoc(doc(db, ...base, 'bank_transactions', id)).catch(() => {})
    await loadAll()
  }

  function openAccountModal() {
    let selColor = BANK_COLORS[0]
    const overlay = document.createElement('div')
    overlay.className = 'bk-overlay'
    overlay.innerHTML = `
      <div class="bk-modal">
        <h3>${icon('plus', 16)} Новий банківський рахунок</h3>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">Швидкий вибір банку:</div>
        <div class="bk-template-grid" id="bk-templates">
          ${BANK_TEMPLATES.map((b, i) => `<button class="bk-tpl-btn" data-i="${i}" style="border-color:${b.color}40">${b.name}</button>`).join('')}
        </div>
        <div class="bk-field">
          <label>Назва рахунку *</label>
          <input id="bk-acc-name" placeholder="Напр. ПриватБанк ФОП">
        </div>
        <div class="bk-modal-row">
          <div class="bk-field">
            <label>Валюта</label>
            <select id="bk-acc-curr">${CURRENCIES.map(c => `<option value="${c}">${c}</option>`).join('')}</select>
          </div>
          <div class="bk-field">
            <label>Початковий залишок</label>
            <input id="bk-acc-init" type="number" step="0.01" placeholder="0.00" value="0">
          </div>
        </div>
        <div class="bk-field">
          <label>IBAN (необов'язково)</label>
          <input id="bk-acc-iban" placeholder="UA...">
        </div>
        <div class="bk-field">
          <label>Колір</label>
          <div class="bk-color-row" id="bk-colors">
            ${BANK_COLORS.map(c => `<div class="bk-color-dot ${c === selColor ? 'sel' : ''}" data-c="${c}" style="background:${c}"></div>`).join('')}
          </div>
        </div>
        <div class="bk-modal-actions">
          <button class="bk-modal-cancel" id="bk-cancel">Скасувати</button>
          <button class="bk-modal-save" id="bk-save">Додати рахунок</button>
        </div>
      </div>
    `
    document.body.appendChild(overlay)

    overlay.querySelectorAll('.bk-color-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        selColor = dot.dataset.c
        overlay.querySelectorAll('.bk-color-dot').forEach(d => d.classList.remove('sel'))
        dot.classList.add('sel')
      })
    })
    overlay.querySelectorAll('.bk-tpl-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tpl = BANK_TEMPLATES[btn.dataset.i]
        overlay.querySelector('#bk-acc-name').value = tpl.name
        selColor = tpl.color || selColor
        overlay.querySelectorAll('.bk-color-dot').forEach(d => { d.classList.remove('sel'); if (d.dataset.c === selColor) d.classList.add('sel') })
      })
    })
    overlay.querySelector('#bk-cancel').addEventListener('click', () => overlay.remove())
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
    overlay.querySelector('#bk-save').addEventListener('click', async () => {
      const name = overlay.querySelector('#bk-acc-name').value.trim()
      if (!name) { alert('Введіть назву рахунку'); return }
      const btn = overlay.querySelector('#bk-save')
      btn.textContent = 'Збереження...'; btn.disabled = true
      try {
        const newAcc = await addDoc(accRef(), {
          name,
          currency:       overlay.querySelector('#bk-acc-curr').value,
          initialBalance: parseFloat(overlay.querySelector('#bk-acc-init').value) || 0,
          iban:           overlay.querySelector('#bk-acc-iban').value.trim(),
          color:          selColor,
          createdAt: serverTimestamp(),
        })
        activeAccId = newAcc.id
        overlay.remove()
        await loadAll()
      } catch (err) { btn.textContent = 'Додати'; btn.disabled = false; alert('Помилка: ' + err.message) }
    })
  }

  function openTransModal(type) {
    const isCredit = type === 'credit'
    const activeAcc = accounts.find(a => a.id === activeAccId)
    const overlay = document.createElement('div')
    overlay.className = 'bk-overlay'
    overlay.innerHTML = `
      <div class="bk-modal">
        <h3 style="color:${isCredit ? '#34D399' : '#EF4444'}">
          ${isCredit ? icon('plus', 16) : icon('minus', 16)}
          ${isCredit ? 'Надходження' : 'Видаток'} · ${activeAcc?.name || ''}
        </h3>
        <div class="bk-modal-row">
          <div class="bk-field">
            <label>Дата *</label>
            <input id="bk-t-date" type="date" value="${today()}">
          </div>
          <div class="bk-field">
            <label>Сума *</label>
            <input id="bk-t-amount" type="number" min="0.01" step="0.01" placeholder="0.00">
          </div>
        </div>
        <div class="bk-field">
          <label>Контрагент</label>
          <input id="bk-t-counter" placeholder="${isCredit ? 'Від кого' : 'Кому'}">
        </div>
        <div class="bk-field">
          <label>Категорія</label>
          <select id="bk-t-cat">${TRANS_CATS.map(c => `<option>${c}</option>`).join('')}</select>
        </div>
        <div class="bk-field">
          <label>Призначення</label>
          <input id="bk-t-desc" placeholder="Опис операції...">
        </div>
        <div class="bk-modal-actions">
          <button class="bk-modal-cancel" id="bk-cancel">Скасувати</button>
          <button class="bk-modal-save" id="bk-save" style="background:${isCredit ? '#34D399' : '#EF4444'}">Провести</button>
        </div>
      </div>
    `
    document.body.appendChild(overlay)
    overlay.querySelector('#bk-cancel').addEventListener('click', () => overlay.remove())
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
    overlay.querySelector('#bk-save').addEventListener('click', async () => {
      const amount = parseFloat(overlay.querySelector('#bk-t-amount').value)
      const date   = overlay.querySelector('#bk-t-date').value
      if (!date || !amount || amount <= 0) { alert('Введіть дату та суму'); return }
      const btn = overlay.querySelector('#bk-save')
      btn.textContent = 'Збереження...'; btn.disabled = true
      try {
        await addDoc(transRef(), {
          accountId:    activeAccId,
          type,
          date,
          counterparty: overlay.querySelector('#bk-t-counter').value.trim(),
          category:     overlay.querySelector('#bk-t-cat').value,
          description:  overlay.querySelector('#bk-t-desc').value.trim(),
          amount,
          createdAt: serverTimestamp(),
        })
        overlay.remove()
        await loadAll()
      } catch (err) { btn.textContent = 'Провести'; btn.disabled = false; alert('Помилка: ' + err.message) }
    })
  }

  await loadAll()
}
