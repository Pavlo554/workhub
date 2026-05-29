// src/renderer/modules/kanban/index.js
import { db } from '../../services/firebase.js'
import { getCurrentUser, getActivePathSegments } from '../../services/auth.js'
import { icon } from '../../utils/icons.js'
import {
  collection, addDoc, getDocs, deleteDoc, doc, updateDoc,
  query, orderBy, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

const COLUMNS = [
  { id: 'backlog',     label: 'Беклог',       color: '#64748B' },
  { id: 'todo',        label: 'Треба зробити', color: '#4F8EF7' },
  { id: 'in_progress', label: 'В роботі',     color: '#F59E0B' },
  { id: 'review',      label: 'Ревью',         color: '#A78BFA' },
  { id: 'done',        label: 'Готово',        color: '#34D399' },
]

const PRIORITY = {
  high:   { label: 'Високий',  color: '#EF4444' },
  medium: { label: 'Середній', color: '#F59E0B' },
  low:    { label: 'Низький',  color: '#34D399' },
}

export async function render(container) {
  injectStyles()
  const user = getCurrentUser()
  const base = getActivePathSegments(user.uid)
  let cards = []
  let showModal = false
  let editCard = null
  let filterPriority = 'all'

  async function load() {
    try {
      const snap = await getDocs(query(collection(db, ...base, 'kanban'), orderBy('createdAt', 'desc')))
      cards = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch { cards = [] }
    rerender()
  }

  function rerender() {
    const filtered = filterPriority === 'all' ? cards : cards.filter(c => c.priority === filterPriority)

    container.innerHTML = `
      <div class="kb-page">
        <div class="kb-header">
          <div>
            <h1 class="kb-title">Kanban</h1>
            <p class="kb-subtitle">${cards.length} карток · ${cards.filter(c => c.column === 'done').length} виконано</p>
          </div>
          <div class="kb-header-right">
            <div class="kb-filter-pills">
              ${['all','high','medium','low'].map(p => `
                <button class="kb-pill ${filterPriority === p ? 'active' : ''}" data-p="${p}">
                  ${p === 'all' ? 'Всі' : PRIORITY[p].label}
                </button>`).join('')}
            </div>
            <button class="kb-add-btn" id="kb-add">+ Картка</button>
          </div>
        </div>

        <div class="kb-board">
          ${COLUMNS.map(col => {
            const colCards = filtered.filter(c => (c.column || 'todo') === col.id)
            return `
              <div class="kb-col" data-col="${col.id}">
                <div class="kb-col-head" style="border-top:3px solid ${col.color}">
                  <span>${col.label}</span>
                  <span class="kb-col-count" style="background:${col.color}22;color:${col.color}">${colCards.length}</span>
                </div>
                <div class="kb-col-body">
                  ${colCards.length ? colCards.map(card => `
                    <div class="kb-card" data-id="${card.id}">
                      <div class="kb-card-top">
                        <span class="kb-priority-dot" style="background:${(PRIORITY[card.priority]||PRIORITY.medium).color}" title="${(PRIORITY[card.priority]||PRIORITY.medium).label}"></span>
                        <div class="kb-card-actions">
                          <button class="kb-card-btn kb-edit" data-id="${card.id}">${icon('pencil', 11)}</button>
                          <button class="kb-card-btn kb-del" data-id="${card.id}">${icon('trash', 11)}</button>
                        </div>
                      </div>
                      <div class="kb-card-title">${card.title}</div>
                      ${card.desc ? `<div class="kb-card-desc">${card.desc}</div>` : ''}
                      <div class="kb-card-foot">
                        ${card.assignee ? `<span class="kb-assignee">${card.assignee[0].toUpperCase()}</span>` : ''}
                        ${card.deadline ? `<span class="kb-deadline">${card.deadline}</span>` : ''}
                        <div class="kb-move-btns">
                          ${col.id !== 'backlog' ? `<button class="kb-mv kb-mv-left" data-id="${card.id}" data-col="${col.id}" title="← Назад">‹</button>` : ''}
                          ${col.id !== 'done' ? `<button class="kb-mv kb-mv-right" data-id="${card.id}" data-col="${col.id}" title="→ Вперед">›</button>` : ''}
                        </div>
                      </div>
                    </div>
                  `).join('') : `<div class="kb-col-empty">Перетягніть картку сюди</div>`}
                </div>
              </div>
            `
          }).join('')}
        </div>
      </div>

      <!-- Modal -->
      <div class="kb-overlay" id="kb-modal" style="display:none">
        <div class="kb-modal">
          <div class="kb-modal-head">
            <h2 id="kb-modal-title">Нова картка</h2>
            <button id="kb-modal-close">${icon('x', 14)}</button>
          </div>
          <div class="kb-modal-body">
            <div class="kb-field">
              <label>Назва *</label>
              <input id="kb-f-title" type="text" placeholder="Що треба зробити..." class="kb-input">
            </div>
            <div class="kb-field">
              <label>Опис</label>
              <textarea id="kb-f-desc" class="kb-input kb-textarea" rows="3" placeholder="Деталі..."></textarea>
            </div>
            <div class="kb-form-row">
              <div class="kb-field">
                <label>Колонка</label>
                <select id="kb-f-col" class="kb-input">
                  ${COLUMNS.map(c => `<option value="${c.id}">${c.label}</option>`).join('')}
                </select>
              </div>
              <div class="kb-field">
                <label>Пріоритет</label>
                <select id="kb-f-priority" class="kb-input">
                  ${Object.entries(PRIORITY).map(([k,v]) => `<option value="${k}">${v.label}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="kb-form-row">
              <div class="kb-field">
                <label>Виконавець</label>
                <input id="kb-f-assignee" type="text" placeholder="Ім'я..." class="kb-input">
              </div>
              <div class="kb-field">
                <label>Дедлайн</label>
                <input id="kb-f-deadline" type="date" class="kb-input">
              </div>
            </div>
          </div>
          <div class="kb-modal-foot">
            <button class="kb-btn-sec" id="kb-modal-cancel">Скасувати</button>
            <button class="kb-btn-pri" id="kb-modal-save">Зберегти</button>
          </div>
        </div>
      </div>
    `
    attachEvents()
  }

  function attachEvents() {
    container.querySelector('#kb-add').addEventListener('click', () => openModal())
    container.querySelector('#kb-modal-close').addEventListener('click', closeModal)
    container.querySelector('#kb-modal-cancel').addEventListener('click', closeModal)
    container.querySelector('#kb-overlay, #kb-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal() })
    container.querySelector('#kb-modal-save').addEventListener('click', saveCard)

    container.querySelectorAll('.kb-pill').forEach(b =>
      b.addEventListener('click', () => { filterPriority = b.dataset.p; rerender() })
    )
    container.querySelectorAll('.kb-edit').forEach(b =>
      b.addEventListener('click', e => { e.stopPropagation(); openModal(cards.find(c => c.id === b.dataset.id)) })
    )
    container.querySelectorAll('.kb-del').forEach(b =>
      b.addEventListener('click', async e => {
        e.stopPropagation()
        if (!confirm('Видалити картку?')) return
        await deleteDoc(doc(db, ...base, 'kanban', b.dataset.id))
        await load()
      })
    )
    container.querySelectorAll('.kb-mv-right').forEach(b =>
      b.addEventListener('click', async e => {
        e.stopPropagation()
        const idx = COLUMNS.findIndex(c => c.id === b.dataset.col)
        if (idx < COLUMNS.length - 1) {
          await updateDoc(doc(db, ...base, 'kanban', b.dataset.id), { column: COLUMNS[idx + 1].id })
          await load()
        }
      })
    )
    container.querySelectorAll('.kb-mv-left').forEach(b =>
      b.addEventListener('click', async e => {
        e.stopPropagation()
        const idx = COLUMNS.findIndex(c => c.id === b.dataset.col)
        if (idx > 0) {
          await updateDoc(doc(db, ...base, 'kanban', b.dataset.id), { column: COLUMNS[idx - 1].id })
          await load()
        }
      })
    )
  }

  function openModal(card = null) {
    editCard = card
    container.querySelector('#kb-modal-title').textContent = card ? 'Редагувати картку' : 'Нова картка'
    container.querySelector('#kb-f-title').value    = card?.title    || ''
    container.querySelector('#kb-f-desc').value     = card?.desc     || ''
    container.querySelector('#kb-f-col').value      = card?.column   || 'todo'
    container.querySelector('#kb-f-priority').value = card?.priority || 'medium'
    container.querySelector('#kb-f-assignee').value = card?.assignee || ''
    container.querySelector('#kb-f-deadline').value = card?.deadline || ''
    container.querySelector('#kb-modal').style.display = 'flex'
    setTimeout(() => container.querySelector('#kb-f-title').focus(), 50)
  }

  function closeModal() {
    container.querySelector('#kb-modal').style.display = 'none'
    editCard = null
  }

  async function saveCard() {
    const title = container.querySelector('#kb-f-title').value.trim()
    if (!title) { container.querySelector('#kb-f-title').focus(); return }
    const data = {
      title,
      desc:     container.querySelector('#kb-f-desc').value.trim() || null,
      column:   container.querySelector('#kb-f-col').value,
      priority: container.querySelector('#kb-f-priority').value,
      assignee: container.querySelector('#kb-f-assignee').value.trim() || null,
      deadline: container.querySelector('#kb-f-deadline').value || null,
    }
    const btn = container.querySelector('#kb-modal-save')
    btn.disabled = true; btn.textContent = '...'
    try {
      if (editCard) {
        await updateDoc(doc(db, ...base, 'kanban', editCard.id), { ...data, updatedAt: serverTimestamp() })
      } else {
        await addDoc(collection(db, ...base, 'kanban'), { ...data, createdAt: serverTimestamp() })
      }
      closeModal(); await load()
    } finally { btn.disabled = false; btn.textContent = 'Зберегти' }
  }

  await load()
}

function injectStyles() {
  document.getElementById('kb-styles')?.remove()
  const s = document.createElement('style')
  s.id = 'kb-styles'
  s.textContent = `
    .kb-page { padding:28px 32px; height:100%; display:flex; flex-direction:column; overflow:hidden; box-sizing:border-box; }
    .kb-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; gap:16px; flex-wrap:wrap; flex-shrink:0; }
    .kb-title { font-family:var(--font-display); font-size:24px; font-weight:800; margin-bottom:4px; }
    .kb-subtitle { font-size:13px; color:var(--text-muted); }
    .kb-header-right { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
    .kb-filter-pills { display:flex; gap:5px; }
    .kb-pill { padding:5px 12px; border-radius:var(--radius-full); font-size:12px; font-weight:600; color:var(--text-secondary); background:var(--bg-secondary); border:1px solid var(--border); cursor:pointer; transition:all .15s; }
    .kb-pill.active { background:var(--accent-blue); border-color:var(--accent-blue); color:#fff; }
    .kb-add-btn { padding:8px 18px; background:linear-gradient(135deg,#667eea,#4F8EF7); color:#fff; border:none; border-radius:var(--radius-md); font-size:13px; font-weight:700; cursor:pointer; transition:all .15s; }
    .kb-add-btn:hover { transform:translateY(-1px); box-shadow:0 4px 14px rgba(79,142,247,.4); }

    .kb-board { display:flex; gap:14px; overflow-x:auto; flex:1; padding-bottom:16px; }
    .kb-col { min-width:240px; width:240px; flex-shrink:0; display:flex; flex-direction:column; }
    .kb-col-head { display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:var(--bg-secondary); border-radius:var(--radius-lg) var(--radius-lg) 0 0; font-size:13px; font-weight:700; border:1px solid var(--border); border-bottom:none; }
    .kb-col-count { font-size:11px; font-weight:800; padding:2px 8px; border-radius:var(--radius-full); }
    .kb-col-body { flex:1; background:var(--bg-secondary); border:1px solid var(--border); border-top:none; border-radius:0 0 var(--radius-lg) var(--radius-lg); padding:8px; display:flex; flex-direction:column; gap:8px; overflow-y:auto; min-height:120px; }
    .kb-col-empty { text-align:center; color:var(--text-muted); font-size:12px; padding:20px 8px; border:2px dashed var(--border); border-radius:var(--radius-md); margin:4px 0; }

    .kb-card { background:var(--bg-primary); border:1px solid var(--border); border-radius:var(--radius-md); padding:12px; cursor:pointer; transition:all .15s; }
    .kb-card:hover { border-color:var(--accent-blue); box-shadow:0 4px 12px rgba(0,0,0,.2); transform:translateY(-1px); }
    .kb-card-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
    .kb-priority-dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; }
    .kb-card-actions { display:flex; gap:3px; opacity:0; transition:opacity .15s; }
    .kb-card:hover .kb-card-actions { opacity:1; }
    .kb-card-btn { width:22px; height:22px; border-radius:4px; background:var(--bg-secondary); border:none; cursor:pointer; font-size:11px; display:flex; align-items:center; justify-content:center; }
    .kb-card-title { font-size:13px; font-weight:600; line-height:1.4; margin-bottom:4px; }
    .kb-card-desc { font-size:11px; color:var(--text-secondary); line-height:1.5; margin-bottom:8px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
    .kb-card-foot { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
    .kb-assignee { width:22px; height:22px; border-radius:50%; background:linear-gradient(135deg,#667eea,#764ba2); color:#fff; font-size:10px; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .kb-deadline { font-size:10px; color:var(--text-muted); flex:1; }
    .kb-move-btns { display:flex; gap:3px; margin-left:auto; }
    .kb-mv { width:22px; height:22px; border-radius:4px; background:var(--bg-tertiary); border:1px solid var(--border); cursor:pointer; font-size:14px; font-weight:700; color:var(--text-secondary); display:flex; align-items:center; justify-content:center; transition:all .15s; }
    .kb-mv:hover { background:var(--accent-blue); color:#fff; border-color:var(--accent-blue); }

    .kb-overlay { position:fixed; inset:0; background:rgba(0,0,0,.6); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; z-index:1000; }
    .kb-modal { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-xl); width:480px; max-width:95vw; box-shadow:0 24px 64px rgba(0,0,0,.4); animation:kb-in .18s ease; display:flex; flex-direction:column; }
    @keyframes kb-in { from{opacity:0;transform:scale(.95)} to{opacity:1;transform:scale(1)} }
    .kb-modal-head { display:flex; justify-content:space-between; align-items:center; padding:20px 22px 0; }
    .kb-modal-head h2 { font-family:var(--font-display); font-size:18px; font-weight:800; }
    .kb-modal-head button { background:none; border:none; font-size:16px; color:var(--text-muted); cursor:pointer; padding:4px 8px; border-radius:6px; }
    .kb-modal-head button:hover { background:var(--bg-tertiary); color:var(--text-primary); }
    .kb-modal-body { padding:18px 22px; display:flex; flex-direction:column; gap:14px; }
    .kb-modal-foot { padding:14px 22px; border-top:1px solid var(--border); display:flex; gap:8px; justify-content:flex-end; }
    .kb-field label { display:block; font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.05em; margin-bottom:6px; }
    .kb-input { width:100%; box-sizing:border-box; padding:9px 13px; background:var(--bg-tertiary); border:1.5px solid var(--border); border-radius:var(--radius-md); font-size:13px; color:var(--text-primary); outline:none; font-family:inherit; transition:border-color .15s; }
    .kb-input:focus { border-color:var(--accent-blue); }
    .kb-textarea { resize:vertical; min-height:72px; }
    .kb-form-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .kb-btn-pri { padding:9px 20px; background:linear-gradient(135deg,#667eea,#4F8EF7); color:#fff; border:none; border-radius:var(--radius-md); font-size:13px; font-weight:700; cursor:pointer; }
    .kb-btn-sec { padding:9px 20px; background:var(--bg-tertiary); border:1.5px solid var(--border); color:var(--text-primary); border-radius:var(--radius-md); font-size:13px; font-weight:600; cursor:pointer; }
  `
  document.head.appendChild(s)
}
