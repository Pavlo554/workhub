// src/core/profession-config.js
export const PROFESSIONS = {
  freelancer: {
    id: 'freelancer', label: 'Фрілансер', icon: '💻', color: '#4F8EF7',
    modules: ['dashboard','clients','projects','invoices','contracts','tasks','timer','kanban','portfolio','templates','passwords','notes','documents','reports','support'],
    quickActions: [
      { label: 'Новий клієнт',  icon: '👤', action: 'new-client' },
      { label: 'Новий рахунок', icon: '📄', action: 'new-invoice' },
      { label: 'Старт таймера', icon: '⏱', action: 'start-timer' },
    ],
    dashboardWidgets: ['active-projects','unpaid-invoices','time-today','recent-clients'],
  },
  accountant: {
    id: 'accountant', label: 'Бухгалтер / ФОП', icon: '📊', color: '#34D399',
    modules: ['dashboard','clients','invoices','contracts','tax-calendar','client-analytics','currency','templates','passwords','notes','documents','reports','support'],
    quickActions: [
      { label: 'Новий клієнт',    icon: '👤', action: 'new-client' },
      { label: 'Нова транзакція', icon: '💰', action: 'new-transaction' },
      { label: 'Зап PDF',         icon: '📄', action: 'new-invoice' },
    ],
    dashboardWidgets: ['monthly-income','upcoming-taxes','client-count','recent-clients'],
  },
  smm: {
    id: 'smm', label: 'SMM / Маркетолог', icon: '📱', color: '#A78BFA',
    modules: ['dashboard','clients','content-plan','accounts','tasks','kanban','client-analytics','templates','passwords','notes','reports','support'],
    quickActions: [
      { label: 'Новий пост',    icon: '✏️', action: 'new-post' },
      { label: 'Новий клієнт', icon: '👤', action: 'new-client' },
    ],
    dashboardWidgets: ['posts-today','total-budget','content-calendar','recent-clients'],
  },
  beauty: {
    id: 'beauty', label: 'Салон краси', icon: '💅', color: '#F472B6',
    modules: ['dashboard','clients','appointments','services','finances','warehouse','hr','client-analytics','notes','reports','support'],
    quickActions: [
      { label: 'Новий запис',   icon: '📅', action: 'new-appointment' },
      { label: 'Новий клієнт', icon: '👤', action: 'new-client' },
    ],
    dashboardWidgets: ['today-appointments','daily-revenue','new-clients','recent-clients'],
  },
}

export function getProfessionConfig(id) {
  return PROFESSIONS[id] || PROFESSIONS.freelancer
}

export function hasModule(professionId, moduleId) {
  return PROFESSIONS[professionId]?.modules.includes(moduleId) ?? false
}