import {
  BoardGrid,
  BoardPiece,
  LegalMoveOption,
  MatchTerminalStatus,
  MovementPattern,
  PieceType,
  PlayerSide,
  RulesetDocument,
  SquareCoord,
} from '../types/game';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

export function coordToAlgebraic(coord: SquareCoord): string {
  const file = FILES[coord.col] ?? 'a';
  const rank = 8 - coord.row;
  return `${file}${rank}`;
}

export function algebraicToCoord(sq: string): SquareCoord | null {
  if (sq.length !== 2) return null;
  const col = FILES.indexOf(sq[0].toLowerCase());
  const rank = Number.parseInt(sq[1], 10);
  if (col < 0 || col > 7 || Number.isNaN(rank) || rank < 1 || rank > 8) return null;
  return { row: 8 - rank, col };
}

export function createInitialBoard(): BoardGrid {
  const backRank: PieceType[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
  const grid: BoardGrid = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null));

  for (let c = 0; c < 8; c++) {
    grid[0][c] = { id: `b_${backRank[c]}_${c}`, type: backRank[c], side: 'black', hasMoved: false };
    grid[1][c] = { id: `b_pawn_${c}`, type: 'pawn', side: 'black', hasMoved: false };
    grid[6][c] = { id: `w_pawn_${c}`, type: 'pawn', side: 'white', hasMoved: false };
    grid[7][c] = { id: `w_${backRank[c]}_${c}`, type: backRank[c], side: 'white', hasMoved: false };
  }

  return grid;
}

