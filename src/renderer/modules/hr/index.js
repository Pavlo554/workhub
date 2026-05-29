// src/renderer/modules/hr/index.js
import { icon } from '../../utils/icons.js'
import { db } from '../../services/firebase.js'
import { getCurrentUser, getActivePathSegments } from '../../services/auth.js'
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, orderBy, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

const STATUS = {
  active:  { label: 'Активний',  color: '#34D399', bg: 'rgba(52,211,153,.12)' },
  trial:   { label: 'Випробний', color: '#F59E0B', bg: 'rgba(245,158,11,.12)' },
  fired:   { label: 'Звільнений',color: '#EF4444', bg: 'rgba(239,68,68,.12)' },
}

export async function render(container) {
  injectStyles()
  const user = getCurrentUser()
  const base = getActivePathSegments(user.uid)
  let employees = []
  let editEmp = null
  let activeStatus = 'all'

  async function load() {
    try {
      const snap = await getDocs(query(collection(db, ...base, 'employees'), orderBy('createdAt', 'desc')))
      employees = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch { employees = [] }
    rerender()
  }

  function rerender() {
    const filtered = activeStatus === 'all' ? employees : employees.filter(e => e.status === activeStatus)
    const active   = employees.filter(e => e.status === 'active').length
    const totalSalary = employees.filter(e => e.status !== 'fired').reduce((s, e) => s + (e.salary || 0), 0)

    container.innerHTML = `
      <div class="hr-page">
        <div class="hr-header">
          <div>
            <h1 class="hr-title">${icon('user', 20)} Персонал та HR</h1>
            <p class="hr-subtitle">${active} активних · ${employees.length} всього</p>
          </div>
          <button class="hr-add-btn" id="hr-add">+ Співробітник</button>
        </div>

        <div class="hr-kpi-row">
          <div class="hr-kpi">
            <div class="hr-kpi-icon" style="color:#4F8EF7">${icon('user', 18)}</div>
            <div class="hr-kpi-val">${employees.length}</div>
            <div class="hr-kpi-label">Всього</div>
          </div>
          <div class="hr-kpi">
            <div class="hr-kpi-icon" style="color:#34D399">${icon('check-circle', 18)}</div>
            <div class="hr-kpi-val" style="color:#34D399">${active}</div>
            <div class="hr-kpi-label">Активних</div>
          </div>
          <div class="hr-kpi">
            <div class="hr-kpi-icon" style="color:#F59E0B">${icon('timer', 18)}</div>
            <div class="hr-kpi-val" style="color:#F59E0B">${employees.filter(e=>e.status==='trial').length}</div>
            <div class="hr-kpi-label">Випробний термін</div>
          </div>
          <div class="hr-kpi">
            <div class="hr-kpi-icon" style="color:#A78BFA">${icon('finances', 18)}</div>
            <div class="hr-kpi-val">₴${totalSalary.toLocaleString('uk-UA')}</div>
            <div class="hr-kpi-label">Фонд оплати праці</div>
          </div>
        </div>

        <div class="hr-filter-pills">
          <button class="hr-pill ${activeStatus==='all'?'active':''}" data-s="all">Всі (${employees.length})</button>
          ${Object.entries(STATUS).map(([k,v]) => {
            const cnt = employees.filter(e => e.status === k).length
            return `<button class="hr-pill ${activeStatus===k?'active':''}" data-s="${k}" style="${activeStatus===k?`--sc:${v.color}`:''}">
              ${v.label} (${cnt})
            </button>`
          }).join('')}
        </div>

        ${filtered.length ? `
        <div class="hr-grid">
          ${filtered.map(emp => {
            const st = STATUS[emp.status] || STATUS.active
            return `
              <div class="hr-card">
                <div class="hr-card-head">
                  <div class="hr-avatar" style="background:${['#4F8EF7','#A78BFA','#34D399','#F59E0B','#F472B6','#FB923C','#38BDF8'][(emp.name||'?').charCodeAt(0)%7]}">${(emp.name||'?')[0].toUpperCase()}</div>
                  <div class="hr-card-info">
                    <div class="hr-card-name">${emp.name}</div>
                    <div class="hr-card-role">${emp.role || '—'}</div>
                  </div>
                  <div class="hr-card-btns">
                    <button class="hr-cb hr-edit" data-id="${emp.id}">${icon('pencil', 13)}</button>
                    <button class="hr-cb hr-del"  data-id="${emp.id}">${icon('trash', 13)}</button>
                  </div>
                </div>
                <div class="hr-card-body">
                  <span class="hr-status-badge" style="color:${st.color};background:${st.bg}">${st.label}</span>
                  ${emp.salary ? `<span class="hr-salary">₴${Number(emp.salary).toLocaleString('uk-UA')}/міс</span>` : ''}
                </div>
                <div class="hr-card-meta">
                  ${emp.phone    ? `<div class="hr-meta-row">${icon('phone', 11)} ${emp.phone}</div>` : ''}
                  ${emp.email    ? `<div class="hr-meta-row">${icon('mail', 11)} ${emp.email}</div>` : ''}
                  ${emp.startDate? `<div class="hr-meta-row">${icon('calendar', 11)} Від ${emp.startDate}</div>` : ''}
                  ${emp.schedule ? `<div class="hr-meta-row">${icon('timer', 11)} ${emp.schedule}</div>` : ''}
                </div>
                ${emp.notes ? `<div class="hr-card-notes">${emp.notes}</div>` : ''}
              </div>
            `
          }).join('')}
        </div>` : `
        <div class="hr-empty">
          <div style="display:flex;align-items:center;justify-content:center;margin-bottom:12px;color:var(--text-muted);opacity:.4">${icon('user', 48)}</div>
          <div class="hr-empty-title">Команди ще немає</div>
          <div class="hr-empty-desc">Додайте першого співробітника</div>
          <button class="hr-add-btn" id="hr-add-empty">+ Додати співробітника</button>
        </div>`}
      </div>

      <!-- Modal -->
      <div class="hr-overlay" id="hr-modal" style="display:none">
        <div class="hr-modal">
          <div class="hr-modal-head">
            <h2 id="hr-modal-title">Новий співробітник</h2>
            <button id="hr-modal-close">${icon('x', 14)}</button>
          </div>
          <div class="hr-modal-body">
            <div class="hr-form-row">
              <div class="hr-field"><label>Ім'я *</label><input id="hr-f-name" class="hr-input" type="text" placeholder="Повне ім'я..."></div>
              <div class="hr-field"><label>Посада</label><input id="hr-f-role" class="hr-input" type="text" placeholder="Менеджер, Дизайнер..."></div>
            </div>
            <div class="hr-form-row">
              <div class="hr-field"><label>Статус</label><select id="hr-f-status" class="hr-input">${Object.entries(STATUS).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('')}</select></div>
              <div class="hr-field"><label>Зарплата (₴/міс)</label><input id="hr-f-salary" class="hr-input" type="number" min="0" placeholder="0"></div>
            </div>
            <div class="hr-form-row">
              <div class="hr-field"><label>Телефон</label><input id="hr-f-phone" class="hr-input" type="tel" placeholder="+380..."></div>
              <div class="hr-field"><label>Email</label><input id="hr-f-email" class="hr-input" type="email" placeholder="name@email.com"></div>
            </div>
            <div class="hr-form-row">
              <div class="hr-field"><label>Дата початку</label><input id="hr-f-start" class="hr-input" type="date"></div>
              <div class="hr-field"><label>Графік</label><input id="hr-f-schedule" class="hr-input" type="text" placeholder="Пн-Пт 9:00-18:00"></div>
            </div>
            <div class="hr-field"><label>Нотатки</label><textarea id="hr-f-notes" class="hr-input hr-textarea" rows="2" placeholder="Додаткова інформація..."></textarea></div>
          </div>
          <div class="hr-modal-foot">
            <button class="hr-btn-sec" id="hr-modal-cancel">Скасувати</button>
            <button class="hr-btn-pri" id="hr-modal-save">Зберегти</button>
          </div>
        </div>
      </div>
    `
    attachEvents()
  }

  function attachEvents() {
    container.querySelector('#hr-add')?.addEventListener('click', () => openModal())
    container.querySelector('#hr-add-empty')?.addEventListener('click', () => openModal())
    container.querySelector('#hr-modal-close')?.addEventListener('click', closeModal)
    container.querySelector('#hr-modal-cancel')?.addEventListener('click', closeModal)
    container.querySelector('#hr-modal')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeModal() })
    container.querySelector('#hr-modal-save')?.addEventListener('click', save)
    container.querySelectorAll('.hr-pill').forEach(b => b.addEventListener('click', () => { activeStatus = b.dataset.s; rerender() }))
    container.querySelectorAll('.hr-edit').forEach(b => b.addEventListener('click', () => openModal(employees.find(e => e.id === b.dataset.id))))
    container.querySelectorAll('.hr-del').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Видалити співробітника?')) return
      await deleteDoc(doc(db, ...base, 'employees', b.dataset.id)); await load()
    }))
  }

  function openModal(emp = null) {
    editEmp = emp
    container.querySelector('#hr-modal-title').textContent = emp ? 'Редагувати' : 'Новий співробітник'
    container.querySelector('#hr-f-name').value     = emp?.name      || ''
    container.querySelector('#hr-f-role').value     = emp?.role      || ''
    container.querySelector('#hr-f-status').value   = emp?.status    || 'active'
    container.querySelector('#hr-f-salary').value   = emp?.salary    ?? ''
    container.querySelector('#hr-f-phone').value    = emp?.phone     || ''
    container.querySelector('#hr-f-email').value    = emp?.email     || ''
    container.querySelector('#hr-f-start').value    = emp?.startDate || ''
    container.querySelector('#hr-f-schedule').value = emp?.schedule  || ''
    container.querySelector('#hr-f-notes').value    = emp?.notes     || ''
    container.querySelector('#hr-modal').style.display = 'flex'
    setTimeout(() => container.querySelector('#hr-f-name').focus(), 50)
  }

  function closeModal() { container.querySelector('#hr-modal').style.display = 'none'; editEmp = null }

  async function save() {
    const name = container.querySelector('#hr-f-name').value.trim()
    if (!name) return
    const btn = container.querySelector('#hr-modal-save')
    btn.disabled = true; btn.textContent = '...'
    const data = {
      name, role: container.querySelector('#hr-f-role').value.trim() || null,
      status: container.querySelector('#hr-f-status').value,
      salary: Number(container.querySelector('#hr-f-salary').value) || 0,
      phone: container.querySelector('#hr-f-phone').value.trim() || null,
      email: container.querySelector('#hr-f-email').value.trim() || null,
      startDate: container.querySelector('#hr-f-start').value || null,
      schedule: container.querySelector('#hr-f-schedule').value.trim() || null,
      notes: container.querySelector('#hr-f-notes').value.trim() || null,
    }
    try {
      if (editEmp) await updateDoc(doc(db, ...base, 'employees', editEmp.id), { ...data, updatedAt: serverTimestamp() })
      else await addDoc(collection(db, ...base, 'employees'), { ...data, createdAt: serverTimestamp() })
      closeModal(); await load()
    } finally { btn.disabled = false; btn.textContent = 'Зберегти' }
  }

  await load()
}

