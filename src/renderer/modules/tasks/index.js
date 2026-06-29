// src/renderer/modules/tasks/index.js
import { db } from '../../services/firebase.js'
import { getCurrentUser, getActivePathSegments } from '../../services/auth.js'
import {
  collection, addDoc, getDocs, deleteDoc,
  doc, updateDoc, query, orderBy, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
import { uploadToCloudinary } from '../../services/cloudinary.js'
import { icon } from '../../utils/icons.js'
import { t } from '../../core/i18n.js'

export async function render(container) {
  injectStyles()

  container.innerHTML = `
    <div class="tk-layout">

      <!-- ══ Left ══ -->
      <div class="tk-left" id="tk-left">

        <div class="tk-header">
          <div>
            <h1 class="tk-title">${t('tasks.title')}</h1>
            <p class="tk-sub" id="tasks-count">${t('common.loading')}</p>
          </div>
          <button class="btn btn-primary" id="add-task-btn">${t('tasks.add')}</button>
        </div>

        <!-- Progress bar -->
        <div class="tk-progress-wrap" id="tk-progress-wrap" style="display:none">
          <div class="tk-progress-bar"><div class="tk-progress-fill" id="tk-progress-fill"></div></div>
          <span class="tk-progress-label" id="tk-progress-label"></span>
        </div>

        <!-- Filters -->
        <div class="tk-toolbar">
          <div class="tk-filters" id="filter-tabs">
            <button class="tk-filter active" data-filter="all">${t('tasks.all')}</button>
            <button class="tk-filter" data-filter="todo">${t('tasks.todo')}</button>
            <button class="tk-filter" data-filter="in_progress">${t('tasks.in_progress')}</button>
            <button class="tk-filter" data-filter="done">${t('tasks.done')}</button>
          </div>
          <div class="tk-priority-filter" id="tk-pri-filter">
            <button class="tk-pri-btn active" data-pri="all">${t('common.all')}</button>
            <button class="tk-pri-btn" data-pri="high"   style="--pc:#EF4444">${t('tasks.priority.high')}</button>
            <button class="tk-pri-btn" data-pri="medium" style="--pc:#F59E0B">${t('tasks.priority.medium')}</button>
            <button class="tk-pri-btn" data-pri="low"    style="--pc:#34D399">${t('tasks.priority.low')}</button>
          </div>
          <div class="tk-toolbar-row3">
            <select class="tk-proj-select" id="tk-proj-select" style="display:none">
              <option value="all">Всі проекти</option>
            </select>
            <div class="tk-view-toggle" id="tk-view-toggle">
              <button class="tk-view-btn active" data-view="list">${icon('tasks', 13)} Список</button>
              <button class="tk-view-btn" data-view="kanban">${icon('kanban', 13)} Kanban</button>
              <button class="tk-view-btn" data-view="calendar">${icon('calendar', 13)} Календар</button>
            </div>
          </div>
        </div>

        <div id="tasks-list">
          <div class="tk-loading"><div class="spinner"></div></div>
        </div>

      </div>

      <!-- ══ Right: task detail ══ -->
      <div class="tk-right" id="tk-right" style="display:none">
        <div id="tk-detail"></div>
      </div>

    </div>

    <!-- Modal -->
    <div class="modal-overlay" id="modal" style="display:none">
      <div class="modal" style="max-width:560px">
        <div class="modal-header">
          <h2 class="modal-title" id="modal-title">Нова задача</h2>
          <button class="modal-close" id="modal-close">${icon('x', 14)}</button>
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

            <div class="field" id="project-field">
              <label>Проект</label>
              <select id="f-project" class="input">
                <option value="">— Без проекту —</option>
              </select>
            </div>

            <div class="form-row">
              <div class="field">
                <label>Пріоритет</label>
                <select id="f-priority" class="input">
                  <option value="medium">Середній</option>
                  <option value="high">Високий</option>
                  <option value="low">Низький</option>
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
                <option value="in_progress">В процесі</option>
                <option value="done">Виконано</option>
              </select>
            </div>

            <div class="field" id="attach-zone-wrap">
              <label>Фото / файли</label>
              <div class="attach-zone" id="attach-zone">
                <input type="file" id="f-files" multiple accept="image/*,.pdf,.doc,.docx" style="display:none" />
                <button type="button" class="attach-btn" id="attach-pick-btn">Додати файли</button>
                <span class="attach-hint">або вставте <kbd>Ctrl+V</kbd></span>
              </div>
              <div class="attach-previews" id="attach-previews"></div>
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

  let tasks       = []
  let projects    = []
  let editingId   = null
  let editingTask = null
  let newFiles    = []
  let filter      = 'all'
  let priFilter   = 'all'
  let projFilter  = 'all'
  let selectedId  = null
  let viewMode    = 'list'
  const calCursor = new Date()
  const user      = getCurrentUser()
  const base      = getActivePathSegments(user.uid)

  // ── Load projects ─────────────────────────────────────────
  async function loadProjects() {
    try {
      const snap = await getDocs(collection(db, ...base, 'projects'))
      projects = snap.docs.map(d => ({ id: d.id, ...d.data() }))

      // Populate modal select
      const sel = container.querySelector('#f-project')
      projects.forEach(p => {
        const opt = document.createElement('option')
        opt.value = p.id
        opt.textContent = p.name
        sel.appendChild(opt)
      })
      if (projects.length === 0) {
        container.querySelector('#project-field').style.display = 'none'
      }

      // Build project filter dropdown
      if (projects.length > 0) {
        const select = container.querySelector('#tk-proj-select')
        select.style.display = ''
        select.innerHTML = `<option value="all">Всі проекти</option>` +
          projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('')
        select.addEventListener('change', () => {
          projFilter = select.value
          renderList()
          updateCount()
        })
      }
    } catch (_) {}
  }

  // ── Load tasks ────────────────────────────────────────────
  // Normalize legacy statuses from old data
  function normStatus(s) {
    if (s === 'in-progress' || s === 'in_progress') return 'in_progress'
    if (s === 'new') return 'todo'
    return s || 'todo'
  }

  async function loadTasks() {
    try {
      const q    = query(collection(db, ...base, 'tasks'), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      tasks      = snap.docs.map(d => { const d2 = d.data(); return { id: d.id, ...d2, status: normStatus(d2.status) } })
      renderList()
      updateCount()
    } catch (err) {
      console.error(err)
      container.querySelector('#tasks-list').innerHTML = `
        <div class="empty-state"><div class="empty-icon" style="color:var(--text-muted)">${icon('alert-triangle', 32)}</div><div class="empty-title">Помилка завантаження</div></div>
      `
    }
  }

    const PRI_META = {
    high:   { get label() { return t('tasks.priority.high') },   color: '#EF4444', bg: 'rgba(239,68,68,.12)'  },
    medium: { get label() { return t('tasks.priority.medium') }, color: '#F59E0B', bg: 'rgba(245,158,11,.12)' },
    low:    { get label() { return t('tasks.priority.low') },    color: '#34D399', bg: 'rgba(52,211,153,.12)' },
  }
  const ST_META = {
    'todo':        { get label() { return t('tasks.todo') },        color: '#6B7280', bg: 'rgba(107,114,128,.12)' },
    'in_progress': { get label() { return t('tasks.in_progress') }, color: '#4F8EF7', bg: 'rgba(79,142,247,.12)'  },
    'done':        { get label() { return t('tasks.done') },        color: '#34D399', bg: 'rgba(52,211,153,.12)'  },
  }

  // ── Render list ───────────────────────────────────────────
  const STATUS_ORDER   = { 'todo': 0, 'in_progress': 1, 'done': 2 }
  const PRIORITY_ORDER = { 'high': 0, 'medium': 1, 'low': 2 }

  function renderList() {
    const el = container.querySelector('#tasks-list')
    let list = filter === 'all' ? tasks : tasks.filter(t => t.status === filter)
    if (priFilter !== 'all') list = list.filter(t => (t.priority || 'medium') === priFilter)
    if (projFilter !== 'all') list = list.filter(t => t.projectId === projFilter)

    if (viewMode === 'calendar') { renderCalendar(el, list); return }
    if (viewMode === 'kanban')   { renderKanbanView(el, list); return }

    // Незакриті зверху, потім по пріоритету, потім по даті
    list = [...list].sort((a, b) => {
      const sDiff = (STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0)
      if (sDiff !== 0) return sDiff
      const pDiff = (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1)
      if (pDiff !== 0) return pDiff
      return (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)
    })

    if (list.length === 0) {
      el.innerHTML = `
        <div class="tk-empty">
          <div class="tk-empty-icon">${icon('tasks', 32)}</div>
          <div class="tk-empty-title">${filter === 'done' ? 'Ще немає виконаних задач' : 'Задач немає'}</div>
          <div class="tk-empty-desc">Натисніть "+ Нова задача" щоб додати</div>
        </div>`
      return
    }

    el.innerHTML = `<div class="tk-grid">${list.map(t => {
      const proj   = projects.find(p => p.id === t.projectId)
      const atts   = t.attachments || []
      const pri    = PRI_META[t.priority || 'medium']
      const st     = ST_META[t.status || 'todo']
      const over   = isOverdue(t)
      const done   = t.status === 'done'
      return `
        <div class="tk-card ${done ? 'tk-card-done' : ''} ${t.id === selectedId ? 'tk-card-selected' : ''}" data-id="${t.id}" style="--pri:${pri.color}">
          <div class="tk-card-stripe"></div>
          <div class="tk-card-body">
            <div class="tk-card-top">
              <button class="tk-check ${done ? 'done' : ''}" data-id="${t.id}" title="${done ? 'Відмінити' : 'Виконати'}">
                ${done ? icon('check', 11) : ''}
              </button>
              <div class="tk-card-actions">
                <button class="tk-icon-btn tk-edit"   data-id="${t.id}">${icon('pencil', 13)}</button>
                <button class="tk-icon-btn tk-delete" data-id="${t.id}">${icon('trash', 13)}</button>
              </div>
            </div>

            <div class="tk-card-title">${t.title}</div>
            ${proj ? `<div class="tk-card-proj">${icon('projects', 11)} ${proj.name}</div>` : ''}
            ${t.description ? `<div class="tk-card-desc">${t.description}</div>` : ''}

            ${atts.length ? `
              <div class="tk-attachments">
                ${atts.map(a => a.type === 'image'
                  ? `<img src="${a.url}" class="tk-thumb" title="${a.name}" />`
                  : `<a href="${a.url}" target="_blank" class="tk-file-chip">${icon('file', 11)} ${a.name}</a>`
                ).join('')}
              </div>` : ''}

            <div class="tk-card-footer">
              <span class="tk-badge" style="color:${pri.color};background:${pri.bg}">${pri.label}</span>
              <span class="tk-badge" style="color:${st.color};background:${st.bg}">${st.label}</span>
              ${t.dueDate ? `<span class="tk-due ${over ? 'overdue' : ''}">${formatDate(t.dueDate)}</span>` : ''}
            </div>
          </div>
        </div>`
    }).join('')}</div>`

    el.querySelectorAll('.tk-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('.tk-check') || e.target.closest('.tk-icon-btn')) return
        openDetail(card.dataset.id)
      })
    })

    el.querySelectorAll('.tk-check').forEach(btn => {
      btn.addEventListener('click', async () => {
        const task = tasks.find(t => t.id === btn.dataset.id)
        if (!task) return
        await updateDoc(doc(db, ...base, 'tasks', task.id), {
          status: task.status === 'done' ? 'todo' : 'done'
        })
        await loadTasks()
      })
    })

    el.querySelectorAll('.tk-edit').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation()
        openModal(tasks.find(t => t.id === btn.dataset.id))
      })
    })

    el.querySelectorAll('.tk-delete').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation()
        if (!confirm('Видалити задачу?')) return
        await deleteDoc(doc(db, ...base, 'tasks', btn.dataset.id))
        await loadTasks()
      })
    })
  }

  // ── Calendar view ─────────────────────────────────────────
  const WEEKDAYS_UK = ['Пн','Вт','Ср','Чт','Пт','Сб','Нд']
  const MONTHS_UK_FULL = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень']

  function renderCalendar(el, list) {
    const year  = calCursor.getFullYear()
    const month = calCursor.getMonth()
    const byDay = {}
    list.filter(t => t.dueDate).forEach(t => {
      (byDay[t.dueDate] ||= []).push(t)
    })

    const firstOfMonth = new Date(year, month, 1)
    const startOffset  = (firstOfMonth.getDay() + 6) % 7 // Monday = 0
    const daysInMonth   = new Date(year, month + 1, 0).getDate()
    const todayStr = new Date().toISOString().slice(0, 10)

    const cells = []
    for (let i = 0; i < startOffset; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(d)

    el.innerHTML = `
      <div class="tk-cal">
        <div class="tk-cal-head">
          <button class="tk-cal-nav" id="tk-cal-prev">${icon('chevron-left', 16)}</button>
          <span class="tk-cal-label">${MONTHS_UK_FULL[month]} ${year}</span>
          <button class="tk-cal-nav" id="tk-cal-next">${icon('chevron-right', 16)}</button>
        </div>
        <div class="tk-cal-grid">
          ${WEEKDAYS_UK.map(w => `<div class="tk-cal-wd">${w}</div>`).join('')}
          ${cells.map(d => {
            if (d === null) return `<div class="tk-cal-cell tk-cal-cell--empty"></div>`
            const dateStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
            const dayTasks = byDay[dateStr] || []
            return `
              <div class="tk-cal-cell ${dateStr === todayStr ? 'tk-cal-cell--today' : ''}">
                <div class="tk-cal-day">${d}</div>
                <div class="tk-cal-tasks">
                  ${dayTasks.slice(0, 3).map(t => {
                    const pri = PRI_META[t.priority || 'medium']
                    return `<div class="tk-cal-chip" data-id="${t.id}" style="--pc:${pri.color}" title="${t.title}">${t.title}</div>`
                  }).join('')}
                  ${dayTasks.length > 3 ? `<div class="tk-cal-more">+${dayTasks.length - 3}</div>` : ''}
                </div>
              </div>`
          }).join('')}
        </div>
      </div>
    `

    el.querySelector('#tk-cal-prev').addEventListener('click', () => { calCursor.setMonth(calCursor.getMonth() - 1); renderList() })
    el.querySelector('#tk-cal-next').addEventListener('click', () => { calCursor.setMonth(calCursor.getMonth() + 1); renderList() })
    el.querySelectorAll('.tk-cal-chip').forEach(chip => {
      chip.addEventListener('click', () => openDetail(chip.dataset.id))
    })
  }

  // ── Kanban view ────────────────────────────────────────────
  const KB_COLUMNS = [
    { id: 'todo',        label: 'До виконання', color: '#4F8EF7' },
    { id: 'in_progress', label: 'В процесі',    color: '#F59E0B' },
    { id: 'done',        label: 'Виконано',     color: '#34D399' },
  ]

  function renderKanbanView(el, list) {
    el.innerHTML = `
      <div class="tk-kb-board">
        ${KB_COLUMNS.map(col => {
          const colCards = list.filter(t => (t.status || 'todo') === col.id)
          return `
            <div class="tk-kb-col">
              <div class="tk-kb-col-head" style="border-top:3px solid ${col.color}">
                <span>${col.label}</span>
                <span class="tk-kb-col-count" style="background:${col.color}22;color:${col.color}">${colCards.length}</span>
              </div>
              <div class="tk-kb-col-body" data-col="${col.id}">
                ${colCards.length ? colCards.map(t => {
                  const pri  = PRI_META[t.priority || 'medium']
                  const proj = projects.find(p => p.id === t.projectId)
                  return `
                    <div class="tk-kb-card" draggable="true" data-id="${t.id}" style="--pri:${pri.color}">
                      <div class="tk-kb-card-top"><span class="tk-kb-pri-dot" style="background:${pri.color}"></span></div>
                      <div class="tk-kb-card-title">${t.title}</div>
                      ${proj ? `<div class="tk-kb-card-proj">${icon('projects', 10)} ${proj.name}</div>` : ''}
                      ${t.dueDate ? `<div class="tk-kb-card-due">${formatDate(t.dueDate)}</div>` : ''}
                    </div>`
                }).join('') : `<div class="tk-kb-col-empty">Перетягніть картку сюди</div>`}
                <button class="tk-kb-add-btn" data-col="${col.id}">${icon('plus', 12)} Додати картку</button>
              </div>
            </div>`
        }).join('')}
      </div>
    `

    el.querySelectorAll('.tk-kb-add-btn').forEach(btn => {
      btn.addEventListener('click', () => openModal(null, btn.dataset.col))
    })
    el.querySelectorAll('.tk-kb-card').forEach(card => {
      card.addEventListener('click', () => openDetail(card.dataset.id))
      card.addEventListener('dragstart', e => {
        card.classList.add('tk-kb-card--dragging')
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', card.dataset.id)
      })
      card.addEventListener('dragend', () => card.classList.remove('tk-kb-card--dragging'))
    })
    el.querySelectorAll('.tk-kb-col-body').forEach(colBody => {
      colBody.addEventListener('dragover', e => { e.preventDefault(); colBody.classList.add('tk-kb-col-body--over') })
      colBody.addEventListener('dragleave', () => colBody.classList.remove('tk-kb-col-body--over'))
      colBody.addEventListener('drop', async e => {
        e.preventDefault()
        colBody.classList.remove('tk-kb-col-body--over')
        const id = e.dataTransfer.getData('text/plain')
        const task = tasks.find(t => t.id === id)
        const newStatus = colBody.dataset.col
        if (!task || task.status === newStatus) return
        await updateDoc(doc(db, ...base, 'tasks', id), { status: newStatus, updatedAt: serverTimestamp() })
        await loadTasks()
      })
    })
  }

  // ── Detail panel ──────────────────────────────────────────
  function openDetail(id) {
    selectedId = id
    renderList()
    const task  = tasks.find(t => t.id === id)
    if (!task) return
    const right  = container.querySelector('#tk-right')
    const detEl  = container.querySelector('#tk-detail')
    right.style.display = 'flex'

    const pri    = PRI_META[task.priority || 'medium']
    const st     = ST_META[task.status || 'todo']
    const proj   = projects.find(p => p.id === task.projectId)
    const over   = isOverdue(task)
    const atts   = task.attachments || []
    const created = task.createdAt?.toDate?.()
    const updated = task.updatedAt?.toDate?.()

    detEl.innerHTML = `
      <div class="tkd-wrap">

        <div class="tkd-hd">
          <div class="tkd-stripe" style="background:${pri.color}"></div>
          <button class="tkd-close" id="tkd-close">${icon('x', 14)}</button>
        </div>

        <div class="tkd-body">

          <!-- Title + check -->
          <div class="tkd-top">
            <button class="tk-check ${task.status === 'done' ? 'done' : ''}" id="tkd-check" style="--pri:${pri.color}">
              ${task.status === 'done' ? icon('check', 14) : ''}
            </button>
            <h2 class="tkd-title ${task.status === 'done' ? 'tkd-done' : ''}">${task.title}</h2>
          </div>

          <!-- Badges -->
          <div class="tkd-badges">
            <span class="tk-badge" style="color:${pri.color};background:${pri.bg}">${pri.label}</span>
            <span class="tk-badge" style="color:${st.color};background:${st.bg}">${st.label}</span>
            ${over ? `<span class="tk-badge" style="color:#EF4444;background:rgba(239,68,68,.12)">Прострочено</span>` : ''}
          </div>

          <!-- Quick status change -->
          <div class="tkd-section">
            <div class="tkd-label">Змінити статус</div>
            <div class="tkd-status-row">
              ${Object.entries(ST_META).map(([key, s]) => `
                <button class="tkd-st-btn ${(task.status || 'todo') === key ? 'active' : ''}"
                  data-status="${key}"
                  style="--sc:${s.color};${(task.status || 'todo') === key ? `background:${s.bg};border-color:${s.color};color:${s.color}` : ''}">
                  ${s.label}
                </button>
              `).join('')}
            </div>
          </div>

          ${task.description ? `
          <div class="tkd-section">
            <div class="tkd-label">Опис</div>
            <div class="tkd-desc">${task.description}</div>
          </div>` : ''}

          <div class="tkd-section">
            <div class="tkd-label">Деталі</div>
            <div class="tkd-info-list">
              ${proj ? `<div class="tkd-info-row"><span class="tkd-info-icon">${icon('projects', 13)}</span><span class="tkd-info-key">Проект</span><span class="tkd-info-val">${proj.name}</span></div>` : ''}
              ${task.dueDate ? `<div class="tkd-info-row"><span class="tkd-info-icon">${over ? icon('alert-triangle', 13) : icon('tax-calendar', 13)}</span><span class="tkd-info-key">Дедлайн</span><span class="tkd-info-val ${over ? 'overdue' : ''}">${formatDate(task.dueDate)}</span></div>` : ''}
              ${created ? `<div class="tkd-info-row"><span class="tkd-info-icon">${icon('timer', 13)}</span><span class="tkd-info-key">Створено</span><span class="tkd-info-val">${created.toLocaleDateString('uk-UA', {day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span></div>` : ''}
              ${updated ? `<div class="tkd-info-row"><span class="tkd-info-icon">${icon('pencil', 13)}</span><span class="tkd-info-key">Оновлено</span><span class="tkd-info-val">${updated.toLocaleDateString('uk-UA', {day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span></div>` : ''}
            </div>
          </div>

          ${atts.length ? `
          <div class="tkd-section">
            <div class="tkd-label">Вкладення (${atts.length})</div>
            <div class="tkd-attachments">
              ${atts.map(a => a.type === 'image'
                ? `<a href="${a.url}" target="_blank"><img src="${a.url}" class="tkd-img" title="${a.name}" /></a>`
                : `<a href="${a.url}" target="_blank" class="tkd-file"><span style="display:flex;align-items:center">${icon('file-pdf', 13)}</span><span>${a.name}</span></a>`
              ).join('')}
            </div>
          </div>` : ''}

        </div>

        <!-- Footer actions -->
        <div class="tkd-footer">
          <button class="btn btn-secondary" id="tkd-edit">Редагувати</button>
          <button class="btn" style="background:rgba(239,68,68,.12);color:#EF4444;border:1px solid rgba(239,68,68,.3)" id="tkd-delete">Видалити</button>
        </div>

      </div>
    `

    detEl.querySelector('#tkd-close').addEventListener('click', closeDetail)

    detEl.querySelector('#tkd-check').addEventListener('click', async () => {
      await updateDoc(doc(db, ...base, 'tasks', task.id), {
        status: task.status === 'done' ? 'todo' : 'done'
      })
      await loadTasks()
      openDetail(id)
    })

    detEl.querySelectorAll('.tkd-st-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        await updateDoc(doc(db, ...base, 'tasks', task.id), { status: btn.dataset.status, updatedAt: serverTimestamp() })
        await loadTasks()
        openDetail(id)
      })
    })

    detEl.querySelector('#tkd-edit').addEventListener('click', () => openModal(task))

    detEl.querySelector('#tkd-delete').addEventListener('click', async () => {
      if (!confirm('Видалити задачу?')) return
      await deleteDoc(doc(db, ...base, 'tasks', task.id))
      closeDetail()
      await loadTasks()
    })
  }

  function closeDetail() {
    selectedId = null
    container.querySelector('#tk-right').style.display = 'none'
    renderList()
  }

  // ── Filter tabs ───────────────────────────────────────────
  container.querySelector('#filter-tabs').addEventListener('click', e => {
    const tab = e.target.closest('.tk-filter')
    if (!tab) return
    container.querySelectorAll('.tk-filter').forEach(t => t.classList.remove('active'))
    tab.classList.add('active')
    filter = tab.dataset.filter
    renderList()
  })

  container.querySelector('#tk-pri-filter').addEventListener('click', e => {
    const btn = e.target.closest('.tk-pri-btn')
    if (!btn) return
    container.querySelectorAll('.tk-pri-btn').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    priFilter = btn.dataset.pri
    renderList()
  })

  container.querySelector('#tk-view-toggle').addEventListener('click', e => {
    const btn = e.target.closest('.tk-view-btn')
    if (!btn) return
    container.querySelectorAll('.tk-view-btn').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    viewMode = btn.dataset.view
    renderList()
  })

  // ── Modal ─────────────────────────────────────────────────
  function openModal(task = null, prefillStatus = null) {
    editingId   = task?.id   || null
    editingTask = task       || null
    newFiles    = []

    container.querySelector('#modal-title').textContent = task ? 'Редагувати задачу' : 'Нова задача'
    container.querySelector('#f-title').value    = task?.title       || ''
    container.querySelector('#f-desc').value     = task?.description || ''
    container.querySelector('#f-priority').value = task?.priority    || 'medium'
    container.querySelector('#f-status').value   = task?.status      || prefillStatus || 'todo'
    container.querySelector('#f-due').value      = task?.dueDate     || ''
    container.querySelector('#f-project').value  = task?.projectId   || ''
    container.querySelector('#e-title').textContent = ''

    renderExistingAttachments(task?.attachments || [])

    container.querySelector('#modal').style.display = 'flex'
    setTimeout(() => container.querySelector('#f-title').focus(), 100)
  }

  function closeModal() {
    container.querySelector('#modal').style.display = 'none'
    editingId = null
    editingTask = null
    newFiles = []
    container.querySelector('#attach-previews').innerHTML = ''
    container.querySelector('#f-files').value = ''
  }

  // ── Existing attachments (при редагуванні) ────────────────
  function renderExistingAttachments(attachments) {
    const wrap = container.querySelector('#attach-previews')
    wrap.innerHTML = attachments.map(a => `
      <div class="attach-item" data-path="${a.storagePath || ''}">
        ${a.type === 'image'
          ? `<img src="${a.url}" class="attach-preview-img" />`
          : `<div class="attach-file-icon">${icon('file-pdf', 24)}</div>`
        }
        <div class="attach-name">${a.name}</div>
        <button type="button" class="attach-remove existing-remove" data-path="${a.storagePath || ''}" data-id="${a.id || ''}">${icon('x', 12)}</button>
      </div>
    `).join('')

    wrap.querySelectorAll('.existing-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.closest('.attach-item').remove()
      })
    })
  }

  // ── File picker ───────────────────────────────────────────
  container.querySelector('#attach-pick-btn').addEventListener('click', () => {
    container.querySelector('#f-files').click()
  })

  // ── Clipboard paste (Ctrl+V) ────────────────────────────────
  container.querySelector('#task-form').addEventListener('paste', (e) => {
    const items = Array.from(e.clipboardData?.items || [])
    const imageFiles = items
      .filter(item => item.type.startsWith('image/'))
      .map(item => item.getAsFile())
      .filter(Boolean)

    if (imageFiles.length === 0) return
    e.preventDefault()

    const zone = container.querySelector('#attach-zone')
    zone.classList.add('attach-zone--pasted')
    setTimeout(() => zone.classList.remove('attach-zone--pasted'), 400)

    imageFiles.forEach((file, i) => {
      const named = new File(
        [file],
        file.name || `screenshot_${Date.now()}_${i}.png`,
        { type: file.type }
      )
      if (newFiles.some(f => f.name === named.name && f.size === named.size)) return
      newFiles.push(named)
      addFilePreview(named)
    })
  })

  container.querySelector('#f-files').addEventListener('change', (e) => {
    const files = Array.from(e.target.files)
    files.forEach(file => {
      if (newFiles.some(f => f.name === file.name && f.size === file.size)) return
      newFiles.push(file)
      addFilePreview(file)
    })
    e.target.value = ''
  })

  function addFilePreview(file) {
    const wrap = container.querySelector('#attach-previews')
    const item = document.createElement('div')
    item.className = 'attach-item'
    item.dataset.filename = file.name

    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => {
        item.innerHTML = `
          <img src="${e.target.result}" class="attach-preview-img" />
          <div class="attach-name">${file.name}</div>
          <button type="button" class="attach-remove new-remove" data-filename="${file.name}">${icon('x', 12)}</button>
        `
        item.querySelector('.new-remove').addEventListener('click', () => removeNewFile(file.name, item))
      }
      reader.readAsDataURL(file)
    } else {
      item.innerHTML = `
        <div class="attach-file-icon">${icon('file-pdf', 24)}</div>
        <div class="attach-name">${file.name}</div>
        <button type="button" class="attach-remove new-remove" data-filename="${file.name}">${icon('x', 12)}</button>
      `
      item.querySelector('.new-remove').addEventListener('click', () => removeNewFile(file.name, item))
    }

    wrap.appendChild(item)
  }

  function removeNewFile(filename, item) {
    newFiles = newFiles.filter(f => f.name !== filename)
    item.remove()
  }

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

    try {
      // Визначаємо які існуючі вкладення залишились
      const remainingItems = [...container.querySelectorAll('#attach-previews .attach-item:not([data-filename])')]
      const keptPaths = remainingItems.map(el => el.dataset.path).filter(Boolean)

      // Зберігаємо існуючі вкладення що залишились
      const keptAttachments = (editingTask?.attachments || []).filter(
        a => !a.storagePath || keptPaths.includes(a.storagePath)
      )

      // Завантажуємо нові файли на Cloudinary
      const uploadedAttachments = await Promise.all(newFiles.map(file => uploadToCloudinary(file)))

      const attachments = [...keptAttachments, ...uploadedAttachments]

      const projectId = container.querySelector('#f-project').value || null
      const proj      = projects.find(p => p.id === projectId)

      const data = {
        title,
        description: container.querySelector('#f-desc').value.trim() || null,
        priority:    container.querySelector('#f-priority').value,
        status:      container.querySelector('#f-status').value,
        dueDate:     container.querySelector('#f-due').value          || null,
        projectId:   projectId,
        projectName: proj?.name || null,
        attachments,
      }

      if (editingId) {
        await updateDoc(doc(db, ...base, 'tasks', editingId), {
          ...data, updatedAt: serverTimestamp()
        })
      } else {
        await addDoc(collection(db, ...base, 'tasks'), {
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

  container.querySelector('#add-task-btn').addEventListener('click', () => openModal())
  container.querySelector('#modal-close').addEventListener('click', closeModal)
  container.querySelector('#modal-cancel').addEventListener('click', closeModal)
  container.querySelector('#modal').addEventListener('click', (e) => {
    if (e.target === container.querySelector('#modal')) closeModal()
  })

  await Promise.all([loadProjects(), loadTasks()])

  // ── Helpers ───────────────────────────────────────────────
  function updateCount() {
    const visible = projFilter === 'all' ? tasks : tasks.filter(t => t.projectId === projFilter)
    const done    = visible.filter(t => t.status === 'done').length
    const total   = visible.length

    const proj = projFilter !== 'all' ? projects.find(p => p.id === projFilter) : null
    container.querySelector('#tasks-count').textContent =
      total === 0 ? 'Задач немає'
      : proj ? `${done} з ${total} виконано · ${proj.name}`
      : `${done} з ${total} виконано`

    const wrap  = container.querySelector('#tk-progress-wrap')
    const fill  = container.querySelector('#tk-progress-fill')
    const label = container.querySelector('#tk-progress-label')
    if (total === 0) { wrap.style.display = 'none'; return }
    const pct = Math.round((done / total) * 100)
    wrap.style.display = 'flex'
    fill.style.width   = pct + '%'
    label.textContent  = pct + '%'
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
    /* ── Layout ── */
    .tk-layout  { display:flex; height:100%; overflow:hidden; }
    .tk-left    { flex:1; min-width:0; padding:32px 28px; overflow-y:auto; }
    .tk-right   { width:360px; flex-shrink:0; border-left:1px solid var(--border); overflow-y:auto; background:var(--bg-primary); display:flex; flex-direction:column; }

    /* ── Page ── */
    .tk-header  { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:20px; }
    .tk-title   { font-family:var(--font-display); font-size:26px; font-weight:700; letter-spacing:-0.02em; margin-bottom:4px; }
    .tk-sub     { font-size:13px; color:var(--text-secondary); }

    /* Card selected */
    .tk-card-selected { border-color:var(--pri) !important; box-shadow:0 0 0 2px color-mix(in srgb,var(--pri) 20%,transparent); }

    /* Progress bar */
    .tk-progress-wrap  { display:flex; align-items:center; gap:12px; margin-bottom:18px; }
    .tk-progress-bar   { flex:1; height:6px; background:rgba(255,255,255,.08); border-radius:99px; overflow:hidden; }
    .tk-progress-fill  { height:100%; background:linear-gradient(90deg,#4F8EF7,#34D399); border-radius:99px; transition:width .6s cubic-bezier(.34,1.56,.64,1); }
    .tk-progress-label { font-family:var(--font-mono); font-size:13px; font-weight:700; color:var(--text-secondary); min-width:36px; text-align:right; }

    /* Toolbar */
    .tk-toolbar      { display:flex; flex-direction:column; gap:10px; margin-bottom:20px; }
    .tk-filters      { display:flex; gap:6px; flex-wrap:wrap; }
    .tk-filter       { padding:6px 16px; border-radius:var(--radius-full); font-size:13px; font-weight:600; color:var(--text-secondary); background:var(--bg-secondary); border:1.5px solid var(--border); cursor:pointer; transition:all .2s; }
    .tk-filter:hover { border-color:var(--accent-blue); color:var(--text-primary); }
    .tk-filter.active { background:var(--accent-blue); border-color:var(--accent-blue); color:#fff; }

    .tk-priority-filter { display:flex; gap:6px; flex-wrap:wrap; }
    .tk-pri-btn         { padding:5px 13px; border-radius:var(--radius-full); font-size:12px; font-weight:600; color:var(--text-muted); background:transparent; border:1.5px solid var(--border); cursor:pointer; transition:all .2s; }
    .tk-pri-btn:hover   { color:var(--text-primary); border-color:var(--pc, var(--border)); }
    .tk-pri-btn.active  { background:var(--pc, var(--accent-blue)); border-color:var(--pc, var(--accent-blue)); color:#fff; }
    .tk-pri-btn[data-pri="all"].active { background:var(--bg-secondary); border-color:rgba(255,255,255,.2); color:var(--text-primary); }

    .tk-toolbar-row3 { display:flex; align-items:center; justify-content:space-between; gap:10px; }
    .tk-proj-select { padding:7px 12px; border-radius:var(--radius-md); font-size:12px; font-weight:600; color:var(--text-primary); background:var(--bg-secondary); border:1.5px solid var(--border); cursor:pointer; }

    .tk-view-toggle { display:flex; gap:2px; background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-md); padding:3px; margin-left:auto; }
    .tk-view-btn { display:flex; align-items:center; gap:5px; padding:6px 12px; border:none; background:none; border-radius:6px; font-size:12px; font-weight:600; color:var(--text-muted); cursor:pointer; transition:all .15s; }
    .tk-view-btn.active { background:var(--accent-blue); color:#fff; }

    .tk-cal { display:flex; flex-direction:column; }
    .tk-cal-head { display:flex; align-items:center; justify-content:center; gap:16px; margin-bottom:14px; }
    .tk-cal-label { font-size:15px; font-weight:700; color:var(--text-primary); min-width:160px; text-align:center; }
    .tk-cal-nav { width:30px; height:30px; border-radius:8px; border:1px solid var(--border); background:var(--bg-secondary); color:var(--text-primary); cursor:pointer; display:flex; align-items:center; justify-content:center; }
    .tk-cal-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:6px; }
    .tk-cal-wd { text-align:center; font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; padding-bottom:6px; }
    .tk-cal-cell { min-height:88px; background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-md); padding:6px; display:flex; flex-direction:column; gap:3px; }
    .tk-cal-cell--empty { background:transparent; border-color:transparent; }
    .tk-cal-cell--today { border-color:var(--accent-blue); }
    .tk-cal-day { font-size:11px; font-weight:700; color:var(--text-muted); }
    .tk-cal-cell--today .tk-cal-day { color:var(--accent-blue); }
    .tk-cal-tasks { display:flex; flex-direction:column; gap:3px; overflow:hidden; }
    .tk-cal-chip { font-size:10px; padding:2px 5px; border-radius:4px; background:color-mix(in srgb, var(--pc) 16%, var(--bg-tertiary)); color:var(--pc); cursor:pointer; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .tk-cal-more { font-size:10px; color:var(--text-muted); padding:0 4px; }

    .tk-kb-board { display:flex; gap:14px; overflow-x:auto; padding-bottom:16px; }
    .tk-kb-col { min-width:260px; width:260px; flex-shrink:0; display:flex; flex-direction:column; }
    .tk-kb-col-head { display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:var(--bg-secondary); border-radius:var(--radius-lg) var(--radius-lg) 0 0; font-size:13px; font-weight:700; border:1px solid var(--border); border-bottom:none; }
    .tk-kb-col-count { font-size:11px; font-weight:800; padding:2px 8px; border-radius:var(--radius-full); }
    .tk-kb-col-body { flex:1; background:var(--bg-secondary); border:1px solid var(--border); border-top:none; border-radius:0 0 var(--radius-lg) var(--radius-lg); padding:8px; display:flex; flex-direction:column; gap:8px; min-height:200px; }
    .tk-kb-col-body--over { background:rgba(79,142,247,.08); outline:2px dashed var(--accent-blue); outline-offset:-2px; }
    .tk-kb-col-empty { text-align:center; color:var(--text-muted); font-size:12px; padding:20px 8px; border:2px dashed var(--border); border-radius:var(--radius-md); margin:4px 0; }
    .tk-kb-card { background:var(--bg-primary); border:1px solid var(--border); border-radius:var(--radius-md); padding:12px; cursor:pointer; transition:all .15s; }
    .tk-kb-card:hover { border-color:var(--accent-blue); transform:translateY(-1px); }
    .tk-kb-card--dragging { opacity:.4; }
    .tk-kb-card-top { margin-bottom:6px; }
    .tk-kb-pri-dot { width:9px; height:9px; border-radius:50%; display:inline-block; }
    .tk-kb-card-title { font-size:13px; font-weight:600; line-height:1.4; margin-bottom:4px; }
    .tk-kb-card-proj { font-size:10px; color:var(--accent-blue); margin-bottom:4px; }
    .tk-kb-card-due { font-size:10px; color:var(--text-muted); }
    .tk-kb-add-btn { display:flex; align-items:center; justify-content:center; gap:5px; padding:8px; border-radius:var(--radius-md); border:1.5px dashed var(--border); background:none; color:var(--text-muted); font-size:12px; font-weight:600; cursor:pointer; transition:all .15s; }
    .tk-kb-add-btn:hover { border-color:var(--accent-blue); color:var(--accent-blue); }

    /* Loading */
    .tk-loading { display:flex; justify-content:center; padding:60px; }

    /* Grid */
    .tk-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:14px; }

    /* Card */
    .tk-card {
      background:var(--bg-secondary); border:1px solid var(--border);
      border-radius:var(--radius-xl); overflow:hidden;
      transition:transform .2s, box-shadow .2s, border-color .2s;
      display:flex; flex-direction:column;
    }
    .tk-card:hover { transform:translateY(-3px); box-shadow:0 8px 28px rgba(0,0,0,.3); border-color:var(--pri, var(--border)); }
    .tk-card-done { opacity:.55; }
    .tk-card-done .tk-card-title { text-decoration:line-through; color:var(--text-muted); }

    .tk-card-stripe { height:3px; background:var(--pri, var(--border)); flex-shrink:0; }

    .tk-card-body   { padding:16px; display:flex; flex-direction:column; gap:8px; flex:1; }

    .tk-card-top    { display:flex; align-items:center; justify-content:space-between; }
    .tk-check {
      width:24px; height:24px; border-radius:8px; flex-shrink:0;
      border:2px solid var(--border); display:flex; align-items:center; justify-content:center;
      font-size:13px; font-weight:800; color:#fff; cursor:pointer; transition:all .2s;
    }
    .tk-check:hover { border-color:var(--pri, var(--accent-blue)); background:rgba(255,255,255,.08); }
    .tk-check.done  { background:var(--pri, var(--accent-blue)); border-color:var(--pri, var(--accent-blue)); }

    .tk-card-actions { display:flex; gap:4px; opacity:0; transition:opacity .2s; }
    .tk-card:hover .tk-card-actions { opacity:1; }
    .tk-icon-btn { width:28px; height:28px; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:13px; cursor:pointer; transition:background .2s; }
    .tk-icon-btn:hover { background:rgba(255,255,255,.1); }

    .tk-card-title  { font-weight:700; font-size:15px; line-height:1.4; }
    .tk-card-proj   { font-size:12px; color:var(--accent-blue); font-weight:500; }
    .tk-card-desc   { font-size:13px; color:var(--text-secondary); line-height:1.5; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }

    .tk-attachments { display:flex; gap:6px; flex-wrap:wrap; }
    .tk-thumb       { width:52px; height:52px; object-fit:cover; border-radius:8px; border:1px solid var(--border); cursor:pointer; transition:opacity .2s; }
    .tk-thumb:hover { opacity:.8; }
    .tk-file-chip   { display:inline-flex; align-items:center; gap:4px; font-size:11px; background:var(--bg-tertiary); border:1px solid var(--border); border-radius:var(--radius-full); padding:3px 10px; color:var(--text-secondary); text-decoration:none; }
    .tk-file-chip:hover { color:var(--accent-blue); }

    .tk-card-footer { display:flex; gap:6px; flex-wrap:wrap; align-items:center; padding-top:8px; border-top:1px solid rgba(255,255,255,.06); margin-top:auto; }
    .tk-badge  { font-size:11px; font-weight:700; padding:3px 9px; border-radius:var(--radius-full); white-space:nowrap; }
    .tk-due    { font-size:11px; color:var(--text-muted); margin-left:auto; }
    .tk-due.overdue { color:#EF4444; font-weight:700; }

    /* Empty */
    .tk-empty       { text-align:center; padding:80px 24px; grid-column:1/-1; }
    .tk-empty-icon  { display:flex; align-items:center; justify-content:center; margin-bottom:16px; color:var(--text-muted); }
    .tk-empty-title { font-family:var(--font-display); font-size:18px; font-weight:600; margin-bottom:8px; }
    .tk-empty-desc  { font-size:14px; color:var(--text-muted); }

    /* Attach zone */
    .attach-zone { display:flex; align-items:center; gap:10px; border:1.5px dashed transparent; border-radius:var(--radius-md); padding:4px 6px; transition:all .2s; }
    .attach-btn  { background:var(--bg-tertiary); border:1.5px dashed var(--border); border-radius:var(--radius-md); padding:8px 16px; font-size:13px; font-weight:500; color:var(--text-secondary); cursor:pointer; transition:all .2s; }
    .attach-btn:hover { border-color:var(--accent-blue); color:var(--accent-blue); }
    .attach-hint { font-size:11px; color:var(--text-muted); }
    .attach-hint kbd { background:var(--bg-tertiary); border:1px solid var(--border); border-radius:4px; padding:1px 5px; font-size:10px; font-family:monospace; color:var(--text-secondary); }
    .attach-zone--pasted { border-color:var(--accent-blue) !important; background:rgba(79,142,247,.06) !important; transition:all .15s; }
    .attach-previews { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
    .attach-item { position:relative; display:flex; flex-direction:column; align-items:center; gap:4px; }
    .attach-preview-img { width:72px; height:72px; object-fit:cover; border-radius:8px; border:1px solid var(--border); }
    .attach-file-icon { width:72px; height:72px; display:flex; align-items:center; justify-content:center; background:var(--bg-tertiary); border-radius:8px; border:1px solid var(--border); color:var(--text-muted); }
    .attach-name  { font-size:10px; color:var(--text-muted); max-width:72px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:center; }
    .attach-remove { position:absolute; top:-6px; right:-6px; width:18px; height:18px; border-radius:50%; background:#EF4444; color:#fff; font-size:10px; font-weight:700; display:flex; align-items:center; justify-content:center; cursor:pointer; border:none; line-height:1; }

    /* Modal */
    .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.6); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; z-index:1000; padding:24px; }
    .modal { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-xl); width:100%; max-width:520px; box-shadow:var(--shadow-xl); animation:tkModalIn .2s cubic-bezier(0.34,1.2,0.64,1); max-height:90vh; overflow-y:auto; }
    .modal-header { display:flex; align-items:center; justify-content:space-between; padding:24px 24px 0; position:sticky; top:0; background:var(--bg-secondary); z-index:1; }
    .modal-title  { font-family:var(--font-display); font-size:20px; font-weight:700; }
    .modal-close  { width:32px; height:32px; border-radius:8px; color:var(--text-muted); font-size:16px; display:flex; align-items:center; justify-content:center; transition:all .2s; cursor:pointer; }
    .modal-close:hover { background:var(--accent-red-dim); color:var(--accent-red); }
    .modal-body   { padding:20px 24px; display:flex; flex-direction:column; gap:14px; }
    .modal-footer { display:flex; gap:10px; justify-content:flex-end; padding:12px 24px 24px; position:sticky; bottom:0; background:var(--bg-secondary); }
    .form-row     { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .field label  { display:block; font-size:12px; font-weight:600; color:var(--text-secondary); text-transform:uppercase; letter-spacing:.05em; margin-bottom:6px; }
    .field-error  { font-size:12px; color:#EF4444; margin-top:4px; display:block; }

    @keyframes tkModalIn { from{opacity:0;transform:scale(.95)} to{opacity:1;transform:scale(1)} }

    /* ── Detail panel ── */
    .tkd-wrap   { display:flex; flex-direction:column; height:100%; }
    .tkd-hd     { display:flex; align-items:center; justify-content:flex-end; padding:14px 16px 0; flex-shrink:0; }
    .tkd-stripe { position:absolute; top:0; left:0; right:0; height:3px; }
    .tkd-close  { width:30px; height:30px; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:14px; color:var(--text-muted); transition:all .2s; }
    .tkd-close:hover { background:var(--accent-red-dim); color:var(--accent-red); }

    .tkd-body   { padding:16px 20px; display:flex; flex-direction:column; gap:20px; flex:1; overflow-y:auto; }

    .tkd-top    { display:flex; align-items:flex-start; gap:12px; }
    .tkd-title  { font-family:var(--font-display); font-size:18px; font-weight:700; line-height:1.4; flex:1; }
    .tkd-done   { text-decoration:line-through; color:var(--text-muted); }

    .tkd-badges { display:flex; gap:6px; flex-wrap:wrap; }

    .tkd-section { display:flex; flex-direction:column; gap:10px; }
    .tkd-label   { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--text-muted); }

    .tkd-status-row { display:flex; gap:6px; flex-wrap:wrap; }
    .tkd-st-btn     { padding:6px 14px; border-radius:var(--radius-full); font-size:12px; font-weight:600; cursor:pointer; border:1.5px solid var(--border); color:var(--text-muted); background:transparent; transition:all .2s; }
    .tkd-st-btn:hover { border-color:var(--sc); color:var(--sc); }
    .tkd-st-btn.active { font-weight:700; }

    .tkd-desc   { font-size:14px; color:var(--text-secondary); line-height:1.6; background:var(--bg-secondary); border-radius:var(--radius-lg); padding:12px 14px; white-space:pre-wrap; }

    .tkd-info-list { display:flex; flex-direction:column; gap:8px; }
    .tkd-info-row  { display:grid; grid-template-columns:20px 80px 1fr; align-items:center; gap:8px; font-size:13px; }
    .tkd-info-icon { display:flex; align-items:center; justify-content:center; color:var(--text-muted); }
    .tkd-info-key  { color:var(--text-muted); font-size:12px; }
    .tkd-info-val  { color:var(--text-primary); font-weight:500; }
    .tkd-info-val.overdue { color:#EF4444; font-weight:700; }

    .tkd-attachments { display:flex; flex-direction:column; gap:8px; }
    .tkd-img    { width:100%; border-radius:var(--radius-lg); border:1px solid var(--border); display:block; cursor:pointer; transition:opacity .2s; }
    .tkd-img:hover { opacity:.85; }
    .tkd-file   { display:flex; align-items:center; gap:8px; padding:10px 12px; background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-lg); font-size:13px; color:var(--text-primary); text-decoration:none; transition:border-color .2s; }
    .tkd-file:hover { border-color:var(--accent-blue); }

    .tkd-footer { padding:16px 20px; display:flex; gap:8px; border-top:1px solid var(--border); flex-shrink:0; }
  `
  document.head.appendChild(style)
}
