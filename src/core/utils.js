// src/core/utils.js

export function debounce(fn, delay = 300) {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

export function throttle(fn, interval = 100) {
  let last = 0
  return (...args) => {
    const now = Date.now()
    if (now - last >= interval) { last = now; fn(...args) }
  }
}
