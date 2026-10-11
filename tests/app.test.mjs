import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { journeyProgress } from '../src/playback.js';

const source = (await readFile(new URL('../src/scroll-driver.js', import.meta.url), 'utf8'))
  .replace(/^import[^\n]+\n/gm, '')
  .replace('export function mountScrollDriver', 'function mountScrollDriver');
const animeSource = await readFile(new URL('../vendor/anime.umd.min.js', import.meta.url), 'utf8');

function eventTarget(properties = {}) {
  const listeners = new Map();
  return {
    ...properties,
    listeners,
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(callback);
    },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
    dispatch(type) { for (const callback of [...listeners.get(type) ?? []]) callback(); },
    listenerCount() { return [...listeners.values()].reduce((sum, set) => sum + set.size, 0); },
  };
}

function mount({ reduced = false, library = true, render, onFrame, onError } = {}) {
  const bounds = { top: 0, height: 16000 };
  const frames = new Map();
  const renders = [];
  const updates = [];
  const errors = [];
  const cancellations = [];
  let nextFrameId = 0;
  let timelineCancellations = 0;
  const preference = eventTarget({ matches: reduced });
  const document = eventTarget({ hidden: false });
  const world = eventTarget({ clientWidth: 1300, clientHeight: 1000 });
  const window = eventTarget({
    innerHeight: 1000,
    matchMedia: () => preference,
    requestAnimationFrame(callback) {
      const id = nextFrameId++;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) { cancellations.push(id); frames.delete(id); },
  });
  const scene = {
    render(progress, options) {
      renders.push({ progress, ...options });
      return render?.(progress, options);
    },
    destroy() { throw new Error('The application owns scene disposal'); },
  };
  const context = vm.createContext({
    journeyProgress, window, document,
    requestAnimationFrame: window.requestAnimationFrame,
    cancelAnimationFrame: window.cancelAnimationFrame,
    setImmediate, clearImmediate, setTimeout, clearTimeout, performance,
  });
  // Exercise Anime's browser path, and create its model in the same realm.
  vm.runInContext('class NodeList {} class HTMLCollection {} class SVGElement {}', context);
  vm.runInContext(animeSource, context);
  const libraryDocumentListeners = document.listenerCount();
  const anime = library ? {
    createTimeline(options) {
      const timeline = context.anime.createTimeline(options);
      const cancel = timeline.cancel.bind(timeline);
      timeline.cancel = () => { timelineCancellations++; return cancel(); };
      return timeline;
    },
  } : undefined;
  context.options = {
    journey: { getBoundingClientRect: () => bounds }, world, scene, window, document, anime,
    onFrame(value) { updates.push(value); onFrame?.(value); },
    onError(error) { errors.push(error); onError?.(error); },
  };
  vm.runInContext(source, context);
  const createDriver = () => vm.runInContext('mountScrollDriver(options)', context);
  const driver = library ? createDriver() : undefined;

  function flush() {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback();
  }
  function setProgress(progress) { bounds.top = -progress * (bounds.height - window.innerHeight); }
  function seek(progress) { setProgress(progress); window.dispatch('scroll'); flush(); }
  return {
    driver, createDriver, bounds, window, document, world, preference, frames,
    renders, updates, errors, cancellations, flush, seek, setProgress, libraryDocumentListeners,
    get timelineCancellations() { return timelineCancellations; },
  };
}