function injectStyles() {
  document.getElementById('hr-styles')?.remove()
  const s = document.createElement('style')
  s.id = 'hr-styles'
  s.textContent = `
    .hr-page { padding:28px 32px; }
    .hr-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; }
    .hr-title { font-family:var(--font-display); font-size:26px; font-weight:800; margin-bottom:4px; display:flex; align-items:center; gap:10px; }
    .hr-subtitle { font-size:13px; color:var(--text-muted); }
    .hr-add-btn { padding:9px 22px; background:linear-gradient(135deg,#667eea,#4F8EF7); color:#fff; border:none; border-radius:var(--radius-md); font-size:13px; font-weight:700; cursor:pointer; transition:all .15s; }
    .hr-add-btn:hover { transform:translateY(-1px); box-shadow:0 4px 14px rgba(79,142,247,.4); }
    .hr-kpi-row { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:20px; }
    @media (max-width:900px) { .hr-kpi-row { grid-template-columns:repeat(2,1fr); } }
    .hr-kpi { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-xl); padding:18px 20px; transition:border-color .2s; }
    .hr-kpi:hover { border-color:rgba(255,255,255,.12); }
    .hr-kpi-icon { display:flex; align-items:center; margin-bottom:10px; }
    .hr-kpi-val { font-family:var(--font-display); font-size:26px; font-weight:800; margin-bottom:3px; }
    .hr-kpi-label { font-size:11px; color:var(--text-muted); font-weight:600; text-transform:uppercase; letter-spacing:.05em; }
    .hr-filter-pills { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:20px; }
    .hr-pill { padding:6px 14px; border-radius:var(--radius-full); font-size:12px; font-weight:600; color:var(--text-secondary); background:var(--bg-secondary); border:1px solid var(--border); cursor:pointer; transition:all .15s; }
    .hr-pill.active { background:var(--sc,var(--accent-blue)); border-color:var(--sc,var(--accent-blue)); color:#fff; }
    .hr-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:14px; }
    .hr-card { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-xl); padding:18px; transition:all .15s; }
    .hr-card:hover { transform:translateY(-2px); box-shadow:0 8px 24px rgba(0,0,0,.2); }
    .hr-card-head { display:flex; align-items:center; gap:12px; margin-bottom:12px; }
    .hr-avatar { width:44px; height:44px; border-radius:14px; color:#fff; font-size:18px; font-weight:800; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .hr-card-info { flex:1; }
    .hr-card-name { font-size:15px; font-weight:700; }
    .hr-card-role { font-size:12px; color:var(--text-muted); }
    .hr-card-btns { display:flex; gap:4px; opacity:0; transition:opacity .15s; }
    .hr-card:hover .hr-card-btns { opacity:1; }
    .hr-cb { width:26px; height:26px; border-radius:6px; background:var(--bg-tertiary); border:1px solid var(--border); cursor:pointer; font-size:12px; display:flex; align-items:center; justify-content:center; }
    .hr-card-body { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
    .hr-status-badge { font-size:11px; font-weight:700; padding:3px 10px; border-radius:var(--radius-full); }
    .hr-salary { font-size:13px; font-weight:700; color:#34D399; margin-left:auto; }
    .hr-card-meta { display:flex; flex-direction:column; gap:4px; }
    .hr-meta-row { font-size:12px; color:var(--text-secondary); display:flex; align-items:center; gap:5px; }
    .hr-card-notes { margin-top:10px; font-size:12px; color:var(--text-muted); background:var(--bg-tertiary); border-radius:var(--radius-md); padding:8px 10px; line-height:1.5; }
    .hr-empty { text-align:center; padding:80px 32px; }
    .hr-empty-title { font-family:var(--font-display); font-size:18px; font-weight:700; margin-bottom:6px; }
    .hr-empty-desc { font-size:13px; color:var(--text-muted); margin-bottom:20px; }
    .hr-overlay { position:fixed; inset:0; background:rgba(0,0,0,.6); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; z-index:1000; }
    .hr-modal { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-xl); width:500px; max-width:95vw; box-shadow:0 24px 64px rgba(0,0,0,.4); animation:hr-in .18s ease; }
    @keyframes hr-in { from{opacity:0;transform:scale(.95)} to{opacity:1;transform:scale(1)} }
    .hr-modal-head { display:flex; justify-content:space-between; align-items:center; padding:20px 22px 0; }
    .hr-modal-head h2 { font-family:var(--font-display); font-size:18px; font-weight:800; }
    .hr-modal-head button { background:none; border:none; color:var(--text-muted); cursor:pointer; padding:4px 8px; border-radius:6px; display:flex; align-items:center; justify-content:center; }
    .hr-modal-body { padding:18px 22px; display:flex; flex-direction:column; gap:13px; }
    .hr-modal-foot { padding:14px 22px; border-top:1px solid var(--border); display:flex; gap:8px; justify-content:flex-end; }
    .hr-field label { display:block; font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.05em; margin-bottom:6px; }
    .hr-input { width:100%; box-sizing:border-box; padding:9px 13px; background:var(--bg-tertiary); border:1.5px solid var(--border); border-radius:var(--radius-md); font-size:13px; color:var(--text-primary); outline:none; font-family:inherit; transition:border-color .15s; }
    .hr-input:focus { border-color:var(--accent-blue); }
    .hr-textarea { resize:vertical; min-height:60px; }
    .hr-form-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .hr-btn-pri { padding:9px 20px; background:linear-gradient(135deg,#667eea,#4F8EF7); color:#fff; border:none; border-radius:var(--radius-md); font-size:13px; font-weight:700; cursor:pointer; }
    .hr-btn-sec { padding:9px 20px; background:var(--bg-tertiary); border:1.5px solid var(--border); color:var(--text-primary); border-radius:var(--radius-md); font-size:13px; font-weight:600; cursor:pointer; }
  `
  document.head.appendChild(s)
}
