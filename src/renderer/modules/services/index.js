// src/renderer/modules/services/index.js
import { icon } from '../../utils/icons.js'
import { db } from '../../services/firebase.js'
import { getCurrentUser, getActivePathSegments } from '../../services/auth.js'
import {
  collection, addDoc, getDocs, deleteDoc,
  doc, updateDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

// Default categories seeded on first run
const DEFAULT_CATS = [
  { name: 'Волосся',   color: '#F472B6', iconName: 'scissors'  },
  { name: 'Нігті',     color: '#A78BFA', iconName: 'droplet'   },
  { name: 'Обличчя',   color: '#34D399', iconName: 'user'      },
  { name: 'Тіло',      color: '#38BDF8', iconName: 'user'      },
  { name: 'Макіяж',    color: '#F59E0B', iconName: 'camera'    },
  { name: 'Брови/Вії', color: '#4F8EF7', iconName: 'eye'       },
  { name: 'Інше',      color: '#6B7280', iconName: 'briefcase' },
]

const PALETTE   = ['#F472B6','#A78BFA','#34D399','#38BDF8','#F59E0B','#4F8EF7','#FB923C','#6B7280','#F87171','#10B981']
const CAT_ICONS = ['scissors','droplet','user','camera','eye','briefcase','tool','coffee','star','heart','zap','phone','brush','feather']

export async function render(container) {
  injectStyles()

  const user = getCurrentUser()
  const base = getActivePathSegments(user.uid)

  let services   = []
  let categories = []
  let catsSeedChecked = false
  let editId     = null
  let editCatId  = null
  let selectedId = null
  let catFilter  = 'all'
  let activeTab  = 'services'

  // ── Shell ─────────────────────────────────────────────────
  container.innerHTML = `
    <div class="sv-layout">

      <!-- ══ LEFT ══ -->
      <div class="sv-left" id="sv-left">
        <div class="sv-header">
          <div>
            <h1 class="sv-title">${icon('briefcase', 20)} Послуги</h1>
            <p class="sv-sub" id="sv-count">Завантаження...</p>
          </div>
          <div class="sv-header-right">
            <div class="sv-tabs-inline">
              <button class="sv-tab-btn active" data-tab="services">Послуги</button>
              <button class="sv-tab-btn" data-tab="categories">${icon('folder', 12)} Категорії</button>
            </div>
            <button class="btn btn-primary" id="sv-add-btn">+ Додати</button>
          </div>
        </div>

        <!-- ── Services panel ── -->
        <div id="sv-panel-services">
          <div class="sv-stats" id="sv-stats"></div>
          <div class="sv-filters" id="sv-filters"></div>
          <div id="sv-grid"><div class="sv-loading"><div class="spinner"></div></div></div>
        </div>

        <!-- ── Categories panel ── -->
        <div id="sv-panel-cats" style="display:none">
          <div id="sv-cats-wrap"></div>
        </div>
      </div>

      <!-- ══ RIGHT DETAIL ══ -->
      <div class="sv-right" id="sv-right" style="display:none">
        <div class="sv-detail" id="sv-detail"></div>
      </div>
    </div>

    <!-- ══ SERVICE MODAL ══ -->
    <div class="modal-overlay" id="sv-modal" style="display:none">
      <div class="modal" style="max-width:500px">
        <div class="modal-header">
          <h2 class="modal-title" id="sv-modal-title">Нова послуга</h2>
          <button class="modal-close" id="sv-modal-close">${icon('x', 14)}</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>Назва послуги *</label>
            <input class="input" id="sv-name" placeholder="Манікюр з покриттям гель-лаком" />
            <span class="field-error" id="sv-e-name"></span>
          </div>
          <div class="field">
            <label>Категорія</label>
            <select class="input" id="sv-cat"></select>
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

    <!-- ══ CATEGORY MODAL ══ -->
    <div class="modal-overlay" id="sv-cat-modal" style="display:none">
      <div class="modal" style="max-width:440px">
        <div class="modal-header">
          <h2 class="modal-title" id="sv-cm-title">Нова категорія</h2>
          <button class="modal-close" id="sv-cm-close">${icon('x', 14)}</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>Назва *</label>
            <input class="input" id="sv-cm-name" placeholder="Наприклад: Нігті" />
            <span class="field-error" id="sv-cm-e-name"></span>
          </div>
          <div class="field">
            <label>Іконка</label>
            <div class="sv-icon-picker" id="sv-cm-icons">
              ${CAT_ICONS.map(n => `
                <button class="sv-icon-opt" data-icon="${n}" title="${n}">${icon(n, 16)}</button>
              `).join('')}
            </div>
          </div>
          <div class="field">
            <label>Колір</label>
            <div class="sv-color-picker" id="sv-cm-colors">
              ${PALETTE.map(c => `
                <button class="sv-color-opt" data-color="${c}" style="background:${c}"></button>
              `).join('')}
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="sv-cm-cancel">Скасувати</button>
          <button class="btn btn-primary"   id="sv-cm-save">Зберегти</button>
        </div>
      </div>
    </div>
  `

  // ── Load ──────────────────────────────────────────────────
  async function loadAll() {
    await Promise.all([loadCategories(), loadServices()])
  }

  async function loadCategories() {
    try {
      const snap = await getDocs(collection(db, ...base, 'services_cats'))
      categories = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      // Auto-seed defaults only on the very first load — not after the user
      // intentionally deletes their last category (that should stay empty)
      if (categories.length === 0 && !catsSeedChecked) {
        const refs = await Promise.all(
          DEFAULT_CATS.map(c => addDoc(collection(db, ...base, 'services_cats'), { ...c, createdAt: serverTimestamp() }))
        )
        categories = DEFAULT_CATS.map((c, i) => ({ id: refs[i].id, ...c }))
      }
      catsSeedChecked = true
    } catch { categories = [] }
  }

  async function loadServices() {
    try {
      const snap = await getDocs(collection(db, ...base, 'services'))
      services = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch { services = [] }
  }

  function getCat(catId) {
    return categories.find(c => c.id === catId) || { name: 'Інше', color: '#6B7280', iconName: 'briefcase' }
  }

  // ── Render services panel ─────────────────────────────────
  function renderServicesPanel() {
    updateStats()
    renderFilters()
    renderGrid()
    if (selectedId) {
      const s = services.find(x => x.id === selectedId)
      if (s) openDetail(s); else closeDetail()
    }
  }

  function updateStats() {
    const total  = services.length
    const avgPrc = total ? Math.round(services.reduce((s, x) => s + (Number(x.price)||0), 0) / total) : 0
    const maxPrc = total ? Math.max(...services.map(x => Number(x.price)||0)) : 0
    const minPrc = total ? Math.min(...services.map(x => Number(x.price)||0)) : 0
    container.querySelector('#sv-count').textContent = `${total} послуг`

    container.querySelector('#sv-stats').innerHTML = [
      { label: 'Всього послуг', value: total,        color: '#4F8EF7' },
      { label: 'Середня ціна',  value: `₴${avgPrc}`, color: '#34D399' },
      { label: 'Максимальна',   value: `₴${maxPrc}`, color: '#A78BFA' },
    ].map(s => `
      <div class="sv-stat" style="--sc:${s.color}">
        <div class="sv-stat-val">${s.value}</div>
        <div class="sv-stat-lbl">${s.label}</div>
      </div>
    `).join('')
  }

  function renderFilters() {
    const el = container.querySelector('#sv-filters')
    el.innerHTML = `
      <button class="sv-filter ${catFilter === 'all' ? 'active' : ''}" data-cat="all">Всі</button>
      ${categories.map(c =>
        `<button class="sv-filter ${catFilter === c.id ? 'active' : ''}" data-cat="${c.id}" style="--cc:${c.color}">
          ${icon(c.iconName, 11)} ${c.name}
        </button>`
      ).join('')}
    `
    el.querySelectorAll('.sv-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        catFilter = btn.dataset.cat
        el.querySelectorAll('.sv-filter').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        renderGrid()
      })
    })
  }

  function renderGrid() {
    const list = catFilter === 'all' ? services : services.filter(s => s.category === catFilter)
    const el   = container.querySelector('#sv-grid')

    if (list.length === 0) {
      el.innerHTML = `
        <div class="sv-empty">
          <div class="sv-empty-icon">${icon('briefcase', 36)}</div>
          <div class="sv-empty-title">${services.length === 0 ? 'Послуг ще немає' : 'Нічого не знайдено'}</div>
          <div class="sv-empty-desc">Натисніть "+ Додати" щоб створити прайс-лист</div>
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
    const cat = getCat(s.category)
    const dur = s.duration ? `${s.duration} хв` : ''
    return `
      <div class="sv-card ${selectedId === s.id ? 'sv-selected' : ''}" data-id="${s.id}" style="--cc:${cat.color}">
        <div class="sv-card-stripe"></div>
        <div class="sv-card-body">
          <div class="sv-card-top">
            <span class="sv-cat-icon">${icon(cat.iconName, 14)}</span>
            <span class="sv-cat-badge" style="background:color-mix(in srgb,${cat.color} 12%,transparent);color:${cat.color}">${cat.name}</span>
            ${dur ? `<span class="sv-dur">${icon('timer', 11)} ${dur}</span>` : ''}
          </div>
          <div class="sv-card-name">${s.name || '—'}</div>
          ${s.desc ? `<div class="sv-card-desc">${s.desc}</div>` : ''}
          <div class="sv-card-price">₴${fmtNum(s.price)}</div>
        </div>
      </div>
    `
  }

  // ── Render categories panel ───────────────────────────────
  function renderCatsPanel() {
    const el = container.querySelector('#sv-cats-wrap')
    if (categories.length === 0) {
      el.innerHTML = `
        <div class="sv-empty">
          <div class="sv-empty-icon">${icon('folder', 36)}</div>
          <div class="sv-empty-title">Категорій ще немає</div>
          <div class="sv-empty-desc">Натисніть "+ Додати" щоб створити першу категорію</div>
        </div>`
      return
    }

    el.innerHTML = `
      <div class="sv-cats-list">
        ${categories.map(c => {
          const svcCount = services.filter(s => s.category === c.id).length
          return `
            <div class="sv-cat-card" data-cat-id="${c.id}" style="--cc:${c.color}">
              <div class="sv-cat-card-icon" style="background:color-mix(in srgb,${c.color} 14%,transparent);color:${c.color}">
                ${icon(c.iconName, 22)}
              </div>
              <div class="sv-cat-card-info">
                <div class="sv-cat-card-name">${c.name}</div>
                <div class="sv-cat-card-count">${svcCount} послуг</div>
              </div>
              <div class="sv-cat-card-actions">
                <button class="sv-cat-act sv-cat-edit" data-cat-id="${c.id}" title="Редагувати">${icon('pencil', 13)}</button>
                <button class="sv-cat-act sv-cat-del"  data-cat-id="${c.id}" title="Видалити">${icon('trash', 13)}</button>
              </div>
            </div>`
        }).join('')}
      </div>`

    el.querySelectorAll('.sv-cat-edit').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation()
        const cat = categories.find(c => c.id === btn.dataset.catId)
        if (cat) openCatModal(cat)
      })
    })

    el.querySelectorAll('.sv-cat-del').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation()
        const cat = categories.find(c => c.id === btn.dataset.catId)
        if (!cat) return
        const usedBy = services.filter(s => s.category === cat.id).length
        const msg = usedBy > 0
          ? `Категорія "${cat.name}" використовується в ${usedBy} послузі(-ах). Видалити разом з послугами?`
          : `Видалити категорію "${cat.name}"?`
        if (!confirm(msg)) return
        try {
          await deleteDoc(doc(db, ...base, 'services_cats', cat.id))
          if (usedBy > 0) {
            await Promise.all(
              services.filter(s => s.category === cat.id)
                .map(s => deleteDoc(doc(db, ...base, 'services', s.id)))
            )
          }
          await loadAll()
          renderCatsPanel()
          renderServicesPanel()
        } catch (err) { console.error(err) }
      })
    })
  }

  // ── Detail panel ──────────────────────────────────────────
  function openDetail(s) {
    selectedId = s.id
    container.querySelector('#sv-left').classList.add('sv-has-detail')
    container.querySelector('#sv-right').style.display = 'flex'
    const cat = getCat(s.category)

    container.querySelector('#sv-detail').innerHTML = `
      <div class="sv-d-stripe" style="background:${cat.color}"></div>
      <div class="sv-d-head">
        <button class="sv-d-close" id="sv-d-close">${icon('x', 14)}</button>
        <div class="sv-d-icon" style="background:color-mix(in srgb,${cat.color} 15%,transparent);color:${cat.color}">${icon(cat.iconName, 24)}</div>
        <div class="sv-d-name">${s.name || '—'}</div>
        <div class="sv-d-cat" style="background:color-mix(in srgb,${cat.color} 12%,transparent);color:${cat.color}">${cat.name}</div>
        <div class="sv-d-price">₴${fmtNum(s.price)}</div>
      </div>
      <div class="sv-d-section">
        <div class="sv-d-label">Деталі</div>
        <div class="sv-d-rows">
          ${s.duration ? `<div class="sv-d-row"><span>${icon('timer', 12)} Тривалість</span><span>${s.duration} хв</span></div>` : ''}
          ${s.desc     ? `<div class="sv-d-row sv-d-desc"><span>${icon('notes', 12)} Опис</span><span>${s.desc}</span></div>` : ''}
        </div>
      </div>
      <div class="sv-d-footer">
        <button class="btn btn-secondary" id="sv-d-edit">${icon('pencil', 13)} Редагувати</button>
        <button class="btn btn-danger"    id="sv-d-del">${icon('trash', 13)} Видалити</button>
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
      renderServicesPanel()
    })
  }

  function closeDetail() {
    selectedId = null
    container.querySelector('#sv-right').style.display = 'none'
    container.querySelector('#sv-left').classList.remove('sv-has-detail')
    container.querySelectorAll('.sv-card').forEach(c => c.classList.remove('sv-selected'))
  }

  // ── Tab switching ─────────────────────────────────────────
  function switchTab(tab) {
    activeTab = tab
    container.querySelectorAll('.sv-tab-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === tab)
    )
    container.querySelector('#sv-panel-services').style.display = tab === 'services' ? '' : 'none'
    container.querySelector('#sv-panel-cats').style.display     = tab === 'categories' ? '' : 'none'
    container.querySelector('#sv-add-btn').textContent = tab === 'categories' ? '+ Категорія' : '+ Додати'
    if (tab === 'categories') { closeDetail(); renderCatsPanel() }
    else renderServicesPanel()
  }

  // ── Service modal ─────────────────────────────────────────
  function fillCatSelect(selectedCatId) {
    const sel = container.querySelector('#sv-cat')
    sel.innerHTML = categories.map(c =>
      `<option value="${c.id}" ${c.id === selectedCatId ? 'selected' : ''}>${c.name}</option>`
    ).join('')
  }

  function openModal(svc = null) {
    if (categories.length === 0) {
      alert('Спочатку створіть хоча б одну категорію (вкладка "Категорії").')
      switchTab('categories')
      return
    }
    editId = svc?.id || null
    container.querySelector('#sv-modal-title').textContent = svc ? 'Редагувати послугу' : 'Нова послуга'
    container.querySelector('#sv-name').value     = svc?.name     || ''
    container.querySelector('#sv-price').value    = svc?.price    || ''
    container.querySelector('#sv-duration').value = svc?.duration || ''
    container.querySelector('#sv-desc').value     = svc?.desc     || ''
    fillCatSelect(svc?.category || categories[0]?.id)
    container.querySelectorAll('.field-error').forEach(e => e.textContent = '')
    container.querySelector('#sv-modal').style.display = 'flex'
    setTimeout(() => container.querySelector('#sv-name').focus(), 100)
  }

  function closeModal() {
    container.querySelector('#sv-modal').style.display = 'none'
    editId = null
  }

  // ── Category modal ────────────────────────────────────────
  let pickedColor = PALETTE[0]
  let pickedIcon  = CAT_ICONS[0]

  function openCatModal(cat = null) {
    editCatId   = cat?.id || null
    pickedColor = cat?.color    || PALETTE[0]
    pickedIcon  = cat?.iconName || CAT_ICONS[0]

    container.querySelector('#sv-cm-title').textContent = cat ? 'Редагувати категорію' : 'Нова категорія'
    container.querySelector('#sv-cm-name').value = cat?.name || ''
    container.querySelector('#sv-cm-e-name').textContent = ''

    // Highlight picked icon
    container.querySelectorAll('.sv-icon-opt').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.icon === pickedIcon)
    })
    // Highlight picked color
    container.querySelectorAll('.sv-color-opt').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.color === pickedColor)
    })

    container.querySelector('#sv-cat-modal').style.display = 'flex'
    setTimeout(() => container.querySelector('#sv-cm-name').focus(), 100)
  }

  function closeCatModal() {
    container.querySelector('#sv-cat-modal').style.display = 'none'
    editCatId = null
  }

  // ── Bind events ───────────────────────────────────────────
  function bindEvents() {
    // Tabs
    container.querySelector('.sv-tabs-inline').addEventListener('click', e => {
      const btn = e.target.closest('.sv-tab-btn')
      if (btn) switchTab(btn.dataset.tab)
    })

    // Add button
    container.querySelector('#sv-add-btn').addEventListener('click', () => {
      if (activeTab === 'categories') openCatModal()
      else openModal()
    })

    // Service modal
    container.querySelector('#sv-modal-close').addEventListener('click', closeModal)
    container.querySelector('#sv-modal-cancel').addEventListener('click', closeModal)
    container.querySelector('#sv-modal').addEventListener('click', e => {
      if (e.target === container.querySelector('#sv-modal')) closeModal()
    })

    container.querySelector('#sv-modal-save').addEventListener('click', async () => {
      const name  = container.querySelector('#sv-name').value.trim()
      const price = container.querySelector('#sv-price').value
      let ok = true
      if (!name)  { container.querySelector('#sv-e-name').textContent  = 'Введіть назву'; ok = false }
      if (!price) { container.querySelector('#sv-e-price').textContent = 'Введіть ціну';  ok = false }
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
        renderServicesPanel()
      } catch (err) { console.error(err) }
      finally { btn.disabled = false; btn.innerHTML = 'Зберегти' }
    })

    // Category modal
    container.querySelector('#sv-cm-close').addEventListener('click', closeCatModal)
    container.querySelector('#sv-cm-cancel').addEventListener('click', closeCatModal)
    container.querySelector('#sv-cat-modal').addEventListener('click', e => {
      if (e.target === container.querySelector('#sv-cat-modal')) closeCatModal()
    })

    container.querySelector('#sv-cm-icons').addEventListener('click', e => {
      const btn = e.target.closest('.sv-icon-opt')
      if (!btn) return
      pickedIcon = btn.dataset.icon
      container.querySelectorAll('.sv-icon-opt').forEach(b => b.classList.toggle('active', b.dataset.icon === pickedIcon))
    })

    container.querySelector('#sv-cm-colors').addEventListener('click', e => {
      const btn = e.target.closest('.sv-color-opt')
      if (!btn) return
      pickedColor = btn.dataset.color
      container.querySelectorAll('.sv-color-opt').forEach(b => b.classList.toggle('active', b.dataset.color === pickedColor))
    })

    container.querySelector('#sv-cm-save').addEventListener('click', async () => {
      const name = container.querySelector('#sv-cm-name').value.trim()
      if (!name) { container.querySelector('#sv-cm-e-name').textContent = 'Введіть назву'; return }

      const btn = container.querySelector('#sv-cm-save')
      btn.disabled = true; btn.innerHTML = '<div class="spinner"></div>'

      const data = { name, color: pickedColor, iconName: pickedIcon }
      try {
        if (editCatId) {
          await updateDoc(doc(db, ...base, 'services_cats', editCatId), data)
        } else {
          await addDoc(collection(db, ...base, 'services_cats'), { ...data, createdAt: serverTimestamp() })
        }
        closeCatModal()
        await loadAll()
        renderCatsPanel()
        renderFilters()
      } catch (err) { console.error(err) }
      finally { btn.disabled = false; btn.innerHTML = 'Зберегти' }
    })
  }

  bindEvents()
  await loadAll()
  switchTab('services')
}

