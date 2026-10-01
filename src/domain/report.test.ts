// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { deepSpaceMission } from '../data';
import { InvalidMissionError, buildMissionReport, loadMission } from './index';

describe('buildMissionReport', () => {
  it('compara cenários completos sem alterar a regra EDD', () => {
    const mission = loadMission(deepSpaceMission);
    const report = buildMissionReport(mission, {
      packetOrder: [...mission.packets].reverse().map((packet) => packet.id),
    });

    const originalEdd = report.original.schedules.referenceEdd.packets.map((packet) => packet.id);
    const compressedEdd = report.compressed.schedules.referenceEdd.packets.map(
      (packet) => packet.id,
    );
    expect(compressedEdd).toEqual(originalEdd);
    expect(report.compressed.schedules.referenceEdd.initialTime).toBe(
      report.compressed.transmission.headerTransmissionTime,
    );
    expect(report.compressed.schedules.referenceEdd.packets[0]?.startTime).toBe(
      report.compressed.transmission.headerTransmissionTime,
    );
    expect(report.compressed.schedules.referenceEdd.totalCompletionTime).not.toBe(
      report.original.schedules.referenceEdd.totalCompletionTime,
    );
    expect(report.compressed.schedules.referenceEdd.maxLateness).not.toBe(
      report.original.schedules.referenceEdd.maxLateness,
    );
  });

  it('deriva razões e deltas apenas dos totais calculados', () => {
    const mission = loadMission(deepSpaceMission);
    const report = buildMissionReport(mission);
    const originalBits = report.original.transmission.totals.totalBitLength;
    const compressedBits = report.compressed.transmission.totals.totalBitLength;

    expect(report.comparison.totalBitDelta).toBe(compressedBits - originalBits);
    expect(report.comparison.compressionRatio).toBe(compressedBits / originalBits);
    expect(report.comparison.spaceSavingRatio).toBe(1 - compressedBits / originalBits);
    expect(report.packetCount).toBe(mission.packets.length);
    expect(report.huffman.averageCodeLength).toBeGreaterThan(0);
    expect(report.huffman.payloadBitLength).toBe(
      report.compressed.transmission.totals.payloadBitLength,
    );
    expect(report.huffman.totalBitLength).toBe(
      report.compressed.transmission.totals.totalBitLength,
    );
    expect(report.huffman.referencePayloadBitLength).toBeGreaterThan(0);
    expect(report.huffman.referenceTotalBitLength).toBeGreaterThan(0);
    expect(report.huffman.isOptimal).toBe(true);
    expect(report.huffman.greedyChoiceHistory).toBeNull();
  });

  it('distingue sair da regra de obter um custo final pior', () => {
    const mission = loadMission(deepSpaceMission);
    const report = buildMissionReport(mission, {
      tree: mission.telemetry.tree,
      greedyChoiceHistory: [false, true, true, true, true],
    });

    expect(report.huffman.allChoicesGreedy).toBe(false);
    expect(report.huffman.isOptimal).toBe(true);
    expect(report.huffman.averageCodeLength).toBe(report.huffman.referenceAverageCodeLength);
    expect(report.huffman.payloadBitLength).toBe(report.huffman.referencePayloadBitLength);
  });

  it('é determinístico e não modifica a ordem fornecida', () => {
    const mission = loadMission(deepSpaceMission);
    const order = mission.packets.map((packet) => packet.id).reverse();
    const copy = [...order];

    const first = buildMissionReport(mission, { packetOrder: order });
    const second = buildMissionReport(mission, { packetOrder: order });

    expect(first).toEqual(second);
    expect(order).toEqual(copy);
  });

  it('rejeita ordens incompletas, duplicadas ou desconhecidas', () => {
    const mission = loadMission(deepSpaceMission);
    const ids = mission.packets.map((packet) => packet.id);

    expect(() => buildMissionReport(mission, { packetOrder: ids.slice(1) })).toThrowError(
      InvalidMissionError,
    );
    expect(() =>
      buildMissionReport(mission, { packetOrder: ids.map(() => ids[0] ?? '') }),
    ).toThrowError(InvalidMissionError);
    expect(() =>
      buildMissionReport(mission, { packetOrder: [...ids.slice(1), 'unknown'] }),
    ).toThrowError(InvalidMissionError);
  });
});
