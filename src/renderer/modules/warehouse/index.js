// src/renderer/modules/warehouse/index.js
import { db } from '../../services/firebase.js'
import { getCurrentUser, getActivePathSegments } from '../../services/auth.js'
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, orderBy, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

const CATS = [
  { id: 'materials', label: 'Матеріали',  icon: '🧴', color: '#4F8EF7' },
  { id: 'tools',     label: 'Інструменти',icon: '🔧', color: '#F59E0B' },
  { id: 'products',  label: 'Товари',     icon: '📦', color: '#34D399' },
  { id: 'equipment', label: 'Обладнання', icon: '🖥', color: '#A78BFA' },
  { id: 'other',     label: 'Інше',       icon: '📋', color: '#94A3B8' },
]

export async function render(container) {
  injectStyles()
  const user = getCurrentUser()
  const base = getActivePathSegments(user.uid)
  let items = []
  let activeCat = 'all'
  let editItem = null
  let search = ''

  async function load() {
    try {
      const snap = await getDocs(query(collection(db, ...base, 'warehouse'), orderBy('createdAt', 'desc')))
      items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch { items = [] }
    rerender()
  }

  function rerender() {
    let filtered = activeCat === 'all' ? items : items.filter(i => i.category === activeCat)
    if (search) filtered = filtered.filter(i => i.name?.toLowerCase().includes(search.toLowerCase()))

    const totalItems = items.length
    const lowStock   = items.filter(i => (i.qty || 0) <= (i.minQty || 0) && i.minQty > 0).length
    const totalValue = items.reduce((s, i) => s + (i.qty || 0) * (i.price || 0), 0)

    container.innerHTML = `
      <div class="wh-page">
        <div class="wh-header">
          <div>
            <h1 class="wh-title">📦 Склад та матеріали</h1>
            <p class="wh-subtitle">${totalItems} позицій</p>
          </div>
          <button class="wh-add-btn" id="wh-add">+ Позиція</button>
        </div>

        <div class="wh-kpi-row">
          <div class="wh-kpi"><div class="wh-kpi-val">${totalItems}</div><div class="wh-kpi-label">Всього позицій</div></div>
          <div class="wh-kpi wh-kpi-warn"><div class="wh-kpi-val" style="color:${lowStock>0?'#F59E0B':'#34D399'}">${lowStock}</div><div class="wh-kpi-label">Закінчуються</div></div>
          <div class="wh-kpi"><div class="wh-kpi-val">₴${totalValue.toLocaleString('uk-UA')}</div><div class="wh-kpi-label">Загальна вартість</div></div>
          <div class="wh-kpi"><div class="wh-kpi-val">${items.filter(i=>(i.qty||0)===0).length}</div><div class="wh-kpi-label">Закінчились</div></div>
        </div>

        <div class="wh-toolbar">
          <div class="wh-search">
            <span>🔍</span>
            <input type="text" id="wh-search" placeholder="Пошук..." value="${search}">
          </div>
          <div class="wh-cat-pills">
            <button class="wh-pill ${activeCat==='all'?'active':''}" data-cat="all">Всі</button>
            ${CATS.map(c => `<button class="wh-pill ${activeCat===c.id?'active':''}" data-cat="${c.id}">${c.icon} ${c.label}</button>`).join('')}
          </div>
        </div>

        ${filtered.length ? `
        <div class="wh-table-wrap">
          <table class="wh-table">
            <thead><tr><th>Назва</th><th>Категорія</th><th>Кількість</th><th>Ціна/од</th><th>Вартість</th><th>Постачальник</th><th></th></tr></thead>
            <tbody>
              ${filtered.map(item => {
                const cat = CATS.find(c => c.id === item.category) || CATS.at(-1)
                const isLow = item.minQty > 0 && (item.qty || 0) <= item.minQty
                const isEmpty = (item.qty || 0) === 0
                return `
                  <tr class="${isEmpty ? 'wh-row-empty' : isLow ? 'wh-row-low' : ''}">
                    <td>
                      <div class="wh-item-name">${item.name}</div>
                      ${item.description ? `<div class="wh-item-desc">${item.description}</div>` : ''}
                    </td>
                    <td><span class="wh-cat-badge" style="color:${cat.color};background:${cat.color}15">${cat.icon} ${cat.label}</span></td>
                    <td>
                      <div class="wh-qty-cell">
                        <span class="wh-qty ${isEmpty?'wh-qty-empty':isLow?'wh-qty-low':''}">${item.qty || 0} ${item.unit || 'шт'}</span>
                        ${isLow && !isEmpty ? '<span class="wh-low-badge">↓ Мало</span>' : ''}
                        ${isEmpty ? '<span class="wh-empty-badge">✗ Нема</span>' : ''}
                      </div>
                    </td>
                    <td>${item.price ? `₴${Number(item.price).toLocaleString('uk-UA')}` : '—'}</td>
                    <td><strong>${item.price ? '₴' + ((item.qty||0) * item.price).toLocaleString('uk-UA') : '—'}</strong></td>
                    <td style="font-size:12px;color:var(--text-muted)">${item.supplier || '—'}</td>
                    <td>
                      <div class="wh-row-btns">
                        <button class="wh-rb wh-edit" data-id="${item.id}">✏️</button>
                        <button class="wh-rb wh-del"  data-id="${item.id}">🗑</button>
                      </div>
                    </td>
                  </tr>
                `
              }).join('')}
            </tbody>
          </table>
        </div>` : `
        <div class="wh-empty">
          <div style="font-size:52px;margin-bottom:12px">📦</div>
          <div class="wh-empty-title">${search ? 'Нічого не знайдено' : 'Склад порожній'}</div>
          <div class="wh-empty-desc">${search ? 'Спробуйте змінити запит' : 'Додайте першу позицію'}</div>
        </div>`}
      </div>

      <!-- Modal -->
      <div class="wh-overlay" id="wh-modal" style="display:none">
        <div class="wh-modal">
          <div class="wh-modal-head">
            <h2 id="wh-modal-title">Нова позиція</h2>
            <button id="wh-modal-close">✕</button>
          </div>
          <div class="wh-modal-body">
            <div class="wh-field"><label>Назва *</label><input id="wh-f-name" class="wh-input" type="text" placeholder="Назва товару..."></div>
            <div class="wh-form-row">
              <div class="wh-field"><label>Категорія</label><select id="wh-f-cat" class="wh-input">${CATS.map(c=>`<option value="${c.id}">${c.icon} ${c.label}</option>`).join('')}</select></div>
              <div class="wh-field"><label>Одиниця</label><input id="wh-f-unit" class="wh-input" type="text" placeholder="шт, кг, л..."></div>
            </div>
            <div class="wh-form-row">
              <div class="wh-field"><label>Кількість</label><input id="wh-f-qty" class="wh-input" type="number" min="0" placeholder="0"></div>
              <div class="wh-field"><label>Мін. залишок</label><input id="wh-f-min" class="wh-input" type="number" min="0" placeholder="0"></div>
            </div>
            <div class="wh-form-row">
              <div class="wh-field"><label>Ціна за одиницю</label><input id="wh-f-price" class="wh-input" type="number" min="0" placeholder="0.00"></div>
              <div class="wh-field"><label>Постачальник</label><input id="wh-f-supplier" class="wh-input" type="text" placeholder="Назва постачальника..."></div>
            </div>
            <div class="wh-field"><label>Опис</label><input id="wh-f-desc" class="wh-input" type="text" placeholder="Короткий опис..."></div>
          </div>
          <div class="wh-modal-foot">
            <button class="wh-btn-sec" id="wh-modal-cancel">Скасувати</button>
            <button class="wh-btn-pri" id="wh-modal-save">Зберегти</button>
          </div>
        </div>
      </div>
    `
    attachEvents()
  }

  function attachEvents() {
    container.querySelector('#wh-add').addEventListener('click', () => openModal())
    container.querySelector('#wh-modal-close').addEventListener('click', closeModal)
    container.querySelector('#wh-modal-cancel').addEventListener('click', closeModal)
    container.querySelector('#wh-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal() })
    container.querySelector('#wh-modal-save').addEventListener('click', save)
    container.querySelector('#wh-search').addEventListener('input', e => { search = e.target.value; rerender() })
    container.querySelectorAll('.wh-pill').forEach(b => b.addEventListener('click', () => { activeCat = b.dataset.cat; rerender() }))
    container.querySelectorAll('.wh-edit').forEach(b => b.addEventListener('click', () => openModal(items.find(i => i.id === b.dataset.id))))
    container.querySelectorAll('.wh-del').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Видалити позицію?')) return
      await deleteDoc(doc(db, ...base, 'warehouse', b.dataset.id))
      await load()
    }))
  }

  function openModal(item = null) {
    editItem = item
    container.querySelector('#wh-modal-title').textContent = item ? 'Редагувати позицію' : 'Нова позиція'
    container.querySelector('#wh-f-name').value     = item?.name     || ''
    container.querySelector('#wh-f-cat').value      = item?.category || 'materials'
    container.querySelector('#wh-f-unit').value     = item?.unit     || 'шт'
    container.querySelector('#wh-f-qty').value      = item?.qty      ?? ''
    container.querySelector('#wh-f-min').value      = item?.minQty   ?? ''
    container.querySelector('#wh-f-price').value    = item?.price    ?? ''
    container.querySelector('#wh-f-supplier').value = item?.supplier || ''
    container.querySelector('#wh-f-desc').value     = item?.description || ''
    container.querySelector('#wh-modal').style.display = 'flex'
    setTimeout(() => container.querySelector('#wh-f-name').focus(), 50)
  }

  function closeModal() {
    container.querySelector('#wh-modal').style.display = 'none'
    editItem = null
  }

  async function save() {
    const name = container.querySelector('#wh-f-name').value.trim()
    if (!name) return
    const btn = container.querySelector('#wh-modal-save')
    btn.disabled = true; btn.textContent = '...'
    const data = {
      name,
      category:    container.querySelector('#wh-f-cat').value,
      unit:        container.querySelector('#wh-f-unit').value.trim() || 'шт',
      qty:         Number(container.querySelector('#wh-f-qty').value) || 0,
      minQty:      Number(container.querySelector('#wh-f-min').value) || 0,
      price:       Number(container.querySelector('#wh-f-price').value) || 0,
      supplier:    container.querySelector('#wh-f-supplier').value.trim() || null,
      description: container.querySelector('#wh-f-desc').value.trim() || null,
    }
    try {
      if (editItem) await updateDoc(doc(db, ...base, 'warehouse', editItem.id), { ...data, updatedAt: serverTimestamp() })
      else await addDoc(collection(db, ...base, 'warehouse'), { ...data, createdAt: serverTimestamp() })
      closeModal(); await load()
    } finally { btn.disabled = false; btn.textContent = 'Зберегти' }
  }

  await load()
}

