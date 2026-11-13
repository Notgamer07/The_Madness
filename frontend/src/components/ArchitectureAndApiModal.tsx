import React, { useEffect, useId, useRef, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Cpu,
  Database,
  Globe,
  Layers,
  Server,
  Terminal,
  X,
} from 'lucide-react';
import { TransportMode } from '../services/apiClient';
import { ApiExchangeLog } from '../types/game';

interface ArchitectureAndApiModalProps {
  isOpen: boolean;
  initialView: 'protocol' | 'roadmap';
  onClose: () => void;
  transportMode: TransportMode;
  baseUrl: string;
  onChangeTransport: (mode: TransportMode, customUrl: string) => void;
  apiLogs: ApiExchangeLog[];
}

const STAGED_ROADMAP = [
  {
    stage: 'Stage 0–2',
    title: 'Repository Setup, Standard Chess Baseline & React Board UI',
    status: 'Frontend Ready',
    notes:
      '8×8 interactive board, algebraic coordinates, castling, en passant, promotion modal, check/checkmate banner, and move history.',
  },
  {
    stage: 'Stage 3–4',
    title: 'Declarative Ruleset Schema (v1) & Custom Rules Evaluator',
    status: 'Frontend + Local Engine Ready',
    notes:
      'Strict separation of MatchState, ActiveRuleset, and DraftRuleset. Supports standard_knight, sliding_bishop, sliding_rook, queen, king_step, bounded_offsets, and combined patterns.',
  },
  {
    stage: 'Stage 5–6',
    title: 'Turn-Independent Live Activation & 7-Stage Validator',
    status: 'Frontend + Validator Ready',
    notes:
      'Either player can submit rule modifications at any time without resetting board state or consuming a board turn. Rejects unknown keys, disallowed primitives, and out-of-bounds vectors.',
  },
  {
    stage: 'Stage 7',
    title: 'Split-Screen Draft Editor, Presets & Source Inspection',
    status: 'Frontend Ready',
    notes:
      'Isolated White & Black draft workspaces, JSON formatting, visual primitive composer, and immutable ruleset history.',
  },
  {
    stage: 'Stage 8–9',
    title: 'FastAPI Backend, WebSockets & PostgreSQL Persistence',
    status: 'API & WS Contracts Wired',
    notes:
      'REST client (POST /matches/{id}/moves, POST /matches/{id}/drafts/{draft_id}/submit) + WebSocket /matches/{id}/live event envelope.',
  },
  {
    stage: 'Stage 10–11',
    title: 'Hypothetical Move Sandbox, Visual Diffs & Multi-Game Cartridges',
    status: 'Preview Included',
    notes:
      'Includes the 8×8 Hypothetical Move Sandbox tab, Baseline Diff inspector, and modular game_module architecture.',
  },
];