function fmtNum(n) {
  const num = Number(n)
  return isNaN(num) ? '0' : num.toLocaleString('uk-UA')
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
    margin-bottom:18px; gap:12px; flex-shrink:0; flex-wrap:wrap;
  }
  .sv-header-right { display:flex; align-items:center; gap:10px; }
  .sv-title { font-family:var(--font-display); font-size:22px; font-weight:800; letter-spacing:-0.02em; }
  .sv-sub   { font-size:13px; color:var(--text-secondary); margin-top:2px; }

  /* Inline tabs */
  .sv-tabs-inline { display:flex; gap:3px; background:var(--bg-secondary); padding:3px; border-radius:var(--radius-md); border:1px solid var(--border); }
  .sv-tab-btn { padding:6px 14px; border-radius:var(--radius-sm); font-size:12px; font-weight:600; color:var(--text-muted); border:none; background:none; cursor:pointer; transition:all .15s; display:inline-flex; align-items:center; gap:5px; }
  .sv-tab-btn:hover  { color:var(--text-primary); }
  .sv-tab-btn.active { background:var(--bg-primary); color:var(--text-primary); box-shadow:0 1px 4px rgba(0,0,0,.3); }

  .sv-stats {
    display:grid; grid-template-columns:repeat(3,1fr); gap:10px;
    margin-bottom:14px; flex-shrink:0;
  }
  .sv-stat {
    background:var(--bg-secondary); border:1px solid var(--border);
    border-left:3px solid var(--sc); border-radius:var(--radius-lg); padding:12px 14px;
  }
  .sv-stat-val { font-family:var(--font-display); font-size:20px; font-weight:800; color:var(--sc); }
  .sv-stat-lbl { font-size:11px; color:var(--text-muted); margin-top:2px; text-transform:uppercase; letter-spacing:.04em; font-weight:600; }

  .sv-filters { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:16px; flex-shrink:0; }
  .sv-filter {
    padding:5px 12px; border-radius:var(--radius-full); font-size:12px; font-weight:600;
    border:1px solid var(--border); background:var(--bg-secondary); color:var(--text-secondary);
    cursor:pointer; transition:all .15s; display:inline-flex; align-items:center; gap:5px;
  }
  .sv-filter:hover  { border-color:var(--cc,var(--accent-blue)); color:var(--text-primary); }
  .sv-filter.active { background:var(--accent-blue); color:#fff; border-color:var(--accent-blue); }

  #sv-grid    { flex:1; overflow-y:auto; padding-bottom:24px; }
  #sv-panel-services { display:flex; flex-direction:column; flex:1; overflow:hidden; }
  #sv-panel-cats { flex:1; overflow-y:auto; padding-bottom:24px; }

  .sv-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:12px; }

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
  .sv-cat-icon    { display:flex; align-items:center; }
  .sv-cat-badge   { font-size:10px; font-weight:700; padding:2px 8px; border-radius:var(--radius-xs); text-transform:uppercase; letter-spacing:.04em; }
  .sv-dur         { font-size:11px; color:var(--text-muted); margin-left:auto; display:flex; align-items:center; gap:3px; }
  .sv-card-name   { font-weight:700; font-size:15px; line-height:1.3; }
  .sv-card-desc   { font-size:12px; color:var(--text-secondary); line-height:1.5; }
  .sv-card-price  { font-family:var(--font-display); font-size:22px; font-weight:800; color:var(--cc); margin-top:auto; }

  /* Categories list */
  .sv-cats-list { display:flex; flex-direction:column; gap:8px; }
  .sv-cat-card  {
    display:flex; align-items:center; gap:14px;
    padding:14px 18px; background:var(--bg-secondary);
    border:1.5px solid var(--border); border-radius:var(--radius-lg);
    transition:border-color .15s;
  }
  .sv-cat-card:hover { border-color:var(--cc,var(--border)); }
  .sv-cat-card-icon  {
    width:48px; height:48px; border-radius:12px; flex-shrink:0;
    display:flex; align-items:center; justify-content:center;
  }
  .sv-cat-card-info  { flex:1; min-width:0; }
  .sv-cat-card-name  { font-size:15px; font-weight:700; margin-bottom:3px; }
  .sv-cat-card-count { font-size:12px; color:var(--text-muted); }
  .sv-cat-card-actions { display:flex; gap:6px; flex-shrink:0; }
  .sv-cat-act {
    width:32px; height:32px; border-radius:8px; border:1px solid var(--border);
    background:var(--bg-tertiary); color:var(--text-muted);
    cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all .15s;
  }
  .sv-cat-act:hover        { color:var(--text-primary); background:var(--bg-elevated); }
  .sv-cat-del:hover        { color:#F87171; border-color:rgba(248,113,113,.3); }

  /* Icon + color pickers */
  .sv-icon-picker  { display:flex; flex-wrap:wrap; gap:6px; }
  .sv-icon-opt {
    width:36px; height:36px; border-radius:8px; border:1.5px solid var(--border);
    background:var(--bg-tertiary); color:var(--text-secondary);
    cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all .15s;
  }
  .sv-icon-opt:hover { border-color:var(--accent-blue); color:var(--text-primary); }
  .sv-icon-opt.active { border-color:var(--accent-blue); background:rgba(79,142,247,.12); color:var(--accent-blue); }

  .sv-color-picker { display:flex; flex-wrap:wrap; gap:8px; }
  .sv-color-opt {
    width:28px; height:28px; border-radius:50%; cursor:pointer;
    border:2px solid transparent; transition:all .15s;
  }
  .sv-color-opt:hover { transform:scale(1.15); }
  .sv-color-opt.active { border-color:#fff; box-shadow:0 0 0 2px var(--accent-blue); transform:scale(1.1); }

  /* Empty / loading */
  .sv-loading, .sv-empty {
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    padding:60px 20px; gap:10px;
  }
  .sv-empty-icon  { display:flex; align-items:center; justify-content:center; color:var(--text-muted); opacity:.5; margin-bottom:12px; }
  .sv-empty-title { font-size:15px; font-weight:600; color:var(--text-secondary); }
  .sv-empty-desc  { font-size:13px; color:var(--text-muted); text-align:center; }

  /* Detail panel */
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
    cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all .15s;
  }
  .sv-d-close:hover { background:var(--bg-elevated); color:var(--text-primary); }
  .sv-d-icon  { width:64px; height:64px; border-radius:16px; display:flex; align-items:center; justify-content:center; margin-bottom:4px; }
  .sv-d-name  { font-family:var(--font-display); font-size:18px; font-weight:800; letter-spacing:-0.01em; line-height:1.3; }
  .sv-d-cat   { font-size:11px; font-weight:700; padding:3px 12px; border-radius:var(--radius-xs); text-transform:uppercase; letter-spacing:.05em; }
  .sv-d-price { font-family:var(--font-display); font-size:32px; font-weight:800; color:#34D399; letter-spacing:-0.02em; margin-top:6px; }
  .sv-d-section { padding:16px 22px; border-bottom:1px solid var(--border); }
  .sv-d-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:var(--text-muted); margin-bottom:10px; }
  .sv-d-rows  { display:flex; flex-direction:column; gap:10px; }
  .sv-d-row   { display:flex; justify-content:space-between; align-items:flex-start; font-size:13px; gap:12px; }
  .sv-d-row span:first-child { color:var(--text-secondary); display:flex; align-items:center; gap:5px; flex-shrink:0; }
  .sv-d-row span:last-child  { font-weight:600; text-align:right; }
  .sv-d-desc span:last-child { color:var(--text-secondary); font-weight:400; }
  .sv-d-footer { display:flex; gap:8px; padding:16px 22px; margin-top:auto; border-top:1px solid var(--border); }
  .sv-d-footer .btn { flex:1; justify-content:center; }
  .btn-danger       { background:rgba(239,68,68,.12); color:#EF4444; border:1px solid rgba(239,68,68,.25); }
  .btn-danger:hover { background:rgba(239,68,68,.2); }
  .form-row { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  `
  document.head.appendChild(style)
}
