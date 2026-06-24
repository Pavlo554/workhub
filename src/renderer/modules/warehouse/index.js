// src/renderer/modules/warehouse/index.js
import { icon } from '../../utils/icons.js'
import { db } from '../../services/firebase.js'
import { getCurrentUser, getActivePathSegments } from '../../services/auth.js'
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, setDoc, getDoc, writeBatch, query, orderBy, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
import { t } from '../../core/i18n.js'

const CATS = [
  { id: 'materials', label: 'Матеріали',  iconName: 'droplet',   color: '#4F8EF7' },
  { id: 'tools',     label: 'Інструменти',iconName: 'tool',      color: '#F59E0B' },
  { id: 'products',  label: 'Товари',     iconName: 'warehouse', color: '#34D399' },
  { id: 'equipment', label: 'Обладнання', iconName: 'cpu',       color: '#A78BFA' },
  { id: 'digital',   label: 'Цифрові продукти', iconName: 'monitor', color: '#38BDF8' },
  { id: 'other',     label: 'Інше',       iconName: 'briefcase', color: '#94A3B8' },
]

const PLATFORMS = [
  { id: 'woocommerce', label: 'WooCommerce', icon: '🛒' },
  { id: 'shopify',     label: 'Shopify',     icon: '🟢' },
  { id: 'opencart',    label: 'OpenCart',    icon: '🛍️' },
  { id: 'custom',      label: 'Custom JSON', icon: '⚙️' },
]

