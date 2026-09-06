'use strict'
const sharp = require('sharp')
const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const { validateOptions, dimensions, MAX_INPUT_PIXELS } = require('./contracts.cjs')
const { upscaleNative } = require('./engine.cjs')
sharp.cache({ memory: 96, files: 0, items: 32 })
sharp.concurrency(2)
const read = input => sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error', sequentialRead: true })
async function inspect(input) {
  const stat = await fs.stat(input)
  if (!stat.isFile() || stat.size > 200 * 1024 * 1024) throw new Error('Файл превышает 200 МБ или не является изображением.')
  const meta = await read(input).metadata()
  if (!['png', 'jpeg', 'webp', 'avif', 'heif'].includes(meta.format)) throw new Error('Поддерживаются PNG, JPEG, WebP и AVIF.')
  if ((meta.pages || 1) > 1) throw new Error('Анимированные файлы пока не поддерживаются. Загрузите статичное изображение.')
  if (!meta.width || !meta.height || meta.width * meta.height > MAX_INPUT_PIXELS) throw new Error('Лимит исходника — 40 мегапикселей.')
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
  // Flat artwork can be smaller as truecolour PNG than as a dithered palette.
  // Keep the exact encoding in that case instead of increasing file size.
  if (options.format === 'png' && !options.lossless) {
    if (signal?.aborted) throw new Error('Обработка отменена.')
    const exact = await encode(input(), { ...options, lossless: true }, quality).toBuffer()
    if (exact.length <= output.length) output = exact
  }
  const budget = options.targetKB * 1024
  if (budget && output.length > budget && !options.lossless) {
    let low = 1, high = quality - 1, best = null, bestQuality = 1
    for (let iteration = 0; iteration < 7 && low <= high; iteration++) {
      if (signal?.aborted) throw new Error('Обработка отменена.')
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
async function processImage({ input, tempDirectory, options: raw, engineRoot }, progress = () => {}, signal) {
  const options = validateOptions(raw)
  const start = Date.now()
  const source = await inspect(input)
  const target = dimensions(source.meta, options)
  await fs.mkdir(tempDirectory, { recursive: true })
  const stop = () => { if (signal?.aborted) throw new Error('Обработка отменена.') }
  progress(3, 'Подготовка')
  let normalized = await read(input).rotate().toColourspace('srgb').png().toBuffer()
  stop()
  if (options.mode !== 'compress') {
    if (options.method === 'ai') {
      const rgbPath = path.join(tempDirectory, 'input-rgb.png'), aiPath = path.join(tempDirectory, 'ai.png')
      await sharp(normalized).removeAlpha().png().toFile(rgbPath)
      const nativeScale = options.model === 'photo' ? 4 : options.scale
      if (options.model === 'photo' && source.width * source.height * 16 > 100_000_000)
        throw new Error('Модель «Фотографии» использует промежуточное увеличение 4×: лимит исходника 6,25 Мп. Выберите другую модель или уменьшите исходник.')
      const nativeTarget = dimensions(source.meta, { mode: 'upscale', scale: nativeScale })
      progress(10, 'AI-увеличение')
      await upscaleNative(engineRoot, rgbPath, aiPath, nativeScale, p => progress(10 + p * 0.53, 'AI-увеличение'), signal, options.model)
      stop()
      let result = sharp(aiPath, { limitInputPixels: 100_000_000 })
      const actual = await result.metadata()
      if (actual.width !== nativeTarget.width || actual.height !== nativeTarget.height) throw new Error('AI-движок вернул неожиданный размер.')
      if (nativeScale !== options.scale) result = result.resize(target.width, target.height, { kernel: 'lanczos3' })
      if (source.alpha) {
        const alpha = await sharp(normalized).extractChannel('alpha').resize(target.width, target.height, { kernel: 'cubic' }).raw().toBuffer()
        const rgb = await result.removeAlpha().png().toBuffer()
        result = sharp(rgb, { limitInputPixels: 100_000_000 }).joinChannel(alpha, { raw: { width: target.width, height: target.height, channels: 1 } })
      }
      normalized = await result.png().toBuffer()
    } else {
      progress(15, 'Увеличение')
      normalized = await sharp(normalized).resize(target.width, target.height, { kernel: options.method === 'nearest' ? 'nearest' : 'lanczos3' }).png().toBuffer()
    }
  }
  stop(); progress(70, options.mode === 'upscale' ? 'Сохранение PNG' : 'Сжатие')
  const result = await compressBuffer(normalized, options, signal, p => progress(p, 'Подбор размера'))
  stop()
  const ext = options.format === 'jpeg' ? 'jpg' : options.format
  const outputPath = path.join(tempDirectory, `result.${ext}`)
  await fs.writeFile(outputPath, result.buffer, { flag: 'wx' })
  const verification = await sharp(outputPath, { limitInputPixels: 100_000_000 }).metadata()
  if (verification.width !== target.width || verification.height !== target.height) throw new Error('Проверка размера результата не пройдена.')
  const sourceHash = crypto.createHash('sha256').update(await fs.readFile(input)).digest('hex')
  const warnings = []
  if (!options.lossless && result.quality < options.quality) warnings.push(`Для ограничения веса качество снижено с ${options.quality} до ${result.quality}.`)
  if (source.meta.depth !== 'uchar' || (source.meta.space && source.meta.space !== 'srgb')) warnings.push('Цвета преобразованы в sRGB, 8 бит на канал.')
  if (!result.targetMet) warnings.push('Не удалось достичь заданного веса. Размеры изображения сохранены.')
  if (source.alpha && options.format === 'jpeg') warnings.push('JPEG не поддерживает прозрачность: применена выбранная подложка.')
  if (result.buffer.length >= source.bytes) warnings.push('Результат больше исходника. Это возможно при увеличении или смене формата.')
  const recipe = { schemaVersion: 1, appVersion: '0.1.0-alpha.1', sourceHash, options, output: { ...target, bytes: result.buffer.length, quality: result.quality, sha256: crypto.createHash('sha256').update(result.buffer).digest('hex') }, warnings }
  await fs.writeFile(path.join(tempDirectory, 'recipe.scalego'), JSON.stringify(recipe, null, 2))
  progress(100, 'Готово')
  return { outputPath, recipePath: path.join(tempDirectory, 'recipe.scalego'), ...target, bytes: result.buffer.length, originalBytes: source.bytes, format: options.format, alpha: Boolean(verification.hasAlpha), quality: result.quality, targetMet: result.targetMet, warnings, elapsedMs: Date.now() - start }
}
module.exports = { inspect, processImage, compressBuffer }
