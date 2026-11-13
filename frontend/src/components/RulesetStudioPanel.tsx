import React, { useId, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Code2,
  Compass,
  FileCode2,
  GitBranch,
  History,
  Layers,
  Play,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Sparkles,
  UserCheck,
  Wand2,
} from 'lucide-react';
import { PRESET_RULESET_TEMPLATES, STANDARD_CHESS_RULESET_DOC } from '../engine/defaultRulesets';
import { computeSandboxPreviewMoves, coordToAlgebraic } from '../engine/localGameEngine';
import { describeMovementPattern } from '../engine/rulesetValidator';
import {
  DraftRuleset,
  MatchState,
  MovementPattern,
  MovementPrimitiveType,
  PieceType,
  PlayerSide,
  RulesetDocument,
  ValidationResult,
} from '../types/game';

export type StudioTab = 'editor' | 'sandbox' | 'validator' | 'history';

interface RulesetStudioPanelProps {
  match: MatchState;
  activeTab: StudioTab;
  onTabChange: (tab: StudioTab) => void;
  editorSeat: PlayerSide;
  onEditorSeatChange: (seat: PlayerSide) => void;
  drafts: Record<PlayerSide, DraftRuleset>;
  onUpdateDraftJson: (seat: PlayerSide, newRawJson: string) => void;
  onResetDraftToActive: (seat: PlayerSide) => void;
  onSubmitDraft: (seat: PlayerSide) => Promise<void>;
  lastValidation: ValidationResult | null;
  inspectedVersion: number;
  onSelectInspectedVersion: (ver: number) => void;
}

const PIECE_TYPES: PieceType[] = ['knight', 'bishop', 'rook', 'queen', 'pawn', 'king'];

const COMPOSABLE_PRIMITIVES: { type: MovementPrimitiveType; label: string; short: string }[] = [
  { type: 'standard_knight', label: 'Knight L-Jump', short: '2×1 Leap' },
  { type: 'sliding_bishop', label: 'Bishop Diagonals', short: 'Diag Slide' },
  { type: 'sliding_rook', label: 'Rook Orthogonals', short: 'Ortho Slide' },
  { type: 'queen', label: 'Queen Omnidirectional', short: '8-Dir Slide' },
  { type: 'king_step', label: 'King 1-Step', short: '1-Sq Step' },
  { type: 'standard_pawn', label: 'Standard Pawn', short: 'Pawn Push' },
];

