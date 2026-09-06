import { ArrowUpRight, ArrowRight, Minimize2, FolderOpen, Layers, Cpu, Info } from 'lucide-react'
import type { Options, Engine, Asset } from '../types'
interface Props { options: Options; setOptions: (options: Options) => void; engine: Engine; asset?: Asset; busy: boolean; outputDirectory: string | null; chooseDirectory: () => void }
export function Inspector({ options, setOptions, engine, asset, busy, outputDirectory, chooseDirectory }: Props) {
  const update = (patch: Partial<Options>) => setOptions({ ...options, ...patch })
  const upscale = options.mode !== 'compress', compression = options.mode !== 'upscale'
  const lossless = options.format !== 'jpeg' && options.lossless
  return <aside className="inspector" aria-label="Настройки обработки">
    <div className="panel-heading"><h2>Обработка</h2><span className="eyebrow">01 — 02</span></div>
    <div className="inspector-scroll">
      <fieldset disabled={busy} className="mode-field"><legend>Что сделать с изображением</legend>
        {([
          ['upscale', 'Увеличить', 'Больше разрешение', ArrowUpRight],
          ['chain', 'Увеличить и сжать', 'Детали и оптимальный вес', Layers],
          ['compress', 'Только сжать', 'Размеры останутся прежними', Minimize2],
        ] as const).map(([value, label, help, Icon]) => <label className={`mode-option ${options.mode === value ? 'selected' : ''}`} key={value}>
          <input type="radio" name="mode" value={value} checked={options.mode === value} onChange={() => update({ mode: value })}/><Icon size={18}/><span><strong>{label}</strong><small>{help}</small></span><span className="radio-dot"/>
        </label>)}
      </fieldset>
      {upscale && <section className="settings-section"><h3><span className="step">01</span>Увеличение</h3>
        <fieldset disabled={busy}><legend>Масштаб</legend><div className="segments">{[2, 3, 4].map(scale => <button type="button" aria-pressed={options.scale === scale} key={scale} onClick={() => update({ scale })}>{scale}×</button>)}</div></fieldset>
        <label className="field">Метод<select disabled={busy} value={options.method} onChange={e => update({ method: e.target.value as Options['method'] })}>
          <option value="ai" disabled={!engine.available}>AI · Real-ESRGAN</option><option value="lanczos">Обычное · Lanczos</option><option value="nearest">Пиксель-арт · Nearest</option>
        </select></label>
        {options.method === 'ai' && <label className="field">Тип изображения<select disabled={busy} value={options.model} onChange={e => update({model: e.target.value as Options['model']})}><option value="illustration">Иллюстрации · быстро</option><option value="photo">Фотографии · детально</option></select></label>}
        <p className="field-help">{options.method === 'ai' ? (options.model === 'photo' ? 'Модель x4plus для фотографий. Промежуточный масштаб 4×, исходник до 6,25 Мп.' : 'Лёгкая модель для иллюстраций. Детали могут измениться — сравните результат.') : options.method === 'nearest' ? 'Сохраняет жёсткую пиксельную сетку, без сглаживания.' : 'Увеличивает со сглаживанием, без нейросетевой дорисовки.'}</p>
        {asset && <div className="dimension-plan"><span>{asset.width} × {asset.height}</span><ArrowRight size={14}/><strong>{asset.width * options.scale} × {asset.height * options.scale}</strong></div>}
      </section>}
      {compression && <section className="settings-section"><h3><span className="step">{upscale ? '02' : '01'}</span>Сжатие</h3>
        <label className="field">Формат<div className="format-row">{(['webp', 'png', 'jpeg', 'avif'] as const).map(format => <button type="button" disabled={busy} aria-pressed={options.format === format} key={format} onClick={() => update({ format, lossless: format === 'jpeg' ? false : options.lossless })}>{format === 'jpeg' ? 'JPG' : format.toUpperCase()}</button>)}</div></label>
        {['png', 'webp', 'avif'].includes(options.format) && <label className="check-row"><input disabled={busy} type="checkbox" checked={options.lossless} onChange={e => update({ lossless: e.target.checked })}/><span>Без потерь</span></label>}
        <label className="field range-field"><span>Качество <strong>{lossless ? 'Без потерь' : options.quality}</strong></span><input disabled={busy || lossless} aria-label="Качество сжатия" type="range" min="1" max="100" value={options.quality} onChange={e => update({ quality: Number(e.target.value) })}/><span className="range-captions"><small>Меньше файл</small><small>Больше деталей</small></span></label>
        {options.format === 'png' && <p className="field-help">{lossless ? 'PNG без потерь: цвета сохраняются точно. Вес может совпадать с режимом «Увеличить».' : 'PNG: уменьшение палитры до 256 цветов с поддержкой прозрачности. Меньше вес, возможны изменения оттенков даже при качестве 100.'}</p>}
        {options.format === 'jpeg' && <label className="field">Подложка вместо прозрачности<div className="color-input"><input disabled={busy} type="color" aria-label="Цвет подложки JPEG" value={options.background} onChange={e => update({ background: e.target.value })}/><code>{options.background.toUpperCase()}</code></div></label>}
        <details className="advanced"><summary>Ограничить вес файла</summary><label className="field">Максимум, КБ<input disabled={busy} type="number" min="0" max="200000" step="1" value={options.targetKB} onChange={e => update({ targetKB: Math.max(0, Math.min(200000, Math.round(Number(e.target.value)))) })}/></label><p className="field-help">{lossless ? '0 — без лимита. Без потерь качество не снижается: лимит только проверяется.' : '0 — без лимита. Подбирается качество без уменьшения размеров. Лимит может оказаться недостижимым.'}</p></details>
      </section>}
      {!compression && <p className="inline-note"><Info size={15}/>Результат сохраняется в PNG без потерь. Сжатие можно включить вторым этапом.</p>}
      <section className="settings-section export-section"><h3>Сохранение</h3><button className="directory-button" onClick={chooseDirectory} disabled={busy}><FolderOpen size={18}/><span>{outputDirectory || 'Выбрать папку'}<small>Исходники останутся на месте</small></span></button><p className="field-help">Выход: sRGB, 8 бит на канал. Метаданные EXIF удаляются. «Без потерь» относится к подготовленным пикселям.</p></section>
    </div>
    <div className="engine-status"><Cpu size={15}/><span>{engine.available ? 'AI-движок готов' : 'Обычное увеличение доступно'}</span><span className={`status-dot ${engine.available ? 'ready' : ''}`}/></div>
  </aside>
}
