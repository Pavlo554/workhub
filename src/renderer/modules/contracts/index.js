// src/renderer/modules/contracts/index.js
import { db } from '../../services/firebase.js'
import { getCurrentUser, getUserProfile, getActivePathSegments } from '../../services/auth.js'
import { icon } from '../../utils/icons.js'
import {
  collection, addDoc, getDocs, deleteDoc, doc, updateDoc,
  query, orderBy, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
import { generateContractPDF } from './contract-pdf.js'

const ST_META = {
  active:    { label: 'Активний',   color: '#34D399', bg: 'rgba(52,211,153,0.12)'  },
  completed: { label: 'Завершений', color: '#6B7280', bg: 'rgba(107,114,128,0.12)' },
  draft:     { label: 'Чернетка',   color: '#F59E0B', bg: 'rgba(245,158,11,0.12)'  },
  cancelled: { label: 'Скасовано',  color: '#EF4444', bg: 'rgba(239,68,68,0.12)'   },
}

export async function render(container) {
  injectStyles()

  container.innerHTML = `
    <div class="ct-layout">

      <!-- ══ LEFT ══ -->
      <div class="ct-left" id="ct-left">

        <div class="ct-header">
          <div>
            <h1 class="ct-title">Договори</h1>
            <p class="ct-sub" id="ct-count">Завантаження...</p>
          </div>
          <button class="btn btn-primary" id="add-contract-btn">+ Новий</button>
        </div>

        <!-- Stats -->
        <div class="ct-stats" id="ct-stats"></div>

        <!-- Filters -->
        <div class="ct-filters" id="ct-filters">
          <button class="ct-filter active" data-filter="all">Всі</button>
          <button class="ct-filter" data-filter="active">Активні</button>
          <button class="ct-filter" data-filter="draft">Чернетки</button>
          <button class="ct-filter" data-filter="completed">Завершені</button>
          <button class="ct-filter" data-filter="cancelled">Скасовані</button>
        </div>

        <div id="ct-list">
          <div class="ct-loading"><div class="spinner"></div></div>
        </div>

      </div>

      <!-- ══ RIGHT DETAIL ══ -->
      <div class="ct-right" id="ct-right" style="display:none">
        <div class="ct-detail" id="ct-detail"></div>
      </div>

    </div>

    <!-- ══ MODAL ══ -->
    <div class="modal-overlay" id="ct-modal" style="display:none">
      <div class="modal" style="max-width:640px">
        <div class="modal-header">
          <h2 class="modal-title" id="ct-modal-title">Новий договір</h2>
          <button class="modal-close" id="ct-modal-close">${icon('x', 14)}</button>
        </div>
        <form class="modal-form" id="ct-form" novalidate>
          <div class="modal-body">
            <div class="form-row">
              <div class="field">
                <label>Номер договору *</label>
                <input id="f-number" type="text" class="input" placeholder="DOG-001" />
                <span class="field-error" id="e-number"></span>
              </div>
              <div class="field">
                <label>Статус</label>
                <select id="f-status" class="input">
                  <option value="active">Активний</option>
                  <option value="draft">Чернетка</option>
                  <option value="completed">Завершений</option>
                  <option value="cancelled">Скасовано</option>
                </select>
              </div>
            </div>

            <div class="field">
              <label>Клієнт *</label>
              <input id="f-client" type="text" class="input" placeholder="Назва клієнта або компанії" />
              <span class="field-error" id="e-client"></span>
            </div>

            <div class="field">
              <label>Предмет договору *</label>
              <textarea id="f-subject" class="input" rows="3" placeholder="Опис предмету договору..."></textarea>
              <span class="field-error" id="e-subject"></span>
            </div>

            <div class="form-row">
              <div class="field">
                <label>Сума договору</label>
                <div class="amount-input-wrapper">
                  <span class="currency">₴</span>
                  <input id="f-amount" type="number" class="input amount-input" placeholder="0.00" step="0.01" />
                </div>
              </div>
              <div class="field">
                <label>Дата підписання</label>
                <input id="f-date" type="date" class="input" />
              </div>
            </div>

            <div class="form-row">
              <div class="field">
                <label>Дата початку</label>
                <input id="f-start" type="date" class="input" />
              </div>
              <div class="field">
                <label>Дата закінчення</label>
                <input id="f-end" type="date" class="input" />
              </div>
            </div>

            <div class="field">
              <label>Примітки</label>
              <textarea id="f-notes" class="input" rows="2" placeholder="Додаткова інформація..."></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="ct-modal-cancel">Скасувати</button>
            <button type="submit" class="btn btn-primary" id="ct-modal-submit">Зберегти</button>
          </div>
        </form>
      </div>
    </div>
  `

  const user = getCurrentUser()
  const base = getActivePathSegments(user.uid)
  let contracts = []
  let editingId = null
  let currentFilter = 'all'
  let selectedId = null

  // ── Load ──────────────────────────────────────────────────
  async function loadContracts() {
    try {
      const q = query(collection(db, ...base, 'contracts'), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      contracts = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch {
      try {
        const snap = await getDocs(collection(db, ...base, 'contracts'))
        contracts = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      } catch (err) {
        console.error(err)
        contracts = []
      }
    }
    updateStats()
    renderList()
    if (selectedId) {
      const c = contracts.find(x => x.id === selectedId)
      if (c) openDetail(c); else closeDetail()
    }
  }

  // ── Stats ─────────────────────────────────────────────────
  function updateStats() {
    const total     = contracts.length
    const active    = contracts.filter(c => c.status === 'active').length
    const completed = contracts.filter(c => c.status === 'completed').length
    const totalVal  = contracts.reduce((s, c) => s + (Number(c.amount) || 0), 0)

    container.querySelector('#ct-count').textContent =
      `${total} ${plural(total, 'договір','договори','договорів')}`

    const stats = [
      { label: 'Всього',     value: total,    color: '#4F8EF7' },
      { label: 'Активних',   value: active,   color: '#34D399' },
      { label: 'Завершених', value: completed, color: '#6B7280' },
      { label: 'Загальна сума', value: totalVal > 0 ? `₴${fmtNum(totalVal)}` : '—', color: '#A78BFA' },
    ]
    container.querySelector('#ct-stats').innerHTML = stats.map(s => `
      <div class="ct-stat-card" style="--sc:${s.color}">
        <div class="ct-stat-val">${s.value}</div>
        <div class="ct-stat-lbl">${s.label}</div>
      </div>
    `).join('')
  }

  // ── Render list ───────────────────────────────────────────
  function renderList() {
    const list = currentFilter === 'all'
      ? contracts
      : contracts.filter(c => c.status === currentFilter)

    const el = container.querySelector('#ct-list')

    if (list.length === 0) {
      el.innerHTML = `
        <div class="ct-empty">
          <div class="ct-empty-icon">${icon('contracts', 40)}</div>
          <div class="ct-empty-title">${currentFilter === 'all' ? 'Договорів ще немає' : 'Нічого не знайдено'}</div>
          <div class="ct-empty-desc">Створіть перший договір з клієнтом</div>
        </div>
      `
      return
    }

    el.innerHTML = `<div class="ct-grid">${list.map(c => renderCard(c)).join('')}</div>`

    el.querySelectorAll('.ct-card').forEach(card => {
      card.addEventListener('click', () => {
        const contract = contracts.find(x => x.id === card.dataset.id)
        if (!contract) return
        if (selectedId === contract.id) { closeDetail(); return }
        openDetail(contract)
      })
    })
  }

  function renderCard(c) {
    const st  = ST_META[c.status] || ST_META.active
    const isSelected = selectedId === c.id
    const isOverdue = c.endDate && new Date(c.endDate) < new Date() && c.status === 'active'
    return `
      <div class="ct-card ${isSelected ? 'ct-selected' : ''}" data-id="${c.id}" style="--sc:${st.color}">
        <div class="ct-card-stripe"></div>
        <div class="ct-card-body">
          <div class="ct-card-top">
            <span class="ct-num">${c.number || '—'}</span>
            <span class="ct-badge" style="background:${st.bg};color:${st.color}">${st.label}</span>
          </div>
          <div class="ct-card-client">${c.client || '—'}</div>
          <div class="ct-card-subject">${c.subject || ''}</div>
          <div class="ct-card-footer">
            ${c.amount ? `<span class="ct-card-amount">₴${fmtNum(c.amount)}</span>` : '<span></span>'}
            <span class="ct-card-date ${isOverdue ? 'ct-overdue' : ''}">
              ${c.endDate ? fmtDate(c.endDate) : (c.date ? fmtDate(c.date) : '')}
            </span>
          </div>
        </div>
      </div>
    `
  }

  // ── Detail panel ──────────────────────────────────────────
  function openDetail(c) {
    selectedId = c.id
    container.querySelector('#ct-left').classList.add('ct-has-detail')
    const right = container.querySelector('#ct-right')
    right.style.display = 'flex'

    const st = ST_META[c.status] || ST_META.active
    const isOverdue = c.endDate && new Date(c.endDate) < new Date() && c.status === 'active'

    container.querySelector('#ct-detail').innerHTML = `
      <div class="ct-d-stripe" style="background:${st.color}"></div>

      <div class="ct-d-head">
        <button class="ct-d-close" id="ct-d-close">${icon('x', 14)}</button>
        <div class="ct-d-num">${c.number || '—'}</div>
        <div class="ct-d-client">${c.client || '—'}</div>
        <div class="ct-d-status-badge" style="background:${st.bg};color:${st.color}">${st.label}</div>
        ${c.amount ? `<div class="ct-d-amount">₴${fmtNum(c.amount)}</div>` : ''}
      </div>

      ${c.subject ? `
      <div class="ct-d-section">
        <div class="ct-d-section-label">Предмет договору</div>
        <div class="ct-d-desc">${c.subject}</div>
      </div>` : ''}

      <div class="ct-d-section">
        <div class="ct-d-section-label">Деталі</div>
        <div class="ct-d-details">
          ${c.date      ? `<div class="ct-d-row"><span>Підписано</span><span>${fmtDate(c.date)}</span></div>` : ''}
          ${c.startDate ? `<div class="ct-d-row"><span>Початок</span><span>${fmtDate(c.startDate)}</span></div>` : ''}
          ${c.endDate   ? `<div class="ct-d-row"><span>Закінчення</span><span class="${isOverdue ? 'ct-text-red' : ''}">${fmtDate(c.endDate)}${isOverdue ? ' — прострочено' : ''}</span></div>` : ''}
        </div>
      </div>

      ${c.notes ? `
      <div class="ct-d-section">
        <div class="ct-d-section-label">Примітки</div>
        <div class="ct-d-notes">${c.notes}</div>
      </div>` : ''}

      <!-- Status change -->
      <div class="ct-d-section">
        <div class="ct-d-section-label">Змінити статус</div>
        <div class="ct-d-status-row">
          ${Object.entries(ST_META).map(([key, s]) => `
            <button class="ct-st-btn ${c.status === key ? 'ct-st-active' : ''}"
              data-status="${key}"
              style="${c.status === key ? `background:${s.bg};color:${s.color};border-color:${s.color}` : ''}">
              ${s.label}
            </button>
          `).join('')}
        </div>
      </div>

      <!-- PDF button -->
      <div class="ct-d-section">
        <button class="ct-pdf-btn" id="ct-d-pdf">Завантажити PDF</button>
      </div>

      <div class="ct-d-footer">
        <button class="btn btn-secondary" id="ct-d-edit">Редагувати</button>
        <button class="btn btn-danger"    id="ct-d-del">Видалити</button>
      </div>
    `

    // Refresh cards highlight
    container.querySelectorAll('.ct-card').forEach(el => {
      el.classList.toggle('ct-selected', el.dataset.id === c.id)
    })

    // Status change
    container.querySelectorAll('.ct-st-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const newStatus = btn.dataset.status
        if (newStatus === c.status) return
        await updateDoc(doc(db, ...base, 'contracts', c.id), { status: newStatus, updatedAt: serverTimestamp() })
        await loadContracts()
      })
    })

    // PDF
    container.querySelector('#ct-d-pdf').addEventListener('click', async () => {
      const profile = await getUserProfile(user.uid)
      try { await generateContractPDF(c, profile) }
      catch (err) { console.error('PDF error:', err); alert('Помилка генерації PDF') }
    })

    // Edit
    container.querySelector('#ct-d-edit').addEventListener('click', () => openModal(c))

    // Delete
    container.querySelector('#ct-d-del').addEventListener('click', async () => {
      if (!confirm('Видалити договір?')) return
      await deleteDoc(doc(db, ...base, 'contracts', c.id))
      closeDetail()
      await loadContracts()
    })

    // Close button
    container.querySelector('#ct-d-close').addEventListener('click', closeDetail)
  }

  function closeDetail() {
    selectedId = null
    container.querySelector('#ct-right').style.display = 'none'
    container.querySelector('#ct-left').classList.remove('ct-has-detail')
    container.querySelectorAll('.ct-card').forEach(el => el.classList.remove('ct-selected'))
  }

  // ── Filters ───────────────────────────────────────────────
  container.querySelectorAll('.ct-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.ct-filter').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      currentFilter = btn.dataset.filter
      renderList()
    })
  })

  // ── Modal ─────────────────────────────────────────────────
  function openModal(contract = null) {
    editingId = contract?.id || null
    container.querySelector('#ct-modal-title').textContent = contract ? 'Редагувати договір' : 'Новий договір'
    container.querySelector('#f-number').value  = contract?.number  || `DOG-${Date.now().toString().slice(-6)}`
    container.querySelector('#f-client').value  = contract?.client  || ''
    container.querySelector('#f-subject').value = contract?.subject || ''
    container.querySelector('#f-amount').value  = contract?.amount  || ''
    container.querySelector('#f-status').value  = contract?.status  || 'active'
    container.querySelector('#f-date').value    = contract?.date    || new Date().toISOString().split('T')[0]
    container.querySelector('#f-start').value   = contract?.startDate || ''
    container.querySelector('#f-end').value     = contract?.endDate   || ''
    container.querySelector('#f-notes').value   = contract?.notes     || ''

    container.querySelectorAll('.field-error').forEach(el => el.textContent = '')
    container.querySelector('#ct-modal').style.display = 'flex'
    setTimeout(() => container.querySelector('#f-number').focus(), 100)
  }

  function closeModal() {
    container.querySelector('#ct-modal').style.display = 'none'
    editingId = null
  }

  container.querySelector('#add-contract-btn').addEventListener('click', () => openModal())
  container.querySelector('#ct-modal-close').addEventListener('click', closeModal)
  container.querySelector('#ct-modal-cancel').addEventListener('click', closeModal)
  container.querySelector('#ct-modal').addEventListener('click', e => {
    if (e.target === container.querySelector('#ct-modal')) closeModal()
  })

  // ── Save ──────────────────────────────────────────────────
  container.querySelector('#ct-form').addEventListener('submit', async (e) => {
    e.preventDefault()

    const number  = container.querySelector('#f-number').value.trim()
    const client  = container.querySelector('#f-client').value.trim()
    const subject = container.querySelector('#f-subject').value.trim()

    let hasError = false
    if (!number)  { container.querySelector('#e-number').textContent  = 'Введіть номер';   hasError = true }
    if (!client)  { container.querySelector('#e-client').textContent  = 'Введіть клієнта'; hasError = true }
    if (!subject) { container.querySelector('#e-subject').textContent = 'Введіть предмет'; hasError = true }
    if (hasError) return

    const btn = container.querySelector('#ct-modal-submit')
    btn.disabled = true
    btn.innerHTML = '<div class="spinner"></div>'

    const data = {
      number,
      client,
      subject,
      amount:    parseFloat(container.querySelector('#f-amount').value)  || null,
      status:    container.querySelector('#f-status').value,
      date:      container.querySelector('#f-date').value                || null,
      startDate: container.querySelector('#f-start').value               || null,
      endDate:   container.querySelector('#f-end').value                 || null,
      notes:     container.querySelector('#f-notes').value.trim()        || null,
    }

    try {
      if (editingId) {
        await updateDoc(doc(db, ...base, 'contracts', editingId), { ...data, updatedAt: serverTimestamp() })
      } else {
        await addDoc(collection(db, ...base, 'contracts'), { ...data, createdAt: serverTimestamp() })
      }
      closeModal()
      await loadContracts()
    } catch (err) {
      console.error(err)
    } finally {
      btn.disabled = false
      btn.innerHTML = 'Зберегти'
    }
  })

  await loadContracts()
}

