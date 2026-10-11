const MAX_DEPTH = 1000;
const LOG_TWO_PI = Math.log(2 * Math.PI);

function validateProbability(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number.`);
  }
  if (value < 0 || value > 1) {
    throw new RangeError(`${name} must be between 0 and 1.`);
  }
}

function validateDepth(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number.`);
  }
  if (!Number.isInteger(value) || value < 0 || value > MAX_DEPTH) {
    throw new RangeError(`${name} must be an integer from 0 to ${MAX_DEPTH}.`);
  }
}

/** Log P(K = z), for K ~ Poisson(z * r), without underflow at large z. */
function logPoissonAtDepth(r, z) {
  if (z < 16) {
    let logFactorial = 0;
    for (let k = 2; k <= z; k += 1) logFactorial += Math.log(k);
    return z * (Math.log(z) + Math.log(r)) - z * r - logFactorial;
  }

  // Stirling's log-factorial expansion. At z >= 16 the omitted term is
  // below 1.1e-16; this form avoids cancellation of z*log(z) at large z.
  const inverse = 1 / z;
  const square = inverse * inverse;
  const correction = inverse * (
    1 / 12 + square * (-1 / 360 + square * (1 / 1260 + square * (-1 / 1680 + square / 1188)))
  );
  return z * (Math.log(r) + 1 - r) - 0.5 * (LOG_TWO_PI + Math.log(z)) - correction;
}

/**
 * Satoshi's Poisson approximation for an attacker catching up.
 *
 * q is the attacker's computational share; z follows the paper's depth
 * parameter. A tie counts as success. This is a model, not a risk forecast.
 *
 * Instead of subtracting a near-one CDF, evaluate positive terms:
 *   P = sum(k=0..z) Poisson(k; lambda) * r^(z-k) + P(K > z),
 * where r=q/(1-q), lambda=z*r. Both sums are scaled by Poisson(z; lambda).
 * The finite catch-up sum and a tail bounded below machine precision avoid
 * catastrophic cancellation and initial exp(-lambda) underflow.
 */
export function attackerSuccess(q, z) {
  validateProbability(q, 'q');
  validateDepth(z, 'z');

  if (z === 0 || q >= 0.5) return 1;
  if (q === 0) return 0;

  const r = q / (1 - q);
  const lambda = z * r;

  // Moving backwards from k=z, each scaled catch-up term is k/z
  // times the previous term. These are all positive, at most one.
  let catchUp = 1;
  let term = 1;
  for (let k = z; k >= 1; k -= 1) {
    term *= k / z;
    catchUp += term;
  }

  // Moving forwards from k=z gives the Poisson upper tail directly.
  // Since lambda<z, its ratios decrease and a geometric remainder bound
  // certifies termination. The explicit bound is ample for z<=1000.
  let tail = 0;
  term = 1;
  for (let k = z + 1; k <= z + 10000; k += 1) {
    term *= lambda / k;
    tail += term;
    const nextRatio = lambda / (k + 1);
    const remainderBound = term * nextRatio / (1 - nextRatio);
    if (remainderBound <= Number.EPSILON * (catchUp + tail)) break;
  }

  // Combine in log space to retain representable subnormal results even
  // when the central mass itself would have rounded down to zero.
  const probability = Math.exp(logPoissonAtDepth(r, z) + Math.log(catchUp + tail));
  return Math.min(1, Math.max(0, probability));
}

/** Display a probability as a percentage with up to four significant digits. */
export function formatProbability(probability) {
  validateProbability(probability, 'probability');
  if (probability === 0) return '0%';
  if (probability === 1) return '100%';

  const percent = probability * 100;
  if (percent < 0.0001) return `${percent.toExponential(2)}%`;
  const rounded = Number(percent.toPrecision(4));
  return rounded === 100 ? '>99.99%' : `${rounded}%`;
}

/** Inclusive sequence of depths from zero through maxZ. */
export function probabilitySeries(q, maxZ = 12) {
  validateProbability(q, 'q');
  validateDepth(maxZ, 'maxZ');
  return Array.from({ length: maxZ + 1 }, (_, z) => ({ z, probability: attackerSuccess(q, z) }));
}
