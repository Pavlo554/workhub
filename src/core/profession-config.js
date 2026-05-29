// src/core/profession-config.js
export const PROFESSIONS = {
  freelancer: {
    id: 'freelancer', label: 'Фрілансер', iconName: 'laptop', color: '#4F8EF7',
    modules: ['dashboard','clients','projects','invoices','contracts','tasks','timer','kanban','portfolio','templates','passwords','notes','documents','reports','support'],
    quickActions: [
      { label: 'Новий клієнт',  iconName: 'user',     action: 'new-client' },
      { label: 'Новий рахунок', iconName: 'invoices', action: 'new-invoice' },
      { label: 'Старт таймера', iconName: 'timer',    action: 'start-timer' },
    ],
    dashboardWidgets: ['active-projects','unpaid-invoices','time-today','recent-clients'],
  },
  accountant: {
    id: 'accountant', label: 'Бухгалтер / ФОП', iconName: 'bar-chart', color: '#34D399',
    modules: ['dashboard','clients','invoices','contracts','tax-calendar','currency','templates','passwords','notes','documents','reports','support'],
    quickActions: [
      { label: 'Новий клієнт',    iconName: 'user',     action: 'new-client' },
      { label: 'Нова транзакція', iconName: 'finances', action: 'new-transaction' },
      { label: 'Нова відомість',  iconName: 'invoices', action: 'new-invoice' },
    ],
    dashboardWidgets: ['monthly-income','upcoming-taxes','client-count','recent-clients'],
  },
  smm: {
    id: 'smm', label: 'SMM / Маркетолог', iconName: 'smartphone', color: '#A78BFA',
    modules: ['dashboard','clients','content-plan','accounts','tasks','kanban','templates','passwords','notes','reports','support'],
    quickActions: [
      { label: 'Новий пост',    iconName: 'pencil',  action: 'new-post' },
      { label: 'Новий клієнт', iconName: 'user',    action: 'new-client' },
    ],
    dashboardWidgets: ['posts-today','total-budget','content-calendar','recent-clients'],
  },
  beauty: {
    id: 'beauty', label: 'Салон краси', iconName: 'sparkles', color: '#F472B6',
    modules: ['dashboard','clients','appointments','services','finances','warehouse','hr','notes','reports','support'],
    quickActions: [
      { label: 'Новий запис',   iconName: 'appointments', action: 'new-appointment' },
      { label: 'Новий клієнт', iconName: 'user',          action: 'new-client' },
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