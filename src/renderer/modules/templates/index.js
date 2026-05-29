// src/renderer/modules/templates/index.js
import { db } from '../../services/firebase.js'
import { getCurrentUser, getActivePathSegments } from '../../services/auth.js'
import { icon } from '../../utils/icons.js'
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, orderBy, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

const CATS = [
  { id: 'invoice',  label: 'Рахунок',      color: '#4F8EF7' },
  { id: 'contract', label: 'Договір',      color: '#A78BFA' },
  { id: 'proposal', label: 'КП',           color: '#34D399' },
  { id: 'email',    label: 'Email',        color: '#F59E0B' },
  { id: 'message',  label: 'Повідомлення', color: '#F472B6' },
  { id: 'other',    label: 'Інше',         color: '#94A3B8' },
]

export async function render(container) {
  injectStyles()
  const user = getCurrentUser()
  const base = getActivePathSegments(user.uid)
  let templates = []
  let activeCat = 'all'
  let editTpl = null
  let viewTpl = null

  async function load() {
    try {
      const snap = await getDocs(query(collection(db, ...base, 'templates'), orderBy('createdAt', 'desc')))
      templates = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch { templates = [] }
    rerender()
  }

  function rerender() {
    const filtered = activeCat === 'all' ? templates : templates.filter(t => t.category === activeCat)

    container.innerHTML = `
      <div class="tpl-page">
        <div class="tpl-header">
          <div>
            <h1 class="tpl-title">Шаблони</h1>
            <p class="tpl-subtitle">${templates.length} шаблонів · швидке копіювання тексту</p>
          </div>
          <button class="tpl-add-btn" id="tpl-add">+ Шаблон</button>
        </div>

        <div class="tpl-cats">
          <button class="tpl-cat ${activeCat === 'all' ? 'active' : ''}" data-cat="all">Всі (${templates.length})</button>
          ${CATS.map(c => {
            const cnt = templates.filter(t => t.category === c.id).length
            if (!cnt && activeCat !== c.id) return ''
            return `<button class="tpl-cat ${activeCat === c.id ? 'active' : ''}" data-cat="${c.id}" style="${activeCat === c.id ? `--cc:${c.color}` : ''}">${c.label} (${cnt})</button>`
          }).join('')}
          ${CATS.map(c => {
            const cnt = templates.filter(t => t.category === c.id).length
            if (cnt) return ''
            return `<button class="tpl-cat ${activeCat === c.id ? 'active' : ''}" data-cat="${c.id}">${c.label}</button>`
          }).join('')}
        </div>

        ${filtered.length ? `
        <div class="tpl-grid">
          ${filtered.map(t => {
            const cat = CATS.find(c => c.id === t.category) || CATS.at(-1)
            return `
              <div class="tpl-card">
                <div class="tpl-card-head" style="border-left:3px solid ${cat.color}">
                  <div class="tpl-card-cat" style="color:${cat.color};background:${cat.color}15">${cat.label}</div>
                  <div class="tpl-card-btns">
                    <button class="tpl-cb tpl-copy" data-id="${t.id}" title="Копіювати">${icon('copy', 12)}</button>
                    <button class="tpl-cb tpl-view" data-id="${t.id}" title="Переглянути">${icon('eye', 12)}</button>
                    <button class="tpl-cb tpl-edit" data-id="${t.id}" title="Редагувати">${icon('pencil', 12)}</button>
                    <button class="tpl-cb tpl-del"  data-id="${t.id}" title="Видалити">${icon('trash', 12)}</button>
                  </div>
                </div>
                <div class="tpl-card-name">${t.name}</div>
                <div class="tpl-card-preview">${(t.content || '').slice(0, 120)}${t.content?.length > 120 ? '...' : ''}</div>
                <div class="tpl-card-vars">${extractVars(t.content).map(v => `<span class="tpl-var">{{${v}}}</span>`).join('')}</div>
              </div>
            `
          }).join('')}
        </div>` : `
        <div class="tpl-empty">
          <div style="display:flex;align-items:center;justify-content:center;margin-bottom:12px;color:var(--text-muted)">${icon('templates', 48)}</div>
          <div class="tpl-empty-title">Шаблонів ще немає</div>
          <div class="tpl-empty-desc">Створіть перший шаблон — текст договору, рахунку або листа</div>
          <button class="tpl-add-btn" id="tpl-add-empty">+ Створити шаблон</button>
        </div>`}
      </div>

      <!-- View modal -->
      <div class="tpl-overlay" id="tpl-view-modal" style="display:none">
        <div class="tpl-modal tpl-modal-lg">
          <div class="tpl-modal-head">
            <h2 id="tpl-view-title">—</h2>
            <div style="display:flex;gap:8px">
              <button class="tpl-btn-pri" id="tpl-view-copy">${icon('copy', 14)} Копіювати</button>
              <button class="tpl-modal-close" id="tpl-view-close">${icon('x', 14)}</button>
            </div>
          </div>
          <div class="tpl-modal-body">
            <pre id="tpl-view-content" class="tpl-content-box"></pre>
          </div>
        </div>
      </div>

      <!-- Edit modal -->
      <div class="tpl-overlay" id="tpl-edit-modal" style="display:none">
        <div class="tpl-modal">
          <div class="tpl-modal-head">
            <h2 id="tpl-edit-title">Новий шаблон</h2>
            <button class="tpl-modal-close" id="tpl-edit-close">${icon('x', 14)}</button>
          </div>
          <div class="tpl-modal-body">
            <div class="tpl-field">
              <label>Назва *</label>
              <input id="tpl-f-name" type="text" class="tpl-input" placeholder="Назва шаблону...">
            </div>
            <div class="tpl-field">
              <label>Категорія</label>
              <select id="tpl-f-cat" class="tpl-input">
                ${CATS.map(c => `<option value="${c.id}">${c.label}</option>`).join('')}
              </select>
            </div>
            <div class="tpl-field">
              <label>Текст шаблону * <span style="font-weight:400;color:var(--text-muted)">(використовуйте {{змінна}} для підстановки)</span></label>
              <textarea id="tpl-f-content" class="tpl-input tpl-textarea" rows="12" placeholder="Текст шаблону...&#10;&#10;Приклад: Доброго дня, {{ім'я}}!&#10;Надсилаю рахунок на суму {{сума}} грн."></textarea>
            </div>
            <div class="tpl-vars-preview" id="tpl-vars-preview"></div>
          </div>
          <div class="tpl-modal-foot">
            <button class="tpl-btn-sec" id="tpl-edit-cancel">Скасувати</button>
            <button class="tpl-btn-pri" id="tpl-edit-save">Зберегти</button>
          </div>
        </div>
      </div>

      <div class="tpl-copy-toast" id="tpl-toast">${icon('check', 14)} Скопійовано!</div>
    `

    attachEvents()
  }

  function extractVars(text = '') {
    return [...new Set([...text.matchAll(/\{\{([^}]+)\}\}/g)].map(m => m[1]))]
  }

  function attachEvents() {
    container.querySelector('#tpl-add')?.addEventListener('click', () => openEdit())
    container.querySelector('#tpl-add-empty')?.addEventListener('click', () => openEdit())

    container.querySelectorAll('.tpl-cat').forEach(b =>
      b.addEventListener('click', () => { activeCat = b.dataset.cat; rerender() })
    )
    container.querySelectorAll('.tpl-copy').forEach(b =>
      b.addEventListener('click', () => copyTemplate(b.dataset.id))
    )
    container.querySelectorAll('.tpl-view').forEach(b =>
      b.addEventListener('click', () => openView(b.dataset.id))
    )
    container.querySelectorAll('.tpl-edit').forEach(b =>
      b.addEventListener('click', () => openEdit(templates.find(t => t.id === b.dataset.id)))
    )
    container.querySelectorAll('.tpl-del').forEach(b =>
      b.addEventListener('click', async () => {
        if (!confirm('Видалити шаблон?')) return
        await deleteDoc(doc(db, ...base, 'templates', b.dataset.id))
        await load()
      })
    )

    // View modal
    container.querySelector('#tpl-view-close')?.addEventListener('click', () => { container.querySelector('#tpl-view-modal').style.display = 'none' })
    container.querySelector('#tpl-view-copy')?.addEventListener('click', () => { if (viewTpl) copyTemplate(viewTpl.id) })
    container.querySelector('#tpl-view-modal')?.addEventListener('click', e => { if (e.target === e.currentTarget) e.target.style.display = 'none' })

    // Edit modal
    container.querySelector('#tpl-edit-close')?.addEventListener('click', closeEdit)
    container.querySelector('#tpl-edit-cancel')?.addEventListener('click', closeEdit)
    container.querySelector('#tpl-edit-modal')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeEdit() })
    container.querySelector('#tpl-edit-save')?.addEventListener('click', saveTemplate)
    container.querySelector('#tpl-f-content')?.addEventListener('input', updateVarsPreview)
  }

  function openView(id) {
    viewTpl = templates.find(t => t.id === id)
    if (!viewTpl) return
    container.querySelector('#tpl-view-title').textContent = viewTpl.name
    container.querySelector('#tpl-view-content').textContent = viewTpl.content || ''
    container.querySelector('#tpl-view-modal').style.display = 'flex'
  }

  function openEdit(tpl = null) {
    editTpl = tpl
    container.querySelector('#tpl-edit-title').textContent = tpl ? 'Редагувати шаблон' : 'Новий шаблон'
    container.querySelector('#tpl-f-name').value    = tpl?.name     || ''
    container.querySelector('#tpl-f-cat').value     = tpl?.category || 'other'
    container.querySelector('#tpl-f-content').value = tpl?.content  || ''
    container.querySelector('#tpl-edit-modal').style.display = 'flex'
    updateVarsPreview()
    setTimeout(() => container.querySelector('#tpl-f-name').focus(), 50)
  }

  function closeEdit() {
    container.querySelector('#tpl-edit-modal').style.display = 'none'
    editTpl = null
  }

  function updateVarsPreview() {
    const content = container.querySelector('#tpl-f-content').value
    const vars = extractVars(content)
    const el = container.querySelector('#tpl-vars-preview')
    if (vars.length) {
      el.innerHTML = `<div class="tpl-vars-label">Змінні в шаблоні:</div>${vars.map(v => `<span class="tpl-var">{{${v}}}</span>`).join('')}`
    } else {
      el.innerHTML = ''
    }
  }

  async function saveTemplate() {
    const name    = container.querySelector('#tpl-f-name').value.trim()
    const content = container.querySelector('#tpl-f-content').value.trim()
    if (!name || !content) return
    const btn = container.querySelector('#tpl-edit-save')
    btn.disabled = true; btn.textContent = '...'
    try {
      const data = { name, content, category: container.querySelector('#tpl-f-cat').value }
      if (editTpl) {
        await updateDoc(doc(db, ...base, 'templates', editTpl.id), { ...data, updatedAt: serverTimestamp() })
      } else {
        await addDoc(collection(db, ...base, 'templates'), { ...data, createdAt: serverTimestamp() })
      }
      closeEdit(); await load()
    } finally { btn.disabled = false; btn.textContent = 'Зберегти' }
  }

  function copyTemplate(id) {
    const tpl = templates.find(t => t.id === id)
    if (!tpl) return
    const vars = extractVars(tpl.content)
    if (vars.length) {
      openFillModal(tpl)
    } else {
      doCopy(tpl.content)
    }
  }

  function openFillModal(tpl) {
    const existing = document.getElementById('tpl-fill-overlay')
    if (existing) existing.remove()

    const overlay = document.createElement('div')
    overlay.id = 'tpl-fill-overlay'
    overlay.className = 'tpl-overlay'

    const vars = extractVars(tpl.content)
    const cat  = CATS.find(c => c.id === tpl.category) || CATS.at(-1)

    overlay.innerHTML = `
      <div class="tpl-modal tpl-fill-modal">
        <div class="tpl-modal-head">
          <div>
            <div class="tpl-fill-cat" style="color:${cat.color}">${cat.label}</div>
            <h2 style="font-size:16px;margin-top:4px">${tpl.name}</h2>
          </div>
          <button class="tpl-modal-close" id="tpl-fill-close">${icon('x', 14)}</button>
        </div>

        <div class="tpl-modal-body">
          <div class="tpl-fill-hint">Заповніть змінні — текст підставиться автоматично</div>
          <div class="tpl-fill-fields" id="tpl-fill-fields">
            ${vars.map(v => `
              <div class="tpl-fill-row">
                <label class="tpl-fill-label">
                  <span class="tpl-var">{{${v}}}</span>
                </label>
                <input class="tpl-input tpl-fill-input" data-var="${v}"
                       placeholder="Значення для «${v}»" autocomplete="off" />
              </div>
            `).join('')}
          </div>

          <div class="tpl-fill-preview-wrap">
            <div class="tpl-fill-preview-label">Попередній перегляд</div>
            <pre class="tpl-fill-preview" id="tpl-fill-preview">${esc(tpl.content)}</pre>
          </div>
        </div>

        <div class="tpl-modal-foot">
          <button class="tpl-btn-sec" id="tpl-fill-skip">Копіювати без змін</button>
          <button class="tpl-btn-pri" id="tpl-fill-copy">${icon('copy', 14)} Скопіювати</button>
        </div>
      </div>
    `

    document.body.appendChild(overlay)

    const previewEl = overlay.querySelector('#tpl-fill-preview')

    function buildFilled() {
      let text = tpl.content
      overlay.querySelectorAll('.tpl-fill-input').forEach(inp => {
        const val = inp.value.trim()
        if (val) text = text.replaceAll(`{{${inp.dataset.var}}}`, val)
      })
      return text
    }

    function updatePreview() {
      previewEl.innerHTML = esc(buildFilled())
        .replace(/\{\{([^}]+)\}\}/g, '<mark class="tpl-fill-unfilled">{{$1}}</mark>')
    }

    overlay.querySelectorAll('.tpl-fill-input').forEach(inp => {
      inp.addEventListener('input', updatePreview)
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          const inputs = [...overlay.querySelectorAll('.tpl-fill-input')]
          const idx = inputs.indexOf(inp)
          if (idx < inputs.length - 1) inputs[idx + 1].focus()
          else overlay.querySelector('#tpl-fill-copy').click()
        }
      })
    })

    overlay.querySelector('#tpl-fill-close').addEventListener('click', () => overlay.remove())
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })

    overlay.querySelector('#tpl-fill-skip').addEventListener('click', () => {
      doCopy(tpl.content)
      overlay.remove()
    })

    overlay.querySelector('#tpl-fill-copy').addEventListener('click', () => {
      doCopy(buildFilled())
      overlay.remove()
    })

    // Focus first input
    setTimeout(() => overlay.querySelector('.tpl-fill-input')?.focus(), 50)
  }

  function doCopy(text) {
    navigator.clipboard.writeText(text).then(() => {
      const toast = container.querySelector('#tpl-toast')
      if (toast) { toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2000) }
    })
  }

  function esc(s = '') {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  }

  await load()
}

