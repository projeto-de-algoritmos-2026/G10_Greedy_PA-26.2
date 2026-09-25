import { buildCodeTable, buildHuffmanTree, encode } from '../algorithms/huffman';
import type { LoadedMission, MissionDefinition, TelemetrySymbolDefinition } from './types';
import { InvalidMissionError } from './errors';

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function requireText(value: string, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InvalidMissionError(`${field} deve ser um texto não vazio.`);
  }
}

function requireId(value: string, field: string): void {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
    throw new InvalidMissionError(`${field} deve usar letras minúsculas, números e hífens.`);
  }
}

function validateAlphabet(alphabet: readonly TelemetrySymbolDefinition[]): ReadonlySet<number> {
  if (!Array.isArray(alphabet) || alphabet.length === 0) {
    throw new InvalidMissionError('O alfabeto da telemetria não pode ser vazio.');
  }
  const values = new Set<number>();
  for (const symbol of alphabet) {
    if (!Number.isInteger(symbol.value) || symbol.value < 0 || symbol.value > 255) {
      throw new InvalidMissionError(`Símbolo de telemetria inválido: ${symbol.value}.`);
    }
    requireText(symbol.label, `Rótulo do símbolo ${symbol.value}`);
    if (values.has(symbol.value)) {
      throw new InvalidMissionError(`Símbolo duplicado no alfabeto: ${symbol.value}.`);
    }
    values.add(symbol.value);
  }
  return values;
}

/** Valida e materializa uma missão declarativa, sem qualquer dependência da interface. */
export function loadMission(definition: MissionDefinition): LoadedMission {
  requireId(definition.id, 'ID da missão');
  requireText(definition.title, 'Título');
  requireText(definition.briefing, 'Briefing');
  if (!Array.isArray(definition.objectives) || definition.objectives.length === 0) {
    throw new InvalidMissionError('A missão deve declarar ao menos um objetivo.');
  }
  definition.objectives.forEach((objective, index) =>
    requireText(objective, `Objetivo ${index + 1}`),
  );

  const bandwidth = definition.bandwidthBitsPerTimeUnit;
  if (!Number.isFinite(bandwidth) || bandwidth <= 0) {
    throw new InvalidMissionError(`Largura de banda inválida: ${bandwidth}.`);
  }
  const format = definition.telemetry.originalFormat;
  if (
    format.encoding !== 'unsigned-integer' ||
    !Number.isSafeInteger(format.bitsPerSymbol) ||
    format.bitsPerSymbol <= 0 ||
    format.bitsPerSymbol > 32 ||
    format.sizeUnit !== 'bit'
  ) {
    throw new InvalidMissionError('O formato original dos símbolos é inválido.');
  }

  const alphabetValues = validateAlphabet(definition.telemetry.alphabet);
  if (!Array.isArray(definition.packets) || definition.packets.length === 0) {
    throw new InvalidMissionError('A missão deve possuir ao menos um pacote.');
  }

  const packetIds = new Set<string>();
  const payloads = definition.packets.map((packet) => {
    requireId(packet.id, 'ID do pacote');
    if (packetIds.has(packet.id)) {
      throw new InvalidMissionError(`ID de pacote duplicado: ${packet.id}.`);
    }
    packetIds.add(packet.id);
    if (!Number.isFinite(packet.deadline) || packet.deadline < 0) {
      throw new InvalidMissionError(`Deadline inválido para o pacote ${packet.id}.`);
    }
    if (!Array.isArray(packet.payload) || packet.payload.length === 0) {
      throw new InvalidMissionError(`Payload inválido para o pacote ${packet.id}.`);
    }
    for (const symbol of packet.payload) {
      if (!Number.isInteger(symbol) || !alphabetValues.has(symbol)) {
        throw new InvalidMissionError(
          `O payload do pacote ${packet.id} contém o símbolo inválido ${symbol}.`,
        );
      }
    }
    return Uint8Array.from(packet.payload);
  });

  const corpus = new Uint8Array(payloads.reduce((total, payload) => total + payload.length, 0));
  let offset = 0;
  for (const payload of payloads) {
    corpus.set(payload, offset);
    offset += payload.length;
  }
  const build = buildHuffmanTree(corpus);
  if (build.root === null) throw new InvalidMissionError('A missão não contém telemetria.');
  const codeTable = buildCodeTable(build.root);
  const sharedHeaderBitLength = encode(corpus, build.root).metrics.headerByteLength * 8;

  const packets = definition.packets.map((packet, index) => {
    const payload = payloads[index];
    if (payload === undefined) throw new InvalidMissionError('Pacote sem payload materializado.');
    const compressedBitLength = [...payload].reduce((total, symbol) => {
      const code = codeTable[symbol];
      if (code === undefined)
        throw new InvalidMissionError(`Símbolo ${symbol} sem código Huffman.`);
      return total + code.length;
    }, 0);
    const originalBitLength = payload.length * format.bitsPerSymbol;
    return Object.freeze({
      id: packet.id,
      deadline: packet.deadline,
      payload,
      originalBitLength,
      compressedBitLength,
      originalTransmissionTime: originalBitLength / bandwidth,
      compressedTransmissionTime: compressedBitLength / bandwidth,
    });
  });

  return Object.freeze({
    id: definition.id,
    title: definition.title,
    briefing: definition.briefing,
    objectives: Object.freeze([...definition.objectives]),
    bandwidthBitsPerTimeUnit: bandwidth,
    telemetry: Object.freeze({
      alphabet: Object.freeze(
        definition.telemetry.alphabet.map((symbol) => Object.freeze({ ...symbol })),
      ),
      originalFormat: Object.freeze({ ...format }),
      frequencies: build.frequencies,
      tree: build.root,
      codeTable,
      sharedHeaderBitLength,
    }),
    packets: Object.freeze(packets),
  });
}
