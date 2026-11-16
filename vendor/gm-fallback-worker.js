importScripts('./gm-fallback-rules.js');
/**
 * Grandmaster Companion Pro — Local FIDE Chess Rules Engine
 * Zero-dependency, chess.js-compatible API for browser & Web Worker use.
 * Supports full FIDE rules: legal moves, castling, en passant, promotion,
 * check, checkmate, stalemate, threefold repetition, 50-move rule,
 * insufficient material, FEN, PGN, SAN/UCI parsing & perft.
 * Licence: MIT (Original implementation for Grandmaster Companion Pro)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Chess = factory().Chess;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_POSITION = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const FILES = 'abcdefgh';
  const RANKS = '87654321';
  const PIECE_TYPES = ['p', 'n', 'b', 'r', 'q', 'k'];

  const KNIGHT_DELTAS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const BISHOP_DELTAS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const ROOK_DELTAS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const QUEEN_DELTAS = [...BISHOP_DELTAS, ...ROOK_DELTAS];

  function sqToRC(sq) {
    if (typeof sq !== 'string' || sq.length !== 2) return null;
    const c = FILES.indexOf(sq[0]);
    const r = RANKS.indexOf(sq[1]);
    if (c === -1 || r === -1) return null;
    return [r, c];
  }

  function rcToSq(r, c) {
    return FILES[c] + RANKS[r];
  }

  function inBounds(r, c) {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
  }

  function opp(color) {
    return color === 'w' ? 'b' : 'w';
  }

  class Chess {
    constructor(fen = DEFAULT_POSITION) {
      this._headers = {};
      this.load(fen);
    }

    reset() {
      this._headers = {};
      return this.load(DEFAULT_POSITION);
    }

    load(fen) {
      if (typeof fen !== 'string') throw new Error('Invalid FEN: must be a string');
      const parts = fen.trim().split(/\s+/);
      if (parts.length < 4) throw new Error('Invalid FEN: too few fields');

      const [placement, turn, castling, ep, halfStr = '0', fullStr = '1'] = parts;
      const rows = placement.split('/');
      if (rows.length !== 8) throw new Error('Invalid FEN: expected 8 ranks');

      const board = Array.from({ length: 8 }, () => Array(8).fill(null));
      let wk = 0, bk = 0;

      for (let r = 0; r < 8; r++) {
        let c = 0;
        for (const ch of rows[r]) {
          if (ch >= '1' && ch <= '8') {
            c += parseInt(ch, 10);
          } else {
            const lower = ch.toLowerCase();
            if (!PIECE_TYPES.includes(lower)) throw new Error(`Invalid FEN piece: ${ch}`);
            if (c >= 8) throw new Error('Invalid FEN: rank overflow');
            const color = ch === lower ? 'b' : 'w';
            if (lower === 'k') {
              if (color === 'w') wk++; else bk++;
            }
            board[r][c] = { type: lower, color };
            c++;
          }
        }
        if (c !== 8) throw new Error(`Invalid FEN: rank ${8 - r} incomplete`);
      }

      if (wk !== 1 || bk !== 1) throw new Error('Invalid FEN: must have exactly one king per side');
      if (turn !== 'w' && turn !== 'b') throw new Error('Invalid FEN: turn must be w or b');
      if (castling !== '-' && !/^[KQkq]+$/.test(castling)) throw new Error('Invalid FEN: castling field');
      if (ep !== '-' && !/^[a-h][36]$/.test(ep)) throw new Error('Invalid FEN: en passant square');

      const half = parseInt(halfStr, 10);
      const full = parseInt(fullStr, 10);
      if (Number.isNaN(half) || half < 0 || Number.isNaN(full) || full < 1) {
        throw new Error('Invalid FEN: move counters');
      }

      this._board = board;
      this._turn = turn;
      this._castling = {
        w: { k: castling.includes('K'), q: castling.includes('Q') },
        b: { k: castling.includes('k'), q: castling.includes('q') }
      };
      this._ep = ep === '-' ? null : ep;
      this._halfMoves = half;
      this._fullMoves = full;
      this._history = [];
      this._positionCounts = {};
      this._recordPosition();
      return true;
    }

    _positionKey() {
      const fenParts = this.fen().split(' ');
      return fenParts.slice(0, 4).join(' ');
    }

    _recordPosition() {
      const key = this._positionKey();
      this._positionCounts[key] = (this._positionCounts[key] || 0) + 1;
    }

    _unrecordPosition(key) {
      if (this._positionCounts[key]) {
        this._positionCounts[key]--;
        if (this._positionCounts[key] <= 0) delete this._positionCounts[key];
      }
    }

    fen() {
      let placement = '';
      for (let r = 0; r < 8; r++) {
        let empty = 0;
        for (let c = 0; c < 8; c++) {
          const p = this._board[r][c];
          if (!p) {
            empty++;
          } else {
            if (empty > 0) {
              placement += empty;
              empty = 0;
            }
            placement += p.color === 'w' ? p.type.toUpperCase() : p.type;
          }
        }
        if (empty > 0) placement += empty;
        if (r < 7) placement += '/';
      }
      let cStr = '';
      if (this._castling.w.k) cStr += 'K';
      if (this._castling.w.q) cStr += 'Q';
      if (this._castling.b.k) cStr += 'k';
      if (this._castling.b.q) cStr += 'q';
      if (!cStr) cStr = '-';
      return `${placement} ${this._turn} ${cStr} ${this._ep || '-'} ${this._halfMoves} ${this._fullMoves}`;
    }

    turn() {
      return this._turn;
    }

    board() {
      return this._board.map((row, r) =>
        row.map((p, c) => (p ? { square: rcToSq(r, c), type: p.type, color: p.color } : null))
      );
    }

    get(sq) {
      const rc = sqToRC(sq);
      if (!rc) return null;
      const p = this._board[rc[0]][rc[1]];
      return p ? { type: p.type, color: p.color } : null;
    }

    put(piece, sq) {
      const rc = sqToRC(sq);
      if (!rc || !piece || !PIECE_TYPES.includes(piece.type) || (piece.color !== 'w' && piece.color !== 'b')) {
        return false;
      }
      this._board[rc[0]][rc[1]] = { type: piece.type, color: piece.color };
      return true;
    }

    remove(sq) {
      const rc = sqToRC(sq);
      if (!rc) return null;
      const p = this._board[rc[0]][rc[1]];
      this._board[rc[0]][rc[1]] = null;
      return p;
    }

    header(...args) {
      for (let i = 0; i < args.length; i += 2) {
        if (typeof args[i] === 'string' && typeof args[i + 1] === 'string') {
          this._headers[args[i]] = args[i + 1];
        }
      }
      return { ...this._headers };
    }

    _findKing(color) {
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const p = this._board[r][c];
          if (p && p.color === color && p.type === 'k') return [r, c];
        }
      }
      return null;
    }

    isSquareAttacked(sq, byColor) {
      const rc = typeof sq === 'string' ? sqToRC(sq) : sq;
      if (!rc) return false;
      const [tr, tc] = rc;

      // Pawns
      const pawnRow = byColor === 'w' ? tr + 1 : tr - 1;
      if (pawnRow >= 0 && pawnRow < 8) {
        for (const dc of [-1, 1]) {
          const pc = tc + dc;
          if (pc >= 0 && pc < 8) {
            const p = this._board[pawnRow][pc];
            if (p && p.color === byColor && p.type === 'p') return true;
          }
        }
      }

      // Knights
      for (const [dr, dc] of KNIGHT_DELTAS) {
        const r = tr + dr, c = tc + dc;
        if (inBounds(r, c)) {
          const p = this._board[r][c];
          if (p && p.color === byColor && p.type === 'n') return true;
        }
      }

      // Kings
      for (const [dr, dc] of QUEEN_DELTAS) {
        const r = tr + dr, c = tc + dc;
        if (inBounds(r, c)) {
          const p = this._board[r][c];
          if (p && p.color === byColor && p.type === 'k') return true;
        }
      }

      // Bishops / Queens (diagonals)
      for (const [dr, dc] of BISHOP_DELTAS) {
        let r = tr + dr, c = tc + dc;
        while (inBounds(r, c)) {
          const p = this._board[r][c];
          if (p) {
            if (p.color === byColor && (p.type === 'b' || p.type === 'q')) return true;
            break;
          }
          r += dr;
          c += dc;
        }
      }

      // Rooks / Queens (orthogonals)
      for (const [dr, dc] of ROOK_DELTAS) {
        let r = tr + dr, c = tc + dc;
        while (inBounds(r, c)) {
          const p = this._board[r][c];
          if (p) {
            if (p.color === byColor && (p.type === 'r' || p.type === 'q')) return true;
            break;
          }
          r += dr;
          c += dc;
        }
      }

      return false;
    }

    inCheck(color = this._turn) {
      const k = this._findKing(color);
      return k ? this.isSquareAttacked(k, opp(color)) : false;
    }

    _generatePseudoMoves(onlySquare = null) {
      const moves = [];
      const us = this._turn;
      const them = opp(us);
      const filterRC = onlySquare ? sqToRC(onlySquare) : null;

      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          if (filterRC && (filterRC[0] !== r || filterRC[1] !== c)) continue;
          const p = this._board[r][c];
          if (!p || p.color !== us) continue;
          const from = rcToSq(r, c);

          if (p.type === 'p') {
            const dir = us === 'w' ? -1 : 1;
            const startRank = us === 'w' ? 6 : 1;
            const promoRank = us === 'w' ? 0 : 7;

            // Single push
            const r1 = r + dir;
            if (inBounds(r1, c) && !this._board[r1][c]) {
              const to = rcToSq(r1, c);
              if (r1 === promoRank) {
                for (const promo of ['q', 'r', 'b', 'n']) {
                  moves.push({ from, to, color: us, piece: 'p', promotion: promo, flags: 'np' });
                }
              } else {
                moves.push({ from, to, color: us, piece: 'p', flags: 'n' });
                // Double push
                const r2 = r + 2 * dir;
                if (r === startRank && !this._board[r2][c]) {
                  moves.push({ from, to: rcToSq(r2, c), color: us, piece: 'p', flags: 'b' });
                }
              }
            }

            // Captures & en passant
            for (const dc of [-1, 1]) {
              const nc = c + dc;
              if (!inBounds(r1, nc)) continue;
              const to = rcToSq(r1, nc);
              const target = this._board[r1][nc];
              if (target && target.color === them) {
                if (r1 === promoRank) {
                  for (const promo of ['q', 'r', 'b', 'n']) {
                    moves.push({ from, to, color: us, piece: 'p', captured: target.type, promotion: promo, flags: 'cp' });
                  }
                } else {
                  moves.push({ from, to, color: us, piece: 'p', captured: target.type, flags: 'c' });
                }
              } else if (this._ep && to === this._ep) {
                moves.push({ from, to, color: us, piece: 'p', captured: 'p', flags: 'e' });
              }
            }
          } else if (p.type === 'n') {
            for (const [dr, dc] of KNIGHT_DELTAS) {
              const nr = r + dr, nc = c + dc;
              if (!inBounds(nr, nc)) continue;
              const target = this._board[nr][nc];
              if (!target) {
                moves.push({ from, to: rcToSq(nr, nc), color: us, piece: 'n', flags: 'n' });
              } else if (target.color === them) {
                moves.push({ from, to: rcToSq(nr, nc), color: us, piece: 'n', captured: target.type, flags: 'c' });
              }
            }
          } else if (p.type === 'b' || p.type === 'r' || p.type === 'q') {
            const deltas = p.type === 'b' ? BISHOP_DELTAS : p.type === 'r' ? ROOK_DELTAS : QUEEN_DELTAS;
            for (const [dr, dc] of deltas) {
              let nr = r + dr, nc = c + dc;
              while (inBounds(nr, nc)) {
                const target = this._board[nr][nc];
                if (!target) {
                  moves.push({ from, to: rcToSq(nr, nc), color: us, piece: p.type, flags: 'n' });
                } else {
                  if (target.color === them) {
                    moves.push({ from, to: rcToSq(nr, nc), color: us, piece: p.type, captured: target.type, flags: 'c' });
                  }
                  break;
                }
                nr += dr;
                nc += dc;
              }
            }
          } else if (p.type === 'k') {
            for (const [dr, dc] of QUEEN_DELTAS) {
              const nr = r + dr, nc = c + dc;
              if (!inBounds(nr, nc)) continue;
              const target = this._board[nr][nc];
              if (!target) {
                moves.push({ from, to: rcToSq(nr, nc), color: us, piece: 'k', flags: 'n' });
              } else if (target.color === them) {
                moves.push({ from, to: rcToSq(nr, nc), color: us, piece: 'k', captured: target.type, flags: 'c' });
              }
            }
            // Castling
            const homeRank = us === 'w' ? 7 : 0;
            if (r === homeRank && c === 4 && !this.isSquareAttacked([homeRank, 4], them)) {
              if (this._castling[us].k) {
                const rook = this._board[homeRank][7];
                if (
                  rook && rook.color === us && rook.type === 'r' &&
                  !this._board[homeRank][5] && !this._board[homeRank][6] &&
                  !this.isSquareAttacked([homeRank, 5], them) &&
                  !this.isSquareAttacked([homeRank, 6], them)
                ) {
                  moves.push({ from, to: rcToSq(homeRank, 6), color: us, piece: 'k', flags: 'k' });
                }
              }
              if (this._castling[us].q) {
                const rook = this._board[homeRank][0];
                if (
                  rook && rook.color === us && rook.type === 'r' &&
                  !this._board[homeRank][3] && !this._board[homeRank][2] && !this._board[homeRank][1] &&
                  !this.isSquareAttacked([homeRank, 3], them) &&
                  !this.isSquareAttacked([homeRank, 2], them)
                ) {
                  moves.push({ from, to: rcToSq(homeRank, 2), color: us, piece: 'k', flags: 'q' });
                }
              }
            }
          }
        }
      }
      return moves;
    }

    _makeRawMove(m) {
      const [fr, fc] = sqToRC(m.from);
      const [tr, tc] = sqToRC(m.to);
      const state = {
        move: m,
        castling: {
          w: { ...this._castling.w },
          b: { ...this._castling.b }
        },
        ep: this._ep,
        halfMoves: this._halfMoves,
        fullMoves: this._fullMoves,
        capturedPiece: null,
        epCapturedSq: null
      };

      const movingPiece = this._board[fr][fc];
      state.capturedPiece = this._board[tr][tc];
      this._board[fr][fc] = null;

      if (m.promotion) {
        this._board[tr][tc] = { type: m.promotion, color: m.color };
      } else {
        this._board[tr][tc] = movingPiece;
      }

      // En passant capture
      if (m.flags === 'e') {
        const capR = m.color === 'w' ? tr + 1 : tr - 1;
        state.epCapturedSq = [capR, tc];
        state.capturedPiece = this._board[capR][tc];
        this._board[capR][tc] = null;
      }

      // Castling rook move
      if (m.flags === 'k') {
        this._board[tr][5] = this._board[tr][7];
        this._board[tr][7] = null;
      } else if (m.flags === 'q') {
        this._board[tr][3] = this._board[tr][0];
        this._board[tr][0] = null;
      }

      // Update castling rights
      if (movingPiece.type === 'k') {
        this._castling[m.color].k = false;
        this._castling[m.color].q = false;
      }
      if (movingPiece.type === 'r') {
        if (m.from === 'h1') this._castling.w.k = false;
        if (m.from === 'a1') this._castling.w.q = false;
        if (m.from === 'h8') this._castling.b.k = false;
        if (m.from === 'a8') this._castling.b.q = false;
      }
      if (m.to === 'h1') this._castling.w.k = false;
      if (m.to === 'a1') this._castling.w.q = false;
      if (m.to === 'h8') this._castling.b.k = false;
      if (m.to === 'a8') this._castling.b.q = false;

      // En passant square
      if (m.flags === 'b') {
        this._ep = rcToSq((fr + tr) / 2, fc);
      } else {
        this._ep = null;
      }

      // Half-move clock & full-move counter
      if (movingPiece.type === 'p' || m.captured) {
        this._halfMoves = 0;
      } else {
        this._halfMoves++;
      }
      if (m.color === 'b') {
        this._fullMoves++;
      }

      this._turn = opp(this._turn);
      return state;
    }

    _unmakeRawMove(state) {
      const m = state.move;
      const [fr, fc] = sqToRC(m.from);
      const [tr, tc] = sqToRC(m.to);

      this._turn = m.color;
      this._castling = state.castling;
      this._ep = state.ep;
      this._halfMoves = state.halfMoves;
      this._fullMoves = state.fullMoves;

      const moved = this._board[tr][tc];
      this._board[fr][fc] = m.promotion ? { type: 'p', color: m.color } : moved;

      if (m.flags === 'e') {
        this._board[tr][tc] = null;
        this._board[state.epCapturedSq[0]][state.epCapturedSq[1]] = state.capturedPiece;
      } else {
        this._board[tr][tc] = state.capturedPiece;
      }

      if (m.flags === 'k') {
        this._board[tr][7] = this._board[tr][5];
        this._board[tr][5] = null;
      } else if (m.flags === 'q') {
        this._board[tr][0] = this._board[tr][3];
        this._board[tr][3] = null;
      }
    }

    _computeSan(m, allLegalMoves) {
      if (m.flags === 'k') return 'O-O';
      if (m.flags === 'q') return 'O-O-O';

      let san = '';
      if (m.piece !== 'p') {
        san += m.piece.toUpperCase();
        const sameTarget = allLegalMoves.filter(
          x => x.piece === m.piece && x.to === m.to && x.from !== m.from
        );
        if (sameTarget.length > 0) {
          const sameFile = sameTarget.some(x => x.from[0] === m.from[0]);
          const sameRank = sameTarget.some(x => x.from[1] === m.from[1]);
          if (!sameFile) {
            san += m.from[0];
          } else if (!sameRank) {
            san += m.from[1];
          } else {
            san += m.from;
          }
        }
      } else if (m.captured) {
        san += m.from[0];
      }

      if (m.captured) san += 'x';
      san += m.to;
      if (m.promotion) san += '=' + m.promotion.toUpperCase();

      // Check / Checkmate suffix
      const st = this._makeRawMove(m);
      if (this.inCheck()) {
        const hasReply = this._hasAnyLegalMove();
        san += hasReply ? '+' : '#';
      }
      this._unmakeRawMove(st);
      return san;
    }

    _hasAnyLegalMove() {
      const pseudo = this._generatePseudoMoves();
      const us = this._turn;
      for (const m of pseudo) {
        const st = this._makeRawMove(m);
        const legal = !this.inCheck(us);
        this._unmakeRawMove(st);
        if (legal) return true;
      }
      return false;
    }

    moves(options = {}) {
      const sq = options.square || null;
      const pseudo = this._generatePseudoMoves(sq);
      const us = this._turn;
      const legal = [];
      for (const m of pseudo) {
        const st = this._makeRawMove(m);
        if (!this.inCheck(us)) legal.push(m);
        this._unmakeRawMove(st);
      }

      // If square filter was used, we need full legal moves for SAN disambiguation when verbose or SAN requested
      let fullLegal = legal;
      if (sq && (options.verbose || !options.uciOnly)) {
        const allPseudo = this._generatePseudoMoves(null);
        fullLegal = [];
        for (const m of allPseudo) {
          const st = this._makeRawMove(m);
          if (!this.inCheck(us)) fullLegal.push(m);
          this._unmakeRawMove(st);
        }
      }

      if (options.verbose) {
        return legal.map(m => ({
          ...m,
          uci: m.from + m.to + (m.promotion || ''),
          san: this._computeSan(m, fullLegal)
        }));
      }
      return legal.map(m => this._computeSan(m, fullLegal));
    }

    move(input) {
      const legalMoves = this.moves({ verbose: true });
      let chosen = null;

      if (typeof input === 'string') {
        const trimmed = input.trim();
        // Try UCI first (e.g. e2e4, e7e8q)
        if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(trimmed)) {
          chosen = legalMoves.find(m => m.uci === trimmed);
        }
        // Try SAN (strip ?! annotations)
        if (!chosen) {
          const clean = trimmed.replace(/[!?]+/g, '').replace(/0-0-0/g, 'O-O-O').replace(/0-0/g, 'O-O');
          chosen = legalMoves.find(m => m.san === clean);
          if (!chosen) {
            // Try matching without +/# suffix
            const noCheck = clean.replace(/[+#]$/, '');
            chosen = legalMoves.find(m => m.san.replace(/[+#]$/, '') === noCheck);
          }
        }
      } else if (input && typeof input === 'object') {
        const from = input.from;
        const to = input.to;
        const promo = input.promotion ? input.promotion.toLowerCase() : undefined;
        chosen = legalMoves.find(
          m => m.from === from && m.to === to && (!m.promotion || m.promotion === (promo || 'q'))
        );
        if (chosen && input.promotion && chosen.promotion !== promo) {
          chosen = legalMoves.find(m => m.from === from && m.to === to && m.promotion === promo);
        }
      }

      if (!chosen) return null;

      const state = this._makeRawMove(chosen);
      const key = this._positionKey();
      this._recordPosition();
      state.positionKey = key;
      state.san = chosen.san;
      state.uci = chosen.uci;
      this._history.push(state);
      return chosen;
    }

    undo() {
      if (this._history.length === 0) return null;
      const state = this._history.pop();
      this._unrecordPosition(state.positionKey);
      this._unmakeRawMove(state);
      return { ...state.move, san: state.san, uci: state.uci };
    }

    history(options = {}) {
      if (options.verbose) {
        return this._history.map(s => ({ ...s.move, san: s.san, uci: s.uci }));
      }
      return this._history.map(s => s.san);
    }

    isCheckmate() {
      return this.inCheck() && !this._hasAnyLegalMove();
    }

    isStalemate() {
      return !this.inCheck() && !this._hasAnyLegalMove();
    }

    isThreefoldRepetition() {
      const key = this._positionKey();
      return (this._positionCounts[key] || 0) >= 3;
    }

    isInsufficientMaterial() {
      const pieces = { w: [], b: [] };
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const p = this._board[r][c];
          if (p && p.type !== 'k') {
            pieces[p.color].push({ type: p.type, colorSq: (r + c) % 2 });
          }
        }
      }
      const wCount = pieces.w.length;
      const bCount = pieces.b.length;
      if (wCount === 0 && bCount === 0) return true;
      if (wCount === 0 && bCount === 1 && (pieces.b[0].type === 'n' || pieces.b[0].type === 'b')) return true;
      if (bCount === 0 && wCount === 1 && (pieces.w[0].type === 'n' || pieces.w[0].type === 'b')) return true;
      if (
        wCount === 1 && bCount === 1 &&
        pieces.w[0].type === 'b' && pieces.b[0].type === 'b' &&
        pieces.w[0].colorSq === pieces.b[0].colorSq
      ) {
        return true;
      }
      return false;
    }

    isFiftyMoveDraw() {
      return this._halfMoves >= 100;
    }

    isDraw() {
      return (
        this.isStalemate() ||
        this.isFiftyMoveDraw() ||
        this.isThreefoldRepetition() ||
        this.isInsufficientMaterial()
      );
    }

    isGameOver() {
      return this.isCheckmate() || this.isDraw();
    }

    pgn(options = {}) {
      const lines = [];
      for (const [k, v] of Object.entries(this._headers)) {
        lines.push(`[${k} "${v}"]`);
      }
      if (lines.length > 0) lines.push('');

      const moves = this._history.map(s => s.san);
      let moveText = '';
      for (let i = 0; i < moves.length; i++) {
        if (i % 2 === 0) moveText += `${Math.floor(i / 2) + 1}. `;
        moveText += moves[i] + ' ';
      }
      let result = this._headers.Result || '*';
      if (this.isCheckmate()) result = this._turn === 'w' ? '0-1' : '1-0';
      else if (this.isDraw()) result = '1/2-1/2';
      moveText += result;
      lines.push(moveText.trim());
      return lines.join('\n');
    }

    loadPgn(pgnStr) {
      if (typeof pgnStr !== 'string') throw new Error('Invalid PGN');
      this.reset();
      const lines = pgnStr.replace(/\r\n/g, '\n').split('\n');
      const bodyLines = [];
      for (const line of lines) {
        const m = line.match(/^\[([A-Za-z0-9_]+)\s+"(.*)"\]$/);
        if (m) {
          this._headers[m[1]] = m[2];
        } else {
          bodyLines.push(line);
        }
      }
      if (this._headers.FEN) {
        this.load(this._headers.FEN);
      }

      let body = bodyLines.join(' ');
      // Strip comments { ... } and ; ...
      body = body.replace(/\{[^}]*\}/g, ' ');
      // Strip nested variations ( ... )
      let prev;
      do {
        prev = body;
        body = body.replace(/\([^()]*\)/g, ' ');
      } while (body !== prev);

      // Strip NAGs ($1, etc.) and move numbers (1., 1...)
      body = body.replace(/\$\d+/g, ' ').replace(/\d+\.+/g, ' ');
      const tokens = body.trim().split(/\s+/).filter(Boolean);
      const results = new Set(['1-0', '0-1', '1/2-1/2', '*']);

      for (const tok of tokens) {
        if (results.has(tok)) break;
        const res = this.move(tok);
        if (!res) {
          throw new Error(`Illegal PGN move: ${tok}`);
        }
      }
      return true;
    }

    perft(depth) {
      if (depth <= 0) return 1;
      const pseudo = this._generatePseudoMoves();
      const us = this._turn;
      if (depth === 1) {
        let count = 0;
        for (const m of pseudo) {
          const st = this._makeRawMove(m);
          if (!this.inCheck(us)) count++;
          this._unmakeRawMove(st);
        }
        return count;
      }
      let nodes = 0;
      for (const m of pseudo) {
        const st = this._makeRawMove(m);
        if (!this.inCheck(us)) {
          nodes += this.perft(depth - 1);
        }
        this._unmakeRawMove(st);
      }
      return nodes;
    }
  }

  Chess.DEFAULT_POSITION = DEFAULT_POSITION;
  return { Chess };
});

/**
 * Grandmaster Companion Pro — Dedicated UCI Chess Engine Web Worker
 * Implements full UCI protocol: uci, isready, ucinewgame, position, go, stop, quit, setoption.
 * Supports MultiPV, Hash, Threads (reported), Skill Level, depth/movetime/clock-based search.
 *
 * Architecture:
 * - Runs in a dedicated Web Worker (never blocks main UI thread).
 * - Also usable in Node.js for automated UCI protocol & search testing.
 * - Includes an original high-strength Alpha-Beta + PVS + Transposition Table + Quiescence +
 *   Tapered PeSTO Evaluation fallback engine, clearly identified as built-in when Stockfish WASM
 *   is not bundled locally.
 */
