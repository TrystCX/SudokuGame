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
    screenLevels: qs("#screen-levels"),
    screenGame: qs("#screen-game"),
    tabs: qs("#difficulty-tabs"),
    levelsScroll: qs("#levels-scroll"),
    levelsSpacer: qs("#levels-spacer"),
    levelsViewport: qs("#levels-viewport"),
    levelsStatus: qs("#levels-status"),
    board: qs("#board"),
    pad: qs("#pad"),
    btnBack: qs("#btn-back"),
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
    btnSettingsClose: qs("#btn-settings-close"),
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
    btnExport: qs("#btn-export"),
    btnImport: qs("#btn-import"),
    btnReset: qs("#btn-reset"),
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

  const openSettings = () => {
    applySettingsToUI()
    ui.settingsModal.classList.remove("hidden")
  }

  const closeSettings = () => {
    ui.settingsModal.classList.add("hidden")
  }

  const showLevelsScreen = () => {
    if (activeState) {
      activeState.paused = true
      persistActive()
      activeState = null
    }
    ui.screenGame.classList.add("hidden")
    ui.screenLevels.classList.remove("hidden")
    stopTimer()
    renderLevels()
  }

  const showGameScreen = () => {
    ui.screenLevels.classList.add("hidden")
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

  const levelMetaFor = (diff, idx) => {
    const done = progress?.[diff]?.[idx]
    if (done) return { kind: "good", text: formatTime(done.bestMs || done.ms || 0) }
    const playing = isPlaying(diff, idx)
    if (playing) return { kind: "playing", text: "进行中" }
    return { kind: "bad", text: "未通关" }
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
    const count = d[currentDiff].count
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
    const count = d[currentDiff].count
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
        title.textContent = `第 ${i + 1} 关`
        const meta = document.createElement("div")
        meta.className = "level-meta"
        const m = levelMetaFor(currentDiff, i)
        const tag = document.createElement("span")
        tag.className = "tag " + m.kind
        tag.textContent = m.text
        meta.appendChild(tag)
        tile.appendChild(title)
        tile.appendChild(meta)
        tile.addEventListener("click", () => startOrResumeGame(currentDiff, i))
        ui.levelsViewport.appendChild(tile)
      }
    }
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
        if (noteMask === 0) off = true
        else off = ((noteMask >> (n - 1)) & 1) === 0
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
    if (activeState.noteMode) ui.btnHint.textContent = "一键笔记"
    else ui.btnHint.textContent = "提示"
    if (!activeState.noteMode) activeState.bulkEraseNotes = false
    ui.btnErase.textContent = activeState.noteMode && activeState.bulkEraseNotes ? "一键擦除笔记" : "擦除"
  }

  const onCellClick = (idx) => {
    if (!activeState || activeState.paused) return
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
      notes[idx] = 0
    }

    activeState.errors[idx] = 0
    if (!givens[idx] && grid[idx] && activeState.solution) {
      const sol = activeState.solution.charCodeAt(idx) - 48
      if (grid[idx] !== sol) activeState.errors[idx] = 1
    }
    activeState.conflicts = recomputeAllConflicts(grid)

    activeState.undo.push({
      idx,
      pv: prevVal,
      nv: grid[idx],
      pn: prevNotes,
      nn: notes[idx],
      pe: prevErrors,
      ne: activeState.errors[idx],
    })
    if (activeState.undo.length > 200) activeState.undo.shift()

    if (kind === "fill" && nextVal && activeState.errors[idx] === 0) {
      const bit = 1 << (nextVal - 1)
      for (const p of peersOf[idx]) {
        if (grid[p] !== 0) continue
        notes[p] = notes[p] & ~bit
      }
    }

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
    const idx = activeState.selected
    if (idx < 0) return
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
    const u = activeState.undo.pop()
    if (!u) return
    const { grid, notes } = activeState
    grid[u.idx] = u.pv
    notes[u.idx] = u.pn
    activeState.errors[u.idx] = u.pe
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
    renderBoard()
    persistActive()
    toast("已覆盖更新所有笔记")
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
    if (a) restoreActiveState(a)
    else startNewGame(diff, idx)
    showGameScreen()
  }

  const restartCurrent = () => {
    if (!activeState) return
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
    activeState = null
    toast("通关！已记录用时")
  }

  const wireUI = () => {
    ui.levelsScroll.addEventListener("scroll", () => updateLevelViewport())
    window.addEventListener("resize", () => {
      if (!ui.screenLevels.classList.contains("hidden")) renderLevels()
    })
    ui.btnBack.addEventListener("click", showLevelsScreen)
    ui.btnPause.addEventListener("click", () => setPaused(true))
    ui.btnResume.addEventListener("click", () => setPaused(false))
    ui.btnRestart.addEventListener("click", () => restartCurrent())
    ui.btnPauseSettings.addEventListener("click", () => openSettings())
    ui.btnExit.addEventListener("click", exitGame)
    ui.btnUndo.addEventListener("click", undo)
    ui.btnErase.addEventListener("click", eraseSelected)
    ui.btnHint.addEventListener("click", () => {
      if (!activeState) return
      if (activeState.noteMode) autoNotes()
      else toast("提示系统后续加入")
    })
    ui.btnNote.addEventListener("click", () => {
      if (!activeState) return
      activeState.bulkEraseNotes = false
      activeState.noteMode = !activeState.noteMode
      updateActions()
      renderBoard()
      persistActive()
    })

    const open = () => openSettings()
    ui.btnSettings.addEventListener("click", open)
    ui.btnSettings2.addEventListener("click", open)
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

    ui.btnReset.addEventListener("click", () => {
      const ok = confirm("确定要清空本地数据吗？这会删除通关记录和进行中对局。")
      if (!ok) return
      clearAll()
      settings = loadSettings()
      progress = loadProgress()
      activeState = null
      applyBrightness()
      toast("已清空")
      closeSettings()
      showLevelsScreen()
    })

    ui.btnExport.addEventListener("click", async () => {
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
        toast("分享码已复制")
      } catch {
        prompt("复制分享码：", code)
      }
    })
    ui.btnImport.addEventListener("click", () => {
      const code = prompt("粘贴分享码：")
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
        toast("分享码解析失败")
      }
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
    renderTabs()
    buildBoard()
    buildPad()
    wireUI()
    applySettingsToUI()

    const k = loadLastActiveKey()
    if (k && k.includes(":")) {
      const [diff, idxStr] = k.split(":")
      const idx = Number(idxStr)
      const a = getActive(diff, idx)
      if (a && a.puzzle && a.solution) {
        currentDiff = a.difficulty || "easy"
        renderTabs()
        restoreActiveState(a)
        showGameScreen()
        toast("已恢复未完成对局")
        return
      }
    }
    showLevelsScreen()
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init)
  else init()
})()

