const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname,'..');
const fallback = root;
const artifacts = path.join(root, 'test-artifacts');
fs.mkdirSync(artifacts, { recursive: true });
const server = http.createServer((req,res)=>{
  const rel = decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/project\//,'');
  if(rel.includes('..') || rel.includes('\\') || rel.startsWith('/')) return res.writeHead(404).end();
  const file = [root,fallback].map(base=>path.join(base,rel)).find(file=>fs.existsSync(file) && fs.statSync(file).isFile());
  if(!file) return res.writeHead(404).end();
  res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html; charset=utf-8','.json':'application/json','.css':'text/css'})[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
function mockSDK(){
  const admin={id:'affc8719-3bac-49ce-b251-24106f2929f4',email:'test@example.test'};
  const filename='11111111-1111-4111-8111-111111111111.png';
  const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;
  canvas.getContext('2d').fillRect(0,0,32,32);
  const blobPromise=new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  window.mock={user:null,choices:{},calls:[],rpc:[],fail:true};
  window.supabase={createClient:()=>({
    auth:{onAuthStateChange(){},signInWithPassword:async()=>({data:{user:mock.user=admin}}),getUser:async()=>({data:{user:mock.user}})},
    storage:{from:()=>({list:async()=>({data:[{name:filename,created_at:'2026-10-30'}]}),download:async()=>({data:await blobPromise})})},
    from(table){
      let id,rev,action,values;
      const q={select(){return q;},eq(key,value){if(key==='spot_id')id=value;if(key==='revision')rev=value;return q;},
        insert(value){action='insert';values=value;id=value.spot_id;return q;},update(value){action='update';values=value;return q;},
        async maybeSingle(){
          if(table==='spot_photo_drafts'){
            if(action){if(action==='update' && rev!==mock.choices[id].revision)return {data:null};mock.choices[id]={spot_id:id,object_name:values.object_name,revision:(mock.choices[id]?.revision||0)+1};}
            return {data:mock.choices[id]||null};
          }
          if(table==='spot_content_drafts')return {data:{spot_id:id,name:'Test spot',description:'Saved description',photo:'',youtube:'',youtube2:'',homepage:''}};
          if(table==='spot_publication_state')return {data:{spot_id:id,revision:0,undo_available:true,previous_content:null}};
          return {data:null};
        }};return q;
    },
    functions:{invoke:async(name,{body})=>{mock.calls.push({name,body});return mock.fail ? {error:{message:'Network error'}} : {data:{status:'completed',result:{spot_id:body.spot_id,revision:1}}};}},
    rpc:async(name,args)=>{mock.rpc.push({name,args});return {data:{spot_id:args.p_spot_id}};}
  })};
}
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
  try{
    browser=await chromium.launch({executablePath:(process.env.CHROME_PATH || undefined),headless:true});
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    await context.addInitScript(mockSDK);
    await context.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:')?route.continue():route.abort());
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/project/editor.html`);
    await page.locator('#spot-select option').nth(1).waitFor({state:'attached'});
    await page.fill('#cloud-email','test@example.test');await page.fill('#cloud-password','test-password');await page.click('#cloud-signin');
    await page.click('#private-photo-refresh');await page.selectOption('#private-photo-list',{index:1});
    await page.waitForFunction(()=>!document.getElementById('private-photo-choose').disabled);
    await page.click('#private-photo-choose');
    await page.waitForFunction(()=>document.getElementById('private-photo-status').textContent.includes('公開候補を保存'));
    assert.equal(await page.evaluate(()=>mock.calls.length),0);
    await page.click('#publication-review');await page.locator('#publication-dialog').waitFor({state:'visible'});
    assert.match(await page.locator('#publication-card img').first().getAttribute('src'),/^blob:/);
    assert.equal(await page.evaluate(()=>mock.calls.length),0);
    await page.screenshot({path:path.join(artifacts, 'photo-review-desktop.png')});
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:path.join(artifacts, 'photo-review-mobile.png')});
    await page.click('#publication-confirm');
    await page.waitForFunction(()=>document.getElementById('cloud-status').textContent.includes('再試行'));
    await page.evaluate(()=>mock.fail=false);await page.click('#publication-confirm');
    await page.waitForFunction(()=>document.getElementById('cloud-status').textContent.includes('写真とカードを公開しました'));
    const calls=await page.evaluate(()=>mock.calls);
    assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);assert.equal(calls[0].name,'publish-spot-photo');
    assert.equal(calls[0].body.expected_draft.photo,'');
    await page.click('#private-photo-use-url');
    await page.waitForFunction(()=>document.getElementById('private-photo-status').textContent.includes('指定に戻しました'));
    await page.click('#publication-review');await page.locator('#publication-dialog').waitFor({state:'visible'});
    await page.click('#publication-confirm');
    await page.waitForFunction(()=>mock.rpc.length===1);
    assert.equal(await page.evaluate(()=>mock.rpc[0].name),'publish_spot_card');
    await page.click('#publication-undo');await page.locator('#publication-dialog').waitFor({state:'visible'});await page.click('#publication-confirm');
    await page.waitForFunction(()=>mock.rpc.length===2);
    assert.equal(await page.evaluate(()=>mock.rpc[1].name),'undo_spot_publication');
    assert.deepEqual(errors,[]);
    console.log('PASS: choice stays private, Blob review, explicit publication, identical retry, URL fallback, undo, desktop/mobile, no page errors (mocked Supabase).');
  }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
