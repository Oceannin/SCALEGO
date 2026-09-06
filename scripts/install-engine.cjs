const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const root = path.join(__dirname, '..')
const sources = [
  { name: 'engine', version: 'v0.2.0', url: 'https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan/releases/download/v0.2.0/realesrgan-ncnn-vulkan-v0.2.0-windows.zip', sha256: '1bbbdb12d470af80b035c773682e144c6c2f6ece9210832a289af0a48ce3fa9a' },
  { name: 'models', version: 'v0.2.5.0', url: 'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-windows.zip', sha256: 'abc02804e17982a3be33675e4d471e91ea374e65b70167abc09e31acb412802d' },
]
const hash = buffer => crypto.createHash('sha256').update(buffer).digest('hex')
async function prepare(source, local) {
  const zip = path.join(local, source.name + '.zip')
  let buffer
  try { buffer = await fs.readFile(zip) } catch {}
  if (!buffer || hash(buffer) !== source.sha256) {
    const response = await fetch(source.url)
    if (!response.ok) throw new Error('Download failed: ' + response.status)
    buffer = Buffer.from(await response.arrayBuffer())
  }
  if (hash(buffer) !== source.sha256) throw new Error('Checksum mismatch. Archive not installed.')
  await fs.writeFile(zip, buffer)
  const stage = path.join(local, source.name + '-package')
  execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'expand-engine.ps1'), '-Archive', zip, '-Destination', stage], { windowsHide: true, stdio: 'inherit' })
  return stage
}
;(async () => {
  if (process.platform !== 'win32') throw new Error('This runtime targets Windows x64.')
  const local = path.join(root, '.local'); await fs.mkdir(local, { recursive: true })
  const runtime = path.join(root, 'runtime'); await fs.mkdir(runtime, { recursive: true })
  const binaryStage = await prepare(sources[0], local)
  const modelStage = await prepare(sources[1], local)
  const binaryRoot = path.join(binaryStage, 'realesrgan-ncnn-vulkan-v0.2.0-windows')
  for (const file of ['realesrgan-ncnn-vulkan.exe', 'vcomp140.dll', 'LICENSE', 'README.md']) await fs.copyFile(path.join(binaryRoot, file), path.join(runtime, file))
  await fs.cp(path.join(modelStage, 'models'), path.join(runtime, 'models'), { recursive: true })
  const licenses = [['Real-ESRGAN-LICENSE.txt', 'https://raw.githubusercontent.com/xinntao/Real-ESRGAN/v0.3.0/LICENSE'], ['ncnn-LICENSE.txt', 'https://raw.githubusercontent.com/Tencent/ncnn/20220420/LICENSE.txt']]
  for (const [file, url] of licenses) {
    const response = await fetch(url)
    if (!response.ok) throw new Error('Cannot fetch license: ' + url)
    await fs.writeFile(path.join(runtime, file), await response.text())
  }
  const files = {}
  for (const file of ['realesrgan-ncnn-vulkan.exe', ...(await fs.readdir(path.join(runtime, 'models'))).map(name => 'models/' + name)]) files[file] = hash(await fs.readFile(path.join(runtime, file)))
  await fs.writeFile(path.join(runtime, 'SCALEGO-engine-manifest.json'), JSON.stringify({ sources, files, checksumProvenance: 'Pinned from official HTTPS release downloads on 2026-09-05; upstream provides no digest.', installedAt: new Date().toISOString() }, null, 2))
  console.log('AI engine and models installed in runtime/.')
})().catch(error => { console.error(error.message); process.exitCode = 1 })
