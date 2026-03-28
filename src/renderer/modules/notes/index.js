// src/renderer/modules/notes/index.js
import { db } from '../../services/firebase.js'
import { getCurrentUser } from '../../services/auth.js'
import {
  collection, addDoc, getDocs, deleteDoc,
  doc, updateDoc, query, orderBy, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

const NOTE_COLORS = [
  { id: 'default', bg: 'var(--bg-secondary)', label: 'Звичайна' },
  { id: 'yellow',  bg: '#2D2A0F',             label: 'Жовта'   },
  { id: 'green',   bg: '#0F2D1A',             label: 'Зелена'  },
  { id: 'blue',    bg: '#0F1D2D',             label: 'Синя'    },
  { id: 'purple',  bg: '#1D0F2D',             label: 'Фіолетова'},
  { id: 'red',     bg: '#2D0F0F',             label: 'Червона' },
]
const COLOR_ACCENTS = {
  default: 'var(--border)',
  yellow:  '#F59E0B',
  green:   '#34D399',
  blue:    '#4F8EF7',
  purple:  '#A78BFA',
  red:     '#F87171',
}

export async function render(container) {
  injectStyles()

  container.innerHTML = `
    <div class="notes-page">

      <!-- Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">📝 Нотатки</h1>
          <p class="page-subtitle" id="notes-count">Завантаження...</p>
        </div>
        <button class="btn btn-primary" id="add-note-btn">+ Нова нотатка</button>
      </div>

      <!-- Search -->
      <div class="search-bar">
        <span class="search-icon">🔍</span>
        <input type="text" class="search-input" id="search-input" placeholder="Пошук за назвою або текстом..." />
      </div>

      <!-- Grid -->
      <div id="notes-grid" class="notes-grid">
        <div class="tasks-loading"><div class="spinner"></div></div>
      </div>

    </div>

    <!-- Modal -->
    <div class="modal-overlay" id="modal" style="display:none">
      <div class="modal notes-modal">
        <div class="modal-header">
          <h2 class="modal-title" id="modal-title">Нова нотатка</h2>
          <button class="modal-close" id="modal-close">✕</button>
        </div>
        <form class="modal-form" id="note-form" novalidate>
          <div class="modal-body">

            <div class="field">
              <label>Заголовок *</label>
              <input id="f-title" type="text" class="input" placeholder="Назва нотатки..." />
              <span class="field-error" id="e-title"></span>
            </div>

            <div class="field">
              <label>Текст нотатки</label>
              <textarea id="f-content" class="input" rows="8" placeholder="Напишіть щось..." style="resize:vertical"></textarea>
            </div>

            <div class="field">
              <label>Колір</label>
              <div class="color-picker" id="color-picker">
                ${NOTE_COLORS.map(c => `
                  <button type="button" class="color-dot ${c.id === 'default' ? 'selected' : ''}"
                    data-color="${c.id}" title="${c.label}"
                    style="background:${COLOR_ACCENTS[c.id]}">
                  </button>
                `).join('')}
              </div>
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

  let notes        = []
  let editingId    = null
  let selectedColor = 'default'
  const user       = getCurrentUser()

  // ── Load ──────────────────────────────────────────────────
  async function loadNotes() {
    try {
      const q    = query(collection(db, 'users', user.uid, 'notes'), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      notes      = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      renderGrid(notes)
      const n = notes.length
      container.querySelector('#notes-count').textContent =
        n === 0 ? 'Нотаток немає' : `${n} ${n === 1 ? 'нотатка' : n < 5 ? 'нотатки' : 'нотаток'}`
    } catch (err) {
      console.error(err)
      container.querySelector('#notes-grid').innerHTML = `
        <div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-title">Помилка завантаження</div></div>
      `
    }
  }

  // ── Render grid ───────────────────────────────────────────
  function renderGrid(list) {
    const el = container.querySelector('#notes-grid')
    if (list.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📝</div>
          <div class="empty-title">Нотаток ще немає</div>
          <div class="empty-desc">Натисніть "+ Нова нотатка" щоб створити першу</div>
        </div>
      `
      return
    }

    el.innerHTML = `
      <div class="notes-masonry">
        ${list.map(n => {
          const color  = n.color || 'default'
          const bg     = NOTE_COLORS.find(c => c.id === color)?.bg || NOTE_COLORS[0].bg
          const accent = COLOR_ACCENTS[color] || COLOR_ACCENTS.default
          const preview = (n.content || '').slice(0, 200)
          const date    = n.updatedAt?.toDate?.() || n.createdAt?.toDate?.() || new Date()
          return `
            <div class="note-card" data-id="${n.id}" style="background:${bg};border-color:${accent}">
              <div class="note-card-header">
                <div class="note-card-title">${n.title}</div>
                <div class="note-card-actions">
                  <button class="icon-btn edit-btn" data-id="${n.id}" title="Редагувати">✏️</button>
                  <button class="icon-btn delete-btn" data-id="${n.id}" title="Видалити">🗑</button>
                </div>
              </div>
              ${preview ? `<div class="note-card-content">${preview}${n.content?.length > 200 ? '...' : ''}</div>` : ''}
              <div class="note-card-footer">
                ${formatDate(date)}
              </div>
            </div>
          `
        }).join('')}
      </div>
    `

    el.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        openModal(notes.find(n => n.id === btn.dataset.id))
      })
    })

    el.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        if (!confirm('Видалити нотатку?')) return
        await deleteDoc(doc(db, 'users', user.uid, 'notes', btn.dataset.id))
        await loadNotes()
      })
    })
  }

  // ── Search ────────────────────────────────────────────────
  container.querySelector('#search-input').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim()
    if (!q) { renderGrid(notes); return }
    renderGrid(notes.filter(n =>
      n.title?.toLowerCase().includes(q) || n.content?.toLowerCase().includes(q)
    ))
  })

  // ── Color picker ──────────────────────────────────────────
  container.querySelector('#color-picker').addEventListener('click', (e) => {
    const btn = e.target.closest('.color-dot')
    if (!btn) return
    container.querySelectorAll('.color-dot').forEach(b => b.classList.remove('selected'))
    btn.classList.add('selected')
    selectedColor = btn.dataset.color
  })

  // ── Modal ─────────────────────────────────────────────────
  function openModal(note = null) {
    editingId     = note?.id || null
    selectedColor = note?.color || 'default'
    container.querySelector('#modal-title').textContent = note ? 'Редагувати нотатку' : 'Нова нотатка'
    container.querySelector('#f-title').value   = note?.title   || ''
    container.querySelector('#f-content').value = note?.content || ''
    container.querySelector('#e-title').textContent = ''

    container.querySelectorAll('.color-dot').forEach(b => {
      b.classList.toggle('selected', b.dataset.color === selectedColor)
    })

    container.querySelector('#modal').style.display = 'flex'
    setTimeout(() => container.querySelector('#f-title').focus(), 100)
  }

  function closeModal() {
    container.querySelector('#modal').style.display = 'none'
    editingId     = null
    selectedColor = 'default'
  }

  container.querySelector('#add-note-btn').addEventListener('click', () => openModal())
  container.querySelector('#modal-close').addEventListener('click', closeModal)
  container.querySelector('#modal-cancel').addEventListener('click', closeModal)
  container.querySelector('#modal').addEventListener('click', (e) => {
    if (e.target === container.querySelector('#modal')) closeModal()
  })

  // ── Save ──────────────────────────────────────────────────
  container.querySelector('#note-form').addEventListener('submit', async (e) => {
    e.preventDefault()

    const title = container.querySelector('#f-title').value.trim()
    if (!title) {
      container.querySelector('#e-title').textContent = 'Введіть заголовок нотатки'
      return
    }

    const btn = container.querySelector('#modal-submit')
    btn.disabled = true
    btn.innerHTML = '<div class="spinner"></div>'

    const data = {
      title,
      content: container.querySelector('#f-content').value.trim() || '',
      color:   selectedColor,
    }

    try {
      if (editingId) {
        await updateDoc(doc(db, 'users', user.uid, 'notes', editingId), {
          ...data, updatedAt: serverTimestamp()
        })
      } else {
        await addDoc(collection(db, 'users', user.uid, 'notes'), {
          ...data, createdAt: serverTimestamp()
        })
      }
      closeModal()
      await loadNotes()
    } catch (err) {
      console.error(err)
    } finally {
      btn.disabled = false
      btn.innerHTML = 'Зберегти'
    }
  })

  await loadNotes()

  // ── Helpers ───────────────────────────────────────────────
  function formatDate(date) {
    return date.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }
}

