// src/renderer/modules/projects/index.js
import { db } from '../../services/firebase.js'
import { getCurrentUser, getUserProfile } from '../../services/auth.js'
import { checkPlanLimit } from '../../services/plan-guard.js'
import {
  collection, addDoc, getDocs, deleteDoc,
  doc, updateDoc, query, orderBy, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

const STATUS_META = {
  active:    { label: 'Активний',    color: '#4F8EF7', bg: 'rgba(79,142,247,0.12)'  },
  paused:    { label: 'Призупинено', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)'  },
  done:      { label: 'Завершено',   color: '#34D399', bg: 'rgba(52,211,153,0.12)'  },
  cancelled: { label: 'Скасовано',   color: '#EF4444', bg: 'rgba(239,68,68,0.12)'   },
}

export async function render(container) {
  injectStyles()

  container.innerHTML = `
    <div class="projects-page">

      <!-- Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">📁 Проекти</h1>
          <p class="page-subtitle" id="projects-count">Завантаження...</p>
        </div>
        <button class="btn btn-primary" id="add-project-btn">+ Новий проект</button>
      </div>

      <!-- Filter tabs -->
      <div class="filter-tabs" id="filter-tabs">
        <button class="filter-tab active" data-filter="all">Всі</button>
        <button class="filter-tab" data-filter="active">Активні</button>
        <button class="filter-tab" data-filter="paused">Призупинені</button>
        <button class="filter-tab" data-filter="done">Завершені</button>
      </div>

      <!-- List -->
      <div id="projects-list" class="projects-list">
        <div class="loading-wrap"><div class="spinner"></div></div>
      </div>

    </div>

    <!-- Modal: project form -->
    <div class="modal-overlay" id="modal" style="display:none">
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title" id="modal-title">Новий проект</h2>
          <button class="modal-close" id="modal-close">✕</button>
        </div>
        <form id="project-form" novalidate>
          <div class="modal-body">

            <div class="field">
              <label>Назва проекту *</label>
              <input id="f-name" type="text" class="input" placeholder="Назва проекту..." />
              <span class="field-error" id="e-name"></span>
            </div>

            <div class="field">
              <label>Опис</label>
              <textarea id="f-desc" class="input" rows="3" placeholder="Короткий опис проекту..." style="resize:vertical"></textarea>
            </div>

            <div class="form-row">
              <div class="field">
                <label>Клієнт</label>
                <input id="f-client" type="text" class="input" placeholder="Ім'я або компанія" />
              </div>
              <div class="field">
                <label>Бюджет (₴)</label>
                <input id="f-budget" type="number" class="input" placeholder="0" min="0" />
              </div>
            </div>

            <div class="form-row">
              <div class="field">
                <label>Дата початку</label>
                <input id="f-start" type="date" class="input" />
              </div>
              <div class="field">
                <label>Дедлайн</label>
                <input id="f-deadline" type="date" class="input" />
              </div>
            </div>

            <div class="form-row">
              <div class="field">
                <label>Статус</label>
                <select id="f-status" class="input">
                  <option value="active">Активний</option>
                  <option value="paused">Призупинено</option>
                  <option value="done">Завершено</option>
                  <option value="cancelled">Скасовано</option>
                </select>
              </div>
              <div class="field">
                <label>Прогрес (%)</label>
                <input id="f-progress" type="number" class="input" placeholder="0" min="0" max="100" />
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

    <!-- Modal: project detail -->
    <div class="modal-overlay" id="detail-modal" style="display:none">
      <div class="modal modal-wide" id="detail-content"></div>
    </div>
  `

  let projects  = []
  let editingId = null
  let filter    = 'all'
  const user    = getCurrentUser()
  const profile = await getUserProfile(user.uid)

  // ── Load ──────────────────────────────────────────────────
  async function loadProjects() {
    try {
      const q    = query(collection(db, 'users', user.uid, 'projects'), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      projects   = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      renderList()
      updateCount()
    } catch (err) {
      console.error(err)
      container.querySelector('#projects-list').innerHTML = `
        <div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-title">Помилка завантаження</div></div>
      `
    }
  }

  // ── Render list ───────────────────────────────────────────
  function renderList() {
    const el       = container.querySelector('#projects-list')
    const filtered = filter === 'all' ? projects : projects.filter(p => p.status === filter)

    if (filtered.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📁</div>
          <div class="empty-title">Проектів немає</div>
          <div class="empty-desc">Натисніть "+ Новий проект" щоб додати перший</div>
        </div>
      `
      return
    }

    el.innerHTML = `
      <div class="projects-grid">
        ${filtered.map(p => {
          const st       = STATUS_META[p.status] || STATUS_META.active
          const progress = Math.min(100, Math.max(0, p.progress || 0))
          const overdue  = p.deadline && p.status !== 'done' && new Date(p.deadline) < new Date()
          return `
            <div class="project-card" data-id="${p.id}">
              <div class="project-card-top">
                <div class="project-name">${p.name}</div>
                <div class="project-actions">
                  <button class="icon-btn edit-btn"   data-id="${p.id}" title="Редагувати">✏️</button>
                  <button class="icon-btn delete-btn" data-id="${p.id}" title="Видалити">🗑</button>
                </div>
              </div>

              ${p.description ? `<div class="project-desc">${p.description}</div>` : ''}

              <div class="project-meta">
                ${p.client   ? `<span class="meta-chip">👤 ${p.client}</span>` : ''}
                ${p.budget   ? `<span class="meta-chip">💰 ₴${Number(p.budget).toLocaleString('uk-UA')}</span>` : ''}
                ${p.deadline ? `<span class="meta-chip ${overdue ? 'chip-danger' : ''}">📅 ${formatDate(p.deadline)}</span>` : ''}
              </div>

              <div class="progress-row">
                <div class="progress-bar-wrap">
                  <div class="progress-bar-fill" style="width:${progress}%;background:${st.color}"></div>
                </div>
                <span class="progress-value">${progress}%</span>
              </div>

              <div class="project-footer">
                <span class="status-badge" style="color:${st.color};background:${st.bg}">${st.label}</span>
                ${p.startDate ? `<span class="project-dates">з ${formatDate(p.startDate)}</span>` : ''}
              </div>
            </div>
          `
        }).join('')}
      </div>
    `

    el.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        openModal(projects.find(p => p.id === btn.dataset.id))
      })
    })

    el.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        if (!confirm('Видалити проект?')) return
        await deleteDoc(doc(db, 'users', user.uid, 'projects', btn.dataset.id))
        await loadProjects()
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
  function openModal(project = null) {
    editingId = project?.id || null
    container.querySelector('#modal-title').textContent = project ? 'Редагувати проект' : 'Новий проект'
    container.querySelector('#f-name').value     = project?.name        || ''
    container.querySelector('#f-desc').value     = project?.description || ''
    container.querySelector('#f-client').value   = project?.client      || ''
    container.querySelector('#f-budget').value   = project?.budget      || ''
    container.querySelector('#f-start').value    = project?.startDate   || ''
    container.querySelector('#f-deadline').value = project?.deadline    || ''
    container.querySelector('#f-status').value   = project?.status      || 'active'
    container.querySelector('#f-progress').value = project?.progress    ?? ''
    container.querySelector('#e-name').textContent = ''
    container.querySelector('#modal').style.display = 'flex'
    setTimeout(() => container.querySelector('#f-name').focus(), 100)
  }

  function closeModal() {
    container.querySelector('#modal').style.display = 'none'
    editingId = null
  }

  container.querySelector('#add-project-btn').addEventListener('click', () => {
    if (!checkPlanLimit(profile, 'projects', projects.length)) return
    openModal()
  })
  container.querySelector('#modal-close').addEventListener('click', closeModal)
  container.querySelector('#modal-cancel').addEventListener('click', closeModal)
  container.querySelector('#modal').addEventListener('click', (e) => {
    if (e.target === container.querySelector('#modal')) closeModal()
  })

  // ── Save ──────────────────────────────────────────────────
  container.querySelector('#project-form').addEventListener('submit', async (e) => {
    e.preventDefault()

    const name = container.querySelector('#f-name').value.trim()
    if (!name) {
      container.querySelector('#e-name').textContent = 'Введіть назву проекту'
      return
    }

    const btn = container.querySelector('#modal-submit')
    btn.disabled = true
    btn.innerHTML = '<div class="spinner"></div>'

    const rawProgress = parseInt(container.querySelector('#f-progress').value, 10)
    const data = {
      name,
      description: container.querySelector('#f-desc').value.trim()   || null,
      client:      container.querySelector('#f-client').value.trim() || null,
      budget:      parseFloat(container.querySelector('#f-budget').value) || null,
      startDate:   container.querySelector('#f-start').value         || null,
      deadline:    container.querySelector('#f-deadline').value       || null,
      status:      container.querySelector('#f-status').value,
      progress:    isNaN(rawProgress) ? 0 : Math.min(100, Math.max(0, rawProgress)),
    }

    try {
      if (editingId) {
        await updateDoc(doc(db, 'users', user.uid, 'projects', editingId), {
          ...data, updatedAt: serverTimestamp()
        })
      } else {
        await addDoc(collection(db, 'users', user.uid, 'projects'), {
          ...data, createdAt: serverTimestamp()
        })
      }
      closeModal()
      await loadProjects()
    } catch (err) {
      console.error(err)
    } finally {
      btn.disabled = false
      btn.innerHTML = 'Зберегти'
    }
  })

  await loadProjects()

  // ── Helpers ───────────────────────────────────────────────
  function updateCount() {
    const active = projects.filter(p => p.status === 'active').length
    const total  = projects.length
    container.querySelector('#projects-count').textContent =
      total === 0 ? 'Проектів немає' : `${total} проектів · ${active} активних`
  }

  function formatDate(dateStr) {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }
}

// ── Styles ────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('projects-styles')) return
  const style = document.createElement('style')
  style.id = 'projects-styles'
  style.textContent = `
    .projects-page { padding: 32px 36px; max-width: 1100px; }

    .page-header   { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:24px; }
    .page-title    { font-family:var(--font-display); font-size:26px; font-weight:700; letter-spacing:-0.02em; margin-bottom:4px; }
    .page-subtitle { font-size:13px; color:var(--text-secondary); }

    .filter-tabs { display:flex; gap:8px; margin-bottom:20px; }
    .filter-tab  { padding:7px 16px; border-radius:var(--radius-full); font-size:13px; font-weight:600; color:var(--text-secondary); background:var(--bg-secondary); border:1px solid var(--border); cursor:pointer; transition:all .2s; }
    .filter-tab:hover { border-color:var(--accent-blue); color:var(--text-primary); }
    .filter-tab.active { background:var(--accent-blue); border-color:var(--accent-blue); color:#fff; }

    .loading-wrap { display:flex; justify-content:center; padding:60px; }

    .projects-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:16px; }

    .project-card { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-lg); padding:20px; transition:all .2s; cursor:default; display:flex; flex-direction:column; gap:12px; }
    .project-card:hover { border-color:rgba(255,255,255,0.12); transform:translateY(-2px); box-shadow:var(--shadow-md); }

    .project-card-top { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
    .project-name     { font-weight:700; font-size:16px; line-height:1.3; }
    .project-actions  { display:flex; gap:4px; opacity:0; transition:opacity .2s; flex-shrink:0; }
    .project-card:hover .project-actions { opacity:1; }
    .icon-btn { width:28px; height:28px; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:14px; cursor:pointer; transition:background .2s; }
    .icon-btn:hover { background:rgba(255,255,255,0.08); }

    .project-desc { font-size:13px; color:var(--text-secondary); line-height:1.5; }

    .project-meta { display:flex; gap:8px; flex-wrap:wrap; }
    .meta-chip    { font-size:12px; color:var(--text-secondary); background:var(--bg-tertiary); border-radius:var(--radius-full); padding:3px 10px; }
    .chip-danger  { color:#EF4444; background:rgba(239,68,68,0.12); }

    .progress-row       { display:flex; align-items:center; gap:10px; }
    .progress-bar-wrap  { flex:1; height:6px; background:var(--bg-tertiary); border-radius:3px; overflow:hidden; }
    .progress-bar-fill  { height:100%; border-radius:3px; transition:width .4s ease; }
    .progress-value     { font-size:12px; font-weight:700; color:var(--text-secondary); min-width:32px; text-align:right; }

    .project-footer { display:flex; align-items:center; justify-content:space-between; }
    .status-badge   { font-size:11px; font-weight:700; padding:4px 10px; border-radius:var(--radius-full); }
    .project-dates  { font-size:12px; color:var(--text-muted); }

    .empty-state { text-align:center; padding:80px 24px; grid-column:1/-1; }
    .empty-icon  { font-size:48px; margin-bottom:16px; }
    .empty-title { font-family:var(--font-display); font-size:18px; font-weight:600; margin-bottom:8px; }
    .empty-desc  { font-size:14px; color:var(--text-muted); }

    .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.6); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; z-index:1000; padding:24px; }
    .modal       { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-xl); width:100%; max-width:560px; box-shadow:var(--shadow-xl); animation:scaleIn .2s cubic-bezier(0.34,1.2,0.64,1); }
    .modal-wide  { max-width:760px; }
    .modal-header{ display:flex; align-items:center; justify-content:space-between; padding:24px 24px 0; }
    .modal-title { font-family:var(--font-display); font-size:20px; font-weight:700; }
    .modal-close { width:32px; height:32px; border-radius:8px; color:var(--text-muted); font-size:16px; display:flex; align-items:center; justify-content:center; transition:all .2s; cursor:pointer; }
    .modal-close:hover { background:var(--accent-red-dim); color:var(--accent-red); }
    .modal-body  { padding:20px 24px; display:flex; flex-direction:column; gap:14px; }
    .modal-footer{ display:flex; gap:10px; justify-content:flex-end; padding:0 24px 24px; }
    .form-row    { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .field label { display:block; font-size:12px; font-weight:600; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:6px; }
    .field-error { font-size:12px; color:#EF4444; margin-top:4px; display:block; }

    @keyframes scaleIn { from{opacity:0;transform:scale(0.95)} to{opacity:1;transform:scale(1)} }
  `
  document.head.appendChild(style)
}
