// Attach to an already launched portable preview. NSIS does not forward the
// debug websocket announcements required by Playwright's electron.launch().
const fs = require('node:fs/promises')
const path = require('node:path')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const profile = path.resolve(process.argv[2])
const inspectorPort = Number(process.argv[3])
;(async () => {
  const source = path.join(profile, 'smoke-source.png')
  await fs.access(source)
  const [port] = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')
  const targets = await (await fetch(`http://127.0.0.1:${inspectorPort}/json/list`)).json()
  const socket = new WebSocket(targets[0].webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  let sequence = 0
  const pending = new Map()
  socket.onmessage = message => { const reply = JSON.parse(message.data); if (pending.has(reply.id)) { pending.get(reply.id)(reply); pending.delete(reply.id) } }
  const evaluate = async expression => {
    const id = ++sequence
    const response = new Promise(resolve => pending.set(id, resolve))
    socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expression + '; void 0', awaitPromise: true, returnByValue: true } }))
    const reply = await response
    assert.ok(!reply.error && !reply.result?.exceptionDetails, JSON.stringify(reply))
    return reply.result?.result?.value
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
  try {
    const page = browser.contexts()[0].pages()[0]
    await page.getByRole('button', { name: 'Добавить', exact: true }).waitFor()
    await evaluate(`process.getBuiltinModule('module').createRequire(process.resourcesPath + '/app.asar/package.json')('electron').dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [${JSON.stringify(source)}] })`)
    await page.getByRole('button', { name: 'Добавить', exact: true }).click()
    await page.getByText('smoke-source.png', { exact: true }).waitFor()
    const engine = await page.evaluate(() => window.scalego.engine()); assert.equal(engine.available, true)
    await page.getByRole('radio', { name: /Увеличить и сжать/ }).check()
    await page.getByRole('button', { name: 'Обработать', exact: true }).click()
    const until = Date.now() + 120000
    let state
    do {
      state = await page.evaluate(() => window.scalego.state())
      if (state.jobs.length && !state.busy) break
      assert.ok(Date.now() < until, 'Portable processing timed out')
      await page.waitForTimeout(100)
    } while (true)
    const job = state.jobs.at(-1)
    assert.equal(job.status, 'done', job.error); assert.equal(job.result.width, 960); assert.equal(job.result.alpha, true)
    const output = path.join(profile, 'portable-export'); await fs.mkdir(output, { recursive: true })
    await evaluate(`process.getBuiltinModule('module').createRequire(process.resourcesPath + '/app.asar/package.json')('electron').dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [${JSON.stringify(output)}] })`)
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
    await page.getByText(/Сохранено: smoke-source-scalego/).waitFor()
    assert.ok((await fs.readdir(output)).some(name => name.endsWith('.webp.scalego')))
    await page.screenshot({ path: path.join(__dirname, '../artifacts/portable-result.png') })
    console.log('Portable executable passed: extraction, window, bundled Vulkan model, AI + WebP with alpha, export and recipe.')
  } finally {
    try { await evaluate("setTimeout(() => process.getBuiltinModule('module').createRequire(process.resourcesPath + '/app.asar/package.json')('electron').app.quit(), 100)") }
    finally { socket.close(); await browser.close() }
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
