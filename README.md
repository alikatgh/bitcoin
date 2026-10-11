# Bitcoin, in motion

A continuous 3D explanation of a Bitcoin payment. Scroll to see how signatures,
peers, blocks, and proof of work fit together. Scroll back to rewind. No clicks
are required.

## Run

Requires Node.js 20 or later. No install or build step.

```sh
npm start
```

Open [localhost:8769](http://localhost:8769). WebGL 2 enables the 3D scene; a static
illustration is available otherwise. The preview server binds to this computer.
A static host can serve `index.html`, `favicon.svg`, `src/`, and `vendor/` together.

## Development

```sh
npm test
npm run check
```

- `src/bitcoin-scene.js`: persistent transaction, peers, blocks, and Merkle proof.
- `src/story.js`: concise explanation and shared scroll phases.
- `src/scroll-driver.js`: reversible Anime.js timeline and browser lifecycle.
- `src/app.js`: typography, annotations, progress, and accessible explanation.
- `src/style.css`: pinned composition and responsive layout.
- `src/playback.js`: scroll geometry.
- `src/math.js`: probability calculations.

Earlier vector studies remain in `src/continuous-scene.js`, `src/scenes.js`, and
`src/chapters.js`; the current page does not load them.

The animation is an illustration, not a Bitcoin node or wallet. It does not
mine, send payments, collect data, or make runtime API requests. Rendering stops
when scrolling stops. Reduced motion uses discrete states and restrained
rotation. The complete explanation is also available to screen readers.

## License

Original code: [MIT](LICENSE), by [Albert Nikanorov](https://github.com/alikatgh).

Locally vendored dependencies:

- [Anime.js 4.5.0](https://github.com/juliangarnier/anime/tree/v4.5.0), [MIT](vendor/ANIMEJS-LICENSE.md).
- [Three.js 0.186.1](https://www.npmjs.com/package/three/v/0.186.1), [MIT](vendor/THREE-LICENSE.md).

Three.js files are extracted from the official npm package after verifying its
published SHA-512 integrity. No external assets or fonts are loaded.
