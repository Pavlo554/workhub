// src/renderer/modules/documents/index.js
// Files stored locally via IPC (userData/documents/), metadata in Firestore
import { db } from '../../services/firebase.js'
import { icon } from '../../utils/icons.js'
import { getCurrentUser, getActivePathSegments, getActiveBasePath } from '../../services/auth.js'
import {
  collection, addDoc, getDocs, deleteDoc, doc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

// ── File type helpers ────────────────────────────────────────────────────────
const TYPE_META = {
  pdf:   { iconName: 'file-pdf',  label: 'PDF',        color: '#EF4444' },
  word:  { iconName: 'file',      label: 'Word',       color: '#3B82F6' },
  excel: { iconName: 'bar-chart', label: 'Excel',      color: '#22C55E' },
  ppt:   { iconName: 'templates', label: 'PowerPoint', color: '#F97316' },
  image: { iconName: 'image',     label: 'Зображення', color: '#A78BFA' },
  video: { iconName: 'film',      label: 'Відео',      color: '#EC4899' },
  audio: { iconName: 'music',     label: 'Аудіо',      color: '#F59E0B' },
  zip:   { iconName: 'warehouse', label: 'Архів',      color: '#6B7280' },
  text:  { iconName: 'notes',     label: 'Текст',      color: '#94A3B8' },
  other: { iconName: 'paperclip', label: 'Файл',       color: '#64748B' },
}

function getFileType(name, mime) {
  const ext = (name || '').split('.').pop().toLowerCase()
  const m   = mime || ''
  if (m.includes('pdf')  || ext === 'pdf')                           return 'pdf'
  if (m.includes('word') || ['doc','docx'].includes(ext))            return 'word'
  if (m.includes('excel')|| m.includes('spreadsheet') || ['xls','xlsx'].includes(ext)) return 'excel'
  if (m.includes('presentation') || ['ppt','pptx'].includes(ext))   return 'ppt'
  if (m.startsWith('image/'))                                         return 'image'
  if (m.startsWith('video/'))                                         return 'video'
  if (m.startsWith('audio/'))                                         return 'audio'
  if (['zip','rar','7z','tar','gz'].includes(ext))                    return 'zip'
  if (['txt','md','csv'].includes(ext))                               return 'text'
  return 'other'
}

function fmtSize(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024)       return bytes + ' Б'
  if (bytes < 1024*1024)  return (bytes/1024).toFixed(1) + ' КБ'
  return (bytes/(1024*1024)).toFixed(1) + ' МБ'
}

function fmtDate(val) {
  if (!val) return '—'
  const d = val?.toDate ? val.toDate() : new Date(val)
  if (isNaN(d)) return '—'
  return d.toLocaleDateString('uk-UA', { day:'2-digit', month:'short', year:'numeric' })
}

