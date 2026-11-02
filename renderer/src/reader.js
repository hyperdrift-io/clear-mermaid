import readerStyles from './reader.css?inline';
import diagramStyles from './reader-v4.css?inline';
import nextStyles from './reader-v5.css?inline';
import quietStyles from './reader-v6.css?inline';
import compactStyles from './reader-v7.css?inline';
import unifiedStyles from './reader-v8.css?inline';
import { connectorsSVG, quietConnectorsSVG, curvedPath, routeStyle, routeDescription } from './connectors.js';
import { escapeHTML as h, roleFor, relationships } from './graph.js';
import { layoutGraph, branchCollection } from './layout.js';

export class MermaidReader extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.scale = 1;
    this.round = 1;
    this.selected = null;
    this.mode = 'diagram';
  }

  async setGraph(graph, round = 8, variant = 'technical') {
    this.observer?.disconnect();
    this.routeEvents?.abort();
    // The current reader has one grammar. The third argument only replays archives.
    this.unified = round >= 8;
    this.variant = this.unified ? 'reader' : variant;
    this.isFlow = !this.unified && variant !== 'technical';
    this.roomy = this.unified && !['LR', 'RL'].includes(graph.direction) && graph.nodes.some(n => n.shape === 'diamond');
    this.quietFlow = !this.unified && (variant === 'easy' || (round >= 7 && this.isFlow));
    this.terminalFanout = round >= 7 && Boolean(branchCollection(graph));
    this.showEdgeLabels = this.unified || variant === 'technical';
    this.autoFit = round >= 5;
    this.graph = graph;
    this.round = round;
    this.selected = null;
    this.scale = 1;
    this.mode = 'diagram';
    this.shelf = round >= 2 && round < 6 ? branchCollection(graph) : null;
    this.showShelf = round < 5 && Boolean(this.shelf);
    this.history = [];
    this.shadowRoot.innerHTML = `<style>${readerStyles}\n${diagramStyles}\n${nextStyles}\n${quietStyles}\n${compactStyles}\n${unifiedStyles}</style>
      <section class="reader ${round >= 4 ? 'v4' : ''} ${round >= 5 ? 'v5' : ''} ${round >= 6 ? 'v6' : ''} ${round >= 7 ? 'v7' : ''} ${this.unified ? 'v8' : ''} ${this.roomy ? 'roomy' : ''} ${this.isFlow ? 'flow' : ''} ${this.quietFlow ? 'easy' : ''} ${this.terminalFanout ? 'terminal-fanout' : ''} ${this.showEdgeLabels ? 'labels-shown' : 'labels-hidden'}" aria-label="${h(graph.title)}">
        ${round >= 2 ? `<div class="reading-controls"><div class="mode-buttons" role="group" aria-label="Reading view"><button data-mode="diagram" aria-pressed="true">Diagram</button><button data-mode="text" aria-pressed="false">Read relationships</button>${round >= 3 ? '<button data-mode="focus" aria-pressed="false">Follow a step</button>' : ''}</div><label class="search-label">Find a step<input type="search" class="node-search" placeholder="Search labels…" aria-label="Find a step"></label></div><div class="search-results" aria-live="polite"></div>` : ''}
        ${round >= 3 ? '<div class="journey" hidden><button type="button" class="back-button">← Back to previous step</button><span class="journey-status"></span></div>' : ''}
        <div class="reader-toolbar"><span class="composition">Graph view</span>${this.shelf ? `<button class="layout-toggle" type="button">${this.showShelf ? 'Use graph layout' : 'Use vertical list'}</button>` : ''}${round >= 6 && graph.edges.some(e => e.label) ? `<button class="label-toggle" type="button" aria-pressed="${this.showEdgeLabels}">Connection labels</button>` : ''}<div class="zoom-controls" role="group" aria-label="Diagram zoom">
          <button type="button" data-action="out" aria-label="Zoom out">−</button><output class="zoom-value" aria-live="polite">100%</output><button type="button" data-action="in" aria-label="Zoom in">+</button><button type="button" data-action="reset">Readable size</button><button type="button" data-action="fit">Overview</button>
        </div></div>
        <p class="reader-help">Scroll to explore. Select a step to inspect its connections.</p>
        <div class="viewport" tabindex="0" aria-label="Diagram viewport; scroll to explore"><div class="sizer"><div class="scene"></div></div></div>
        <button class="graph-map" type="button" aria-label="Show whole diagram" hidden></button>
        <div class="text-view" hidden></div>
        <div class="focus-view" hidden></div>
        <div class="selection"><p>Select a step to see its incoming and outgoing connections.</p></div>
        <div class="route-tooltip" id="route-tooltip" role="tooltip" popover="manual"></div>
        <p class="sr-only" role="status" id="reader-announcement"></p>
      </section>`;
    if (this.quietFlow || this.unified) {
      const tools = document.createElement('details');
      tools.className = 'explore-tools';
      tools.innerHTML = '<summary>Explore connections</summary>';
      const controls = this.shadowRoot.querySelector('.reading-controls');
      controls.before(tools);
      tools.append(controls, this.shadowRoot.querySelector('.search-results'), this.shadowRoot.querySelector('.journey'));
    }
    this.shadowRoot.querySelectorAll('[data-action]').forEach(b => b.addEventListener('click', () => {
      const a = b.dataset.action;
      if (a === 'fit') this.fit();
      else this.zoom(a === 'reset' ? 1 : this.scale * (a === 'in' ? 1.2 : 1 / 1.2));
    }));
    const measure = document.createElement('div');
    measure.className = `measure ${round >= 4 ? 'v4' : ''} ${round >= 5 ? 'v5' : ''} ${round >= 6 ? 'v6' : ''} ${round >= 7 ? 'v7' : ''} ${this.unified ? 'v8' : ''} ${this.roomy ? 'roomy' : ''} ${this.isFlow ? 'flow' : ''} ${this.quietFlow ? 'easy' : ''} ${this.terminalFanout ? 'terminal-fanout' : ''} ${this.showEdgeLabels ? 'labels-shown' : 'labels-hidden'}`;
    this.shadowRoot.append(measure);
    const sizes = new Map();
    for (const node of graph.nodes) {
      measure.innerHTML = this.nodeHTML(node);
      const box = measure.firstElementChild;
      if (this.unified) {
        const question = node.shape === 'diamond';
        const horizontal = ['LR', 'RL'].includes(this.flowDirection(node));
        const exits = graph.edges.filter(e => e.source === node.id);
        const long = graph.nodes.some(n => n.label.length > 42);
        const width = question ? (horizontal ? (node.label.length > 42 ? 344 : 288) : Math.max(360, exits.length * 112)) : this.roomy ? 248 : long ? 224 : 152;
        box.style.width = `${width}px`;
        const rect = box.getBoundingClientRect();
        sizes.set(node.id, { width, height: Math.max(64, Math.ceil(rect.height / 8) * 8), ...(question ? { flowPorts: [...box.querySelectorAll('[data-port-edge]')].map(el => { const cell = el.getBoundingClientRect(); return { id: el.dataset.portEdge, x: cell.left + cell.width / 2 - rect.left, y: cell.top + cell.height / 2 - rect.top }; }) } : {}) });
        if (question) {
          // Measure exit centres at the final allocated height, not the natural
          // height that was rounded for ordinary technical node alignment.
          box.style.height = `${sizes.get(node.id).height}px`;
          const fixed = box.getBoundingClientRect();
          sizes.get(node.id).flowPorts = [...box.querySelectorAll('[data-port-edge]')].map(el => { const cell = el.getBoundingClientRect(); return { id: el.dataset.portEdge, x: cell.left + cell.width / 2 - fixed.left, y: cell.top + cell.height / 2 - fixed.top }; });
        }
      } else if (this.isFlow) {
        const exits = this.graph.edges.filter(e => e.source === node.id);
        const horizontal = ['LR', 'RL'].includes(this.flowDirection(node));
        // Spend available width on vertical reading. Compact horizontal chains
        // and terminal fans instead: shrinking all cards only creates wrapping.
        const comfortable = !horizontal && !this.terminalFanout;
        const width = round >= 7 ? (node.shape === 'diamond' ? (horizontal ? (node.label.length > 42 ? 344 : 288) : Math.max(360, exits.length * 112)) : comfortable ? 248 : (node.label.length > 42 ? 224 : node.label.length > 24 ? 192 : 152)) : node.shape === 'diamond' ? Math.max(variant === 'easy' ? 360 : 320, exits.length * 112) : variant === 'easy' ? 248 : 224;
        box.style.width = `${width}px`;
        const rect = box.getBoundingClientRect();
        sizes.set(node.id, { width, height: Math.max(round >= 7 ? 64 : 72, Math.ceil(rect.height)), flowPorts: [...box.querySelectorAll('[data-port-edge]')].map(el => { const cell = el.getBoundingClientRect(); return { id: el.dataset.portEdge, x: cell.left + cell.width / 2 - rect.left, y: cell.top + cell.height / 2 - rect.top }; }) });
      } else if (round >= 4) {
        const long = graph.nodes.some(n => n.label.length > 42);
        const width = node.shape === 'diamond' ? (node.label.length > 42 ? 340 : 220) : long ? 224 : 152;
        box.style.width = `${width}px`;
        if (node.shape === 'diamond') {
          const content = box.querySelector('.node-content');
          content.style.width = `${width / 2}px`;
          sizes.set(node.id, { width, height: Math.ceil(content.getBoundingClientRect().height * 2 + 24) });
        } else sizes.set(node.id, { width, height: Math.max(64, Math.ceil(box.getBoundingClientRect().height / 8) * 8) });
      } else sizes.set(node.id, { width: 216, height: Math.ceil(box.getBoundingClientRect().height) });
    }
    if (round >= 4 && (!this.isFlow || round >= 6)) {
      const height = Math.max(...graph.nodes.filter(n => n.shape !== 'diamond').map(n => sizes.get(n.id).height), 64);
      graph.nodes.filter(n => n.shape !== 'diamond').forEach(n => sizes.get(n.id).height = height);
    }
    measure.remove();
    this.layout = await layoutGraph(graph, sizes, { round, width: this.clientWidth, variant: this.variant });
    if (round >= 5) this.placeDomainTitles();
    this.paint();
    if (round >= 2) this.setupReading();
    if (round >= 3) {
      this.shadowRoot.querySelector('.back-button').addEventListener('click', () => {
        if (this.history.length < 2) return;
        this.history.pop();
        this.follow(this.history.at(-1), false);
      });
      this.viewport.addEventListener('keydown', e => {
        if (e.target !== this.viewport) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key === '+' || e.key === '=') { e.preventDefault(); this.zoom(this.scale * 1.2); }
        if (e.key === '-') { e.preventDefault(); this.zoom(this.scale / 1.2); }
      });
    }
    if (round >= 5) {
      this.shadowRoot.querySelector('.graph-map').addEventListener('click', () => { this.setMode('diagram'); this.showShelf = false; this.paint(); this.fit(); this.viewport.focus({ preventScroll: true }); });
      this.observer = new ResizeObserver(() => { if (this.autoFit && this.mode === 'diagram' && this.viewport.clientWidth) this.fit(); });
      this.observer.observe(this);
    }
    this.dispatchEvent(new CustomEvent('reader-ready', { bubbles: true }));
  }

  disconnectedCallback() { this.observer?.disconnect(); this.routeEvents?.abort(); clearTimeout(this.tooltipTimer); }

  get viewport() { return this.shadowRoot.querySelector('.viewport'); }
  flowDirection(node) {
    if (this.round < 7) return 'TD';
    return node.flowDirection || node.groups.map(id => this.graph.groups.find(g => g.id === id)?.direction).filter(Boolean).at(-1) || this.graph.direction;
  }
  nodeHTML(node) {
    if (this.isFlow || (this.unified && node.shape === 'diamond')) {
      const role = roleFor(node.shape);
      const exits = node.shape === 'diamond' ? this.graph.edges.filter(e => e.source === node.id).sort((a, b) => (node.flowOrder?.indexOf(a.id) ?? 0) - (node.flowOrder?.indexOf(b.id) ?? 0)) : [];
      return `<button type="button" class="node flow-node" data-shape="${h(node.shape)}" data-direction="${h(this.flowDirection(node))}" data-node="${h(node.id)}" aria-label="${h(node.label)}; ${h(role)}" aria-pressed="false"><span class="node-content">${this.round < 6 && ['Decision', 'Data store', 'Boundary'].includes(role) ? `<span class="node-role">${h(role)}</span>` : ''}<span class="node-label">${h(node.label)}</span></span>${exits.length ? `<span class="flow-exits">${exits.map(e => { const color = routeStyle(e, this.graph); return `<span data-port-edge="${h(e.id)}" style="--route-color:${this.round >= 6 ? 'var(--diagram-edge)' : `light-dark(${color.light},${color.dark})`}">${h(e.label || this.graph.nodes.find(n => n.id === e.target)?.label || 'Continue')}${this.round < 6 ? `<span aria-hidden="true">${e.hasArrowStart && e.hasArrowEnd ? '↕' : e.hasArrowEnd ? '↓' : e.hasArrowStart ? '↑' : '—'}</span>` : ''}</span>`; }).join('')}</span>` : ''}</button>`;
    }
    if (this.round >= 4) {
      const role = roleFor(node.shape);
      const shape = node.shape === 'diamond' ? '<svg class="node-outline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M50 1 L99 50 L50 99 L1 50 Z"/></svg>' : node.shape === 'cylinder' ? '<svg class="node-outline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M1 13 A49 12 0 0 1 99 13 L99 87 A49 12 0 0 1 1 87 Z"/><path class="cylinder-rim" d="M1 13 A49 12 0 0 0 99 13"/></svg>' : '';
      return `<button type="button" class="node" data-shape="${h(node.shape)}" data-node="${h(node.id)}" aria-label="${h(node.label)}; ${h(role)}" aria-pressed="false">${shape}<span class="node-content">${role === 'Decision' && this.round < 5 ? '<span class="node-role">Decision</span>' : ''}<span class="node-label">${h(node.label)}</span></span></button>`;
    }
    return `<button type="button" class="node" data-node="${h(node.id)}" aria-label="${h(node.label)}; ${h(roleFor(node.shape))}" aria-pressed="false"><span class="node-role">${h(roleFor(node.shape))}</span><span class="node-label">${h(node.label)}</span></button>`;
  }

  domainHTML(group) {
    const chain = []; let current = group;
    while (current) { chain.unshift(current); current = this.graph.groups.find(g => g.id === current.parent); }
    const code = chain.map(g => this.graph.groups.filter(s => s.parent === g.parent).findIndex(s => s.id === g.id) + 1).join('.');
    const index = this.graph.groups.findIndex(g => g.id === group.id);
    // Every domain gets a different hue; depth also changes luminance, boundary
    // style and a numbered heading. Hue is never the sole ownership cue.
    const hue = 170 + index * 150 / Math.max(1, this.graph.groups.length - 1);
    const depth = chain.length - 1;
    return `<section class="boundary domain" data-domain="${h(group.id)}" data-depth="${depth}" aria-label="Domain ${code}: ${h(group.label)}${depth ? `, inside ${h(chain.at(-2).label)}` : ''}" style="left:${group.x}px;top:${group.y}px;width:${group.width}px;height:${group.height}px;--heading-offset:${group.headingOffset || 0}px;--domain-hue:${hue};--domain-light:${Math.max(82, 97 - depth * 6)}%;--domain-dark:${Math.max(19, 38 - depth * 8)}%"><div class="domain-heading">${this.round < 5 ? `<span class="domain-code">${code}</span>` : ''}<strong>${h(group.label)}</strong>${this.round < 5 ? `<span class="domain-depth">${depth ? `Level ${depth + 1}` : 'Domain'}</span>` : ''}</div></section>`;
  }

  paint() {
    const toggle = this.shadowRoot.querySelector('.layout-toggle');
    if (toggle && this.round >= 5) toggle.textContent = this.showShelf ? 'Use graph layout' : 'Use vertical list';
    if (this.showShelf) { this.paintShelf(); return; }
    const { nodes, groups, edges, width, height } = this.layout;
    const scene = this.shadowRoot.querySelector('.scene');
    this.viewport.classList.remove('shelf-viewport'); scene.classList.remove('shelf-scene');
    this.shadowRoot.querySelector('.zoom-controls').hidden = false;
    this.shadowRoot.querySelector('.composition').textContent = this.round >= 7 ? `${this.unified ? 'WR' : this.isFlow ? 'Flow' : 'Technical'} · ${{ LR: 'left to right', RL: 'right to left', TD: 'top to bottom', TB: 'top to bottom', BT: 'bottom to top' }[this.layout.direction]}` : this.round >= 5 ? (this.shelf ? 'Graph · vertically stacked branches' : this.isFlow ? `${this.variant === 'easy' ? 'Easy Flow' : 'Flow'} · top to bottom` : 'Graph · source direction') : 'Graph view · source direction';
    this.shadowRoot.querySelector('.reader-help').textContent = 'Scroll to explore. Select a step to inspect its connections.';
    scene.style.width = `${width}px`; scene.style.height = `${height}px`;
    scene.innerHTML = groups.map(g => this.round >= 4 ? this.domainHTML(g) : `<div class="boundary" style="left:${g.x}px;top:${g.y}px;width:${g.width}px;height:${g.height}px"><span>${h(g.label)}</span></div>`).join('') +
      (this.round >= 6 ? quietConnectorsSVG(this.layout, this.graph, { variant: this.variant, prefix: this.variant, keepBranchLabels: Boolean(branchCollection(this.graph)), destinationBranchLabels: this.round >= 7 }) : this.round >= 5 ? connectorsSVG(this.layout, this.graph, { variant: this.variant, prefix: this.variant }) : `<svg class="connections" width="${width}" height="${height}" aria-hidden="true"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>${edges.map(e => `<g data-edge="${h(e.id)}"><path class="edge ${e.style}" d="${e.points.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ')}" ${e.hasArrowEnd ? 'marker-end="url(#arrow)"' : ''} ${e.hasArrowStart ? 'marker-start="url(#arrow)"' : ''}/>${e.labels.map(l => `<rect class="edge-label-bg" x="${l.x}" y="${l.y}" width="${l.width}" height="${l.height}" rx="4"/><text class="edge-label" x="${l.x + l.width / 2}" y="${l.y + (this.round >= 4 ? l.height / 2 : 18)}" ${this.round >= 4 ? 'dominant-baseline="central"' : ''} text-anchor="middle">${h(e.label)}</text>`).join('')}</g>`).join('')}</svg>`) +
      nodes.map(n => `<div class="node-position" style="left:${n.x}px;top:${n.y}px;width:${n.width}px;height:${n.height}px">${this.nodeHTML(n)}</div>`).join('');
    scene.querySelectorAll('[data-node]').forEach(b => b.addEventListener('click', () => this.select(b.dataset.node)));
    if (this.round >= 6) this.bindConnections();
    if (this.round >= 4) this.viewport.style.height = `${Math.min(880, Math.max(420, height + 12))}px`;
    if (this.round >= 5) { this.buildOverview(); this.autoFit ? this.fit() : this.zoom(this.scale); }
    else { this.zoom(this.scale); if (this.round >= 4) this.orientToEntry(); }
  }

  bindConnections() {
    this.routeEvents?.abort();
    this.routeEvents = new AbortController();
    const options = { signal: this.routeEvents.signal };
    const tooltip = this.shadowRoot.querySelector('.route-tooltip');
    const later = () => {
      clearTimeout(this.tooltipTimer);
      this.tooltipTimer = setTimeout(() => {
        if (!this.tooltipPinned && !tooltip.matches(':hover') && !this.routeTrigger?.matches(':hover, :focus')) this.hideRoute();
      }, 180);
    };
    this.shadowRoot.querySelectorAll('[data-route]').forEach(path => {
      path.addEventListener('pointerenter', e => { if (!this.tooltipPinned) this.showRoute(path, e); }, options);
      path.addEventListener('focus', () => { this.tooltipPinned = false; this.showRoute(path); }, options);
      path.addEventListener('pointerleave', later, options);
      path.addEventListener('blur', later, options);
      const toggle = () => { if (this.routeTrigger === path && this.tooltipPinned) this.hideRoute(); else { this.showRoute(path); this.tooltipPinned = true; } };
      path.addEventListener('click', toggle, options);
      path.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }, options);
    });
    tooltip.addEventListener('pointerenter', () => clearTimeout(this.tooltipTimer), options);
    tooltip.addEventListener('pointerleave', later, options);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') this.hideRoute(); }, options);
    document.addEventListener('pointerdown', e => { if (!e.composedPath().includes(tooltip) && !e.composedPath().some(el => el.dataset?.route && el.getRootNode() === this.shadowRoot)) this.hideRoute(); }, options);
    this.viewport.addEventListener('scroll', () => this.hideRoute(), options);
  }

  showRoute(path, pointer) {
    clearTimeout(this.tooltipTimer);
    this.hideRoute();
    const edge = this.graph.edges.find(e => e.id === path.dataset.route);
    const desc = routeDescription(edge, this.graph);
    this.routeTrigger = path;
    path.setAttribute('aria-expanded', 'true');
    path.setAttribute('aria-describedby', 'route-tooltip');
    const tooltip = this.shadowRoot.querySelector('.route-tooltip');
    tooltip.innerHTML = `${edge.label ? `<strong>${h(edge.label)}</strong>` : ''}<span>${h(desc.source)} <span aria-hidden="true">${desc.link}</span><span class="sr-only">${h(desc.spoken)}</span> ${h(desc.target)}</span>`;
    tooltip.showPopover();
    const p = path.getPointAtLength(path.getTotalLength() / 2);
    const screen = new DOMPoint(p.x, p.y).matrixTransform(path.getScreenCTM());
    const x = pointer?.clientX ?? screen.x, y = pointer?.clientY ?? screen.y;
    const rect = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.max(12, Math.min(innerWidth - rect.width - 12, x - rect.width / 2))}px`;
    tooltip.style.top = `${Math.max(12, Math.min(innerHeight - rect.height - 12, y + 14))}px`;
    path.closest('[data-edge]').classList.add('traced');
    this.shadowRoot.querySelector('.reader').classList.add('route-tracing');
    this.shadowRoot.querySelectorAll('.scene [data-node]').forEach(el => el.classList.toggle('route-endpoint', el.dataset.node === edge.source || el.dataset.node === edge.target));
  }

  hideRoute() {
    clearTimeout(this.tooltipTimer);
    const tooltip = this.shadowRoot.querySelector('.route-tooltip');
    if (tooltip?.matches(':popover-open')) tooltip.hidePopover();
    this.routeTrigger?.setAttribute('aria-expanded', 'false');
    this.routeTrigger?.removeAttribute('aria-describedby');
    this.routeTrigger = null; this.tooltipPinned = false;
    this.shadowRoot.querySelector('.reader')?.classList.remove('route-tracing');
    this.shadowRoot.querySelectorAll('.traced, .route-endpoint').forEach(el => el.classList.remove('traced', 'route-endpoint'));
  }

  placeDomainTitles() {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = '700 16px system-ui';
    for (const group of this.layout.groups) {
      const textWidth = ctx.measureText(group.label).width;
      const top = group.y + 8, bottom = group.y + 40;
      const obstacles = this.layout.edges.flatMap(e => e.points.slice(1).flatMap((b, i) => {
        const a = e.points[i];
        if (Math.max(a.y, b.y) < top || Math.min(a.y, b.y) > bottom) return [];
        return [[Math.min(a.x, b.x) - 10, Math.max(a.x, b.x) + 10]];
      })).filter(([a, b]) => b > group.x && a < group.x + group.width).sort((a, b) => a[0] - b[0]);
      let left = group.x + 16;
      for (const [a, b] of obstacles) {
        if (a - left >= textWidth) break;
        if (b > left) left = b;
      }
      group.headingOffset = left + textWidth <= group.x + group.width - 16 ? left - group.x - 16 : 0;
    }
  }

  buildOverview() {
    const { nodes, edges, groups, width, height } = this.layout;
    this.shadowRoot.querySelector('.graph-map').innerHTML = `<span>Whole graph <span aria-hidden="true">↗</span></span><svg viewBox="0 0 ${width} ${height}" aria-hidden="true">${groups.map(g => `<rect class="map-group" x="${g.x}" y="${g.y}" width="${g.width}" height="${g.height}" rx="8"/>`).join('')}${edges.map(e => `<path class="map-edge" d="${curvedPath(e.points)}"/>`).join('')}${nodes.map(n => `<rect class="map-node" data-map-node="${h(n.id)}" x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="8"/>`).join('')}</svg>`;
  }

  updateOverview() {
    if (this.round < 5) return;
    const map = this.shadowRoot.querySelector('.graph-map');
    map.hidden = this.mode === 'diagram' && this.autoFit && !this.showShelf;
    map.querySelectorAll('[data-map-node]').forEach(el => el.classList.toggle('selected', el.dataset.mapNode === this.selected));
  }

  fit() {
    this.autoFit = true;
    if (!this.viewport.clientWidth) return;
    if (this.round >= 5 && !this.showShelf) {
      const widthScale = Math.min(1, (this.viewport.clientWidth - 24) / this.layout.width);
      const ceiling = this.clientWidth < 600 ? 620 : 880;
      this.viewport.style.height = `${Math.max(200, Math.min(ceiling, this.layout.height * widthScale + 26))}px`;
    }
    this.zoom(Math.min(1, (this.viewport.clientWidth - 24) / this.layout.width, (this.viewport.clientHeight - 24) / this.layout.height), true);
    this.viewport.scrollLeft = 0; this.viewport.scrollTop = 0;
  }

  orientToEntry() {
    const sources = this.layout.nodes.filter(n => relationships(this.graph, n.id).incoming.length === 0);
    const entry = sources.sort((a, b) => a.y - b.y || a.x - b.x)[0] || this.layout.nodes.find(n => n.id === this.graph.nodes[0].id);
    if (!entry || !this.viewport.clientWidth) return;
    // A camera starting position only; no selection, preferred path or history.
    this.viewport.scrollLeft = Math.max(0, entry.x + entry.width / 2 - this.viewport.clientWidth / 2);
    this.viewport.scrollTop = Math.max(0, entry.y - 32);
  }

  paintShelf() {
    const { root, branches } = this.shelf;
    const scene = this.shadowRoot.querySelector('.scene');
    this.viewport.classList.add('shelf-viewport'); scene.classList.add('shelf-scene');
    scene.style.cssText = '';
    this.shadowRoot.querySelector('.sizer').style.cssText = '';
    this.shadowRoot.querySelector('.zoom-controls').hidden = true;
    this.viewport.style.height = '';
    this.shadowRoot.querySelector('.composition').textContent = `${branches.length} routes · ${this.round >= 4 ? 'vertical branches' : 'compact branch layout'}`;
    this.shadowRoot.querySelector('.reader-help').textContent = 'Each labelled route starts at the same step. All routes are shown, in source order.';
    scene.innerHTML = `<div class="branch-origin"><span class="small-label">From</span>${this.nodeHTML(root)}</div><ul class="branch-grid" aria-label="All outgoing routes from ${h(root.label)}">${branches.map(({ edge, node }) => `<li data-branch="${h(edge.id)}"><span class="branch-label"><span aria-hidden="true">↳</span> ${h(edge.label || 'Unlabelled route')}</span>${this.nodeHTML(node)}</li>`).join('')}</ul>`;
    scene.querySelectorAll('[data-node]').forEach(b => b.addEventListener('click', () => this.select(b.dataset.node)));
    this.updateOverview();
  }

  setupReading() {
    this.shadowRoot.querySelector('.label-toggle')?.addEventListener('click', e => {
      this.showEdgeLabels = !this.showEdgeLabels;
      e.currentTarget.setAttribute('aria-pressed', String(this.showEdgeLabels));
      this.shadowRoot.querySelector('.reader').classList.toggle('labels-shown', this.showEdgeLabels);
      this.shadowRoot.querySelector('.reader').classList.toggle('labels-hidden', !this.showEdgeLabels);
    });
    this.shadowRoot.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => this.setMode(b.dataset.mode)));
    this.shadowRoot.querySelector('.layout-toggle')?.addEventListener('click', e => {
      this.showShelf = !this.showShelf;
      e.currentTarget.textContent = this.showShelf ? 'Use graph layout' : this.round >= 4 ? 'Use vertical branches' : 'Use compact layout';
      this.paint();
      if (this.selected) this.select(this.selected);
    });
    this.shadowRoot.querySelector('.text-view').innerHTML = `<div class="text-intro"><h3>${h(this.graph.title)}</h3><p>${h(this.graph.description)}</p><p>${this.graph.nodes.length} steps and ${this.graph.edges.length} connections. Directed, bidirectional and undirected relationships are labelled explicitly.</p>${this.round >= 3 ? '<button type="button" class="expand-all">Expand every step</button>' : ''}</div>${this.graph.groups.length ? `<details class="group-outline" open><summary>Group membership · ${this.graph.groups.length} groups</summary><ul>${this.graph.groups.map(g => `<li><strong>${h(g.label)}</strong>${g.parent ? ` — inside ${h(this.graph.groups.find(p => p.id === g.parent)?.label)}` : ''}<span>${g.nodeIds.map(id => h(this.graph.nodes.find(n => n.id === id)?.label)).join(', ') || 'Contains nested groups'}</span></li>`).join('')}</ul></details>` : ''}<ol class="reading-list">${this.graph.nodes.map(n => `<li><details data-reading-node="${h(n.id)}"><summary><span>${h(n.label)}</span><small>${h(roleFor(n.shape))} · ${this.relationshipSummary(n.id)}</small></summary><div class="reading-detail">${this.relationsHTML(n)}<button type="button" class="locate-button" data-locate="${h(n.id)}">Show in diagram</button></div></details></li>`).join('')}</ol>`;
    this.shadowRoot.querySelector('.expand-all')?.addEventListener('click', e => {
      const expand = e.currentTarget.textContent.startsWith('Expand');
      this.shadowRoot.querySelectorAll('[data-reading-node]').forEach(d => d.open = expand);
      e.currentTarget.textContent = expand ? 'Collapse every step' : 'Expand every step';
    });
    this.bindFollow(this.shadowRoot.querySelector('.text-view'));
    this.shadowRoot.querySelectorAll('[data-locate]').forEach(b => b.addEventListener('click', () => { this.setMode('diagram'); this.follow(b.dataset.locate); }));
    this.shadowRoot.querySelector('.node-search').addEventListener('input', e => {
      const query = e.target.value.trim().toLowerCase();
      const results = query ? this.graph.nodes.filter(n => n.label.toLowerCase().includes(query)) : [];
      const container = this.shadowRoot.querySelector('.search-results');
      container.innerHTML = query ? `<p>${results.length} matching steps</p><div>${results.map(n => `<button type="button" data-search-result="${h(n.id)}">${h(n.label)}</button>`).join('')}</div>` : '';
      container.querySelectorAll('button').forEach(b => b.addEventListener('click', () => this.follow(b.dataset.searchResult)));
    });
  }

  setMode(mode) {
    this.mode = mode;
    this.hideRoute();
    this.shadowRoot.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    for (const selector of ['.reader-toolbar', '.reader-help', '.viewport', '.selection']) this.shadowRoot.querySelector(selector).hidden = mode !== 'diagram';
    this.shadowRoot.querySelector('.text-view').hidden = mode !== 'text';
    this.shadowRoot.querySelector('.focus-view').hidden = mode !== 'focus';
    this.updateOverview();
    if (mode === 'diagram' && this.autoFit) this.fit();
    if (mode === 'focus') {
      if (!this.selected) this.select(this.graph.nodes[0].id);
      else this.renderFocus();
    }
  }

  relationsHTML(node) {
    const { incoming, outgoing, connected } = relationships(this.graph, node.id);
    const list = entries => entries.length ? `<ul>${entries.map(({ edge: e, other, node: target }) => {
      return `<li>${e.label ? `<span class="relation-label">${h(e.label)}</span> ` : ''}<button type="button" data-follow="${h(other)}">${h(target?.label || other)}</button>${e.hasArrowStart && e.hasArrowEnd ? ' (both directions)' : ''}${e.style !== 'solid' ? ` · ${h(e.style)} connection` : ''}</li>`;
    }).join('')}</ul>` : '<p>None</p>';
    return `<p class="membership">${node.groups.map(g => h(this.graph.groups.find(group => group.id === g)?.label)).join(' / ') || h(roleFor(node.shape))}</p><div class="relations"><section><h4>Incoming · ${incoming.length}</h4>${list(incoming)}</section><section><h4>Outgoing · ${outgoing.length}</h4>${list(outgoing)}</section>${connected.length ? `<section><h4>Undirected · ${connected.length}</h4>${list(connected)}</section>` : ''}</div>`;
  }

  relationshipSummary(id) {
    const { incoming, outgoing, connected } = relationships(this.graph, id);
    return `${incoming.length} incoming, ${outgoing.length} outgoing${connected.length ? `, ${connected.length} undirected` : ''}`;
  }

  renderFocus() {
    const node = this.graph.nodes.find(n => n.id === this.selected);
    if (!node) return;
    const direct = this.graph.edges.filter(e => e.source === node.id || e.target === node.id);
    const container = this.shadowRoot.querySelector('.focus-view');
    container.innerHTML = `<p class="focus-scope">Direct connections · ${direct.length} of ${this.graph.edges.length} in the full diagram</p><div class="focus-heading"><span class="node-role">${h(roleFor(node.shape))}</span><h3 tabindex="-1">${h(node.label)}</h3></div>${this.relationsHTML(node)}<p class="focus-note">Follow any connection to inspect the next step. Diagram and Read relationships retain all ${this.graph.nodes.length} steps.</p><button type="button" class="locate-button">Show this step in the full diagram</button>`;
    this.bindFollow(container);
    container.querySelector('.locate-button').addEventListener('click', () => { this.setMode('diagram'); this.follow(node.id); });
  }

  bindFollow(container) {
    container.querySelectorAll('[data-follow]').forEach(b => b.addEventListener('click', () => this.follow(b.dataset.follow)));
  }

  follow(id, recordHistory = true) {
    this.select(id, recordHistory);
    if (this.mode === 'focus') {
      this.shadowRoot.querySelector('.focus-heading h3')?.focus({ preventScroll: true });
      return;
    }
    if (this.mode === 'text') {
      const detail = [...this.shadowRoot.querySelectorAll('[data-reading-node]')].find(n => n.dataset.readingNode === id);
      detail.open = true;
      detail.querySelector('summary').focus();
      detail.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      return;
    }
    const target = [...this.shadowRoot.querySelectorAll('[data-node]')].find(n => n.dataset.node === id);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
  }

  zoom(scale, preserveFit = false) {
    this.hideRoute();
    if (!preserveFit) this.autoFit = false;
    if (this.showShelf) { this.updateOverview(); return; }
    if (this.round >= 5 && !preserveFit) this.viewport.style.height = `${Math.min(this.clientWidth < 600 ? 620 : 880, Math.max(420, this.layout.height + 12))}px`;
    const center = { x: (this.viewport.scrollLeft + this.viewport.clientWidth / 2) / this.scale, y: (this.viewport.scrollTop + this.viewport.clientHeight / 2) / this.scale };
    this.scale = Math.max(this.round >= 5 ? .03 : .12, Math.min(2.5, scale));
    this.updateOverview();
    const { width, height } = this.layout;
    this.shadowRoot.querySelector('.scene').style.transform = `scale(${this.scale})`;
    Object.assign(this.shadowRoot.querySelector('.sizer').style, { width: `${width * this.scale}px`, height: `${height * this.scale}px` });
    this.shadowRoot.querySelector('.zoom-value').value = `${Math.round(this.scale * 100)}%`;
    if (this.round >= 3) {
      this.viewport.scrollLeft = center.x * this.scale - this.viewport.clientWidth / 2;
      this.viewport.scrollTop = center.y * this.scale - this.viewport.clientHeight / 2;
      const overview = this.scale < .7;
      this.shadowRoot.querySelector('.scene').classList.toggle('is-overview', overview);
      this.shadowRoot.querySelector('.reader-help').textContent = overview ? 'Overview shows structure. Select a step or use search to restore readable size. Read relationships always keeps full-size text.' : 'Scroll to explore. Tab to a step, then Enter to inspect. Use + or − when the viewport is focused.';
    }
  }

  select(id, recordHistory = true) {
    this.hideRoute();
    this.selected = id;
    const node = this.graph.nodes.find(n => n.id === id);
    if (!node) return;
    this.updateOverview();
    const adjacency = relationships(this.graph, id);
    const related = new Set([id, ...Object.values(adjacency).flat().map(r => r.other)]);
    if (this.round >= 3) {
      if (recordHistory && this.history.at(-1) !== id) this.history.push(id);
      const journey = this.shadowRoot.querySelector('.journey');
      journey.hidden = false;
      journey.querySelector('button').disabled = this.history.length < 2;
      journey.querySelector('.journey-status').textContent = `${this.history.length} recently inspected ${this.history.length === 1 ? 'step' : 'steps'}`;
      if (this.scale < 1 && this.mode === 'diagram') {
        this.zoom(1);
        this.shadowRoot.querySelector(`[data-node="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      }
    }
    this.shadowRoot.querySelectorAll('[data-node]').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.node === id));
      b.classList.toggle('related', related.has(b.dataset.node));
    });
    this.shadowRoot.querySelectorAll('[data-edge]').forEach(el => {
      const edge = this.graph.edges.find(e => e.id === el.dataset.edge);
      el.classList.toggle('active', edge.source === id || edge.target === id);
    });
    const selection = this.shadowRoot.querySelector('.selection');
    selection.innerHTML = `<div class="selection-heading"><h3>${h(node.label)}</h3>${this.round >= 3 ? '<button type="button" class="focus-button">Follow this step</button>' : ''}</div>${this.relationsHTML(node)}`;
    selection.querySelector('.focus-button')?.addEventListener('click', () => {
      this.setMode('focus');
      this.shadowRoot.querySelector('.focus-heading h3')?.focus();
    });
    this.bindFollow(selection);
    this.shadowRoot.querySelector('#reader-announcement').textContent = `${node.label}. ${this.relationshipSummary(id)}.`;
    if (this.mode === 'focus') this.renderFocus();
  }
}
customElements.define('mermaid-reader', MermaidReader);
