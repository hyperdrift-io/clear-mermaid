# Clear Mermaid

Create a Mermaid flowchart in your AI assistant, then open it in a browser where you can follow a step, inspect its connections and read the relationships as text.

Clear Mermaid keeps the Mermaid source. It uses HTML text, CSS, SVG connectors and browser controls to make a supported set of flowcharts easier to explore. This package connects that reader to **desktop MCP clients that can launch a local command**. It does not require an account, an API key or a hosted rendering service.

## Install the connector

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

## Try it

Ask your assistant:

> Use Clear Mermaid to draw a web application architecture. Show the browser, API, sign-in decision and database. Label the successful and unsuccessful sign-in paths, and show where a retry returns. Give me the diagram link.

Open the returned localhost link **on the same computer**. Select a step to inspect its incoming and outgoing connections. Use Overview to see the whole diagram, Readable size to inspect the text, or Explore connections → Read relationships for the textual view. Save Mermaid source from the page to keep or edit it.

To revise the diagram, describe the change in your chat and ask the assistant to render the updated source. Each call creates a new view. Links last for one hour while the connector is running; closing the client or restarting the connector removes them. At most 20 diagrams are held per session.

The browser performs the final compatibility check before drawing. If it refuses a diagram, the page explains why and retains the source. Ask the assistant to simplify the unsupported syntax. A returned link confirms that the view was prepared, not that every browser has rendered it successfully.

## Supported diagrams

Use Mermaid `flowchart` or `graph` with a direction, named nodes, plain text labels, groups, decisions and explicit connections. The reader supports a checked set of node shapes and directed, bidirectional or undirected edges. Limits are 30,000 characters, 150 nodes and 300 connections.

Sequence diagrams and other Mermaid families, HTML labels (apart from line breaks), click actions, custom styles and directives are not supported. The browser compares its parsed graph with Mermaid and refuses detectable changes to labels, groups, shapes or arrow direction. This is not full Mermaid compatibility or an accessibility-conformance claim.

## Your data

The connector holds diagram source in memory and serves the viewer on `127.0.0.1`, behind an unguessable session URL. It makes no external rendering requests and writes no diagram files. The viewer's assets are bundled locally. Your chosen AI client still handles the prompts and source you send to it under its own settings.

## Build and check

```sh
npm ci
npm run build
npm test
npm run test:browser
npm pack
```

The browser check uses an installed Google Chrome and exercises a real MCP call, diagram rendering at desktop and phone widths, relationship reading and refusal of unsupported syntax. Server checks cover input bounds, cross-origin access, Host validation, path access and session capacity.

The same renderer is in use on the [Hyperdrift blog](https://hyperdrift.io/blog/own-your-stack-types-all-the-way-down). Clear Mermaid is a Hyperdrift project; [Orchestra](https://orchestra.hyperdrift.io) develops practical tools and contributions alongside its work with founders.

[Licence](LICENSE) · [Dependency credits and source](NOTICE.md)
