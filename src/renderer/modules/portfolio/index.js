// src/renderer/modules/portfolio/index.js
import { icon } from '../../utils/icons.js'
import { t } from '../../core/i18n.js'
import { db } from '../../services/firebase.js'
import { getCurrentUser, getActivePathSegments } from '../../services/auth.js'
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, orderBy, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

const TYPES = [
  { id: 'web',    get label() { return t('portfolio.type.web') },    iconName: 'globe',      color: '#4F8EF7' },
  { id: 'design', get label() { return t('portfolio.type.design') }, iconName: 'image',      color: '#A78BFA' },
  { id: 'smm',    get label() { return t('portfolio.type.smm') },    iconName: 'smartphone', color: '#F472B6' },
  { id: 'video',  get label() { return t('portfolio.type.video') },  iconName: 'film',       color: '#F59E0B' },
  { id: 'photo',  get label() { return t('portfolio.type.photo') },  iconName: 'camera',     color: '#34D399' },
  { id: 'other',  get label() { return t('portfolio.type.other') },  iconName: 'briefcase',  color: '#94A3B8' },
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
      <div class="port-page">
        <div class="port-header">
          <div>
            <h1 class="port-title">${icon('image', 20)} ${t('portfolio.title')}</h1>
            <p class="port-subtitle">${items.length} ${t('portfolio.projects')}</p>
          </div>
          <button class="port-add-btn" id="port-add">${t('portfolio.add')}</button>
        </div>

        <div class="port-filter">
          <button class="port-pill ${activeType==='all'?'active':''}" data-type="all">${t('common.all')} (${items.length})</button>
          ${TYPES.map(t => {
            const cnt = items.filter(i => i.type === t.id).length
            if (!cnt) return ''
            return `<button class="port-pill ${activeType===t.id?'active':''}" data-type="${t.id}" style="${activeType===t.id?`--pc:${t.color}`:''}">
              ${icon(t.iconName, 12)} ${t.label} (${cnt})
            </button>`
          }).join('')}
        </div>

        ${filtered.length ? `
        <div class="port-grid">
          ${filtered.map(item => {
            const tp = TYPES.find(t => t.id === item.type) || TYPES.at(-1)
            return `
              <div class="port-card">
                <div class="port-card-img" style="background:${tp.color}18;border-color:${tp.color}30">
                  <div class="port-card-type-icon" style="color:${tp.color}">${icon(tp.iconName, 28)}</div>
                  ${item.link ? `<a class="port-card-link-btn" href="${item.link}" target="_blank" title="Відкрити">↗</a>` : ''}
                </div>
                <div class="port-card-body">
                  <div class="port-card-top">
                    <span class="port-type-badge" style="color:${tp.color};background:${tp.color}15">${icon(tp.iconName, 11)} ${tp.label}</span>
                    <div class="port-card-btns">
                      <button class="port-cb port-edit" data-id="${item.id}">${icon('pencil', 13)}</button>
                      <button class="port-cb port-del"  data-id="${item.id}">${icon('trash', 13)}</button>
                    </div>
                  </div>
                  <div class="port-card-title">${item.title}</div>
                  ${item.client ? `<div class="port-card-client">${icon('user', 11)} ${item.client}</div>` : ''}
                  ${item.description ? `<div class="port-card-desc">${item.description}</div>` : ''}
                  <div class="port-card-foot">
                    ${item.tags ? item.tags.split(',').map(t => `<span class="port-tag">${t.trim()}</span>`).join('') : ''}
                    ${item.year ? `<span class="port-year">${item.year}</span>` : ''}
                  </div>
                </div>
              </div>
            `
          }).join('')}
        </div>` : `
        <div class="port-empty">
          <div style="display:flex;align-items:center;justify-content:center;margin-bottom:12px;color:var(--text-muted);opacity:.4">${icon('image', 48)}</div>
          <div class="port-empty-title">Портфоліо порожнє</div>
          <div class="port-empty-desc">Додайте свої кращі роботи</div>
          <button class="port-add-btn" id="port-add-empty">+ Додати проект</button>
        </div>`}
      </div>

      <!-- Modal -->
      <div class="port-overlay" id="port-modal" style="display:none">
        <div class="port-modal">
          <div class="port-modal-head">
            <h2 id="port-modal-title">Новий проект</h2>
            <button id="port-modal-close">${icon('x', 14)}</button>
          </div>
          <div class="port-modal-body">
            <div class="port-field"><label>Назва *</label><input id="port-f-title" class="port-input" type="text" placeholder="Назва проекту..."></div>
            <div class="port-form-row">
              <div class="port-field"><label>Тип</label><select id="port-f-type" class="port-input">${TYPES.map(t=>`<option value="${t.id}">${t.label}</option>`).join('')}</select></div>
              <div class="port-field"><label>Рік</label><input id="port-f-year" class="port-input" type="number" placeholder="${new Date().getFullYear()}"></div>
            </div>
            <div class="port-field"><label>Клієнт</label><input id="port-f-client" class="port-input" type="text" placeholder="Назва клієнта..."></div>
            <div class="port-field"><label>Опис</label><textarea id="port-f-desc" class="port-input port-textarea" rows="3" placeholder="Короткий опис проекту..."></textarea></div>
            <div class="port-field"><label>Посилання</label><input id="port-f-link" class="port-input" type="url" placeholder="https://..."></div>
            <div class="port-field"><label>Теги (через кому)</label><input id="port-f-tags" class="port-input" type="text" placeholder="React, Figma, Branding..."></div>
          </div>
          <div class="port-modal-foot">
            <button class="port-btn-sec" id="port-modal-cancel">Скасувати</button>
            <button class="port-btn-pri" id="port-modal-save">Зберегти</button>
          </div>
        </div>
      </div>
    `
    attachEvents()
  }

  function attachEvents() {
    container.querySelector('#port-add')?.addEventListener('click', () => openModal())
    container.querySelector('#port-add-empty')?.addEventListener('click', () => openModal())
    container.querySelector('#port-modal-close')?.addEventListener('click', closeModal)
    container.querySelector('#port-modal-cancel')?.addEventListener('click', closeModal)
    container.querySelector('#port-modal')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeModal() })
    container.querySelector('#port-modal-save')?.addEventListener('click', save)
    container.querySelectorAll('.port-pill').forEach(b => b.addEventListener('click', () => { activeType = b.dataset.type; rerender() }))
    container.querySelectorAll('.port-edit').forEach(b => b.addEventListener('click', () => openModal(items.find(i => i.id === b.dataset.id))))
    container.querySelectorAll('.port-del').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Видалити проект?')) return
      await deleteDoc(doc(db, ...base, 'portfolio', b.dataset.id)); await load()
    }))
  }

  function openModal(item = null) {
    editItem = item
    container.querySelector('#port-modal-title').textContent = item ? 'Редагувати проект' : 'Новий проект'
    container.querySelector('#port-f-title').value  = item?.title  || ''
    container.querySelector('#port-f-type').value   = item?.type   || 'web'
    container.querySelector('#port-f-year').value   = item?.year   || new Date().getFullYear()
    container.querySelector('#port-f-client').value = item?.client || ''
    container.querySelector('#port-f-desc').value   = item?.description || ''
    container.querySelector('#port-f-link').value   = item?.link   || ''
    container.querySelector('#port-f-tags').value   = item?.tags   || ''
    container.querySelector('#port-modal').style.display = 'flex'
    setTimeout(() => container.querySelector('#port-f-title').focus(), 50)
  }

  function closeModal() { container.querySelector('#port-modal').style.display = 'none'; editItem = null }

  async function save() {
    const title = container.querySelector('#port-f-title').value.trim()
    if (!title) return
    const btn = container.querySelector('#port-modal-save')
    btn.disabled = true; btn.textContent = '...'
    const data = {
      title, type: container.querySelector('#port-f-type').value,
      year: Number(container.querySelector('#port-f-year').value) || null,
      client: container.querySelector('#port-f-client').value.trim() || null,
      description: container.querySelector('#port-f-desc').value.trim() || null,
      link: container.querySelector('#port-f-link').value.trim() || null,
      tags: container.querySelector('#port-f-tags').value.trim() || null,
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
  document.getElementById('port-styles')?.remove()
  const s = document.createElement('style')
  s.id = 'port-styles'
  s.textContent = `
    .port-page { padding:28px 32px; }
    .port-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; }
    .port-title { font-family:var(--font-display); font-size:26px; font-weight:800; margin-bottom:4px; display:flex; align-items:center; gap:10px; }
    .port-subtitle { font-size:13px; color:var(--text-muted); }
    .port-add-btn { padding:9px 22px; background:linear-gradient(135deg,#667eea,#4F8EF7); color:#fff; border:none; border-radius:var(--radius-md); font-size:13px; font-weight:700; cursor:pointer; transition:all .15s; }
    .port-add-btn:hover { transform:translateY(-1px); box-shadow:0 4px 14px rgba(79,142,247,.4); }
    .port-filter { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:20px; }
    .port-pill { padding:6px 14px; border-radius:var(--radius-full); font-size:12px; font-weight:600; color:var(--text-secondary); background:var(--bg-secondary); border:1px solid var(--border); cursor:pointer; transition:all .15s; display:flex; align-items:center; gap:5px; }
    .port-pill:hover { border-color:var(--accent-blue); color:var(--text-primary); }
    .port-pill.active { background:var(--pc,var(--accent-blue)); border-color:var(--pc,var(--accent-blue)); color:#fff; }
    .port-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:16px; }
    .port-card { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-xl); overflow:hidden; transition:all .2s; }
    .port-card:hover { transform:translateY(-3px); box-shadow:0 12px 32px rgba(0,0,0,.25); border-color:rgba(255,255,255,.12); }
    .port-card-img { height:140px; display:flex; align-items:center; justify-content:center; border-bottom:1px solid var(--border); position:relative; overflow:hidden; }
    .port-card-img::after { content:''; position:absolute; inset:0; background:linear-gradient(135deg, transparent 60%, rgba(0,0,0,.15)); pointer-events:none; }
    .port-card-type-icon { display:flex; align-items:center; justify-content:center; opacity:.7; }
    .port-card-link-btn { position:absolute; top:10px; right:10px; width:28px; height:28px; border-radius:8px; background:rgba(0,0,0,.4); color:#fff; display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:700; text-decoration:none; transition:all .15s; }
    .port-card-link-btn:hover { background:var(--accent-blue); }
    .port-card-body { padding:14px 16px; }
    .port-card-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
    .port-type-badge { font-size:11px; font-weight:700; padding:3px 9px; border-radius:var(--radius-full); }
    .port-card-btns { display:flex; gap:4px; opacity:0; transition:opacity .15s; }
    .port-card:hover .port-card-btns { opacity:1; }
    .port-cb { width:26px; height:26px; border-radius:6px; background:var(--bg-tertiary); border:1px solid var(--border); cursor:pointer; font-size:12px; display:flex; align-items:center; justify-content:center; }
    .port-card-title { font-size:14px; font-weight:700; margin-bottom:4px; }
    .port-card-client { font-size:12px; color:var(--text-muted); margin-bottom:4px; display:flex; align-items:center; gap:4px; }
    .port-card-desc { font-size:12px; color:var(--text-secondary); line-height:1.5; margin-bottom:8px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
    .port-card-foot { display:flex; flex-wrap:wrap; gap:4px; align-items:center; }
    .port-tag { font-size:10px; font-weight:600; padding:2px 8px; border-radius:var(--radius-full); background:var(--bg-tertiary); border:1px solid var(--border); color:var(--text-muted); }
    .port-year { font-size:11px; font-weight:700; color:var(--text-muted); margin-left:auto; }
    .port-empty { text-align:center; padding:80px 32px; }
    .port-empty-title { font-family:var(--font-display); font-size:18px; font-weight:700; margin-bottom:6px; }
    .port-empty-desc { font-size:13px; color:var(--text-muted); margin-bottom:20px; }
    .port-overlay { position:fixed; inset:0; background:rgba(0,0,0,.6); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; z-index:1000; }
    .port-modal { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-xl); width:480px; max-width:95vw; box-shadow:0 24px 64px rgba(0,0,0,.4); animation:port-in .18s ease; }
    @keyframes port-in { from{opacity:0;transform:scale(.95)} to{opacity:1;transform:scale(1)} }
    .port-modal-head { display:flex; justify-content:space-between; align-items:center; padding:20px 22px 0; }
    .port-modal-head h2 { font-family:var(--font-display); font-size:18px; font-weight:800; }
    .port-modal-head button { background:none; border:none; color:var(--text-muted); cursor:pointer; padding:4px 8px; border-radius:6px; display:flex; align-items:center; justify-content:center; }
    .port-modal-body { padding:18px 22px; display:flex; flex-direction:column; gap:13px; }
    .port-modal-foot { padding:14px 22px; border-top:1px solid var(--border); display:flex; gap:8px; justify-content:flex-end; }
    .port-field label { display:block; font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.05em; margin-bottom:6px; }
    .port-input { width:100%; box-sizing:border-box; padding:9px 13px; background:var(--bg-tertiary); border:1.5px solid var(--border); border-radius:var(--radius-md); font-size:13px; color:var(--text-primary); outline:none; font-family:inherit; transition:border-color .15s; }
    .port-input:focus { border-color:var(--accent-blue); }
    .port-textarea { resize:vertical; min-height:80px; }
    .port-form-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .port-btn-pri { padding:9px 20px; background:linear-gradient(135deg,#667eea,#4F8EF7); color:#fff; border:none; border-radius:var(--radius-md); font-size:13px; font-weight:700; cursor:pointer; }
    .port-btn-sec { padding:9px 20px; background:var(--bg-tertiary); border:1.5px solid var(--border); color:var(--text-primary); border-radius:var(--radius-md); font-size:13px; font-weight:600; cursor:pointer; }
  `
  document.head.appendChild(s)
}
