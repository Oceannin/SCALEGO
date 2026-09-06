const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os')
const {publishResult}=require('../electron/export.cjs')
test('concurrent exports preserve existing images and recipes, publish complete distinct pairs',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'scalego-export-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}))
 const image=path.join(root,'source.png'),recipe=path.join(root,'source.scalego'),out=path.join(root,'out');await fs.mkdir(out)
 await fs.writeFile(image,'complete-image');await fs.writeFile(recipe,'{"valid":true}')
 await fs.writeFile(path.join(out,'source-scalego.png'),'existing')
 const results=await Promise.all(Array.from({length:3},()=>publishResult({outputPath:image,recipePath:recipe,directory:out,name:'source.png'})))
 assert.equal(new Set(results.map(r=>r.name)).size,3)
 assert.equal(await fs.readFile(path.join(out,'source-scalego.png'),'utf8'),'existing')
 for(const r of results){assert.equal(await fs.readFile(path.join(out,r.name),'utf8'),'complete-image');assert.deepEqual(JSON.parse(await fs.readFile(path.join(out,r.name+'.scalego'),'utf8')),{valid:true})}
 assert.equal((await fs.readdir(out)).some(n=>n.includes('lock')||n.startsWith('.scalego')),false)
})
test('missing recipe fails before an image is published',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'scalego-export-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}))
 const image=path.join(root,'source.png'),out=path.join(root,'out');await fs.mkdir(out);await fs.writeFile(image,'image')
 await assert.rejects(publishResult({outputPath:image,recipePath:path.join(root,'missing'),directory:out,name:'source.png'}))
 assert.deepEqual(await fs.readdir(out),[])
})
