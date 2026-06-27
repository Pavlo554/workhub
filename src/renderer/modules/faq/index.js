// src/renderer/modules/faq/index.js
import { db } from '../../services/firebase.js'
import { collection, getDocs, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
import { icon } from '../../utils/icons.js'

export async function render(container) {
  injectStyles()

  container.innerHTML = `
    <div class="faq-page">
      <div class="faq-header">
        <h1 class="faq-title">${icon('info', 20)} Часті запитання</h1>
        <p class="faq-subtitle">Відповіді на найпоширеніші запитання про WorkHub</p>
      </div>
      <input class="faq-search" id="faq-search" type="text" placeholder="Пошук запитання..." />
      <div class="faq-cats" id="faq-cats"></div>
      <div id="faq-list"><div class="faq-loading"><div class="faq-spinner"></div></div></div>
    </div>
  `

  let items = []
  let activeCat = 'all'
  let searchTerm = ''

  try {
    const snap = await getDocs(query(collection(db, 'faq'), orderBy('order', 'asc')))
    items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch {
    try {
      const snap = await getDocs(collection(db, 'faq'))
      items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch (err) {
      console.error('faq load error', err)
    }
  }

  renderCats()
  renderList()

  function renderCats() {
    const cats = [...new Set(items.map(i => i.category).filter(Boolean))]
    const el = container.querySelector('#faq-cats')
    if (!cats.length) { el.style.display = 'none'; return }
    el.innerHTML = `
      <button class="faq-cat ${activeCat === 'all' ? 'active' : ''}" data-cat="all">Всі</button>
      ${cats.map(c => `<button class="faq-cat ${activeCat === c ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
    `
    el.querySelectorAll('.faq-cat').forEach(btn => {
      btn.addEventListener('click', () => {
        activeCat = btn.dataset.cat
        el.querySelectorAll('.faq-cat').forEach(b => b.classList.toggle('active', b === btn))
        renderList()
      })
    })
  }

  function renderList() {
    const el = container.querySelector('#faq-list')
    const term = searchTerm.trim().toLowerCase()
    const filtered = items.filter(i => {
      if (activeCat !== 'all' && i.category !== activeCat) return false
      if (term && !(i.question?.toLowerCase().includes(term) || i.answer?.toLowerCase().includes(term))) return false
      return true
    })

    if (!filtered.length) {
      el.innerHTML = `
        <div class="faq-empty">
          <div class="faq-empty-icon">${icon('info', 40)}</div>
          <div class="faq-empty-title">${items.length ? 'Нічого не знайдено' : 'Питань ще немає'}</div>
          <div class="faq-empty-desc">${items.length ? 'Спробуйте інший запит або категорію' : 'Звертайтесь у Підтримку, якщо є запитання'}</div>
        </div>`
      return
    }

    el.innerHTML = `<div class="faq-acc">${filtered.map(i => `
      <div class="faq-item" data-id="${i.id}">
        <button class="faq-q">
          <span>${esc(i.question)}</span>
          ${icon('chevron-down', 14)}
        </button>
        <div class="faq-a"><div class="faq-a-inner">${renderBlocks(i)}</div></div>
      </div>
    `).join('')}</div>`

    el.querySelectorAll('.faq-q').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.faq-item')
        item.classList.toggle('open')
      })
    })
  }

  container.querySelector('#faq-search').addEventListener('input', e => {
    searchTerm = e.target.value
    renderList()
  })
}

function renderBlocks(item) {
  if (item.content?.length) {
    return item.content.map(b =>
      b.type === 'image'
        ? `<img class="faq-a-img" src="${esc(b.url)}" alt="">`
        : `<p class="faq-a-text">${esc(b.text)}</p>`
    ).join('')
  }
  return `<p class="faq-a-text">${esc(item.answer)}</p>`
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))
}

function injectStyles() {
  if (document.getElementById('faq-styles')) return
  const s = document.createElement('style')
  s.id = 'faq-styles'
  s.textContent = `
    .faq-page { max-width: 760px; margin: 0 auto; padding: 28px 24px 60px; }
    .faq-title { font-family: var(--font-display); font-size: 22px; font-weight: 800; display: flex; align-items: center; gap: 10px; }
    .faq-subtitle { font-size: 13px; color: var(--text-muted); margin-top: 6px; margin-bottom: 20px; }

    .faq-search {
      width: 100%; box-sizing: border-box; padding: 11px 14px; margin-bottom: 14px;
      background: var(--bg-tertiary); border: 1.5px solid var(--border); border-radius: var(--radius-md);
      color: var(--text-primary); font-size: 14px; outline: none; transition: border-color .15s;
    }
    .faq-search:focus { border-color: var(--accent-blue); }

    .faq-cats { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 18px; }
    .faq-cat {
      padding: 6px 13px; border-radius: 999px; font-size: 12.5px; font-weight: 600; cursor: pointer;
      border: 1px solid var(--border); background: var(--bg-elevated, var(--bg-tertiary)); color: var(--text-muted);
      transition: all .15s;
    }
    .faq-cat:hover { color: var(--text-primary); }
    .faq-cat.active { background: var(--accent-blue-dim, rgba(79,142,247,.15)); border-color: var(--accent-blue); color: var(--accent-blue); }

    .faq-acc { display: flex; flex-direction: column; gap: 8px; }
    .faq-item {
      border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--bg-elevated, var(--bg-tertiary));
      overflow: hidden;
    }
    .faq-q {
      width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 14px 16px; background: none; border: none; cursor: pointer;
      font-size: 14px; font-weight: 600; color: var(--text-primary); text-align: left;
    }
    .faq-q svg { flex-shrink: 0; transition: transform .2s; color: var(--text-muted); }
    .faq-item.open .faq-q svg { transform: rotate(180deg); }
    .faq-a { max-height: 0; overflow: hidden; transition: max-height .25s ease; }
    .faq-item.open .faq-a { max-height: 4000px; }
    .faq-a-inner { padding: 0 16px 16px; font-size: 13.5px; line-height: 1.6; color: var(--text-secondary); display: flex; flex-direction: column; gap: 10px; }
    .faq-a-text { margin: 0; white-space: pre-wrap; }
    .faq-a-img { max-width: 100%; border-radius: var(--radius-md); border: 1px solid var(--border); }

    .faq-empty { text-align: center; padding: 60px 20px; color: var(--text-muted); }
    .faq-empty-icon { opacity: .4; margin-bottom: 14px; display: flex; justify-content: center; }
    .faq-empty-title { font-size: 15px; font-weight: 700; color: var(--text-secondary); margin-bottom: 6px; }
    .faq-empty-desc { font-size: 13px; max-width: 320px; margin: 0 auto; }

    .faq-loading { display: flex; justify-content: center; padding: 60px 0; }
    .faq-spinner { width: 28px; height: 28px; border: 3px solid var(--border); border-top-color: var(--accent-blue);
      border-radius: 50%; animation: faq-spin .7s linear infinite; }
    @keyframes faq-spin { to { transform: rotate(360deg); } }
  `
  document.head.appendChild(s)
}
