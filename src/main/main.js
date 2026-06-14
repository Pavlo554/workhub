const { app, BrowserWindow, ipcMain, shell, nativeImage } = require('electron')
const { autoUpdater } = require('electron-updater')
const path        = require('path')
const { spawn }   = require('child_process')
const os          = require('os')
const fs          = require('fs')

// ── Fix GPU/cache errors (quota_database, gpu_disk_cache) ─────
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')
app.commandLine.appendSwitch('disable-background-networking')

// Clear corrupted cache directories on startup
app.on('ready', () => {
  const cacheDir = path.join(app.getPath('userData'), 'GPUCache')
  try { fs.rmSync(cacheDir, { recursive: true, force: true }) } catch {}
})

// ── Timer tracker state ────────────────────────────────────
let trackerProcess = null
let trackingData   = null

// ── PowerShell script: compile Win32 API once, then loop ──
const PS_SCRIPT = [
  'Add-Type -TypeDefinition @"',
  'using System;',
  'using System.Runtime.InteropServices;',
  'public class WH {',
  '    [DllImport("user32.dll")]',
  '    public static extern IntPtr GetForegroundWindow();',
  '    [DllImport("user32.dll")]',
  '    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);',
  '}',
  '"@',
  'while ($true) {',
  '    try {',
  '        $h = [WH]::GetForegroundWindow()',
  '        $pid2 = [uint32]0',
  '        [WH]::GetWindowThreadProcessId($h, [ref]$pid2) | Out-Null',
  '        $p = Get-Process -Id $pid2 -ErrorAction SilentlyContinue',
  '        if ($p) {',
  '            Write-Host ($p.ProcessName + "|" + $p.MainWindowTitle)',
  '            [Console]::Out.Flush()',
  '        }',
  '    } catch {}',
  '    Start-Sleep -Milliseconds 2000',
  '}',
].join('\r\n')

function friendlyName(proc) {
  const map = {
    chrome: 'Google Chrome', firefox: 'Firefox', msedge: 'Microsoft Edge',
    opera: 'Opera', brave: 'Brave',
    Code: 'VS Code', code: 'VS Code', devenv: 'Visual Studio',
    idea64: 'IntelliJ IDEA', webstorm64: 'WebStorm',
    sublime_text: 'Sublime Text', notepad: 'Notepad', notepad__: 'Notepad++',
    WINWORD: 'Word', EXCEL: 'Excel', POWERPNT: 'PowerPoint',
    Slack: 'Slack', slack: 'Slack', Discord: 'Discord', discord: 'Discord',
    Telegram: 'Telegram', zoom: 'Zoom', Teams: 'Teams',
    spotify: 'Spotify', explorer: 'Explorer', figma: 'Figma',
    postman: 'Postman', obs64: 'OBS Studio', vlc: 'VLC',
    cmd: 'CMD', powershell: 'PowerShell',
    WindowsTerminal: 'Windows Terminal', wt: 'Windows Terminal',
  }
  return map[proc] || proc
}

function appIcon(proc) {
  const map = {
    chrome: '🌐', firefox: '🦊', msedge: '🌐', opera: '🌐', brave: '🦁',
    Code: '💻', code: '💻', devenv: '💻', idea64: '💻', webstorm64: '💻',
    sublime_text: '📝', notepad: '📝', notepad__: '📝',
    WINWORD: '📄', EXCEL: '📊', POWERPNT: '📊',
    Slack: '💬', slack: '💬', Discord: '💬', discord: '💬',
    Telegram: '✈️', zoom: '📹', Teams: '👥',
    spotify: '🎵', explorer: '📁', figma: '🎨',
    postman: '📮', obs64: '🎥', vlc: '🎬',
    cmd: '⌨️', powershell: '⌨️', WindowsTerminal: '⌨️', wt: '⌨️',
  }
  return map[proc] || '📱'
}

// ── IPC: timer:start ──────────────────────────────────────
ipcMain.handle('timer:start', async () => {
  if (trackerProcess) return { error: 'Already running' }

  const scriptPath = path.join(os.tmpdir(), 'wh-tracker.ps1')
  fs.writeFileSync(scriptPath, PS_SCRIPT, 'utf8')

  trackingData = {
    startTime:    Date.now(),
    sessions:     [],
    currentApp:   null,
    currentTitle: null,
    currentIcon:  null,
    currentStart: null,
  }

  trackerProcess = spawn('powershell', [
    '-NoProfile', '-NonInteractive',
    '-ExecutionPolicy', 'Bypass',
    '-File', scriptPath,
  ])

  let buffer = ''

  trackerProcess.stdout.on('data', (chunk) => {
    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop()

    for (const raw of lines) {
      const line = raw.trim()
      if (!line || !trackingData) continue

      const sep   = line.indexOf('|')
      const proc  = sep === -1 ? line : line.slice(0, sep)
      const title = sep === -1 ? ''   : line.slice(sep + 1).trim()
      const now   = Date.now()

      const lp = proc.toLowerCase()
      if (['powershell', 'cmd', 'conhost', 'workhub', 'electron'].includes(lp)) continue

      if (trackingData.currentApp && trackingData.currentApp !== proc) {
        trackingData.sessions.push({
          app:      trackingData.currentApp,
          icon:     trackingData.currentIcon,
          title:    trackingData.currentTitle || '',
          name:     friendlyName(trackingData.currentApp),
          startMs:  trackingData.currentStart,
          endMs:    now,
          duration: now - trackingData.currentStart,
        })
      }

      if (!trackingData.currentApp || trackingData.currentApp !== proc) {
        trackingData.currentApp   = proc
        trackingData.currentTitle = title
        trackingData.currentIcon  = appIcon(proc)
        trackingData.currentStart = now
      }
    }
  })

  trackerProcess.stderr.on('data', () => {})
  trackerProcess.on('close', () => { trackerProcess = null })

  return { ok: true, startTime: trackingData.startTime }
})