function injectStyles() {
  document.getElementById('tpl-styles')?.remove()
  const s = document.createElement('style')
  s.id = 'tpl-styles'
  s.textContent = `
    .tpl-page { padding:28px 32px; }
    .tpl-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; }
    .tpl-title { font-family:var(--font-display); font-size:26px; font-weight:800; margin-bottom:4px; }
    .tpl-subtitle { font-size:13px; color:var(--text-muted); }
    .tpl-add-btn { padding:9px 22px; background:linear-gradient(135deg,#667eea,#4F8EF7); color:#fff; border:none; border-radius:var(--radius-md); font-size:13px; font-weight:700; cursor:pointer; transition:all .15s; }
    .tpl-add-btn:hover { transform:translateY(-1px); box-shadow:0 4px 14px rgba(79,142,247,.4); }

    .tpl-cats { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:20px; }
    .tpl-cat { padding:6px 14px; border-radius:var(--radius-full); font-size:12px; font-weight:600; color:var(--text-secondary); background:var(--bg-secondary); border:1px solid var(--border); cursor:pointer; transition:all .15s; }
    .tpl-cat:hover { border-color:var(--accent-blue); color:var(--text-primary); }
    .tpl-cat.active { background:var(--cc,var(--accent-blue)); border-color:var(--cc,var(--accent-blue)); color:#fff; }

    .tpl-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:14px; }
    .tpl-card { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-xl); overflow:hidden; transition:all .18s; }
    .tpl-card:hover { transform:translateY(-2px); box-shadow:0 8px 24px rgba(0,0,0,.2); border-color:rgba(255,255,255,.12); }
    .tpl-card-head { display:flex; justify-content:space-between; align-items:center; padding:12px 16px; background:var(--bg-tertiary); }
    .tpl-card-cat { font-size:11px; font-weight:700; padding:3px 9px; border-radius:var(--radius-full); }
    .tpl-card-btns { display:flex; gap:4px; opacity:0; transition:opacity .15s; }
    .tpl-card:hover .tpl-card-btns { opacity:1; }
    .tpl-cb { width:28px; height:28px; border-radius:7px; background:var(--bg-secondary); border:1px solid var(--border); cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all .15s; color:var(--text-muted); }
    .tpl-cb:hover { background:var(--accent-blue); border-color:var(--accent-blue); color:#fff; }
    .tpl-copy:hover { background:#34D399; border-color:#34D399; }
    .tpl-del:hover  { background:#F87171; border-color:#F87171; }
    .tpl-card-name { font-size:14px; font-weight:700; padding:12px 16px 6px; }
    .tpl-card-preview { font-size:12px; color:var(--text-secondary); padding:0 16px 10px; line-height:1.5; white-space:pre-wrap; }
    .tpl-card-vars { display:flex; flex-wrap:wrap; gap:4px; padding:0 16px 12px; }
    .tpl-var { font-size:10px; font-weight:700; padding:2px 7px; border-radius:var(--radius-full); background:rgba(79,142,247,.12); color:var(--accent-blue); font-family:var(--font-mono,monospace); }

    .tpl-empty { text-align:center; padding:80px 32px; }
    .tpl-empty-title { font-family:var(--font-display); font-size:18px; font-weight:700; margin-bottom:6px; }
    .tpl-empty-desc { font-size:13px; color:var(--text-muted); margin-bottom:20px; }

    .tpl-overlay { position:fixed; inset:0; background:rgba(0,0,0,.6); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; z-index:1000; padding:20px; }
    .tpl-modal { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-xl); width:520px; max-width:100%; max-height:90vh; display:flex; flex-direction:column; box-shadow:0 24px 64px rgba(0,0,0,.4); animation:tpl-in .18s ease; }
    .tpl-modal-lg { width:680px; }
    @keyframes tpl-in { from{opacity:0;transform:scale(.95)} to{opacity:1;transform:scale(1)} }
    .tpl-modal-head { display:flex; justify-content:space-between; align-items:center; padding:20px 22px 0; flex-shrink:0; }
    .tpl-modal-head h2 { font-family:var(--font-display); font-size:18px; font-weight:800; }
    .tpl-modal-close { background:none; border:none; display:flex; align-items:center; justify-content:center; width:32px; height:32px; color:var(--text-muted); cursor:pointer; border-radius:6px; }
    .tpl-modal-close:hover { background:var(--bg-tertiary); color:var(--text-primary); }
    .tpl-modal-body { padding:18px 22px; overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:14px; }
    .tpl-modal-foot { padding:14px 22px; border-top:1px solid var(--border); display:flex; gap:8px; justify-content:flex-end; flex-shrink:0; }
    .tpl-field label { display:block; font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.05em; margin-bottom:6px; }
    .tpl-input { width:100%; box-sizing:border-box; padding:9px 13px; background:var(--bg-tertiary); border:1.5px solid var(--border); border-radius:var(--radius-md); font-size:13px; color:var(--text-primary); outline:none; font-family:inherit; transition:border-color .15s; }
    .tpl-input:focus { border-color:var(--accent-blue); }
    .tpl-textarea { resize:vertical; min-height:200px; line-height:1.6; }
    .tpl-vars-preview { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
    .tpl-vars-label { font-size:11px; color:var(--text-muted); font-weight:600; width:100%; }
    .tpl-content-box { white-space:pre-wrap; font-family:inherit; font-size:13px; line-height:1.7; color:var(--text-secondary); padding:0; margin:0; }
    .tpl-btn-pri { padding:9px 20px; background:linear-gradient(135deg,#667eea,#4F8EF7); color:#fff; border:none; border-radius:var(--radius-md); font-size:13px; font-weight:700; cursor:pointer; }
    .tpl-btn-sec { padding:9px 20px; background:var(--bg-tertiary); border:1.5px solid var(--border); color:var(--text-primary); border-radius:var(--radius-md); font-size:13px; font-weight:600; cursor:pointer; }
    .tpl-copy-toast { position:fixed; bottom:24px; left:50%; transform:translateX(-50%) translateY(20px); background:var(--bg-secondary); border:1px solid var(--border); border-left:3px solid #34D399; border-radius:var(--radius-md); padding:10px 20px; font-size:13px; font-weight:700; color:#34D399; opacity:0; transition:all .25s; z-index:9999; pointer-events:none; }
    .tpl-copy-toast.show { opacity:1; transform:translateX(-50%) translateY(0); }
  `
  document.head.appendChild(s)
}
