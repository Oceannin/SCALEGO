[English](README.md) | [Русский](README.ru.md)

# SCALEGO

SCALEGO is a local Windows workstation for enlarging, compressing, comparing, and exporting images. It combines conventional resizing with optional AI upscaling and keeps the processing workflow on your computer.

> Current release: [v0.3.0-alpha.1](https://github.com/Oceannin/SCALEGO/releases/tag/v0.3.0-alpha.1).

## Features

- Three workflows: upscale, upscale and compress, or compress without changing dimensions.
- Side-by-side comparison with a draggable split, Original/Result views, Fit and 1:1 zoom, mouse-wheel zoom, and selectable preview backgrounds.
- Batch workspace for up to 200 images, with processing and export actions scoped to the current selection.
- Five bundled AI profiles, plus Lanczos and Nearest resizing without AI.
- PNG, JPEG, WebP, and AVIF output with quality, lossless, transparency, and optional file-size controls where the selected format supports them.
- English and Russian interface, an in-app language switch, and a persisted language preference.
- Light and dark themes, queue recovery, local session storage, and `.scalego` processing recipes beside exported images.

## Workflow

1. **Add** one or more images with the Add button, file picker, or drag and drop.
2. **Configure** the selected images: choose Upscale, Upscale and compress, or Compress; then set the relevant scale, method, model, format, and export options.
3. Select **Process**. Changing a processing setting after a result is ready marks that result as outdated and makes Process the primary action again.
4. **Compare** the original and result with the split view, zoom controls, and preview background selector.
5. **Save** the finished result. For one image, use Save. With multiple images, Save selected exports the selected finished results, while Save all exports the latest finished result for every source.

Source files are never overwritten. If no output folder has been chosen, SCALEGO asks for one when you save.

## AI models and resize engines

The Windows packages bundle both native Vulkan engines and all five model profiles. A source checkout does not contain the runtime until `npm run engine:install` downloads the pinned official archives and verifies their SHA-256 hashes.

| Profile | Best suited to | Engine / model | Native scale | Available scale |
| --- | --- | --- | --- | --- |
| Photo · Natural | Softer, more natural photo detail | Real-ESRGAN / `realesrnet-x4plus` | 4× | 2×, 3×, 4× |
| Photo · Detailed | Stronger photo detail | Real-ESRGAN / `realesrgan-x4plus` | 4× | 2×, 3×, 4× |
| Illustration · Clean | Clean lines and denoising | Real-CUGAN SE, denoise3 | 2×, 3×, 4× | 2×, 3×, 4× |
| Illustration · Detailed | Detailed illustration and anime | Real-ESRGAN / `realesrgan-x4plus-anime` | 4× | 2×, 3×, 4× |
| Fast | Fast previews and lightweight graphics | Real-ESRGAN / `realesr-animevideov3` | 2×, 3×, 4× | 2×, 3×, 4× |

The 4×-native profiles produce 2× and 3× results by running their native model and applying one Lanczos downscale. AI may reconstruct fine detail rather than preserve it exactly, so inspect text, faces, thin lines, and transparency before export. The alpha channel is resized separately from RGB.

Lanczos and Nearest run without the AI runtime. See the [model and licensing audit](docs/MODEL_AUDIT.md) and [multi-engine notes](docs/MULTI_ENGINE.md) for implementation details.

## Download and installation

SCALEGO targets Windows x64. Published builds are available as a Portable executable and an NSIS installer on [GitHub Releases](https://github.com/Oceannin/SCALEGO/releases). The builds are not digitally signed.

AI upscaling requires a compatible Vulkan GPU, a current graphics driver, and the [Microsoft Visual C++ Redistributable x64](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist). Compression, Lanczos, and Nearest do not require the AI engines. macOS and Linux packages are not provided.

## Formats and limits

- Static PNG, JPEG, WebP, and AVIF images are supported; animated images, RAW files, and video are not.
- Each source may be up to 200 MB and 40 megapixels. A result may be up to 100 megapixels and 32,768 pixels on either side; available memory can impose a lower practical limit.
- Upscale-only always produces a lossless PNG. Upscale and compress or Compress can produce PNG, JPEG, WebP, or AVIF.
- JPEG is always lossy and replaces transparency with the selected background. WebP and AVIF support lossy and lossless export. Lossy PNG uses palette reduction and can alter colors and alpha values.
- A file-size target adjusts quality without reducing dimensions and is not guaranteed to be achievable. In lossless mode, the target is checked but quality is not reduced.
- Output is sRGB, 8 bits per channel. EXIF and the source ICC profile are not retained.

## Development

Requirements: Windows x64, Node.js 24, npm, and internet access for dependencies and the optional AI runtime. No API key or `.env` file is required.

```powershell
git clone https://github.com/Oceannin/SCALEGO.git
cd SCALEGO
npm ci
npm run engine:install
npm run dev
```

`npm run dev:web` opens the React interface without Electron; file processing is available only in Electron. To work without AI, omit `engine:install` and choose Lanczos, Nearest, or compression-only processing.

Run the maintained checks before opening a pull request:

```powershell
npm run typecheck
npm test
npm run build
npm run smoke
npm run smoke:queue
npm run smoke:models
```

`npm run dist:win` builds the Windows Portable and NSIS packages after the runtime is installed. It prepares local artifacts only and does not publish a release. Packaging details and extended checks are documented in [Development](docs/DEVELOPMENT.md).

| Path | Responsibility |
| --- | --- |
| `src/` | React interface, localization, themes, and UI contracts |
| `electron/` | Electron main process, IPC, processing queue, codecs, AI engines, and export |
| `scripts/` | Development, runtime installation, packaging, and smoke checks |
| `tests/` | Processing, engine, queue, and export tests |
| `docs/` | User, architecture, validation, and licensing documentation |

## Licensing

SCALEGO is licensed under the [MIT License](LICENSE). Native engines, codecs, and model artifacts retain their own licenses and notices; see [Third-party notices](THIRD_PARTY_NOTICES.md) and the [model audit](docs/MODEL_AUDIT.md).

## Contributing and issues

Bug reports and focused feature requests are welcome in [GitHub Issues](https://github.com/Oceannin/SCALEGO/issues). Pull requests should keep user-facing behavior documented in both README files and pass the checks above. When reporting an image-processing problem, include the SCALEGO version, Windows version, GPU and driver, selected workflow, output format, and error text; attach only images you are allowed to share.
