import { attackerSuccess } from './math.js';

// Every scene is a pure picture of progress. Nothing here owns a clock.
const NS = 'http://www.w3.org/2000/svg';
const C = {
  bg: '#111817', text: '#e9eee5', dim: '#87938a', line: '#3b4a41',
  green: '#d0f58b', copper: '#f3a575', red: '#eb887d', blue: '#8ebbe8',
};
let instance = 0;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const ease = (v) => { const t = clamp(v); return t * t * (3 - 2 * t); };
const phase = (p, a, b) => ease((p - a) / (b - a));
const mix = (a, b, t) => a + (b - a) * t;
const attr = (node, values) => Object.entries(values).forEach(([k, v]) => node.setAttribute(k, String(v)));
const opacity = (node, v) => node.setAttribute('opacity', clamp(v));

function el(tag, attrs, parent, content) {
  const node = document.createElementNS(NS, tag);
  attr(node, attrs || {});
  if (content !== undefined) node.textContent = String(content);
  if (parent) parent.appendChild(node);
  return node;
}

function canvas(id, title, description) {
  const suffix = `${id}-${++instance}`;
  const root = el('svg', {
    viewBox: '0 0 900 500', width: '100%', height: '100%', role: 'img',
    'aria-labelledby': `${suffix}-title ${suffix}-desc`, 'data-scene': id,
    class: `diagram diagram-${id}`, style: 'overflow:visible;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
  });
  el('title', { id: `${suffix}-title` }, root, title);
  el('desc', { id: `${suffix}-desc` }, root, description);
  const defs = el('defs', {}, root);
  const arrows = {};
  ['dim', 'green', 'copper', 'red', 'blue'].forEach((color) => {
    const markerId = `${suffix}-arrow-${color}`;
    const marker = el('marker', { id: markerId, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse' }, defs);
    el('path', { d: 'M 1 1 L 8 5 L 1 9', fill: 'none', stroke: C[color], 'stroke-width': 1.5 }, marker);
    arrows[color] = `url(#${markerId})`;
  });
  const g = (name, parent = root, attrs = {}) => el('g', { 'data-part': name, class: `${id}-${name}`, ...attrs }, parent);
  const t = (x, y, content, attrs = {}, parent = root) => el('text', { x, y, fill: C.text, 'font-size': 18, 'font-weight': 450, class: 'diagram-label', ...attrs }, parent, content);
  const small = (x, y, content, attrs = {}, parent = root) => t(x, y, content, { 'font-size': 15, fill: C.dim, class: 'diagram-small', ...attrs }, parent);
  const mono = (x, y, content, attrs = {}, parent = root) => t(x, y, content, { 'font-size': 16, 'font-family': 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace', class: 'diagram-mono', ...attrs }, parent);
  const line = (x1, y1, x2, y2, attrs = {}, parent = root) => el('line', { x1, y1, x2, y2, stroke: C.line, 'stroke-width': 1.5, ...attrs }, parent);
  const path = (d, attrs = {}, parent = root) => el('path', { d, fill: 'none', stroke: C.line, 'stroke-width': 1.5, ...attrs }, parent);
  const rect = (x, y, width, height, attrs = {}, parent = root) => el('rect', { x, y, width, height, rx: 3, fill: C.bg, stroke: C.line, 'stroke-width': 1.5, ...attrs }, parent);
  const circle = (cx, cy, r, attrs = {}, parent = root) => el('circle', { cx, cy, r, fill: C.bg, stroke: C.line, 'stroke-width': 1.5, ...attrs }, parent);
  const packet = (color = 'copper', parent = root) => circle(0, 0, 5, { fill: C[color], stroke: C[color], 'data-packet': color }, parent);
  const note = (content) => small(450, 474, content, { 'text-anchor': 'middle', 'font-size': 15, 'data-diagram-note': 'true' });
  return { root, g, t, small, mono, line, path, rect, circle, packet, arrows, note };
}

function move(node, points, t) {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
  let distance = clamp(t) * lengths.reduce((a, b) => a + b, 0);
  let index = 0;
  while (index < lengths.length - 1 && distance > lengths[index]) distance -= lengths[index++];
  const local = lengths[index] ? distance / lengths[index] : 0;
  attr(node, { cx: mix(points[index][0], points[index + 1][0], local), cy: mix(points[index][1], points[index + 1][1], local) });
}

function person(s, x, y, label, color = 'text', parent = s.root) {
  const group = s.g(`person-${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`, parent);
  s.circle(x, y - 12, 11, { stroke: C[color], 'stroke-width': 1.7 }, group);
  s.path(`M${x - 22} ${y + 22} C${x - 22} ${y - 2} ${x + 22} ${y - 2} ${x + 22} ${y + 22}`, { stroke: C[color], 'stroke-width': 1.7 }, group);
  s.t(x, y + 53, label, { 'text-anchor': 'middle', 'font-size': 21 }, group);
  return group;
}

function nodeGlyph(s, x, y, name, parent, color = 'dim') {
  const group = s.g(`node-${name}`, parent);
  const ring = s.circle(x, y, 25, { stroke: C[color] }, group);
  s.rect(x - 10, y - 9, 20, 15, { rx: 1, stroke: C[color], fill: 'none' }, group);
  s.line(x - 6, y + 11, x + 6, y + 11, { stroke: C[color] }, group);
  if (name) s.small(x, y + 48, name, { 'text-anchor': 'middle', 'font-size': 15 }, group);
  return { group, ring };
}

function check(s, x, y, parent = s.root, color = 'green') {
  return s.path(`M${x - 7} ${y} l5 5 l10 -12`, { stroke: C[color], 'stroke-width': 2.3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'data-check': 'valid' }, parent);
}

function introduction() {
  const s = canvas('introduction', 'From an intermediary to direct payment', 'A sender initially routes a payment through a central mint. The intermediary fades as a signed payment moves directly to the receiver and peers independently verify a shared history.');
  person(s, 120, 227, 'Sender'); person(s, 780, 227, 'Receiver');
  const central = s.g('central-mint');
  s.path('M164 220 L400 142 M500 142 L736 220', { 'marker-end': s.arrows.dim }, central);
  s.path('M412 118 L450 95 L488 118 Z M418 125 V160 M438 125 V160 M462 125 V160 M482 125 V160 M409 168 H491', { stroke: C.dim, 'stroke-width': 2 }, central);
  s.t(450, 198, 'Trusted intermediary', { 'text-anchor': 'middle', fill: C.dim, 'font-size': 20 }, central);
  const direct = s.g('direct-payment');
  s.line(172, 245, 728, 245, { stroke: C.green, 'stroke-width': 2, 'marker-end': s.arrows.green }, direct);
  s.t(450, 223, 'Signed payment', { 'text-anchor': 'middle', fill: C.green, 'font-size': 23 }, direct);
  const payment = s.packet('copper', direct);
  const peers = s.g('shared-verification');
  const locations = [[290, 350], [450, 390], [610, 350]];
  s.path('M290 350 L450 390 L610 350 M290 350 L610 350', { 'stroke-dasharray': '4 7' }, peers);
  const nodes = locations.map(([x, y], i) => nodeGlyph(s, x, y, `Peer ${i + 1}`, peers));
  const checks = locations.map(([x, y]) => check(s, x + 27, y - 18, peers));
  s.path('M300 245 L290 322 M450 245 V362 M600 245 L610 322', { stroke: C.green, 'stroke-dasharray': '3 7', opacity: 0.5 }, peers);
  const history = s.g('costly-public-history');
  s.t(450, 73, 'History secured by work', { 'text-anchor': 'middle', 'font-size': 22, fill: C.green }, history);
  [350, 430, 510].forEach((x, i) => {
    s.rect(x, 96, 58, 47, { stroke: C.green, 'data-history-block': i + 1 }, history);
    s.mono(x + 29, 125, '000', { 'text-anchor': 'middle', 'font-size': 17, fill: C.green }, history);
    if (i < 2) s.line(x + 60, 120, x + 77, 120, { stroke: C.green, 'marker-end': s.arrows.green }, history);
  });
  s.note('Cryptographic proof + a shared transaction history');
  return { ...s, render(p) {
    opacity(central, 1 - phase(p, 0.15, 0.48));
    opacity(direct, phase(p, 0.2, 0.42));
    move(payment, [[172, 245], [728, 245]], phase(p, 0.28, 0.64));
    opacity(payment, phase(p, 0.2, 0.3) * (1 - phase(p, 0.7, 0.82)));
    opacity(peers, phase(p, 0.5, 0.7));
    opacity(history, phase(p, 0.76, 0.94));
    nodes.forEach(({ ring }, i) => ring.setAttribute('stroke', p > 0.64 + i * 0.08 ? C.green : C.line));
    checks.forEach((v, i) => opacity(v, phase(p, 0.64 + i * 0.08, 0.74 + i * 0.08)));
  } };
}

function transactions() {
  const s = canvas('transactions', 'A chain of digital signatures', 'Three owners transfer a coin. Each signature commits to the previous transaction hash and the next owner’s public key. Private keys remain with their owners; later owners verify the signatures.');
  const xs = [150, 450, 750];
  const txs = xs.map((x, i) => {
    const group = s.g(`transaction-${i + 1}`);
    s.t(x, 70, `Owner ${i + 1}`, { 'text-anchor': 'middle', 'font-size': 23 }, group);
    const box = s.rect(x - 115, 118, 230, 156, { 'data-transaction': i + 1 }, group);
    s.small(x - 97, 145, 'PREVIOUS TX HASH', { 'font-size': 14 }, group);
    s.mono(x - 97, 170, i === 0 ? '…b72a' : i === 1 ? '…8f10' : '…6c93', {}, group);
    s.line(x - 98, 182, x + 98, 182, {}, group);
    s.t(x - 97, 209, `Public key ${i + 1}`, { fill: C.blue, 'font-size': 18 }, group);
    s.t(x - 97, 246, `Signature ${i}`, { fill: C.copper, 'font-size': 18 }, group);
    return { group, box };
  });
  s.line(265, 196, 335, 196, { 'marker-end': s.arrows.dim });
  s.line(565, 196, 635, 196, { 'marker-end': s.arrows.dim });
  const keys = xs.slice(0, 2).map((x, i) => {
    const group = s.g(`private-key-${i + 1}`);
    s.circle(x - 54, 370, 8, { stroke: C.copper }, group);
    s.path(`M${x - 46} 370 h24 m-8 0 v8 m-7 -8 v6`, { stroke: C.copper, 'stroke-width': 2 }, group);
    s.t(x - 10, 376, `Private key ${i + 1}`, { fill: C.copper, 'font-size': 18 }, group);
    s.small(x, 407, 'Stays with the signer', { 'text-anchor': 'middle', 'font-size': 15 }, group);
    return group;
  });
  const sign1 = s.g('sign-transfer-one');
  s.path('M150 347 V310 H450 V280', { stroke: C.copper, 'marker-end': s.arrows.copper }, sign1);
  s.small(300, 334, 'sign hash + next public key', { 'text-anchor': 'middle', fill: C.copper }, sign1);
  const sign2 = s.g('sign-transfer-two');
  s.path('M450 347 V310 H750 V280', { stroke: C.copper, 'marker-end': s.arrows.copper }, sign2);
  const packet1 = s.packet('copper', sign1); const packet2 = s.packet('copper', sign2);
  const verify = s.g('verify-ownership');
  check(s, 575, 439, verify); s.t(710, 445, 'History selects the spend', { 'text-anchor': 'middle', fill: C.green, 'font-size': 18 }, verify);
  const conflict = s.g('conflicting-signed-transfer');
  s.path('M565 246 H610 V365 H643', { stroke: C.red, 'stroke-dasharray': '5 6', 'marker-end': s.arrows.red }, conflict);
  s.rect(648, 341, 217, 74, { stroke: C.red, 'data-conflict': 'valid-signature' }, conflict);
  s.t(666, 369, 'Alternate payee', { 'font-size': 20, fill: C.red }, conflict);
  s.small(666, 396, 'A valid signature, too', { fill: C.red, 'font-size': 16 }, conflict);
  s.note('A signature proves authorization; shared history is still needed to prevent double-spending.');
  return { ...s, render(p) {
    opacity(txs[0].group, 1); opacity(txs[1].group, 0.35 + 0.65 * phase(p, 0.12, 0.4)); opacity(txs[2].group, 0.35 + 0.65 * phase(p, 0.36, 0.55));
    opacity(keys[0], 1); opacity(keys[1], 0.4 + 0.6 * phase(p, 0.4, 0.55));
    opacity(sign1, phase(p, 0.05, 0.15) * (1 - phase(p, 0.43, 0.5)));
    opacity(sign2, phase(p, 0.34, 0.44) * (1 - phase(p, 0.55, 0.65)));
    move(packet1, [[150, 347], [150, 310], [450, 310], [450, 280]], phase(p, 0.12, 0.4));
    move(packet2, [[450, 347], [450, 310], [750, 310], [750, 280]], phase(p, 0.38, 0.55));
    opacity(conflict, phase(p, 0.53, 0.7) * (1 - 0.6 * phase(p, 0.8, 0.96)));
    opacity(verify, phase(p, 0.8, 0.94));
    txs.forEach(({ box }, i) => box.setAttribute('stroke', p > [0.01, 0.37, 0.55][i] ? C.green : C.line));
  } };
}

function timestamp() {
  const s = canvas('timestamp', 'Hashes link a public chronology', 'Three blocks contain transaction records and the hash of the previous block. Publishing each new hash commits to the earlier records and their order. All displayed hashes are illustrative.');
  const xs = [155, 450, 745];
  const hashes = ['8f10…b72a', '6c93…1e44', '2ab8…a510'];
  const blocks = xs.map((x, i) => {
    const group = s.g(`block-${i + 1}`);
    s.t(x, 88, `Block ${i + 1}`, { 'text-anchor': 'middle', 'font-size': 24 }, group);
    const box = s.rect(x - 114, 125, 228, 209, { 'data-block': i + 1 }, group);
    s.small(x - 94, 154, 'PREVIOUS HASH', { 'font-size': 14 }, group);
    s.mono(x - 94, 182, i ? hashes[i - 1] : 'earlier block', { fill: i ? C.blue : C.dim }, group);
    s.line(x - 94, 199, x + 94, 199, {}, group);
    s.t(x - 94, 229, 'Transactions', { 'font-size': 19 }, group);
    [0, 1, 2].forEach((j) => {
      s.rect(x - 94 + j * 65, 248, 54, 44, { fill: '#19231e', 'data-item': j }, group);
      s.small(x - 67 + j * 65, 276, `tx ${j + 1}`, { 'text-anchor': 'middle', fill: C.copper }, group);
    });
    s.mono(x, 376, hashes[i], { 'text-anchor': 'middle', fill: C.green, 'font-size': 20 }, group);
    s.path(`M${x} 335 V350`, { stroke: C.green, 'marker-end': s.arrows.green }, group);
    return { group, box };
  });
  const links = xs.slice(0, 2).map((x, i) => {
    const group = s.g(`hash-link-${i + 1}`);
    s.path(`M${x + 82} 370 H${x + 146} V175 H${xs[i + 1] - 120}`, { stroke: C.blue, 'marker-end': s.arrows.blue }, group);
    const packet = s.packet('blue', group);
    return { group, packet, points: [[x + 82, 370], [x + 146, 370], [x + 146, 175], [xs[i + 1] - 120, 175]] };
  });
  s.note('Each new commitment reinforces the history before it · hashes are illustrative');
  return { ...s, render(p) {
    blocks.forEach(({ group, box }, i) => { opacity(group, (i === 0 ? 0.75 : 0.35) + (i === 0 ? 0.25 : 0.65) * phase(p, i * 0.27, i * 0.27 + 0.2)); box.setAttribute('stroke', p > i * 0.27 + 0.18 ? C.green : C.line); });
    links.forEach(({ group, packet, points }, i) => { opacity(group, phase(p, 0.17 + i * 0.29, 0.28 + i * 0.29)); move(packet, points, phase(p, 0.22 + i * 0.29, 0.48 + i * 0.29)); opacity(packet, 1 - phase(p, 0.5 + i * 0.29, 0.6 + i * 0.29)); });
  } };
}

function proofOfWork() {
  const s = canvas('proof-of-work', 'Find a hash that meets the target', 'An illustrative block header is hashed with different nonce values. Most example hashes fail the prefix test; the final example passes. This is a teaching sequence, not a miner or a live difficulty target.');
  const header = s.g('block-header');
  s.t(230, 92, 'Block header', { 'text-anchor': 'middle', 'font-size': 24 }, header);
  s.rect(80, 122, 300, 224, { 'data-header': 'candidate' }, header);
  s.small(102, 153, 'PREVIOUS HASH', {}, header); s.mono(102, 180, '6c93…1e44', { fill: C.blue }, header);
  s.small(102, 215, 'MERKLE ROOT', {}, header); s.mono(102, 242, 'b4a2…9f10', { fill: C.blue }, header);
  s.line(100, 262, 360, 262, {}, header);
  s.t(102, 304, 'Nonce', { 'font-size': 20 }, header);
  const nonce = s.mono(250, 304, '00000', { fill: C.copper, 'font-size': 23, 'data-nonce': 'value' }, header);
  s.line(380, 232, 448, 232, { stroke: C.copper, 'marker-end': s.arrows.copper });
  s.circle(493, 232, 44, { stroke: C.copper }); s.t(493, 238, 'SHA-256', { 'text-anchor': 'middle', 'font-size': 17, fill: C.copper });
  s.line(537, 232, 600, 232, { stroke: C.copper, 'marker-end': s.arrows.copper });
  s.small(625, 156, 'EXAMPLE TARGET', { 'font-size': 14 });
  s.mono(625, 187, 'prefix 0000', { 'font-size': 23, fill: C.green });
  const resultBox = s.rect(610, 213, 242, 72, { 'data-result': 'hash' });
  const result = s.mono(631, 256, '7a32…f901', { 'font-size': 23, fill: C.dim, 'data-hash': 'value' });
  const status = s.t(732, 322, 'Try another nonce', { 'text-anchor': 'middle', 'font-size': 20, fill: C.dim, 'data-pow-status': 'value' });
  const loop = s.path('M730 357 V392 H230 V353', { stroke: C.dim, 'stroke-dasharray': '5 7', 'marker-end': s.arrows.dim });
  const accepted = s.g('accepted-work');
  check(s, 615, 390, accepted); s.t(735, 395, 'Verify with one hash', { 'text-anchor': 'middle', fill: C.green, 'font-size': 19 }, accepted);
  const workChain = s.g('cumulative-work-chain');
  [92, 177, 262, 347].forEach((x, i) => {
    s.rect(x, 372, 65, 43, { stroke: C.green, 'data-work-block': i + 1 }, workChain);
    s.mono(x + 32, 399, '000', { 'text-anchor': 'middle', fill: C.green }, workChain);
    if (i < 3) s.line(x + 66, 393, x + 82, 393, { stroke: C.green, 'marker-end': s.arrows.green }, workChain);
  });
  s.t(570, 390, 'Work builds on work', { 'font-size': 22, fill: C.green }, workChain);
  s.small(570, 418, 'Rewriting requires replacement work.', { 'font-size': 17 }, workChain);
  const selection = s.g('greatest-cumulative-work');
  s.path('M124 417 V442 H238', { stroke: C.red, 'stroke-dasharray': '4 5', 'marker-end': s.arrows.red }, selection);
  s.small(530, 447, 'Valid chain · greatest cumulative work', { fill: C.green, 'font-size': 17 }, selection);
  s.note('Deterministic teaching sequence · example hashes and target, no mining');
  const attempts = [
    ['00000', '7a32…f901'], ['00001', 'c918…6ab2'], ['00002', '13e7…0db5'],
    ['00003', '98b4…a6c1'], ['00004', '061d…84e2'], ['00005', '4ea1…9c20'],
    ['00006', 'b2f0…1e95'], ['00007', '0000…7c4e'],
  ];
  return { ...s, render(p) {
    const done = p >= 0.5;
    const index = done ? attempts.length - 1 : Math.min(attempts.length - 2, Math.floor(phase(p, 0.25, 0.5) * (attempts.length - 1)));
    nonce.textContent = attempts[index][0]; result.textContent = attempts[index][1];
    opacity(result, phase(p, 0.25, 0.29));
    result.setAttribute('fill', done ? C.green : C.dim); resultBox.setAttribute('stroke', done ? C.green : C.line);
    status.textContent = p < 0.25 ? 'Header ready' : p < 0.5 ? 'Try another nonce' : p < 0.75 ? 'Target met' : 'Proof verified';
    status.setAttribute('fill', done ? C.green : C.dim);
    opacity(loop, phase(p, 0.25, 0.3) * (1 - phase(p, 0.45, 0.5)));
    accepted.setAttribute('transform', 'translate(0,-40)');
    opacity(accepted, phase(p, 0.75, 0.9));
    opacity(workChain, 0.55 * phase(p, 0.56, 0.73));
    opacity(selection, 0.55 * phase(p, 0.72, 0.88));
    header.setAttribute('opacity', 0.45 + 0.55 * phase(p, 0, 0.12));
  } };
}

function network() {
  const s = canvas('network', 'Broadcast, validate, then extend', 'Transactions propagate through six connected peers. A peer finds a valid proof-of-work block and broadcasts it. Each peer checks its transactions and work independently, then expresses acceptance by extending the valid chain. Peers do not approve blocks by counting votes.');
  const positions = [[190, 140], [450, 100], [710, 140], [710, 335], [450, 380], [190, 335]];
  const pairs = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 4], [1, 3], [1, 5]];
  const links = s.g('peer-links');
  pairs.forEach(([a, b]) => s.line(...positions[a], ...positions[b], { opacity: 0.8 }, links));
  const peers = positions.map(([x, y], i) => nodeGlyph(s, x, y, `Peer ${i + 1}`, s.root));
  const txPackets = pairs.slice(0, 6).map(([a, b]) => ({ packet: s.packet('copper'), points: [positions[a], positions[b]] }));
  const blockPackets = positions.slice(1).map((point) => ({ packet: s.packet('green'), points: [positions[0], point] }));
  const block = s.g('found-block');
  s.rect(355, 204, 190, 90, { stroke: C.green, 'data-block': 'valid' }, block);
  s.t(450, 238, 'Valid block', { 'text-anchor': 'middle', fill: C.green, 'font-size': 23 }, block);
  s.small(450, 270, 'transactions + work', { 'text-anchor': 'middle' }, block);
  const checks = positions.map(([x, y]) => check(s, x + 31, y - 24));
  const extension = s.g('extend-accepted-block');
  s.line(545, 248, 590, 248, { stroke: C.green, 'marker-end': s.arrows.green }, extension);
  s.rect(596, 224, 54, 48, { stroke: C.green }, extension);
  s.small(623, 253, '+1', { 'text-anchor': 'middle', fill: C.green, 'font-size': 18 }, extension);
  const fork = s.g('temporary-fork');
  s.path('M555 245 H576 V183 H594', { stroke: C.red, 'stroke-dasharray': '4 6' }, fork);
  s.rect(596, 160, 54, 47, { stroke: C.red }, fork); s.small(623, 190, 'tip B', { 'text-anchor': 'middle', fill: C.red, 'font-size': 14 }, fork);
  s.line(651, 248, 670, 248, { stroke: C.green, 'marker-end': s.arrows.green }, extension);
  s.rect(676, 224, 54, 48, { stroke: C.green }, extension); s.mono(703, 253, '000', { 'text-anchor': 'middle', fill: C.green, 'font-size': 14 }, extension);
  const stageText = s.t(450, 39, 'Broadcast transactions', { 'text-anchor': 'middle', 'font-size': 24, fill: C.copper, 'data-network-stage': 'value' });
  s.note('Independent validation · acceptance means working on the next valid block');
  return { ...s, render(p) {
    stageText.textContent = p < 0.25 ? 'Broadcast transactions' : p < 0.5 ? 'Find and broadcast a block' : p < 0.75 ? 'Each peer validates' : 'Greater work resolves a temporary fork';
    stageText.setAttribute('fill', p < 0.3 ? C.copper : C.green);
    txPackets.forEach(({ packet, points }, i) => { const a = 0.02 + i * 0.025; move(packet, points, phase(p, a, a + 0.25)); opacity(packet, phase(p, a, a + 0.04) * (1 - phase(p, a + 0.23, a + 0.28))); });
    blockPackets.forEach(({ packet, points }, i) => { const a = 0.38 + i * 0.025; move(packet, points, phase(p, a, a + 0.23)); opacity(packet, phase(p, a, a + 0.04) * (1 - phase(p, a + 0.2, a + 0.26))); });
    opacity(block, phase(p, 0.26, 0.4)); opacity(extension, phase(p, 0.81, 0.96)); opacity(fork, phase(p, 0.75, 0.83) * (1 - 0.65 * phase(p, 0.87, 1)));
    peers.forEach(({ ring }, i) => ring.setAttribute('stroke', p > 0.56 + i * 0.035 ? C.green : C.line));
    checks.forEach((v, i) => opacity(v, phase(p, 0.56 + i * 0.035, 0.65 + i * 0.035)));
  } };
}

function incentive() {
  const s = canvas('incentive', 'The first transaction rewards the miner', 'The block’s first transaction, called the coinbase transaction, can claim the allowed subsidy and transaction fees. Both amounts combine into the miner’s award. No current subsidy amount is asserted.');
  const subsidy = s.g('subsidy'); const fees = s.g('transaction-fees');
  s.circle(167, 153, 34, { stroke: C.green }, subsidy); s.t(167, 162, '+', { 'text-anchor': 'middle', 'font-size': 36, fill: C.green }, subsidy);
  s.t(167, 220, 'Block subsidy', { 'text-anchor': 'middle', 'font-size': 23 }, subsidy);
  s.small(167, 249, 'New issuance, per the rules', { 'text-anchor': 'middle' }, subsidy);
  [0, 1, 2].forEach((i) => { s.rect(105 + i * 38, 325 - i * 7, 72, 32, { stroke: C.copper, fill: C.bg }, fees); });
  s.t(167, 405, 'Transaction fees', { 'text-anchor': 'middle', 'font-size': 23 }, fees);
  s.small(167, 433, 'Inputs − outputs', { 'text-anchor': 'middle', fill: C.copper }, fees);
  const flows = s.g('reward-flows');
  s.path('M210 152 H333 V177 H410', { stroke: C.green, 'marker-end': s.arrows.green }, flows);
  s.path('M215 339 H333 V213 H410', { stroke: C.copper, 'marker-end': s.arrows.copper }, flows);
  const subPacket = s.packet('green', flows); const feePacket = s.packet('copper', flows);
  const block = s.g('coinbase-transaction');
  s.t(510, 104, 'Block', { 'text-anchor': 'middle', 'font-size': 24 }, block);
  s.rect(394, 126, 232, 272, { 'data-block': 'reward' }, block);
  const coinbase = s.rect(412, 147, 196, 94, { stroke: C.green, fill: '#1c281e', 'data-coinbase': 'first-transaction' }, block);
  s.small(430, 171, 'FIRST TRANSACTION', { 'font-size': 14, fill: C.green }, block);
  s.t(430, 206, 'Coinbase', { 'font-size': 24, fill: C.green }, block);
  [0, 1, 2].forEach((i) => { s.line(430, 271 + i * 42, 590, 271 + i * 42, { stroke: C.line }, block); s.small(430, 291 + i * 42, `Transaction ${i + 1}`, {}, block); });
  const miner = s.g('miner-award');
  s.line(626, 195, 710, 195, { stroke: C.green, 'marker-end': s.arrows.green }, miner);
  s.circle(775, 195, 41, { stroke: C.green }, miner);
  s.path('M753 207 L786 174 M757 177 C773 168 785 170 798 184 M752 203 L760 211', { stroke: C.green, 'stroke-width': 3 }, miner);
  s.t(775, 273, 'Miner award', { 'text-anchor': 'middle', 'font-size': 23 }, miner);
  s.small(775, 306, 'subsidy + fees', { 'text-anchor': 'middle', fill: C.green, 'font-size': 17 }, miner);
  const motivation = s.t(775, 371, 'Compute + electricity', { 'text-anchor': 'middle', fill: C.dim, 'font-size': 18, 'data-miner-incentive': 'value' });
  s.note('The allowed subsidy follows protocol rules; fees can fund the incentive over time.');
  return { ...s, render(p) {
    opacity(subsidy, 0.55 + 0.45 * phase(p, 0, 0.2)); opacity(fees, 0.45 + 0.55 * phase(p, 0.45, 0.65));
    opacity(flows, phase(p, 0.25, 0.4)); opacity(block, 0.45 + 0.55 * phase(p, 0.25, 0.48)); opacity(miner, 0.25 + 0.75 * phase(p, 0.7, 0.92));
    move(subPacket, [[210, 152], [333, 152], [333, 177], [410, 177]], phase(p, 0.25, 0.48));
    move(feePacket, [[215, 339], [333, 339], [333, 213], [410, 213]], phase(p, 0.5, 0.73));
    opacity(subPacket, 1 - phase(p, 0.58, 0.67)); opacity(feePacket, 1 - phase(p, 0.68, 0.75));
    motivation.textContent = p < 0.75 ? 'Compute + electricity' : 'Earn by following the rules';
    motivation.setAttribute('fill', p < 0.75 ? C.dim : C.green);
    coinbase.setAttribute('stroke-width', mix(1.5, 2.5, phase(p, 0.55, 0.7)));
  } };
}

function merkle() {
  const s = canvas('merkle', 'Keep the commitment, prune old data', 'Four transactions hash into pairs and a Merkle root. The block header retains the same root while old transaction data and unneeded branches fade. Pruning does not alter the header’s commitment.');
  const title = s.t(450, 49, 'One root commits to the transaction tree', { 'text-anchor': 'middle', 'font-size': 24 });
  const header = s.g('header-commitment');
  s.rect(285, 77, 330, 85, { stroke: C.green, 'data-header': 'merkle-root' }, header);
  s.small(307, 101, 'BLOCK HEADER', { 'font-size': 14 }, header);
  s.mono(450, 139, 'Root: b4a2…9f10', { 'text-anchor': 'middle', fill: C.green, 'font-size': 22, 'data-merkle-root': 'b4a2…9f10' }, header);
  const branches = s.g('tree-branches');
  const links = [
    s.line(450, 163, 255, 220, {}, branches), s.line(450, 163, 645, 220, {}, branches),
    s.line(255, 250, 155, 308, {}, branches), s.line(255, 250, 355, 308, {}, branches),
    s.line(645, 250, 555, 308, {}, branches), s.line(645, 250, 755, 308, {}, branches),
  ];
  [255, 645].forEach((x, i) => { s.rect(x - 65, 215, 130, 40, {}, branches); s.mono(x, 241, i ? 'Hash 23' : 'Hash 01', { 'text-anchor': 'middle', fill: C.blue }, branches); });
  const leaves = [155, 355, 555, 755].map((x, i) => {
    const group = s.g(`transaction-${i}`);
    s.rect(x - 60, 306, 120, 40, {}, group); s.mono(x, 333, `Hash ${i}`, { 'text-anchor': 'middle', fill: C.blue }, group);
    const data = s.g(`transaction-data-${i}`, group);
    s.line(x, 346, x, 373, {}, data); s.rect(x - 60, 374, 120, 50, { stroke: i === 3 ? C.copper : C.line, 'data-transaction': i }, data);
    s.t(x, 405, `Tx ${i}`, { 'text-anchor': 'middle', fill: C.copper, 'font-size': 21 }, data);
    return { group, data };
  });
  const preserved = s.g('preserved-commitment');
  check(s, 345, 43, preserved); s.t(465, 49, 'Root unchanged', { 'text-anchor': 'middle', fill: C.green, 'font-size': 23 }, preserved);
  s.note('Pruned data can disappear while the original block hash stays intact.');
  return { ...s, render(p) {
    opacity(header, 0.5 + 0.5 * phase(p, 0.25, 0.48));
    opacity(branches, 0.4 + 0.6 * phase(p, 0.12, 0.36));
    leaves.forEach(({ group, data }, i) => {
      opacity(group, (0.55 + 0.45 * phase(p, i * 0.045, 0.15 + i * 0.045)) * (i < 2 ? 1 - 0.88 * phase(p, 0.58, 0.9) : 1));
      opacity(data, i === 2 ? 1 - 0.88 * phase(p, 0.58, 0.9) : 1);
    });
    links.forEach((v, i) => opacity(v, i === 2 || i === 3 ? 1 - 0.9 * phase(p, 0.58, 0.9) : 1));
    opacity(preserved, phase(p, 0.7, 0.94));
    opacity(title, 1 - phase(p, 0.7, 0.94));
  } };
}

function spv() {
  const s = canvas('spv', 'A Merkle path connects a payment to a header', 'Transaction three hashes with sibling Hash two, then sibling Hash zero-one, to reproduce a root in a proof-of-work block header. Later headers reinforce the commitment. This proves inclusion under the model, not independent full transaction validation.');
  const headers = [200, 450, 700].map((x, i) => {
    const group = s.g(`header-${i + 1}`);
    const box = s.rect(x - 105, 67, 210, 103, { stroke: i === 1 ? C.green : C.line, 'data-header': i + 1 }, group);
    s.small(x, 94, `HEADER ${i + 1}`, { 'text-anchor': 'middle', 'font-size': 14 }, group);
    s.mono(x, 122, i === 1 ? 'root b4a2…' : 'prev hash + root', { 'text-anchor': 'middle', fill: i === 1 ? C.green : C.dim, 'font-size': 16 }, group);
    s.small(x, 149, 'proof-of-work', { 'text-anchor': 'middle' }, group);
    return { group, box };
  });
  s.line(305, 116, 345, 116, { stroke: C.green, 'marker-end': s.arrows.green });
  s.line(555, 116, 595, 116, { stroke: C.green, 'marker-end': s.arrows.green });
  const proof = s.g('merkle-proof');
  s.path('M552 395 V346 L450 281 V174', { stroke: C.copper, 'stroke-width': 2.3 }, proof);
  s.path('M292 281 H450 M350 346 H552', { stroke: C.blue, 'stroke-width': 2, 'marker-end': s.arrows.blue }, proof);
  s.rect(225, 259, 133, 43, { stroke: C.blue }, proof); s.mono(292, 286, 'Hash 01', { 'text-anchor': 'middle', fill: C.blue }, proof);
  s.rect(290, 324, 120, 43, { stroke: C.blue }, proof); s.mono(350, 352, 'Hash 2', { 'text-anchor': 'middle', fill: C.blue }, proof);
  s.rect(485, 324, 134, 43, { stroke: C.copper }, proof); s.mono(552, 352, 'Hash 3', { 'text-anchor': 'middle', fill: C.copper }, proof);
  s.rect(485, 395, 134, 46, { stroke: C.copper, 'data-transaction': 3 }, proof); s.t(552, 426, 'Tx 3', { 'text-anchor': 'middle', fill: C.copper, 'font-size': 22 }, proof);
  s.rect(383, 259, 134, 43, { stroke: C.copper }, proof); s.mono(450, 286, 'Hash 23', { 'text-anchor': 'middle', fill: C.copper }, proof);
  s.small(685, 290, 'Only sibling hashes', { 'font-size': 18, fill: C.blue }, proof);
  s.small(685, 317, '+ the payment', { 'font-size': 18, fill: C.copper }, proof);
  const packet = s.packet('copper', proof);
  const included = s.g('inclusion-verified'); check(s, 575, 213, included); s.t(600, 219, 'Inclusion verified', { fill: C.green, 'font-size': 20 }, included);
  s.note('Header chain + inclusion proof · security still depends on the honest-work assumption');
  return { ...s, render(p) {
    opacity(proof, 0.4 + 0.6 * phase(p, 0.25, 0.42)); move(packet, [[552, 395], [552, 346], [450, 281], [450, 174]], phase(p, 0.42, 0.7));
    opacity(packet, phase(p, 0.1, 0.2) * (1 - phase(p, 0.68, 0.78)));
    headers.forEach(({ group }, i) => opacity(group, 0.55 + 0.45 * phase(p, i === 1 ? 0.4 : i === 0 ? 0.02 : 0.74, i === 1 ? 0.65 : i === 0 ? 0.22 : 0.92)));
    opacity(included, phase(p, 0.64, 0.8));
  } };
}

function value() {
  const s = canvas('value', 'Combine inputs, split outputs', 'Two example inputs of 0.70 and 0.50 bitcoin fund a 1.00 payment and 0.19 change. The remaining 0.01 is the transaction fee, not an output. Total input value equals outputs plus the fee.');
  s.t(149, 67, 'Inputs', { 'text-anchor': 'middle', 'font-size': 24 }); s.t(715, 67, 'Outputs', { 'text-anchor': 'middle', 'font-size': 24 });
  const inputs = [[150, 157, '0.70'], [150, 307, '0.50']].map(([x, y, amount], i) => {
    const group = s.g(`input-${i + 1}`); s.rect(x - 85, y - 45, 170, 90, { stroke: C.copper, 'data-input': amount }, group);
    s.mono(x, y + 5, amount, { 'text-anchor': 'middle', 'font-size': 32, fill: C.copper }, group); s.small(x, y + 29, 'BTC', { 'text-anchor': 'middle' }, group);
    return group;
  });
  const transaction = s.g('transaction'); s.rect(343, 177, 200, 110, { stroke: C.text, 'data-transaction': 'combine-split' }, transaction);
  s.t(443, 218, 'Transaction', { 'text-anchor': 'middle', 'font-size': 23 }, transaction); s.mono(443, 255, '1.20 BTC in', { 'text-anchor': 'middle', fill: C.copper, 'font-size': 20 }, transaction);
  const outputData = [[715, 145, '1.00', 'Payment', 'green'], [715, 290, '0.19', 'Change', 'blue']];
  const outputs = outputData.map(([x, y, amount, label, color], i) => { const group = s.g(`output-${i + 1}`); s.rect(x - 100, y - 45, 200, 90, { stroke: C[color], 'data-output': amount }, group); s.mono(x - 80, y + 3, amount, { 'font-size': 30, fill: C[color] }, group); s.small(x + 16, y + 3, 'BTC', {}, group); s.t(x - 80, y + 29, label, { 'font-size': 18 }, group); return group; });
  s.path('M235 157 H290 V215 H340 M235 307 H290 V250 H340', { stroke: C.copper, 'marker-end': s.arrows.copper });
  const flow = s.g('value-flows');
  s.path('M545 211 H580 V145 H612', { stroke: C.green, 'marker-end': s.arrows.green }, flow); s.path('M545 248 H580 V290 H612', { stroke: C.blue, 'marker-end': s.arrows.blue }, flow);
  const fee = s.g('fee-difference'); s.path('M443 289 V368 H595', { stroke: C.copper, 'stroke-dasharray': '4 5', 'marker-end': s.arrows.copper }, fee);
  s.mono(618, 375, '0.01 BTC', { fill: C.copper, 'font-size': 25 }, fee); s.small(618, 405, 'Fee = inputs − outputs', { 'font-size': 16 }, fee);
  const packets = [s.packet('copper'), s.packet('copper'), s.packet('green', flow), s.packet('blue', flow)];
  const equation = s.mono(450, 465, '0.70 + 0.50 = 1.00 + 0.19 + 0.01', { 'text-anchor': 'middle', 'font-size': 23, fill: C.green, 'data-conservation': '1.20=1.20' });
  return { ...s, render(p) {
    inputs.forEach((v, i) => opacity(v, 0.3 + 0.7 * phase(p, i * 0.08, 0.15 + i * 0.08))); opacity(transaction, 0.25 + 0.75 * phase(p, 0.2, 0.4));
    outputs.forEach((v, i) => opacity(v, 0.2 + 0.8 * phase(p, 0.4 + i * 0.12, 0.6 + i * 0.12))); opacity(flow, phase(p, 0.35, 0.5)); opacity(fee, phase(p, 0.7, 0.88)); opacity(equation, phase(p, 0.8, 0.96));
    move(packets[0], [[235, 157], [290, 157], [290, 215], [340, 215]], phase(p, 0.05, 0.36)); move(packets[1], [[235, 307], [290, 307], [290, 250], [340, 250]], phase(p, 0.13, 0.4));
    move(packets[2], [[545, 211], [580, 211], [580, 145], [612, 145]], phase(p, 0.4, 0.65)); move(packets[3], [[545, 248], [580, 248], [580, 290], [612, 290]], phase(p, 0.5, 0.75));
    packets.forEach((v, i) => opacity(v, phase(p, [0.03, 0.1, 0.38, 0.48][i], [0.1, 0.18, 0.43, 0.53][i]) * (1 - phase(p, [0.36, 0.4, 0.65, 0.75][i], [0.42, 0.46, 0.71, 0.81][i]))));
  } };
}

function privacy() {
  const s = canvas('privacy', 'Public transactions, separate identities', 'Public key-address labels form a visible transaction graph. Real-world identities remain outside that graph, with uncertain dotted associations. Combining inputs and external identity information can link activity; pseudonyms do not guarantee anonymity.');
  s.t(540, 53, 'Public transaction graph', { 'text-anchor': 'middle', 'font-size': 24 });
  s.line(270, 90, 270, 420, { 'stroke-dasharray': '4 7' });
  s.small(135, 60, 'REAL-WORLD IDENTITIES', { 'text-anchor': 'middle', 'font-size': 14 });
  const identities = s.g('identities'); person(s, 125, 157, 'Person A', 'dim', identities); person(s, 125, 333, 'Person B', 'dim', identities);
  const points = [[360, 140], [360, 290], [555, 215], [760, 140], [760, 320]];
  const graph = s.g('public-address-graph');
  const edges = [[0, 2], [1, 2], [2, 3], [2, 4]];
  edges.forEach(([a, b], i) => { s.line(...points[a], ...points[b], { stroke: i < 2 ? C.copper : C.line, 'marker-end': s.arrows[i < 2 ? 'copper' : 'dim'] }, graph); });
  const addresses = points.map(([x, y], i) => {
    const group = s.g(`address-${i + 1}`, graph);
    s.circle(x, y, 33, { stroke: C.blue, fill: C.bg, 'data-address': i + 1 }, group); s.mono(x, y + 6, `K${i + 1}`, { 'text-anchor': 'middle', fill: C.blue, 'font-size': 22 }, group);
    s.small(x, y + 58, 'public key / address', { 'text-anchor': 'middle', 'font-size': 14 }, group);
    return group;
  });
  const associations = s.g('uncertain-identity-links');
  s.path('M170 150 H218 V140 H323 M170 150 H218 V290 H323 M170 330 H223 V320 H723', { stroke: C.dim, 'stroke-dasharray': '3 8', opacity: 0.65 }, associations);
  const multi = s.g('multi-input-linkability');
  s.path('M310 112 H301 V316 H310', { stroke: C.copper, 'stroke-width': 2 }, multi);
  s.t(465, 383, 'Multi-input use can link keys', { 'text-anchor': 'middle', fill: C.copper, 'font-size': 22 }, multi);
  s.small(465, 414, 'External information can attach an identity.', { 'text-anchor': 'middle', 'font-size': 17 }, multi);
  const fresh = s.g('fresh-key'); s.circle(760, 320, 43, { stroke: C.green, 'stroke-dasharray': '3 6', fill: 'none' }, fresh);
  s.small(760, 408, 'Fresh key', { 'text-anchor': 'middle', fill: C.green, 'font-size': 17 }, fresh);
  const packets = edges.map(() => s.packet('copper', graph));
  s.note('A fresh key pair can reduce linkage; it does not promise anonymity.');
  return { ...s, render(p) {
    opacity(identities, 0.65 + 0.35 * phase(p, 0.25, 0.45)); opacity(graph, 0.55 + 0.45 * phase(p, 0.02, 0.2));
    opacity(associations, phase(p, 0.25, 0.47)); opacity(multi, phase(p, 0.75, 0.95)); opacity(fresh, phase(p, 0.5, 0.7));
    addresses.forEach((v, i) => opacity(v, 0.5 + 0.5 * phase(p, 0.13 + i * 0.06, 0.28 + i * 0.06)));
    packets.forEach((v, i) => { const a = 0.2 + i * 0.065; move(v, [points[edges[i][0]], points[edges[i][1]]], phase(p, a, a + 0.27)); opacity(v, phase(p, a, a + 0.04) * (1 - phase(p, a + 0.25, a + 0.31))); });
  } };
}

function calculations() {
  const s = canvas('calculations', 'The probability of catching up declines with depth', 'An honest chain and an attacker’s competing chain branch from a common block. A chart compares Poisson-approximation catch-up probabilities for ten percent and thirty percent attacker hash power. A marker tracks the attacker share and increasing confirmation depth. These are model estimates, not guarantees or live network data.');
  s.t(55, 49, 'Competing histories', { 'font-size': 24 });
  s.rect(56, 152, 55, 54, { stroke: C.dim }); s.small(83, 184, 'fork', { 'text-anchor': 'middle' });
  s.path('M112 179 H137 V123 H160 M137 179 V254 H160', { stroke: C.line });
  s.small(161, 89, 'HONEST WORK', { fill: C.green, 'font-size': 14 }); s.small(161, 307, 'ATTACKER WORK', { fill: C.red, 'font-size': 14 });
  const honest = [0, 1, 2, 3, 4].map((i) => { const g = s.g(`honest-block-${i + 1}`); s.rect(160 + i * 60, 100, 45, 46, { stroke: C.green, 'data-honest-block': i + 1 }, g); if (i) s.line(145 + i * 60, 123, 158 + i * 60, 123, { stroke: C.green, 'marker-end': s.arrows.green }, g); return g; });
  const attacker = [0, 1, 2].map((i) => { const g = s.g(`attacker-block-${i + 1}`); s.rect(160 + i * 60, 232, 45, 46, { stroke: C.red, 'data-attacker-block': i + 1 }, g); if (i) s.line(145 + i * 60, 255, 158 + i * 60, 255, { stroke: C.red, 'marker-end': s.arrows.red }, g); return g; });
  s.path('M175 329 H444', { stroke: C.dim, 'marker-end': s.arrows.dim }); s.small(308, 356, 'More honest work to catch', { 'text-anchor': 'middle', 'font-size': 17 });
  const chart = s.g('probability-chart');
  const x0 = 540, y0 = 365, width = 300, height = 250, maxZ = 12;
  s.line(x0, y0, x0 + width, y0, { stroke: C.dim }, chart); s.line(x0, y0, x0, y0 - height, { stroke: C.dim }, chart);
  const yFor = (prob) => y0 - clamp((Math.log10(Math.max(prob, 1e-9)) + 9) / 9) * height;
  [[1, '100%'], [0.001, '0.1%'], [0.000001, '0.0001%'], [1e-9, '≤10⁻⁷%']].forEach(([v, label]) => { const y = yFor(v); s.line(x0, y, x0 + width, y, { 'stroke-dasharray': '3 6', opacity: 0.6 }, chart); s.small(x0 - 13, y + 5, label, { 'text-anchor': 'end', 'font-size': 14 }, chart); });
  [0, 3, 6, 9, 12].forEach((v) => { const x = x0 + v / maxZ * width; s.line(x, y0, x, y0 + 6, { stroke: C.dim }, chart); s.small(x, y0 + 27, v, { 'text-anchor': 'middle', 'font-size': 14 }, chart); });
  s.small(x0 + width / 2, 426, 'Depth z · logarithmic scale', { 'text-anchor': 'middle', 'font-size': 14 }, chart);
  s.t(550, 58, 'Catch-up probability', { 'font-size': 24 }, chart);
  const curve = (q) => Array.from({ length: maxZ + 1 }, (_, z) => `${z ? 'L' : 'M'}${x0 + z / maxZ * width},${yFor(attackerSuccess(q, z))}`).join(' ');
  const greenCurve = s.path(curve(0.1), { stroke: C.green, 'stroke-width': 2.5, 'data-probability-curve': '0.1', 'pathLength': 1 }, chart);
  const redCurve = s.path(curve(0.3), { stroke: C.red, 'stroke-width': 2.5, 'data-probability-curve': '0.3', 'pathLength': 1 }, chart);
  const dynamicCurve = s.path(curve(0.1), { stroke: C.blue, 'stroke-width': 2, 'stroke-dasharray': '5 4', 'data-probability-curve': 'selected' }, chart);
  s.line(562, 84, 584, 84, { stroke: C.green, 'stroke-width': 2.5 }, chart); s.small(592, 90, 'q = 10%', { fill: C.green }, chart);
  s.line(705, 84, 727, 84, { stroke: C.red, 'stroke-width': 2.5 }, chart); s.small(735, 90, 'q = 30%', { fill: C.red }, chart);
  const selected = s.g('selected-probability', chart);
  const guide = s.line(0, y0, 0, 0, { stroke: C.blue, 'stroke-dasharray': '4 5' }, selected);
  const marker = s.circle(0, 0, 5, { fill: C.blue, stroke: C.bg, 'stroke-width': 2, 'data-probability-marker': 'selected' }, selected);
  const controlsText = s.mono(56, 414, '', { fill: C.dim, 'font-size': 21, 'data-model-options': 'value' });
  const readout = s.mono(690, 451, '', { 'text-anchor': 'middle', fill: C.blue, 'font-size': 23, 'data-probability': 'value' });
  s.small(250, 381, 'Illustrative branches; z tracks depth.', { 'text-anchor': 'middle', 'font-size': 14 });
  s.note('Poisson approximation · steady q assumed · an estimate, not a guarantee');
  return { ...s, render(p, options) {
    const q = clamp(options.q ?? 0.1, 0, 1); const z = Math.max(0, Math.min(1000, Math.floor(Number(options.z ?? 6) || 0)));
    honest.forEach((v, i) => opacity(v, phase(p, 0.02 + i * 0.1, 0.12 + i * 0.1)));
    attacker.forEach((v, i) => opacity(v, phase(p, 0.1 + i * 0.17, 0.2 + i * 0.17)));
    opacity(chart, phase(p, 0.4, 0.6));
    [greenCurve, redCurve].forEach((v) => attr(v, { 'stroke-dasharray': 1, 'stroke-dashoffset': 1 - phase(p, 0.48, 0.85) }));
    attr(dynamicCurve, { d: curve(q), 'data-q': q }); opacity(dynamicCurve, phase(p, 0.82, 0.96));
    const prob = attackerSuccess(q, z); const x = x0 + Math.min(z, maxZ) / maxZ * width; const y = yFor(prob);
    attr(guide, { x1: x, x2: x, y2: y }); attr(marker, { cx: x, cy: y, 'data-q': q, 'data-z': z, 'data-value': prob });
    opacity(selected, phase(p, 0.82, 0.96)); opacity(controlsText, phase(p, 0.78, 0.94)); opacity(readout, phase(p, 0.78, 0.94));
    const percent = prob * 100; const formatted = percent === 0 ? '0' : percent < 0.0001 ? percent.toExponential(2) : percent.toFixed(percent < 0.1 ? 4 : 2);
    controlsText.textContent = `q = ${Math.round(q * 100)}%  ·  z = ${z}`;
    readout.textContent = `P ≈ ${formatted}%`;
  } };
}

function conclusion() {
  const s = canvas('conclusion', 'The pieces form one system', 'A payment is signed, broadcast to peers, checked against consensus rules, committed with proof-of-work, and extended by later valid blocks. Signatures authorize spending while the public proof-of-work history provides ordering.');
  const labels = ['Sign', 'Broadcast', 'Validate', 'Do work', 'Extend'];
  const xs = [90, 270, 450, 630, 810];
  const stages = labels.map((label, i) => {
    const group = s.g(`pipeline-${label.toLowerCase().replace(' ', '-')}`);
    s.circle(xs[i], 219, 46, { stroke: i === 0 ? C.copper : C.line, 'data-pipeline-step': i + 1 }, group);
    s.t(xs[i], 309, label, { 'text-anchor': 'middle', 'font-size': 24 }, group);
    const details = ['Authorize', 'Announce', 'Check rules', 'Commit order', 'Reinforce history'];
    s.small(xs[i], 339, details[i], { 'text-anchor': 'middle', 'font-size': 16 }, group);
    return group;
  });
  s.path('M72 230 L91 211 M82 205 l16 16 M72 230 l-3 9 9 -3', { stroke: C.copper, 'stroke-width': 2 }, stages[0]);
  [[256, 208], [283, 208], [270, 234]].forEach(([x, y]) => s.circle(x, y, 5, { stroke: C.blue }, stages[1])); s.path('M256 208 L283 208 L270 234 Z', { stroke: C.blue }, stages[1]);
  check(s, 450, 219, stages[2]);
  s.mono(630, 225, '000', { 'text-anchor': 'middle', 'font-size': 23, fill: C.green }, stages[3]);
  s.rect(786, 205, 22, 25, { stroke: C.green }, stages[4]); s.rect(816, 205, 22, 25, { stroke: C.green }, stages[4]); s.line(809, 217, 815, 217, { stroke: C.green }, stages[4]);
  const links = xs.slice(0, 4).map((x) => s.line(x + 49, 219, x + 128, 219, { stroke: C.line, 'marker-end': s.arrows.green }));
  const packet = s.packet('copper');
  s.t(450, 87, 'A public history, built from verifiable steps', { 'text-anchor': 'middle', 'font-size': 28 });
  const brace = s.g('returning-node');
  s.rect(343, 383, 214, 45, { stroke: C.blue }, brace); s.t(450, 412, 'Returning node', { 'text-anchor': 'middle', fill: C.blue, 'font-size': 21 }, brace);
  s.path('M558 405 H810 V357', { stroke: C.blue, 'stroke-dasharray': '4 6', 'marker-end': s.arrows.blue }, brace);
  s.small(450, 452, 'Checks the valid chain with greatest cumulative work', { 'text-anchor': 'middle', fill: C.green, 'font-size': 17 }, brace);
  s.note('Security rests on valid rules and the honest majority of computational work.');
  return { ...s, render(p) {
    stages.forEach((v, i) => opacity(v, 0.2 + 0.8 * phase(p, i * 0.145, i * 0.145 + 0.13)));
    links.forEach((v, i) => v.setAttribute('stroke', p > i * 0.145 + 0.18 ? C.green : C.line));
    move(packet, [[90, 219], [810, 219]], phase(p, 0.04, 0.78)); opacity(packet, phase(p, 0, 0.06) * (1 - phase(p, 0.8, 0.89)));
    opacity(brace, phase(p, 0.77, 0.96));
  } };
}

const BUILDERS = {
  introduction, transactions, timestamp, 'proof-of-work': proofOfWork, network,
  incentive, merkle, spv, value, privacy, calculations, conclusion,
};

export const SCENE_IDS = Object.freeze(Object.keys(BUILDERS));

// Camera centers in the original 900-unit scene. Repeated centers provide
// deliberate holds; easing happens only while attention changes location.
const FOCUS = {
  introduction: [[0, 0.23], [0.12, 0.23], [0.29, 0.5], [0.35, 0.5], [0.48, 0.77], [0.63, 0.5], [1, 0.5]],
  transactions: [[0, 0.18], [0.13, 0.18], [0.38, 0.5], [0.48, 0.5], [0.66, 0.8], [1, 0.8]],
  timestamp: [[0, 0.17], [0.14, 0.17], [0.43, 0.5], [0.58, 0.5], [0.86, 0.83], [1, 0.83]],
  'proof-of-work': [[0, 0.25], [0.19, 0.25], [0.45, 0.77], [1, 0.77]],
  network: [[0, 0.3], [0.12, 0.3], [0.35, 0.5], [0.71, 0.5], [0.88, 0.7], [1, 0.7]],
  incentive: [[0, 0.19], [0.16, 0.19], [0.4, 0.55], [0.69, 0.55], [0.89, 0.84], [1, 0.84]],
  merkle: [[0, 0.34], [0.15, 0.34], [0.4, 0.5], [0.52, 0.5], [0.74, 0.68], [0.85, 0.68], [0.98, 0.5], [1, 0.5]],
  spv: [[0, 0.35], [0.15, 0.35], [0.35, 0.56], [0.7, 0.56], [0.9, 0.66], [1, 0.66]],
  value: [[0, 0.17], [0.16, 0.17], [0.4, 0.48], [0.48, 0.48], [0.67, 0.8], [0.76, 0.8], [0.92, 0.7], [1, 0.7]],
  privacy: [[0, 0.28], [0.15, 0.28], [0.38, 0.52], [0.44, 0.52], [0.64, 0.8], [0.71, 0.8], [0.91, 0.52], [1, 0.52]],
  calculations: [[0, 0.28], [0.42, 0.28], [0.64, 0.76], [1, 0.76]],
  conclusion: [[0, 0.1], [0.1, 0.1], [0.26, 0.3], [0.34, 0.3], [0.49, 0.5], [0.57, 0.5], [0.73, 0.8], [0.81, 0.8], [0.96, 0.5], [1, 0.5]],
};

/** Horizontal camera center for automatic narrow-screen framing. No UI input. */
export function sceneFocus(id, progress) {
  const frames = Object.hasOwn(FOCUS, id) ? FOCUS[id] : [[0, 0.5], [1, 0.5]];
  const p = clamp(progress);
  for (let index = 1; index < frames.length; index += 1) {
    if (p <= frames[index][0]) {
      const [a, from] = frames[index - 1];
      const [b, to] = frames[index];
      return clamp(mix(from, to, phase(p, a, b)));
    }
  }
  return frames[frames.length - 1][1];
}

export function createScene(container, id, options = { q: 0.1, z: 6 }) {
  if (!container || typeof container.replaceChildren !== 'function') throw new TypeError('A scene needs a DOM container.');
  if (!Object.hasOwn(BUILDERS, id)) throw new RangeError(`Unknown scene: ${id}`);
  const scene = BUILDERS[id]();
  container.replaceChildren(scene.root);
  const initialOptions = { q: 0.1, z: 6, ...options };
  let destroyed = false;
  const render = (progress, nextOptions = {}) => {
    if (destroyed) return;
    const p = clamp(progress);
    scene.root.setAttribute('data-progress', p.toFixed(5));
    scene.root.setAttribute('data-stage', String(Math.min(3, Math.floor(p * 4))));
    scene.render(p, { ...initialOptions, ...nextOptions });
  };
  render(0);
  return {
    render,
    destroy() { destroyed = true; scene.root.remove(); },
  };
}
