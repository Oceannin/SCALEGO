# Third-party software in SCALEGO

SCALEGO uses existing open-source inference and image codecs. It does not contain copied Upscayl application code, branding or artwork. Upscayl informed the initial product research.

| Component | Role | Upstream license / source |
| --- | --- | --- |
| Electron / Chromium / Node.js | Desktop runtime | MIT and bundled notices; `LICENSE.electron.txt` and `LICENSES.chromium.html` beside the application |
| React, React DOM, Scheduler | Interface | MIT — https://github.com/facebook/react |
| Lucide | Interface icons | ISC — https://github.com/lucide-icons/lucide |
| Metal FX 1.0.4 | Optional local liquid-metal rim on the processing action | MIT, Copyright (c) 2026 Jakub Antalik — https://github.com/Jakubantalik/metal-fx |
| Sharp | Image decoding, resizing, encoding | Apache-2.0 — https://github.com/lovell/sharp |
| libvips and codec libraries | Native image processing | libvips is LGPL-2.1-or-later; Sharp's binary stack elects LGPLv3 where applicable. Attribution, license texts and exact Windows component versions are included in `resources/licenses/native-image-libraries/` — https://github.com/lovell/sharp-libvips/blob/v1.3.3/THIRD-PARTY-NOTICES.md |
| Real-ESRGAN-ncnn-vulkan | Separate native inference executable, v0.2.0 Windows | MIT — https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan |
| Real-ESRGAN / RealESRNet | Bundled RealESRNet_x4plus, RealESRGAN_x4plus, RealESRGAN_x4plus_anime_6B and realesr-animevideov3 weights from official v0.2.2.4 / v0.2.5.0 archives | BSD-3-Clause, official upstream project — https://github.com/xinntao/Real-ESRGAN |
| Real-CUGAN-ncnn-vulkan | Separate Windows x64 inference executable, 20220728 | MIT, nihui — https://github.com/nihui/realcugan-ncnn-vulkan/tree/20220728 |
| Real-CUGAN SE weights | Clean profile, denoise3 at native 2×/3×/4× | MIT, bilibili, explicitly identified by upstream in response to a model-license question — https://github.com/bilibili/ailab/issues/17#issuecomment-1029590725 |
| ncnn | Inference library embedded in the native executable | BSD-3-Clause — https://github.com/Tencent/ncnn |
| glslang / SPIR-V, libwebp, win32dirent, stb | Libraries and support code in inference sources/binaries | Full aggregate glslang and ncnn notices, libwebp COPYING/PATENTS, MIT dirent and dual-license stb texts are retained in `resources/engine/licenses/`; exact source revisions in `sources.json` |
| Microsoft OpenMP runtime | System prerequisite for the inference binary; `vcomp140.dll` is excluded from packaged releases | Install Visual C++ Runtime x64 from [Microsoft](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist); it is not covered by the inference project's MIT license |

The packaged application includes full installed dependency notices in `resources/licenses/`, inference notices in `resources/engine/`, and `resources/THIRD_PARTY_NOTICES.md`. Native Sharp libraries remain outside the ASAR archive in `resources/app.asar.unpacked/node_modules/` so their dynamic libraries can be inspected and replaced with compatible builds. Source and build instructions for that dependency stack: https://github.com/lovell/sharp-libvips . No modifications to these upstream libraries or models were made.

`resources/engine/SCALEGO-engine-manifest.json` records exact release URLs and SHA-256 digests for the reviewed packaged artifacts. `electron/native-artifacts.json` is the checked-in allowlist used by the installer and packaging gate. Archive digests were pinned from official HTTPS downloads, not independently signed attestations. No exclusive rights over weights or training data are claimed.

> Pretrained Real-ESRGAN weights are redistributed based on the BSD-3-Clause license of the official upstream project and its official distribution of these model artifacts.

Weight sources: [RealESRNet, official 20210901 Windows distribution (v0.2.2.4)](https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.2.4/realesrgan-ncnn-vulkan-20210901-windows.zip) and [RealESRGAN photo/anime and animevideov3, official 20220424 Windows distribution (v0.2.5.0)](https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-windows.zip). Existing archive and individual `.bin`/`.param` SHA256 values are preserved in [the artifact manifest](electron/native-artifacts.json) and the packaged manifest above. The full BSD-3-Clause text is retained in `resources/engine/licenses/Real-ESRGAN-project-LICENSE.txt`. This packaging decision follows the project owner's explicit acceptance of the previously documented weights-license risk.

Full inference notices and model-license evidence are retained in `third-party/inference/` and copied into packages. Separate source, executable, weights, embedded-library, commercial-redistribution and reproduction findings are recorded in [the model audit](docs/MODEL_AUDIT.md). Real-CUGAN Pro/nose and extra denoise variants, jpegli, Python and PyTorch are not distributed.

Redistribution must preserve these notices and the accompanying license texts. Microsoft OpenMP is not redistributed in SCALEGO packages: users install the official runtime separately. The original upstream archives contain its DLL; the installer does not copy it and the packaging allowlist excludes it. See [Microsoft redistribution terms](https://learn.microsoft.com/en-us/visualstudio/releases/2022/redistribution) for that component. SCALEGO's original code is licensed under the [MIT License](LICENSE). Third-party components and models retain their respective licenses.

## Metal FX 1.0.4 — experimental renderer branch

Bundled locally from the pinned npm package without modifications. No CDN, remote assets or runtime network requests. Aave Glass informed the material and interaction research; no Aave implementation code is included.

MIT License

Copyright (c) 2026 Jakub Antalik

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