export function cloneBoard(board: BoardGrid): BoardGrid {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

export function boardToFen(board: BoardGrid, sideToMove: PlayerSide): string {
  const charMap: Record<PieceType, string> = {
    pawn: 'p',
    knight: 'n',
    bishop: 'b',
    rook: 'r',
    queen: 'q',
    king: 'k',
  };
  const rows: string[] = [];
  for (let r = 0; r < 8; r++) {
    let empty = 0;
    let rowStr = '';
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) {
        empty++;
      } else {
        if (empty > 0) {
          rowStr += String(empty);
          empty = 0;
        }
        const ch = charMap[p.type];
        rowStr += p.side === 'white' ? ch.toUpperCase() : ch;
      }
    }
    if (empty > 0) rowStr += String(empty);
    rows.push(rowStr);
  }
  return `${rows.join('/')} ${sideToMove === 'white' ? 'w' : 'b'}`;
}

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function collectPatternMoves(
  board: BoardGrid,
  from: SquareCoord,
  piece: BoardPiece,
  pattern: MovementPattern,
  enPassantTarget: SquareCoord | null,
  includeCastling: boolean
): LegalMoveOption[] {
  const moves: LegalMoveOption[] = [];
  const dir = piece.side === 'white' ? -1 : 1; // white moves up (row decreases), black moves down (row increases)

  const addMoveIfValid = (
    tr: number,
    tc: number,
    primitiveLabel: string,
    opts?: { captureOnly?: boolean; moveOnly?: boolean; isEnPassant?: boolean; isCastling?: 'kingside' | 'queenside' }
  ): boolean => {
    if (!inBounds(tr, tc)) return false;
    const target = board[tr][tc];
    if (opts?.isEnPassant) {
      moves.push({
        from,
        to: { row: tr, col: tc },
        algFrom: coordToAlgebraic(from),
        algTo: coordToAlgebraic({ row: tr, col: tc }),
        isCapture: true,
        isEnPassant: true,
        governedByPrimitive: primitiveLabel,
      });
      return false;
    }

    if (!target) {
      if (!opts?.captureOnly) {
        const isPromo = piece.type === 'pawn' && (tr === 0 || tr === 7);
        moves.push({
          from,
          to: { row: tr, col: tc },
          algFrom: coordToAlgebraic(from),
          algTo: coordToAlgebraic({ row: tr, col: tc }),
          isCapture: false,
          isPromotion: isPromo,
          isCastling: opts?.isCastling,
          governedByPrimitive: primitiveLabel,
        });
      }
      return true; // square was empty, sliding can continue
    }

    if (target.side !== piece.side && !opts?.moveOnly) {
      const isPromo = piece.type === 'pawn' && (tr === 0 || tr === 7);
      moves.push({
        from,
        to: { row: tr, col: tc },
        algFrom: coordToAlgebraic(from),
        algTo: coordToAlgebraic({ row: tr, col: tc }),
        isCapture: true,
        isPromotion: isPromo,
        governedByPrimitive: primitiveLabel,
      });
    }
    return false; // blocked by a piece
  };

  switch (pattern.type) {
    case 'standard_pawn': {
      const oneRow = from.row + dir;
      if (inBounds(oneRow, from.col) && !board[oneRow][from.col]) {
        addMoveIfValid(oneRow, from.col, 'standard_pawn', { moveOnly: true });
        const startRank = piece.side === 'white' ? 6 : 1;
        const twoRow = from.row + dir * 2;
        if (from.row === startRank && inBounds(twoRow, from.col) && !board[twoRow][from.col]) {
          addMoveIfValid(twoRow, from.col, 'standard_pawn', { moveOnly: true });
        }
      }
      for (const dc of [-1, 1]) {
        const cr = from.row + dir;
        const cc = from.col + dc;
        if (inBounds(cr, cc)) {
          const occ = board[cr][cc];
          if (occ && occ.side !== piece.side) {
            addMoveIfValid(cr, cc, 'standard_pawn', { captureOnly: true });
          } else if (enPassantTarget && enPassantTarget.row === cr && enPassantTarget.col === cc) {
            addMoveIfValid(cr, cc, 'standard_pawn (en passant)', { isEnPassant: true });
          }
        }
      }
      break;
    }

    case 'standard_knight': {
      const jumps = [
        [-2, -1],
        [-2, 1],
        [-1, -2],
        [-1, 2],
        [1, -2],
        [1, 2],
        [2, -1],
        [2, 1],
      ];
      for (const [dr, dc] of jumps) {
        addMoveIfValid(from.row + dr, from.col + dc, 'standard_knight');
      }
      break;
    }

    case 'sliding_bishop': {
      const maxRange = pattern.max_range ?? 7;
      const dirs = [
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
      ];
      for (const [dr, dc] of dirs) {
        for (let step = 1; step <= maxRange; step++) {
          const cont = addMoveIfValid(from.row + dr * step, from.col + dc * step, 'sliding_bishop');
          if (!cont && !pattern.can_jump) break;
        }
      }
      break;
    }

    case 'sliding_rook': {
      const maxRange = pattern.max_range ?? 7;
      const dirs = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ];
      for (const [dr, dc] of dirs) {
        for (let step = 1; step <= maxRange; step++) {
          const cont = addMoveIfValid(from.row + dr * step, from.col + dc * step, 'sliding_rook');
          if (!cont && !pattern.can_jump) break;
        }
      }
      break;
    }

    case 'queen': {
      const maxRange = pattern.max_range ?? 7;
      const dirs = [
        [-1, -1],
        [-1, 0],
        [-1, 1],
        [0, -1],
        [0, 1],
        [1, -1],
        [1, 0],
        [1, 1],
      ];
      for (const [dr, dc] of dirs) {
        for (let step = 1; step <= maxRange; step++) {
          const cont = addMoveIfValid(from.row + dr * step, from.col + dc * step, 'queen');
          if (!cont && !pattern.can_jump) break;
        }
      }
      break;
    }

    case 'king_step': {
      const dirs = [
        [-1, -1],
        [-1, 0],
        [-1, 1],
        [0, -1],
        [0, 1],
        [1, -1],
        [1, 0],
        [1, 1],
      ];
      for (const [dr, dc] of dirs) {
        addMoveIfValid(from.row + dr, from.col + dc, 'king_step');
      }
      if (includeCastling && piece.type === 'king' && !piece.hasMoved) {
        const homeRow = piece.side === 'white' ? 7 : 0;
        if (from.row === homeRow && from.col === 4) {
          // Kingside castling
          const kRook = board[homeRow][7];
          if (
            kRook &&
            kRook.type === 'rook' &&
            kRook.side === piece.side &&
            !kRook.hasMoved &&
            !board[homeRow][5] &&
            !board[homeRow][6]
          ) {
            addMoveIfValid(homeRow, 6, 'king_step (castling)', { moveOnly: true, isCastling: 'kingside' });
          }
          // Queenside castling
          const qRook = board[homeRow][0];
          if (
            qRook &&
            qRook.type === 'rook' &&
            qRook.side === piece.side &&
            !qRook.hasMoved &&
            !board[homeRow][1] &&
            !board[homeRow][2] &&
            !board[homeRow][3]
          ) {
            addMoveIfValid(homeRow, 2, 'king_step (castling)', { moveOnly: true, isCastling: 'queenside' });
          }
        }
      }
      break;
    }

    case 'bounded_offsets': {
      for (const off of pattern.offsets ?? []) {
        // Orient row offset relative to player forward direction so rules remain symmetric
        const effectiveDr = piece.side === 'white' ? off.dr : -off.dr;
        const tr = from.row + effectiveDr;
        const tc = from.col + off.dc;
        if (!inBounds(tr, tc)) continue;
        if (off.jump === false) {
          // Check intermediate squares if linear
          const steps = Math.max(Math.abs(effectiveDr), Math.abs(off.dc));
          if (steps > 1 && (effectiveDr === 0 || off.dc === 0 || Math.abs(effectiveDr) === Math.abs(off.dc))) {
            const sr = Math.sign(effectiveDr);
            const sc = Math.sign(off.dc);
            let blocked = false;
            for (let s = 1; s < steps; s++) {
              if (board[from.row + sr * s][from.col + sc * s]) {
                blocked = true;
                break;
              }
            }
            if (blocked) continue;
          }
        }
        addMoveIfValid(tr, tc, `bounded_offsets(${off.dr},${off.dc})`, {
          captureOnly: off.capture_only,
          moveOnly: off.move_only,
        });
      }
      break;
    }

    case 'combined': {
      const seen = new Set<string>();
      for (const sub of pattern.patterns ?? []) {
        const subMoves = collectPatternMoves(board, from, piece, sub, enPassantTarget, includeCastling);
        for (const m of subMoves) {
          const key = `${m.to.row},${m.to.col}`;
          if (!seen.has(key)) {
            seen.add(key);
            moves.push(m);
          }
        }
      }
      break;
    }
  }

  return moves;
}

