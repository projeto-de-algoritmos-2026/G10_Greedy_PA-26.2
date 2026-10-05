import { loadMission, validateMissionDocument } from '../domain';
import type { LoadedMission, MissionDefinition, MissionReport } from '../domain';
import { restoreGameState } from './restoreState';
import type { GameState } from './types';

/** Versão do progresso salvo. Mudanças incompatíveis exigem um novo número e uma migração. */
export const PROGRESS_SCHEMA_VERSION = 1;
/** Mantém o progresso salvo bem abaixo da cota típica de 5 MB do armazenamento local. */
export const MAX_CUSTOM_MISSIONS = 12;

export interface MissionResult {
  readonly completions: number;
  /** Alguma tentativa alcançou o custo da árvore de Huffman de referência. */
  readonly optimalHuffman: boolean;
  /** Alguma tentativa alcançou o atraso máximo da ordem EDD no cenário comprimido. */
  readonly matchedEdd: boolean;
  /** Menor atraso máximo obtido no cenário comprimido entre as tentativas. */
  readonly bestMaxLateness: number;
}

/** Tudo o que precisa sobreviver entre visitas; contém apenas dados serializáveis em JSON. */
export interface PlayerProgress {
  readonly schemaVersion: 1;
  readonly results: Readonly<Record<string, MissionResult>>;
  /** Estado da tentativa em andamento de cada missão. */
  readonly sessions: Readonly<Record<string, GameState>>;
  readonly customMissions: readonly MissionDefinition[];
  readonly lastMissionId: string | null;
}

export interface MissionCatalogEntry {
  readonly origin: 'official' | 'custom';
  readonly definition: MissionDefinition;
  readonly mission: LoadedMission;
}

export type MissionCatalog = readonly MissionCatalogEntry[];

export type AddCustomMissionResult =
  | { readonly ok: true; readonly progress: PlayerProgress; readonly replaced: boolean }
  | { readonly ok: false; readonly message: string };

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** IDs de missão como `constructor` são válidos; `hasOwn` evita ler membros do protótipo. */
function ownValue<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

function withoutKey<T>(
  record: Readonly<Record<string, T>>,
  key: string,
): Readonly<Record<string, T>> {
  return Object.freeze(Object.fromEntries(Object.entries(record).filter(([id]) => id !== key)));
}

function withEntry<T>(
  record: Readonly<Record<string, T>>,
  key: string,
  value: T,
): Readonly<Record<string, T>> {
  return Object.freeze(
    Object.fromEntries([...Object.entries(record).filter(([id]) => id !== key), [key, value]]),
  );
}

export function createEmptyProgress(): PlayerProgress {
  return Object.freeze({
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    results: Object.freeze({}),
    sessions: Object.freeze({}),
    customMissions: Object.freeze([]),
    lastMissionId: null,
  });
}

export function getMissionResult(
  progress: PlayerProgress,
  missionId: string,
): MissionResult | null {
  return ownValue(progress.results, missionId) ?? null;
}

export function getMissionSession(progress: PlayerProgress, missionId: string): GameState | null {
  return ownValue(progress.sessions, missionId) ?? null;
}

/** Materializa as missões oficiais, na ordem da campanha, seguidas das importadas. */
export function buildMissionCatalog(
  official: readonly MissionDefinition[],
  customMissions: readonly MissionDefinition[],
): MissionCatalog {
  return Object.freeze([
    ...official.map((definition) =>
      Object.freeze({ origin: 'official' as const, definition, mission: loadMission(definition) }),
    ),
    ...customMissions.map((definition) =>
      Object.freeze({ origin: 'custom' as const, definition, mission: loadMission(definition) }),
    ),
  ]);
}

export function findCatalogEntry(
  catalog: MissionCatalog,
  missionId: string | null,
): MissionCatalogEntry | null {
  return catalog.find((entry) => entry.mission.id === missionId) ?? null;
}

