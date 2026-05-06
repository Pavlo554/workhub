// src/renderer/modules/tasks/index.js
import { db, storage } from '../../services/firebase.js'
import { getCurrentUser, getActivePathSegments } from '../../services/auth.js'
import {
  collection, addDoc, getDocs, deleteDoc,
  doc, updateDoc, query, orderBy, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
import {
  ref, uploadBytes, getDownloadURL, deleteObject
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js'

export async function render(container) {
  injectStyles()

  container.innerHTML = `
    <div class="tk-layout">

      <!-- ══ Left ══ -->
      <div class="tk-left" id="tk-left">

        <div class="tk-header">
          <div>
            <h1 class="tk-title">✅ Задачі</h1>
            <p class="tk-sub" id="tasks-count">Завантаження...</p>
          </div>
          <button class="btn btn-primary" id="add-task-btn">+ Нова задача</button>
        </div>

        <!-- Progress bar -->
        <div class="tk-progress-wrap" id="tk-progress-wrap" style="display:none">
          <div class="tk-progress-bar"><div class="tk-progress-fill" id="tk-progress-fill"></div></div>
          <span class="tk-progress-label" id="tk-progress-label"></span>
        </div>

        <!-- Filters -->
        <div class="tk-toolbar">
          <div class="tk-filters" id="filter-tabs">
            <button class="tk-filter active" data-filter="all">Всі</button>
            <button class="tk-filter" data-filter="todo">До виконання</button>
            <button class="tk-filter" data-filter="in-progress">В процесі</button>
            <button class="tk-filter" data-filter="done">Виконані</button>
          </div>
          <div class="tk-priority-filter" id="tk-pri-filter">
            <button class="tk-pri-btn active" data-pri="all">Всі</button>
            <button class="tk-pri-btn" data-pri="high"   style="--pc:#EF4444">🔴 Високий</button>
            <button class="tk-pri-btn" data-pri="medium" style="--pc:#F59E0B">🟡 Середній</button>
            <button class="tk-pri-btn" data-pri="low"    style="--pc:#34D399">🟢 Низький</button>
          </div>
        </div>

        <!-- Project filter -->
        <div class="tk-proj-filter-row" id="tk-proj-row" style="display:none">
          <span class="tk-proj-label">📁 Проект:</span>
          <div class="tk-proj-pills" id="tk-proj-pills"></div>
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

            <!-- Photo attachments -->
            <div class="field">
              <label>Фото / файли</label>
              <div class="attach-zone" id="attach-zone">
                <input type="file" id="f-files" multiple accept="image/*,.pdf,.doc,.docx" style="display:none" />
                <button type="button" class="attach-btn" id="attach-pick-btn">
                  📎 Додати файли
                </button>
                <span class="attach-hint">Зображення, PDF, DOC</span>
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

      // Build project filter pills
      if (projects.length > 0) {
        const row   = container.querySelector('#tk-proj-row')
        const pills = container.querySelector('#tk-proj-pills')
        row.style.display = 'flex'
        pills.innerHTML = `<button class="tk-proj-pill active" data-proj="all">Всі</button>` +
          projects.map(p => `<button class="tk-proj-pill" data-proj="${p.id}">${p.name}</button>`).join('')
        pills.querySelectorAll('.tk-proj-pill').forEach(btn => {
          btn.addEventListener('click', () => {
            pills.querySelectorAll('.tk-proj-pill').forEach(b => b.classList.remove('active'))
            btn.classList.add('active')
            projFilter = btn.dataset.proj
            renderList()
            updateCount()
          })
        })
      }
    } catch (_) {}
  }

  // ── Load tasks ────────────────────────────────────────────
  async function loadTasks() {
    try {
      const q    = query(collection(db, ...base, 'tasks'), orderBy('createdAt', 'desc'))
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

  const PRI_META = {
    high:   { label: 'Високий',  color: '#EF4444', bg: 'rgba(239,68,68,.12)'  },
    medium: { label: 'Середній', color: '#F59E0B', bg: 'rgba(245,158,11,.12)' },
    low:    { label: 'Низький',  color: '#34D399', bg: 'rgba(52,211,153,.12)' },
  }
  const ST_META = {
    'todo':        { label: 'До виконання', color: '#6B7280', bg: 'rgba(107,114,128,.12)' },
    'in-progress': { label: 'В процесі',    color: '#4F8EF7', bg: 'rgba(79,142,247,.12)'  },
    'done':        { label: 'Виконано',     color: '#34D399', bg: 'rgba(52,211,153,.12)'  },
  }

  // ── Render list ───────────────────────────────────────────
  function renderList() {
    const el = container.querySelector('#tasks-list')
    let list = filter === 'all' ? tasks : tasks.filter(t => t.status === filter)
    if (priFilter !== 'all') list = list.filter(t => (t.priority || 'medium') === priFilter)
    if (projFilter !== 'all') list = list.filter(t => t.projectId === projFilter)

    if (list.length === 0) {
      el.innerHTML = `
        <div class="tk-empty">
          <div class="tk-empty-icon">✅</div>
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
                ${done ? '✓' : ''}
              </button>
              <div class="tk-card-actions">
                <button class="tk-icon-btn tk-edit"   data-id="${t.id}">✏️</button>
                <button class="tk-icon-btn tk-delete" data-id="${t.id}">🗑</button>
              </div>
            </div>

            <div class="tk-card-title">${t.title}</div>
            ${proj ? `<div class="tk-card-proj">📁 ${proj.name}</div>` : ''}
            ${t.description ? `<div class="tk-card-desc">${t.description}</div>` : ''}

            ${atts.length ? `
              <div class="tk-attachments">
                ${atts.map(a => a.type === 'image'
                  ? `<img src="${a.url}" class="tk-thumb" title="${a.name}" />`
                  : `<a href="${a.url}" target="_blank" class="tk-file-chip">📄 ${a.name}</a>`
                ).join('')}
              </div>` : ''}

            <div class="tk-card-footer">
              <span class="tk-badge" style="color:${pri.color};background:${pri.bg}">${pri.label}</span>
              <span class="tk-badge" style="color:${st.color};background:${st.bg}">${st.label}</span>
              ${t.dueDate ? `<span class="tk-due ${over ? 'overdue' : ''}">📅 ${formatDate(t.dueDate)}</span>` : ''}
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
        const task = tasks.find(t => t.id === btn.dataset.id)
        if (task?.attachments?.length) {
          await Promise.all(task.attachments.map(a =>
            deleteObject(ref(storage, a.storagePath)).catch(() => {})
          ))
        }
        await deleteDoc(doc(db, ...base, 'tasks', btn.dataset.id))
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
          <button class="tkd-close" id="tkd-close">✕</button>
        </div>

        <div class="tkd-body">

          <!-- Title + check -->
          <div class="tkd-top">
            <button class="tk-check ${task.status === 'done' ? 'done' : ''}" id="tkd-check" style="--pri:${pri.color}">
              ${task.status === 'done' ? '✓' : ''}
            </button>
            <h2 class="tkd-title ${task.status === 'done' ? 'tkd-done' : ''}">${task.title}</h2>
          </div>

          <!-- Badges -->
          <div class="tkd-badges">
            <span class="tk-badge" style="color:${pri.color};background:${pri.bg}">${pri.label}</span>
            <span class="tk-badge" style="color:${st.color};background:${st.bg}">${st.label}</span>
            ${over ? `<span class="tk-badge" style="color:#EF4444;background:rgba(239,68,68,.12)">⚠️ Прострочено</span>` : ''}
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
              ${proj ? `<div class="tkd-info-row"><span class="tkd-info-icon">📁</span><span class="tkd-info-key">Проект</span><span class="tkd-info-val">${proj.name}</span></div>` : ''}
              ${task.dueDate ? `<div class="tkd-info-row"><span class="tkd-info-icon">${over ? '⚠️' : '📅'}</span><span class="tkd-info-key">Дедлайн</span><span class="tkd-info-val ${over ? 'overdue' : ''}">${formatDate(task.dueDate)}</span></div>` : ''}
              ${created ? `<div class="tkd-info-row"><span class="tkd-info-icon">🕐</span><span class="tkd-info-key">Створено</span><span class="tkd-info-val">${created.toLocaleDateString('uk-UA', {day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span></div>` : ''}
              ${updated ? `<div class="tkd-info-row"><span class="tkd-info-icon">✏️</span><span class="tkd-info-key">Оновлено</span><span class="tkd-info-val">${updated.toLocaleDateString('uk-UA', {day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span></div>` : ''}
            </div>
          </div>

          ${atts.length ? `
          <div class="tkd-section">
            <div class="tkd-label">Вкладення (${atts.length})</div>
            <div class="tkd-attachments">
              ${atts.map(a => a.type === 'image'
                ? `<a href="${a.url}" target="_blank"><img src="${a.url}" class="tkd-img" title="${a.name}" /></a>`
                : `<a href="${a.url}" target="_blank" class="tkd-file"><span>📄</span><span>${a.name}</span></a>`
              ).join('')}
            </div>
          </div>` : ''}

        </div>

        <!-- Footer actions -->
        <div class="tkd-footer">
          <button class="btn btn-secondary" id="tkd-edit">✏️ Редагувати</button>
          <button class="btn" style="background:rgba(239,68,68,.12);color:#EF4444;border:1px solid rgba(239,68,68,.3)" id="tkd-delete">🗑 Видалити</button>
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
      if (task?.attachments?.length) {
        await Promise.all(task.attachments.map(a =>
          deleteObject(ref(storage, a.storagePath)).catch(() => {})
        ))
      }
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

  // ── Modal ─────────────────────────────────────────────────
  function openModal(task = null) {
    editingId   = task?.id   || null
    editingTask = task       || null
    newFiles    = []

    container.querySelector('#modal-title').textContent = task ? 'Редагувати задачу' : 'Нова задача'
    container.querySelector('#f-title').value    = task?.title       || ''
    container.querySelector('#f-desc').value     = task?.description || ''
    container.querySelector('#f-priority').value = task?.priority    || 'medium'
    container.querySelector('#f-status').value   = task?.status      || 'todo'
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
          : `<div class="attach-file-icon">📄</div>`
        }
        <div class="attach-name">${a.name}</div>
        <button type="button" class="attach-remove existing-remove" data-path="${a.storagePath || ''}" data-id="${a.id || ''}">✕</button>
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
          <button type="button" class="attach-remove new-remove" data-filename="${file.name}">✕</button>
        `
        item.querySelector('.new-remove').addEventListener('click', () => removeNewFile(file.name, item))
      }
      reader.readAsDataURL(file)
    } else {
      item.innerHTML = `
        <div class="attach-file-icon">📄</div>
        <div class="attach-name">${file.name}</div>
        <button type="button" class="attach-remove new-remove" data-filename="${file.name}">✕</button>
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

      // Видаляємо прибрані існуючі вкладення
      if (editingTask?.attachments) {
        const removed = editingTask.attachments.filter(a => a.storagePath && !keptPaths.includes(a.storagePath))
        await Promise.all(removed.map(a => deleteObject(ref(storage, a.storagePath)).catch(() => {})))
      }

      // Зберігаємо існуючі вкладення що залишились
      const keptAttachments = (editingTask?.attachments || []).filter(
        a => !a.storagePath || keptPaths.includes(a.storagePath)
      )

      // Завантажуємо нові файли
      const taskId = editingId || `temp_${Date.now()}`
      const uploadedAttachments = await Promise.all(newFiles.map(async file => {
        const path = `users/${user.uid}/tasks/${taskId}/${Date.now()}_${file.name}`
        const storageRef = ref(storage, path)
        await uploadBytes(storageRef, file)
        const url = await getDownloadURL(storageRef)
        return {
          name:        file.name,
          url,
          storagePath: path,
          type:        file.type.startsWith('image/') ? 'image' : 'file',
        }
      }))

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

    .tk-proj-filter-row { display:flex; align-items:center; gap:10px; margin-bottom:14px; flex-wrap:wrap; }
    .tk-proj-label      { font-size:12px; font-weight:700; color:var(--text-muted); white-space:nowrap; }
    .tk-proj-pills      { display:flex; gap:6px; flex-wrap:wrap; }
    .tk-proj-pill       { padding:5px 14px; border-radius:var(--radius-full); font-size:12px; font-weight:600; color:var(--text-secondary); background:var(--bg-secondary); border:1.5px solid var(--border); cursor:pointer; transition:all .2s; }
    .tk-proj-pill:hover { border-color:rgba(79,142,247,.5); color:var(--text-primary); }
    .tk-proj-pill.active { background:rgba(79,142,247,.15); border-color:var(--accent-blue); color:var(--accent-blue); }

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
    .tk-file-chip   { font-size:11px; background:var(--bg-tertiary); border:1px solid var(--border); border-radius:var(--radius-full); padding:3px 10px; color:var(--text-secondary); text-decoration:none; }
    .tk-file-chip:hover { color:var(--accent-blue); }

    .tk-card-footer { display:flex; gap:6px; flex-wrap:wrap; align-items:center; padding-top:8px; border-top:1px solid rgba(255,255,255,.06); margin-top:auto; }
    .tk-badge  { font-size:11px; font-weight:700; padding:3px 9px; border-radius:var(--radius-full); white-space:nowrap; }
    .tk-due    { font-size:11px; color:var(--text-muted); margin-left:auto; }
    .tk-due.overdue { color:#EF4444; font-weight:700; }

    /* Empty */
    .tk-empty       { text-align:center; padding:80px 24px; grid-column:1/-1; }
    .tk-empty-icon  { font-size:52px; margin-bottom:16px; }
    .tk-empty-title { font-family:var(--font-display); font-size:18px; font-weight:600; margin-bottom:8px; }
    .tk-empty-desc  { font-size:14px; color:var(--text-muted); }

    /* Attach zone */
    .attach-zone { display:flex; align-items:center; gap:10px; }
    .attach-btn  { background:var(--bg-tertiary); border:1.5px dashed var(--border); border-radius:var(--radius-md); padding:8px 16px; font-size:13px; font-weight:500; color:var(--text-secondary); cursor:pointer; transition:all .2s; }
    .attach-btn:hover { border-color:var(--accent-blue); color:var(--accent-blue); }
    .attach-hint { font-size:11px; color:var(--text-muted); }
    .attach-previews { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
    .attach-item { position:relative; display:flex; flex-direction:column; align-items:center; gap:4px; }
    .attach-preview-img { width:72px; height:72px; object-fit:cover; border-radius:8px; border:1px solid var(--border); }
    .attach-file-icon { width:72px; height:72px; display:flex; align-items:center; justify-content:center; font-size:28px; background:var(--bg-tertiary); border-radius:8px; border:1px solid var(--border); }
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
    .tkd-info-icon { font-size:15px; text-align:center; }
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
