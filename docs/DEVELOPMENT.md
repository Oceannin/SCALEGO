# Разработка

[← SCALEGO](../README.md)

## Локальный запуск

Windows x64, Node.js 24 и npm. Для скачивания зависимостей и моделей нужен интернет. API-ключи и `.env` не нужны.

```powershell
git clone https://github.com/Oceannin/SCALEGO.git
cd SCALEGO
npm ci
npm run engine:install
npm run dev
```

`engine:install` скачивает закреплённые официальные executables и веса всех пяти моделей, проверяет архивные и файловые SHA256 и готовит `runtime/`. `engine:install:evaluation` сохранён для совместимости; в этом выпуске набор файлов совпадает. Состав определяется `electron/native-artifacts.json`, основание распространения описано в [MODEL_AUDIT](MODEL_AUDIT.md). Без моделей работают сжатие, Lanczos и Nearest. AI требует Vulkan GPU, драйвера и системного Microsoft Visual C++ Runtime x64.

`npm run dev` использует Vite на `127.0.0.1:5178`. `npm run dev:web` показывает интерфейс отдельно; файловая обработка работает только в Electron.

Для внешнего проверенного runtime можно задать абсолютный `SCALEGO_ENGINE_ROOT` перед запуском приложения (включая Portable). Например: `$env:SCALEGO_ENGINE_ROOT='F:\Programs\SCALEGO\runtime'`. Удаление переменной возвращает bundled runtime. Хеши остаются обязательными; произвольные бинарники не разрешаются.

## Проверки

```powershell
npm run typecheck
npm test
npm run build
npm run smoke
npm run smoke:queue
npm run smoke:models
```

Тесты проверяют routing, native failures, реальные кодеки, размеры, весь alpha-канал, лимит веса, исходники, отмену и экспорт. GPU-тесты явно пропускают отсутствующие модели. Для полного прогона установите evaluation runtime и задайте `$env:SCALEGO_REQUIRE_ALL_MODELS='1'` перед `npm test`: пропуск требуемой модели тогда считается ошибкой. `SCALEGO_TEST_ENGINE_ROOT` позволяет направить новые GPU-тесты на отдельный runtime. Lint-конфигурации в проекте нет; TypeScript проверяется через `typecheck`, CJS syntax — `node --check`.

`smoke` и `smoke:queue` открывают настоящее окно с отдельным тестовым профилем. Данные остаются в игнорируемом `artifacts/`. В CI запускаются typecheck, кодековые тесты и frontend build; CI без Vulkan не подтверждает работу AI.

## Сборка Windows

```powershell
npm run dist:win
npm run smoke:packaged
npm run smoke:portable
node scripts/models-smoke.cjs --packaged
node scripts/verify-package.cjs
```

Перед сборкой выполните `engine:install`. Подготовка сверяет checked-in hashes и копирует только файлы из allowlist в `build/engine`, создаёт иконку и собирает лицензии. Случайные DLL из runtime не копируются. Пакеты находятся в `release/0.3.0-alpha.1/`. Закройте запущенный Portable из этой папки перед пересборкой. Эти команды не публикуют GitHub Release.

`smoke:packaged` проверяет `win-unpacked/SCALEGO.exe` из output directory в package.json; `smoke:portable` — распаковку и запуск Portable, AI, экспорт и завершение. `models-smoke --packaged` проверяет каталог, запуск доступных моделей и рецепты. Для проверки внешнего runtime добавьте `--engine-root runtime`. `verify-package` проверяет полный состав native-файлов, hashes, notices, актуальность ASAR и создаёт `SHA256SUMS.txt`. Для короткой проверки выпуска: `node scripts/release-smoke.cjs` запускает Portable и по одному заданию Real-ESRGAN и Real-CUGAN; `node scripts/zoom-smoke.cjs release/0.3.0-alpha.1/win-unpacked/SCALEGO.exe` проверяет zoom без inference. Установка NSIS — отдельная ручная проверка.

`npm run benchmark -- --gpu 0` создаёт reproducible JSON practical benchmark; `--gpu 1` выбирает другой адаптер. Подробности и расширение registry: [MULTI_ENGINE](MULTI_ENGINE.md), лицензии и source reproduction: [MODEL_AUDIT](MODEL_AUDIT.md), [jpegli feasibility](JPEGLI_AUDIT.md).

Для GitHub `verify-package` также создаёт побайтовую копию установщика под стабильным именем `SCALEGO-<version>-Setup.exe` и записывает checksums для этого имени и Portable. Публикуйте именно эти два EXE вместе с `SHA256SUMS.txt`.

## Структура

| Путь | Ответственность |
| --- | --- |
| `src/` | React-интерфейс, TypeScript-контракты, темы |
| `electron/` | IPC, очередь, worker, кодеки, AI, экспорт |
| `scripts/` | Запуск, модели, сборка, проверки Electron |
| `tests/` | Кодеки и поведение обработки/экспорта |
| `third-party/` | Лицензии и версии нативных библиотек |
| `docs/` | Руководства, архитектура, аудит и QA |

`node_modules/`, `runtime/`, `release/`, `build/`, `.local/`, `artifacts/` и файлы окружения не коммитятся. Не включайте личные изображения и сессии в тестовые данные или issue.

## Выпуск

Публикуйте из проверенного коммита. Текущая версия — `0.3.0-alpha.1`; package и lockfile обновляются согласованно. Рецепт и Portable smoke читают версию из package.json. Приложите Portable, установщик, контрольные суммы и release notes. Alpha остаётся prerelease. Основание распространения весов и принятое владельцем решение сохраняйте в licensing-документации.
