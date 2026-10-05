import type { GamePhase } from './types';

/** Ordem linear das fases da missão; a posição define o que já foi desbloqueado. */
export const PHASE_ORDER: readonly GamePhase[] = Object.freeze([
  'briefing',
  'investigation',
  'compression',
  'scheduling',
  'transmission',
  'report',
]);
