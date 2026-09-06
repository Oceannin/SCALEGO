import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Scan, ZoomIn, ZoomOut, Move, SplitSquareHorizontal } from 'lucide-react'
import type { Asset, Job } from '../types'
import { bytes } from '../types'
interface Props { asset?: Asset; job?: Job; importFiles: () => void; importing: boolean; desktop: boolean }
export function Preview({ asset, job, importFiles, importing, desktop }: Props) {
  const [view, setView] = useState<'original' | 'split' | 'result'>('split')
  const [position, setPosition] = useState(50)
  const [zoom, setZoom] = useState<number | null>(null)
  const [background, setBackground] = useState('checker')
  const [area, setArea] = useState({ width: 800, height: 500 })
  const viewport = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const result = job?.result
  useEffect(() => { setZoom(null); setPosition(50) }, [asset?.id])
  useEffect(() => {
    if (!viewport.current) return
    const observer = new ResizeObserver(([entry]) => setArea({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(viewport.current); return () => observer.disconnect()
  }, [asset?.id])
  const width = result?.width || asset?.width || 1, height = result?.height || asset?.height || 1
  const fit = Math.min((area.width - 64) / width, (area.height - 64) / height, 1)
  const factor = zoom ?? Math.max(0.01, fit)
  const changeZoom = (direction: number) => setZoom(Math.max(0.05, Math.min(4, factor * (direction > 0 ? 1.5 : 1 / 1.5))))
  return <main className="preview-panel">
    <div className="preview-toolbar"><div className="view-switch" aria-label="Режим просмотра">{([['original', 'Оригинал'], ['split', 'Сравнить'], ['result', 'Результат']] as const).map(([value, label]) => <button key={value} disabled={!asset || (value !== 'original' && !result)} aria-pressed={(result ? view : 'original') === value} onClick={() => setView(value)}>{value === 'split' && <SplitSquareHorizontal size={14}/>} {label}</button>)}</div>
      <div className="background-switch" aria-label="Подложка">{[['checker', 'Прозрачность'], ['white', 'Белая'], ['black', 'Чёрная'], ['sand', 'Песочная']].map(([value, label]) => <button key={value} className={`swatch swatch-${value}`} aria-label={`${label} подложка`} aria-pressed={background === value} onClick={() => setBackground(value)}/>)}</div>
    </div>
    {!asset ? <div className="empty-workspace"><div className="empty-art" aria-hidden="true"><span className="frame-back"/><span className="frame-front"><Scan size={52} strokeWidth={1}/></span><span className="corner c1"/><span className="corner c2"/></div><p className="eyebrow">БОЛЬШЕ ДЕТАЛЕЙ. МЕНЬШЕ ВЕС.</p><h1>Дайте изображению<br/>больше возможностей.</h1><p className="empty-copy">Увеличивайте, сжимайте или объединяйте<br/>оба этапа. Всё на вашем компьютере.</p><button className="button primary" disabled={importing || !desktop} onClick={importFiles}><ImagePlus size={18}/>{importing ? 'Чтение файлов…' : 'Добавить изображения'}</button><span className="empty-formats">PNG · JPG · WEBP · AVIF <span>до 40 Мп</span></span>{!desktop && <p className="browser-note">Предпросмотр интерфейса. Работа с файлами доступна в desktop-приложении.</p>}</div> : <>
      <div ref={viewport} className={`viewport bg-${background}`} onPointerDown={e => { if (e.target instanceof HTMLInputElement && !e.shiftKey) return; e.preventDefault(); drag.current = { x: e.clientX, y: e.clientY, left: e.currentTarget.scrollLeft, top: e.currentTarget.scrollTop }; e.currentTarget.setPointerCapture(e.pointerId) }} onPointerMove={e => { if (!drag.current) return; e.currentTarget.scrollLeft = drag.current.left - (e.clientX - drag.current.x); e.currentTarget.scrollTop = drag.current.top - (e.clientY - drag.current.y) }} onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
        <div className="image-space" style={{ minWidth: width * factor + 64, minHeight: height * factor + 64 }}><div className="image-comparison" style={{ width: width * factor, height: height * factor }}>
          <img draggable={false} src={result && view === 'result' ? result.url : asset.url} alt={view === 'result' && result ? 'Обработанное изображение' : 'Исходное изображение'}/>
          {result && view === 'split' && <><img draggable={false} className="comparison-result" style={{ clipPath: `inset(0 0 0 ${position}%)` }} src={result.url} alt="Результат справа от разделителя"/><div className="comparison-line" style={{ left: `${position}%` }}><span>↔</span></div><input className="comparison-range" aria-label="Положение разделителя сравнения" type="range" min="0" max="100" value={position} onChange={e => setPosition(Number(e.target.value))}/></>}
        </div></div>
      </div>
      <div className="preview-meta"><span><Move size={13}/>Shift + перетаскивание — перемещение</span><div><button className="icon-button" aria-label="Уменьшить масштаб" onClick={() => changeZoom(-1)}><ZoomOut size={16}/></button><button onClick={() => setZoom(null)} className="zoom-value">{zoom === null ? 'Вписать' : `${Math.round(zoom * 100)}%`}</button><button className="icon-button" aria-label="Увеличить масштаб" onClick={() => changeZoom(1)}><ZoomIn size={16}/></button><button onClick={() => setZoom(1)} className="zoom-value">1:1</button></div></div>
      <div className="result-bar"><div><span className="eyebrow">ОРИГИНАЛ</span><strong>{asset.width} × {asset.height}<small>{bytes(asset.bytes)}</small></strong></div><span className="result-arrow">→</span><div><span className="eyebrow">{result ? 'РЕЗУЛЬТАТ' : 'ПОСЛЕ ОБРАБОТКИ'}</span><strong>{result ? `${result.width} × ${result.height}` : 'Готов к запуску'}<small>{result ? `${bytes(result.bytes)} · ${result.format.toUpperCase()}` : 'Выберите параметры справа'}</small></strong></div>{result && <div className={`size-delta ${result.bytes < asset.bytes ? 'saving' : ''}`}><strong>{result.bytes < asset.bytes ? '−' : '+'}{Math.abs((result.bytes / asset.bytes - 1) * 100).toFixed(0)}%</strong><small>к исходному весу</small></div>}</div>
    </>}
  </main>
}