export const ArchitectureAndApiModal: React.FC<ArchitectureAndApiModalProps> = ({
  isOpen,
  initialView,
  onClose,
  transportMode,
  baseUrl,
  onChangeTransport,
  apiLogs,
}) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();
  const logRegionId = useId();
  const [view, setView] = useState<'protocol' | 'roadmap'>(initialView);
  const [urlInput, setUrlInput] = useState<string>(baseUrl);

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleNativeClose = () => {
      dialog.returnValue = ''; // Reset returnValue per modern-web-guidance dialog spec
      onClose();
    };

    dialog.addEventListener('close', handleNativeClose);

    // Fallback for browsers without native closedby="any" support
    let cleanupBackdrop: (() => void) | undefined;
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const onBackdropClick = (event: MouseEvent) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isInDialog =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (!isInDialog) {
          dialog.close();
        }
      };
      dialog.addEventListener('click', onBackdropClick);
      cleanupBackdrop = () => dialog.removeEventListener('click', onBackdropClick);
    }

    return () => {
      dialog.removeEventListener('close', handleNativeClose);
      cleanupBackdrop?.();
    };
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="native-modal arch-modal"
      {...({ closedby: 'any' } as React.DialogHTMLAttributes<HTMLDialogElement>)}
    >
      <div className="arch-modal-inner">
        <div className="arch-modal-header">
          <div>
            <h2 id={titleId} className="modal-heading">
              Backend Engine Contract &amp; Staged Architecture
            </h2>
            <p className="modal-subtext">
              Designed for seamless transition from in-browser authoritative simulation to FastAPI +
              python-chess + custom rules evaluator + PostgreSQL.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close Architecture and Protocol Inspector"
          >
            <X size={16} aria-hidden="true" />
            <span>Close</span>
          </button>
        </div>

        <div className="studio-tabs modal-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'protocol'}
            className={`studio-tab ${view === 'protocol' ? 'tab-active' : ''}`}
            onClick={() => setView('protocol')}
          >
            <Terminal size={15} aria-hidden="true" />
            <span>Backend Transport &amp; API Telemetry ({apiLogs.length})</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'roadmap'}
            className={`studio-tab ${view === 'roadmap' ? 'tab-active' : ''}`}
            onClick={() => setView('roadmap')}
          >
            <Layers size={15} aria-hidden="true" />
            <span>Docx Staged Roadmap (Stages 0–11)</span>
          </button>
        </div>

        {view === 'protocol' ? (
          <div className="arch-modal-body">
            {/* Transport Mode Switcher */}
            <div className="transport-config-card">
              <div className="transport-options-row">
                <button
                  type="button"
                  className={`transport-option-btn ${
                    transportMode === 'simulated' ? 'transport-active' : ''
                  }`}
                  onClick={() => onChangeTransport('simulated', urlInput)}
                >
                  <Cpu size={18} aria-hidden="true" />
                  <div>
                    <strong>Local Authoritative Engine Adapter (Active Default)</strong>
                    <span>
                      Executes 7-stage validator &amp; custom rules evaluator in-memory with identical
                      REST/WS contracts.
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  className={`transport-option-btn ${
                    transportMode === 'remote' ? 'transport-active' : ''
                  }`}
                  onClick={() => onChangeTransport('remote', urlInput)}
                >
                  <Server size={18} aria-hidden="true" />
                  <div>
                    <strong>Remote FastAPI + Game Engine Server</strong>
                    <span>
                      Sends HTTP requests to <code>{urlInput}</code> and subscribes to{' '}
                      <code>/matches/&#123;id&#125;/live</code> WebSocket.
                    </span>
                  </div>
                </button>
              </div>

              <div className="endpoint-input-row">
                <label htmlFor="backend-url-input" className="field-label">
                  FastAPI Base URL:
                </label>
                <input
                  id="backend-url-input"
                  type="url"
                  className="text-input"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => onChangeTransport(transportMode, urlInput)}
                >
                  Apply Endpoint
                </button>
              </div>
            </div>

            {/* Contract Table */}
            <div className="contract-grid-box">
              <h3 className="card-heading">
                <Globe size={15} aria-hidden="true" /> Wired REST &amp; WebSocket Endpoints (from{' '}
                <code>02_Technical_Implementation_Plan.docx</code> §12)
              </h3>
              <div className="endpoints-pill-grid">
                <code>POST /matches</code>
                <code>GET /matches/&#123;id&#125;</code>
                <code>POST /matches/&#123;id&#125;/moves</code>
                <code>POST /matches/&#123;id&#125;/drafts</code>
                <code>POST /matches/&#123;id&#125;/drafts/&#123;draft_id&#125;/submit</code>
                <code>GET /matches/&#123;id&#125;/rulesets</code>
                <code>WS /matches/&#123;id&#125;/live</code>
              </div>
            </div>

            {/* Live Request / Event Telemetry */}
            <div className="telemetry-log-section">
              <h3 id={logRegionId} className="card-heading">
                <Activity size={15} aria-hidden="true" /> Live Request &amp; WebSocket Event Log
              </h3>
              <div
                role="region"
                aria-labelledby={logRegionId}
                tabIndex={0}
                className="api-logs-scroll"
              >
                {apiLogs.map((log) => (
                  <div key={log.id} className="api-log-entry">
                    <div className="api-log-meta">
                      <span className={`method-badge method-${log.method.toLowerCase()}`}>
                        {log.method}
                      </span>
                      <code className="log-endpoint">{log.endpoint}</code>
                      <span className="log-status">Status: {log.status}</span>
                      <span className="log-duration">{log.durationMs}ms</span>
                      <span className="log-time">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <pre className="log-payload-pre">
                      <code>
                        {JSON.stringify(
                          { request: log.requestBody, response: log.responseBody },
                          null,
                          2
                        )}
                      </code>
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="arch-modal-body">
            <div className="roadmap-cards-grid">
              {STAGED_ROADMAP.map((item) => (
                <div key={item.stage} className="roadmap-stage-card">
                  <div className="roadmap-card-top">
                    <span className="stage-num-pill">{item.stage}</span>
                    <span className="stage-ready-pill">
                      <CheckCircle2 size={13} aria-hidden="true" /> {item.status}
                    </span>
                  </div>
                  <h3 className="roadmap-title">{item.title}</h3>
                  <p className="roadmap-notes">{item.notes}</p>
                </div>
              ))}
            </div>

            <div className="separation-principles-box">
              <h3 className="card-heading">
                <Database size={15} aria-hidden="true" /> Critical Architectural Boundaries Enforced
                in Frontend State
              </h3>
              <ul className="principles-list">
                <li>
                  <strong>Game State vs. Draft State:</strong> Editing JSON in the right-hand
                  studio never touches <code>match.board</code> or legal move generation until
                  validated and committed.
                </li>
                <li>
                  <strong>Turn-Independent Rule Editing:</strong> Board moves enforce{' '}
                  <code>side_to_move</code> ownership, while ruleset draft submissions are
                  asynchronous and serialized by <code>active_ruleset_version</code>.
                </li>
                <li>
                  <strong>Immutable Ruleset Versioning:</strong> Every accepted rule modification
                  creates a new immutable version (<code>v1 → v2 → v3</code>), and every move in
                  the ledger records the exact <code>ruleset_version</code> under which it was
                  played.
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
};
