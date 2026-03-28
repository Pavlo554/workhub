// src/renderer/modules/services/index.js
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
          <h1 class="page-title">💅 Послуги</h1>
          <p class="page-subtitle">Прайс-лист ваших послуг</p>
        </div>
        <button class="btn btn-primary" id="add-service-btn">+ Додати послугу</button>
      </div>
      <div id="services-list" class="services-list">
        <div class="page-loading"><div class="spinner"></div></div>
      </div>
    </div>

    <!-- Modal -->
    <div class="modal-overlay" id="service-modal" style="display:none">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title" id="modal-title">Нова послуга</span>
          <button class="modal-close" id="modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>Назва *</label>
            <input class="input" id="svc-name" placeholder="Манікюр з покриттям" />
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="field">
              <label>Ціна (₴) *</label>
              <input class="input" id="svc-price" type="number" placeholder="500" />
            </div>
            <div class="field">
              <label>Тривалість (хв)</label>
              <input class="input" id="svc-duration" type="number" placeholder="60" />
            </div>
          </div>
          <div class="field">
            <label>Опис</label>
            <input class="input" id="svc-desc" placeholder="Короткий опис послуги" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="modal-cancel">Скасувати</button>
          <button class="btn btn-primary" id="modal-save">Зберегти</button>
        </div>
      </div>
    </div>
  `

  let editId = null
  const colRef = collection(db, 'users', user.uid, 'services')

  async function loadServices() {
    const snap = await getDocs(colRef)
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    const list = container.querySelector('#services-list')

    if (!items.length) {
      list.innerHTML = `<div class="empty-state"><div class="empty-icon">💅</div><p>Послуг ще немає. Додайте першу!</p></div>`
      return
    }

    list.innerHTML = items.map(s => `
      <div class="service-card" data-id="${s.id}">
        <div class="service-info">
          <div class="service-name">${s.name}</div>
          ${s.desc ? `<div class="service-desc">${s.desc}</div>` : ''}
        </div>
        <div class="service-meta">
          ${s.duration ? `<span class="service-duration">⏱ ${s.duration} хв</span>` : ''}
          <span class="service-price">₴${Number(s.price).toLocaleString('uk')}</span>
        </div>
        <div class="service-actions">
          <button class="btn-icon edit-btn" data-id="${s.id}">✏</button>
          <button class="btn-icon delete-btn" data-id="${s.id}">🗑</button>
        </div>
      </div>
    `).join('')

    list.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Видалити послугу?')) return
        await deleteDoc(doc(db, 'users', user.uid, 'services', btn.dataset.id))
        loadServices()
      })
    })

    list.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = items.find(i => i.id === btn.dataset.id)
        if (!item) return
        editId = item.id
        container.querySelector('#modal-title').textContent = 'Редагувати послугу'
        container.querySelector('#svc-name').value     = item.name || ''
        container.querySelector('#svc-price').value    = item.price || ''
        container.querySelector('#svc-duration').value = item.duration || ''
        container.querySelector('#svc-desc').value     = item.desc || ''
        openModal()
      })
    })
  }

  function openModal() {
    container.querySelector('#service-modal').style.display = 'flex'
    container.querySelector('#svc-name').focus()
  }
  function closeModal() {
    container.querySelector('#service-modal').style.display = 'none'
    editId = null
    container.querySelector('#modal-title').textContent = 'Нова послуга'
    ;['#svc-name','#svc-price','#svc-duration','#svc-desc'].forEach(sel => {
      container.querySelector(sel).value = ''
    })
  }

  container.querySelector('#add-service-btn').addEventListener('click', openModal)
  container.querySelector('#modal-close').addEventListener('click', closeModal)
  container.querySelector('#modal-cancel').addEventListener('click', closeModal)

  container.querySelector('#modal-save').addEventListener('click', async () => {
    const name  = container.querySelector('#svc-name').value.trim()
    const price = container.querySelector('#svc-price').value
    if (!name || !price) return

    const data = {
      name,
      price:    Number(price),
      duration: Number(container.querySelector('#svc-duration').value) || null,
      desc:     container.querySelector('#svc-desc').value.trim() || null,
      updatedAt: serverTimestamp(),
    }

    if (editId) {
      await updateDoc(doc(db, 'users', user.uid, 'services', editId), data)
    } else {
      await addDoc(colRef, { ...data, createdAt: serverTimestamp() })
    }

    closeModal()
    loadServices()
  })

  loadServices()
}

function injectStyles() {
  if (document.getElementById('services-styles')) return
  const s = document.createElement('style')
  s.id = 'services-styles'
  s.textContent = `
    .services-list { display: flex; flex-direction: column; gap: 8px; max-width: 720px; }
    .service-card {
      display: flex; align-items: center; gap: 16px;
      background: var(--bg-secondary); border: 1px solid var(--border);
      border-radius: var(--radius-lg); padding: 14px 18px;
      transition: border-color .2s;
    }
    .service-card:hover { border-color: rgba(255,255,255,.15); }
    .service-info { flex: 1; }
    .service-name  { font-size: 14px; font-weight: 600; }
    .service-desc  { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
    .service-meta  { display: flex; align-items: center; gap: 12px; }
    .service-duration { font-size: 12px; color: var(--text-muted); }
    .service-price {
      font-family: var(--font-mono); font-size: 15px; font-weight: 700;
      color: var(--accent-green, #34D399);
    }
    .service-actions { display: flex; gap: 6px; }
    .btn-icon {
      width: 32px; height: 32px; border-radius: var(--radius-sm);
      background: var(--bg-tertiary); border: 1px solid var(--border);
      cursor: pointer; font-size: 14px; display: flex; align-items: center;
      justify-content: center; transition: all .2s;
    }
    .btn-icon:hover { background: var(--bg-hover); }
  `
  document.head.appendChild(s)
}
