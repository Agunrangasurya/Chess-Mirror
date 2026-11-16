/* -------------------- Local FIDE Chess Rules Engine -------------------- */
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
    return (c === -1 || r === -1) ? null : [r, c];
  }
  function rcToSq(r, c) { return FILES[c] + RANKS[r]; }
  function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
  function oppColor(c) { return c === 'w' ? 'b' : 'w'; }

  class Chess {
    constructor(fen = DEFAULT_POSITION) { this._headers = {}; this.load(fen); }
    reset() { this._headers = {}; return this.load(DEFAULT_POSITION); }
    load(fen) {
      if (typeof fen !== 'string') throw new Error('Invalid FEN');
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
          if (ch >= '1' && ch <= '8') c += parseInt(ch, 10);
          else {
            const lower = ch.toLowerCase();
            if (!PIECE_TYPES.includes(lower) || c >= 8) throw new Error('Invalid FEN piece');
            const color = ch === lower ? 'b' : 'w';
            if (lower === 'k') { if (color === 'w') wk++; else bk++; }
            board[r][c] = { type: lower, color };
            c++;
          }
        }
        if (c !== 8) throw new Error('Invalid FEN rank length');
      }
      if (wk !== 1 || bk !== 1) throw new Error('Invalid FEN kings');
      this._board = board;
      this._turn = turn;
      this._castling = { w: { k: castling.includes('K'), q: castling.includes('Q') }, b: { k: castling.includes('k'), q: castling.includes('q') } };
      this._ep = ep === '-' ? null : ep;
      this._halfMoves = parseInt(halfStr, 10) || 0;
      this._fullMoves = parseInt(fullStr, 10) || 1;
      this._history = [];
      this._positionCounts = {};
      this._recordPosition();
      return true;
    }
    _positionKey() { return this.fen().split(' ').slice(0, 4).join(' '); }
    _recordPosition() { const k = this._positionKey(); this._positionCounts[k] = (this._positionCounts[k] || 0) + 1; }
    _unrecordPosition(k) { if (this._positionCounts[k]) { this._positionCounts[k]--; if (this._positionCounts[k] <= 0) delete this._positionCounts[k]; } }
    fen() {
      let placement = '';
      for (let r = 0; r < 8; r++) {
        let empty = 0;
        for (let c = 0; c < 8; c++) {
          const p = this._board[r][c];
          if (!p) empty++;
          else {
            if (empty > 0) { placement += empty; empty = 0; }
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
      return `${placement} ${this._turn} ${cStr || '-'} ${this._ep || '-'} ${this._halfMoves} ${this._fullMoves}`;
    }
    turn() { return this._turn; }
    board() { return this._board.map((row, r) => row.map((p, c) => (p ? { square: rcToSq(r, c), type: p.type, color: p.color } : null))); }
    get(sq) { const rc = sqToRC(sq); if (!rc) return null; const p = this._board[rc[0]][rc[1]]; return p ? { type: p.type, color: p.color } : null; }
    _findKing(color) {
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const p = this._board[r][c]; if (p && p.color === color && p.type === 'k') return [r, c]; }
      return null;
    }
    isSquareAttacked(sq, byColor) {
      const rc = typeof sq === 'string' ? sqToRC(sq) : sq;
      if (!rc) return false;
      const [tr, tc] = rc;
      const pawnRow = byColor === 'w' ? tr + 1 : tr - 1;
      if (pawnRow >= 0 && pawnRow < 8) {
        for (const dc of [-1, 1]) {
          const pc = tc + dc;
          if (pc >= 0 && pc < 8) { const p = this._board[pawnRow][pc]; if (p && p.color === byColor && p.type === 'p') return true; }
        }
      }
      for (const [dr, dc] of KNIGHT_DELTAS) { const r = tr + dr, c = tc + dc; if (inBounds(r, c)) { const p = this._board[r][c]; if (p && p.color === byColor && p.type === 'n') return true; } }
      for (const [dr, dc] of QUEEN_DELTAS) { const r = tr + dr, c = tc + dc; if (inBounds(r, c)) { const p = this._board[r][c]; if (p && p.color === byColor && p.type === 'k') return true; } }
      for (const [dr, dc] of BISHOP_DELTAS) {
        let r = tr + dr, c = tc + dc;
        while (inBounds(r, c)) { const p = this._board[r][c]; if (p) { if (p.color === byColor && (p.type === 'b' || p.type === 'q')) return true; break; } r += dr; c += dc; }
      }
      for (const [dr, dc] of ROOK_DELTAS) {
        let r = tr + dr, c = tc + dc;
        while (inBounds(r, c)) { const p = this._board[r][c]; if (p) { if (p.color === byColor && (p.type === 'r' || p.type === 'q')) return true; break; } r += dr; c += dc; }
      }
      return false;
    }
    inCheck(color = this._turn) { const k = this._findKing(color); return k ? this.isSquareAttacked(k, oppColor(color)) : false; }
    _generatePseudoMoves(onlySquare = null) {
      const moves = [], us = this._turn, them = oppColor(us), filterRC = onlySquare ? sqToRC(onlySquare) : null;
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          if (filterRC && (filterRC[0] !== r || filterRC[1] !== c)) continue;
          const p = this._board[r][c];
          if (!p || p.color !== us) continue;
          const from = rcToSq(r, c);
          if (p.type === 'p') {
            const dir = us === 'w' ? -1 : 1, startRank = us === 'w' ? 6 : 1, promoRank = us === 'w' ? 0 : 7;
            const r1 = r + dir;
            if (inBounds(r1, c) && !this._board[r1][c]) {
              const to = rcToSq(r1, c);
              if (r1 === promoRank) for (const promo of ['q', 'r', 'b', 'n']) moves.push({ from, to, color: us, piece: 'p', promotion: promo, flags: 'np' });
              else {
                moves.push({ from, to, color: us, piece: 'p', flags: 'n' });
                const r2 = r + 2 * dir;
                if (r === startRank && !this._board[r2][c]) moves.push({ from, to: rcToSq(r2, c), color: us, piece: 'p', flags: 'b' });
              }
            }
            for (const dc of [-1, 1]) {
              const nc = c + dc;
              if (!inBounds(r1, nc)) continue;
              const to = rcToSq(r1, nc), target = this._board[r1][nc];
              if (target && target.color === them) {
                if (r1 === promoRank) for (const promo of ['q', 'r', 'b', 'n']) moves.push({ from, to, color: us, piece: 'p', captured: target.type, promotion: promo, flags: 'cp' });
                else moves.push({ from, to, color: us, piece: 'p', captured: target.type, flags: 'c' });
              } else if (this._ep && to === this._ep) moves.push({ from, to, color: us, piece: 'p', captured: 'p', flags: 'e' });
            }
          } else if (p.type === 'n') {
            for (const [dr, dc] of KNIGHT_DELTAS) {
              const nr = r + dr, nc = c + dc;
              if (!inBounds(nr, nc)) continue;
              const target = this._board[nr][nc];
              if (!target) moves.push({ from, to: rcToSq(nr, nc), color: us, piece: 'n', flags: 'n' });
              else if (target.color === them) moves.push({ from, to: rcToSq(nr, nc), color: us, piece: 'n', captured: target.type, flags: 'c' });
            }
          } else if (p.type === 'b' || p.type === 'r' || p.type === 'q') {
            const deltas = p.type === 'b' ? BISHOP_DELTAS : p.type === 'r' ? ROOK_DELTAS : QUEEN_DELTAS;
            for (const [dr, dc] of deltas) {
              let nr = r + dr, nc = c + dc;
              while (inBounds(nr, nc)) {
                const target = this._board[nr][nc];
                if (!target) moves.push({ from, to: rcToSq(nr, nc), color: us, piece: p.type, flags: 'n' });
                else { if (target.color === them) moves.push({ from, to: rcToSq(nr, nc), color: us, piece: p.type, captured: target.type, flags: 'c' }); break; }
                nr += dr; nc += dc;
              }
            }
          } else if (p.type === 'k') {
            for (const [dr, dc] of QUEEN_DELTAS) {
              const nr = r + dr, nc = c + dc;
              if (!inBounds(nr, nc)) continue;
              const target = this._board[nr][nc];
              if (!target) moves.push({ from, to: rcToSq(nr, nc), color: us, piece: 'k', flags: 'n' });
              else if (target.color === them) moves.push({ from, to: rcToSq(nr, nc), color: us, piece: 'k', captured: target.type, flags: 'c' });
            }
            const homeRank = us === 'w' ? 7 : 0;
            if (r === homeRank && c === 4 && !this.isSquareAttacked([homeRank, 4], them)) {
              if (this._castling[us].k) {
                const rook = this._board[homeRank][7];
                if (rook && rook.color === us && rook.type === 'r' && !this._board[homeRank][5] && !this._board[homeRank][6] && !this.isSquareAttacked([homeRank, 5], them) && !this.isSquareAttacked([homeRank, 6], them))
                  moves.push({ from, to: rcToSq(homeRank, 6), color: us, piece: 'k', flags: 'k' });
              }
              if (this._castling[us].q) {
                const rook = this._board[homeRank][0];
                if (rook && rook.color === us && rook.type === 'r' && !this._board[homeRank][3] && !this._board[homeRank][2] && !this._board[homeRank][1] && !this.isSquareAttacked([homeRank, 3], them) && !this.isSquareAttacked([homeRank, 2], them))
                  moves.push({ from, to: rcToSq(homeRank, 2), color: us, piece: 'k', flags: 'q' });
              }
            }
          }
        }
      }
      return moves;
    }
    _makeRawMove(m) {
      const [fr, fc] = sqToRC(m.from), [tr, tc] = sqToRC(m.to);
      const state = { move: m, castling: { w: { ...this._castling.w }, b: { ...this._castling.b } }, ep: this._ep, halfMoves: this._halfMoves, fullMoves: this._fullMoves, capturedPiece: this._board[tr][tc], epCapturedSq: null };
      const movingPiece = this._board[fr][fc];
      this._board[fr][fc] = null;
      this._board[tr][tc] = m.promotion ? { type: m.promotion, color: m.color } : movingPiece;
      if (m.flags === 'e') { const capR = m.color === 'w' ? tr + 1 : tr - 1; state.epCapturedSq = [capR, tc]; state.capturedPiece = this._board[capR][tc]; this._board[capR][tc] = null; }
      if (m.flags === 'k') { this._board[tr][5] = this._board[tr][7]; this._board[tr][7] = null; }
      else if (m.flags === 'q') { this._board[tr][3] = this._board[tr][0]; this._board[tr][0] = null; }
      if (movingPiece.type === 'k') { this._castling[m.color].k = false; this._castling[m.color].q = false; }
      if (movingPiece.type === 'r') { if (m.from === 'h1') this._castling.w.k = false; if (m.from === 'a1') this._castling.w.q = false; if (m.from === 'h8') this._castling.b.k = false; if (m.from === 'a8') this._castling.b.q = false; }
      if (m.to === 'h1') this._castling.w.k = false; if (m.to === 'a1') this._castling.w.q = false; if (m.to === 'h8') this._castling.b.k = false; if (m.to === 'a8') this._castling.b.q = false;
      this._ep = m.flags === 'b' ? rcToSq((fr + tr) / 2, fc) : null;
      this._halfMoves = (movingPiece.type === 'p' || m.captured) ? 0 : this._halfMoves + 1;
      if (m.color === 'b') this._fullMoves++;
      this._turn = oppColor(this._turn);
      return state;
    }
    _unmakeRawMove(state) {
      const m = state.move;
      const [fr, fc] = sqToRC(m.from), [tr, tc] = sqToRC(m.to);
      this._turn = m.color; this._castling = state.castling; this._ep = state.ep; this._halfMoves = state.halfMoves; this._fullMoves = state.fullMoves;
      const moved = this._board[tr][tc];
      this._board[fr][fc] = m.promotion ? { type: 'p', color: m.color } : moved;
      if (m.flags === 'e') { this._board[tr][tc] = null; this._board[state.epCapturedSq[0]][state.epCapturedSq[1]] = state.capturedPiece; }
      else this._board[tr][tc] = state.capturedPiece;
      if (m.flags === 'k') { this._board[tr][7] = this._board[tr][5]; this._board[tr][5] = null; }
      else if (m.flags === 'q') { this._board[tr][0] = this._board[tr][3]; this._board[tr][3] = null; }
    }
    _computeSan(m, allLegalMoves) {
      if (m.flags === 'k') return 'O-O';
      if (m.flags === 'q') return 'O-O-O';
      let san = '';
      if (m.piece !== 'p') {
        san += m.piece.toUpperCase();
        const sameTarget = allLegalMoves.filter(x => x.piece === m.piece && x.to === m.to && x.from !== m.from);
        if (sameTarget.length > 0) {
          const sameFile = sameTarget.some(x => x.from[0] === m.from[0]);
          const sameRank = sameTarget.some(x => x.from[1] === m.from[1]);
          if (!sameFile) san += m.from[0];
          else if (!sameRank) san += m.from[1];
          else san += m.from;
        }
      } else if (m.captured) san += m.from[0];
      if (m.captured) san += 'x';
      san += m.to;
      if (m.promotion) san += '=' + m.promotion.toUpperCase();
      const st = this._makeRawMove(m);
      if (this.inCheck()) san += this._hasAnyLegalMove() ? '+' : '#';
      this._unmakeRawMove(st);
      return san;
    }
    _hasAnyLegalMove() {
      const pseudo = this._generatePseudoMoves(), us = this._turn;
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
      const pseudo = this._generatePseudoMoves(sq), us = this._turn, legal = [];
      for (const m of pseudo) {
        const st = this._makeRawMove(m);
        if (!this.inCheck(us)) legal.push(m);
        this._unmakeRawMove(st);
      }
      let fullLegal = legal;
      if (sq && options.verbose) {
        fullLegal = [];
        for (const m of this._generatePseudoMoves(null)) {
          const st = this._makeRawMove(m);
          if (!this.inCheck(us)) fullLegal.push(m);
          this._unmakeRawMove(st);
        }
      }
      if (options.verbose) {
        return legal.map(m => ({ ...m, uci: m.from + m.to + (m.promotion || ''), san: this._computeSan(m, fullLegal) }));
      }
      return legal.map(m => this._computeSan(m, fullLegal));
    }
    move(input) {
      const legalMoves = this.moves({ verbose: true });
      let chosen = null;
      if (typeof input === 'string') {
        const trimmed = input.trim();
        if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(trimmed)) chosen = legalMoves.find(m => m.uci === trimmed);
        if (!chosen) {
          const clean = trimmed.replace(/[!?]+/g, '').replace(/0-0-0/g, 'O-O-O').replace(/0-0/g, 'O-O');
          chosen = legalMoves.find(m => m.san === clean) || legalMoves.find(m => m.san.replace(/[+#]$/, '') === clean.replace(/[+#]$/, ''));
        }
      } else if (input && typeof input === 'object') {
        const promo = input.promotion ? input.promotion.toLowerCase() : undefined;
        chosen = legalMoves.find(m => m.from === input.from && m.to === input.to && (!m.promotion || m.promotion === (promo || 'q')));
      }
      if (!chosen) return null;
      const state = this._makeRawMove(chosen);
      state.positionKey = this._positionKey();
      this._recordPosition();
      state.san = chosen.san;
      state.uci = chosen.uci;
      this._history.push(state);
      return chosen;
    }
    undo() {
      if (!this._history.length) return null;
      const state = this._history.pop();
      this._unrecordPosition(state.positionKey);
      this._unmakeRawMove(state);
      return { ...state.move, san: state.san, uci: state.uci };
    }
    history(options = {}) {
      return options.verbose ? this._history.map(s => ({ ...s.move, san: s.san, uci: s.uci })) : this._history.map(s => s.san);
    }
    isCheckmate() { return this.inCheck() && !this._hasAnyLegalMove(); }
    isStalemate() { return !this.inCheck() && !this._hasAnyLegalMove(); }
    isThreefoldRepetition() { return (this._positionCounts[this._positionKey()] || 0) >= 3; }
    isInsufficientMaterial() {
      const p = { w: [], b: [] };
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const x = this._board[r][c]; if (x && x.type !== 'k') p[x.color].push({ type: x.type, colorSq: (r + c) % 2 }); }
      if (!p.w.length && !p.b.length) return true;
      if (!p.w.length && p.b.length === 1 && ['n', 'b'].includes(p.b[0].type)) return true;
      if (!p.b.length && p.w.length === 1 && ['n', 'b'].includes(p.w[0].type)) return true;
      return false;
    }
    isFiftyMoveDraw() { return this._halfMoves >= 100; }
    isDraw() { return this.isStalemate() || this.isFiftyMoveDraw() || this.isThreefoldRepetition() || this.isInsufficientMaterial(); }
    isGameOver() { return this.isCheckmate() || this.isDraw(); }
    pgn() {
      const lines = [];
      for (const [k, v] of Object.entries(this._headers)) lines.push(`[${k} "${v}"]`);
      if (lines.length) lines.push('');
      const moves = this._history.map(s => s.san);
      let moveText = '';
      for (let i = 0; i < moves.length; i++) {
        if (i % 2 === 0) moveText += `${Math.floor(i / 2) + 1}. `;
        moveText += moves[i] + ' ';
      }
      let result = this._headers.Result || '*';
      if (this.isCheckmate()) result = this._turn === 'w' ? '0-1' : '1-0';
      else if (this.isDraw()) result = '1/2-1/2';
      lines.push((moveText + result).trim());
      return lines.join('\n');
    }
    loadPgn(pgnStr) {
      if (typeof pgnStr !== 'string') throw new Error('Invalid PGN');
      this.reset();
      const lines = pgnStr.replace(/\r\n/g, '\n').split('\n');
      const bodyLines = [];
      for (const line of lines) {
        const m = line.match(/^\[([A-Za-z0-9_]+)\s+"(.*)"\]$/);
        if (m) this._headers[m[1]] = m[2];
        else bodyLines.push(line);
      }
      if (this._headers.FEN) this.load(this._headers.FEN);
      let body = bodyLines.join(' ').replace(/\{[^}]*\}/g, ' ');
      let prev;
      do { prev = body; body = body.replace(/\([^()]*\)/g, ' '); } while (body !== prev);
      body = body.replace(/\$\d+/g, ' ').replace(/\d+\.+/g, ' ');
      const tokens = body.trim().split(/\s+/).filter(Boolean);
      const results = new Set(['1-0', '0-1', '1/2-1/2', '*']);
      for (const tok of tokens) {
        if (results.has(tok)) break;
        if (!this.move(tok)) throw new Error(`Illegal PGN move: ${tok}`);
      }
      return true;
    }
  }

  
self.Chess = Chess;
