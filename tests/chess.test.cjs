const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1], { filename: 'index.html inline script' });
const rulesStart = html.indexOf('/* -------------------- Local FIDE Chess Rules Engine -------------------- */');
const rulesEnd = html.indexOf('/* -------------------- Puzzles, Openings & Historical Games Data -------------------- */', rulesStart);
assert(rulesStart >= 0 && rulesEnd > rulesStart, 'embedded chess rules source found');
const rulesSource = html.slice(rulesStart, rulesEnd);
const rulesContext = {};
vm.runInNewContext(rulesSource + '\nglobalThis.Chess = Chess;', rulesContext);
const Chess = rulesContext.Chess;
function perft(chess, depth) {
  if (depth === 0) return 1;
  let nodes = 0;
  for (const move of chess.moves({ verbose: true })) {
    chess.move(move.uci);
    nodes += perft(chess, depth - 1);
    chess.undo();
  }
  return nodes;
}
const start = new Chess();
assert.equal(perft(start, 1), 20);
assert.equal(perft(start, 2), 400);
assert.equal(perft(start, 3), 8902);
const kiwipete = new Chess('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
assert.equal(perft(kiwipete, 1), 48);
assert.equal(perft(kiwipete, 2), 2039);
const endgame = new Chess('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
assert.equal(perft(endgame, 1), 14);
assert.equal(perft(endgame, 2), 191);
assert.equal(start.fen(), 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
assert.throws(() => new Chess('not a fen'), /Invalid FEN/);
const puzzles = vm.runInNewContext('(' + html.match(/const PUZZLES = (\[[\s\S]*?\n  \]);/)[1] + ')');
for (const puzzle of puzzles) {
  const chess = new Chess(puzzle.fen);
  for (const uci of puzzle.solution) assert.ok(chess.move(uci), `${puzzle.id} illegal solution move ${uci}`);
}
const openingSource = html.match(/const OPENINGS = (\[[\s\S]*?\n  \]);/)[1].replaceAll('startingFen: DEFAULT_POSITION', "startingFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'");
const openings = vm.runInNewContext('(' + openingSource + ')');
for (const opening of openings) {
  const variants = [{ name: 'main line', moves: opening.moves }, ...(opening.variations || [])];
  for (const line of variants) {
    const chess = new Chess(opening.startingFen);
    for (const move of line.moves) assert.ok(chess.move(move), `${opening.id} ${line.name}: illegal ${move}`);
  }
}
const games = vm.runInNewContext('(' + html.match(/const HISTORICAL_GAMES = (\[[\s\S]*?\n  \]);/)[1] + ')');
for (const game of games) {
  const chess = new Chess();
  assert.doesNotThrow(() => chess.loadPgn(game.pgn), `${game.title} PGN`);
}
const stockfishJs = fs.readFileSync(path.join(__dirname, '..', 'vendor/stockfish/stockfish-19-single.js'), 'utf8');
assert.match(stockfishJs, /Stockfish/);
const fallbackWorker = fs.readFileSync(path.join(__dirname, '..', 'vendor/gm-fallback-worker.js'), 'utf8');
assert.match(fallbackWorker, /^importScripts\('\.\/gm-fallback-rules\.js'\);/);
assert.match(fallbackWorker, /not Stockfish; weaker built-in fallback/);
assert.ok(fs.statSync(path.join(__dirname, '..', 'vendor/stockfish/stockfish-19-single.wasm')).size > 90_000_000, 'full Stockfish WASM is bundled');
assert.match(html, /id="chkAutoPlayBest" checked/);
assert.match(html, /autoPlayBest: true/);
assert.match(html, /applyMirrorMove\(res\.bestMove, \{ allowUserSideMove: true \}\)/);
assert.match(html, /applyMirrorMove\(input, \{ allowUserSideMove = false \}/);
assert.match(html, /Profile PIN security is unavailable at this address/);
assert.match(html, /http:\/\/localhost/);
assert.match(html, /moverCpBest = GMAnalysis\.scoreToCp\(bestLine\.scoreType, bestLine\.scoreValue\)/);
assert.match(html, /if \(state\.engine && state\.engine\.currentSearch\) state\.engine\.stop\(\)/);
assert.match(html, /reviewStrength/);
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.webmanifest'), 'utf8'));
assert.equal(manifest.display, 'standalone');
for (const icon of manifest.icons) assert.ok(fs.existsSync(path.join(__dirname, '..', icon.src.replace('./', ''))), `manifest icon ${icon.src} exists`);
assert.ok(fs.existsSync(path.join(__dirname, '..', 'service-worker.js')));

const analysisStart = html.indexOf('  const GMAnalysis = {');
const analysisEnd = html.indexOf('\n\n  const GMIntegrations = {', analysisStart);
assert(analysisStart >= 0 && analysisEnd > analysisStart, 'review analysis source found');
const analysisContext = {};
vm.runInNewContext(html.slice(analysisStart, analysisEnd) + '\nglobalThis.GMAnalysis = GMAnalysis;', analysisContext);
const analysis = analysisContext.GMAnalysis;
const brilliantMove = { cpLoss: 0, moverCpBefore: 0, moverCpAfter: 0, secondBestCp: -1000, playedIsBest: true, isBook: false, isSacrifice: true, legalMovesCount: 20, isMateDelivered: false };
assert.equal(analysis.classifyMove(brilliantMove), 'Brilliant');
assert.notEqual(analysis.classifyMove({ ...brilliantMove, isSacrifice: false }), 'Brilliant', 'brilliant requires a detected sound sacrifice');
assert.notEqual(analysis.classifyMove({ ...brilliantMove, playedIsBest: false }), 'Brilliant', 'brilliant requires the engine top move');
const outcomeStart = html.indexOf('  function describeReviewOutcome(');
const outcomeEnd = html.indexOf('\n  function loadPgnIntoReview(', outcomeStart);
assert(outcomeStart >= 0 && outcomeEnd > outcomeStart, 'review outcome source found');
const outcomeContext = { Chess };
vm.runInNewContext(html.slice(outcomeStart, outcomeEnd) + '\nglobalThis.describeReviewOutcome = describeReviewOutcome;', outcomeContext);
const describeOutcome = outcomeContext.describeReviewOutcome;
let drawGame = new Chess();
drawGame.loadPgn('[Result "1/2-1/2"]\n\n1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 1/2-1/2');
assert.match(describeOutcome(drawGame, '[Result "1/2-1/2"]\n\n1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 1/2-1/2'), /draw by repetition/);
drawGame = new Chess();
drawGame.loadPgn('[Result "1/2-1/2"]\n[FEN "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"]\n\n1/2-1/2');
assert.match(describeOutcome(drawGame, '1/2-1/2'), /stalemate/);
drawGame = new Chess();
drawGame.loadPgn('[Result "1/2-1/2"]\n[FEN "4k3/8/8/8/8/8/8/4K3 w - - 0 1"]\n\n1/2-1/2');
assert.match(describeOutcome(drawGame, '1/2-1/2'), /insufficient mating material/);
assert.match(describeOutcome(new Chess(), '1/2-1/2'), /does not identify the cause/);

console.log(`PASS: syntax, perft 20/400/8902, ${puzzles.length} puzzle lines, ${openings.length} openings, ${games.length} historical PGNs, review classification/draw explanations, Stockfish assets and Mirror Play safeguards`);
