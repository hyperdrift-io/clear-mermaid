import ELK from 'elkjs/lib/elk-api.js';
import workerURL from 'elkjs/lib/elk-worker.min.js?url';

// A sandbox may load this module from another origin, where browser Workers
// cannot load the asset. ELK's own in-thread Worker keeps the same layout there.
let elkPromise;
function getElk() {
  return elkPromise ??= (async () => {
    const asset = new URL(workerURL, import.meta.url).href;
    if (new URL(asset).origin === self.origin) return new ELK({ workerUrl: asset });
    const { Worker } = await import('elkjs/lib/elk-worker.min.js');
    return new ELK({ workerFactory: () => new Worker() });
  })();
}
export async function layoutGraph(graph, sizes, { round = 8, width = 900, variant = 'technical' } = {}) {
  const elk = await getElk();
  const unified = round >= 8;
  // One grammar from round eight: decisions are cards; every other node keeps
  // its technical outline. Legacy variants only select historical treatments.
  const cardVariant = unified || variant === 'flow' || (round >= 6 && variant === 'easy');
  const branches = round >= 5 && branchCollection(graph);
  const stackedBranches = round === 5 && branches;
  // Round six restores the author's branching composition; a star is not a list.
  const effectiveDirection = round >= 7 ? graph.direction : stackedBranches ? 'LR' : round >= 6 && branches ? graph.direction : cardVariant ? 'TD' : graph.direction;
  // This is the declared card/port direction. With INCLUDE_CHILDREN, ELK's
  // group elk.direction is best-effort: mixed-direction compound placement is
  // not fully supported, even when the card's ports honor the local declaration.
  // Do not present flowDirection as proof that ELK rotated the whole subgraph.
  const localDirectionFor = node => (round < 7 && cardVariant) ? 'TD' : node.groups.map(id => graph.groups.find(g => g.id === id)?.direction).filter(Boolean).at(-1) || effectiveDirection;
  const direction = ({ TD: 'DOWN', TB: 'DOWN', LR: 'RIGHT', RL: 'LEFT', BT: 'UP' })[effectiveDirection];
  const options = {
    'elk.algorithm': 'layered',
    'elk.direction': direction,
    'elk.edgeRouting': 'ORTHOGONAL',
    'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    'elk.spacing.nodeNode': '32',
    'elk.layered.spacing.nodeNodeBetweenLayers': '76',
    'elk.layered.spacing.edgeNodeBetweenLayers': '24',
    'elk.padding': '[top=32,left=32,bottom=32,right=32]',
  };
  if (round >= 4) Object.assign(options, {
    'elk.layered.cycleBreaking.strategy': graph.groups.length ? 'GREEDY' : 'DFS_NODE_ORDER',
    'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    'elk.layered.nodePlacement.strategy': graph.groups.length ? 'BRANDES_KOEPF' : 'NETWORK_SIMPLEX',
    'elk.layered.nodePlacement.favorStraightEdges': 'true',
    'elk.spacing.nodeNode': '32',
    'elk.layered.spacing.nodeNodeBetweenLayers': '56',
    'elk.layered.spacing.edgeNodeBetweenLayers': '18',
    'elk.layered.spacing.edgeEdgeBetweenLayers': '14',
    'elk.spacing.edgeNode': '20',
    'elk.spacing.edgeEdge': '14',
  });
  if (round >= 5) Object.assign(options, { 'elk.layered.spacing.nodeNodeBetweenLayers': cardVariant && !unified ? '72' : '56', 'elk.layered.mergeEdges': stackedBranches ? 'true' : 'false', 'elk.spacing.nodeSelfLoop': '36', 'elk.spacing.portPort': round >= 6 ? '12' : '32' });
  const groups = new Map(graph.groups.map(g => [g.id, { id: g.id, children: [], layoutOptions: { 'elk.padding': round >= 5 ? '[top=68,left=28,bottom=28,right=28]' : round >= 4 ? '[top=86,left=28,bottom=28,right=28]' : '[top=56,left=24,bottom=24,right=24]', ...(g.direction || (cardVariant && round < 7) ? { 'elk.direction': cardVariant && round < 7 ? 'DOWN' : ({ TD: 'DOWN', TB: 'DOWN', LR: 'RIGHT', RL: 'LEFT', BT: 'UP' })[g.direction] } : {}) } }]));
  const diamond = id => round >= 4 && graph.nodes.find(n => n.id === id)?.shape === 'diamond';
  const keepRouteLabel = edge => {
    if (!edge.label || (cardVariant && diamond(edge.source))) return false;
    if (unified || round < 6 || !cardVariant || branches) return true;
    // Distinct messages between the same pair still need individual visible labels.
    return (edge.hasArrowStart && edge.hasArrowEnd) || graph.edges.some(other => other.id !== edge.id &&
      ((other.source === edge.source && other.target === edge.target) ||
       (other.source === edge.target && other.target === edge.source)));
  };
  const loopNodes = new Set(round >= 7 ? graph.edges.filter(e => e.source === e.target).map(e => e.source) : []);
  const root = { id: 'root', layoutOptions: options, children: [], edges: graph.edges.map(e => ({ id: e.id, sources: [diamond(e.source) || loopNodes.has(e.source) || (round >= 6 && e.source === e.target) ? `port:${e.source}:${e.id}:out` : e.source], targets: [diamond(e.target) || loopNodes.has(e.target) || (round >= 6 && e.source === e.target) ? `port:${e.target}:${e.id}:in` : e.target], labels: keepRouteLabel(e) ? [{ id: `${e.id}-label`, text: e.label, width: Math.max(42, e.label.length * 8.4 + 16), height: 26, ...(round >= 7 && branches ? { layoutOptions: { 'elk.edgeLabels.placement': 'HEAD' } } : {}) }] : [] })) };
  graph.groups.forEach(g => (g.parent ? groups.get(g.parent) : root).children.push(groups.get(g.id)));
  graph.nodes.forEach(n => {
    const size = sizes.get(n.id);
    const node = { id: n.id, width: size.width, height: size.height, ...(round >= 4 ? { layoutOptions: { 'elk.portAlignment.default': 'CENTER', 'elk.nodeSize.constraints': '[]' } } : {}) };
    if (diamond(n.id)) {
      node.layoutOptions['elk.portConstraints'] = 'FIXED_SIDE';
      node.layoutOptions['elk.spacing.portPort'] = '36';
      const localDirection = localDirectionFor(n);
      const horizontal = ['LR', 'RL'].includes(localDirection);
      const forward = ['LR', 'TD', 'TB'].includes(localDirection);
      node.ports = ['in', 'out'].flatMap(kind => {
        const connections = graph.edges.filter(e => (kind === 'in' ? e.target : e.source) === n.id);
        const positive = (kind === 'out') === forward;
        const side = horizontal ? (positive ? 'EAST' : 'WEST') : (positive ? 'SOUTH' : 'NORTH');
        return connections.map((edge, index) => {
          const fraction = (index + 1) / (connections.length + 1);
          const exit = kind === 'out' && cardVariant ? size.flowPorts?.find(p => p.id === edge.id) : null;
          return { id: `port:${n.id}:${edge.id}:${kind}`, x: exit ? exit.x : horizontal ? (positive ? size.width : 0) : size.width * fraction, y: exit ? (round >= 7 ? exit.y : size.height) : horizontal ? size.height * fraction : (positive ? size.height : 0), width: 0, height: 0, layoutOptions: { 'elk.port.side': side } };
        });
      });
    }
    if (round >= 6 && !diamond(n.id)) {
      const loops = graph.edges.filter(e => e.source === n.id && e.target === n.id);
      if (loops.length) {
        // Explicit loop ports keep their 32px span independent of the 12px
        // spacing used for ordinary implicit ports. ELK still routes the loop.
        node.layoutOptions['elk.portConstraints'] = 'FIXED_POS';
        const horizontal = ['LR', 'RL'].includes(round >= 7 ? localDirectionFor(n) : effectiveDirection);
        node.ports = loops.flatMap(edge => ['out', 'in'].map((kind, offset) => ({
          id: `port:${n.id}:${edge.id}:${kind}`,
          x: horizontal ? size.width / 2 + (offset ? 16 : -16) : size.width,
          y: horizontal ? 0 : size.height / 2 + (offset ? 16 : -16),
          width: 0, height: 0,
          layoutOptions: { 'elk.port.side': horizontal ? 'NORTH' : 'EAST' },
        })));
        if (round >= 7) {
          // FIXED_POS applies to every port. Leaving ordinary edges implicit on
          // a loop node can put them at its corners, grazing the top outline.
          // Give those transitions their own inset ports on the reading axis.
          const forward = ['LR', 'TD', 'TB'].includes(localDirectionFor(n));
          for (const kind of ['in', 'out']) {
            const connections = graph.edges.filter(e => e.source !== e.target && (kind === 'in' ? e.target : e.source) === n.id);
            const positive = (kind === 'out') === forward;
            const side = horizontal ? (positive ? 'EAST' : 'WEST') : (positive ? 'SOUTH' : 'NORTH');
            const extent = horizontal ? size.height : size.width;
            const gap = Math.min(12, (extent - 24) / Math.max(1, connections.length - 1));
            connections.forEach((edge, index) => {
              const offset = extent / 2 + (index - (connections.length - 1) / 2) * gap;
              node.ports.push({ id: `port:${n.id}:${edge.id}:${kind}`, x: horizontal ? (positive ? size.width : 0) : offset, y: horizontal ? offset : (positive ? size.height : 0), width: 0, height: 0, layoutOptions: { 'elk.port.side': side } });
            });
          }
        }
      }
    }
    (n.groups.length ? groups.get(n.groups.at(-1)) : root).children.push(node);
  });
  let result = await elk.layout(root);
  const flowOrders = new Map();
  if (cardVariant && (!unified || graph.nodes.some(n => diamond(n.id)))) {
    // Let crossing minimisation choose the exit order, then dock equally sized
    // question-card exits in that order. Edge identity and labels never change.
    function collectPorts(item) {
      if (item.ports?.length && diamond(item.id)) {
        const horizontal = round >= 7 && ['LR', 'RL'].includes(localDirectionFor(graph.nodes.find(n => n.id === item.id)));
        flowOrders.set(item.id, item.ports.filter(p => p.id.endsWith(':out')).sort((a, b) => horizontal ? a.y - b.y : a.x - b.x).map(p => p.id));
      }
      item.children?.forEach(collectPorts);
    }
    collectPorts(result);
    function dockPorts(item) {
      const order = flowOrders.get(item.id);
      if (order) {
        item.layoutOptions['elk.portConstraints'] = 'FIXED_POS';
        const localDirection = localDirectionFor(graph.nodes.find(n => n.id === item.id));
        const horizontal = ['LR', 'RL'].includes(localDirection);
        const measured = [...(sizes.get(item.id).flowPorts || [])].sort((a, b) => horizontal ? a.y - b.y : a.x - b.x);
        item.ports.filter(p => p.id.endsWith(':out')).forEach(p => {
          const slot = order.indexOf(p.id), fraction = (slot + .5) / order.length;
          if (round >= 7) {
            const position = measured[slot];
            p.x = position?.x ?? (horizontal ? (localDirection === 'LR' ? item.width : 0) : item.width * fraction);
            p.y = position?.y ?? (horizontal ? item.height * fraction : localDirection === 'BT' ? 0 : item.height);
          } else { p.x = item.width * fraction; p.y = item.height; }
        });
      }
      item.children?.forEach(dockPorts);
    }
    dockPorts(root);
    result = await elk.layout(root);
  }
  const nodes = [], boundaries = [], edges = [], pendingEdges = [];
  const origins = new Map([['root', { x: 0, y: 0 }]]);
  function flatten(item, x = 0, y = 0) {
    const ox = x + (item.x || 0), oy = y + (item.y || 0);
    origins.set(item.id, { x: ox, y: oy });
    for (const child of item.children || []) {
      if (child.children) {
        boundaries.push({ ...graph.groups.find(g => g.id === child.id), x: ox + child.x, y: oy + child.y, width: child.width, height: child.height });
        flatten(child, ox, oy);
      } else nodes.push({ ...graph.nodes.find(n => n.id === child.id), x: ox + child.x, y: oy + child.y, width: child.width, height: child.height, flowOrder: flowOrders.get(child.id)?.map(id => id.split(':').at(-2)), ...(round >= 7 ? { flowDirection: localDirectionFor(graph.nodes.find(n => n.id === child.id)) } : {}) });
    }
    for (const edge of item.edges || []) pendingEdges.push({ edge, x: ox, y: oy });
  }
  flatten(result);
  for (const pending of pendingEdges) {
      const { edge } = pending;
      const origin = round >= 2 ? (origins.get(edge.container) || pending) : pending;
      const ox = origin.x, oy = origin.y;
      const original = graph.edges.find(e => e.id === edge.id);
      const section = edge.sections?.[0];
      if (!section) throw new Error(`No route produced for ${edge.id}`);
      edges.push({ ...original, points: [section.startPoint, ...(section.bendPoints || []), section.endPoint].map(p => ({ x: p.x + ox, y: p.y + oy })), labels: (edge.labels || []).map(l => ({ ...l, x: l.x + ox, y: l.y + oy })) });
  }
  // ELK routes to the bounding rectangle. Meet the actual diamond perimeter,
  // keeping the orthogonal route intact, instead of leaving a visible gap.
  if (round >= 4 && round < 6 && !cardVariant) for (const edge of edges) {
    for (const [id, at, adjacent] of [[edge.source, 0, 1], [edge.target, edge.points.length - 1, edge.points.length - 2]]) {
      const n = nodes.find(n => n.id === id);
      if (n?.shape !== 'diamond') continue;
      const p = edge.points[at], q = edge.points[adjacent];
      const cx = n.x + n.width / 2, cy = n.y + n.height / 2;
      if (Math.abs(p.x - q.x) < .1) p.y = cy + Math.sign(p.y - cy) * n.height / 2 * (1 - Math.abs(p.x - cx) / (n.width / 2));
      else p.x = cx + Math.sign(p.x - cx) * n.width / 2 * (1 - Math.abs(p.y - cy) / (n.height / 2));
    }
  }
  if (round >= 7) for (const edge of edges) edge.points = simplifyTerminalJog(edge.points, nodes, edges.flatMap(e => e.labels));
  if (round >= 6) for (const edge of edges) {
    for (const [id, at, adjacent] of [[edge.source, 0, 1], [edge.target, edge.points.length - 1, edge.points.length - 2]]) {
      const node = nodes.find(n => n.id === id);
      if (node) edge.points[at] = dockToOutline(node, edge.points[at], edge.points[adjacent], unified ? diamond(node.id) : cardVariant, unified ? 8 : undefined);
    }
  }
  return { nodes, edges, groups: boundaries, width: result.width, height: result.height, kind: 'graph', direction: effectiveDirection };
}

