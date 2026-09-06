const fs = require('node:fs/promises')
const path = require('node:path')
const assert = require('node:assert/strict')
const sharp = require('sharp')
const crypto = require('node:crypto')
const { _electron: electron } = require('playwright')
const root = path.join(__dirname, '..')
const options = { mode: 'upscale', method: 'lanczos', model: 'illustration', scale: 4, format: 'png', quality: 85, lossless: false, background: '#ffffff', targetKB: 0 }
async function waitState(page, predicate, timeout = 30000) {
  const until = Date.now() + timeout
  while (true) {
    const state = await page.evaluate(async () => await window.scalego.state())
    if (predicate(state)) return state
    assert.ok(Date.now() < until, 'Queue state timed out: ' + JSON.stringify(state.jobs))
    await page.waitForTimeout(100)
  }
}
;(async () => {
  const artifacts = path.join(root, 'artifacts'); await fs.mkdir(artifacts, { recursive: true })
  const profile = await fs.mkdtemp(path.join(artifacts, 'queue-session-'))
  const files = ['too-large.png', 'valid.png', 'noise.png'].map(name => path.join(profile, name))
  await sharp({ create: { width: 3072, height: 2304, channels: 3, background: '#f4511e' } }).png().toFile(files[0])
  await sharp({ create: { width: 96, height: 80, channels: 4, background: '#aabbcc88' } }).png().toFile(files[1])
  await sharp(crypto.randomBytes(768 * 768 * 3), { raw: { width: 768, height: 768, channels: 3 } }).png().toFile(files[2])
  const env = { ...process.env, SCALEGO_TEST_DATA: profile, SCALEGO_SMOKE_INPUT: JSON.stringify(files) }; delete env.ELECTRON_RUN_AS_NODE
  let desktop = await electron.launch({ args: [root], env })
  let page = await desktop.firstWindow()
  try {
    const imported = await waitState(page, s => s.assets.length === 3)
    const ids = imported.assets.map(a => a.id)
    await page.evaluate(({ ids, options }) => window.scalego.start(ids, options), { ids: ids.slice(0, 2), options })
    let state = await waitState(page, s => !s.busy && s.jobs.length === 2)
    assert.deepEqual(state.jobs.map(j => j.status), ['error', 'done'])
    assert.match(state.jobs[0].error, /лимит/)
    const compression = { ...options, mode: 'compress', format: 'avif' }
    await page.evaluate(({ ids, options }) => window.scalego.start(ids, options), { ids: [ids[2], ids[1]], options: compression })
    await waitState(page, s => s.jobs.some(j => j.status === 'running'))
    await page.getByRole('button', { name: 'Отменить', exact: true }).click()
    state = await waitState(page, s => !s.busy)
    assert.deepEqual(state.jobs.slice(-2).map(j => j.status), ['canceled', 'canceled'])
    assert.ok(state.jobs.slice(-2).every(j => !j.result))
    await page.evaluate(({ ids, options }) => window.scalego.start(ids, options), { ids: [ids[2], ids[1]], options: compression })
    await waitState(page, s => s.jobs.some(j => j.status === 'running'))
    await desktop.close(); desktop = null
    const restoredEnv = { ...env }; delete restoredEnv.SCALEGO_SMOKE_INPUT
    desktop = await electron.launch({ args: [root], env: restoredEnv }); page = await desktop.firstWindow()
    state = await waitState(page, s => s.jobs.length === 6)
    assert.deepEqual(state.jobs.slice(-2).map(j => j.status), ['interrupted', 'interrupted'])
    await page.getByRole('button', { name: 'Продолжить очередь', exact: true }).click()
    state = await waitState(page, s => !s.busy && s.jobs.slice(-2).every(j => j.status === 'done'), 120000)
    const exported = path.join(profile, 'export'); await fs.mkdir(exported)
    await desktop.evaluate(({ dialog }, directory) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] }) }, exported)
    await page.getByRole('button', { name: 'Сохранить все', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Сохранено файлов: 2' }).waitFor()
    const outputFiles = await fs.readdir(exported)
    assert.equal(outputFiles.filter(name => name.endsWith('.avif')).length, 2)
    assert.equal(outputFiles.filter(name => name.endsWith('.scalego')).length, 2)
    const bad = path.join(profile, 'corrupt.png'); await fs.writeFile(bad, 'invalid image')
    await desktop.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }) }, bad)
    await page.getByRole('button', { name: 'Добавить', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: 'corrupt.png' }).waitFor()
    await page.evaluate(id => window.scalego.remove(id), ids[1])
    state = await page.evaluate(() => window.scalego.state())
    assert.equal(state.assets.length, 2)
    assert.ok(state.jobs.every(j => j.assetId !== ids[1]))
    await fs.access(files[1])
    console.log('Queue smoke passed: partial failure, running/queued cancellation, interrupted session resume, latest-result batch export, corrupt import, source removal without original deletion.')
  } finally { if (desktop) await desktop.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
