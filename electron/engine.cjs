'use strict'
const fs = require('node:fs/promises')
const path = require('node:path')
const { spawn } = require('node:child_process')
let running = null
async function engineStatus(root) {
  try {
    await fs.access(path.join(root, 'realesrgan-ncnn-vulkan.exe'))
    for (const model of ['realesr-animevideov3-x2', 'realesr-animevideov3-x3', 'realesr-animevideov3-x4', 'realesrgan-x4plus'])
      for (const ext of ['bin', 'param']) await fs.access(path.join(root, 'models', `${model}.${ext}`))
    return { available: true, name: 'Real-ESRGAN · Vulkan', message: 'Локальный AI-движок установлен' }
  } catch { return { available: false, name: 'Real-ESRGAN · Vulkan', message: 'AI-движок не установлен. Доступно обычное увеличение.' } }
}
function cancelEngine() { if (running) running.kill() }
async function upscaleNative(root, input, output, scale, onProgress, signal, model = 'illustration') {
  if (!(await engineStatus(root)).available) throw new Error('AI-движок не установлен. Подготовьте runtime командой npm run engine:install.')
  for (const tile of [256, 128, 64, 32]) {
    if (signal?.aborted) throw new Error('Обработка отменена.')
    const result = await new Promise((resolve, reject) => {
      let log = ''
      const child = spawn(path.join(root, 'realesrgan-ncnn-vulkan.exe'), ['-i', input, '-o', output, '-m', path.join(root, 'models'), '-n', model === 'photo' ? 'realesrgan-x4plus' : 'realesr-animevideov3', '-s', String(scale), '-t', String(tile), '-j', '1:1:1', '-f', 'png'], { windowsHide: true, shell: false })
      running = child
      const abort = () => child.kill()
      signal?.addEventListener('abort', abort, { once: true })
      child.stderr.on('data', chunk => {
        const value = chunk.toString(); log = (log + value).slice(-6000)
        const matches = [...value.matchAll(/(\d+(?:\.\d+)?)%/g)]
        if (matches.length) onProgress(Number(matches.at(-1)[1]))
      })
      child.on('error', reject)
      child.on('close', code => { running = null; signal?.removeEventListener('abort', abort); resolve({ code, log }) })
    })
    if (signal?.aborted) throw new Error('Обработка отменена.')
    if (result.code === 0) return
    if (!/alloc|memory|out of|vkAllocate/i.test(result.log) || tile === 32) throw new Error('AI-движок не смог обработать файл. Проверьте Vulkan-драйвер и свободную видеопамять. Обычное увеличение доступно отдельно.')
  }
}
module.exports = { engineStatus, upscaleNative, cancelEngine }