// Remove a tiny orthogonal jog immediately before an endpoint, where two
// rounded bends otherwise look like a damaged arrow. The port stays fixed;
// only its adjacent free lane moves, and only if every node/label stays clear.
export function simplifyTerminalJog(points, nodes, labels = [], maximum = 8) {
  if (points.length < 5) return points;
  const [previous, a, b, c, end] = points.slice(-5);
  const vertical = Math.abs(a.x - b.x) < .01 && Math.abs(c.x - end.x) < .01;
  const horizontal = Math.abs(a.y - b.y) < .01 && Math.abs(c.y - end.y) < .01;
  if (!vertical && !horizontal) return points;
  const shift = vertical ? c.x - b.x : c.y - b.y;
  if (Math.abs(shift) < .01 || Math.abs(shift) > maximum) return points;
  if (vertical ? Math.abs(b.y - c.y) > .01 || Math.abs(previous.y - a.y) > .01 || (b.y - a.y) * (end.y - c.y) <= 0
    : Math.abs(b.x - c.x) > .01 || Math.abs(previous.x - a.x) > .01 || (b.x - a.x) * (end.x - c.x) <= 0) return points;
  const moved = vertical ? { x: c.x, y: a.y } : { x: a.x, y: c.y };
  const candidate = [...points.slice(0, -4), moved, end];
  const intersects = (p, q, box) => Math.abs(p.x - q.x) < .01
    ? p.x > box.x + .01 && p.x < box.x + box.width - .01 && Math.max(p.y, q.y) > box.y + .01 && Math.min(p.y, q.y) < box.y + box.height - .01
    : p.y > box.y + .01 && p.y < box.y + box.height - .01 && Math.max(p.x, q.x) > box.x + .01 && Math.min(p.x, q.x) < box.x + box.width - .01;
  const obstacles = [...nodes, ...labels];
  if (obstacles.some(box => intersects(previous, moved, box) || intersects(moved, end, box))) return points;
  return candidate;
}

