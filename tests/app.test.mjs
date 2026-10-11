import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { clampProgress, journeyProgress } from '../src/playback.js';

const source = (await readFile(new URL('../src/app.js', import.meta.url), 'utf8')).replace(/^import[^\n]+\n/gm, '');
const animeSource = await readFile(new URL('../vendor/anime.umd.min.js', import.meta.url), 'utf8');
const sceneSource = (await readFile(new URL('../src/continuous-scene.js', import.meta.url), 'utf8')).replace('export function createContinuousScene', 'function createContinuousScene');

function mount({ reduced = false, library = true, integrated = false } = {}) {
  const bounds = { top: 0, height: 16000 };
  const listeners = {};
  const documentListeners = {};
  const frames = [];
  const renders = [];
  const errors = [];
  function makeNode(name = 'div') { return {
    name, childNodes: [], parentNode: null, style: {}, dataset: {}, attributes: {}, textContent: '', clientWidth: 1300, clientHeight: 1000,
    setAttribute(key, value) { this.attributes[key] = String(value); },
    appendChild(child) { child.remove(); this.childNodes.push(child); child.parentNode = this; return child; },
    remove() { if (this.parentNode) this.parentNode.childNodes.splice(this.parentNode.childNodes.indexOf(this), 1); this.parentNode = null; },
    replaceChildren(...children) { [...this.childNodes].forEach(child => child.remove()); children.forEach(child => this.appendChild(child)); },
    getBoundingClientRect() { return bounds; },
  }; }
  const nodes = Object.fromEntries(['journey', 'world', 'scroll-cue', 'reading-progress', 'accessible-state', 'fallback'].map(id => [id, makeNode()]));
  nodes.world.appendChild(nodes.fallback);
  const preference = { matches: reduced, addEventListener(type, callback) { this.change = callback; } };
  const document = {
    hidden: false,
    getElementById: id => id === 'fallback' && !nodes.fallback.parentNode ? null : nodes[id],
    createElementNS: (namespace, name) => makeNode(name),
    addEventListener(type, callback) { documentListeners[type] = callback; },
  };
  const window = {
    innerHeight: 1000,
    matchMedia: () => preference,
    addEventListener(type, callback) { listeners[type] = callback; },
  };
  const context = vm.createContext({
    document, clampProgress, journeyProgress,
    setImmediate, clearImmediate, setTimeout, clearTimeout, performance,
    requestAnimationFrame(callback) { frames.push(callback); return frames.length; },
    console: { error(error) { errors.push(error.message); } },
  });
  // The library and its animated objects must share a realm, as in the browser.
  try { vm.runInContext(animeSource, context); }
  catch (error) { throw new Error(`Animation test environment: ${error.message}`); }
  if (library) window.anime = context.anime;
  context.window = window;
  if (integrated) vm.runInContext(sceneSource, context);
  else context.createContinuousScene = () => ({ render(progress, options) { renders.push({ progress, ...options }); } });
  vm.runInContext(source, context);
  function flush() { const pending = frames.splice(0); pending.forEach(callback => callback()); }
  function seek(progress) { bounds.top = -progress * (bounds.height - window.innerHeight); listeners.scroll(); flush(); }
  flush();
  return { nodes, bounds, window, preference, listeners, documentListeners, document, frames, renders, errors, flush, seek };
}

test('the actual Anime.js timeline follows scroll forward, backward, and to both endpoints', () => {
  const app = mount();
  for (const progress of [.1, .5, 1, .75, .25, 0]) {
    app.seek(progress);
    assert.ok(Math.abs(app.renders.at(-1).progress - progress) < 1e-10);
    assert.equal(app.nodes.world.dataset.progress, progress.toFixed(5));
  }
  assert.equal(app.nodes.fallback.attributes.hidden, '');
  assert.equal(app.frames.length, 0, 'no animation frame runs while scrolling is idle');
  assert.deepEqual(app.errors, []);
});

test('scroll events share a single frame, and resize reframes at unchanged progress', () => {
  const app = mount();
  app.seek(.5);
  for (let i = 0; i < 10; i++) app.listeners.scroll();
  assert.equal(app.frames.length, 1);
  app.flush();
  const count = app.renders.length;
  app.nodes.world.clientWidth = 390;
  app.nodes.world.clientHeight = 844;
  app.listeners.resize();
  app.flush();
  assert.equal(app.renders.length, count + 1);
  assert.equal(app.renders.at(-1).progress, .5);
  assert.equal(app.renders.at(-1).aspect, 390 / 844);
});

test('reduced motion has discrete reversible states and reacts immediately to preference changes', () => {
  const app = mount({ reduced: true });
  app.seek(.37);
  assert.equal(app.renders.at(-1).progress, Math.floor(.37 * 48) / 48);
  assert.equal(app.renders.at(-1).reducedMotion, true);
  app.preference.matches = false;
  app.preference.change();
  app.flush();
  assert.equal(app.renders.at(-1).progress, .37);
  app.seek(0);
  assert.equal(app.renders.at(-1).progress, 0);
});

test('returning from a hidden page refreshes the frame, and a missing library preserves the static visual', () => {
  const app = mount();
  const count = app.renders.length;
  app.documentListeners.visibilitychange();
  app.flush();
  assert.equal(app.renders.length, count + 1);
  const failed = mount({ library: false });
  assert.equal(failed.nodes.fallback.attributes.hidden, undefined);
  assert.equal(failed.renders.length, 0);
  assert.deepEqual(failed.errors, ['Animation library unavailable']);
});

test('the real scene mounts beside the fallback and receives the scroll timeline', () => {
  const app = mount({ integrated: true });
  assert.deepEqual(app.errors, []);
  assert.equal(app.nodes.fallback.parentNode, app.nodes.world);
  assert.equal(app.nodes.fallback.attributes.hidden, '');
  assert.equal(typeof app.listeners.scroll, 'function');
  const svg = app.nodes.world.childNodes.find(node => node.name === 'svg');
  assert.ok(svg, 'the real persistent SVG mounts');
  for (const progress of [0, .25, 1, .5, 0]) {
    app.seek(progress);
    assert.equal(Number(svg.attributes['data-progress']), progress);
    assert.equal(app.nodes.world.childNodes.find(node => node.name === 'svg'), svg);
  }
});