// ── Styles ────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('notes-styles')) return
  const style = document.createElement('style')
  style.id = 'notes-styles'
  style.textContent = `
    .notes-page { padding: 32px 36px; max-width: 1200px; }

    .page-header   { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:24px; }
    .page-title    { font-family:var(--font-display); font-size:26px; font-weight:700; letter-spacing:-0.02em; margin-bottom:4px; }
    .page-subtitle { font-size:13px; color:var(--text-secondary); }

    .search-bar { display:flex; align-items:center; gap:10px; background:var(--bg-secondary); border:1.5px solid var(--border); border-radius:var(--radius-sm); padding:10px 14px; margin-bottom:20px; transition:border-color .2s; }
    .search-bar:focus-within { border-color:var(--accent-blue); }
    .search-icon  { font-size:15px; flex-shrink:0; }
    .search-input { flex:1; background:none; font-size:14px; color:var(--text-primary); }
    .search-input::placeholder { color:var(--text-muted); }

    .tasks-loading { display:flex; justify-content:center; padding:60px; }

    .notes-masonry { columns: 3 280px; gap: 16px; }
    @media (max-width: 900px) { .notes-masonry { columns: 2 240px; } }
    @media (max-width: 600px) { .notes-masonry { columns: 1; } }

    .note-card { break-inside: avoid; border:1px solid; border-radius:var(--radius-lg); padding:18px; margin-bottom:16px; transition:all .2s; cursor:default; }
    .note-card:hover { transform:translateY(-2px); box-shadow:var(--shadow-md); }

    .note-card-header  { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; margin-bottom:10px; }
    .note-card-title   { font-weight:700; font-size:15px; line-height:1.3; word-break:break-word; }
    .note-card-actions { display:flex; gap:4px; opacity:0; transition:opacity .2s; flex-shrink:0; }
    .note-card:hover .note-card-actions { opacity:1; }
    .icon-btn { width:28px; height:28px; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:14px; cursor:pointer; transition:background .2s; }
    .icon-btn:hover { background:rgba(255,255,255,0.08); }

    .note-card-content { font-size:13px; color:var(--text-secondary); line-height:1.6; white-space:pre-wrap; word-break:break-word; margin-bottom:12px; }
    .note-card-footer  { font-size:11px; color:var(--text-muted); }

    .empty-state { text-align:center; padding:80px 24px; grid-column:1/-1; }
    .empty-icon  { font-size:48px; margin-bottom:16px; }
    .empty-title { font-family:var(--font-display); font-size:18px; font-weight:600; margin-bottom:8px; }
    .empty-desc  { font-size:14px; color:var(--text-muted); }

    .color-picker { display:flex; gap:10px; flex-wrap:wrap; }
    .color-dot { width:28px; height:28px; border-radius:50%; border:3px solid transparent; cursor:pointer; transition:all .2s; }
    .color-dot.selected { border-color:#fff; transform:scale(1.2); }
    .color-dot:hover { transform:scale(1.1); }

    .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.6); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; z-index:1000; padding:24px; }
    .notes-modal   { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-xl); width:100%; max-width:600px; box-shadow:var(--shadow-xl); animation:scaleIn .2s cubic-bezier(0.34,1.2,0.64,1); }
    .modal-header  { display:flex; align-items:center; justify-content:space-between; padding:24px 24px 0; }
    .modal-title   { font-family:var(--font-display); font-size:20px; font-weight:700; }
    .modal-close   { width:32px; height:32px; border-radius:8px; color:var(--text-muted); font-size:16px; display:flex; align-items:center; justify-content:center; transition:all .2s; cursor:pointer; }
    .modal-close:hover { background:var(--accent-red-dim); color:var(--accent-red); }
    .modal-body    { padding:20px 24px; display:flex; flex-direction:column; gap:14px; }
    .modal-footer  { display:flex; gap:10px; justify-content:flex-end; padding:0 24px 24px; }
    .field label   { display:block; font-size:12px; font-weight:600; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:6px; }
    .field-error   { font-size:12px; color:#EF4444; margin-top:4px; display:block; }

    @keyframes scaleIn { from{opacity:0;transform:scale(0.95)} to{opacity:1;transform:scale(1)} }
  `
  document.head.appendChild(style)
}
