// src/renderer/modules/accounts/index.js
import { db } from '../../services/firebase.js'
import { getCurrentUser, getActivePathSegments } from '../../services/auth.js'
import { icon } from '../../utils/icons.js'
import {
  collection, addDoc, getDocs, deleteDoc, doc, updateDoc, serverTimestamp, query, orderBy
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram',  color: '#E1306C', gradient: 'linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)' },
  { id: 'tiktok',    label: 'TikTok',     color: '#69C9D0', gradient: 'linear-gradient(135deg,#010101,#69C9D0)' },
  { id: 'facebook',  label: 'Facebook',   color: '#1877F2', gradient: 'linear-gradient(135deg,#1877F2,#0d5fd4)' },
  { id: 'youtube',   label: 'YouTube',    color: '#FF0000', gradient: 'linear-gradient(135deg,#FF0000,#cc0000)' },
  { id: 'telegram',  label: 'Telegram',   color: '#2CA5E0', gradient: 'linear-gradient(135deg,#2CA5E0,#1a8cc7)' },
  { id: 'linkedin',  label: 'LinkedIn',   color: '#0A66C2', gradient: 'linear-gradient(135deg,#0A66C2,#004182)' },
  { id: 'twitter',   label: 'Twitter/X',  color: '#1DA1F2', gradient: 'linear-gradient(135deg,#1DA1F2,#0d8bd9)' },
  { id: 'pinterest', label: 'Pinterest',  color: '#E60023', gradient: 'linear-gradient(135deg,#E60023,#ad081b)' },
  { id: 'other',     label: 'Інше',       color: '#64748B', gradient: 'linear-gradient(135deg,#64748B,#475569)' },
]

function getPlatform(id) {
  return PLATFORMS.find(p => p.id === id) || PLATFORMS[PLATFORMS.length - 1]
}

function fmtNum(n) {
  if (!n) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0','') + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace('.0','') + 'K'
  return String(n)
}

