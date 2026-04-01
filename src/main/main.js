const { app, BrowserWindow, ipcMain } = require('electron')
const path        = require('path')
const { spawn }   = require('child_process')
const os          = require('os')
const fs          = require('fs')

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
  const chatId = username.startsWith('@') ? username : '@' + username
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

// ── Window ────────────────────────────────────────────────
let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0D0F14',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  })

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools()
  }
}

// Titlebar buttons
ipcMain.on('window-minimize', () => mainWindow.minimize())
ipcMain.on('window-maximize', () => {
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
})
ipcMain.on('window-close', () => mainWindow.close())

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
