// src/renderer/modules/notes/index.js
import { db } from '../../services/firebase.js'
import { getCurrentUser, getActivePathSegments } from '../../services/auth.js'
import { debounce } from '../../../core/utils.js'
import { icon } from '../../utils/icons.js'
import { t } from '../../core/i18n.js'
import {
  collection, addDoc, getDocs, deleteDoc,
  doc, updateDoc, query, orderBy, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

const COLOR_META = {
  default: { bg: 'var(--bg-secondary)', accent: '#6B7280', dot: '#6B7280', get label() { return t('notes.color.default') } },
  yellow:  { bg: '#1E1900',             accent: '#F59E0B', dot: '#F59E0B', get label() { return t('notes.color.yellow') } },
  green:   { bg: '#001A0E',             accent: '#34D399', dot: '#34D399', get label() { return t('notes.color.green') } },
  blue:    { bg: '#001020',             accent: '#4F8EF7', dot: '#4F8EF7', get label() { return t('notes.color.blue') } },
  purple:  { bg: '#130020',             accent: '#A78BFA', dot: '#A78BFA', get label() { return t('notes.color.purple') } },
  red:     { bg: '#200000',             accent: '#F87171', dot: '#F87171', get label() { return t('notes.color.red') } },
}

export async function render(container) {
  injectStyles()

  container.innerHTML = `
    <div class="nt-layout">

      <!-- ══ LEFT ══ -->
      <div class="nt-left" id="nt-left">

        <div class="nt-header">
          <div>
            <h1 class="nt-title">${t('notes.title')}</h1>
            <p class="nt-sub" id="nt-count">${t('common.loading')}</p>
          </div>
          <button class="btn btn-primary" id="add-note-btn">${t('notes.new')}</button>
        </div>

        <!-- Search -->
        <div class="nt-search">
          <span class="nt-search-icon">${icon('search', 14)}</span>
          <input type="text" class="nt-search-input" id="nt-search" placeholder="${t('common.search')}" />
        </div>

        <!-- Color filters -->
        <div class="nt-color-filters" id="nt-color-filters">
          <button class="nt-cf active" data-color="all">${t('notes.all')}</button>
          ${Object.entries(COLOR_META).map(([k, v]) =>
            `<button class="nt-cf" data-color="${k}">
              <span class="nt-cf-dot" style="background:${v.dot}"></span>${v.label}
            </button>`
          ).join('')}
        </div>

        <!-- Grid -->
        <div id="nt-grid">
          <div class="nt-loading"><div class="spinner"></div></div>
        </div>

      </div>

      <!-- ══ RIGHT DETAIL / EDITOR ══ -->
      <div class="nt-right" id="nt-right" style="display:none">
        <div class="nt-editor" id="nt-editor"></div>
      </div>

    </div>
  `

  let notes       = []
  let selectedId  = null
  let colorFilter = 'all'
  let searchQ     = ''
  const user      = getCurrentUser()
  const base      = getActivePathSegments(user.uid)

  // ── Load ──────────────────────────────────────────────────
  async function loadNotes() {
    try {
      const q    = query(collection(db, ...base, 'notes'), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      notes      = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch {
      try {
        const snap = await getDocs(collection(db, ...base, 'notes'))
        notes = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      } catch { notes = [] }
    }
    updateCount()
    renderGrid()
    if (selectedId) {
      const n = notes.find(x => x.id === selectedId)
      if (n) openEditor(n); else closeEditor()
    }
  }

  function updateCount() {
    const n = notes.length
    container.querySelector('#nt-count').textContent =
      n === 0 ? 'Нотаток немає' : `${n} ${plural(n, 'нотатка', 'нотатки', 'нотаток')}`
  }

  // ── Render grid ───────────────────────────────────────────
  function getFiltered() {
    return notes.filter(n => {
      if (colorFilter !== 'all' && (n.color || 'default') !== colorFilter) return false
      if (searchQ && !n.title?.toLowerCase().includes(searchQ) && !n.content?.toLowerCase().includes(searchQ)) return false
      return true
    })
  }

  function renderGrid() {
    const list = getFiltered()
    const el   = container.querySelector('#nt-grid')

    if (list.length === 0) {
      el.innerHTML = `
        <div class="nt-empty">
          <div class="nt-empty-icon">${icon('notes', 36)}</div>
          <div class="nt-empty-title">${notes.length === 0 ? 'Нотаток ще немає' : 'Нічого не знайдено'}</div>
          <div class="nt-empty-desc">Натисніть "+ Нова" щоб створити першу нотатку</div>
        </div>`
      return
    }

    el.innerHTML = `<div class="nt-masonry">${list.map(n => renderNoteCard(n)).join('')}</div>`

    el.querySelectorAll('.nt-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('.nt-card-del')) return
        const note = notes.find(n => n.id === card.dataset.id)
        if (!note) return
        if (selectedId === note.id) { closeEditor(); return }
        openEditor(note)
      })
    })

    el.querySelectorAll('.nt-card-del').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation()
        if (!confirm('Видалити нотатку?')) return
        if (selectedId === btn.dataset.id) closeEditor()
        await deleteDoc(doc(db, ...base, 'notes', btn.dataset.id))
        await loadNotes()
      })
    })
  }

  function renderNoteCard(n) {
    const color   = n.color || 'default'
    const meta    = COLOR_META[color] || COLOR_META.default
    const preview = (n.content || '').slice(0, 160)
    const date    = n.updatedAt?.toDate?.() || n.createdAt?.toDate?.() || new Date()
    return `
      <div class="nt-card ${selectedId === n.id ? 'nt-selected' : ''}"
           data-id="${n.id}"
           style="background:${meta.bg};--na:${meta.accent}">
        <div class="nt-card-stripe" style="background:${meta.accent}"></div>
        <div class="nt-card-body">
          <div class="nt-card-top">
            <div class="nt-card-title">${n.title || 'Без назви'}</div>
            <button class="nt-card-del" data-id="${n.id}" title="Видалити">${icon('trash', 12)}</button>
          </div>
          ${preview ? `<div class="nt-card-preview">${preview}${n.content?.length > 160 ? '…' : ''}</div>` : ''}
          <div class="nt-card-date">${fmtDate(date)}</div>
        </div>
      </div>
    `
  }

  // ── Right panel — Editor ──────────────────────────────────
  function openEditor(note) {
    selectedId = note.id
    container.querySelector('#nt-left').classList.add('nt-has-detail')
    container.querySelector('#nt-right').style.display = 'flex'

    const color = note.color || 'default'
    const meta  = COLOR_META[color] || COLOR_META.default

    container.querySelector('#nt-editor').innerHTML = `
      <div class="nt-ed-stripe" style="background:${meta.accent}"></div>

      <div class="nt-ed-toolbar">
        <button class="nt-ed-close" id="nt-ed-close">${icon('x', 14)}</button>
        <div class="nt-ed-colors">
          ${Object.entries(COLOR_META).map(([k, v]) => `
            <button class="nt-ed-dot ${color === k ? 'nt-ed-dot-active' : ''}"
              data-color="${k}" style="background:${v.dot}" title="${v.label}"></button>
          `).join('')}
        </div>
        <div class="nt-ed-actions">
          <button class="nt-ed-save btn btn-primary" id="nt-ed-save">Зберегти</button>
          <button class="nt-ed-del btn btn-danger"   id="nt-ed-del">${icon('trash', 13)}</button>
        </div>
      </div>

      <div class="nt-ed-body">
        <input class="nt-ed-title" id="nt-ed-title" value="${escHtml(note.title || '')}" placeholder="Заголовок..." />
        <textarea class="nt-ed-content" id="nt-ed-content" placeholder="Текст нотатки...">${escHtml(note.content || '')}</textarea>
      </div>

      <div class="nt-ed-footer">
        <span class="nt-ed-meta">
          Створено: ${fmtDate(note.createdAt?.toDate?.() || new Date())}
          ${note.updatedAt ? ` · Змінено: ${fmtDate(note.updatedAt.toDate())}` : ''}
        </span>
      </div>
    `

    // Refresh highlights
    refreshHighlights()

    // Color picker
    let selectedColor = color
    container.querySelectorAll('.nt-ed-dot').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedColor = btn.dataset.color
        container.querySelectorAll('.nt-ed-dot').forEach(b => b.classList.remove('nt-ed-dot-active'))
        btn.classList.add('nt-ed-dot-active')
        // Update stripe preview
        const newMeta = COLOR_META[selectedColor] || COLOR_META.default
        container.querySelector('.nt-ed-stripe').style.background = newMeta.accent
      })
    })

    // Save
    container.querySelector('#nt-ed-save').addEventListener('click', async () => {
      const title   = container.querySelector('#nt-ed-title').value.trim()
      const content = container.querySelector('#nt-ed-content').value.trim()
      if (!title) { container.querySelector('#nt-ed-title').classList.add('nt-input-error'); return }
      container.querySelector('#nt-ed-title').classList.remove('nt-input-error')

      const btn = container.querySelector('#nt-ed-save')
      btn.disabled = true; btn.textContent = '...'
      try {
        await updateDoc(doc(db, ...base, 'notes', note.id), {
          title, content, color: selectedColor, updatedAt: serverTimestamp()
        })
        await loadNotes()
      } catch (err) { console.error(err) }
      finally { btn.disabled = false; btn.textContent = 'Зберегти' }
    })

    // Delete
    container.querySelector('#nt-ed-del').addEventListener('click', async () => {
      if (!confirm('Видалити нотатку?')) return
      await deleteDoc(doc(db, ...base, 'notes', note.id))
      closeEditor()
      await loadNotes()
    })

    // Close
    container.querySelector('#nt-ed-close').addEventListener('click', closeEditor)
  }

  function closeEditor() {
    selectedId = null
    container.querySelector('#nt-right').style.display = 'none'
    container.querySelector('#nt-left').classList.remove('nt-has-detail')
    refreshHighlights()
  }

  function refreshHighlights() {
    container.querySelectorAll('.nt-card').forEach(c =>
      c.classList.toggle('nt-selected', c.dataset.id === selectedId)
    )
  }

  // ── New note modal (inline in right panel) ────────────────
  container.querySelector('#add-note-btn').addEventListener('click', () => {
    selectedId = '__new__'
    container.querySelector('#nt-left').classList.add('nt-has-detail')
    container.querySelector('#nt-right').style.display = 'flex'

    let selectedColor = 'default'
    container.querySelector('#nt-editor').innerHTML = `
      <div class="nt-ed-stripe" style="background:#6B7280"></div>

      <div class="nt-ed-toolbar">
        <button class="nt-ed-close" id="nt-ed-close">${icon('x', 14)}</button>
        <div class="nt-ed-colors">
          ${Object.entries(COLOR_META).map(([k, v]) => `
            <button class="nt-ed-dot ${k === 'default' ? 'nt-ed-dot-active' : ''}"
              data-color="${k}" style="background:${v.dot}" title="${v.label}"></button>
          `).join('')}
        </div>
        <div class="nt-ed-actions">
          <button class="nt-ed-save btn btn-primary" id="nt-ed-save">Зберегти</button>
        </div>
      </div>

      <div class="nt-ed-body">
        <input class="nt-ed-title" id="nt-ed-title" placeholder="Заголовок..." />
        <textarea class="nt-ed-content" id="nt-ed-content" placeholder="Текст нотатки..."></textarea>
      </div>
    `

    container.querySelector('#nt-ed-close').addEventListener('click', closeEditor)

    container.querySelectorAll('.nt-ed-dot').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedColor = btn.dataset.color
        container.querySelectorAll('.nt-ed-dot').forEach(b => b.classList.remove('nt-ed-dot-active'))
        btn.classList.add('nt-ed-dot-active')
        container.querySelector('.nt-ed-stripe').style.background = (COLOR_META[selectedColor] || COLOR_META.default).accent
      })
    })

    container.querySelector('#nt-ed-save').addEventListener('click', async () => {
      const title   = container.querySelector('#nt-ed-title').value.trim()
      const content = container.querySelector('#nt-ed-content').value.trim()
      if (!title) { container.querySelector('#nt-ed-title').classList.add('nt-input-error'); return }

      const btn = container.querySelector('#nt-ed-save')
      btn.disabled = true; btn.textContent = '...'
      try {
        await addDoc(collection(db, ...base, 'notes'), {
          title, content, color: selectedColor, createdAt: serverTimestamp()
        })
        closeEditor()
        await loadNotes()
      } catch (err) { console.error(err) }
      finally { btn.disabled = false; btn.textContent = 'Зберегти' }
    })

    setTimeout(() => container.querySelector('#nt-ed-title')?.focus(), 100)
  })

  // ── Filters & search ──────────────────────────────────────
  container.querySelectorAll('.nt-cf').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.nt-cf').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      colorFilter = btn.dataset.color
      renderGrid()
    })
  })

  container.querySelector('#nt-search').addEventListener('input', debounce(e => {
    searchQ = e.target.value.toLowerCase().trim()
    renderGrid()
  }, 250))

  await loadNotes()
}

