// src/renderer/modules/support/index.js
import { db } from '../../services/firebase.js'
import { getCurrentUser, getUserProfile } from '../../services/auth.js'
import { uploadToCloudinary } from '../../services/cloudinary.js'
import { sendTicketNotification } from '../../services/telegram-notifications.js'
import { icon } from '../../utils/icons.js'
import { t } from '../../core/i18n.js'
import {
  collection, query, where, orderBy, getDocs, addDoc,
  updateDoc, doc, serverTimestamp, arrayUnion, limit, writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

const TICKET_COOLDOWN_MS = 60 * 1000 // 1 заявка на хвилину — захист від спаму

const TYPE_META = {
  bug:     { iconName: 'x-circle',       label: 'Bug',                                               color: '#F87171', bg: 'rgba(248,113,113,.12)' },
  feature: { iconName: 'idea',           get label() { return t('support.type.idea') },              color: '#A78BFA', bg: 'rgba(167,139,250,.12)' },
  support: { iconName: 'message-circle', get label() { return t('module.support') },                 color: '#4F8EF7', bg: 'rgba(79,142,247,.12)' },
}
const PRIORITY_META = {
  low:      { get label() { return t('support.pri.low') },      color: '#94A3B8' },
  medium:   { get label() { return t('support.pri.medium') },   color: '#FBBF24' },
  high:     { get label() { return t('support.pri.high') },     color: '#FB923C' },
  critical: { get label() { return t('support.pri.critical') }, color: '#F87171' },
}
const STATUS_META = {
  new:         { iconName: 'plus',         get label() { return t('support.st.new') },         color: '#94A3B8' },
  open:        { iconName: 'info',         get label() { return t('support.st.open') },        color: '#4F8EF7' },
  in_progress: { iconName: 'refresh',      get label() { return t('support.st.in_progress') }, color: '#FBBF24' },
  resolved:    { iconName: 'check-circle', get label() { return t('support.st.resolved') },    color: '#34D399' },
  closed:      { iconName: 'lock',         get label() { return t('support.st.closed') },      color: '#475569' },
}

export async function render(container) {
  injectStyles()
  const user    = getCurrentUser()
  const profile = await getUserProfile(user.uid)

  let tickets       = []
  let announcements = []
  let activeTab     = 'tickets'
  let typeFilter    = 'all'

  // ── Initial render ────────────────────────────────────────
  container.innerHTML = buildShell()
  bindTabSwitch()
  await loadAll()
  renderTicketList()
  renderNews()

  // ── Shell HTML ────────────────────────────────────────────
  function buildShell() {
    return `
      <div class="sup-layout">

        <!-- ══ LEFT PANEL ══ -->
        <div class="sup-left">
          <div class="sup-left-head">
            <div>
              <h2 class="sup-title">${icon('support', 18)} ${t('support.title')}</h2>
              <p class="sup-subtitle">${t('support.subtitle')}</p>
            </div>
            <button class="sup-btn-primary" id="sup-new-btn">${t('support.new_ticket')}</button>
          </div>

          <div class="sup-tabs">
            <button class="sup-tab active" data-tab="tickets" style="display:inline-flex;align-items:center;gap:5px">${icon('ticket', 12)} ${t('support.tickets')}</button>
            <button class="sup-tab" data-tab="news" style="display:inline-flex;align-items:center;gap:5px">${icon('newspaper', 12)} ${t('support.news')}</button>
          </div>

          <div class="sup-type-pills" id="sup-type-pills">
            <button class="sup-type-pill active" data-type="all">${t('common.all')}</button>
            <button class="sup-type-pill" data-type="bug" style="display:inline-flex;align-items:center;gap:4px">${icon('x-circle', 11)} Bug</button>
            <button class="sup-type-pill" data-type="feature" style="display:inline-flex;align-items:center;gap:4px">${icon('idea', 11)} ${t('support.type.idea')}</button>
            <button class="sup-type-pill" data-type="support" style="display:inline-flex;align-items:center;gap:4px">${icon('message-circle', 11)} ${t('module.support')}</button>
          </div>

          <div id="sup-tickets-panel" class="sup-panel">
            <div class="sup-loading"></div>
          </div>
          <div id="sup-news-panel" class="sup-panel" style="display:none">
            <div class="sup-loading"></div>
          </div>
        </div>

        <!-- ══ RIGHT PANEL ══ -->
        <div class="sup-right" id="sup-right">
          <div class="sup-right-empty">
            <div style="color:var(--text-muted);opacity:.25;margin-bottom:14px">${icon('support', 52)}</div>
            <div style="font-size:15px;font-weight:700;margin-bottom:6px">Виберіть заявку</div>
            <div style="font-size:13px;color:var(--text-muted)">або створіть нову</div>
          </div>
        </div>

      </div>
    `
  }

  // ── Tab switch ────────────────────────────────────────────
  function bindTabSwitch() {
    container.querySelector('.sup-tabs').addEventListener('click', e => {
      const btn = e.target.closest('.sup-tab')
      if (!btn) return
      activeTab = btn.dataset.tab
      container.querySelectorAll('.sup-tab').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      container.querySelector('#sup-tickets-panel').style.display = activeTab === 'tickets' ? '' : 'none'
      container.querySelector('#sup-news-panel').style.display    = activeTab === 'news'    ? '' : 'none'
      container.querySelector('#sup-type-pills').style.visibility = activeTab === 'tickets' ? '' : 'hidden'
      container.querySelector('#sup-new-btn').style.display = activeTab === 'tickets' ? '' : 'none'
    })

    container.querySelector('#sup-type-pills').addEventListener('click', e => {
      const btn = e.target.closest('.sup-type-pill')
      if (!btn) return
      typeFilter = btn.dataset.type
      container.querySelectorAll('.sup-type-pill').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      renderTicketList()
    })

    container.querySelector('#sup-new-btn').addEventListener('click', openNewTicketModal)
  }

  // ── Load data ─────────────────────────────────────────────
  async function loadAll() {
    const [t, a] = await Promise.all([loadTickets(), loadAnnouncements()])
    tickets       = t
    announcements = a
  }

  async function loadTickets() {
    try {
      const snap = await getDocs(query(
        collection(db, 'tickets'),
        where('userId', '==', user.uid),
        limit(100),
      ))
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      return docs.sort((a, b) => {
        const ta = a.createdAt?.toDate?.() || new Date(a.createdAt || 0)
        const tb = b.createdAt?.toDate?.() || new Date(b.createdAt || 0)
        return tb - ta
      })
    } catch (err) {
      console.error('loadTickets:', err)
      return []
    }
  }

  async function loadAnnouncements() {
    try {
      const snap = await getDocs(query(
        collection(db, 'announcements'),
        orderBy('createdAt', 'desc'),
        limit(30),
      ))
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch { return [] }
  }

  // ── Render ticket list ────────────────────────────────────
  function renderTicketList() {
    const panel = container.querySelector('#sup-tickets-panel')
    let list = typeFilter === 'all' ? tickets : tickets.filter(t => t.type === typeFilter)

    if (!list.length) {
      panel.innerHTML = `
        <div class="sup-empty">
          <div style="display:flex;align-items:center;justify-content:center;margin-bottom:12px;color:var(--text-muted)">${icon(typeFilter === 'all' ? 'ticket' : (TYPE_META[typeFilter]?.iconName || 'ticket'), 48)}</div>
          <div style="font-size:16px;font-weight:700;margin-bottom:6px">Заявок ще немає</div>
          <div style="font-size:13px;color:var(--text-muted)">Натисніть "+ Нова заявка" щоб створити першу</div>
        </div>`
      return
    }

    panel.innerHTML = `<div class="sup-ticket-list">${list.map(t => ticketCard(t)).join('')}</div>`
    panel.querySelectorAll('.sup-ticket-card').forEach(card => {
      card.addEventListener('click', () => openTicketDetail(card.dataset.id))
    })
  }

  function ticketCard(t) {
    const tm  = TYPE_META[t.type]     || TYPE_META.support
    const sm  = STATUS_META[t.status] || STATUS_META.new
    const pm  = PRIORITY_META[t.priority] || PRIORITY_META.medium
    const date = t.createdAt?.toDate?.()?.toLocaleDateString('uk-UA') || '—'
    const repliesCount = t.replies?.length || 0
    const hasNewReply  = t.replies?.some(r => r.fromAdmin) && t.status !== 'closed'

    return `
      <div class="sup-ticket-card ${hasNewReply ? 'sup-ticket-card--new-reply' : ''}" data-id="${t.id}">
        <div class="sup-ticket-type-badge" style="background:${tm.bg};color:${tm.color};display:inline-flex;align-items:center;gap:4px">${icon(tm.iconName, 11)} ${tm.label}</div>
        <div class="sup-ticket-main">
          <div class="sup-ticket-title">${esc(t.title)}</div>
          <div class="sup-ticket-meta">
            <span class="sup-status-chip" style="color:${sm.color};display:inline-flex;align-items:center;gap:3px">${icon(sm.iconName, 11)} ${sm.label}</span>
            <span class="sup-priority-chip" style="color:${pm.color}">● ${pm.label}</span>
            <span style="color:var(--text-muted);font-size:11px">${date}</span>
          </div>
        </div>
        <div class="sup-ticket-right">
          ${repliesCount > 0 ? `<div class="sup-reply-count ${hasNewReply ? 'sup-reply-count--new' : ''}" style="display:inline-flex;align-items:center;gap:3px">${icon('message-circle', 11)} ${repliesCount}</div>` : ''}
          <div class="sup-ticket-arrow">›</div>
        </div>
      </div>`
  }

  // ── Ticket detail (inline right panel) ───────────────────
  function showRightEmpty() {
    const rp = container.querySelector('#sup-right')
    rp.innerHTML = `
      <div class="sup-right-empty">
        <div style="color:var(--text-muted);opacity:.25;margin-bottom:14px">${icon('support', 52)}</div>
        <div style="font-size:15px;font-weight:700;margin-bottom:6px">Виберіть заявку</div>
        <div style="font-size:13px;color:var(--text-muted)">або створіть нову</div>
      </div>`
  }

  function openTicketDetail(ticketId) {
    const t = tickets.find(t => t.id === ticketId)
    if (!t) return

    container.querySelectorAll('.sup-ticket-card').forEach(c =>
      c.classList.toggle('active', c.dataset.id === ticketId))

    const rp     = container.querySelector('#sup-right')
    const tm     = TYPE_META[t.type]       || TYPE_META.support
    const sm     = STATUS_META[t.status]   || STATUS_META.new
    const pm     = PRIORITY_META[t.priority] || PRIORITY_META.medium
    const date   = t.createdAt?.toDate?.()?.toLocaleString('uk-UA') || '—'
    const isClosed = t.status === 'closed' || t.status === 'resolved'

    rp.innerHTML = `
      <div class="sup-detail">
        <div class="sup-detail-head">
          <div class="sup-detail-head-top">
            <span class="sup-ticket-type-badge" style="background:${tm.bg};color:${tm.color};display:inline-flex;align-items:center;gap:4px">${icon(tm.iconName, 11)} ${tm.label}</span>
            <button class="sup-detail-close" id="sup-dclose">${icon('x', 14)}</button>
          </div>
          <h2 class="sup-detail-title">${esc(t.title)}</h2>
          <div class="sup-modal-meta">
            <span class="sup-status-chip" style="color:${sm.color};display:inline-flex;align-items:center;gap:3px">${icon(sm.iconName, 11)} ${sm.label}</span>
            <span class="sup-priority-chip" style="color:${pm.color}">● ${pm.label}</span>
            <span style="color:var(--text-muted);font-size:12px">Створено: ${date}</span>
          </div>
        </div>

        <div class="sup-thread">
          <div class="sup-msg sup-msg--user">
            <div class="sup-msg-avatar sup-msg-avatar--user">${(profile?.name || user.email || 'U')[0].toUpperCase()}</div>
            <div class="sup-msg-body">
              <div class="sup-msg-author">${esc(profile?.name || user.email)} <span class="sup-msg-you">Ви</span></div>
              <div class="sup-msg-text">${esc(t.description)}</div>
              ${(t.attachments || []).length ? `
                <div class="sup-msg-attachments">
                  ${t.attachments.map(a => `<a href="${a.url}" target="_blank"><img src="${a.url}" class="sup-msg-attach-img"></a>`).join('')}
                </div>` : ''}
              <div class="sup-msg-time">${date}</div>
            </div>
          </div>

          ${(t.replies || []).map(r => `
            <div class="sup-msg ${r.fromAdmin ? 'sup-msg--admin' : 'sup-msg--user'}">
              <div class="sup-msg-avatar ${r.fromAdmin ? 'sup-msg-avatar--admin' : 'sup-msg-avatar--user'}">
                ${r.fromAdmin ? icon('shield', 14) : (profile?.name || 'U')[0].toUpperCase()}
              </div>
              <div class="sup-msg-body">
                <div class="sup-msg-author">
                  ${esc(r.authorName || (r.fromAdmin ? 'Адміністратор' : 'Ви'))}
                  ${r.fromAdmin ? '<span class="sup-msg-admin-badge">Адмін</span>' : '<span class="sup-msg-you">Ви</span>'}
                </div>
                <div class="sup-msg-text">${esc(r.text)}</div>
                ${(r.attachments || []).length ? `
                  <div class="sup-msg-attachments">
                    ${r.attachments.map(a => `<a href="${a.url}" target="_blank"><img src="${a.url}" class="sup-msg-attach-img"></a>`).join('')}
                  </div>` : ''}
                <div class="sup-msg-time">${r.createdAt?.toDate?.()?.toLocaleString('uk-UA') || '—'}</div>
              </div>
            </div>
          `).join('')}
        </div>

        ${!isClosed ? `
          <div class="sup-reply-form">
            <textarea class="sup-reply-input" id="sup-reply-text" placeholder="Написати відповідь… (Ctrl+V щоб вставити скріншот)" rows="3"></textarea>
            <div class="sup-attach-previews" id="sup-reply-previews"></div>
            <div class="sup-reply-actions">
              <input type="file" id="sup-reply-files" multiple accept="image/*" style="display:none">
              <button type="button" class="sup-btn-ghost" id="sup-reply-attach-btn" style="padding:7px 14px;margin-right:auto">${icon('image', 13)} Фото</button>
              <button class="sup-btn-close-ticket" id="sup-close-ticket-btn">Закрити заявку</button>
              <button class="sup-btn-primary" id="sup-send-reply">Надіслати</button>
            </div>
          </div>
        ` : `<div class="sup-closed-notice" style="display:flex;align-items:center;gap:6px">${icon('lock', 14)} Заявка закрита</div>`}
      </div>
    `

    rp.querySelector('#sup-dclose').addEventListener('click', () => {
      container.querySelectorAll('.sup-ticket-card').forEach(c => c.classList.remove('active'))
      showRightEmpty()
    })

    // ── Reply attachments ─────────────────────────────────
    let replyFiles = []
    function addReplyPreview(file) {
      const wrap = rp.querySelector('#sup-reply-previews')
      const item = document.createElement('div')
      item.className = 'sup-attach-item'
      item.dataset.filename = file.name
      const reader = new FileReader()
      reader.onload = e => {
        item.innerHTML = `
          <img src="${e.target.result}" class="sup-attach-img">
          <button type="button" class="sup-attach-remove" data-filename="${file.name}">${icon('x', 10)}</button>
        `
        item.querySelector('.sup-attach-remove').addEventListener('click', () => {
          replyFiles = replyFiles.filter(f => f.name !== file.name)
          item.remove()
        })
      }
      reader.readAsDataURL(file)
      wrap.appendChild(item)
    }
    rp.querySelector('#sup-reply-attach-btn')?.addEventListener('click', () => {
      rp.querySelector('#sup-reply-files').click()
    })
    rp.querySelector('#sup-reply-files')?.addEventListener('change', e => {
      Array.from(e.target.files).forEach(file => {
        if (replyFiles.some(f => f.name === file.name && f.size === file.size)) return
        replyFiles.push(file)
        addReplyPreview(file)
      })
      e.target.value = ''
    })
    rp.querySelector('#sup-reply-text')?.addEventListener('paste', e => {
      const items = Array.from(e.clipboardData?.items || [])
      const imgs  = items.filter(i => i.type.startsWith('image/')).map(i => i.getAsFile()).filter(Boolean)
      if (!imgs.length) return
      e.preventDefault()
      imgs.forEach((file, i) => {
        const named = new File([file], file.name || `screenshot_${Date.now()}_${i}.png`, { type: file.type })
        if (replyFiles.some(f => f.name === named.name && f.size === named.size)) return
        replyFiles.push(named)
        addReplyPreview(named)
      })
    })

    rp.querySelector('#sup-send-reply')?.addEventListener('click', async () => {
      const text = rp.querySelector('#sup-reply-text').value.trim()
      if (!text && !replyFiles.length) return
      const btn = rp.querySelector('#sup-send-reply')
      btn.disabled = true; btn.textContent = '...'
      try {
        const attachments = await Promise.all(replyFiles.map(file => uploadToCloudinary(file)))
        const reply = { text, attachments, fromAdmin: false, authorName: profile?.name || user.email, createdAt: new Date() }
        await updateDoc(doc(db, 'tickets', ticketId), {
          replies: arrayUnion(reply),
          status: t.status === 'new' ? 'open' : t.status,
          updatedAt: serverTimestamp(),
        })
        const idx = tickets.findIndex(t => t.id === ticketId)
        if (idx !== -1) {
          tickets[idx].replies = [...(tickets[idx].replies || []), reply]
          if (tickets[idx].status === 'new') tickets[idx].status = 'open'
        }
        renderTicketList()
        openTicketDetail(ticketId)
        showToast('Відповідь надіслано')
      } catch { btn.disabled = false; btn.textContent = 'Надіслати' }
    })

    rp.querySelector('#sup-close-ticket-btn')?.addEventListener('click', async () => {
      if (!confirm('Закрити цю заявку?')) return
      try {
        await updateDoc(doc(db, 'tickets', ticketId), { status: 'closed', updatedAt: serverTimestamp() })
        const idx = tickets.findIndex(t => t.id === ticketId)
        if (idx !== -1) tickets[idx].status = 'closed'
        renderTicketList()
        openTicketDetail(ticketId)
        showToast('Заявку закрито')
      } catch {}
    })
  }

  // ── New ticket modal ──────────────────────────────────────
  function openNewTicketModal() {
    const modal = document.createElement('div')
    modal.className = 'sup-overlay'
    modal.innerHTML = `
      <div class="sup-modal sup-modal--form">
        <div class="sup-modal-head">
          <h2 class="sup-modal-title" style="display:flex;align-items:center;gap:8px">${icon('ticket', 18)} Нова заявка</h2>
          <button class="sup-modal-close" id="sup-nclose">${icon('x', 14)}</button>
        </div>

        <div class="sup-form-body">
          <div class="sup-form-group">
            <label class="sup-form-label">Тип заявки</label>
            <div class="sup-type-selector" id="sup-type-sel">
              ${Object.entries(TYPE_META).map(([id, m]) => `
                <button class="sup-type-card ${id === 'bug' ? 'active' : ''}" data-type="${id}" style="--tc:${m.color}">
                  <span class="sup-type-card-icon">${icon(m.iconName, 18)}</span>
                  <span class="sup-type-card-label">${m.label}</span>
                </button>
              `).join('')}
            </div>
          </div>

          <div class="sup-form-group">
            <label class="sup-form-label">Пріоритет</label>
            <div class="sup-priority-selector" id="sup-prio-sel">
              ${Object.entries(PRIORITY_META).map(([id, m]) => `
                <button class="sup-prio-btn ${id === 'medium' ? 'active' : ''}" data-prio="${id}" style="--pc:${m.color}">
                  <span style="color:${m.color}">●</span> ${m.label}
                </button>
              `).join('')}
            </div>
          </div>

          <div class="sup-form-group">
            <label class="sup-form-label">Заголовок *</label>
            <input class="sup-input" type="text" id="sup-ntitle" placeholder="Коротко опишіть проблему або ідею" maxlength="120">
          </div>

          <div class="sup-form-group">
            <label class="sup-form-label">Опис *</label>
            <textarea class="sup-input sup-textarea" id="sup-ndesc" rows="5" placeholder="Детальний опис: кроки відтворення, очікувана поведінка тощо…"></textarea>
          </div>

          <div class="sup-form-group">
            <label class="sup-form-label">Фото / скріншоти</label>
            <div class="sup-attach-zone" id="sup-attach-zone">
              <input type="file" id="sup-nfiles" multiple accept="image/*" style="display:none">
              <button type="button" class="sup-btn-ghost" id="sup-attach-pick" style="padding:7px 16px">${icon('image', 13)} Додати фото</button>
              <span class="sup-attach-hint">або вставте <kbd>Ctrl+V</kbd></span>
            </div>
            <div class="sup-attach-previews" id="sup-attach-previews"></div>
          </div>
        </div>

        <div class="sup-modal-foot">
          <button class="sup-btn-ghost" id="sup-ncancel">Скасувати</button>
          <button class="sup-btn-primary" id="sup-nsubmit">Надіслати заявку</button>
        </div>
      </div>
    `

    document.body.appendChild(modal)

    let selectedType = 'bug'
    let selectedPrio = 'medium'
    let newFiles      = []

    function addAttachPreview(file) {
      const wrap = modal.querySelector('#sup-attach-previews')
      const item = document.createElement('div')
      item.className = 'sup-attach-item'
      item.dataset.filename = file.name
      const reader = new FileReader()
      reader.onload = e => {
        item.innerHTML = `
          <img src="${e.target.result}" class="sup-attach-img">
          <button type="button" class="sup-attach-remove" data-filename="${file.name}">${icon('x', 10)}</button>
        `
        item.querySelector('.sup-attach-remove').addEventListener('click', () => {
          newFiles = newFiles.filter(f => f.name !== file.name)
          item.remove()
        })
      }
      reader.readAsDataURL(file)
      wrap.appendChild(item)
    }

    modal.querySelector('#sup-attach-pick').addEventListener('click', () => {
      modal.querySelector('#sup-nfiles').click()
    })
    modal.querySelector('#sup-nfiles').addEventListener('change', e => {
      Array.from(e.target.files).forEach(file => {
        if (newFiles.some(f => f.name === file.name && f.size === file.size)) return
        newFiles.push(file)
        addAttachPreview(file)
      })
      e.target.value = ''
    })
    modal.addEventListener('paste', e => {
      const items = Array.from(e.clipboardData?.items || [])
      const imgs  = items.filter(i => i.type.startsWith('image/')).map(i => i.getAsFile()).filter(Boolean)
      if (!imgs.length) return
      e.preventDefault()
      imgs.forEach((file, i) => {
        const named = new File([file], file.name || `screenshot_${Date.now()}_${i}.png`, { type: file.type })
        if (newFiles.some(f => f.name === named.name && f.size === named.size)) return
        newFiles.push(named)
        addAttachPreview(named)
      })
    })

    modal.querySelector('#sup-type-sel').addEventListener('click', e => {
      const btn = e.target.closest('.sup-type-card')
      if (!btn) return
      selectedType = btn.dataset.type
      modal.querySelectorAll('.sup-type-card').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
    })

    modal.querySelector('#sup-prio-sel').addEventListener('click', e => {
      const btn = e.target.closest('.sup-prio-btn')
      if (!btn) return
      selectedPrio = btn.dataset.prio
      modal.querySelectorAll('.sup-prio-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
    })

    const closeModal = () => modal.remove()
    modal.querySelector('#sup-nclose').addEventListener('click', closeModal)
    modal.querySelector('#sup-ncancel').addEventListener('click', closeModal)
    modal.addEventListener('click', e => { if (e.target === modal) closeModal() })

    modal.querySelector('#sup-nsubmit').addEventListener('click', async () => {
      const title = modal.querySelector('#sup-ntitle').value.trim()
      const desc  = modal.querySelector('#sup-ndesc').value.trim()
      if (!title) { modal.querySelector('#sup-ntitle').focus(); return }
      if (!desc)  { modal.querySelector('#sup-ndesc').focus(); return }

      const lastAt = profile?.lastTicketAt?.toDate?.() || (profile?.lastTicketAt ? new Date(profile.lastTicketAt) : null)
      if (lastAt) {
        const waitMs = TICKET_COOLDOWN_MS - (Date.now() - lastAt.getTime())
        if (waitMs > 0) {
          showToast(`Зачекайте ${Math.ceil(waitMs / 1000)} сек. перед наступною заявкою`, 'error')
          return
        }
      }

      const btn = modal.querySelector('#sup-nsubmit')
      btn.disabled = true; btn.textContent = 'Надсилання...'

      try {
        const attachments = await Promise.all(newFiles.map(file => uploadToCloudinary(file)))
        const data = {
          userId:    user.uid,
          userName:  profile?.name  || '',
          userEmail: user.email     || '',
          appVersion: window.electron?.appVersion || null,
          type:      selectedType,
          priority:  selectedPrio,
          title,
          description: desc,
          attachments,
          status:    'new',
          replies:   [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }
        const ticketRef = doc(collection(db, 'tickets'))
        const batch = writeBatch(db)
        batch.set(ticketRef, data)
        batch.update(doc(db, 'users', user.uid), { lastTicketAt: serverTimestamp() })
        await batch.commit()
        if (profile) profile.lastTicketAt = new Date()
        tickets.unshift({ id: ticketRef.id, ...data, createdAt: { toDate: () => new Date() } })
        closeModal()
        renderTicketList()
        showToast('Заявку надіслано')
        sendTicketNotification(data).catch(() => {})
      } catch (err) {
        console.error('ticket create error:', err)
        btn.disabled = false; btn.textContent = 'Надіслати заявку'
        showToast('Помилка: ' + (err?.message || 'невідома помилка'), 'error')
      }
    })
  }

  // ── News ──────────────────────────────────────────────────
  function renderNews() {
    const panel = container.querySelector('#sup-news-panel')
    if (!announcements.length) {
      panel.innerHTML = `<div class="sup-empty"><div style="display:flex;align-items:center;justify-content:center;margin-bottom:12px;color:var(--text-muted)">${icon('newspaper', 48)}</div><div style="font-weight:700">Новин поки немає</div></div>`
      return
    }
    const typeIcon  = { info: icon('info', 14), success: icon('check-circle', 14), warning: icon('warning', 14), error: icon('x-circle', 14) }
    const typeColor = { info: '#4F8EF7', success: '#34D399', warning: '#FBBF24', error: '#F87171' }
    panel.innerHTML = `
      <div class="sup-news-list">
        ${announcements.map(n => {
          const date = n.createdAt?.toDate?.()?.toLocaleDateString('uk-UA', { day:'numeric', month:'long', year:'numeric' }) || '—'
          const color = typeColor[n.type] || typeColor.info
          return `
            <div class="sup-news-card" style="--nc:${color}">
              <div class="sup-news-icon">${typeIcon[n.type] || icon('info', 14)}</div>
              <div class="sup-news-body">
                <div class="sup-news-title">${esc(n.title)}</div>
                <div class="sup-news-text">${esc(n.body)}</div>
                <div class="sup-news-meta">від WorkHub · ${date}</div>
              </div>
            </div>`
        }).join('')}
      </div>`
  }

  // ── Helpers ───────────────────────────────────────────────
  function esc(s = '') {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  }

  function showToast(msg, type = 'success') {
    document.querySelector('.sup-toast')?.remove()
    const el = document.createElement('div')
    el.className = `sup-toast sup-toast--${type}`
    el.textContent = msg
    document.body.appendChild(el)
    requestAnimationFrame(() => el.classList.add('show'))
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300) }, 3000)
  }
}

// ── Styles ─────────────────────────────────────────────────
function injectStyles() {
  document.getElementById('support-styles')?.remove()
  const s = document.createElement('style')
  s.id = 'support-styles'
  s.textContent = `
    /* ── Split-panel layout ───────────────────────────────── */
    .sup-layout { display:flex; height:100%; overflow:hidden; }

    .sup-left {
      width:360px; flex-shrink:0; display:flex; flex-direction:column;
      border-right:1px solid var(--border); overflow:hidden;
    }
    .sup-left-head {
      display:flex; align-items:center; justify-content:space-between;
      padding:20px 18px 14px; flex-shrink:0;
    }
    .sup-title    { font-family:var(--font-display); font-size:20px; font-weight:800; margin-bottom:3px; display:flex; align-items:center; gap:7px; }
    .sup-subtitle { font-size:12px; color:var(--text-muted); }

    .sup-right {
      flex:1; overflow:hidden; display:flex; flex-direction:column;
      background:var(--bg-primary);
    }
    .sup-right-empty {
      display:flex; flex-direction:column; align-items:center;
      justify-content:center; height:100%; text-align:center; padding:24px;
    }

    /* ── Tabs & pills (inside .sup-left) ─────────────────── */
    .sup-tabs     { display:flex; gap:4px; background:var(--bg-secondary); padding:4px; border-radius:var(--radius-md); border:1px solid var(--border); margin:0 18px 12px; flex-shrink:0; }
    .sup-tab      { padding:6px 16px; border-radius:var(--radius-sm); font-size:13px; font-weight:600; color:var(--text-muted); cursor:pointer; border:none; background:none; transition:all .15s; }
    .sup-tab:hover{ color:var(--text-primary); }
    .sup-tab.active{ background:var(--bg-primary); color:var(--text-primary); box-shadow:0 1px 4px rgba(0,0,0,.3); }

    .sup-type-pills { display:flex; gap:6px; flex-wrap:wrap; padding:0 18px 12px; flex-shrink:0; }
    .sup-type-pill  { padding:4px 12px; border-radius:var(--radius-full); font-size:12px; font-weight:600; border:1.5px solid var(--border); background:var(--bg-secondary); color:var(--text-muted); cursor:pointer; transition:all .15s; }
    .sup-type-pill:hover  { border-color:var(--accent-blue); color:var(--text-primary); }
    .sup-type-pill.active { background:var(--accent-blue); border-color:var(--accent-blue); color:#fff; }

    .sup-panel { flex:1; overflow-y:auto; padding:0 12px 20px; }

    /* ── Ticket list ─────────────────────────────────────── */
    .sup-ticket-list { display:flex; flex-direction:column; gap:7px; }
    .sup-ticket-card {
      display:flex; align-items:center; gap:12px;
      padding:13px 14px; background:var(--bg-secondary);
      border:1.5px solid var(--border); border-radius:var(--radius-lg);
      cursor:pointer; transition:all .18s;
    }
    .sup-ticket-card:hover  { border-color:var(--accent-blue); box-shadow:0 3px 10px rgba(0,0,0,.18); }
    .sup-ticket-card.active { border-color:var(--accent-blue); background:rgba(79,142,247,.07); box-shadow:0 3px 12px rgba(79,142,247,.18); }
    .sup-ticket-card--new-reply { border-color:rgba(79,142,247,.35); background:rgba(79,142,247,.04); }
    .sup-ticket-type-badge { font-size:11px; font-weight:700; padding:3px 9px; border-radius:var(--radius-full); white-space:nowrap; flex-shrink:0; }
    .sup-ticket-main  { flex:1; min-width:0; }
    .sup-ticket-title { font-size:13px; font-weight:700; margin-bottom:5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .sup-ticket-meta  { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    .sup-ticket-right { display:flex; align-items:center; gap:8px; flex-shrink:0; }
    .sup-status-chip  { font-size:11px; font-weight:700; }
    .sup-priority-chip{ font-size:11px; font-weight:600; }
    .sup-reply-count  { font-size:11px; font-weight:700; padding:2px 8px; border-radius:var(--radius-full); background:var(--bg-tertiary); color:var(--text-muted); }
    .sup-reply-count--new { background:rgba(79,142,247,.15); color:var(--accent-blue); }
    .sup-ticket-arrow { font-size:16px; color:var(--text-muted); }

    /* ── Inline detail panel ─────────────────────────────── */
    .sup-detail { display:flex; flex-direction:column; height:100%; overflow:hidden; }
    .sup-detail-head {
      padding:20px 24px 14px; border-bottom:1px solid var(--border); flex-shrink:0;
    }
    .sup-detail-head-top {
      display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;
    }
    .sup-detail-title {
      font-family:var(--font-display); font-size:18px; font-weight:800; margin-bottom:10px; line-height:1.3;
    }
    .sup-detail-close {
      background:none; border:none; display:flex; align-items:center; justify-content:center;
      width:32px; height:32px; color:var(--text-muted); cursor:pointer;
      border-radius:6px; transition:all .15s; flex-shrink:0;
    }
    .sup-detail-close:hover { background:var(--bg-tertiary); color:var(--text-primary); }

    .sup-modal-meta { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }

    /* ── Thread ──────────────────────────────────────────── */
    .sup-thread { padding:20px 24px; display:flex; flex-direction:column; gap:16px; overflow-y:auto; flex:1; }
    .sup-msg    { display:flex; gap:12px; align-items:flex-start; }
    .sup-msg--admin { flex-direction:row-reverse; }
    .sup-msg-avatar { width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:800; flex-shrink:0; }
    .sup-msg-avatar--user  { background:linear-gradient(135deg,#667eea,#4F8EF7); color:#fff; }
    .sup-msg-avatar--admin { background:linear-gradient(135deg,#F87171,#EF4444); color:#fff; font-size:16px; }
    .sup-msg-body  { flex:1; min-width:0; }
    .sup-msg--admin .sup-msg-body { text-align:right; }
    .sup-msg-author{ font-size:12px; font-weight:700; margin-bottom:6px; display:flex; align-items:center; gap:6px; }
    .sup-msg--admin .sup-msg-author { justify-content:flex-end; }
    .sup-msg-you   { font-size:10px; font-weight:700; padding:1px 6px; border-radius:var(--radius-full); background:rgba(79,142,247,.15); color:var(--accent-blue); }
    .sup-msg-admin-badge { font-size:10px; font-weight:700; padding:1px 6px; border-radius:var(--radius-full); background:rgba(248,113,113,.15); color:#F87171; }
    .sup-msg-text  { font-size:14px; line-height:1.55; padding:12px 14px; background:var(--bg-tertiary); border-radius:var(--radius-lg); display:inline-block; max-width:100%; text-align:left; white-space:pre-wrap; word-break:break-word; }
    .sup-msg--admin .sup-msg-text { background:rgba(79,142,247,.12); border:1px solid rgba(79,142,247,.2); }
    .sup-msg-time  { font-size:11px; color:var(--text-muted); margin-top:4px; }

    /* ── Reply form ──────────────────────────────────────── */
    .sup-reply-form    { padding:16px 24px; border-top:1px solid var(--border); flex-shrink:0; background:var(--bg-primary); }
    .sup-reply-input   { width:100%; box-sizing:border-box; padding:10px 14px; background:var(--bg-tertiary); border:1.5px solid var(--border); border-radius:var(--radius-md); font-size:14px; color:var(--text-primary); outline:none; resize:vertical; font-family:inherit; transition:border-color .15s; }
    .sup-reply-input:focus { border-color:var(--accent-blue); }
    .sup-reply-actions { display:flex; justify-content:flex-end; align-items:center; gap:10px; margin-top:10px; }
    .sup-closed-notice { padding:16px 24px; border-top:1px solid var(--border); text-align:center; font-size:13px; color:var(--text-muted); flex-shrink:0; justify-content:center; }

    /* ── New ticket modal (overlay) ──────────────────────── */
    .sup-overlay { position:fixed; inset:0; background:rgba(0,0,0,.65); backdrop-filter:blur(6px); display:flex; align-items:center; justify-content:center; z-index:2000; padding:24px; }
    .sup-modal   { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-xl); width:100%; max-width:560px; max-height:90vh; display:flex; flex-direction:column; box-shadow:var(--shadow-xl); animation:sup-in .2s cubic-bezier(.34,1.2,.64,1); }
    @keyframes sup-in { from{opacity:0;transform:scale(.94)} to{opacity:1;transform:scale(1)} }
    .sup-modal-head  { display:flex; align-items:center; gap:12px; padding:22px 24px 0; flex-shrink:0; }
    .sup-modal-title { font-family:var(--font-display); font-size:18px; font-weight:800; flex:1; min-width:0; }
    .sup-modal-close { background:none; border:none; display:flex; align-items:center; justify-content:center; width:32px; height:32px; color:var(--text-muted); cursor:pointer; border-radius:6px; transition:all .15s; flex-shrink:0; }
    .sup-modal-close:hover { background:var(--bg-tertiary); color:var(--text-primary); }
    .sup-modal-foot  { display:flex; gap:10px; justify-content:flex-end; padding:14px 24px; border-top:1px solid var(--border); flex-shrink:0; }

    .sup-form-body   { padding:20px 24px; display:flex; flex-direction:column; gap:18px; overflow-y:auto; flex:1; }
    .sup-form-group  { display:flex; flex-direction:column; gap:8px; }
    .sup-form-label  { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--text-muted); }
    .sup-input       { padding:10px 14px; background:var(--bg-tertiary); border:1.5px solid var(--border); border-radius:var(--radius-md); font-size:14px; color:var(--text-primary); outline:none; transition:border-color .15s; font-family:inherit; width:100%; box-sizing:border-box; }
    .sup-input:focus { border-color:var(--accent-blue); }
    .sup-textarea    { resize:vertical; min-height:100px; }

    /* ── Attachments (new ticket + reply) ────────────────── */
    .sup-attach-zone     { display:flex; align-items:center; gap:10px; }
    .sup-attach-hint     { font-size:11px; color:var(--text-muted); }
    .sup-attach-hint kbd { background:var(--bg-tertiary); border:1px solid var(--border); border-radius:4px; padding:1px 5px; font-size:10px; font-family:monospace; }
    .sup-attach-previews { display:flex; flex-wrap:wrap; gap:8px; margin-top:8px; }
    .sup-attach-item     { position:relative; }
    .sup-attach-img      { width:64px; height:64px; object-fit:cover; border-radius:8px; border:1px solid var(--border); display:block; }
    .sup-attach-remove   { position:absolute; top:-6px; right:-6px; width:18px; height:18px; border-radius:50%; background:#EF4444; color:#fff; border:none; display:flex; align-items:center; justify-content:center; cursor:pointer; }
    .sup-msg-attachments { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
    .sup-msg-attach-img  { width:90px; height:90px; object-fit:cover; border-radius:8px; border:1px solid var(--border); cursor:pointer; transition:opacity .15s; }
    .sup-msg-attach-img:hover { opacity:.85; }

    .sup-type-selector { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
    .sup-type-card     { padding:12px 10px; border-radius:var(--radius-lg); background:var(--bg-tertiary); border:2px solid var(--border); cursor:pointer; transition:all .15s; display:flex; flex-direction:column; align-items:center; gap:6px; }
    .sup-type-card:hover  { border-color:var(--tc,var(--border)); }
    .sup-type-card.active { border-color:var(--tc); background:color-mix(in srgb,var(--tc) 10%,var(--bg-tertiary)); }
    .sup-type-card-icon   { display:flex; align-items:center; justify-content:center; }
    .sup-type-card-label  { font-size:11px; font-weight:700; text-align:center; }

    .sup-priority-selector { display:flex; gap:6px; flex-wrap:wrap; }
    .sup-prio-btn  { padding:5px 14px; border-radius:var(--radius-full); font-size:12px; font-weight:600; border:1.5px solid var(--border); background:var(--bg-tertiary); cursor:pointer; transition:all .15s; color:var(--text-secondary); display:flex; align-items:center; gap:5px; }
    .sup-prio-btn:hover  { border-color:var(--pc); }
    .sup-prio-btn.active { border-color:var(--pc); background:color-mix(in srgb,var(--pc) 12%,var(--bg-tertiary)); }

    /* ── News ────────────────────────────────────────────── */
    .sup-news-list { display:flex; flex-direction:column; gap:12px; }
    .sup-news-card { display:flex; gap:16px; padding:18px 20px; background:var(--bg-secondary); border:1.5px solid var(--border); border-left:4px solid var(--nc,var(--accent-blue)); border-radius:var(--radius-xl); }
    .sup-news-icon { display:flex; align-items:center; flex-shrink:0; }
    .sup-news-body { flex:1; min-width:0; }
    .sup-news-title{ font-size:15px; font-weight:700; margin-bottom:6px; }
    .sup-news-text { font-size:13px; color:var(--text-secondary); line-height:1.55; margin-bottom:8px; }
    .sup-news-meta { font-size:11px; color:var(--text-muted); }

    /* ── Buttons ─────────────────────────────────────────── */
    .sup-btn-primary { display:inline-flex; align-items:center; gap:6px; padding:9px 20px; background:linear-gradient(135deg,#667eea,#4F8EF7); color:#fff; border:none; border-radius:var(--radius-md); font-size:13px; font-weight:700; cursor:pointer; transition:all .18s; }
    .sup-btn-primary:hover { transform:translateY(-1px); box-shadow:0 4px 14px rgba(79,142,247,.4); }
    .sup-btn-primary:disabled { opacity:.6; transform:none; box-shadow:none; }
    .sup-btn-ghost { display:inline-flex; align-items:center; gap:6px; padding:9px 20px; background:var(--bg-tertiary); border:1.5px solid var(--border); color:var(--text-primary); border-radius:var(--radius-md); font-size:13px; font-weight:600; cursor:pointer; transition:all .15s; }
    .sup-btn-ghost:hover { border-color:var(--accent-blue); }
    .sup-btn-close-ticket { display:inline-flex; align-items:center; padding:7px 14px; background:none; border:1.5px solid rgba(248,113,113,.4); color:#F87171; border-radius:var(--radius-md); font-size:12px; font-weight:600; cursor:pointer; transition:all .15s; }
    .sup-btn-close-ticket:hover { background:rgba(248,113,113,.1); }

    /* ── Empty / loading ─────────────────────────────────── */
    .sup-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:60px 20px; color:var(--text-muted); text-align:center; }
    .sup-loading { display:flex; justify-content:center; padding:60px; }
    .sup-loading::after { content:''; width:28px; height:28px; border:3px solid var(--border); border-top-color:var(--accent-blue); border-radius:50%; animation:sup-spin .7s linear infinite; }
    @keyframes sup-spin { to{transform:rotate(360deg)} }

    /* ── Toast ───────────────────────────────────────────── */
    .sup-toast { position:fixed; bottom:24px; right:24px; z-index:9999; padding:12px 20px; border-radius:var(--radius-md); background:var(--bg-secondary); border:1px solid var(--border); font-size:14px; font-weight:600; box-shadow:var(--shadow-xl); transform:translateY(20px); opacity:0; transition:all .25s; }
    .sup-toast.show { transform:translateY(0); opacity:1; }
    .sup-toast--success { border-left:4px solid #34D399; }
    .sup-toast--error   { border-left:4px solid #F87171; }

    @media (max-width:900px) {
      .sup-left { width:300px; }
    }
    @media (max-width:640px) {
      .sup-layout { flex-direction:column; }
      .sup-left   { width:100%; height:50%; border-right:none; border-bottom:1px solid var(--border); }
      .sup-right  { height:50%; }
      .sup-type-selector { grid-template-columns:1fr 1fr; }
    }
  `
  document.head.appendChild(s)
}
