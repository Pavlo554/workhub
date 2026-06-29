import { db } from '../../services/firebase.js'
import { getCurrentUser, updateProfileCache } from '../../services/auth.js'
import { navigate } from '../../../core/router.js'
import { icon } from '../../utils/icons.js'
import { doc, setDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

const PROFESSIONS = [
  { id: 'freelancer', iconName: 'laptop',     title: 'Фрілансер',        desc: 'Дизайнер, розробник, копірайтер',     color: '#4F8EF7' },
  { id: 'accountant', iconName: 'bar-chart',  title: 'Бухгалтер / ФОП',  desc: 'Бухгалтер, податковий консультант',    color: '#34D399' },
  { id: 'smm',        iconName: 'smartphone', title: 'SMM / Маркетолог',  desc: 'SMM спеціаліст, таргетолог',           color: '#A78BFA' },
  { id: 'beauty',     iconName: 'sparkles',   title: 'Салон краси',       desc: 'Майстер нігтів, перукар, косметолог', color: '#F472B6' },
]

// All selectable modules (dashboard always added, not shown)
const ALL_MODULES = [
  { id: 'clients',      label: 'Клієнти',         desc: 'База клієнтів' },
  { id: 'projects',     label: 'Проекти',         desc: 'Управління проектами' },
  { id: 'invoices',     label: 'Рахунки',         desc: 'Виставлення рахунків' },
  { id: 'contracts',    label: 'Договори',        desc: 'Шаблони договорів' },
  { id: 'tasks',        label: 'Задачі',          desc: 'Список завдань' },
  { id: 'timer',        label: 'Таймер',          desc: 'Трекінг часу' },
  { id: 'finances',     label: 'Фінанси',         desc: 'Доходи та витрати' },
  { id: 'tax-calendar', label: 'Податки',         desc: 'Календар податків' },
  { id: 'payment-calendar', label: 'Календар платежів', desc: 'Усі майбутні оплати в одному списку' },
  { id: 'reports', label: 'Аналітика бізнесу', desc: 'Дохід, клієнти, задачі — все в одному місці' },
  { id: 'tax-reports', label: 'Звіти', desc: 'Дохід, витрати та рахунки за період для звітності' },
  { id: 'appointments', label: 'Розклад',         desc: 'Записи клієнтів' },
  { id: 'services',     label: 'Послуги',         desc: 'Каталог послуг' },
  { id: 'content-plan', label: 'Контент-план',    desc: 'Планування постів' },
  { id: 'accounts',     label: 'Акаунти',         desc: 'Соцмережі та сайти' },
  { id: 'passwords',    label: 'Паролі',          desc: 'Сховище паролів' },
  { id: 'notes',        label: 'Нотатки',         desc: 'Нотатки та ідеї' },
  { id: 'documents',    label: 'Документи',       desc: 'Файли та документи' },
  { id: 'api-keys',     label: 'API & Інтеграції', desc: 'Ключі та підключення' },
]

// Default modules per profession (without 'dashboard')
const DEFAULTS = {
  freelancer: ['clients','projects','invoices','contracts','tasks','timer','payment-calendar','reports','passwords','notes'],
  accountant: ['clients','finances','invoices','contracts','tax-calendar','payment-calendar','reports','tax-reports','passwords','notes'],
  smm:        ['clients','content-plan','accounts','tasks','reports','passwords','notes'],
  beauty:     ['clients','appointments','services','finances','payment-calendar','reports','notes'],
}

export async function render(container) {
  // Inject styles
  if (!document.getElementById('ob-prof-styles')) {
    const s = document.createElement('style')
    s.id = 'ob-prof-styles'
    s.textContent = `
      .ob-steps { display:flex; gap:8px; justify-content:center; margin-bottom:28px; }
      .ob-step-dot {
        width:32px; height:6px; border-radius:3px;
        background: rgba(255,255,255,.12);
        transition: background .3s;
      }
      .ob-step-dot.active { background: #4F8EF7; }

      .profession-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        margin-bottom: 24px;
      }
      .profession-card {
        background: var(--bg-secondary, #1A1D2E);
        border: 1.5px solid var(--border, rgba(255,255,255,.08));
        border-radius: 14px;
        padding: 18px 16px;
        cursor: pointer;
        position: relative;
        transition: border-color .2s, transform .15s, box-shadow .15s;
      }
      .profession-card:hover {
        border-color: var(--prof-color);
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(0,0,0,.25);
      }
      .profession-card.selected {
        border-color: var(--prof-color);
        background: color-mix(in srgb, var(--prof-color) 8%, var(--bg-secondary, #1A1D2E));
      }
      .prof-card-icon { display:flex; align-items:center; justify-content:center; width:52px; height:52px; border-radius:12px; background:color-mix(in srgb,var(--prof-color) 12%,var(--bg-tertiary)); margin-bottom:14px; }
      .prof-card-title { font-size: 15px; font-weight: 700; color: var(--text-primary, #F1F5F9); margin-bottom: 4px; }
      .prof-card-desc  { font-size: 12px; color: var(--text-secondary, #94A3B8); }
      .prof-card-check {
        position: absolute; top: 12px; right: 12px;
        width: 22px; height: 22px;
        border-radius: 50%;
        background: var(--prof-color);
        color: #fff;
        display: flex; align-items: center; justify-content: center;
        opacity: 0;
        transform: scale(.5);
        transition: opacity .2s, transform .2s;
      }
      .profession-card.selected .prof-card-check { opacity: 1; transform: scale(1); }

      /* Modules step */
      .ob-modules-section { display: none; }
      .ob-modules-section.visible { display: block; }

      .ob-modules-header {
        display: flex; align-items: center; justify-content: space-between;
        margin-bottom: 14px;
      }
      .ob-modules-title {
        font-size: 15px; font-weight: 700;
        color: var(--text-primary, #F1F5F9);
      }
      .ob-modules-hint {
        font-size: 12px; color: var(--text-secondary, #94A3B8);
      }

      .ob-mod-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
        margin-bottom: 24px;
      }
      .ob-mod-card {
        background: var(--bg-secondary, #1A1D2E);
        border: 1.5px solid var(--border, rgba(255,255,255,.08));
        border-radius: 12px;
        padding: 12px 10px;
        cursor: pointer;
        transition: border-color .2s, transform .1s;
        user-select: none;
      }
      .ob-mod-card:hover { border-color: rgba(255,255,255,.2); transform: translateY(-1px); }
      .ob-mod-card.checked {
        border-color: var(--mod-color, #4F8EF7);
        background: color-mix(in srgb, var(--mod-color, #4F8EF7) 8%, var(--bg-secondary, #1A1D2E));
      }
      .ob-mod-icon { display:flex; align-items:center; margin-bottom:6px; color:var(--mod-color,#4F8EF7); }
      .ob-mod-label { font-size: 12px; font-weight: 600; color: var(--text-primary, #F1F5F9); margin-bottom: 2px; }
      .ob-mod-desc  { font-size: 11px; color: var(--text-secondary, #94A3B8); }
      .ob-mod-chk {
        flex-shrink: 0;
        width: 16px; height: 16px;
        border-radius: 50%;
        background: var(--mod-color, #4F8EF7);
        color: #fff;
        display: flex; align-items: center; justify-content: center;
        opacity: 0;
        transition: opacity .15s;
      }
      .ob-mod-card.checked .ob-mod-chk { opacity: 1; }

      .ob-select-all {
        font-size: 12px; color: #4F8EF7;
        background: none; border: none; cursor: pointer; padding: 0;
        text-decoration: underline; text-underline-offset: 2px;
      }
    `
    document.head.appendChild(s)
  }

  let selectedProfession = null
  let selectedModules    = new Set()

  container.innerHTML = `
    <div class="onboarding-page">
      <div class="onboarding-content">
        <div class="ob-steps">
          <div class="ob-step-dot active" id="dot-1"></div>
          <div class="ob-step-dot active"></div>
          <div class="ob-step-dot" id="dot-3"></div>
        </div>
        <div class="onboarding-header">
          <div class="onboarding-step" id="step-label">Крок 2 з 3</div>
          <h1 class="onboarding-title" id="step-title">Оберіть свою сферу</h1>
          <p class="onboarding-subtitle" id="step-sub">WorkHub автоматично налаштує потрібні інструменти під вашу роботу</p>
        </div>

        <!-- Step 1: profession -->
        <div id="step-professions">
          <div class="profession-grid">
            ${PROFESSIONS.map(p => `
              <div class="profession-card" data-id="${p.id}" style="--prof-color:${p.color}">
                <div class="prof-card-icon" style="color:${p.color}">${icon(p.iconName, 32)}</div>
                <div class="prof-card-body">
                  <div class="prof-card-title">${p.title}</div>
                  <div class="prof-card-desc">${p.desc}</div>
                </div>
                <div class="prof-card-check">${icon('check', 10)}</div>
              </div>
            `).join('')}
          </div>
          <div class="onboarding-footer">
            <button class="btn btn-secondary" id="back-btn">← Назад</button>
            <button class="btn btn-primary" id="next-prof-btn" disabled>Далі →</button>
          </div>
        </div>

        <!-- Step 2: modules -->
        <div id="step-modules" style="display:none">
          <div class="ob-modules-header">
            <div class="ob-modules-title">Обери модулі для роботи</div>
            <button class="ob-select-all" id="toggle-all-btn">Вибрати всі</button>
          </div>
          <div class="ob-mod-grid" id="mod-grid"></div>
          <div class="ob-mod-empty-hint" id="mod-empty-hint" style="display:none;color:#F87171;font-size:12px;margin-bottom:12px">
            Оберіть хоча б один модуль — інакше в робочому просторі не буде з чим працювати
          </div>
          <div class="onboarding-footer">
            <button class="btn btn-secondary" id="back-modules-btn">← Назад</button>
            <button class="btn btn-primary" id="next-modules-btn">Продовжити →</button>
          </div>
        </div>
      </div>
    </div>
  `

  const stepLabel    = container.querySelector('#step-label')
  const stepTitle    = container.querySelector('#step-title')
  const stepSub      = container.querySelector('#step-sub')
  const dot3         = container.querySelector('#dot-3')
  const stepProf     = container.querySelector('#step-professions')
  const stepMods     = container.querySelector('#step-modules')
  const nextProfBtn  = container.querySelector('#next-prof-btn')
  const modGrid      = container.querySelector('#mod-grid')

  // ── Step 1: profession selection ────────────────────────
  container.querySelectorAll('.profession-card').forEach(card => {
    card.addEventListener('click', () => {
      container.querySelectorAll('.profession-card').forEach(c => c.classList.remove('selected'))
      card.classList.add('selected')
      selectedProfession = card.dataset.id
      nextProfBtn.disabled = false
    })
  })

  container.querySelector('#back-btn').addEventListener('click', () => navigate('choose-role'))

  nextProfBtn.addEventListener('click', () => {
    if (!selectedProfession) return
    // Pre-select default modules for this profession
    selectedModules = new Set(DEFAULTS[selectedProfession] || [])
    renderModuleGrid()
    // Switch to step 2
    stepProf.style.display = 'none'
    stepMods.style.display = 'block'
    dot3.classList.add('active')
    stepLabel.textContent = 'Крок 3 з 3'
    stepTitle.textContent = 'Налаштуй модулі'
    stepSub.textContent   = 'Вибери які розділи хочеш бачити у своєму робочому просторі'
  })

  // ── Step 2: module selection ────────────────────────────
  function renderModuleGrid() {
    const prof = PROFESSIONS.find(p => p.id === selectedProfession)
    const color = prof?.color || '#4F8EF7'

    modGrid.innerHTML = ALL_MODULES.map(m => {
      const checked = selectedModules.has(m.id)
      return `
        <div class="ob-mod-card${checked?' checked':''}" data-mod="${m.id}" style="--mod-color:${color}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div class="ob-mod-icon">${icon(m.id, 18)}</div>
            <div class="ob-mod-chk">${icon('check', 8)}</div>
          </div>
          <div class="ob-mod-label">${m.label}</div>
          <div class="ob-mod-desc">${m.desc}</div>
        </div>`
    }).join('')

    // Bind module toggle clicks
    modGrid.querySelectorAll('.ob-mod-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.mod
        if (selectedModules.has(id)) {
          selectedModules.delete(id)
          card.classList.remove('checked')
        } else {
          selectedModules.add(id)
          card.classList.add('checked')
        }
        if (selectedModules.size > 0) {
          const hint = container.querySelector('#mod-empty-hint')
          if (hint) hint.style.display = 'none'
        }
      })
    })
  }

  // Toggle all
  let allSelected = false
  container.querySelector('#toggle-all-btn').addEventListener('click', () => {
    allSelected = !allSelected
    if (allSelected) {
      ALL_MODULES.forEach(m => selectedModules.add(m.id))
      container.querySelector('#toggle-all-btn').textContent = 'Зняти всі'
    } else {
      selectedModules = new Set(DEFAULTS[selectedProfession] || [])
      container.querySelector('#toggle-all-btn').textContent = 'Вибрати всі'
    }
    renderModuleGrid()
  })

  // Back from modules → profession
  container.querySelector('#back-modules-btn').addEventListener('click', () => {
    stepMods.style.display = 'none'
    stepProf.style.display = 'block'
    dot3.classList.remove('active')
    stepLabel.textContent = 'Крок 2 з 3'
    stepTitle.textContent = 'Оберіть свою сферу'
    stepSub.textContent   = 'WorkHub автоматично налаштує потрібні інструменти під вашу роботу'
  })

  // Save and continue
  container.querySelector('#next-modules-btn').addEventListener('click', () => {
    if (selectedModules.size === 0) {
      container.querySelector('#mod-empty-hint').style.display = 'block'
      return
    }
    const btn = container.querySelector('#next-modules-btn')
    btn.disabled = true
    btn.innerHTML = '<div class="spinner"></div>'

    const user    = getCurrentUser()
    const modules = ['dashboard', ...Array.from(selectedModules)]

    // Оновлюємо кеш і переходимо одразу — без очікування Firestore
    updateProfileCache(user.uid, { profession: selectedProfession, selectedModules: modules })
    navigate('setup-business')

    // Фоновий запис у Firestore
    setDoc(doc(db, 'users', user.uid), {
      profession:      selectedProfession,
      selectedModules: modules,
    }, { merge: true }).catch(err => console.error('[choose-profession] save error:', err))
  })
}
