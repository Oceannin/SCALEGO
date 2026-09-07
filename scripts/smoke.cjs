const fs = require('node:fs/promises')
const path = require('node:path')
const assert = require('node:assert/strict')
const sharp = require('sharp')
const { _electron: electron } = require('playwright')
const root = path.join(__dirname, '..')
;(async () => {
 const artifacts=path.join(root,'artifacts');await fs.mkdir(artifacts,{recursive:true})
 const dataDirectory=await fs.mkdtemp(path.join(artifacts,'desktop-session-'))
 const source=path.join(dataDirectory,'smoke-source.png')
 await sharp(Buffer.from('<svg width="480" height="360" xmlns="http://www.w3.org/2000/svg"><rect x="40" y="35" width="400" height="290" rx="70" fill="#e7c397"/><circle cx="190" cy="155" r="60" fill="#8d4b30"/><path d="M110 290L310 55 405 290Z" fill="#54756a"/><circle cx="310" cy="200" r="65" fill="#e47642"/><path d="M80 250Q200 110 380 280" fill="none" stroke="#faf0da" stroke-width="12"/></svg>')).png().toFile(source)
 const env={...process.env,SCALEGO_SMOKE_INPUT:JSON.stringify([source]),SCALEGO_TEST_DATA:dataDirectory};delete env.ELECTRON_RUN_AS_NODE;delete env.SCALEGO_ENGINE_ROOT
 const launchOptions=process.env.SCALEGO_PACKAGED_EXE ? {executablePath:process.env.SCALEGO_PACKAGED_EXE,args:['--user-data-dir='+dataDirectory],env} : {args:[root],env}
 const desktop=await electron.launch(launchOptions)
 let jobCount=0
 const errors=[]
 try {
  const page=await desktop.firstWindow();page.on('pageerror',e=>errors.push(e.message))
  if(process.env.SCALEGO_PACKAGED_EXE) {
   assert.equal(await desktop.evaluate(({app})=>app.getPath('userData')),dataDirectory,'Packaged smoke must use an isolated profile')
   await desktop.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]})},source)
   await page.getByRole('button',{name:'Добавить',exact:true}).click()
  }
  await page.getByText('smoke-source.png',{exact:true}).waitFor()
  const run=async(mode)=>{
   await page.getByRole('radio',{name:mode}).check()
   await page.getByRole('button',{name:'Обработать',exact:true}).click()
   jobCount++
   const deadline=Date.now()+120000
   let state
   do {
    state=await page.evaluate(async()=>await window.scalego.state())
    if(state.jobs.length===jobCount&&!state.busy) break
    assert.ok(Date.now()<deadline,'Processing did not finish within 120 seconds')
    await page.waitForTimeout(100)
   } while(true)
   const job=state.jobs.at(-1);assert.equal(job.status,'done',job.error);return job.result
  }
  await page.screenshot({path:path.join(artifacts,'workspace-dark.png')})
  const compressed=await run(/Только сжать/);assert.equal(compressed.width,480);assert.equal(compressed.alpha,true)
  await page.screenshot({path:path.join(artifacts,'compression-result.png')})
  const enlarged=await run(/^Увеличить Больше/);assert.equal(enlarged.width,960);assert.equal(enlarged.format,'png');assert.equal(enlarged.alpha,true)
  const chained=await run(/Увеличить и сжать/);assert.equal(chained.width,960);assert.equal(chained.format,'webp');assert.equal(chained.alpha,true)
  await page.screenshot({path:path.join(artifacts,'ai-result.png')})
  const output=path.join(artifacts,'export-smoke');await fs.mkdir(output,{recursive:true})
  await desktop.evaluate(({dialog},directory)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[directory]})},output)
  await page.getByRole('button',{name:'Сохранить',exact:true}).click()
  await page.getByText(/Сохранено: smoke-source-scalego/).waitFor()
  const exported=await fs.readdir(output);assert.ok(exported.some(n=>n.endsWith('.webp.scalego')))
  await page.getByRole('button',{name:'PNG',exact:true}).click()
  const quality=page.getByRole('slider',{name:'Качество сжатия'})
  assert.equal(await quality.isEnabled(),true)
  await page.getByRole('checkbox',{name:'Без потерь',exact:true}).check()
  assert.equal(await quality.isDisabled(),true)
  await page.getByRole('checkbox',{name:'Без потерь',exact:true}).uncheck()
  assert.equal(await quality.isEnabled(),true)
  const png=await run(/Только сжать/)
  assert.equal(png.format,'png');assert.equal(png.width,480);assert.equal(png.alpha,true)
  const pngState=await page.evaluate(()=>window.scalego.state())
  assert.equal(pngState.jobs.at(-1).options.lossless,false)
  await page.screenshot({path:path.join(artifacts,'png-compression.png')})
  await page.getByRole('checkbox',{name:'Выбрать все',exact:true}).uncheck()
  await page.getByRole('button',{name:'Выбрать папку',exact:false}).count()
  await page.evaluate(()=>window.scalego.directory())
  await page.waitForTimeout(150)
  assert.equal(await page.getByRole('button',{name:'Обработать',exact:true}).isDisabled(),true)
  await page.getByRole('button',{name:'Светлая тема'}).click()
  await page.waitForTimeout(200); await page.screenshot({path:path.join(artifacts,'workspace-light.png')})
  await desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(940,700))
  await page.screenshot({path:path.join(artifacts,'workspace-small.png')})
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)
  assert.equal(overflow,false)
  assert.deepEqual(errors,[])
  console.log(JSON.stringify({desktop:'passed',modes:3,compression:compressed.bytes,ai:chained.width+'x'+chained.height,alpha:chained.alpha,export:'passed',selection:'passed',smallWindow:'passed',pageErrors:errors},null,2))
 } finally {await desktop.close()}
 await fs.unlink(source)
 const restoredEnv={...env};delete restoredEnv.SCALEGO_SMOKE_INPUT
 const restored=await electron.launch({...launchOptions,env:restoredEnv})
 try {
  const page=await restored.firstWindow();await page.getByText('smoke-source.png',{exact:true}).waitFor()
  const state=await page.evaluate(()=>window.scalego.state())
  assert.equal(state.jobs.filter(j=>j.status==='done').length,jobCount)
  assert.equal(state.assets.length,1)
  console.log('Session restoration after original source removal: passed')
  await page.evaluate(id=>window.scalego.remove(id),state.assets[0].id)
  await page.getByRole('button',{name:'Добавить изображения',exact:true}).waitFor()
  await page.screenshot({path:path.join(artifacts,'workspace-empty.png')})
 } finally {await restored.close()}
})().catch(error=>{console.error(error);process.exitCode=1})
