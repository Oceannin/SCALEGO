import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeftRight, ArrowRight, ImagePlus, Scan, ZoomIn, ZoomOut, Move, SplitSquareHorizontal } from 'lucide-react'
import type { Asset, Job } from '../types'
import { bytes } from '../types'
import '../styles/preview.css'

interface Props { asset?: Asset; job?: Job; importFiles: () => void; importing: boolean; desktop: boolean }
const views = [['original', 'Оригинал'], ['split', 'Сравнить'], ['result', 'Результат']] as const
const backgrounds = [['checker', 'Прозрачность'], ['white', 'Белая'], ['black', 'Чёрная'], ['sand', 'Песочная']] as const
const canvasGutter = 40

export function Preview({ asset, job, importFiles, importing, desktop }: Props) {
  const [view, setView] = useState<'original' | 'split' | 'result'>('split')
  const [position, setPosition] = useState(50)
  const [zoom, setZoom] = useState<number | null>(null)
  const [background, setBackground] = useState('checker')
  const [area, setArea] = useState({ width: 800, height: 500 })
  const [panning, setPanning] = useState(false)
  const viewport = useRef<HTMLDivElement>(null)
  const comparison = useRef<HTMLDivElement>(null)
  const zoomAnchor = useRef<{ x: number; y: number; u: number; v: number } | null>(null)
  const drag = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null)
  const result = job?.result
  const activeView = result ? view : 'original'

  useEffect(() => {
    setZoom(null)
    setPosition(50)
    setPanning(false)
    drag.current = null
    viewport.current?.scrollTo(0, 0)
  }, [asset?.id])
  useEffect(() => {
    if (!viewport.current) return
    const observer = new ResizeObserver(([entry]) => setArea({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(viewport.current)
    return () => observer.disconnect()
  }, [asset?.id])

  const width = result?.width || asset?.width || 1, height = result?.height || asset?.height || 1
  const fit = Math.min((area.width - canvasGutter) / width, (area.height - canvasGutter) / height, 1)
  const factor = zoom ?? Math.max(0.01, fit)
  const minZoom = Math.min(0.05, Math.max(0.01, fit))
  const changeZoom = (direction: number) => setZoom(Math.max(minZoom, Math.min(4, factor * (direction > 0 ? 1.5 : 1 / 1.5))))
  const stopPanning = () => { drag.current = null; setPanning(false) }

  useEffect(() => {
    const element = viewport.current
    if (!element) return
    const wheel = (event: WheelEvent) => {
      if (!event.deltaY || !comparison.current) return
      // React delegates wheel events passively; a local listener keeps zoom
      // anchored to the image under the cursor without scrolling the app.
      event.preventDefault()
      const rect = comparison.current.getBoundingClientRect()
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1)
      const multiplier = Math.exp(-Math.max(-300, Math.min(300, delta)) * 0.002)
      if (Math.max(minZoom, Math.min(4, factor * multiplier)) === factor) { zoomAnchor.current = null; return }
      zoomAnchor.current = { x: event.clientX, y: event.clientY, u: (event.clientX - rect.left) / rect.width, v: (event.clientY - rect.top) / rect.height }
      setZoom(current => Math.max(minZoom, Math.min(4, (current ?? factor) * multiplier)))
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => { element.removeEventListener('wheel', wheel); zoomAnchor.current = null }
  }, [asset?.id, factor, minZoom])
  useLayoutEffect(() => {
    const anchor = zoomAnchor.current, element = viewport.current, image = comparison.current
    zoomAnchor.current = null
    if (!anchor || !element || !image) return
    const rect = image.getBoundingClientRect()
    element.scrollLeft += rect.left + anchor.u * rect.width - anchor.x
    element.scrollTop += rect.top + anchor.v * rect.height - anchor.y
  }, [factor])

  return <main className="preview-panel" aria-label="Предпросмотр изображения">
    {!asset ? <div className="empty-workspace">
      <div className="empty-art" aria-hidden="true">
        <span className="frame-back"/><span className="frame-front"><Scan size={48} strokeWidth={1}/></span>
        <span className="corner c1"/><span className="corner c2"/>
      </div>
      <p className="eyebrow">БОЛЬШЕ ДЕТАЛЕЙ. МЕНЬШЕ ВЕС.</p>
      <h1>Дайте изображению<br/>больше возможностей.</h1>
      <p className="empty-copy">Увеличивайте, сжимайте или объединяйте оба этапа.<br/>Всё на вашем компьютере.</p>
      <button className="button primary" disabled={importing || !desktop} onClick={importFiles}>
        <ImagePlus size={18}/>{importing ? 'Чтение файлов…' : 'Добавить изображения'}
      </button>
      <span className="empty-formats">PNG · JPG · WEBP · AVIF <span>до 40 Мп</span></span>
      {!desktop && <p className="browser-note">Предпросмотр интерфейса. Работа с файлами доступна в desktop-приложении.</p>}
    </div> : <>
      <div className="preview-stage">
        <div className="preview-toolbar">
          <div className="view-switch" role="group" aria-label="Режим просмотра">
            {views.map(([value, label]) => <button key={value} disabled={value !== 'original' && !result} aria-pressed={activeView === value} onClick={() => setView(value)}>
              {value === 'split' && <SplitSquareHorizontal size={13}/>}<span>{label}</span>
            </button>)}
          </div>
          <div className="background-switch" role="group" aria-label="Подложка">
            {backgrounds.map(([value, label]) => <button key={value} className={`swatch swatch-${value}`} title={`${label} подложка`} aria-label={`${label} подложка`} aria-pressed={background === value} onClick={() => setBackground(value)}/>)}
          </div>
        </div>
        <div ref={viewport} className={`viewport bg-${background}${panning ? ' is-panning' : ''}`} aria-label="Изображение. Колёсико — масштаб; перетаскивание — перемещение."
          onPointerDown={event => {
            // Only the native comparison thumb receives input events. The rest
            // of the image is available for direct panning, without a modifier.
            if (event.button !== 0 || event.target instanceof HTMLInputElement) return
            event.preventDefault()
            drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop }
            setPanning(true)
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={event => {
            if (!drag.current || drag.current.pointerId !== event.pointerId) return
            event.currentTarget.scrollLeft = drag.current.left - (event.clientX - drag.current.x)
            event.currentTarget.scrollTop = drag.current.top - (event.clientY - drag.current.y)
          }}
          onPointerUp={event => {
            if (drag.current?.pointerId !== event.pointerId) return
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
            stopPanning()
          }}
          onPointerCancel={stopPanning} onLostPointerCapture={stopPanning}>
          <div className="image-space" style={{ minWidth: width * factor + canvasGutter, minHeight: height * factor + canvasGutter }}>
            <div ref={comparison} className="image-comparison" style={{ width: width * factor, height: height * factor }}>
              <img draggable={false} src={activeView === 'result' && result ? result.url : asset.url} alt={activeView === 'result' ? 'Обработанное изображение' : 'Исходное изображение'}/>
              {result && activeView === 'split' && <>
                <img draggable={false} className="comparison-result" style={{ clipPath: `inset(0 0 0 ${position}%)` }} src={result.url} alt="Результат справа от разделителя"/>
                <div className="comparison-line" style={{ left: `${position}%` }} aria-hidden="true"><span><ArrowLeftRight size={17}/></span></div>
                <input className="comparison-range" aria-label="Положение разделителя сравнения" aria-valuetext={`${position}% оригинала, ${100 - position}% результата`} type="range" min="0" max="100" value={position} onChange={event => setPosition(Number(event.target.value))}/>
              </>}
            </div>
          </div>
        </div>
        <div className="preview-bottom">
          <span className="pan-hint" title="Колёсико — масштаб. Перетаскивание — перемещение. В режиме сравнения тяните ручку разделителя."><Move size={13}/><span>Тяните для перемещения</span></span>
          <div className="zoom-dock" role="group" aria-label="Масштаб изображения">
            <button className="icon-button" title="Уменьшить масштаб" aria-label="Уменьшить масштаб" disabled={factor <= minZoom} onClick={() => changeZoom(-1)}><ZoomOut size={15}/></button>
            <button onClick={() => setZoom(null)} className="zoom-value" title="Вписать изображение в область просмотра" aria-label={`Вписать изображение. Текущий масштаб ${Math.round(factor * 100)}%`} aria-pressed={zoom === null}>{zoom === null ? 'Вписать' : `${Math.round(zoom * 100)}%`}</button>
            <button className="icon-button" title="Увеличить масштаб" aria-label="Увеличить масштаб" disabled={factor >= 4} onClick={() => changeZoom(1)}><ZoomIn size={15}/></button>
            <span className="zoom-divider"/>
            <button onClick={() => setZoom(1)} className="zoom-value zoom-actual" title="Показать пиксель в пиксель" aria-label="Масштаб один к одному" aria-pressed={zoom === 1}>1:1</button>
          </div>
        </div>
      </div>
      <div className="result-bar" aria-label="Параметры оригинала и результата">
        <div className="result-metric"><span className="eyebrow">ОРИГИНАЛ</span><strong>{asset.width} × {asset.height}</strong><small>{bytes(asset.bytes)}</small></div>
        <ArrowRight className="result-arrow" size={14} aria-hidden="true"/>
        <div className="result-metric"><span className="eyebrow">{result ? 'РЕЗУЛЬТАТ' : 'ПОСЛЕ ОБРАБОТКИ'}</span><strong>{result ? `${result.width} × ${result.height}` : job?.status === 'running' ? 'Обработка…' : 'Готов к запуску'}</strong><small>{result ? `${bytes(result.bytes)} · ${result.format.toUpperCase()}` : 'Параметры справа'}</small></div>
        {result && <div className={`size-delta ${result.bytes < asset.bytes ? 'saving' : ''}`} title="Изменение размера файла относительно оригинала"><strong>{result.bytes < asset.bytes ? '−' : '+'}{Math.abs((result.bytes / asset.bytes - 1) * 100).toFixed(0)}%</strong><small>размер файла</small></div>}
      </div>
    </>}
  </main>
}
