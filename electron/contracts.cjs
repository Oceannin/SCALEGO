'use strict'
const { resolveModel } = require('./models.cjs')
const MODES = ['upscale', 'chain', 'compress']
const FORMATS = ['png', 'jpeg', 'webp', 'avif']
const METHODS = ['ai', 'lanczos', 'nearest']
const MAX_INPUT_PIXELS = 40_000_000
const MAX_OUTPUT_PIXELS = 100_000_000
function validateOptions(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Не заданы параметры обработки.')
  if (!MODES.includes(raw.mode)) throw new Error('Неизвестный режим обработки.')
  if (!METHODS.includes(raw.method)) throw new Error('Неизвестный метод увеличения.')
  if (![2, 3, 4].includes(raw.scale)) throw new Error('Доступно увеличение 2×, 3× или 4×.')
  if (!FORMATS.includes(raw.format)) throw new Error('Неподдерживаемый формат результата.')
  if (!Number.isInteger(raw.quality) || raw.quality < 1 || raw.quality > 100) throw new Error('Качество должно быть от 1 до 100.')
  if (typeof raw.lossless !== 'boolean') throw new Error('Некорректный режим сжатия.')
  if (typeof raw.background !== 'string' || !/^#[\da-f]{6}$/i.test(raw.background)) throw new Error('Укажите цвет подложки JPEG.')
  resolveModel(raw.model)
  const targetKB = raw.targetKB ?? 0
  if (!Number.isInteger(targetKB) || targetKB < 0 || targetKB > 200_000) throw new Error('Лимит размера должен быть от 0 до 200 000 КБ.')
  return { model: raw.model || 'illustration', mode: raw.mode, method: raw.method, scale: raw.scale, format: raw.mode === 'upscale' ? 'png' : raw.format,
    quality: raw.quality, lossless: raw.mode === 'upscale' ? true : raw.format === 'jpeg' ? false : raw.lossless,
    background: raw.background, targetKB: raw.mode === 'upscale' ? 0 : targetKB }
}
function dimensions(meta, options) {
  const factor = options.mode === 'compress' ? 1 : options.scale
  const rotated = [5, 6, 7, 8].includes(meta.orientation)
  const width = (rotated ? meta.height : meta.width) * factor
  const height = (rotated ? meta.width : meta.height) * factor
  if (!width || !height || width * height > MAX_OUTPUT_PIXELS || width > 32768 || height > 32768) {
    throw new Error('Результат превышает лимит 100 мегапикселей или 32 768 px по стороне. Выберите меньший масштаб.')
  }
  return { width, height }
}
module.exports = { validateOptions, dimensions, MAX_INPUT_PIXELS, MAX_OUTPUT_PIXELS, FORMATS }
