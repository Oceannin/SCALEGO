'use strict'
const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawn } = require('node:child_process')
const { MODELS, ENGINES, planUpscale } = require('./models.cjs')
const { EngineError, classifyFailure } = require('./engine-errors.cjs')
const active = new Set(), helpCache = new Map(), hashCache = new Map()
const ADAPTERS = {
  realesrgan: plan => ['-n', plan.model.name],
  realcugan: plan => ['-n', String(plan.model.noise), '-c', '1'],
}
function command(root, plan, input, output, tile, gpu) {
  return { executable: path.join(root, plan.engine.executable), args: ['-i', input, '-o', output, '-m', path.join(root, plan.model.directory), ...ADAPTERS[plan.engine.id](plan), '-s', String(plan.nativeScale), '-t', String(tile), '-j', '1:1:1', '-f', 'png', ...(gpu === undefined ? [] : ['-g', String(gpu)])] }
}
function runProcess(executable, args, { signal, onProgress = () => {}, timeoutMs = 300_000 } = {}) {
  return new Promise(resolve => {
    if (signal?.aborted) return resolve({ code: null, log: '', aborted: true })
    let log = '', error, timedOut = false
    const child = spawn(executable, args, { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
    active.add(child)
    const abort = () => child.kill()
    signal?.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(() => { timedOut = true; child.kill() }, timeoutMs)
    const capture = chunk => {
      const value = chunk.toString(); log = (log + value).slice(-8192)
      const matches = [...value.matchAll(/(\d+(?:\.\d+)?)%/g)]
      if (matches.length) onProgress(Math.min(100, Number(matches.at(-1)[1])))
    }
    child.stdout.on('data', capture); child.stderr.on('data', capture)
    child.on('error', value => { error = value.code })
    child.on('close', code => {
      clearTimeout(timer); active.delete(child); signal?.removeEventListener('abort', abort)
      resolve({ code, log, error, timedOut, aborted: Boolean(signal?.aborted) })
    })
    if (signal?.aborted) abort()
  })
}
function cancelEngine() { for (const child of active) child.kill() }
async function checkFiles(root, plan, verify = false) {
  const pins = require('./native-artifacts.json').files
  for (const file of [plan.engine.executable, ...plan.modelFiles]) {
    const binary = file === plan.engine.executable
    const full = path.join(root, file)
    let stat
    try { stat = await fs.stat(full) } catch { throw new EngineError(binary ? 'ENGINE_UNAVAILABLE' : 'MODEL_MISSING', { file }) }
    if (!stat.isFile() || !stat.size) throw new EngineError(binary ? 'ENGINE_UNAVAILABLE' : 'MODEL_CORRUPTED', { file })
    if (verify) {
      const key = `${full}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`
      if (!hashCache.has(key)) {
        const digest = crypto.createHash('sha256').update(await fs.readFile(full)).digest('hex')
        if (!pins[file] || pins[file].sha256 !== digest) throw new EngineError(binary ? 'ENGINE_UNAVAILABLE' : 'MODEL_CORRUPTED', { file, reason: 'sha256 mismatch' })
        hashCache.set(key, true)
      }
    }
  }
}
// -h is cached by executable identity and does not initialize a GPU. The first
// requested inference verifies Vulkan, avoiding an extra GPU job on startup.
async function executableStatus(root, engine) {
  const file = path.join(root, engine.executable)
  let stat
  try { stat = await fs.stat(file) } catch { return false }
  const key = `${file}:${stat.size}:${stat.mtimeMs}`
  const cached = helpCache.get(key)
  if (cached && Date.now() - cached.at < 30_000) return cached.result
  const result = (async () => {
    const digest = crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')
    if (require('./native-artifacts.json').files[engine.executable]?.sha256 !== digest) return false
    const probe = await runProcess(file, ['-h'], { timeoutMs: 8000 })
    return !probe.error && !probe.timedOut && /Usage:/i.test(probe.log)
  })().catch(() => false)
  helpCache.set(key, { at: Date.now(), result })
  return result
}
async function engineStatus(root) {
  const engines = {}
  for (const engine of Object.values(ENGINES)) engines[engine.id] = { available: await executableStatus(root, engine), backend: 'Vulkan', vulkan: 'unchecked' }
  const models = []
  for (const model of MODELS) {
    let available = engines[model.engine].available, code = available ? null : 'ENGINE_UNAVAILABLE'
    if (available) try { for (const scale of model.nativeScales) await checkFiles(root, planUpscale(model.id, scale), true) } catch (error) { available = false; code = error.code }
    models.push({ id: model.id, name: model.name, category: model.category, nativeScales: model.nativeScales, available, code,
      statusCode: available ? 'MODEL_READY' : code === 'MODEL_MISSING' && !model.redistribution ? 'MODEL_RESTRICTED' : code })
  }
  return { available: models.some(model => model.available), statusCode: 'ENGINE_STATUS', engines, models }
}
function redact(log, paths) {
  for (const value of paths.filter(Boolean).sort((a, b) => b.length - a.length)) log = log.split(value).join('<path>').split(value.replaceAll('\\', '/')).join('<path>')
  return log
}
function createNativeRunner({ execute = runProcess, verify = checkFiles } = {}) {
return async function upscaleNative(root, input, output, scale, onProgress, signal, model = 'illustration', diagnostics = {}) {
  const plan = planUpscale(model, scale)
  if (signal?.aborted) throw new EngineError('CANCELLED')
  try { await verify(root, plan, true) } catch (error) {
    await diagnostics.log?.({ engine: plan.engine.id, model: plan.model.name, binaryVersion: plan.engine.version, code: error.code, ...error.diagnostic })
    throw error
  }
  if (diagnostics.gpu !== undefined && (!Number.isInteger(diagnostics.gpu) || diagnostics.gpu < 0)) throw new Error('Invalid GPU id')
  for (const tile of [256, 128, 64, 32]) {
    if (signal?.aborted) throw new EngineError('CANCELLED')
    await fs.unlink(output).catch(error => { if (error.code !== 'ENOENT') throw error })
    const cmd = command(root, plan, input, output, tile, diagnostics.gpu)
    const start = Date.now()
    const result = await execute(cmd.executable, cmd.args, { signal, onProgress })
    const diagnostic = { engine: plan.engine.id, model: plan.model.name, binaryVersion: plan.engine.version, backend: 'Vulkan', gpu: diagnostics.gpu ?? 'auto', nativeScale: plan.nativeScale, tile, durationMs: Date.now() - start, exitCode: result.code,
      command: [plan.engine.executable, ...command('<runtime>', plan, '<input>', '<output>', tile, diagnostics.gpu).args], stderr: redact(result.log, [input, output, root, path.dirname(input)]), spawnError: result.error, timedOut: result.timedOut }
    await diagnostics.log?.(diagnostic)
    if (result.aborted) throw new EngineError('CANCELLED', diagnostic)
    if (result.code === 0 && !result.timedOut && !result.error) return diagnostic
    const code = classifyFailure(result)
    if (code !== 'OUT_OF_MEMORY' || tile === 32) throw new EngineError(code, diagnostic)
  }
}
}
const upscaleNative = createNativeRunner()
module.exports = { engineStatus, upscaleNative, cancelEngine, command, runProcess, checkFiles, redact, createNativeRunner }
