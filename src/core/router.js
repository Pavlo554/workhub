// src/core/router.js
const routes = {}
let currentRoute = null

export function addRoute(name, loader) {
  routes[name] = loader
}

export async function navigate(routeName, params = {}) {
  if (!routes[routeName]) {
    console.error(`[Router] Маршрут "${routeName}" не знайдено`)
    return
  }

  const container = document.getElementById('page-container')

  // Анімація виходу
  container.classList.add('page-exit')
  await sleep(150)

  // Завантажуємо і рендеримо сторінку
  const pageModule = await routes[routeName]()
  container.innerHTML = ''
  container.classList.remove('page-exit')
  container.classList.add('page-enter')

  await pageModule.render(container, params)
  currentRoute = routeName

  setTimeout(() => container.classList.remove('page-enter'), 300)

  // Підсвічуємо активний пункт меню
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.route === routeName)
  })
}

export function getCurrentRoute() {
  return currentRoute
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}