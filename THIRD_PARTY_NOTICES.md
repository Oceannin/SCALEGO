# Third-party software in SCALEGO

SCALEGO uses existing open-source inference and image codecs. It does not contain copied Upscayl application code, branding or artwork. Upscayl informed the initial product research.

| Component | Role | Upstream license / source |
| --- | --- | --- |
| Electron / Chromium / Node.js | Desktop runtime | MIT and bundled notices; `LICENSE.electron.txt` and `LICENSES.chromium.html` beside the application |
| React, React DOM, Scheduler | Interface | MIT — https://github.com/facebook/react |
| Lucide | Interface icons | ISC — https://github.com/lucide-icons/lucide |
| Sharp | Image decoding, resizing, encoding | Apache-2.0 — https://github.com/lovell/sharp |
| libvips and codec libraries | Native image processing | libvips is LGPL-2.1-or-later; Sharp's binary stack elects LGPLv3 where applicable. Attribution, license texts and exact Windows component versions are included in `resources/licenses/native-image-libraries/` — https://github.com/lovell/sharp-libvips/blob/v1.3.3/THIRD-PARTY-NOTICES.md |
| Real-ESRGAN-ncnn-vulkan | Separate native inference executable, v0.2.0 Windows | MIT — https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan |
| Real-ESRGAN | Official distributed model files from the v0.2.5.0 Windows release | Upstream BSD-3-Clause notice — https://github.com/xinntao/Real-ESRGAN |
| ncnn | Inference library embedded in the native executable | BSD-3-Clause — https://github.com/Tencent/ncnn |
| Microsoft OpenMP runtime | `vcomp140.dll`, supplied with the official inference binary | Microsoft runtime, not covered by the inference project's MIT license |

The packaged application includes full installed dependency notices in `resources/licenses/`, inference notices in `resources/engine/`, and `resources/THIRD_PARTY_NOTICES.md`. Native Sharp libraries remain outside the ASAR archive in `resources/app.asar.unpacked/node_modules/` so their dynamic libraries can be inspected and replaced with compatible builds. Source and build instructions for that dependency stack: https://github.com/lovell/sharp-libvips . No modifications to these upstream libraries or models were made.

`resources/engine/SCALEGO-engine-manifest.json` records exact release URLs and SHA-256 digests. Archive digests were pinned from official HTTPS downloads, not from independently signed upstream attestations. Model attribution records the project license supplied by the upstream project; no additional exclusive rights over weights or training data are claimed.

This is a local development preview, not a publicly published release. Public redistribution must preserve these notices and confirm applicable Microsoft runtime redistribution terms. SCALEGO's own source has not been assigned an open-source license; third-party licenses do not license the application's original code.
