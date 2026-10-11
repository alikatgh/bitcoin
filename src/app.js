import { chapters } from './chapters.js';
import { createScene, sceneFocus } from './scenes.js';
import { attackerSuccess, formatProbability } from './math.js';
import { clampProgress, stepAt, scrollProgress } from './playback.js';

const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const root = document.getElementById('chapters');
const views = [];
let frame = 0;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function mountChapter(item) {
  const section = element('section', 'chapter');
  section.id = item.id;
  section.setAttribute('aria-labelledby', `${item.id}-title`);
  const heading = element('div', 'chapter-heading');
  heading.append(element('p', 'chapter-index', String(item.number).padStart(2, '0')));
  const headingCopy = element('div', 'chapter-heading-copy');
  headingCopy.append(element('p', 'eyebrow', item.kicker));
  const title = element('h2', '', item.headline);
  title.id = `${item.id}-title`;
  headingCopy.append(title, element('p', 'chapter-description', item.description));
  heading.append(headingCopy);
  section.append(heading);

  const body = element('div', 'chapter-body');
  const figure = element('figure', 'chapter-visual');
  figure.setAttribute('aria-label', item.title);
  const bar = element('div', 'stage-bar');
  bar.append(element('span', '', item.title.toUpperCase()), element('span', 'stage-number', `${String(item.number).padStart(2, '0')} / 12`));
  const viewport = element('div', 'scene-viewport');
  const canvas = element('div', 'scene');
  viewport.append(canvas);
  const caption = element('figcaption', 'scene-caption');
  const stepCounter = element('span', 'step-count', '01 / 04');
  const stepCaption = element('span', 'step-caption', item.steps[0].title);
  caption.append(stepCounter, stepCaption);
  figure.append(bar, viewport);
  let probability, blocks;
  if (item.id === 'calculations') {
    const calculation = element('div', 'calculation-result');
    const assumptions = element('div');
    assumptions.append(element('span', 'metric-label', 'ATTACKER HASH POWER'), element('strong', '', '10%'));
    const blockCount = element('div');
    blocks = element('strong', '', '0');
    blockCount.append(element('span', 'metric-label', 'BLOCKS AFTER PAYMENT'), blocks);
    const result = element('div');
    probability = element('strong', 'probability', '100%');
    result.append(element('span', 'metric-label', 'CATCH-UP PROBABILITY'), probability);
    calculation.append(assumptions, blockCount, result);
    figure.append(calculation);
  }
  figure.append(caption);
  const story = element('div', 'chapter-story');
  const steps = item.steps.map((step, index) => {
    const panel = element('div', 'story-step');
    panel.append(element('span', 'story-number', `0${index + 1}`), element('h3', '', step.title), element('p', '', step.text));
    story.append(panel);
    return panel;
  });
  const takeaway = element('div', 'chapter-takeaway');
  takeaway.append(element('p', 'eyebrow', 'THE CONNECTION'), element('p', '', item.takeaway));
  story.append(takeaway);
  body.append(figure, story);
  section.append(body);
  root.append(section);
  const scene = createScene(canvas, item.id, { q: 0.1, z: 0 });
  const model = { value: 0 };
  const timeline = window.anime.createTimeline({ autoplay: false }).add(model, { value: [0, 1], duration: 1000, ease: 'linear' }, 0);
  return { item, section, viewport, canvas, scene, timeline, model, steps, stepCounter, stepCaption, probability, blocks, progress: -1, activeStep: -1, camera: -1, z: -1 };
}

function update() {
  frame = 0;
  const height = window.innerHeight;
  const mobile = window.innerWidth <= 760;
  // The mobile diagram occupies flow space above the story. Size every diagram
  // before reading story positions, including on the first frame after resize.
  for (const view of views) {
    const width = view.viewport.clientWidth;
    const diagramWidth = mobile ? Math.min(780, Math.max(520, (height - (view.probability ? 380 : 310)) * 1.8)) : width;
    if (diagramWidth !== view.diagramWidth) {
      view.diagramWidth = diagramWidth;
      view.viewport.style.setProperty('--scene-height', `${diagramWidth * 500 / 900}px`);
      view.canvas.style.setProperty('--scene-width', `${diagramWidth}px`);
    }
  }
  for (const view of views) {
    const bounds = view.section.getBoundingClientRect();
    // Off-screen chapters are left at their correct initial or final state.
    if ((bounds.top > height && view.progress === 0) || (bounds.bottom < 0 && view.progress === 1)) continue;
    const first = view.steps[0].getBoundingClientRect();
    const last = view.steps.at(-1).getBoundingClientRect();
    const progress = scrollProgress(first.top, last.bottom, height, mobile);
    const visualProgress = motionPreference.matches ? stepAt(progress, 4) / 3 : progress;
    if (progress !== view.progress) {
      view.progress = progress;
      view.timeline.seek(visualProgress * 1000, true);
      const z = Math.round(progress * 12);
      view.scene.render(view.model.value, { q: 0.1, z });
      if (view.probability && view.z !== z) {
        view.z = z;
        view.blocks.textContent = String(z);
        view.probability.textContent = formatProbability(attackerSuccess(0.1, z));
      }
      const step = stepAt(progress, 4);
      if (step !== view.activeStep) {
        view.activeStep = step;
        view.steps.forEach((panel, index) => panel.classList.toggle('is-active', index === step));
        view.stepCounter.textContent = `0${step + 1} / 04`;
        view.stepCaption.textContent = view.item.steps[step].title;
      }
    }
    const width = view.viewport.clientWidth;
    const diagramWidth = view.diagramWidth;
    const camera = mobile ? Math.max(0, Math.min(diagramWidth - width, sceneFocus(view.item.id, visualProgress) * diagramWidth - width / 2)) : 0;
    if (camera !== view.camera) {
      view.camera = camera;
      view.canvas.style.setProperty('--camera-x', `${-camera}px`);
    }
  }
  const total = document.documentElement.scrollHeight - height;
  document.getElementById('reading-progress').style.transform = `scaleX(${total > 0 ? clampProgress(window.scrollY / total) : 0})`;
  const hero = clampProgress(window.scrollY / height);
  document.querySelector('.hero-art').style.setProperty('--hero-progress', motionPreference.matches ? 0 : hero);
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(update);
}

try {
  if (!window.anime?.createTimeline) throw new Error('Animation library unavailable');
  chapters.forEach(item => views.push(mountChapter(item)));
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  motionPreference.addEventListener('change', () => {
    views.forEach(view => { view.progress = -1; });
    schedule();
  });
  window.addEventListener('pageshow', schedule);
  schedule();
} catch (error) {
  root.append(element('p', 'lesson-error', 'The animation could not load. Please reload this page.'));
  console.error(error);
}