export async function render(container) {
  injectStyles()
  const user = getCurrentUser()
  const base = getActivePathSegments(user.uid)

  container.innerHTML = `
    <div class="ac-page">

      <!-- Header -->
      <div class="ac-header">
        <div>
          <h1 class="ac-title">Акаунти</h1>
          <p class="ac-sub" id="ac-sub">Завантаження...</p>
        </div>
        <button class="btn btn-primary" id="ac-add-btn">+ Додати акаунт</button>
      </div>

      <!-- Stats row -->
      <div class="ac-stats" id="ac-stats"></div>

      <!-- Grid -->
      <div class="ac-grid" id="ac-grid">
        <div class="ac-loading"><div class="spinner"></div></div>
      </div>

    </div>

    <!-- Modal -->
    <div class="ac-overlay" id="ac-modal" style="display:none">
      <div class="ac-modal">
        <div class="ac-modal-header">
          <h2 class="ac-modal-title" id="ac-modal-title">Новий акаунт</h2>
          <button class="ac-modal-close" id="ac-modal-close">${icon('x', 14)}</button>
        </div>
        <div class="ac-modal-body">

          <!-- Platform picker -->
          <div class="field">
            <label>Платформа *</label>
            <div class="ac-plat-grid" id="ac-plat-grid">
              ${PLATFORMS.map(p => `
                <button type="button" class="ac-plat-pick" data-plat="${p.id}" style="--pc:${p.color}">
                  <span class="ac-plat-pick-icon" style="color:${p.color}">${icon('accounts', 20)}</span>
                  <span class="ac-plat-pick-label">${p.label}</span>
                </button>
              `).join('')}
            </div>
          </div>

          <div class="field">
            <label>Нікнейм / URL *</label>
            <input class="input" id="ac-handle" placeholder="@username або https://..." />
            <span class="field-error" id="ac-err"></span>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="field">
              <label>Підписники</label>
              <input class="input" id="ac-followers" type="number" placeholder="10000" min="0" />
            </div>
            <div class="field">
              <label>Тематика</label>
              <input class="input" id="ac-niche" placeholder="Краса, мода..." />
            </div>
          </div>

          <div class="field">
            <label>Нотатка</label>
            <textarea class="input" id="ac-note" rows="2" placeholder="Додаткова інформація..." style="resize:vertical"></textarea>
          </div>

        </div>
        <div class="ac-modal-footer">
          <button class="btn btn-secondary" id="ac-cancel">Скасувати</button>
          <button class="btn btn-primary" id="ac-save">Зберегти</button>
        </div>
      </div>
    </div>
  `

  let accounts  = []
  let editId    = null
  let selPlat   = null
  const colRef  = collection(db, ...base, 'accounts')

  // ── Load ──────────────────────────────────────────────────
  async function load() {
    try {
      const q    = query(colRef, orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      accounts   = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      renderStats()
      renderGrid()
    } catch (err) {
      console.error(err)
      container.querySelector('#ac-grid').innerHTML =
        `<div class="ac-empty"><div class="ac-empty-icon">${icon('alert-triangle', 40)}</div><div class="ac-empty-title">Помилка завантаження</div></div>`
    }
  }

  // ── Stats ─────────────────────────────────────────────────
  function renderStats() {
    const total      = accounts.length
    const totalFollowers = accounts.reduce((s, a) => s + (Number(a.followers) || 0), 0)
    const platforms  = [...new Set(accounts.map(a => a.platform))].length

    const sub = container.querySelector('#ac-sub')
    sub.textContent = total === 0
      ? 'Акаунтів немає'
      : `${total} ${total === 1 ? 'акаунт' : total < 5 ? 'акаунти' : 'акаунтів'}`

    const statsEl = container.querySelector('#ac-stats')
    if (total === 0) { statsEl.innerHTML = ''; return }

    statsEl.innerHTML = `
      <div class="ac-stat-card">
        <div class="ac-stat-val">${total}</div>
        <div class="ac-stat-label">Акаунтів</div>
      </div>
      <div class="ac-stat-card">
        <div class="ac-stat-val">${fmtNum(totalFollowers)}</div>
        <div class="ac-stat-label">Підписників загалом</div>
      </div>
      <div class="ac-stat-card">
        <div class="ac-stat-val">${platforms}</div>
        <div class="ac-stat-label">${platforms === 1 ? 'Платформа' : platforms < 5 ? 'Платформи' : 'Платформ'}</div>
      </div>
    `
  }

  // ── Grid ──────────────────────────────────────────────────
  function renderGrid() {
    const el = container.querySelector('#ac-grid')
    if (accounts.length === 0) {
      el.innerHTML = `
        <div class="ac-empty">
          <div class="ac-empty-icon">${icon('accounts', 48)}</div>
          <div class="ac-empty-title">Акаунтів ще немає</div>
          <div class="ac-empty-desc">Натисніть "+ Додати акаунт" щоб почати</div>
        </div>
      `
      return
    }

    el.innerHTML = accounts.map(a => {
      const plat = getPlatform(a.platform)
      return `
        <div class="ac-card" data-id="${a.id}" style="--pc:${plat.color};--pg:${plat.gradient}">
          <div class="ac-card-stripe"></div>
          <div class="ac-card-body">
            <div class="ac-card-top">
              <div class="ac-card-icon" style="color:${plat.color}">${icon('accounts', 26)}</div>
              <div class="ac-card-actions">
                <button class="ac-icon-btn edit-btn" data-id="${a.id}" title="Редагувати">${icon('pencil', 13)}</button>
                <button class="ac-icon-btn delete-btn" data-id="${a.id}" title="Видалити">${icon('trash', 13)}</button>
              </div>
            </div>
            <div class="ac-card-plat">${plat.label}</div>
            <div class="ac-card-handle">${a.handle}</div>
            ${a.niche ? `<div class="ac-card-niche">${a.niche}</div>` : ''}
          </div>
          <div class="ac-card-footer">
            <div class="ac-card-followers">
              <span class="ac-fol-num">${fmtNum(Number(a.followers) || 0)}</span>
              <span class="ac-fol-label">підп.</span>
            </div>
            ${a.note ? `<div class="ac-card-note" title="${a.note}">${icon('notes', 14)}</div>` : ''}
          </div>
        </div>
      `
    }).join('')

    el.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const a = accounts.find(x => x.id === btn.dataset.id)
        if (!a) return
        editId = a.id
        selectPlat(a.platform)
        container.querySelector('#ac-handle').value    = a.handle || ''
        container.querySelector('#ac-followers').value = a.followers || ''
        container.querySelector('#ac-niche').value     = a.niche || ''
        container.querySelector('#ac-note').value      = a.note || ''
        container.querySelector('#ac-modal-title').textContent = 'Редагувати акаунт'
        openModal()
      })
    })

    el.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        if (!confirm('Видалити акаунт?')) return
        await deleteDoc(doc(db, ...base, 'accounts', btn.dataset.id))
        await load()
      })
    })
  }

  // ── Platform picker ───────────────────────────────────────
  function selectPlat(id) {
    selPlat = id
    container.querySelectorAll('.ac-plat-pick').forEach(b => {
      b.classList.toggle('selected', b.dataset.plat === id)
    })
  }

  container.querySelector('#ac-plat-grid').addEventListener('click', e => {
    const btn = e.target.closest('.ac-plat-pick')
    if (btn) selectPlat(btn.dataset.plat)
  })

  // ── Modal ─────────────────────────────────────────────────
  function openModal() {
    container.querySelector('#ac-err').textContent = ''
    container.querySelector('#ac-modal').style.display = 'flex'
    setTimeout(() => container.querySelector('#ac-handle').focus(), 80)
  }

  function closeModal() {
    container.querySelector('#ac-modal').style.display = 'none'
    editId  = null
    selPlat = null
    container.querySelector('#ac-modal-title').textContent = 'Новий акаунт'
    container.querySelector('#ac-handle').value    = ''
    container.querySelector('#ac-followers').value = ''
    container.querySelector('#ac-niche').value     = ''
    container.querySelector('#ac-note').value      = ''
    container.querySelector('#ac-err').textContent = ''
    container.querySelectorAll('.ac-plat-pick').forEach(b => b.classList.remove('selected'))
  }

  container.querySelector('#ac-add-btn').addEventListener('click', openModal)
  container.querySelector('#ac-modal-close').addEventListener('click', closeModal)
  container.querySelector('#ac-cancel').addEventListener('click', closeModal)
  container.querySelector('#ac-modal').addEventListener('click', e => {
    if (e.target === container.querySelector('#ac-modal')) closeModal()
  })

  // ── Save ──────────────────────────────────────────────────
  container.querySelector('#ac-save').addEventListener('click', async () => {
    const handle = container.querySelector('#ac-handle').value.trim()
    const errEl  = container.querySelector('#ac-err')

    if (!selPlat) { errEl.textContent = 'Оберіть платформу'; return }
    if (!handle)  { errEl.textContent = 'Введіть нікнейм або URL'; return }
    errEl.textContent = ''

    const btn = container.querySelector('#ac-save')
    btn.disabled = true

    const data = {
      platform:  selPlat,
      handle,
      followers: Number(container.querySelector('#ac-followers').value) || null,
      niche:     container.querySelector('#ac-niche').value.trim() || null,
      note:      container.querySelector('#ac-note').value.trim() || null,
      updatedAt: serverTimestamp(),
    }

    try {
      if (editId) {
        await updateDoc(doc(db, ...base, 'accounts', editId), data)
      } else {
        await addDoc(colRef, { ...data, createdAt: serverTimestamp() })
      }
      closeModal()
      await load()
    } catch (err) {
      console.error(err)
    } finally {
      btn.disabled = false
    }
  })

  await load()
}

