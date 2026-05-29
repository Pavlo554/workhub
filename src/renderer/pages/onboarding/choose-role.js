// src/renderer/pages/onboarding/choose-role.js
import { db } from '../../services/firebase.js'
import { getCurrentUser, getUserProfile, updateProfileCache } from '../../services/auth.js'
import { navigate } from '../../../core/router.js'
import { icon } from '../../utils/icons.js'
import { doc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'

export async function render(container) {
  const user    = getCurrentUser()
  const profile = await getUserProfile(user.uid)

  container.innerHTML = `
    <div class="onboarding-page">
      <div class="onboarding-content" style="max-width:680px">

        <div class="onboarding-header">
          <div class="onboarding-step">Крок 1 з 3</div>
          <h1 class="onboarding-title">Хто ви?</h1>
          <p class="onboarding-subtitle">Це допоможе налаштувати WorkHub під вашу роль</p>
        </div>

        <div class="role-grid">

          <div class="role-card" data-role="owner">
            <div class="role-card-icon">${icon('briefcase', 36)}</div>
            <div class="role-card-body">
              <div class="role-card-title">Я власник бізнесу</div>
              <div class="role-card-desc">
                Веду свій бізнес, маю клієнтів, проекти, рахунки.<br>
                Можу запрошувати команду і керувати їх доступом.
              </div>
              <div class="role-card-tags">
                <span class="role-tag">Фрілансер</span>
                <span class="role-tag">Агентство</span>
                <span class="role-tag">Студія</span>
                <span class="role-tag">ФОП</span>
              </div>
            </div>
            <div class="role-card-check">${icon('check', 11)}</div>
          </div>

          <div class="role-card" data-role="worker">
            <div class="role-card-icon">${icon('user', 36)}</div>
            <div class="role-card-body">
              <div class="role-card-title">Я учасник команди</div>
              <div class="role-card-desc">
                Працюю в компанії або студії.<br>
                Власник надасть мені доступ через код запрошення.
              </div>
              <div class="role-card-tags">
                <span class="role-tag">Розробник</span>
                <span class="role-tag">Дизайнер</span>
                <span class="role-tag">Менеджер</span>
                <span class="role-tag">Співробітник</span>
              </div>
            </div>
            <div class="role-card-check">${icon('check', 11)}</div>
          </div>

        </div>

        <div class="onboarding-footer">
          <button class="btn btn-primary" id="next-btn" disabled>Продовжити →</button>
        </div>

      </div>
    </div>
  `

  injectStyles()

  let selected = null
  const nextBtn = container.querySelector('#next-btn')

  container.querySelectorAll('.role-card').forEach(card => {
    card.addEventListener('click', () => {
      container.querySelectorAll('.role-card').forEach(c => c.classList.remove('selected'))
      card.classList.add('selected')
      selected = card.dataset.role
      nextBtn.disabled = false
    })
  })

  nextBtn.addEventListener('click', async () => {
    if (!selected) return
    nextBtn.disabled = true
    nextBtn.innerHTML = '<div class="spinner"></div>'

    try {
      const user = getCurrentUser()

      if (selected === 'owner') {
        const updates = { accountType: 'owner' }
        await updateDoc(doc(db, 'users', user.uid), updates)
        updateProfileCache(user.uid, updates)

        // Якщо вже проходив онбординг раніше — одразу на dashboard
        if (profile?.onboardingDone) {
          const { renderNavigation } = await import('../../components/navigation.js')
          const updatedProfile = { ...profile, accountType: 'owner' }
          let sidebar = document.getElementById('sidebar')
          if (!sidebar) {
            sidebar = document.createElement('div')
            sidebar.id = 'sidebar'
            document.getElementById('app').prepend(sidebar)
          }
          renderNavigation(sidebar, updatedProfile)
          navigate('dashboard')
        } else {
          navigate('choose-profession')
        }
      } else {
        // Працівник — одразу завершуємо онбординг і кидаємо на join
        await updateDoc(doc(db, 'users', user.uid), {
          accountType:    'worker',
          onboardingDone: true,
        })
        updateProfileCache(user.uid, { accountType: 'worker', onboardingDone: true })
        navigate('join')
      }
    } catch (err) {
      console.error(err)
      nextBtn.disabled = false
      nextBtn.innerHTML = 'Продовжити →'
    }
  })
}

function injectStyles() {
  if (document.getElementById('choose-role-styles')) return
  const s = document.createElement('style')
  s.id = 'choose-role-styles'
  s.textContent = `
    .role-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin: 32px 0;
    }
    @media (max-width: 600px) { .role-grid { grid-template-columns: 1fr; } }

    .role-card {
      position: relative;
      background: var(--bg-secondary);
      border: 2px solid var(--border);
      border-radius: var(--radius-xl);
      padding: 28px 24px;
      cursor: pointer;
      transition: all .2s;
    }
    .role-card:hover {
      border-color: rgba(255,255,255,.2);
      transform: translateY(-2px);
      box-shadow: var(--shadow-md);
    }
    .role-card.selected {
      border-color: var(--accent-blue);
      background: rgba(79,142,247,.07);
    }

    .role-card-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 56px; height: 56px;
      border-radius: 14px;
      background: var(--bg-tertiary);
      color: var(--accent-blue);
      margin-bottom: 18px;
    }
    .role-card.selected .role-card-icon {
      background: rgba(91,141,239,.15);
      color: var(--accent-blue);
    }
    .role-card-title {
      font-family: var(--font-display);
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 10px;
    }
    .role-card-desc {
      font-size: 13px;
      color: var(--text-secondary);
      line-height: 1.6;
      margin-bottom: 16px;
    }
    .role-card-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .role-tag {
      background: var(--bg-tertiary);
      border-radius: var(--radius-full);
      padding: 3px 10px;
      font-size: 11px;
      font-weight: 600;
      color: var(--text-secondary);
    }
    .role-card.selected .role-tag {
      background: rgba(79,142,247,.15);
      color: var(--accent-blue);
    }

    .role-card-check {
      position: absolute;
      top: 16px;
      right: 16px;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: var(--bg-tertiary);
      border: 2px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
      color: transparent;
      transition: all .2s;
    }
    .role-card.selected .role-card-check {
      background: var(--accent-blue);
      border-color: var(--accent-blue);
      color: #fff;
    }
  `
  document.head.appendChild(s)
}
