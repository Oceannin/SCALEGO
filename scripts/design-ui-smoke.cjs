// Renderer-only validation for the glass/metal experiment. No AI, IPC, or real exports.
// Run: node scripts/design-ui-smoke.cjs
// Optional: SCALEGO_UI_URL=http://127.0.0.1:5173 (otherwise starts its own Vite server).
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const { existsSync } = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')
const { chromium } = require('playwright')

const root = path.resolve(__dirname, '..')
const artifacts = path.join(root, 'artifacts', 'glass-metal')
const sizes = [[1600, 1000], [940, 700], [900, 640], [1200, 800]]
const defaults = { model: 'fast', mode: 'chain', method: 'ai', scale: 2, format: 'webp', quality: 85, lossless: false, background: '#ffffff', targetKB: 0 }

async function makeFixture() {
  // Render the same deterministic, transparent illustration at two resolutions.
  // These are UI fixtures, not claims about any engine's output quality.
  const art = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="768" height="576" viewBox="0 0 768 576">
    <defs>
      <linearGradient id="sky" x2="0" y2="1"><stop stop-color="#dce9e3"/><stop offset="1" stop-color="#f0e1c5"/></linearGradient>
      <linearGradient id="wall" x2="1" y2="1"><stop stop-color="#edc8a3"/><stop offset="1" stop-color="#b87252"/></linearGradient>
      <linearGradient id="floor" x2="0" y2="1"><stop stop-color="#d1ad87"/><stop offset="1" stop-color="#f1dcc1"/></linearGradient>
      <clipPath id="card"><rect x="36" y="28" width="696" height="520" rx="12"/></clipPath>
    </defs>
    <g clip-path="url(#card)">
      <rect x="36" y="28" width="696" height="520" fill="url(#sky)"/>
      <circle cx="571" cy="158" r="58" fill="#fbf0cc"/>
      <path d="M36 286Q193 146 333 288T732 247V548H36Z" fill="#739187"/>
      <path d="M36 343Q213 202 392 357T732 299V548H36Z" fill="#456e68"/>
      <path d="M36 410Q249 319 422 417T732 379V548H36Z" fill="#2b504d"/>
      <path fill="url(#wall)" fill-rule="evenodd" d="M36 28H423V493H36ZM141 439H320V222A89.5 89.5 0 0 0 141 222Z"/>
      <path d="M124 439V222A106.5 106.5 0 0 1 337 222V439" fill="none" stroke="#f6d5ad" stroke-width="15"/>
      <path d="M36 439H732V548H36Z" fill="url(#floor)"/>
      <path d="M141 439H320L512 548H239Z" fill="#65554b" opacity=".3"/>
      <path d="M420 439L600 548M542 439L722 548M36 491H732" stroke="#b58e72" stroke-width="2"/>
      <path d="M542 456L555 499H605L618 456Z" fill="#ad5b3c"/>
      <path d="M580 463V337M580 416Q529 407 530 367Q575 371 580 416M580 390Q624 375 626 339Q585 343 580 390M580 363Q548 344 554 318Q581 326 580 363" fill="#335b44" stroke="#335b44" stroke-width="6"/>
      <rect x="64" y="66" width="82" height="2" fill="#81543c" opacity=".6"/>
      <rect x="64" y="78" width="52" height="2" fill="#81543c" opacity=".35"/>
    </g>
  </svg>`)
  const original = await sharp(art).png().toBuffer()
  const result = await sharp(art, { density: 144 }).webp({ quality: 90 }).toBuffer()
  const thumbnail = await sharp(original).resize(96, 72).png().toBuffer()
  await Promise.all([
    fs.writeFile(path.join(artifacts, 'fixture-original.png'), original),
    fs.writeFile(path.join(artifacts, 'fixture-result.webp'), result),
  ])
  const url = `data:image/png;base64,${original.toString('base64')}`
  const resultUrl = `data:image/webp;base64,${result.toString('base64')}`
  const thumbUrl = `data:image/png;base64,${thumbnail.toString('base64')}`
  const assets = [
    { id: 'courtyard', name: 'Courtyard-study.png', width: 768, height: 576, bytes: original.length, format: 'png', alpha: true, url, thumbnail: thumbUrl },
    { id: 'courtyard-detail', name: 'Courtyard-detail-transparent.png', width: 768, height: 576, bytes: original.length, format: 'png', alpha: true, url, thumbnail: thumbUrl },
  ]
  const results = assets.map(asset => ({ ...asset, id: `${asset.id}-result`, name: asset.name.replace('.png', '-scalego.webp'), width: 1536, height: 1152, bytes: result.length, format: 'webp', url: resultUrl, originalBytes: original.length, quality: 85, warnings: [], elapsedMs: 4321, targetMet: true }))
  const models = [
    ['fast', 'Быстрое увеличение', 'realesr-animevideov3', [2, 3, 4], 'Быстрое увеличение с сохранением деталей.'],
    ['photo-natural', 'Фото · Естественно', 'RealESRGAN-x4plus', [4], 'Естественные текстуры и мягкие переходы.'],
    ['illustration-clean', 'Иллюстрации · Чисто', 'RealESRGAN-x4plus-anime', [4], 'Чёткие контуры и чистые цветовые области.'],
  ].map(([id, displayName, name, nativeScales, qualityProfile]) => ({ id, displayName, category: 'fixture', name, nativeScales, qualityProfile, available: true, message: 'Установлена', code: null }))
  return { assets, results, defaults, engine: { available: true, name: 'Локальный AI', message: 'Модели установлены', models } }
}

function installFixture(fixture) {
  localStorage.setItem('scalego-theme', 'dark')
  let snapshot = { assets: [], jobs: [], busy: false, outputDirectory: null }
  const listeners = new Set()
  const calls = []
  const clone = value => structuredClone(value)
  const record = (method, args = []) => calls.push({ method, args: clone(args) })
  const publish = next => { snapshot = clone(next); for (const callback of listeners) callback(clone(snapshot)); return clone(snapshot) }
  const jobFor = (asset, i, status = 'done') => ({ id: `job-${asset.id}`, assetId: asset.id, name: asset.name, status, percent: status === 'done' ? 100 : 0, stage: status === 'done' ? 'Готово' : 'Очередь прервана', options: clone(fixture.defaults), ...(status === 'done' ? { result: clone(fixture.results[i]) } : {}) })
  window.__designFixture = {
    calls,
    show(kind) {
      const next = { assets: clone(fixture.assets), jobs: [], busy: false, outputDirectory: snapshot.outputDirectory }
      if (kind === 'empty') next.assets = []
      if (kind === 'opaque') next.assets = [{ ...fixture.assets[0], id: 'opaque-fixture', alpha: false }]
      if (kind === 'result') next.jobs = fixture.assets.map((asset, i) => jobFor(asset, i))
      if (kind === 'interrupted') next.jobs = [jobFor(fixture.assets[0], 0), jobFor(fixture.assets[1], 1, 'interrupted')]
      if (kind === 'error') next.jobs = [{ ...jobFor(fixture.assets[0], 0, 'error'), stage: 'Ошибка', error: 'Не удалось обработать изображение. Проверьте выбранную модель и повторите запуск.' }]
      return publish(next)
    },
  }
  window.scalego = {
    state: async () => clone(snapshot),
    engine: async () => clone(fixture.engine),
    import: async () => { record('import'); window.__designFixture.show('loaded'); return { errors: [] } },
    drop: async files => { record('drop', [files.map(file => file.name)]); window.__designFixture.show('loaded'); return { errors: [] } },
    remove: async id => { record('remove', [id]); publish({ ...snapshot, assets: snapshot.assets.filter(asset => asset.id !== id), jobs: snapshot.jobs.filter(job => job.assetId !== id) }) },
    start: async (ids, options) => {
      record('start', [ids, options])
      return publish({ ...snapshot, busy: true, jobs: ids.map((id, i) => ({ id: `run-${id}`, assetId: id, name: fixture.assets.find(asset => asset.id === id).name, status: i ? 'queued' : 'running', percent: i ? 0 : 42, stage: i ? 'В очереди' : 'Увеличение изображения', options: clone(options) })) })
    },
    resume: async () => { record('resume'); return publish({ ...snapshot, busy: true, jobs: snapshot.jobs.map(job => job.status === 'interrupted' ? { ...job, status: 'running', percent: 31, stage: 'Возобновление обработки' } : job) }) },
    cancel: async () => { record('cancel'); publish({ ...snapshot, busy: false, jobs: snapshot.jobs.map(job => ['running', 'queued'].includes(job.status) ? { ...job, status: 'canceled', stage: 'Отменено' } : job) }) },
    export: async id => { record('export', [id]); return { canceled: false, name: 'Courtyard-study-scalego.webp' } },
    exportAll: async () => { record('exportAll'); return { canceled: false, count: snapshot.jobs.filter(job => job.status === 'done').length } },
    directory: async () => { record('directory'); return publish({ ...snapshot, outputDirectory: 'C:\\Images\\SCALEGO results' }) },
    reveal: async () => { record('reveal') },
    onState: callback => { listeners.add(callback); return () => listeners.delete(callback) },
  }
}

async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}

function probeGpu(disableWebGL = false) {
  window.__gpuDraws = 0
  // Headless browser pages retain focus even after another tab is activated.
  // Model the document focus state and dispatch the same native lifecycle event.
  window.__setWindowFocus = focused => {
    Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => focused })
    window.dispatchEvent(new Event(focused ? 'focus' : 'blur'))
  }
  const draw = WebGLRenderingContext.prototype.drawArrays
  WebGLRenderingContext.prototype.drawArrays = function (...args) { window.__gpuDraws++; return draw.apply(this, args) }
  if (disableWebGL) for (const constructor of [HTMLCanvasElement, globalThis.OffscreenCanvas].filter(Boolean)) {
    const getContext = constructor.prototype.getContext
    constructor.prototype.getContext = function (type, ...args) { return /webgl/.test(type) ? null : getContext.call(this, type, ...args) }
  }
}

async function checkDecoration(browser, url, fixture, report) {
  const animated = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'no-preference' })
  animated.on('pageerror', error => report.errors.push(error.message))
  await animated.addInitScript(installFixture, fixture)
  await animated.addInitScript(probeGpu, false)
  await animated.goto(url)
  await animated.bringToFront()
  await animated.getByRole('button', { name: 'Добавить изображения', exact: true }).click()
  await animated.waitForFunction(() => window.__gpuDraws > 2, null, { timeout: 5000 })
  assert.equal(await animated.locator('.metal-accent').count(), 1, 'Only one signature canvas')
  await animated.evaluate(() => window.__designFixture.show('result'))
  await capture(animated, 'metal-active-dark-1600x1000', report.layouts)
  await animated.evaluate(() => window.__setWindowFocus(false))
  await animated.waitForFunction(() => document.querySelector('.metal-accent')?.dataset.paused === 'true')
  await animated.waitForTimeout(120)
  const pausedDraws = await animated.evaluate(() => window.__gpuDraws)
  await animated.waitForTimeout(160)
  assert.equal(await animated.evaluate(() => window.__gpuDraws), pausedDraws, 'Inactive window must stop decorative GPU draws')
  await animated.evaluate(() => window.__setWindowFocus(true))
  await animated.waitForFunction(count => window.__gpuDraws > count, pausedDraws)
  await animated.locator('.run-actions').getByRole('button', { name: /^Обработать/ }).click()
  await animated.getByRole('button', { name: 'Отменить', exact: true }).waitFor()
  assert.equal(await animated.locator('.metal-accent').count(), 0, 'Processing releases the signature renderer')
  await animated.waitForTimeout(120)
  const busyDraws = await animated.evaluate(() => window.__gpuDraws)
  await animated.waitForTimeout(160)
  assert.equal(await animated.evaluate(() => window.__gpuDraws), busyDraws, 'Processing must stop decorative GPU draws')
  await animated.getByRole('button', { name: 'Отменить', exact: true }).click()
  await animated.emulateMedia({ reducedMotion: 'reduce' })
  await animated.waitForFunction(() => !document.querySelector('.metal-accent'))
  await animated.waitForTimeout(120)
  const reducedDraws = await animated.evaluate(() => window.__gpuDraws)
  await animated.waitForTimeout(160)
  assert.equal(await animated.evaluate(() => window.__gpuDraws), reducedDraws, 'Reduced motion must release decorative GPU rendering')
  await animated.close()

  const fallback = await browser.newPage({ viewport: { width: 940, height: 700 }, reducedMotion: 'no-preference' })
  fallback.on('pageerror', error => report.errors.push(error.message))
  await fallback.addInitScript(installFixture, fixture)
  await fallback.addInitScript(probeGpu, true)
  await fallback.goto(url)
  await fallback.getByRole('button', { name: 'Добавить изображения', exact: true }).click()
  const processButton = fallback.locator('.run-actions').getByRole('button', { name: /^Обработать/ })
  assert.equal(await processButton.isEnabled(), true, 'CSS fallback preserves primary action without WebGL')
  await capture(fallback, 'webgl-disabled-dark-940x700', report.layouts)
  await processButton.click()
  await fallback.getByRole('button', { name: 'Отменить', exact: true }).waitFor()
  await fallback.close()
  report.checks.push('one real Metal FX canvas; GPU draws pause on simulated window focus events; GPU released during processing/reduced motion; WebGL failure leaves a working CSS action')
}

async function checkLayout(page, name, layouts) {
  await settle(page)
  const metrics = await page.evaluate(() => {
    const rect = selector => {
      const element = document.querySelector(selector)
      if (!element) return null
      const { x, y, width, height } = element.getBoundingClientRect()
      return { x, y, width, height }
    }
    return {
      viewport: { width: innerWidth, height: innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      header: rect('.app-header'), library: rect('.library'), canvas: rect('.viewport'),
      inspector: rect('.inspector'), metrics: rect('.result-bar'),
      actions: [...document.querySelectorAll('.run-actions button')].filter(button => button.getClientRects().length).map(button => {
        const { x, y, width, height } = button.getBoundingClientRect()
        return { name: button.textContent || button.getAttribute('aria-label'), x, y, width, height }
      }),
      imageStyles: [...document.querySelectorAll('.image-comparison img')].map(img => {
        const style = getComputedStyle(img)
        return { loaded: img.complete && img.naturalWidth > 0, filter: style.filter, opacity: style.opacity, mixBlendMode: style.mixBlendMode }
      }),
    }
  })
  layouts.push({ name, ...metrics })
  assert.ok(metrics.documentWidth <= metrics.viewport.width + 1, `${name}: horizontal document overflow`)
  assert.ok(metrics.documentHeight <= metrics.viewport.height + 1, `${name}: vertical document overflow`)
  for (const action of metrics.actions) {
    assert.ok(action.x >= -1 && action.y >= 0 && action.x + action.width <= metrics.viewport.width + 1 && action.y + action.height <= metrics.viewport.height + 1, `${name}: action outside window: ${action.name}`)
  }
  if (metrics.canvas) {
    assert.ok(metrics.canvas.width >= 200 && metrics.canvas.height >= 240, `${name}: image canvas too small (${metrics.canvas.width} × ${metrics.canvas.height})`)
    for (const style of metrics.imageStyles) {
      assert.equal(style.loaded, true, `${name}: fixture image failed to load`)
      assert.equal(style.filter, 'none', `${name}: image must not be filtered`)
      assert.equal(style.opacity, '1', `${name}: image must remain opaque`)
      assert.equal(style.mixBlendMode, 'normal', `${name}: image must not blend into the UI`)
    }
  }
}

async function capture(page, name, layouts) {
  await page.locator('.image-comparison img').evaluateAll(images => Promise.all(images.map(image => image.decode())))
  await checkLayout(page, name, layouts)
  await page.screenshot({ path: path.join(artifacts, `${name}.png`), animations: 'disabled' })
}

async function theme(page, value) {
  const current = await page.evaluate(() => document.documentElement.dataset.theme)
  if (current !== value) await page.getByRole('button', { name: value === 'light' ? 'Светлая тема' : 'Тёмная тема', exact: true }).click()
  await settle(page)
}

async function checkOptics(page, layouts) {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await theme(page, 'dark')
  await page.evaluate(() => window.__designFixture.show('opaque'))
  await page.waitForFunction(() => document.querySelector('.viewport')?.classList.contains('bg-neutral'))
  const closeNotice = page.getByRole('button', { name: 'Закрыть сообщение', exact: true })
  if (await closeNotice.count()) await closeNotice.click()
  await capture(page, 'opaque-neutral-dark-1600x1000', layouts)
  await page.getByRole('button', { name: 'Прозрачность подложка', exact: true }).click()
  assert.ok(await page.locator('.viewport.bg-checker').count(), 'Explicit background choice overrides contextual default')
  await page.evaluate(() => window.__designFixture.show('result'))
  await page.waitForFunction(() => document.querySelector('.viewport')?.classList.contains('bg-checker'))
  await page.getByRole('button', { name: 'Сравнить', exact: true }).click()
  const range = page.getByRole('slider', { name: 'Положение разделителя сравнения', exact: true })
  await range.press('Home')
  for (let i = 0; i < 55; i++) await range.press('ArrowRight')
  await page.locator('.app-header').click({ position: { x: 350, y: 20 } })
  const handle = page.locator('.comparison-handle')
  const handleBox = await handle.boundingBox()
  const image = page.locator('.image-comparison')
  const imageBox = await image.boundingBox()
  const before = await image.screenshot({ animations: 'disabled' })
  const bypass = await page.addStyleTag({ content: '.compare-glass .optical-refraction { filter: none !important; }' })
  const after = await image.screenshot({ animations: 'disabled' })
  const [originalPixels, bypassPixels] = await Promise.all([sharp(before).ensureAlpha().raw().toBuffer({ resolveWithObject: true }), sharp(after).ensureAlpha().raw().toBuffer({ resolveWithObject: true })])
  let changedInside = 0, changedOutside = 0
  for (let i = 0; i < originalPixels.data.length; i += 4) {
    const changed = [0, 1, 2].some(channel => Math.abs(originalPixels.data[i + channel] - bypassPixels.data[i + channel]) > 3)
    if (!changed) continue
    const x = i / 4 % originalPixels.info.width, y = Math.floor(i / 4 / originalPixels.info.width)
    if (x >= handleBox.x - imageBox.x - 2 && x <= handleBox.x - imageBox.x + handleBox.width + 2 && y >= handleBox.y - imageBox.y - 2 && y <= handleBox.y - imageBox.y + handleBox.height + 2) changedInside++
    else changedOutside++
  }
  assert.ok(changedInside > 20, 'Lens must visibly refract the sampled image, not merely add CSS chrome')
  assert.equal(changedOutside, 0, 'Refraction must not alter pixels outside the handle')
  await bypass.evaluate(element => element.remove())
  await handle.screenshot({ path: path.join(artifacts, 'optical-handle-detail.png') })
  const restingTransform = await handle.evaluate(element => getComputedStyle(element).transform)
  const mapBeforeDrag = await page.locator('.compare-glass feImage').getAttribute('href')
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
  await page.mouse.down()
  assert.notEqual(await handle.evaluate(element => getComputedStyle(element).transform), restingTransform, 'Pressed lens should squish')
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 8, handleBox.y + handleBox.height / 2)
  assert.equal(await page.locator('.compare-glass feImage').getAttribute('href'), mapBeforeDrag, 'Moving lens must reuse its displacement map')
  await page.screenshot({ path: path.join(artifacts, 'optical-handle-drag-dark.png'), animations: 'disabled' })
  await page.mouse.up()
  const indicator = page.locator('.segments > .optical-lens')
  const initialTransform = await indicator.evaluate(element => getComputedStyle(element).transform)
  await page.getByRole('button', { name: '3×', exact: true }).click()
  const nextTransform = await indicator.evaluate(element => getComputedStyle(element).transform)
  assert.notEqual(nextTransform, initialTransform, 'Scale lens must move between segments')
  await page.getByRole('button', { name: '2×', exact: true }).click()
  return { changedInside, changedOutside }
}

async function main() {
  await fs.mkdir(artifacts, { recursive: true })
  const fixture = await makeFixture()
  let server
  let browser
  let page
  const errors = []
  const layouts = []
  const requests = []
  const report = { scope: 'Renderer fixtures only; no processing, filesystem exports, or IPC validation.', browser: '', checks: [], layouts, errors }
  try {
    let url = process.env.SCALEGO_UI_URL
    if (!url) {
      const { createServer } = await import('vite')
      server = await createServer({ root, server: { host: '127.0.0.1', port: 0 }, clearScreen: false })
      await server.listen()
      url = server.resolvedUrls.local[0]
    }
    // Use the installed browser without downloading a separate runtime for a UI experiment.
    const launch = { headless: true }
    if (process.env.SCALEGO_UI_BROWSER) launch.channel = process.env.SCALEGO_UI_BROWSER
    else if (!existsSync(chromium.executablePath()) && process.platform === 'win32') launch.channel = 'msedge'
    report.browser = launch.channel || 'playwright-chromium'
    browser = await chromium.launch(launch)
    page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' })
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(url).origin) requests.push(request.url()) })
    await page.addInitScript(installFixture, fixture)
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Добавить изображения', exact: true }).waitFor()
    await capture(page, 'empty-dark-1600x1000', layouts)
    await theme(page, 'light')
    await page.setViewportSize({ width: 940, height: 700 })
    await capture(page, 'empty-light-940x700', layouts)

    await page.getByRole('button', { name: 'Добавить изображения', exact: true }).click()
    await page.locator('.asset-item').first().waitFor()
    await page.setViewportSize({ width: 1600, height: 1000 })
    await theme(page, 'dark')
    await capture(page, 'loaded-dark-1600x1000', layouts)
    assert.equal(await page.getByRole('button', { name: 'Сравнить', exact: true }).isDisabled(), true)
    assert.equal(await page.getByRole('button', { name: 'Результат', exact: true }).isDisabled(), true)

    const processButton = () => page.locator('.run-actions').getByRole('button', { name: /^Обработать/ })
    await page.getByRole('checkbox', { name: 'Выбрать все', exact: true }).uncheck()
    assert.equal(await processButton().isDisabled(), true)
    await page.getByRole('checkbox', { name: 'Выбрать Courtyard-study.png', exact: true }).check()
    assert.equal(await processButton().isEnabled(), true)
    await page.getByRole('checkbox', { name: 'Выбрать все', exact: true }).check()
    await page.locator('input[name="mode"][value="upscale"]').check()
    assert.equal(await page.getByRole('slider', { name: 'Качество сжатия' }).count(), 0)
    for (const scale of [2, 3, 4]) {
      const button = page.getByRole('button', { name: `${scale}×`, exact: true })
      await button.click()
      assert.equal(await button.getAttribute('aria-pressed'), 'true')
    }
    for (const method of ['lanczos', 'nearest', 'ai']) {
      await page.getByRole('combobox', { name: /^Метод/ }).selectOption(method)
      assert.equal(await page.getByRole('combobox', { name: /^Метод/ }).inputValue(), method)
    }
    await page.getByRole('combobox', { name: /^Желаемый результат/ }).selectOption('photo-natural')
    await page.getByRole('combobox', { name: /^Желаемый результат/ }).selectOption('fast')
    await page.locator('input[name="mode"][value="compress"]').check()
    assert.equal(await page.getByRole('combobox', { name: /^Метод/ }).count(), 0)
    for (const format of ['PNG', 'JPG', 'AVIF', 'WEBP']) {
      const button = page.getByRole('button', { name: format, exact: true })
      await button.click()
      assert.equal(await button.getAttribute('aria-pressed'), 'true')
      if (format === 'JPG') assert.equal(await page.getByLabel('Цвет подложки JPEG', { exact: true }).isEnabled(), true)
    }
    const quality = page.getByRole('slider', { name: 'Качество сжатия', exact: true })
    await page.getByRole('checkbox', { name: 'Без потерь', exact: true }).check()
    assert.equal(await quality.isDisabled(), true)
    await page.getByRole('checkbox', { name: 'Без потерь', exact: true }).uncheck()
    await quality.focus()
    await quality.press('ArrowLeft')
    assert.equal(await quality.inputValue(), '84')
    await quality.press('ArrowRight')
    await page.getByText('Ограничить вес файла', { exact: true }).click()
    await page.getByRole('spinbutton', { name: 'Максимум, КБ', exact: true }).fill('750')
    await page.getByRole('spinbutton', { name: 'Максимум, КБ', exact: true }).fill('0')
    await page.getByText('Ограничить вес файла', { exact: true }).click()
    await page.locator('input[name="mode"][value="chain"]').check()
    await page.getByRole('button', { name: '2×', exact: true }).click()
    await page.locator('.inspector-scroll').evaluate(element => { element.scrollTop = 0 })
    report.checks.push('import, selection, three modes, three methods, model choice, 2×/3×/4×, four formats, JPEG background, lossless, quality keyboard, target size')

    await processButton().click()
    await page.getByRole('button', { name: 'Отменить', exact: true }).waitFor()
    assert.equal(await page.getByRole('combobox', { name: /^Метод/ }).isDisabled(), true)
    assert.equal(await page.getByRole('checkbox', { name: 'Выбрать все', exact: true }).isDisabled(), true)
    const start = await page.evaluate(() => window.__designFixture.calls.find(call => call.method === 'start'))
    assert.deepEqual(start.args, [fixture.assets.map(asset => asset.id), defaults])
    await page.setViewportSize({ width: 940, height: 700 })
    await capture(page, 'processing-dark-940x700', layouts)
    await page.getByRole('button', { name: 'Отменить', exact: true }).click()
    await processButton().waitFor()
    report.checks.push('processing dispatch and disabled controls, cancel')

    await page.evaluate(() => window.__designFixture.show('result'))
    const compare = page.getByRole('slider', { name: 'Положение разделителя сравнения', exact: true })
    await compare.waitFor()
    await compare.focus()
    const before = Number(await compare.inputValue())
    await compare.press('ArrowRight')
    assert.equal(Number(await compare.inputValue()), before + 1, 'Compare slider keyboard behavior')
    await compare.press('Home')
    assert.equal(await compare.inputValue(), '0')
    await compare.press('End')
    assert.equal(await compare.inputValue(), '100')
    await compare.press('Home')
    for (let i = 0; i < 50; i++) await compare.press('ArrowRight')
    const rangeBox = await compare.boundingBox()
    await page.mouse.move(rangeBox.x + rangeBox.width / 2, rangeBox.y + rangeBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(rangeBox.x + rangeBox.width * 0.7, rangeBox.y + rangeBox.height / 2, { steps: 8 })
    await page.mouse.up()
    assert.ok(Number(await compare.inputValue()) > 55, 'Compare slider should move when dragged')
    for (const name of ['Оригинал', 'Результат', 'Сравнить']) {
      await page.getByRole('button', { name, exact: true }).click()
      assert.equal(await page.getByRole('button', { name, exact: true }).getAttribute('aria-pressed'), 'true')
    }
    for (const name of ['Белая', 'Чёрная', 'Песочная', 'Прозрачность']) {
      const button = page.getByRole('button', { name: `${name} подложка`, exact: true })
      await button.click()
      assert.equal(await button.getAttribute('aria-pressed'), 'true')
    }
    await page.getByRole('button', { name: 'Масштаб один к одному', exact: true }).click()
    const viewport = page.locator('.viewport')
    const canvasBox = await viewport.boundingBox()
    const positionBefore = await viewport.evaluate(element => [element.scrollLeft, element.scrollTop])
    await page.mouse.move(canvasBox.x + canvasBox.width * 0.62, canvasBox.y + canvasBox.height * 0.55)
    await page.mouse.down()
    await page.mouse.move(canvasBox.x + canvasBox.width * 0.4, canvasBox.y + canvasBox.height * 0.35, { steps: 6 })
    await page.mouse.up()
    const positionAfter = await viewport.evaluate(element => [element.scrollLeft, element.scrollTop])
    assert.ok(positionAfter[0] > positionBefore[0] || positionAfter[1] > positionBefore[1], 'Direct drag must pan in Compare away from the handle')
    await page.getByRole('button', { name: 'Результат', exact: true }).click()
    const widthBefore = await page.locator('.image-comparison').evaluate(element => element.getBoundingClientRect().width)
    await page.mouse.move(canvasBox.x + canvasBox.width * 0.4, canvasBox.y + canvasBox.height * 0.35)
    await page.mouse.wheel(0, -100)
    await page.waitForFunction(width => document.querySelector('.image-comparison').getBoundingClientRect().width > width, widthBefore)
    await page.getByRole('button', { name: 'Уменьшить масштаб', exact: true }).click()
    await page.getByRole('button', { name: 'Увеличить масштаб', exact: true }).click()
    // The current percentage is the fit/reset button in both the original and redesigned UI.
    await page.locator('button.zoom-value').filter({ hasText: /%|Вписать/ }).first().click()
    await page.getByRole('button', { name: 'Сравнить', exact: true }).click()
    await compare.press('Home')
    for (let i = 0; i < 50; i++) await compare.press('ArrowRight')
    await page.locator('.app-header').click({ position: { x: 350, y: 20 } })
    report.checks.push('original/result/compare, native compare keyboard and drag, four backgrounds, direct pan, wheel zoom, fit, 1:1, zoom buttons')

    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height })
      for (const value of ['dark', 'light']) {
        await theme(page, value)
        await capture(page, `compare-${value}-${width}x${height}`, layouts)
      }
    }
    report.checks.push('dark/light layout at 1600×1000, 940×700, 900×640, 1200×800; unfiltered images; reachable primary actions')

    await page.setViewportSize({ width: 900, height: 640 })
    await page.locator('.save-details > summary').click()
    await page.getByRole('button', { name: 'Выбрать папку', exact: false }).click()
    await page.getByRole('button', { name: 'Открыть папку результатов', exact: true }).click()
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
    await page.getByRole('button', { name: 'Сохранить все', exact: true }).click()
    await page.locator('.inspector-scroll').evaluate(element => { element.scrollTop = 0 })
    await page.evaluate(() => window.__designFixture.show('interrupted'))
    await page.getByRole('button', { name: 'Продолжить очередь', exact: true }).waitFor()
    await capture(page, 'interrupted-light-900x640', layouts)
    await page.getByRole('button', { name: 'Продолжить очередь', exact: true }).click()
    await page.getByRole('button', { name: 'Отменить', exact: true }).click()
    await page.evaluate(() => window.__designFixture.show('error'))
    await page.getByRole('alert').filter({ hasText: 'Не удалось обработать изображение' }).waitFor()
    await capture(page, 'error-light-900x640', layouts)
    const recorded = await page.evaluate(() => window.__designFixture.calls.map(call => call.method))
    for (const method of ['import', 'start', 'cancel', 'directory', 'reveal', 'export', 'exportAll', 'resume']) assert.ok(recorded.includes(method), `${method} was not dispatched`)
    report.checks.push('output folder, reveal, single and batch export dispatch, interrupted/resume, persistent error semantics')
    assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true)
    report.checks.push('main workflow interactions performed with reduced motion enabled')
    report.opticalPixels = await checkOptics(page, layouts)
    report.checks.push('contextual neutral/checkerboard backgrounds with manual override; moving scale lens; real refraction changes limited to the compare handle')
    await checkDecoration(browser, url, fixture, report)
    assert.deepEqual(requests, [], 'Renderer made external network requests')
    assert.deepEqual(errors, [], 'Renderer raised uncaught exceptions')
    report.checks.push('no external renderer requests or uncaught exceptions')
    report.status = 'passed'
    console.log(JSON.stringify({ status: report.status, browser: report.browser, screenshots: layouts.length, checks: report.checks, artifacts }, null, 2))
  } catch (error) {
    report.status = 'failed'
    report.failure = error.stack || String(error)
    if (page) await page.screenshot({ path: path.join(artifacts, 'failure.png'), animations: 'disabled' }).catch(() => {})
    throw error
  } finally {
    await fs.writeFile(path.join(artifacts, 'validation.json'), JSON.stringify(report, null, 2))
    if (browser) await browser.close()
    if (server) await server.close()
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
