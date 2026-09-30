import { buildCodeTable, encode, packCodes } from '../algorithms/huffman';
import type { HuffmanNode } from '../algorithms/huffman';
import type {
  BitBreakdown,
  LoadedMission,
  MissionTransmissionAnalysis,
  TransmissionPacket,
  TransmissionScenario,
} from './types';

function freezeBits(
  headerBitLength: number,
  payloadBitLength: number,
  paddingBitLength: number,
): BitBreakdown {
  return Object.freeze({
    headerBitLength,
    payloadBitLength,
    paddingBitLength,
    totalBitLength: headerBitLength + payloadBitLength + paddingBitLength,
  });
}

function concatenatePayloads(mission: LoadedMission): Uint8Array {
  const byteLength = mission.packets.reduce((total, packet) => total + packet.payload.length, 0);
  const corpus = new Uint8Array(byteLength);
  let offset = 0;
  for (const packet of mission.packets) {
    corpus.set(packet.payload, offset);
    offset += packet.payload.length;
  }
  return corpus;
}

function createScenario(
  kind: TransmissionScenario['kind'],
  packets: readonly TransmissionPacket[],
  headerBitLength: number,
  bandwidth: number,
): TransmissionScenario {
  const payloadBitLength = packets.reduce(
    (total, packet) => total + packet.bits.payloadBitLength,
    0,
  );
  const paddingBitLength = packets.reduce(
    (total, packet) => total + packet.bits.paddingBitLength,
    0,
  );
  const totals = freezeBits(headerBitLength, payloadBitLength, paddingBitLength);
  return Object.freeze({
    kind,
    headerTransmissionTime: headerBitLength / bandwidth,
    packets: Object.freeze(packets),
    totals,
    totalTransmissionTime: totals.totalBitLength / bandwidth,
  });
}

/**
 * Aplica uma única tabela Huffman a todos os pacotes e deriva tamanhos e tempos reais.
 * O cabeçalho serializado é pago uma vez; cada pacote paga apenas seu payload e padding.
 */
export function analyzeMissionTransmission(
  mission: LoadedMission,
  tree: HuffmanNode = mission.telemetry.tree,
): MissionTransmissionAnalysis {
  const bandwidth = mission.bandwidthBitsPerTimeUnit;
  const codeTable = buildCodeTable(tree);
  const corpus = concatenatePayloads(mission);
  const sharedHeaderBitLength = encode(corpus, tree).metrics.headerByteLength * 8;

  const originalPackets = mission.packets.map((packet) => {
    const bits = freezeBits(0, packet.originalBitLength, 0);
    return Object.freeze({
      id: packet.id,
      deadline: packet.deadline,
      bits,
      transmissionTime: bits.totalBitLength / bandwidth,
    }) satisfies TransmissionPacket;
  });

  const compressedPackets = mission.packets.map((packet) => {
    const packed = packCodes(packet.payload, codeTable);
    const bits = freezeBits(0, packed.bitLength, packed.paddingBits);
    return Object.freeze({
      id: packet.id,
      deadline: packet.deadline,
      bits,
      transmissionTime: bits.totalBitLength / bandwidth,
    }) satisfies TransmissionPacket;
  });

  return Object.freeze({
    codeTable,
    original: createScenario('original', originalPackets, 0, bandwidth),
    compressed: createScenario('compressed', compressedPackets, sharedHeaderBitLength, bandwidth),
  });
}
