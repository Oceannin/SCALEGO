'use strict'
const MESSAGES = Object.freeze({
  ENGINE_UNAVAILABLE: 'AI-движок недоступен. Проверьте установку движка и Microsoft Visual C++ Runtime x64. Другие методы доступны.',
  VULKAN_UNAVAILABLE: 'Не удалось использовать Vulkan. Обновите драйвер видеокарты или выберите обычное увеличение.',
  MODEL_MISSING: 'Файлы выбранной модели отсутствуют. Выберите другую модель или восстановите её установку.',
  MODEL_CORRUPTED: 'Файлы модели повреждены. Восстановите модель из проверенного источника.',
  PROCESS_FAILED: 'AI-движок завершился с ошибкой. Повторите обработку или выберите другой метод.',
  OUT_OF_MEMORY: 'Не хватает памяти для AI. Уменьшите исходник или освободите видеопамять.',
  UNSUPPORTED_IMAGE: 'AI-движок не смог прочитать изображение. Попробуйте пересохранить исходник в PNG.',
  CANCELLED: 'Обработка отменена.',
  UNEXPECTED_ENGINE_ERROR: 'AI-движок вернул некорректный результат. Выберите другой метод и сохраните диагностику.',
})
class EngineError extends Error {
  constructor(code, diagnostic = {}) { super(MESSAGES[code] || MESSAGES.UNEXPECTED_ENGINE_ERROR); this.name = 'EngineError'; this.code = code; this.diagnostic = diagnostic }
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
