import type { FrequencyTable, HuffmanCodeTable, HuffmanNode } from '../algorithms/huffman';

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
  readonly compressedBitLength: number;
  readonly originalTransmissionTime: number;
  readonly compressedTransmissionTime: number;
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
    readonly sharedHeaderBitLength: number;
  };
  readonly packets: readonly LoadedMissionPacket[];
}
