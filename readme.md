# Grandmaster Companion Pro

A browser-first chess study application based on the user's uploaded single-file interface. It keeps the existing dark/gold design and features (Mirror Play, puzzles, openings, historical games, profiles, review and backup) and adds a bundled Stockfish 19 WASM engine and an installable offline shell.

## Run locally

Use the included `run-local.sh` launcher or start a static HTTP server. Opening `index.html` directly from `file://` prevents browsers from loading the Stockfish worker and WASM engine.

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000/` (use the same port shown by the server command). Use `localhost`, not `0.0.0.0`, when opening it on this computer: browser PIN hashing requires a secure context. Those hostnames are separate browser origins, so profiles saved under one will not appear under the other. For internet hosting, serve the project root over HTTPS. No build step or runtime service is required.

## Engine

The default engine is the bundled Stockfish 19.0.1 single-threaded WASM distribution in `vendor/stockfish/`. The worker loads its adjacent WASM file. This full network build is about 95 MiB (about 100 MB); the app shows download progress and allows up to two minutes for a slow first load. Single-threaded mode avoids `SharedArrayBuffer` and cross-origin-isolation requirements. Do not rename or separate the JS and WASM files. The package is GPL-3.0; see [third_party_notices.md](third_party_notices.md) and `vendor/stockfish/copying.txt`.

If Stockfish fails to initialize, the app can use its embedded, explicitly labelled tactical fallback. It is weaker and should not be mistaken for Stockfish. Resource bounds are applied to search depth, time, hash, and MultiPV. The browser may require a few seconds to fetch and compile the large WASM file on first launch.

## Mirror Play

Set the real opponent's colour and enter the opponent's legal moves. By default, Stockfish's recommended reply is automatically applied to the app's digital board. Turn off **Auto-play best move on app board** to use physical-board practice; then play the suggested response on your real board and press **Confirm Move Played**. Use Correct Last/Undo or load a corrected FEN/PGN to resynchronize.

Mirror Play shows an icon and move-quality label for each move in the board overlay and move history, including both the entered opponent move and the engine's suggested reply. Labels include Book, Brilliant, Great, Best, Excellent, Good, Inaccuracy, Mistake, Miss, and Blunder. They are local engine estimates based on the available search depth; a deeper search can change them, and they do not reproduce Chess.com's proprietary accuracy or classification system.

**Prefer a non-drawing line when the engine finds one** is enabled by default. It checks up to the top three engine lines and, when the best line's principal variation reaches a draw but another searched line does not, it picks the highest-evaluated non-drawing line and labels it a practical win try. This can accept a worse engine evaluation to keep practical winning chances. If all three searched lines reach a draw, it keeps the engine's best line and says so; a deeper search may find other choices. This does not guarantee a win.

This is for permitted physical-board practice and study. Engine assistance is prohibited in many rated/competitive games and events. Follow the applicable organizer/platform rules. This project contains no online move automation.

## Offline and install

The service worker caches the app shell on first visit and caches Stockfish assets after the browser fetches them. Visit the app online, then reload it once so the service worker controls the page. On that controlled visit, wait for Stockfish initialization and the large WASM cache write to finish before testing offline. Browser cache quota/eviction policies apply; very large engine responses may fail to persist on some devices. The full Stockfish binary is intentionally not precached during install so the initial PWA install remains small.

## Browser and hosting requirements

- Current Chrome, Edge, Firefox, or Safari with WebAssembly and Web Workers.
- HTTPS for installation/offline access outside localhost.
- Enough free storage for a roughly 95 MiB (about 100 MB) WASM file and browser cache.
- A modern browser with localStorage; local profiles are stored only on that device/browser and are not encrypted at rest. Profile PINs are a local convenience gate, not account-grade security.
- The single-threaded engine does not require COOP/COEP headers. Do not enable cross-origin engine resources; keep all project assets same-origin for offline support.

## Modes and defaults

Only Bullet, Blitz, and Rapid are primary modes. Defaults are 1+0, 3+2, and 10+5 respectively; clock values remain editable. Completed results saved from a signed-in profile update a local Elo-style estimate against a fixed 1200-rated reference opponent; these are not comparable to official federation or server ratings. Guest results are not persisted.

## Game Review and study features

The Analysis screen provides a guided board editor, free move analysis, PGN/FEN input, saved Mirror Play games, and the last analysis loaded on this device. The board stays available while stepping through moves with Back, Forward, Restart, and Flip Board. Opening Explorer counts the bundled historical games and games/reviews saved in the current local profile; it labels the sample size and is not a global opening database. Practice Mistakes saves missed positions locally, and Insights summarizes only reviewed games in that profile. Endgame Practice adds a couple of authored mate-in-one positions to the existing puzzle collection. Vision training offers timed coordinate and engine-move prompts. Home includes a daily puzzle shortcut and a continue-learning prompt.

Profile review history is stored locally in the browser. Insights and the Explorer sample are only as representative as the games you have saved; the app does not fetch a live public game database. The daily puzzle is selected from this app's puzzle set, not a live Chess.com feed.

## Game Review limits

Review compares each played move with the engine's best line from the position before that move, then checks the resulting position. Quick, Thorough, and Deep set the time budget for each engine search; a normal move can use two searches. Labels such as Brilliant and Great are heuristic explanations based on the bundled engine's search, legal alternatives, and a detected sound piece sacrifice. They are not Chess.com labels and will not always match Chess.com, even for the same PGN. Engine version, search time, hardware, and each site's classification rules can change the result. Deeper analysis takes longer and still is not a proof of the only best move.

For a draw, Review reports a rule-based cause when the final PGN position establishes stalemate, repetition, the 50-move condition, or insufficient material. A PGN that only says `1/2-1/2` cannot reveal whether the players agreed, a draw was claimed, or an event/clock rule decided it. Paste the original PGN including headers and final result for the clearest available explanation.

Review can show stronger candidate moves and explain mistakes, but it cannot guarantee a win. For practical improvement, review the position before each large evaluation loss and practice the missed tactic or defensive idea.

## Project map

- `index.html` – application and embedded original chess rules/analysis source
- `run-local.sh` – starts a localhost server so browser workers and Stockfish WASM can load
- `vendor/stockfish/` – Stockfish worker, WASM build, package metadata, and license
- `vendor/gm-fallback-worker.js`, `vendor/gm-fallback-rules.js` – explicitly labelled local engine fallback (`vendor/gm-fallback-license-mit.txt`)
- `manifest.webmanifest`, `service-worker.js`, `icons/` – PWA files
- `tests/` – repeatable chess-data, perft, and source-integrity checks
- `docs/grandmaster_companion_pro.original.html` – unmodified uploaded starting source
- `audit.md` – checks performed and known limitations

## Tests

Run `node tests/chess.test.cjs`. This checks JavaScript syntax, standard move-generation perft counts, puzzle solutions, opening lines, and historical PGNs. Browser engine startup should also be verified by opening the app on localhost and checking that the engine badge identifies Stockfish 19; test offline launch after the WASM has loaded once.
