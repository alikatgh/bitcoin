import test from 'node:test';
import assert from 'node:assert/strict';
import { createBitcoinScene } from '../src/bitcoin-scene.js';
import * as THREE from '../vendor/three.module.js';

class TestNode extends EventTarget {
  constructor(properties = {}) {
    super();
    this.childNodes = [];
    this.parentNode = null;
    this.style = {};
    this.attributes = new Map();
    this.listeners = new Map();
    Object.assign(this, properties);
  }

  appendChild(child) {
    child.remove();
    this.childNodes.push(child);
    child.parentNode = this;
    return child;
  }

  remove() {
    if (this.parentNode) {
      this.parentNode.childNodes.splice(this.parentNode.childNodes.indexOf(this), 1);
      this.parentNode = null;
    }
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getBoundingClientRect() { return { width: this.clientWidth, height: this.clientHeight }; }

  addEventListener(type, callback, options) {
    super.addEventListener(type, callback, options);
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
  }

  removeEventListener(type, callback, options) {
    super.removeEventListener(type, callback, options);
    this.listeners.get(type)?.delete(callback);
  }

  listenerCount() { return [...this.listeners.values()].reduce((total, set) => total + set.size, 0); }
}

function withWindow(t) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: { devicePixelRatio: 1.5 } });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else Reflect.deleteProperty(globalThis, 'window');
  });
}

function fixture(t) {
  withWindow(t);
  const container = new TestNode({ clientWidth: 1300, clientHeight: 1000 });
  const fallback = new TestNode();
  fallback.setAttribute('data-original', 'retained');
  container.appendChild(fallback);
  const canvas = new TestNode();
  const renderer = {
    domElement: canvas,
    info: { render: { calls: 7, triangles: 42 } },
    frames: [],
    sizes: [],
    disposalCount: 0,
    setPixelRatio(value) { this.pixelRatio = value; },
    setClearColor() {},
    setSize(width, height, updateStyle) { this.sizes.push({ width, height, updateStyle }); },
    render(scene, camera) {
      // WebGLRenderer also updates an unparented camera before drawing.
      camera.updateMatrixWorld();
      this.frames.push({ scene, camera });
    },
    dispose() { this.disposalCount++; },
  };
  const bitcoin = createBitcoinScene(container, { rendererFactory: () => renderer });
  t.after(() => bitcoin.destroy());
  return { bitcoin, renderer, canvas, container, fallback };
}

function objects(scene) {
  const result = [];
  scene.traverse(object => result.push(object));
  return result;
}

function resources(scene) {
  const geometries = new Set();
  const materials = new Set();
  scene.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material) materials.add(material);
    }
  });
  return { geometries, materials };
}

function snapshot(scene, camera) {
  return {
    camera: [...camera.projectionMatrix.elements, ...camera.matrixWorld.elements],
    objects: objects(scene).map(object => ({
      transform: [...object.matrix.elements, ...object.matrixWorld.elements],
      visible: object.visible,
      material: Array.isArray(object.material) ? object.material.map(material => material.uuid) : object.material?.uuid,
      instances: object.instanceMatrix ? [...object.instanceMatrix.array] : null,
      colors: object.instanceColor ? [...object.instanceColor.array] : null,
    })),
    geometry: [...resources(scene).geometries].map(geometry => {
      const { start, count } = geometry.drawRange;
      const positions = geometry.attributes.position;
      return {
        range: [start, count],
        // Unused capacity in dynamic line buffers does not affect the frame.
        positions: [...positions.array.slice(start * positions.itemSize, (start + count) * positions.itemSize)],
      };
    }),
    materials: [...resources(scene).materials].map(material => ({
      color: material.color?.toArray(), opacity: material.opacity,
    })),
  };
}

function finiteArray(values, message) {
  assert.equal(values.findIndex(value => !Number.isFinite(value)), -1, message);
}

