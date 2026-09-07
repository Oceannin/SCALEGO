const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const manifest = require('../electron/native-artifacts.json')
const root = path.join(__dirname, '..')
const hash = buffer => crypto.createHash('sha256').update(buffer).digest('hex')
async function install() {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('This runtime targets Windows x64.')
  const local = path.join(root, '.local'), runtime = path.join(root, 'runtime')
  await fs.mkdir(local, { recursive: true }); await fs.mkdir(runtime, { recursive: true })
  // Default is the redistributable set. Explicit local evaluation also installs
  // official ESRGAN weights whose redistribution grant remains unresolved.
  const evaluation = process.argv.includes('--evaluation')
  const selected = Object.entries(manifest.files).filter(([, value]) => evaluation || value.redistribution)
  for (const source of manifest.sources.filter(source => selected.some(([, value]) => value.source === source.name))) {
    const zip = path.join(local, source.name + '.zip')
    let buffer
    try { buffer = await fs.readFile(zip) } catch {}
    if (!buffer || hash(buffer) !== source.sha256) {
      const response = await fetch(source.url)
      if (!response.ok) throw new Error('Download failed: ' + response.status)
      buffer = Buffer.from(await response.arrayBuffer())
    }
    if (hash(buffer) !== source.sha256) throw new Error('Archive checksum mismatch: ' + source.name)
    await fs.writeFile(zip, buffer)
    const stage = path.join(local, source.name + '-package')
    execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'expand-engine.ps1'), '-Archive', zip, '-Destination', stage], { windowsHide: true, stdio: 'inherit' })
    for (const [file, pin] of selected.filter(([, value]) => value.source === source.name)) {
      const content = await fs.readFile(path.join(stage, pin.archivePath))
      if (hash(content) !== pin.sha256) throw new Error('Artifact checksum mismatch: ' + file)
      await fs.mkdir(path.dirname(path.join(runtime, file)), { recursive: true })
      await fs.writeFile(path.join(runtime, file), content)
    }
  }
  await fs.cp(path.join(root, 'third-party/inference'), path.join(runtime, 'licenses'), { recursive: true })
  await fs.writeFile(path.join(runtime, 'SCALEGO-engine-manifest.json'), JSON.stringify({ ...manifest, files: Object.fromEntries(selected), installedAt: new Date().toISOString() }, null, 2))
  console.log('Verified native runtime installed. Microsoft Visual C++ Runtime x64 is a system prerequisite; DLLs are not copied.')
}
install().catch(error => { console.error(error.message); process.exitCode = 1 })
