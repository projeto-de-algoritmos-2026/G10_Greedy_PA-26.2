import type { HuffmanNode } from '../algorithms/huffman';
import { compareToEarliestDueDate } from '../algorithms/scheduling';
import type { Packet, Schedule, ScheduleComparison } from '../algorithms/scheduling';
import { InvalidMissionError } from './errors';
import { analyzeMissionTransmission } from './transmission';
import type {
  LoadedMission,
  MissionReport,
  ScenarioScheduleReport,
  TransmissionScenario,
} from './types';

export interface BuildMissionReportOptions {
  readonly tree?: HuffmanNode;
  readonly packetOrder?: readonly string[];
  readonly greedyChoiceHistory?: readonly boolean[];
}

function validatePacketOrder(mission: LoadedMission, order: readonly string[]): void {
  if (order.length !== mission.packets.length) {
    throw new InvalidMissionError('A ordem deve conter todos os pacotes exatamente uma vez.');
  }
  const expected = new Set(mission.packets.map((packet) => packet.id));
  const received = new Set(order);
  if (received.size !== order.length || [...received].some((id) => !expected.has(id))) {
    throw new InvalidMissionError('A ordem contém pacotes duplicados ou desconhecidos.');
  }
}

function toSchedulingPackets(
  scenario: TransmissionScenario,
  order: readonly string[],
): readonly Packet[] {
  const byId = new Map(scenario.packets.map((packet) => [packet.id, packet]));
  return Object.freeze(
    order.map((id) => {
      const packet = byId.get(id);
      if (packet === undefined) throw new InvalidMissionError(`Pacote desconhecido: ${id}.`);
      return Object.freeze({
        id: packet.id,
        processingTime: packet.transmissionTime,
        dueDate: packet.deadline,
      });
    }),
  );
}

function deliveredWithinDeadline(schedule: Schedule): number {
  return schedule.packets.filter((packet) => packet.lateness === 0).length;
}

function createScheduleReport(
  scenario: TransmissionScenario,
  order: readonly string[],
): ScenarioScheduleReport {
  const schedules: ScheduleComparison = compareToEarliestDueDate(
    toSchedulingPackets(scenario, order),
    { initialTime: scenario.headerTransmissionTime },
  );
  return Object.freeze({
    transmission: scenario,
    schedules,
    manualDeliveredWithinDeadline: deliveredWithinDeadline(schedules.manual),
    eddDeliveredWithinDeadline: deliveredWithinDeadline(schedules.referenceEdd),
  });
}

function weightedCodeLength(
  mission: LoadedMission,
  codeTable: MissionReport['huffman']['codeTable'],
): number {
  const weightedLength = mission.telemetry.frequencies.reduce((total, frequency) => {
    const code = codeTable[frequency.symbol];
    if (code === undefined) {
      throw new InvalidMissionError(`Símbolo ${frequency.symbol} sem código Huffman.`);
    }
    return total + frequency.weight * code.length;
  }, 0);
  return weightedLength;
}

/** Constrói todas as métricas do relatório somente a partir da missão e das decisões atuais. */
export function buildMissionReport(
  mission: LoadedMission,
  options: BuildMissionReportOptions = {},
): MissionReport {
  const tree = options.tree ?? mission.telemetry.tree;
  const packetOrder = Object.freeze([
    ...(options.packetOrder ?? mission.packets.map((packet) => packet.id)),
  ]);
  validatePacketOrder(mission, packetOrder);

  const transmission = analyzeMissionTransmission(mission, tree);
  const original = createScheduleReport(transmission.original, packetOrder);
  const compressed = createScheduleReport(transmission.compressed, packetOrder);
  const originalBits = original.transmission.totals.totalBitLength;
  const compressedBits = compressed.transmission.totals.totalBitLength;
  const compressionRatio = compressedBits / originalBits;
  const totalSymbols = mission.telemetry.frequencies.reduce(
    (total, frequency) => total + frequency.weight,
    0,
  );
  const selectedWeightedLength = weightedCodeLength(mission, transmission.codeTable);
  const referenceWeightedLength = weightedCodeLength(mission, mission.telemetry.codeTable);
  const greedyChoiceHistory =
    options.greedyChoiceHistory === undefined
      ? null
      : Object.freeze([...options.greedyChoiceHistory]);

  return Object.freeze({
    missionId: mission.id,
    packetCount: mission.packets.length,
    packetOrder,
    huffman: Object.freeze({
      codeTable: transmission.codeTable,
      averageCodeLength: selectedWeightedLength / totalSymbols,
      referenceAverageCodeLength: referenceWeightedLength / totalSymbols,
      isOptimal: selectedWeightedLength === referenceWeightedLength,
      greedyChoiceHistory,
      allChoicesGreedy: greedyChoiceHistory?.every(Boolean) ?? null,
    }),
    original,
    compressed,
    comparison: Object.freeze({
      totalBitDelta: compressedBits - originalBits,
      totalTransmissionTimeDelta:
        compressed.transmission.totalTransmissionTime - original.transmission.totalTransmissionTime,
      manualMaxLatenessDelta:
        compressed.schedules.manual.maxLateness - original.schedules.manual.maxLateness,
      eddMaxLatenessDelta:
        compressed.schedules.referenceEdd.maxLateness - original.schedules.referenceEdd.maxLateness,
      compressionRatio,
      spaceSavingRatio: 1 - compressionRatio,
    }),
  });
}