// ── Helpers ───────────────────────────────────────────────
function fmtDate(val) {
  if (!val) return ''
  try { return new Date(val).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
  catch { return val }
}

function fmtNum(n) {
  const num = Number(n)
  if (isNaN(num)) return '0'
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace('.0','') + 'M'
  if (num >= 1000)    return (num / 1000).toFixed(1).replace('.0','') + 'k'
  return num.toLocaleString('uk-UA')
}

function plural(n, one, few, many) {
  const mod10 = n % 10, mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} ${one}`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} ${few}`
  return `${n} ${many}`
}

// ── Styles ────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('ct-styles')) return
  const style = document.createElement('style')
  style.id = 'ct-styles'
  style.textContent = `

  /* ── Layout ── */
  .ct-layout {
    display: flex; height: 100%; overflow: hidden;
  }
  .ct-left {
    flex: 1; display: flex; flex-direction: column; overflow: hidden;
    padding: 28px 28px 0; transition: all .2s;
  }
  .ct-right {
    width: 370px; flex-shrink: 0; border-left: 1px solid var(--border);
    display: flex; flex-direction: column; overflow-y: auto;
    background: var(--bg-secondary);
  }

  /* ── Header ── */
  .ct-header {
    display: flex; align-items: flex-start; justify-content: space-between;
    margin-bottom: 20px; gap: 12px; flex-shrink: 0;
  }
  .ct-title { font-family: var(--font-display); font-size: 22px; font-weight: 800; letter-spacing: -0.02em; }
  .ct-sub   { font-size: 13px; color: var(--text-secondary); margin-top: 2px; }

  /* ── Stats ── */
  .ct-stats {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;
    margin-bottom: 16px; flex-shrink: 0;
  }
  .ct-stat-card {
    background: var(--bg-secondary); border: 1px solid var(--border);
    border-left: 3px solid var(--sc); border-radius: var(--radius-lg);
    padding: 12px 14px; transition: transform .15s;
  }
  .ct-stat-card:hover { transform: translateY(-1px); }
  .ct-stat-val { font-family: var(--font-display); font-size: 22px; font-weight: 800; color: var(--sc); }
  .ct-stat-lbl { font-size: 11px; color: var(--text-muted); margin-top: 2px; text-transform: uppercase; letter-spacing: .04em; font-weight: 600; }

  /* ── Filters ── */
  .ct-filters {
    display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 16px; flex-shrink: 0;
  }
  .ct-filter {
    padding: 6px 14px; border-radius: var(--radius-full); font-size: 12px; font-weight: 600;
    border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-secondary);
    cursor: pointer; transition: all .15s;
  }
  .ct-filter:hover  { border-color: var(--accent-blue); color: var(--text-primary); }
  .ct-filter.active { background: var(--accent-blue); color: #fff; border-color: var(--accent-blue); }

  /* ── List ── */
  #ct-list { flex: 1; overflow-y: auto; padding-bottom: 24px; }

  .ct-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px;
  }

  /* ── Card ── */
  .ct-card {
    background: var(--bg-secondary); border: 1px solid var(--border);
    border-radius: var(--radius-lg); overflow: hidden; cursor: pointer;
    display: flex; transition: all .15s;
  }
  .ct-card:hover   { border-color: rgba(255,255,255,0.14); transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,.25); }
  .ct-card.ct-selected { border-color: var(--accent-blue); box-shadow: 0 0 0 2px rgba(79,142,247,0.2); }

  .ct-card-stripe { width: 4px; background: var(--sc); flex-shrink: 0; }
  .ct-card-body   { flex: 1; padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; min-width: 0; }

  .ct-card-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .ct-num {
    font-family: var(--font-mono); font-size: 11px; font-weight: 700;
    color: var(--text-muted); background: var(--bg-tertiary);
    border: 1px solid var(--border); padding: 2px 8px; border-radius: var(--radius-full);
  }
  .ct-badge {
    font-size: 10px; font-weight: 700; padding: 2px 8px;
    border-radius: var(--radius-xs); text-transform: uppercase; letter-spacing: .04em;
    white-space: nowrap;
  }
  .ct-card-client  { font-weight: 700; font-size: 15px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ct-card-subject {
    font-size: 12px; color: var(--text-secondary); line-height: 1.5;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .ct-card-footer  { display: flex; justify-content: space-between; align-items: center; margin-top: 4px; }
  .ct-card-amount  { font-family: var(--font-display); font-size: 16px; font-weight: 800; color: var(--accent-blue); }
  .ct-card-date    { font-size: 11px; color: var(--text-muted); }
  .ct-overdue      { color: #EF4444 !important; }

  /* ── Empty ── */
  .ct-loading, .ct-empty {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 60px 20px; gap: 10px; color: var(--text-muted);
  }
  .ct-empty-icon  { display:flex; align-items:center; justify-content:center; color:var(--text-muted); }
  .ct-empty-title { font-size: 15px; font-weight: 600; color: var(--text-secondary); }
  .ct-empty-desc  { font-size: 13px; }

  /* ── Detail panel ── */
  .ct-detail { display: flex; flex-direction: column; flex: 1; }
  .ct-d-stripe { height: 5px; flex-shrink: 0; }

  .ct-d-head {
    padding: 20px 22px 16px; border-bottom: 1px solid var(--border);
    display: flex; flex-direction: column; gap: 4px; position: relative;
  }
  .ct-d-close {
    position: absolute; top: 14px; right: 14px;
    width: 28px; height: 28px; border-radius: 50%;
    border: 1px solid var(--border); background: var(--bg-tertiary);
    color: var(--text-muted); font-size: 12px; cursor: pointer; display: flex;
    align-items: center; justify-content: center; transition: all .15s;
  }
  .ct-d-close:hover { background: var(--bg-elevated); color: var(--text-primary); }

  .ct-d-num    { font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); font-weight: 600; }
  .ct-d-client { font-family: var(--font-display); font-size: 20px; font-weight: 800; letter-spacing: -0.01em; line-height: 1.2; margin-top: 2px; }
  .ct-d-status-badge {
    display: inline-flex; width: fit-content; font-size: 11px; font-weight: 700;
    padding: 3px 10px; border-radius: var(--radius-xs); text-transform: uppercase; letter-spacing: .04em;
    margin-top: 4px;
  }
  .ct-d-amount {
    font-family: var(--font-display); font-size: 28px; font-weight: 800;
    color: var(--accent-blue); letter-spacing: -0.02em; margin-top: 6px;
  }

  .ct-d-section { padding: 16px 22px; border-bottom: 1px solid var(--border); }
  .ct-d-section-label {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .07em; color: var(--text-muted); margin-bottom: 10px;
  }

  .ct-d-desc  { font-size: 13px; color: var(--text-secondary); line-height: 1.6; }
  .ct-d-notes { font-size: 13px; color: var(--text-secondary); line-height: 1.6; font-style: italic; }

  .ct-d-details { display: flex; flex-direction: column; gap: 8px; }
  .ct-d-row {
    display: flex; justify-content: space-between; align-items: center;
    font-size: 13px;
  }
  .ct-d-row span:first-child { color: var(--text-secondary); }
  .ct-d-row span:last-child  { font-weight: 600; }
  .ct-text-red { color: #EF4444 !important; }

  .ct-d-status-row { display: flex; gap: 6px; flex-wrap: wrap; }
  .ct-st-btn {
    padding: 6px 12px; border-radius: var(--radius-full); font-size: 12px; font-weight: 600;
    border: 1px solid var(--border); background: var(--bg-tertiary); color: var(--text-secondary);
    cursor: pointer; transition: all .15s;
  }
  .ct-st-btn:hover { border-color: var(--accent-blue); color: var(--text-primary); }
  .ct-st-btn.ct-st-active { font-weight: 700; }

  .ct-pdf-btn {
    width: 100%; padding: 10px; border-radius: var(--radius-md);
    border: 1px solid var(--border); background: var(--bg-tertiary);
    color: var(--text-primary); font-size: 13px; font-weight: 600;
    cursor: pointer; transition: all .15s; text-align: center;
  }
  .ct-pdf-btn:hover { border-color: var(--accent-blue); color: var(--accent-blue); }

  .ct-d-footer {
    display: flex; gap: 8px; padding: 16px 22px; margin-top: auto;
    border-top: 1px solid var(--border);
  }
  .ct-d-footer .btn { flex: 1; justify-content: center; }

  .btn-danger {
    background: rgba(239,68,68,0.12); color: #EF4444;
    border: 1px solid rgba(239,68,68,0.25);
  }
  .btn-danger:hover { background: rgba(239,68,68,0.2); }

  /* ── Modal helpers ── */
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .amount-input-wrapper { position: relative; }
  .currency { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); font-size: 16px; font-weight: 600; color: var(--text-secondary); pointer-events: none; }
  .amount-input { padding-left: 32px !important; }
  `
  document.head.appendChild(style)
}
