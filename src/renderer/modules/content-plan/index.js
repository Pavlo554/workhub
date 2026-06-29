// src/renderer/modules/content-plan/index.js
import { db } from '../../services/firebase.js'
import { getCurrentUser, getActivePathSegments } from '../../services/auth.js'
import { icon } from '../../utils/icons.js'
import { uploadToCloudinary } from '../../services/cloudinary.js'
import {
  collection, addDoc, getDocs, deleteDoc, doc, updateDoc,
  query, orderBy, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

// Підтримка старих постів з одним полем `platform` замість масиву `platforms`
function postPlatforms(p) {
  return p.platforms || (p.platform ? [p.platform] : [])
}

// ── Constants ─────────────────────────────────────────────

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram', color: '#E1306C' },
  { id: 'tiktok',    label: 'TikTok',    color: '#69C9D0' },
  { id: 'telegram',  label: 'Telegram',  color: '#2CA5E0' },
  { id: 'facebook',  label: 'Facebook',  color: '#1877F2' },
  { id: 'youtube',   label: 'YouTube',   color: '#FF0000' },
  { id: 'linkedin',  label: 'LinkedIn',  color: '#0A66C2' },
  { id: 'twitter',   label: 'Twitter/X', color: '#1DA1F2' },
  { id: 'other',     label: 'Інше',      color: '#94A3B8' },
]

const POST_TYPES = [
  { id: 'post',    label: 'Пост'        },
  { id: 'story',   label: 'Сторіз'      },
  { id: 'reel',    label: 'Reels'       },
  { id: 'video',   label: 'Відео'       },
  { id: 'article', label: 'Стаття'      },
  { id: 'poll',    label: 'Опитування'  },
]

const STATUSES = {
  idea:       { label: 'Ідея',        color: '#94A3B8', bg: 'rgba(148,163,184,.12)' },
  writing:    { label: 'В роботі',    color: '#F59E0B', bg: 'rgba(245,158,11,.12)'  },
  ready:      { label: 'Готово',      color: '#4F8EF7', bg: 'rgba(79,142,247,.12)'  },
  published:  { label: 'Опубліковано',color: '#34D399', bg: 'rgba(52,211,153,.12)'  },
  cancelled:  { label: 'Скасовано',   color: '#EF4444', bg: 'rgba(239,68,68,.12)'   },
}

const DAYS_UK = ['Нд','Пн','Вт','Ср','Чт','Пт','Сб']
const MONTHS_UK = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень']

// ── Render ────────────────────────────────────────────────

