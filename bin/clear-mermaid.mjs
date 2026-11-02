#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createClearMermaidServer } from '../lib/server.mjs';

const { server, close } = await createClearMermaidServer();
let closing = false;
const stop = async () => { if (closing) return; closing = true; await close(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.stdin.on('end', stop);
await server.connect(new StdioServerTransport());