function injectStyles() {
  document.getElementById('wh-styles')?.remove()
  const s = document.createElement('style')
  s.id = 'wh-styles'
  s.textContent = `
    .wh-page { padding:28px 32px; max-width:1100px; }
    .wh-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; }
    .wh-title { font-family:var(--font-display); font-size:24px; font-weight:800; margin-bottom:4px; }
    .wh-subtitle { font-size:13px; color:var(--text-muted); }
    .wh-add-btn { padding:9px 20px; background:linear-gradient(135deg,#667eea,#4F8EF7); color:#fff; border:none; border-radius:var(--radius-md); font-size:13px; font-weight:700; cursor:pointer; }

    .wh-kpi-row { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:20px; }
    .wh-kpi { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-lg); padding:16px 20px; }
    .wh-kpi-val { font-family:var(--font-display); font-size:24px; font-weight:800; margin-bottom:3px; }
    .wh-kpi-label { font-size:11px; color:var(--text-muted); font-weight:600; text-transform:uppercase; letter-spacing:.05em; }

    .wh-toolbar { display:flex; gap:10px; align-items:center; margin-bottom:16px; flex-wrap:wrap; }
    .wh-search { display:flex; align-items:center; gap:8px; background:var(--bg-secondary); border:1.5px solid var(--border); border-radius:var(--radius-md); padding:8px 14px; flex:1; max-width:300px; transition:border-color .15s; }
    .wh-search:focus-within { border-color:var(--accent-blue); }
    .wh-search input { flex:1; background:none; font-size:13px; color:var(--text-primary); outline:none; }
    .wh-cat-pills { display:flex; gap:6px; flex-wrap:wrap; }
    .wh-pill { padding:6px 13px; border-radius:var(--radius-full); font-size:12px; font-weight:600; color:var(--text-secondary); background:var(--bg-secondary); border:1px solid var(--border); cursor:pointer; transition:all .15s; }
    .wh-pill.active { background:var(--accent-blue); border-color:var(--accent-blue); color:#fff; }

    .wh-table-wrap { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-xl); overflow:hidden; }
    .wh-table { width:100%; border-collapse:collapse; }
    .wh-table th { text-align:left; padding:10px 14px; font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.05em; background:var(--bg-tertiary); border-bottom:1px solid var(--border); }
    .wh-table td { padding:12px 14px; border-bottom:1px solid var(--border); font-size:13px; vertical-align:middle; }
    .wh-table tr:last-child td { border-bottom:none; }
    .wh-table tr:hover td { background:rgba(255,255,255,.02); }
    .wh-row-low td { background:rgba(245,158,11,.04); }
    .wh-row-empty td { background:rgba(239,68,68,.04); opacity:.7; }
    .wh-item-name { font-weight:600; }
    .wh-item-desc { font-size:11px; color:var(--text-muted); }
    .wh-cat-badge { font-size:11px; font-weight:700; padding:3px 9px; border-radius:var(--radius-full); }
    .wh-qty-cell { display:flex; align-items:center; gap:6px; }
    .wh-qty { font-weight:700; }
    .wh-qty-low { color:#F59E0B; }
    .wh-qty-empty { color:#EF4444; }
    .wh-low-badge { font-size:10px; font-weight:700; padding:2px 6px; border-radius:var(--radius-full); background:rgba(245,158,11,.15); color:#F59E0B; }
    .wh-empty-badge { font-size:10px; font-weight:700; padding:2px 6px; border-radius:var(--radius-full); background:rgba(239,68,68,.15); color:#EF4444; }
    .wh-row-btns { display:flex; gap:4px; opacity:0; transition:opacity .15s; }
    tr:hover .wh-row-btns { opacity:1; }
    .wh-rb { width:26px; height:26px; border-radius:6px; background:var(--bg-tertiary); border:1px solid var(--border); cursor:pointer; font-size:12px; display:flex; align-items:center; justify-content:center; transition:all .15s; }

    .wh-empty { text-align:center; padding:80px 32px; }
    .wh-empty-title { font-family:var(--font-display); font-size:18px; font-weight:700; margin-bottom:6px; }
    .wh-empty-desc { font-size:13px; color:var(--text-muted); }

    .wh-overlay { position:fixed; inset:0; background:rgba(0,0,0,.6); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; z-index:1000; }
    .wh-modal { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-xl); width:500px; max-width:95vw; box-shadow:0 24px 64px rgba(0,0,0,.4); animation:wh-in .18s ease; }
    @keyframes wh-in { from{opacity:0;transform:scale(.95)} to{opacity:1;transform:scale(1)} }
    .wh-modal-head { display:flex; justify-content:space-between; align-items:center; padding:20px 22px 0; }
    .wh-modal-head h2 { font-family:var(--font-display); font-size:18px; font-weight:800; }
    .wh-modal-head button { background:none; border:none; font-size:16px; color:var(--text-muted); cursor:pointer; padding:4px 8px; border-radius:6px; }
    .wh-modal-body { padding:18px 22px; display:flex; flex-direction:column; gap:13px; }
    .wh-modal-foot { padding:14px 22px; border-top:1px solid var(--border); display:flex; gap:8px; justify-content:flex-end; }
    .wh-field label { display:block; font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.05em; margin-bottom:6px; }
    .wh-input { width:100%; box-sizing:border-box; padding:9px 13px; background:var(--bg-tertiary); border:1.5px solid var(--border); border-radius:var(--radius-md); font-size:13px; color:var(--text-primary); outline:none; font-family:inherit; transition:border-color .15s; }
    .wh-input:focus { border-color:var(--accent-blue); }
    .wh-form-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .wh-btn-pri { padding:9px 20px; background:linear-gradient(135deg,#667eea,#4F8EF7); color:#fff; border:none; border-radius:var(--radius-md); font-size:13px; font-weight:700; cursor:pointer; }
    .wh-btn-sec { padding:9px 20px; background:var(--bg-tertiary); border:1.5px solid var(--border); color:var(--text-primary); border-radius:var(--radius-md); font-size:13px; font-weight:600; cursor:pointer; }
  `
  document.head.appendChild(s)
}
