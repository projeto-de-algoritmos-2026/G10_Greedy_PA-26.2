import type { LoadedMission } from '../domain';
import type { GameState } from './types';

export function createInitialGameState(mission: LoadedMission): GameState {
  return Object.freeze({
    schemaVersion: 1,
    missionId: mission.id,
    phase: 'briefing',
    huffmanMergeChoices: Object.freeze([]),
    packetOrder: Object.freeze(mission.packets.map((packet) => packet.id)),
  });
}
