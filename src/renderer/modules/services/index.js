// src/renderer/modules/services/index.js
import { db } from '../../services/firebase.js'
import { getCurrentUser, getActivePathSegments } from '../../services/auth.js'
import {
  collection, addDoc, getDocs, deleteDoc,
  doc, updateDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

const CAT_META = {
  hair:    { icon: '✂️',  label: 'Волосся',   color: '#F472B6' },
  nails:   { icon: '💅',  label: 'Нігті',     color: '#A78BFA' },
  face:    { icon: '🧖',  label: 'Обличчя',   color: '#34D399' },
  body:    { icon: '💆',  label: 'Тіло',      color: '#38BDF8' },
  makeup:  { icon: '💄',  label: 'Макіяж',    color: '#F59E0B' },
  brows:   { icon: '👁',  label: 'Брови/Вії', color: '#4F8EF7' },
  other:   { icon: '✨',  label: 'Інше',      color: '#6B7280' },
}

export async function render(container) {
  injectStyles()

  container.innerHTML = `
    <div class="sv-layout">

      <!-- ══ LEFT ══ -->
      <div class="sv-left" id="sv-left">

        <div class="sv-header">
          <div>
            <h1 class="sv-title">💅 Послуги</h1>
            <p class="sv-sub" id="sv-count">Завантаження...</p>
          </div>
          <button class="btn btn-primary" id="sv-add-btn">+ Додати послугу</button>
        </div>

        <!-- Stats -->
        <div class="sv-stats" id="sv-stats"></div>

        <!-- Category filters -->
        <div class="sv-filters" id="sv-filters">
          <button class="sv-filter active" data-cat="all">Всі</button>
          ${Object.entries(CAT_META).map(([k,v]) =>
            `<button class="sv-filter" data-cat="${k}" style="--cc:${v.color}">${v.icon} ${v.label}</button>`
          ).join('')}
        </div>

        <!-- Grid -->
        <div id="sv-grid">
          <div class="sv-loading"><div class="spinner"></div></div>
        </div>

      </div>

      <!-- ══ RIGHT DETAIL ══ -->
      <div class="sv-right" id="sv-right" style="display:none">
        <div class="sv-detail" id="sv-detail"></div>
      </div>

    </div>

    <!-- ══ MODAL ══ -->
    <div class="modal-overlay" id="sv-modal" style="display:none">
      <div class="modal" style="max-width:500px">
        <div class="modal-header">
          <h2 class="modal-title" id="sv-modal-title">Нова послуга</h2>
          <button class="modal-close" id="sv-modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>Назва послуги *</label>
            <input class="input" id="sv-name" placeholder="Манікюр з покриттям гель-лаком" />
            <span class="field-error" id="sv-e-name"></span>
          </div>
          <div class="field">
            <label>Категорія</label>
            <select class="input" id="sv-cat">
              ${Object.entries(CAT_META).map(([k,v]) => `<option value="${k}">${v.icon} ${v.label}</option>`).join('')}
            </select>
          </div>
          <div class="form-row">
            <div class="field">
              <label>Ціна (₴) *</label>
              <input class="input" id="sv-price" type="number" placeholder="500" min="0" step="10" />
              <span class="field-error" id="sv-e-price"></span>
            </div>
            <div class="field">
              <label>Тривалість (хв)</label>
              <input class="input" id="sv-duration" type="number" placeholder="60" min="5" step="5" />
            </div>
          </div>
          <div class="field">
            <label>Опис</label>
            <textarea class="input" id="sv-desc" rows="2" placeholder="Короткий опис послуги..."></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="sv-modal-cancel">Скасувати</button>
          <button class="btn btn-primary"   id="sv-modal-save">Зберегти</button>
        </div>
      </div>
    </div>
  `

  const user = getCurrentUser()
  const base = getActivePathSegments(user.uid)
  let services   = []
  let editId     = null
  let selectedId = null
  let catFilter  = 'all'

  // ── Load ──────────────────────────────────────────────────
  async function loadServices() {
    try {
      const snap = await getDocs(collection(db, ...base, 'services'))
      services = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch { services = [] }
    updateStats()
    renderGrid()
    if (selectedId) {
      const s = services.find(x => x.id === selectedId)
      if (s) openDetail(s); else closeDetail()
    }
  }

  // ── Stats ─────────────────────────────────────────────────
  function updateStats() {
    const total  = services.length
    const avgPrc = total ? Math.round(services.reduce((s, x) => s + (Number(x.price)||0), 0) / total) : 0
    const maxPrc = total ? Math.max(...services.map(x => Number(x.price)||0)) : 0
    container.querySelector('#sv-count').textContent =
      `${total} послуг · від ₴${Math.min(...services.map(x=>Number(x.price)||0))||0}`

    container.querySelector('#sv-stats').innerHTML = [
      { label: 'Всього послуг',  value: total,             color: '#4F8EF7' },
      { label: 'Середня ціна',   value: `₴${avgPrc}`,      color: '#34D399' },
      { label: 'Максимальна',    value: `₴${maxPrc}`,      color: '#A78BFA' },
    ].map(s => `
      <div class="sv-stat" style="--sc:${s.color}">
        <div class="sv-stat-val">${s.value}</div>
        <div class="sv-stat-lbl">${s.label}</div>
      </div>
    `).join('')
  }

  // ── Render grid ───────────────────────────────────────────
  function renderGrid() {
    const list = catFilter === 'all' ? services : services.filter(s => s.category === catFilter)
    const el   = container.querySelector('#sv-grid')

    if (list.length === 0) {
      el.innerHTML = `
        <div class="sv-empty">
          <div class="sv-empty-icon">💅</div>
          <div class="sv-empty-title">${services.length === 0 ? 'Послуг ще немає' : 'Нічого не знайдено'}</div>
          <div class="sv-empty-desc">Натисніть "+ Додати послугу" щоб створити прайс-лист</div>
        </div>`
      return
    }

    el.innerHTML = `<div class="sv-grid">${list.map(s => renderCard(s)).join('')}</div>`
    el.querySelectorAll('.sv-card').forEach(card => {
      card.addEventListener('click', () => {
        const svc = services.find(x => x.id === card.dataset.id)
        if (!svc) return
        if (selectedId === svc.id) { closeDetail(); return }
        openDetail(svc)
      })
    })
  }

  function renderCard(s) {
    const cat = CAT_META[s.category] || CAT_META.other
    const dur = s.duration ? `${s.duration} хв` : ''
    return `
      <div class="sv-card ${selectedId === s.id ? 'sv-selected' : ''}" data-id="${s.id}" style="--cc:${cat.color}">
        <div class="sv-card-stripe"></div>
        <div class="sv-card-body">
          <div class="sv-card-top">
            <span class="sv-cat-icon">${cat.icon}</span>
            <span class="sv-cat-badge" style="background:color-mix(in srgb,${cat.color} 12%,transparent);color:${cat.color}">${cat.label}</span>
            ${dur ? `<span class="sv-dur">⏱ ${dur}</span>` : ''}
          </div>
          <div class="sv-card-name">${s.name || '—'}</div>
          ${s.desc ? `<div class="sv-card-desc">${s.desc}</div>` : ''}
          <div class="sv-card-price">₴${fmtNum(s.price)}</div>
        </div>
      </div>
    `
  }

  // ── Detail panel ──────────────────────────────────────────
  function openDetail(s) {
    selectedId = s.id
    container.querySelector('#sv-left').classList.add('sv-has-detail')
    container.querySelector('#sv-right').style.display = 'flex'

    const cat = CAT_META[s.category] || CAT_META.other

    container.querySelector('#sv-detail').innerHTML = `
      <div class="sv-d-stripe" style="background:${cat.color}"></div>

      <div class="sv-d-head">
        <button class="sv-d-close" id="sv-d-close">✕</button>
        <div class="sv-d-icon" style="background:color-mix(in srgb,${cat.color} 15%,transparent)">${cat.icon}</div>
        <div class="sv-d-name">${s.name || '—'}</div>
        <div class="sv-d-cat" style="background:color-mix(in srgb,${cat.color} 12%,transparent);color:${cat.color}">${cat.label}</div>
        <div class="sv-d-price">₴${fmtNum(s.price)}</div>
      </div>

      <div class="sv-d-section">
        <div class="sv-d-label">Деталі</div>
        <div class="sv-d-rows">
          ${s.duration ? `<div class="sv-d-row"><span>⏱ Тривалість</span><span>${s.duration} хв</span></div>` : ''}
          ${s.desc ? `<div class="sv-d-row sv-d-desc"><span>📝 Опис</span><span>${s.desc}</span></div>` : ''}
        </div>
      </div>

      <div class="sv-d-footer">
        <button class="btn btn-secondary" id="sv-d-edit">✏️ Редагувати</button>
        <button class="btn btn-danger"    id="sv-d-del">🗑 Видалити</button>
      </div>
    `

    container.querySelectorAll('.sv-card').forEach(c =>
      c.classList.toggle('sv-selected', c.dataset.id === s.id)
    )

    container.querySelector('#sv-d-close').addEventListener('click', closeDetail)
    container.querySelector('#sv-d-edit').addEventListener('click', () => openModal(s))
    container.querySelector('#sv-d-del').addEventListener('click', async () => {
      if (!confirm('Видалити послугу?')) return
      await deleteDoc(doc(db, ...base, 'services', s.id))
      closeDetail()
      await loadServices()
    })
  }

  function closeDetail() {
    selectedId = null
    container.querySelector('#sv-right').style.display = 'none'
    container.querySelector('#sv-left').classList.remove('sv-has-detail')
    container.querySelectorAll('.sv-card').forEach(c => c.classList.remove('sv-selected'))
  }

  // ── Filters ───────────────────────────────────────────────
  container.querySelectorAll('.sv-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.sv-filter').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      catFilter = btn.dataset.cat
      renderGrid()
    })
  })

  // ── Modal ─────────────────────────────────────────────────
  function openModal(svc = null) {
    editId = svc?.id || null
    container.querySelector('#sv-modal-title').textContent = svc ? 'Редагувати послугу' : 'Нова послуга'
    container.querySelector('#sv-name').value     = svc?.name     || ''
    container.querySelector('#sv-price').value    = svc?.price    || ''
    container.querySelector('#sv-duration').value = svc?.duration || ''
    container.querySelector('#sv-desc').value     = svc?.desc     || ''
    container.querySelector('#sv-cat').value      = svc?.category || 'nails'
    container.querySelectorAll('.field-error').forEach(e => e.textContent = '')
    container.querySelector('#sv-modal').style.display = 'flex'
    setTimeout(() => container.querySelector('#sv-name').focus(), 100)
  }

  function closeModal() {
    container.querySelector('#sv-modal').style.display = 'none'
    editId = null
  }

  container.querySelector('#sv-add-btn').addEventListener('click', () => openModal())
  container.querySelector('#sv-modal-close').addEventListener('click', closeModal)
  container.querySelector('#sv-modal-cancel').addEventListener('click', closeModal)
  container.querySelector('#sv-modal').addEventListener('click', e => {
    if (e.target === container.querySelector('#sv-modal')) closeModal()
  })

  container.querySelector('#sv-modal-save').addEventListener('click', async () => {
    const name  = container.querySelector('#sv-name').value.trim()
    const price = container.querySelector('#sv-price').value

    let ok = true
    if (!name)  { container.querySelector('#sv-e-name').textContent  = 'Введіть назву';  ok = false }
    if (!price) { container.querySelector('#sv-e-price').textContent = 'Введіть ціну';   ok = false }
    if (!ok) return

    const btn = container.querySelector('#sv-modal-save')
    btn.disabled = true; btn.innerHTML = '<div class="spinner"></div>'

    const data = {
      name,
      price:    Number(price),
      duration: Number(container.querySelector('#sv-duration').value) || null,
      desc:     container.querySelector('#sv-desc').value.trim() || null,
      category: container.querySelector('#sv-cat').value,
    }

    try {
      if (editId) {
        await updateDoc(doc(db, ...base, 'services', editId), { ...data, updatedAt: serverTimestamp() })
      } else {
        await addDoc(collection(db, ...base, 'services'), { ...data, createdAt: serverTimestamp() })
      }
      closeModal()
      await loadServices()
    } catch (err) { console.error(err) }
    finally { btn.disabled = false; btn.innerHTML = 'Зберегти' }
  })

  await loadServices()
}

