import type { MissionDefinition } from '../domain';

const repeat = (pattern: readonly number[], times: number): readonly number[] =>
  Array.from({ length: times }, () => pattern).flat();

/** Cenário reproduzível do MVP; métricas e frequências são calculadas ao carregá-lo. */
export const deepSpaceMission = Object.freeze({
  id: 'deep-space-alpha',
  title: 'DeepSpace: sinal de emergência',
  briefing:
    'Uma sonda distante enviou seis blocos de telemetria. Comprima os dados e escolha a ordem de transmissão antes que os prazos expirem.',
  objectives: Object.freeze([
    'Construir uma árvore de Huffman compartilhada por toda a missão.',
    'Reduzir o volume transmitido sem perder nenhum símbolo.',
    'Ordenar os seis pacotes para minimizar o maior atraso.',
  ]),
  bandwidthBitsPerTimeUnit: 16,
  telemetry: Object.freeze({
    alphabet: Object.freeze([
      Object.freeze({ value: 0, label: 'nominal' }),
      Object.freeze({ value: 1, label: 'temperatura-alta' }),
      Object.freeze({ value: 2, label: 'radiacao' }),
      Object.freeze({ value: 3, label: 'pressao-baixa' }),
      Object.freeze({ value: 4, label: 'falha-eletrica' }),
      Object.freeze({ value: 5, label: 'pulso-de-sincronismo' }),
    ]),
    originalFormat: Object.freeze({
      encoding: 'unsigned-integer' as const,
      bitsPerSymbol: 8,
      sizeUnit: 'bit' as const,
    }),
  }),
  packets: Object.freeze([
    Object.freeze({ id: 'thermal', deadline: 22, payload: repeat([0, 0, 0, 1], 16) }),
    Object.freeze({ id: 'radiation', deadline: 12, payload: repeat([0, 0, 2, 2], 14) }),
    Object.freeze({ id: 'pressure', deadline: 30, payload: repeat([0, 3, 0, 3, 3], 12) }),
    Object.freeze({ id: 'power', deadline: 18, payload: repeat([0, 0, 0, 4], 18) }),
    Object.freeze({ id: 'navigation', deadline: 40, payload: repeat([0, 1, 2, 3, 4, 5], 10) }),
    Object.freeze({ id: 'sync', deadline: 8, payload: repeat([5, 0, 5, 0, 0], 10) }),
  ]),
}) satisfies MissionDefinition;
