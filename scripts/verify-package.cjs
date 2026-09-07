const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict')
const manifest=require('../electron/native-artifacts.json'),pkg=require('../package.json')
const hash=b=>crypto.createHash('sha256').update(b).digest('hex')
async function walk(root,relative='') {
 const out=[]
 for(const entry of await fs.readdir(path.join(root,relative),{withFileTypes:true})) {
  const file=relative?relative+'/'+entry.name:entry.name
  if(entry.isDirectory())out.push(...await walk(root,file));else out.push(file)
 }
 return out
}
;(async()=>{
 const root=path.resolve(__dirname,'..'),release=path.join(root,pkg.build.directories.output),resources=path.join(release,'win-unpacked/resources'),engine=path.join(resources,'engine')
 const approved=Object.entries(manifest.files).filter(([,pin])=>pin.redistribution)
 const notices=await walk(path.join(root,'third-party/inference'))
 const expected=[...approved.map(([file])=>file),...notices.map(file=>'licenses/'+file),'SCALEGO-engine-manifest.json'].sort()
 assert.deepEqual((await walk(engine)).sort(),expected,'No extra native files, DLLs, or unapproved weights')
 for(const [file,pin] of approved)assert.equal(hash(await fs.readFile(path.join(engine,file))),pin.sha256,file)
 for(const file of notices)assert.equal(hash(await fs.readFile(path.join(engine,'licenses',file))),hash(await fs.readFile(path.join(root,'third-party/inference',file))),file)
 const shipped=JSON.parse(await fs.readFile(path.join(engine,'SCALEGO-engine-manifest.json'),'utf8'))
 assert.deepEqual(shipped.files,Object.fromEntries(approved))
 const asar=require('@electron/asar'),archive=path.join(resources,'app.asar')
 for(const directory of ['electron','dist'])for(const file of await walk(path.join(root,directory))) {
  const name=directory+'/'+file
  assert.equal(hash(asar.extractFile(archive,path.normalize(name))),hash(await fs.readFile(path.join(root,name))),'Packaged source is current: '+name)
 }
 assert.equal(hash(await fs.readFile(path.join(resources,'THIRD_PARTY_NOTICES.md'))),hash(await fs.readFile(path.join(root,'THIRD_PARTY_NOTICES.md'))))
 for(const file of ['MODEL_AUDIT.md','MULTI_ENGINE.md','JPEGLI_AUDIT.md'])assert.equal(hash(await fs.readFile(path.join(resources,'docs',file))),hash(await fs.readFile(path.join(root,'docs',file))),'Packaged audit is current: '+file)
 const artifacts=[]
 for(const [source,name] of [[`SCALEGO-${pkg.version}-Portable.exe`,`SCALEGO-${pkg.version}-Portable.exe`],[`SCALEGO Setup ${pkg.version}.exe`,`SCALEGO-${pkg.version}-Setup.exe`]]) {
  const b=await fs.readFile(path.join(release,source))
  if(source!==name)await fs.writeFile(path.join(release,name),b)
  artifacts.push({name,bytes:b.length,sha256:hash(b)})
 }
 await fs.writeFile(path.join(release,'SHA256SUMS.txt'),artifacts.map(a=>`${a.sha256}  ${a.name}`).join('\n')+'\n')
 const report={date:new Date().toISOString(),status:'passed',artifacts,nativeBytes:approved.reduce((sum,[,pin])=>sum+pin.bytes,0),nativeFiles:approved.map(([file,pin])=>({file,bytes:pin.bytes})),excludedWeights:Object.entries(manifest.files).filter(([,pin])=>!pin.redistribution).map(([file])=>file),checks:['exact native allowlist','all native hashes','all inference notices','packaged manifest','current electron and dist files in ASAR','current notices','portable and installer hashes']}
 await fs.mkdir(path.join(root,'artifacts/multi-engine'),{recursive:true})
 await fs.writeFile(path.join(root,'artifacts/multi-engine/package-verification.json'),JSON.stringify(report,null,2))
 console.log(JSON.stringify(report,null,2))
})().catch(error=>{console.error(error);process.exitCode=1})
