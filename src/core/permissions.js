// core/permissions.js — єдине джерело лімітів планів
// plan-guard.js і subscribe page мають відповідати цим значенням
export const PLANS = {
  free: {
    label: 'FREE',
    price: 0,
    limits: {
      clients:          50,
      projects:         10,
      invoices_monthly: 20,
      passwords:        30,
      storage_mb:       500,
      team_members:     1,
      pdf_export:       false,
      encryption:       false,
    }
  },
  pro: {
    label: 'PRO',
    price_monthly: 299,
    limits: {
      clients:          Infinity,
      projects:         Infinity,
      invoices_monthly: Infinity,
      passwords:        Infinity,
      storage_mb:       5000,
      team_members:     1,
      pdf_export:       true,
      encryption:       true,
    }
  },
  business: {
    label: 'BUSINESS',
    price_monthly: 799,
    limits: {
      clients:          Infinity,
      projects:         Infinity,
      invoices_monthly: Infinity,
      passwords:        Infinity,
      storage_mb:       20000,
      team_members:     5,
      pdf_export:       true,
      encryption:       true,
    }
  }
}

/** Повертає ліміт для плану і ресурсу. Infinity = немає ліміту */
export function getPlanLimit(plan, resource) {
  return PLANS[plan]?.limits?.[resource] ?? PLANS.free.limits[resource] ?? Infinity
}

/** true якщо функція доступна для плану */
export function planHasFeature(plan, feature) {
  return !!PLANS[plan]?.limits?.[feature]
}

// setMonth() overflows on month-end dates (Jan 31 + 1mo → Mar 3 instead of Feb 28).
// Clamp to the last day of the target month instead.
export function addMonths(date, months) {
  const d   = new Date(date)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, lastDay))
  return d
}
