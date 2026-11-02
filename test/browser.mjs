import { chromium } from '@playwright/test';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const client=new Client({name:'clear-mermaid-browser-check',version:'1.0.0'});
const transport=new StdioClientTransport({command:process.execPath,args:['bin/clear-mermaid.mjs'],stderr:'pipe'});
const browser=await chromium.launch({channel:'chrome'});
const source='flowchart LR\n Client["Browser"] --> API["API"]\n API --> Auth{"Signed in?"}\n Auth -->|Yes| DB[("Database")]\n Auth -->|No| Login["Sign in"]\n Login --> Auth';
const errors=[], external=[];
try {
 await client.connect(transport);
 const result=await client.callTool({name:'clear_mermaid_render',arguments:{source,title:'Example architecture'}});
 assert.ok(!result.isError,JSON.stringify(result));
 for(const width of [1440,375]) {
  const page=await browser.newPage({viewport:{width,height:1000}});page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(new URL(result.structuredContent.url).origin))external.push(r.url());});
  await page.goto(result.structuredContent.url);await page.waitForSelector('mermaid-reader .node',{timeout:20000});
  const data=await page.locator('mermaid-reader').evaluate(r=>({nodes:r.graph.nodes.length,edges:r.graph.edges.length,overflow:document.documentElement.scrollWidth>innerWidth}));
  assert.equal(data.nodes,5);assert.equal(data.edges,5);assert.equal(data.overflow,false);assert.equal(await page.locator('#status').innerText(),'');
  await mkdir('.evidence',{recursive:true});
  await page.screenshot({path:`.evidence/architecture-diagram-${width}.png`,fullPage:true});
  await page.locator('mermaid-reader .explore-tools summary').click();await page.getByRole('button',{name:'Read relationships',exact:true}).click();await page.getByRole('button',{name:'Expand every step',exact:true}).click();assert.equal(await page.locator('mermaid-reader .reading-list > li').count(),5);
  await mkdir('.evidence',{recursive:true});await page.screenshot({path:`.evidence/architecture-${width}.png`,fullPage:true});await page.close();
 }
 const bad=await client.callTool({name:'clear_mermaid_render',arguments:{source:'flowchart LR\nA ~~~ B',title:'Unsupported edge'}});
 if(!bad.isError){const page=await browser.newPage();await page.goto(bad.structuredContent.url);await page.waitForSelector('#status[role=alert]');assert.equal(await page.locator('mermaid-reader').count(),0);await page.close();}
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 await writeFile('.evidence/browser.json',JSON.stringify({date:new Date().toISOString(),mcp:'real stdio client',widths:[1440,375],nodes:5,edges:5,relationshipReading:true,unsupportedEdgeRefused:true,pageErrors:errors,externalRequests:external},null,2)+'\n');
 console.log('MCP call → browser: desktop/mobile,5nodes/5edges,relationship reading and unsupported-edge refusal passed; no external requests.');
} finally {await browser.close();await client.close();}
