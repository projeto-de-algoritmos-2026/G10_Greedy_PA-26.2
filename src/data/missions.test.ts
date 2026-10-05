// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { scheduleInGivenOrder } from '../algorithms/scheduling';
import type { Packet } from '../algorithms/scheduling';
import {
  buildMissionReport,
  loadMission,
  parseMissionJson,
  serializeMission,
  validateMissionDocument,
} from '../domain';
import type { TransmissionScenario } from '../domain';
import { officialMissions, solarStormMission, tiedOrbitMission, weakSignalMission } from './index';

function* permutations<T>(items: readonly T[]): Generator<readonly T[]> {
  if (items.length <= 1) {
    yield items;
    return;
  }
  for (let index = 0; index < items.length; index++) {
    const rest = [...items.slice(0, index), ...items.slice(index + 1)];
    for (const tail of permutations(rest)) yield [items[index] as T, ...tail];
  }
}

function bruteForceMinimumMaxLateness(scenario: TransmissionScenario): number {
  const packets: readonly Packet[] = scenario.packets.map((packet) => ({
    id: packet.id,
    processingTime: packet.transmissionTime,
    dueDate: packet.deadline,
  }));
  let best = Number.POSITIVE_INFINITY;
  for (const order of permutations(packets)) {
    const { maxLateness } = scheduleInGivenOrder(order, {
      initialTime: scenario.headerTransmissionTime,
    });
    best = Math.min(best, maxLateness);
  }
  return best;
}

describe('coleção de missões oficiais', () => {
  it('possui identificadores únicos', () => {
    const ids = officialMissions.map((mission) => mission.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe('deep-space-alpha');
  });

  it.each(officialMissions)('$id satisfaz o schema e sobrevive a exportar e importar', (source) => {
    const validation = validateMissionDocument(source);
    const reimported = parseMissionJson(serializeMission(source));

    expect(validation).toEqual({ ok: true, definition: source });
    expect(reimported).toEqual({ ok: true, definition: source });
  });

  it.each(officialMissions)(
    '$id: EDD atinge o menor atraso máximo entre todas as permutações',
    (source) => {
      const report = buildMissionReport(loadMission(source));

      for (const scenario of [report.original, report.compressed]) {
        expect(scenario.schedules.referenceEdd.maxLateness).toBeCloseTo(
          bruteForceMinimumMaxLateness(scenario.transmission),
          9,
        );
      }
    },
  );

  it('variam banda, deadlines e distribuição de símbolos entre si', () => {
    const missions = officialMissions.map((source) => loadMission(source));
    const bandwidths = missions.map((mission) => mission.bandwidthBitsPerTimeUnit);
    const distributions = missions.map((mission) =>
      mission.telemetry.frequencies.map(({ weight }) => weight).join(','),
    );
    const deadlines = missions.map((mission) =>
      mission.packets.map((packet) => packet.deadline).join(','),
    );

    expect(new Set(bandwidths).size).toBe(missions.length);
    expect(new Set(distributions).size).toBe(missions.length);
    expect(new Set(deadlines).size).toBe(missions.length);
  });
});

// Cada briefing faz afirmações sobre o cenário; estes testes impedem que deixem de ser verdade.
describe('afirmações dos briefings', () => {
  it('Órbita em equilíbrio: frequências iguais e atraso inevitável mesmo com EDD', () => {
    const mission = loadMission(tiedOrbitMission);
    const report = buildMissionReport(mission);
    const weights = new Set(mission.telemetry.frequencies.map(({ weight }) => weight));
    const codeLengths = new Set(
      Object.values(report.huffman.referenceCodeTable).map((code) => code?.length),
    );

    expect(weights.size).toBe(1);
    expect(codeLengths.size).toBe(1);
    expect(report.compressed.schedules.referenceEdd.maxLateness).toBeGreaterThan(0);
    expect(report.original.schedules.referenceEdd.maxLateness).toBeGreaterThan(0);
  });

  it('Tempestade solar: só a compressão permite cumprir os prazos, com dois deadlines iguais', () => {
    const mission = loadMission(solarStormMission);
    const report = buildMissionReport(mission);
    const deadlines = mission.packets.map((packet) => packet.deadline);
    const [mostFrequent] = [...mission.telemetry.frequencies].sort((a, b) => b.weight - a.weight);

    expect(report.original.schedules.referenceEdd.maxLateness).toBeGreaterThan(0);
    expect(report.compressed.schedules.referenceEdd.maxLateness).toBe(0);
    expect(report.compressed.eddDeliveredWithinDeadline).toBe(mission.packets.length);
    expect(new Set(deadlines).size).toBe(deadlines.length - 1);
    expect(mostFrequent?.weight).toBeGreaterThan(mission.telemetry.tree.weight / 2);
  });

  it('Sinal fraco: o cabeçalho torna a transmissão comprimida maior e mais atrasada', () => {
    const mission = loadMission(weakSignalMission);
    const report = buildMissionReport(mission);

    expect(mission.telemetry.originalFormat.bitsPerSymbol).toBe(3);
    expect(report.huffman.isOptimal).toBe(true);
    expect(report.comparison.totalBitDelta).toBeGreaterThan(0);
    expect(report.comparison.spaceSavingRatio).toBeLessThan(0);
    expect(report.compressed.transmission.totals.payloadBitLength).toBeLessThan(
      report.original.transmission.totals.payloadBitLength,
    );
    expect(report.original.schedules.referenceEdd.maxLateness).toBe(0);
    expect(report.compressed.schedules.referenceEdd.maxLateness).toBeGreaterThan(0);
  });
});
