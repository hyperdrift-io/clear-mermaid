import { McpServer, WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server';
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import * as z from 'zod/v4';
import { validateSource } from './source.mjs';
import { widgetHtml } from './widget-html.mjs';

export const RESOURCE_URI = 'ui://clear-mermaid/v0.2.0.html';
const BODY_LIMIT = 65536;
const RESPONSE_LIMIT = 1048576;
const BODY_TIMEOUT = 5000;
function configuredUrl(value, name) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1','localhost','[::1]'].includes(url.hostname)))) throw new Error(`${name} must use HTTPS (or loopback HTTP for tests), without credentials, query or fragment.`);
  return url;
}
function createServer({ publicOrigin, rendererBaseUrl, fallbackUrl }) {
  const server = new McpServer({ name: 'clear-mermaid', version: '0.2.0' });
  const ui = {
    prefersBorder: true,
    domain: publicOrigin,
    csp: { connectDomains: [], resourceDomains: [new URL(rendererBaseUrl).origin], frameDomains: [] },
  };
  const html = widgetHtml.replace('__CLEAR_MERMAID_RENDERER__', rendererBaseUrl.replaceAll('&','&amp;').replaceAll('"','&quot;'));
  registerAppResource(server, 'clear-mermaid-diagram', RESOURCE_URI, { mimeType: RESOURCE_MIME_TYPE, description: 'Interactive Mermaid flowchart with step selection and relationship reading.', _meta: { ui } }, async () => ({ contents: [{ uri: RESOURCE_URI, mimeType: RESOURCE_MIME_TYPE, text: html, _meta: { ui, 'openai/widgetDescription': 'Clear Mermaid diagram. Users can inspect steps and relationships; the browser validates its supported Mermaid flowchart subset before drawing.', 'openai/widgetCSP': { connect_domains: [], resource_domains: [new URL(rendererBaseUrl).origin] }, 'openai/widgetDomain': publicOrigin, 'openai/widgetPrefersBorder': true } }] }));
  registerAppTool(server, 'clear_mermaid_render', {
    title: 'Draw an interactive Mermaid diagram',
    description: 'Prepare a Mermaid flowchart for the interactive Clear Mermaid view in this chat. Use for architecture, decisions, dependencies and retry paths. Use plain labels and explicit directed connections. The browser verifies supported syntax before drawing. No account, files, saved diagrams or external AI calls. A fallback link carries the diagram in its fragment; share that link only when the diagram may be shared. Do not claim visual verification before inspecting the rendered view.',
    inputSchema: z.object({ source: z.string().min(1).max(30000), title: z.string().min(1).max(160).optional() }),
    outputSchema: z.object({ source: z.string(), title: z.string(), nodes: z.number(), connections: z.number(), url: z.string(), validation: z.string() }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { securitySchemes: [{ type:'noauth' }], ui: { resourceUri: RESOURCE_URI }, 'openai/outputTemplate': RESOURCE_URI, 'openai/toolInvocation/invoking': 'Preparing diagram…', 'openai/toolInvocation/invoked': 'Diagram ready to view' },
  }, async ({ source, title = 'Your diagram' }) => {
    try {
      const counts = validateSource(source);
      const url = `${fallbackUrl}#${encodeURIComponent(JSON.stringify({ source, title })).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
      const result = { source, title, ...counts, url, validation: 'Preflight passed. The interactive view checks compatibility before drawing.' };
      return { structuredContent: result, content: [{ type:'text', text: `The diagram is ready for the interactive view. [Open the full diagram](${url}) if this chat does not show it. The link contains the diagram source; no diagram is stored on the rendering service.` }] };
    } catch(error) { return { isError:true, content:[{ type:'text', text:error.message || 'Use a supported Mermaid flowchart with plain labels and explicit connections.' }] }; }
  });
  return server;
}
async function boundedBody(request) {
  const length = Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > BODY_LIMIT) throw Object.assign(new Error('Request exceeds 64 KiB.'), {status:413});
  if (!request.body) throw Object.assign(new Error('Send a JSON-RPC request.'), {status:400});
  const reader = request.body.getReader();
  let timer;
  const deadline = new Promise((_,reject) => { timer=setTimeout(() => reject(Object.assign(new Error('Request body timed out.'),{status:408})),BODY_TIMEOUT); });
  try {
    const chunks=[];let size=0;
    while(true) {
      const {done,value}=await Promise.race([reader.read(),deadline]);if(done)break;
      size+=value.byteLength;if(size>BODY_LIMIT)throw Object.assign(new Error('Request exceeds 64 KiB.'),{status:413});chunks.push(value);
    }
    const bytes = new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
    return bytes;
  } finally { clearTimeout(timer); void reader.cancel().catch(()=>{}); reader.releaseLock(); }
}

/** Stateless Web Request → Response handler. The host owns network-level rate limits. */
export function createClearMermaidHandler({ publicOrigin = 'https://hyperdrift.io', rendererBaseUrl = 'https://hyperdrift.io/vendor/clear-mermaid/', fallbackUrl = 'https://hyperdrift.io/clear-mermaid/view', allowedOrigins } = {}) {
  const origin = configuredUrl(publicOrigin,'publicOrigin').origin;
  const renderer = configuredUrl(rendererBaseUrl,'rendererBaseUrl').href;
  const fallback = configuredUrl(fallbackUrl,'fallbackUrl').href;
  if(!renderer.endsWith('/'))throw new Error('rendererBaseUrl must end with a slash.');
  const origins = new Set(allowedOrigins ?? [origin,'https://chatgpt.com','https://chat.openai.com','https://claude.ai']);
  let active=0;
  return async function handle(request) {
    const headers = new Headers({ 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer', 'Vary':'Origin', 'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'" });
    const reply = (status,message) => new Response(message ? JSON.stringify({error:message}) : null,{status,headers:new Headers([...headers, ['Content-Type','application/json']])});
    if(request.headers.get('host') && request.headers.get('host')!==new URL(origin).host)return reply(403,'Unknown host.');
    const requestOrigin=request.headers.get('origin');
    if(requestOrigin && !origins.has(requestOrigin))return reply(403,'Unknown origin.');
    if(requestOrigin){headers.set('Access-Control-Allow-Origin',requestOrigin);headers.set('Access-Control-Allow-Headers','Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id');headers.set('Access-Control-Allow-Methods','POST, OPTIONS');}
    if(request.method==='OPTIONS')return reply(204);
    if(request.method!=='POST'){headers.set('Allow','POST, OPTIONS');return reply(405,'Use POST for this stateless MCP endpoint.');}
    if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return reply(415,'Send application/json.');
    if(active>=8){headers.set('Retry-After','1');return reply(429,'The renderer is busy. Try again shortly.');}
    active++;
    let server;
    try {
      const bytes = await boundedBody(request);
      // Reject invalid JSON before creating a transport. Keep source out of logs.
      try { JSON.parse(new TextDecoder().decode(bytes)); } catch { return reply(400,'Send valid JSON.'); }
      server=createServer({publicOrigin:origin,rendererBaseUrl:renderer,fallbackUrl:fallback});
      const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
      await server.connect(transport);
      const incoming=new Request(`${origin}/api/clear-mermaid/mcp`,{method:'POST',headers:request.headers,body:bytes});
      const response=await transport.handleRequest(incoming);
      const data=await response.arrayBuffer();
      if(data.byteLength>RESPONSE_LIMIT)return reply(500,'The response exceeded the size limit.');
      for(const [key,value] of response.headers)headers.set(key,value);
      return new Response(response.status===204||response.status===202?null:data,{status:response.status,headers});
    } catch(error) { return reply(error.status || 500,error.status?error.message:'The diagram service could not complete this request.'); }
    finally { active--; await server?.close().catch(()=>{}); }
  };
}
