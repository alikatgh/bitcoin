const NS = 'http://www.w3.org/2000/svg';
const COLOR = { bg: '#111817', line: '#31463b', lime: '#d0f58b', copper: '#f3a575', blue: '#8ebbe8', red: '#eb887d', pale: '#e9eee5' };
let serial = 0;

function number(value, fallback = 0) {
  try { const result = Number(value); return Number.isFinite(result) ? result : fallback; } catch { return fallback; }
}
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, number(value)));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (value) => { const t = clamp(value); return t * t * (3 - 2 * t); };
const ramp = (p, a, b) => smooth((p - a) / (b - a));
const beat = (p, index) => clamp(p * 12 - index);
const set = (node, attrs) => Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, String(value)));
const alpha = (node, value) => set(node, { opacity: clamp(value) });
const draw = (node, value) => set(node, { 'stroke-dasharray': 1, 'stroke-dashoffset': 1 - clamp(value) });

function element(tag, attrs, parent, content) {
  const node = document.createElementNS(NS, tag);
  set(node, attrs || {});
  if (content !== undefined) node.textContent = content;
  if (parent) parent.appendChild(node);
  return node;
}

function route(points, progress) {
  const t = clamp(progress) * (points.length - 1);
  const i = Math.min(points.length - 2, Math.floor(t));
  const local = smooth(t - i);
  return [mix(points[i][0], points[i + 1][0], local), mix(points[i][1], points[i + 1][1], local)];
}

function paymentPose(p) {
  const index = Math.min(11, Math.floor(p * 12));
  const t = beat(p, index), e = smooth(t);
  let x = 500, y = 455, area = 0.36;
  if (index === 0) { x = mix(330, 500, e); y = 340 - Math.sin(e * Math.PI) * 38; area = 1; }
  if (index === 1) { x = 500; y = 340; area = 1; }
  if (index === 2) { x = 500; y = mix(340, 420, e); area = mix(1, 0.72, e); }
  if (index === 3) { x = 500; y = mix(420, 455, e); area = mix(0.72, 0.36, e); }
  if (index === 6) { [x, y] = route([[500, 455], [500, 540], [600, 570], [660, 630]], e); }
  if (index === 7) {
    [x, y] = t < 0.58 ? [660, 630] : route([[660, 630], [600, 535], [500, 440], [500, 340], [330, 500]], ramp(t, 0.58, 1));
    area = mix(0.36, 0.7, ramp(t, 0.8, 1));
  }
  if (index === 8) {
    const merge = ramp(t, 0.12, 0.48), split = ramp(t, 0.6, 0.94);
    x = mix(mix(330, 500, merge), 650, split); y = mix(500, 475, split);
    area = 0.7 + 0.5 * merge - 0.2 * split;
  }
  if (index === 9) { [x, y] = route([[650, 475], [650, 405], [500, 445], [350, 490], [500, 540], [650, 475]], e); area = 1; }
  if (index === 10) { x = mix(650, 500, e); y = mix(475, 455, e); area = mix(1, 0.36, e); }
  return { x, y, scale: Math.sqrt(Math.max(0, area)), area };
}

