'use strict'
const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const crypto = require('node:crypto')
const { fork } = require('node:child_process')
const sharp = require('sharp')
const { inspect } = require('./pipeline.cjs')
const { validateOptions } = require('./contracts.cjs')
const { engineStatus } = require('./engine.cjs')
const { publishResult } = require('./export.cjs')
if (process.env.SCALEGO_TEST_DATA && !app.isPackaged) app.setPath('userData', path.resolve(process.env.SCALEGO_TEST_DATA))
if (!app.requestSingleInstanceLock()) app.exit(0)
app.on('second-instance', () => { if (window && !window.isDestroyed()) { if (window.isMinimized()) window.restore(); window.focus() } })
protocol.registerSchemesAsPrivileged([{ scheme: 'scalego-asset', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])
let window, activeChild, activeJob, processing = false, exportDirectory = null
const assets = new Map(), jobs = []
const engineRoot = () => app.isPackaged ? path.join(process.resourcesPath, 'engine') : path.join(__dirname, '..', 'runtime')
const workRoot = () => path.join(app.getPath('userData'), 'work')
const publicAsset = asset => ({ id: asset.id, name: asset.name, width: asset.width, height: asset.height, bytes: asset.bytes, format: asset.format, alpha: asset.alpha, url: `scalego-asset://image/${asset.id}`, thumbnail: `scalego-asset://image/${asset.id}?thumb=1` })
const publicJob = job => ({ id: job.id, assetId: job.assetId, name: job.name, status: job.status, percent: job.percent, stage: job.stage, error: job.error, options: job.options, result: job.result ? { ...publicAsset(assets.get(job.result.assetId)), originalBytes: job.result.originalBytes, quality: job.result.quality, warnings: job.result.warnings, elapsedMs: job.result.elapsedMs, targetMet: job.result.targetMet } : undefined })
const snapshot = () => ({ assets: [...assets.values()].filter(a => !a.result).map(publicAsset), jobs: jobs.map(publicJob), busy: processing, outputDirectory: exportDirectory ? path.basename(exportDirectory) : null })
let persistTimer
let persistChain = Promise.resolve()
function persistSession() {
  const savedJobs = jobs.slice(-400)
  const retained = new Set(savedJobs.map(job => job.result?.assetId).filter(Boolean))
  const data = JSON.stringify({ version: 1, assets: [...assets.values()].filter(asset => !asset.result || retained.has(asset.id)), jobs: savedJobs, exportDirectory })
  persistChain = persistChain.catch(() => {}).then(async () => {
    const target = path.join(app.getPath('userData'), 'session.json')
    const temporary = target + '.tmp'
    await fs.writeFile(temporary, data)
    await fs.rename(temporary, target)
  }).catch(error => { console.error('Cannot save session:', error.code) })
  return persistChain
}
async function restoreSession() {
  try {
    const data = JSON.parse(await fs.readFile(path.join(app.getPath('userData'), 'session.json'), 'utf8'))
    if (data.version !== 1 || !Array.isArray(data.assets) || !Array.isArray(data.jobs)) return
    const root = await fs.realpath(workRoot())
    const owned = async file => { if (typeof file !== 'string') return false; try { const relative = path.relative(root, await fs.realpath(file)); return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative) } catch { return false } }
    for (const asset of data.assets.slice(-600)) if (typeof asset.id === 'string' && typeof asset.name === 'string' && await owned(asset.path) && await owned(asset.thumbnailPath)) assets.set(asset.id, asset)
    for (const saved of data.jobs.slice(-400)) {
      if (!assets.has(saved.assetId)) continue
      try { saved.options = validateOptions(saved.options) } catch { continue }
      if (saved.result && (!assets.has(saved.result.assetId) || !await owned(saved.result.outputPath) || !await owned(saved.result.recipePath))) continue
      if (['running', 'queued'].includes(saved.status)) { saved.status = 'interrupted'; saved.stage = 'Прервано'; saved.percent = 0 }
      jobs.push(saved)
    }
    if (typeof data.exportDirectory === 'string') try { if ((await fs.stat(data.exportDirectory)).isDirectory()) exportDirectory = data.exportDirectory } catch {}
  } catch (error) { if (error.code !== 'ENOENT') console.error('Session recovery failed:', error.code || 'invalid JSON') }
}
function notify() { clearTimeout(persistTimer); persistTimer = setTimeout(() => void persistSession(), 100); if (window && !window.isDestroyed()) window.webContents.send('scalego:state', snapshot()) }
async function register(filePath, result = false, known = null) {
  const resolved = await fs.realpath(filePath)
  const existing = [...assets.values()].find(asset => asset.sourcePath === resolved && asset.result === result)
  if (existing) return existing
  let meta = known || await inspect(resolved)
  const id = crypto.randomUUID()
  const thumbnailPath = path.join(workRoot(), `${id}-thumb.png`)
  await fs.mkdir(workRoot(), { recursive: true })
  let storedPath = resolved
  if (!result) {
    storedPath = path.join(workRoot(), id + path.extname(resolved).toLowerCase())
    await fs.copyFile(resolved, storedPath, require('node:fs').constants.COPYFILE_EXCL)
    meta = await inspect(storedPath)
  }
  await sharp(storedPath, { limitInputPixels: 100_000_000 }).rotate().resize(256, 256, { fit: 'inside', withoutEnlargement: true }).png().toFile(thumbnailPath)
  const asset = { id, name: path.basename(resolved), path: storedPath, sourcePath: resolved, thumbnailPath, result, width: meta.width, height: meta.height, bytes: meta.bytes, format: meta.format, alpha: meta.alpha }
  assets.set(id, asset); return asset
}
async function importPaths(paths) {
  const errors = []
  for (const input of paths.slice(0, 200)) {
    try { if ([...assets.values()].filter(a => !a.result).length >= 200) throw new Error('В рабочей области уже 200 файлов. Уберите ненужные исходники.'); await register(input) } catch (error) { errors.push(`${path.basename(input)}: ${error.message}`) }
  }
  if (paths.length > 200) errors.push('За один раз можно добавить до 200 файлов.')
  notify(); return { errors }
}
function runWorker(payload, job) {
  return new Promise((resolve, reject) => {
    let settled = false
    const child = fork(path.join(__dirname, 'worker.cjs'), [], { execPath: process.execPath, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] })
    activeChild = child
    child.on('message', message => {
      if (message.type === 'progress' && job.status === 'running') { job.percent = Math.round(message.percent); job.stage = message.stage; notify() }
      if (message.type === 'result') { settled = true; resolve(message.result) }
      if (message.type === 'error') { settled = true; reject(new Error(message.message)) }
    })
    child.on('error', error => { settled = true; reject(error) })
    child.on('exit', code => { if (activeChild === child) activeChild = null; if (!settled) reject(new Error(job.status === 'canceled' ? 'Обработка отменена.' : `Процесс обработки завершился (код ${code}).`)) })
    child.stderr.on('data', () => {})
    child.send({ type: 'process', payload })
  })
}
async function processQueue() {
  if (processing) return
  processing = true; notify()
  try {
    for (const job of jobs.filter(j => j.status === 'queued')) {
      if (job.status !== 'queued') continue
      activeJob = job; job.status = 'running'; notify()
      const tempDirectory = path.join(workRoot(), job.id)
      try {
        const result = await runWorker({ input: assets.get(job.assetId).path, tempDirectory, options: job.options, engineRoot: engineRoot() }, job)
        if (job.status !== 'running') continue
        const output = await register(result.outputPath, true, result)
        if (job.status !== 'running') { assets.delete(output.id); continue }
        output.name = `${path.parse(job.name).name} · ${result.format.toUpperCase()}`
        job.result = { ...result, assetId: output.id }; job.status = 'done'; job.percent = 100; job.stage = 'Готово'
        await fs.writeFile(path.join(tempDirectory, 'job.json'), JSON.stringify({ source: assets.get(job.assetId).path, options: job.options, result }, null, 2))
      } catch (error) { if (job.status === 'running') { job.status = 'error'; job.error = error.message; job.stage = 'Ошибка' } }
      finally { activeJob = null; notify() }
    }
  } finally { processing = false; notify() }
}
async function exportJob(id) {
  const job = jobs.find(j => j.id === id && j.status === 'done')
  if (!job?.result) throw new Error('Результат ещё не готов.')
  if (!exportDirectory) {
    const choice = await dialog.showOpenDialog(window, { title: 'Куда сохранить результаты', properties: ['openDirectory', 'createDirectory'] })
    if (choice.canceled) return { canceled: true }
    exportDirectory = await fs.realpath(choice.filePaths[0]); notify()
  }
  return publishResult({ outputPath: job.result.outputPath, recipePath: job.result.recipePath, directory: exportDirectory, name: job.name })
}
function handle(name, handler) {
  ipcMain.handle(`scalego:${name}`, async (event, payload) => {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Недопустимый источник запроса.')
    return handler(payload)
  })
}
app.whenReady().then(async () => {
  await fs.mkdir(workRoot(), { recursive: true })
  await restoreSession()
  protocol.handle('scalego-asset', async request => {
    const url = new URL(request.url)
    const asset = url.hostname === 'image' ? assets.get(url.pathname.slice(1)) : null
    if (!asset) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(url.searchParams.has('thumb') ? asset.thumbnailPath : asset.path).href)
  })
  handle('state', snapshot)
  handle('engine', () => engineStatus(engineRoot()))
  handle('import', async () => {
    const chosen = await dialog.showOpenDialog(window, { title: 'Добавить изображения', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Изображения', extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif'] }] })
    return chosen.canceled ? { errors: [] } : importPaths(chosen.filePaths)
  })
  handle('drop', paths => {
    if (!Array.isArray(paths) || paths.some(p => typeof p !== 'string' || !path.isAbsolute(p))) throw new Error('Некорректные файлы.')
    return importPaths(paths)
  })
  handle('remove', async id => {
    if (processing) throw new Error('Дождитесь завершения очереди.')
    const source = assets.get(id)
    if (!source || source.result) return
    const related = jobs.filter(job => job.assetId === id)
    const ownedAssets = [source, ...related.map(job => assets.get(job.result?.assetId)).filter(Boolean)]
    const cleanup = [...ownedAssets.flatMap(asset => [asset.path, asset.thumbnailPath]), ...related.map(job => path.join(workRoot(), job.id))]
    for (const asset of ownedAssets) assets.delete(asset.id)
    for (let i = jobs.length - 1; i >= 0; i--) if (jobs[i].assetId === id) jobs.splice(i, 1)
    notify()
    const root = await fs.realpath(workRoot())
    for (const file of cleanup) {
      try {
        const resolved = await fs.realpath(file), relative = path.relative(root, resolved)
        if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) continue
        await fs.rm(resolved, { recursive: true, force: true })
      } catch (error) { if (error.code !== 'ENOENT') console.error('Cannot remove workspace file:', error.code) }
    }
  })
  handle('start', async payload => {
    if (processing) throw new Error('Очередь уже выполняется.')
    const options = validateOptions(payload?.options)
    if (!Array.isArray(payload?.ids) || !payload.ids.length || payload.ids.length > 200 || payload.ids.some(id => !assets.has(id) || assets.get(id).result)) throw new Error('Выберите исходные изображения.')
    if (options.mode !== 'compress' && options.method === 'ai' && !(await engineStatus(engineRoot())).available) throw new Error('AI-движок не установлен. Выберите обычное увеличение.')
    if (processing) throw new Error('Очередь уже выполняется.')
    for (const id of new Set(payload.ids)) jobs.push({ id: crypto.randomUUID(), assetId: id, name: assets.get(id).name, options, status: 'queued', percent: 0, stage: 'В очереди' })
    void processQueue(); return snapshot()
  })
  handle('resume', () => {
    if (processing) throw new Error('Очередь уже выполняется.')
    for (const job of jobs.filter(j => j.status === 'interrupted')) { job.id = crypto.randomUUID(); job.status = 'queued'; job.stage = 'В очереди'; job.percent = 0 }
    void processQueue(); return snapshot()
  })
  handle('cancel', () => { for (const job of jobs) if (['queued', 'running'].includes(job.status)) { job.status = 'canceled'; job.stage = 'Отменено' } if (activeChild?.connected) activeChild.send({ type: 'cancel' }); notify() })
  handle('export', id => exportJob(id))
  handle('export-all', async () => {
    if (processing) throw new Error('Дождитесь завершения обработки.')
    let count = 0
    const latest = new Map()
    for (const job of jobs) if (job.status === 'done') latest.set(job.assetId, job)
    for (const job of latest.values()) { const result = await exportJob(job.id); if (result.canceled) return { count, canceled: true }; count++ }
    return { count, canceled: false }
  })
  handle('directory', async () => { const choice = await dialog.showOpenDialog(window, { properties: ['openDirectory', 'createDirectory'] }); if (!choice.canceled) exportDirectory = await fs.realpath(choice.filePaths[0]); notify(); return snapshot() })
  handle('reveal', async () => { if (exportDirectory) await shell.openPath(exportDirectory) })
  window = new BrowserWindow({ width: 1440, height: 940, minWidth: 900, minHeight: 640, title: 'SCALEGO', backgroundColor: '#0d0f12', show: false, autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', event => event.preventDefault())
  if (process.env.SCALEGO_DEV_URL && !app.isPackaged) await window.loadURL('http://127.0.0.1:5178')
  else await window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  window.show()
  if (process.env.SCALEGO_SMOKE_INPUT && !app.isPackaged) await importPaths(JSON.parse(process.env.SCALEGO_SMOKE_INPUT))
})
let quitting = false
app.on('before-quit', event => {
  if (quitting) return
  event.preventDefault(); quitting = true; clearTimeout(persistTimer)
  for (const job of jobs) if (['running','queued'].includes(job.status)) { job.status = 'interrupted'; job.stage = 'Прервано' }
  if (activeChild?.connected) activeChild.send({ type: 'cancel' })
  void persistSession().finally(() => app.quit())
})
app.on('window-all-closed', () => app.quit())
