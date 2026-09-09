'use strict'
const { UserError } = require('./user-errors.cjs')
// Persisted legacy IDs retain their original inference behavior.
const ENGINES = Object.freeze({
  realesrgan: { id: 'realesrgan', executable: 'realesrgan-ncnn-vulkan.exe', version: 'v0.2.0', backend: 'Vulkan' },
  realcugan: { id: 'realcugan', executable: 'realcugan-ncnn-vulkan.exe', version: '20220728', backend: 'Vulkan' },
})
const MODELS = Object.freeze([
  { id: 'photo-natural', engine: 'realesrgan', category: 'photo', name: 'realesrnet-x4plus', version: '20210901', nativeScales: [4], directory: 'models', redistribution: false },
  { id: 'photo-detailed', engine: 'realesrgan', category: 'photo', name: 'realesrgan-x4plus', version: '20220424', nativeScales: [4], directory: 'models', redistribution: false },
  { id: 'illustration-clean', engine: 'realcugan', category: 'illustration', name: 'realcugan-se', version: '20220728', nativeScales: [2, 3, 4], directory: 'realcugan/models-se', noise: 3, redistribution: true },
  { id: 'illustration-detailed', engine: 'realesrgan', category: 'illustration', name: 'realesrgan-x4plus-anime', version: '20220424', nativeScales: [4], directory: 'models', redistribution: false },
  { id: 'fast', engine: 'realesrgan', category: 'fast', name: 'realesr-animevideov3', version: '20220424', nativeScales: [2, 3, 4], directory: 'models', redistribution: false },
].map(model => Object.freeze({ ...model, supportedScales: [2, 3, 4], capabilities: { rgb: true, alpha: 'separate-cubic', tile: true } })))
const ALIASES = Object.freeze({ illustration: 'fast', photo: 'photo-detailed' })
function resolveModel(id = 'illustration') {
  const canonical = Object.hasOwn(ALIASES, id) ? ALIASES[id] : id
  const model = MODELS.find(value => value.id === canonical)
  if (!model) throw new UserError('UNKNOWN_MODEL')
  return model
}
function planUpscale(id, requestedScale) {
  const model = resolveModel(id)
  if (!model.supportedScales.includes(requestedScale)) throw new UserError('MODEL_SCALE_UNSUPPORTED')
  const nativeScale = model.nativeScales.includes(requestedScale) ? requestedScale : model.nativeScales.find(scale => scale >= requestedScale)
  if (!nativeScale) throw new UserError('MODEL_NATIVE_SCALE_UNAVAILABLE')
  const stem = model.engine === 'realcugan' ? `up${nativeScale}x-denoise${model.noise}x` : model.name === 'realesr-animevideov3' ? `${model.name}-x${nativeScale}` : model.name
  return { model, engine: ENGINES[model.engine], requestedScale, nativeScale,
    modelFiles: ['param', 'bin'].map(ext => `${model.directory}/${stem}.${ext}`),
    intermediateResize: nativeScale === requestedScale ? null : { fromScale: nativeScale, toScale: requestedScale, kernel: 'lanczos3' } }
}
module.exports = { ENGINES, MODELS, ALIASES, resolveModel, planUpscale }