export async function render(container) {
  injectStyles()
  const user = getCurrentUser()
  const base = getActivePathSegments(user.uid)
  let items     = []
  let shopCfg   = null
  let activeCat = 'all'
  let editItem  = null
  let search    = ''

  const shopDocRef = doc(db, 'users', user.uid, 'integrations', 'shop')

  async function load() {
    try {
      const [warehouseSnap, shopSnap] = await Promise.all([
        getDocs(query(collection(db, ...base, 'warehouse'), orderBy('createdAt', 'desc'))),
        getDoc(shopDocRef),
      ])
      items   = warehouseSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      shopCfg = shopSnap.exists() ? shopSnap.data() : null
    } catch { items = [] }
    rerender()
  }

  function rerender() {
    let filtered = activeCat === 'all' ? items : items.filter(i => i.category === activeCat)
    if (search) filtered = filtered.filter(i => i.name?.toLowerCase().includes(search.toLowerCase()))

    const totalItems = items.length
    const lowStock   = items.filter(i => (i.qty || 0) <= (i.minQty || 0) && i.minQty > 0).length
    const totalValue = items.reduce((s, i) => s + (i.qty || 0) * (i.price || 0), 0)

    container.innerHTML = `
      <div class="wh-page">
        <div class="wh-header">
          <div>
            <h1 class="wh-title">${icon('warehouse', 20)} ${t('warehouse.title')}</h1>
            <p class="wh-subtitle">${totalItems} позицій${shopCfg ? ` · <span class="wh-shop-status-dot"></span> ${shopCfg.storeName || shopCfg.url || 'Магазин'} підключено` : ''}</p>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            ${shopCfg ? `<button class="wh-sync-btn" id="wh-sync">${icon('refresh', 14)} ${t('warehouse.sync')}</button>` : ''}
            <button class="wh-shop-btn ${shopCfg ? 'connected' : ''}" id="wh-shop">${icon('external-link', 14)} ${shopCfg ? t('module.warehouse') : t('warehouse.connect_shop')}</button>
            <button class="wh-add-btn" id="wh-add">${t('warehouse.add')}</button>
          </div>
        </div>

        <div class="wh-kpi-row">
          <div class="wh-kpi">
            <div class="wh-kpi-icon" style="color:#4F8EF7">${icon('warehouse', 18)}</div>
            <div class="wh-kpi-val">${totalItems}</div>
            <div class="wh-kpi-label">${t('warehouse.total')}</div>
          </div>
          <div class="wh-kpi">
            <div class="wh-kpi-icon" style="color:${lowStock>0?'#F59E0B':'#34D399'}">${icon('alert-triangle', 18)}</div>
            <div class="wh-kpi-val" style="color:${lowStock>0?'#F59E0B':'#34D399'}">${lowStock}</div>
            <div class="wh-kpi-label">${t('warehouse.low_stock')}</div>
          </div>
          <div class="wh-kpi">
            <div class="wh-kpi-icon" style="color:#34D399">${icon('finances', 18)}</div>
            <div class="wh-kpi-val">₴${totalValue.toLocaleString('uk-UA')}</div>
            <div class="wh-kpi-label">${t('warehouse.value')}</div>
          </div>
          <div class="wh-kpi">
            <div class="wh-kpi-icon" style="color:#F87171">${icon('x-circle', 18)}</div>
            <div class="wh-kpi-val" style="color:${items.filter(i=>!(i.category==='digital'&&i.saleType==='copy')&&(i.qty||0)===0).length>0?'#F87171':'var(--text-primary)'}">${items.filter(i=>!(i.category==='digital'&&i.saleType==='copy')&&(i.qty||0)===0).length}</div>
            <div class="wh-kpi-label">${t('warehouse.out_of_stock')}</div>
          </div>
        </div>

        <div class="wh-toolbar">
          <div class="wh-search">
            <span style="display:flex;align-items:center;color:var(--text-muted)">${icon('search', 14)}</span>
            <input type="text" id="wh-search" placeholder="Пошук..." value="${search}">
          </div>
          <div class="wh-cat-pills">
            <button class="wh-pill ${activeCat==='all'?'active':''}" data-cat="all">Всі</button>
            ${CATS.map(c => `<button class="wh-pill ${activeCat===c.id?'active':''}" data-cat="${c.id}">${icon(c.iconName, 12)} ${c.label}</button>`).join('')}
          </div>
        </div>

        ${filtered.length ? `
        <div class="wh-table-wrap">
          <table class="wh-table">
            <thead><tr><th>${t('warehouse.name')}</th><th>${t('warehouse.category')}</th><th>${t('warehouse.qty')}</th><th>${t('warehouse.price')}</th><th>${t('warehouse.total_val')}</th><th>${t('warehouse.supplier')}</th><th></th></tr></thead>
            <tbody>
              ${filtered.map(item => {
                const cat = CATS.find(c => c.id === item.category) || CATS.at(-1)
                const isUnlimited = item.category === 'digital' && item.saleType === 'copy'
                const isLow = !isUnlimited && item.minQty > 0 && (item.qty || 0) <= item.minQty
                const isEmpty = !isUnlimited && (item.qty || 0) === 0
                return `
                  <tr class="${isEmpty ? 'wh-row-empty' : isLow ? 'wh-row-low' : ''}">
                    <td>
                      <div class="wh-item-name">
                        ${item.source === 'shop' ? `<span class="wh-shop-badge" title="${item.sourcePlatform || 'shop'}">🛒</span>` : ''}
                        ${item.name}
                      </div>
                      ${item.description ? `<div class="wh-item-desc">${item.description}</div>` : ''}
                      ${item.sku ? `<div class="wh-item-desc">SKU: ${item.sku}</div>` : ''}
                      ${item.category === 'digital' ? `<div class="wh-item-desc">${item.saleType === 'license' ? '🔑 Підключення (одноразово)' : '♾️ Копія (необмежено)'}</div>` : ''}
                    </td>
                    <td><span class="wh-cat-badge" style="color:${cat.color};background:${cat.color}15">${icon(cat.iconName, 11)} ${cat.label}</span></td>
                    <td>
                      <div class="wh-qty-cell">
                        ${isUnlimited
                          ? `<span class="wh-qty">∞</span>`
                          : `<span class="wh-qty ${isEmpty?'wh-qty-empty':isLow?'wh-qty-low':''}">${item.qty || 0}${item.unit ? ' ' + item.unit : ''}</span>`}
                        ${isLow && !isEmpty ? '<span class="wh-low-badge">↓ Мало</span>' : ''}
                        ${isEmpty ? `<span class="wh-empty-badge">${icon('x', 10)} Нема</span>` : ''}
                      </div>
                    </td>
                    <td>
                      ${item.price ? `₴${Number(item.price).toLocaleString('uk-UA')}` : '—'}
                      ${item.vatIncluded    ? `<span class="wh-tax-badge" style="background:rgba(79,142,247,.1);color:#4F8EF7">ПДВ</span>` : ''}
                      ${item.exciseIncluded ? `<span class="wh-tax-badge" style="background:rgba(245,158,11,.1);color:#F59E0B">Акциз</span>` : ''}
                    </td>
                    <td><strong>${item.price ? '₴' + (isUnlimited ? item.price : (item.qty||0) * item.price).toLocaleString('uk-UA') : '—'}</strong></td>
                    <td style="font-size:12px;color:var(--text-muted)">${item.category === 'digital' ? (item.link ? `<a href="${item.link}" target="_blank" style="color:#4F8EF7;text-decoration:none">🔗 Посилання</a>` : '—') : (item.supplier || '—')}</td>
                    <td>
                      <div class="wh-row-btns">
                        <button class="wh-rb wh-edit" data-id="${item.id}">${icon('pencil', 13)}</button>
                        <button class="wh-rb wh-del"  data-id="${item.id}">${icon('trash', 13)}</button>
                      </div>
                    </td>
                  </tr>
                `
              }).join('')}
            </tbody>
          </table>
        </div>` : `
        <div class="wh-empty">
          <div style="display:flex;align-items:center;justify-content:center;margin-bottom:12px;color:var(--text-muted);opacity:.4">${icon('warehouse', 48)}</div>
          <div class="wh-empty-title">${search ? t('common.empty') : t('warehouse.empty')}</div>
          <div class="wh-empty-desc">${search ? '' : t('warehouse.add')}</div>
        </div>`}
      </div>

      <!-- Shop integration modal -->
      <div class="wh-overlay" id="wh-shop-overlay" style="display:none">
        <div class="wh-modal" style="width:520px">
          <div class="wh-modal-head">
            <h2>${shopCfg ? '🛒 Інтеграція магазину' : '🛒 Підключити магазин'}</h2>
            <button id="wh-shop-close">${icon('x', 14)}</button>
          </div>

          ${shopCfg ? `
          <!-- Connected state -->
          <div class="wh-modal-body">
            <div class="wh-shop-connected-card">
              <div class="wh-shop-platform-icon">${PLATFORMS.find(p=>p.id===shopCfg.platform)?.icon || '🛒'}</div>
              <div>
                <div class="wh-shop-platform-name">${PLATFORMS.find(p=>p.id===shopCfg.platform)?.label || shopCfg.platform}</div>
                <div class="wh-shop-platform-url">${shopCfg.url}</div>
              </div>
              <div class="wh-shop-connected-dot"></div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px;color:var(--text-muted)">
              <div>Товарів синхронізовано: <strong style="color:var(--text-primary)">${items.filter(i=>i.source==='shop').length}</strong></div>
              <div>Остання синхронізація: <strong style="color:var(--text-primary)">${shopCfg.lastSynced ? new Date(shopCfg.lastSynced?.toMillis?.() || shopCfg.lastSynced).toLocaleString('uk-UA',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : 'Ніколи'}</strong></div>
            </div>
            <div id="wh-shop-msg"></div>
          </div>
          <div class="wh-modal-foot">
            <button class="wh-btn-sec" id="wh-shop-disconnect" style="color:#F87171;border-color:rgba(248,113,113,.3)">Відключити</button>
            <button class="wh-btn-sec" id="wh-shop-close2">Закрити</button>
            <button class="wh-btn-pri" id="wh-shop-sync-now">${icon('refresh', 14)} Синхронізувати</button>
          </div>
          ` : `
          <!-- Connect state -->
          <div class="wh-modal-body">
            <div class="wh-field">
              <label>Платформа</label>
              <div class="wh-platform-grid" id="wh-platform-grid">
                ${PLATFORMS.map(p => `
                  <button class="wh-platform-btn" data-platform="${p.id}">
                    <span style="font-size:22px">${p.icon}</span>
                    <span>${p.label}</span>
                  </button>`).join('')}
              </div>
            </div>
            <div id="wh-shop-fields"></div>
            <div id="wh-shop-msg"></div>
          </div>
          <div class="wh-modal-foot">
            <button class="wh-btn-sec" id="wh-shop-close3">Скасувати</button>
            <button class="wh-btn-sec" id="wh-shop-test" disabled>Тест підключення</button>
            <button class="wh-btn-pri" id="wh-shop-save" disabled>Зберегти та синхронізувати</button>
          </div>
          `}
        </div>
      </div>

      <!-- Item Modal -->
      <div class="wh-overlay" id="wh-modal" style="display:none">
        <div class="wh-modal">
          <div class="wh-modal-head">
            <h2 id="wh-modal-title">Нова позиція</h2>
            <button id="wh-modal-close">${icon('x', 14)}</button>
          </div>
          <div class="wh-modal-body">
            <div class="wh-field"><label>Назва *</label><input id="wh-f-name" class="wh-input" type="text" placeholder="Назва товару..."></div>
            <div class="wh-form-row">
              <div class="wh-field"><label>Категорія</label><select id="wh-f-cat" class="wh-input">${CATS.map(c=>`<option value="${c.id}">${c.label}</option>`).join('')}</select></div>
              <div class="wh-field" id="wh-unit-row"><label>Одиниця</label><input id="wh-f-unit" class="wh-input" type="text" placeholder="шт, кг, л..."></div>
            </div>
            <div class="wh-form-row" id="wh-qty-row">
              <div class="wh-field"><label>Кількість</label><input id="wh-f-qty" class="wh-input" type="number" min="0" placeholder="0"></div>
              <div class="wh-field"><label>Мін. залишок</label><input id="wh-f-min" class="wh-input" type="number" min="0" placeholder="0"></div>
            </div>
            <div class="wh-field" id="wh-saletype-row" style="display:none">
              <label>Тип продажу</label>
              <select id="wh-f-saletype" class="wh-input">
                <option value="copy">Копія — продаю необмежену кількість раз</option>
                <option value="license">Підключення — одноразовий продаж, без повторного</option>
              </select>
            </div>
            <div class="wh-form-row">
              <div class="wh-field"><label id="wh-price-label">Ціна за одиницю</label><input id="wh-f-price" class="wh-input" type="number" min="0" placeholder="0.00"></div>
              <div class="wh-field" id="wh-supplier-row"><label>Постачальник</label><input id="wh-f-supplier" class="wh-input" type="text" placeholder="Назва постачальника..."></div>
            </div>
            <div class="wh-field" id="wh-link-row" style="display:none"><label>Посилання на товар</label><input id="wh-f-link" class="wh-input" type="text" placeholder="https://..."></div>
            <div class="wh-form-row" id="wh-tax-row">
              <div class="wh-field" style="display:flex;align-items:center;gap:8px;margin-top:18px">
                <input type="checkbox" id="wh-f-vat" style="width:auto">
                <label for="wh-f-vat" style="margin:0;cursor:pointer">Ціна включає ПДВ 20%</label>
              </div>
              <div class="wh-field" style="display:flex;align-items:center;gap:8px;margin-top:18px">
                <input type="checkbox" id="wh-f-excise" style="width:auto">
                <label for="wh-f-excise" style="margin:0;cursor:pointer">Підакцизний товар (Акциз 5%)</label>
              </div>
            </div>
            <div class="wh-field" id="wh-tax-preview" style="display:none;background:var(--bg-primary,#0F1117);border-radius:8px;padding:10px 12px;font-size:12px;color:var(--text-muted,#8B97B0)"></div>
            <div class="wh-field"><label>Опис</label><input id="wh-f-desc" class="wh-input" type="text" placeholder="Короткий опис..."></div>
          </div>
          <div class="wh-modal-foot">
            <button class="wh-btn-sec" id="wh-modal-cancel">Скасувати</button>
            <button class="wh-btn-pri" id="wh-modal-save">Зберегти</button>
          </div>
        </div>
      </div>
    `
    attachEvents()
  }

  function toggleQtyFields() {
    const isDigital = container.querySelector('#wh-f-cat').value === 'digital'
    container.querySelector('#wh-qty-row').style.display       = isDigital ? 'none' : 'grid'
    container.querySelector('#wh-saletype-row').style.display  = isDigital ? 'block' : 'none'
    container.querySelector('#wh-unit-row').style.display      = isDigital ? 'none' : 'block'
    container.querySelector('#wh-supplier-row').style.display  = isDigital ? 'none' : 'block'
    container.querySelector('#wh-tax-row').style.display       = isDigital ? 'none' : 'grid'
    container.querySelector('#wh-link-row').style.display      = isDigital ? 'block' : 'none'
    container.querySelector('#wh-price-label').textContent     = isDigital ? 'Ціна' : 'Ціна за одиницю'
    if (isDigital) {
      container.querySelector('#wh-f-vat').checked = false
      container.querySelector('#wh-f-excise').checked = false
      updateTaxPreview()
    }
  }

  function attachEvents() {
    container.querySelector('#wh-add').addEventListener('click', () => openModal())
    container.querySelector('#wh-f-cat').addEventListener('change', toggleQtyFields)
    container.querySelector('#wh-modal-close').addEventListener('click', closeModal)
    container.querySelector('#wh-modal-cancel').addEventListener('click', closeModal)
    container.querySelector('#wh-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal() })
    container.querySelector('#wh-modal-save').addEventListener('click', save)
    container.querySelector('#wh-f-price').addEventListener('input', updateTaxPreview)
    container.querySelector('#wh-f-vat').addEventListener('change', updateTaxPreview)
    container.querySelector('#wh-f-excise').addEventListener('change', updateTaxPreview)
    container.querySelector('#wh-search').addEventListener('input', e => { search = e.target.value; rerender() })
    container.querySelectorAll('.wh-pill').forEach(b => b.addEventListener('click', () => { activeCat = b.dataset.cat; rerender() }))
    container.querySelectorAll('.wh-edit').forEach(b => b.addEventListener('click', () => openModal(items.find(i => i.id === b.dataset.id))))
    container.querySelectorAll('.wh-del').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Видалити позицію?')) return
      await deleteDoc(doc(db, ...base, 'warehouse', b.dataset.id))
      await load()
    }))

    // ── Shop button ──────────────────────────────────────────
    container.querySelector('#wh-shop')?.addEventListener('click', openShopModal)
    container.querySelector('#wh-sync')?.addEventListener('click', () => runSync())

    // ── Shop overlay ─────────────────────────────────────────
    const overlay = container.querySelector('#wh-shop-overlay')
    if (!overlay) return

    const closeShop = () => { overlay.style.display = 'none' }
    overlay.addEventListener('click', e => { if (e.target === overlay) closeShop() })
    container.querySelector('#wh-shop-close')?.addEventListener('click', closeShop)
    container.querySelector('#wh-shop-close2')?.addEventListener('click', closeShop)
    container.querySelector('#wh-shop-close3')?.addEventListener('click', closeShop)

    // Connected state buttons
    container.querySelector('#wh-shop-sync-now')?.addEventListener('click', () => runSync(overlay))
    container.querySelector('#wh-shop-disconnect')?.addEventListener('click', async () => {
      if (!confirm('Відключити магазин? Синхронізовані товари залишаться у складі.')) return
      await setDoc(shopDocRef, { enabled: false }, { merge: true })
      shopCfg = null
      closeShop()
      await load()
    })

    // Platform selection (connect flow)
    let selectedPlatform = null
    container.querySelectorAll('.wh-platform-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.wh-platform-btn').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        selectedPlatform = btn.dataset.platform
        renderShopFields(selectedPlatform)
        container.querySelector('#wh-shop-test').disabled  = false
        container.querySelector('#wh-shop-save').disabled  = false
      })
    })

    // Test connection
    container.querySelector('#wh-shop-test')?.addEventListener('click', async () => {
      const cfg = getShopFormValues()
      if (!cfg) return
      const btn = container.querySelector('#wh-shop-test')
      btn.disabled = true; btn.textContent = 'Тестування...'
      const result = await testConnection(cfg)
      btn.disabled = false; btn.textContent = 'Тест підключення'
      showShopMsg(result.ok ? `✓ ${result.count} товарів знайдено` : `✗ ${result.error}`, result.ok ? 'ok' : 'err')
    })

    // Save & sync
    container.querySelector('#wh-shop-save')?.addEventListener('click', async () => {
      const cfg = getShopFormValues()
      if (!cfg) return
      const btn = container.querySelector('#wh-shop-save')
      btn.disabled = true; btn.textContent = 'Збереження...'
      try {
        await setDoc(shopDocRef, { ...cfg, enabled: true, connectedAt: serverTimestamp() })
        shopCfg = cfg
        closeShop()
        await runSync()
      } catch (err) {
        showShopMsg('Помилка збереження: ' + err.message, 'err')
        btn.disabled = false; btn.textContent = 'Зберегти та синхронізувати'
      }
    })
  }

  function openShopModal() {
    container.querySelector('#wh-shop-overlay').style.display = 'flex'
  }

  function renderShopFields(platform) {
    const el = container.querySelector('#wh-shop-fields')
    if (!el) return
    const fields = {
      woocommerce: `
        <div class="wh-field"><label>URL магазину</label><input class="wh-input" id="sh-url" placeholder="https://mystore.com" type="url"></div>
        <div class="wh-form-row">
          <div class="wh-field"><label>Consumer Key</label><input class="wh-input" id="sh-key" placeholder="ck_..."></div>
          <div class="wh-field"><label>Consumer Secret</label><input class="wh-input" id="sh-secret" placeholder="cs_..." type="password"></div>
        </div>
        <div style="font-size:11px;color:var(--text-muted)">WooCommerce → Налаштування → Розширені → REST API → Додати ключ</div>`,
      shopify: `
        <div class="wh-field"><label>URL магазину</label><input class="wh-input" id="sh-url" placeholder="https://mystore.myshopify.com" type="url"></div>
        <div class="wh-field"><label>Access Token</label><input class="wh-input" id="sh-token" placeholder="shpat_..." type="password"></div>
        <div style="font-size:11px;color:var(--text-muted)">Shopify Admin → Apps → Private apps → Admin API access token</div>`,
      opencart: `
        <div class="wh-field"><label>URL магазину</label><input class="wh-input" id="sh-url" placeholder="https://mystore.com" type="url"></div>
        <div class="wh-field"><label>API Key</label><input class="wh-input" id="sh-token" placeholder="API ключ з адмінки OpenCart"></div>
        <div style="font-size:11px;color:var(--text-muted)">OpenCart → Система → Користувачі → API</div>`,
      custom: `
        <div class="wh-field"><label>URL ендпоінту (JSON масив)</label><input class="wh-input" id="sh-url" placeholder="https://mystore.com/api/products.json" type="url"></div>
        <div class="wh-field"><label>Authorization Header (опційно)</label><input class="wh-input" id="sh-token" placeholder="Bearer token або Basic ..."></div>
        <div style="font-size:11px;color:var(--text-muted)">Відповідь має бути JSON масивом з полями: name, price, qty (або stock_quantity)</div>`,
    }
    el.innerHTML = fields[platform] || ''
  }

  function getShopFormValues() {
    const platform = container.querySelector('.wh-platform-btn.active')?.dataset.platform
    if (!platform) { showShopMsg('Оберіть платформу', 'err'); return null }
    const url     = container.querySelector('#sh-url')?.value.trim().replace(/\/$/, '')
    const key     = container.querySelector('#sh-key')?.value.trim()
    const secret  = container.querySelector('#sh-secret')?.value.trim()
    const token   = container.querySelector('#sh-token')?.value.trim()
    if (!url) { showShopMsg('Введіть URL магазину', 'err'); return null }
    const platformLabel = PLATFORMS.find(p => p.id === platform)?.label || platform
    return { platform, url, consumerKey: key, consumerSecret: secret, accessToken: token, storeName: platformLabel }
  }

  function showShopMsg(text, type = 'ok') {
    const el = container.querySelector('#wh-shop-msg')
    if (!el) return
    el.innerHTML = `<div class="wh-shop-msg ${type}">${text}</div>`
    if (type === 'ok') setTimeout(() => { el.innerHTML = '' }, 4000)
  }

  async function testConnection(cfg) {
    try {
      const { url: apiUrl, headers } = buildShopRequest(cfg, 1)
      const res = await window.electron.shop.request({ url: apiUrl, headers })
      if (res.error)       return { ok: false, error: res.error }
      if (res.status !== 200) return { ok: false, error: `HTTP ${res.status}` }
      const data  = JSON.parse(res.body)
      const items = Array.isArray(data) ? data : data.products || data.items || []
      return { ok: true, count: items.length }
    } catch (err) { return { ok: false, error: err.message } }
  }

  function buildShopRequest(cfg, page = 1) {
    const { platform, url, consumerKey, consumerSecret, accessToken } = cfg
    switch (platform) {
      case 'woocommerce': return {
        url: `${url}/wp-json/wc/v3/products?per_page=100&status=publish&page=${page}`,
        headers: { 'Authorization': 'Basic ' + btoa(`${consumerKey}:${consumerSecret}`) },
      }
      case 'shopify': return {
        url: `${url}/admin/api/2024-01/products.json?limit=250`,
        headers: { 'X-Shopify-Access-Token': accessToken },
      }
      case 'opencart': return {
        url: `${url}/index.php?route=api/product&json&page=${page}`,
        headers: accessToken ? { 'Authorization': accessToken } : {},
      }
      default: return {
        url,
        headers: accessToken ? { 'Authorization': accessToken } : {},
      }
    }
  }

  async function fetchShopProducts(cfg) {
    const { platform } = cfg
    let products = []

    if (platform === 'woocommerce') {
      let page = 1
      while (true) {
        const { url: apiUrl, headers } = buildShopRequest(cfg, page)
        const res = await window.electron.shop.request({ url: apiUrl, headers })
        if (res.error || res.status !== 200) break
        const batch = JSON.parse(res.body)
        if (!Array.isArray(batch) || !batch.length) break
        for (const p of batch) {
          products.push({
            name:        p.name?.replace(/<[^>]+>/g, '') || p.slug || `Item ${p.id}`,
            sku:         p.sku || null,
            qty:         p.stock_quantity != null ? Number(p.stock_quantity) : 0,
            price:       parseFloat(p.price || p.regular_price) || 0,
            description: p.short_description?.replace(/<[^>]+>/g, '').trim() || null,
            category:    'products', unit: 'шт',
            source: 'shop', sourceId: String(p.id), sourcePlatform: platform,
          })
        }
        if (batch.length < 100 || page >= 20) break
        page++
      }
    } else if (platform === 'shopify') {
      const { url: apiUrl, headers } = buildShopRequest(cfg)
      const res = await window.electron.shop.request({ url: apiUrl, headers })
      if (!res.error && res.status === 200) {
        const data = JSON.parse(res.body)
        for (const p of data.products || []) {
          for (const v of p.variants || []) {
            products.push({
              name:     p.variants.length > 1 ? `${p.title} — ${v.title}` : p.title,
              sku:      v.sku || null,
              qty:      v.inventory_quantity || 0,
              price:    parseFloat(v.price) || 0,
              description: null,
              category: 'products', unit: 'шт',
              source: 'shop', sourceId: String(v.id), sourcePlatform: platform,
            })
          }
        }
      }
    } else {
      const { url: apiUrl, headers } = buildShopRequest(cfg)
      const res = await window.electron.shop.request({ url: apiUrl, headers })
      if (!res.error && res.status === 200) {
        const data = JSON.parse(res.body)
        const list = Array.isArray(data) ? data : data.products || data.items || []
        for (const p of list) {
          products.push({
            name:        p.name || p.title || p.product_name || 'Без назви',
            sku:         p.sku || p.article || null,
            qty:         Number(p.qty ?? p.stock_quantity ?? p.quantity ?? 0),
            price:       parseFloat(p.price || 0) || 0,
            description: p.description || p.short_description || null,
            category:    'products', unit: p.unit || 'шт',
            source: 'shop', sourceId: p.id ? String(p.id) : null, sourcePlatform: platform,
          })
        }
      }
    }
    return products
  }

  async function runSync(modalEl = null) {
    const cfg = shopCfg
    if (!cfg) return

    const syncBtn = container.querySelector('#wh-sync') || container.querySelector('#wh-shop-sync-now')
    if (syncBtn) { syncBtn.disabled = true; syncBtn.innerHTML = '<div style="display:inline-block;width:12px;height:12px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:wh-spin .7s linear infinite;margin-right:6px"></div>Синхронізація...' }

    try {
      const shopProducts = await fetchShopProducts(cfg)
      if (!shopProducts.length) {
        showShopMsg('Товари не знайдені у магазині', 'err'); return
      }

      // Get existing items to match by sourceId or name
      const existingSnap = await getDocs(collection(db, ...base, 'warehouse'))
      const existing = existingSnap.docs.map(d => ({ id: d.id, ...d.data() }))

      const batch = writeBatch(db)
      let added = 0, updated = 0

      for (const prod of shopProducts) {
        const match = existing.find(e =>
          (prod.sourceId && e.sourceId === prod.sourceId && e.sourcePlatform === prod.sourcePlatform) ||
          (e.name?.toLowerCase() === prod.name?.toLowerCase())
        )
        if (match) {
          batch.update(doc(db, ...base, 'warehouse', match.id), {
            qty: prod.qty, price: prod.price, updatedAt: serverTimestamp(),
            source: 'shop', sourceId: prod.sourceId, sourcePlatform: prod.sourcePlatform,
          })
          updated++
        } else {
          batch.set(doc(collection(db, ...base, 'warehouse')), {
            ...prod, createdAt: serverTimestamp(),
          })
          added++
        }
      }

      await batch.commit()
      await setDoc(shopDocRef, { lastSynced: serverTimestamp(), productCount: shopProducts.length }, { merge: true })

      showShopMsg(`✓ Синхронізовано: +${added} нових, ↺ ${updated} оновлено`, 'ok')
      await load()
    } catch (err) {
      console.error('Shop sync error:', err)
      showShopMsg('Помилка синхронізації: ' + err.message, 'err')
    } finally {
      if (syncBtn) { syncBtn.disabled = false; syncBtn.innerHTML = `${icon('refresh', 14)} Синхронізувати` }
    }
  }

  function openModal(item = null) {
    editItem = item
    container.querySelector('#wh-modal-title').textContent = item ? 'Редагувати позицію' : 'Нова позиція'
    container.querySelector('#wh-f-name').value     = item?.name     || ''
    container.querySelector('#wh-f-cat').value      = item?.category || 'materials'
    container.querySelector('#wh-f-unit').value     = item?.unit     || 'шт'
    container.querySelector('#wh-f-qty').value      = item?.qty      ?? ''
    container.querySelector('#wh-f-min').value      = item?.minQty   ?? ''
    container.querySelector('#wh-f-price').value    = item?.price    ?? ''
    container.querySelector('#wh-f-supplier').value = item?.supplier || ''
    container.querySelector('#wh-f-desc').value     = item?.description || ''
    container.querySelector('#wh-f-vat').checked    = !!item?.vatIncluded
    container.querySelector('#wh-f-excise').checked = !!item?.exciseIncluded
    container.querySelector('#wh-f-saletype').value = item?.saleType || 'copy'
    container.querySelector('#wh-f-link').value     = item?.link     || ''
    toggleQtyFields()
    updateTaxPreview()
    container.querySelector('#wh-modal').style.display = 'flex'
    setTimeout(() => container.querySelector('#wh-f-name').focus(), 50)
  }

  function updateTaxPreview() {
    const price    = parseFloat(container.querySelector('#wh-f-price').value) || 0
    const vatOn    = container.querySelector('#wh-f-vat').checked
    const exciseOn = container.querySelector('#wh-f-excise').checked
    const prev = container.querySelector('#wh-tax-preview')
    if (!vatOn && !exciseOn) { prev.style.display = 'none'; return }
    const vatAmount    = vatOn    ? Math.round(price * 20 / 120 * 100) / 100 : 0
    const exciseAmount = exciseOn ? Math.round(price * 5  / 105 * 100) / 100 : 0
    prev.style.display = 'block'
    prev.innerHTML = `
      Ціна без податків: <strong>₴${(price - vatAmount - exciseAmount).toLocaleString('uk-UA',{minimumFractionDigits:2})}</strong>
      ${vatOn    ? `· ПДВ 20%: <strong style="color:#4F8EF7">₴${vatAmount.toLocaleString('uk-UA',{minimumFractionDigits:2})}</strong>` : ''}
      ${exciseOn ? `· Акциз 5%: <strong style="color:#F59E0B">₴${exciseAmount.toLocaleString('uk-UA',{minimumFractionDigits:2})}</strong>` : ''}
    `
  }

  function closeModal() {
    container.querySelector('#wh-modal').style.display = 'none'
    editItem = null
  }

  async function save() {
    const name = container.querySelector('#wh-f-name').value.trim()
    if (!name) return
    const btn = container.querySelector('#wh-modal-save')
    btn.disabled = true; btn.textContent = '...'
    const category = container.querySelector('#wh-f-cat').value
    const isDigital = category === 'digital'
    const saleType  = container.querySelector('#wh-f-saletype').value

    const data = {
      name,
      category,
      unit:        isDigital ? null : (container.querySelector('#wh-f-unit').value.trim() || 'шт'),
      qty:         isDigital ? (saleType === 'license' ? 1 : null) : (Number(container.querySelector('#wh-f-qty').value) || 0),
      minQty:      isDigital ? 0 : (Number(container.querySelector('#wh-f-min').value) || 0),
      saleType:    isDigital ? saleType : null,
      link:        isDigital ? (container.querySelector('#wh-f-link').value.trim() || null) : null,
      price:       Number(container.querySelector('#wh-f-price').value) || 0,
      supplier:    isDigital ? null : (container.querySelector('#wh-f-supplier').value.trim() || null),
      description: container.querySelector('#wh-f-desc').value.trim() || null,
      vatIncluded:    isDigital ? false : container.querySelector('#wh-f-vat').checked,
      exciseIncluded: isDigital ? false : container.querySelector('#wh-f-excise').checked,
    }
    data.vatAmount    = data.vatIncluded    ? Math.round(data.price * 20 / 120 * 100) / 100 : 0
    data.exciseAmount = data.exciseIncluded ? Math.round(data.price * 5  / 105 * 100) / 100 : 0
    try {
      if (editItem) await updateDoc(doc(db, ...base, 'warehouse', editItem.id), { ...data, updatedAt: serverTimestamp() })
      else await addDoc(collection(db, ...base, 'warehouse'), { ...data, createdAt: serverTimestamp() })
      closeModal(); await load()
    } finally { btn.disabled = false; btn.textContent = 'Зберегти' }
  }

  await load()
}

