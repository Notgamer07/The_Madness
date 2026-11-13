import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Crown,
  FlipVertical,
  History,
  Info,
  RotateCcw,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { STANDARD_CHESS_RULESET_DOC } from '../engine/defaultRulesets';
import { coordToAlgebraic, generateLegalMovesForSide } from '../engine/localGameEngine';
import { describeMovementPattern } from '../engine/rulesetValidator';
import {
  LegalMoveOption,
  MatchState,
  PieceType,
  PlayerSide,
  SquareCoord,
} from '../types/game';

interface ChessboardPanelProps {
  match: MatchState;
  onSubmitMove: (
    playerSide: PlayerSide,
    move: LegalMoveOption,
    promotionChoice?: PieceType
  ) => Promise<void>;
  onResetMatch: () => Promise<void>;
  onInspectRulesetVersion: (version: number) => void;
}

const PROMOTION_PIECES: PieceType[] = ['queen', 'rook', 'bishop', 'knight'];
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

export const ChessboardPanel: React.FC<ChessboardPanelProps> = ({
  match,
  onSubmitMove,
  onResetMatch,
  onInspectRulesetVersion,
}) => {
  const [selectedSquare, setSelectedSquare] = useState<SquareCoord | null>(null);
  const [flipped, setFlipped] = useState<boolean>(false);
  const [pendingPromotionMove, setPendingPromotionMove] = useState<LegalMoveOption | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [isSubmittingMove, setIsSubmittingMove] = useState<boolean>(false);

  const promoDialogRef = useRef<HTMLDialogElement | null>(null);
  const promoTitleId = useId();

  // Compute legal moves from the active ruleset (labelled as client preview of authoritative ruleset)
  const allLegalMoves = useMemo(() => {
    if (
      match.status === 'CHECKMATE_WHITE_WINS' ||
      match.status === 'CHECKMATE_BLACK_WINS' ||
      match.status === 'STALEMATE'
    ) {
      return [];
    }
    return generateLegalMovesForSide(
      match.board,
      match.side_to_move,
      match.active_ruleset.source_json,
      match.en_passant_target
    );
  }, [match.board, match.side_to_move, match.active_ruleset, match.en_passant_target, match.status]);

  // Clear selection when board state updates
  useEffect(() => {
    setSelectedSquare(null);
    setMoveError(null);
  }, [match.state_version]);

  // Manage native <dialog> for pawn promotion with showModal() and light-dismiss fallback
  useEffect(() => {
    const dialog = promoDialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      const choice = dialog.returnValue as PieceType | 'cancel' | '';
      dialog.returnValue = ''; // Reset per modern-web-guidance dialog rule
      if (choice && choice !== 'cancel' && pendingPromotionMove) {
        void executeMove(pendingPromotionMove, choice);
      }
      setPendingPromotionMove(null);
    };

    dialog.addEventListener('close', handleClose);

    // Fallback for browsers without native closedby support
    let cleanupLightDismiss: (() => void) | undefined;
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const onBackdropClick = (event: MouseEvent) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isInContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (!isInContent) {
          dialog.close();
        }
      };
      dialog.addEventListener('click', onBackdropClick);
      cleanupLightDismiss = () => dialog.removeEventListener('click', onBackdropClick);
    }

    return () => {
      dialog.removeEventListener('close', handleClose);
      cleanupLightDismiss?.();
    };
  }, [pendingPromotionMove]);

  const selectedSquareMoves = useMemo(() => {
    if (!selectedSquare) return [];
    return allLegalMoves.filter(
      (m) => m.from.row === selectedSquare.row && m.from.col === selectedSquare.col
    );
  }, [allLegalMoves, selectedSquare]);

  // Determine which pieces have customized rules compared to Standard Chess Baseline
  const modifiedPieceTypes = useMemo(() => {
    const set = new Set<PieceType>();
    const activePieces = match.active_ruleset.source_json.pieces;
    const stdPieces = STANDARD_CHESS_RULESET_DOC.pieces;
    (Object.keys(activePieces) as PieceType[]).forEach((pt) => {
      if (JSON.stringify(activePieces[pt].movement) !== JSON.stringify(stdPieces[pt].movement)) {
        set.add(pt);
      }
    });
    return set;
  }, [match.active_ruleset]);

  const executeMove = async (move: LegalMoveOption, promotionChoice?: PieceType) => {
    setIsSubmittingMove(true);
    setMoveError(null);
    try {
      await onSubmitMove(match.side_to_move, move, promotionChoice);
      setSelectedSquare(null);
    } catch (err) {
      setMoveError(err instanceof Error ? err.message : 'Move rejected by backend');
    } finally {
      setIsSubmittingMove(false);
    }
  };

  const handleSquareClick = (row: number, col: number) => {
    setMoveError(null);

    // Check if clicked square is a legal destination for the currently selected piece
    if (selectedSquare) {
      const candidateMove = selectedSquareMoves.find(
        (m) => m.to.row === row && m.to.col === col
      );
      if (candidateMove) {
        if (candidateMove.isPromotion) {
          setPendingPromotionMove(candidateMove);
          promoDialogRef.current?.showModal();
          return;
        }
        void executeMove(candidateMove);
        return;
      }
    }

    const clickedPiece = match.board[row][col];
    if (clickedPiece) {
      if (clickedPiece.side !== match.side_to_move) {
        setMoveError(
          `Board Turn Notice: It is ${match.side_to_move.toUpperCase()}'s turn to move on the board. (Note: Either player can still edit & submit ruleset changes in the right panel at any time!)`
        );
        setSelectedSquare(null);
        return;
      }
      if (selectedSquare && selectedSquare.row === row && selectedSquare.col === col) {
        setSelectedSquare(null);
      } else {
        setSelectedSquare({ row, col });
      }
    } else {
      setSelectedSquare(null);
    }
  };

  const lastMove = match.moves.length > 0 ? match.moves[match.moves.length - 1] : null;
  const selectedPiece = selectedSquare
    ? match.board[selectedSquare.row][selectedSquare.col]
    : null;
  const selectedPieceRule = selectedPiece
    ? match.active_ruleset.source_json.pieces[selectedPiece.type]
    : null;

  const displayRows = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const displayCols = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

  // Group moves into pairs (1. White Black)
  const movePairs = useMemo(() => {
    const pairs: { turnNumber: number; white?: typeof match.moves[0]; black?: typeof match.moves[0] }[] = [];
    for (let i = 0; i < match.moves.length; i += 2) {
      pairs.push({
        turnNumber: Math.floor(i / 2) + 1,
        white: match.moves[i],
        black: match.moves[i + 1],
      });
    }
    return pairs;
  }, [match.moves]);

  return (
    <section className="panel board-panel" aria-label="Live Match Board and Turn History">
      {/* Top Match Status Bar */}
      <div className="panel-header">
        <div className="panel-title-group">
          <div className="turn-badge-wrapper">
            <span
              className={`turn-indicator-pill ${
                match.side_to_move === 'white' ? 'turn-white' : 'turn-black'
              }`}
            >
              <span className="turn-dot" aria-hidden="true" />
              {match.side_to_move === 'white' ? 'White to Move' : 'Black to Move'}
            </span>

            <button
              type="button"
              className="active-ruleset-pill"
              onClick={() => onInspectRulesetVersion(match.active_ruleset_version)}
              aria-label={`Inspect active ruleset version ${match.active_ruleset_version}`}
            >
              <Sparkles size={14} aria-hidden="true" />
              <span>Active Ruleset v{match.active_ruleset_version}</span>
              {modifiedPieceTypes.size > 0 && (
                <span className="modified-count-tag">
                  {modifiedPieceTypes.size} custom
                </span>
              )}
            </button>
          </div>
          <p className="panel-subtitle">
            State #{match.state_version} • Governing config:{' '}
            <strong>{match.active_ruleset.change_summary}</strong>
          </p>
        </div>

        <div className="toolbar-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setFlipped((f) => !f)}
            aria-pressed={flipped}
          >
            <FlipVertical size={15} aria-hidden="true" />
            <span>Flip Board</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void onResetMatch()}
          >
            <RotateCcw size={15} aria-hidden="true" />
            <span>New Match</span>
          </button>
        </div>
      </div>

      {/* Check / Checkmate / Error Banner */}
      {match.status !== 'IN_PROGRESS' && (
        <div
          className={`status-alert ${
            match.status === 'CHECK' ? 'status-alert-warning' : 'status-alert-critical'
          }`}
          role="status"
        >
          {match.status === 'CHECK' ? (
            <>
              <ShieldAlert size={18} aria-hidden="true" />
              <span>
                <strong>CHECK!</strong> {match.in_check_side?.toUpperCase()} King is under attack
                under Active Ruleset v{match.active_ruleset_version}.
              </span>
            </>
          ) : match.status === 'CHECKMATE_WHITE_WINS' ? (
            <>
              <Crown size={18} aria-hidden="true" />
              <span>
                <strong>CHECKMATE — White Wins!</strong> Evaluated under Active Ruleset v
                {match.active_ruleset_version}.
              </span>
            </>
          ) : match.status === 'CHECKMATE_BLACK_WINS' ? (
            <>
              <Crown size={18} aria-hidden="true" />
              <span>
                <strong>CHECKMATE — Black Wins!</strong> Evaluated under Active Ruleset v
                {match.active_ruleset_version}.
              </span>
            </>
          ) : (
            <>
              <Info size={18} aria-hidden="true" />
              <span>
                <strong>STALEMATE / DRAW</strong> — No legal moves remain for{' '}
                {match.side_to_move.toUpperCase()}.
              </span>
            </>
          )}
        </div>
      )}

      {moveError && (
        <div className="status-alert status-alert-error" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{moveError}</span>
        </div>
      )}

      {/* Main Board + Inspector Container */}
      <div className="board-stage-container">
        <div className="chessboard-frame">
          <div
            className="chessboard-grid"
            role="grid"
            aria-label={`Chessboard governed by Ruleset v${match.active_ruleset_version}`}
          >
            {displayRows.map((r, rIdx) => (
              <div key={r} className="chessboard-row" role="row">
                {displayCols.map((c, cIdx) => {
                  const sqAlg = coordToAlgebraic({ row: r, col: c });
                  const isLight = (r + c) % 2 === 0;
                  const piece = match.board[r][c];
                  const isSelected =
                    selectedSquare?.row === r && selectedSquare?.col === c;
                  const moveOption = selectedSquareMoves.find(
                    (m) => m.to.row === r && m.to.col === c
                  );
                  const isLastMoveSq =
                    lastMove?.from_sq === sqAlg || lastMove?.to_sq === sqAlg;
                  const isKingDanger =
                    piece?.type === 'king' && piece.side === match.in_check_side;
                  const isModifiedPiece = piece ? modifiedPieceTypes.has(piece.type) : false;
                  const pieceDef = piece
                    ? match.active_ruleset.source_json.pieces[piece.type]
                    : null;
                  const glyph = piece && pieceDef ? pieceDef.appearance[piece.side] : '';

                  return (
                    <button
                      key={sqAlg}
                      type="button"
                      role="gridcell"
                      disabled={isSubmittingMove}
                      onClick={() => handleSquareClick(r, c)}
                      className={[
                        'board-square',
                        isLight ? 'sq-light' : 'sq-dark',
                        isSelected ? 'sq-selected' : '',
                        isLastMoveSq ? 'sq-last-move' : '',
                        isKingDanger ? 'sq-king-check' : '',
                        moveOption ? (moveOption.isCapture ? 'sq-legal-capture' : 'sq-legal-move') : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      aria-label={`${sqAlg}${
                        piece
                          ? `: ${piece.side} ${pieceDef?.name ?? piece.type}${
                              isModifiedPiece ? ' (custom rules active)' : ''
                            }`
                          : ''
                      }${
                        moveOption
                          ? ` — Legal ${moveOption.isCapture ? 'capture' : 'move'} via ${
                              moveOption.governedByPrimitive
                            }`
                          : ''
                      }`}
                    >
                      {/* Coordinate labels on board edges */}
                      {cIdx === 0 && (
                        <span className="coord-label coord-rank" aria-hidden="true">
                          {8 - r}
                        </span>
                      )}
                      {rIdx === 7 && (
                        <span className="coord-label coord-file" aria-hidden="true">
                          {FILES[c]}
                        </span>
                      )}

                      {/* Piece Glyph */}
                      {piece && (
                        <span
                          className={`piece-glyph piece-${piece.side} ${
                            isModifiedPiece ? 'piece-modified' : ''
                          }`}
                          aria-hidden="true"
                        >
                          {glyph}
                        </span>
                      )}

                      {/* Badge on modified piece */}
                      {piece && isModifiedPiece && (
                        <span
                          className="piece-mod-pip"
                          aria-hidden="true"
                        >
                          ★
                        </span>
                      )}

                      {/* Legal move indicator (shape + ring so not color alone) */}
                      {moveOption && !moveOption.isCapture && (
                        <span className="legal-move-dot" aria-hidden="true" />
                      )}
                      {moveOption && moveOption.isCapture && (
                        <span className="legal-capture-ring" aria-hidden="true" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Active Piece & Live Ruleset Summary Strip + Move History */}
        <div className="board-side-column">
          {/* Active Piece Inspector Card */}
          <div className="inspector-card">
            <div className="inspector-card-header">
              <h2 className="card-heading">
                {selectedPiece && selectedPieceRule
                  ? `${selectedPiece.side.toUpperCase()} ${selectedPieceRule.name} (${coordToAlgebraic(
                      selectedSquare!
                    )})`
                  : 'Live Piece & Rule Inspector'}
              </h2>
              <span className="non-auth-hint">v{match.active_ruleset_version} Engine</span>
            </div>

            {selectedPiece && selectedPieceRule ? (
              <div className="selected-piece-details">
                <p className="primitive-description">
                  <strong>Active Movement:</strong>{' '}
                  {describeMovementPattern(selectedPieceRule.movement)}
                </p>
                <p className="legal-count-line">
                  <CheckCircle2 size={14} aria-hidden="true" />
                  <span>
                    <strong>{selectedSquareMoves.length}</strong> legal destination
                    {selectedSquareMoves.length === 1 ? '' : 's'} available on board
                  </span>
                </p>
              </div>
            ) : (
              <div className="active-pieces-overview">
                <p className="helper-note">
                  Select any{' '}
                  <strong>{match.side_to_move.toUpperCase()}</strong> piece on the board to move, or
                  inspect which pieces have active rule modifications below:
                </p>
                <div className="piece-chips-row">
                  {(Object.keys(match.active_ruleset.source_json.pieces) as PieceType[]).map(
                    (pt) => {
                      const def = match.active_ruleset.source_json.pieces[pt];
                      const isMod = modifiedPieceTypes.has(pt);
                      return (
                        <span
                          key={pt}
                          className={`piece-rule-chip ${isMod ? 'chip-modified' : ''}`}
                        >
                          <span aria-hidden="true">{def.appearance.white}</span>
                          <span>{def.name}</span>
                          {isMod && <strong className="mod-tag">MOD</strong>}
                        </span>
                      );
                    }
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Move History with Governing Ruleset Version Badges */}
          <div className="move-history-card">
            <div className="inspector-card-header">
              <h2 className="card-heading">
                <History size={15} aria-hidden="true" />
                <span>Move Ledger & Governing Ruleset</span>
              </h2>
              <span className="move-count-badge">{match.moves.length} half-moves</span>
            </div>

            {movePairs.length === 0 ? (
              <p className="empty-history-msg">
                No moves played yet. Make an opening move on the board, or edit the match rules
                immediately in the Ruleset Studio!
              </p>
            ) : (
              <div className="move-table-scroll">
                <table className="move-ledger-table">
                  <caption className="visually-hidden">
                    Chronological match moves and the ruleset version that governed each move
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">White Move</th>
                      <th scope="col">Black Move</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movePairs.map((pair) => (
                      <tr key={pair.turnNumber}>
                        <th scope="row" className="turn-num-cell">
                          {pair.turnNumber}.
                        </th>
                        <td>
                          {pair.white ? (
                            <div className="move-cell-content">
                              <span className="move-san">{pair.white.notation}</span>
                              <button
                                type="button"
                                className={`ruleset-ver-tag ${
                                  pair.white.ruleset_version > 1 ? 'ver-tag-custom' : ''
                                }`}
                                onClick={() =>
                                  onInspectRulesetVersion(pair.white!.ruleset_version)
                                }
                                aria-label={`Move ${pair.white.notation} governed by ruleset version ${pair.white.ruleset_version}`}
                              >
                                v{pair.white.ruleset_version}
                              </button>
                            </div>
                          ) : null}
                        </td>
                        <td>
                          {pair.black ? (
                            <div className="move-cell-content">
                              <span className="move-san">{pair.black.notation}</span>
                              <button
                                type="button"
                                className={`ruleset-ver-tag ${
                                  pair.black.ruleset_version > 1 ? 'ver-tag-custom' : ''
                                }`}
                                onClick={() =>
                                  onInspectRulesetVersion(pair.black!.ruleset_version)
                                }
                                aria-label={`Move ${pair.black.notation} governed by ruleset version ${pair.black.ruleset_version}`}
                              >
                                v{pair.black.ruleset_version}
                              </button>
                            </div>
                          ) : (
                            <span className="awaiting-move-dash">…</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="fen-footer">
              <span className="fen-label">FEN:</span>
              <code className="fen-code">{match.fen}</code>
            </div>
          </div>
        </div>
      </div>

      {/* Native <dialog> for Pawn Promotion */}
      <dialog
        ref={promoDialogRef}
        aria-labelledby={promoTitleId}
        className="native-modal promo-modal"
        {...({ closedby: 'any' } as React.DialogHTMLAttributes<HTMLDialogElement>)}
      >
        <form method="dialog" className="modal-form">
          <h2 id={promoTitleId} className="modal-heading">
            Promote Pawn at {pendingPromotionMove?.algTo}
          </h2>
          <p className="modal-subtext">
            Choose the piece to promote into (inherits active Ruleset v
            {match.active_ruleset_version} behavior):
          </p>
          <div className="promo-choices-grid">
            {PROMOTION_PIECES.map((pt, idx) => {
              const pDef = match.active_ruleset.source_json.pieces[pt];
              return (
                <button
                  key={pt}
                  type="submit"
                  value={pt}
                  autoFocus={idx === 0}
                  className="promo-choice-btn"
                >
                  <span className="promo-glyph" aria-hidden="true">
                    {pDef.appearance[match.side_to_move]}
                  </span>
                  <span className="promo-name">{pDef.name}</span>
                </button>
              );
            })}
          </div>
          <div className="modal-footer-row">
            <button type="submit" value="cancel" className="btn btn-secondary">
              Cancel Move
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
};
