const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),fallback=root;
const artifacts = path.join(root, 'test-artifacts');
fs.mkdirSync(artifacts, { recursive: true });
const server=http.createServer((req,res)=>{
 const rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/project\//,'');
 if(rel.includes('..')||rel.includes('\\')||rel.startsWith('/'))return res.writeHead(404).end();
 const file=[root,fallback].map(base=>path.join(base,rel)).find(f=>fs.existsSync(f)&&fs.statSync(f).isFile());
 if(!file)return res.writeHead(404).end();
 res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.json':'application/json','.css':'text/css'})[path.extname(file)]||'application/octet-stream');
 fs.createReadStream(file).pipe(res);
});
function mockSDK(){
 const admin={id:'affc8719-3bac-49ce-b251-24106f2929f4',email:'test@example.test'};
 const name=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}.png`;
 const canvas=document.createElement('canvas');canvas.width=100;canvas.height=60;
 canvas.getContext('2d').fillStyle='#54917f';canvas.getContext('2d').fillRect(0,0,100,60);
 const photo=new Promise(r=>canvas.toBlob(r,'image/png'));
 window.mock={user:null,calls:[],downloads:0,fail:true,deleted:false,ghost:false,conflict:false};
 window.supabase={createClient:()=>({
  auth:{onAuthStateChange(){},signInWithPassword:async()=>({data:{user:mock.user=admin}}),getUser:async()=>({data:{user:mock.user}})},
  storage:{from:bucket=>{
   if(bucket!=='gyoda-private-photos')throw Error('Unexpected bucket');
   return {download:async()=>{mock.downloads++;return {data:await photo};},list:async()=>({data:[]})};
  }},
  rpc:async(fn,args)=>{
   if(fn!=='list_spot_photo_inventory')throw Error('Unexpected RPC');
   const items=[
    {bucket:'gyoda-published-photos',uses:['published'],can_cleanup:false},
    {bucket:'gyoda-published-photos',uses:['undo'],can_cleanup:false},
    {bucket:'gyoda-published-photos',uses:[],failed_copy:true,can_cleanup:false,cleanup_after:'2099-01-01T00:00:00Z'},
    ...(!mock.deleted&&!mock.ghost?[{bucket:'gyoda-published-photos',uses:[],failed_copy:true,can_cleanup:true}]:[])
   ].map((row,i)=>({...row,path:args.p_spot_id+'/'+name(i+1),tracked:true,size_bytes:2048,created_at:'2026-10-30'}));
   return {data:{spot_id:args.p_spot_id,offset:args.p_offset,has_more:false,items,
    pending_cleanups:mock.ghost?[{object_name:args.p_spot_id+'/'+name(4),requested_at:'2026-10-30'}]:[]}};
  },
  functions:{invoke:async(fn,{body})=>{
   if(fn!=='cleanup-failed-photo'||!body.confirm_delete||!body.object_path.endsWith(name(4)))throw Error('Unexpected cleanup');
   mock.calls.push({fn,body});
   if(mock.conflict)return {error:{context:{status:409}}};
   if(mock.fail)return {error:{context:{status:503}}};
   mock.deleted=true;mock.ghost=false;return {data:{status:'completed',object_path:body.object_path}};
  }}
 })};
}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({executablePath:(process.env.CHROME_PATH || undefined),headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addInitScript(mockSDK);
  await context.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:')?r.continue():r.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/project/editor.html`);
  await page.locator('#editor-layout').waitFor({state:'visible'});
  await page.fill('#cloud-email','test@example.test');await page.fill('#cloud-password','test');await page.click('#cloud-signin');
  await page.click('#photo-inventory-refresh');
  await page.waitForFunction(()=>document.querySelectorAll('#photo-inventory-list li').length===4);
  assert.equal(await page.locator('#photo-inventory-list button').count(),1);
  await page.locator('#photo-inventory-list button').click();await page.locator('#photo-delete-dialog').waitFor({state:'visible'});
  assert.ok(await page.locator('#photo-delete-confirm').isDisabled());
  assert.ok(await page.locator('#photo-delete-image').isHidden());
  assert.match(await page.locator('#photo-delete-title').innerText(),/公開失敗/);
  assert.match(await page.locator('#photo-inventory-list').innerText(),/2099/);
  assert.equal(await page.evaluate(()=>mock.calls.length),0);
  await page.click('#photo-delete-cancel');assert.equal(await page.evaluate(()=>mock.calls.length),0);
  await page.locator('#photo-inventory-list button').click();await page.locator('#photo-delete-dialog').waitFor({state:'visible'});
  await page.screenshot({path:path.join(artifacts, 'cleanup-desktop.png')});
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(artifacts, 'cleanup-mobile.png')});
  await page.check('#photo-delete-ack');await page.click('#photo-delete-confirm');
  await page.waitForFunction(()=>document.querySelector('#photo-delete-status').dataset.error==='true');
  assert.ok(await page.locator('#photo-delete-dialog').isVisible());
  await page.evaluate(()=>mock.fail=false);await page.click('#photo-delete-confirm');
  await page.waitForFunction(()=>document.querySelector('#private-photo-status').textContent.includes('公開失敗のコピーを整理しました'));
  const calls=await page.evaluate(()=>mock.calls);assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);
  assert.equal(await page.locator('#photo-inventory-list button').count(),0);
  // Recover a pending deletion whose file no longer appears in Storage.
  await page.evaluate(()=>mock.ghost=true);await page.click('#photo-inventory-refresh');
  await page.getByRole('button',{name:'コピー整理を再確認',exact:true}).click();
  await page.locator('#photo-delete-dialog').waitFor({state:'visible'});
  assert.ok(await page.locator('#photo-delete-image').isHidden());
  const downloads=await page.evaluate(()=>mock.downloads);
  await page.check('#photo-delete-ack');await page.click('#photo-delete-confirm');
  await page.waitForFunction(()=>mock.calls.length===3&&!document.querySelector('#photo-delete-dialog').open);
  assert.equal(await page.evaluate(()=>mock.downloads),downloads);
  await page.evaluate(()=>{mock.deleted=false;mock.conflict=true;});await page.click('#photo-inventory-refresh');
  await page.getByRole('button',{name:'整理前に確認',exact:true}).click();await page.check('#photo-delete-ack');await page.click('#photo-delete-confirm');
  await page.waitForFunction(()=>document.querySelector('#photo-delete-status').textContent.includes('使用中'));
  assert.equal(await page.evaluate(()=>mock.deleted),false);
  await page.click('#photo-delete-cancel');assert.deepEqual(errors,[]);
  assert.equal(await page.evaluate(()=>mock.downloads),0);
  console.log('PASS: cleanup protection, cooldown label, cancellation, checkbox, same-target retry, ghost recovery, conflict, private storage untouched, desktop/mobile (mocked only).');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