function fmtNum(n) {
  const num = Number(n)
  if (isNaN(num)) return '0'
  return num.toLocaleString('uk-UA')
}

function injectStyles() {
  if (document.getElementById('sv-styles')) return
  const style = document.createElement('style')
  style.id = 'sv-styles'
  style.textContent = `
  .sv-layout { display:flex; height:100%; overflow:hidden; }

  .sv-left {
    flex:1; display:flex; flex-direction:column; overflow:hidden;
    padding:28px 28px 0; transition:all .2s;
  }
  .sv-right {
    width:360px; flex-shrink:0; border-left:1px solid var(--border);
    display:flex; flex-direction:column; overflow-y:auto;
    background:var(--bg-secondary);
  }

  .sv-header {
    display:flex; align-items:flex-start; justify-content:space-between;
    margin-bottom:18px; gap:12px; flex-shrink:0;
  }
  .sv-title { font-family:var(--font-display); font-size:22px; font-weight:800; letter-spacing:-0.02em; }
  .sv-sub   { font-size:13px; color:var(--text-secondary); margin-top:2px; }

  .sv-stats {
    display:grid; grid-template-columns:repeat(3,1fr); gap:10px;
    margin-bottom:14px; flex-shrink:0;
  }
  .sv-stat {
    background:var(--bg-secondary); border:1px solid var(--border);
    border-left:3px solid var(--sc); border-radius:var(--radius-lg);
    padding:12px 14px;
  }
  .sv-stat-val { font-family:var(--font-display); font-size:20px; font-weight:800; color:var(--sc); }
  .sv-stat-lbl { font-size:11px; color:var(--text-muted); margin-top:2px; text-transform:uppercase; letter-spacing:.04em; font-weight:600; }

  .sv-filters { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:16px; flex-shrink:0; }
  .sv-filter {
    padding:5px 12px; border-radius:var(--radius-full); font-size:12px; font-weight:600;
    border:1px solid var(--border); background:var(--bg-secondary); color:var(--text-secondary);
    cursor:pointer; transition:all .15s;
  }
  .sv-filter:hover  { border-color:var(--cc,var(--accent-blue)); color:var(--text-primary); }
  .sv-filter.active { background:var(--accent-blue); color:#fff; border-color:var(--accent-blue); }

  #sv-grid { flex:1; overflow-y:auto; padding-bottom:24px; }

  .sv-grid {
    display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:12px;
  }

  .sv-card {
    background:var(--bg-secondary); border:1px solid var(--border);
    border-radius:var(--radius-lg); overflow:hidden; cursor:pointer;
    display:flex; transition:all .15s;
  }
  .sv-card:hover    { border-color:rgba(255,255,255,.14); transform:translateY(-2px); box-shadow:0 6px 20px rgba(0,0,0,.25); }
  .sv-card.sv-selected { border-color:var(--accent-blue); box-shadow:0 0 0 2px rgba(79,142,247,.2); }

  .sv-card-stripe { width:4px; background:var(--cc); flex-shrink:0; }
  .sv-card-body   { flex:1; padding:14px 16px; display:flex; flex-direction:column; gap:8px; }

  .sv-card-top    { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .sv-cat-icon    { font-size:18px; }
  .sv-cat-badge   {
    font-size:10px; font-weight:700; padding:2px 8px; border-radius:var(--radius-xs);
    text-transform:uppercase; letter-spacing:.04em;
  }
  .sv-dur         { font-size:11px; color:var(--text-muted); margin-left:auto; }
  .sv-card-name   { font-weight:700; font-size:15px; line-height:1.3; }
  .sv-card-desc   { font-size:12px; color:var(--text-secondary); line-height:1.5; }
  .sv-card-price  {
    font-family:var(--font-display); font-size:22px; font-weight:800;
    color:var(--cc); margin-top:auto;
  }

  .sv-loading, .sv-empty {
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    padding:60px 20px; gap:10px;
  }
  .sv-empty-icon  { font-size:40px; }
  .sv-empty-title { font-size:15px; font-weight:600; color:var(--text-secondary); }
  .sv-empty-desc  { font-size:13px; color:var(--text-muted); text-align:center; }

  /* ── Detail ── */
  .sv-detail { display:flex; flex-direction:column; flex:1; }
  .sv-d-stripe { height:5px; flex-shrink:0; }

  .sv-d-head {
    padding:20px 22px 18px; border-bottom:1px solid var(--border);
    display:flex; flex-direction:column; align-items:center; gap:6px;
    position:relative; text-align:center;
  }
  .sv-d-close {
    position:absolute; top:14px; right:14px; width:28px; height:28px; border-radius:50%;
    border:1px solid var(--border); background:var(--bg-tertiary); color:var(--text-muted);
    font-size:12px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all .15s;
  }
  .sv-d-close:hover { background:var(--bg-elevated); color:var(--text-primary); }
  .sv-d-icon {
    width:64px; height:64px; border-radius:16px; font-size:30px;
    display:flex; align-items:center; justify-content:center; margin-bottom:4px;
  }
  .sv-d-name {
    font-family:var(--font-display); font-size:18px; font-weight:800;
    letter-spacing:-0.01em; line-height:1.3;
  }
  .sv-d-cat {
    font-size:11px; font-weight:700; padding:3px 12px; border-radius:var(--radius-xs);
    text-transform:uppercase; letter-spacing:.05em;
  }
  .sv-d-price {
    font-family:var(--font-display); font-size:32px; font-weight:800;
    color:#34D399; letter-spacing:-0.02em; margin-top:6px;
  }

  .sv-d-section { padding:16px 22px; border-bottom:1px solid var(--border); }
  .sv-d-label   { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:var(--text-muted); margin-bottom:10px; }
  .sv-d-rows    { display:flex; flex-direction:column; gap:10px; }
  .sv-d-row     { display:flex; justify-content:space-between; align-items:flex-start; font-size:13px; gap:12px; }
  .sv-d-row span:first-child { color:var(--text-secondary); flex-shrink:0; }
  .sv-d-row span:last-child  { font-weight:600; text-align:right; }
  .sv-d-desc span:last-child { color:var(--text-secondary); font-weight:400; }

  .sv-d-footer {
    display:flex; gap:8px; padding:16px 22px; margin-top:auto;
    border-top:1px solid var(--border);
  }
  .sv-d-footer .btn { flex:1; justify-content:center; }
  .btn-danger { background:rgba(239,68,68,.12); color:#EF4444; border:1px solid rgba(239,68,68,.25); }
  .btn-danger:hover { background:rgba(239,68,68,.2); }

  .form-row { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  `
  document.head.appendChild(style)
}
