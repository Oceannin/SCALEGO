const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),sharp=require('sharp')
const {_electron:electron}=require('playwright')
const {resolveModel}=require('../electron/models.cjs')
const root=path.resolve(__dirname,'..'),pkg=require('../package.json')
async function wait(page,predicate) {
  const until=Date.now()+120000
  while(true){const state=await page.evaluate(()=>window.scalego.state());if(predicate(state))return state;assert.ok(Date.now()<until,'Model workflow timed out');await page.waitForTimeout(100)}
}
;(async()=>{
  const artifacts=path.join(root,'artifacts/multi-engine');await fs.mkdir(artifacts,{recursive:true})
  const profile=await fs.mkdtemp(path.join(artifacts,'model-session-')),source=path.join(profile,'проверка с пробелом.png')
  await sharp({create:{width:48,height:32,channels:4,background:'#b46e4688'}}).png().toFile(source)
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.SCALEGO_ENGINE_ROOT
  const externalIndex=process.argv.indexOf('--engine-root')
  if(externalIndex!==-1){assert.ok(process.argv[externalIndex+1],'--engine-root requires a directory');env.SCALEGO_ENGINE_ROOT=path.resolve(process.argv[externalIndex+1])}
  const packaged=process.argv.includes('--packaged')
  const desktop=await electron.launch(packaged?{executablePath:path.join(root,pkg.build.directories.output,'win-unpacked/SCALEGO.exe'),args:['--user-data-dir='+profile],env}:{args:[root],env:{...env,SCALEGO_TEST_DATA:profile}})
  try {
    const page=await desktop.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message))
    await page.getByRole('button',{name:'Добавить',exact:true}).waitFor()
    await desktop.evaluate(({dialog},input)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[input]})},source)
    await page.getByRole('button',{name:'Добавить',exact:true}).click()
    await wait(page,state=>state.assets.length===1)
    await page.getByRole('combobox',{name:/^Метод/}).selectOption('ai')
    const catalog=await page.evaluate(()=>window.scalego.engine())
    assert.equal(catalog.models.length,5)
    const labels=await page.getByRole('combobox',{name:/^Желаемый результат/}).locator('option').allTextContents()
    assert.ok(labels.every(label=>!/realesr|realcugan|animevideo/i.test(label)))
    if(packaged&&externalIndex===-1) assert.deepEqual(catalog.models.filter(model=>model.available).map(model=>model.id),['photo-natural','photo-detailed','illustration-clean','illustration-detailed','fast'])
    for(const model of catalog.models) {
      await page.getByRole('radio',{name:/^Увеличить Больше/}).check()
      await page.getByRole('combobox',{name:/^Желаемый результат/}).selectOption(model.id)
      const run=page.getByRole('button',{name:'Обработать',exact:true})
      if(!model.available){assert.equal(await run.isDisabled(),true);await page.getByRole('radio',{name:/Только сжать/}).check();assert.equal(await run.isEnabled(),true);continue}
      await run.click()
      const state=await wait(page,state=>!state.busy&&state.jobs.at(-1)?.options.model===model.id)
      const job=state.jobs.at(-1);assert.equal(job.status,'done',job.error)
      const recipe=JSON.parse(await fs.readFile(path.join(profile,'work',job.id,'recipe.scalego'),'utf8'))
      assert.equal(recipe.inference.model,resolveModel(model.id).name);assert.equal(recipe.output.width,96);assert.equal(recipe.output.height,64)
      assert.ok(!await page.getByText('Параметры изменены — на экране предыдущий результат.',{exact:true}).count())
    }
    await page.getByRole('radio',{name:/^Увеличить Больше/}).check()
    await page.getByRole('combobox',{name:/^Желаемый результат/}).selectOption('illustration-clean')
    await page.screenshot({path:path.join(artifacts,`models-${packaged?'packaged':'development'}${externalIndex===-1?'':'-external'}.png`)})
    for(const [method,scale] of [['nearest',3],['lanczos',4]]) {
      await page.getByRole('combobox',{name:/^Метод/}).selectOption(method)
      await page.getByRole('button',{name:scale+'×',exact:true}).click()
      await page.getByRole('button',{name:'Обработать',exact:true}).click()
      const state=await wait(page,state=>!state.busy&&state.jobs.at(-1)?.options.method===method)
      assert.equal(state.jobs.at(-1).status,'done');assert.equal(state.jobs.at(-1).result.width,48*scale)
    }
    await desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(940,700))
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
    assert.deepEqual(errors,[])
    console.log('Model UI passed: intent labels, routes/recipes, unavailable states, independent compression, Nearest/Lanczos, small window, no page errors. Packaged='+packaged+'; available='+catalog.models.filter(model=>model.available).map(model=>model.id).join(','))
  }finally{await desktop.close()}
})().catch(error=>{console.error(error);process.exitCode=1})
