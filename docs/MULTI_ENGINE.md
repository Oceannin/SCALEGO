# Несколько AI-движков в SCALEGO

## Карта исходного pipeline

До изменения `Inspector → Options → preload.start → main.validateOptions → processQueue → worker → pipeline.processImage → engine.upscaleNative → Sharp → output / recipe → publishResult`.

* `electron/engine.cjs` напрямую строил Real-ESRGAN CLI (`spawn`, массив аргументов, без shell), выбирал имя по `model === 'photo'`. В runtime лежали executable и `models/*.bin/.param`; в packaged — `resources/engine`.
* `engineStatus` проверял наличие нескольких файлов, но не запуск executable и не Vulkan. Наличие Fast-файлов ошибочно определяло доступность всего движка, anime Detailed не проверялся.
* `contracts.cjs` разрешал только `illustration` / `photo`; `pipeline.cjs` отдельно знал о фото 4×. `types.ts`, Inspector и подписи UI также были привязаны к одному движку.
* Main получает пути через диалог/drag-and-drop, делает snapshot и миниатюру. Renderer работает с IDs и `scalego-asset` URL. Preload имеет именованные IPC-команды; main проверяет sender и frame.
* Main исполняет задания по одному, fork-воркер на изображение; Sharp использует два CPU-потока. Ошибка одного файла сохраняется в job и очередь идёт дальше. Отмена помечает queued/running jobs, посылает cancel воркеру, который abort/kill завершает native child.
* Сессия v1 атомарно записывается и восстанавливает последние 400 заданий. Прерванные становятся `interrupted`. Экспорт использует блокировку имени и exclusive create, сохраняя пару image/recipe без перезаписи.
* Три workflow (`upscale`, `chain`, `compress`) и три метода (`ai`, `lanczos`, `nearest`) независимы от формата. Compression-only не вызывает AI. Кодеки: PNG, MozJPEG, WebP, AVIF в Sharp/libvips.
* RGB уже шёл в AI отдельно; alpha увеличивался cubic до конечного размера. Фото выполняло 4× inference и один Lanczos3-downsample для 2×/3×.
* Существовали codec/alpha/limits/export tests, реальный Vulkan-тест двух старых режимов, desktop/queue/packaged/portable smoke. Installer фиксировал архивные SHA256, но packaging wildcard копировал все модели из runtime.

## Принятое решение

Сохранены Electron/React/TypeScript/Vite/npm, интерфейс панелей, очередь, IPC и кодеки. Добавлен компактный registry `electron/models.cjs`: intent ID, engine, отображаемое имя, назначение, native/supported scales, capabilities, версия, правила файлов модели. `planUpscale` вычисляет файлы, native scale и единственное промежуточное уменьшение. Командные различия остаются в адаптерах `electron/engine.cjs`.

Новый маршрут: **UI intent → validateOptions → последовательная очередь → Upscale plan → native adapter → RGB downsample при необходимости → alpha join → отдельное сжатие → проверка размеров → рецепт → экспорт**.

Чтобы добавить движок, достаточно дополнить registry, построение CLI, проверенные artifact pins / notices и адресные тесты. Очередь и IPC не знают нейросетевых имён; UI получает каталог через существующий `engine()`.

## Масштаб и прозрачность

У Natural и обеих Detailed моделей native 4×. Запрос 2×/3× означает AI 4× → один Sharp Lanczos3-downsample. Native target проверяется тем же лимитом 100 Мп / 32768 px по стороне, что финальный размер. Максимальный исходник этих моделей — 6,25 Мп. Fast и Clean используют собственные 2×/3×/4× варианты.

AI получает RGB PNG в sRGB/8-bit. Исходный alpha масштабируется cubic непосредственно до requested dimensions, один раз, и присоединяется к конечному RGB. Существующее поведение сохранено: нет flatten на белый/чёрный фон перед inference. JPEG flatten выполняется только на этапе JPEG-кодека с выбранной подложкой. Regression tests сравнивают весь alpha-канал, полупрозрачные края и цвет на постоянном RGB. Это не обещание отсутствия любых AI-артефактов на произвольном рисунке.

