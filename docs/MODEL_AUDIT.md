# Native engines and model audit — 7 September 2026

## Decision

All five intent routes are included in the public Portable and NSIS packages. The project owner explicitly accepted the previously documented weights-license risk and approved redistribution of the existing verified Real-ESRGAN-family artifacts. This decision supersedes the earlier exclusion; no new licensing audit or model download was performed. Real-CUGAN SE denoise3 at 2×/3×/4× is unchanged.

Upstream: [xinntao/Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN). Redistribution basis: **BSD-3-Clause** of the official upstream project, with the full text preserved in `third-party/inference/Real-ESRGAN-project-LICENSE.txt` and `resources/engine/licenses/Real-ESRGAN-project-LICENSE.txt`.

> Pretrained Real-ESRGAN weights are redistributed based on the BSD-3-Clause license of the official upstream project and its official distribution of these model artifacts.

For Real-CUGAN, [upstream collaborator's answer to the model-license question](https://github.com/bilibili/ailab/issues/17#issuecomment-1029590725) points explicitly to [bilibili's MIT license](https://github.com/bilibili/ailab/blob/main/Real-CUGAN/LICENSE). The selected **SE** weights belong to the original family covered by that 2022 clarification. Pro/nose and extra denoise variants are not included. Full license and API evidence are preserved under `third-party/inference/` with source URLs and hashes.

## Model inventory

Sizes include `.bin` and `.param`, uncompressed. Native scale means the scale of the distributed ncnn variant, not the Python `outscale` parameter.

| Intent | Model | Engine | Native scales | Files, bytes | Distributed | Weights license evidence |
| --- | --- | --- | --- | ---: | --- | --- |
| Photo / Natural | realesrnet-x4plus | Real-ESRGAN v0.2.0 | 4 | 33,540,549 | Yes | BSD-3-Clause, upstream distribution basis above |
| Photo / Detailed | realesrgan-x4plus | Real-ESRGAN v0.2.0 | 4 | 33,540,549 | Yes | BSD-3-Clause, upstream distribution basis above |
| Illustration / Clean | realcugan-se, denoise3 | Real-CUGAN 20220728 | 2, 3, 4 | 7,983,814 | Yes | MIT, explicit upstream model-license clarification |
| Illustration / Detailed | realesrgan-x4plus-anime | Real-ESRGAN v0.2.0 | 4 | 8,973,790 | Yes | BSD-3-Clause, upstream distribution basis above |
| Fast | realesr-animevideov3 | Real-ESRGAN v0.2.0 | 2, 3, 4 | 3,751,527 | Yes | BSD-3-Clause, upstream distribution basis above |

`RealESRNet_x4plus`, `RealESRGAN_x4plus` and `RealESRGAN_x4plus_anime_6B` use the already integrated ncnn file stems `realesrnet-x4plus`, `realesrgan-x4plus` and `realesrgan-x4plus-anime`, respectively. Fast includes its existing x2/x3/x4 pairs. No registry, inference, version or checksum changes are required.

| Official weights source | Archive SHA256 |
| --- | --- |
| [RealESRNet, 20210901 Windows archive / v0.2.2.4](https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.2.4/realesrgan-ncnn-vulkan-20210901-windows.zip) | `4c3a9220c2b376b72910bdb936552d018ed4b33742599a0383b1261623970dd3` |
| [Photo/anime RealESRGAN and animevideov3, 20220424 Windows archive / v0.2.5.0](https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-windows.zip) | `abc02804e17982a3be33675e4d471e91ea374e65b70167abc09e31acb412802d` |

Individual `.bin` and `.param` SHA256 values and sizes remain pinned in [electron/native-artifacts.json](../electron/native-artifacts.json); the same records are shipped in `resources/engine/SCALEGO-engine-manifest.json` and checked during packaging.

RealESRNet's official PyTorch checkpoint is [RealESRNet_x4plus.pth, v0.1.1](https://github.com/xinntao/Real-ESRGAN/releases/tag/v0.1.1). No conversion or Python is needed: the official [20210901 Windows archive, v0.2.2.4](https://github.com/xinntao/Real-ESRGAN/releases/tag/v0.2.2.4) contains `realesrnet-x4plus.bin/.param`. The current v0.2.0 executable accepts `-n realesrnet-x4plus`. Actual 4× inference and 2×/3× downsampling passed locally. Its MSE training can yield smoother textures; “natural” is a purpose, not a promise of faithful reconstruction. [Official model zoo](https://github.com/xinntao/Real-ESRGAN/blob/v0.3.0/docs/model_zoo.md).

Fast uses three ncnn filesets from the official [20220424 distribution, v0.2.5.0](https://github.com/xinntao/Real-ESRGAN/releases/tag/v0.2.5.0). The runner passes `-n realesr-animevideov3 -s 2|3|4`, selecting the corresponding `-x2/-x3/-x4` files. This is already the old SCALEGO `illustration` behavior. Its small network is useful for fast graphics previews; it has limited detail on photos. The [upstream comparison](https://github.com/xinntao/Real-ESRGAN/blob/v0.3.0/docs/anime_video_model.md) and local synthetic timing support its positioning, without establishing a universal quality ranking.

## Real-CUGAN runtime

The [ncnn implementation](https://github.com/nihui/realcugan-ncnn-vulkan/tree/20220728) is linked by [bilibili's model project](https://github.com/bilibili/ailab/tree/main/Real-CUGAN); it is not an arbitrary third-party repack. The official Windows archive is `realcugan-ncnn-vulkan-20220728-windows.zip`, 45,977,449 bytes. Only one executable (6,656,512 bytes) and three SE denoise3 pairs are installed for Clean. CLI:

```text
realcugan-ncnn-vulkan.exe -i <rgb.png> -o <ai.png>
  -m <runtime>/realcugan/models-se -n 3 -s 2|3|4 -c 1 -t 256 -j 1:1:1 -f png
```

`-c 1` selects accurate synchronization. SE supports conservative `-1`, no-denoise `0`, denoise3 at 2×/3×/4×; denoise1/2 exist at 2× only. SCALEGO deliberately exposes a single Clean profile, denoise3, to reduce noise/compression artifacts without adding a matrix of expert controls. Strong denoising can smooth texture. Pro lacks a 4× weights set in this archive and is not substituted or chained.

The official README advertises Vulkan on Intel, AMD and NVIDIA. Local evidence covers NVIDIA RTX 4070 Ti SUPER and AMD Radeon integrated graphics; it does not certify Intel or every driver. PE headers of both inference executables are AMD64 (`8664`), with imports `vulkan-1.dll`, Windows COM/kernel libraries and `VCOMP140.DLL`. No Python, PyTorch, CUDA or new npm package is required. Microsoft OpenMP remains a system prerequisite installed from Microsoft's Visual C++ Runtime x64; neither its release nor debug DLL is redistributed here.

## Source / executable / embedded libraries

| Component | Source license | Binary redistribution / required notices | Commercial restriction found |
| --- | --- | --- | --- |
| Real-ESRGAN ncnn v0.2.0 | MIT, Xintao Wang / nihui | Preserve full MIT notices | None in source grant; this does not settle weights |
| Real-CUGAN ncnn 20220728 | MIT, nihui | Preserve full MIT notice | None in source grant |
| Real-CUGAN SE weights | MIT, bilibili; separate model clarification above | Preserve bilibili MIT notice and attribution | None in confirmed model grant |
| ncnn | BSD-3-Clause plus notices in its LICENSE | Retain all included notices | No noncommercial restriction |
| glslang / SPIR-V code | Multiple permissive terms in aggregate LICENSE | Preserve aggregate LICENSE | No noncommercial restriction found in those terms |
| libwebp | BSD-3-Clause with patent grant | COPYING and PATENTS | Patent grant has its stated termination conditions |
| win32dirent | MIT, Toni Ronkko | Header attribution plus full MIT text | None |
| stb | MIT / public domain dual license | MIT text retained defensively; Windows image IO uses WIC | None |
| Microsoft OpenMP | Microsoft terms | Not redistributed; official system prerequisite | Not licensed by an upstream project's MIT notice |

`third-party/inference/sources.json` records exact notice URLs and SHA256. The glslang/ncnn/libwebp notices follow the submodule commits of each engine, rather than assuming a shared version. Model licenses are recorded separately from runtime licenses.

## Supply chain and reproducibility

`electron/native-artifacts.json` is the checked-in trust source: official archive URLs, tags, archive SHA256, individual file SHA256, sizes, archive paths and per-file redistribution decisions. Local runtime manifests cannot authorize additional packaged files. Hashes were computed from official HTTPS downloads; neither signed upstream attestations nor bit-for-bit reproducible builds are claimed.

| Runtime | Tag / commit | Archive SHA256 |
| --- | --- | --- |
| Real-ESRGAN ncnn | v0.2.0 / 37026f49824c5cf84062e7c6a5dd71445dcf610f | 1bbbdb12d470af80b035c773682e144c6c2f6ece9210832a289af0a48ce3fa9a |
| Real-CUGAN ncnn | 20220728 / 395302c5c70f1bff604c974e92e0a87e45c9f9ee | c6e08d46c11704b1e3a1ada9ddd591cb5005f52f132136c8633ba25def400e01 |

For source rebuilding, check out the exact commit, run `git submodule update --init --recursive`, install the Windows x64 MSVC/CMake toolchain and Vulkan SDK 1.2.162.0 specified in each [upstream release workflow](https://github.com/nihui/realcugan-ncnn-vulkan/blob/20220728/.github/workflows/release.yml), then `cmake -A x64 -S src -B build` and `cmake --build build --config Release -j 2`. Historical workflows use a moving Windows runner, so this is a source reproduction recipe, not a byte-identical build assertion. A new build must be audited and receive new pins before SCALEGO accepts it.

CUGAN submodules: ncnn `066614351391d309c96ae1e00c6fb1bd873b4949`, libwebp `b9d2f9cd3bec5b0970edeb11ea03c0a4ea06e332`. ESRGAN: ncnn `6125c9f47cd14b589de0521350668cf9d3d37e3c`, libwebp `8ea81561d2fdd382da60f57958741a7c23a18eb6`.

The application hands only normalized internal PNGs to these older inference binaries, with bounds checked before invocation. Arbitrary external WebP/JPEG files are decoded by current Sharp. This narrows exposure to old embedded decoders but does not prove absence of native vulnerabilities.
