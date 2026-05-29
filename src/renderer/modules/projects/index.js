// src/renderer/modules/projects/index.js
import { db } from '../../services/firebase.js'
import { getCurrentUser, getUserProfile, getActivePathSegments } from '../../services/auth.js'
import { checkPlanLimit } from '../../services/plan-guard.js'
import { icon } from '../../utils/icons.js'
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
    <div class="pr-layout">

      <!-- ══ LEFT ══ -->
      <div class="pr-left" id="pr-left">

        <div class="pr-header">
          <div>
            <h1 class="pr-title">Проекти</h1>
            <p class="pr-sub" id="projects-count">Завантаження...</p>
          </div>
          <button class="btn btn-primary" id="add-project-btn">+ Новий проект</button>
        </div>

        <!-- Stats -->
        <div class="pr-stats" id="pr-stats"></div>

        <!-- Filters -->
        <div class="pr-filters" id="filter-tabs">
          <button class="pr-filter active" data-filter="all">Всі</button>
          <button class="pr-filter" data-filter="active">Активні</button>
          <button class="pr-filter" data-filter="paused">Призупинені</button>
          <button class="pr-filter" data-filter="done">Завершені</button>
          <button class="pr-filter" data-filter="cancelled">Скасовані</button>
        </div>

        <div id="projects-list">
          <div class="pr-loading"><div class="spinner"></div></div>
        </div>

      </div>

      <!-- ══ RIGHT: project detail ══ -->
      <div class="pr-right" id="pr-right" style="display:none">
        <div id="pr-detail"></div>
      </div>

    </div>

    <!-- Modal -->
    <div class="pr-overlay" id="modal" style="display:none">
      <div class="pr-modal">
        <div class="pr-modal-hd">
          <h2 class="pr-modal-title" id="modal-title">Новий проект</h2>
          <button class="pr-modal-x" id="modal-close">${icon('x', 14)}</button>
        </div>
        <form id="project-form" novalidate>
          <div class="pr-modal-body">

            <div class="field">
              <label>Назва проекту *</label>
              <input id="f-name" type="text" class="input" placeholder="Назва проекту..." />
              <span class="field-error" id="e-name"></span>
            </div>

            <div class="field">
              <label>Опис</label>
              <textarea id="f-desc" class="input" rows="3" placeholder="Короткий опис..." style="resize:vertical"></textarea>
            </div>

            <div class="pr-row">
              <div class="field">
                <label>Клієнт</label>
                <input id="f-client" type="text" class="input" placeholder="Ім'я або компанія" />
              </div>
              <div class="field">
                <label>Бюджет (₴)</label>
                <input id="f-budget" type="number" class="input" placeholder="0" min="0" />
              </div>
            </div>

            <div class="pr-row">
              <div class="field">
                <label>Дата початку</label>
                <input id="f-start" type="date" class="input" />
              </div>
              <div class="field">
                <label>Дедлайн</label>
                <input id="f-deadline" type="date" class="input" />
              </div>
            </div>

            <div class="pr-row">
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
          <div class="pr-modal-ft">
            <button type="button" class="btn btn-secondary" id="modal-cancel">Скасувати</button>
            <button type="submit" class="btn btn-primary" id="modal-submit">Зберегти</button>
          </div>
        </form>
      </div>
    </div>
  `

  let projects   = []
  let editingId  = null
  let filter     = 'all'
  let selectedId = null
  const user     = getCurrentUser()
  const base     = getActivePathSegments(user.uid)
  const profile  = await getUserProfile(user.uid)

  // ── Load ──────────────────────────────────────────────────
  async function loadProjects() {
    try {
      const q    = query(collection(db, ...base, 'projects'), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      projects   = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      renderStats()
      renderList()
    } catch (err) {
      console.error(err)
    }
  }

  // ── Stats ─────────────────────────────────────────────────
  function renderStats() {
    const total    = projects.length
    const active   = projects.filter(p => p.status === 'active').length
    const done     = projects.filter(p => p.status === 'done').length
    const overdue  = projects.filter(p => p.deadline && p.status !== 'done' && new Date(p.deadline) < new Date()).length

    const sub = container.querySelector('#projects-count')
    sub.textContent = total === 0 ? 'Проектів немає' : `${total} проектів · ${active} активних`

    const el = container.querySelector('#pr-stats')
    if (total === 0) { el.innerHTML = ''; return }
    el.innerHTML = `
      <div class="pr-stat" style="--sc:#4F8EF7"><span class="pr-stat-n">${active}</span><span class="pr-stat-l">Активних</span></div>
      <div class="pr-stat" style="--sc:#34D399"><span class="pr-stat-n">${done}</span><span class="pr-stat-l">Завершено</span></div>
      ${overdue > 0 ? `<div class="pr-stat" style="--sc:#EF4444"><span class="pr-stat-n">${overdue}</span><span class="pr-stat-l">Прострочено</span></div>` : ''}
      <div class="pr-stat" style="--sc:#94A3B8"><span class="pr-stat-n">${total}</span><span class="pr-stat-l">Всього</span></div>
    `
  }

  // ── Render list ───────────────────────────────────────────
  function renderList() {
    const el       = container.querySelector('#projects-list')
    const filtered = filter === 'all' ? projects : projects.filter(p => p.status === filter)

    if (filtered.length === 0) {
      el.innerHTML = `
        <div class="pr-empty">
          <div class="pr-empty-icon">${icon('projects', 48)}</div>
          <div class="pr-empty-title">${filter !== 'all' ? 'Немає проектів з таким статусом' : 'Проектів ще немає'}</div>
          <div class="pr-empty-desc">Натисніть "+ Новий проект" щоб додати</div>
        </div>`
      return
    }

    el.innerHTML = `<div class="pr-grid">${filtered.map(p => {
      const st      = STATUS_META[p.status] || STATUS_META.active
      const prog    = Math.min(100, Math.max(0, p.progress || 0))
      const overdue = p.deadline && p.status !== 'done' && new Date(p.deadline) < new Date()
      const sel     = p.id === selectedId
      return `
        <div class="pr-card ${sel ? 'pr-selected' : ''}" data-id="${p.id}" style="--pa:${st.color}">
          <div class="pr-card-stripe"></div>
          <div class="pr-card-body">
            <div class="pr-card-top">
              <span class="pr-st-badge" style="color:${st.color};background:${st.bg}">${st.label}</span>
              <div class="pr-card-btns">
                <button class="pr-icon-btn pr-edit" data-id="${p.id}">${icon('pencil', 13)}</button>
                <button class="pr-icon-btn pr-del"  data-id="${p.id}">${icon('trash', 13)}</button>
              </div>
            </div>

            <div class="pr-card-name">${p.name}</div>
            ${p.description ? `<div class="pr-card-desc">${p.description}</div>` : ''}

            <div class="pr-card-chips">
              ${p.client   ? `<span class="pr-chip">${p.client}</span>` : ''}
              ${p.budget   ? `<span class="pr-chip">₴${Number(p.budget).toLocaleString('uk-UA')}</span>` : ''}
              ${p.deadline ? `<span class="pr-chip ${overdue ? 'pr-chip-danger' : ''}">${formatDate(p.deadline)}</span>` : ''}
            </div>

            <div class="pr-progress-row">
              <div class="pr-prog-wrap">
                <div class="pr-prog-fill" style="width:${prog}%;background:${st.color}"></div>
              </div>
              <span class="pr-prog-val">${prog}%</span>
            </div>
          </div>
        </div>`
    }).join('')}</div>`

    el.querySelectorAll('.pr-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('.pr-icon-btn')) return
        openDetail(card.dataset.id)
      })
    })

    el.querySelectorAll('.pr-edit').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation()
        openModal(projects.find(p => p.id === btn.dataset.id))
      })
    })

    el.querySelectorAll('.pr-del').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation()
        if (!confirm('Видалити проект?')) return
        if (selectedId === btn.dataset.id) closeDetail()
        await deleteDoc(doc(db, ...base, 'projects', btn.dataset.id))
        await loadProjects()
      })
    })
  }

  // ── Detail panel ──────────────────────────────────────────
  function openDetail(id) {
    selectedId = id
    renderList()
    const p = projects.find(x => x.id === id)
    if (!p) return
    const right = container.querySelector('#pr-right')
    const detEl = container.querySelector('#pr-detail')
    right.style.display = 'flex'

    const st      = STATUS_META[p.status] || STATUS_META.active
    const prog    = Math.min(100, Math.max(0, p.progress || 0))
    const overdue = p.deadline && p.status !== 'done' && new Date(p.deadline) < new Date()

    detEl.innerHTML = `
      <div class="prd-wrap">
        <div class="prd-hd">
          <div class="prd-stripe" style="background:${st.color}"></div>
          <button class="prd-close" id="prd-close">${icon('x', 14)}</button>
        </div>
        <div class="prd-body">

          <div class="prd-name">${p.name}</div>
          <span class="pr-st-badge prd-st" style="color:${st.color};background:${st.bg}">${st.label}</span>

          <!-- Progress -->
          <div class="prd-section">
            <div class="prd-label">Прогрес</div>
            <div class="prd-prog-row">
              <div class="prd-prog-wrap">
                <div class="prd-prog-fill" style="width:${prog}%;background:${st.color}"></div>
              </div>
              <span class="prd-prog-val" style="color:${st.color}">${prog}%</span>
            </div>
          </div>

          ${p.description ? `
          <div class="prd-section">
            <div class="prd-label">Опис</div>
            <div class="prd-desc-box">${p.description}</div>
          </div>` : ''}

          <div class="prd-section">
            <div class="prd-label">Деталі</div>
            <div class="prd-info-list">
              ${p.client    ? `<div class="prd-row"><span class="prd-key">Клієнт</span><span>${p.client}</span></div>` : ''}
              ${p.budget    ? `<div class="prd-row"><span class="prd-key">Бюджет</span><span>₴${Number(p.budget).toLocaleString('uk-UA')}</span></div>` : ''}
              ${p.startDate ? `<div class="prd-row"><span class="prd-key">Початок</span><span>${formatDate(p.startDate)}</span></div>` : ''}
              ${p.deadline  ? `<div class="prd-row"><span class="prd-key">Дедлайн</span><span class="${overdue ? 'prd-overdue' : ''}">${formatDate(p.deadline)}</span></div>` : ''}
            </div>
          </div>

          <!-- Quick status change -->
          <div class="prd-section">
            <div class="prd-label">Змінити статус</div>
            <div class="prd-status-row">
              ${Object.entries(STATUS_META).map(([key, s]) => `
                <button class="prd-st-btn ${p.status === key ? 'active' : ''}"
                  data-status="${key}"
                  style="--sc:${s.color};${p.status === key ? `background:${s.bg};border-color:${s.color};color:${s.color}` : ''}">
                  ${s.label}
                </button>`).join('')}
            </div>
          </div>

          <!-- Quick progress update -->
          <div class="prd-section">
            <div class="prd-label">Оновити прогрес</div>
            <div class="prd-prog-input-row">
              <input type="range" id="prd-prog-slider" min="0" max="100" value="${prog}"
                class="prd-slider" style="--sc:${st.color}" />
              <span class="prd-slider-val" id="prd-slider-val">${prog}%</span>
            </div>
            <button class="btn btn-secondary prd-prog-save" id="prd-prog-save">Зберегти прогрес</button>
          </div>

        </div>
        <div class="prd-footer">
          <button class="btn btn-secondary" id="prd-edit">Редагувати</button>
          <button class="btn prd-del-btn" id="prd-delete">Видалити</button>
        </div>
      </div>
    `

    detEl.querySelector('#prd-close').addEventListener('click', closeDetail)
    detEl.querySelector('#prd-edit').addEventListener('click', () => openModal(p))
    detEl.querySelector('#prd-delete').addEventListener('click', async () => {
      if (!confirm('Видалити проект?')) return
      await deleteDoc(doc(db, ...base, 'projects', p.id))
      closeDetail()
      await loadProjects()
    })

    const slider  = detEl.querySelector('#prd-prog-slider')
    const slLabel = detEl.querySelector('#prd-slider-val')
    slider.addEventListener('input', () => { slLabel.textContent = slider.value + '%' })

    detEl.querySelector('#prd-prog-save').addEventListener('click', async () => {
      await updateDoc(doc(db, ...base, 'projects', p.id), {
        progress: Number(slider.value), updatedAt: serverTimestamp()
      })
      await loadProjects()
      openDetail(id)
    })

    detEl.querySelectorAll('.prd-st-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        await updateDoc(doc(db, ...base, 'projects', p.id), {
          status: btn.dataset.status, updatedAt: serverTimestamp()
        })
        await loadProjects()
        openDetail(id)
      })
    })
  }

  function closeDetail() {
    selectedId = null
    container.querySelector('#pr-right').style.display = 'none'
    renderList()
  }

  // ── Filter tabs ───────────────────────────────────────────
  container.querySelector('#filter-tabs').addEventListener('click', e => {
    const tab = e.target.closest('.pr-filter')
    if (!tab) return
    container.querySelectorAll('.pr-filter').forEach(t => t.classList.remove('active'))
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
    setTimeout(() => container.querySelector('#f-name').focus(), 80)
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
  container.querySelector('#modal').addEventListener('click', e => {
    if (e.target === container.querySelector('#modal')) closeModal()
  })

  // ── Save ──────────────────────────────────────────────────
  container.querySelector('#project-form').addEventListener('submit', async e => {
    e.preventDefault()
    const name = container.querySelector('#f-name').value.trim()
    if (!name) { container.querySelector('#e-name').textContent = 'Введіть назву'; return }

    const btn = container.querySelector('#modal-submit')
    btn.disabled = true; btn.innerHTML = '<div class="spinner"></div>'

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
        await updateDoc(doc(db, ...base, 'projects', editingId), { ...data, updatedAt: serverTimestamp() })
      } else {
        await addDoc(collection(db, ...base, 'projects'), { ...data, createdAt: serverTimestamp() })
      }
      closeModal()
      await loadProjects()
      if (editingId && selectedId === editingId) openDetail(editingId)
    } catch (err) { console.error(err) } finally {
      btn.disabled = false; btn.innerHTML = 'Зберегти'
    }
  })

  await loadProjects()

  function formatDate(d) {
    if (!d) return ''
    return new Date(d).toLocaleDateString('uk-UA', { day:'2-digit', month:'2-digit', year:'numeric' })
  }
}

// ── Styles ────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('projects-styles')) return
  const style = document.createElement('style')
  style.id = 'projects-styles'
  style.textContent = `
    /* Layout */
    .pr-layout { display:flex; height:100%; overflow:hidden; }
    .pr-left   { flex:1; min-width:0; padding:32px 28px; overflow-y:auto; }
    .pr-right  { width:360px; flex-shrink:0; border-left:1px solid var(--border); overflow-y:auto; background:var(--bg-primary); display:flex; flex-direction:column; }

    /* Header */
    .pr-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:18px; }
    .pr-title  { font-family:var(--font-display); font-size:26px; font-weight:700; letter-spacing:-0.02em; margin-bottom:4px; }
    .pr-sub    { font-size:13px; color:var(--text-secondary); }

    /* Stats */
    .pr-stats  { display:flex; gap:10px; margin-bottom:16px; flex-wrap:wrap; }
    .pr-stat   { display:flex; align-items:center; gap:8px; background:var(--bg-secondary); border:1px solid var(--border); border-left:3px solid var(--sc); border-radius:var(--radius-lg); padding:8px 14px; }
    .pr-stat-n { font-family:var(--font-display); font-size:20px; font-weight:800; color:var(--sc); }
    .pr-stat-l { font-size:12px; color:var(--text-muted); }

    /* Filters */
    .pr-filters { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:18px; }
    .pr-filter  { padding:6px 14px; border-radius:var(--radius-full); font-size:13px; font-weight:500; color:var(--text-secondary); background:transparent; border:1.5px solid var(--border); cursor:pointer; transition:all .2s; }
    .pr-filter:hover  { border-color:rgba(255,255,255,.2); color:var(--text-primary); }
    .pr-filter.active { background:var(--accent-blue); border-color:var(--accent-blue); color:#fff; }

    /* Loading */
    .pr-loading { display:flex; justify-content:center; padding:60px; }

    /* Grid */
    .pr-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(270px, 1fr)); gap:16px; }

    /* Card */
    .pr-card {
      background:var(--bg-secondary); border:1.5px solid var(--border);
      border-radius:var(--radius-xl); overflow:hidden;
      display:flex; flex-direction:column; cursor:pointer;
      transition:transform .2s, box-shadow .2s, border-color .2s;
    }
    .pr-card:hover    { transform:translateY(-3px); box-shadow:0 10px 30px rgba(0,0,0,.3); border-color:var(--pa); }
    .pr-selected      { border-color:var(--accent-blue) !important; box-shadow:0 0 0 2px rgba(79,142,247,.25) !important; }
    .pr-card-stripe   { height:3px; background:var(--pa, var(--border)); flex-shrink:0; }
    .pr-card-body     { padding:16px; display:flex; flex-direction:column; gap:10px; flex:1; }
    .pr-card-top      { display:flex; align-items:center; justify-content:space-between; }
    .pr-st-badge      { font-size:11px; font-weight:700; padding:3px 10px; border-radius:var(--radius-full); white-space:nowrap; }
    .pr-card-btns     { display:flex; gap:4px; opacity:0; transition:opacity .2s; }
    .pr-card:hover .pr-card-btns { opacity:1; }
    .pr-icon-btn      { width:28px; height:28px; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:13px; cursor:pointer; transition:background .2s; }
    .pr-icon-btn:hover { background:rgba(255,255,255,.1); }

    .pr-card-name { font-weight:700; font-size:16px; line-height:1.35; }
    .pr-card-desc { font-size:13px; color:var(--text-secondary); line-height:1.5; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; flex:1; }

    .pr-card-chips { display:flex; gap:6px; flex-wrap:wrap; }
    .pr-chip       { font-size:11px; color:var(--text-secondary); background:var(--bg-tertiary); border:1px solid var(--border); border-radius:var(--radius-full); padding:3px 9px; }
    .pr-chip-danger { color:#EF4444; background:rgba(239,68,68,.08); border-color:rgba(239,68,68,.2); }

    .pr-progress-row { display:flex; align-items:center; gap:10px; padding-top:4px; }
    .pr-prog-wrap    { flex:1; height:5px; background:rgba(255,255,255,.08); border-radius:3px; overflow:hidden; }
    .pr-prog-fill    { height:100%; border-radius:3px; transition:width .5s cubic-bezier(.34,1.56,.64,1); }
    .pr-prog-val     { font-size:12px; font-weight:700; color:var(--text-muted); min-width:32px; text-align:right; }

    /* Empty */
    .pr-empty       { text-align:center; padding:60px 24px; grid-column:1/-1; }
    .pr-empty-icon  { display:flex; align-items:center; justify-content:center; margin-bottom:14px; color:var(--text-muted); }
    .pr-empty-title { font-family:var(--font-display); font-size:18px; font-weight:600; margin-bottom:6px; }
    .pr-empty-desc  { font-size:13px; color:var(--text-muted); }

    /* ── Detail panel ── */
    .prd-wrap   { display:flex; flex-direction:column; height:100%; }
    .prd-hd     { position:relative; display:flex; justify-content:flex-end; padding:14px 16px 0; flex-shrink:0; }
    .prd-stripe { position:absolute; top:0; left:0; right:0; height:3px; }
    .prd-close  { width:30px; height:30px; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:14px; color:var(--text-muted); transition:all .2s; }
    .prd-close:hover { background:var(--accent-red-dim); color:var(--accent-red); }

    .prd-body   { padding:16px 20px; display:flex; flex-direction:column; gap:18px; flex:1; overflow-y:auto; }
    .prd-name   { font-family:var(--font-display); font-size:20px; font-weight:800; line-height:1.3; }
    .prd-st     { font-size:13px !important; padding:5px 14px !important; align-self:flex-start; }

    .prd-section { display:flex; flex-direction:column; gap:8px; }
    .prd-label   { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--text-muted); }

    .prd-prog-row  { display:flex; align-items:center; gap:12px; }
    .prd-prog-wrap { flex:1; height:8px; background:rgba(255,255,255,.08); border-radius:4px; overflow:hidden; }
    .prd-prog-fill { height:100%; border-radius:4px; transition:width .5s; }
    .prd-prog-val  { font-family:var(--font-mono); font-size:14px; font-weight:800; min-width:40px; text-align:right; }

    .prd-desc-box  { background:var(--bg-secondary); border-radius:var(--radius-lg); padding:12px 14px; font-size:13px; color:var(--text-secondary); line-height:1.6; white-space:pre-wrap; }
    .prd-info-list { display:flex; flex-direction:column; gap:8px; }
    .prd-row       { display:flex; justify-content:space-between; font-size:13px; gap:12px; }
    .prd-key       { color:var(--text-muted); flex-shrink:0; }
    .prd-overdue   { color:#EF4444; font-weight:700; }

    .prd-status-row { display:flex; gap:6px; flex-wrap:wrap; }
    .prd-st-btn     { padding:6px 12px; border-radius:var(--radius-full); font-size:12px; font-weight:600; cursor:pointer; border:1.5px solid var(--border); color:var(--text-muted); background:transparent; transition:all .2s; }
    .prd-st-btn:hover { border-color:var(--sc); color:var(--sc); }
    .prd-st-btn.active { font-weight:700; }

    .prd-prog-input-row { display:flex; align-items:center; gap:12px; }
    .prd-slider { flex:1; height:6px; cursor:pointer; accent-color:var(--sc, var(--accent-blue)); }
    .prd-slider-val { font-family:var(--font-mono); font-size:14px; font-weight:700; min-width:40px; text-align:right; color:var(--sc, var(--accent-blue)); }
    .prd-prog-save { align-self:flex-start; margin-top:4px; }

    .prd-footer { padding:16px 20px; display:flex; gap:8px; border-top:1px solid var(--border); flex-shrink:0; }
    .prd-del-btn { background:rgba(239,68,68,.1); color:#EF4444; border:1px solid rgba(239,68,68,.25); font-weight:600; border-radius:var(--radius-md); padding:8px 16px; cursor:pointer; font-size:13px; transition:all .2s; }
    .prd-del-btn:hover { background:rgba(239,68,68,.2); }

    /* Modal */
    .pr-overlay   { position:fixed; inset:0; background:rgba(0,0,0,.6); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; z-index:1000; padding:24px; }
    .pr-modal     { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-xl); width:100%; max-width:560px; box-shadow:var(--shadow-xl); animation:prModalIn .2s cubic-bezier(.34,1.2,.64,1); max-height:90vh; display:flex; flex-direction:column; overflow:hidden; }
    .pr-modal-hd  { display:flex; align-items:center; justify-content:space-between; padding:20px 24px 0; flex-shrink:0; }
    .pr-modal-title { font-family:var(--font-display); font-size:20px; font-weight:700; }
    .pr-modal-x   { width:32px; height:32px; border-radius:8px; color:var(--text-muted); font-size:16px; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all .2s; }
    .pr-modal-x:hover { background:var(--accent-red-dim); color:var(--accent-red); }
    .pr-modal-body { padding:20px 24px; display:flex; flex-direction:column; gap:14px; overflow-y:auto; }
    .pr-modal-ft  { padding:0 24px 20px; display:flex; gap:10px; justify-content:flex-end; flex-shrink:0; }
    .pr-row       { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .field label  { display:block; font-size:12px; font-weight:600; color:var(--text-secondary); text-transform:uppercase; letter-spacing:.05em; margin-bottom:6px; }
    .field-error  { font-size:12px; color:#EF4444; margin-top:4px; display:block; }

    @keyframes prModalIn { from{opacity:0;transform:scale(.95)} to{opacity:1;transform:scale(1)} }
  `
  document.head.appendChild(style)
}
