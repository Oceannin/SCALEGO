'use strict'
const { UserError } = require('./user-errors.cjs')

class EngineError extends UserError {
  constructor(code, diagnostic = {}) { super(code); this.name = 'EngineError'; this.diagnostic = diagnostic }
}

function classifyFailure({ code, log = '', error, aborted, timedOut }) {
  if (aborted) return 'CANCELLED'
  if (error || [3221225781, -1073741515, 3221225595, -1073741701].includes(code)) return 'ENGINE_UNAVAILABLE'
  if (/out of.*memory|out.of.(?:device|host).memory|vkAllocate|failed.*alloc|alloc.*failed|bad_alloc/i.test(log)) return 'OUT_OF_MEMORY'
  if (/vkCreateInstance|vkCreateDevice|no vulkan|no.*gpu|vkWaitForFences|VK_ERROR|vulkan.*(?:fail|unavailable)|find.*gpu.*fail/i.test(log)) return 'VULKAN_UNAVAILABLE'
  if (/fopen.*(?:param|bin)|(?:param|bin).*fopen/i.test(log)) return 'MODEL_MISSING'
  if (/load_(?:param|model)|param.*(?:invalid|fail)|model.*(?:corrupt|invalid)|layer.*not exists/i.test(log)) return 'MODEL_CORRUPTED'
  if (/decode|unsupported image|read image.*fail/i.test(log)) return 'UNSUPPORTED_IMAGE'
  return timedOut ? 'UNEXPECTED_ENGINE_ERROR' : 'PROCESS_FAILED'
}
module.exports = { EngineError, classifyFailure }
