// src/renderer/modules/hr/index.js
import { icon } from '../../utils/icons.js'
import { t } from '../../core/i18n.js'
import { db } from '../../services/firebase.js'
import { getCurrentUser, getActivePathSegments } from '../../services/auth.js'
import { invalidateRoute } from '../../../core/router.js'
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, orderBy, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

const STATUS = {
  active:  { get label() { return t('hr.status_active')  || 'Active' },   color: '#34D399', bg: 'rgba(52,211,153,.12)' },
  trial:   { get label() { return t('hr.status_trial')   || 'Trial' },    color: '#F59E0B', bg: 'rgba(245,158,11,.12)' },
  fired:   { get label() { return t('hr.status_fired')   || 'Fired' },    color: '#EF4444', bg: 'rgba(239,68,68,.12)'  },
}

// Довідник статей звільнення (КЗпП України)
const DISMISSAL_REASONS = [
  'Ст. 36 п.1 КЗпП — За угодою сторін',
  'Ст. 38 КЗпП — За власним бажанням',
  'Ст. 39 КЗпП — За власним бажанням (поважні причини)',
  'Ст. 40 п.1 КЗпП — Скорочення штату / ліквідація',
  'Ст. 40 п.2 КЗпП — Невідповідність кваліфікації',
  'Ст. 40 п.3 КЗпП — Систематичне невиконання обов\'язків',
  'Ст. 40 п.4 КЗпП — Прогул без поважних причин',
  'Ст. 40 п.7 КЗпП — Появлення на роботі у стані сп\'яніння',
  'Ст. 40 п.8 КЗпП — Викрадення майна / розкрадання',
  'Ст. 41 КЗпП — Втрата довіри (матеріально відповідальні)',
  'Ст. 36 п.2 КЗпП — Закінчення строку трудового договору',
  'Ст. 36 п.5 КЗпП — Перехід на іншу роботу',
  'Ст. 36 п.6 КЗпП — Відмова від переведення в іншу місцевість',
  'Інша підстава',
]
function nextOrderNum(existing, field) {
  const max = existing
    .map(e => parseInt((e[field] || '').replace(/\D/g, '')) || 0)
    .reduce((a, b) => Math.max(a, b), 0)
  return String(max + 1).padStart(3, '0')
}
function today() { return new Date().toISOString().slice(0, 10) }
function fmtDateUk(s) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}.${m}.${y}`
}

export async function render(container) {
  injectStyles()
  const user = getCurrentUser()
  const base = getActivePathSegments(user.uid)
  let employees = []
  let editEmp = null
  let activeStatus = 'all'

  async function load() {
    try {
      const snap = await getDocs(query(collection(db, ...base, 'employees'), orderBy('createdAt', 'desc')))
      employees = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch { employees = [] }
    rerender()
  }

  function rerender() {
    const filtered = activeStatus === 'all' ? employees : employees.filter(e => e.status === activeStatus)
    const active   = employees.filter(e => e.status === 'active').length
    const totalSalary = employees.filter(e => e.status !== 'fired').reduce((s, e) => s + (e.salary || 0), 0)

    container.innerHTML = `
      <div class="hr-page">
        <div class="hr-header">
          <div>
            <h1 class="hr-title">${icon('user', 20)} ${t('hr.title')}</h1>
            <p class="hr-subtitle">${active} ${t('hr.active').toLowerCase()} · ${employees.length} ${t('common.total').toLowerCase()}</p>
          </div>
          <button class="hr-add-btn" id="hr-add">${t('hr.add')}</button>
        </div>

        <div class="hr-kpi-row">
          <div class="hr-kpi">
            <div class="hr-kpi-icon" style="color:#4F8EF7">${icon('user', 18)}</div>
            <div class="hr-kpi-val">${employees.length}</div>
            <div class="hr-kpi-label">${t('hr.total')}</div>
          </div>
          <div class="hr-kpi">
            <div class="hr-kpi-icon" style="color:#34D399">${icon('check-circle', 18)}</div>
            <div class="hr-kpi-val" style="color:#34D399">${active}</div>
            <div class="hr-kpi-label">${t('hr.active')}</div>
          </div>
          <div class="hr-kpi">
            <div class="hr-kpi-icon" style="color:#F59E0B">${icon('timer', 18)}</div>
            <div class="hr-kpi-val" style="color:#F59E0B">${employees.filter(e=>e.status==='trial').length}</div>
            <div class="hr-kpi-label">${t('hr.hours')}</div>
          </div>
          <div class="hr-kpi">
            <div class="hr-kpi-icon" style="color:#A78BFA">${icon('finances', 18)}</div>
            <div class="hr-kpi-val">₴${totalSalary.toLocaleString('uk-UA')}</div>
            <div class="hr-kpi-label">Фонд оплати праці</div>
          </div>
        </div>

        <div class="hr-filter-pills">
          <button class="hr-pill ${activeStatus==='all'?'active':''}" data-s="all">Всі (${employees.length})</button>
          ${Object.entries(STATUS).map(([k,v]) => {
            const cnt = employees.filter(e => e.status === k).length
            return `<button class="hr-pill ${activeStatus===k?'active':''}" data-s="${k}" style="${activeStatus===k?`--sc:${v.color}`:''}">
              ${v.label} (${cnt})
            </button>`
          }).join('')}
        </div>

        ${filtered.length ? `
        <div class="hr-grid">
          ${filtered.map(emp => {
            const st = STATUS[emp.status] || STATUS.active
            return `
              <div class="hr-card">
                <div class="hr-card-head">
                  <div class="hr-avatar" style="background:${['#4F8EF7','#A78BFA','#34D399','#F59E0B','#F472B6','#FB923C','#38BDF8'][(emp.name||'?').charCodeAt(0)%7]}">${(emp.name||'?')[0].toUpperCase()}</div>
                  <div class="hr-card-info">
                    <div class="hr-card-name">${emp.name}</div>
                    <div class="hr-card-role">${emp.role || '—'}</div>
                  </div>
                  <div class="hr-card-btns">
                    <button class="hr-cb hr-card-btn" data-id="${emp.id}" title="Особова картка">${icon('file', 13)}</button>
                    <button class="hr-cb hr-edit" data-id="${emp.id}" title="Редагувати">${icon('pencil', 13)}</button>
                    ${emp.status !== 'fired' ? `<button class="hr-cb hr-fire" data-id="${emp.id}" title="Звільнити">${icon('x-circle', 13)}</button>` : ''}
                    <button class="hr-cb hr-del"  data-id="${emp.id}" title="Видалити">${icon('trash', 13)}</button>
                  </div>
                </div>
                <div class="hr-card-body">
                  <span class="hr-status-badge" style="color:${st.color};background:${st.bg}">${st.label}</span>
                  ${emp.salary ? `<span class="hr-salary">₴${Number(emp.salary).toLocaleString('uk-UA')}/міс</span>` : ''}
                </div>
                <div class="hr-card-meta">
                  ${emp.phone    ? `<div class="hr-meta-row">${icon('phone', 11)} ${emp.phone}</div>` : ''}
                  ${emp.email    ? `<div class="hr-meta-row">${icon('mail', 11)} ${emp.email}</div>` : ''}
                  ${emp.startDate? `<div class="hr-meta-row">${icon('calendar', 11)} Від ${emp.startDate}</div>` : ''}
                  ${emp.schedule ? `<div class="hr-meta-row">${icon('timer', 11)} ${emp.schedule}</div>` : ''}
                  ${emp.status === 'fired' && emp.dismissalDate ? `<div class="hr-meta-row" style="color:#EF4444">${icon('x-circle', 11)} Звільнено ${fmtDateUk(emp.dismissalDate)}</div>` : ''}
                </div>
                ${emp.notes ? `<div class="hr-card-notes">${emp.notes}</div>` : ''}
              </div>
            `
          }).join('')}
        </div>` : `
        <div class="hr-empty">
          <div style="display:flex;align-items:center;justify-content:center;margin-bottom:12px;color:var(--text-muted);opacity:.4">${icon('user', 48)}</div>
          <div class="hr-empty-title">Команди ще немає</div>
          <div class="hr-empty-desc">Додайте першого співробітника</div>
          <button class="hr-add-btn" id="hr-add-empty">+ Додати співробітника</button>
        </div>`}
      </div>

      <!-- Modal -->
      <div class="hr-overlay" id="hr-modal" style="display:none">
        <div class="hr-modal">
          <div class="hr-modal-head">
            <h2 id="hr-modal-title">Новий співробітник</h2>
            <button id="hr-modal-close">${icon('x', 14)}</button>
          </div>
          <div class="hr-modal-body">
            <div class="hr-form-row">
              <div class="hr-field"><label>Ім'я *</label><input id="hr-f-name" class="hr-input" type="text" placeholder="Повне ім'я..."></div>
              <div class="hr-field"><label>Посада</label><input id="hr-f-role" class="hr-input" type="text" placeholder="Менеджер, Дизайнер..."></div>
            </div>
            <div class="hr-form-row">
              <div class="hr-field"><label>Статус</label><select id="hr-f-status" class="hr-input">${Object.entries(STATUS).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('')}</select></div>
              <div class="hr-field"><label>Зарплата (₴/міс)</label><input id="hr-f-salary" class="hr-input" type="number" min="0" placeholder="0"></div>
            </div>
            <div class="hr-form-row">
              <div class="hr-field"><label>Телефон</label><input id="hr-f-phone" class="hr-input" type="tel" placeholder="+380..."></div>
              <div class="hr-field"><label>Email</label><input id="hr-f-email" class="hr-input" type="email" placeholder="name@email.com"></div>
            </div>
            <div class="hr-form-row">
              <div class="hr-field"><label>Дата початку</label><input id="hr-f-start" class="hr-input" type="date"></div>
              <div class="hr-field"><label>Графік</label><input id="hr-f-schedule" class="hr-input" type="text" placeholder="Пн-Пт 9:00-18:00"></div>
            </div>
            <div class="hr-section-label">Особова картка</div>
            <div class="hr-form-row">
              <div class="hr-field"><label>Дата народження</label><input id="hr-f-birth" class="hr-input" type="date"></div>
              <div class="hr-field"><label>ІПН</label><input id="hr-f-taxid" class="hr-input" type="text" placeholder="1234567890"></div>
            </div>
            <div class="hr-field"><label>Паспортні дані</label><input id="hr-f-passport" class="hr-input" type="text" placeholder="Серія, номер, ким і коли видано"></div>
            <div class="hr-field"><label>Адреса проживання</label><input id="hr-f-address" class="hr-input" type="text" placeholder="м. Київ, вул. ..., буд. ..., кв. ..."></div>
            <div class="hr-field"><label>Нотатки</label><textarea id="hr-f-notes" class="hr-input hr-textarea" rows="2" placeholder="Додаткова інформація..."></textarea></div>
          </div>
          <div class="hr-modal-foot">
            <button class="hr-btn-sec" id="hr-modal-cancel">Скасувати</button>
            <button class="hr-btn-pri" id="hr-modal-save">Зберегти</button>
          </div>
        </div>
      </div>
    `
    attachEvents()
  }

  function attachEvents() {
    container.querySelector('#hr-add')?.addEventListener('click', () => openModal())
    container.querySelector('#hr-add-empty')?.addEventListener('click', () => openModal())
    container.querySelector('#hr-modal-close')?.addEventListener('click', closeModal)
    container.querySelector('#hr-modal-cancel')?.addEventListener('click', closeModal)
    container.querySelector('#hr-modal')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeModal() })
    container.querySelector('#hr-modal-save')?.addEventListener('click', save)
    container.querySelectorAll('.hr-pill').forEach(b => b.addEventListener('click', () => { activeStatus = b.dataset.s; rerender() }))
    container.querySelectorAll('.hr-edit').forEach(b => b.addEventListener('click', () => openModal(employees.find(e => e.id === b.dataset.id))))
    container.querySelectorAll('.hr-card-btn').forEach(b => b.addEventListener('click', () => openPersonalCard(employees.find(e => e.id === b.dataset.id))))
    container.querySelectorAll('.hr-fire').forEach(b => b.addEventListener('click', () => openFireModal(employees.find(e => e.id === b.dataset.id))))
    container.querySelectorAll('.hr-del').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Видалити співробітника?')) return
      await deleteDoc(doc(db, ...base, 'employees', b.dataset.id))
      invalidateRoute('payroll')
      await load()
    }))
  }

  function openModal(emp = null) {
    editEmp = emp
    container.querySelector('#hr-modal-title').textContent = emp ? 'Редагувати' : 'Новий співробітник'
    container.querySelector('#hr-f-name').value     = emp?.name      || ''
    container.querySelector('#hr-f-role').value     = emp?.role      || ''
    container.querySelector('#hr-f-status').value   = emp?.status    || 'active'
    container.querySelector('#hr-f-salary').value   = emp?.salary    ?? ''
    container.querySelector('#hr-f-phone').value    = emp?.phone     || ''
    container.querySelector('#hr-f-email').value    = emp?.email     || ''
    container.querySelector('#hr-f-start').value    = emp?.startDate || ''
    container.querySelector('#hr-f-schedule').value = emp?.schedule  || ''
    container.querySelector('#hr-f-birth').value    = emp?.birthDate  || ''
    container.querySelector('#hr-f-taxid').value    = emp?.taxId      || ''
    container.querySelector('#hr-f-passport').value = emp?.passport   || ''
    container.querySelector('#hr-f-address').value  = emp?.address    || ''
    container.querySelector('#hr-f-notes').value    = emp?.notes     || ''
    container.querySelector('#hr-modal').style.display = 'flex'
    setTimeout(() => container.querySelector('#hr-f-name').focus(), 50)
  }

  function closeModal() { container.querySelector('#hr-modal').style.display = 'none'; editEmp = null }

  async function save() {
    const name = container.querySelector('#hr-f-name').value.trim()
    if (!name) return
    const btn = container.querySelector('#hr-modal-save')
    btn.disabled = true; btn.textContent = '...'
    const data = {
      name, role: container.querySelector('#hr-f-role').value.trim() || null,
      status: container.querySelector('#hr-f-status').value,
      salary: Number(container.querySelector('#hr-f-salary').value) || 0,
      phone: container.querySelector('#hr-f-phone').value.trim() || null,
      email: container.querySelector('#hr-f-email').value.trim() || null,
      startDate: container.querySelector('#hr-f-start').value || null,
      schedule: container.querySelector('#hr-f-schedule').value.trim() || null,
      birthDate: container.querySelector('#hr-f-birth').value || null,
      taxId:     container.querySelector('#hr-f-taxid').value.trim() || null,
      passport:  container.querySelector('#hr-f-passport').value.trim() || null,
      address:   container.querySelector('#hr-f-address').value.trim() || null,
      notes: container.querySelector('#hr-f-notes').value.trim() || null,
    }
    try {
      if (editEmp) {
        await updateDoc(doc(db, ...base, 'employees', editEmp.id), { ...data, updatedAt: serverTimestamp() })
      } else {
        // Автоматично формуємо наказ про прийняття на роботу
        data.hireOrderNum  = nextOrderNum(employees, 'hireOrderNum')
        data.hireOrderDate = data.startDate || today()
        await addDoc(collection(db, ...base, 'employees'), { ...data, createdAt: serverTimestamp() })
      }
      invalidateRoute('payroll')
      closeModal(); await load()
    } finally { btn.disabled = false; btn.textContent = 'Зберегти' }
  }

  // ── Наказ про прийняття на роботу ──────────────────────────
  function printHireOrder(emp) {
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
      <style>body{font-family:Arial,sans-serif;font-size:13px;line-height:1.6;padding:30px}
      h2{text-align:center}.right{text-align:right}.center{text-align:center}
      .sign-row{margin-top:50px;display:flex;justify-content:space-between}</style></head><body>
      <p class="right">Наказ № ${emp.hireOrderNum || '—'}</p>
      <h2>НАКАЗ<br>про прийняття на роботу</h2>
      <p class="center">від ${fmtDateUk(emp.hireOrderDate || emp.startDate)}</p>
      <p>ПРИЙНЯТИ на роботу <strong>${emp.name}</strong> на посаду <strong>${emp.role || '—'}</strong>
      з ${fmtDateUk(emp.startDate || emp.hireOrderDate)} ${emp.schedule ? `з графіком роботи: ${emp.schedule}` : ''}
      ${emp.salary ? `із посадовим окладом ${Number(emp.salary).toLocaleString('uk-UA')} грн/міс.` : ''}</p>
      <p>Підстава: заява працівника, трудовий договір.</p>
      <div class="sign-row">
        <div>Директор / ФОП: _________________</div>
        <div>З наказом ознайомлений: _________________</div>
      </div>
      </body></html>`
    if (window.electron?.pdf?.generate) {
      window.electron.pdf.generate(html, `hire_order_${emp.hireOrderNum || ''}.pdf`).catch(() => {})
    } else {
      const w = window.open('', '_blank')
      if (w) { w.document.write(html); w.document.close(); w.print() }
    }
  }

  // ── Звільнення ──────────────────────────────────────────────
  function openFireModal(emp) {
    const overlay = document.createElement('div')
    overlay.className = 'hr-overlay'
    overlay.style.display = 'flex'
    const orderNum = nextOrderNum(employees, 'dismissalOrderNum')
    overlay.innerHTML = `
      <div class="hr-modal" style="width:440px">
        <div class="hr-modal-head">
          <h2>${icon('x-circle', 16)} Звільнення: ${emp.name}</h2>
          <button id="fr-close">${icon('x', 14)}</button>
        </div>
        <div class="hr-modal-body">
          <div class="hr-form-row">
            <div class="hr-field"><label>Дата звільнення *</label><input id="fr-date" class="hr-input" type="date" value="${today()}"></div>
            <div class="hr-field"><label>№ наказу</label><input id="fr-num" class="hr-input" type="text" value="${orderNum}" readonly style="opacity:.7"></div>
          </div>
          <div class="hr-field">
            <label>Підстава звільнення (довідник КЗпП)</label>
            <select id="fr-reason" class="hr-input">
              ${DISMISSAL_REASONS.map(r => `<option>${r}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="hr-modal-foot">
          <button class="hr-btn-sec" id="fr-cancel">Скасувати</button>
          <button class="hr-btn-pri" id="fr-save" style="background:linear-gradient(135deg,#F87171,#EF4444)">Звільнити</button>
        </div>
      </div>`
    document.body.appendChild(overlay)
    const close = () => overlay.remove()
    overlay.querySelector('#fr-close').addEventListener('click', close)
    overlay.querySelector('#fr-cancel').addEventListener('click', close)
    overlay.addEventListener('click', e => { if (e.target === overlay) close() })
    overlay.querySelector('#fr-save').addEventListener('click', async () => {
      const dismissalDate   = overlay.querySelector('#fr-date').value
      const dismissalReason = overlay.querySelector('#fr-reason').value
      const dismissalOrderNum = overlay.querySelector('#fr-num').value
      if (!dismissalDate) { alert('Вкажіть дату звільнення'); return }
      const btn = overlay.querySelector('#fr-save')
      btn.disabled = true; btn.textContent = '...'
      try {
        const updated = { ...emp, status: 'fired', dismissalDate, dismissalReason, dismissalOrderNum }
        await updateDoc(doc(db, ...base, 'employees', emp.id), {
          status: 'fired', dismissalDate, dismissalReason, dismissalOrderNum, updatedAt: serverTimestamp(),
        })
        invalidateRoute('payroll')
        close()
        await load()
        printDismissalOrder(updated)
      } catch (err) { btn.disabled = false; btn.textContent = 'Звільнити'; alert('Помилка: ' + err.message) }
    })
  }

  function printDismissalOrder(emp) {
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
      <style>body{font-family:Arial,sans-serif;font-size:13px;line-height:1.6;padding:30px}
      h2{text-align:center}.right{text-align:right}.center{text-align:center}
      .sign-row{margin-top:50px;display:flex;justify-content:space-between}</style></head><body>
      <p class="right">Наказ № ${emp.dismissalOrderNum || '—'}</p>
      <h2>НАКАЗ<br>про звільнення з роботи</h2>
      <p class="center">від ${fmtDateUk(emp.dismissalDate)}</p>
      <p>ЗВІЛЬНИТИ <strong>${emp.name}</strong> з посади <strong>${emp.role || '—'}</strong>
      з ${fmtDateUk(emp.dismissalDate)}.</p>
      <p>Підстава звільнення: <strong>${emp.dismissalReason || '—'}</strong></p>
      <div class="sign-row">
        <div>Директор / ФОП: _________________</div>
        <div>З наказом ознайомлений: _________________</div>
      </div>
      </body></html>`
    if (window.electron?.pdf?.generate) {
      window.electron.pdf.generate(html, `dismissal_order_${emp.dismissalOrderNum || ''}.pdf`).catch(() => {})
    } else {
      const w = window.open('', '_blank')
      if (w) { w.document.write(html); w.document.close(); w.print() }
    }
  }

  // ── Особова картка ──────────────────────────────────────────
  function openPersonalCard(emp) {
    const overlay = document.createElement('div')
    overlay.className = 'hr-overlay'
    overlay.style.display = 'flex'
    const st = STATUS[emp.status] || STATUS.active
    overlay.innerHTML = `
      <div class="hr-modal" style="width:520px">
        <div class="hr-modal-head">
          <h2>${icon('file', 16)} Особова картка: ${emp.name}</h2>
          <button id="pc-close">${icon('x', 14)}</button>
        </div>
        <div class="hr-modal-body">
          <div class="hr-form-row">
            <div class="hr-field"><label>Посада</label><div class="hr-pc-val">${emp.role || '—'}</div></div>
            <div class="hr-field"><label>Статус</label><div class="hr-pc-val" style="color:${st.color}">${st.label}</div></div>
          </div>
          <div class="hr-form-row">
            <div class="hr-field"><label>Дата народження</label><div class="hr-pc-val">${fmtDateUk(emp.birthDate)}</div></div>
            <div class="hr-field"><label>ІПН</label><div class="hr-pc-val">${emp.taxId || '—'}</div></div>
          </div>
          <div class="hr-field"><label>Паспортні дані</label><div class="hr-pc-val">${emp.passport || '—'}</div></div>
          <div class="hr-field"><label>Адреса проживання</label><div class="hr-pc-val">${emp.address || '—'}</div></div>
          <div class="hr-form-row">
            <div class="hr-field"><label>Телефон</label><div class="hr-pc-val">${emp.phone || '—'}</div></div>
            <div class="hr-field"><label>Email</label><div class="hr-pc-val">${emp.email || '—'}</div></div>
          </div>
          <div class="hr-section-label">Прийняття на роботу</div>
          <div class="hr-form-row">
            <div class="hr-field"><label>Наказ №</label><div class="hr-pc-val">${emp.hireOrderNum || '—'}</div></div>
            <div class="hr-field"><label>Дата</label><div class="hr-pc-val">${fmtDateUk(emp.hireOrderDate)}</div></div>
          </div>
          ${emp.status === 'fired' ? `
          <div class="hr-section-label">Звільнення</div>
          <div class="hr-form-row">
            <div class="hr-field"><label>Наказ №</label><div class="hr-pc-val">${emp.dismissalOrderNum || '—'}</div></div>
            <div class="hr-field"><label>Дата</label><div class="hr-pc-val">${fmtDateUk(emp.dismissalDate)}</div></div>
          </div>
          <div class="hr-field"><label>Підстава</label><div class="hr-pc-val">${emp.dismissalReason || '—'}</div></div>
          ` : ''}
        </div>
        <div class="hr-modal-foot">
          <button class="hr-btn-sec" id="pc-print-hire">🖨️ Наказ про прийняття</button>
          ${emp.status === 'fired' ? `<button class="hr-btn-sec" id="pc-print-fire">🖨️ Наказ про звільнення</button>` : ''}
          <button class="hr-btn-pri" id="pc-close-btn">Закрити</button>
        </div>
      </div>`
    document.body.appendChild(overlay)
    const close = () => overlay.remove()
    overlay.querySelector('#pc-close').addEventListener('click', close)
    overlay.querySelector('#pc-close-btn').addEventListener('click', close)
    overlay.addEventListener('click', e => { if (e.target === overlay) close() })
    overlay.querySelector('#pc-print-hire')?.addEventListener('click', () => printHireOrder(emp))
    overlay.querySelector('#pc-print-fire')?.addEventListener('click', () => printDismissalOrder(emp))
  }

  await load()
}

