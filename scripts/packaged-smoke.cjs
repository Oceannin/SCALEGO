process.env.SCALEGO_PACKAGED_EXE = require('node:path').join(__dirname, '..', 'release', 'win-unpacked', 'SCALEGO.exe')
require('./smoke.cjs')
