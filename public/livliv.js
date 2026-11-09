// LivLiv 角色库：把 player 运行时接进 RuiC-2D，21 个精选角色与本地工程并排浏览、直接开演。
// 角色素材由 LivLiv（livliv.ai）提供，非商业使用、须署名；播放器按包内 meta.watermark 绘制水印。
import { Player } from './vendor/livliv/index.js'

const $ = (id) => document.getElementById(id)
const stage = $('lv-stage'), canvas = $('lv-canvas'), poster = $('lv-poster'), frameEl = $('lv-frame')
const statusEl = $('lv-status'), listEl = $('lv-list'), countEl = $('lv-count'), filterEl = $('lv-filter')
const nameEl = $('lv-name'), subEl = $('lv-sub'), creditEl = document.querySelector('.lv-credit'), exprsEl = $('lv-exprs'), actsEl = $('lv-acts'), tray = $('lv-tray')

const BG_ORDER = ['transparent', 'dark', 'green', 'white']
const q = new URLSearchParams(location.search)
let bg = BG_ORDER.includes(q.get('bg')) ? q.get('bg') : 'transparent'
let characters = [], locals = [], current = null, player = null, mic = null, cam = null

/* ---------- 状态提示 ---------- */
function showStatus(text, isError = false) {
  statusEl.hidden = false
  statusEl.className = 'lv-status' + (isError ? ' error' : '')
  statusEl.replaceChildren()
  if (!isError) { const s = document.createElement('span'); s.className = 'lv-spinner'; statusEl.append(s) }
  const t = document.createElement('span'); t.textContent = text; statusEl.append(t)
}
const hideStatus = () => { statusEl.hidden = true }

/* ---------- 背景 ---------- */
function setBackground(v) {
  bg = v
  stage.className = 'lv-stage' + (v === 'transparent' ? '' : ' bg-' + v)
  if (frameEl && !frameEl.hidden) reloadFrame()
}

/* ---------- 列表 ---------- */
function renderList(keyword = '') {
  const kw = keyword.trim().toLowerCase()
  listEl.replaceChildren()
  const group = (title) => {
    const h = document.createElement('div'); h.className = 'lv-group'; h.textContent = title; listEl.append(h)
  }
  const match = (e) => !kw || e.name.toLowerCase().includes(kw) || (e.id || '').toLowerCase().includes(kw)
  const livliv = characters.filter(match), local = locals.filter(match)

  if (livliv.length) {
    group('LivLiv 精选 · ' + livliv.length)
    for (const e of livliv) listEl.append(charRow(e, '../characters/avatar/' + e.id + '.webp', e.id))
  }
  if (local.length) {
    group('本机工程 · ' + local.length)
    for (const e of local) listEl.append(charRow(e, '/cases/' + e.id + '.webp', 'RuiC-2D'))
  }
  if (!livliv.length && !local.length) {
    const empty = document.createElement('p'); empty.className = 'lv-empty'; empty.textContent = '没有匹配的角色'; listEl.append(empty)
  }
  countEl.textContent = characters.length + ' + ' + locals.length + ' 位'
  markActive()
}

function charRow(entry, src, small) {
  const b = document.createElement('button')
  b.className = 'lv-char'; b.type = 'button'; b.role = 'option'
  b.dataset.kind = entry.kind; b.dataset.id = entry.id
  const img = document.createElement('img'); img.src = src; img.alt = ''; img.loading = 'lazy'
  img.onerror = () => { img.style.visibility = 'hidden' }
  const meta = document.createElement('div'); meta.className = 'meta'
  const b1 = document.createElement('b'); b1.textContent = entry.name
  const b2 = document.createElement('small'); b2.textContent = small
  meta.append(b1, b2)
  b.append(img, meta)
  b.onclick = () => select(entry)
  return b
}

function markActive() {
  for (const el of listEl.querySelectorAll('.lv-char')) {
    const on = current && el.dataset.kind === current.kind && el.dataset.id === current.id
    el.classList.toggle('active', !!on)
    el.setAttribute('aria-selected', String(!!on))
  }
}

/* ---------- 打开角色 ---------- */
async function select(entry) {
  if (current && current.kind === entry.kind && current.id === entry.id && (player || !frameEl.hidden)) return
  current = entry
  markActive()
  if (entry.kind === 'local') return openLocal(entry)
  return openLivLiv(entry)
}