// Intersect the final orthogonal segment with the rendered outline, not merely
// its layout box. CSS/SVG geometry is shared by agreement with round-six styles:
// Technical rectangles radius 8, legacy cards radius 12, boundary nodes capsules.
// Unified question cards use radius 8; their other shapes remain technical.
// Moving only along that segment preserves ports, route order and arrow direction.
export function dockToOutline(node, point, adjacent, cardVariant = false, cornerRadius = cardVariant ? 12 : 8) {
  if (!adjacent) return { ...point };
  const { x, y, width: w, height: h, shape } = node;
  const cx = x + w / 2, cy = y + h / 2;
  const vertical = Math.abs(point.x - adjacent.x) < .1;
  const side = Math.sign((vertical ? point.y - cy : point.x - cx)) || 1;
  const p = { ...point };
  const root = value => Math.sqrt(Math.max(0, value));
  if (!cardVariant && shape === 'diamond') {
    // Matches M50 1 L99 50 L50 99 L1 50 in the outline's 100-unit viewBox.
    if (vertical) p.y = cy + side * h * .49 * Math.max(0, 1 - Math.abs(p.x - cx) / (w * .49));
    else p.x = cx + side * w * .49 * Math.max(0, 1 - Math.abs(p.y - cy) / (h * .49));
  } else if (!cardVariant && ['circle', 'doublecircle'].includes(shape)) {
    if (vertical) p.y = cy + side * h / 2 * root(1 - ((p.x - cx) / (w / 2)) ** 2);
    else p.x = cx + side * w / 2 * root(1 - ((p.y - cy) / (h / 2)) ** 2);
  } else if (!cardVariant && shape === 'cylinder') {
    // Outer path: x=1..99, top ellipse centre y=13/radius12,
    // bottom ellipse centre y=87/radius12, in a 100-unit viewBox.
    if (vertical) p.y = y + h * (side < 0 ? .13 - .12 * root(1 - ((p.x - cx) / (w * .49)) ** 2) : .87 + .12 * root(1 - ((p.x - cx) / (w * .49)) ** 2));
    else {
      const ellipseY = Math.max(y + h * .13, Math.min(y + h * .87, p.y));
      p.x = cx + side * w * .49 * root(1 - ((p.y - ellipseY) / (h * .12)) ** 2);
    }
  } else {
    const capsule = ['stadium', 'rounded'].includes(shape) || (cardVariant && shape === 'doublecircle');
    const radius = Math.min(w / 2, h / 2, capsule ? Infinity : cornerRadius);
    if (vertical) {
      const inset = Math.max(0, radius - Math.min(p.x - x, x + w - p.x));
      p.y = cy + side * (h / 2 - radius + root(radius ** 2 - inset ** 2));
    } else {
      const inset = Math.max(0, radius - Math.min(p.y - y, y + h - p.y));
      p.x = cx + side * (w / 2 - radius + root(radius ** 2 - inset ** 2));
    }
  }
  return p;
}

// Only a complete, ungrouped, directed star qualifies. Never infer interchangeable
// branches inside a general graph or silently fold cycles / convergence.
export function branchCollection(graph) {
  if (graph.groups.length || graph.nodes.length < 6 || graph.edges.length !== graph.nodes.length - 1) return null;
  const root = graph.nodes.find(n => graph.edges.filter(e => e.source === n.id).length === graph.nodes.length - 1);
  if (!root || graph.edges.some(e => e.target === root.id || e.hasArrowStart || !e.hasArrowEnd)) return null;
  if (new Set(graph.edges.map(e => e.target)).size !== graph.nodes.length - 1) return null;
  return { root, branches: graph.edges.map(edge => ({ edge, node: graph.nodes.find(n => n.id === edge.target) })) };
}
