// src/main/ipc-handlers.js
const { ipcMain, app, shell, dialog } = require('electron')
const { spawn }   = require('child_process')
const os          = require('os')
const fs          = require('fs')
const path        = require('path')

// ── Стан трекера ──────────────────────────────────────────
let trackerProcess = null
let trackingData   = null

// ── PowerShell скрипт: компілюємо Win32 API один раз ─────
const PS_SCRIPT = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class WH {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@
while ($true) {
    try {
        $h   = [WH]::GetForegroundWindow()
        $pid = [uint32]0
        [WH]::GetWindowThreadProcessId($h, [ref]$pid) | Out-Null
        $p   = Get-Process -Id $pid -ErrorAction SilentlyContinue
        if ($p) {
            Write-Host ("$($p.ProcessName)|$($p.MainWindowTitle)")
            [Console]::Out.Flush()
        }
    } catch {}
    Start-Sleep -Milliseconds 2000
}
`

// ── Допоміжні функції ─────────────────────────────────────
function friendlyName(processName) {
  const map = {
    chrome:          'Google Chrome',
    firefox:         'Firefox',
    msedge:          'Microsoft Edge',
    opera:           'Opera',
    brave:           'Brave',
    Code:            'VS Code',
    code:            'VS Code',
    devenv:          'Visual Studio',
    idea64:          'IntelliJ IDEA',
    webstorm64:      'WebStorm',
    sublime_text:    'Sublime Text',
    notepad:         'Notepad',
    notepad__:       'Notepad++',
    WINWORD:         'Microsoft Word',
    EXCEL:           'Microsoft Excel',
    POWERPNT:        'PowerPoint',
    Slack:           'Slack',
    slack:           'Slack',
    Discord:         'Discord',
    discord:         'Discord',
    Telegram:        'Telegram',
    zoom:            'Zoom',
    Teams:           'Microsoft Teams',
    spotify:         'Spotify',
    explorer:        'Провідник',
    cmd:             'Command Prompt',
    powershell:      'PowerShell',
    WindowsTerminal: 'Windows Terminal',
    wt:              'Windows Terminal',
    figma:           'Figma',
    postman:         'Postman',
    obs64:           'OBS Studio',
    vlc:             'VLC',
  }
  return map[processName] || processName
}

function appIcon(processName) {
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
  return map[processName] || '📱'
}

// ── IPC: Старт таймера ────────────────────────────────────
ipcMain.handle('timer:start', async () => {
  if (trackerProcess) return { error: 'Вже запущено' }

  // Записуємо PS скрипт у temp файл
  const scriptPath = path.join(os.tmpdir(), 'wh-tracker.ps1')
  fs.writeFileSync(scriptPath, PS_SCRIPT, 'utf8')

  trackingData = {
    startTime:    Date.now(),
    sessions:     [],   // { app, icon, title, startMs, endMs, duration }
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
    buffer = lines.pop() // зберігаємо неповний рядок

    for (const raw of lines) {
      const line = raw.trim()
      if (!line || !trackingData) continue

      const sep   = line.indexOf('|')
      const proc  = sep === -1 ? line : line.slice(0, sep)
      const title = sep === -1 ? ''   : line.slice(sep + 1).trim()
      const now   = Date.now()

      // Ігноруємо сам Electron / PowerShell трекер
      if (['powershell', 'cmd', 'conhost'].includes(proc.toLowerCase())) continue

      if (trackingData.currentApp && trackingData.currentApp !== proc) {
        // Збережемо попередню сесію
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

  return { success: true, startTime: trackingData.startTime }
})

// ── IPC: Стоп таймера ─────────────────────────────────────
ipcMain.handle('timer:stop', async () => {
  if (!trackerProcess || !trackingData) return { error: 'Не запущено' }

  const now = Date.now()

  // Зберігаємо останню сесію
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

  // Агрегуємо по додатках
  const totals = {}
  for (const s of trackingData.sessions) {
    const key = s.app.toLowerCase()
    if (!totals[key]) {
      totals[key] = {
        app:      s.app,
        name:     s.name,
        icon:     s.icon,
        totalMs:  0,
        sessions: 0,
        lastTitle: s.title,
      }
    }
    totals[key].totalMs  += s.duration
    totals[key].sessions += 1
    totals[key].lastTitle = s.title || totals[key].lastTitle
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

// ── IPC: Статус (поточний стан) ───────────────────────────
ipcMain.handle('timer:status', async () => {
  if (!trackingData) return { tracking: false }
  return {
    tracking:     true,
    startTime:    trackingData.startTime,
    elapsed:      Date.now() - trackingData.startTime,
    currentApp:   trackingData.currentApp  ? friendlyName(trackingData.currentApp) : null,
    currentIcon:  trackingData.currentIcon || null,
    currentTitle: trackingData.currentTitle || null,
  }
})

// ── IPC: Telegram канал ────────────────────────────────────
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
      id:           chat.id,
      title:        chat.title,
      username:     chat.username,
      description:  chat.description || '',
      photo:        chat.photo || null,
      subscribers:  count,
      link:         chat.username ? `https://t.me/${chat.username}` : null,
    }
  } catch (err) {
    return { error: err.message }
  }
})

// ── IPC: Документи (локальне зберігання) ─────────────────────────────────────
const DOCS_DIR = path.join(app.getPath('userData'), 'documents')
if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true })

// Збереження файлу: отримуємо ArrayBuffer з renderer, копіюємо в userData/documents/
ipcMain.handle('docs:save', async (_, { fileName, buffer, uid }) => {
  try {
    const userDir = path.join(DOCS_DIR, uid || 'default')
    if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true })

    const timestamp = Date.now()
    const safe      = fileName.replace(/[^a-zA-Zа-яА-ЯёЁіІїЇєЄ0-9._-]/g, '_')
    const destName  = `${timestamp}_${safe}`
    const destPath  = path.join(userDir, destName)

    fs.writeFileSync(destPath, Buffer.from(buffer))
    return { success: true, localPath: destPath, fileName: destName }
  } catch (e) {
    return { error: e.message }
  }
})

// Відкрити файл у системному переглядачі
ipcMain.handle('docs:open', async (_, { localPath }) => {
  try {
    await shell.openPath(localPath)
    return { success: true }
  } catch (e) {
    return { error: e.message }
  }
})

// Показати файл у провіднику
ipcMain.handle('docs:show', async (_, { localPath }) => {
  shell.showItemInFolder(localPath)
  return { success: true }
})

// Видалити файл
ipcMain.handle('docs:delete', async (_, { localPath }) => {
  try {
    if (fs.existsSync(localPath)) fs.unlinkSync(localPath)
    return { success: true }
  } catch (e) {
    return { error: e.message }
  }
})
