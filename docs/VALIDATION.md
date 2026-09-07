# Проверки и известные ограничения

Выпуск **0.2.0-alpha.1**. Проверки разработки: **7 сентября 2026**. Windows 11 x64, Ryzen 5 7600X, NVIDIA RTX 4070 Ti SUPER и встроенная AMD Radeon Graphics, Node 24.14.0, Electron 43.3.0, Sharp 0.35.4.

Ниже сохранены результаты разработки и раннего прототипа, который включал только Clean. После принятого владельцем решения public package включает все пять моделей; текущий состав и основание распространения описаны в [MODEL_AUDIT](MODEL_AUDIT.md). Полные тесты и benchmarks при последующей смене packaging не повторялись.

## Проверка релизных пакетов 0.2.0-alpha.1

7 сентября 2026: production TypeScript/Vite build и Portable/NSIS build прошли. `verify-package.cjs` подтвердил актуальные файлы в ASAR, notices и SHA256 всех моделей. Один `release-smoke.cjs` запустил настоящий Portable, проверил все 18 файлов весов внутри него и выполнил Photo Detailed и Clean, 48×32 → 96×64. `zoom-smoke.cjs` на packaged EXE проверил колесо вверх/вниз, удержание курсора, кнопки, fit, пределы масштаба и небольшое окно; page errors отсутствуют. Полный локальный test suite и benchmark при подготовке выпуска повторно не запускались.

Portable: **184,218,590 bytes**; NSIS: **184,429,275 bytes**. Публичные имена: `SCALEGO-0.2.0-alpha.1-Portable.exe`, `SCALEGO-0.2.0-alpha.1-Setup.exe`, `SHA256SUMS.txt`. Оба пакета используют один проверенный набор ресурсов. Полная установка/удаление NSIS остаётся отдельной ручной проверкой.

## Проверки разработки

| Проверка | Доказательство и границы |
| --- | --- |
| Полный набор тестов | **30 passed, 0 failed, 0 skipped**, 92,9 с, с `SCALEGO_REQUIRE_ALL_MODELS=1` и локальным evaluation runtime. Все пять моделей, оба старых ID, 2×/3×/4× и реальные output dimensions |
| RGB / RGBA | PNG/JPEG/WebP, tiny 1×3 и широкие входы, Unicode и пробелы в путях; весь alpha-канал сравнен с cubic, мягкие края и постоянный RGB проверены на тёмный/светлый ореол; PNG/JPEG/WebP/AVIF output |
| Native errors | Реальный child spawn/exit/timeout/cancel, недостающие и повреждённые файлы. Нормализация Vulkan/OOM и последовательные OOM retries проверены управляемыми ошибками, без искусственного истощения VRAM |
| Отмена AI | Реальные Real-ESRGAN и Real-CUGAN subprocess прерваны; output и recipe не опубликованы |
| PNG/JPEG/WebP/AVIF | Фактическое декодирование, прежние/увеличенные размеры, снижение качества и достижимый лимит веса |
| PNG chain | Палитровое сжатие меньше lossless на текстурном fixture; точный PNG chain совпадает с обычным увеличением; прозрачные и полупрозрачные участки присутствуют |
| Без потерь | Побайтовое сравнение декодированных PNG-пикселей и видимых RGBA-пикселей WebP; исходный файл не изменён |
| Экспорт | Коллизии имён не перезаписывают файлы; отсутствующий рецепт не публикует изображение; результат и рецепт имеют отдельные имена |
| Typecheck / build | `npm run typecheck` и production TypeScript/Vite build прошли. Все CJS прошли `node --check`; отдельной lint-конфигурации нет |
| `npm audit` | 0 известных уязвимостей среди prod/dev-зависимостей на дату проверки; не включает все возможные ошибки upstream и моделей |
| Desktop / packaged / Portable smoke | Все прошли: три workflow, PNG controls, export/recipe, alpha, selection, окно 940×700 и восстановление после удаления оригинала. Portable проверен с bundled Clean и без внешнего runtime; wrapper завершился после закрытия |
| Model UI smoke | Development — пять intent routes и фактические recipes. Packaged — только Clean доступен; остальные объясняют отсутствие, AI-run блокируется, compression остаётся доступным. Nearest 3× / Lanczos 4×, без page errors и горизонтального overflow |
| Внешний runtime / отсутствие CUGAN | Packaged с `--engine-root runtime`: все пять моделей выполнили реальные задания. Отдельный runtime без CUGAN executable: четыре ESRGAN-модели работают, Clean недоступен, compression/Nearest/Lanczos доступны |
| Queue smoke | Частичная ошибка не останавливает следующие задания, cancel running/queued, восстановление interrupted после перезапуска, batch export, ошибочный импорт и удаление копии без удаления исходника |
| Packaging audit | Portable + NSIS собраны. `verify-package.cjs`: точный allowlist, все SHA256 и notices, актуальные electron/dist в ASAR и три audit-документа. Неподтверждённые weights и Microsoft DLL отсутствуют в `resources/engine` |
| Self-review | Просмотрены изменения registry, native runner, IPC, alpha/post-resize, error handling, installer, allowlist и UI. Граф устарел/transport закрылся; проверка изменений выполнена по актуальным исходникам |

