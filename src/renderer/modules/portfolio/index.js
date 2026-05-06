// src/renderer/modules/portfolio/index.js
import { db } from '../../services/firebase.js'
import { getCurrentUser, getActivePathSegments } from '../../services/auth.js'
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, orderBy, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

const TYPES = [
  { id: 'web',     label: 'Веб',         icon: '🌐', color: '#4F8EF7' },
  { id: 'design',  label: 'Дизайн',      icon: '🎨', color: '#A78BFA' },
  { id: 'smm',     label: 'SMM',         icon: '📱', color: '#F472B6' },
  { id: 'video',   label: 'Відео',       icon: '🎬', color: '#F59E0B' },
  { id: 'photo',   label: 'Фото',        icon: '📸', color: '#34D399' },
  { id: 'other',   label: 'Інше',        icon: '💼', color: '#94A3B8' },
]

export async function render(container) {
  injectStyles()
  const user = getCurrentUser()
  const base = getActivePathSegments(user.uid)
  let items = []
  let activeType = 'all'
  let editItem = null

  async function load() {
    try {
      const snap = await getDocs(query(collection(db, ...base, 'portfolio'), orderBy('createdAt', 'desc')))
      items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch { items = [] }
    rerender()
  }

  function rerender() {
    const filtered = activeType === 'all' ? items : items.filter(i => i.type === activeType)

    container.innerHTML = `
      <div class="pf-page">
        <div class="pf-header">
          <div>
            <h1 class="pf-title">🖼 Портфоліо</h1>
            <p class="pf-subtitle">${items.length} проектів</p>
          </div>
          <button class="pf-add-btn" id="pf-add">+ Проект</button>
        </div>

        <div class="pf-filter">
          <button class="pf-pill ${activeType==='all'?'active':''}" data-type="all">Всі (${items.length})</button>
          ${TYPES.map(t => {
            const cnt = items.filter(i => i.type === t.id).length
            if (!cnt) return ''
            return `<button class="pf-pill ${activeType===t.id?'active':''}" data-type="${t.id}" style="${activeType===t.id?`--pc:${t.color}`:''}">
              ${t.icon} ${t.label} (${cnt})
            </button>`
          }).join('')}
        </div>

        ${filtered.length ? `
        <div class="pf-grid">
          ${filtered.map(item => {
            const tp = TYPES.find(t => t.id === item.type) || TYPES.at(-1)
            return `
              <div class="pf-card">
                <div class="pf-card-img" style="background:${tp.color}18;border-color:${tp.color}30">
                  <div class="pf-card-type-icon" style="color:${tp.color}">${tp.icon}</div>
                  ${item.link ? `<a class="pf-card-link-btn" href="${item.link}" target="_blank" title="Відкрити">↗</a>` : ''}
                </div>
                <div class="pf-card-body">
                  <div class="pf-card-top">
                    <span class="pf-type-badge" style="color:${tp.color};background:${tp.color}15">${tp.icon} ${tp.label}</span>
                    <div class="pf-card-btns">
                      <button class="pf-cb pf-edit" data-id="${item.id}">✏️</button>
                      <button class="pf-cb pf-del"  data-id="${item.id}">🗑</button>
                    </div>
                  </div>
                  <div class="pf-card-title">${item.title}</div>
                  ${item.client ? `<div class="pf-card-client">👤 ${item.client}</div>` : ''}
                  ${item.description ? `<div class="pf-card-desc">${item.description}</div>` : ''}
                  <div class="pf-card-foot">
                    ${item.tags ? item.tags.split(',').map(t => `<span class="pf-tag">${t.trim()}</span>`).join('') : ''}
                    ${item.year ? `<span class="pf-year">${item.year}</span>` : ''}
                  </div>
                </div>
              </div>
            `
          }).join('')}
        </div>` : `
        <div class="pf-empty">
          <div style="font-size:52px;margin-bottom:12px">🖼</div>
          <div class="pf-empty-title">Портфоліо порожнє</div>
          <div class="pf-empty-desc">Додайте свої кращі роботи</div>
          <button class="pf-add-btn" id="pf-add-empty">+ Додати проект</button>
        </div>`}
      </div>

      <!-- Modal -->
      <div class="pf-overlay" id="pf-modal" style="display:none">
        <div class="pf-modal">
          <div class="pf-modal-head">
            <h2 id="pf-modal-title">Новий проект</h2>
            <button id="pf-modal-close">✕</button>
          </div>
          <div class="pf-modal-body">
            <div class="pf-field"><label>Назва *</label><input id="pf-f-title" class="pf-input" type="text" placeholder="Назва проекту..."></div>
            <div class="pf-form-row">
              <div class="pf-field"><label>Тип</label><select id="pf-f-type" class="pf-input">${TYPES.map(t=>`<option value="${t.id}">${t.icon} ${t.label}</option>`).join('')}</select></div>
              <div class="pf-field"><label>Рік</label><input id="pf-f-year" class="pf-input" type="number" placeholder="${new Date().getFullYear()}"></div>
            </div>
            <div class="pf-field"><label>Клієнт</label><input id="pf-f-client" class="pf-input" type="text" placeholder="Назва клієнта..."></div>
            <div class="pf-field"><label>Опис</label><textarea id="pf-f-desc" class="pf-input pf-textarea" rows="3" placeholder="Короткий опис проекту..."></textarea></div>
            <div class="pf-field"><label>Посилання</label><input id="pf-f-link" class="pf-input" type="url" placeholder="https://..."></div>
            <div class="pf-field"><label>Теги (через кому)</label><input id="pf-f-tags" class="pf-input" type="text" placeholder="React, Figma, Branding..."></div>
          </div>
          <div class="pf-modal-foot">
            <button class="pf-btn-sec" id="pf-modal-cancel">Скасувати</button>
            <button class="pf-btn-pri" id="pf-modal-save">Зберегти</button>
          </div>
        </div>
      </div>
    `
    attachEvents()
  }

  function attachEvents() {
    container.querySelector('#pf-add')?.addEventListener('click', () => openModal())
    container.querySelector('#pf-add-empty')?.addEventListener('click', () => openModal())
    container.querySelector('#pf-modal-close')?.addEventListener('click', closeModal)
    container.querySelector('#pf-modal-cancel')?.addEventListener('click', closeModal)
    container.querySelector('#pf-modal')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeModal() })
    container.querySelector('#pf-modal-save')?.addEventListener('click', save)
    container.querySelectorAll('.pf-pill').forEach(b => b.addEventListener('click', () => { activeType = b.dataset.type; rerender() }))
    container.querySelectorAll('.pf-edit').forEach(b => b.addEventListener('click', () => openModal(items.find(i => i.id === b.dataset.id))))
    container.querySelectorAll('.pf-del').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Видалити проект?')) return
      await deleteDoc(doc(db, ...base, 'portfolio', b.dataset.id)); await load()
    }))
  }

  function openModal(item = null) {
    editItem = item
    container.querySelector('#pf-modal-title').textContent = item ? 'Редагувати проект' : 'Новий проект'
    container.querySelector('#pf-f-title').value  = item?.title  || ''
    container.querySelector('#pf-f-type').value   = item?.type   || 'web'
    container.querySelector('#pf-f-year').value   = item?.year   || new Date().getFullYear()
    container.querySelector('#pf-f-client').value = item?.client || ''
    container.querySelector('#pf-f-desc').value   = item?.description || ''
    container.querySelector('#pf-f-link').value   = item?.link   || ''
    container.querySelector('#pf-f-tags').value   = item?.tags   || ''
    container.querySelector('#pf-modal').style.display = 'flex'
    setTimeout(() => container.querySelector('#pf-f-title').focus(), 50)
  }

  function closeModal() { container.querySelector('#pf-modal').style.display = 'none'; editItem = null }

  async function save() {
    const title = container.querySelector('#pf-f-title').value.trim()
    if (!title) return
    const btn = container.querySelector('#pf-modal-save')
    btn.disabled = true; btn.textContent = '...'
    const data = {
      title, type: container.querySelector('#pf-f-type').value,
      year: Number(container.querySelector('#pf-f-year').value) || null,
      client: container.querySelector('#pf-f-client').value.trim() || null,
      description: container.querySelector('#pf-f-desc').value.trim() || null,
      link: container.querySelector('#pf-f-link').value.trim() || null,
      tags: container.querySelector('#pf-f-tags').value.trim() || null,
    }
    try {
      if (editItem) await updateDoc(doc(db, ...base, 'portfolio', editItem.id), { ...data, updatedAt: serverTimestamp() })
      else await addDoc(collection(db, ...base, 'portfolio'), { ...data, createdAt: serverTimestamp() })
      closeModal(); await load()
    } finally { btn.disabled = false; btn.textContent = 'Зберегти' }
  }

  await load()
}

