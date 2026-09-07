const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const sharp = require('sharp')
const root = path.join(__dirname, '..')
;(async () => {
  const manifest = require('../electron/native-artifacts.json')
  const selected = Object.entries(manifest.files).filter(([, pin]) => pin.redistribution)
  for (const [file, pin] of selected) {
    const actual = crypto.createHash('sha256').update(await fs.readFile(path.join(root, 'runtime', file))).digest('hex')
    if (actual !== pin.sha256) throw new Error('Engine checksum mismatch: ' + file)
  }
  const out = path.join(root, 'build'); await fs.mkdir(out, { recursive: true })
  const noticeRecords = require('../third-party/inference/sources.json')
  for (const notice of noticeRecords) {
    const actual = crypto.createHash('sha256').update(await fs.readFile(path.join(root, 'third-party/inference', notice.file))).digest('hex')
    if (actual !== notice.sha256) throw new Error('Inference notice checksum mismatch: ' + notice.file)
  }
  // Build only from the reviewed allowlist, never wildcard-copy local runtimes.
  const engine = path.resolve(out, 'engine')
  if (path.dirname(engine) !== path.resolve(root, 'build') || path.basename(engine) !== 'engine') throw new Error('Unsafe staging path')
  await fs.rm(engine, { recursive: true, force: true }); await fs.mkdir(engine)
  for (const [file] of selected) {
    await fs.mkdir(path.dirname(path.join(engine, file)), { recursive: true })
    await fs.copyFile(path.join(root, 'runtime', file), path.join(engine, file))
  }
  await fs.cp(path.join(root, 'third-party/inference'), path.join(engine, 'licenses'), { recursive: true })
  await fs.writeFile(path.join(engine, 'SCALEGO-engine-manifest.json'), JSON.stringify({ ...manifest, files: Object.fromEntries(selected) }, null, 2))
  const licenses = path.join(out, 'licenses'); await fs.mkdir(licenses, { recursive: true })
  await fs.cp(path.join(root, 'third-party'), path.join(licenses, 'native-image-libraries'), { recursive: true })
  const seen = new Set()
  async function collect(name, from) {
    let current = from, directory
    while (true) {
      const candidate = path.join(current, 'node_modules', name)
      try { await fs.access(path.join(candidate, 'package.json')); directory = candidate; break } catch {}
      const parent = path.dirname(current); if (parent === current) return; current = parent
    }
    if (seen.has(directory)) return
    seen.add(directory)
    const pkg = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'))
    const label = pkg.name.replace(/[^a-z0-9.-]/gi, '_') + '-' + pkg.version
    await fs.writeFile(path.join(licenses, label + '-package.json'), JSON.stringify({ name: pkg.name, version: pkg.version, license: pkg.license, repository: pkg.repository }, null, 2))
    for (const file of await fs.readdir(directory)) if (/^(licen[sc]e|copying|notice)/i.test(file) && (await fs.stat(path.join(directory, file))).isFile())
      await fs.copyFile(path.join(directory, file), path.join(licenses, label + '-' + file))
    for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) await collect(dep, directory)
  }
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
  for (const name of Object.keys(pkg.dependencies)) await collect(name, root)
  await fs.copyFile(path.join(root, 'node_modules/electron/dist/LICENSE'), path.join(licenses, 'Electron-LICENSE.txt'))
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect x="8" y="8" width="240" height="240" rx="48" fill="#f4511e"/><path d="M76 180L180 76M84 76H180V172" fill="none" stroke="#111419" stroke-width="23" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  await fs.writeFile(path.join(out, 'icon.svg'), svg)
  const png = await sharp(Buffer.from(svg)).png().toBuffer()
  await fs.writeFile(path.join(out, 'icon.png'), png)
  const header = Buffer.alloc(22); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4); header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12); header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18)
  await fs.writeFile(path.join(out, 'icon.ico'), Buffer.concat([header, png]))
  console.log('Engine hashes verified; icon and ' + seen.size + ' dependency license records prepared.')
})().catch(error => { console.error(error); process.exitCode = 1 })
