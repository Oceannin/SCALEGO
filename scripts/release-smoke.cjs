// One portable launch, two tiny inference jobs, no regression matrix.
const fs=require('node:fs/promises'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto'),assert=require('node:assert/strict')
const {spawn,execFile}=require('node:child_process'),{promisify}=require('node:util'),sharp=require('sharp'),{chromium}=require('playwright')
const root=path.resolve(__dirname,'..'),pkg=require('../package.json'),manifest=require('../electron/native-artifacts.json')
const release=process.argv[2]||pkg.build.directories.output
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))
;(async()=>{
 const artifacts=path.join(root,'artifacts/multi-engine'),profile=await fs.mkdtemp(path.join(artifacts,'public-package-smoke-')),source=path.join(profile,'smoke-source.png')
 await sharp({create:{width:48,height:32,channels:3,background:'#b46e46'}}).png().toFile(source)
 const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const inspectorPort=server.address().port;await new Promise(resolve=>server.close(resolve))
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.SCALEGO_ENGINE_ROOT;delete env.SCALEGO_TEST_DATA;delete env.SCALEGO_SMOKE_INPUT
 const child=spawn(path.join(root,release,`SCALEGO-${pkg.version}-Portable.exe`),[`--inspect=${inspectorPort}`,'--remote-debugging-port=0','--user-data-dir='+profile],{env,windowsHide:true,stdio:'ignore'})
 let exited=false,spawnError,socket,browser,evaluate
 child.on('exit',()=>{exited=true});child.on('error',error=>{spawnError=error;exited=true})
 try {
  const until=Date.now()+60000
  while(true){try{await fs.access(path.join(profile,'DevToolsActivePort'));if((await fetch(`http://127.0.0.1:${inspectorPort}/json/list`)).ok)break}catch{}if(exited||Date.now()>until)throw spawnError||new Error('Portable launch timed out');await pause(200)}
  const targets=await(await fetch(`http://127.0.0.1:${inspectorPort}/json/list`)).json()
  socket=new WebSocket(targets[0].webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject})
  let sequence=0;const pending=new Map()
  socket.onmessage=message=>{const reply=JSON.parse(message.data);if(pending.has(reply.id)){pending.get(reply.id)(reply);pending.delete(reply.id)}}
  evaluate=async expression=>{const id=++sequence;const response=new Promise(resolve=>pending.set(id,resolve));socket.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));const reply=await response;assert.ok(!reply.error&&!reply.result?.exceptionDetails,JSON.stringify(reply));return reply.result?.result?.value}
  const resources=await evaluate('process.resourcesPath')
  const checked=[]
  for(const [file,pin] of Object.entries(manifest.files).filter(([file])=>/\.(bin|param)$/.test(file))){assert.equal(crypto.createHash('sha256').update(await fs.readFile(path.join(resources,'engine',file))).digest('hex'),pin.sha256,file);checked.push(file)}
  assert.equal(checked.filter(file=>file.startsWith('models/')).length,12)
  const [port]=(await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
  const page=browser.contexts()[0].pages()[0],errors=[];page.on('pageerror',error=>errors.push(error.message))
  await page.getByRole('button',{name:'Добавить',exact:true}).waitFor()
  await evaluate(`process.getBuiltinModule('module').createRequire(process.resourcesPath+'/app.asar/package.json')('electron').dialog.showOpenDialog=async()=>({canceled:false,filePaths:[${JSON.stringify(source)}]});void 0`)
  await page.getByRole('button',{name:'Добавить',exact:true}).click();await page.getByText('smoke-source.png',{exact:true}).waitFor()
  const catalog=await page.evaluate(()=>window.scalego.engine());assert.equal(catalog.models.filter(model=>model.available).length,5)
  await page.getByRole('radio',{name:/^Увеличить Больше/}).check();await page.getByRole('combobox',{name:/^Метод/}).selectOption('ai')
  const results=[]
  for(const [model,engine] of [['photo-detailed','realesrgan'],['illustration-clean','realcugan']]){
   await page.getByRole('combobox',{name:/^Желаемый результат/}).selectOption(model)
   await page.getByRole('button',{name:'Обработать',exact:true}).click()
   const deadline=Date.now()+60000;let state
   while(true){state=await page.evaluate(()=>window.scalego.state());if(!state.busy&&state.jobs.length===results.length+1)break;assert.ok(Date.now()<deadline,'Short inference timed out');await pause(100)}
   const job=state.jobs.at(-1);assert.equal(job.status,'done',job.error);assert.equal(job.result.width,96);assert.equal(job.result.height,64)
   const recipe=JSON.parse(await fs.readFile(path.join(profile,'work',job.id,'recipe.scalego'),'utf8'));assert.equal(recipe.inference.engine,engine)
   results.push({model,engine,status:job.status,width:job.result.width,height:job.result.height})
  }
  assert.deepEqual(errors,[])
  const report={status:'passed',applicationLaunch:'passed',portableWeights:checked,modelsAvailable:5,results,pageErrors:errors}
  await fs.writeFile(path.join(artifacts,'public-weights-smoke.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
 } finally {
  if(evaluate)await evaluate("setTimeout(()=>process.getBuiltinModule('module').createRequire(process.resourcesPath+'/app.asar/package.json')('electron').app.quit(),100);void 0").catch(()=>{})
  socket?.close();if(browser)await browser.close()
  for(let i=0;i<50&&!exited;i++)await pause(200)
  if(!exited&&child.pid)await promisify(execFile)('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true}).catch(()=>{})
 }
})().catch(error=>{console.error(error);process.exitCode=1})