// ── IPC: timer:stop ───────────────────────────────────────
ipcMain.handle('timer:stop', async () => {
  if (!trackerProcess || !trackingData) return { error: 'Not running' }

  const now = Date.now()

  if (trackingData.currentApp) {
    trackingData.sessions.push({
      app:      trackingData.currentApp,
      icon:     trackingData.currentIcon,
      title:    trackingData.currentTitle || '',
      name:     friendlyName(trackingData.currentApp),
      startMs:  trackingData.currentStart,
      endMs:    now,
      duration: now - trackingData.currentStart,
    })
  }

  trackerProcess.kill()
  trackerProcess = null

  const totals = {}
  for (const s of trackingData.sessions) {
    const key = s.app.toLowerCase()
    if (!totals[key]) {
      totals[key] = { app: s.app, name: s.name, icon: s.icon, totalMs: 0, sessions: 0 }
    }
    totals[key].totalMs  += s.duration
    totals[key].sessions += 1
  }

  const result = {
    startTime: trackingData.startTime,
    endTime:   now,
    totalMs:   now - trackingData.startTime,
    apps:      Object.values(totals).sort((a, b) => b.totalMs - a.totalMs),
    sessions:  trackingData.sessions,
  }

  trackingData = null
  return result
})

// ── IPC: timer:status ─────────────────────────────────────
ipcMain.handle('timer:status', async () => {
  if (!trackingData) return { tracking: false }
  return {
    tracking:     true,
    startTime:    trackingData.startTime,
    elapsed:      Date.now() - trackingData.startTime,
    currentApp:   trackingData.currentApp ? friendlyName(trackingData.currentApp) : null,
    currentIcon:  trackingData.currentIcon  || null,
    currentTitle: trackingData.currentTitle || null,
  }
})

// ── IPC: tg:fetchChannel ──────────────────────────────────
const https = require('https')

function tgApiRequest(token, method, params = {}) {
  return new Promise((resolve, reject) => {
    const query = new URLSearchParams(params).toString()
    const url   = `https://api.telegram.org/bot${token}/${method}${query ? '?' + query : ''}`
    https.get(url, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.ok) resolve(json.result)
          else reject(new Error(json.description || 'Telegram API error'))
        } catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

ipcMain.handle('tg:fetchChannel', async (_, { token, username }) => {
  if (!token || !username) return { error: 'Потрібен токен і username каналу' }
  let raw = username.trim()
  if (raw.includes('t.me/')) raw = raw.split('t.me/').pop().replace(/\//g, '')
  const chatId = raw.startsWith('@') ? raw : '@' + raw
  try {
    const [chat, count] = await Promise.all([
      tgApiRequest(token, 'getChat',            { chat_id: chatId }),
      tgApiRequest(token, 'getChatMemberCount', { chat_id: chatId }),
    ])
    return {
      id:          chat.id,
      title:       chat.title,
      username:    chat.username,
      description: chat.description || '',
      subscribers: count,
      link:        chat.username ? `https://t.me/${chat.username}` : null,
    }
  } catch (err) {
    return { error: err.message }
  }
})

// ── IPC: PDF generation (printToPDF via hidden BrowserWindow) ────────────────
ipcMain.handle('pdf:generate', async (event, { html, filename }) => {
  const tmpHtml = path.join(os.tmpdir(), `wh_${Date.now()}.html`)
  const outPdf  = path.join(os.tmpdir(), filename || `invoice_${Date.now()}.pdf`)
  let win = null
  try {
    fs.writeFileSync(tmpHtml, html, 'utf8')
    win = new BrowserWindow({
      show: false, width: 900, height: 1200,
      webPreferences: { sandbox: false, contextIsolation: true },
    })
    await win.loadFile(tmpHtml)
    await new Promise(r => setTimeout(r, 700))
    const buf = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
    win.destroy(); win = null
    try { fs.unlinkSync(tmpHtml) } catch {}
    fs.writeFileSync(outPdf, buf)
    await shell.openPath(outPdf)
    return { success: true }
  } catch (e) {
    if (win) { win.destroy(); win = null }
    try { fs.unlinkSync(tmpHtml) } catch {}
    return { error: e.message }
  }
})

// ── Window ────────────────────────────────────────────────
let mainWindow

function createWindow() {
  const appIcon = nativeImage.createFromPath(path.join(__dirname, '../../assets/icon.png'))

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0D0F14',  // matches app bg — no white flash
    icon: appIcon,
    webPreferences: {
      preload:          path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      // Speed optimizations
      backgroundThrottling: false,  // don't throttle when window is hidden
      spellcheck:           false,  // not needed in desktop app
      enableWebSQL:         false,
    },
    show: false,
    paintWhenInitiallyHidden: true,  // pre-render before show
  })

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))

  // Show as soon as first paint is done (faster than ready-to-show)
  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow.setIcon(appIcon)
    mainWindow.show()
  })

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools()
    startHotReload(mainWindow)
  }
}

