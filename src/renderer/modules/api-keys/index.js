// src/renderer/modules/api-keys/index.js
import { db } from '../../services/firebase.js'
import { getCurrentUser, getActivePathSegments } from '../../services/auth.js'
import {
  collection, addDoc, getDocs, deleteDoc,
  doc, updateDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
import { icon } from '../../utils/icons.js'

// ── Categories ────────────────────────────────────────────────────────────────
const CAT_META = {
  social:  { iconName: 'smartphone',   label: 'Соцмережі',  color: '#A78BFA' },
  bot:     { iconName: 'cpu',          label: 'Боти',        color: '#34D399' },
  payment: { iconName: 'credit-card',  label: 'Платежі',     color: '#F59E0B' },
  service: { iconName: 'settings',     label: 'Сервіси',    color: '#4F8EF7' },
  ai:      { iconName: 'zap',          label: 'AI / ML',     color: '#F472B6' },
  other:   { iconName: 'passwords',    label: 'Інше',        color: '#6B7280' },
}

// ── Known services with icon names ────────────────────────────────────────────
const SERVICE_ICON_NAMES = {
  'telegram':   'send',          'instagram':  'instagram',
  'facebook':   'globe',         'tiktok':     'smartphone',
  'youtube':    'monitor',       'twitter':    'send',
  'linkedin':   'briefcase',     'stripe':     'credit-card',
  'paypal':     'credit-card',   'openai':     'cpu',
  'anthropic':  'cpu',           'google':     'search',
  'firebase':   'zap',           'aws':        'building',
  'vercel':     'monitor',       'github':     'cpu',
  'notion':     'notes',         'slack':      'message-circle',
  'discord':    'message-circle','twilio':     'phone',
  'sendgrid':   'mail',          'mailchimp':  'mail',
}

function getServiceIcon(name, size = 24) {
  const key = (name || '').toLowerCase()
  for (const [k, v] of Object.entries(SERVICE_ICON_NAMES)) {
    if (key.includes(k)) return icon(v, size)
  }
  return icon('passwords', size)
}

// ── Env badge ─────────────────────────────────────────────────────────────────
const ENV_META = {
  prod:    { label: 'PROD',    color: '#EF4444', bg: 'rgba(239,68,68,.15)'    },
  staging: { label: 'STAGING', color: '#F59E0B', bg: 'rgba(245,158,11,.15)'  },
  dev:     { label: 'DEV',     color: '#34D399', bg: 'rgba(52,211,153,.15)'   },
  test:    { label: 'TEST',    color: '#94A3B8', bg: 'rgba(148,163,184,.15)'  },
}

function escHtml(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}
function maskKey(k) {
  if (!k || k.length < 8) return '••••••••'
  return k.slice(0,4) + '••••••••' + k.slice(-4)
}
function fmtDate(val) {
  if (!val) return '—'
  const d = val?.toDate ? val.toDate() : new Date(val)
  if (isNaN(d)) return '—'
  return d.toLocaleDateString('uk-UA', { day:'2-digit', month:'short', year:'numeric' })
}

// ── Styles ────────────────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('ak-styles')) return
  const s = document.createElement('style')
  s.id = 'ak-styles'
  s.textContent = `
    .ak-layout {
      display: flex; height: 100%; overflow: hidden;
      background: var(--bg-primary, #0F1117); font-family: inherit;
    }
    .ak-left {
      flex: 1; min-width: 0; display: flex; flex-direction: column;
      overflow: hidden; border-right: 1px solid var(--border, rgba(255,255,255,.08));
    }
    .ak-left-scroll {
      flex: 1; overflow-y: auto; padding: 0 20px 24px;
    }
    .ak-left-scroll::-webkit-scrollbar { width: 4px; }
    .ak-left-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,.12); border-radius: 2px; }

    /* Header */
    .ak-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 12px; padding: 24px 20px 16px; flex-shrink: 0;
    }
    .ak-title { font-size: 22px; font-weight: 700; color: var(--text-primary,#F1F5F9); margin: 0 0 4px; }
    .ak-sub   { font-size: 13px; color: var(--text-secondary,#94A3B8); margin: 0; }

    /* Tabs */
    .ak-tabs {
      display: flex; gap: 0; padding: 0 20px; margin-bottom: 4px; flex-shrink: 0;
      border-bottom: 1px solid var(--border, rgba(255,255,255,.08));
    }
    .ak-tab {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 10px 18px; font-size: 13px; font-weight: 600;
      color: var(--text-secondary,#94A3B8); border: none; background: none;
      cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px;
      transition: all .15s;
    }
    .ak-tab.active { color: #4F8EF7; border-bottom-color: #4F8EF7; }
    .ak-tab:hover:not(.active) { color: var(--text-primary,#F1F5F9); }

    /* Add button */
    .ak-btn-add {
      display: flex; align-items: center; gap: 6px;
      padding: 9px 16px; background: #4F8EF7; color: #fff;
      border: none; border-radius: 10px; font-size: 13px; font-weight: 600;
      cursor: pointer; white-space: nowrap; transition: background .15s, transform .1s;
    }
    .ak-btn-add:hover { background: #3B7DE8; transform: translateY(-1px); }

    /* Stats */
    .ak-stats {
      display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 20px;
    }
    .ak-stat {
      background: var(--bg-secondary,#1A1D2E);
      border: 1px solid var(--border,rgba(255,255,255,.08));
      border-radius: 12px; padding: 12px 14px;
      border-left: 4px solid var(--sc,#4F8EF7);
    }
    .ak-stat-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--sc,#4F8EF7); margin-bottom: 4px; }
    .ak-stat-val   { font-size: 20px; font-weight: 700; color: var(--text-primary,#F1F5F9); }

    /* Search + filters */
    .ak-toolbar { display: flex; gap: 10px; margin-bottom: 12px; }
    .ak-search {
      flex: 1; padding: 8px 12px;
      background: var(--bg-secondary,#1A1D2E);
      border: 1px solid var(--border,rgba(255,255,255,.08));
      border-radius: 10px; color: var(--text-primary,#F1F5F9);
      font-size: 13px; outline: none;
    }
    .ak-search:focus { border-color: #4F8EF7; }
    .ak-filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
    .ak-pill {
      padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;
      border: 1px solid var(--border,rgba(255,255,255,.08));
      background: var(--bg-secondary,#1A1D2E);
      color: var(--text-secondary,#94A3B8); cursor: pointer; transition: all .15s;
    }
    .ak-pill.active { background: rgba(79,142,247,.15); border-color: #4F8EF7; color: #4F8EF7; }

    /* API Key cards */
    .ak-list { display: flex; flex-direction: column; gap: 8px; }
    .ak-card {
      background: var(--bg-secondary,#1A1D2E);
      border: 1px solid var(--border,rgba(255,255,255,.08));
      border-radius: 12px; padding: 12px 14px;
      cursor: pointer; display: flex; align-items: center; gap: 12px;
      border-left: 4px solid var(--cc,#4F8EF7);
      transition: background .15s, transform .1s;
    }
    .ak-card:hover { background: rgba(255,255,255,.03); transform: translateX(2px); }
    .ak-card.selected { background: rgba(79,142,247,.06); }
    .ak-card-icon { display:flex; align-items:center; justify-content:center; flex-shrink: 0; width: 34px; height: 34px; border-radius:8px; background:var(--bg-tertiary,rgba(255,255,255,.04)); color:var(--cc,#4F8EF7); }
    .ak-card-info { flex: 1; min-width: 0; }
    .ak-card-name { font-size: 13px; font-weight: 600; color: var(--text-primary,#F1F5F9); margin-bottom: 3px; white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
    .ak-card-key  { font-size: 11px; color: var(--text-secondary,#94A3B8); font-family: monospace; }
    .ak-card-badges { display: flex; gap: 5px; flex-shrink: 0; align-items: center; }
    .ak-env-badge {
      padding: 2px 7px; border-radius: 20px; font-size: 10px; font-weight: 700;
      white-space: nowrap;
    }
    .ak-cat-badge {
      padding: 2px 7px; border-radius: 20px; font-size: 10px; font-weight: 600;
      white-space: nowrap;
    }

    /* Integrations */
    .ak-int-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 12px;
    }
    .ak-int-card {
      background: var(--bg-secondary,#1A1D2E);
      border: 1px solid var(--border,rgba(255,255,255,.08));
      border-radius: 14px; padding: 16px;
      cursor: pointer; transition: all .15s;
      display: flex; flex-direction: column; gap: 10px;
      position: relative;
    }
    .ak-int-card:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,.25); }
    .ak-int-card.connected { border-color: rgba(52,211,153,.3); }
    .ak-int-icon { display:flex; align-items:center; justify-content:center; width:48px; height:48px; border-radius:12px; background:var(--bg-tertiary,rgba(255,255,255,.04)); color:var(--text-primary,#F1F5F9); }
    .ak-int-name { font-size: 14px; font-weight: 700; color: var(--text-primary,#F1F5F9); }
    .ak-int-desc { font-size: 11px; color: var(--text-secondary,#94A3B8); line-height: 1.4; }
    .ak-int-status {
      display: inline-flex; align-items: center; gap: 5px;
      font-size: 11px; font-weight: 600;
    }
    .ak-int-dot {
      width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
    }
    .ak-int-btn {
      padding: 6px 12px; border-radius: 8px; border: none;
      font-size: 12px; font-weight: 600; cursor: pointer; transition: all .15s;
      margin-top: auto;
    }
    .ak-int-btn-connect { background: rgba(79,142,247,.15); color: #4F8EF7; }
    .ak-int-btn-connect:hover { background: rgba(79,142,247,.25); }
    .ak-int-btn-view { background: rgba(52,211,153,.15); color: #34D399; }
    .ak-int-btn-view:hover { background: rgba(52,211,153,.25); }

    /* Integration data panel */
    .ak-int-data {
      background: var(--bg-secondary,#1A1D2E);
      border: 1px solid var(--border,rgba(255,255,255,.08));
      border-radius: 14px; padding: 16px; margin-top: 16px;
    }
    .ak-int-data-header { font-size: 13px; font-weight: 700; color: var(--text-primary,#F1F5F9); margin-bottom: 12px; }
    .ak-int-metric {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 0; border-bottom: 1px solid var(--border,rgba(255,255,255,.06));
    }
    .ak-int-metric:last-child { border-bottom: none; }
    .ak-int-metric-label { font-size: 12px; color: var(--text-secondary,#94A3B8); }
    .ak-int-metric-val { font-size: 14px; font-weight: 700; color: var(--text-primary,#F1F5F9); }

    /* Empty */
    .ak-empty { text-align: center; padding: 48px 20px; color: var(--text-secondary,#94A3B8); }
    .ak-empty-icon { display:flex; justify-content:center; margin-bottom: 12px; opacity: .4; color:var(--text-secondary,#94A3B8); }

    /* Right panel */
    .ak-right {
      width: 360px; flex-shrink: 0; display: flex; flex-direction: column;
      background: var(--bg-primary,#0F1117); overflow: hidden;
    }
    .ak-right-scroll { flex: 1; overflow-y: auto; padding: 24px 20px; }
    .ak-right-scroll::-webkit-scrollbar { width: 4px; }
    .ak-right-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,.12); border-radius: 2px; }
    .ak-right-empty {
      flex: 1; display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 12px; padding: 24px;
      color: var(--text-secondary,#94A3B8); text-align: center;
    }
    .ak-right-empty-icon { display:flex; justify-content:center; opacity: .3; color:var(--text-secondary,#94A3B8); margin-bottom:8px; }

    /* Detail */
    .ak-d-close {
      float: right; width: 28px; height: 28px; border-radius: 8px; border: none;
      background: rgba(255,255,255,.06); color: var(--text-secondary,#94A3B8);
      font-size: 15px; cursor: pointer; display: flex; align-items: center; justify-content: center;
    }
    .ak-d-close:hover { background: rgba(255,255,255,.12); }
    .ak-d-service-box {
      display: flex; flex-direction: column; align-items: center;
      margin-bottom: 20px; padding: 16px;
      background: var(--bg-secondary,#1A1D2E); border-radius: 14px;
      border: 1px solid var(--border,rgba(255,255,255,.08));
    }
    .ak-d-service-icon { display:flex; align-items:center; justify-content:center; width:60px; height:60px; border-radius:14px; background:var(--bg-tertiary,rgba(255,255,255,.04)); color:var(--text-secondary,#94A3B8); margin:0 auto 12px; }
    .ak-d-service-name { font-size: 16px; font-weight: 700; color: var(--text-primary,#F1F5F9); margin-bottom: 6px; }

    .ak-d-field {
      background: var(--bg-secondary,#1A1D2E);
      border: 1px solid var(--border,rgba(255,255,255,.08));
      border-radius: 10px; padding: 10px 12px; margin-bottom: 8px;
    }
    .ak-d-field-label { font-size: 11px; color: var(--text-secondary,#94A3B8); margin-bottom: 4px; }
    .ak-d-field-row { display: flex; align-items: center; gap: 8px; }
    .ak-d-field-value {
      flex: 1; font-size: 12px; font-weight: 500; color: var(--text-primary,#F1F5F9);
      font-family: monospace; word-break: break-all; min-width: 0;
    }
    .ak-d-copy, .ak-d-toggle {
      width: 26px; height: 26px; border-radius: 6px; border: none; flex-shrink: 0;
      background: rgba(255,255,255,.06); color: var(--text-secondary,#94A3B8);
      font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center;
      transition: all .12s;
    }
    .ak-d-copy:hover, .ak-d-toggle:hover { background: rgba(255,255,255,.14); color: #fff; }

    .ak-d-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; }
    .ak-d-btn { padding: 10px 14px; border-radius: 10px; border: none; font-size: 13px; font-weight: 600; cursor: pointer; transition: all .15s; display: flex; align-items: center; justify-content: center; gap: 6px; }
    .ak-d-btn-edit   { background: rgba(79,142,247,.15); color: #4F8EF7; }
    .ak-d-btn-edit:hover { background: rgba(79,142,247,.25); }
    .ak-d-btn-delete { background: rgba(239,68,68,.12); color: #EF4444; }
    .ak-d-btn-delete:hover { background: rgba(239,68,68,.22); }

    /* Modal */
    .ak-modal-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,.55);
      display: flex; align-items: center; justify-content: center; z-index: 1000;
    }
    .ak-modal {
      background: var(--bg-secondary,#1A1D2E);
      border: 1px solid var(--border,rgba(255,255,255,.08));
      border-radius: 16px; padding: 28px; width: 460px;
      max-width: 95vw; max-height: 85vh; overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0,0,0,.5);
    }
    .ak-modal::-webkit-scrollbar { width: 4px; }
    .ak-modal::-webkit-scrollbar-thumb { background: rgba(255,255,255,.1); border-radius: 2px; }
    .ak-modal-title { font-size: 18px; font-weight: 700; color: var(--text-primary,#F1F5F9); margin: 0 0 20px; }
    .ak-form-row { margin-bottom: 14px; }
    .ak-form-row label { display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--text-secondary,#94A3B8); margin-bottom: 6px; }
    .ak-form-row input, .ak-form-row select, .ak-form-row textarea {
      width: 100%; padding: 10px 12px; box-sizing: border-box;
      background: rgba(255,255,255,.05); border: 1px solid var(--border,rgba(255,255,255,.1));
      border-radius: 10px; color: var(--text-primary,#F1F5F9); font-size: 13px; outline: none;
      transition: border-color .15s;
    }
    .ak-form-row input:focus, .ak-form-row select:focus, .ak-form-row textarea:focus { border-color: #4F8EF7; }
    .ak-form-row select option { background: #1A1D2E; }
    .ak-form-row textarea { resize: vertical; min-height: 60px; }
    .ak-form-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .ak-modal-actions { display: flex; gap: 10px; margin-top: 20px; justify-content: flex-end; }
    .ak-modal-cancel {
      padding: 10px 18px; border-radius: 10px;
      border: 1px solid var(--border,rgba(255,255,255,.1));
      background: transparent; color: var(--text-secondary,#94A3B8);
      font-size: 13px; font-weight: 600; cursor: pointer;
    }
    .ak-modal-cancel:hover { background: rgba(255,255,255,.05); }
    .ak-modal-submit {
      padding: 10px 20px; border-radius: 10px; border: none;
      background: #4F8EF7; color: #fff; font-size: 13px; font-weight: 600;
      cursor: pointer; transition: background .15s;
    }
    .ak-modal-submit:hover { background: #3B7DE8; }
    .ak-modal-submit:disabled { opacity: .6; cursor: not-allowed; }

    /* Shimmer */
    .ak-shimmer {
      background: linear-gradient(90deg,rgba(255,255,255,.04) 25%,rgba(255,255,255,.09) 50%,rgba(255,255,255,.04) 75%);
      background-size: 200% 100%; animation: ak-sh 1.4s infinite; border-radius: 10px;
    }
    @keyframes ak-sh { 0%{background-position:200% 0}100%{background-position:-200% 0} }

    /* Toast */
    .ak-toast {
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
      background: #1A1D2E; border: 1px solid rgba(255,255,255,.1);
      border-radius: 999px; padding: 8px 18px;
      font-size: 13px; font-weight: 600; color: #F1F5F9; z-index: 9999;
      pointer-events: none; animation: ak-toast .2s ease;
    }
    @keyframes ak-toast { from{opacity:0;transform:translateX(-50%) translateY(6px)}to{opacity:1;transform:translateX(-50%) translateY(0)} }
  `
  document.head.appendChild(s)
}

