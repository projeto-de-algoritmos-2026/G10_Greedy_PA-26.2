import type {
  FrequencyTable,
  HuffmanCodeTable,
  HuffmanMergeStep,
  HuffmanNode,
} from '../algorithms/huffman';
import type { ScheduleComparison } from '../algorithms/scheduling';

export interface TelemetrySymbolDefinition {
  readonly value: number;
  readonly label: string;
}

export interface OriginalSymbolFormat {
  readonly encoding: 'unsigned-integer';
  readonly bitsPerSymbol: number;
  readonly sizeUnit: 'bit';
}

export interface MissionPacketDefinition {
  readonly id: string;
  readonly deadline: number;
  readonly payload: readonly number[];
}

export interface MissionDefinition {
  readonly id: string;
  readonly title: string;
  readonly briefing: string;
  readonly objectives: readonly string[];
  readonly bandwidthBitsPerTimeUnit: number;
  readonly telemetry: {
    readonly alphabet: readonly TelemetrySymbolDefinition[];
    readonly originalFormat: OriginalSymbolFormat;
  };
  readonly packets: readonly MissionPacketDefinition[];
}

export interface LoadedMissionPacket {
  readonly id: string;
  readonly deadline: number;
  readonly payload: Uint8Array;
  readonly originalBitLength: number;
}

export interface LoadedMission {
  readonly id: string;
  readonly title: string;
  readonly briefing: string;
  readonly objectives: readonly string[];
  readonly bandwidthBitsPerTimeUnit: number;
  readonly telemetry: {
    readonly alphabet: readonly TelemetrySymbolDefinition[];
    readonly originalFormat: OriginalSymbolFormat;
    readonly frequencies: FrequencyTable;
    readonly tree: HuffmanNode;
    readonly codeTable: HuffmanCodeTable;
    readonly referenceMergeHistory: readonly HuffmanMergeStep[];
    readonly sharedHeaderBitLength: number;
  };
  readonly packets: readonly LoadedMissionPacket[];
}

export interface BitBreakdown {
  readonly headerBitLength: number;
  readonly payloadBitLength: number;
  readonly paddingBitLength: number;
  readonly totalBitLength: number;
}

export interface TransmissionPacket {
  readonly id: string;
  readonly deadline: number;
  readonly bits: BitBreakdown;
  readonly transmissionTime: number;
}

export interface TransmissionScenario {
  readonly kind: 'original' | 'compressed';
  readonly headerTransmissionTime: number;
  readonly packets: readonly TransmissionPacket[];
  readonly totals: BitBreakdown;
  readonly totalTransmissionTime: number;
}

export interface MissionTransmissionAnalysis {
  readonly codeTable: HuffmanCodeTable;
  readonly original: TransmissionScenario;
  readonly compressed: TransmissionScenario;
}

export interface ScenarioScheduleReport {
  readonly transmission: TransmissionScenario;
  readonly schedules: ScheduleComparison;
  readonly manualDeliveredWithinDeadline: number;
  readonly eddDeliveredWithinDeadline: number;
}

export interface MissionReport {
  readonly missionId: string;
  readonly packetCount: number;
  readonly packetOrder: readonly string[];
  readonly huffman: {
    readonly codeTable: HuffmanCodeTable;
    readonly referenceCodeTable: HuffmanCodeTable;
    readonly averageCodeLength: number;
    readonly referenceAverageCodeLength: number;
    readonly payloadBitLength: number;
    readonly referencePayloadBitLength: number;
    readonly totalBitLength: number;
    readonly referenceTotalBitLength: number;
    readonly isOptimal: boolean;
    /** `null` quando o relatório não recebeu o histórico de decisões do jogador. */
    readonly greedyChoiceHistory: readonly boolean[] | null;
    readonly allChoicesGreedy: boolean | null;
  };
  readonly original: ScenarioScheduleReport;
  readonly compressed: ScenarioScheduleReport;
  readonly comparison: {
    readonly totalBitDelta: number;
    readonly totalTransmissionTimeDelta: number;
    readonly manualMaxLatenessDelta: number;
    readonly eddMaxLatenessDelta: number;
    readonly compressionRatio: number;
    readonly spaceSavingRatio: number;
  };
}
