import { escapeHTML as h } from './graph.js';

// Round the existing routed polyline, never replace it with a curve that cuts
// through intervening nodes. Q is a quadratic Bezier at each genuine corner.
export function curvedPath(points, radius = 8) {
  const clean = points.filter((p, i) => !i || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) > .01);
  if (clean.length < 2) return '';
  let d = `M${clean[0].x},${clean[0].y}`;
  for (let i = 1; i < clean.length - 1; i++) {
    const a = clean[i - 1], b = clean[i], c = clean[i + 1];
    const ab = Math.hypot(b.x - a.x, b.y - a.y), bc = Math.hypot(c.x - b.x, c.y - b.y);
    const cut = Math.min(radius, ab / 2, bc / 2);
    const before = { x: b.x - (b.x - a.x) * cut / ab, y: b.y - (b.y - a.y) * cut / ab };
    const after = { x: b.x + (c.x - b.x) * cut / bc, y: b.y + (c.y - b.y) * cut / bc };
    d += ` L${before.x},${before.y} Q${b.x},${b.y} ${after.x},${after.y}`;
  }
  return `${d} L${clean.at(-1).x},${clean.at(-1).y}`;
}

const palette = [
  ['#285f91', '#8fc8ff'], ['#98502a', '#f9bd8b'],
  ['#74449a', '#d3b1ff'], ['#18716a', '#80dacf'], ['#a33d66', '#f7a8c7'],
];

export function routeStyle(edge, graph) {
  const siblings = graph.edges.filter(e => e.source === edge.source);
  const reciprocal = graph.edges.some(e => e.id !== edge.id && e.source === edge.target && e.target === edge.source);
  const kind = edge.hasArrowStart && edge.hasArrowEnd ? 'two-way' : !edge.hasArrowStart && !edge.hasArrowEnd ? 'undirected' : reciprocal ? 'opposing' : siblings.length > 1 ? 'branch' : 'directed';
  const index = kind === 'two-way' ? 2 : kind === 'opposing' ? (edge.source.localeCompare(edge.target) < 0 ? 0 : 4) : siblings.length > 1 ? siblings.findIndex(e => e.id === edge.id) % palette.length : 3;
  return { kind, light: palette[index][0], dark: palette[index][1] };
}

export function connectorsSVG(layout, graph, { variant = 'technical', prefix = 'route' } = {}) {
  const defs = [], routes = [];
  for (const edge of layout.edges) {
    const { kind, light, dark } = routeStyle(edge, graph);
    const gradient = `${prefix}-${edge.id}-gradient`, arrow = `${prefix}-${edge.id}-arrow`;
    const start = edge.points[0], end = edge.points.at(-1);
    const color = `light-dark(${light}, ${dark})`;
    const style = `--route-color:${color}`;
    defs.push(`<linearGradient id="${gradient}" gradientUnits="userSpaceOnUse" x1="${start.x}" y1="${start.y}" x2="${end.x === start.x && end.y === start.y ? end.x + 1 : end.x}" y2="${end.y}"><stop offset="0" style="stop-color:var(--diagram-edge)"/><stop offset=".65" style="stop-color:${color}"/><stop offset="1" style="stop-color:${color}"/></linearGradient><marker id="${arrow}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse" style="fill:${color}"><path d="M1 1 L9 5 L1 9 L3 5 Z"/></marker>`);
    const d = curvedPath(edge.points, variant === 'flow' ? 16 : 8);
    // A source exit label is printed on the Flow question card at its actual port.
    const onCard = variant === 'flow' && graph.nodes.find(n => n.id === edge.source)?.shape === 'diamond';
    routes.push(`<g data-edge="${h(edge.id)}" data-connection-kind="${kind}" style="${style}"><path class="edge-halo" d="${d}"/><path class="edge ${edge.style}" d="${d}" style="stroke:url(#${gradient})" ${edge.hasArrowEnd ? `marker-end="url(#${arrow})"` : ''} ${edge.hasArrowStart ? `marker-start="url(#${arrow})"` : ''}/>${onCard ? '' : edge.labels.map(l => `<rect class="edge-label-bg" x="${l.x}" y="${l.y}" width="${l.width}" height="${l.height}" rx="4"/><text class="edge-label" x="${l.x + l.width / 2}" y="${l.y + l.height / 2}" dominant-baseline="central" text-anchor="middle">${h(edge.label)}</text>`).join('')}</g>`);
  }
  return `<svg class="connections" width="${layout.width}" height="${layout.height}" aria-hidden="true"><defs>${defs.join('')}</defs>${routes.join('')}</svg>`;
}