/** A single scroll-driven world. No visible words, timers, or detached scenes. */
export function createContinuousScene(container) {
  if (!container || typeof container.appendChild !== 'function') throw new TypeError('A DOM container is required.');
  const id = `bitcoin-world-${++serial}`;
  const root = element('svg', {
    viewBox: '0 0 1000 800', width: '100%', height: '100%', preserveAspectRatio: 'xMidYMid meet', role: 'img',
    'aria-labelledby': `${id}-title ${id}-desc`, 'aria-label': 'A continuous visual journey through a peer-to-peer payment system',
    'data-continuous-world': 'true', 'data-progress': 0,
  });
  element('title', { id: `${id}-title` }, root, 'A payment becomes part of a shared history');
  element('desc', { id: `${id}-desc` }, root, 'One copper payment travels between wallets, is signed and broadcast, enters a proof-of-work block, and stays connected to a growing green chain. Its tree commitment and sibling proof unfold, input value combines and splits, and public addresses remain separate from private identities. An honest chain outpaces a competing red branch without implying guaranteed finality. Scroll changes the same persistent world. Coin areas illustrate conserved value; all network activity is illustrative.');
  const defs = element('defs', {}, root);
  const gradient = (name, stops, attrs = {}) => {
    const node = element('linearGradient', { id: `${id}-${name}`, x1: 0, y1: 0, x2: 1, y2: 1, ...attrs }, defs);
    stops.forEach(([offset, color]) => element('stop', { offset, 'stop-color': color }, node));
    return `url(#${id}-${name})`;
  };
  const copper = gradient('copper', [['0%', '#ffd6ad'], ['45%', COLOR.copper], ['100%', '#a45b3d']]);
  const green = gradient('green', [['0%', '#d0f58b'], ['100%', '#557d3e']]);
  const floor = element('radialGradient', { id: `${id}-floor` }, defs);
  element('stop', { offset: '0%', 'stop-color': COLOR.lime, 'stop-opacity': 0.1 }, floor);
  element('stop', { offset: '100%', 'stop-color': COLOR.lime, 'stop-opacity': 0 }, floor);
  const glow = element('filter', { id: `${id}-glow`, x: '-100%', y: '-100%', width: '300%', height: '300%' }, defs);
  element('feGaussianBlur', { stdDeviation: 6, result: 'blur' }, glow);
  const merge = element('feMerge', {}, glow);
  element('feMergeNode', { in: 'blur' }, merge); element('feMergeNode', { in: 'SourceGraphic' }, merge);
  const grid = element('pattern', { id: `${id}-grid`, width: 112, height: 64, patternUnits: 'userSpaceOnUse' }, defs);
  element('path', { d: 'M0 32L56 0L112 32L56 64Z', fill: 'none', stroke: COLOR.line, 'stroke-width': 0.75 }, grid);
  element('circle', { cx: 56, cy: 0, r: 1, fill: COLOR.lime, opacity: 0.35 }, grid);
  element('rect', { x: -1000, y: -2000, width: 3000, height: 4800, fill: `url(#${id}-grid)`, opacity: 0.16 }, root);
  const world = element('g', { 'data-object': 'persistent-world' }, root);
  const group = (name, parent = world) => element('g', { 'data-object': name }, parent);
  const path = (d, attrs = {}, parent = world) => element('path', { d, fill: 'none', stroke: COLOR.line, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...attrs }, parent);
  const circle = (cx, cy, r, attrs = {}, parent = world) => element('circle', { cx, cy, r, fill: COLOR.bg, stroke: COLOR.line, 'stroke-width': 2, ...attrs }, parent);
  const line = (attrs = {}, parent = world) => element('line', { x1: 0, y1: 0, x2: 0, y2: 0, stroke: COLOR.line, 'stroke-width': 2, ...attrs }, parent);
  const diamond = (parent, color = 'copper', size = 1) => {
    const token = group(`${color}-token`, parent);
    set(token, { transform: `scale(${size})` });
    path('M-39 3L0 40L39 3V14L0 51L-39 14Z', { fill: color === 'copper' ? '#8e4e35' : '#365c34', stroke: 'none' }, token);
    path('M0-37L39 3L0 40L-39 3Z', { fill: color === 'copper' ? copper : green, stroke: color === 'copper' ? '#ffd6ad' : COLOR.lime, 'stroke-width': 1.5 }, token);
    path('M0-22L24 3L0 27L-24 3Z', { stroke: color === 'copper' ? '#693b2c' : '#244f2d', 'stroke-width': 1.5, opacity: 0.65 }, token);
    path('M-13-5L0-18L13-5', { stroke: '#fff4ce', 'stroke-width': 2, opacity: 0.5 }, token);
    return token;
  };
  const halo = element('ellipse', { cx: 500, cy: 430, rx: 400, ry: 290, fill: `url(#${id}-floor)` }, world);
  const orbits = [0, 1, 2].map((i) => element('ellipse', { cx: 500, cy: 410, rx: 250 + i * 58, ry: 175 + i * 37, fill: 'none', stroke: COLOR.line, 'stroke-width': 1, 'stroke-dasharray': i === 1 ? '2 12' : 'none', opacity: 0.3 }, world));

  const peerLinks = group('peer-connections');
  const peerPoints = [[500, 160], [750, 270], [780, 515], [500, 680], [220, 515], [250, 270]];
  const peerEdges = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 3], [1, 4], [2, 5]];
  const mesh = peerEdges.map(() => line({ 'stroke-width': 1.5, opacity: 0.5 }, peerLinks));
  const peers = peerPoints.map((_, index) => {
    const node = group(`peer-${index}`);
    const ring = circle(0, 0, 38, { stroke: COLOR.blue, 'stroke-width': 1.2, opacity: 0.65 }, node);
    path('M-25-8L0-22L25-8L0 7Z', { fill: '#26382d', stroke: COLOR.blue, 'stroke-width': 1.5 }, node);
    path('M-25-8V14L0 29V7M25-8V14L0 29', { fill: '#17271e', stroke: COLOR.blue, 'stroke-width': 1.5 }, node);
    [-12, -5, 2].forEach((x) => path(`M${x} 8v6`, { stroke: COLOR.lime, 'stroke-width': 1.5 }, node));
    const tick = path('M23-28l6 6l13-16', { stroke: COLOR.lime, 'stroke-width': 3, opacity: 0 }, node);
    return { node, ring, tick };
  });

  function wallet(name, receiver) {
    const node = group(name);
    circle(0, -83, 17, { fill: '#24372c', stroke: COLOR.pale, 'stroke-width': 1.5 }, node);
    path('M-30-42Q-28-69 0-69Q28-69 30-42', { stroke: COLOR.pale, 'stroke-width': 2 }, node);
    path('M-66-26L37-41L62-18V48L-47 65L-66 45Z', { fill: '#17251d', stroke: COLOR.pale, 'stroke-width': 1.6 }, node);
    path('M-66-26L-45-7L62-18M-45-7V65', { stroke: '#668373', 'stroke-width': 1.5 }, node);
    path('M18 4L62-2V26L18 32L10 20Z', { fill: '#263c2c', stroke: receiver ? COLOR.blue : COLOR.copper, 'stroke-width': 1.5 }, node);
    circle(34, 15, 4, { fill: receiver ? COLOR.blue : COLOR.copper, stroke: 'none' }, node);
    path('M-46-17L32-29', { stroke: COLOR.line, 'stroke-width': 2 }, node);
    return node;
  }
  const sender = wallet('sender-wallet', false), receiver = wallet('receiver-wallet', true);
  const directRoute = path('', { stroke: COLOR.copper, opacity: 0.5, 'pathLength': 1, 'stroke-dasharray': 1 }, peerLinks);
  const signKey = group('private-signing-key');
  circle(-28, 0, 17, { stroke: COLOR.copper, 'stroke-width': 5, fill: '#2a211b' }, signKey);
  path('M-11 0H37L45 8L36 17M20 0V12M8 0V9', { stroke: COLOR.copper, 'stroke-width': 5 }, signKey);
  const signTether = path('', { stroke: COLOR.copper, 'stroke-width': 1.5, 'stroke-dasharray': '3 7', opacity: 0.4 });
  const signatureArc = path('', { stroke: COLOR.lime, 'stroke-width': 2, 'pathLength': 1 });

  const broadcast = group('transaction-broadcast');
  const broadcasts = peerPoints.map(() => ({ wire: line({ stroke: COLOR.copper, 'stroke-width': 1.2, opacity: 0.45 }, broadcast), packet: circle(0, 0, 5, { fill: COLOR.copper, stroke: 'none' }, broadcast) }));
  const wave = [0, 1, 2].map(() => element('ellipse', { cx: 500, cy: 420, rx: 1, ry: 1, fill: 'none', stroke: COLOR.copper, 'stroke-width': 1 }, broadcast));

  const chain = group('shared-chain');
  const chainLinks = Array.from({ length: 6 }, () => line({ stroke: COLOR.lime, 'stroke-width': 3 }, chain));
  const chainPoints = [[155, 485], [270, 465], [385, 445], [500, 425], [615, 405], [730, 385], [845, 365]];
  const blocks = chainPoints.map((_, i) => {
    const node = group(i === 3 ? 'original-payment-block' : `chain-block-${i}`, chain);
    const body = group(`block-geometry-${i}`, node);
    const faces = [
      path('M-48-17L0-45L48-17L0 12Z', { fill: '#233a29', stroke: COLOR.lime, 'stroke-width': 1.5 }, body),
      path('M-48-17V39L0 68V12Z', { fill: '#17291d', stroke: COLOR.lime, 'stroke-width': 1.5 }, body),
      path('M48-17V39L0 68V12Z', { fill: '#1e3323', stroke: COLOR.lime, 'stroke-width': 1.5 }, body),
    ];
    [-16, -2, 12].forEach((x) => path(`M${x} 5l13-8`, { stroke: COLOR.lime, 'stroke-width': 2, opacity: 0.4 }, body));
    const rootBadge = circle(0, -14, 7, { fill: COLOR.lime, stroke: '#192e1a', 'stroke-width': 2 }, body);
    const details = group(`block-transactions-${i}`, body);
    [0, 1, 2].forEach((j) => path(`M${-34 + j * 10} ${10 + j * 8}l19 11v7l-19-11Z`, { fill: i === 3 ? COLOR.copper : '#73965a', stroke: 'none', opacity: 0.75 }, details));
    return { node, body, rootBadge, details, faces };
  });
  const gather = group('transaction-gathering');
  const gathered = [[260, 520], [360, 630], [640, 630], [740, 520]].map((start, i) => {
    const node = group(`gathered-transaction-${i}`, gather); diamond(node, 'copper', 0.28);
    return { node, start };
  });
  const nonceCloud = group('work-search');
  const nonces = Array.from({ length: 16 }, (_, i) => {
    const node = group(`nonce-attempt-${i}`, nonceCloud);
    const shape = path('M0-7L7 0L0 7L-7 0Z', { fill: '#536758', stroke: COLOR.line, 'stroke-width': 1 }, node);
    return { node, shape };
  });
  const workSeal = group('valid-work');
  path('M0-28L24-16V7Q22 23 0 34Q-22 23-24 7V-16Z', { fill: '#1d3422', stroke: COLOR.lime, 'stroke-width': 2 }, workSeal);
  const workTick = path('M-12 1L-3 10L15-11', { stroke: COLOR.lime, 'stroke-width': 3, 'pathLength': 1 }, workSeal);

  const miner = group('miner');
  path('M-30 27L0 44L30 27V-6L0-23L-30-6Z', { fill: '#1f3024', stroke: COLOR.lime, 'stroke-width': 1.5 }, miner);
  path('M-20 16L16-21M-13-25Q10-35 30-12', { stroke: COLOR.lime, 'stroke-width': 5 }, miner);
  const award = group('miner-award'); diamond(award, 'green', 0.45);
  const feeAwards = [0, 1, 2].map((i) => { const node = group(`fee-award-${i}`); diamond(node, 'copper', 0.13); return node; });
  const awardTrail = path('', { stroke: COLOR.lime, 'stroke-width': 1.5, opacity: 0.5 });

  const tree = group('retained-merkle-tree');
  const treeSegments = [[[500, 340], [500, 440]], [[500, 440], [400, 535]], [[500, 440], [600, 535]], [[400, 535], [340, 630]], [[400, 535], [460, 630]], [[600, 535], [540, 630]], [[600, 535], [660, 630]]];
  const treeLines = treeSegments.map(() => line({ stroke: COLOR.blue, 'stroke-width': 2 }, tree));
  const hashPoints = [[500, 440], [400, 535], [600, 535], [340, 630], [460, 630], [540, 630], [660, 630]];
  const hashes = hashPoints.map((_, i) => {
    const node = group(`merkle-hash-${i}`, tree);
    path('M0-16L18-6V10L0 20L-18 10V-6Z', { fill: '#172a28', stroke: i === 0 ? COLOR.lime : COLOR.blue, 'stroke-width': 1.5 }, node);
    path('M-8-2L0-7L8-2M-8 5L0 10L8 5', { stroke: i === 0 ? COLOR.lime : COLOR.blue, 'stroke-width': 1.5 }, node);
    return node;
  });
  const oldLeaves = [340, 460, 540].map((x, i) => { const node = group(`pruned-transaction-${i}`, tree); diamond(node, 'copper', 0.32); return { node, x }; });
  const proofPath = path('', { stroke: COLOR.copper, 'stroke-width': 4, 'pathLength': 1, opacity: 0 }, tree);
  const proofPacket = circle(0, 0, 6, { fill: COLOR.copper, stroke: 'none' }, tree);

  const valueParts = group('conserved-value');
  const input = group('second-input', valueParts); diamond(input);
  const change = group('change-output', valueParts); diamond(change);
  const fee = group('fee-difference', valueParts); diamond(fee);
  const valueWires = [0, 1, 2].map(() => path('', { stroke: COLOR.copper, 'stroke-width': 1.5, opacity: 0.45 }, valueParts));
  const valueHalo = element('ellipse', { cx: 500, cy: 500, rx: 150, ry: 72, fill: 'none', stroke: COLOR.copper, 'stroke-width': 1, opacity: 0.3 }, valueParts);

  const privacy = group('public-address-graph');
  const addressPoints = [[350, 490], [500, 445], [650, 405], [500, 540]];
  const addressPairs = [[0, 1], [1, 2], [0, 3], [3, 2]];
  const addressWires = addressPairs.map(() => line({ stroke: COLOR.blue, 'stroke-width': 1.5 }, privacy));
  const addresses = addressPoints.map((_, i) => {
    const node = group(`public-address-${i}`, privacy);
    path('M0-28L26-14V16L0 31L-26 16V-14Z', { fill: '#162625', stroke: COLOR.blue, 'stroke-width': 1.5 }, node);
    const marks = [0, 1, 2, 3].map(() => circle(0, 0, 3, { fill: COLOR.blue, stroke: 'none' }, node));
    return { node, marks };
  });
  const privacyBoundary = [0, 1].map(() => path('', { stroke: COLOR.pale, 'stroke-width': 1, 'stroke-dasharray': '2 12', opacity: 0.3 }));
  const identityClues = [0, 1].map(() => path('', { stroke: COLOR.red, 'stroke-width': 1.2, 'stroke-dasharray': '2 11', opacity: 0 }));

  const fork = group('competing-history');
  const forkLines = [line({ stroke: COLOR.red, 'stroke-width': 2, 'stroke-dasharray': '4 5' }, fork), line({ stroke: COLOR.red, 'stroke-width': 2 }, fork)];
  const forkPoints = [[530, 550], [665, 605]];
  const forkBlocks = forkPoints.map((_, i) => {
    const node = group(`competing-block-${i}`, fork);
    path('M-43-17L0-42L43-17L0 8Z', { fill: '#402721', stroke: COLOR.red, 'stroke-width': 1.5 }, node);
    path('M-43-17V24L0 49L43 24V-17M0 8V49', { fill: '#281f1b', stroke: COLOR.red, 'stroke-width': 1.5 }, node);
    return node;
  });
  const finalSignals = peerPoints.map(() => circle(0, 0, 4, { fill: COLOR.lime, stroke: 'none' }));
  const paymentTrail = path('', { stroke: COLOR.copper, 'stroke-width': 3, opacity: 0.4 });
  const paymentGlow = circle(0, 0, 42, { fill: COLOR.copper, stroke: 'none', opacity: 0.13, filter: `url(#${id}-glow)` });
  const payment = group('original-payment'); diamond(payment);
  const paymentSeal = path('M-10 0L-2 9L14-10', { stroke: COLOR.lime, 'stroke-width': 3, opacity: 0 }, payment);

  container.appendChild(root);
  let destroyed = false;

  function render(progress, options = {}) {
    if (destroyed) return;
    const p = clamp(progress), opts = options && typeof options === 'object' ? options : {};
    const reduced = Boolean(opts.reducedMotion);
    const aspect = clamp(number(opts.aspect, 1.25), 0.25, 3);
    const portrait = clamp((0.95 - aspect) / 0.5);
    const horizontal = mix(1, 0.66, portrait), vertical = mix(1, 2, portrait);
    const X = (x) => 500 + (x - 500) * horizontal, Y = (y) => 400 + (y - 400) * vertical;
    const at = (node, x, y, scale = 1, rotation = 0) => set(node, { transform: `translate(${X(x)},${Y(y)}) rotate(${rotation}) scale(${scale})` });
    const wire = (node, a, b) => set(node, { x1: X(a[0]), y1: Y(a[1]), x2: X(b[0]), y2: Y(b[1]) });
    const dPath = (points) => points.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x)},${Y(y)}`).join(' ');
    const width = mix(1000, 720, portrait), height = mix(800, width / aspect, portrait);
    set(root, { viewBox: `${500 - width / 2} ${400 - height / 2} ${width} ${height}`, 'data-progress': p.toFixed(6), 'data-beat': Math.min(11, Math.floor(p * 12)), 'data-reduced-motion': reduced });
    const zoom = reduced ? 1 : 1 + 0.035 * Math.sin(p * Math.PI) - 0.02 * beat(p, 11);
    set(world, { transform: `translate(500,400) scale(${zoom}) translate(-500,-400)` });
    set(halo, { rx: 400 * horizontal, ry: 290 * vertical });
    orbits.forEach((node, i) => set(node, { rx: (250 + i * 58) * horizontal, ry: (175 + i * 37) * vertical }));

    const networkActive = ramp(p, 2 / 12, 3 / 12);
    mesh.forEach((node, i) => { wire(node, peerPoints[peerEdges[i][0]], peerPoints[peerEdges[i][1]]); alpha(node, 0.13 + 0.32 * networkActive + 0.2 * beat(p, 11)); set(node, { stroke: p > 5 / 12 ? COLOR.lime : COLOR.blue }); });
    peers.forEach(({ node, ring, tick }, i) => {
      at(node, ...peerPoints[i]); alpha(node, 0.3 + 0.65 * networkActive);
      set(ring, { stroke: p > 5 / 12 ? COLOR.lime : COLOR.blue });
      alpha(tick, ramp(beat(p, 5), i * 0.05, 0.25 + i * 0.05));
    });
    const walletMove = ramp(p, 2 / 12, 4 / 12), privateReturn = ramp(p, 8.8 / 12, 9.2 / 12);
    const walletOpacity = (0.95 - 0.72 * walletMove) + 0.42 * privateReturn * (1 - beat(p, 10));
    at(sender, mix(260, 145, walletMove), mix(350, 320, privateReturn)); at(receiver, mix(740, 855, walletMove), mix(350, 320, privateReturn));
    alpha(sender, walletOpacity); alpha(receiver, walletOpacity);
    set(directRoute, { d: `M${X(305)},${Y(340)}Q${X(500)},${Y(210)} ${X(695)},${Y(340)}` });
    draw(directRoute, ramp(p, 0, 0.8 / 12)); alpha(directRoute, 0.5 * (1 - ramp(p, 2 / 12, 3 / 12)));

    const signing = beat(p, 1);
    at(signKey, mix(335, 438, ramp(signing, 0.05, 0.62)), mix(258, 293, ramp(signing, 0.05, 0.62)), 1, reduced ? 0 : mix(-28, 12, smooth(signing)));
    alpha(signKey, ramp(p, 0.7 / 12, 1.1 / 12) * (1 - ramp(p, 1.9 / 12, 2.25 / 12)));
    set(signTether, { d: dPath([[260, 305], [335, 258], [438, 293]]) });
    alpha(signTether, 0.45 * ramp(signing, 0, 0.3) * (1 - ramp(p, 2 / 12, 2.3 / 12)));
    set(signatureArc, { d: `M${X(454)},${Y(355)}Q${X(500)},${Y(395)} ${X(546)},${Y(355)}` });
    draw(signatureArc, ramp(signing, 0.45, 0.9)); alpha(signatureArc, 1 - ramp(p, 2.4 / 12, 2.9 / 12));

    const sending = beat(p, 2);
    alpha(broadcast, ramp(p, 2 / 12, 2.12 / 12) * (1 - ramp(p, 2.95 / 12, 3.3 / 12)));
    broadcasts.forEach(({ wire: edge, packet }, i) => {
      wire(edge, [500, 420], peerPoints[i]);
      const t = ramp(sending, i * 0.045, 0.58 + i * 0.045);
      set(packet, { cx: X(mix(500, peerPoints[i][0], t)), cy: Y(mix(420, peerPoints[i][1], t)) });
      alpha(packet, reduced ? 0 : ramp(sending, i * 0.045, 0.1 + i * 0.045) * (1 - ramp(sending, 0.75 + i * 0.025, 0.9 + i * 0.025)));
    });
    wave.forEach((node, i) => { const t = clamp((sending - i * 0.16) / 0.65); set(node, { cx: X(500), cy: Y(420), rx: mix(20, 255, t) * horizontal, ry: mix(12, 175, t) * vertical }); alpha(node, reduced ? 0 : 0.45 * Math.sin(t * Math.PI)); });

    const gathering = beat(p, 3), accepted = ramp(p, 4.75 / 12, 5 / 12);
    const compressed = ramp(p, 6.05 / 12, 6.8 / 12);
    const lifted = ramp(p, 6 / 12, 6.8 / 12), liftedFurther = ramp(p, 8 / 12, 8.25 / 12), restored = ramp(p, 10 / 12, 10.45 / 12);
    const chainOffset = (-85 * lifted - 80 * liftedFurther) * (1 - restored);
    const depth = mix(1, 0.32, compressed * (1 - restored));
    blocks.forEach(({ node, body, rootBadge, details, faces }, i) => {
      const [x, y] = chainPoints[i]; at(node, x, y + chainOffset); set(body, { transform: `scale(1,${depth})` });
      let show;
      if (i === 3) show = ramp(p, 3 / 12, 3.25 / 12);
      else if (i < 3) show = ramp(p, (5.05 + (2 - i) * 0.12) / 12, (5.35 + (2 - i) * 0.12) / 12);
      else if (i === 4) show = ramp(p, 5.45 / 12, 5.95 / 12);
      else show = ramp(p, (10.15 + (i - 5) * 0.28) / 12, (10.5 + (i - 5) * 0.28) / 12);
      alpha(node, show); alpha(rootBadge, 0.25 + 0.75 * compressed); alpha(details, 1 - 0.88 * compressed);
      if (i === 3) {
        set(node, { 'data-accepted': accepted.toFixed(4) });
        const valid = accepted > 0.5;
        faces.forEach((face, faceIndex) => set(face, { stroke: valid ? COLOR.lime : COLOR.blue, fill: valid ? ['#233a29', '#17291d', '#1e3323'][faceIndex] : ['#203337', '#16262a', '#1a2d31'][faceIndex] }));
        set(rootBadge, { fill: valid ? COLOR.lime : COLOR.blue });
      }
    });
    chainLinks.forEach((node, i) => {
      const a = chainPoints[i], b = chainPoints[i + 1]; wire(node, [a[0] + 45, a[1] + chainOffset + 10], [b[0] - 45, b[1] + chainOffset + 10]);
      const start = i < 3 ? (5.12 + (2 - i) * 0.12) / 12 : i === 3 ? 5.5 / 12 : (10.2 + (i - 4) * 0.28) / 12;
      alpha(node, ramp(p, start, start + 0.025));
    });
    gathered.forEach(({ node, start }, i) => { const t = ramp(gathering, i * 0.07, 0.65 + i * 0.07); at(node, mix(start[0], 500, t), mix(start[1], 420, t)); alpha(node, ramp(p, 2.85 / 12, 3.1 / 12) * (1 - ramp(gathering, 0.7 + i * 0.05, 0.9 + i * 0.025))); });
    alpha(gather, 1 - ramp(p, 3.95 / 12, 4.15 / 12));

    const working = beat(p, 4);
    alpha(nonceCloud, ramp(p, 4 / 12, 4.1 / 12) * (1 - ramp(p, 4.85 / 12, 5.1 / 12)));
    nonces.forEach(({ node, shape }, i) => {
      const angle = i / nonces.length * Math.PI * 2 + (reduced ? 0 : working * 1.6), radius = mix(105, i === 15 ? 0 : 125, ramp(working, 0.55, 0.88));
      const x = 500 + Math.cos(angle) * radius, y = 425 + Math.sin(angle) * radius * 0.7;
      at(node, x, i === 15 ? mix(y, 385, ramp(working, 0.55, 0.88)) : y, 1, reduced ? 0 : working * 70);
      alpha(node, i === 15 ? 1 : 1 - ramp(working, 0.55 + i * 0.01, 0.8 + i * 0.01));
      set(shape, { fill: i === 15 && working > 0.72 ? COLOR.lime : '#536758', stroke: i === 15 && working > 0.72 ? COLOR.lime : COLOR.line });
    });
    at(workSeal, 500, 353 + chainOffset, 0.8); alpha(workSeal, accepted * (1 - ramp(p, 6 / 12, 6.4 / 12))); draw(workTick, accepted);

    const reward = beat(p, 5);
    at(miner, 805, 585); alpha(miner, 0.18 + 0.82 * ramp(p, 4.8 / 12, 5.15 / 12));
    at(award, mix(530, 787, ramp(reward, 0.1, 0.72)), mix(405, 520, ramp(reward, 0.1, 0.72)));
    alpha(award, ramp(reward, 0.05, 0.2) * (1 - 0.7 * ramp(p, 6 / 12, 6.4 / 12)));
    feeAwards.forEach((node, i) => { const t = ramp(reward, 0.23 + i * 0.07, 0.8 + i * 0.04); at(node, mix(500, 770 + i * 17, t), mix(455, 549 + i * 6, t)); alpha(node, ramp(reward, 0.15 + i * 0.06, 0.3 + i * 0.06) * (1 - 0.7 * ramp(p, 6 / 12, 6.4 / 12))); });
    set(awardTrail, { d: `M${X(530)},${Y(405)}Q${X(730)},${Y(360)} ${X(787)},${Y(520)}` }); alpha(awardTrail, 0.45 * ramp(reward, 0.05, 0.4) * (1 - ramp(p, 6 / 12, 6.5 / 12)));

    const unfolding = beat(p, 6), proving = beat(p, 7);
    const treeVisibility = ramp(p, 6 / 12, 6.25 / 12) * (1 - ramp(p, 8 / 12, 8.25 / 12));
    alpha(tree, treeVisibility);
    treeLines.forEach((node, i) => { wire(node, treeSegments[i][0], treeSegments[i][1]); const prune = i === 3 || i === 4; alpha(node, ramp(unfolding, i * 0.03, 0.35 + i * 0.03) * (prune ? 1 - 0.94 * ramp(unfolding, 0.58, 0.94) : 1)); });
    hashes.forEach((node, i) => { at(node, ...hashPoints[i]); alpha(node, ramp(unfolding, i * 0.025, 0.3 + i * 0.025) * (i === 3 || i === 4 ? 1 - 0.92 * ramp(unfolding, 0.58, 0.94) : 1)); });
    oldLeaves.forEach(({ node, x }, i) => { at(node, x, 680); alpha(node, ramp(unfolding, i * 0.04, 0.25 + i * 0.04) * (1 - ramp(unfolding, 0.58, 0.94))); });
    set(proofPath, { d: dPath([[660, 630], [600, 535], [500, 440], [500, 340]]) }); draw(proofPath, ramp(proving, 0.08, 0.72)); alpha(proofPath, ramp(p, 7 / 12, 7.1 / 12));
    const proofAt = route([[660, 630], [600, 535], [500, 440], [500, 340]], ramp(proving, 0.08, 0.72)); set(proofPacket, { cx: X(proofAt[0]), cy: Y(proofAt[1]) }); alpha(proofPacket, reduced ? 0 : ramp(proving, 0.02, 0.12) * (1 - ramp(proving, 0.76, 0.9)));

    const value = beat(p, 8), merging = ramp(value, 0.12, 0.48), splitting = ramp(value, 0.6, 0.94);
    alpha(valueParts, ramp(p, 7.92 / 12, 8.05 / 12) * (1 - ramp(p, 8.96 / 12, 9.2 / 12)));
    const inputArea = 0.5 * (1 - merging), changeArea = 0.19 * splitting, feeArea = 0.01 * splitting;
    at(input, mix(670, 500, merging), 500, Math.sqrt(inputArea)); alpha(input, inputArea > 0 ? 1 : 0);
    at(change, mix(500, 355, splitting), mix(500, 560, splitting), Math.sqrt(changeArea)); alpha(change, splitting);
    at(fee, 500, mix(500, 645, splitting), Math.sqrt(feeArea)); alpha(fee, splitting);
    set(valueParts, { 'data-input-area': inputArea, 'data-change-area': changeArea, 'data-fee-area': feeArea, 'data-total-area': 1.2 });
    set(valueWires[0], { d: dPath([[330, 500], [500, 500], [670, 500]]) });
    set(valueWires[1], { d: dPath([[500, 500], [355, 560]]) }); alpha(valueWires[1], splitting);
    set(valueWires[2], { d: dPath([[500, 500], [500, 645]]) }); alpha(valueWires[2], splitting);
    set(valueHalo, { cx: X(500), cy: Y(500), rx: 150 * horizontal, ry: 72 * vertical });

    const privacyProgress = beat(p, 9), privacyVisibility = ramp(p, 8.9 / 12, 9.1 / 12) * (1 - ramp(p, 10 / 12, 10.3 / 12));
    alpha(privacy, privacyVisibility);
    addresses.forEach(({ node, marks }, i) => { at(node, ...addressPoints[i]); marks.forEach((mark, j) => { const variant = Math.min(2, Math.floor(privacyProgress * 3)); const a = (j + i + variant) * Math.PI / 2; set(mark, { cx: Math.cos(a) * (7 + variant * 2), cy: Math.sin(a) * (7 + variant * 2), r: j === variant ? 4 : 2.5 }); }); });
    addressWires.forEach((node, i) => wire(node, addressPoints[addressPairs[i][0]], addressPoints[addressPairs[i][1]]));
    privacyBoundary.forEach((node, i) => { const x = i ? 745 : 255; set(node, { d: dPath([[x, 240], [x, 590]]) }); alpha(node, 0.5 * privacyVisibility); });
    set(identityClues[0], { d: dPath([[180, 320], [255, 360], [350, 490]]) }); set(identityClues[1], { d: dPath([[820, 320], [745, 360], [650, 405]]) });
    identityClues.forEach((node) => alpha(node, 0.28 * ramp(privacyProgress, 0.66, 0.94) * privacyVisibility));

    const race = beat(p, 10);
    forkBlocks.forEach((node, i) => { at(node, ...forkPoints[i]); alpha(node, ramp(race, i * 0.12, 0.22 + i * 0.12)); });
    wire(forkLines[0], [385, 445 + chainOffset], forkPoints[0]); wire(forkLines[1], forkPoints[0], forkPoints[1]);
    alpha(fork, ramp(p, 10 / 12, 10.2 / 12) * (1 - 0.84 * ramp(p, 10.6 / 12, 11.15 / 12)));
    finalSignals.forEach((node, i) => { const t = ramp(beat(p, 11), i * 0.065, 0.65 + i * 0.04); set(node, { cx: X(mix(peerPoints[i][0], 500, t)), cy: Y(mix(peerPoints[i][1], 425, t)) }); alpha(node, reduced ? 0 : ramp(beat(p, 11), i * 0.065, 0.1 + i * 0.065) * (1 - ramp(beat(p, 11), 0.8 + i * 0.015, 0.94 + i * 0.01))); });

    const pose = paymentPose(p), priorProgress = Math.max(0, p - 0.014), prior = paymentPose(priorProgress);
    const planeY = (position, point) => {
      const inside = ramp(point, 3 / 12, 3.8 / 12) * (1 - ramp(point, 6 / 12, 6.3 / 12)) + ramp(point, 10.7 / 12, 11 / 12);
      return Y(position.y) + (30 - 30 * vertical) * inside;
    };
    const paymentY = planeY(pose, p), priorY = planeY(prior, priorProgress);
    set(payment, { transform: `translate(${X(pose.x)},${paymentY}) scale(${pose.scale})`, 'data-area': pose.area });
    set(paymentGlow, { cx: X(pose.x), cy: paymentY, r: 42 * pose.scale }); alpha(paymentGlow, reduced ? 0.08 : 0.13 + 0.04 * Math.sin(p * Math.PI));
    set(paymentTrail, { d: `M${X(prior.x)},${priorY}L${X(pose.x)},${paymentY}` }); alpha(paymentTrail, reduced ? 0 : 0.4);
    alpha(paymentSeal, ramp(p, 1.45 / 12, 1.9 / 12));
  }

  render(0);
  return { render, destroy() { if (destroyed) return; destroyed = true; root.remove(); } };
}
