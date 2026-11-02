import './reader.js';
import { parseGraph } from './graph.js';

// Mount before measuring. Failure leaves no partial diagram in this host.
// The caller owns status messages, input preservation and concurrent edits.
export async function renderSource(host, source, { isCurrent = () => true } = {}) {
  host.replaceChildren();
  const graph = await parseGraph(source);
  if (!isCurrent()) throw new DOMException('Source changed during parsing.', 'AbortError');
  const reader = document.createElement('mermaid-reader');
  host.append(reader);
  try {
    await reader.setGraph(graph);
    if (!isCurrent()) {
      // Layout can finish after the host was detached and its first cleanup ran.
      reader.disconnectedCallback();
      throw new DOMException('Source changed during layout.', 'AbortError');
    }
    return { reader, graph };
  } catch (error) {
    reader.remove();
    throw error;
  }
}
