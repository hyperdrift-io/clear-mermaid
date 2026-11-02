import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { createViewer } from './viewer.mjs';

export async function createClearMermaidServer() {
  const viewer = await createViewer();
  const server = new McpServer({ name: 'clear-mermaid', version: '0.1.0' });
  server.registerTool('clear_mermaid_render', {
    title: 'Create a Clear Mermaid diagram',
    description: 'Create an interactive local browser view of a Mermaid flowchart. Use for architecture, decisions, dependencies and retry paths. Returns a private localhost link; the user must open it on the same computer while this MCP connector is running. Only flowcharts are supported. No uploads or external API calls. The browser checks compatibility before drawing; do not claim visual verification until the page has been checked.',
    inputSchema: z.object({ source: z.string().min(1).max(30000).describe('Mermaid flowchart source, starting flowchart LR or TD. Use named nodes, plain labels and explicit directed connections. No HTML, click directives or custom styling.'), title: z.string().min(1).max(160).optional().describe('A short title people will recognise.') }),
    outputSchema: z.object({ url: z.string(), title: z.string(), nodes: z.number(), connections: z.number(), expiresAt: z.string(), validation: z.string() }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async input => {
    try {
      const result = viewer.add(input);
      return { structuredContent: result, content: [{ type: 'text', text: `[Open ${result.title.replace(/[\[\]\\]/g, '')}](${result.url})\n\n${result.validation}\nThe link works on this computer for one hour, while the connector runs. Save the Mermaid source from the page to keep it.` }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: error.message || 'The diagram could not be prepared.' }] };
    }
  });
  return { server, close: async () => { await server.close(); await viewer.close(); } };
}
