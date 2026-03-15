(() => {
  const DIFFS = ["easy", "medium", "hard", "diabolical"]
  const DIFF_LABEL = { easy: "简单", medium: "中等", hard: "困难", diabolical: "极限" }
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
      highlightRegion: true,
      highlightSame: true,
      highlightSameNotes: true,
      highlightSameNotesDigit: true,
      doubleClickFillSingleNote: false,
      highlightUnique: true,
      numberFirst: false,
    }
    const raw = localStorage.getItem(LS_KEYS.settings)
    if (!raw) return def
    const v = safeJsonParse(raw, def)
    return { ...def, ...v }
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
    btnHintNext: qs("#btn-hint-next"),
    btnHintApply: qs("#btn-hint-apply"),
    btnBack: qs("#btn-back"),
    btnLevelsBack: qs("#btn-levels-back"),
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
    gameDifficulty: qs("#game-difficulty"),
    gameTimer: qs("#game-timer"),
    settingsModal: qs("#settings-modal"),
    modalBackdrop: qs("#modal-backdrop"),
    btnSettings: qs("#btn-settings"),
    btnSettings2: qs("#btn-settings-2"),
    btnSettings3: qs("#btn-settings-3"),
    btnSettingsClose: qs("#btn-settings-close"),
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
    btnExportGame: qs("#btn-export-game"),
    btnImportGame: qs("#btn-import-game"),
    btnArchiveOpen: qs("#btn-archive-open"),
    archiveModal: qs("#archive-modal"),
    archiveBackdrop: qs("#archive-backdrop"),
    btnArchiveClose: qs("#btn-archive-close"),
    btnExportArchive: qs("#btn-export-archive"),
    btnImportArchive: qs("#btn-import-archive"),
    btnResetArchive: qs("#btn-reset-archive"),
  }

  let settings = loadSettings()
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

  const setLevelsStatus = (text) => {
    if (!ui.levelsStatus) return
    clearTimeout(levelsStatusTimer)
    ui.levelsStatus.textContent = text || ""
    if (text) levelsStatusTimer = setTimeout(() => (ui.levelsStatus.textContent = ""), 6000)
  }

  const applyBrightness = () => {
    const v = clamp(Number(settings.uiBrightness || 100), 70, 110)
    const ratio = v / 100
    document.documentElement.style.setProperty("--ui-brightness", String(ratio))
    if (ui.settingBrightnessValue) ui.settingBrightnessValue.textContent = `${Math.round(v)}%`
  }

  const applySettingsToUI = () => {
    ui.settingSound.checked = !!settings.sound
    ui.settingBrightness.value = String(clamp(Number(settings.uiBrightness || 100), 70, 110))
    ui.settingHighlightRegion.checked = !!settings.highlightRegion
    ui.settingHighlightSame.checked = !!settings.highlightSame
    ui.settingHighlightSameNotes.checked = !!settings.highlightSameNotes
    ui.settingHighlightSameNotesDigit.checked = !!settings.highlightSameNotesDigit
    ui.settingDoubleClickFillNote.checked = !!settings.doubleClickFillSingleNote
    ui.settingHighlightUnique.checked = !!settings.highlightUnique
    ui.settingNumberFirst.checked = !!settings.numberFirst
    ui.settingRowHighlightSameNotesMode.classList.toggle("hidden", !settings.highlightSameNotes)
    applyBrightness()
  }

  let scrollGuardInstalled = false
  const installScrollGuard = () => {
    if (scrollGuardInstalled) return
    scrollGuardInstalled = true
    const handler = (e) => {
      if (!document.body.classList.contains("modal-open")) return
      const t = e.target
      if (t && t.closest && t.closest(".modal-card")) return
      e.preventDefault()
    }
    document.addEventListener("wheel", handler, { passive: false })
    document.addEventListener("touchmove", handler, { passive: false })
  }

  const updateScrollLock = () => {
    const open =
      (ui.settingsModal && !ui.settingsModal.classList.contains("hidden")) ||
      (ui.archiveModal && !ui.archiveModal.classList.contains("hidden"))
    document.body.classList.toggle("modal-open", !!open)
    document.documentElement.classList.toggle("modal-open", !!open)
  }

  const openSettings = () => {
    applySettingsToUI()
    ui.settingsModal.classList.remove("hidden")
    updateScrollLock()
  }

  const closeSettings = () => {
    ui.settingsModal.classList.add("hidden")
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
    levelTileHeight = levelsMode === "chapters" ? 86 : 66
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
      activeState.noteMode && sel >= 0 && activeState.grid[sel] === 0 && !activeState.givens[sel]
    if (useNoteMask) noteMask = activeState.notes[sel] || 0
    const hideOthers = useNoteMask ? 0 : activeState.uniqueDigitToShow || 0
    const filledCount = new Uint8Array(10)
    for (let i = 0; i < 81; i++) {
      const v = activeState.grid[i]
      if (v) filledCount[v]++
    }
    for (const btn of padEls) {
      const n = Number(btn.dataset.n)
      btn.classList.toggle("locked", settings.numberFirst && activeState.lockedDigit === n)
      let off = false
      if (useNoteMask) {
        if (noteMask !== 0) off = ((noteMask >> (n - 1)) & 1) === 1
      } else if (hideOthers) {
        off = n !== hideOthers
      }
      if (settings.highlightUnique && filledCount[n] >= 9) off = true
      btn.classList.toggle("off", off)
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
    for (let i = 0; i < 81; i++) {
      const cell = cellEls[i]
      const v = grid[i]
      cell.classList.toggle("given", !!givens[i])
      cell.classList.toggle("user", !givens[i] && v !== 0)
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
    ui.btnUndo.disabled = activeState.undo.length === 0
    ui.btnNote.classList.toggle("primary", activeState.noteMode)
    ui.pad.classList.toggle("note", activeState.noteMode)
    const allowAutoNotes = activeState.difficulty === "hard" || activeState.difficulty === "diabolical"
    if (activeState.noteMode && allowAutoNotes) ui.btnHint.textContent = "一键笔记"
    else ui.btnHint.textContent = "提示"
    if (!activeState.noteMode) activeState.bulkEraseNotes = false
    ui.btnErase.textContent = activeState.noteMode && activeState.bulkEraseNotes ? "一键擦除笔记" : "擦除"
  }

  const onCellClick = (idx) => {
    if (!activeState || activeState.paused) return
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
    clearHint()
    const { grid, notes, givens } = activeState
    if (givens[idx]) return
    if (activeState.bulkEraseNotes) activeState.bulkEraseNotes = false

    const prevVal = grid[idx]
    const prevNotes = notes[idx]
    const prevErrors = activeState.errors[idx]

    if (kind === "fill" && prevVal !== 0 && nextVal !== 0) return

    if (kind === "note") {
      notes[idx] = nextNotesMask
    } else {
      grid[idx] = nextVal
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
    })

    if (kind === "fill" && nextVal) {
      activeState.undo.push({
        idx: 99,
        pv: cascadeCount + 1,
        nv: 0,
        pn: 0,
        nn: 0,
        pe: 0,
        ne: 0,
      })
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

    if (isSolved(activeState.grid, activeState.givens, activeState.errors, activeState.conflicts)) {
      onSolved()
    }
  }

  const onPadClick = (n) => {
    if (!activeState || activeState.paused) return
    const idx = activeState.selected
    if (idx < 0) return
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
      for (let i = 0; i < 81; i++) {
        const pn = activeState.notes[i]
        if (!pn) continue
        activeState.notes[i] = 0
        activeState.undo.push({
          idx: i,
          pv: activeState.grid[i],
          nv: activeState.grid[i],
          pn,
          nn: 0,
          pe: activeState.errors[i],
          ne: activeState.errors[i],
        })
        changed = true
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
    const { grid, notes } = activeState
    const applyUndo = (rec) => {
      grid[rec.idx] = rec.pv
      notes[rec.idx] = rec.pn
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
    activeState.conflicts = recomputeAllConflicts(grid)
    renderBoard()
    persistActive()
  }

  const autoNotes = () => {
    if (!activeState) return
    for (let i = 0; i < 81; i++) {
      if (activeState.grid[i] !== 0) {
        activeState.notes[i] = 0
        continue
      }
      activeState.notes[i] = computeCandidateMask(activeState.grid, i)
    }
    activeState.bulkEraseNotes = true
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

  const buildEffectiveCandidateMasks = (legal, notes) => {
    if (!notes) return legal
    const out = new Uint16Array(81)
    for (let i = 0; i < 81; i++) {
      const l = legal[i] || 0
      const n = notes[i] || 0
      out[i] = n ? l & n : l
    }
    return out
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
        for (const i of unit) {
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
          for (const j of rowCells[r0]) {
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
          for (const j of colCells[c0]) {
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
        for (const i of unit) {
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
        for (const j of boxCells[b0]) {
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
        for (const i of unit) {
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
        for (const j of boxCells[b0]) {
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
    for (let r = 0; r < 9; r++) {
      const h = findHiddenSingleInUnit(grid, givens, cands, rowCells[r], "row", r)
      if (h) return h
    }
    for (let c = 0; c < 9; c++) {
      const h = findHiddenSingleInUnit(grid, givens, cands, colCells[c], "col", c)
      if (h) return h
    }
    for (let b = 0; b < 9; b++) {
      const h = findHiddenSingleInUnit(grid, givens, cands, boxCells[b], "box", b)
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

  const findTwoStringKite = (grid, givens, legal, elim) => {
    for (let d = 1; d <= 9; d++) {
      const bit = 1 << (d - 1)
      const rowPairs = Array(9)
      const colPairs = Array(9)
      for (let r = 0; r < 9; r++) {
        const cols = []
        for (let c = 0; c < 9; c++) {
          const i = r * 9 + c
          if (givens[i]) continue
          if (grid[i] !== 0) continue
          if (legal[i] & bit) cols.push(c)
        }
        rowPairs[r] = cols.length === 2 ? cols : null
      }
      for (let c = 0; c < 9; c++) {
        const rows = []
        for (let r = 0; r < 9; r++) {
          const i = r * 9 + c
          if (givens[i]) continue
          if (grid[i] !== 0) continue
          if (legal[i] & bit) rows.push(r)
        }
        colPairs[c] = rows.length === 2 ? rows : null
      }
      for (let r = 0; r < 9; r++) {
        const pair = rowPairs[r]
        if (!pair) continue
        for (let t = 0; t < 2; t++) {
          const cShared = pair[t]
          const cOther = pair[1 - t]
          const col = colPairs[cShared]
          if (!col) continue
          const r2 = col[0] === r ? col[1] : col[0]
          if (r2 === r) continue
          const a = r2 * 9 + cShared
          const b = r * 9 + cOther
          if (boxOf(a) !== boxOf(b)) continue
          const target = r2 * 9 + cOther
          if (givens[target]) continue
          if (grid[target] !== 0) continue
          if (!(elim[target] & bit)) continue
          const unitCells = unionUnique(unionUnique(rowCells[r], colCells[cShared]), boxCells[boxOf(a)])
          const src = [r * 9 + cShared, r * 9 + cOther, a]
          return {
            type: "eliminate",
            tech: "two_string_kite",
            digit: d,
            elimMask: bit,
            unitCells,
            sourceCells: src,
            targetCells: [target],
          }
        }
      }
    }
    return null
  }

  const findSkyscraper = (grid, givens, legal, elim) => {
    for (let d = 1; d <= 9; d++) {
      const bit = 1 << (d - 1)
      const rowPairs = Array(9)
      for (let r = 0; r < 9; r++) {
        const cols = []
        for (let c = 0; c < 9; c++) {
          const i = r * 9 + c
          if (givens[i]) continue
          if (grid[i] !== 0) continue
          if (legal[i] & bit) cols.push(c)
        }
        if (cols.length === 2) rowPairs[r] = cols
        else rowPairs[r] = null
      }
      for (let r1 = 0; r1 < 9; r1++) {
        const a = rowPairs[r1]
        if (!a) continue
        for (let r2 = r1 + 1; r2 < 9; r2++) {
          const b = rowPairs[r2]
          if (!b) continue
          let shared = -1
          if (a[0] === b[0] || a[0] === b[1]) shared = a[0]
          if (a[1] === b[0] || a[1] === b[1]) {
            if (shared !== -1) continue
            shared = a[1]
          }
          if (shared === -1) continue
          const o1 = a[0] === shared ? a[1] : a[0]
          const o2 = b[0] === shared ? b[1] : b[0]
          const roof1 = r1 * 9 + o1
          const roof2 = r2 * 9 + o2
          const p2 = new Set(peersOf[roof2])
          const targets = []
          for (const t of peersOf[roof1]) {
            if (!p2.has(t)) continue
            if (givens[t]) continue
            if (grid[t] !== 0) continue
            if (elim[t] & bit) targets.push(t)
          }
          if (!targets.length) continue
          const src = [r1 * 9 + shared, roof1, r2 * 9 + shared, roof2]
          const unitCells = unionUnique(
            unionUnique(rowCells[r1], rowCells[r2]),
            unionUnique(colCells[shared], unionUnique(colCells[o1], colCells[o2]))
          )
          return {
            type: "eliminate",
            tech: "skyscraper_row",
            digit: d,
            elimMask: bit,
            unitCells,
            sourceCells: src,
            targetCells: targets,
            roof1,
            roof2,
          }
        }
      }

      const colPairs = Array(9)
      for (let c = 0; c < 9; c++) {
        const rows = []
        for (let r = 0; r < 9; r++) {
          const i = r * 9 + c
          if (givens[i]) continue
          if (grid[i] !== 0) continue
          if (legal[i] & bit) rows.push(r)
        }
        if (rows.length === 2) colPairs[c] = rows
        else colPairs[c] = null
      }
      for (let c1 = 0; c1 < 9; c1++) {
        const a = colPairs[c1]
        if (!a) continue
        for (let c2 = c1 + 1; c2 < 9; c2++) {
          const b = colPairs[c2]
          if (!b) continue
          let shared = -1
          if (a[0] === b[0] || a[0] === b[1]) shared = a[0]
          if (a[1] === b[0] || a[1] === b[1]) {
            if (shared !== -1) continue
            shared = a[1]
          }
          if (shared === -1) continue
          const o1 = a[0] === shared ? a[1] : a[0]
          const o2 = b[0] === shared ? b[1] : b[0]
          const roof1 = o1 * 9 + c1
          const roof2 = o2 * 9 + c2
          const p2 = new Set(peersOf[roof2])
          const targets = []
          for (const t of peersOf[roof1]) {
            if (!p2.has(t)) continue
            if (givens[t]) continue
            if (grid[t] !== 0) continue
            if (elim[t] & bit) targets.push(t)
          }
          if (!targets.length) continue
          const src = [shared * 9 + c1, roof1, shared * 9 + c2, roof2]
          const unitCells = unionUnique(
            unionUnique(colCells[c1], colCells[c2]),
            unionUnique(rowCells[shared], unionUnique(rowCells[o1], rowCells[o2]))
          )
          return {
            type: "eliminate",
            tech: "skyscraper_col",
            digit: d,
            elimMask: bit,
            unitCells,
            sourceCells: src,
            targetCells: targets,
            roof1,
            roof2,
          }
        }
      }
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

  const findForcingCell = (grid, givens, legal) => {
    let tries = 0
    for (let i = 0; i < 81; i++) {
      if (givens[i]) continue
      if (grid[i] !== 0) continue
      const m = legal[i] || 0
      const bc = bitCount(m)
      if (bc < 2 || bc > 3) continue
      let eliminated = 0
      let mm = m
      while (mm) {
        const bit = mm & -mm
        mm ^= bit
        const d = (Math.log2(bit) | 0) + 1
        const g2 = grid.slice ? grid.slice() : Array.from(grid)
        g2[i] = d
        if (!propagateSingles(g2, givens)) {
          eliminated |= bit
        }
        if (++tries > 48) break
      }
      if (!eliminated) continue
      const remain = m & ~eliminated
      if (bitCount(remain) !== 1) continue
      return {
        type: "fill",
        tech: "forcing_cell",
        idx: i,
        digit: digitFromSingleMask(remain),
        eliminatedMask: eliminated,
      }
    }
    return null
  }

  const findHint = () => {
    if (!activeState || activeState.paused) return null
    const { grid, givens } = activeState
    const legal = buildLegalCandidateMasks(grid, givens)
    const effective = buildEffectiveCandidateMasks(legal, activeState.notes)
    const elim = buildElimCandidateMasks(legal, activeState.notes)
    const rules = [
      () => findNakedSingle(grid, givens, effective),
      () => findHiddenSingle(grid, givens, effective),
      () => findLockedCandidates(grid, givens, legal, elim),
      () => findNakedPairs(grid, givens, legal, elim),
      () => findHiddenPairs(grid, givens, legal, elim),
      () => findNakedSets(grid, givens, legal, elim, 3),
      () => findHiddenSets(grid, givens, legal, elim, 3),
      () => findNakedSets(grid, givens, legal, elim, 4),
      () => findHiddenSets(grid, givens, legal, elim, 4),
      () => findTwoStringKite(grid, givens, legal, elim),
      () => findSkyscraper(grid, givens, legal, elim),
      () => findXWing(grid, givens, legal, elim),
      () => findXYWing(grid, givens, legal, elim),
      () => findSwordfish(grid, givens, legal, elim),
      () => findForcingCell(grid, givens, legal),
    ]
    for (const run of rules) {
      const h = run()
      if (h) return h
    }
    return null
  }

  const clearHint = () => {
    hintState = null
    if (ui.hintPanel) ui.hintPanel.classList.add("hidden")
    if (ui.board) ui.board.classList.remove("hinting")
    if (cellEls && cellEls.length) {
      for (const el of cellEls) {
        el.classList.remove("hint-unit")
        el.classList.remove("hint-target")
        el.classList.remove("hint-source")
        el.classList.remove("hint-elim")
      }
    }
    if (cellEls && cellEls.length) {
      for (const el of cellEls) {
        const ns = el.querySelectorAll(".notes span.elim")
        for (const s of ns) s.classList.remove("elim")
      }
    }
    if (hintSvg) hintSvg.innerHTML = ""
  }

  const unitLabel = (unitType, unitIndex) => {
    if (unitType === "row") return `第 ${unitIndex + 1} 行`
    if (unitType === "col") return `第 ${unitIndex + 1} 列`
    return `第 ${unitIndex + 1} 宫`
  }

  const hintBadgeText = (h) => {
    if (!h) return ""
    if (h.tech === "naked_single") return "简单 · 唯一余数"
    if (h.tech === "hidden_single") return "简单 · 隐性唯一"
    if (h.tech === "locked_pointing_row" || h.tech === "locked_pointing_col") return "中等 · 区块舍弃"
    if (h.tech === "locked_claiming_row" || h.tech === "locked_claiming_col") return "中等 · 区块舍弃"
    if (h.tech === "naked_pairs") return "中等 · 显性数对"
    if (h.tech === "hidden_pairs") return "中等 · 隐性数对"
    if (h.tech === "naked_triplet") return "中等 · 显性三元组"
    if (h.tech === "hidden_triplet") return "中等 · 隐性三元组"
    if (h.tech === "naked_quad") return "困难 · 显性四元组"
    if (h.tech === "hidden_quad") return "困难 · 隐性四元组"
    if (h.tech === "two_string_kite") return "困难 · 风筝"
    if (h.tech === "skyscraper_row" || h.tech === "skyscraper_col") return "困难 · 天梯"
    if (h.tech === "forcing_cell") return "困难 · 试探推理"
    if (h.tech === "xywing") return "困难 · XY-Wing"
    if (h.tech === "xwing_row" || h.tech === "xwing_col") return "困难 · X-Wing"
    if (h.tech === "swordfish_row" || h.tech === "swordfish_col") return "极难 · 剑鱼"
    return "提示"
  }

  const cellCenterInBoard = (idx) => {
    const boardRect = ui.board.getBoundingClientRect()
    const rect = cellEls[idx].getBoundingClientRect()
    const x = rect.left - boardRect.left + rect.width / 2
    const y = rect.top - boardRect.top + rect.height / 2
    return { x, y, w: boardRect.width, h: boardRect.height, cw: rect.width, ch: rect.height }
  }

  const renderHintLines = (h) => {
    if (!hintSvg || !ui.board || !h) return
    hintSvg.innerHTML = ""
    hintSvg.classList.remove("sf-anim")
    if (h.tech === "xywing") {
      const p = h.pivotIdx ?? -1
      const aIdx = h.wingAIdx ?? -1
      const bIdx = h.wingBIdx ?? -1
      if (p < 0 || aIdx < 0 || bIdx < 0) return
      const p0 = cellCenterInBoard(p)
      const a0 = cellCenterInBoard(aIdx)
      const b0 = cellCenterInBoard(bIdx)
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

      const mkLine = (from, to) => {
        const { x1, y1, x2, y2 } = trim(from, to)
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line")
        line.setAttribute("x1", String((x1 / w) * 100))
        line.setAttribute("y1", String((y1 / hh) * 100))
        line.setAttribute("x2", String((x2 / w) * 100))
        line.setAttribute("y2", String((y2 / hh) * 100))
        line.setAttribute("stroke", "rgba(47, 116, 63, .48)")
        line.setAttribute("stroke-width", "1.6")
        line.setAttribute("stroke-linecap", "round")
        return line
      }
      hintSvg.appendChild(mkLine(p0, a0))
      hintSvg.appendChild(mkLine(p0, b0))
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
      rect.setAttribute("stroke-width", "1.2")
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
      for (const r of rows) {
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect")
        rect.setAttribute("x", "0")
        rect.setAttribute("y", String(r * cell))
        rect.setAttribute("width", "100")
        rect.setAttribute("height", String(cell))
        rect.setAttribute("fill", "rgba(173, 116, 230, .10)")
        rect.classList.add("sf-band")
        hintSvg.appendChild(rect)
      }
      for (const c of cols) {
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect")
        rect.setAttribute("x", String(c * cell))
        rect.setAttribute("y", "0")
        rect.setAttribute("width", String(cell))
        rect.setAttribute("height", "100")
        rect.setAttribute("fill", "rgba(0, 210, 210, .08)")
        rect.classList.add("sf-band")
        hintSvg.appendChild(rect)
      }
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
      for (const r of rows) {
        for (const c of cols) {
          const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect")
          rect.setAttribute("x", String(c * cell))
          rect.setAttribute("y", String(r * cell))
          rect.setAttribute("width", String(cell))
          rect.setAttribute("height", String(cell))
          rect.setAttribute("fill", "rgba(255, 255, 255, .06)")
          rect.setAttribute("stroke", "rgba(173, 116, 230, .35)")
          rect.setAttribute("stroke-width", ".8")
          rect.classList.add("sf-cross")
          hintSvg.appendChild(rect)
        }
      }
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
    }
    if (h.type === "eliminate") {
      for (const i of h.unitCells || []) cellEls[i].classList.add("hint-unit")
      for (const i of h.sourceCells || []) cellEls[i].classList.add("hint-source")
      if (step === 2) for (const i of h.targetCells || []) cellEls[i].classList.add("hint-elim")
      renderHintLines(step === 1 ? h : null)
      return
    }
    if (h.tech === "hidden_single") {
      const unit =
        h.unitType === "row" ? rowCells[h.unitIndex] : h.unitType === "col" ? colCells[h.unitIndex] : boxCells[h.unitIndex]
      for (const i of unit) cellEls[i].classList.add("hint-unit")
    } else {
      const idx = h.idx
      const r = (idx / 9) | 0
      const c = idx % 9
      const b = ((r / 3) | 0) * 3 + ((c / 3) | 0)
      for (const i of rowCells[r]) cellEls[i].classList.add("hint-unit")
      for (const i of colCells[c]) cellEls[i].classList.add("hint-unit")
      for (const i of boxCells[b]) cellEls[i].classList.add("hint-unit")
    }
    cellEls[h.idx].classList.add("hint-target")
    renderHintLines(null)
  }

  const hintMessageText = (h, step) => {
    if (!activeState || !h) return ""
    const idx = h.idx ?? -1
    const r = idx >= 0 ? ((idx / 9) | 0) + 1 : 0
    const c = idx >= 0 ? (idx % 9) + 1 : 0
    if (h.tech === "naked_single") {
      if (step === 1) return `观察目标格（第 ${r} 行第 ${c} 列），排除后只剩一个候选数。`
      return `因此该格只能填 ${h.digit}。`
    }
    if (h.tech === "hidden_single") {
      const u = unitLabel(h.unitType, h.unitIndex)
      if (step === 1) return `观察 ${u}，数字 ${h.digit} 只出现在一个格子里。`
      return `所以目标格（第 ${r} 行第 ${c} 列）必须填 ${h.digit}。`
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
        if (!ds.length) return `对目标格（第 ${r} 行第 ${c} 列）进行试探：部分候选会导致矛盾。`
        return `对目标格（第 ${r} 行第 ${c} 列）进行试探：笔记里的候选 ${ds.join(" / ")} 都会导致矛盾。`
      }
      return `因此该格只能填 ${h.digit}。`
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
    if (h.tech === "skyscraper_row" || h.tech === "skyscraper_col") {
      if (step === 1) return `这里形成了 天梯：数字 ${h.digit} 在两条线中各出现两次，并共享一个对齐点。`
      return `因此同时“看见”两个端点的格子里，候选 ${h.digit} 都可以排除。`
    }
    if (h.tech === "two_string_kite") {
      if (step === 1) return `这里形成了 风筝：数字 ${h.digit} 在一行与一列被强制锁定，并通过同一宫相连。`
      return `因此目标格可以排除候选 ${h.digit}。`
    }
    if (h.tech === "xywing") {
      const p = h.pivotIdx ?? -1
      const a = h.wingAIdx ?? -1
      const b = h.wingBIdx ?? -1
      const pr = p >= 0 ? ((p / 9) | 0) + 1 : 0
      const pc = p >= 0 ? (p % 9) + 1 : 0
      const ar = a >= 0 ? ((a / 9) | 0) + 1 : 0
      const ac = a >= 0 ? (a % 9) + 1 : 0
      const br = b >= 0 ? ((b / 9) | 0) + 1 : 0
      const bc = b >= 0 ? (b % 9) + 1 : 0
      if (step === 1) {
        return `这里形成了 XY-Wing：枢纽格（第 ${pr} 行第 ${pc} 列）与两翼（第 ${ar} 行第 ${ac} 列、 第 ${br} 行第 ${bc} 列）构成 V 形锁定。`
      }
      return `因此同时“看见”两翼的格子里，候选 ${h.digit} 都可以排除。`
    }
    if (h.tech === "xwing_row" || h.tech === "xwing_col") {
      const vs = h.vertices || []
      if (vs.length === 4) {
        const rr = Array.from(new Set(vs.map((i) => ((i / 9) | 0)))).sort((a, b) => a - b)
        const cc = Array.from(new Set(vs.map((i) => i % 9))).sort((a, b) => a - b)
        if (step === 1) {
          return `这里形成了 X-Wing：数字 ${h.digit} 被锁定在第 ${rr[0] + 1}/${rr[1] + 1} 行与第 ${cc[0] + 1}/${cc[1] + 1} 列的交点上。`
        }
        return `因此第 ${cc[0] + 1}/${cc[1] + 1} 列（或对应行）其他位置的候选 ${h.digit} 都可以排除。`
      }
      if (step === 1) return `这里形成了 X-Wing：数字 ${h.digit} 在两行两列中被锁定。`
      return `因此相关行/列的其他位置可以排除候选 ${h.digit}。`
    }
    if (h.tech === "swordfish_row" || h.tech === "swordfish_col") {
      if (step === 1) return `这里形成了 剑鱼：数字 ${h.digit} 被限制在 3 行与 3 列的交叉范围内。`
      return `因此相关 3 列（或 3 行）的其他位置可以排除候选 ${h.digit}。`
    }
    return "暂无可用提示"
  }

  const renderHint = () => {
    if (!hintState || !hintState.hint) return
    const h = hintState.hint
    const step = hintState.step || 1
    applyHintHighlight(h, step)
    ui.hintBadge.textContent = hintBadgeText(h)
    ui.hintMessage.textContent = hintMessageText(h, step)
    ui.btnHintNext.textContent = step === 2 ? "上一步" : "下一步"
    ui.btnHintApply.classList.toggle("hidden", step !== 2)
    ui.btnHintApply.textContent = h.type === "eliminate" ? "排除" : "填入"
    ui.btnHintApply.disabled = false
    for (const el of cellEls) {
      const ns = el.querySelectorAll(".notes span.elim")
      for (const s of ns) s.classList.remove("elim")
    }
    if (step === 2 && h.type === "eliminate") {
      const legal = buildLegalCandidateMasks(activeState.grid, activeState.givens)
      const cands = buildElimCandidateMasks(legal, activeState.notes)
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
          if (s) s.classList.add("elim")
        }
      }
    }
    ui.hintPanel.classList.remove("hidden")
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
    if (hintState.step === 1) {
      hintState.step = 2
      renderHint()
    }
  }

  const toggleHintStep = () => {
    if (!hintState) {
      openNextHint()
      return
    }
    hintState.step = hintState.step === 2 ? 1 : 2
    renderHint()
  }

  const persistActive = () => {
    if (!activeState) return
    const notesStr = Array.from(activeState.notes).map(base36Pad2).join("")
    const undoStr = activeState.undo
      .slice(-80)
      .map((u) => [u.idx, u.pv, u.nv, u.pn, u.nn, u.pe, u.ne].map((x) => base36Pad2(x)).join(""))
      .join("")
    const a = {
      difficulty: activeState.difficulty,
      levelIndex: activeState.levelIndex,
      puzzle: activeState.puzzle,
      solution: activeState.solution,
      grid: digitsToString(activeState.grid),
      givens: digitsToString(activeState.givens),
      notes: notesStr,
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
    const recLen = 14
    for (let off = 0; off + recLen <= u.length; off += recLen) {
      const chunk = u.slice(off, off + recLen)
      const parts = []
      for (let i = 0; i < 7; i++) parts.push(fromBase36(chunk.slice(i * 2, i * 2 + 2)))
      undo.push({ idx: parts[0], pv: parts[1], nv: parts[2], pn: parts[3], nn: parts[4], pe: parts[5], ne: parts[6] })
    }
    activeState = {
      difficulty: a.difficulty,
      levelIndex: a.levelIndex,
      puzzle: a.puzzle,
      solution: a.solution,
      grid,
      givens,
      notes,
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
    }
    ui.gameDifficulty.textContent = DIFF_LABEL[activeState.difficulty] + ` · 第 ${activeState.levelIndex + 1} 关`
    ui.gameTimer.textContent = formatTime(activeState.elapsedMs)
    ui.pauseOverlay.classList.toggle("hidden", !activeState.paused)
    renderBoard()
    updatePad()
    updateActions()
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
    ui.btnUndo.addEventListener("click", undo)
    ui.btnErase.addEventListener("click", eraseSelected)
    ui.btnHint.addEventListener("click", () => {
      if (!activeState) return
      const allowAutoNotes = activeState.difficulty === "hard" || activeState.difficulty === "diabolical"
      if (activeState.noteMode && allowAutoNotes) {
        clearHint()
        autoNotes()
        return
      }
      if (hintState && hintState.step === 2) openNextHint()
      else advanceHint()
    })
    ui.btnNote.addEventListener("click", () => {
      if (!activeState) return
      clearHint()
      activeState.bulkEraseNotes = false
      activeState.noteMode = !activeState.noteMode
      updateActions()
      renderBoard()
      persistActive()
    })

    ui.btnHintClose.addEventListener("click", clearHint)
    ui.btnHintNext.addEventListener("click", toggleHintStep)
    ui.btnHintApply.addEventListener("click", () => {
      if (!hintState || hintState.step !== 2) return
      if (!activeState || activeState.paused) return
      const h = hintState.hint
      if (!h) return
      if (h.type === "eliminate") {
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
          const noteMask = activeState.notes[i] || 0
          if (!noteMask) continue
          const base = computeCandidateMask(grid, i) & noteMask
          const next = base & ~rm
          if (next === base) continue
          applyMove(i, grid[i], next, "note")
          changed++
        }
        if (!changed) toast("没有可排除的候选数")
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
    ui.modalBackdrop.addEventListener("click", closeSettings)

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
        settings[key] = clamp(Number(el.value), min, max)
        saveSettings(settings)
        applyBrightness()
      }
      el.addEventListener("input", apply)
      el.addEventListener("change", apply)
    }
    bindSetting(ui.settingSound, "sound")
    bindRange(ui.settingBrightness, "uiBrightness", { min: 70, max: 110 })
    bindSetting(ui.settingHighlightRegion, "highlightRegion")
    bindSetting(ui.settingHighlightSame, "highlightSame")
    bindSetting(ui.settingHighlightSameNotes, "highlightSameNotes")
    bindSetting(ui.settingHighlightSameNotesDigit, "highlightSameNotesDigit")
    bindSetting(ui.settingDoubleClickFillNote, "doubleClickFillSingleNote")
    bindSetting(ui.settingHighlightUnique, "highlightUnique")
    bindSetting(ui.settingNumberFirst, "numberFirst")

    ui.btnResetArchive.addEventListener("click", () => {
      const ok = confirm("确定要清空本地数据吗？这会删除通关记录和进行中对局。")
      if (!ok) return
      clearAll()
      settings = loadSettings()
      progress = loadProgress()
      activeState = null
      applyBrightness()
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

    document.addEventListener("keydown", (e) => {
      if (!activeState) return
      if (activeState.paused) return
      if (!ui.settingsModal.classList.contains("hidden")) return
      if (!ui.screenGame || ui.screenGame.classList.contains("hidden")) return
      const t = e.target
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return

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