async function openLivLiv(entry) {
  hideFrame()
  canvas.style.display = ''
  tray.hidden = false
  creditEl.hidden = false
  stopDevices()
  nameEl.textContent = entry.name
  subEl.textContent = 'LivLiv 精选角色'
  poster.src = '../characters/cover/' + entry.id + '.webp'
  poster.classList.add('show')
  showStatus('正在载入 ' + entry.name + '…')
  if (!player) player = new Player(canvas, { followPointer: 'page', maxPixelRatio: Math.min(2, window.devicePixelRatio || 1) })
  try {
    const info = await player.load('../characters/' + entry.id + '.livliv', { poster: '../characters/cover/' + entry.id + '.webp' })
    hideStatus()
    poster.classList.remove('show')
    subEl.textContent = (info.meta?.license?.id || 'LivLiv') + ' · 格式 v' + info.version + (entry.credit ? ' · ' + entry.credit : '')
    buildExpressions(info.expressions || [])
    buildActions()
    player.play()
  } catch (e) {
    poster.classList.remove('show')
    showStatus(e?.message || '角色载入失败', true)
  }
}

function openLocal(entry) {
  stopDevices()
  if (player) player.pause()
  canvas.style.display = 'none'
  hideStatus()
  poster.classList.remove('show')
  tray.hidden = true
  creditEl.hidden = true
  nameEl.textContent = entry.name
  subEl.textContent = 'RuiC-2D 本机工程'
  frameEl.hidden = false
  frameEl.src = '/player.html?project=' + encodeURIComponent(entry.id) + '&bg=' + encodeURIComponent(bg)
}

function reloadFrame() {
  if (!current || current.kind !== 'local') return
  frameEl.src = '/player.html?project=' + encodeURIComponent(current.id) + '&bg=' + encodeURIComponent(bg)
}

function hideFrame() {
  if (!frameEl.hidden) { frameEl.hidden = true; frameEl.removeAttribute('src') }
}

/* ---------- 表情与动作 ---------- */
function press(button, row) {
  for (const b of row.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === button))
}

function buildExpressions(list) {
  exprsEl.replaceChildren()
  const neutral = document.createElement('button')
  neutral.type = 'button'; neutral.textContent = '自然'
  neutral.setAttribute('aria-pressed', 'true')
  neutral.onclick = () => { player.setExpression(null); press(neutral, exprsEl) }
  exprsEl.append(neutral)
  for (const e of list) {
    const b = document.createElement('button')
    b.type = 'button'; b.textContent = e.label; b.title = e.id
    b.onclick = () => { if (player.setExpression(e.id)) press(b, exprsEl) }
    exprsEl.append(b)
  }
}

const ACTIONS = [['nod', '点头'], ['shake', '摇头'], ['tilt', '歪头'], ['hop', '跳一下'], ['shy', '害羞']]
function buildActions() {
  actsEl.replaceChildren()
  for (const [id, label] of ACTIONS) {
    const b = document.createElement('button')
    b.type = 'button'; b.textContent = label
    b.onclick = () => player.act(id)
    actsEl.append(b)
  }
}

/* ---------- 设备：麦克风口型 / 摄像头追踪 ---------- */
function stopDevices() {
  if (mic) { try { mic.stop() } catch {} ; mic = null; $('lv-mic').setAttribute('aria-pressed', 'false') }
  if (cam) { try { cam.stop() } catch {} ; cam = null; $('lv-cam').setAttribute('aria-pressed', 'false') }
}

$('lv-mic').onclick = async () => {
  const btn = $('lv-mic')
  if (!player || !current || current.kind !== 'livliv') return showStatus('请先选一个 LivLiv 角色', true)
  if (mic) { stopDevices(); return }
  try {
    showStatus('正在打开麦克风…')
    const { startLipSync } = await import('./vendor/livliv/voice.js')
    mic = await startLipSync(player)
    hideStatus(); btn.setAttribute('aria-pressed', 'true')
  } catch (e) { showStatus('麦克风没打开：' + (e?.message || e), true) }
}

