// src/renderer/modules/passwords/index.js
import { db } from '../../services/firebase.js'
import { getCurrentUser, getUserProfile, getActivePathSegments } from '../../services/auth.js'
import { checkPlanLimit } from '../../services/plan-guard.js'
import {
  collection, addDoc, getDocs, deleteDoc,
  doc, updateDoc, query, orderBy, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

// ── AES-GCM encryption ────────────────────────────────────
async function getKey(userId) {
  const raw  = new TextEncoder().encode(userId + 'workhub-pwdv1')
  const hash = await crypto.subtle.digest('SHA-256', raw)
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}
async function encryptPassword(text, userId) {
  const key = await getKey(userId)
  const iv  = crypto.getRandomValues(new Uint8Array(12))
  const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text))
  const combined = new Uint8Array(12 + enc.byteLength)
  combined.set(iv, 0); combined.set(new Uint8Array(enc), 12)
  return btoa(String.fromCharCode(...combined))
}
async function decryptPassword(b64, userId) {
  try {
    const key     = await getKey(userId)
    const combined = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: combined.slice(0,12) }, key, combined.slice(12))
    return new TextDecoder().decode(dec)
  } catch { return '••••••••' }
}

const CAT_META = {
  general: { icon: '🌐', label: 'Загальне',   color: '#6B7280' },
  work:    { icon: '💼', label: 'Робота',      color: '#4F8EF7' },
  finance: { icon: '🏦', label: 'Фінанси',    color: '#34D399' },
  social:  { icon: '📱', label: 'Соцмережі',  color: '#A78BFA' },
  email:   { icon: '✉️', label: 'Пошта',      color: '#F59E0B' },
  other:   { icon: '🔒', label: 'Інше',        color: '#F472B6' },
}

