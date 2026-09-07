const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os')
const { MODELS, planUpscale, resolveModel } = require('../electron/models.cjs')
const { command, runProcess, checkFiles, redact, createNativeRunner } = require('../electron/engine.cjs')
const { classifyFailure, EngineError } = require('../electron/engine-errors.cjs')
const { validateOptions } = require('../electron/contracts.cjs')
test('intent routing and legacy session defaults preserve model identity', () => {
  const expected = { 'photo-natural': 'realesrnet-x4plus', 'photo-detailed': 'realesrgan-x4plus', 'illustration-clean': 'realcugan-se', 'illustration-detailed': 'realesrgan-x4plus-anime', fast: 'realesr-animevideov3' }
  for (const [id, name] of Object.entries(expected)) assert.equal(resolveModel(id).name, name)
  assert.equal(resolveModel('illustration').id, 'fast'); assert.equal(resolveModel('photo').id, 'photo-detailed')
  assert.equal(resolveModel().id, 'fast')
  const options = { mode: 'upscale', method: 'ai', scale: 2, format: 'webp', quality: 85, lossless: false, background: '#ffffff' }
  assert.equal(validateOptions(options).model, 'illustration')
  for (const model of ['../model', '__proto__', null, {}, 1]) assert.throws(() => validateOptions({ ...options, model }))
})
test('native scale and command adapters use one GPU process and correct model files', () => {
  for (const model of MODELS) for (const scale of [2, 3, 4]) {
    const plan = planUpscale(model.id, scale)
    assert.equal(plan.nativeScale, model.nativeScales.includes(scale) ? scale : 4)
    assert.equal(Boolean(plan.intermediateResize), plan.nativeScale !== scale)
    const cmd = command('C:/engine', plan, 'C:/личное/input with spaces.png', 'C:/out/output.png', 128)
    assert.equal(cmd.args[1], 'C:/личное/input with spaces.png')
    assert.equal(cmd.args[cmd.args.indexOf('-j') + 1], '1:1:1')
    assert.equal(cmd.args[cmd.args.indexOf('-s') + 1], String(plan.nativeScale))
    assert.equal(cmd.args[cmd.args.indexOf('-n') + 1], model.engine === 'realcugan' ? '3' : model.name)
    assert.ok(plan.modelFiles.every(file => require('../electron/native-artifacts.json').files[file]))
  }
})
test('native error categories are actionable and retain diagnostics separately', () => {
  for (const [input, expected] of [
    [{error:'ENOENT'},'ENGINE_UNAVAILABLE'], [{code:3221225781},'ENGINE_UNAVAILABLE'],
    [{log:'vkCreateInstance failed -7'},'VULKAN_UNAVAILABLE'], [{log:'vkAllocateMemory failed'},'OUT_OF_MEMORY'],
    [{log:'load_param invalid'},'MODEL_CORRUPTED'], [{log:'_wfopen x.bin failed'},'MODEL_MISSING'],
    [{log:'decode image failed'},'UNSUPPORTED_IMAGE'], [{code:1},'PROCESS_FAILED'],
    [{aborted:true,code:1},'CANCELLED'], [{timedOut:true},'UNEXPECTED_ENGINE_ERROR'],
  ]) { assert.equal(classifyFailure(input),expected); assert.match(new EngineError(expected).message, /[А-Яа-я]/); assert.doesNotMatch(new EngineError(expected).message, /vkCreateInstance|load_param/) }
  assert.equal(redact('C:/private/photo.png C:/private', ['C:/private/photo.png','C:/private']), '<path> <path>')
})
test('actual child process exit, missing executable, bounded logs, timeout and cancellation', async () => {
  const fail = await runProcess(process.execPath, ['-e', 'process.stderr.write("failure");process.exit(7)'])
  assert.equal(fail.code, 7); assert.equal(fail.log, 'failure')
  assert.equal((await runProcess(path.join(os.tmpdir(),'scalego-no-such-executable'), [])).error, 'ENOENT')
  const bounded = await runProcess(process.execPath, ['-e', 'process.stderr.write("x".repeat(20000))'])
  assert.equal(bounded.log.length,8192)
  const timed = await runProcess(process.execPath, ['-e','setInterval(()=>{},1000)'], {timeoutMs:100})
  assert.equal(timed.timedOut,true)
  const controller = new AbortController()
  const running = runProcess(process.execPath, ['-e','setInterval(()=>{},1000)'], {signal:controller.signal})
  setTimeout(()=>controller.abort(),100)
  assert.equal((await running).aborted,true)
})
test('missing and corrupted model checks are independent of unrelated engines', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'scalego-engine-check-'))
  t.after(()=>fs.rm(root,{recursive:true,force:true}))
  const plan = planUpscale('fast',2)
  await assert.rejects(checkFiles(root,plan),{code:'ENGINE_UNAVAILABLE'})
  await fs.writeFile(path.join(root,plan.engine.executable),'placeholder')
  await assert.rejects(checkFiles(root,plan),{code:'MODEL_MISSING'})
  await fs.mkdir(path.join(root,'models'))
  for(const file of plan.modelFiles) await fs.writeFile(path.join(root,file),'corrupt')
  await checkFiles(root,plan)
  await assert.rejects(checkFiles(root,plan,true),{code:'ENGINE_UNAVAILABLE'})
  // Use the official binary if installed, then verify corrupted weights.
  try { await fs.copyFile(path.resolve('runtime',plan.engine.executable),path.join(root,plan.engine.executable)) } catch { return }
  await assert.rejects(checkFiles(root,plan,true),{code:'MODEL_CORRUPTED'})
})
test('OOM retries are serial, bounded, logged and stop for non-memory failures', async t => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'scalego-retry-'));t.after(()=>fs.rm(root,{recursive:true,force:true}))
  for(const model of ['fast','illustration-clean']) {
    const tiles=[],logs=[];let active=0
    const run=createNativeRunner({verify:async()=>{},execute:async(_exe,args)=>{
      assert.equal(active++,0,'No concurrent native retries')
      tiles.push(Number(args[args.indexOf('-t')+1]));await new Promise(resolve=>setTimeout(resolve,1));active--
      return {code:tiles.length<3?1:0,log:tiles.length<3?'vkAllocateMemory failed':''}
    }})
    await run(root,'input',path.join(root,'output'),2,()=>{},undefined,model,{log:async entry=>logs.push(entry)})
    assert.deepEqual(tiles,[256,128,64]);assert.equal(logs.length,3)
    let calls=0
    const fail=createNativeRunner({verify:async()=>{},execute:async()=>{calls++;return {code:1,log:'vkCreateInstance failed -7'}}})
    await assert.rejects(fail(root,'input',path.join(root,'output'),2,()=>{},undefined,model),{code:'VULKAN_UNAVAILABLE'})
    assert.equal(calls,1)
    calls=0
    const oom=createNativeRunner({verify:async()=>{},execute:async()=>{calls++;return {code:1,log:'out of memory'}}})
    await assert.rejects(oom(root,'input',path.join(root,'output'),2,()=>{},undefined,model),{code:'OUT_OF_MEMORY'})
    assert.equal(calls,4)
  }
})
