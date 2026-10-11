# Bitcoin, in motion

A continuous, animated journey through the mechanics of Bitcoin. Twelve ideas,
one page, entirely driven by scrolling. Scroll backward to rewind every diagram.

## Run locally

Requires Node.js 20 or later. No dependency installation or build is needed.

```sh
npm start
```

Open [localhost:8769](http://localhost:8769). The preview server binds only to this
computer. A static host can publish `index.html`, `favicon.svg`, `src/`, and
`vendor/` together, preserving their relative paths.

## Experience

Signatures, shared ordering, proof of work, peer propagation, incentives, Merkle
trees, lightweight verification, inputs and outputs, privacy, attack probability,
and the complete system unfold along one continuous page. There are no buttons,
menus, or chapter switches. Sticky diagrams follow the surrounding explanation;
on narrow screens the camera follows the relevant part automatically.

The calculation follows a 10% attacker as the number of blocks after a payment
increases. A comparison curve shows the effect of a 30% hash-power share. Reduced
motion uses discrete diagram states instead of continuous movement.

## Development

```sh
npm test
npm run check
```

- `src/chapters.js`: the twelve explanations, each with four narrative steps.
- `src/scenes.js`: deterministic SVG scenes and narrow-screen camera positions.
- `src/app.js`: scroll position, Anime.js timeline seeking, and scene integration.
- `src/math.js`: Poisson approximation for eventual attacker catch-up probability.
- `src/playback.js`: scroll and narrative-phase calculations.

Tests cover reference probability values, model boundaries, forward/backward
scrolling, and the preview server's asset access rules. There are no runtime API
calls, external fonts, package installs, or CI workflows.

## Model boundaries

The diagrams are educational illustrations. Hashes, nonce attempts, transactions,
and peer activity are examples; nothing mines, connects to Bitcoin, handles a
wallet, or collects data.

The probability calculation assumes fixed computational shares and independent
block arrivals. `z` counts blocks after the payment's block. The logarithmic chart
clamps probabilities to 10⁻⁹ for display while the numeric readout retains smaller
values. These estimates are not a guarantee or a complete network risk model.

## License and third-party notice

Original code and explanations: [MIT](LICENSE), by
[Albert Nikanorov](https://github.com/alikatgh).

[Anime.js 4.5.0](https://github.com/juliangarnier/anime/tree/v4.5.0) is vendored from
the official npm package's `dist/bundles/anime.umd.min.js`. Its
[MIT license](vendor/ANIMEJS-LICENSE.md) is preserved.
