export type Mode = 'upscale' | 'chain' | 'compress'
export interface Options { model: 'illustration' | 'photo'; mode: Mode; method: 'ai' | 'lanczos' | 'nearest'; scale: number; format: 'png' | 'jpeg' | 'webp' | 'avif'; quality: number; lossless: boolean; background: string; targetKB: number }
export interface Asset { id: string; name: string; width: number; height: number; bytes: number; format: string; alpha: boolean; url: string; thumbnail: string }
export interface Result extends Asset { originalBytes: number; quality: number; warnings: string[]; elapsedMs: number; targetMet: boolean }
export interface Job { id: string; assetId: string; name: string; status: 'queued' | 'running' | 'done' | 'error' | 'canceled' | 'interrupted'; percent: number; stage: string; error?: string; options: Options; result?: Result }
export interface Snapshot { assets: Asset[]; jobs: Job[]; busy: boolean; outputDirectory: string | null }
export interface Engine { available: boolean; name: string; message: string }
export interface Bridge {
  state(): Promise<Snapshot>; engine(): Promise<Engine>; import(): Promise<{ errors: string[] }>; drop(files: File[]): Promise<{ errors: string[] }>;
  remove(id: string): Promise<void>; start(ids: string[], options: Options): Promise<Snapshot>; resume(): Promise<Snapshot>; cancel(): Promise<void>;
  exportAll(): Promise<{count: number; canceled: boolean}>;
  export(id: string): Promise<{ canceled: boolean; name?: string }>; directory(): Promise<Snapshot>; reveal(): Promise<void>;
  onState(callback: (state: Snapshot) => void): () => void;
}
declare global { interface Window { scalego?: Bridge } }
export const defaultOptions: Options = { model: 'illustration', mode: 'chain', method: 'ai', scale: 2, format: 'webp', quality: 85, lossless: false, background: '#ffffff', targetKB: 0 }
export function bytes(value: number) { return value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(2)} МБ` : `${(value / 1024).toFixed(1)} КБ` }
