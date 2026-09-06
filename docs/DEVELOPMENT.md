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

`engine:install` скачивает официальные закреплённые архивы Real-ESRGAN, проверяет SHA-256 и готовит `runtime/`. Без моделей можно разрабатывать сжатие и обычное увеличение. Реальный AI требует Vulkan GPU и драйвера.

`npm run dev` использует Vite на `127.0.0.1:5178`. `npm run dev:web` показывает интерфейс отдельно; файловая обработка работает только в Electron.

## Проверки

```powershell
npm run typecheck
npm test
npm run build
npm run smoke
npm run smoke:queue
```

Unit-тесты проверяют реальные кодеки, размеры, прозрачность, лимит веса, исходники, отмену и экспорт. AI-тест пропускается без установленного Windows engine. Для полного теста требуется работающий Vulkan GPU.

`smoke` и `smoke:queue` открывают настоящее окно с отдельным тестовым профилем. Данные остаются в игнорируемом `artifacts/`. В CI запускаются typecheck, кодековые тесты и frontend build; CI без Vulkan не подтверждает работу AI.

## Сборка Windows

```powershell
npm run dist:win
npm run smoke:packaged
npm run smoke:portable
```

Перед сборкой нужны модели в `runtime/`. Подготовка проверяет хеши движка, создаёт иконку и собирает лицензии. Закройте ранее запущенный Portable из `release/`: открытый EXE блокирует перезапись. Эти команды не публикуют GitHub Release.

`smoke:packaged` проверяет `release/win-unpacked/SCALEGO.exe`; `smoke:portable` — распаковку и запуск Portable, AI, экспорт и завершение. Установка NSIS — отдельная ручная проверка. Обновляйте `SHA256SUMS.txt` после окончательной сборки.

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

Публикуйте из проверенного коммита. Сверьте версию в `package.json`, lockfile и метаданных рецепта (`electron/pipeline.cjs`); сценарий Portable также содержит имя версии. В первой alpha эти значения ещё не централизованы. Приложите Portable, установщик, контрольные суммы и release notes. Alpha должна оставаться prerelease. Лицензирование исходников и условия распространения комплектуемых зависимостей должны быть определены до публикации соответствующих файлов.
