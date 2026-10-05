// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { officialMissions } from '../data';
import { buildMissionReport, loadMission, serializeMission } from '../domain';
import type { LoadedMission } from '../domain';
import { createCustomDefinition, playUntil } from '../test/missionFixtures';
import {
  addCustomMission,
  applyGameCommand,
  buildMissionCatalog,
  createEmptyProgress,
  createInitialGameState,
  getMissionResult,
  getMissionSession,
  isMissionUnlocked,
  MAX_CUSTOM_MISSIONS,
  recordMissionCompletion,
  removeCustomMission,
  resetCampaign,
  restoreGameState,
  restoreProgress,
  saveSession,
  selectCurrentMissionId,
  selectMission,
} from './index';
import type { GameCommand, GameState, PlayerProgress } from './index';

const [first, second, third] = officialMissions.map((definition) => loadMission(definition)) as [
  LoadedMission,
  LoadedMission,
  LoadedMission,
];

const customDefinition = createCustomDefinition;

function apply(mission: LoadedMission, state: GameState, command: GameCommand): GameState {
  const result = applyGameCommand(mission, state, command);
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}

const roundTrip = (progress: PlayerProgress): PlayerProgress =>
  restoreProgress(JSON.parse(JSON.stringify(progress)), officialMissions);

describe('progressão da campanha', () => {
  it('começa com apenas a primeira missão oficial liberada', () => {
    const progress = createEmptyProgress();
    const catalog = buildMissionCatalog(officialMissions, progress.customMissions);

    expect(catalog.map((entry) => entry.mission.id)).toEqual(
      officialMissions.map((mission) => mission.id),
    );
    expect(isMissionUnlocked(catalog, progress, first.id)).toBe(true);
    expect(isMissionUnlocked(catalog, progress, second.id)).toBe(false);
    expect(isMissionUnlocked(catalog, progress, 'inexistente')).toBe(false);
    expect(selectCurrentMissionId(catalog, progress)).toBe(first.id);
  });

  it('concluir uma missão libera somente a seguinte', () => {
    const progress = recordMissionCompletion(createEmptyProgress(), buildMissionReport(first));
    const catalog = buildMissionCatalog(officialMissions, progress.customMissions);

    expect(isMissionUnlocked(catalog, progress, second.id)).toBe(true);
    expect(isMissionUnlocked(catalog, progress, third.id)).toBe(false);
    expect(selectCurrentMissionId(catalog, progress)).toBe(second.id);
  });

  it('registra conquistas a partir do relatório e as mantém em tentativas piores', () => {
    const eddOrder = buildMissionReport(first).compressed.schedules.referenceEdd.packets.map(
      (packet) => packet.id,
    );
    const worstOrder = [...eddOrder].reverse();
    const optimal = buildMissionReport(first, { packetOrder: eddOrder });
    const worse = buildMissionReport(first, { packetOrder: worstOrder });

    let progress = recordMissionCompletion(createEmptyProgress(), worse);
    expect(getMissionResult(progress, first.id)).toEqual({
      completions: 1,
      optimalHuffman: true,
      matchedEdd: false,
      bestMaxLateness: worse.compressed.schedules.manual.maxLateness,
    });

    progress = recordMissionCompletion(progress, optimal);
    progress = recordMissionCompletion(progress, worse);
    expect(getMissionResult(progress, first.id)).toEqual({
      completions: 3,
      optimalHuffman: true,
      matchedEdd: true,
      bestMaxLateness: optimal.compressed.schedules.referenceEdd.maxLateness,
    });
  });

  it('retoma a última missão jogada enquanto ela estiver liberada', () => {
    const completed = recordMissionCompletion(createEmptyProgress(), buildMissionReport(first));
    const catalog = buildMissionCatalog(officialMissions, completed.customMissions);

    expect(selectCurrentMissionId(catalog, selectMission(completed, first.id))).toBe(first.id);
    expect(selectCurrentMissionId(catalog, selectMission(completed, third.id))).toBe(second.id);
  });
});