function escHtml(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

// ── Styles ────────────────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('dc-styles')) return
  const s = document.createElement('style')
  s.id = 'dc-styles'
  s.textContent = `
    .dc-layout {
      display: flex; height: 100%; overflow: hidden;
      background: var(--bg-primary, #0F1117); font-family: inherit;
    }

    /* Left */
    .dc-left {
      flex: 1; min-width: 0; display: flex; flex-direction: column;
      overflow: hidden; border-right: 1px solid var(--border, rgba(255,255,255,.08));
    }
    .dc-left-scroll {
      flex: 1; overflow-y: auto; padding: 0 20px 24px;
    }
    .dc-left-scroll::-webkit-scrollbar { width: 4px; }
    .dc-left-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,.12); border-radius: 2px; }

    /* Header */
    .dc-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 12px; padding: 24px 20px 16px; flex-shrink: 0;
    }
    .dc-title { font-size: 22px; font-weight: 700; color: var(--text-primary, #F1F5F9); margin: 0 0 4px; }
    .dc-sub   { font-size: 13px; color: var(--text-secondary, #94A3B8); margin: 0; }

    /* Upload button */
    .dc-btn-upload {
      display: flex; align-items: center; gap: 6px;
      padding: 9px 16px; background: #4F8EF7; color: #fff;
      border: none; border-radius: 10px; font-size: 13px;
      font-weight: 600; cursor: pointer; white-space: nowrap;
      transition: background .15s, transform .1s;
    }
    .dc-btn-upload:hover { background: #3B7DE8; transform: translateY(-1px); }
    .dc-btn-upload:disabled { opacity: .6; cursor: not-allowed; transform: none; }

    /* Stats */
    .dc-stats {
      display: grid; grid-template-columns: repeat(4,1fr);
      gap: 12px; margin-bottom: 20px;
    }
    .dc-stat {
      background: var(--bg-secondary, #1A1D2E);
      border: 1px solid var(--border, rgba(255,255,255,.08));
      border-radius: 12px; padding: 14px 16px;
      border-left: 4px solid var(--sc, #4F8EF7);
    }
    .dc-stat-label {
      font-size: 11px; font-weight: 600; text-transform: uppercase;
      letter-spacing: .06em; color: var(--sc, #4F8EF7); margin-bottom: 6px;
    }
    .dc-stat-val { font-size: 20px; font-weight: 700; color: var(--text-primary, #F1F5F9); }

    /* Toolbar */
    .dc-toolbar {
      display: flex; gap: 10px; margin-bottom: 16px; align-items: center;
    }
    .dc-search {
      flex: 1; padding: 8px 12px;
      background: var(--bg-secondary, #1A1D2E);
      border: 1px solid var(--border, rgba(255,255,255,.08));
      border-radius: 10px; color: var(--text-primary, #F1F5F9);
      font-size: 13px; outline: none; transition: border-color .15s;
    }
    .dc-search:focus { border-color: #4F8EF7; }

    /* Filter pills */
    .dc-filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
    .dc-pill {
      padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;
      border: 1px solid var(--border, rgba(255,255,255,.08));
      background: var(--bg-secondary, #1A1D2E);
      color: var(--text-secondary, #94A3B8); cursor: pointer; transition: all .15s;
    }
    .dc-pill.active {
      background: rgba(79,142,247,.15); border-color: #4F8EF7; color: #4F8EF7;
    }

    /* Upload progress */
    .dc-progress-bar-wrap {
      background: var(--bg-secondary, #1A1D2E);
      border: 1px solid var(--border, rgba(255,255,255,.08));
      border-radius: 12px; padding: 14px 16px; margin-bottom: 12px;
    }
    .dc-progress-name {
      font-size: 13px; font-weight: 500;
      color: var(--text-primary, #F1F5F9); margin-bottom: 8px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .dc-progress-track {
      height: 4px; background: rgba(255,255,255,.08);
      border-radius: 2px; overflow: hidden;
    }
    .dc-progress-fill {
      height: 100%; background: #4F8EF7; border-radius: 2px;
      transition: width .2s;
    }
    .dc-progress-pct {
      font-size: 11px; color: #4F8EF7; font-weight: 700; margin-top: 5px; text-align: right;
    }

    /* Document cards */
    .dc-list { display: flex; flex-direction: column; gap: 8px; }
    .dc-card {
      background: var(--bg-secondary, #1A1D2E);
      border: 1px solid var(--border, rgba(255,255,255,.08));
      border-radius: 12px; padding: 12px 14px;
      cursor: pointer; display: flex; align-items: center; gap: 12px;
      border-left: 4px solid var(--tc, #64748B);
      transition: background .15s, transform .1s;
    }
    .dc-card:hover { background: rgba(255,255,255,.03); transform: translateX(2px); }
    .dc-card.selected { background: rgba(79,142,247,.06); }
    .dc-card-icon {
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; width: 36px; height: 36px;
    }
    .dc-card-info { flex: 1; min-width: 0; }
    .dc-card-name {
      font-size: 13px; font-weight: 600; color: var(--text-primary, #F1F5F9);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 3px;
    }
    .dc-card-meta { font-size: 11px; color: var(--text-secondary, #94A3B8); }
    .dc-card-badge {
      padding: 3px 8px; border-radius: 20px; font-size: 10px; font-weight: 700;
      flex-shrink: 0; white-space: nowrap;
    }

    /* Empty */
    .dc-empty {
      text-align: center; padding: 60px 20px;
      color: var(--text-secondary, #94A3B8);
    }
    .dc-empty-icon { display: flex; align-items: center; justify-content: center; margin-bottom: 12px; opacity: .4; color: var(--text-muted, #64748B); }
    .dc-empty-text { font-size: 14px; margin-bottom: 16px; }

    /* Drop zone */
    .dc-drop-zone {
      border: 2px dashed rgba(79,142,247,.3);
      border-radius: 12px; padding: 32px; text-align: center;
      color: #4F8EF7; font-size: 13px; font-weight: 600;
      cursor: pointer; transition: all .2s; margin-bottom: 16px;
    }
    .dc-drop-zone:hover, .dc-drop-zone.dragover {
      background: rgba(79,142,247,.06); border-color: #4F8EF7;
    }
    .dc-drop-zone-icon { display: flex; align-items: center; justify-content: center; margin-bottom: 8px; opacity: .6; }

    /* Right panel */
    .dc-right {
      width: 360px; flex-shrink: 0; display: flex; flex-direction: column;
      overflow: hidden; background: var(--bg-primary, #0F1117);
    }
    .dc-right-scroll {
      flex: 1; overflow-y: auto; padding: 24px 20px;
    }
    .dc-right-scroll::-webkit-scrollbar { width: 4px; }
    .dc-right-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,.12); border-radius: 2px; }
    .dc-right-empty {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      gap: 12px; padding: 24px; color: var(--text-secondary, #94A3B8); text-align: center;
    }
    .dc-right-empty-icon { display: flex; align-items: center; justify-content: center; opacity: .3; color: var(--text-muted, #64748B); }

    /* Detail */
    .dc-d-header {
      display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px;
    }
    .dc-d-icon-box {
      width: 64px; height: 64px; border-radius: 16px; overflow: hidden;
      background: var(--bg-secondary, #1A1D2E);
      border: 1px solid var(--border, rgba(255,255,255,.08));
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 16px;
    }
    .dc-d-filename {
      font-size: 15px; font-weight: 700; color: var(--text-primary, #F1F5F9);
      text-align: center; word-break: break-all; margin-bottom: 6px;
    }
    .dc-d-badge {
      display: inline-block; padding: 3px 10px; border-radius: 20px;
      font-size: 11px; font-weight: 700; margin-bottom: 16px;
    }
    .dc-d-close {
      width: 28px; height: 28px; border-radius: 8px; border: none;
      background: rgba(255,255,255,.06); color: var(--text-secondary, #94A3B8);
      font-size: 15px; cursor: pointer; display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .dc-d-close:hover { background: rgba(255,255,255,.12); }

    .dc-d-row {
      display: flex; align-items: flex-start; gap: 10px;
      padding: 10px 12px; background: var(--bg-secondary, #1A1D2E);
      border-radius: 10px; margin-bottom: 6px;
    }
    .dc-d-row-icon { display: flex; align-items: center; justify-content: center; width: 20px; flex-shrink: 0; color: var(--text-muted, #64748B); }
    .dc-d-row-label { font-size: 11px; color: var(--text-secondary, #94A3B8); margin-bottom: 2px; }
    .dc-d-row-value { font-size: 13px; font-weight: 500; color: var(--text-primary, #F1F5F9); word-break: break-all; }

    .dc-d-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; }
    .dc-d-btn {
      padding: 10px 14px; border-radius: 10px; border: none;
      font-size: 13px; font-weight: 600; cursor: pointer;
      transition: all .15s; display: flex; align-items: center;
      justify-content: center; gap: 6px;
    }
    .dc-d-btn-download { background: rgba(79,142,247,.15); color: #4F8EF7; }
    .dc-d-btn-download:hover { background: rgba(79,142,247,.25); }
    .dc-d-btn-show { background: rgba(52,211,153,.12); color: #34D399; }
    .dc-d-btn-show:hover { background: rgba(52,211,153,.22); }
    .dc-d-btn-delete { background: rgba(239,68,68,.12); color: #EF4444; }
    .dc-d-btn-delete:hover { background: rgba(239,68,68,.22); }

    /* Shimmer */
    .dc-shimmer {
      background: linear-gradient(90deg,rgba(255,255,255,.04) 25%,rgba(255,255,255,.09) 50%,rgba(255,255,255,.04) 75%);
      background-size: 200% 100%; animation: dc-sh 1.4s infinite; border-radius: 10px;
    }
    @keyframes dc-sh { 0%{background-position:200% 0}100%{background-position:-200% 0} }
  `
  document.head.appendChild(s)
}

