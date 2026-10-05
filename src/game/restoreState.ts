import type { LoadedMission } from '../domain';
import { InvalidGameStateError, replayHuffmanMerges } from './huffmanProgress';
import { PHASE_ORDER } from './phases';
import type { GamePhase, GameState, HuffmanMergeChoice } from './types';

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseChoices(value: unknown): readonly HuffmanMergeChoice[] | null {
  if (!Array.isArray(value)) return null;
  const choices: HuffmanMergeChoice[] = [];
  for (const entry of value) {
    if (
      !isRecord(entry) ||
      typeof entry.firstNodeId !== 'string' ||
      typeof entry.secondNodeId !== 'string'
    ) {
      return null;
    }
    choices.push(
      Object.freeze({ firstNodeId: entry.firstNodeId, secondNodeId: entry.secondNodeId }),
    );
  }
  return Object.freeze(choices);
}

/**
 * Reconstrói um estado de jogo vindo de fonte não confiável (armazenamento local). Devolve
 * `null` se o estado não puder ter sido produzido pelos comandos desta missão: é mais seguro
 * recomeçar do que continuar a partir de uma árvore ou ordem que a missão não reconhece.
 */
export function restoreGameState(mission: LoadedMission, raw: unknown): GameState | null {
  if (!isRecord(raw) || raw.schemaVersion !== 1 || raw.missionId !== mission.id) return null;

  const phaseIndex = PHASE_ORDER.indexOf(raw.phase as GamePhase);
  const phase = PHASE_ORDER[phaseIndex];
  if (phase === undefined) return null;

  const choices = parseChoices(raw.huffmanMergeChoices);
  if (choices === null) return null;

  const order = raw.packetOrder;
  if (!Array.isArray(order) || order.length !== mission.packets.length) return null;
  const knownIds = new Set(mission.packets.map((packet) => packet.id));
  if (new Set(order).size !== order.length || !order.every((id) => knownIds.has(id))) return null;

  const compressionIndex = PHASE_ORDER.indexOf('compression');
  let complete: boolean;
  try {
    ({ complete } = replayHuffmanMerges(mission.telemetry.frequencies, choices));
  } catch (error) {
    if (error instanceof InvalidGameStateError) return null;
    throw error;
  }
  // Antes da compressão não há fusões; depois dela a árvore precisa estar completa.
  if (phaseIndex < compressionIndex && choices.length > 0) return null;
  if (phaseIndex > compressionIndex && !complete) return null;

  return Object.freeze({
    schemaVersion: 1,
    missionId: mission.id,
    phase,
    huffmanMergeChoices: choices,
    packetOrder: Object.freeze([...(order as readonly string[])]),
  });
}