/**
 * A campanha oficial é linear: cada missão exige a conclusão da anterior. Missões importadas
 * ficam sempre disponíveis, pois não fazem parte da progressão.
 */
export function isMissionUnlocked(
  catalog: MissionCatalog,
  progress: PlayerProgress,
  missionId: string,
): boolean {
  const official = catalog.filter((entry) => entry.origin === 'official');
  const index = official.findIndex((entry) => entry.mission.id === missionId);
  if (index === -1) return catalog.some((entry) => entry.mission.id === missionId);
  const previous = official[index - 1];
  return previous === undefined || getMissionResult(progress, previous.mission.id) !== null;
}

/** Missão a abrir ao entrar: a última jogada ou a primeira oficial ainda não concluída. */
export function selectCurrentMissionId(
  catalog: MissionCatalog,
  progress: PlayerProgress,
): string | null {
  const last = progress.lastMissionId;
  if (last !== null && isMissionUnlocked(catalog, progress, last)) return last;
  const pending = catalog.find(
    (entry) =>
      entry.origin === 'official' &&
      getMissionResult(progress, entry.mission.id) === null &&
      isMissionUnlocked(catalog, progress, entry.mission.id),
  );
  return (pending ?? catalog[0])?.mission.id ?? null;
}

export function selectMission(progress: PlayerProgress, missionId: string): PlayerProgress {
  return Object.freeze({ ...progress, lastMissionId: missionId });
}

/** Guarda a tentativa em andamento; o estado inicial não é salvo porque nada foi decidido. */
export function saveSession(progress: PlayerProgress, state: GameState): PlayerProgress {
  const sessions =
    state.phase === 'briefing'
      ? withoutKey(progress.sessions, state.missionId)
      : withEntry(progress.sessions, state.missionId, state);
  return Object.freeze({ ...progress, sessions });
}

/**
 * Registra a conclusão de uma missão a partir do relatório calculado pela simulação. As
 * conquistas são cumulativas: repetir a missão com um resultado pior não as remove.
 */
export function recordMissionCompletion(
  progress: PlayerProgress,
  report: MissionReport,
): PlayerProgress {
  const previous = getMissionResult(progress, report.missionId);
  const { manual } = report.compressed.schedules;
  const result: MissionResult = Object.freeze({
    completions: (previous?.completions ?? 0) + 1,
    optimalHuffman: (previous?.optimalHuffman ?? false) || report.huffman.isOptimal,
    matchedEdd:
      (previous?.matchedEdd ?? false) || report.compressed.schedules.matchesReferenceMaxLateness,
    bestMaxLateness: Math.min(
      previous?.bestMaxLateness ?? Number.POSITIVE_INFINITY,
      manual.maxLateness,
    ),
  });
  return Object.freeze({
    ...progress,
    results: withEntry(progress.results, report.missionId, result),
  });
}

/**
 * Adiciona ou substitui uma missão importada. Substituir descarta resultado e tentativa da
 * versão anterior: eles foram obtidos com outros dados e não valem para a nova definição.
 */
export function addCustomMission(
  progress: PlayerProgress,
  official: readonly MissionDefinition[],
  definition: MissionDefinition,
): AddCustomMissionResult {
  if (official.some((mission) => mission.id === definition.id)) {
    return Object.freeze({
      ok: false,
      message: `O ID "${definition.id}" pertence a uma missão oficial. Escolha outro ID.`,
    });
  }
  const replaced = progress.customMissions.some((mission) => mission.id === definition.id);
  if (!replaced && progress.customMissions.length >= MAX_CUSTOM_MISSIONS) {
    return Object.freeze({
      ok: false,
      message: `A coleção já possui ${MAX_CUSTOM_MISSIONS} missões importadas. Remova uma antes de adicionar outra.`,
    });
  }
  return Object.freeze({
    ok: true,
    replaced,
    progress: Object.freeze({
      ...progress,
      customMissions: Object.freeze([
        ...progress.customMissions.filter((mission) => mission.id !== definition.id),
        definition,
      ]),
      results: withoutKey(progress.results, definition.id),
      sessions: withoutKey(progress.sessions, definition.id),
    }),
  });
}

