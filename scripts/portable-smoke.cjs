const fs = require('node:fs/promises')
const path = require('node:path')
const net = require('node:net')
const { spawn, execFile } = require('node:child_process')
const { promisify } = require('node:util')
const sharp = require('sharp')
const root = path.join(__dirname, '..')
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
;(async () => {
  await fs.mkdir(path.join(root, 'artifacts'), { recursive: true })
  const profile = await fs.mkdtemp(path.join(root, 'artifacts/portable-session-'))
  await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect x="40" y="40" width="400" height="280" rx="60" fill="#f4511e"/><circle cx="240" cy="180" r="70" fill="#111419"/></svg>')).png().toFile(path.join(profile, 'smoke-source.png'))
  const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port; await new Promise(resolve => server.close(resolve))
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(path.join(root, 'release/SCALEGO-0.1.0-alpha.1-Portable.exe'), [`--inspect=${port}`, '--remote-debugging-port=0', '--user-data-dir=' + profile], { env, windowsHide: true, stdio: 'ignore' })
  let exited = false; child.on('exit', () => { exited = true })
  try {
    const until = Date.now() + 60000
    while (true) {
      try { await fs.access(path.join(profile, 'DevToolsActivePort')); const r = await fetch(`http://127.0.0.1:${port}/json/list`); if (r.ok) break } catch {}
      if (exited || Date.now() > until) throw new Error('Portable application did not expose the test connection')
      await pause(200)
    }
    const result = await promisify(execFile)(process.execPath, [path.join(__dirname, 'attach-portable-smoke.cjs'), profile, String(port)], { env, windowsHide: true, timeout: 120000 })
    console.log(result.stdout.trim())
    for (let i = 0; i < 50 && !exited; i++) await pause(200)
    if (!exited) throw new Error('Portable wrapper did not exit after application close')
  } finally {
    if (!exited && child.pid) await promisify(execFile)('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }).catch(() => {})
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
