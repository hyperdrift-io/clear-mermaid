# Clear Mermaid

Create a Mermaid flowchart in your AI assistant, then open it in a browser where you can follow a step, inspect its connections and read the relationships as text.

Clear Mermaid keeps the Mermaid source. It uses HTML text, CSS, SVG connectors and browser controls to make a supported set of flowcharts easier to explore. This package provides a hosted MCP Apps integration and a local connector for desktop clients. Neither requires a Clear Mermaid account or an API key.

<a id="install-the-connector"></a>

## Connect from ChatGPT or Claude

The hosted connector is being prepared for `https://hyperdrift.io/api/clear-mermaid/mcp`. This revision has protocol and sandbox-browser checks; the public deployment and each chat application's integration must be verified before treating it as available.

Once deployed, add that URL as a custom MCP server with **no authentication**. You do not need Node.js, a local server or an API key.

- **ChatGPT:** open Plugins, choose the plus button, then Add custom MCP server. Enter the HTTPS URL, choose no authentication and create the plugin. Availability depends on your account and workspace policies. See [OpenAI's current connection instructions](https://developers.openai.com/plugins/deploy/connect-chatgpt).
- **Claude:** open Customize → Connectors → Add custom connector and enter the server URL. See [Claude's custom connector instructions](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

Ask: “Use Clear Mermaid to draw a web application architecture. Show the browser, API, sign-in decision and database. Label both sign-in outcomes and show where a retry returns.”

The connector advertises a standard MCP Apps view. In a client that supports it, the diagram appears in the conversation. Select a step, explore its connections or read relationships as text. Use **Open full diagram** for a larger browser view. Clients without inline views receive the same browser link. Describe revisions in the chat and ask the assistant to render the updated Mermaid source.

The hosted service validates the source transiently and returns it to your client; it does not save diagrams or call an AI model. Browser assets load from Hyperdrift. The fallback URL carries the complete source in its fragment, which is not sent to the web server. The link, browser history and your chat still contain that source: share it only when the diagram may be shared. Your AI provider's own data settings apply.

## Install the local connector

Install [Node.js 22 or newer](https://nodejs.org/en/download). Add this server to your desktop client's MCP configuration:

```json
{
  "mcpServers": {
    "clear-mermaid": {
      "command": "npx",
      "args": [
        "--yes",
        "--package=https://github.com/hyperdrift-io/clear-mermaid/releases/download/v0.1.0/hyperdrift-io-clear-mermaid-mcp-0.1.0.tgz",
        "clear-mermaid-mcp"
      ]
    }
  }
}
```

Restart or reconnect the client after saving its configuration. The tool is called `clear_mermaid_render`. The versioned package is distributed through this repository's GitHub release; it is not published to the npm registry.

If the client has command and arguments fields rather than a JSON file, enter the same command and arguments there. The exact settings location depends on the client. This local connector is not an HTTPS connector for hosted chat services.

## Use the local reader

Ask your assistant:

> Use Clear Mermaid to draw a web application architecture. Show the browser, API, sign-in decision and database. Label the successful and unsuccessful sign-in paths, and show where a retry returns. Give me the diagram link.

Open the returned localhost link **on the same computer**. Select a step to inspect its incoming and outgoing connections. Use Overview to see the whole diagram, Readable size to inspect the text, or Explore connections → Read relationships for the textual view. Save Mermaid source from the page to keep or edit it.

To revise the diagram, describe the change in your chat and ask the assistant to render the updated source. Each call creates a new view. Links last for one hour while the connector is running; closing the client or restarting the connector removes them. At most 20 diagrams are held per session.

The browser performs the final compatibility check before drawing. If it refuses a diagram, the page explains why and retains the source. Ask the assistant to simplify the unsupported syntax. A returned link confirms that the view was prepared, not that every browser has rendered it successfully.

## Supported diagrams

Use Mermaid `flowchart` or `graph` with a direction, named nodes, plain text labels, groups, decisions and explicit connections. The reader supports a checked set of node shapes and directed, bidirectional or undirected edges. Limits are 30,000 characters, 150 nodes and 300 connections.

Sequence diagrams and other Mermaid families, HTML labels (apart from line breaks), click actions, custom styles and directives are not supported. The browser compares its parsed graph with Mermaid and refuses detectable changes to labels, groups, shapes or arrow direction. This is not full Mermaid compatibility or an accessibility-conformance claim.

## Local data

The connector holds diagram source in memory and serves the viewer on `127.0.0.1`, behind an unguessable session URL. It makes no external rendering requests and writes no diagram files. The viewer's assets are bundled locally. Your chosen AI client still handles the prompts and source you send to it under its own settings.

## Build and check

```sh
npm ci
npm run build
npm run build:widget
npm test
npm run test:hosted
npm run test:widget
npm run test:browser
npm pack
```

The hosted checks exercise real Streamable HTTP MCP requests and an official MCP Apps AppBridge in a sandboxed iframe, including theme, full-view links and repeated results. They do not prove that a particular ChatGPT or Claude account exposes the connector.

The browser check uses an installed Google Chrome and exercises a real MCP call, diagram rendering at desktop and phone widths, relationship reading and refusal of unsupported syntax. Server checks cover input bounds, cross-origin access, Host validation, path access and session capacity.

## Host the endpoint

Import `createClearMermaidHandler` from `@hyperdrift-io/clear-mermaid-mcp/hosted`. It accepts `publicOrigin`, `rendererBaseUrl`, `fallbackUrl` and optional exact `allowedOrigins`, and returns a standard `(Request) => Promise<Response>` handler. Serve the bundled renderer assets with cross-origin read access and provide a viewer that decodes JSON `{source,title}` from the URL fragment only.

The handler accepts stateless JSON-RPC POST requests, bounds input to 64 KiB, applies a five-second upload timeout and permits eight concurrent requests. The host must add ingress rate limits and avoid logging request bodies. No session database, secret or external AI service is required. Cross-origin sandbox views use ELK's in-thread layout implementation; same-origin pages retain a browser Worker. Both use the same layout code and options.

The same renderer is in use on the [Hyperdrift blog](https://hyperdrift.io/blog/own-your-stack-types-all-the-way-down). Clear Mermaid is a Hyperdrift project; [Orchestra](https://orchestra.hyperdrift.io) develops practical tools and contributions alongside its work with founders.

[Licence](LICENSE) · [Dependency credits and source](NOTICE.md)
