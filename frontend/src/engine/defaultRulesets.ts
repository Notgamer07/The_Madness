import { PresetRulesetTemplate, RulesetDocument } from '../types/game';

export const STANDARD_CHESS_RULESET_DOC: RulesetDocument = {
  schema_version: 1,
  metadata: {
    title: 'Standard FIDE Baseline',
    summary: 'Classical chess movement rules for all six standard piece types.',
  },
  pieces: {
    pawn: {
      name: 'Pawn',
      movement: {
        type: 'standard_pawn',
      },
      appearance: { white: '♙', black: '♟' },
      description: 'Advances 1 square forward (2 from initial rank), captures diagonally, supports en passant & promotion.',
    },
    knight: {
      name: 'Knight',
      movement: {
        type: 'standard_knight',
      },
      appearance: { white: '♘', black: '♞' },
      description: 'Leaps in an L-shape (2×1 offset) over intervening pieces.',
    },
    bishop: {
      name: 'Bishop',
      movement: {
        type: 'sliding_bishop',
        max_range: 7,
      },
      appearance: { white: '♗', black: '♝' },
      description: 'Slides along diagonals up to 7 squares until blocked.',
    },
    rook: {
      name: 'Rook',
      movement: {
        type: 'sliding_rook',
        max_range: 7,
      },
      appearance: { white: '♖', black: '♜' },
      description: 'Slides along ranks and files up to 7 squares until blocked.',
    },
    queen: {
      name: 'Queen',
      movement: {
        type: 'queen',
        max_range: 7,
      },
      appearance: { white: '♕', black: '♛' },
      description: 'Combines orthogonal and diagonal sliding up to 7 squares.',
    },
    king: {
      name: 'King',
      movement: {
        type: 'king_step',
      },
      appearance: { white: '♔', black: '♚' },
      description: 'Steps 1 square in any direction; supports castling when unmoved and safe.',
    },
  },
};

export const SUPER_KNIGHT_RULESET_DOC: RulesetDocument = {
  schema_version: 1,
  metadata: {
    title: 'Super-Knight Protocol (Knight + Queen)',
    summary: 'Knights retain their L-jump and also gain full Queen-like orthogonal and diagonal rays.',
  },
  pieces: {
    ...STANDARD_CHESS_RULESET_DOC.pieces,
    knight: {
      name: 'Apex Knight',
      movement: {
        type: 'combined',
        patterns: [
          { type: 'standard_knight' },
          { type: 'queen', max_range: 7 },
        ],
      },
      appearance: { white: '♘', black: '♞' },
      description: 'Moves as both a leaping Knight and a full-range sliding Queen.',
    },
  },
};

export const DRAGON_BISHOP_RULESET_DOC: RulesetDocument = {
  schema_version: 1,
  metadata: {
    title: 'Dragon Bishop & Phase Rook',
    summary: 'Bishops gain 1-step orthogonal mobility (Shogi Dragon Horse) and Rooks can hop 2 squares orthogonally.',
  },
  pieces: {
    ...STANDARD_CHESS_RULESET_DOC.pieces,
    bishop: {
      name: 'Dragon Bishop',
      movement: {
        type: 'combined',
        patterns: [
          { type: 'sliding_bishop', max_range: 7 },
          { type: 'king_step' },
        ],
      },
      appearance: { white: '♗', black: '♝' },
      description: 'Full diagonal slide plus 1-square orthogonal escape steps.',
    },
    rook: {
      name: 'Bastion Rook',
      movement: {
        type: 'combined',
        patterns: [
          { type: 'sliding_rook', max_range: 7 },
          {
            type: 'bounded_offsets',
            offsets: [
              { dr: -2, dc: 0, jump: true },
              { dr: 2, dc: 0, jump: true },
              { dr: 0, dc: -2, jump: true },
              { dr: 0, dc: 2, jump: true },
            ],
          },
        ],
      },
      appearance: { white: '♖', black: '♜' },
      description: 'Standard orthogonal slider plus a 2-square barrier-vaulting leap.',
    },
  },
};