// ── Styles ────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('accounts-styles')) return
  const s = document.createElement('style')
  s.id = 'accounts-styles'
  s.textContent = `
    .ac-page    { padding: 32px 36px; max-width: 1200px; }
    .ac-header  { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:24px; }
    .ac-title   { font-family:var(--font-display); font-size:26px; font-weight:700; letter-spacing:-0.02em; margin-bottom:4px; }
    .ac-sub     { font-size:13px; color:var(--text-secondary); }

    /* Stats */
    .ac-stats { display:flex; gap:12px; margin-bottom:24px; flex-wrap:wrap; }
    .ac-stat-card {
      background:var(--bg-secondary); border:1px solid var(--border);
      border-radius:var(--radius-lg); padding:16px 24px; min-width:140px;
    }
    .ac-stat-val   { font-family:var(--font-display); font-size:28px; font-weight:800; letter-spacing:-0.02em; }
    .ac-stat-label { font-size:12px; color:var(--text-muted); margin-top:2px; }

    /* Grid */
    .ac-loading { display:flex; justify-content:center; padding:80px; }
    .ac-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 14px;
    }

    /* Card */
    .ac-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius-xl);
      overflow: hidden;
      transition: transform .2s, box-shadow .2s, border-color .2s;
      cursor: default;
      display: flex;
      flex-direction: column;
    }
    .ac-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 8px 28px rgba(0,0,0,.35);
      border-color: var(--pc);
    }
    .ac-card-stripe {
      height: 4px;
      background: var(--pg, var(--pc));
    }
    .ac-card-body  { padding: 16px 16px 12px; flex: 1; }
    .ac-card-top   { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:12px; }
    .ac-card-icon  { display:flex; align-items:center; }
    .ac-card-actions { display:flex; gap:4px; opacity:0; transition:opacity .2s; }
    .ac-card:hover .ac-card-actions { opacity:1; }
    .ac-icon-btn {
      width:28px; height:28px; border-radius:6px;
      display:flex; align-items:center; justify-content:center;
      font-size:13px; cursor:pointer; transition:background .2s;
    }
    .ac-icon-btn:hover { background:rgba(255,255,255,.1); }

    .ac-card-plat   { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:var(--pc); margin-bottom:4px; }
    .ac-card-handle { font-size:15px; font-weight:700; word-break:break-all; margin-bottom:4px; }
    .ac-card-niche  { font-size:12px; color:var(--text-secondary); }

    .ac-card-footer {
      display:flex; align-items:center; justify-content:space-between;
      padding:10px 16px; border-top:1px solid rgba(255,255,255,.06);
      background:rgba(0,0,0,.12);
    }
    .ac-fol-num   { font-family:var(--font-mono); font-size:16px; font-weight:800; color:var(--pc); }
    .ac-fol-label { font-size:11px; color:var(--text-muted); margin-left:4px; }
    .ac-card-note { display:flex; align-items:center; color:var(--text-muted); cursor:help; }

    /* Empty */
    .ac-empty       { text-align:center; padding:80px 24px; grid-column:1/-1; }
    .ac-empty-icon  { display:flex; align-items:center; justify-content:center; margin-bottom:16px; color:var(--text-muted); }
    .ac-empty-title { font-family:var(--font-display); font-size:18px; font-weight:600; margin-bottom:8px; }
    .ac-empty-desc  { font-size:14px; color:var(--text-muted); }

    /* Modal */
    .ac-overlay {
      position:fixed; inset:0; background:rgba(0,0,0,.6); backdrop-filter:blur(4px);
      display:flex; align-items:center; justify-content:center; z-index:1000; padding:24px;
    }
    .ac-modal {
      background:var(--bg-secondary); border:1px solid var(--border);
      border-radius:var(--radius-xl); width:100%; max-width:560px;
      box-shadow:var(--shadow-xl); animation:acModalIn .2s cubic-bezier(.34,1.2,.64,1);
      display:flex; flex-direction:column; max-height:90vh; overflow:hidden;
    }
    .ac-modal-header {
      display:flex; align-items:center; justify-content:space-between;
      padding:20px 24px 0; flex-shrink:0;
    }
    .ac-modal-title  { font-family:var(--font-display); font-size:20px; font-weight:700; }
    .ac-modal-close  {
      width:32px; height:32px; border-radius:8px;
      color:var(--text-muted); font-size:16px;
      display:flex; align-items:center; justify-content:center;
      cursor:pointer; transition:all .2s;
    }
    .ac-modal-close:hover { background:var(--accent-red-dim); color:var(--accent-red); }
    .ac-modal-body   { padding:20px 24px; display:flex; flex-direction:column; gap:14px; overflow-y:auto; }
    .ac-modal-footer { padding:0 24px 20px; display:flex; gap:10px; justify-content:flex-end; flex-shrink:0; }

    .field label {
      display:block; font-size:12px; font-weight:600; color:var(--text-secondary);
      text-transform:uppercase; letter-spacing:.05em; margin-bottom:6px;
    }
    .field-error { font-size:12px; color:#EF4444; margin-top:4px; display:block; }

    /* Platform picker grid */
    .ac-plat-grid {
      display:grid; grid-template-columns:repeat(3,1fr); gap:8px;
    }
    .ac-plat-pick {
      display:flex; flex-direction:column; align-items:center; gap:5px;
      padding:10px 6px; border-radius:var(--radius-lg);
      border:2px solid var(--border); background:var(--bg-tertiary);
      cursor:pointer; transition:all .2s; color:var(--text-primary);
    }
    .ac-plat-pick:hover { border-color:var(--pc); background:rgba(var(--pc-rgb),.08); }
    .ac-plat-pick.selected {
      border-color:var(--pc); background:var(--bg-secondary);
      box-shadow:0 0 0 3px color-mix(in srgb, var(--pc) 20%, transparent);
    }
    .ac-plat-pick-icon  { display:flex; align-items:center; justify-content:center; }
    .ac-plat-pick-label { font-size:11px; font-weight:600; text-align:center; }

    @keyframes acModalIn { from{opacity:0;transform:scale(.95)} to{opacity:1;transform:scale(1)} }
  `
  document.head.appendChild(s)
}