function closeTo(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} should equal ${expected}`);
}

test('the real paused Anime.js timeline follows document geometry in both directions', () => {
  const anchors = { wallet: { x: 12, y: 24 } };
  const app = mount({ render: () => anchors });
  assert.equal(app.frames.size, 1, 'initialization requests one frame, including a frame ID of zero');
  assert.equal(app.renders.length, 0);
  app.flush();
  for (const progress of [.1, .371, 1, .75, .25, 0, -.2, 1.2, 0]) {
    app.seek(progress);
    const expected = Math.max(0, Math.min(1, progress));
    closeTo(app.renders.at(-1).progress, expected);
    closeTo(app.updates.at(-1).progress, expected);
    closeTo(app.updates.at(-1).visualProgress, expected);
    assert.equal(app.updates.at(-1).sceneResult, anchors);
    assert.equal(app.frames.size, 0, 'the driver has no idle animation loop');
  }
  assert.equal(app.errors.length, 0);
  app.driver.destroy();
});

test('scroll bursts render the latest geometry once, while unchanged scroll does not redraw', () => {
  const app = mount();
  app.flush();
  const count = app.renders.length;
  for (const progress of [.2, .4, .7]) {
    app.setProgress(progress);
    app.window.dispatch('scroll');
  }
  assert.equal(app.frames.size, 1);
  app.flush();
  assert.equal(app.renders.length, count + 1);
  closeTo(app.renders.at(-1).progress, .7);
  app.window.dispatch('scroll');
  app.flush();
  assert.equal(app.renders.length, count + 1);
  app.driver.refresh();
  app.driver.refresh();
  assert.equal(app.frames.size, 1);
  app.flush();
  assert.equal(app.renders.length, count + 2);
  app.driver.destroy();
});

test('resize and motion preference changes reframe unchanged progress', () => {
  const app = mount();
  app.flush();
  app.seek(.37);
  let count = app.renders.length;
  app.world.clientWidth = 390;
  app.world.clientHeight = 844;
  app.window.dispatch('resize');
  app.flush();
  assert.equal(app.renders.length, ++count);
  closeTo(app.renders.at(-1).progress, .37);
  assert.equal(app.renders.at(-1).aspect, 390 / 844);
  app.preference.matches = true;
  app.preference.dispatch('change');
  app.flush();
  assert.equal(app.renders.length, ++count);
  closeTo(app.renders.at(-1).progress, Math.floor(.37 * 48) / 48);
  assert.equal(app.renders.at(-1).reducedMotion, true);
  closeTo(app.updates.at(-1).progress, .37);
  app.preference.matches = false;
  app.preference.dispatch('change');
  app.flush();
  closeTo(app.renders.at(-1).progress, .37);
  assert.equal(app.renders.at(-1).reducedMotion, false);
  assert.equal(app.frames.size, 0);
  app.driver.destroy();
});

test('reduced motion preserves exact endpoints and reversible discrete visual states', () => {
  const app = mount({ reduced: true });
  app.flush();
  for (const progress of [.37, .8, .37, 0, 1, .01, 0]) {
    app.seek(progress);
    const expected = progress === 1 ? 1 : Math.floor(progress * 48) / 48;
    closeTo(app.renders.at(-1).progress, expected);
    closeTo(app.updates.at(-1).visualProgress, expected);
    closeTo(app.updates.at(-1).progress, progress);
  }
  app.driver.destroy();
});

test('page restoration and scene restoration refresh, and hidden pages wait for visibility', () => {
  const app = mount();
  app.flush();
  let count = app.renders.length;
  app.window.dispatch('pageshow');
  app.flush();
  assert.equal(app.renders.length, ++count);
  app.document.hidden = true;
  app.document.dispatch('visibilitychange');
  assert.equal(app.frames.size, 0);
  app.setProgress(.6);
  app.document.hidden = false;
  app.document.dispatch('visibilitychange');
  app.flush();
  assert.equal(app.renders.length, ++count);
  closeTo(app.renders.at(-1).progress, .6);
  app.world.dispatch('scene-restored');
  app.flush();
  assert.equal(app.renders.length, ++count);
  app.driver.destroy();
});

test('a render failure reports once, leaves fallback control to the app, and refresh can recover', () => {
  let failing = true;
  const fallback = { visible: true };
  const app = mount({
    render() { if (failing) throw new Error('Renderer unavailable'); },
    onFrame() { fallback.visible = false; },
    onError() { fallback.visible = true; },
  });
  app.flush();
  assert.equal(app.errors.length, 1);
  assert.equal(app.errors[0].message, 'Renderer unavailable');
  assert.equal(app.updates.length, 0);
  assert.equal(fallback.visible, true);
  for (let i = 0; i < 10; i++) app.window.dispatch('scroll');
  assert.equal(app.frames.size, 0, 'a failing renderer is not retried by scroll events');
  failing = false;
  app.setProgress(.5);
  app.driver.refresh();
  app.flush();
  closeTo(app.renders.at(-1).progress, .5);
  assert.equal(fallback.visible, false);
  assert.equal(app.errors.length, 1);
  app.driver.destroy();
});

test('an unavailable library throws before scheduling or registering listeners', () => {
  const app = mount({ library: false });
  assert.throws(app.createDriver, /Animation library unavailable/);
  assert.equal(app.renders.length, 0);
  assert.equal(app.frames.size, 0);
  assert.equal(app.window.listenerCount(), 0);
  assert.equal(app.document.listenerCount(), app.libraryDocumentListeners);
  assert.equal(app.preference.listenerCount(), 0);
});

test('destroy cancels a pending frame and all listeners without disposing the scene', () => {
  const app = mount();
  assert.equal(app.frames.size, 1);
  app.driver.destroy();
  app.driver.destroy();
  assert.equal(app.frames.size, 0);
  assert.deepEqual(app.cancellations, [0]);
  assert.equal(app.timelineCancellations, 1);
  for (const target of [app.window, app.world, app.preference]) {
    assert.equal(target.listenerCount(), 0);
  }
  assert.equal(app.document.listenerCount(), app.libraryDocumentListeners);
  app.driver.refresh();
  app.window.dispatch('scroll');
  app.window.dispatch('resize');
  app.preference.dispatch('change');
  app.flush();
  assert.equal(app.renders.length, 0);
  assert.equal(app.errors.length, 0);
});
