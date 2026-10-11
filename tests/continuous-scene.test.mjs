import test from 'node:test';
import assert from 'node:assert/strict';
import { createContinuousScene } from '../src/continuous-scene.js';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';

// A deliberately small DOM harness: these tests inspect the actual scene tree
// and attributes, but do not pretend to establish browser rendering quality.
class FakeNode {
  constructor(ownerDocument) {
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.childNodes = [];
  }

  appendChild(child) {
    child.remove();
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  replaceChildren(...children) {
    for (const child of [...this.childNodes]) child.remove();
    for (const child of children) {
      this.appendChild(typeof child === 'string' ? this.ownerDocument.createTextNode(child) : child);
    }
  }

  remove() {
    if (!this.parentNode) return;
    const siblings = this.parentNode.childNodes;
    siblings.splice(siblings.indexOf(this), 1);
    this.parentNode = null;
  }

  get children() {
    return this.childNodes.filter((node) => node.nodeType === 1);
  }

  get textContent() {
    return this.childNodes.map((node) => node.textContent).join('');
  }

  set textContent(value) {
    const text = String(value);
    this.replaceChildren(...(text ? [this.ownerDocument.createTextNode(text)] : []));
  }
}

class FakeText extends FakeNode {
  constructor(ownerDocument, text) {
    super(ownerDocument);
    this.nodeType = 3;
    this.data = text;
  }

  get textContent() { return this.data; }
  set textContent(value) { this.data = String(value); }
}

class FakeElement extends FakeNode {
  constructor(ownerDocument, namespaceURI, name) {
    super(ownerDocument);
    this.nodeType = 1;
    this.namespaceURI = namespaceURI;
    this.localName = name;
    this.tagName = name;
    this.attributeMap = new Map();
  }

  setAttribute(name, value) { this.attributeMap.set(name, String(value)); }
  getAttribute(name) { return this.attributeMap.get(name) ?? null; }
  getAttributeNames() { return [...this.attributeMap.keys()]; }
  hasAttribute(name) { return this.attributeMap.has(name); }
  removeAttribute(name) { this.attributeMap.delete(name); }
}

class FakeDocument {
  createElementNS(namespaceURI, name) { return new FakeElement(this, namespaceURI, name); }
  createElement(name) { return this.createElementNS(HTML_NAMESPACE, name); }
  createTextNode(text) { return new FakeText(this, String(text)); }
}

function withDocument(run) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const document = new FakeDocument();
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: document });
  try {
    return run(document);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else delete globalThis.document;
  }
}

function walk(root) {
  return [root, ...root.childNodes.flatMap(walk)];
}

function elements(root) {
  return walk(root).filter((node) => node.nodeType === 1);
}

function snapshot(root) {
  if (root.nodeType === 3) return { text: root.data };
  return {
    name: root.localName,
    namespace: root.namespaceURI,
    attributes: [...root.attributeMap.entries()].sort(([a], [b]) => a.localeCompare(b)),
    children: root.childNodes.map(snapshot),
  };
}

function getOnlySvg(container) {
  const svgs = elements(container).filter((node) => node.localName.toLowerCase() === 'svg');
  assert.equal(svgs.length, 1, 'the scene has one persistent SVG');
  return svgs[0];
}

