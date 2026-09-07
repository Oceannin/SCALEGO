'use strict'
// Persisted legacy IDs retain their original inference behavior.
const ENGINES = Object.freeze({
  realesrgan: { id: 'realesrgan', executable: 'realesrgan-ncnn-vulkan.exe', version: 'v0.2.0', backend: 'Vulkan' },
  realcugan: { id: 'realcugan', executable: 'realcugan-ncnn-vulkan.exe', version: '20220728', backend: 'Vulkan' },
})
const MODELS = Object.freeze([
  { id: 'photo-natural', engine: 'realesrgan', displayName: 'Фото · Естественно', category: 'photo', name: 'realesrnet-x4plus', version: '20210901', nativeScales: [4], directory: 'models', qualityProfile: 'Мягкие естественные детали; мелкие текстуры могут сглаживаться.', redistribution: false },
  { id: 'photo-detailed', engine: 'realesrgan', displayName: 'Фото · Детально', category: 'photo', name: 'realesrgan-x4plus', version: '20220424', nativeScales: [4], directory: 'models', qualityProfile: 'Выраженные детали фотографий. AI может дорисовать текстуры.', redistribution: false },
  { id: 'illustration-clean', engine: 'realcugan', displayName: 'Иллюстрация · Чистые линии', category: 'illustration', name: 'realcugan-se', version: '20220728', nativeScales: [2, 3, 4], directory: 'realcugan/models-se', noise: 3, qualityProfile: 'Чёткие линии и однотонные области. Убирает шум; мелкие текстуры могут сглаживаться.', redistribution: true },
  { id: 'illustration-detailed', engine: 'realesrgan', displayName: 'Иллюстрация · Детально', category: 'illustration', name: 'realesrgan-x4plus-anime', version: '20220424', nativeScales: [4], directory: 'models', qualityProfile: 'Детали рисунков и аниме. Может усилить резкость и изменить мелкие линии.', redistribution: false },
  { id: 'fast', engine: 'realesrgan', displayName: 'Быстро', category: 'fast', name: 'realesr-animevideov3', version: '20220424', nativeScales: [2, 3, 4], directory: 'models', qualityProfile: 'Быстрый AI для графики и предпросмотра. На фотографиях детализация ограничена.', redistribution: false },
].map(model => Object.freeze({ ...model, supportedScales: [2, 3, 4], capabilities: { rgb: true, alpha: 'separate-cubic', tile: true } })))
const ALIASES = Object.freeze({ illustration: 'fast', photo: 'photo-detailed' })
function resolveModel(id = 'illustration') {
  const canonical = Object.hasOwn(ALIASES, id) ? ALIASES[id] : id
  const model = MODELS.find(value => value.id === canonical)
  if (!model) throw new Error('Неизвестная AI-модель.')
  return model
}
function planUpscale(id, requestedScale) {
  const model = resolveModel(id)
  if (!model.supportedScales.includes(requestedScale)) throw new Error('Модель не поддерживает выбранный масштаб.')
  const nativeScale = model.nativeScales.includes(requestedScale) ? requestedScale : model.nativeScales.find(scale => scale >= requestedScale)
  if (!nativeScale) throw new Error('Нет подходящего нативного масштаба.')
  const stem = model.engine === 'realcugan' ? `up${nativeScale}x-denoise${model.noise}x` : model.name === 'realesr-animevideov3' ? `${model.name}-x${nativeScale}` : model.name
  return { model, engine: ENGINES[model.engine], requestedScale, nativeScale,
    modelFiles: ['param', 'bin'].map(ext => `${model.directory}/${stem}.${ext}`),
    intermediateResize: nativeScale === requestedScale ? null : { fromScale: nativeScale, toScale: requestedScale, kernel: 'lanczos3' } }
}
module.exports = { ENGINES, MODELS, ALIASES, resolveModel, planUpscale }
