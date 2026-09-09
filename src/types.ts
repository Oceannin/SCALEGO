export type Mode = 'upscale' | 'chain' | 'compress'
export type ModelId = 'photo-natural' | 'photo-detailed' | 'illustration-clean' | 'illustration-detailed' | 'fast' | 'illustration' | 'photo'
export interface UserMessage { code: string; params?: Record<string, string | number> }
export interface Options { model: ModelId; mode: Mode; method: 'ai' | 'lanczos' | 'nearest'; scale: number; format: 'png' | 'jpeg' | 'webp' | 'avif'; quality: number; lossless: boolean; background: string; targetKB: number }
export interface Asset { id: string; name: string; width: number; height: number; bytes: number; format: string; alpha: boolean; url: string; thumbnail: string }
export interface Result extends Asset { originalBytes: number; quality: number; warnings: UserMessage[]; elapsedMs: number; targetMet: boolean }
export interface Job { id: string; assetId: string; name: string; status: 'queued' | 'running' | 'done' | 'error' | 'canceled' | 'interrupted'; percent: number; stage: string; errorCode?: string; errorParams?: Record<string, string | number>; options: Options; result?: Result }
export interface Snapshot { assets: Asset[]; jobs: Job[]; busy: boolean; outputDirectory: string | null }
export interface ModelStatus { id: ModelId; category: string; name: string; nativeScales: number[]; available: boolean; code: string | null; statusCode: string }
export interface Engine { available: boolean; statusCode: string; models: ModelStatus[] }
export interface Bridge {
  state(): Promise<Snapshot>; engine(): Promise<Engine>; import(language: 'ru' | 'en'): Promise<{ errors: Array<UserMessage & { name?: string }> }>; drop(files: File[]): Promise<{ errors: Array<UserMessage & { name?: string }> }>;
  remove(id: string): Promise<void>; start(ids: string[], options: Options): Promise<Snapshot>; resume(): Promise<Snapshot>; cancel(): Promise<void>;
  exportAll(language: 'ru' | 'en'): Promise<{count: number; canceled: boolean}>;
  exportSelected(ids: string[], language: 'ru' | 'en'): Promise<{count: number; canceled: boolean}>;
  export(id: string, language: 'ru' | 'en'): Promise<{ canceled: boolean; name?: string }>; directory(language: 'ru' | 'en'): Promise<Snapshot>; reveal(): Promise<void>;
  onState(callback: (state: Snapshot) => void): () => void;
}
declare global { interface Window { scalego?: Bridge } }
export const defaultOptions: Options = { model: 'fast', mode: 'chain', method: 'ai', scale: 2, format: 'webp', quality: 85, lossless: false, background: '#ffffff', targetKB: 0 }
