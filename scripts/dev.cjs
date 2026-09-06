const { spawn } = require('node:child_process')
const path = require('node:path')
const vite = spawn(process.execPath, [path.join(__dirname, '../node_modules/vite/bin/vite.js')], { stdio: 'inherit', windowsHide: true })
let desktop
const stop = () => { desktop?.kill(); vite.kill() }
process.on('SIGINT', stop); process.on('SIGTERM', stop)
;(async () => {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch('http://127.0.0.1:5178')).ok) break } catch {}
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  const env = { ...process.env, SCALEGO_DEV_URL: '1' }; delete env.ELECTRON_RUN_AS_NODE
  desktop = spawn(require('electron'), ['.'], { cwd: path.join(__dirname, '..'), env, stdio: 'inherit', windowsHide: true })
  desktop.on('exit', () => { vite.kill(); process.exit() })
})().catch(error => { console.error(error); stop(); process.exitCode = 1 })
