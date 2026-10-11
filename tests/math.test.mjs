import test from 'node:test';
import assert from 'node:assert/strict';
import { attackerSuccess, formatProbability, probabilitySeries } from '../src/math.js';

function closeTo(actual, expected, tolerance = 5e-8) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
}

test('matches the whitepaper tables to their printed precision', () => {
  const references = [
    [0.1, 1, 0.2045873],
    [0.1, 2, 0.0509779],
    [0.1, 5, 0.0009137],
    [0.1, 6, 0.0002428],
    [0.1, 10, 0.0000012],
    [0.3, 5, 0.1773523],
    [0.3, 10, 0.0416605],
    [0.3, 20, 0.0024804],
    [0.3, 50, 0.0000006],
  ];
  for (const [q, z, expected] of references) closeTo(attackerSuccess(q, z), expected);
});

test('retains accurate small probabilities instead of subtracting nearly equal values', () => {
  closeTo(attackerSuccess(0.1, 6), 0.000242802745362886165, 2e-18);
  closeTo(attackerSuccess(0.3, 5), 0.177352311360945, 1e-14);
  // Independent positive Poisson-tail calculation evaluated at high precision.
  const tiny = attackerSuccess(0.1, 100);
  assert.ok(tiny > 0 && tiny < 1e-50);
  closeTo(tiny / 8.03881714897257604e-58, 1, 1e-12);
  assert.ok(attackerSuccess(0.1, 550) > 0, 'retain representable values near floating-point underflow');
});

test('higher depth decreases risk below a majority, and higher q increases it', () => {
  for (const q of [0.01, 0.1, 0.3, 0.45, 0.49]) {
    const values = probabilitySeries(q, 60);
    for (let z = 1; z < values.length; z += 1) {
      assert.ok(values[z].probability <= values[z - 1].probability, `q=${q}, z=${z}`);
    }
  }
  for (const z of [1, 6, 50, 1000]) {
    const shares = [0, 0.01, 0.1, 0.3, 0.45, 0.49, 0.5, 1];
    for (let i = 1; i < shares.length; i += 1) {
      assert.ok(attackerSuccess(shares[i], z) >= attackerSuccess(shares[i - 1], z));
    }
  }
});

test('handles zero depth, no attacker, majority shares, and the largest depth', () => {
  for (const q of [0, 0.1, 0.5, 1]) assert.equal(attackerSuccess(q, 0), 1);
  assert.equal(attackerSuccess(0, 6), 0);
  assert.equal(attackerSuccess(0, 1000), 0);
  for (const q of [0.5, 0.6, 1]) assert.equal(attackerSuccess(q, 1000), 1);
  const probability = attackerSuccess(0.49, 1000);
  assert.ok(Number.isFinite(probability) && probability > 0 && probability < 1);
  closeTo(probability, 0.331452328148687944, 1e-12);
  assert.ok(attackerSuccess(0.5 - Number.EPSILON, 1000) <= 1);
});

test('rejects invalid shares and depths rather than coercing them', () => {
  for (const q of [NaN, Infinity, -Infinity, '0.1', null, undefined]) {
    assert.throws(() => attackerSuccess(q, 6), TypeError);
  }
  for (const q of [-0.01, 1.01]) assert.throws(() => attackerSuccess(q, 6), RangeError);
  for (const z of [NaN, Infinity, '6', null, undefined]) {
    assert.throws(() => attackerSuccess(0.1, z), TypeError);
  }
  for (const z of [-1, 1.5, 1001]) assert.throws(() => attackerSuccess(0.1, z), RangeError);
});

test('series includes depth zero through the requested maximum', () => {
  const series = probabilitySeries(0.1, 6);
  assert.equal(series.length, 7);
  assert.deepEqual(series[0], { z: 0, probability: 1 });
  assert.deepEqual(series[6], { z: 6, probability: attackerSuccess(0.1, 6) });
  assert.equal(probabilitySeries(0.3).length, 13);
  assert.deepEqual(probabilitySeries(0.3, 0), [{ z: 0, probability: 1 }]);
  assert.throws(() => probabilitySeries(2, 6), RangeError);
  assert.throws(() => probabilitySeries(0.1, -1), RangeError);
  assert.throws(() => probabilitySeries(0.1, 1.5), RangeError);
  assert.throws(() => probabilitySeries(0.1, 1001), RangeError);
});

test('formats probabilities as readable percentages without hiding tiny nonzero results', () => {
  assert.equal(formatProbability(0), '0%');
  assert.equal(formatProbability(1), '100%');
  assert.equal(formatProbability(0.1773523), '17.74%');
  assert.equal(formatProbability(0.0002428), '0.02428%');
  assert.equal(formatProbability(1e-12), '1.00e-10%');
  assert.equal(formatProbability(0.999999), '>99.99%');
  assert.throws(() => formatProbability(-1), RangeError);
  assert.throws(() => formatProbability(NaN), TypeError);
});
