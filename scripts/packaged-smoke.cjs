process.env.SCALEGO_PACKAGED_EXE = require('node:path').join(__dirname, '..', require('../package.json').build.directories.output, 'win-unpacked', 'SCALEGO.exe')
require('./smoke.cjs')
