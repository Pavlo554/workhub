// src/renderer/modules/passwords/index.js
import { db } from '../../services/firebase.js'
import { getCurrentUser, getUserProfile } from '../../services/auth.js'
import { checkPlanLimit } from '../../services/plan-guard.js'
import {
  collection, addDoc, getDocs, deleteDoc,
  doc, updateDoc, query, orderBy, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

// ── AES-GCM шифрування через Web Crypto API ───────────────
async function getKey(userId) {
  const raw  = new TextEncoder().encode(userId + 'workhub-pwdv1')
  const hash = await crypto.subtle.digest('SHA-256', raw)
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

async function encryptPassword(text, userId) {
  const key       = await getKey(userId)
  const iv        = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(text)
  )
  const combined = new Uint8Array(12 + encrypted.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(encrypted), 12)
  return btoa(String.fromCharCode(...combined))
}

async function decryptPassword(b64, userId) {
  try {
    const key      = await getKey(userId)
    const combined = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    const iv       = combined.slice(0, 12)
    const data     = combined.slice(12)
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
    return new TextDecoder().decode(decrypted)
  } catch {
    return '••••••••'
  }
}

// ── Render ────────────────────────────────────────────────
export async function render(container) {
  injectStyles()

  container.innerHTML = `
    <div class="passwords-page">

      <!-- Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">🔑 Паролі</h1>
          <p class="page-subtitle" id="pwd-count">Завантаження...</p>
        </div>
        <button class="btn btn-primary" id="add-pwd-btn">+ Додати пароль</button>
      </div>

      <!-- Search -->
      <div class="search-bar">
        <span class="search-icon">🔍</span>
        <input type="text" class="search-input" id="search-input" placeholder="Пошук за сервісом або логіном..." />
      </div>

      <!-- List -->
      <div id="pwd-list" class="pwd-list">
        <div class="tasks-loading"><div class="spinner"></div></div>
      </div>

    </div>

    <!-- Modal -->
    <div class="modal-overlay" id="modal" style="display:none">
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title" id="modal-title">Новий пароль</h2>
          <button class="modal-close" id="modal-close">✕</button>
        </div>
        <form class="modal-form" id="pwd-form" novalidate>
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
                  <option value="general">Загальне</option>
                  <option value="work">Робота</option>
                  <option value="finance">Фінанси</option>
                  <option value="social">Соціальні мережі</option>
                  <option value="email">Пошта</option>
                  <option value="other">Інше</option>
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
              <div class="pwd-input-wrap">
                <input id="f-password" type="password" class="input" placeholder="Введіть пароль" />
                <button type="button" class="pwd-toggle" id="toggle-pwd" title="Показати/сховати">👁</button>
                <button type="button" class="pwd-generate" id="gen-pwd" title="Згенерувати">🎲</button>
              </div>
              <span class="field-error" id="e-password"></span>
            </div>

            <div class="field">
              <label>Нотатка</label>
              <textarea id="f-note" class="input" rows="2" placeholder="Додаткова інформація..." style="resize:vertical"></textarea>
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

  let passwords  = []
  let editingId  = null
  const user     = getCurrentUser()
  const profile  = await getUserProfile(user.uid)

  // ── Load ──────────────────────────────────────────────────
  async function loadPasswords() {
    try {
      const q    = query(collection(db, 'users', user.uid, 'passwords'), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      passwords  = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      renderList(passwords)
      container.querySelector('#pwd-count').textContent =
        passwords.length === 0 ? 'Немає збережених паролів' : `${passwords.length} паролів збережено`
    } catch (err) {
      console.error(err)
      container.querySelector('#pwd-list').innerHTML = `
        <div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-title">Помилка завантаження</div></div>
      `
    }
  }

  // ── Render list ───────────────────────────────────────────
  function renderList(list) {
    const el = container.querySelector('#pwd-list')
    if (list.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔑</div>
          <div class="empty-title">Паролів ще немає</div>
          <div class="empty-desc">Натисніть "+ Додати пароль" щоб зберегти перший</div>
        </div>
      `
      return
    }

    el.innerHTML = `
      <div class="pwd-grid">
        ${list.map(p => `
          <div class="pwd-card" data-id="${p.id}">
            <div class="pwd-icon">${getCategoryIcon(p.category)}</div>
            <div class="pwd-info">
              <div class="pwd-service">${p.service}</div>
              <div class="pwd-login">${p.login}</div>
              ${p.url ? `<a class="pwd-url" href="${p.url}" target="_blank">${p.url}</a>` : ''}
            </div>
            <div class="pwd-password-wrap">
              <span class="pwd-masked" data-id="${p.id}">••••••••</span>
              <button class="icon-btn reveal-btn" data-id="${p.id}" title="Показати">👁</button>
              <button class="icon-btn copy-btn" data-id="${p.id}" title="Копіювати">📋</button>
            </div>
            <div class="task-actions">
              <button class="client-btn edit-btn" data-id="${p.id}" title="Редагувати">✏️</button>
              <button class="client-btn delete-btn" data-id="${p.id}" title="Видалити">🗑</button>
            </div>
          </div>
        `).join('')}
      </div>
    `

    // Reveal password
    el.querySelectorAll('.reveal-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const span = el.querySelector(`.pwd-masked[data-id="${btn.dataset.id}"]`)
        const pwd  = passwords.find(p => p.id === btn.dataset.id)
        if (!pwd) return
        if (span.dataset.revealed === 'true') {
          span.textContent = '••••••••'
          span.dataset.revealed = 'false'
          btn.textContent = '👁'
        } else {
          span.textContent = '...'
          const plain = await decryptPassword(pwd.passwordEncrypted, user.uid)
          span.textContent = plain
          span.dataset.revealed = 'true'
          btn.textContent = '🙈'
        }
      })
    })

    // Copy password
    el.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pwd = passwords.find(p => p.id === btn.dataset.id)
        if (!pwd) return
        const plain = await decryptPassword(pwd.passwordEncrypted, user.uid)
        await navigator.clipboard.writeText(plain)
        const orig = btn.textContent
        btn.textContent = '✓'
        setTimeout(() => { btn.textContent = orig }, 1500)
      })
    })

    el.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        openModal(passwords.find(p => p.id === btn.dataset.id))
      })
    })

    el.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        if (!confirm('Видалити цей запис?')) return
        await deleteDoc(doc(db, 'users', user.uid, 'passwords', btn.dataset.id))
        await loadPasswords()
      })
    })
  }

  // ── Search ────────────────────────────────────────────────
  container.querySelector('#search-input').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim()
    if (!q) { renderList(passwords); return }
    renderList(passwords.filter(p =>
      p.service?.toLowerCase().includes(q) || p.login?.toLowerCase().includes(q)
    ))
  })

  // ── Modal ─────────────────────────────────────────────────
  async function openModal(pwd = null) {
    editingId = pwd?.id || null
    container.querySelector('#modal-title').textContent = pwd ? 'Редагувати пароль' : 'Новий пароль'
    container.querySelector('#f-service').value  = pwd?.service  || ''
    container.querySelector('#f-login').value    = pwd?.login    || ''
    container.querySelector('#f-url').value      = pwd?.url      || ''
    container.querySelector('#f-note').value     = pwd?.note     || ''
    container.querySelector('#f-category').value = pwd?.category || 'general'

    const pwdInput = container.querySelector('#f-password')
    if (pwd?.passwordEncrypted) {
      pwdInput.value = await decryptPassword(pwd.passwordEncrypted, user.uid)
    } else {
      pwdInput.value = ''
    }

    container.querySelector('#e-service').textContent  = ''
    container.querySelector('#e-login').textContent    = ''
    container.querySelector('#e-password').textContent = ''
    container.querySelector('#modal').style.display = 'flex'
    setTimeout(() => container.querySelector('#f-service').focus(), 100)
  }

  function closeModal() {
    container.querySelector('#modal').style.display = 'none'
    editingId = null
  }

  // Показати/сховати пароль у формі
  container.querySelector('#toggle-pwd').addEventListener('click', () => {
    const input = container.querySelector('#f-password')
    input.type  = input.type === 'password' ? 'text' : 'password'
  })

  // Генератор пароля
  container.querySelector('#gen-pwd').addEventListener('click', () => {
    const chars  = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
    const arr    = crypto.getRandomValues(new Uint8Array(16))
    const pwd    = Array.from(arr).map(b => chars[b % chars.length]).join('')
    container.querySelector('#f-password').value = pwd
    container.querySelector('#f-password').type  = 'text'
  })

  container.querySelector('#add-pwd-btn').addEventListener('click', () => {
    if (!checkPlanLimit(profile, 'passwords', passwords.length)) return
    openModal()
  })
  container.querySelector('#modal-close').addEventListener('click', closeModal)
  container.querySelector('#modal-cancel').addEventListener('click', closeModal)
  container.querySelector('#modal').addEventListener('click', (e) => {
    if (e.target === container.querySelector('#modal')) closeModal()
  })

  // ── Save ──────────────────────────────────────────────────
  container.querySelector('#pwd-form').addEventListener('submit', async (e) => {
    e.preventDefault()

    const service  = container.querySelector('#f-service').value.trim()
    const login    = container.querySelector('#f-login').value.trim()
    const password = container.querySelector('#f-password').value

    let valid = true
    if (!service)  { container.querySelector('#e-service').textContent  = 'Введіть назву сервісу'; valid = false }
    if (!login)    { container.querySelector('#e-login').textContent    = 'Введіть логін';          valid = false }
    if (!password) { container.querySelector('#e-password').textContent = 'Введіть пароль';         valid = false }
    if (!valid) return

    const btn = container.querySelector('#modal-submit')
    btn.disabled = true
    btn.innerHTML = '<div class="spinner"></div>'

    try {
      const passwordEncrypted = await encryptPassword(password, user.uid)
      const data = {
        service,
        login,
        url:               container.querySelector('#f-url').value.trim()  || null,
        note:              container.querySelector('#f-note').value.trim()  || null,
        category:          container.querySelector('#f-category').value,
        passwordEncrypted,
      }

      if (editingId) {
        await updateDoc(doc(db, 'users', user.uid, 'passwords', editingId), {
          ...data, updatedAt: serverTimestamp()
        })
      } else {
        await addDoc(collection(db, 'users', user.uid, 'passwords'), {
          ...data, createdAt: serverTimestamp()
        })
      }
      closeModal()
      await loadPasswords()
    } catch (err) {
      console.error(err)
    } finally {
      btn.disabled = false
      btn.innerHTML = 'Зберегти'
    }
  })

  await loadPasswords()

  // ── Helpers ───────────────────────────────────────────────
  function getCategoryIcon(cat) {
    const icons = { work: '💼', finance: '🏦', social: '📱', email: '✉️', general: '🌐', other: '🔒' }
    return icons[cat] || '🔒'
  }
}

