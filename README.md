# Bitcoin, in motion

One continuous, wordless animation. A payment travels through a peer network,
becomes part of a block, and stays in the shared chain as the world unfolds.
Scroll forward to advance. Scroll backward to rewind. No visible text or controls.

## Run locally

Requires Node.js 20 or later. No dependency installation or build is needed.

```sh
npm start
```

Open [localhost:8769](http://localhost:8769). The preview server binds only to this
computer. A static host can publish `index.html`, `favicon.svg`, `src/`, and
`vendor/` together, preserving their relative paths.

## Experience

One persistent SVG canvas carries the entire journey. The same copper payment
and green chain connect ownership, signatures, peer propagation, proof of work,
rewards, Merkle compression, lightweight verification, inputs and outputs,
privacy, and competing branches. There are no chapter cards or scene switches.

All animation follows scroll position with Anime.js timeline seeking. Nothing
continues playing when scrolling stops. Reduced motion advances through discrete
states. Screen-reader descriptions provide the information conveyed visually.

## Development

```sh
npm test
npm run check
```

- `src/continuous-scene.js`: the persistent vector world and its choreography.
- `src/app.js`: scroll position, Anime.js seeking, and accessible descriptions.
- `src/style.css`: the full-screen, pinned canvas.
- `src/playback.js`: bounded scroll calculations.
- `src/math.js`: reference probability calculations retained from development.
- `src/scenes.js` and `src/chapters.js`: earlier diagrams and narrative data,
  retained in source history and unused by the visual experience.

The visual activity is illustrative. Nothing mines, connects to Bitcoin, handles
a wallet, or collects data. There are no runtime API calls, external fonts,
package installs, or CI workflows. The preview server serves an explicit asset
allowlist and rejects requests for private files.

## License and third-party notice

Original code: [MIT](LICENSE), by [Albert Nikanorov](https://github.com/alikatgh).

[Anime.js 4.5.0](https://github.com/juliangarnier/anime/tree/v4.5.0) is vendored from
the official npm package's `dist/bundles/anime.umd.min.js`. Its
[MIT license](vendor/ANIMEJS-LICENSE.md) is preserved.
