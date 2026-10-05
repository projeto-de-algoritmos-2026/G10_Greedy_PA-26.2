import type { MissionDefinition } from '../domain';
import { repeat } from './payload';

const ALL_SENSORS = [0, 1, 2, 3, 4, 5, 6, 7] as const;

/** Distribuição uniforme e canal lento: empates em toda fusão e atraso inevitável. */
export const tiedOrbitMission = Object.freeze({
  schemaVersion: 1,
  id: 'tied-orbit',
  title: 'Órbita em equilíbrio',
  briefing:
    'Oito sensores de um satélite de retransmissão reportam com a mesma frequência, e o canal é lento. Toda fusão inicial é um empate, e nem a melhor ordem entrega todos os pacotes no prazo.',
  objectives: Object.freeze([
    'Construir uma árvore de Huffman em que todas as escolhas iniciais empatam.',
    'Verificar que árvores diferentes de mesmo custo são igualmente ótimas.',
    'Ordenar os cinco pacotes para minimizar o maior atraso, mesmo sem zerá-lo.',
  ]),
  bandwidthBitsPerTimeUnit: 8,
  telemetry: Object.freeze({
    alphabet: Object.freeze([
      Object.freeze({ value: 0, label: 'giroscopio' }),
      Object.freeze({ value: 1, label: 'painel-solar' }),
      Object.freeze({ value: 2, label: 'bateria' }),
      Object.freeze({ value: 3, label: 'antena' }),
      Object.freeze({ value: 4, label: 'propulsor' }),
      Object.freeze({ value: 5, label: 'termostato' }),
      Object.freeze({ value: 6, label: 'magnetometro' }),
      Object.freeze({ value: 7, label: 'rastreador-estelar' }),
    ]),
    originalFormat: Object.freeze({
      encoding: 'unsigned-integer' as const,
      bitsPerSymbol: 8,
      sizeUnit: 'bit' as const,
    }),
  }),
  packets: Object.freeze([
    Object.freeze({ id: 'attitude', deadline: 90, payload: repeat(ALL_SENSORS, 4) }),
    Object.freeze({ id: 'energy', deadline: 76, payload: repeat(ALL_SENSORS, 2) }),
    Object.freeze({ id: 'relay', deadline: 120, payload: repeat(ALL_SENSORS, 6) }),
    Object.freeze({ id: 'thermal-map', deadline: 84, payload: repeat(ALL_SENSORS, 3) }),
    Object.freeze({ id: 'star-fix', deadline: 110, payload: repeat(ALL_SENSORS, 5) }),
  ]),
}) satisfies MissionDefinition;
