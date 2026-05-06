// src/core/router.js
const routes = {}
let currentRoute = null
const _cache = new Map() // routeName → HTMLElement

// Auth/onboarding routes: always render fresh, never cache
const FRESH_ROUTES = new Set([
  'login', 'register', 'choose-role', 'choose-profession', 'setup-business', 'join'
])

export function addRoute(name, loader) {
  routes[name] = loader
}

export async function navigate(routeName, params = {}) {
  if (!routes[routeName]) {
    console.error(`[Router] "${routeName}" not found`)
    return
  }

  const root = document.getElementById('page-container')

  // ── Auth/onboarding: always fresh, clear cache ────────────
  if (FRESH_ROUTES.has(routeName)) {
    for (const el of _cache.values()) el.remove()
    _cache.clear()
    root.innerHTML = ''
    root.classList.add('page-enter')
    const mod = await routes[routeName]()
    await mod.render(root, params)
    setTimeout(() => root.classList.remove('page-enter'), 250)
    currentRoute = routeName
    _syncNav(routeName)
    return
  }

  // ── Cached: show instantly, zero Firestore reads ──────────
  if (_cache.has(routeName)) {
    _showOnly(routeName)
    currentRoute = routeName
    _syncNav(routeName)
    return
  }

  // ── First visit: create slot, render, cache ───────────────
  _showOnly(null) // hide all existing slots
  const slot = document.createElement('div')
  slot.className = 'mod-slot'
  root.appendChild(slot)
  _cache.set(routeName, slot)

  slot.classList.add('page-enter')
  const mod = await routes[routeName]()
  await mod.render(slot, params)
  setTimeout(() => slot.classList.remove('page-enter'), 250)

  currentRoute = routeName
  _syncNav(routeName)
}

// Call on logout to free memory and force fresh render on next login
export function clearModuleCache() {
  for (const el of _cache.values()) el.remove()
  _cache.clear()
}

// Force a specific module to re-render next time it's visited
export function invalidateRoute(routeName) {
  const el = _cache.get(routeName)
  if (el) { el.remove(); _cache.delete(routeName) }
}

export function getCurrentRoute() {
  return currentRoute
}

function _showOnly(targetRoute) {
  for (const [name, el] of _cache) {
    el.style.display = name === targetRoute ? '' : 'none'
  }
}

function _syncNav(routeName) {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.route === routeName)
  })
}
