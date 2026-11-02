# Sources and licences

Clear Mermaid's reader was developed by Hyperdrift from the seven-case Mermaid Reader Lab and extracted into the shared browser renderer. This standalone distribution begins from HD renderer revision `d4cfaa3` (30 October 2026); it uses the same browser implementation as the two HD blog diagrams released on 2 November. The MCP wrapper and viewer are new. The MIT licence covers Hyperdrift's own code; dependency licences remain their own.

- [Mermaid](https://github.com/mermaid-js/mermaid), 12.2.0, MIT: syntax and semantic reference.
- [Beautiful Mermaid](https://github.com/lukilabs/beautiful-mermaid), 1.1.3, MIT: reused parser and layout foundation.
- [ELK](https://github.com/kieler/elkjs), 0.12.0, EPL-2.0: graph layout. The prebuilt renderer also carries the parser dependencies' transitive notices.
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk), server 2.4.0, Apache-2.0: protocol implementation.
- [Zod](https://github.com/colinhacks/zod), 4.6.7, MIT: input and output schemas.

The generated [browser dependency notices](renderer/dist/THIRD_PARTY_LICENSES.md) accompany every distribution. Installed Node dependencies include their own notices. Renderer source is in `renderer/src`; exact dependency versions are in `package-lock.json`. No dependency source or licence has been replaced by the project's MIT licence.

Build with `npm ci && npm run build`. The repository includes the browser bundle so installation needs no compiler or browser download. `scripts/check-package.mjs` checks the bundle hashes before packaging.
