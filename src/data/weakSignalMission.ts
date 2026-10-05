import type { MissionDefinition } from '../domain';
import { repeat } from './payload';

/** Formato original compacto e pouca telemetria: o cabeçalho custa mais do que Huffman economiza. */
export const weakSignalMission = Object.freeze({
  schemaVersion: 1,
  id: 'weak-signal',
  title: 'Sinal fraco',
  briefing:
    'Um módulo de pouso envia poucos símbolos, já empacotados em 3 bits cada. A árvore de Huffman continua ótima entre os códigos de prefixo, mas transmiti-la custa mais do que a compressão economiza, e a entrega atrasa.',
  objectives: Object.freeze([
    'Construir a árvore de Huffman e medir o custo do cabeçalho.',
    'Comparar o total efetivo comprimido com o formato original compacto.',
    'Ordenar os quatro pacotes para minimizar o maior atraso nos dois cenários.',
  ]),
  bandwidthBitsPerTimeUnit: 4,
  telemetry: Object.freeze({
    alphabet: Object.freeze([
      Object.freeze({ value: 0, label: 'solo-firme' }),
      Object.freeze({ value: 1, label: 'poeira' }),
      Object.freeze({ value: 2, label: 'inclinacao' }),
      Object.freeze({ value: 3, label: 'vibracao' }),
      Object.freeze({ value: 4, label: 'contato-perdido' }),
    ]),
    originalFormat: Object.freeze({
      encoding: 'unsigned-integer' as const,
      bitsPerSymbol: 3,
      sizeUnit: 'bit' as const,
    }),
  }),
  packets: Object.freeze([
    Object.freeze({ id: 'touchdown', deadline: 110, payload: repeat([0, 0, 1, 0, 2, 0], 4) }),
    Object.freeze({ id: 'dust-cloud', deadline: 125, payload: repeat([1, 1, 0, 1, 3], 4) }),
    Object.freeze({ id: 'tilt-check', deadline: 140, payload: repeat([0, 2, 0, 2, 0, 0], 3) }),
    Object.freeze({ id: 'link-loss', deadline: 100, payload: repeat([4, 0, 0, 3], 3) }),
  ]),
}) satisfies MissionDefinition;
