// src/renderer/pages/onboarding/choose-profession.js
import { db } from '../../services/firebase.js'
import { getCurrentUser } from '../../services/auth.js'
import { navigate } from '../../../core/router.js'
// import { doc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
import { doc, setDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'


const PROFESSIONS = [
  { id: 'freelancer', icon: '💻', title: 'Фрілансер',       desc: 'Дизайнер, розробник, копірайтер',      color: '#4F8EF7', modules: ['Клієнти','Проекти','Рахунки','Договори','Таймер'] },
  { id: 'accountant', icon: '📊', title: 'Бухгалтер / ФОП', desc: 'Бухгалтер, податковий консультант',     color: '#34D399', modules: ['Клієнти','Фінанси','Рахунки','Податки'] },
  { id: 'smm',        icon: '📱', title: 'SMM / Маркетолог', desc: 'SMM спеціаліст, таргетолог',           color: '#A78BFA', modules: ['Клієнти','Контент-план','Акаунти','Бюджети'] },
  { id: 'beauty',     icon: '💅', title: 'Салон краси',      desc: 'Майстер нігтів, перукар, косметолог',  color: '#F472B6', modules: ['Клієнти','Записи','Послуги','Каса'] },
]

export async function render(container) {
  container.innerHTML = `
    <div class="onboarding-page">
      <div class="onboarding-content">
        <div class="onboarding-header">
          <div class="onboarding-step">Крок 2 з 3</div>
          <h1 class="onboarding-title">Оберіть свою сферу</h1>
          <p class="onboarding-subtitle">WorkHub автоматично налаштує потрібні інструменти під вашу роботу</p>
        </div>

        <div class="profession-grid">
          ${PROFESSIONS.map(p => `
            <div class="profession-card" data-id="${p.id}" style="--prof-color:${p.color}">
              <div class="prof-card-icon">${p.icon}</div>
              <div class="prof-card-body">
                <div class="prof-card-title">${p.title}</div>
                <div class="prof-card-desc">${p.desc}</div>
                <div class="prof-card-modules">
                  ${p.modules.map(m => `<span class="prof-module-tag">${m}</span>`).join('')}
                </div>
              </div>
              <div class="prof-card-check">✓</div>
            </div>
          `).join('')}
        </div>

        <div class="onboarding-footer">
          <button class="btn btn-primary" id="next-btn" disabled>Продовжити →</button>
        </div>
      </div>
    </div>
  `

  let selected = null
  const nextBtn = container.querySelector('#next-btn')

  container.querySelectorAll('.profession-card').forEach(card => {
    card.addEventListener('click', () => {
      container.querySelectorAll('.profession-card').forEach(c => c.classList.remove('selected'))
      card.classList.add('selected')
      selected = card.dataset.id
      nextBtn.disabled = false
    })
  })

  nextBtn.addEventListener('click', async () => {
    if (!selected) return
    nextBtn.disabled = true
    nextBtn.innerHTML = '<div class="spinner"></div> Зберігаємо...'
    try {
      const user = getCurrentUser()
      await setDoc(doc(db, 'users', user.uid), { profession: selected }, { merge: true })
      navigate('setup-business')
    } catch (err) {
      console.error(err)
      nextBtn.disabled = false
      nextBtn.innerHTML = 'Продовжити →'
    }
  })
}