(function () {
  'use strict';

  const isWorker = typeof self !== 'undefined' && typeof self.importScripts === 'function';
  let ChessCtor = null;

  if (isWorker) {
    try {
      
      ChessCtor = self.Chess;
    } catch (e) {
      // Fallback if relative path differs
      
      ChessCtor = self.Chess;
    }
  } else if (typeof require === 'function') {
    ChessCtor = require('chess-rules-inlined').Chess;
  }

  // Piece values (centipawns) — Middlegame & Endgame
  const MG_VAL = { p: 82, n: 337, b: 365, r: 477, q: 1025, k: 0 };
  const EG_VAL = { p: 94, n: 281, b: 297, r: 512, q: 936, k: 0 };
  const PHASE_W = { p: 0, n: 1, b: 1, r: 2, q: 4, k: 0 };

  // PeSTO-inspired Piece-Square Tables (rank 8 down to rank 1 for White)
  const MG_PST = {
    p: [
       0,  0,  0,  0,  0,  0,  0,  0,
      98,134, 61, 95, 68,126, 34,-11,
      -6,  7, 26, 31, 65, 56, 25,-20,
     -14, 13,  6, 21, 23, 12, 17,-23,
     -27, -2, -5, 12, 17,  6, 10,-25,
     -26, -4, -4,-10,  3,  3, 33,-12,
     -35, -1,-20,-23,-15, 24, 38,-22,
       0,  0,  0,  0,  0,  0,  0,  0
    ],
    n: [
     -167,-89,-34,-49, 61,-97,-15,-107,
      -73,-41, 72, 36, 23, 62,  7, -17,
      -47, 60, 37, 65, 84,129, 73,  44,
       -9, 17, 19, 53, 37, 69, 18,  22,
      -13,  4, 16, 13, 28, 19, 21,  -8,
      -23, -9, 12, 10, 19, 17, 25, -16,
      -29,-53,-12, -3, -1, 18,-14, -19,
     -105,-21,-58,-33,-17,-28,-19, -23
    ],
    b: [
      -29,  4,-82,-37,-25,-42,  7, -8,
      -26, 16,-18,-13, 30, 59, 18,-47,
      -16, 37, 43, 40, 35, 50, 37, -2,
       -4,  5, 19, 50, 37, 37,  7, -2,
       -6, 13, 13, 26, 34, 12, 10,  4,
        0, 15, 15, 15, 14, 27, 18, 10,
        4, 15, 16,  0,  7, 21, 33,  1,
      -33, -3,-14,-21,-13,-12,-39,-21
    ],
    r: [
       32, 42, 32, 51, 63,  9, 31, 43,
       27, 32, 58, 62, 80, 67, 26, 44,
       -5, 19, 26, 36, 17, 45, 61, 16,
      -24,-11,  7, 26, 24, 35, -8,-20,
      -36,-26,-12, -1,  9, -7,  6,-23,
      -45,-25,-16,-17,  3,  0, -5,-33,
      -44,-16,-20, -9, -1, 11, -6,-71,
      -19,-13,  1, 17, 16,  7,-37,-26
    ],
    q: [
      -28,  0, 29, 12, 59, 44, 43, 45,
      -24,-39, -5,  1,-16, 57, 28, 54,
      -13,-17,  7,  8, 29, 56, 47, 57,
      -27,-27,-16,-16, -1, 17, -2,  1,
       -9,-26, -9,-10, -2, -4,  3, -3,
      -14,  2,-11, -2, -5,  2, 14,  5,
      -35, -8, 11,  2,  8, 15, -3,  1,
       -1,-18, -9, 10,-15,-25,-31,-50
    ],
    k: [
      -65, 23, 16,-15,-56,-34,  2, 13,
       29, -1,-20, -7, -8, -4,-38,-29,
       -9, 24,  2,-16,-20,  6, 22,-22,
      -17,-20,-12,-27,-30,-25,-14,-36,
      -49, -1,-27,-39,-46,-44,-33,-51,
      -14,-14,-22,-46,-44,-30,-15,-27,
        1,  7, -8,-64,-43,-16,  9,  8,
      -15, 36, 12,-54,  8,-28, 24, 14
    ]
  };

  const EG_PST = {
    p: [
       0,  0,  0,  0,  0,  0,  0,  0,
     178,173,158,134,147,132,165,187,
      94,100, 85, 67, 56, 53, 82, 84,
      32, 24, 13,  5, -2,  4, 17, 17,
      13,  9, -3, -7, -7, -8,  3, -1,
       4,  7, -6,  1,  0, -5, -1, -8,
      13,  8,  8, 10, 13,  0,  2, -7,
       0,  0,  0,  0,  0,  0,  0,  0
    ],
    n: [
      -58,-38,-13,-28,-31,-27,-63,-99,
      -25, -8,-25, -2, -9,-25,-24,-52,
      -24,-20, 10,  9, -1, -9,-19,-41,
      -17,  3, 22, 22, 22, 11,  8,-18,
      -18, -6, 16, 25, 16, 17,  4,-18,
      -23, -3, -1, 15, 10, -3,-20,-22,
      -42,-20,-10, -5, -2,-20,-23,-44,
      -29,-51,-23,-15,-22,-18,-50,-64
    ],
    b: [
      -14,-21,-11, -8, -7, -9,-17,-24,
       -8, -4,  7,-12, -3,-13, -4,-14,
        2, -8,  0, -1, -2,  6,  0,  4,
       -3,  9, 12,  9, 14, 10,  3,  2,
       -6,  3, 13, 19,  7, 10, -3, -9,
      -12, -3,  8, 10, 13,  3, -7,-15,
      -14,-18, -7, -1,  4, -9,-15,-27,
      -23, -9,-23, -5, -9,-16, -5,-17
    ],
    r: [
       13, 10, 18, 15, 12, 12,  8,  5,
       11, 13, 13, 11,-33,  3,  7,  7,
        7,  7,  7,  5,  4, -3, -5, -3,
        4,  3, 13,  1,  2,  1, -1,  2,
        3,  5,  8,  4, -5, -6, -8,-11,
       -4,  0, -5, -1, -7,-12, -8,-16,
       -6, -6,  0,  2, -9, -9,-11, -3,
       -9,  2,  3, -1, -5,-13,  4,-20
    ],
    q: [
       -9, 22, 22, 27, 27, 19, 10, 20,
      -17, 20, 32, 41, 58, 25, 30,  0,
      -20,  6,  9, 49, 47, 35, 19,  9,
        3, 22, 24, 45, 57, 40, 57, 36,
      -18, 28, 19, 47, 31, 34, 39, 23,
      -16,-27, 15,  6,  9, 17, 10,  5,
      -22,-23,-30,-16,-16,-23,-36,-32,
      -33,-28,-22,-43, -5,-32,-20,-41
    ],
    k: [
      -74,-35,-18,-18,-11, 15,  4,-17,
      -12, 17, 14, 17, 17, 38, 23, 11,
       10, 17, 23, 15, 20, 45, 44, 13,
       -8, 22, 24, 27, 26, 33, 26,  3,
      -18, -4, 21, 24, 27, 23,  9,-11,
      -19, -3, 11, 21, 23, 16,  7, -9,
      -27,-11,  4, 13, 14,  4, -5,-17,
      -53,-33,-21,-11,-28,-14,-24,-43
    ]
  };

  const MVV_VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
  const INF = 30000;
  const MATE_SCORE = 29000;

  class GMProEngine {
    constructor(emit) {
      this.emit = emit;
      this.chess = new ChessCtor();
      this.options = {
        MultiPV: 1,
        Hash: 32,
        Threads: 1,
        'Skill Level': 20
      };
      this.tt = new Map();
      this.killers = Array.from({ length: 64 }, () => [null, null]);
      this.history = new Map();
      this.stopRequested = false;
      this.nodes = 0;
      this.seldepth = 0;
      this.startTime = 0;
      this.timeLimit = 1000;
      this.nodeLimit = Infinity;
    }

    maxTTEntries() {
      return Math.max(8192, Math.min(200000, this.options.Hash * 2048));
    }

    evaluate() {
      const b = this.chess._board;
      let mgW = 0, mgB = 0, egW = 0, egB = 0, phase = 0;
      let wBishops = 0, bBishops = 0;

      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const p = b[r][c];
          if (!p) continue;
          phase += PHASE_W[p.type];
          const idx = p.color === 'w' ? r * 8 + c : (7 - r) * 8 + c;
          if (p.color === 'w') {
            mgW += MG_VAL[p.type] + MG_PST[p.type][idx];
            egW += EG_VAL[p.type] + EG_PST[p.type][idx];
            if (p.type === 'b') wBishops++;
          } else {
            mgB += MG_VAL[p.type] + MG_PST[p.type][idx];
            egB += EG_VAL[p.type] + EG_PST[p.type][idx];
            if (p.type === 'b') bBishops++;
          }
        }
      }

      if (wBishops >= 2) { mgW += 30; egW += 45; }
      if (bBishops >= 2) { mgB += 30; egB += 45; }

      const clampedPhase = Math.min(24, phase);
      const mgScore = mgW - mgB;
      const egScore = egW - egB;
      const score = Math.round((mgScore * clampedPhase + egScore * (24 - clampedPhase)) / 24);
      return this.chess.turn() === 'w' ? score : -score;
    }

    scoreMove(m, ttMove, ply) {
      const uci = m.from + m.to + (m.promotion || '');
      if (ttMove && uci === ttMove) return 1000000;
      if (m.captured) {
        return 100000 + MVV_VAL[m.captured] * 10 - MVV_VAL[m.piece];
      }
      if (m.promotion) return 95000 + MVV_VAL[m.promotion];
      if (this.killers[ply]) {
        if (this.killers[ply][0] === uci) return 80000;
        if (this.killers[ply][1] === uci) return 79000;
      }
      return this.history.get(uci) || 0;
    }

    orderMoves(moves, ttMove, ply) {
      moves.sort((a, b) => this.scoreMove(b, ttMove, ply) - this.scoreMove(a, ttMove, ply));
      return moves;
    }

    checkTime() {
      if ((this.nodes & 1023) === 0) {
        if (Date.now() - this.startTime >= this.timeLimit || this.nodes >= this.nodeLimit) {
          this.stopRequested = true;
        }
      }
      return this.stopRequested;
    }

    quiescence(alpha, beta, ply) {
      this.nodes++;
      if (ply > this.seldepth) this.seldepth = ply;
      if (this.checkTime()) return 0;

      const standPat = this.evaluate();
      if (standPat >= beta) return beta;
      if (alpha < standPat) alpha = standPat;
      if (ply >= 36) return alpha;

      const us = this.chess.turn();
      const pseudo = this.chess._generatePseudoMoves();
      const captures = [];
      for (const m of pseudo) {
        if (m.captured || m.promotion) captures.push(m);
      }
      this.orderMoves(captures, null, ply);

      for (const m of captures) {
        const st = this.chess._makeRawMove(m);
        if (this.chess.inCheck(us)) {
          this.chess._unmakeRawMove(st);
          continue;
        }
        const score = -this.quiescence(-beta, -alpha, ply + 1);
        this.chess._unmakeRawMove(st);
        if (this.stopRequested) return 0;
        if (score >= beta) return beta;
        if (score > alpha) alpha = score;
      }
      return alpha;
    }

    alphabeta(depth, alpha, beta, ply, allowNull) {
      if (this.checkTime()) return 0;
      if (ply > this.seldepth) this.seldepth = ply;

      if (this.chess.isFiftyMoveDraw() || this.chess.isThreefoldRepetition() || this.chess.isInsufficientMaterial()) {
        return 0;
      }

      const inCheck = this.chess.inCheck();
      if (inCheck && depth < 1) depth = 1;
      if (depth <= 0) return this.quiescence(alpha, beta, ply);

      this.nodes++;
      const key = this.chess._positionKey();
      const ttEntry = this.tt.get(key);
      let ttMove = null;
      if (ttEntry) {
        ttMove = ttEntry.move;
        if (ttEntry.depth >= depth && ply > 0) {
          if (ttEntry.flag === 0) return ttEntry.score;
          if (ttEntry.flag === 1 && ttEntry.score >= beta) return ttEntry.score;
          if (ttEntry.flag === 2 && ttEntry.score <= alpha) return ttEntry.score;
        }
      }

      // Null-move pruning
      if (allowNull && !inCheck && depth >= 3 && ply > 0) {
        const prevTurn = this.chess._turn;
        const prevEp = this.chess._ep;
        this.chess._turn = prevTurn === 'w' ? 'b' : 'w';
        this.chess._ep = null;
        const R = depth >= 6 ? 3 : 2;
        const nullScore = -this.alphabeta(depth - 1 - R, -beta, -beta + 1, ply + 1, false);
        this.chess._turn = prevTurn;
        this.chess._ep = prevEp;
        if (this.stopRequested) return 0;
        if (nullScore >= beta) return beta;
      }

      const us = this.chess.turn();
      const pseudo = this.chess._generatePseudoMoves();
      this.orderMoves(pseudo, ttMove, ply);

      let legalCount = 0;
      let bestScore = -INF;
      let bestMoveUci = null;
      const origAlpha = alpha;

      for (const m of pseudo) {
        const st = this.chess._makeRawMove(m);
        if (this.chess.inCheck(us)) {
          this.chess._unmakeRawMove(st);
          continue;
        }
        legalCount++;

        let score;
        if (legalCount === 1) {
          score = -this.alphabeta(depth - 1, -beta, -alpha, ply + 1, true);
        } else {
          // Late Move Reduction
          let reduction = 0;
          if (depth >= 3 && legalCount >= 4 && !inCheck && !m.captured && !m.promotion) {
            reduction = 1;
          }
          score = -this.alphabeta(depth - 1 - reduction, -alpha - 1, -alpha, ply + 1, true);
          if (score > alpha && (reduction > 0 || score < beta)) {
            score = -this.alphabeta(depth - 1, -beta, -alpha, ply + 1, true);
          }
        }

        this.chess._unmakeRawMove(st);
        if (this.stopRequested) return 0;

        if (score > bestScore) {
          bestScore = score;
          bestMoveUci = m.from + m.to + (m.promotion || '');
        }
        if (score > alpha) {
          alpha = score;
          if (!m.captured && this.killers[ply]) {
            this.history.set(bestMoveUci, (this.history.get(bestMoveUci) || 0) + depth * depth);
          }
        }
        if (alpha >= beta) {
          if (!m.captured && this.killers[ply]) {
            this.killers[ply][1] = this.killers[ply][0];
            this.killers[ply][0] = bestMoveUci;
          }
          break;
        }
      }

      if (legalCount === 0) {
        return inCheck ? -MATE_SCORE + ply : 0;
      }

      if (this.tt.size >= this.maxTTEntries()) {
        this.tt.clear();
      }
      const flag = bestScore <= origAlpha ? 2 : bestScore >= beta ? 1 : 0;
      this.tt.set(key, { depth, score: bestScore, flag, move: bestMoveUci });
      return bestScore;
    }

    extractPV(maxLen = 8) {
      const pv = [];
      const seen = new Set();
      const undoStack = [];
      for (let i = 0; i < maxLen; i++) {
        const key = this.chess._positionKey();
        if (seen.has(key)) break;
        seen.add(key);
        const entry = this.tt.get(key);
        if (!entry || !entry.move) break;
        const res = this.chess.move(entry.move);
        if (!res) break;
        pv.push(entry.move);
        undoStack.push(res);
      }
      while (undoStack.length > 0) {
        this.chess.undo();
        undoStack.pop();
      }
      return pv;
    }

    formatScore(score) {
      if (Math.abs(score) >= MATE_SCORE - 100) {
        const pliesToMate = MATE_SCORE - Math.abs(score);
        const movesToMate = Math.ceil(pliesToMate / 2);
        return `mate ${score > 0 ? movesToMate : -movesToMate}`;
      }
      return `cp ${score}`;
    }

    search(params) {
      this.stopRequested = false;
      this.nodes = 0;
      this.seldepth = 0;
      this.startTime = Date.now();
      this.history.clear();

      const maxDepth = Math.min(20, params.depth || 12);
      this.nodeLimit = params.nodes || Infinity;

      if (params.movetime) {
        this.timeLimit = params.movetime;
      } else if (params.wtime || params.btime) {
        const myTime = this.chess.turn() === 'w' ? (params.wtime || 60000) : (params.btime || 60000);
        const myInc = this.chess.turn() === 'w' ? (params.winc || 0) : (params.binc || 0);
        this.timeLimit = Math.max(80, Math.min(5000, Math.floor(myTime / 28 + myInc * 0.75)));
      } else if (params.infinite) {
        this.timeLimit = 30000;
      } else {
        this.timeLimit = 1200;
      }

      const legal = this.chess.moves({ verbose: true });
      if (legal.length === 0) {
        this.emit('bestmove (none)');
        return;
      }

      const multiPV = Math.min(this.options.MultiPV || 1, legal.length);
      let globalBestUci = legal[0].uci;

      for (let d = 1; d <= maxDepth; d++) {
        const excluded = new Set();
        const pvResults = [];

        for (let pvIdx = 1; pvIdx <= multiPV; pvIdx++) {
          let bestUci = null;
          let bestScore = -INF;
          const ordered = this.orderMoves([...legal].filter(m => !excluded.has(m.uci)), pvIdx === 1 ? globalBestUci : null, 0);

          for (const m of ordered) {
            const st = this.chess._makeRawMove(m);
            const score = -this.alphabeta(d - 1, -INF, INF, 1, true);
            this.chess._unmakeRawMove(st);
            if (this.stopRequested) break;
            if (score > bestScore) {
              bestScore = score;
              bestUci = m.uci;
            }
          }
          if (this.stopRequested || !bestUci) break;
          excluded.add(bestUci);
          if (pvIdx === 1) globalBestUci = bestUci;

          // Build PV starting with bestUci
          const mvRes = this.chess.move(bestUci);
          const tail = mvRes ? this.extractPV(7) : [];
          if (mvRes) this.chess.undo();

          pvResults.push({
            pvIdx,
            score: bestScore,
            pv: [bestUci, ...tail]
          });
        }

        if (this.stopRequested && d > 1) break;

        const elapsed = Math.max(1, Date.now() - this.startTime);
        const nps = Math.round((this.nodes * 1000) / elapsed);
        for (const r of pvResults) {
          this.emit(
            `info depth ${d} seldepth ${this.seldepth} multipv ${r.pvIdx} score ${this.formatScore(r.score)} nodes ${this.nodes} nps ${nps} time ${elapsed} pv ${r.pv.join(' ')}`
          );
        }

        // Early exit if forced mate found at shallow depth or time > 55% of budget
        if (pvResults[0] && Math.abs(pvResults[0].score) >= MATE_SCORE - 20 && d >= 4) break;
        if (Date.now() - this.startTime > this.timeLimit * 0.55) break;
      }

      this.emit(`bestmove ${globalBestUci}`);
    }

    handleCommand(cmdLine) {
      const line = (cmdLine || '').trim();
      if (!line) return;
      const tokens = line.split(/\s+/);
      const cmd = tokens[0];

      if (cmd === 'uci') {
        this.emit('id name GM-Pro Tactical Engine (Built-in Alpha-Beta/TT; not Stockfish; weaker built-in fallback)');
        this.emit('id author Grandmaster Companion Pro');
        this.emit('option name MultiPV type spin default 1 min 1 max 5');
        this.emit('option name Hash type spin default 32 min 4 max 256');
        this.emit('option name Threads type spin default 1 min 1 max 4');
        this.emit('option name Skill Level type spin default 20 min 0 max 20');
        this.emit('uciok');
      } else if (cmd === 'isready') {
        this.emit('readyok');
      } else if (cmd === 'ucinewgame') {
        this.tt.clear();
        this.history.clear();
        this.chess.reset();
      } else if (cmd === 'setoption') {
        const nameIdx = tokens.indexOf('name');
        const valIdx = tokens.indexOf('value');
        if (nameIdx !== -1 && valIdx !== -1 && valIdx > nameIdx + 1) {
          const optName = tokens.slice(nameIdx + 1, valIdx).join(' ');
          const optVal = parseInt(tokens[valIdx + 1], 10);
          if (!Number.isNaN(optVal) && Object.prototype.hasOwnProperty.call(this.options, optName)) {
            this.options[optName] = optVal;
          }
        }
      } else if (cmd === 'position') {
        let idx = 1;
        if (tokens[idx] === 'startpos') {
          this.chess.reset();
          idx++;
        } else if (tokens[idx] === 'fen') {
          idx++;
          const fenParts = [];
          while (idx < tokens.length && tokens[idx] !== 'moves') {
            fenParts.push(tokens[idx++]);
          }
          try {
            this.chess.load(fenParts.join(' '));
          } catch (e) {
            this.emit(`info string error invalid fen: ${e.message}`);
            return;
          }
        }
        if (tokens[idx] === 'moves') {
          idx++;
          while (idx < tokens.length) {
            this.chess.move(tokens[idx++]);
          }
        }
      } else if (cmd === 'go') {
        const params = {};
        for (let i = 1; i < tokens.length; i++) {
          const k = tokens[i];
          if (k === 'infinite') params.infinite = true;
          else if (['movetime', 'depth', 'wtime', 'btime', 'winc', 'binc', 'nodes'].includes(k) && tokens[i + 1]) {
            params[k] = parseInt(tokens[++i], 10);
          }
        }
        this.search(params);
      } else if (cmd === 'stop') {
        this.stopRequested = true;
      } else if (cmd === 'quit') {
        this.stopRequested = true;
        if (isWorker && typeof self.close === 'function') {
          self.close();
        }
      }
    }
  }

  if (isWorker) {
    const engine = new GMProEngine(msg => self.postMessage(msg));
    self.onmessage = function (e) {
      engine.handleCommand(typeof e.data === 'string' ? e.data : '');
    };
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = { GMProEngine };
  }
})();