export function generatePseudoLegalMovesForSquare(
  board: BoardGrid,
  from: SquareCoord,
  ruleset: RulesetDocument,
  enPassantTarget: SquareCoord | null,
  includeCastling = true
): LegalMoveOption[] {
  const piece = board[from.row]?.[from.col];
  if (!piece) return [];
  const pieceRule = ruleset.pieces[piece.type];
  if (!pieceRule) return [];
  return collectPatternMoves(board, from, piece, pieceRule.movement, enPassantTarget, includeCastling);
}

export function findKingSquare(board: BoardGrid, side: PlayerSide): SquareCoord | null {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.side === side && p.type === 'king') {
        return { row: r, col: c };
      }
    }
  }
  return null;
}

export function isSquareAttackedBy(
  board: BoardGrid,
  target: SquareCoord,
  attackerSide: PlayerSide,
  ruleset: RulesetDocument
): boolean {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.side === attackerSide) {
        const pseudo = generatePseudoLegalMovesForSquare(board, { row: r, col: c }, ruleset, null, false);
        if (pseudo.some((m) => m.to.row === target.row && m.to.col === target.col)) {
          return true;
        }
      }
    }
  }
  return false;
}

export function isKingInCheck(board: BoardGrid, side: PlayerSide, ruleset: RulesetDocument): boolean {
  const kingSq = findKingSquare(board, side);
  if (!kingSq) return false;
  const opponent: PlayerSide = side === 'white' ? 'black' : 'white';
  return isSquareAttackedBy(board, kingSq, opponent, ruleset);
}

export function applyMoveOnBoard(
  board: BoardGrid,
  move: LegalMoveOption,
  promotionChoice: PieceType = 'queen'
): { nextBoard: BoardGrid; nextEnPassant: SquareCoord | null; capturedPiece?: PieceType } {
  const next = cloneBoard(board);
  const moving = next[move.from.row][move.from.col];
  if (!moving) {
    return { nextBoard: next, nextEnPassant: null };
  }

  let capturedPiece = next[move.to.row][move.to.col]?.type;

  // Handle en passant capture
  if (move.isEnPassant) {
    const capRow = move.from.row;
    const capCol = move.to.col;
    capturedPiece = next[capRow][capCol]?.type ?? 'pawn';
    next[capRow][capCol] = null;
  }

  // Handle castling rook movement
  if (move.isCastling === 'kingside') {
    const rRow = move.from.row;
    const rook = next[rRow][7];
    if (rook) {
      next[rRow][5] = { ...rook, hasMoved: true };
      next[rRow][7] = null;
    }
  } else if (move.isCastling === 'queenside') {
    const rRow = move.from.row;
    const rook = next[rRow][0];
    if (rook) {
      next[rRow][3] = { ...rook, hasMoved: true };
      next[rRow][0] = null;
    }
  }

  next[move.from.row][move.from.col] = null;
  next[move.to.row][move.to.col] = {
    ...moving,
    type: move.isPromotion ? promotionChoice : moving.type,
    hasMoved: true,
  };

  // En passant target if pawn moved 2 squares
  let nextEnPassant: SquareCoord | null = null;
  if (moving.type === 'pawn' && Math.abs(move.to.row - move.from.row) === 2) {
    nextEnPassant = {
      row: (move.from.row + move.to.row) / 2,
      col: move.from.col,
    };
  }

  return { nextBoard: next, nextEnPassant, capturedPiece };
}

