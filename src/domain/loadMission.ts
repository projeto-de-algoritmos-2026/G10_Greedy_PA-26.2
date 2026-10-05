import { buildCodeTable, buildHuffmanTree, encode } from '../algorithms/huffman';
import { InvalidMissionError } from './errors';
import { validateMissionDocument } from './missionSchema';
import type { LoadedMission, MissionDefinition } from './types';

/**
 * Valida e materializa uma missão declarativa, sem qualquer dependência da interface.
 * A entrada passa pelo mesmo schema usado na importação: nenhuma missão chega ao jogo sem ele.
 */
export function loadMission(source: MissionDefinition): LoadedMission {
  const validation = validateMissionDocument(source);
  if (!validation.ok) {
    const [first] = validation.issues;
    throw new InvalidMissionError(
      first === undefined ? 'Missão inválida.' : `${first.path}: ${first.message}`,
      validation.issues,
    );
  }
  const { definition } = validation;
  const format = definition.telemetry.originalFormat;
  const payloads = definition.packets.map((packet) => Uint8Array.from(packet.payload));

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
    const originalBitLength = payload.length * format.bitsPerSymbol;
    return Object.freeze({
      id: packet.id,
      deadline: packet.deadline,
      payload,
      originalBitLength,
    });
  });

  return Object.freeze({
    id: definition.id,
    title: definition.title,
    briefing: definition.briefing,
    objectives: definition.objectives,
    bandwidthBitsPerTimeUnit: definition.bandwidthBitsPerTimeUnit,
    telemetry: Object.freeze({
      alphabet: definition.telemetry.alphabet,
      originalFormat: format,
      frequencies: build.frequencies,
      tree: build.root,
      codeTable,
      referenceMergeHistory: build.history,
      sharedHeaderBitLength,
    }),
    packets: Object.freeze(packets),
  });
}
