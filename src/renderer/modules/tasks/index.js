// src/renderer/modules/tasks/index.js
import { db } from '../../services/firebase.js'
import { getCurrentUser } from '../../services/auth.js'
import {
  collection, addDoc, getDocs, deleteDoc,
  doc, updateDoc, query, orderBy, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

export async function render(container) {
  injectStyles()

  container.innerHTML = `
    <div class="tasks-page">

      <!-- Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">✅ Задачі</h1>
          <p class="page-subtitle" id="tasks-count">Завантаження...</p>
        </div>
        <button class="btn btn-primary" id="add-task-btn">+ Нова задача</button>
      </div>

      <!-- Filters -->
      <div class="filter-tabs" id="filter-tabs">
        <button class="filter-tab active" data-filter="all">Всі</button>
        <button class="filter-tab" data-filter="todo">До виконання</button>
        <button class="filter-tab" data-filter="in-progress">В процесі</button>
        <button class="filter-tab" data-filter="done">Виконані</button>
      </div>

      <!-- List -->
      <div id="tasks-list" class="tasks-list">
        <div class="tasks-loading"><div class="spinner"></div></div>
      </div>

    </div>

    <!-- Modal -->
    <div class="modal-overlay" id="modal" style="display:none">
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title" id="modal-title">Нова задача</h2>
          <button class="modal-close" id="modal-close">✕</button>
        </div>
        <form class="modal-form" id="task-form" novalidate>
          <div class="modal-body">

            <div class="field">
              <label>Назва *</label>
              <input id="f-title" type="text" class="input" placeholder="Що потрібно зробити?" />
              <span class="field-error" id="e-title"></span>
            </div>

            <div class="field">
              <label>Опис</label>
              <textarea id="f-desc" class="input" rows="3" placeholder="Деталі задачі..." style="resize:vertical"></textarea>
            </div>

            <div class="form-row">
              <div class="field">
                <label>Пріоритет</label>
                <select id="f-priority" class="input">
                  <option value="medium">Середній</option>
                  <option value="high">Високий 🔴</option>
                  <option value="low">Низький 🟢</option>
                </select>
              </div>
              <div class="field">
                <label>Термін виконання</label>
                <input id="f-due" type="date" class="input" />
              </div>
            </div>

            <div class="field">
              <label>Статус</label>
              <select id="f-status" class="input">
                <option value="todo">До виконання</option>
                <option value="in-progress">В процесі</option>
                <option value="done">Виконано</option>
              </select>
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

  let tasks     = []
  let editingId = null
  let filter    = 'all'
  const user    = getCurrentUser()

  // ── Load ──────────────────────────────────────────────────
  async function loadTasks() {
    try {
      const q    = query(collection(db, 'users', user.uid, 'tasks'), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      tasks      = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      renderList()
      updateCount()
    } catch (err) {
      console.error(err)
      container.querySelector('#tasks-list').innerHTML = `
        <div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-title">Помилка завантаження</div></div>
      `
    }
  }

  // ── Render ────────────────────────────────────────────────
  function renderList() {
    const el       = container.querySelector('#tasks-list')
    const filtered = filter === 'all' ? tasks : tasks.filter(t => t.status === filter)

    if (filtered.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">✅</div>
          <div class="empty-title">${filter === 'done' ? 'Ще немає виконаних задач' : 'Задач немає'}</div>
          <div class="empty-desc">Натисніть "+ Нова задача" щоб додати</div>
        </div>
      `
      return
    }

    el.innerHTML = `
      <div class="tasks-grid">
        ${filtered.map(t => `
          <div class="task-card ${t.status === 'done' ? 'task-done' : ''}" data-id="${t.id}">
            <div class="task-check">
              <button class="check-btn ${t.status === 'done' ? 'checked' : ''}" data-id="${t.id}" title="Позначити виконаною">
                ${t.status === 'done' ? '✓' : ''}
              </button>
            </div>
            <div class="task-body">
              <div class="task-title">${t.title}</div>
              ${t.description ? `<div class="task-desc">${t.description}</div>` : ''}
              <div class="task-meta">
                <span class="task-priority priority-${t.priority || 'medium'}">${getPriorityLabel(t.priority)}</span>
                <span class="task-status status-${t.status || 'todo'}">${getStatusLabel(t.status)}</span>
                ${t.dueDate ? `<span class="task-due ${isOverdue(t) ? 'overdue' : ''}">📅 ${formatDate(t.dueDate)}</span>` : ''}
              </div>
            </div>
            <div class="task-actions">
              <button class="client-btn edit-btn" data-id="${t.id}" title="Редагувати">✏️</button>
              <button class="client-btn delete-btn" data-id="${t.id}" title="Видалити">🗑</button>
            </div>
          </div>
        `).join('')}
      </div>
    `

    el.querySelectorAll('.check-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const task = tasks.find(t => t.id === btn.dataset.id)
        if (!task) return
        const newStatus = task.status === 'done' ? 'todo' : 'done'
        await updateDoc(doc(db, 'users', user.uid, 'tasks', task.id), { status: newStatus })
        await loadTasks()
      })
    })

    el.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        openModal(tasks.find(t => t.id === btn.dataset.id))
      })
    })

    el.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        if (!confirm('Видалити задачу?')) return
        await deleteDoc(doc(db, 'users', user.uid, 'tasks', btn.dataset.id))
        await loadTasks()
      })
    })
  }

  // ── Filter tabs ───────────────────────────────────────────
  container.querySelector('#filter-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.filter-tab')
    if (!tab) return
    container.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'))
    tab.classList.add('active')
    filter = tab.dataset.filter
    renderList()
  })

  // ── Modal ─────────────────────────────────────────────────
  function openModal(task = null) {
    editingId = task?.id || null
    container.querySelector('#modal-title').textContent = task ? 'Редагувати задачу' : 'Нова задача'
    container.querySelector('#f-title').value    = task?.title       || ''
    container.querySelector('#f-desc').value     = task?.description || ''
    container.querySelector('#f-priority').value = task?.priority    || 'medium'
    container.querySelector('#f-status').value   = task?.status      || 'todo'
    container.querySelector('#f-due').value      = task?.dueDate     || ''
    container.querySelector('#e-title').textContent = ''
    container.querySelector('#modal').style.display = 'flex'
    setTimeout(() => container.querySelector('#f-title').focus(), 100)
  }

  function closeModal() {
    container.querySelector('#modal').style.display = 'none'
    editingId = null
  }

  container.querySelector('#add-task-btn').addEventListener('click', () => openModal())
  container.querySelector('#modal-close').addEventListener('click', closeModal)
  container.querySelector('#modal-cancel').addEventListener('click', closeModal)
  container.querySelector('#modal').addEventListener('click', (e) => {
    if (e.target === container.querySelector('#modal')) closeModal()
  })

  // ── Save ──────────────────────────────────────────────────
  container.querySelector('#task-form').addEventListener('submit', async (e) => {
    e.preventDefault()

    const title = container.querySelector('#f-title').value.trim()
    if (!title) {
      container.querySelector('#e-title').textContent = 'Введіть назву задачі'
      return
    }

    const btn = container.querySelector('#modal-submit')
    btn.disabled = true
    btn.innerHTML = '<div class="spinner"></div>'

    const data = {
      title,
      description: container.querySelector('#f-desc').value.trim()     || null,
      priority:    container.querySelector('#f-priority').value,
      status:      container.querySelector('#f-status').value,
      dueDate:     container.querySelector('#f-due').value              || null,
    }

    try {
      if (editingId) {
        await updateDoc(doc(db, 'users', user.uid, 'tasks', editingId), {
          ...data, updatedAt: serverTimestamp()
        })
      } else {
        await addDoc(collection(db, 'users', user.uid, 'tasks'), {
          ...data, createdAt: serverTimestamp()
        })
      }
      closeModal()
      await loadTasks()
    } catch (err) {
      console.error(err)
    } finally {
      btn.disabled = false
      btn.innerHTML = 'Зберегти'
    }
  })

  await loadTasks()

  // ── Helpers ───────────────────────────────────────────────
  function updateCount() {
    const done  = tasks.filter(t => t.status === 'done').length
    const total = tasks.length
    container.querySelector('#tasks-count').textContent =
      total === 0 ? 'Задач немає' : `${done} з ${total} виконано`
  }

  function getPriorityLabel(p) {
    return { high: '🔴 Високий', medium: '🟡 Середній', low: '🟢 Низький' }[p] || '🟡 Середній'
  }

  function getStatusLabel(s) {
    return { todo: 'До виконання', 'in-progress': 'В процесі', done: 'Виконано' }[s] || 'До виконання'
  }

  function isOverdue(task) {
    if (!task.dueDate || task.status === 'done') return false
    return new Date(task.dueDate) < new Date()
  }

  function formatDate(dateStr) {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }
}

