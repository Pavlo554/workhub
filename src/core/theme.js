// src/core/theme.js
const ACCENT_COLORS = {
  blue:   { hex: '#4F8EF7', dim: 'rgba(79,142,247,0.15)' },
  purple: { hex: '#A78BFA', dim: 'rgba(167,139,250,0.15)' },
  green:  { hex: '#34D399', dim: 'rgba(52,211,153,0.15)' },
  orange: { hex: '#FB923C', dim: 'rgba(251,146,60,0.15)' },
  pink:   { hex: '#F472B6', dim: 'rgba(244,114,182,0.15)' },
}

const DARK_VARS = {
  '--bg-primary':    '#0D0F14',
  '--bg-secondary':  '#151820',
  '--bg-tertiary':   '#1E2130',
  '--bg-elevated':   '#252A3D',
  '--bg-hover':      'rgba(255,255,255,0.04)',
  '--text-primary':   '#F1F5F9',
  '--text-secondary': '#94A3B8',
  '--text-muted':     '#475569',
  '--border':         'rgba(255,255,255,0.07)',
  '--shadow-sm':  '0 2px 8px rgba(0,0,0,0.4)',
  '--shadow-md':  '0 4px 20px rgba(0,0,0,0.5)',
  '--shadow-lg':  '0 8px 40px rgba(0,0,0,0.6)',
  '--shadow-xl':  '0 16px 60px rgba(0,0,0,0.7)',
}

const LIGHT_VARS = {
  '--bg-primary':    '#FFFFFF',
  '--bg-secondary':  '#F8FAFC',
  '--bg-tertiary':   '#F1F5F9',
  '--bg-elevated':   '#E2E8F0',
  '--bg-hover':      'rgba(0,0,0,0.04)',
  '--text-primary':   '#0F172A',
  '--text-secondary': '#475569',
  '--text-muted':     '#94A3B8',
  '--border':         'rgba(0,0,0,0.09)',
  '--shadow-sm':  '0 2px 8px rgba(0,0,0,0.1)',
  '--shadow-md':  '0 4px 20px rgba(0,0,0,0.12)',
  '--shadow-lg':  '0 8px 40px rgba(0,0,0,0.14)',
  '--shadow-xl':  '0 16px 60px rgba(0,0,0,0.16)',
}

export function applyTheme(themeId) {
  let resolved = themeId
  if (themeId === 'system') {
    resolved = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  }
  const vars = resolved === 'light' ? LIGHT_VARS : DARK_VARS
  const root = document.documentElement
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v)
  root.dataset.theme = resolved
}

export function applyAccent(accentId) {
  const a = ACCENT_COLORS[accentId] || ACCENT_COLORS.blue
  const root = document.documentElement
  root.style.setProperty('--accent-blue', a.hex)
  root.style.setProperty('--border-active', a.hex)
  root.style.setProperty('--accent-blue-dim', a.dim)
}

export function initTheme() {
  applyTheme(localStorage.getItem('workhub_theme')  || 'dark')
  applyAccent(localStorage.getItem('workhub_accent') || 'blue')
}

export { ACCENT_COLORS }
