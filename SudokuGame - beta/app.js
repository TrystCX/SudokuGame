(() => {
  const DIFFS = ["easy", "medium", "hard", "diabolical"]
  const DIFF_LABEL = { easy: "简单", medium: "中等", hard: "困难", diabolical: "极限", dev: "开发" }
  const LS_KEYS = {
    settings: "sudoku.settings.v1",
    progress: "sudoku.progress.v1",
    activeMap: "sudoku.activeMap.v1",
    activeLegacy: "sudoku.active.v1",
    lastActiveKey: "sudoku.lastActiveKey.v1",
  }

  const qs = (sel, el = document) => el.querySelector(sel)
  const qsa = (sel, el = document) => Array.from(el.querySelectorAll(sel))
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n))

  const formatTime = (ms) => {
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    const r = s % 60
    return String(m).padStart(2, "0") + ":" + String(r).padStart(2, "0")
  }

  const toastEl = () => qs("#toast")
  let toastTimer = 0
  const toast = (msg) => {
    const el = toastEl()
    el.textContent = msg
    el.classList.remove("hidden")
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => el.classList.add("hidden"), 1600)
  }

  const safeJsonParse = (s, fallback) => {
    try {
      const v = JSON.parse(s)
      return v ?? fallback
    } catch {
      return fallback
    }
  }

  const loadSettings = () => {
    const def = {
      sound: true,
      uiBrightness: 100,
      fontSize: "m",
      palette: "green",
      customTheme: { enabled: false, vars: {} },
      highlightRegion: true,
      highlightSame: true,
      highlightSameNotes: true,
      highlightSameNotesDigit: true,
      doubleClickFillSingleNote: false,
      highlightUnique: true,
      numberFirst: false,
      showHotkeysHint: true,
      keybinds: {
        up: "KeyW",
        left: "KeyA",
        down: "KeyS",
        right: "KeyD",
        hintPrev: "KeyQ",
        hintNext: "KeyE",
        note: "KeyR",
        lock: "KeyF",
        undo: "KeyZ",
        erase: "KeyX",
      },
      devUnlocked: false,
      devMode: false,
      traceDrawerAutoOpened: false,
    }
    const raw = localStorage.getItem(LS_KEYS.settings)
    if (!raw) return def
    const v = safeJsonParse(raw, def)
    const out = { ...def, ...v }
    delete out.showForcing
    delete out.showForcingCell
    return out
  }

  const saveSettings = (s) => localStorage.setItem(LS_KEYS.settings, JSON.stringify(s))

  const loadProgress = () => {
    const def = { easy: {}, medium: {}, hard: {}, diabolical: {} }
    const raw = localStorage.getItem(LS_KEYS.progress)
    if (!raw) return def
    const v = safeJsonParse(raw, def)
    return { ...def, ...v }
  }

  const saveProgress = (p) => localStorage.setItem(LS_KEYS.progress, JSON.stringify(p))

  const gameKey = (diff, idx) => diff + ":" + idx

  const loadActiveMap = () => {
    const raw = localStorage.getItem(LS_KEYS.activeMap)
    const map = raw ? safeJsonParse(raw, {}) : {}
    const legacyRaw = localStorage.getItem(LS_KEYS.activeLegacy)
    if (legacyRaw) {
      const legacy = safeJsonParse(legacyRaw, null)
      if (legacy && legacy.difficulty && Number.isFinite(legacy.levelIndex)) {
        map[gameKey(legacy.difficulty, legacy.levelIndex)] = legacy
        localStorage.removeItem(LS_KEYS.activeLegacy)
        localStorage.setItem(LS_KEYS.activeMap, JSON.stringify(map))
        localStorage.setItem(LS_KEYS.lastActiveKey, gameKey(legacy.difficulty, legacy.levelIndex))
      }
    }
    return map
  }

  const saveActiveMap = (map) => localStorage.setItem(LS_KEYS.activeMap, JSON.stringify(map))

  const getActive = (diff, idx) => {
    const map = loadActiveMap()
    return map[gameKey(diff, idx)] || null
  }

  const setActive = (diff, idx, value) => {
    const map = loadActiveMap()
    const k = gameKey(diff, idx)
    if (value) map[k] = value
    else delete map[k]
    saveActiveMap(map)
  }

  const loadLastActiveKey = () => localStorage.getItem(LS_KEYS.lastActiveKey) || ""
  const saveLastActiveKey = (k) => localStorage.setItem(LS_KEYS.lastActiveKey, k)

  const clearAll = () => {
    localStorage.removeItem(LS_KEYS.settings)
    localStorage.removeItem(LS_KEYS.progress)
    localStorage.removeItem(LS_KEYS.activeMap)
    localStorage.removeItem(LS_KEYS.activeLegacy)
    localStorage.removeItem(LS_KEYS.lastActiveKey)
  }

  const base36Pad2 = (n) => n.toString(36).padStart(2, "0")
  const fromBase36 = (s) => parseInt(s, 36) || 0

  const encodeUtf8B64 = (obj) => {
    const s = JSON.stringify(obj)
    const u = encodeURIComponent(s).replace(/%([0-9A-F]{2})/g, (_, p) => String.fromCharCode(parseInt(p, 16)))
    return btoa(u)
  }
  const decodeUtf8B64 = (b64) => {
    const u = atob(b64)
    const s = decodeURIComponent(
      Array.from(u)
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")
    )
    return JSON.parse(s)
  }

  const levelData = () => window.SUDOKU_LEVEL_DATA || null

  const getPuzzle = (diff, index) => {
    const d = levelData()
    if (!d || !d[diff]) return null
    const obj = d[diff]
    if (index < 0 || index >= obj.count) return null
    const start = index * 81
    return obj.data.slice(start, start + 81)
  }

  const digitsFromString = (s) => {
    const out = new Uint8Array(81)
    for (let i = 0; i < 81; i++) out[i] = s.charCodeAt(i) - 48
    return out
  }
  const digitsToString = (arr) => Array.from(arr).map((n) => String(n)).join("")

  const bitCount = (m) => {
    let c = 0
    while (m) {
      m &= m - 1
      c++
    }
    return c
  }

  const solveSudoku = (puzzleStr) => {
    const grid = digitsFromString(puzzleStr)
    const rowUsed = new Uint16Array(9)
    const colUsed = new Uint16Array(9)
    const boxUsed = new Uint16Array(9)

    const boxIndex = (r, c) => ((r / 3) | 0) * 3 + ((c / 3) | 0)
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const v = grid[r * 9 + c]
        if (!v) continue
        const b = boxIndex(r, c)
        const bit = 1 << (v - 1)
        if ((rowUsed[r] & bit) || (colUsed[c] & bit) || (boxUsed[b] & bit)) return null
        rowUsed[r] |= bit
        colUsed[c] |= bit
        boxUsed[b] |= bit
      }
    }

    const findNext = () => {
      let bestIdx = -1
      let bestMask = 0
      let bestCount = 10
      for (let i = 0; i < 81; i++) {
        if (grid[i]) continue
        const r = (i / 9) | 0
        const c = i % 9
        const b = boxIndex(r, c)
        const used = rowUsed[r] | colUsed[c] | boxUsed[b]
        const mask = (~used) & 0x1ff
        const cnt = bitCount(mask)
        if (cnt === 0) return { idx: i, mask: 0, cnt: 0 }
        if (cnt < bestCount) {
          bestCount = cnt
          bestIdx = i
          bestMask = mask
          if (cnt === 1) break
        }
      }
      return { idx: bestIdx, mask: bestMask, cnt: bestCount }
    }

    const dfs = () => {
      const { idx, mask, cnt } = findNext()
      if (idx === -1) return true
      if (cnt === 0) return false
      const r = (idx / 9) | 0
      const c = idx % 9
      const b = boxIndex(r, c)
      let m = mask
      while (m) {
        const bit = m & -m
        m ^= bit
        const v = (Math.log2(bit) | 0) + 1
        grid[idx] = v
        rowUsed[r] |= bit
        colUsed[c] |= bit
        boxUsed[b] |= bit
        if (dfs()) return true
        grid[idx] = 0
        rowUsed[r] ^= bit
        colUsed[c] ^= bit
        boxUsed[b] ^= bit
      }
      return false
    }

    if (!dfs()) return null
    return digitsToString(grid)
  }

  const peersOf = (() => {
    const peers = Array.from({ length: 81 }, () => [])
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const idx = r * 9 + c
        const set = new Set()
        for (let i = 0; i < 9; i++) {
          if (i !== c) set.add(r * 9 + i)
          if (i !== r) set.add(i * 9 + c)
        }
        const br = ((r / 3) | 0) * 3
        const bc = ((c / 3) | 0) * 3
        for (let rr = br; rr < br + 3; rr++) {
          for (let cc = bc; cc < bc + 3; cc++) {
            const j = rr * 9 + cc
            if (j !== idx) set.add(j)
          }
        }
        peers[idx] = Array.from(set)
      }
    }
    return peers
  })()

  const computeCandidateMask = (grid, idx) => {
    const r = (idx / 9) | 0
    const c = idx % 9
    const br = ((r / 3) | 0) * 3
    const bc = ((c / 3) | 0) * 3
    let used = 0
    for (let i = 0; i < 9; i++) {
      const v1 = grid[r * 9 + i]
      const v2 = grid[i * 9 + c]
      if (v1) used |= 1 << (v1 - 1)
      if (v2) used |= 1 << (v2 - 1)
    }
    for (let rr = br; rr < br + 3; rr++) {
      for (let cc = bc; cc < bc + 3; cc++) {
        const v = grid[rr * 9 + cc]
        if (v) used |= 1 << (v - 1)
      }
    }
    return (~used) & 0x1ff
  }

  const recomputeAllConflicts = (grid) => {
    const conflicts = new Uint8Array(81)
    const markDup = (indices) => {
      const map = new Map()
      for (const idx of indices) {
        const v = grid[idx]
        if (!v) continue
        const arr = map.get(v) || []
        arr.push(idx)
        map.set(v, arr)
      }
      for (const [, arr] of map.entries()) {
        if (arr.length >= 2) for (const idx of arr) conflicts[idx] = 1
      }
    }
    for (let r = 0; r < 9; r++) {
      const row = []
      for (let c = 0; c < 9; c++) row.push(r * 9 + c)
      markDup(row)
    }
    for (let c = 0; c < 9; c++) {
      const col = []
      for (let r = 0; r < 9; r++) col.push(r * 9 + c)
      markDup(col)
    }
    for (let br = 0; br < 3; br++) {
      for (let bc = 0; bc < 3; bc++) {
        const box = []
        for (let r = br * 3; r < br * 3 + 3; r++) {
          for (let c = bc * 3; c < bc * 3 + 3; c++) box.push(r * 9 + c)
        }
        markDup(box)
      }
    }
    return conflicts
  }

  const isSolved = (grid, givens, errors, conflicts) => {
    for (let i = 0; i < 81; i++) {
      if (grid[i] === 0) return false
      if (!givens[i] && errors[i]) return false
      if (conflicts[i]) return false
    }
    return true
  }

  const sound = (() => {
    let ctx = null
    const ensure = () => {
      if (ctx) return ctx
      ctx = new (window.AudioContext || window.webkitAudioContext)()
      return ctx
    }
    const tone = (freq, ms, type, gain) => {
      const c = ensure()
      const o = c.createOscillator()
      const g = c.createGain()
      o.type = type
      o.frequency.value = freq
      g.gain.value = 0
      o.connect(g)
      g.connect(c.destination)
      const t0 = c.currentTime
      g.gain.setValueAtTime(0, t0)
      g.gain.linearRampToValueAtTime(gain, t0 + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000)
      o.start()
      o.stop(t0 + ms / 1000 + 0.02)
    }
    const noise = (ms, gain) => {
      const c = ensure()
      const bufferSize = c.sampleRate * (ms / 1000)
      const buffer = c.createBuffer(1, bufferSize, c.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize)
      const src = c.createBufferSource()
      src.buffer = buffer
      const g = c.createGain()
      g.gain.value = gain
      src.connect(g)
      g.connect(c.destination)
      src.start()
      src.stop(c.currentTime + ms / 1000)
    }
    return {
      correct() {
        tone(880, 120, "triangle", 0.25)
        tone(1320, 90, "sine", 0.16)
      },
      wrong() {
        tone(180, 240, "sawtooth", 0.22)
      },
      note() {
        noise(90, 0.06)
      },
      win() {
        tone(523.25, 140, "triangle", 0.18)
        setTimeout(() => tone(659.25, 140, "triangle", 0.18), 110)
        setTimeout(() => tone(783.99, 180, "triangle", 0.2), 220)
        setTimeout(() => tone(1046.5, 220, "sine", 0.16), 340)
      },
    }
  })()

  const ui = {
    screenHome: qs("#screen-home"),
    screenLevels: qs("#screen-levels"),
    screenGame: qs("#screen-game"),
    tabs: qs("#difficulty-tabs"),
    levelsScroll: qs("#levels-scroll"),
    levelsSpacer: qs("#levels-spacer"),
    levelsViewport: qs("#levels-viewport"),
    levelsStatus: qs("#levels-status"),
    levelsDiff: qs("#levels-diff"),
    btnContinue: qs("#btn-continue"),
    board: qs("#board"),
    pad: qs("#pad"),
    hintPanel: qs("#hint-panel"),
    hintBadge: qs("#hint-badge"),
    hintMessage: qs("#hint-message"),
    btnHintClose: qs("#btn-hint-close"),
    btnHintPrev: qs("#btn-hint-prev"),
    btnHintNext: qs("#btn-hint-next"),
    btnHintTrace: qs("#btn-hint-trace"),
    btnHintApply: qs("#btn-hint-apply"),
    traceBackdrop: qs("#trace-backdrop"),
    traceDrawer: qs("#trace-drawer"),
    traceBranch: qs("#trace-branch"),
    btnTraceClose: qs("#btn-trace-close"),
    traceList: qs("#trace-list"),
    btnTracePrev: qs("#btn-trace-prev"),
    btnTraceNext: qs("#btn-trace-next"),
    btnTraceEnd: qs("#btn-trace-end"),
    btnBack: qs("#btn-back"),
    btnLevelsBack: qs("#btn-levels-back"),
      btnHome: qs("#btn-home"),
    btnPause: qs("#btn-pause"),
    pauseOverlay: qs("#pause-overlay"),
    btnResume: qs("#btn-resume"),
    btnRestart: qs("#btn-restart"),
    btnPauseSettings: qs("#btn-pause-settings"),
    btnExit: qs("#btn-exit"),
    btnUndo: qs("#btn-undo"),
    btnErase: qs("#btn-erase"),
    btnHint: qs("#btn-hint"),
    btnNote: qs("#btn-note"),
    previewActions: qs("#preview-actions"),
    btnPreviewUndo: qs("#btn-preview-undo"),
    btnPreviewApply: qs("#btn-preview-apply"),
    gameDifficulty: qs("#game-difficulty"),
    gameTimer: qs("#game-timer"),
    settingsModal: qs("#settings-modal"),
    modalBackdrop: qs("#modal-backdrop"),
    btnSettings: qs("#btn-settings"),
    btnSettings2: qs("#btn-settings-2"),
    btnSettings3: qs("#btn-settings-3"),
    btnSettingsBack: qs("#btn-settings-back"),
    settingsTitle: qs("#settings-title"),
    btnSettingsClose: qs("#btn-settings-close"),
    settingsPageMain: qs("#settings-page-main"),
    settingsPageHighlight: qs("#settings-page-highlight"),
    settingsPageTheme: qs("#settings-page-theme"),
    settingsPageHotkeys: qs("#settings-page-hotkeys"),
    settingsPageKeyboardShortcuts: qs("#settings-page-keyboard-shortcuts"),
    settingsPageShare: qs("#settings-page-share"),
    settingsPageDev: qs("#settings-page-dev"),
    btnHighlightOpen: qs("#btn-highlight-open"),
    btnThemeOpen: qs("#btn-theme-open"),
    btnShareOpen: qs("#btn-share-open"),
    btnHotkeysOpen: qs("#btn-hotkeys-open"),
    btnKeyboardShortcutsOpen: qs("#btn-keyboard-shortcuts-open"),
    btnRestoreDefaultKeybinds: qs("#btn-restore-default-keybinds"),
    btnDevOpen: qs("#btn-dev-open"),
    btnDiffEasy: qs("#btn-diff-easy"),
    btnDiffMedium: qs("#btn-diff-medium"),
    btnDiffHard: qs("#btn-diff-hard"),
    btnDiffDiabolical: qs("#btn-diff-diabolical"),
    settingSound: qs("#setting-sound"),
    settingBrightness: qs("#setting-brightness"),
    settingBrightnessValue: qs("#setting-brightness-value"),
    settingHighlightRegion: qs("#setting-highlight-region"),
    settingHighlightSame: qs("#setting-highlight-same"),
    settingHighlightSameNotes: qs("#setting-highlight-same-notes"),
    settingRowHighlightSameNotesMode: qs("#setting-row-highlight-same-notes-mode"),
    settingHighlightSameNotesDigit: qs("#setting-highlight-same-notes-digit"),
    settingDoubleClickFillNote: qs("#setting-double-click-fill-note"),
    settingHighlightUnique: qs("#setting-highlight-unique"),
    settingNumberFirst: qs("#setting-number-first"),
    btnBindUp: qs("#btn-bind-up"),
    btnBindUp2: qs("#btn-bind-up2"),
    btnBindDown: qs("#btn-bind-down"),
    btnBindDown2: qs("#btn-bind-down2"),
    btnBindLeft: qs("#btn-bind-left"),
    btnBindLeft2: qs("#btn-bind-left2"),
    btnBindRight: qs("#btn-bind-right"),
    btnBindRight2: qs("#btn-bind-right2"),
    btnBindHintPrev: qs("#btn-bind-hint-prev"),
    btnBindHintNext: qs("#btn-bind-hint-next"),
    btnBindNote: qs("#btn-bind-note"),
    btnBindLock: qs("#btn-bind-lock"),
    btnBindUndo: qs("#btn-bind-undo"),
    btnBindErase: qs("#btn-bind-erase"),
    btnFontS: qs("#btn-font-s"),
    btnFontM: qs("#btn-font-m"),
    btnFontL: qs("#btn-font-l"),
    btnPaletteGreen: qs("#btn-palette-green"),
    btnPaletteBlue: qs("#btn-palette-blue"),
    btnPaletteOrange: qs("#btn-palette-orange"),
    btnPaletteWhite: qs("#btn-palette-white"),
    btnPaletteBlack: qs("#btn-palette-black"),
    settingRowDevmode: qs("#setting-row-devmode"),
    settingDevmode: qs("#setting-devmode"),
    settingRowDevtools: qs("#setting-row-devtools"),
    btnDevtoolsOpen: qs("#btn-devtools-open"),
    btnExportGame: qs("#btn-export-game"),
    btnImportGame: qs("#btn-import-game"),
    btnArchiveOpen: qs("#btn-archive-open"),
    archiveModal: qs("#archive-modal"),
    archiveBackdrop: qs("#archive-backdrop"),
    btnArchiveClose: qs("#btn-archive-close"),
    btnExportArchive: qs("#btn-export-archive"),
    btnImportArchive: qs("#btn-import-archive"),
    btnResetArchive: qs("#btn-reset-archive"),
    devtoolsModal: qs("#devtools-modal"),
    devtoolsBackdrop: qs("#devtools-backdrop"),
    btnDevtoolsClose: qs("#btn-devtools-close"),
    devGrid: qs("#dev-grid"),
    devAsGivens: qs("#dev-as-givens"),
    devAutoNotes: qs("#dev-auto-notes"),
    devTech: qs("#dev-tech"),
    btnDevLoad: qs("#btn-dev-load"),
    btnDevRunHint: qs("#btn-dev-run-hint"),
    btnDevFindExample: qs("#btn-dev-find-example"),
    btnDevMock: qs("#btn-dev-mock"),
    devOutput: qs("#dev-output"),
    btnThemeTunerOpen: qs("#btn-theme-tuner-open"),
    themeTunerModal: qs("#theme-tuner-modal"),
    btnThemeTunerClose: qs("#btn-theme-tuner-close"),
    settingCustomTheme: qs("#setting-custom-theme"),
    btnThemeTunerReset: qs("#btn-theme-tuner-reset"),
    btnThemeTunerExport: qs("#btn-theme-tuner-export"),
    btnThemeTunerImport: qs("#btn-theme-tuner-import"),
    themeTunerList: qs("#theme-tuner-list"),
    themeTunerHead: qs("#theme-tuner-head"),
  }

  let settings = loadSettings()
  const urlDev = (() => {
    try {
      return new URLSearchParams(location.search).get("dev") === "1"
    } catch {
      return false
    }
  })()
  if (urlDev && !settings.devUnlocked) {
    settings.devUnlocked = true
    settings.devMode = true
    saveSettings(settings)
  }
  let progress = loadProgress()

  let currentDiff = "easy"
  let levelTileHeight = 66
  let levelTileGap = 12
  let levelRowHeight = levelTileHeight + levelTileGap
  let levelCols = 3
  let levelRenderCount = 0
  let levelScrollTop = 0

  let timerHandle = 0
  let activeState = null
  let cellEls = []
  let padEls = []
  let levelsStatusTimer = 0
  const chapterSize = 100
  let levelsMode = "chapters"
  let currentChapter = 0
  let focusLevel = -1
  let hintState = null
  let hintSvg = null
  let keybindCapture = ""
  let keybindCaptureBtn = null

  const setLevelsStatus = (text) => {
    if (!ui.levelsStatus) return
    clearTimeout(levelsStatusTimer)
    ui.levelsStatus.textContent = text || ""
    if (text) levelsStatusTimer = setTimeout(() => (ui.levelsStatus.textContent = ""), 6000)
  }

  const applyBrightness = () => {
    const raw = clamp(Number(settings.uiBrightness || 100), 70, 120)
    const v = clamp(Math.round(raw / 5) * 5, 70, 120)
    const ratio = (() => {
      if (v <= 100) {
        const t = (v - 70) / 30
        return 0.7 + Math.pow(Math.max(0, Math.min(1, t)), 1.25) * 0.3
      }
      const t = (v - 100) / 20
      return 1.0 + Math.pow(Math.max(0, Math.min(1, t)), 1.25) * 0.2
    })()
    document.documentElement.style.setProperty("--ui-brightness", String(ratio))
    if (ui.settingBrightnessValue) ui.settingBrightnessValue.textContent = `${Math.round(v)}%`
  }

  const applyPalette = () => {
    const p = String(settings.palette || "green")
    document.documentElement.dataset.palette = p
  }

  let customThemeAppliedKeys = new Set()
  const clearCustomThemeOverrides = () => {
    for (const k of customThemeAppliedKeys) document.documentElement.style.removeProperty(k)
    customThemeAppliedKeys = new Set()
  }

  const applyCustomTheme = () => {
    const enabled = !!settings.customTheme?.enabled
    const vars = settings.customTheme?.vars || {}
    clearCustomThemeOverrides()
    if (!enabled) return
    for (const k of Object.keys(vars)) {
      document.documentElement.style.setProperty(k, String(vars[k] || ""))
      customThemeAppliedKeys.add(k)
    }
  }

  const applyFontScale = () => {
    const m = { s: 0.92, m: 1, l: 1.16 }
    const k = String(settings.fontSize || "m")
    const v = m[k] || 1
    document.documentElement.style.setProperty("--font-scale", String(v))
    document.documentElement.dataset.font = k
  }

  const keyLabel = (code) => {
    const s = String(code || "")
    if (!s) return ""
    if (s.startsWith("Key") && s.length === 4) return s.slice(3)
    if (s.startsWith("Key") && s.length > 4) return s.slice(3)
    if (s.startsWith("Digit")) return s.slice(5)
    if (s === "Space") return "Space"
    if (s === "Escape") return "Esc"
    if (s === "ArrowUp") return "↑"
    if (s === "ArrowDown") return "↓"
    if (s === "ArrowLeft") return "←"
    if (s === "ArrowRight") return "→"
    if (/^Numpad[0-9]$/.test(s)) return "Num" + s.slice(6)
    return s
  }

  const applySettingsToUI = () => {
    if (!settings.customTheme) settings.customTheme = { enabled: false, vars: {} }
    ui.settingSound.checked = !!settings.sound
    ui.settingBrightness.value = String(clamp(Math.round(clamp(Number(settings.uiBrightness || 100), 70, 120) / 5) * 5, 70, 120))
    ui.settingHighlightRegion.checked = !!settings.highlightRegion
    ui.settingHighlightSame.checked = !!settings.highlightSame
    ui.settingHighlightSameNotes.checked = !!settings.highlightSameNotes
    ui.settingHighlightSameNotesDigit.checked = !!settings.highlightSameNotesDigit
    ui.settingDoubleClickFillNote.checked = !!settings.doubleClickFillSingleNote
    ui.settingHighlightUnique.checked = !!settings.highlightUnique
    ui.settingNumberFirst.checked = !!settings.numberFirst
    const kb = settings.keybinds || {}
    if (ui.btnBindUp) ui.btnBindUp.textContent = keyLabel(kb.up || "KeyW")
    if (ui.btnBindUp2) ui.btnBindUp2.textContent = keyLabel(kb.up2 || "ArrowUp")
    if (ui.btnBindDown) ui.btnBindDown.textContent = keyLabel(kb.down || "KeyS")
    if (ui.btnBindDown2) ui.btnBindDown2.textContent = keyLabel(kb.down2 || "ArrowDown")
    if (ui.btnBindLeft) ui.btnBindLeft.textContent = keyLabel(kb.left || "KeyA")
    if (ui.btnBindLeft2) ui.btnBindLeft2.textContent = keyLabel(kb.left2 || "ArrowLeft")
    if (ui.btnBindRight) ui.btnBindRight.textContent = keyLabel(kb.right || "KeyD")
    if (ui.btnBindRight2) ui.btnBindRight2.textContent = keyLabel(kb.right2 || "ArrowRight")
    if (ui.btnBindHintPrev) ui.btnBindHintPrev.textContent = keyLabel(kb.hintPrev || "KeyQ")
    if (ui.btnBindHintNext) ui.btnBindHintNext.textContent = keyLabel(kb.hintNext || "KeyE")
    if (ui.btnBindNote) ui.btnBindNote.textContent = keyLabel(kb.note || "KeyR")
    if (ui.btnBindLock) ui.btnBindLock.textContent = keyLabel(kb.lock || "KeyF")
    if (ui.btnBindUndo) ui.btnBindUndo.textContent = keyLabel(kb.undo || "KeyZ")
    if (ui.btnBindErase) ui.btnBindErase.textContent = keyLabel(kb.erase || "KeyX")
    ui.settingRowHighlightSameNotesMode.classList.toggle("hidden", !settings.highlightSameNotes)
    if (ui.settingRowHighlightSameNotesMode) {
      const lbl = ui.settingRowHighlightSameNotesMode.querySelector(".setting-label")
      if (lbl) lbl.textContent = settings.highlightSameNotesDigit ? "高亮相同笔记：数字" : "高亮相同笔记：格子"
    }
    if (ui.btnDevOpen) ui.btnDevOpen.classList.toggle("hidden", !settings.devUnlocked)
    if (ui.settingRowDevmode) ui.settingRowDevmode.classList.toggle("hidden", !settings.devUnlocked)
    if (ui.settingDevmode) ui.settingDevmode.checked = !!settings.devMode
    if (ui.settingRowDevtools) ui.settingRowDevtools.classList.toggle("hidden", !(settings.devUnlocked && settings.devMode))
    if (ui.btnFontS) ui.btnFontS.classList.toggle("active", settings.fontSize === "s")
    if (ui.btnFontM) ui.btnFontM.classList.toggle("active", !settings.fontSize || settings.fontSize === "m")
    if (ui.btnFontL) ui.btnFontL.classList.toggle("active", settings.fontSize === "l")
    if (ui.btnPaletteGreen) ui.btnPaletteGreen.classList.toggle("active", !settings.palette || settings.palette === "green")
    if (ui.btnPaletteBlue) ui.btnPaletteBlue.classList.toggle("active", settings.palette === "blue")
    if (ui.btnPaletteOrange) ui.btnPaletteOrange.classList.toggle("active", settings.palette === "orange")
    if (ui.btnPaletteWhite) ui.btnPaletteWhite.classList.toggle("active", settings.palette === "white")
    if (ui.btnPaletteBlack) ui.btnPaletteBlack.classList.toggle("active", settings.palette === "black")
    if (ui.settingCustomTheme) ui.settingCustomTheme.checked = !!settings.customTheme.enabled
    applyBrightness()
    applyPalette()
    applyFontScale()
    applyCustomTheme()
  }

  let scrollGuardInstalled = false
  const installScrollGuard = () => {
    if (scrollGuardInstalled) return
    scrollGuardInstalled = true
    const handler = (e) => {
      if (!document.body.classList.contains("modal-open")) return
      const t = e.target
      if (t && t.closest && t.closest(".modal-card")) return
      if (t && t.closest && t.closest(".drawer")) return
      e.preventDefault()
    }
    document.addEventListener("wheel", handler, { passive: false })
    document.addEventListener("touchmove", handler, { passive: false })
  }

  const updateScrollLock = () => {
    const open =
      (ui.settingsModal && !ui.settingsModal.classList.contains("hidden")) ||
      (ui.archiveModal && !ui.archiveModal.classList.contains("hidden")) ||
      (ui.devtoolsModal && !ui.devtoolsModal.classList.contains("hidden")) ||
      (ui.traceDrawer && !ui.traceDrawer.classList.contains("hidden"))
    document.body.classList.toggle("modal-open", !!open)
    document.documentElement.classList.toggle("modal-open", !!open)
  }

  let settingsPage = "main"
  const setSettingsPage = (p) => {
    settingsPage = ["main", "highlight", "theme", "hotkeys", "keyboard-shortcuts", "share", "dev"].includes(p) ? p : "main"
    if (ui.settingsPageMain) ui.settingsPageMain.classList.toggle("hidden", settingsPage !== "main")
    if (ui.settingsPageHighlight) ui.settingsPageHighlight.classList.toggle("hidden", settingsPage !== "highlight")
    if (ui.settingsPageTheme) ui.settingsPageTheme.classList.toggle("hidden", settingsPage !== "theme")
    if (ui.settingsPageHotkeys) ui.settingsPageHotkeys.classList.toggle("hidden", settingsPage !== "hotkeys")
    if (ui.settingsPageKeyboardShortcuts) ui.settingsPageKeyboardShortcuts.classList.toggle("hidden", settingsPage !== "keyboard-shortcuts")
    if (ui.settingsPageShare) ui.settingsPageShare.classList.toggle("hidden", settingsPage !== "share")
    if (ui.settingsPageDev) ui.settingsPageDev.classList.toggle("hidden", settingsPage !== "dev")
    if (ui.btnSettingsBack) ui.btnSettingsBack.classList.toggle("hidden", settingsPage === "main")
    if (ui.settingsTitle) {
      ui.settingsTitle.textContent =
        settingsPage === "theme"
          ? "主题设置"
          : settingsPage === "highlight"
            ? "高亮突出设置"
            : settingsPage === "hotkeys"
              ? "操作设置"
            : settingsPage === "keyboard-shortcuts"
              ? "键盘快捷键"
            : settingsPage === "share"
              ? "分享局面"
              : settingsPage === "dev"
                ? "开发者"
                : "设置"
    }
  }

  const openSettings = () => {
    applySettingsToUI()
    setSettingsPage("main")
    ui.settingsModal.classList.remove("hidden")
    updateScrollLock()
  }

  const closeSettings = () => {
    ui.settingsModal.classList.add("hidden")
    setSettingsPage("main")
    updateScrollLock()
  }

  const openArchive = () => {
    ui.archiveModal.classList.remove("hidden")
    updateScrollLock()
  }

  const closeArchive = () => {
    ui.archiveModal.classList.add("hidden")
    updateScrollLock()
  }

  const openDevtools = () => {
    if (!ui.devtoolsModal) return
    if (ui.devGrid && activeState && ui.devGrid.value.trim().length !== 81) {
      ui.devGrid.value = digitsToString(activeState.grid)
    }
    ui.devtoolsModal.classList.remove("hidden")
    updateScrollLock()
  }

  const closeDevtools = () => {
    if (!ui.devtoolsModal) return
    ui.devtoolsModal.classList.add("hidden")
    updateScrollLock()
  }

  const THEME_TUNABLES = [
    { k: "--bg-base", label: "背景底色" },
    { k: "--panel-base", label: "面板底色" },
    { k: "--panel2-base", label: "面板2底色" },
    { k: "--line-base", label: "边框线" },
    { k: "--line2-base", label: "分割线" },
    { k: "--text", label: "主文字" },
    { k: "--muted", label: "次级文字" },
    { k: "--given", label: "给定数字" },
    { k: "--user", label: "填入数字" },
    { k: "--note", label: "笔记数字" },
    { k: "--note-same", label: "相同笔记" },
    { k: "--primary", label: "主色" },
    { k: "--accent", label: "强调色" },
    { k: "--sel-empty", label: "选中空格" },
    { k: "--sel-fill", label: "选中数字" },
    { k: "--affect", label: "影响范围", alpha: true },
    { k: "--same", label: "相同数字", alpha: true },
    { k: "--note-highlight", label: "相同笔记高亮", alpha: true },
    { k: "--primary-soft", label: "主色浅底", alpha: true },
    { k: "--primary-soft2", label: "主色浅底2", alpha: true },
    { k: "--primary-border", label: "主色边框", alpha: true },
    { k: "--primary-border2", label: "主色边框2", alpha: true },
    { k: "--preview-accent-text", label: "推演数字" },
    { k: "--preview-accent-border", label: "推演边框", alpha: true },
    { k: "--preview-accent-border2", label: "推演边框2", alpha: true },
    { k: "--preview-accent-soft", label: "推演浅底", alpha: true },
  ]

  const hex2 = (n) => n.toString(16).padStart(2, "0")
  const rgbToHex = (r, g, b) => `#${hex2(r)}${hex2(g)}${hex2(b)}`.toLowerCase()
  const clamp01 = (n) => Math.max(0, Math.min(1, n))
  const parseColor = (s) => {
    const t = String(s || "").trim()
    if (!t) return null
    const mHex = t.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
    if (mHex) {
      const h = mHex[1]
      if (h.length === 3) {
        const r = parseInt(h[0] + h[0], 16)
        const g = parseInt(h[1] + h[1], 16)
        const b = parseInt(h[2] + h[2], 16)
        return { r, g, b, a: 1 }
      }
      const r = parseInt(h.slice(0, 2), 16)
      const g = parseInt(h.slice(2, 4), 16)
      const b = parseInt(h.slice(4, 6), 16)
      return { r, g, b, a: 1 }
    }
    const mRgb = t.match(/^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*(?:,\s*([0-9.]+)\s*)?\)$/i)
    if (mRgb) {
      const r = clamp(parseInt(mRgb[1], 10), 0, 255)
      const g = clamp(parseInt(mRgb[2], 10), 0, 255)
      const b = clamp(parseInt(mRgb[3], 10), 0, 255)
      const a = mRgb[4] === undefined ? 1 : clamp01(Number(mRgb[4]))
      return { r, g, b, a }
    }
    return null
  }

  const themeVarValue = (k) => getComputedStyle(document.documentElement).getPropertyValue(k).trim()
  const themeVarOverride = (k) => String(settings.customTheme?.vars?.[k] || "").trim()

  let themeTunerReturnToDevtools = false
  const openThemeTuner = () => {
    if (!ui.themeTunerModal) return
    themeTunerReturnToDevtools = !!(ui.devtoolsModal && !ui.devtoolsModal.classList.contains("hidden"))
    if (themeTunerReturnToDevtools) {
      ui.devtoolsModal.classList.add("hidden")
      updateScrollLock()
    }
    if (!settings.customTheme) settings.customTheme = { enabled: false, vars: {} }
    if (!settings.customTheme.win) settings.customTheme.win = { x: 12, y: 80 }
    const x = Math.max(0, Number(settings.customTheme.win.x) || 0)
    const y = Math.max(0, Number(settings.customTheme.win.y) || 0)
    ui.themeTunerModal.style.left = `${x}px`
    ui.themeTunerModal.style.top = `${y}px`
    renderThemeTuner()
    ui.themeTunerModal.classList.remove("hidden")
  }

  const closeThemeTuner = () => {
    if (!ui.themeTunerModal) return
    ui.themeTunerModal.classList.add("hidden")
    if (themeTunerReturnToDevtools && ui.devtoolsModal) {
      ui.devtoolsModal.classList.remove("hidden")
      updateScrollLock()
    }
    themeTunerReturnToDevtools = false
  }

  const renderThemeTuner = () => {
    if (!ui.themeTunerList || !ui.settingCustomTheme) return
    if (!settings.customTheme) settings.customTheme = { enabled: false, vars: {} }
    ui.settingCustomTheme.checked = !!settings.customTheme.enabled
    ui.themeTunerList.innerHTML = ""
    for (const item of THEME_TUNABLES) {
      const row = document.createElement("div")
      row.className = "theme-row"

      const label = document.createElement("div")
      label.className = "setting-label"
      label.textContent = item.label

      const controls = document.createElement("div")
      controls.className = "theme-row-controls"

      const color = document.createElement("input")
      color.type = "color"
      color.className = "theme-color"

      const alpha = document.createElement("input")
      alpha.type = "range"
      alpha.className = "theme-alpha"
      alpha.min = "0"
      alpha.max = "100"
      alpha.step = "1"

      const reset = document.createElement("button")
      reset.type = "button"
      reset.className = "theme-reset"
      reset.textContent = "重置"

      const cur = themeVarOverride(item.k) || themeVarValue(item.k)
      const parsed = parseColor(cur) || { r: 0, g: 0, b: 0, a: 1 }
      color.value = rgbToHex(parsed.r, parsed.g, parsed.b)
      alpha.value = String(Math.round(clamp01(parsed.a) * 100))
      if (!item.alpha) alpha.classList.add("hidden")

      const commit = () => {
        if (!settings.customTheme) settings.customTheme = { enabled: false, vars: {} }
        const base = parseColor(color.value) || { r: 0, g: 0, b: 0, a: 1 }
        const a = item.alpha ? clamp01(Number(alpha.value) / 100) : 1
        const v = a >= 0.999 ? rgbToHex(base.r, base.g, base.b) : `rgba(${base.r}, ${base.g}, ${base.b}, ${Number(a.toFixed(2))})`
        settings.customTheme.vars[item.k] = v
        saveSettings(settings)
        applySettingsToUI()
      }

      color.addEventListener("input", commit)
      alpha.addEventListener("input", commit)
      reset.addEventListener("click", () => {
        if (!settings.customTheme) settings.customTheme = { enabled: false, vars: {} }
        delete settings.customTheme.vars[item.k]
        saveSettings(settings)
        applySettingsToUI()
        renderThemeTuner()
      })

      controls.appendChild(color)
      controls.appendChild(alpha)
      controls.appendChild(reset)
      row.appendChild(label)
      row.appendChild(controls)
      ui.themeTunerList.appendChild(row)
    }
  }

  let traceState = null
  let traceDrag = null
  let tracePrev = null
  let manualPreview = null
  const clearTraceHighlights = () => {
    if (!cellEls || !cellEls.length) return
    for (const el of cellEls) el.classList.remove("trace-focus", "trace-conflict", "trace-unit")
    if (hintSvg) hintSvg.innerHTML = ""
  }

  const computeTraceFrames = (timeline, baseGridIn, baseNotesIn) => {
    if (!activeState) return []
    const baseGrid = baseGridIn ? new Uint8Array(baseGridIn) : new Uint8Array(activeState.grid)
    const baseNotes =
      baseNotesIn && hasAnyNotes(baseNotesIn)
        ? new Uint16Array(baseNotesIn)
        : activeState.notes && hasAnyNotes(activeState.notes)
          ? new Uint16Array(activeState.notes)
          : buildLegalCandidateMasks(baseGrid, activeState.givens)
    const normalizeNotes = (grid, notes) => {
      for (let i = 0; i < 81; i++) {
        if (activeState.givens[i] || grid[i] !== 0) {
          notes[i] = 0
          continue
        }
        const m = computeCandidateMask(grid, i) || 0
        const n = notes[i] || 0
        notes[i] = n ? n & m : m
      }
      return notes
    }
    const frames = []
    let curNotes = normalizeNotes(baseGrid, new Uint16Array(baseNotes))
    let curGrid = baseGrid
    const applyFillLike = (idx, digit) => {
      if (idx < 0 || idx >= 81) return
      if (digit < 1 || digit > 9) return
      const bit = 1 << (digit - 1)
      const nextNotes = new Uint16Array(curNotes)
      const nextGrid = new Uint8Array(curGrid)
      nextGrid[idx] = digit
      nextNotes[idx] = 0
      for (const p of peersOf[idx]) {
        if (activeState.givens[p]) continue
        if (nextGrid[p] !== 0) continue
        nextNotes[p] = (nextNotes[p] || 0) & ~bit
      }
      normalizeNotes(nextGrid, nextNotes)
      curNotes = nextNotes
      curGrid = nextGrid
    }
    for (let i = 0; i < timeline.length; i++) {
      const evt = timeline[i] || {}
      if (evt.kind === "assume" || evt.kind === "fill") {
        const idx = evt.idx ?? -1
        const d = evt.digit || 0
        applyFillLike(idx, d)
      }
      frames.push({ grid: curGrid, notes: curNotes })
    }
    return frames
  }

  const resetTracePreviewToBase = () => {
    if (!activeState || !tracePrev) return
    activeState.grid = tracePrev.grid ? new Uint8Array(tracePrev.grid) : activeState.grid
    activeState.notes = tracePrev.notes ? new Uint16Array(tracePrev.notes) : activeState.notes
    activeState.errors = tracePrev.errors ? new Uint8Array(tracePrev.errors) : activeState.errors
    activeState.conflicts = tracePrev.conflicts ? new Uint8Array(tracePrev.conflicts) : activeState.conflicts
    activeState.tracePreview = true
    activeState.traceBaseGrid = tracePrev.grid ? new Uint8Array(tracePrev.grid) : null
    clearTraceHighlights()
    renderBoard()
  }

  const setManualPreviewFromActions = () => {
    if (!activeState || !manualPreview) return
    const timeline = manualPreview.actions.map((a) => ({ kind: "fill", idx: a.idx, digit: a.digit }))
    const frames = computeTraceFrames(timeline, manualPreview.baseGrid, manualPreview.baseNotes)
    const last = frames.length ? frames[frames.length - 1] : { grid: new Uint8Array(manualPreview.baseGrid), notes: new Uint16Array(manualPreview.baseNotes) }
    activeState.grid = last.grid
    activeState.notes = last.notes
    activeState.errors = new Uint8Array(81)
    activeState.conflicts = recomputeAllConflicts(activeState.grid)
    activeState.tracePreview = true
    activeState.traceBaseGrid = manualPreview.baseGrid ? new Uint8Array(manualPreview.baseGrid) : null
    clearTraceHighlights()
    renderBoard()
  }

  const startManualPreview = () => {
    if (!activeState || activeState.paused) return
    if (!activeState.isDev && activeState.difficulty !== "hard" && activeState.difficulty !== "diabolical") {
      toast("推演模式仅在困难/极限可用")
      return
    }
    if (manualPreview) return
    manualPreview = {
      baseGrid: new Uint8Array(activeState.grid),
      baseNotes: new Uint16Array(activeState.notes),
      baseErrors: new Uint8Array(activeState.errors),
      baseConflicts: new Uint8Array(activeState.conflicts),
      actions: [],
      prevNoteMode: !!activeState.noteMode,
      prevBulkEraseNotes: !!activeState.bulkEraseNotes,
    }
    document.body.classList.add("preview-mode")
    if (ui.previewActions) ui.previewActions.classList.remove("hidden")
    activeState.noteMode = false
    activeState.bulkEraseNotes = false
    activeState.tracePreview = true
    activeState.traceBaseGrid = new Uint8Array(manualPreview.baseGrid)
    renderBoard()
    updateActions()
  }

  const stopManualPreview = () => {
    if (!activeState || !manualPreview) return
    activeState.grid = new Uint8Array(manualPreview.baseGrid)
    activeState.notes = new Uint16Array(manualPreview.baseNotes)
    activeState.errors = new Uint8Array(manualPreview.baseErrors)
    activeState.conflicts = new Uint8Array(manualPreview.baseConflicts)
    activeState.tracePreview = false
    activeState.traceBaseGrid = null
    activeState.noteMode = !!manualPreview.prevNoteMode
    activeState.bulkEraseNotes = !!manualPreview.prevBulkEraseNotes
    manualPreview = null
    document.body.classList.remove("preview-mode")
    if (ui.previewActions) ui.previewActions.classList.add("hidden")
    clearTraceHighlights()
    renderBoard()
    updateActions()
  }

  const undoManualPreviewStep = () => {
    if (!manualPreview) return
    if (!manualPreview.actions.length) return
    manualPreview.actions.pop()
    setManualPreviewFromActions()
    updateActions()
  }

  const applyManualPreview = () => {
    if (!activeState || !manualPreview) return
    const mp = manualPreview
    const actions = mp.actions.slice()
    const timeline = actions.map((a) => ({ kind: "fill", idx: a.idx, digit: a.digit }))
    const frames = computeTraceFrames(timeline, mp.baseGrid, mp.baseNotes)
    const last = frames.length
      ? frames[frames.length - 1]
      : { grid: new Uint8Array(mp.baseGrid), notes: new Uint16Array(mp.baseNotes) }
    const nextGrid = new Uint8Array(last.grid)
    const nextNotes = new Uint16Array(last.notes)
    const nextErrors = new Uint8Array(81)
    if (activeState.solution) {
      for (let i = 0; i < 81; i++) {
        if (activeState.givens[i]) continue
        const v = nextGrid[i] || 0
        if (!v) continue
        const sol = activeState.solution.charCodeAt(i) - 48
        if (sol && v !== sol) nextErrors[i] = 1
      }
    }
    const nextConflicts = recomputeAllConflicts(nextGrid)

    manualPreview = null
    document.body.classList.remove("preview-mode")
    if (ui.previewActions) ui.previewActions.classList.add("hidden")
    clearTraceHighlights()

    const baseGrid = new Uint8Array(mp.baseGrid)
    const baseNotes = new Uint16Array(mp.baseNotes)
    const baseErrors = new Uint8Array(mp.baseErrors)
    const baseConflicts = new Uint8Array(mp.baseConflicts)
    activeState.grid = baseGrid
    activeState.notes = baseNotes
    activeState.errors = baseErrors
    activeState.conflicts = baseConflicts
    activeState.tracePreview = false
    activeState.traceBaseGrid = null
    activeState.noteMode = false
    activeState.bulkEraseNotes = false

    let changedCount = 0
    for (let i = 0; i < 81; i++) {
      const pv = baseGrid[i] || 0
      const nv = nextGrid[i] || 0
      const pn = baseNotes[i] || 0
      const nn = nextNotes[i] || 0
      const pe = baseErrors[i] || 0
      const ne = nextErrors[i] || 0
      if (pv === nv && pn === nn && pe === ne) continue
      activeState.undo.push({ idx: i, pv, nv, pn, nn, pe, ne, ps: 0, ns: 0 })
      changedCount++
    }
    if (changedCount) {
      activeState.undo.push({ idx: 99, pv: changedCount, nv: 0, pn: 0, nn: 0, pe: 0, ne: 0, ps: 0, ns: 0 })
    }
    if (activeState.undo.length > 200) activeState.undo.splice(0, activeState.undo.length - 200)

    activeState.grid = nextGrid
    activeState.notes = nextNotes
    activeState.shadowNotes = buildLegalCandidateMasks(nextGrid, activeState.givens)
    activeState.errors = nextErrors
    activeState.conflicts = nextConflicts
    renderBoard()
    persistActive()
    if (isSolved(activeState.grid, activeState.givens, activeState.errors, activeState.conflicts)) onSolved()
    updateActions()
  }

  const closeTraceDrawer = () => {
    if (ui.traceDrawer) ui.traceDrawer.classList.add("hidden")
    if (ui.traceBackdrop) ui.traceBackdrop.classList.add("hidden")
    traceState = null
    traceDrag = null
    if (activeState && tracePrev) {
      if (tracePrev.grid) activeState.grid = tracePrev.grid
      if (tracePrev.notes) activeState.notes = tracePrev.notes
      if (tracePrev.errors) activeState.errors = tracePrev.errors
      if (tracePrev.conflicts) activeState.conflicts = tracePrev.conflicts
      activeState.tracePreview = false
      activeState.traceBaseGrid = null
    }
    tracePrev = null
    clearTraceHighlights()
    if (activeState) renderBoard()
    if (hintState && hintState.hint && ui.hintPanel && !ui.hintPanel.classList.contains("hidden")) {
      const last = hintStepCount(hintState.hint)
      if (hintState.step !== last) {
        hintState.step = last
        renderHint()
      }
    }
    document.body.classList.remove("trace-open")
    updateScrollLock()
  }

  const openTraceDrawer = () => {
    if (!ui.traceDrawer || !ui.traceBackdrop) return
    installScrollGuard()
    document.body.classList.add("trace-open")
    ui.traceBackdrop.classList.remove("hidden")
    ui.traceDrawer.classList.remove("hidden")
    if (ui.board) {
      const rect = ui.board.getBoundingClientRect()
      const gap = 6
      const avail = window.innerHeight - rect.bottom - gap
      if (avail > 0) setTraceDrawerHeight(avail, 0)
    }
    updateScrollLock()
  }

  const clampTraceDrawerHeight = (px, minH = 90) => {
    const maxH = Math.max(minH, Math.min(Math.floor(window.innerHeight * 0.78), window.innerHeight - 90))
    return clamp(Math.floor(px), minH, maxH)
  }

  const setTraceDrawerHeight = (px, minH = 90) => {
    if (!ui.traceDrawer) return
    ui.traceDrawer.style.height = `${clampTraceDrawerHeight(px, minH)}px`
  }

  const unitLabelShort = (unitType, unitIndex) => {
    if (unitType === "row") return `第 ${unitIndex + 1} 行`
    if (unitType === "col") return `第 ${unitIndex + 1} 列`
    if (unitType === "box") return `第 ${unitIndex + 1} 宫`
    return ""
  }

  const traceKindLabel = (k) => {
    if (k === "assume") return "假设"
    if (k === "fill") return "填入"
    if (k === "conflict") return "矛盾"
    if (k === "wave") return "轮次"
    return "推演"
  }

  const formatCell = (idx) => `第 ${((idx / 9) | 0) + 1} 行第 ${(idx % 9) + 1} 列`

  const applyTraceFocus = (evt) => {
    clearTraceHighlights()
    if (!evt) return
    const focus = evt.focusIdx ?? evt.idx ?? -1
    if (focus >= 0 && cellEls[focus]) cellEls[focus].classList.add("trace-focus")
    const cf = evt.conflict || null
    const cIdx = cf?.idx ?? -1
    if (cIdx >= 0 && cellEls[cIdx]) cellEls[cIdx].classList.add("trace-conflict")
    if (!cf || !cf.type) return
    const uType = cf?.unitType || ""
    const uIndex = Number.isFinite(cf?.unitIndex) ? cf.unitIndex : -1
    if (uIndex < 0) return
    if (!(uType === "row" || uType === "col" || uType === "box")) return
    const unit = uType === "row" ? rowCells[uIndex] : uType === "col" ? colCells[uIndex] : boxCells[uIndex]
    for (const i of unit) if (cellEls[i]) cellEls[i].classList.add("trace-unit")
    if (!hintSvg || !ui.board || !unit.length) return
    const boardRect = ui.board.getBoundingClientRect()
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const i of unit) {
      const r = cellEls[i].getBoundingClientRect()
      const x0 = r.left - boardRect.left
      const y0 = r.top - boardRect.top
      const x1 = x0 + r.width
      const y1 = y0 + r.height
      minX = Math.min(minX, x0)
      minY = Math.min(minY, y0)
      maxX = Math.max(maxX, x1)
      maxY = Math.max(maxY, y1)
    }
    const w = Math.max(1, boardRect.width)
    const h = Math.max(1, boardRect.height)
    const pad = 1.2
    const x = ((minX - pad) / w) * 100
    const y = ((minY - pad) / h) * 100
    const rw = ((maxX - minX + pad * 2) / w) * 100
    const rh = ((maxY - minY + pad * 2) / h) * 100
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect")
    rect.setAttribute("x", String(x))
    rect.setAttribute("y", String(y))
    rect.setAttribute("width", String(rw))
    rect.setAttribute("height", String(rh))
    rect.setAttribute("fill", "none")
    rect.setAttribute("stroke", "rgba(255, 77, 77, .80)")
    rect.setAttribute("stroke-width", "1.2")
    rect.setAttribute("rx", "1.6")
    rect.setAttribute("ry", "1.6")
    hintSvg.appendChild(rect)
  }

  const renderTraceDrawer = () => {
    if (!traceState || !ui.traceDrawer) return
    const hint = traceState.hint
    const branches = hint?.traceBranches || []
    const b = branches[traceState.branchIndex] || null
    const tl = b?.timeline || []
    if (ui.traceBranch) {
      ui.traceBranch.innerHTML = ""
      for (let i = 0; i < branches.length; i++) {
        const br = branches[i]
        const opt = document.createElement("option")
        const tag = br.ok ? "✓" : "✗"
        opt.value = String(i)
        opt.textContent = `${tag} ${br.label || `假设 ${br.digit}`}`
        ui.traceBranch.appendChild(opt)
      }
      ui.traceBranch.value = String(traceState.branchIndex)
    }
    if (ui.traceList) {
      ui.traceList.innerHTML = ""
      for (let i = 0; i < tl.length; i++) {
        const evt = tl[i]
        const item = document.createElement("div")
        item.className = "trace-item" + (evt.kind === "wave" ? " wave" : "") + (i === traceState.stepIndex ? " active" : "")
        item.dataset.idx = String(i)
        if (evt.kind !== "wave") {
          item.addEventListener("click", () => {
            traceState.stepIndex = i
            renderTraceDrawer()
          })
        }
        const meta = document.createElement("div")
        meta.className = "trace-meta"
        meta.textContent = `${i + 1} ${traceKindLabel(evt.kind)}`
        const text = document.createElement("div")
        text.className = "trace-text"
        text.textContent = evt.text || ""
        if (evt.sub) {
          const sub = document.createElement("div")
          sub.className = "trace-sub"
          sub.textContent = evt.sub
          text.appendChild(sub)
        }
        item.appendChild(meta)
        item.appendChild(text)
        ui.traceList.appendChild(item)
      }
    }
    const cur = tl[traceState.stepIndex] || null
    let focusIdx = -1
    if (cur && (cur.kind === "fill" || cur.kind === "assume")) {
      const fi = cur.focusIdx ?? cur.idx ?? -1
      if (fi >= 0) focusIdx = fi
    }
    if (activeState && focusIdx >= 0) activeState.selected = focusIdx
    if (activeState && traceState.frames && traceState.frames.length) {
      const frame = traceState.frames[Math.min(traceState.stepIndex, traceState.frames.length - 1)]
      if (frame && frame.grid && frame.notes) {
        activeState.grid = frame.grid
        activeState.notes = frame.notes
        activeState.errors = new Uint8Array(81)
        activeState.conflicts = recomputeAllConflicts(activeState.grid)
        activeState.tracePreview = true
        renderBoard()
        if (focusIdx >= 0) {
          const v = activeState.grid[focusIdx] || 0
          if (v && !settings.highlightSame) {
            for (let i = 0; i < 81; i++) if (i !== focusIdx && activeState.grid[i] === v) cellEls[i].classList.add("same")
          }
          cellEls[focusIdx].classList.add("trace-focus")
        }
      }
    }
    applyTraceFocus(cur)
    if (ui.traceList) {
      const el = ui.traceList.querySelector(`.trace-item[data-idx="${traceState.stepIndex}"]`)
      if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest", inline: "nearest" })
    }
    if (ui.btnTracePrev) ui.btnTracePrev.disabled = traceState.stepIndex <= 0
    if (ui.btnTraceNext) ui.btnTraceNext.disabled = traceState.stepIndex >= tl.length - 1
    if (ui.btnTraceEnd) {
      const atEnd = traceState.stepIndex >= tl.length - 1
      ui.btnTraceEnd.textContent = atEnd ? "退出推演" : "跳到结论"
      ui.btnTraceEnd.disabled = false
    }
  }

  const openTraceForHint = (h) => {
    if (!h || !h.traceBranches || !h.traceBranches.length) return
    if (!activeState) return
    if (!activeState.isDev && activeState.difficulty !== "hard" && activeState.difficulty !== "diabolical") {
      toast("推演模式仅在困难/极限可用")
      return
    }
    if (activeState && !tracePrev) {
      tracePrev = {
        grid: new Uint8Array(activeState.grid),
        notes: new Uint16Array(activeState.notes),
        errors: new Uint8Array(activeState.errors),
        conflicts: new Uint8Array(activeState.conflicts),
      }
    }
    if (activeState && tracePrev && tracePrev.grid) activeState.traceBaseGrid = new Uint8Array(tracePrev.grid)
    const br = h.traceBranches[h.traceDefaultBranch || 0] || null
    const frames = computeTraceFrames(br?.timeline || [], tracePrev?.grid || null, tracePrev?.notes || null)
    traceState = { hint: h, branchIndex: h.traceDefaultBranch || 0, stepIndex: 0, frames }
    openTraceDrawer()
    renderTraceDrawer()
  }

  const devWrite = (s) => {
    if (ui.devOutput) ui.devOutput.textContent = String(s ?? "")
  }

  const devDescribeHint = (h) => {
    if (!h) return "暂无可用提示"
    const lines = []
    lines.push(`tech: ${h.tech || ""}`)
    lines.push(`type: ${h.type || ""}`)
    if (Number.isFinite(h.idx)) lines.push(`idx: ${h.idx}`)
    if (h.digit) lines.push(`digit: ${h.digit}`)
    if (Array.isArray(h.elimList)) lines.push(`elimCount: ${h.elimList.length}`)
    return lines.join("\n")
  }

  const devRunHintOnTempState = (temp) => {
    const prev = activeState
    try {
      activeState = temp
      return findHint()
    } finally {
      activeState = prev
    }
  }

  const devFindExampleFromBank = (expectedTech, maxTry = 400) => {
    const data = levelData()
    if (!data) return null
    const diffs = ["diabolical", "hard", "medium", "easy"]
    let tried = 0
    const makeTempFromGrid = (grid, givens, puzzle, solution) => {
      const legal = buildLegalCandidateMasks(grid, givens)
      return {
        difficulty: "dev",
        levelIndex: 0,
        puzzle,
        solution: solution || "",
        grid,
        givens,
        notes: legal,
        errors: new Uint8Array(81),
        conflicts: recomputeAllConflicts(grid),
        undo: [],
        noteMode: true,
        bulkEraseNotes: false,
        lockedDigit: 0,
        uniqueDigitToShow: 0,
        selected: -1,
        paused: false,
        elapsedMs: 0,
        startedAtMs: Date.now(),
        isDev: true,
        suppressNotesPrompt: true,
      }
    }
    for (const diff of diffs) {
      const arr = data[diff]
      if (!arr || !arr.length) continue
      const n = arr.length
      for (let k = 0; k < Math.min(n, maxTry); k++) {
        const idx = (Math.random() * n) | 0
        const puzzle = getPuzzle(diff, idx)
        if (!puzzle) continue
        const givens = digitsFromString(puzzle)
        for (let i = 0; i < 81; i++) givens[i] = givens[i] ? 1 : 0
        const baseGrid = digitsFromString(puzzle)

        const temp0 = makeTempFromGrid(baseGrid, givens, puzzle, "")
        const h0 = devRunHintOnTempState(temp0)
        tried++
        if (h0 && (!expectedTech || h0.tech === expectedTech)) return { puzzle, diff, idx, hint: h0, tried, stage: "start" }
        if (tried >= maxTry) return { tried }

        const sol = solveSudoku(puzzle)
        if (!sol) continue
        const empties = []
        for (let i = 0; i < 81; i++) if (!givens[i] && baseGrid[i] === 0) empties.push(i)
        if (!empties.length) continue

        const midTries = 12
        for (let t = 0; t < midTries; t++) {
          const ratio = 0.25 + Math.random() * 0.45
          const fillCount = clamp(((empties.length * ratio) | 0), 6, empties.length)
          const grid = new Uint8Array(baseGrid)
          const pool = empties.slice()
          for (let j = 0; j < fillCount; j++) {
            const pick = (Math.random() * (pool.length - j)) | 0
            const pos = pool[pick]
            pool[pick] = pool[pool.length - 1 - j]
            pool[pool.length - 1 - j] = pos
            grid[pos] = sol.charCodeAt(pos) - 48
          }
          const temp = makeTempFromGrid(grid, givens, puzzle, sol)
          const h = devRunHintOnTempState(temp)
          tried++
          if (h && (!expectedTech || h.tech === expectedTech)) return { puzzle, diff, idx, hint: h, tried, stage: "mid", fillCount }
          if (tried >= maxTry) return { tried }
        }
      }
    }
    return { tried }
  }

  const devMockScenario = (tech) => {
    const empty = "0".repeat(81)
    const bit = (d) => 1 << (d - 1)
    if (tech === "bug") {
      return {
        gridStr: empty,
        asGivens: false,
        autoNotes: true,
        hint: { type: "fill", tech: "bug", idx: 40, digit: 5, sourceCells: [40] },
      }
    }
    if (tech === "ape") {
      return {
        gridStr: empty,
        asGivens: false,
        autoNotes: true,
        hint: {
          type: "eliminate",
          tech: "ape",
          unitCells: [],
          sourceCells: [20, 60, 4, 76],
          targetCells: [60],
          elimList: [{ idx: 60, mask: bit(1) | bit(9) }],
          baseCells: [20, 60],
          excluderCells: [4, 76],
        },
      }
    }
    if (tech === "ate") {
      return {
        gridStr: empty,
        asGivens: false,
        autoNotes: true,
        hint: {
          type: "eliminate",
          tech: "ate",
          unitCells: [],
          sourceCells: [8, 40, 72, 4, 76, 36],
          targetCells: [72],
          elimList: [{ idx: 72, mask: bit(2) | bit(8) }],
          baseCells: [8, 40, 72],
          excluderCells: [4, 76, 36],
        },
      }
    }
    if (tech === "wxyzwing") {
      return {
        gridStr: empty,
        asGivens: false,
        autoNotes: true,
        hint: {
          type: "eliminate",
          tech: "wxyzwing",
          unitCells: [],
          sourceCells: [40, 4, 76, 36],
          targetCells: [8, 72],
          elimList: [
            { idx: 8, mask: bit(4) },
            { idx: 72, mask: bit(4) | bit(7) },
          ],
          wxyzIdx: 40,
          wzIdx: 4,
          xzIdx: 76,
          yzIdx: 36,
          doubleLink: true,
          biggestCardinality: 3,
          wingSize: 8,
        },
      }
    }
    if (tech === "vwxyzwing") {
      return {
        gridStr: empty,
        asGivens: false,
        autoNotes: true,
        hint: {
          type: "eliminate",
          tech: "vwxyzwing",
          unitCells: [],
          sourceCells: [40, 8, 72, 44, 36],
          targetCells: [0, 80],
          elimList: [
            { idx: 0, mask: bit(6) },
            { idx: 80, mask: bit(6) | bit(9) },
          ],
          vwxyzIdx: 40,
          vzIdx: 8,
          wzIdx: 72,
          xzIdx: 44,
          yzIdx: 36,
          doubleLink: false,
          biggestCardinality: 4,
          wingSize: 11,
        },
      }
    }
    if (tech === "nishio") {
      return {
        gridStr: empty,
        asGivens: false,
        autoNotes: true,
        hint: {
          type: "eliminate",
          tech: "forcing_cell",
          forcingKind: "nishio",
          idx: 40,
          digit: 7,
          elimMask: bit(7),
          unitCells: [],
          sourceCells: [40],
          targetCells: [40],
          elimList: [{ idx: 40, mask: bit(7) }],
          chainNodes: [40, 8, 72, 36, 44],
          conflictType: "cell",
          conflictIdx: 72,
          conflictDigit: 0,
          conflictUnitType: "",
          conflictUnitIndex: -1,
          conflictCells: [72],
          complexity: 26,
        },
      }
    }
    return null
  }

  const showLevelsScreen = () => {
    if (activeState) {
      currentDiff = activeState.difficulty || currentDiff
      levelsMode = "levels"
      currentChapter = Math.floor((activeState.levelIndex || 0) / chapterSize)
      focusLevel = activeState.levelIndex || 0
      activeState.paused = true
      persistActive()
      activeState = null
    }
    clearHint()
    saveLastActiveKey("")
    ui.screenGame.classList.add("hidden")
    ui.screenHome.classList.add("hidden")
    ui.screenLevels.classList.remove("hidden")
    stopTimer()
    updateLevelsHeader()
    renderLevels()
    if (levelsMode === "levels") scrollLevelsToIndex((focusLevel % chapterSize) || 0)
  }

  const showHomeScreen = () => {
    if (activeState) {
      activeState.paused = true
      persistActive()
      activeState = null
    }
    clearHint()
    saveLastActiveKey("")
    ui.screenGame.classList.add("hidden")
    ui.screenLevels.classList.add("hidden")
    ui.screenHome.classList.remove("hidden")
    stopTimer()
  }

  const showGameScreen = () => {
    ui.screenLevels.classList.add("hidden")
    ui.screenHome.classList.add("hidden")
    ui.screenGame.classList.remove("hidden")
    startTimer()
  }

  const renderTabs = () => {
    ui.tabs.innerHTML = ""
    for (const d of DIFFS) {
      const btn = document.createElement("button")
      btn.type = "button"
      btn.className = "tab" + (d === currentDiff ? " active" : "")
      btn.textContent = DIFF_LABEL[d]
      btn.addEventListener("click", () => {
        currentDiff = d
        renderTabs()
        renderLevels()
      })
      ui.tabs.appendChild(btn)
    }
  }

  const isPlaying = (diff, idx) => !!getActive(diff, idx)

  const findLastActiveIndexInDiff = (diff) => {
    const map = loadActiveMap()
    let bestIdx = -1
    let bestAt = -1
    for (const k of Object.keys(map)) {
      if (!k.startsWith(diff + ":")) continue
      const idx = Number(k.slice(diff.length + 1))
      if (!Number.isFinite(idx)) continue
      const a = map[k]
      const t = Number(a?.savedAt || 0)
      if (t > bestAt) {
        bestAt = t
        bestIdx = idx
      }
    }
    return bestIdx
  }

  const unlockedCountFor = (diff) => {
    const d = levelData()
    const count = d?.[diff]?.count || 0
    const base = Math.min(5, count)
    const pd = progress?.[diff] || {}
    let completed = 0
    for (let i = 0; i < count; i++) if (pd[i]) completed++
    return clamp(base + completed, 0, count)
  }

  const levelMetaFor = (diff, idx, unlockedCount) => {
    const done = progress?.[diff]?.[idx]
    if (done) return { kind: "good", text: formatTime(done.bestMs || done.ms || 0) }
    const playing = isPlaying(diff, idx)
    if (playing) return { kind: "playing", text: "进行中" }
    if (idx >= unlockedCount) return { kind: "lock", text: "锁定" }
    return { kind: "bad", text: "未通关" }
  }

  const chapterCountFor = (diff) => {
    const d = levelData()
    const count = d?.[diff]?.count || 0
    return Math.ceil(count / chapterSize) || 0
  }

  const scrollLevelsToIndex = (idx) => {
    const cols = levelCols || computeLevelCols()
    const row = Math.floor(idx / cols)
    ui.levelsScroll.scrollTop = row * levelRowHeight
    updateLevelViewport()
  }

  const computeLevelCols = () => {
    const w = Math.max(0, (ui.levelsScroll?.clientWidth || 0) - 24)
    const min = 132
    const cols = Math.floor((w + levelTileGap) / (min + levelTileGap))
    return clamp(cols || 2, 2, 6)
  }

  const renderLevels = () => {
    const d = levelData()
    if (!d) {
      ui.levelsViewport.innerHTML = `<div class="level-row"><div class="level-title">缺少 levels.js</div></div>`
      return
    }
    levelTileHeight = levelsMode === "chapters" ? 98 : 66
    levelRowHeight = levelTileHeight + levelTileGap
    const totalCount = d[currentDiff].count
    const chapterStart = currentChapter * chapterSize
    const chapterEnd = Math.min(totalCount, chapterStart + chapterSize)
    const count = levelsMode === "chapters" ? chapterCountFor(currentDiff) : chapterEnd - chapterStart
    levelCols = computeLevelCols()
    const rows = Math.ceil(count / levelCols)
    ui.levelsSpacer.style.height = rows * levelRowHeight + "px"
    levelScrollTop = ui.levelsScroll.scrollTop
    levelRenderCount = Math.ceil(ui.levelsScroll.clientHeight / levelRowHeight) + 6
    updateLevelViewport()
  }

  const updateLevelViewport = () => {
    const d = levelData()
    if (!d) return
    const unlockedCount = unlockedCountFor(currentDiff)
    const totalCount = d[currentDiff].count
    const chapterStart = currentChapter * chapterSize
    const chapterEnd = Math.min(totalCount, chapterStart + chapterSize)
    const count = levelsMode === "chapters" ? chapterCountFor(currentDiff) : chapterEnd - chapterStart
    let chapterPlaying = null
    if (levelsMode === "chapters") {
      const cc = count
      chapterPlaying = new Uint8Array(cc)
      const map = loadActiveMap()
      for (const k of Object.keys(map)) {
        if (!k.startsWith(currentDiff + ":")) continue
        const idx = Number(k.slice(currentDiff.length + 1))
        if (!Number.isFinite(idx) || idx < 0) continue
        const ch = Math.floor(idx / chapterSize)
        if (ch >= 0 && ch < cc) chapterPlaying[ch] = 1
      }
    }
    const scrollTop = ui.levelsScroll.scrollTop
    const cols = levelCols || computeLevelCols()
    const rows = Math.ceil(count / cols)
    const firstRow = clamp(Math.floor(scrollTop / levelRowHeight) - 2, 0, Math.max(0, rows - 1))
    const lastRow = clamp(firstRow + levelRenderCount, 0, rows)
    ui.levelsViewport.style.transform = `translateY(${firstRow * levelRowHeight}px)`
    ui.levelsViewport.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`
    ui.levelsViewport.innerHTML = ""
    for (let r = firstRow; r < lastRow; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c
        if (i >= count) break
        const tile = document.createElement("button")
        tile.type = "button"
        tile.className = "level-tile"
        tile.style.height = levelTileHeight + "px"
        tile.dataset.index = String(i)
        const title = document.createElement("div")
        title.className = "level-title"
        const meta = document.createElement("div")
        meta.className = "level-meta"
        if (levelsMode === "chapters") {
          const cs = i * chapterSize
          const ce = Math.min(totalCount, cs + chapterSize)
          title.textContent = `第 ${i + 1} 章`
          const tagA = document.createElement("span")
          tagA.className = "tag range"
          tagA.textContent = `${cs + 1}-${ce}关`
          meta.appendChild(tagA)
          const hasPlaying = chapterPlaying && chapterPlaying[i] === 1
          const unlockedIn = clamp(unlockedCount - cs, 0, ce - cs)
          const tagB = document.createElement("span")
          const locked = cs >= unlockedCount && !hasPlaying
          tagB.className = "tag " + (locked ? "lock" : "good")
          tagB.textContent = locked ? "锁定" : `已解锁 ${unlockedIn}/${ce - cs}`
          meta.appendChild(tagB)
          tile.classList.toggle("locked", locked)
          tile.disabled = locked
          if (!locked) {
            tile.addEventListener("click", () => {
              levelsMode = "levels"
              currentChapter = i
              focusLevel = -1
              ui.levelsScroll.scrollTop = 0
              renderLevels()
              updateLevelsHeader()
            })
          }
        } else {
          const globalIdx = chapterStart + i
          title.textContent = `第 ${globalIdx + 1} 关`
          const m = levelMetaFor(currentDiff, globalIdx, unlockedCount)
          const tag = document.createElement("span")
          tag.className = "tag " + m.kind
          tag.textContent = m.text
          meta.appendChild(tag)
          const locked = m.kind === "lock" && !isPlaying(currentDiff, globalIdx)
          tile.classList.toggle("locked", locked)
          tile.disabled = locked
          tile.classList.toggle("focus", focusLevel === globalIdx)
          if (!locked) tile.addEventListener("click", () => startOrResumeGame(currentDiff, globalIdx))
        }
        tile.appendChild(title)
        tile.appendChild(meta)
        ui.levelsViewport.appendChild(tile)
      }
    }
  }

  const updateLevelsHeader = () => {
    if (!ui.levelsDiff) return
    if (levelsMode === "chapters") ui.levelsDiff.textContent = DIFF_LABEL[currentDiff] || ""
    else ui.levelsDiff.textContent = (DIFF_LABEL[currentDiff] || "") + ` · 第 ${currentChapter + 1} 章`
    const hasContinue = findLastActiveIndexInDiff(currentDiff) >= 0
    ui.btnContinue.classList.toggle("hidden", !(levelsMode === "chapters" && hasContinue))
  }

  const buildBoard = () => {
    ui.board.innerHTML = ""
    cellEls = []
    for (let i = 0; i < 81; i++) {
      const cell = document.createElement("div")
      cell.className = "cell"
      cell.dataset.idx = String(i)
      cell.addEventListener("click", () => onCellClick(i))
      cell.addEventListener("dblclick", () => onCellDoubleClick(i))
      const notes = document.createElement("div")
      notes.className = "notes"
      for (let n = 1; n <= 9; n++) {
        const s = document.createElement("span")
        s.dataset.n = String(n)
        notes.appendChild(s)
      }
      cell.appendChild(notes)
      ui.board.appendChild(cell)
      cellEls.push(cell)
    }
    hintSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    hintSvg.classList.add("hint-lines")
    hintSvg.setAttribute("viewBox", "0 0 100 100")
    hintSvg.setAttribute("preserveAspectRatio", "none")
    ui.board.appendChild(hintSvg)
  }

  const buildPad = () => {
    ui.pad.innerHTML = ""
    padEls = []
    for (let n = 1; n <= 9; n++) {
      const btn = document.createElement("button")
      btn.type = "button"
      btn.className = "pad-btn"
      btn.textContent = String(n)
      btn.dataset.n = String(n)
      attachPadHandlers(btn, n)
      ui.pad.appendChild(btn)
      padEls.push(btn)
    }
  }

  const attachPadHandlers = (btn, n) => {
    let pressT = 0
    let long = false
    const clear = () => {
      clearTimeout(pressT)
      pressT = 0
    }
    const onLong = () => {
      long = true
      if (!settings.numberFirst) return
      if (!activeState) return
      if (activeState.lockedDigit === n) activeState.lockedDigit = 0
      else activeState.lockedDigit = n
      updatePad()
      persistActive()
    }
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault()
      long = false
      clear()
      pressT = setTimeout(onLong, 320)
    })
    btn.addEventListener("pointerup", () => {
      clear()
      if (long) return
      onPadClick(n)
    })
    btn.addEventListener("pointercancel", clear)
    btn.addEventListener("contextmenu", (e) => e.preventDefault())
  }

  const updatePad = () => {
    if (!activeState) return
    const sel = activeState.selected
    let noteMask = 0
    const useNoteMask =
      !manualPreview && activeState.noteMode && sel >= 0 && activeState.grid[sel] === 0 && !activeState.givens[sel]
    if (useNoteMask) noteMask = activeState.notes[sel] || 0
    const hideOthers = manualPreview ? 0 : useNoteMask ? 0 : activeState.uniqueDigitToShow || 0
    const filledCount = new Uint8Array(10)
    for (let i = 0; i < 81; i++) {
      const v = activeState.grid[i]
      if (v) filledCount[v]++
    }
    for (const btn of padEls) {
      const n = Number(btn.dataset.n)
      btn.classList.toggle("locked", settings.numberFirst && activeState.lockedDigit === n)
      const noteOn = useNoteMask && noteMask !== 0 && ((noteMask >> (n - 1)) & 1) === 1
      const hideOff = !!hideOthers && n !== hideOthers
      const filledOff = !!settings.highlightUnique && filledCount[n] >= 9
      btn.classList.toggle("note-on", noteOn)
      btn.classList.toggle("off", hideOff || filledOff)
    }
  }

  const computeUniqueDigitToShow = () => {
    if (!activeState || !settings.highlightUnique) return 0
    const idx = activeState.selected
    if (idx < 0) return 0
    if (activeState.grid[idx] !== 0) return 0
    const r = (idx / 9) | 0
    const c = idx % 9
    const rowEmpty = []
    const colEmpty = []
    const boxEmpty = []
    for (let i = 0; i < 9; i++) {
      const ri = r * 9 + i
      const ci = i * 9 + c
      if (activeState.grid[ri] === 0) rowEmpty.push(ri)
      if (activeState.grid[ci] === 0) colEmpty.push(ci)
    }
    const br = ((r / 3) | 0) * 3
    const bc = ((c / 3) | 0) * 3
    for (let rr = br; rr < br + 3; rr++) {
      for (let cc = bc; cc < bc + 3; cc++) {
        const j = rr * 9 + cc
        if (activeState.grid[j] === 0) boxEmpty.push(j)
      }
    }
    const onlyInRow = rowEmpty.length === 1 && rowEmpty[0] === idx
    const onlyInCol = colEmpty.length === 1 && colEmpty[0] === idx
    const onlyInBox = boxEmpty.length === 1 && boxEmpty[0] === idx
    if (!onlyInRow && !onlyInCol && !onlyInBox) return 0
    const v = activeState.solution.charCodeAt(idx) - 48
    return v || 0
  }

  const renderBoard = () => {
    if (!activeState) return
    const { grid, givens, notes, errors, conflicts } = activeState
    const baseGrid = activeState.traceBaseGrid || (tracePrev && tracePrev.grid) || null
    for (let i = 0; i < 81; i++) {
      const cell = cellEls[i]
      const v = grid[i]
      cell.classList.toggle("given", !!givens[i])
      cell.classList.toggle("user", !givens[i] && v !== 0)
      cell.classList.toggle("trace-user", !!activeState.tracePreview && !!baseGrid && !givens[i] && (baseGrid[i] || 0) === 0 && v !== 0)
      cell.classList.toggle("error", !givens[i] && errors[i])
      cell.classList.toggle("conflict", !!conflicts[i])
      const notesEl = cell.querySelector(".notes")
      if (v) {
        cell.textContent = String(v)
        cell.appendChild(notesEl)
        for (const s of Array.from(notesEl.children)) s.classList.remove("same-note")
        for (const s of Array.from(notesEl.children)) s.textContent = ""
      } else {
        cell.textContent = ""
        cell.appendChild(notesEl)
        const m = notes[i] || 0
        for (let n = 1; n <= 9; n++) {
          const span = notesEl.children[n - 1]
          const on = (m >> (n - 1)) & 1
          span.textContent = on ? String(n) : ""
          span.classList.toggle("on", !!on)
          span.classList.remove("same-note")
        }
      }
    }
    refreshHighlights()
    updateActions()
    updatePad()
  }

  const clearHighlights = () => {
    for (const cell of cellEls) {
      cell.classList.remove("sel-empty", "sel-fill", "affect", "same", "note-highlight")
      const notesEl = cell.querySelector(".notes")
      if (notesEl) {
        for (const s of Array.from(notesEl.children)) s.classList.remove("same-note")
      }
    }
  }

  const refreshHighlights = () => {
    if (!activeState) return
    clearHighlights()
    const idx = activeState.selected
    if (idx < 0) return
    const v = activeState.grid[idx]
    const selectedCell = cellEls[idx]
    if (!v) selectedCell.classList.add("sel-empty")
    else selectedCell.classList.add("sel-fill")

    if (settings.highlightRegion) {
      const r = (idx / 9) | 0
      const c = idx % 9
      for (let i = 0; i < 9; i++) {
        const ri = r * 9 + i
        const ci = i * 9 + c
        if (ri !== idx) cellEls[ri].classList.add("affect")
        if (ci !== idx) cellEls[ci].classList.add("affect")
      }
      const br = ((r / 3) | 0) * 3
      const bc = ((c / 3) | 0) * 3
      for (let rr = br; rr < br + 3; rr++) {
        for (let cc = bc; cc < bc + 3; cc++) {
          const j = rr * 9 + cc
          if (j !== idx) cellEls[j].classList.add("affect")
        }
      }
    }

    if (v && settings.highlightSame) {
      for (let i = 0; i < 81; i++) if (i !== idx && activeState.grid[i] === v) cellEls[i].classList.add("same")
    }

    if (v && settings.highlightSameNotes) {
      const bit = 1 << (v - 1)
      for (let i = 0; i < 81; i++) {
        if (activeState.grid[i] !== 0) continue
        if (!(activeState.notes[i] & bit)) continue
        if (settings.highlightSameNotesDigit) {
          const notesEl = cellEls[i].querySelector(".notes")
          if (notesEl) notesEl.children[v - 1].classList.add("same-note")
        } else {
          cellEls[i].classList.add("note-highlight")
        }
      }
    }

    activeState.uniqueDigitToShow = computeUniqueDigitToShow()
  }

  const updateActions = () => {
    if (!activeState) return
    const inPreview = !!manualPreview
    ui.btnUndo.textContent = inPreview ? "停止推演" : activeState.noteMode ? "推演" : "撤回"
    ui.btnUndo.disabled = inPreview ? false : activeState.noteMode ? false : activeState.undo.length === 0
    ui.btnNote.classList.toggle("primary", activeState.noteMode)
    ui.pad.classList.toggle("note", activeState.noteMode)
    const allowAutoNotes = activeState.difficulty === "hard" || activeState.difficulty === "diabolical" || activeState.difficulty === "dev"
    if (activeState.noteMode && allowAutoNotes) ui.btnHint.textContent = "一键笔记"
    else ui.btnHint.textContent = "提示"
    ui.btnHint.disabled = inPreview
    ui.btnNote.disabled = inPreview
    ui.btnErase.disabled = inPreview
    if (ui.btnPreviewUndo) ui.btnPreviewUndo.disabled = !manualPreview
    if (ui.btnPreviewApply) ui.btnPreviewApply.disabled = !manualPreview
    if (!activeState.noteMode) activeState.bulkEraseNotes = false
    ui.btnErase.textContent = activeState.noteMode && activeState.bulkEraseNotes ? "一键擦除笔记" : "擦除"
  }

  const onCellClick = (idx) => {
    if (!activeState || activeState.paused) return
    if (ui.traceDrawer && !ui.traceDrawer.classList.contains("hidden")) return
    if (ui.hintPanel && !ui.hintPanel.classList.contains("hidden") && hintState && hintState.hint) return
    if (activeState.selected === idx) {
      activeState.selected = -1
      refreshHighlights()
      updatePad()
      return
    }
    activeState.selected = idx
    const v = activeState.grid[idx]
    if (settings.numberFirst && activeState.lockedDigit && !v && !activeState.givens[idx]) {
      if (activeState.noteMode) {
        const bit = 1 << (activeState.lockedDigit - 1)
        const next = activeState.notes[idx] ^ bit
        applyMove(idx, activeState.grid[idx], next, "note")
        return
      }
      applyMove(idx, activeState.lockedDigit, 0, "fill")
      return
    }
    if (settings.numberFirst && activeState.lockedDigit && v) {
      activeState.lockedDigit = v
      updatePad()
      persistActive()
    }
    refreshHighlights()
    updatePad()
  }

  const onCellDoubleClick = (idx) => {
    if (!activeState || activeState.paused) return
    if (ui.traceDrawer && !ui.traceDrawer.classList.contains("hidden")) return
    if (ui.hintPanel && !ui.hintPanel.classList.contains("hidden") && hintState && hintState.hint) return
    if (!settings.doubleClickFillSingleNote) return
    if (activeState.givens[idx]) return
    if (activeState.grid[idx] !== 0) return
    const m = activeState.notes[idx] || 0
    if (bitCount(m) !== 1) return
    const n = (Math.log2(m) | 0) + 1
    if (n < 1 || n > 9) return
    applyMove(idx, n, 0, "fill")
  }

  const applyMove = (idx, nextVal, nextNotesMask, kind) => {
    if (!activeState) return
    if (activeState.tracePreview) return
    clearHint()
    const { grid, notes, givens, shadowNotes } = activeState
    if (givens[idx]) return
    if (activeState.bulkEraseNotes) activeState.bulkEraseNotes = false

    const prevVal = grid[idx]
    const prevNotes = notes[idx]
    const prevErrors = activeState.errors[idx]
    const prevShadow = shadowNotes ? shadowNotes[idx] || 0 : 0

    if (kind === "fill" && prevVal !== 0 && nextVal !== 0) return

    if (kind === "note") {
      notes[idx] = nextNotesMask
      if (shadowNotes) {
        const added = nextNotesMask & ~prevNotes
        const removed = prevNotes & ~nextNotesMask
        shadowNotes[idx] = (prevShadow | added) & ~removed
      }
    } else {
      grid[idx] = nextVal
      if (nextVal) activeState.suppressNotesPrompt = false
      if (nextVal === 0 && prevVal !== 0) {
        let restore = 0
        for (let k = activeState.undo.length - 1; k >= 0; k--) {
          const u = activeState.undo[k]
          if (u.idx !== idx) continue
          if (u.pv === 0 && u.nv !== 0) {
            restore = u.pn || 0
            break
          }
        }
        notes[idx] = restore
      } else {
        notes[idx] = 0
      }
    }

    activeState.errors[idx] = 0
    if (!givens[idx] && grid[idx] && activeState.solution) {
      const sol = activeState.solution.charCodeAt(idx) - 48
      if (grid[idx] !== sol) activeState.errors[idx] = 1
    }
    activeState.conflicts = recomputeAllConflicts(grid)

    const pushUndoGroupMarker = (n) => {
      if (!n) return
      activeState.undo.push({
        idx: 99,
        pv: n,
        nv: 0,
        pn: 0,
        nn: 0,
        pe: 0,
        ne: 0,
        ps: 0,
        ns: 0,
      })
    }

    let cascadeCount = 0
    if (kind === "fill" && nextVal) {
      const bit = 1 << (nextVal - 1)
      for (const p of peersOf[idx]) {
        if (grid[p] !== 0) continue
        const pn = notes[p]
        const nn = pn & ~bit
        if (nn === pn) continue
        notes[p] = nn
        activeState.undo.push({
          idx: p,
          pv: grid[p],
          nv: grid[p],
          pn,
          nn,
          pe: activeState.errors[p],
          ne: activeState.errors[p],
          ps: shadowNotes ? shadowNotes[p] || 0 : 0,
          ns: shadowNotes ? shadowNotes[p] || 0 : 0,
        })
        cascadeCount++
      }
    }

    activeState.undo.push({
      idx,
      pv: prevVal,
      nv: grid[idx],
      pn: prevNotes,
      nn: notes[idx],
      pe: prevErrors,
      ne: activeState.errors[idx],
      ps: prevShadow,
      ns: shadowNotes ? shadowNotes[idx] || 0 : 0,
    })

    if (kind === "fill" && nextVal) {
      pushUndoGroupMarker(cascadeCount + 1)
    }
    if (activeState.undo.length > 200) activeState.undo.splice(0, activeState.undo.length - 200)

    renderBoard()
    persistActive()

    if (!givens[idx] && activeState.errors[idx]) {
      if (settings.sound) sound.wrong()
    } else if (kind === "note") {
      if (settings.sound) sound.note()
    } else if (kind === "fill" && nextVal) {
      if (settings.sound) sound.correct()
    }

    if (!activeState.suppressSolved && isSolved(activeState.grid, activeState.givens, activeState.errors, activeState.conflicts)) {
      onSolved()
    }
  }

  const onPadClick = (n) => {
    if (!activeState || activeState.paused) return
    const idx = activeState.selected
    if (idx < 0) return
    if (manualPreview) {
      if (activeState.givens[idx]) return
      if (activeState.grid[idx] !== 0) return
      manualPreview.actions.push({ idx, digit: n })
      setManualPreviewFromActions()
      updateActions()
      return
    }
    if (settings.numberFirst) {
      if (activeState.lockedDigit === n) activeState.lockedDigit = 0
      else activeState.lockedDigit = n
      updatePad()
      persistActive()
      return
    }
    if (activeState.givens[idx]) return
    if (activeState.noteMode) {
      const bit = 1 << (n - 1)
      const next = activeState.notes[idx] ^ bit
      applyMove(idx, activeState.grid[idx], next, "note")
    } else {
      applyMove(idx, n, 0, "fill")
    }
  }

  const eraseSelected = () => {
    if (!activeState || activeState.paused) return
    clearHint()
    const idx = activeState.selected
    if (activeState.noteMode && activeState.bulkEraseNotes) {
      let changed = false
      let changedCount = 0
      for (let i = 0; i < 81; i++) {
        const pn = activeState.notes[i]
        if (!pn) continue
        const ps = activeState.shadowNotes ? activeState.shadowNotes[i] || 0 : 0
        activeState.notes[i] = 0
        if (activeState.shadowNotes) activeState.shadowNotes[i] = 0
        activeState.undo.push({
          idx: i,
          pv: activeState.grid[i],
          nv: activeState.grid[i],
          pn,
          nn: 0,
          pe: activeState.errors[i],
          ne: activeState.errors[i],
          ps,
          ns: 0,
        })
        changed = true
        changedCount++
      }
      if (changedCount) {
        activeState.undo.push({
          idx: 99,
          pv: changedCount,
          nv: 0,
          pn: 0,
          nn: 0,
          pe: 0,
          ne: 0,
          ps: 0,
          ns: 0,
        })
      }
      if (activeState.undo.length > 200) activeState.undo.splice(0, activeState.undo.length - 200)
      activeState.bulkEraseNotes = false
      if (changed) {
        renderBoard()
        persistActive()
      } else {
        updateActions()
      }
      return
    }
    if (idx < 0) return
    if (activeState.givens[idx]) return
    if (activeState.noteMode) {
      if (!activeState.notes[idx]) return
      applyMove(idx, activeState.grid[idx], 0, "note")
      return
    }
    if (!activeState.grid[idx]) return
    applyMove(idx, 0, 0, "fill")
  }

  const undo = () => {
    if (!activeState || activeState.paused) return
    clearHint()
    const u = activeState.undo.pop()
    if (!u) return
    const { grid, notes, shadowNotes } = activeState
    const applyUndo = (rec) => {
      grid[rec.idx] = rec.pv
      notes[rec.idx] = rec.pn
      if (shadowNotes && rec.ps !== undefined) shadowNotes[rec.idx] = rec.ps
      activeState.errors[rec.idx] = rec.pe
    }
    if (u.idx === 99) {
      const n = u.pv || 0
      for (let i = 0; i < n; i++) {
        const rec = activeState.undo.pop()
        if (!rec) break
        applyUndo(rec)
      }
    } else {
      applyUndo(u)
    }
    activeState.bulkEraseNotes = false
    activeState.conflicts = recomputeAllConflicts(grid)
    renderBoard()
    persistActive()
  }

  const autoNotes = () => {
    if (!activeState) return
    const legal = buildLegalCandidateMasks(activeState.grid, activeState.givens)
    let changedCount = 0
    for (let i = 0; i < 81; i++) {
      const pn = activeState.notes[i] || 0
      if (activeState.grid[i] !== 0) {
        const ps = activeState.shadowNotes ? activeState.shadowNotes[i] || 0 : 0
        if (pn === 0 && ps === 0) continue
        if (activeState.shadowNotes) activeState.shadowNotes[i] = 0
        activeState.notes[i] = 0
        activeState.undo.push({
          idx: i,
          pv: activeState.grid[i],
          nv: activeState.grid[i],
          pn,
          nn: 0,
          pe: activeState.errors[i],
          ne: activeState.errors[i],
          ps,
          ns: 0,
        })
        changedCount++
        continue
      }
      const nn = legal[i] || 0
      const ps = activeState.shadowNotes ? activeState.shadowNotes[i] || 0 : 0
      const ns = nn
      if (nn === pn && ps === ns) continue
      activeState.notes[i] = nn
      if (activeState.shadowNotes) activeState.shadowNotes[i] = ns
      activeState.undo.push({
        idx: i,
        pv: activeState.grid[i],
        nv: activeState.grid[i],
        pn,
        nn,
        pe: activeState.errors[i],
        ne: activeState.errors[i],
        ps,
        ns,
      })
      changedCount++
    }
    if (changedCount) {
      activeState.undo.push({
        idx: 99,
        pv: changedCount,
        nv: 0,
        pn: 0,
        nn: 0,
        pe: 0,
        ne: 0,
        ps: 0,
        ns: 0,
      })
    }
    activeState.bulkEraseNotes = true
    if (activeState.undo.length > 200) activeState.undo.splice(0, activeState.undo.length - 200)
    updateActions()
    renderBoard()
    persistActive()
    toast("已覆盖更新所有笔记")
  }

  const rowCells = (() => {
    const out = []
    for (let r = 0; r < 9; r++) {
      const row = []
      for (let c = 0; c < 9; c++) row.push(r * 9 + c)
      out.push(row)
    }
    return out
  })()
  const colCells = (() => {
    const out = []
    for (let c = 0; c < 9; c++) {
      const col = []
      for (let r = 0; r < 9; r++) col.push(r * 9 + c)
      out.push(col)
    }
    return out
  })()
  const boxCells = (() => {
    const out = []
    for (let br = 0; br < 3; br++) {
      for (let bc = 0; bc < 3; bc++) {
        const box = []
        for (let r = br * 3; r < br * 3 + 3; r++) {
          for (let c = bc * 3; c < bc * 3 + 3; c++) box.push(r * 9 + c)
        }
        out.push(box)
      }
    }
    return out
  })()

  const buildLegalCandidateMasks = (grid, givens) => {
    const cands = new Uint16Array(81)
    for (let i = 0; i < 81; i++) {
      if (givens[i]) continue
      if (grid[i] !== 0) continue
      cands[i] = computeCandidateMask(grid, i)
    }
    return cands
  }

  const buildElimCandidateMasks = (legal, notes) => {
    if (!notes) return new Uint16Array(81)
    const out = new Uint16Array(81)
    for (let i = 0; i < 81; i++) {
      const l = legal[i] || 0
      const n = notes[i] || 0
      out[i] = n ? l & n : 0
    }
    return out
  }

  const digitFromSingleMask = (mask) => (Math.log2(mask) | 0) + 1

  const findFullHouseInUnit = (grid, givens, unit, unitType, unitIndex) => {
    let emptyIdx = -1
    let used = 0
    for (const i of unit) {
      if (givens[i]) used |= 1 << (grid[i] - 1)
      else if (grid[i]) used |= 1 << (grid[i] - 1)
      else {
        if (emptyIdx !== -1) return null
        emptyIdx = i
      }
    }
    if (emptyIdx === -1) return null
    const missing = (~used) & 0x1ff
    if (bitCount(missing) !== 1) return null
    const d = digitFromSingleMask(missing)
    const m = computeCandidateMask(grid, emptyIdx) || 0
    if (!(m & (1 << (d - 1)))) return null
    return { type: "fill", tech: "full_house", idx: emptyIdx, digit: d, unitType, unitIndex }
  }

  const findFullHouse = (grid, givens) => {
    for (let r = 0; r < 9; r++) {
      const h = findFullHouseInUnit(grid, givens, rowCells[r], "row", r)
      if (h) return h
    }
    for (let c = 0; c < 9; c++) {
      const h = findFullHouseInUnit(grid, givens, colCells[c], "col", c)
      if (h) return h
    }
    for (let b = 0; b < 9; b++) {
      const h = findFullHouseInUnit(grid, givens, boxCells[b], "box", b)
      if (h) return h
    }
    return null
  }

  const findNakedSingle = (grid, givens, cands) => {
    for (let i = 0; i < 81; i++) {
      if (givens[i]) continue
      if (grid[i] !== 0) continue
      const m = cands[i] || 0
      if (!m) continue
      if (bitCount(m) !== 1) continue
      return { type: "fill", tech: "naked_single", idx: i, digit: digitFromSingleMask(m) }
    }
    return null
  }

  const findHiddenSingleInUnit = (grid, givens, cands, unit, unitType, unitIndex) => {
    const counts = new Uint8Array(10)
    const pos = new Int16Array(10)
    for (let d = 1; d <= 9; d++) pos[d] = -1
    for (const i of unit) {
      if (givens[i]) continue
      if (grid[i] !== 0) continue
      const m = cands[i] || 0
      if (!m) continue
      for (let d = 1; d <= 9; d++) {
        if (m & (1 << (d - 1))) {
          counts[d]++
          pos[d] = i
        }
      }
    }
    for (let d = 1; d <= 9; d++) {
      if (counts[d] === 1 && pos[d] >= 0)
        return { type: "fill", tech: "hidden_single", idx: pos[d], digit: d, unitType, unitIndex }
    }
    return null
  }

  const boxOf = (idx) => {
    const r = (idx / 9) | 0
    const c = idx % 9
    return ((r / 3) | 0) * 3 + ((c / 3) | 0)
  }

  const unionUnique = (a, b) => {
    const set = new Set(a)
    for (const x of b) set.add(x)
    return Array.from(set)
  }

  const findLockedCandidates = (grid, givens, legal, effective) => {
    for (let b = 0; b < 9; b++) {
      const unit = boxCells[b]
      for (let d = 1; d <= 9; d++) {
        const bit = 1 << (d - 1)
        const pos = []
        for (let iIdx = 0; iIdx < unit.length; iIdx++) {
          const i = unit[iIdx]
          if (givens[i]) continue
          if (grid[i] !== 0) continue
          if (legal[i] & bit) pos.push(i)
        }
        if (pos.length < 2) continue
        let sameRow = true
        let sameCol = true
        const r0 = (pos[0] / 9) | 0
        const c0 = pos[0] % 9
        for (let k = 1; k < pos.length; k++) {
          if (((pos[k] / 9) | 0) !== r0) sameRow = false
          if (pos[k] % 9 !== c0) sameCol = false
          if (!sameRow && !sameCol) break
        }
        if (sameRow) {
          const targets = []
          const rCells = rowCells[r0]
          for (let jIdx = 0; jIdx < rCells.length; jIdx++) {
            const j = rCells[jIdx]
            if (boxOf(j) === b) continue
            if (givens[j]) continue
            if (grid[j] !== 0) continue
            if (effective[j] & bit) targets.push(j)
          }
          if (targets.length) {
            return {
              type: "eliminate",
              tech: "locked_pointing_row",
              digit: d,
              boxIndex: b,
              lineIndex: r0,
              elimMask: bit,
              unitCells: unionUnique(unit, rowCells[r0]),
              sourceCells: pos,
              targetCells: targets,
            }
          }
        }
        if (sameCol) {
          const targets = []
          const cCells = colCells[c0]
          for (let jIdx = 0; jIdx < cCells.length; jIdx++) {
            const j = cCells[jIdx]
            if (boxOf(j) === b) continue
            if (givens[j]) continue
            if (grid[j] !== 0) continue
            if (effective[j] & bit) targets.push(j)
          }
          if (targets.length) {
            return {
              type: "eliminate",
              tech: "locked_pointing_col",
              digit: d,
              boxIndex: b,
              lineIndex: c0,
              elimMask: bit,
              unitCells: unionUnique(unit, colCells[c0]),
              sourceCells: pos,
              targetCells: targets,
            }
          }
        }
      }
    }

    for (let r = 0; r < 9; r++) {
      const unit = rowCells[r]
      for (let d = 1; d <= 9; d++) {
        const bit = 1 << (d - 1)
        const pos = []
        for (let iIdx = 0; iIdx < unit.length; iIdx++) {
          const i = unit[iIdx]
          if (givens[i]) continue
          if (grid[i] !== 0) continue
          if (legal[i] & bit) pos.push(i)
        }
        if (pos.length < 2) continue
        const b0 = boxOf(pos[0])
        let sameBox = true
        for (let k = 1; k < pos.length; k++) {
          if (boxOf(pos[k]) !== b0) {
            sameBox = false
            break
          }
        }
        if (!sameBox) continue
        const targets = []
        const bCells = boxCells[b0]
        for (let jIdx = 0; jIdx < bCells.length; jIdx++) {
          const j = bCells[jIdx]
          if (((j / 9) | 0) === r) continue
          if (givens[j]) continue
          if (grid[j] !== 0) continue
          if (effective[j] & bit) targets.push(j)
        }
        if (!targets.length) continue
        return {
          type: "eliminate",
          tech: "locked_claiming_row",
          digit: d,
          boxIndex: b0,
          lineIndex: r,
          elimMask: bit,
          unitCells: unionUnique(boxCells[b0], unit),
          sourceCells: pos,
          targetCells: targets,
        }
      }
    }

    for (let c = 0; c < 9; c++) {
      const unit = colCells[c]
      for (let d = 1; d <= 9; d++) {
        const bit = 1 << (d - 1)
        const pos = []
        for (let iIdx = 0; iIdx < unit.length; iIdx++) {
          const i = unit[iIdx]
          if (givens[i]) continue
          if (grid[i] !== 0) continue
          if (legal[i] & bit) pos.push(i)
        }
        if (pos.length < 2) continue
        const b0 = boxOf(pos[0])
        let sameBox = true
        for (let k = 1; k < pos.length; k++) {
          if (boxOf(pos[k]) !== b0) {
            sameBox = false
            break
          }
        }
        if (!sameBox) continue
        const targets = []
        const bCells = boxCells[b0]
        for (let jIdx = 0; jIdx < bCells.length; jIdx++) {
          const j = bCells[jIdx]
          if (j % 9 === c) continue
          if (givens[j]) continue
          if (grid[j] !== 0) continue
          if (effective[j] & bit) targets.push(j)
        }
        if (!targets.length) continue
        return {
          type: "eliminate",
          tech: "locked_claiming_col",
          digit: d,
          boxIndex: b0,
          lineIndex: c,
          elimMask: bit,
          unitCells: unionUnique(boxCells[b0], unit),
          sourceCells: pos,
          targetCells: targets,
        }
      }
    }
    return null
  }

  const findDirectLocking = (grid, givens, legal) => {
    const findInBoxPointing = (boxIndex, digit, bit) => {
      const unit = boxCells[boxIndex]
      const pos = []
      for (const i of unit) {
        if (givens[i]) continue
        if (grid[i] !== 0) continue
        if (legal[i] & bit) pos.push(i)
      }
      if (pos.length < 2) return null
      let sameRow = true
      let sameCol = true
      const r0 = (pos[0] / 9) | 0
      const c0 = pos[0] % 9
      for (let k = 1; k < pos.length; k++) {
        if (((pos[k] / 9) | 0) !== r0) sameRow = false
        if (pos[k] % 9 !== c0) sameCol = false
        if (!sameRow && !sameCol) break
      }
      const tryRow = () => {
        if (!sameRow) return null
        for (let b3 = 0; b3 < 9; b3++) {
          if (b3 === boxIndex) continue
          const br = ((b3 / 3) | 0) * 3
          if (r0 < br || r0 >= br + 3) continue
          const pos3 = []
          for (const j of boxCells[b3]) {
            if (givens[j]) continue
            if (grid[j] !== 0) continue
            if (legal[j] & bit) pos3.push(j)
          }
          if (pos3.length <= 1) continue
          let remain = -1
          let count = 0
          for (const j of pos3) {
            if (((j / 9) | 0) === r0) continue
            remain = j
            count++
            if (count > 1) break
          }
          if (count === 1 && remain >= 0) {
            return {
              type: "fill",
              tech: "direct_pointing",
              idx: remain,
              digit,
              unitType: "box",
              unitIndex: b3,
              sourceCells: unionUnique(pos, pos3),
              boxIndex: boxIndex,
              lineType: "row",
              lineIndex: r0,
            }
          }
        }
        return null
      }
      const tryCol = () => {
        if (!sameCol) return null
        for (let b3 = 0; b3 < 9; b3++) {
          if (b3 === boxIndex) continue
          const bc = (b3 % 3) * 3
          if (c0 < bc || c0 >= bc + 3) continue
          const pos3 = []
          for (const j of boxCells[b3]) {
            if (givens[j]) continue
            if (grid[j] !== 0) continue
            if (legal[j] & bit) pos3.push(j)
          }
          if (pos3.length <= 1) continue
          let remain = -1
          let count = 0
          for (const j of pos3) {
            if (j % 9 === c0) continue
            remain = j
            count++
            if (count > 1) break
          }
          if (count === 1 && remain >= 0) {
            return {
              type: "fill",
              tech: "direct_pointing",
              idx: remain,
              digit,
              unitType: "box",
              unitIndex: b3,
              sourceCells: unionUnique(pos, pos3),
              boxIndex: boxIndex,
              lineType: "col",
              lineIndex: c0,
            }
          }
        }
        return null
      }
      return tryRow() || tryCol()
    }

    const findInLineClaiming = (lineType, lineIndex, digit, bit) => {
      const unit = lineType === "row" ? rowCells[lineIndex] : colCells[lineIndex]
      const pos = []
      for (const i of unit) {
        if (givens[i]) continue
        if (grid[i] !== 0) continue
        if (legal[i] & bit) pos.push(i)
      }
      if (pos.length < 2) return null
      const b0 = boxOf(pos[0])
      for (let k = 1; k < pos.length; k++) {
        if (boxOf(pos[k]) !== b0) return null
      }
      for (let i3 = 0; i3 < 9; i3++) {
        if (i3 === lineIndex) continue
        const region3 = lineType === "row" ? rowCells[i3] : colCells[i3]
        const crosses = () => {
          if (lineType === "row") {
            const br = ((b0 / 3) | 0) * 3
            return i3 >= br && i3 < br + 3
          } else {
            const bc = (b0 % 3) * 3
            return i3 >= bc && i3 < bc + 3
          }
        }
        if (!crosses()) continue
        const pos3 = []
        for (const j of region3) {
          if (givens[j]) continue
          if (grid[j] !== 0) continue
          if (legal[j] & bit) pos3.push(j)
        }
        if (pos3.length <= 1) continue
        let remain = -1
        let count = 0
        for (const j of pos3) {
          if (boxOf(j) === b0) continue
          remain = j
          count++
          if (count > 1) break
        }
        if (count === 1 && remain >= 0) {
          return {
            type: "fill",
            tech: "direct_claiming",
            idx: remain,
            digit,
            unitType: lineType,
            unitIndex: i3,
            sourceCells: unionUnique(pos, pos3),
            boxIndex: b0,
            lineType,
            lineIndex,
          }
        }
      }
      return null
    }

    for (let d = 1; d <= 9; d++) {
      const bit = 1 << (d - 1)
      for (let b = 0; b < 9; b++) {
        const h = findInBoxPointing(b, d, bit)
        if (h) return h
      }
      for (let r = 0; r < 9; r++) {
        const h = findInLineClaiming("row", r, d, bit)
        if (h) return h
      }
      for (let c = 0; c < 9; c++) {
        const h = findInLineClaiming("col", c, d, bit)
        if (h) return h
      }
    }
    return null
  }

  const findNakedPairsInUnit = (grid, givens, legal, effective, unit, unitType, unitIndex) => {
    const map = new Map()
    for (const i of unit) {
      if (givens[i]) continue
      if (grid[i] !== 0) continue
      const m = legal[i] || 0
      if (!m) continue
      if (bitCount(m) !== 2) continue
      const arr = map.get(m) || []
      arr.push(i)
      map.set(m, arr)
    }
    for (const [mask, cells] of map.entries()) {
      if (cells.length !== 2) continue
      const targets = []
      for (const j of unit) {
        if (j === cells[0] || j === cells[1]) continue
        if (givens[j]) continue
        if (grid[j] !== 0) continue
        if (effective[j] & mask) targets.push(j)
      }
      if (!targets.length) continue
      return {
        type: "eliminate",
        tech: "naked_pairs",
        unitType,
        unitIndex,
        elimMask: mask,
        unitCells: unit,
        sourceCells: cells,
        targetCells: targets,
      }
    }
    return null
  }

  const findNakedPairs = (grid, givens, legal, effective) => {
    for (let r = 0; r < 9; r++) {
      const h = findNakedPairsInUnit(grid, givens, legal, effective, rowCells[r], "row", r)
      if (h) return h
    }
    for (let c = 0; c < 9; c++) {
      const h = findNakedPairsInUnit(grid, givens, legal, effective, colCells[c], "col", c)
      if (h) return h
    }
    for (let b = 0; b < 9; b++) {
      const h = findNakedPairsInUnit(grid, givens, legal, effective, boxCells[b], "box", b)
      if (h) return h
    }
    return null
  }

  const findHiddenSingle = (grid, givens, cands) => {
    for (let b = 0; b < 9; b++) {
      const h = findHiddenSingleInUnit(grid, givens, cands, boxCells[b], "box", b)
      if (h) return h
    }
    for (let r = 0; r < 9; r++) {
      const h = findHiddenSingleInUnit(grid, givens, cands, rowCells[r], "row", r)
      if (h) return h
    }
    for (let c = 0; c < 9; c++) {
      const h = findHiddenSingleInUnit(grid, givens, cands, colCells[c], "col", c)
      if (h) return h
    }
    return null
  }

  const findHiddenPairsInUnit = (grid, givens, legal, effective, unit, unitType, unitIndex) => {
    const posMask = new Uint16Array(10)
    const counts = new Uint8Array(10)
    for (let k = 0; k < unit.length; k++) {
      const i = unit[k]
      if (givens[i]) continue
      if (grid[i] !== 0) continue
      const m = effective[i] || 0
      if (!m) continue
      for (let d = 1; d <= 9; d++) {
        const bit = 1 << (d - 1)
        if (m & bit) {
          counts[d]++
          posMask[d] |= 1 << k
        }
      }
    }
    for (let a = 1; a <= 8; a++) {
      if (counts[a] !== 2) continue
      for (let b = a + 1; b <= 9; b++) {
        if (counts[b] !== 2) continue
        if (posMask[a] !== posMask[b]) continue
        const cells = []
        for (let k = 0; k < unit.length; k++) {
          if (posMask[a] & (1 << k)) cells.push(unit[k])
        }
        if (cells.length !== 2) continue
        const keepMask = (1 << (a - 1)) | (1 << (b - 1))
        const elimList = []
        for (const i of cells) {
          const cur = effective[i] || 0
          const rm = cur & ~keepMask
          if (rm) elimList.push({ idx: i, mask: rm })
        }
        if (!elimList.length) continue
        return {
          type: "eliminate",
          tech: "hidden_pairs",
          unitType,
          unitIndex,
          keepMask,
          unitCells: unit,
          sourceCells: cells,
          targetCells: cells,
          elimList,
        }
      }
    }
    return null
  }

  const findHiddenPairs = (grid, givens, legal, effective) => {
    for (let r = 0; r < 9; r++) {
      const h = findHiddenPairsInUnit(grid, givens, legal, effective, rowCells[r], "row", r)
      if (h) return h
    }
    for (let c = 0; c < 9; c++) {
      const h = findHiddenPairsInUnit(grid, givens, legal, effective, colCells[c], "col", c)
      if (h) return h
    }
    for (let b = 0; b < 9; b++) {
      const h = findHiddenPairsInUnit(grid, givens, legal, effective, boxCells[b], "box", b)
      if (h) return h
    }
    return null
  }

  const findHiddenSetStructureInUnit = (grid, givens, legal, unit, unitType, unitIndex, k) => {
    const posMask = new Uint16Array(10)
    const counts = new Uint8Array(10)
    for (let t = 0; t < unit.length; t++) {
      const i = unit[t]
      if (givens[i]) continue
      if (grid[i] !== 0) continue
      const m = legal[i] || 0
      if (!m) continue
      for (let d = 1; d <= 9; d++) {
        const bit = 1 << (d - 1)
        if (m & bit) {
          counts[d]++
          posMask[d] |= 1 << t
        }
      }
    }
    const digits = []
    for (let d = 1; d <= 9; d++) {
      if (counts[d] >= 2 && counts[d] <= k) digits.push(d)
    }
    if (digits.length < k) return null

    const dfs = (start, depth, unionPos, keepMask) => {
      if (bitCount(unionPos) > k) return null
      if (depth === k) {
        if (bitCount(unionPos) !== k) return null
        const cells = []
        for (let t = 0; t < unit.length; t++) {
          if (unionPos & (1 << t)) cells.push(unit[t])
        }
        if (cells.length !== k) return null
        return { unitType, unitIndex, unitCells: unit, keepMask, sourceCells: cells }
      }
      for (let p = start; p < digits.length; p++) {
        const d = digits[p]
        const h = dfs(p + 1, depth + 1, unionPos | posMask[d], keepMask | (1 << (d - 1)))
        if (h) return h
      }
      return null
    }
    return dfs(0, 0, 0, 0)
  }

  const findDirectHiddenSet = (grid, givens, legal, k) => {
    const tryUnit = (unit, unitType, unitIndex) => {
      const base = findHiddenSetStructureInUnit(grid, givens, legal, unit, unitType, unitIndex, k)
      if (!base) return null
      const keepMask = base.keepMask || 0
      const cells = base.sourceCells || []
      if (!cells.length) return null
      const cellSet = new Set(cells)
      const setDigits = []
      for (let d = 1; d <= 9; d++) if (keepMask & (1 << (d - 1))) setDigits.push(d)

      for (let v = 1; v <= 9; v++) {
        if (keepMask & (1 << (v - 1))) continue
        const pos = []
        for (const i of unit) {
          if (givens[i]) continue
          if (grid[i] !== 0) continue
          if (legal[i] & (1 << (v - 1))) pos.push(i)
        }
        if (pos.length <= 1) continue
        const remain = pos.filter((i) => !cellSet.has(i))
        if (remain.length !== 1) continue
        return {
          type: "fill",
          tech: k === 2 ? "direct_hidden_pair" : "direct_hidden_triplet",
          idx: remain[0],
          digit: v,
          unitType,
          unitIndex,
          keepMask,
          setDigits,
          unitCells: unit,
          sourceCells: cells,
        }
      }
      return null
    }

    for (let b = 0; b < 9; b++) {
      const h = tryUnit(boxCells[b], "box", b)
      if (h) return h
    }
    for (let c = 0; c < 9; c++) {
      const h = tryUnit(colCells[c], "col", c)
      if (h) return h
    }
    for (let r = 0; r < 9; r++) {
      const h = tryUnit(rowCells[r], "row", r)
      if (h) return h
    }
    return null
  }

  const findNakedSetInUnit = (grid, givens, legal, elim, unit, unitType, unitIndex, k) => {
    const cells = []
    const masks = []
    for (const i of unit) {
      if (givens[i]) continue
      if (grid[i] !== 0) continue
      const m = legal[i] || 0
      if (!m) continue
      const bc = bitCount(m)
      if (bc < 2 || bc > k) continue
      cells.push(i)
      masks.push(m)
    }
    if (cells.length < k) return null

    const pick = new Int16Array(k)
    const dfs = (start, depth, unionMask) => {
      if (bitCount(unionMask) > k) return null
      if (depth === k) {
        if (bitCount(unionMask) !== k) return null
        const sources = []
        for (let t = 0; t < k; t++) sources.push(cells[pick[t]])
        const targets = []
        for (const j of unit) {
          if (givens[j]) continue
          if (grid[j] !== 0) continue
          if (sources.includes(j)) continue
          if (elim[j] & unionMask) targets.push(j)
        }
        if (!targets.length) return null
        return {
          type: "eliminate",
          tech: k === 3 ? "naked_triplet" : "naked_quad",
          unitType,
          unitIndex,
          elimMask: unionMask,
          unitCells: unit,
          sourceCells: sources,
          targetCells: targets,
        }
      }
      for (let idx = start; idx < cells.length; idx++) {
        pick[depth] = idx
        const h = dfs(idx + 1, depth + 1, unionMask | masks[idx])
        if (h) return h
      }
      return null
    }
    return dfs(0, 0, 0)
  }

  const findNakedSets = (grid, givens, legal, elim, k) => {
    for (let r = 0; r < 9; r++) {
      const h = findNakedSetInUnit(grid, givens, legal, elim, rowCells[r], "row", r, k)
      if (h) return h
    }
    for (let c = 0; c < 9; c++) {
      const h = findNakedSetInUnit(grid, givens, legal, elim, colCells[c], "col", c, k)
      if (h) return h
    }
    for (let b = 0; b < 9; b++) {
      const h = findNakedSetInUnit(grid, givens, legal, elim, boxCells[b], "box", b, k)
      if (h) return h
    }
    return null
  }

  const findHiddenSetInUnit = (grid, givens, legal, elim, unit, unitType, unitIndex, k) => {
    const posMask = new Uint16Array(10)
    const counts = new Uint8Array(10)
    for (let t = 0; t < unit.length; t++) {
      const i = unit[t]
      if (givens[i]) continue
      if (grid[i] !== 0) continue
      const m = legal[i] || 0
      if (!m) continue
      for (let d = 1; d <= 9; d++) {
        const bit = 1 << (d - 1)
        if (m & bit) {
          counts[d]++
          posMask[d] |= 1 << t
        }
      }
    }
    const digits = []
    for (let d = 1; d <= 9; d++) {
      if (counts[d] >= 2 && counts[d] <= k) digits.push(d)
    }
    if (digits.length < k) return null

    const choose = new Int8Array(k)
    const dfs = (start, depth, unionPos, keepMask) => {
      if (bitCount(unionPos) > k) return null
      if (depth === k) {
        if (bitCount(unionPos) !== k) return null
        const cells = []
        for (let t = 0; t < unit.length; t++) {
          if (unionPos & (1 << t)) cells.push(unit[t])
        }
        if (cells.length !== k) return null
        const elimList = []
        for (const i of cells) {
          const rm = (elim[i] || 0) & ~keepMask
          if (rm) elimList.push({ idx: i, mask: rm })
        }
        if (!elimList.length) return null
        return {
          type: "eliminate",
          tech: k === 3 ? "hidden_triplet" : "hidden_quad",
          unitType,
          unitIndex,
          keepMask,
          unitCells: unit,
          sourceCells: cells,
          targetCells: cells,
          elimList,
        }
      }
      for (let p = start; p < digits.length; p++) {
        const d = digits[p]
        choose[depth] = d
        const h = dfs(p + 1, depth + 1, unionPos | posMask[d], keepMask | (1 << (d - 1)))
        if (h) return h
      }
      return null
    }
    return dfs(0, 0, 0, 0)
  }

  const findHiddenSets = (grid, givens, legal, elim, k) => {
    for (let r = 0; r < 9; r++) {
      const h = findHiddenSetInUnit(grid, givens, legal, elim, rowCells[r], "row", r, k)
      if (h) return h
    }
    for (let c = 0; c < 9; c++) {
      const h = findHiddenSetInUnit(grid, givens, legal, elim, colCells[c], "col", c, k)
      if (h) return h
    }
    for (let b = 0; b < 9; b++) {
      const h = findHiddenSetInUnit(grid, givens, legal, elim, boxCells[b], "box", b, k)
      if (h) return h
    }
    return null
  }

  const findTurbotFish = (grid, givens, legal, elim) => {
    const sees = (a, b) => {
      for (const p of peersOf[a]) if (p === b) return true
      return false
    }
    const classify = (t1, t2) => {
      if ((t1 === "row" && t2 === "row") || (t1 === "col" && t2 === "col")) return "skyscraper"
      if ((t1 === "row" && t2 === "col") || (t1 === "col" && t2 === "row")) return "two_string_kite"
      return "turbot"
    }
    const isConjugateWeak = (a, b, bit) => {
      if (a < 0 || b < 0) return false
      const inUnit = (cells) => {
        let cnt = 0
        let hasA = false
        let hasB = false
        for (const i of cells) {
          if (givens[i]) continue
          if (grid[i] !== 0) continue
          if (!(legal[i] & bit)) continue
          cnt++
          if (i === a) hasA = true
          if (i === b) hasB = true
          if (cnt > 2) return false
        }
        return cnt === 2 && hasA && hasB
      }
      const ar = (a / 9) | 0
      const ac = a % 9
      const br = (b / 9) | 0
      const bc = b % 9
      if (ar === br && inUnit(rowCells[ar])) return true
      if (ac === bc && inUnit(colCells[ac])) return true
      const ab = ((ar / 3) | 0) * 3 + ((ac / 3) | 0)
      const bb = ((br / 3) | 0) * 3 + ((bc / 3) | 0)
      if (ab === bb && inUnit(boxCells[ab])) return true
      return false
    }

    for (let d = 1; d <= 9; d++) {
      const bit = 1 << (d - 1)
      const strongLinks = []

      for (let r = 0; r < 9; r++) {
        const cs = []
        for (const i of rowCells[r]) {
          if (givens[i]) continue
          if (grid[i] !== 0) continue
          if (legal[i] & bit) cs.push(i)
        }
        if (cs.length === 2) strongLinks.push({ a: cs[0], b: cs[1], houseType: "row", houseIndex: r })
      }
      for (let c = 0; c < 9; c++) {
        const cs = []
        for (const i of colCells[c]) {
          if (givens[i]) continue
          if (grid[i] !== 0) continue
          if (legal[i] & bit) cs.push(i)
        }
        if (cs.length === 2) strongLinks.push({ a: cs[0], b: cs[1], houseType: "col", houseIndex: c })
      }
      for (let b = 0; b < 9; b++) {
        const cs = []
        for (const i of boxCells[b]) {
          if (givens[i]) continue
          if (grid[i] !== 0) continue
          if (legal[i] & bit) cs.push(i)
        }
        if (cs.length === 2) strongLinks.push({ a: cs[0], b: cs[1], houseType: "box", houseIndex: b })
      }
      if (strongLinks.length < 2) continue

      for (let i = 0; i < strongLinks.length; i++) {
        const l1 = strongLinks[i]
        for (let j = i + 1; j < strongLinks.length; j++) {
          const l2 = strongLinks[j]
          const l1Ends = [
            { mid: l1.a, end: l1.b },
            { mid: l1.b, end: l1.a },
          ]
          const l2Ends = [
            { mid: l2.a, end: l2.b },
            { mid: l2.b, end: l2.a },
          ]
          for (const s1 of l1Ends) {
            for (const s2 of l2Ends) {
              if (!sees(s1.mid, s2.mid)) continue
              if (s1.end === s2.end) continue
              const pEnd = new Set(peersOf[s2.end])
              const chainSet = new Set([s1.end, s1.mid, s2.mid, s2.end])
              const targets = []
              const variant = classify(l1.houseType, l2.houseType)
              const allConjugate = isConjugateWeak(s1.mid, s2.mid, bit)
              for (const t of peersOf[s1.end]) {
                if (!pEnd.has(t)) continue
                if (chainSet.has(t)) continue
                if (givens[t]) continue
                if (grid[t] !== 0) continue
                if (elim[t] & bit) targets.push(t)
              }
              if (!targets.length) continue
              if (variant === "skyscraper") {
                const chain = [s1.end, s1.mid, s2.mid, s2.end]
                const m0 = legal[chain[0]] || 0
                if (bitCount(m0) === 2 && (m0 & bit)) {
                  let okPair = true
                  for (const idx of chain) {
                    if (idx < 0) {
                      okPair = false
                      break
                    }
                    if (givens[idx] || grid[idx] !== 0) {
                      okPair = false
                      break
                    }
                    const mm = legal[idx] || 0
                    if (mm !== m0 || bitCount(mm) !== 2) {
                      okPair = false
                      break
                    }
                  }
                  if (okPair) {
                    const otherBit = m0 & ~bit
                    if (otherBit && (otherBit & (otherBit - 1)) === 0) {
                      const otherDigit = (Math.log2(otherBit) | 0) + 1
                      if (d < otherDigit) {
                        const pairMask = bit | otherBit
                        const targets2 = []
                        for (const t of peersOf[s1.end]) {
                          if (!pEnd.has(t)) continue
                          if (chainSet.has(t)) continue
                          if (givens[t]) continue
                          if (grid[t] !== 0) continue
                          if (elim[t] & pairMask) targets2.push(t)
                        }
                        if (targets2.length) {
                          return {
                            type: "eliminate",
                            tech: "turbot_fish",
                            digit: d,
                            otherDigit,
                            elimMask: pairMask,
                            unitCells: [],
                            sourceCells: [s1.end, s1.mid, s2.mid, s2.end],
                            targetCells: targets2,
                            strong1: [l1.a, l1.b],
                            strong2: [l2.a, l2.b],
                            weak: [s1.mid, s2.mid],
                            ends: [s1.end, s2.end],
                            allConjugate,
                            variant: "skyscraper_bivalue",
                          }
                        }
                      }
                    }
                  }
                }
              }
              return {
                type: "eliminate",
                tech: "turbot_fish",
                digit: d,
                elimMask: bit,
                unitCells: [],
                sourceCells: [s1.end, s1.mid, s2.mid, s2.end],
                targetCells: targets,
                strong1: [l1.a, l1.b],
                strong2: [l2.a, l2.b],
                weak: [s1.mid, s2.mid],
                ends: [s1.end, s2.end],
                allConjugate,
                variant,
              }
            }
          }
        }
      }
    }

    const er = findEmptyRectangle(grid, givens, legal, elim)
    if (er) {
      return {
        ...er,
        tech: "turbot_fish",
        variant: "empty_rectangle",
      }
    }
    return null
  }

  const findNStrongLinks = (grid, givens, legal, elim, n, tech) => {
    const sees = (a, b) => {
      for (const p of peersOf[a]) if (p === b) return true
      return false
    }

    for (let d = 1; d <= 9; d++) {
      const bit = 1 << (d - 1)
      const strongLinks = []
      for (let r = 0; r < 9; r++) {
        const cs = []
        for (const i of rowCells[r]) {
          if (givens[i]) continue
          if (grid[i] !== 0) continue
          if (legal[i] & bit) cs.push(i)
        }
        if (cs.length === 2) strongLinks.push({ a: cs[0], b: cs[1], houseType: "row" })
      }
      for (let c = 0; c < 9; c++) {
        const cs = []
        for (const i of colCells[c]) {
          if (givens[i]) continue
          if (grid[i] !== 0) continue
          if (legal[i] & bit) cs.push(i)
        }
        if (cs.length === 2) strongLinks.push({ a: cs[0], b: cs[1], houseType: "col" })
      }
      for (let b = 0; b < 9; b++) {
        const cs = []
        for (const i of boxCells[b]) {
          if (givens[i]) continue
          if (grid[i] !== 0) continue
          if (legal[i] & bit) cs.push(i)
        }
        if (cs.length === 2) strongLinks.push({ a: cs[0], b: cs[1], houseType: "box" })
      }
      if (strongLinks.length < n) continue

      const cellToLinks = Array.from({ length: 81 }, () => [])
      for (let li = 0; li < strongLinks.length; li++) {
        const l = strongLinks[li]
        cellToLinks[l.a].push({ li, side: 0 })
        cellToLinks[l.b].push({ li, side: 1 })
      }

      const used = new Set()
      const chainStrong = []
      const chainWeak = []
      const chainNodes = new Set()

      const solve = (outCell, depth, startEnd, startOut, houseTypes) => {
        if (depth === n) {
          const endCell = outCell
          const peerEnd = new Set(peersOf[endCell])
          const targets = []
          for (const t of peersOf[startEnd]) {
            if (!peerEnd.has(t)) continue
            if (chainNodes.has(t)) continue
            if (givens[t]) continue
            if (grid[t] !== 0) continue
            if (elim[t] & bit) targets.push(t)
          }
          if (!targets.length) return null
          return {
            type: "eliminate",
            tech,
            digit: d,
            elimMask: bit,
            unitCells: [],
            sourceCells: Array.from(chainNodes),
            targetCells: targets,
            strongLinks: chainStrong.slice(),
            weakLinks: chainWeak.slice(),
            ends: [startEnd, endCell],
            chainSize: n,
            variant: houseTypes.includes("box") ? "mutant" : houseTypes.includes("row") && houseTypes.includes("col") ? "mixed" : "basic",
          }
        }

        const candidates = []
        for (const peer of peersOf[outCell]) {
          for (const entry of cellToLinks[peer]) candidates.push({ peer, li: entry.li, side: entry.side })
        }
        for (const cand of candidates) {
          if (used.has(cand.li)) continue
          const link = strongLinks[cand.li]
          const inCell = cand.side === 0 ? link.a : link.b
          const nextOut = cand.side === 0 ? link.b : link.a
          if (!sees(outCell, inCell)) continue
          if (depth === 1) {
            if (startOut === inCell) continue
          }
          used.add(cand.li)
          chainStrong.push([link.a, link.b])
          chainWeak.push([outCell, inCell])
          chainNodes.add(inCell)
          chainNodes.add(nextOut)
          const ht = houseTypes.slice()
          ht.push(link.houseType)
          const h = solve(nextOut, depth + 1, startEnd, startOut, ht)
          if (h) return h
          ht.pop()
          chainNodes.delete(nextOut)
          chainNodes.delete(inCell)
          chainWeak.pop()
          chainStrong.pop()
          used.delete(cand.li)
        }
        return null
      }

      for (let li = 0; li < strongLinks.length; li++) {
        const link = strongLinks[li]
        for (let orient = 0; orient < 2; orient++) {
          const startOut = orient === 0 ? link.a : link.b
          const startEnd = orient === 0 ? link.b : link.a
          used.clear()
          chainStrong.length = 0
          chainWeak.length = 0
          chainNodes.clear()
          used.add(li)
          chainStrong.push([link.a, link.b])
          chainNodes.add(link.a)
          chainNodes.add(link.b)
          const h = solve(startOut, 1, startEnd, startOut, [link.houseType])
          if (h) return h
        }
      }
    }
    return null
  }

  const findThreeStrongLinks = (grid, givens, legal, elim) => findNStrongLinks(grid, givens, legal, elim, 3, "three_strong_links")
  const findFourStrongLinks = (grid, givens, legal, elim) => findNStrongLinks(grid, givens, legal, elim, 4, "four_strong_links")
  const findFiveStrongLinks = (grid, givens, legal, elim) => findNStrongLinks(grid, givens, legal, elim, 5, "five_strong_links")
  const findSixStrongLinks = (grid, givens, legal, elim) => findNStrongLinks(grid, givens, legal, elim, 6, "six_strong_links")
  const findSevenStrongLinks = (grid, givens, legal, elim) => findNStrongLinks(grid, givens, legal, elim, 7, "seven_strong_links")
  const findEightStrongLinks = (grid, givens, legal, elim) => findNStrongLinks(grid, givens, legal, elim, 8, "eight_strong_links")

  const findBUG = (grid, givens, legal) => {
    let triIdx = -1
    let triMask = 0
    for (let i = 0; i < 81; i++) {
      if (givens[i]) continue
      if (grid[i] !== 0) continue
      const m = legal[i] || 0
      if (!m) return null
      const bc = bitCount(m)
      if (bc === 2) continue
      if (bc === 3) {
        if (triIdx !== -1) return null
        triIdx = i
        triMask = m
        continue
      }
      return null
    }
    if (triIdx < 0) return null

    const r = (triIdx / 9) | 0
    const c = triIdx % 9
    const b = boxOf(triIdx)

    const candidates = []
    let mm = triMask
    while (mm) {
      const bit = mm & -mm
      mm ^= bit
      candidates.push({ d: (Math.log2(bit) | 0) + 1, bit })
    }

    const countInUnit = (unit, bit) => {
      let count = 0
      for (const j of unit) {
        if (givens[j]) continue
        if (grid[j] !== 0) continue
        if (legal[j] & bit) count++
      }
      return count
    }

    const forced = []
    for (const { d, bit } of candidates) {
      const cr = countInUnit(rowCells[r], bit)
      const cc = countInUnit(colCells[c], bit)
      const cb = countInUnit(boxCells[b], bit)
      if (cr === 1 || cc === 1 || cb === 1) forced.push(d)
    }
    if (forced.length !== 1) return null
    return {
      type: "fill",
      tech: "bug",
      idx: triIdx,
      digit: forced[0],
      triMask,
    }
  }

  const findAlignedPairExclusion = (grid, givens, legal, effective) => {
    const mark = new Int16Array(81)
    let stamp = 1

    const isPeer = (a, b) => {
      for (const p of peersOf[a]) if (p === b) return true
      return false
    }

    const getBivaluePeers = (idx) => {
      const arr = []
      for (const p of peersOf[idx]) {
        if (givens[p]) continue
        if (grid[p] !== 0) continue
        const m = legal[p] || 0
        if (!m) continue
        if (bitCount(m) === 2) arr.push(p)
      }
      return arr
    }

    const baseCells = []
    for (let i = 0; i < 81; i++) {
      if (givens[i]) continue
      if (grid[i] !== 0) continue
      const m = legal[i] || 0
      if (!m) continue
      const bc = bitCount(m)
      if (bc < 2) continue
      baseCells.push(i)
    }
    if (baseCells.length < 2) return null

    const exCache = new Map()
    for (let ai = 0; ai < baseCells.length; ai++) {
      const a = baseCells[ai]
      let exA = exCache.get(a)
      if (!exA) {
        exA = getBivaluePeers(a)
        exCache.set(a, exA)
      }
      if (exA.length < 2) continue
      stamp++
      if (stamp > 30000) {
        stamp = 1
        mark.fill(0)
      }
      for (const x of exA) mark[x] = stamp

      const ma = legal[a] || 0
      for (let bi = ai + 1; bi < baseCells.length; bi++) {
        const b = baseCells[bi]
        let exB = exCache.get(b)
        if (!exB) {
          exB = getBivaluePeers(b)
          exCache.set(b, exB)
        }
        if (exB.length < 2) continue
        const common = []
        for (const x of exB) if (mark[x] === stamp) common.push(x)
        if (common.length < 2) continue

        const mb = legal[b] || 0
        const peers = isPeer(a, b)
        let allowedA = 0
        let allowedB = 0

        let mmA = ma
        while (mmA) {
          const bitA = mmA & -mmA
          mmA ^= bitA
          const dA = (Math.log2(bitA) | 0) + 1
          let mmB = mb
          while (mmB) {
            const bitB = mmB & -mmB
            mmB ^= bitB
            const dB = (Math.log2(bitB) | 0) + 1
            if (peers && dA === dB) continue
            const cut = ~(bitA | bitB) & 0x1ff
            let ok = true
            for (let eIdx = 0; eIdx < common.length; eIdx++) {
              const e = common[eIdx]
              const me = legal[e] || 0
              if ((me & cut) === 0) {
                ok = false
                break
              }
            }
            if (!ok) continue
            allowedA |= bitA
            allowedB |= bitB
          }
        }
        
        if (allowedA === ma && allowedB === mb) continue

        const rmA0 = ma & ~allowedA
        const rmB0 = mb & ~allowedB
        const ea = effective ? effective[a] || 0 : rmA0
        const eb = effective ? effective[b] || 0 : rmB0
        const rmA = rmA0 & ea
        const rmB = rmB0 & eb
        if (!rmA && !rmB) continue

        const elimList = []
        const targets = []
        if (rmA) {
          elimList.push({ idx: a, mask: rmA })
          targets.push(a)
        }
        if (rmB) {
          elimList.push({ idx: b, mask: rmB })
          targets.push(b)
        }
        const src = [a, b, ...common]
        return {
          type: "eliminate",
          tech: "ape",
          unitCells: [],
          sourceCells: src,
          targetCells: targets,
          elimList,
          baseCells: [a, b],
          excluderCells: common,
        }
      }
    }
    return null
  }

  const findAlignedTripletExclusion = (grid, givens, legal, effective) => {
    const sees = (a, b) => {
      for (const p of peersOf[a]) if (p === b) return true
      return false
    }

    const baseOk = new Uint8Array(81)
    for (let i = 0; i < 81; i++) {
      if (givens[i]) continue
      if (grid[i] !== 0) continue
      const m = legal[i] || 0
      if (!m) continue
      if (bitCount(m) >= 2) baseOk[i] = 1
    }

    const getExcluders = (idx) => {
      const out = []
      for (const p of peersOf[idx]) {
        if (givens[p]) continue
        if (grid[p] !== 0) continue
        const m = legal[p] || 0
        if (!m) continue
        const bc = bitCount(m)
        if (bc === 1) return null
        if (bc >= 2 && bc <= 3) out.push(p)
      }
      return out
    }

    const baseCells = []
    for (let i = 0; i < 81; i++) if (baseOk[i]) baseCells.push(i)
    if (baseCells.length < 3) return null

    const mark = new Int16Array(81)
    const mark2 = new Int16Array(81)
    const cSeen = new Int16Array(81)
    let stamp = 1
    let cSeenStamp = 1

    const exCache = new Map()
    const getEx = (i) => {
      if (exCache.has(i)) return exCache.get(i)
      const ex = getExcluders(i)
      exCache.set(i, ex)
      return ex
    }

    for (let ai = 0; ai < baseCells.length; ai++) {
      const a = baseCells[ai]
      const exA = getEx(a)
      if (!exA || exA.length < 2) continue

      stamp++
      if (stamp > 30000) {
        stamp = 1
        mark.fill(0)
        mark2.fill(0)
      }
      for (const x of exA) mark[x] = stamp

      const ma = legal[a] || 0
      for (let bi = ai + 1; bi < baseCells.length; bi++) {
        const b = baseCells[bi]
        const exB = getEx(b)
        if (!exB || exB.length < 2) continue

        const commonAB = []
        for (const x of exB) if (mark[x] === stamp) commonAB.push(x)
        if (commonAB.length < 2) continue

        const candidatesC = []
        stamp++
        if (stamp > 30000) {
          stamp = 1
          mark.fill(0)
          mark2.fill(0)
        }
        for (const x of exA) mark2[x] = stamp
        for (const x of exB) mark2[x] = stamp
        for (const x of exA) if (x > b && baseOk[x] && mark2[x] === stamp) candidatesC.push(x)
        for (const x of exB) if (x > b && baseOk[x] && mark2[x] === stamp) candidatesC.push(x)

        if (!candidatesC.length) continue

        const mb = legal[b] || 0
        const peersAB = sees(a, b)
        stamp++
        if (stamp > 30000) {
          stamp = 1
          mark.fill(0)
          mark2.fill(0)
        }
        for (const x of commonAB) mark2[x] = stamp

        cSeenStamp++
        if (cSeenStamp > 30000) {
          cSeenStamp = 1
          cSeen.fill(0)
        }
        for (const c of candidatesC) {
          if (cSeen[c] === cSeenStamp) continue
          cSeen[c] = cSeenStamp

          const exC = getEx(c)
          if (!exC || exC.length < 2) continue

          const common = []
          for (const x of exC) if (mark2[x] === stamp) common.push(x)
          if (common.length < 2) continue

          const mc = legal[c] || 0
          const peersAC = sees(a, c)
          const peersBC = sees(b, c)

          let allowedA = 0
          let allowedB = 0
          let allowedC = 0

          let mmA = ma
          while (mmA) {
            const bitA = mmA & -mmA
            mmA ^= bitA
            const dA = (Math.log2(bitA) | 0) + 1
            let mmB = mb
            while (mmB) {
              const bitB = mmB & -mmB
              mmB ^= bitB
              const dB = (Math.log2(bitB) | 0) + 1
              if (peersAB && dA === dB) continue
              let mmC = mc
              while (mmC) {
                const bitC = mmC & -mmC
                mmC ^= bitC
                const dC = (Math.log2(bitC) | 0) + 1
                if (peersAC && dA === dC) continue
                if (peersBC && dB === dC) continue
                const cut = ~(bitA | bitB | bitC) & 0x1ff
                let ok = true
                for (let eIdx = 0; eIdx < common.length; eIdx++) {
                  const e = common[eIdx]
                  const me = legal[e] || 0
                  if ((me & cut) === 0) {
                    ok = false
                    break
                  }
                }
                if (!ok) continue
                allowedA |= bitA
                allowedB |= bitB
                allowedC |= bitC
              }
            }
          }
          
          if (allowedA === ma && allowedB === mb && allowedC === mc) continue

          const rmA0 = ma & ~allowedA
          const rmB0 = mb & ~allowedB
          const rmC0 = mc & ~allowedC
          const ea = effective ? effective[a] || 0 : rmA0
          const eb = effective ? effective[b] || 0 : rmB0
          const ec = effective ? effective[c] || 0 : rmC0
          const rmA = rmA0 & ea
          const rmB = rmB0 & eb
          const rmC = rmC0 & ec
          if (!rmA && !rmB && !rmC) continue

          const elimList = []
          const targets = []
          if (rmA) {
            elimList.push({ idx: a, mask: rmA })
            targets.push(a)
          }
          if (rmB) {
            elimList.push({ idx: b, mask: rmB })
            targets.push(b)
          }
          if (rmC) {
            elimList.push({ idx: c, mask: rmC })
            targets.push(c)
          }
          return {
            type: "eliminate",
            tech: "ate",
            unitCells: [],
            sourceCells: [a, b, c, ...common],
            targetCells: targets,
            elimList,
            baseCells: [a, b, c],
            excluderCells: common,
          }
        }
      }
    }
    return null
  }

  const findNishioForcingChains = (grid, givens, legal) => {
    const ON = 1
    const OFF = -1
    const UNKNOWN = 0

    const potIndex = (cell, digit) => cell * 9 + (digit - 1)

    const cellShort = (idx) => `R${((idx / 9) | 0) + 1}C${(idx % 9) + 1}`
    const unitShort = (unitType, unitIndex) =>
      unitType === "row" ? `第 ${unitIndex + 1} 行` : unitType === "col" ? `第 ${unitIndex + 1} 列` : `第 ${unitIndex + 1} 宫`

    const buildBranch = (seedCell, seedDigit, seedOn, res) => {
      const tl = []
      const label = `${cellShort(seedCell)}${seedOn ? "=" : "≠"}${seedDigit}`
      tl.push({
        kind: "assume",
        idx: seedCell,
        digit: seedDigit,
        focusIdx: seedCell,
        text: seedOn ? `假设 ${cellShort(seedCell)} 填入 ${seedDigit}` : `假设 ${cellShort(seedCell)} 不填 ${seedDigit}`,
      })
      tl.push({ kind: "wave", focusIdx: seedCell, text: `自动推导（${Math.max(0, res?.steps || 0)} 步）` })
      if (res && res.ok) {
        tl.push({ kind: "info", focusIdx: seedCell, text: "推演停止：未发现矛盾" })
        return { digit: seedDigit, ok: true, label, timeline: tl }
      }
      const cf = res?.conflict || {}
      let text = "矛盾：推演失败"
      let sub = ""
      if (cf.type === "cell" && cf.idx >= 0) {
        text = `矛盾：${cellShort(cf.idx)} 无候选`
      } else if (cf.type === "unit_empty" && cf.unitType && cf.unitIndex >= 0) {
        text = `矛盾：${unitShort(cf.unitType, cf.unitIndex)} 的数字 ${cf.digit || 0} 无位置`
        sub = `${unitShort(cf.unitType, cf.unitIndex)} 已无法放置 ${cf.digit || 0}`
      } else if (cf.type === "unit_conflict" && cf.unitType && cf.unitIndex >= 0) {
        text = `矛盾：${unitShort(cf.unitType, cf.unitIndex)} 的数字 ${cf.digit || 0} 冲突`
      } else if (cf.type === "pot" && cf.idx >= 0) {
        text = `矛盾：${cellShort(cf.idx)} 的数字 ${cf.digit || 0} 发生冲突`
      }
      tl.push({ kind: "conflict", focusIdx: seedCell, conflict: cf, text, sub })
      return { digit: seedDigit, ok: false, label, timeline: tl }
    }

    const propagate = (seedCell, seedDigit, seedOn) => {
      const state = new Int8Array(81 * 9)
      const qOn = []
      const qOff = []
      let steps = 0
      const touched = new Uint8Array(81)
      const order = []
      const conflict = { type: "", idx: -1, digit: 0, unitType: "", unitIndex: -1 }

      const setPot = (pi, v) => {
        const prev = state[pi]
        if (prev === v) return true
        if (prev && prev !== v) {
          const cell = (pi / 9) | 0
          conflict.type = "pot"
          conflict.idx = cell
          conflict.digit = (pi % 9) + 1
          return false
        }
        state[pi] = v
        steps++
        const cell = (pi / 9) | 0
        if (!touched[cell]) {
          touched[cell] = 1
          if (order.length < 18) order.push(cell)
        }
        if (v === ON) qOn.push(pi)
        else if (v === OFF) qOff.push(pi)
        return true
      }

      const setCellOffExcept = (cell, digit) => {
        for (let d = 1; d <= 9; d++) {
          if (d === digit) continue
          if (!setPot(potIndex(cell, d), OFF)) return false
        }
        return true
      }

      const checkCell = (cell) => {
        let onDigit = 0
        let avail = 0
        let lastDigit = 0
        for (let d = 1; d <= 9; d++) {
          const s = state[potIndex(cell, d)]
          if (s === OFF) continue
          avail++
          lastDigit = d
          if (s === ON) onDigit = d
        }
        if (!avail) {
          conflict.type = "cell"
          conflict.idx = cell
          return false
        }
        if (onDigit) return true
        if (avail === 1) {
          if (!setPot(potIndex(cell, lastDigit), ON)) return false
          if (!setCellOffExcept(cell, lastDigit)) return false
        }
        return true
      }

      const checkUnitDigit = (unit, unitType, unitIndex, digit) => {
        let onCount = 0
        let avail = 0
        let lastCell = -1
        for (const cell of unit) {
          const s = state[potIndex(cell, digit)]
          if (s === OFF) continue
          avail++
          lastCell = cell
          if (s === ON) onCount++
        }
        if (onCount > 1) {
          conflict.type = "unit_conflict"
          conflict.unitType = unitType
          conflict.unitIndex = unitIndex
          conflict.digit = digit
          return false
        }
        if (!avail) {
          conflict.type = "unit_empty"
          conflict.unitType = unitType
          conflict.unitIndex = unitIndex
          conflict.digit = digit
          return false
        }
        if (onCount === 0 && avail === 1) {
          if (!setPot(potIndex(lastCell, digit), ON)) return false
          if (!setCellOffExcept(lastCell, digit)) return false
        }
        return true
      }

      const init = () => {
        for (let cell = 0; cell < 81; cell++) {
          const v = grid[cell] || 0
          if (v) {
            for (let d = 1; d <= 9; d++) state[potIndex(cell, d)] = d === v ? ON : OFF
            continue
          }
          if (givens[cell]) {
            for (let d = 1; d <= 9; d++) state[potIndex(cell, d)] = OFF
            continue
          }
          const mask = legal[cell] || 0
          for (let d = 1; d <= 9; d++) state[potIndex(cell, d)] = mask & (1 << (d - 1)) ? UNKNOWN : OFF
        }
        for (let cell = 0; cell < 81; cell++) {
          if (grid[cell] !== 0) continue
          if (givens[cell]) continue
          if (!checkCell(cell)) return false
        }
        for (let d = 1; d <= 9; d++) {
          for (let r = 0; r < 9; r++) if (!checkUnitDigit(rowCells[r], "row", r, d)) return false
          for (let c = 0; c < 9; c++) if (!checkUnitDigit(colCells[c], "col", c, d)) return false
          for (let b = 0; b < 9; b++) if (!checkUnitDigit(boxCells[b], "box", b, d)) return false
        }
        return true
      }

      if (!init()) return { ok: false, steps, order, conflict }

      if (seedOn) {
        if (!setPot(potIndex(seedCell, seedDigit), ON)) return { ok: false, steps, order, conflict }
        if (!setCellOffExcept(seedCell, seedDigit)) return { ok: false, steps, order, conflict }
      } else {
        if (!setPot(potIndex(seedCell, seedDigit), OFF)) return { ok: false, steps, order, conflict }
      }

      while (qOn.length || qOff.length) {
        while (qOn.length) {
          const pi = qOn.pop()
          const cell = (pi / 9) | 0
          const digit = (pi % 9) + 1

          if (!checkCell(cell)) return { ok: false, steps, order, conflict }

          for (const p of peersOf[cell]) {
            const pj = potIndex(p, digit)
            if (!setPot(pj, OFF)) return { ok: false, steps, order, conflict }
          }

          const r = (cell / 9) | 0
          const c = cell % 9
          const b = boxOf(cell)
          if (!checkUnitDigit(rowCells[r], "row", r, digit)) return { ok: false, steps, order, conflict }
          if (!checkUnitDigit(colCells[c], "col", c, digit)) return { ok: false, steps, order, conflict }
          if (!checkUnitDigit(boxCells[b], "box", b, digit)) return { ok: false, steps, order, conflict }
        }
        while (qOff.length) {
          const pi = qOff.pop()
          const cell = (pi / 9) | 0
          const digit = (pi % 9) + 1

          if (!checkCell(cell)) return { ok: false, steps, order, conflict }

          const r = (cell / 9) | 0
          const c = cell % 9
          const b = boxOf(cell)
          if (!checkUnitDigit(rowCells[r], "row", r, digit)) return { ok: false, steps, order, conflict }
          if (!checkUnitDigit(colCells[c], "col", c, digit)) return { ok: false, steps, order, conflict }
          if (!checkUnitDigit(boxCells[b], "box", b, digit)) return { ok: false, steps, order, conflict }
        }
      }
      return { ok: true, steps, order }
    }

    const seeds = []
    for (let idx = 0; idx < 81; idx++) {
      if (givens[idx]) continue
      if (grid[idx] !== 0) continue
      const m = legal[idx] || 0
      if (!m) continue
      const bc = bitCount(m)
      if (bc < 2) continue
      seeds.push({ idx, bc, m })
    }
    seeds.sort((a, b) => a.bc - b.bc)
    const maxSeeds = Math.min(seeds.length, 30)

    for (let si = 0; si < maxSeeds; si++) {
      const { idx, m } = seeds[si]
      let mm = m
      while (mm) {
        const bit = mm & -mm
        mm ^= bit
        const d = (Math.log2(bit) | 0) + 1
        const a = propagate(idx, d, true)
        if (!a.ok) {
          const b = propagate(idx, d, false)
          const cf = a.conflict || {}
          const cc = cf.idx >= 0 ? [cf.idx] : []
          return {
            type: "eliminate",
            tech: "forcing_cell",
            forcingKind: "nishio",
            digit: d,
            elimMask: bit,
            unitCells: [],
            sourceCells: [idx],
            targetCells: [idx],
            elimList: [{ idx, mask: bit }],
            idx,
            complexity: a.steps + 2,
            chainNodes: a.order || [idx],
            conflictType: cf.type || "",
            conflictIdx: cf.idx ?? -1,
            conflictDigit: cf.digit || 0,
            conflictUnitType: cf.unitType || "",
            conflictUnitIndex: cf.unitIndex ?? -1,
            conflictCells: cc,
            traceBranches: [buildBranch(idx, d, true, a), buildBranch(idx, d, false, b)],
            traceDefaultBranch: 0,
          }
        }
        const b = propagate(idx, d, false)
        if (!b.ok) {
          const cf = b.conflict || {}
          const cc = cf.idx >= 0 ? [cf.idx] : []
          return {
            type: "fill",
            tech: "forcing_cell",
            forcingKind: "nishio",
            idx,
            digit: d,
            complexity: b.steps + 2,
            chainNodes: b.order || [idx],
            conflictType: cf.type || "",
            conflictIdx: cf.idx ?? -1,
            conflictDigit: cf.digit || 0,
            conflictUnitType: cf.unitType || "",
            conflictUnitIndex: cf.unitIndex ?? -1,
            conflictCells: cc,
            traceBranches: [buildBranch(idx, d, false, b), buildBranch(idx, d, true, a)],
            traceDefaultBranch: 0,
          }
        }
      }
    }
    return null
  }

  const findWXYZWing = (grid, givens, legal, elim) => {
    const sees = (a, b) => {
      for (const p of peersOf[a]) if (p === b) return true
      return false
    }

    const intersectWithPeers = (set, idx) => {
      const out = new Set()
      for (const p of peersOf[idx]) if (set.has(p)) out.add(p)
      return out
    }

    const addElim = (map, idx, mask) => {
      const prev = map.get(idx) || 0
      map.set(idx, prev | mask)
    }

    const checkLinked = (yz, xz, wz, wxyz, candBit, xzMask, wzMask, wxyzMask) => {
      if ((xzMask & candBit) && !sees(yz, xz)) return false
      if ((wzMask & candBit) && !sees(yz, wz)) return false
      if ((wxyzMask & candBit) && !sees(yz, wxyz)) return false
      return true
    }

    for (let wxyz = 0; wxyz < 81; wxyz++) {
      if (givens[wxyz]) continue
      if (grid[wxyz] !== 0) continue
      const wxyzMask = legal[wxyz] || 0
      const wxyzCount = bitCount(wxyzMask)
      if (wxyzCount < 2 || wxyzCount > 4) continue

      const peerWxyz = peersOf[wxyz]
      const peerWxyzSet = new Set(peerWxyz)

      for (const wz of peerWxyz) {
        if (givens[wz]) continue
        if (grid[wz] !== 0) continue
        const wzMask = legal[wz] || 0
        const wzCount = bitCount(wzMask)
        if (wzCount <= 1) continue
        if (bitCount(wxyzMask | wzMask) >= 5) continue

        const peerWzSet = new Set(peersOf[wz])
        for (const xz of peerWxyz) {
          if (xz === wz) continue
          if (!peerWzSet.has(xz)) continue
          if (givens[xz]) continue
          if (grid[xz] !== 0) continue
          const xzMask = legal[xz] || 0
          const xzCount = bitCount(xzMask)
          if (xzCount <= 1) continue
          const interMask = wxyzMask | wzMask | xzMask
          if (bitCount(interMask) !== 4) continue

          const yzRange = new Set(peerWxyz)
          for (const p of peersOf[wz]) yzRange.add(p)
          for (const p of peersOf[xz]) yzRange.add(p)
          yzRange.delete(wxyz)
          yzRange.delete(wz)
          yzRange.delete(xz)

          for (const yz of yzRange) {
            if (givens[yz]) continue
            if (grid[yz] !== 0) continue
            const yzMask = legal[yz] || 0
            if (bitCount(yzMask) !== 2) continue
            if ((yzMask & interMask) !== yzMask) continue

            const aBit = yzMask & -yzMask
            const bBit = yzMask ^ aBit
            let xBit = aBit
            let zBit = bBit

            let doubleLink = checkLinked(yz, xz, wz, wxyz, zBit, xzMask, wzMask, wxyzMask)
            if (!checkLinked(yz, xz, wz, wxyz, xBit, xzMask, wzMask, wxyzMask)) {
              if (!doubleLink) continue
              xBit = bBit
              zBit = aBit
              doubleLink = false
              if (!checkLinked(yz, xz, wz, wxyz, xBit, xzMask, wzMask, wxyzMask)) continue
            }

            const exclude = new Set([wxyz, wz, xz, yz])
            const elimMap = new Map()

            const eliminateXZ = (candBit) => {
              let victims = new Set(peersOf[yz])
              if (xzMask & candBit) victims = intersectWithPeers(victims, xz)
              if (wzMask & candBit) victims = intersectWithPeers(victims, wz)
              if (wxyzMask & candBit) victims = intersectWithPeers(victims, wxyz)
              for (const ex of exclude) victims.delete(ex)
              for (const v of victims) {
                if (givens[v]) continue
                if (grid[v] !== 0) continue
                const m = (elim[v] || 0) & candBit
                if (m) addElim(elimMap, v, m)
              }
            }

            const eliminateW = (candBit) => {
              const req = []
              if (xzMask & candBit) req.push(xz)
              if (wzMask & candBit) req.push(wz)
              if (wxyzMask & candBit) req.push(wxyz)
              if (!req.length) return
              let victims = new Set(peersOf[req[0]])
              for (let i = 1; i < req.length; i++) victims = intersectWithPeers(victims, req[i])
              for (const ex of exclude) victims.delete(ex)
              for (const v of victims) {
                if (givens[v]) continue
                if (grid[v] !== 0) continue
                const m = (elim[v] || 0) & candBit
                if (m) addElim(elimMap, v, m)
              }
            }

            if (doubleLink) {
              let rem = interMask ^ yzMask
              while (rem) {
                const bit = rem & -rem
                rem ^= bit
                eliminateW(bit)
              }
              eliminateXZ(xBit)
            }
            eliminateXZ(zBit)

            if (!elimMap.size) continue

            const elimList = []
            const targets = []
            for (const [idx, mask] of elimMap.entries()) {
              elimList.push({ idx, mask })
              targets.push(idx)
            }

            const biggestCardinality = Math.max(wxyzCount, wzCount, xzCount)
            const wingSize = wxyzCount + wzCount + xzCount
            return {
              type: "eliminate",
              tech: "wxyzwing",
              unitCells: [],
              sourceCells: [wxyz, wz, xz, yz],
              targetCells: targets,
              elimList,
              wxyzIdx: wxyz,
              wzIdx: wz,
              xzIdx: xz,
              yzIdx: yz,
              xBit,
              zBit,
              interMask,
              doubleLink,
              biggestCardinality,
              wingSize,
            }
          }
        }
      }
    }
    return null
  }

  const findVWXYZWing = (grid, givens, legal, elim) => {
    const sees = (a, b) => {
      for (const p of peersOf[a]) if (p === b) return true
      return false
    }

    const intersectWithPeers = (set, idx) => {
      const out = new Set()
      for (const p of peersOf[idx]) if (set.has(p)) out.add(p)
      return out
    }

    const addElim = (map, idx, mask) => {
      const prev = map.get(idx) || 0
      map.set(idx, prev | mask)
    }

    const checkLinked = (yz, candBit, cells, masks) => {
      for (let i = 0; i < cells.length; i++) {
        if (masks[i] & candBit) {
          if (!sees(yz, cells[i])) return false
        }
      }
      return true
    }

    const eliminateFromStart = (startSet, candBit, includeCells, includeMasks, excludeSet, elimMap) => {
      let victims = new Set(startSet)
      for (let i = 0; i < includeCells.length; i++) {
        if (includeMasks[i] & candBit) victims = intersectWithPeers(victims, includeCells[i])
      }
      for (const ex of excludeSet) victims.delete(ex)
      for (const v of victims) {
        if (givens[v]) continue
        if (grid[v] !== 0) continue
        const m = (elim[v] || 0) & candBit
        if (m) addElim(elimMap, v, m)
      }
    }

    for (let vwxyz = 0; vwxyz < 81; vwxyz++) {
      if (givens[vwxyz]) continue
      if (grid[vwxyz] !== 0) continue
      const vwxyzMask = legal[vwxyz] || 0
      const vwxyzCount = bitCount(vwxyzMask)
      if (vwxyzCount < 2 || vwxyzCount > 5) continue

      const peersVwxyz = peersOf[vwxyz]
      for (const vz of peersVwxyz) {
        if (vz === vwxyz) continue
        if (givens[vz]) continue
        if (grid[vz] !== 0) continue
        const vzMask = legal[vz] || 0
        const vzCount = bitCount(vzMask)
        if (vzCount <= 1) continue
        let union2 = vwxyzMask | vzMask
        if (bitCount(union2) >= 6) continue

        const peerVzSet = new Set(peersOf[vz])
        for (const wz of peersVwxyz) {
          if (wz === vwxyz || wz === vz) continue
          if (!peerVzSet.has(wz)) continue
          if (givens[wz]) continue
          if (grid[wz] !== 0) continue
          const wzMask = legal[wz] || 0
          const wzCount = bitCount(wzMask)
          if (wzCount <= 1) continue
          let union3 = union2 | wzMask
          if (bitCount(union3) >= 6) continue

          const peerWzSet = new Set(peersOf[wz])
          for (const xz of peersVwxyz) {
            if (xz === vwxyz || xz === vz || xz === wz) continue
            if (!peerVzSet.has(xz)) continue
            if (!peerWzSet.has(xz)) continue
            if (givens[xz]) continue
            if (grid[xz] !== 0) continue
            const xzMask = legal[xz] || 0
            const xzCount = bitCount(xzMask)
            if (xzCount <= 1) continue
            const union4 = union3 | xzMask
            if (bitCount(union4) !== 5) continue

            const yzRange = new Set(peersVwxyz)
            for (const p of peersOf[vz]) yzRange.add(p)
            for (const p of peersOf[wz]) yzRange.add(p)
            for (const p of peersOf[xz]) yzRange.add(p)
            yzRange.delete(vwxyz)
            yzRange.delete(vz)
            yzRange.delete(wz)
            yzRange.delete(xz)

            for (const yz of yzRange) {
              if (givens[yz]) continue
              if (grid[yz] !== 0) continue
              const yzMask = legal[yz] || 0
              if (bitCount(yzMask) !== 2) continue
              if ((yzMask & union4) !== yzMask) continue

              const aBit = yzMask & -yzMask
              const bBit = yzMask ^ aBit
              let xBit = aBit
              let zBit = bBit

              const cells = [vwxyz, vz, wz, xz]
              const masks = [vwxyzMask, vzMask, wzMask, xzMask]
              let doubleLink = checkLinked(yz, zBit, cells, masks)
              if (!checkLinked(yz, xBit, cells, masks)) {
                if (!doubleLink) continue
                xBit = bBit
                zBit = aBit
                doubleLink = false
                if (!checkLinked(yz, xBit, cells, masks)) continue
              }

              const exclude = new Set([vwxyz, vz, wz, xz, yz])
              const elimMap = new Map()

              if (doubleLink) {
                let rem = union4 ^ yzMask
                while (rem) {
                  const wBit = rem & -rem
                  rem ^= wBit
                  let startPeers = null
                  for (const idx of [xz, wz, vz, vwxyz]) {
                    const m = idx === vwxyz ? vwxyzMask : idx === vz ? vzMask : idx === wz ? wzMask : xzMask
                    if (m & wBit) {
                      startPeers = peersOf[idx]
                      break
                    }
                  }
                  if (startPeers) eliminateFromStart(startPeers, wBit, cells, masks, exclude, elimMap)
                }
                eliminateFromStart(peersOf[yz], xBit, cells, masks, exclude, elimMap)
              }
              eliminateFromStart(peersOf[yz], zBit, cells, masks, exclude, elimMap)

              if (!elimMap.size) continue
              const elimList = []
              const targets = []
              for (const [idx, mask] of elimMap.entries()) {
                elimList.push({ idx, mask })
                targets.push(idx)
              }

              const biggestCardinality = Math.max(vwxyzCount, vzCount, wzCount, xzCount)
              const wingSize = vwxyzCount + vzCount + wzCount + xzCount
              return {
                type: "eliminate",
                tech: "vwxyzwing",
                unitCells: [],
                sourceCells: [vwxyz, vz, wz, xz, yz],
                targetCells: targets,
                elimList,
                vwxyzIdx: vwxyz,
                vzIdx: vz,
                wzIdx: wz,
                xzIdx: xz,
                yzIdx: yz,
                xBit,
                zBit,
                unionMask: union4,
                doubleLink,
                biggestCardinality,
                wingSize,
              }
            }
          }
        }
      }
    }
    return null
  }

  const buildHouseCandidatesForDigit = (grid, givens, legal, digit) => {
    const bit = 1 << (digit - 1)
    const row = Array.from({ length: 9 }, () => [])
    const col = Array.from({ length: 9 }, () => [])
    const box = Array.from({ length: 9 }, () => [])
    const nodes = []
    for (let i = 0; i < 81; i++) {
      if (givens[i]) continue
      if (grid[i] !== 0) continue
      if (!(legal[i] & bit)) continue
      nodes.push(i)
      row[(i / 9) | 0].push(i)
      col[i % 9].push(i)
      box[boxOf(i)].push(i)
    }
    return { bit, nodes, row, col, box }
  }

  const findXChain = (grid, givens, legal, elim) => {
    for (let d = 1; d <= 9; d++) {
      const { bit, nodes, row, col, box } = buildHouseCandidatesForDigit(grid, givens, legal, d)
      if (nodes.length < 4) continue

      const strong = new Map()
      const weak = new Map()
      const addEdge = (map, a, b) => {
        const arr = map.get(a) || []
        arr.push(b)
        map.set(a, arr)
      }
      const addWeakInHouse = (arr) => {
        if (arr.length < 2) return
        for (let i = 0; i < arr.length; i++) {
          for (let j = i + 1; j < arr.length; j++) {
            addEdge(weak, arr[i], arr[j])
            addEdge(weak, arr[j], arr[i])
          }
        }
      }
      const addStrongInHouse = (arr) => {
        if (arr.length !== 2) return
        addEdge(strong, arr[0], arr[1])
        addEdge(strong, arr[1], arr[0])
      }
      for (let i = 0; i < 9; i++) {
        addWeakInHouse(row[i])
        addWeakInHouse(col[i])
        addWeakInHouse(box[i])
        addStrongInHouse(row[i])
        addStrongInHouse(col[i])
        addStrongInHouse(box[i])
      }

      const tryFrom = (start) => {
        const startKey = start * 2 + 1
        const prev = new Map()
        prev.set(startKey, { pk: -1, edge: "" })
        const q = [startKey]
        for (let qi = 0; qi < q.length; qi++) {
          const key = q[qi]
          const node = (key / 2) | 0
          const expectStrong = (key & 1) === 1
          const neigh = expectStrong ? strong.get(node) || [] : weak.get(node) || []
          for (const nb of neigh) {
            const nk = nb * 2 + (expectStrong ? 0 : 1)
            if (prev.has(nk)) continue
            prev.set(nk, { pk: key, edge: expectStrong ? "strong" : "weak" })
            q.push(nk)
            if (nb === start) continue
            if ((nk & 1) !== 0) continue
            const pathNodes = []
            const pathLinks = []
            let cur = nk
            while (cur !== startKey) {
              const info = prev.get(cur)
              if (!info) break
              const n = (cur / 2) | 0
              pathNodes.push(n)
              pathLinks.push(info.edge)
              cur = info.pk
            }
            pathNodes.push(start)
            pathNodes.reverse()
            pathLinks.reverse()
            const chainSet = new Set(pathNodes)
            const pset = new Set(peersOf[nb])
            const targets = []
            for (const t of peersOf[start]) {
              if (!pset.has(t)) continue
              if (chainSet.has(t)) continue
              if (givens[t]) continue
              if (grid[t] !== 0) continue
              if (elim[t] & bit) targets.push(t)
            }
            if (!targets.length) continue
            return {
              type: "eliminate",
              tech: "xchain",
              digit: d,
              elimMask: bit,
              unitCells: [],
              sourceCells: pathNodes,
              targetCells: targets,
              chainNodes: pathNodes,
              chainLinks: pathLinks,
            }
          }
        }
        return null
      }

      for (const s of nodes) {
        const h = tryFrom(s)
        if (h) return h
      }
    }
    return null
  }

  const findXCycle = (grid, givens, legal, elim) => {
    const addEdge = (map, a, b, type) => {
      const arr = map.get(a) || []
      arr.push({ to: b, type })
      map.set(a, arr)
    }
    const hasEdgeType = (map, a, b, type) => {
      const arr = map.get(a) || []
      for (const e of arr) if (e.to === b && e.type === type) return true
      return false
    }

    for (let d = 1; d <= 9; d++) {
      const { bit, nodes, row, col, box } = buildHouseCandidatesForDigit(grid, givens, legal, d)
      if (nodes.length < 5) continue

      const adj = new Map()
      const addStrongInHouse = (arr) => {
        if (arr.length !== 2) return
        addEdge(adj, arr[0], arr[1], "strong")
        addEdge(adj, arr[1], arr[0], "strong")
      }
      const addWeakInHouse = (arr) => {
        if (arr.length < 2) return
        for (let i = 0; i < arr.length; i++) {
          for (let j = i + 1; j < arr.length; j++) {
            const a = arr[i]
            const b = arr[j]
            if (hasEdgeType(adj, a, b, "strong") || hasEdgeType(adj, b, a, "strong")) continue
            addEdge(adj, a, b, "weak")
            addEdge(adj, b, a, "weak")
          }
        }
      }
      for (let i = 0; i < 9; i++) {
        addStrongInHouse(row[i])
        addStrongInHouse(col[i])
        addStrongInHouse(box[i])
      }
      for (let i = 0; i < 9; i++) {
        addWeakInHouse(row[i])
        addWeakInHouse(col[i])
        addWeakInHouse(box[i])
      }

      const maxLen = 14

      const normalizeCycle = (cycleNodes, cycleLinks) => {
        const n = cycleNodes.length
        let best = 0
        for (let i = 1; i < n; i++) {
          if (cycleNodes[i] < cycleNodes[best]) best = i
        }
        const rn = []
        const rl = []
        for (let k = 0; k < n; k++) rn.push(cycleNodes[(best + k) % n])
        for (let k = 0; k < n; k++) rl.push(cycleLinks[(best + k) % n])
        return { rn, rl }
      }

      const computeDiscontinuities = (cycleLinks) => {
        const n = cycleLinks.length
        const idxs = []
        for (let i = 0; i < n; i++) {
          const prev = cycleLinks[(i - 1 + n) % n]
          const cur = cycleLinks[i]
          if (prev === cur) idxs.push(i)
        }
        return idxs
      }

      const seenCycles = new Set()

      const tryBuildHint = (cycleNodes, cycleLinks) => {
        const n = cycleNodes.length
        if (n < 4) return null
        const disc = computeDiscontinuities(cycleLinks)
        if (disc.length > 1) return null

        const { rn, rl } = normalizeCycle(cycleNodes, cycleLinks)
        const key = rn.join(",") + "|" + rl.join(",")
        if (seenCycles.has(key)) return null
        seenCycles.add(key)

        if (disc.length === 1) {
          const i = disc[0]
          const node = cycleNodes[i]
          const prevT = cycleLinks[(i - 1 + n) % n]
          const curT = cycleLinks[i]
          if (prevT === "strong" && curT === "strong") {
            return {
              type: "fill",
              tech: "xcycle",
              idx: node,
              digit: d,
              cycleNodes: rn,
              cycleLinks: rl,
              forcedIdx: node,
              forcedState: "true",
            }
          }
          if (prevT === "weak" && curT === "weak") {
            if (elim[node] & bit)
              return {
                type: "eliminate",
                tech: "xcycle",
                digit: d,
                elimMask: bit,
                unitCells: [],
                sourceCells: rn,
                targetCells: [node],
                cycleNodes: rn,
                cycleLinks: rl,
                forcedIdx: node,
                forcedState: "false",
              }
          }
          return null
        }

        for (let i = 0; i < n; i++) {
          if (cycleLinks[i] !== "weak") continue
          const a = cycleNodes[i]
          const b = cycleNodes[(i + 1) % n]
          const as = new Set(peersOf[a])
          const targets = []
          for (const t of peersOf[b]) {
            if (!as.has(t)) continue
            if (t === a || t === b) continue
            if (givens[t]) continue
            if (grid[t] !== 0) continue
            if (elim[t] & bit) targets.push(t)
          }
          if (!targets.length) continue
          return {
            type: "eliminate",
            tech: "xcycle",
            digit: d,
            elimMask: bit,
            unitCells: [],
            sourceCells: rn,
            targetCells: targets,
            cycleNodes: rn,
            cycleLinks: rl,
            weakEdge: [a, b],
          }
        }
        return null
      }

      const dfs = (start, cur, pathNodes, pathLinks, used, discCount) => {
        if (pathNodes.length > maxLen) return null
        const neigh = adj.get(cur) || []
        for (const e of neigh) {
          const nb = e.to
          if (nb === start) {
            if (pathNodes.length < 4) continue
            const cycleNodes = pathNodes.slice()
            const cycleLinks = pathLinks.concat([e.type])
            const h = tryBuildHint(cycleNodes, cycleLinks)
            if (h) return h
            continue
          }
          if (used.has(nb)) continue
          const lastType = pathLinks.length ? pathLinks[pathLinks.length - 1] : null
          let nextDisc = discCount
          if (lastType && e.type === lastType) {
            if (discCount >= 1) continue
            nextDisc = 1
          }
          used.add(nb)
          pathNodes.push(nb)
          pathLinks.push(e.type)
          const h = dfs(start, nb, pathNodes, pathLinks, used, nextDisc)
          if (h) return h
          pathNodes.pop()
          pathLinks.pop()
          used.delete(nb)
        }
        return null
      }

      for (const s of nodes) {
        const used = new Set([s])
        const h = dfs(s, s, [s], [], used, 0)
        if (h) return h
      }
    }
    return null
  }

  const findXYCycle = (grid, givens, legal, elim) => {
    const sees = (a, b) => {
      for (const p of peersOf[a]) if (p === b) return true
      return false
    }

    const biv = []
    const maskOf = new Uint16Array(81)
    for (let i = 0; i < 81; i++) {
      if (givens[i]) continue
      if (grid[i] !== 0) continue
      const m = legal[i] || 0
      if (bitCount(m) !== 2) continue
      biv.push(i)
      maskOf[i] = m
    }
    if (biv.length < 4) return null

    const adj = new Map()
    const add = (a, b, shared) => {
      const arr = adj.get(a) || []
      arr.push({ to: b, shared })
      adj.set(a, arr)
    }
    for (let i = 0; i < biv.length; i++) {
      const a = biv[i]
      const am = maskOf[a]
      for (let j = i + 1; j < biv.length; j++) {
        const b = biv[j]
        if (!sees(a, b)) continue
        const bm = maskOf[b]
        const inter = am & bm
        if (bitCount(inter) !== 1) continue
        add(a, b, inter)
        add(b, a, inter)
      }
    }

    const maxLen = 12
    const seen = new Set()
    const norm = (nodes, links) => {
      const n = nodes.length
      let best = 0
      for (let i = 1; i < n; i++) if (nodes[i] < nodes[best]) best = i
      const rn = []
      const rl = []
      for (let k = 0; k < n; k++) rn.push(nodes[(best + k) % n])
      for (let k = 0; k < n; k++) rl.push(links[(best + k) % n])
      return { rn, rl }
    }

    const cellDigits = (m) => {
      const ds = []
      let mm = m
      while (mm) {
        const bit = mm & -mm
        mm ^= bit
        ds.push(bit)
      }
      return ds
    }

    const buildElim = (cycleNodes) => {
      const digitsMap = new Map()
      for (const c of cycleNodes) {
        for (const bit of cellDigits(maskOf[c])) {
          const arr = digitsMap.get(bit) || []
          arr.push(c)
          digitsMap.set(bit, arr)
        }
      }
      for (const [bit, cells] of digitsMap.entries()) {
        const uniq = Array.from(new Set(cells))
        if (uniq.length !== 2) continue
        const a = uniq[0]
        const b = uniq[1]
        const as = new Set(peersOf[a])
        const targets = []
        for (const t of peersOf[b]) {
          if (!as.has(t)) continue
          if (t === a || t === b) continue
          if (cycleNodes.includes(t)) continue
          if (givens[t]) continue
          if (grid[t] !== 0) continue
          if (elim[t] & bit) targets.push(t)
        }
        if (!targets.length) continue
        return { bit, digit: digitFromSingleMask(bit), targets, endA: a, endB: b }
      }
      return null
    }

    const validLocal = (prev, cur, next, linkPrev, linkNext) => {
      const m = maskOf[cur]
      const mp = maskOf[prev]
      const mn = maskOf[next]
      const a = m & mp
      const b = m & mn
      if (bitCount(a) !== 1 || bitCount(b) !== 1) return false
      if (a === b) return false
      if (!(a & linkPrev)) return false
      if (!(b & linkNext)) return false
      return true
    }

    const dfs = (start, cur, pathNodes, pathLinks, used) => {
      if (pathNodes.length > maxLen) return null
      const neigh = adj.get(cur) || []
      for (const e of neigh) {
        const nb = e.to
        if (nb === start) {
          if (pathNodes.length < 4) continue
          const nodes = pathNodes.slice()
          const links = pathLinks.concat([e.shared])
          const n = nodes.length
          let ok = true
          for (let i = 0; i < n; i++) {
            const prev = nodes[(i - 1 + n) % n]
            const cur2 = nodes[i]
            const next = nodes[(i + 1) % n]
            const lp = links[(i - 1 + n) % n]
            const ln = links[i]
            if (!validLocal(prev, cur2, next, lp, ln)) {
              ok = false
              break
            }
          }
          if (!ok) continue
          const { rn, rl } = norm(nodes, links)
          const key = rn.join(",") + "|" + rl.join(",")
          if (seen.has(key)) continue
          seen.add(key)
          const elimInfo = buildElim(rn)
          if (!elimInfo) continue
          return {
            type: "eliminate",
            tech: "xycycle",
            digit: elimInfo.digit,
            elimMask: 1 << (elimInfo.digit - 1),
            unitCells: [],
            sourceCells: rn,
            targetCells: elimInfo.targets,
            cycleNodes: rn,
            cycleLinks: rl,
            endAIdx: elimInfo.endA,
            endBIdx: elimInfo.endB,
          }
        }
        if (used.has(nb)) continue
        used.add(nb)
        pathNodes.push(nb)
        pathLinks.push(e.shared)
        const h = dfs(start, nb, pathNodes, pathLinks, used)
        if (h) return h
        pathLinks.pop()
        pathNodes.pop()
        used.delete(nb)
      }
      return null
    }

    for (const s of biv) {
      const used = new Set([s])
      const h = dfs(s, s, [s], [], used)
      if (h) return h
    }
    return null
  }

  const findXYWing = (grid, givens, legal, elim) => {
    for (let pivot = 0; pivot < 81; pivot++) {
      if (givens[pivot]) continue
      if (grid[pivot] !== 0) continue
      const pm = legal[pivot] || 0
      if (!pm) continue
      if (bitCount(pm) !== 2) continue
      const aBit = pm & -pm
      const bBit = pm ^ aBit
      const wingsA = []
      const wingsB = []
      for (const w of peersOf[pivot]) {
        if (givens[w]) continue
        if (grid[w] !== 0) continue
        const wm = legal[w] || 0
        if (!wm) continue
        if (bitCount(wm) !== 2) continue
        const inter = wm & pm
        if (bitCount(inter) !== 1) continue
        const cBit = wm ^ inter
        if (inter === aBit) wingsA.push({ idx: w, cBit })
        else if (inter === bBit) wingsB.push({ idx: w, cBit })
      }
      if (!wingsA.length || !wingsB.length) continue
      const mapA = new Map()
      for (const w of wingsA) {
        const arr = mapA.get(w.cBit) || []
        arr.push(w.idx)
        mapA.set(w.cBit, arr)
      }
      for (const wb of wingsB) {
        const aList = mapA.get(wb.cBit)
        if (!aList || !aList.length) continue
        const wingB = wb.idx
        const cBit = wb.cBit
        const peerSet = new Set(peersOf[wingB])
        for (const wingA of aList) {
          if (wingA === wingB) continue
          const targets = []
          for (const t of peersOf[wingA]) {
            if (!peerSet.has(t)) continue
            if (t === pivot || t === wingA || t === wingB) continue
            if (givens[t]) continue
            if (grid[t] !== 0) continue
            if (elim[t] & cBit) targets.push(t)
          }
          if (!targets.length) continue
          return {
            type: "eliminate",
            tech: "xywing",
            digit: digitFromSingleMask(cBit),
            elimMask: cBit,
            unitCells: [],
            sourceCells: [pivot, wingA, wingB],
            targetCells: targets,
            pivotIdx: pivot,
            wingAIdx: wingA,
            wingBIdx: wingB,
          }
        }
      }
    }
    return null
  }

  const findXYZWing = (grid, givens, legal, elim) => {
    for (let pivot = 0; pivot < 81; pivot++) {
      if (givens[pivot]) continue
      if (grid[pivot] !== 0) continue
      const pm = legal[pivot] || 0
      if (!pm) continue
      if (bitCount(pm) !== 3) continue

      const pr = (pivot / 9) | 0
      const pc = pivot % 9
      const pb = boxOf(pivot)

      const wingsBox = []
      const wingsLine = []
      for (const w of peersOf[pivot]) {
        if (givens[w]) continue
        if (grid[w] !== 0) continue
        const wm = legal[w] || 0
        if (!wm) continue
        if (bitCount(wm) !== 2) continue
        if ((wm & pm) !== wm) continue
        const wr = (w / 9) | 0
        const wc = w % 9
        const wb = boxOf(w)
        if (wb === pb) wingsBox.push({ idx: w, mask: wm })
        else if (wr === pr || wc === pc) wingsLine.push({ idx: w, mask: wm })
      }
      if (!wingsBox.length || !wingsLine.length) continue

      for (const wa of wingsBox) {
        for (const wb of wingsLine) {
          const zBit = wa.mask & wb.mask
          if (bitCount(zBit) !== 1) continue
          const union = wa.mask | wb.mask
          if (union !== pm) continue
          const peerB = new Set(peersOf[wb.idx])
          const peerA = new Set(peersOf[wa.idx])
          const targets = []
          for (const t of peersOf[pivot]) {
            if (!peerA.has(t)) continue
            if (!peerB.has(t)) continue
            if (t === pivot || t === wa.idx || t === wb.idx) continue
            if (givens[t]) continue
            if (grid[t] !== 0) continue
            if (elim[t] & zBit) targets.push(t)
          }
          if (!targets.length) continue
          return {
            type: "eliminate",
            tech: "xyzwing",
            digit: digitFromSingleMask(zBit),
            elimMask: zBit,
            unitCells: [],
            sourceCells: [pivot, wa.idx, wb.idx],
            targetCells: targets,
            pivotIdx: pivot,
            wingAIdx: wa.idx,
            wingBIdx: wb.idx,
          }
        }
      }
    }
    return null
  }

  const findWWing = (grid, givens, legal, elim) => {
    const sees = (a, b) => {
      for (const p of peersOf[a]) if (p === b) return true
      return false
    }

    const bivalueByMask = new Map()
    for (let i = 0; i < 81; i++) {
      if (givens[i]) continue
      if (grid[i] !== 0) continue
      const m = legal[i] || 0
      if (bitCount(m) !== 2) continue
      let arr = bivalueByMask.get(m)
      if (!arr) {
        arr = []
        bivalueByMask.set(m, arr)
      }
      arr.push(i)
    }
    if (!bivalueByMask.size) return null

    for (const [pairMask, cells] of bivalueByMask.entries()) {
      if (cells.length < 2) continue
      const bits = []
      let mm = pairMask
      while (mm) {
        const bit = mm & -mm
        mm ^= bit
        bits.push(bit)
      }
      if (bits.length !== 2) continue

      for (let aIdx = 0; aIdx < cells.length; aIdx++) {
        for (let bIdx = aIdx + 1; bIdx < cells.length; bIdx++) {
          const wingA = cells[aIdx]
          const wingB = cells[bIdx]

          for (const bridgeBit of bits) {
            const elimBit = pairMask ^ bridgeBit
            const bridgeDigit = digitFromSingleMask(bridgeBit)
            const elimDigit = digitFromSingleMask(elimBit)

            const strongLinks = []
            for (let r = 0; r < 9; r++) {
              const cs = []
              for (const i of rowCells[r]) {
                if (givens[i]) continue
                if (grid[i] !== 0) continue
                if (legal[i] & bridgeBit) cs.push(i)
              }
              if (cs.length === 2) strongLinks.push([cs[0], cs[1]])
            }
            for (let c = 0; c < 9; c++) {
              const cs = []
              for (const i of colCells[c]) {
                if (givens[i]) continue
                if (grid[i] !== 0) continue
                if (legal[i] & bridgeBit) cs.push(i)
              }
              if (cs.length === 2) strongLinks.push([cs[0], cs[1]])
            }
            for (let b = 0; b < 9; b++) {
              const cs = []
              for (const i of boxCells[b]) {
                if (givens[i]) continue
                if (grid[i] !== 0) continue
                if (legal[i] & bridgeBit) cs.push(i)
              }
              if (cs.length === 2) strongLinks.push([cs[0], cs[1]])
            }
            if (!strongLinks.length) continue

            for (const [p, q] of strongLinks) {
              const aSeesP = sees(wingA, p)
              const aSeesQ = sees(wingA, q)
              const bSeesP = sees(wingB, p)
              const bSeesQ = sees(wingB, q)
              if (!(aSeesP ^ aSeesQ)) continue
              if (!(bSeesP ^ bSeesQ)) continue

              let bridgeA = -1
              let bridgeB = -1
              if (aSeesP && bSeesQ && !aSeesQ && !bSeesP) {
                bridgeA = p
                bridgeB = q
              } else if (aSeesQ && bSeesP && !aSeesP && !bSeesQ) {
                bridgeA = q
                bridgeB = p
              } else {
                continue
              }

              const peerA = new Set(peersOf[wingA])
              const targets = []
              for (const t of peersOf[wingB]) {
                if (!peerA.has(t)) continue
                if (t === wingA || t === wingB) continue
                if (givens[t]) continue
                if (grid[t] !== 0) continue
                if (elim[t] & elimBit) targets.push(t)
              }
              if (!targets.length) continue

              return {
                type: "eliminate",
                tech: "wwing",
                digit: elimDigit,
                elimMask: elimBit,
                unitCells: [],
                sourceCells: [wingA, wingB, bridgeA, bridgeB],
                targetCells: targets,
                wingAIdx: wingA,
                wingBIdx: wingB,
                bridgeAIdx: bridgeA,
                bridgeBIdx: bridgeB,
                bridgeDigit,
              }
            }
          }
        }
      }
    }
    return null
  }

  const findEmptyRectangle = (grid, givens, legal, elim) => {
    const sees = (a, b) => {
      for (const p of peersOf[a]) if (p === b) return true
      return false
    }

    for (let d = 1; d <= 9; d++) {
      const bit = 1 << (d - 1)

      const strongPairs = []
      for (let r = 0; r < 9; r++) {
        const cs = []
        for (const i of rowCells[r]) {
          if (givens[i]) continue
          if (grid[i] !== 0) continue
          if (legal[i] & bit) cs.push(i)
        }
        if (cs.length === 2) strongPairs.push([cs[0], cs[1]])
      }
      for (let c = 0; c < 9; c++) {
        const cs = []
        for (const i of colCells[c]) {
          if (givens[i]) continue
          if (grid[i] !== 0) continue
          if (legal[i] & bit) cs.push(i)
        }
        if (cs.length === 2) strongPairs.push([cs[0], cs[1]])
      }
      if (!strongPairs.length) continue

      for (let b = 0; b < 9; b++) {
        const br = ((b / 3) | 0) * 3
        const bc = (b % 3) * 3

        for (let rr = 0; rr < 3; rr++) {
          for (let cc = 0; cc < 3; cc++) {
            const rowArm = []
            const colArm = []
            const rectCells = []
            for (let r2 = 0; r2 < 3; r2++) {
              for (let c2 = 0; c2 < 3; c2++) {
                const idx = (br + r2) * 9 + (bc + c2)
                if (r2 === rr && c2 !== cc) rowArm.push(idx)
                else if (c2 === cc && r2 !== rr) colArm.push(idx)
                else if (r2 !== rr && c2 !== cc) rectCells.push(idx)
              }
            }
            let ok = true
            for (const x of rectCells) {
              if (givens[x]) continue
              if (grid[x] !== 0) continue
              if (legal[x] & bit) {
                ok = false
                break
              }
            }
            if (!ok) continue

            const bladeRow = rowArm.filter((i) => !givens[i] && grid[i] === 0 && (legal[i] & bit))
            const bladeCol = colArm.filter((i) => !givens[i] && grid[i] === 0 && (legal[i] & bit))
            if (!bladeRow.length || !bladeCol.length) continue

            const candCells = []
            for (const i of boxCells[b]) {
              if (givens[i]) continue
              if (grid[i] !== 0) continue
              if (!(legal[i] & bit)) continue
              const r3 = ((i / 9) | 0) - br
              const c3 = (i % 9) - bc
              if (r3 === rr || c3 === cc) candCells.push(i)
            }

            for (const [s0, e0] of strongPairs) {
              const tryOrient = (s, e) => {
                const supportA = bladeRow.find((i) => sees(s, i)) ?? -1
                const supportB = bladeCol.find((i) => sees(e, i)) ?? -1
                if (supportA < 0 || supportB < 0) return null

                const se = new Set(peersOf[e])
                const ss = new Set(peersOf[supportA])
                const boxSet = new Set(boxCells[b])
                const targets = []
                for (const t of peersOf[s]) {
                  if (!se.has(t)) continue
                  if (!ss.has(t)) continue
                  if (t === s || t === e || t === supportA || t === supportB) continue
                  if (boxSet.has(t)) continue
                  if (givens[t]) continue
                  if (grid[t] !== 0) continue
                  if (elim[t] & bit) targets.push(t)
                }
                if (!targets.length) return null
                return {
                  type: "eliminate",
                  tech: "empty_rectangle",
                  digit: d,
                  elimMask: bit,
                  unitCells: boxCells[b],
                  sourceCells: [s, e, supportA, supportB, ...candCells],
                  targetCells: targets,
                  strongAIdx: s,
                  strongBIdx: e,
                  supportAIdx: supportA,
                  supportBIdx: supportB,
                  boxIndex: b,
                  candCells,
                }
              }

              const h1 = tryOrient(s0, e0)
              if (h1) return h1
              const h2 = tryOrient(e0, s0)
              if (h2) return h2
            }
          }
        }
      }
    }
    return null
  }

  const findUniqueRectangleType1 = (grid, givens, legal) => {
    for (let r1 = 0; r1 < 8; r1++) {
      for (let r2 = r1 + 1; r2 < 9; r2++) {
        for (let c1 = 0; c1 < 8; c1++) {
          for (let c2 = c1 + 1; c2 < 9; c2++) {
            const a = r1 * 9 + c1
            const b = r1 * 9 + c2
            const c = r2 * 9 + c1
            const d = r2 * 9 + c2
            if (givens[a] || givens[b] || givens[c] || givens[d]) continue
            if (grid[a] !== 0 || grid[b] !== 0 || grid[c] !== 0 || grid[d] !== 0) continue
            const boxes = new Set([boxOf(a), boxOf(b), boxOf(c), boxOf(d)])
            if (boxes.size !== 2) continue

            const ma = legal[a] || 0
            const mb = legal[b] || 0
            const mc = legal[c] || 0
            const md = legal[d] || 0
            if (!ma || !mb || !mc || !md) continue

            const cells = [
              { idx: a, m: ma },
              { idx: b, m: mb },
              { idx: c, m: mc },
              { idx: d, m: md },
            ]
            const pairCells = cells.filter((x) => bitCount(x.m) === 2)
            if (pairCells.length !== 3) continue
            const tri = cells.find((x) => bitCount(x.m) === 3)
            if (!tri) continue
            const pairMask = pairCells[0].m
            if (pairCells[1].m !== pairMask || pairCells[2].m !== pairMask) continue
            if ((tri.m & pairMask) !== pairMask) continue
            const extra = tri.m & ~pairMask
            if (bitCount(extra) !== 1) continue
            const digit = digitFromSingleMask(extra)

            return {
              type: "fill",
              tech: "unique_rectangle_1",
              idx: tri.idx,
              digit,
              sourceCells: [a, b, c, d],
              rows: [r1, r2],
              cols: [c1, c2],
              pairMask,
            }
          }
        }
      }
    }
    return null
  }

  const findXWing = (grid, givens, legal, effective) => {
    for (let d = 1; d <= 9; d++) {
      const bit = 1 << (d - 1)
      const rowPairs = new Map()
      for (let r = 0; r < 9; r++) {
        const cols = []
        for (let c = 0; c < 9; c++) {
          const i = r * 9 + c
          if (givens[i]) continue
          if (grid[i] !== 0) continue
          if (legal[i] & bit) cols.push(c)
        }
        if (cols.length !== 2) continue
        const key = cols[0] + "," + cols[1]
        const arr = rowPairs.get(key) || []
        arr.push(r)
        rowPairs.set(key, arr)
      }
      for (const [key, rows] of rowPairs.entries()) {
        if (rows.length < 2) continue
        const [c1, c2] = key.split(",").map((x) => Number(x))
        const r1 = rows[0]
        const r2 = rows[1]
        const vertices = [r1 * 9 + c1, r1 * 9 + c2, r2 * 9 + c2, r2 * 9 + c1]
        const targets = []
        for (let r = 0; r < 9; r++) {
          if (r === r1 || r === r2) continue
          const i1 = r * 9 + c1
          const i2 = r * 9 + c2
          if (!givens[i1] && grid[i1] === 0 && (effective[i1] & bit)) targets.push(i1)
          if (!givens[i2] && grid[i2] === 0 && (effective[i2] & bit)) targets.push(i2)
        }
        if (!targets.length) continue
        const unitCells = unionUnique(unionUnique(rowCells[r1], rowCells[r2]), unionUnique(colCells[c1], colCells[c2]))
        return {
          type: "eliminate",
          tech: "xwing_row",
          digit: d,
          elimMask: bit,
          unitCells,
          sourceCells: vertices,
          targetCells: targets,
          vertices,
        }
      }

      const colPairs = new Map()
      for (let c = 0; c < 9; c++) {
        const rows = []
        for (let r = 0; r < 9; r++) {
          const i = r * 9 + c
          if (givens[i]) continue
          if (grid[i] !== 0) continue
          if (legal[i] & bit) rows.push(r)
        }
        if (rows.length !== 2) continue
        const key = rows[0] + "," + rows[1]
        const arr = colPairs.get(key) || []
        arr.push(c)
        colPairs.set(key, arr)
      }
      for (const [key, cols] of colPairs.entries()) {
        if (cols.length < 2) continue
        const [r1, r2] = key.split(",").map((x) => Number(x))
        const c1 = cols[0]
        const c2 = cols[1]
        const vertices = [r1 * 9 + c1, r1 * 9 + c2, r2 * 9 + c2, r2 * 9 + c1]
        const targets = []
        for (let c = 0; c < 9; c++) {
          if (c === c1 || c === c2) continue
          const i1 = r1 * 9 + c
          const i2 = r2 * 9 + c
          if (!givens[i1] && grid[i1] === 0 && (effective[i1] & bit)) targets.push(i1)
          if (!givens[i2] && grid[i2] === 0 && (effective[i2] & bit)) targets.push(i2)
        }
        if (!targets.length) continue
        const unitCells = unionUnique(unionUnique(colCells[c1], colCells[c2]), unionUnique(rowCells[r1], rowCells[r2]))
        return {
          type: "eliminate",
          tech: "xwing_col",
          digit: d,
          elimMask: bit,
          unitCells,
          sourceCells: vertices,
          targetCells: targets,
          vertices,
        }
      }
    }
    return null
  }

  const findSwordfish = (grid, givens, legal, effective) => {
    for (let d = 1; d <= 9; d++) {
      const bit = 1 << (d - 1)
      const rowCols = []
      for (let r = 0; r < 9; r++) {
        const cols = []
        for (let c = 0; c < 9; c++) {
          const i = r * 9 + c
          if (givens[i]) continue
          if (grid[i] !== 0) continue
          if (legal[i] & bit) cols.push(c)
        }
        if (cols.length >= 2 && cols.length <= 3) rowCols.push({ r, cols })
      }
      for (let a = 0; a < rowCols.length; a++) {
        for (let b = a + 1; b < rowCols.length; b++) {
          for (let c = b + 1; c < rowCols.length; c++) {
            const set = new Set([...rowCols[a].cols, ...rowCols[b].cols, ...rowCols[c].cols])
            if (set.size !== 3) continue
            const cols = Array.from(set)
            const rows = [rowCols[a].r, rowCols[b].r, rowCols[c].r]
            const targets = []
            for (const cc of cols) {
              for (let rr = 0; rr < 9; rr++) {
                if (rr === rows[0] || rr === rows[1] || rr === rows[2]) continue
                const i = rr * 9 + cc
                if (!givens[i] && grid[i] === 0 && (effective[i] & bit)) targets.push(i)
              }
            }
            if (!targets.length) continue
            const unitCells = unionUnique(unionUnique(rowCells[rows[0]], rowCells[rows[1]]), rowCells[rows[2]])
            const unitCells2 = unionUnique(unionUnique(colCells[cols[0]], colCells[cols[1]]), colCells[cols[2]])
            const sourceCells = []
            for (const rr of rows) {
              for (const cc of cols) {
                const i = rr * 9 + cc
                if (!givens[i] && grid[i] === 0 && (legal[i] & bit)) sourceCells.push(i)
              }
            }
            return {
              type: "eliminate",
              tech: "swordfish_row",
              digit: d,
              elimMask: bit,
              unitCells: unionUnique(unitCells, unitCells2),
              sourceCells,
              targetCells: targets,
              rows,
              cols,
            }
          }
        }
      }

      const colRows = []
      for (let c = 0; c < 9; c++) {
        const rows = []
        for (let r = 0; r < 9; r++) {
          const i = r * 9 + c
          if (givens[i]) continue
          if (grid[i] !== 0) continue
          if (legal[i] & bit) rows.push(r)
        }
        if (rows.length >= 2 && rows.length <= 3) colRows.push({ c, rows })
      }
      for (let a = 0; a < colRows.length; a++) {
        for (let b = a + 1; b < colRows.length; b++) {
          for (let c = b + 1; c < colRows.length; c++) {
            const set = new Set([...colRows[a].rows, ...colRows[b].rows, ...colRows[c].rows])
            if (set.size !== 3) continue
            const rows = Array.from(set)
            const cols = [colRows[a].c, colRows[b].c, colRows[c].c]
            const targets = []
            for (const rr of rows) {
              for (let cc = 0; cc < 9; cc++) {
                if (cc === cols[0] || cc === cols[1] || cc === cols[2]) continue
                const i = rr * 9 + cc
                if (!givens[i] && grid[i] === 0 && (effective[i] & bit)) targets.push(i)
              }
            }
            if (!targets.length) continue
            const unitCells = unionUnique(unionUnique(colCells[cols[0]], colCells[cols[1]]), colCells[cols[2]])
            const unitCells2 = unionUnique(unionUnique(rowCells[rows[0]], rowCells[rows[1]]), rowCells[rows[2]])
            const sourceCells = []
            for (const cc of cols) {
              for (const rr of rows) {
                const i = rr * 9 + cc
                if (!givens[i] && grid[i] === 0 && (legal[i] & bit)) sourceCells.push(i)
              }
            }
            return {
              type: "eliminate",
              tech: "swordfish_col",
              digit: d,
              elimMask: bit,
              unitCells: unionUnique(unitCells, unitCells2),
              sourceCells,
              targetCells: targets,
              rows,
              cols,
            }
          }
        }
      }
    }
    return null
  }

  const findJellyfish = (grid, givens, legal, effective) => {
    for (let d = 1; d <= 9; d++) {
      const bit = 1 << (d - 1)

      const rowCols = []
      for (let r = 0; r < 9; r++) {
        const cols = []
        for (let c = 0; c < 9; c++) {
          const i = r * 9 + c
          if (givens[i]) continue
          if (grid[i] !== 0) continue
          if (legal[i] & bit) cols.push(c)
        }
        if (cols.length >= 2 && cols.length <= 4) rowCols.push({ r, cols })
      }
      for (let a = 0; a < rowCols.length; a++) {
        for (let b = a + 1; b < rowCols.length; b++) {
          for (let c = b + 1; c < rowCols.length; c++) {
            for (let e = c + 1; e < rowCols.length; e++) {
              const set = new Set([
                ...rowCols[a].cols,
                ...rowCols[b].cols,
                ...rowCols[c].cols,
                ...rowCols[e].cols,
              ])
              if (set.size !== 4) continue
              const cols = Array.from(set)
              const rows = [rowCols[a].r, rowCols[b].r, rowCols[c].r, rowCols[e].r]
              const targets = []
              for (const cc of cols) {
                for (let rr = 0; rr < 9; rr++) {
                  if (rr === rows[0] || rr === rows[1] || rr === rows[2] || rr === rows[3]) continue
                  const i = rr * 9 + cc
                  if (!givens[i] && grid[i] === 0 && (effective[i] & bit)) targets.push(i)
                }
              }
              if (!targets.length) continue
              const unitCells = unionUnique(unionUnique(rowCells[rows[0]], rowCells[rows[1]]), unionUnique(rowCells[rows[2]], rowCells[rows[3]]))
              const unitCells2 = unionUnique(unionUnique(colCells[cols[0]], colCells[cols[1]]), unionUnique(colCells[cols[2]], colCells[cols[3]]))
              const sourceCells = []
              for (const rr of rows) {
                for (const cc of cols) {
                  const i = rr * 9 + cc
                  if (!givens[i] && grid[i] === 0 && (legal[i] & bit)) sourceCells.push(i)
                }
              }
              return {
                type: "eliminate",
                tech: "jellyfish_row",
                digit: d,
                elimMask: bit,
                unitCells: unionUnique(unitCells, unitCells2),
                sourceCells,
                targetCells: targets,
                rows,
                cols,
              }
            }
          }
        }
      }

      const colRows = []
      for (let c = 0; c < 9; c++) {
        const rows = []
        for (let r = 0; r < 9; r++) {
          const i = r * 9 + c
          if (givens[i]) continue
          if (grid[i] !== 0) continue
          if (legal[i] & bit) rows.push(r)
        }
        if (rows.length >= 2 && rows.length <= 4) colRows.push({ c, rows })
      }
      for (let a = 0; a < colRows.length; a++) {
        for (let b = a + 1; b < colRows.length; b++) {
          for (let c = b + 1; c < colRows.length; c++) {
            for (let e = c + 1; e < colRows.length; e++) {
              const set = new Set([
                ...colRows[a].rows,
                ...colRows[b].rows,
                ...colRows[c].rows,
                ...colRows[e].rows,
              ])
              if (set.size !== 4) continue
              const rows = Array.from(set)
              const cols = [colRows[a].c, colRows[b].c, colRows[c].c, colRows[e].c]
              const targets = []
              for (const rr of rows) {
                for (let cc = 0; cc < 9; cc++) {
                  if (cc === cols[0] || cc === cols[1] || cc === cols[2] || cc === cols[3]) continue
                  const i = rr * 9 + cc
                  if (!givens[i] && grid[i] === 0 && (effective[i] & bit)) targets.push(i)
                }
              }
              if (!targets.length) continue
              const unitCells = unionUnique(unionUnique(colCells[cols[0]], colCells[cols[1]]), unionUnique(colCells[cols[2]], colCells[cols[3]]))
              const unitCells2 = unionUnique(unionUnique(rowCells[rows[0]], rowCells[rows[1]]), unionUnique(rowCells[rows[2]], rowCells[rows[3]]))
              const sourceCells = []
              for (const cc of cols) {
                for (const rr of rows) {
                  const i = rr * 9 + cc
                  if (!givens[i] && grid[i] === 0 && (legal[i] & bit)) sourceCells.push(i)
                }
              }
              return {
                type: "eliminate",
                tech: "jellyfish_col",
                digit: d,
                elimMask: bit,
                unitCells: unionUnique(unitCells, unitCells2),
                sourceCells,
                targetCells: targets,
                rows,
                cols,
              }
            }
          }
        }
      }
    }
    return null
  }

  const propagateSingles = (grid, givens) => {
    let changed = true
    let guard = 0
    while (changed && guard++ < 200) {
      changed = false
      for (let i = 0; i < 81; i++) {
        if (givens[i]) continue
        if (grid[i] !== 0) continue
        const m = computeCandidateMask(grid, i)
        if (!m) return false
        if (bitCount(m) === 1) {
          grid[i] = digitFromSingleMask(m)
          changed = true
        }
      }
      for (let r = 0; r < 9; r++) {
        const unit = rowCells[r]
        for (let d = 1; d <= 9; d++) {
          let count = 0
          let pos = -1
          const bit = 1 << (d - 1)
          for (const i of unit) {
            if (givens[i]) continue
            if (grid[i] !== 0) continue
            const m = computeCandidateMask(grid, i)
            if (!m) return false
            if (m & bit) {
              count++
              pos = i
              if (count > 1) break
            }
          }
          if (count === 1 && pos >= 0) {
            grid[pos] = d
            changed = true
          }
        }
      }
      for (let c = 0; c < 9; c++) {
        const unit = colCells[c]
        for (let d = 1; d <= 9; d++) {
          let count = 0
          let pos = -1
          const bit = 1 << (d - 1)
          for (const i of unit) {
            if (givens[i]) continue
            if (grid[i] !== 0) continue
            const m = computeCandidateMask(grid, i)
            if (!m) return false
            if (m & bit) {
              count++
              pos = i
              if (count > 1) break
            }
          }
          if (count === 1 && pos >= 0) {
            grid[pos] = d
            changed = true
          }
        }
      }
      for (let b = 0; b < 9; b++) {
        const unit = boxCells[b]
        for (let d = 1; d <= 9; d++) {
          let count = 0
          let pos = -1
          const bit = 1 << (d - 1)
          for (const i of unit) {
            if (givens[i]) continue
            if (grid[i] !== 0) continue
            const m = computeCandidateMask(grid, i)
            if (!m) return false
            if (m & bit) {
              count++
              pos = i
              if (count > 1) break
            }
          }
          if (count === 1 && pos >= 0) {
            grid[pos] = d
            changed = true
          }
        }
      }
    }
    return true
  }

  const propagateSinglesTrace = (grid, givens, timeline, limit = 60) => {
    let guard = 0
    const push = (evt) => {
      if (timeline.length >= limit) return
      timeline.push(evt)
    }
    const checkGlobalConflict = (g) => {
      const scanUnitDup = (unit, unitType, unitIndex) => {
        const seen = new Uint8Array(10)
        for (const i of unit) {
          const v = g[i] || 0
          if (v < 1 || v > 9) continue
          if (seen[v]) return { type: "unit_conflict", unitType, unitIndex, digit: v, idx: i }
          seen[v] = 1
        }
        return null
      }
      for (let r = 0; r < 9; r++) {
        const cf = scanUnitDup(rowCells[r], "row", r)
        if (cf) return cf
      }
      for (let c = 0; c < 9; c++) {
        const cf = scanUnitDup(colCells[c], "col", c)
        if (cf) return cf
      }
      for (let b = 0; b < 9; b++) {
        const cf = scanUnitDup(boxCells[b], "box", b)
        if (cf) return cf
      }
      for (let i = 0; i < 81; i++) {
        if (givens[i]) continue
        if (g[i] !== 0) continue
        const m = computeCandidateMask(g, i)
        if (!m) return { type: "cell", idx: i }
      }
      const scanUnitEmpty = (unit, unitType, unitIndex) => {
        const present = new Uint8Array(10)
        for (const i of unit) {
          const v = g[i] || 0
          if (v >= 1 && v <= 9) present[v] = 1
        }
        for (let d = 1; d <= 9; d++) {
          if (present[d]) continue
          const bit = 1 << (d - 1)
          let ok = false
          for (const i of unit) {
            if (givens[i]) continue
            if (g[i] !== 0) continue
            const m = computeCandidateMask(g, i)
            if (!m) return { type: "cell", idx: i }
            if (m & bit) {
              ok = true
              break
            }
          }
          if (!ok) return { type: "unit_empty", unitType, unitIndex, digit: d }
        }
        return null
      }
      for (let r = 0; r < 9; r++) {
        const cf = scanUnitEmpty(rowCells[r], "row", r)
        if (cf) return cf
      }
      for (let c = 0; c < 9; c++) {
        const cf = scanUnitEmpty(colCells[c], "col", c)
        if (cf) return cf
      }
      for (let b = 0; b < 9; b++) {
        const cf = scanUnitEmpty(boxCells[b], "box", b)
        if (cf) return cf
      }
      return null
    }

    const listSingles = () => {
      const out = []
      for (let i = 0; i < 81; i++) {
        if (givens[i]) continue
        if (grid[i] !== 0) continue
        const m = computeCandidateMask(grid, i)
        if (!m) return { singles: out, conflict: { type: "cell", idx: i } }
        if (bitCount(m) === 1) out.push({ idx: i, digit: digitFromSingleMask(m), rule: "naked_single" })
      }
      const scanUnitHidden = (unit, unitType, unitIndex) => {
        const present = new Uint8Array(10)
        for (const i of unit) {
          const v = grid[i] || 0
          if (v >= 1 && v <= 9) present[v] = 1
        }
        for (let d = 1; d <= 9; d++) {
          if (present[d]) continue
          const bit = 1 << (d - 1)
          let count = 0
          let pos = -1
          for (const i of unit) {
            if (givens[i]) continue
            if (grid[i] !== 0) continue
            const m = computeCandidateMask(grid, i)
            if (!m) return { conflict: { type: "cell", idx: i } }
            if (m & bit) {
              count++
              pos = i
              if (count > 1) break
            }
          }
          if (count === 1 && pos >= 0) out.push({ idx: pos, digit: d, rule: "hidden_single", unitType, unitIndex })
        }
        return null
      }
      for (let r = 0; r < 9; r++) {
        const cf = scanUnitHidden(rowCells[r], "row", r)
        if (cf) return { singles: out, conflict: cf.conflict }
      }
      for (let c = 0; c < 9; c++) {
        const cf = scanUnitHidden(colCells[c], "col", c)
        if (cf) return { singles: out, conflict: cf.conflict }
      }
      for (let b = 0; b < 9; b++) {
        const cf = scanUnitHidden(boxCells[b], "box", b)
        if (cf) return { singles: out, conflict: cf.conflict }
      }
      return { singles: out, conflict: null }
    }

    while (guard++ < 200) {
      const cf0 = checkGlobalConflict(grid)
      if (cf0) return { ok: false, conflict: cf0 }
      const { singles, conflict } = listSingles()
      if (conflict) return { ok: false, conflict }
      if (!singles.length) return { ok: true }

      let best = null
      let bestScore = -Infinity
      for (let sIdx = 0; sIdx < singles.length; sIdx++) {
        const cand = singles[sIdx]
        let impact = 0
        const bit = 1 << (cand.digit - 1)
        const pCells = peersOf[cand.idx]
        for (let pIdx = 0; pIdx < pCells.length; pIdx++) {
          const p = pCells[pIdx]
          if (givens[p]) continue
          if (grid[p] !== 0) continue
          const m = computeCandidateMask(grid, p)
          if (m & bit) impact++
        }
        const score = impact + (cand.rule === "hidden_single" ? 0.2 : 0)
        if (score > bestScore) {
          best = cand
          bestScore = score
        }
      }
      if (!best) return { ok: true }

      grid[best.idx] = best.digit
      if (best.rule === "naked_single") {
        push({ kind: "fill", idx: best.idx, digit: best.digit, rule: "naked_single", text: `${formatCell(best.idx)} 只剩一个候选 → 填入 ${best.digit}（余数法）` })
      } else {
        push({
          kind: "fill",
          idx: best.idx,
          digit: best.digit,
          rule: "hidden_single",
          unitType: best.unitType,
          unitIndex: best.unitIndex,
          text: `${unitLabelShort(best.unitType, best.unitIndex)} 的数字 ${best.digit} 只剩一个位置 → ${formatCell(best.idx)} 填入 ${best.digit}（摒除法）`,
        })
      }
      const cf1 = checkGlobalConflict(grid)
      if (cf1) return { ok: false, conflict: cf1 }
      if (timeline.length >= limit) return { ok: true }
    }
    return { ok: true }
  }

  const findForcingCell = (grid, givens, legal, notes) => {
    let tries = 0
    for (let i = 0; i < 81; i++) {
      if (givens[i]) continue
      if (grid[i] !== 0) continue
      const lm = legal[i] || 0
      const nm = (notes && notes[i]) || 0
      const m = nm ? lm & nm : lm
      const bc = bitCount(m)
      if (bc < 2 || bc > 3) continue
      let eliminated = 0
      const branches = []
      let mm = m
      while (mm) {
        const bit = mm & -mm
        mm ^= bit
        const d = (Math.log2(bit) | 0) + 1
        const g2 = grid.slice ? grid.slice() : Array.from(grid)
        g2[i] = d
        const tl = []
        tl.push({ kind: "assume", idx: i, digit: d, text: `假设 ${formatCell(i)} 填入 ${d}` })
        const res = propagateSinglesTrace(g2, givens, tl, 60)
        const ok = !!res.ok
        if (!ok) {
          eliminated |= bit
          const cf = res.conflict || {}
          if (cf.type === "cell") {
            tl.push({ kind: "conflict", focusIdx: i, conflict: cf, text: `矛盾：${formatCell(cf.idx)} 无候选` })
          } else if (cf.type === "unit_empty") {
            tl.push({
              kind: "conflict",
              focusIdx: i,
              conflict: cf,
              text: `矛盾：${unitLabelShort(cf.unitType, cf.unitIndex)} 的数字 ${cf.digit} 无位置`,
              sub: `${unitLabelShort(cf.unitType, cf.unitIndex)} 已无法放置 ${cf.digit}`,
            })
          } else {
            tl.push({ kind: "conflict", focusIdx: i, conflict: cf, text: "矛盾：推演失败" })
          }
        } else {
          tl.push({ kind: "info", focusIdx: i, text: "推演停止：未发现矛盾" })
        }
        branches.push({ digit: d, ok, timeline: tl })
        if (++tries > 48) break
      }
      if (!eliminated) continue
      const remain = m & ~eliminated
      if (bitCount(remain) !== 1) continue
      let defBranch = 0
      for (let k = 0; k < branches.length; k++) {
        const br = branches[k]
        if (!br.ok) {
          defBranch = k
          break
        }
      }
      return {
        type: "fill",
        tech: "forcing_cell",
        idx: i,
        digit: digitFromSingleMask(remain),
        eliminatedMask: eliminated,
        traceBranches: branches,
        traceDefaultBranch: defBranch,
      }
    }
    return null
  }

  const hasAnyNotes = (notes) => {
    if (!notes) return false
    for (let i = 0; i < 81; i++) {
      if (notes[i]) return true
    }
    return false
  }

  const countNoteCoverage = (grid, givens, notes) => {
    let empty = 0
    let noted = 0
    if (!notes) return { empty: 0, noted: 0 }
    for (let i = 0; i < 81; i++) {
      if (givens[i]) continue
      if (grid[i] !== 0) continue
      empty++
      if (notes[i]) noted++
    }
    return { empty, noted }
  }

  const fillMissingNotes = (grid, givens, legal, notes) => {
    if (!notes) return 0
    let changed = 0
    for (let i = 0; i < 81; i++) {
      if (givens[i]) continue
      if (grid[i] !== 0) continue
      if (notes[i]) continue
      const m = legal[i] || 0
      if (!m) continue
      notes[i] = m
      changed++
    }
    return changed
  }

  const findNoteSingle = (grid, givens, legal, notes) => {
    if (!notes) return null
    for (let i = 0; i < 81; i++) {
      if (givens[i]) continue
      if (grid[i] !== 0) continue
      const n = notes[i] || 0
      if (!n) continue
      const l = legal[i] || 0
      if (!l) continue
      const m = n & l
      if (!m) continue
      if (bitCount(m) !== 1) continue
      if (bitCount(l) === 1) continue
      return { type: "fill", tech: "note_single", idx: i, digit: digitFromSingleMask(m) }
    }
    return null
  }

  const findNoteHiddenSingle = (grid, givens, legal, notes) => {
    if (!notes) return null
    const tryUnit = (unit, unitType, unitIndex) => {
      for (let d = 1; d <= 9; d++) {
        const bit = 1 << (d - 1)
        let pos = -1
        let count = 0
        for (const i of unit) {
          if (givens[i]) continue
          if (grid[i] !== 0) continue
          const l = legal[i] || 0
          if (!l) continue
          if (!(l & bit)) continue
          const n = notes[i] || 0
          if (!n) continue
          if (!(n & bit)) continue
          pos = i
          count++
          if (count > 1) break
        }
        if (count === 1 && pos >= 0) return { type: "fill", tech: "note_hidden_single", idx: pos, digit: d, unitType, unitIndex }
      }
      return null
    }
    for (let b = 0; b < 9; b++) {
      const h = tryUnit(boxCells[b], "box", b)
      if (h) return h
    }
    for (let c = 0; c < 9; c++) {
      const h = tryUnit(colCells[c], "col", c)
      if (h) return h
    }
    for (let r = 0; r < 9; r++) {
      const h = tryUnit(rowCells[r], "row", r)
      if (h) return h
    }
    return null
  }

  const techNameForPrompt = (tech) => {
    if (!tech) return "高级提示"
    if (tech === "locked_pointing_row" || tech === "locked_pointing_col") return "区块摒除（宫内指向）"
    if (tech === "locked_claiming_row" || tech === "locked_claiming_col") return "区块摒除（行列指向）"
    if (tech === "naked_pairs") return "显性数对"
    if (tech === "hidden_pairs") return "隐性数对"
    if (tech === "naked_triplet") return "显性三数组"
    if (tech === "hidden_triplet") return "隐性三数组"
    if (tech === "naked_quad") return "显性四数组"
    if (tech === "hidden_quad") return "隐性四数组"
    if (tech === "two_string_kite") return "双强链（Two-String Kite）"
    if (tech === "skyscraper_row" || tech === "skyscraper_col") return "摩天楼（Skyscraper）"
    if (tech === "xwing_row" || tech === "xwing_col") return "X-Wing"
    if (tech === "xywing") return "XY-Wing"
    if (tech === "xyzwing") return "XYZ-Wing"
    if (tech === "wwing") return "W-Wing"
    if (tech === "empty_rectangle") return "空矩形（Empty Rectangle）"
    if (tech === "turbot_fish") return "涡轮鱼（Turbot Fish）"
    if (tech === "three_strong_links") return "3 强链鱼（3 Strong-linked Fishes）"
    if (tech === "four_strong_links") return "4 强链鱼（4 Strong-Linked Fishes）"
    if (tech === "five_strong_links") return "5 强链鱼（5 Strong-Linked Fishes）"
    if (tech === "six_strong_links") return "6 强链鱼（6 Strong-Linked Fishes）"
    if (tech === "seven_strong_links") return "7 强链鱼（7 Strong-Linked Fishes）"
    if (tech === "eight_strong_links") return "8 强链鱼（8 Strong-Linked Fishes）"
    if (tech === "bug") return "BUG（Bivalue Universal Grave）"
    if (tech === "ape") return "APE（Aligned Pair Exclusion）"
    if (tech === "ate") return "ATE（Aligned Triplet Exclusion）"
    if (tech === "wxyzwing") return "WXYZ-Wing"
    if (tech === "vwxyzwing") return "VWXYZ-Wing"
    if (tech === "nishio") return "强制推理（反证）"
    if (tech === "swordfish_row" || tech === "swordfish_col") return "剑鱼（Swordfish）"
    if (tech === "jellyfish_row" || tech === "jellyfish_col") return "水母（Jellyfish）"
    if (tech === "xchain") return "X-Chain（单数字 AIC）"
    if (tech === "xcycle") return "X-Cycle（Nice Loop）"
    if (tech === "xycycle") return "XY-Cycle（Nice Loop）"
    return "高级提示"
  }

  const findNeedNotesHint = (grid, givens, legal, allowAutoNotes) => {
    const elim = legal
    const h3 = findLockedCandidates(grid, givens, legal, elim)
    if (h3) return { type: "action", tech: "need_notes", action: allowAutoNotes ? "auto_notes" : "note_mode", nextTech: h3.tech }
    const h4 = findNakedPairs(grid, givens, legal, elim)
    if (h4) return { type: "action", tech: "need_notes", action: allowAutoNotes ? "auto_notes" : "note_mode", nextTech: h4.tech }
    const h5 = findHiddenPairs(grid, givens, legal, elim)
    if (h5) return { type: "action", tech: "need_notes", action: allowAutoNotes ? "auto_notes" : "note_mode", nextTech: h5.tech }
    const h6 = findNakedSets(grid, givens, legal, elim, 3)
    if (h6) return { type: "action", tech: "need_notes", action: allowAutoNotes ? "auto_notes" : "note_mode", nextTech: h6.tech }
    const h7 = findHiddenSets(grid, givens, legal, elim, 3)
    if (h7) return { type: "action", tech: "need_notes", action: allowAutoNotes ? "auto_notes" : "note_mode", nextTech: h7.tech }
    const h8 = findNakedSets(grid, givens, legal, elim, 4)
    if (h8) return { type: "action", tech: "need_notes", action: allowAutoNotes ? "auto_notes" : "note_mode", nextTech: h8.tech }
    const h9 = findHiddenSets(grid, givens, legal, elim, 4)
    if (h9) return { type: "action", tech: "need_notes", action: allowAutoNotes ? "auto_notes" : "note_mode", nextTech: h9.tech }
    const h12 = findXWing(grid, givens, legal, elim)
    if (h12) return { type: "action", tech: "need_notes", action: allowAutoNotes ? "auto_notes" : "note_mode", nextTech: h12.tech }
    const h12b = findTurbotFish(grid, givens, legal, elim)
    if (h12b) return { type: "action", tech: "need_notes", action: allowAutoNotes ? "auto_notes" : "note_mode", nextTech: h12b.tech }
    const h13 = findXYWing(grid, givens, legal, elim)
    if (h13) return { type: "action", tech: "need_notes", action: allowAutoNotes ? "auto_notes" : "note_mode", nextTech: h13.tech }
    const h14 = findXYZWing(grid, givens, legal, elim)
    if (h14) return { type: "action", tech: "need_notes", action: allowAutoNotes ? "auto_notes" : "note_mode", nextTech: h14.tech }
    const h14b = findWWing(grid, givens, legal, elim)
    if (h14b) return { type: "action", tech: "need_notes", action: allowAutoNotes ? "auto_notes" : "note_mode", nextTech: h14b.tech }
    const h15 = findSwordfish(grid, givens, legal, elim)
    if (h15) return { type: "action", tech: "need_notes", action: allowAutoNotes ? "auto_notes" : "note_mode", nextTech: h15.tech }
    const h16 = findJellyfish(grid, givens, legal, elim)
    if (h16) return { type: "action", tech: "need_notes", action: allowAutoNotes ? "auto_notes" : "note_mode", nextTech: h16.tech }
    const h16b = findThreeStrongLinks(grid, givens, legal, elim)
    if (h16b) return { type: "action", tech: "need_notes", action: allowAutoNotes ? "auto_notes" : "note_mode", nextTech: h16b.tech }
    const h16c = findFourStrongLinks(grid, givens, legal, elim)
    if (h16c) return { type: "action", tech: "need_notes", action: allowAutoNotes ? "auto_notes" : "note_mode", nextTech: h16c.tech }
    const h16d = findFiveStrongLinks(grid, givens, legal, elim)
    if (h16d) return { type: "action", tech: "need_notes", action: allowAutoNotes ? "auto_notes" : "note_mode", nextTech: h16d.tech }
    const h16e = findSixStrongLinks(grid, givens, legal, elim)
    if (h16e) return { type: "action", tech: "need_notes", action: allowAutoNotes ? "auto_notes" : "note_mode", nextTech: h16e.tech }
    const h16f = findSevenStrongLinks(grid, givens, legal, elim)
    if (h16f) return { type: "action", tech: "need_notes", action: allowAutoNotes ? "auto_notes" : "note_mode", nextTech: h16f.tech }
    const h16g = findEightStrongLinks(grid, givens, legal, elim)
    if (h16g) return { type: "action", tech: "need_notes", action: allowAutoNotes ? "auto_notes" : "note_mode", nextTech: h16g.tech }
    const h16h = findAlignedPairExclusion(grid, givens, legal)
    if (h16h) return { type: "action", tech: "need_notes", action: allowAutoNotes ? "auto_notes" : "note_mode", nextTech: h16h.tech }
    const h16i = findWXYZWing(grid, givens, legal, elim)
    if (h16i) return { type: "action", tech: "need_notes", action: allowAutoNotes ? "auto_notes" : "note_mode", nextTech: h16i.tech }
    const h16j = findVWXYZWing(grid, givens, legal, elim)
    if (h16j) return { type: "action", tech: "need_notes", action: allowAutoNotes ? "auto_notes" : "note_mode", nextTech: h16j.tech }
    const h16k = findAlignedTripletExclusion(grid, givens, legal)
    if (h16k) return { type: "action", tech: "need_notes", action: allowAutoNotes ? "auto_notes" : "note_mode", nextTech: h16k.tech }
    const h16l = findNishioForcingChains(grid, givens, legal)
    if (h16l && h16l.type === "eliminate")
      return { type: "action", tech: "need_notes", action: allowAutoNotes ? "auto_notes" : "note_mode", nextTech: h16l.tech }
    const h17 = findXChain(grid, givens, legal, elim)
    if (h17) return { type: "action", tech: "need_notes", action: allowAutoNotes ? "auto_notes" : "note_mode", nextTech: h17.tech }
    const h18 = findXCycle(grid, givens, legal, elim)
    if (h18) return { type: "action", tech: "need_notes", action: allowAutoNotes ? "auto_notes" : "note_mode", nextTech: h18.tech }
    const h19 = findXYCycle(grid, givens, legal, elim)
    if (h19) return { type: "action", tech: "need_notes", action: allowAutoNotes ? "auto_notes" : "note_mode", nextTech: h19.tech }
    return null
  }

  const findNeedMoreNotesHint = (grid, givens, legal, allowAutoNotes) => {
    const h = findNeedNotesHint(grid, givens, legal, allowAutoNotes)
    if (!h) return null
    return { type: "action", tech: "need_more_notes", action: "fill_notes", nextTech: h.nextTech }
  }

  const findNotesConflictHint = (grid, givens, legal, notes) => {
    if (!notes) return null
    for (let i = 0; i < 81; i++) {
      if (givens[i]) continue
      if (grid[i] !== 0) continue
      const n = notes[i] || 0
      if (!n) continue
      const l = legal[i] || 0
      if (!l) continue
      const illegal = n & ~l
      if (!illegal) continue
      const bit = illegal & -illegal
      const d = (Math.log2(bit) | 0) + 1
      let conflictIdx = -1
      for (const p of peersOf[i]) {
        if (grid[p] === d) {
          conflictIdx = p
          break
        }
      }
      if (conflictIdx < 0) continue
      const ir = (i / 9) | 0
      const ic = i % 9
      const pr = (conflictIdx / 9) | 0
      const pc = conflictIdx % 9
      let unitType = "box"
      let unitIndex = ((ir / 3) | 0) * 3 + ((ic / 3) | 0)
      if (ir === pr) {
        unitType = "row"
        unitIndex = ir
      } else if (ic === pc) {
        unitType = "col"
        unitIndex = ic
      }
      return {
        type: "eliminate",
        tech: "note_conflict",
        idx: i,
        digit: d,
        conflictIdx,
        unitType,
        unitIndex,
        elimMask: bit,
        unitCells: unionUnique([i], [conflictIdx]),
        sourceCells: [conflictIdx],
        targetCells: [i],
      }
    }
    return null
  }

  const findHint = () => {
    if (!activeState || activeState.paused) return null
    const { grid, givens } = activeState
    const legal = buildLegalCandidateMasks(grid, givens)
    const allowAutoNotes = activeState.difficulty === "hard" || activeState.difficulty === "diabolical" || activeState.difficulty === "dev"
    if (!activeState.suppressNotesPrompt) {
      const hc = findNotesConflictHint(grid, givens, legal, activeState.notes)
      if (hc) return hc
    }
    const h0 = findFullHouse(grid, givens) || findHiddenSingle(grid, givens, legal) || findNakedSingle(grid, givens, legal)
    if (h0) return h0
    const shadow = activeState.shadowNotes || legal
    const cand = buildElimCandidateMasks(legal, shadow)
    const elim = buildElimCandidateMasks(cand, activeState.notes)
    const hasNotes = hasAnyNotes(activeState.notes)
    let shouldPromptNeedNotes = !hasNotes && !activeState.suppressNotesPrompt
    let shouldPromptNeedMoreNotes = false
    if (!activeState.suppressNotesPrompt) {
      const { empty, noted } = countNoteCoverage(grid, givens, activeState.notes)
      if (empty >= 12 && noted > 0 && noted / empty < 0.28) {
        shouldPromptNeedMoreNotes = true
      }
    }
    let bestNoNote = null
    let bestNoNoteScore = Infinity
    let bestNoNoteType = ""
    let bestNote = null
    let bestNoteScore = Infinity
    let bestNoteType = ""
    const isNoteTech = (h) => {
      const tech = h?.tech || ""
      if (tech === "note_single" || tech === "note_hidden_single") return false
      return tech.startsWith("note_")
    }
    const rules = [
      { min: 1.0, run: () => findFullHouse(grid, givens) },
      { min: 1.2, run: () => findHiddenSingle(grid, givens, legal) },
      { min: 1.2, run: () => (hasNotes ? findNoteHiddenSingle(grid, givens, legal, activeState.notes) : null) },
      { min: 1.5, run: () => (hasNotes ? findNoteSingle(grid, givens, legal, activeState.notes) : null) },
      { min: 2.3, run: () => findNakedSingle(grid, givens, legal) },
      { min: 2.6, run: () => findLockedCandidates(grid, givens, cand, elim) },
      { min: 3.0, run: () => findNakedPairs(grid, givens, cand, elim) },
      { min: 3.2, run: () => findXWing(grid, givens, cand, elim) },
      { min: 3.4, run: () => findHiddenPairs(grid, givens, cand, elim) },
      { min: 3.6, run: () => findNakedSets(grid, givens, cand, elim, 3) },
      { min: 3.8, run: () => findSwordfish(grid, givens, cand, elim) },
      { min: 4.0, run: () => findHiddenSets(grid, givens, cand, elim, 3) },
      { min: 4.0, run: () => findTurbotFish(grid, givens, cand, elim) },
      { min: 4.2, run: () => findXYWing(grid, givens, cand, elim) },
      { min: 4.4, run: () => findXYZWing(grid, givens, cand, elim) },
      { min: 4.4, run: () => findWWing(grid, givens, cand, elim) },
      { min: 4.5, run: () => findUniqueRectangleType1(grid, givens, cand) },
      { min: 5.0, run: () => findNakedSets(grid, givens, cand, elim, 4) },
      { min: 5.2, run: () => findJellyfish(grid, givens, cand, elim) },
      { min: 5.4, run: () => findHiddenSets(grid, givens, cand, elim, 4) },
      { min: 5.4, run: () => findThreeStrongLinks(grid, givens, cand, elim) },
      { min: 5.5, cost: "high", run: () => findWXYZWing(grid, givens, cand, elim) },
      { min: 5.6, run: () => findBUG(grid, givens, cand) },
      { min: 5.8, run: () => findFourStrongLinks(grid, givens, cand, elim) },
      { min: 6.2, run: () => findFiveStrongLinks(grid, givens, cand, elim) },
      { min: 6.2, cost: "high", run: () => findAlignedPairExclusion(grid, givens, cand, elim) },
      { min: 6.2, cost: "high", run: () => findVWXYZWing(grid, givens, cand, elim) },
      { min: 6.5, cost: "high", run: () => findXCycle(grid, givens, cand, elim) },
      { min: 6.6, cost: "high", run: () => findSixStrongLinks(grid, givens, cand, elim) },
      { min: 6.6, cost: "high", run: () => findXChain(grid, givens, cand, elim) },
      { min: 6.8, run: () => findForcingCell(grid, givens, cand, activeState.notes) },
      { min: 7.0, cost: "high", run: () => findSevenStrongLinks(grid, givens, cand, elim) },
      { min: 7.0, cost: "high", run: () => findXYCycle(grid, givens, cand, elim) },
      { min: 7.4, cost: "extreme", run: () => findEightStrongLinks(grid, givens, cand, elim) },
      { min: 7.5, cost: "extreme", run: () => findAlignedTripletExclusion(grid, givens, cand, elim) },
      { min: 7.5, run: () => findNishioForcingChains(grid, givens, cand) },
    ]

    const searchStartTime = performance.now()
    for (const r of rules) {
      if (bestNoNoteScore <= r.min || bestNoteScore <= r.min) break
      const elapsed = performance.now() - searchStartTime
      if (r.cost === "extreme" && elapsed > 150) continue
      if (r.cost === "high" && elapsed > 300) continue
      
      const h = r.run()
      if (!h) continue
      const s = hintDifficultyScore(h)
      const t = h.type || ""
      if (isNoteTech(h)) {
        if (s < bestNoteScore) {
          bestNote = h
          bestNoteScore = s
          bestNoteType = t
          continue
        }
        if (s === bestNoteScore) {
          if (bestNoteType !== "fill" && t === "fill") {
            bestNote = h
            bestNoteType = t
          }
        }
        continue
      }
      if (s < bestNoNoteScore) {
        bestNoNote = h
        bestNoNoteScore = s
        bestNoNoteType = t
        continue
      }
      if (s === bestNoNoteScore) {
        if (bestNoNoteType !== "fill" && t === "fill") {
          bestNoNote = h
          bestNoNoteType = t
        }
      }
    }
    const best = bestNoNote || bestNote
    const bestScore = best ? hintDifficultyScore(best) : Infinity
    if (best) {
      if (shouldPromptNeedNotes && bestScore >= 3.0) return findNeedNotesHint(grid, givens, legal, allowAutoNotes)
      if (shouldPromptNeedMoreNotes && bestScore >= 3.0) return findNeedMoreNotesHint(grid, givens, legal, allowAutoNotes)
      return best
    }
    if (shouldPromptNeedNotes) return findNeedNotesHint(grid, givens, legal, allowAutoNotes)
    if (shouldPromptNeedMoreNotes) return findNeedMoreNotesHint(grid, givens, legal, allowAutoNotes)
    return null
  }

  const clearHint = () => {
    hintState = null
    if (ui.traceDrawer && !ui.traceDrawer.classList.contains("hidden")) closeTraceDrawer()
    if (ui.hintPanel) ui.hintPanel.classList.add("hidden")
    if (ui.board) ui.board.classList.remove("hinting")
    if (cellEls && cellEls.length) {
      for (const el of cellEls) {
        el.classList.remove("hint-unit")
        el.classList.remove("hint-target")
        el.classList.remove("hint-source")
        el.classList.remove("hint-elim")
        el.classList.remove("hint-elim-wwing")
        el.classList.remove("hint-elim-er")
        el.classList.remove("hint-wing")
        el.classList.remove("hint-bridge")
        el.classList.remove("hint-chain-end")
        el.classList.remove("hint-chain-mid")
        el.classList.remove("hint-er-cand")
        el.classList.remove("hint-cycle-node")
        el.classList.remove("hint-cycle-true")
        el.classList.remove("hint-cycle-false")
        el.classList.remove("hint-xycycle")
        el.classList.remove("same")
      }
    }
    if (cellEls && cellEls.length) {
      for (const el of cellEls) {
        const ns = el.querySelectorAll(".notes span.elim")
        for (const s of ns) s.classList.remove("elim")
        const ts = el.querySelectorAll(".notes span.hint-temp")
        for (const s of ts) {
          s.classList.remove("hint-temp")
          s.classList.remove("hint-temp-a")
          s.classList.remove("hint-temp-b")
          s.classList.remove("hint-temp-c")
          s.classList.remove("hint-temp-n")
          const digit = parseInt(s.getAttribute("data-n"), 10)
          const cellIdx = parseInt(el.getAttribute("data-idx"), 10)
          const m = (activeState && activeState.notes) ? activeState.notes[cellIdx] || 0 : 0
          if (!(m & (1 << (digit - 1)))) {
            s.classList.remove("on")
            s.textContent = ""
          }
        }
      }
    }
    if (hintSvg) hintSvg.innerHTML = ""
  }

  const unitLabel = (unitType, unitIndex) => {
    if (unitType === "row") return `第 ${unitIndex + 1} 行`
    if (unitType === "col") return `第 ${unitIndex + 1} 列`
    return `第 ${unitIndex + 1} 宫`
  }

  const hintStepCount = (h) => {
    const t = (h && h.tech) || ""
    if (t === "wxyzwing" || t === "vwxyzwing") return 4
    return 2
  }

  const hintDifficultyScore = (h) => {
    if (!h) return 0
    const t = h.tech || ""
    if (t === "need_notes" || t === "need_more_notes" || t === "note_conflict") return 0
    if (t === "full_house") return 1.0
    if (t === "hidden_single") return h.unitType === "box" ? 1.2 : 1.5
    if (t === "direct_pointing") return 1.7
    if (t === "direct_claiming") return 1.9
    if (t === "direct_hidden_pair") return 2.0
    if (t === "naked_single") return 2.3
    if (t === "note_hidden_single") return h.unitType === "box" ? 1.2 : 1.5
    if (t === "note_single") return 1.5
    if (t === "direct_hidden_triplet") return 2.5
    if (t === "locked_pointing_row" || t === "locked_pointing_col") return 2.6
    if (t === "locked_claiming_row" || t === "locked_claiming_col") return 2.8
    if (t === "naked_pairs") return 3.0
    if (t === "xwing_row" || t === "xwing_col") return 3.2
    if (t === "hidden_pairs") return 3.4
    if (t === "naked_triplet") return 3.6
    if (t === "swordfish_row" || t === "swordfish_col") return 3.8
    if (t === "hidden_triplet") return 4.0
    if (t === "skyscraper_row" || t === "skyscraper_col") return 4.0
    if (t === "two_string_kite") return 4.1
    if (t === "empty_rectangle") return 4.2
    if (t === "xywing") return 4.2
    if (t === "xyzwing") return 4.4
    if (t === "wwing") return 4.4
    if (t === "turbot_fish") {
      const v = h.variant || ""
      if (v === "skyscraper") return 4.0
      if (v === "skyscraper_bivalue") return 4.0
      if (v === "two_string_kite") return 4.1
      if (v === "empty_rectangle") return 4.2
      return 4.2
    }
    if (t === "unique_rectangle_1") return 4.5
    if (t === "naked_quad") return 5.0
    if (t === "jellyfish_row" || t === "jellyfish_col") return 5.2
    if (t === "hidden_quad") return 5.4
    const strongLinksBump = () => {
      const v = h.variant || ""
      if (v === "mutant") return 0.3
      if (v === "mixed") return 0.1
      return 0.0
    }
    if (t === "three_strong_links") return 5.4 + strongLinksBump()
    if (t === "bug") return 5.6
    if (t === "four_strong_links") return 5.8 + strongLinksBump()
    if (t === "five_strong_links") return 6.2 + strongLinksBump()
    if (t === "ape") return 6.2
    if (t === "wxyzwing") {
      const bc = h.biggestCardinality || 3
      return 5.5 + (1 - Math.abs(3 - bc)) * 0.1
    }
    if (t === "vwxyzwing") {
      const bc = h.biggestCardinality || 3
      return 6.2 + (2 - Math.abs(3 - bc)) * 0.1
    }
    if (t === "ate") return 7.5
    if (t === "forcing_cell") {
      if (h.forcingKind === "nishio") {
        let added = 0.0
        let ceil = 4
        const complexity = h.complexity || 2
        let length = complexity - 2
        let isOdd = false
        while (length > ceil) {
          added += 0.1
          ceil = !isOdd ? ((ceil * 3) / 2) | 0 : ((ceil * 4) / 3) | 0
          isOdd = !isOdd
        }
        return 7.5 + added
      }
      return 6.8
    }
    if (t === "six_strong_links") return 6.6 + strongLinksBump()
    if (t === "seven_strong_links") return 7.0 + strongLinksBump()
    if (t === "eight_strong_links") return 7.4 + strongLinksBump()
    if (t === "xcycle") return 6.5
    if (t === "xchain") return 6.6
    if (t === "xycycle") return 7.0
    return 4.0
  }

  const hintDifficultyKey = (h) => {
    const s = hintDifficultyScore(h)
    if (s < 2.4) return "intro"
    if (s < 3.5) return "easy"
    if (s < 4.3) return "medium"
    if (s < 5.5) return "hard"
    return "extreme"
  }

  const hintDifficultyLabel = (key) => {
    if (key === "intro") return "简单"
    if (key === "easy") return "中等"
    if (key === "medium") return "高阶"
    if (key === "hard") return "困难"
    return "极限"
  }

  const hintTechLabel = (h) => {
    if (!h) return "提示"
    const t = h.tech || ""
    if (t === "need_notes") return "先记笔记"
    if (t === "need_more_notes") return "补全笔记"
    if (t === "note_conflict") return "笔记冲突"
    if (t === "full_house") return "单元格唯一法"
    if (t === "hidden_single") return "摒除法"
    if (t === "direct_pointing") return "直观锁定（宫内指向）"
    if (t === "direct_claiming") return "直观锁定（行列指向）"
    if (t === "direct_hidden_pair") return "直观隐藏对"
    if (t === "naked_single") return "余数法"
    if (t === "note_hidden_single") return "笔记摒除法"
    if (t === "note_single") return "笔记单数"
    if (t === "direct_hidden_triplet") return "直观隐藏三数组"
    if (t === "locked_pointing_row" || t === "locked_pointing_col") return "区块摒除（宫内指向）"
    if (t === "locked_claiming_row" || t === "locked_claiming_col") return "区块摒除（行列指向）"
    if (t === "naked_pairs") return "显性数对"
    if (t === "naked_triplet") return "显性三数组"
    if (t === "naked_quad") return "显性四数组"
    if (t === "hidden_pairs") return "隐性数对"
    if (t === "hidden_triplet") return "隐性三数组"
    if (t === "hidden_quad") return "隐性四数组"
    if (t === "xwing_row" || t === "xwing_col") return "X-Wing"
    if (t === "swordfish_row" || t === "swordfish_col") return "剑鱼（Swordfish）"
    if (t === "jellyfish_row" || t === "jellyfish_col") return "水母（Jellyfish）"
    if (t === "skyscraper_row" || t === "skyscraper_col") return "摩天楼（Skyscraper）"
    if (t === "two_string_kite") return "双强链（Two-String Kite）"
    if (t === "xywing") return "XY-Wing"
    if (t === "xyzwing") return "XYZ-Wing"
    if (t === "wwing") return "W-Wing"
    if (t === "empty_rectangle") return "空矩形（Empty Rectangle）"
    if (t === "turbot_fish") {
      const v = h.variant || ""
      if (v === "skyscraper") return "涡轮鱼·摩天楼（Skyscraper）"
      if (v === "skyscraper_bivalue") return "涡轮鱼·摩天楼（双强链）"
      if (v === "two_string_kite") return "涡轮鱼·双强链（2-String Kite）"
      if (v === "empty_rectangle") return "涡轮鱼·空矩形（Empty Rectangle）"
      return "涡轮鱼（Turbot Fish）"
    }
    if (t === "three_strong_links") {
      const v = h.variant || ""
      if (v === "mutant") return "3 强链鱼·Mutant（3SL）"
      if (v === "mixed") return "3 强链鱼·Mixed（3SL）"
      return "3 强链鱼（3SL）"
    }
    if (t === "bug") return "BUG（Bivalue Universal Grave）"
    if (t === "ape") return "APE（Aligned Pair Exclusion）"
    if (t === "wxyzwing") return "WXYZ-Wing"
    if (t === "vwxyzwing") return "VWXYZ-Wing"
    if (t === "ate") return "ATE（Aligned Triplet Exclusion）"
    if (t === "four_strong_links") return "4 强链鱼（4SL）"
    if (t === "five_strong_links") return "5 强链鱼（5SL）"
    if (t === "six_strong_links") return "6 强链鱼（6SL）"
    if (t === "seven_strong_links") return "7 强链鱼（7SL）"
    if (t === "eight_strong_links") return "8 强链鱼（8SL）"
    if (t === "xchain") return "X-Chain（单数字 AIC）"
    if (t === "xcycle") return "X-Cycle（Nice Loop）"
    if (t === "xycycle") return "XY-Cycle（Nice Loop）"
    if (t === "unique_rectangle_1") return "唯一矩形（Unique Rectangle）"
    if (t === "forcing_cell") return "强制推理（Forcing）"
    return "提示"
  }

  const hintBadgeText = (h) => {
    const t = (h && h.tech) || ""
    if (t === "need_notes" || t === "need_more_notes" || t === "note_conflict") return `提示 · ${hintTechLabel(h)}`
    const k = hintDifficultyKey(h)
    const s = hintDifficultyScore(h)
    const coef = Number.isFinite(s) ? s.toFixed(1) : "0.0"
    return `${hintDifficultyLabel(k)}:${coef} · ${hintTechLabel(h)}`
  }

  const cellCenterInBoard = (idx) => {
    const boardRect = ui.board.getBoundingClientRect()
    const rect = cellEls[idx].getBoundingClientRect()
    const x = rect.left - boardRect.left + rect.width / 2
    const y = rect.top - boardRect.top + rect.height / 2
    return { x, y, w: boardRect.width, h: boardRect.height, cw: rect.width, ch: rect.height }
  }

  const renderHintLines = (h, step) => {
    if (!hintSvg || !ui.board || !h) return
    hintSvg.innerHTML = ""
    hintSvg.classList.remove("sf-anim")
    const digitPointInBoard = (idx, digit) => {
      const d = digit | 0
      if (d < 1 || d > 9) return cellCenterInBoard(idx)
      const boardRect = ui.board.getBoundingClientRect()
      const rect = cellEls[idx].getBoundingClientRect()
      const dx = ((d - 1) % 3) + 0.5
      const dy = (((d - 1) / 3) | 0) + 0.5
      const x = rect.left - boardRect.left + (dx * rect.width) / 3
      const y = rect.top - boardRect.top + (dy * rect.height) / 3
      return { x, y, w: boardRect.width, h: boardRect.height, cw: rect.width, ch: rect.height }
    }
    const linkWidth = 1.4
    const strongStroke = "rgba(255, 77, 77, .46)"
    const weakStroke = "rgba(58, 160, 255, .46)"
    const isAdj = (aIdx, bIdx) => {
      const ar = (aIdx / 9) | 0
      const ac = aIdx % 9
      const br = (bIdx / 9) | 0
      const bc = bIdx % 9
      return Math.abs(ar - br) + Math.abs(ac - bc) === 1
    }
    const mkAdjStrongBeam = (fromIdx, toIdx, baseWidth, cls, digit) => {
      const p1 = cellCenterInBoard(fromIdx)
      const p2 = cellCenterInBoard(toIdx)
      const w = p1.w || 1
      const hh = p1.h || 1
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line")
      line.setAttribute("x1", String((p1.x / w) * 100))
      line.setAttribute("y1", String((p1.y / hh) * 100))
      line.setAttribute("x2", String((p2.x / w) * 100))
      line.setAttribute("y2", String((p2.y / hh) * 100))
      line.setAttribute("stroke", strongStroke)
      line.setAttribute("stroke-width", String(linkWidth))
      line.setAttribute("stroke-linecap", "round")
      if (cls) line.setAttribute("class", cls)
      return {
        paths: [line],
        dots: [],
      }
    }
    if (h.tech === "xywing") return
    if (h.tech === "xyzwing") return
    if (h.tech === "wxyzwing" || h.tech === "vwxyzwing") {
      return
    }
    if (h.tech === "forcing_cell" && h.forcingKind === "nishio") {
      const nodes = h.chainNodes || []
      if (nodes.length < 2) return
      const pts = []
      const max = Math.min(nodes.length, 10)
      for (let i = 0; i < max; i++) pts.push(cellCenterInBoard(nodes[i]))
      const w = pts[0].w || 1
      const hh = pts[0].h || 1

      const trim = (from, to) => {
        const dx = to.x - from.x
        const dy = to.y - from.y
        const len = Math.hypot(dx, dy) || 1
        const ux = dx / len
        const uy = dy / len
        const rs = Math.max(0, Math.min(from.cw || 0, from.ch || 0) / 2 - 2)
        const re = Math.max(0, Math.min(to.cw || 0, to.ch || 0) / 2 - 2)
        return {
          x1: from.x + ux * rs,
          y1: from.y + uy * rs,
          x2: to.x - ux * re,
          y2: to.y - uy * re,
        }
      }

      const mkLine = (from, to, stroke, width, dash) => {
        const { x1, y1, x2, y2 } = trim(from, to)
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line")
        line.setAttribute("x1", String((x1 / w) * 100))
        line.setAttribute("y1", String((y1 / hh) * 100))
        line.setAttribute("x2", String((x2 / w) * 100))
        line.setAttribute("y2", String((y2 / hh) * 100))
        line.setAttribute("stroke", stroke)
        line.setAttribute("stroke-width", String(width))
        line.setAttribute("stroke-linecap", "round")
        if (dash) line.setAttribute("stroke-dasharray", dash)
        return line
      }

      for (let i = 0; i < pts.length - 1; i++) {
        const dash = step === 2 ? "" : "4 3"
        hintSvg.appendChild(mkLine(pts[i], pts[i + 1], "rgba(58, 160, 255, .60)", 1.2, dash))
      }
      return
    }
    if (h.tech === "unique_rectangle_1") {
      const sc = h.sourceCells || []
      if (sc.length !== 4) return
      const rs = Array.from(new Set(sc.map((i) => ((i / 9) | 0)))).sort((a, b) => a - b)
      const cs = Array.from(new Set(sc.map((i) => i % 9))).sort((a, b) => a - b)
      if (rs.length !== 2 || cs.length !== 2) return
      const cell = 100 / 9
      const x = cs[0] * cell
      const y = rs[0] * cell
      const w2 = (cs[1] - cs[0] + 1) * cell
      const h2 = (rs[1] - rs[0] + 1) * cell
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect")
      rect.setAttribute("x", String(x))
      rect.setAttribute("y", String(y))
      rect.setAttribute("width", String(w2))
      rect.setAttribute("height", String(h2))
      rect.setAttribute("fill", "none")
      rect.setAttribute("stroke", "rgba(173, 116, 230, .38)")
      rect.setAttribute("stroke-width", "1.2")
      rect.setAttribute("stroke-dasharray", "4 3")
      hintSvg.appendChild(rect)
      return
    }
    if (h.tech === "wwing") {
      const a = h.wingAIdx ?? -1
      const b = h.wingBIdx ?? -1
      const p = h.bridgeAIdx ?? -1
      const q = h.bridgeBIdx ?? -1
      if (a < 0 || b < 0 || p < 0 || q < 0) return
      const p0 = cellCenterInBoard(p)
      const w = p0.w || 1
      const hh = p0.h || 1
      const trim = (from, to) => {
        const dx = to.x - from.x
        const dy = to.y - from.y
        const len = Math.hypot(dx, dy) || 1
        const ux = dx / len
        const uy = dy / len
        const rs = Math.max(0, Math.min(from.cw || 0, from.ch || 0) / 2 - 2)
        const re = Math.max(0, Math.min(to.cw || 0, to.ch || 0) / 2 - 2)
        return {
          x1: from.x + ux * rs,
          y1: from.y + uy * rs,
          x2: to.x - ux * re,
          y2: to.y - uy * re,
        }
      }
      const mkLine = (fromIdx, toIdx, stroke, width, dash) => {
        const from = cellCenterInBoard(fromIdx)
        const to = cellCenterInBoard(toIdx)
        const { x1, y1, x2, y2 } = trim(from, to)
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line")
        line.setAttribute("x1", String((x1 / w) * 100))
        line.setAttribute("y1", String((y1 / hh) * 100))
        line.setAttribute("x2", String((x2 / w) * 100))
        line.setAttribute("y2", String((y2 / hh) * 100))
        line.setAttribute("stroke", stroke)
        line.setAttribute("stroke-width", String(width))
        line.setAttribute("stroke-linecap", "round")
        if (dash) line.setAttribute("stroke-dasharray", dash)
        return line
      }
      if (isAdj(p, q)) {
        const beam = mkAdjStrongBeam(p, q, linkWidth, "wire-strong", h.digit)
        for (const el of beam.paths) hintSvg.appendChild(el)
        for (const el of beam.dots) hintSvg.appendChild(el)
      } else {
        hintSvg.appendChild(mkLine(p, q, strongStroke, linkWidth, ""))
      }
      hintSvg.appendChild(mkLine(a, p, weakStroke, linkWidth, "4 3"))
      hintSvg.appendChild(mkLine(b, q, weakStroke, linkWidth, "4 3"))
      return
    }
    if (h.tech === "empty_rectangle" || (h.tech === "turbot_fish" && h.variant === "empty_rectangle")) {
      const s = h.strongAIdx ?? -1
      const e = h.strongBIdx ?? -1
      const a = h.supportAIdx ?? -1
      const b = h.supportBIdx ?? -1
      if (s < 0 || e < 0) return
      const s0 = cellCenterInBoard(s)
      const w = s0.w || 1
      const hh = s0.h || 1
      const trim = (from, to) => {
        const dx = to.x - from.x
        const dy = to.y - from.y
        const len = Math.hypot(dx, dy) || 1
        const ux = dx / len
        const uy = dy / len
        const rs = Math.max(0, Math.min(from.cw || 0, from.ch || 0) / 2 - 2)
        const re = Math.max(0, Math.min(to.cw || 0, to.ch || 0) / 2 - 2)
        return {
          x1: from.x + ux * rs,
          y1: from.y + uy * rs,
          x2: to.x - ux * re,
          y2: to.y - uy * re,
        }
      }
      const mkLine = (fromIdx, toIdx, stroke, width, dash) => {
        const from = cellCenterInBoard(fromIdx)
        const to = cellCenterInBoard(toIdx)
        const { x1, y1, x2, y2 } = trim(from, to)
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line")
        line.setAttribute("x1", String((x1 / w) * 100))
        line.setAttribute("y1", String((y1 / hh) * 100))
        line.setAttribute("x2", String((x2 / w) * 100))
        line.setAttribute("y2", String((y2 / hh) * 100))
        line.setAttribute("stroke", stroke)
        line.setAttribute("stroke-width", String(width))
        line.setAttribute("stroke-linecap", "round")
        if (dash) line.setAttribute("stroke-dasharray", dash)
        return line
      }
      if (isAdj(s, e)) {
        const beam = mkAdjStrongBeam(s, e, linkWidth, "wire-strong", h.digit)
        for (const el of beam.paths) hintSvg.appendChild(el)
        for (const el of beam.dots) hintSvg.appendChild(el)
      } else {
        hintSvg.appendChild(mkLine(s, e, strongStroke, linkWidth, ""))
      }
      if (a >= 0 && b >= 0) {
        hintSvg.appendChild(mkLine(s, a, weakStroke, linkWidth, "4 3"))
        hintSvg.appendChild(mkLine(e, b, weakStroke, linkWidth, "4 3"))
      }
      return
    }
    if (h.tech === "turbot_fish") {
      const s1 = h.strong1 || []
      const s2 = h.strong2 || []
      const w1 = s1[0] ?? -1
      const w2 = s1[1] ?? -1
      const w3 = s2[0] ?? -1
      const w4 = s2[1] ?? -1
      if (w1 < 0 || w2 < 0 || w3 < 0 || w4 < 0) return
      const a0 = cellCenterInBoard(w1)
      const w = a0.w || 1
      const hh = a0.h || 1
      const trim = (from, to) => {
        const dx = to.x - from.x
        const dy = to.y - from.y
        const len = Math.hypot(dx, dy) || 1
        const ux = dx / len
        const uy = dy / len
        const rs = Math.max(0, Math.min(from.cw || 0, from.ch || 0) / 2 - 2)
        const re = Math.max(0, Math.min(to.cw || 0, to.ch || 0) / 2 - 2)
        return {
          x1: from.x + ux * rs,
          y1: from.y + uy * rs,
          x2: to.x - ux * re,
          y2: to.y - uy * re,
        }
      }
      const mkLine = (fromIdx, toIdx, stroke, width, dash) => {
        const from = cellCenterInBoard(fromIdx)
        const to = cellCenterInBoard(toIdx)
        const { x1, y1, x2, y2 } = trim(from, to)
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line")
        line.setAttribute("x1", String((x1 / w) * 100))
        line.setAttribute("y1", String((y1 / hh) * 100))
        line.setAttribute("x2", String((x2 / w) * 100))
        line.setAttribute("y2", String((y2 / hh) * 100))
        line.setAttribute("stroke", stroke)
        line.setAttribute("stroke-width", String(width))
        line.setAttribute("stroke-linecap", "round")
        if (dash) line.setAttribute("stroke-dasharray", dash)
        return line
      }
      if (isAdj(w1, w2)) {
        const beam = mkAdjStrongBeam(w1, w2, linkWidth, "wire-strong", h.digit)
        for (const el of beam.paths) hintSvg.appendChild(el)
        for (const el of beam.dots) hintSvg.appendChild(el)
      } else {
        hintSvg.appendChild(mkLine(w1, w2, strongStroke, linkWidth, ""))
      }
      if (isAdj(w3, w4)) {
        const beam = mkAdjStrongBeam(w3, w4, linkWidth, "wire-strong", h.digit)
        for (const el of beam.paths) hintSvg.appendChild(el)
        for (const el of beam.dots) hintSvg.appendChild(el)
      } else {
        hintSvg.appendChild(mkLine(w3, w4, strongStroke, linkWidth, ""))
      }
      const wk = h.weak || []
      const a = wk[0] ?? -1
      const b = wk[1] ?? -1
      if (a >= 0 && b >= 0) {
        if (h.allConjugate) {
          if (isAdj(a, b)) {
            const beam = mkAdjStrongBeam(a, b, linkWidth, "wire-strong", h.digit)
            for (const el of beam.paths) hintSvg.appendChild(el)
            for (const el of beam.dots) hintSvg.appendChild(el)
          } else {
            hintSvg.appendChild(mkLine(a, b, strongStroke, linkWidth, ""))
          }
        } else {
          hintSvg.appendChild(mkLine(a, b, weakStroke, linkWidth, "4 3"))
        }
      }
      return
    }
    if (
      h.tech === "three_strong_links" ||
      h.tech === "four_strong_links" ||
      h.tech === "five_strong_links" ||
      h.tech === "six_strong_links"
    ) {
      const sLinks = h.strongLinks || []
      const wLinks = h.weakLinks || []
      const need = h.chainSize || sLinks.length
      if (need < 3 || sLinks.length !== need) return
      const a0 = cellCenterInBoard(sLinks[0][0] ?? 0)
      const w = a0.w || 1
      const hh = a0.h || 1
      const trim = (from, to) => {
        const dx = to.x - from.x
        const dy = to.y - from.y
        const len = Math.hypot(dx, dy) || 1
        const ux = dx / len
        const uy = dy / len
        const rs = Math.max(0, Math.min(from.cw || 0, from.ch || 0) / 2 - 2)
        const re = Math.max(0, Math.min(to.cw || 0, to.ch || 0) / 2 - 2)
        return {
          x1: from.x + ux * rs,
          y1: from.y + uy * rs,
          x2: to.x - ux * re,
          y2: to.y - uy * re,
        }
      }
      const mkLine = (fromIdx, toIdx, stroke, width, dash) => {
        const from = cellCenterInBoard(fromIdx)
        const to = cellCenterInBoard(toIdx)
        const { x1, y1, x2, y2 } = trim(from, to)
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line")
        line.setAttribute("x1", String((x1 / w) * 100))
        line.setAttribute("y1", String((y1 / hh) * 100))
        line.setAttribute("x2", String((x2 / w) * 100))
        line.setAttribute("y2", String((y2 / hh) * 100))
        line.setAttribute("stroke", stroke)
        line.setAttribute("stroke-width", String(width))
        line.setAttribute("stroke-linecap", "round")
        if (dash) line.setAttribute("stroke-dasharray", dash)
        return line
      }
      const beams = []
      for (const sl of sLinks) {
        const a = sl[0] ?? -1
        const b = sl[1] ?? -1
        if (a < 0 || b < 0) continue
        if (isAdj(a, b)) {
          beams.push(mkAdjStrongBeam(a, b, linkWidth, "wire-strong", h.digit))
        } else {
          hintSvg.appendChild(mkLine(a, b, strongStroke, linkWidth, ""))
        }
      }
      for (const wl of wLinks) {
        const a = wl[0] ?? -1
        const b = wl[1] ?? -1
        if (a < 0 || b < 0) continue
        hintSvg.appendChild(mkLine(a, b, weakStroke, linkWidth, "4 3"))
      }
      for (const b of beams) {
        for (const el of b.paths) hintSvg.appendChild(el)
        for (const el of b.dots) hintSvg.appendChild(el)
      }
      return
    }
    if (h.tech === "xcycle") {
      const nodes = h.cycleNodes || []
      const links = h.cycleLinks || []
      if (nodes.length < 4) return
      const a0 = cellCenterInBoard(nodes[0])
      const w = a0.w || 1
      const hh = a0.h || 1
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]
        const b = nodes[(i + 1) % nodes.length]
        const t = links[i] || "weak"
        const p1 = cellCenterInBoard(a)
        const p2 = cellCenterInBoard(b)
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line")
        line.setAttribute("x1", String((p1.x / w) * 100))
        line.setAttribute("y1", String((p1.y / hh) * 100))
        line.setAttribute("x2", String((p2.x / w) * 100))
        line.setAttribute("y2", String((p2.y / hh) * 100))
        if (t === "strong") {
          line.setAttribute("stroke", strongStroke)
          line.setAttribute("stroke-width", String(linkWidth))
        } else {
          line.setAttribute("stroke", weakStroke)
          line.setAttribute("stroke-width", String(linkWidth))
          line.setAttribute("stroke-dasharray", "4 3")
        }
        line.setAttribute("stroke-linecap", "round")
        hintSvg.appendChild(line)
      }
      return
    }
    if (h.tech === "xycycle") {
      const nodes = h.cycleNodes || []
      if (nodes.length < 4) return
      const a0 = cellCenterInBoard(nodes[0])
      const w = a0.w || 1
      const hh = a0.h || 1
      const trim = (from, to) => {
        const dx = to.x - from.x
        const dy = to.y - from.y
        const len = Math.hypot(dx, dy) || 1
        const ux = dx / len
        const uy = dy / len
        const rs = Math.max(0, Math.min(from.cw || 0, from.ch || 0) / 2 - 2)
        const re = Math.max(0, Math.min(to.cw || 0, to.ch || 0) / 2 - 2)
        return {
          x1: from.x + ux * rs,
          y1: from.y + uy * rs,
          x2: to.x - ux * re,
          y2: to.y - uy * re,
        }
      }
      const mkLine = (x1, y1, x2, y2, stroke, width, dash) => {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line")
        line.setAttribute("x1", String((x1 / w) * 100))
        line.setAttribute("y1", String((y1 / hh) * 100))
        line.setAttribute("x2", String((x2 / w) * 100))
        line.setAttribute("y2", String((y2 / hh) * 100))
        line.setAttribute("stroke", stroke)
        line.setAttribute("stroke-width", String(width))
        line.setAttribute("stroke-linecap", "round")
        if (dash) line.setAttribute("stroke-dasharray", dash)
        return line
      }
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]
        const b = nodes[(i + 1) % nodes.length]
        const p1 = cellCenterInBoard(a)
        const p2 = cellCenterInBoard(b)
        const { x1, y1, x2, y2 } = trim(p1, p2)
        hintSvg.appendChild(mkLine(x1, y1, x2, y2, weakStroke, linkWidth, "4 3"))
      }
      for (const c of nodes) {
        const p = cellCenterInBoard(c)
        const dx = Math.max(2, (p.cw || 0) * 0.18)
        hintSvg.appendChild(mkLine(p.x - dx, p.y, p.x + dx, p.y, strongStroke, linkWidth, ""))
      }
      return
    }
    if (h.tech === "xchain") {
      const nodes = h.chainNodes || h.sourceCells || []
      const links = h.chainLinks || []
      if (nodes.length < 2) return
      const a0 = cellCenterInBoard(nodes[0])
      const w = a0.w || 1
      const hh = a0.h || 1
      const trim = (from, to) => {
        const dx = to.x - from.x
        const dy = to.y - from.y
        const len = Math.hypot(dx, dy) || 1
        const ux = dx / len
        const uy = dy / len
        const rs = Math.max(0, Math.min(from.cw || 0, from.ch || 0) / 2 - 2)
        const re = Math.max(0, Math.min(to.cw || 0, to.ch || 0) / 2 - 2)
        return {
          x1: from.x + ux * rs,
          y1: from.y + uy * rs,
          x2: to.x - ux * re,
          y2: to.y - uy * re,
        }
      }
      const beams = []
      for (let i = 0; i < nodes.length - 1; i++) {
        const t = links[i] || "weak"
        const a = nodes[i]
        const b = nodes[i + 1]
        if (t === "strong" && isAdj(a, b)) {
          beams.push(mkAdjStrongBeam(a, b, linkWidth, "wire-strong", h.digit))
          continue
        }
        const p1 = cellCenterInBoard(a)
        const p2 = cellCenterInBoard(b)
        const { x1, y1, x2, y2 } = trim(p1, p2)
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line")
        line.setAttribute("x1", String((x1 / w) * 100))
        line.setAttribute("y1", String((y1 / hh) * 100))
        line.setAttribute("x2", String((x2 / w) * 100))
        line.setAttribute("y2", String((y2 / hh) * 100))
        if (t === "strong") {
          line.setAttribute("stroke", strongStroke)
          line.setAttribute("stroke-width", String(linkWidth))
        } else {
          line.setAttribute("stroke", weakStroke)
          line.setAttribute("stroke-width", String(linkWidth))
        }
        line.setAttribute("stroke-linecap", "round")
        hintSvg.appendChild(line)
      }
      for (const b of beams) {
        for (const el of b.paths) hintSvg.appendChild(el)
        for (const el of b.dots) hintSvg.appendChild(el)
      }
      return
    }
    if (h.tech === "xwing_row" || h.tech === "xwing_col") {
      const v = h.vertices || []
      if (v.length !== 4) return
      const rows = Array.from(new Set(v.map((i) => ((i / 9) | 0)))).sort((a, b) => a - b)
      const cols = Array.from(new Set(v.map((i) => i % 9))).sort((a, b) => a - b)
      if (rows.length !== 2 || cols.length !== 2) return
      const cell = 100 / 9
      const pad = 0
      const x = cols[0] * cell + pad
      const y = rows[0] * cell + pad
      const w2 = (cols[1] - cols[0] + 1) * cell - pad * 2
      const h2 = (rows[1] - rows[0] + 1) * cell - pad * 2
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect")
      rect.setAttribute("x", String(x))
      rect.setAttribute("y", String(y))
      rect.setAttribute("width", String(w2))
      rect.setAttribute("height", String(h2))
      rect.setAttribute("fill", "none")
      rect.setAttribute("stroke", "rgba(0, 210, 210, .55)")
      rect.setAttribute("stroke-width", "0.8")
      rect.setAttribute("rx", "0")
      rect.setAttribute("ry", "0")
      rect.classList.add("xw-rect")
      hintSvg.appendChild(rect)
      return
    }
    if (h.tech === "swordfish_row" || h.tech === "swordfish_col") {
      const rows = (h.rows || []).slice().sort((a, b) => a - b)
      const cols = (h.cols || []).slice().sort((a, b) => a - b)
      if (rows.length !== 3 || cols.length !== 3) return
      const cell = 100 / 9
      const minR = rows[0]
      const maxR = rows[2]
      const minC = cols[0]
      const maxC = cols[2]
      const border = document.createElementNS("http://www.w3.org/2000/svg", "rect")
      border.setAttribute("x", String(minC * cell))
      border.setAttribute("y", String(minR * cell))
      border.setAttribute("width", String((maxC - minC + 1) * cell))
      border.setAttribute("height", String((maxR - minR + 1) * cell))
      border.setAttribute("fill", "none")
      border.setAttribute("stroke", "rgba(0, 210, 210, .35)")
      border.setAttribute("stroke-width", "1.2")
      border.classList.add("sf-frame")
      hintSvg.appendChild(border)
      
      const vs = new Set(h.vertices || [])
      for (const r of rows) {
        for (const c of cols) {
          if (vs.has(r * 9 + c)) {
            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect")
            rect.setAttribute("x", String(c * cell))
            rect.setAttribute("y", String(r * cell))
            rect.setAttribute("width", String(cell))
            rect.setAttribute("height", String(cell))
            rect.setAttribute("fill", "none")
            rect.setAttribute("stroke", "rgba(173, 116, 230, .45)")
            rect.setAttribute("stroke-width", "1.2")
            rect.classList.add("sf-cross")
            hintSvg.appendChild(rect)
          }
        }
      }
      hintSvg.classList.add("sf-anim")
      return
    }
    if (h.tech === "jellyfish_row" || h.tech === "jellyfish_col") {
      const rows = (h.rows || []).slice().sort((a, b) => a - b)
      const cols = (h.cols || []).slice().sort((a, b) => a - b)
      if (rows.length !== 4 || cols.length !== 4) return
      const cell = 100 / 9
      for (const r of rows) {
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect")
        rect.setAttribute("x", "0")
        rect.setAttribute("y", String(r * cell))
        rect.setAttribute("width", "100")
        rect.setAttribute("height", String(cell))
        rect.setAttribute("fill", "rgba(173, 116, 230, .08)")
        rect.classList.add("sf-band")
        hintSvg.appendChild(rect)
      }
      for (const c of cols) {
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect")
        rect.setAttribute("x", String(c * cell))
        rect.setAttribute("y", "0")
        rect.setAttribute("width", String(cell))
        rect.setAttribute("height", "100")
        rect.setAttribute("fill", "rgba(0, 210, 210, .06)")
        rect.classList.add("sf-band")
        hintSvg.appendChild(rect)
      }
      const minR = rows[0]
      const maxR = rows[3]
      const minC = cols[0]
      const maxC = cols[3]
      const border = document.createElementNS("http://www.w3.org/2000/svg", "rect")
      border.setAttribute("x", String(minC * cell))
      border.setAttribute("y", String(minR * cell))
      border.setAttribute("width", String((maxC - minC + 1) * cell))
      border.setAttribute("height", String((maxR - minR + 1) * cell))
      border.setAttribute("fill", "none")
      border.setAttribute("stroke", "rgba(0, 210, 210, .28)")
      border.setAttribute("stroke-width", "1.0")
      border.classList.add("sf-frame")
      hintSvg.appendChild(border)
      hintSvg.classList.add("sf-anim")
      return
    }
  }

  const applyHintHighlight = (h, step) => {
    if (!activeState || !h) return
    if (!ui.board) return
    ui.board.classList.add("hinting")
    for (const el of cellEls) {
      el.classList.remove("hint-unit")
      el.classList.remove("hint-target")
      el.classList.remove("hint-source")
      el.classList.remove("hint-elim")
      el.classList.remove("hint-elim-wwing")
      el.classList.remove("hint-elim-er")
      el.classList.remove("hint-wing")
      el.classList.remove("hint-bridge")
      el.classList.remove("hint-hex-pivot")
      el.classList.remove("hint-rigid-wing")
      el.classList.remove("hint-pivot")
      el.classList.remove("hint-leaf")
      el.classList.remove("hint-leaf-switch")
      el.classList.remove("hint-chain-end")
      el.classList.remove("hint-chain-mid")
      el.classList.remove("hint-er-cand")
      el.classList.remove("hint-cycle-node")
      el.classList.remove("hint-cycle-true")
      el.classList.remove("hint-cycle-false")
      el.classList.remove("hint-xycycle")
      el.classList.remove("same")
    }
    if (h.type === "action") {
      renderHintLines(null, step)
      return
    }
    if (h.type === "eliminate") {
      if (h.tech === "xwing_row" || h.tech === "xwing_col" || h.tech === "swordfish_row" || h.tech === "swordfish_col" || h.tech === "jellyfish_row" || h.tech === "jellyfish_col") {
        const isRow = h.tech.endsWith("_row")
        let rr = []
        let cc = []
        if (h.rows && h.cols) {
          rr = h.rows.slice()
          cc = h.cols.slice()
        } else {
          const vs = h.vertices || []
          rr = Array.from(new Set(vs.map((i) => ((i / 9) | 0)))).sort((a, b) => a - b)
          cc = Array.from(new Set(vs.map((i) => i % 9))).sort((a, b) => a - b)
        }
        
        if (step === 1) {
          if (isRow) {
            for (const r0 of rr) for (const i of rowCells[r0]) cellEls[i].classList.add("hint-unit")
          } else {
            for (const c0 of cc) for (const i of colCells[c0]) cellEls[i].classList.add("hint-unit")
          }
        } else {
          if (isRow) {
            for (const c0 of cc) for (const i of colCells[c0]) cellEls[i].classList.add("hint-unit")
          } else {
            for (const r0 of rr) for (const i of rowCells[r0]) cellEls[i].classList.add("hint-unit")
          }
        }
      } else {
        for (const i of h.unitCells || []) cellEls[i].classList.add("hint-unit")
      }
      if (h.tech === "xchain") {
        const nodes = h.chainNodes || h.sourceCells || []
        const last = nodes.length - 1
        for (let k = 0; k < nodes.length; k++) {
          const i = nodes[k]
          if (k === 0 || k === last) cellEls[i].classList.add("hint-chain-end")
          else cellEls[i].classList.add("hint-chain-mid")
        }
      } else if (h.tech === "forcing_cell" && h.forcingKind === "nishio") {
        const nodes = h.chainNodes || h.sourceCells || []
        const last = nodes.length - 1
        for (let k = 0; k < nodes.length; k++) {
          const i = nodes[k]
          if (k === 0 || k === last) cellEls[i].classList.add("hint-chain-end")
          else cellEls[i].classList.add("hint-chain-mid")
        }
        for (const i of h.conflictCells || []) if (i >= 0) cellEls[i].classList.add("hint-cycle-false")
      } else if (h.tech === "xcycle") {
        for (const i of h.cycleNodes || []) cellEls[i].classList.add("hint-cycle-node")
        const f = h.forcedIdx ?? -1
        if (f >= 0) cellEls[f].classList.add(h.forcedState === "true" ? "hint-cycle-true" : "hint-cycle-false")
      } else if (h.tech === "xycycle") {
        for (const i of h.cycleNodes || []) cellEls[i].classList.add("hint-xycycle")
      } else if (
        h.tech === "three_strong_links" ||
        h.tech === "four_strong_links" ||
        h.tech === "five_strong_links" ||
        h.tech === "six_strong_links" ||
        h.tech === "seven_strong_links" ||
        h.tech === "eight_strong_links"
      ) {
        const endsSet = new Set(h.ends || [])
        for (const sl of h.strongLinks || []) {
          const a = sl[0] ?? -1
          const b = sl[1] ?? -1
          if (a >= 0 && !endsSet.has(a)) cellEls[a].classList.add("hint-bridge")
          if (b >= 0 && !endsSet.has(b)) cellEls[b].classList.add("hint-bridge")
        }
        const ends = h.ends || []
        for (const i of ends) if (i >= 0) cellEls[i].classList.add("hint-wing")
      } else if (h.tech === "turbot_fish") {
        if (h.variant === "empty_rectangle") {
          const s = h.strongAIdx ?? -1
          const e = h.strongBIdx ?? -1
          if (s >= 0) cellEls[s].classList.add("hint-bridge")
          if (e >= 0) cellEls[e].classList.add("hint-bridge")
          for (const i of h.candCells || []) cellEls[i].classList.add("hint-er-cand")
        } else {
          const s1 = h.strong1 || []
          const s2 = h.strong2 || []
          const endsSet = new Set(h.ends || [])
          for (const i of [s1[0], s1[1], s2[0], s2[1]]) {
            if (i >= 0 && !endsSet.has(i)) cellEls[i].classList.add("hint-bridge")
          }
          const ends = h.ends || []
          for (const i of ends) if (i >= 0) cellEls[i].classList.add("hint-wing")
        }
      } else if (h.tech === "empty_rectangle") {
        const s = h.strongAIdx ?? -1
        const e = h.strongBIdx ?? -1
        if (s >= 0) cellEls[s].classList.add("hint-bridge")
        if (e >= 0) cellEls[e].classList.add("hint-bridge")
        for (const i of h.candCells || []) cellEls[i].classList.add("hint-er-cand")
      } else if (h.tech === "wwing") {
        const a = h.wingAIdx ?? -1
        const b = h.wingBIdx ?? -1
        const p = h.bridgeAIdx ?? -1
        const q = h.bridgeBIdx ?? -1
        if (a >= 0) cellEls[a].classList.add("hint-wing")
        if (b >= 0) cellEls[b].classList.add("hint-wing")
        if (p >= 0) cellEls[p].classList.add("hint-bridge")
        if (q >= 0) cellEls[q].classList.add("hint-bridge")
      } else if (h.tech === "xywing") {
        const p = h.pivotIdx ?? -1
        const a = h.wingAIdx ?? -1
        const b = h.wingBIdx ?? -1
        if (p >= 0) cellEls[p].classList.add("hint-pivot")
        if (a >= 0) cellEls[a].classList.add("hint-leaf")
        if (b >= 0) cellEls[b].classList.add("hint-leaf")
      } else if (h.tech === "xyzwing") {
        const p = h.pivotIdx ?? -1
        const a = h.wingAIdx ?? -1
        const b = h.wingBIdx ?? -1
        if (p >= 0) cellEls[p].classList.add("hint-pivot")
        if (a >= 0) cellEls[a].classList.add("hint-leaf")
        if (b >= 0) cellEls[b].classList.add("hint-leaf")
      } else if (h.tech === "wxyzwing") {
        const p = h.wxyzIdx ?? -1
        if (p >= 0 && activeState && activeState.grid && activeState.grid[p] === 0) cellEls[p].classList.add("hint-pivot")
        for (const i of h.sourceCells || []) {
          if (i < 0) continue
          if (i === p) continue
          if (!(activeState && activeState.grid && activeState.grid[i] === 0)) continue
          cellEls[i].classList.add("hint-leaf")
        }
        const yz = h.yzIdx ?? -1
        if (step >= 2 && yz >= 0 && activeState && activeState.grid && activeState.grid[yz] === 0) cellEls[yz].classList.add("hint-leaf-switch")
      } else if (h.tech === "vwxyzwing") {
        const p = h.vwxyzIdx ?? -1
        if (p >= 0 && activeState && activeState.grid && activeState.grid[p] === 0) cellEls[p].classList.add("hint-pivot")
        for (const i of h.sourceCells || []) {
          if (i < 0) continue
          if (i === p) continue
          if (!(activeState && activeState.grid && activeState.grid[i] === 0)) continue
          cellEls[i].classList.add("hint-leaf")
        }
        const yz = h.yzIdx ?? -1
        if (step >= 2 && yz >= 0 && activeState && activeState.grid && activeState.grid[yz] === 0) cellEls[yz].classList.add("hint-leaf-switch")
      } else if (h.tech === "xwing_row" || h.tech === "xwing_col") {
      } else {
        for (const i of h.sourceCells || []) cellEls[i].classList.add("hint-source")
      }
      if (step === hintStepCount(h)) {
        for (const i of h.targetCells || []) {
          cellEls[i].classList.add("hint-elim")
          if (h.tech === "wwing") cellEls[i].classList.add("hint-elim-wwing")
          if (h.tech === "empty_rectangle") cellEls[i].classList.add("hint-elim-er")
          if (h.tech === "turbot_fish") cellEls[i].classList.add("hint-elim-er")
          if (h.tech === "wxyzwing" || h.tech === "vwxyzwing") cellEls[i].classList.add("hint-elim-wing")
          if (h.tech === "xywing" || h.tech === "xyzwing") cellEls[i].classList.add("hint-elim-wing")
          if (
            h.tech === "three_strong_links" ||
            h.tech === "four_strong_links" ||
            h.tech === "five_strong_links" ||
            h.tech === "six_strong_links" ||
            h.tech === "seven_strong_links" ||
            h.tech === "eight_strong_links"
          )
            cellEls[i].classList.add("hint-elim-er")
        }
      }
      renderHintLines(
        step === 1 ||
          h.tech === "wwing" ||
          h.tech === "empty_rectangle" ||
          h.tech === "turbot_fish" ||
          h.tech === "wxyzwing" ||
          h.tech === "vwxyzwing" ||
          (h.tech === "forcing_cell" && h.forcingKind === "nishio") ||
          h.tech === "three_strong_links" ||
          h.tech === "four_strong_links" ||
          h.tech === "five_strong_links" ||
          h.tech === "six_strong_links" ||
          h.tech === "seven_strong_links" ||
          h.tech === "eight_strong_links" ||
          h.tech === "xwing_row" ||
          h.tech === "xwing_col" ||
          h.tech === "xcycle" ||
          h.tech === "xycycle"
          ? h
          : null,
        step
      )
      return
    }
    if (
      h.tech === "hidden_single" ||
      h.tech === "note_hidden_single" ||
      h.tech === "full_house" ||
      h.tech === "direct_pointing" ||
      h.tech === "direct_claiming" ||
      h.tech === "direct_hidden_pair" ||
      h.tech === "direct_hidden_triplet"
    ) {
      const unit =
        h.unitType === "row" ? rowCells[h.unitIndex] : h.unitType === "col" ? colCells[h.unitIndex] : boxCells[h.unitIndex]
      for (const i of unit) cellEls[i].classList.add("hint-unit")
      
      if ((h.tech === "hidden_single" || h.tech === "note_hidden_single") && h.digit) {
        for (let i = 0; i < 81; i++) {
          if (activeState.grid[i] === h.digit) {
            cellEls[i].classList.add("same")
          }
        }
      }
    } else {
      if (h.tech === "forcing_cell" && h.forcingKind === "nishio") {
        const nodes = h.chainNodes || h.sourceCells || []
        const last = nodes.length - 1
        for (let k = 0; k < nodes.length; k++) {
          const i = nodes[k]
          if (k === 0 || k === last) cellEls[i].classList.add("hint-chain-end")
          else cellEls[i].classList.add("hint-chain-mid")
        }
        for (const i of h.conflictCells || []) if (i >= 0) cellEls[i].classList.add("hint-cycle-false")
        cellEls[h.idx].classList.add("hint-target")
        renderHintLines(h, step)
        return
      }
      if (h.tech === "xwing_row" || h.tech === "xwing_col") {
        const vs = h.vertices || []
        if (vs.length === 4) {
          const rr = Array.from(new Set(vs.map((i) => ((i / 9) | 0)))).sort((a, b) => a - b)
          const cc = Array.from(new Set(vs.map((i) => i % 9))).sort((a, b) => a - b)
          if (rr.length === 2 && cc.length === 2) {
            if (step === 1) {
              if (h.tech === "xwing_row") {
                for (const r0 of rr) for (const i of rowCells[r0]) cellEls[i].classList.add("hint-unit")
              } else {
                for (const c0 of cc) for (const i of colCells[c0]) cellEls[i].classList.add("hint-unit")
              }
            } else {
              if (h.tech === "xwing_row") {
                for (const c0 of cc) for (const i of colCells[c0]) cellEls[i].classList.add("hint-unit")
              } else {
                for (const r0 of rr) for (const i of rowCells[r0]) cellEls[i].classList.add("hint-unit")
              }
            }
          }
        }
        renderHintLines(h, step)
        return
      }
      const idx = h.idx
      const r = (idx / 9) | 0
      const c = idx % 9
      const b = ((r / 3) | 0) * 3 + ((c / 3) | 0)
      for (const i of rowCells[r]) cellEls[i].classList.add("hint-unit")
      for (const i of colCells[c]) cellEls[i].classList.add("hint-unit")
      for (const i of boxCells[b]) cellEls[i].classList.add("hint-unit")
    }
    if (h.tech === "xcycle") {
      for (const i of h.cycleNodes || []) cellEls[i].classList.add("hint-cycle-node")
      const f = h.forcedIdx ?? -1
      if (f >= 0) cellEls[f].classList.add(h.forcedState === "true" ? "hint-cycle-true" : "hint-cycle-false")
      cellEls[h.idx].classList.add("hint-target")
      renderHintLines(h, step)
      return
    }
    for (const i of h.sourceCells || []) cellEls[i].classList.add("hint-source")
    cellEls[h.idx].classList.add("hint-target")
    renderHintLines(null, step)
  }

  const hintMessageText = (h, step) => {
    if (!activeState || !h) return ""
    const idx = h.idx ?? -1
    const r = idx >= 0 ? ((idx / 9) | 0) + 1 : 0
    const c = idx >= 0 ? (idx % 9) + 1 : 0
    if (h.tech === "need_notes") {
      if (step === 1) return `检测到可用提示：${techNameForPrompt(h.nextTech)}（需要笔记）。`
      if (h.action === "auto_notes") return "点击“一键笔记”生成候选。"
      return "打开笔记模式，在空格里补全候选数。"
    }
    if (h.tech === "need_more_notes") {
      if (step === 1) return `检测到可用提示：${techNameForPrompt(h.nextTech)}（需要更完整的笔记）。`
      return "点击“补全笔记”把空白格子的候选补上。"
    }
    if (h.tech === "note_conflict") {
      const a = h.idx ?? -1
      const b = h.conflictIdx ?? -1
      const d = h.digit ?? 0
      if (a < 0 || b < 0 || d <= 0) {
        if (step === 1) return "检测到笔记与盘面冲突：有格子的笔记包含不可能的数字。"
        return "可以排除冲突的笔记候选数。"
      }
      const ar = ((a / 9) | 0) + 1
      const ac = (a % 9) + 1
      const br = ((b / 9) | 0) + 1
      const bc = (b % 9) + 1
      const unit =
        h.unitType === "row"
          ? `第 ${h.unitIndex + 1} 行`
          : h.unitType === "col"
            ? `第 ${h.unitIndex + 1} 列`
            : `第 ${h.unitIndex + 1} 宫`
      if (step === 1) {
        return `第 ${ar} 行第 ${ac} 列的笔记包含 ${d}，但 ${unit} 已在第 ${br} 行第 ${bc} 列填入了 ${d}，两者冲突。`
      }
      return `可以排除第 ${ar} 行第 ${ac} 列的笔记候选 ${d}。`
    }
    if (h.tech === "full_house") {
      const u = unitLabel(h.unitType, h.unitIndex)
      if (step === 1) return `观察 ${u}：该区域只剩一个空格。`
      return `因此目标格（第 ${r} 行第 ${c} 列）必须填 ${h.digit}。`
    }
    if (h.tech === "naked_single") {
      if (step === 1) return `观察目标格（第 ${r} 行第 ${c} 列），排除后只剩一个候选数。`
      return `因此该格只能填 ${h.digit}。`
    }
    if (h.tech === "note_single") {
      if (step === 1) return `观察目标格（第 ${r} 行第 ${c} 列），你的笔记只剩一个候选数。`
      return `因此该格只能填 ${h.digit}。`
    }
    if (h.tech === "note_hidden_single") {
      const u = unitLabel(h.unitType, h.unitIndex)
      if (step === 1) return `观察 ${u}（以笔记为准），数字 ${h.digit} 只出现在一个格子里。`
      return `所以目标格（第 ${r} 行第 ${c} 列）必须填 ${h.digit}。`
    }
    if (h.tech === "hidden_single") {
      const u = unitLabel(h.unitType, h.unitIndex)
      if (step === 1) return `观察 ${u}，数字 ${h.digit} 只出现在一个格子里。`
      return `所以目标格（第 ${r} 行第 ${c} 列）必须填 ${h.digit}。`
    }
    if (h.tech === "direct_pointing") {
      const u1 = unitLabel("box", h.boxIndex)
      const u2 = unitLabel(h.lineType, h.lineIndex)
      const u3 = unitLabel(h.unitType, h.unitIndex)
      if (step === 1) return `观察 ${u1}：数字 ${h.digit} 的候选全部落在 ${u2} 上。`
      return `因此 ${u2} 的其他宫不能放 ${h.digit}，从而使 ${u3} 里数字 ${h.digit} 只剩一个位置：目标格必须填 ${h.digit}。`
    }
    if (h.tech === "direct_claiming") {
      const u1 = unitLabel(h.lineType, h.lineIndex)
      const u2 = unitLabel("box", h.boxIndex)
      const u3 = unitLabel(h.unitType, h.unitIndex)
      if (step === 1) return `观察 ${u1}：数字 ${h.digit} 的候选全部落在 ${u2} 中。`
      return `因此 ${u2} 的其他行/列不能放 ${h.digit}，从而使 ${u3} 里数字 ${h.digit} 只剩一个位置：目标格必须填 ${h.digit}。`
    }
    if (h.tech === "direct_hidden_pair" || h.tech === "direct_hidden_triplet") {
      const u = unitLabel(h.unitType, h.unitIndex)
      const ds = (h.setDigits || []).join(" / ")
      if (step === 1) return `观察 ${u}：数字 ${ds} 只能出现在同一组格子里（隐藏数组）。`
      return `因此这些格子不可能是其他数字，从而让数字 ${h.digit} 在 ${u} 中只剩一个位置：目标格必须填 ${h.digit}。`
    }
    if (h.tech === "bug") {
      if (step === 1) return `这里出现了 BUG（Bivalue Universal Grave）：除一个格子外，其余空格都只剩两个候选数。`
      return `在这个三候选格中，数字 ${h.digit} 在某个区域里只出现一次，因此该格必须填 ${h.digit}。`
    }
    if (h.tech === "ape") {
      if (step === 1) return "这里使用 APE（Aligned Pair Exclusion）：枚举两格的候选组合，排除会让共同双值格“无候选”的组合。"
      return "因此目标格里某些候选在所有可行组合中都不会出现，可以排除。"
    }
    if (h.tech === "wxyzwing") {
      const yz = h.yzIdx ?? -1
      const x = h.xBit ? (Math.log2(h.xBit) | 0) + 1 : 0
      const z = h.zBit ? (Math.log2(h.zBit) | 0) + 1 : 0
      const unionMask = h.interMask || 0
      const ws = []
      let wm = unionMask
      while (wm) {
        const bit = wm & -wm
        wm ^= bit
        ws.push((Math.log2(bit) | 0) + 1)
      }
      const ds = []
      let m = 0
      for (const e of h.elimList || []) m |= e.mask || 0
      while (m) {
        const bit = m & -m
        m ^= bit
        ds.push((Math.log2(bit) | 0) + 1)
      }
      if (step === 1) {
        const setText = ws.length ? `共同包含候选数 {${ws.join(", ")}}。` : "构成一个闭合网络。"
        if (x && z) return `第 1 步：锁定结构。棕色枢纽格与黄色叶子格${setText}其中有一个叶子格中只有两个候选数 {${x}, ${z}}，我们把它当做二选一开关（第 2 步会用黄绿色描边标出）。`
        return `第 1 步：锁定结构。棕色枢纽格与黄色叶子格${setText}`
      }
      if (step === 2) {
        if (yz >= 0 && x && z) return `第 2 步：情况 A（开关叶子格是 ${z}）。开关叶子格只有 {${x}, ${z}}，如果它填入 ${z}，那么目标数字就位于此处。`
        if (x && z) return `第 2 步：情况 A（开关叶子格是 ${z}）。开关叶子格只有 {${x}, ${z}}，如果它填入 ${z}，那么目标数字就位于此处。`
        if (z) return `第 2 步：情况 A（开关叶子格是 ${z}）。如果开关叶子格填入 ${z}，那么目标数字就位于此处。`
        return "第 2 步：情况 A（目标在开关叶子格）。如果开关叶子格填入目标数字，那么目标数字就位于此处。"
      }
      if (step === 3) {
        const wsn = z ? ws.filter((d) => d !== z) : ws.slice()
        if (x && z && wsn.length) return `第 3 步：情况 B（开关叶子格是 ${x}）。开关叶子格只有 {${x}, ${z}}，若它不填 ${z}，则其余格子将瓜分 {${wsn.join(", ")}}；位置被占满后，${z} 只能落在红色叶子格之一。`
        if (x && z) return `第 3 步：情况 B（开关叶子格是 ${x}）。开关叶子格只有 {${x}, ${z}}，若它不填 ${z}，则 ${z} 只能落在红色叶子格之一。`
        if (z && wsn.length) return `第 3 步：情况 B（开关叶子格不为 ${z}）。若开关叶子格不填 ${z}，则其余格子将瓜分 {${wsn.join(", ")}}；位置被占满后，${z} 只能落在红色叶子格之一。`
        if (z) return `第 3 步：情况 B（开关叶子格不为 ${z}）。若开关叶子格不填 ${z}，则 ${z} 只能落在红色叶子格之一。`
        return "第 3 步：情况 B（目标不在开关叶子格）。若开关叶子格不填目标数字，则目标数字只能落在红色叶子格之一。"
      }
      if (ds.length) {
        if (z) return `第 4 步：结论。不论哪种情况，${z} 必在结构中的红色位置之一，因此红叉处的候选（${ds.join(" / ")}）都可以被排除。`
        return `第 4 步：结论。不论哪种情况，目标数字必在结构中的红色位置之一，因此红叉处的候选（${ds.join(" / ")}）都可以被排除。`
      }
      if (z) return `第 4 步：结论。不论哪种情况，${z} 必在结构中的红色位置之一，因此红叉处的候选可以被排除。`
      return "第 4 步：结论。不论哪种情况，目标数字必在结构中的红色位置之一，因此红叉处的候选可以被排除。"
    }
    if (h.tech === "vwxyzwing") {
      const yz = h.yzIdx ?? -1
      const x = h.xBit ? (Math.log2(h.xBit) | 0) + 1 : 0
      const z = h.zBit ? (Math.log2(h.zBit) | 0) + 1 : 0
      const unionMask = h.unionMask || 0
      const ws = []
      let wm = unionMask
      while (wm) {
        const bit = wm & -wm
        wm ^= bit
        ws.push((Math.log2(bit) | 0) + 1)
      }
      const ds = []
      let m = 0
      for (const e of h.elimList || []) m |= e.mask || 0
      while (m) {
        const bit = m & -m
        m ^= bit
        ds.push((Math.log2(bit) | 0) + 1)
      }
      if (step === 1) {
        const setText = ws.length ? `共同包含候选数 {${ws.join(", ")}}。` : "构成一个闭合网络。"
        if (x && z) return `第 1 步：锁定结构。棕色枢纽格与黄色叶子格${setText}其中有一个叶子格中只有两个候选数 {${x}, ${z}}，我们把它当做二选一开关（第 2 步会用黄绿色描边标出）。`
        return `第 1 步：锁定结构。棕色枢纽格与黄色叶子格${setText}`
      }
      if (step === 2) {
        if (yz >= 0 && x && z) return `第 2 步：情况 A（开关叶子格是 ${z}）。开关叶子格只有 {${x}, ${z}}，如果它填入 ${z}，那么目标数字就位于此处。`
        if (x && z) return `第 2 步：情况 A（开关叶子格是 ${z}）。开关叶子格只有 {${x}, ${z}}，如果它填入 ${z}，那么目标数字就位于此处。`
        if (z) return `第 2 步：情况 A（开关叶子格是 ${z}）。如果开关叶子格填入 ${z}，那么目标数字就位于此处。`
        return "第 2 步：情况 A（目标在开关叶子格）。如果开关叶子格填入目标数字，那么目标数字就位于此处。"
      }
      if (step === 3) {
        const wsn = z ? ws.filter((d) => d !== z) : ws.slice()
        if (x && z && wsn.length) return `第 3 步：情况 B（开关叶子格是 ${x}）。开关叶子格只有 {${x}, ${z}}，若它不填 ${z}，则其余格子将瓜分 {${wsn.join(", ")}}；位置被占满后，${z} 只能落在红色叶子格之一。`
        if (x && z) return `第 3 步：情况 B（开关叶子格是 ${x}）。开关叶子格只有 {${x}, ${z}}，若它不填 ${z}，则 ${z} 只能落在红色叶子格之一。`
        if (z && wsn.length) return `第 3 步：情况 B（开关叶子格不为 ${z}）。若开关叶子格不填 ${z}，则其余格子将瓜分 {${wsn.join(", ")}}；位置被占满后，${z} 只能落在红色叶子格之一。`
        if (z) return `第 3 步：情况 B（开关叶子格不为 ${z}）。若开关叶子格不填 ${z}，则 ${z} 只能落在红色叶子格之一。`
        return "第 3 步：情况 B（目标不在开关叶子格）。若开关叶子格不填目标数字，则目标数字只能落在红色叶子格之一。"
      }
      if (ds.length) {
        if (z) return `第 4 步：结论。不论哪种情况，${z} 必在结构中的红色位置之一，因此红叉处的候选（${ds.join(" / ")}）都可以被排除。`
        return `第 4 步：结论。不论哪种情况，目标数字必在结构中的红色位置之一，因此红叉处的候选（${ds.join(" / ")}）都可以被排除。`
      }
      if (z) return `第 4 步：结论。不论哪种情况，${z} 必在结构中的红色位置之一，因此红叉处的候选可以被排除。`
      return "第 4 步：结论。不论哪种情况，目标数字必在结构中的红色位置之一，因此红叉处的候选可以被排除。"
    }
    if (h.tech === "ate") {
      if (step === 1) return "这里使用 ATE（Aligned Triplet Exclusion）：枚举三格的候选组合，排除会让共同格“无候选”的组合。"
      return "因此目标格里某些候选在所有可行组合中都不会出现，可以排除。"
    }
    if (h.tech === "forcing_cell" && h.forcingKind === "nishio") {
      if (step === 1) return "这里使用强制推理（反证）：对某个候选做假设并推演，若推出矛盾则否定该假设。"
      const cfType = h.conflictType || ""
      const cfIdx = h.conflictIdx ?? -1
      const cfR = cfIdx >= 0 ? ((cfIdx / 9) | 0) + 1 : 0
      const cfC = cfIdx >= 0 ? (cfIdx % 9) + 1 : 0
      const cfDigit = h.conflictDigit || 0
      const cfUnitType = h.conflictUnitType || ""
      const cfUnitIndex = (h.conflictUnitIndex ?? -1) + 1
      let cfText = ""
      if (cfType === "pot") cfText = `矛盾点：第 ${cfR} 行第 ${cfC} 列候选 ${cfDigit} 同时被推为“必须/禁止”。`
      else if (cfType === "cell") cfText = `矛盾点：第 ${cfR} 行第 ${cfC} 列被推演到“无候选”。`
      else if (cfType === "unit_empty") {
        const u = cfUnitType === "row" ? `第 ${cfUnitIndex} 行` : cfUnitType === "col" ? `第 ${cfUnitIndex} 列` : `第 ${cfUnitIndex} 宫`
        cfText = `矛盾点：${u} 的数字 ${cfDigit} 被推演到“无位置”。`
      } else if (cfType === "unit_conflict") {
        const u = cfUnitType === "row" ? `第 ${cfUnitIndex} 行` : cfUnitType === "col" ? `第 ${cfUnitIndex} 列` : `第 ${cfUnitIndex} 宫`
        cfText = `矛盾点：${u} 的数字 ${cfDigit} 被推演到“重复出现”。`
      }
      if (h.type === "fill") {
        if (cfText) return `${cfText} 因此目标格（第 ${r} 行第 ${c} 列）必须填 ${h.digit}。`
        return `因此目标格（第 ${r} 行第 ${c} 列）必须填 ${h.digit}。`
      }
      if (cfText) return `${cfText} 因此目标格（第 ${r} 行第 ${c} 列）可以排除候选 ${h.digit}。`
      return `因此目标格（第 ${r} 行第 ${c} 列）可以排除候选 ${h.digit}。`
    }
    if (h.tech === "forcing_cell") {
      const noteMask = (activeState.notes && idx >= 0 ? activeState.notes[idx] : 0) || 0
      const elimMask = h.eliminatedMask || 0
      const showMask = noteMask ? elimMask & noteMask : elimMask
      const ds = []
      let m = showMask
      while (m) {
        const bit = m & -m
        m ^= bit
        ds.push((Math.log2(bit) | 0) + 1)
      }
      if (step === 1) {
        if (!ds.length) return `对目标格（第 ${r} 行第 ${c} 列）进行单格强制推理：部分候选会导致矛盾。`
        if (noteMask) return `对目标格（第 ${r} 行第 ${c} 列）进行单格强制推理：笔记里的候选 ${ds.join(" / ")} 都会导致矛盾。`
        return `对目标格（第 ${r} 行第 ${c} 列）进行单格强制推理：候选 ${ds.join(" / ")} 都会导致矛盾。`
      }
      return `因此该格只能填 ${h.digit}。`
    }
    if (h.tech === "unique_rectangle_1") {
      const ds = []
      let m = h.pairMask || 0
      while (m) {
        const bit = m & -m
        m ^= bit
        ds.push((Math.log2(bit) | 0) + 1)
      }
      const dStr = ds.join(" / ")
      if (step === 1) return `这里形成了 唯一矩形：四格构成矩形且有共同数对 ${dStr}。`
      return `为避免出现多解，目标格（第 ${r} 行第 ${c} 列）必须填 ${h.digit}。`
    }
    if (h.tech === "locked_pointing_row") {
      const box = unitLabel("box", h.boxIndex)
      const line = unitLabel("row", h.lineIndex)
      if (step === 1) return `观察 ${box}：数字 ${h.digit} 只能落在 ${line}。`
      return `因此 ${line} 中不在该宫的格子可以排除候选 ${h.digit}。`
    }
    if (h.tech === "locked_pointing_col") {
      const box = unitLabel("box", h.boxIndex)
      const line = unitLabel("col", h.lineIndex)
      if (step === 1) return `观察 ${box}：数字 ${h.digit} 只能落在 ${line}。`
      return `因此 ${line} 中不在该宫的格子可以排除候选 ${h.digit}。`
    }
    if (h.tech === "locked_claiming_row") {
      const line = unitLabel("row", h.lineIndex)
      const box = unitLabel("box", h.boxIndex)
      if (step === 1) return `观察 ${line}：数字 ${h.digit} 只能落在 ${box} 内。`
      return `因此 ${box} 中不在该行的格子可以排除候选 ${h.digit}。`
    }
    if (h.tech === "locked_claiming_col") {
      const line = unitLabel("col", h.lineIndex)
      const box = unitLabel("box", h.boxIndex)
      if (step === 1) return `观察 ${line}：数字 ${h.digit} 只能落在 ${box} 内。`
      return `因此 ${box} 中不在该列的格子可以排除候选 ${h.digit}。`
    }
    if (h.tech === "naked_pairs") {
      const u = unitLabel(h.unitType, h.unitIndex)
      const a = digitFromSingleMask(h.elimMask & -h.elimMask)
      const b = digitFromSingleMask(h.elimMask ^ (h.elimMask & -h.elimMask))
      if (step === 1) return `观察 ${u}：有两个格子的候选数完全相同，只包含 ${a} 和 ${b}。`
      return `因此 ${u} 中其他格子的候选 ${a}/${b} 都可以排除。`
    }
    if (h.tech === "hidden_pairs") {
      const u = unitLabel(h.unitType, h.unitIndex)
      const m = h.keepMask || 0
      const a = digitFromSingleMask(m & -m)
      const b = digitFromSingleMask(m ^ (m & -m))
      if (step === 1) return `观察 ${u}：数字 ${a} 和 ${b} 只可能落在同两个格子里。`
      return `因此这两个格子里除了 ${a}/${b} 以外的其他候选数都可以排除。`
    }
    if (h.tech === "naked_triplet" || h.tech === "naked_quad") {
      const u = unitLabel(h.unitType, h.unitIndex)
      const k = h.tech === "naked_triplet" ? 3 : 4
      const ds = []
      let m = h.elimMask || 0
      while (m) {
        const bit = m & -m
        m ^= bit
        ds.push((Math.log2(bit) | 0) + 1)
      }
      const dStr = ds.join(" / ")
      if (step === 1) return `观察 ${u}：有 ${k} 个格子的候选数合并后恰好是 ${dStr}，它们会被这 ${k} 个格子占满。`
      return `因此 ${u} 中其他格子的候选 ${dStr} 都可以排除。`
    }
    if (h.tech === "hidden_triplet" || h.tech === "hidden_quad") {
      const u = unitLabel(h.unitType, h.unitIndex)
      const k = h.tech === "hidden_triplet" ? 3 : 4
      const ds = []
      let m = h.keepMask || 0
      while (m) {
        const bit = m & -m
        m ^= bit
        ds.push((Math.log2(bit) | 0) + 1)
      }
      const dStr = ds.join(" / ")
      if (step === 1) return `观察 ${u}：数字 ${dStr} 只出现在同 ${k} 个格子的候选列表里。`
      return `因此这 ${k} 个格子里除了 ${dStr} 以外的其他候选数都可以排除。`
    }
    if (h.tech === "turbot_fish") {
      const v = h.variant || ""
      if (v === "skyscraper_bivalue") {
        const a = h.digit || 0
        const b = h.otherDigit || 0
        if (step === 1) {
          const tag = h.allConjugate ? "·全共轭特例" : "·双强链"
          return `这里形成了 涡轮鱼（摩天楼${tag}）：四个关键格都只剩 {${a}, ${b}} 两个候选，因此链的两端必定一个填 ${a}、另一个填 ${b}。`
        }
        return `因此同时“看见”两端的格子里，候选 ${a} 与 ${b} 都可以排除。`
      }
      if (v === "empty_rectangle") {
        const b = h.boxIndex ?? -1
        const boxN = b >= 0 ? b + 1 : 0
        if (step === 1) {
          return `第一步：寻找结构。观察第 ${boxN} 宫里数字 ${h.digit} 的候选，它们集中在一行与一列上（空矩形）；同时观察宫外数字 ${h.digit} 的红色强链。`
        }
        return `第二步：交叉推导。红色强链会迫使空矩形沿另一条“臂”成立，因此交叉点处的候选 ${h.digit} 都可以排除。`
      }
      if (v === "skyscraper") {
        if (step === 1) {
          if (h.allConjugate)
            return `这里形成了 涡轮鱼（摩天楼形态·全共轭特例）：数字 ${h.digit} 的两条强链之间的连接也为强链，因此整条链为强链；链的两端必然有一个格子填 ${h.digit}。`
          return `这里形成了 涡轮鱼（摩天楼形态）：数字 ${h.digit} 由两条红色强链支撑，并通过一条蓝色弱链相连。因此链的两端必然有一个格子填 ${h.digit}。`
        }
        return `因此同时“看见”两端的格子里，候选 ${h.digit} 都可以排除。`
      }
      if (v === "two_string_kite") {
        if (step === 1)
          return `这里形成了 涡轮鱼（双强链形态）：数字 ${h.digit} 由两条红色强链支撑，并通过一条蓝色弱链相连。因此链的两端必然有一个格子填 ${h.digit}。`
        return `因此同时“看见”两端的格子里，候选 ${h.digit} 都可以排除。`
      }
      if (step === 1)
        return `这里形成了 涡轮鱼（Turbot Fish）：数字 ${h.digit} 由两条红色强链支撑，并通过一条蓝色弱链相连。因此链的两端必然有一个格子填 ${h.digit}。`
      return `因此同时“看见”两端的格子里，候选 ${h.digit} 都可以排除。`
    }
    if (h.tech === "three_strong_links") {
      const v = h.variant || ""
      if (step === 1) {
        if (v === "mutant") return `这里形成了 3 强链鱼（Mutant 3SL）：数字 ${h.digit} 由三条红色强链串联，并以蓝色弱链连接成推理链。`
        if (v === "mixed") return `这里形成了 3 强链鱼（Mixed 3SL）：数字 ${h.digit} 由三条红色强链串联，并以蓝色弱链连接成推理链。`
        return `这里形成了 3 强链鱼（3 Strong-linked Fishes）：数字 ${h.digit} 由三条红色强链串联，并以蓝色弱链连接成推理链。因此链的两端必然有一个格子填 ${h.digit}。`
      }
      return `因此同时“看见”两端的格子里，候选 ${h.digit} 都可以排除。`
    }
    if (h.tech === "four_strong_links" || h.tech === "five_strong_links" || h.tech === "six_strong_links") {
      const k =
        h.chainSize ||
        (h.tech === "four_strong_links"
          ? 4
          : h.tech === "five_strong_links"
            ? 5
            : h.tech === "six_strong_links"
              ? 6
              : 0)
      if (step === 1) {
        return `这里形成了 ${k} 强链鱼（${k} Strong-Linked Fishes）：数字 ${h.digit} 由 ${k} 条红色强链串联，并以蓝色弱链连接成推理链。`
      }
      return `因此同时“看见”两端的格子里，候选 ${h.digit} 都可以排除。`
    }
    if (h.tech === "seven_strong_links" || h.tech === "eight_strong_links") {
      const k = h.chainSize || (h.tech === "seven_strong_links" ? 7 : 8)
      if (step === 1) {
        return `这里形成了 ${k} 强链鱼（${k} Strong-Linked Fishes）：数字 ${h.digit} 由 ${k} 条红色强链串联，并以蓝色弱链连接成推理链。`
      }
      return `因此同时“看见”两端的格子里，候选 ${h.digit} 都可以排除。`
    }
    if (h.tech === "skyscraper_row" || h.tech === "skyscraper_col") {
      if (step === 1)
        return `这里形成了 摩天楼：数字 ${h.digit} 在两条线中各出现两次，并共享一个对齐点。因此链的两端必然有一个格子填 ${h.digit}。`
      return `因此同时“看见”两个端点的格子里，候选 ${h.digit} 都可以排除。`
    }
    if (h.tech === "two_string_kite") {
      if (step === 1)
        return `这里形成了 双强链（Two-String Kite）：数字 ${h.digit} 在一行与一列被强制锁定，并通过同一宫相连。因此链的两端必然有一个格子填 ${h.digit}。`
      return `因此同时“看见”两个端点的格子里，候选 ${h.digit} 都可以排除。`
    }
    if (h.tech === "wwing") {
      const a = h.wingAIdx ?? -1
      const b = h.wingBIdx ?? -1
      const ar = a >= 0 ? ((a / 9) | 0) + 1 : 0
      const ac = a >= 0 ? (a % 9) + 1 : 0
      const br = b >= 0 ? ((b / 9) | 0) + 1 : 0
      const bc = b >= 0 ? (b % 9) + 1 : 0
      const linkD = h.bridgeDigit || 0
      const elimD = h.digit || 0
      if (step === 1) {
        return `这里形成了 W-Wing：两翼（第 ${ar} 行第 ${ac} 列、 第 ${br} 行第 ${bc} 列）是相同数对 {${linkD}, ${elimD}}，并由数字 ${linkD} 的强链桥相连。因此链的两端必然有一个格子填 ${elimD}。`
      }
      return `因此同时“看见”两个端点的格子里，候选 ${elimD} 都可以排除。`
    }
    if (h.tech === "empty_rectangle") {
      const b = h.boxIndex ?? -1
      const boxN = b >= 0 ? b + 1 : 0
      if (step === 1) {
        return `第一步：寻找结构。观察第 ${boxN} 宫里数字 ${h.digit} 的候选，它们集中在一行与一列上（空矩形）；同时观察宫外数字 ${h.digit} 的红色强链。`
      }
      return `第二步：交叉推导。红色强链会迫使空矩形沿另一条“臂”成立，因此交叉点处的候选 ${h.digit} 都可以排除。`
    }
    if (h.tech === "xcycle") {
      const f = h.forcedIdx ?? -1
      const fs = h.forcedState || ""
      if (step === 1) return `第一步：寻找闭环。观察数字 ${h.digit} 构成的红蓝交替闭合环路。`
      if (f >= 0 && fs === "true") return `第二步：识别冲突。某处出现红-红相连，说明该节点必为 ${h.digit}，因此该格可以填 ${h.digit}。`
      if (f >= 0 && fs === "false") return `第二步：识别冲突。某处出现蓝-蓝相连，说明该节点必不为 ${h.digit}，因此该格的候选 ${h.digit} 可以排除。`
      return `第二步：结论推导。环上弱链两端共同“看见”的格子里，候选 ${h.digit} 都可以排除。`
    }
    if (h.tech === "xycycle") {
      if (step === 1) return `第一步：锁定双值环。金框格子都只剩两个候选，格与格通过相同数字首尾相连形成循环。`
      return `第二步：逻辑排除。环路会锁定某个数字的归属，因此它们共同覆盖区域内的候选 ${h.digit} 可以排除。`
    }
    if (h.tech === "xchain") {
      if (step === 1) return `观察数字 ${h.digit} 的强弱链：红强蓝弱；链端橙色，中间绿色。两端都指向“这里是 ${h.digit}”。`
      return `因此同时“看见”链条两端的格子中，候选 ${h.digit} 都可以排除。`
    }
    if (h.tech === "xyzwing") {
      if (step === 1) {
        return `第 1 步：锁定结构。棕色框是枢纽格，黄色框是叶子格；不论枢纽怎么选，这三个格子中必然有一个格子填 ${h.digit}。`
      }
      return `第 2 步：因此同时“看见”两个叶子格和一个枢纽格的格子里，候选 ${h.digit} 都可以被排除（红叉处可删）。`
    }
    if (h.tech === "xywing") {
      if (step === 1) {
        return `第 1 步：锁定结构。棕色框是枢纽格，黄色框是叶子格；因此两个叶子格中必然有一个格子填 ${h.digit}。`
      }
      return `第 2 步：因此同时“看见”两个叶子格和一个枢纽格的格子里，候选 ${h.digit} 都可以被排除（红叉处可删）。`
    }
    if (h.tech === "xwing_row" || h.tech === "xwing_col") {
      const vs = h.vertices || []
      if (vs.length === 4) {
        const rr = Array.from(new Set(vs.map((i) => ((i / 9) | 0)))).sort((a, b) => a - b)
        const cc = Array.from(new Set(vs.map((i) => i % 9))).sort((a, b) => a - b)
        if (step === 1) {
          if (h.tech === "xwing_row") {
            return `第 1 步：在第 ${rr[0] + 1} 行与第 ${rr[1] + 1} 行里，数字 ${h.digit} 都只有两个候选格；这四个候选格构成一个矩形 X-Wing。数字 ${h.digit} 的分布有两种情况（红蓝高亮）。`
          }
          return `第 1 步：在第 ${cc[0] + 1} 列与第 ${cc[1] + 1} 列里，数字 ${h.digit} 都只有两个候选格；这四个候选格构成一个矩形 X-Wing。数字 ${h.digit} 的分布有两种情况（红蓝高亮）。`
        }
        if (h.tech === "xwing_row") return `第 2 步：因此第 ${cc[0] + 1} 列和第 ${cc[1] + 1} 列的其他位置，候选 ${h.digit} 都可以被排除。`
        return `第 2 步：因此第 ${rr[0] + 1} 行和第 ${rr[1] + 1} 行的其他位置，候选 ${h.digit} 都可以被排除。`
      }
      if (step === 1) return `第 1 步：数字 ${h.digit} 必然在该矩形的任意两个对角格。`
      return `因此相关行/列的其他位置可以排除候选 ${h.digit}。`
    }
    if (h.tech === "swordfish_row" || h.tech === "swordfish_col") {
      const isRow = h.tech === "swordfish_row"
      const rows = h.rows ? h.rows.slice().sort((a, b) => a - b) : []
      const cols = h.cols ? h.cols.slice().sort((a, b) => a - b) : []
      const rStr = rows.map((r) => r + 1).join("、")
      const cStr = cols.map((c) => c + 1).join("、")
      
      if (step === 1) {
        const src = h.sourceCells || []
        if (src.length === 9 && rows.length === 3 && cols.length === 3) {
          const counts = isRow
            ? rows.map((r) => src.filter((i) => ((i / 9) | 0) === r).length)
            : cols.map((c) => src.filter((i) => (i % 9) === c).length)
          if (counts[0] === 3 && counts[1] === 3 && counts[2] === 3) {
            if (isRow)
              return `在第 ${rStr} 行里，数字 ${h.digit} 在同三列都有三个候选格；构成了一个矩形剑鱼结构。数字 ${h.digit} 必然同时分布在这三列与这三行中。`
            return `在第 ${cStr} 列里，数字 ${h.digit} 在同三行都有三个候选格；构成了一个矩形剑鱼结构。数字 ${h.digit} 必然同时分布在这三列与这三行中。`
          }
        }
        if (src.length === 6 && rows.length === 3 && cols.length === 3) {
          const counts = isRow
            ? rows.map((r) => src.filter((i) => ((i / 9) | 0) === r).length)
            : cols.map((c) => src.filter((i) => (i % 9) === c).length)
          if (counts[0] === 2 && counts[1] === 2 && counts[2] === 2) {
            const srcSet = new Set(src)
            const left = isRow ? rows : cols
            const right = isRow ? cols : rows
            const idxFor = (l, r) => (isRow ? l * 9 + r : r * 9 + l)
            const perms = [
              [0, 1, 2],
              [0, 2, 1],
              [1, 0, 2],
              [1, 2, 0],
              [2, 0, 1],
              [2, 1, 0],
            ]
            let matchCount = 0
            for (const p of perms) {
              let ok = true
              for (let i = 0; i < 3; i++) {
                const idx = idxFor(left[i], right[p[i]])
                if (!srcSet.has(idx)) {
                  ok = false
                  break
                }
              }
              if (ok) matchCount++
              if (matchCount > 2) break
            }
            if (matchCount === 2) {
              if (isRow)
                return `在第 ${rStr} 行里，数字 ${h.digit} 都只有两个候选格；这六个候选格构成一个矩形剑鱼结构。数字 ${h.digit} 有两种分布情况。`
              return `在第 ${cStr} 列里，数字 ${h.digit} 都只有两个候选格；这六个候选格构成一个矩形剑鱼结构。数字 ${h.digit} 有两种分布情况。`
            }
          }
        }
        if (isRow) {
          return `在第 ${rStr} 行中，数字 ${h.digit} 被锁定在一个剑鱼（Swordfish）结构中。`
        }
        return `在第 ${cStr} 列中，数字 ${h.digit} 被锁定在一个剑鱼（Swordfish）结构中。`
      }
      
      if (isRow) {
        return `因此，在第 ${cStr} 列的其他行，候选 ${h.digit} 都可以被排除。`
      }
      return `因此，在第 ${rStr} 行的其他列，候选 ${h.digit} 都可以被排除。`
    }
    if (h.tech === "jellyfish_row" || h.tech === "jellyfish_col") {
      if (step === 1) return `这里形成了 水母：数字 ${h.digit} 被限制在 4 行与 4 列的交叉范围内。`
      return `因此相关 4 列（或 4 行）的其他位置可以排除候选 ${h.digit}。`
    }
    return "暂无可用提示"
  }

  const renderHint = () => {
    if (!hintState || !hintState.hint) return
    if (activeState && activeState.selected >= 0) {
      lastSelectedIdx = activeState.selected
      activeState.selected = -1
      refreshHighlights()
      updatePad()
    }
    const h = hintState.hint
    const maxStep = hintStepCount(h)
    let step = hintState.step || 1
    if (step < 1) step = 1
    if (step > maxStep) step = maxStep
    if (hintState.step !== step) hintState.step = step
    const allowTrace = !!(activeState && (activeState.isDev || activeState.difficulty === "hard" || activeState.difficulty === "diabolical"))
    const hasTrace = !!(allowTrace && h.traceBranches && h.traceBranches.length)
    if (ui.btnHintTrace) ui.btnHintTrace.classList.toggle("hidden", !hasTrace)
    if (traceState && traceState.hint !== h) closeTraceDrawer()
    for (const el of cellEls) {
      const ns = el.querySelectorAll(".notes span.elim")
      for (const s of ns) s.classList.remove("elim")
      const ts = el.querySelectorAll(".notes span.hint-temp")
      for (const s of ts) {
        s.classList.remove("hint-temp")
        s.classList.remove("hint-temp-a")
        s.classList.remove("hint-temp-b")
        s.classList.remove("hint-temp-c")
        s.classList.remove("hint-temp-n")
        const digit = parseInt(s.getAttribute("data-n"), 10)
        const cellIdx = parseInt(el.getAttribute("data-idx"), 10)
        const m = (activeState && activeState.notes) ? activeState.notes[cellIdx] || 0 : 0
        if (!(m & (1 << (digit - 1)))) {
          s.classList.remove("on")
          s.textContent = ""
        }
      }
    }
    applyHintHighlight(h, step)
    if ((step === 1 || step === 2) && (h.tech === "xwing_row" || h.tech === "xwing_col")) {
      const vs = h.vertices || []
      const d = h.digit || 0
      if (d && vs.length === 4) {
        const pairA = [vs[0], vs[2]]
        const pairB = [vs[1], vs[3]]
        for (let k = 0; k < pairA.length; k++) {
          const idx = pairA[k]
          const s = cellEls[idx]?.querySelector(`.notes span[data-n="${d}"]`)
          if (s) {
            s.classList.add("hint-temp")
            s.classList.add("hint-temp-a")
            s.classList.add("on")
            s.textContent = String(d)
          }
        }
        for (let k = 0; k < pairB.length; k++) {
          const idx = pairB[k]
          const s = cellEls[idx]?.querySelector(`.notes span[data-n="${d}"]`)
          if (s) {
            s.classList.add("hint-temp")
            s.classList.add("hint-temp-b")
            s.classList.add("on")
            s.textContent = String(d)
          }
        }
      }
    }
    if ((step === 1 || step === 2) && (h.tech === "swordfish_row" || h.tech === "swordfish_col")) {
      const d = h.digit || 0
      const rows = h.rows || []
      const cols = h.cols || []
      const src = h.sourceCells || []
      if (d && rows.length === 3 && cols.length === 3 && src.length) {
        const isRow = h.tech.endsWith("_row")
        const left = isRow ? rows : cols
        const right = isRow ? cols : rows
        const idxFor = (l, r) => (isRow ? l * 9 + r : r * 9 + l)
        const srcSet = new Set(src)
        const perms = [
          [0, 1, 2],
          [0, 2, 1],
          [1, 0, 2],
          [1, 2, 0],
          [2, 0, 1],
          [2, 1, 0],
        ]
        const matchings = []
        for (const p of perms) {
          const cells = []
          let ok = true
          for (let i = 0; i < 3; i++) {
            const idx = idxFor(left[i], right[p[i]])
            if (!srcSet.has(idx)) {
              ok = false
              break
            }
            cells.push(idx)
          }
          if (ok) matchings.push(cells)
        }
        if (matchings.length === 2) {
          const mark = (idx, cls) => {
            const s = cellEls[idx]?.querySelector(`.notes span[data-n="${d}"]`)
            if (!s) return
            s.classList.add("hint-temp")
            s.classList.add(cls)
            s.classList.add("on")
            s.textContent = String(d)
          }
          const a = new Set(matchings[0])
          const b = new Set(matchings[1])
          const all = new Set([...a, ...b])
          for (const idx of all) {
            const cls = a.has(idx) && b.has(idx) ? "hint-temp-c" : a.has(idx) ? "hint-temp-a" : "hint-temp-b"
            mark(idx, cls)
          }
        }
      }
    }
    if ((step === 1 || step === 2) && h.tech === "xywing") {
      const pivot = h.pivotIdx ?? -1
      const wingA = h.wingAIdx ?? -1
      const wingB = h.wingBIdx ?? -1
      const cDigit = h.digit || 0
      if (pivot >= 0 && wingA >= 0 && wingB >= 0 && cDigit >= 1 && cDigit <= 9) {
        const legal = buildLegalCandidateMasks(activeState.grid, activeState.givens)
        const pm = legal[pivot] || 0
        const am = legal[wingA] || 0
        const bm = legal[wingB] || 0
        if (bitCount(pm) === 2 && bitCount(am) === 2 && bitCount(bm) === 2) {
          const aBit = am & pm
          const bBit = bm & pm
          if (bitCount(aBit) === 1 && bitCount(bBit) === 1) {
            const aDigit = digitFromSingleMask(aBit)
            const bDigit = digitFromSingleMask(bBit)

            const pBlue = cellEls[pivot]?.querySelector(`.notes span[data-n="${aDigit}"]`)
            if (pBlue) {
              pBlue.classList.add("hint-temp")
              pBlue.classList.add("hint-temp-b")
              pBlue.classList.add("on")
              pBlue.textContent = String(aDigit)
            }
            const wABlue = cellEls[wingA]?.querySelector(`.notes span[data-n="${cDigit}"]`)
            if (wABlue) {
              wABlue.classList.add("hint-temp")
              wABlue.classList.add("hint-temp-b")
              wABlue.classList.add("on")
              wABlue.textContent = String(cDigit)
            }

            const pRed = cellEls[pivot]?.querySelector(`.notes span[data-n="${bDigit}"]`)
            if (pRed) {
              pRed.classList.add("hint-temp")
              pRed.classList.add("hint-temp-a")
              pRed.classList.add("on")
              pRed.textContent = String(bDigit)
            }
            const wBRed = cellEls[wingB]?.querySelector(`.notes span[data-n="${cDigit}"]`)
            if (wBRed) {
              wBRed.classList.add("hint-temp")
              wBRed.classList.add("hint-temp-a")
              wBRed.classList.add("on")
              wBRed.textContent = String(cDigit)
            }
          }
        }
      }
    }
    if ((step === 1 || step === 2) && h.tech === "xyzwing") {
      const pivot = h.pivotIdx ?? -1
      const wingA = h.wingAIdx ?? -1
      const wingB = h.wingBIdx ?? -1
      const cDigit = h.digit || 0
      if (pivot >= 0 && wingA >= 0 && wingB >= 0 && cDigit >= 1 && cDigit <= 9) {
        const legal = buildLegalCandidateMasks(activeState.grid, activeState.givens)
        const pm = legal[pivot] || 0
        const am = legal[wingA] || 0
        const bm = legal[wingB] || 0
        const cBit = 1 << (cDigit - 1)
        if ((pm & cBit) && (am & cBit) && (bm & cBit) && bitCount(pm) === 3 && bitCount(am) === 2 && bitCount(bm) === 2) {
          const aBit = am ^ cBit
          const bBit = bm ^ cBit
          if (bitCount(aBit) === 1 && bitCount(bBit) === 1) {
            const aDigit = digitFromSingleMask(aBit)
            const bDigit = digitFromSingleMask(bBit)

            const pBlue = cellEls[pivot]?.querySelector(`.notes span[data-n="${aDigit}"]`)
            if (pBlue) {
              pBlue.classList.add("hint-temp")
              pBlue.classList.add("hint-temp-b")
              pBlue.classList.add("on")
              pBlue.textContent = String(aDigit)
            }
            const wABlue = cellEls[wingA]?.querySelector(`.notes span[data-n="${cDigit}"]`)
            if (wABlue) {
              wABlue.classList.add("hint-temp")
              wABlue.classList.add("hint-temp-b")
              wABlue.classList.add("on")
              wABlue.textContent = String(cDigit)
            }

            const pRed = cellEls[pivot]?.querySelector(`.notes span[data-n="${bDigit}"]`)
            if (pRed) {
              pRed.classList.add("hint-temp")
              pRed.classList.add("hint-temp-a")
              pRed.classList.add("on")
              pRed.textContent = String(bDigit)
            }
            const wBRed = cellEls[wingB]?.querySelector(`.notes span[data-n="${cDigit}"]`)
            if (wBRed) {
              wBRed.classList.add("hint-temp")
              wBRed.classList.add("hint-temp-a")
              wBRed.classList.add("on")
              wBRed.textContent = String(cDigit)
            }

            const pGreen = cellEls[pivot]?.querySelector(`.notes span[data-n="${cDigit}"]`)
            if (pGreen) {
              pGreen.classList.add("hint-temp")
              pGreen.classList.add("hint-temp-c")
              pGreen.classList.add("on")
              pGreen.textContent = String(cDigit)
            }
          }
        }
      }
    }
    if ((h.tech === "wxyzwing" || h.tech === "vwxyzwing") && (step === 1 || step === 2 || step === 3 || step === 4)) {
      const legal = buildLegalCandidateMasks(activeState.grid, activeState.givens)
      const xBit = h.xBit || 0
      const x = xBit ? (Math.log2(xBit) | 0) + 1 : 0
      const zBit = h.zBit || 0
      const z = zBit ? (Math.log2(zBit) | 0) + 1 : 0
      const unionMask = h.tech === "wxyzwing" ? (h.interMask || 0) : (h.unionMask || 0)
      const pivot = h.tech === "wxyzwing" ? (h.wxyzIdx ?? -1) : (h.vwxyzIdx ?? -1)
      const yz = h.yzIdx ?? -1
      const src = h.sourceCells || []
      const mark = (idx, digit, cls) => {
        const s = cellEls[idx]?.querySelector(`.notes span[data-n="${digit}"]`)
        if (!s) return
        s.classList.add("hint-temp")
        s.classList.add(cls)
        s.classList.add("on")
        s.textContent = String(digit)
      }
      const markExisting = (idx, digit, cls) => {
        if (!activeState.notes) return
        const cm = activeState.notes[idx] || 0
        if (!(cm & (1 << (digit - 1)))) return
        const s = cellEls[idx]?.querySelector(`.notes span[data-n="${digit}"]`)
        if (!s) return
        s.classList.add("hint-temp")
        s.classList.add(cls)
      }
      if (unionMask) {
        if (step === 1) {
          for (const idx of src) {
            if (idx < 0) continue
            if (activeState.givens[idx]) continue
            if (activeState.grid[idx] !== 0) continue
            let m = unionMask
            while (m) {
              const bit = m & -m
              m ^= bit
              const d = (Math.log2(bit) | 0) + 1
              markExisting(idx, d, "hint-temp-n")
            }
          }
        }
      }
      if (z && yz >= 0) {
        if (step === 2) {
          mark(yz, z, "hint-temp-a")
        } else if (step === 3) {
          mark(yz, z, "hint-temp-b")
          if (x && x >= 1 && x <= 9) markExisting(yz, x, "hint-temp-n")
          const otherMask = unionMask & ~zBit
          if (otherMask) {
            for (const idx of src) {
              if (idx < 0) continue
              if (idx === yz) continue
              if (activeState.givens[idx]) continue
              if (activeState.grid[idx] !== 0) continue
              let m = otherMask
              while (m) {
                const bit = m & -m
                m ^= bit
                const d = (Math.log2(bit) | 0) + 1
                markExisting(idx, d, "hint-temp-n")
              }
            }
          }
          for (const idx of src) {
            if (idx < 0) continue
            if (idx === yz) continue
            if (activeState.givens[idx]) continue
            if (activeState.grid[idx] !== 0) continue
            const m = legal[idx] || 0
            if (m & zBit) mark(idx, z, "hint-temp-a")
          }
        } else if (step === 4) {
          mark(yz, z, "hint-temp-a")
          for (const idx of src) {
            if (idx < 0) continue
            if (activeState.givens[idx]) continue
            if (activeState.grid[idx] !== 0) continue
            const m = legal[idx] || 0
            if (m & zBit) mark(idx, z, "hint-temp-a")
          }
        }
      }
    }
    ui.hintBadge.textContent = hintBadgeText(h)
    ui.hintBadge.classList.remove("diff-intro", "diff-easy", "diff-medium", "diff-hard", "diff-extreme")
    ui.hintBadge.classList.add("diff-" + hintDifficultyKey(h))
    ui.hintMessage.textContent = hintMessageText(h, step).replace(/^(?:第\s*[1-4]\s*步|第[一二三四]步|第一步|第二步|第三步|第四步)\s*[：:]\s*/u, "")
    if (ui.btnHintPrev) {
      ui.btnHintPrev.textContent = "上一步"
      ui.btnHintPrev.classList.toggle("hidden", step <= 1)
    }
    ui.btnHintNext.textContent = "下一步"
    ui.btnHintNext.classList.toggle("hidden", step >= maxStep)
    ui.btnHintApply.classList.toggle("hidden", step !== maxStep)
    let hasAnyNotes = false
    if (activeState && activeState.notes) {
      for (let i = 0; i < 81; i++) {
        if (activeState.notes[i]) {
          hasAnyNotes = true
          break
        }
      }
    }
    if (h.type === "action")
      ui.btnHintApply.textContent =
        h.action === "auto_notes"
          ? "一键笔记"
          : h.action === "fill_notes"
            ? "补全笔记"
            : "笔记"
    else ui.btnHintApply.textContent = h.type === "eliminate" ? (hasAnyNotes ? "排除" : "知道了") : "填入"
    ui.btnHintApply.disabled = false
    if (step === maxStep && h.type === "eliminate") {
      const cands = activeState.notes || new Uint16Array(81)
      const elimEntries = []
      if (h.elimList && h.elimList.length) {
        for (const e of h.elimList) {
          const cm = cands[e.idx] || 0
          const m = (e.mask || 0) & cm
          if (m) elimEntries.push({ idx: e.idx, mask: m })
        }
      } else {
        for (const i of h.targetCells || []) {
          const cm = cands[i] || 0
          const m = (h.elimMask || 0) & cm
          if (m) elimEntries.push({ idx: i, mask: m })
        }
      }
      for (const e of elimEntries) {
        let m = e.mask
        while (m) {
          const bit = m & -m
          m ^= bit
          const d = (Math.log2(bit) | 0) + 1
          const s = cellEls[e.idx].querySelector(`.notes span[data-n="${d}"]`)
          if (s) {
            s.classList.add("elim")
          }
        }
      }
    }
    ui.hintPanel.classList.remove("hidden")
    if (hasTrace && !settings.traceDrawerAutoOpened) {
      settings.traceDrawerAutoOpened = true
      saveSettings(settings)
      openTraceForHint(h)
    }
  }

  const openNextHint = () => {
    const h = findHint()
    if (!h) {
      toast("暂无可用提示")
      clearHint()
      return
    }
    hintState = { hint: h, step: 1 }
    renderHint()
  }

  const advanceHint = () => {
    if (!hintState) {
      openNextHint()
      return
    }
    const maxStep = hintStepCount(hintState.hint)
    const step = hintState.step || 1
    if (step < maxStep) {
      hintState.step = step + 1
      renderHint()
    }
  }

  const toggleHintStep = () => {
    if (!hintState) {
      openNextHint()
      return
    }
    const maxStep = hintStepCount(hintState.hint)
    const step = hintState.step || 1
    hintState.step = step > 1 ? step - 1 : Math.min(maxStep, step + 1)
    renderHint()
  }

  const persistActive = () => {
    if (!activeState) return
    if (activeState.isDev) return
    if (activeState.tracePreview) return
    const notesStr = Array.from(activeState.notes).map(base36Pad2).join("")
    const shadowStr = Array.from(activeState.shadowNotes || new Uint16Array(81)).map(base36Pad2).join("")
    const undoStr = activeState.undo
      .slice(-80)
      .map((u) => [u.idx, u.pv, u.nv, u.pn, u.nn, u.pe, u.ne, u.ps || 0, u.ns || 0].map((x) => base36Pad2(x)).join(""))
      .join("")
    const a = {
      difficulty: activeState.difficulty,
      levelIndex: activeState.levelIndex,
      puzzle: activeState.puzzle,
      solution: activeState.solution,
      grid: digitsToString(activeState.grid),
      givens: digitsToString(activeState.givens),
      notes: notesStr,
      shadow: shadowStr,
      undo: undoStr,
      noteMode: !!activeState.noteMode,
      lockedDigit: activeState.lockedDigit || 0,
      elapsedMs: activeState.elapsedMs || 0,
      paused: !!activeState.paused,
      savedAt: Date.now(),
    }
    setActive(activeState.difficulty, activeState.levelIndex, a)
    saveLastActiveKey(gameKey(activeState.difficulty, activeState.levelIndex))
  }

  const restoreActiveState = (a) => {
    const grid = digitsFromString(a.grid)
    const givens = digitsFromString(a.givens)
    const notes = new Uint16Array(81)
    for (let i = 0; i < 81; i++) notes[i] = fromBase36(a.notes.slice(i * 2, i * 2 + 2))
    const shadowNotes = new Uint16Array(81)
    if (a.shadow && typeof a.shadow === "string" && a.shadow.length >= 162) {
      for (let i = 0; i < 81; i++) shadowNotes[i] = fromBase36(a.shadow.slice(i * 2, i * 2 + 2))
    } else {
      const legal = buildLegalCandidateMasks(grid, givens)
      for (let i = 0; i < 81; i++) shadowNotes[i] = legal[i] || 0
    }
    const errors = new Uint8Array(81)
    if (a.solution) {
      for (let i = 0; i < 81; i++) {
        if (givens[i]) continue
        const v = grid[i]
        if (!v) continue
        const sol = a.solution.charCodeAt(i) - 48
        if (v !== sol) errors[i] = 1
      }
    }
    const conflicts = recomputeAllConflicts(grid)
    const undo = []
    const u = a.undo || ""
    const recLen = u.length % 18 === 0 ? 18 : 14
    const fields = recLen === 18 ? 9 : 7
    for (let off = 0; off + recLen <= u.length; off += recLen) {
      const chunk = u.slice(off, off + recLen)
      const parts = []
      for (let i = 0; i < fields; i++) parts.push(fromBase36(chunk.slice(i * 2, i * 2 + 2)))
      if (fields === 9) {
        undo.push({
          idx: parts[0],
          pv: parts[1],
          nv: parts[2],
          pn: parts[3],
          nn: parts[4],
          pe: parts[5],
          ne: parts[6],
          ps: parts[7],
          ns: parts[8],
        })
      } else {
        undo.push({
          idx: parts[0],
          pv: parts[1],
          nv: parts[2],
          pn: parts[3],
          nn: parts[4],
          pe: parts[5],
          ne: parts[6],
          ps: parts[3],
          ns: parts[4],
        })
      }
    }
    activeState = {
      difficulty: a.difficulty,
      levelIndex: a.levelIndex,
      puzzle: a.puzzle,
      solution: a.solution,
      grid,
      givens,
      notes,
      shadowNotes,
      errors,
      conflicts,
      undo,
      noteMode: !!a.noteMode,
      bulkEraseNotes: false,
      lockedDigit: a.lockedDigit || 0,
      uniqueDigitToShow: 0,
      selected: -1,
      paused: !!a.paused,
      elapsedMs: a.elapsedMs || 0,
      startedAtMs: Date.now(),
      isDev: !!a.isDev,
      suppressNotesPrompt: !!a.suppressNotesPrompt,
    }
    ui.gameDifficulty.textContent = activeState.isDev
      ? "开发盘面"
      : DIFF_LABEL[activeState.difficulty] + ` · 第 ${activeState.levelIndex + 1} 关`
    ui.gameTimer.textContent = formatTime(activeState.elapsedMs)
    ui.pauseOverlay.classList.toggle("hidden", !activeState.paused)
    renderBoard()
    updatePad()
    updateActions()
  }

  const startDevGame = (gridStr, { asGivens, autoNotes }) => {
    const raw = String(gridStr || "")
      .trim()
      .replace(/\s+/g, "")
      .replace(/[.]/g, "0")
    if (raw.length !== 81) {
      toast("盘面长度必须为 81")
      return false
    }
    const grid = new Uint8Array(81)
    for (let i = 0; i < 81; i++) {
      const ch = raw.charCodeAt(i)
      const v = ch - 48
      if (v < 0 || v > 9) {
        toast("盘面只能包含 0-9 或 .")
        return false
      }
      grid[i] = v
    }
    const givens = new Uint8Array(81)
    if (asGivens) {
      for (let i = 0; i < 81; i++) givens[i] = grid[i] ? 1 : 0
    }
    const legal = buildLegalCandidateMasks(grid, givens)
    const notes = autoNotes ? legal : new Uint16Array(81)
    const shadowNotes = new Uint16Array(81)
    for (let i = 0; i < 81; i++) shadowNotes[i] = legal[i] || 0
    const errors = new Uint8Array(81)
    const conflicts = recomputeAllConflicts(grid)
    activeState = {
      difficulty: "dev",
      levelIndex: 0,
      puzzle: raw,
      solution: "",
      grid,
      givens,
      notes,
      shadowNotes,
      errors,
      conflicts,
      undo: [],
      noteMode: !!autoNotes,
      bulkEraseNotes: false,
      lockedDigit: 0,
      uniqueDigitToShow: 0,
      selected: -1,
      paused: false,
      elapsedMs: 0,
      startedAtMs: Date.now(),
      isDev: true,
      suppressNotesPrompt: true,
    }
    ui.gameDifficulty.textContent = "开发盘面"
    ui.gameTimer.textContent = formatTime(0)
    ui.pauseOverlay.classList.add("hidden")
    renderBoard()
    updatePad()
    updateActions()
    return true
  }

  const startNewGame = (diff, idx) => {
    const puzzle = getPuzzle(diff, idx)
    if (!puzzle) {
      toast("关卡数据缺失")
      return
    }
    const solution = solveSudoku(puzzle)
    if (!solution) {
      toast("该关卡求解失败")
      return
    }
    const givens = digitsFromString(puzzle)
    const grid = digitsFromString(puzzle)
    const notes = new Uint16Array(81)
    const shadowNotes = buildLegalCandidateMasks(grid, givens)
    const errors = new Uint8Array(81)
    const conflicts = recomputeAllConflicts(grid)
    for (let i = 0; i < 81; i++) givens[i] = givens[i] ? 1 : 0
    activeState = {
      difficulty: diff,
      levelIndex: idx,
      puzzle,
      solution,
      grid,
      givens,
      notes,
      shadowNotes,
      errors,
      conflicts,
      undo: [],
      noteMode: false,
      bulkEraseNotes: false,
      lockedDigit: 0,
      uniqueDigitToShow: 0,
      selected: -1,
      paused: false,
      elapsedMs: 0,
      startedAtMs: Date.now(),
    }
    ui.gameDifficulty.textContent = DIFF_LABEL[diff] + ` · 第 ${idx + 1} 关`
    ui.gameTimer.textContent = "00:00"
    ui.pauseOverlay.classList.add("hidden")
    renderBoard()
    persistActive()
  }

  const startOrResumeGame = (diff, idx) => {
    const a = getActive(diff, idx)
    if (a) {
      const next = { ...a, paused: true, savedAt: Date.now() }
      setActive(diff, idx, next)
      restoreActiveState(next)
    }
    else startNewGame(diff, idx)
    showGameScreen()
  }

  const restartCurrent = () => {
    if (!activeState) return
    clearHint()
    const diff = activeState.difficulty
    const idx = activeState.levelIndex
    setActive(diff, idx, null)
    startNewGame(diff, idx)
    activeState.paused = false
    ui.pauseOverlay.classList.add("hidden")
    startTimer()
  }

  const stopTimer = () => {
    if (timerHandle) clearInterval(timerHandle)
    timerHandle = 0
  }

  const startTimer = () => {
    stopTimer()
    timerHandle = setInterval(() => {
      if (!activeState) return
      if (activeState.paused) return
      const now = Date.now()
      const delta = now - activeState.startedAtMs
      activeState.startedAtMs = now
      activeState.elapsedMs += delta
      ui.gameTimer.textContent = formatTime(activeState.elapsedMs)
      if ((now / 1000) % 2 < 0.26) persistActive()
    }, 250)
  }

  const setPaused = (paused) => {
    if (!activeState) return
    activeState.paused = paused
    ui.pauseOverlay.classList.toggle("hidden", !paused)
    persistActive()
  }

  const exitGame = () => {
    showLevelsScreen()
  }

  const onSolved = () => {
    if (!activeState) return
    stopTimer()
    if (activeState.isDev) {
      ui.gameDifficulty.textContent = "开发盘面：已完成"
      toast("开发盘面完成（不计入存档）")
      activeState.paused = true
      return
    }
    const diff = activeState.difficulty
    const idx = activeState.levelIndex
    const ms = Math.max(0, Math.floor(activeState.elapsedMs))
    const old = progress[diff][idx]
    const bestMs = old ? Math.min(old.bestMs || old.ms || ms, ms) : ms
    progress[diff][idx] = { bestMs, completedAt: Date.now() }
    saveProgress(progress)
    setActive(diff, idx, null)
    if (settings.sound) sound.win()
    ui.gameDifficulty.textContent = `已完成：用时 ${formatTime(ms)}`
    currentDiff = diff || currentDiff
    levelsMode = "levels"
    currentChapter = Math.floor((idx || 0) / chapterSize)
    focusLevel = idx || 0
    activeState = null
    toast("通关！已记录用时")
  }

  const wireUI = () => {
    ui.levelsScroll.addEventListener("scroll", () => updateLevelViewport())
    window.addEventListener("resize", () => {
      if (!ui.screenLevels.classList.contains("hidden")) renderLevels()
    })
    ui.btnBack.addEventListener("click", showLevelsScreen)
    ui.btnHome.addEventListener("click", showHomeScreen)
    ui.btnLevelsBack.addEventListener("click", () => {
      if (levelsMode === "levels") {
        levelsMode = "chapters"
        focusLevel = -1
        ui.levelsScroll.scrollTop = 0
        updateLevelsHeader()
        renderLevels()
        return
      }
      showHomeScreen()
    })
    ui.btnPause.addEventListener("click", () => setPaused(true))
    ui.btnResume.addEventListener("click", () => setPaused(false))
    ui.btnRestart.addEventListener("click", () => restartCurrent())
    ui.btnPauseSettings.addEventListener("click", () => openSettings())
    ui.btnExit.addEventListener("click", exitGame)
    ui.btnUndo.addEventListener("click", () => {
      if (!activeState || activeState.paused) return
      if (manualPreview) {
        stopManualPreview()
        return
      }
      if (activeState.noteMode) startManualPreview()
      else undo()
    })
    ui.btnErase.addEventListener("click", eraseSelected)
    ui.btnHint.addEventListener("click", () => {
      if (!activeState) return
      const allowAutoNotes = activeState.difficulty === "hard" || activeState.difficulty === "diabolical" || activeState.difficulty === "dev"
      if (activeState.noteMode && allowAutoNotes) {
        clearHint()
        autoNotes()
        return
      }
      if (hintState && hintState.hint && hintState.step === hintStepCount(hintState.hint)) openNextHint()
      else advanceHint()
    })
    if (ui.btnHintTrace)
      ui.btnHintTrace.addEventListener("click", () => {
        if (!activeState) return
        if (!activeState.isDev && activeState.difficulty !== "hard" && activeState.difficulty !== "diabolical") {
          toast("推演模式仅在困难/极限可用")
          return
        }
        openTraceForHint(hintState?.hint || null)
      })

    const triggerHint = () => {
      if (!activeState) return
      const allowAutoNotes = activeState.difficulty === "hard" || activeState.difficulty === "diabolical" || activeState.difficulty === "dev"
      if (activeState.noteMode && allowAutoNotes) {
        clearHint()
        autoNotes()
        return
      }
      if (hintState && hintState.hint && hintState.step === hintStepCount(hintState.hint)) openNextHint()
      else advanceHint()
    }

    const hintPrev = () => {
      if (!hintState || !hintState.hint) return
      const step = hintState.step || 1
      if (step > 1) {
        hintState.step = step - 1
        renderHint()
        return
      }
      clearHint()
    }

    const hintNextOrApply = () => {
      if (!hintState || !hintState.hint) return
      const maxStep = hintStepCount(hintState.hint)
      const step = hintState.step || 1
      if (step < maxStep) {
        hintState.step = step + 1
        renderHint()
        return
      }
      if (ui.btnHintApply && !ui.btnHintApply.classList.contains("hidden") && !ui.btnHintApply.disabled) {
        ui.btnHintApply.click()
        return
      }
      openNextHint()
    }

    let kbFocusEl = null
    let kbNavActive = false
    const setKbFocus = (el) => {
      if (kbFocusEl && kbFocusEl !== el) {
        kbFocusEl.classList.remove("kb-focus")
        if (kbFocusEl.classList.contains("level-tile")) kbFocusEl.classList.remove("focus")
      }
      kbFocusEl = el || null
      if (kbFocusEl) {
        if (kbFocusEl.classList.contains("level-tile")) {
          kbFocusEl.classList.add("focus")
          if (levelsMode === "levels") {
            const local = Number(kbFocusEl.dataset.index || -1)
            if (Number.isFinite(local) && local >= 0) focusLevel = currentChapter * chapterSize + local
          }
        } else {
          kbFocusEl.classList.add("kb-focus")
        }
      }
    }
    const clearKbFocus = () => setKbFocus(null)

    window.addEventListener(
      "pointerdown",
      () => {
        kbNavActive = false
        clearKbFocus()
      },
      true
    )

    const isVisibleEl = (el) => !!(el && el.getClientRects && el.getClientRects().length)
    const collectButtons = (root) => {
      if (!root) return []
      const els = Array.from(root.querySelectorAll("button, [data-kb-toggle]"))
      return els.filter((el) => {
        if (!isVisibleEl(el)) return false
        if (el.classList && el.classList.contains("hidden")) return false
        if ("disabled" in el && el.disabled) return false
        if (el.getAttribute && el.getAttribute("aria-disabled") === "true") return false
        return true
      })
    }

    const moveFocusSpatial = (root, dirX, dirY) => {
      const els = collectButtons(root)
      if (!els.length) return
      const cur = document.activeElement
      let from = cur && cur.tagName === "BUTTON" && root.contains(cur) ? cur : kbFocusEl && root.contains(kbFocusEl) ? kbFocusEl : null
      if (!from) {
        const focusedTile = root.querySelector("button.level-tile.focus")
        if (focusedTile && els.includes(focusedTile)) from = focusedTile
      }
      if (!from || !els.includes(from)) {
        els[0].focus()
        setKbFocus(els[0])
        return
      }
      const rc = from.getBoundingClientRect()
      const cx = (rc.left + rc.right) / 2
      const cy = (rc.top + rc.bottom) / 2
      let best = null
      let bestScore = Infinity
      for (const el of els) {
        if (el === from) continue
        const r = el.getBoundingClientRect()
        const ex = (r.left + r.right) / 2
        const ey = (r.top + r.bottom) / 2
        const dx = ex - cx
        const dy = ey - cy
        const proj = dirX * dx + dirY * dy
        if (proj <= 2) continue
        const perp = Math.abs(dirX * dy - dirY * dx)
        const score = perp * 2.2 + proj
        if (score < bestScore) {
          bestScore = score
          best = el
        }
      }
      if (best) {
        if (best.classList.contains("level-tile")) {
          const prevFocus = root.querySelector("button.level-tile.focus")
          if (prevFocus && prevFocus !== best) prevFocus.classList.remove("focus")
        }
        best.focus()
        setKbFocus(best)
      }
    }

    const tracePrev = () => {
      if (!traceState) return
      traceState.stepIndex = Math.max(0, traceState.stepIndex - 1)
      renderTraceDrawer()
    }

    const traceNext = () => {
      if (!traceState) return
      const tl = traceState.hint?.traceBranches?.[traceState.branchIndex]?.timeline || []
      traceState.stepIndex = Math.min(Math.max(0, tl.length - 1), traceState.stepIndex + 1)
      renderTraceDrawer()
    }

    const traceEndOrExit = () => {
      if (!traceState) return
      const tl = traceState.hint?.traceBranches?.[traceState.branchIndex]?.timeline || []
      const endIdx = Math.max(0, tl.length - 1)
      if (traceState.stepIndex >= endIdx) closeTraceDrawer()
      else {
        traceState.stepIndex = endIdx
        renderTraceDrawer()
      }
    }

    window.addEventListener("keydown", (e) => {
      if (e.defaultPrevented) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target
      if (t && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return
      const kb = settings.keybinds || {}
      const upK = kb.up || "KeyW"
      const up2K = kb.up2 || "ArrowUp"
      const downK = kb.down || "KeyS"
      const down2K = kb.down2 || "ArrowDown"
      const leftK = kb.left || "KeyA"
      const left2K = kb.left2 || "ArrowLeft"
      const rightK = kb.right || "KeyD"
      const right2K = kb.right2 || "ArrowRight"
      const lockK = kb.lock || "KeyF"

      if (ui.traceDrawer && !ui.traceDrawer.classList.contains("hidden")) {
        if (e.key === "Escape") {
          closeTraceDrawer()
          e.preventDefault()
          return
        }
        if (e.code === upK || e.code === leftK || e.code === up2K || e.code === left2K) {
          tracePrev()
          e.preventDefault()
          return
        }
        if (e.code === downK || e.code === rightK || e.code === down2K || e.code === right2K) {
          traceNext()
          e.preventDefault()
          return
        }
        if (e.code === lockK) {
          traceEndOrExit()
          e.preventDefault()
          return
        }
        return
      }

      const navDir =
        e.code === upK || e.code === up2K
          ? { x: 0, y: -1 }
          : e.code === downK || e.code === down2K
            ? { x: 0, y: 1 }
            : e.code === leftK || e.code === left2K
              ? { x: -1, y: 0 }
              : e.code === rightK || e.code === right2K
                ? { x: 1, y: 0 }
                : null
      if (navDir) {
        const inSettings = ui.settingsModal && !ui.settingsModal.classList.contains("hidden")
        const inPause = ui.pauseOverlay && !ui.pauseOverlay.classList.contains("hidden")
        const inLevels = ui.screenLevels && !ui.screenLevels.classList.contains("hidden")
        const inHome = ui.screenHome && !ui.screenHome.classList.contains("hidden")
        const root = inSettings
          ? ui.settingsModal
          : inPause
            ? ui.pauseOverlay
          : inLevels
            ? ui.screenLevels.querySelector(".levels") || ui.screenLevels
            : inHome
              ? ui.screenHome.querySelector(".home-buttons") || ui.screenHome
              : null
        if (root) {
          kbNavActive = true
          moveFocusSpatial(root, navDir.x, navDir.y)
          e.preventDefault()
          return
        }
      }

      if (e.code === "KeyE" || e.key === "e" || e.key === "E") {
        const inSettings = ui.settingsModal && !ui.settingsModal.classList.contains("hidden")
        const inPause = ui.pauseOverlay && !ui.pauseOverlay.classList.contains("hidden")
        const inLevels = ui.screenLevels && !ui.screenLevels.classList.contains("hidden")
        const inHome = ui.screenHome && !ui.screenHome.classList.contains("hidden")
        const root = inSettings
          ? ui.settingsModal
          : inPause
            ? ui.pauseOverlay
          : inLevels
            ? ui.screenLevels.querySelector(".levels") || ui.screenLevels
            : inHome
              ? ui.screenHome.querySelector(".home-buttons") || ui.screenHome
              : null
        if (root) {
          const cur = document.activeElement
          const btn = cur && cur.tagName === "BUTTON" && root.contains(cur) ? cur : kbFocusEl && root.contains(kbFocusEl) ? kbFocusEl : null
          if (btn && !btn.disabled) btn.click()
          clearKbFocus()
          kbNavActive = false
          e.preventDefault()
          return
        }
      }

      if (e.key === "Escape") {
        if (ui.devtoolsModal && !ui.devtoolsModal.classList.contains("hidden")) {
          closeDevtools()
          e.preventDefault()
          return
        }
        if (ui.archiveModal && !ui.archiveModal.classList.contains("hidden")) {
          closeArchive()
          e.preventDefault()
          return
        }
        if (ui.settingsModal && !ui.settingsModal.classList.contains("hidden")) {
          if (settingsPage !== "main") setSettingsPage("main")
          else closeSettings()
          e.preventDefault()
          return
        }
        if (hintState && ui.hintPanel && !ui.hintPanel.classList.contains("hidden")) {
          hintPrev()
          e.preventDefault()
          return
        }
        if (ui.screenLevels && !ui.screenLevels.classList.contains("hidden")) {
          if (ui.btnLevelsBack) ui.btnLevelsBack.click()
          e.preventDefault()
          return
        }
        if (activeState) {
          setPaused(!activeState.paused)
          e.preventDefault()
        }
        return
      }

      if (e.code === lockK) {
        if (hintState && ui.hintPanel && !ui.hintPanel.classList.contains("hidden")) {
          hintNextOrApply()
          e.preventDefault()
          return
        }
        if (activeState && !activeState.paused) {
          triggerHint()
          e.preventDefault()
        }
      }
    })

    if (ui.traceBackdrop) ui.traceBackdrop.addEventListener("click", closeTraceDrawer)
    if (ui.btnTraceClose) ui.btnTraceClose.addEventListener("click", closeTraceDrawer)
    if (ui.traceBranch) {
      ui.traceBranch.addEventListener("change", () => {
        if (!traceState) return
        traceState.branchIndex = clamp(Number(ui.traceBranch.value), 0, (traceState.hint?.traceBranches?.length || 1) - 1)
        traceState.stepIndex = 0
        resetTracePreviewToBase()
        const br = traceState.hint?.traceBranches?.[traceState.branchIndex] || null
        traceState.frames = computeTraceFrames(br?.timeline || [], tracePrev?.grid || null, tracePrev?.notes || null)
        renderTraceDrawer()
      })
    }
    if (ui.btnTracePrev) ui.btnTracePrev.addEventListener("click", () => (traceState ? ((traceState.stepIndex = Math.max(0, traceState.stepIndex - 1)), renderTraceDrawer()) : 0))
    if (ui.btnTraceNext)
      ui.btnTraceNext.addEventListener("click", () =>
        traceState ? ((traceState.stepIndex = Math.min((traceState.hint?.traceBranches?.[traceState.branchIndex]?.timeline?.length || 1) - 1, traceState.stepIndex + 1)), renderTraceDrawer()) : 0
      )
    if (ui.btnTraceEnd)
      ui.btnTraceEnd.addEventListener("click", () => {
        traceEndOrExit()
      })

    if (ui.btnPreviewUndo) ui.btnPreviewUndo.addEventListener("click", undoManualPreviewStep)
    if (ui.btnPreviewApply) ui.btnPreviewApply.addEventListener("click", applyManualPreview)

    const traceHandle = ui.traceDrawer ? ui.traceDrawer.querySelector(".drawer-handle") : null
    if (traceHandle) {
      traceHandle.addEventListener("pointerdown", (e) => {
        if (!ui.traceDrawer) return
        if (e.button !== undefined && e.button !== 0) return
        e.preventDefault()
        const rect = ui.traceDrawer.getBoundingClientRect()
        traceDrag = { startY: e.clientY, startH: rect.height }
        try {
          traceHandle.setPointerCapture(e.pointerId)
        } catch {}
      })
      traceHandle.addEventListener("pointermove", (e) => {
        if (!traceDrag || !ui.traceDrawer) return
        e.preventDefault()
        const dy = e.clientY - traceDrag.startY
        setTraceDrawerHeight(traceDrag.startH - dy)
      })
      const end = () => {
        traceDrag = null
      }
      traceHandle.addEventListener("pointerup", end)
      traceHandle.addEventListener("pointercancel", end)
    }
    ui.btnNote.addEventListener("click", () => {
      if (!activeState) return
      if (manualPreview) stopManualPreview()
      clearHint()
      activeState.bulkEraseNotes = false
      activeState.noteMode = !activeState.noteMode
      updateActions()
      renderBoard()
      persistActive()
    })

    ui.btnHintClose.addEventListener("click", clearHint)
    if (ui.btnHintPrev) ui.btnHintPrev.addEventListener("click", hintPrev)
    ui.btnHintNext.addEventListener("click", hintNextOrApply)
    ui.btnHintApply.addEventListener("click", () => {
      if (!hintState || !hintState.hint || hintState.step !== hintStepCount(hintState.hint)) return
      if (!activeState || activeState.paused) return
      const h = hintState.hint
      if (!h) return
      if (h.type === "action") {
        if (h.action === "auto_notes") {
          activeState.suppressNotesPrompt = false
          autoNotes()
        } else if (h.action === "fill_notes") {
          const legal = buildLegalCandidateMasks(activeState.grid, activeState.givens)
          let changed = 0
          for (let i = 0; i < 81; i++) {
            if (activeState.givens[i]) continue
            if (activeState.grid[i] !== 0) continue
            if (activeState.notes[i]) continue
            const nn = legal[i] || 0
            if (!nn) continue
            const ps = activeState.shadowNotes ? activeState.shadowNotes[i] || 0 : 0
            const ns = ps | nn
            activeState.undo.push({
              idx: i,
              pv: activeState.grid[i],
              nv: activeState.grid[i],
              pn: 0,
              nn,
              pe: activeState.errors[i],
              ne: activeState.errors[i],
              ps,
              ns,
            })
            activeState.notes[i] = nn
            if (activeState.shadowNotes) activeState.shadowNotes[i] = ns
            changed++
          }
          if (changed) {
            activeState.undo.push({ idx: 99, pv: changed, nv: 0, pn: 0, nn: 0, pe: 0, ne: 0, ps: 0, ns: 0 })
            if (activeState.undo.length > 200) activeState.undo.splice(0, activeState.undo.length - 200)
            updateActions()
            renderBoard()
            persistActive()
          } else {
            toast("没有需要补全的笔记")
          }
        } else {
          activeState.noteMode = true
          updateActions()
          renderBoard()
          persistActive()
          toast("已进入笔记模式")
        }
        clearHint()
        return
      }
      if (h.type === "eliminate") {
        let hasAnyNotes = false
        if (activeState.notes) {
          for (let i = 0; i < 81; i++) {
            if (activeState.notes[i]) {
              hasAnyNotes = true
              break
            }
          }
        }
        if (!hasAnyNotes) {
          toast("当前没有笔记：本提示仅标记可排除候选")
          clearHint()
          return
        }
        const grid = activeState.grid
        let changed = 0
        const entries = []
        if (h.elimList && h.elimList.length) {
          for (const e of h.elimList) entries.push({ idx: e.idx, mask: e.mask })
        } else {
          for (const i of h.targetCells || []) entries.push({ idx: i, mask: h.elimMask || 0 })
        }
        for (const e of entries) {
          const i = e.idx
          const rm = e.mask || 0
          if (!rm) continue
          if (activeState.givens[i]) continue
          if (grid[i] !== 0) continue
          const pn = activeState.notes ? activeState.notes[i] || 0 : 0
          if (!pn) continue
          const nn = pn & ~rm
          if (nn === pn) continue
          const ps = activeState.shadowNotes ? activeState.shadowNotes[i] || 0 : 0
          const ns = ps & ~rm
          activeState.undo.push({
            idx: i,
            pv: grid[i],
            nv: grid[i],
            pn,
            nn,
            pe: activeState.errors[i],
            ne: activeState.errors[i],
            ps,
            ns,
          })
          activeState.notes[i] = nn
          if (activeState.shadowNotes) activeState.shadowNotes[i] = ns
          changed++
        }
        if (changed) {
          activeState.undo.push({ idx: 99, pv: changed, nv: 0, pn: 0, nn: 0, pe: 0, ne: 0, ps: 0, ns: 0 })
          if (activeState.undo.length > 200) activeState.undo.splice(0, activeState.undo.length - 200)
          activeState.suppressNotesPrompt = true
          updateActions()
          renderBoard()
          persistActive()
        } else {
          toast("没有可排除的候选数")
        }
      } else {
        applyMove(h.idx, h.digit, 0, "fill")
      }
      clearHint()
    })

    const open = () => openSettings()
    ui.btnSettings.addEventListener("click", open)
    ui.btnSettings2.addEventListener("click", open)
    ui.btnSettings3.addEventListener("click", open)
    ui.btnSettingsClose.addEventListener("click", closeSettings)
    if (ui.btnSettingsBack) {
      ui.btnSettingsBack.addEventListener("click", () => {
        if (settingsPage === "keyboard-shortcuts") setSettingsPage("hotkeys")
        else setSettingsPage("main")
      })
    }
    if (ui.btnHighlightOpen) ui.btnHighlightOpen.addEventListener("click", () => setSettingsPage("highlight"))
    if (ui.btnThemeOpen) ui.btnThemeOpen.addEventListener("click", () => setSettingsPage("theme"))
    if (ui.btnHotkeysOpen) ui.btnHotkeysOpen.addEventListener("click", () => setSettingsPage("hotkeys"))
    if (ui.btnKeyboardShortcutsOpen) ui.btnKeyboardShortcutsOpen.addEventListener("click", () => setSettingsPage("keyboard-shortcuts"))
    if (ui.btnShareOpen) ui.btnShareOpen.addEventListener("click", () => setSettingsPage("share"))
    if (ui.btnDevOpen) ui.btnDevOpen.addEventListener("click", () => setSettingsPage("dev"))

    const installSettingRowToggles = () => {
      if (!ui.settingsModal) return
      const rows = Array.from(ui.settingsModal.querySelectorAll(".setting-row"))
      for (const row of rows) {
        const input = row.querySelector('input[type="checkbox"]')
        if (!input || !input.id) continue
        row.dataset.kbToggle = input.id
        row.tabIndex = 0
        row.addEventListener("click", (ev) => {
          if (ev.target && ev.target.closest && (ev.target.closest("input") || ev.target.closest("label.switch"))) return
          input.checked = !input.checked
          input.dispatchEvent(new Event("change", { bubbles: true }))
        })
        row.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter" || ev.key === " " || ev.code === "KeyE" || ev.key === "e" || ev.key === "E") {
            ev.preventDefault()
            ev.stopPropagation()
            input.checked = !input.checked
            input.dispatchEvent(new Event("change", { bubbles: true }))
          }
        })
      }
    }
    installSettingRowToggles()

    const bindSetting = (el, key) => {
      el.addEventListener("change", () => {
        settings[key] = !!el.checked
        saveSettings(settings)
        if (key === "numberFirst" && activeState && !settings.numberFirst) {
          activeState.lockedDigit = 0
          updatePad()
          persistActive()
        }
        if (activeState) {
          refreshHighlights()
          updatePad()
        }
        applySettingsToUI()
      })
    }
    const bindRange = (el, key, { min, max }) => {
      const apply = () => {
        const raw = clamp(Number(el.value), min, max)
        settings[key] = clamp(Math.round(raw / 5) * 5, min, max)
        saveSettings(settings)
        applyBrightness()
      }
      el.addEventListener("input", apply)
      el.addEventListener("change", apply)
    }
    bindSetting(ui.settingSound, "sound")
    bindRange(ui.settingBrightness, "uiBrightness", { min: 70, max: 120 })
    bindSetting(ui.settingHighlightRegion, "highlightRegion")
    bindSetting(ui.settingHighlightSame, "highlightSame")
    bindSetting(ui.settingHighlightSameNotes, "highlightSameNotes")
    bindSetting(ui.settingHighlightSameNotesDigit, "highlightSameNotesDigit")
    bindSetting(ui.settingDoubleClickFillNote, "doubleClickFillSingleNote")
    bindSetting(ui.settingHighlightUnique, "highlightUnique")
    bindSetting(ui.settingNumberFirst, "numberFirst")
    const bindThemeButton = (el, key, value) => {
      if (!el) return
      el.addEventListener("click", () => {
        settings[key] = value
        saveSettings(settings)
        applySettingsToUI()
      })
    }
    bindThemeButton(ui.btnFontS, "fontSize", "s")
    bindThemeButton(ui.btnFontM, "fontSize", "m")
    bindThemeButton(ui.btnFontL, "fontSize", "l")
    bindThemeButton(ui.btnPaletteGreen, "palette", "green")
    bindThemeButton(ui.btnPaletteBlue, "palette", "blue")
    bindThemeButton(ui.btnPaletteOrange, "palette", "orange")
    bindThemeButton(ui.btnPaletteWhite, "palette", "white")
    bindThemeButton(ui.btnPaletteBlack, "palette", "black")

    const startKeyCapture = (k, btn) => {
      keybindCapture = k
      if (keybindCaptureBtn) keybindCaptureBtn.classList.remove("capturing")
      keybindCaptureBtn = btn
      if (keybindCaptureBtn) keybindCaptureBtn.classList.add("capturing")
      toast("按下要绑定的按键")
    }
    const stopKeyCapture = () => {
      keybindCapture = ""
      if (keybindCaptureBtn) keybindCaptureBtn.classList.remove("capturing")
      keybindCaptureBtn = null
    }
    const bindKeyButton = (btn, k) => {
      if (!btn) return
      btn.addEventListener("click", () => startKeyCapture(k, btn))
    }
    bindKeyButton(ui.btnBindUp, "up")
    bindKeyButton(ui.btnBindUp2, "up2")
    bindKeyButton(ui.btnBindDown, "down")
    bindKeyButton(ui.btnBindDown2, "down2")
    bindKeyButton(ui.btnBindLeft, "left")
    bindKeyButton(ui.btnBindLeft2, "left2")
    bindKeyButton(ui.btnBindRight, "right")
    bindKeyButton(ui.btnBindRight2, "right2")
    bindKeyButton(ui.btnBindHintPrev, "hintPrev")
    bindKeyButton(ui.btnBindHintNext, "hintNext")
    bindKeyButton(ui.btnBindNote, "note")
    bindKeyButton(ui.btnBindLock, "lock")
    bindKeyButton(ui.btnBindUndo, "undo")
    bindKeyButton(ui.btnBindErase, "erase")

    if (ui.btnRestoreDefaultKeybinds) {
      ui.btnRestoreDefaultKeybinds.addEventListener("click", () => {
        settings.keybinds = {
          up: "KeyW", down: "KeyS", left: "KeyA", right: "KeyD",
          up2: "ArrowUp", down2: "ArrowDown", left2: "ArrowLeft", right2: "ArrowRight",
          hintPrev: "KeyQ", hintNext: "KeyE",
          note: "KeyR", lock: "KeyF", undo: "KeyZ", erase: "KeyX"
        }
        saveSettings(settings)
        applySettingsToUI()
      })
    }

    window.addEventListener(
      "keydown",
      (e) => {
      if (!keybindCapture) return
      if (!ui.settingsModal || ui.settingsModal.classList.contains("hidden")) {
        stopKeyCapture()
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        stopKeyCapture()
        return
      }
      const code = e.code
      if (!code) return
      e.preventDefault()
      e.stopPropagation()
      if (!settings.keybinds) settings.keybinds = {}
      settings.keybinds[keybindCapture] = code
      saveSettings(settings)
      applySettingsToUI()
      toast(`已设置为 ${keyLabel(code)}`)
      stopKeyCapture()
      },
      true
    )
    if (ui.settingDevmode) {
      ui.settingDevmode.addEventListener("change", () => {
        settings.devMode = !!ui.settingDevmode.checked
        saveSettings(settings)
        applySettingsToUI()
      })
    }
    if (ui.btnDevtoolsOpen) ui.btnDevtoolsOpen.addEventListener("click", () => (closeSettings(), openDevtools()))
    if (ui.btnDevtoolsClose) ui.btnDevtoolsClose.addEventListener("click", closeDevtools)
    if (ui.devtoolsBackdrop) ui.devtoolsBackdrop.addEventListener("click", closeDevtools)
    if (ui.btnThemeTunerOpen) ui.btnThemeTunerOpen.addEventListener("click", openThemeTuner)
    if (ui.btnThemeTunerClose) ui.btnThemeTunerClose.addEventListener("click", closeThemeTuner)
    if (ui.settingCustomTheme) {
      ui.settingCustomTheme.addEventListener("change", () => {
        if (!settings.customTheme) settings.customTheme = { enabled: false, vars: {} }
        settings.customTheme.enabled = !!ui.settingCustomTheme.checked
        saveSettings(settings)
        applySettingsToUI()
        renderThemeTuner()
      })
    }
    if (ui.btnThemeTunerReset) {
      ui.btnThemeTunerReset.addEventListener("click", () => {
        if (!settings.customTheme) settings.customTheme = { enabled: false, vars: {} }
        settings.customTheme.vars = {}
        saveSettings(settings)
        applySettingsToUI()
        renderThemeTuner()
        toast("已重置")
      })
    }
    if (ui.btnThemeTunerExport) {
      ui.btnThemeTunerExport.addEventListener("click", async () => {
        const payload = settings.customTheme || { enabled: false, vars: {} }
        const code = JSON.stringify(payload)
        try {
          await navigator.clipboard.writeText(code)
          toast("配置已复制")
        } catch {
          prompt("复制配置：", code)
        }
      })
    }
    if (ui.btnThemeTunerImport) {
      ui.btnThemeTunerImport.addEventListener("click", () => {
        const raw = prompt("粘贴配置：", "")
        if (!raw) return
        const v = safeJsonParse(raw, null)
        if (!v || typeof v !== "object") {
          toast("配置格式不正确")
          return
        }
        if (!settings.customTheme) settings.customTheme = { enabled: false, vars: {} }
        settings.customTheme.enabled = !!v.enabled
        settings.customTheme.vars = v.vars && typeof v.vars === "object" ? v.vars : {}
        saveSettings(settings)
        applySettingsToUI()
        renderThemeTuner()
        toast("已导入")
      })
    }
    if (ui.themeTunerHead) {
      ui.themeTunerHead.addEventListener("pointerdown", (e) => {
        if (!ui.themeTunerModal) return
        const t = e.target
        if (t && t.closest && t.closest("#btn-theme-tuner-close")) return
        if (e.button !== undefined && e.button !== 0) return
        e.preventDefault()
        const rect = ui.themeTunerModal.getBoundingClientRect()
        const startX = e.clientX
        const startY = e.clientY
        const offX = startX - rect.left
        const offY = startY - rect.top
        const move = (ev) => {
          const vw = window.innerWidth
          const vh = window.innerHeight
          const w = rect.width
          const h = rect.height
          const nx = clamp(ev.clientX - offX, 0, Math.max(0, vw - w))
          const ny = clamp(ev.clientY - offY, 0, Math.max(0, vh - h))
          ui.themeTunerModal.style.left = `${nx}px`
          ui.themeTunerModal.style.top = `${ny}px`
        }
        const up = () => {
          window.removeEventListener("pointermove", move)
          window.removeEventListener("pointerup", up)
          if (!settings.customTheme) settings.customTheme = { enabled: false, vars: {} }
          if (!settings.customTheme.win) settings.customTheme.win = { x: 12, y: 80 }
          const r2 = ui.themeTunerModal.getBoundingClientRect()
          settings.customTheme.win.x = Math.round(r2.left)
          settings.customTheme.win.y = Math.round(r2.top)
          saveSettings(settings)
        }
        window.addEventListener("pointermove", move)
        window.addEventListener("pointerup", up)
      })
    }
    if (ui.btnDevLoad) {
      ui.btnDevLoad.addEventListener("click", () => {
        const ok = startDevGame(ui.devGrid?.value || "", {
          asGivens: !!ui.devAsGivens?.checked,
          autoNotes: !!ui.devAutoNotes?.checked,
        })
        if (!ok) return
        closeDevtools()
        closeSettings()
        showGameScreen()
        devWrite("已加载到棋盘（开发盘面，不计入存档）")
      })
    }
    if (ui.btnDevRunHint) {
      ui.btnDevRunHint.addEventListener("click", () => {
        if (activeState && activeState.isDev) {
          openNextHint()
          devWrite(devDescribeHint(hintState?.hint || null))
          return
        }
        const raw = String(ui.devGrid?.value || "")
          .trim()
          .replace(/\s+/g, "")
          .replace(/[.]/g, "0")
        if (raw.length !== 81) {
          devWrite("盘面长度必须为 81")
          return
        }
        const grid = new Uint8Array(81)
        for (let i = 0; i < 81; i++) grid[i] = raw.charCodeAt(i) - 48
        const givens = new Uint8Array(81)
        if (ui.devAsGivens?.checked) for (let i = 0; i < 81; i++) givens[i] = grid[i] ? 1 : 0
        const legal = buildLegalCandidateMasks(grid, givens)
        const temp = {
          difficulty: "dev",
          levelIndex: 0,
          puzzle: raw,
          solution: "",
          grid,
          givens,
          notes: ui.devAutoNotes?.checked ? legal : new Uint16Array(81),
          errors: new Uint8Array(81),
          conflicts: recomputeAllConflicts(grid),
          undo: [],
          noteMode: true,
          bulkEraseNotes: false,
          lockedDigit: 0,
          uniqueDigitToShow: 0,
          selected: -1,
          paused: false,
          elapsedMs: 0,
          startedAtMs: Date.now(),
          isDev: true,
          suppressNotesPrompt: true,
        }
        const h = devRunHintOnTempState(temp)
        devWrite(devDescribeHint(h))
      })
    }
    if (ui.btnDevFindExample) {
      ui.btnDevFindExample.addEventListener("click", () => {
        const tech = String(ui.devTech?.value || "")
        if (!tech) {
          devWrite("请先选择期望技巧")
          return
        }
        devWrite("搜索中…")
        const res = devFindExampleFromBank(tech, 2500)
        if (!res || !res.puzzle) {
          devWrite(`未找到（已尝试 ${res?.tried || 0} 个）`)
          return
        }
        if (ui.devGrid) ui.devGrid.value = res.puzzle
        const stage = res.stage === "mid" ? `中盘（填入 ${res.fillCount || 0} 格）` : "开局"
        devWrite(`已找到示例：${res.diff} #${(res.idx ?? 0) + 1} · ${stage}\n` + devDescribeHint(res.hint))
      })
    }
    if (ui.btnDevMock) {
      ui.btnDevMock.addEventListener("click", () => {
        const tech = String(ui.devTech?.value || "")
        if (!tech) {
          devWrite("请先选择期望技巧")
          return
        }
        const s = devMockScenario(tech)
        if (!s) {
          devWrite("该技巧暂未提供虚构演示")
          return
        }
        if (ui.devGrid) ui.devGrid.value = s.gridStr
        const ok = startDevGame(s.gridStr, { asGivens: !!s.asGivens, autoNotes: !!s.autoNotes })
        if (!ok) return
        closeDevtools()
        closeSettings()
        showGameScreen()
        hintState = { hint: s.hint, step: 1 }
        renderHint()
        devWrite("已加载虚构演示：\n" + devDescribeHint(s.hint))
      })
    }

    ui.btnResetArchive.addEventListener("click", () => {
      const ok = confirm("确定要清空本地数据吗？这会删除通关记录和进行中对局。")
      if (!ok) return
      clearAll()
      settings = loadSettings()
      progress = loadProgress()
      activeState = null
      applySettingsToUI()
      toast("已清空")
      closeArchive()
      closeSettings()
      showLevelsScreen()
    })

    ui.btnExportArchive.addEventListener("click", async () => {
      const payload = {
        v: 2,
        activeMap: loadActiveMap(),
        lastActiveKey: loadLastActiveKey(),
        progress: loadProgress(),
        settings: loadSettings(),
      }
      const code = encodeUtf8B64(payload)
      try {
        await navigator.clipboard.writeText(code)
        toast("存档已复制")
      } catch {
        prompt("复制存档：", code)
      }
    })
    ui.btnImportArchive.addEventListener("click", () => {
      const code = prompt("粘贴存档：")
      if (!code) return
      try {
        const obj = decodeUtf8B64(code.trim())
        if (obj?.settings) {
          settings = { ...settings, ...obj.settings }
          saveSettings(settings)
        }
        if (obj?.progress) {
          progress = { ...loadProgress(), ...obj.progress }
          saveProgress(progress)
        }
        if (obj?.activeMap && typeof obj.activeMap === "object") {
          saveActiveMap(obj.activeMap)
          if (obj?.lastActiveKey) saveLastActiveKey(String(obj.lastActiveKey))
        } else if (obj?.active) {
          const a = obj.active
          if (a?.difficulty && Number.isFinite(a.levelIndex)) {
            setActive(a.difficulty, a.levelIndex, a)
            saveLastActiveKey(gameKey(a.difficulty, a.levelIndex))
          }
        }

        const k = loadLastActiveKey()
        if (k && k.includes(":")) {
          const [diff, idxStr] = k.split(":")
          const idx = Number(idxStr)
          const a = getActive(diff, idx)
          if (a) {
            restoreActiveState(a)
            showGameScreen()
            closeSettings()
            return
          }
        }
        toast("已导入，但没有可恢复的对局")
        closeSettings()
      } catch {
        toast("存档解析失败")
      }
    })

    const serializeNotes = (notesArr) => Array.from(notesArr).map(base36Pad2).join("")

    ui.btnExportGame.addEventListener("click", async () => {
      if (!activeState) {
        toast("请先进入一局再导出")
        return
      }
      const code = [
        "G1",
        Math.max(0, Math.floor(activeState.elapsedMs || 0)).toString(36),
        activeState.noteMode ? "1" : "0",
        (activeState.lockedDigit || 0).toString(36),
        digitsToString(activeState.grid),
        serializeNotes(activeState.notes),
      ].join("|")
      try {
        await navigator.clipboard.writeText(code)
        toast("分享码已复制")
      } catch {
        prompt("复制分享码：", code)
      }
    })

    ui.btnImportGame.addEventListener("click", () => {
      if (!activeState) {
        toast("请先进入一局再导入")
        return
      }
      const code = prompt("粘贴分享码：")
      if (!code) return
      try {
        const raw = code.trim()
        let gridStr = ""
        let notesStr = ""
        let elapsedMs = 0
        let noteMode = false
        let lockedDigit = 0

        if (raw.startsWith("G1|")) {
          const parts = raw.split("|")
          if (parts.length !== 6) {
            toast("分享码格式不支持")
            return
          }
          elapsedMs = parseInt(parts[1] || "0", 36) || 0
          noteMode = parts[2] === "1"
          lockedDigit = parseInt(parts[3] || "0", 36) || 0
          gridStr = parts[4] || ""
          notesStr = parts[5] || ""
        } else {
          const obj = decodeUtf8B64(raw)
          if (!obj || obj.type !== "game" || !obj.game) {
            toast("分享码格式不支持")
            return
          }
          const g = obj.game
          gridStr = String(g.grid || "")
          notesStr = String(g.notes || "")
          elapsedMs = Math.max(0, Number(g.elapsedMs || 0))
          noteMode = !!g.noteMode
          lockedDigit = Number(g.lockedDigit || 0)
        }

        if (gridStr.length !== 81 || notesStr.length !== 162) {
          toast("分享码内容不完整")
          return
        }
        if (!activeState.puzzle || !activeState.solution) {
          toast("当前棋局不可导入")
          return
        }
        const diff = activeState.difficulty
        const idx = activeState.levelIndex
        const a = {
          difficulty: diff,
          levelIndex: idx,
          puzzle: String(activeState.puzzle),
          solution: String(activeState.solution),
          grid: gridStr,
          givens: digitsToString(activeState.givens),
          notes: notesStr,
          undo: "",
          noteMode,
          lockedDigit,
          elapsedMs,
          paused: false,
          savedAt: Date.now(),
        }
        setActive(diff, idx, a)
        saveLastActiveKey(gameKey(diff, idx))
        restoreActiveState(a)
        showGameScreen()
        closeSettings()
        toast("已导入棋局")
      } catch {
        toast("分享码解析失败")
      }
    })

    ui.btnArchiveOpen.addEventListener("click", openArchive)
    ui.btnArchiveClose.addEventListener("click", closeArchive)
    ui.archiveBackdrop.addEventListener("click", closeArchive)

    const openDiff = (d) => {
      currentDiff = d
      levelsMode = "chapters"
      currentChapter = 0
      focusLevel = -1
      updateLevelsHeader()
      ui.screenHome.classList.add("hidden")
      ui.screenLevels.classList.remove("hidden")
      ui.levelsScroll.scrollTop = 0
      renderLevels()
    }
    ui.btnDiffEasy.addEventListener("click", () => openDiff("easy"))
    ui.btnDiffMedium.addEventListener("click", () => openDiff("medium"))
    ui.btnDiffHard.addEventListener("click", () => openDiff("hard"))
    ui.btnDiffDiabolical.addEventListener("click", () => openDiff("diabolical"))

    ui.btnContinue.addEventListener("click", () => {
      const idx = findLastActiveIndexInDiff(currentDiff)
      if (idx < 0) return
      levelsMode = "levels"
      currentChapter = Math.floor(idx / chapterSize)
      focusLevel = idx
      ui.levelsScroll.scrollTop = 0
      updateLevelsHeader()
      renderLevels()
      scrollLevelsToIndex(idx % chapterSize)
    })

    let lastSelectedIdx = -1
    document.addEventListener("keydown", (e) => {
      if (e.defaultPrevented) return
      if (!activeState) return
      if (activeState.paused) return
      if (!ui.settingsModal.classList.contains("hidden")) return
      if (!ui.screenGame || ui.screenGame.classList.contains("hidden")) return
      const t = e.target
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return
      if (ui.traceDrawer && !ui.traceDrawer.classList.contains("hidden")) return
      const kb = settings.keybinds || {}
      const codeOf = (k, def) => kb[k] || def
      const isCode = (k, def) => e.code === codeOf(k, def)

      const hintOpen = !!(ui.hintPanel && !ui.hintPanel.classList.contains("hidden") && hintState && hintState.hint)
      if (
        hintOpen &&
        (isCode("up", "KeyW") ||
          isCode("left", "KeyA") ||
          isCode("down", "KeyS") ||
          isCode("right", "KeyD") ||
          isCode("up2", "ArrowUp") ||
          isCode("down2", "ArrowDown") ||
          isCode("left2", "ArrowLeft") ||
          isCode("right2", "ArrowRight"))
      ) {
        e.preventDefault()
        const goPrev = isCode("up", "KeyW") || isCode("left", "KeyA") || isCode("up2", "ArrowUp") || isCode("left2", "ArrowLeft")
        const maxStep = hintStepCount(hintState.hint)
        const step = hintState.step || 1
        const next = goPrev ? Math.max(1, step - 1) : Math.min(maxStep, step + 1)
        if (next !== step) {
          hintState.step = next
          renderHint()
        }
        return
      }

      if (hintOpen && isCode("hintPrev", "KeyQ")) {
        e.preventDefault()
        hintPrev()
        return
      }

      if (hintOpen && isCode("hintNext", "KeyE")) {
        e.preventDefault()
        hintNextOrApply()
        return
      }

      if (isCode("note", "KeyR")) {
        e.preventDefault()
        if (ui.btnNote) ui.btnNote.click()
        return
      }
      if (isCode("undo", "KeyZ")) {
        e.preventDefault()
        if (ui.btnUndo) ui.btnUndo.click()
        return
      }
      if (isCode("erase", "KeyX")) {
        e.preventDefault()
        if (ui.btnErase) ui.btnErase.click()
        return
      }
      if (isCode("hintNext", "KeyE")) {
        if (activeState.lockedDigit) {
          e.preventDefault()
          e.stopPropagation()
          activeState.lockedDigit = 0
          persistActive()
          refreshHighlights()
          updatePad()
          return
        }
        const idx = activeState.selected ?? -1
        if (idx >= 0) {
          if (settings.doubleClickFillSingleNote && !activeState.givens[idx] && activeState.grid[idx] === 0) {
            const m = activeState.notes[idx] || 0
            if (bitCount(m) === 1) {
              e.preventDefault()
              e.stopPropagation()
              onCellDoubleClick(idx)
              return
            }
          }
          e.preventDefault()
          e.stopPropagation()
          lastSelectedIdx = activeState.selected
          activeState.selected = -1
          refreshHighlights()
          updatePad()
          return
        } else if (lastSelectedIdx >= 0) {
          e.preventDefault()
          e.stopPropagation()
          activeState.selected = lastSelectedIdx
          refreshHighlights()
          updatePad()
          return
        }
      }
      if (
        isCode("up", "KeyW") ||
        isCode("left", "KeyA") ||
        isCode("down", "KeyS") ||
        isCode("right", "KeyD") ||
        isCode("up2", "ArrowUp") ||
        isCode("down2", "ArrowDown") ||
        isCode("left2", "ArrowLeft") ||
        isCode("right2", "ArrowRight")
      ) {
        e.preventDefault()
        let idx = activeState.selected ?? -1
        let isResuming = false
        if (idx < 0) {
          if (lastSelectedIdx >= 0) {
            idx = lastSelectedIdx
            isResuming = true
          } else {
            idx = 0
          }
        }
        let r = (idx / 9) | 0
        let c = idx % 9
        
        if (!isResuming) {
          if (isCode("up", "KeyW") || isCode("up2", "ArrowUp")) r = Math.max(0, r - 1)
          else if (isCode("down", "KeyS") || isCode("down2", "ArrowDown")) r = Math.min(8, r + 1)
          else if (isCode("left", "KeyA") || isCode("left2", "ArrowLeft")) c = Math.max(0, c - 1)
          else if (isCode("right", "KeyD") || isCode("right2", "ArrowRight")) c = Math.min(8, c + 1)
        }
        
        activeState.selected = r * 9 + c
        lastSelectedIdx = activeState.selected
        refreshHighlights()
        updatePad()
        return
      }

      if (e.key >= "1" && e.key <= "9") {
        e.preventDefault()
        onPadClick(Number(e.key))
        return
      }
      if (e.code && /^Numpad[1-9]$/.test(e.code)) {
        e.preventDefault()
        onPadClick(Number(e.code.slice(6)))
        return
      }
      if (e.key === "0" || e.code === "Numpad0" || e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault()
        eraseSelected()
        return
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
        e.preventDefault()
        undo()
        return
      }
    })
  }

  const init = () => {
    buildBoard()
    buildPad()
    wireUI()
    installScrollGuard()
    applySettingsToUI()

    const k = loadLastActiveKey()
    if (k && k.includes(":")) {
      const [diff, idxStr] = k.split(":")
      const idx = Number(idxStr)
      const a = getActive(diff, idx)
      if (a && a.puzzle && a.solution) {
        currentDiff = a.difficulty || "easy"
        const next = { ...a, paused: true, savedAt: Date.now() }
        setActive(next.difficulty, next.levelIndex, next)
        restoreActiveState(next)
        showGameScreen()
        toast("已恢复未完成对局")
        return
      }
    }
    showHomeScreen()
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init)
  else init()
})()