// ── Hot-reload (dev only) ─────────────────────────────────
function startHotReload(win) {
  const chokidar = require('chokidar')
  const srcDir   = path.join(__dirname, '../..')
  let reloadTimer = null

  chokidar.watch([
    path.join(srcDir, 'src/renderer'),
    path.join(srcDir, 'src/core'),
  ], {
    ignoreInitial: true,
    ignored: /(^|[/\\])\..|(\.map$)/,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 50 },
  }).on('all', (event, filePath) => {
    clearTimeout(reloadTimer)
    reloadTimer = setTimeout(() => {
      if (!win.isDestroyed()) {
        const rel = filePath.replace(srcDir, '').replace(/\\/g, '/')
        console.log(`[hot-reload] ${event}: ${rel}`)
        win.webContents.reload()
      }
    }, 800)
  })
}

// ── Documents (local file storage) ────────────────────────
const DOCS_DIR = path.join(app.getPath('userData'), 'documents')
if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true })

ipcMain.handle('docs:save', async (_, { fileName, buffer, uid }) => {
  try {
    const userDir = path.join(DOCS_DIR, uid || 'default')
    if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true })
    const safe     = fileName.replace(/[^a-zA-Zа-яА-ЯёЁіІїЇєЄ0-9._-]/g, '_')
    const destName = `${Date.now()}_${safe}`
    const destPath = path.join(userDir, destName)
    fs.writeFileSync(destPath, Buffer.from(buffer))
    return { success: true, localPath: destPath }
  } catch (e) { return { error: e.message } }
})

ipcMain.handle('docs:open', async (_, { localPath }) => {
  try { await shell.openPath(localPath); return { success: true } }
  catch (e) { return { error: e.message } }
})

ipcMain.handle('docs:show', async (_, { localPath }) => {
  shell.showItemInFolder(localPath)
  return { success: true }
})

ipcMain.handle('docs:delete', async (_, { localPath }) => {
  try {
    if (fs.existsSync(localPath)) fs.unlinkSync(localPath)
    return { success: true }
  } catch (e) { return { error: e.message } }
})

// ── IPC: open-external ────────────────────────────────────────
ipcMain.handle('open-external', async (_, url) => {
  try { await shell.openExternal(url); return { ok: true } }
  catch (e) { return { error: e.message } }
})

// ── IPC: shop:request (bypasses renderer CSP for store APIs) ──
const http  = require('http')
const { URL: NodeURL } = require('url')

ipcMain.handle('shop:request', async (_, { url, headers = {} }) => {
  return new Promise((resolve) => {
    try {
      const parsed  = new NodeURL(url)
      const lib     = parsed.protocol === 'https:' ? https : http
      const options = {
        hostname: parsed.hostname,
        port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path:     parsed.pathname + parsed.search,
        method:   'GET',
        headers:  { 'Accept': 'application/json', 'User-Agent': 'WorkHub/1.0', ...headers },
        timeout:  15000,
      }
      const req = lib.request(options, (res) => {
        let data = ''
        res.on('data', chunk => { data += chunk })
        res.on('end', () => resolve({ status: res.statusCode, body: data }))
      })
      req.on('error',   err => resolve({ error: err.message }))
      req.on('timeout', ()  => { req.destroy(); resolve({ error: 'Request timeout' }) })
      req.end()
    } catch (err) { resolve({ error: err.message }) }
  })
})

// Titlebar buttons
ipcMain.on('window-minimize', () => mainWindow.minimize())
ipcMain.on('window-maximize', () => {
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
})
ipcMain.on('window-close', () => mainWindow.close())

// ── Auto-updater ──────────────────────────────────────────
function setupUpdater() {
  autoUpdater.autoDownload    = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available',  (info) => mainWindow?.webContents.send('updater:available',  info))
  autoUpdater.on('download-progress', (p)    => mainWindow?.webContents.send('updater:progress',   p))
  autoUpdater.on('update-downloaded', (info) => mainWindow?.webContents.send('updater:downloaded', info))
  autoUpdater.on('error', (err) => console.error('[updater]', err.message))
}

ipcMain.handle('updater:install', () => {
  autoUpdater.quitAndInstall(false, true)
})

app.whenReady().then(() => {
  createWindow()
  if (app.isPackaged) {
    setupUpdater()
    autoUpdater.checkForUpdates().catch(() => {})
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})


app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