// ── Main render ──────────────────────────────────────────────────────────────
export async function render(container) {
  injectStyles()

  const user = await getCurrentUser()
  if (!user) { container.innerHTML = '<p style="color:#94A3B8;padding:24px">Потрібна авторизація</p>'; return }

  const base     = getActivePathSegments(user.uid)
  const basePath = getActiveBasePath(user.uid)

  let documents  = []
  let selectedId = null
  let filterType = 'all'
  let search     = ''

  // ── Skeleton ────────────────────────────────────────────────────────────
  container.innerHTML = `
    <div class="dc-layout">
      <div class="dc-left">
        <div class="dc-header">
          <div>
            <div class="dc-shimmer" style="width:160px;height:26px;margin-bottom:6px"></div>
            <div class="dc-shimmer" style="width:100px;height:14px"></div>
          </div>
          <div class="dc-shimmer" style="width:110px;height:36px;border-radius:10px"></div>
        </div>
        <div class="dc-left-scroll">
          <div class="dc-stats">
            ${[1,2,3,4].map(()=>`<div class="dc-shimmer" style="height:68px;border-radius:12px"></div>`).join('')}
          </div>
          ${[1,2,3,4,5].map(()=>`<div class="dc-shimmer" style="height:64px;border-radius:12px;margin-bottom:8px"></div>`).join('')}
        </div>
      </div>
      <div class="dc-right">
        <div class="dc-right-empty">
          <div class="dc-right-empty-icon">${icon('folder', 36)}</div>
          <p style="font-size:14px;margin:0">Завантаження...</p>
        </div>
      </div>
    </div>
  `

  // ── Load documents ──────────────────────────────────────────────────────
  async function loadDocs() {
    try {
      const snap = await getDocs(collection(db, ...base, 'documents'))
      documents = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      documents.sort((a, b) => {
        const ta = a.uploadedAt?.toDate?.() || new Date(0)
        const tb = b.uploadedAt?.toDate?.() || new Date(0)
        return tb - ta
      })
    } catch (e) { console.error('dc load', e) }
    renderAll()
  }

  // ── Stats ───────────────────────────────────────────────────────────────
  function buildStats() {
    const total  = documents.length
    const images = documents.filter(d => d.fileType === 'image').length
    const pdfs   = documents.filter(d => d.fileType === 'pdf').length
    const totalMb = documents.reduce((s, d) => s + (d.size || 0), 0)
    return [
      { label: 'Всього файлів',  val: total,          color: '#4F8EF7' },
      { label: 'PDF',            val: pdfs,            color: '#EF4444' },
      { label: 'Зображення',     val: images,          color: '#A78BFA' },
      { label: 'Розмір',         val: fmtSize(totalMb),color: '#34D399' },
    ]
  }

  // ── Filtered list ───────────────────────────────────────────────────────
  function filtered() {
    let list = documents
    if (filterType !== 'all') list = list.filter(d => d.fileType === filterType)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(d => (d.name || '').toLowerCase().includes(q))
    }
    return list
  }

  // ── Render list ─────────────────────────────────────────────────────────
  function renderList() {
    const list = filtered()
    if (!list.length) return `
      <div class="dc-drop-zone" id="dc-drop-zone">
        <div class="dc-drop-zone-icon">${icon('folder-open', 36)}</div>
        Перетягни файли сюди або натисни "Завантажити файл"
      </div>
      <div class="dc-empty">
        <div class="dc-empty-icon">${icon('folder', 36)}</div>
        <div class="dc-empty-text">Ще немає документів</div>
      </div>`

    return `
      <div class="dc-drop-zone" id="dc-drop-zone">
        <div class="dc-drop-zone-icon">${icon('folder-open', 36)}</div>
        Перетягни файли сюди для завантаження
      </div>
      <div class="dc-list">
        ${list.map(d => {
          const tm  = TYPE_META[d.fileType] || TYPE_META.other
          const sel = d.id === selectedId ? ' selected' : ''
          return `
            <div class="dc-card${sel}" data-id="${d.id}" style="--tc:${tm.color}">
              <div class="dc-card-icon" style="color:${tm.color}">${icon(tm.iconName, 20)}</div>
              <div class="dc-card-info">
                <div class="dc-card-name">${escHtml(d.name)}</div>
                <div class="dc-card-meta">${fmtSize(d.size)} · ${fmtDate(d.uploadedAt)}</div>
              </div>
              <div class="dc-card-badge" style="background:${tm.color}22;color:${tm.color}">${tm.label}</div>
            </div>`
        }).join('')}
      </div>`
  }

  // ── Render detail ────────────────────────────────────────────────────────
  function renderDetail(d) {
    const tm = TYPE_META[d.fileType] || TYPE_META.other
    return `
      <div class="dc-d-header">
        <div></div>
        <button class="dc-d-close" id="dc-d-close">${icon('x', 14)}</button>
      </div>
      <div style="text-align:center;margin-bottom:20px">
        <div class="dc-d-icon-box" style="color:${tm.color}">${icon(tm.iconName, 32)}</div>
        <div class="dc-d-filename">${escHtml(d.name)}</div>
        <span class="dc-d-badge" style="background:${tm.color}22;color:${tm.color}">${tm.label}</span>
      </div>

      <div class="dc-d-row">
        <div class="dc-d-row-icon">${icon('ruler', 14)}</div>
        <div>
          <div class="dc-d-row-label">Розмір</div>
          <div class="dc-d-row-value">${fmtSize(d.size)}</div>
        </div>
      </div>
      <div class="dc-d-row">
        <div class="dc-d-row-icon">${icon('calendar', 14)}</div>
        <div>
          <div class="dc-d-row-label">Завантажено</div>
          <div class="dc-d-row-value">${fmtDate(d.uploadedAt)}</div>
        </div>
      </div>
      <div class="dc-d-row">
        <div class="dc-d-row-icon">${icon('paperclip', 14)}</div>
        <div>
          <div class="dc-d-row-label">Тип файлу</div>
          <div class="dc-d-row-value">${escHtml(d.mimeType || d.fileType || '—')}</div>
        </div>
      </div>

      <div class="dc-d-actions">
        <button class="dc-d-btn dc-d-btn-download" id="dc-d-download">▶ Відкрити файл</button>
        <button class="dc-d-btn dc-d-btn-show" id="dc-d-show">${icon('folder-open', 13)} Показати в провіднику</button>
        <button class="dc-d-btn dc-d-btn-delete" id="dc-d-delete">${icon('trash', 13)} Видалити файл</button>
      </div>
    `
  }

  // ── Full render ──────────────────────────────────────────────────────────
  function renderAll() {
    const stats     = buildStats()
    const typeFilters = [
      ['all','Всі'],['pdf','PDF'],['word','Word'],['excel','Excel'],
      ['image','Зображення'],['video','Відео'],['zip','Архіви'],
    ]

    container.innerHTML = `
      <div class="dc-layout">
        <div class="dc-left">
          <div class="dc-header">
            <div>
              <h2 class="dc-title">Документи</h2>
              <p class="dc-sub">${documents.length} файлів</p>
            </div>
            <button class="dc-btn-upload" id="dc-upload-btn">${icon('upload', 13)} Завантажити файл</button>
            <input type="file" id="dc-file-input" multiple style="display:none">
          </div>
          <div class="dc-left-scroll">
            <div class="dc-stats">
              ${stats.map(s=>`
                <div class="dc-stat" style="--sc:${s.color}">
                  <div class="dc-stat-label">${s.label}</div>
                  <div class="dc-stat-val">${s.val}</div>
                </div>`).join('')}
            </div>

            <div class="dc-toolbar">
              <input class="dc-search" id="dc-search" placeholder="Пошук документа..." value="${escHtml(search)}">
            </div>

            <div class="dc-filters">
              ${typeFilters.map(([k,l])=>`
                <button class="dc-pill${filterType===k?' active':''}" data-filter="${k}">${l}</button>
              `).join('')}
            </div>

            <div id="dc-progress-area"></div>
            <div id="dc-content">${renderList()}</div>
          </div>
        </div>

        <div class="dc-right" id="dc-right">
          ${selectedId && documents.find(d=>d.id===selectedId)
            ? `<div class="dc-right-scroll">${renderDetail(documents.find(d=>d.id===selectedId))}</div>`
            : `<div class="dc-right-empty">
                <div class="dc-right-empty-icon">${icon('folder', 36)}</div>
                <p style="font-size:14px;margin:0">Виберіть документ або завантажте новий</p>
               </div>`}
        </div>
      </div>
    `

    bindEvents()
  }

  // ── Events ───────────────────────────────────────────────────────────────
  function bindEvents() {
    // Upload button → file picker
    container.querySelector('#dc-upload-btn')?.addEventListener('click', () => {
      container.querySelector('#dc-file-input')?.click()
    })

    container.querySelector('#dc-file-input')?.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || [])
      if (files.length) uploadFiles(files)
      e.target.value = ''
    })

    // Search
    container.querySelector('#dc-search')?.addEventListener('input', (e) => {
      search = e.target.value
      container.querySelector('#dc-content').innerHTML = renderList()
      bindListEvents()
    })

    // Filter pills
    container.querySelectorAll('[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        filterType = btn.dataset.filter
        renderAll()
      })
    })

    // Drag-and-drop zone
    const dropZone = container.querySelector('#dc-drop-zone')
    if (dropZone) {
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault()
        dropZone.classList.add('dragover')
      })
      dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'))
      dropZone.addEventListener('drop', (e) => {
        e.preventDefault()
        dropZone.classList.remove('dragover')
        const files = Array.from(e.dataTransfer.files || [])
        if (files.length) uploadFiles(files)
      })
      dropZone.addEventListener('click', () => container.querySelector('#dc-file-input')?.click())
    }

    bindListEvents()
    bindDetailEvents()
  }

  function bindListEvents() {
    container.querySelectorAll('.dc-card').forEach(card => {
      card.addEventListener('click', () => {
        selectedId = card.dataset.id
        renderAll()
      })
    })
  }

  function bindDetailEvents() {
    container.querySelector('#dc-d-close')?.addEventListener('click', () => {
      selectedId = null
      renderAll()
    })

    container.querySelector('#dc-d-download')?.addEventListener('click', async () => {
      const d = documents.find(x => x.id === selectedId)
      if (!d?.localPath) return
      await window.electron.docs.open(d.localPath)
    })

    container.querySelector('#dc-d-show')?.addEventListener('click', async () => {
      const d = documents.find(x => x.id === selectedId)
      if (!d?.localPath) return
      await window.electron.docs.show(d.localPath)
    })

    container.querySelector('#dc-d-delete')?.addEventListener('click', async () => {
      const d = documents.find(x => x.id === selectedId)
      if (!d) return
      if (!confirm(`Видалити "${d.name}"?`)) return
      try {
        if (d.localPath) await window.electron.docs.delete(d.localPath)
        await deleteDoc(doc(db, ...base, 'documents', d.id))
        documents = documents.filter(x => x.id !== d.id)
        selectedId = null
        renderAll()
      } catch (e) { alert('Помилка: ' + e.message) }
    })
  }

  // ── Upload files ────────────────────────────────────────────────────────
  async function uploadFiles(files) {
    const uploadBtn = container.querySelector('#dc-upload-btn')
    if (uploadBtn) uploadBtn.disabled = true
    for (const file of files) await uploadSingleFile(file)
    if (uploadBtn) uploadBtn.disabled = false
  }

  async function uploadSingleFile(file) {
    const progressArea = container.querySelector('#dc-progress-area')
    const progressId   = 'prog-' + Date.now()

    if (progressArea) {
      const div = document.createElement('div')
      div.className = 'dc-progress-bar-wrap'
      div.id = progressId
      div.innerHTML = `
        <div class="dc-progress-name">${escHtml(file.name)}</div>
        <div class="dc-progress-track">
          <div class="dc-progress-fill" style="width:0%" id="${progressId}-fill"></div>
        </div>
        <div class="dc-progress-pct" id="${progressId}-pct">Копіювання...</div>
      `
      progressArea.appendChild(div)
    }

    try {
      const fileType = getFileType(file.name, file.type)

      // Read file as ArrayBuffer then send to main via IPC
      const buffer = await file.arrayBuffer()
      const result = await window.electron.docs.save(file.name, buffer, user.uid)

      if (result.error) throw new Error(result.error)

      // Update progress to 100%
      const fill  = document.getElementById(`${progressId}-fill`)
      const pctEl = document.getElementById(`${progressId}-pct`)
      if (fill)  fill.style.width = '100%'
      if (pctEl) pctEl.textContent = '100%'

      const meta = {
        name:      file.name,
        fileType,
        mimeType:  file.type,
        size:      file.size,
        localPath: result.localPath,
        uploadedAt: serverTimestamp(),
      }
      const docRef = await addDoc(collection(db, ...base, 'documents'), meta)
      documents.unshift({ id: docRef.id, ...meta, uploadedAt: { toDate: () => new Date() } })
    } catch (e) {
      console.error('Upload error', e)
      alert(`Помилка завантаження "${file.name}": ${e.message}`)
    } finally {
      setTimeout(() => document.getElementById(progressId)?.remove(), 500)
    }

    renderAll()
  }

  // ── Boot ─────────────────────────────────────────────────────────────────
  await loadDocs()
}
