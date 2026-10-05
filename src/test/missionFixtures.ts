import type { LoadedMission, MissionDefinition } from '../domain';
import { applyGameCommand, createInitialGameState } from '../game';
import type { GameCommand, GamePhase, GameState } from '../game';

/** Menor documento de missão válido, usado para exercitar importação e progressão. */
export function createCustomDefinition(id = 'custom-relay'): MissionDefinition {
  return {
    schemaVersion: 1,
    id,
    title: 'Retransmissor de teste',
    briefing: 'Cenário importado.',
    objectives: ['Entregar os pacotes.'],
    bandwidthBitsPerTimeUnit: 8,
    telemetry: {
      alphabet: [
        { value: 0, label: 'zero' },
        { value: 1, label: 'um' },
      ],
      originalFormat: { encoding: 'unsigned-integer', bitsPerSymbol: 8, sizeUnit: 'bit' },
    },
    packets: [
      { id: 'a', deadline: 10, payload: [0, 0, 0, 1] },
      { id: 'b', deadline: 5, payload: [1, 0] },
    ],
  };
}

function apply(mission: LoadedMission, state: GameState, command: GameCommand): GameState {
  const result = applyGameCommand(mission, state, command);
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}

/** Joga a missão pela API pública, com a árvore de referência, até alcançar a fase pedida. */
export function playUntil(mission: LoadedMission, phase: GamePhase): GameState {
  const commands: readonly GameCommand[] = [
    { type: 'ACKNOWLEDGE_BRIEFING' },
    { type: 'FINISH_INVESTIGATION' },
    ...mission.telemetry.referenceMergeHistory.map((step): GameCommand => ({
      type: 'MERGE_HUFFMAN_NODES',
      firstNodeId: step.firstExtracted.id,
      secondNodeId: step.secondExtracted.id,
    })),
    { type: 'CONFIRM_COMPRESSION' },
    { type: 'CONFIRM_SCHEDULE' },
    { type: 'COMPLETE_TRANSMISSION' },
  ];

  let state = createInitialGameState(mission);
  for (const command of commands) {
    // As fusões pertencem à fase de compressão: só se para nela depois de completar a árvore.
    if (state.phase === phase && command.type !== 'MERGE_HUFFMAN_NODES') break;
    state = apply(mission, state, command);
  }
  if (state.phase !== phase) throw new Error(`A missão não alcançou a fase ${phase}.`);
  return state;
}
