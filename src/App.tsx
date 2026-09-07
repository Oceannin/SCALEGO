import { useEffect, useRef, useState } from 'react'
import { Plus, Sun, Moon, FolderOpen, ArrowUpRight, X, Check, LoaderCircle, Play, Square, Download, AlertCircle, Image, ChevronRight } from 'lucide-react'
import { Inspector } from './components/Inspector'
import { Preview } from './components/Preview'
import { defaultOptions, bytes } from './types'
import type { Snapshot, Engine, Options } from './types'
const empty: Snapshot = { assets: [], jobs: [], busy: false, outputDirectory: null }
export default function App() {
  const [state, setState] = useState<Snapshot>(empty)
  const [engine, setEngine] = useState<Engine>({ available: false, name: 'Локальный AI', message: 'Проверка движков…', models: [] })
  const [options, setOptions] = useState<Options>(defaultOptions)
  const [selected, setSelected] = useState<string[]>([])
  const [active, setActive] = useState<string>()
  const [notice, setNotice] = useState<{ text: string; error: boolean }>()
  const [importing, setImporting] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem('scalego-theme') || 'dark')
  const [dragging, setDragging] = useState(false)
  const knownAssets = useRef(new Set<string>())
  const [saving, setSaving] = useState(false)
  const desktop = Boolean(window.scalego)
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('scalego-theme', theme) }, [theme])
  useEffect(() => {
    const bridge = window.scalego
    if (!bridge) return
    const update = (next: Snapshot) => { setState(next); setActive(old => next.assets.some(a => a.id === old) ? old : next.assets[0]?.id); const added = next.assets.filter(a => !knownAssets.current.has(a.id)).map(a => a.id); knownAssets.current = new Set(next.assets.map(a => a.id)); setSelected(old => [...new Set([...old.filter(id => next.assets.some(a => a.id === id)), ...added])]) }
    let live = true
    const unsubscribe = bridge.onState(next => { if (live) update(next) })
    bridge.state().then(next => { if (live) update(next) }).catch(error => setNotice({ text: error.message, error: true }))
    bridge.engine().then(value => { if (live) { setEngine(value); setOptions(current => value.models.some(model => model.id === current.model && model.available) ? current : value.available ? { ...current, model: value.models.find(model => model.available)!.id } : { ...current, method: 'lanczos' }) } }).catch(error => setNotice({ text: error.message, error: true }))
    return () => { live = false; unsubscribe() }
  }, [])
  const action = async (task: () => Promise<unknown>) => { try { await task() } catch (error) { setNotice({ text: error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : 'Не удалось выполнить действие.', error: true }) } }
  const importFiles = () => action(async () => { setImporting(true); try { const result = await window.scalego!.import(); if (result.errors.length) setNotice({ text: result.errors.join('\n'), error: true }) } finally { setImporting(false) } })
  const asset = state.assets.find(a => a.id === active)
  const assetJobs = state.jobs.filter(j => j.assetId === active)
  const job = [...assetJobs].reverse().find(j => j.result) || assetJobs.at(-1)
  const running = state.jobs.find(j => j.status === 'running')
  const done = state.jobs.filter(j => j.status === 'done')
  const latest = assetJobs.at(-1)
  const modelUnavailable = options.mode !== 'compress' && options.method === 'ai' && !engine.models.some(model => model.id === options.model && model.available)
  const stale = Boolean(job?.result && JSON.stringify(job.options) !== JSON.stringify({ ...options, format: options.mode === 'upscale' ? 'png' : options.format, lossless: options.mode === 'upscale' ? true : options.format === 'jpeg' ? false : options.lossless, targetKB: options.mode === 'upscale' ? 0 : options.targetKB }))
  return <div className="app" onDragOver={event => { event.preventDefault(); if (desktop && !state.busy) setDragging(true) }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false) }} onDrop={event => { event.preventDefault(); setDragging(false); if (!desktop || state.busy) return; const files = Array.from(event.dataTransfer.files); void action(async () => { setImporting(true); try { const result = await window.scalego!.drop(files); if (result.errors.length) setNotice({ text: result.errors.join('\n'), error: true }) } finally { setImporting(false) } }) }}>
    <header className="app-header"><div className="brand"><span className="brand-mark"><ArrowUpRight size={23} strokeWidth={2.5}/></span><span>SCALE<span className="brand-go">GO</span></span><span className="version">α 0.2</span></div><div className="header-actions"><button className="icon-button" aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={18}/> : <Moon size={18}/>}</button><button className="button subtle" disabled={!desktop || importing || state.busy} onClick={importFiles}><Plus size={16}/>Добавить</button></div></header>
    <div className="workspace">
      <aside className="library" aria-label="Исходные изображения"><div className="panel-heading"><h2>Изображения</h2><span className="count">{state.assets.length.toString().padStart(2, '0')}</span></div>
        {state.assets.length > 0 && <div className="selection-row"><label><input type="checkbox" disabled={state.busy} checked={selected.length === state.assets.length} onChange={e => setSelected(e.target.checked ? state.assets.map(a => a.id) : [])}/>Выбрать все</label><span>{selected.length}</span></div>}
        <div className="asset-list">{state.assets.length === 0 ? <div className="library-empty"><Image size={24} strokeWidth={1.25}/><p>Ваши исходники<br/>появятся здесь</p><span>Можно добавить сразу<br/>несколько файлов</span></div> : state.assets.map(item => {
          const itemJob = state.jobs.filter(j => j.assetId === item.id).at(-1)
          return <div className={`asset-item ${item.id === active ? 'active' : ''}`} key={item.id}><label className="asset-check"><input aria-label={`Выбрать ${item.name}`} disabled={state.busy} type="checkbox" checked={selected.includes(item.id)} onChange={e => setSelected(e.target.checked ? [...selected, item.id] : selected.filter(id => id !== item.id))}/></label><button className="asset-main" onClick={() => setActive(item.id)}><span className="asset-thumb"><img src={item.thumbnail} alt=""/></span><span className="asset-info"><strong>{item.name}</strong><small>{item.width} × {item.height} · {bytes(item.bytes)}</small><span className={`asset-status status-${itemJob?.status || 'ready'}`}>{itemJob?.status === 'done' && <Check size={12}/>} {itemJob?.stage || (item.alpha ? 'Прозрачность' : item.format.toUpperCase())}</span></span></button><button className="remove-asset icon-button" disabled={state.busy} aria-label={`Убрать ${item.name}`} onClick={() => action(() => window.scalego!.remove(item.id))}><X size={13}/></button></div>
        })}</div>
        <div className="library-footer"><span>PNG / JPG / WEBP / AVIF</span><p>Исходники не изменяются.</p></div>
      </aside>
      <Preview asset={asset} job={job} importFiles={importFiles} importing={importing} desktop={desktop}/>
      <Inspector options={options} setOptions={setOptions} engine={engine} asset={asset} busy={state.busy} outputDirectory={state.outputDirectory} chooseDirectory={() => action(() => window.scalego!.directory())}/>
    </div>
    {notice && <div className={`notice ${notice.error ? 'error' : ''}`} role={notice.error ? 'alert' : 'status'}><AlertCircle size={17}/><span>{notice.text}</span><button className="icon-button" aria-label="Закрыть сообщение" onClick={() => setNotice(undefined)}><X size={16}/></button></div>}
    {latest?.error && <div className="job-message error" role="alert"><AlertCircle size={16}/>{latest.error}</div>}
    {job?.result && !state.busy && <div className="job-message">{stale ? 'Параметры изменены — на экране предыдущий результат.' : job.result.warnings.join(' ') || 'Результат проверен: размеры и формат соответствуют параметрам.'}</div>}
    <footer className="action-bar"><div className="pipeline-label"><span className="eyebrow">МАРШРУТ</span><span>{options.mode !== 'compress' && <>Увеличение <strong>{options.scale}×</strong></>}{options.mode === 'chain' && <ChevronRight size={14}/>} {options.mode !== 'upscale' && <>Сжатие <strong>{options.format.toUpperCase()}</strong></>}</span></div><div className="queue-summary" aria-live="polite">{state.busy ? <><LoaderCircle className="spin" size={16}/><span>{running?.stage || 'Завершение…'} <strong>{running?.percent || 0}%</strong></span></> : <span>{state.assets.length ? `Выбрано: ${selected.length} · Готово: ${done.length}` : 'Добавьте изображения, чтобы начать'}</span>}</div><div className="run-actions">{state.jobs.some(j => j.status === "interrupted") && !state.busy && <button className="button" onClick={() => action(() => window.scalego!.resume())}>Продолжить очередь</button>}{done.length > 1 && !state.busy && <button className="button" disabled={saving} onClick={() => action(async () => { setSaving(true); try { const result = await window.scalego!.exportAll(); setNotice({ text: "Сохранено файлов: " + result.count, error: false }) } finally { setSaving(false) } })}><Download size={16}/>Сохранить все</button>}{job?.result && !state.busy && <button className="button" onClick={() => action(async () => { const saved = await window.scalego!.export(job.id); if (!saved.canceled) setNotice({ text: `Сохранено: ${saved.name}`, error: false }) })}><Download size={16}/>Сохранить</button>}{state.outputDirectory && <button className="icon-button" aria-label="Открыть папку результатов" onClick={() => action(() => window.scalego!.reveal())}><FolderOpen size={18}/></button>}{state.busy ? <button className="button" onClick={() => action(() => window.scalego!.cancel())}><Square size={14}/>Отменить</button> : <button className="button primary" disabled={!desktop || !selected.length || importing || modelUnavailable} onClick={() => action(() => window.scalego!.start(selected, options))}><Play size={15}/>{selected.length > 1 ? `Обработать ${selected.length}` : 'Обработать'}</button>}</div></footer>
    {state.busy && <div className="global-progress" style={{ width: `${running?.percent || 0}%` }}/>}
    {dragging && <div className="drop-overlay"><Plus size={42}/><strong>Отпустите изображения здесь</strong><span>Добавить в рабочую очередь</span></div>}
  </div>
}
