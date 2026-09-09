const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const sharp = require('sharp')
const { processImage, inspect } = require('../electron/pipeline.cjs')
const { validateOptions, dimensions } = require('../electron/contracts.cjs')
const defaults = { mode: 'compress', method: 'lanczos', scale: 2, format: 'webp', quality: 85, lossless: false, background: '#ffffff', targetKB: 0 }
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'scalego-test-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const source = path.join(root, 'исходник.png')
  const data = Buffer.alloc(80 * 60 * 4)
  for (let y = 0; y < 60; y++) for (let x = 0; x < 80; x++) { const i = (y * 80 + x) * 4; data[i] = x * 3; data[i + 1] = y * 4; data[i + 2] = 100; data[i + 3] = x < 10 ? 0 : x < 20 ? 128 : 255 }
  await sharp(data, { raw: { width: 80, height: 60, channels: 4 } }).png().toFile(source)
  return { root, source, original: await fs.readFile(source) }
}
test('compression preserves dimensions and source, emits a valid transparent WebP', async t => {
  const f = await fixture(t)
  const output = await processImage({ input: f.source, tempDirectory: path.join(f.root, 'out'), options: defaults })
  const meta = await sharp(output.outputPath).metadata()
  assert.equal(meta.format, 'webp'); assert.equal(meta.width, 80); assert.equal(meta.height, 60); assert.equal(meta.hasAlpha, true)
  assert.deepEqual(await fs.readFile(f.source), f.original)
  assert.ok(JSON.parse(await fs.readFile(output.recipePath, 'utf8')).sourceHash.match(/^[a-f0-9]{64}$/))
})
test('upscale-only produces correctly sized lossless PNG and retains alpha', async t => {
  const f = await fixture(t)
  const output = await processImage({ input: f.source, tempDirectory: path.join(f.root, 'out'), options: { ...defaults, mode: 'upscale', scale: 3 } })
  const meta = await sharp(output.outputPath).metadata()
  assert.equal(meta.format, 'png'); assert.equal(meta.width, 240); assert.equal(meta.height, 180); assert.equal(meta.hasAlpha, true)
  const { data, info } = await sharp(output.outputPath).raw().toBuffer({ resolveWithObject: true })
  assert.equal(data[3], 0); assert.ok(data.some((n, i) => i % info.channels === 3 && n > 0 && n < 255))
})
test('chain applies enlargement before JPEG encode and uses explicit alpha background', async t => {
  const f = await fixture(t)
  const output = await processImage({ input: f.source, tempDirectory: path.join(f.root, 'out'), options: { ...defaults, mode: 'chain', format: 'jpeg', background: '#ff0000', quality: 100 } })
  const meta = await sharp(output.outputPath).metadata()
  assert.equal(meta.width, 160); assert.equal(meta.height, 120); assert.equal(meta.hasAlpha, false); assert.equal(meta.format, 'jpeg')
  const data = await sharp(output.outputPath).removeAlpha().raw().toBuffer()
  assert.ok(data[0] > 230 && data[1] < 20 && data[2] < 20)
  assert.ok(output.warnings.some(w => w.code === 'JPEG_ALPHA_FLATTENED'))
})
test('AVIF and lossless PNG compress-only outputs decode correctly', async t => {
  const f = await fixture(t)
  for (const format of ['avif', 'png']) {
    const output = await processImage({ input: f.source, tempDirectory: path.join(f.root, format), options: { ...defaults, format, lossless: format === 'png' } })
    assert.equal(output.width, 80); assert.equal(output.height, 60)
    const decoded = await sharp(output.outputPath).raw().toBuffer()
    assert.ok(decoded.length > 0)
    if (format === 'png') assert.deepEqual(decoded, await sharp(f.source).raw().toBuffer())
  }
})
test('unreachable lossless budget is reported without resizing', async t => {
  const f = await fixture(t)
  await sharp(require('node:crypto').randomBytes(80 * 60 * 3), { raw: { width: 80, height: 60, channels: 3 } }).png().toFile(f.source)
  const output = await processImage({ input: f.source, tempDirectory: path.join(f.root, 'out'), options: { ...defaults, format: 'png', lossless: true, targetKB: 1 } })
  assert.equal(output.width, 80); assert.equal(output.targetMet, false); assert.ok(output.bytes > 1024)
  assert.ok(output.warnings.some(w => w.code === 'TARGET_NOT_MET'))
})
test('lossy target budget reduces quality while preserving pixel dimensions', async t => {
  const f = await fixture(t)
  await sharp(require('node:crypto').randomBytes(256 * 192 * 3), { raw: { width: 256, height: 192, channels: 3 } }).png().toFile(f.source)
  const output = await processImage({ input: f.source, tempDirectory: path.join(f.root, 'budget'), options: { ...defaults, format: 'jpeg', targetKB: 12 } })
  assert.equal(output.targetMet, true); assert.ok(output.bytes <= 12 * 1024); assert.ok(output.quality < defaults.quality)
  assert.equal(output.width, 256); assert.equal(output.height, 192)
})
test('EXIF orientation is applied once and location metadata is not carried into output', async t => {
  const f = await fixture(t)
  const oriented = path.join(f.root, 'rotated.jpg')
  await sharp(f.source).jpeg().withMetadata({ orientation: 6 }).toFile(oriented)
  const result = await processImage({ input: oriented, tempDirectory: path.join(f.root, 'oriented'), options: defaults })
  const meta = await sharp(result.outputPath).metadata()
  assert.equal(meta.width, 60); assert.equal(meta.height, 80); assert.equal(meta.orientation, undefined); assert.equal(meta.exif, undefined)
})
test('lossless WebP preserves all visible RGBA pixels', async t => {
  const f = await fixture(t)
  const result = await processImage({ input: f.source, tempDirectory: path.join(f.root, 'lossless'), options: { ...defaults, lossless: true } })
  const before = await sharp(f.source).raw().toBuffer(), after = await sharp(result.outputPath).raw().toBuffer()
  for (let i = 0; i < before.length; i += 4) {
    assert.equal(before[i + 3], after[i + 3])
    if (before[i + 3] > 0) assert.deepEqual(before.subarray(i, i + 3), after.subarray(i, i + 3))
  }
})
test('cancel and malformed input fail without publishing result', async t => {
  const f = await fixture(t)
  const controller = new AbortController(); controller.abort()
  const out = path.join(f.root, 'out')
  await assert.rejects(processImage({ input: f.source, tempDirectory: out, options: defaults }, () => {}, controller.signal), { code: 'CANCELLED' })
  await assert.rejects(fs.access(path.join(out, 'result.webp')))
  const corrupt = path.join(f.root, 'bad.png'); await fs.writeFile(corrupt, 'not a png')
  await assert.rejects(inspect(corrupt))
})
test('boundary validation rejects arbitrary methods, non-finite values and oversized output', () => {
  for (const patch of [{ mode: 'shell' }, { method: 'exec' }, { scale: 99 }, { quality: NaN }, { quality: 101 }, { background: 'red;rm' }, { targetKB: -1 }]) assert.throws(() => validateOptions({ ...defaults, ...patch }))
  assert.throws(() => dimensions({ width: 10000, height: 10000 }, { mode: 'upscale', scale: 4 }), { code: 'OUTPUT_TOO_LARGE' })
  assert.deepEqual(dimensions({ width: 100, height: 200, orientation: 6 }, defaults), { width: 200, height: 100 })
})

