// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { decode, encode } from '../algorithms/huffman';
import { scheduleEarliestDueDate, scheduleInGivenOrder } from '../algorithms/scheduling';
import type { Packet } from '../algorithms/scheduling';
import { deepSpaceMission, officialMissions } from '../data';
import { analyzeMissionTransmission, buildMissionReport, loadMission } from './index';

const EXPECTED_FREQUENCIES = Object.freeze({
  0: 194,
  1: 26,
  2: 38,
  3: 46,
  4: 28,
  5: 30,
});

const EXPECTED_CODE_LENGTHS = Object.freeze({
  0: 1,
  1: 4,
  2: 3,
  3: 3,
  4: 4,
  5: 3,
});

const EXPECTED_EDD_ORDER = Object.freeze([
  'sync',
  'radiation',
  'power',
  'thermal',
  'pressure',
  'navigation',
]);

function concatenatePayloads(payloads: readonly Uint8Array[]): Uint8Array {
  const totalLength = payloads.reduce((total, payload) => total + payload.length, 0);
  const corpus = new Uint8Array(totalLength);
  let offset = 0;
  for (const payload of payloads) {
    corpus.set(payload, offset);
    offset += payload.length;
  }
  return corpus;
}

function permutations<T>(items: readonly T[]): readonly (readonly T[])[] {
  if (items.length === 0) return [[]];
  return items.flatMap((item, index) => {
    const remaining = [...items.slice(0, index), ...items.slice(index + 1)];
    return permutations(remaining).map((tail) => [item, ...tail]);
  });
}

describe('validação integrada do MVP', () => {
  it.each(officialMissions)(
    '$id preserva o corpus e todos os pacotes no round-trip com a árvore compartilhada',
    (source) => {
      const mission = loadMission(source);
      const payloads = mission.packets.map((packet) => packet.payload);
      const corpus = concatenatePayloads(payloads);

      expect(decode(encode(corpus, mission.telemetry.tree))).toEqual(corpus);
      for (const packet of mission.packets) {
        expect(decode(encode(packet.payload, mission.telemetry.tree))).toEqual(packet.payload);
      }
    },
  );

  it('confere o relatório de deep-space-alpha contra um oráculo independente', () => {
    const mission = loadMission(deepSpaceMission);
    const report = buildMissionReport(mission);
    const frequencies = Object.fromEntries(
      mission.telemetry.frequencies.map(({ symbol, weight }) => [symbol, weight]),
    );
    const codeLengths = Object.fromEntries(
      Object.entries(report.huffman.codeTable).map(([symbol, code]) => [symbol, code?.length]),
    );

    expect(frequencies).toEqual(EXPECTED_FREQUENCIES);
    expect(codeLengths).toEqual(EXPECTED_CODE_LENGTHS);
    expect(mission.packets.reduce((total, packet) => total + packet.payload.length, 0)).toBe(362);
    expect(report.original.transmission.totals).toEqual({
      headerBitLength: 0,
      payloadBitLength: 2_896,
      paddingBitLength: 0,
      totalBitLength: 2_896,
    });
    expect(report.compressed.transmission.totals).toEqual({
      headerBitLength: 432,
      payloadBitLength: 752,
      paddingBitLength: 16,
      totalBitLength: 1_200,
    });
    expect(report.original.transmission.totalTransmissionTime).toBe(181);
    expect(report.compressed.transmission.headerTransmissionTime).toBe(27);
    expect(report.compressed.transmission.totalTransmissionTime).toBe(75);
    expect(report.comparison.totalBitDelta).toBe(-1_696);
    expect(report.comparison.compressionRatio).toBeCloseTo(1_200 / 2_896);
    expect(report.comparison.spaceSavingRatio).toBeCloseTo(1_696 / 2_896);
    expect(report.huffman.averageCodeLength).toBeCloseTo(752 / 362);
    expect(report.compressed.schedules.manual.maxLateness).toBe(67);
    expect(report.compressed.schedules.referenceEdd.maxLateness).toBe(35);
    expect(report.compressed.schedules.referenceEdd.packets.map(({ id }) => id)).toEqual(
      EXPECTED_EDD_ORDER,
    );
  });

  it('confirma EDD contra as 720 ordens do cenário comprimido deep-space-alpha', () => {
    const mission = loadMission(deepSpaceMission);
    const compressed = analyzeMissionTransmission(mission).compressed;
    const packets: readonly Packet[] = compressed.packets.map((packet) => ({
      id: packet.id,
      processingTime: packet.transmissionTime,
      dueDate: packet.deadline,
    }));
    const orders = permutations(packets);
    const distinctOrders = new Set(orders.map((order) => order.map(({ id }) => id).join(',')));
    const options = { initialTime: compressed.headerTransmissionTime };
    const edd = scheduleEarliestDueDate(packets, options);
    const maxLatenesses = orders.map((order) => scheduleInGivenOrder(order, options).maxLateness);

    expect(orders).toHaveLength(720);
    expect(distinctOrders.size).toBe(720);
    expect(edd.packets.map(({ id }) => id)).toEqual(EXPECTED_EDD_ORDER);
    expect(edd.maxLateness).toBe(35);
    expect(Math.min(...maxLatenesses)).toBe(edd.maxLateness);
    expect(maxLatenesses.every((lateness) => lateness >= edd.maxLateness)).toBe(true);
  });
});