function assertFiniteFrame(scene, camera, result) {
  for (const object of objects(scene)) {
    finiteArray(object.matrix.elements, `${object.type} local transform`);
    finiteArray(object.matrixWorld.elements, `${object.type} world transform`);
    if (object.instanceMatrix) finiteArray(object.instanceMatrix.array, 'instance transform');
    if (object.instanceColor) finiteArray(object.instanceColor.array, 'instance colors');
  }
  finiteArray(camera.projectionMatrix.elements, 'camera projection');
  for (const geometry of resources(scene).geometries) {
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      finiteArray(attribute.array, `geometry ${name}`);
    }
  }
  assert.equal(result.ready, true);
  assert.equal(result.anchors.length, 2);
  for (const anchor of result.anchors) {
    assert.ok(Number.isFinite(anchor.x) && Number.isFinite(anchor.y), 'projected anchor is finite');
  }
}

function named(scene, name) {
  const object = scene.getObjectByName(name);
  assert.ok(object, `the scene contains ${name}`);
  return object;
}

function nearlyEqual(actual, expected, message, tolerance = 2e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} should equal ${expected}`);
}

function body(group) {
  const mesh = group.children.find(object => object.isMesh && !object.isInstancedMesh);
  assert.ok(mesh, `${group.name} has a visible body`);
  return mesh;
}

function bodySize(group) {
  const mesh = body(group);
  mesh.geometry.computeBoundingBox();
  return mesh.geometry.boundingBox.getSize(new THREE.Vector3()).multiply(mesh.scale).multiply(group.scale);
}

function projectedBounds(mesh, camera, instanceIndex) {
  mesh.geometry.computeBoundingBox();
  const { min, max } = mesh.geometry.boundingBox;
  const transform = mesh.matrixWorld.clone();
  if (instanceIndex !== undefined) {
    const instance = new THREE.Matrix4();
    mesh.getMatrixAt(instanceIndex, instance);
    transform.multiply(instance);
  }
  const bounds = { left: Infinity, right: -Infinity, bottom: Infinity, top: -Infinity };
  for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) {
    const point = new THREE.Vector3(x, y, z).applyMatrix4(transform).project(camera);
    bounds.left = Math.min(bounds.left, point.x);
    bounds.right = Math.max(bounds.right, point.x);
    bounds.bottom = Math.min(bounds.bottom, point.y);
    bounds.top = Math.max(bounds.top, point.y);
  }
  return bounds;
}

function assertInView(bounds, label) {
  assert.ok(bounds.left >= -1 && bounds.right <= 1 && bounds.bottom >= -1 && bounds.top <= 1,
    `${label} stays inside the viewport: ${JSON.stringify(bounds)}`);
}

function instanceCenter(object, index) {
  const matrix = new THREE.Matrix4();
  object.getMatrixAt(index, matrix);
  return new THREE.Vector3().setFromMatrixPosition(matrix).applyMatrix4(object.matrixWorld);
}

function segments(object) {
  const { start, count } = object.geometry.drawRange;
  const positions = object.geometry.attributes.position;
  const result = [];
  for (let i = start; i < start + count; i += 2) {
    result.push([0, 1].map(offset => new THREE.Vector3().fromBufferAttribute(positions, i + offset).applyMatrix4(object.matrixWorld)));
  }
  return result;
}

function assertConnections(actual, expected, label) {
  assert.equal(actual.length, expected.length, `${label} has exactly the required connections`);
  const unmatched = [...actual];
  const close = (a, b) => a.distanceTo(b) < 2e-6;
  for (const [from, to] of expected) {
    const index = unmatched.findIndex(([a, b]) => close(a, from) && close(b, to) || close(a, to) && close(b, from));
    assert.notEqual(index, -1, `${label} meets the current node centers at both endpoints`);
    unmatched.splice(index, 1);
  }
}

test('the real Three scene keeps one canvas and exactly rewinds its persistent objects', t => {
  const { bitcoin, renderer, canvas, container, fallback } = fixture(t);
  bitcoin.render(0);
  const materialPool = resources(renderer.frames.at(-1).scene).materials;
  const baselineResult = bitcoin.render(.37);
  const { scene, camera } = renderer.frames.at(-1);
  assert.equal(scene.isScene, true);
  assert.equal(camera.isCamera, true);
  const initialObjects = objects(scene);
  const initialResources = resources(scene);
  for (const material of initialResources.materials) materialPool.add(material);
  const baseline = snapshot(scene, camera);
  assertFiniteFrame(scene, camera, baselineResult);
  assert.equal(baselineResult.drawCalls, renderer.info.render.calls);
  assert.equal(baselineResult.triangles, renderer.info.render.triangles);

  let seed = 17;
  const progressValues = [0, 1, .6, .2, .9, .4];
  for (let i = 0; i < 10; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    progressValues.push(seed / 2 ** 32);
  }
  for (const progress of progressValues) {
    const result = bitcoin.render(progress);
    const frame = renderer.frames.at(-1);
    assert.equal(frame.scene, scene);
    assert.equal(frame.camera, camera);
    const currentObjects = objects(scene);
    assert.equal(currentObjects.length, initialObjects.length);
    currentObjects.forEach((object, i) => assert.equal(object, initialObjects[i]));
    const currentResources = resources(scene);
    assert.equal(currentResources.geometries.size, initialResources.geometries.size);
    for (const geometry of currentResources.geometries) assert.ok(initialResources.geometries.has(geometry), 'geometry is reused');
    for (const material of currentResources.materials) assert.ok(materialPool.has(material), 'dark and diagram states reuse the fixed material pool');
    assert.deepEqual(container.childNodes, [fallback, canvas]);
    assertFiniteFrame(scene, camera, result);
  }
  bitcoin.render(.37);
  assert.deepEqual(snapshot(scene, camera), baseline, 'rewind restores transforms, geometry, colors, and camera exactly');

  for (const [width, height] of [[390, 844], [0, 0], [1300, 1000]]) {
    container.clientWidth = width;
    container.clientHeight = height;
    for (const progress of [NaN, Infinity, -Infinity, undefined, null, '0.5', Symbol('invalid'), {}, -5, 5, .68]) {
      const result = bitcoin.render(progress, { aspect: width / height, reducedMotion: true });
      assertFiniteFrame(scene, camera, result);
    }
  }
  assert.equal(renderer.pixelRatio, 1.5);
  assert.equal(fallback.attributes.get('data-original'), 'retained');
});

test('context restoration reuses the scene, and destroy disposes resources once while retaining the fallback', t => {
  const { bitcoin, renderer, canvas, container, fallback } = fixture(t);
  const events = [];
  container.addEventListener('scene-lost', () => events.push('lost'));
  container.addEventListener('scene-restored', () => events.push('restored'));
  bitcoin.render(0);
  const darkMaterials = resources(renderer.frames.at(-1).scene).materials;
  bitcoin.render(.62, { reducedMotion: true });
  const { scene, camera } = renderer.frames.at(-1);
  const beforeLoss = snapshot(scene, camera);
  const renderCount = renderer.frames.length;
  const loss = new Event('webglcontextlost', { cancelable: true });
  canvas.dispatchEvent(loss);
  assert.equal(loss.defaultPrevented, true);
  assert.deepEqual(events, ['lost']);
  assert.equal(canvas.style.visibility, 'hidden');
  assert.deepEqual(bitcoin.render(.9), { ready: false, anchors: [] });
  assert.equal(renderer.frames.length, renderCount);
  assert.equal(fallback.parentNode, container);
  assert.equal(fallback.attributes.has('hidden'), false);

  canvas.dispatchEvent(new Event('webglcontextrestored'));
  assert.deepEqual(events, ['lost', 'restored']);
  assert.equal(canvas.style.visibility, '');
  assert.equal(renderer.frames.length, renderCount + 1);
  assert.equal(renderer.frames.at(-1).scene, scene);
  assert.deepEqual(snapshot(scene, camera), beforeLoss, 'recovery renders the last successful state');
  assert.deepEqual(container.childNodes, [fallback, canvas]);

  const owned = resources(scene);
  for (const material of darkMaterials) owned.materials.add(material);
  assert.ok(owned.geometries.size > 0 && owned.materials.size > 0);
  const disposals = new Map();
  for (const resource of [...owned.geometries, ...owned.materials]) {
    disposals.set(resource, 0);
    resource.addEventListener('dispose', () => disposals.set(resource, disposals.get(resource) + 1));
  }
  bitcoin.destroy();
  bitcoin.destroy();
  assert.equal(renderer.disposalCount, 1);
  for (const [resource, count] of disposals) assert.equal(count, 1, `${resource.type} disposed once`);
  assert.equal(canvas.listenerCount(), 0);
  assert.equal(canvas.parentNode, null);
  assert.deepEqual(container.childNodes, [fallback]);
  assert.equal(fallback.attributes.get('data-original'), 'retained');
  canvas.dispatchEvent(new Event('webglcontextrestored'));
  assert.deepEqual(events, ['lost', 'restored']);
  assert.throws(() => bitcoin.render(0), /destroyed/);
});

test('renderer initialization failure leaves the original fallback and container untouched', t => {
  withWindow(t);
  const container = new TestNode({ clientWidth: 1300, clientHeight: 1000 });
  const fallback = new TestNode();
  fallback.setAttribute('data-original', 'retained');
  container.appendChild(fallback);
  const failure = new Error('Renderer creation failed');
  assert.throws(() => createBitcoinScene(container, { rendererFactory() { throw failure; } }), error => {
    assert.match(error.message, /WebGL is unavailable/);
    assert.equal(error.cause, failure);
    return true;
  });
  assert.deepEqual(container.childNodes, [fallback]);
  assert.equal(fallback.parentNode, container);
  assert.equal(fallback.attributes.get('data-original'), 'retained');
  assert.equal(container.listenerCount(), 0);
});

test('the rendered value bars conserve 0.70 + 0.50 as payment 1.00 + change 0.19 + fee 0.01', t => {
  const { bitcoin, renderer } = fixture(t);
  bitcoin.render(.725);
  const { scene } = renderer.frames.at(-1);
  const inputSizes = ['input-value-0.70', 'input-value-0.50'].map(name => bodySize(named(scene, name)));
  const outputSizes = ['payment', 'change-value-0.19', 'fee-value-0.01'].map(name => bodySize(named(scene, name)));
  const paymentWidth = outputSizes[0].x;
  assert.ok(paymentWidth > 0);
  [.70, .50].forEach((value, i) => nearlyEqual(inputSizes[i].x / paymentWidth, value, `input ${i + 1} width represents its value`));
  [1, .19, .01].forEach((value, i) => nearlyEqual(outputSizes[i].x / paymentWidth, value, `output ${i + 1} width represents its value`));
  nearlyEqual(inputSizes.reduce((sum, size) => sum + size.x, 0), outputSizes.reduce((sum, size) => sum + size.x, 0), 'rendered input and output widths conserve value');
  for (const size of [...inputSizes, ...outputSizes]) {
    nearlyEqual(size.y, outputSizes[0].y, 'all value bars use the same height');
    nearlyEqual(size.z, outputSizes[0].z, 'all value bars use the same thickness');
  }
});

test('Merkle edges follow the moving node centers through the transition and its rewind', t => {
  const { bitcoin, renderer } = fixture(t);
  for (const progress of [.588, .625, .588]) {
    bitcoin.render(progress);
    const { scene } = renderer.frames.at(-1);
    const hashes = named(scene, 'merkle-hashes-eight-four-two-one');
    assert.equal(hashes.count, 15, 'the tree has eight leaves, four parents, two parents, and one root');
    const centers = Array.from({ length: 15 }, (_, i) => instanceCenter(hashes, i));
    const tree = [];
    for (let i = 0; i < 8; i++) tree.push([centers[i], centers[8 + Math.floor(i / 2)]]);
    for (let i = 0; i < 4; i++) tree.push([centers[8 + i], centers[12 + Math.floor(i / 2)]]);
    tree.push([centers[12], centers[14]], [centers[13], centers[14]]);
    assertConnections(segments(named(scene, 'peer-history-and-value-links')), tree, `Merkle tree at ${progress}`);
    const payment = named(scene, 'payment').getWorldPosition(new THREE.Vector3());
    assertConnections(segments(named(scene, 'payment-merkle-path')), [
      [payment, centers[0]], [centers[0], centers[8]], [centers[8], centers[12]], [centers[12], centers[14]],
    ], `payment inclusion path at ${progress}`);
  }
});

test('a valid hash stays fixed while its accepted block moves into consensus', t => {
  const { bitcoin, renderer } = fixture(t);
  for (const reducedMotion of [false, true]) {
    bitcoin.render(.41, { reducedMotion });
    const { scene } = renderer.frames.at(-1);
    const hash = named(scene, 'hash-64-hex-digits');
    const searching = [...hash.instanceMatrix.array];
    bitcoin.render(.42, { reducedMotion });
    assert.notDeepEqual([...hash.instanceMatrix.array], searching, 'search attempts change the candidate hash');
    bitcoin.render(.47, { reducedMotion });
    const accepted = [...hash.instanceMatrix.array];
    const indicator = named(scene, 'accepted-hash-indicator');
    const acceptedIndicator = [...indicator.matrix.elements];
    assert.ok(indicator.scale.x >= .99, 'the accepted result remains visibly marked');
    for (const progress of [.48, .50, .525, .55]) {
      bitcoin.render(progress, { reducedMotion });
      assert.deepEqual([...hash.instanceMatrix.array], accepted, `accepted hash remains fixed at ${progress}`);
      assert.deepEqual([...indicator.matrix.elements], acceptedIndicator, `accepted indicator remains fixed at ${progress}`);
    }
  }
});

test('consensus shows a distinct coinbase reward and anchors its explanation to that reward', t => {
  const { bitcoin, renderer, container } = fixture(t);
  bitcoin.render(.4);
  const { scene, camera } = renderer.frames.at(-1);
  const reward = named(scene, 'coinbase-subsidy-plus-fees');
  const beforeWidth = projectedBounds(body(reward), camera).right - projectedBounds(body(reward), camera).left;
  const result = bitcoin.render(.525);
  assert.notEqual(reward, named(scene, 'payment'));
  assert.notEqual(reward, named(scene, 'candidate-block'));
  assert.equal(reward.visible, true);
  assert.ok(body(reward).material.opacity > 0);
  const bounds = projectedBounds(body(reward), camera);
  assertInView(bounds, 'coinbase reward');
  assert.ok((bounds.right - bounds.left) > beforeWidth * 10, 'the reward becomes a substantial visible object during consensus');
  assert.ok((bounds.right - bounds.left) * container.clientWidth / 2 > 35, 'reward body has readable on-screen width');
  assert.ok((bounds.top - bounds.bottom) * container.clientHeight / 2 > 20, 'reward body has readable on-screen height');
  const point = reward.getWorldPosition(new THREE.Vector3()).project(camera);
  const anchor = result.anchors.find(item => item.id === 'secondary');
  assert.ok(anchor?.visible, 'the reward annotation anchor is visible');
  nearlyEqual(anchor.x, (point.x + 1) / 2, 'reward anchor x');
  nearlyEqual(anchor.y, (1 - point.y) / 2, 'reward anchor y');
});

test('the full Merkle proof and its payment leaf fit portrait tablets, mobile, and desktop', t => {
  const { bitcoin, renderer, container } = fixture(t);
  for (const [width, height] of [[768, 1024], [820, 1180], [390, 844], [1440, 900]]) {
    container.clientWidth = width;
    container.clientHeight = height;
    const result = bitcoin.render(.625);
    const { scene, camera } = renderer.frames.at(-1);
    const hashes = named(scene, 'merkle-hashes-eight-four-two-one');
    const transactions = named(scene, 'transactions-63-plus-one-payment');
    for (let i = 0; i < hashes.count; i++) assertInView(projectedBounds(hashes, camera, i), `${width}x${height} Merkle hash ${i}`);
    for (let i = 0; i < transactions.count; i++) assertInView(projectedBounds(transactions, camera, i), `${width}x${height} transaction leaf ${i}`);
    assertInView(projectedBounds(body(named(scene, 'payment')), camera), `${width}x${height} original payment leaf`);
    for (const anchor of result.anchors) assert.ok(anchor.visible && anchor.x >= 0 && anchor.x <= 1 && anchor.y >= 0 && anchor.y <= 1, `${width}x${height} proof annotation remains visible`);
  }
});
