export { applyGameCommand } from './commands';
export {
  InvalidGameStateError,
  assessHuffmanMergeChoice,
  replayHuffmanMerges,
} from './huffmanProgress';
export { PHASE_ORDER } from './phases';
export {
  addCustomMission,
  buildMissionCatalog,
  createEmptyProgress,
  findCatalogEntry,
  getMissionResult,
  getMissionSession,
  isMissionUnlocked,
  MAX_CUSTOM_MISSIONS,
  PROGRESS_SCHEMA_VERSION,
  recordMissionCompletion,
  removeCustomMission,
  resetCampaign,
  restoreProgress,
  saveSession,
  selectCurrentMissionId,
  selectMission,
} from './progress';
export type {
  AddCustomMissionResult,
  MissionCatalog,
  MissionCatalogEntry,
  MissionResult,
  PlayerProgress,
} from './progress';
export { restoreGameState } from './restoreState';
export { selectHuffmanProgress, selectMissionReport, selectUnlockedTerminals } from './selectors';
export { createInitialGameState } from './state';
export type {
  GameCommand,
  GameCommandError,
  GameCommandErrorCode,
  GameCommandResult,
  GamePhase,
  GameState,
  HuffmanMergeChoice,
  HuffmanMergeAssessment,
  HuffmanProgress,
  UnlockedTerminals,
} from './types';
