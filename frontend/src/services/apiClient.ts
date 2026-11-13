import { STANDARD_CHESS_RULESET_DOC } from '../engine/defaultRulesets';
import {
  applyMoveOnBoard,
  boardToFen,
  coordToAlgebraic,
  createInitialBoard,
  evaluateMatchStatus,
  generateLegalMovesForSide,
} from '../engine/localGameEngine';
import { validateRulesetDraft } from '../engine/rulesetValidator';
import {
  ActiveRuleset,
  ApiExchangeLog,
  LegalMoveOption,
  MatchEventEnvelope,
  MatchState,
  MoveRecord,
  PieceType,
  PlayerSide,
  ValidationResult,
} from '../types/game';

export type TransportMode = 'simulated' | 'remote';

type EventListener = (event: MatchEventEnvelope) => void;
type LogListener = (log: ApiExchangeLog) => void;

const INITIAL_MATCH_ID = 'match_maddness_01';

function createInitialMatchState(matchId = INITIAL_MATCH_ID): MatchState {
  const initialBoard = createInitialBoard();
  const initialRuleset: ActiveRuleset = {
    id: 'ruleset_v1_std',
    match_id: matchId,
    version: 1,
    source_json: structuredClone(STANDARD_CHESS_RULESET_DOC),
    created_by: 'system',
    created_at: new Date().toISOString(),
    validation_status: 'ACCEPTED',
    change_summary: 'Standard FIDE Baseline (v1)',
  };

  return {
    id: matchId,
    game_module: 'programmable_chess',
    white_player_id: 'player_white_alpha',
    black_player_id: 'player_black_omega',
    side_to_move: 'white',
    status: 'IN_PROGRESS',
    in_check_side: null,
    fen: boardToFen(initialBoard, 'white'),
    board: initialBoard,
    state_version: 1,
    active_ruleset_version: 1,
    active_ruleset: initialRuleset,
    ruleset_history: [initialRuleset],
    moves: [],
    en_passant_target: null,
  };
}

class GamePlatformApiClient {
  private mode: TransportMode =
    (import.meta.env.VITE_DEFAULT_TRANSPORT_MODE as TransportMode) === 'remote' ? 'remote' : 'simulated';
  private baseUrl: string = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
  private wsBaseUrl: string = import.meta.env.VITE_WS_BASE_URL || 'ws://localhost:8000';

  private simulatedMatch: MatchState = createInitialMatchState();
  private eventSeq = 1;
  private eventListeners = new Set<EventListener>();
  private logListeners = new Set<LogListener>();
  private wsConnection: WebSocket | null = null;

  public getTransportMode(): TransportMode {
    return this.mode;
  }

