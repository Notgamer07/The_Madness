export type PlayerSide = 'white' | 'black';

export type PieceType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';

export type MovementPrimitiveType =
  | 'standard_pawn'
  | 'standard_knight'
  | 'sliding_bishop'
  | 'sliding_rook'
  | 'queen'
  | 'king_step'
  | 'bounded_offsets'
  | 'combined';

export interface OffsetVector {
  dr: number;
  dc: number;
  jump?: boolean;
  capture_only?: boolean;
  move_only?: boolean;
}

export interface MovementPattern {
  type: MovementPrimitiveType;
  /** Used when type === 'bounded_offsets' */
  offsets?: OffsetVector[];
  /** Used when type === 'sliding_bishop' | 'sliding_rook' | 'queen' */
  max_range?: number;
  /** Used when type === 'combined' */
  patterns?: MovementPattern[];
  /** Optional condition such as only_from_back_rank or can_jump_blockers */
  can_jump?: boolean;
}

export interface PieceRuleDefinition {
  name: string;
  movement: MovementPattern;
  appearance: {
    white: string;
    black: string;
  };
  description?: string;
}

export interface RulesetDocument {
  schema_version: 1;
  metadata?: {
    title?: string;
    summary?: string;
    author_side?: PlayerSide;
  };
  pieces: Record<PieceType, PieceRuleDefinition>;
}

export interface ActiveRuleset {
  id: string;
  match_id: string;
  version: number;
  source_json: RulesetDocument;
  created_by: PlayerSide | 'system';
  created_at: string;
  validation_status: 'ACCEPTED';
  change_summary: string;
}

export interface DraftRuleset {
  id: string;
  match_id: string;
  player_id: PlayerSide;
  raw_json: string;
  based_on_ruleset_version: number;
  based_on_state_version: number;
  status: 'EDITING' | 'VALIDATING' | 'ACCEPTED' | 'REJECTED' | 'STALE';
  last_updated_at: string;
}

export type ValidationStage =
  | 'PARSE_SCHEMA'
  | 'ALLOWLIST'
  | 'RESOURCE_LIMITS'
  | 'GAME_INVARIANTS'
  | 'BEHAVIOUR_TESTS'
  | 'ACTIVATION_PRECONDITIONS'
  | 'AUDIT';

export interface ValidationStageReport {
  stage: ValidationStage;
  label: string;
  passed: boolean;
  detail: string;
}

export interface ValidationErrorItem {
  stage: ValidationStage;
  field_path: string;
  message: string;
}

export interface ValidationResult {
  submission_id: string;
  accepted: boolean;
  timestamp: string;
  based_on_ruleset_version: number;
  based_on_state_version: number;
  stages: ValidationStageReport[];
  errors: ValidationErrorItem[];
  activated_ruleset?: ActiveRuleset;
}

export interface BoardPiece {
  id: string;
  type: PieceType;
  side: PlayerSide;
  hasMoved?: boolean;
}

export type BoardGrid = (BoardPiece | null)[][]; // 8x8 [row 0..7 (rank 8..1)][col 0..7 (file a..h)]

export interface SquareCoord {
  row: number;
  col: number;
}

export interface LegalMoveOption {
  from: SquareCoord;
  to: SquareCoord;
  algFrom: string;
  algTo: string;
  isCapture: boolean;
  isPromotion?: boolean;
  isCastling?: 'kingside' | 'queenside';
  isEnPassant?: boolean;
  governedByPrimitive: string;
}

export interface MoveRecord {
  id: string;
  match_id: string;
  sequence_no: number;
  player_id: PlayerSide;
  notation: string;
  from_sq: string;
  to_sq: string;
  piece_type: PieceType;
  piece_custom_name: string;
  captured_piece?: PieceType;
  resulting_fen: string;
  ruleset_version: number;
  timestamp: string;
  was_check: boolean;
  was_checkmate: boolean;
}

export type MatchTerminalStatus =
  | 'IN_PROGRESS'
  | 'CHECK'
  | 'CHECKMATE_WHITE_WINS'
  | 'CHECKMATE_BLACK_WINS'
  | 'STALEMATE'
  | 'DRAW';

export interface MatchState {
  id: string;
  game_module: 'programmable_chess';
  white_player_id: string;
  black_player_id: string;
  side_to_move: PlayerSide;
  status: MatchTerminalStatus;
  in_check_side: PlayerSide | null;
  fen: string;
  board: BoardGrid;
  state_version: number;
  active_ruleset_version: number;
  active_ruleset: ActiveRuleset;
  ruleset_history: ActiveRuleset[];
  moves: MoveRecord[];
  en_passant_target: SquareCoord | null;
}

export type RealtimeEventType =
  | 'MOVE_ACCEPTED'
  | 'MOVE_REJECTED'
  | 'RULESET_ACTIVATED'
  | 'DRAFT_REJECTED'
  | 'MATCH_RESET';

export interface MatchEventEnvelope<TPayload = unknown> {
  event_id: string;
  match_id: string;
  sequence: number;
  type: RealtimeEventType;
  timestamp: string;
  actor: PlayerSide | 'system';
  summary: string;
  payload: TPayload;
}

export interface ApiExchangeLog {
  id: string;
  timestamp: string;
  method: 'GET' | 'POST' | 'WS_OUT' | 'WS_IN';
  endpoint: string;
  status: number | 'EVENT';
  durationMs: number;
  requestBody?: unknown;
  responseBody?: unknown;
}

export interface PresetRulesetTemplate {
  id: string;
  name: string;
  badge: string;
  description: string;
  targetPiece: string;
  expectedOutcome: 'VALID' | 'INVALID';
  document: RulesetDocument | Record<string, unknown>;
}