describe('tentativas em andamento', () => {
  it('guarda a tentativa e descarta o estado inicial', () => {
    const scheduling = playUntil(first, 'scheduling');
    let progress = saveSession(createEmptyProgress(), scheduling);
    expect(getMissionSession(progress, first.id)).toEqual(scheduling);

    progress = saveSession(progress, createInitialGameState(first));
    expect(getMissionSession(progress, first.id)).toBeNull();
  });

  it.each(['investigation', 'compression', 'scheduling', 'transmission', 'report'] as const)(
    'restaura uma tentativa salva na fase %s',
    (phase) => {
      const state = playUntil(first, phase);

      expect(state.phase).toBe(phase);
      expect(restoreGameState(first, JSON.parse(JSON.stringify(state)))).toEqual(state);
    },
  );

  it('restaura uma árvore parcial durante a compressão', () => {
    const state = apply(first, playUntil(first, 'scheduling'), { type: 'RESTART_MISSION' });
    const [step] = first.telemetry.referenceMergeHistory;
    let compression = apply(first, state, { type: 'ACKNOWLEDGE_BRIEFING' });
    compression = apply(first, compression, { type: 'FINISH_INVESTIGATION' });
    compression = apply(first, compression, {
      type: 'MERGE_HUFFMAN_NODES',
      firstNodeId: step!.firstExtracted.id,
      secondNodeId: step!.secondExtracted.id,
    });

    expect(restoreGameState(first, JSON.parse(JSON.stringify(compression)))).toEqual(compression);
  });

  it('rejeita estados que os comandos da missão não poderiam produzir', () => {
    const scheduling = playUntil(first, 'scheduling');
    const invalid: readonly unknown[] = [
      null,
      'texto',
      { ...scheduling, schemaVersion: 2 },
      { ...scheduling, missionId: second.id },
      { ...scheduling, phase: 'vitória' },
      { ...scheduling, huffmanMergeChoices: 'nenhuma' },
      { ...scheduling, huffmanMergeChoices: [{ firstNodeId: 'leaf-0' }] },
      { ...scheduling, huffmanMergeChoices: [{ firstNodeId: 'leaf-0', secondNodeId: 'leaf-99' }] },
      // Fase posterior à compressão com árvore incompleta.
      { ...scheduling, huffmanMergeChoices: scheduling.huffmanMergeChoices.slice(0, 2) },
      // Fusões registradas antes de a compressão começar.
      { ...scheduling, phase: 'investigation' },
      { ...scheduling, packetOrder: scheduling.packetOrder.slice(1) },
      { ...scheduling, packetOrder: scheduling.packetOrder.map(() => 'sync') },
      { ...scheduling, packetOrder: [...scheduling.packetOrder.slice(1), 'desconhecido'] },
    ];

    for (const raw of invalid) expect(restoreGameState(first, raw)).toBeNull();
  });
});

describe('missões importadas', () => {
  it('ficam sempre liberadas e fora da progressão oficial', () => {
    const added = addCustomMission(createEmptyProgress(), officialMissions, customDefinition());
    if (!added.ok) throw new Error(added.message);
    const catalog = buildMissionCatalog(officialMissions, added.progress.customMissions);

    expect(added.replaced).toBe(false);
    expect(catalog.at(-1)).toMatchObject({ origin: 'custom', mission: { id: 'custom-relay' } });
    expect(isMissionUnlocked(catalog, added.progress, 'custom-relay')).toBe(true);
    expect(isMissionUnlocked(catalog, added.progress, second.id)).toBe(false);
  });

  it('não aceitam o ID de uma missão oficial nem ultrapassam o limite da coleção', () => {
    const clash = addCustomMission(
      createEmptyProgress(),
      officialMissions,
      customDefinition(first.id),
    );
    expect(clash).toMatchObject({ ok: false });

    let progress = createEmptyProgress();
    for (let index = 0; index < MAX_CUSTOM_MISSIONS; index++) {
      const added = addCustomMission(progress, officialMissions, customDefinition(`m-${index}`));
      if (!added.ok) throw new Error(added.message);
      progress = added.progress;
    }
    expect(addCustomMission(progress, officialMissions, customDefinition('extra'))).toMatchObject({
      ok: false,
    });
    expect(addCustomMission(progress, officialMissions, customDefinition('m-0'))).toMatchObject({
      ok: true,
      replaced: true,
    });
  });

  it('substituir ou remover descarta resultado e tentativa da versão anterior', () => {
    const added = addCustomMission(createEmptyProgress(), officialMissions, customDefinition());
    if (!added.ok) throw new Error(added.message);
    const custom = loadMission(customDefinition());
    let progress = recordMissionCompletion(added.progress, buildMissionReport(custom));
    progress = saveSession(progress, playUntil(custom, 'scheduling'));
    progress = selectMission(progress, custom.id);

    const replaced = addCustomMission(progress, officialMissions, {
      ...customDefinition(),
      bandwidthBitsPerTimeUnit: 2,
    });
    if (!replaced.ok) throw new Error(replaced.message);
    expect(replaced.replaced).toBe(true);
    expect(replaced.progress.customMissions).toHaveLength(1);
    expect(getMissionResult(replaced.progress, custom.id)).toBeNull();
    expect(getMissionSession(replaced.progress, custom.id)).toBeNull();

    const removed = removeCustomMission(progress, custom.id);
    expect(removed.customMissions).toHaveLength(0);
    expect(getMissionResult(removed, custom.id)).toBeNull();
    expect(getMissionSession(removed, custom.id)).toBeNull();
    expect(removed.lastMissionId).toBeNull();
    expect(removeCustomMission(removed, custom.id)).toBe(removed);
  });

  it('são preservadas ao apagar o progresso da campanha', () => {
    const added = addCustomMission(createEmptyProgress(), officialMissions, customDefinition());
    if (!added.ok) throw new Error(added.message);
    let progress = recordMissionCompletion(added.progress, buildMissionReport(first));
    progress = saveSession(progress, playUntil(second, 'scheduling'));
    const reset = resetCampaign(selectMission(progress, second.id));

    expect(reset).toEqual({ ...createEmptyProgress(), customMissions: [customDefinition()] });
  });

  it('aceitam IDs que coincidem com membros de Object.prototype', () => {
    const added = addCustomMission(
      createEmptyProgress(),
      officialMissions,
      customDefinition('constructor'),
    );
    if (!added.ok) throw new Error(added.message);

    expect(getMissionResult(added.progress, 'constructor')).toBeNull();
    expect(getMissionSession(added.progress, 'constructor')).toBeNull();
    expect(getMissionResult(roundTrip(added.progress), 'constructor')).toBeNull();
  });
});

