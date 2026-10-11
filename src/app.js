import { createContinuousScene } from './continuous-scene.js';
import { clampProgress, journeyProgress } from './playback.js';

const journey = document.getElementById('journey');
const world = document.getElementById('world');
const cue = document.getElementById('scroll-cue');
const indicator = document.getElementById('reading-progress');
const accessibleState = document.getElementById('accessible-state');
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const descriptions = [
  'A payment travels directly between two wallets.',
  'The owner signs the payment with a private key. The key stays with the owner.',
  'Peers receive and independently check the signed payment.',
  'The payment joins other transactions in a block linked to earlier history.',
  'Many work attempts precede a valid block. Peers can check the result.',
  'The accepted block extends the shared chain. The miner receives a reward and fees.',
  'Transaction details condense into a Merkle tree while its root stays in the block header.',
  'A short sibling proof links the same payment to a header in the chain.',
  'Inputs combine and split into a payment, change, and a fee without creating value.',
  'Public addresses and transfers are visible. Private identities remain separate.',
  'The honest chain gains work. A competing branch remains possible but less likely to catch up.',
  'The original payment stays inside the shared history as more blocks extend it.',
];
let frame = 0;
let previousProgress = -1;
let previousPhase = -1;

try {
  if (!window.anime?.createTimeline) throw new Error('Animation library unavailable');
  const scene = createContinuousScene(world);
  const model = { value: 0 };
  const timeline = window.anime.createTimeline({ autoplay: false })
    .add(model, { value: [0, 1], duration: 12000, ease: 'linear' }, 0);
  document.getElementById('fallback').setAttribute('hidden', '');

  function update() {
    frame = 0;
    const bounds = journey.getBoundingClientRect();
    const progress = journeyProgress(bounds.top, bounds.height, window.innerHeight);
    if (progress === previousProgress) return;
    previousProgress = progress;
    // Seeking, rather than playing a second clock, makes every frame reversible.
    const visualProgress = motionPreference.matches ? Math.floor(progress * 48) / 48 : progress;
    timeline.seek(visualProgress * 12000, true);
    scene.render(model.value, { reducedMotion: motionPreference.matches, aspect: world.clientWidth / world.clientHeight });
    world.dataset.progress = progress.toFixed(5);
    indicator.style.transform = `scaleX(${progress})`;
    cue.style.opacity = String(1 - clampProgress(progress * 45));
    const phase = Math.min(descriptions.length - 1, Math.floor(progress * descriptions.length));
    if (phase !== previousPhase) {
      previousPhase = phase;
      accessibleState.textContent = descriptions[phase];
    }
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', () => { previousProgress = -1; schedule(); });
  window.addEventListener('pageshow', schedule);
  motionPreference.addEventListener('change', () => { previousProgress = -1; schedule(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { previousProgress = -1; schedule(); }
  });
  schedule();
} catch (error) {
  // The static visual stays in place if the animation cannot initialize.
  accessibleState.textContent = 'The animation could not load. Reload this page to try again.';
  console.error(error);
}