async function texturedFixture(t) {
  const f = await fixture(t)
  const data = Buffer.alloc(256 * 192 * 4)
  let seed = 12345
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; data[i + c] = seed >>> 24 }
    data[i + 3] = (i / 4) % 256 < 16 ? 0 : (i / 4) % 256 < 32 ? 128 : 255
  }
  await sharp(data, { raw: { width: 256, height: 192, channels: 4 } }).png().toFile(f.source)
  f.original = await fs.readFile(f.source)
  return f
}

test('PNG chain compresses colours while lossless chain matches upscale and retains alpha', async t => {
  const f = await texturedFixture(t)
  const run = (name, patch) => processImage({ input: f.source, tempDirectory: path.join(f.root, name), options: { ...defaults, format: 'png', mode: 'chain', ...patch } })
  const enlarged = await run('upscale', { mode: 'upscale' })
  const exact = await run('exact', { lossless: true })
  const compact = await run('compact', { quality: 60 })
  assert.deepEqual(await fs.readFile(exact.outputPath), await fs.readFile(enlarged.outputPath))
  assert.ok(compact.bytes < enlarged.bytes)
  const meta = await sharp(compact.outputPath).metadata()
  assert.equal(meta.format, 'png'); assert.equal(meta.isPalette, true)
  assert.equal(meta.width, 512); assert.equal(meta.height, 384); assert.equal(meta.hasAlpha, true)
  const { data, info } = await sharp(compact.outputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  assert.equal(data[3], 0)
  assert.ok(data.some((n, i) => i % info.channels === 3 && n > 0 && n < 255))
  const recipe = JSON.parse(await fs.readFile(compact.recipePath, 'utf8'))
  assert.equal(recipe.options.lossless, false)
  assert.deepEqual(await fs.readFile(f.source), f.original)
})

for (const format of ['png', 'jpeg', 'webp', 'avif']) {
  test(`${format}: quality and target budget compress without changing dimensions`, async t => {
    const f = await texturedFixture(t)
    const run = (name, patch) => processImage({ input: f.source, tempDirectory: path.join(f.root, name), options: { ...defaults, format, ...patch } })
    const high = await run('high', { quality: 100 })
    const low = await run('low', { quality: 10 })
    assert.ok(low.bytes < high.bytes, `${low.bytes} must be smaller than ${high.bytes}`)
    const targetKB = Math.ceil(low.bytes / 1024)
    assert.ok(targetKB * 1024 < high.bytes, 'Fixture must exercise quality search')
    const budget = await run('budget', { quality: 100, targetKB })
    assert.equal(budget.targetMet, true); assert.ok(budget.bytes <= targetKB * 1024)
    assert.ok(budget.quality < 100)
    assert.equal(budget.width, 256); assert.equal(budget.height, 192)
    assert.equal((await sharp(budget.outputPath).metadata()).format, format === 'avif' ? 'heif' : format)
  })
}
