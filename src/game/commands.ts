import type { LoadedMission } from '../domain';
import { replayHuffmanMerges } from './huffmanProgress';
import { InvalidGameStateError } from './huffmanProgress';
import { createInitialGameState } from './state';
import type {
  GameCommand,
  GameCommandErrorCode,
  GameCommandResult,
  GamePhase,
  GameState,
  HuffmanMergeChoice,
} from './types';

function fail(state: GameState, code: GameCommandErrorCode, message: string): GameCommandResult {
  return Object.freeze({ ok: false, state, error: Object.freeze({ code, message }) });
}

function succeed(state: GameState): GameCommandResult {
  return Object.freeze({ ok: true, state });
}

function moveToPhase(state: GameState, phase: GamePhase): GameCommandResult {
  return succeed(Object.freeze({ ...state, phase }));
}

function requirePhase(
  state: GameState,
  expected: GamePhase,
  command: GameCommand['type'],
): GameCommandResult | null {
  return state.phase === expected
    ? null
    : fail(state, 'INVALID_PHASE', `${command} não é permitido na fase ${state.phase}.`);
}

function hasValidPacketOrder(mission: LoadedMission, packetIds: readonly string[]): boolean {
  if (packetIds.length !== mission.packets.length || new Set(packetIds).size !== packetIds.length) {
    return false;
  }
  const knownIds = new Set(mission.packets.map((packet) => packet.id));
  return packetIds.every((id) => knownIds.has(id));
}

/** Aplica um comando puro; falhas sempre devolvem o estado original sem modificações. */
export function applyGameCommand(
  mission: LoadedMission,
  state: GameState,
  command: GameCommand,
): GameCommandResult {
  if (state.missionId !== mission.id) {
    return fail(state, 'MISSION_MISMATCH', 'O estado pertence a outra missão.');
  }
  if (command.type === 'RESTART_MISSION') return succeed(createInitialGameState(mission));

  if (command.type === 'ACKNOWLEDGE_BRIEFING') {
    return requirePhase(state, 'briefing', command.type) ?? moveToPhase(state, 'investigation');
  }
  if (command.type === 'FINISH_INVESTIGATION') {
    return requirePhase(state, 'investigation', command.type) ?? moveToPhase(state, 'compression');
  }
  if (command.type === 'MERGE_HUFFMAN_NODES') {
    const phaseError = requirePhase(state, 'compression', command.type);
    if (phaseError !== null) return phaseError;
    const choice: HuffmanMergeChoice = Object.freeze({
      firstNodeId: command.firstNodeId,
      secondNodeId: command.secondNodeId,
    });
    const choices = Object.freeze([...state.huffmanMergeChoices, choice]);
    try {
      replayHuffmanMerges(mission.telemetry.frequencies, choices);
    } catch (error) {
      if (error instanceof InvalidGameStateError) {
        return fail(state, 'INVALID_HUFFMAN_CHOICE', error.message);
      }
      throw error;
    }
    return succeed(Object.freeze({ ...state, huffmanMergeChoices: choices }));
  }
  if (command.type === 'CONFIRM_COMPRESSION') {
    const phaseError = requirePhase(state, 'compression', command.type);
    if (phaseError !== null) return phaseError;
    try {
      const progress = replayHuffmanMerges(
        mission.telemetry.frequencies,
        state.huffmanMergeChoices,
      );
      return progress.complete
        ? moveToPhase(state, 'scheduling')
        : fail(state, 'INCOMPLETE_HUFFMAN_TREE', 'A árvore Huffman ainda não está completa.');
    } catch (error) {
      if (error instanceof InvalidGameStateError) {
        return fail(state, 'INVALID_GAME_STATE', error.message);
      }
      throw error;
    }
  }
  if (command.type === 'SET_PACKET_ORDER') {
    const phaseError = requirePhase(state, 'scheduling', command.type);
    if (phaseError !== null) return phaseError;
    if (!hasValidPacketOrder(mission, command.packetIds)) {
      return fail(
        state,
        'INVALID_PACKET_ORDER',
        'A ordem deve conter todos os pacotes exatamente uma vez.',
      );
    }
    return succeed(Object.freeze({ ...state, packetOrder: Object.freeze([...command.packetIds]) }));
  }
  if (command.type === 'CONFIRM_SCHEDULE') {
    return requirePhase(state, 'scheduling', command.type) ?? moveToPhase(state, 'transmission');
  }
  if (command.type === 'COMPLETE_TRANSMISSION') {
    return requirePhase(state, 'transmission', command.type) ?? moveToPhase(state, 'report');
  }

  return fail(state, 'INVALID_GAME_STATE', 'Comando desconhecido.');
}