function showToast(msg) {
  const t = document.createElement('div')
  t.className = 'ak-toast'; t.textContent = msg
  document.body.appendChild(t)
  setTimeout(() => t.remove(), 2200)
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); showToast('Скопійовано') }
  catch { showToast('Помилка копіювання') }
}

// ── Integrations config ───────────────────────────────────────────────────────
const INTEGRATIONS = [
  {
    id: 'telegram', name: 'Telegram', iconName: 'send', color: '#229ED9',
    desc: 'Підписники каналу, статистика повідомлень',
    fields: [
      { key: 'botToken', label: 'Bot Token', placeholder: '123456:ABC-DEF...' },
      { key: 'channelId', label: 'Channel username', placeholder: '@mychannel' },
    ],
    async fetchData(cfg) {
      if (!cfg.botToken || !cfg.channelId) return null
      try {
        const result = await window.electron?.tg?.fetchChannel(cfg.botToken, cfg.channelId)
        if (result?.error) return { error: result.error }
        return {
          metrics: [
            { label: 'Підписники', value: result.subscribers?.toLocaleString() || '—' },
            { label: 'Назва каналу', value: result.title || '—' },
            { label: 'Username', value: result.username ? '@'+result.username : '—' },
            { label: 'Опис', value: result.description?.slice(0,80) || '—' },
          ],
          link: result.link,
        }
      } catch(e) { return { error: e.message } }
    }
  },
  {
    id: 'github', name: 'GitHub', iconName: 'cpu', color: '#6E40C9',
    desc: 'Репозиторії, зірки, активність',
    fields: [
      { key: 'token', label: 'Personal Access Token', placeholder: 'ghp_...' },
      { key: 'username', label: 'Username', placeholder: 'your-username' },
    ],
    async fetchData(cfg) {
      if (!cfg.username) return null
      try {
        const headers = cfg.token ? { Authorization: `token ${cfg.token}` } : {}
        const r = await fetch(`https://api.github.com/users/${cfg.username}`, { headers })
        if (!r.ok) return { error: `HTTP ${r.status}` }
        const data = await r.json()
        return {
          metrics: [
            { label: 'Публічних репо', value: data.public_repos },
            { label: 'Фоловерів', value: data.followers },
            { label: 'Фоловінгів', value: data.following },
            { label: 'Компанія', value: data.company || '—' },
          ],
          link: data.html_url,
        }
      } catch(e) { return { error: e.message } }
    }
  },
  {
    id: 'openai', name: 'OpenAI', iconName: 'cpu', color: '#10A37F',
    desc: 'Зберігання OpenAI API ключа для ваших проектів',
    fields: [
      { key: 'apiKey', label: 'API Key', placeholder: 'sk-...' },
      { key: 'org', label: 'Organization ID (опціонально)', placeholder: 'org-...' },
    ],
    async fetchData(cfg) {
      if (!cfg.apiKey) return null
      return {
        metrics: [
          { label: 'API Key', value: cfg.apiKey.slice(0,8)+'...' },
          { label: 'Organization', value: cfg.org || '—' },
          { label: 'Статус', value: 'Збережено' },
        ],
        link: 'https://platform.openai.com',
      }
    }
  },
  {
    id: 'stripe', name: 'Stripe', iconName: 'credit-card', color: '#635BFF',
    desc: 'Платежі, баланс, транзакції',
    fields: [
      { key: 'secretKey', label: 'Secret Key', placeholder: 'sk_live_...' },
      { key: 'publicKey', label: 'Publishable Key', placeholder: 'pk_live_...' },
    ],
    async fetchData(cfg) {
      if (!cfg.secretKey) return null
      return {
        metrics: [
          { label: 'Secret Key', value: cfg.secretKey.slice(0,12)+'...' },
          { label: 'Публічний ключ', value: cfg.publicKey?.slice(0,12)+'...' || '—' },
          { label: 'Середовище', value: cfg.secretKey.startsWith('sk_live') ? 'Live' : 'Test' },
        ],
        link: 'https://dashboard.stripe.com',
      }
    }
  },
  {
    id: 'custom', name: 'Свій сервіс', iconName: 'settings', color: '#6B7280',
    desc: 'Додай власну інтеграцію через API URL',
    fields: [
      { key: 'url', label: 'API URL', placeholder: 'https://api.example.com/stats' },
      { key: 'token', label: 'Bearer Token (опціонально)', placeholder: 'token...' },
      { key: 'label', label: 'Назва', placeholder: 'Мій сервіс' },
    ],
    async fetchData(cfg) {
      if (!cfg.url) return null
      try {
        const headers = { 'Content-Type': 'application/json' }
        if (cfg.token) headers['Authorization'] = `Bearer ${cfg.token}`
        const r = await fetch(cfg.url, { headers })
        if (!r.ok) return { error: `HTTP ${r.status}: ${r.statusText}` }
        const data = await r.json()
        return {
          metrics: Object.entries(data).slice(0, 6).map(([k, v]) => ({
            label: k, value: typeof v === 'object' ? JSON.stringify(v).slice(0,40) : String(v)
          })),
          link: cfg.url,
        }
      } catch(e) { return { error: e.message } }
    }
  },
]