  public setTransportMode(mode: TransportMode, customBaseUrl?: string): void {
    this.mode = mode;
    if (customBaseUrl) {
      this.baseUrl = customBaseUrl.replace(/\/+$/, '');
      this.wsBaseUrl = this.baseUrl.replace(/^http/, 'ws');
    }
    this.disconnectWebSocket();
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public subscribeEvents(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  public subscribeLogs(listener: LogListener): () => void {
    this.logListeners.add(listener);
    return () => {
      this.logListeners.delete(listener);
    };
  }

  private emitEvent(event: MatchEventEnvelope): void {
    this.recordLog({
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: event.timestamp,
      method: 'WS_IN',
      endpoint: `/matches/${event.match_id}/live`,
      status: 'EVENT',
      durationMs: 2,
      responseBody: event,
    });
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }

  private recordLog(entry: ApiExchangeLog): void {
    for (const listener of this.logListeners) {
      listener(entry);
    }
  }

  public connectWebSocket(matchId: string): void {
    if (this.mode !== 'remote') return;
    this.disconnectWebSocket();
    try {
      const ws = new WebSocket(`${this.wsBaseUrl}/matches/${matchId}/live`);
      ws.onmessage = (msg) => {
        try {
          const parsed = JSON.parse(msg.data) as MatchEventEnvelope;
          this.emitEvent(parsed);
        } catch {
          // Ignore malformed frame
        }
      };
      this.wsConnection = ws;
    } catch {
      // Handled gracefully when remote backend is offline
    }
  }

  public disconnectWebSocket(): void {
    if (this.wsConnection) {
      this.wsConnection.close();
      this.wsConnection = null;
    }
  }

  /**
   * POST /matches — Create or reset a match
   */
  public async createMatch(): Promise<MatchState> {
    const start = performance.now();
    if (this.mode === 'remote') {
      const res = await fetch(`${this.baseUrl}/matches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_module: 'programmable_chess' }),
      });
      const data = (await res.json()) as MatchState;
      this.recordLog({
        id: `log_${Date.now()}`,
        timestamp: new Date().toISOString(),
        method: 'POST',
        endpoint: '/matches',
        status: res.status,
        durationMs: Math.round(performance.now() - start),
        requestBody: { game_module: 'programmable_chess' },
        responseBody: data,
      });
      return data;
    }

    this.simulatedMatch = createInitialMatchState();
    const snapshot = structuredClone(this.simulatedMatch);
    this.recordLog({
      id: `log_${Date.now()}`,
      timestamp: new Date().toISOString(),
      method: 'POST',
      endpoint: '/matches',
      status: 201,
      durationMs: Math.max(4, Math.round(performance.now() - start)),
      requestBody: { game_module: 'programmable_chess', initial_ruleset: 'standard_v1' },
      responseBody: {
        match_id: snapshot.id,
        state_version: snapshot.state_version,
        active_ruleset_version: snapshot.active_ruleset_version,
      },
    });

    this.emitEvent({
      event_id: `evt_${this.eventSeq++}`,
      match_id: snapshot.id,
      sequence: this.eventSeq,
      type: 'MATCH_RESET',
      timestamp: new Date().toISOString(),
      actor: 'system',
      summary: 'New match initialized with Standard Chess Baseline (Ruleset v1).',
      payload: { state_version: 1, active_ruleset_version: 1 },
    });

    return snapshot;
  }

  /**
   * GET /matches/{id} — Fetch authoritative match state, active ruleset, and move history
   */
  public async getMatch(matchId = INITIAL_MATCH_ID): Promise<MatchState> {
    const start = performance.now();
    if (this.mode === 'remote') {
      const res = await fetch(`${this.baseUrl}/matches/${matchId}`);
      const data = (await res.json()) as MatchState;
      this.recordLog({
        id: `log_${Date.now()}`,
        timestamp: new Date().toISOString(),
        method: 'GET',
        endpoint: `/matches/${matchId}`,
        status: res.status,
        durationMs: Math.round(performance.now() - start),
        responseBody: data,
      });
      return data;
    }

    const snapshot = structuredClone(this.simulatedMatch);
    this.recordLog({
      id: `log_${Date.now()}`,
      timestamp: new Date().toISOString(),
      method: 'GET',
      endpoint: `/matches/${matchId}`,
      status: 200,
      durationMs: Math.max(3, Math.round(performance.now() - start)),
      responseBody: {
        id: snapshot.id,
        side_to_move: snapshot.side_to_move,
        state_version: snapshot.state_version,
        active_ruleset_version: snapshot.active_ruleset_version,
        moves_count: snapshot.moves.length,
      },
    });
    return snapshot;
  }

  /**
   * POST /matches/{id}/moves — Submit a board move for authoritative validation under the active ruleset
   */
  public async submitMove(params: {
    matchId: string;
    playerSide: PlayerSide;
    move: LegalMoveOption;
    promotionChoice?: PieceType;
    expectedStateVersion: number;
    expectedRulesetVersion: number;
  }): Promise<{ accepted: boolean; match: MatchState; error?: string }> {
    const start = performance.now();
    const reqPayload = {
      player_id: params.playerSide,
      from_sq: params.move.algFrom,
      to_sq: params.move.algTo,
      promotion: params.promotionChoice,
      expected_state_version: params.expectedStateVersion,
      expected_ruleset_version: params.expectedRulesetVersion,
    };

    if (this.mode === 'remote') {
      const res = await fetch(`${this.baseUrl}/matches/${params.matchId}/moves`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqPayload),
      });
      const data = (await res.json()) as { accepted: boolean; match: MatchState; error?: string };
      this.recordLog({
        id: `log_${Date.now()}`,
        timestamp: new Date().toISOString(),
        method: 'POST',
        endpoint: `/matches/${params.matchId}/moves`,
        status: res.status,
        durationMs: Math.round(performance.now() - start),
        requestBody: reqPayload,
        responseBody: data,
      });
      return data;
    }

    const current = this.simulatedMatch;
    if (params.playerSide !== current.side_to_move) {
      const errMsg = `Turn ownership violation: it is currently ${current.side_to_move.toUpperCase()}'s turn to move on the board.`;
      this.recordLog({
        id: `log_${Date.now()}`,
        timestamp: new Date().toISOString(),
        method: 'POST',
        endpoint: `/matches/${params.matchId}/moves`,
        status: 409,
        durationMs: 4,
        requestBody: reqPayload,
        responseBody: { accepted: false, error: errMsg },
      });
      return { accepted: false, match: structuredClone(current), error: errMsg };
    }

    // Re-verify move legality on server against active ruleset
    const legalMoves = generateLegalMovesForSide(
      current.board,
      current.side_to_move,
      current.active_ruleset.source_json,
      current.en_passant_target
    );
    const verifiedMove = legalMoves.find(
      (m) =>
        m.from.row === params.move.from.row &&
        m.from.col === params.move.from.col &&
        m.to.row === params.move.to.row &&
        m.to.col === params.move.to.col
    );

    if (!verifiedMove) {
      const errMsg = `Move ${params.move.algFrom}→${params.move.algTo} rejected by authoritative rules engine (Ruleset v${current.active_ruleset_version}).`;
      this.recordLog({
        id: `log_${Date.now()}`,
        timestamp: new Date().toISOString(),
        method: 'POST',
        endpoint: `/matches/${params.matchId}/moves`,
        status: 422,
        durationMs: 5,
        requestBody: reqPayload,
        responseBody: { accepted: false, error: errMsg },
      });
      return { accepted: false, match: structuredClone(current), error: errMsg };
    }

    const movingPiece = current.board[verifiedMove.from.row][verifiedMove.from.col]!;
    const pieceRule = current.active_ruleset.source_json.pieces[movingPiece.type];
    const { nextBoard, nextEnPassant, capturedPiece } = applyMoveOnBoard(
      current.board,
      verifiedMove,
      params.promotionChoice ?? 'queen'
    );

    const nextSide: PlayerSide = current.side_to_move === 'white' ? 'black' : 'white';
    const evalAfter = evaluateMatchStatus(
      nextBoard,
      nextSide,
      current.active_ruleset.source_json,
      nextEnPassant
    );

    const piecePrefixMap: Record<PieceType, string> = {
      pawn: '',
      knight: 'N',
      bishop: 'B',
      rook: 'R',
      queen: 'Q',
      king: 'K',
    };

    let notation = '';
    if (verifiedMove.isCastling === 'kingside') {
      notation = 'O-O';
    } else if (verifiedMove.isCastling === 'queenside') {
      notation = 'O-O-O';
    } else {
      const prefix =
        movingPiece.type === 'pawn' && verifiedMove.isCapture
          ? verifiedMove.algFrom[0]
          : piecePrefixMap[movingPiece.type];
      const capSymbol = verifiedMove.isCapture ? 'x' : '';
      const promoSuffix = verifiedMove.isPromotion
        ? `=${piecePrefixMap[params.promotionChoice ?? 'queen']}`
        : '';
      notation = `${prefix}${capSymbol}${verifiedMove.algTo}${promoSuffix}`;
    }

    const wasCheckmate =
      evalAfter.status === 'CHECKMATE_WHITE_WINS' || evalAfter.status === 'CHECKMATE_BLACK_WINS';
    const wasCheck = evalAfter.status === 'CHECK' || wasCheckmate;
    if (wasCheckmate) notation += '#';
    else if (wasCheck) notation += '+';

    const nextFen = boardToFen(nextBoard, nextSide);
    const moveRecord: MoveRecord = {
      id: `mv_${current.moves.length + 1}_${Date.now().toString(36)}`,
      match_id: current.id,
      sequence_no: current.moves.length + 1,
      player_id: current.side_to_move,
      notation,
      from_sq: coordToAlgebraic(verifiedMove.from),
      to_sq: coordToAlgebraic(verifiedMove.to),
      piece_type: movingPiece.type,
      piece_custom_name: pieceRule.name,
      captured_piece: capturedPiece,
      resulting_fen: nextFen,
      ruleset_version: current.active_ruleset_version,
      timestamp: new Date().toISOString(),
      was_check: wasCheck,
      was_checkmate: wasCheckmate,
    };

    current.board = nextBoard;
    current.side_to_move = nextSide;
    current.status = evalAfter.status;
    current.in_check_side = evalAfter.inCheckSide;
    current.fen = nextFen;
    current.state_version += 1;
    current.en_passant_target = nextEnPassant;
    current.moves = [...current.moves, moveRecord];

    const snapshot = structuredClone(current);
    this.recordLog({
      id: `log_${Date.now()}`,
      timestamp: moveRecord.timestamp,
      method: 'POST',
      endpoint: `/matches/${params.matchId}/moves`,
      status: 200,
      durationMs: Math.max(5, Math.round(performance.now() - start)),
      requestBody: reqPayload,
      responseBody: {
        accepted: true,
        move: moveRecord,
        state_version: snapshot.state_version,
        active_ruleset_version: snapshot.active_ruleset_version,
        status: snapshot.status,
      },
    });

    this.emitEvent({
      event_id: `evt_${this.eventSeq++}`,
      match_id: snapshot.id,
      sequence: this.eventSeq,
      type: 'MOVE_ACCEPTED',
      timestamp: moveRecord.timestamp,
      actor: moveRecord.player_id,
      summary: `${moveRecord.player_id.toUpperCase()} played ${moveRecord.notation} (${moveRecord.piece_custom_name}) under Ruleset v${moveRecord.ruleset_version}.`,
      payload: {
        move: moveRecord,
        state_version: snapshot.state_version,
        ruleset_version: snapshot.active_ruleset_version,
      },
    });

    return { accepted: true, match: snapshot };
  }

  /**
   * POST /matches/{id}/drafts/{draft_id}/submit
   * Validates and activates a draft ruleset INDEPENDENTLY of whose turn it is on the board!
   */
  public async submitDraftRuleset(params: {
    matchId: string;
    draftId: string;
    playerSide: PlayerSide;
    rawJson: string;
    basedOnRulesetVersion: number;
    basedOnStateVersion: number;
  }): Promise<{ validation: ValidationResult; match: MatchState }> {
    const start = performance.now();
    const reqPayload = {
      draft_id: params.draftId,
      player_id: params.playerSide,
      based_on_ruleset_version: params.basedOnRulesetVersion,
      based_on_state_version: params.basedOnStateVersion,
      source_json: params.rawJson,
    };

    if (this.mode === 'remote') {
      const res = await fetch(
        `${this.baseUrl}/matches/${params.matchId}/drafts/${params.draftId}/submit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reqPayload),
        }
      );
      const data = (await res.json()) as { validation: ValidationResult; match: MatchState };
      this.recordLog({
        id: `log_${Date.now()}`,
        timestamp: new Date().toISOString(),
        method: 'POST',
        endpoint: `/matches/${params.matchId}/drafts/${params.draftId}/submit`,
        status: res.status,
        durationMs: Math.round(performance.now() - start),
        requestBody: reqPayload,
        responseBody: data,
      });
      return data;
    }

    const current = this.simulatedMatch;
    const { result, parsedDoc, changeSummary } = validateRulesetDraft(
      params.rawJson,
      params.basedOnRulesetVersion,
      current.active_ruleset_version,
      params.basedOnStateVersion,
      current.active_ruleset.source_json
    );

    if (!result.accepted || !parsedDoc) {
      const snapshot = structuredClone(current);
      this.recordLog({
        id: `log_${Date.now()}`,
        timestamp: result.timestamp,
        method: 'POST',
        endpoint: `/matches/${params.matchId}/drafts/${params.draftId}/submit`,
        status: 422,
        durationMs: Math.max(7, Math.round(performance.now() - start)),
        requestBody: {
          player_id: params.playerSide,
          based_on_ruleset_version: params.basedOnRulesetVersion,
          turn_independent: true,
        },
        responseBody: result,
      });

      this.emitEvent({
        event_id: `evt_${this.eventSeq++}`,
        match_id: snapshot.id,
        sequence: this.eventSeq,
        type: 'DRAFT_REJECTED',
        timestamp: result.timestamp,
        actor: params.playerSide,
        summary: `${params.playerSide.toUpperCase()}'s draft rejected (${result.errors.length} validation error${
          result.errors.length === 1 ? '' : 's'
        }). Active ruleset remains v${snapshot.active_ruleset_version}.`,
        payload: {
          submission_id: result.submission_id,
          errors: result.errors,
        },
      });

      return { validation: result, match: snapshot };
    }

    // Activate new immutable ruleset version WITHOUT resetting the board position or altering side_to_move!
    const nextVersion = current.active_ruleset_version + 1;
    const newActiveRuleset: ActiveRuleset = {
      id: `ruleset_v${nextVersion}_${Date.now().toString(36)}`,
      match_id: current.id,
      version: nextVersion,
      source_json: structuredClone(parsedDoc),
      created_by: params.playerSide,
      created_at: result.timestamp,
      validation_status: 'ACCEPTED',
      change_summary: changeSummary,
    };

    current.active_ruleset_version = nextVersion;
    current.active_ruleset = newActiveRuleset;
    current.ruleset_history = [...current.ruleset_history, newActiveRuleset];
    current.state_version += 1;

    // Immediately re-evaluate current board position under the newly activated ruleset
    const evalUnderNewRules = evaluateMatchStatus(
      current.board,
      current.side_to_move,
      current.active_ruleset.source_json,
      current.en_passant_target
    );
    current.status = evalUnderNewRules.status;
    current.in_check_side = evalUnderNewRules.inCheckSide;

    result.activated_ruleset = structuredClone(newActiveRuleset);
    const snapshot = structuredClone(current);

    this.recordLog({
      id: `log_${Date.now()}`,
      timestamp: result.timestamp,
      method: 'POST',
      endpoint: `/matches/${params.matchId}/drafts/${params.draftId}/submit`,
      status: 200,
      durationMs: Math.max(8, Math.round(performance.now() - start)),
      requestBody: {
        player_id: params.playerSide,
        based_on_ruleset_version: params.basedOnRulesetVersion,
        turn_independent: true,
      },
      responseBody: {
        accepted: true,
        activated_version: nextVersion,
        change_summary: changeSummary,
        post_activation_status: snapshot.status,
      },
    });

    this.emitEvent({
      event_id: `evt_${this.eventSeq++}`,
      match_id: snapshot.id,
      sequence: this.eventSeq,
      type: 'RULESET_ACTIVATED',
      timestamp: result.timestamp,
      actor: params.playerSide,
      summary: `Ruleset v${nextVersion} activated by ${params.playerSide.toUpperCase()} (${changeSummary}) — independent of board turn (${snapshot.side_to_move.toUpperCase()} still to move).`,
      payload: {
        version: nextVersion,
        created_by: params.playerSide,
        change_summary: changeSummary,
        status: snapshot.status,
      },
    });

    return { validation: result, match: snapshot };
  }
}

export const gameApiClient = new GamePlatformApiClient();
