import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Bell,
  Blocks,
  Cpu,
  Layers,
  Server,
  Sparkles,
  Swords,
} from 'lucide-react';
import { ArchitectureAndApiModal } from './components/ArchitectureAndApiModal';
import { ChessboardPanel } from './components/ChessboardPanel';
import { RulesetStudioPanel, StudioTab } from './components/RulesetStudioPanel';
import { STANDARD_CHESS_RULESET_DOC } from './engine/defaultRulesets';
import { gameApiClient, TransportMode } from './services/apiClient';
import {
  ApiExchangeLog,
  DraftRuleset,
  LegalMoveOption,
  MatchEventEnvelope,
  MatchState,
  PieceType,
  PlayerSide,
  ValidationResult,
} from './types/game';

function createInitialDraft(
  seat: PlayerSide,
  matchId: string,
  rulesetVersion: number,
  stateVersion: number,
  doc = STANDARD_CHESS_RULESET_DOC
): DraftRuleset {
  return {
    id: `draft_${seat}_01`,
    match_id: matchId,
    player_id: seat,
    raw_json: JSON.stringify(doc, null, 2),
    based_on_ruleset_version: rulesetVersion,
    based_on_state_version: stateVersion,
    status: 'EDITING',
    last_updated_at: new Date().toISOString(),
  };
}

