import { useEffect, useRef, useState } from 'react'
import { Plus, Sun, Moon, FolderOpen, ArrowUpRight, X, Check, LoaderCircle, Play, Square, Download, AlertCircle, Image } from 'lucide-react'
import { Inspector } from './components/Inspector'
import { Preview } from './components/Preview'
import { defaultOptions } from './types'
import { formatBytes, translateMessage, useI18n } from './i18n'
import type { Snapshot, Engine, Options, UserMessage, Job } from './types'

const empty: Snapshot = { assets: [], jobs: [], busy: false, outputDirectory: null }
type NoticeMessage = UserMessage & { name?: string }

function effectiveOptions(options: Options): Options {
  return {
    ...options,
    format: options.mode === 'upscale' ? 'png' : options.format,
    lossless: options.mode === 'upscale' ? true : options.format === 'jpeg' ? false : options.lossless,
    targetKB: options.mode === 'upscale' ? 0 : options.targetKB,
  }
}

function sameOptions(left: Options, right: Options) {
  return JSON.stringify(left) === JSON.stringify(right)
}

export default function App() {
  const { language, setLanguage, t } = useI18n()
  const [state, setState] = useState<Snapshot>(empty)
  const [engine, setEngine] = useState<Engine>({ available: false, statusCode: 'ENGINE_STATUS', models: [] })
  const [options, setOptions] = useState<Options>(defaultOptions)
  const [selected, setSelected] = useState<string[]>([])
  const [active, setActive] = useState<string>()
  const [notice, setNotice] = useState<{ messages: NoticeMessage[]; error: boolean }>()
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
    bridge.state().then(next => { if (live) update(next) }).catch(error => setNotice({ messages: [{ code: error?.code || 'UNEXPECTED_ERROR', params: error?.params }], error: true }))
    bridge.engine().then(value => { if (live) { setEngine(value); setOptions(current => value.models.some(model => model.id === current.model && model.available) ? current : value.available ? { ...current, model: value.models.find(model => model.available)!.id } : { ...current, method: 'lanczos' }) } }).catch(error => setNotice({ messages: [{ code: error?.code || 'UNEXPECTED_ERROR', params: error?.params }], error: true }))
    return () => { live = false; unsubscribe() }
  }, [])
  const action = async (task: () => Promise<unknown>) => { try { await task() } catch (error) { const value = error as { code?: string; params?: Record<string, string | number> }; setNotice({ messages: [{ code: value?.code || 'UNEXPECTED_ERROR', params: value?.params }], error: true }) } }
  const showImportErrors = (errors: NoticeMessage[]) => { if (errors.length) setNotice({ messages: errors, error: true }) }
  const importFiles = () => action(async () => { setImporting(true); try { showImportErrors((await window.scalego!.import(language)).errors) } finally { setImporting(false) } })
  const asset = state.assets.find(a => a.id === active)
  const assetJobs = state.jobs.filter(j => j.assetId === active)
  const job = [...assetJobs].reverse().find(j => j.result) || assetJobs.at(-1)
  const running = state.jobs.find(j => j.status === 'running')
  const latest = assetJobs.at(-1)
  const modelUnavailable = options.mode !== 'compress' && options.method === 'ai' && !engine.models.some(model => model.id === options.model && model.available)
  const currentOptions = effectiveOptions(options)
  const stale = Boolean(job?.result && !sameOptions(job.options, currentOptions))
  const latestResultJobs = new Map<string, Job>()
  for (const candidate of state.jobs) {
    if (candidate.status === 'done' && candidate.result) latestResultJobs.set(candidate.assetId, candidate)
  }
  const latestValidJobs = new Map([...latestResultJobs].filter(([, candidate]) => candidate && sameOptions(candidate.options, currentOptions)))
  const selectedValidJobs = selected.map(id => latestValidJobs.get(id)).filter((candidate): candidate is Job => Boolean(candidate))
  const selectionReady = selected.length > 0 && selectedValidJobs.length === selected.length
  const singleValidJob = state.assets.length === 1 && asset ? latestValidJobs.get(asset.id) : undefined
  const allValidJobs = [...latestValidJobs.values()]
  const primarySaveJobs = state.assets.length === 1 && singleValidJob ? [singleValidJob] : selectionReady ? selectedValidJobs : []
  const canSavePrimary = primarySaveJobs.length > 0
  const saveSelectedIsDistinct = state.assets.length > 1 && selectionReady && selectedValidJobs.length < allValidJobs.length
  const primarySaveIsSelected = state.assets.length > 1 && selected.length < state.assets.length
  const processIds = state.assets.length === 1 && asset ? [asset.id] : selected
  const resultWarnings = job?.result?.warnings.map(warning => translateMessage(t, 'warning', warning)).filter(Boolean).join(' ')
  const outputFormat = options.mode === 'upscale' ? 'PNG' : options.format === 'jpeg' ? 'JPG' : options.format.toUpperCase()
  const qualitySummary = options.mode !== 'upscale' && !(options.format !== 'jpeg' && options.lossless) ? ` · Q${options.quality}` : ''
  const noticeText = notice?.messages.map(message => {
    const text = translateMessage(t, 'error', message)
    return `${message.name ? `${message.name}: ` : ''}${text}`
  }).join('\n')
  return <div className="app" onDragOver={event => { event.preventDefault(); if (desktop && !state.busy) setDragging(true) }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false) }} onDrop={event => { event.preventDefault(); setDragging(false); if (!desktop || state.busy) return; const files = Array.from(event.dataTransfer.files); void action(async () => { setImporting(true); try { showImportErrors((await window.scalego!.drop(files)).errors) } finally { setImporting(false) } }) }}>
    <header className="app-header"><div className="brand"><span className="brand-mark"><ArrowUpRight size={23} strokeWidth={2.5}/></span><span>SCALE<span className="brand-go">GO</span></span><span className="version">α 0.3</span></div><div className="header-actions"><div className="language-switch" role="group" aria-label={t('header.language')}>{(['ru', 'en'] as const).map(value => <button key={value} type="button" aria-pressed={language === value} onClick={() => setLanguage(value)}>{value.toUpperCase()}</button>)}</div><button className="icon-button" aria-label={theme === 'dark' ? t('header.lightTheme') : t('header.darkTheme')} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={18}/> : <Moon size={18}/>}</button><button className="button subtle" disabled={!desktop || importing || state.busy} onClick={importFiles}><Plus size={16}/>{t('header.add')}</button></div></header>
    <div className="workspace">
      <aside className="library" aria-label={t('library.aria')}><div className="panel-heading"><h2>{t('library.title')}</h2><span className="count">{state.assets.length.toString().padStart(2, '0')}</span></div>
        {state.assets.length > 0 && <div className="selection-row"><label><input type="checkbox" disabled={state.busy} checked={selected.length === state.assets.length} onChange={e => setSelected(e.target.checked ? state.assets.map(a => a.id) : [])}/>{t('library.selectAll')}</label><span>{selected.length}</span></div>}
        <div className="asset-list">{state.assets.length === 0 ? <div className="library-empty"><Image size={24} strokeWidth={1.25}/><p>{t('library.emptyTitle')}</p><span>{t('library.emptyHelp')}</span></div> : state.assets.map(item => {
          const itemJob = state.jobs.filter(j => j.assetId === item.id).at(-1)
          return <div className={`asset-item ${item.id === active ? 'active' : ''}`} key={item.id}><label className="asset-check"><input aria-label={t('library.selectAsset', { name: item.name })} disabled={state.busy} type="checkbox" checked={selected.includes(item.id)} onChange={e => setSelected(e.target.checked ? [...selected, item.id] : selected.filter(id => id !== item.id))}/></label><button className="asset-main" onClick={() => setActive(item.id)}><span className="asset-thumb"><img src={item.thumbnail} alt=""/></span><span className="asset-info"><strong>{item.name}</strong><small>{item.width} × {item.height} · {formatBytes(item.bytes, language)}</small><span className={`asset-status status-${itemJob?.status || 'ready'}`}>{itemJob?.status === 'done' && <Check size={12}/>} {itemJob?.stage ? translateMessage(t, 'stage', itemJob.stage) : item.alpha ? t('library.transparency') : item.format.toUpperCase()}</span></span></button><button className="remove-asset icon-button" disabled={state.busy} aria-label={t('library.removeAsset', { name: item.name })} onClick={() => action(() => window.scalego!.remove(item.id))}><X size={13}/></button></div>
        })}</div>
        <div className="library-footer"><span>PNG / JPG / WEBP / AVIF</span><p>{t('library.unchanged')}</p></div>
      </aside>
      <Preview asset={asset} job={job} importFiles={importFiles} importing={importing} desktop={desktop}/>
      <Inspector options={options} setOptions={setOptions} engine={engine} asset={asset} selectionCount={selected.length} selectionHasAlpha={(selected.length ? state.assets.filter(item => selected.includes(item.id)) : asset ? [asset] : []).some(item => item.alpha)} busy={state.busy} outputDirectory={state.outputDirectory} chooseDirectory={() => action(() => window.scalego!.directory(language))}/>
    </div>
    {notice && <div className={`notice ${notice.error ? 'error' : ''}`} role={notice.error ? 'alert' : 'status'}><AlertCircle size={17}/><span>{noticeText}</span><button className="icon-button" aria-label={t('common.closeMessage')} onClick={() => setNotice(undefined)}><X size={16}/></button></div>}
    {latest?.errorCode && <div className="job-message error" role="alert"><AlertCircle size={16}/>{translateMessage(t, 'error', { code: latest.errorCode, params: latest.errorParams })}</div>}
    {job?.result && !state.busy && !stale && resultWarnings && <div className="job-message" role="status"><AlertCircle size={15}/>{resultWarnings}</div>}
    <footer className="action-bar"><div className="queue-summary" aria-live="polite">{state.busy ? <><LoaderCircle className="spin" size={16}/><span>{running?.stage ? translateMessage(t, 'stage', running.stage) : t('queue.finishing')} <strong>{running?.percent || 0}%</strong></span></> : state.assets.length ? <span>{selected.length === 1 ? t('queue.recipeOne', { format: outputFormat, quality: qualitySummary }) : t('queue.recipeMany', { count: selected.length, format: outputFormat, quality: qualitySummary })}</span> : <span>{t('queue.empty')}</span>}</div><div className="run-actions">{state.jobs.some(j => j.status === 'interrupted') && !state.busy && <button className="button" onClick={() => action(() => window.scalego!.resume())}>{t('queue.resume')}</button>}{state.outputDirectory && <button className="icon-button" aria-label={t('save.openFolder')} onClick={() => action(() => window.scalego!.reveal())}><FolderOpen size={18}/></button>}{state.busy ? <button className="button" onClick={() => action(() => window.scalego!.cancel())}><Square size={14}/>{t('queue.cancel')}</button> : <>{canSavePrimary && <>{saveSelectedIsDistinct && <button className="button" disabled={saving} onClick={() => action(async () => { setSaving(true); try { await window.scalego!.exportAll(language) } finally { setSaving(false) } })}><Download size={16}/>{t('save.all')}</button>}<button className="button primary" disabled={saving} onClick={() => action(async () => { setSaving(true); try { if (state.assets.length === 1) await window.scalego!.export(primarySaveJobs[0].id, language); else if (primarySaveIsSelected) await window.scalego!.exportSelected(selected, language); else await window.scalego!.exportAll(language) } finally { setSaving(false) } })}><Download size={16}/>{state.assets.length === 1 ? t('save.one') : primarySaveIsSelected ? t('save.selected') : t('save.all')}</button><button className="button" disabled={!desktop || !processIds.length || importing || modelUnavailable} onClick={() => action(() => window.scalego!.start(processIds, options))}><Play size={15}/>{t('queue.processAgain')}</button></>}{!canSavePrimary && <button className="button primary" disabled={!desktop || !processIds.length || importing || modelUnavailable} onClick={() => action(() => window.scalego!.start(processIds, options))}><Play size={15}/>{processIds.length > 1 ? t('queue.processCount', { count: processIds.length }) : t('queue.process')}</button>}</>}</div></footer>
    {state.busy && <div className="global-progress" style={{ width: `${running?.percent || 0}%` }}/>}
    {dragging && <div className="drop-overlay"><Plus size={42}/><strong>{t('drop.title')}</strong><span>{t('drop.help')}</span></div>}
  </div>
}