export async function render(container) {
  injectStyles()

  container.innerHTML = `
    <div class="cp-page">

      <!-- Header -->
      <div class="cp-header">
        <div>
          <h1 class="cp-title">Контент-план</h1>
          <p class="cp-sub" id="cp-sub">Завантаження...</p>
        </div>
        <div class="cp-header-actions">
          <div class="cp-view-toggle">
            <button class="cp-view-btn active" data-view="kanban" title="Канбан">${icon('kanban', 15)}</button>
            <button class="cp-view-btn" data-view="calendar" title="Календар">${icon('tax-calendar', 15)}</button>
            <button class="cp-view-btn" data-view="list" title="Список">${icon('notes', 15)}</button>
          </div>
          <button class="btn btn-primary" id="cp-add-btn">+ Новий пост</button>
        </div>
      </div>

      <!-- Platform filter -->
      <div class="cp-platforms" id="cp-platforms">
        <button class="cp-plat-btn active" data-plat="all">Всі платформи</button>
        ${PLATFORMS.map(p => `
          <button class="cp-plat-btn" data-plat="${p.id}" style="--pc:${p.color}">
            ${p.label}
          </button>
        `).join('')}
      </div>

      <!-- Views -->
      <div id="cp-kanban-view">
        <div class="cp-kanban" id="cp-kanban">
          <div class="cp-loading"><div class="spinner"></div></div>
        </div>
      </div>

      <div id="cp-calendar-view" style="display:none">
        <div class="cp-cal-nav">
          <button class="cp-cal-arrow" id="cal-prev">←</button>
          <div class="cp-cal-month" id="cal-month-label"></div>
          <button class="cp-cal-arrow" id="cal-next">→</button>
        </div>
        <div id="cp-calendar"></div>
      </div>

      <div id="cp-list-view" style="display:none">
        <div id="cp-list"></div>
      </div>

    </div>

    <!-- ── Modal ── -->
    <div class="cp-overlay" id="cp-modal" style="display:none">
      <div class="cp-modal">
        <div class="cp-modal-head">
          <h2 id="cp-modal-title">Новий пост</h2>
          <button class="cp-modal-close" id="cp-modal-close">${icon('x', 14)}</button>
        </div>
        <div class="cp-modal-body">

          <div class="cp-field">
            <label>Назва / Тема *</label>
            <input type="text" class="input" id="f-caption" placeholder="Про що цей пост?" />
            <span class="cp-error" id="e-caption"></span>
          </div>

          <div class="cp-field">
            <label>Текст / Опис</label>
            <textarea class="input" id="f-text" rows="4" placeholder="Текст поста, тези, хештеги..." style="resize:vertical"></textarea>
          </div>

          <div class="cp-form-row">
            <div class="cp-field">
              <label>Платформи * (можна декілька)</label>
              <div class="cp-plat-grid" id="f-platform-grid">
                ${PLATFORMS.map(p => `
                  <label class="cp-plat-pick" style="--pc:${p.color}">
                    <input type="checkbox" name="f-platform" value="${p.id}" />
                    <span class="cp-plat-pick-box">${p.label}</span>
                  </label>
                `).join('')}
              </div>
              <span class="cp-error" id="e-platform"></span>
            </div>
          </div>

          <div class="cp-field">
            <label>Обкладинка / фото</label>
            <div class="cp-cover-zone" id="cp-cover-zone">
              <input type="file" id="f-cover" accept="image/*" style="display:none" />
              <div id="cp-cover-preview" class="cp-cover-preview" style="display:none">
                <img id="cp-cover-img" />
                <button type="button" class="cp-cover-remove" id="cp-cover-remove">${icon('x', 12)}</button>
              </div>
              <button type="button" class="cp-cover-btn" id="cp-cover-btn">${icon('documents', 14)} Завантажити фото</button>
            </div>
          </div>

          <div class="cp-form-row">
            <div class="cp-field">
              <label>Тип контенту</label>
              <div class="cp-type-grid" id="f-type-grid">
                ${POST_TYPES.map((t, i) => `
                  <label class="cp-type-pick">
                    <input type="radio" name="f-type" value="${t.id}" ${i === 0 ? 'checked' : ''} />
                    <span class="cp-type-box">${t.label}</span>
                  </label>
                `).join('')}
              </div>
            </div>
            <div class="cp-field">
              <label>Статус</label>
              <select class="input" id="f-status">
                ${Object.entries(STATUSES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="cp-form-row">
            <div class="cp-field">
              <label>Дата публікації</label>
              <input type="date" class="input" id="f-date" />
            </div>
            <div class="cp-field">
              <label>Час</label>
              <input type="time" class="input" id="f-time" />
            </div>
          </div>

          <div class="cp-field">
            <label>Хештеги</label>
            <input type="text" class="input" id="f-hashtags" placeholder="#контент #smm #маркетинг" />
          </div>

          <div class="cp-field">
            <label>Посилання / CTA</label>
            <input type="text" class="input" id="f-link" placeholder="https://..." />
          </div>

        </div>
        <div class="cp-modal-foot">
          <button class="btn btn-secondary" id="cp-tg-publish" style="margin-right:auto;display:none">${icon('send', 14)} Опублікувати в Telegram зараз</button>
          <button class="btn btn-secondary" id="cp-modal-cancel">Скасувати</button>
          <button class="btn btn-primary"   id="cp-modal-save">Зберегти</button>
        </div>
      </div>
    </div>
  `

  let posts      = []
  let filtPlat   = 'all'
  let activeView = 'kanban'
  let calYear    = new Date().getFullYear()
  let calMonth   = new Date().getMonth()
  let editingId   = null
  let coverImage  = null   // { url, name } — обкладинка, що зберігається з постом
  const user      = getCurrentUser()
  const base      = getActivePathSegments(user.uid)

  // ── Load ─────────────────────────────────────────────────
  async function loadPosts() {
    try {
      const q    = query(collection(db, ...base, 'content-plan'), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      posts      = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      renderAll()
    } catch (err) {
      console.error(err)
    }
  }

  function filtered() {
    return filtPlat === 'all' ? posts : posts.filter(p => postPlatforms(p).includes(filtPlat))
  }

  function renderAll() {
    updateSub()
    if (activeView === 'kanban')   renderKanban()
    if (activeView === 'calendar') renderCalendar()
    if (activeView === 'list')     renderList()
  }

  function updateSub() {
    const total     = posts.length
    const published = posts.filter(p => p.status === 'published').length
    const planned   = posts.filter(p => p.date && p.status !== 'published' && p.status !== 'cancelled').length
    container.querySelector('#cp-sub').textContent =
      `${total} постів · ${published} опубліковано · ${planned} заплановано`
  }

  // ── Kanban ────────────────────────────────────────────────
  function renderKanban() {
    const el = container.querySelector('#cp-kanban')
    const list = filtered()

    el.innerHTML = Object.entries(STATUSES).map(([sid, smeta]) => {
      const cols = list.filter(p => (p.status || 'idea') === sid)
      return `
        <div class="cp-column">
          <div class="cp-col-head" style="--sc:${smeta.color}">
            <span class="cp-col-title">${smeta.label}</span>
            <span class="cp-col-count">${cols.length}</span>
          </div>
          <div class="cp-col-body" data-status="${sid}">
            ${cols.length === 0
              ? `<div class="cp-col-empty">Немає постів</div>`
              : cols.map(p => postCard(p)).join('')
            }
          </div>
        </div>
      `
    }).join('')

    bindCardEvents(el)
  }

  // ── Calendar ──────────────────────────────────────────────
  function renderCalendar() {
    const monthLabel = container.querySelector('#cal-month-label')
    monthLabel.textContent = `${MONTHS_UK[calMonth]} ${calYear}`

    const el = container.querySelector('#cp-calendar')
    const list = filtered()

    const firstDay = new Date(calYear, calMonth, 1).getDay() // 0=Sun
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
    // Adjust so week starts Monday
    const startOffset = (firstDay + 6) % 7

    let html = `<div class="cp-cal-grid">`
    // Day headers
    ;['Пн','Вт','Ср','Чт','Пт','Сб','Нд'].forEach(d => {
      html += `<div class="cp-cal-day-hdr">${d}</div>`
    })

    // Empty cells
    for (let i = 0; i < startOffset; i++) html += `<div class="cp-cal-cell cp-cal-cell-empty"></div>`

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
      const dayPosts = list.filter(p => p.date === dateStr)
      const isToday  = dateStr === todayStr()
      html += `
        <div class="cp-cal-cell ${isToday ? 'today' : ''}" data-date="${dateStr}">
          <div class="cp-cal-cell-num ${isToday ? 'today-num' : ''}">${day}</div>
          <div class="cp-cal-cell-posts">
            ${dayPosts.map(p => {
              const plat = PLATFORMS.find(x => x.id === postPlatforms(p)[0])
              return `<div class="cp-cal-post" style="background:${plat?.color || '#94A3B8'}22;border-color:${plat?.color || '#94A3B8'}55" data-id="${p.id}">
                <span class="cp-cal-post-text">${p.caption}</span>
              </div>`
            }).join('')}
            <button class="cp-cal-add-btn" data-date="${dateStr}" title="Додати">+</button>
          </div>
        </div>
      `
    }

    html += `</div>`
    el.innerHTML = html

    // Post click → edit
    el.querySelectorAll('.cp-cal-post').forEach(card => {
      card.addEventListener('click', (e) => {
        e.stopPropagation()
        openModal(posts.find(p => p.id === card.dataset.id))
      })
    })

    // Add btn
    el.querySelectorAll('.cp-cal-add-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        openModal(null, btn.dataset.date)
      })
    })
  }

  // ── List view ─────────────────────────────────────────────
  function renderList() {
    const el  = container.querySelector('#cp-list')
    const list = filtered().slice().sort((a, b) => (a.date || '9999') < (b.date || '9999') ? -1 : 1)

    if (list.length === 0) {
      el.innerHTML = `<div class="cp-empty"><div class="cp-empty-icon">${icon('content-plan', 48)}</div><div class="cp-empty-title">Постів ще немає</div><div class="cp-empty-desc">Натисніть "+ Новий пост" щоб додати перший</div></div>`
      return
    }

    el.innerHTML = `<div class="cp-list-grid">${list.map(p => {
      const plats  = postPlatforms(p).map(id => PLATFORMS.find(x => x.id === id)).filter(Boolean)
      const plat   = plats[0]
      const type   = POST_TYPES.find(x => x.id === p.type)
      const status = STATUSES[p.status || 'idea']
      return `
        <div class="cp-list-row" data-id="${p.id}">
          ${p.coverImage?.url
            ? `<img class="cp-list-cover" src="${p.coverImage.url}" />`
            : `<div class="cp-list-plat" style="background:${plat?.color || '#94A3B8'}22;border-color:${plat?.color || '#94A3B8'}44; color:${plat?.color || '#94A3B8'}">${icon('accounts', 18)}</div>`
          }
          <div class="cp-list-body">
            <div class="cp-list-caption">${p.caption}</div>
            ${p.text ? `<div class="cp-list-text">${p.text.slice(0, 100)}${p.text.length > 100 ? '…' : ''}</div>` : ''}
            <div class="cp-list-plats">${plats.map(pl => `<span class="cp-mini-plat" style="color:${pl.color}">${pl.label}</span>`).join('')}</div>
          </div>
          <div class="cp-list-meta">
            ${p.date ? `<span class="cp-list-date">${formatDate(p.date)}${p.time ? ' ' + p.time : ''}</span>` : ''}
            <span class="cp-list-type">${type?.label || ''}</span>
          </div>
          <div class="cp-list-status" style="color:${status.color};background:${status.bg}">${status.label}</div>
          ${p.telegramPublishedAt ? `<span class="cp-tg-done" title="Опубліковано в Telegram">${icon('send', 12)}</span>` : ''}
          <div class="cp-list-actions">
            <button class="cp-list-btn edit-btn" data-id="${p.id}">${icon('pencil', 13)}</button>
            <button class="cp-list-btn delete-btn" data-id="${p.id}">${icon('trash', 13)}</button>
          </div>
        </div>
      `
    }).join('')}</div>`

    el.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', () => openModal(posts.find(p => p.id === btn.dataset.id)))
    })
    el.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        if (!confirm('Видалити пост?')) return
        await deleteDoc(doc(db, ...base, 'content-plan', btn.dataset.id))
        await loadPosts()
      })
    })
  }

  // ── Post card (kanban) ────────────────────────────────────
  function postCard(p) {
    const plats  = postPlatforms(p).map(id => PLATFORMS.find(x => x.id === id)).filter(Boolean)
    const type   = POST_TYPES.find(x => x.id === p.type)
    return `
      <div class="cp-card" data-id="${p.id}">
        ${p.coverImage?.url ? `<img class="cp-card-cover" src="${p.coverImage.url}" />` : ''}
        <div class="cp-card-head">
          <div class="cp-card-plats">
            ${plats.length ? plats.map(plat => `
              <span class="cp-card-plat" style="background:${plat.color}22;border-color:${plat.color}55;color:${plat.color}">${plat.label}</span>
            `).join('') : `<span class="cp-card-plat">Інше</span>`}
          </div>
          <div class="cp-card-actions">
            <button class="cp-card-btn edit-btn" data-id="${p.id}">${icon('pencil', 12)}</button>
            <button class="cp-card-btn delete-btn" data-id="${p.id}">${icon('trash', 12)}</button>
          </div>
        </div>
        <div class="cp-card-caption">${p.caption}</div>
        ${p.text ? `<div class="cp-card-text">${p.text.slice(0, 120)}${p.text.length > 120 ? '…' : ''}</div>` : ''}
        <div class="cp-card-foot">
          ${type ? `<span class="cp-card-type">${type.label}</span>` : ''}
          ${p.date ? `<span class="cp-card-date">${formatDate(p.date)}${p.time ? ' · ' + p.time : ''}</span>` : ''}
          ${p.telegramPublishedAt ? `<span class="cp-tg-done" title="Опубліковано в Telegram">${icon('send', 11)} TG</span>` : ''}
          ${p.hashtags ? `<div class="cp-card-tags">${p.hashtags.split(' ').slice(0,3).map(h => `<span class="cp-tag">${h}</span>`).join('')}</div>` : ''}
        </div>
      </div>
    `
  }

  function bindCardEvents(el) {
    el.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        openModal(posts.find(p => p.id === btn.dataset.id))
      })
    })
    el.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        if (!confirm('Видалити пост?')) return
        await deleteDoc(doc(db, ...base, 'content-plan', btn.dataset.id))
        await loadPosts()
      })
    })
    // Quick status change on column drop (click status header)
    el.querySelectorAll('.cp-col-head').forEach(head => {
      head.addEventListener('click', () => {})
    })
  }

  // ── View toggle ───────────────────────────────────────────
  container.querySelectorAll('.cp-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.cp-view-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      activeView = btn.dataset.view
      container.querySelector('#cp-kanban-view').style.display  = activeView === 'kanban'   ? 'block' : 'none'
      container.querySelector('#cp-calendar-view').style.display = activeView === 'calendar' ? 'block' : 'none'
      container.querySelector('#cp-list-view').style.display    = activeView === 'list'     ? 'block' : 'none'
      renderAll()
    })
  })

  // ── Platform filter ───────────────────────────────────────
  container.querySelector('#cp-platforms').addEventListener('click', e => {
    const btn = e.target.closest('.cp-plat-btn')
    if (!btn) return
    container.querySelectorAll('.cp-plat-btn').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    filtPlat = btn.dataset.plat
    renderAll()
  })

  // ── Calendar nav ──────────────────────────────────────────
  container.querySelector('#cal-prev').addEventListener('click', () => {
    calMonth--
    if (calMonth < 0) { calMonth = 11; calYear-- }
    renderCalendar()
  })
  container.querySelector('#cal-next').addEventListener('click', () => {
    calMonth++
    if (calMonth > 11) { calMonth = 0; calYear++ }
    renderCalendar()
  })

  // ── Modal ─────────────────────────────────────────────────
  function openModal(post = null, prefillDate = null) {
    editingId = post?.id || null
    container.querySelector('#cp-modal-title').textContent = post ? 'Редагувати пост' : 'Новий пост'

    container.querySelector('#f-caption').value    = post?.caption   || ''
    container.querySelector('#f-text').value       = post?.text      || ''
    container.querySelector('#f-status').value     = post?.status    || 'idea'
    container.querySelector('#f-date').value       = post?.date      || prefillDate || ''
    container.querySelector('#f-time').value       = post?.time      || ''
    container.querySelector('#f-hashtags').value   = post?.hashtags  || ''
    container.querySelector('#f-link').value       = post?.link      || ''

    // Platform checkboxes
    const platVals = postPlatforms(post || {})
    container.querySelectorAll('input[name="f-platform"]').forEach(r => {
      r.checked = platVals.includes(r.value)
    })

    // Type radio
    const typeVal = post?.type || 'post'
    container.querySelectorAll('input[name="f-type"]').forEach(r => {
      r.checked = r.value === typeVal
    })

    // Cover image
    coverImage = post?.coverImage || null
    renderCoverPreview()

    // Manual "publish now" button — only when telegram selected and not already published
    const tgBtn = container.querySelector('#cp-tg-publish')
    tgBtn.style.display = (post && platVals.includes('telegram') && !post.telegramPublishedAt) ? '' : 'none'

    container.querySelector('#e-caption').textContent  = ''
    container.querySelector('#e-platform').textContent = ''
    container.querySelector('#cp-modal').style.display = 'flex'
    setTimeout(() => container.querySelector('#f-caption').focus(), 80)
  }

  function closeModal() {
    container.querySelector('#cp-modal').style.display = 'none'
    editingId  = null
    coverImage = null
  }

  function renderCoverPreview() {
    const preview = container.querySelector('#cp-cover-preview')
    const img     = container.querySelector('#cp-cover-img')
    const btn     = container.querySelector('#cp-cover-btn')
    if (coverImage?.url) {
      img.src = coverImage.url
      preview.style.display = 'block'
      btn.style.display = 'none'
    } else {
      preview.style.display = 'none'
      btn.style.display = ''
    }
  }

  container.querySelector('#cp-cover-btn').addEventListener('click', () => container.querySelector('#f-cover').click())
  container.querySelector('#cp-cover-remove').addEventListener('click', () => { coverImage = null; renderCoverPreview() })
  container.querySelector('#f-cover').addEventListener('change', async e => {
    const file = e.target.files[0]
    if (!file) return
    const btn = container.querySelector('#cp-cover-btn')
    const prevLabel = btn.innerHTML
    btn.innerHTML = '<div class="btn-spinner"></div> Завантаження...'
    try {
      coverImage = await uploadToCloudinary(file)
      renderCoverPreview()
    } catch (err) {
      alert('Помилка завантаження фото: ' + err.message)
    } finally {
      btn.innerHTML = prevLabel
      e.target.value = ''
    }
  })

  container.querySelector('#cp-add-btn').addEventListener('click', () => openModal())
  container.querySelector('#cp-modal-close').addEventListener('click', closeModal)
  container.querySelector('#cp-modal-cancel').addEventListener('click', closeModal)
  container.querySelector('#cp-modal').addEventListener('click', e => {
    if (e.target === container.querySelector('#cp-modal')) closeModal()
  })

  // ── Save ──────────────────────────────────────────────────
  container.querySelector('#cp-modal-save').addEventListener('click', async () => {
    const caption   = container.querySelector('#f-caption').value.trim()
    const platforms = [...container.querySelectorAll('input[name="f-platform"]:checked')].map(r => r.value)
    let ok = true
    if (!caption)         { container.querySelector('#e-caption').textContent  = 'Введіть назву'; ok = false }
    if (!platforms.length) { container.querySelector('#e-platform').textContent = 'Оберіть хоча б одну платформу'; ok = false }
    if (!ok) return

    const btn = container.querySelector('#cp-modal-save')
    btn.disabled = true

    const data = {
      caption,
      text:      container.querySelector('#f-text').value.trim()     || null,
      platforms,
      coverImage: coverImage || null,
      type:      container.querySelector('input[name="f-type"]:checked')?.value || 'post',
      status:    container.querySelector('#f-status').value,
      date:      container.querySelector('#f-date').value             || null,
      time:      container.querySelector('#f-time').value             || null,
      hashtags:  container.querySelector('#f-hashtags').value.trim() || null,
      link:      container.querySelector('#f-link').value.trim()     || null,
    }

    try {
      if (editingId) {
        await updateDoc(doc(db, ...base, 'content-plan', editingId), { ...data, updatedAt: serverTimestamp() })
      } else {
        await addDoc(collection(db, ...base, 'content-plan'), { ...data, createdAt: serverTimestamp() })
      }
      closeModal()
      await loadPosts()
    } catch (err) {
      console.error(err)
    } finally {
      btn.disabled = false
    }
  })

  // ── Telegram publishing ────────────────────────────────────
  async function getTelegramIntegration() {
    const snap = await getDocs(collection(db, ...base, 'integrations'))
    const tgDoc = snap.docs.find(d => d.data().intId === 'telegram')
    if (!tgDoc) return null
    const { botToken, channelId } = tgDoc.data()
    if (!botToken || !channelId) return null
    return { botToken, channelId }
  }

  async function publishToTelegram(post) {
    const cfg = await getTelegramIntegration()
    if (!cfg) throw new Error('Telegram не підключено — додайте Bot Token і Channel у "API та інтеграції"')

    const caption = [post.caption, post.text, post.hashtags].filter(Boolean).join('\n\n').slice(0, 1024)
    const url  = post.coverImage?.url
      ? `https://api.telegram.org/bot${cfg.botToken}/sendPhoto`
      : `https://api.telegram.org/bot${cfg.botToken}/sendMessage`
    const body = post.coverImage?.url
      ? { chat_id: cfg.channelId, photo: post.coverImage.url, caption }
      : { chat_id: cfg.channelId, text: caption || post.caption }

    const res  = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json()
    if (!data.ok) throw new Error(data.description || 'Не вдалось опублікувати в Telegram')

    await updateDoc(doc(db, ...base, 'content-plan', post.id), {
      telegramPublishedAt: serverTimestamp(),
      telegramMessageId: data.result?.message_id || null,
    })
  }

  container.querySelector('#cp-tg-publish').addEventListener('click', async () => {
    if (!editingId) return
    const post = posts.find(p => p.id === editingId)
    if (!post) return
    const btn = container.querySelector('#cp-tg-publish')
    btn.disabled = true
    btn.innerHTML = '<div class="btn-spinner"></div> Публікація...'
    try {
      await publishToTelegram({ ...post, coverImage })
      closeModal()
      await loadPosts()
    } catch (err) {
      alert(err.message)
      btn.disabled = false
      btn.innerHTML = `${icon('send', 14)} Опублікувати в Telegram зараз`
    }
  })

  // Автопостинг: щохвилини перевіряємо запланований час для постів з Telegram у платформах
  const scheduleInterval = setInterval(async () => {
    const now = new Date()
    const due = posts.filter(p => {
      if (p.telegramPublishedAt || !postPlatforms(p).includes('telegram')) return false
      if (!p.date) return false
      const dt = new Date(`${p.date}T${p.time || '00:00'}`)
      return dt <= now
    })
    for (const post of due) {
      try { await publishToTelegram(post) } catch (err) { console.error('Auto-publish failed:', err.message) }
    }
    if (due.length) await loadPosts()
  }, 60000)

  const observer = new MutationObserver(() => {
    if (!container.querySelector('.cp-page')) {
      clearInterval(scheduleInterval)
      observer.disconnect()
    }
  })
  observer.observe(container, { childList: true })

  await loadPosts()

  // ── Helpers ───────────────────────────────────────────────
  function todayStr() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }

  function formatDate(dateStr) {
    if (!dateStr) return ''
    const [y, m, d] = dateStr.split('-')
    return `${d}.${m}.${y}`
  }
}