## Доступность, ошибки, диагностика

При загрузке UI вызывается `engine()`. Для каждого executable проверяется SHA256, а короткий `-h` подтверждает запуск без GPU. Результат кэшируется на 30 секунд по пути/размеру/mtime. Для каждой модели отдельно проверяются её файлы и SHA256; hash cache учитывает путь, размер, mtime и ctime. Состояние `vulkan: unchecked` честно означает, что драйвер ещё не проверен: первая запрошенная обработка является реальной проверкой GPU, без дополнительного тяжёлого пробного задания. При изменении runtime перезапустите приложение для обновления каталога UI.

Общий runner ограничивает stderr/stdout последними 8192 символами, запускает без shell и скрывает консоль. Тайлы уменьшаются 256 → 128 → 64 → 32 только при OOM. Отмена завершает child; перед повтором удаляется его частичный output. Timeout native invocation — 5 минут; это ограничение очень медленных/больших обработок. Выполняется один тяжёлый процесс, `-j 1:1:1`; CPU concurrency исходной очереди не меняется.

Категории: ENGINE_UNAVAILABLE, VULKAN_UNAVAILABLE, MODEL_MISSING, MODEL_CORRUPTED, PROCESS_FAILED, OUT_OF_MEMORY, UNSUPPORTED_IMAGE, CANCELLED, UNEXPECTED_ENGINE_ERROR. Worker отправляет код и русское сообщение; main сохраняет `errorCode` в job. Native stdout не попадает в сообщение пользователя.

В папке задания `%APPDATA%/scalego/work/<job-id>/engine-log.jsonl` сохраняются engine/model, binary version, команда с `<input>/<output>/<runtime>`, requested/native scale, tile, backend/GPU (auto либо выбранный dev GPU), длительность, exit code и ограниченный вывод native. Пути удаляются из native diagnostic text; бинарные данные и изображения не пишутся в логи. Логи локальны, удаляются вместе с рабочими данными исходника.

## Совместимость

Сессия и рецепт остаются v1. Старое `model: illustration` по-прежнему означает animevideov3/Fast; `photo` — фото Detailed. Отсутствующий model использует прежний illustration default. Неизвестные/повреждённые опции не выполняются и не приводят к crash при восстановлении.

Рецепт получает необязательное `inference`: engine, binaryVersion, model/modelVersion, modelFiles/modelSha256, requestedScale/nativeScale, intermediateResize, alpha strategy, backend, tile, durationMs. У compression-only/Lanczos/Nearest поле равно null. Старые поля options/output/sourceHash и SHA256 сохранены. Импорт рецептов по-прежнему не реализован.

Distributable 0.2.0-alpha.1 включает веса всех пяти моделей. Старые задачи ESRGAN сохраняют прежнюю модель; оба прежних режима проверены реальным inference. Владелец принял решение о распространении Real-ESRGAN-family weights на основании BSD-3-Clause официального upstream. Подробнее: [лицензионный аудит](MODEL_AUDIT.md).

## Воспроизводимые измерения

`npm run benchmark -- --gpu 0 --output artifacts/multi-engine/benchmark-gpu0.json` запускает пять моделей × три synthetic fixtures × 2×/3×/4× последовательно. `--gpu 1` выбирает другой адаптер; `--engine-root <directory>` позволяет проверить packaged runtime. JSON содержит input/output dimensions, engine/model, requested/native scales, время whole pipeline/native, output bytes и GPU diagnostics. Peak memory не измеряется (null), так как parent RSS не представляет память GPU/native процесса. Ошибки дают ненулевой exit code; недоступные модели явно отмечаются.

Синтетические изображения детерминированы, личные файлы не используются. Каждый случай запускает свежий native executable; startup overhead особенно заметен на маленьких изображениях. Эти замеры не являются PSNR/перцептивным сравнением или гарантией ускорения на всех GPU.