$('lv-cam').onclick = async () => {
  const btn = $('lv-cam')
  if (!player || !current || current.kind !== 'livliv') return showStatus('请先选一个 LivLiv 角色', true)
  if (cam) { stopDevices(); return }
  try {
    showStatus('正在准备摄像头追踪（首次要下载约 8 MB 面部模型）…')
    const { startFaceTracking } = await import('./vendor/livliv/tracking.js')
    cam = await startFaceTracking(player, {
      modelUrl: 'mediapipe/face_landmarker.task',
      onProgress: (s) => {
        if (s.step === 'download') showStatus('正在下载追踪模型 ' + Math.round((s.progress || 0) * 100) + '%…')
        else if (s.step === 'prepare') showStatus('正在初始化追踪…')
        else if (s.step === 'camera') showStatus('正在请求摄像头权限…')
      },
    })
    hideStatus(); btn.setAttribute('aria-pressed', 'true')
  } catch (e) { showStatus('摄像头没开起来：' + (e?.message || e), true) }
}

/* ---------- 顶栏动作 ---------- */
$('lv-bg').onclick = () => {
  const i = BG_ORDER.indexOf(bg)
  setBackground(BG_ORDER[(i + 1) % BG_ORDER.length])
}

$('lv-reset').onclick = () => {
  if (!player) return
  player.view = { x: 0, y: 0, zoom: 1, head: false }
  player.resize()
}

$('lv-shot').onclick = () => {
  if (!player || !current || current.kind !== 'livliv') return showStatus('截图只对 LivLiv 角色有效', true)
  try {
    const url = player.snapshot()
    const a = document.createElement('a')
    a.href = url
    a.download = 'ruic2d-' + current.id + '-' + Date.now() + '.png'
    a.click()
  } catch (e) { showStatus('截图失败：' + (e?.message || e), true) }
}

const obsDialog = $('lv-obs-dialog')
$('lv-obs').onclick = () => {
  if (!current) return
  const sel = current.kind === 'local' ? 'local=' + encodeURIComponent(current.id) : 'id=' + encodeURIComponent(current.id)
  $('lv-obs-url').value = location.origin + '/livliv.html?' + sel + '&bg=' + (bg === 'transparent' ? 'transparent' : bg) + '&chrome=0'
  obsDialog.showModal()
}
$('lv-obs-close').onclick = () => obsDialog.close()
$('lv-obs-copy').onclick = async () => {
  const btn = $('lv-obs-copy')
  try { await navigator.clipboard.writeText($('lv-obs-url').value); btn.textContent = '已复制' }
  catch { $('lv-obs-url').select(); document.execCommand('copy'); btn.textContent = '已复制' }
  setTimeout(() => { btn.textContent = '复制' }, 1600)
}

/* ---------- 启动 ---------- */
async function boot() {
  setBackground(bg)
  if (q.get('chrome') === '0') document.body.classList.add('chrome-off')
  if (!Player.isSupported()) {
    showStatus('这个浏览器没有可用的 WebGL2，角色无法绘制。请用最新版 Chrome / Edge 打开。', true)
    return
  }
  try {
    const [idx, proj] = await Promise.all([
      fetch('../characters/index.json').then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() }),
      fetch('/api/projects').then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ])
    characters = (Array.isArray(idx) ? idx : []).map((c) => ({ ...c, kind: 'livliv' }))
    locals = (Array.isArray(proj) ? proj : []).map((p) => ({ id: p.id, name: p.name, kind: 'local' }))
  } catch (e) {
    showStatus('角色索引载入失败：' + (e?.message || e), true)
    return
  }
  renderList()
  const wantId = q.get('id'), wantLocal = q.get('local')
  const first = (wantId && characters.find((c) => c.id === wantId))
    || (wantLocal && locals.find((l) => l.id === wantLocal))
    || characters[0]
    || locals[0]
  if (first) select(first)
  else showStatus('还没有可选角色', true)

  filterEl.oninput = () => renderList(filterEl.value)
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    if (e.target instanceof HTMLInputElement) return
    const all = [...characters, ...locals]
    const i = all.findIndex((c) => current && c.kind === current.kind && c.id === current.id)
    if (i < 0) return
    const next = all[(i + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length]
    select(next)
    e.preventDefault()
  })
}

boot()
