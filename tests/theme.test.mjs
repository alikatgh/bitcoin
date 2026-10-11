import test from 'node:test';
import assert from 'node:assert/strict';
import { contrast, sampleTheme } from '../src/story.js';

test('copy remains readable through every shade of the scroll theme transition', () => {
  for (let i = 0; i <= 2000; i++) {
    const theme = sampleTheme(i / 2000);
    assert.ok(contrast(theme.ink, theme.background) >= 4.5, `heading at ${i / 2000}`);
    assert.ok(contrast(theme.muted, theme.background) >= 4.5, `body at ${i / 2000}`);
  }
});