// ── Styles ────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('tasks-styles')) return
  const style = document.createElement('style')
  style.id = 'tasks-styles'
  style.textContent = `
    .tasks-page { padding: 32px 36px; max-width: 900px; }

    .page-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:24px; }
    .page-title  { font-family:var(--font-display); font-size:26px; font-weight:700; letter-spacing:-0.02em; margin-bottom:4px; }
    .page-subtitle { font-size:13px; color:var(--text-secondary); }

    .filter-tabs { display:flex; gap:8px; margin-bottom:20px; }
    .filter-tab  { padding:7px 16px; border-radius:var(--radius-full); font-size:13px; font-weight:600; color:var(--text-secondary); background:var(--bg-secondary); border:1px solid var(--border); cursor:pointer; transition:all .2s; }
    .filter-tab:hover { border-color:var(--accent-blue); color:var(--text-primary); }
    .filter-tab.active { background:var(--accent-blue); border-color:var(--accent-blue); color:#fff; }

    .tasks-loading { display:flex; justify-content:center; padding:60px; }
    .tasks-grid { display:flex; flex-direction:column; gap:10px; }

    .task-card { display:flex; align-items:flex-start; gap:14px; background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-md); padding:16px 18px; transition:all .2s; }
    .task-card:hover { border-color:rgba(255,255,255,0.12); transform:translateY(-1px); box-shadow:var(--shadow-sm); }
    .task-card.task-done { opacity:0.6; }
    .task-card.task-done .task-title { text-decoration:line-through; color:var(--text-muted); }

    .task-check { padding-top:2px; flex-shrink:0; }
    .check-btn { width:22px; height:22px; border-radius:6px; border:2px solid var(--border); display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:700; color:#fff; transition:all .2s; cursor:pointer; }
    .check-btn:hover { border-color:var(--accent-blue); background:var(--accent-blue-dim); }
    .check-btn.checked { background:var(--accent-blue); border-color:var(--accent-blue); }

    .task-body { flex:1; min-width:0; }
    .task-title { font-weight:600; font-size:15px; margin-bottom:4px; }
    .task-desc  { font-size:13px; color:var(--text-secondary); margin-bottom:8px; }
    .task-meta  { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }

    .task-priority, .task-status { font-size:11px; font-weight:700; padding:3px 8px; border-radius:var(--radius-full); }
    .priority-high   { background:rgba(239,68,68,0.15);   color:#EF4444; }
    .priority-medium { background:rgba(245,158,11,0.15);  color:#F59E0B; }
    .priority-low    { background:rgba(52,211,153,0.15);  color:#34D399; }
    .status-todo        { background:rgba(156,163,175,0.15); color:#9CA3AF; }
    .status-in-progress { background:rgba(79,142,247,0.15);  color:#4F8EF7; }
    .status-done        { background:rgba(52,211,153,0.15);  color:#34D399; }
    .task-due     { font-size:12px; color:var(--text-secondary); }
    .task-due.overdue { color:#EF4444; font-weight:600; }

    .task-actions { display:flex; gap:6px; opacity:0; transition:opacity .2s; }
    .task-card:hover .task-actions { opacity:1; }
    .client-btn  { width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:15px; transition:background .2s; cursor:pointer; }
    .edit-btn:hover   { background:var(--accent-blue-dim); }
    .delete-btn:hover { background:var(--accent-red-dim); }

    .empty-state { text-align:center; padding:80px 24px; }
    .empty-icon  { font-size:48px; margin-bottom:16px; }
    .empty-title { font-family:var(--font-display); font-size:18px; font-weight:600; margin-bottom:8px; }
    .empty-desc  { font-size:14px; color:var(--text-muted); }

    .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.6); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; z-index:1000; padding:24px; }
    .modal { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-xl); width:100%; max-width:520px; box-shadow:var(--shadow-xl); animation:scaleIn .2s cubic-bezier(0.34,1.2,0.64,1); }
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
