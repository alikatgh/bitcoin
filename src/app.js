import { createBitcoinScene } from './bitcoin-scene.js';
import { mountScrollDriver } from './scroll-driver.js';
import { sampleStory, sampleTheme, story, safeProgress } from './story.js';

const byId = id => document.getElementById(id);
const journey = byId('journey');
const world = byId('world');
const stage = byId('stage');
const copy = byId('copy');
const fallback = byId('fallback');
const annotations = byId('annotations');
let previousIndex = -1;
let scene;
let driver;
const rgb = values => `rgb(${values.join(',')})`;

// The complete explanation remains readable with assistive technology.
for (const chapter of story) {
  const heading = document.createElement('h2');
  heading.textContent = chapter.title.join(' ');
  const paragraph = document.createElement('p');
  paragraph.textContent = `${chapter.body}${chapter.readout ? ` ${chapter.readout}` : ''}`;
  byId('transcript').append(heading, paragraph);
}

function drawAnnotations(result, chapter, state) {
  const anchors = result?.anchors || [];
  annotations.style.opacity = state.index === 0 || state.index === 10 ? '0' : String(state.opacity * .85);
  ['primary', 'secondary'].forEach((id, i) => {
    const label = byId(`label-${id}`);
    label.textContent = chapter.labels[i];
    const anchor = anchors.find(item => item.id === id);
    const visible = anchor && anchor.visible !== false && Number.isFinite(anchor.x) && Number.isFinite(anchor.y);
    const line = byId(`leader-${id}`);
    const dot = byId(`anchor-${id}`);
    line.style.opacity = dot.style.opacity = label.style.opacity = visible ? '1' : '0';
    if (!visible) return;
    const x = safeProgress(anchor.x) * 1000;
    const y = safeProgress(anchor.y) * 1000;
    const endX = (1 - .048 - label.getBoundingClientRect().width / world.clientWidth) * 1000 - 8;
    const endY = (i ? .23 : .18) * 1000 + 7;
    const elbowX = Math.min(x + 20, endX - 24);
    line.setAttribute('d', `M${x.toFixed(2)},${y.toFixed(2)}L${elbowX.toFixed(2)},${endY}H${endX.toFixed(2)}`);
    dot.setAttribute('cx', x.toFixed(2));
    dot.setAttribute('cy', y.toFixed(2));
  });
}

function present({ progress, visualProgress, sceneResult }) {
  if (sceneResult?.ready === false) return;
  const state = sampleStory(visualProgress);
  const chapter = story[state.index];
  if (previousIndex !== state.index) {
    previousIndex = state.index;
    const title = byId('headline');
    title.replaceChildren();
    chapter.title.forEach((line, i) => {
      if (i) title.append(document.createElement('br'));
      title.append(document.createTextNode(line));
    });
    const caption = `${String(state.index + 1).padStart(2, '0')} / ${chapter.name}`;
    byId('eyebrow').textContent = caption;
    byId('chapter-caption').textContent = caption;
    byId('description').textContent = chapter.body;
    byId('readout').textContent = chapter.readout || '';
    byId('readout').hidden = !chapter.readout;
    byId('accessible-state').textContent = `${chapter.title.join(' ')} ${chapter.body}${chapter.readout ? ` ${chapter.readout}` : ''}`;
    copy.dataset.index = state.index;
  }
  copy.style.opacity = String(state.opacity);
  copy.style.transform = `translateY(${state.offset.toFixed(2)}px)`;
  const theme = sampleTheme(state.light);
  stage.style.backgroundColor = rgb(theme.background);
  const light = state.light > .45;
  stage.style.setProperty('--ink', rgb(theme.ink));
  stage.style.setProperty('--muted', rgb(theme.muted));
  stage.style.setProperty('--rule', rgb(theme.rule));
  stage.dataset.theme = light ? 'light' : 'dark';
  world.dataset.progress = progress.toFixed(5);
  byId('reading-progress').style.left = `${progress * 100}%`;
  byId('progress-number').textContent = String(Math.round(progress * 100)).padStart(2, '0');
  byId('scroll-cue').style.opacity = String(1 - safeProgress(progress * 30));
  byId('chapter-caption').style.opacity = String(safeProgress((progress - .035) * 30));
  drawAnnotations(sceneResult, chapter, state);
  fallback.setAttribute('hidden', '');
  byId('load-status').hidden = true;
}

function showFallback(error) {
  fallback.removeAttribute('hidden');
  annotations.style.opacity = '0';
  byId('load-status').hidden = false;
  console.error(error);
}

try {
  if (!window.anime?.createTimeline) throw new Error('Animation library unavailable');
  scene = createBitcoinScene(world);
  driver = mountScrollDriver({ journey, world, scene, anime: window.anime, window, document, onFrame: present, onError: showFallback });
  world.addEventListener('scene-lost', () => showFallback(new Error('The 3D context was interrupted.')));
} catch (error) {
  scene?.destroy();
  showFallback(error);
}
