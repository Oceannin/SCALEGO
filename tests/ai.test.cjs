const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),sharp=require('sharp')
const {processImage}=require('../electron/pipeline.cjs')
const {engineStatus}=require('../electron/engine.cjs')
const { MODELS, planUpscale } = require('../electron/models.cjs')
test('all installed intent models: native dimensions, RGBA edges, codecs, tiny and wide inputs', async t => {
 const engineRoot = path.resolve(process.env.SCALEGO_TEST_ENGINE_ROOT || 'runtime')
 if(process.platform !== 'win32') { t.skip('Windows x64 native runtime required'); return }
 const status = await engineStatus(engineRoot)
 const root = await fs.mkdtemp(path.join(os.tmpdir(),'scalego-models-')); t.after(()=>fs.rm(root,{recursive:true,force:true}))
 const source = path.join(root,'прозрачный файл.png')
 const pixels = Buffer.alloc(32*24*4)
 for(let y=0;y<24;y++) for(let x=0;x<32;x++) { const i=(y*32+x)*4; pixels[i]=180;pixels[i+1]=110;pixels[i+2]=70;pixels[i+3]=x<6?0:x<12?128:255 }
 await sharp(pixels,{raw:{width:32,height:24,channels:4}}).png().toFile(source)
 const fixtures = []
 for(const [format,width,height] of [['png',19,7],['jpeg',23,13],['webp',31,5],['png',1,3]]) {
  const input=path.join(root,`пример ${width}.${format}`)
  await sharp({create:{width,height,channels:3,background:'#b46e46'}}).toFormat(format).toFile(input)
  fixtures.push({input,width,height,format})
 }
 for(const model of MODELS) await t.test(model.id, async mt => {
  if(!status.models.find(m=>m.id===model.id)?.available) {
   if(process.env.SCALEGO_REQUIRE_ALL_MODELS==='1') assert.fail('Required model unavailable: '+model.id)
   mt.skip('Model not installed; this does not verify GPU support'); return
  }
  for(const scale of [2,3,4]) {
   const options={model:model.id,mode:'upscale',method:'ai',scale,format:'png',quality:90,lossless:true,background:'#ffffff',targetKB:0}
   const result=await processImage({input:source,tempDirectory:path.join(root,model.id+'-'+scale),engineRoot,options})
   const meta=await sharp(result.outputPath).metadata()
   assert.equal(meta.width,32*scale);assert.equal(meta.height,24*scale);assert.equal(meta.hasAlpha,true)
   const alpha=await sharp(result.outputPath).extractChannel('alpha').raw().toBuffer()
   const expected=await sharp(source).extractChannel('alpha').resize(32*scale,24*scale,{kernel:'cubic'}).raw().toBuffer()
   assert.deepEqual(alpha,expected,'AI must not change deterministic alpha, including soft edges')
   const rgb=await sharp(result.outputPath).removeAlpha().raw().toBuffer()
   for(let i=0;i<alpha.length;i++) if(alpha[i]>0) for(const [c,value] of [180,110,70].entries()) assert.ok(Math.abs(rgb[i*3+c]-value)<35,'No black/white halo on constant RGB with varying alpha')
   const recipe=JSON.parse(await fs.readFile(result.recipePath,'utf8')),plan=planUpscale(model.id,scale)
   assert.equal(recipe.schemaVersion,1);assert.equal(recipe.inference.engine,model.engine);assert.equal(recipe.inference.model,model.name)
   assert.equal(recipe.inference.requestedScale,scale);assert.equal(recipe.inference.nativeScale,plan.nativeScale)
   assert.deepEqual(recipe.inference.intermediateResize,plan.intermediateResize)
   const log=await fs.readFile(path.join(root,model.id+'-'+scale,'engine-log.jsonl'),'utf8')
   assert.ok(!log.includes(root));assert.ok(!log.includes('прозрачный'));assert.match(log,/exitCode/)
  }
  for(const [i,f] of fixtures.entries()) {
   const scale=[2,3,4,2][i]
   const result=await processImage({input:f.input,tempDirectory:path.join(root,model.id+'-rgb-'+i),engineRoot,options:{model:model.id,mode:'chain',method:'ai',scale,format:['png','jpeg','webp','avif'][i],quality:90,lossless:false,background:'#ffffff',targetKB:0}})
   const meta=await sharp(result.outputPath).metadata()
   assert.equal(meta.width,f.width*scale);assert.equal(meta.height,f.height*scale);assert.equal(Boolean(meta.hasAlpha),false)
  }
  if(['fast','illustration-clean'].includes(model.id)) {
   const controller=new AbortController(),directory=path.join(root,model.id+'-cancel')
   let timer
   try {
    // Small inputs can emit only 0%; cancel during native startup instead of
    // depending on an intermediate percentage that the CLI need not emit.
    await assert.rejects(processImage({input:source,tempDirectory:directory,engineRoot,options:{model:model.id,mode:'upscale',method:'ai',scale:4,format:'png',quality:90,lossless:true,background:'#ffffff',targetKB:0}}, percent=>{if(percent===10&&!timer)timer=setTimeout(()=>controller.abort(),300)},controller.signal),{code:'CANCELLED'})
   } finally { clearTimeout(timer) }
   assert.equal(controller.signal.aborted,true,'Cancel must interrupt native inference')
   const cancelledLog=JSON.parse((await fs.readFile(path.join(directory,'engine-log.jsonl'),'utf8')).trim())
   assert.ok(Object.hasOwn(cancelledLog,'exitCode'),'A real native subprocess must have been started')
   await assert.rejects(fs.access(path.join(directory,'result.png')))
   await assert.rejects(fs.access(path.join(directory,'recipe.scalego')))
  }
 })
})
test('real Vulkan AI preserves transparent regions for illustration and photo models',async t=>{
 const engineRoot=path.resolve(process.env.SCALEGO_TEST_ENGINE_ROOT || 'runtime')
 const availability=process.platform==='win32'?await engineStatus(engineRoot):null
 if(!availability||!['fast','photo-detailed'].every(id=>availability.models.some(model=>model.id===id&&model.available))){t.skip('Requires both legacy models in Windows Vulkan runtime');return}
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'scalego-ai-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}))
 const source=path.join(root,'source.png')
 await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="80"><circle cx="48" cy="40" r="25" fill="#e07040"/><circle cx="48" cy="40" r="16" fill="#f8d8a0"/></svg>')).png().toFile(source)
 for(const model of ['illustration','photo']) for(const scale of [2,3,4]){
  const result=await processImage({input:source,tempDirectory:path.join(root,model+'-'+scale),engineRoot,options:{model,mode:'chain',method:'ai',scale,format:'webp',quality:90,lossless:false,background:'#ffffff',targetKB:0}})
  assert.equal(result.width,96*scale);assert.equal(result.height,80*scale);assert.equal(result.alpha,true)
  const {data,info}=await sharp(result.outputPath).ensureAlpha().raw().toBuffer({resolveWithObject:true})
  assert.equal(data[3],0)
  const center=(40*scale*info.width+48*scale)*4
  assert.ok(data[center+3]>250);assert.ok(data[center]>80)
 }
})
