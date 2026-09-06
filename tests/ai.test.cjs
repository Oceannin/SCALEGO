const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),sharp=require('sharp')
const {processImage}=require('../electron/pipeline.cjs')
const {engineStatus}=require('../electron/engine.cjs')
test('real Vulkan AI preserves transparent regions for illustration and photo models',async t=>{
 const engineRoot=path.resolve('runtime')
 if(process.platform!=='win32'||!(await engineStatus(engineRoot)).available){t.skip('Requires installed Windows Vulkan runtime');return}
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