// ── Main render ───────────────────────────────────────────────────────────────
export async function render(container) {
  injectStyles()
  const user = await getCurrentUser()
  if (!user) { container.innerHTML = '<p style="color:#94A3B8;padding:24px">Потрібна авторизація</p>'; return }
  const base = getActivePathSegments(user.uid)

  let keys       = []
  let integrations = {} // id → { config, data }
  let selectedId = null
  let filterCat  = 'all'
  let search     = ''
  let activeTab  = 'keys'   // 'keys' | 'integrations'
  let revealedIds = new Set()

  // ── Load ──────────────────────────────────────────────────────────────────
  async function loadKeys() {
    try {
      const snap = await getDocs(collection(db, ...base, 'api-keys'))
      keys = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      keys.sort((a,b) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0))
    } catch(e) { console.error('ak load', e) }
  }

  async function loadIntegrations() {
    try {
      const snap = await getDocs(collection(db, ...base, 'integrations'))
      snap.docs.forEach(d => {
        integrations[d.id] = { config: d.data(), docId: d.id, data: null }
      })
    } catch(e) { console.error('int load', e) }
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  function buildStats() {
    const total = keys.length
    const bots  = keys.filter(k => k.category === 'bot').length
    const prod  = keys.filter(k => k.env === 'prod').length
    const cats  = new Set(keys.map(k => k.category)).size
    return [
      { label: 'Всього ключів', val: total, color: '#4F8EF7' },
      { label: 'Боти',          val: bots,  color: '#34D399' },
      { label: 'Продакшн',      val: prod,  color: '#EF4444' },
      { label: 'Категорій',     val: cats,  color: '#A78BFA' },
    ]
  }

  // ── Render keys list ──────────────────────────────────────────────────────
  function renderKeysList() {
    let list = keys
    if (filterCat !== 'all') list = list.filter(k => k.category === filterCat)
    if (search) list = list.filter(k => (k.name||'').toLowerCase().includes(search.toLowerCase()))

    if (!list.length) return `
      <div class="ak-empty">
        <div class="ak-empty-icon">${icon('passwords', 36)}</div>
        <div>${search || filterCat !== 'all' ? 'Нічого не знайдено' : 'API ключів ще немає'}</div>
      </div>`

    return `<div class="ak-list">${list.map(k => {
      const cm  = CAT_META[k.category] || CAT_META.other
      const em  = ENV_META[k.env]      || ENV_META.dev
      const sel = k.id === selectedId ? ' selected' : ''
      return `
        <div class="ak-card${sel}" data-id="${k.id}" style="--cc:${cm.color}">
          <div class="ak-card-icon">${getServiceIcon(k.name, 18)}</div>
          <div class="ak-card-info">
            <div class="ak-card-name">${escHtml(k.name)}</div>
            <div class="ak-card-key">${maskKey(k.apiKey || k.token)}</div>
          </div>
          <div class="ak-card-badges">
            <span class="ak-env-badge" style="background:${em.bg};color:${em.color}">${em.label}</span>
            <span class="ak-cat-badge" style="background:${cm.color}22;color:${cm.color}">${icon(cm.iconName, 11)}</span>
          </div>
        </div>`
    }).join('')}</div>`
  }

  // ── Render integrations ───────────────────────────────────────────────────
  function renderIntegrationsList() {
    return `<div class="ak-int-grid">${INTEGRATIONS.map(int => {
      const saved = integrations[int.id]
      const connected = !!saved
      return `
        <div class="ak-int-card${connected?' connected':''}" data-int="${int.id}"
             style="border-color:${connected ? int.color+'44' : ''}">
          <div class="ak-int-icon">${icon(int.iconName, 28)}</div>
          <div class="ak-int-name">${int.name}</div>
          <div class="ak-int-desc">${int.desc}</div>
          <div class="ak-int-status">
            <span class="ak-int-dot" style="background:${connected ? '#34D399' : '#6B7280'}"></span>
            <span style="color:${connected ? '#34D399' : '#6B7280'}">${connected ? 'Підключено' : 'Не підключено'}</span>
          </div>
          <button class="ak-int-btn ${connected ? 'ak-int-btn-view' : 'ak-int-btn-connect'}">
            ${connected ? icon('bar-chart',12)+' Переглянути' : '+ Підключити'}
          </button>
        </div>`
    }).join('')}</div>`
  }

  // ── Render key detail ─────────────────────────────────────────────────────
  function renderKeyDetail(k) {
    const cm = CAT_META[k.category] || CAT_META.other
    const em = ENV_META[k.env] || ENV_META.dev
    const revealed = revealedIds.has(k.id)

    const fieldRow = (label, value, copyable=true, secret=false) => {
      if (!value) return ''
      const display = secret && !revealed ? maskKey(value) : escHtml(value)
      return `
        <div class="ak-d-field">
          <div class="ak-d-field-label">${label}</div>
          <div class="ak-d-field-row">
            <div class="ak-d-field-value" style="font-family:${copyable?'monospace':'inherit'}">${display}</div>
            ${secret ? `<button class="ak-d-toggle" data-reveal="${k.id}">${revealed?icon('eye-off',12):icon('eye',12)}</button>` : ''}
            ${copyable ? `<button class="ak-d-copy" data-copy="${escHtml(value)}">${icon('copy',12)}</button>` : ''}
          </div>
        </div>`
    }

    return `
      <button class="ak-d-close" id="ak-d-close">${icon('x', 13)}</button>
      <div style="overflow:hidden">
        <div class="ak-d-service-box">
          <div class="ak-d-service-icon">${getServiceIcon(k.name, 36)}</div>
          <div class="ak-d-service-name">${escHtml(k.name)}</div>
          <div style="display:flex;gap:6px">
            <span class="ak-env-badge" style="background:${em.bg};color:${em.color}">${em.label}</span>
            <span class="ak-cat-badge" style="background:${cm.color}22;color:${cm.color};display:inline-flex;align-items:center;gap:4px">${icon(cm.iconName, 11)} ${cm.label}</span>
          </div>
        </div>

        ${fieldRow('API Key / Token', k.apiKey || k.token, true, true)}
        ${k.secret  ? fieldRow('Secret / App Secret', k.secret, true, true) : ''}
        ${k.url     ? fieldRow('URL / Endpoint', k.url, true, false) : ''}
        ${k.note    ? fieldRow('Нотатка', k.note, false, false) : ''}

        <div class="ak-d-field">
          <div class="ak-d-field-label">Додано</div>
          <div class="ak-d-field-row">
            <div class="ak-d-field-value" style="font-family:inherit">${fmtDate(k.createdAt)}</div>
          </div>
        </div>

        <div class="ak-d-actions">
          <button class="ak-d-btn ak-d-btn-edit" data-edit="${k.id}">${icon('edit', 13)} Редагувати</button>
          <button class="ak-d-btn ak-d-btn-delete" data-delete="${k.id}">${icon('trash', 13)} Видалити</button>
        </div>
      </div>`
  }

  // ── Render integration detail ─────────────────────────────────────────────
  async function renderIntegrationDetail(intId) {
    const int    = INTEGRATIONS.find(x => x.id === intId)
    const saved  = integrations[intId]
    if (!int) return

    // Update right panel with loading state
    const right = container.querySelector('#ak-right')
    if (!right) return

    right.innerHTML = `
      <div class="ak-right-scroll">
        <button class="ak-d-close" id="ak-d-close" style="float:right">${icon('x', 13)}</button>
        <div style="text-align:center;margin-bottom:20px">
          <div style="display:flex;justify-content:center;align-items:center;width:64px;height:64px;border-radius:16px;background:${int.color}18;color:${int.color};margin:0 auto 12px">${icon(int.iconName, 32)}</div>
          <div style="font-size:16px;font-weight:700;color:#F1F5F9;margin-bottom:4px">${int.name}</div>
          <div style="font-size:12px;color:#94A3B8">${int.desc}</div>
        </div>

        ${int.fields.map(f => `
          <div class="ak-d-field">
            <div class="ak-d-field-label">${f.label}</div>
            <div class="ak-d-field-row">
              <input id="int-field-${f.key}" type="${f.key.toLowerCase().includes('token')||f.key.toLowerCase().includes('key')||f.key.toLowerCase().includes('secret')?'password':'text'}"
                style="flex:1;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:7px 10px;color:#F1F5F9;font-size:12px;outline:none;"
                placeholder="${escHtml(f.placeholder)}"
                value="${escHtml(saved?.config?.[f.key] || '')}">
            </div>
          </div>`).join('')}

        <div style="display:flex;gap:8px;margin-top:12px">
          <button id="int-save-btn" style="flex:1;padding:9px;border-radius:10px;border:none;background:#4F8EF7;color:#fff;font-size:13px;font-weight:600;cursor:pointer">
            ${saved ? icon('download',13)+' Оновити' : '+ Підключити'}
          </button>
          <button id="int-fetch-btn" style="flex:1;padding:9px;border-radius:10px;border:none;background:rgba(52,211,153,.15);color:#34D399;font-size:13px;font-weight:600;cursor:pointer">
            ${icon('bar-chart',13)} Отримати дані
          </button>
        </div>

        ${saved ? `<button id="int-disconnect-btn" style="width:100%;padding:9px;border-radius:10px;border:none;background:rgba(239,68,68,.12);color:#EF4444;font-size:13px;font-weight:600;cursor:pointer;margin-top:8px">
          ${icon('x-circle',13)} Відключити
        </button>` : ''}

        <div id="int-data-area" style="margin-top:16px"></div>
      </div>`

    right.querySelector('#ak-d-close')?.addEventListener('click', () => {
      right.innerHTML = `<div class="ak-right-empty"><div class="ak-right-empty-icon">${icon('settings',36)}</div><p style="font-size:14px;margin:0">Виберіть ключ або інтеграцію</p></div>`
    })

    right.querySelector('#int-save-btn')?.addEventListener('click', async () => {
      const config = {}
      int.fields.forEach(f => {
        config[f.key] = right.querySelector(`#int-field-${f.key}`)?.value.trim() || ''
      })
      try {
        if (saved?.docId) {
          await updateDoc(doc(db, ...base, 'integrations', saved.docId), { ...config, updatedAt: serverTimestamp() })
        } else {
          const ref = await addDoc(collection(db, ...base, 'integrations'), { intId, ...config, createdAt: serverTimestamp() })
          integrations[intId] = { config: { intId, ...config }, docId: ref.id, data: null }
        }
        integrations[intId] = { ...integrations[intId], config: { intId, ...config } }
        showToast('Збережено')
        renderAll()
      } catch(e) { showToast('Помилка: ' + e.message) }
    })

    right.querySelector('#int-fetch-btn')?.addEventListener('click', async () => {
      const config = {}
      int.fields.forEach(f => {
        config[f.key] = right.querySelector(`#int-field-${f.key}`)?.value.trim() || ''
      })
      const area = right.querySelector('#int-data-area')
      if (area) area.innerHTML = `<div style="text-align:center;padding:16px;color:#94A3B8;font-size:13px">Завантаження...</div>`

      const result = await int.fetchData(config)
      if (!area) return

      if (!result) {
        area.innerHTML = `<div style="text-align:center;padding:12px;color:#94A3B8;font-size:12px">Заповніть поля та натисніть "Отримати дані"</div>`
      } else if (result.error) {
        area.innerHTML = `<div style="display:flex;align-items:center;gap:6px;padding:12px;border-radius:10px;background:rgba(239,68,68,.1);color:#EF4444;font-size:12px">${icon('x-circle',14)} ${escHtml(result.error)}</div>`
      } else {
        area.innerHTML = `
          <div class="ak-int-data">
            <div class="ak-int-data-header" style="display:flex;align-items:center;gap:6px">${icon('bar-chart',14)} Дані з ${int.name}</div>
            ${result.metrics.map(m => `
              <div class="ak-int-metric">
                <div class="ak-int-metric-label">${escHtml(m.label)}</div>
                <div class="ak-int-metric-val">${escHtml(String(m.value))}</div>
              </div>`).join('')}
            ${result.link ? `<a href="${result.link}" target="_blank" style="display:inline-flex;align-items:center;gap:4px;margin-top:10px;font-size:12px;color:#4F8EF7;text-decoration:none">${icon('external-link',12)} Відкрити →</a>` : ''}
          </div>`
      }
    })

    right.querySelector('#int-disconnect-btn')?.addEventListener('click', async () => {
      if (!confirm(`Відключити інтеграцію ${int.name}?`)) return
      try {
        if (saved?.docId) await deleteDoc(doc(db, ...base, 'integrations', saved.docId))
        delete integrations[intId]
        right.innerHTML = `<div class="ak-right-empty"><div class="ak-right-empty-icon">${icon('x-circle',36)}</div><p style="font-size:14px;margin:0">Інтеграцію відключено</p></div>`
        renderAll()
      } catch(e) { showToast('Помилка: ' + e.message) }
    })

    // Auto-fetch if already configured
    if (saved?.config && Object.values(saved.config).some(v => v && v !== intId)) {
      right.querySelector('#int-fetch-btn')?.click()
    }
  }

  // ── Full render ───────────────────────────────────────────────────────────
  function renderAll() {
    const stats = buildStats()

    container.innerHTML = `
      <div class="ak-layout">
        <div class="ak-left">
          <div class="ak-header">
            <div>
              <h2 class="ak-title">API & Інтеграції</h2>
              <p class="ak-sub">${keys.length} ключів · ${Object.keys(integrations).length} інтеграцій</p>
            </div>
            ${activeTab === 'keys' ? `<button class="ak-btn-add" id="ak-add-btn">+ Додати ключ</button>` : ''}
          </div>

          <div class="ak-tabs">
            <button class="ak-tab${activeTab==='keys'?' active':''}" data-tab="keys">${icon('passwords',13)} API Ключі</button>
            <button class="ak-tab${activeTab==='integrations'?' active':''}" data-tab="integrations">${icon('settings',13)} Інтеграції</button>
          </div>

          <div class="ak-left-scroll" style="padding-top:16px">
            ${activeTab === 'keys' ? `
              <div class="ak-stats">
                ${stats.map(s=>`<div class="ak-stat" style="--sc:${s.color}"><div class="ak-stat-label">${s.label}</div><div class="ak-stat-val">${s.val}</div></div>`).join('')}
              </div>
              <div class="ak-toolbar">
                <input class="ak-search" id="ak-search" placeholder="Пошук..." value="${escHtml(search)}">
              </div>
              <div class="ak-filters">
                ${[['all','Всі'],['bot','Боти'],['social','Соцмережі'],['payment','Платежі'],['service','Сервіси'],['ai','AI'],['other','Інше']]
                  .map(([k,l])=>`<button class="ak-pill${filterCat===k?' active':''}" data-filter="${k}">${l}</button>`).join('')}
              </div>
              ${renderKeysList()}
            ` : renderIntegrationsList()}
          </div>
        </div>

        <div class="ak-right" id="ak-right">
          ${selectedId && keys.find(k=>k.id===selectedId) && activeTab==='keys'
            ? `<div class="ak-right-scroll">${renderKeyDetail(keys.find(k=>k.id===selectedId))}</div>`
            : `<div class="ak-right-empty">
                <div class="ak-right-empty-icon">${icon('settings',36)}</div>
                <p style="font-size:14px;margin:0">Виберіть ключ або інтеграцію</p>
               </div>`}
        </div>
      </div>`

    bindEvents()
  }

  // ── Events ────────────────────────────────────────────────────────────────
  function bindEvents() {
    container.querySelector('#ak-add-btn')?.addEventListener('click', () => openModal(null))

    container.querySelectorAll('.ak-tab').forEach(t =>
      t.addEventListener('click', () => { activeTab = t.dataset.tab; selectedId = null; renderAll() })
    )

    container.querySelector('#ak-search')?.addEventListener('input', e => {
      search = e.target.value; renderAll()
    })

    container.querySelectorAll('[data-filter]').forEach(b =>
      b.addEventListener('click', () => { filterCat = b.dataset.filter; renderAll() })
    )

    container.querySelectorAll('.ak-card').forEach(c =>
      c.addEventListener('click', () => { selectedId = c.dataset.id; renderAll() })
    )

    container.querySelectorAll('.ak-int-card').forEach(c =>
      c.addEventListener('click', () => renderIntegrationDetail(c.dataset.int))
    )

    container.querySelector('#ak-d-close')?.addEventListener('click', () => {
      selectedId = null; renderAll()
    })

    container.querySelectorAll('[data-copy]').forEach(b =>
      b.addEventListener('click', e => { e.stopPropagation(); copyText(b.dataset.copy) })
    )

    container.querySelectorAll('[data-reveal]').forEach(b =>
      b.addEventListener('click', e => {
        e.stopPropagation()
        const id = b.dataset.reveal
        if (revealedIds.has(id)) revealedIds.delete(id)
        else revealedIds.add(id)
        renderAll()
      })
    )

    container.querySelectorAll('[data-edit]').forEach(b =>
      b.addEventListener('click', () => { const k = keys.find(x=>x.id===b.dataset.edit); if(k) openModal(k) })
    )

    container.querySelectorAll('[data-delete]').forEach(b =>
      b.addEventListener('click', async () => {
        const k = keys.find(x=>x.id===b.dataset.delete)
        if (!k || !confirm(`Видалити "${k.name}"?`)) return
        await deleteDoc(doc(db, ...base, 'api-keys', k.id))
        keys = keys.filter(x=>x.id!==k.id)
        selectedId = null; renderAll()
      })
    )
  }

  // ── Modal ─────────────────────────────────────────────────────────────────
  function openModal(k) {
    const isEdit = !!k
    const overlay = document.createElement('div')
    overlay.className = 'ak-modal-overlay'
    overlay.innerHTML = `
      <div class="ak-modal">
        <h3 class="ak-modal-title">${isEdit ? icon('edit',16)+' Редагувати ключ' : '+ Новий API ключ'}</h3>

        <div class="ak-form-row">
          <label>Назва сервісу *</label>
          <input id="ak-f-name" type="text" placeholder="Telegram Bot, OpenAI, Stripe..." value="${escHtml(k?.name||'')}">
        </div>

        <div class="ak-form-row">
          <label>API Key / Token *</label>
          <input id="ak-f-key" type="text" placeholder="sk-... / Bearer ... / token..." value="${escHtml(k?.apiKey||k?.token||'')}">
        </div>

        <div class="ak-form-row">
          <label>Secret / App Secret (опціонально)</label>
          <input id="ak-f-secret" type="text" placeholder="App Secret, Client Secret..." value="${escHtml(k?.secret||'')}">
        </div>

        <div class="ak-form-row">
          <label>URL / Endpoint (опціонально)</label>
          <input id="ak-f-url" type="text" placeholder="https://api.example.com" value="${escHtml(k?.url||'')}">
        </div>

        <div class="ak-form-2col">
          <div class="ak-form-row">
            <label>Категорія</label>
            <select id="ak-f-cat">
              ${Object.entries(CAT_META).map(([id,m])=>`<option value="${id}" ${(k?.category||'other')===id?'selected':''}>${m.icon} ${m.label}</option>`).join('')}
            </select>
          </div>
          <div class="ak-form-row">
            <label>Середовище</label>
            <select id="ak-f-env">
              ${Object.entries(ENV_META).map(([id,m])=>`<option value="${id}" ${(k?.env||'dev')===id?'selected':''}>${m.label}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="ak-form-row">
          <label>Нотатка</label>
          <textarea id="ak-f-note" placeholder="Для чого використовується...">${escHtml(k?.note||'')}</textarea>
        </div>

        <div class="ak-modal-actions">
          <button class="ak-modal-cancel" id="ak-modal-cancel">Скасувати</button>
          <button class="ak-modal-submit" id="ak-modal-submit">${isEdit?'Зберегти':'Додати'}</button>
        </div>
      </div>`

    document.body.appendChild(overlay)
    overlay.querySelector('#ak-modal-cancel').addEventListener('click', () => overlay.remove())
    overlay.addEventListener('click', e => { if(e.target===overlay) overlay.remove() })

    overlay.querySelector('#ak-modal-submit').addEventListener('click', async () => {
      const name = overlay.querySelector('#ak-f-name').value.trim()
      const key  = overlay.querySelector('#ak-f-key').value.trim()
      if (!name || !key) { showToast('Заповніть назву і ключ'); return }

      const btn = overlay.querySelector('#ak-modal-submit')
      btn.disabled = true; btn.textContent = '...'

      const payload = {
        name, apiKey: key,
        secret:   overlay.querySelector('#ak-f-secret').value.trim() || null,
        url:      overlay.querySelector('#ak-f-url').value.trim()    || null,
        category: overlay.querySelector('#ak-f-cat').value,
        env:      overlay.querySelector('#ak-f-env').value,
        note:     overlay.querySelector('#ak-f-note').value.trim()   || null,
        updatedAt: serverTimestamp(),
      }

      try {
        if (isEdit) {
          await updateDoc(doc(db, ...base, 'api-keys', k.id), payload)
          const idx = keys.findIndex(x=>x.id===k.id)
          if (idx!==-1) keys[idx] = { ...keys[idx], ...payload }
          selectedId = k.id
        } else {
          payload.createdAt = serverTimestamp()
          const ref = await addDoc(collection(db, ...base, 'api-keys'), payload)
          keys.unshift({ id: ref.id, ...payload })
          selectedId = ref.id
        }
        overlay.remove(); renderAll()
      } catch(e) {
        showToast('Помилка: ' + e.message)
        btn.disabled = false; btn.textContent = isEdit?'Зберегти':'Додати'
      }
    })
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  container.innerHTML = `<div class="ak-layout">
    <div class="ak-left">
      <div class="ak-header">
        <div>
          <div class="ak-shimmer" style="width:160px;height:26px;margin-bottom:6px"></div>
          <div class="ak-shimmer" style="width:100px;height:14px"></div>
        </div>
      </div>
      <div class="ak-left-scroll">
        ${[1,2,3,4].map(()=>`<div class="ak-shimmer" style="height:64px;border-radius:12px;margin-bottom:8px"></div>`).join('')}
      </div>
    </div>
    <div class="ak-right"><div class="ak-right-empty"><div class="ak-right-empty-icon">${icon('settings',36)}</div></div></div>
  </div>`

  await Promise.all([loadKeys(), loadIntegrations()])
  renderAll()
}
