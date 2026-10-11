import test from 'node:test';
import assert from 'node:assert/strict';
import { clampProgress, stepAt, scrollProgress } from '../src/playback.js';

test('progress clamps malformed and overscrolled positions', () => {
  for (const input of [NaN, Infinity, undefined, 'bad', -1]) assert.equal(clampProgress(input), 0);
  assert.equal(clampProgress(2), 1);
  assert.equal(clampProgress('0.5'), 0.5);
});

test('four narrative phases include both endpoints and rewind', () => {
  assert.deepEqual([0, 0.249, 0.25, 0.5, 0.75, 1].map(p => stepAt(p)), [0, 0, 1, 2, 3, 3]);
  assert.deepEqual([1, 0.75, 0.5, 0.25, 0].map(p => stepAt(p)), [3, 3, 2, 1, 0]);
});

test('scroll position follows story bounds in both directions', () => {
  const positions = [560, -80, -720, -1360, -2000];
  assert.deepEqual(positions.map(top => scrollProgress(top, top + 2560, 1000)), [0, .25, .5, .75, 1]);
  assert.deepEqual(positions.toReversed().map(top => scrollProgress(top, top + 2560, 1000)), [1, .75, .5, .25, 0]);
  assert.equal(scrollProgress(2000, 4560, 1000), 0);
  assert.equal(scrollProgress(-5000, -2440, 1000), 1);
});

test('narrow viewport moves the reading anchor below the sticky visual', () => {
  assert.equal(scrollProgress(656, 3536, 800, true), 0);
  assert.equal(scrollProgress(-784, 2096, 800, true), .5);
  assert.equal(scrollProgress(-2224, 656, 800, true), 1);
  assert.equal(scrollProgress(0, 0, 800, true), 1);
});