export function routeDescription(edge, graph) {
  const source = graph.nodes.find(n => n.id === edge.source)?.label || edge.source;
  const target = graph.nodes.find(n => n.id === edge.target)?.label || edge.target;
  const link = edge.hasArrowStart && edge.hasArrowEnd ? '↔' : edge.hasArrowEnd ? '→' : edge.hasArrowStart ? '←' : '—';
  const spoken = edge.hasArrowStart && edge.hasArrowEnd ? 'both directions' : edge.hasArrowEnd ? 'to' : edge.hasArrowStart ? 'from' : 'connected with';
  return { source, target, link, spoken, label: edge.label || 'Connection', name: `${source}; ${spoken}; ${target}${edge.label ? `; ${edge.label}` : ''}` };
}

export function routeMidpoint(points) {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  let remaining = lengths.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i]) { const t = lengths[i] ? remaining / lengths[i] : 0; return { x: points[i].x + (points[i + 1].x - points[i].x) * t, y: points[i].y + (points[i + 1].y - points[i].y) * t }; }
    remaining -= lengths[i];
  }
  return points[0];
}

export function quietConnectorsSVG(layout, graph, { variant = 'technical', prefix = 'route', keepBranchLabels = false, destinationBranchLabels = false } = {}) {
  const arrow = `${prefix}-direction`;
  return `<svg class="connections" width="${layout.width}" height="${layout.height}" role="group" aria-label="Connections"><defs><marker id="${arrow}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1 L9 5 L1 9 Z"/></marker></defs>${layout.edges.map(edge => {
    const desc = routeDescription(edge, graph);
    const critical = keepBranchLabels || graph.edges.some(e => e.id !== edge.id && ((e.source === edge.target && e.target === edge.source) || (e.source === edge.source && e.target === edge.target))) || (edge.hasArrowStart && edge.hasArrowEnd);
    const onCard = variant !== 'technical' && graph.nodes.find(n => n.id === edge.source)?.shape === 'diamond';
    const mid = routeMidpoint(edge.points);
    let label = critical || !edge.labels.length ? mid : { x: edge.labels[0].x + edge.labels[0].width / 2, y: edge.labels[0].y + edge.labels[0].height / 2 };
    if (keepBranchLabels && destinationBranchLabels) {
      // On a terminal fanout the destination is the useful anchor, not the
      // halfway point of a long shared-looking departure lane.
      const end = edge.points.at(-1), before = edge.points.at(-2);
      const distance = Math.hypot(end.x - before.x, end.y - before.y);
      const horizontal = Math.abs(end.y - before.y) < .1;
      const offset = Math.min(distance / 2, horizontal ? edge.label.length * 4.2 + 20 : 28);
      const allocated = edge.labels[0];
      if (allocated) label = horizontal ? { x: allocated.x + allocated.width / 2, y: end.y } : { x: end.x, y: allocated.y + allocated.height / 2 };
      else if (distance > 0) label = { x: end.x + (before.x - end.x) * offset / distance, y: end.y + (before.y - end.y) * offset / distance };
    }
    const d = curvedPath(edge.points, ['technical', 'reader'].includes(variant) ? 8 : 12);
    return `<g data-edge="${h(edge.id)}" data-connection-kind="${routeStyle(edge, graph).kind}" style="--route-color:var(--diagram-edge)"><path class="edge-halo" d="${d}" aria-hidden="true"/><path class="edge ${edge.style}" d="${d}" ${edge.hasArrowEnd ? `marker-end="url(#${arrow})"` : ''} ${edge.hasArrowStart ? `marker-start="url(#${arrow})"` : ''} aria-hidden="true"/><path class="edge-hit" data-route="${h(edge.id)}" d="${d}" tabindex="0" role="button" aria-label="${h(desc.name)}" aria-expanded="false"/>${edge.label && !onCard ? `<text class="edge-label ${critical ? 'essential-label' : 'optional-label'}" x="${label.x}" y="${label.y}" dominant-baseline="central" text-anchor="middle" aria-hidden="true">${h(edge.label)}</text>` : ''}</g>`;
  }).join('')}</svg>`;
}
