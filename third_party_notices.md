# Third-party notices

## Stockfish 19.0.1 WASM distribution

This project bundles the **single-threaded Stockfish 19.0.1 WebAssembly build** from the npm package [`stockfish@19.0.1`](https://www.npmjs.com/package/stockfish), maintained by Nathan Rugg. The bundled files are `vendor/stockfish/stockfish-19-single.js` and `vendor/stockfish/stockfish-19-single.wasm`.

Stockfish is distributed under **GNU General Public License, version 3 (GPL-3.0)**. The complete license text shipped with the npm package is included at `vendor/stockfish/COPYING.txt`. Package metadata and upstream documentation are included in this directory. Source project: [github.com/nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js); engine source: [github.com/official-stockfish/Stockfish](https://github.com/official-stockfish/Stockfish). The NNUE network is compiled into the WASM binary for this package build; no external network file is loaded.

Package tarball SHA-512 verified against npm registry metadata:

`sha512-bTwsO4e9HAwPBKls1+szcfibmaWRNzTF20rQE/XPdB3LOSoT6XTZDr1zYwriwSRRFT5MkvqrglPmJrKEVXGnyQ==`

Because this is GPL software, redistribution and distribution of modified combined works are subject to GPLv3 terms. See the bundled license and consult appropriate counsel for distribution questions.

## Original chess rules/analysis code

The embedded local chess rules library and built-in tactical fallback identify themselves as original project code under MIT. The fallback is explicitly reported in the UI and is weaker than Stockfish. Its separated worker/rules sources are in `vendor/gm-fallback-worker.js` and `vendor/gm-fallback-rules.js`; the MIT terms are included in `vendor/gm-fallback-LICENSE-MIT.txt`.

## Puzzle content

Puzzle entries carry their source/rights labels in the app. Several entries are original motif examples or derived from public-domain historic games. Review the per-puzzle provenance shown by the app before redistributing puzzle text as a separate collection.
