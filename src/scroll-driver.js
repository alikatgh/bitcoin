import { journeyProgress } from './playback.js';

const TIMELINE_DURATION = 10000;
const REDUCED_MOTION_STEPS = 48;

export function mountScrollDriver({
  journey,
  world,
  scene,
  window = globalThis.window,
  document = globalThis.document,
  anime = window?.anime,
  onFrame = () => {},
  onError = () => {},
}) {
  if (!anime?.createTimeline) throw new Error('Animation library unavailable');
  if (!journey?.getBoundingClientRect || !world || !scene?.render) {
    throw new TypeError('A journey, world, and scene are required');
  }

  const requestFrame = window?.requestAnimationFrame?.bind(window)
    ?? globalThis.requestAnimationFrame?.bind(globalThis);
  const cancelFrame = window?.cancelAnimationFrame?.bind(window)
    ?? globalThis.cancelAnimationFrame?.bind(globalThis);
  if (!requestFrame || !cancelFrame) throw new Error('Animation frames unavailable');

  const model = { value: 0 };
  const timeline = anime.createTimeline({ autoplay: false });
  const removeListeners = [];
  let pendingFrame = null;
  let previousProgress = -1;
  let invalidated = true;
  let suspended = false;
  let destroyed = false;

  function schedule() {
    if (!destroyed && !suspended && pendingFrame === null) {
      pendingFrame = requestFrame(update);
    }
  }

  function refresh() {
    if (destroyed) return;
    invalidated = true;
    suspended = false;
    schedule();
  }

  function update() {
    pendingFrame = null;
    if (destroyed || suspended) return;

    try {
      const bounds = journey.getBoundingClientRect();
      const progress = journeyProgress(bounds.top, bounds.height, window.innerHeight);
      if (!invalidated && progress === previousProgress) return;

      const reducedMotion = Boolean(motionPreference?.matches);
      const visualProgress = reducedMotion && progress > 0 && progress < 1
        ? Math.floor(progress * REDUCED_MOTION_STEPS) / REDUCED_MOTION_STEPS
        : progress;

      // A paused timeline has no clock: document geometry alone selects its state.
      timeline.seek(visualProgress * TIMELINE_DURATION, true);
      const sceneResult = scene.render(model.value, {
        aspect: world.clientWidth / world.clientHeight,
        reducedMotion,
      });
      previousProgress = progress;
      invalidated = false;
      onFrame({ progress, visualProgress: model.value, sceneResult });
    } catch (error) {
      // Repeated scroll events must not keep failing. An explicit refresh can retry.
      suspended = true;
      invalidated = true;
      onError(error);
    }
  }

  function listen(target, type, callback, options) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, callback, options);
    removeListeners.push(() => target.removeEventListener(type, callback, options));
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (pendingFrame !== null) {
      cancelFrame(pendingFrame);
      pendingFrame = null;
    }
    for (const remove of removeListeners.splice(0).reverse()) remove();
    timeline.cancel();
  }

  let motionPreference;
  try {
    timeline.add(model, { value: [0, 1], duration: TIMELINE_DURATION, ease: 'linear' }, 0);
    motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    listen(window, 'scroll', schedule, { passive: true });
    listen(window, 'resize', refresh);
    listen(window, 'pageshow', refresh);
    listen(world, 'scene-restored', refresh);
    listen(document, 'visibilitychange', () => {
      if (!document.hidden) refresh();
    });
    if (motionPreference?.addEventListener) {
      listen(motionPreference, 'change', refresh);
    } else if (motionPreference?.addListener) {
      motionPreference.addListener(refresh);
      removeListeners.push(() => motionPreference.removeListener(refresh));
    }
    schedule();
  } catch (error) {
    destroy();
    throw error;
  }

  return { refresh, destroy };
}
