# jpegli: отдельный feasibility audit

Дата: 7 сентября 2026. Решение: **оставить текущий MozJPEG, jpegli не внедрять в этот этап**.

## Есть ли преимущество?

SCALEGO уже использует `sharp.jpeg({ mozjpeg: true })`, а не обычный JPEG encoder с минимальными настройками. Текущая Windows-библиотека Sharp 0.35.4 / libvips 8.18.6 содержит MozJPEG `0826579`. [Sharp документирует](https://sharp.pixelplumbing.com/api-output/#jpeg) trellis, deringing, optimized scans и quantisation table, включаемые этой настройкой.

[Исследование Google](https://opensource.googleblog.com/2024/04/introducing-jpegli-new-jpeg-coding-library.html) показывает перспективный выигрыш jpegli по визуальному качеству/битрейту и сравнивает его с MozJPEG и libjpeg-turbo. Но общий тезис про 35% не является измеренным выигрышем относительно конкретного SCALEGO workflow. Значение quality=85 у двух encoder не означает одинакового визуального качества. Для обоснованной замены нужен парный тест при сопоставимом восприятии на фото, градиентах, тексте и alpha-flatten, а также проверка существующего targetKB search. Такого пользовательского корпуса в задаче нет; победа jpegli для SCALEGO **не установлена**.

## Windows и размер

Текущий [google/jpegli](https://github.com/google/jpegli) имеет Windows build workflow (MSVC/clang-cl/vcpkg) и [MSYS2 instructions](https://github.com/google/jpegli/blob/main/doc/developing_in_windows_msys.md). API списка релизов google/jpegli на дату аудита вернул пустой массив. Наличие CI не равно наличию закреплённого стабильного standalone Windows release.

Исторический официальный [libjxl v0.11.1](https://github.com/libjxl/libjxl/releases/tag/v0.11.1) содержит статический `cjpegli.exe`. Архив `jxl-x64-windows-static.zip` измерен: **50,016,636 bytes** (много инструментов, не размер нужного encoder); сам **cjpegli.exe — 5,466,112 bytes**. PE AMD64, единственный DLL import — KERNEL32.dll, delay imports отсутствуют. Он не нуждается в комплектовании всего libjxl набора. Для аудита архив только распакован и проинспектирован, в runtime/installer он не попадает.

SHA256 архива: `8f53ebce91820c30c9fc9294f06380213c1e2e66b361718880580246b2be008e`; encoder: `db564007b69b8f038eb4703fc72278c15a992aad9865fa59166735d6fd41b740`. Это измерение исторического binary, **не оценка размера будущей актуальной сборки**. [libjxl v0.12](https://github.com/libjxl/libjxl/releases) вынес jpegli в отдельный проект и рекомендует актуальные версии из-за исправлений безопасности. Брать старый весь пакет ради encoder не рекомендуется.

## Варианты интеграции

1. **Отдельный cjpegli executable**: Sharp нормализует RGB и flatten → PNG/PPM → cjpegli → стандартный JPEG → Sharp проверяет размеры. Появятся повторный decode, временный файл, ещё одна отмена/ошибка процесса и до семи subprocess запусков для targetKB. Это возможно, но усложняет текущий маленький compression subsystem. Его нельзя подключать как UpscaleEngine.
2. **Собственный libvips/Sharp binary stack с jpegli**: избежать subprocess overhead, но взять на себя ABI/Windows builds, updates, exact library notices и QA всех кодеков. [libvips Windows build](https://github.com/libvips/build-win64-mxe) имеет jpegli-путь. В установленном Sharp нет флага выбора jpegli; подмена DLL без воспроизводимого собственного build не является корректной интеграцией.

## Лицензия и воспроизводимость

[jpegli LICENSE](https://github.com/google/jpegli/blob/main/LICENSE) — BSD-3-Clause; сохранить copyright, условия, disclaimer, не использовать имена правообладателей для endorsement. [PATENTS](https://github.com/google/jpegli/blob/main/PATENTS) следует включать вместе с лицензиями встроенных Highway, skcms, sjpeg и всех выбранных input codecs. Модельных weights нет. BSD не содержит noncommercial ограничения; встроенные библиотеки требуют отдельного перечня и notices для выбранного build.

Для нового прототипа фиксировать git commit, submodule commits, vcpkg baseline, compiler/SDK, CMake flags и digest артефакта. Официальный [Windows workflow](https://github.com/google/jpegli/blob/main/.github/workflows/release.yaml) — исходная recipe. Bit-for-bit reproducibility здесь не проверялась; сборка актуального standalone jpegli не выполнялась.

Рекомендуемый gate для отдельного этапа: воспроизводимый current Windows encoder, сравнение качества при сопоставимом размере и полной стоимости pipeline, повторение targetKB/flatten/regression tests. До этого никаких новых зависимостей, CLI или пользовательских переключателей JPEG в SCALEGO.
