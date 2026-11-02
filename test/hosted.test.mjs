import test from 'node:test';
import assert from 'node:assert/strict';
import { createClearMermaidHandler, RESOURCE_URI } from '../lib/hosted.mjs';
const origin='https://hyperdrift.io';
const handler=createClearMermaidHandler();
const headers={ 'Content-Type':'application/json',Accept:'application/json, text/event-stream',Host:'hyperdrift.io' };
const rpc=(method,params={},id=1)=>new Request(origin+'/api/clear-mermaid/mcp',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id,method,params})});
const source='flowchart LR\n A["Request"] --> B{"Complete?"}\n B -->|Yes| C["Review"]\n B -->|No| D["Ask for details"]\n D --> B';
test('HTTP initialize, tool discovery, call and MCP App resource',async()=>{
 let r=await handler(rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'test',version:'1.0'}}));assert.equal(r.status,200);let d=await r.json();assert.equal(d.result.serverInfo.name,'clear-mermaid');
 r=await handler(rpc('tools/list'));d=await r.json();assert.equal(d.result.tools.length,1);const t=d.result.tools[0];assert.equal(t._meta.ui.resourceUri,RESOURCE_URI);assert.equal(t.annotations.readOnlyHint,true);assert.deepEqual(t._meta.securitySchemes,[{type:'noauth'}]);
 r=await handler(rpc('tools/call',{name:'clear_mermaid_render',arguments:{source,title:'Decision'}}));d=await r.json();assert.equal(d.result.isError,undefined);assert.equal(d.result.structuredContent.nodes,4);assert.equal(d.result.structuredContent.connections,4);assert.deepEqual(JSON.parse(decodeURIComponent(new URL(d.result.structuredContent.url).hash.slice(1))),{source,title:'Decision'});
 r=await handler(rpc('resources/list'));d=await r.json();assert.equal(d.result.resources[0].uri,RESOURCE_URI);
 r=await handler(rpc('resources/read',{uri:RESOURCE_URI}));d=await r.json();const html=d.result.contents[0];assert.equal(html.mimeType,'text/html;profile=mcp-app');assert.deepEqual(html._meta.ui.csp.connectDomains,[]);assert.deepEqual(html._meta.ui.csp.resourceDomains,[origin]);assert.match(html.text,/data-renderer="https:\/\/hyperdrift.io\/vendor\/clear-mermaid\/"/);assert.match(html.text,/ui\/initialize/);assert.ok(html.text.length<400000);
});
test('HTTP refusal and protocol errors remain bounded',async()=>{
 for(const bad of ['sequenceDiagram\n A->>B: Hi','flowchart LR\n A[<img src=x>] --> B','flowchart LR\n A --> B\n click A "https://example.org"']) {
  const d=await(await handler(rpc('tools/call',{name:'clear_mermaid_render',arguments:{source:bad}}))).json();assert.equal(d.result.isError,true);
 }
 assert.equal((await handler(new Request(origin+'/api/clear-mermaid/mcp'))).status,405);
 assert.equal((await handler(new Request(origin,{method:'POST',headers:{...headers,Origin:'https://evil.test'},body:'{}'}))).status,403);
 assert.equal((await handler(new Request(origin,{method:'POST',headers:{...headers,Host:'evil.test'},body:'{}'}))).status,403);
 assert.equal((await handler(new Request(origin,{method:'POST',headers:{...headers,'Content-Type':'text/plain'},body:'{}'}))).status,415);
 assert.equal((await handler(new Request(origin,{method:'POST',headers,body:'x'.repeat(65537)}))).status,413);
 assert.equal((await handler(new Request(origin,{method:'POST',headers,body:'{broken'}))).status,400);
 const d=await(await handler(rpc('tools/call',{name:'unknown',arguments:{}}))).json();assert.ok(d.error);
 const r=await handler(new Request(origin,{method:'OPTIONS',headers:{Origin:'https://chatgpt.com'}}));assert.equal(r.status,204);assert.equal(r.headers.get('access-control-allow-origin'),'https://chatgpt.com');assert.equal(r.headers.get('cache-control'),'no-store');
});
test('slow request bodies time out and do not hold concurrency',async()=>{
 const stalled=new Request(origin,{method:'POST',headers,body:new ReadableStream({start(){},cancel(){return new Promise(()=>{});}}),duplex:'half'});
 const r=await handler(stalled);assert.equal(r.status,408);
 assert.equal((await handler(rpc('tools/list'))).status,200);
});

test('concurrent slow uploads are capped and capacity returns',async()=>{
 const limited=createClearMermaidHandler();const controllers=[];
 const held=Array.from({length:8},()=>limited(new Request(origin,{method:'POST',headers,body:new ReadableStream({start(c){controllers.push(c);}}),duplex:'half'})));
 assert.equal((await limited(rpc('tools/list'))).status,429);
 controllers.forEach(c=>{c.enqueue(new TextEncoder().encode('{}'));c.close();});await Promise.all(held);
 assert.equal((await limited(rpc('tools/list'))).status,200);
});
