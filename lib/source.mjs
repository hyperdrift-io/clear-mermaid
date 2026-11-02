import { parseMermaid } from 'beautiful-mermaid';

export function validateSource(source) {
  if (typeof source !== 'string' || source.length < 1 || source.length > 30000) throw new Error('Use between 1 and 30,000 characters of Mermaid source.');
  if (!/^\s*(flowchart|graph)\s+(TD|TB|LR|RL|BT)\b/.test(source)) throw new Error('Use a Mermaid flowchart with TD, TB, LR, RL or BT direction. Sequence diagrams and other families are not supported.');
  if (/^\s*(click|style|classDef|class|linkStyle)\b/m.test(source) || /:::|@\{|<\/?[a-zA-Z][^>]*>|%%\{|accDescr\s*\{/.test(source.replace(/<br\s*\/?\s*>/gi, ''))) throw new Error('Use plain flowchart labels. HTML, links, directives and custom styles are not supported.');
  const graph = parseMermaid(source.replace(/^\s*accTitle\s*:.*$/gm, '').replace(/^\s*accDescr\s*:.*$/gm, ''));
  if (graph.nodes.size > 150 || graph.edges.length > 300) throw new Error('Use no more than 150 nodes and 300 connections.');
  if (!graph.nodes.size) throw new Error('Add at least one named node.');
  return { nodes: graph.nodes.size, connections: graph.edges.length };
}
