import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ImagePlus, Scan, ZoomIn, ZoomOut, Move, SplitSquareHorizontal } from 'lucide-react'
import { formatBytes, useI18n } from '../i18n'
import type { Asset, Job } from '../types'

interface Props { asset?: Asset; job?: Job; importFiles: () => void; importing: boolean; desktop: boolean }
type Background = 'checker' | 'white' | 'black' | 'sand'

export function Preview({ asset, job, importFiles, importing, desktop }: Props) {
  const { language, t } = useI18n()
  const [view, setView] = useState<'original' | 'split' | 'result'>('split')
  const [position, setPosition] = useState(50)
  const [zoom, setZoom] = useState<number | null>(null)
  const [background, setBackground] = useState<Background>('checker')
  const [area, setArea] = useState({ width: 800, height: 500 })
  const viewport = useRef<HTMLDivElement>(null)
  const comparison = useRef<HTMLDivElement>(null)
  const zoomAnchor = useRef<{ x: number; y: number; u: number; v: number } | null>(null)
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
  const minZoom = Math.min(0.05, Math.max(0.01, fit))
  const changeZoom = (direction: number) => setZoom(Math.max(minZoom, Math.min(4, factor * (direction > 0 ? 1.5 : 1 / 1.5))))
  useEffect(() => {
    const element = viewport.current
    if (!element) return
    const wheel = (event: WheelEvent) => {
      if (!event.deltaY || !comparison.current) return
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
  const backgrounds = [['checker', t('preview.backgroundChecker')], ['white', t('preview.backgroundWhite')], ['black', t('preview.backgroundBlack')], ['sand', t('preview.backgroundSand')]]
  const displayFormat = (format: string) => format.toLowerCase() === 'jpeg' ? 'JPG' : format.toUpperCase()
  return <main className="preview-panel">
    <div className="preview-toolbar"><div className="view-switch" aria-label={t('preview.viewAria')}>{([['original', t('preview.original')], ['split', t('preview.compare')], ['result', t('preview.result')]] as const).map(([value, label]) => <button key={value} disabled={!asset || (value !== 'original' && !result)} aria-pressed={(result ? view : 'original') === value} onClick={() => setView(value)}>{value === 'split' && <SplitSquareHorizontal size={14}/>} {label}</button>)}</div>
      <label className="background-control"><span className={`background-chip swatch-${background}`} aria-hidden="true"/><select aria-label={t('preview.backgroundAria')} value={background} onChange={event => setBackground(event.target.value as Background)}>{backgrounds.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>
    {!asset ? <div className="empty-workspace"><div className="empty-art" aria-hidden="true"><span className="frame-back"/><span className="frame-front"><Scan size={52} strokeWidth={1}/></span><span className="corner c1"/><span className="corner c2"/></div><p className="eyebrow">{t('preview.eyebrow')}</p><h1>{t('preview.hero')}</h1><p className="empty-copy">{t('preview.heroCopy')}</p><button className="button primary" disabled={importing || !desktop} onClick={importFiles}><ImagePlus size={18}/>{importing ? t('preview.reading') : t('preview.addImages')}</button><span className="empty-formats">PNG · JPG · WEBP · AVIF <span>{t('preview.upTo')}</span></span>{!desktop && <p className="browser-note">{t('preview.browserNote')}</p>}</div> : <>
      <div ref={viewport} className={`viewport bg-${background}`} onPointerDown={e => { if (e.target instanceof HTMLInputElement && !e.shiftKey) return; e.preventDefault(); drag.current = { x: e.clientX, y: e.clientY, left: e.currentTarget.scrollLeft, top: e.currentTarget.scrollTop }; e.currentTarget.setPointerCapture(e.pointerId) }} onPointerMove={e => { if (!drag.current) return; e.currentTarget.scrollLeft = drag.current.left - (e.clientX - drag.current.x); e.currentTarget.scrollTop = drag.current.top - (e.clientY - drag.current.y) }} onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
        <div className="image-space" style={{ minWidth: width * factor + 64, minHeight: height * factor + 64 }}><div ref={comparison} className="image-comparison" style={{ width: width * factor, height: height * factor }}>
          <img draggable={false} src={result && view === 'result' ? result.url : asset.url} alt={view === 'result' && result ? t('preview.processedAlt') : t('preview.sourceAlt')}/>
          {result && view === 'split' && <><img draggable={false} className="comparison-result" style={{ clipPath: `inset(0 0 0 ${position}%)` }} src={result.url} alt={t('preview.splitAlt')}/><div className="comparison-line" style={{ left: `${position}%` }}><span>↔</span></div><input className="comparison-range" aria-label={t('preview.splitAria')} type="range" min="0" max="100" value={position} onChange={e => setPosition(Number(e.target.value))}/></>}
        </div></div>
      </div>
      <div className="preview-meta"><span><Move size={13}/>{t('preview.gestureHelp')}</span><div><button className="icon-button" aria-label={t('preview.zoomOut')} onClick={() => changeZoom(-1)}><ZoomOut size={16}/></button><button onClick={() => setZoom(null)} className="zoom-value">{zoom === null ? t('preview.fit') : `${Math.round(zoom * 100)}%`}</button><button className="icon-button" aria-label={t('preview.zoomIn')} onClick={() => changeZoom(1)}><ZoomIn size={16}/></button><button onClick={() => setZoom(1)} className="zoom-value">1:1</button></div></div>
      <div className="result-bar"><div><span className="eyebrow">{t('preview.originalLabel')}</span><strong>{asset.width} × {asset.height}<small>{formatBytes(asset.bytes, language)} · {displayFormat(asset.format)}</small></strong></div><span className="result-arrow">→</span><div><span className="eyebrow">{result ? t('preview.resultLabel') : t('preview.afterLabel')}</span><strong>{result ? `${result.width} × ${result.height}` : t('preview.ready')}<small>{result ? `${formatBytes(result.bytes, language)} · ${displayFormat(result.format)}` : t('preview.chooseSettings')}</small></strong></div>{result && <div className={`size-delta ${result.bytes < asset.bytes ? 'saving' : ''}`}><strong>{result.bytes < asset.bytes ? '−' : '+'}{Math.abs((result.bytes / asset.bytes - 1) * 100).toFixed(0)}%</strong><small>{t('preview.sizeDelta')}</small></div>}</div>
    </>}
  </main>
}
