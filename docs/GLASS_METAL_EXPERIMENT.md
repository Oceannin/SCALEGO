# SCALEGO — Glass / Metal experiment

Experimental renderer branch: `design/glass-metal-experiment`, based on `origin/main` at `a149685`. Version remains `0.2.0-alpha.1`; this is not a release.

## Material direction

Precision workstation, optical glass, restrained metal. Graphite canvas and mostly opaque structural panels keep attention on the image. Glass is reserved for floating preview controls, moving selection indicators, the native quality slider thumb and the comparison handle. The library, inspector and compact footer are matte; orange identifies computation, while navigation lenses stay neutral. A warm orange action remains the product anchor. Light mode uses milky surfaces with darker readable text. Fonts remain local Segoe UI and Cascadia Mono/Consolas.

The semantic material, typography, color, shadow and motion tokens live in `src/styles/tokens.css`. Component styles are separated into `app.css`, `preview.css`, `inspector.css` and `optical.css` so inspector/preview rules do not depend on overrides of old styles.

Research sources:

- [Metal FX demo](https://metal.jakubantalik.com/) and [upstream source](https://github.com/Jakubantalik/metal-fx): a narrow specular rim creates a signature without turning every surface into chrome.
- [Aave: Building Glass for the Web](https://aave.com/design/building-glass-for-the-web): selection lenses, controlled edge highlights, readable layers and short state-driven motion. This is design/behavior inspiration only; no Aave source was copied. Optical refraction uses an original local implementation and is restricted to control-sized surfaces.

## Metal FX decision and budget

Added the exact npm dependency `metal-fx@1.0.4`. The published renderer and its pause/lifecycle implementation were inspected before integration. Its public instance API provides a single small 1.5px silver rim around the processing action, while leaving the native button, focus outline and orange CSS fallback independent of WebGL. No glow sampling, reflection targets or copied shader source are used. The package is bundled locally; no CDN, external fonts, visual assets or runtime network dependency is introduced. Its full MIT license is retained in `THIRD_PARTY_NOTICES.md`.

`MetalAccent.tsx` pauses when the action is disabled or the window loses focus/visibility. Processing replaces the action with Cancel and unmounts the decorative instance; reduced motion skips it entirely. Cleanup releases the renderer. Theme changes update the existing preset. Allocation is deferred beyond React StrictMode's effect replay to avoid the upstream renderer's old context-loss event affecting a new instance. WebGL initialization failure leaves the CSS rim and native action intact.

The inspected image elements have no filters, tint, opacity changes or blend modes. The comparison handle contains a separate, clipped 40×44px copy of the original/result environment. Only this copy is refracted. Floating toolbar/zoom controls reserve safe margins in fit mode; panning can intentionally move the image beneath them.

## Optical material — second iteration

`OpticalLens.tsx` generates an original rounded-box bevel displacement map, capped at 256×64 pixels. A local SVG filter displaces the control environment by up to a few pixels and offsets red/cyan channels by ±0.35px. Labels and icons render above the optical layer without distortion. A separate specular layer gives the upper highlight, lower edge and small chromatic rim. Maps update only when lens geometry changes, not during selection or dragging. There is no new animation loop, WebGL context or dependency for optical controls.

Scale, format, route, preview mode and background selection use moving lenses. The comparison handle squishes on press and refracts the cropped image beneath it; zoom and quality controls share the material. A small static metallic AI icon replaces the redundant local-status badge. Light-mode optics preserve source alpha when recombining color channels, keeping the frosted material bright.

Secondary text sizes and contrast were raised. Borders were removed from active library rows, route containers, stage labels and secondary footer actions; spacing, luminance and elevation now carry hierarchy. Result size delta uses a directional arrow; repeated footer captions were consolidated. Non-alpha sources default to a neutral canvas, alpha sources to checkerboard. Manual backdrop selection overrides the default for the active image; the original sand backdrop remains available alongside neutral, black, white and checkerboard.

## Layout and interaction changes

- Header: 58px. Library: 232px, or 216px on narrower desktops; rows are 74px with checkbox, thumbnail, metadata, textual status and remove control. Active rows expose `aria-current`; partial selection exposes a native indeterminate checkbox.
- Preview: floating top and zoom controls share the canvas, with safe fit margins and a 64px metrics strip. Original/result dimensions, bytes, format and percentage delta remain visible at the minimum desktop width.
- Compare: a 40×44px optical handle retains native range keyboard behavior. Only its thumb captures pointer input; dragging elsewhere pans directly. Help text now matches that behavior. Wheel zoom keeps its cursor anchor.
- Inspector: 320px / 304px, internal scroll, three compact native radio rows and a transform-only selection lens. Stage numbers follow the active route. All existing configuration bindings remain, including target size, JPEG background and model information. Engine details and saving details are expandable.
- Compact matte footer: persistent native processing, cancel/resume, single/batch save and reveal actions. It wraps when necessary without horizontal overflow. Result verification, warnings and stale settings use a compact expandable status. Success notices dismiss after six seconds; errors remain readable until dismissed. Notices do not consume permanent canvas rows.

No native engine, codec, model registry, worker, processing pipeline, queue semantics, recipe, hashing, filesystem, export implementation or Electron IPC was changed.

## Validation

Run from the repository root:

```sh
npm run typecheck
npm run build
node scripts/design-ui-smoke.cjs
```

The focused UI script starts Vite with an isolated browser fixture and saves screenshots plus `validation.json` in `artifacts/glass-metal/`. It uses installed Edge on Windows if bundled Playwright Chromium is absent. `SCALEGO_UI_URL` can point to an existing Vite server and `SCALEGO_UI_BROWSER` can select a Playwright browser channel.

Coverage includes empty/loaded/processing/result/compare/interrupted/error states, dark/light themes at 1600×1000, 940×700, 900×640 and 1200×800, selection, all processing routes/methods/formats, quality/lossless/target inputs, output-folder and export dispatch, native comparison keyboard/drag, direct panning, wheel/fit/1:1 zoom, reduced motion, image neutrality and horizontal overflow. Pixel-difference checks prove that refraction changes the sampled image inside the compare handle while leaving all pixels outside it unchanged. Additional checks cover contextual backdrop defaults, manual override, moving scale indicators, pressed-handle squish and unchanged displacement maps during drag. It measures real WebGL draw calls to verify pause behavior on simulated focus lifecycle events, removal during processing/reduced motion, and a working fallback when WebGL is unavailable.

The built frontend was also launched in actual Electron with an isolated profile and a real local PNG import. Engine discovery, enabled processing action, dark/light layout and absence of renderer exceptions were checked. Electron screenshots are saved alongside browser screenshots.

## Limits

Browser result images are deterministic visual fixtures, not AI-generated results or quality evidence. Export/queue assertions verify renderer dispatch to a fixture bridge; processing/export implementations were not re-tested. Native AI smoke, benchmarks, packaging and release tests are deliberately outside this experiment. Focus events are simulated in headless browser checks; a sustained inference performance benchmark and a full assistive-technology audit were not performed. Very long queues or rare engine-error messages may warrant further user testing.