/** Apaga resultados e tentativas, preservando os cenários que o usuário importou. */
export function resetCampaign(progress: PlayerProgress): PlayerProgress {
  return Object.freeze({ ...createEmptyProgress(), customMissions: progress.customMissions });
}

export function removeCustomMission(progress: PlayerProgress, missionId: string): PlayerProgress {
  if (!progress.customMissions.some((mission) => mission.id === missionId)) return progress;
  return Object.freeze({
    ...progress,
    customMissions: Object.freeze(
      progress.customMissions.filter((mission) => mission.id !== missionId),
    ),
    results: withoutKey(progress.results, missionId),
    sessions: withoutKey(progress.sessions, missionId),
    lastMissionId: progress.lastMissionId === missionId ? null : progress.lastMissionId,
  });
}

function parseResult(raw: unknown): MissionResult | null {
  if (!isRecord(raw)) return null;
  const { completions, optimalHuffman, matchedEdd, bestMaxLateness } = raw;
  if (
    typeof completions !== 'number' ||
    !Number.isSafeInteger(completions) ||
    completions < 1 ||
    typeof optimalHuffman !== 'boolean' ||
    typeof matchedEdd !== 'boolean' ||
    typeof bestMaxLateness !== 'number' ||
    !Number.isFinite(bestMaxLateness) ||
    bestMaxLateness < 0
  ) {
    return null;
  }
  return Object.freeze({ completions, optimalHuffman, matchedEdd, bestMaxLateness });
}

/**
 * Reconstrói o progresso a partir de dados não confiáveis. Cada parte é validada de forma
 * independente e descartada se estiver inconsistente, para que um registro corrompido não
 * apague o restante nem chegue ao jogo.
 */
export function restoreProgress(
  raw: unknown,
  official: readonly MissionDefinition[],
): PlayerProgress {
  if (!isRecord(raw) || raw.schemaVersion !== PROGRESS_SCHEMA_VERSION) {
    return createEmptyProgress();
  }

  const officialIds = new Set(official.map((mission) => mission.id));
  const customMissions: MissionDefinition[] = [];
  const customIds = new Set<string>();
  for (const candidate of Array.isArray(raw.customMissions) ? raw.customMissions : []) {
    if (customMissions.length >= MAX_CUSTOM_MISSIONS) break;
    const validation = validateMissionDocument(candidate);
    if (!validation.ok) continue;
    const { id } = validation.definition;
    if (officialIds.has(id) || customIds.has(id)) continue;
    customIds.add(id);
    customMissions.push(validation.definition);
  }

  const base: PlayerProgress = Object.freeze({
    ...createEmptyProgress(),
    customMissions: Object.freeze(customMissions),
  });
  const catalog = buildMissionCatalog(official, customMissions);

  const results: Record<string, MissionResult> = {};
  const sessions: Record<string, GameState> = {};
  const rawResults = isRecord(raw.results) ? raw.results : {};
  const rawSessions = isRecord(raw.sessions) ? raw.sessions : {};
  for (const { mission } of catalog) {
    const result = parseResult(ownValue(rawResults, mission.id));
    if (result !== null) results[mission.id] = result;
    const session = restoreGameState(mission, ownValue(rawSessions, mission.id));
    if (session !== null && session.phase !== 'briefing') sessions[mission.id] = session;
  }

  const restored: PlayerProgress = Object.freeze({
    ...base,
    results: Object.freeze(results),
    sessions: Object.freeze(sessions),
  });
  const lastMissionId =
    typeof raw.lastMissionId === 'string' && isMissionUnlocked(catalog, restored, raw.lastMissionId)
      ? raw.lastMissionId
      : null;
  return Object.freeze({ ...restored, lastMissionId });
}
