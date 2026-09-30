import type { HuffmanMergeStep, HuffmanNode } from '../algorithms/huffman';

export type GamePhase =
  'briefing' | 'investigation' | 'compression' | 'scheduling' | 'transmission' | 'report';

export interface HuffmanMergeChoice {
  readonly firstNodeId: string;
  readonly secondNodeId: string;
}

/** Contém somente progresso e decisões que precisam sobreviver a serialização. */
export interface GameState {
  readonly schemaVersion: 1;
  readonly missionId: string;
  readonly phase: GamePhase;
  readonly huffmanMergeChoices: readonly HuffmanMergeChoice[];
  readonly packetOrder: readonly string[];
}

export type GameCommand =
  | { readonly type: 'ACKNOWLEDGE_BRIEFING' }
  | { readonly type: 'FINISH_INVESTIGATION' }
  | {
      readonly type: 'MERGE_HUFFMAN_NODES';
      readonly firstNodeId: string;
      readonly secondNodeId: string;
    }
  | { readonly type: 'CONFIRM_COMPRESSION' }
  | { readonly type: 'SET_PACKET_ORDER'; readonly packetIds: readonly string[] }
  | { readonly type: 'CONFIRM_SCHEDULE' }
  | { readonly type: 'COMPLETE_TRANSMISSION' }
  | { readonly type: 'RESTART_MISSION' };

export type GameCommandErrorCode =
  | 'MISSION_MISMATCH'
  | 'INVALID_PHASE'
  | 'INVALID_HUFFMAN_CHOICE'
  | 'INCOMPLETE_HUFFMAN_TREE'
  | 'INVALID_PACKET_ORDER'
  | 'INVALID_GAME_STATE';

export interface GameCommandError {
  readonly code: GameCommandErrorCode;
  readonly message: string;
}

export type GameCommandResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly state: GameState; readonly error: GameCommandError };

export interface HuffmanProgress {
  readonly activeNodes: readonly HuffmanNode[];
  readonly history: readonly HuffmanMergeStep[];
  readonly greedyChoiceHistory: readonly boolean[];
  readonly allChoicesGreedy: boolean;
  readonly root: HuffmanNode | null;
  readonly complete: boolean;
}

export interface UnlockedTerminals {
  readonly briefing: boolean;
  readonly investigation: boolean;
  readonly compression: boolean;
  readonly scheduling: boolean;
  readonly transmission: boolean;
  readonly report: boolean;
}