describe('restoreProgress', () => {
  it('preserva o progresso completo após serializar em JSON', () => {
    const added = addCustomMission(createEmptyProgress(), officialMissions, customDefinition());
    if (!added.ok) throw new Error(added.message);
    let progress = recordMissionCompletion(added.progress, buildMissionReport(first));
    progress = saveSession(progress, playUntil(second, 'scheduling'));
    progress = selectMission(progress, second.id);

    expect(roundTrip(progress)).toEqual(progress);
  });

  it.each([null, undefined, 'texto', 7, [], { schemaVersion: 2 }, {}])(
    'recomeça do zero para %j',
    (raw) => {
      expect(restoreProgress(raw, officialMissions)).toEqual(createEmptyProgress());
    },
  );

  it('descarta apenas as partes inconsistentes', () => {
    const valid = recordMissionCompletion(createEmptyProgress(), buildMissionReport(first));
    const restored = restoreProgress(
      {
        ...valid,
        results: {
          ...valid.results,
          [second.id]: {
            completions: 0,
            optimalHuffman: true,
            matchedEdd: true,
            bestMaxLateness: 0,
          },
          [third.id]: {
            completions: 1,
            optimalHuffman: 'sim',
            matchedEdd: true,
            bestMaxLateness: 0,
          },
          desconhecida: {
            completions: 1,
            optimalHuffman: true,
            matchedEdd: true,
            bestMaxLateness: 0,
          },
        },
        sessions: {
          [first.id]: { ...playUntil(first, 'scheduling'), packetOrder: [] },
          [second.id]: playUntil(second, 'compression'),
        },
        customMissions: [
          customDefinition(),
          customDefinition(),
          customDefinition(first.id),
          { ...customDefinition('broken'), packets: [] },
          JSON.parse(serializeMission(customDefinition('from-json'))),
          'não é missão',
        ],
        lastMissionId: third.id,
      },
      officialMissions,
    );

    expect(Object.keys(restored.results)).toEqual([first.id]);
    expect(Object.keys(restored.sessions)).toEqual([second.id]);
    expect(restored.customMissions.map((mission) => mission.id)).toEqual([
      'custom-relay',
      'from-json',
    ]);
    // A terceira missão continua bloqueada: não pode ser a missão atual.
    expect(restored.lastMissionId).toBeNull();
  });

  it('limita a quantidade de missões importadas restauradas', () => {
    const customMissions = Array.from({ length: MAX_CUSTOM_MISSIONS + 3 }, (_, index) =>
      customDefinition(`m-${index}`),
    );
    const restored = restoreProgress(
      { ...createEmptyProgress(), customMissions },
      officialMissions,
    );

    expect(restored.customMissions).toHaveLength(MAX_CUSTOM_MISSIONS);
  });
});
