import type { MissionDefinition } from '../domain';
import { repeat } from './payload';

/** Distribuição muito enviesada e canal rápido: a compressão decide se os prazos são cumpridos. */
export const solarStormMission = Object.freeze({
  schemaVersion: 1,
  id: 'solar-storm',
  title: 'Tempestade solar',
  briefing:
    'Uma ejeção de massa coronal se aproxima. Quase toda a telemetria é ruído de fundo, e os eventos raros são os que importam. Sem compressão, nem a melhor ordem cumpre os prazos; dois pacotes ainda disputam o mesmo deadline.',
  objectives: Object.freeze([
    'Construir uma árvore de Huffman para uma distribuição muito enviesada.',
    'Comparar os prazos cumpridos com e sem compressão.',
    'Ordenar os cinco pacotes, incluindo dois com o mesmo prazo.',
  ]),
  bandwidthBitsPerTimeUnit: 64,
  telemetry: Object.freeze({
    alphabet: Object.freeze([
      Object.freeze({ value: 0, label: 'ruido-de-fundo' }),
      Object.freeze({ value: 1, label: 'protons' }),
      Object.freeze({ value: 2, label: 'eletrons' }),
      Object.freeze({ value: 3, label: 'raios-x' }),
      Object.freeze({ value: 4, label: 'campo-magnetico' }),
      Object.freeze({ value: 5, label: 'alerta-de-blindagem' }),
      Object.freeze({ value: 6, label: 'falha-de-sensor' }),
    ]),
    originalFormat: Object.freeze({
      encoding: 'unsigned-integer' as const,
      bitsPerSymbol: 8,
      sizeUnit: 'bit' as const,
    }),
  }),
  packets: Object.freeze([
    Object.freeze({
      id: 'background',
      deadline: 22,
      payload: repeat([0, 0, 0, 0, 0, 0, 0, 1], 20),
    }),
    Object.freeze({
      id: 'proton-flux',
      deadline: 14,
      payload: repeat([0, 0, 0, 1, 0, 0, 1, 2], 12),
    }),
    Object.freeze({
      id: 'x-ray-burst',
      deadline: 18,
      payload: repeat([0, 0, 3, 0, 0, 2, 0, 3], 10),
    }),
    Object.freeze({
      id: 'magnetosphere',
      deadline: 18,
      payload: repeat([0, 0, 0, 4, 0, 0, 1, 4], 8),
    }),
    Object.freeze({
      id: 'shield-status',
      deadline: 10,
      payload: repeat([0, 5, 0, 0, 6, 0, 5, 0], 6),
    }),
  ]),
}) satisfies MissionDefinition;
