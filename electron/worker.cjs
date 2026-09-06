'use strict'
const { processImage } = require('./pipeline.cjs')
const { cancelEngine } = require('./engine.cjs')
const controller = new AbortController()
process.on('message', async message => {
  if (message.type === 'cancel') { controller.abort(); cancelEngine(); setTimeout(() => process.exit(2), 50); return }
  if (message.type !== 'process') return
  try {
    const result = await processImage(message.payload, (percent, stage) => process.send?.({ type: 'progress', percent, stage }), controller.signal)
    process.send?.({ type: 'result', result }, () => process.exit(0))
  } catch (error) { process.send?.({ type: 'error', message: error.message }, () => process.exit(1)) }
})

process.on('disconnect', () => { controller.abort(); cancelEngine(); process.exit(2) })
