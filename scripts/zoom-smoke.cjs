const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),sharp=require('sharp')
const {_electron:electron}=require('playwright')
const root=path.resolve(__dirname,'..')
;(async()=>{
 const artifacts=path.join(root,'artifacts');await fs.mkdir(artifacts,{recursive:true})
 const profile=await fs.mkdtemp(path.join(artifacts,'zoom-session-')),source=path.join(profile,'zoom.png')
 await sharp({create:{width:2400,height:1800,channels:3,background:'#b46e46'}}).png().toFile(source)
 const env={...process.env,SCALEGO_TEST_DATA:profile,SCALEGO_SMOKE_INPUT:JSON.stringify([source])};delete env.ELECTRON_RUN_AS_NODE;delete env.SCALEGO_DEV_URL
 const executable=process.argv[2]
 const app=await electron.launch(executable?{executablePath:path.resolve(executable),args:['--user-data-dir='+profile],env}:{args:[root],env})
 try {
  const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message))
  if(executable){
   await page.getByRole('button',{name:'Добавить',exact:true}).waitFor()
   await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]})},source)
   await page.getByRole('button',{name:'Добавить',exact:true}).click()
  }
  const canvas=page.locator('.viewport'),image=page.locator('.image-comparison')
  await image.waitFor()
  const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
  const width=()=>image.evaluate(element=>element.getBoundingClientRect().width)
  const wheel=async delta=>{await page.mouse.wheel(0,delta);await page.waitForTimeout(60);await settle()}
  await settle();const fit=await width();await canvas.hover();await wheel(-120);assert.ok(await width()>fit,'Wheel up zooms in from fit')
  const enlarged=await width();await wheel(120);assert.ok(await width()<enlarged,'Wheel down zooms out')
  await page.getByRole('button',{name:'1:1',exact:true}).click();await settle()
  await canvas.evaluate(el=>{el.scrollLeft=350;el.scrollTop=300})
  const box=await canvas.boundingBox(),cursor={x:box.x+box.width*0.55,y:box.y+box.height*0.55}
  const imagePoint=()=>image.evaluate((el,p)=>{const r=el.getBoundingClientRect();return {u:(p.x-r.left)/r.width,v:(p.y-r.top)/r.height}},cursor)
  await page.mouse.move(cursor.x,cursor.y);const before=await imagePoint();await wheel(-120);const after=await imagePoint()
  assert.ok(Math.abs(before.u-after.u)<0.002&&Math.abs(before.v-after.v)<0.002,'Zoom remains anchored under cursor')
  await page.getByRole('button',{name:'Увеличить масштаб',exact:true}).click();await settle();assert.ok(await width()>2400)
  const plus=await width();await page.getByRole('button',{name:'Уменьшить масштаб',exact:true}).click();await settle();assert.ok(await width()<plus)
  await canvas.hover();for(let i=0;i<5;i++)await wheel(-300);assert.equal(Math.round(await width()),9600,'Maximum zoom remains 400%')
  await page.getByRole('button',{name:'400%',exact:true}).click();await settle();assert.ok(Math.abs(await width()-fit)<2,'Fit resets zoom')
  await canvas.hover();for(let i=0;i<8;i++)await wheel(300);assert.equal(Math.round(await width()),120,'Minimum manual zoom remains 5%')
  const saved=await width();await page.locator('.inspector-scroll').hover();await wheel(-120);assert.equal(await width(),saved,'Scrolling settings does not change image zoom')
  await page.getByRole('button',{name:'5%',exact:true}).click();await settle()
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(940,700));await settle()
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  await page.screenshot({path:path.join(artifacts,'zoom-small.png')})
  assert.deepEqual(errors,[])
  console.log('Zoom smoke passed: real mouse wheel in/out, cursor anchor, +/- and fit, limits, isolated settings scroll, small window, no page errors.')
 } finally {await app.close()}
})().catch(error=>{console.error(error);process.exitCode=1})