function assertFiniteGeometry(svg) {
  const numericAttributes = new Set([
    'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height',
    'transform', 'd', 'points', 'viewBox', 'opacity', 'fill-opacity', 'stroke-opacity',
    'stroke-width', 'stroke-dasharray', 'stroke-dashoffset', 'offset', 'stdDeviation',
  ]);
  const numericToken = /[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;
  for (const element of elements(svg)) {
    for (const [name, value] of element.attributeMap) {
      assert.doesNotMatch(value, /NaN|Infinity|undefined|\bnull\b|\[object Object\]/, `${element.localName}.${name}`);
      if (!numericAttributes.has(name)) continue;
      for (const token of value.match(numericToken) ?? []) {
        assert.ok(Number.isFinite(Number(token)), `${element.localName}.${name} contains a nonfinite number`);
      }
      if (['r', 'rx', 'ry', 'width', 'height'].includes(name) && /^[-+\d.eE]+$/.test(value)) {
        assert.ok(Number(value) >= 0, `${element.localName}.${name} must not be negative`);
      }
    }
  }
}

test('scene is wordless SVG with no foreignObject or HTML controls', () => withDocument((document) => {
  const container = document.createElement('div');
  const scene = createContinuousScene(container);
  const svg = getOnlySvg(container);
  const forbidden = new Set(['text', 'foreignobject', 'button', 'input', 'select', 'textarea', 'option', 'output']);
  for (const node of walk(svg)) {
    if (node.nodeType === 1) {
      assert.equal(node.namespaceURI, SVG_NAMESPACE);
      assert.ok(!forbidden.has(node.localName.toLowerCase()), `${node.localName} introduces visible words or controls`);
    } else if (node.textContent.trim()) {
      assert.ok(['title', 'desc'].includes(node.parentNode.localName.toLowerCase()), 'text is limited to nonvisual accessibility metadata');
    }
  }
  scene.destroy();
}));

test('roughly 200 seek frames preserve every node identity and the single SVG', () => withDocument((document) => {
  const container = document.createElement('div');
  const scene = createContinuousScene(container);
  scene.render(0);
  const svg = getOnlySvg(container);
  const originalNodes = walk(svg);
  const visualTags = new Set(['path', 'circle', 'ellipse', 'line', 'polygon', 'polyline', 'rect']);
  assert.ok(elements(svg).some((element) => visualTags.has(element.localName)), 'scene contains visual geometry');
  for (let frame = 0; frame < 200; frame += 1) {
    const progress = ((frame * 73) % 200) / 199;
    scene.render(progress, { reducedMotion: frame % 2 === 0 });
    assert.equal(getOnlySvg(container), svg);
    const currentNodes = walk(svg);
    assert.equal(currentNodes.length, originalNodes.length, `node count at frame ${frame}`);
    currentNodes.forEach((node, index) => assert.equal(node, originalNodes[index], `node ${index} at frame ${frame}`));
  }
  scene.destroy();
}));

test('seeking backwards restores the exact attribute tree for each target', () => withDocument((document) => {
  const container = document.createElement('div');
  const scene = createContinuousScene(container);
  const svg = getOnlySvg(container);
  for (const target of [0, 0.137, 0.5, 0.863, 1]) {
    scene.render(target);
    const expected = snapshot(svg);
    for (const other of [1, 0.01, 0.71, 0.29, 0.99, 0]) scene.render(other);
    scene.render(target);
    assert.deepEqual(snapshot(svg), expected, `all attributes restored at progress ${target}`);
  }
  scene.destroy();
}));

test('endpoint, out-of-range, and malformed progress always produce finite geometry', () => withDocument((document) => {
  const container = document.createElement('div');
  const scene = createContinuousScene(container);
  const svg = getOnlySvg(container);
  const malformed = { valueOf() { throw new Error('cannot convert'); } };
  const inputs = [0, 1, -1, 2, Number.MAX_VALUE, -Number.MAX_VALUE, NaN, Infinity, -Infinity,
    undefined, null, '0.5', 'invalid', {}, [], Symbol('progress'), 1n, malformed];
  for (const progress of inputs) {
    assert.doesNotThrow(() => scene.render(progress));
    assertFiniteGeometry(svg);
  }
  scene.render(-100);
  const lower = snapshot(svg);
  scene.render(0);
  assert.deepEqual(snapshot(svg), lower, 'negative progress clamps to the first frame');
  scene.render(100);
  const upper = snapshot(svg);
  scene.render(1);
  assert.deepEqual(snapshot(svg), upper, 'excess progress clamps to the last frame');
  scene.destroy();
}));

test('reduced-motion states are deterministic and can switch back to normal motion', () => withDocument((document) => {
  const container = document.createElement('div');
  const scene = createContinuousScene(container);
  const svg = getOnlySvg(container);
  for (const aspect of [1.25, 0.55]) {
    scene.render(0.432, { reducedMotion: true, aspect });
    const reduced = snapshot(svg);
    scene.render(0.97, { reducedMotion: false, aspect });
    scene.render(0.01, { reducedMotion: true, aspect });
    scene.render(0.432, { reducedMotion: true, aspect });
    assert.deepEqual(snapshot(svg), reduced);
    assertFiniteGeometry(svg);

    scene.render(0.432, { reducedMotion: false, aspect });
    const normal = snapshot(svg);
    scene.render(0.432, { reducedMotion: true, aspect });
    scene.render(0.432, { reducedMotion: false, aspect });
    assert.deepEqual(snapshot(svg), normal, 'normal state is restored after reduced motion');
  }
  scene.destroy();
}));

test('independent scene instances have unique IDs and resolve their own local references', () => withDocument((document) => {
  const firstContainer = document.createElement('div');
  const secondContainer = document.createElement('div');
  const first = createContinuousScene(firstContainer);
  const second = createContinuousScene(secondContainer);
  const svgs = [getOnlySvg(firstContainer), getOnlySvg(secondContainer)];
  const allIds = new Set();
  for (const svg of svgs) {
    const ids = elements(svg).map((element) => element.getAttribute('id')).filter(Boolean);
    assert.equal(new Set(ids).size, ids.length, 'IDs are unique within a scene');
    for (const id of ids) {
      assert.ok(!allIds.has(id), `ID ${id} collides across scenes`);
      allIds.add(id);
    }
    const localIds = new Set(ids);
    for (const element of elements(svg)) {
      for (const [name, value] of element.attributeMap) {
        for (const match of value.matchAll(/url\(["']?#([^\s)"']+)["']?\)/g)) {
          assert.ok(localIds.has(match[1]), `${name} references a missing local definition`);
        }
        if (['href', 'xlink:href'].includes(name) && value.startsWith('#')) {
          assert.ok(localIds.has(value.slice(1)), `${name} references a missing local definition`);
        }
      }
    }
  }
  first.destroy();
  second.destroy();
}));

test('mounting preserves an existing SVG fallback and its contents', () => withDocument((document) => {
  const container = document.createElement('div');
  const fallback = document.createElementNS(SVG_NAMESPACE, 'svg');
  const fallbackShape = document.createElementNS(SVG_NAMESPACE, 'path');
  fallbackShape.setAttribute('d', 'M0 0 L10 10');
  fallbackShape.setAttribute('data-fallback-sentinel', 'retained');
  fallback.appendChild(fallbackShape);
  container.appendChild(fallback);
  const before = snapshot(fallback);

  const scene = createContinuousScene(container);
  assert.equal(fallback.parentNode, container, 'mounting retains the existing fallback SVG');
  assert.equal(fallbackShape.parentNode, fallback, 'mounting retains its descendants');
  const mounted = container.children.filter((node) => node.localName === 'svg' && node !== fallback);
  assert.equal(mounted.length, 1, 'exactly one scene SVG is added beside the fallback');
  scene.render(0.7);
  assert.deepEqual(snapshot(fallback), before, 'rendering does not modify the fallback');
  scene.destroy();
  assert.deepEqual(container.childNodes, [fallback], 'cleanup leaves the fallback accessible in place');
}));

test('destroy removes its scene while preserving siblings and another instance', () => withDocument((document) => {
  const firstContainer = document.createElement('div');
  const secondContainer = document.createElement('div');
  const first = createContinuousScene(firstContainer);
  const second = createContinuousScene(secondContainer);
  const firstSvg = getOnlySvg(firstContainer);
  const secondSvg = getOnlySvg(secondContainer);
  const sibling = document.createElement('aside');
  firstContainer.appendChild(sibling);
  const secondBefore = snapshot(secondSvg);
  first.destroy();
  assert.equal(firstSvg.parentNode, null);
  assert.equal(sibling.parentNode, firstContainer);
  assert.equal(secondSvg.parentNode, secondContainer);
  assert.deepEqual(snapshot(secondSvg), secondBefore);
  assert.doesNotThrow(() => first.destroy(), 'cleanup can be repeated');
  second.destroy();
}));
