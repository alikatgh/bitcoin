import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedPath, makeServer } from '../server.js';

test('the local preview excludes credentials, Git metadata, and source internals', () => {
  for (const path of ['/.git/config', '/.env', '/server.js', '/package.json', '/src/../.env', '/src/%2e%2e/.env', '/vendor/../../.git/config']) assert.equal(allowedPath(path), false, path);
  for (const path of ['/index.html', '/src/app.js', '/src/style.css', '/vendor/anime.umd.min.js']) assert.equal(allowedPath(path), true, path);
});
test('preview serves the guide and rejects unsafe methods and malformed paths', async () => {
  const server = makeServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(base);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    assert.match(page.headers.get('content-security-policy'), /connect-src 'none'/);
    assert.match(await page.text(), /Bitcoin, in motion/);
    assert.equal((await fetch(`${base}/.git/config`)).status, 404);
    assert.equal((await fetch(`${base}/%zz`)).status, 400);
    assert.equal((await fetch(base, { method: 'POST' })).status, 405);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