// ── Helpers ───────────────────────────────────────────────
function fmtDate(date) {
  if (!date) return ''
  try { return date.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
  catch { return '' }
}
function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few
  return many
}
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

// ── Styles ────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('nt-styles')) return
  const style = document.createElement('style')
  style.id = 'nt-styles'
  style.textContent = `
  .nt-layout { display:flex; height:100%; overflow:hidden; }

  .nt-left {
    flex:1; display:flex; flex-direction:column; overflow:hidden;
    padding:28px 28px 0; transition:all .2s;
  }
  .nt-right {
    width:400px; flex-shrink:0; border-left:1px solid var(--border);
    display:flex; flex-direction:column; overflow:hidden;
    background:var(--bg-primary);
  }

  .nt-header {
    display:flex; align-items:flex-start; justify-content:space-between;
    margin-bottom:16px; gap:12px; flex-shrink:0;
  }
  .nt-title { font-family:var(--font-display); font-size:22px; font-weight:800; letter-spacing:-0.02em; }
  .nt-sub   { font-size:13px; color:var(--text-secondary); margin-top:2px; }

  .nt-search {
    display:flex; align-items:center; gap:10px;
    background:var(--bg-tertiary); border:1.5px solid var(--border);
    border-radius:var(--radius-md); padding:9px 14px; margin-bottom:12px;
    transition:border-color .2s; flex-shrink:0;
  }
  .nt-search:focus-within { border-color:var(--accent-blue); }
  .nt-search-icon { display:flex; align-items:center; color:var(--text-muted); flex-shrink:0; }
  .nt-search-input { flex:1; background:none; font-size:13px; color:var(--text-primary); }
  .nt-search-input::placeholder { color:var(--text-muted); }

  .nt-color-filters { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:16px; flex-shrink:0; }
  .nt-cf {
    display:flex; align-items:center; gap:6px;
    padding:5px 12px; border-radius:var(--radius-full); font-size:12px; font-weight:600;
    border:1px solid var(--border); background:var(--bg-secondary); color:var(--text-secondary);
    cursor:pointer; transition:all .15s;
  }
  .nt-cf:hover  { border-color:var(--accent-blue); color:var(--text-primary); }
  .nt-cf.active { background:var(--accent-blue); color:#fff; border-color:var(--accent-blue); }
  .nt-cf-dot    { width:8px; height:8px; border-radius:50%; flex-shrink:0; }

  #nt-grid { flex:1; overflow-y:auto; padding-bottom:24px; }

  /* ── Masonry ── */
  .nt-masonry { columns:2 240px; gap:12px; }

  .nt-card {
    break-inside:avoid; border:1px solid color-mix(in srgb, var(--na) 25%, transparent);
    border-radius:var(--radius-lg); margin-bottom:12px; overflow:hidden;
    cursor:pointer; transition:all .15s; display:flex;
  }
  .nt-card:hover    { transform:translateY(-2px); box-shadow:0 6px 20px rgba(0,0,0,.25); border-color:var(--na); }
  .nt-card.nt-selected { border-color:var(--accent-blue); box-shadow:0 0 0 2px rgba(79,142,247,.2); }

  .nt-card-stripe { width:4px; flex-shrink:0; }
  .nt-card-body   { flex:1; padding:14px 16px; display:flex; flex-direction:column; gap:6px; min-width:0; }

  .nt-card-top    { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; }
  .nt-card-title  { font-weight:700; font-size:14px; line-height:1.35; word-break:break-word; }
  .nt-card-del {
    opacity:0; width:24px; height:24px; border-radius:6px; font-size:12px;
    display:flex; align-items:center; justify-content:center; cursor:pointer;
    transition:all .15s; flex-shrink:0;
  }
  .nt-card:hover .nt-card-del { opacity:1; }
  .nt-card-del:hover { background:rgba(239,68,68,.15); }

  .nt-card-preview {
    font-size:12px; color:var(--text-secondary); line-height:1.55;
    white-space:pre-wrap; word-break:break-word;
    display:-webkit-box; -webkit-line-clamp:4; -webkit-box-orient:vertical; overflow:hidden;
  }
  .nt-card-date { font-size:11px; color:var(--text-muted); margin-top:4px; }

  .nt-loading, .nt-empty {
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    padding:60px 20px; gap:10px; text-align:center;
  }
  .nt-empty-icon  { display:flex; align-items:center; justify-content:center; color:var(--text-muted); }
  .nt-empty-title { font-size:15px; font-weight:600; color:var(--text-secondary); }
  .nt-empty-desc  { font-size:13px; color:var(--text-muted); }

  /* ── Editor ── */
  .nt-editor { display:flex; flex-direction:column; flex:1; overflow:hidden; }
  .nt-ed-stripe { height:5px; flex-shrink:0; transition:background .2s; }

  .nt-ed-toolbar {
    display:flex; align-items:center; gap:10px; padding:12px 16px;
    border-bottom:1px solid var(--border); flex-shrink:0; flex-wrap:wrap;
  }
  .nt-ed-close {
    width:28px; height:28px; border-radius:50%; border:1px solid var(--border);
    background:var(--bg-tertiary); color:var(--text-muted); font-size:12px;
    cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all .15s; flex-shrink:0;
  }
  .nt-ed-close:hover { color:var(--text-primary); background:var(--bg-elevated); }
  .nt-ed-colors { display:flex; gap:6px; flex:1; }
  .nt-ed-dot {
    width:20px; height:20px; border-radius:50%; cursor:pointer;
    border:2px solid transparent; transition:all .15s;
  }
  .nt-ed-dot:hover        { transform:scale(1.15); }
  .nt-ed-dot.nt-ed-dot-active { border-color:#fff; transform:scale(1.2); }
  .nt-ed-actions { display:flex; gap:6px; }

  .nt-ed-body {
    flex:1; display:flex; flex-direction:column; overflow:hidden;
  }
  .nt-ed-title {
    padding:16px 20px 8px; font-family:var(--font-display); font-size:18px; font-weight:800;
    letter-spacing:-0.01em; background:none; border:none; border-bottom:1px solid var(--border);
    color:var(--text-primary); outline:none; flex-shrink:0;
  }
  .nt-ed-title::placeholder { color:var(--text-muted); }
  .nt-ed-title.nt-input-error { border-color:#EF4444; }
  .nt-ed-content {
    flex:1; padding:16px 20px; background:none; border:none; outline:none;
    color:var(--text-primary); font-size:13px; line-height:1.7;
    resize:none; font-family:inherit;
  }
  .nt-ed-content::placeholder { color:var(--text-muted); }

  .nt-ed-footer {
    padding:10px 20px; border-top:1px solid var(--border); flex-shrink:0;
  }
  .nt-ed-meta { font-size:11px; color:var(--text-muted); }

  .btn-danger { background:rgba(239,68,68,.12); color:#EF4444; border:1px solid rgba(239,68,68,.25); }
  .btn-danger:hover { background:rgba(239,68,68,.2); }
  `
  document.head.appendChild(style)
}
