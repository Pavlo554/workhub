// src/renderer/modules/accounts/index.js
import { db } from '../../services/firebase.js'
import { getCurrentUser } from '../../services/auth.js'
import {
  collection, addDoc, getDocs, deleteDoc, doc, updateDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

export async function render(container) {
  injectStyles()
  const user = getCurrentUser()

  container.innerHTML = `
    <div class="page-wrap">
      <div class="page-header">
        <div>
          <h1 class="page-title">🔗 Акаунти</h1>
          <p class="page-subtitle">Соціальні мережі та платформи</p>
        </div>
        <button class="btn btn-primary" id="add-account-btn">+ Додати акаунт</button>
      </div>
      <div id="accounts-list" class="accounts-list">
        <div class="page-loading"><div class="spinner"></div></div>
      </div>
    </div>

    <!-- Modal -->
    <div class="modal-overlay" id="account-modal" style="display:none">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title" id="modal-title">Новий акаунт</span>
          <button class="modal-close" id="modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>Платформа *</label>
            <select class="input" id="acc-platform">
              <option value="">Оберіть платформу</option>
              <option value="Instagram">Instagram</option>
              <option value="TikTok">TikTok</option>
              <option value="Facebook">Facebook</option>
              <option value="YouTube">YouTube</option>
              <option value="Telegram">Telegram</option>
              <option value="LinkedIn">LinkedIn</option>
              <option value="Twitter/X">Twitter/X</option>
              <option value="Pinterest">Pinterest</option>
              <option value="Інше">Інше</option>
            </select>
          </div>
          <div class="field">
            <label>Нікнейм / URL *</label>
            <input class="input" id="acc-handle" placeholder="@username або https://..." />
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="field">
              <label>Підписники</label>
              <input class="input" id="acc-followers" type="number" placeholder="1000" />
            </div>
            <div class="field">
              <label>Тематика</label>
              <input class="input" id="acc-niche" placeholder="Краса, мода..." />
            </div>
          </div>
          <div class="field">
            <label>Нотатка</label>
            <input class="input" id="acc-note" placeholder="Додаткова інформація" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="modal-cancel">Скасувати</button>
          <button class="btn btn-primary" id="modal-save">Зберегти</button>
        </div>
      </div>
    </div>
  `

  const PLATFORM_ICONS = {
    Instagram: '📸', TikTok: '🎵', Facebook: '👤', YouTube: '▶',
    Telegram: '✈', LinkedIn: '💼', 'Twitter/X': '🐦', Pinterest: '📌', Інше: '🔗',
  }

  let editId = null
  const colRef = collection(db, 'users', user.uid, 'accounts')

  async function loadAccounts() {
    const snap = await getDocs(colRef)
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    const list = container.querySelector('#accounts-list')

    if (!items.length) {
      list.innerHTML = `<div class="empty-state"><div class="empty-icon">🔗</div><p>Акаунтів ще немає. Додайте перший!</p></div>`
      return
    }

    list.innerHTML = items.map(a => `
      <div class="account-card" data-id="${a.id}">
        <div class="account-icon">${PLATFORM_ICONS[a.platform] || '🔗'}</div>
        <div class="account-info">
          <div class="account-platform">${a.platform}</div>
          <div class="account-handle">${a.handle}</div>
          ${a.niche ? `<div class="account-niche">${a.niche}</div>` : ''}
        </div>
        ${a.followers ? `<div class="account-followers">${Number(a.followers).toLocaleString('uk')} <span>підп.</span></div>` : ''}
        <div class="service-actions">
          <button class="btn-icon edit-btn" data-id="${a.id}">✏</button>
          <button class="btn-icon delete-btn" data-id="${a.id}">🗑</button>
        </div>
      </div>
    `).join('')

    list.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Видалити акаунт?')) return
        await deleteDoc(doc(db, 'users', user.uid, 'accounts', btn.dataset.id))
        loadAccounts()
      })
    })

    list.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = items.find(i => i.id === btn.dataset.id)
        if (!item) return
        editId = item.id
        container.querySelector('#modal-title').textContent = 'Редагувати акаунт'
        container.querySelector('#acc-platform').value   = item.platform || ''
        container.querySelector('#acc-handle').value     = item.handle || ''
        container.querySelector('#acc-followers').value  = item.followers || ''
        container.querySelector('#acc-niche').value      = item.niche || ''
        container.querySelector('#acc-note').value       = item.note || ''
        openModal()
      })
    })
  }

  function openModal() {
    container.querySelector('#account-modal').style.display = 'flex'
  }
  function closeModal() {
    container.querySelector('#account-modal').style.display = 'none'
    editId = null
    container.querySelector('#modal-title').textContent = 'Новий акаунт'
    ;['#acc-platform','#acc-handle','#acc-followers','#acc-niche','#acc-note'].forEach(sel => {
      container.querySelector(sel).value = ''
    })
  }

  container.querySelector('#add-account-btn').addEventListener('click', openModal)
  container.querySelector('#modal-close').addEventListener('click', closeModal)
  container.querySelector('#modal-cancel').addEventListener('click', closeModal)

  container.querySelector('#modal-save').addEventListener('click', async () => {
    const platform = container.querySelector('#acc-platform').value
    const handle   = container.querySelector('#acc-handle').value.trim()
    if (!platform || !handle) return

    const data = {
      platform,
      handle,
      followers: Number(container.querySelector('#acc-followers').value) || null,
      niche:     container.querySelector('#acc-niche').value.trim() || null,
      note:      container.querySelector('#acc-note').value.trim() || null,
      updatedAt: serverTimestamp(),
    }

    if (editId) {
      await updateDoc(doc(db, 'users', user.uid, 'accounts', editId), data)
    } else {
      await addDoc(colRef, { ...data, createdAt: serverTimestamp() })
    }

    closeModal()
    loadAccounts()
  })

  loadAccounts()
}

function injectStyles() {
  if (document.getElementById('accounts-styles')) return
  const s = document.createElement('style')
  s.id = 'accounts-styles'
  s.textContent = `
    .accounts-list { display: flex; flex-direction: column; gap: 8px; max-width: 720px; }
    .account-card {
      display: flex; align-items: center; gap: 14px;
      background: var(--bg-secondary); border: 1px solid var(--border);
      border-radius: var(--radius-lg); padding: 14px 18px;
      transition: border-color .2s;
    }
    .account-card:hover { border-color: rgba(255,255,255,.15); }
    .account-icon     { font-size: 24px; width: 36px; text-align: center; flex-shrink: 0; }
    .account-info     { flex: 1; }
    .account-platform { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--text-muted); }
    .account-handle   { font-size: 14px; font-weight: 600; margin-top: 1px; }
    .account-niche    { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
    .account-followers {
      font-family: var(--font-mono); font-size: 14px; font-weight: 700;
      color: var(--accent-blue); white-space: nowrap;
    }
    .account-followers span { font-size: 11px; font-weight: 400; color: var(--text-muted); }
  `
  document.head.appendChild(s)
}
