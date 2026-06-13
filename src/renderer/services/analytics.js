import { getAnalytics, logEvent, setUserId, setUserProperties, isSupported }
  from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js'
import app from './firebase.js'

let _analytics = null

async function ga() {
  if (_analytics) return _analytics
  try {
    const ok = await isSupported()
    if (!ok) return null
    _analytics = getAnalytics(app)
  } catch {
    _analytics = null
  }
  return _analytics
}

export async function trackPage(routeName) {
  const a = await ga()
  if (!a) return
  try {
    logEvent(a, 'page_view', {
      page_title:    routeName,
      page_location: routeName,
    })
  } catch {}
}

export async function trackEvent(name, params = {}) {
  const a = await ga()
  if (!a) return
  try { logEvent(a, name, params) } catch {}
}

export async function identifyUser(uid, properties = {}) {
  const a = await ga()
  if (!a) return
  try {
    setUserId(a, uid)
    if (Object.keys(properties).length) setUserProperties(a, properties)
  } catch {}
}
