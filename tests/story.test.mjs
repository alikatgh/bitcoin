import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleStory, story } from '../src/story.js';

test('story endpoints and invalid inputs select finite, bounded states', () => {
  const start = sampleStory(0);
  const end = sampleStory(1);
  assert.equal(start.index, 0);
  assert.equal(start.local, 0);
  assert.equal(end.index, story.length - 1);
  assert.ok(Math.abs(end.local - 1) < 1e-10);
  for (const input of [undefined, NaN, Infinity, -Infinity, Symbol('invalid'), { valueOf() { throw new Error('Invalid number'); } }]) {
    const state = sampleStory(input);
    assert.equal(state.progress, 0);
    assert.equal(state.index, 0);
    for (const field of ['local', 'light', 'opacity', 'offset']) assert.ok(Number.isFinite(state[field]), field);
  }
  assert.equal(sampleStory(-5).progress, 0);
  assert.equal(sampleStory(5).progress, 1);
});

test('every sampled story state stays within the documented journey', () => {
  for (let step = 0; step <= 1000; step++) {
    const state = sampleStory(step / 1000);
    assert.ok(Number.isInteger(state.index) && state.index >= 0 && state.index < story.length);
    assert.ok(state.local >= -1e-10 && state.local <= 1 + 1e-10);
    assert.ok(state.light >= 0 && state.light <= 1);
    assert.ok(state.opacity >= 0 && state.opacity <= 1);
    assert.ok(Number.isFinite(state.offset));
  }
});

test('light reveals the block, Merkle proof, and privacy beats with continuous transitions', () => {
  for (const progress of [.3, .6, .8]) assert.equal(sampleStory(progress).light, 1);
  for (const progress of [0, .1, .45, .75, 1]) assert.equal(sampleStory(progress).light, 0);
  let previous = sampleStory(0).light;
  for (let step = 1; step <= 10000; step++) {
    const current = sampleStory(step / 10000).light;
    assert.ok(Math.abs(current - previous) < .01, `light changes smoothly at ${step / 10000}`);
    previous = current;
  }
});
