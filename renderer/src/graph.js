import mermaid from 'mermaid';
import { parseMermaid } from 'beautiful-mermaid';

mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
export { mermaid };
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Render legacy Mermaid line breaks as text, never as executable HTML.
const labelText = value => String(value ?? '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/\\+n/g, '\n');
const sorted = values => JSON.stringify([...values].sort());
export function stripMetadata(source) {
  return source.replace(/^\s*accTitle\s*:.*$/gm, '').replace(/^\s*accDescr\s*:.*$/gm, '');
}

export async function parseGraph(source) {
  if (source.length > 30000) throw new Error('This prototype accepts diagrams up to 30,000 characters.');
  if (!/^\s*(flowchart|graph)\s+(TD|TB|LR|RL|BT)\b/.test(source)) throw new Error('This experiment supports flowcharts. Other Mermaid diagram families are outside this prototype.');
  if (/^\s*(click|style|classDef|class|linkStyle)\b/m.test(source) || /:::|@\{|<\/?[a-zA-Z][^>]*>|%%\{|accDescr\s*\{/.test(source.replace(/<br\s*\/?\s*>/gi, ''))) {
    throw new Error('This prototype accepts plain flowchart labels, groups, edges and single-line accessibility metadata. HTML, directives, custom styling and newer shape syntax are not supported yet.');
  }
  const official = await mermaid.mermaidAPI.getDiagramFromText(source);
  const db = official.db;
  const parsed = parseMermaid(stripMetadata(source));
  const groups = [];
  const membership = new Map();
  function collect(group, parent = null, ancestors = []) {
    const record = { id: group.id, label: labelText(group.label), parent, nodeIds: [...group.nodeIds], direction: group.direction };
    groups.push(record);
    group.nodeIds.forEach(id => membership.set(id, [...ancestors, group.id]));
    group.children.forEach(child => collect(child, group.id, [...ancestors, group.id]));
  }
  parsed.subgraphs.forEach(group => collect(group));
  const groupIDs = new Set(groups.map(g => g.id));
  const referenceNodes = [...db.getVertices().values()].filter(n => !groupIDs.has(n.id));
  const nodes = [...parsed.nodes.values()].map(n => ({ ...n, label: labelText(n.label), groups: membership.get(n.id) || [] }));
  const edges = parsed.edges.map((e, i) => ({ ...e, id: `edge-${i}`, label: labelText(e.label) }));
  if (nodes.length > 150 || edges.length > 300) throw new Error('This prototype is bounded to 150 steps and 300 connections. Larger diagrams need a separate performance trial.');
  if (sorted(nodes.map(n => [n.id, n.label])) !== sorted(referenceNodes.map(n => [n.id, labelText(n.text || n.id)]))) {
    throw new Error('The reused parser does not preserve every node and label in this source. The reader has stopped rather than show an incomplete graph.');
  }
  const shapes = { square: 'rectangle', rect: 'rectangle', round: 'rounded', diamond: 'diamond', stadium: 'stadium', circle: 'circle', doublecircle: 'doublecircle', subroutine: 'subroutine', cylinder: 'cylinder', hexagon: 'hexagon', odd: 'asymmetric', trapezoid: 'trapezoid', inv_trapezoid: 'trapezoid-alt' };
  for (const reference of referenceNodes) {
    const shape = reference.type ? shapes[reference.type] : 'rectangle';
    if (!shape || nodes.find(n => n.id === reference.id)?.shape !== shape) throw new Error(`The shape of ${reference.id} is not preserved by this parser adapter. Rendering stopped.`);
  }
  const referenceEdges = db.getEdges().map(e => [e.start, e.end, labelText(e.text)]);
  if (sorted(edges.map(e => [e.source, e.target, e.label])) !== sorted(referenceEdges)) throw new Error('The reused parser changes or drops a connection in this syntax. The reader has stopped to preserve the meaning of the original diagram.');
  const referenceGroups = db.getSubGraphs();
  if (sorted(groups.map(g => [g.id, g.label, [...g.nodeIds, ...groups.filter(c => c.parent === g.id).map(c => c.id)].sort()])) !== sorted(referenceGroups.map(g => [g.id, labelText(g.title), [...g.nodes].sort()]))) {
    throw new Error('The parser adapters disagree about group membership. This source needs a compatibility fix before the reader can display it.');
  }
  // Restrict edge semantics to the arrow families we can compare reliably.
  const ref = db.getEdges();
  for (let i = 0; i < ref.length; i++) {
    const e = ref[i];
    if (!['arrow_point', 'double_arrow_point', 'arrow_open'].includes(e.type) || e.stroke === 'invisible') throw new Error(`Unsupported edge semantics: ${e.type}. No connections have been hidden.`);
    const p = edges[i];
    if (p.source !== e.start || p.target !== e.end || p.hasArrowStart !== (e.type === 'double_arrow_point') || p.hasArrowEnd !== (e.type !== 'arrow_open')) throw new Error('The parsers disagree about arrow direction. Rendering stopped.');
    const expectedStyle = e.stroke === 'dotted' ? 'dotted' : e.stroke === 'thick' ? 'thick' : 'solid';
    if (p.style !== expectedStyle) throw new Error('The parsers disagree about an edge style. Rendering stopped.');
  }
  return { direction: parsed.direction, nodes, edges, groups, title: db.getAccTitle() || 'Flowchart', description: db.getAccDescription() || '', parity: true };
}

export function roleFor(shape) {
  return ({ diamond: 'Decision', cylinder: 'Data store', stadium: 'Boundary', circle: 'Connector', doublecircle: 'Boundary', subroutine: 'Subprocess', hexagon: 'Preparation', asymmetric: 'Asymmetric step', trapezoid: 'Trapezoid step', 'trapezoid-alt': 'Inverted trapezoid step' })[shape] || 'Step';
}

// Shared by every presentation: declaration order is not arrow direction.
export function relationships(graph, id) {
  const incoming = [], outgoing = [], connected = [];
  for (const edge of graph.edges) {
    if (edge.source !== id && edge.target !== id) continue;
    const other = edge.source === id ? edge.target : edge.source;
    const relation = { edge, other, node: graph.nodes.find(n => n.id === other) };
    if (!edge.hasArrowStart && !edge.hasArrowEnd) { connected.push(relation); continue; }
    if ((edge.target === id && edge.hasArrowEnd) || (edge.source === id && edge.hasArrowStart)) incoming.push(relation);
    if ((edge.source === id && edge.hasArrowEnd) || (edge.target === id && edge.hasArrowStart)) outgoing.push(relation);
  }
  return { incoming, outgoing, connected };
}