export async function render(container) {
  injectStyles()

  container.innerHTML = `
    <div class="pw-layout">

      <!-- ══ LEFT ══ -->
      <div class="pw-left" id="pw-left">

        <div class="pw-header">
          <div>
            <h1 class="pw-title">🔑 Паролі</h1>
            <p class="pw-sub" id="pw-count">Завантаження...</p>
          </div>
          <button class="btn btn-primary" id="add-pwd-btn">+ Додати</button>
        </div>

        <!-- Search -->
        <div class="pw-search">
          <span class="pw-search-icon">🔍</span>
          <input type="text" class="pw-search-input" id="pw-search" placeholder="Пошук за сервісом або логіном..." />
        </div>

        <!-- Category filters -->
        <div class="pw-filters" id="pw-filters">
          <button class="pw-filter active" data-cat="all">Всі</button>
          ${Object.entries(CAT_META).map(([k, v]) =>
            `<button class="pw-filter" data-cat="${k}" style="--cc:${v.color}">${v.icon} ${v.label}</button>`
          ).join('')}
        </div>

        <!-- List -->
        <div id="pw-list">
          <div class="pw-loading"><div class="spinner"></div></div>
        </div>

      </div>

      <!-- ══ RIGHT DETAIL ══ -->
      <div class="pw-right" id="pw-right" style="display:none">
        <div class="pw-detail" id="pw-detail"></div>
      </div>

    </div>

    <!-- ══ MODAL ══ -->
    <div class="modal-overlay" id="pw-modal" style="display:none">
      <div class="modal" style="max-width:540px">
        <div class="modal-header">
          <h2 class="modal-title" id="pw-modal-title">Новий пароль</h2>
          <button class="modal-close" id="pw-modal-close">✕</button>
        </div>
        <form class="modal-form" id="pw-form" novalidate>
          <div class="modal-body">
            <div class="form-row">
              <div class="field">
                <label>Сервіс *</label>
                <input id="f-service" type="text" class="input" placeholder="Google, GitHub, Банк..." />
                <span class="field-error" id="e-service"></span>
              </div>
              <div class="field">
                <label>Категорія</label>
                <select id="f-category" class="input">
                  ${Object.entries(CAT_META).map(([k,v]) => `<option value="${k}">${v.icon} ${v.label}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="field">
                <label>Логін / Email *</label>
                <input id="f-login" type="text" class="input" placeholder="user@email.com" />
                <span class="field-error" id="e-login"></span>
              </div>
              <div class="field">
                <label>URL сайту</label>
                <input id="f-url" type="text" class="input" placeholder="https://example.com" />
              </div>
            </div>
            <div class="field">
              <label>Пароль *</label>
              <div class="pw-input-wrap">
                <input id="f-password" type="password" class="input" placeholder="Введіть пароль" />
                <button type="button" class="pw-icon-action" id="toggle-pwd" title="Показати">👁</button>
                <button type="button" class="pw-icon-action" id="gen-pwd" title="Згенерувати">🎲</button>
              </div>
              <span class="field-error" id="e-password"></span>
            </div>
            <div class="field">
              <label>Нотатка</label>
              <textarea id="f-note" class="input" rows="2" placeholder="Додаткова інформація..."></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="pw-modal-cancel">Скасувати</button>
            <button type="submit" class="btn btn-primary" id="pw-modal-submit">Зберегти</button>
          </div>
        </form>
      </div>
    </div>
  `

  let passwords  = []
  let editingId  = null
  let selectedId = null
  let catFilter  = 'all'
  let searchQ    = ''
  const user     = getCurrentUser()
  const base     = getActivePathSegments(user.uid)
  const profile  = await getUserProfile(user.uid)

  // ── Load ──────────────────────────────────────────────────
  async function loadPasswords() {
    try {
      const q    = query(collection(db, ...base, 'passwords'), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      passwords  = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch {
      try {
        const snap = await getDocs(collection(db, ...base, 'passwords'))
        passwords  = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      } catch { passwords = [] }
    }
    updateCount()
    renderList()
    if (selectedId) {
      const p = passwords.find(x => x.id === selectedId)
      if (p) openDetail(p); else closeDetail()
    }
  }

  function updateCount() {
    const total = passwords.length
    container.querySelector('#pw-count').textContent =
      total === 0 ? 'Немає збережених паролів' : `${total} паролів збережено`
  }

  // ── Render list ───────────────────────────────────────────
  function getFiltered() {
    return passwords.filter(p => {
      if (catFilter !== 'all' && p.category !== catFilter) return false
      if (searchQ && !p.service?.toLowerCase().includes(searchQ) && !p.login?.toLowerCase().includes(searchQ)) return false
      return true
    })
  }

  function renderList() {
    const list = getFiltered()
    const el   = container.querySelector('#pw-list')

    if (list.length === 0) {
      el.innerHTML = `
        <div class="pw-empty">
          <div class="pw-empty-icon">🔑</div>
          <div class="pw-empty-title">${passwords.length === 0 ? 'Паролів ще немає' : 'Нічого не знайдено'}</div>
          <div class="pw-empty-desc">Натисніть "+ Додати" щоб зберегти перший пароль</div>
        </div>`
      return
    }

    el.innerHTML = list.map(p => {
      const cat = CAT_META[p.category] || CAT_META.general
      return `
        <div class="pw-card ${selectedId === p.id ? 'pw-selected' : ''}" data-id="${p.id}" style="--cc:${cat.color}">
          <div class="pw-card-stripe"></div>
          <div class="pw-card-icon">${cat.icon}</div>
          <div class="pw-card-info">
            <div class="pw-card-service">${p.service || '—'}</div>
            <div class="pw-card-login">${p.login || ''}</div>
          </div>
          <div class="pw-card-badge" style="background:color-mix(in srgb,${cat.color} 12%,transparent);color:${cat.color}">${cat.label}</div>
        </div>
      `
    }).join('')

    el.querySelectorAll('.pw-card').forEach(card => {
      card.addEventListener('click', () => {
        const pwd = passwords.find(p => p.id === card.dataset.id)
        if (!pwd) return
        if (selectedId === pwd.id) { closeDetail(); return }
        openDetail(pwd)
      })
    })
  }

  // ── Detail panel ──────────────────────────────────────────
  async function openDetail(pwd) {
    selectedId = pwd.id
    container.querySelector('#pw-left').classList.add('pw-has-detail')
    const right = container.querySelector('#pw-right')
    right.style.display = 'flex'

    const cat = CAT_META[pwd.category] || CAT_META.general

    container.querySelector('#pw-detail').innerHTML = `
      <div class="pw-d-stripe" style="background:${cat.color}"></div>

      <div class="pw-d-head">
        <button class="pw-d-close" id="pw-d-close">✕</button>
        <div class="pw-d-icon" style="background:color-mix(in srgb,${cat.color} 12%,transparent)">${cat.icon}</div>
        <div class="pw-d-service">${pwd.service || '—'}</div>
        <div class="pw-d-cat-badge" style="background:color-mix(in srgb,${cat.color} 15%,transparent);color:${cat.color}">${cat.label}</div>
      </div>

      <div class="pw-d-section">
        <div class="pw-d-label">Логін / Email</div>
        <div class="pw-d-copy-row">
          <span class="pw-d-value">${pwd.login || '—'}</span>
          <button class="pw-copy-btn" data-copy="login" title="Копіювати логін">📋</button>
        </div>
      </div>

      <div class="pw-d-section">
        <div class="pw-d-label">Пароль</div>
        <div class="pw-d-copy-row">
          <span class="pw-d-value pw-d-masked" id="pw-d-pass-val">••••••••</span>
          <button class="pw-copy-btn" id="pw-d-reveal" title="Показати/сховати">👁</button>
          <button class="pw-copy-btn" data-copy="password" title="Копіювати пароль">📋</button>
        </div>
      </div>

      ${pwd.url ? `
      <div class="pw-d-section">
        <div class="pw-d-label">URL</div>
        <div class="pw-d-copy-row">
          <a class="pw-d-link" href="${pwd.url}" target="_blank">${pwd.url}</a>
          <button class="pw-copy-btn" data-copy="url" title="Копіювати URL">📋</button>
        </div>
      </div>` : ''}

      ${pwd.note ? `
      <div class="pw-d-section">
        <div class="pw-d-label">Нотатка</div>
        <div class="pw-d-note">${pwd.note}</div>
      </div>` : ''}

      <div class="pw-d-footer">
        <button class="btn btn-secondary" id="pw-d-edit">✏️ Редагувати</button>
        <button class="btn btn-danger"    id="pw-d-del">🗑 Видалити</button>
      </div>
    `

    // Refresh card highlight
    container.querySelectorAll('.pw-card').forEach(c =>
      c.classList.toggle('pw-selected', c.dataset.id === pwd.id)
    )

    // Reveal toggle
    let revealed = false
    let plainPwd = null
    container.querySelector('#pw-d-reveal').addEventListener('click', async () => {
      const span = container.querySelector('#pw-d-pass-val')
      if (!revealed) {
        span.textContent = '...'
        plainPwd = await decryptPassword(pwd.passwordEncrypted, user.uid)
        span.textContent = plainPwd
        span.classList.add('pw-d-revealed')
        container.querySelector('#pw-d-reveal').textContent = '🙈'
        revealed = true
      } else {
        span.textContent = '••••••••'
        span.classList.remove('pw-d-revealed')
        container.querySelector('#pw-d-reveal').textContent = '👁'
        revealed = false
      }
    })

    // Copy buttons
    container.querySelectorAll('.pw-copy-btn[data-copy]').forEach(btn => {
      btn.addEventListener('click', async () => {
        let text = ''
        if (btn.dataset.copy === 'login')    text = pwd.login || ''
        if (btn.dataset.copy === 'url')      text = pwd.url   || ''
        if (btn.dataset.copy === 'password') {
          if (!plainPwd) plainPwd = await decryptPassword(pwd.passwordEncrypted, user.uid)
          text = plainPwd
        }
        await navigator.clipboard.writeText(text)
        const orig = btn.textContent
        btn.textContent = '✓'
        setTimeout(() => { btn.textContent = orig }, 1500)
      })
    })

    // Edit
    container.querySelector('#pw-d-edit').addEventListener('click', () => openModal(pwd))
    // Delete
    container.querySelector('#pw-d-del').addEventListener('click', async () => {
      if (!confirm('Видалити цей запис?')) return
      await deleteDoc(doc(db, ...base, 'passwords', pwd.id))
      closeDetail()
      await loadPasswords()
    })
    // Close
    container.querySelector('#pw-d-close').addEventListener('click', closeDetail)
  }

  function closeDetail() {
    selectedId = null
    container.querySelector('#pw-right').style.display = 'none'
    container.querySelector('#pw-left').classList.remove('pw-has-detail')
    container.querySelectorAll('.pw-card').forEach(c => c.classList.remove('pw-selected'))
  }

  // ── Filters & Search ──────────────────────────────────────
  container.querySelectorAll('.pw-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.pw-filter').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      catFilter = btn.dataset.cat
      renderList()
    })
  })

  container.querySelector('#pw-search').addEventListener('input', e => {
    searchQ = e.target.value.toLowerCase().trim()
    renderList()
  })

  // ── Modal ─────────────────────────────────────────────────
  async function openModal(pwd = null) {
    editingId = pwd?.id || null
    container.querySelector('#pw-modal-title').textContent = pwd ? 'Редагувати пароль' : 'Новий пароль'
    container.querySelector('#f-service').value  = pwd?.service  || ''
    container.querySelector('#f-login').value    = pwd?.login    || ''
    container.querySelector('#f-url').value      = pwd?.url      || ''
    container.querySelector('#f-note').value     = pwd?.note     || ''
    container.querySelector('#f-category').value = pwd?.category || 'general'
    const pwdInput = container.querySelector('#f-password')
    pwdInput.value = pwd?.passwordEncrypted ? await decryptPassword(pwd.passwordEncrypted, user.uid) : ''
    pwdInput.type  = 'password'
    container.querySelectorAll('.field-error').forEach(e => e.textContent = '')
    container.querySelector('#pw-modal').style.display = 'flex'
    setTimeout(() => container.querySelector('#f-service').focus(), 100)
  }

  function closeModal() {
    container.querySelector('#pw-modal').style.display = 'none'
    editingId = null
  }

  container.querySelector('#add-pwd-btn').addEventListener('click', () => {
    if (!checkPlanLimit(profile, 'passwords', passwords.length)) return
    openModal()
  })
  container.querySelector('#pw-modal-close').addEventListener('click', closeModal)
  container.querySelector('#pw-modal-cancel').addEventListener('click', closeModal)
  container.querySelector('#pw-modal').addEventListener('click', e => {
    if (e.target === container.querySelector('#pw-modal')) closeModal()
  })
  container.querySelector('#toggle-pwd').addEventListener('click', () => {
    const inp = container.querySelector('#f-password')
    inp.type = inp.type === 'password' ? 'text' : 'password'
  })
  container.querySelector('#gen-pwd').addEventListener('click', () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
    const arr   = crypto.getRandomValues(new Uint8Array(16))
    container.querySelector('#f-password').value = Array.from(arr).map(b => chars[b % chars.length]).join('')
    container.querySelector('#f-password').type  = 'text'
  })

  // ── Save ──────────────────────────────────────────────────
  container.querySelector('#pw-form').addEventListener('submit', async e => {
    e.preventDefault()
    const service  = container.querySelector('#f-service').value.trim()
    const login    = container.querySelector('#f-login').value.trim()
    const password = container.querySelector('#f-password').value

    let ok = true
    if (!service)  { container.querySelector('#e-service').textContent  = 'Введіть назву сервісу'; ok = false }
    if (!login)    { container.querySelector('#e-login').textContent    = 'Введіть логін';          ok = false }
    if (!password) { container.querySelector('#e-password').textContent = 'Введіть пароль';         ok = false }
    if (!ok) return

    const btn = container.querySelector('#pw-modal-submit')
    btn.disabled = true; btn.innerHTML = '<div class="spinner"></div>'

    try {
      const passwordEncrypted = await encryptPassword(password, user.uid)
      const data = {
        service, login, passwordEncrypted,
        url:      container.querySelector('#f-url').value.trim()  || null,
        note:     container.querySelector('#f-note').value.trim() || null,
        category: container.querySelector('#f-category').value,
      }
      if (editingId) {
        await updateDoc(doc(db, ...base, 'passwords', editingId), { ...data, updatedAt: serverTimestamp() })
      } else {
        await addDoc(collection(db, ...base, 'passwords'), { ...data, createdAt: serverTimestamp() })
      }
      closeModal()
      await loadPasswords()
    } catch (err) { console.error(err) }
    finally { btn.disabled = false; btn.innerHTML = 'Зберегти' }
  })

  await loadPasswords()
}

// ── Styles ────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('pw-styles')) return
  const style = document.createElement('style')
  style.id = 'pw-styles'
  style.textContent = `
  .pw-layout { display:flex; height:100%; overflow:hidden; }

  .pw-left {
    flex:1; display:flex; flex-direction:column; overflow:hidden;
    padding:28px 28px 0; transition:all .2s;
  }
  .pw-right {
    width:360px; flex-shrink:0; border-left:1px solid var(--border);
    display:flex; flex-direction:column; overflow-y:auto;
    background:var(--bg-secondary);
  }

  .pw-header {
    display:flex; align-items:flex-start; justify-content:space-between;
    margin-bottom:18px; gap:12px; flex-shrink:0;
  }
  .pw-title { font-family:var(--font-display); font-size:22px; font-weight:800; letter-spacing:-0.02em; }
  .pw-sub   { font-size:13px; color:var(--text-secondary); margin-top:2px; }

  .pw-search {
    display:flex; align-items:center; gap:10px;
    background:var(--bg-tertiary); border:1.5px solid var(--border);
    border-radius:var(--radius-md); padding:9px 14px; margin-bottom:12px;
    transition:border-color .2s; flex-shrink:0;
  }
  .pw-search:focus-within { border-color:var(--accent-blue); }
  .pw-search-icon  { font-size:14px; flex-shrink:0; }
  .pw-search-input { flex:1; background:none; font-size:13px; color:var(--text-primary); }
  .pw-search-input::placeholder { color:var(--text-muted); }

  .pw-filters { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:16px; flex-shrink:0; }
  .pw-filter {
    padding:5px 12px; border-radius:var(--radius-full); font-size:12px; font-weight:600;
    border:1px solid var(--border); background:var(--bg-secondary); color:var(--text-secondary);
    cursor:pointer; transition:all .15s;
  }
  .pw-filter:hover  { border-color:var(--cc, var(--accent-blue)); color:var(--text-primary); }
  .pw-filter.active { background:var(--accent-blue); color:#fff; border-color:var(--accent-blue); }

  #pw-list { flex:1; overflow-y:auto; padding-bottom:24px; display:flex; flex-direction:column; gap:8px; }

  .pw-card {
    display:flex; align-items:center; gap:12px;
    background:var(--bg-secondary); border:1px solid var(--border);
    border-radius:var(--radius-lg); overflow:hidden; cursor:pointer;
    transition:all .15s; flex-shrink:0;
  }
  .pw-card:hover    { border-color:rgba(255,255,255,.14); transform:translateX(2px); box-shadow:0 4px 16px rgba(0,0,0,.2); }
  .pw-card.pw-selected { border-color:var(--accent-blue); box-shadow:0 0 0 2px rgba(79,142,247,.2); }

  .pw-card-stripe { width:4px; height:100%; min-height:58px; background:var(--cc); flex-shrink:0; }
  .pw-card-icon   { font-size:22px; flex-shrink:0; }
  .pw-card-info   { flex:1; min-width:0; padding:12px 0; }
  .pw-card-service { font-weight:700; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .pw-card-login   { font-size:12px; color:var(--text-muted); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .pw-card-badge {
    font-size:10px; font-weight:700; padding:3px 10px; border-radius:var(--radius-xs);
    text-transform:uppercase; letter-spacing:.04em; white-space:nowrap; margin-right:14px;
  }

  .pw-loading, .pw-empty {
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    padding:60px 20px; gap:10px; color:var(--text-muted);
  }
  .pw-empty-icon  { font-size:40px; }
  .pw-empty-title { font-size:15px; font-weight:600; color:var(--text-secondary); }
  .pw-empty-desc  { font-size:13px; text-align:center; }

  /* ── Detail ── */
  .pw-detail { display:flex; flex-direction:column; flex:1; }
  .pw-d-stripe { height:5px; flex-shrink:0; }

  .pw-d-head {
    padding:20px 22px 18px; border-bottom:1px solid var(--border);
    display:flex; flex-direction:column; align-items:center; gap:6px;
    position:relative; text-align:center;
  }
  .pw-d-close {
    position:absolute; top:14px; right:14px; width:28px; height:28px; border-radius:50%;
    border:1px solid var(--border); background:var(--bg-tertiary); color:var(--text-muted);
    font-size:12px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all .15s;
  }
  .pw-d-close:hover { background:var(--bg-elevated); color:var(--text-primary); }

  .pw-d-icon {
    width:60px; height:60px; border-radius:16px; font-size:28px;
    display:flex; align-items:center; justify-content:center; margin-bottom:4px;
  }
  .pw-d-service {
    font-family:var(--font-display); font-size:20px; font-weight:800; letter-spacing:-0.01em;
  }
  .pw-d-cat-badge {
    font-size:11px; font-weight:700; padding:3px 12px; border-radius:var(--radius-xs);
    text-transform:uppercase; letter-spacing:.05em;
  }

  .pw-d-section { padding:16px 22px; border-bottom:1px solid var(--border); }
  .pw-d-label   { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:var(--text-muted); margin-bottom:8px; }
  .pw-d-copy-row { display:flex; align-items:center; gap:8px; }
  .pw-d-value   { flex:1; font-size:14px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .pw-d-masked  { font-family:var(--font-mono); color:var(--text-muted); letter-spacing:2px; }
  .pw-d-revealed { font-family:var(--font-mono); color:var(--text-primary); letter-spacing:0; }
  .pw-d-link    { flex:1; font-size:13px; color:var(--accent-blue); text-decoration:none; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .pw-d-link:hover { text-decoration:underline; }
  .pw-d-note    { font-size:13px; color:var(--text-secondary); line-height:1.6; font-style:italic; }

  .pw-copy-btn {
    width:30px; height:30px; border-radius:var(--radius-sm); border:1px solid var(--border);
    background:var(--bg-tertiary); color:var(--text-muted); font-size:14px;
    cursor:pointer; display:flex; align-items:center; justify-content:center;
    transition:all .15s; flex-shrink:0;
  }
  .pw-copy-btn:hover { border-color:var(--accent-blue); color:var(--accent-blue); }

  .pw-d-footer {
    display:flex; gap:8px; padding:16px 22px; margin-top:auto;
    border-top:1px solid var(--border);
  }
  .pw-d-footer .btn { flex:1; justify-content:center; }
  .btn-danger { background:rgba(239,68,68,.12); color:#EF4444; border:1px solid rgba(239,68,68,.25); }
  .btn-danger:hover { background:rgba(239,68,68,.2); }

  /* ── Modal helpers ── */
  .form-row { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  .pw-input-wrap { display:flex; gap:6px; align-items:center; }
  .pw-input-wrap .input { flex:1; }
  .pw-icon-action {
    width:38px; height:38px; border-radius:var(--radius-sm); background:var(--bg-tertiary);
    border:1px solid var(--border); display:flex; align-items:center; justify-content:center;
    font-size:16px; cursor:pointer; transition:background .15s; flex-shrink:0;
  }
  .pw-icon-action:hover { background:var(--accent-blue-dim); }
  `
  document.head.appendChild(style)
}
