// All choreography has one clock: the document's scroll position.
export const story = [
  { name: 'Bitcoin', title: ['Money.', 'Peer to peer.'], body: 'Follow a payment from a private key to a shared history.', labels: ['signed payments', 'shared history'] },
  { name: 'Signature', title: ['Your payment.', 'Your signature.'], body: 'A private key authorizes the transfer. The key stays with its owner.', labels: ['private key', 'signed transaction'] },
  { name: 'Network', title: ['Checked', 'by peers.'], body: 'Each node checks the signature and confirms the inputs are unspent.', labels: ['independent nodes', 'same transaction'] },
  { name: 'Blocks', title: ['A block', 'of history.'], body: 'Transactions are grouped. Each block points to the one before it.', labels: ['previous block hash', 'transactions'] },
  { name: 'Proof of work', title: ['Hard to find.', 'Easy to check.'], body: 'Miners try nonces until a hash meets the target. Nodes verify the result.', labels: ['nonce attempts', 'valid block hash'] },
  { name: 'Consensus', title: ['Work builds', 'on work.'], body: 'Nodes follow the valid chain with the most accumulated work. Miners earn the block reward and fees.', labels: ['accumulated work', 'reward + fees'] },
  { name: 'Merkle proof', title: ['One payment.', 'A short proof.'], body: 'A path of hashes links a transaction to the block header. A light client checks inclusion without the full block.', labels: ['Merkle root', 'inclusion path'] },
  { name: 'Value', title: ['Combine.', 'Then divide.'], body: 'Inputs fund the payment, change, and fee. No extra value is created.', labels: ['inputs · 0.70 + 0.50 BTC', '1.00 paid · 0.19 change · 0.01 fee'], readout: '1.20 = 1.00 + 0.19 + 0.01 BTC' },
  { name: 'Privacy', title: ['Public transfers.', 'Private keys.'], body: 'Addresses and amounts are visible. An address is not a name, but transfers can still be linked.', labels: ['public addresses', 'visible connections'] },
  { name: 'Confirmations', title: ['Deeper history.', 'Harder to replace.'], body: 'An attacker with less hash power becomes less likely to catch up as confirmations accumulate. The risk never becomes zero.', labels: ['accepted chain', 'competing branch'] },
  { name: 'Bitcoin', title: ['A payment.', 'A shared history.'], body: 'Signed by its owner. Checked by peers. Recorded through proof of work.', labels: ['one payment', 'many independent nodes'] },
];

export function safeProgress(value) {
  try { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0; }
  catch { return 0; }
}

export function smoothRange(value, from, to) {
  const t = safeProgress((value - from) / (to - from));
  return t * t * (3 - 2 * t);
}

export function sampleStory(value) {
  const progress = safeProgress(value);
  const end = progress >= .975;
  const index = end ? 10 : Math.min(9, Math.floor(progress * 10));
  const local = end ? (progress - .975) / .025 : index === 9 ? (progress - .9) / .075 : progress * 10 - index;
  const pulse = center => smoothRange(progress, center - .04, center - .015) * (1 - smoothRange(progress, center + .075, center + .10));
  const light = Math.max(pulse(.3), pulse(.6), pulse(.8));
  // Copy moves only near the boundary, leaving most of each beat to read it.
  const exit = index === 10 ? 0 : smoothRange(local, .76, .98);
  const entry = index === 0 ? 1 : smoothRange(local, 0, .18);
  return { progress, index, local, light, opacity: entry * (1 - exit), offset: (1 - entry) * 20 - exit * 20 };
}

export function luminance(rgb) {
  return rgb.map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4)
    .reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
}

export function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + .05) / (values[1] + .05);
}

export function sampleTheme(value) {
  const light = safeProgress(value);
  const background = [37, 36, 35].map((n, i) => Math.round(n + ([223, 219, 213][i] - n) * light));
  const preferredInk = light > .45 ? [37, 36, 35] : [240, 237, 232];
  const preferredMuted = light > .45 ? [87, 83, 78] : [188, 182, 174];
  const highContrast = luminance(background) > .179 ? [0, 0, 0] : [255, 255, 255];
  const readable = color => contrast(color, background) >= 4.5 ? color : highContrast;
  return { background, ink: readable(preferredInk), muted: readable(preferredMuted), rule: light > .45 ? [145, 139, 130] : [116, 113, 106] };
}
