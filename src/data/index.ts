import type { MissionDefinition } from '../domain';
import { deepSpaceMission } from './deepSpaceMission';
import { solarStormMission } from './solarStormMission';
import { tiedOrbitMission } from './tiedOrbitMission';
import { weakSignalMission } from './weakSignalMission';

export { deepSpaceMission, solarStormMission, tiedOrbitMission, weakSignalMission };

/** Missões oficiais na ordem da campanha: concluir uma libera a seguinte. */
export const officialMissions: readonly MissionDefinition[] = Object.freeze([
  deepSpaceMission,
  tiedOrbitMission,
  solarStormMission,
  weakSignalMission,
]);
