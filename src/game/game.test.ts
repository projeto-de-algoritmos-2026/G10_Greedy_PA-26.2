// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { deepSpaceMission } from '../data';
import { buildMissionReport, loadMission } from '../domain';
import {
  applyGameCommand,
  createInitialGameState,
  replayHuffmanMerges,
  selectHuffmanProgress,
  selectMissionReport,
  selectUnlockedTerminals,
} from './index';
import type { GameCommand, GameState } from './index';

const mission = loadMission(deepSpaceMission);

function applySuccessfully(state: GameState, command: GameCommand): GameState {
  const result = applyGameCommand(mission, state, command);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}

function enterCompression(): GameState {
  let state = createInitialGameState(mission);
  state = applySuccessfully(state, { type: 'ACKNOWLEDGE_BRIEFING' });
  return applySuccessfully(state, { type: 'FINISH_INVESTIGATION' });
}

function completeReferenceHuffman(state: GameState): GameState {
  let current = state;
  for (const step of mission.telemetry.referenceMergeHistory) {
    current = applySuccessfully(current, {
      type: 'MERGE_HUFFMAN_NODES',
      firstNodeId: step.firstExtracted.id,
      secondNodeId: step.secondExtracted.id,
    });
  }
  return current;
}

describe('fluxo do jogo', () => {
  it('executa a missão completa somente pela API pública', () => {
    let state = enterCompression();
    state = completeReferenceHuffman(state);

    const progress = selectHuffmanProgress(mission, state);
    expect(progress.complete).toBe(true);
    expect(progress.history).toHaveLength(mission.telemetry.frequencies.length - 1);
    expect(progress.allChoicesGreedy).toBe(true);

    state = applySuccessfully(state, { type: 'CONFIRM_COMPRESSION' });
    const reverseOrder = mission.packets.map((packet) => packet.id).reverse();
    state = applySuccessfully(state, { type: 'SET_PACKET_ORDER', packetIds: reverseOrder });
    state = applySuccessfully(state, { type: 'CONFIRM_SCHEDULE' });
    state = applySuccessfully(state, { type: 'COMPLETE_TRANSMISSION' });

    expect(state.phase).toBe('report');
    expect(selectUnlockedTerminals(state)).toEqual({
      briefing: true,
      investigation: true,
      compression: true,
      scheduling: true,
      transmission: true,
      report: true,
    });
    expect(selectMissionReport(mission, state)).not.toBeNull();
  });

  it('mantém o estado inalterado quando uma ação é inválida', () => {
    const initial = createInitialGameState(mission);
    const wrongPhase = applyGameCommand(mission, initial, { type: 'CONFIRM_SCHEDULE' });
    expect(wrongPhase.ok).toBe(false);
    expect(wrongPhase.state).toBe(initial);

    const compression = enterCompression();
    const repeatedNode = applyGameCommand(mission, compression, {
      type: 'MERGE_HUFFMAN_NODES',
      firstNodeId: 'leaf-0',
      secondNodeId: 'leaf-0',
    });
    expect(repeatedNode.ok).toBe(false);
    expect(repeatedNode.state).toBe(compression);

    const incomplete = applyGameCommand(mission, compression, { type: 'CONFIRM_COMPRESSION' });
    expect(incomplete.ok).toBe(false);
    expect(incomplete.state).toBe(compression);
  });

  it('rejeita ordens inválidas sem corromper o progresso', () => {
    let state = completeReferenceHuffman(enterCompression());
    state = applySuccessfully(state, { type: 'CONFIRM_COMPRESSION' });
    const result = applyGameCommand(mission, state, {
      type: 'SET_PACKET_ORDER',
      packetIds: mission.packets.map(() => mission.packets[0]?.id ?? ''),
    });

    expect(result.ok).toBe(false);
    expect(result.state).toBe(state);
  });

  it('reinicia para o estado inicial da mesma missão', () => {
    const progressed = enterCompression();
    const result = applyGameCommand(mission, progressed, { type: 'RESTART_MISSION' });

    expect(result.ok).toBe(true);
    expect(result.state).toEqual(createInitialGameState(mission));
  });

  it('é serializável e não armazena métricas derivadas', () => {
    const state = completeReferenceHuffman(enterCompression());
    const restored = JSON.parse(JSON.stringify(state)) as GameState;

    expect(restored).toEqual(state);
    expect(Object.keys(restored).sort()).toEqual([
      'huffmanMergeChoices',
      'missionId',
      'packetOrder',
      'phase',
      'schemaVersion',
    ]);
    expect(selectHuffmanProgress(mission, restored)).toEqual(selectHuffmanProgress(mission, state));
    expect(selectMissionReport(mission, restored)).toEqual(selectMissionReport(mission, state));
  });

  it('aceita escolhas Huffman não ambiciosas e propaga seu custo ao relatório', () => {
    let state = enterCompression();
    state = applySuccessfully(state, {
      type: 'MERGE_HUFFMAN_NODES',
      firstNodeId: 'leaf-0',
      secondNodeId: 'leaf-3',
    });

    while (!selectHuffmanProgress(mission, state).complete) {
      const [first, second] = selectHuffmanProgress(mission, state).activeNodes;
      if (first === undefined || second === undefined) throw new Error('Fusão incompleta.');
      state = applySuccessfully(state, {
        type: 'MERGE_HUFFMAN_NODES',
        firstNodeId: first.id,
        secondNodeId: second.id,
      });
    }

    const progress = selectHuffmanProgress(mission, state);
    const report = selectMissionReport(mission, state);
    const reference = buildMissionReport(mission);

    expect(progress.allChoicesGreedy).toBe(false);
    expect(report?.huffman.allChoicesGreedy).toBe(false);
    expect(report?.huffman.isOptimal).toBe(false);
    expect(report?.compressed.transmission.totals.totalBitLength).toBeGreaterThan(
      reference.compressed.transmission.totals.totalBitLength,
    );
  });

  it('trata empates de peso como escolhas gulosas equivalentes', () => {
    const frequencies = [
      { symbol: 0, weight: 5 },
      { symbol: 1, weight: 5 },
      { symbol: 2, weight: 5 },
    ];
    const progress = replayHuffmanMerges(frequencies, [
      { firstNodeId: 'leaf-1', secondNodeId: 'leaf-2' },
    ]);

    expect(progress.allChoicesGreedy).toBe(true);
  });
});
