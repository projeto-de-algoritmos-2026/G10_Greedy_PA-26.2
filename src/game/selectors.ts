import { buildMissionReport } from '../domain';
import type { LoadedMission, MissionReport } from '../domain';
import { InvalidGameStateError, replayHuffmanMerges } from './huffmanProgress';
import type { GamePhase, GameState, HuffmanProgress, UnlockedTerminals } from './types';

const PHASE_INDEX: Readonly<Record<GamePhase, number>> = Object.freeze({
  briefing: 0,
  investigation: 1,
  compression: 2,
  scheduling: 3,
  transmission: 4,
  report: 5,
});

function assertMission(mission: LoadedMission, state: GameState): void {
  if (mission.id !== state.missionId) {
    throw new InvalidGameStateError('O estado pertence a outra missão.');
  }
}

export function selectHuffmanProgress(mission: LoadedMission, state: GameState): HuffmanProgress {
  assertMission(mission, state);
  return replayHuffmanMerges(mission.telemetry.frequencies, state.huffmanMergeChoices);
}

export function selectMissionReport(
  mission: LoadedMission,
  state: GameState,
): MissionReport | null {
  const progress = selectHuffmanProgress(mission, state);
  if (!progress.complete || progress.root === null) return null;
  return buildMissionReport(mission, {
    tree: progress.root,
    packetOrder: state.packetOrder,
    greedyChoiceHistory: progress.greedyChoiceHistory,
  });
}

export function selectUnlockedTerminals(state: GameState): UnlockedTerminals {
  const current = PHASE_INDEX[state.phase];
  return Object.freeze({
    briefing: true,
    investigation: current >= PHASE_INDEX.investigation,
    compression: current >= PHASE_INDEX.compression,
    scheduling: current >= PHASE_INDEX.scheduling,
    transmission: current >= PHASE_INDEX.transmission,
    report: current >= PHASE_INDEX.report,
  });
}