export function generateLegalMovesForSide(
  board: BoardGrid,
  side: PlayerSide,
  ruleset: RulesetDocument,
  enPassantTarget: SquareCoord | null
): LegalMoveOption[] {
  const legalMoves: LegalMoveOption[] = [];
  const opponent: PlayerSide = side === 'white' ? 'black' : 'white';

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p || p.side !== side) continue;
      const pseudo = generatePseudoLegalMovesForSquare(board, { row: r, col: c }, ruleset, enPassantTarget, true);
      for (const candidate of pseudo) {
        if (candidate.isCastling) {
          // Cannot castle out of or through check
          if (isKingInCheck(board, side, ruleset)) continue;
          const transitCol = candidate.isCastling === 'kingside' ? 5 : 3;
          if (isSquareAttackedBy(board, { row: r, col: transitCol }, opponent, ruleset)) continue;
        }
        const { nextBoard } = applyMoveOnBoard(board, candidate);
        if (!isKingInCheck(nextBoard, side, ruleset)) {
          legalMoves.push(candidate);
        }
      }
    }
  }

  return legalMoves;
}

export function evaluateMatchStatus(
  board: BoardGrid,
  sideToMove: PlayerSide,
  ruleset: RulesetDocument,
  enPassantTarget: SquareCoord | null
): {
  status: MatchTerminalStatus;
  inCheckSide: PlayerSide | null;
  legalMoves: LegalMoveOption[];
} {
  const whiteInCheck = isKingInCheck(board, 'white', ruleset);
  const blackInCheck = isKingInCheck(board, 'black', ruleset);
  const inCheckSide: PlayerSide | null = whiteInCheck ? 'white' : blackInCheck ? 'black' : null;

  const legalMoves = generateLegalMovesForSide(board, sideToMove, ruleset, enPassantTarget);
  const activeSideInCheck = sideToMove === 'white' ? whiteInCheck : blackInCheck;

  if (legalMoves.length === 0) {
    if (activeSideInCheck) {
      return {
        status: sideToMove === 'white' ? 'CHECKMATE_BLACK_WINS' : 'CHECKMATE_WHITE_WINS',
        inCheckSide,
        legalMoves,
      };
    }
    return {
      status: 'STALEMATE',
      inCheckSide,
      legalMoves,
    };
  }

  return {
    status: inCheckSide ? 'CHECK' : 'IN_PROGRESS',
    inCheckSide,
    legalMoves,
  };
}

/**
 * Computes hypothetical moves from center square d4 (row 4, col 3) on a test board
 * with one friendly blocker and one enemy target, so players can preview draft ruleset geometry.
 */
export function computeSandboxPreviewMoves(
  pieceType: PieceType,
  ruleset: RulesetDocument
): {
  origin: SquareCoord;
  friendlyBlocker: SquareCoord;
  enemyTarget: SquareCoord;
  moves: LegalMoveOption[];
} {
  const sandboxBoard: BoardGrid = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null));
  const origin: SquareCoord = { row: 4, col: 3 }; // d4
  const friendlyBlocker: SquareCoord = { row: 2, col: 3 }; // d6
  const enemyTarget: SquareCoord = { row: 2, col: 5 }; // f6

  sandboxBoard[origin.row][origin.col] = {
    id: 'sandbox_piece',
    type: pieceType,
    side: 'white',
    hasMoved: false,
  };
  sandboxBoard[friendlyBlocker.row][friendlyBlocker.col] = {
    id: 'sandbox_ally',
    type: 'pawn',
    side: 'white',
    hasMoved: true,
  };
  sandboxBoard[enemyTarget.row][enemyTarget.col] = {
    id: 'sandbox_enemy',
    type: 'pawn',
    side: 'black',
    hasMoved: true,
  };

  const moves = generatePseudoLegalMovesForSquare(sandboxBoard, origin, ruleset, null, false);
  return { origin, friendlyBlocker, enemyTarget, moves };
}