Снимки в README получены на собственном синтетическом рисунке из `scripts/smoke.cjs`. Пример PNG 480×360: 15,1 → 5,0 КБ при качестве 85. Это иллюстрация рабочего процесса, не benchmark для любых файлов. Личные изображения пользователя в репозиторий не включены.

## Practical benchmark

`scripts/benchmark.cjs`: пять моделей × три детерминированных fixtures (RGBA 96×64, текстура RGB JPEG 192×128, WebP 23×7) × масштабы 2/3/4. **45/45** успешных случаев на каждой GPU; также **45/45** при auto selection. Учитываются native startup, decode, alpha, downsample и PNG encode. Ни один результат не является замером качества на настоящих фотографиях или доказательством универсального превосходства модели.

| Модель | NVIDIA, медиана 9 случаев, мс | AMD integrated, медиана 9 случаев, мс |
| --- | ---: | ---: |
| Natural / realesrnet-x4plus | 2358 | 2486 |
| Photo Detailed / realesrgan-x4plus | 2243 | 2252 |
| Clean / realcugan-se | 897 | 663 |
| Illustration Detailed / x4plus-anime | 1348 | 977 |
| Fast / animevideov3 | 848 | 502 |

Это маленькие входы с холодным запуском executable на каждый файл: startup преобладает, поэтому результаты не предсказывают соотношение GPU на больших изображениях. Peak memory не измеряется (`null`). Полные локальные JSON в `artifacts/multi-engine/benchmark{,-gpu0,-gpu1}.json` содержат dimensions, requested/native scale, время, размер output и GPU diagnostic. Воспроизведение: `npm run benchmark -- --gpu 0 --output artifacts/multi-engine/benchmark-gpu0.json` и аналогично `--gpu 1` с evaluation runtime.

## Размер раннего прототипа с Clean

Размеры ниже — bytes; МБ в пояснении десятичные. Baseline зафиксирован до изменений, исходные release-файлы сохранены.

| Состав | До | После | Изменение |
| --- | ---: | ---: | ---: |
| Portable EXE | 145,979,720 | 114,564,124 | −31,415,596 |
| NSIS EXE | 146,190,410 | 114,774,813 | −31,415,597 |
| Native EXE + weights без notices | 52,427,274 | 20,801,734 | −31,625,540 |

Уменьшение около 31,4 МБ обусловлено исключением ESRGAN-family weights по лицензионному gate. Real-CUGAN добавляет executable **6,656,512 bytes** и Clean weights **7,983,814 bytes**. RealESRNet добавляет **33,540,549 bytes** только в локальный evaluation runtime, используя существующий ESRGAN executable **6,161,408 bytes**. Размер каждой модели приведён в [MODEL_AUDIT](MODEL_AUDIT.md).

Это исторические измерения до включения всех ESRGAN-family weights. Исходный baseline сохранён в `artifacts/multi-engine/baseline-size.json`. Текущие пакеты находятся в `release/0.2.0-alpha.1/`; `node scripts/verify-package.cjs` пересоздаёт отчёт актуальной сборки в `artifacts/multi-engine/package-verification.json` и её `SHA256SUMS.txt`. Генерируемые файлы не коммитятся.

## Что это не подтверждает

- Совместимость со всеми GPU, Windows-машинами и драйверами.
- Intel подтверждён только upstream-документацией, физического Intel GPU здесь нет. Проверка была на машине с установленным Vulkan-драйвером и Microsoft Visual C++ Runtime x64, не на чистой Windows VM.
- Реальный VRAM exhaustion/driver crash не провоцировался; retry и error routing проверены контролируемыми ошибками.
- Native invocation ограничен пятью минутами; большие/медленные задания могут достичь timeout. 4×-модели ограничивают исходник 6,25 Мп даже при requested 2×/3×.
- Полный сценарий установки/удаления NSIS: установщик собран, но это отдельная ручная проверка.
- Поведение при сбое питания, на всех сетевых/съёмных файловых системах и на очереди из 200 тяжёлых файлов.
- Сохранение HDR/16-bit/ICC/EXIF: выход намеренно sRGB/8-bit без исходных метаданных.
- Точность восстановленных AI-деталей, текста и прозрачных краёв.
- Гарантированное достижение лимита веса. Подбор ограничен семью пробами; соседние значения качества PNG могут совпадать из-за допустимой битности палитры.
- Отсутствие всех уязвимостей: проведены адресные проверки исходников и npm advisory audit, не независимый security assessment.

CI использует Windows runner без установленных AI-моделей/Vulkan GPU, поэтому AI-тест там пропускается. Зелёный CI подтверждает кодеки и сборку, а не GPU-совместимость.

Публичную доступность, лицензирование и готовность бинарного релиза отслеживает [аудит GitHub](GITHUB_AUDIT.md). Локальный успешный build не равен опубликованному выпуску.