function injectStyles() {
  document.getElementById('pf-styles')?.remove()
  const s = document.createElement('style')
  s.id = 'pf-styles'
  s.textContent = `
    .pf-page { padding:28px 32px; max-width:1100px; }
    .pf-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; }
    .pf-title { font-family:var(--font-display); font-size:24px; font-weight:800; margin-bottom:4px; }
    .pf-subtitle { font-size:13px; color:var(--text-muted); }
    .pf-add-btn { padding:9px 20px; background:linear-gradient(135deg,#667eea,#4F8EF7); color:#fff; border:none; border-radius:var(--radius-md); font-size:13px; font-weight:700; cursor:pointer; }
    .pf-filter { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:20px; }
    .pf-pill { padding:6px 14px; border-radius:var(--radius-full); font-size:12px; font-weight:600; color:var(--text-secondary); background:var(--bg-secondary); border:1px solid var(--border); cursor:pointer; transition:all .15s; }
    .pf-pill.active { background:var(--pc,var(--accent-blue)); border-color:var(--pc,var(--accent-blue)); color:#fff; }
    .pf-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:16px; }
    .pf-card { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-xl); overflow:hidden; transition:all .2s; }
    .pf-card:hover { transform:translateY(-3px); box-shadow:0 12px 32px rgba(0,0,0,.25); }
    .pf-card-img { height:120px; display:flex; align-items:center; justify-content:center; border-bottom:1px solid var(--border); position:relative; }
    .pf-card-type-icon { font-size:48px; }
    .pf-card-link-btn { position:absolute; top:10px; right:10px; width:28px; height:28px; border-radius:8px; background:rgba(0,0,0,.4); color:#fff; display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:700; text-decoration:none; transition:all .15s; }
    .pf-card-link-btn:hover { background:var(--accent-blue); }
    .pf-card-body { padding:14px 16px; }
    .pf-card-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
    .pf-type-badge { font-size:11px; font-weight:700; padding:3px 9px; border-radius:var(--radius-full); }
    .pf-card-btns { display:flex; gap:4px; opacity:0; transition:opacity .15s; }
    .pf-card:hover .pf-card-btns { opacity:1; }
    .pf-cb { width:26px; height:26px; border-radius:6px; background:var(--bg-tertiary); border:1px solid var(--border); cursor:pointer; font-size:12px; display:flex; align-items:center; justify-content:center; }
    .pf-card-title { font-size:14px; font-weight:700; margin-bottom:4px; }
    .pf-card-client { font-size:12px; color:var(--text-muted); margin-bottom:4px; }
    .pf-card-desc { font-size:12px; color:var(--text-secondary); line-height:1.5; margin-bottom:8px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
    .pf-card-foot { display:flex; flex-wrap:wrap; gap:4px; align-items:center; }
    .pf-tag { font-size:10px; font-weight:600; padding:2px 8px; border-radius:var(--radius-full); background:var(--bg-tertiary); border:1px solid var(--border); color:var(--text-muted); }
    .pf-year { font-size:11px; font-weight:700; color:var(--text-muted); margin-left:auto; }
    .pf-empty { text-align:center; padding:80px 32px; }
    .pf-empty-title { font-family:var(--font-display); font-size:18px; font-weight:700; margin-bottom:6px; }
    .pf-empty-desc { font-size:13px; color:var(--text-muted); margin-bottom:20px; }
    .pf-overlay { position:fixed; inset:0; background:rgba(0,0,0,.6); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; z-index:1000; }
    .pf-modal { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-xl); width:480px; max-width:95vw; box-shadow:0 24px 64px rgba(0,0,0,.4); animation:pf-in .18s ease; }
    @keyframes pf-in { from{opacity:0;transform:scale(.95)} to{opacity:1;transform:scale(1)} }
    .pf-modal-head { display:flex; justify-content:space-between; align-items:center; padding:20px 22px 0; }
    .pf-modal-head h2 { font-family:var(--font-display); font-size:18px; font-weight:800; }
    .pf-modal-head button { background:none; border:none; font-size:16px; color:var(--text-muted); cursor:pointer; padding:4px 8px; border-radius:6px; }
    .pf-modal-body { padding:18px 22px; display:flex; flex-direction:column; gap:13px; }
    .pf-modal-foot { padding:14px 22px; border-top:1px solid var(--border); display:flex; gap:8px; justify-content:flex-end; }
    .pf-field label { display:block; font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.05em; margin-bottom:6px; }
    .pf-input { width:100%; box-sizing:border-box; padding:9px 13px; background:var(--bg-tertiary); border:1.5px solid var(--border); border-radius:var(--radius-md); font-size:13px; color:var(--text-primary); outline:none; font-family:inherit; transition:border-color .15s; }
    .pf-input:focus { border-color:var(--accent-blue); }
    .pf-textarea { resize:vertical; min-height:80px; }
    .pf-form-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .pf-btn-pri { padding:9px 20px; background:linear-gradient(135deg,#667eea,#4F8EF7); color:#fff; border:none; border-radius:var(--radius-md); font-size:13px; font-weight:700; cursor:pointer; }
    .pf-btn-sec { padding:9px 20px; background:var(--bg-tertiary); border:1.5px solid var(--border); color:var(--text-primary); border-radius:var(--radius-md); font-size:13px; font-weight:600; cursor:pointer; }
  `
  document.head.appendChild(s)
}