export const App: React.FC = () => {
  const [match, setMatch] = useState<MatchState | null>(null);
  const [studioTab, setStudioTab] = useState<StudioTab>('editor');
  const [editorSeat, setEditorSeat] = useState<PlayerSide>('white');
  const [drafts, setDrafts] = useState<Record<PlayerSide, DraftRuleset> | null>(null);
  const [lastValidation, setLastValidation] = useState<ValidationResult | null>(null);
  const [inspectedVersion, setInspectedVersion] = useState<number>(1);

  const [events, setEvents] = useState<MatchEventEnvelope[]>([]);
  const [apiLogs, setApiLogs] = useState<ApiExchangeLog[]>([]);
  const [liveAnnouncement, setLiveAnnouncement] = useState<string>('');

  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [modalView, setModalView] = useState<'protocol' | 'roadmap'>('protocol');
  const [transportMode, setTransportMode] = useState<TransportMode>(
    gameApiClient.getTransportMode()
  );
  const [baseUrl, setBaseUrl] = useState<string>(gameApiClient.getBaseUrl());

  // Subscribe to realtime match events & API logs
  useEffect(() => {
    const unsubEvents = gameApiClient.subscribeEvents((evt) => {
      setEvents((prev) => [evt, ...prev].slice(0, 30));
      setLiveAnnouncement(evt.summary);
    });
    const unsubLogs = gameApiClient.subscribeLogs((log) => {
      setApiLogs((prev) => [log, ...prev].slice(0, 40));
    });

    void gameApiClient.createMatch().then((initialMatch) => {
      setMatch(initialMatch);
      setInspectedVersion(initialMatch.active_ruleset_version);
      setDrafts({
        white: createInitialDraft(
          'white',
          initialMatch.id,
          initialMatch.active_ruleset_version,
          initialMatch.state_version,
          initialMatch.active_ruleset.source_json
        ),
        black: createInitialDraft(
          'black',
          initialMatch.id,
          initialMatch.active_ruleset_version,
          initialMatch.state_version,
          initialMatch.active_ruleset.source_json
        ),
      });
    });

    return () => {
      unsubEvents();
      unsubLogs();
    };
  }, []);

  const handleSubmitMove = useCallback(
    async (playerSide: PlayerSide, move: LegalMoveOption, promotionChoice?: PieceType) => {
      if (!match) return;
      const res = await gameApiClient.submitMove({
        matchId: match.id,
        playerSide,
        move,
        promotionChoice,
        expectedStateVersion: match.state_version,
        expectedRulesetVersion: match.active_ruleset_version,
      });
      if (!res.accepted) {
        throw new Error(res.error || 'Move rejected by authoritative engine');
      }
      setMatch(res.match);
    },
    [match]
  );

  const handleResetMatch = useCallback(async () => {
    const fresh = await gameApiClient.createMatch();
    setMatch(fresh);
    setLastValidation(null);
    setInspectedVersion(fresh.active_ruleset_version);
    setDrafts({
      white: createInitialDraft(
        'white',
        fresh.id,
        fresh.active_ruleset_version,
        fresh.state_version,
        fresh.active_ruleset.source_json
      ),
      black: createInitialDraft(
        'black',
        fresh.id,
        fresh.active_ruleset_version,
        fresh.state_version,
        fresh.active_ruleset.source_json
      ),
    });
  }, []);

  const handleUpdateDraftJson = useCallback((seat: PlayerSide, newRawJson: string) => {
    setDrafts((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [seat]: {
          ...prev[seat],
          raw_json: newRawJson,
          status: 'EDITING',
          last_updated_at: new Date().toISOString(),
        },
      };
    });
  }, []);

  const handleResetDraftToActive = useCallback(
    (seat: PlayerSide) => {
      if (!match) return;
      setDrafts((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          [seat]: createInitialDraft(
            seat,
            match.id,
            match.active_ruleset_version,
            match.state_version,
            match.active_ruleset.source_json
          ),
        };
      });
    },
    [match]
  );

  const handleSubmitDraft = useCallback(
    async (seat: PlayerSide) => {
      if (!match || !drafts) return;
      const seatDraft = drafts[seat];
      const { validation, match: updatedMatch } = await gameApiClient.submitDraftRuleset({
        matchId: match.id,
        draftId: seatDraft.id,
        playerSide: seat,
        rawJson: seatDraft.raw_json,
        basedOnRulesetVersion: seatDraft.based_on_ruleset_version,
        basedOnStateVersion: seatDraft.based_on_state_version,
      });

      setLastValidation(validation);
      setMatch(updatedMatch);

      if (validation.accepted) {
        setInspectedVersion(updatedMatch.active_ruleset_version);
        setDrafts((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            [seat]: {
              ...prev[seat],
              based_on_ruleset_version: updatedMatch.active_ruleset_version,
              based_on_state_version: updatedMatch.state_version,
              status: 'ACCEPTED',
              last_updated_at: new Date().toISOString(),
            },
          };
        });
      } else {
        setDrafts((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            [seat]: {
              ...prev[seat],
              status: 'REJECTED',
              last_updated_at: new Date().toISOString(),
            },
          };
        });
      }
    },
    [match, drafts]
  );

  const handleInspectRulesetVersion = useCallback((version: number) => {
    setInspectedVersion(version);
    setStudioTab('history');
  }, []);

  const handleChangeTransport = useCallback((mode: TransportMode, customUrl: string) => {
    gameApiClient.setTransportMode(mode, customUrl);
    setTransportMode(mode);
    setBaseUrl(gameApiClient.getBaseUrl());
  }, []);

  if (!match || !drafts) {
    return (
      <div className="loading-screen">
        <p>Initializing Programmable Turn-Based Game Engine…</p>
      </div>
    );
  }

  const latestEvent = events[0] ?? null;

  return (
    <div className="app-shell">
      <a href="#main-workbench" className="skip-link visually-hidden">
        Skip to main game workbench
      </a>

      {/* Centralized Polite Live Region for Screen Readers */}
      <div className="visually-hidden" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </div>

      {/* Top Application Header */}
      <header className="top-header">
        <div className="brand-cluster">
          <div className="brand-emblem" aria-hidden="true">
            <Swords size={20} />
          </div>
          <div>
            <div className="brand-title-row">
              <h1 className="brand-title">THE MADDNESS</h1>
              <span className="platform-tag">Programmable Turn-Based Strategy Platform</span>
            </div>
            <p className="brand-tagline">
              Play turn-based matches while editing &amp; activating live game rules independently of
              whose turn it is.
            </p>
          </div>
        </div>

        {/* Game Cartridge & Architecture Navigation */}
        <nav className="header-nav" aria-label="Platform Controls and Architecture">
          <div className="cartridge-selector" title="Modular Turn-Based Game Engine Cartridge">
            <Blocks size={15} aria-hidden="true" />
            <label htmlFor="game-cartridge-select" className="visually-hidden">
              Active Turn-Based Game Cartridge
            </label>
            <select
              id="game-cartridge-select"
              className="cartridge-select"
              defaultValue="programmable_chess"
            >
              <option value="programmable_chess">
                Cartridge: Programmable Chess (Stage 1–7 Active)
              </option>
              <option value="tactical_shogi" disabled>
                Cartridge: Programmable Shogi (Stage 11 Planned)
              </option>
              <option value="hex_skirmish" disabled>
                Cartridge: Grid Tactics Skirmish (Stage 11 Planned)
              </option>
            </select>
          </div>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setModalView('roadmap');
              setModalOpen(true);
            }}
          >
            <Layers size={15} aria-hidden="true" />
            <span>Staged Roadmap</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setModalView('protocol');
              setModalOpen(true);
            }}
          >
            {transportMode === 'simulated' ? (
              <Cpu size={15} aria-hidden="true" />
            ) : (
              <Server size={15} aria-hidden="true" />
            )}
            <span>
              Engine: {transportMode === 'simulated' ? 'Local Adapter' : 'FastAPI Remote'}
            </span>
            <span className="telemetry-count-badge">{apiLogs.length}</span>
          </button>
        </nav>
      </header>

      {/* Realtime Synchronization & Rule-Activation Notification Bar */}
      {latestEvent && (
        <aside className="realtime-event-bar" aria-label="Latest Match Event Notification">
          <div className="event-bar-left">
            <span
              className={`event-type-tag event-tag-${latestEvent.type.toLowerCase()}`}
            >
              <Bell size={13} aria-hidden="true" />
              <span>{latestEvent.type}</span>
            </span>
            <span className="event-summary-text">{latestEvent.summary}</span>
          </div>
          <div className="event-bar-right">
            {latestEvent.type === 'RULESET_ACTIVATED' && (
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() =>
                  handleInspectRulesetVersion(match.active_ruleset_version)
                }
              >
                <Sparkles size={13} aria-hidden="true" />
                <span>Inspect Activated v{match.active_ruleset_version} Source</span>
              </button>
            )}
            <button
              type="button"
              className="btn-link"
              onClick={() => {
                setModalView('protocol');
                setModalOpen(true);
              }}
            >
              <Activity size={13} aria-hidden="true" />
              <span>Event Seq #{latestEvent.sequence}</span>
            </button>
          </div>
        </aside>
      )}

      {/* Split-Screen Workbench: Left = Turn-Based Board, Right = Turn-Independent Ruleset Studio */}
      <main id="main-workbench" tabIndex={-1} className="split-workbench">
        <ChessboardPanel
          match={match}
          onSubmitMove={handleSubmitMove}
          onResetMatch={handleResetMatch}
          onInspectRulesetVersion={handleInspectRulesetVersion}
        />

        <RulesetStudioPanel
          match={match}
          activeTab={studioTab}
          onTabChange={setStudioTab}
          editorSeat={editorSeat}
          onEditorSeatChange={setEditorSeat}
          drafts={drafts}
          onUpdateDraftJson={handleUpdateDraftJson}
          onResetDraftToActive={handleResetDraftToActive}
          onSubmitDraft={handleSubmitDraft}
          lastValidation={lastValidation}
          inspectedVersion={inspectedVersion}
          onSelectInspectedVersion={setInspectedVersion}
        />
      </main>

      {/* Footer with Authoritative Architecture Guarantees */}
      <footer className="app-footer">
        <div className="footer-left">
          <span>
            <strong>The Maddness Prototype</strong> • Match ID: <code>{match.id}</code> • State
            Version: <code>#{match.state_version}</code> • Active Ruleset:{' '}
            <code>v{match.active_ruleset_version}</code>
          </span>
        </div>
        <div className="footer-right">
          <span>
            Authoritative Separation: Game State ≠ Active Ruleset ≠ Player Drafts • Zero{' '}
            <code>eval()</code> Execution
          </span>
        </div>
      </footer>

      {/* Architecture & Backend API Inspector Modal */}
      <ArchitectureAndApiModal
        isOpen={modalOpen}
        initialView={modalView}
        onClose={() => setModalOpen(false)}
        transportMode={transportMode}
        baseUrl={baseUrl}
        onChangeTransport={handleChangeTransport}
        apiLogs={apiLogs}
      />
    </div>
  );
};
