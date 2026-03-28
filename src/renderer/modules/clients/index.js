// src/renderer/modules/clients/index.js
import { db } from '../../services/firebase.js'
import { getCurrentUser, getUserProfile } from '../../services/auth.js'
import { checkPlanLimit } from '../../services/plan-guard.js'
import {
  collection, addDoc, getDocs, deleteDoc,
  doc, updateDoc, query, orderBy, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

export async function render(container) {
  container.innerHTML = `
    <div class="clients-page">

      <!-- Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">👥 Клієнти</h1>
          <p class="page-subtitle" id="clients-count">Завантаження...</p>
        </div>
        <button class="btn btn-primary" id="add-client-btn">
          + Додати клієнта
        </button>
      </div>

      <!-- Search -->
      <div class="search-bar">
        <span class="search-icon">🔍</span>
        <input
          type="text"
          class="search-input"
          id="search-input"
          placeholder="Пошук за іменем, email або телефоном..."
        />
      </div>

      <!-- List -->
      <div id="clients-list" class="clients-list">
        <div class="clients-loading">
          <div class="spinner"></div>
        </div>
      </div>

    </div>

    <!-- Modal -->
    <div class="modal-overlay" id="modal" style="display:none">
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title" id="modal-title">Новий клієнт</h2>
          <button class="modal-close" id="modal-close">✕</button>
        </div>
        <form class="modal-form" id="client-form" novalidate>
          <div class="modal-body">

            <div class="form-row">
              <div class="field">
                <label>Ім'я *</label>
                <input id="f-name" type="text" class="input" placeholder="Іван Іванов" />
                <span class="field-error" id="e-name"></span>
              </div>
              <div class="field">
                <label>Телефон</label>
                <input id="f-phone" type="tel" class="input" placeholder="+380 XX XXX XX XX" />
              </div>
            </div>

            <div class="form-row">
              <div class="field">
                <label>Email</label>
                <input id="f-email" type="email" class="input" placeholder="client@email.com" />
              </div>
              <div class="field">
                <label>Компанія</label>
                <input id="f-company" type="text" class="input" placeholder="Назва компанії" />
              </div>
            </div>

            <div class="field">
              <label>Нотатка</label>
              <textarea id="f-note" class="input" rows="3" placeholder="Додаткова інформація про клієнта..." style="resize:vertical"></textarea>
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

  // ── Styles ──────────────────────────────────────────────
  injectStyles()

  // ── State ────────────────────────────────────────────────
  let clients    = []
  let editingId  = null
  const user     = getCurrentUser()
  const profile  = await getUserProfile(user.uid)   // з кешу — миттєво

  // ── Load clients ─────────────────────────────────────────
  async function loadClients() {
    try {
      const q    = query(collection(db, 'users', user.uid, 'clients'), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      clients    = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      renderList(clients)
      updateCount(clients.length)
    } catch (err) {
      console.error(err)
      container.querySelector('#clients-list').innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <div class="empty-title">Помилка завантаження</div>
        </div>
      `
    }
  }

  // ── Render list ───────────────────────────────────────────
  function renderList(list) {
    const el = container.querySelector('#clients-list')
    if (list.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">👥</div>
          <div class="empty-title">Клієнтів ще немає</div>
          <div class="empty-desc">Натисніть "Додати клієнта" щоб почати</div>
        </div>
      `
      return
    }

    el.innerHTML = `
      <div class="clients-grid">
        ${list.map(c => `
          <div class="client-card" data-id="${c.id}">
            <div class="client-avatar" style="background:${getColor(c.name)}22;color:${getColor(c.name)}">
              ${getInitials(c.name)}
            </div>
            <div class="client-info">
              <div class="client-name">${c.name}</div>
              ${c.company ? `<div class="client-company">🏢 ${c.company}</div>` : ''}
              <div class="client-contacts">
                ${c.phone ? `<span>📞 ${c.phone}</span>` : ''}
                ${c.email ? `<span>✉ ${c.email}</span>` : ''}
              </div>
              ${c.note ? `<div class="client-note">${c.note}</div>` : ''}
            </div>
            <div class="client-actions">
              <button class="client-btn edit-btn" data-id="${c.id}" title="Редагувати">✏️</button>
              <button class="client-btn delete-btn" data-id="${c.id}" title="Видалити">🗑</button>
            </div>
          </div>
        `).join('')}
      </div>
    `

    // Edit buttons
    el.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const client = clients.find(c => c.id === btn.dataset.id)
        openModal(client)
      })
    })

    // Delete buttons
    el.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        if (!confirm('Видалити клієнта?')) return
        await deleteDoc(doc(db, 'users', user.uid, 'clients', btn.dataset.id))
        await loadClients()
      })
    })
  }

  // ── Search ────────────────────────────────────────────────
  container.querySelector('#search-input').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim()
    if (!q) { renderList(clients); return }
    const filtered = clients.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.company?.toLowerCase().includes(q)
    )
    renderList(filtered)
  })

  // ── Modal ─────────────────────────────────────────────────
  function openModal(client = null) {
    editingId = client?.id || null
    container.querySelector('#modal-title').textContent = client ? 'Редагувати клієнта' : 'Новий клієнт'
    container.querySelector('#f-name').value    = client?.name    || ''
    container.querySelector('#f-phone').value   = client?.phone   || ''
    container.querySelector('#f-email').value   = client?.email   || ''
    container.querySelector('#f-company').value = client?.company || ''
    container.querySelector('#f-note').value    = client?.note    || ''
    container.querySelector('#e-name').textContent = ''
    container.querySelector('#modal').style.display = 'flex'
    setTimeout(() => container.querySelector('#f-name').focus(), 100)
  }

  function closeModal() {
    container.querySelector('#modal').style.display = 'none'
    editingId = null
  }

  container.querySelector('#add-client-btn').addEventListener('click', () => {
    if (!checkPlanLimit(profile, 'clients', clients.length)) return
    openModal()
  })
  container.querySelector('#modal-close').addEventListener('click', closeModal)
  container.querySelector('#modal-cancel').addEventListener('click', closeModal)
  container.querySelector('#modal').addEventListener('click', (e) => {
    if (e.target === container.querySelector('#modal')) closeModal()
  })

  // ── Save ──────────────────────────────────────────────────
  container.querySelector('#client-form').addEventListener('submit', async (e) => {
    e.preventDefault()

    const name = container.querySelector('#f-name').value.trim()
    if (!name) {
      container.querySelector('#e-name').textContent = "Введіть ім'я клієнта"
      return
    }

    const btn = container.querySelector('#modal-submit')
    btn.disabled = true
    btn.innerHTML = '<div class="spinner"></div>'

    const data = {
      name,
      phone:   container.querySelector('#f-phone').value.trim()   || null,
      email:   container.querySelector('#f-email').value.trim()   || null,
      company: container.querySelector('#f-company').value.trim() || null,
      note:    container.querySelector('#f-note').value.trim()    || null,
    }

    try {
      if (editingId) {
        await updateDoc(doc(db, 'users', user.uid, 'clients', editingId), {
          ...data, updatedAt: serverTimestamp()
        })
      } else {
        await addDoc(collection(db, 'users', user.uid, 'clients'), {
          ...data, createdAt: serverTimestamp()
        })
      }
      closeModal()
      await loadClients()
    } catch (err) {
      console.error(err)
    } finally {
      btn.disabled = false
      btn.innerHTML = 'Зберегти'
    }
  })

  // ── Init ──────────────────────────────────────────────────
  await loadClients()

  // ── Helpers ───────────────────────────────────────────────
  function updateCount(n) {
    container.querySelector('#clients-count').textContent =
      n === 0 ? 'Немає клієнтів' : `${n} ${plural(n, 'клієнт', 'клієнти', 'клієнтів')}`
  }

  function plural(n, one, few, many) {
    if (n % 10 === 1 && n % 100 !== 11) return one
    if ([2,3,4].includes(n % 10) && ![12,13,14].includes(n % 100)) return few
    return many
  }

  function getInitials(name = '') {
    return name.split(' ').slice(0,2).map(w => w[0]?.toUpperCase() || '').join('')
  }

  function getColor(name = '') {
    const colors = ['#4F8EF7','#34D399','#A78BFA','#F472B6','#FBBF24','#F87171','#38BDF8']
    let hash = 0
    for (let c of name) hash = c.charCodeAt(0) + ((hash << 5) - hash)
    return colors[Math.abs(hash) % colors.length]
  }
}

// ── Inject styles ─────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('clients-styles')) return
  const style = document.createElement('style')
  style.id = 'clients-styles'
  style.textContent = `
    .clients-page { padding: 32px 36px; max-width: 1100px; }

    .page-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:24px; }
    .page-title { font-family:var(--font-display); font-size:26px; font-weight:700; letter-spacing:-0.02em; margin-bottom:4px; }
    .page-subtitle { font-size:13px; color:var(--text-secondary); }

    .search-bar { display:flex; align-items:center; gap:10px; background:var(--bg-secondary); border:1.5px solid var(--border); border-radius:var(--radius-sm); padding:10px 14px; margin-bottom:20px; transition:border-color .2s; }
    .search-bar:focus-within { border-color:var(--accent-blue); }
    .search-icon { font-size:15px; flex-shrink:0; }
    .search-input { flex:1; background:none; font-size:14px; color:var(--text-primary); }
    .search-input::placeholder { color:var(--text-muted); }

    .clients-loading { display:flex; justify-content:center; padding:60px; }

    .clients-grid { display:flex; flex-direction:column; gap:10px; }

    .client-card { display:flex; align-items:center; gap:14px; background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-md); padding:16px 18px; transition:all .2s; cursor:default; }
    .client-card:hover { border-color:rgba(255,255,255,0.12); transform:translateY(-1px); box-shadow:var(--shadow-sm); }

    .client-avatar { width:44px; height:44px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:16px; flex-shrink:0; }

    .client-info { flex:1; min-width:0; }
    .client-name { font-weight:600; font-size:15px; margin-bottom:2px; }
    .client-company { font-size:12px; color:var(--text-secondary); margin-bottom:4px; }
    .client-contacts { display:flex; gap:14px; flex-wrap:wrap; }
    .client-contacts span { font-size:12px; color:var(--text-secondary); }
    .client-note { font-size:12px; color:var(--text-muted); margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:400px; }

    .client-actions { display:flex; gap:6px; opacity:0; transition:opacity .2s; }
    .client-card:hover .client-actions { opacity:1; }
    .client-btn { width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:15px; transition:background .2s; }
    .edit-btn:hover { background:var(--accent-blue-dim); }
    .delete-btn:hover { background:var(--accent-red-dim); }

    .empty-state { text-align:center; padding:80px 24px; }
    .empty-icon { font-size:48px; margin-bottom:16px; }
    .empty-title { font-family:var(--font-display); font-size:18px; font-weight:600; margin-bottom:8px; }
    .empty-desc { font-size:14px; color:var(--text-muted); }

    /* Modal */
    .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.6); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; z-index:1000; padding:24px; }
    .modal { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-xl); width:100%; max-width:560px; box-shadow:var(--shadow-xl); animation:scaleIn .2s cubic-bezier(0.34,1.2,0.64,1); }
    .modal-header { display:flex; align-items:center; justify-content:space-between; padding:24px 24px 0; }
    .modal-title { font-family:var(--font-display); font-size:20px; font-weight:700; }
    .modal-close { width:32px; height:32px; border-radius:8px; color:var(--text-muted); font-size:16px; display:flex; align-items:center; justify-content:center; transition:all .2s; }
    .modal-close:hover { background:var(--accent-red-dim); color:var(--accent-red); }
    .modal-body { padding:20px 24px; display:flex; flex-direction:column; gap:14px; }
    .modal-footer { display:flex; gap:10px; justify-content:flex-end; padding:0 24px 24px; }
    .form-row { display:grid; grid-template-columns:1fr 1fr; gap:14px; }

    @keyframes scaleIn { from{opacity:0;transform:scale(0.95)} to{opacity:1;transform:scale(1)} }
  `
  document.head.appendChild(style)
}