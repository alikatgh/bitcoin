import * as THREE from '../vendor/three.module.js';
import { sampleStory } from './story.js';

const clamp = (n, min = 0, max = 1) => Math.min(max, Math.max(min, n));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const TAU = Math.PI * 2;
const CREAM_RGB = 'vec3(0.8745098, 0.8588235, 0.8352941)';

function poseAt(p) {
  const value = p * 10;
  const index = Math.min(9, Math.floor(value));
  return { index, t: smooth(clamp((value - index - 0.76) / 0.24)) };
}

function scalar(values, pose) {
  return mix(values[pose.index], values[pose.index + 1], pose.t);
}

function vector(object, poses, pose, property = 'position') {
  const a = poses[pose.index];
  const b = poses[pose.index + 1];
  object[property].set(mix(a[0], b[0], pose.t), mix(a[1], b[1], pose.t), mix(a[2], b[2], pose.t));
}

function beat(p, center) {
  return smooth(clamp((p - center + 0.024) / 0.024))
    * (1 - smooth(clamp((p - center - 0.076) / 0.024)));
}

function cuboid(width, height, depth, radius = 0.035) {
  const x = -width / 2;
  const y = -height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth, steps: 1, curveSegments: 3, bevelEnabled: true,
    bevelThickness: 0.018, bevelSize: 0.018, bevelSegments: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

/** One persistent Bitcoin data model. Scroll is its only clock. */
export function createBitcoinScene(container, { rendererFactory = (config) => new THREE.WebGLRenderer(config) } = {}) {
  if (!container || typeof container.appendChild !== 'function') throw new Error('A Bitcoin scene container is required.');
  let renderer;
  try {
    renderer = rendererFactory({ alpha: true, antialias: true, powerPreference: 'default' });
  } catch (cause) {
    throw new Error('WebGL is unavailable; the static Bitcoin illustration remains visible.', { cause });
  }
  const canvas = renderer.domElement;
  canvas.className = 'bitcoin-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;';
  renderer.setPixelRatio(Math.min(globalThis.window?.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;

  const geometries = new Set();
  const materials = new Set();
  const themes = [];
  const diagramSurfaces = [];
  const outlineInstances = [];
  const edgeCache = new Map();
  const ownGeometry = (geometry) => { geometries.add(geometry); return geometry; };
  const ownMaterial = (material) => { materials.add(material); return material; };
  const diagramUniform = { value: 0 };
  function surface(dark, light, { semantic = false, ...extra } = {}) {
    const material = ownMaterial(new THREE.MeshStandardMaterial({
      color: dark, roughness: 0.86, metalness: 0.02, ...extra,
    }));
    if (!semantic) {
      material.onBeforeCompile = (shader) => {
        shader.uniforms.diagramAmount = diagramUniform;
        shader.fragmentShader = `uniform float diagramAmount;\n${shader.fragmentShader}`;
        shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>',
          `#include <dithering_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, ${CREAM_RGB}, diagramAmount);`);
      };
      material.customProgramCacheKey = () => 'bitcoin-data-diagram-v1';
    }
    themes.push({ material, dark: new THREE.Color(dark), light: new THREE.Color(light), semantic });
    return material;
  }
  const slate = surface('#737b76', '#d3d0c8');
  const paper = surface('#c3c2b8', '#d6d3cb');
  const darkSlate = surface('#434c45', '#c4c6bd');
  const coral = surface('#f28b82', '#ec857b', { semantic: true });
  const mint = surface('#a3d5b8', '#7bbba0', { semantic: true });
  const ink = surface('#272e29', '#747970', { semantic: true });
  const gridMaterial = surface('#c3c6ba', '#777c71', { semantic: true });
  const diagramMaterial = ownMaterial(new THREE.MeshBasicMaterial({ color: '#dfdbd5', toneMapped: false }));
  const edgeMaterial = ownMaterial(new THREE.LineBasicMaterial({ color: '#d1d2c6', transparent: true, opacity: 0.46, toneMapped: false }));
  const faintEdgeMaterial = ownMaterial(new THREE.LineBasicMaterial({ color: '#bdc6b9', transparent: true, opacity: 0.27, toneMapped: false }));
  const coralLineMaterial = ownMaterial(new THREE.LineBasicMaterial({ color: '#f28b82', transparent: true, opacity: 0.85, toneMapped: false }));
  const networkMaterial = ownMaterial(new THREE.LineBasicMaterial({ color: '#a8b4a6', transparent: true, opacity: 0, toneMapped: false }));
  const proofMaterial = ownMaterial(new THREE.LineBasicMaterial({ color: '#ed857b', transparent: true, opacity: 0, toneMapped: false }));
  const glassMaterial = ownMaterial(new THREE.MeshBasicMaterial({ color: '#b9c8ba', transparent: true, opacity: 0.055, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-8, 8, 4.6, -4.6, 0.1, 70);
  camera.position.set(0, 0, 24);
  const root = new THREE.Group();
  root.name = 'bitcoin-world';
  scene.add(root);
  const ambient = new THREE.HemisphereLight('#f7eee0', '#313a32', 1.85);
  const key = new THREE.DirectionalLight('#fff3dc', 2.4);
  key.position.set(-4, 7, 10);
  const fill = new THREE.DirectionalLight('#c5d2cf', 0.8);
  fill.position.set(7, -2, 5);
  scene.add(ambient, key, fill);

  function mesh(parent, geometry, material, position = [0, 0, 0], outlined = true) {
    ownGeometry(geometry);
    const object = new THREE.Mesh(geometry, material);
    object.position.set(...position);
    parent.add(object);
    if (themes.some((theme) => theme.material === material && !theme.semantic)) diagramSurfaces.push({ object, material });
    if (outlined) object.add(new THREE.LineSegments(ownGeometry(new THREE.EdgesGeometry(geometry, 24)), edgeMaterial));
    return object;
  }
  function lines(parent, geometry, material = edgeMaterial) {
    const object = new THREE.LineSegments(ownGeometry(geometry), material);
    parent.add(object);
    return object;
  }
  const dummy = new THREE.Object3D();
  function instanced(parent, geometry, material, count, name, outlines = false) {
    ownGeometry(geometry);
    const object = new THREE.InstancedMesh(geometry, material, count);
    object.name = name;
    object.frustumCulled = false;
    parent.add(object);
    if (themes.some((theme) => theme.material === material && !theme.semantic)) diagramSurfaces.push({ object, material });
    if (outlines) {
      let edges = edgeCache.get(geometry);
      if (!edges) {
        edges = ownGeometry(new THREE.EdgesGeometry(geometry, 24));
        edgeCache.set(geometry, edges);
      }
      const source = edges.attributes.position;
      const lineGeometry = ownGeometry(new THREE.BufferGeometry());
      lineGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(source.count * count * 3), 3));
      const outline = lines(parent, lineGeometry, faintEdgeMaterial);
      outline.frustumCulled = false;
      outlineInstances.push({ object, outline, source, target: lineGeometry.attributes.position, version: -1 });
    }
    return object;
  }
  function matrix(object, index, position, scale = [1, 1, 1], rotation = [0, 0, 0]) {
    dummy.position.set(...position);
    dummy.scale.set(...scale);
    dummy.rotation.set(...rotation);
    dummy.updateMatrix();
    object.setMatrixAt(index, dummy.matrix);
  }
  function frame(parent, width, height, depth) {
    const geometry = ownGeometry(new THREE.BoxGeometry(width, height, depth));
    return lines(parent, new THREE.EdgesGeometry(geometry), edgeMaterial);
  }
  const tileGeometry = ownGeometry(cuboid(0.82, 0.60, 0.18, 0.045));
  const tinyCellGeometry = ownGeometry(new THREE.BoxGeometry(0.13, 0.046, 0.018));
  const cellGeometry = ownGeometry(new THREE.BoxGeometry(0.063, 0.063, 0.015));

  const block = new THREE.Group();
  block.name = 'candidate-block';
  root.add(block);
  frame(block, 4.14, 3.55, 2.48);
  mesh(block, new THREE.PlaneGeometry(4.14, 3.55), glassMaterial, [0, 0, -1.24], false);
  const side = mesh(block, new THREE.PlaneGeometry(2.48, 3.55), glassMaterial, [2.07, 0, 0], false);
  side.rotation.y = Math.PI / 2;
  const bottom = mesh(block, new THREE.PlaneGeometry(4.14, 2.48), glassMaterial, [0, -1.775, 0], false);
  bottom.rotation.x = -Math.PI / 2;

  const transactions = instanced(root, tileGeometry, slate, 63, 'transactions-63-plus-one-payment', true);
  const payment = new THREE.Group();
  payment.name = 'payment';
  root.add(payment);
  mesh(payment, tileGeometry, coral);
  // A transaction has fields, not a coin. These three restrained insets read
  // as a data record at every scale, including its place inside the block.
  const paymentFields = instanced(payment, new THREE.BoxGeometry(0.42, 0.022, 0.012), ink, 3, 'payment-data-fields');
  for (let i = 0; i < 3; i += 1) matrix(paymentFields, i, [-0.10, 0.12 - i * 0.12, 0.106], [i === 1 ? 0.72 : 1, 1, 1]);
  paymentFields.instanceMatrix.needsUpdate = true;

  const signature = new THREE.Group();
  signature.name = 'signature-64-bytes';
  payment.add(signature);
  const signatureCells = instanced(signature, cellGeometry, gridMaterial, 64, 'signature-byte-grid');
  for (let i = 0; i < 64; i += 1) matrix(signatureCells, i, [(i % 8 - 3.5) * 0.075, (3.5 - Math.floor(i / 8)) * 0.075, 0], [1, 1, 1]);
  signatureCells.instanceMatrix.needsUpdate = true;

  const keyMaterial = new THREE.Group();
  keyMaterial.name = 'private-key-kept-separate';
  root.add(keyMaterial);
  mesh(keyMaterial, cuboid(0.65, 1.02, 0.08, 0.04), darkSlate);
  const keyCells = instanced(keyMaterial, new THREE.BoxGeometry(0.08, 0.16, 0.012), paper, 12, 'private-key-material');
  for (let i = 0; i < 12; i += 1) matrix(keyCells, i, [(i % 3 - 1) * 0.15, (1.5 - Math.floor(i / 3)) * 0.21, 0.065]);
  keyCells.instanceMatrix.needsUpdate = true;

  const header = new THREE.Group();
  header.name = 'block-header';
  root.add(header);
  mesh(header, cuboid(4.14, 0.36, 2.48, 0.035), darkSlate);
  const headerCells = instanced(header, tinyCellGeometry, gridMaterial, 64, 'hash-64-hex-digits');
  const nonceInput = mesh(header, cuboid(0.25, 0.20, 0.045, 0.02), coral, [-1.87, 0, 1.285]);
  const acceptedHash = mesh(header, cuboid(0.15, 0.20, 0.045, 0.02), mint, [1.92, 0, 1.285]);
  acceptedHash.name = 'accepted-hash-indicator';
  const nonceAnchor = new THREE.Object3D();
  nonceAnchor.position.set(-1.87, 0, 1.32);
  header.add(nonceAnchor);
  const hashAnchor = new THREE.Object3D();
  hashAnchor.position.set(1.92, 0, 1.32);
  header.add(hashAnchor);

  const peers = [];
  const peerTiles = ownGeometry(cuboid(0.66, 0.24, 0.12, 0.025));
  const peerCellGeometry = ownGeometry(new THREE.BoxGeometry(0.036, 0.045, 0.015));
  for (let i = 0; i < 7; i += 1) {
    const peer = new THREE.Group();
    peer.name = `peer-history-${i + 1}`;
    root.add(peer);
    frame(peer, 0.94, 1.15, 0.72);
    mesh(peer, new THREE.PlaneGeometry(0.94, 1.15), glassMaterial, [0, 0, -0.36], false);
    const contents = instanced(peer, peerTiles, i % 2 ? paper : darkSlate, 4, `peer-${i + 1}-records`, true);
    for (let n = 0; n < 4; n += 1) matrix(contents, n, [0, 0.34 - n * 0.245, n % 2 ? 0.11 : -0.11]);
    contents.instanceMatrix.needsUpdate = true;
    const address = instanced(peer, peerCellGeometry, gridMaterial, 16, `peer-${i + 1}-public-address`);
    for (let n = 0; n < 16; n += 1) matrix(address, n, [(n - 7.5) * 0.047, 0.53, 0.38], [1, 0.55 + (n * 7 % 11) / 11, 1]);
    address.instanceMatrix.needsUpdate = true;
    peers.push(peer);
  }

  const proofNodes = instanced(root, cuboid(0.47, 0.20, 0.08, 0.025), diagramMaterial, 15, 'merkle-hashes-eight-four-two-one', true);
  proofNodes.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(15 * 3).fill(1), 3);
  const proofPathNodes = new Set([0, 8, 12, 14]);
  const proofAnchor = new THREE.Object3D();
  proofAnchor.name = 'merkle-root';
  root.add(proofAnchor);
  const leafAnchor = new THREE.Object3D();
  root.add(leafAnchor);
  const treePositions = [];
  for (let i = 0; i < 8; i += 1) treePositions.push([(i - 3.5) * 0.78, -0.95, 0.75]);
  for (let i = 0; i < 4; i += 1) treePositions.push([(i - 1.5) * 1.56, 0.13, 0.8]);
  for (let i = 0; i < 2; i += 1) treePositions.push([(i - 0.5) * 3.12, 1.13, 0.85]);
  treePositions.push([0, 2.05, 0.9]);
  const currentTreePositions = treePositions.map(() => new THREE.Vector3());

  const inputs = [];
  const outputs = [];
  for (let i = 0; i < 2; i += 1) {
    const group = new THREE.Group();
    group.name = `input-value-${i === 0 ? '0.70' : '0.50'}`;
    root.add(group);
    mesh(group, cuboid(1, 0.5, 0.12, 0.03), paper);
    inputs.push(group);
  }
  for (let i = 0; i < 2; i += 1) {
    const group = new THREE.Group();
    group.name = i === 0 ? 'change-value-0.19' : 'fee-value-0.01';
    root.add(group);
    mesh(group, cuboid(1, 0.5, 0.12, 0.02), i === 0 ? slate : paper);
    outputs.push(group);
  }
  const inputAnchor = new THREE.Object3D();
  inputAnchor.position.set(-2.22, 0.01, 0.9);
  const outputAnchor = new THREE.Object3D();
  outputAnchor.position.set(2.20, -0.07, 0.95);
  root.add(inputAnchor, outputAnchor);
  const reward = new THREE.Group();
  reward.name = 'coinbase-subsidy-plus-fees';
  root.add(reward);
  mesh(reward, cuboid(0.85, 0.42, 0.09, 0.035), paper);
  mesh(reward, new THREE.BoxGeometry(0.56, 0.10, 0.012), coral, [-0.065, 0.075, 0.065], false);
  mesh(reward, new THREE.BoxGeometry(0.17, 0.035, 0.012), ink, [-0.26, -0.08, 0.065], false);

  function dynamicLines(capacity, material, name) {
    const geometry = ownGeometry(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(capacity * 6), 3));
    geometry.setDrawRange(0, 0);
    const object = lines(root, geometry, material);
    object.name = name;
    object.frustumCulled = false;
    return geometry;
  }
  const networkGeometry = dynamicLines(40, networkMaterial, 'peer-history-and-value-links');
  const proofGeometry = dynamicLines(8, proofMaterial, 'payment-merkle-path');
  const paymentTrailGeometry = dynamicLines(3, coralLineMaterial, 'original-payment-trail');

  // Key poses describe the same entities throughout the story. No scene is
  // replaced at a chapter boundary, and every transition is reversible.
  const rotations = [
    [-0.22, -0.48, 0.04], [-0.10, -0.23, -0.03], [-0.06, -0.14, 0.03],
    [-0.28, -0.60, -0.12], [-0.15, -0.30, 0.02], [-0.18, -0.34, -0.05],
    [-0.04, -0.12, 0.01], [-0.05, -0.13, 0.01], [-0.08, -0.14, 0.05],
    [-0.10, -0.24, -0.03], [-0.22, -0.48, 0.04],
  ];
  const scales = [1.12, 1.08, 0.99, 1.10, 1.12, 1.03, 1.02, 1.02, 1.0, 1.02, 1.12];
  const blockPoses = [[0, 0, 0], [0.7, 0.15, -1.8], [0.5, 0, -2.5], [0, 0, 0], [0, 0, 0], [-2.12, 0.1, 0.7], [0.45, 0.2, -2.2], [0.5, 0.1, -2.2], [0.6, 0, -2.2], [-2.12, 0.1, 0.7], [0, 0, 0]];
  const blockScales = [1, 0.64, 0.56, 1, 1, 0.54, 0.52, 0.49, 0.50, 0.54, 1];
  const headerPoses = [[0, 1.98, 0], [0.7, 1.48, -1.8], [0.5, 1.17, -2.5], [0, 1.98, 0], [0, 1.98, 0], [-2.12, 1.17, 0.7], [0, 2.48, 0.55], [0.5, 1.1, -2.2], [0.6, 1.03, -2.2], [-2.12, 1.17, 0.7], [0, 1.98, 0]];
  const headerScales = [1, 0.64, 0.56, 1, 1, 0.54, 0.62, 0.49, 0.50, 0.54, 1];
  const paymentPoses = [[-0.15, -0.32, 2.35], [-0.1, -0.05, 2.45], [0, 0.08, 2.0], [-1.43, 1.08, 0.96], [-1.43, 1.08, 0.96], [-2.89, 0.68, 1.22], [-2.73, -1.65, 0.95], [2.20, 0.90, 1.1], [0, -0.12, 1.7], [-2.89, 0.68, 1.22], [-1.43, 1.08, 0.96]];
  const paymentScales = [[1.5, 1.5, 1.5], [2.1, 2.1, 2.1], [1.4, 1.4, 1.4], [1, 1, 1], [1, 1, 1], [0.54, 0.54, 0.54], [0.52, 0.52, 0.52], [2 / 0.856, 0.5 / 0.636, 0.156 / 0.216], [1.3, 1.3, 1.3], [0.54, 0.54, 0.54], [1, 1, 1]];
  const keyPoses = [[-2.6, -1.72, 0.0], [-2.55, 0.1, 1.45], [-3.05, -2.0, 0], [-2.65, -2.1, -0.2], [-2.65, -2.1, -0.2], [-3.05, -1.55, 0], [-3.05, -2.05, -0.2], [-3.05, -2.05, -0.2], [-3.05, -2.05, -0.2], [-3.05, -1.55, 0], [-2.6, -1.72, 0.0]];
  const keyAmount = [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const peerNetwork = [[-2.45, 1.25, 0.6], [-0.35, 2.05, -0.35], [2.0, 1.62, 0.7], [2.67, -0.25, -0.25], [1.25, -1.8, 0.6], [-1.15, -1.88, -0.4], [-2.7, -0.65, 0.75]];
  const peerPoses = peers.map((peer, i) => {
    const history = [0.75 + i * 0.36, 0.65 + i * 0.13, -2.1 - i * 0.54];
    const chain = [-0.73 + i * 0.75, 0.10 + i * 0.075, 0.1 - i * 0.3];
    const fork = i < 5 ? [-0.73 + i * 0.82, 0.10 + i * 0.08, 0.1 - i * 0.23] : [-0.15 + (i - 5) * 0.9, -1.40 - (i - 5) * 0.12, 0.35];
    return [history, history, peerNetwork[i], history, [1.2 + i * 0.20, -0.7 + i * 0.2, -2.5 - i * 0.35], chain, history, history, peerNetwork[i], fork, history];
  });
  const peerScales = peers.map((peer, i) => [0.67 - i * 0.065, 0.52 - i * 0.045, 0.87, 0.61 - i * 0.055, 0.48 - i * 0.04, i === 6 ? 0.035 : 0.85, 0.42 - i * 0.035, 0.40 - i * 0.03, 0.85, 0.82, 0.67 - i * 0.065]);
  const tilePoses = [];
  for (let id = 0; id < 64; id += 1) {
    const x = (id % 4 - 1.5) * 0.95;
    const y = (1.5 - Math.floor(id / 4) % 4) * 0.72;
    const z = (1.5 - Math.floor(id / 16)) * 0.64;
    const grid = [x, y, z];
    const map = (position, s) => [position[0] + x * s, position[1] + y * s, position[2] + z * s];
    const leaf = Math.floor(id / 8);
    const n = id % 8;
    tilePoses.push([
      grid, map(blockPoses[1], 0.64), map(blockPoses[2], 0.56), grid, grid,
      map(blockPoses[5], 0.54), [(leaf - 3.5) * 0.78, -1.65 + (n % 2) * 0.04, 0.95 - Math.floor(n / 2) * 0.12],
      map(blockPoses[7], 0.49), map(blockPoses[8], 0.5), map(blockPoses[9], 0.54), grid,
    ]);
  }
  const tileScales = [1, 0.64, 0.56, 1, 1, 0.54, 0.47, 0.49, 0.5, 0.54, 1];
  const signatureAmount = [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const valueAmount = [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
  const outlinePoint = new THREE.Vector3();
  const outlineMatrix = new THREE.Matrix4();
  const projectPoint = new THREE.Vector3();
  const scratch = new THREE.Color();
  const grayColor = new THREE.Color('#bfc3b7');
  const darkColor = new THREE.Color('#535f52');
  const coralColor = new THREE.Color('#e78e82');
  const whiteColor = new THREE.Color('#ffffff');
  const mintColor = new THREE.Color('#a3d5b8');
  const edgeDarkColor = new THREE.Color('#d1d2c6');
  const faintEdgeDarkColor = new THREE.Color('#bdc6b9');
  const diagramEdgeColor = new THREE.Color('#63685f');
  const proofDarkColor = new THREE.Color('#ed857b');
  const proofLightColor = new THREE.Color('#b65d50');
  const proofNodeDarkColor = new THREE.Color('#f28b82');
  const proofNodeLightColor = new THREE.Color('#b65d50');
  // Compensate the shared cream fill so the four instance colors render as
  // the payment's coral rather than a cream-tinted approximation of it.
  for (const color of [proofNodeDarkColor, proofNodeLightColor]) {
    color.setRGB(color.r / diagramMaterial.color.r, color.g / diagramMaterial.color.g, color.b / diagramMaterial.color.b);
  }
  let previousWidth = 0;
  let previousHeight = 0;
  let lastProgress = 0;
  let lastOptions = {};
  let destroyed = false;
  let lost = false;

  function anchor(object, id) {
    object.getWorldPosition(projectPoint);
    projectPoint.project(camera);
    return { id, x: (projectPoint.x + 1) / 2, y: (1 - projectPoint.y) / 2, visible: Math.abs(projectPoint.x) < 1.04 && Math.abs(projectPoint.y) < 1.04 };
  }

  function render(progress, options = {}) {
    if (destroyed) throw new Error('The Bitcoin scene has been destroyed.');
    if (lost) return { ready: false, anchors: [] };
    lastProgress = clamp(Number.isFinite(progress) ? progress : 0);
    lastOptions = options;
    const width = Math.max(1, container.clientWidth || container.getBoundingClientRect().width);
    const height = Math.max(1, container.clientHeight || container.getBoundingClientRect().height);
    if (width !== previousWidth || height !== previousHeight) {
      renderer.setSize(width, height, false);
      previousWidth = width;
      previousHeight = height;
    }
    const aspect = width / height;
    // Portrait tablets need the same lower, centered composition as phones.
    // Keep this condition aligned with the copy layout's responsive query.
    const narrow = width <= 760 || aspect <= 1;
    const viewHeight = narrow ? Math.max(8.5 / aspect, 14.9) : 9.15;
    const viewWidth = viewHeight * aspect;
    camera.left = -viewWidth / 2;
    camera.right = viewWidth / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix();
    const pose = poseAt(lastProgress);
    const story = sampleStory(lastProgress);
    const light = clamp(story.light || 0);
    diagramUniform.value = light;
    for (const theme of themes) theme.material.color.copy(theme.dark).lerp(theme.light, light);
    for (const item of diagramSurfaces) item.object.material = light > 0.99999 ? diagramMaterial : item.material;
    edgeMaterial.color.copy(edgeDarkColor).lerp(diagramEdgeColor, light);
    edgeMaterial.opacity = mix(0.46, 0.88, light);
    faintEdgeMaterial.color.copy(faintEdgeDarkColor).lerp(diagramEdgeColor, light);
    faintEdgeMaterial.opacity = mix(0.27, 0.85, light);
    proofMaterial.color.copy(proofDarkColor).lerp(proofLightColor, light);
    glassMaterial.opacity = mix(0.055, 0, light);
    ambient.intensity = mix(1.85, 1.3, light);
    key.intensity = mix(2.4, 1.0, light);
    fill.intensity = mix(0.8, 0.5, light);
    vector(root, rotations, pose, 'rotation');
    root.scale.setScalar(scalar(scales, pose));
    root.position.set(narrow ? 0 : viewWidth * 0.175, narrow ? -viewHeight * 0.16 : -0.08, 0);
    vector(block, blockPoses, pose);
    block.scale.setScalar(scalar(blockScales, pose));
    vector(header, headerPoses, pose);
    header.scale.setScalar(scalar(headerScales, pose));
    vector(payment, paymentPoses, pose);
    vector(payment, paymentScales, pose, 'scale');
    vector(keyMaterial, keyPoses, pose);
    const keyOpen = scalar(keyAmount, pose);
    keyMaterial.visible = keyOpen > 0;
    keyMaterial.scale.setScalar(keyOpen * 0.95);
    const signatureOpen = scalar(signatureAmount, pose);
    signature.visible = signatureOpen > 0;
    signature.position.z = mix(-0.18, 0.145, signatureOpen);
    signature.scale.setScalar(signatureOpen * 0.83);
    paymentFields.visible = signatureOpen < 1;
    paymentFields.scale.setScalar(1 - signatureOpen * 0.95);
    const valueOpen = scalar(valueAmount, pose);
    for (let i = 0; i < 2; i += 1) {
      const input = inputs[i];
      input.visible = valueOpen > 0;
      input.position.set(mix(-2.2, -2.22, valueOpen), mix(-1.65, i === 0 ? 0.48 : -0.46, valueOpen), mix(-1.1, 0.9, valueOpen));
      input.scale.set((i === 0 ? 0.7 : 0.5) * 2 / 1.036 * valueOpen, 0.5 / 0.536 * valueOpen, valueOpen);
      const output = outputs[i];
      output.visible = valueOpen > 0;
      output.position.set(mix(2.3, 2.20, valueOpen), mix(-1.65, i === 0 ? -0.12 : -0.99, valueOpen), mix(-1.1, 0.9, valueOpen));
      output.scale.set((i === 0 ? 0.19 : 0.01) * 2 / 1.036 * valueOpen, 0.5 / 0.536 * valueOpen, valueOpen);
    }
    const rewardOpen = scalar([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0], pose);
    reward.visible = rewardOpen > 0;
    reward.position.set(-2.06, mix(-1.9, -1.43, rewardOpen), mix(-0.7, 1.1, rewardOpen));
    reward.scale.setScalar(rewardOpen * 1.2);
    for (let i = 0; i < peers.length; i += 1) {
      vector(peers[i], peerPoses[i], pose);
      peers[i].scale.setScalar(scalar(peerScales[i], pose));
      peers[i].visible = i !== 6 || scalar([1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1], pose) > 0;
      peers[i].rotation.y = scalar([0, 0, (i % 3 - 1) * 0.13, 0, 0, 0, 0, 0, (i % 3 - 1) * 0.13, 0, 0], pose);
    }
    const tileScale = scalar(tileScales, pose);
    for (let id = 1; id < 64; id += 1) {
      const a = tilePoses[id][pose.index];
      const b = tilePoses[id][pose.index + 1];
      matrix(transactions, id - 1, [mix(a[0], b[0], pose.t), mix(a[1], b[1], pose.t), mix(a[2], b[2], pose.t)], [tileScale, tileScale, tileScale]);
      scratch.copy(grayColor).lerp(darkColor, ((id * 17) % 13) / 20).lerp(whiteColor, light);
      transactions.setColorAt(id - 1, scratch);
    }
    transactions.instanceMatrix.needsUpdate = true;
    transactions.instanceColor.needsUpdate = true;
    const mining = beat(lastProgress, 0.4);
    const nonce = Math.floor(clamp((lastProgress - 0.4) / 0.06) * (options.reducedMotion ? 16 : 64));
    for (let i = 0; i < 64; i += 1) {
      const value = ((i * 29 + nonce * 17 + (i + nonce) * (i + 3)) % 16) / 15;
      matrix(headerCells, i, [(i % 16 - 7.5) * 0.213, (1.5 - Math.floor(i / 16)) * 0.068, 1.272], [1, mix(0.6, 1.05, value), 1]);
      scratch.copy(grayColor).lerp(darkColor, value * 0.65);
      if (i % 11 === 0) scratch.lerp(coralColor, mining * 0.75);
      headerCells.setColorAt(i, scratch);
    }
    headerCells.instanceMatrix.needsUpdate = true;
    headerCells.instanceColor.needsUpdate = true;
    // One accepted result is distinguished; the entire candidate never turns
    // green, and the changing 64 cells stand for a 64-hex-digit block hash.
    const accepted = smooth(clamp((lastProgress - 0.435) / 0.025)) * (1 - smooth(clamp((lastProgress - 0.576) / 0.024)));
    acceptedHash.visible = accepted > 0;
    acceptedHash.scale.setScalar(accepted);
    nonceInput.scale.y = 1 + mining * Math.sin(nonce * 0.57) * (options.reducedMotion ? 0.02 : 0.1);

    const tree = beat(lastProgress, 0.6);
    proofNodes.visible = tree > 0;
    for (let i = 0; i < 15; i += 1) {
      const home = [(i % 5 - 2) * 0.28, 1.92, -0.5 - Math.floor(i / 5) * 0.09];
      currentTreePositions[i].set(mix(home[0], treePositions[i][0], tree), mix(home[1], treePositions[i][1], tree), mix(home[2], treePositions[i][2], tree));
      matrix(proofNodes, i, currentTreePositions[i].toArray(), [tree, tree, tree]);
      if (proofPathNodes.has(i)) scratch.copy(proofNodeDarkColor).lerp(proofNodeLightColor, light);
      else scratch.copy(whiteColor);
      proofNodes.setColorAt(i, scratch);
    }
    proofNodes.instanceMatrix.needsUpdate = true;
    proofNodes.instanceColor.needsUpdate = true;
    proofAnchor.position.copy(currentTreePositions[14]);
    leafAnchor.position.copy(currentTreePositions[0]);

    const peerAmount = Math.max(beat(lastProgress, 0.2), beat(lastProgress, 0.8));
    const chainAmount = Math.max(beat(lastProgress, 0.5), beat(lastProgress, 0.9));
    const value = beat(lastProgress, 0.7);
    const signing = beat(lastProgress, 0.1);
    const historyAmount = Math.max(beat(lastProgress, 0), beat(lastProgress, 0.3), beat(lastProgress, 0.4), smooth(clamp((lastProgress - 0.976) / 0.024)));
    let links = 0;
    let proofs = 0;
    let trails = 0;
    function line(geometry, from, to, kind = 'links') {
      const count = kind === 'proofs' ? proofs++ : kind === 'trails' ? trails++ : links++;
      const position = geometry.attributes.position;
      position.setXYZ(count * 2, from.x, from.y, from.z);
      position.setXYZ(count * 2 + 1, to.x, to.y, to.z);
    }
    const point = (p) => ({ x: p[0], y: p[1], z: p[2] });
    if (tree > 0.001) {
      for (let i = 0; i < 8; i += 1) line(networkGeometry, currentTreePositions[i], currentTreePositions[8 + Math.floor(i / 2)]);
      for (let i = 0; i < 4; i += 1) line(networkGeometry, currentTreePositions[8 + i], currentTreePositions[12 + Math.floor(i / 2)]);
      line(networkGeometry, currentTreePositions[12], currentTreePositions[14]);
      line(networkGeometry, currentTreePositions[13], currentTreePositions[14]);
      for (const [from, to] of [[0, 8], [8, 12], [12, 14]]) line(proofGeometry, currentTreePositions[from], currentTreePositions[to], 'proofs');
      line(proofGeometry, payment.position, currentTreePositions[0], 'proofs');
    } else if (peerAmount > 0.001) {
      for (const peer of peers) line(networkGeometry, payment.position, peer.position);
      for (let i = 0; i < 7; i += 1) line(networkGeometry, peers[i].position, peers[(i + 2) % 7].position);
      line(paymentTrailGeometry, payment.position, peers[0].position, 'trails');
      line(paymentTrailGeometry, peers[0].position, peers[3].position, 'trails');
    } else if (chainAmount > 0.001) {
      line(networkGeometry, block.position, peers[0].position);
      const fork = lastProgress >= 0.876;
      for (let i = 0; i < (fork ? 4 : 5); i += 1) line(networkGeometry, peers[i].position, peers[i + 1].position);
      if (fork) {
        line(proofGeometry, peers[1].position, peers[5].position, 'proofs');
        line(proofGeometry, peers[5].position, peers[6].position, 'proofs');
      }
    } else if (value > 0.001) {
      const combine = point([0, 0, 1]);
      for (const input of inputs) line(networkGeometry, input.position, combine);
      for (const output of [...outputs, payment]) line(networkGeometry, combine, output.position);
      line(paymentTrailGeometry, combine, payment.position, 'trails');
    } else if (signing > 0.001) {
      line(paymentTrailGeometry, keyMaterial.position, payment.position, 'trails');
    }
    if (links === 0 && historyAmount > 0.001) {
      line(networkGeometry, header.position, peers[0].position);
      for (let i = 0; i < 6; i += 1) line(networkGeometry, peers[i].position, peers[i + 1].position);
    }
    networkMaterial.opacity = Math.max(tree * 0.62, peerAmount * 0.35, chainAmount * 0.7, value * 0.65, historyAmount * 0.34);
    networkMaterial.color.set(light > 0.5 ? '#8c9486' : '#a8b4a6');
    proofMaterial.opacity = Math.max(tree * 0.98, lastProgress >= 0.876 ? chainAmount * 0.8 : 0);
    coralLineMaterial.opacity = Math.max(peerAmount * 0.9, value * 0.9, signing * 0.8);
    for (const [geometry, count] of [[networkGeometry, links], [proofGeometry, proofs], [paymentTrailGeometry, trails]]) {
      geometry.attributes.position.needsUpdate = true;
      geometry.setDrawRange(0, count * 2);
    }
    for (const outline of outlineInstances) {
      outline.outline.visible = outline.object.visible;
      if (outline.version === outline.object.instanceMatrix.version) continue;
      let cursor = 0;
      for (let i = 0; i < outline.object.count; i += 1) {
        outline.object.getMatrixAt(i, outlineMatrix);
        for (let j = 0; j < outline.source.count; j += 1) {
          outlinePoint.fromBufferAttribute(outline.source, j).applyMatrix4(outlineMatrix);
          outline.target.setXYZ(cursor++, outlinePoint.x, outlinePoint.y, outlinePoint.z);
        }
      }
      outline.target.needsUpdate = true;
      outline.version = outline.object.instanceMatrix.version;
    }
    scene.updateMatrixWorld(true);
    renderer.render(scene, camera);
    const anchorTargets = [
      [payment, block], [keyMaterial, payment], [peers[0], payment],
      [peers[0], transactions], [nonceAnchor, hashAnchor], [peers[3], reward],
      [proofAnchor, leafAnchor], [inputAnchor, outputAnchor], [peers[1], peers[3]],
      [peers[2], peers[6]], [payment, peers[2]],
    ];
    const [primary, secondary] = anchorTargets[Math.min(10, story.index)];
    return { ready: true, anchors: [anchor(primary, 'primary'), anchor(secondary, 'secondary')], drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  }

  function contextLost(event) {
    event.preventDefault();
    lost = true;
    canvas.style.visibility = 'hidden';
    container.dispatchEvent(new CustomEvent('scene-lost'));
  }
  function contextRestored() {
    if (destroyed) return;
    lost = false;
    canvas.style.visibility = '';
    try {
      render(lastProgress, lastOptions);
      container.dispatchEvent(new CustomEvent('scene-restored'));
    } catch {
      lost = true;
      canvas.style.visibility = 'hidden';
      container.dispatchEvent(new CustomEvent('scene-lost'));
    }
  }
  canvas.addEventListener('webglcontextlost', contextLost);
  canvas.addEventListener('webglcontextrestored', contextRestored);
  container.appendChild(canvas);

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    canvas.removeEventListener('webglcontextlost', contextLost);
    canvas.removeEventListener('webglcontextrestored', contextRestored);
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    renderer.dispose();
    canvas.remove();
  }
  return { render, destroy };
}