function injectStyles() {
  document.getElementById('hr-styles')?.remove()
  const s = document.createElement('style')
  s.id = 'hr-styles'
  s.textContent = `
    .hr-page { padding:28px 32px; }
    .hr-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; }
    .hr-title { font-family:var(--font-display); font-size:26px; font-weight:800; margin-bottom:4px; display:flex; align-items:center; gap:10px; }
    .hr-subtitle { font-size:13px; color:var(--text-muted); }
    .hr-add-btn { padding:9px 22px; background:linear-gradient(135deg,#667eea,#4F8EF7); color:#fff; border:none; border-radius:var(--radius-md); font-size:13px; font-weight:700; cursor:pointer; transition:all .15s; }
    .hr-add-btn:hover { transform:translateY(-1px); box-shadow:0 4px 14px rgba(79,142,247,.4); }
    .hr-kpi-row { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:20px; }
    @media (max-width:900px) { .hr-kpi-row { grid-template-columns:repeat(2,1fr); } }
    .hr-kpi { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-xl); padding:18px 20px; transition:border-color .2s; }
    .hr-kpi:hover { border-color:rgba(255,255,255,.12); }
    .hr-kpi-icon { display:flex; align-items:center; margin-bottom:10px; }
    .hr-kpi-val { font-family:var(--font-display); font-size:26px; font-weight:800; margin-bottom:3px; }
    .hr-kpi-label { font-size:11px; color:var(--text-muted); font-weight:600; text-transform:uppercase; letter-spacing:.05em; }
    .hr-filter-pills { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:20px; }
    .hr-pill { padding:6px 14px; border-radius:var(--radius-full); font-size:12px; font-weight:600; color:var(--text-secondary); background:var(--bg-secondary); border:1px solid var(--border); cursor:pointer; transition:all .15s; }
    .hr-pill.active { background:var(--sc,var(--accent-blue)); border-color:var(--sc,var(--accent-blue)); color:#fff; }
    .hr-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:14px; }
    .hr-card { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-xl); padding:18px; transition:all .15s; }
    .hr-card:hover { transform:translateY(-2px); box-shadow:0 8px 24px rgba(0,0,0,.2); }
    .hr-card-head { display:flex; align-items:center; gap:12px; margin-bottom:12px; }
    .hr-avatar { width:44px; height:44px; border-radius:14px; color:#fff; font-size:18px; font-weight:800; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .hr-card-info { flex:1; }
    .hr-card-name { font-size:15px; font-weight:700; }
    .hr-card-role { font-size:12px; color:var(--text-muted); }
    .hr-card-btns { display:flex; gap:4px; opacity:0; transition:opacity .15s; }
    .hr-card:hover .hr-card-btns { opacity:1; }
    .hr-cb { width:26px; height:26px; border-radius:6px; background:var(--bg-tertiary); border:1px solid var(--border); cursor:pointer; font-size:12px; display:flex; align-items:center; justify-content:center; }
    .hr-card-body { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
    .hr-status-badge { font-size:11px; font-weight:700; padding:3px 10px; border-radius:var(--radius-full); }
    .hr-salary { font-size:13px; font-weight:700; color:#34D399; margin-left:auto; }
    .hr-card-meta { display:flex; flex-direction:column; gap:4px; }
    .hr-meta-row { font-size:12px; color:var(--text-secondary); display:flex; align-items:center; gap:5px; }
    .hr-card-notes { margin-top:10px; font-size:12px; color:var(--text-muted); background:var(--bg-tertiary); border-radius:var(--radius-md); padding:8px 10px; line-height:1.5; }
    .hr-empty { text-align:center; padding:80px 32px; }
    .hr-empty-title { font-family:var(--font-display); font-size:18px; font-weight:700; margin-bottom:6px; }
    .hr-empty-desc { font-size:13px; color:var(--text-muted); margin-bottom:20px; }
    .hr-overlay { position:fixed; inset:0; background:rgba(0,0,0,.6); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; z-index:1000; }
    .hr-modal { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-xl); width:500px; max-width:95vw; box-shadow:0 24px 64px rgba(0,0,0,.4); animation:hr-in .18s ease; }
    @keyframes hr-in { from{opacity:0;transform:scale(.95)} to{opacity:1;transform:scale(1)} }
    .hr-modal-head { display:flex; justify-content:space-between; align-items:center; padding:20px 22px 0; }
    .hr-modal-head h2 { font-family:var(--font-display); font-size:18px; font-weight:800; }
    .hr-modal-head button { background:none; border:none; color:var(--text-muted); cursor:pointer; padding:4px 8px; border-radius:6px; display:flex; align-items:center; justify-content:center; }
    .hr-modal-body { padding:18px 22px; display:flex; flex-direction:column; gap:13px; }
    .hr-modal-foot { padding:14px 22px; border-top:1px solid var(--border); display:flex; gap:8px; justify-content:flex-end; }
    .hr-field label { display:block; font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.05em; margin-bottom:6px; }
    .hr-input { width:100%; box-sizing:border-box; padding:9px 13px; background:var(--bg-tertiary); border:1.5px solid var(--border); border-radius:var(--radius-md); font-size:13px; color:var(--text-primary); outline:none; font-family:inherit; transition:border-color .15s; }
    .hr-input:focus { border-color:var(--accent-blue); }
    .hr-textarea { resize:vertical; min-height:60px; }
    .hr-form-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .hr-section-label { font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.06em; margin-top:6px; padding-top:10px; border-top:1px solid var(--border); }
    .hr-pc-val { font-size:13px; color:var(--text-primary); padding:8px 0; }
    .hr-btn-pri { padding:9px 20px; background:linear-gradient(135deg,#667eea,#4F8EF7); color:#fff; border:none; border-radius:var(--radius-md); font-size:13px; font-weight:700; cursor:pointer; }
    .hr-btn-sec { padding:9px 20px; background:var(--bg-tertiary); border:1.5px solid var(--border); color:var(--text-primary); border-radius:var(--radius-md); font-size:13px; font-weight:600; cursor:pointer; }
  `
  document.head.appendChild(s)
}
