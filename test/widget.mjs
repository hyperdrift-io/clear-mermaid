import { chromium } from '@playwright/test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createClearMermaidHandler, RESOURCE_URI } from '../lib/hosted.mjs';
import { build } from 'vite';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const bundle=await build({configFile:false,logLevel:'silent',build:{write:false,lib:{entry:'test/widget-host.mjs',formats:['es']}}});
const harness=(Array.isArray(bundle)?bundle[0]:bundle).output.find(o=>o.type==='chunk').code;
let handler;
const server=createServer(async(req,res)=>{
 try {
 const url=new URL(req.url,origin);
 if(url.pathname==='/api/clear-mermaid/mcp'){
  const response=await handler(new Request(url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:req,duplex:'half'}:{})}));
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
 }
 if(url.pathname.startsWith('/vendor/clear-mermaid/') && !url.pathname.includes('..')){
  const bytes=await readFile(new URL('../renderer/dist/'+url.pathname.slice('/vendor/clear-mermaid/'.length),import.meta.url));res.writeHead(200,{'Content-Type':url.pathname.endsWith('.css')?'text/css':'text/javascript','Access-Control-Allow-Origin':'*'});res.end(bytes);return;
 }
 res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><html><body style="margin:0"><iframe title="Diagram" sandbox="allow-scripts" style="width:100%;height:1100px;border:0"></iframe></body></html>');
 }catch(e){res.writeHead(500);res.end('Test host failed');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
handler=createClearMermaidHandler({publicOrigin:origin,rendererBaseUrl:origin+'/vendor/clear-mermaid/',fallbackUrl:origin+'/clear-mermaid/view'});
const client=new Client({name:'clear-mermaid-widget-check',version:'1.0'});
const browser=await chromium.launch({channel:'chrome'});
const source='flowchart LR\n Client["Browser"] --> API["API"]\n API --> Auth{"Signed in?"}\n Auth -->|Yes| DB[("Database")]\n Auth -->|No| Login["Sign in"]\n Login --> Auth';
const errors=[],requests=[];let nestedElapsedMs;
try {
 await client.connect(new StreamableHTTPClientTransport(new URL(origin+'/api/clear-mermaid/mcp')));
 const result=await client.callTool({name:'clear_mermaid_render',arguments:{source,title:'Architecture in chat'}});
 assert.ok(!result.isError);
 const {contents}=await client.readResource({uri:RESOURCE_URI});
 for(const width of [1440,375]){
  const page=await browser.newPage({viewport:{width,height:1200}});page.on('pageerror',e=>{errors.push(e.message);console.log('PAGEERROR',e.message)});page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text())});page.on('request',r=>requests.push({url:r.url(),method:r.method()}));
  await page.goto(origin);await page.addScriptTag({content:harness,type:'module'});await page.waitForFunction(()=>typeof window.mount==='function');
  await page.evaluate(({html,result})=>window.mount(html,result),{html:contents[0].text.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' ${origin}; style-src 'unsafe-inline' ${origin}; img-src data: ${origin}; font-src ${origin}; connect-src 'none'; frame-src 'none'; worker-src 'none';">`),result});
  const frame=page.frameLocator('iframe');try{await frame.locator('mermaid-reader .node').first().waitFor({timeout:15000});}catch(e){console.log('STATUS',await frame.locator('body').innerText());throw e;}
  await frame.locator('#status').filter({hasText:/./}).waitFor({state:'hidden'});
  assert.equal(await frame.locator('mermaid-reader').evaluate(r=>r.graph.nodes.length),5);
  assert.equal(await frame.locator('mermaid-reader').evaluate(r=>r.graph.edges.length),5);
  assert.equal(await frame.locator('body').evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await frame.getByRole('button',{name:'Open full diagram'}).click();await page.waitForFunction(()=>window.openedLink);assert.equal(await page.evaluate(()=>window.openedLink),result.structuredContent.url);
  await page.evaluate(()=>window.bridge.setHostContext({theme:'dark'}));await frame.locator('html').evaluate(e=>new Promise(resolve=>{let n=0;const t=setInterval(()=>{if(e.style.colorScheme==='dark'||n++>50){clearInterval(t);resolve();}},10);}));assert.equal(await frame.locator('html').evaluate(e=>e.style.colorScheme),'dark');
  await page.evaluate(()=>window.bridge.setHostContext({theme:'light'}));
  await mkdir('.evidence',{recursive:true});await frame.locator('body').screenshot({path:`.evidence/hosted-widget-${width}.png`});
  if(width===1440) {
   const nested='flowchart LR\nsubgraph platform[Platform]\n'+Array.from({length:3},(_,g)=>`subgraph group${g}[Service ${g+1}]\n`+Array.from({length:8},(_,i)=>`N${g*8+i}[Step ${g*8+i+1}]`).join('\n')+'\nend').join('\n')+'\nend\n'+Array.from({length:23},(_,i)=>`N${i} --> N${i+1}`).join('\n')+'\nN20 --> N8';
   const complex=await client.callTool({name:'clear_mermaid_render',arguments:{source:nested,title:'Nested services'}});assert.ok(!complex.isError);
   const start=performance.now();await page.evaluate(r=>window.bridge.sendToolResult(r),complex);
   await frame.locator('mermaid-reader .node').nth(23).waitFor();await frame.locator('#status').filter({hasText:/./}).waitFor({state:'hidden'});
   nestedElapsedMs=Math.round(performance.now()-start);assert.ok(nestedElapsedMs<10000);
  }
  // Multiple results must leave only the most recent diagram and status.
  await page.evaluate(async(result)=>{await window.bridge.sendToolResult(result);await window.bridge.sendToolResult({isError:true,content:[{type:'text',text:'Unsupported'}]});},result);
  await frame.locator('#status[role=alert]').waitFor();assert.equal(await frame.locator('mermaid-reader').count(),0);
  await page.close();
 }
 assert.deepEqual(errors,[]);assert.ok(requests.every(r=>r.method==='GET'&&(r.url.startsWith(origin)||r.url.startsWith('blob:'))&&!r.url.includes('Browser')));
 await writeFile('.evidence/hosted-widget.json',JSON.stringify({date:new Date().toISOString(),transport:'real Streamable HTTP MCP client',widget:'official MCP Apps AppBridge, sandbox iframe',widths:[1440,375],nodes:5,connections:5,theme:true,openLink:true,staleResult:true,sourceInRequests:false,nested24NodesElapsedMs:nestedElapsedMs,pageErrors:errors,requests:requests.length},null,2));
 console.log('HTTP MCP → official MCP Apps bridge → sandbox widget passed at 1440/375; 5 nodes/5 edges, theme, link, stale result, no source network requests.');
}finally{await browser.close();await client.close();server.close();}
