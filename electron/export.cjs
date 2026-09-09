'use strict'
const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const { constants } = require('node:fs')
const { UserError } = require('./user-errors.cjs')
async function publishResult({ outputPath, recipePath, directory, name }) {
  const root = await fs.realpath(directory)
  const stem = path.parse(path.basename(name)).name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 120) || 'image'
  const extension = path.extname(outputPath).toLowerCase()
  if (!['.png','.webp','.jpg','.avif'].includes(extension)) throw new UserError('EXPORT_FORMAT_UNSUPPORTED')
  const staging = await fs.mkdtemp(path.join(root, '.scalego-export-'))
  try {
    const readyImage = path.join(staging, 'image' + extension)
    const readyRecipe = path.join(staging, 'recipe.scalego')
    await fs.copyFile(outputPath, readyImage, constants.COPYFILE_EXCL)
    await fs.copyFile(recipePath, readyRecipe, constants.COPYFILE_EXCL)
    for (let index = 0; index < 10000; index++) {
      const destination = path.join(root, stem + '-scalego' + (index ? '-' + index : '') + extension)
      const lockPath = destination + '.scalego-lock'
      let lock
      try { lock = await fs.open(lockPath, 'wx') } catch (e) { if (e.code === 'EEXIST') continue; throw e }
      try {
        let occupied = false
        for (const file of [destination, destination + '.scalego']) {
          try { await fs.access(file); occupied = true } catch(e) { if(e.code !== 'ENOENT') throw e }
        }
        if (occupied) continue
        let imagePublished = false
        try {
          try { await fs.link(readyImage, destination) }
          catch(e) {
            if (!['EPERM','ENOTSUP','EXDEV','ENOSYS'].includes(e.code)) throw e
            await fs.copyFile(readyImage, destination, constants.COPYFILE_EXCL)
          }
          imagePublished = true
          await fs.copyFile(readyRecipe, destination + '.scalego', constants.COPYFILE_EXCL)
        } catch(e) {
          if (imagePublished) await fs.unlink(destination).catch(() => {})
          if(e.code === 'EEXIST') continue
          throw e
        }
        return { canceled: false, name: path.basename(destination) }
      } finally { await lock.close(); await fs.unlink(lockPath).catch(() => {}) }
    }
    throw new UserError('EXPORT_NAME_UNAVAILABLE')
  } finally {
    const checked = path.resolve(staging)
    if (path.dirname(checked) === root && path.basename(checked).startsWith('.scalego-export-')) await fs.rm(checked, { recursive: true, force: true })
  }
}
module.exports = { publishResult }