export const OBFUSCATED_TACTICAL_RULESET_DOC: RulesetDocument = {
  schema_version: 1,
  metadata: {
    title: 'Cryptic Asymmetric Vector Matrix',
    summary: 'Valid but dense multi-vector ruleset requiring opponent inspection and reverse-engineering.',
  },
  pieces: {
    ...STANDARD_CHESS_RULESET_DOC.pieces,
    knight: {
      name: 'Valkyrie Lancer',
      movement: {
        type: 'combined',
        patterns: [
          { type: 'standard_knight' },
          {
            type: 'bounded_offsets',
            offsets: [
              { dr: -3, dc: 0, jump: true },
              { dr: 3, dc: 0, jump: true },
              { dr: -1, dc: -1, jump: false },
              { dr: -1, dc: 1, jump: false },
              { dr: 1, dc: -1, jump: false },
              { dr: 1, dc: 1, jump: false },
            ],
          },
        ],
      },
      appearance: { white: '♘', black: '♞' },
      description: 'Standard L-jump + 3-rank vertical spear leap + 1-step diagonal guard.',
    },
    bishop: {
      name: 'Mirage Prelate',
      movement: {
        type: 'combined',
        patterns: [
          { type: 'sliding_bishop', max_range: 4 },
          {
            type: 'bounded_offsets',
            offsets: [
              { dr: -2, dc: 0, jump: true },
              { dr: 2, dc: 0, jump: true },
              { dr: 0, dc: -2, jump: true },
              { dr: 0, dc: 2, jump: true },
            ],
          },
        ],
      },
      appearance: { white: '♗', black: '♝' },
      description: 'Range-4 diagonal slide combined with Alfil-style 2-square orthogonal leaps.',
    },
  },
};

export const ADVERSARIAL_INVALID_RULESET_DOC: Record<string, unknown> = {
  schema_version: 1,
  metadata: {
    title: 'Exploit Attempt (Rejected by Validator)',
    summary: 'Tests Stage 6 validator: forbidden primitive, out-of-range offset (dr: 14), and unknown top-level key.',
  },
  untrusted_exec_hook: 'import os; os.system("rm -rf /")',
  pieces: {
    ...STANDARD_CHESS_RULESET_DOC.pieces,
    knight: {
      name: 'Illegal Teleporting Knight',
      movement: {
        type: 'combined',
        patterns: [
          { type: 'arbitrary_python_eval' },
          {
            type: 'bounded_offsets',
            offsets: [{ dr: 14, dc: -9, jump: true }],
          },
        ],
      },
      appearance: { white: '♘', black: '♞' },
    },
  },
};

export const PRESET_RULESET_TEMPLATES: PresetRulesetTemplate[] = [
  {
    id: 'super-knight',
    name: 'Super-Knight (Knight + Queen)',
    badge: 'Stage 3 / Doc Example',
    description: 'Gives Knights full Queen sliding rays while retaining their L-jump.',
    targetPiece: 'knight',
    expectedOutcome: 'VALID',
    document: SUPER_KNIGHT_RULESET_DOC,
  },
  {
    id: 'dragon-bishop',
    name: 'Dragon Bishop & Bastion Rook',
    badge: 'Hybrid Vectors',
    description: 'Bishops gain King steps; Rooks gain a 2-square jump over blockers.',
    targetPiece: 'bishop, rook',
    expectedOutcome: 'VALID',
    document: DRAGON_BISHOP_RULESET_DOC,
  },
  {
    id: 'obfuscated-matrix',
    name: 'Cryptic Vector Matrix',
    badge: 'Reverse-Engineering',
    description: 'Complex combined bounded_offsets that force your opponent to inspect & analyze.',
    targetPiece: 'knight, bishop',
    expectedOutcome: 'VALID',
    document: OBFUSCATED_TACTICAL_RULESET_DOC,
  },
  {
    id: 'standard-reset',
    name: 'Restore Classical Chess',
    badge: 'Rollback as New Version',
    description: 'Re-activates standard FIDE movement as a new immutable version.',
    targetPiece: 'all',
    expectedOutcome: 'VALID',
    document: STANDARD_CHESS_RULESET_DOC,
  },
  {
    id: 'adversarial-test',
    name: 'Invalid / Unsafe Payload Test',
    badge: 'Validator Stress Test',
    description: 'Contains unknown fields, disallowed primitive names, and out-of-bounds offsets.',
    targetPiece: 'security',
    expectedOutcome: 'INVALID',
    document: ADVERSARIAL_INVALID_RULESET_DOC,
  },
];