// ── Styles ────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('passwords-styles')) return
  const style = document.createElement('style')
  style.id = 'passwords-styles'
  style.textContent = `
    .passwords-page { padding: 32px 36px; max-width: 1000px; }

    .page-header   { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:24px; }
    .page-title    { font-family:var(--font-display); font-size:26px; font-weight:700; letter-spacing:-0.02em; margin-bottom:4px; }
    .page-subtitle { font-size:13px; color:var(--text-secondary); }

    .search-bar { display:flex; align-items:center; gap:10px; background:var(--bg-secondary); border:1.5px solid var(--border); border-radius:var(--radius-sm); padding:10px 14px; margin-bottom:20px; transition:border-color .2s; }
    .search-bar:focus-within { border-color:var(--accent-blue); }
    .search-icon  { font-size:15px; flex-shrink:0; }
    .search-input { flex:1; background:none; font-size:14px; color:var(--text-primary); }
    .search-input::placeholder { color:var(--text-muted); }

    .tasks-loading { display:flex; justify-content:center; padding:60px; }
    .pwd-grid  { display:flex; flex-direction:column; gap:10px; }

    .pwd-card { display:flex; align-items:center; gap:14px; background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-md); padding:16px 18px; transition:all .2s; }
    .pwd-card:hover { border-color:rgba(255,255,255,0.12); transform:translateY(-1px); box-shadow:var(--shadow-sm); }

    .pwd-icon { width:44px; height:44px; border-radius:12px; background:var(--bg-tertiary); display:flex; align-items:center; justify-content:center; font-size:22px; flex-shrink:0; }

    .pwd-info { flex:1; min-width:0; }
    .pwd-service { font-weight:700; font-size:15px; margin-bottom:2px; }
    .pwd-login   { font-size:13px; color:var(--text-secondary); }
    .pwd-url     { font-size:11px; color:var(--accent-blue); text-decoration:none; }
    .pwd-url:hover { text-decoration:underline; }

    .pwd-password-wrap { display:flex; align-items:center; gap:6px; }
    .pwd-masked { font-family:monospace; font-size:14px; color:var(--text-muted); min-width:80px; }
    .icon-btn { width:28px; height:28px; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:14px; transition:background .2s; cursor:pointer; }
    .icon-btn:hover { background:var(--bg-tertiary); }

    .task-actions { display:flex; gap:6px; opacity:0; transition:opacity .2s; }
    .pwd-card:hover .task-actions { opacity:1; }
    .client-btn   { width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:15px; transition:background .2s; cursor:pointer; }
    .edit-btn:hover   { background:var(--accent-blue-dim); }
    .delete-btn:hover { background:var(--accent-red-dim); }

    .empty-state { text-align:center; padding:80px 24px; }
    .empty-icon  { font-size:48px; margin-bottom:16px; }
    .empty-title { font-family:var(--font-display); font-size:18px; font-weight:600; margin-bottom:8px; }
    .empty-desc  { font-size:14px; color:var(--text-muted); }

    .pwd-input-wrap { position:relative; display:flex; gap:6px; align-items:center; }
    .pwd-input-wrap .input { flex:1; }
    .pwd-toggle, .pwd-generate { width:36px; height:36px; border-radius:8px; background:var(--bg-tertiary); border:1px solid var(--border); display:flex; align-items:center; justify-content:center; font-size:16px; cursor:pointer; transition:background .2s; flex-shrink:0; }
    .pwd-toggle:hover, .pwd-generate:hover { background:var(--accent-blue-dim); }

    .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.6); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; z-index:1000; padding:24px; }
    .modal { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-xl); width:100%; max-width:560px; box-shadow:var(--shadow-xl); animation:scaleIn .2s cubic-bezier(0.34,1.2,0.64,1); }
    .modal-header { display:flex; align-items:center; justify-content:space-between; padding:24px 24px 0; }
    .modal-title  { font-family:var(--font-display); font-size:20px; font-weight:700; }
    .modal-close  { width:32px; height:32px; border-radius:8px; color:var(--text-muted); font-size:16px; display:flex; align-items:center; justify-content:center; transition:all .2s; cursor:pointer; }
    .modal-close:hover { background:var(--accent-red-dim); color:var(--accent-red); }
    .modal-body { padding:20px 24px; display:flex; flex-direction:column; gap:14px; }
    .modal-footer { display:flex; gap:10px; justify-content:flex-end; padding:0 24px 24px; }
    .form-row { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .field label { display:block; font-size:12px; font-weight:600; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:6px; }
    .field-error { font-size:12px; color:#EF4444; margin-top:4px; display:block; }

    @keyframes scaleIn { from{opacity:0;transform:scale(0.95)} to{opacity:1;transform:scale(1)} }
  `
  document.head.appendChild(style)
}
