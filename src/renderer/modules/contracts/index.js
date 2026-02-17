// src/renderer/modules/contracts/index.js
import { db } from '../../services/firebase.js'
import { getCurrentUser, getUserProfile } from '../../services/auth.js'
import {
  collection, addDoc, getDocs, deleteDoc, doc, updateDoc,
  query, orderBy, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
import { generateContractPDF } from './contract-pdf.js'

export async function render(container) {
  container.innerHTML = `
    <div class="contracts-page">
      <div class="page-header">
        <div>
          <h1 class="page-title">📝 Договори</h1>
          <p class="page-subtitle" id="contracts-count">Завантаження...</p>
        </div>
        <button class="btn btn-primary" id="add-contract-btn">+ Новий договір</button>
      </div>

      <div class="contract-stats">
        <div class="stat-card">
          <div class="stat-icon">📋</div>
          <div class="stat-body">
            <div class="stat-label">Всього</div>
            <div class="stat-value" id="total-count">0</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">✓</div>
          <div class="stat-body">
            <div class="stat-label">Активні</div>
            <div class="stat-value" id="active-count">0</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">⏱</div>
          <div class="stat-body">
            <div class="stat-label">Завершені</div>
            <div class="stat-value" id="completed-count">0</div>
          </div>
        </div>
      </div>

      <div class="contract-filter">
        <button class="filter-btn active" data-filter="all">Всі</button>
        <button class="filter-btn" data-filter="active">Активні</button>
        <button class="filter-btn" data-filter="completed">Завершені</button>
      </div>

      <div id="contracts-list" class="contracts-list">
        <div class="clients-loading"><div class="spinner"></div></div>
      </div>
    </div>

    <div class="modal-overlay" id="modal" style="display:none">
      <div class="modal" style="max-width:640px">
        <div class="modal-header">
          <h2 class="modal-title" id="modal-title">Новий договір</h2>
          <button class="modal-close" id="modal-close">✕</button>
        </div>
        <form class="modal-form" id="contract-form" novalidate>
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
                  <option value="completed">Завершений</option>
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
            <button type="button" class="btn btn-secondary" id="modal-cancel">Скасувати</button>
            <button type="submit" class="btn btn-primary" id="modal-submit">Зберегти</button>
          </div>
        </form>
      </div>
    </div>
  `

  injectStyles()

  const user = getCurrentUser()
  let contracts = []
  let editingId = null
  let currentFilter = 'all'

  // Load
  async function loadContracts() {
    try {
      const q = query(collection(db, 'users', user.uid, 'contracts'), orderBy('date', 'desc'))
      const snap = await getDocs(q)
      contracts = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      renderList(filterContracts())
      updateStats()
    } catch (err) {
      console.error(err)
      container.querySelector('#contracts-list').innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <div class="empty-title">Помилка завантаження</div>
        </div>
      `
    }
  }

  // Render
  function renderList(list) {
    const el = container.querySelector('#contracts-list')
    if (list.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📝</div>
          <div class="empty-title">Договорів ще немає</div>
          <div class="empty-desc">Створіть перший договір з клієнтом</div>
        </div>
      `
      return
    }

    el.innerHTML = `
      <div class="contracts-grid">
        ${list.map(c => `
          <div class="contract-card ${c.status}" data-id="${c.id}">
            <div class="contract-header">
              <div class="contract-number">${c.number}</div>
              <div class="contract-status ${c.status}">
                ${c.status === 'active' ? '✓ Активний' : '⏱ Завершений'}
              </div>
            </div>
            <div class="contract-client">${c.client}</div>
            <div class="contract-subject">${c.subject}</div>
            ${c.amount ? `<div class="contract-amount">₴${c.amount.toLocaleString('uk-UA', {minimumFractionDigits: 2})}</div>` : ''}
            <div class="contract-dates">
              ${c.startDate && c.endDate ? `
                <span>📅 ${formatDate(c.startDate)} — ${formatDate(c.endDate)}</span>
              ` : `<span>📅 ${formatDate(c.date)}</span>`}
            </div>
            <div class="contract-actions">
              <button class="client-btn pdf-btn" data-id="${c.id}" title="Завантажити PDF">📄</button>
              <button class="client-btn edit-btn" data-id="${c.id}" title="Редагувати">✏️</button>
              <button class="client-btn delete-btn" data-id="${c.id}" title="Видалити">🗑</button>
            </div>
          </div>
        `).join('')}
      </div>
    `

    el.querySelectorAll('.pdf-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const contract = contracts.find(c => c.id === btn.dataset.id)
        const profile = await getUserProfile(user.uid)
        try {
          await generateContractPDF(contract, profile)
        } catch (err) {
          console.error('PDF generation error:', err)
          alert('Помилка генерації PDF')
        }
      })
    })

    el.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const contract = contracts.find(c => c.id === btn.dataset.id)
        openModal(contract)
      })
    })

    el.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        if (!confirm('Видалити договір?')) return
        await deleteDoc(doc(db, 'users', user.uid, 'contracts', btn.dataset.id))
        await loadContracts()
      })
    })
  }

  // Stats
  function updateStats() {
    const total = contracts.length
    const active = contracts.filter(c => c.status === 'active').length
    const completed = contracts.filter(c => c.status === 'completed').length

    container.querySelector('#total-count').textContent = total
    container.querySelector('#active-count').textContent = active
    container.querySelector('#completed-count').textContent = completed
    container.querySelector('#contracts-count').textContent = `${total} договорів`
  }

  // Filter
  function filterContracts() {
    if (currentFilter === 'all') return contracts
    return contracts.filter(c => c.status === currentFilter)
  }

  container.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      currentFilter = btn.dataset.filter
      renderList(filterContracts())
    })
  })

  // Modal
  function openModal(contract = null) {
    editingId = contract?.id || null
    container.querySelector('#modal-title').textContent = contract ? 'Редагувати договір' : 'Новий договір'
    container.querySelector('#f-number').value = contract?.number || `DOG-${Date.now().toString().slice(-6)}`
    container.querySelector('#f-client').value = contract?.client || ''
    container.querySelector('#f-subject').value = contract?.subject || ''
    container.querySelector('#f-amount').value = contract?.amount || ''
    container.querySelector('#f-status').value = contract?.status || 'active'
    container.querySelector('#f-date').value = contract?.date || new Date().toISOString().split('T')[0]
    container.querySelector('#f-start').value = contract?.startDate || ''
    container.querySelector('#f-end').value = contract?.endDate || ''
    container.querySelector('#f-notes').value = contract?.notes || ''

    container.querySelectorAll('.field-error').forEach(el => el.textContent = '')
    container.querySelector('#modal').style.display = 'flex'
    setTimeout(() => container.querySelector('#f-number').focus(), 100)
  }

  function closeModal() {
    container.querySelector('#modal').style.display = 'none'
    editingId = null
  }

  container.querySelector('#add-contract-btn').addEventListener('click', () => openModal())
  container.querySelector('#modal-close').addEventListener('click', closeModal)
  container.querySelector('#modal-cancel').addEventListener('click', closeModal)
  container.querySelector('#modal').addEventListener('click', (e) => {
    if (e.target === container.querySelector('#modal')) closeModal()
  })

  // Save
  container.querySelector('#contract-form').addEventListener('submit', async (e) => {
    e.preventDefault()

    const number = container.querySelector('#f-number').value.trim()
    const client = container.querySelector('#f-client').value.trim()
    const subject = container.querySelector('#f-subject').value.trim()

    let hasError = false
    if (!number) { container.querySelector('#e-number').textContent = 'Введіть номер'; hasError = true }
    if (!client) { container.querySelector('#e-client').textContent = 'Введіть клієнта'; hasError = true }
    if (!subject) { container.querySelector('#e-subject').textContent = 'Введіть предмет'; hasError = true }
    if (hasError) return

    const btn = container.querySelector('#modal-submit')
    btn.disabled = true
    btn.innerHTML = '<div class="spinner"></div>'

    const amount = parseFloat(container.querySelector('#f-amount').value)

    const data = {
      number,
      client,
      subject,
      amount: amount || null,
      status: container.querySelector('#f-status').value,
      date: container.querySelector('#f-date').value,
      startDate: container.querySelector('#f-start').value || null,
      endDate: container.querySelector('#f-end').value || null,
      notes: container.querySelector('#f-notes').value.trim() || null,
    }

    try {
      if (editingId) {
        await updateDoc(doc(db, 'users', user.uid, 'contracts', editingId), {
          ...data, updatedAt: serverTimestamp()
        })
      } else {
        await addDoc(collection(db, 'users', user.uid, 'contracts'), {
          ...data, createdAt: serverTimestamp()
        })
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

  function formatDate(dateStr) {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }
}

// Styles
function injectStyles() {
  if (document.getElementById('contracts-styles')) return
  const style = document.createElement('style')
  style.id = 'contracts-styles'
  style.textContent = `
    .contracts-page { padding: 32px 36px; max-width: 1100px; }
    
    .contract-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin-bottom:24px; }
    .stat-card { display:flex; align-items:center; gap:14px; background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-md); padding:18px; }
    .stat-icon { width:44px; height:44px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:20px; background:var(--bg-tertiary); flex-shrink:0; }
    .stat-body { flex:1; }
    .stat-label { font-size:12px; color:var(--text-secondary); margin-bottom:4px; }
    .stat-value { font-family:var(--font-display); font-size:22px; font-weight:700; }
    
    .contract-filter { display:flex; gap:8px; margin-bottom:20px; }
    .filter-btn { padding:8px 16px; border-radius:var(--radius-sm); font-size:13px; font-weight:500; color:var(--text-secondary); background:var(--bg-secondary); border:1px solid var(--border); transition:all .2s; }
    .filter-btn:hover { background:var(--bg-tertiary); }
    .filter-btn.active { background:var(--accent-blue); color:#fff; border-color:var(--accent-blue); }
    
    .contracts-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(340px,1fr)); gap:14px; }

    .contract-card { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-lg); padding:20px; transition:all .2s; position:relative; }
    .contract-card:hover { border-color:rgba(255,255,255,0.12); transform:translateY(-2px); box-shadow:var(--shadow-sm); }
    .contract-card.active { border-left:3px solid #34D399; }
    .contract-card.completed { border-left:3px solid var(--text-muted); }

    .contract-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; }
    .contract-number { font-family:var(--font-mono); font-size:13px; font-weight:600; color:var(--text-secondary); }
    .contract-status { font-size:11px; font-weight:600; padding:4px 10px; border-radius:var(--radius-full); }
    .contract-status.active { background:rgba(52,211,153,0.12); color:#34D399; }
    .contract-status.completed { background:var(--bg-tertiary); color:var(--text-muted); }

    .contract-client { font-weight:600; font-size:16px; margin-bottom:8px; }
    .contract-subject { font-size:13px; color:var(--text-secondary); margin-bottom:10px; line-height:1.5; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
    .contract-amount { font-family:var(--font-display); font-size:18px; font-weight:700; color:var(--accent-blue); margin-bottom:10px; }
    .contract-dates { font-size:11px; color:var(--text-muted); padding-top:12px; border-top:1px solid var(--border); }

    .contract-actions { position:absolute; top:16px; right:16px; display:flex; gap:6px; opacity:0; transition:opacity .2s; }
    .contract-card:hover .contract-actions { opacity:1; }

    .form-row { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .amount-input-wrapper { position:relative; }
    .currency { position:absolute; left:14px; top:50%; transform:translateY(-50%); font-size:16px; font-weight:600; color:var(--text-secondary); pointer-events:none; }
    .amount-input { padding-left:36px !important; font-family:var(--font-display); font-size:18px; font-weight:600; }
  `
  document.head.appendChild(style)
}