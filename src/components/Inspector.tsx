import { ArrowUpRight, ArrowRight, Minimize2, FolderOpen, Layers, Info } from 'lucide-react'
import { modelText, translateMessage, useI18n } from '../i18n'
import type { Options, Engine, Asset } from '../types'

interface Props { options: Options; setOptions: (options: Options) => void; engine: Engine; asset?: Asset; selectionCount: number; selectionHasAlpha: boolean; busy: boolean; outputDirectory: string | null; chooseDirectory: () => void }

export function Inspector({ options, setOptions, engine, asset, selectionCount, selectionHasAlpha, busy, outputDirectory, chooseDirectory }: Props) {
  const { t } = useI18n()
  const update = (patch: Partial<Options>) => setOptions({ ...options, ...patch })
  const upscale = options.mode !== 'compress', compression = options.mode !== 'upscale'
  const lossless = options.format !== 'jpeg' && options.lossless
  const selectedModel = engine.models.find(model => model.id === options.model)
  const modelHelp = selectedModel?.available
    ? modelText(t, selectedModel.id, 'profile')
    : translateMessage(t, selectedModel?.statusCode === 'MODEL_RESTRICTED' ? 'engine' : 'error', selectedModel?.statusCode || selectedModel?.code || engine.statusCode)
  return <aside className="inspector" aria-label={t('inspector.aria')}>
    <div className="panel-heading"><h2>{t('inspector.title')}</h2>{selectionCount > 1 && <span className="batch-scope">{t('inspector.appliesTo', { count: selectionCount })}</span>}</div>
    <div className="inspector-scroll">
      <fieldset disabled={busy} className="mode-field"><legend>{t('inspector.actionLegend')}</legend>
        {([
          ['upscale', t('mode.upscale'), t('mode.upscaleHelp'), ArrowUpRight],
          ['chain', t('mode.chain'), t('mode.chainHelp'), Layers],
          ['compress', t('mode.compress'), t('mode.compressHelp'), Minimize2],
        ] as const).map(([value, label, help, Icon]) => <label className={`mode-option ${options.mode === value ? 'selected' : ''}`} key={value}>
          <input type="radio" name="mode" value={value} checked={options.mode === value} onChange={() => update({ mode: value })}/><Icon size={18}/><span><strong>{label}</strong><small>{help}</small></span><span className="radio-dot"/>
        </label>)}
      </fieldset>
      {upscale && <section className="settings-section"><h3>{t('upscale.title')}</h3>
        <fieldset disabled={busy}><legend>{t('upscale.scale')}</legend><div className="segments">{[2, 3, 4].map(scale => <button type="button" aria-pressed={options.scale === scale} key={scale} onClick={() => update({ scale })}>{scale}×</button>)}</div></fieldset>
        <label className="field">{t('upscale.method')}<select disabled={busy} value={options.method} onChange={e => update({ method: e.target.value as Options['method'] })}>
          <option value="ai" disabled={!engine.available}>{t('method.ai')}</option><option value="lanczos">{t('method.lanczos')}</option><option value="nearest">{t('method.nearest')}</option>
        </select></label>
        {options.method === 'ai' && <>
          <label className="field">{t('model.desiredResult')}<select disabled={busy} value={options.model} aria-describedby="model-help" onChange={e => update({ model: e.target.value as Options['model'] })}>
            {engine.models.map(model => <option key={model.id} value={model.id}>{modelText(t, model.id, 'name')}{model.available ? '' : ` · ${t('common.unavailable')}`}</option>)}
          </select></label>
          <p className="field-help" id="model-help">{modelHelp}</p>
          <details className="advanced"><summary>{t('model.about')}</summary><p className="field-help">{selectedModel?.name}<br/>{selectedModel?.nativeScales.length === 1 ? t('model.singleScale') : t('model.multiScale')}<br/>{t('model.alpha')} {selectedModel?.available && t('model.vulkan')}</p></details>
        </>}
        {options.method !== 'ai' && <p className="field-help">{options.method === 'nearest' ? t('method.nearestHelp') : t('method.lanczosHelp')}</p>}
        {asset && <div className="dimension-plan"><span>{asset.width} × {asset.height}</span><ArrowRight size={14}/><strong>{asset.width * options.scale} × {asset.height * options.scale}</strong></div>}
      </section>}
      {compression && <section className="settings-section"><h3>{t('compress.title')}</h3>
        <label className="field">{t('compress.format')}<div className="format-row">{(['webp', 'png', 'jpeg', 'avif'] as const).map(format => <button type="button" disabled={busy} aria-pressed={options.format === format} key={format} onClick={() => update({ format, lossless: format === 'jpeg' ? false : options.lossless })}>{format === 'jpeg' ? 'JPG' : format.toUpperCase()}</button>)}</div></label>
        {['png', 'webp', 'avif'].includes(options.format) && <label className="check-row"><input disabled={busy} type="checkbox" checked={options.lossless} onChange={e => update({ lossless: e.target.checked })}/><span>{t('compress.lossless')}</span></label>}
        {!lossless && <label className="field range-field"><span>{t('compress.quality')} <strong>{options.quality}</strong></span><input disabled={busy} aria-label={t('compress.qualityAria')} type="range" min="1" max="100" value={options.quality} onChange={e => update({ quality: Number(e.target.value) })}/><span className="range-captions"><small>{t('compress.smallerFile')}</small><small>{t('compress.moreDetail')}</small></span></label>}
        {options.format === 'png' && <p className="field-help">{lossless ? t('compress.pngLosslessHelp') : t('compress.pngLossyHelp')}</p>}
        {options.format === 'jpeg' && selectionHasAlpha && <label className="field">{t('compress.jpegBackground')}<div className="color-input"><input disabled={busy} type="color" aria-label={t('compress.jpegBackgroundAria')} value={options.background} onChange={e => update({ background: e.target.value })}/><code>{options.background.toUpperCase()}</code></div></label>}
        <details className="advanced"><summary>{t('compress.limitTitle')}</summary><label className="field">{t('compress.limitLabel')}<input disabled={busy} type="number" min="0" max="200000" step="1" value={options.targetKB} onChange={e => update({ targetKB: Math.max(0, Math.min(200000, Math.round(Number(e.target.value)))) })}/></label><p className="field-help">{lossless ? t('compress.limitLosslessHelp') : t('compress.limitLossyHelp')}</p></details>
      </section>}
      {!compression && <p className="inline-note"><Info size={15}/>{t('compress.upscaleOnlyNote')}</p>}
      <section className="settings-section export-section"><h3>{t('export.title')}</h3><button className="directory-button" onClick={chooseDirectory} disabled={busy}><FolderOpen size={18}/><span>{outputDirectory || t('export.chooseFolder')}<small>{t('export.sourcesStay')}</small></span></button><details className="advanced export-details"><summary>{t('export.details')}</summary><p className="field-help">{t('export.help')}</p></details></section>
    </div>
  </aside>
}