// ── Styles ────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('cp-styles')) return
  const s = document.createElement('style')
  s.id = 'cp-styles'
  s.textContent = `
    .cp-page { padding: 28px 32px; max-width: 1400px; }

    /* Header */
    .cp-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:20px; gap:16px; flex-wrap:wrap; }
    .cp-title  { font-family:var(--font-display); font-size:26px; font-weight:800; margin-bottom:4px; }
    .cp-sub    { font-size:13px; color:var(--text-secondary); }
    .cp-header-actions { display:flex; gap:10px; align-items:center; }

    /* View toggle */
    .cp-view-toggle { display:flex; gap:2px; background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-md); padding:3px; }
    .cp-view-btn { width:32px; height:32px; border-radius:6px; font-size:15px; color:var(--text-muted); cursor:pointer; background:none; border:none; transition:all .15s; display:flex; align-items:center; justify-content:center; }
    .cp-view-btn:hover  { background:var(--bg-tertiary); color:var(--text); }
    .cp-view-btn.active { background:var(--accent-blue); color:#fff; }

    /* Platform filter */
    .cp-platforms { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:22px; }
    .cp-plat-btn {
      padding:6px 14px; border-radius:var(--radius-full);
      font-size:12px; font-weight:700; cursor:pointer;
      background:var(--bg-secondary); border:1.5px solid var(--border);
      color:var(--text-secondary); transition:all .15s;
    }
    .cp-plat-btn:hover   { border-color:var(--pc, var(--accent-blue)); color:var(--text); }
    .cp-plat-btn.active  { background:color-mix(in srgb, var(--pc, var(--accent-blue)) 15%, transparent); border-color:var(--pc, var(--accent-blue)); color:var(--pc, var(--accent-blue)); }

    /* ── KANBAN ── */
    .cp-kanban { display:grid; grid-template-columns:repeat(5, 1fr); gap:12px; align-items:start; }
    @media (max-width:1200px) { .cp-kanban { grid-template-columns: repeat(3,1fr); } }
    @media (max-width:800px)  { .cp-kanban { grid-template-columns: repeat(2,1fr); } }

    .cp-column { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-xl); overflow:hidden; }
    .cp-col-head {
      display:flex; align-items:center; justify-content:space-between;
      padding:12px 14px; border-bottom:2px solid var(--sc, var(--border));
      background:color-mix(in srgb, var(--sc) 8%, transparent);
    }
    .cp-col-title { font-size:13px; font-weight:800; color:var(--sc); text-transform:uppercase; letter-spacing:.04em; }
    .cp-col-count { font-size:12px; font-weight:700; color:var(--sc); background:color-mix(in srgb, var(--sc) 15%, transparent); padding:2px 8px; border-radius:var(--radius-full); }
    .cp-col-body  { padding:10px; display:flex; flex-direction:column; gap:8px; min-height:80px; }
    .cp-col-empty { font-size:12px; color:var(--text-muted); text-align:center; padding:16px 8px; }

    /* Post card */
    .cp-card {
      background:var(--bg-tertiary); border:1px solid var(--border);
      border-radius:var(--radius-lg); padding:12px; cursor:default;
      transition:all .18s; display:flex; flex-direction:column; gap:8px;
    }
    .cp-card:hover { border-color:rgba(255,255,255,.14); transform:translateY(-1px); box-shadow:var(--shadow-sm); }

    .cp-card-head    { display:flex; align-items:center; justify-content:space-between; gap:8px; }
    .cp-card-plats   { display:flex; flex-wrap:wrap; gap:4px; }
    .cp-card-plat    { display:flex; align-items:center; gap:5px; font-size:11px; font-weight:700; padding:3px 8px; border-radius:var(--radius-full); border:1px solid; }
    .cp-card-cover   { width:100%; height:120px; object-fit:cover; border-radius:var(--radius-md); margin-bottom:2px; }
    .cp-tg-done      { display:inline-flex; align-items:center; gap:3px; font-size:10px; font-weight:700; color:#34D399; }
    .cp-card-actions { display:flex; gap:3px; opacity:0; transition:opacity .15s; }
    .cp-card:hover .cp-card-actions { opacity:1; }
    .cp-card-btn     { width:24px; height:24px; border-radius:5px; font-size:12px; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:background .15s; }
    .cp-card-btn:hover { background:rgba(255,255,255,.1); }

    .cp-card-caption { font-size:13px; font-weight:700; line-height:1.35; }
    .cp-card-text    { font-size:12px; color:var(--text-secondary); line-height:1.5; }
    .cp-card-foot    { display:flex; flex-direction:column; gap:4px; }
    .cp-card-type    { font-size:11px; color:var(--text-muted); }
    .cp-card-date    { font-size:11px; color:var(--text-muted); }
    .cp-card-tags    { display:flex; gap:4px; flex-wrap:wrap; }
    .cp-tag          { font-size:10px; background:rgba(79,142,247,.12); color:var(--accent-blue); border-radius:var(--radius-full); padding:1px 7px; }

    /* ── CALENDAR ── */
    .cp-cal-nav {
      display:flex; align-items:center; justify-content:center; gap:16px;
      margin-bottom:16px;
    }
    .cp-cal-arrow { width:36px; height:36px; border-radius:10px; background:var(--bg-secondary); border:1px solid var(--border); font-size:16px; cursor:pointer; transition:all .15s; display:flex; align-items:center; justify-content:center; }
    .cp-cal-arrow:hover { background:var(--accent-blue); color:#fff; border-color:var(--accent-blue); }
    .cp-cal-month { font-family:var(--font-display); font-size:20px; font-weight:800; min-width:200px; text-align:center; }

    .cp-cal-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:6px; }
    .cp-cal-day-hdr { text-align:center; font-size:12px; font-weight:700; color:var(--text-muted); padding:8px 0; text-transform:uppercase; letter-spacing:.04em; }

    .cp-cal-cell {
      background:var(--bg-secondary); border:1px solid var(--border);
      border-radius:var(--radius-lg); min-height:100px; padding:8px;
      transition:border-color .15s; position:relative;
    }
    .cp-cal-cell:hover { border-color:rgba(255,255,255,.14); }
    .cp-cal-cell-empty { background:transparent; border:1px solid transparent; }
    .cp-cal-cell.today { border-color:var(--accent-blue); background:rgba(79,142,247,.04); }
    .cp-cal-cell-num   { font-size:13px; font-weight:700; margin-bottom:6px; color:var(--text-secondary); }
    .cp-cal-cell.today .today-num { color:var(--accent-blue); }
    .cp-cal-cell-posts { display:flex; flex-direction:column; gap:3px; }

    .cp-cal-post {
      display:flex; align-items:center; gap:4px; padding:2px 6px;
      border-radius:5px; border:1px solid; font-size:11px;
      cursor:pointer; transition:opacity .15s;
    }
    .cp-cal-post:hover { opacity:.8; }
    .cp-cal-post-text { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:500; }
    .cp-cal-add-btn {
      margin-top:4px; width:20px; height:20px; border-radius:5px;
      background:none; border:1px dashed var(--border); color:var(--text-muted);
      font-size:14px; cursor:pointer; opacity:0; transition:opacity .15s;
      display:flex; align-items:center; justify-content:center;
    }
    .cp-cal-cell:hover .cp-cal-add-btn { opacity:1; }
    .cp-cal-add-btn:hover { border-color:var(--accent-blue); color:var(--accent-blue); }

    /* ── LIST ── */
    .cp-list-grid { display:flex; flex-direction:column; gap:8px; }
    .cp-list-row  {
      display:flex; align-items:center; gap:14px;
      background:var(--bg-secondary); border:1px solid var(--border);
      border-radius:var(--radius-lg); padding:14px 18px; transition:all .2s;
    }
    .cp-list-row:hover { border-color:rgba(255,255,255,.12); transform:translateX(2px); }
    .cp-list-plat  { width:40px; height:40px; border-radius:10px; display:flex; align-items:center; justify-content:center; border:1px solid; flex-shrink:0; }
    .cp-list-cover { width:40px; height:40px; border-radius:10px; object-fit:cover; flex-shrink:0; }
    .cp-list-body  { flex:1; min-width:0; }
    .cp-list-caption { font-weight:700; font-size:14px; margin-bottom:2px; }
    .cp-list-text    { font-size:12px; color:var(--text-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .cp-list-plats   { display:flex; gap:6px; margin-top:3px; }
    .cp-mini-plat    { font-size:10px; font-weight:700; }
    .cp-tg-done      { color:#34D399; flex-shrink:0; }
    .cp-list-meta  { display:flex; flex-direction:column; gap:3px; flex-shrink:0; }
    .cp-list-date  { font-size:12px; color:var(--text-secondary); }
    .cp-list-type  { font-size:11px; color:var(--text-muted); }
    .cp-list-status { font-size:11px; font-weight:700; padding:4px 10px; border-radius:var(--radius-full); flex-shrink:0; }
    .cp-list-actions { display:flex; gap:5px; opacity:0; transition:opacity .15s; }
    .cp-list-row:hover .cp-list-actions { opacity:1; }
    .cp-list-btn { width:30px; height:30px; border-radius:7px; font-size:13px; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:background .15s; }
    .cp-list-btn:hover { background:var(--bg-tertiary); }

    /* Empty */
    .cp-empty       { text-align:center; padding:80px 24px; }
    .cp-empty-icon  { display:flex; align-items:center; justify-content:center; margin-bottom:16px; color:var(--text-muted); }
    .cp-empty-title { font-family:var(--font-display); font-size:20px; font-weight:700; margin-bottom:8px; }
    .cp-empty-desc  { font-size:14px; color:var(--text-muted); }
    .cp-loading     { display:flex; justify-content:center; padding:60px; }

    /* ── MODAL ── */
    .cp-overlay {
      position:fixed; inset:0; background:rgba(0,0,0,.65); backdrop-filter:blur(6px);
      display:flex; align-items:center; justify-content:center; z-index:1000; padding:24px;
    }
    .cp-modal {
      background:var(--bg-secondary); border:1px solid var(--border);
      border-radius:var(--radius-xl); width:100%; max-width:620px;
      max-height:90vh; display:flex; flex-direction:column;
      box-shadow:var(--shadow-xl); animation:cpIn .2s cubic-bezier(.34,1.2,.64,1);
    }
    @keyframes cpIn { from{opacity:0;transform:scale(.94)} to{opacity:1;transform:scale(1)} }
    .cp-modal-head { display:flex; align-items:center; justify-content:space-between; padding:22px 24px 0; flex-shrink:0; }
    .cp-modal-head h2 { font-family:var(--font-display); font-size:20px; font-weight:800; }
    .cp-modal-close { background:none; border:none; font-size:16px; color:var(--text-muted); cursor:pointer; width:32px; height:32px; border-radius:8px; transition:all .15s; display:flex; align-items:center; justify-content:center; }
    .cp-modal-close:hover { background:rgba(239,68,68,.12); color:#F87171; }
    .cp-modal-body  { padding:20px 24px; overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:14px; }
    .cp-modal-foot  { display:flex; gap:10px; justify-content:flex-end; padding:14px 24px 20px; border-top:1px solid var(--border); flex-shrink:0; }

    .cp-field label { display:block; font-size:12px; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:.05em; margin-bottom:7px; }
    .cp-error       { font-size:12px; color:#EF4444; margin-top:4px; display:block; }
    .cp-form-row    { display:grid; grid-template-columns:1fr 1fr; gap:14px; }

    /* Platform picker in modal */
    .cp-plat-grid { display:flex; flex-wrap:wrap; gap:6px; }
    .cp-plat-pick input { display:none; }
    .cp-plat-pick-box {
      display:flex; align-items:center; gap:5px; padding:6px 12px;
      border-radius:var(--radius-full); border:1.5px solid var(--border);
      font-size:12px; font-weight:600; cursor:pointer; transition:all .15s;
      background:var(--bg-tertiary); color:var(--text-secondary);
    }
    .cp-plat-pick input:checked + .cp-plat-pick-box {
      border-color:var(--pc); background:color-mix(in srgb, var(--pc) 15%, transparent);
      color:var(--pc);
    }

    /* Cover image */
    .cp-cover-zone   { display:flex; }
    .cp-cover-btn    { display:flex; align-items:center; gap:6px; padding:9px 16px; border-radius:var(--radius-md); border:1.5px dashed var(--border); background:var(--bg-tertiary); color:var(--text-secondary); font-size:12px; font-weight:600; cursor:pointer; }
    .cp-cover-btn:hover { border-color:var(--accent-blue); color:var(--text-primary); }
    .cp-cover-preview { position:relative; display:inline-block; }
    .cp-cover-preview img { max-width:220px; max-height:140px; border-radius:var(--radius-md); display:block; }
    .cp-cover-remove { position:absolute; top:-8px; right:-8px; width:22px; height:22px; border-radius:50%; background:#EF4444; color:#fff; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; }

    /* Type picker */
    .cp-type-grid { display:flex; flex-wrap:wrap; gap:6px; }
    .cp-type-pick input { display:none; }
    .cp-type-box {
      display:flex; align-items:center; gap:5px; padding:6px 12px;
      border-radius:var(--radius-full); border:1.5px solid var(--border);
      font-size:12px; font-weight:600; cursor:pointer; transition:all .15s;
      background:var(--bg-tertiary); color:var(--text-secondary);
    }
    .cp-type-pick input:checked + .cp-type-box {
      border-color:var(--accent-blue); background:rgba(79,142,247,.12); color:var(--accent-blue);
    }
  `
  document.head.appendChild(s)
}
