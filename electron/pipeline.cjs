'use strict'
const sharp = require('sharp')
const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const { validateOptions, dimensions, MAX_INPUT_PIXELS } = require('./contracts.cjs')
const { upscaleNative } = require('./engine.cjs')
const { planUpscale } = require('./models.cjs')
const { EngineError } = require('./engine-errors.cjs')
const { UserError } = require('./user-errors.cjs')
sharp.cache({ memory: 96, files: 0, items: 32 })
sharp.concurrency(2)
const read = input => sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error', sequentialRead: true })
async function inspect(input) {
  const stat = await fs.stat(input)
  if (!stat.isFile() || stat.size > 200 * 1024 * 1024) throw new UserError('INPUT_TOO_LARGE_OR_INVALID')
  const meta = await read(input).metadata()
  if (!['png', 'jpeg', 'webp', 'avif', 'heif'].includes(meta.format)) throw new UserError('INPUT_FORMAT_UNSUPPORTED')
  if ((meta.pages || 1) > 1) throw new UserError('ANIMATED_UNSUPPORTED')
  if (!meta.width || !meta.height || meta.width * meta.height > MAX_INPUT_PIXELS) throw new UserError('INPUT_PIXEL_LIMIT')
  const oriented = dimensions(meta, { mode: 'compress', scale: 1 })
  return { ...oriented, bytes: stat.size, format: meta.format === 'heif' ? 'avif' : meta.format, alpha: Boolean(meta.hasAlpha), meta }
}
function encode(image, options, quality) {
  if (options.format === 'jpeg') return image.flatten({ background: options.background }).jpeg({ quality, mozjpeg: true, chromaSubsampling: quality >= 90 ? '4:4:4' : '4:2:0' })
  if (options.format === 'webp') return image.webp({ quality, lossless: options.lossless, effort: 5, alphaQuality: 100 })
  if (options.format === 'avif') return image.avif({ quality, lossless: options.lossless, effort: 5, chromaSubsampling: '4:4:4' })
  return options.lossless
    ? image.png({ compressionLevel: 9, adaptiveFiltering: true, palette: false })
    : image.png({ compressionLevel: 9, adaptiveFiltering: true, palette: true, quality,
      colours: Math.max(2, Math.round(256 * (quality / 100) ** 2)), effort: 7 })
}
async function compressBuffer(source, options, signal, progress) {
  const input = () => sharp(source, { limitInputPixels: 100_000_000 }).rotate().toColourspace('srgb')
  let quality = options.quality
  let output = await encode(input(), options, quality).toBuffer()
  if (options.format === 'png' && !options.lossless) {
    if (signal?.aborted) throw new UserError('CANCELLED')
    const exact = await encode(input(), { ...options, lossless: true }, quality).toBuffer()
    if (exact.length <= output.length) output = exact
  }
  const budget = options.targetKB * 1024
  if (budget && output.length > budget && !options.lossless) {
    let low = 1, high = quality - 1, best = null, bestQuality = 1
    for (let iteration = 0; iteration < 7 && low <= high; iteration++) {
      if (signal?.aborted) throw new UserError('CANCELLED')
      const candidateQuality = Math.floor((low + high) / 2)
      const candidate = await encode(input(), options, candidateQuality).toBuffer()
      progress?.(72 + iteration * 3)
      if (candidate.length <= budget) { best = candidate; bestQuality = candidateQuality; low = candidateQuality + 1 }
      else { high = candidateQuality - 1; if (candidate.length < output.length) { output = candidate; quality = candidateQuality } }
    }
    if (best) { output = best; quality = bestQuality }
  }
  return { buffer: output, quality, targetMet: !budget || output.length <= budget }
}
async function processImage({ input, tempDirectory, options: raw, engineRoot, gpu }, progress = () => {}, signal) {
  const options = validateOptions(raw)
  const start = Date.now()
  const source = await inspect(input)
  const target = dimensions(source.meta, options)
  await fs.mkdir(tempDirectory, { recursive: true })
  const stop = () => { if (signal?.aborted) throw new UserError('CANCELLED') }
  progress(3, 'PREPARING')
  let normalized = await read(input).rotate().toColourspace('srgb').png().toBuffer()
  let inference = null
  stop()
  if (options.mode !== 'compress') {
    if (options.method === 'ai') {
      const rgbPath = path.join(tempDirectory, 'input-rgb.png'), aiPath = path.join(tempDirectory, 'ai.png')
      await sharp(normalized).removeAlpha().png().toFile(rgbPath)
      const plan = planUpscale(options.model, options.scale)
      const { nativeScale } = plan
      const nativeTarget = dimensions(source.meta, { mode: 'upscale', scale: nativeScale })
      progress(10, 'AI_UPSCALING')
      const diagnostic = await upscaleNative(engineRoot, rgbPath, aiPath, options.scale, p => progress(10 + p * 0.53, 'AI_UPSCALING'), signal, options.model,
        { gpu, log: entry => fs.appendFile(path.join(tempDirectory, 'engine-log.jsonl'), JSON.stringify({ ...entry, requestedScale: options.scale }) + '\n') })
      inference = { engine: plan.engine.id, binaryVersion: plan.engine.version, model: plan.model.name, modelVersion: plan.model.version, modelFiles: plan.modelFiles,
        modelSha256: Object.fromEntries(plan.modelFiles.map(file => [file, require('./native-artifacts.json').files[file].sha256])),
        requestedScale: options.scale, nativeScale, intermediateResize: plan.intermediateResize, alpha: source.alpha ? 'separate-cubic' : 'none', backend: 'Vulkan', tile: diagnostic.tile, durationMs: diagnostic.durationMs }
      stop()
      let result = sharp(aiPath, { limitInputPixels: 100_000_000 })
      const actual = await result.metadata().catch(() => { throw new EngineError('UNEXPECTED_ENGINE_ERROR') })
      if (actual.width !== nativeTarget.width || actual.height !== nativeTarget.height) throw new EngineError('UNEXPECTED_ENGINE_ERROR')
      if (nativeScale !== options.scale) result = result.resize(target.width, target.height, { kernel: 'lanczos3' })
      if (source.alpha) {
        const alpha = await sharp(normalized).extractChannel('alpha').resize(target.width, target.height, { kernel: 'cubic' }).raw().toBuffer()
        const rgb = await result.removeAlpha().png().toBuffer()
        result = sharp(rgb, { limitInputPixels: 100_000_000 }).joinChannel(alpha, { raw: { width: target.width, height: target.height, channels: 1 } })
      }
      normalized = await result.png().toBuffer()
    } else {
      progress(15, 'UPSCALING')
      normalized = await sharp(normalized).resize(target.width, target.height, { kernel: options.method === 'nearest' ? 'nearest' : 'lanczos3' }).png().toBuffer()
    }
  }
  stop(); progress(70, options.mode === 'upscale' ? 'SAVING_PNG' : 'COMPRESSING')
  const result = await compressBuffer(normalized, options, signal, p => progress(p, 'TARGETING_SIZE'))
  stop()
  const ext = options.format === 'jpeg' ? 'jpg' : options.format
  const outputPath = path.join(tempDirectory, `result.${ext}`)
  await fs.writeFile(outputPath, result.buffer, { flag: 'wx' })
  const verification = await sharp(outputPath, { limitInputPixels: 100_000_000 }).metadata()
  if (verification.width !== target.width || verification.height !== target.height) throw new UserError('RESULT_DIMENSIONS_INVALID')
  const sourceHash = crypto.createHash('sha256').update(await fs.readFile(input)).digest('hex')
  const warnings = []
  if (!options.lossless && result.quality < options.quality) warnings.push({ code: 'QUALITY_REDUCED', params: { from: options.quality, to: result.quality } })
  if (source.meta.depth !== 'uchar' || (source.meta.space && source.meta.space !== 'srgb')) warnings.push({ code: 'COLOR_CONVERTED' })
  if (!result.targetMet) warnings.push({ code: 'TARGET_NOT_MET' })
  if (source.alpha && options.format === 'jpeg') warnings.push({ code: 'JPEG_ALPHA_FLATTENED' })
  if (result.buffer.length >= source.bytes) warnings.push({ code: 'RESULT_LARGER' })
  const recipe = { schemaVersion: 1, appVersion: require('../package.json').version, sourceHash, options, inference, output: { ...target, bytes: result.buffer.length, quality: result.quality, sha256: crypto.createHash('sha256').update(result.buffer).digest('hex') }, warnings }
  await fs.writeFile(path.join(tempDirectory, 'recipe.scalego'), JSON.stringify(recipe, null, 2))
  progress(100, 'READY')
  return { outputPath, recipePath: path.join(tempDirectory, 'recipe.scalego'), ...target, bytes: result.buffer.length, originalBytes: source.bytes, format: options.format, alpha: Boolean(verification.hasAlpha), quality: result.quality, targetMet: result.targetMet, warnings, elapsedMs: Date.now() - start }
}
module.exports = { inspect, processImage, compressBuffer }
