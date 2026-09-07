// Synthetic, deterministic fixtures: no private corpus or downloaded artwork.
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os')
const sharp = require('sharp')
const { processImage } = require('../electron/pipeline.cjs')
const { engineStatus } = require('../electron/engine.cjs')
const { MODELS } = require('../electron/models.cjs')
const value = name => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i+1] }
async function benchmark() {
  const engineRoot = path.resolve(value('--engine-root') || 'runtime')
  const gpu = value('--gpu') === undefined ? undefined : Number(value('--gpu'))
  if (gpu !== undefined && (!Number.isInteger(gpu) || gpu < 0)) throw new Error('--gpu requires a nonnegative integer')
  const output = path.resolve(value('--output') || 'artifacts/multi-engine/benchmark.json')
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'scalego-benchmark-'))
  const status = await engineStatus(engineRoot)
  const rows = []
  try {
    const art = path.join(workspace, 'art.png'), texture = path.join(workspace, 'texture.jpg'), tiny = path.join(workspace, 'tiny.webp')
    await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="64"><rect x="10" y="8" width="76" height="48" rx="12" fill="#b46e46"/><path d="M20 40Q40 10 80 40" stroke="#f0d6ad" stroke-width="3" fill="none"/></svg>')).png().toFile(art)
    const pixels = Buffer.alloc(192*128*3); let seed = 739
    for(let i=0;i<pixels.length;i++){ seed=(Math.imul(seed,1664525)+1013904223)>>>0; pixels[i]=seed>>>24 }
    await sharp(pixels,{raw:{width:192,height:128,channels:3}}).jpeg({quality:90}).toFile(texture)
    await sharp({create:{width:23,height:7,channels:3,background:'#b46e46'}}).webp({lossless:true}).toFile(tiny)
    for(const model of MODELS) for(const [fixture,input] of [['illustration-rgba',art],['texture-rgb',texture],['wide-small',tiny]]) for(const scale of [2,3,4]) {
      const common = { fixture, engine:model.engine, model:model.name, requestedScale:scale, gpu:gpu??'auto' }
      if(!status.models.find(m=>m.id===model.id)?.available) { rows.push({...common,status:'unavailable'});continue }
      const meta = await sharp(input).metadata()
      const directory = path.join(workspace,`${model.id}-${fixture}-${scale}`)
      const started = performance.now()
      try {
        const result=await processImage({input,tempDirectory:directory,engineRoot,gpu,options:{model:model.id,method:'ai',mode:'upscale',scale,format:'png',quality:90,lossless:true,background:'#ffffff',targetKB:0}})
        const recipe=JSON.parse(await fs.readFile(result.recipePath,'utf8'))
        const logs=(await fs.readFile(path.join(directory,'engine-log.jsonl'),'utf8')).trim().split('\n').map(JSON.parse)
        rows.push({...common,status:'ok',inputDimensions:[meta.width,meta.height],outputDimensions:[result.width,result.height],nativeScale:recipe.inference.nativeScale,intermediateResize:recipe.inference.intermediateResize,processingMs:Math.round(performance.now()-started),nativeMs:logs.reduce((sum,entry)=>sum+entry.durationMs,0),outputBytes:result.bytes,peakMemoryBytes:null,gpuDetails:logs.at(-1).stderr.split('\n').filter(line=>/^\[\d+\s/.test(line))})
      } catch(error) { rows.push({...common,status:'error',code:error.code,message:error.message});process.exitCode=1 }
      console.log(`${model.id} ${fixture} ${scale}x: ${rows.at(-1).status}`)
    }
    await fs.mkdir(path.dirname(output),{recursive:true})
    await fs.writeFile(output,JSON.stringify({date:new Date().toISOString(),platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,node:process.version,sharp:sharp.versions,notes:'Serial cold executable starts; includes decode, alpha, post-resize and lossless PNG encode. Synthetic fixtures are for practical timing, not photographic quality ranking. Peak native memory not sampled. Use --gpu N on each available physical GPU.',rows},null,2))
    console.log('Benchmark: '+output)
  } finally {
    const resolved=path.resolve(workspace)
    if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('scalego-benchmark-')) await fs.rm(resolved,{recursive:true,force:true})
  }
}
benchmark().catch(error=>{console.error(error);process.exitCode=1})
