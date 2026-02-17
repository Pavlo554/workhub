// core/permissions.js
export const PLANS = {
  free: {
    label: 'FREE',
    price: 0,
    limits: {
      clients:      10,
      projects:     3,
      invoices:     5,
      storage_mb:   100,
      team_members: 1,
      pdf_export:   false,
      encryption:   false,
    }
  },
  pro: {
    label: 'PRO',
    price_monthly: 8,   // USD
    price_yearly:  70,
    limits: {
      clients:      Infinity,
      projects:     Infinity,
      invoices:     Infinity,
      storage_mb:   5000,
      team_members: 1,
      pdf_export:   true,
      encryption:   true,
    }
  },
  business: {
    label: 'BUSINESS',
    price_monthly: 20,
    price_yearly:  180,
    limits: {
      clients:      Infinity,
      projects:     Infinity,
      invoices:     Infinity,
      storage_mb:   20000,
      team_members: 5,
      pdf_export:   true,
      encryption:   true,
    }
  }
}