export const RulesetStudioPanel: React.FC<RulesetStudioPanelProps> = ({
  match,
  activeTab,
  onTabChange,
  editorSeat,
  onEditorSeatChange,
  drafts,
  onUpdateDraftJson,
  onResetDraftToActive,
  onSubmitDraft,
  lastValidation,
  inspectedVersion,
  onSelectInspectedVersion,
}) => {
  const currentDraft = drafts[editorSeat];
  const [composerPiece, setComposerPiece] = useState<PieceType>('knight');
  const [sandboxPiece, setSandboxPiece] = useState<PieceType>('knight');
  const [sandboxSource, setSandboxSource] = useState<'draft' | 'active'>('draft');
  const [formatError, setFormatError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const codeRegionLabelId = useId();
  const historySourceLabelId = useId();

  // Check if current draft JSON differs from live active ruleset JSON
  const isDraftModifiedFromActive = useMemo(() => {
    try {
      const parsedDraft = JSON.parse(currentDraft.raw_json);
      return (
        JSON.stringify(parsedDraft) !== JSON.stringify(match.active_ruleset.source_json)
      );
    } catch {
      return true;
    }
  }, [currentDraft.raw_json, match.active_ruleset.source_json]);

  // Parse draft safely for the visual composer & sandbox preview
  const parsedDraftDoc = useMemo<RulesetDocument | null>(() => {
    try {
      const obj = JSON.parse(currentDraft.raw_json);
      if (obj && typeof obj === 'object' && obj.pieces) {
        return obj as RulesetDocument;
      }
      return null;
    } catch {
      return null;
    }
  }, [currentDraft.raw_json]);

  const lineCount = useMemo(
    () => currentDraft.raw_json.split('\n').length,
    [currentDraft.raw_json]
  );

  const handleFormatJson = () => {
    try {
      const parsed = JSON.parse(currentDraft.raw_json);
      onUpdateDraftJson(editorSeat, JSON.stringify(parsed, null, 2));
      setFormatError(null);
    } catch (err) {
      setFormatError(
        err instanceof Error ? `Cannot format malformed JSON: ${err.message}` : 'Invalid JSON'
      );
    }
  };

  const handleApplyPreset = (doc: RulesetDocument | Record<string, unknown>) => {
    setFormatError(null);
    onUpdateDraftJson(editorSeat, JSON.stringify(doc, null, 2));
  };

  // Visual Composer helper: toggle a primitive inside a piece's movement pattern in the draft
  const handleTogglePrimitiveOnPiece = (primitive: MovementPrimitiveType) => {
    const baseDoc: RulesetDocument = parsedDraftDoc
      ? structuredClone(parsedDraftDoc)
      : structuredClone(match.active_ruleset.source_json);

    const targetPieceDef = baseDoc.pieces[composerPiece];
    if (!targetPieceDef) return;

    const currentMove = targetPieceDef.movement;
    let currentList: MovementPattern[] = [];
    if (currentMove.type === 'combined' && Array.isArray(currentMove.patterns)) {
      currentList = [...currentMove.patterns];
    } else {
      currentList = [currentMove];
    }

    const existsIdx = currentList.findIndex((p) => p.type === primitive);
    if (existsIdx >= 0) {
      if (currentList.length > 1) {
        currentList.splice(existsIdx, 1);
      }
    } else {
      const newPattern: MovementPattern =
        primitive === 'sliding_bishop' || primitive === 'sliding_rook' || primitive === 'queen'
          ? { type: primitive, max_range: 7 }
          : { type: primitive };
      currentList.push(newPattern);
    }

    targetPieceDef.movement =
      currentList.length === 1
        ? currentList[0]
        : {
            type: 'combined',
            patterns: currentList,
          };

    onUpdateDraftJson(editorSeat, JSON.stringify(baseDoc, null, 2));
  };

  const handleUpdatePieceCustomName = (newName: string) => {
    if (!parsedDraftDoc) return;
    const nextDoc = structuredClone(parsedDraftDoc);
    nextDoc.pieces[composerPiece].name = newName;
    onUpdateDraftJson(editorSeat, JSON.stringify(nextDoc, null, 2));
  };

  const handleSubmitClick = async () => {
    setIsSubmitting(true);
    setFormatError(null);
    try {
      await onSubmitDraft(editorSeat);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Sandbox calculation
  const sandboxRulesetDoc =
    sandboxSource === 'draft' && parsedDraftDoc
      ? parsedDraftDoc
      : match.active_ruleset.source_json;

  const sandboxPreview = useMemo(
    () => computeSandboxPreviewMoves(sandboxPiece, sandboxRulesetDoc),
    [sandboxPiece, sandboxRulesetDoc]
  );

  // Selected version in History tab
  const inspectedRulesetObj = useMemo(
    () =>
      match.ruleset_history.find((r) => r.version === inspectedVersion) ??
      match.active_ruleset,
    [match.ruleset_history, inspectedVersion, match.active_ruleset]
  );

  const isOffTurnEditing = editorSeat !== match.side_to_move;

  return (
    <section
      className="panel studio-panel"
      aria-label="Turn-Independent Ruleset Studio and Validator"
    >
      {/* Studio Top Bar: Turn-Independence Control & Active Version Status */}
      <div className="panel-header studio-header">
        <div className="panel-title-group">
          <div className="studio-headline-row">
            <h2 className="studio-main-heading">
              <Code2 size={18} aria-hidden="true" />
              <span>Programmable Ruleset Studio</span>
            </h2>
            <span className="turn-independent-badge">
              Decoupled from Board Turns
            </span>
          </div>
          <p className="panel-subtitle">
            Draft edits stay local until validated &amp; activated. Either player can submit rule
            modifications even during the opponent&apos;s board turn.
          </p>
        </div>

        {/* Seat Switcher: Edit as White or Black independently of board turn */}
        <div className="seat-switcher-box" role="group" aria-label="Select player draft workspace">
          <span className="seat-switcher-label">Drafting Seat:</span>
          <div className="seat-buttons">
            <button
              type="button"
              className={`seat-btn ${editorSeat === 'white' ? 'seat-btn-active' : ''}`}
              onClick={() => onEditorSeatChange('white')}
              aria-pressed={editorSeat === 'white'}
            >
              <UserCheck size={14} aria-hidden="true" />
              <span>White Draft</span>
              {match.side_to_move !== 'white' && (
                <span className="off-turn-tag">Off-Turn</span>
              )}
            </button>
            <button
              type="button"
              className={`seat-btn ${editorSeat === 'black' ? 'seat-btn-active' : ''}`}
              onClick={() => onEditorSeatChange('black')}
              aria-pressed={editorSeat === 'black'}
            >
              <UserCheck size={14} aria-hidden="true" />
              <span>Black Draft</span>
              {match.side_to_move !== 'black' && (
                <span className="off-turn-tag">Off-Turn</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Turn-Independence Status Strip */}
      <div className="draft-isolation-banner">
        <div className="isolation-status-left">
          <span
            className={`draft-state-pill ${
              isDraftModifiedFromActive ? 'draft-dirty' : 'draft-clean'
            }`}
          >
            {isDraftModifiedFromActive
              ? 'UNSUBMITTED DRAFT (Live Board Unaffected)'
              : `Synced with Active v${match.active_ruleset_version}`}
          </span>
          <span className="isolation-meta">
            Base: <strong>v{currentDraft.based_on_ruleset_version}</strong> • Board Turn:{' '}
            <strong>{match.side_to_move.toUpperCase()}</strong>
            {isOffTurnEditing && (
              <span className="async-highlight">
                {' '}
                — Editing asynchronously while waiting for {match.side_to_move.toUpperCase()}!
              </span>
            )}
          </span>
        </div>

        <div className="isolation-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onResetDraftToActive(editorSeat)}
          >
            <RefreshCw size={14} aria-hidden="true" />
            <span>Sync to Active v{match.active_ruleset_version}</span>
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={isSubmitting}
            onClick={() => void handleSubmitClick()}
          >
            <Play size={14} aria-hidden="true" />
            <span>
              {isSubmitting
                ? 'Validating…'
                : `Validate & Activate (${editorSeat.toUpperCase()})`}
            </span>
          </button>
        </div>
      </div>

      {/* Studio Navigation Tabs */}
      <div className="studio-tabs" role="tablist" aria-label="Ruleset Studio Views">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'editor'}
          className={`studio-tab ${activeTab === 'editor' ? 'tab-active' : ''}`}
          onClick={() => onTabChange('editor')}
        >
          <FileCode2 size={15} aria-hidden="true" />
          <span>1. Draft Editor &amp; Presets</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'sandbox'}
          className={`studio-tab ${activeTab === 'sandbox' ? 'tab-active' : ''}`}
          onClick={() => onTabChange('sandbox')}
        >
          <Compass size={15} aria-hidden="true" />
          <span>2. Hypothetical Sandbox</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'validator'}
          className={`studio-tab ${activeTab === 'validator' ? 'tab-active' : ''}`}
          onClick={() => onTabChange('validator')}
        >
          <ShieldCheck size={15} aria-hidden="true" />
          <span>3. Validator Pipeline</span>
          {lastValidation && (
            <span
              className={`tab-status-pip ${
                lastValidation.accepted ? 'pip-pass' : 'pip-fail'
              }`}
            >
              {lastValidation.accepted ? 'PASS' : 'FAIL'}
            </span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'history'}
          className={`studio-tab ${activeTab === 'history' ? 'tab-active' : ''}`}
          onClick={() => onTabChange('history')}
        >
          <History size={15} aria-hidden="true" />
          <span>4. Ruleset History ({match.ruleset_history.length})</span>
        </button>
      </div>

      {/* TAB 1: DRAFT EDITOR & VISUAL COMPOSER */}
      {activeTab === 'editor' && (
        <div className="studio-tab-body">
          {/* Curated Stage Templates Bar */}
          <div className="presets-section">
            <div className="section-label-row">
              <span className="section-micro-label">
                <Wand2 size={13} aria-hidden="true" /> Load Staged Ruleset Preset into{' '}
                {editorSeat.toUpperCase()}&apos;s Draft:
              </span>
            </div>
            <div className="preset-pills-row">
              {PRESET_RULESET_TEMPLATES.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`preset-pill ${
                    preset.expectedOutcome === 'INVALID' ? 'preset-pill-danger' : ''
                  }`}
                  onClick={() => handleApplyPreset(preset.document)}
                >
                  <span className="preset-pill-title">{preset.name}</span>
                  <span className="preset-pill-badge">{preset.badge}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Visual Piece Primitive Composer */}
          {parsedDraftDoc && (
            <div className="visual-composer-box">
              <div className="composer-header">
                <span className="section-micro-label">
                  <Sliders size={13} aria-hidden="true" /> Quick Piece Movement Builder (auto-updates
                  JSON draft below):
                </span>
                <div className="composer-piece-selector">
                  {PIECE_TYPES.map((pt) => {
                    const def = parsedDraftDoc.pieces[pt];
                    return (
                      <button
                        key={pt}
                        type="button"
                        className={`composer-piece-tab ${
                          composerPiece === pt ? 'composer-piece-active' : ''
                        }`}
                        onClick={() => setComposerPiece(pt)}
                      >
                        <span aria-hidden="true">{def?.appearance?.white ?? ''}</span>
                        <span>{pt}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {parsedDraftDoc.pieces[composerPiece] && (
                <div className="composer-controls-row">
                  <div className="composer-name-field">
                    <label htmlFor="custom-piece-name" className="field-label">
                      Custom Piece Label:
                    </label>
                    <input
                      id="custom-piece-name"
                      type="text"
                      className="text-input"
                      value={parsedDraftDoc.pieces[composerPiece].name}
                      onChange={(e) => handleUpdatePieceCustomName(e.target.value)}
                    />
                  </div>

                  <div className="composer-primitives-group">
                    <span className="field-label">Combine Movement Primitives:</span>
                    <div className="primitive-toggle-list">
                      {COMPOSABLE_PRIMITIVES.map((prim) => {
                        const mv = parsedDraftDoc.pieces[composerPiece].movement;
                        const isActive =
                          mv.type === prim.type ||
                          (mv.type === 'combined' &&
                            mv.patterns?.some((p) => p.type === prim.type));
                        return (
                          <button
                            key={prim.type}
                            type="button"
                            aria-pressed={Boolean(isActive)}
                            className={`primitive-toggle-btn ${
                              isActive ? 'prim-btn-on' : ''
                            }`}
                            onClick={() => handleTogglePrimitiveOnPiece(prim.type)}
                          >
                            <span>{prim.label}</span>
                            <code className="prim-short">{prim.short}</code>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Code Editor Header & Validation Feedback Strip */}
          {formatError && (
            <div className="status-alert status-alert-error" role="alert">
              <AlertCircle size={15} aria-hidden="true" />
              <span>{formatError}</span>
            </div>
          )}

          {lastValidation && !lastValidation.accepted && (
            <div className="validation-inline-banner banner-rejected" role="alert">
              <div className="banner-main">
                <AlertCircle size={16} aria-hidden="true" />
                <span>
                  <strong>Draft Rejected by Backend Validator:</strong>{' '}
                  {lastValidation.errors[0]?.field_path} — {lastValidation.errors[0]?.message}
                </span>
              </div>
              <button
                type="button"
                className="btn-link"
                onClick={() => onTabChange('validator')}
              >
                View all {lastValidation.errors.length} error(s) →
              </button>
            </div>
          )}

          {lastValidation && lastValidation.accepted && (
            <div className="validation-inline-banner banner-accepted" role="status">
              <div className="banner-main">
                <CheckCircle2 size={16} aria-hidden="true" />
                <span>
                  <strong>Accepted &amp; Activated as Ruleset v{match.active_ruleset_version}!</strong>{' '}
                  ({match.active_ruleset.change_summary})
                </span>
              </div>
              <button
                type="button"
                className="btn-link"
                onClick={() => onTabChange('history')}
              >
                Inspect History →
              </button>
            </div>
          )}

          {/* Declarative JSON Editor with Line Numbers */}
          <div className="code-editor-shell">
            <div className="code-editor-toolbar">
              <span id={codeRegionLabelId} className="editor-file-title">
                draft_{editorSeat}_ruleset.json • Declarative Schema v1 ({lineCount} lines)
              </span>
              <div className="editor-toolbar-btns">
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={handleFormatJson}
                >
                  Format JSON
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => onTabChange('sandbox')}
                >
                  Test in Sandbox →
                </button>
              </div>
            </div>

            <div className="code-editor-Split">
              <div className="line-numbers-gutter" aria-hidden="true">
                {Array.from({ length: lineCount }, (_, idx) => (
                  <span key={idx + 1}>{idx + 1}</span>
                ))}
              </div>
              <textarea
                aria-labelledby={codeRegionLabelId}
                className="json-code-textarea"
                spellCheck={false}
                value={currentDraft.raw_json}
                onChange={(e) => onUpdateDraftJson(editorSeat, e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: HYPOTHETICAL MOVE SANDBOX (Test Draft vs Active Without Affecting Live Match) */}
      {activeTab === 'sandbox' && (
        <div className="studio-tab-body sandbox-tab-body">
          <div className="sandbox-controls-bar">
            <div className="sandbox-control-group">
              <span className="field-label">Inspect Piece Archetype:</span>
              <div className="composer-piece-selector">
                {PIECE_TYPES.map((pt) => (
                  <button
                    key={pt}
                    type="button"
                    className={`composer-piece-tab ${
                      sandboxPiece === pt ? 'composer-piece-active' : ''
                    }`}
                    onClick={() => setSandboxPiece(pt)}
                  >
                    <span>
                      {sandboxRulesetDoc.pieces[pt]?.appearance?.white ?? ''} {pt}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="sandbox-control-group">
              <span className="field-label">Rule Source Under Test:</span>
              <div className="seat-buttons">
                <button
                  type="button"
                  className={`seat-btn ${sandboxSource === 'draft' ? 'seat-btn-active' : ''}`}
                  onClick={() => setSandboxSource('draft')}
                >
                  <span>Unsubmitted {editorSeat.toUpperCase()} Draft</span>
                </button>
                <button
                  type="button"
                  className={`seat-btn ${sandboxSource === 'active' ? 'seat-btn-active' : ''}`}
                  onClick={() => setSandboxSource('active')}
                >
                  <span>Live Active Ruleset (v{match.active_ruleset_version})</span>
                </button>
              </div>
            </div>
          </div>

          <div className="sandbox-main-split">
            <div className="sandbox-mini-board-wrap">
              <div
                className="sandbox-grid"
                role="grid"
                aria-label={`Hypothetical movement probe for ${sandboxPiece}`}
              >
                {[0, 1, 2, 3, 4, 5, 6, 7].map((r) => (
                  <div key={r} className="sandbox-row" role="row">
                    {[0, 1, 2, 3, 4, 5, 6, 7].map((c) => {
                      const isOrigin =
                        sandboxPreview.origin.row === r && sandboxPreview.origin.col === c;
                      const isAlly =
                        sandboxPreview.friendlyBlocker.row === r &&
                        sandboxPreview.friendlyBlocker.col === c;
                      const isEnemy =
                        sandboxPreview.enemyTarget.row === r &&
                        sandboxPreview.enemyTarget.col === c;
                      const moveHit = sandboxPreview.moves.find(
                        (m) => m.to.row === r && m.to.col === c
                      );
                      const isLight = (r + c) % 2 === 0;
                      const sqName = coordToAlgebraic({ row: r, col: c });

                      return (
                        <div
                          key={sqName}
                          role="gridcell"
                          className={[
                            'sandbox-cell',
                            isLight ? 'sq-light' : 'sq-dark',
                            isOrigin ? 'sandbox-origin' : '',
                            moveHit
                              ? moveHit.isCapture
                                ? 'sandbox-hit-capture'
                                : 'sandbox-hit-move'
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          <span className="sandbox-sq-coord">{sqName}</span>
                          {isOrigin && (
                            <span className="sandbox-piece-icon">
                              {sandboxRulesetDoc.pieces[sandboxPiece]?.appearance.white}
                            </span>
                          )}
                          {isAlly && <span className="sandbox-blocker-tag">♙ Ally</span>}
                          {isEnemy && <span className="sandbox-enemy-tag">♟ FoE</span>}
                          {moveHit && !isEnemy && (
                            <span className="sandbox-vector-dot" aria-hidden="true" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            <div className="sandbox-explanation-card">
              <h3 className="card-heading">
                {sandboxRulesetDoc.pieces[sandboxPiece]?.name} ({sandboxPiece.toUpperCase()}) Vector
                Analysis
              </h3>
              <p className="sandbox-meta-p">
                <strong>Evaluated Definition:</strong>{' '}
                {sandboxRulesetDoc.pieces[sandboxPiece]
                  ? describeMovementPattern(sandboxRulesetDoc.pieces[sandboxPiece].movement)
                  : 'N/A'}
              </p>
              <div className="sandbox-stats-grid">
                <div className="stat-box">
                  <span className="stat-val">{sandboxPreview.moves.length}</span>
                  <span className="stat-lbl">Reachable Squares from d4</span>
                </div>
                <div className="stat-box">
                  <span className="stat-val">
                    {sandboxPreview.moves.some((m) => m.isCapture) ? 'Yes (f6)' : 'No'}
                  </span>
                  <span className="stat-lbl">Captures Enemy on f6</span>
                </div>
              </div>
              <p className="helper-note">
                <strong>Why this matters:</strong> When an opponent activates an unfamiliar or
                intentionally complex ruleset mid-match, inspect it here to test how their pieces
                interact with friendly blockers (<code>d6</code>) and capture targets (
                <code>f6</code>) without risking a move on the live board.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: 7-STAGE AUTHORITATIVE VALIDATOR REPORT */}
      {activeTab === 'validator' && (
        <div className="studio-tab-body validator-tab-body">
          <div className="validator-intro">
            <div>
              <h3 className="card-heading">
                7-Stage Authoritative Validation &amp; Safety Pipeline
              </h3>
              <p className="helper-note">
                Player drafts are never executed with <code>eval</code> or arbitrary code. Every
                submission passes through schema, allowlist, resource bounds, game invariants, and
                deterministic probe tests.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void handleSubmitClick()}
            >
              <ShieldCheck size={14} aria-hidden="true" />
              <span>Run Validation &amp; Activate</span>
            </button>
          </div>

          {!lastValidation ? (
            <div className="empty-validator-box">
              <Layers size={28} aria-hidden="true" />
              <p>
                No draft has been submitted in this session yet. Click{' '}
                <strong>Validate &amp; Activate</strong> above (or load the{' '}
                <em>Invalid / Unsafe Payload Test</em> preset in Tab 1) to inspect the 7-stage
                report.
              </p>
            </div>
          ) : (
            <div className="validator-results-stack">
              <div
                className={`validator-summary-card ${
                  lastValidation.accepted ? 'summary-pass' : 'summary-fail'
                }`}
              >
                <div>
                  <strong>
                    Submission {lastValidation.submission_id}:{' '}
                    {lastValidation.accepted ? 'ACCEPTED & ACTIVATED' : 'REJECTED'}
                  </strong>
                  <p className="helper-note">
                    Validated against Ruleset v{lastValidation.based_on_ruleset_version} &amp; Match
                    State #{lastValidation.based_on_state_version} at{' '}
                    {new Date(lastValidation.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              </div>

              {lastValidation.errors.length > 0 && (
                <div className="validator-errors-list" role="alert">
                  <h4 className="sub-heading">Structured Field-Path Rejections:</h4>
                  <ul>
                    {lastValidation.errors.map((err, i) => (
                      <li key={i} className="error-item-row">
                        <code className="err-stage-tag">{err.stage}</code>
                        <code className="err-path-tag">{err.field_path}</code>
                        <span className="err-msg-text">{err.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="stages-checklist">
                {lastValidation.stages.map((st) => (
                  <div
                    key={st.stage}
                    className={`stage-row ${st.passed ? 'stage-row-pass' : 'stage-row-fail'}`}
                  >
                    <span className="stage-icon" aria-hidden="true">
                      {st.passed ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                    </span>
                    <div className="stage-info">
                      <strong>{st.label}</strong>
                      <span>{st.detail}</span>
                    </div>
                    <span className="stage-badge">{st.passed ? 'PASSED' : 'FAILED'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: IMMUTABLE RULESET VERSION HISTORY & DIFF */}
      {activeTab === 'history' && (
        <div className="studio-tab-body history-tab-body">
          <div className="history-split">
            <div className="history-timeline-list">
              <h3 className="card-heading">Activated Ruleset Versions (Immutable)</h3>
              <ul className="version-cards-list">
                {[...match.ruleset_history].reverse().map((rs) => {
                  const isCurrentActive = rs.version === match.active_ruleset_version;
                  const isSelected = rs.version === inspectedRulesetObj.version;
                  return (
                    <li key={rs.id}>
                      <button
                        type="button"
                        className={`version-card-btn ${
                          isSelected ? 'version-card-selected' : ''
                        }`}
                        onClick={() => onSelectInspectedVersion(rs.version)}
                      >
                        <div className="version-card-top">
                          <span className="version-num-tag">Ruleset v{rs.version}</span>
                          {isCurrentActive && (
                            <span className="live-active-badge">LIVE ON BOARD</span>
                          )}
                        </div>
                        <p className="version-summary-text">{rs.change_summary}</p>
                        <span className="version-meta-foot">
                          Submitted by <strong>{rs.created_by.toUpperCase()}</strong> •{' '}
                          {new Date(rs.created_at).toLocaleTimeString()}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="history-inspector-pane">
              <div className="inspector-card-header">
                <div>
                  <h3 id={historySourceLabelId} className="card-heading">
                    Inspecting Ruleset v{inspectedRulesetObj.version} Source &amp; Diff vs Baseline
                  </h3>
                  <span className="helper-note">{inspectedRulesetObj.change_summary}</span>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => {
                    onUpdateDraftJson(
                      editorSeat,
                      JSON.stringify(inspectedRulesetObj.source_json, null, 2)
                    );
                    onTabChange('editor');
                  }}
                >
                  <GitBranch size={13} aria-hidden="true" />
                  <span>Load v{inspectedRulesetObj.version} into My Draft</span>
                </button>
              </div>

              {/* Piece-by-piece diff summary against Standard Baseline */}
              <div className="diff-summary-strip">
                {PIECE_TYPES.map((pt) => {
                  const inspectedPiece = inspectedRulesetObj.source_json.pieces[pt];
                  const stdPiece = STANDARD_CHESS_RULESET_DOC.pieces[pt];
                  const isChanged =
                    JSON.stringify(inspectedPiece.movement) !==
                    JSON.stringify(stdPiece.movement);
                  return (
                    <div
                      key={pt}
                      className={`diff-piece-row ${isChanged ? 'diff-row-changed' : ''}`}
                    >
                      <span className="diff-piece-name">
                        {inspectedPiece.appearance.white} <strong>{inspectedPiece.name}</strong> (
                        {pt})
                      </span>
                      <span className="diff-piece-desc">
                        {describeMovementPattern(inspectedPiece.movement)}
                      </span>
                      <span className="diff-tag">
                        {isChanged ? (
                          <>
                            <Sparkles size={12} aria-hidden="true" /> Modified
                          </>
                        ) : (
                          'Standard'
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>

              <pre
                role="region"
                aria-labelledby={historySourceLabelId}
                tabIndex={0}
                className="immutable-source-pre"
              >
                <code>{JSON.stringify(inspectedRulesetObj.source_json, null, 2)}</code>
              </pre>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