function injectStyles() {
  document.getElementById('wh-styles')?.remove()
  const s = document.createElement('style')
  s.id = 'wh-styles'
  s.textContent = `
    .wh-page { padding:28px 32px; }
    .wh-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; }
    .wh-title { font-family:var(--font-display); font-size:26px; font-weight:800; margin-bottom:4px; display:flex; align-items:center; gap:10px; }
    .wh-subtitle { font-size:13px; color:var(--text-muted); }
    .wh-add-btn { padding:9px 22px; background:linear-gradient(135deg,#667eea,#4F8EF7); color:#fff; border:none; border-radius:var(--radius-md); font-size:13px; font-weight:700; cursor:pointer; transition:all .15s; }
    .wh-add-btn:hover { transform:translateY(-1px); box-shadow:0 4px 14px rgba(79,142,247,.4); }

    .wh-kpi-row { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:20px; }
    @media (max-width:900px) { .wh-kpi-row { grid-template-columns:repeat(2,1fr); } }
    .wh-kpi { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-xl); padding:18px 20px; transition:border-color .2s; }
    .wh-kpi:hover { border-color:rgba(255,255,255,.12); }
    .wh-kpi-icon { display:flex; align-items:center; margin-bottom:10px; }
    .wh-kpi-val { font-family:var(--font-display); font-size:26px; font-weight:800; margin-bottom:3px; }
    .wh-kpi-label { font-size:11px; color:var(--text-muted); font-weight:600; text-transform:uppercase; letter-spacing:.05em; }

    .wh-toolbar { display:flex; gap:10px; align-items:center; margin-bottom:16px; flex-wrap:wrap; }
    .wh-search { display:flex; align-items:center; gap:8px; background:var(--bg-secondary); border:1.5px solid var(--border); border-radius:var(--radius-md); padding:8px 14px; flex:1; max-width:300px; transition:border-color .15s; }
    .wh-search:focus-within { border-color:var(--accent-blue); }
    .wh-search input { flex:1; background:none; font-size:13px; color:var(--text-primary); outline:none; }
    .wh-cat-pills { display:flex; gap:6px; flex-wrap:wrap; }
    .wh-pill { padding:6px 13px; border-radius:var(--radius-full); font-size:12px; font-weight:600; color:var(--text-secondary); background:var(--bg-secondary); border:1px solid var(--border); cursor:pointer; transition:all .15s; }
    .wh-pill.active { background:var(--accent-blue); border-color:var(--accent-blue); color:#fff; }

    .wh-table-wrap { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-xl); overflow:hidden; }
    .wh-table { width:100%; border-collapse:collapse; }
    .wh-table th { text-align:left; padding:10px 14px; font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.05em; background:var(--bg-tertiary); border-bottom:1px solid var(--border); }
    .wh-table td { padding:12px 14px; border-bottom:1px solid var(--border); font-size:13px; vertical-align:middle; }
    .wh-table tr:last-child td { border-bottom:none; }
    .wh-table tr:hover td { background:rgba(255,255,255,.02); }
    .wh-row-low td { background:rgba(245,158,11,.04); }
    .wh-row-empty td { background:rgba(239,68,68,.04); opacity:.7; }
    .wh-item-name { font-weight:600; }
    .wh-item-desc { font-size:11px; color:var(--text-muted); }
    .wh-cat-badge { font-size:11px; font-weight:700; padding:3px 9px; border-radius:var(--radius-full); }
    .wh-tax-badge { display:inline-block; font-size:10px; font-weight:700; padding:1px 6px; border-radius:5px; margin-left:5px; }
    .wh-qty-cell { display:flex; align-items:center; gap:6px; }
    .wh-qty { font-weight:700; }
    .wh-qty-low { color:#F59E0B; }
    .wh-qty-empty { color:#EF4444; }
    .wh-low-badge { font-size:10px; font-weight:700; padding:2px 6px; border-radius:var(--radius-full); background:rgba(245,158,11,.15); color:#F59E0B; }
    .wh-empty-badge { font-size:10px; font-weight:700; padding:2px 6px; border-radius:var(--radius-full); background:rgba(239,68,68,.15); color:#EF4444; }
    .wh-row-btns { display:flex; gap:4px; opacity:0; transition:opacity .15s; }
    tr:hover .wh-row-btns { opacity:1; }
    .wh-rb { width:26px; height:26px; border-radius:6px; background:var(--bg-tertiary); border:1px solid var(--border); cursor:pointer; font-size:12px; display:flex; align-items:center; justify-content:center; transition:all .15s; }

    .wh-empty { text-align:center; padding:80px 32px; }
    .wh-empty-title { font-family:var(--font-display); font-size:18px; font-weight:700; margin-bottom:6px; }
    .wh-empty-desc { font-size:13px; color:var(--text-muted); }

    .wh-overlay { position:fixed; inset:0; background:rgba(0,0,0,.6); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; z-index:1000; }
    .wh-modal { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-xl); width:500px; max-width:95vw; box-shadow:0 24px 64px rgba(0,0,0,.4); animation:wh-in .18s ease; }
    @keyframes wh-in { from{opacity:0;transform:scale(.95)} to{opacity:1;transform:scale(1)} }
    .wh-modal-head { display:flex; justify-content:space-between; align-items:center; padding:20px 22px 0; }
    .wh-modal-head h2 { font-family:var(--font-display); font-size:18px; font-weight:800; }
    .wh-modal-head button { background:none; border:none; color:var(--text-muted); cursor:pointer; padding:4px 8px; border-radius:6px; display:flex; align-items:center; justify-content:center; }
    .wh-modal-body { padding:18px 22px; display:flex; flex-direction:column; gap:13px; }
    .wh-modal-foot { padding:14px 22px; border-top:1px solid var(--border); display:flex; gap:8px; justify-content:flex-end; }
    .wh-field label { display:block; font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.05em; margin-bottom:6px; }
    .wh-input { width:100%; box-sizing:border-box; padding:9px 13px; background:var(--bg-tertiary); border:1.5px solid var(--border); border-radius:var(--radius-md); font-size:13px; color:var(--text-primary); outline:none; font-family:inherit; transition:border-color .15s; }
    .wh-input:focus { border-color:var(--accent-blue); }
    .wh-form-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .wh-btn-pri { padding:9px 20px; background:linear-gradient(135deg,#667eea,#4F8EF7); color:#fff; border:none; border-radius:var(--radius-md); font-size:13px; font-weight:700; cursor:pointer; }
    .wh-btn-sec { padding:9px 20px; background:var(--bg-tertiary); border:1.5px solid var(--border); color:var(--text-primary); border-radius:var(--radius-md); font-size:13px; font-weight:600; cursor:pointer; }

    /* ── Shop integration ── */
    .wh-shop-btn { padding:8px 16px; background:var(--bg-secondary); border:1.5px solid var(--border); color:var(--text-secondary); border-radius:var(--radius-md); font-size:13px; font-weight:600; cursor:pointer; transition:all .15s; display:flex; align-items:center; gap:6px; }
    .wh-shop-btn:hover { border-color:var(--accent-blue); color:var(--text-primary); }
    .wh-shop-btn.connected { border-color:rgba(52,211,153,.4); color:#34D399; }
    .wh-sync-btn { padding:8px 16px; background:rgba(52,211,153,.1); border:1.5px solid rgba(52,211,153,.3); color:#34D399; border-radius:var(--radius-md); font-size:13px; font-weight:600; cursor:pointer; transition:all .15s; display:flex; align-items:center; gap:6px; }
    .wh-sync-btn:hover { background:rgba(52,211,153,.2); }
    .wh-sync-btn:disabled { opacity:.5; cursor:not-allowed; }
    .wh-shop-status-dot { display:inline-block; width:7px; height:7px; border-radius:50%; background:#34D399; box-shadow:0 0 6px rgba(52,211,153,.6); vertical-align:middle; }
    .wh-shop-badge { font-size:11px; margin-right:4px; }

    .wh-platform-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; }
    .wh-platform-btn { display:flex; flex-direction:column; align-items:center; gap:6px; padding:14px 8px; background:var(--bg-tertiary); border:1.5px solid var(--border); border-radius:var(--radius-md); cursor:pointer; font-size:12px; font-weight:600; color:var(--text-secondary); transition:all .15s; }
    .wh-platform-btn:hover { border-color:var(--accent-blue); color:var(--text-primary); }
    .wh-platform-btn.active { border-color:var(--accent-blue); background:rgba(79,142,247,.1); color:var(--accent-blue); }

    .wh-shop-connected-card { display:flex; align-items:center; gap:14px; padding:14px 16px; background:rgba(52,211,153,.07); border:1px solid rgba(52,211,153,.25); border-radius:var(--radius-md); margin-bottom:14px; }
    .wh-shop-platform-icon { font-size:28px; }
    .wh-shop-platform-name { font-weight:700; font-size:15px; }
    .wh-shop-platform-url  { font-size:12px; color:var(--text-muted); }
    .wh-shop-connected-dot { width:10px; height:10px; border-radius:50%; background:#34D399; box-shadow:0 0 8px rgba(52,211,153,.6); margin-left:auto; flex-shrink:0; }

    .wh-shop-msg { margin-top:10px; padding:10px 14px; border-radius:var(--radius-md); font-size:13px; }
    .wh-shop-msg.ok  { background:rgba(52,211,153,.1); color:#34D399; border:1px solid rgba(52,211,153,.25); }
    .wh-shop-msg.err { background:rgba(248,113,113,.1); color:#F87171; border:1px solid rgba(248,113,113,.25); }

    @keyframes wh-spin { to { transform:rotate(360deg) } }
  `
  document.head.appendChild(s)
}
