import { ArrowUpRight, ArrowRight, Minimize2, FolderOpen, Layers, Cpu, Info, ChevronDown } from 'lucide-react'
import type { Options, Engine, Asset } from '../types'
import '../styles/inspector.css'

interface Props {
  options: Options
  setOptions: (options: Options) => void
  engine: Engine
  asset?: Asset
  busy: boolean
  outputDirectory: string | null
  chooseDirectory: () => void
}

const processingModes = [
  ['upscale', 'Увеличить', 'Больше разрешение', ArrowUpRight],
  ['chain', 'Увеличить и сжать', 'Больше деталей, меньше вес', Layers],
  ['compress', 'Только сжать', 'Сохранить размеры', Minimize2],
] as const

export function Inspector({ options, setOptions, engine, asset, busy, outputDirectory, chooseDirectory }: Props) {
  const update = (patch: Partial<Options>) => setOptions({ ...options, ...patch })
  const upscale = options.mode !== 'compress'
  const compression = options.mode !== 'upscale'
  const lossless = options.format !== 'jpeg' && options.lossless
  const selectedModel = engine.models.find(model => model.id === options.model)
  const availableModels = engine.models.filter(model => model.available).length
  const engineLabel = engine.available ? `AI · моделей: ${availableModels}` : 'AI недоступен'

  return <aside className="inspector" aria-label="Настройки обработки">
    <div className="panel-heading inspector-heading">
      <h2>Обработка</h2>
      <details className="engine-chip">
        <summary aria-label={`${engineLabel}. Состояние AI-движка и моделей`}>
          <Cpu size={13} aria-hidden="true"/>
          <span role="status">{engineLabel}</span>
          <ChevronDown size={12} aria-hidden="true"/>
        </summary>
        <div className="engine-detail">
          <strong>{engine.name}</strong>
          <p>{engine.message}</p>
          {!engine.available && <p>Увеличение Lanczos и Nearest, а также сжатие доступны.</p>}
          {engine.models.length > 0 && <ul>{engine.models.map(model => <li key={model.id}>
            <span>{model.displayName}</span><small>{model.available ? 'Установлена' : 'Недоступна'}</small>
          </li>)}</ul>}
        </div>
      </details>
    </div>

    <div className="inspector-scroll">
      <fieldset disabled={busy} className="mode-field">
        <legend>Что сделать с изображением</legend>
        <div className="mode-options" data-mode={options.mode}>
          <span className="mode-lens" aria-hidden="true"/>
          {processingModes.map(([value, label, help, Icon]) => <label className={`mode-option ${options.mode === value ? 'selected' : ''}`} key={value}>
            <Icon size={16} aria-hidden="true"/>
            <span><strong>{label}</strong><small>{help}</small></span>
            <input type="radio" name="mode" value={value} checked={options.mode === value} onChange={() => update({ mode: value })}/>
          </label>)}
        </div>
      </fieldset>

      {upscale && <section className="settings-section" aria-labelledby="upscale-heading">
        <h3 id="upscale-heading"><span className="step" aria-label="Этап 1">01</span>Увеличение</h3>
        <fieldset disabled={busy}>
          <legend>Масштаб</legend>
          <div className="segments">{[2, 3, 4].map(scale => <button type="button" aria-pressed={options.scale === scale} key={scale} onClick={() => update({ scale })}>{scale}×</button>)}</div>
        </fieldset>
        <label className="field">Метод
          <select disabled={busy} value={options.method} onChange={e => update({ method: e.target.value as Options['method'] })}>
            <option value="ai" disabled={!engine.available}>AI · Улучшение деталей</option>
            <option value="lanczos">Обычное · Lanczos</option>
            <option value="nearest">Пиксель-арт · Nearest</option>
          </select>
        </label>
        {options.method === 'ai' && <>
          <label className="field">Желаемый результат
            <select disabled={busy} value={options.model} aria-describedby="model-help" onChange={e => update({ model: e.target.value as Options['model'] })}>
              {engine.models.map(model => <option key={model.id} value={model.id}>{model.displayName}{model.available ? '' : ' · недоступно'}</option>)}
            </select>
          </label>
          <p className="field-help" id="model-help">{selectedModel?.available ? selectedModel.qualityProfile : selectedModel?.message || engine.message}</p>
          <details className="advanced">
            <summary>О модели<ChevronDown size={13} aria-hidden="true"/></summary>
            <p className="field-help">{selectedModel?.name}<br/>{selectedModel?.nativeScales.length === 1 ? 'Обработка 4×; для 2×/3× — качественное уменьшение. Исходник до 6,25 Мп.' : 'Нативная обработка 2×, 3× и 4×.'}<br/>Прозрачность масштабируется отдельно. {selectedModel?.available && 'Vulkan проверяется при обработке.'}</p>
          </details>
        </>}
        {options.method !== 'ai' && <p className="field-help">{options.method === 'nearest' ? 'Сохраняет жёсткую пиксельную сетку, без сглаживания.' : 'Увеличивает со сглаживанием, без нейросетевой дорисовки.'}</p>}
        {asset && <div className="dimension-plan" aria-label="Размеры до и после увеличения">
          <span>{asset.width} × {asset.height}</span><ArrowRight size={13} aria-hidden="true"/><strong>{asset.width * options.scale} × {asset.height * options.scale}</strong>
        </div>}
      </section>}

      {compression && <section className="settings-section" aria-labelledby="compression-heading">
        <h3 id="compression-heading"><span className="step" aria-label={`Этап ${upscale ? 2 : 1}`}>{upscale ? '02' : '01'}</span>Сжатие</h3>
        <fieldset disabled={busy}>
          <legend>Формат</legend>
          <div className="format-row">{(['webp', 'png', 'jpeg', 'avif'] as const).map(format => <button type="button" aria-pressed={options.format === format} key={format} onClick={() => update({ format, lossless: format === 'jpeg' ? false : options.lossless })}>{format === 'jpeg' ? 'JPG' : format.toUpperCase()}</button>)}</div>
        </fieldset>
        {['png', 'webp', 'avif'].includes(options.format) && <label className="check-row">
          <input disabled={busy} type="checkbox" checked={options.lossless} onChange={e => update({ lossless: e.target.checked })}/><span>Без потерь</span>
        </label>}
        <label className="field range-field">
          <span>Качество <strong>{lossless ? 'Без потерь' : options.quality}</strong></span>
          <input disabled={busy || lossless} aria-label="Качество сжатия" type="range" min="1" max="100" value={options.quality} onChange={e => update({ quality: Number(e.target.value) })}/>
          <span className="range-captions"><small>Меньше файл</small><small>Больше деталей</small></span>
        </label>
        {options.format === 'png' && <p className="field-help">{lossless ? 'PNG без потерь: цвета сохраняются точно. Вес может совпадать с режимом «Увеличить».' : 'PNG: уменьшение палитры до 256 цветов с поддержкой прозрачности. Меньше вес, возможны изменения оттенков даже при качестве 100.'}</p>}
        {options.format === 'jpeg' && <label className="field">Подложка вместо прозрачности
          <div className="color-input"><input disabled={busy} type="color" aria-label="Цвет подложки JPEG" value={options.background} onChange={e => update({ background: e.target.value })}/><code>{options.background.toUpperCase()}</code></div>
        </label>}
        <details className="advanced">
          <summary>Ограничить вес файла{options.targetKB > 0 && <span className="target-value">{options.targetKB} КБ</span>}<ChevronDown size={13} aria-hidden="true"/></summary>
          <label className="field">Максимум, КБ
            <input disabled={busy} aria-describedby="target-help" type="number" min="0" max="200000" step="1" value={options.targetKB} onChange={e => update({ targetKB: Math.max(0, Math.min(200000, Math.round(Number(e.target.value)))) })}/>
          </label>
          <p className="field-help" id="target-help">{lossless ? '0 — без лимита. Без потерь качество не снижается: лимит только проверяется.' : '0 — без лимита. Подбирается качество без уменьшения размеров. Лимит может оказаться недостижимым.'}</p>
        </details>
      </section>}

      {!compression && <p className="inline-note"><Info size={14} aria-hidden="true"/>Результат сохраняется в PNG без потерь. Сжатие можно включить вторым этапом.</p>}

      <details className="save-details">
        <summary><FolderOpen size={15} aria-hidden="true"/><span>Сохранение</span><small>{outputDirectory ? 'Папка выбрана' : 'Выбрать папку'}</small><ChevronDown size={13} aria-hidden="true"/></summary>
        <button type="button" className="directory-button" onClick={chooseDirectory} disabled={busy} title={outputDirectory || undefined}>
          <FolderOpen size={16} aria-hidden="true"/><span>{outputDirectory || 'Выбрать папку'}<small>Исходники останутся на месте</small></span>
        </button>
        <p className="field-help">Выход: sRGB, 8 бит на канал. Метаданные EXIF удаляются. «Без потерь» относится к подготовленным пикселям.</p>
      </details>
    </div>
  </aside>
}
