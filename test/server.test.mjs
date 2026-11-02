import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { createViewer, validateSource } from '../lib/viewer.mjs';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const source = 'flowchart LR\n User["Person"] --> App["Application"]\n App --> DB[("Data")]';
function raw(url, options = {}) { return new Promise((resolve, reject) => {
  const r = request(url, options, res => { let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,body,headers:res.headers})); });
  r.on('error',reject);r.end();
}); }
test('bounded flowchart preflight refuses HTML, directives and unsupported families', () => {
  assert.deepEqual(validateSource(source), { nodes: 3, connections: 2 });
  for (const invalid of ['', 'x'.repeat(30001),'sequenceDiagram\nA->>B: hello','flowchart LR\nA[<img src=x>] --> B','flowchart LR\nA --> B\nclick A "https://example.org"','flowchart LR\nA --> B\nclassDef foo fill:red']) assert.throws(()=>validateSource(invalid));
});
test('private loopback viewer restricts host, origin, methods and paths', async () => {
  const viewer=await createViewer();
  try {
    const result=viewer.add({source,title:'Architecture'});const url=new URL(result.url);const base=new URL('../',url);
    assert.equal((await raw(url)).status,200);
    assert.equal((await raw(url,{headers:{Host:'attacker.example'}})).status,403);
    assert.equal((await raw(url,{headers:{Origin:'https://attacker.example'}})).status,403);
    assert.equal((await raw(url,{method:'POST'})).status,405);
    assert.equal((await raw(new URL('/package.json',url))).status,404);
    assert.equal((await raw(new URL('renderer/%2e%2e/%2e%2e/package.json',base))).status,404);
    assert.equal((await raw(new URL('source/'+url.pathname.split('/').at(-1),base))).status,200);
    assert.equal((await raw(new URL('/wrong/diagram/'+url.pathname.split('/').at(-1),url))).status,404);
    const assets=await raw(new URL('renderer/clear-mermaid.js',base));assert.equal(assets.status,200);assert.match(assets.headers['content-security-policy'],/connect-src 'self'/);
    for(let i=1;i<20;i++)viewer.add({source});assert.throws(()=>viewer.add({source}),/20 diagrams/);
  } finally {await viewer.close();}
});
test('real stdio MCP client discovers and calls the connector', async () => {
 const client=new Client({name:'clear-mermaid-check',version:'1.0.0'});
 const transport=new StdioClientTransport({command:process.execPath,args:['bin/clear-mermaid.mjs'],stderr:'pipe'});
 try {
  await client.connect(transport);const tools=await client.listTools();assert.equal(tools.tools.length,1);assert.equal(tools.tools[0].name,'clear_mermaid_render');
  const result=await client.callTool({name:'clear_mermaid_render',arguments:{source,title:'Architecture'}});assert.equal(result.isError,undefined);assert.equal(result.structuredContent.nodes,3);assert.equal((await fetch(result.structuredContent.url)).status,200);
  const bad=await client.callTool({name:'clear_mermaid_render',arguments:{source:'sequenceDiagram\nA->>B:Hi'}});assert.equal(bad.isError,true);
 } finally {await client.close();}
});
